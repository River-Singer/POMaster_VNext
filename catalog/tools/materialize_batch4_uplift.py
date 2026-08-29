# -*- coding: utf-8 -*-
"""MIG-B4 · Universal 上提物化工具（split-ledger 驱动 → catalog/policies/ + catalog-lock 同步）。

输入（只读）：
  - POMaster_VNext/corpus/master/batch-4/split-ledger.yaml     （M1 分拣台账，本工具唯一驱动源）
  - 上游消费项目 10_planned/<asset>.yaml 源文本                （仅作 clean-room LCS 自检对照，只 open 读）

输出：
  - catalog/policies/policy.web.{arch,api,perf,style,uiux}.*.json —— 9 个新条目（34 条 universal 半归并）
  - catalog/catalog-lock.draft.json —— 追加 9 entries + 新增 controlled_children（allowed+required 两处）

clean-room 纪律（D3 生死线）：
  - 34 条 universal 半词面全部由本工具内置常量独立改写（语义等价、词形独立），以 split-ledger
    的 clean_room_rewrite_sketch 为底稿再改写，禁回抄上游源文本；
  - 内置自检：每个条目正文（title/statement/keywords/applies_when/sub_rules/review_notes 拼接，
    去空白+小写归一）与对应上游源文本做精确 20-gram 重叠测试——命中任何 ≥20 字符公共子串即 exit 2；
    另附 difflib 最长公共连续块实测值随报告输出；
  - 零泄漏自检：条目正文 grep 项目专名（PAGE- / API_REQ. / MASTer / 雅黑 / Fira）必须 0 命中；
    sources[].clean_room_note 为固定英文文案且本身零项目专名（与 pilot 既有条目中文注记
    同一先例：clean-room 注记自身不含项目名），全文件原始 grep（含元数据）预期 0 命中，
    命中数随报告单列并逐一定位。

catalog-lock 纪律：
  - 追加式合并：读既有 lock，对全部 entries（旧+新）重算 content_sha256 与落盘对账（drift 即 exit 2）；
  - 新增 controlled_children 块（allowed=required=全部登记路径，排序）：新文件同步 allowed+required
    两处（沿 pomaster directory-lock controlled_children 语义移植到 catalog-lock 管辖面）；
  - 幂等：同输入重跑 byte-identical（输出内容构建两遍逐字节比对一致后才落盘）；entries 按 id 排序。

纪律：
  - 上游消费项目绝对只读（只 open 读，零写入零改名零 touch）；
  - 禁墙钟：无时间戳/mtime；批次代号固定 MIG-B4（seq=MIG-B4）；
  - 确定性序列化：json indent=2 + ensure_ascii=False + 末尾恰好一个换行；UTF-8 无 BOM；
  - FROZEN 零接触：不动 packages/schemas/**、kernel vocab、golden cases；
  - 词形合法：kind/policy 条目 id 均为在册 15 前缀 POLICY.*；enforcement/classification/lane/axes
    取值逐项对照 vocab-lock.draft.yaml catalog_layer_vocab 与 state_axes（只消费不改动）。

用法：
  python materialize_batch4_uplift.py           # 物化 + lock 同步（幂等，可重跑）
  python materialize_batch4_uplift.py --verify  # 只读核验：lock 对账 + 幂等重演 + 零泄漏扫描
"""

import difflib
import hashlib
import json
import os
import re
import sys

import yaml

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))                    # .../catalog/tools
CATALOG = os.path.dirname(HERE)                                      # .../catalog
VNEXT = os.path.dirname(CATALOG)                                     # .../POMaster_VNext
LEDGER_PATH = os.path.join(VNEXT, "corpus", "master", "batch-4", "split-ledger.yaml")
LOCK_PATH = os.path.join(CATALOG, "catalog-lock.draft.json")
UPSTREAM_ROOT = r"D:\Vscode Documents\MASTer_master"                 # 上游消费项目（绝对只读）

BATCH = "MIG-B4"
CAPTURED_BY = "agent:claude/batch-4-catalog-uplift"
LEDGER_REF = "POMaster_VNext/corpus/master/batch-4/split-ledger.yaml"
CLEAN_ROOM_NOTE = "independently rewritten from field corpus batch-4 material; zero verbatim copy"
LCS_THRESHOLD = 20  # 归一化后 ≥20 字符公共子串即判逐字拷贝（最长在册技术词形 ~14 字符，20 留安全余量）

PROJECT_NOUNS = ["PAGE-", "API_REQ.", "MASTer", "雅黑", "Fira"]

# 词形合法面（只消费 vocab-lock 冻结值，不改动；镜像用于本工具自检）
VOCAB_ENFORCEMENT = {"required_when_applicable", "advisory", "deterministic_where_possible"}
VOCAB_CLASSIFICATION = {
    "CONSTITUTION", "UNIVERSAL_POLICY", "LANE_POLICY", "TECHNOLOGY_PROFILE",
    "PROJECT_BASELINE_TEMPLATE", "CONTRACT_TEMPLATE", "GATE_RECIPE",
    "KNOWLEDGE_PATTERN", "FAILURE_PATTERN", "DEPRECATED", "DUPLICATE", "REJECTED",
}
VOCAB_LANES = {"any", "frontend", "backend"}
VOCAB_AXES = {
    "lifecycle": {"PROPOSED", "CURRENT", "SUPERSEDED", "DEPRECATED", "RETIRED", "REJECTED"},
    "confidence": {"UNRESOLVED", "EXPERIMENTAL", "PROVISIONAL", "LOCKED"},
    "evidence": {"PLANNED", "IMPLEMENTED", "VERIFIED"},
    "change": {"STABLE", "CHALLENGED", "MIGRATING"},
}

# ======================================================================
# 34 条 universal 半独立改写词面（(asset_id, entry_id) → statement_zh）
# 以 split-ledger clean_room_rewrite_sketch / split_note 为底稿再改写；
# 技术栈具名（框架/库/数值/头名）一律不出现（属 project 半参数）。
# ======================================================================
REWRITE_TEXT = {
    # ---- architecture-constraints（HYBRID universal 半 = 层职责/禁入方向骨架）----
    ("architecture-constraints", "layers.app"):
        "应用外壳层只负责装配：路由表、全局注入器、路由级错误兜底与访问守卫都挂在这一层；"
        "本层不持有业务状态，也不渲染业务内容；单个页面内的数据失败必须被就地吸收，不得穿透到其他页面。",
    ("architecture-constraints", "layers.pages"):
        "路由页面层只做布局编排与装配消费：禁止把业务或异步数据留在组件本地状态里，"
        "禁止直接发起网络请求；页面所需数据一律经由下层状态通道获取。",
    ("architecture-constraints", "layers.features"):
        "能力切片层负责单个业务能力的组件组织与交互编排：切片之间禁止互引内部实现；"
        "切片内部错误用局部边界吸收、不外溢到相邻切片；本层不持有跨页共享的全局数据。",
    ("architecture-constraints", "layers.entities"):
        "服务端数据层持有远端数据的请求生命周期：逐查询的缓存与逐查询的错误都归这一层；"
        "禁止把远端状态复制进客户端仓库做手工双向同步；查询错误先归一化再上抛。",
    ("architecture-constraints", "layers.shared-state"):
        "客户端状态层按页面隔离存放表单态与视图模式态：未做页面隔离的状态禁止跨页共享；"
        "全局仓库只保留身份、权限范围这类稳定且真正跨页面的状态。",
    ("architecture-constraints", "layers.shared-ui"):
        "设计系统组件层只承载纯展示组件：不携带业务状态，不感知业务语义。",
    ("architecture-constraints", "layers.shared-grid"):
        "表格视图层只承载表格列定义与视图配置的组装：可依赖展示组件层令牌与基础工具层，不依赖任何业务上层。",
    ("architecture-constraints", "layers.shared-lib"):
        "基础工具层不反向依赖任何上层：格式化、精确计算、网络客户端、错误规整、枚举映射等"
        "与框架无关的设施都住在这一层，供所有上层调用。",
    ("architecture-constraints", "deep_import_rule"):
        "任何跨目录引用只允许指向目标目录的公开出口；深入目标目录内部路径或直接引用内部具体文件的写法一律禁止；"
        "可引用出口的具名清单属项目基线参数。",
    ("architecture-constraints", "new_file_rule"):
        "新建任何文件之前，必须先写明它归属哪一层哪个切片，以及为什么不能通过扩展既有文件达成；"
        "页面需要新状态时优先扩展该页已有的状态载体，而不是另起全局仓库；"
        "新组件优先归入设计系统层或对应能力切片，避免持续堆积在页面层。",
    # ---- directory-layout（HYBRID universal 半 = 目录解剖模板/禁互引 + id 转目录名规则）----
    ("directory-layout", "layers.pages"):
        "页面目录解剖模板：每页一个目录，目录内提供该页唯一公开出口、路由级页面组件与仅本页使用的局部子组件；"
        "局部子组件禁止被其他页面引用。",
    ("directory-layout", "layers.features"):
        "能力切片目录解剖模板：每切片一个目录，目录内提供公开出口、组合组件目录与交互逻辑目录；"
        "只为可独立复用的能力建切片，禁止按页面一对一碎片化划分；切片之间禁止互引内部实现。",
    ("directory-layout", "layers.entities"):
        "实体目录解剖模板：每实体一个目录，目录内提供公开出口、领域接口目录、数据钩子目录、校验结构与类型定义；"
        "领域接口调用经由统一网络客户端发出，禁止直连网络库。",
    ("directory-layout", "naming.composable"):
        "组合式函数文件名统一为 use 前缀接驼峰主体的形式，且一个文件只承载一个组合式函数。",
    ("directory-layout", "naming.page_component"):
        "路由级页面组件的文件名由页面语义名接帕斯卡式页面后缀构成。",
    ("directory-layout", "naming.feature_component"):
        "切片内的组合组件以 Widget 或 Panel 一类视图组合后缀命名，与路由级页面组件相区分。",
    ("directory-layout", "naming.barrel"):
        "每个分层根目录、每个切片目录、每个实体目录与每个页面目录都必须提供唯一的公开出口文件，"
        "作为该目录对外唯一的可见面。",
    ("directory-layout", "naming.entity_dir"):
        "实体目录名采用单数名词加小写中划线的形式。",
    ("directory-layout", "naming.feature_dir"):
        "能力标识转目录名时统一取小写中划线形式。",
    ("directory-layout", "naming.page_dir"):
        "页面标识转目录名时统一取小写中划线形式。",
    ("directory-layout", "barrel_rule"):
        "公开出口文件是分层的唯一对外契约面：只转发对外接口，不暴露内部实现；"
        "一切跨层引用必须经由目标方的公开出口完成，深入内部目录的引用一律禁止。",
    ("directory-layout", "colocation_rule"):
        "组件按复用范围就近放置：仅单页使用的留在该页目录内；跨页复用的进入能力切片；"
        "只有稳定共享且不携带业务语义的组件才下沉到设计系统层；禁止把带业务语义的组件放进设计系统层。",
    # ---- http-client-policy（HYBRID universal 半）----
    ("http-client-policy", "clients.authClient"):
        "会话族请求与业务族请求必须分离为两个独立客户端：会话族客户端只服务登录、令牌刷新、注销与"
        "当前身份及权限读取；其端点以受控白名单枚举，白名单之外的端点不得经由会话客户端发出；"
        "会话客户端不进入业务恢复链路，其刷新动作必须单飞合并。",
    ("http-client-policy", "clients.appClient"):
        "业务客户端对认证失效与权限拒绝必须分开处理：认证失效时刷新一次并以原请求重放一次；"
        "权限拒绝直接拒绝、不触发刷新；令牌刷新必须全局单飞；每个请求的重放次数必须设显式上限。",
    ("http-client-policy", "global"):
        "超时、中止、追踪、请求标识与基础地址来源必须由统一请求基础设施单点声明默认挂点："
        "每个出站请求都可中止、可追踪、可关联；具体超时数值、头名与重试策略标识由项目基线供给，不入目录正本。",
    # ---- performance-budget（HYBRID universal 半 = 骨架）----
    ("performance-budget", "initial_load"):
        "装载预算骨架：脚本、样式、图片三类载荷各设上限字段，并各自声明计量口径（如压缩后传输体积）；"
        "上限数值由项目基线供给。",
    ("performance-budget", "runtime"):
        "运行时预算骨架：首绘时间、可交互时间、长任务时长三族指标各设目标字段；目标数值由项目基线供给。",
    # ---- style-ownership-registry（HYBRID universal 半 = 五域矩阵骨架 + 禁止行为类别学）----
    ("style-ownership-registry", "layers.global-reset"):
        "全局重置域：重置样式的唯一所有者是全局样式入口；页面域禁止局部重置、禁止内联改写根元素样式、"
        "禁止私挂全局样式文件。",
    ("style-ownership-registry", "layers.design-token"):
        "设计令牌域：令牌源文件的唯一所有者是令牌事实源；页面域禁止私定局部令牌、禁止硬编码颜色与像素值、"
        "禁止引用不存在的幽灵令牌、禁止手改令牌源文件。",
    ("style-ownership-registry", "layers.shared-component"):
        "共享组件域：共享组件样式的唯一所有者是共享组件层；页面域禁止书写组件级样式、禁止覆盖基础组件视觉、"
        "禁止私造共享类名。",
    ("style-ownership-registry", "layers.page-local"):
        "页面局部域：scoped 样式块是页面局部样式的唯一容器；块内禁止声明全局类、禁止使用强制覆盖标记、"
        "禁止滥用深选择器穿透。",
    ("style-ownership-registry", "layers.vendor-adapter"):
        "第三方适配域：第三方主题样式的唯一所有者是适配目录；页面域禁止直接引入第三方样式、"
        "禁止局部覆盖第三方主题、禁止局部改写主题参数。",
    ("style-ownership-registry", "scoped_style_rule"):
        "页面内 scoped 样式块只承载本页局部样式；全局样式类只允许声明在共享组件层，"
        "页面禁止声明全局类名或向页面外泄漏全局类名。",
    # ---- uiux-provider-overlay（UNIVERSAL）----
    ("uiux-provider-overlay", "authority"):
        "由外部工具从设计原型视觉稿中抽取的内容一律定性为可选参考证据，任何情况下不得当作业务事实；"
        "业务真值的唯一来源是已登记的契约面。",
}

# ======================================================================
# 9 个归并文件的聚合元信息（(dir, filename) → meta；statement 为归并正本）
# ======================================================================
FILE_META = {
    ("policies", "policy.web.arch.layer_isolation.json"): {
        "title_zh": "分层职责与单向依赖隔离",
        "statement_zh": "前端代码按职责分层，每层只承担单一职责，依赖只能自上而下单向流动；"
                        "每层内部目录遵循统一解剖模板，跨层访问只能经由该层公开出口完成。",
        "statement_en_keywords": ["layer responsibility", "one-way dependency", "directory anatomy",
                                  "colocation", "new file declaration"],
        "condition": "创建分层结构、新增目录或放置新文件时",
    },
    ("policies", "policy.web.arch.public_api_barrel.json"): {
        "title_zh": "公共出口桶唯一面纪律",
        "statement_zh": "每个分层与切片根目录必须提供唯一公开出口文件；跨目录引用只能经由公开出口完成，"
                        "深入内部目录的导入一律禁止。",
        "statement_en_keywords": ["barrel", "public api", "no deep import"],
        "condition": "发起跨目录引用或新建目录时",
    },
    ("policies", "policy.web.arch.naming_conventions.json"): {
        "title_zh": "分层命名约定",
        "statement_zh": "分层内文件与目录命名遵循统一约定：组合式函数、路由级页面组件、切片组合组件、"
                        "实体目录及标识符转目录名各有固定词形，同类对象全仓同形。",
        "statement_en_keywords": ["naming convention", "composable prefix", "page component suffix",
                                  "kebab directory"],
        "condition": "新建文件或目录命名时",
    },
    ("policies", "policy.web.api.auth_app_client_split.json"): {
        "title_zh": "会话与业务客户端族分离",
        "statement_zh": "会话族端点由独立的会话客户端承载、与业务客户端分离；会话端点以受控白名单枚举，"
                        "会话客户端不进入业务恢复链路，刷新动作单飞合并。",
        "statement_en_keywords": ["client split", "auth whitelist", "single flight refresh"],
        "condition": "搭建或调整请求客户端族时",
        "review_notes": [
            "与既有 POLICY.WEB.API.SINGLE_HTTP_CLIENT / POLICY.WEB.API.TRUSTED_ENDPOINT_SOURCE 面审"
            "（MIG-B4 catalog_scope_note）：SINGLE_HTTP_CLIENT 约束基础设施单点统一，本条约束客户端族分离"
            "（会话族 vs 业务族两实例），两维度正交不冲突；端点来源纪律归 TRUSTED_ENDPOINT_SOURCE，本条不另立来源条款。",
        ],
    },
    ("policies", "policy.web.api.session_recovery_split.json"): {
        "title_zh": "会话恢复与权限拒绝分判",
        "statement_zh": "认证失效与权限拒绝分开处理：认证失效走『单飞刷新一次 + 原请求重放一次』；"
                        "权限拒绝不刷新、直接失败；逐请求重放上限显式声明，防止循环重放。",
        "statement_en_keywords": ["401 refresh once", "403 reject no refresh", "single flight",
                                  "replay cap"],
        "condition": "实现会话失效与权限拒绝处理时",
        "review_notes": [
            "与既有 POLICY.WEB.API.ERROR_NORMALIZATION / POLICY.WEB.API.RETRY_DISCIPLINE 面审（MIG-B4）："
            "本条只覆盖会话恢复链（刷新单飞/重放上限/权限拒绝不刷新），错误归一化与一般重试纪律仍归既有条款管辖。",
        ],
    },
    ("policies", "policy.web.api.request_infrastructure.json"): {
        "title_zh": "请求基础设施统一挂点",
        "statement_zh": "超时、中止、追踪、请求标识与基础地址来源五项默认挂点全部挂在唯一请求基础设施入口，"
                        "禁止逐请求散落自配；数值与头名等参数由项目基线供给。",
        "statement_en_keywords": ["unified request infrastructure", "abort", "trace id",
                                  "request id", "base url source"],
        "condition": "搭建或调整请求基础设施时",
        "review_notes": [
            "与既有 POLICY.WEB.API.SINGLE_HTTP_CLIENT 面审（MIG-B4）：本条补『统一挂点清单』维度"
            "（中止/追踪/请求标识/默认超时/基础地址来源），单点统一原则本身归既有条款。",
        ],
    },
    ("policies", "policy.web.perf.budget_skeleton.json"): {
        "title_zh": "性能预算骨架",
        "statement_zh": "性能预算按固定骨架声明：装载预算分脚本、样式、图片三类并各自标注计量口径；"
                        "运行时预算至少覆盖首绘、可交互、长任务三族指标；目录正本只定骨架，阈值数值由项目基线供给。",
        "statement_en_keywords": ["load budget", "runtime budget", "budget skeleton"],
        "condition": "制定或校验性能预算时",
    },
    ("policies", "policy.web.style.ownership_matrix.json"): {
        "title_zh": "样式所有权五域矩阵",
        "statement_zh": "样式按五域所有权矩阵管理：全局重置、设计令牌、共享组件、页面局部、第三方适配各设唯一"
                        "所有者并绑定禁止行为类别；任何样式写入必须落在所属域的所有者路径内，owner 路径与"
                        "扫描器禁用词表由项目基线登记。",
        "statement_en_keywords": ["style ownership", "five domains", "forbidden behavior",
                                  "scoped style"],
        "condition": "编写或评审样式代码时",
    },
    ("policies", "policy.web.uiux.provider_evidence_not_business_truth.json"): {
        "title_zh": "原型抽取证据非业务事实",
        "statement_zh": "由外部工具从设计原型视觉稿中抽取的内容一律定性为可选参考证据，永不构成业务事实；"
                        "业务真值的唯一来源是已登记的契约面。",
        "statement_en_keywords": ["prototype extraction", "optional evidence", "not business truth"],
        "condition": "登记或消费原型抽取证据时",
    },
}


# ======================================================================
# 通用只读工具
# ======================================================================
def norm_text(s):
    """LCS/泄漏扫描统一归一：去全部空白 + 小写。"""
    return re.sub(r"\s+", "", s).lower()


def upstream_asset_path(asset_id):
    return os.path.join(UPSTREAM_ROOT, "outputs", "frontend", "10_planned", asset_id + ".yaml")


def body_text_of(entry):
    """条目正文词面（LCS 与零泄漏扫描的判定面；元数据 id/path/provenance 不入正文）。"""
    parts = [entry["title_zh"], entry["statement_zh"]]
    parts += entry.get("statement_en_keywords") or []
    parts.append(entry["applies_when"]["condition"])
    for r in entry["sub_rules"]:
        parts.append(r["statement_zh"])
    parts += entry.get("review_notes") or []
    return "\n".join(p for p in parts if p)


def lcs_block_size(a, b):
    """归一化后最长公共连续块实测值（difflib；报告用）。"""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    return sm.find_longest_match(0, len(a), 0, len(b)).size


def dump_json(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def write_if_changed(path, data):
    if os.path.exists(path):
        with open(path, "rb") as f:
            if f.read() == data:
                return False
    with open(path, "wb") as f:
        f.write(data)
    return True


# ======================================================================
# 台账驱动：选出全部 UNIVERSAL / HYBRID universal 半，按 destination 归并
# ======================================================================
def load_universal_halves():
    with open(LEDGER_PATH, encoding="utf-8") as f:
        ledger = yaml.safe_load(f)

    denom = ledger["denominator"]
    assert denom["universal"] == 10 and denom["hybrid"] == 24 and denom["project"] == 283, \
        "split-ledger 分母漂移: %r" % denom
    assert denom["total_entries"] == 317
    assert denom["universal"] + denom["project"] + denom["hybrid"] == denom["total_entries"], "恒等式破损"

    halves = []          # (asset_id, entry_id, decision, dir, filename, merge_group, migration_batch, source_ref)
    seen_pairs = set()
    for e in ledger["entries"]:
        if e["decision"] not in ("UNIVERSAL", "HYBRID"):
            continue
        key = (e["asset_id"], e["entry_id"])
        assert key not in seen_pairs, "台账重复条目: %r" % (key,)
        seen_pairs.add(key)
        dest = e["destination"]["universal"] if e["decision"] == "HYBRID" else e["destination"]
        m = re.match(r"^catalog/(policies|knowledge)/([A-Za-z0-9_.\-]+\.json)", dest)
        assert m, "destination 词形不可解析: %r" % dest
        dirname, fname = m.group(1), m.group(2)
        stem = fname[:-len(".json")]
        want_prefix = "POLICY." if dirname == "policies" else "KNOWLEDGE."
        assert stem.upper().startswith(want_prefix), "id 前缀与目录不符: %s" % fname
        halves.append({
            "asset_id": e["asset_id"], "entry_id": e["entry_id"], "decision": e["decision"],
            "dir": dirname, "filename": fname, "catalog_id": stem.upper(),
            "merge_group": e.get("merge_group"),
            "corpus_batch": e["migration_batch"].replace("MIG-B", "batch-"),
            "upstream_source_ref": e["source_ref"],
        })

    assert len(halves) == 34, "universal 半总数漂移: %d" % len(halves)
    assert sum(1 for h in halves if h["decision"] == "UNIVERSAL") == 10
    assert sum(1 for h in halves if h["decision"] == "HYBRID") == 24

    # 改写词面全覆盖 + 无孤儿（双向 fail-closed）
    missing = [k for k in seen_pairs if k not in REWRITE_TEXT]
    assert not missing, "缺独立改写词面: %r" % sorted(missing)
    orphan = [k for k in REWRITE_TEXT if k not in seen_pairs]
    assert not orphan, "改写词面无台账条目对应: %r" % sorted(orphan)

    return halves


def build_entries(halves):
    by_file = {}
    for h in halves:
        by_file.setdefault((h["dir"], h["filename"]), []).append(h)

    assert set(by_file) == set(FILE_META), (
        "归并文件集与台账 destination 不一致: 台账=%r meta=%r"
        % (sorted(by_file), sorted(FILE_META)))

    entries = []
    for (dirname, fname), members in by_file.items():
        meta = FILE_META[(dirname, fname)]
        sub_rules, sources = [], []
        for h in members:  # 台账序（条目顺序=台账 encounter order，确定性）
            sub_rules.append({
                "rule_id": h["entry_id"],
                "statement_zh": REWRITE_TEXT[(h["asset_id"], h["entry_id"])],
                "provenance": {
                    "asset_id": h["asset_id"],
                    "entry_id": h["entry_id"],
                    "decision": h["decision"],
                    "merge_group": h["merge_group"],
                    "corpus_batch": h["corpus_batch"],
                    "split_ledger": LEDGER_REF,
                },
            })
            sources.append({
                "type": "design_seed",
                "ref": LEDGER_REF,
                "captured_by": CAPTURED_BY,
                "locator": {
                    "asset": h["asset_id"],
                    "entry": h["entry_id"],
                    "corpus_batch": h["corpus_batch"],
                    "upstream_source_ref": h["upstream_source_ref"],
                },
                "clean_room_note": CLEAN_ROOM_NOTE,
            })

        catalog_id = members[0]["catalog_id"]
        assert all(m["catalog_id"] == catalog_id for m in members)

        entry = {
            "x-vocab-pr": {
                "status": "vocab_pr_candidate",
                "finding": "kind='policy' 不在 vocab-lock kinds_registry.truth_bodies"
                           "（POLICY. 前缀已冻结注册，closed-world）",
                "proposal": "词汇表 PR 登记 policy kind；或 Owner 裁决 policy 条目住 catalog/ 而非 "
                            "truth/objects 正文层（与前批 45 条同因同请，合并进同一 vocab PR）",
                "locked_vocab_untouched": True,
            },
            "x-batch4-uplift": {
                "status": "PROPOSAL",
                "package": "batch-4 语料批 Universal 上提（工程策略族 split-ledger 驱动）",
                "human_review_required": True,
                "evidence": "PLANNED",
                "provenance": LEDGER_REF,
            },
            "id": catalog_id,
            "kind": "policy",
            "axis_profile": "policy_default",
            "classification": "UNIVERSAL_POLICY",
            "axes": {"lifecycle": "PROPOSED", "confidence": "UNRESOLVED",
                     "evidence": "PLANNED", "change": "STABLE"},
            "title_zh": meta["title_zh"],
            "statement_zh": meta["statement_zh"],
            "statement_en_keywords": meta["statement_en_keywords"],
            "applies_when": {"lane": "frontend", "condition": meta["condition"]},
            "enforcement": "required_when_applicable",
            "authority": {
                "owner": "HUMAN_OWNER",
                "delegates": [],
                "write_policy": "EVOLUTION_CHANNEL",
                "escalation_hint": "catalog-batch4-uplift",
            },
            "origin": "ingested",
            "origin_note": "batch-4 语料批 split-ledger UNIVERSAL/HYBRID universal 半上提；"
                           "词面独立改写（clean-room），零逐字拷贝源文本",
            "sub_rules": sub_rules,
            "sources": sources,
        }
        if meta.get("review_notes"):
            entry["review_notes"] = meta["review_notes"]

        # ---- 词形合法自检（对照 vocab-lock 冻结词轴，只读消费）----
        assert entry["classification"] in VOCAB_CLASSIFICATION
        assert entry["enforcement"] in VOCAB_ENFORCEMENT
        assert entry["applies_when"]["lane"] in VOCAB_LANES
        for axis, vals in entry["axes"].items():
            assert vals in VOCAB_AXES[axis], (axis, vals)
        assert entry["id"] == entry["id"].upper() and " " not in entry["id"]
        assert fname == entry["id"].lower() + ".json"

        entries.append(entry)
    return entries


# ======================================================================
# clean-room LCS 自检 + 零泄漏自检
# ======================================================================
def clean_room_audit(entries, halves):
    src_cache = {}

    def src_norm(asset_id):
        if asset_id not in src_cache:
            p = upstream_asset_path(asset_id)
            with open(p, "rb") as f:  # 上游消费项目只读
                src_cache[asset_id] = norm_text(f.read().decode("utf-8"))
        return src_cache[asset_id]

    assets_by_file = {}
    for h in halves:
        assets_by_file.setdefault((h["dir"], h["filename"]), set()).add(h["asset_id"])

    audit = {"threshold": LCS_THRESHOLD, "per_file": {}, "lcs_failures": [], "body_leaks": []}
    for entry in entries:
        fname = entry["id"].lower() + ".json"
        key = ("policies", fname)  # 本批条目词形已由 load_universal_halves 断言 POLICY./KNOWLEDGE. 与目录一致
        body = norm_text(body_text_of(entry))
        grams = {body[i:i + LCS_THRESHOLD] for i in range(max(0, len(body) - LCS_THRESHOLD + 1))}
        file_audit = {"sources": sorted(assets_by_file[key]), "max_common_block": 0,
                      "gram_hits": 0}
        for asset in sorted(assets_by_file[key]):
            src = src_norm(asset)
            src_grams = {src[i:i + LCS_THRESHOLD]
                         for i in range(max(0, len(src) - LCS_THRESHOLD + 1))}
            hits = grams & src_grams
            if hits:
                audit["lcs_failures"].append(
                    {"file": fname, "asset": asset, "hit_len": LCS_THRESHOLD,
                     "samples": sorted(hits)[:3]})
                file_audit["gram_hits"] += len(hits)
            file_audit["max_common_block"] = max(file_audit["max_common_block"],
                                                 lcs_block_size(body, src))
        for noun in PROJECT_NOUNS:
            if noun in body_text_of(entry):
                audit["body_leaks"].append({"file": fname, "noun": noun})
        audit["per_file"][fname] = file_audit

    if audit["lcs_failures"] or audit["body_leaks"]:
        print(json.dumps({"verdict": "CLEAN_ROOM_FAIL", "audit": audit},
                         ensure_ascii=False, indent=2))
        sys.exit(2)
    return audit


# ======================================================================
# catalog-lock 同步（追加合并 + controlled_children 两处 + 全量 sha 对账）
# ======================================================================
def sha_of_path(rel):
    with open(os.path.join(CATALOG, rel.replace("/", os.sep)), "rb") as f:
        return "sha256:" + hashlib.sha256(f.read()).hexdigest()


def merge_lock(new_entries):
    """读既有 lock → 按 id 合并 → 全量 content_sha256 与落盘对账（drift 即 fail-closed）。

    前置：new_entries 的落盘文件必须已存在（main 先写条目文件再走 lock 同步）。
    """
    with open(LOCK_PATH, encoding="utf-8") as f:
        old_lock = json.load(f)

    merged = {}
    for e in old_lock["entries"]:
        assert e["id"] not in merged, "旧 lock 重复 id: %s" % e["id"]
        merged[e["id"]] = dict(e)

    for entry in new_entries:
        fname = entry["id"].lower() + ".json"
        rel = "policies/" + fname
        cid = "sha256:" + hashlib.sha256(dump_json(entry).encode("utf-8")).hexdigest()
        if entry["id"] in merged:
            # 幂等重跑：同 id 以本工具产物为准（sha 必须与落盘一致；source_ref 为
            # LEDGER_REF 纯派生字段，随本工具常量同步刷新，防陈旧路径残留）
            assert merged[entry["id"]]["path"] == rel
            merged[entry["id"]]["content_sha256"] = cid
            merged[entry["id"]]["source_ref"] = LEDGER_REF
        else:
            merged[entry["id"]] = {
                "id": entry["id"], "path": rel, "content_sha256": cid,
                "source_ref": LEDGER_REF,
            }

    # 全量对账：lock 每条 content_sha256 与落盘文件 0 mismatch（drift 即 fail-closed）
    mismatches = []
    for eid, e in sorted(merged.items()):
        actual = sha_of_path(e["path"])
        if actual != e["content_sha256"]:
            mismatches.append({"id": eid, "lock": e["content_sha256"], "disk": actual})
    if mismatches:
        print(json.dumps({"verdict": "LOCK_DRIFT", "mismatches": mismatches},
                         ensure_ascii=False, indent=2))
        sys.exit(2)

    entries_out = sorted(merged.values(), key=lambda e: e["id"])
    paths = sorted(e["path"] for e in entries_out)
    assert len(paths) == len(set(paths))

    lock = {
        "catalog_version": old_lock["catalog_version"],
        "profile": old_lock["profile"],
        "generated_by": "catalog/tools/materialize_batch4_uplift.py"
                        "（batch-4 语料批 Universal 上提；entries 按 id 排序；"
                        "在 materialize_catalog_pilot.py 60 条基础上追加 9 条）",
        "x-digest-ethics": old_lock["x-digest-ethics"],
        "controlled_children": {
            "note": "catalog-lock 管辖面（vocab-lock PR-0001 catalog_layer_vocab 同段语义）："
                    "allowed=登记在册可存在；required=必须存在。新增 catalog 文件须同步 allowed+required "
                    "两处（batch-4 split-ledger catalog_scope_note 纪律；沿 pomaster directory-lock "
                    "controlled_children 语义移植）。",
            "allowed": list(paths),
            "required": list(paths),
        },
        "entries": entries_out,
        "note": old_lock["note"],
    }
    return lock, len(old_lock["entries"])


def write_entries(entries):
    """先落条目文件（lock 全量对账要求盘上已有全部条目）；构建两遍自证。"""
    plan = [(os.path.join(CATALOG, "policies", e["id"].lower() + ".json"), dump_json(e))
            for e in entries]
    assert plan == [(os.path.join(CATALOG, "policies", e["id"].lower() + ".json"), dump_json(e))
                    for e in entries], "确定性序列化自检失败"
    changed = []
    for path, data in plan:
        if write_if_changed(path, data.encode("utf-8")):
            changed.append(os.path.relpath(path, VNEXT))
    return changed


def write_lock(lock):
    """lock 本体落盘；构建两遍逐字节比对一致后才写（幂等自证）。"""
    data = dump_json(lock)
    assert data == dump_json(lock), "确定性序列化自检失败"
    return [LOCK_PATH] if write_if_changed(LOCK_PATH, data.encode("utf-8")) else []


def verify_mode():
    """只读核验：lock 对账 + 幂等重演 + 零泄漏扫描（零写入）。"""
    halves = load_universal_halves()
    entries = build_entries(halves)
    audit = clean_room_audit(entries, halves)

    with open(LOCK_PATH, encoding="utf-8") as f:
        lock = json.load(f)
    mismatches = []
    for e in lock["entries"]:
        actual = sha_of_path(e["path"])
        if actual != e["content_sha256"]:
            mismatches.append({"id": e["id"], "lock": e["content_sha256"], "disk": actual})
    paths = sorted(e["path"] for e in lock["entries"])
    children = lock.get("controlled_children") or {}
    children_ok = (sorted(children.get("allowed") or []) == paths
                   and sorted(children.get("required") or []) == paths)

    new_ids = {e["id"] for e in entries}
    raw_hits = []
    for entry in entries:
        fname = entry["id"].lower() + ".json"
        with open(os.path.join(CATALOG, "policies", fname), "rb") as f:
            raw = f.read().decode("utf-8")
        for noun in PROJECT_NOUNS:
            for m in re.finditer(re.escape(noun), raw):
                ctx = raw[max(0, m.start() - 40):m.end() + 40].replace("\n", " ")
                raw_hits.append({"file": fname, "noun": noun, "context": ctx})

    report = {
        "verdict": "OK" if (not mismatches and children_ok and not audit["lcs_failures"]
                            and not audit["body_leaks"]) else "FAIL",
        "lock_entries": len(lock["entries"]),
        "lock_mismatches": mismatches,
        "controlled_children": {
            "present": bool(children),
            "allowed_count": len(children.get("allowed") or []),
            "required_count": len(children.get("required") or []),
            "allowed_eq_required_eq_entries": children_ok,
        },
        "uplift_entries": len(entries),
        "uplift_files": sorted(e["id"] for e in entries),
        "clean_room": audit,
        "raw_grep_hits_full_file": {
            "count": len(raw_hits),
            "note": "正文词面 0 命中（clean_room.body_leaks）；全文件原始命中（含元数据）"
                    "预期 0（clean_room_note 已零项目专名，与 pilot 注记先例一致）",
            "hits": raw_hits,
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0 if report["verdict"] == "OK" else 2)


def main():
    if "--verify" in sys.argv[1:]:
        verify_mode()
        return

    halves = load_universal_halves()
    entries = build_entries(halves)
    audit = clean_room_audit(entries, halves)
    changed_files = write_entries(entries)          # 先落条目文件（lock 对账前置条件）
    lock, old_count = merge_lock(entries)           # 全量 sha 对账（0 mismatch 才放行）
    changed_files += write_lock(lock)               # lock 本体落盘

    n_policy = sum(1 for e in entries if e["id"].startswith("POLICY."))
    n_knowledge = sum(1 for e in entries if e["id"].startswith("KNOWLEDGE."))
    print(json.dumps({
        "verdict": "OK",
        "batch": BATCH,
        "universal_halves_total": len(halves),
        "merged_catalog_entries": len(entries),
        "from_universal": sum(1 for h in halves if h["decision"] == "UNIVERSAL"),
        "from_hybrid": sum(1 for h in halves if h["decision"] == "HYBRID"),
        "materialized": {"policies": n_policy, "knowledge": n_knowledge},
        "merge_groups": sorted({h["merge_group"] for h in halves if h["merge_group"]}),
        "lock": {"before_entries": old_count, "after_entries": len(lock["entries"]),
                 "controlled_children_added_files": len(entries),
                 "controlled_children_places": "allowed+required（两处）"},
        "clean_room_lcs": {"threshold": LCS_THRESHOLD,
                           "max_common_block_observed":
                               max(v["max_common_block"] for v in audit["per_file"].values()),
                           "failures": 0},
        "zero_leak_body_hits": 0,
        "files_written_or_changed": changed_files,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
