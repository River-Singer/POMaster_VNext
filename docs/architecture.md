# 架构（占位）

> 状态：**占位文档**。本文只登记当前 scaffold 的物理分层与生命周期坐标；权威叙事以根 `README.md` 为准，Kernel 接口语义以 `docs/kernel-api.md` 为准。

## 生命周期五段式（详见 README「全景」）

```text
0 BOOTSTRAP → 1 主循环(N x 八拍 Change Loop) → 2 周期事件 → 3 架构演化 → 4 生产反馈 → 5 退役归档
```

## 八拍 Change Loop（详见 README「THE LOOP」）

```text
① TRIAGE → ② FRAMEWORK LOCK → ③ PROJECTION → ④ EXECUTE → ⑤ VERIFY → ⑥ RECONCILE → ⑦ COMPACT → ⑧ 下一轮
```

命令面语义与八拍的对应关系：`pomaster triage`=①、`pomaster permit issue/check/steal/list`（FRAMEWORK LOCK 命令面）=②、`compileProjection`/`context compile`=③、`exec-guard` 与 Permit 内写=④、`check`/`normalizeGateResult`=⑤、`pomaster reconcile`（delta/例外/抽样三段报告，G3）=⑥、`pomaster compact`（episode 折叠：证据批量收编 + `--ops` 显式事务合并为单次 applyTransaction，NO_CHANGE 合法出口）与 `pomaster record gate-run|claim`（证据显式单条入账，G4+G6）=⑦。

## 当前物理分层（scaffold）

```text
packages/
  kernel/         状态机判卷者：store 事务 / 转移引擎 / ID 解析 / Permit / 投影 / gate 归一 / reconcile / doctor
  schemas/        形态契约（7 份 IR schema 资产）+ FROZEN 词表唯一镜像点（src/vocab.ts）
  gauntlet-lite/  §59 Gate Adapter 执行面：adapter-types 契约 / build-adapter（vitest 跑批 + 七态归一）/ detectors（oasdiff·import-linter·dependency-cruiser·chrome-devtools MCP 四探测）/ registry
  cli/            命令面（八拍语义；scaffold 占位）
tests/            跨包测试 + 棘轮（ratchet：测试数量下限只升不降）
docs/             kernel-api.md（公共契约语义）+ 本文件
```

分层纪律：`schemas` 只放契约与冻结词表镜像（不写行为）；`kernel` 是唯一写入权威（一切落库必经 store 事务）；`gauntlet-lite` 与外部测试工具走 Adapter（绝不进核心）；`cli` 只做编排与判卷呈现。

## 词表与哈希两条全局纪律（跨层）

- 一切枚举/前缀/转移矩阵只能镜像 `packages/schemas/assets/vocab-lock.draft.yaml`（FROZEN）；代码镜像点唯一在 `packages/schemas/src/vocab.ts`；需要新值 → `TODO(vocab-pr)`。
- D24 哈希伦理：digest/sha 仅读侧服务（identity/短路重跑/防篡改抽验），永不阻断写入，人类永不计算哈希（store 事务自动维护）。
