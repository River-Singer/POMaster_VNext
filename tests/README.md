# tests/

- `ratchet/floor.json` —— 棘轮账本：顶层 `minTests` = 全仓测试总数下限（只升不降）；
  `ledger` 段 = P15 分层账本（`layers` L1-L5 各层 floor + `domains` L1 四域
  IR 不变量 150 / 状态机转移对 120 / Permit·Evidence 推导 80 / Router 判定矩阵 60
  + `mapping` 全部 spec 文件 → 层/域归类 + `notes` 归类口径）。战略值出处：
  `docs/wave3-research-toolchain.md` §2 与 `docs/wave3-plan.md` P15。
- `ratchet/baseline.json` —— 首跑基线存档：记录棘轮首次全绿时的全仓用例数与用例构成（供审计回溯；不参与 CI 判定）。
- `ratchet/ratchet.mjs` —— 棘轮检查：`corepack pnpm exec vitest run --reporter=json` 统计用例数，低于 floor 退出码 1（CI 强制执行 `pnpm ratchet`）；含 `ledger` 段时按类 fail-below-floor（任何层/域实测计数低于其 floor 即退出码 1，输出分类明细），并做 mapping 封闭分母三查（未归类 spec / stale 条目 / 逐文件和与总数分叉，均红）；实测分解落 `coverage/ratchet-ledger.json`（策略在 floor.json，测量在 coverage）。
- `ratchet/ledger.spec.ts` —— 账本契约测试：floor 钉住战略值、mapping 与磁盘 spec 分母双向闭合、词形合法、内部相容（运行时计数判定归棘轮，本文件防账本本身被改坏）。
- 测试命名纪律：`*.spec.ts`；测试框架 vitest 2.x；根 `vitest.config.ts` 收集 `tests/**/*.spec.ts` 与 `packages/**/*.spec.ts`。
- `golden/` —— Golden P0 用例账本（`cases.json`，25 条：首批 20 条转写自
  `packages/schemas/assets/golden-seed-mapping.md` ＋ T-1 批准追加 ＋ P17 测试战略
  L3 四点名补录）＋ 数据驱动执行器
  （`golden.harness.ts`：kernel 转移校验 / id 解析 / triage 规则桶三类可执行判定，
  kernel 未就绪时回落 `reference/` 参考镜像；不可执行项显式 pending 并输出
  pendingList 到 `coverage/golden-report.json`——禁静默跳过当通过；P17-Seeds 起
  `golden.spec.ts` 另设「GOLDEN-L3 点名种子 · 执行面对照」describe，四点名场景中
  三个有 kernel/CLI 真实判决执行面的场景跑实转正）。
- `behavioral/` —— L5 Behavioral Eval（契约 `docs/p9-human-view-and-l5-contract.md` §2）：
  `seeds.json`（25 注册 / 23 executable / 0 pending / 2 retired——P17-Seeds：F-02 churn
  信号与 X-01 capability router 翻转前置不成立显式退役，`retired.reason_md` 落档判据与
  重登记路径，禁静默 pending 滞留；代号线 `L5-SEED`；种子素材唯一
  合法来源 = `corpus/master/batch-1/calibration/`，replay 锚定请求逐字转录）＋ 双
  evaluator 数据驱动执行器（P17 起执行器本体居 `@pomaster/cli` 的 `packages/cli/src/eval.ts`
  ——`pomaster eval --suite behavioral`（PRD §44.10）需要在包内 in-process 执行，dist
  可加载；rule_v0 参考镜像同址居 `packages/cli/src/triage-rule-v0.ts`；本目录
  `behavioral.harness.ts` 保留账本常量与 corpus 谱系对账 loader 并 re-export 执行器面，
  单一实现禁两套 runner 漂移：`cli_keyword` = triageRequest；`rule_v0` = triageRuleV0）
  ＋ vitest 入口（`behavioral.spec.ts`）。报告落 `coverage/behavioral-report.json`
  （镜像 golden 报告字段；零墙钟可字节级重放）。翻转纪律（契约 §2.7.2）：阈值/信号获批
  落地时对应 seed 期望翻转 + `flipped_from` 记录翻转前状态——翻转本身构成验收测试
  （T-1 翻转对 C-01/C-04 已随 Owner 裁决2/bench-0003 落地执行）。
  - `eval-cases.yaml` + `eval-case.schema.json` + `eval-carrier.spec.ts`（P19-EvalCarrier，
    PRD §94.2）：25 seeds 的 §94.2 Eval Case yaml 载物（id/input/expected 三键形态；
    expected = 契约 §2.4 断言集，词表闭表锁 schema）与 draft-07 schema（词形/必填
    fail-closed）。兼容双读裁定：机器判卷消费面 = `seeds.json`（预注册账本字节集不动），
    yaml = §94.2 登记形态——`eval-carrier.spec.ts` 锚同构（逐 case deep-equal + 双源
    `runAllSeeds` 字节级同报告）；CLI 运行时零 yaml 依赖（`loadSeeds` 对 yaml 显式拒绝
    并指路）；`must_not_spawn` 等 §94.2 示例词形在 capability/门集面落地前不入载物
    词表（禁发明无被测对象字段）。改期望/增删 case 必须双登记同步（缺一即红）。
  - `trigger-manifest.json` —— §94.3 触发清单（PRD §94.3；原文在仓库外，语义以
    `docs/wave3-research-prd.md` 转述为准）：五类触发源（Context Compiler / Router /
    Gate Policy / Catalog Rule / Harness；Role Prompt 与自身架构演进暂无仓库内载体，
    不发明占位触发源，类别闭表由消费脚本机器封死）的源路径模式 → suite 映射 +
    suites 注册表（behavioral → 本目录 spec + `pomaster eval --suite behavioral`）。
    消费脚本 `scripts/eval-trigger.mjs`（本地/CI 可跑：`--base <ref>` 比 `git diff`
    触达源，或 `--paths` 显式给定；提示模式 exit 0；`--run` 逐 suite 执行 vitest、
    失败透传退出码 fail-closed；`--dry-run`/`--json`；manifest 非法/git 不可用一律
    exit 1 绝不静默放行）。
- `integration/smoke.spec.ts` —— 临时目录端到端冒烟：`pomaster init → triage×2 →
  status --json → doctor --json`（断言 §45 信封、NO_CHANGE 幂等、triage 缺席信号、
  doctor 探测四态矩阵 fail-closed）；CLI dist 未就绪时逐项显式 pending 到
  `coverage/smoke-report.json`。
- `integration/write-layer-crash-injection.spec.ts` —— P16 写入层可靠性专项
  （L2 账）：A 段注入式半写（确定性重构 kill 在 executeWrites 各时点的磁盘态：
  staged 碎片 / WAL 孤儿 / commit 后 / evidence 孤儿 / index·journal 半字节截断）
  逐时点断言「重启（重新 createStore）state 完好或显式检出，绝不静默半状态」；
  B 段真实 SIGKILL 子进程（kernel dist 二进制跑真实事务循环，观测 READY/TX 1 后
  kill），断言重启全局不变量（快照 k 精确一致 / journal 前缀 1..m 无洞无重且
  m-k≤1 / 碎片形状干净 / 恢复事务干净）。与 L4 adversarial-permit-write-integrity
  分工：L4 证进程内异常的回滚，本文件证 kill -9 硬中断（无回滚代码运行）后的
  磁盘态与重启路径。`crash-workload-child.mjs` 为子进程工作载荷（非 spec 不入账）。
- `integration/catalog-lock-drift-matrix.spec.ts` —— P16 catalog-lock 漂移专项
  缺口面（L2 账）：P14（catalog-runtime-binding §②）已覆盖 content_drift，本
  文件补 verifyCatalogLock 其余 drift kind——missing / unexpected_file（含
  catalog status 命令面 fail-closed）/ entry_not_allowed / missing_required /
  lock_unreadable（坏形与缺失两形态），逐 kind「显式检出 + 恢复回绿」。
- `integration/eval-trigger.spec.ts` —— P17 §94.3 触发面专项（L2 账）：
  trigger-manifest.json 落档契约（结构合法 / 类别 ⊆ 五类闭表且第六类 fail-closed /
  五类分母齐全 / pattern 静态前缀在盘）＋ 映射正确性（触达源逐类命中含 ** 通配、
  未触达零误报、多类触发 suite 去重、Windows 反斜杠归一、JS matcher 与 TS 参考镜像
  globMatch 逐例一致）＋ 消费脚本子进程（--paths 提示 / 零命中合法成功 / 坏 manifest
  fail-closed / --run --dry-run 呈现命令不执行 / git diff 端到端临时仓库：tracked
  修改触发、未跟踪新文件不触发 / git 不可用 fail-closed）。
  `pomaster eval` 命令面契约在 `packages/cli/tests/eval.spec.ts`（L1）。

- `constitutional/` —— Constitutional Regression Suite（vNext Batch 5；纠错清单 §31
  八反例 + PRD 修订版 §9B CRC-A..H 行）：8 个永久回归 Case，命名 **CRC-A..CRC-H**
  （禁裸用 "Case A-H"——与 PRD v0.4/0.5.2 §16 旧 Case 编号 / 目录宪法
  §2·§11·§24·§34 / benchmarks `constitutional.mjs` §90.3 基准档三套既有语义显式
  划界，区分声明落各文件头注）；每测试带规范锚注释。B/D/E/G=跨面联合锚（把分立
  封闭测试串成场景级不变式），A/C/F/H=缺口端到端补齐（raw prompt 入口 / risk_score
  点名 / sensor 失配判卷 + OBSERVED screenshot-only 背书闸（kernel perception.ts
  最小判定，ADR 于该文件头注）/ PENDING→context 干净负例）。共享 fixture 居
  `crc-lib.ts`（非 spec 不入账）。层次归类按执行形态：kernel 进程内联合锚
  （B/C/D/E/F/G）计 L1 无域，runCli 端到端（A/H）计 L2——归类 ADR 见 floor.json
  `notes.batch5_crc`。独立性：零网络/外部工具、确定性零墙钟、Windows 可跑。

## 显式 deferred 登记（防静默缺口）

- ~~**并发会话锁（同一 store 多会话并发写互斥/检出语义）→ deferred 至 P20。**~~
  **已解锁入账（P20-Primitives 落面 + P20-Concurrency 重入语义补面闭合）**：
  `tests/integration/concurrent-session-locks.spec.ts`
  （L2 账）——双会话 attach→acquire→blocked→steal→release 全仪式 journal 事件链 +
  unit 锁跨 change 真并行 + 锁持有者 SIGKILL 崩溃后磁盘态检出与 steal 回收
  （`lock-holder-crash-child.mjs`，与 `write-layer-crash-injection.spec.ts` 的 SIGKILL
  注入手段同源）+ 重入语义三面（同会话重入 acquire blocked 自见且锁文件/journal/
  held_locks 零副作用；合法续期唯一通路 = 持有人心跳、fence 不动；合法再入 = 释放
  仪式、fence 重置 1、旧凭据 unknown_lock 随锁消亡）。
  解锁条件（wave3-plan.md P20 出口判据：session/lock/execution_id
  原语）已由 kernel `session.ts` / `locks.ts` / `execution.ts` 落地满足。

- **会话 held_locks 指针面的跨进程 CAS 化 → 显式 residual（P20-RedTeamFix 登记）。**
  背景：P20 红队发现 1（steal 竞态）修复后，锁文件面（fence/holder）与 journal 面已
  由独占认领 CAS + 原子追加保证跨进程正确（`concurrent-session-locks.spec.ts` E 段
  双子进程同拍 steal 争用钉住：串行化成功、fence 严格单调、无双重凭据、LOCK_STOLEN
  双条留痕）；但 `held_locks` 会话指针的联记（`addLockToSession`/`removeLockFromSession`
  读-改-写覆写各自会话文件）在「首轮接管方的清除由末接管方代执行 × 与其自身 add 交叉」
  时可留陈旧指针。处置取舍：`held_locks` 是可观测性登记（advisory），排他判卷权威在
  锁文件 + fence（E 段已钉），指针面字节级 CAS 化为独立后续——不在本批四发现范围。

## 棘轮只升不降

1. **任何改动不得使测试总数低于 floor**——重命名、搬移、跳过（`describe.skip`/`todo`）、重构都不得降低它；CI 红灯即返工。
2. floor 只能被「新增/恢复用例」抬高：当前数量高于 floor 时，应**随本次改动一并提升** `floor.json` 的 `minTests`。脚本刻意不自动改写 floor——保持确定性与可审计（棘轮的刻度是 PR 出来的，不是脚本写出来的）。分层账本同理：某层/域实测超过其 floor 后，应一并提升该类 floor；低于 floor 的类别以真实测试补齐（每条测试对应代码中真实存在的不变量/转移/推导/判定，禁止凑数填充）。
3. 计数口径：1 assert = 1 个 vitest 用例（`numTotalTests` / `assertionResults` 条目；子测试不计入）。口径固定写死在本文件与 `ratchet.mjs`，避免统计口径漂移导致并行建造者的数字互相矛盾。
4. `pnpm ratchet` 查总量 + 分层两类下限；正确性由 `pnpm test`（CI 独立步骤）保证——数量达标且全红同样不可接受。分类构成账（mapping）是封闭分母：新增/删除/改名 spec 必须同步维护 `ledger.mapping`，未归类或 stale 即红。
5. 质量承诺基线：构建出口 ≥600 用例六类齐全、首发 ≥800（见根 README「质量承诺」）；floor 是通往该承诺的过程刻度，只升不降。分层战略值（L1 四域 150/120/80/60 等）当前高于实测的部分是**显式登记的补量缺口**（见 `coverage/ratchet-ledger.json` 的 belowFloorClasses），由后续补量阶段填平——红灯是缺口的事实呈现，不是机制故障。
