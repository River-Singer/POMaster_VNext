# M6 Go/No-Go 证据包（机器汇编）

> 本文件由 corpus/master/cutover/m6-evidence/tools/build_m6_evidence.py 从实存事实源聚合编译（PACK-CONTRACT §1 契约钉死节序）；禁手工编辑（编辑无效，重建即覆盖）。

## 卷头

- seq 锚：`M6-EVID-0001`（每次重汇编单调递增；禁墙钟——产出件零日期字段，日期仅在照录引文内作为原文散文出现且逐个在 consumed 语料在场）
- 消费 HEAD sha（汇编时 `git rev-parse HEAD` 实测）：`009dd75bf1bc47c5fdd4440e81879fe97fe5a54d`
- inputs_fingerprint（consumed 文件集逐件 sha256 聚合，算法同 views/build-manifest.json 先例）：`c1f75eeafb5322ea07f2abe05290a107b81aa409bd239ed66e6af474b8cc2d27`
- 判据源（唯一权威）：design-thread-B-migration.md §5.1（G1–G9 表）+ §1.7（M6 阶段行）；本包以 PACK-CONTRACT §0.2 逐字照录表为判据原文载体（汇编期已人工核对§0.2 与上游 §5.1 逐字一致）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#G1–G9 判据原文]
- 再产命令：`python corpus/master/cutover/m6-evidence/tools/build_m6_evidence.py --check`（双跑 byte-stable + 不变式自检 + 现盘 drift 比对）
- MASTer_master 边界：本包零读取 `D:/Vscode Documents/MASTer_master`（含未提交工作树）；MASTer 现状一律经 rechecks/ 存档件转述挂锚，不评判不催促。[SRC: rechecks/RCHK-1-owner-handoff.md#按消费项目纪律]

## §A 执行摘要

机器事实聚合（唯一数据源=pack-manifest.json；无判断性形容词；状态词为机械核对结果而非 go/no-go）：

| 事实 | 实测值 | 谱系 |
|---|---|---|
| 五批 truth 对象 | B1 290 / B2 161 / B3 1068 / B4 307 / B5 157（合计 1983） | [SRC: views/build-manifest.json#inputs_counts.truth_objects] |
| 五批文件数（递归枚举） | 333 / 187 / 1099 / 320 / 173 | pack-manifest.json .facts.batches（目录枚举实测） |
| 五批资产行 | 10 / 48 / 10 / 10 / 11（合计 89；migration_batch 非空 89） | [SRC: MIG-B2/inventory.yaml#assets]（代表锚） |
| gate 四态 | passed 18 / failed 13 / not_configured 1 / skipped_blindspot 8（共 40） | [SRC: views/build-manifest.json#gate_runs.verdicts] |
| 测试棘轮（只并列不设断言） | floor minTests=722 vs 实测 passed 721 + skipped 1 = 722（39 files） | [SRC: tests/ratchet/floor.json#minTests] |
| fresh-clone 结论 | catalog 60/60 对账 0 mismatch，verdict REPRODUCED；vitest 588 绿（锚定 HEAD 512ff0c） | [SRC: docs/fresh-clone-repro-report.md#结论速览] |
| catalog 现状 | catalog_version=0.1.0-pilot（draft，v1 未定版）/ entries 94 | [SRC: catalog/catalog-lock.draft.json#entries] |
| 机制级覆盖 | 69 = ADOPT 32 + REJECT 37 + GAP 0 | [SRC: docs/trellis-gap-audit.md:22] |
| explicit_absence | 3 条 | [SRC: views/build-manifest.json#explicit_absence] |
| G1–G9 状态分布 | 满足 2 / 部分满足 4 / 不满足 2 / 无法评估 1 | §B 逐条机械核对（非 go/no-go） |
| 开放项 | 16 条（OPEN-M6-01…OPEN-M6-16） | §C |

五裁决标题行（逐字照录台账）：
- 裁决 1：tombstone 分支 — 否决删除（2026-08-29） [SRC: cutover/owner-adjudications.md#裁决1]
- 裁决 2：校准二轮 T-1 — 批准（2026-08-29） [SRC: cutover/owner-adjudications.md#裁决2]
- 裁决 3：batch4 gate-runs 派生改写 — 追认（2026-08-29） [SRC: cutover/owner-adjudications.md#裁决3]
- 裁决 4：源仓业务事实 — 授权修复（2026-08-29） [SRC: cutover/owner-adjudications.md#裁决4]
- 裁决 5（既有协议确认）：20 真实任务强制复审 [SRC: cutover/owner-adjudications.md#裁决5]

## §B G1–G9 逐条判据对照

每条判据固定六栏：①判据原文（逐字）②对照事实（挂锚）③判据子项逐条核对（判定式照抄原文不等式/口径）④状态⑤差异与开放项指针⑥对照口径。状态词是③栏机械核对结果（满足/部分满足/不满足/无法评估（无档案）四值，禁止第五种状态），不是 go/no-go。状态判定规则钉死：全部子项成立→满足；成立与不成立并存→部分满足；全部不成立→不满足；无实测值→无法评估（无档案）。

### G1 功能覆盖矩阵闭合 —— 状态：部分满足（partial）

- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：
  > 判据：功能覆盖矩阵闭合
  > 可机判方式：高频操作清单（init/inspect/maintain/pre-dev 链/gate/context 注入/task lifecycle/write-gate）逐一标注 vNext 对应物 or 显式 declared-not-needed 决议编号；矩阵零空洞
  > 来源依据：checkbox：不许凭感觉宣称等效
  [SRC: cutover/m6-evidence/PACK-CONTRACT.md#G1 | 功能覆盖矩阵闭合 |]
- ②对照事实：机制级对照实测：69 项 = MECHANISM_ADOPT 32 + MECHANISM_REJECT 37 + GAP 0（REJECT 行自带理由/触发条件 = 判据认可的 declared-not-needed 形态）。[SRC: docs/trellis-gap-audit.md:22]
  vNext 命令面文件存在性实测：13/13 在场（init、triage、compact、permit、context、exec-guard、check、record、reconcile、status、doctor、digest、evidence）。[SRC: packages/cli/src/init.ts:1]（代表锚；13 文件逐件存在性由汇编器断言）
  八操作行矩阵（每行只允许【显式对应物锚】或【显式 REJECT 行锚】；两者皆无 = hole）：
  操作「init」→ 对应物：`pomaster init`（幂等 CREATED/NO_CHANGE、clobber 免疫、禁墙钟）。[SRC: docs/trellis-gap-audit.md:55] + [SRC: packages/cli/src/init.ts:1] + [SRC: benchmarks/phaseD-demo-report.md:25]
  操作「inspect」→ hole——读域内无「inspect↔vNext 对应物」逐字点名锚（机器检索零命中）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#预计产生 hole 行]
  操作「maintain」→ hole——读域内无「maintain↔vNext 对应物」逐字点名锚（机器检索零命中；语料内 maintain 词形均为业务页面名 MAINTAIN_BASE_ATTRIBUTES，非操作映射）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#预计产生 hole 行]
  操作「pre-dev 链」→ hole——读域内无「pre-dev 链↔vNext 对应物」逐字点名锚（机器检索零命中）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#预计产生 hole 行]
  操作「gate」→ 对应物：`check`（判卷读）+ `record gate-run`（证据入账）。[SRC: benchmarks/phaseD-demo-report.md:55] + [SRC: packages/cli/src/check.ts:1] + [SRC: packages/cli/src/record.ts:1]
  操作「context 注入」→ 对应物：`context compile`（八拍③ PROJECTION 最小充分投影）。[SRC: docs/trellis-gap-audit.md:98] + [SRC: packages/cli/src/context.ts:1] + [SRC: benchmarks/phaseD-demo-report.md:53]
  操作「task lifecycle」→ 对应物：FROZEN LIFECYCLE_TRANSITIONS 转移引擎（非法迁移 FATAL）。[SRC: docs/trellis-gap-audit.md:75]
  操作「write-gate」→ 对应物：Permit 五原语 + `exec-guard` 写路径执行点（allowed/denied fail-closed）。[SRC: docs/trellis-gap-audit.md:49] + [SRC: packages/cli/src/exec-guard.ts:1] + [SRC: benchmarks/phaseD-demo-report.md:54]
- ③判据子项逐条核对：
  - 判定式「机制级 69 = ADOPT 32 + REJECT 37 + GAP 0」｜实测：32/37/0（合计 69）｜结果：成立
  - 判定式「矩阵零空洞（holes == 0）」｜实测：holes = 3（inspect、maintain、pre-dev 链）｜结果：不成立
- ④状态：部分满足（机读字段 partial）
- ⑤差异与开放项指针：OPEN-M6-01
- ⑥对照口径：无（判据原文与语料 schema 字段一致，无需对照口径）

### G2 数据完整性无静默缺口 —— 状态：满足（satisfied）

- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：
  > 判据：数据完整性无静默缺口
  > 可机判方式：inventory 全表中 `disposition != archived-with-pointer || migrated` 的行为零；分母仍可计算
  > 来源依据：GAP-POM-001 教训
  [SRC: cutover/m6-evidence/PACK-CONTRACT.md#G2 | 数据完整性无静默缺口 |]
- ②对照事实：五批资产行实测：B1 10 / B2 48 / B3 10 / B4 10 / B5 11（合计 89；migration_batch 非空 89/89，hole 0 条）。[SRC: MIG-B2/inventory.yaml#assets]（代表锚；五批逐批由汇编器解析断言）
  分母可计算性实测：五批 denominators 共 44 条，value+method+(source|sources) 齐备 44 条（sources 映射变体 1 条（composition_entries——source 信息以 sources 映射在场，非缺失）；不齐备 0 条。[SRC: MIG-B2/inventory.yaml#denominators]（代表锚）
  views 分母照录：application_pages 39 / capability_fdp 109 / published_openapi_operationids 190 / readiness DRAFT 33 + BLOCKED 6 + READY 0 / task_corpus_dirs 53。[SRC: views/build-manifest.json#denominators]
  explicit_absence 照录 3 条：MIG-B4/authority.json；MIG-B5/authority.json；calibration/ (MIG-B2, MIG-B3, MIG-B4, MIG-B5)。[SRC: views/build-manifest.json#explicit_absence]
  数据面已知残差（如实入 §C）：GRN-4503 悬空 49→39（10 条已消解、新增 0；残留 39 条全部 page_absent_from_state_enum，FIX-3 未实施，现时点重跑 gate verdict 仍为 failed）；C-01 漂移对 25 对（分隔符 15 + 组词 10）；OPEN-5 六页无机器边界 6 页；4 文件源侧 sha pin 失配（D24 警告不阻断）。[SRC: rechecks/RCHK-1-owner-handoff.md#GRN-4503 悬空 49 → 39] + [SRC: rechecks/RCHK-1-grn4503-replay.json#after_fix_replay.dangling] + [SRC: rechecks/RCHK-1-owner-handoff.md#25 对 C-01]
  FIX-2 对账：8 条悬空端点 fixed 8 / open 0。[SRC: rechecks/RCHK-1-owner-handoff.md#FIX-2 效果对账]
- ③判据子项逐条核对：
  - 判定式「原文判定式：inventory 全表中 disposition != archived-with-pointer || migrated 的行为零（§0.3 对照口径：现行载体字段为 migration_batch 非空；hole 逐条列名）」｜实测：migration_batch 非空 89/89，hole 0 条｜结果：成立
  - 判定式「分母仍可计算（value+method+(source|sources) 齐备）」｜实测：44/44｜结果：成立
  - 判定式「恒等式 I2：五批 assets 行合计 == 逐批枚举和」｜实测：89 == 10+48+10+10+11｜结果：成立
- ④状态：满足（机读字段 satisfied）
- ⑤差异与开放项指针：OPEN-M6-02；OPEN-M6-03；OPEN-M6-04；OPEN-M6-05
- ⑥对照口径：契约 §0.3 G2 口径：现行 inventory.yaml 无 disposition 字段，去向载体字段为 assets[].migration_batch；机判口径 = 每条 asset 具备非空 migration_batch 即通过，空缺行逐条列 hole。允许非空率 <100%，但 hole 必须逐条进 §C（本批 0 hole）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#G2**：现行]

### G3 Gate 可信度自指验收 —— 状态：满足（satisfied）

- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：
  > 判据：Gate 可信度自指验收
  > 可机判方式：台账含 `failed>=1`、`skipped-due-to-blindspot>=1`、`passed>=若干`；从未报 failed 的 gate 视为可疑
  > 来源依据：「报绿的工具比没有工具危险」
  [SRC: cutover/m6-evidence/PACK-CONTRACT.md#G3 | Gate 可信度自指验收 |]
- ②对照事实：递归重算实测：gate-run 共 40 件，verdict 分布 passed 18 / failed 13 / not_configured 1 / skipped_blindspot 8（汇编器从 40 件原始 gate run 逐件重算，并与 views manifest 交叉核对相等——恒等式 I1）。[SRC: views/build-manifest.json#gate_runs.verdicts] + [SRC: MIG-B1/gate-runs/change-governance/GTR-MIG-B1-aggregate.json@GRN-405]（代表锚）
  从未报 failed 的 gate 族（按目录族 verdict 分布如实列名；可疑性结论留给 Owner）：MIG-B2/blueprint（4 件，verdicts {'skipped_blindspot': 2, 'passed': 2}）；MIG-B3/calculation（3 件，verdicts {'skipped_blindspot': 2, 'passed': 1}）；MIG-B4/baseline（5 件，verdicts {'passed': 5}）；MIG-B5/blueprint-linkage（4 件，verdicts {'passed': 4}）。族代表锚 [SRC: MIG-B2/gate-runs/blueprint/AGG-MIG-B2-blueprint.json@GRN-4304] + [SRC: MIG-B3/gate-runs/calculation/AGG-MIG-B3-calculation.json@GRN-4403] + [SRC: MIG-B4/gate-runs/baseline/AGG-MIG-B4-baseline.json@GRN-4605] + [SRC: MIG-B5/gate-runs/blueprint-linkage/AGG-MIG-B5-blueprint-linkage.json@GRN-4704]
  自托管 bench 辅助锚：bench-0003 seq=3 ok=true 2/2（evidence_grade MEASURED/NOT_CONFIGURED 诚实分档）。[SRC: benchmarks/last-results.json#summary]
  gate 可重放辅助锚：RCHK-1 重放 GRN-4503（悬空 49→39，重跑 verdict 仍为 failed，如实登记）。[SRC: rechecks/RCHK-1-grn4503-replay.json#after_fix_replay.verdict_if_rerun_now] + [SRC: rechecks/RCHK-1-owner-handoff.md#重放结论]
  校准批准辅助锚：bench-0002 APPROVED_PROVISIONAL（20 任务强制复审 provision）；bench-0003 T-1 APPROVED。[SRC: benchmarks/calibration-approval.json#decision] + [SRC: benchmarks/calibration-t1-approval.json#decision]
- ③判据子项逐条核对：
  - 判定式「台账含 failed>=1」｜实测：failed = 13｜结果：成立
  - 判定式「台账含 skipped-due-to-blindspot>=1」｜实测：skipped_blindspot = 8｜结果：成立
  - 判定式「台账含 passed>=若干（契约 §2 G3 口径钉死：>=1）」｜实测：passed = 18｜结果：成立
  - 判定式「恒等式 I1：递归重算 verdict 分布 == views/build-manifest.json .gate_runs」｜实测：重算 == views 同值（total 40）｜结果：成立
- ④状态：满足（机读字段 satisfied）
- ⑤差异与开放项指针：无（本判据无开放项）
- ⑥对照口径：无（判据原文与语料 schema 字段一致，无需对照口径）

### G4 Tracer bullet 真实闭环 —— 状态：部分满足（partial）

- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：
  > 判据：Tracer bullet 真实闭环
  > 可机判方式：≥1 个真实变更完成 triage→maintain→change→implement→gate→reconcile→compact 全链且档案齐备
  > 来源依据：PRD §68 P0 成功标准
  [SRC: cutover/m6-evidence/PACK-CONTRACT.md#G4 | Tracer bullet 真实闭环 |]
- ②对照事实：fixture 闭环档案（载体一）：benchmarks/phaseD-demo-report.md（seq demo-D-0001）单 fixture 八拍 8/8 全实跑，含真实篡改→`reconcile` RECONCILE_DIRTY exit 1 三段命中（§1 步骤 14–16）→D24 DIGEST_WARNING 抓获。[SRC: benchmarks/phaseD-demo-report.md#2. 八拍对照表] + [SRC: benchmarks/phaseD-demo-report.md:38] + [SRC: benchmarks/phaseD-demo-report.md:39] + [SRC: benchmarks/phaseD-demo-report.md:40]
  fixture 闭环档案（载体二）：benchmarks/theme-demos-report.md（seq DEMO-THEME-0001）三主题（change governance / API contract / data grid）各一条真实 change 八拍 8/8 全环；对象形状只读取材 MIG-B1 truth/objects。[SRC: benchmarks/theme-demos-report.md#2. 八拍对照表（3 主题 × 8 拍全实跑）]
  诚实分账（载体定性，两报告纪律声明自证）：闭环靶子 = 临时目录 fixture 副本/自建项目，MASTer_master 绝对只读。[SRC: benchmarks/phaseD-demo-report.md#纪律声明] + [SRC: benchmarks/theme-demos-report.md:9]
  in-vivo 面（双面陈述第二行）：MASTer_master 真实治理任务走 vNext 八拍全链 = 无档案（五批 gate runs 是真实数据的 gate 判卷，非八拍闭环；RCHK-1 修复走源侧 fix agent + vNext 侧重放，非 CLI 八拍）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#MASTer_master 真实治理任务 in-vivo] + [SRC: rechecks/RCHK-1-owner-handoff.md#2.3 vNext 侧边界]
  八拍语义对照口径：八拍现行为 triage→permit→context→exec-guard→check→record→reconcile→compact；原文 maintain/implement/change 语义由 permit/exec-guard/record 承担。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#G4**：八拍现行为]
- ③判据子项逐条核对：
  - 判定式「≥1 个真实变更完成 triage→maintain→change→implement→gate→reconcile→compact 全链且档案齐备——按 fixture 档案判（八拍对照口径 §0.3）」｜实测：2 份档案在场（demo-D-0001 八拍 8/8；DEMO-THEME-0001 三主题八拍 8/8）｜结果：成立
  - 判定式「≥1 个真实变更完成 triage→maintain→change→implement→gate→reconcile→compact 全链且档案齐备——按真实靶（MASTer in-vivo）档案判」｜实测：无档案（缺席检查 in_vivo_eight_beat_archives = 0）｜结果：不成立
- ④状态：部分满足（机读字段 partial）
- ⑤差异与开放项指针：OPEN-M6-15
- ⑥对照口径：契约 §0.3 G4 口径：八拍现行为 triage→permit→context→exec-guard→check→record→reconcile→compact；原文 maintain/implement/change 语义由 permit/exec-guard/record 承担，对照表逐拍给锚（见②栏载体一/二）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#G4**：八拍现行为]

### G5 Portability 底线（D7） —— 状态：部分满足（partial）

- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：
  > 判据：Portability 底线（D7）
  > 可机判方式：干净机器 fresh clone → bootstrap → doctor 全 PASS；`rm -rf .pomaster/runtime` 可重建
  > 来源依据：§85 MEMORY_PORTABILITY_GATE
  [SRC: cutover/m6-evidence/PACK-CONTRACT.md#G5 | Portability 底线（D7） |]
- ②对照事实：fresh clone 实测（docs/fresh-clone-repro-report.md，seq CLONE-0001）：`git clone --no-local` 至临时目录；catalog 侧 60/60 content_sha256 对账 0 mismatch、verdict REPRODUCED、物化双跑 byte-stable、`git status` 空；node 侧 frozen-lockfile 安装 + vitest 588 全绿 + doctor 四态行为如实。[SRC: docs/fresh-clone-repro-report.md#结论速览] + [SRC: docs/fresh-clone-repro-report.md#REPRODUCED] + [SRC: docs/fresh-clone-repro-report.md:102]
  诚实边界（报告自认，照录）：报告锚定 HEAD 512ff0c（八拍载体 commit），现行 HEAD 009dd75 未复验；catalog-lock 仍为 catalog-lock.draft.json / catalog_version=0.1.0-pilot（v1 未定版；条目数已由报告时点 60 演进至 94）。[SRC: docs/fresh-clone-repro-report.md:5] + [SRC: catalog/catalog-lock.draft.json#catalog_version]
  子项「`rm -rf .pomaster/runtime` 可重建」：无专项演练档案（缺席检查如实记 0）；结构性依据 = T14（state 住 repo、runtime/ gitignore）+ H7（卸载语义=删目录+git 历史保留，clone+bootstrap≈认知恢复）+ H14（fresh clone→bootstrap→agent 入口为 P0 最小闭环）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#无专项演练档案] + [SRC: docs/trellis-gap-audit.md:46] + [SRC: docs/trellis-gap-audit.md:61] + [SRC: docs/trellis-gap-audit.md:68]
  旧命令映射口径：`pomaster portability bootstrap` 在 vNext 无同名物；对应语义链 = clone→install→init→doctor。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#G5**：旧包命令]
- ③判据子项逐条核对：
  - 判定式「干净机器 fresh clone → bootstrap（§0.3 语义链 clone→install→init→doctor）→ doctor 全 PASS」｜实测：catalog REPRODUCED 60/60 + vitest 588 绿 + doctor 四态如实（锚定 HEAD 512ff0c；现行 HEAD 未复验）｜结果：成立
  - 判定式「`rm -rf .pomaster/runtime` 可重建」｜实测：无专项演练档案（结构性依据在场）｜结果：不成立
- ④状态：部分满足（机读字段 partial）
- ⑤差异与开放项指针：OPEN-M6-06；OPEN-M6-07；OPEN-M6-08
- ⑥对照口径：契约 §0.3 G5 口径：旧包命令 `pomaster portability bootstrap` 在 vNext 无同名物；对应语义 = clone→install→init→doctor（H7 REJECT / H14 ADOPT 行为锚）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#G5**：旧包命令]

### G6 记忆主权移交完成 —— 状态：不满足（unsatisfied）

- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：
  > 判据：记忆主权移交完成
  > 可机判方式：Claude 记忆 38 条 harvest 台账 100% reviewed；harness auto-memory 降级为 cache 模式；MEMORY_DRIFT 审计通过
  > 来源依据：§84
  [SRC: cutover/m6-evidence/PACK-CONTRACT.md#G6 | 记忆主权移交完成 |]
- ②对照事实：子项 1 harvest 台账：corpus 域 harvest/记忆台账产物 = 0 件（缺席检查枚举复证）→「38 条 100% reviewed」无载体，reviewed 实测 0。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#全部三子项无档案]
  子项 2 harness auto-memory 降级 cache 模式：无决议/无配置档案（缺席检查记 0）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#全部三子项无档案]
  子项 3 MEMORY_DRIFT 审计：无档案（缺席检查记 0 份审计档案）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#全部三子项无档案]
  设计侧锚（方案存在 ≠ 执行存在，照录区分）：历史记忆走显式 harvest inbox 管线（thread-B §4，半自动、人审分类）——H10 REJECT 行在案。[SRC: docs/trellis-gap-audit.md:64]
- ③判据子项逐条核对：
  - 判定式「38 条 harvest 台账 100% reviewed」｜实测：台账 0 件 → reviewed 0｜结果：不成立
  - 判定式「harness auto-memory 降级为 cache 模式」｜实测：无决议/配置档案｜结果：不成立
  - 判定式「MEMORY_DRIFT 审计通过」｜实测：无档案｜结果：不成立
- ④状态：不满足（机读字段 unsatisfied）
- ⑤差异与开放项指针：OPEN-M6-09
- ⑥对照口径：无（判据原文与语料 schema 字段一致，无需对照口径）

### G7 双轨损耗在预算内 —— 状态：无法评估（无档案）（not_evaluable）

- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：
  > 判据：双轨损耗在预算内
  > 可机判方式：双记账任务数 / 双维护文档数的实测值未击穿 DP-2 上限
  > 来源依据：本提案新增
  [SRC: cutover/m6-evidence/PACK-CONTRACT.md#G7 | 双轨损耗在预算内 |]
- ②对照事实：DP-2 双轨预算上限：语料读域内无记账物（缺席检查「双记账任务数」关键词文件级扫描命中记账档案 0 份）；「双记账任务数 / 双维护文档数」无实测值 → 判据无法评估。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#DP-2（双轨预算上限]
  禁混用注记（§0.3 口径）：裁决 5 的「20 真实任务强制复审」是 triage 校准配额（bench-0002 provision：provisional — 20 个真实任务后强制复审），与 DP-2 双轨配额不是同一事物。[SRC: benchmarks/calibration-approval.json#provisions] + [SRC: cutover/owner-adjudications.md#裁决5] + [SRC: cutover/m6-evidence/PACK-CONTRACT.md#禁止混用]
- ③判据子项逐条核对：
  - 判定式「双记账任务数 / 双维护文档数的实测值未击穿 DP-2 上限」｜实测：实测值不存在；DP-2 上限值本身亦无档案｜结果：无实测值
- ④状态：无法评估（无档案）（机读字段 not_evaluable）
- ⑤差异与开放项指针：OPEN-M6-10
- ⑥对照口径：契约 §0.3 G7 口径：裁决 5 的「20 真实任务强制复审」是 triage 校准配额（bench-0002 provision），与 DP-2 双轨配额不是同一事物，禁止混用；DP-2 双轨记账在语料中无档案。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#禁止混用]

### G8 回滚预案演练过 —— 状态：部分满足（partial）

- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：
  > 判据：回滚预案演练过
  > 可机判方式：归档 tag + 恢复 runbook 实际空跑过一次（对照 staged-replace WinError 5 先毁后败的前科，演练是硬要求）
  > 来源依据：历史事故
  [SRC: cutover/m6-evidence/PACK-CONTRACT.md#G8 | 回滚预案演练过 |]
- ②对照事实：迁移线回滚已真实执行过一次（真跑，强于原文要求的「空跑」）：Owner 裁决 1（否决删除）→按 TOMBSTONE-RUNBOOK §3「否决迁移线（一键回滚）」两命令实际执行——`git branch -D migration/mig-b1-b2-tombstone`（删除时点分支头 0a575b7，58 文件/+870 行）+ 卸载 .git/hooks/pre-commit；master 全程停在 4c40a11 未动，回滚后源仓回到施工前原状。[SRC: cutover/owner-adjudications.md:6] + [SRC: cutover/owner-adjudications.md:9] + [SRC: cutover/TOMBSTONE-RUNBOOK.md:45]
  诚实边界：原文「归档 tag」指 M7 .trellis 归档——M7 未启动，归档 tag + runbook 不存在（git tag 实测 0 个；未到时点，如实注记，非缺陷）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#M7 未启动，归档 tag + runbook 不存在]
  tombstone 被否决的后果（如实入 §C）：58 件源文件无 FROZEN 头，源侧防篡改降级为 vNext 侧 D24 digest 对账（失配警告不阻断，裁决 1 效果段原文）。[SRC: cutover/owner-adjudications.md#裁决1]
- ③判据子项逐条核对：
  - 判定式「恢复 runbook 实际跑过一次（≥空跑）」｜实测：真跑 1 次（TOMBSTONE-RUNBOOK §3 两命令实执行，迁移线；master 停 4c40a11 未动）｜结果：成立
  - 判定式「归档 tag 存在（M7 .trellis 归档）」｜实测：git tag 实测 0 个（M7 未启动，未到时点）｜结果：不成立
- ④状态：部分满足（机读字段 partial）
- ⑤差异与开放项指针：OPEN-M6-05；OPEN-M6-14
- ⑥对照口径：无（判据原文与语料 schema 字段一致，无需对照口径）

### G9 Consumer-local 护栏共存决议生效 —— 状态：不满足（unsatisfied）

- ①判据原文（逐字照录 PACK-CONTRACT §0.2 表，即 design-thread-B §5.1）：
  > 判据：Consumer-local 护栏共存决议生效
  > 可机判方式：ESLint 规则与 suppressions 台账去留决定已书面化（见 5.3）
  > 来源依据：证据#1 的「不要急着退役」纪律
  [SRC: cutover/m6-evidence/PACK-CONTRACT.md#G9 | Consumer-local 护栏共存决议生效 |]
- ②对照事实：书面化决议：无档案（读域 corpus/{cutover,views}/** + docs/** 内 ESLint/suppressions 去留决定文件缺席检查 = 0；契约 §5.3 表格是设计提案非决议，照录区分）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#书面化决议：无档案]
  护栏现状事实（可聚合）：消费方 ESLint `--max-warnings=0` PASS、`validate-governance-factsources.js` PASS（RCHK-1 §2.2 V1–V6 表，护栏在岗且绿）。[SRC: rechecks/RCHK-1-owner-handoff.md:72] + [SRC: rechecks/RCHK-1-owner-handoff.md#2.2 MASTer 校验入口]
  vNext 侧同域 gate 判卷在场：grid forbidden-direct-import。[SRC: MIG-B1/gate-runs/grid/GTR-MIG-B1-grid-01-forbidden-direct-import.json@GRN-4101]
- ③判据子项逐条核对：
  - 判定式「ESLint 规则与 suppressions 台账去留决定已书面化」｜实测：读域内决议文件 = 0（缺席检查）｜结果：不成立
- ④状态：不满足（机读字段 unsatisfied）
- ⑤差异与开放项指针：OPEN-M6-13
- ⑥对照口径：无（判据原文与语料 schema 字段一致，无需对照口径）

## §C 开放项清单

编号 OPEN-M6-01 起递增；每条 = 现状事实 + 锚 + 归属判定位；铁律 3 指名五项全部在场。

### OPEN-M6-01 G1 八操作行矩阵 hole ×3（inspect / maintain / pre-dev 链）

- 现状事实：机制级 69 项 0 GAP 有档案，但 G1 矩阵 8 行中 3 行（inspect、maintain、pre-dev 链）在读域内无逐字点名锚（机器检索零命中；语料内 maintain 词形均为业务页面名 MAINTAIN_BASE_ATTRIBUTES，非操作映射）。契约 §2 G1 现状预期与实测一致。
- 归属判定位：Owner 位（裁 declared-not-needed 或补设计；汇编器不得替 Owner 补判）
- 谱系：[SRC: cutover/m6-evidence/PACK-CONTRACT.md#预计产生 hole 行] + [SRC: docs/trellis-gap-audit.md:22]

### OPEN-M6-02 GRN-4503 残留 39 条悬空待裁（FIX-3 未实施）

- 现状事实：悬空 49→39（10 条已消解、新增 0）；残留 39 条全部 page_absent_from_state_enum，恰为 6 个零枚举行页面；现时点重跑 gate verdict 仍为 failed（39/490），如实登记。
- 归属判定位：后续修复批次客体位（fix-plan FIX-3：39 行矩阵补行）
- 谱系：[SRC: rechecks/RCHK-1-owner-handoff.md#残留 39 条] + [SRC: rechecks/RCHK-1-grn4503-replay.json#after_fix_replay.dangling] + [SRC: rechecks/RCHK-1-grn4503-replay.json#delta.resolved_by_fix_count]

### OPEN-M6-03 C-01 词形漂移 25 对 + OPEN-5 六页无机器边界（MIG-B3/C-01 PENDING 并案）

- 现状事实：matrix/machine 集合差为 25 对 1:1 词形/分隔符漂移对（分隔符 15 + 组词 10），非真缺口；FIX-3 落地后 matrix_only 将为 25+39=64（6 页无机器边界，OPEN-5 残留）。
- 归属判定位：Owner 位（与 MIG-B3/C-01 PENDING 并案呈报）
- 谱系：[SRC: rechecks/RCHK-1-owner-handoff.md#25 对 C-01] + [SRC: rechecks/RCHK-1-grn4503-replay.json#machine_side_residual.machine_only_count] + [SRC: rechecks/RCHK-1-grn4503-replay.json#machine_side_residual.residual_note]

### OPEN-M6-04 MASTer_master 工作树 4 文件修改未提交（待 Owner 亲自提交）

- 现状事实：RCHK-1 §2.1 独立核验：工作树改动恰为 4 个声明文件（state-ownership-matrix / state-machine-registry / page-readiness-registry / application-page-registry），三笔主题化提交命令已备（RCHK-1 §5）；按消费项目纪律执行侧不代为 commit。
- 归属判定位：Owner 位（亲自执行提交；本包按铁律 1 零读取 MASTer 工作树，现状以 rechecks/ 存档件转述为准）
- 谱系：[SRC: rechecks/RCHK-1-owner-handoff.md#恰为 5 项] + [SRC: rechecks/RCHK-1-owner-handoff.md#5. 提交命令]

### OPEN-M6-05 tombstone 被否决的后果登记：58 件源文件无 FROZEN 头 + 4 文件 sha pin 失配

- 现状事实：裁决 1 否决删除后，MASTer 内 58 件已收编治理文件不带 FROZEN 头、pre-commit 守卫已卸载；源侧防篡改降级为 vNext 侧 D24 digest 对账（失配警告不阻断）；其中 4 文件现态 sha256 与收编时点 pin 失配（与 OPEN-M6-04 同源，属裁决 1 后知情事实）。
- 归属判定位：Owner 位（若将来重启写授权则重新出分支恢复冻结态）
- 谱系：[SRC: cutover/owner-adjudications.md#裁决1] + [SRC: rechecks/RCHK-1-owner-handoff.md#2.4 源侧 pin 漂移登记] + [SRC: cutover/TOMBSTONE-RUNBOOK.md#两步，各一条命令]

### OPEN-M6-06 catalog-lock v1 未定版（draft 0.1.0-pilot）

- 现状事实：现行 lock 仍为 catalog-lock.draft.json / catalog_version=0.1.0-pilot（v1 未定版）；条目数 94（fresh-clone 报告时点为 60，其后演进）；G5 判据前半句（v1 正式发布）不在既有实测范围。
- 归属判定位：治理侧登记位 / 后续批次客体位（v1 定版 + 发布）
- 谱系：[SRC: catalog/catalog-lock.draft.json#catalog_version] + [SRC: docs/fresh-clone-repro-report.md#判据前半句] + [SRC: cutover/m6-evidence/PACK-CONTRACT.md#catalog-lock 仍为]

### OPEN-M6-07 fresh-clone 复验锚定旧 HEAD 512ff0c，现行 HEAD 未复验

- 现状事实：CLONE-0001 报告锚定 HEAD 512ff0c（八拍载体 commit）；现行 HEAD 009dd75 无 fresh-clone 复验档案。
- 归属判定位：后续批次客体位（在现行 HEAD 重跑 fresh-clone 复现链）
- 谱系：[SRC: docs/fresh-clone-repro-report.md#HEAD `512ff0c]

### OPEN-M6-08 「rm -rf .pomaster/runtime 可重建」无专项演练档案

- 现状事实：G5 子项无专项档案；结构性依据在场（T14 state 住 repo / runtime gitignore、H7 卸载语义、H14 clone→bootstrap 入口、phaseD init 幂等/compact 零写入实证），但演练未做。
- 归属判定位：后续批次客体位（专项空跑一次并归档）
- 谱系：[SRC: cutover/m6-evidence/PACK-CONTRACT.md#无专项演练档案] + [SRC: docs/trellis-gap-audit.md:46]

### OPEN-M6-09 G6 记忆主权移交：harvest 台账 0/38、auto-memory cache 降级无决议、MEMORY_DRIFT 无审计

- 现状事实：三子项全无档案（缺席检查记 0）；设计侧方案在场（thread-B §4 四桶+inbox 管线、H10 REJECT 行），方案存在 ≠ 执行存在。
- 归属判定位：Owner 位 / 后续批次客体位（建 harvest 台账并逐条 review；cache 模式降级决议；MEMORY_DRIFT 审计执行）
- 谱系：[SRC: cutover/m6-evidence/PACK-CONTRACT.md#全部三子项无档案] + [SRC: docs/trellis-gap-audit.md:64]

### OPEN-M6-10 G7 DP-2 双轨预算无记账档案（无法评估）

- 现状事实：「双记账任务数 / 双维护文档数」无实测值、DP-2 上限值本身亦无档案；禁与裁决 5 的 20 任务 triage 校准配额混用（§0.3 口径）。
- 归属判定位：Owner 位（决定是否建立 DP-2 双轨记账及上限值）
- 谱系：[SRC: cutover/m6-evidence/PACK-CONTRACT.md#DP-2（双轨预算上限] + [SRC: cutover/m6-evidence/PACK-CONTRACT.md#禁止混用]

### OPEN-M6-11 20 任务 triage 校准强制复审检查点未满（协议武装，当前无需动作）

- 现状事实：bench-0002 APPROVED_PROVISIONAL provision：provisional — 20 个真实任务后强制复审；累计真实治理任务数无 20 任务计数档案，检查点未满（未触发复审）；裁决 5：到期自动呈报。
- 归属判定位：自动呈报位（累计 20 个真实治理任务后强制复审；当前无需动作）
- 谱系：[SRC: benchmarks/calibration-approval.json#provisions] + [SRC: cutover/owner-adjudications.md#裁决5]

### OPEN-M6-12 GRN-4402 公式词形联结键盲区 → 转治理侧改进登记

- 现状事实：裁决 4 第 4 项：公式引用词形漂移盲区属治理层联结键问题（external:* 展开词形 vs 源 id 拼音词形），非业务数据缺陷——不在业务修复范围，转 vNext 治理侧改进登记。
- 归属判定位：治理侧登记位（vNext 治理侧改进 backlog）
- 谱系：[SRC: cutover/owner-adjudications.md#裁决4] + [SRC: rechecks/RCHK-1-owner-handoff.md#GRN-4402 公式词形联结键盲区]

### OPEN-M6-13 G9 Consumer-local 护栏共存决议未书面化

- 现状事实：ESLint 规则与 suppressions 台账去留决定在读域内无书面化文件（缺席检查 = 0）；护栏现状在岗且绿（RCHK-1 §2.2：ESLint --max-warnings=0 PASS、validate-governance-factsources.js PASS）；「不要急着退役」纪律要求决定书面化。
- 归属判定位：Owner 位（去留决定书面化；「不要急着退役」）
- 谱系：[SRC: cutover/m6-evidence/PACK-CONTRACT.md#书面化决议：无档案] + [SRC: rechecks/RCHK-1-owner-handoff.md:72]

### OPEN-M6-14 G8 M7 归档 tag + 恢复 runbook 未建（M7 未启动，未到时点）

- 现状事实：git tag 实测 0 个；原文「归档 tag」指 M7 .trellis 归档，属未到时点（非缺陷，如实注记）；迁移线回滚 runbook 已真跑一次（见 §B G8）。
- 归属判定位：后续批次客体位（M7 启动时出归档 tag + 恢复 runbook 并演练）
- 谱系：[SRC: cutover/m6-evidence/PACK-CONTRACT.md#M7 未启动，归档 tag + runbook 不存在] + [SRC: cutover/owner-adjudications.md#裁决1]

### OPEN-M6-15 G4 真实靶（MASTer_master 治理任务）in-vivo 八拍全链档案缺失

- 现状事实：既有闭环档案载体均为临时目录 fixture（两 demo 报告纪律声明自证）；真实治理任务走 vNext 八拍全链无档案。
- 归属判定位：后续批次客体位 / Owner 位（择一真实变更在真实靶上走一次八拍全链并归档）
- 谱系：[SRC: cutover/m6-evidence/PACK-CONTRACT.md#MASTer_master 真实治理任务 in-vivo] + [SRC: benchmarks/theme-demos-report.md#MASTer_master` 绝对只读]

### OPEN-M6-16 30_generated/page-specs 派生视图 §8 短暂滞后 8 页

- 现状事实：RCHK-1 §6.4：8 页（6 零枚举行页 + MANAGE-USER-ROLE + ROLE-MGMT）滞后；SKILL.md 明示派生视图不作为 compiler 输入，不阻断任何 gate；后续以 merge-preserving 方式再编译。
- 归属判定位：治理侧登记位（后续 merge-preserving 再编译）
- 谱系：[SRC: rechecks/RCHK-1-owner-handoff.md#30_generated/page-specs 派生视图 §8 短暂滞后]

## §D Owner 决策位说明

- go/no-go 判定：Owner 专属位。本包只呈报判据对照（§B）与开放项（§C），不自答 go；本节零倾向性推荐语（机检禁词表见 PACK-CONTRACT §6.4，内置机检零命中为产出前置）。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#go/no-go 证据包 + 切换 commit]
- 判据原文的通过语义（Owner 裁定时对照）：§5.1 表标题「全绿才允许切 M6；No-Go 不是失败而是延期决议」；M6 阶段行「go/no-go 评审 → 移除 hook/injection/task 依赖」。[SRC: cutover/m6-evidence/PACK-CONTRACT.md#M6 切断 Trellis]
- 判据状态语义：§B 状态词是子项不等式/存在性检查的机械核对结果（四值词表）；「不满足/无法评估」在 §5.1 语义下等价于延期决议的输入，不是本包代答的否决。
- 开放项裁决入口：Owner 位条目（OPEN-M6-01/03/04/05/09/10/13）→ 裁决台账追加（corpus/master/cutover/owner-adjudications.md，追加式记录）；治理侧登记位（OPEN-M6-12/16）→ vNext 治理侧改进 backlog；后续批次客体位（OPEN-M6-02/06/07/08/14/15）→ 迁移线后续批次规划；自动呈报位（OPEN-M6-11）→ 累计 20 个真实治理任务后自动呈报，当前无需动作。
- 各开放项所需输入指针：逐条见 §C 各条「谱系」锚；MASTer 工作树现状（OPEN-M6-04/05）的权威转述面 = corpus/master/rechecks/RCHK-1-owner-handoff.md（本包按铁律 1 零读取 MASTer_master）。[SRC: rechecks/RCHK-1-owner-handoff.md#Owner 自查命令（建议顺序）]
- 呈报位汇总：本包已完成的 = 判据对照 + 开放项呈报 + 证据可回对性（锚解析率 100% + 恒等式 I1–I5 全绿）；未完成的 = go/no-go 判定本身（100% 在 Owner）。

## §E 附录证据索引

consumed 文件全集（路径 + sha256 + 用途 + 被 §B/§C 引用的位置），共 73 件；inputs_fingerprint=c1f75eeafb5322ea07f2abe05290a107b81aa409bd239ed66e6af474b8cc2d27（一致性自证：汇编器在产出前以同一算法对 consumed 集重算并断言相等——恒等式 I4，违例即拒绝产出）。

| consumed 文件 | sha256 | 用途 | 被引用位置 |
|---|---|---|---|
| benchmarks/calibration-approval.json | 2f5d33297379ce3a97cb89ce8f488b08916d2b109322348df443e4c05678e25d | 校准批准（bench-0002） | benchmarks/calibration-approval.json#decision；benchmarks/calibration-approval.json#provisions |
| benchmarks/calibration-t1-approval.json | 63b60af0d4dea65a7ca90be450af150955420cbf1c33fb59d24e0243cc557b2e | 校准批准（bench-0003 T-1） | benchmarks/calibration-t1-approval.json#decision |
| benchmarks/last-results.json | b1889e9180d2ab4c9cff5e18b6743e1501d178dc12fe2d3b7553899e55f21565 | 自托管 bench 结果 | benchmarks/last-results.json#summary |
| benchmarks/phaseD-demo-report.md | 46e3bd97658dadba28c357b463a0b592b1aec763c4166be85a6d5cf5d5921cc9 | 锚（引用解析） | benchmarks/phaseD-demo-report.md#2. 八拍对照表；benchmarks/phaseD-demo-report.md#纪律声明；benchmarks/phaseD-demo-report.md:25；benchmarks/phaseD-demo-report.md:38；benchmarks/phaseD-demo-report.md:39；benchmarks/phaseD-demo-report.md:40；benchmarks/phaseD-demo-report.md:53；benchmarks/phaseD-demo-report.md:54；benchmarks/phaseD-demo-report.md:55 |
| benchmarks/theme-demos-report.md | 428ec53dc6d7dbd76fa1530884c7d430da37ebcc94021a9782db7cea15eb0f07 | 锚（引用解析） | benchmarks/theme-demos-report.md#2. 八拍对照表（3 主题 × 8 拍全实跑）；benchmarks/theme-demos-report.md#MASTer_master` 绝对只读；benchmarks/theme-demos-report.md:9 |
| catalog/catalog-lock.draft.json | 29b79f812c5a698d2b19a43093e18f49260dcfe681981bf4bb36c71a5b609c8b | catalog lock 现状 | catalog/catalog-lock.draft.json#catalog_version；catalog/catalog-lock.draft.json#entries |
| corpus/master/batch-1/gate-runs/change-governance/GTR-MIG-B1-aggregate.json | e2c757b4073d1050fd3a2831c02396a79da81d441d20b309d66655bc7d390726 | G3 verdict 重算（40 件逐件） | MIG-B1/gate-runs/change-governance/GTR-MIG-B1-aggregate.json@GRN-405 |
| corpus/master/batch-1/gate-runs/change-governance/GTR-MIG-B1-decision-machine-readability.json | b7c232bde4caea2dc1fd0c98493728011be0a4556e62ebddce94bbea272b869b | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/change-governance/GTR-MIG-B1-issue-evidence-chain.json | e42470f5031adbd552e2ef54313ed962d9291f194a8eef57aec8eaa57334420c | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/change-governance/GTR-MIG-B1-status-semantic-audit.json | c7f43ff07d128da0fd47454711653d7627f75c82e81cd5c73912aa34d1ae87d0 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/change-governance/GTR-MIG-B1-supersede-chain-integrity.json | e7132d15e4b8add445f8fbc0ed4df4ba7486508c558e9cb4d08651264ac71d21 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/contract/GTR-MIG-B1-01-openapi-operation-ref-exists.json | 91e94f18c86161db51f47d111fdd1fbe2181b2bf47b86f83444da4aff9470b83 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/contract/GTR-MIG-B1-02-mock-endpoint-declaration.json | efe02b49721f6664415e7e5ae7eab573390c8517c5ff00d7e0d8612fbf4cd4e1 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/contract/GTR-MIG-B1-03-implementation-honesty.json | 2f8a8c9af7d6515f4bd657797eb8f3c76d1f0b6ccb5f78f60b23a0f09e572e84 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/contract/GTR-MIG-B1-04-error-mapping-chain-complete.json | c9ec7a1ec8a71dc886cc95d5b8d66ac752fabaaa6c1d6d0f77ed3b7fc9b5b5dc | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/contract/GTR-MIG-B1-05-boundary-consumption.json | aef80e408976ec75f9ede64e76a9d0a9c0acf67f2a20958a72dac634b6cb88f7 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/contract/GTR-MIG-B1-06-aggregate.json | 18fb38f7618dbd9e4514e4bbde3dfa9d1a563d68e810a647535a71991a4d6ee3 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/grid/AGG-MIG-B1-grid.json | d9800f0e0e1e1a5381ea4122e5a7ac6289d864c89df6ab15ccf1e620b2b33f80 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/grid/GTR-MIG-B1-grid-01-forbidden-direct-import.json | 571dab8b886c32c238f625c7fc69861c4619772fc173f5620800af037948ce7c | G3 verdict 重算（40 件逐件） | MIG-B1/gate-runs/grid/GTR-MIG-B1-grid-01-forbidden-direct-import.json@GRN-4101 |
| corpus/master/batch-1/gate-runs/grid/GTR-MIG-B1-grid-02-grid-usage-binding.json | 5f4de3dd2075acd9f72035a1b83d51e3372cba4741169f97b893fcabfbdb20de | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/grid/GTR-MIG-B1-grid-03-adapter-registry-preservation.json | 170346fd7922df14fd213f7f843e295c349894e233f0c1366affe2a37780a2d2 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/gate-runs/grid/GTR-MIG-B1-grid-04-alternative-engine-lock.json | 57b4adf68eeb2a109b68800bdae8bc72e4b6b0fdc3c8bbea304f84d55de64a68 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-1/inventory.yaml | 2cdcb7e915ce87b53e7651a0fc63c7005b3207dd99cab9f88d549cc29e85ff5e | 五批盘点（assets/denominators 机判） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-2/gate-runs/blueprint/AGG-MIG-B2-blueprint.json | f8fab34624f07932a0babea2c38821172d9c0a8a0c363e4cc22a96495bbb0fea | G3 verdict 重算（40 件逐件） | MIG-B2/gate-runs/blueprint/AGG-MIG-B2-blueprint.json@GRN-4304 |
| corpus/master/batch-2/gate-runs/blueprint/GTR-MIG-B2-blueprint-01-blueprint-coverage.json | f572734ae17e76750b2be25365eaecbeb497893c751f90adaba1679c9bc0ce06 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-2/gate-runs/blueprint/GTR-MIG-B2-blueprint-02-unresolved-fidelity.json | 60469309d5c02f51d618ac508e82de567fab4782b897de686ff7e73564d2e37d | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-2/gate-runs/blueprint/GTR-MIG-B2-blueprint-03-prose-fidelity-sampling.json | 5d4319faf7078d7d32fb41e2f4f3ba997236e68913195bb09fd77927d271d54e | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-2/gate-runs/page-composition/AGG-MIG-B2-page-composition.json | f17488070d041b80255d49fedf14ef19bc1523d9730f41587a460998334eefc0 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-2/gate-runs/page-composition/GTR-MIG-B2-page-composition-01-readiness-attest-cross-check.json | a292d5b7b73613ab6bc7a8093a09606409040e3dffc4981597809d9d3d489d15 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-2/gate-runs/page-composition/GTR-MIG-B2-page-composition-02-composition-three-way-cross.json | 13323bfd1eefdaeaf1d57aa4a7e6551c0b9fa527066ad1876b02945116de47eb | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-2/gate-runs/page-composition/GTR-MIG-B2-page-composition-03-navigation-consistency.json | a561b448c4faafa9c4e83e771c446d0de3b1a47be5ecb4b5bd7b1f964c7dda7f | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-2/inventory.yaml | 5d7e85d9029606da85f8dd91c7ceeac0edba19528474841696537bbdf7e530e8 | 五批盘点（assets/denominators 机判） | MIG-B2/inventory.yaml#assets；MIG-B2/inventory.yaml#denominators |
| corpus/master/batch-3/gate-runs/calculation/AGG-MIG-B3-calculation.json | 981b196ab3abcdfc3c3d509afe1794fb67bc84d9f494b47202ad0ebe7f057bb5 | G3 verdict 重算（40 件逐件） | MIG-B3/gate-runs/calculation/AGG-MIG-B3-calculation.json@GRN-4403 |
| corpus/master/batch-3/gate-runs/calculation/GTR-MIG-B3-calculation-01-wired-honesty.json | 438e841ec39aa26a19a059c9af193b9058231b523e4ee6eaa7af49e17715e3fc | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-3/gate-runs/calculation/GTR-MIG-B3-calculation-02-formula-source-anchor.json | afea02c0b230f3b2cc9530f8a211079990a8811d85aef8598077c2640a069b96 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-3/gate-runs/state-integrity/AGG-MIG-B3-state-integrity.json | 44d8e96e344681f5e5b49a9d7634763993c9de4f4b5f5b5245766931896f7fa5 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-3/gate-runs/state-integrity/GTR-MIG-B3-state-integrity-01-ownership-totality.json | f025b95ea4f9cd9942f9b7465ce38f0ad2a0803a97db406d6d3871f60412d1ca | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-3/gate-runs/state-integrity/GTR-MIG-B3-state-integrity-02-negative-constraint-anchor.json | 223d39674e4bfea453a357c3b7a10eb6409a82bfd2a254792e456aeaecefeda3 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-3/gate-runs/state-integrity/GTR-MIG-B3-state-integrity-03-state-machine-references.json | fcd96d9cba4f6729f4e0e438cb01f93960934fd1358321f35f88fcab398e910f | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-3/inventory.yaml | 9e61785b1beb80840142e8e0db0c378f6123b6b6a9470d282f93fa45810fb644 | 五批盘点（assets/denominators 机判） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-4/gate-runs/baseline/AGG-MIG-B4-baseline.json | 5fa4c35f2ed7e4a9c619e029a0ed6e29df4ac4d08e9bbeb51bca59d5a346e2c7 | G3 verdict 重算（40 件逐件） | MIG-B4/gate-runs/baseline/AGG-MIG-B4-baseline.json@GRN-4605 |
| corpus/master/batch-4/gate-runs/baseline/GTR-MIG-B4-baseline-01-baseline-ref-resolves.json | 784f4fcda36e2f829fae1b68eeede503d7f769e48750b38b705f0e523744ad2b | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-4/gate-runs/baseline/GTR-MIG-B4-baseline-02-no-project-leak.json | 6d71aded7b9a530b13feb6c77c1fbb53842753ac2c900d8bd4759b11b80ea7f9 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-4/gate-runs/baseline/GTR-MIG-B4-baseline-03-verbatim-copy-probe.json | 2dc9042c1c45e20f1d06029490eed2765bdd68357ab747ab8b9944b285526cd2 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-4/gate-runs/baseline/GTR-MIG-B4-baseline-04-lock-reconcile.json | 35fed4d649e0f309e5cea6289b116c03709a3bf538a5c8d9077300599a8e5dca | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-4/inventory.yaml | a71c9042d42b2c7814034936773e3acaf530d245d136201b0d8ec4cadb4bf9a6 | 五批盘点（assets/denominators 机判） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-5/gate-runs/blueprint-linkage/AGG-MIG-B5-blueprint-linkage.json | a8fb612f05d58d2655aebf715d67ea095c0dc3a7fa49dd6def279e40352bbe1b | G3 verdict 重算（40 件逐件） | MIG-B5/gate-runs/blueprint-linkage/AGG-MIG-B5-blueprint-linkage.json@GRN-4704 |
| corpus/master/batch-5/gate-runs/blueprint-linkage/GTR-MIG-B5-blueprint-linkage-01-bp-page-linkage.json | 8ab0204c58599f6c0d7830b0319ad10e7bacd627b1645be9ea573884630b2d86 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-5/gate-runs/blueprint-linkage/GTR-MIG-B5-blueprint-linkage-02-archive-manifest-completeness.json | 9cab97a7dee1b6ca73eded344dd281085318d05cf34f4ccf96006a34f22f0b0a | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-5/gate-runs/blueprint-linkage/GTR-MIG-B5-blueprint-linkage-03-fta-findings-coverage.json | 82df46154a5a4273883c507b75930aee2e95c0aad4cd3ade002f4bcb88f227a4 | G3 verdict 重算（40 件逐件） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/batch-5/inventory.yaml | 2ddbd5cc1f12ee5dc55517af6cd06f3225569224164f48edab3f8f3ae7fffddd | 五批盘点（assets/denominators 机判） | （未被 §B/§C 直接引用：构成性输入/机判面） |
| corpus/master/cutover/TOMBSTONE-RUNBOOK.md | e7717955591b0b45a477b3749dbfbdcb944fee79d5ad790be0d494175e3e30fb | 回滚 runbook（G8） | cutover/TOMBSTONE-RUNBOOK.md#两步，各一条命令；cutover/TOMBSTONE-RUNBOOK.md:45 |
| corpus/master/cutover/m6-evidence/PACK-CONTRACT.md | 4daa6015caabcbbc17625025c102060b279bb5eeaa46d88a0b87c4e1236480dc | 判据原文载体（契约 §0.2 逐字表） | cutover/m6-evidence/PACK-CONTRACT.md#DP-2（双轨预算上限；cutover/m6-evidence/PACK-CONTRACT.md#G1 \| 功能覆盖矩阵闭合 \|；cutover/m6-evidence/PACK-CONTRACT.md#G1–G9 判据原文；cutover/m6-evidence/PACK-CONTRACT.md#G2 \| 数据完整性无静默缺口 \|；cutover/m6-evidence/PACK-CONTRACT.md#G2**：现行；cutover/m6-evidence/PACK-CONTRACT.md#G3 \| Gate 可信度自指验收 \|；cutover/m6-evidence/PACK-CONTRACT.md#G4 \| Tracer bullet 真实闭环 \|；cutover/m6-evidence/PACK-CONTRACT.md#G4**：八拍现行为；cutover/m6-evidence/PACK-CONTRACT.md#G5 \| Portability 底线（D7） \|；cutover/m6-evidence/PACK-CONTRACT.md#G5**：旧包命令；cutover/m6-evidence/PACK-CONTRACT.md#G6 \| 记忆主权移交完成 \|；cutover/m6-evidence/PACK-CONTRACT.md#G7 \| 双轨损耗在预算内 \|；cutover/m6-evidence/PACK-CONTRACT.md#G8 \| 回滚预案演练过 \|；cutover/m6-evidence/PACK-CONTRACT.md#G9 \| Consumer-local 护栏共存决议生效 \|；cutover/m6-evidence/PACK-CONTRACT.md#M6 切断 Trellis；cutover/m6-evidence/PACK-CONTRACT.md#M7 未启动，归档 tag + runbook 不存在；cutover/m6-evidence/PACK-CONTRACT.md#MASTer_master 真实治理任务 in-vivo；cutover/m6-evidence/PACK-CONTRACT.md#catalog-lock 仍为；cutover/m6-evidence/PACK-CONTRACT.md#go/no-go 证据包 + 切换 commit；cutover/m6-evidence/PACK-CONTRACT.md#书面化决议：无档案；cutover/m6-evidence/PACK-CONTRACT.md#全部三子项无档案；cutover/m6-evidence/PACK-CONTRACT.md#无专项演练档案；cutover/m6-evidence/PACK-CONTRACT.md#禁止混用；cutover/m6-evidence/PACK-CONTRACT.md#预计产生 hole 行 |
| corpus/master/cutover/owner-adjudications.md | fd23ba4d9837a3abfef89d20d90f58386c5ccc555c1749174344a1f81a720f1d | Owner 裁决台账（五裁决） | cutover/owner-adjudications.md#裁决1；cutover/owner-adjudications.md#裁决2；cutover/owner-adjudications.md#裁决3；cutover/owner-adjudications.md#裁决4；cutover/owner-adjudications.md#裁决5；cutover/owner-adjudications.md:6；cutover/owner-adjudications.md:9 |
| corpus/master/rechecks/RCHK-1-grn4503-replay.json | e23874b6b2b9dd7cc10d1d4a890a16e8cd81176761b2e447aa627c4a9e6cc8f8 | RCHK-1 GRN-4503 重放（gate 可重放锚） | rechecks/RCHK-1-grn4503-replay.json#after_fix_replay.dangling；rechecks/RCHK-1-grn4503-replay.json#after_fix_replay.verdict_if_rerun_now；rechecks/RCHK-1-grn4503-replay.json#delta.resolved_by_fix_count；rechecks/RCHK-1-grn4503-replay.json#machine_side_residual.machine_only_count；rechecks/RCHK-1-grn4503-replay.json#machine_side_residual.residual_note |
| corpus/master/rechecks/RCHK-1-owner-handoff.md | b5e8cd37ab48f8d04c52659caa7d23d600d5cdc74e11bdedeacc05398df668f3 | RCHK-1 owner-handoff（MASTer 现状权威转述） | rechecks/RCHK-1-owner-handoff.md#2.2 MASTer 校验入口；rechecks/RCHK-1-owner-handoff.md#2.3 vNext 侧边界；rechecks/RCHK-1-owner-handoff.md#2.4 源侧 pin 漂移登记；rechecks/RCHK-1-owner-handoff.md#25 对 C-01；rechecks/RCHK-1-owner-handoff.md#30_generated/page-specs 派生视图 §8 短暂滞后；rechecks/RCHK-1-owner-handoff.md#5. 提交命令；rechecks/RCHK-1-owner-handoff.md#FIX-2 效果对账；rechecks/RCHK-1-owner-handoff.md#GRN-4402 公式词形联结键盲区；rechecks/RCHK-1-owner-handoff.md#GRN-4503 悬空 49 → 39；rechecks/RCHK-1-owner-handoff.md#Owner 自查命令（建议顺序）；rechecks/RCHK-1-owner-handoff.md#恰为 5 项；rechecks/RCHK-1-owner-handoff.md#按消费项目纪律；rechecks/RCHK-1-owner-handoff.md#残留 39 条；rechecks/RCHK-1-owner-handoff.md#重放结论；rechecks/RCHK-1-owner-handoff.md:72 |
| corpus/master/views/build-manifest.json | 9b2907d44905e09696ec68f50ade225787df81986c19d8738ccc328ba00dbc3f | views 渲染产物 manifest | views/build-manifest.json#denominators；views/build-manifest.json#explicit_absence；views/build-manifest.json#gate_runs.verdicts；views/build-manifest.json#inputs_counts.truth_objects；views/build-manifest.json#inputs_fingerprint |
| docs/fresh-clone-repro-report.md | b18dd5c6e792b0ce08c96f6c3e178d125e180a21a433fa128bd808ff759d186a | G5 fresh-clone 复现实测报告 | docs/fresh-clone-repro-report.md#HEAD `512ff0c；docs/fresh-clone-repro-report.md#REPRODUCED；docs/fresh-clone-repro-report.md#判据前半句；docs/fresh-clone-repro-report.md#结论速览；docs/fresh-clone-repro-report.md:102；docs/fresh-clone-repro-report.md:5 |
| docs/trellis-gap-audit.md | 4bdfd3869d81e8f1c0518aadbaa45d873cb788e28ba7aa6d701a94e30e0b550b | G1 机制级差集审计（D19 门禁记录） | docs/trellis-gap-audit.md:22；docs/trellis-gap-audit.md:46；docs/trellis-gap-audit.md:49；docs/trellis-gap-audit.md:55；docs/trellis-gap-audit.md:61；docs/trellis-gap-audit.md:64；docs/trellis-gap-audit.md:68；docs/trellis-gap-audit.md:75；docs/trellis-gap-audit.md:98 |
| packages/cli/src/check.ts | 855ec802e5cd4add105951f8f3fb949fa53908ddd82a9707a55bfb646d27b6fd | G1 vNext 命令面文件存在性 | packages/cli/src/check.ts:1 |
| packages/cli/src/compact.ts | b4462a32d2620814b8ac3424770ccaec82e67064d998bf5d149a31e63a52f59c | G1 vNext 命令面文件存在性 | （未被 §B/§C 直接引用：构成性输入/机判面） |
| packages/cli/src/context.ts | 82aca21c133afbbbaef7e429aeb7baf2dcfac767fc993deec4ed485318d7ec9f | G1 vNext 命令面文件存在性 | packages/cli/src/context.ts:1 |
| packages/cli/src/digest.ts | 67a9b50f5d7d0ccd680d3b0ba0f0a6c3aeecf2f843ff21c0c8bcb4935712095f | G1 vNext 命令面文件存在性 | （未被 §B/§C 直接引用：构成性输入/机判面） |
| packages/cli/src/doctor.ts | 4e2f2f9075d91f28876a70129b203a2a1a21e052be3510c4a2eece640fff0c1f | G1 vNext 命令面文件存在性 | （未被 §B/§C 直接引用：构成性输入/机判面） |
| packages/cli/src/evidence.ts | 0ee5f316df5e9e7f46d37ab2550a48fc94d5933e5cc50179bf5e06245f26ff00 | G1 vNext 命令面文件存在性 | （未被 §B/§C 直接引用：构成性输入/机判面） |
| packages/cli/src/exec-guard.ts | ca332815c3245ad34906e874b55d7e8564e130a53d65fe59c9ade8ff8e8fb1e9 | G1 vNext 命令面文件存在性 | packages/cli/src/exec-guard.ts:1 |
| packages/cli/src/init.ts | 4736386d2959510a9d7a9d4093351b8b44c131282359d5dbc3653adb6a9b8980 | G1 vNext 命令面文件存在性 | packages/cli/src/init.ts:1 |
| packages/cli/src/permit.ts | 420f85839c929506a08a56fafeff650ffba6a9f9a07b7c3789db0b3c6bbec008 | G1 vNext 命令面文件存在性 | （未被 §B/§C 直接引用：构成性输入/机判面） |
| packages/cli/src/reconcile.ts | 7a98b098816669e3d326d0563f8b1ef03a5a90a867d2288db05036103e9ae75c | G1 vNext 命令面文件存在性 | （未被 §B/§C 直接引用：构成性输入/机判面） |
| packages/cli/src/record.ts | 60180fec814611220f4e326c391bb1dc355810b007132f301b4b3bc895dc62ac | G1 vNext 命令面文件存在性 | packages/cli/src/record.ts:1 |
| packages/cli/src/status.ts | 81cb9e0b3fc5d90115832a5b5996426b27c7ec9805903ab113289ab51faae697 | G1 vNext 命令面文件存在性 | （未被 §B/§C 直接引用：构成性输入/机判面） |
| packages/cli/src/triage.ts | d20a91fc1f44cf56b9314d0ec686c6fea077cd64e065b81b17a49163c3f1cffc | G1 vNext 命令面文件存在性 | （未被 §B/§C 直接引用：构成性输入/机判面） |
| tests/ratchet/floor.json | 2ce8d2dbf137bd721e74d4a372397ff177281d2beb63e1b8c4b6db712c1b5f9a | 测试棘轮 floor | tests/ratchet/floor.json#minTests |

自证：本附录 consumed 集与 pack-manifest.json .consumed_files 逐件一致；inputs_fingerprint 聚合算法 = sha256(Σ rel+sha256)，与 views/build-manifest.json 先例同构。[SRC: views/build-manifest.json#inputs_fingerprint]

