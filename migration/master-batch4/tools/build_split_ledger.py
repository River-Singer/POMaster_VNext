#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M1 分拣台账（BATCH-4 · Universal/Project 逐条分拣）
===================================================

输入（只读）：
  - migration/master-batch4/inventory.yaml               （M0 盘点，10 资产分母同源）
  - migration/master-batch4/key-binding-map.batch4.draft.yaml （M0 增量草表，id 列表同源）

输出：
  - migration/master-batch4/split-ledger.yaml            （逐条目三选一：UNIVERSAL/PROJECT/HYBRID）

分拣裁决原则（任务口径）：
  『换一个 Vue+FastAPI 项目这条还成立吗？』成立→UNIVERSAL；成立但参数不同→HYBRID；不成立→PROJECT。
  保守偏差：拿不准→PROJECT（catalog 防范围膨胀）。

clean-room 纪律（D3）：
  UNIVERSAL 条目携带 clean_room_rewrite_sketch（独立改写：语义等价、词形独立）+ clean_room_note；
  sketch 词面零项目专名（PAGE-/API_REQ./MASTer/页面名/中文业务词均不出现在 sketch 中）。

条目计数规则（分母一等公民）：
  信封字段（blueprint_sha256 / document_type / schema_version / updated_at /
  architecture_name / architecture_version / purpose）不入分母；
  其余顶层决策字段与主列表条目逐条入分母。

纪律：
  - MASTer_master 零接触（本脚本不读消费仓，id 列表全部取自 batch4 草表）；
  - 禁墙钟：无时间戳/mtime；批次代号固定 MIG-B4；
  - 确定性序列化：YAML sort_keys=True + allow_unicode=True + 末尾恰好一个换行；UTF-8 无 BOM；
  - 幂等自证：输出内容构建两遍逐字节比对一致后才落盘。

catalog 归并组（防 scope creep）：
  universal 半优先与既有 catalog 面审重（如 POLICY.WEB.API.SINGLE_HTTP_CLIENT /
  TRUSTED_ENDPOINT_SOURCE / ERROR_NORMALIZATION），确属缺口才立候选；候选归并组见 merge_group。
"""

import os
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
BATCH4 = os.path.dirname(HERE)
VNEXT = os.path.dirname(os.path.dirname(BATCH4))

KBM_PATH = os.path.join(BATCH4, "key-binding-map.batch4.draft.yaml")
OUT_PATH = os.path.join(BATCH4, "split-ledger.yaml")

SRC = "outputs/frontend/10_planned/"

# ---------------------------------------------------------------- 载入 id 同源
with open(KBM_PATH, "r", encoding="utf-8") as f:
    KBM = yaml.safe_load(f)

DEPS = [b["registry_id"] for b in KBM["dependency_bindings"]]                    # 27
BOUNDARIES = [(b["boundary_id"], b["page_id"]) for b in KBM["boundary_page_bindings"]]  # 39
PATTERNS = [b["pattern_id"] for b in KBM["pattern_impl_bindings"]]               # 12
FIXTURES = [b["fixture_id"] for b in KBM["fixture_scenario_bindings"]]           # 101
PERF_TEMPLATES = [b["page_type"] for b in KBM["performance_template_bindings"]]  # 11
TOKEN_KEYS = [b["registry_key"] for b in KBM["token_usage_bindings"]]            # 5
OVERLAY_PAGES = [b["page_id"] for b in KBM["uiux_overlay_page_bindings"]]        # 15

# 分母前置断言：与 inventory.yaml denominators 同源（漂移即 fail）
assert len(DEPS) == 27, len(DEPS)
assert len(BOUNDARIES) == 39, len(BOUNDARIES)
assert len(PATTERNS) == 12, len(PATTERNS)
assert len(FIXTURES) == 101, len(FIXTURES)
assert len(PERF_TEMPLATES) == 11, len(PERF_TEMPLATES)
assert len(TOKEN_KEYS) == 5, len(TOKEN_KEYS)
assert len(OVERLAY_PAGES) == 15, len(OVERLAY_PAGES)
PERF_PAGES = sorted({p for _, p in BOUNDARIES})
assert len(PERF_PAGES) == 39, len(PERF_PAGES)

# ---------------------------------------------------------------- 文案常量
CLEAN_ROOM_NOTE = (
    "独立改写：语义等价、词形独立，零逐字拷贝源文本；sketch 词面零项目专名"
    "（无页面 id 词形/接口需求 id 词形/项目品牌词/具体页面名/中文业务词），catalog 条目 gate grep 面安全"
)

DEST_CAND = {
    "layer_isolation": "catalog/policies/policy.web.arch.layer_isolation.json（候选，MG-ARCH-LAYER 归并）",
    "public_api_barrel": "catalog/policies/policy.web.arch.public_api_barrel.json（候选，MG-ARCH-BARREL 归并）",
    "naming": "catalog/policies/policy.web.arch.naming_conventions.json（候选，MG-ARCH-NAMING 归并）",
    "auth_split": "catalog/policies/policy.web.api.auth_app_client_split.json（候选；与既有 POLICY.WEB.API.SINGLE_HTTP_CLIENT/TRUSTED_ENDPOINT_SOURCE 审重）",
    "session_recovery": "catalog/policies/policy.web.api.session_recovery_split.json（候选；401/403 分开 + 单飞刷新 + 重放上限）",
    "request_infra": "catalog/policies/policy.web.api.request_infrastructure.json（候选）",
    "perf_skeleton": "catalog/policies/policy.web.perf.budget_skeleton.json（候选，MG-PERF-SKELETON 归并）",
    "style_matrix": "catalog/policies/policy.web.style.ownership_matrix.json（候选，MG-STYLE-MATRIX 归并）",
    "evidence_not_truth": "catalog/policies/policy.web.uiux.provider_evidence_not_business_truth.json（候选）",
}


def p_dest(kind, slug):
    """项目侧 truth 对象落位（MIG-B4 项目侧转录，本批仅登记）。"""
    return "truth/objects/%s/%s.json（MIG-B4 项目侧转录落位）" % (kind, slug)


# ---------------------------------------------------------------- 逐条目裁决
# 每条：(entry_id, decision, rationale, dest, extra_dict)
# decision ∈ UNIVERSAL | PROJECT | HYBRID；extra 携带 merge_group / clean_room_* / split_note

entries_by_asset = {}


def U(eid, rationale, dest, sketch, merge_group=None):
    extra = {
        "clean_room_note": CLEAN_ROOM_NOTE,
        "clean_room_rewrite_sketch": sketch,
    }
    if merge_group:
        extra["merge_group"] = merge_group
    return (eid, "UNIVERSAL", rationale, dest, extra)


def P(eid, rationale, dest):
    return (eid, "PROJECT", rationale, dest, {})


def H(eid, rationale, dest_u, dest_p, split_note, merge_group=None):
    extra = {"split_note": split_note}
    if merge_group:
        extra["merge_group"] = merge_group
    dest = {"universal": dest_u, "project": dest_p}
    return (eid, "HYBRID", rationale, dest, extra)


# ---- A1 architecture-constraints（11 = U1 / H9 / P1） ------------------------
ARCH_LAYER_R = "层职责与隔离方向骨架 universal（任意分层项目成立）；技术栈具名与职责文本细节为 project 参数"
ARCH_LAYER_SN = "universal 半=层职责/禁入方向（并入 MG-ARCH-LAYER 单一候选，防 8 条重复上提）；project 半=技术栈具名与职责文本（留 truth 对象）"
entries_by_asset["architecture-constraints"] = [
    H("layers.app", ARCH_LAYER_R, DEST_CAND["layer_isolation"], p_dest("architecture-constraint", "layer-app"),
      ARCH_LAYER_SN, "MG-ARCH-LAYER"),
    H("layers.pages", ARCH_LAYER_R, DEST_CAND["layer_isolation"], p_dest("architecture-constraint", "layer-pages"),
      ARCH_LAYER_SN, "MG-ARCH-LAYER"),
    H("layers.features", ARCH_LAYER_R, DEST_CAND["layer_isolation"], p_dest("architecture-constraint", "layer-features"),
      ARCH_LAYER_SN, "MG-ARCH-LAYER"),
    H("layers.entities", ARCH_LAYER_R, DEST_CAND["layer_isolation"], p_dest("architecture-constraint", "layer-entities"),
      ARCH_LAYER_SN, "MG-ARCH-LAYER"),
    H("layers.shared-state", ARCH_LAYER_R, DEST_CAND["layer_isolation"], p_dest("architecture-constraint", "layer-shared-state"),
      ARCH_LAYER_SN, "MG-ARCH-LAYER"),
    H("layers.shared-ui", ARCH_LAYER_R, DEST_CAND["layer_isolation"], p_dest("architecture-constraint", "layer-shared-ui"),
      ARCH_LAYER_SN, "MG-ARCH-LAYER"),
    H("layers.shared-grid", ARCH_LAYER_R, DEST_CAND["layer_isolation"], p_dest("architecture-constraint", "layer-shared-grid"),
      ARCH_LAYER_SN, "MG-ARCH-LAYER"),
    H("layers.shared-lib", ARCH_LAYER_R, DEST_CAND["layer_isolation"], p_dest("architecture-constraint", "layer-shared-lib"),
      ARCH_LAYER_SN, "MG-ARCH-LAYER"),
    H("deep_import_rule", "仅经公共桶导入、禁深入 internal 深路径为 universal 规则；可导入桶清单为本仓参数",
      DEST_CAND["public_api_barrel"], p_dest("architecture-constraint", "rule-deep-import"),
      "universal 半=桶导入纪律；project 半=本仓可导入桶清单", "MG-ARCH-BARREL"),
    U("new_file_rule",
      "纯新建文件纪律（先声明归属与不扩展理由、优先扩展既有载体），无项目专名，换任意分层项目成立",
      DEST_CAND["layer_isolation"],
      "新增任何文件前，必须先写明它归属哪个分层、哪个切片，并说明为何不能通过扩展既有文件达成；"
      "页面需要新状态时优先扩展该页已有的状态载体，而不是新建全局状态；"
      "新组件优先进入设计系统层或对应切片，避免堆积在页面层。",
      "MG-ARCH-LAYER"),
    P("public_api", "本仓公共桶清单属项目架构事实", p_dest("architecture-constraint", "public-api")),
]

# ---- A2 dependency-registry（27 = P27） --------------------------------------
entries_by_asset["dependency-registry"] = [
    P(dep, "具体包与版本锁定为本仓依赖事实（换技术栈即不成立）",
      p_dest("dependency", dep.lower()))
    for dep in DEPS
]

# ---- A3 directory-layout（14 = U7 / H4 / P3） --------------------------------
entries_by_asset["directory-layout"] = [
    P("layers.app", "本仓入口文件清单属项目事实；组装规则半已由 architecture-constraints 条目承载",
      p_dest("directory-layout", "layer-spec-app")),
    H("layers.pages", "页目录解剖（桶+页面组件+局部组件私有）universal；蓝图页面 id 体系与路径参数 project",
      DEST_CAND["layer_isolation"], p_dest("directory-layout", "layer-spec-pages"),
      "universal 半=页目录解剖模板；project 半=页面 id 体系与具体路径", "MG-ARCH-LAYER"),
    H("layers.features", "按能力切片的解剖与禁互引骨架 universal；能力 id 体系与路径参数 project",
      DEST_CAND["layer_isolation"], p_dest("directory-layout", "layer-spec-features"),
      "universal 半=切片解剖模板与禁互引；project 半=能力 id 体系", "MG-ARCH-LAYER"),
    H("layers.entities", "实体目录解剖（桶/接口/hooks/schema/类型）universal；查询键维度等参数 project",
      DEST_CAND["layer_isolation"], p_dest("directory-layout", "layer-spec-entities"),
      "universal 半=实体目录解剖；project 半=查询键维度清单", "MG-ARCH-LAYER"),
    U("naming.composable", "通用命名约定，无项目专名", DEST_CAND["naming"],
      "组合式函数文件名以 use 为前缀接驼峰主体，一个文件承载一个组合式函数。",
      "MG-ARCH-NAMING"),
    U("naming.page_component", "通用命名约定，无项目专名", DEST_CAND["naming"],
      "路由级页面组件文件名由页面语义名加帕斯卡式 Page 后缀组成。",
      "MG-ARCH-NAMING"),
    U("naming.feature_component", "通用命名约定，无项目专名", DEST_CAND["naming"],
      "切片内组合组件以 Widget 或 Panel 后缀命名，与页面级组件相区分。",
      "MG-ARCH-NAMING"),
    P("naming.shared_component", "组件名前缀绑定本仓品牌词与组件/模式注册表体系",
      p_dest("directory-layout", "naming-shared-component")),
    U("naming.barrel", "通用命名约定，无项目专名", DEST_CAND["public_api_barrel"],
      "每个分层根目录与每个切片、实体、页面根目录必须提供唯一的桶出口文件，作为该目录对外的唯一可见面。",
      "MG-ARCH-BARREL"),
    U("naming.entity_dir", "通用命名约定，无项目专名", DEST_CAND["naming"],
      "实体目录名采用单数名词加小写中划线的形式。",
      "MG-ARCH-NAMING"),
    H("naming.feature_dir", "蓝图 id 到目录名的转换规则 universal；能力 id 体系参数 project",
      DEST_CAND["naming"], p_dest("directory-layout", "naming-feature-dir"),
      "universal 半=蓝图 id 转 kebab 目录名规则；project 半=能力 id 体系本身", "MG-ARCH-NAMING"),
    H("naming.page_dir", "蓝图 id 到目录名的转换规则 universal；页面 id 体系参数 project",
      DEST_CAND["naming"], p_dest("directory-layout", "naming-page-dir"),
      "universal 半=蓝图 id 转 kebab 目录名规则；project 半=页面 id 体系本身", "MG-ARCH-NAMING"),
    U("barrel_rule", "桶为唯一出口纪律，无项目专名", DEST_CAND["public_api_barrel"],
      "桶文件是分层的唯一对外契约面：只转发对外接口，不暴露内部实现；跨层引用必须经由桶完成，深入内部目录的导入一律禁止。",
      "MG-ARCH-BARREL"),
    U("colocation_rule", "按复用范围就近放置的纪律，无项目专名", DEST_CAND["layer_isolation"],
      "组件按复用范围就近放置：单页私有的留在该页目录；跨页复用的进入功能切片；只有稳定共享且不携带业务语义的组件才下沉到设计系统层。",
      "MG-ARCH-LAYER"),
]

# ---- A4 http-client-policy（3 = H3） -----------------------------------------
entries_by_asset["http-client-policy"] = [
    H("clients.authClient",
      "会话族客户端分离与端点白名单原则 universal（任务明示例）；具体端点清单 project",
      DEST_CAND["auth_split"], p_dest("http-client", "client-auth"),
      "universal 半=auth/app 双客户端分离 + 端点白名单原则（与既有 SINGLE_HTTP_CLIENT/TRUSTED_ENDPOINT_SOURCE 审重）；project 半=5 条端点清单",
      "MG-HTTP-RECOVERY"),
    H("clients.appClient",
      "401/403 分开处理 + 单飞刷新 + 重放上限 universal（任务明示例）；业务域范围与排除路径 project",
      DEST_CAND["session_recovery"], p_dest("http-client", "client-app"),
      "universal 半=401 刷新一次重放一次 / 403 不刷新拒绝 / 单飞刷新 / 逐请求重放上限；project 半=业务域范围与排除路径清单",
      "MG-HTTP-RECOVERY"),
    H("global",
      "统一超时/取消/追踪/请求标识挂点骨架 universal；超时数值、头名、重试策略 id 参数 project",
      DEST_CAND["request_infra"], p_dest("http-client", "global-config"),
      "universal 半=请求基础设施统一挂点（超时/中止/追踪/请求标识/基础地址来源）；project 半=30000ms 数值、两个头名、重试策略 id",
      "MG-HTTP-RECOVERY"),
]

# ---- A5 implementation-boundary-plan（39 = P39） ------------------------------
entries_by_asset["implementation-boundary-plan"] = [
    P(bid, "逐页保护面绑定本页蓝图 region/action 集合，属项目事实",
      p_dest("boundary", bid.lower()))
    for bid, _ in BOUNDARIES
]

# ---- A6 pattern-registry（12 = P12） -----------------------------------------
entries_by_asset["pattern-registry"] = [
    P(pid, "模式条目锚定本仓实现文件与项目词汇表（composes/slots/锚路径）",
      p_dest("pattern", pid.lower().replace("_", "-")))
    for pid in PATTERNS
]

# ---- A7 performance-budget（63 = H2 / P61） ----------------------------------
_perf = [
    H("initial_load",
      "装载预算结构（分类+计量口径）universal；具体阈值数值 project",
      DEST_CAND["perf_skeleton"], p_dest("performance-budget", "initial-load"),
      "universal 半=载荷分类（脚本/样式/图片）与计量口径；project 半=500KB/100KB/300KB 数值",
      "MG-PERF-SKELETON"),
    H("runtime",
      "运行时指标集骨架（首绘/可交互/长任务）universal；目标数值 project",
      DEST_CAND["perf_skeleton"], p_dest("performance-budget", "runtime"),
      "universal 半=三类运行时指标集；project 半=1.5s/3s/200ms 目标数值",
      "MG-PERF-SKELETON"),
]
_perf += [
    P("route.%s" % t, "模板到预算的绑定行属本仓分母数据",
      p_dest("performance-budget", "route-" + t.lower().replace(".", "-")))
    for t in PERF_TEMPLATES
]
_perf += [
    P("page_type_budgets.%s" % t, "模板 id 与阈值为项目参数；结构半已由 initial_load/runtime 两条承载，避免重复上提",
      p_dest("performance-budget", "ptb-" + t.lower().replace(".", "-")))
    for t in PERF_TEMPLATES
]
_perf += [
    P("pages.%s" % pg, "逐页预算绑定属本仓页面分母数据",
      p_dest("performance-budget", "page-" + pg.lower()))
    for pg in PERF_PAGES
]
entries_by_asset["performance-budget"] = _perf

# ---- A8 style-ownership-registry（28 = U1 / H5 / P22） -----------------------
_style = [
    P("design_baseline", "字体/配色/密度等视觉裁决为本仓设计基线（含雅黑+Inter 栈选择，任务明示例 project）",
      p_dest("style-ownership", "design-baseline")),
    P("global_entry", "全局样式入口具体路径属项目事实", p_dest("style-ownership", "global-entry")),
]
_style += [
    H("layers.%s" % scope,
      "样式所有权域矩阵骨架（域+禁止行为类别）universal；owner 路径与扫描器 forbidden 词表 project",
      DEST_CAND["style_matrix"], p_dest("style-ownership", "scope-owner-" + scope),
      "universal 半=五域所有权矩阵与禁止行为类别学；project 半=owner 路径与 forbidden 扫描词表",
      "MG-STYLE-MATRIX")
    for scope in ["global-reset", "design-token", "shared-component", "page-local", "vendor-adapter"]
]
_style += [
    P("load_order", "装载序列绑定本仓样式文件集，属项目事实", p_dest("style-ownership", "load-order")),
    U("scoped_style_rule", "scoped 局部/全局类声明位置纪律，无项目专名", DEST_CAND["style_matrix"],
      "Scoped 样式块只允许承载页面局部样式；全局样式类只允许在共享组件层声明，页面不得向外泄漏全局类名。",
      "MG-STYLE-MATRIX"),
]
_style += [
    P("style_entries.%s" % layer, "样式文件清单与 required 标记属项目事实",
      p_dest("style-ownership", "style-entry-" + layer))
    for layer in ["tokens", "reset", "base", "typography", "layout", "vendors", "utilities", "overrides"]
]
_style += [
    P("third_party_style_owners", "显式空声明属本仓登记态", p_dest("style-ownership", "third-party-style-owners")),
    P("token_entry", "token 事实源入口路径属项目事实", p_dest("style-ownership", "token-entry")),
    P("token_generation_command", "token 生成命令属本仓工具链事实", p_dest("style-ownership", "token-generation-command")),
    P("token_source", "token 源文件路径属项目事实", p_dest("style-ownership", "token-source")),
]
_style += [
    P("token_usage.%s" % key, "具体 token 语义注记绑定本仓表格交互，属项目事实",
      p_dest("style-ownership", "token-usage-" + key))
    for key in TOKEN_KEYS
]
_style += [
    P("vendor_important_exemptions", "对抗具体 vendor 引擎选择器的豁免属项目事实",
      p_dest("style-ownership", "vendor-important-exemption-ag-cell-focus")),
    P("visual_baseline", "密度/语义色/单元格状态模型为本仓视觉真值（原型派生+用户裁决）",
      p_dest("style-ownership", "visual-baseline")),
]
entries_by_asset["style-ownership-registry"] = _style

# ---- A9 test-fixture-plan（101 = P101） --------------------------------------
entries_by_asset["test-fixture-plan"] = [
    P(fid, "场景/数据态/测试账号绑定本仓 API 契约，属项目测试事实",
      p_dest("fixture", fid.lower()))
    for fid in FIXTURES
]

# ---- A10 uiux-provider-overlay（19 = U1 / P18） -------------------------------
_overlay = [
    U("authority", "证据定性 posture（工具抽取内容仅为可选证据、非业务事实），无项目专名",
      DEST_CAND["evidence_not_truth"],
      "由外部工具从视觉稿抽取的内容一律定性为可选参考证据，永不构成业务事实；业务真值只能来自已登记的契约面。"),
    P("provider", "抽取工具选型为本仓决定", p_dest("overlay-evidence", "provider")),
    P("shared_shell", "外壳映射属本仓原型事实", p_dest("overlay-evidence", "shared-shell")),
    P("source", "原型来源指针属项目事实", p_dest("overlay-evidence", "source")),
]
_overlay += [
    P("pages.%s" % pg, "原型证据抽取绑定本仓页面与原型资产，属项目事实",
      p_dest("overlay-evidence", "page-" + pg.lower()))
    for pg in OVERLAY_PAGES
]
entries_by_asset["uiux-provider-overlay"] = _overlay

# ---------------------------------------------------------------- 汇总 + 恒等式
ASSET_ORDER = [
    ("architecture-constraints", "MIG-B4/ARCHITECTURE"),
    ("dependency-registry", "MIG-B4/DEPENDENCY"),
    ("directory-layout", "MIG-B4/ARCHITECTURE"),
    ("http-client-policy", "MIG-B4/HTTP_CLIENT"),
    ("implementation-boundary-plan", "MIG-B4/BOUNDARY"),
    ("pattern-registry", "MIG-B4/PATTERN"),
    ("performance-budget", "MIG-B4/PERFORMANCE"),
    ("style-ownership-registry", "MIG-B4/STYLE"),
    ("test-fixture-plan", "MIG-B4/TEST"),
    ("uiux-provider-overlay", "MIG-B4/UIUX_OVERLAY"),
]

entries_out = []
counts = {"UNIVERSAL": 0, "PROJECT": 0, "HYBRID": 0}
per_asset = {}
for asset_id, mbatch in ASSET_ORDER:
    rows = entries_by_asset[asset_id]
    c = {"UNIVERSAL": 0, "PROJECT": 0, "HYBRID": 0}
    for eid, decision, rationale, dest, extra in rows:
        c[decision] += 1
        counts[decision] += 1
        entry = {
            "source_ref": SRC + asset_id + ".yaml",
            "asset_id": asset_id,
            "migration_batch": mbatch,
            "entry_id": eid,
            "decision": decision,
            "rationale_one_line": rationale,
            "destination": dest,
        }
        entry.update(extra)
        # 结构断言：U 必带 sketch+note；H 必带双半 destination+split_note
        if decision == "UNIVERSAL":
            assert "clean_room_rewrite_sketch" in entry and "clean_room_note" in entry, eid
        if decision == "HYBRID":
            assert isinstance(entry["destination"], dict) and "split_note" in entry, eid
        entries_out.append(entry)
    total = len(rows)
    assert total == c["UNIVERSAL"] + c["PROJECT"] + c["HYBRID"]
    per_asset[asset_id] = {
        "total": total,
        "universal": c["UNIVERSAL"],
        "project": c["PROJECT"],
        "hybrid": c["HYBRID"],
    }

total_entries = len(entries_out)
assert total_entries == counts["UNIVERSAL"] + counts["PROJECT"] + counts["HYBRID"], "恒等式破损"
assert total_entries == sum(v["total"] for v in per_asset.values()), "分母恒等式破损"

ledger = {
    "document_kind": "m1-split-ledger",
    "batch": "MIG-B4",
    "decision_rule": (
        "三选一：UNIVERSAL=换一个 Vue+FastAPI 项目仍成立的通用工程政策（上提 catalog，独立改写）；"
        "PROJECT=MASTer 专属事实（项目侧 truth 对象 + Baseline 引用）；"
        "HYBRID=骨架 universal+参数 project（拆两半分别落）。保守偏差：拿不准→PROJECT（catalog 防范围膨胀）。"
    ),
    "entry_count_rule": (
        "信封字段（blueprint_sha256/document_type/schema_version/updated_at/architecture_name/"
        "architecture_version/purpose）不入分母；其余顶层决策字段与主列表条目逐条入分母。"
        "条目顺序=资产按 inventory 顺序、条目按源文件键序；id 列表与 key-binding-map.batch4.draft.yaml 同源。"
    ),
    "clean_room_rule": (
        "D3 生死线：UNIVERSAL 条目全部独立改写（clean_room_rewrite_sketch 为改写词面，语义等价、词形独立），"
        "每条带 clean_room_note；sketch 词面零项目专名，catalog 条目 gate grep 面安全；"
        "catalog 物化（后续步骤）以 sketch 为底稿，禁回抄 MASTer 源文本。"
    ),
    "catalog_scope_note": (
        "防范围膨胀：universal 半优先与既有 catalog 面审重"
        "（POLICY.WEB.API.SINGLE_HTTP_CLIENT/TRUSTED_ENDPOINT_SOURCE/ERROR_NORMALIZATION/RETRY_DISCIPLINE 等），"
        "确属缺口才立候选；候选 9 个归并为 6 个 merge_group（MG-ARCH-LAYER/MG-ARCH-BARREL/MG-ARCH-NAMING/"
        "MG-HTTP-RECOVERY/MG-PERF-SKELETON/MG-STYLE-MATRIX）。catalog-lock：候选物化时按 catalog/tools 既有模式"
        "同步 controlled_children（allowed+required 两处）并重生成 catalog-lock.draft.json（0 mismatch、幂等 byte-identical）。"
    ),
    "denominator": {
        "assets": len(ASSET_ORDER),
        "total_entries": total_entries,
        "universal": counts["UNIVERSAL"],
        "project": counts["PROJECT"],
        "hybrid": counts["HYBRID"],
        "identity_check": (
            "universal(%d) + project(%d) + hybrid(%d) = %d = total_entries（恒等式，脚本断言）"
            % (counts["UNIVERSAL"], counts["PROJECT"], counts["HYBRID"],
               counts["UNIVERSAL"] + counts["PROJECT"] + counts["HYBRID"])
        ),
        "method": (
            "sum(entries_by_asset) 逐资产累加 + 全表断言；id 分母与 key-binding-map.batch4.draft.yaml"
            " summary_counts 同源（dependency 27 / fixture 101 / boundary 39 / pattern 12 /"
            " performance ptb 11 / token_usage 5 / overlay 15 / perf pages 39）"
        ),
        "per_asset": per_asset,
    },
    "entries": entries_out,
}


def build_yaml_bytes():
    return yaml.safe_dump(
        ledger, sort_keys=True, allow_unicode=True, default_flow_style=False,
        width=100000
    ).encode("utf-8")


# 幂等自证：构建两遍逐字节比对一致后才落盘
first = build_yaml_bytes()
second = build_yaml_bytes()
assert first == second, "幂等自证失败：两次构建不一致"

with open(OUT_PATH, "wb") as f:
    f.write(first)

print("written:", OUT_PATH)
print("total_entries=%d U=%d P=%d H=%d"
      % (total_entries, counts["UNIVERSAL"], counts["PROJECT"], counts["HYBRID"]))
for asset_id, v in per_asset.items():
    print("  %-32s total=%-4d U=%-3d P=%-4d H=%-3d"
          % (asset_id, v["total"], v["universal"], v["project"], v["hybrid"]))
