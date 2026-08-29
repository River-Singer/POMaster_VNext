# MIG-B5 转录约定书（CONVENTIONS）—— batch5 扩充（蓝图真值 A：02_process-task-interface）

效力区间：`migration/master-batch5/` 下本批转录组（`truth/objects/` 全部对象 + `tools/ingest_bp_main.py`）。本文件是施工规范，不是散文。

与 batch1–batch4 的关系：本文**只扩充、不推翻**约定链 `master-batch1/CONVENTIONS.md`（batch1 约定书）→ `master-batch2/CONVENTIONS.md`（batch2 约定书）→ `master-batch3/CONVENTIONS.md`（batch3 约定书）→ `master-batch4/CONVENTIONS.md`（batch4 约定书）。batch1 §2 信封字段、§4 双轴拆分、§5 别名收编、§6 provenance、§7 幂等确定性、§8 字段归属、§9 gate 结果词汇，batch2 §2–§5 对象形态与三红线（硬约束 7）、§6 多源 pin，batch3 §2.2 准入门、§2.3 值冲突/锚漂移区分、§4 本地族词形赐名通则、§2.5 大体量分片规则，batch4 §3 Baseline 引用形态、§4 墙钟精化继续全文有效；本文做四件事：批次换代号（`MIG-B4`→`MIG-B5`，seq 口径 `MIG-B5`）、立 **Blueprint 对象形态裁定**（§2，本批核心新条）、立 **bp_ref 跨批指针形态与悬空登记纪律**（§3）、登记 batch5 资产词形赐名与 kind 裁定表（§4）。

冲突裁决顺序：FROZEN 事实源（`packages/schemas/assets/02-object-envelope.schema.json`、`02b-kind-payloads.md`、`03-gate-result.schema.json`、`packages/kernel/src/gate-result.ts`、`packages/schemas/src/vocab.ts`）> `migration/master-batch5/inventory.yaml` 已登记事项（M0 只读盘点，pin/分母/事故证据事实源）> 本约定 > batch4 约定 > batch3 约定 > batch2 约定 > batch1 约定 > 转录者个人判断。

硬约束（违者返工；1–13 继承 batch1–batch4 约定书同族条目，此处只列 batch5 差异点）：

1. MASTer_master（`D:\Vscode Documents\MASTer_master`）绝对只读；一切产出写 `migration/master-batch5/`（batch5 独立目录）；本任务形态禁碰 `master-batch4/tools/run_baseline_gate.py` 之外的 migration 其他批次产物，禁改 `POMaster_VNext` 的 `packages/`、`catalog/`、`examples/`、`benchmarks/`、`tests/` 等任何其他路径；工具只进 `migration/master-batch5/tools/`。
2. 禁墙钟；批次代号固定 `MIG-B5`；同输入重跑 byte-identical（幂等）。源内无墙钟字段（02 无 updated_at/authorized_at 类字段，工具结构断言把门）；确定性序列化照 batch1 §7（`sort_keys=True, indent=2, ensure_ascii=False` + 末尾 `\n`，bytes 写入，UTF-8 无 BOM）。
3. **分母一等公民（本批铁律形态）**：双分母硬判据——实体分母 347（七族结构和，= batch5 inventory `denominators.process_task_interface_entities.value` 及其 `value_breakdown.families`）与外部引用分母 70（七族外部词形并集）的对账恒等式见 §5；工具 fail-closed 断言，失配 exit 2 不落盘。
4. ID 文法 15 前缀闭世界不变（`vocab.ts` `GOVERNED_ID_PREFIXES`，`assert len == 15`）；ALIASES_V0 现役 8 族（`assert 族数 == 8`）。本批涉及：`PAGE-TASK-STEP-*` 为 ALIASES_V0 已登记族（A6 rename-on-ingest）；`PROC-*`/`SCENE-*`/`STATE-*`/`TRANSITION-*`/`TASK-STEP-*`/`CTX-*`/`STEP-*`/`ACC-*`/`ACT-*`/`ACTOR-*`/`OBJ-*`/`PERM-*`/`RULE-*` 为文档本地族词形（照录 aliases，赐名照 batch3 §4 通则；TASK-STEP-* ≠ ALIASES_V0 的 `TASK-*` 收编语义——后者是迁移工作 TASK id 族，前缀同形语义异族，禁误收编，见 §4 注记）。
5. 对象信封过 FROZEN `02-object-envelope.schema.json`（jsonschema draft-07）；gate 结果过 FROZEN `03-gate-result.schema.json`（verdict 七态 snake_case）。
6. 三红线全文继承：文件名小写（local-name 推导 `.lower()` 逐文件断言）；合规 AGG；`skipped_blindspot` 必附盲区指标；`passed` 且 `violations>0` 非法；数值语义不篡改（planned 就是 planned、scenes compiled 13 就是 13、duplex 指针悬空数如实登记）。
7. **登记键存在性是内容的确定性函数**（batch2 FAIL-2 红线）：`superseded_status_field` 等登记键非空才写；空则不写。
8. 禁 git 操作；Python 3.14 环境注意照 batch1 §12（禁 `@dataclass`+裸 `importlib`；控制台 ASCII 或 `PYTHONIOENCODING=utf-8`）。
9. provenance 每对象必填（batch1 §6 形态；`locator.batch="MIG-B5"` + `locator.ingested_from` 逐对象登记；源 pin 现场重算并与 batch5 inventory `content_sha256` 比对，第二/三源（blueprint-baseline/01_domain-projection）多源 pin 照 batch2 §6，任一失配 fail-closed exit 2）。
10. merge-preserving：源实体逐字保真（`payload.<family>` 与源条目深度等价为工具断言）；中文业务事实正文（page.contract.purpose、scenes given/when/then、work_context entry/exit_conditions 等）是**业务事实正文不是 notes 叙事**——逐字进 payload（batch3 §2.1 散文边界先例），禁转写禁"规范化"。
11. 语义转录 ≠ 格式转换（batch1 §11 全文有效）；大体量纪律照 batch3（347 实体全脚本驱动，禁手写大 JSON）。
12. **Episode 归档语义（本批铁律 3）**：流程档案（00/03/06/07/09/10/11/回执）不建 Live State truth 对象——归档=manifest（batch5 inventory 即 manifest 登记层）+ 必要的 Evidence/Episode 抽取；归档不是删除，MASTer 侧文件一个不动。本批转录对象只出自蓝图真值资产 02。
13. **双真相封堵（02b §7 注记的 batch5 形态）**：物理路由串不入本批对象 payload——源 `route=null`（`route_authority=frontend-unresolved`）照录 null 即"无路由主张"的诚实表达；页面↔目录与 route_name 权威在 KEYBINDING.*（batch2 surface 对象 key_bindings 已承载锚），本批 bp_ref 指针指向 batch2 对象即复用其锚，禁在本批对象重复登记路由锚。

---

## 1. 目录布局与 kind-dir（延续 batch1 闭表）

```
migration/master-batch5/
├── CONVENTIONS.md                        # 本文件（batch5 扩充）
├── inventory.yaml                        # M0 只读盘点（pin/分母/事故证据事实源，只读消费）
├── tools/
│   ├── build_m0_inventory.py             # M0（已在册）
│   └── ingest_bp_main.py                 # 本批转录工具（确定性幂等）
└── truth/
    └── objects/
        ├── page-surface/                 # PAGE.MODEL.* 15 对象
        └── business-rule/                # POLICY.PROC.* 4 + POLICY.SCENE.* 13 + POLICY.BP_MODEL_EXTERNAL_REFS 1
```

kind-dir 沿用 batch1 §1 十类闭表，禁即兴派生；batch5 在册合法 kind-dir：`page-surface/`（page_surface）、`business-rule/`（business_rule）。其余八类未用到时目录不建。local-name 照 batch1 §1 + 红线 1（id 去前缀 → 段内下划线转连字符 → 小写 → `.` 连接 + `.json`；全小写硬断言）。样例：`PAGE.MODEL.BUC_ANALYSE` → `model.buc-analyse.json`（去 `PAGE.` 前缀后余段投影，与 batch2 facet 落位 `readiness.*`/`registry.*`/`nav.*` 同形）；`POLICY.PROC.BOM_BUILD_CHAIN` → `business-rule/proc.bom-build-chain.json`。并行转录组共目录注记：`page-surface/` 由多个蓝图真值转录组共用（batch5 在册另有 `uiux-spec.*` 族，08 侧转录组产出），本批只写本批 15+18 个文件名，零交集断言在工具红线 1 唯一性检查内。

---

## 2. Blueprint 对象形态裁定（本批核心新条）

**背景**：设计稿 R7 风险——「Blueprint 对象模型在 PRD 仅间接覆盖，BATCH-2 将缺图施工」。batch2 已为 39 份 screen-blueprint 建 page-surface 对象形态（`PAGE.*` 主对象 + `PAGE.REGISTRY.*`/`PAGE.READINESS.*`/`PAGE.NAV.*` facet 分档）；本批做的是 **BP 主文档级**（`02_process-task-interface.yaml`，process-task-interface-model，7921 行，schema_version=3）的领域投影对象。02 与 screen-blueprints 的关系：02 的 `pages[]` 15 页是 screen-blueprints 39 份的子集（batch5 inventory `cross_reference_forms.page_family_15` 在案），但 02 承载的是**流程-任务-步骤模型**（screen-blueprint 不承载）：processes 4 / tasks 15 / states 210 / transitions 75 / scenes 13 / pages 15 / work_contexts 15。

**裁定原则（任务书给定）**：gate/agent 检索粒度 + 与 batch2 page-surface 对象的引用关系（bp_ref 指针）；每个候选抽取域按 batch1 §3 三问（检索路径 / 演化原子性 / 先例对齐）逐域裁定粒度，不得静默换粒度。五域裁定如下：

### 2.1 页面-任务-步骤层级 → 每页一对象（层级五元一体），15 × `PAGE.MODEL.*`

- **粒度**：检索主键 = 页。page↔task↔work_context 严格 1:1（工具断言：`page.generated_from_task_ids` 单元素 ↔ `task.page_id` 回指 ↔ `task.work_context_id` ↔ `ctx.task_id` 回指，15/15）；states/transitions 全部页域（`page_id` 15/15 覆盖）；故层级节点 = 页+任务+工作情境+状态集+转移集**五元一体**，一页一对象。逐 task/逐 state/逐 transition 立对象被否决：states 210 与 batch3 已转录的 455 状态对象（`POLICY.STATE.*`，state-ownership-matrix 族）共享 187 个源词形——再立逐 state 对象即跨批 canonical id 冲突（双真相）；transitions 75 为 `TRANSITION-<HEX16>` 哈希词形，无语义赐名材料；tasks 与页 1:1、独立立对象不产生新检索粒度。
- **kind/id**：`page_surface` + `PAGE.MODEL.<SEG>`（batch2 组 B facet 分档先例：页面级 id `PAGE.<SEG>` 已由 batch2 surface 主对象持有，本批 facet 取 `PAGE.MODEL.*` 作用域段避免同 id clobber；`payload.id_facet` 照录 batch2 组 B 形状，`merge_path=supersede`，Owner id 裁决后经 supersede 链合并，绝不自动裁决）。`PAGE-TASK-STEP-*` 为 ALIASES_V0 已登记族 → **A6 rename-on-ingest**：`origin=ingested`（batch1 §6 OBS-3），legacy 词形照录 `aliases[]`。
- **payload**：`id_facet`（batch2 组 B 形状）+ `bp_ref`（§3）+ `page`（源实体 30 字段整条逐字，含 17 个 authority 包装 facet 与 contract，见 §2.3）+ `task`（源实体整条逐字）+ `work_context`（源实体整条逐字）+ `states[]`（本页 14 条逐字，源序）+ `transitions[]`（本页 5 条逐字，源序）+ `source_document_meta`。
- **轴基线**：`lifecycle=PROPOSED`（源 `coordinate_state=planned` 事实记录，batch2 readiness DRAFT→PROPOSED 同款）+ `evidence=PLANNED`（跨轴断言：PROPOSED⇒PLANNED，02 信封 axes 注记）+ `confidence=LOCKED`（schema_version=3 版本化 + blueprint_sha256 基线绑定 + 消费链在场：derive_platform_foundation.py/state-machine-registry(MIG-B3)/06_traceability；悬空引用是锚漂移/跨批悬空，batch3 C-02 纪律：不降 confidence）+ `change=STABLE`（M0 pin 在场零漂移）。`superseded_status_field` 登记 `coordinate_state`（§4）。

### 2.2 业务流程链 → 每流程一对象，4 × `POLICY.PROC.*`

- **粒度**：单键检索路径在场（`tasks[].process_id` 逐条回指；06_traceability process 节点 4 条逐条对应；「流程 X 的任务链顺序」按流程查表）；链序演化按流程原子发生（`task_ids` 数组序=链序，单流程变更不应放大为册级变更）→ 逐条立对象（batch3 §2.3 states 判例同款；batch1 §3 整册判例不适用）。
- **kind/id**：`business_rule` + `POLICY.PROC.<SEG>`（`PROC-*` 本地族赐名：家族词 PROC 保留第二段，batch3 §4 通则；非 ALIASES_V0 现役 8 族 → 非 A6 场景，`origin=derived`（inventory 该资产 provenance.origin 逐字），legacy 照录 `aliases[]`，族级登记归词汇表 PR/Owner）。PROCESS_MODEL 档 domain fact 落 business_rule 沿 batch3 `POLICY.STATE.*` 先例（领域结构事实的 kind 槽位；02b business_rule 蓝本 statement_structured/enforcement_point 在源无 statement 材料时以 batch3 POLICY.STATE.* 先例缺席——蓝本是蓝本不是实现，03-* profile 落地前 payload 收窄靠评审）。
- **payload**：`process`（源实体 8 字段整条逐字：id/name/task_ids（数组序=链序，禁重排）/trigger_ids/context_ids/goal_ids/module_id/coordinate_state）+ `source_document_meta`。**BP 对偶注记**：源 4 流程与 BP semantic_model.processes 4 条同 id 集（PROC-BOM-BUILD-CHAIN/PROC-COST-ANALYSIS-CHAIN/PROC-COST-LIFECYCLE-TRACKING/PROC-REPORT-AGGREGATION，工具断言）；02 侧为前端派生投影（`name` 与 BP 侧措辞存在演化差，如「BOM 构建链」vs「BOM 搭建链路」——两侧值逐字各归各位，禁择一，差异登记于 notes/对照表，不立 conflict）。
- **轴基线**：同 §2.1（PROPOSED/PLANNED/LOCKED/STABLE + superseded_status_field）。

### 2.3 UI 功能清单 → 不立独立对象（页面对象的字段组）

02.pages 每页 17 个 `authority/status/evidence/value` 四件套包装 facet（acceptance/batch_operations/business_states/dangerous_actions/edit_states/feedback_recovery/field_groups/forms/information_architecture/keyboard_accessibility/layout_regions/mode_states/permissions/request_states/responsive_behavior/tables/visual_hierarchy/work_context）+ 1 个裸 contract（purpose/primary_actor_ids/primary_actions/information_regions/dangerous_actions/recovery）= **UI 功能清单随页承载**：

1. facet 无 governed id、无逐 facet 检索路径——gate/agent 的问法是「页 X 的 edit_states/permissions 是什么」（按页查表），逐 facet 立对象制造 15×18=270 个无 id 检索路径的对象（batch1 §3 判例正向适用）。
2. facet 的 `authority`/`status`/`evidence`（`frontend-engineering-proposal`/`proposed`/`frontend-derived-from-task:*`）为源自声明轴事实，随 `payload.page.<facet>` **逐字承载**（merge-preserving；`status=proposed` 是事实记录，不映射 axes——axes 描述对象自身，facet 自声明随源保真，禁混轴）。
3. `page.status` 类字段缺席（pages 无顶层 status，仅 coordinate_state）；`route=null` + `route_authority=frontend-unresolved` 照录（硬约束 13 双真相封堵；未决以缺席+自声明承载，禁代填路由）。

### 2.4 验收场景（业务流程链验收侧）→ 每场景一对象，13 × `POLICY.SCENE.*`

- **粒度**：`SCENE-ACC-*` 单键检索路径在场（09.acceptance_plan 13 / 11.fine_grained_scope.scene_ids 13 / 授权回执 fine_grained_scope.scene_ids 13 / 06_traceability acceptance-scene 节点 13 / 01 semantic_type=acceptance 13 同键集互证）→ 逐条立对象。scene↔task/page 为多对多（20 个 page 引用对覆盖 15 页），不能随页承载。
- **kind/id**：`business_rule` + `POLICY.SCENE.<SEG>`（`SCENE-*` 本地族赐名同 §2.2 通则；`origin=derived`）。given/when/then 是验收事实正文（中文）→ `payload.scene` 逐字（batch3 §2.1 散文边界）。
- **payload**：`scene`（源实体 9 字段整条逐字：given/when/then/acceptance_id/page_ids/task_ids/module_ids/status=compiled/coordinate_state）+ `source_document_meta`。轴基线同 §2.1。
- **双词形族分立**（batch5 inventory `cross_reference_forms.acceptance_word_forms` 照录不合并）：`ACC-*` 业务验收 13 条（scene.acceptance_id 全集）与 `ACCEPT-PAGE-*` 页级验收 15 条（08 侧，非本批对象）同域异族，照录不合并。

### 2.5 领域术语表 → 域一对象（整册一对象），1 × `POLICY.BP_MODEL_EXTERNAL_REFS`

- **裁定：整册一对象**（batch1 §3 字典型/词表型判例正向适用）。02 引用而不定义的 BP 本体词形七族：`ACC-*`13 / `ACT-*`19 / `ACTOR-*`5 / `OBJ-*`8 / `PERM-*`1 / `RULE-*`9 / `STEP-*`15，并集 **70**。这些词形的定义体在 BP（blueprint-baseline semantic_model）与 01_domain-projection（source_id 镜像），不在 02——逐词立对象 = 为他文档所有的实体在本文档复制身份（双真相），且无 per-term governed id 检索路径（解析是值域查表）。gate/agent 需要的是**一张外部引用清单 + 解析账**（引用了谁、解析到哪、悬空几个），一个对象一次判卷。
- **kind/id**：`business_rule` + `POLICY.BP_MODEL_EXTERNAL_REFS`（转录期构造 id，非源词形——源无此聚合体；`origin=derived`；构造身份在 CONVENTIONS 登记即非匿名扩展）。`payload.external_ref_families[]` 逐族：`family`/`word_form_prefix`/`referenced_word_forms[]`（逐字 70 词形全录）/`referenced_count`/`defined_in_doc=false`/`resolution`（`bp_semantic_model_family`/`bp_defined_count`/`resolved_in_bp`/`also_in_01_domain_projection_source_ids`）。
- **解析分层（工具现场复算，数值不篡改）**：BP semantic_model 解析 **70/70**（ACC 13/13、ACT 19/19、ACTOR 5/7、OBJ 8/8、PERM 1/1、RULE 9/10、STEP 15/15——ACTOR/RULE 为「定义多于引用」非悬空；STEP 定义体在 `semantic_model.processes[].steps[]`）；01 source_ids 侧解析 **55/70**（STEP-* 15 条 01 无 step 语义类型——解析分层登记，非悬空）。悬空 **0**（诚实零；若源演化出悬空按 §3 登记）。
- **轴基线**：同 §2.1。

### 2.6 裁定汇总表

| 候选抽取域 | 裁定 | kind | id 族（数量） | origin | 载荷落位 |
|---|---|---|---|---|---|
| 页面-任务-步骤层级 | 每页一对象（五元一体） | page_surface | `PAGE.MODEL.*`（15） | ingested（A6） | payload.page/task/work_context/states/transitions + id_facet + bp_ref |
| 业务流程链 | 每流程一对象 | business_rule | `POLICY.PROC.*`（4） | derived | payload.process |
| UI 功能清单 | 不立对象（页字段组） | — | — | — | payload.page.<17 facet> + contract |
| 验收场景 | 每场景一对象 | business_rule | `POLICY.SCENE.*`（13） | derived | payload.scene |
| 领域术语表 | 域一对象 | business_rule | `POLICY.BP_MODEL_EXTERNAL_REFS`（1） | derived | payload.external_ref_families |

合计 **33 对象**（page-surface/ 15 + business-rule/ 18）。散文叙事承载：02 为机器结构化 JSON，无散文叙事字段——中文业务事实正文逐字进 payload（§2.3/§2.4），信封 `notes_md` 只承载转录摘要 + `摘要（全文按源指针回读）：none (honest zero)` 锚行（batch2 PROSE_ABSTRACT_MARK 机械判据同款；源无散文 → honest zero）+ 行号源锚（`sources[0].locator.line_anchors`，batch2 先例）。

---

## 3. bp_ref 指针形态与跨批引用纪律（悬空登记不裁决）

- **bp_ref 载荷形状**（batch5 新登记字段，形状在此登记、非匿名扩展）：

```json
"bp_ref": {
  "object_id": "PAGE.BUC_ANALYSE",
  "kind_dir": "page-surface",
  "batch": "MIG-B2",
  "resolution_status": "RESOLVED_IN_BATCH2_PAGE_SURFACE",
  "batch2_object_file": "migration/master-batch2/truth/objects/page-surface/buc-analyse.json"
}
```

- **解析义务**：`bp_ref.object_id` = `PAGE-TASK-STEP-<X>` 按 ALIASES_V0 canonical 投影（`PAGE.<SEG>`）；工具**现场读 batch2 truth 树解析**（39 个页面级 `PAGE.*` 主对象 + aliases 词形集），解析失败即悬空——**悬空登记不裁决**（batch3 已证明跨批悬空真实存在）：悬空指针逐条登记进对象 payload `bp_ref.resolution_status="DANGLING_REGISTERED_NOT_ADJUDICATED"` + notes/工具输出，绝不静默丢弃、绝不自动改指。
- **引用计数口径**：页面-任务-步骤层级对 batch2 39 page-surface 对象的交叉引用 = ① 15 条 bp_ref（每页对象 1 条）+ ② scenes→page 引用对（13 场景 × page_ids 摊平 = 20 对，按 canonical/alias 双侧解析）。解析数与总数进工具输出与本文件附录 C。
- **同键空间防冲突**：本批不产 `PAGE.<SEG>` 页面级 id（batch2 持有）；不产逐 state 对象（batch3 `POLICY.STATE.*` 持有 455 键空间，本批 210 词形中 187 精确命中其 aliases——命中=解析，未命中=悬空登记）；state-machine-registry（MASTer 侧 MIG-B3 关联资产）311 条 TRANSITION 引用 × 本批 75 定义体的解析账进附录 C（引用方视角悬空 236 登记，不裁决——定义体唯一来源即 02，registry 编译时点演化差如实登记）。

---

## 4. 词形赐名、登记与轴纪律（本批实例参数）

- **赐名机械形**（batch3 §4 通则）：`PAGE-TASK-STEP-<X>` → ALIASES_V0 已登记 → canonical `PAGE.MODEL.<X 投影>`（X 段连字符→下划线；家族段 MODEL 为本批 facet 作用域段，batch2 组 B 同款）+ `origin=ingested`；`PROC-<X>` → `POLICY.PROC.<X>`；`SCENE-ACC-<X>` → `POLICY.SCENE.ACC_<X>`（SCENE 去 ACC 保留语义前缀，禁单段摊平超 32 字符）；任一段违文法（超 32/中文/数字开头）→ batch3 §2.2 准入门（本批实测 0 条触发）。
- **TASK-STEP-* 误收编禁令**：ALIASES_V0 的 `TASK-*→TASK.*` 收编语义是迁移工作 TASK id 族（数字段 T 前缀规则）；02 的 `TASK-STEP-*` 是 BP 业务任务实体词形，**语义异族**——本批不产生 TASK.* 对象（task_entity 随页承载，§2.1），禁套用 TASK-* 收编规则。
- **superseded_status_field 登记**（33 对象同款；形状 batch1 §4，值=batch5 实例参数）：`source_field="coordinate_state"`、`source_value="planned"`（347/347 实体实测全 planned）、`mapped_to="axes.lifecycle=PROPOSED（事实记录）+ axes.evidence=PLANNED（跨轴断言）；语义升级（planned→CURRENT）留待 Owner 裁决"`、`upgrade_registered=true`。scenes 额外事实：`status=compiled` 为编译完成事实记录，随 `payload.scene.status` 逐字承载、不映射 axes（键存在性=内容确定性函数）。
- **authority**：`owner=FRONTEND_ARCHITECTURE`（batch2–batch4 同款 coarse grant；batch5 authority.json 归 M3 校准任务，同 batch1–3 先例由 build_m3_authority.py 产出）；`delegates=[]`；`write_policy=EVOLUTION_CHANNEL`；`escalation_hint` 指 ingest 工具重跑路标。
- **key_bindings**：每对象 1 条源锚（`artifact_type=file` → `outputs/frontend/10_planned/02_process-task-interface.yaml`，`expect` 逐对象特化（page_id/states/transitions 计数、process 任务链、scene id、外部族分母），`match_rule=mechanical`，probe 缺省=未探测（C5，gate 必须重扫）；禁锚路由（硬约束 13）。

## 5. 分母硬判据（双分母，工具 fail-closed 断言）

- **实体分母 347**：七族结构和 = inventory `denominators.process_task_interface_entities.value`（`families`: processes 4 / tasks 15 / states 210 / transitions 75 / scenes 13 / pages 15 / work_contexts 15）。对账恒等式：**对象承载 32**（PROC 4 对象 + SCENE 13 对象 + PAGE 15 对象的 `payload.page` 即页实体本身）**+ 字段承载 315**（task 15 + work_context 15 + states 210 + transitions 75 随 15 个页面对象字段）**= 347**。
- **外部引用分母 70**：七族词形并集（70 词形全录 glossary）= `payload.external_ref_families[].referenced_word_forms` 总数。
- 伴随断言：页↔任务↔情境 1:1（15/15）；每页 states 14（edit 5 + mode 4 + request 5）+ transitions 5（15 页均匀，工具断言均匀性即源结构事实）；scene→page 20 对 ⊆ 15 页；311/464 引用解析账（§3）。

## 6. 幂等 / provenance / gate 纪律

- `captured_by=agent:mig-b5/ingest_bp_main.py`；`producer_id=prod.mig_b5_ingest_bp_main`（origin=derived 对象条件式 1 必填；ingested 对象 producer 块随 batch2 先例同载）；`merge_semantics.refresh_fields=["payload"]`（单工具整文件所有权）。自证：构建两遍 byte-identical + 连跑两次全目录 sha256 零差异 + fresh/noop 计数。
- 多源 pin（§2.5 glossary）：02（inventory `content_sha256=6bbad100…`）+ blueprint-baseline（inventory `cross_reference_forms.blueprint_sha256_family.baseline_file_sha256=a9e4b6a6…`）+ 01_domain-projection（inventory `content_sha256=35acfa8b…`）逐源现场重算比对，任一失配 exit 2。
- gate 结果纪律照 batch2 §7 / batch3 §6 全文；转录工具自检不冒充 GateResult：不落 GRN 文件、不伪造 seq；自检失败 = exit 2 fail-closed（零写入）。

---

## 附录 A：语义对照表（零丢失证明）

源：`outputs/frontend/10_planned/02_process-task-interface.yaml`（7921 行；扩展名 `.yaml`、内容为 JSON；schema_version=3）→ 目标：33 个信封对象。工具：`tools/ingest_bp_main.py`。

| # | 源语义单元 | 计数 | 目标位置 | 转录方式 |
|---|---|---|---|---|
| 1 | 册级 meta（document_type/schema_version/blueprint_sha256） | 3 | 33×`payload.source_document_meta.*` | 逐字（blueprint_sha256 加 `sha256:` 前缀，D24） |
| 2 | `processes[]` 条目（数组序） | 4 | 4×`payload.process`（POLICY.PROC.*） | 整条逐字（深度等价工具断言；task_ids 链序=源序禁重排） |
| 3 | `scenes[]` 条目（数组序） | 13 | 13×`payload.scene`（POLICY.SCENE.*） | 整条逐字（given/when/then 中文事实正文逐字；status=compiled 事实记录） |
| 4 | `pages[]` 条目（数组序） | 15 | 15×`payload.page`（PAGE.MODEL.*） | 整条逐字（30 字段含 17 facet + contract；route=null 照录） |
| 5 | `tasks[]` 条目 | 15 | 15×`payload.task`（随页） | 整条逐字（1:1 断言 page↔task↔ctx） |
| 6 | `work_contexts[]` 条目 | 15 | 15×`payload.work_context`（随页） | 整条逐字 |
| 7 | `states[]` 条目 | 210 | 15×`payload.states[]`（每页 14，源序） | 逐条逐字（不立独立对象——batch3 键空间防冲突，§2.1） |
| 8 | `transitions[]` 条目 | 75 | 15×`payload.transitions[]`（每页 5，源序） | 逐条逐字（TRANSITION-<HEX16> 哈希词形照录） |
| 9 | 外部引用词形（7 族） | 70 | 1×`payload.external_ref_families[].referenced_word_forms` | 逐字全录 + BP/01 双层解析账（70/70 与 55/70） |
| 10 | facet 自声明轴（authority/status/evidence） | 17 facet×15 页 | `payload.page.<facet>.{authority,status,evidence}` | 逐字（自声明事实，不映射 axes，禁混轴） |
| 11 | `coordinate_state=planned` | 347 | 33×`superseded_status_field`（登记键非空才写） | 事实记录 + PROPOSED/PLANNED 映射登记，升级只登记不执行 |
| 12 | 身份词形（PAGE-TASK-STEP-*/PROC-*/SCENE-ACC-*） | 32 | `aliases[]` | legacy 照录（PAGE 族 A6 rename-on-ingest；PROC/SCENE 非 A6 赐名） |
| 13 | （转录期登记）bp_ref 指针 | 15 | 15×`payload.bp_ref` | §3 形状；现场解析 batch2 39 主对象（15/15） |
| 14 | （转录期登记）id_facet | 15 | 15×`payload.id_facet` | batch2 组 B 形状逐字惯例（merge_path=supersede） |
| 15 | status/lifecycle 顶层字段（pages/tasks/states/transitions/work_contexts/processes） | 0 | — | 源不存在：除 coordinate_state（第 11 行）外双轴拆分登记数=0（诚实零） |

合计承载：对象 33（=32 实体对象化 + 1 术语表）+ 字段承载实体 315 + 外部词形 70；实体恒等式 32+315=347=分母。零丢失、零增删、零静默裁决（悬空 23 state 词形 / 236 registry transition 引用 / 254 registry state 引用逐条登记附录 C，不裁决）。

## 附录 B：ingest 工具契约

流程（`tools/ingest_bp_main.py`）：1) 读源（bytes 一次性）→ 2) 三源 sha256 现场重算 + inventory pin 比对（逐源 fail-closed）→ 3) 源结构断言（顶层键闭集/document_type/schema_version/七族条目字段闭集/词形闭集/1:1 与均匀性断言）→ 4) 分母双恒等式对账（§5）→ 5) 跨批解析账（batch2 39 主对象现场读取；batch3 aliases；registry 引用集）→ 6) 构建信封（§2/§4 + 约定链）→ 7) ID 文法 + 02 schema 校验 + 红线 1 → 8) merge-preserving 深度等价断言 → 9) bytes 落盘（fresh/noop）→ 10) ASCII 显式打印分母与解析账。出口 0/2；重复运行幂等。

## 附录 C：跨批引用统计（工具现场复算；悬空登记不裁决）

| # | 引用 | 总数 | 解析 | 悬空（登记） |
|---|---|---|---|---|
| 1 | bp_ref（15 页对象 → batch2 39 page-surface 主对象） | 15 | 15 | 0 |
| 2 | scene→page 引用对（→ batch2 39，canonical/alias 双侧） | 20 | 20 | 0 |
| 3 | 02 state 词形 → batch3 `POLICY.STATE.*` aliases | 210 | 187 | 23（14 页 mode read-only 各 1 + MANAGE-USER-ROLE 9：edit 5 + mode 4；登记不裁决——与 batch2 在案的用户裁决删除该页史互证，裁决归 Owner） |
| 4 | state-machine-registry TRANSITION 引用 → 本批 75 定义体 | 311 | 75 | 236（引用方视角悬空，登记） |
| 5 | state-machine-registry state 引用 → 本批 210 词形 | 464 | 210 | 254（同上） |
| 6 | 外部词形 → BP semantic_model | 70 | 70 | 0 |
| 7 | 外部词形 → 01 source_ids（解析分层，STEP-* 15 条走第 6 行） | 70 | 55 | 0（15 条非悬空，§2.5） |
