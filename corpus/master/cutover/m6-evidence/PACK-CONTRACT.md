# PACK-CONTRACT · M6 Go/No-Go 证据包契约定稿

> seq 锚：`M6-EVID`（证据包汇编线批次代号；运行档案身份锚 `M6-EVID-0001` 起分配，禁墙钟）。
> 判据源（唯一权威）：`.trellis/tasks/08-27-pomaster-vnext-control-plane/research/design-thread-B-migration.md` §5.1（G1–G9 表）+ §1.7（M6 阶段行）。
> 本契约是汇编器实现与证据包内容的唯一施工图；实现侧不得扩大或缩水判据。
> 入库状态：本文件与证据包产物**本地留存于 corpus，不入库**（Owner 决定，同 `docs/` 纪律）；不执行任何 git commit/push。

---

## §0 M6 定位与判据原文（逐字照录）

### §0.1 M6 阶段定位

design-thread-B-migration.md §1.0 总览表 M6 行（逐字）：

> | M6 切断 Trellis | go/no-go 评审 → 移除 hook/injection/task 依赖 | go/no-go 证据包 + 切换 commit | §1.6 checklist 全绿 | 2h | 2 |

注记：该行退出判据写作「§1.6 checklist 全绿」，§1.6 实为 M5 Human View 节；G1–G9 checklist 实际定义于 §5.1。**本契约钉死：以 §5.1 表为准**，编号出入如实注记，不改原文。

证据包要回答的唯一问题（本契约 §0.1 钉死的定位）：**「vNext 是否已具备接管治理的事实基础」——M6 是迁移线 go/no-go（M7 旧系统归档的前置决策）**。包只呈报判据对照与开放项；go/no-go 判定权 100% 在 Owner（铁律 5）。

### §0.2 G1–G9 判据原文（§5.1 表逐字，不改一字）

| # | 判据 | 可机判方式（原文） | 来源依据（原文） |
|---|---|---|---|
| G1 | 功能覆盖矩阵闭合 | 高频操作清单（init/inspect/maintain/pre-dev 链/gate/context 注入/task lifecycle/write-gate）逐一标注 vNext 对应物 or 显式 declared-not-needed 决议编号；矩阵零空洞 | checkbox：不许凭感觉宣称等效 |
| G2 | 数据完整性无静默缺口 | inventory 全表中 `disposition != archived-with-pointer \|\| migrated` 的行为零；分母仍可计算 | GAP-POM-001 教训 |
| G3 | Gate 可信度自指验收 | 台账含 `failed>=1`、`skipped-due-to-blindspot>=1`、`passed>=若干`；从未报 failed 的 gate 视为可疑 | 「报绿的工具比没有工具危险」 |
| G4 | Tracer bullet 真实闭环 | ≥1 个真实变更完成 triage→maintain→change→implement→gate→reconcile→compact 全链且档案齐备 | PRD §68 P0 成功标准 |
| G5 | Portability 底线（D7） | 干净机器 fresh clone → bootstrap → doctor 全 PASS；`rm -rf .pomaster/runtime` 可重建 | §85 MEMORY_PORTABILITY_GATE |
| G6 | 记忆主权移交完成 | Claude 记忆 38 条 harvest 台账 100% reviewed；harness auto-memory 降级为 cache 模式；MEMORY_DRIFT 审计通过 | §84 |
| G7 | 双轨损耗在预算内 | 双记账任务数 / 双维护文档数的实测值未击穿 DP-2 上限 | 本提案新增 |
| G8 | 回滚预案演练过 | 归档 tag + 恢复 runbook 实际空跑过一次（对照 staged-replace WinError 5 先毁后败的前科，演练是硬要求） | 历史事故 |
| G9 | Consumer-local 护栏共存决议生效 | ESLint 规则与 suppressions 台账去留决定已书面化（见 5.3） | 证据#1 的「不要急着退役」纪律 |

对照口径预钉死（判据原文与现行语料 schema 的字段名出入，如实处理不硬凑）：

- **G2**：现行 `inventory.yaml` 无 `disposition` 字段；去向载体字段为 `assets[].migration_batch`。机判口径 = 每条 asset 具备非空 `migration_batch`（= migrated/有去向）即通过；空缺行逐条列 hole。原文照录在判据栏，对照口径在本节声明。
- **G4**：八拍现行为 triage→permit→context→exec-guard→check→record→reconcile→compact（`benchmarks/theme-demos-report.md` §2 对照表）；原文的 maintain/implement/change 语义由 permit/exec-guard/record 承担。对照表须逐拍给锚。
- **G5**：旧包命令 `pomaster portability bootstrap` 在 vNext 无同名物；对应语义 = clone→install→init→doctor（`docs/trellis-gap-audit.md` H7 REJECT 行「fresh clone+bootstrap≈认知恢复」、H14 ADOPT 行）。
- **G7**：`owner-adjudications.md` 裁决 5 的「20 真实任务强制复审」是 **triage 校准配额**（bench-0002 provision），与 DP-2 双轨配额**不是同一事物，禁止混用**。DP-2 双轨记账在语料中无档案。

---

## §1 证据包文档骨架（钉死，节序固定）

落点：`corpus/master/cutover/m6-evidence/`，产出两个编译件 + 一个静态件 + 工具目录：

```text
m6-evidence/
├── PACK.md                 # 人类可读证据包（编译产物，禁手工编辑）
├── pack-manifest.json      # 机器事实层（编译产物，PACK.md 唯一数据源）
├── README.md               # 静态说明（非编译器产物，不参与 byte-stable 比对）
└── tools/
    └── build_m6_evidence.py  # 汇编器（§3 契约）
```

PACK.md 节序（固定，不得增删换序）：

1. **卷头**：seq 锚（M6-EVID-0001）、汇编器消费的 repo HEAD sha（汇编时 `git rev-parse HEAD` 实测值入 manifest 机器字段）、`inputs_fingerprint`（consumed 文件集逐件 sha256 的确定性聚合，算法同 `views/build-manifest.json` 先例）、再产命令。
2. **§A 执行摘要**：只聚合机器事实——五批对象数/文件数、gate 四态计数、测试棘轮（floor vs 实测）、fresh-clone 结论、五裁决标题行、explicit_absence 条数。禁止判断性形容词（「良好/完善/成熟」禁入）。
3. **§B G1–G9 逐条判据对照表**：每条判据固定六栏——①判据原文（逐字，含来源依据列）；②对照事实（每个数字/陈述挂 `[SRC: …]` 锚）；③判据子项逐条核对（如 G3 拆 failed/skipped/passed 三子项各自 >= 判定，判定式照抄原文不等式）；④状态；⑤差异与开放项指针（OPEN-M6-*）；⑥对照口径（涉 §0.3 预钉死口径的引用之）。**状态词是子项不等式的机械核对结果，不是 go/no-go**。
4. **§C 开放项清单**：编号 `OPEN-M6-01` 起递增；每条 = 现状事实 + 锚 + 归属判定位（Owner 位 / 治理侧登记位 / 后续批次客体位）。铁律 3 指名项必须在场：tombstone 被否决、39 悬空待裁、catalog v1 未定版、20 任务检查点未满、GRN-4402 转治理侧。
5. **§D Owner 决策位说明**：只列「呈报位」（go/no-go 判定本身 + 各开放项的裁决入口 + 所需输入指针）；系统不得自答 go，本节不得出现任何倾向性推荐语。
6. **§E 附录证据索引**：consumed 文件全集（路径 + sha256 + 用途 + 被 §B/§C 引用的位置）；与 manifest `inputs_fingerprint` 一致性自证。

---

## §2 逐判据证据来源映射（汇编器照此聚合；「现状预期」为契约定稿盘点实测，汇编时重测覆盖）

### G1 功能覆盖矩阵闭合

- 聚合源：
  - `docs/trellis-gap-audit.md`（D19 门禁执行记录）：机制级对照 = 69 项 = MECHANISM_ADOPT 32 + MECHANISM_REJECT 37 + GAP 0（该文件 §1 结论速览）；REJECT 行自带理由/触发条件 = 判据认可的 declared-not-needed 形态。逐行抽取（#、机制名、桶、vNext 对应/理由列）入矩阵。
  - `packages/cli/src/*.ts`：vNext 命令面实测清单（init/triage/compact/permit/context/exec-guard/check/record/reconcile/status/doctor/digest/evidence/exec 等，以文件存在为锚）。
  - `benchmarks/phaseD-demo-report.md` §2 八拍对照表、`benchmarks/theme-demos-report.md` §2：操作↔命令实跑锚。
- 矩阵行 = §0.2 G1 原文点名的 8 操作（init/inspect/maintain/pre-dev 链/gate/context 注入/task lifecycle/write-gate）逐行；每行只允许填【显式写了对应物的锚】或【显式 REJECT 行的锚】；两者皆无 → hole 行，入 §C。
- 现状预期（诚实）：机制级 0 GAP 有档案；但 8 操作行中的 inspect/maintain/pre-dev 链在既有文档中无逐字点名锚，预计产生 hole 行 → OPEN-M6（Owner 裁 declared-not-needed 或补设计）。汇编器不得替 Owner 补判。

### G2 数据完整性无静默缺口

- 聚合源：
  - `corpus/master/batch-{1..5}/inventory.yaml`：`assets[]` 逐行核对 `migration_batch` 非空（§0.3 口径）；`denominators` 每条含 `value+method+source`（可计算性机判）。资产行实测基线：B1=10 / B2=48 / B3=10 / B4=10 / B5=11（合计 89）。
  - `corpus/master/views/build-manifest.json`：`.denominators`（application_pages 39 / capability_fdp 109 / published_openapi_operationids 190 / readiness 33 DRAFT+6 BLOCKED+0 READY / task_corpus_dirs 53）与 `.explicit_absence`（3 条：B4/B5 authority.json 缺、calibration 仅 B1 有）照录。
  - `corpus/master/rechecks/RCHK-1-owner-handoff.md`：数据面已知残差如实入 §C——GRN-4503 悬空 49→39（残留 39 条 `page_absent_from_state_enum`，FIX-3 未实施）、C-01 漂移对 25 对、OPEN-5 六页无机器边界、4 文件源侧 sha pin 失配登记（D24 警告不阻断）。
- 恒等式（fail-closed）：五批 asset 行合计 == 逐批枚举和；gate 递归文件数 == 40（见 G3）。

### G3 Gate 可信度自指验收

- 聚合源：
  - `corpus/master/{batch-1..5}/gate-runs/**/*.json`：递归实测 40 件（目录族：change-governance/contract/grid、blueprint/page-composition、calculation/state-integrity、baseline、blueprint-linkage）。汇编器**从 40 件原始 gate run 逐件重算 verdict 分布**，并与 `views/build-manifest.json` `.gate_runs`（passed 18 / failed 13 / not_configured 1 / skipped_blindspot 8）交叉核对；不等 → 拒绝产出。
  - 子项判定：`failed>=1`（13，成立）；`skipped-due-to-blindspot>=1`（8，成立）；`passed>=若干`（18，成立）——判定式逐字挂原文。
  - 「从未报 failed 的 gate 视为可疑」：按 gate-runs 目录族逐族统计 verdict 分布，凡全 passed 的族如实列名（汇编器只列事实，可疑性结论留给 Owner）。
  - 辅助锚：`benchmarks/last-results.json`（bench-0003，2/2，evidence_grade MEASURED/NOT_CONFIGURED 诚实分档）；`corpus/master/rechecks/RCHK-1-grn4503-replay.json` + `rechecks/tools/replay_grn4503_rchk1.py`（gate 可重放：悬空 49→39，重跑 verdict 仍 failed 如实登记）。

### G4 Tracer bullet 真实闭环

- 聚合源：
  - `benchmarks/phaseD-demo-report.md`（seq demo-D-0001）：单 fixture 八拍 8/8 全实跑；含真实篡改→`reconcile` RECONCILE_DIRTY exit 1 三段命中→D24 DIGEST_WARNING 抓获（§1 步骤 14–16）。
  - `benchmarks/theme-demos-report.md`（seq DEMO-THEME-0001）：三主题（change governance / API contract / data grid）各一条真实 change 八拍 8/8 全环；对象形状只读取材 `corpus/master/batch-1/truth/objects/`。
- 诚实分账（§B 必须双面陈述）：闭环载体 = **临时目录 fixture**（两报告纪律声明自证：靶子为 `%TEMP%` 副本/自建项目，`MASTer_master` 绝对只读）；**MASTer_master 真实治理任务 in-vivo 走 vNext 八拍全链 = 无档案**（五批 gate runs 是真实数据的 gate 判卷，非八拍闭环；RCHK-1 修复走源侧 fix agent + vNext 侧重放，非 CLI 八拍）。子项「真实变更……全链且档案齐备」按 fixture 档案判满足、按真实靶档案判缺失，两行并列，判定权归 Owner。

### G5 Portability 底线（D7）

- 聚合源：
  - `docs/fresh-clone-repro-report.md`（seq CLONE-0001）：`git clone --no-local` 至临时目录；catalog 侧 60/60 content_sha256 对账 0 mismatch、verdict REPRODUCED、物化双跑 byte-stable、`git status` 空；node 侧 frozen-lockfile 安装 + vitest 588 全绿 + doctor 四态行为如实。
  - 诚实边界（该报告自认，照录）：①报告锚定 HEAD `512ff0c`（八拍载体 commit），**现行 HEAD 未复验**；②catalog-lock 仍为 `catalog-lock.draft.json` / `catalog_version=0.1.0-pilot`（v1 未定版；条目数已由报告时点 60 演进至 94，SPEC-D commit `f50ba84`），报告只实测「fresh clone 可复现」后半句。
  - 子项「`rm -rf .pomaster/runtime` 可重建」：无专项档案；结构性依据 = `docs/trellis-gap-audit.md` T14/H7/H14 行（state 住 repo、runtime/ gitignore、clone+bootstrap≈认知恢复）+ phaseD init 幂等/compact 零写入实证。如实标「无专项演练档案」→ §C 开放项。
  - 旧命令映射：`pomaster portability bootstrap` → vNext 语义链 clone→install→init→doctor（H7 REJECT / H14 ADOPT 行为锚），对照口径 §0.3。

### G6 记忆主权移交完成

- 聚合源：**全部三子项无档案**。汇编器执行存在性检查并如实记 0：
  - corpus 域无 harvest 产物（`corpus/**` 无 harvest/记忆台账文件——grep 实证，汇编器以目录枚举复证）；
  - harness auto-memory 降级 cache 模式：无决议/无配置档案；
  - MEMORY_DRIFT 审计：无档案。
- 设计侧锚（方案存在 ≠ 执行存在，照录区分）：design-thread-B §4（四桶+inbox 管线方案）、`docs/trellis-gap-audit.md` H10 REJECT 行（「历史记忆走显式 harvest inbox 管线（thread-B §4，半自动、人审分类）」）。
- 现状预期：G6 = 不满足（0/38 reviewed）。诚实入包，不粉饰。

### G7 双轨损耗在预算内

- 聚合源：**无档案**。DP-2（双轨预算上限，倾向里程碑+配额双保险）在语料中无记账物；「双记账任务数 / 双维护文档数」无实测值。禁与裁决 5 的 triage 校准 20 任务配额混用（§0.3）。现状预期：G7 = 无法评估（无实测值可对照）→ §C。

### G8 回滚预案演练过

- 聚合源：
  - **迁移线回滚已真实执行过一次**（不是空跑，是实跑）：`corpus/master/cutover/owner-adjudications.md` 裁决 1（Owner 否决删除）→ 按 `corpus/master/cutover/TOMBSTONE-RUNBOOK.md` §3「否决迁移线（一键回滚）」两命令实际执行——`git branch -D migration/mig-b1-b2-tombstone`（删除时点分支头 `0a575b7`，58 文件/+870 行）+ 卸载 `.git/hooks/pre-commit`；master 全程停在 `4c40a11` 未动。对照 G8 原文「恢复 runbook 实际空跑过一次」：本次为**真跑**且达标（回滚后源仓回到施工前原状）。
  - 诚实边界：G8 原文的「归档 tag」指 M7 `.trellis` 归档——**M7 未启动，归档 tag + runbook 不存在**（未到时点，如实注记，非缺陷）。tombstone 被否决的后果如实入 §C：58 件源文件无 FROZEN 头，源侧防篡改降级为 vNext 侧 D24 digest 对账（失配警告不阻断，裁决 1 效果段原文）。

### G9 Consumer-local 护栏共存决议生效

- 聚合源：
  - **书面化决议：无档案**（`corpus/master/{cutover,views}/**`、`docs/**` 无 ESLint/suppressions 去留决定文件——grep 实证，汇编器以枚举复证）。§5.3 表格是设计提案非决议，照录区分。
  - 护栏现状事实锚（可聚合）：`corpus/master/rechecks/RCHK-1-owner-handoff.md` §2.2 V1–V6 表——消费方 ESLint `--max-warnings=0` PASS、`validate-governance-factsources.js` PASS（护栏在岗且绿）；`corpus/master/batch-1/gate-runs/grid/GTR-MIG-B1-grid-01-forbidden-direct-import.json`（vNext 侧同域 gate 判卷在场）。
- 现状预期：G9 = 不满足（去留决定未书面化）→ §C，Owner 位。

---

## §3 汇编工具契约（build_m6_evidence.py）

形态：单文件 Python 脚本（标准库 only，先例 = `corpus/master/tools/build_human_views.py` + `corpus/master/rechecks/tools/replay_grn4503_rchk1.py`），落 `m6-evidence/tools/`。

### §3.1 IO 与读域

- 读域（全只读）：`corpus/master/{batch-1..5}/**`、`corpus/master/{views,cutover,rechecks}/**`、`corpus/master/tools/build_human_views.py`（仅作先例，不消费）、`docs/*.md`（trellis-gap-audit / fresh-clone-repro-report / eight-beat-carriers-design 等）、`benchmarks/*.json|*.md`、`packages/cli/src/`（枚举）、`tests/ratchet/floor.json`、`catalog/catalog-lock.draft.json`、git 元数据（`git rev-parse HEAD`、`git log --oneline`）。
- **零读取 `D:/Vscode Documents/MASTer_master`**（铁律 1：含未提交工作树，状态只能经 `rechecks/` 存档件转述挂锚——保证确定性，工作树是易变的）。
- 写域：仅 `m6-evidence/**`。仓库其余路径零改动（铁律 7）。测试计数实测命令允许跑 `./node_modules/.bin/vitest run`（只读语义），实测值入 manifest 并与 `tests/ratchet/floor.json` `minTests`（当前 722）并列照录——**只并列，不设断言**（floor 语义归棘轮所有）。

### §3.2 机器字段纪律（铁律 4）

- 禁墙钟：产出件零日期/时间戳字段；运行身份 = seq 锚 `M6-EVID-0001`（每次重汇编递增尾号，单调不回退）+ 消费 HEAD sha + `inputs_fingerprint`。日期仅允许作为**引用原文的散文**出现在照录块内（如裁决台账引文）。
- 确定性序列化：JSON `sort_keys=True, indent=2, ensure_ascii=False, '\n' 结尾, UTF-8 无 BOM`；MD 由 manifest 单源渲染（同一 manifest 必然渲染出同一 PACK.md）；排序全显式（文件路径、判据号、OPEN 编号）。
- byte-stable：同输入双跑逐字节全等。
- staged write：`.tmp` + `os.replace`，失败不落半写。
- 零写入短路：同 inputs_fingerprint 且现盘产物 sha256 全吻合 → 不写盘。

### §3.3 fail-closed 恒等式（违反即拒绝产出，exit 非 0）

1. 五批 gate-run 递归计数 == 40，且重算 verdict 分布 == `views/build-manifest.json` `.gate_runs`（若 views 先行重建导致口径变化，以原始 gate-run 文件为真，差异如实登记后仍须相等才放行）。
2. 五批 `assets[]` 行合计 == 逐批枚举和；每行 `migration_batch` 非空率如实输出（允许 <100%，但 hole 行必须逐条进 §C，禁止静默）。
3. PACK.md 中每个数字在 manifest 有同值字段；§B/§C 每条判据/开放项 >= 1 个可解析 `[SRC: …]` 锚，解析率 100%。
4. `inputs_fingerprint` == consumed 文件集逐件 sha256 的聚合重算值。
5. 铁律 3 指名五项（tombstone 被否决 / 39 悬空 / catalog v1 未定版 / 20 任务检查点未满 / GRN-4402 转治理侧）在 §C 的在场性检查——缺任一项拒绝产出。

### §3.4 --check 模式（确定性可重产证明）

`python corpus/master/cutover/m6-evidence/tools/build_m6_evidence.py --check`：

1. 临时目录编译两次 → 双跑 byte-stable 证明；
2. 不变式自检（§3.3 全量）；
3. 现盘产物 drift 比对（现盘 vs 重产，含 PACK.md 与 pack-manifest.json）；
4. 全绿 exit 0；任何 drift/违例 exit 非 0 并逐条报差异。

### §3.5 citation 文法

沿用 views 四形态 + repo 平面形态，闭世界校验：

1. truth 对象：`MIG-B1/truth/objects/<kind>/<id>.json#<OBJECT_ID>`
2. gate-run：`MIG-B1/gate-runs/<domain>/<file>.json@<GRN>`
3. 登记/台账文件键路径：`cutover/owner-adjudications.md#裁决2`
4. 渲染产物节：`views/build-manifest.json#.gate_runs`
5. repo 平面（本包新增合法形态）：`docs/<file>.md#<节标题>` 或 `<path>:<line>`（行号在卷头声明 HEAD 锚定，重验以节标题优先）

### §3.6 状态词表（§B 第④栏唯一合法取值）

`满足` / `部分满足` / `不满足` / `无法评估（无档案）` ——每个状态必须由③栏子项不等式/存在性检查的机械结果唯一决定；manifest 中以 `satisfied / partial / unsatisfied / not_evaluable` 四值机读字段同录。**禁止出现第五种状态，禁止状态栏携带推荐语。**

---

## §4 改动面与禁区（铁律 6/7 复述钉死）

- 允许：新增 `corpus/master/cutover/m6-evidence/**`（PACK.md、pack-manifest.json、README.md、tools/build_m6_evidence.py）。
- 禁止：corpus 快照（batch-1..5 truth/ledger/gate-runs/inventory）、`packages/`、`tests/`、`catalog/`、`benchmarks/`、`views/`、既有 `cutover/` 三文件——零改动（汇编器发现自身即将写这些路径 = 违例即停）。
- 禁止：git commit / push / merge / 切分支（main 上工作；证据包不入库由 Owner 决定提交时机）。
- 禁止：读写 `D:/Vscode Documents/MASTer_master`（RCHK-1 已知工作树改动按 `rechecks/` 存档现状如实转述，不评判不催促）。

---

## §5 契约定稿时点现状基线快照（汇编时全部重测；此处数值为契约可回对的定稿依据）

盘点时点：POMaster_VNext HEAD `009dd75bf1bc47c5fdd4440e81879fe97fe5a54d`（feat(views+eval): P9）。

| 事实 | 值 | 锚 |
|---|---|---|
| 测试棘轮 floor | minTests = 722 | `tests/ratchet/floor.json` |
| gate-run 文件总数 | 40（五批 13 个域目录） | `corpus/master/*/gate-runs/**` 递归枚举 |
| gate 四态分布 | passed 18 / failed 13 / not_configured 1 / skipped_blindspot 8 | `corpus/master/views/build-manifest.json` `.gate_runs` |
| truth 对象总数 | 1983（consumed 文件 2043） | 同上 `.inputs_counts` |
| 五批资产行 | B1=10 / B2=48 / B3=10 / B4=10 / B5=11 | 各批 `inventory.yaml` `.assets` |
| 五批文件数 | B1=333 / B2=187 / B3=1099 / B4=320 / B5=173 | `corpus/master/<batch>/**` 递归枚举 |
| catalog | entries=94，`catalog_version=0.1.0-pilot`（draft，v1 未定版） | `catalog/catalog-lock.draft.json` |
| 四视图 | 4 md + build-manifest；citations_unresolved 逐视图 = 0；inputs_fingerprint `9fcb3fec…` | `corpus/master/views/build-manifest.json` `.views` |
| 自托管 bench | bench-0003 seq=3 ok=true 2/2 | `benchmarks/last-results.json` |
| 校准批准 | bench-0002 APPROVED_PROVISIONAL（20 任务强制复审 provision）；bench-0003 T-1 APPROVED | `benchmarks/calibration-approval.json` / `benchmarks/calibration-t1-approval.json` |
| fresh-clone | catalog REPRODUCED（60/60）+ vitest 588 绿，锚定 HEAD `512ff0c` | `docs/fresh-clone-repro-report.md` |
| Owner 裁决 | 五条（tombstone 否决删除 / T-1 批准 / batch4 派生改写追认 / 源仓业务修复授权 / 20 任务复审协议） | `corpus/master/cutover/owner-adjudications.md` |
| RCHK-1 重放 | GRN-4503 悬空 49→39（残留 39 待 FIX-3）；FIX-2 8/8 fixed；C-01 25 对；4 文件源 pin 失配 | `corpus/master/rechecks/RCHK-1-owner-handoff.md` |
| explicit_absence | 3 条（B4/B5 无 authority.json；calibration 仅 B1） | `views/build-manifest.json` `.explicit_absence` |
| G6/G7/G9 档案 | 0（harvest / DP-2 记账 / 护栏书面化决议均无） | 目录枚举 + grep 实证（汇编器复证） |

---

## §6 契约验收（本契约自身的完成判据）

1. `--check` 全绿（§3.4 四步）。
2. PACK.md 六节齐全、节序符合 §1；G1–G9 每条六栏齐全；状态词全部 ∈ §3.6 词表。
3. §C 含铁律 3 指名五项 + §2 各判据「现状预期」中预告的全部开放项（预告项缺失 = 汇编器诚实性违例）。
4. §D 无任何 go/no-go 倾向语（机检：禁词表 `应当切换/建议切换/不建议/可以切换/已具备接管条件` 等出现在 §D 即违例）。
5. 改动面核验：`git status --short` 相对汇编前仅新增 `corpus/master/cutover/m6-evidence/**` 条目。
