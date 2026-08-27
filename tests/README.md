# tests/

- `ratchet/floor.json` —— 测试数量下限（当前 **221**，对应构建期六类用例铺开的最低门槛）。
- `ratchet/baseline.json` —— 首跑基线存档：记录棘轮首次全绿时的全仓用例数与用例构成（供审计回溯；不参与 CI 判定）。
- `ratchet/ratchet.mjs` —— 棘轮检查：`corepack pnpm exec vitest run --reporter=json` 统计用例数，低于 floor 退出码 1（CI 强制执行 `pnpm ratchet`）。
- 测试命名纪律：`*.spec.ts`；测试框架 vitest 2.x；根 `vitest.config.ts` 收集 `tests/**/*.spec.ts` 与 `packages/**/*.spec.ts`。
- `golden/` —— Golden P0 用例账本（`cases.json`，首批 20 条，转写自
  `packages/schemas/assets/golden-seed-mapping.md`）＋ 数据驱动执行器
  （`golden.harness.ts`：kernel 转移校验 / id 解析 / triage 规则桶三类可执行判定，
  kernel 未就绪时回落 `reference/` 参考镜像；不可执行项显式 pending 并输出
  pendingList 到 `coverage/golden-report.json`——禁静默跳过当通过）。
- `integration/smoke.spec.ts` —— 临时目录端到端冒烟：`pomaster init → triage×2 →
  status --json → doctor --json`（断言 §45 信封、NO_CHANGE 幂等、triage 缺席信号、
  doctor 探测四态矩阵 fail-closed）；CLI dist 未就绪时逐项显式 pending 到
  `coverage/smoke-report.json`。

## 棘轮只升不降

1. **任何改动不得使测试总数低于 floor**——重命名、搬移、跳过（`describe.skip`/`todo`）、重构都不得降低它；CI 红灯即返工。
2. floor 只能被「新增/恢复用例」抬高：当前数量高于 floor 时，应**随本次改动一并提升** `floor.json` 的 `minTests`。脚本刻意不自动改写 floor——保持确定性与可审计（棘轮的刻度是 PR 出来的，不是脚本写出来的）。
3. 计数口径：1 assert = 1 个 vitest 用例（`numTotalTests` / `assertionResults` 条目；子测试不计入）。口径固定写死在本文件与 `ratchet.mjs`，避免统计口径漂移导致并行建造者的数字互相矛盾。
4. `pnpm ratchet` 只查数量下限；正确性由 `pnpm test`（CI 独立步骤）保证——数量达标且全红同样不可接受。
5. 质量承诺基线：构建出口 ≥600 用例六类齐全、首发 ≥800（见根 README「质量承诺」）；floor=150 是通往该承诺的过程刻度，只升不降。
