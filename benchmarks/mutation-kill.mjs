#!/usr/bin/env node
/**
 * mutation-kill.mjs —— L6-1 实测 harness：「Mutation kill score ≥ 85%（changed-code
 * scope）」（Decision/Gate 模块）的可复现测量装置。
 *
 * 测量目标（4 个 Decision/Gate 模块，packages/kernel/src/）：
 *   question-gate.ts（§80.4-80.7 七关/一次一问/发散收敛判卷）
 *   gate-result.ts（八拍⑤ VERIFY 门禁结果归一，C1 七态判卷）
 *   gatekeeper.ts（DEF-GATEKEEPER 分身漂移触发观测器）
 *   transitions.ts（lifecycle 转移引擎纯函数）
 *
 * 行为（逐条 mutant）：
 *   1. 精确 old→new 单点替换应用到源文件（唯一站点强制；mutant 全部落在决策逻辑
 *      真分支：比较算子翻转 / 边界常量 ±1 / 布尔取反 / 短路逻辑交换 / 早退条件翻转
 *      / 分支交换——禁改注释/字符串字面量凑数）；
 *   2. 应用读回验证（RT1-A 封条）：写后读回必须与预期逐字节一致；零变更 mutant
 *      （old→new 经 EOL 转换后相同 = 定义缺陷）记 invalid 不入分母、拒绝产 gate
 *      record（exit 2）；
 *   3. 跑 scope 映射的 vitest（只跑覆盖该模块的测试文件，非全量；映射从 import
 *      关系推导，见 SCOPE 与 scopeNote 披露）；
 *   4. 判 killed/survived（可解析 json 报告是判卷唯一证据面——无报告 = harness_error
 *      fail-closed，伪造 exit 1 不得折进 killed：RT1-B2 封条；幸存者二次复核：复跑
 *      全 kernel 套件防「scope 收窄假幸存者」——复核杀死者 killedBy=kernel_recheck
 *      显式留痕）；try/finally 恢复原文件，逐次 sha256 复核（防崩溃留脏树）；
 *   5. 全部判完：复核全部基线哈希 + 跑 scope 全集测试确认树干净测试绿；
 *   6. 结果经 gauntlet-lite 判卷锚路径（parseStrykerReport → summarizeMutants →
 *      normalizeMutationLeg）产出 GRN 词形 gate record；kill score 是重算值
 *      （killed/generated），且 harness 算术 × 判卷器双路对账一致才落盘；
 *   7. 落盘 benchmarks/mutation-last-results.json（seq 自增；timestamp 禁入身份
 *      字段——运行序以 seq 整数标识，durationMs 允许）。合成判卷报告以
 *      harness_report 键一并持久化（RT2 封条：at-rest 校验锚——--verify 可在
 *      不重跑测量的前提下重放判卷器，手改落盘分数/计数必被检出）；
 *   8. 入正式账本（Owner 决议 2026-09-01：批准基准轮 gate record 入账）：gate record
 *      自洽复核通过后，经 kernel applyTransaction 的 record_gate_run op 落本仓
 *      REPO_ROOT/.pomaster store（evidence/runs/<GRN>.json + journal TX_APPLIED 锚），
 *      成为正式治理事实——store 未初始化时 createStore 幂等建 skeleton（authority
 *      骨架按默认；record_gate_run 不需要 authority owner）。同 GRN 重复入账显式
 *      处理：同内容 already_entered 零写入、异内容 GRN_CONFLICT fail-closed（静默
 *      双写由双防线封死：kernel A3 存在性防线——EVIDENCE_ALREADY_EXISTS / op 层
 *      canonicalizeOverwrite 显式契约位——+ CLI 入账预检）。账本一致性纳入
 *      --verify 对账面。REPO_ROOT/.pomaster 已入 .gitignore（保守裁定：账本留本机
 *      不入 git）；last-results.json 照旧是基准报告文件，与 store 账本并存。--verify
 *      的账本对账按环境依赖分层（Owner 设计修正 2026-09-01）：store 在座必查
 *      fail-closed；store 缺席（fresh clone 预期形态）显式披露跳过——判卷锚重放层
 *      （环境无关）兜底判卷，两环境都严格判卷不放宽。
 *
 * 用法：
 *   node benchmarks/mutation-kill.mjs              # 真实测量（写结果文件 + 入账）
 *   node benchmarks/mutation-kill.mjs --selfcheck  # 自检：fixture mutant 集验证判卷器
 *   node benchmarks/mutation-kill.mjs --verify     # at-rest 校验：重放判卷锚对账落盘值
 *                                                  # + 账本对账（store 在座必查 fail-closed /
 *                                                  # 缺席显式跳过披露——分层语义）
 *
 * 退出码：0 = 达标（score ≥ 85 且 survivors ≤ 10；--verify 时 = 对账一致——账本层
 * store 缺席属显式跳过披露而非失配，判卷锚重放层已全绿兜底）；
 * 1 = 测量完成但阈值未达（strengthener 回路：正确动作是补测试杀幸存者后重跑，禁调
 * 阈值/禁改判）或 --verify 对账失配（落盘结果不可信或账本不一致）；2 = harness 错误
 * （判卷输入不可信 / invalid mutant / results 缺席 / 账本入账失败 fail-closed——测量
 * 成功但账本写入失败不能静默绿）；3 = 树完整性破坏（基线哈希复核失败）。
 *
 * 前置：node scripts/build-all.mjs（判卷锚消费 packages/gauntlet-lite/dist）。
 *
 * 并发披露：本 harness 窗口期会短暂改写 4 个目标源文件（每条 mutant 一次、finally
 * 立即恢复 + sha256 复核）；若同仓有并行 vitest 全量跑，窗口内可能受瞬态影响——
 * 恢复完整性以哈希复核为准。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import {
  applyMutantToContent,
  buildElementsReport,
  classifyVitestRun,
  crosscheckJudgeStats,
  detectEol,
  recomputeMutationTotals,
  sha256Hex,
  verifyMutationResults,
} from "./lib/mutation-harness-core.mjs";
import {
  enterGateRecordInStore,
  verifyGateRecordInLedger,
} from "./lib/mutation-ledger.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(join(HERE, ".."));
const VITEST_MJS = join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");
const GAUNTLET_DIST = join(REPO_ROOT, "packages", "gauntlet-lite", "dist", "index.js");
const KERNEL_DIST = join(REPO_ROOT, "packages", "kernel", "dist", "index.js");
const RESULTS_PATH = join(REPO_ROOT, "benchmarks", "mutation-last-results.json");
const RESULTS_SCHEMA = "pomaster.vnext.mutation-kill-results/1";
const FIXTURE_PREFIX = "pomaster-p35-mutation-";
const KERNEL_TESTS_DIR = "packages/kernel/tests";

// 预算纪律：逐 mutant scoped vitest 期望 ~30s 内；90s 硬超时（超时 = harness error，
// 禁当 killed 虚高 score）。
const PER_RUN_TIMEOUT_MS = 90_000;
/** 阈值（MUTATION_PROVISIONAL_THRESHOLDS 出厂兜底同值；已经 Owner 决议 2026-09-01 批准转正——A4 阈值包）。 */
const THRESHOLDS = { minKillScore: 85, maxSurvivors: 10 };

// ============================================================
// changed-code scope：测量目标模块 → 覆盖它的测试文件（import 关系推导）
// ============================================================

/**
 * 映射口径（scopeNote 同步披露）：
 * - 主映射 = 符号级直接引用该模块导出的测试文件（含经 store.record_gate_run 传递
 *   行使 gate-result 落盘通路的 store.spec.ts，显式列明）；
 * - tests/golden/golden.spec.ts 经 golden.harness.ts 直调 validateTransition（kernel
 *   优先、仅 "not-implemented" 回落参考镜像——mutant 行为变异不会被回落掩盖）；
 * - 仓级 integration（tests/integration/*，经 barrel 消费 normalizeGateResult 的
 *   对抗/e2e 面）不在逐 mutant scope（browser/e2e 重量级）——幸存者复核通道已用全
 *   kernel 套件兜底，残余盲区在 scopeNote 诚实披露。
 */
const TARGET_MODULES = [
  {
    file: "packages/kernel/src/question-gate.ts",
    role: "Decision——Question Gate Q1-Q7 / One-question-at-a-time / Diverge→Converge",
    tests: [`${KERNEL_TESTS_DIR}/question-gate.spec.ts`],
  },
  {
    file: "packages/kernel/src/gate-result.ts",
    role: "Decision——GateResult 归一（C1 七态判卷 + fixture 隔离 + blindspot 不变量）",
    tests: [
      `${KERNEL_TESTS_DIR}/gate-result.spec.ts`,
      `${KERNEL_TESTS_DIR}/evidence-recompute.spec.ts`,
      `${KERNEL_TESTS_DIR}/knowledge.spec.ts`,
      `${KERNEL_TESTS_DIR}/reconcile.spec.ts`,
      `${KERNEL_TESTS_DIR}/ref-integrity.spec.ts`,
      `${KERNEL_TESTS_DIR}/store.spec.ts`,
    ],
  },
  {
    file: "packages/kernel/src/gatekeeper.ts",
    role: "Decision——DEF-GATEKEEPER 分身漂移触发观测器",
    tests: [`${KERNEL_TESTS_DIR}/gatekeeper.spec.ts`, `${KERNEL_TESTS_DIR}/forbidden-patterns.spec.ts`],
  },
  {
    file: "packages/kernel/src/transitions.ts",
    role: "Decision——lifecycle 转移引擎（requires/grace 映射 + FROZEN 矩阵校验）",
    tests: [
      `${KERNEL_TESTS_DIR}/transitions.spec.ts`,
      `${KERNEL_TESTS_DIR}/transitions-store.spec.ts`,
      "tests/golden/golden.spec.ts",
    ],
  },
];

// ============================================================
// 手工定向 mutant 库（30 条；每条 = 唯一站点精确替换，落在决策真分支）
// ============================================================

/** @type {import("./lib/mutation-harness-core.mjs").MutantDef[]} */
const MUTANTS = [
  // ---- question-gate.ts（8：七关卡分支 / 一致性对账 / 可问类闸 / 排序 / 收敛分区）----
  {
    id: "MUT-QG-001",
    file: "packages/kernel/src/question-gate.ts",
    mutatorName: "ConditionalNegation",
    description: "七关主循环命中判定取反（上游能答→不能答，DERIVABLE/RESEARCHABLE 判处翻转）",
    old: "    if (input.answerable[step.key]) {",
    new: "    if (!input.answerable[step.key]) {",
  },
  {
    id: "MUT-QG-002",
    file: "packages/kernel/src/question-gate.ts",
    mutatorName: "ComparisonOperator",
    description: "申报分类与重算处置一致性比较翻转（declaredConsistent 对账信号反向）",
    old: "      const consistent = input.category === step.verdict;",
    new: "      const consistent = input.category !== step.verdict;",
  },
  {
    id: "MUT-QG-003",
    file: "packages/kernel/src/question-gate.ts",
    mutatorName: "EarlyExitNegation",
    description: "Q7 早退条件翻转（不阻塞→阻塞，DEFERABLE 与 ASK_HUMAN 分流互换）",
    old: "  if (!input.answerable.q7_blocking_increment) {",
    new: "  if (input.answerable.q7_blocking_increment) {",
  },
  {
    id: "MUT-QG-004",
    file: "packages/kernel/src/question-gate.ts",
    mutatorName: "LogicalOperator",
    description: "可问类闸 && → ||（条件恒真，ASK_HUMAN 通路整体消失）",
    old: '  if (input.category !== "BLOCKING_AUTHORITY" && input.category !== "PREFERENCE") {',
    new: '  if (input.category !== "BLOCKING_AUTHORITY" || input.category !== "PREFERENCE") {',
  },
  {
    id: "MUT-QG-005",
    file: "packages/kernel/src/question-gate.ts",
    mutatorName: "ComparisonOperator",
    description: "过闸凭证校验翻转（持证→无证，提问队列 fail-closed 拒绝合法队列）",
    old: '    if (q.gateVerdict !== "ASK_HUMAN") {',
    new: '    if (q.gateVerdict === "ASK_HUMAN") {',
  },
  {
    id: "MUT-QG-006",
    file: "packages/kernel/src/question-gate.ts",
    mutatorName: "SortComparator",
    description: "一次一问优先级排序比较器倒置（价值最高→价值最低优先出队）",
    old: "    (a, b) => a.priority - b.priority || queue.indexOf(a) - queue.indexOf(b),",
    new: "    (a, b) => b.priority - a.priority || queue.indexOf(a) - queue.indexOf(b),",
  },
  {
    id: "MUT-QG-007",
    file: "packages/kernel/src/question-gate.ts",
    mutatorName: "BoundaryConstant",
    description: "缺区判定 > 0 → >= 0（恒真，收敛分区全部误判 missing_zone）",
    old: "  if (missing.length > 0) {",
    new: "  if (missing.length >= 0) {",
  },
  {
    id: "MUT-QG-008",
    file: "packages/kernel/src/question-gate.ts",
    mutatorName: "ComparisonOperator",
    description: "跨区重复检测首次出现判定翻转（future 偷渡 current 的互斥闸失效）",
    old: "      if (firstZone !== undefined) {",
    new: "      if (firstZone === undefined) {",
  },

  // ---- gate-result.ts（9：C1 七态判卷 / fixture 隔离 / blindspot 不变量 / trust 失配 / snake 映射）----
  {
    id: "MUT-GR-001",
    file: "packages/kernel/src/gate-result.ts",
    mutatorName: "BoundaryConstant",
    description: "非负有限数域 < 0 → <= 0（0 计数被拒，counts 必填域闸误伤合法零值）",
    old: "  if (!Number.isFinite(value) || value < 0) return null;",
    new: "  if (!Number.isFinite(value) || value <= 0) return null;",
  },
  {
    id: "MUT-GR-002",
    file: "packages/kernel/src/gate-result.ts",
    mutatorName: "BooleanNegation",
    description: "verdict 七态词表校验取反（合法词形全 FATAL、词表外值全放行——词表闸反向）",
    old: "    !VERDICT_VALUES.includes(verdictRaw as VerdictValue)",
    new: "    VERDICT_VALUES.includes(verdictRaw as VerdictValue)",
  },
  {
    id: "MUT-GR-003",
    file: "packages/kernel/src/gate-result.ts",
    mutatorName: "ComparisonOperator",
    description: "Q3 fixture 双向强校验 !== → ===（合法载荷被拒、冒充载荷放行）",
    old: "  if (subjectIsFixture !== isFixture) {",
    new: "  if (subjectIsFixture === isFixture) {",
  },
  {
    id: "MUT-GR-004",
    file: "packages/kernel/src/gate-result.ts",
    mutatorName: "BoundaryConstant",
    description: "blindspot produced>scanned 不变量 > → >=（相等合法形态被误判自相矛盾）",
    old: "  if (produced > scanned) {",
    new: "  if (produced >= scanned) {",
  },
  {
    id: "MUT-GR-005",
    file: "packages/kernel/src/gate-result.ts",
    mutatorName: "ComparisonOperator",
    description: "skipped_blindspot 必附盲区指标校验翻转（无证据盲区跳过放行、有证据被拒）",
    old: "    countsOptionals.uncheckedInBlindspotEstimated === undefined",
    new: "    countsOptionals.uncheckedInBlindspotEstimated !== undefined",
  },
  {
    id: "MUT-GR-006",
    file: "packages/kernel/src/gate-result.ts",
    mutatorName: "ComparisonOperator",
    description: "asserted/recomputed 孪生对账比较翻转（失配当匹配、匹配当失配）",
    old: "recomputedViolations === asserted.value.violations",
    new: "recomputedViolations !== asserted.value.violations",
  },
  {
    id: "MUT-GR-007",
    file: "packages/kernel/src/gate-result.ts",
    mutatorName: "ConditionalNegation",
    description: "失配降级分支翻转（passed 踩失配自报不再降级 warning——C1 verdict_cap 失效）",
    old: '    if (verdict === "passed") {',
    new: '    if (verdict !== "passed") {',
  },
  {
    id: "MUT-GR-008",
    file: "packages/kernel/src/gate-result.ts",
    mutatorName: "BoundaryConstant",
    description: "escape_ratio 域闸 <= 1 → < 1（=1 的合法满逃逸率被逐出显式声明域）",
    old: "    escapeRaw !== null && escapeRaw <= 1",
    new: "    escapeRaw !== null && escapeRaw < 1",
  },
  {
    id: "MUT-GR-009",
    file: "packages/kernel/src/gate-result.ts",
    mutatorName: "ConditionalNegation",
    description: "snake 落盘 scope.note 条件翻转（留痕位静默丢失/凭空留痕——P12 红队修复面反向）",
    old: "    ...(result.scopeNote === undefined ? {} : { scope: { note: result.scopeNote } }),",
    new: "    ...(result.scopeNote !== undefined ? {} : { scope: { note: result.scopeNote } }),",
  },

  // ---- gatekeeper.ts（6：ALLOW 计数 / drift 边界 / 周窗宁严不漏 / 早退 / 短路 / 阈值域）----
  {
    id: "MUT-GK-001",
    file: "packages/kernel/src/gatekeeper.ts",
    mutatorName: "ComparisonOperator",
    description: "ALLOW 判定翻转（verdict=passed→非 passed 计 allow，「既提又 ALLOW」信号反向）",
    old: '    if (verdict === "passed") {',
    new: '    if (verdict !== "passed") {',
  },
  {
    id: "MUT-GK-002",
    file: "packages/kernel/src/gatekeeper.ts",
    mutatorName: "BoundaryConstant",
    description: "drift 配对判定 >= threshold → >（1/1 恰达阈值的漂移信号丢失）",
    old: "      drift: Math.min(bucket.proposals, bucket.allows) >= threshold,",
    new: "      drift: Math.min(bucket.proposals, bucket.allows) > threshold,",
  },
  {
    id: "MUT-GK-003",
    file: "packages/kernel/src/gatekeeper.ts",
    mutatorName: "TernaryBranchSwap",
    description: "周窗锚缺失三元翻转（档案缺失 in_window=false——「宁严不漏」纪律反向）",
    old: "      startedAt === null ? true : Date.parse(startedAt) >= windowStartMs;",
    new: "      startedAt === null ? false : Date.parse(startedAt) >= windowStartMs;",
  },
  {
    id: "MUT-GK-004",
    file: "packages/kernel/src/gatekeeper.ts",
    mutatorName: "EarlyExitNegation",
    description: "claims 侧无身份记录早退翻转（无 execution_id 记录误入分母触发词形校验抛错）",
    old: `    const executionId = record.execution_id;
    if (typeof executionId !== "string") continue;
    assertExecutionWordForm(executionId, \`evidence/claims/\${name}\`);`,
    new: `    const executionId = record.execution_id;
    if (typeof executionId === "string") continue;
    assertExecutionWordForm(executionId, \`evidence/claims/\${name}\`);`,
  },
  {
    id: "MUT-GK-005",
    file: "packages/kernel/src/gatekeeper.ts",
    mutatorName: "LogicalOperator",
    description: "triggered 聚合 && → ||（任一行在窗即触发——良性账本误报漂移）",
    old: "    triggered: rows.some((row) => row.drift && row.in_window),",
    new: "    triggered: rows.some((row) => row.drift || row.in_window),",
  },
  {
    id: "MUT-GK-006",
    file: "packages/kernel/src/gatekeeper.ts",
    mutatorName: "BoundaryConstant",
    description: "threshold 域闸 < 1 → < 2（缺省值 1 被误拒——最严观测缺省不可用）",
    old: "  if (!Number.isInteger(threshold) || threshold < 1) {",
    new: "  if (!Number.isInteger(threshold) || threshold < 2) {",
  },

  // ---- transitions.ts（7：轴闸 / 词表闸 / 矩阵闸 / requires·grace 映射 / 注记分支）----
  {
    id: "MUT-TR-001",
    file: "packages/kernel/src/transitions.ts",
    mutatorName: "ComparisonOperator",
    description: "axis 轴闸翻转（lifecycle 合法调用 FATAL、未知轴放行——词表纪律反向）",
    old: '  if (axis !== "lifecycle") {',
    new: '  if (axis === "lifecycle") {',
  },
  {
    id: "MUT-TR-002",
    file: "packages/kernel/src/transitions.ts",
    mutatorName: "BooleanNegation",
    description: "from 词表闸取反（合法 from 判 unknown_from_state、词表外值放行）",
    old: "  if (!fromKnown) {",
    new: "  if (fromKnown) {",
  },
  {
    id: "MUT-TR-003",
    file: "packages/kernel/src/transitions.ts",
    mutatorName: "BooleanNegation",
    description: "to 词表闸取反（合法 to 判 unknown_to_state、词表外值放行）",
    old: "  if (!toKnown) {",
    new: "  if (toKnown) {",
  },
  {
    id: "MUT-TR-004",
    file: "packages/kernel/src/transitions.ts",
    mutatorName: "BooleanNegation",
    description: "转移矩阵成员判定取反（合法转移判不在矩阵、非法转移放行——FROZEN 矩阵反向）",
    old: "  if (!targets.includes(to)) {",
    new: "  if (targets.includes(to)) {",
  },
  {
    id: "MUT-TR-005",
    file: "packages/kernel/src/transitions.ts",
    mutatorName: "LogicalOperator",
    description: "终态注记分支 RETIRED||REJECTED → &&（条件恒假，终态路标注记消失）",
    old: '  if (to === "RETIRED" || to === "REJECTED") {',
    new: '  if (to === "RETIRED" && to === "REJECTED") {',
  },
  {
    id: "MUT-TR-006",
    file: "packages/kernel/src/transitions.ts",
    mutatorName: "ComparisonOperator",
    description: "SUPERSEDED 终态注记分支翻转（successor_ref 必填路标丢失/误挂到全部其他终态）",
    old: '  if (to === "SUPERSEDED") {',
    new: '  if (to !== "SUPERSEDED") {',
  },
  {
    id: "MUT-TR-007",
    file: "packages/kernel/src/transitions.ts",
    mutatorName: "BooleanNegation",
    description: "grace_policy 映射取反（DEPRECATED>RETIRED grace 当普通边、普通边当 grace）",
    old: "    gracePolicyConfig: GRACE_POLICY_CONFIG_EDGES.has(edge),",
    new: "    gracePolicyConfig: !GRACE_POLICY_CONFIG_EDGES.has(edge),",
  },
];

// ============================================================
// 共用运行面
// ============================================================

/** 结构化退出（throw 形态——保证 finally 清理一定执行，再由顶层 runner 落退出码）。 */
class HarnessExit extends Error {
  constructor(message, code) {
    super(message);
    this.exitCode = code;
  }
}

function fail(msg, code) {
  throw new HarnessExit(msg, code);
}

function loadGauntletDist() {
  if (!existsSync(GAUNTLET_DIST)) {
    fail(
      `packages/gauntlet-lite/dist/index.js 不在位（判卷锚消费 dist 词形）——先跑 node scripts/build-all.mjs`,
      2,
    );
  }
  return import(pathToFileURL(GAUNTLET_DIST).href);
}

/** 入账通路消费 kernel dist 词形（createStore/applyTransaction/gateResultToSnake 注入入账核心）。 */
function loadKernelDist() {
  if (!existsSync(KERNEL_DIST)) {
    fail(
      `packages/kernel/dist/index.js 不在位（入账通路消费 kernel dist 词形）——先跑 node scripts/build-all.mjs`,
      2,
    );
  }
  return import(pathToFileURL(KERNEL_DIST).href);
}

/** 跑一次 vitest（json 报告落 runDir/<tag>.json），返回 { status, errorMessage, jsonText, durationMs }。 */
function runVitest({ testFiles, runDir, tag, cwd = REPO_ROOT, root = undefined }) {
  const reportPath = join(runDir, `${tag}.json`);
  const args = [VITEST_MJS, "run"];
  if (root !== undefined) args.push("--root", root);
  args.push(...testFiles, "--reporter=json", `--outputFile=${reportPath}`);
  const startedAt = performance.now();
  const res = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    timeout: PER_RUN_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    shell: false,
  });
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  let jsonText = null;
  if (existsSync(reportPath)) {
    try {
      jsonText = readFileSync(reportPath, "utf8");
    } catch {
      jsonText = null;
    }
  }
  return {
    status: res.status,
    errorMessage: res.error ? res.error.message : null,
    jsonText,
    durationMs,
  };
}

// ============================================================
// --selfcheck：fixture mutant 集（2 必杀 + 1 必幸存）验证判卷器分类正确性
// （seed-mutant-library 敏感性纪律的 harness 版）
// ============================================================

const SELFCHECK_MODULE = `export function decide(x) {
  const label = x >= 0 ? "nonneg" : "neg";
  return { value: x + 1, label };
}
export function gateScore(killed, generated) {
  if (generated <= 0) throw new Error("empty denominator");
  return (killed / generated) * 100;
}
`;
const SELFCHECK_SPEC = `import { it, expect } from "vitest";
import { decide, gateScore } from "./math.mjs";
it("decide adds one", () => { expect(decide(1).value).toBe(2); });
it("decide adds one other", () => { expect(decide(5).value).toBe(6); });
it("score computes percent", () => { expect(gateScore(3, 4)).toBe(75); });
it("score rejects empty denominator", () => { expect(() => gateScore(1, 0)).toThrow(); });
`;
const SELFCHECK_MUTANTS = [
  {
    id: "SELF-MUT-001",
    file: "math.mjs",
    mutatorName: "BoundaryConstant",
    description: "必杀（边界）：空分母域闸 <= 0 → < 0，gateScore(1,0) 不再抛错被 toThrow 用例杀死",
    old: "if (generated <= 0) throw",
    new: "if (generated < 0) throw",
    expect: "killed",
  },
  {
    id: "SELF-MUT-002",
    file: "math.mjs",
    mutatorName: "ArithmeticOperator",
    description: "必杀（算术）：x + 1 → x - 1 被 decide 值断言杀死",
    old: "return { value: x + 1, label };",
    new: "return { value: x - 1, label };",
    expect: "killed",
  },
  {
    id: "SELF-MUT-003",
    file: "math.mjs",
    mutatorName: "StringLiteral",
    description: "必幸存：label 文案变异无 label 断言——判卷器必须如实计入幸存者（禁粉饰为 killed）",
    old: 'const label = x >= 0 ? "nonneg" : "neg";',
    new: 'const label = x >= 0 ? "NON_NEG" : "neg";',
    expect: "survived",
  },
];

async function runSelfcheck() {
  const gauntlet = await loadGauntletDist();
  const runDir = mkdtempSync(join(tmpdir(), FIXTURE_PREFIX + "selfcheck-"));
  try {
    const modulePath = join(runDir, "math.mjs");
    const specPath = join(runDir, "selfcheck.spec.mjs");
    writeFileSync(modulePath, SELFCHECK_MODULE, "utf8");
    writeFileSync(specPath, SELFCHECK_SPEC, "utf8");
    const baseline = readFileSync(modulePath);
    const baselineSha = sha256Hex(baseline);

    const outcomes = [];
    for (const mutant of SELFCHECK_MUTANTS) {
      const applied = applyMutantToContent(SELFCHECK_MODULE, mutant);
      if (!applied.ok) fail(`selfcheck mutant 应用失败：${applied.error}`, 2);
      if (applied.mutated === SELFCHECK_MODULE) fail(`selfcheck mutant ${mutant.id} 零变更（定义缺陷）`, 2);
      writeFileSync(modulePath, applied.mutated, "utf8");
      if (readFileSync(modulePath, "utf8") !== applied.mutated) {
        fail(`selfcheck mutant ${mutant.id} 应用读回验证失败（装置不可信）`, 2);
      }
      let outcome;
      try {
        const run = runVitest({
          testFiles: ["selfcheck.spec.mjs"],
          runDir,
          tag: mutant.id,
          cwd: runDir,
          root: runDir,
        });
        const verdict = classifyVitestRun(run);
        outcome = {
          id: mutant.id,
          file: mutant.file,
          line: applied.line,
          mutatorName: mutant.mutatorName,
          description: mutant.description,
          killed: verdict.outcome === "killed",
          killedBy: verdict.outcome === "killed" ? "mapped_scope" : null,
          killingTests: verdict.killingTests,
          durationMs: run.durationMs,
        };
      } finally {
        writeFileSync(modulePath, baseline, "utf8");
        if (sha256Hex(readFileSync(modulePath)) !== baselineSha) {
          fail("selfcheck fixture 恢复后 sha256 不一致（脏树）", 3);
        }
      }
      outcomes.push(outcome);
      const got = outcome.killed ? "killed" : "survived";
      process.stdout.write(`[selfcheck] ${mutant.id}: ${got}（预期 ${mutant.expect}）\n`);
    }

    // 判卷锚复用：合成报告 → 真实解析器/汇总器 → 与 harness 算术对账。
    const reportText = buildElementsReport(outcomes);
    const parsed = gauntlet.parseStrykerReport(reportText);
    if (parsed === null) fail("selfcheck：合成报告被判卷器判为 malformed（词形破损）", 2);
    const judgeStats = gauntlet.summarizeMutants(parsed.mutants);
    const harnessTotals = recomputeMutationTotals(outcomes);
    const cross = crosscheckJudgeStats(judgeStats, harnessTotals);
    if (!cross.ok) fail(`selfcheck 对账失配：${cross.mismatches.join("; ")}`, 2);

    // 预期分类逐条对账（错杀/漏杀/幸存者粉饰均红——敏感性红线）。
    const problems = [];
    for (let i = 0; i < SELFCHECK_MUTANTS.length; i += 1) {
      const expectKilled = SELFCHECK_MUTANTS[i].expect === "killed";
      if (outcomes[i].killed !== expectKilled) {
        problems.push(
          `${outcomes[i].id} 预期 ${SELFCHECK_MUTANTS[i].expect} 实测 ${outcomes[i].killed ? "killed" : "survived"}`,
        );
      }
    }
    const ok = problems.length === 0;
    process.stdout.write(
      `[selfcheck] 判卷器敏感性：${ok ? "PASS" : "FAIL"}（killed=${String(harnessTotals.killed)} survived=${String(harnessTotals.survived)} score=${harnessTotals.scorePercent.toFixed(2)}%；judge 对账一致）\n`,
    );
    if (!ok) {
      for (const p of problems) process.stderr.write(`[selfcheck] 敏感性失配：${p}\n`);
      throw new HarnessExit("selfcheck 敏感性失配（判卷器错杀/漏杀/粉饰幸存者）", 1);
    }
    process.stdout.write("[selfcheck] OK\n");
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}

// ============================================================
// 真实测量主流程
// ============================================================

function readResultsSeq() {
  if (!existsSync(RESULTS_PATH)) return 1;
  try {
    const prior = JSON.parse(readFileSync(RESULTS_PATH, "utf8"));
    if (typeof prior.seq === "number" && Number.isInteger(prior.seq) && prior.seq >= 0) {
      return prior.seq + 1;
    }
  } catch {
    // 先前文件损坏：不静默复用其 seq——从 1 重开并在 results 中留 prior_unparsable 痕。
  }
  return 1;
}

async function runMeasurement() {
  const startedAll = performance.now();
  const gauntlet = await loadGauntletDist();

  // —— 预检：目标文件在位 + vitest 可执行。
  for (const mod of TARGET_MODULES) {
    if (!existsSync(join(REPO_ROOT, mod.file))) fail(`目标模块不存在：${mod.file}`, 2);
  }
  if (!existsSync(VITEST_MJS)) fail(`vitest 不在位：${VITEST_MJS}`, 2);

  const runDir = mkdtempSync(join(tmpdir(), FIXTURE_PREFIX + "run-"));
  try {
    // —— 基线：字节缓冲 + sha256 + EOL 词形。
    const baselines = new Map();
    for (const mod of TARGET_MODULES) {
      const buf = readFileSync(join(REPO_ROOT, mod.file));
      baselines.set(mod.file, { buf, sha256: sha256Hex(buf), eol: detectEol(buf.toString("utf8")) });
    }

    // —— 基线绿检验：pristine 树上 scope 全集必须先绿（否则 kill 判定无意义）。
    const allScopeFiles = [...new Set(TARGET_MODULES.flatMap((m) => m.tests))];
    const baselineRun = runVitest({ testFiles: allScopeFiles, runDir, tag: "baseline" });
    const baselineVerdict = classifyVitestRun(baselineRun);
    if (baselineVerdict.outcome !== "survived") {
      fail(`基线 scope 测试未绿（${baselineVerdict.detail}）——先修树再测 mutation`, 2);
    }
    let baselineTestCount = 0;
    if (baselineRun.jsonText !== null) {
      try {
        baselineTestCount = JSON.parse(baselineRun.jsonText).numTotalTests ?? 0;
      } catch {
        baselineTestCount = 0;
      }
    }
    process.stdout.write(
      `[baseline] scope 全集 ${String(allScopeFiles.length)} 文件 ${String(baselineTestCount)} 用例全绿（${String(baselineRun.durationMs)}ms）\n`,
    );

    // —— 逐 mutant：应用（读回验证）→ scoped vitest → 判卷 → finally 恢复 + 哈希复核。
    /** @type {import("./lib/mutation-harness-core.mjs").MutantOutcome[]} */
    const outcomes = [];
    /** @type {{ id: string, file: string, reason: string }[]} 零变更 mutant（定义缺陷，不入分母）。 */
    const invalidMutants = [];
    const kernelSuiteFiles = [`${KERNEL_TESTS_DIR}`];
    for (const mutant of MUTANTS) {
      const modulePath = join(REPO_ROOT, mutant.file);
      const baseline = baselines.get(mutant.file);
      const original = readFileSync(modulePath, "utf8");
      const applied = applyMutantToContent(original, mutant);
      if (!applied.ok) fail(applied.error, 2);
      // —— RT1-A 封条（定义面）：零变更 mutant（old→new 经 EOL 转换后相同）不入
      // 分母——把「装置未生效」记成幸存者会伪造分母并把强度器引向假覆盖缺口。
      if (applied.mutated === original) {
        invalidMutants.push({
          id: mutant.id,
          file: mutant.file,
          reason: "零变更（old→new 经 EOL 转换后相同）——mutant 定义缺陷",
        });
        process.stdout.write(`[mutant] ${mutant.id}: INVALID（零变更，不入分母）\n`);
        continue;
      }
      const startedAt = performance.now();
      try {
        writeFileSync(modulePath, applied.mutated, "utf8");
        // —— RT1-A 封条（应用面）：写后读回必须与预期逐字节一致；静默写失败 /
        // 并发改写不留痕地把 mutant 判成幸存者的通道在此封死。
        if (readFileSync(modulePath, "utf8") !== applied.mutated) {
          fail(`${mutant.id} 应用读回验证失败（写后文件与预期不符——装置不可信）`, 2);
        }
        const scopeTests = TARGET_MODULES.find((m) => m.file === mutant.file).tests;
        const run = runVitest({
          testFiles: scopeTests,
          runDir,
          tag: mutant.id,
        });
        const verdict = classifyVitestRun(run);
        let outcome = {
          id: mutant.id,
          file: mutant.file,
          line: applied.line,
          mutatorName: mutant.mutatorName,
          description: mutant.description,
          killed: verdict.outcome === "killed",
          killedBy: verdict.outcome === "killed" ? "mapped_scope" : null,
          killingTests: verdict.killingTests,
          durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        };
        if (verdict.outcome === "harness_error") {
          fail(`${mutant.id} 判卷输入不可信：${verdict.detail}`, 2);
        }
        // —— 幸存者复核通道：防「scope 收窄假幸存者」。全 kernel 套件（39 文件）
        // 仍幸存才是真幸存者；复核杀死者 killedBy=kernel_recheck 显式留痕。
        if (!outcome.killed) {
          const recheckStart = performance.now();
          const recheck = runVitest({
            testFiles: kernelSuiteFiles,
            runDir,
            tag: `${mutant.id}-recheck`,
          });
          const recheckVerdict = classifyVitestRun(recheck);
          if (recheckVerdict.outcome === "harness_error") {
            fail(`${mutant.id} 复核通道判卷输入不可信：${recheckVerdict.detail}`, 2);
          }
          if (recheckVerdict.outcome === "killed") {
            outcome = {
              ...outcome,
              killed: true,
              killedBy: "kernel_recheck",
              killingTests: recheckVerdict.killingTests,
            };
          }
          outcome.recheckDurationMs = Math.max(0, Math.round(performance.now() - recheckStart));
        }
        outcomes.push(outcome);
        process.stdout.write(
          `[mutant] ${mutant.id}: ${outcome.killed ? `killed（${outcome.killedBy}）` : "survived"} ${String(outcome.durationMs)}ms\n`,
        );
      } finally {
        writeFileSync(modulePath, baseline.buf, "utf8");
        const restoredSha = sha256Hex(readFileSync(modulePath));
        if (restoredSha !== baseline.sha256) {
          fail(`${mutant.file} 恢复后 sha256 与基线不一致（脏树——立即中止）`, 3);
        }
      }
    }

    // —— RT1-A 封条（分母面）：存在 invalid mutant = mutant 库定义缺陷。fail-closed：
    // 不产分数不产 gate record（分母缺员的 score 是伪造的完整测量），逐条列名。
    if (invalidMutants.length > 0) {
      const listing = invalidMutants.map((m) => `${m.id}(${m.reason})`).join("; ");
      fail(
        `mutant 库含 ${invalidMutants.length} 条 invalid 条目（零变更不入分母）——先修 mutant 定义再测量：${listing}`,
        2,
      );
    }

    // —— 收尾完整性：全部目标文件哈希复核 + pristine 树 scope 全集再绿。
    for (const mod of TARGET_MODULES) {
      const buf = readFileSync(join(REPO_ROOT, mod.file));
      if (sha256Hex(buf) !== baselines.get(mod.file).sha256) {
        fail(`收尾哈希复核失败（树不干净）：${mod.file}`, 3);
      }
    }
    const finalRun = runVitest({ testFiles: allScopeFiles, runDir, tag: "final-green" });
    const finalVerdict = classifyVitestRun(finalRun);
    if (finalVerdict.outcome !== "survived") {
      fail(`收尾 scope 全集测试未绿（${finalVerdict.detail}）——树可能残留污染`, 2);
    }

    // —— 重算 + 判卷锚对账 + gate record（GRN 词形）。
    const harnessTotals = recomputeMutationTotals(outcomes);
    const reportText = buildElementsReport(outcomes);
    const parsed = gauntlet.parseStrykerReport(reportText);
    if (parsed === null) fail("合成报告被判卷器判为 malformed（词形破损）", 2);
    const judgeStats = gauntlet.summarizeMutants(parsed.mutants);
    const cross = crosscheckJudgeStats(judgeStats, harnessTotals);
    if (!cross.ok) fail(`harness 算术 × 判卷器对账失配：${cross.mismatches.join("; ")}`, 2);

    const seq = readResultsSeq();
    const totalExternalMs = Math.max(0, Math.round(performance.now() - startedAll));
    const plan = {
      grn: `GRN-${String(seq)}`,
      gate: "MUTATION",
      gateDef: "POLICY.GATE.MUTATION@0.1.0",
      ranAtSeq: seq,
      subjectId: null,
      denominatorRefs: [],
      projectRoot: REPO_ROOT,
      tool: "gauntlet:mutation-kill-harness",
      toolVersion: "0.1.0",
      // 如实标注（B2-4 同款纪律）：本 harness 非 StrykerJS——报告词形复用
      // mutation-testing-elements（判卷锚可消费），dialect 单列 harness 词形不冒充。
      metricDialect: "mutation:harness_changed_code",
      trigger: "on_demand",
      // runner 是报告解析分派词形（gauntlet-lite parseMutationReport 的闭集分派位：
      // stryker→elements json / mutmut→junitxml），非工具身份声明——
      // results.runner_disclosure 承载完整披露（W-1 勘正）。
      runner: "stryker",
      absenceKind: null,
      absentReason: null,
      absentHint: null,
      tier: "HARDENING",
      command:
        "node benchmarks/mutation-kill.mjs（逐 mutant：单点替换 + scope 映射 vitest；幸存者复核=全 kernel 套件）",
      versionProbeCommand: "node --version",
      executable: "node",
      timeoutMs: PER_RUN_TIMEOUT_MS,
      reportPath: "benchmarks/mutation-last-results.json#harness_report",
      changedFiles: TARGET_MODULES.map((m) => m.file),
      thresholds: THRESHOLDS,
      thresholdsProvisional: true,
      expectedToolVersion: null,
    };
    const leg = {
      plan,
      kind: "executed",
      exitCode: 0,
      stdout: `(harness) ${String(MUTANTS.length)} per-mutant scoped vitest runs + ${String(outcomes.filter((o) => o.killedBy === "kernel_recheck").length)} survivor rechecks`,
      stderr: "",
      observedToolVersion: null,
      reportText,
      externalMs: totalExternalMs,
      failureReason: null,
    };
    const record = gauntlet.normalizeMutationLeg(leg, 0);

    // —— gate record 自洽复核（判卷语义对账，防 adapter 误用）。
    const recordSelfCheck = [];
    if (record.counts.applicableScanned !== harnessTotals.generated) {
      recordSelfCheck.push(
        `record.counts.applicableScanned=${String(record.counts.applicableScanned)} ≠ generated=${String(harnessTotals.generated)}`,
      );
    }
    const expectedViolations =
      (harnessTotals.scorePercent < THRESHOLDS.minKillScore ? 1 : 0) +
      (harnessTotals.survived > THRESHOLDS.maxSurvivors ? 1 : 0);
    if (record.counts.violations !== expectedViolations) {
      recordSelfCheck.push(
        `record.counts.violations=${String(record.counts.violations)} ≠ 预期 ${String(expectedViolations)}`,
      );
    }
    if (expectedViolations === 0 && record.verdict !== "passed") {
      recordSelfCheck.push(`record.verdict=${record.verdict} ≠ passed（violations=0）`);
    }
    if (expectedViolations > 0 && record.verdict !== "failed") {
      recordSelfCheck.push(`record.verdict=${record.verdict} ≠ failed（violations=${String(expectedViolations)}）`);
    }
    if (!/^GRN-[0-9]+$/.test(record.grn)) recordSelfCheck.push(`grn 词形非法：${record.grn}`);
    if (recordSelfCheck.length > 0) fail(`gate record 自洽复核失配：${recordSelfCheck.join("; ")}`, 2);

    // —— 入正式账本（Owner 决议 2026-09-01：批准基准轮 gate record 入账）。
    // 自洽复核通过后、results 落盘前执行：入账失败 = exit 2（fail-closed——测量成功
    // 但账本写入失败不能静默绿；results 文件保持上一成功轮原貌，重跑复用同 seq/GRN
    // 重试入账）。同 GRN 重复入账由入账核心显式处理（同内容 already_entered 零写入、
    // 异内容 GRN_CONFLICT 冲突拒绝——kernel A3 存在性防线封死裸覆写，预检为双防线之一）。
    let ledgerOutcome;
    try {
      const kernel = await loadKernelDist();
      ledgerOutcome = await enterGateRecordInStore({ record, storeRoot: REPO_ROOT, kernel });
    } catch (error) {
      const hint = error?.hint ? `；hint: ${error.hint}` : "";
      fail(
        `gate record 入账失败（${error?.code ?? "LEDGER_ENTRY_FAILED"}）：${error?.message ?? String(error)}${hint}`,
        typeof error?.exitCode === "number" ? error.exitCode : 2,
      );
    }
    if (ledgerOutcome.status === "already_entered") {
      process.stdout.write(
        `[ledger] GRN ${record.grn} 已在账（同内容幂等重入——零写入，此前轮次已入账；NO_CHANGE 语义显式披露）\n`,
      );
    } else {
      process.stdout.write(
        `[ledger] GRN ${record.grn} 已入账 → .pomaster/evidence/runs/${record.grn}.json（TX_APPLIED seq=${String(ledgerOutcome.appliedSeq)}${ledgerOutcome.shortCircuited ? "，事务幂等短路" : ""}；账本留本机不入 git）\n`,
      );
    }

    const ok =
      harnessTotals.scorePercent >= THRESHOLDS.minKillScore &&
      harnessTotals.survived <= THRESHOLDS.maxSurvivors;

    const results = {
      schema: RESULTS_SCHEMA,
      seq,
      ok,
      scope: {
        modules: TARGET_MODULES.map((m) => ({
          file: m.file,
          role: m.role,
          sha256_baseline: baselines.get(m.file).sha256,
          mapped_tests: m.tests,
        })),
        mapping_rule:
          "主映射=符号级直接引用该模块导出的测试文件（store.spec.ts 经 store.record_gate_run 传递行使 gate-result 落盘通路，显式列明；tests/golden/golden.spec.ts 经 golden.harness 直调 validateTransition，仅 not-implemented 回落参考镜像）；仓级 integration（tests/integration/*）不在逐 mutant scope（browser/e2e 重量级），幸存者复核通道已用全 kernel 套件兜底",
        scope_note:
          "changed-code scope：逐 mutant 只跑覆盖该模块的测试文件（非全量）；幸存者复跑全 kernel 套件防 scope 收窄假幸存者（killedBy=kernel_recheck 显式留痕）； mutant 两态口径（Killed/Survived，无 timeout/no_coverage）——detected=killed，generated=killed+survived；gate_record.scopeNote 的 runner=stryker 是报告解析分派词形（gauntlet-lite parseMutationReport 按它选择 stryker 报告解析器），非工具身份声明——见 runner_disclosure",
      },
      // —— RT2 封条：合成判卷报告随落盘持久化（plan.reportPath 锚 #harness_report
      // 自此可解析）——at-rest 校验（--verify）重放它即检出手改落盘值。
      harness_report: reportText,
      // —— W-1 勘正：runner 词形如实披露（孤立读 gate_record.scopeNote 不再误导
      // 工具强度；B2-4 能力落差如实标注纪律）。
      runner_disclosure:
        "plan.runner='stryker' 是报告解析分派词形（gauntlet-lite parseMutationReport 按它选择 stryker 报告解析器），非工具身份声明。本 harness 非 StrykerJS：生成者是本仓库 benchmarks/mutation-kill.mjs（手工定向 mutant 库 + scoped vitest 判卷），仅报告词形复用 mutation-testing-elements 供判卷锚消费，能力不冒充 StrykerJS 同强度（无七态 status 词表/test 谱系/per-mutant 覆盖归因）",
      thresholds: {
        ...THRESHOLDS,
        provenance:
          "MUTATION_PROVISIONAL_THRESHOLDS（packages/gauntlet-lite/src/mutation-leg.ts；已经 Owner 决议 2026-09-01 批准转正——A4 阈值包一并批准（原 wave3-plan.md P24 Owner 位））",
      },
      mutants: outcomes,
      totals: {
        generated: harnessTotals.generated,
        killed: harnessTotals.killed,
        survived: harnessTotals.survived,
        detected: harnessTotals.detected,
        recheck_killed: outcomes.filter((o) => o.killedBy === "kernel_recheck").length,
        excluded_equivalent: 0,
      },
      recomputed_score: harnessTotals.scorePercent,
      judge_crosscheck: {
        metric_dialect: record.metricDialect,
        tool: record.tool,
        grn: record.grn,
        verdict: record.verdict,
        counts: record.counts,
        blindspot: record.blindspot,
        scope_note: record.scopeNote,
        items: record.items ?? [],
        matches_harness: cross.ok,
      },
      gate_record: record,
      // —— 入账事实面（Owner 决议 2026-09-01）：store 账本状态镜像（无绝对路径——
      // provenance 可移植纪律；applied_seq 是 store 事务序，与 results seq 相互独立）。
      ledger_entry: {
        status: ledgerOutcome.status,
        store: ".pomaster（仓库根本机治理账本；.gitignore 排除不入 git——保守裁定披露）",
        grn: record.grn,
        ...(ledgerOutcome.appliedSeq !== undefined ? { applied_seq: ledgerOutcome.appliedSeq } : {}),
        ...(ledgerOutcome.shortCircuited !== undefined
          ? { short_circuited: ledgerOutcome.shortCircuited }
          : {}),
      },
      integrity: {
        baseline_scope_green: { files: allScopeFiles.length, tests: baselineTestCount },
        final_scope_green_after_restore: { files: allScopeFiles.length, detail: finalVerdict.detail },
        all_sha256_restored: true,
      },
      durationMs: { total: totalExternalMs },
      note:
        "timestamp 禁入：运行序以 seq 整数标识（自增，append-only）；durationMs 允许。gate_record 已入正式账本（Owner 决议 2026-09-01 批准）：经 applyTransaction record_gate_run 落本仓 .pomaster store（evidence/runs/<GRN>.json + journal TX_APPLIED 锚）；last-results.json 仍是基准报告文件、store 账本是正式治理事实面，两者并存。GRN 词形 GRN-<results seq>（ran_at_seq 同源取 results seq）；GRN 序号空间与 store 事务 seq 相互独立。同 GRN 重复入账显式幂等：同内容 already_entered 零写入、异内容 GRN_CONFLICT fail-closed exit 2（静默双写由双防线封死：kernel A3 守卫 EVIDENCE_ALREADY_EXISTS + canonicalizeOverwrite 显式契约位、CLI 入账预检）。.pomaster 已入 .gitignore（账本留本机不入 git）。落盘结果与账本一致性可校验：node benchmarks/mutation-kill.mjs --verify（重放 harness_report 判卷锚——手改落盘分数/计数/killed 位必被检出——并对账 store 在账状态与 results gate_record 一致）。",
    };
    writeFileSync(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`, "utf8");

    process.stdout.write(
      `[result] kill score=${harnessTotals.scorePercent.toFixed(2)}%（${String(harnessTotals.killed)}/${String(harnessTotals.generated)}），survivors=${String(harnessTotals.survived)}，阈值 score≥${String(THRESHOLDS.minKillScore)}% survivors≤${String(THRESHOLDS.maxSurvivors)} → ${ok ? "OK" : "BELOW THRESHOLD"}\n`,
    );
    process.stdout.write(`[result] 已落盘 ${RESULTS_PATH}（seq=${String(seq)}，gate verdict=${record.verdict}）\n`);
    return ok ? 0 : 1;
  } finally {
    rmSync(runDir, { recursive: true, force: true });
  }
}

// ============================================================
// --verify：落盘结果 at-rest 校验（RT2 封条）+ 账本对账（分层语义）
// ============================================================
// 重放持久化的判卷锚（harness_report → parseStrykerReport → summarizeMutants）
// 与落盘自报（totals / recomputed_score / mutants[] 判卷位 / gate_record / ok）
// 逐项对账——这一层环境无关，任何环境 fail-closed。其后的账本对账层按 store 在座
// 性分层：在座必查 fail-closed / 缺席显式披露跳过。零 vitest 运行、秒级——CI 与
// 本地可高频执行；手改落盘分数在此被检出，不再依赖「有人手动重跑覆盖」。

async function runVerify() {
  const gauntlet = await loadGauntletDist();
  if (!existsSync(RESULTS_PATH)) fail(`results 不在位：${RESULTS_PATH}`, 2);
  let results;
  try {
    results = JSON.parse(readFileSync(RESULTS_PATH, "utf8"));
  } catch (error) {
    fail(`results 不可解析：${String(error)}`, 2);
  }
  const verdict = verifyMutationResults(results, gauntlet);
  if (!verdict.ok) {
    for (const p of verdict.problems) process.stderr.write(`[verify] 校验失配：${p}\n`);
    throw new HarnessExit(
      `落盘结果 at-rest 校验失配（${verdict.problems.length} 处）——文件不可信；重跑 node benchmarks/mutation-kill.mjs 重新测量`,
      1,
    );
  }
  process.stdout.write(
    `[verify] OK——seq=${String(results.seq)} score=${String(results.recomputed_score)}%（${String(results.totals.killed)}/${String(results.totals.generated)}）经判卷锚重放对账一致\n`,
  );

  // —— 账本一致性面（Owner 决议 2026-09-01 + 分层设计修正）：results gate_record ↔
  // store 在账状态。gate_record 词形校验环境无关 fail-closed（lib 内先行）；账本在账
  // 对账分层：store 在座 → 校验 evidence/runs/<GRN>.json 在账 + journal TX_APPLIED 锚
  // 在座 + 与 results gate_record 全量一致（含 applied_seq 精确事件锚），失配走
  // --verify 同款退出码 1（对账失配类）；store 缺席（Owner 决议账本留本机不入 git，
  // fresh clone 属预期形态）→ 显式披露跳过、exit 0——判卷锚重放层已全绿兜底判卷，
  // 跳过必须显式输出禁静默。
  const kernel = await loadKernelDist();
  const ledger = verifyGateRecordInLedger({
    results,
    storeRoot: REPO_ROOT,
    gateResultToSnake: kernel.gateResultToSnake,
  });
  if (ledger.skipped) {
    process.stdout.write(`[verify] ${ledger.disclosure}\n`);
  } else if (!ledger.ok) {
    for (const p of ledger.problems) process.stderr.write(`[verify] 账本对账失配：${p}\n`);
    throw new HarnessExit(
      `账本对账失配（${ledger.problems.length} 处）：results gate_record（GRN ${ledger.grn ?? "?"}）与 .pomaster store 在账状态不一致——重跑 node benchmarks/mutation-kill.mjs 重新测量入账`,
      1,
    );
  } else {
    process.stdout.write(
      `[verify] 账本 OK——GRN ${ledger.grn} 在账（evidence/runs 在座 + journal TX_APPLIED 锚${ledger.anchor.appliedSeq !== null ? `，applied_seq=${String(ledger.anchor.appliedSeq)} 精确匹配` : ""}）与 results.gate_record 全量一致\n`,
    );
  }
}

// ============================================================
// 顶层 runner（finally 清理保证执行后再落退出码）
// ============================================================

const mode = process.argv[2];
try {
  if (mode === "--selfcheck") {
    await runSelfcheck();
    process.exit(0);
  } else if (mode === "--verify") {
    await runVerify();
    process.exit(0);
  } else if (mode === undefined) {
    process.exit(await runMeasurement());
  } else {
    fail(`未知参数：${String(mode)}（用法：node benchmarks/mutation-kill.mjs [--selfcheck|--verify]）`, 2);
  }
} catch (error) {
  if (error instanceof HarnessExit) {
    process.stderr.write(`[mutation-kill] harness error: ${error.message}\n`);
    process.exit(error.exitCode);
  }
  throw error;
}
