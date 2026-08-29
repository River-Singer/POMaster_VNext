# corpus-rename-map · 全仓迁移痕迹盘点与改名映射表

> 产出性质：只读盘点结果 + 机器可执行改名映射（本文件将来随批次归档）。
> 仓库：`D:/Vscode Documents/po-master/POMaster_VNext`（下称「本仓」）。
> 铁律重申：MASTer_master 绝对只读；git mv 保历史、不动 git log、单批完成；
> AUTHORIZATION.md / TOMBSTONE-RUNBOOK.md 内 Owner/分类器逐字引语一个字不改；
> 机器字段禁墙钟、确定性序列化；catalog 条目改词必须修 producer 模板层再重产、
> lock content_sha256 随工具重算（禁手改 lock）、总条数保持 94；
> vitest 基线 671 passed + 1 skipped 不破；禁 commit/push。

## 0. 盘点基线事实（2026-08-29 实测）

- `migration/` 下 git 追踪文件 2197 个：batch1=332 / batch2=187 / batch3=1099 / batch4=320 / batch5=172 / renderer-v0=68 / spec-decomposition=17 / AUTHORIZATION.md + TOMBSTONE-RUNBOOK.md=2。
- `migration/` 内含 `migration/` 路径 token 的文件约 2100 个（全仓 3890 处 path 命中 / 2101 文件）；`migration/` 之外引用 `migration/` 路径的文件 **41 个**（清单见 §B）。
- catalog-lock.draft.json：**94 entries**（id/path/content_sha256/source_ref），来源三段：pilot 60（source_ref=pomaster/components 协议，零迁移痕迹）+ SPEC-D 精选 25（source_ref=migration/spec-decomposition/candidates/*.yaml）+ batch4 上提 9（source_ref=migration/master-batch4/split-ledger.yaml）。
- vitest 实测：**37 files / 671 passed + 1 skipped（672）**，exit 0。
- `.github/workflows/ci.yml`：**零** migration/master-batch/收编/迁移 引用（改名对 CI 无影响）。
- `tests/`（golden/integration/ratchet）：**零** `migration|master-batch` 路径引用（改名不触碰任何 fixture 路径）。
- corpus 内批次代号 token 计数：MIG-B1×1693 / MIG-B2×1070 / MIG-B3×4748 / MIG-B4×1651 / MIG-B5×525 / MIG-AUTH×25（处置见 §B3-KEEP 政策）。
- 已知tracked 异常：`migration/master-batch5/tools/__pycache__/run_blueprint_link_gate.cpython-314.pyc` 被 git 追踪（.gitignore 已有 `__pycache__/`，属早前强制 add）。
- 词汇表冻结值 `change: MIGRATING`（materialize_batch4_uplift.py VOCAB_AXES 及其上游冻结词表）与 triage 信号 `migration_hit`（packages/cli/src/triage.ts:86）均为**域内词**，不在改名范围。

### 词表映射（本批叙事）

| 旧词 | 新词 |
|---|---|
| migration/ 目录 | corpus/（语料） |
| master-batchN | corpus/master/batch-N |
| 迁移线/迁移批/收编/镜像收编（指语料工程时） | 纳管线/采集批/纳管/镜像纳管（corpus / field corpus / acquisition / onboarding） |
| legacy-layout / legacy-outputs（预设名） | registry-tree（注册表树投影预设，按功能命名） |
| renderer-v0 | prototypes/view-renderer |
| spec-decomposition | corpus/spec-knowledge |

**代号豁免**：批次代号 `MIG-Bn`/`MIG-AUTH`/`SPEC-D` 是采集运行的专有名（等同 commit sha 的记录身份），且 `MIG-AUTH-0001` 是 Owner 写授权记录的 seq 锚（铁律 3 保护圈）——**代号保留不改**；改的是**路径**（migration/、master-batchN、renderer-v0、spec-decomposition、legacy-outputs 等路径 token）与**面向产品的叙事/注记**。

---

## A. 目录/文件重命名映射（git mv 命令清单）

### A1. 顶层移动（9 条）

```bash
cd "d:/Vscode Documents/po-master/POMaster_VNext"
mkdir -p corpus/master/cutover prototypes

git mv migration/master-batch1 corpus/master/batch-1
git mv migration/master-batch2 corpus/master/batch-2
git mv migration/master-batch3 corpus/master/batch-3
git mv migration/master-batch4 corpus/master/batch-4
git mv migration/master-batch5 corpus/master/batch-5
git mv migration/AUTHORIZATION.md     corpus/master/cutover/AUTHORIZATION.md
git mv migration/TOMBSTONE-RUNBOOK.md corpus/master/cutover/TOMBSTONE-RUNBOOK.md
git mv migration/spec-decomposition   corpus/spec-knowledge
git mv migration/renderer-v0          prototypes/view-renderer
rmdir migration   # 移空后删壳
```

### A2. 语料内子改名（7 条）

```bash
git mv prototypes/view-renderer/renders/mig-b1 prototypes/view-renderer/renders/batch-1
git mv prototypes/view-renderer/renders/mig-b2 prototypes/view-renderer/renders/batch-2
git mv prototypes/view-renderer/renders/_proof/master-batch1-run1 prototypes/view-renderer/renders/_proof/batch-1-run1
git mv prototypes/view-renderer/renders/_proof/master-batch1-run2 prototypes/view-renderer/renders/_proof/batch-1-run2
git mv prototypes/view-renderer/renders/_proof/master-batch2-run1 prototypes/view-renderer/renders/_proof/batch-2-run1
git mv prototypes/view-renderer/renders/_proof/master-batch2-run2 prototypes/view-renderer/renders/_proof/batch-2-run2
git mv prototypes/view-renderer/tools/render_legacy_outputs.py prototypes/view-renderer/tools/render_registry_tree.py
```

### A3. legacy-layout → 功能命名（2 条）

```bash
git mv catalog/projection-presets/legacy-outputs.yaml catalog/projection-presets/registry-tree.yaml
git mv docs/legacy-layout-preset.md docs/registry-tree-projection-preset.md
```

### A4. 可选卫生项（决策点，1 条）

```bash
git rm --cached corpus/master/batch-5/tools/__pycache__/run_blueprint_link_gate.cpython-314.pyc
```

**A 合计：18 条 git mv + 1 rmdir + 1 可选 untrack。**
注：gate-run 文件名 `GTR-MIG-Bn-*` / `AGG-MIG-*` **不改**——文件名与文件内 gate id 一致，且属 §0 代号豁免政策。

---

## B. 文件内引用改写清单

### B0. 机械路径 token 替换规则（corpus 主体，按序全局执行）

对 `corpus/`、`prototypes/view-renderer/` 全部文本文件（md/yaml/json/py）按 **长 token 优先** 顺序替换：

| # | 旧 token | 新 token | 备注 |
|---|---|---|---|
| R1 | `POMaster_VNext/migration/master-batchN` | `POMaster_VNext/corpus/master/batch-N` | N=1..5，先于 R2 执行 |
| R2 | `migration/master-batchN` | `corpus/master/batch-N` | |
| R3 | `POMaster_VNext/migration/spec-decomposition` → `migration/spec-decomposition` | `POMaster_VNext/corpus/spec-knowledge` → `corpus/spec-knowledge` | 两条分别执行，长优先 |
| R4 | `POMaster_VNext/migration/renderer-v0` → `migration/renderer-v0` | `POMaster_VNext/prototypes/view-renderer` → `prototypes/view-renderer` | |
| R5 | `docs/legacy-layout-preset.md` | `docs/registry-tree-projection-preset.md` | |
| R6 | `catalog/projection-presets/legacy-outputs.yaml` | `catalog/projection-presets/registry-tree.yaml` | |
| R7 | `renders/mig-b1` / `renders/mig-b2` | `renders/batch-1` / `renders/batch-2` | |
| R8 | `renders/_proof/master-batchN-runM` | `renders/_proof/batch-N-runM` | M=1..2 |
| R9 | `tools/render_legacy_outputs.py` | `tools/render_registry_tree.py` | |
| X1 | `migration/mig-b1-b2-tombstone` | **豁免不改** | MASTer_master 侧分支名（只读仓） |

CJK 叙事词（迁移线/收编/镜像收编→纳管）**只允许**出现在 §B2 列出的活文档 prose，禁止对机器文件（json/yaml schema/lock/golden）做 CJK 替换（见 §D-3）。

### B1a. 产品侧必改（手工编辑，8 文件）

| 文件 | 改什么 |
|---|---|
| `catalog/tools/materialize_batch4_uplift.py` | :5,:31 docstring 路径与批次叙事；:59 `LEDGER_PATH` join 改 `("corpus","master","batch-4",...)`；:64 `CAPTURED_BY`→`agent:claude/batch-4-catalog-uplift`；:65 `LEDGER_REF`→`POMaster_VNext/corpus/master/batch-4/split-ledger.yaml`；:66 `CLEAN_ROOM_NOTE`→§C-1 新措辞；:358,:397,:408 `migration_batch` 字段名→`corpus_batch`（值做 `MIG-`→`batch-` 确定性映射，见 §C-3）；:428 package 措辞；:451-452 origin_note 措辞；:574-576 generated_by 措辞；:579-582 controlled_children note 措辞 |
| `packages/schemas/src/vocab.ts` | :175-178,:216 注释路径 `migration/master-batch1/tools/...`→`corpus/master/batch-1/tools/...`（注释级，零行为） |
| `packages/kernel/src/id.ts` | :9,:102 同上注释路径 |
| `packages/schemas/assets/vocab-lock.draft.yaml` | :7 头注叙事（MIG-B1 实测收编→语料批 batch-1 实测纳管）；:90,:91,:92 note 内 `机械映射权威=migration/master-batch1/tools/...`→新路径（note 是人类注记层，kernel 测试不钉注记文本，实测仅钉词形映射行为）；:106 注释路径 |
| `README.md` | :25 `收编已有`→`纳管已有`；:107 标签 `迁移路线 M0-M7`→`语料采集路线 M0-M7`（路径 `research/design-thread-B-migration.md` 指向 po-master 根的外部文件，路径不动）；:112 legacy-outputs 行→registry-tree 投影预设 + 新文档名；:94 `证据批量收编` 与 :28 `受控迁移` 为域内词**保留** |
| `docs/registry-tree-projection-preset.md`（A3 改名后） | 标题/正文 `legacy-outputs`→`registry-tree`；`迁移线 M5`→`纳管线 M5`；`迁移后的项目`→`完成纳管的项目`；:6,:15,:59,:80,:107,:115 对应叙事；:39,:134 `收编`（alias A6 域内词）保留 |
| `catalog/projection-presets/registry-tree.yaml`（A3 改名后） | :2,:15,:22 `name: legacy-outputs`→`name: registry-tree`；:26 `contract_doc`→新文档名；:30,:32,:40,:98,:213,:223 注释叙事（迁移项目→纳管项目）；:276 `migration-ledger`（语料对象 id）与 :294 `alias 收编` 保留 |
| `benchmarks/theme-demos-report.md` | :6,:273 路径 token（R1/R2）；:40,:41,:42,:157,:375,:390 叙事 `源形参考 MIG-B1 ...`→`源形参考语料批 batch-1 ...` |

### B1b. 产品侧重产（经 §C 工具链，35 文件）

`catalog/catalog-lock.draft.json`（generated_by + 34 条 source_ref）+ `catalog/policies/` 下 34 个 policy JSON（9 个 batch4 族全字段重产 + 25 个 SPEC-D 族 provenance/source_ref 重产）。**禁止手改**，全部走模板层。

### B1c. corpus/prototypes 侧机械改写（约 2100 文件 + 12 处 join 型手工点）

1. **全量 token 替换**（§B0 R1-R9）覆盖：5 批的 `CONVENTIONS*.md`×6、`README.md`×2、`inventory.yaml`×5、`classification-ledger.yaml`×3、`authority.json`×3、`key-binding-map*.draft.yaml`×4、`split-ledger.yaml`、calibration 4 件+3 工具、`gate-runs/**`（路径断言字符串，如 B3 state-integrity 的 `location` 字段、B1 contract/change-governance 的 source 列表）、`truth/objects/**`（escalation_hint 的 `regenerate via migration/...` 运营指针、overlay_objects 路径等）、`episodes/archive-manifest.yaml`、`pending-registrations*` 等。
2. **join 型路径常量（sed 盲区，逐处手工）12+ 处**：
   - `corpus/spec-knowledge/materialize-curated.py` :48 HERE 注释、:122 `POOL_REL`、:532/:671 ref 模板、:568-572 generated_by、:604 `built_by`、:718 written 字符串
   - `corpus/spec-knowledge/tools/build_spec_inventory.py` :5,:25,:27(OUT_DIR join),:326,:378
   - `corpus/spec-knowledge/tools/consolidate_pool.py` :49,:329
   - `prototypes/view-renderer/tools/tombstone_master.py` :27-29 `INVENTORIES` join、:72 `migrated_to` 返回模板（未来跑批用；MASTer 已落盘 58 件头不可改，见 §D-1）、docstring :2,:7（分支名 X1 豁免）
   - `prototypes/view-renderer/tools/render_registry_tree.py`（A2 改名后）docstring :4,:8,:25,:29-30,:791、:795 preset 路径 join
   - `prototypes/view-renderer/tools/check_fidelity.py` :4,:19（renders/mig-b1→batch-1）、:255
   - `catalog/tools/materialize_batch4_uplift.py` :59（已列 B1a）
   - `corpus/master/batch-4/tools/run_baseline_gate.py` :86 `BATCH = VNEXT / "migration" / "master-batch4"`；:219 台账 batch 断言值 `MIG-B4` **保留**（代号豁免）；:850 提示文案路径段
   - `corpus/master/batch-2/tools/run_page_composition_gate.py` :58、`run_blueprint_gate.py` :45 同型 join
   - `corpus/master/batch-3/tools/build_m3_authority.py` :44 `BATCH1_DIR` join
   - `corpus/master/batch-5/tools/run_blueprint_link_gate.py` :121 `MIG = VNEXT / "migration"`（变量名可留，值改 `VNEXT / "corpus"`）
   - `corpus/master/batch-5/tools/ingest_uiux_functional_spec.py` :97、`ingest_bp_main.py` :85,:93 join
   - 39 个批工具文件的字符串路径常量（`INV`/`KBM`/`destination`/gate 输入输出，逐文件 R1/R2 可覆盖绝大多数；执行后用 `rg -n 'migration/' corpus/ prototypes/` 归零验收，豁免 X1）。

### B2. 活文档叙事改写（新词表，9 文件）

| 文件 | 改什么 |
|---|---|
| `docs/vocab-pr-0001.md` | :45,:125,:151,:227,:317 路径 token（R1/R2）；:61,:71,:123,:149,:153,:155,:168 的 `MIG-B1` 代号**保留**；全文 `收编`（alias A6 域内词）保留 |
| `docs/trellis-gap-audit.md` | :59,:60,:100,:124,:147 `M0-M7 收编管线/迁移 manifest` 语料工程语境→`语料纳管管线 M0-M7`；:48,:85,:128 `收编`（journal/知识域）保留 |
| `docs/catalog-pilot-report.md` | :306 `实装留待迁移 M2/BATCH-1`→`实装留待纳管 M2/BATCH-1`；:311 `BATCH-1 收编`→`BATCH-1 纳管` |
| `packages/gauntlet-lite/test/architecture-adapter.spec.ts` | :4,:156 注释 `MASTer MIG-B1 已证`→`语料批 batch-1 已证`（注释级） |
| `packages/cli/src/store-layout.ts` | :22 注释 `MIG-B1 形态`→`语料批 batch-1 形态` |
| `packages/cli/tests/init.spec.ts` | :261 测试标题与 :264,:277,:345 注释同上改写（标题改写不影响断言） |
| `packages/kernel/tests/id.spec.ts` | :208 注释、:223 测试标题同上 |
| `corpus/master/batch-*/CONVENTIONS*.md`、`README.md`（corpus 内） | 效力区间/目录树段路径（R1/R2 已覆盖）；叙事 `迁移线/转录组施工`→`采集批/纳管施工`，`别名收编`（§5 域内词）保留 |
| `AUTHORIZATION.md` / `TOMBSTONE-RUNBOOK.md`（移至 corpus/master/cutover/） | **仅限**：vNext 仓内路径（TOMBSTONE :74 `migration/*/truth/objects/`→`corpus/master/*/truth/objects/`；:86 及 AUTHORIZATION :35 `migration/renderer-v0/`→`prototypes/view-renderer/`、删「（本目录）」字样、AUTHORIZATION :35 前半 `migration/renderer-v0/`→新路径）。逐字引语（:12 Owner 原话、:13 P4 包原文、:55 分类器异议）、MASTer 分支名 `migration/mig-b1-b2-tombstone`、`MIG-AUTH-0001` 锚、其余描述文字一律不动 |

### B3. 明确保留清单（false positive / 域内词 / 历史证据，禁改）

1. **CHG 语料语义内容**（"migration"=软件迁移域，非本项目迁移身份）：`POLICY.CHG.COMPAT_MIGRATION_ROLLBACK`（id+文件名+lock path）、`GATE.BE.CHG.CONTRACT_CHANGE_CHECKS` 的 `data_migration_consumers_checked`、`catalog/gates/gate.chg.prechange_checks.json:74` 的 `compat_migration_rollback_executable`、`catalog/candidates/candidates-draft.json`/`rejected.json` 全部「迁移」statement、`catalog/knowledge/knowledge.chg.example_prop_migration.json`、`knowledge.fp.be.contract_drift.json:34`、`policy.chg.staged_rollout.json:33`、`policy.web.api.client_change_impact.json:32`、`authority.be.contract_ownership.json:32`、`catalog/tools/materialize_catalog_pilot.py:125,:194` check_id。
2. **冻结词表值**：`change: MIGRATING`（VOCAB_AXES/词表 FROZEN 值）。
3. **triage 信号枚举**：`migration_hit`（packages/cli/src/triage.ts:86、tests/golden/**、benchmarks/phaseC/phaseD-demo-report.md）——扫描目标项目的迁移类代码信号。
4. **alias A6 「收编」域**（rename-on-ingest 术语）：docs/kernel-api.md、docs/architecture.md、docs/eight-beat-carriers-design.md、docs/catalog-apply-summary.md、tests/golden/cases.json（**FROZEN**）、packages/schemas/assets/01-truth-index.schema.json（**FROZEN**：`human_curated→natural`、`migrated→ingested` 映射注记）、examples/tiny-tool/README.md:41。
5. **语料对象 id**：`truth/objects/change-object/migration-ledger.json` 及 preset P3 清单中的 `- migration-ledger`（对象身份，改名=篡改语料）。
6. **批次代号**：corpus 记录内 `MIG-Bn`/`MIG-AUTH`/`SPEC-D`（gate-run 文件名 GTR-MIG-*/AGG-MIG-*、task_ref、FIXTURE_ID `MIG-B4-BASELINE-...`、台账 `migration_batch: MIG-Bn/...` 字段值、escalation_hint 的 `MIG-Bn/C-xx` 裁决指针、inventories 的 `migration_batch` 字段）。政策：**in-corpus 记录保留代号**（档案身份 + 铁律 3 的 MIG-AUTH 锚）；仅**产品侧发射**（catalog policy 字段/措辞）按 §C 换新词形。
7. **外部引用**：README:107 `research/design-thread-B-migration.md`（po-master 根，本仓之外）；MASTer_master 分支名与 58 件 tombstone 头（只读仓）。

---

## C. catalog note 重产清单（34 条目 / 35 文件，总条数保持 94）

### C-1. batch4 上提 9 条目（模板：`catalog/tools/materialize_batch4_uplift.py`）

条目 id（9，文件名 = id 小写 + `.json`，均在 `catalog/policies/`）：

1. POLICY.WEB.API.AUTH_APP_CLIENT_SPLIT
2. POLICY.WEB.API.REQUEST_INFRASTRUCTURE
3. POLICY.WEB.API.SESSION_RECOVERY_SPLIT
4. POLICY.WEB.ARCH.LAYER_ISOLATION
5. POLICY.WEB.ARCH.NAMING_CONVENTIONS
6. POLICY.WEB.ARCH.PUBLIC_API_BARREL
7. POLICY.WEB.PERF.BUDGET_SKELETON
8. POLICY.WEB.STYLE.OWNERSHIP_MATRIX
9. POLICY.WEB.UIUX.PROVIDER_EVIDENCE_NOT_BUSINESS_TRUTH

9 个文件共享同一组模板常量（措辞逐文件相同，改常量即全量生效）：

1. `CLEAN_ROOM_NOTE`（:66）`"independently rewritten from upstream batch4 mirror; zero verbatim copy"` → `"independently rewritten from field corpus batch-4 material; zero verbatim copy"`（落入每条目 `sources[].clean_room_note`，共 34 处 sub-rule sources）。
2. `LEDGER_REF`（:65）`POMaster_VNext/migration/master-batch4/split-ledger.yaml` → `POMaster_VNext/corpus/master/batch-4/split-ledger.yaml`（落入 `provenance.split_ledger`、`sources[].ref`、lock `source_ref`、`x-batch4-uplift.provenance`）。
3. `LEDGER_PATH`（:59）join 改 `("corpus","master","batch-4","split-ledger.yaml")`（纯输入路径）。
4. `CAPTURED_BY`（:64）`agent:claude/mig-b4-catalog-uplift` → `agent:claude/batch-4-catalog-uplift`。
5. 字段名 `migration_batch` → `corpus_batch`（:358,:397,:408 发射位；`provenance.corpus_batch` 与 `sources[].locator.corpus_batch`），值由台账值确定性映射：`MIG-B4/<DOMAIN>` → `batch-4/<DOMAIN>`（规则：replace 前缀 `MIG-`→`batch-`；台账原值零改动）。
6. `x-batch4-uplift.package`（:428）`MIG-B4 Universal 上提（工程策略族 split-ledger 驱动）` → `batch-4 语料批 Universal 上提（工程策略族 split-ledger 驱动）`。
7. `origin_note`（:451-452）`MIG-B4 split-ledger UNIVERSAL/HYBRID universal 半上提；目录词面独立改写（clean-room），零逐字拷贝上游源文本` → `batch-4 语料批 split-ledger UNIVERSAL/HYBRID universal 半上提；词面独立改写（clean-room），零逐字拷贝源文本`。
8. lock `generated_by`（:574-576）→ `catalog/tools/materialize_batch4_uplift.py（batch-4 语料批 Universal 上提；entries 按 id 排序；在 materialize_catalog_pilot.py 60 条基础上追加 9 条）`。
9. lock `controlled_children.note`（:579-582）`MIG-B4 split-ledger catalog_scope_note 纪律` → `batch-4 split-ledger catalog_scope_note 纪律`。
10. `BATCH = "MIG-B4"`（:63）保留（仅喂台账断言与报告，代号豁免）；`PROJECT_NOUNS` 零泄漏 grep 不受新措辞影响（新词零专名）。

### C-2. SPEC-D 精选 25 条目（模板：`corpus/spec-knowledge/materialize-curated.py`）

条目 id（25）：POLICY.ARCH.DECISION_TRADEOFF_RECORD、POLICY.CACHE.LIFECYCLE_DEFINITION、POLICY.CONFLICT.PRIORITY_LADDER、POLICY.DEP.ADMISSION_SIX_DIMENSION_CHECK、POLICY.DEP.CHANGE_SURFACE_REVIEW、POLICY.DEP.INTRODUCTION_REVIEW、POLICY.DERIVED.SINGLE_IMPLEMENTATION、POLICY.OBS.CORRELATION_CONTEXT_MINIMUM、POLICY.OBS.RUM_DIMENSION_WHITELIST、POLICY.PROC.PRE_CODE_DECLARATION、POLICY.REL.PRE_RELEASE_CONFIRMATION、POLICY.ROLE.DOMAIN_DECISION_AUTHORITY、POLICY.SEC.THIRD_PARTY_EXECUTION_REGISTER、POLICY.SPEC.ADMISSION_CRITERIA、POLICY.SPEC.DERIVED_VIEW_REGENERATION、POLICY.SPEC.FILE_STRUCTURE_CONTRACT、POLICY.SPEC.PROCEDURAL_RECORD_NOT_SURROGATE、POLICY.SPEC.SEMANTIC_IDENTITY、POLICY.SPEC.UNRESOLVED_LEDGER_GATE、POLICY.STACK.NO_IMPLICIT_SELECTION、POLICY.TOOL.SCOPED_SCAN_BOUNDARY、POLICY.WEB.COPY.SUPPRESSION_LEDGER_DISCIPLINE、POLICY.WEB.TRACK.CONSENT_LIFECYCLE、POLICY.WEB.TRACK.PRIVACY_DEFAULT_DENY、POLICY.WEB.TRACK.STABLE_EVENT_KEYS。

模板位 → 旧值 → 新值（措辞本身已无迁移词，仅路径换 corpus/spec-knowledge）：

1. `POOL_REL`（:122）→ `POMaster_VNext/corpus/spec-knowledge/candidates/consolidated-pool.yaml`（落 `sources[].provenance`... 实际落各 policy JSON :13 `"provenance"`）。
2. `sources[].ref` / lock `source_ref`（:532,:671）`POMaster_VNext/migration/spec-decomposition/candidates/%s.yaml` → `POMaster_VNext/corpus/spec-knowledge/candidates/%s.yaml`。
3. lock `generated_by`（:568-572）整串 → `catalog/tools/materialize_batch4_uplift.py（batch-4 语料批 Universal 上提；entries 按 id 排序；在 materialize_catalog_pilot.py 60 条基础上追加 9 条）+ corpus/spec-knowledge/materialize-curated.py（SPEC-D 汇总池 D5 精选追加 25 条）`。
4. `built_by`（:604）→ `corpus/spec-knowledge/materialize-curated.py`；written 字符串（:718）→ `corpus/spec-knowledge/backlog-registered.yaml`。
5. 其 curated `CLEAN_ROOM_NOTE`（:120 "independently rewritten from SPEC-D decomposition candidate cards; ..."）与 `captured_by: agent:claude/spec-d-consolidation` 无迁移词，**保留**。

### C-3. 重产顺序与 lock 不变量

```bash
# 前置：A 全部 git mv + B1a/B1c 模板编辑已完成
python catalog/tools/materialize_batch4_uplift.py            # 第 1 步：重产 9 条目 + lock（generated_by 暂为单工具版）
python corpus/spec-knowledge/materialize-curated.py          # 第 2 步：重产 25 条目 + lock（generated_by 恢复双工具合串）
python catalog/tools/materialize_batch4_uplift.py --verify   # 终检：全量 94 条 content_sha256 对账 + 幂等重演 + 零泄漏
python corpus/spec-knowledge/materialize-curated.py   #（工具内置双构建幂等自证；重复跑应零写入）
```

- 不变量：`entries == 94`；`controlled_children.allowed == required == 94 paths`（本批**零新增/删除 catalog 文件**，两处清单不变）；全量 sha 对账 0 mismatch（两工具均 fail-closed 内置）。
- 禁手改 policy JSON / lock；一切措辞变更走上列模板常量。
- pilot 60 条目及其文件零触碰（source_ref 本就无迁移痕迹）。

---

## D. 风险清单

| # | 风险 | 影响 | 处置 |
|---|---|---|---|
| 1 | **MASTer_master 58 件 tombstone 头与 pre-commit hook 提示词已写入 `POMaster_VNext/migration/...` 与 `legacy-outputs` 字样**（分支 `migration/mig-b1-b2-tombstone` commit 0a575b7） | 改名后 MASTer 侧冻结头指向陈旧路径；只读铁律禁改 | 接受为历史记录：`corpus/master/cutover/` 内 AUTHORIZATION/RUNBOOK 即解析记录；可在 RUNBOOK §6 增一行路径映射注记（属允许的「周边描述文字」）；工具模板（tombstone_master.py）同步新路径供未来运行 |
| 2 | vitest 基线 671+1 | tests/ 零 corpus 路径引用，改名本体不触及；风险仅在 B2 测试**标题**/注释编辑手误 | 改后全量 `npx vitest run` 对账 671+1；标题编辑逐条 eyeball |
| 3 | **盲 sed CJK 词会毁语料**：`迁移/收编` 在 CHG 政策、golden（FROZEN）、schema 注记、`MIGRATING` 轴、`migration_hit` 信号中是域内词 | 语义损坏 + golden/lock sha 失配 | 只执行 §B0 路径 token 规则；CJK 替换仅限 §B2 白名单文件；golden/packages/schemas/assets 七件 FROZEN schema + cases.json 列入禁改区（B3-4） |
| 4 | catalog 重产链顺序敏感 | generated_by 合串由 curated 最后写入；乱序会落单工具版 generated_by | 按 §C-3 顺序：batch4 → curated → 双 --verify；94 条对账内置 fail-closed |
| 5 | 工具幂等断言 | batch4 工具断言台账分母（317/universal10/hybrid24/project283）与 34 改写词面双向闭环——只改路径/措辞常量不动结构即安全 | 模板编辑后先跑 `--verify`（只读）再实跑 |
| 6 | 台账 `migration_batch` 值 MIG-B4/* 与产品发射值 batch-4/* 的映射 | 映射不规则会造成溯源断裂 | 固定确定性规则 replace(`MIG-`→`batch-`)；台账原值保留；B1a 模板位集中一处实现 |
| 7 | corpus 内约 2100 文件路径 token 重写 | 纯文本替换，无 hash lock 管辖 corpus（catalog-lock 只锁 catalog/）；风险=漏改/双改 | 长 token 先行 + 完成后 `rg 'migration/' corpus/ prototypes/ catalog/ packages/ docs/ benchmarks/ README.md` 归零验收（唯一豁免 `migration/mig-b1-b2-tombstone`） |
| 8 | join 型路径常量是 sed 盲区 | 工具跑批 fail-closed 报缺文件 | §B1c-2 列出 12+ 处逐点手改；另用 `rg -n '"migration"'|'/migration'`--type py 扫尾 |
| 9 | CI（.github/workflows/ci.yml） | 零引用 | 无需改；改名后 CI 天然绿 |
| 10 | `authority.json` 的 `pin` 校验定义文案含 `migration/* refs` fallback 描述 | 文案级；digest 按**内容**计算，路径改写不影响 pin 值 | R2 覆盖；重跑 M3 工具可验证（可选） |
| 11 | tracked `__pycache__/*.pyc` 随 git mv 带入 corpus | 仓库卫生 | A4 可选 untrack（决策点，不影响改名正确性） |
| 12 | README 文档地图引用本仓不存在的 `research/`、`doc/`、`.trellis/`（指向 po-master 根） | 改名前已存在的断链，非本批引入 | 仅改标签与 legacy-outputs 行；断链另立任务 |
| 13 | docs/vocab-pr-0001.md:227 等处「已写入 CONVENTIONS §6」引用 | CONVENTIONS 改路径后引用文本仍指同一规则 | 仅更新其中的路径 token，规则引文不动 |
| 14 | 本文件（corpus-rename-map.md）落在本仓根 | 归档归属 | 按任务说明随本批次归档（建议落点 corpus/master/cutover/ 同批或 docs/），归档时把 A/B/C/D 执行结果勾对 |

---

## E. 单批执行顺序草案（供执行批直接引用）

1. §A 全部 git mv（含 A2/A3；A4 决策点单独确认）。
2. §B0 全量路径 token 替换（corpus/ + prototypes/）+ §B1c join 型手改；`rg` 归零验收。
3. §B1a 产品侧 8 文件手工编辑（含模板常量与措辞）。
4. §B2 活文档叙事 9 文件（AUTHORIZATION/RUNBOOK 仅限 vNext 内路径 + 「（本目录）」修正）。
5. §C-3 重产链两步 + 双 verify（entries==94、0 mismatch）。
6. `npx vitest run` 对账 671 passed + 1 skipped。
7. 终扫：`rg -n 'migration/|master-batch|legacy-layout|legacy-outputs|收编|镜像收编|迁移' -g '!node_modules' -g '!coverage'` 逐条对照 §B3 KEEP 清单，剩余命中必须全部属于 KEEP 族或 X1 豁免。
8. 不 commit（主控负责）。
