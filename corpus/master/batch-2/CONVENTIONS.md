# MIG-B2 转录约定书（CONVENTIONS）—— batch2 扩充

效力区间：`corpus/master/batch-2/` 下自 M2 起的全部 truth 对象转录组。后续批次纳管施工前必读；本文是施工规范，不是散文。

与 batch1 的关系：本文**只扩充、不推翻** `corpus/master/batch-1/CONVENTIONS.md`（下称「batch1 约定书」）。batch1 约定书的 §2 信封字段、§5 别名收编、§6 provenance、§7 幂等确定性、§8 字段归属、§9 gate 结果词汇继续全文有效；本文只做三件事：批次换代号（`MIG-B1`→`MIG-B2`）、登记 batch2 特有对象形态（§2–§5）、把 BATCH-1 核验实录教训固化为三条红线（硬约束 7）。

冲突裁决顺序：FROZEN 事实源（`packages/schemas/assets/02-object-envelope.schema.json`、`02b-kind-payloads.md`、`03-gate-result.schema.json`、`packages/kernel/src/gate-result.ts`、`packages/schemas/src/vocab.ts`）> `corpus/master/batch-2/classification-ledger.yaml` 已裁定事项 > 本约定 > batch1 约定 > 转录者个人判断。

硬约束（违者返工；1–6 继承 batch1 约定书硬约束同号条目，此处只列 batch2 差异点）：

1. MASTer_master（`D:\Vscode Documents\MASTer_master`）绝对只读；一切产出写 `corpus/master/batch-2/`（batch2 独立目录，不混入 batch1）。
2. 禁墙钟；批次代号固定 `MIG-B2`；同输入重跑 byte-identical（幂等）。
3. 确定性序列化照 batch1 约定书 §7（`sort_keys=True, indent=2, ensure_ascii=False` + 末尾 `\n`，bytes 写入，UTF-8 无 BOM）。
4. 分母一等公民：分母硬判据对账是 batch2 每个转录工具的 fail-closed 自检项——源条目数、落盘对象数、inventory 分母实测值三者必须相等（M2 golden 实证见 §5 与附录 A；inventory `denominators.composition_entries.value_breakdown.application_shell_slots=7` 即机器可对账的分母登记位）。
5. ID 文法 15 前缀闭世界不变（`vocab.ts` `GOVERNED_ID_PREFIXES`，`assert len == 15`）；vocab 已至 v0.2（PR-0001 append-only，v0.1 词值零删改）：**别名族现役 8 个**——`KB-*`、`GRID.*`、`PAGE-TASK-STEP-*`、`TASK-*`、`CHANGE-*`、`ISSUE.*`、`FTA-*`、`FB-*`。页面用 `PAGE.*`、组件 `COMPONENT.*`、能力 `CAPABILITY.*`。
6. 对象信封过 FROZEN `02-object-envelope.schema.json`；gate 结果过 FROZEN `03-gate-result.schema.json`（verdict 七态 snake_case，见 §7）。
7. **BATCH-1 教训三条红线（新增，核验实录固化为硬约束）**：
   - **红线 1 · 文件名小写**：local_name 推导必须走 batch1 约定书 §1 规则且**必须 `.lower()`**（batch1 曾 126 个 change-object 文件名大写违例整体返工）。工具落盘前逐文件自校验：`id 去前缀 → 各段下划线转连字符 → 小写 → '.' 连接 → '.json'`，并断言全小写与唯一性。
   - **红线 2 · 合规 AGG**：任何聚合/汇总结果（aggregate/summary/多 gate 汇总）必须逐字段过 FROZEN `03-gate-result.schema.json` 完整 GateResult 形态（`grn/gate/gate_def/tool/tool_version/metric_dialect/ran_at_seq/verdict/denominator_refs/counts/blindspot/trust/duration_ms` 全 required），**禁自由形状**（batch1 AGG-MIG-B1-grid 曾自由形状返工重造）。迁移语境无全局 seq 分配器：`ran_at_seq` 钉 0 并留 A4 注记（batch1 GTR 先例）；排序用 `grn`。
   - **红线 3 · 盲区指标**：`verdict=skipped_blindspot` 必附 `blindspot` 指标（`scanned/produced/escape_ratio` 必填）+ `blindspot.fixture_regression` 证据引用（载体明知不可达时「跳过」本身必须是可判卷的数字与证据，不是沉默）。`passed` 且 `violations>0` 非法（`counts.violations` 与 `trust.recomputed.violations` 同源一致性是工具自检项）。
8. 禁 git 操作；禁改 `POMaster_VNext` 的 `packages/`、`catalog/`、`examples/`、`benchmarks/`、`tests/` 等任何其他路径；测试/工具只进 `corpus/master/batch-2/tools/`。
9. provenance 每对象必填（batch1 约定书 §6 形态照用；`locator.batch="MIG-B2"` + `locator.ingested_from` 逐对象登记）。
10. merge-preserving：人类策展字段逐字保真（batch1 约定书 §10 全文有效）；数值语义不得篡改（33 DRAFT 就是 33 DRAFT；48px/64px 双值并存就并存转录，裁决归 Owner）。
11. 语义转录 ≠ 格式转换（batch1 约定书 §11 全文有效）。
12. Python 3.14 环境注意照 batch1 约定书 §12。

---

## 1. 目录布局与 kind-dir（延续 batch1 闭表）

```
corpus/master/batch-2/
├── CONVENTIONS.md                        # 本文件（batch2 扩充）
├── inventory.yaml                        # M0 只读盘点（pin 事实源，只读消费）
├── classification-ledger.yaml            # M1 分类台账（裁定事实源，只读消费）
├── key-binding-map.batch2.draft.yaml     # 页面锚点三方对齐草表（只读消费）
├── tools/                                # ingest 工具（确定性幂等，只进这里）
│   ├── build_m0_inventory.py
│   ├── build_m1_classification_ledger.py
│   └── ingest_shell_registry.py
└── truth/
    └── objects/
        └── <kind-dir>/<local-name>.json  # 信封对象（一对象一文件）
```

kind-dir 沿用 batch1 约定书 §1 十类闭表，**禁即兴派生**；batch2 在册的合法 kind-dir：

| kind（信封枚举值） | 目录名 | batch2 用途（ledger 裁定） |
|---|---|---|
| page_surface | `page-surface/` | 页面注册/就绪/蓝图/导航/转移五源挂 `PAGE.*` 对象 |
| component | `component/` | 应用壳槽位、组件选择态、vendor 库 |
| business_rule | `business-rule/` | 构图词表四件套（POLICY.\* 整册一对象，batch1 §3 判例） |
| contract_operation | `contract-op/` | API 契约（batch1 判例延续） |
| 其余七类 | 照 batch1 表 | 未用到时目录不建 |

local-name 规则照 batch1 约定书 §1 + 本文件红线 1（`.lower()` 硬断言）。样例：`COMPONENT.SHELL.TOP_BAR` → `shell.top-bar.json`。

---

## 2. page_surface 对象形态（PAGE.*）

一页一对象（ledger destination_kind「PAGE.\* surface 对象，一页一对象」）。payload 三段承载：

1. **surface 结构**：`surface`（必填，02b §6；Page Spec 双分母归属走信封 `denominator_refs`）、`template_ref`（page-template-registry 的 `PAGE.*` 模板词形按值引用）、`regions/slots`（蓝图 region/slot 值引用，槽位词表 `PAGE_SLOT.*` 16 槽为合法集）。
2. **导航归属**：navigation-structure 逐叶转录的 `nav_group/nav_entry`（含 drill_down 关系、共用叶保真）。物理 route 串**不落 payload**——路由权威在 `KEYBINDING.*`（page↔dir，A7 P0 三类之一），双真相封堵（02b §6 注记）。
3. **shell 归属**：渲染宿主壳（`shell_name`，现值 `MasterApplicationShell`）+ 内容宿主槽位引用（现值 `SHELL.MAIN_CONTENT`，scroll/error 边界语义在槽位对象侧，见 §5）。

id 词形与分母纪律：

- 三源分母 = application-page-registry `pages[]` 35 ∪ page-readiness-registry 39 ∪ screen-blueprints 39 的 page id **并集 39**（实测 registry ⊂ readiness = blueprints）。分母漂移（summary 自述 32 vs 实数 35 vs 目录 39 含 4 份 orphan）→ **MIG-B2/C-01 pending，不得机械定格 35 或 39**；4 份 orphan（`PAGE-TASK-STEP-GENERATE-SNAPSHOT/-SAVE-BOM/-VIEW-ALL-PARTS/-WRITEBACK-LEDGER`）的注册归属未裁决前按异常承载（§3）登记。
- `PAGE-TASK-STEP-*` 词形：`PAGE-TASK-STEP-*→PAGE.*` 为 ALIASES_V0 已登记族（token 重排）→ rename-on-ingest 收编，legacy 词形照录 `aliases[]`，对象 `origin=ingested`（A6 场景，batch1 约定书 §6 OBS-3 裁定口径）。
- `PAGE-APP-*` 词形：ALIASES_V0 无此规则，canonical 拟合 `PAGE.APP_*`（token 重排外推）全部 **HUMAN_CONFIRM_REQUIRED**（`key-binding-map.batch2.draft.yaml` alias_registrations.proposed_needs_human）——落 `PAGE.*` 对象前须人工裁决，裁决前只登记不改名。

## 3. blueprint 对象形态（screen-blueprint → PAGE.* surface 对象）

蓝图 = 该页设计契约，三层对象化边界（ledger meta.blueprint_objectification_strategy）：

| 层 | 内容 | 落位 |
|---|---|---|
| 结构 | `page.template.id`（PAGE.LIST/PAGE.DETAIL/…）+ regions/slots | payload（template_ref/regions/slots） |
| 交互 | actions 摆位（ACTION.\* 词表值引用） | payload（actions） |
| 字段语义 | 字段级语义 | payload 或 `FIELD.*` 派生引用（不得内联字典值副本） |

- **unresolved → 异常承载**：蓝图内 unresolved/待裁决项（orphan 归属、ISSUE 悬项、跨源漂移）不静默丢弃、不静默裁决 → conflict 登记 / Exception Ledger 承载（MIG-B2/C-01 的 4 份 orphan blueprint 为在案先例；batch1 §4「禁自动映射」同源纪律）。
- **散文留 notes_md 摘要 + 源指针**：蓝图内散文叙事浓缩进信封 `notes_md`（机器永不解析，P9）+ `sources[].locator` 结构化源指针；**蓝图 YAML 正文不整本搬运**（ledger destination_note 明示）——逐字段保真限于结构化语义单元，散文搬运即把 notes 变机器字段。
- `page.status`（APPROVED=15/DRAFT=18/BLOCKED=6，39 份实测）为**设计审批轴**事实，经 authorizations 授权链在案 → authority `delegates=[{role: HUMAN_OWNER, required_for: ["approve_page_blueprint"]}]`（ledger 在案）；实施就绪轴在 page-readiness-registry（§4 双轴分立，禁混轴）。

## 4. readiness 双轴化规则（approval_axis × evidence_axis）

旧扁平 `status` 一词多义（批准没有/证据有没有/变了没有），转录拆正交双轴。实测分母 39 条（= pages[] 35 + orphan 4，MIG-B2/C-01）；status 分布 **DRAFT=33 / BLOCKED=6 / READY=0**（M1 复测，数值不篡改）。

对照表（ledger dual_axis_preregistration 的成文形态）：

| 旧扁平 status | approval 轴（axes.lifecycle） | evidence 轴（证据链） | 条数 |
|---|---|---|---|
| DRAFT | `PROPOSED`（**事实记录**，非语义降级） | notes 证据事实逐条随条目保真 | 33 |
| BLOCKED | `PROPOSED`（事实记录）+ 阻断事实登记 | 同上 | 6 |
| READY | `CURRENT`（**只登记不执行**——实测 0 条，语义升级归 Owner 裁决） | — | 0 |

- **evidence 轴内容**（虚假 attest 教训的在仓防线，逐条保真）：33 条『readiness 按 MD 证据纠正(虚假 attest->false)』纠正标记 + 24 条 `last_updated_by=page-spec-attest-2026-08-06` attest 记录 + 1 条第二轮审计标记。attest 自报值永不单独判卷（C5）——纠正标记与 attest 记录一并转录，纠正痕迹不清洗。
- **双轴分立**：screen-blueprints `page.status`（APPROVED/DRAFT/BLOCKED）为设计审批轴，与 readiness 实施就绪轴词形分立；M1 cross-tab（APPROVED→DRAFT 15 / DRAFT→DRAFT 18 / BLOCKED→BLOCKED 6，BLOCKED 集合精确一致=True）——两轴词形差由双轴化吸收，**非矛盾、不立 conflict**。
- **superseded_status_field 登记**（batch1 约定书 §4 形状，batch2 readiness 实例参数照录 ledger）：

```json
"superseded_status_field": {
  "source_field": "status",
  "source_value": "DRAFT=33/BLOCKED=6/READY=0（39 条全覆盖）",
  "mapped_to": "approval×evidence 双轴拆分（batch1 约定书 §4）：审批/推进态迁 lifecycle 轴、attest/纠正证据迁 evidence 轴；语义升级留待 Owner 裁决",
  "upgrade_registered": true,
  "reason": "旧扁平 status 一词多义（批准没有/证据有没有/变了没有），转录时拆正交双轴；数值语义不篡改"
}
```

- 拆分自检三连照 batch1 约定书 §4（批准没有→lifecycle/confidence；接了没有→evidence/realization；变了没有→change）。

## 5. shell 槽位对象形态（M2 golden：application-shell-registry）

**粒度裁定：逐槽一对象（7 slots → 7 objects）**——与 batch1 §3 字典型「整册一对象」判例的分歧点，按 batch1 §3 自身例外条款论证（后续组遇同类照此三问，不得静默换粒度）：

1. ledger destination_note 裁定「SHELL.\* 7 槽位**逐条**挂壳组件对象 payload」（对比 page-anatomy-registry 的「整册转录…不逐槽立对象」——同为槽位数组，裁定相反，逐条以 ledger 为准）。
2. 下游存在**按槽位 id 逐条引用的检索路径**（batch1 §3 例外条款成立）：源内 `scroll_owner` 指向 `SHELL.MAIN_CONTENT`；navigation-structure `shell_overrides` 覆盖 `SHELL.SIDE_NAV` 宽度；实现锚逐槽特化（`ShellUserMenu.vue`/`RouteErrorBoundary.vue`，M0 consumers_detected 在案）。
3. 槽位各自独立演化（宽度/可见性/owner 逐槽变更），整册一对象会把单槽变更放大成整册协调变更。

对象形态（`tools/ingest_shell_registry.py` 为参考实现）：

- **id 赐名**：`SHELL.*` 为注册表本地族词形、非 governed id 且不在 ALIASES_V0 现役 8 族 → canonical 赐名 `COMPONENT.SHELL.<SEGMENT>`（家族前缀保留为第二段，`GRID.*→CAPABILITY.GRID.*` 同形机械映射），legacy 词形照录 `aliases[]`。**不构成 A6 场景**（batch1 约定书 §6 边界条款：非 ALIASES 表词形赐名照录 ≠ rename-on-ingest），对象 `origin` 保持源侧（inventory `provenance.origin=derived` 逐字）；SHELL.\* 别名族正式登记待词汇表 PR/Owner 裁决。
- **payload**：`slot`（源条目整条逐字，与 `slots[i]` 字节等价为工具断言）+ `shell_name` + `source_document_meta`（document_type/schema_version/blueprint_sha256，后者加 `sha256:` 前缀）。
- **册级语义落引用目标对象**：源顶层 `scroll_owner` 与 `error_boundary`（route-level，wraps SHELL.MAIN_CONTENT）落位于 `COMPONENT.SHELL.MAIN_CONTENT` payload（零丢失，落位见附录 A 第 5/6 行）；不复制到其余六槽（重复登记即分叉隐患）。
- **悬置态**：未裁决冲突在身的对象 `confidence=PROVISIONAL`（batch1 约定书 §2 悬置态条款），禁 `UNRESOLVED` 兜底——`SHELL.SIDE_NAV` 因 MIG-B2/C-02（覆盖注记所指 220px 已失真 + collapsed 48px vs 64px 两值并存）取 PROVISIONAL，其余六槽 LOCKED。
- **pending_conflicts 登记**（batch2 合法扩展字段，形状在此登记、非匿名扩展；values 逐字并存，数值语义不篡改，绝不自动裁决）：

```json
"pending_conflicts": [
  {
    "conflict_id": "MIG-B2/C-02",
    "subject": "（一句话冲突主语）",
    "values_in_conflict": [
      {"source": "<源 rel 路径>", "role": "<侧别>", "value": "<逐字值/值对象>"}
    ],
    "rule": "classification-ledger conflicts_pending_owner: report only, never auto-adjudicate",
    "resolution": "PENDING_OWNER"
  }
]
```

- **02b §3 component 蓝本三字段缺席先例**：槽位非独立实现单元，实现为册级单文件 `MasterApplicationShell.vue` → `component_name/implements_capability/import_path` 不逐槽 fabricate；实现名以 `payload.shell_name` 承载、文件锚以 `key_bindings.code` 承载（batch1 vendor-adapter implements_capability 缺席同款先例）。
- `key_bindings.code`：每槽一条 `artifact_type=file` → `src/app/shell/MasterApplicationShell.vue`，`expect={slot_id, shell_name}`，`match_rule=mechanical`，**probe 缺省 = 未探测**（gate 必须重扫，不伪造 probe.result，C5）。

---

## 6. 幂等 / provenance / 多源 pin（batch2 增补）

- 幂等与序列化全文照 batch1 约定书 §7；批次代号 `MIG-B2`；`captured_by` 形态 `agent:mig-b2/<tool 文件名>`。
- **多源 pin**：涉及第二源的工具（如 C-02 双值对侧证据源）逐源现场重算 sha256 并与 inventory `content_sha256` 比对，任一失配即 fail-closed（exit 2）——带着任何一个源的漂移转录都是违例。
- `origin=derived` ⇒ producer 块必填（信封条件式 1）；`producer_id=prod.mig_b2_<工具名小写蛇形>`；`merge_semantics` 按工具真实语义声明。

## 7. gate 结果纪律（本批若产出 GateResult 时生效）

- verdict 落盘词形 = FROZEN 七态 snake_case：`passed / failed / warning / blocked / not_run / not_configured / skipped_blindspot`；设计散文连字符形禁落盘（batch1 约定书 §9 全文有效）。
- 必带：`counts` 四必填（scanned / applicable_scanned / violations / not_applicable）；`trust.asserted`/`trust.recomputed` 孪生（自报值永不单独判卷）；`denominator_refs`（迁移期未注册 DENOMINATOR.\* 对象 → 显式空数组 = 诚实声明，分母数值与来源逐项写 `scope.note`）。
- 三红线（硬约束 7）在此全文适用：合规 AGG 形态 / skipped_blindspot 必附盲区指标 / passed+violations>0 非法。
- 转录工具自检**不冒充 GateResult**：不落 GRN 文件、不伪造 seq；自检失败 = 工具 exit 2 fail-closed。

---

## 附录 A：M2 golden 语义对照表（零丢失证明）

源：`outputs/frontend/10_planned/application-shell-registry.yaml`（MASTer 仓内相对路径；扩展名 `.yaml`、内容为 JSON）→ 目标：7 个 `COMPONENT.SHELL.*` 对象（`truth/objects/component/shell.*.json`，kind=component）。

| # | 源语义单元 | 计数 | 目标位置 | 转录方式 |
|---|---|---|---|---|
| 1 | `document_type="application-shell-registry"` | 1 | 7×`payload.source_document_meta.document_type` | 逐字（册级元数据随对象承载） |
| 2 | `schema_version=1` | 1 | 7×`…source_document_meta.schema_version` | 逐字 |
| 3 | `blueprint_sha256`（裸 hex） | 1 | 7×`…source_document_meta.blueprint_sha256` | 值不变；加 `sha256:` 前缀（D24/02b 补充纪律 1） |
| 4 | `shell_name="MasterApplicationShell"` | 1 | 7×`payload.shell_name` | 逐字 |
| 5 | `scroll_owner="SHELL.MAIN_CONTENT"` | 1 | `COMPONENT.SHELL.MAIN_CONTENT` `payload.scroll_owner` | 逐字（册级语义落引用目标对象） |
| 6 | `error_boundary{scope,isolation,protocol}` | 3 | `COMPONENT.SHELL.MAIN_CONTENT` `payload.error_boundary` | 逐字（route-level wraps SHELL.MAIN_CONTENT） |
| 7 | `slots[]` 7 条目（数组序） | 7 | 7×`payload.slot` | 整条逐字（`payload.slot == slots[i]` 工具断言；数组序=源序） |
| 8 | 槽位叶子字段 | 29 | 7×`payload.slot.<同名字段>` | 逐字（6 槽×4 字段 + BREADCRUMB `visibility`；layout 中文散文亦逐字，merge-preserving） |
| 9 | 7 个 `SHELL.*` 词形（注册表本地族词形） | 7 | `aliases[]` + `payload.slot.id` | 照录；canonical 赐名 `COMPONENT.SHELL.*`（非 A6 场景，origin 保持 derived） |
| 10 | status / lifecycle / updated_at 类字段 | 0 | — | 源不存在：双轴拆分登记数=0、superseded_status_field 登记数=0（诚实零） |
| 11 | （转录期登记，非源语义单元）MIG-B2/C-02 双值 | 1 | `COMPONENT.SHELL.SIDE_NAV` `payload.pending_conflicts` + 第二来源 pin | 双值逐字并存（本槽 layout collapsed:48px vs shell_overrides 64px；覆盖注记所指 220px 失真如实登记），绝不自动裁决；对侧 confidence=PROVISIONAL（§5 悬置态） |

合计：槽位叶子 **29** + 册级 **8**（meta 3 + shell_name 1 + scroll_owner 1 + error_boundary 3）= **37** 叶子语义单元，另 7 条目身份词形照录 aliases（合计 44），零丢失、零增删、零语义升级登记（第 11 行为登记项非转录项）。

分母硬判据三重一致：源 `slots[]` len=**7** = 落盘对象数 **7** = inventory `denominators.composition_entries.value_breakdown.application_shell_slots` = **7**（工具 fail-closed 断言；源 pin `cca0a9d7…dac7`、nav pin `ec6c25f3…8870` 均与 inventory 逐字一致）。

源槽位序（= 落盘对象族序）：TOP_BAR / SIDE_NAV / BREADCRUMB / MAIN_CONTENT / GLOBAL_MESSAGE / GLOBAL_TASK / USER_MENU。

## 附录 B：ingest 工具契约（batch2 增补版，照 batch1 §11 形状扩充）

流程（`tools/ingest_<source_stem>.py`）：

1. 读源（JSON 优先、YAML 回退；bytes 一次性读入）；多源工具逐源读入。
2. sha256 现场重算 + inventory `content_sha256` pin 比对（**逐源** fail-closed）。
3. 源结构断言（顶层键闭集 / document_type / schema_version / 主体数组形态 / 条目字段闭集 / 条目 id 词形闭集）。
4. **分母硬判据对账**（batch2 新增）：源条目数 == 落盘对象数 == inventory 分母实测值，失配即 fail-closed。
5. 构建信封（本约定书 §2–§5 + batch1 约定书 §2/§4/§5/§6/§8）。
6. ID 文法校验：canonical 正则 + 15 前缀闭包断言（前缀表注释标明 `vocab.ts` v0.2 镜像源，`assert len == 15`）。
7. 02 schema 校验：逐对象 `jsonschema.validate`（按 `$schema` 自动选 draft-07）。
8. **红线 1 自校验**（batch2 新增）：local-name 规则推导 + 全小写断言 + 唯一性断言。
9. **merge-preserving 断言**：payload 承载的源条目与源数据字节等价。
10. bytes 落盘（`write_bytes`）。
11. 显式打印分母（源条目数/对象数/叶子单元数/登记数，逐项带来源），ASCII 输出。

出口：`0` = 成功；`2` = fail-closed（pin 失配 / 分母失配 / 校验失败 / 文件名违例，不落盘）。重复运行幂等（同输入 byte-identical）。

工具自检不是 GateResult（§7），不落 GRN 文件、不伪造 seq。

---

## 附录 C：M2 转录组 C 前半语义对照表（screen-blueprints 前半 20 份，零丢失证明）

源：`outputs/frontend/10_planned/screen-blueprints/`（MASTer 仓内相对路径；扩展名 `.yaml`、内容为 JSON）字典序前 20 份（PAGE-APP-ALL-PARTS-LIST … PAGE-APP-SET-DB，与 inventory/ledger 顺序一致）→ 目标：20 个 `PAGE.APP_*` 对象（`truth/objects/page-surface/app-*.json`，kind=page_surface，一蓝图一 surface 主对象）。工具：`tools/ingest_screen_blueprints_front_half.py`。

| # | 源语义单元 | 计数 | 目标位置 | 转录方式 |
|---|---|---|---|---|
| 1 | `document_type="screen-blueprint"` | 20 | 20×`payload.blueprint.source_document_meta.document_type` | 逐字 |
| 2 | `schema_version=1` | 20 | 20×`…source_document_meta.schema_version` | 逐字 |
| 3 | `blueprint_sha256`（裸 hex） | 20 | 20×`…source_document_meta.blueprint_sha256` + 20×`sources[0].pin.digest` | 值不变；加 `sha256:` 前缀（D24/02b 补充纪律 1） |
| 4 | `page.id` 词形（PAGE-APP-*，20 个） | 20 | 20×`aliases[]`（legacy 照录）+ `payload.blueprint.source_page_id` + key_bindings expect | 照录不改名；canonical 拟合 `PAGE.APP_*` 登记 HUMAN_CONFIRM_REQUIRED（X 系登记，见第 15 行） |
| 5 | `page.name`（中文页名） | 20 | 20×`title_zh`（"页面·<name>"） | 逐字内嵌 |
| 6 | `page.status`（APPROVED=4/DRAFT=16/BLOCKED=0，实测） | 20 | 20×`payload.blueprint.page_status`（事实记录）+ 20×`payload.blueprint.superseded_status_field` | 设计审批轴事实（与 readiness 实施就绪轴分立，禁混轴）；数值语义不篡改；对象 axes 不承载页设计状态 |
| 7 | `page.template.id` | 20 | 20×`payload.template_ref`（值引用）+ `payload.blueprint.template` | 逐字；模板分布 LIST=14/DETAIL=4/DASHBOARD=1/MASTER_DETAIL=1 |
| 8 | `page.regions[]`（含嵌套 slots/中文注记散文） | 75 条 | 20×`payload.blueprint.regions` | 结构层逐字（数组序=源序；内嵌注记散文亦逐字，merge-preserving——附录 A 第 8 行判例） |
| 9 | `page.states[]` | 224 项 | 20×`payload.blueprint.states` | 逐字 |
| 10 | `page.actions[]` | 107 条 | 20×`payload.blueprint.actions`（交互层）+ `payload.actions`/`payload.slots`（ACTION.*/PAGE_SLOT.* 值引用，首现序去重） | 逐字 + 词形引用投影 |
| 11 | `page.api_requirements[]`（ACCEPTED=66 / NEEDS_BACKEND_REVIEW=9，含 3 条 reason-only） | 75 条 | 20×`payload.blueprint.api_requirements` | 逐字（API_REQ.* governed 词形值引用；NEEDS_BACKEND_REVIEW 缺 method/path 条目必附 reason 的形状经工具断言） |
| 12 | `page.error_rendering` | 20 | 20×`payload.blueprint.error_rendering` | 逐字 |
| 13 | `page.shared_by` | 2 页 | 2×`payload.blueprint.shared_by`（CSC-PRICE/EVALUATION） | 逐字；其余 18 页缺席以缺席表达 |
| 14 | `page.unresolved[]` | 73 条 | 20×`payload.blueprint.unresolved_exceptions`（carrier=exception_ledger） | **逐条转 Exception Ledger 承载：显式未决，不静默丢弃、不静默裁决** |
| 15 | `page.notes[]` + `composition_adjudication`（散文叙事/裁决记录） | 4 页 16 条 + 1 条 = 17 | 信封 `notes_md` 摘录 + `sources[0].locator.line_anchors`（行号锚）+ `payload.blueprint.prose_to_notes_md`（机器可读登记） | **不整本搬运**：`摘要（全文按源指针回读）：<截断摘录｜none (honest zero)>` 锚行 + 源指针；摘要块 ≤10 行（2026-08-29 修订：锚行措辞与 GRN-4303 机械代理判据 `PROSE_ABSTRACT_MARK`/`PROSE_ABSTRACT_NONE` 对齐，同组 D 工具同款；原「摘录（截断，…）」措辞不被 gate 识别，详见 C.1 修订注记） |
| 16 | PAGE-APP-* 词形拟合登记（转录期，非源语义单元） | 20 | 20×`payload.canonical_id_grant`（组 B 在场时）或本组登记 + `aliases[]` + confidence=PROVISIONAL | HUMAN_CONFIRM_REQUIRED（非 ALIASES_V0 现役 8 族）；origin 保持源侧 derived（非 A6）；Owner 裁决后可转 LOCKED |
| 17 | （转录期登记）key_bindings page↔dir + route_name 机械锚 | 40（20×2） | `key_bindings.code`（source_dir + routes.ts，值=源词形逐字） | probe 缺省=未探测（gate 必须重扫，C5）；KEYBINDING.* 表对象仍待人工裁决 |

合计语义单元 **737** 条（数组/字典按条目级计数，条目内叶子字段不再展开计数——regions/slots 内嵌网格/上下文等嵌套结构以工具断言的逐字等价为准，口径区别于附录 A 第 8 行的叶字级计数）：meta 3×20=60 + page.id/name/status/template 4×20=80 + regions 75 + states 224 + actions 107 + api_requirements 75 + error_rendering 20 + shared_by 6（2 页×3 项）+ unresolved 73 + notes 摘录指针 17。另 20 条目身份词形照录 aliases、40 条转录期锚登记。零丢失、零增删、零静默裁决登记。

分母硬判据三重一致：目录 blueprint 数 **39** = inventory `denominators.blueprints.value` **39**；本组前半 **20** = 落盘对象数 **20**（一蓝图一 surface 主对象）；后半 19（PAGE-APP=4 + PAGE-TASK-STEP=15）归第二半工具，本工具不触碰。

### C.1 跨转录组合并登记（五源共物件，铁律 3 merge-preserving）

> **修订注记（2026-08-29，BATCH-2 独立核验 FAIL-1/FAIL-2 整改时修订）**：本节初稿按「五源同文件收敛」模型撰写；交付态实际落位为 **facet 分档模型**——registry/readiness/nav 各组落在自有 facet 文件（`PAGE.REGISTRY.*` / `PAGE.READINESS.*` / `PAGE.NAV.*`），本组落 `PAGE.APP_*` surface 主对象，页级收敛经 `payload.id_facet.page_level_id` + `merge_path=supersede` 登记，**不发生同文件叠写**。因此下表 X-01..X-05 在交付态 20 对象上**均未触发**（fresh 单层直写，无共置图层即无分歧），整表重新定性为**合并路径备用语义**（与 X-05 原标注同款）。FAIL-2 整改新增红线：`payload.pending_conflicts` 键的存在性是内容的确定性函数——**非空才写键，空则不写**（fresh 路径与 merge 路径由此收敛到同一输出形态；同款空键 `[]` 泄漏曾在组 D 交付盘面出现 15 份，已由组 D 工具同款修复清除并随链重放收敛）。

page-readiness 转录组（`tools/ingest_page_readiness.py`）与本组同挂 `PAGE.*` 词族。若共置同一对象文件（现交付态不发生），本工具 merge 路径的落盘策略为：**既有层逐字保真、只刷新本组持有路径**（`payload.surface/template_ref/slots/actions/blueprint`）、`sources[]`/`key_bindings.code`/`authority.delegates` 求并、`notes_md` 追加；信封级分歧（单值字段两图层各有一值）**一律登记 `payload.pending_conflicts`（MIG-B2/X-01..X-05），绝不自动裁决**；冲突在身 ⇒ `axes.confidence=PROVISIONAL`（batch1 §2 / batch2 §5 悬置态）。登记语义（X-01..X-05，合并路径备用形状，交付态未触发）：

| conflict_id | 分歧 | 两侧值（若同文件相遇时的两侧候选） | 保留值 |
|---|---|---|---|
| MIG-B2/X-01 | authority.owner 双 ledger 候选 | readiness 侧 FRONTEND_ENGINEERING vs blueprint 侧 FRONTEND_ARCHITECTURE | 既有值 |
| MIG-B2/X-02 | axes.lifecycle 双轴语义 | PROPOSED（readiness DRAFT 事实记录）vs CURRENT（源活跃 canonical） | 既有值 |
| MIG-B2/X-03 | axes.confidence | LOCKED vs PROVISIONAL（悬置态规则生效后统一 PROVISIONAL） | PROVISIONAL（悬置态） |
| MIG-B2/X-04 | producer 块单数 vs 双 producer 图层 | `prod.mig_b2_ingest_page_readiness`（refresh_fields=["payload"]，整 payload 刷新主张有 clobber 风险）vs 本组 `…front_half`（["payload.blueprint"]，路径域刷新） | 既有值 |
| MIG-B2/X-05 | payload 顶层同键异值（备用形状） | — | — |

X-01..X-05 若触发，为对象层登记（payload.pending_conflicts 承载），ledger `conflicts_pending_owner` 尚未收编——归编排方/Owner 仲裁后统一升级。幂等自证（修订后实测）：同输入+同盘面连跑两次全目录 sha256 零差异；交付态首跑 **fresh=20**、次跑 **noop=20**（键存在性=内容的确定性函数 ⇒ merge 路径零字节差）。
