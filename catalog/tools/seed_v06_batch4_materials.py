# -*- coding: utf-8 -*-
"""P-v06 批次 4：RUNTIME 物料落盘（2 份——研究裁剪后的诚实最小集）。

语义全部锚定联网核实报告（.trellis/tasks/09-02-vnext-prd-v06-governed-substrate/
research/runtime-references.md，2026-09-03 opentelemetry.io 官方文档/GitHub API/
12factor/Spring/kustomize/kubectl/Argo CD/OpenFeature/Liquibase 实抓，
OTel 现行语义 21 条 + Environment Parity 7 条全部当日实抓无一条来自训练数据推测）：
- RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY（layer=ARCHETYPE；PRD v0.6 §215 逐字六维）：
  Config=Spring profiles + kustomize base/overlays + kubectl diff（退出码 0/1/>1）、
  Feature Flag=OpenFeature（CNCF incubating）+ feature_flag.* RC 求值属性族、
  DB Schema=Liquibase diff/diff-changelog + Drift Report——三维有实锚；
  Dependency/External Integration 两维如实标注 self-defined（research 差异表 §215 行：
  无单点主流工具，仅 12factor 异构禁令原则——禁伪造「业界标准做法」引用）。
  产出结构内置 severity + ignore_rules（research 建议：漂移噪声治理是 Argo CD 实证
  必要组成——无 ignoreDifferences 则成功 Sync 后立即 OutOfSync，门禁因误报被关掉）。
  deployment.environment 已废弃 → deployment.environment.name 新词形（Stable；
  well-known 值 development/production/staging/test）写进 defaults；旧词形只允许
  出现在 deprecated 改名注记（集成 spec 正则闸以负向先行断言排除新词形——
  落盘前同款自检）。
- RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING（layer=PATTERN；PRD §85-86/§102-§103）：
  OTel 是 Runtime Sensor Provider、POMaster 只建语义 Binding 不复制 APM（§85 逐字
  「POMaster 不替代 APM，只建立语义 Binding。」）；OTLP 四信号 traces/metrics/logs/
  profiles（PRD §85 信号对象清单漏 profiles——差异注记如实落位，研究题 1 差异表行）；
  semconv 按域附 Status（HTTP/DB=Mixed、RPC=Release Candidate、Messaging=Development、
  Service/Service Instance 经实体族 Stable——禁把六域当统一标准）；resource 词形
  service.name/service.version/deployment.environment.name（旧词形 deprecated 差异
  注记）；锚「semconv ≥ 现行版语义」禁硬编码版本号（semconv 月级发版——版本位入
  x-research-anchors provenance，defaults 零版本号，集成 spec 正则闸）；Collector
  双版本线 v1.66.0/v0.160.0 现状记 defaults 之外字段（高频发版，同禁入 defaults）。
- layer 判定注记：ENVIRONMENT_PARITY 落 ARCHETYPE（PRD §215 是「环境集合 + 比对
  维度 + 产出」的标准域形状定义，与批次 3 各原型同为域档位）；OBSERVABILITY_BINDING
  落 PATTERN（PRD §85 Binding 语义 + §86 Adapter 映射是可跨信号域复用的机制模式，
  与批次 2 STATE_ARCHETYPE 八态族机制面落 PATTERN 同判例；七值词形闸
  SUBSTRATE_LAYER_VALUES，PR-0006）。
- 裁定（写进头注的刻意缺席）：不加 SENSOR.OTEL.TRACE 传感器物料——「禁止空壳仪式」
  （PRD v0.6 §10）：catalog sensor 物料的 availability_probe 只许声明式引用既有
  单一事实源面的既有键（toolDetectors/gateAdapters/kernel 三面），OTel 无既有
  探测器/probe 键可引，登记 sensor 即假绿；待真实 implementation 另批走
  vocab/传感器 PR（RUNTIME family 保持派生缺席位，PRD §163 Phase C 逐批落）。
词形纪律（沿批次 3 ADR：物料 core 词面避开既有 repo 级 resolver/gate 断言的
need token；本批 core 词面零豁免——id 词形 RUNTIME_ARCHETYPE.* 不携带既有断言
token，锚位 URL 的 kustomize/master 词形只进 referenceTokens（refOnly 候选降位
alternatives，不动 matches/match_class——resolver-composable 真实 catalog 断言
alternatives 用 toContain 判卷，增量安全），落盘前跑 token 纪律自检，违禁显式爆。
幂等：同输入重跑 byte-stable。
"""
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../catalog
OUT = os.path.join(ROOT, "archetypes")
FETCH = "2026-09-03"

RESEARCH_NOTE = ".trellis/tasks/09-02-vnext-prd-v06-governed-substrate/research/runtime-references.md"
PRD_V06_DOC_REF = "doc/POMaster-vNext-PRD-v0.6-Governed-Engineering-System.md"

materials = {}

# ============================================================
# RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY（PRD v0.6 §215 逐字；layer=ARCHETYPE）
# ============================================================

materials["archetype.runtime.environment_parity.json"] = {
    "id": "RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY",
    "kind": "archetype",
    "layer": "ARCHETYPE",
    "title_zh": "环境一致性原型",
    "summary_zh": "六维环境比对原型（PRD §215 逐字）：Runtime Version/Config/Feature Flag/DB Schema/Dependency/External Integration 逐维比对期望态与实际态，产出结构化 ENVIRONMENT_DRIFT（差异项 + severity + ignore_rules）；与 Perception 的 Wrong Runtime Instance 机制直接结合。",
    "semantic": {
        "responsibility": "把『环境之间是否一致』从印象问题标准化为逐维比对：每维声明事实源与比对方式，差异以结构化漂移产物承载（差异项、严重度、忽略规则三件齐备），而非散落在人脑与聊天记录",
        "when_to_use": "多环境部署（PRD §215 五环境 LOCAL/DEV/TEST/STAGING/PRODUCTION）需要回答『dev 过而 production 挂』类问题时；环境迁移/复制部署/升级前需要预检漂移时",
        "when_not_to_use": "单环境本地开发（无第二环境可比）；运行中服务的遥测观测（走观测语义绑定模式的信号面）；代码版本管理本身（版本比对只是六维之一）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "comparison_dimensions": {
            "runtime_version": {
                "source": "部署视图/镜像 tag；OTel 资源属性（service.version、deployment.id）",
                "status": "verified",
                "wording_anchors": ["service.version"],
                "note": "deployment.id/name/status 为 Development 级词形（非稳定锚，允许变更——research 2026-09-03 实抓）",
            },
            "config": {
                "source": "应用 profile 分层（Spring profiles：spring.profiles.active/default/include/group + spring.config.activate.on-profile）+ k8s 分层渲染（kustomize base/overlays，template-free）+ 比对命令（kubectl diff：live vs would-be applied，恒输出 YAML，退出码 0=无差异/1=有差异/>1=出错）",
                "status": "verified",
                "wording_anchors": [
                    "spring.profiles.active",
                    "spring.profiles.group",
                    "spring.config.activate.on-profile",
                    "kustomize base/overlays",
                    "kubectl diff",
                ],
                "note": "配置项本体承载为 PRD 自有词形（Config Key/Default/Environment Override，§73）；OTel 无配置维度标准词形",
            },
            "feature_flag": {
                "source": "OpenFeature（vendor-agnostic 标准层，CNCF incubating 现状，One SDK any backend）+ OTel 旗标求值属性族（全部 Release Candidate）",
                "status": "verified",
                "wording_anchors": [
                    "feature_flag.key",
                    "feature_flag.provider.name",
                    "feature_flag.result.value",
                    "feature_flag.result.reason",
                ],
                "note": "生命周期卫生项（rollout 完成未删 Flag/无 Owner/永久实验——§74）是 POMaster 增值层非外部标准复制品：引用 OpenFeature 只声明求值语义锚，Owner/Expiry 保持 self-defined",
            },
            "db_schema": {
                "source": "迁移工具 drift 检测（Liquibase：diff 比对单库当前态 vs 上一态、diff-changelog 比对两个目标库并可生成 missing changesets 回填、Drift Report 人可读可接 CI/CD；Drift Report 为 Liquibase Secure 商业版功能，diff/diff-changelog 在 Community 分册）",
                "status": "verified",
                "wording_anchors": ["diff", "diff-changelog", "Drift Report"],
                "note": "Flyway 侧未核实，禁写入（research Caveats 明示）",
            },
            "dependency": {
                "source": "self-defined——无单点主流工具（research 2026-09-03 如实裁定）；12factor 只给原则：backing service 禁 dev/production 异构（resist the urge to use different backing services——即使适配器理论上抹平差异也会造成 dev/staging 过而 production 挂的细微不兼容）",
                "status": "self-defined",
                "wording_anchors": [],
                "note": "禁伪造『业界标准做法』引用（research 差异表 §215 行裁定）",
            },
            "external_integration": {
                "source": "self-defined——无单点主流工具（research 2026-09-03 如实裁定）",
                "status": "self-defined",
                "wording_anchors": [],
                "note": "调用侧韧性/错误映射语义归 ARCHETYPE.BACKEND.EXTERNAL_INTEGRATION（八要素），本维只管跨环境一致性",
            },
        },
        "environment_name": {
            "wording": "deployment.environment.name",
            "level": "Stable",
            "well_known_values": ["development", "production", "staging", "test"],
            "prd_environment_mapping": {
                "LOCAL": "development",
                "DEV": "development",
                "TEST": "test",
                "STAGING": "staging",
                "PRODUCTION": "production",
            },
            "mapping_note": "PRD 五环境词形保留为主键（差异表 §215 行裁定）；OTel 无 LOCAL/DEV——LOCAL/DEV 归并 development 或用 custom value（OTel 明文允许：otherwise, a custom value MAY be used）；TEST↔test 直接映射；环境值不参与 service 唯一性约束（service.name=frontend 在 production 与 staging 仍视为同一 service——semconv 脚注逐字语义）",
        },
        "drift_output": {
            "name": "ENVIRONMENT_DRIFT",
            "binding": "与 Perception 的 Wrong Runtime Instance 机制直接结合（PRD §215 逐字）",
            "shape": "期望态（Git/manifest/would-be applied/changelog）vs 实际态（live/DB）的持续或即时比对 + 结构化差异输出 + 退出码/状态机（kubectl diff 退出码 0/1、Argo CD OutOfSync 状态、Liquibase Drift Report 三者同构——research 跨工具归纳）",
            "fields": ["dimension", "expected", "actual", "severity", "ignore_rules"],
            "severity": {
                "levels": ["CRITICAL", "MAJOR", "MINOR"],
                "rule": "每条差异项必须带严重度：CRITICAL=影响正确性/安全（如 production 缺失 DB Schema 迁移）；MAJOR=行为不一致（如 Flag 求值结果漂移、Config 覆盖缺失）；MINOR=呈现性差异；严重度缺失的差异项不得静默入账",
                "note": "分级词形为 POMaster 自有（self-defined）——业界工具给退出码/状态不给分级，分级是门禁消费所需增量",
            },
            "ignore_rules": {
                "forms": [
                    "field_path（对照 Argo CD jsonPointers / jqPathExpressions）",
                    "manager（对照 Argo CD managedFieldsManagers）",
                    "value_pattern（随机值类——randAlphaNum 型模板函数每次生成不同值）",
                ],
                "noise_sources": [
                    "controller/mutating webhook 改写对象",
                    "HPA 重排 spec.metrics",
                    "随机模板函数每次生成不同值",
                    "manifest 含 K8s 未知字段",
                ],
                "rule": "忽略规则必须显式登记（字段路径 + 理由）；未登记的忽略禁静默——漂移噪声治理是漂移检测的必要组成（Argo CD 实证：应用可在成功 Sync 后立即 OutOfSync，无 ignoreDifferences 则门禁因误报被关掉——research 题 2 关键结论）",
            },
        },
    },
    "deprecated_wording_note": "旧词形 deployment.environment 已废弃（Deprecated：Replaced by deployment.environment.name——semconv registry 部署属性族 2026-09-03 实抓）；本物料全文以新词形 deployment.environment.name 为准，旧词形仅在本注记出现作改名映射锚（读到旧词形按新词形归一并记 drift 事件；semconv 当前有 schema 变换 moratorium 警告——勿做自动 schema 变换依赖）",
    "constraints": [
        "六维中 Dependency 与 External Integration 两维如实标注 self-defined（无单点主流工具）——禁伪造『业界标准做法』引用",
        "环境名只写新词形 deployment.environment.name；旧词形仅限 deprecated 注记（集成 spec 正则闸 deployment\\.environment(?!\\.name)）",
        "四维实锚事实源引用与版本位以 x-research-anchors provenance 为准——物料正文不硬编码工具版本号（工具版本随 release 漂移，语义锚不随）",
    ],
    "x-research-anchors": {
        "note": "六维比对语义为 PRD §215 逐字；六维事实源锚（Spring profiles/kustomize/kubectl diff/Argo CD ignoreDifferences/OpenFeature/Liquibase drift）与 Dependency/External Integration 两维 self-defined 裁定均出自 runtime-references.md 题 2（2026-09-03 官方站点实抓）；deployment.environment.name 词形与 well-known 四值出自 semconv deployment 属性族同日实抓；severity+ignore_rules 内置为 research 题 2 落点建议采纳",
        "sources": [
            {"url": RESEARCH_NOTE + " 题 2", "fetched": FETCH},
            {"url": "https://12factor.net/dev-prod-parity", "fetched": FETCH},
            {"url": "https://docs.spring.io/spring-boot/reference/features/profiles.html", "fetched": FETCH},
            {"url": "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/README.md", "fetched": FETCH},
            {"url": "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_diff/", "fetched": FETCH},
            {"url": "https://argo-cd.readthedocs.io/en/stable/user-guide/diffing/", "fetched": FETCH},
            {"url": "https://openfeature.dev/", "fetched": FETCH},
            {"url": "https://docs.liquibase.com/secure/user-guide-5-2-2/what-is-drift-detection", "fetched": FETCH},
            {"url": "https://opentelemetry.io/docs/specs/semconv/registry/attributes/deployment/", "fetched": FETCH},
            {"url": PRD_V06_DOC_REF + " §215", "fetched": FETCH},
        ],
    },
}

# ============================================================
# RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING（PRD §85-86/§102-§103；layer=PATTERN）
# ============================================================

materials["archetype.runtime.observability_binding.json"] = {
    "id": "RUNTIME_ARCHETYPE.OBSERVABILITY_BINDING",
    "kind": "archetype",
    "layer": "PATTERN",
    "title_zh": "观测语义绑定模式",
    "summary_zh": "观测语义绑定模式（PRD §85/§86/§102-§103）：OTel 是 Runtime Sensor Provider，POMaster 不替代 APM 只建立语义 Binding——信号对象、资源身份词形、按域成熟度三面绑定到 Runtime Graph，遥测本体留在 OTel/APM 侧。",
    "semantic": {
        "responsibility": "把 POMaster 对象系与 OTel 语义约定的对应关系单点化：每条绑定声明词形锚与成熟度档位（Stable/Release Candidate/Development/Mixed），禁把不同域当成统一标准引用——绑定是语义映射不是复制",
        "when_to_use": "需要把 Runtime Graph/Deployment View 与遥测信号对齐时（§72 Version→service.version 一类映射）；§103 Runtime Sensor（SENSOR.OTEL.TRACE/SENSOR.OTEL.METRIC 词形锚）的语义消费面",
        "when_not_to_use": "自建 APM/自研语义约定（OTel 是 Provider，POMaster 不复制其语义）；具体后端查询语句与仪表盘配置（APM 侧自有面）；采集器部署与采样策略运维（OTel Collector 自有面）",
    },
    "composition": {"requires": [], "optional": [], "incompatible": []},
    "defaults": {
        "signals": {
            "bound": ["traces", "metrics", "logs", "profiles"],
            "wording_source": "OTLP 四信号（Collector component-stability 文档明文列 profiles；OTel spec 侧有 Profiles Mappings/Pprof Profiles Data Format 章节——research 题 1 实抓）",
            "gap_note": "PRD §85 信号对象清单（Trace/Metric/Log Event/Correlation ID/Span/Alert/Dashboard/SLO）漏 profiles——差异注记如实落位，Profile 对象待对象系增补（不私扩）",
        },
        "domain_status": {
            "http": "Mixed",
            "rpc": "Release Candidate",
            "database": "Mixed",
            "messaging": "Development",
            "service": "Stable（实体 service/service.namespace/service.instance——§86 Service/Service Instance 映射经实体族成立）",
            "service_instance": "Stable（service.instance.id 与 service.namespace,service.name 组成全局唯一三元组）",
            "rule": "逐域附 Status 禁当统一标准——PRD §86 六个映射域成熟度不齐（research 2026-09-03 逐域 index.md 自述实抓：HTTP Mixed/Database Mixed/RPC Release Candidate/Messaging Development/FaaS Development）",
        },
        "resource_identity": {
            "service.name": "Stable——逻辑服务名；未指定时 SDK 回落 unknown_service:<进程名>；水平扩缩全实例 MUST 同值",
            "service.version": "Stable——服务组件版本串（格式不定义：2.0.0 或 git SHA 皆可）",
            "deployment.environment.name": "Stable——部署环境名（well-known 值 development/production/staging/test）；不参与 service 唯一性约束",
            "service.namespace": "Stable——命名空间（namespace 内 name 唯一）",
            "service.instance.id": "Stable——全局唯一三元组成员；Collector 无法无歧义确定实例时不应代设（如按 pod.name 生成大概率错）",
        },
        "maturity_anchor": "semconv ≥ 现行版语义（禁硬编码版本号——semconv 月级发版，版本位入 x-research-anchors provenance；语义判卷以 registry attributes/entities 的 index.md 机器视图为准，/llms.txt 总索引可直接消费）",
        "binding_form": "词形锚 + 成熟度档位 + 消费位三件式：每条绑定声明 OTel 词形、其 Status、以及 POMaster 侧消费对象（Runtime Graph 节点/Deployment View 字段）",
    },
    "binding_rule": "OTel 是 Runtime Sensor Provider：POMaster 只建立语义 Binding，不复制 APM（PRD §85 逐字：POMaster 不替代 APM，只建立语义 Binding。）——semconv 只定义属性/命名契约，观测本体（采集/存储/查询/告警）留在 OTel/APM 侧（研究题 1 差异表：与 OTel 定位一致，无冲突）",
    "deprecated_wording_note": "resource 词形改名锚：deployment.environment（旧词形）已废弃（Deprecated：Replaced by deployment.environment.name——semconv deployment 属性族 2026-09-03 实抓）；本物料全文以新词形为准，旧词形仅在本注记出现",
    "collector_status": "Collector 双版本线 v1.66.0/v0.160.0（2026-09-02 release，高频发版；组件标 1.x 要求至少一个 signal stable——traces/metrics/logs/profiles 各自独立稳定级，Development/Alpha/Beta/Stable/Deprecated/Unmaintained 阶梯）；代码基基于 OTLP protocol v1.10.0（Stable）构建——版本位随 provenance 更新，禁硬编码进 defaults",
    "constraints": [
        "§103 SENSOR.OTEL.TRACE/SENSOR.OTEL.METRIC 为 Runtime Sensor 词形锚（登记面）——本物料是语义 Binding 不登记 sensor 本体：OTel 无既有探测器/availability_probe 键可引，登记即假绿（『禁止空壳仪式』§10；真实 implementation 另批走 vocab/传感器 PR）",
        "Config Hash/Migration Version/Traffic/Health 无 OTel 标准词形（research 差异表 §72 行）——Deployment View 后四项为 POMaster 自有词形（self-defined），禁误挂 semconv 锚",
        "schema 变换引用须带 moratorium 意识（官方 Warning：暂停依赖 schema 变换实现遥测稳定性）——改名类变更以 schema 文件描述并发布，但消费面不做自动变换依赖；改名映射是单向注记不是自动变换（旧词形→新词形，见 deprecated 注记）",
        "semconv 稳定性契约只保证属性 key/实体引用/span name 与 kind/metric name 与 unit/well-known 既有值——属性值本身、span links、metric description 不在保证范围（versioning-and-stability 官方原文语义）",
    ],
    "x-research-anchors": {
        "note": "四信号（traces/metrics/logs/profiles）/逐域 Status/resource 词形与稳定级/Collector 双版本线均出自 runtime-references.md 题 1（2026-09-03 opentelemetry.io 官方文档 + GitHub API 实抓）；semconv 文档站与仓库 latest release 当时版本位 1.44.0（2026-08-04 发布）、Collector 当时 v0.160.0（2026-09-02 发布）记录于本注记作 provenance——按研究裁定禁入 defaults 硬编码（月级发版）；『POMaster 不替代 APM 只建立语义 Binding』为 PRD §85 逐字，与 OTel 定位无冲突（差异表 §85 行）",
        "sources": [
            {"url": RESEARCH_NOTE + " 题 1", "fetched": FETCH},
            {"url": "https://opentelemetry.io/docs/specs/semconv/", "fetched": FETCH},
            {"url": "https://opentelemetry.io/docs/specs/otel/document-status/", "fetched": FETCH},
            {"url": "https://opentelemetry.io/docs/specs/otel/versioning-and-stability/", "fetched": FETCH},
            {"url": "https://opentelemetry.io/docs/specs/semconv/registry/attributes/service/index.md", "fetched": FETCH},
            {"url": "https://opentelemetry.io/docs/specs/semconv/registry/attributes/deployment/", "fetched": FETCH},
            {"url": "https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector/main/docs/component-stability.md", "fetched": FETCH},
            {"url": PRD_V06_DOC_REF + " §85/§86/§102/§103", "fetched": FETCH},
        ],
    },
}

# ============================================================
# 词形纪律自检（落盘前硬闸；knowledgeQueryTokens 同法镜像——批次 3 同款）
# ============================================================

# core 词面 = title_zh + summary_zh + semantic 三槽（id 除外——本批 id 词形零豁免，
# RUNTIME_ARCHETYPE.* 不携带既有断言 need token，见模块头 ADR）。
FORBIDDEN_CORE_TOKENS = {
    # 英文（lowercase token 精确等值）
    "crud", "create", "update", "delete", "button", "select", "combobox",
    "searchable", "master", "data", "supplier", "query", "color", "antd",
    "grid", "table", "page",
    # CJK（整段 run 精确等值）
    "资源", "按钮", "动作", "触发", "主数据", "供应商管理页", "可搜索车型选择器",
    "表格", "网格", "颜色",
}


def core_tokens(body):
    text = " ".join(
        [
            body["title_zh"],
            body["summary_zh"],
            body.get("semantic", {}).get("responsibility") or "",
            body.get("semantic", {}).get("when_to_use") or "",
            body.get("semantic", {}).get("when_not_to_use") or "",
        ]
    )
    # knowledgeQueryTokens 同法镜像：lowercase 后按非字母数字/非 CJK 字符切段。
    return [t for t in re.split(r"[^a-z0-9一-鿿]+", text.lower()) if t]


def token_discipline_check():
    """落盘前自检：core 词面禁词（违禁显式爆，禁静默落盘）。"""
    violations = []
    for name, body in materials.items():
        tokens = set(core_tokens(body))
        hit = sorted(tokens & FORBIDDEN_CORE_TOKENS)
        if hit:
            violations.append(f"{name} ({body['id']}): {hit}")
    if violations:
        raise SystemExit(
            "[seed-batch4] 词形纪律自检失败（core 词面命中既有断言 need token）：\n  - "
            + "\n  - ".join(violations)
        )


def deprecated_wording_check():
    """落盘前自检：旧词形 deployment.environment 只允许出现在 deprecated 注记
    （正则同集成 spec：deployment\\.environment(?!\\.name)——负向先行断言）。"""
    pattern = re.compile(r"deployment\.environment(?!\.name)")
    violations = []
    for name, body in materials.items():
        rest = {k: v for k, v in body.items() if k != "deprecated_wording_note"}
        if pattern.search(json.dumps(rest, ensure_ascii=False)):
            violations.append(f"{name} ({body['id']}): 旧词形泄漏到 deprecated 注记之外")
        note = body.get("deprecated_wording_note", "")
        if "deployment.environment" not in note:
            violations.append(f"{name} ({body['id']}): deprecated 注记缺旧词形改名锚")
    if violations:
        raise SystemExit(
            "[seed-batch4] 旧词形纪律自检失败：\n  - " + "\n  - ".join(violations)
        )


def defaults_version_free_check():
    """落盘前自检：defaults 零硬编码工具版本号（semconv 月级发版——版本位只在
    锚位注记/Collector 现状字段；正则同集成 spec）。"""
    pattern = re.compile(r"1\.44|1\.60|v1\.66|v0\.160|1\.10\.0")
    violations = []
    for name, body in materials.items():
        defaults_json = json.dumps(body.get("defaults", {}), ensure_ascii=False)
        if pattern.search(defaults_json):
            violations.append(f"{name} ({body['id']}): defaults 疑似硬编码版本号")
    if violations:
        raise SystemExit(
            "[seed-batch4] defaults 版本号纪律自检失败：\n  - " + "\n  - ".join(violations)
        )


def main():
    token_discipline_check()
    deprecated_wording_check()
    defaults_version_free_check()
    os.makedirs(OUT, exist_ok=True)
    for name, body in materials.items():
        path = os.path.join(OUT, name)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(body, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("wrote", name, "id=", body["id"])
    print(f"total: {len(materials)} materials")


if __name__ == "__main__":
    main()
