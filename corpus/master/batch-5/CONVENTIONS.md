# MIG-B5 转录约定书（CONVENTIONS）—— batch5 主卷（蓝图真值 01/02/08 + Episode 归档 + 蓝图联结 gate；含 group-b 分册合并）

效力区间：`corpus/master/batch-5/` 下本批全部产物——`truth/objects/` 全部 157 对象（02 侧 33 + 01 侧 109 + 08 侧 15）、`episodes/archive-manifest.yaml`（Episode 归档 manifest，§11）、`gate-runs/blueprint-linkage/` 全部运行记录（§12）、`tools/` 全部工具（`build_m0_inventory.py` / `ingest_bp_main.py` / `ingest_domain_projection.py` / `ingest_uiux_functional_spec.py` / `build_episode_archive.py` / `run_blueprint_link_gate.py`）。本文件是施工规范，不是散文。

与 batch1–batch4 的关系：本文**只扩充、不推翻**约定链 `batch-1/CONVENTIONS.md`（batch1 约定书）→ `batch-2/CONVENTIONS.md`（batch2 约定书）→ `batch-3/CONVENTIONS.md`（batch3 约定书）→ `batch-4/CONVENTIONS.md`（batch4 约定书）。batch1 §2 信封字段、§4 双轴拆分、§5 别名收编、§6 provenance、§7 幂等确定性、§8 字段归属、§9 gate 结果词汇，batch2 §2–§5 对象形态与三红线（硬约束 7）、§6 多源 pin，batch3 §2.2 准入门、§2.3 值冲突/锚漂移区分、§4 本地族词形赐名通则、§2.5 大体量分片规则，batch4 §3 Baseline 引用形态、§4 墙钟精化继续全文有效；本文除批次换代号（`MIG-B4`→`MIG-B5`，seq 口径 `MIG-B5`）、立 **Blueprint 对象形态裁定**（§2，02 侧核心新条）、立 **bp_ref 跨批指针形态与悬空登记纪律**（§3）、登记 batch5 资产词形赐名与 kind 裁定表（§4）外，已自 `CONVENTIONS.group-b.md` 分册（2026-08-29）全量并入 01/08 两资产对象形态裁定（§7/§8）、唯一值冲突 `MIG-B5/C-01`（§9）、D25 视觉 token 边界（§10），并新增 **Episode 归档落盘细则**（§11）、**蓝图联结 gate**（§12）与**分册合并裁决记录**（§13）。合并只扩充、不推翻上文 batch1–batch4 任何条目；分册文件保留为历史档案（头部已加指针注记，效力以本卷为准）。

冲突裁决顺序：FROZEN 事实源（`packages/schemas/assets/02-object-envelope.schema.json`、`02b-kind-payloads.md`、`03-gate-result.schema.json`、`packages/kernel/src/gate-result.ts`、`packages/schemas/src/vocab.ts`）> `corpus/master/batch-5/inventory.yaml` 已登记事项（M0 只读盘点，pin/分母/事故证据事实源）> 本约定 > batch4 约定 > batch3 约定 > batch2 约定 > batch1 约定 > 转录者个人判断。

硬约束（违者返工；1–13 继承 batch1–batch4 约定书同族条目，此处只列 batch5 差异点；14–16 为 group-b 分册硬约束差异点并编，合并裁决见 §13）：

1. MASTer_master（`D:\Vscode Documents\MASTer_master`）绝对只读；一切产出写 `corpus/master/batch-5/`（batch5 独立目录）；本任务形态禁碰 `batch-4/tools/run_baseline_gate.py` 之外的 migration 其他批次产物，禁改 `POMaster_VNext` 的 `packages/`、`catalog/`、`examples/`、`benchmarks/`、`tests/` 等任何其他路径；工具只进 `corpus/master/batch-5/tools/`。
2. 禁墙钟；批次代号固定 `MIG-B5`；同输入重跑 byte-identical（幂等）。源内无墙钟字段（02 无 updated_at/authorized_at 类字段，工具结构断言把门）；确定性序列化照 batch1 §7（`sort_keys=True, indent=2, ensure_ascii=False` + 末尾 `\n`，bytes 写入，UTF-8 无 BOM）。
3. **分母一等公民（本批铁律形态）**：双分母硬判据——实体分母 347（七族结构和，= batch5 inventory `denominators.process_task_interface_entities.value` 及其 `value_breakdown.families`）与外部引用分母 70（七族外部词形并集）的对账恒等式见 §5；工具 fail-closed 断言，失配 exit 2 不落盘。group B 两资产分母三重一致（01 `domain_projection_entries`=109 × 3；08 `uiux_page_contracts`=15 × 3，恒等式见 §7/§8）同判。
4. ID 文法 15 前缀闭世界不变（`vocab.ts` `GOVERNED_ID_PREFIXES`，`assert len == 15`）；ALIASES_V0 现役 8 族（`assert 族数 == 8`）。本批涉及：`PAGE-TASK-STEP-*` 为 ALIASES_V0 已登记族（A6 rename-on-ingest）；`PROC-*`/`SCENE-*`/`STATE-*`/`TRANSITION-*`/`TASK-STEP-*`/`CTX-*`/`STEP-*`/`ACC-*`/`ACT-*`/`ACTOR-*`/`OBJ-*`/`PERM-*`/`RULE-*` 为文档本地族词形（照录 aliases，赐名照 batch3 §4 通则；TASK-STEP-* ≠ ALIASES_V0 的 `TASK-*` 收编语义——后者是迁移工作 TASK id 族，前缀同形语义异族，禁误收编，见 §4 注记）。group B 涉及：`CAPABILITY.FDP.*`（本地族词形赐名，§7）、`PAGE.UIUX_SPEC.*`（ALIASES_V0 族内 facet 投影，A6 场景，§8）；`FDP-*` / `ACCEPT-PAGE-*` 均非 ALIASES_V0 现役 8 族成员（族级登记归词汇表 PR/Owner，§13）。
5. 对象信封过 FROZEN `02-object-envelope.schema.json`（jsonschema draft-07）；gate 结果过 FROZEN `03-gate-result.schema.json`（verdict 七态 snake_case）。
6. 三红线全文继承：文件名小写（local-name 推导 `.lower()` 逐文件断言）；合规 AGG；`skipped_blindspot` 必附盲区指标；`passed` 且 `violations>0` 非法；数值语义不篡改（planned 就是 planned、scenes compiled 13 就是 13、duplex 指针悬空数如实登记）。
7. **登记键存在性是内容的确定性函数**（batch2 FAIL-2 红线）：`superseded_status_field` 等登记键非空才写；空则不写。
8. 禁 git 操作；Python 3.14 环境注意照 batch1 §12（禁 `@dataclass`+裸 `importlib`；控制台 ASCII 或 `PYTHONIOENCODING=utf-8`）。
9. provenance 每对象必填（batch1 §6 形态；`locator.batch="MIG-B5"` + `locator.ingested_from` 逐对象登记；源 pin 现场重算并与 batch5 inventory `content_sha256` 比对，第二/三源（blueprint-baseline/01_domain-projection）多源 pin 照 batch2 §6，任一失配 fail-closed exit 2）。
10. merge-preserving：源实体逐字保真（`payload.<family>` 与源条目深度等价为工具断言）；中文业务事实正文（page.contract.purpose、scenes given/when/then、work_context entry/exit_conditions 等）是**业务事实正文不是 notes 叙事**——逐字进 payload（batch3 §2.1 散文边界先例），禁转写禁"规范化"。
11. 语义转录 ≠ 格式转换（batch1 §11 全文有效）；大体量纪律照 batch3（347 实体全脚本驱动，禁手写大 JSON）。
12. **Episode 归档语义（本批铁律 3）**：流程档案（00/03/06/07/09/10/11/回执）不建 Live State truth 对象——归档=manifest（batch5 inventory 即 manifest 登记层；落盘载体 `episodes/archive-manifest.yaml`，§11）+ 必要的 Evidence/Episode 抽取；归档不是删除，MASTer 侧文件一个不动。本批 truth 转录对象只出自蓝图真值资产 **01/02/08**（02 侧 33 + 01 侧 109 + 08 侧 15 = 157；group-b 分册已并入本卷，§13）。
13. **双真相封堵（02b §7 注记的 batch5 形态）**：物理路由串不入本批对象 payload——源 `route=null`（`route_authority=frontend-unresolved`）照录 null 即"无路由主张"的诚实表达；页面↔目录与 route_name 权威在 KEYBINDING.*（batch2 surface 对象 key_bindings 已承载锚），本批 bp_ref 指针指向 batch2 对象即复用其锚，禁在本批对象重复登记路由锚。
14. **group B 分母三重一致（group-b 分册硬约束 4 并编）**：源条目数、落盘对象数、inventory 分母实测值三者相等（01：`len(projections)=109` × 3；08：`len(page_contracts)=15` × 3）；伴随对账 fail-closed：01 semantic_coverage present 项 count 合计 == len(projections)（册内恒等式）+ semantic_type 分布与 inventory value_breakdown 全等 + 8 gap 类型 count=0 照录；08 acceptance_scenarios 15 条 page_id 与页 id 集合 1:1 + wrapped 字段 270/270 status=proposed + provider_evidence 15/15 在场（细则 §7/§8）。
15. **只读探测与源内日期词形边界（group-b 分册硬约束 8/2 并编）**：对 MASTer 仓的**只读** `git grep -l -F` 探测不属 git 写操作（batch3 KBM 现场核验先例；零写入零 mtime 触碰；§7 evidence 轴复测专用）；源内日期词形逐字保真——01 零日期词形；08 唯一日期词形 = `EV-PROTOTYPE-20260722` 证据 **id 词形**（身份字符串非墙钟字段，工具现场扫描断言无其他日期词形）。
16. **GateResult 产出面唯一（group-b 分册硬约束 6 并编 + M4 扩充）**：各转录工具自检不冒充 GateResult（不落 GRN 文件、不伪造 seq，§6）；本批唯一合规 GateResult 产出面 = `tools/run_blueprint_link_gate.py`（gate_def=`POLICY.GATE.MIG_B5_BLUEPRINT_LINKAGE@0.1.0`；GRN-4701..4704 全字段过 FROZEN 03 schema，§12）。

---

## 1. 目录布局与 kind-dir（延续 batch1 闭表）

```
corpus/master/batch-5/
├── CONVENTIONS.md                        # 本文件（batch5 主卷，含 group-b 分册合并，§13）
├── CONVENTIONS.group-b.md                # group B 分册（已合并入本卷，头部指针注记；文件保留为历史档案）
├── inventory.yaml                        # M0 只读盘点（pin/分母/事故证据事实源，只读消费）
├── tools/
│   ├── build_m0_inventory.py             # M0（已在册）
│   ├── ingest_bp_main.py                 # 02 转录工具（确定性幂等）
│   ├── ingest_domain_projection.py       # 01 转录工具（109 对象，§7）
│   ├── ingest_uiux_functional_spec.py    # 08 转录工具（15 对象，§8）
│   ├── build_episode_archive.py          # Episode 归档工具（episodes/，§11）
│   └── run_blueprint_link_gate.py        # 蓝图联结 gate 工具（gate-runs/，§12）
├── episodes/
│   └── archive-manifest.yaml             # 流程档案归档 manifest（8 组 9 文件 + tombstone 9 条，§11）
├── gate-runs/
│   └── blueprint-linkage/                # 蓝图联结 gate（AGG + GTR-01..03，GRN-4701..4704，§12）
└── truth/
    └── objects/
        ├── page-surface/                 # PAGE.MODEL.* 15（02 侧 model.*）+ PAGE.UIUX_SPEC.* 15（08 侧 uiux-spec.*）
        ├── business-rule/                # POLICY.PROC.* 4 + POLICY.SCENE.* 13 + POLICY.BP_MODEL_EXTERNAL_REFS 1（02 侧）
        └── capability/                   # CAPABILITY.FDP.* 109（01 侧 fdp.*）
```

kind-dir 沿用 batch1 §1 十类闭表，禁即兴派生；batch5 在册合法 kind-dir（合并后）：`page-surface/`（page_surface）、`business-rule/`（business_rule）、`capability/`（capability）。其余七类未用到时目录不建。local-name 照 batch1 §1 + 红线 1（id 去前缀 → 段内下划线转连字符 → 小写 → `.` 连接 + `.json`；全小写硬断言）。样例：`PAGE.MODEL.BUC_ANALYSE` → `model.buc-analyse.json`（去 `PAGE.` 前缀后余段投影，与 batch2 facet 落位 `readiness.*`/`registry.*`/`nav.*` 同形）；`POLICY.PROC.BOM_BUILD_CHAIN` → `business-rule/proc.bom-build-chain.json`；`CAPABILITY.FDP.ACC.ADMIN.PERMISSION.IMMUTABLE` → `fdp.acc.admin.permission.immutable.json`；`PAGE.UIUX_SPEC.SELECT_VEHICLE_CONTEXT` → `uiux-spec.select-vehicle-context.json`。共目录注记（合并后已实际发生）：`page-surface/` 两族落位——`model.*` 15（02 侧）与 `uiux-spec.*` 15（08 侧），local-name 前缀区分；`capability/` 由 01 侧 `fdp.*` 独占。红线 1 全目录唯一性清扫：157 个对象文件名全小写且批内唯一（两转录工具各自断言只覆盖本组落位，合并时点已核验，§13）。合计 **157 对象** = 33（02：PAGE.MODEL.* 15 + POLICY.PROC.* 4 + POLICY.SCENE.* 13 + POLICY.BP_MODEL_EXTERNAL_REFS 1）+ 109（01：CAPABILITY.FDP.*）+ 15（08：PAGE.UIUX_SPEC.*）。

---

## 2. Blueprint 对象形态裁定（本批核心新条；02 侧）

**范围注记（合并后）**：本节裁定 `02_process-task-interface`（蓝图真值 A 组）；`01_domain-projection` 与 `08_uiux-functional-spec` 的对象形态裁定见 §7/§8（自 `CONVENTIONS.group-b.md` 分册全量并入，合并裁决记录见 §13）。

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
  "batch2_object_file": "corpus/master/batch-2/truth/objects/page-surface/buc-analyse.json"
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
- **group B 工具自证（group-b 分册 §6 并入）**：`captured_by=agent:mig-b5/<tool 文件名>`；`producer_id=prod.mig_b5_<工具名小写蛇形>`（01 origin=derived ⇒ producer 必填；08 origin=ingested，producer 块照 batch2 facet 先例随附）；自证程序：连跑两次全目录 sha256 零差异 + fresh/noop 计数（终态实测：01 fresh=109→0/noop=109；08 fresh=15→0/noop=15）；工具出口 0=成功、2=fail-closed（pin 失配/分母失配/漂移形态越界/校验失败/文件名违例，不落盘）。本组实测 fail-closed 拦截记录（工具真拦截，非装饰）：① schema_version 词形误设（源为 3 非 1，结构断言拦截后修正断言）；② semantic_coverage 恒等式检查首位实现按条目计数而非按 count 求和（自身缺陷被恒等式拦截后修正）；③ 宽前缀代码锚探测（`ACT-`/`CAP-`）误命中 src 普通词形——改全词形 `git grep -F` 精确探测后 0 命中。

---

## 7. 01_domain-projection：领域投影对象形态（109 × CAPABILITY.FDP.*，kind=capability）

（自 `CONVENTIONS.group-b.md` §2 全量并入，2026-08-29 合并；条文以本节为准，分册保留为历史档案。）

**粒度裁定：逐条立对象（109/109）。** batch1 §3 三问：① 检索路径在场——06_traceability-plan `nodes[]` 含 109 条 `frontend-domain-projection` kind 节点与 01 投影一一镜像（batch5 inventory cross_reference_forms `traceability_node_decomposition_06` 机械复测在案）、09.hard_spec_semantic_ids / 11.fine_grained_scope 按 ACC-*/ACT-*/CAP-* source_id 族逐条消费——按条目 id 检索成立，batch1 §3 request-classification 整册判例不适用（batch3 §2.1 分歧先例同款）；② ledger 预判缺位（本批无 M1 ledger），以 06 镜像节点为准；③ 演化原子性：投影条目经 compile_frontend_product_engineering 逐条派生（109 条 FDP-* 逐条独立演化）。

**赐名（batch3 §4 通则）**：`FDP-*` 为注册表本地族词形（非 15 前缀成员、非 ALIASES_V0 现役 8 族）→ canonical 机械形 `CAPABILITY.FDP.<tok>.<tok>…`——家族词 FDP 保留为前缀后第二段；余 token 边界保留为段界（禁单段摊平）；109/109 段文法全合法 + canonical 全 distinct（工具断言）。legacy 词形逐字照录 `aliases[]`。**非 A6 场景**（batch1 §6 边界条款）→ `origin` 保持源侧 derived（inventory 逐字）；`FDP.*` 别名族正式登记归词汇表 PR/Owner（§13 清单）。同族位 `source_id`（ACC-*/ACT-*/…）为 BP 语义实体词形，随 `payload.projection.source_id` 逐字承载，**不入 aliases[]**（aliases 是本对象身份词形链，source_id 是另一实体身份）。

**kind 裁定：capability**（axis_profile=capability_default）。02b §2 capability 蓝本两必填字段**缺席先例**（batch2 §5 SHELL 三字段缺席 / batch3 §3 machine 反向适用的再适用）：`canonical_realization` 缺席（`frontend_interpretation` 109/109 空对象、无实现可特化——缺席即禁 fabricate）、`category` 缺席（源无该字段；semantic_type 之别由 aliases/词形承载，不冒认蓝本字段）。payload 容器 `projection`（源条目整条逐字，deep-equal 断言）。

**axes**：`lifecycle=CURRENT`（投影条目为 producer_alive 在册的活跃 canonical 事实——batch3 machine 先例：registry 条目活而内容声明 planned）；`confidence=LOCKED`（blueprint_sha256 绑定 + 06/09/11 消费链在场 + 无未裁决值冲突）；`evidence=PLANNED`（coordinate_state 全 planned + src 侧锚 0 命中现场复测——禁静默全绿，锚在场后按 evidence 轴机判重验）；`change=STABLE`（pin 在场零漂移）。

**authority**：owner=`BUSINESS_OWNER`（batch3 authority.json M3 校准同族——业务域语义事实；源内 `authority=bp-derived-no-semantic-override` 109/109 即「语义属 BP/业务侧、前端仅投影」的权威信号）；delegates=[]；write_policy=EVOLUTION_CHANNEL。

**双轴拆分登记**：`coordinate_state=planned`（109/109）→ `superseded_status_field`（batch1 §4 形状）：mapped_to=`axes.evidence=PLANNED`（planned→PLANNED 机械事实映射，语义升级只登记不执行）；`source_status` 六维（applicability/approval_state/coverage_status/effective_state/evidence_status/maturity）为 **BP 侧结构化状态（已正交）**，随 `payload.projection.source_status` 逐字承载、**禁混轴**——`evidence_status=confirmed` 是蓝图证据状态，不是 vNext evidence 轴（代码接线），两轴词形差由分轴吸收，非矛盾、不立 conflict（batch2 §4 双轴分立条款同款）。

**evidence 轴诚实登记**：`payload.revalidation_human_required`（batch3 machine 登记形状）：aspect=`projection_code_anchor`，现场复测 = 工具对全部 109×2 个词形（FDP id + source_id）跑 `git grep -l -F`（src/ 范围，只读边界见硬约束 15），0 命中即 PLANNED；命中即 fail-closed（evidence 轴重验义务）。

**册级语义随对象承载**（batch2 附录 A 册级 meta 先例）：`blueprint_ref` / `decision_refs` 入 `payload.source_document_meta`；`semantic_coverage`（21 项）整块逐字入 `payload.semantic_coverage`——零丢失优先于体积（109 份重复是源文件级事实的忠实镜像）。

**分母三重一致（硬约束 14 细则）**：`len(projections)=109` × 3（源条目数 / 落盘对象数 / inventory `denominators.domain_projection_entries.value`）；伴随对账 fail-closed：semantic_coverage present 项 count 合计 == len(projections)（册内恒等式）+ semantic_type 分布与 inventory value_breakdown 全等 + 8 gap 类型 count=0 照录（fail-closed 留空设计照录）。

## 8. 08_uiux-functional-spec：UIUX 功能规格 facet 形态（15 × PAGE.UIUX_SPEC.*，kind=page_surface）

（自 `CONVENTIONS.group-b.md` §3 全量并入，2026-08-29 合并。）

**facet 模型（batch2 C.1 修订注记先例的直接适用）**：08 页契约落**自有 facet 家族** `PAGE.UIUX_SPEC.*`，不与 batch2 已落的 `PAGE.*`（surface 主对象）/ `PAGE.REGISTRY.*` / `PAGE.READINESS.*` / `PAGE.NAV.*` 同文件收敛；页级收敛经 `payload.id_facet.page_level_id`（=`PAGE.<SEG>`，ALIASES_V0 token 重排形）+ `merge_path=supersede` 登记，不发生同文件叠写。

**赐名与 origin**：`PAGE-TASK-STEP-<REST>` → `PAGE.UIUX_SPEC.<REST>`（族标记剥离、余段 upper-underscore，batch2 facet 机械投影同款）。因 `PAGE-TASK-STEP-*→PAGE.*` 为 **ALIASES_V0 已登记族** → rename-on-ingest 按 vocab 已登记规则发生 → **A6 场景**，`origin=ingested`（batch1 §6 OBS-3 裁定口径；batch2 facet 同款），legacy 词形照录 `aliases[]`。

**粒度裁定：一页一对象（15/15）**，页级验收 `acceptance_scenarios`（15 条 ACCEPT-PAGE-*，全 proposed）按 page_id 与页契约 **1:1 绑定**（工具断言），整条逐字内嵌 `payload.acceptance_scenario`——页级验收无跨页检索键，随页对象演化（不另立对象族、不制造 15 个孤立 id）。ACC-*（业务验收 13 条，01 侧）与 ACCEPT-PAGE-*（页级验收 15 条，08 侧）为**同域异族词形**，照录不合并（batch5 inventory cross_reference_forms `acceptance_word_forms` 分立登记口径）。

**kind=page_surface**（axis_profile=page_default，batch2 facet 同款）。02b §7 page_surface 蓝本 `surface` 字段**缺席**（batch2 §5 缺席先例同款）：08 是功能规格 facet 非结构 surface，surface 结构归 batch2 `PAGE.*` 主对象，不复制不冒认。

**双轴拆分**：wrapped 字段（18 个/页 × 15 页 = 270，`authority/status/value/evidence` 信封形状，工具闭集断言）`status=proposed` + `acceptance.status=proposed`（15）→ `superseded_status_field`（batch2 §4 对照表 DRAFT→PROPOSED 同族）：`axes.lifecycle=PROPOSED`（事实记录，语义升级只登记不执行归 Owner）。**跨轴断言自洽**：lifecycle=PROPOSED ⇒ evidence=PLANNED（FROZEN 信封 axes 注记的迁移耦合）；规格判卷态与页代码在场事实**分立**——页面代码锚在场（routes.ts/AuthenticatePage.vue 等）归 batch2 surface/registry facet 的 evidence 轴，本 facet 描述的是规格契约自身的接线态（未实施），禁混轴。

**axes**：`lifecycle=PROPOSED` / `confidence=LOCKED`（BUILD-BOM 除外，见 §9）/ `evidence=PLANNED` / `change=STABLE`。**authority**：owner=`FRONTEND_ENGINEERING`（batch3 M3 校准同族：前端工程执行 owner；源内 wrapped authority=`frontend-engineering-proposal` 的提案权威信号；页级 `authority=frontend-planned-candidate` 逐字随 payload 承载）。

**分母三重一致（硬约束 14 细则）**：`len(page_contracts)=15` × 3（源条目数 / 落盘对象数 / inventory `denominators.uiux_page_contracts.value`）；伴随对账 fail-closed：acceptance_scenarios 15 条 page_id 与页 id 集合 1:1 + wrapped 字段 270/270 status=proposed + provider_evidence 15/15 在场。

## 9. `MIG-B5/C-01`：provider 证据跨文件漂移（pending_conflicts，本批唯一值冲突）

（自 `CONVENTIONS.group-b.md` §4 全量并入，2026-08-29 合并。）

08 内嵌 `provider_evidence`（15/15 页，authority=`optional-evidence-not-business-truth`，provider=ui-ux-pro-max）与 `uiux-provider-overlay.yaml`（**MIG-B4 已转录**为 `KNOWLEDGE.OVERLAY.PAGES.*` 15 页对象）同源异文件。工具现场机械比对（08 侧 `{evidence_refs, visual_proposals}+page_id` vs overlay pages[] 条目 deep-equal）：

- **14/15 deep-equal**：跨批 corroborated（如实分批登记不并笔——batch5 inventory incident_history 先例：各批登记各自转录，不合并条目）；每对象 `payload.provider_evidence_cross_batch`（登记形状，CONVENTIONS 非匿名）承载比对结果。
- **PAGE-TASK-STEP-BUILD-BOM**：`visual_proposals.extraction_note` 两文件词形漂移 → `payload.pending_conflicts`（batch2 §5 形状）：`conflict_id="MIG-B5/C-01"`，双值逐字并存（08 侧 = 原型 pCalcParts 骨架描述；overlay 侧 = BP『添加 ≠ 写台账』印证），`rule="…report only, never auto-adjudicate"`，`resolution=PENDING_OWNER`；该对象 `confidence=PROVISIONAL`（batch1 §2 悬置态，禁 UNRESOLVED 兜底），其余 14 对象 LOCKED。
- **漂移形态断言**：divergent 集合恰为 `{BUILD-BOM}` 且漂移路径恰为 `visual_proposals.extraction_note`——任何其他漂移 = fail-closed（源演化后必须重审本批转录，禁静默吸收）。
- **多源 pin（batch2 §6）**：第二源 overlay 文件 sha256 现场重算，与 **batch4** inventory `content_sha256`（d8e5077d0694c9e5b2ff7f84186c0e157b076ce3f5f43df491b64b8d13f264f5）比对，失配 fail-closed。
- 零丢失澄清：本对象 payload 承载 **08 侧**词形（本批转录源）；overlay 侧词形已由 MIG-B4 对象承载——两侧词面各归其位，不并笔、不丢侧。
- **编号空间（合并裁定，§13）**：`MIG-B5/C-01` 为全批唯一值冲突编号，维持原号不重编。

## 10. D25 视觉 token 边界（视觉 token 不搬，任务铁律成文）

（自 `CONVENTIONS.group-b.md` §5 全量并入，2026-08-29 合并。）

本批转录**零 token 对象、零 token 值采纳**；视觉 token 权威 = batch4 `style-ownership`（POLICY.STYLE.*）与 `overlay-evidence`（KNOWLEDGE.OVERLAY.*）对象侧。源内三处含视觉观测词形的形态按 **merge-preserving 逐字随条目承载、不作 token 真值**（丢弃即 clobber，与铁律 10 冲突时逐字保真优先——承载 ≠ 采纳）：

1. `layout_regions.evidence[]` 内 3 处原型间距观测词形（`prototype:pCalcParts:space-y-2=8px-region-gap` / `filter-card-gap-3=12px` / `toolbar-gap-1.5=6px`，仅 BUILD-BOM）——工具逐条断言在场形态（防源演化扩面后静默）。
2. `provider_evidence.visual_proposals`（原型观察/原型文案，optional-evidence 定位）——随 payload.page_contract 逐字承载。
3. **BUILD-BOM extraction_note 含 token 提案词形**（`--mast-spacing-sm`/`--mast-spacing-md` 及新 token 建议 `--mast-spacing-2xs`）——token 提案停留在 optional-evidence/advisory 层，**不进入任何 token 采纳面**；采纳/否决归 style-ownership 权威面（Owner 裁决），本批只在 `MIG-B5/C-01`（§9）双值与 notes_md 双登记该边界。

## 11. Episode 归档落盘细则（硬约束 12 的落盘形态；`tools/build_episode_archive.py`）

- **落盘载体**：`episodes/archive-manifest.yaml`（document_kind=`m5-episode-archive-manifest`）。硬约束 12（铁律 3）的落盘细则：manifest 逐文件登记 ref/sha256/行数/归档理由/指针语义/去向指针；归档不是删除，MASTer 侧文件一个不动（工具对消费仓零写入，全部文件句柄只读打开，结构自证在 self_check）。
- **分母与恒等链**（工具 fail-closed）：archive_files_covered=9（8 组 canonical + 1 working_copy 成员，与 documents[] 分组求和恒等、与 tombstone 9 条恒等）；process_archive_groups=8（与 M0 inventory `assets[group=process_archive]` ref 集合双向相等）；tombstone_preregistrations=9（全部 `registered_only_not_executed`——本批只登记不执行，MASTer 零写入）；authorization_receipts_indexed=1（回执=授权事件 manifest，PERMIT_HISTORY 载体）；m0_inventory_cross_check=11（8 组 canonical + working 副本逐文件 sha256/行数与 M0 pin 全等比对）；fta_findings_extracted=18（MIG-B1 change-object 18/18 alias 词形集合相等）。源行数合计 17431。
- **episode_class 闭世界词表（4 类，禁即兴派生）**：`PLAN_SNAPSHOT`（计划快照型：整体快照语义，无逐条独立裁决语义，只进 manifest 不抽取条目；本批 5）/ `FTA_FINDINGS`（发现型：FTA-* findings 逐条独立索引 id/严重度/行锚/去向对象指针，正文留在源；本批 1）/ `LIFECYCLE_LOG`（状态日志型：文件级指针，本 manifest 只登记文件级指针；本批 1）/ `PERMIT_HISTORY`（授权/审批记录型：回执逐份即授权事件的 manifest 载体，逐份索引 actor/gate/binding 指针/墙钟在场布尔；本批 1）。
- **墙钟纪律（batch4 §4）**：源内墙钟字段（00 authorized_at/expires_at、03 registered_at、07 as_of、回执 authorized_at/expires_at）只登记在场布尔（`*_present: true`），值不转录。
- **manifest 身份声明**：manifest 非 `02-object-envelope` 对象、非 `03-gate-result`（不落 GRN、不伪造 seq；02/03 schema FROZEN 照过声明）；本文件不新铸 GOVERNED_PREFIXES id，FTA-*/PREDEV-CONFIRMATION-*/MODULE-*/SLICE-* 等源内文档本地词形照录（只登记不改名）；文件名小写红线照三红线（`archive-manifest.yaml` 全小写，落盘前断言）。
- **抽取语义**：`extractions.authorization_receipts`（1 条）与 `extractions.technical_assessment_findings`（18 条）逐字段为源逐字转录（merge-preserving；severity←priority、summary←business_consequence 等来源字段声明随条），不 paraphrase 不代填；`migration_pointer` 指向 batch1 change-object（canonical_id + aliases + object_file）。
- **幂等自证**：构建两遍 byte-identical 才落盘；self_check 19 checks 全 passed + skipped_blindspot 1（00_lifecycle 裸哈希指针全仓语料普查属 M0 现场职责，本工具不重复全仓扫描，盲区指标承载：悬空 2 条登记不冒算）。

## 12. 蓝图联结 gate（`tools/run_blueprint_link_gate.py`；本批唯一合规 GateResult 产出面，硬约束 16）

- **产出**：`gate-runs/blueprint-linkage/` 下 AGG + 3 份 per-check 运行记录（`AGG-MIG-B5-blueprint-linkage.json` + `GTR-MIG-B5-blueprint-linkage-01..03-*.json`）。gate_def=`POLICY.GATE.MIG_B5_BLUEPRINT_LINKAGE@0.1.0`；全字段过 FROZEN `03-gate-result.schema.json`（verdict 七态 snake_case，红线 2 禁自由形状）；聚合 rollup=worst-of（任一 failed → failed，否则取最差具体七态）。
- **三检查与判卷分母**（迁移期未注册 DENOMINATOR.* 对象，`denominator_refs` 显式空数组=诚实声明）：
  1. **GRN-4701 bp-page-linkage**（metric_dialect=`blueprint:batch2_page_refs`）：判卷分母=层级引用数 35（§3 引用计数口径：①bp_ref 15 + ②scene→page 20）；canonical/alias 双侧解析；实测 15/15 + 20/20，主判定面悬空=0；登记保真（batch5 对象 bp_ref/id_facet 块 vs 现场重算逐字段：object_id/目标文件在场/-resolution_status/aliases 照录/scene payload 深度等价）失配=0。伴随面：02 的 210 state 词形 → batch3 aliases 解析 187/悬空 23——**登记不裁决**（裁决史=GRN-4503 failed + Owner 位；本 gate 判登记保真度：15 对象 `payload.dangling_state_refs` 逐页与复算全等，失配=0；悬空不重复计 violations 也不隐瞒，blindspot 指标如实披露）。
  2. **GRN-4702 archive-manifest-completeness**（metric_dialect=`archive:manifest_rows`）：判卷分母=manifest 档案行 9；五重判定（C5 现场重算）：①文件数恒等链 rows 9 == denominators 9 == tombstone 9 == inventory 8 组 + working pin 1；②组集合相等（manifest documents[] ref 集 == inventory process_archive ref 集 8=8）；③逐行 sha256/行数三方对账（MASTer live == manifest 行 == inventory pin）9/9；④tombstone 预登记逐 ref sha/行数三方相等；⑤episode_class 落 4 类闭世界 + 组登记必填字段（sha/行数/archive_reason/pointer_semantics/episode_summary）在场。
  3. **GRN-4703 fta-findings-coverage**（metric_dialect=`audit:fta_findings`）：判卷分母=源 findings 18（全 FTA-* 前缀断言在场）；抽取完备（manifest extractions 18 条 id 集合与源精确相等——缺 0=漏抽、多 0=虚增，均逐条计 violations）；migration_pointer 保真失配=0；覆盖规则复算（batch1 在册口径：canonical 名段 `CHANGE.[FB_]<X>` 剥前缀归一 ==finding id；FB 间接覆盖须对象 machine 链旁证，实测 1 条）；源行锚现场重算 18/18；字段逐字重算（severity←priority/dimension/disposition/summary←business_consequence）18/18；dependency_ids 闭包 20 条全在集合内；severity/disposition 分桶（blocker 8/high 10；engineering-decision 17/bp-feedback 1）与 manifest denominators 重算相等。
- **GRN-4704=AGG**（合规聚合）：counts 同名字段求和仅作总量留痕、不跨检查比较（scanned 口径各异：check1=联结载体对象 28[refs 级分母=35]、check2=判定单元 21[manifest 行级分母=9]、check3=findings 18；逐项明细见同目录 per-check 运行记录）；by_verdict passed=3。
- **确定性钉零**：`ran_at_seq=0`（采集批无 kernel seq 分配器，seq=MIG-B5 批基，A4 零墙钟，kernel 接入时重排）；`duration_ms=0`（byte-identical 幂等硬规则，`digest_excluded_fields` 承载）。
- **GRN 编号块保留**：GRN-470x 块确定性保留给 MIG-B5 blueprint-linkage 主题（4701..4703=三检查、4704=聚合；与 batch1 GRN-0001..0006/401..405/4101..4105、batch2 GRN-4201..4204/4301..4304、batch3 GRN-4401..4403/4501..4504、batch4 GRN-4601..4605 无重叠）。
- **self_report_trusted=false 落地形态**：`trust.asserted=null`（采集批无自报信道，producer self_check 声明值只作被检登记值参与对账），判卷唯一依据 `trust.recomputed`。
- **探针敏感性**：`MIG-B5-BLUEPRINT-LINKAGE-PROBE-SENSITIVITY-FIXTURE/passed`（三探针阴性自测在场：合成悬空词形必判悬空、真实 canonical/alias 双侧必解析、登记保真比较器必能检出扰动——不能失败的 gate 比没有 gate 更危险）。
- **实测终态**：三检查 verdict 全 **passed**（GRN-4701/4702/4703），AGG verdict=passed；悬空披露（数值语义不篡改）：本主题真实悬空仅伴随面 23 条 state 词形（登记不裁决），主判定面悬空 0。

## 13. 分册合并裁决记录（group-b 分册 §7 五项待合并点逐项处置；2026-08-29，P7 核验移交）

合并原则：只扩充、不推翻——主卷原 §1–§6 条目文本骨架不动（仅 §1 工具清单/效力范围与硬约束 3/4/12 按实际交付对齐），分册 §1–§6 有效条款全量并入（§7–§10 + §6 末追加 bullet），分册文件保留为历史档案（头部已加指针注记，效力以本卷为准）。分册 §7 五项待合并点处置如下：

1. **主卷合流（分册 §7.1）**：冲突裁决顺序——分册与主卷文本一致（FROZEN 事实源 > batch5 inventory > 本约定 > batch4 > batch3 > batch2 > batch1 > 转录者个人判断），以本卷冲突裁决顺序段为唯一登记位；硬约束编号连续性——group B 独有差异点编为主卷硬约束 14–16（主卷 1–13 编号与文本骨架不动）；效力区间——统一为本卷头部全批表述（157 对象 + `episodes/` + `gate-runs/` + 全部工具）。
2. **事故/冲突编号空间（分册 §7.2）**：`MIG-B5/C-01` 维持原号不重编——本卷无并行 C-xx 编号（本卷附录 C 为跨批引用统计表，非冲突编号空间），C-01 即全批唯一值冲突编号；登记位=§9 + 对象 `payload.pending_conflicts`（batch2/batch3 先例：C-* 编号在 CONVENTIONS 登记）。M0 inventory `incident_history` 各资产均为空或仅跨批转录史，不涉 C-01（M0 盘点先于分册落盘），互证登记位以本节为据。
3. **目录共享（分册 §7.3）**：已实际发生——`page-surface/` 两族共目录（`model.*` 15 + `uiux-spec.*` 15，local-name 前缀区分）、`capability/` 由 `fdp.*` 独占（§1）；红线 1 全目录唯一性清扫在合并时点核验：157 个对象文件名全小写且批内唯一（两转录工具各自断言只覆盖本组落位；跨组零重叠由 local-name 前缀 `model.`/`uiux-spec.`/`fdp.`/`proc.`/`scene.`/`bp-model-external-refs` 机械可辨）。
4. **inventory 互证（分册 §7.4）**：确认无需改本组工具——本组分母基准取自 batch5 M0 inventory（`domain_projection_entries`=109 / `uiux_page_contracts`=15），与 A 组分母（`process_task_interface_entities`=347/外部引用 70）同源不冲突；分母口径分立登记于 §5（02 侧）与硬约束 14（01/08 侧）。
5. **词汇表 PR 清单累加（分册 §7.5）**：proposed_needs_human 清单（族级登记归词汇表 PR/Owner）合并后累计：`PROC.*`/`SCENE.*`（§2.2/§2.4，A 组既有）+ **`FDP.*`（→ `CAPABILITY.FDP.*`）与 facet 家族 `PAGE.UIUX_SPEC.*`**（§7/§8，B 组并入）；`ACCEPT-PAGE-*` 词形（页级验收 id，未赐 canonical、随 payload 承载）是否立族归 Owner。

---

## 附录 A：语义对照表（零丢失证明；02 侧）

> 范围注记（合并后）：本附录为 02 侧零丢失证明；01/08 侧零丢失对账 = §7/§8 分母三重一致（109×3 / 15×3）；Episode 归档侧 = §11 恒等链（rows 9 == denominators 9 == tombstone 9 == inventory 8 组 + working pin 1）；gate 侧 = §12 三检查（GRN-4701..4703 全 passed）。

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

## 附录 B：ingest 工具契约（02 侧）

> 范围注记（合并后）：本附录为 02 侧 `tools/ingest_bp_main.py` 契约；group B 工具（`ingest_domain_projection.py`/`ingest_uiux_functional_spec.py`）契约见 §7/§8 + §6 末追加 bullet，Episode 归档工具见 §11，gate 工具见 §12。

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
