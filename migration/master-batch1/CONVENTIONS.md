# MIG-B1 转录约定书（CONVENTIONS）

效力区间：`migration/master-batch1/` 下自 M2 起的全部 truth 对象转录组。后续 4 个转录组施工前必读；本文是施工规范，不是散文。

冲突裁决顺序：FROZEN 事实源（`packages/schemas/assets/02-object-envelope.schema.json`、`02b-kind-payloads.md`、`03-gate-result.schema.json`、`packages/kernel/src/gate-result.ts`、`packages/schemas/src/vocab.ts`）> `migration/master-batch1/classification-ledger.yaml` 已裁定事项 > 本约定 > 转录者个人判断。

硬约束（违者返工）：

1. MASTer_master（`D:\Vscode Documents\MASTer_master`）绝对只读：不写入、不重命名、不删除、不触碰 mtime。一切产出写 `migration/master-batch1/` 下。
2. 禁墙钟：机器消费字段（digest/排序/id/输出 JSON-YAML 结构字段）不得含时间戳或日期；日期只可出现在 `notes_md` 人类散文。批次代号固定 `MIG-B1`。同输入重跑 byte-identical（幂等）。
3. 确定性序列化：JSON `json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False)` + 末尾 `\n`；YAML `sort_keys=True`；UTF-8 无 BOM。
4. 分母一等公民：任何覆盖率/计数/百分比必须显式携带分母数值与来源（哪个 registry/文件/扫描范围）。
5. ID 文法闭世界：`PREFIX.SEGMENT(.SEGMENT)*[.SEQ]`，SEGMENT=`[A-Z][A-Z0-9_]{0,31}`（不允许数字开头），15 个合法前缀唯一定义于 `packages/schemas/src/vocab.ts` 的 `GOVERNED_ID_PREFIXES`（PAGE/CAPABILITY/COMPONENT/API_REQ/ERR/FIELD/KNOWLEDGE/CHANGE/TASK/DENOMINATOR/KEYBINDING/POLICY/PROFILE/AUTHORITY/TEST）。
6. 对象信封过 FROZEN `02-object-envelope.schema.json`。
7. gate 结果词汇以 FROZEN 为准（verdict 七态 snake_case，见 §9）。
8. 禁 git 操作；禁改 `POMaster_VNext` 的 `packages/`、`catalog/`、`examples/`、`benchmarks/`、`tests/` 等任何其他路径。
9. provenance 每对象必填（§6）。
10. merge-preserving：源文件中的人类策展字段必须逐字保留进 payload（不转写、不"规范化"、不丢失）——vendor-adapter-registry 曾被 clobber 清空两次，这是本批次的存在理由之一。
11. 语义转录 ≠ 格式转换：扁平布尔堆叠/歧义单字段拆正交、显式建模、异常走登记形态；但数值语义不得篡改（33 DRAFT 就是 33 DRAFT，语义升级只登记不执行，见 §4）。
12. 本机 Python 3.14：避免 `@dataclass` 与裸 `importlib` 组合；控制台打印建议 ASCII 或设 `PYTHONIOENCODING=utf-8`；PyYAML 与 jsonschema 可用。

---

## 1. 目录布局与文件命名

布局（一对象一文件，A1）：

```
migration/master-batch1/
├── CONVENTIONS.md                  # 本文件
├── inventory.yaml                  # M0 只读盘点（pin 事实源，只读消费）
├── classification-ledger.yaml      # M1 分类台账（裁定事实源，只读消费）
├── key-binding-map.draft.yaml      # 别名/键绑定草案（只读消费）
├── tools/                          # ingest 工具（每源文件一个，确定性幂等）
│   └── ingest_request_classification.py
└── truth/
    └── objects/
        └── <kind-dir>/
            └── <local-name>.json   # 信封对象（一对象一文件）
```

kind-dir 闭表（kind 值 → 目录名，闭世界，禁即兴派生）：

| kind（信封枚举值） | 目录名 | 备注 |
|---|---|---|
| capability | `capability/` | |
| component | `component/` | |
| contract_operation | `contract-op/` | 缩写形，与 classification-ledger destination 逐字一致 |
| error_term | `error-term/` | |
| field_definition | `field-definition/` | |
| page_surface | `page-surface/` | |
| knowledge_entry | `knowledge-entry/` | |
| business_rule | `business-rule/` | |
| change_object | `change-object/` | 与 ledger 一致 |
| task_object | `task-object/` | |

local-name 规则（参考实现样例 `examples/tiny-tool/.pomaster/truth/objects/capability/csv-tool.serialize-rows.json`，其 id=CAPABILITY.CSV_TOOL.SERIALIZE_ROWS）：id 去掉前缀 → 其余各段下划线转连字符 → 用 `.` 连接 → 加 `.json`。单段 id 无中间点（`POLICY.REQUEST_CLASSIFICATION` → `request-classification.json`）。

与 classification-ledger destination 的偏差记录（本批一次，后续组遇同类照此办理）：ledger 对 request-classification 原裁定 `destination_kind=控制面·SYS 词表对象族`（kind 值待词汇表 PR，02b §14 张力注记），destination 为 `truth/vocab/request-classification/`。因该 kind 值未入 FROZEN 十类闭包，铁律 6（信封过 FROZEN schema）优先，过渡期落可注册形态（裁定见 §3），destination 相应调整为 `truth/objects/business-rule/`；词汇表 PR 登记 SYS 词表 kind 后，按 supersede 链迁移（`supersedes` 留痕，方向：新对象 → 本对象）。

---

## 2. 信封字段与取值约定

FROZEN 必填 9 字段：`id / kind / axis_profile / axes / title_zh / authority / origin / rev / payload`。逐字段转录约定：

| 字段 | 必填 | 转录约定 |
|---|---|---|
| id | 是 | 15 前缀闭世界文法；工具内建正则 + 前缀闭包双校验（铁律 5） |
| kind | 是 | truth_bodies 十类闭包；字典型/词表型源按 §3 裁定 |
| axis_profile | 是 | 用 02b 建议值（capability_default / component_default / contract_default / error_default / field_default / page_default / knowledge_default / rule_default / change_default / task_default）；本体是 SYS 词表对象，词汇表 PR 后有定义，此前按建议值走 |
| axes | 是 | 四轴（lifecycle/confidence/evidence/change），赋值基线见下 |
| title_zh | 是 | 中文可读名；机器判卷永不依赖本字段 |
| aliases | 否 | 仅当存在 legacy governed id 词形时（A6 只减不增，§5）；无则整体缺席 |
| authority | 是 | `owner` 取 classification-ledger 该条目 `authority_owner_candidate.owner`（DP-7 粗粒度候选值，M3 Authority Map 校准前）；`delegates` 同源照录；`write_policy` 缺省 `EVOLUTION_CHANNEL`（治理对象）或按 ledger 注记选；`escalation_hint` 写可执行的修复路标 |
| origin | 是 | := M0 `inventory.yaml` 该资产 `provenance.origin` 逐字（§6） |
| producer | 条件 | `origin=derived` 时必填且非 null（信封条件式 1）；形态见 §6 |
| realization | 否 | 仅 `contract_operation` / `capability` 可携带（vocab-lock applies_to）；其他 kind 禁带 |
| key_bindings | 否 | A7 P0 三类锚点（page↔dir / contract_operation↔operationId / capability↔file）+ 源文件 pin 锚（见 golden case）；`match_rule=mechanical`；`probe` 缺省 = 未探测（gate 必须重扫，不伪造 probe.result，C5） |
| sources | 是（转录对象） | 转录对象至少一条；形态见 §6 |
| supersedes | 否 | 迁移初始对象一律 `null` |
| successor_ref | 条件 | `lifecycle=SUPERSEDED` 时必填（信封条件式 2） |
| denominator_refs | 否 | 对象处于某覆盖分母度量范围时挂 `DENOMINATOR.*` + `version_seen`；无则 `[]`（显式空） |
| evidence_refs | 否 | 迁移期无 CLM/VRF 台账 → `[]`（诚实空，不伪造） |
| permits_active | 否 | 迁移期无 ACTIVE PERMIT 台账 → `[]`；因此迁移对象 `change` 禁标 `MIGRATING`（跨轴断言：MIGRATING 必持 ACTIVE PERMIT） |
| payload | 是 | §8 |
| rev | 是 | 迁移初始对象固定 `1`（迁移语境无全局 seq 分配器，不伪造事件序号；kernel 接管后由事务重排） |
| notes_md | 否 | 人类散文唯一合法入口；机器永不解析判卷（P9） |

axes 赋值基线（golden case 先例，后续组按源事实逐条裁定，不盲抄）：

- `lifecycle: CURRENT` —— 源是活跃 canonical 事实（inventory `producer_alive=true` + 活跃消费链）。
- `confidence: LOCKED` —— 上游有版本化 schema / 基线绑定 / 门禁消费链在场；悬置态（未裁决冲突在身）用 `PROVISIONAL`，禁 `UNRESOLVED` 兜底。
- `evidence: IMPLEMENTED` —— 执行点/消费链在场；`VERIFIED` 必须有 CLM/VRF claim 支撑，迁移期一律不得标（不伪造验证）。
- `change: STABLE` —— M1 pin 在场、零漂移证据；禁 `MIGRATING`（见 permits_active 行）。

信封键序说明：铁律 3 的 `sort_keys=True` 使落盘键序为字母序；参考样例的"信封字段顺序"按**字段集合与嵌套形状**对齐执行——FROZEN schema 内字段一个不多一个不少、形状逐点一致。确定性优先于装饰性键序，本条为定案，勿再纠结。

---

## 3. kind 裁定：字典型 / 词表型源文件

**裁定：整册一对象，`POLICY.*` + `kind=business_rule`**（golden case 实例 `POLICY.REQUEST_CLASSIFICATION`）。理由分三问记录如下，后续组遇字典型源照此论证，不得静默换 kind。

为什么不是 `KNOWLEDGE.*`（kind=knowledge_entry）：

1. 02b §8 的 knowledge_entry payload 核心是 `failure_class` + `checks`——语义是五大家族 failure-pattern 的 advisory 失败经验；request-classification 是规范性契约词表（约束前后端请求语义），不是失败知识。
2. knowledge 走 advisory 豁免（key_bindings 空绑定即声明、`advisory_note_md` 永不判卷）；本词表是 fail-closed 强制面（schema + contract-index + validate_frontend_delivery 消费链在场），装进 advisory kind 会误标判卷语义。
3. knowledge_default 的 lifecycle 收窄（CURRENT/DEPRECATED/RETIRED）会丢掉 PROPOSED/SUPERSEDED 演化语义——闭世界枚举的演化需要完整 lifecycle 轴。

为什么是 `POLICY.*`（kind=business_rule，02b §9 + kind↔前缀绑定矩阵 business_rule 暂挂行）：

1. business_rule payload 核心 `statement_structured{when,then}` + `enforcement_point`（执行点必须可指认）恰好表达"当 `contract_operation.payload.classification=X` → 则该类正交旗标表生效"，且执行点在场（producer `compile_frontend_request_classification.py` + gate `validate_frontend_delivery.py` contract 交叉校验）。
2. ledger 该条目 `coarse_class=DOMAIN_CONTRACT`（治理契约："约束的是前后端请求语义而非业务事实"）与 business_rule 语义一致；02b §14 张力注记中 POLICY 前缀语义即"目录策略引用条目"（治理词表条目）。

为什么不是控制面 SYS 词表 kind：ledger 原裁定 destination_kind 为控制面·SYS 词表对象族，但该 kind 值未入 FROZEN 十类闭包（02b §14：待词汇表 PR）。铁律 6 优先 → 过渡期落 business_rule 可注册形态；SYS kind 经词汇表 PR 登记后按 supersede 链迁移（§1 偏差记录）。

**粒度裁定：整册一对象，不逐类立对象。** 裁定原则（任务书给定：使用时 gate/agent 按什么粒度检索）：

- 下游引用形态是 `contract_operation.payload.classification = "QUERY"`（裸字符串值，不是 governed id）——gate 判卷按值查表，一次解析该类的全部正交旗标；不存在"按 governed id 检索单个枚举值"的检索路径，逐类立 id 只会制造永不被引用的 ID 族。
- classification-ledger `destination_note` 已裁定"8 类词形与正交旗标……整体转录为词表对象；下游以 contract_operation.payload.classification 引用，**不逐类立 truth 正文对象**"——同批先例优先。
- 枚举增删是一次原子治理动作（单对象 revision + supersede 链）；拆 8 对象会把一次变更放大成 8 个对象的协调变更。

适用规则（后续字典型源）：闭世界枚举/词表/字典 → 整册一对象（`POLICY.*` business_rule，或按内容更贴切的 kind 并照本节三问论证）；仅当下游存在按 governed id 逐条引用的检索路径时才逐条立对象。

---

## 4. approval_axis × evidence_axis 正交拆分规则

旧 YAML 扁平 `status`/布尔堆叠一词多义（"ACCEPTED" = 契约已接受 ≠ 已接线 ≠ 已验证），转录时拆为正交四轴 + realization 块（A2/A3）：

| 旧语义 | 新表达 |
|---|---|
| 审批/接受态（ACCEPTED 等） | `axes.lifecycle=CURRENT` + `axes.confidence=LOCKED`（02b §4 迁移注记判例） |
| 代码接线态（接没接） | `axes.evidence` + `realization` 块（stub/mock/wired；仅 contract_operation / capability 携带） |
| 验证态（验没验） | `axes.evidence=VERIFIED` 必须有 CLM/VRF claim 支撑；迁移期无台账 → 一律 IMPLEMENTED 及以下，不标 VERIFIED |
| 等审批/悬置（NEEDS_BACKEND_REVIEW 等） | **禁自动映射**：审批语义冲突（MIG-B1/C-03 类）只汇总呈报绝不自动裁决，处置归 M3 Authority 重验批 |
| 降级语义（DRAFT 等） | 数值语义不篡改：保持事实记录，并在 payload 登记 `superseded_status_field`（形态见下）；语义升级只登记不执行 |

`superseded_status_field` 登记形态（payload 内合法扩展字段，机器可读；禁匿名扩展——本条即其登记形状）：

```json
"superseded_status_field": {
  "source_field": "status",
  "source_value": "DRAFT",
  "mapped_to": "axes.lifecycle 保持事实记录（PROPOSED），语义升级留待 Owner 裁决",
  "upgrade_registered": true,
  "reason": "33 条 DRAFT 的语义升级属 Owner 裁决项，转录仅登记不执行"
}
```

拆分自检三连（后续组对每个旧状态字段照问）：这个字段说的是"批准没有"（→ lifecycle/confidence）？"接了没有"（→ evidence/realization）？"变了没有"（→ change）？一词多答就是没拆干净。

golden case 适用情况：源文件无任何 status/lifecycle/updated_at 字段 → 双轴拆分动作数 = 0、`superseded_status_field` 登记数 = 0（诚实零亦是结果，不硬造）。对照：mock-contract 组转录时其 `updated_at` 墙钟字段按铁律 2 剥离（ledger 已裁定，数值语义不篡改：场景逐条保真）。

---

## 5. 别名收编登记格式

- 载体：信封 `aliases[]`（A6 rename-on-ingest 双向链，**只减不增**；normalized 冲突查重归 REF_INTEGRITY，不在单文件 schema 内）。
- 已登记规则（vocab-lock ALIASES_V0 / `vocab.ts` 镜像）：`GRID.*→CAPABILITY.GRID.*`；`PAGE-TASK-STEP-*→PAGE.*`（token 重排）；`KB-*→KNOWLEDGE.*`；`TASK-*→TASK.*`；`CHANGE-*→CHANGE.*`。
- 数字段规则：SEGMENT 不允许数字开头 → `TASK-0087→TASK.T0087`、`CHANGE-0104→CHANGE.C0104`（字母前缀 T/C + 原数字段）。映射器必须内置此规则。
- 格式：canonical id 正常写 `id` 字段；legacy 原词形逐字进 `aliases[]`。**不改源数据**——源在 MASTer 只读仓，别名只登记在 vNext 对象侧（镜像收编，登记映射而非改写）。
- 同步义务：对象 `sources[].locator.transcription` 注记收编动作；批量形态对照见 `key-binding-map.draft.yaml` 的 `alias_registrations`。
- golden case：源文件 8 个类 id（QUERY/COMMAND/…）是词表枚举值，不是 governed id 词形 → 无 alias，`aliases` 字段整体缺席（"无别名"以缺席表达，不写空数组占位）。

---

## 6. provenance 格式

**origin 裁定规则**：信封 `origin` := M0 `inventory.yaml` 该资产 `provenance.origin` 逐字（两侧同为 FROZEN OriginValue 词形 natural/derived/ingested；与 classification-ledger `origin_frozen` 保持逐字一致）。`ingested` 保留给 A6 场景（legacy governed id 改拼迁入）；legacy 文件无 governed id 的，不因"被迁移"而标 ingested。铁律 9 的 legacy 词形映射：`human_curated→natural`、`migrated→ingested`。

**优先级裁决（OBS-3 成文）**：前句「逐字」规则与 A6 场景规则冲突时 **A6 优先**——凡转录动作按词汇表**已登记** alias 规则（vocab-lock ALIASES 表）执行了 rename-on-ingest（对象 id 由 legacy governed 词形改拼为 canonical，legacy 原词形照录 `aliases[]`），该对象 `origin` 一律 `ingested`，不取 inventory 逐字值。依据：FROZEN 02 信封 origin 注记本义即 `ingested` = rename-on-ingest 迁入；判据是「改拼动作是否按已登记规则发生」，不是「源资产是否被迁移」。首批修正件：M2 转录组 D 的 3 个 `CAPABILITY.GRID.*` 对象（`GRID.*→CAPABILITY.GRID.*`，ALIASES_V0 已登记族）origin natural→ingested，`tools/ingest_data_grid.py` 同步改判据。两条边界照旧不动：源侧跟踪 id（如 `ISSUE.*`×107 / `FTA-*`×17 / `FB-*`×1，非 governed 词形、转录时不在 ALIASES 表）赐 canonical 名并照录 `aliases[]` **不构成 A6 场景**，对象保持源侧 origin（MIG-B1 change-object 组即此形态）；legacy 文件无 governed id 的不标 ingested。层次注记：inventory/ledger 侧 origin 描述**源资产**谱系，信封侧 origin 描述**对象**谱系，两层各表其事、不互相覆盖。

**sources[] 形态**：FROZEN `SourceRefEntry` 五键闭形（`type/ref/captured_by/locator/pin`，`additionalProperties=false`）→ 铁律 9 要求的 `batch` / `ingested_from` / 转录说明放 `locator`（结构化自由区）：

```json
{
  "type": "design_seed",
  "ref": "outputs/frontend/10_planned/request-classification.yaml",
  "captured_by": "agent:mig-b1/ingest_request_classification.py",
  "locator": {
    "batch": "MIG-B1",
    "ingested_from": "outputs/frontend/10_planned/request-classification.yaml",
    "transcription": "整册转录说明一句话（整册/逐字段保真/双轴拆分/别名动作）"
  },
  "pin": { "digest": "sha256:<64hex>" }
}
```

细节约定：

- `type` 从 allowed 7 值按语义选：治理词表/编译 factsource=`design_seed`；BP 蓝图本体=`bp_blueprint`；人工指令登记=`human_directive`；代码重构证据=`code_refactor`；已发布 OpenAPI=`openapi_contract`。禁用 forbidden 两值（prototype_html_scrape / ai_invention）。
- `ref` 用 MASTer 仓内相对路径（禁绝对盘符，schema `not`-pattern 强制）。
- `pin.digest` 由工具现场重算源文件 sha256，并与 inventory `content_sha256` 比对——不一致即 fail-closed（exit 2），绝不带着漂移转录。
- `captured_by`：`agent:mig-b1/<tool 文件名>`（actor 标识，永不信任自报值的主体留痕）。
- `origin=derived` ⇒ producer 块必填（信封条件式 1）：`producer_id` = `prod.mig_b1_<工具名小写蛇形>`（pattern `^prod\.[a-z][a-z0-9_]{1,63}$`）；`views_maintained` 至少 `["truth-index.envelope"]`，禁多报未维护的视图；`liveness` = `{"status": "active"}`；`merge_semantics` 按工具真实语义声明（确定性整册重算的工具填 `refresh_fields: ["payload"]`）。

---

## 7. 幂等与确定性

- JSON 落盘：`json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False)` + 末尾 `\n`，以 **bytes** 写入（`write_bytes` / `open(..., "wb")`，规避 Windows 文本模式的 `\r\n` 翻译）；UTF-8 无 BOM。
- 零墙钟：机器字段禁时间戳/日期；`notes_md` 散文可含日期；批次代号固定 `MIG-B1`。
- 数组顺序 = 源顺序（merge-preserving 保真优先；`sort_keys` 只排对象键、不动数组序，源序本身是稳定事实）。
- 同输入重跑 byte-identical。自证程序：连跑两次工具，对输出文件做 sha256/diff，必须为零差异。
- 工具自检 fail-closed：pin 失配 / schema 不过 / ID 文法不过 → 不落盘，exit 2。
- Python 3.14 注意：避免 `@dataclass` 与裸 `importlib` 组合；控制台打印用 ASCII（或设 `PYTHONIOENCODING=utf-8`）。

---

## 8. 信封 / payload 字段归属

- **信封**（schema 冻结 9 必填 + 条件字段）：身份 / 四轴 / authority / origin / producer / key_bindings / sources / supersedes / rev / notes_md。禁止发明信封新字段（扩展位如 `retriable` 须先在 schema 或 kind profile 登记形状后才可出现）。
- **payload**（`additionalProperties=true` 自由区）：
  - kind 正文按 02b 蓝本（business_rule：`statement_structured` + `enforcement_point` 必备；03-* kind profile 落地前收窄靠评审）；
  - 源人类策展字段逐字保真进 payload（铁律 10；vendor-adapter-registry 被 clobber 清空两次是本条的存在理由）；
  - digest 形态字段一律 `sha256:<64hex>` 前缀形态（D24 / 02b 补充纪律 1：禁止裸字符串指纹；源文件裸 hex 值转录时加前缀，值不变）；
  - 散文只进信封 `notes_md`（或 knowledge payload 的 `advisory_note_md`）；payload 禁散文叙事字段（P9）；
  - `superseded_status_field` 等"迁移登记"字段属 payload 合法扩展（形状已在 §4 登记，非匿名扩展）。

---

## 9. gate 结果词汇纪律（指针）

- verdict 落盘词形 = FROZEN 七态 snake_case：`passed / failed / warning / blocked / not_run / not_configured / skipped_blindspot`（`03-gate-result.schema.json` definitions.verdict / `vocab.ts` VERDICT_VALUES）。设计散文里的连字符形（not-configured / skipped-due-to-blindspot）**禁止落盘**。
- gate 结果必带：`counts`（scanned / applicable_scanned / violations / not_applicable——not_applicable 缺席即 FATAL，"为何没查"必须是数字而非沉默）；`trust.asserted`/`trust.recomputed` 孪生（铁律 7 "self_report_trusted=false" 的 FROZEN 形态 = 自报值永不单独判卷，失配本身是一级信号）；`denominator_refs`（id + version_seen，分母一等公民）。
- GateResult 存 `evidence/runs/GRN-*.json`，永不入 truth-index（A8）。
- 转录工具自检**不冒充 GateResult**：不落 GRN 文件（迁移语境无 seq 分配器，伪造 `ran_at_seq` 即违 A4）；自检失败 = 工具 exit 2 fail-closed。gate 结果词汇纪律只约束后续组真正接 GateRunner 时产出的运行记录。

---

## 10. 附录 A：golden case 语义对照表（零丢失证明）

源：`outputs/frontend/10_planned/request-classification.yaml`（MASTer 仓内相对路径；扩展名 `.yaml`、内容为 JSON）→ 目标：`POLICY.REQUEST_CLASSIFICATION`（`truth/objects/business-rule/request-classification.json`）。

| # | 源语义单元 | 计数 | 目标位置 | 转录方式 |
|---|---|---|---|---|
| 1 | `document_type="request-classification"` | 1 | `payload.source_document_meta.document_type` | 逐字 |
| 2 | `schema_version=1` | 1 | `payload.source_document_meta.schema_version` | 逐字 |
| 3 | `blueprint_sha256`（裸 hex） | 1 | `payload.source_document_meta.blueprint_sha256` | 值不变；按 D24/02b 补充纪律 1 加 `sha256:` 前缀 |
| 4 | `classes[]` 8 个类对象（数组序） | 8 | `payload.classes[]` | 整册逐字保真，数组顺序 = 源顺序 |
| 5 | 每类 9 字段：id / auth_recovery / automatic / cancelable / description / idempotent / max_retries / requires_idempotency_key / retryable | 8×9=72 | `payload.classes[][同名字段]` | 逐字（description 中文散文亦逐字，merge-preserving） |
| 6 | `SESSION_REFRESH.single_flight=true`（唯一非均匀旗标） | 1 | `payload.classes[].single_flight` | 逐字 |
| 7 | 8 个类 id 词形（gate 重扫锚，派生投影非新增语义） | 8 | `key_bindings.code[0].expect.class_ids` | 源顺序照录 |
| 8 | status / lifecycle / updated_at 类字段 | 0 | — | 源不存在：双轴拆分登记数 = 0、零墙钟天然满足（§4） |

合计叶子语义单元 **76**（73 类级 + 3 顶层），零丢失、零增删、零语义升级登记。分母来源：源文件 `classes[]` 实测 len=8（M0 inventory `content_sha256=50c17658…63b8` pin 校验通过）。

源类序（= 落盘数组序）：ASYNC_JOB / AUTH / COMMAND / FILE_DOWNLOAD / FILE_UPLOAD / QUERY / SESSION_REFRESH / STREAM。

---

## 11. 附录 B：ingest 工具契约（后续组照此形状）

流程（`tools/ingest_<source_stem>.py`，每源文件一个）：

1. 读源（JSON 优先、YAML 回退；bytes 一次性读入）。
2. sha256 现场重算 + inventory `content_sha256` pin 比对（fail-closed）。
3. 源结构断言（document_type / schema_version / 主体数组形态）。
4. 构建信封（本约定书 §2/§4/§5/§6/§8）。
5. ID 文法校验：canonical 正则 + 15 前缀闭包断言（前缀表注释标明 `vocab.ts` 镜像源，`assert len == 15`）。
6. 02 schema 校验：`jsonschema.validate`（按 `$schema` 自动选 draft-07）。
7. bytes 落盘（`write_bytes`）。
8. 显式打印分母（类数/叶子字段数/登记数，逐项带来源），ASCII 输出。

出口：`0` = 成功；`2` = fail-closed（pin 失配 / 校验失败，不落盘）。重复运行幂等（同输入 byte-identical）。

工具自检不是 GateResult（§9），不落 GRN 文件、不伪造 seq。
