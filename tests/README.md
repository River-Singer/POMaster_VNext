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
- `golden/` —— Golden P0 用例账本（`cases.json`，首批 20 条，转写自
  `packages/schemas/assets/golden-seed-mapping.md`）＋ 数据驱动执行器
  （`golden.harness.ts`：kernel 转移校验 / id 解析 / triage 规则桶三类可执行判定，
  kernel 未就绪时回落 `reference/` 参考镜像；不可执行项显式 pending 并输出
  pendingList 到 `coverage/golden-report.json`——禁静默跳过当通过）。
- `behavioral/` —— L5 Behavioral Eval（契约 `docs/p9-human-view-and-l5-contract.md` §2）：
  `seeds.json`（25 注册 / 23 executable / 2 pending，代号线 `L5-SEED`；种子素材唯一
  合法来源 = `corpus/master/batch-1/calibration/`，replay 锚定请求逐字转录）＋ 双
  evaluator 数据驱动执行器（`behavioral.harness.ts`：`cli_keyword` = @pomaster/cli
  `triageRequest` 源码直连；`rule_v0` = golden reference `triageRuleV0`）＋ vitest 入口
  （`behavioral.spec.ts`）。报告落 `coverage/behavioral-report.json`（镜像 golden
  报告字段；零墙钟可字节级重放）。翻转纪律（契约 §2.7.2）：阈值/信号获批落地时对应
  seed 期望翻转 + `flipped_from` 记录翻转前状态——翻转本身构成验收测试（T-1 翻转对
  C-01/C-04 已随 Owner 裁决2/bench-0003 落地执行）。
- `integration/smoke.spec.ts` —— 临时目录端到端冒烟：`pomaster init → triage×2 →
  status --json → doctor --json`（断言 §45 信封、NO_CHANGE 幂等、triage 缺席信号、
  doctor 探测四态矩阵 fail-closed）；CLI dist 未就绪时逐项显式 pending 到
  `coverage/smoke-report.json`。

## 棘轮只升不降

1. **任何改动不得使测试总数低于 floor**——重命名、搬移、跳过（`describe.skip`/`todo`）、重构都不得降低它；CI 红灯即返工。
2. floor 只能被「新增/恢复用例」抬高：当前数量高于 floor 时，应**随本次改动一并提升** `floor.json` 的 `minTests`。脚本刻意不自动改写 floor——保持确定性与可审计（棘轮的刻度是 PR 出来的，不是脚本写出来的）。分层账本同理：某层/域实测超过其 floor 后，应一并提升该类 floor；低于 floor 的类别以真实测试补齐（每条测试对应代码中真实存在的不变量/转移/推导/判定，禁止凑数填充）。
3. 计数口径：1 assert = 1 个 vitest 用例（`numTotalTests` / `assertionResults` 条目；子测试不计入）。口径固定写死在本文件与 `ratchet.mjs`，避免统计口径漂移导致并行建造者的数字互相矛盾。
4. `pnpm ratchet` 查总量 + 分层两类下限；正确性由 `pnpm test`（CI 独立步骤）保证——数量达标且全红同样不可接受。分类构成账（mapping）是封闭分母：新增/删除/改名 spec 必须同步维护 `ledger.mapping`，未归类或 stale 即红。
5. 质量承诺基线：构建出口 ≥600 用例六类齐全、首发 ≥800（见根 README「质量承诺」）；floor 是通往该承诺的过程刻度，只升不降。分层战略值（L1 四域 150/120/80/60 等）当前高于实测的部分是**显式登记的补量缺口**（见 `coverage/ratchet-ledger.json` 的 belowFloorClasses），由后续补量阶段填平——红灯是缺口的事实呈现，不是机制故障。
