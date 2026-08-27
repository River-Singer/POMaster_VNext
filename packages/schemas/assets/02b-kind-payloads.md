# 02b · 十类 truth_bodies payload 差异表（kind-payloads）

> 状态：DRAFT（随 02-object-envelope.schema.json v1-draft 配套，待 Owner 终审）。
> 上游：`vocab-lock@v0.1-resolved`（枚举唯一来源）、`design-thread-A-ir-schema.md` §3/§4、`design-synthesis-decisions.md` A1-A8、任务书 02 指令（R4 / source typed / D24）。
> 消费方：03-* kind profile schemas（逐类收窄落点）、Kernel Transition 引擎、Behavioral Eval 种子、MASTer 迁移映射表。
> 坐标：`D:\Vscode Documents\po-master\.trellis\tasks\08-27-vnext-ir-schema-design\schema-drafts\02b-kind-payloads.md`

---

## 0. 分工原则：信封 / payload / kind profile 三层

| 层 | 谁管 | 内容 |
|---|---|---|
| 信封（02 schema） | 本批文件 | id/kind/axis_profile/axes/authority/origin/producer/realization/key_bindings/sources/…；硬性条件式仅 3 条：`origin=derived ⇒ producer 必填`、`lifecycle=SUPERSEDED ⇒ successor_ref 必填`、`kind∈{change_object, task_object} ⇒ payload.class_scan_result 必填（R4）` |
| payload（本文件） | 差异表蓝本 | 十类各自的正文自由区字段；信封层对 payload 保持 `additionalProperties: true` |
| kind profile（03-* 系列） | 逐类收窄 | 把本表各列转成 enum/required/additionalProperties:false；profile 只禁不扩、extension 禁止（thread-A §3.3） |

补充纪律：

1. **digest 义务随引用走**：payload 内如出现 sha256/digest 字段，一律 `$ref` 02 的 `$definitions.Sha256Digest`（自带 D24 `x-digest-ethics` 注记：write_blocking=false / read_only_service / human_touch=forbidden），禁止裸字符串指纹。
2. **本表是蓝本不是实现**：在 03-* 落地前，payload 收窄靠评审；落地后本表降级为对照文档。
3. **禁止 payload 塞散文**：人类叙事唯一合法入口是信封 `notes_md` 与 knowledge 的 `advisory_note_md`（机器永不判卷，P9 教训）。

### kind ↔ 前缀绑定矩阵（A5 closed-world）

| kind | canonical 前缀 | 存量收编（alias 双向链，A6） |
|---|---|---|
| capability | `CAPABILITY.` | `GRID.* → CAPABILITY.GRID.*` |
| component | `COMPONENT.` | — |
| contract_operation | `API_REQ.` | — |
| error_term | `ERR.` | — |
| field_definition | `FIELD.` | — |
| page_surface | `PAGE.` | `PAGE-TASK-STEP-* → PAGE.*`（token 重排） |
| knowledge_entry | `KNOWLEDGE.` | `KB-* → KNOWLEDGE.*` |
| business_rule | `POLICY.`（暂挂，见 §14） | — |
| change_object | `CHANGE.` | — |
| task_object | `TASK.` | — |

文法注记（自我校验时发现的真实边界）：SEGMENT=`[A-Z][A-Z0-9_]{0,31}` **不允许数字开头**，SEQ（纯数字）仅可为末段且前须至少一个 SEGMENT。因此 legacy `TASK-0087` 不能收编为 `TASK.0087`，合法形态是 `TASK.T0087`（alias 链保留 `TASK-0087`）；legacy `CHANGE-0104` → `CHANGE.C0104`。映射器（rename-on-ingest）必须内置这条规则。

张力注记：`DENOMINATOR/KEYBINDING/POLICY/PROFILE/AUTHORITY/TEST` 六个前缀是控制面对象族，其 kind 值（key_binding_table 等）**不在** vocab-lock `truth_bodies` 十类内——它们不走本信封的 kind 枚举，待词汇表 PR 登记 kind 后复用本信封（02 schema KindValue 已注明扩展点）。

---

## 1. 全景总表

| # | kind | payload 必填核心 | 特殊义务 / 备注 |
|---|---|---|---|
| 1 | capability | `canonical_realization.component`、`category` | realization 适用类；页面实例只许引用其 domain_states 子集 |
| 2 | component | `component_name`、`implements_capability`、`import_path` | 实现名 ≠ 语义 id（capability_id 是语义 id，查登记要匹配 canonical_implementation.component） |
| 3 | contract_operation | `method`、`path`、`operation_id`、`classification`、`request_need`、`response_need` | `operation_id` 是 A7 绑定锚点；realization 适用类，mock 时 mock_contract_ref 必附 |
| 4 | error_term | `error_class`、`user_message_zh` | D18 错误词条；401/403 必须分开成两条（Phase5 教训） |
| 5 | field_definition | `semantic_type` | 字段语义注册表；字典化值走 `vocab_ref` 不内联 |
| 6 | page_surface | `surface` | 物理路由权威在 KEYBINDING page↔dir，payload 不落路由串 |
| 7 | knowledge_entry | `failure_class`、`checks` | advisory 豁免 key_bindings（空绑定是声明出来的不是漏填） |
| 8 | business_rule | `statement_structured`、`enforcement_point` | 治理「勿再议散文」失控：条件/动作结构化，执行点必须可指认 |
| 9 | change_object | `motivation`、`affected_objects`、`reopen_count` + **`class_scan_result`（信封强制）** | reopen_count 喂 struggle detection |
| 10 | task_object | `intent`、`acceptance` + **`class_scan_result`（信封强制）** | §47 DoD：每条 acceptance 须映射 VERIFIED claim |

axis_profile 建议值（非枚举，本体是 SYS 词表对象）：`capability_default / component_default / contract_default / error_default / field_default / page_default / knowledge_default / rule_default / change_default / task_default`。已知收窄：knowledge 的 lifecycle 禁 CURRENT/DEPRECATED/RETIRED 之外取值；task 的 lifecycle 轴被 TASK_LIFECYCLE 词表替换（§22.1，词表未入 vocab-lock v0.1 → 词汇表 PR 清单）。

---

## 2. capability（可复用能力）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| canonical_realization | object `{component, import}` | component 必填 | MASTer component-registry：capability_id 是语义 id，实现名住 canonical_implementation.component（08-15 误报 bug 教训） |
| category | string | 必填 | 四层注册表 / 12 Pattern |
| forbidden | string[] | 选填 | 禁止自造组件三处 fail-closed 门禁的对齐面 |
| domain_states | string[] | 选填 | Phase4 业务态全集；页面实例只许引用子集、禁止自带新态 |
| variants | string[] | 选填 | 同上（cell_edit / row_edit / …） |
| technology_base | string | 选填 | Catalog 引用不自造（91 决议精神，如 AG_GRID） |
| poc_required | boolean | 选填 | 高风险组件 POC MUST（EditableGrid 类） |

### MASTer 实例：`CAPABILITY.GRID.EDITABLE_GRID`（alias `GRID.EDITABLE_GRID`）

```yaml
id: CAPABILITY.GRID.EDITABLE_GRID
aliases: ["GRID.EDITABLE_GRID"]          # A6 rename-on-ingest
kind: capability
axis_profile: capability_default
axes: { lifecycle: CURRENT, confidence: LOCKED, evidence: VERIFIED, change: STABLE }
authority: { owner: FRONTEND_ARCHITECTURE, delegates: [{ role: HUMAN_OWNER, required_for: [retire] }], write_policy: EVOLUTION_CHANNEL }
origin: ingested                          # 原 migrated 词形收编映射（human_curated→natural、migrated→ingested，2026-08-27 与 01 对齐）；producer 声明块见 02 正例，此处略
realization: { value: wired }             # evidence=VERIFIED ⇒ wired（跨轴断言自洽）
key_bindings:
  code:
    - artifact_type: file
      value: src/shared/grid/MasterEditableGrid.vue     # capability↔file（A7 P0 三类之一）
      match_rule: mechanical
payload:
  canonical_realization: { component: MasterEditableGrid, import: "@/shared/grid" }
  category: grid
  forbidden: [direct_ag_grid_import_in_business_page, page_local_grid_css, inline_cell_renderer]
  domain_states: [idle, editing, validating, saving, error]
  variants: [cell_edit, row_edit, batch_edit]
  technology_base: AG_GRID
  poc_required: false
```

---

## 3. component（组件实现登记）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| component_name | string | 必填 | 即 canonical_implementation.component（文件名/实现名，与 capability 的语义 id 严格分离） |
| implements_capability | string（`CAPABILITY.*`） | 必填 | 四层注册表语义层→实现层连线 |
| import_path | string | 必填 | 仓内相对形态，禁绝对盘符 |
| vendor_base | object `{package, version}` | 选填 | vendor-adapter-registry（版本为纯派生字段，单点补丁维护） |
| variants / states | string[] | 选填 | 必须⊆所实现 capability 的同名集合 |
| forbidden | string[] | 选填 | 实现级追加禁令（不放松 capability 级） |

注：物理文件锚点不住 payload，住信封 `key_bindings.code`（capability↔file 由 capability 对象持锚，component 对象持 import_path）。

---

## 4. contract_operation（API 契约操作）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| method | string（HTTP 动词大写） | 必填 | thread-A §4.2 |
| path | string | 必填 | 同上；`{param}` 花括号形态与 OpenAPI 一致 |
| operation_id | string | 必填 | 外部 OpenAPI operationId 锚点（A7 绑定类 contract_operation↔operationId） |
| classification | string | 必填 | Phase5 8 类请求分类（QUERY/COMMAND/…），与 trigger 联动 |
| trigger | object `{type, automatic}` | 选填 | page-entry / user-action / polling… |
| request_need / response_need | object `{fields[]}` | 必填 | 「need」语义：前端主张的最小字段集，字段引用 `FIELD.*` |
| feature_ref | string | 选填 | 上游 feature id |
| consumption_posture | string | 选填 | external_published_contract（发布契约不做 owner 审批仪式）等 |
| auth_domain | string | 选填 | auth / app client 分离（Phase5） |
| mock_contract_ref | string | 选填 | **realization=mock 时必附**（evidence 义务） |

### MASTer 实例：`API_REQ.BIND.CARLINE.1`

```json
{
  "id": "API_REQ.BIND.CARLINE.1",
  "kind": "contract_operation",
  "axis_profile": "contract_default",
  "axes": { "lifecycle": "CURRENT", "confidence": "LOCKED", "evidence": "IMPLEMENTED", "change": "STABLE" },
  "authority": { "owner": "FRONTEND_CONTRACT", "delegates": [{ "role": "EXTERNAL_BASELINE", "required_for": ["modify_payload_request_need", "modify_payload_response_need"] }] },
  "origin": "derived",
  "payload": {
    "method": "GET",
    "path": "/api/v1/projects/{project_id}/carlines",
    "operation_id": "list_carlines_api_v1_projects__project_id__carlines_get",
    "classification": "QUERY",
    "trigger": { "type": "page-entry", "automatic": true },
    "request_need": { "fields": ["project_id"] },
    "response_need": { "fields": ["items"] },
    "feature_ref": "FEATURE-VEHICLE-MASTER-DATA-QUERY",
    "consumption_posture": "external_published_contract",
    "auth_domain": "app"
  },
  "realization": { "value": "wired" }
}
```

迁移注记：旧记录一词多义的 `"status": "ACCEPTED"` 被拆解——契约已接受 = `lifecycle: CURRENT + confidence: LOCKED`；代码接没接 = `evidence` 轴 + `realization`。auth mock 场景同骨架为 `evidence: IMPLEMENTED, realization: mock, payload.mock_contract_ref / realization.probe_ref`。

---

## 5. error_term（错误词条，D18）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| error_class | string | 必填 | D18 错误分类法 |
| http_status | integer | 选填 | 401/403 必须各自独立词条、禁止合并（Phase5 教训） |
| user_message_zh | string | 必填 | 用户可读文案；判卷不依赖本字段 |
| severity | string | 选填 | 如 block_submit / toast_only |
| mapping_chain | string[] | 选填 | 错误映射链：app_client 归一 → page 呈现（Phase5） |
| retry_class | string | 选填 | RETRYABLE / NON_RETRYABLE / IDEMPOTENT_REFRESH |
| alert_policy_ref | string | 选填 | 上报告警策略引用 |

### MASTer 实例：`ERR.COST.FORMULA_CYCLE`

```yaml
id: ERR.COST.FORMULA_CYCLE
kind: error_term
axis_profile: error_default
axes: { lifecycle: CURRENT, confidence: LOCKED, evidence: IMPLEMENTED, change: STABLE }
authority: { owner: FRONTEND_CONTRACT, delegates: [], write_policy: CORRECTION_ONLY }
origin: natural
payload:
  error_class: COST_FORMULA_CYCLIC_DEPENDENCY
  http_status: 422
  user_message_zh: "成本公式存在循环引用，请检查公式间的相互引用后重试"
  severity: block_submit
  mapping_chain: [app_client_normalize, page_toast_inline]
  retry_class: NON_RETRYABLE
  alert_policy_ref: null
```

---

## 6. field_definition（字段语义）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| semantic_type | string | 必填 | Phase4 字段语义注册表 |
| data_layer | string | 选填 | Phase4 数据模型分层（哪一层拥有该字段） |
| pii | boolean | 选填 | 隐私类标记（security 横切消费） |
| unit | string | 选填 | 量纲 |
| vocab_ref | string | 选填 | 字典化引用（ai-coding 字典化扫描器的过滤锚），禁止内联枚举值副本 |
| i18n_key | string | 选填 | i18n 横切消费 |

---

## 7. page_surface（页面/Screen 对象）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| surface | string | 必填 | Page Spec 双分母（V1 surface 等）；分母归属走信封 denominator_refs |
| template_ref | string | 选填 | Phase3 页面模板注册表（10 模板） |
| slots | string[] | 选填 | 15 slots 槽位引用 |
| actions | string[] | 选填 | 12 actions 引用 |
| state_subset_of | string[]（`CAPABILITY.*`） | 选填 | 页面实例只许引用 capability domain_states 子集 |
| interaction_contracts | string[] | 选填 | interaction-contract-registry 激活引用（opt-in） |

注：物理路由/目录权威在 `KEYBINDING.*`（page↔dir，A7 P0 三类之一）；本 payload 刻意不落 route 串，杜绝双真相。

### MASTer 实例：`PAGE.BIND_CARLINE`（alias `PAGE-TASK-STEP-BIND-CARLINE`）

```yaml
id: PAGE.BIND_CARLINE
aliases: ["PAGE-TASK-STEP-BIND-CARLINE"]   # 完整历史形态入 alias 双向链
kind: page_surface
axes: { lifecycle: CURRENT, confidence: LOCKED, evidence: VERIFIED, change: STABLE }
payload:
  surface: V1
  template_ref: page-template/standard-list-form   # Phase3 模板注册表 key（非 closed-world id，不冒用前缀）
  state_subset_of: [CAPABILITY.GRID.EDITABLE_GRID]
# route 权威：KEYBINDING.PAGE.V1（page_blueprint_to_source_dir → src/pages/page-bind-carline）
```

---

## 8. knowledge_entry（知识条目）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| failure_class | string | 必填 | 五大家族 failure-pattern（B3） |
| trigger_when | string[] | 选填 | 触发场景（机器可匹配的短语词形） |
| checks | string[] | 必填 | 该 pattern 的机械检查清单 |
| required_evidence | string[] | 选填 | 消费本条时须出示的证据（如 golden test） |
| advisory_note_md | string | 选填 | 散文唯一入口、永不判卷 |
| promotion_eligible | boolean | 选填 | 知识升格 Spec 通道资格（§83.10）——只记资格不记决定 |

### MASTer 实例：`KNOWLEDGE.CSV_FAILURE_PATTERN`（alias `KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT`）

```yaml
id: KNOWLEDGE.CSV_FAILURE_PATTERN
aliases: ["KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT"]
kind: knowledge_entry
axis_profile: knowledge_default            # lifecycle 收窄 CURRENT/DEPRECATED/RETIRED
axes: { lifecycle: CURRENT, confidence: PROVISIONAL, evidence: IMPLEMENTED, change: STABLE }
authority: { owner: ENGINEERING_EXPERIENCE, delegates: [], write_policy: CORRECTION_ONLY }
origin: natural                            # 原 human_curated 词形收编映射；免 producer 义务（防死 factsource 误伤 advisory）
key_bindings: {}                           # 空绑定是「advisory 豁免矩阵」声明出来的，不是漏填
payload:
  failure_class: CSV_PARSING
  trigger_when: [implementing_csv_import_or_export, encountering_quoted_cell_with_delimiter]
  checks: [quoted_delimiter, embedded_newline, escaped_quote, bom_encoding, trailing_delimiter]
  required_evidence: [golden_test_multiline_quoted_cell]
  advisory_note_md: |
    本条为 advisory，不规定具体库；Library 选型归 Architecture/Engineering Policy。
  promotion_eligible: true
```

---

## 9. business_rule（业务规则）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| statement_structured | object `{when, then}` | 必填 | 条件/动作结构化；散文叙事入 notes_md（治理「勿再议散文」失控，thread-A §3.1 DECISION 动机同源） |
| enforcement_point | string | 必填 | 执行点 id（gate/validator/script），必须可指认——有规则必有执行者 |
| scope_refs | string[] | 选填 | 作用对象（Governed id 列表） |
| decision_refs | string[] | 选填 | `DECISION.*` / `CHANGE.*` 裁决链引用（D3 adjudication ledger 消费方） |

---

## 10. change_object（变更对象）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| motivation | string | 必填 | thread-A §4.4 |
| affected_objects | string[] | 必填 | 受影响 Governed id 列表（含 CAPABILITY.* 等，供漂移回落 CHALLENGED 联动） |
| related_permits | string[] | 选填 | PERMIT 引用；MIGRATING 期间必须存在 ACTIVE 项（跨轴断言，Transition 层） |
| reopen_count | integer（≥0） | 必填 | §56 struggle detection 输入；机器维护、单调递增 |
| decision_refs | string[] | 选填 | 裁决链 |
| **class_scan_result** | object | **必填（信封条件式 3 强制）** | R4，见 §12 |

实例：`CHANGE.C0104`（alias `CHANGE-0104`；持有 motivation / affected_objects=[TASK.T0087 目标文件对应的 CAPABILITY] / related_permits / reopen_count: 2）。

---

## 11. task_object（任务对象）

| 字段 | 类型 | 必填 | 来源依据 |
|---|---|---|---|
| intent | string | 必填 | thread-A §4.4 |
| implements_change | string（`CHANGE.*`） | 选填 | 变更链 |
| acceptance | array `{criterion, claim}` | 必填 | §47 DoD：每条 criterion 须映射 `latest_verdict=VERIFIED` 的 claim——「prd 全勾但 status=planning」双向失真的封堵 |
| oscillation_guard | object `{same_target_previous_tasks[], flag, requires}` | 选填 | checkbox saga 结构化：同目标第 N 个任务须先立 DECISION 才能存在（C2：先观测 flag，advisory） |
| **class_scan_result** | object | **必填（信封条件式 3 强制）** | R4，见 §12 |

实例：`TASK.T0087`（alias `TASK-0087`；intent=恢复 headerCheckboxSelection 仅当列声明 checkbox 时渲染单复选列；acceptance[0].claim=CLM-0512（PARTIALLY_VERIFIED→继续追证）；oscillation_guard.same_target_previous_tasks=9 项）。

---

## 12. R4 专项：class_scan_result

```json
{ "scope": "src/entities/**/*[Ee]scape*", "hits": 16, "fixed_count": 16, "regression_case_ref": "TEST.CSV_ESCAPE_MULTILINE" }
```

- 语义：任何 change_object / task_object 必须记录「同类扫描足迹 + 回归锚」，封堵 csvEscape×16 类「修一处漏一类」的 fix-forget-repeat 循环。
- `fixed_count ≤ hits` 由 Gate 层校验（draft-07 无跨字段比较关键字，schema 不在此拦——与 forbidden source 同一哲学：schema 保证可判别，执行语义归 Transition/Gate）。
- `regression_case_ref` 建议 `TEST.*`（fixture 专用域，Q3 已决：对象身份合法；生产代码引用 TEST.* 是 doctor 违规探针）或 `GRN-*` 运行记录。
- 信封层通过 `allOf if/then` 强制：`kind ∈ {change_object, task_object} ⇒ payload.class_scan_result 存在且四字段必填`。

---

## 13. realization 在 payload 侧的落位对照

| 场景 | 信封字段（02） | payload 侧义务 |
|---|---|---|
| contract_operation = mock | `realization.value=mock` | `payload.mock_contract_ref`（或 `realization.probe_ref`）必附 |
| contract_operation = wired | `realization.value=wired` | key_bindings 持 operationId 锚点 + http_call_scan 探针 |
| capability | `realization.value` | `canonical_realization.component/import` 即实现主张本体 |
| 其他 kind | 不应出现 | kind profile 收窄时报 WARN（提请 Transition 线定谳） |

`human_override` 必带 `reason`（+建议 `decided_by/authority_ref/at_rev`）；缺省 `derivation` 即 `machine_preferred`（D21：机器派生优先，人只做例外复核）。

---

## 14. 开放点（移交词汇表 PR / 后续文件）

1. **business_rule 暂挂 `POLICY.`**：POLICY 前缀语义是「目录策略引用条目」，business_rule 是否独立前缀（如 `RULE.`）待词汇表 PR 裁决；本表先行按暂挂形态登记。
2. **控制面 kind 注册**：key_binding_table / denominator / producer / authority / profile / test-fixture 对象族的 kind 值不在 truth_bodies 十类内，登记后复用 02 信封（KindValue 扩展点）。
3. **TASK_LIFECYCLE 词表**（task 的 lifecycle 轴替换）未入 vocab-lock v0.1 → 词汇表 PR 清单；登记前 task_object 的 lifecycle 暂用六值主轴。
4. **source_type / liveness_status / match_rule / write_policy / origin / verification_verdict 六个 envelope-local 枚举**已按 x-vocab-extra 注记出处（任务书 02 指令 / thread-A §3/§5）：source_type 已随 vocab-lock 增设 source_types 词轴收编（2026-08-27，allowed/forbidden 两子集切分同构）；其余五个提请随 vocab-lock v0.2 收编。
5. 2/5/6/8/9 五类暂无 MASTer 实例样例（任务书仅点名 4 例）；P0 tracer bullet 开跑后按第一手底稿回填（B5 语料回灌同批）。
