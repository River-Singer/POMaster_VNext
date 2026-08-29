# MIG-B3 转录约定书（CONVENTIONS）—— batch3 扩充

效力区间：`migration/master-batch3/` 下自 M2 起的全部 truth 对象转录组。后续转录组施工前必读；本文是施工规范，不是散文。

与 batch1/batch2 的关系：本文**只扩充、不推翻** `migration/master-batch1/CONVENTIONS.md`（下称「batch1 约定书」）与 `migration/master-batch2/CONVENTIONS.md`（下称「batch2 约定书」）。batch1 约定书 §2 信封字段、§5 别名收编、§6 provenance、§7 幂等确定性、§8 字段归属、§9 gate 结果词汇与 batch2 约定书 §2–§5 对象形态、三红线（batch2 硬约束 7）继续全文有效；本文做四件事：批次换代号（`MIG-B2`→`MIG-B3`）、登记 batch3 领域事实族对象形态（§2，含 state ownership 矩阵对象化粒度裁定）、把 batch2 §5 SHELL.* 判例升格为本地族词形赐名通则（§4）、立大体量纪律与分片规则（硬约束 12 与 §2.5）。

冲突裁决顺序：FROZEN 事实源（`packages/schemas/assets/02-object-envelope.schema.json`、`02b-kind-payloads.md`、`03-gate-result.schema.json`、`packages/kernel/src/gate-result.ts`、`packages/schemas/src/vocab.ts`）> `migration/master-batch3/classification-ledger.yaml` 已裁定事项 > 本约定 > batch2 约定 > batch1 约定 > 转录者个人判断。

硬约束（违者返工；1–11 继承 batch1/batch2 约定书同号条目，此处只列 batch3 差异点）：

1. MASTer_master（`D:\Vscode Documents\MASTer_master`）绝对只读；一切产出写 `migration/master-batch3/`（batch3 独立目录，不混入 batch1/batch2）。
2. 禁墙钟；批次代号固定 `MIG-B3`；同输入重跑 byte-identical（幂等）。源内墙钟字段（如 formatter-registry `updated_at`）按铁律 2 从机器字段剥离，剥离必须显式登记（notes_md + 工具打印），禁静默丢弃。
3. 确定性序列化照 batch1 约定书 §7（`sort_keys=True, indent=2, ensure_ascii=False` + 末尾 `\n`，bytes 写入，UTF-8 无 BOM）。
4. 分母一等公民 + **大体量分桶对账（batch3 新增）**：源条目数、落盘对象数、inventory 分母实测值三者相等；凡有条目被准入规则挡在机械转录批之外（§2.2 准入门），对账升级为三桶恒等式——**已转录对象数 + 显式登记待裁决数 = 源分母数**（「不转录」必须以显式登记表达，禁静默跳过）。
5. ID 文法 15 前缀闭世界不变（`vocab.ts` `GOVERNED_ID_PREFIXES`，`assert len == 15`）；vocab v0.2 别名族现役 8 个——`KB-*`、`GRID.*`、`PAGE-TASK-STEP-*`、`TASK-*`、`CHANGE-*`、`ISSUE.*`、`FTA-*`、`FB-*`（`assert` 族数 8）。本批八族注册表本地族词形（`format-*`/`CALC-*`/`NEG.*`/`BP-*`/`STATE-*`/`MACHINE-*`/`MODEL.*`/`FIELD.*` 词形漂移）按 §4 通则处置。
6. 对象信封过 FROZEN `02-object-envelope.schema.json`；gate 结果过 FROZEN `03-gate-result.schema.json`（verdict 七态 snake_case）。
7. **三红线（batch2 教训条目全文继承）**：文件名小写（local-name 推导必须 `.lower()` 且逐文件断言）；AGG 合规 GateResult（禁自由形状，`ran_at_seq` 钉 0 留 A4 注记）；`skipped_blindspot` 必附盲区指标 + fixture 回归证据。另有：`passed` 且 `violations>0` 非法；数值语义不篡改（33 DRAFT 就是 33 DRAFT；wired true=6/false=53 就是 6/53）。
8. 禁 git 操作；禁改 `POMaster_VNext` 的 `packages/`、`catalog/`、`examples/`、`benchmarks/`、`tests/` 等任何其他路径；测试/工具只进 `migration/master-batch3/tools/`。
9. provenance 每对象必填（batch1 约定书 §6 形态照用；`locator.batch="MIG-B3"` + `locator.ingested_from` 逐对象登记）。
10. merge-preserving：人类策展字段逐字保真（batch1 约定书 §10 全文有效）；precision_policy 中文 rule、field business_meaning、negative-constraint statement 等业务事实正文一律逐字，禁转写禁"规范化"。
11. 语义转录 ≠ 格式转换（batch1 约定书 §11 全文有效）。
12. **大体量纪律（batch3 新增）**：本批源约 2.8 万行（field-semantic 5169 行 / state-ownership-matrix 6678 行 / data-model 3403 行 / business-rule 275 条 / transitions 311 条），转录必须**脚本驱动**（ingest 工具解析源→对象），禁手写大 JSON；单批对象量可达数百上千（states 455 + variables 854 + fields 785），目录形态照 §2.5 分片规则；每个工具幂等连跑 byte-identical 且报告 fresh/noop 计数。
13. Python 3.14 环境注意照 batch1 约定书 §12（避免 `@dataclass` 与裸 `importlib` 组合；控制台打印 ASCII 或设 `PYTHONIOENCODING=utf-8`；PyYAML 与 jsonschema 可用）。

---

## 1. 目录布局与 kind-dir（延续 batch1 闭表）

```
migration/master-batch3/
├── CONVENTIONS.md                        # 本文件（batch3 扩充）
├── inventory.yaml                        # M0 只读盘点（pin 事实源，只读消费）
├── classification-ledger.yaml            # M1 分类台账（裁定事实源，只读消费）
├── key-binding-map.batch3.draft.yaml     # 领域事实↔代码锚三方探查草表（只读消费）
├── tools/                                # ingest 工具（确定性幂等，只进这里）
│   └── ingest_formatter_registry.py      # M2 golden（本批参考实现）
└── truth/
    └── objects/
        └── <kind-dir>/[<seg2>/]<local-name>.json   # 信封对象（一对象一文件；<seg2> 见 §2.5）
```

kind-dir 沿用 batch1 约定书 §1 十类闭表，**禁即兴派生**；batch3 在册的合法 kind-dir（ledger kind_prediction_distribution 同源）：

| kind（信封枚举值） | 目录名 | batch3 用途（ledger 裁定） |
|---|---|---|
| capability | `capability/` | formatter 10 / calculation 59 / state-machine 33 / component-registry 余量 87 |
| business_rule | `business-rule/` | bp-contract 30 / business-rule 275 / negative-constraint 64 / state-ownership（states 455 + variables 854，任务书候选） |
| field_definition | `field-definition/` | field-semantic 785 / data-model 67（预判落位，张力随条目） |
| 其余七类 | 照 batch1 表 | 未用到时目录不建 |

local-name 规则照 batch1 约定书 §1 + batch2 红线 1（`.lower()` 硬断言）。样例：`CAPABILITY.FORMAT.MONEY_4C2D` → `format.money-4c2d.json`。

---

## 2. 领域事实族对象形态（本批扩充核心）

batch1 资产是治理词表/契约/事件史；batch3 资产是**领域事实族**（计算/格式化/字段语义/状态所有权/状态机/负面约束）。四类形态裁定如下，后续组遇同类照此论证，不得静默换形态。

### 2.1 business_rule payload 结构（页级规则/契约/负约束）

蓝本（02b §9）：`statement_structured{when, then}` + `enforcement_point` 必备。页级落法：

- `when` := 源 condition/触发语义逐字；源无独立 condition 字段的条目 `when` 显式 `null`（诚实缺席，禁编造条件），`then` := statement 逐字。`severity` 等源策展字段随 payload 同名承载。
- `enforcement_point` := 消费链可指认执行点，用 ledger rationale 已登记的锚词形（business-rule-registry → page-spec §4 / governance_factsources；negative-constraint → page-spec §9 / governance_factsources；bp-business-contract → page-spec §3），禁凭空书写 gate 名。
- `scope_refs` := Governed id 值引用照录（如负约束 source_refs 的 `ACTION.*` 词形值引用——ACTION.* 亦本地族词形，照录不改名）。
- **复合身份定形**（ledger identity_note 预判的定案）：business-rule-registry 275 条 rule_id 仅 148 distinct、bp-contract 30 条 id 仅 18 distinct → 条目身份 =（page_id, rule_id）复合键 → canonical 族 **`POLICY.<PAGE>.<RULE_ID>` 复合段**（ledger destination_note 预判族形）。PAGE 段连字符→下划线（机械）；RULE_ID 段小写→大写、连字符→下划线（机械）；任一段超 32 字符或含非 `[A-Z0-9_]` 字符（中文等）→ §2.2 准入门，不进机械转录批。
- **散文边界**：statement/condition/severity 是业务事实正文不是 notes 叙事——逐字进 payload（batch2 附录 A 第 8 行内嵌中文注记散文同款先例）；规则的叙事背景散文（若有）才进 notes_md。
- **粒度**：逐条立对象（275/64/30 均有逐条消费检索路径：page-spec 按 page_id×rule 逐条消费、`NEG.<PAGE>.<ACTION>` 被页面/动作逐条引用——ledger destination_note 三处一致）；batch1 §3 request-classification 整册一词表判例**不适用**（彼处下游按裸值查表无 id 检索路径，此处按条目 id 检索）。

### 2.2 field_definition 形态与准入门

蓝本（02b §6）：`semantic_type` 必填。落法：

- `semantic_type` := 源 `type` 字段逐字（机械映射、零 fabricate）；`data_layer` 缺席（layer 是 data-model 模型级字段，模型对象侧承载，field 对象不抢）；`unit`/`enum`/`nullable`/`business_meaning` 等人类策展字段逐字进 `payload.field`（铁律 10；TODO 占位语义如实转录不伪造回填）。
- `vocab_ref`：源 enum 为内联值列表 → 照录 + `vocab_ref` **如实缺席**；字典化改写属语义升级，只登记不执行（batch1 §4 纪律同款）；禁把内联 enum 复制进 vocab_ref 伪造字典化。
- **数据模型同族落位**（ledger 预判）：data-model 67 模型落 field-definition/ 目录（fields[] 纯引用闭合使模型与字段构成同一结构两视图）；模型对象 `payload.model` 逐字 + layer/slot/fields 引用键逐字；`MODEL.*` 本地族赐名照 §4 通则；模型粒度由其转录工具按三问复核定案（本约定书预判逐条：fields[] 引用键即检索路径），不在本条强制。
- **准入门（本批新立；field-semantic 776/785 文法漂移的处置通则）**：governed-id 文法是硬门（铁律 5 / 信封 IdCanonical pattern，解析即 FATAL）。源词形违反 SEGMENT 文法的条目分两档：页段连字符可机械归一（`PROCESS-DB`→`PROCESS_DB`）；语义段中文**无机械映射**（`工艺类别` 不存在确定函数）→ 机械赐名不可能的条目**不进机械转录批**，以显式登记表达（该工具的 pending registration 清单，HUMAN_CONFIRM_REQUIRED，batch2 §5 PAGE-APP-* 口径），禁静默跳过。分母对账走硬约束 4 三桶恒等式（field-semantic 形：9 已转录 + 776 待裁决 = 785）。族级词形登记归词汇表 PR/Owner（key-binding-map `alias_registrations.proposed_needs_human` 同口径）。variables 854（§2.3）同用本门。

### 2.3 state 枚举与 ownership 矩阵的对象化边界（裁定）

**裁定：每状态一对象（states 455 逐条）+ 每变量一对象（variables 854 逐条）；不立「每所有关系一对象」（state×owner 关系不独立成对象）。** 按 batch1 §3 三问论证：

1. **检索粒度（决定性）**：下游按 state_id / variable_id 单键逐条查表——state-machine transitions 逐条引用 state_id；side_effect_graph / delivery_truth_contract 按 variable_id 检索；「按页聚合」是索引层投影不是检索键。所有权关系在本源是 1:1 函数（每 state 恰一条 owner/category/value）——对 1:1 函数立「关系对象」不产生新检索粒度，只把 id 空间翻倍（1309→2618+）并引入双对象一致性负担。
2. **演化原子性**：owner 回填史（210 缺口逐条回填）与 category 重分类都按条目发生；页面归并会把单条变更放大成整页对象协调变更（batch1 §3 原子性原则反向适用）。
3. **ledger 先例对齐**：destination_note 已裁定 states 455 逐条立对象候选；variables 归本批三问——同构定案（variable_id 854/854 distinct，单键检索路径在场）。变量不并入页面（33 页归并排除）：variable_id 是跨页单一键空间且词形即 `FIELD.*` 族，与 field-semantic 同键空间——逐条对象让 Owner 未来裁决「变量所有权并入字段对象 facet」时存在一对一 supersede 路径。

对象化边界补充：

- **状态枚举不另立词表对象**：STATE-* 枚举成员即状态对象本身（与 batch1 §3 request-classification 整册判例的分歧点：彼处枚举值无逐值检索路径，此处 state_id 逐条被引用）。machine 侧 464 − matrix 455 = 9 条真缺口在 matrix 无定义体 → **不立对象**（不虚构所有权条目），缺口随 MIG-B3/C-01 登记。
- **MIG-B3/C-01 耦合（PENDING_OWNER）**：14 分隔符对 + 10 组词对的 canonical 词形属 Owner 裁决项——逐条对象照录 matrix 侧源词形，drift 对涉及条目 `confidence=PROVISIONAL` + `payload.pending_conflicts` 双词形并存（values_in_conflict 两侧逐字，batch2 §5 形状），绝不机械择一；exact 431 直录。STATE-* 的 canonical 赐名机械形随 C-01 一并定案，M2 不预先定形。
- **MIG-B3/C-02 耦合（值冲突 vs 锚漂移的区分纪律，本批新立）**：值冲突在身（同一语义位两值并存）→ `confidence=PROVISIONAL`（batch1 §2 悬置态）；**锚漂移**（值本身无冲突，但值到代码的机器键建立失败）→ 不降 confidence，以键绑定债务诚实呈现（gate 呈 manual_confirmed 债务或 not_configured）。C-02 owner 约定标签 24 种（23 无字面导出 + 1 符号他模块）属锚漂移形态：对象照录 owner 词形（只登记不改名），锚债务随 state_owner_label_bindings 登记链呈现，禁虚构代码锚、禁因锚漂移降 confidence。

### 2.4 calculation 的 engine_binding→evidence_axis 升级规则

`engine_binding.wired` 是 **evidence 轴事实（接线声明）**，不是 lifecycle 声明（ledger wired_evidence_axis_preregistration 成文；status=ready 47 vs wired=true 6 的语义裂缝即『wired 字段形态』教训原点）。转录规则：

1. 源布尔逐字保真进 payload（wired true=6 / false=53，数值语义不篡改）。
2. evidence 轴机械判定**不得单凭源内布尔自报值**（C5：自报值永不单独判卷）——必须挂 key-binding-map calc_bindings 机械判定词：`MECHANICAL_TOKEN_MATCH_WIRED`（6 条）→ `axes.evidence=IMPLEMENTED`，且可携 `realization.value=wired`（机械词在场即满足 realization 三值证据义务的探针材料；probe 缺省=未探测）；`WIRED_FALSE_ENGINE_REGISTERED_ONLY`（23 条）与 `WIRED_FALSE_PARALLEL_IMPLEMENTATION_PRESENT`（30 条）→ `axes.evidence=PLANNED`（引擎注册层完成、页面接线未做/平行游离——『接了没有』答『没接』）；parallel 实现锚以 `key_bindings.code` 登记（whole_file_token 形），engine_registry_mirror 锚照登记。
3. 旧扁平字段**双登记** superseded_status_field（batch1 §4 形状，同形两实例）：`source_field="status"`（ready=47/blocked=2/blocked-by=10，registry 自报态——语义升级只登记不执行归 Owner）+ `source_field="engine_binding.wired"`（true=6/false=53——迁 evidence 轴的升级登记，upgrade_registered=true）。
4. **MIG-B3/C-03 耦合**（registry.ts 头注自述 59 vs 58 漂移，PENDING_OWNER）：engine_registry_mirror 锚的 expect 只锚注册行本身（`f('CALC-*', …)` 形），**禁锚头注自述行**（自述漂移在案，锚上即 gate 口径分裂）；C-03 不降 confidence（自述漂移非对象值冲突），登记于 notes/escalation。

### 2.5 大体量分片规则（单 registry 超 N 条时分目录命名法）

- **阈值 N=500**：单 kind-dir 预期落盘对象数 > 500 时启用二级分片；≤ 500 一律 flat（batch3 实测：capability 10+59+33+87=189 flat；business-rule 30+275+64+455+854≈1678 分片；field-definition 785+67=852 分片）。理由：A1「审计即 diff」原则下目录跳数越少越好，分片是大规模下的可导航性让步不是美德，阈值从紧。
- **分片键**：canonical id 去前缀后的**第二段**（PREFIX 后第一 SEGMENT）小写 → `truth/objects/<kind-dir>/<seg2>/<local-name>.json`；无第二段（单段 id）落 kind-dir 根。分片键是 id 的确定函数（幂等不受分片影响）；分片目录数 = 第二段 distinct 数（field 页段 distinct=24 → 24 片）。
- **红线**：分片是 id 的命名空间投影**不是新 kind**——kind-dir 闭表（batch1 §1）不动，二级目录禁即兴语义（必须是 id 机械投影；禁按主题/日期/状态/批次分目录——那些不是 id 投影，会使同族对象跨目录散落、破坏 REF_INTEGRITY 目录扫描）。
- 片内禁 index 文件（truth-index 01 系列是唯一索引；片目录只有对象文件）；禁符号链接。
- local-name 规则照 batch1 §1 + 红线 1（全小写断言在**完整相对路径**上执行，含分片段）。

---

## 3. M2 golden：formatter-registry 对象形态（本批参考实现）

**粒度裁定：10 条逐条立对象**（batch1 §3 三问）：

1. 检索路径在场：每条自带 implementation 锚 = capability↔file A7 P0 机械键（key-binding-map formatter_bindings 按 governance_id 逐条登记 10 条，MECHANICAL_LITERAL_EXPORT 10 / RESIDUAL 0）；applies_to_fields 按字段路径逐条绑定（12 条路径）；precision_policy 按条目特化（5 条 monetary 精度策略）。planner gate 虽整册 fail-closed 读文件，但「某字段/某数值语义用什么 formatter 与精度策略」的判卷按条目查表——逐值检索路径成立，batch1 §3 例外条款适用（与 request-classification 整册判例的分歧点成文）。
2. ledger destination_note 预判逐条（每条自带实现锚 = A7 P0 锚类）。
3. 演化原子性：`tools/frontend/encode_float_precision.py` 按条目 upsert（money/number/percent/currency/unit 五条独立回填 policy_id，merge-preserving updater 在场）——整册一对象会把单条精度策略变更放大成整册协调变更。

**赐名与别名**：`format-*` 为注册表本地族词形（非 vocab v0.2 15 前缀成员、非 ALIASES_V0 现役 8 族）→ canonical 赐名 **`CAPABILITY.FORMAT.<SEG>`**：家族词 FORMAT 保留第二段（`GRID.*→CAPABILITY.GRID.*` 同形机械映射），源 name 去 `format-` 前缀后连字符→下划线、小写→大写（`format-money-4c2d`→`MONEY_4C2D`；数字不居段首，文法合法）；legacy 词形逐字照录 `aliases[]`；**非 A6 场景**（batch1 约定书 §6 边界条款）→ `origin` 保持源侧 derived（inventory `provenance.origin` 逐字）；FORMAT.* 别名族正式登记归词汇表 PR/Owner 裁决（alias_registrations.proposed_needs_human 同口径）。

**02b §2 capability 蓝本落法**：

- `category`（必填）:= 源 category 逐字。
- `canonical_realization`（必填）**函数级落法**：component := 实现符号名、import := 实现文件路径（implementation 按 `#` 左右机械拆分：`src/shared/lib/format.ts#formatMoney` → `{component: "formatMoney", import: "src/shared/lib/format.ts"}`）——实现锚逐条特化在场，缺席即 fabricate（batch2 §5 SHELL 三字段缺席判例的**反向适用**：彼处实现为册级单文件无从逐槽特化故缺席，此处逐条可特化故必须落）。
- `forbidden`/`domain_states`/`variants`/`technology_base`/`poc_required`：源无 → 整体缺席（诚实缺席，不写空占位）。
- **realization 块缺席裁定**：KBM 机械词 MECHANICAL_LITERAL_EXPORT 只证**符号存在**（导出字面核验），调用侧接线未探测（probe 缺省=未探测，C5）→ realization 缺席 = 未声明接线主张（RealizationValue 注记：字段缺省 = 未声明）；`evidence=IMPLEMENTED` 由执行点/消费链在场支撑（inventory consumers_detected + 10/10 字面核验），不标 VERIFIED（迁移期无 CLM/VRF 台账）。

**axes 基线**：lifecycle=CURRENT（producer_alive=true + 消费链在场）/ confidence=LOCKED（版本化 schema formatter-registry.schema.json + 门禁消费链 + KBM 字面核验在场；对象无 pending 值冲突——MIG-B3/C-01/C-02/C-03 均不 attach 本资产）/ evidence=IMPLEMENTED / change=STABLE（pin 在场零漂移）。

**updated_at 处置**：源顶层 `updated_at` 墙钟字段（inventory `source_has_updated_at_field=true` 在案）按铁律 2 从机器字段剥离（mock-contract 组同款先例；ledger 已裁定）；剥离以 notes_md + 工具打印显式登记，非静默。源无 status/lifecycle 字段 → 双轴拆分动作数=0、superseded_status_field 登记数=0（诚实零）。

**KBM 佐证（非 pin 源）**：formatter_bindings 10 条与源逐条同源对账（governance_id/implementation/category/locale/policy_id/target_symbol/symbol_exists/status 全等）进工具 fail-closed 自检；KBM 为批次内草表（非 MASTer 资产、无 inventory pin 位）→ **不进 sources[]**，对账事实记 sources[0].locator.transcription 与 notes_md。多源 pin 纪律（batch2 §6）只适用 MASTer 资产第二源。

---

## 4. 本地族词形赐名通则（batch2 §5 判例升格，横切 §2 各节）

本批八族本地词形（`format-*`/`CALC-*`/`NEG.*`/`BP-*`/`STATE-*`/`MACHINE-*`/`MODEL.*`/`FIELD.*` 词形漂移）统一口径：

1. **只登记不改名**：源在 MASTer 只读仓，别名/赐名只发生在 vNext 对象侧，源数据零改动。
2. **canonical 赐名机械形**：`<GovernedPrefix>.<FAMILY>.<rest 段列>`——家族词保留为前缀后第二段；余段连字符→下划线、小写→大写、token 边界保留为段界（**禁单段摊平**：`STATE-PAGE-TASK-STEP-AUTHENTICATE-EDIT-DIRTY` 摊平单段 38 字符必超 32 上限，多段保留是文法要求不是风格）；纯数字尾段落 SEQ 末段位（文法 `(?:\.[0-9]+)?` 天然位，如 `CALC-BUC-10` → `CAPABILITY.CALC.BUC.10`）。
3. **任一段违文法**（超 32 字符 / 中文 / 数字开头）→ §2.2 准入门（HUMAN_CONFIRM_REQUIRED），不进机械转录批。
4. **非 ALIASES_V0 现役 8 族 → 非 A6 场景**：origin 保持源侧（inventory 逐字），legacy 词形照录 `aliases[]`；族级登记归词汇表 PR/Owner。
5. **赐名动作逐对象留痕**：`aliases[]`（legacy 词形）+ `sources[0].locator.transcription`（收编动作一句话）+ notes_md。

---

## 5. 幂等 / provenance / 自证（batch3 增补）

- 幂等与序列化全文照 batch1 约定书 §7；批次代号 `MIG-B3`；`captured_by` 形态 `agent:mig-b3/<tool 文件名>`；`producer_id=prod.mig_b3_<工具名小写蛇形>`。
- **大体量自证增补**：连跑两次全目录 sha256 零差异；工具报告 fresh/noop 计数（首跑 fresh=N、次跑 noop=N——文件字节是否变化是内容的确定性函数）。
- 源内墙钟字段剥离显式登记（§3）。

## 6. gate 结果纪律（本批若产出 GateResult 时生效）

batch2 §7 全文适用（verdict 七态 snake_case / counts 四必填 / trust 孪生 / denominator_refs 显式空数组 = 诚实声明 / 三红线）；转录工具自检不冒充 GateResult：不落 GRN 文件、不伪造 seq；自检失败 = 工具 exit 2 fail-closed。

---

## 附录 A：M2 golden 语义对照表（零丢失证明）

源：`outputs/frontend/10_planned/formatter-registry.yaml`（MASTer 仓内相对路径；扩展名 `.yaml`、内容为 JSON）→ 目标：10 个 `CAPABILITY.FORMAT.*` 对象（`truth/objects/capability/format.*.json`，kind=capability，一 formatter 一对象）。工具：`tools/ingest_formatter_registry.py`。

| # | 源语义单元 | 计数 | 目标位置 | 转录方式 |
|---|---|---|---|---|
| 1 | `document_type="formatter-registry"` | 1 | 10×`payload.source_document_meta.document_type` | 逐字（册级元数据随对象承载） |
| 2 | `schema_version=1` | 1 | 10×`…source_document_meta.schema_version` | 逐字 |
| 3 | `blueprint_sha256`（裸 hex） | 1 | 10×`…source_document_meta.blueprint_sha256` + 10×`sources[0].pin.digest` | 值不变；加 `sha256:` 前缀（D24/02b 补充纪律 1） |
| 4 | `updated_at`（墙钟） | 1 | —（机器字段零转录） | 铁律 2 剥离；notes_md + 工具打印显式登记（mock-contract 组先例；inventory `source_has_updated_at_field=true` 对账） |
| 5 | `formatters[]` 10 条目（数组序） | 10 | 10×`payload.formatter` | 整条逐字（`payload.formatter == formatters[i]` 工具断言；数组序=源序） |
| 6 | 每条 5 基础字段 name/category/implementation/locale/policy_id | 50 | 10×`payload.formatter.<同名字段>` | 逐字 |
| 7 | `applies_to_fields[]`（5 条目携带） | 5 数组 / 12 路径项 | `payload.formatter.applies_to_fields` | 逐字（数组序=源序） |
| 8 | `precision_policy`（5 条目携带 × 7 字段） | 35 | `payload.formatter.precision_policy` | 逐字（中文 rule 亦逐字，merge-preserving） |
| 9 | 10 个 `format-*` 词形（注册表本地族词形） | 10 | `aliases[]` + canonical 赐名投影 | 照录；canonical 赐名 `CAPABILITY.FORMAT.*`（§3；非 A6 场景，origin 保持 derived） |
| 10 | implementation 锚逐条特化 | 10 | `payload.canonical_realization{component,import}` + `key_bindings.code` | `#` 机械拆分；锚 `expect={governance_id, symbol}`，`match_rule=mechanical`，probe 缺省=未探测（C5） |
| 11 | status / lifecycle 类字段 | 0 | — | 源不存在：双轴拆分登记数=0、superseded_status_field 登记数=0（诚实零） |
| 12 | （转录期登记，非源语义单元）KBM formatter_bindings 10 条佐证 | 10 | 工具 fail-closed 自检 + `locator.transcription` | 同源对账（governance_id/implementation/category/locale/policy_id/target_symbol/symbol_exists/status 全等）；草表非 pin 源，不进 sources[] |

合计叶子语义单元 **100**（册级 meta 3 + 基础字段 50 + applies_to_fields 路径项 12 + precision_policy 字段 35），另 10 条身份词形照录 aliases；`updated_at` 1 项显式剥离登记。零丢失、零增删、零语义升级登记（第 4/12 行为登记/对账项非转录项）。

分母硬判据三重一致：源 `formatters` len=**10** = 落盘对象数 **10** = inventory `denominators.formatter_entries.value` = **10**（工具 fail-closed 断言）；伴随对账：categories distinct=10=breakdown.categories、implementation_anchors_verified=10=breakdown.implementation_anchors_verified、KBM `summary_counts.formatter_bindings=10`=`formatter_verified=10`。源 pin `ed0beff9…8505` 与 inventory 逐字一致（工具现场重算）。

源条目序（= 落盘对象族序）：date / time / datetime / number / money / percent / currency / unit / enum / empty。

## 附录 B：ingest 工具契约（batch3 增补版，照 batch2 附录 B 形状扩充）

流程（`tools/ingest_<source_stem>.py`）：

1. 读源（JSON 优先、YAML 回退；bytes 一次性读入）。
2. sha256 现场重算 + inventory `content_sha256` pin 比对（逐源 fail-closed）。
3. 源结构断言（顶层键闭集 / document_type / schema_version / 主体数组形态 / 条目字段闭集 / 条目词形闭集 / 消费方 schema 枚举闭集（formatter-category 10 值）/ 实现锚词形）。
4. 分母硬判据对账（batch2 §B.4 三重一致；有准入门挡下条目时升级三桶恒等式，硬约束 4）。
5. 佐证源交叉对账（batch3 新增）：批次内草表（KBM）做结构对账（无 pin）；MASTer 第二资产才走多源 pin（batch2 §6）。
6. 构建信封（§3/§4 + batch1 约定书 §2/§4/§5/§6/§8）。
7. ID 文法校验：canonical 正则 + 15 前缀闭包断言（`vocab.ts` v0.2 镜像，`assert len == 15`）+ ALIASES_V0 族数断言（`assert == 8`）。
8. 02 schema 校验：逐对象 `jsonschema.validate`（按 `$schema` 自动选 draft-07）。
9. 红线 1 自校验：local-name 推导 + 全小写断言 + 唯一性断言（分片形态断言到完整相对路径）。
10. merge-preserving 断言：payload 承载的源条目与源数据字节等价。
11. bytes 落盘（`write_bytes`；fresh/noop 计数）。
12. 显式打印分母（源条目数/对象数/叶子单元数/登记数/剥离数，逐项带来源），ASCII 输出。

出口：`0` = 成功；`2` = fail-closed（pin 失配 / 分母失配 / 佐证对账失配 / 校验失败 / 文件名违例，不落盘）。重复运行幂等（同输入 byte-identical）。

工具自检不是 GateResult（§6），不落 GRN 文件、不伪造 seq。
