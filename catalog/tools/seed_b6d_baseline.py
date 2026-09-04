# -*- coding: utf-8 -*-
"""B6d baseline 体系 25 文件新著工具(播种资产 + 自指指纹 pin + unknowns 台账单源)。

输入(只读):
  - packages/cli/seeds/manifest.json                          B6b/B6c 清单(107 条原样保留并入)
  - doc/POMaster-vNext-Consolidated-PRD.md(语义真源,不读取——内容由 §3 树职责
    注释逐字承载为常量表;§7.2/7.3 示例词 NON-AUTHORITATIVE 不住播种面)

输出:
  - packages/cli/seeds/baseline/manifest.yaml                 baseline 身份/seed 来源/
    版本/unknowns 台账(YAML 直接可解析——机器锚面)
  - packages/cli/seeds/baseline/frontend/{stack.yaml,architecture.md,
    directory-structure.md,design-system.md,state-and-data.md,api-and-error.md,quality.md}
  - packages/cli/seeds/baseline/backend/{stack.yaml,architecture.md,
    directory-structure.md,api-contract.md,data-access.md,transaction-concurrency.md,
    integration-runtime.md,quality.md}
  - packages/cli/seeds/baseline/data/{model.md,precision-units.md,migration.md,
    lineage.md,quality.md}
  - packages/cli/seeds/baseline/platform/{security.md,environment.md,
    observability.md,delivery.md}
  - packages/cli/seeds/manifest.json                          播种清单单源(B6b/B6c 107 条
    原样保留 + B6D 25 条追加;132 条全量分母)

新著形态定案(ADR-lite,B6d;任务红线「本子批是新著非逐字移植」):
  - **新著 ≠ 移植**:旧包无 25 文件成套资产(运行时 factsource stack-baseline.schema +
    02-technology-baseline planned 模板是语义祖先,仅字段/词形参照;capability/status/
    supersedes/ACR 演化语义不并入一期——提案 §3「manifest unknowns 台账是最小充分起步」)。
    骨架章节 = PRD §3 目录树职责注释逐字词形(文件职责真源);任何具体技术选型词
    (Vue/Spring/MySQL 等)不得作为默认值写入(E2/PRD §7.1 NON-AUTHORITATIVE——示例
    只住 PRD 与 catalog 注记),起步值一律 UNKNOWN(A1/宪法 C1 词形纪律——旧「待填写」
    词形零移植,工具级禁词扫描兜底);
  - **播种件无 frontmatter**(本批 ADR,与 specs 面移植件刻意分形):25 件均为纯正文
    ——yaml 直接可解析(项目侧机器锚面零污染:frontmatter 块会使 yaml.safe_load 取
    到错误文档)、md 零噪音(Owner 填写面)。清单 provenance 改走 entry 级
    authoring="new" 词形 + **自指指纹**:source_sha256 = 播种件自身字节 sha256
    (新著无 vendor 源字节——移植件「frontmatter 双锚」语义不适用;自指指纹防的是
    包内清单↔资产失同步,与移植件防源漂移功能等价;装载器 seed-manifest.ts 按
    authoring 分流校验);
  - **lane 词形**:B6D 条目 lane = 播种分区词形 frontend/backend/data/platform
    (与 target 词形同源;baseline 根 manifest 条目取 "baseline";CATALOG_LANE_VALUES
    是 catalog 条目 applicability 闭包,零扩值不受影响——清单 entry 的 lane 是播种
    lane 注记,catalog 面无 data/platform 条目产生);
  - **manifest.yaml 形态**(提案 §3 schema 落地 + 静态面裁剪):seed.catalog_version
    省略(播种件是包内静态字节,init 不做动态注入——动态版本注入面不存在;
    seed_version: B6D 批次代号承载版本信息,零墙钟批次代号先例);unknowns 台账 =
    两个 stack.yaml 键集的派生词形 baseline/<lane>/stack.yaml:<key>(FE 9 + BE 5 =
    14 条),Owner 回填选型后逐条销账;status: CURRENT 按提案;
  - **stack.yaml 键集**(PRD §3 注释逐字):frontend = framework/language/build/
    router/state/grid/ui/css/testing(9 键);backend = language/framework/persistence/
    database/cache(5 键);值一律 UNKNOWN。**零 profile 预填**(衔接面裁定):catalog
    PROFILE.BASELINE.JAVA_ENTERPRISE_DEFAULT 卡 includes 9 项组合是信息性参考
    (B6c A1 登记「可预填」),本批不采用——PRD §7.2 警示句「起步值一律 UNKNOWN」
    优先,组合词禁入播种面(工具禁词表兜底);衔接闭环点 = stack.yaml 显式选型承载
    specs/hard/stacks/ overlay 的 bound 语义(B6c STACK_OVERLAY_NOTE 注记的 B6d 落位);
  - **stack.yaml 形态校验**(提案「最小 schema 或留自由文件面」裁定):取测试级键集
    形态校验(baseline-seeds.spec.ts:键集 == unknowns 台账派生 + 值全 UNKNOWN),
    不新增运行时装载器/schema 物料——baseline 件的运行时消费(context compile
    AUTHORITATIVE 输入)是后续批次面,本批不加无消费者的机制(catalog PROJECT_
    BASELINE_TEMPLATE 注记同理一期不做,提案 §1 矩阵「可选」);
  - **播种面零变更**:SEEDABLE_STORE_DIRS 已含 baseline 四分区(B6a),kernel/layout
    零改动;seed-once-missing-only 语义不变。

用法:
  python seed_b6d_baseline.py            # 物化(write_if_changed 幂等)
  python seed_b6d_baseline.py --verify   # 只读重演(字节逐等比对)
"""

import hashlib
import io
import json
import os
import re
import sys

import yaml

if __name__ == "__main__":
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))            # .../POMaster_VNext/catalog/tools
VNEXT = os.path.dirname(os.path.dirname(HERE))               # .../POMaster_VNext
REPO = os.path.dirname(VNEXT)                                # d:/Vscode Documents/po-master
SEEDS_DIR = os.path.join(VNEXT, "packages", "cli", "seeds")
BASELINE_ASSET_DIR = os.path.join(SEEDS_DIR, "baseline")
MANIFEST_PATH = os.path.join(SEEDS_DIR, "manifest.json")

BATCH = "B6D"
MANIFEST_SCHEMA = "pomaster.seed-manifest/1"
PLANTED_TOTAL = 132
BATCH_SCOPE = ("B6d:baseline 体系 25 文件新著播种(manifest.yaml 1 + frontend 7 + "
               "backend 8 + data 5 + platform 4;UNKNOWN 起步,「待填写」词形零移植;"
               "B6b/B6c 107 条在册——清单合并承载全量分母 132)")

# 设计源锚(新著件的 source_path 词形——非 vendor 字节源,provenance 语义见头注 ADR)。
DESIGN_SOURCE = ("doc/POMaster-vNext-Consolidated-PRD.md#s3-baseline-tree"
                 "(PRD §3 树职责注释逐字承载;新著无 vendor 字节源——"
                 "语义祖先=旧 stack-baseline.schema + 02-technology-baseline 模板,仅参照)")

NEW_AUTHORING_NOTES = [
    "B6d 新著件(非移植):旧包无 25 文件成套资产——语义祖先为运行时 factsource "
    "stack-baseline.schema 与 02-technology-baseline planned 模板(仅字段/词形参照,"
    "capability/status/supersedes/ACR 演化语义不并入一期,提案 §3);骨架章节照 PRD "
    "§3 baseline 树职责注释逐字;内容零发明:起步值一律 UNKNOWN,示例与默认值不住"
    "播种面(PRD §7.1 NON-AUTHORITATIVE——示例只住 PRD/catalog 注记)",
    "B6d 形态注记:本件无 frontmatter(纯正文——yaml 直接可解析/md 零噪音,Owner "
    "填写面);清单 pin=资产自身字节 sha256(authoring=new 自指指纹——新著无 vendor "
    "源字节,防包内清单↔资产失同步,装载器按 authoring 分流校验)",
]

# ======================================================================
# stack.yaml 键集(PRD §3 注释逐字)+ manifest.yaml unknowns 台账派生
# ======================================================================
FE_STACK_KEYS = ["framework", "language", "build", "router", "state",
                 "grid", "ui", "css", "testing"]
BE_STACK_KEYS = ["language", "framework", "persistence", "database", "cache"]

STACK_YAML_CONTENT = {
    "frontend": (
        "# baseline/frontend/stack.yaml —— 前端技术选型(工程决策记录;不复制 package.json/锁文件)\n"
        "# 职责(PRD §3):framework/language/build/router/state/grid/ui/css/testing\n"
        "# 起步值一律 UNKNOWN;Owner 决策后逐键回填,并在 baseline/manifest.yaml 的\n"
        "# unknowns 台账对本键销账。\n"
        "# 选型承载 specs/hard/stacks/ overlay 的 bound 语义(显式选型 = 绑定;未选型 =\n"
        "# installed 未 bound——B6c 播种注记的 B6d 落位)。\n"
        "# catalog TECHNOLOGY_PROFILE 卡(含 PROFILE 组合清单)仅为信息性参考——不预填\n"
        "# 本文件(NON-AUTHORITATIVE:示例与组合建议只住 catalog 注记,不住项目基线)。\n"
    ),
    "backend": (
        "# baseline/backend/stack.yaml —— 后端技术选型(工程决策记录;不复制构建清单)\n"
        "# 职责(PRD §3):language/framework/persistence/database/cache\n"
        "# 起步值一律 UNKNOWN;Owner 决策后逐键回填,并在 baseline/manifest.yaml 的\n"
        "# unknowns 台账对本键销账。\n"
        "# 选型承载 specs/hard/stacks/ overlay 的 bound 语义(显式选型 = 绑定;未选型 =\n"
        "# installed 未 bound——B6c 播种注记的 B6d 落位)。\n"
        "# catalog TECHNOLOGY_PROFILE 卡(含 PROFILE 组合清单)仅为信息性参考——不预填\n"
        "# 本文件(NON-AUTHORITATIVE:示例与组合建议只住 catalog 注记,不住项目基线)。\n"
    ),
}
for _lane, _keys in (("frontend", FE_STACK_KEYS), ("backend", BE_STACK_KEYS)):
    STACK_YAML_CONTENT[_lane] += "".join(f"{k}: UNKNOWN\n" for k in _keys)


def unknowns_ledger():
    """unknowns 台账词形(与两个 stack.yaml 键集一一对应——工具单源派生)。"""
    return ([f"baseline/frontend/stack.yaml:{k}" for k in FE_STACK_KEYS]
            + [f"baseline/backend/stack.yaml:{k}" for k in BE_STACK_KEYS])


def build_manifest_yaml():
    lines = [
        "# baseline/manifest.yaml —— Project Engineering Baseline 身份/seed 来源/版本/UNKNOWN 台账单源\n"
        "# 职责(PRD §3 树):baseline 身份/seed 来源/版本/UNKNOWN 台账。\n"
        "# 本文件由 pomaster init 播种(B6d);id/lanes/unknowns 是 baseline 体系的机器\n"
        "# 可读锚;unknowns 台账与 frontend/backend 两个 stack.yaml 的键集一一对应——\n"
        "# Owner 回填选型后逐条销账(台账之外的新选型键由 Owner 自行增补登记)。\n",
        "id: BASELINE.PROJECT\n",
        "schema_version: 1\n",
        "seed:\n",
        "  tool: pomaster init\n",
        "  seed_version: B6D\n",
        "  seed_manifest: package://seeds/manifest.json\n",
        "status: CURRENT\n",
        "lanes:\n",
        "  frontend: ./frontend\n",
        "  backend: ./backend\n",
        "  data: ./data\n",
        "  platform: ./platform\n",
        "unknowns:\n",
    ]
    lines += [f"  - {u}\n" for u in unknowns_ledger()]
    return "".join(lines)


# ======================================================================
# md 模板骨架(章节 = PRD §3 职责注释逐字词形;起步值一律 UNKNOWN)
# ======================================================================
HEADER_DISCIPLINE = (
    "- 状态:播种模板(Expected 面)——项目 Owner 就地填写;起步值一律 UNKNOWN,"
    "不确定保持 UNKNOWN,不猜测、不留空白或任何占位描述词形(旧模板占位词形零移植)。\n"
    "- 填写纪律:技术选型词与阈值数字仅由 Owner 决策后写入本文件;示例与默认值不住"
    "播种面(PRD §7.1 NON-AUTHORITATIVE——示例只住 PRD 与 catalog 注记)。\n"
)


def md_template(title, rel, duty, sections):
    """统一 md 骨架:标题 + 职责头 + 纪律头 + 逐节(起步值 UNKNOWN + 填写指引)。

    sections: [(节名, 填写指引一句话)];节名照 PRD §3 职责注释词形。
    """
    out = [f"# {title}\n\n",
           f"- 路径:{rel}\n",
           f"- 职责(PRD §3):{duty}\n",
           HEADER_DISCIPLINE]
    for name, guide in sections:
        out.append(f"## {name}\n\n")
        out.append("- 起步值:UNKNOWN\n")
        out.append(f"- 填写指引:{guide}\n\n")
    return "".join(out)


# 25 件分母(1 manifest + 7 FE + 8 BE + 5 data + 4 platform);节表 = PRD §3 注释逐字。
MD_TEMPLATES = {
    "frontend/architecture.md": md_template(
        "前端架构基线", "baseline/frontend/architecture.md",
        "Purpose / Layers / Responsibility / Dependencies",
        [
            ("Purpose", "本前端子系统的架构目的与覆盖范围(一段话说清它承担什么、不承担什么)。"),
            ("Layers", "逐层登记:层名 + 一句话职责(层集合由 Owner 定义,不预设层数)。"),
            ("Responsibility", "跨层职责分配规则(哪一类变更落在哪一层,逐类登记)。"),
            ("Dependencies", "层间依赖规则:允许的依赖方向与禁止的依赖方向,逐条显式登记。"),
        ]),
    "frontend/directory-structure.md": md_template(
        "前端目录结构基线", "baseline/frontend/directory-structure.md",
        "目标目录模板 + 职责说明",
        [
            ("目标目录模板", "目标目录树逐条登记:目录名 + 一句话职责(由 Owner 依项目形态定义)。"),
            ("职责说明", "关键目录的边界说明:放什么、不放什么;歧义归属裁决规则。"),
        ]),
    "frontend/design-system.md": md_template(
        "前端设计系统基线", "baseline/frontend/design-system.md",
        "token strategy / component source / reuse rules",
        [
            ("token strategy", "设计令牌的组织与消费策略(令牌分层、命名、消费入口)。"),
            ("component source", "组件的权威来源与准入规则(来源登记;自造组件的判定与禁止面)。"),
            ("reuse rules", "复用规则:何时复用既有件、何时新建、禁止的绕过路径。"),
        ]),
    "frontend/state-and-data.md": md_template(
        "前端状态与数据基线", "baseline/frontend/state-and-data.md",
        "state ownership / server-state / cache / derived",
        [
            ("state ownership", "逐类状态登记属主:谁拥有写权、谁只读;跨组件共享的裁决。"),
            ("server-state", "服务端状态的获取、同步与失效策略(缓存期/重取时机由 Owner 定)。"),
            ("cache", "客户端缓存范围与失效规则(缓存什么、何时不缓存)。"),
            ("derived", "派生状态的计算位置与一致性约束(派生链登记;禁止的重复真源)。"),
        ]),
    "frontend/api-and-error.md": md_template(
        "前端 API 与错误处理基线", "baseline/frontend/api-and-error.md",
        "client hierarchy / error taxonomy / retry",
        [
            ("client hierarchy", "请求客户端的分层与唯一出口(每层职责;禁止的旁路调用)。"),
            ("error taxonomy", "错误分类与用户呈现映射(逐类登记:识别方式与呈现口径)。"),
            ("retry", "重试规则:哪些操作可重试、上限与退避方式(由 Owner 决策)。"),
        ]),
    "frontend/quality.md": md_template(
        "前端质量基线", "baseline/frontend/quality.md",
        "coverage budget / CRAP / browser matrix / a11y",
        [
            ("coverage budget", "覆盖率预算(阈值数字由 Owner 决策;口径与度量面一并登记)。"),
            ("CRAP", "复杂度风险阈值的治理约定(告警与阻断的取值由 Owner 决策)。"),
            ("browser matrix", "浏览器与设备支持矩阵逐项列出(支持/降级/不支持三档)。"),
            ("a11y", "可访问性基线(对标哪一版标准、核查方式与频率,由 Owner 决策)。"),
        ]),
    "backend/architecture.md": md_template(
        "后端架构基线", "baseline/backend/architecture.md",
        "System / Service / Layer / Module / Boundary",
        [
            ("System", "系统全景:服务清单与系统边界(每个服务一句话职责)。"),
            ("Service", "单服务职责与自治范围(数据归属与对外承诺)。"),
            ("Layer", "层结构与各层职责(逐层登记;层集合由 Owner 定义)。"),
            ("Module", "模块划分与三要素:入口、职责、依赖(逐模块登记)。"),
            ("Boundary", "跨模块/跨服务边界规则:允许与禁止的依赖方向逐条显式登记。"),
        ]),
    "backend/directory-structure.md": md_template(
        "后端目录结构基线", "baseline/backend/directory-structure.md",
        "项目后端目录模板",
        [
            ("项目后端目录模板", "目标目录树逐条登记:目录名 + 一句话职责 + 关键边界说明。"),
        ]),
    "backend/api-contract.md": md_template(
        "后端 API 契约基线", "baseline/backend/api-contract.md",
        "REST style / error envelope / auth / versioning",
        [
            ("REST style", "接口风格约定(资源组织、命名、方法语义)由 Owner 决策后登记。"),
            ("error envelope", "错误信封结构:字段、语义与错误码分配规则(逐字段登记)。"),
            ("auth", "认证与授权的机制决策(机制、凭据载体、失效策略)。"),
            ("versioning", "契约版本策略:版本载体、兼容承诺、废弃流程。"),
        ]),
    "backend/data-access.md": md_template(
        "后端数据访问基线", "baseline/backend/data-access.md",
        "Repository / SQL / N+1 / index / pagination",
        [
            ("Repository", "数据访问的组织形态与唯一出口(禁止的直连路径逐条登记)。"),
            ("SQL", "SQL 编写与审查规则(谁写、谁审、禁写形态)。"),
            ("N+1", "查询放大问题的预防约定(识别方式与处置路径)。"),
            ("index", "索引策略:建索引的依据与登记方式(逐索引登记)。"),
            ("pagination", "分页约定(分页方式与默认页大小由 Owner 决策)。"),
        ]),
    "backend/transaction-concurrency.md": md_template(
        "后端事务与并发基线", "baseline/backend/transaction-concurrency.md",
        "TX boundary / lock / optimistic / idempotency",
        [
            ("TX boundary", "事务边界:在哪一层开启、如何传播、如何收口(逐场景登记)。"),
            ("lock", "锁策略:锁粒度、持有时长、死锁预防规则。"),
            ("optimistic", "乐观并发:版本载体与冲突处理路径。"),
            ("idempotency", "幂等键的载体与覆盖范围(逐类操作登记)。"),
        ]),
    "backend/integration-runtime.md": md_template(
        "后端集成与运行时基线", "baseline/backend/integration-runtime.md",
        "external integration / resilience / deployment",
        [
            ("external integration", "外部集成登记要素逐条填:对端、协议、超时、降级(取值由 Owner 定)。"),
            ("resilience", "韧性策略的适用范围:超时、重试、熔断、隔离(逐策略登记适用面)。"),
            ("deployment", "部署形态与运行时约束(形态、资源约束、发布单元)。"),
        ]),
    "backend/quality.md": md_template(
        "后端质量基线", "baseline/backend/quality.md",
        "coverage / CRAP / mutation / architecture / contract",
        [
            ("coverage", "覆盖率要求(阈值数字由 Owner 决策;口径一并登记)。"),
            ("CRAP", "复杂度风险阈值(告警与阻断取值由 Owner 决策)。"),
            ("mutation", "变异测试的适用范围与判卷阈值(范围、阈值由 Owner 决策)。"),
            ("architecture", "架构核查方式:依赖方向与分层约定的验证手段与频率。"),
            ("contract", "契约测试的覆盖范围与触发时机。"),
        ]),
    "data/model.md": md_template(
        "数据模型基线", "baseline/data/model.md",
        "Entity / Table / Identifier / Relation / lifecycle",
        [
            ("Entity", "实体清单逐条登记:实体名 + 一句话定义。"),
            ("Table", "物理表与实体的映射规则(一比一/拆分/合并的裁决依据)。"),
            ("Identifier", "标识符策略:形态、生成方、唯一性范围(逐实体登记)。"),
            ("Relation", "关系与基数逐对登记(双方、基数、删除语义)。"),
            ("lifecycle", "对象生命周期:状态集合与允许的转移规则(逐对象登记)。"),
        ]),
    "data/precision-units.md": md_template(
        "数据精度与单位基线", "baseline/data/precision-units.md",
        "Money / Currency / Quantity / Scale / Rounding",
        [
            ("Money", "金额的表示与运算规则(表示形态、运算入口由 Owner 决策)。"),
            ("Currency", "币种处理规则与默认币种(默认值由 Owner 决策)。"),
            ("Quantity", "数量的表示与单位登记(逐量纲登记)。"),
            ("Scale", "精度与小数位登记(逐字段登记)。"),
            ("Rounding", "舍入模式与适用场景(逐场景登记)。"),
        ]),
    "data/migration.md": md_template(
        "数据迁移基线", "baseline/data/migration.md",
        "expand / migrate / contract / rollback",
        [
            ("迁移策略(expand / migrate / contract / rollback)",
             "扩-迁-缩三阶段约定与回滚方案;每次迁移的审批面与验证要求。"),
        ]),
    "data/lineage.md": md_template(
        "数据血缘基线", "baseline/data/lineage.md",
        "Source / Transform / Target",
        [
            ("数据链路(Source → Transform → Target)",
             "逐条登记:来源 → 变换 → 目标;每段的属主与校验点。"),
        ]),
    "data/quality.md": md_template(
        "数据质量基线", "baseline/data/quality.md",
        "null / uniqueness / precision / stale / reconciliation",
        [
            ("null", "空值语义:哪些字段可空、空值的含义(逐字段登记)。"),
            ("uniqueness", "唯一性约束逐条登记(约束、范围、违反时的处置)。"),
            ("precision", "跨系统边界的精度承诺(承诺什么、由谁保证)。"),
            ("stale", "时效性:数据的有效期与陈旧判定(逐类数据登记)。"),
            ("reconciliation", "对账机制:周期、口径、差异处置路径。"),
        ]),
    "platform/security.md": md_template(
        "平台安全基线", "baseline/platform/security.md",
        "auth / secret / sensitive data / trust zone",
        [
            ("auth", "认证与授权机制决策(机制、会话策略、权限模型由 Owner 定)。"),
            ("secret", "密钥与凭据的管理规则(存放、注入方式、轮换周期由 Owner 定)。"),
            ("sensitive data", "敏感数据清单与处理规则(分类、最小化、脱敏要求)。"),
            ("trust zone", "信任边界划分:哪些组件在边界内、哪些在边界外、跨界规则。"),
        ]),
    "platform/environment.md": md_template(
        "平台环境基线", "baseline/platform/environment.md",
        "local / dev / test / stage / prod 差异规则",
        [
            ("环境差异规则(local / dev / test / stage / prod)",
             "逐环境登记:用途、配置差异面、数据策略、访问控制;差异必须显式登记,"
             "禁止隐式假设(环境集合由 Owner 按项目实际裁剪)。"),
        ]),
    "platform/observability.md": md_template(
        "平台可观测性基线", "baseline/platform/observability.md",
        "log / metric / trace / audit / correlation",
        [
            ("log", "日志分类、级别语义与保留策略。"),
            ("metric", "指标清单与口径(逐指标登记:名称、含义、维度)。"),
            ("trace", "链路追踪的范围与采样策略(由 Owner 决策)。"),
            ("audit", "审计事件清单与不可抵赖要求(逐事件登记)。"),
            ("correlation", "关联标识:请求贯穿链路的载体与传播规则。"),
        ]),
    "platform/delivery.md": md_template(
        "平台交付基线", "baseline/platform/delivery.md",
        "build / CI / release / version / rollback / artifact",
        [
            ("build", "构建过程与产物定义(入口、产物清单)。"),
            ("CI", "CI 检查集与门槛(逐检查登记:名称与放行语义)。"),
            ("release", "发布流程与审批面(阶段、审批人、放行条件)。"),
            ("version", "版本策略与兼容承诺(版本词形、承诺范围)。"),
            ("rollback", "回滚方案与演练要求(触发条件、步骤、演练频率)。"),
            ("artifact", "制品管理:仓库、保留策略、不可变承诺。"),
        ]),
}

# 分区分母(PRD §3 树 1+7+8+5+4 = 25;清单 entry lane = 播种分区词形)。
LANE_TARGETS = {
    "frontend": ["stack.yaml", "architecture.md", "directory-structure.md",
                 "design-system.md", "state-and-data.md", "api-and-error.md",
                 "quality.md"],
    "backend": ["stack.yaml", "architecture.md", "directory-structure.md",
                "api-contract.md", "data-access.md", "transaction-concurrency.md",
                "integration-runtime.md", "quality.md"],
    "data": ["model.md", "precision-units.md", "migration.md", "lineage.md",
             "quality.md"],
    "platform": ["security.md", "environment.md", "observability.md", "delivery.md"],
}
assert len(LANE_TARGETS["frontend"]) == 7
assert len(LANE_TARGETS["backend"]) == 8
assert len(LANE_TARGETS["data"]) == 5
assert len(LANE_TARGETS["platform"]) == 4

# ======================================================================
# 词形纪律自校验(UNKNOWN 起步;「待填写」零残留;零技术默认词;零阈值数字)
# ======================================================================
# 禁词表 = PRD §7.1 警示句列举词 + B6c PROFILE 卡 includes 组合词 + 常见栈词
# (case-insensitive 词边界;骨架节名词形如 REST/CRAP/a11y/UI 是 PRD 职责词形不入表)。
FORBIDDEN_TECH_PATTERN = re.compile(
    r"\b(vue|react|angular|svelte|emberjs|nuxt|pinia|redux|mobx|rxjs"
    r"|spring|mybatis|jpa|hibernate|struts"
    r"|mysql|postgresql|postgres|mariadb|sqlite|mongodb|redis|memcached|etcd"
    r"|nginx|tomcat|jetty|undertow|iis"
    r"|kubernetes|docker|helm|terraform|ansible"
    r"|java|kotlin|scala|groovy|python|django|flask|rails|laravel|php|ruby|perl"
    r"|typescript|javascript|coffeescript"
    r"|vitest|jest|mocha|karma|playwright|cypress|selenium|puppeteer"
    r"|webpack|rollup|esbuild|parcel|gulp|grunt|eslint|prettier|biome"
    r"|tailwind|bootstrap|antd|mui|chakra|primereact|devextreme|handsontable"
    r"|tanstack|ag-grid|wcag"
    r"|graphql|grpc|protobuf|thrift"
    r"|kafka|rabbitmq|rocketmq|pulsar|activemq"
    r"|elasticsearch|solr|clickhouse|doris|starrocks|minio)\b",
    re.IGNORECASE,
)
FORBIDDEN_PLACEHOLDER_PATTERN = re.compile(r"(待填写|待补|TBD|TODO|FIXME)", re.IGNORECASE)
# 阈值数字默认值面(90%/warning=6/fail=12 类)——起步态零数字百分比。
FORBIDDEN_THRESHOLD_PATTERN = re.compile(r"\d+\s*%")
# 零墙钟(A4)。
WALLCLOCK_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}T")


def assert_word_discipline(rel, text):
    """单件词形纪律 fail-closed(禁词命中即爆——本批红线「零发明内容」)。"""
    hit = FORBIDDEN_TECH_PATTERN.search(text)
    assert hit is None, f"词形纪律违例(技术默认词) {rel}: {hit.group(0) if hit else ''}"
    hit = FORBIDDEN_PLACEHOLDER_PATTERN.search(text)
    assert hit is None, f"词形纪律违例(占位词形,起步值须 UNKNOWN) {rel}: {hit.group(0)}"
    hit = FORBIDDEN_THRESHOLD_PATTERN.search(text)
    assert hit is None, f"词形纪律违例(阈值数字) {rel}: {hit.group(0)}"
    assert not WALLCLOCK_PATTERN.search(text), f"零墙钟违例(A4) {rel}"
    assert "UNKNOWN" in text, f"起步词形缺席 {rel}(全部字段/章节起步值 = UNKNOWN)"


def build_seed_assets():
    """25 件字节 + manifest 文档(107 条原样保留 + B6D 25 条追加)。"""
    assets = {}
    b6d_entries = []
    b6d_targets = []

    # baseline/manifest.yaml(机器锚面——yaml.safe_load 直接可解析性在构建期断言)。
    manifest_yaml = build_manifest_yaml()
    assets["baseline/manifest.yaml"] = manifest_yaml.encode("utf-8")
    # stack.yaml ×2(键集/台账在构建期对账)。
    for lane in ("frontend", "backend"):
        assets[f"baseline/{lane}/stack.yaml"] = STACK_YAML_CONTENT[lane].encode("utf-8")
    # md 模板 ×22。
    for rel, content in MD_TEMPLATES.items():
        assets[f"baseline/{rel}"] = content.encode("utf-8")

    # ---- 构建期自校验(fail-closed)----
    # 1) 分母 25 = 1 + 4 分区计数;md 件 22(25 - manifest - 2 stack)。
    assert len(assets) == 25, f"baseline 分母漂移: {len(assets)}"
    # 2) 逐件词形纪律。
    for rel, data in sorted(assets.items()):
        assert_word_discipline(rel, data.decode("utf-8"))
    # 3) yaml 直接可解析(manifest/stack 三件;frontmatter 缺席的机器证明)。
    for rel in ("baseline/manifest.yaml", "baseline/frontend/stack.yaml",
                "baseline/backend/stack.yaml"):
        doc = yaml.safe_load(assets[rel].decode("utf-8"))
        assert isinstance(doc, dict), f"{rel} 顶层须为映射(单文档直解析)"
    # 4) manifest.yaml 身份/lanes/台账断言。
    mdoc = yaml.safe_load(assets["baseline/manifest.yaml"].decode("utf-8"))
    assert mdoc["id"] == "BASELINE.PROJECT"
    assert mdoc["schema_version"] == 1
    assert mdoc["seed"] == {"tool": "pomaster init", "seed_version": BATCH,
                            "seed_manifest": "package://seeds/manifest.json"}
    assert mdoc["status"] == "CURRENT"
    assert mdoc["lanes"] == {"frontend": "./frontend", "backend": "./backend",
                             "data": "./data", "platform": "./platform"}
    assert mdoc["unknowns"] == unknowns_ledger(), "unknowns 台账 ≠ stack.yaml 键集派生"
    # 5) stack.yaml 键集 == 台账派生;值全 UNKNOWN(键序照 PRD §3 逐字)。
    fe = yaml.safe_load(assets["baseline/frontend/stack.yaml"].decode("utf-8"))
    be = yaml.safe_load(assets["baseline/backend/stack.yaml"].decode("utf-8"))
    assert list(fe.keys()) == FE_STACK_KEYS and list(be.keys()) == BE_STACK_KEYS
    assert all(v == "UNKNOWN" for v in fe.values())
    assert all(v == "UNKNOWN" for v in be.values())
    # 6) md 件节结构:每节带起步值行(UNKNOWN)。
    for rel, data in assets.items():
        if not rel.endswith(".md"):
            continue
        text = data.decode("utf-8")
        n_sections = len([ln for ln in text.splitlines() if ln.startswith("## ")])
        n_unknown = len([ln for ln in text.splitlines() if ln == "- 起步值:UNKNOWN"])
        assert n_sections >= 1 and n_sections == n_unknown, \
            f"{rel} 节/起步值不对账: {n_sections} vs {n_unknown}"

    # ---- manifest 条目(自指指纹 pin)----
    for rel in sorted(assets):
        # lane = 播种分区词形(与 target 同源);baseline 根 manifest 条目取 "baseline"。
        lane = "baseline" if rel == "baseline/manifest.yaml" else rel.split("/")[1]
        data = assets[rel]
        target = f".pomaster/{rel}"
        b6d_targets.append(target)
        b6d_entries.append({
            "target": target,
            "asset": rel,
            "seed_version": BATCH,
            "lane": lane,
            "authoring": "new",
            "source_path": DESIGN_SOURCE,
            "source_sha256": hashlib.sha256(data).hexdigest(),
            "source_bytes": len(data),
            "porting_notes": list(NEW_AUTHORING_NOTES),
        })

    # manifest.json(107 条原样保留 + B6D 追加——单源合并分母 132)。
    old_doc = json.loads(open(MANIFEST_PATH, encoding="utf-8").read())
    assert old_doc["schema"] == MANIFEST_SCHEMA
    old_entries = old_doc["entries"]
    old_batches = old_doc.get("batches") or {}
    kept_names = ("B6B-1", "B6B-2", "B6C")
    kept_batches = {k: list(v) for k, v in old_batches.items() if k in kept_names}
    assert set(kept_batches) == set(kept_names), "磁盘清单缺 B6b/B6c 批名单"
    kept_targets = set()
    for k in kept_names:
        kept_targets |= set(kept_batches[k])
    kept_entries = [e for e in old_entries if e["target"] in kept_targets]
    assert len(kept_entries) == 107, f"B6b/B6c 条目数漂移: {len(kept_entries)}"
    assert not (kept_targets & set(b6d_targets)), "B6D 目标与既有条目撞名"
    batch_targets = dict(kept_batches)
    batch_targets[BATCH] = b6d_targets
    manifest_doc = {
        "schema": MANIFEST_SCHEMA,
        "batch": BATCH,
        "batches": batch_targets,
        "generated_by": "catalog/tools/seed_b6d_baseline.py",
        "denominator": {
            "batch_scope": BATCH_SCOPE,
            "planted": len(kept_entries) + len(b6d_entries),
            "planted_total": PLANTED_TOTAL,
            "batch_new": len(b6d_entries),
        },
        "seed_semantics": "seed-once-missing-only(缺席才写 / 在座零触碰 / marker-free;"
                          "seeds.ts 单一实现;frontmatter 为 PRD §8.2 字段位减 id——"
                          "no-governed-id 默认,播种 spec 是项目可编辑自由文件;B6c 起 "
                          "BE 件含 vendor frontmatter 保留字段、stacks 件落 <slug> 子"
                          "目录——SEEDABLE_STORE_DIRS 显式 slug 登记;B6d 起 baseline "
                          "件为新著纯正文(无 frontmatter——yaml 直接可解析/Owner 填写"
                          "面零噪音;entry authoring=new,pin=资产自身字节指纹,装载器"
                          "自指校验;UNKNOWN 起步,「待填写」词形零移植)",
        "authority_scope": "specs 面 mixed_required_and_advisory;baseline 面 "
                           "project_baseline_template(UNKNOWN 起步模板,非规则面)",
        "entries": kept_entries + b6d_entries,
    }
    return assets, manifest_doc


def write_if_changed(path, data):
    if os.path.isfile(path):
        if open(path, "rb").read() == data:
            return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(data)
    return True


def main():
    built_assets, manifest_doc = build_seed_assets()
    outputs = {}
    for rel, data in built_assets.items():
        outputs[os.path.join(BASELINE_ASSET_DIR, *rel.split("/")[1:])] = data
    outputs[MANIFEST_PATH] = (json.dumps(manifest_doc, ensure_ascii=False, indent=2)
                              + "\n").encode("utf-8")

    if "--verify" in sys.argv:
        drifts = []
        for path, data in outputs.items():
            if not os.path.isfile(path):
                drifts.append({"path": path, "error": "missing"})
            elif open(path, "rb").read() != data:
                drifts.append({"path": path, "error": "bytes_differ"})
        if drifts:
            for d in drifts:
                print("DRIFT:", d)
            sys.exit(1)
        print(f"[seed_b6d_baseline] verify ok: {len(built_assets)} seeds + manifest.json"
              f"(共 {len(manifest_doc['entries'])} 条,字节逐等)")
        return

    changed = 0
    for path, data in sorted(outputs.items()):
        if write_if_changed(path, data):
            changed += 1
            print("WROTE:", os.path.relpath(path, VNEXT))
    print(f"[seed_b6d_baseline] ok: {len(outputs)} outputs({changed} changed / "
          f"{len(outputs) - changed} unchanged);baseline={len(built_assets)} "
          f"manifest_entries={len(manifest_doc['entries'])}"
          f"(B6D +{manifest_doc['denominator']['batch_new']},"
          f"总 {manifest_doc['denominator']['planted']})")
    print("下一步:corepack pnpm test(分母 132 面断言)+ 全量门禁")


if __name__ == "__main__":
    main()
