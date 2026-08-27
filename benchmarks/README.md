# benchmarks/ — Self-hosting Benchmark（三档基准）

> **PRD §90.3 Self-hosting Benchmark Matrix**：必须长期保留至少三类自托管回归任务；**如果三类任务最终走的是同一套流程，则 Adaptive Governance 失败**。本目录是 POMaster_VNext 仓库「用自己的治理工具治理自己」的周期事件落点（README 五段式·阶段 2「自托管基准」）。

## 三档语义

| 档 | 场景示例 | 期望 Profile | 形态 | 脚本 |
|---|---|---|---|---|
| **Tiny Change** | README badge 文案调整 | `MINIMAL` | 已脚本化 | `tiny.mjs` |
| **Normal Change** | 新增一个普通 CLI capability（如 `pomaster explain`） | `LIGHT` / `STANDARD` | 已脚本化 | `normal.mjs` |
| **Constitutional / Architecture Change** | 修改 State Model、新增 Kernel Primitive | `STRICT` + Meta-Governance | **不脚本化**——留待首次架构变更自然触发 | （无，见下） |

**Constitutional 档为何不脚本化**：§90.3 的成立条件是三档走**不同**流程。P0 CLI 的关键词引擎不产出 STRICT（C5 裁定：命中宪法级关键词时输出 `PROFILE_CANDIDATE` 提示并落 `STANDARD`，prompt_only）——在宪法级通路（Meta-Governance 流程）真正落地前强行脚本化，只会把第三档压扁成与前两档同一套脚本流程，恰是 §90.3 判定为「Adaptive Governance 失败」的情形。因此本目录只保留该档的占位：**首次真实架构变更发生时，按当次的 Meta-Governance 流程走一遍并记录**，之后再评估是否值得固化为脚本。

## 运行

前置：`corepack pnpm --filter @pomaster/cli build`（脚本调用 `packages/cli/dist/bin.js`，即 `@pomaster/cli` 的 `bin` 定义；dist 缺失时脚本报 harness error 并以退出码 2 结束）。

```bash
node benchmarks/tiny.mjs      # 单档 Tiny：断言 MINIMAL 且输出无 architect/research/spawn 字样
node benchmarks/normal.mjs    # 单档 Normal：断言 profile ∈ [LIGHT, STANDARD]
node benchmarks/run-all.mjs   # 两档合跑 + 写 last-results.json
```

退出码语义（三脚本一致）：`0` = 断言全部通过；`1` = 断言失败；`2` = 基准装置错误（CLI 缺失 / 输出不可解析）。

## last-results.json

`run-all.mjs` 的唯一落盘产物，记录每档的真实输出：

- `entries[].profile` / `matched_rule` / `evidence_grade` / `matched_keywords`：triage 判定原文；
- `entries[].durationMs`：该档整轮墙钟耗时（含子进程）；
- `entries[].assertions[]`：逐条断言明细（name / ok / detail）；
- **timestamp 禁入**：运行序以整数 `seq` + `run_id`（`bench-NNNN`）标识，seq 单调递增、append-only，不回头改写历史。

## 校准（C7）

阈值初值校准挂入本基准作 calibration round——**阈值由证据出，而非拍脑袋**。每轮校准按 [`calibration-template.md`](./calibration-template.md) 出报告：

1. **阈值提案**（每条绑定可重放证据：seq 或语料回放编号，无证据行无效）；
2. **Owner 批准位**（Human Maintainer 签核，cannot self-approve）；
3. **MASTer 语料回放占位**（语料清单/回放方式/判定标准先落盘；回放绝不写入 MASTer_master 目录，运行态演示一律用临时副本）。

校准轮代号即本目录的 `seq`，两边以此对账。

## 纪律

- 演示与回放若涉及 `examples/tiny-tool`，一律在临时副本上跑，不改动其已提交状态；
- `MASTer_master` 目录只读语料来源候选，脚本化回放落地前不触碰。
