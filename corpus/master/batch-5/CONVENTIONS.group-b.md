# MIG-B5 转录约定书 · 蓝图真值 B 分册（CONVENTIONS.group-b）—— 01_domain-projection + 08_uiux-functional-spec

> **分册地位（待合并声明）**：本文件是 `corpus/master/batch-5/` 蓝图真值 B 组（group B：01 + 08 两资产）的**独立成文分册**——撰写时组 A 的 batch5 CONVENTIONS 主卷尚未落盘，故按任务书「若未就绪则与你的裁定独立成文」办理。合并待办（merge points）见 §7；合并时本分册效力并入主卷、不推翻 batch1–batch4 约定书任何条目。
>
> **已合并入主卷（2026-08-29，P7 核验移交）**：本分册有效条款已全量并入 `CONVENTIONS.md` 主卷——§2→主卷 §7、§3→主卷 §8、§4→主卷 §9、§5→主卷 §10、§6→主卷 §6 末追加 bullet、§7 五项待合并点→主卷 §13 逐项处置；目录布局由主卷 §1 合并版统一承载；本分册硬约束差异点编为主卷硬约束 14–16。**本文件自此保留为历史档案，效力以主卷为准，正文不再维护；先读主卷，后读本文件。**

效力区间：`corpus/master/batch-5/tools/ingest_domain_projection.py` + `tools/ingest_uiux_functional_spec.py` 两个转录工具及其落盘对象（`truth/objects/capability/fdp.*.json` 109 个 + `truth/objects/page-surface/uiux-spec.*.json` 15 个）。后续施工前必读；本文是施工规范，不是散文。

与 batch1–batch4 的关系：本文**只扩充、不推翻** `batch-1/CONVENTIONS.md`（下称「batch1 约定书」）、batch2 约定书、batch3 约定书、batch4 约定书。batch1 §2 信封字段 / §4 双轴拆分 / §5 别名收编 / §6 provenance / §7 幂等确定性 / §8 字段归属 / §9 gate 结果词汇，batch2 §2–§5 对象形态与三红线（硬约束 7）+ §5 pending_conflicts 形状 + §6 多源 pin，batch3 §2.2 准入门 / §2.5 分片规则 / §4 本地族词形赐名通则 / §5 fresh-noop 自证，batch4 §3 Baseline 引用形态（本批未触发，PROJECT 形 absent）与 §4 墙钟边界，继续全文有效。

冲突裁决顺序：FROZEN 事实源（`packages/schemas/assets/02-object-envelope.schema.json`、`02b-kind-payloads.md`、`03-gate-result.schema.json`、`packages/kernel/src/gate-result.ts`、`packages/schemas/src/vocab.ts`）> `corpus/master/batch-5/inventory.yaml`（M0 盘点，pin + 分母基准事实源）> 本约定 > batch4 约定 > batch3 约定 > batch2 约定 > batch1 约定 > 转录者个人判断。

硬约束（违者返工；1–13 继承 batch1–batch4 同族条目，此处只列 batch5 group B 差异点）：

1. MASTer_master（`D:\Vscode Documents\MASTer_master`）绝对只读；一切产出写 `corpus/master/batch-5/`（本分册工具只进 `tools/`，对象只进 `truth/objects/`）。禁碰 `POMaster_VNext/catalog/`（batch4 硬约束 1 同款）。
2. 禁墙钟（批次代号固定 `MIG-B5`，seq 口径 `MIG-B5`）；同输入重跑 byte-identical（幂等）。源内日期词形逐字保真（本批实测：01 零日期词形；08 唯一日期词形 = `EV-PROTOTYPE-20260722` 证据 **id 词形**——身份字符串非墙钟字段，工具现场扫描断言无其他日期词形）。
3. 确定性序列化照 batch1 约定书 §7（`sort_keys=True, indent=2, ensure_ascii=False` + 末尾 `\n`，bytes 写入，UTF-8 无 BOM）。
4. **分母一等公民 + 三重一致**：源条目数、落盘对象数、inventory 分母实测值三者相等（01：`len(projections)=109` × 3；08：`len(page_contracts)=15` × 3）；伴随对账（工具 fail-closed）：01 semantic_coverage present 项 count 合计 == len(projections)（册内恒等式）+ semantic_type 分布与 inventory value_breakdown 全等 + 8 gap 类型 count=0 照录；08 acceptance_scenarios 15 条 page_id 与页 id 集合 1:1 + wrapped 字段 270/270 status=proposed + provider_evidence 15/15 在场。
5. ID 文法 15 前缀闭世界不变（`vocab.ts` `GOVERNED_ID_PREFIXES`，`assert len == 15`）；ALIASES_V0 现役 8 族（`assert 族数 == 8`）；本批新涉及前缀族：`CAPABILITY.FDP.*`（本地族词形赐名，§2）、`PAGE.UIUX_SPEC.*`（ALIASES_V0 族内 facet 投影，§3）；`FDP-*` / `ACCEPT-PAGE-*` 均非 ALIASES_V0 成员（族级登记待词汇表 PR/Owner）；`PAGE-TASK-STEP-*` 为 ALIASES_V0 已登记族（A6 场景，§3）。
6. 对象信封过 FROZEN `02-object-envelope.schema.json`；工具自检不冒充 GateResult（batch3 §6 全文适用；本批零 GateResult 产出）。
7. 三红线（batch2 硬约束 7）全文继承：文件名小写（红线 1，全小写 + 唯一性断言）；合规 AGG（本批无 AGG）；skipped_blindspot 必附盲区指标（本批无该 verdict）；`passed` 且 `violations>0` 非法；数值语义不篡改。
8. 禁 git 操作（对 MASTer 仓的 **只读** `git grep` 探测不属 git 写操作，batch3 KBM 现场核验同款先例；工具内 subprocess 探测仅 `git grep -l -F`，零写入零 mtime 触碰）；禁改 `POMaster_VNext` 的 `packages/`、`catalog/`、`examples/`、`benchmarks/`、`tests/` 等任何其他路径。
9. provenance 每对象必填（batch1 约定书 §6 形态；`locator.batch="MIG-B5"` + `locator.ingested_from` 逐对象登记；两源 pin 现场重算并与 inventory `content_sha256` 比对，任一失配 fail-closed exit 2）。
10. merge-preserving：源条目逐字保真（batch1 §10 全文有效）；payload 载荷与源条目深度等价为工具断言（`payload.projection` / `payload.page_contract` / `payload.acceptance_scenario` 与源 deep-equal）。
11. 语义转录 ≠ 格式转换（batch1 §11 全文有效）；语义升级只登记不执行。
12. 大体量纪律照 batch3（124 对象全脚本驱动，禁手写大 JSON；fresh/noop 计数报告）。
13. Python 3.14 环境注意照 batch1 约定书 §12。

---

## 1. 目录布局

```
corpus/master/batch-5/
├── inventory.yaml                        # M0 只读盘点（pin + 分母基准，只读消费）
├── CONVENTIONS.group-b.md                # 本文件（group B 分册，待并入主卷，§7）
├── tools/
│   ├── build_m0_inventory.py             # M0（既有，本分册不触碰）
│   ├── ingest_domain_projection.py       # 01 → 109 个 CAPABILITY.FDP.* 对象
│   └── ingest_uiux_functional_spec.py    # 08 → 15 个 PAGE.UIUX_SPEC.* 对象
└── truth/
    └── objects/
        ├── capability/fdp.*.json         # 01 领域投影（一投影一对象，flat——109 ≤ 500 不分片）
        └── page-surface/uiux-spec.*.json # 08 页契约 facet（一页一对象）
```

kind-dir 沿用 batch1 §1 十类闭表，禁即兴派生；本分册在册：`capability/`（01）、`page-surface/`（08，batch2 facet 同目录）。local-name 照 batch1 §1 + 红线 1（`.lower()` 硬断言）。样例：`CAPABILITY.FDP.ACC.ADMIN.PERMISSION.IMMUTABLE` → `fdp.acc.admin.permission.immutable.json`；`PAGE.UIUX_SPEC.SELECT_VEHICLE_CONTEXT` → `uiux-spec.select-vehicle-context.json`。

## 2. 01_domain-projection：领域投影对象形态（109 × CAPABILITY.FDP.*，kind=capability）

**粒度裁定：逐条立对象（109/109）。** batch1 §3 三问：① 检索路径在场——06_traceability-plan `nodes[]` 含 109 条 `frontend-domain-projection` kind 节点与 01 投影一一镜像（batch5 inventory cross_reference_forms `traceability_node_decomposition_06` 机械复测在案）、09.hard_spec_semantic_ids / 11.fine_grained_scope 按 ACC-*/ACT-*/CAP-* source_id 族逐条消费——按条目 id 检索成立，batch1 §3 request-classification 整册判例不适用（batch3 §2.1 分歧先例同款）；② ledger 预判缺位（本批无 M1 ledger），以 06 镜像节点为准；③ 演化原子性：投影条目经 compile_frontend_product_engineering 逐条派生（109 条 FDP-* 逐条独立演化）。

**赐名（batch3 §4 通则）**：`FDP-*` 为注册表本地族词形（非 15 前缀成员、非 ALIASES_V0 现役 8 族）→ canonical 机械形 `CAPABILITY.FDP.<tok>.<tok>…`——家族词 FDP 保留为前缀后第二段；余 token 边界保留为段界（禁单段摊平）；109/109 段文法全合法 + canonical 全 distinct（工具断言）。legacy 词形逐字照录 `aliases[]`。**非 A6 场景**（batch1 §6 边界条款）→ `origin` 保持源侧 derived（inventory 逐字）；`FDP.*` 别名族正式登记归词汇表 PR/Owner。同族位 `source_id`（ACC-*/ACT-*/…）为 BP 语义实体词形，随 `payload.projection.source_id` 逐字承载，**不入 aliases[]**（aliases 是本对象身份词形链，source_id 是另一实体身份）。

**kind 裁定：capability**（axis_profile=capability_default）。02b §2 capability 蓝本两必填字段**缺席先例**（batch2 §5 SHELL 三字段缺席 / batch3 §3 machine 反向适用的再适用）：`canonical_realization` 缺席（`frontend_interpretation` 109/109 空对象、无实现可特化——缺席即禁 fabricate）、`category` 缺席（源无该字段；semantic_type 之别由 aliases/词形承载，不冒认蓝本字段）。payload 容器 `projection`（源条目整条逐字，deep-equal 断言）。

**axes**：`lifecycle=CURRENT`（投影条目为 producer_alive 在册的活跃 canonical 事实——batch3 machine 先例：registry 条目活而内容声明 planned）；`confidence=LOCKED`（blueprint_sha256 绑定 + 06/09/11 消费链在场 + 无未裁决值冲突）；`evidence=PLANNED`（coordinate_state 全 planned + src 侧锚 0 命中现场复测——禁静默全绿，锚在场后按 evidence 轴机判重验）；`change=STABLE`（pin 在场零漂移）。

**authority**：owner=`BUSINESS_OWNER`（batch3 authority.json M3 校准同族——业务域语义事实；源内 `authority=bp-derived-no-semantic-override` 109/109 即「语义属 BP/业务侧、前端仅投影」的权威信号）；delegates=[]；write_policy=EVOLUTION_CHANNEL。

**双轴拆分登记**：`coordinate_state=planned`（109/109）→ `superseded_status_field`（batch1 §4 形状）：mapped_to=`axes.evidence=PLANNED`（planned→PLANNED 机械事实映射，语义升级只登记不执行）；`source_status` 六维（applicability/approval_state/coverage_status/effective_state/evidence_status/maturity）为 **BP 侧结构化状态（已正交）**，随 `payload.projection.source_status` 逐字承载、**禁混轴**——`evidence_status=confirmed` 是蓝图证据状态，不是 vNext evidence 轴（代码接线），两轴词形差由分轴吸收，非矛盾、不立 conflict（batch2 §4 双轴分立条款同款）。

**evidence 轴诚实登记**：`payload.revalidation_human_required`（batch3 machine 登记形状）：aspect=`projection_code_anchor`，现场复测 = 工具对全部 109×2 个词形（FDP id + source_id）跑 `git grep -l -F`（src/ 范围），0 命中即 PLANNED；命中即 fail-closed（evidence 轴重验义务）。

**册级语义随对象承载**（batch2 附录 A 册级 meta 先例）：`blueprint_ref` / `decision_refs` 入 `payload.source_document_meta`；`semantic_coverage`（21 项）整块逐字入 `payload.semantic_coverage`——零丢失优先于体积（109 份重复是源文件级事实的忠实镜像）。

## 3. 08_uiux-functional-spec：UIUX 功能规格 facet 形态（15 × PAGE.UIUX_SPEC.*，kind=page_surface）

**facet 模型（batch2 C.1 修订注记先例的直接适用）**：08 页契约落**自有 facet 家族** `PAGE.UIUX_SPEC.*`，不与 batch2 已落的 `PAGE.*`（surface 主对象）/ `PAGE.REGISTRY.*` / `PAGE.READINESS.*` / `PAGE.NAV.*` 同文件收敛；页级收敛经 `payload.id_facet.page_level_id`（=`PAGE.<SEG>`，ALIASES_V0 token 重排形）+ `merge_path=supersede` 登记，不发生同文件叠写。

**赐名与 origin**：`PAGE-TASK-STEP-<REST>` → `PAGE.UIUX_SPEC.<REST>`（族标记剥离、余段 upper-underscore，batch2 facet 机械投影同款）。因 `PAGE-TASK-STEP-*→PAGE.*` 为 **ALIASES_V0 已登记族** → rename-on-ingest 按 vocab 已登记规则发生 → **A6 场景**，`origin=ingested`（batch1 §6 OBS-3 裁定口径；batch2 facet 同款），legacy 词形照录 `aliases[]`。

**粒度裁定：一页一对象（15/15）**，页级验收 `acceptance_scenarios`（15 条 ACCEPT-PAGE-*，全 proposed）按 page_id 与页契约 **1:1 绑定**（工具断言），整条逐字内嵌 `payload.acceptance_scenario`——页级验收无跨页检索键，随页对象演化（不另立对象族、不制造 15 个孤立 id）。ACC-*（业务验收 13 条，01 侧）与 ACCEPT-PAGE-*（页级验收 15 条，08 侧）为**同域异族词形**，照录不合并（batch5 inventory cross_reference_forms `acceptance_word_forms` 分立登记口径）。

**kind=page_surface**（axis_profile=page_default，batch2 facet 同款）。02b §7 page_surface 蓝本 `surface` 字段**缺席**（batch2 §5 缺席先例同款）：08 是功能规格 facet 非结构 surface，surface 结构归 batch2 `PAGE.*` 主对象，不复制不冒认。

**双轴拆分**：wrapped 字段（18 个/页 × 15 页 = 270，`authority/status/value/evidence` 信封形状，工具闭集断言）`status=proposed` + `acceptance.status=proposed`（15）→ `superseded_status_field`（batch2 §4 对照表 DRAFT→PROPOSED 同族）：`axes.lifecycle=PROPOSED`（事实记录，语义升级只登记不执行归 Owner）。**跨轴断言自洽**：lifecycle=PROPOSED ⇒ evidence=PLANNED（FROZEN 信封 axes 注记的迁移耦合）；规格判卷态与页代码在场事实**分立**——页面代码锚在场（routes.ts/AuthenticatePage.vue 等）归 batch2 surface/registry facet 的 evidence 轴，本 facet 描述的是规格契约自身的接线态（未实施），禁混轴。

**axes**：`lifecycle=PROPOSED` / `confidence=LOCKED`（BUILD-BOM 除外，见下）/ `evidence=PLANNED` / `change=STABLE`。**authority**：owner=`FRONTEND_ENGINEERING`（batch3 M3 校准同族：前端工程执行 owner；源内 wrapped authority=`frontend-engineering-proposal` 的提案权威信号；页级 `authority=frontend-planned-candidate` 逐字随 payload 承载）。

## 4. MIG-B5/C-01：provider 证据跨文件漂移（pending_conflicts，本批唯一值冲突）

08 内嵌 `provider_evidence`（15/15 页，authority=`optional-evidence-not-business-truth`，provider=ui-ux-pro-max）与 `uiux-provider-overlay.yaml`（**MIG-B4 已转录**为 `KNOWLEDGE.OVERLAY.PAGES.*` 15 页对象）同源异文件。工具现场机械比对（08 侧 `{evidence_refs, visual_proposals}+page_id` vs overlay pages[] 条目 deep-equal）：

- **14/15 deep-equal**：跨批 corroborated（如实分批登记不并笔——batch5 inventory incident_history 先例：各批登记各自转录，不合并条目）；每对象 `payload.provider_evidence_cross_batch`（登记形状，CONVENTIONS 非匿名）承载比对结果。
- **PAGE-TASK-STEP-BUILD-BOM**：`visual_proposals.extraction_note` 两文件词形漂移 → `payload.pending_conflicts`（batch2 §5 形状）：`conflict_id="MIG-B5/C-01"`，双值逐字并存（08 侧 = 原型 pCalcParts 骨架描述；overlay 侧 = BP『添加 ≠ 写台账』印证），`rule="…report only, never auto-adjudicate"`，`resolution=PENDING_OWNER`；该对象 `confidence=PROVISIONAL`（batch1 §2 悬置态，禁 UNRESOLVED 兜底），其余 14 对象 LOCKED。
- **漂移形态断言**：divergent 集合恰为 `{BUILD-BOM}` 且漂移路径恰为 `visual_proposals.extraction_note`——任何其他漂移 = fail-closed（源演化后必须重审本批转录，禁静默吸收）。
- **多源 pin（batch2 §6）**：第二源 overlay 文件 sha256 现场重算，与 **batch4** inventory `content_sha256`（d8e5077d0694c9e5b2ff7f84186c0e157b076ce3f5f43df491b64b8d13f264f5）比对，失配 fail-closed。
- 零丢失澄清：本对象 payload 承载 **08 侧**词形（本批转录源）；overlay 侧词形已由 MIG-B4 对象承载——两侧词面各归其位，不并笔、不丢侧。

## 5. D25 视觉 token 边界（视觉 token 不搬，任务铁律成文）

本批转录**零 token 对象、零 token 值采纳**；视觉 token 权威 = batch4 `style-ownership`（POLICY.STYLE.*）与 `overlay-evidence`（KNOWLEDGE.OVERLAY.*）对象侧。源内三处含视觉观测词形的形态按 **merge-preserving 逐字随条目承载、不作 token 真值**（丢弃即 clobber，与铁律 10 冲突时逐字保真优先——承载 ≠ 采纳）：

1. `layout_regions.evidence[]` 内 3 处原型间距观测词形（`prototype:pCalcParts:space-y-2=8px-region-gap` / `filter-card-gap-3=12px` / `toolbar-gap-1.5=6px`，仅 BUILD-BOM）——工具逐条断言在场形态（防源演化扩面后静默）。
2. `provider_evidence.visual_proposals`（原型观察/原型文案，optional-evidence 定位）——随 payload.page_contract 逐字承载。
3. **BUILD-BOM extraction_note 含 token 提案词形**（`--mast-spacing-sm`/`--mast-spacing-md` 及新 token 建议 `--mast-spacing-2xs`）——token 提案停留在 optional-evidence/advisory 层，**不进入任何 token 采纳面**；采纳/否决归 style-ownership 权威面（Owner 裁决），本批只在 MIG-B5/C-01 双值与 notes_md 双登记该边界。

## 6. 幂等 / provenance / 自证

- 幂等与序列化全文照 batch1 §7 + batch3 §5；`captured_by=agent:mig-b5/<tool 文件名>`；`producer_id=prod.mig_b5_<工具名小写蛇形>`（01 origin=derived ⇒ producer 必填；08 origin=ingested，producer 块照 batch2 facet 先例随附）。
- 自证程序：连跑两次全目录 sha256 零差异；工具报告 fresh/noop（终态实测：01 fresh=109→0/noop=109；08 fresh=15→0/noop=15）。
- 工具出口：0 = 成功；2 = fail-closed（pin 失配 / 分母失配 / 漂移形态越界 / 校验失败 / 文件名违例，不落盘）。工具自检不冒充 GateResult，不落 GRN 文件、不伪造 seq。
- 本批实测 fail-closed 拦截记录（工具真拦截，非装饰）：① schema_version 词形误设（源为 3 非 1，结构断言拦截后修正断言）；② semantic_coverage 恒等式检查首位实现按条目计数而非按 count 求和（自身缺陷被恒等式拦截后修正）；③ 宽前缀代码锚探测（`ACT-`/`CAP-`）误命中 src 普通词形——改全词形 `git grep -F` 精确探测后 0 命中。

## 7. 待合并点（merge points，交编排方/组 A 合并主卷时逐项裁决）

1. **主卷合流**：本分册并入组 A 的 batch5 CONVENTIONS 主卷时，冲突裁决顺序、硬约束编号连续性、效力区间表述需统一重述；本分册 §1–§6 为 group B 局部效力，不得被解读为整批约束。
2. **事故/冲突编号空间**：本分册占用 `MIG-B5/C-01`（provider 证据跨文件漂移）。组 A 若独立编号（C-01…）需在合并时统一重编（batch2/batch3 先例：C-* 编号在 CONVENTIONS 登记、inventory incident_history 互证）。
3. **目录共享**：`truth/objects/page-surface/` 若组 A 亦有落位（同为 page-surface 族 facet），以 local-name 前缀区分（本组 `uiux-spec.*`）；`capability/` 同理（本组 `fdp.*`）。合并时需一次红线 1 全目录唯一性清扫（两工具各自断言只覆盖本组落位）。
4. **inventory 互证**：本组分母基准取自 batch5 M0 inventory（domain_projection_entries=109 / uiux_page_contracts=15）；组 A 资产的分母基准同源，合并时无需改本组工具。
5. **词汇表 PR 清单累加**：本组新增待登记族 `FDP.*`（→CAPABILITY.FDP.*）与 facet 家族 `PAGE.UIUX_SPEC.*`；`ACCEPT-PAGE-*` 词形（页级验收 id，未赐 canonical、随 payload 承载）是否立族归 Owner。合并时并入组 A 的 proposed_needs_human 清单一并提请。
