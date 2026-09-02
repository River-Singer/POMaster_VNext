# benchmarks/ — Self-hosting Benchmark（四档基准）

> **PRD §90.3 Self-hosting Benchmark Matrix**：必须长期保留至少三类自托管回归任务；**如果三类任务最终走的是同一套流程，则 Adaptive Governance 失败**。本目录是 POMaster_VNext 仓库「用自己的治理工具治理自己」的周期事件落点（README 五段式·阶段 2「自托管基准」）。第四档 **Applicability**（PRD v0.5.2 §15 Benchmark A；W1-A2，Owner 裁决 8 ② 2026-09-01）把「catalog 结构化适用性过滤」纳入自托管判卷。

## 四档语义

| 档 | 场景示例 | 期望 Profile | 形态 | 脚本 |
|---|---|---|---|---|
| **Tiny Change** | README badge 文案调整 | `MINIMAL` | 已脚本化 | `tiny.mjs` |
| **Normal Change** | 新增一个普通 CLI capability（如 `pomaster explain`） | `LIGHT` / `STANDARD` | 已脚本化 | `normal.mjs` |
| **Constitutional / Architecture Change** | 修改 State Model、新增 Kernel Primitive | `STRICT` + Meta-Governance（映射已裁定：**catalog 锚即档**，A3 `APPROVED_OWNER_2026_09_01`） | 已脚本化（L6-3）——走**结构可区分**的第三条通路 | `constitutional.mjs` |
| **Applicability（Benchmark A）** | README badge 文案调整（与 Tiny 同场景） | `MINIMAL` + catalog 适用性排除 | 已脚本化（W1-A2）——走 `context compile`/`context explain` 命令面的第四条通路 | `applicability.mjs` |

**Constitutional 档如何做到「不同流程」（L6-3）**：§90.3 的成立条件是三档走**不同**流程。tiny/normal 走 CLI triage 关键词引擎（`surface=cli:triage`，信封只产 profile/证据级/关键词，无 gate 执行载体）；constitutional 档**不走 triage**，改走 kernel catalog v1 完整治理面（`surface=kernel:catalog+gatekeeper`，全部为 `packages/kernel` 既有 API 真实执行，禁 mock）：① `readCatalogLock` + `verifyCatalogLock`（catalog-lock 全量 sha256 对账，D24）；② profile 锚定（catalog-lock `profile=web-standard@0`——catalog 锚即档，A3 裁定 3）；③ 宪法级条目面（lock entries 的 `GATE.*` 5 条 gate recipe——A3 裁定 1 执行面=全量 + `AUTHORITY.*` 5 条 §90.2 Protected Set 之 Authority Model 锚，经共享读取器单点取得）；④ gate 判卷就绪校验（A3 裁定 1+2 执行面：5 条 gate 逐条「定义在场 + lock 哈希锚 + judging_rules 四硬判据词形（草稿升硬）」校验；诚实边界——vNext 仓库自身无业务分母，每条 gate 显式 `execution="not_run"` 计入独立披露字段 `constitutional_gate_readiness`，ok 吃「5/5 就绪 + 四规则词形完整」，不吃假判卷）+ fixture 演示判卷（kernel `normalizeGateResult` 以 catalog gate_def 锚红绿各一：绿=合式载荷归一 passed，红=`not_applicable` 缺失被 FATAL 拒收；subject `TEST.*` + `is_fixture=true` Q3 隔离，不冒充业务分母判卷）；⑤ DEF-GATEKEEPER「cannot self-approve」观测器行为校验（临时 store fixture：同 execution 既提 proposal 又 ALLOW → drift 触发；身份分离 → 不触发；空 store → 零分母显式）。三档各产出**路径签名**（执行面 / gate 集合 / artifact 集合 / profile 值），脚本机器断言两两不同——三者同路即红（§90.3「同路 = Adaptive Governance 失败」的判卷化）。

**Applicability 档（PRD v0.5.2 §15 Benchmark A，W1-A2）**：场景与 Tiny 相同（README badge 文案调整），但判卷面是 **catalog 结构化适用性**（P0.5-1）：① triage profile=`MINIMAL`（tiny 同引擎真实判定）；② `context compile --role frontend --capability CAPABILITY.PRESENTATION` 的 catalogEntries **不含 policy.api.\*/policy.sec.\* 族**——T3 标注战役（94 条物料机器 applicability 字段）承载的更严真断言：标注前现状是 lane=frontend 全量注入 API 族（被动正确），标注后由 capabilities 轴确定性排除（主动判卷，标注回归即红）；③ 编译原始输出无 architect/research/spawn/subagent 字样（MINIMAL 档纪律延续 tiny 先例）；④ `context explain` 逐条 why：每个决策恰有一面 why（included→why_included / excluded→why_excluded），被排除的 API/Sec 族 why_excluded 携带 `capabilities=[CAPABILITY.API_CONTRACT]` 轴详情（PRD §5.4「每个决定可解释」）。**诚实边界**（研究 applicability.md R6 / Owner 裁决 8 ② O9 fixture-only）：真实 catalog 无 DB transaction / backend persistence 条目（`db_domain_entries_total=0` 如实披露，空分母不冒充判卷）——DB 排除逻辑的真判卷由 `tests/integration/catalog-applicability-case-b.spec.ts` 的 fixture DB 条目承载；本档判卷面 = capabilities 轴，change_class/profile 轴判卷由 kernel/集成 spec 承载。第四条通路的**结构可区分**：`surface="cli:context-applicability"`（context compile/explain 命令面，异于 `cli:triage` 与 `kernel:catalog+gatekeeper`）+ `excluded_refs>0` 独有判卷轴，四档路径签名两两互异由脚本机器断言（§90.3 四档延续）。

**A3 裁定（Owner 决议 2026-09-01，按推荐全收）**：三项口径裁定记入 constitutional 条目 `a3_ruling`（`ruling="APPROVED_OWNER_2026_09_01"`，三项裁定内容逐字 + `promoted_to_assertions` 转正映射）——①gate 子集：宪法档执行面 = catalog 5 条 `GATE.*` **全部**；②判定阈值：`gate_def_draft.judging_rules` 四条草稿纪律（`counts_not_applicable_required` / `trust_twin` / `blindspot_evidence` / `aggregate_honesty`）**全部升为硬判据**；③STRICT 映射：**catalog 锚即档**（catalog-lock 的 profile 锚即宪法档位词形，triage 不物化 STRICT 档，无双轨）。原 `a3_pending_items`（`ruling="PENDING_A3"`，不参与 ok）机制移除，被裁定项全部转正为参与 ok 判定的真断言。

**装置纪律**：gatekeeper fixture 一律 `mkdtemp` 临时目录（前缀 `pvnext-kernel-test-`），`finally` 全树删除；**绝不触碰真实 `~/.claude` / 用户 home**；fixture 证据记录零时间戳（运行序纪律与 last-results.json 同源）。

## 运行

前置：`node scripts/build-all.mjs`（tiny/normal/applicability 调用 `packages/cli/dist/bin.js`；constitutional 加载 `packages/kernel/dist/index.js`——任一 dist 缺失时脚本报 harness error 并以退出码 2 结束）。

```bash
node benchmarks/tiny.mjs            # 单档 Tiny：断言 MINIMAL 且输出无 architect/research/spawn 字样
node benchmarks/normal.mjs          # 单档 Normal：断言 profile ∈ [LIGHT, STANDARD]
node benchmarks/constitutional.mjs  # 单档 Constitutional：catalog 治理面 + gatekeeper + 三档签名判卷（内部真跑 tiny+normal 取签名）
node benchmarks/applicability.mjs   # 单档 Applicability：catalog 适用性排除 + explain 逐条 why + 四档签名判卷（内部真跑 tiny+normal 取判定与签名）
node benchmarks/run-all.mjs         # 四档合跑 + 写 last-results.json（constitutional 复用本轮 tiny/normal；applicability 复用本轮 tiny/normal/constitutional，均不重复执行）
```

退出码语义（四脚本一致）：`0` = 断言全部通过；`1` = 断言失败（含路径签名同路）；`2` = 基准装置错误（dist 缺失 / 输出不可解析）。

## last-results.json

`run-all.mjs` 的唯一落盘产物，记录每档的真实输出：

- `entries[].profile` / `matched_rule` / `evidence_grade` / `matched_keywords`：triage 判定原文（tiny/normal）；
- `entries[].profile`（constitutional）：catalog profile 锚原值（`profile_kind="catalog-profile-anchor"`——A3 裁定 3：catalog 锚即档，无双轨）；
- `entries[].path_signature`：各档路径签名（surface / profile / matched_rule / gate_ids / artifacts），同路判卷依据；
- `entries[].applicability`（applicability 档）：判卷面明细——compile_role / compile_capabilities / catalog_entries_total / excluded_api_sec_refs / decisions_total / db_domain_entries_total / honest_boundary（诚实边界注记逐字）；
- `entries[].a3_ruling` 与顶层 `a3_ruling`：A3 三项裁定记录（`ruling="APPROVED_OWNER_2026_09_01"`，裁定内容逐字 + 转正断言映射）；
- `entries[].constitutional_gate_readiness`（constitutional）：5 条 gate 判卷就绪明细（定义在场 / lock 哈希锚 / 四硬判据词形 / `execution="not_run"` 分母缺席显式披露）；
- `entries[].durationMs`：该档整轮墙钟耗时（含子进程；constitutional/applicability 合跑态因复用前两档条目而小于单跑，属预期）；
- `entries[].assertions[]`：逐条断言明细（name / ok / detail）；
- **timestamp 禁入**：运行序以整数 `seq` + `run_id`（`bench-NNNN`）标识，seq 单调递增、append-only，不回头改写历史；
- **schema `…/4` 向后兼容 `/3`/`/2`/`/1`**：`/2` 新增 `path_signature`；`/3`（A3 裁定转正，Owner 2026-09-01）将 `a3_pending_items` 更名为 `a3_ruling` 并在 constitutional 条目新增 `constitutional_gate_readiness`；`/4`（W1-A2 P0.5-1 T4，PRD v0.5.2 §15 Benchmark A）新增第四档 applicability 条目（`entries[]` 多一条 `tier="applicability"`）；既有消费面（`readPrevSeq` 只取 `seq`；m6 evidence pack 取 `run_id`/`summary`）字段不变。

## 校准（C7）

阈值初值校准挂入本基准作 calibration round——**阈值由证据出，而非拍脑袋**。每轮校准按 [`calibration-template.md`](./calibration-template.md) 出报告：

1. **阈值提案**（每条绑定可重放证据：seq 或语料回放编号，无证据行无效）；
2. **Owner 批准位**（Human Maintainer 签核，cannot self-approve）；
3. **MASTer 语料回放占位**（语料清单/回放方式/判定标准先落盘；回放绝不写入 MASTer_master 目录，运行态演示一律用临时副本）。

校准轮代号即本目录的 `seq`，两边以此对账。

## 纪律

- 演示与回放若涉及 `examples/tiny-tool`，一律在临时副本上跑，不改动其已提交状态；
- `MASTer_master` 目录只读语料来源候选，脚本化回放落地前不触碰。
