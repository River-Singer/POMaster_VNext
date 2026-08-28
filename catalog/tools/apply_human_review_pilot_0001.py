# -*- coding: utf-8 -*-
"""pilot-0001 · Human Review 落账脚本（2026-08-28，一次性执行，留档审计）。

依据: docs/catalog-pilot-report.md §8 Human Review Checklist（Owner 授权「按机器建议分布全批」
     ACCEPT 41/ADJUST 24/REJECT 17 预填 + 7 项管线级裁决照建议执行）。
实际逐行实数: ACCEPT 42 / ADJUST 23 / REJECT 17（与报告预填统计差 1，见 meta.human_review_application.note）。

动作:
  1. candidates-draft.json 每卡写入 review 处置字段（disposition/seq/ref [+absorbed_duplicates/duplicate_of/reject_reason]）
  2. ADJUST 内容修改（M1–M4 合并稿 / R-B / R-C=b / R-D / R-E 专名剥离 / R-F 上提 / T1 优先级 / §3.4·M5·M6·M7 互引登记）
  3. 17 条 REJECT 留档 catalog/candidates/rejected.json（带 reject 理由引用报告行 + duplicate_of 指针）
  4. meta 增加 human_review_application 块 + stats 分类计数随 R-F 上提同步

纪律: FROZEN 词表不动（V1–V9 只登记不执行）；逐行手术式编辑，未触碰卡片行 byte-identical；
     物化文件由 catalog/tools/materialize_catalog_pilot.py 从本输入重生成。
"""
import hashlib
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../catalog
DRAFT = os.path.join(ROOT, "candidates", "candidates-draft.json")
REJECTED = os.path.join(ROOT, "candidates", "rejected.json")
REPORT = os.path.join(os.path.dirname(ROOT), "docs", "catalog-pilot-report.md")

SEQ = "pilot-0001"

# ---------------------------------------------------------------- 82 条处置表（逐行 = 报告 §8.1–§8.5）
# (seq, candidate_id, disposition)
DISPOSITIONS = [
    (1, "POLICY.CHG.PRECHANGE_CONSUMER_SCAN", "ACCEPT"),
    (2, "POLICY.CHG.COMPAT_MIGRATION_ROLLBACK", "ADJUST"),
    (3, "POLICY.CHG.SYNC_CONTRACT_DOCS_TESTS", "ACCEPT"),
    (4, "POLICY.CHG.DEPRECATE_BEFORE_DELETE", "ACCEPT"),
    (5, "POLICY.CHG.FIX_AT_ROOT_CAUSE_LEVEL", "ACCEPT"),
    (6, "POLICY.SPEC.METADATA_REQUIRED", "ADJUST"),
    (7, "POLICY.WEB.CHG.CONTROLLED_CHANGE_TRIGGERS", "ACCEPT"),
    (8, "POLICY.SPEC.POST_DEV_BACKFILL_CLASSIFY", "ACCEPT"),
    (9, "POLICY.CHG.NO_SILENT_DEFAULT", "REJECT"),
    (10, "POLICY.CHG.NO_SINGLE_CONSUMER_API", "REJECT"),
    (11, "POLICY.CHG.NO_LOCAL_MASK_FIX", "REJECT"),
    (12, "POLICY.CHG.NO_DELETE_WITHOUT_MIGRATION", "REJECT"),
    (13, "POLICY.SPEC.DRAFT_NOT_BASELINE", "ADJUST"),
    (14, "POLICY.SPEC.DRAFT_NOT_BASELINE_2", "REJECT"),
    (15, "POLICY.CHG.AFFECT_TEMPLATES", "ACCEPT"),
    (16, "POLICY.CHG.STAGED_ROLLOUT", "ACCEPT"),
    (17, "POLICY.TPL.CHG_RECORD", "ADJUST"),
    (18, "GATE.CHG.PRECHANGE_CHECKS", "ADJUST"),
    (19, "KNOWLEDGE.CHG.EXAMPLE_PROP_MIGRATION", "ADJUST"),
    (20, "KNOWLEDGE.FP.CHG.PAGE_LOCAL_PADDING", "ACCEPT"),
    (21, "AUTHORITY.CHG.CHANGE_OWNERS", "ADJUST"),
    (22, "POLICY.CHG.BREAKING_VERSIONING", "ACCEPT"),
    (23, "POLICY.WEB.API.DOMAIN_API_ONLY", "ACCEPT"),
    (24, "POLICY.WEB.API.SINGLE_HTTP_CLIENT", "ACCEPT"),
    (25, "POLICY.WEB.API.TYPED_DOMAIN_NAMING", "ACCEPT"),
    (26, "POLICY.WEB.API.QUERY_CANCEL_STALE_DROP", "ACCEPT"),
    (27, "POLICY.WEB.API.MUTATION_IDEMPOTENCY", "ACCEPT"),
    (28, "POLICY.WEB.API.ERROR_NORMALIZATION", "ACCEPT"),
    (29, "POLICY.WEB.API.TRANSPORT_VS_BUSINESS", "ADJUST"),
    (30, "POLICY.WEB.API.RETRY_DISCIPLINE", "ACCEPT"),
    (31, "POLICY.WEB.API.LATE_RESULT_GUARD", "ACCEPT"),
    (32, "POLICY.WEB.API.TRUSTED_ENDPOINT_SOURCE", "ACCEPT"),
    (33, "POLICY.WEB.API.NO_RAW_FETCH", "REJECT"),
    (34, "POLICY.WEB.API.NO_LOGIC_DUPLICATION", "REJECT"),
    (35, "POLICY.WEB.API.NO_AUTO_RETRY_NONIDEM", "REJECT"),
    (36, "POLICY.WEB.API.NO_ENVELOPE_IN_COMPONENT", "REJECT"),
    (37, "POLICY.WEB.API.NO_NETWORK_OPTIMISM", "ADJUST"),
    (38, "POLICY.WEB.API.GENERATED_CLIENT", "ACCEPT"),
    (39, "POLICY.WEB.API.SINGLE_LOADING_SOURCE", "ACCEPT"),
    (40, "POLICY.TPL.API_FUNCTION_CONTRACT", "ADJUST"),
    (41, "GATE.WEB.API.REQUEST_CHECKS", "ACCEPT"),
    (42, "KNOWLEDGE.WEB.API.EXAMPLE_GET_ENTITY_LIST", "ACCEPT"),
    (43, "KNOWLEDGE.FP.API.PER_PAGE_HTTP_CLIENT", "ACCEPT"),
    (44, "AUTHORITY.WEB.API.REQUEST_OWNERS", "ADJUST"),
    (45, "POLICY.WEB.API.CLIENT_CHANGE_IMPACT", "ADJUST"),
    (46, "POLICY.WEB.GRID.SCHEMA_DRIVEN_SHELL", "ACCEPT"),
    (47, "POLICY.WEB.GRID.COLUMN_SCHEMA_FIELDS", "ACCEPT"),
    (48, "POLICY.WEB.GRID.SERVER_OPS_VIRTUALIZATION", "ADJUST"),
    (49, "POLICY.WEB.GRID.CONFIG_ISOLATION", "ACCEPT"),
    (50, "POLICY.WEB.GRID.WIDTH_FIX_LADDER", "ACCEPT"),
    (51, "POLICY.WEB.GRID.SHELL_CHANGE_MATRIX", "ACCEPT"),
    (52, "POLICY.WEB.GRID.INTERACTION_REGISTRY", "ADJUST"),
    (53, "POLICY.WEB.GRID.NO_TEMPLATE_COLUMNS", "REJECT"),
    (54, "POLICY.WEB.GRID.NO_GLOBAL_WIDTH_CSS", "REJECT"),
    (55, "POLICY.WEB.GRID.NO_SHARED_CONFIG_KEYS", "REJECT"),
    (56, "POLICY.WEB.GRID.NO_FAKE_PAGINATION", "REJECT"),
    (57, "POLICY.WEB.GRID.FREEZE_KEY_COLUMNS", "ACCEPT"),
    (58, "POLICY.WEB.GRID.KEYBOARD_CLIPBOARD", "ACCEPT"),
    (59, "POLICY.TPL.GRID_CONTRACT", "ADJUST"),
    (60, "GATE.WEB.GRID.CHECKS", "ACCEPT"),
    (61, "KNOWLEDGE.WEB.GRID.EXAMPLE_COLUMN_PRESET", "ACCEPT"),
    (62, "KNOWLEDGE.FP.GRID.GLOBAL_TD_WIDTH", "ADJUST"),
    (63, "AUTHORITY.WEB.GRID.OWNERSHIP", "ADJUST"),
    (64, "POLICY.WEB.GRID.SCHEMA_VERSIONING", "ACCEPT"),
    (65, "POLICY.CHG.PRECHANGE_SCAN_BE", "REJECT"),
    (66, "POLICY.CHG.NO_DELETE_NO_MIGRATION_BE", "REJECT"),
    (67, "POLICY.CHG.OBSERVABLE_EVOLUTION", "ACCEPT"),
    (68, "POLICY.TPL.CHG_RECORD_BE", "ADJUST"),
    (69, "GATE.BE.CHG.CONTRACT_CHANGE_CHECKS", "ACCEPT"),
    (70, "KNOWLEDGE.CHG.EXAMPLE_COMPAT_WINDOW", "ADJUST"),
    (71, "KNOWLEDGE.FP.BE.CONTRACT_DRIFT", "ACCEPT"),
    (72, "AUTHORITY.BE.CONTRACT_OWNERSHIP", "ADJUST"),
    (73, "POLICY.CHG.BREAKING_VERSIONING_BE", "REJECT"),
    (74, "POLICY.API.CONTRACT_IMPL_CONSISTENCY", "ACCEPT"),
    (75, "POLICY.API.NO_INFORMAL_CONTRACT", "ACCEPT"),
    (76, "POLICY.API.BACKWARD_COMPAT_DEFAULTS", "ACCEPT"),
    (77, "POLICY.TPL.OPERATION_CONTRACT_FIELDS", "ADJUST"),
    (78, "GATE.BE.API.CONTRACT_CHECKS", "ADJUST"),
    (79, "KNOWLEDGE.API.EXAMPLE_STABLE_ERROR_CODE", "ACCEPT"),
    (80, "KNOWLEDGE.FP.API.FIELD_DRIFT_NO_CONTRACT", "ACCEPT"),
    (81, "AUTHORITY.BE.API_CONTRACT_OWNERSHIP", "ADJUST"),
    (82, "POLICY.API.DELEGATE_TO_CHG_PROTOCOL", "REJECT"),
]

SECTION_OF = {**{n: "8.1" for n in range(1, 23)}, **{n: "8.2" for n in range(23, 46)},
              **{n: "8.3" for n in range(46, 65)}, **{n: "8.4" for n in range(65, 74)},
              **{n: "8.5" for n in range(74, 83)}}

# ---------------------------------------------------------------- ADJUST 内容修改（合并稿/裁决落法）
STATEMENTS = {
    # M1：BE08 六要素（消费方/兼容窗口/迁移/回滚/版本策略）并入单一 UNIVERSAL 正本
    "POLICY.CHG.PRECHANGE_CONSUMER_SCAN":
        "修改被多方依赖的公共能力前，必须先枚举直接与间接消费方及其受影响场景，形成影响面清单；"
        "契约/接口类变更还须同时明确兼容窗口、迁移方案、回滚路径与版本策略，与消费方影响面共同构成完整的前置扫描。",
    # M2：BE08 MUST NOT 并入禁止形态段
    "POLICY.CHG.DEPRECATE_BEFORE_DELETE":
        "公共能力删除前必须先进入 deprecated 状态，并确认已无使用方后方可移除；"
        "禁止形态：无迁移说明不得删除、重命名或改变已发布语义。",
    # M3：BE08 两增量子句（显式审批 + 可执行回退）并入正本
    "POLICY.CHG.BREAKING_VERSIONING":
        "Breaking Change 必须版本化并经显式审批，且附可执行回退方案；"
        "紧急修复可豁免前置流程但不豁免事后补齐影响、通知与迁移记录。",
    # R-D（T2 同批）：转机器派生
    "POLICY.SPEC.METADATA_REQUIRED":
        "各级 spec（项目级/需求级/公共组件/接口）必须具备状态、版本、Owner、更新时间与生效范围元数据；"
        "vNext 信封形态下由 authority/axes 字段结构性派生承载，以机器预检字段存在性为准。",
    # §5 补充要求（Checklist 行 48）：阈值供给声明入正本
    "POLICY.WEB.GRID.SERVER_OPS_VIRTUALIZATION":
        "大数据量表必须采用服务端分页/筛选/排序并启用虚拟化渲染；"
        "『大数据量』阈值参数由 Project Baseline 供给，Catalog 正本不内置默认阈值。",
}

NOTES = {
    "POLICY.CHG.PRECHANGE_CONSUMER_SCAN":
        "pilot-0001 M1 合并执行：BE 08 PRECHANGE_SCAN_BE 六要素（消费方/兼容窗口/迁移/回滚/版本策略）已并入本正本，"
        "作为单一 UNIVERSAL 正本供两 lane 引用；兼容/迁移/回滚细则与 COMPAT_MIGRATION_ROLLBACK 互引",
    "POLICY.CHG.COMPAT_MIGRATION_ROLLBACK":
        "pilot-0001 M1 裁决执行：与正本 POLICY.CHG.PRECHANGE_CONSUMER_SCAN 保持互引"
        "（本条承载兼容窗口/迁移方案/回滚路径细则），不并条不删除（原注『跨车道合并候选：BE 08 MUST 同构』已执行完毕）",
    "POLICY.CHG.SYNC_CONTRACT_DOCS_TESTS":
        "BE 08 反模式（只改实现不更新 OpenAPI/变更记录）即本条缺位的失败形态；"
        "pilot-0001 互引：GATE.BE.API.CONTRACT_CHECKS（同步清单两口径重叠约 60%，口径统一留 Owner 后续裁决，§3.4）、"
        "KNOWLEDGE.FP.BE.CONTRACT_DRIFT（M7 配对）",
    "POLICY.CHG.DEPRECATE_BEFORE_DELETE":
        "pilot-0001 M2 合并执行：BE 08 NO_DELETE_NO_MIGRATION_BE 禁止形态（无迁移说明不得删除/重命名/改变已发布语义）已并入本正本禁止形态段",
    "POLICY.SPEC.METADATA_REQUIRED":
        "pilot-0001 R-D 裁决（T2 同批）：转机器派生——元数据由信封 authority/axes 结构性派生承载，人工重复登记义务解除；"
        "联动 GATE.CHG.PRECHANGE_CHECKS 检查项⑤已改写为机器预检表述",
    "POLICY.SPEC.DRAFT_NOT_BASELINE":
        "带宪法级气质（认识论 fail-closed），保守留 UNIVERSAL_POLICY，是否升 CONSTITUTION 交 Human Review；"
        "pilot-0001 R-B 裁决：维持 UNIVERSAL_POLICY，升格诉求登记挂起（待 vocab-pr V6 十二分类轴落地后由 Owner 专项裁决）",
    "POLICY.CHG.STAGED_ROLLOUT":
        "SHOULD 正确降级 advisory；pilot-0001 T1 precedence 声明：与 POLICY.CHG.BREAKING_VERSIONING 并读时紧急修复豁免优先"
        "（豁免前置流程但不豁免事后补齐），三阶段建议不溯及约束 hotfix",
    "POLICY.TPL.CHG_RECORD":
        "pilot-0001 M4 裁决执行：与 POLICY.TPL.CHG_RECORD_BE 不硬合并，审阅为统一 CHANGE_RECORD 模板的两个 lane profile"
        "（FE profile 承载 SpecStatus/Rollback），互引登记；R-C=b：模板暂留 candidates-draft，"
        "catalog/templates/ 落点与 TEMPLATE. 前缀（V8）挂起至 vocab-pr/GATE 前缀收编后",
    "GATE.CHG.PRECHANGE_CHECKS":
        "GATE. 前缀需 vocab PR（见 meta.vocab_findings）；检查项④⑤可机判；"
        "pilot-0001 R-D 联动：检查项⑤已按 T2 处方改写为『机器预检元数据字段存在』（转机器派生）",
    "KNOWLEDGE.CHG.EXAMPLE_PROP_MIGRATION":
        "源文件自标『内容示例，可删除』；降级 advisory 知识；pilot-0001 M5：与 KNOWLEDGE.CHG.EXAMPLE_COMPAT_WINDOW"
        "（BE 08 同型）互引，合并为一条跨 lane 知识登记为候选，留后续批次",
    "AUTHORITY.CHG.CHANGE_OWNERS":
        "落地为 Authority Map 条目（B7：registry 级粗起步）；AUTHORITY. 前缀已冻结；"
        "pilot-0001 M6：与本批其余 4 条 AUTHORITY.* 结构同型（提供/消费/仲裁三层默认值），"
        "登记 Universal『领域分层所有权默认值』模板上提审阅（5→1+N），留后续批次",
    "POLICY.WEB.API.TRANSPORT_VS_BUSINESS":
        "语义上跨车道通用（任何 client 侧）；pilot-0001 R-F：已上提 UNIVERSAL_POLICY"
        "（判据：语句实体——传输/业务成功判定——可跨 lane 存在；applies_when.lane 维持不动，待 V7 lane 轴登记后再议）",
    "POLICY.WEB.API.RETRY_DISCIPLINE":
        "pilot-0001 R-F 对照样本：维持 LANE_POLICY——含 HTTP 专有词元 Retry-After，上提会失真；"
        "作为上提判据（语句实体是否可跨 lane 存在）的反例保留",
    "POLICY.WEB.API.TRUSTED_ENDPOINT_SOURCE":
        "安全相关；与 BE 12『正式契约=OpenAPI 权威』构成跨车道契约链；pilot-0001 互引：POLICY.API.NO_INFORMAL_CONTRACT",
    "POLICY.WEB.API.NO_NETWORK_OPTIMISM":
        "独有内容（破除隐含假设），非既有条款极性反转；pilot-0001 R-F：已上提 UNIVERSAL_POLICY"
        "（lane 中性：『在线即成功』假设破除在任何 client 侧成立）",
    "POLICY.TPL.API_FUNCTION_CONTRACT":
        "pilot-0001 R-C=b：暂留 candidates-draft；GATE.WEB.API.REQUEST_CHECKS 检查项③原引用本模板的悬空引用已改为"
        "内联字段清单（StatusPolicy/Cancellation/Retry/RetryAfter/Idempotency）；TEMPLATE. 前缀（V8）挂起 vocab-pr",
    "GATE.WEB.API.REQUEST_CHECKS":
        "GATE. 前缀需 vocab PR；pilot-0001 R-C=b 联动：检查项③原『见 POLICY.TPL.API_FUNCTION_CONTRACT 模板』悬空引用已改为内联字段清单",
    "AUTHORITY.WEB.API.REQUEST_OWNERS":
        "AUTHORITY. 前缀已冻结；control-plane 落地；pilot-0001 M6：同型上提审阅登记（见 AUTHORITY.CHG.CHANGE_OWNERS），留后续批次",
    "POLICY.WEB.API.CLIENT_CHANGE_IMPACT":
        "引用 POLICY.CHG.* 族而非自建流程；pilot-0001 ADJUST：M1 合并出单一 UNIVERSAL 正本后，"
        "本条登记为指针条款候选（避免与 CHG 族双写），留后续批次改写",
    "POLICY.WEB.GRID.SERVER_OPS_VIRTUALIZATION":
        "PRD §93.5 自举例：本条应拆两半——Catalog Policy（大数据→服务端操作+虚拟化）+ Project Baseline（阈值与适用表格清单）；"
        "『大数据』判据属项目基线；pilot-0001 ADJUST：正本已显式声明阈值由 Project Baseline 供给（§93.5 拆两半）",
    "POLICY.WEB.GRID.INTERACTION_REGISTRY":
        "opt-in 语义保留：registry 文件不存在时 gate 应报 not-configured 而非静默通过（四态语义，T3——升 MUST 时不得剥离该条件）；"
        "pilot-0001 R-E：po-master 决议编号引用已剥离，不入 global 正本",
    "POLICY.TPL.GRID_CONTRACT":
        "与 M4 GRID.* capability 对象生成直接对接；pilot-0001 R-C=b：暂留 candidates-draft，落点挂起至 vocab-pr V8/GATE 前缀收编后",
    "KNOWLEDGE.FP.GRID.GLOBAL_TD_WIDTH":
        "可与项目侧 CSS 扫描器联动检测全局列宽规则（pilot-0001 R-E：旧包工具专名引用已剥离为通用表述；statement 本身通用，无需降级）",
    "AUTHORITY.WEB.GRID.OWNERSHIP":
        "三层例外结构恰是 vNext『Universal/Project/Lane 分离』的微缩模型；"
        "pilot-0001 M6：同型上提审阅登记（见 AUTHORITY.CHG.CHANGE_OWNERS），留后续批次",
    "POLICY.TPL.CHG_RECORD_BE":
        "pilot-0001 M4 裁决执行：统一 CHANGE_RECORD 模板第二 lane profile（BE profile 承载旧行为/新行为/影响面/兼容判断/验证证据），"
        "互引 POLICY.TPL.CHG_RECORD；R-C=b：暂留 candidates-draft，落点挂起同上",
    "KNOWLEDGE.CHG.EXAMPLE_COMPAT_WINDOW":
        "与 FE06 EXAMPLE_PROP_MIGRATION 同型（跨车道知识同构，Catalog 可合并为一条）；"
        "pilot-0001 M5：互引已建立，合并候选留后续批次",
    "KNOWLEDGE.FP.BE.CONTRACT_DRIFT":
        "B3 failure-pattern 附带池成员；正是 vNext Contract Gate（openapi 对账）的对症场景；"
        "pilot-0001 M7 互引：POLICY.CHG.SYNC_CONTRACT_DOCS_TESTS（本失败模式即其缺位形态）",
    "AUTHORITY.BE.CONTRACT_OWNERSHIP":
        "与 FE06 AUTHORITY.CHG.CHANGE_OWNERS 结构同型（提供/消费/仲裁三方）；"
        "pilot-0001 M6：同型上提审阅登记（5→1+N），留后续批次",
    "POLICY.API.NO_INFORMAL_CONTRACT":
        "与 vocab source_types 禁 ai_invention 的 fail-closed 出处纪律同构；mock_contract 的存在恰为该条款的合规出口；"
        "pilot-0001 互引：POLICY.WEB.API.TRUSTED_ENDPOINT_SOURCE（跨车道契约链）",
    "POLICY.TPL.OPERATION_CONTRACT_FIELDS":
        "与 02 信封 contract_operation payload（request_need/response_need）对接审阅；pilot-0001 R-C=b：暂留 candidates-draft，"
        "落点挂起同上，对接审留后续批次",
    "GATE.BE.API.CONTRACT_CHECKS":
        "GATE. 前缀需 vocab PR；与 M4 Contract Gate vNext 检查集对照；pilot-0001 §3.4 互指：与 POLICY.CHG.SYNC_CONTRACT_DOCS_TESTS "
        "同步清单对象不同、重叠约 60%（契约/示例/测试/文档/通知 vs 契约/实现/生成客户端/测试/handoff），两口径统一留 Owner 后续裁决",
    "AUTHORITY.BE.API_CONTRACT_OWNERSHIP":
        "frontend-only + 已发布外部契约型项目须叠加边界条款（契约提供方为外部系统时不做 owner 审批仪式，改为消费侧确认联调结果）"
        "——防止项目特例固化进 global 正本的反例示范（pilot-0001 R-E：项目专名已改写为通用边界模式描述）；"
        "M6：五条 authority 结构同型，5→1+N 上提审阅登记，留后续批次",
}

# R-F 上提（分类变更）
CLASSIFICATION_CHANGE = {
    "POLICY.WEB.API.TRANSPORT_VS_BUSINESS": "UNIVERSAL_POLICY",
    "POLICY.WEB.API.NO_NETWORK_OPTIMISM": "UNIVERSAL_POLICY",
}

# 正本吸收指针（与 rejected.json duplicate_of 互为镜像）
ABSORBED = {
    "POLICY.CHG.PRECHANGE_CONSUMER_SCAN": ["POLICY.CHG.NO_SINGLE_CONSUMER_API", "POLICY.CHG.PRECHANGE_SCAN_BE"],
    "POLICY.CHG.COMPAT_MIGRATION_ROLLBACK": ["POLICY.CHG.NO_SILENT_DEFAULT"],
    "POLICY.CHG.FIX_AT_ROOT_CAUSE_LEVEL": ["POLICY.CHG.NO_LOCAL_MASK_FIX", "POLICY.CHG.NO_SINGLE_CONSUMER_API"],
    "POLICY.CHG.DEPRECATE_BEFORE_DELETE": ["POLICY.CHG.NO_DELETE_WITHOUT_MIGRATION", "POLICY.CHG.NO_DELETE_NO_MIGRATION_BE"],
    "POLICY.SPEC.DRAFT_NOT_BASELINE": ["POLICY.SPEC.DRAFT_NOT_BASELINE_2"],
    "POLICY.CHG.BREAKING_VERSIONING": ["POLICY.CHG.BREAKING_VERSIONING_BE", "POLICY.API.DELEGATE_TO_CHG_PROTOCOL"],
    "POLICY.WEB.API.DOMAIN_API_ONLY": ["POLICY.WEB.API.NO_RAW_FETCH", "POLICY.WEB.API.NO_ENVELOPE_IN_COMPONENT"],
    "POLICY.WEB.API.SINGLE_HTTP_CLIENT": ["POLICY.WEB.API.NO_RAW_FETCH", "POLICY.WEB.API.NO_LOGIC_DUPLICATION"],
    "POLICY.WEB.API.MUTATION_IDEMPOTENCY": ["POLICY.WEB.API.NO_AUTO_RETRY_NONIDEM"],
    "POLICY.WEB.API.ERROR_NORMALIZATION": ["POLICY.WEB.API.NO_ENVELOPE_IN_COMPONENT"],
    "POLICY.WEB.API.RETRY_DISCIPLINE": ["POLICY.WEB.API.NO_AUTO_RETRY_NONIDEM"],
    "POLICY.WEB.GRID.SCHEMA_DRIVEN_SHELL": ["POLICY.WEB.GRID.NO_TEMPLATE_COLUMNS"],
    "POLICY.WEB.GRID.WIDTH_FIX_LADDER": ["POLICY.WEB.GRID.NO_GLOBAL_WIDTH_CSS"],
    "POLICY.WEB.GRID.CONFIG_ISOLATION": ["POLICY.WEB.GRID.NO_SHARED_CONFIG_KEYS"],
    "POLICY.WEB.GRID.SERVER_OPS_VIRTUALIZATION": ["POLICY.WEB.GRID.NO_FAKE_PAGINATION"],
}

# REJECT 留档元数据：id -> (duplicate_of, secondary_or_None, reject_reason)
DUP_META = {
    "POLICY.CHG.NO_SILENT_DEFAULT": ("POLICY.CHG.COMPAT_MIGRATION_ROLLBACK", None,
                                     "极性反转 DUPLICATE：并入正本禁止形态段（报告 §8.1 #9；§3.1 表）"),
    "POLICY.CHG.NO_SINGLE_CONSUMER_API": ("POLICY.CHG.PRECHANGE_CONSUMER_SCAN", "POLICY.CHG.FIX_AT_ROOT_CAUSE_LEVEL",
                                          "极性反转 DUPLICATE：由正本与根因修复条款联合覆盖（报告 §8.1 #10；§3.1 表）"),
    "POLICY.CHG.NO_LOCAL_MASK_FIX": ("POLICY.CHG.FIX_AT_ROOT_CAUSE_LEVEL", None,
                                     "极性反转 DUPLICATE：正本禁止形态（报告 §8.1 #11；§3.1 表）"),
    "POLICY.CHG.NO_DELETE_WITHOUT_MIGRATION": ("POLICY.CHG.DEPRECATE_BEFORE_DELETE", None,
                                               "极性反转 DUPLICATE：正本 FE 具体形态（报告 §8.1 #12；§3.1 表）"),
    "POLICY.SPEC.DRAFT_NOT_BASELINE_2": ("POLICY.SPEC.DRAFT_NOT_BASELINE", None,
                                         "源内逐字重复实证（源协议 37/38 行同文）（报告 §8.1 #14；§3.1）"),
    "POLICY.WEB.API.NO_RAW_FETCH": ("POLICY.WEB.API.DOMAIN_API_ONLY", "POLICY.WEB.API.SINGLE_HTTP_CLIENT",
                                    "极性反转 DUPLICATE：两正本联合覆盖（报告 §8.2 #33；§3.1 表）"),
    "POLICY.WEB.API.NO_LOGIC_DUPLICATION": ("POLICY.WEB.API.SINGLE_HTTP_CLIENT", None,
                                            "极性反转 DUPLICATE：单点统一的症候表述（报告 §8.2 #34；§3.1 表）"),
    "POLICY.WEB.API.NO_AUTO_RETRY_NONIDEM": ("POLICY.WEB.API.RETRY_DISCIPLINE", "POLICY.WEB.API.MUTATION_IDEMPOTENCY",
                                             "极性反转 DUPLICATE：与幂等条款并读，合并后消除 T4 表面冲突（报告 §8.2 #35；§3.1 表）"),
    "POLICY.WEB.API.NO_ENVELOPE_IN_COMPONENT": ("POLICY.WEB.API.DOMAIN_API_ONLY", "POLICY.WEB.API.ERROR_NORMALIZATION",
                                                "极性反转 DUPLICATE：越层禁止形态（报告 §8.2 #36；§3.1 表）"),
    "POLICY.WEB.GRID.NO_TEMPLATE_COLUMNS": ("POLICY.WEB.GRID.SCHEMA_DRIVEN_SHELL", None,
                                            "极性反转 DUPLICATE：正本禁止形态（报告 §8.3 #53；§3.1 表）"),
    "POLICY.WEB.GRID.NO_GLOBAL_WIDTH_CSS": ("POLICY.WEB.GRID.WIDTH_FIX_LADDER", None,
                                            "极性反转 DUPLICATE：正本禁止形态（报告 §8.3 #54；§3.1 表）"),
    "POLICY.WEB.GRID.NO_SHARED_CONFIG_KEYS": ("POLICY.WEB.GRID.CONFIG_ISOLATION", None,
                                              "极性反转 DUPLICATE：正本禁止形态（报告 §8.3 #55；§3.1 表）"),
    "POLICY.WEB.GRID.NO_FAKE_PAGINATION": ("POLICY.WEB.GRID.SERVER_OPS_VIRTUALIZATION", None,
                                           "极性反转 DUPLICATE：正本禁止形态（报告 §8.3 #56；§3.1 表）"),
    "POLICY.CHG.PRECHANGE_SCAN_BE": ("POLICY.CHG.PRECHANGE_CONSUMER_SCAN", None,
                                     "M1 让位副本：六要素已并入正本（报告 §8.4 #65；§3.2 M1 合并稿）"),
    "POLICY.CHG.NO_DELETE_NO_MIGRATION_BE": ("POLICY.CHG.DEPRECATE_BEFORE_DELETE", None,
                                             "M2 让位：BE 禁止形态已并入正本（报告 §8.4 #66；§3.2 M2 合并稿）"),
    "POLICY.CHG.BREAKING_VERSIONING_BE": ("POLICY.CHG.BREAKING_VERSIONING", None,
                                          "M3 让位：显式审批+可执行回退两子句已并入正本（报告 §8.4 #73；§3.2 M3 合并稿）"),
    "POLICY.API.DELEGATE_TO_CHG_PROTOCOL": ("POLICY.CHG.BREAKING_VERSIONING", None,
                                            "指针条款并入 BREAKING_VERSIONING，无独立语义（报告 §8.5 #82）"),
}

META_APPLICATION = {
    "seq": SEQ,
    "date": "2026-08-28",
    "authority": "Owner 授权：按机器建议分布全批（报告预填 ACCEPT 41 / ADJUST 24 / REJECT 17）+ 7 项管线级裁决照建议执行",
    "applied": {"ACCEPT": 42, "ADJUST": 23, "REJECT": 17},
    "note": "逐行实数 ACCEPT 42 / ADJUST 23 / REJECT 17 与报告预填统计（41/24/17）差 1：预填行自身归类与 §8 逐行表不一致"
            "（与 §3.1/§6.2 口径差 1 注记同类），落账以逐行表为准",
    "pipeline_rulings": {
        "R-A": "跨车道合并 M1–M4 全采纳：M1 六要素并入 PRECHANGE_CONSUMER_SCAN 单一 UNIVERSAL 正本（COMPAT_MIGRATION_ROLLBACK 互引）；"
               "M2 BE 禁止形态并入 DEPRECATE_BEFORE_DELETE；M3 显式审批+可执行回退并入 BREAKING_VERSIONING；"
               "M4 CHG_RECORD/CHG_RECORD_BE 不硬合并，审阅为统一 CHANGE_RECORD 模板两 lane profile",
        "R-B": "留 UNIVERSAL_POLICY：升 CONSTITUTION 诉求登记挂起（报告未给出升格建议，保守处置；待 vocab-pr V6 分类轴落地后 Owner 专项裁决）",
        "R-C": "方案 b：5 条 CONTRACT_TEMPLATE 暂留 candidates-draft；gate.web.api.request_checks 检查项③悬空引用已改为内联字段清单；"
               "catalog/templates/ 落点挂起至 vocab-pr V8/GATE 前缀收编后",
        "R-D": "转机器派生（T2 同批裁决）：METADATA_REQUIRED 改为信封 authority/axes 结构性派生承载 + 机器预检字段存在性；"
               "GATE.CHG.PRECHANGE_CHECKS 检查项⑤同步改写",
        "R-E": "授权改写：GLOBAL_TD_WIDTH / INTERACTION_REGISTRY notes 专名剥离；API_CONTRACT_OWNERSHIP notes 改写为通用边界模式",
        "R-F": "部分采纳：TRANSPORT_VS_BUSINESS 与 NO_NETWORK_OPTIMISM 上提 UNIVERSAL_POLICY；RETRY_DISCIPLINE 维持 LANE（上提边界对照样本）；"
               "AUTHORITY 5 条 M6 合并审登记留后续批次",
        "R-G": "V1–V9 原则批准为 vocab-pr 草案段落，本批只登记不执行（FROZEN 词表未动）",
    },
}


def build_report_lines():
    with open(REPORT, encoding="utf-8") as f:
        return f.read().split("\n")


def locate_row(report_lines, seq, cid):
    needle = "| " + str(seq) + " | " + cid + " |"
    for i, l in enumerate(report_lines, start=1):
        if l.startswith(needle):
            return i
    raise SystemExit("报告行未定位: " + cid)


def main():
    report_lines = build_report_lines()
    seq_by_id = {cid: (seq, disp) for seq, cid, disp in DISPOSITIONS}

    # 校验处置表完整性
    counts = {"ACCEPT": 0, "ADJUST": 0, "REJECT": 0}
    for _, _, d in DISPOSITIONS:
        counts[d] += 1
    assert counts == {"ACCEPT": 42, "ADJUST": 23, "REJECT": 17}, counts
    for cid in ABSORBED:
        assert seq_by_id[cid][1] in ("ACCEPT", "ADJUST"), cid
    for cid in DUP_META:
        assert seq_by_id[cid][1] == "REJECT", cid
    for cid in CLASSIFICATION_CHANGE:
        assert seq_by_id[cid][1] == "ADJUST", cid

    with open(DRAFT, encoding="utf-8") as f:
        raw = f.read()
    lines = raw.split("\n")

    meta_close_idx = None
    out = []
    stats_fixes = 0
    rejected_cards = []
    modified_cards = 0
    seen = set()

    for line in lines:
        stripped = line.strip()
        if line == "  }," and meta_close_idx is None:
            # meta 对象的收尾行（首个出现）
            meta_close_idx = len(out)
        if stripped.startswith("{\"candidate_id\":"):
            had_comma = stripped.endswith(",")
            body = stripped[:-1] if had_comma else stripped
            card = json.loads(body)
            cid = card["candidate_id"]
            assert cid not in seen, cid
            seen.add(cid)
            assert cid in seq_by_id, "处置表缺卡: " + cid
            seq, disp = seq_by_id[cid]
            lineno = locate_row(report_lines, seq, cid)
            ref = "docs/catalog-pilot-report.md:L%d（§%s #%d）" % (lineno, SECTION_OF[seq], seq)

            original_compact = json.dumps(card, ensure_ascii=False)
            assert original_compact == body, "卡片行 round-trip 失败: " + cid

            review = {"disposition": disp, "seq": SEQ, "ref": ref}
            if disp == "REJECT":
                dup, dup2, reason = DUP_META[cid]
                review["reject_reason"] = reason
                review["duplicate_of"] = dup
                if dup2:
                    review["duplicate_of_secondary"] = dup2
            else:
                if cid in ABSORBED:
                    review["absorbed_duplicates"] = ABSORBED[cid]
                if cid in NOTES:
                    card["notes"] = NOTES[cid]
                if cid in STATEMENTS:
                    card["statement_zh"] = STATEMENTS[cid]
                if cid in CLASSIFICATION_CHANGE:
                    card["classification"] = CLASSIFICATION_CHANGE[cid]
            card["review"] = review

            if disp == "REJECT":
                rejected_cards.append(card)
            new_line = "  " + json.dumps(card, ensure_ascii=False) + ("," if had_comma else "")
            if new_line != line:
                modified_cards += 1
            out.append(new_line)
            continue
        # meta 统计计数随 R-F 上提同步（UNIVERSAL 20→22, LANE 25→23）
        if line == '        "UNIVERSAL_POLICY": 20,':
            out.append('        "UNIVERSAL_POLICY": 22,')
            stats_fixes += 1
            continue
        if line == '        "LANE_POLICY": 25,':
            out.append('        "LANE_POLICY": 23,')
            stats_fixes += 1
            continue
        if "本批 UNIVERSAL_POLICY 20 条" in line:
            out.append(line.replace("本批 UNIVERSAL_POLICY 20 条", "本批 UNIVERSAL_POLICY 22 条（含 R-F 上提 2 条）"))
            stats_fixes += 1
            continue
        out.append(line)

    assert len(seen) == 82, len(seen)
    assert len(rejected_cards) == 17
    assert meta_close_idx is not None
    assert stats_fixes == 3, stats_fixes

    # meta 末尾插入 human_review_application 块（文本手术，保持原格式不动）
    blk = json.dumps(META_APPLICATION, ensure_ascii=False, indent=2)
    blk = "    \"human_review_application\": " + blk.replace("\n", "\n    ")  # meta 末位成员，不带尾逗号
    # meta 收尾行 '  },' 之前的 '    ]' 行需要补逗号
    insert_at = meta_close_idx
    assert out[insert_at - 1] == "    ]", out[insert_at - 1]
    out[insert_at - 1] = "    ],"
    out.insert(insert_at, blk)

    new_raw = "\n".join(out)
    data = json.loads(new_raw)  # 解析自检
    cards = [x for x in data if "candidate_id" in x]
    assert len(cards) == 82
    disp_count = {"ACCEPT": 0, "ADJUST": 0, "REJECT": 0}
    for c in cards:
        disp_count[c["review"]["disposition"]] += 1
    assert disp_count == {"ACCEPT": 42, "ADJUST": 23, "REJECT": 17}, disp_count
    # 全量卡可 JSON 序列化（隐含）+ 上提结果核验
    for cid, cls in CLASSIFICATION_CHANGE.items():
        assert next(c for c in cards if c["candidate_id"] == cid)["classification"] == cls

    with open(DRAFT, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_raw)

    rejected_doc = {
        "_record_type": "rejected_archive",
        "seq": SEQ,
        "date": "2026-08-28",
        "generated_by": "catalog/tools/apply_human_review_pilot_0001.py（pilot-0001 Human Review 落账）",
        "basis": "docs/catalog-pilot-report.md §8 Human Review Checklist 逐行 REJECT + §3.1/§3.2 合并表；"
                 "REJECT 语义=驳回独立入册（合并指针维持于正本 review.absorbed_duplicates），非丢弃内容；"
                 "本档案为留档副本，条目仍保留于 candidates-draft.json（含 disposition=REJECT）",
        "count": len(rejected_cards),
        "rejected": rejected_cards,
    }
    rej_data = json.dumps(rejected_doc, ensure_ascii=False, indent=2) + "\n"
    with open(REJECTED, "w", encoding="utf-8", newline="\n") as f:
        f.write(rej_data)

    print(json.dumps({
        "applied": disp_count,
        "cards_modified": modified_cards,
        "rejected_archived": len(rejected_cards),
        "absorbed_pointers": sum(len(v) for v in ABSORBED.values()),
        "stats_fixes": stats_fixes,
        "draft_sha256": "sha256:" + hashlib.sha256(new_raw.encode("utf-8")).hexdigest(),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
