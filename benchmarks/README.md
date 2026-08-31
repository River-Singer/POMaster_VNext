# benchmarks/ — Self-hosting Benchmark（三档基准）

> **PRD §90.3 Self-hosting Benchmark Matrix**：必须长期保留至少三类自托管回归任务；**如果三类任务最终走的是同一套流程，则 Adaptive Governance 失败**。本目录是 POMaster_VNext 仓库「用自己的治理工具治理自己」的周期事件落点（README 五段式·阶段 2「自托管基准」）。

## 三档语义

| 档 | 场景示例 | 期望 Profile | 形态 | 脚本 |
|---|---|---|---|---|
| **Tiny Change** | README badge 文案调整 | `MINIMAL` | 已脚本化 | `tiny.mjs` |
| **Normal Change** | 新增一个普通 CLI capability（如 `pomaster explain`） | `LIGHT` / `STANDARD` | 已脚本化 | `normal.mjs` |
| **Constitutional / Architecture Change** | 修改 State Model、新增 Kernel Primitive | `STRICT` + Meta-Governance（口径 **A3 pending**） | 已脚本化（L6-3）——走**结构可区分**的第三条通路 | `constitutional.mjs` |

**Constitutional 档如何做到「不同流程」（L6-3）**：§90.3 的成立条件是三档走**不同**流程。tiny/normal 走 CLI triage 关键词引擎（`surface=cli:triage`，信封只产 profile/证据级/关键词，无 gate 执行载体）；constitutional 档**不走 triage**，改走 kernel catalog v1 完整治理面（`surface=kernel:catalog+gatekeeper`，全部为 `packages/kernel` 既有 API 真实执行，禁 mock）：① `readCatalogLock` + `verifyCatalogLock`（catalog-lock 全量 sha256 对账，D24）；② profile 锚定（catalog-lock `profile=web-standard@0`）；③ 宪法级条目面（lock entries 的 `GATE.*` 5 条 gate recipe + `AUTHORITY.*` 5 条 §90.2 Protected Set 之 Authority Model 锚，经共享读取器单点取得）；④ DEF-GATEKEEPER「cannot self-approve」观测器行为校验（临时 store fixture：同 execution 既提 proposal 又 ALLOW → drift 触发；身份分离 → 不触发；空 store → 零分母显式）。三档各产出**路径签名**（执行面 / gate 集合 / artifact 集合 / profile 值），脚本机器断言两两不同——三者同路即红（§90.3「同路 = Adaptive Governance 失败」的判卷化）。

**A3 pending 纪律**：宪法档的**口径**（具体执行哪些宪法 gate、判定阈值、STRICT 档映射）属 Owner A3 裁定位。脚本内凡依赖未裁口径的项列入 `a3_pending_items`（`ruling="PENDING_A3"`），**不参与 ok 判定**（不假绿也不误红）；机器上今天可真判的部分（catalog-lock 完整性 / 路径签名可区分性 / profile 锚定存在性 / gatekeeper 观测器行为）正常断言参与 ok。裁定后逐项转正为断言。

**装置纪律**：gatekeeper fixture 一律 `mkdtemp` 临时目录（前缀 `pvnext-kernel-test-`），`finally` 全树删除；**绝不触碰真实 `~/.claude` / 用户 home**；fixture 证据记录零时间戳（运行序纪律与 last-results.json 同源）。

## 运行

前置：`node scripts/build-all.mjs`（tiny/normal 调用 `packages/cli/dist/bin.js`；constitutional 加载 `packages/kernel/dist/index.js`——任一 dist 缺失时脚本报 harness error 并以退出码 2 结束）。

```bash
node benchmarks/tiny.mjs            # 单档 Tiny：断言 MINIMAL 且输出无 architect/research/spawn 字样
node benchmarks/normal.mjs          # 单档 Normal：断言 profile ∈ [LIGHT, STANDARD]
node benchmarks/constitutional.mjs  # 单档 Constitutional：catalog 治理面 + gatekeeper + 三档签名判卷（内部真跑 tiny+normal 取签名）
node benchmarks/run-all.mjs         # 三档合跑 + 写 last-results.json（constitutional 复用本轮 tiny/normal 条目，不重复执行）
```

退出码语义（三脚本一致）：`0` = 断言全部通过；`1` = 断言失败（含三档路径签名同路）；`2` = 基准装置错误（dist 缺失 / 输出不可解析）。

## last-results.json

`run-all.mjs` 的唯一落盘产物，记录每档的真实输出：

- `entries[].profile` / `matched_rule` / `evidence_grade` / `matched_keywords`：triage 判定原文（tiny/normal）；
- `entries[].profile`（constitutional）：catalog profile 锚原值（`profile_kind="catalog-profile-anchor"`，非 triage 档位词——不冒充 STRICT）；
- `entries[].path_signature`：三档路径签名（surface / profile / matched_rule / gate_ids / artifacts），同路判卷依据；
- `entries[].a3_pending_items` 与顶层 `a3_pending_items`：宪法档口径裁定位清单（`ruling="PENDING_A3"`，不参与 ok）；
- `entries[].durationMs`：该档整轮墙钟耗时（含子进程；constitutional 合跑态因复用两档条目而小于单跑，属预期）；
- `entries[].assertions[]`：逐条断言明细（name / ok / detail）；
- **timestamp 禁入**：运行序以整数 `seq` + `run_id`（`bench-NNNN`）标识，seq 单调递增、append-only，不回头改写历史；
- **schema `…/2` 向后兼容 `/1`**：`/2` 新增 `path_signature` 与 `a3_pending_items` 字段；既有消费面（`readPrevSeq` 只取 `seq`；m6 evidence pack 取 `run_id`/`summary`）字段不变。

## 校准（C7）

阈值初值校准挂入本基准作 calibration round——**阈值由证据出，而非拍脑袋**。每轮校准按 [`calibration-template.md`](./calibration-template.md) 出报告：

1. **阈值提案**（每条绑定可重放证据：seq 或语料回放编号，无证据行无效）；
2. **Owner 批准位**（Human Maintainer 签核，cannot self-approve）；
3. **MASTer 语料回放占位**（语料清单/回放方式/判定标准先落盘；回放绝不写入 MASTer_master 目录，运行态演示一律用临时副本）。

校准轮代号即本目录的 `seq`，两边以此对账。

## 纪律

- 演示与回放若涉及 `examples/tiny-tool`，一律在临时副本上跑，不改动其已提交状态；
- `MASTer_master` 目录只读语料来源候选，脚本化回放落地前不触碰。
