<!-- view: known-debt | generator: corpus/master/tools/build_human_views.py | batch_code: VIEW-M5 | inputs_fingerprint: c8c7990da029d2d2a60021305bfe3590e9405e0e241caa211f7f3a111e435fa9 -->

# known-debt

> 受众：Owner 与维护者——直面「系统现在欠什么、哪些绿灯是带盲区的、哪些事挂在 Owner 案头」。本视图的价值就在不粉饰。
>
> 本文件是 corpus truth 语料的**纯派生投影**（M5 Human View），不是事实源：禁止手工编辑（编辑无效，重建即覆盖）；不写 store、不产生治理事实、不进 truth-index。谱系约定：行内 citation 记号（`[SRC:` + 引用 + `]`），文法四形态见 `docs/p9-human-view-and-l5-contract.md` §1.5；「语料未覆盖」为显式留白（缺席 ≠ 通过）。
>
> 重建：`python corpus/master/tools/build_human_views.py --check`（同输入双跑 byte-stable；inputs_fingerprint=c8c7990da029d2d2a60021305bfe3590e9405e0e241caa211f7f3a111e435fa9）。

## 1. 阅读须知

本视图如实收录语料中的 gate 失败、盲区、悬空登记、mock/虚假 attest 与 Owner 悬案；机器 verdict 是事实，语义注记逐字转引语料（引号内为原文），不自创裁决。禁止把 failed 洗成中性表述、禁止省略 escape_ratio、禁止把 PROPOSED 写成已生效。四态语义与「不报绿」纪律的批次声明位：[SRC: MIG-B1/README.md#Gate四态分布]。

## 2. Gate 失败台账（13 份）

逐份如实登记（violations/applicable 为各 run counts 实测）：

| grn | gate | 检查 | violations/applicable | 谱系 |
|---|---|---|---|---|
| GRN-405 | CHANGE_GOVERNANCE | MIG-B1-aggregate | 107/265 | [SRC: MIG-B1/gate-runs/change-governance/GTR-MIG-B1-aggregate.json@GRN-405] |
| GRN-401 | CHANGE_GOVERNANCE | MIG-B1-issue-evidence-chain | 107/107 | [SRC: MIG-B1/gate-runs/change-governance/GTR-MIG-B1-issue-evidence-chain.json@GRN-401] |
| GRN-0001 | CONTRACT | MIG-B1-01-openapi-operation-ref-exists | 17/117 | [SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-01-openapi-operation-ref-exists.json@GRN-0001] |
| GRN-0002 | CONTRACT | MIG-B1-02-mock-endpoint-declaration | 6/11 | [SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-02-mock-endpoint-declaration.json@GRN-0002] |
| GRN-0003 | CONTRACT | MIG-B1-03-implementation-honesty | 32/121 | [SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-03-implementation-honesty.json@GRN-0003] |
| GRN-0006 | CONTRACT | MIG-B1-06-aggregate | 55/264 | [SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-06-aggregate.json@GRN-0006] |
| GRN-4105 | GRID | MIG-B1-grid | 8/114 | [SRC: MIG-B1/gate-runs/grid/AGG-MIG-B1-grid.json@GRN-4105] |
| GRN-4101 | GRID | MIG-B1-grid-01-forbidden-direct-import | 6/68 | [SRC: MIG-B1/gate-runs/grid/GTR-MIG-B1-grid-01-forbidden-direct-import.json@GRN-4101] |
| GRN-4204 | PAGE_COMPOSITION | MIG-B2-page-composition | 9/89 | [SRC: MIG-B2/gate-runs/page-composition/AGG-MIG-B2-page-composition.json@GRN-4204] |
| GRN-4201 | PAGE_COMPOSITION | MIG-B2-page-composition-01-readiness-attest-cross-check | 1/24 | [SRC: MIG-B2/gate-runs/page-composition/GTR-MIG-B2-page-composition-01-readiness-attest-cross-check.json@GRN-4201] |
| GRN-4203 | PAGE_COMPOSITION | MIG-B2-page-composition-03-navigation-consistency | 8/21 | [SRC: MIG-B2/gate-runs/page-composition/GTR-MIG-B2-page-composition-03-navigation-consistency.json@GRN-4203] |
| GRN-4504 | STATE_INTEGRITY | MIG-B3-state-integrity | 49/1008 | [SRC: MIG-B3/gate-runs/state-integrity/AGG-MIG-B3-state-integrity.json@GRN-4504] |
| GRN-4503 | STATE_INTEGRITY | MIG-B3-state-integrity-03-state-machine-references | 49/490 | [SRC: MIG-B3/gate-runs/state-integrity/GTR-MIG-B3-state-integrity-03-state-machine-references.json@GRN-4503] |

### 2.1 契约族（CONTRACT）

- **C-01 openapi-operation-ref-exists（GRN-0001，failed）**：OP-* 遗留 operationId 债务 17 violations / 117 适用（分母=带 payload.operation_id 的 contract_operation 对象；外部权威=已发布基线 190 operationIds）。[SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-01-openapi-operation-ref-exists.json@GRN-0001]
  同源悬案：MIG-B1/C-01（operation_id 词形三态分裂，human_decision=PENDING）。[SRC: MIG-B1/classification-ledger.yaml#conflicts_pending_owner]
- **C-02 mock-endpoint-declaration（GRN-0002，failed）**：mock 端点不在已发布基线端点集 6 violations / 11 宿主对象（宿主清单见 §5）。[SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-02-mock-endpoint-declaration.json@GRN-0002]
- **C-03 implementation-honesty（GRN-0003，failed）**：实现诚实 32 violations / 121 适用（real 95 + mock_unverified 26 全数命中）；盲区 escape_ratio=0.5207（scanned 121 / produced 58）。[SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-03-implementation-honesty.json@GRN-0003]
- CONTRACT 聚合 GRN-0006 failed（worst-of）；主题盲区 escape_ratio=0.2424。[SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-06-aggregate.json@GRN-0006]

### 2.2 网格族（GRID）

- **G-01 forbidden-direct-import（GRN-4101，failed）**：6 violations / 422 扫描。语义注记（逐字转引）：「grid G1 的 6 处直接 import 违例与设计稿 08-27 实测「零违例」相悖——**待查源仓漂移 vs 扫描器口径**」[SRC: MIG-B1/gate-runs/grid/GTR-MIG-B1-grid-01-forbidden-direct-import.json@GRN-4101] + [SRC: MIG-B1/README.md#语义注记（诚实分账）@GRN-4101]
- GRID 聚合 GRN-4105 failed（worst-of）。[SRC: MIG-B1/gate-runs/grid/AGG-MIG-B1-grid.json@GRN-4105]

### 2.3 变更治理族（CHANGE_GOVERNANCE）

- **issue-evidence-chain（GRN-401，failed）**：107/107（机器事实：107 条 issue 全部无关闭证据）。语义注记（逐字转引，机器事实与语义注记两半并陈不互相吞没）：「106 条是 OPEN issue「尚未有关闭证据」的天然态（evidence 随关闭产生）——这是 **gate recipe 语义待精化**（应区分 OPEN-no-evidence-yet vs CLOSED-without-evidence），不是 106 个项目缺陷；WONT_FIX 1 条无关闭证据是真发现。」[SRC: MIG-B1/gate-runs/change-governance/GTR-MIG-B1-issue-evidence-chain.json@GRN-401] + [SRC: MIG-B1/README.md#语义注记（诚实分账）@GRN-401]
- CHANGE_GOVERNANCE 聚合 GRN-405 failed（worst-of）。[SRC: MIG-B1/gate-runs/change-governance/GTR-MIG-B1-aggregate.json@GRN-405]

### 2.4 页面组合族（PAGE_COMPOSITION）

- **readiness-attest-cross-check（GRN-4201，failed）**：虚假 attest 实锤 1 条 / 24 attest 记录（attest 自报值永远不可单证判定；纠正痕迹逐字保留于 readiness 对象 notes，见 §5）。[SRC: MIG-B2/gate-runs/page-composition/GTR-MIG-B2-page-composition-01-readiness-attest-cross-check.json@GRN-4201]
- navigation-consistency（GRN-4203，failed）：transition 端点页面不在 registry 8 / 21。[SRC: MIG-B2/gate-runs/page-composition/GTR-MIG-B2-page-composition-03-navigation-consistency.json@GRN-4203]
- PAGE_COMPOSITION 聚合 GRN-4204 failed（worst-of）。[SRC: MIG-B2/gate-runs/page-composition/AGG-MIG-B2-page-composition.json@GRN-4204]

### 2.5 状态完整性族（STATE_INTEGRITY）

- **state-machine-references（GRN-4503，failed）**：49 violations / 490 引用（跨批悬空：零枚举行页面 6 页 39 条 + 页在册但值无枚举行 10 条）。[SRC: MIG-B3/gate-runs/state-integrity/GTR-MIG-B3-state-integrity-03-state-machine-references.json@GRN-4503]
  语义注记（逐字转引）：「GRN-4503 的 49 条悬空是 gate 抓出的真发现，转呈 Owner（MIG-B3/C-01 位），非本批转录违例」[SRC: MIG-B3/README.md#语义注记（诚实分账）@GRN-4503]
- STATE_INTEGRITY 聚合 GRN-4504 failed（worst-of）。[SRC: MIG-B3/gate-runs/state-integrity/AGG-MIG-B3-state-integrity.json@GRN-4504]

## 3. 盲区台账（8 skipped_blindspot + 1 not_configured）

盲区是诚实终局而非通过：逐份带 escape_ratio 与 scanned/produced（not_configured 无盲区指标，缺席语义 = 前提缺失 ≠ passed）：

| grn | gate | verdict | escape_ratio | scanned/produced | 检查 | 谱系 |
|---|---|---|---|---|---|---|
| GRN-403 | CHANGE_GOVERNANCE | skipped_blindspot | 0.0526 | 19/18 | MIG-B1-decision-machine-readability | [SRC: MIG-B1/gate-runs/change-governance/GTR-MIG-B1-decision-machine-readability.json@GRN-403] |
| GRN-0004 | CONTRACT | skipped_blindspot | 0.0714 | 14/13 | MIG-B1-04-error-mapping-chain-complete | [SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-04-error-mapping-chain-complete.json@GRN-0004] |
| GRN-4102 | GRID | skipped_blindspot | 0.9022 | 409/40 | MIG-B1-grid-02-grid-usage-binding | [SRC: MIG-B1/gate-runs/grid/GTR-MIG-B1-grid-02-grid-usage-binding.json@GRN-4102] |
| GRN-4104 | GRID | not_configured | 0 | 290/290 | MIG-B1-grid-04-alternative-engine-lock | [SRC: MIG-B1/gate-runs/grid/GTR-MIG-B1-grid-04-alternative-engine-lock.json@GRN-4104] |
| GRN-4304 | BLUEPRINT | skipped_blindspot | 0.0 | 83/83 | MIG-B2-blueprint | [SRC: MIG-B2/gate-runs/blueprint/AGG-MIG-B2-blueprint.json@GRN-4304] |
| GRN-4303 | BLUEPRINT | skipped_blindspot | 0.871795 | 5/5 | MIG-B2-blueprint-03-prose-fidelity-sampling | [SRC: MIG-B2/gate-runs/blueprint/GTR-MIG-B2-blueprint-03-prose-fidelity-sampling.json@GRN-4303] |
| GRN-4403 | CALCULATION_BINDING | skipped_blindspot | 0.75 | 236/59 | MIG-B3-calculation | [SRC: MIG-B3/gate-runs/calculation/AGG-MIG-B3-calculation.json@GRN-4403] |
| GRN-4402 | CALCULATION_BINDING | skipped_blindspot | 1 | 177/0 | MIG-B3-calculation-02-formula-source-anchor | [SRC: MIG-B3/gate-runs/calculation/GTR-MIG-B3-calculation-02-formula-source-anchor.json@GRN-4402] |
| GRN-4502 | STATE_INTEGRITY | skipped_blindspot | 0.111111 | 63/56 | MIG-B3-state-integrity-02-negative-constraint-anchor | [SRC: MIG-B3/gate-runs/state-integrity/GTR-MIG-B3-state-integrity-02-negative-constraint-anchor.json@GRN-4502] |

要点：

- C-04 error-mapping-chain：.ts 字面量形态不可达（VTS 逃逸先例），escape_ratio=0.0714。[SRC: MIG-B1/gate-runs/contract/GTR-MIG-B1-04-error-mapping-chain-complete.json@GRN-0004]
- G-02 usage-binding：escape_ratio=0.9022（锚文件头注 canonical/alias 词形盲区）。[SRC: MIG-B1/gate-runs/grid/GTR-MIG-B1-grid-02-grid-usage-binding.json@GRN-4102]
- G-04 alternative-engine-lock not_configured：FORBIDDEN_WITHOUT_ACR 语义对象零命中，检查前提缺失 → 终局性诚实结论而非通过。[SRC: MIG-B1/gate-runs/grid/GTR-MIG-B1-grid-04-alternative-engine-lock.json@GRN-4104]
- decision-machine-readability：裁决散文不可机读（18 对象化可判 + 1 散文回执不可枚举），escape_ratio=0.0526。[SRC: MIG-B1/gate-runs/change-governance/GTR-MIG-B1-decision-machine-readability.json@GRN-403]
- B2 blueprint prose-fidelity sampling：抽样 5/39（unsampled 34），escape_ratio=0.871795。[SRC: MIG-B2/gate-runs/blueprint/GTR-MIG-B2-blueprint-03-prose-fidelity-sampling.json@GRN-4303]
- B3 calculation formula-source-anchor：177/177 引用发射全未机判（FIELD 对象层覆盖 9/785 + external 词形漂移），escape_ratio=1。[SRC: MIG-B3/gate-runs/calculation/GTR-MIG-B3-calculation-02-formula-source-anchor.json@GRN-4402]
- B3 negative-constraint-anchor：无锚且无人工审查声明 7 条/63，机械不可判卷，escape_ratio=0.111111。[SRC: MIG-B3/gate-runs/state-integrity/GTR-MIG-B3-state-integrity-02-negative-constraint-anchor.json@GRN-4502]

## 4. 悬空登记台账

batch-3 三份 pending 登记（HUMAN_CONFIRM_REQUIRED，只登记不改名，禁机械择一；登记形态声明位 [SRC: MIG-B3/pending-registrations.business-rule-registry.yaml#document_kind]）：

- business-rule：已转录 241 + 悬空 34 = 源 275（恒等式：transcribed 241 + registered pending 34 == source 275 (hard constraint 4 three-bucket identity)）。[SRC: MIG-B3/pending-registrations.business-rule-registry.yaml#denominator.identity]
- field-semantic：悬空 776/785（tier mechanical_normalization_possible 237 / mechanical_naming_impossible 539 / 已转录 9）。[SRC: MIG-B3/field-semantic-pending-registration.yaml#denominator.identity]
- state-ownership：variables 悬空 837/854（237+539+61 / 已转录 17）。[SRC: MIG-B3/state-ownership-pending-registration.yaml#denominator.identity]
- machine 侧 STATE-* 真缺口 9 条（无矩阵定义体，不虚构所有权对象）：STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-DIRTY、STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-INVALID、STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-PRISTINE、STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-SUBMITTING、STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-EDIT-VALIDATING、STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-MODE-CREATE、STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-MODE-EDIT、STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-MODE-READ-ONLY、STATE-PAGE-TASK-STEP-MANAGE-USER-ROLE-MODE-VIEW。[SRC: MIG-B3/state-ownership-pending-registration.yaml#c01.machine_side_true_gaps] + [SRC: MIG-B3/state-ownership-pending-registration.yaml#c01.machine_side_true_gaps_note]
  准入门总登记（逐字转引）：「…field-semantic 776（237 页段连字符可机械归一+539 中文段不可）· variables 837（237+539+61 API_REQ 数字开头段）· rules 34（33 段长 37>32+1 含『=』字符）· bp 3（页段 37 字符）· neg 1」[SRC: MIG-B3/README.md#挂Owner裁决（不擅自修）]

## 5. 实现诚实台账

- API_REQ.MOCK.* 过渡宿主 11 对象（其中 6 条 mock 端点不在已发布基线，见 §2 C-02；分母 = contract-op 域 mock.* 枚举实测，代表 [SRC: MIG-B1/truth/objects/contract-op/mock.attachments.json#API_REQ.MOCK.ATTACHMENTS]）：
  - API_REQ.MOCK.ATTACHMENTS（mock 契约·附件存储端点）[SRC: MIG-B1/truth/objects/contract-op/mock.attachments.json#API_REQ.MOCK.ATTACHMENTS]
  - API_REQ.MOCK.CARLINE_FROZEN_VERSIONS（mock 契约·车型区域冻结版本列表端点）[SRC: MIG-B1/truth/objects/contract-op/mock.carline-frozen-versions.json#API_REQ.MOCK.CARLINE_FROZEN_VERSIONS]
  - API_REQ.MOCK.DATA_PERMISSION（mock 契约·数据权限配置端点）[SRC: MIG-B1/truth/objects/contract-op/mock.data-permission.json#API_REQ.MOCK.DATA_PERMISSION]
  - API_REQ.MOCK.DICTIONARY_ITEM_DELETE（mock 契约·字典条目删除端点（批量删除预检流程））[SRC: MIG-B1/truth/objects/contract-op/mock.dictionary-item-delete.json#API_REQ.MOCK.DICTIONARY_ITEM_DELETE]
  - API_REQ.MOCK.EXPERT_MODEL_CALCULATE（mock 契约·专家模型计算端点）[SRC: MIG-B1/truth/objects/contract-op/mock.expert-model-calculate.json#API_REQ.MOCK.EXPERT_MODEL_CALCULATE]
  - API_REQ.MOCK.MATERIAL_CSV_IMPORT（mock 契约·材料 CSV 导入端点）[SRC: MIG-B1/truth/objects/contract-op/mock.material-csv-import.json#API_REQ.MOCK.MATERIAL_CSV_IMPORT]
  - API_REQ.MOCK.PROJECT_FINANCE（mock 契约·车型财务信息端点）[SRC: MIG-B1/truth/objects/contract-op/mock.project-finance.json#API_REQ.MOCK.PROJECT_FINANCE]
  - API_REQ.MOCK.PROJECT_LEDGER_SNAPSHOT（mock 契约·台账快照过滤端点）[SRC: MIG-B1/truth/objects/contract-op/mock.project-ledger-snapshot.json#API_REQ.MOCK.PROJECT_LEDGER_SNAPSHOT]
  - API_REQ.MOCK.ROLES（mock 契约·角色管理列表端点）[SRC: MIG-B1/truth/objects/contract-op/mock.roles.json#API_REQ.MOCK.ROLES]
  - API_REQ.MOCK.USERS（mock 契约·用户管理列表端点）[SRC: MIG-B1/truth/objects/contract-op/mock.users.json#API_REQ.MOCK.USERS]
  - API_REQ.MOCK.VEHICLE_CATALOG（mock 契约·车型目录（其他资料库）端点）[SRC: MIG-B1/truth/objects/contract-op/mock.vehicle-catalog.json#API_REQ.MOCK.VEHICLE_CATALOG]
- mock_unverified 代表例：API_REQ.AUTHENTICATE.1 —— implementation_form_basis（逐字）：code_evidence:src/entities/auth/hooks.ts header attributes API_REQ.AUTHENTICATE.1/.2; loginWithDemo is a mock (600ms setTimeout(r, 600) fake delay + TODO(backend-ready) marks the not-yet-wired real call); useCurrentUser returns mockUser (real get_me not wired)；markers（逐字）：header attribution: API_REQ.AUTHENTICATE.1/.2；TODO(backend-ready): authClient.post('/auth/login', ...) (real call not wired)；setTimeout(r, 600) (600ms fake delay)；useCurrentUser returns mockUser (real get_me not wired)。[SRC: MIG-B1/truth/objects/contract-op/authenticate.1.json#API_REQ.AUTHENTICATE.1]
- B2 虚假 attest 越权条目：页面 PAGE-TASK-STEP-MANAGE-USER-ROLE 携带 attest 记录(last_updated_by=page-spec-attest-2026-08-06) 类声明，但机判绑定代码缺席：routes.ts 无 route name 锚且 src/pages/** 前 30 行头注无逐字词形（12 页虚假 attest 教训的正式化；C5 现场重扫，不信 key-binding-map 草表自报）[SRC: MIG-B2/gate-runs/page-composition/GTR-MIG-B2-page-composition-01-readiness-attest-cross-check.json@GRN-4201]；纠正标记计数位 [SRC: MIG-B2/inventory.yaml#denominators.page_readiness_status.in_file_marker_counts]

## 6. Owner 悬案台账

逐条登记「挂谁的案、缺什么动作」，不替 Owner 裁决：

- **OBS-3**（batch-1 README 挂 Owner 裁决节）：「GRID capability origin=natural vs FROZEN 02 schema 正例的 ingested（A6 场景）——CONVENTIONS §6 自相矛盾处，需裁决或 vocab PR」[SRC: MIG-B1/README.md#挂Owner裁决（不擅自修）]
- **OBS-4**：「ISSUE.*×107 / FTA-*×17 / FB-*×1 源侧跟踪 id 未入 ALIASES_V0——merge-preserving 逐字保真（schema 合法），下游 REF_INTEGRITY 悬空；词汇表 PR 或改挂 payload，二选一」[SRC: MIG-B1/README.md#挂Owner裁决（不擅自修）]
- **校准二轮——现行治理态（以 cutover 裁决台账为准）**：T-1 status=APPROVED（提案文件快照自报 status=PROPOSED，生效与否以裁决台账为准）；附带项同轮裁定：4 偏离样本期望档确认维持、A-1/A-2/A-3 维持否决、S-1/S-2/S-2b/S-3 为排期输入本轮不实现；审批门 cannot self-approve（Owner review checklist 4 项在案，裁决 2 逐项行使）。[SRC: MIG-B1/calibration/proposed-thresholds.json#status] + [SRC: MIG-B1/calibration/proposed-thresholds.json#approval_gate.cannot_self_approve] + [SRC: cutover/owner-adjudications.md#裁决2]
  裁决 2 逐字：「Owner 批准 T-1（`TRIAGE_ESCALATION_KEYWORDS` 词表追加 `global`）」；生效位置注记（逐字）：「Owner 授权由执行侧变更阈值事实源（triage 关键词表）并重跑 `node benchmarks/run-all.mjs` 验证矩阵回绿」。[SRC: cutover/owner-adjudications.md#裁决2]
  附带项逐字：「4 偏离样本期望档（signal_requiring 类人工推演）确认维持；被否决候选 A-1/A-2/A-3 维持否决；S-1（fan_out 信号实现）/S-2/S-2b/S-3 作为信号优先级实现的排期输入登记（本轮不实现）」[SRC: cutover/owner-adjudications.md#裁决2]
  提案快照逐字（时点声明，MIG-B1 在案）：「T-1 提案（TRIAGE_ESCALATION_KEYWORDS 增补 global，证据 2/53 命中 0 反例）+ 信号优先级 S-1 fan_out > S-2 declared_paths > S-2b churn > S-3 architecture_impact+C5——PROPOSED 未生效」[SRC: MIG-B1/calibration/proposed-thresholds.json#status] + [SRC: MIG-B1/README.md#挂Owner裁决（不擅自修）]
- **20 任务强制复审（协议武装状态如裁决 5）**：「协议已武装（corpus/master/batch-1/calibration/ + P0 出口记录）：累计 20 个真实治理任务后强制复审校准（阈值适配性 per-project 原则）。到期自动呈报，无需动作」[SRC: cutover/owner-adjudications.md#裁决5]
- **写授权**：「tombstone/写仲裁的真实施工（当前为镜像变体）」（tombstone/写仲裁镜像变体，未获授权不施工）[SRC: MIG-B1/README.md#挂Owner裁决（不擅自修）]
- **tombstone 预登记**：9 条全部 registered_only_not_executed（executed 0）——归档不是删除，写动作仍挂写授权。[SRC: MIG-B5/episodes/archive-manifest.yaml#denominators.tombstone_preregistrations]
- **MIG-B3/C-01**（STATE-* 词形 canonical 归属，option_a/b/c 三案并陈 PENDING）：逐字：「STATE-* 跨源词形 canonical 归属——machine 464 vs matrix 455（431 exact+14 分隔符对+10 组词对+9 machine 真缺口）」[SRC: MIG-B3/README.md#挂Owner裁决（不擅自修）]
- **MIG-B1/C-01..C-04 悬案指针**：classification-ledger conflicts_pending_owner 汇总呈报位（绝不自动裁决）。[SRC: MIG-B1/classification-ledger.yaml#conflicts_pending_owner]
