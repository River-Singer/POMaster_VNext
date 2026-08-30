/**
 * eval.ts —— `pomaster eval --suite behavioral`：Agent Behavioral Eval 命令面
 * （PRD §44.10）+ 数据驱动执行器本体。
 *
 * 位置史（P17）：执行器纯函数（seeds 装载与结构校验 / 双 evaluator 分派 /
 * 可诊断 diff / 报告汇总）原居 tests/behavioral/behavioral.harness.ts；eval 命令需要
 * 在包内 in-process 执行（dist 可加载，包禁反向依赖 tests/），故上移至本模块。
 * tests/behavioral/behavioral.harness.ts 保留 corpus 谱系对账 loader 与账本常量，
 * 并 re-export 本模块执行器面——单一实现，禁两套 runner 漂移。
 *
 * 双 evaluator 分派（契约 docs/p9-human-view-and-l5-contract.md §2.4）：
 * 1. cli_keyword —— packages/cli/src/triage.ts 的 triageRequest（关键词引擎）；
 * 2. rule_v0 —— ./triage-rule-v0.js 的 triageRuleV0（thread-C §3.2/§7 参考镜像）。
 *
 * fail-closed 纪律：
 * - --suite 词表闭包（EVAL_SUITES）外显式拒绝（EVAL_SUITE_UNKNOWN，词表呈现于 hint）；
 * - executable seed 任何失败 → ok=false exit 1（EVAL_EXECUTABLE_FAILED）；
 * - pending seed 显式缺席呈现（报告 pendingList 逐条 + 人读行）——不冒充绿、也不计失败；
 * - retired seed 显式退役呈现（报告 retiredList 逐条 + 人读行；P17-Seeds 处置形态）——
 *   不计 executable、不计 pending、不执行判定；retired 与 pendingReason/expect_flip_when
 *   互斥由结构校验 fail-closed（缺席显式第三态，禁静默 pending 滞留）；
 * - seeds 缺失/坏形显式报错（SEEDS_NOT_AVAILABLE / SEEDS_INVALID），禁静默空跑；
 * - 报告自洽守卫（EVAL_REPORT_INCONSISTENT）——执行器自身被改坏时拒绝判卷。
 * 幂等：纯函数 + 零墙钟——同 seeds 字节级同报告（GOLDEN-L8-1 判据同款）。
 *
 * TODO(vocab-pr)：suite 词形 behavioral 为本命令局部词轴（词源 PRD §44.10/§94），
 * 词轴收编前禁止私扩值；词表扩容须同步 tests/behavioral/trigger-manifest.json suites。
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { TRIAGE_ABSENT_SIGNALS, triageRequest, type TriageResult as CliTriageResult } from "./triage.js";
import {
  PROFILE_LADDER,
  triageRuleV0,
  type ProfileName,
  type TriageDecision,
  type TriageRequestInput,
} from "./triage-rule-v0.js";

// ============================================================
// suite 词表（闭包；词表外显式拒绝）
// ============================================================

/** eval suite 闭包词表（--suite 校验分母；扩容须同步 trigger-manifest.json suites）。 */
export const EVAL_SUITES = ["behavioral"] as const;
export type EvalSuite = (typeof EVAL_SUITES)[number];

/** seeds.json 缺省定位（src 与 dist 同构：packages/cli/{src,dist}/eval.js → 仓库根 tests/）。 */
export const BEHAVIORAL_SEEDS_PATH = fileURLToPath(
  new URL("../../../tests/behavioral/seeds.json", import.meta.url),
);

// ============================================================
// 种子形态（seeds.json，契约 §2.3）
// ============================================================

export const L5_FAMILIES = ["A", "B", "C", "D", "E", "F", "G", "X"] as const;
export type L5Family = (typeof L5_FAMILIES)[number];
export const L5_EVALUATORS = ["cli_keyword", "rule_v0"] as const;
export type L5Evaluator = (typeof L5_EVALUATORS)[number];

export interface SeedProvenance {
  /** corpus 事实源路径（仓库内相对路径；全部 seed 必填非空——契约 §2.8.3）。 */
  readonly corpus: string;
  /** 登记文件键路径 / 章节锚（可选，谱系辅锚）。 */
  readonly anchor?: string;
  /** 校准回放 id（可选主锚，replay-round2 纪律：主锚 replay_id、行号路径辅锚）。 */
  readonly replay_id?: string;
  /** MASTer 源任务目录（源标识符，非墙钟字段；可选）。 */
  readonly source_task_dir?: string;
  readonly note_md: string;
}

/** 簇请求集成员（F 族多请求形态；request 逐字转录纪律同单请求 seed）。 */
export interface ReplayAnchoredRequest {
  readonly replay_id: string;
  readonly request: string;
}

/** input.request 三形态：cli_keyword 单请求文本 / rule_v0 信号集对象；簇形态走 input.requests。 */
export type SeedRequest = string | TriageRequestInput;

export interface SeedInput {
  readonly request?: SeedRequest;
  readonly requests?: readonly ReplayAnchoredRequest[];
}

/** cli_keyword 断言集（契约 §2.4：profile/matched_rule/evidence_grade 逐字 + keywords contains + absent 全等）。 */
export interface CliKeywordExpect {
  readonly profile?: string;
  readonly matched_rule?: string;
  readonly evidence_grade?: string;
  readonly matched_keywords_contains?: readonly string[];
  readonly matched_keywords_equals?: readonly string[];
}

/** rule_v0 断言集（契约 §2.4：门集裁定保守口径——以 triggerHits 为门集前驱代理）。 */
export interface RuleV0Expect {
  readonly outcome?: "TRIAGED" | "NO_CHANGE";
  readonly effectiveProfile?: ProfileName | null;
  readonly effectiveProfileAtLeast?: ProfileName;
  readonly triggerHitsContains?: readonly string[];
  readonly fastPathHit?: string | null;
  readonly fastLane?: boolean;
  readonly floorApplied?: string | null;
  readonly overrideBelowFloorRejected?: boolean;
  readonly overrideOverpoweredByEscalation?: boolean;
  readonly notApplicableRulesContains?: readonly string[];
}

export type SeedExpect = CliKeywordExpect | RuleV0Expect;

/** 设计期望档元数据（契约 §2.7.1：已知偏离样本钉实际值，设计期望转录 samples.json 预注册字段）。 */
export interface DesignExpected {
  readonly expected_profile: string;
  readonly expected_class: string;
}

export interface BehavioralSeed {
  readonly id: string;
  readonly family: L5Family;
  readonly title: string;
  readonly evaluator: L5Evaluator;
  readonly provenance: SeedProvenance;
  readonly input: SeedInput;
  readonly expect: SeedExpect;
  readonly design_expected: DesignExpected | null;
  /** 翻转前状态（契约 §2.7.2 翻转即验收）：TRIAGE profile 词形 = 翻转前回归锚值（须与
   * replay 实测一致，谱系连续性机器校验）；"PENDING" = 翻转前为 pending 登记；null = 未翻转。 */
  readonly flipped_from?: string | null;
  /** 翻转注册（契约 §2.7.2）：非空 = 本 seed 期望在所述信号/阈值落地时翻转（翻转即验收测试）。 */
  readonly expect_flip_when: string | null;
  /** 非空 = pending，不计入 executable（缺席显式，禁静默跳过）。 */
  readonly pendingReason: string | null;
  /** 非空 = 显式退役（P17-Seeds 处置形态）：登记与谱系保留、执行与翻转路径关闭——
   * 不计 executable、不计 pending、不执行判定；与 pendingReason、expect_flip_when 互斥。 */
  readonly retired?: { readonly reason_md: string } | null;
}

interface SeedsFile {
  readonly suite?: string;
  readonly batch_code?: string;
  readonly seeds?: readonly BehavioralSeed[];
}

export function loadSeeds(seedsPath: string = BEHAVIORAL_SEEDS_PATH): {
  suite: string;
  batchCode: string;
  seeds: readonly BehavioralSeed[];
} {
  const raw: unknown = JSON.parse(readFileSync(seedsPath, "utf8"));
  const file = raw as SeedsFile;
  if (!Array.isArray(file.seeds)) {
    throw new Error(`seeds.json 形态非法：缺 seeds 数组（${seedsPath}）`);
  }
  // 结构纪律 fail-closed（镜像 golden verdict 词表校验的元纪律位，账本级硬校验）。
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of file.seeds) {
    if (typeof s.id !== "string" || s.id.length === 0) {
      problems.push(`seed 缺 id：${JSON.stringify(s).slice(0, 80)}`);
      continue;
    }
    if (seen.has(s.id)) problems.push(`${s.id}: id 重复`);
    seen.add(s.id);
    if (!(L5_FAMILIES as readonly string[]).includes(s.family)) {
      problems.push(`${s.id}: family "${String(s.family)}" 不在 L5_FAMILIES 词表`);
    }
    if (!(L5_EVALUATORS as readonly string[]).includes(s.evaluator)) {
      problems.push(`${s.id}: evaluator "${String(s.evaluator)}" 不在 L5_EVALUATORS 词表`);
    }
    if (
      s.provenance === undefined ||
      typeof s.provenance.corpus !== "string" ||
      s.provenance.corpus.length === 0
    ) {
      problems.push(`${s.id}: provenance.corpus 缺失（全部 seed 必须有 corpus provenance）`);
    }
    if (
      s.provenance === undefined ||
      typeof s.provenance.note_md !== "string" ||
      s.provenance.note_md.length === 0
    ) {
      problems.push(`${s.id}: provenance.note_md 缺失`);
    }
    if (
      s.pendingReason !== null &&
      s.pendingReason !== undefined &&
      typeof s.pendingReason !== "string"
    ) {
      problems.push(`${s.id}: pendingReason 非法类型`);
    }
    if (s.retired !== undefined && s.retired !== null) {
      const r = s.retired as { reason_md?: unknown };
      if (typeof r !== "object" || r === null || typeof r.reason_md !== "string" || r.reason_md.length === 0) {
        problems.push(`${s.id}: retired.reason_md 缺失或为空（退役判据必须落档，禁静默退役）`);
      }
      if (s.pendingReason !== null && s.pendingReason !== undefined) {
        problems.push(`${s.id}: retired 与 pendingReason 互斥（一条 seed 不能既 pending 又 retired）`);
      }
      if (s.expect_flip_when !== null && s.expect_flip_when !== undefined) {
        problems.push(`${s.id}: retired 与 expect_flip_when 互斥（退役即关闭翻转注册）`);
      }
    }
    if (s.expect === undefined || typeof s.expect !== "object" || s.expect === null) {
      problems.push(`${s.id}: expect 缺失或非对象`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`seeds.json 结构纪律违反（fail-closed）：\n- ${problems.join("\n- ")}`);
  }
  return {
    suite: file.suite ?? "behavioral-l5",
    batchCode: file.batch_code ?? "L5-SEED",
    seeds: file.seeds,
  };
}

// ============================================================
// 纯检查器（导出供 vitest 侧对机器断言本身做单元验证）
// ============================================================

/**
 * cli_keyword 结果检查（含 absent_signals 闭表全等机器断言——对每个 cli_keyword
 * executable seed 强制，不受 expect 是否声明影响）。
 */
export function checkCliKeywordResult(
  label: string,
  result: CliTriageResult,
  expect: CliKeywordExpect,
): string[] {
  const problems: string[] = [];
  if (JSON.stringify(result.absent_signals) !== JSON.stringify(TRIAGE_ABSENT_SIGNALS)) {
    problems.push(
      `${label}: absent_signals 应全等 TRIAGE_ABSENT_SIGNALS 八项闭表（缺席显式化机器断言），实际 ${JSON.stringify(result.absent_signals)}`,
    );
  }
  if (expect.profile !== undefined && result.profile !== expect.profile) {
    problems.push(`${label}: 期望 profile=${expect.profile}，实际 ${result.profile}`);
  }
  if (expect.matched_rule !== undefined && result.matched_rule !== expect.matched_rule) {
    problems.push(
      `${label}: 期望 matched_rule=${expect.matched_rule}，实际 ${result.matched_rule}`,
    );
  }
  if (
    expect.evidence_grade !== undefined &&
    result.evidence_grade !== expect.evidence_grade
  ) {
    problems.push(
      `${label}: 期望 evidence_grade=${expect.evidence_grade}，实际 ${result.evidence_grade}`,
    );
  }
  for (const kw of expect.matched_keywords_contains ?? []) {
    if (!result.matched_keywords.includes(kw)) {
      problems.push(
        `${label}: matched_keywords 应含 "${kw}"，实际 ${JSON.stringify(result.matched_keywords)}`,
      );
    }
  }
  if (
    expect.matched_keywords_equals !== undefined &&
    JSON.stringify(result.matched_keywords) !==
      JSON.stringify(expect.matched_keywords_equals)
  ) {
    problems.push(
      `${label}: matched_keywords 应全等 ${JSON.stringify(expect.matched_keywords_equals)}，实际 ${JSON.stringify(result.matched_keywords)}`,
    );
  }
  return problems;
}

function profileRank(p: ProfileName): number {
  return PROFILE_LADDER.indexOf(p);
}

/** rule_v0 决策检查（triggerHits = 门集前驱代理断言，契约 §2.4 保守口径）。 */
export function checkRuleV0Decision(
  label: string,
  decision: TriageDecision,
  expect: RuleV0Expect,
): string[] {
  const problems: string[] = [];
  if (expect.outcome !== undefined && decision.outcome !== expect.outcome) {
    problems.push(`${label}: 期望 outcome=${expect.outcome}，实际 ${decision.outcome}`);
  }
  if (
    expect.effectiveProfile !== undefined &&
    decision.effectiveProfile !== expect.effectiveProfile
  ) {
    problems.push(
      `${label}: 期望 effectiveProfile=${String(expect.effectiveProfile)}，实际 ${String(decision.effectiveProfile)}`,
    );
  }
  if (expect.effectiveProfileAtLeast !== undefined) {
    const actual = decision.effectiveProfile;
    if (actual === null || profileRank(actual) < profileRank(expect.effectiveProfileAtLeast)) {
      problems.push(
        `${label}: effectiveProfile 应 ≥ ${expect.effectiveProfileAtLeast}，实际 ${String(actual)}`,
      );
    }
  }
  for (const t of expect.triggerHitsContains ?? []) {
    if (!decision.triggerHits.includes(t)) {
      problems.push(
        `${label}: triggerHits 应含 ${t}，实际 [${decision.triggerHits.join(",")}]`,
      );
    }
  }
  if (expect.fastPathHit !== undefined && decision.fastPathHit !== expect.fastPathHit) {
    problems.push(
      `${label}: 期望 fastPathHit=${String(expect.fastPathHit)}，实际 ${String(decision.fastPathHit)}`,
    );
  }
  if (expect.fastLane !== undefined && decision.fastLane !== expect.fastLane) {
    problems.push(
      `${label}: 期望 fastLane=${String(expect.fastLane)}，实际 ${String(decision.fastLane)}`,
    );
  }
  if (expect.floorApplied !== undefined && decision.floorApplied !== expect.floorApplied) {
    problems.push(
      `${label}: 期望 floorApplied=${String(expect.floorApplied)}，实际 ${String(decision.floorApplied)}`,
    );
  }
  if (
    expect.overrideBelowFloorRejected !== undefined &&
    decision.overrideBelowFloorRejected !== expect.overrideBelowFloorRejected
  ) {
    problems.push(
      `${label}: 期望 overrideBelowFloorRejected=${String(expect.overrideBelowFloorRejected)}，实际 ${String(decision.overrideBelowFloorRejected)}`,
    );
  }
  if (
    expect.overrideOverpoweredByEscalation !== undefined &&
    decision.overrideOverpoweredByEscalation !== expect.overrideOverpoweredByEscalation
  ) {
    problems.push(
      `${label}: 期望 overrideOverpoweredByEscalation=${String(expect.overrideOverpoweredByEscalation)}，实际 ${String(decision.overrideOverpoweredByEscalation)}`,
    );
  }
  for (const r of expect.notApplicableRulesContains ?? []) {
    if (!decision.blindspots.notApplicableRules.includes(r)) {
      problems.push(
        `${label}: blindspots.notApplicableRules 应含 ${r}，实际 [${decision.blindspots.notApplicableRules.join(",")}]`,
      );
    }
  }
  return problems;
}

// ============================================================
// 执行器（按 evaluator 分派；零 IO 零墙钟）
// ============================================================

export type SeedRunStatus = "passed" | "failed" | "pending" | "retired";

export interface BehavioralSeedResult {
  readonly id: string;
  readonly family: L5Family;
  readonly evaluator: L5Evaluator;
  readonly status: SeedRunStatus;
  /** passed=命中摘要；failed=可诊断 diff（期望 vs 实际 + 输入/结果 JSON）；pending=缺席原因；retired=退役判据。 */
  readonly detail: string;
}

function seedFailed(
  seed: BehavioralSeed,
  problems: readonly string[],
  actualDump: string,
): BehavioralSeedResult {
  return {
    id: seed.id,
    family: seed.family,
    evaluator: seed.evaluator,
    status: "failed",
    // 可诊断 diff：期望 vs 实际路由 + 完整实际结果（契约任务书要求，非裸 assert）。
    detail: `${problems.join("；")}｜实际 ${actualDump}`,
  };
}

function seedPassed(seed: BehavioralSeed, summary: string): BehavioralSeedResult {
  return {
    id: seed.id,
    family: seed.family,
    evaluator: seed.evaluator,
    status: "passed",
    detail: summary,
  };
}

function isTriageRequestInput(v: SeedRequest | undefined): v is TriageRequestInput {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 单 seed 执行：retired 非空 → retired；pendingReason 非空 → pending；否则按 evaluator 分派。 */
export function runSeed(seed: BehavioralSeed): BehavioralSeedResult {
  const retired = seed.retired ?? null;
  if (retired !== null) {
    if (typeof retired.reason_md !== "string" || retired.reason_md.length === 0) {
      return seedFailed(
        seed,
        ["retired seed 的 reason_md 为空——退役判据必须落档（禁静默退役）"],
        "",
      );
    }
    return {
      id: seed.id,
      family: seed.family,
      evaluator: seed.evaluator,
      status: "retired",
      detail: retired.reason_md,
    };
  }
  const pendingReason = seed.pendingReason ?? null;
  if (pendingReason !== null) {
    if (pendingReason.length === 0) {
      return seedFailed(
        seed,
        ["pending seed 的 pendingReason 为空——缺席必须显式表达（禁静默跳过）"],
        "",
      );
    }
    return {
      id: seed.id,
      family: seed.family,
      evaluator: seed.evaluator,
      status: "pending",
      detail: pendingReason,
    };
  }
  if (seed.evaluator === "cli_keyword") return runCliKeywordSeed(seed);
  return runRuleV0Seed(seed);
}

function runCliKeywordSeed(seed: BehavioralSeed): BehavioralSeedResult {
  const expect = seed.expect as CliKeywordExpect;
  const requests: readonly ReplayAnchoredRequest[] =
    seed.input.requests ??
    (typeof seed.input.request === "string"
      ? [
          {
            replay_id: seed.provenance.replay_id ?? "",
            request: seed.input.request,
          },
        ]
      : []);
  if (requests.length === 0) {
    return seedFailed(
      seed,
      ["cli_keyword seed 缺可执行请求（input.request 文本或 input.requests 簇）"],
      "",
    );
  }
  const runs = requests.map((r) => {
    const label = `${seed.id}[${r.replay_id === "" ? "probe" : r.replay_id}]`;
    return { label, request: r.request, result: triageRequest(r.request) };
  });
  const problems: string[] = [];
  for (const run of runs) {
    problems.push(...checkCliKeywordResult(run.label, run.result, expect));
  }
  if (problems.length > 0) {
    return seedFailed(
      seed,
      problems,
      runs
        .map(
          (r) =>
            `${r.label}: input=${JSON.stringify(r.request)} → ${JSON.stringify(r.result)}`,
        )
        .join("；"),
    );
  }
  return seedPassed(
    seed,
    runs
      .map(
        (r) =>
          `${r.label}: profile=${r.result.profile} rule=${r.result.matched_rule} grade=${r.result.evidence_grade} keywords=${JSON.stringify(r.result.matched_keywords)}`,
      )
      .join("；"),
  );
}

function runRuleV0Seed(seed: BehavioralSeed): BehavioralSeedResult {
  const expect = seed.expect as RuleV0Expect;
  if (!isTriageRequestInput(seed.input.request)) {
    return seedFailed(
      seed,
      ["rule_v0 seed 的 input.request 必须是 TriageRequestInput 信号集对象"],
      `input=${JSON.stringify(seed.input.request ?? null)}`,
    );
  }
  const decision = triageRuleV0(seed.input.request);
  const problems = checkRuleV0Decision(`${seed.id}`, decision, expect);
  if (problems.length > 0) {
    return seedFailed(
      seed,
      problems,
      `input=${JSON.stringify(seed.input.request)} → decision=${JSON.stringify(decision)}`,
    );
  }
  return seedPassed(
    seed,
    `outcome=${decision.outcome} effective=${String(decision.effectiveProfile)} hits=[${decision.triggerHits.join(",")}] fastPath=${String(decision.fastPathHit)} fastLane=${String(decision.fastLane)}`,
  );
}

// ============================================================
// 报告（镜像 golden-report.json 字段形态；零墙钟，可字节级重放）
// ============================================================

export interface FamilySummaryEntry {
  readonly family: L5Family;
  readonly registered: number;
  readonly executable: number;
  readonly passed: number;
  readonly failed: number;
  readonly pending: number;
  readonly retired: number;
}

export interface BehavioralReport {
  readonly suite: string;
  readonly batch_code: string;
  readonly total: number;
  readonly executable: number;
  readonly executed: number;
  readonly passed: number;
  readonly failed: number;
  readonly pending: number;
  readonly retired: number;
  readonly evaluatorSummary: {
    readonly cli_keyword: number;
    readonly rule_v0: number;
  };
  readonly familySummary: readonly FamilySummaryEntry[];
  readonly results: readonly BehavioralSeedResult[];
  /** pending 清单（显式缺席，禁静默跳过）。 */
  readonly pendingList: readonly { readonly id: string; readonly reason: string }[];
  /** retired 清单（显式退役，P17-Seeds 处置形态；禁静默 pending 滞留）。 */
  readonly retiredList: readonly { readonly id: string; readonly reason: string }[];
}

/** 全量执行并汇总（幂等：可重复调用字节级同结果）。 */
export function runAllSeeds(seeds: readonly BehavioralSeed[]): BehavioralReport {
  const results = seeds.map((s) => runSeed(s));
  const byStatus = (s: SeedRunStatus): number =>
    results.filter((r) => r.status === s).length;
  const familySummary = L5_FAMILIES.map((family) => {
    const of = results.filter((r) => r.family === family);
    return {
      family,
      registered: of.length,
      executable: of.filter((r) => r.status !== "pending" && r.status !== "retired").length,
      passed: of.filter((r) => r.status === "passed").length,
      failed: of.filter((r) => r.status === "failed").length,
      pending: of.filter((r) => r.status === "pending").length,
      retired: of.filter((r) => r.status === "retired").length,
    };
  }).filter((e) => e.registered > 0);
  const retiredList = results
    .filter((r) => r.status === "retired")
    .map((r) => ({ id: r.id, reason: r.detail }));
  return {
    suite: "behavioral-l5",
    batch_code: "L5-SEED",
    total: results.length,
    executable: seeds.filter(
      (s) => (s.pendingReason ?? null) === null && (s.retired ?? null) === null,
    ).length,
    executed: results.filter((r) => r.status !== "pending" && r.status !== "retired").length,
    passed: byStatus("passed"),
    failed: byStatus("failed"),
    pending: byStatus("pending"),
    retired: byStatus("retired"),
    evaluatorSummary: {
      cli_keyword: results.filter(
        (r) => r.status !== "pending" && r.status !== "retired" && r.evaluator === "cli_keyword",
      ).length,
      rule_v0: results.filter(
        (r) => r.status !== "pending" && r.status !== "retired" && r.evaluator === "rule_v0",
      ).length,
    },
    familySummary,
    results,
    pendingList: results
      .filter((r) => r.status === "pending")
      .map((r) => ({ id: r.id, reason: r.detail })),
    retiredList,
  };
}

/** 报告自洽：total = executable + pending + retired = passed + failed + pending + retired；族合计闭环。 */
export function reportIsConsistent(report: BehavioralReport): boolean {
  return (
    report.total === report.executable + report.pending + report.retired &&
    report.total === report.passed + report.failed + report.pending + report.retired &&
    report.total === report.executed + report.pending + report.retired &&
    report.pendingList.length === report.pending &&
    report.retiredList.length === report.retired &&
    report.results.length === report.total &&
    report.familySummary.reduce((sum, f) => sum + f.registered, 0) === report.total &&
    report.executable === report.passed + report.failed
  );
}

// ============================================================
// 命令面（PRD §44.10：pomaster eval --suite behavioral）
// ============================================================

export interface EvalInput {
  /** suite 名（EVAL_SUITES 词表校验；词表外 EVAL_SUITE_UNKNOWN fail-closed）。 */
  readonly suite: string;
  /** 注入 seeds.json 路径（测试/嵌入面；缺省 = 仓库 tests/behavioral/seeds.json）。 */
  readonly seedsPath?: string;
}

export interface EvalResult {
  readonly suite: string;
  /** seeds 账本出处（注入或缺省定位；装载失败时为空串）。 */
  readonly seeds_path: string;
  readonly report: BehavioralReport;
}

/** 装载失败路径的零报告（failOutcome 的 result 形态稳定性：字段齐备、计数诚实为零）。 */
function zeroReport(): BehavioralReport {
  return {
    suite: "",
    batch_code: "",
    total: 0,
    executable: 0,
    executed: 0,
    passed: 0,
    failed: 0,
    pending: 0,
    retired: 0,
    evaluatorSummary: { cli_keyword: 0, rule_v0: 0 },
    familySummary: [],
    results: [],
    pendingList: [],
    retiredList: [],
  };
}

export async function runEval(input: EvalInput): Promise<CommandOutcome<EvalResult>> {
  const command = "eval";
  if (!(EVAL_SUITES as readonly string[]).includes(input.suite)) {
    return failOutcome<EvalResult>(
      command,
      { suite: input.suite, seeds_path: "", report: zeroReport() },
      [
        {
          code: "EVAL_SUITE_UNKNOWN",
          message: `--suite "${input.suite}" 不在 eval suite 词表（闭包：${EVAL_SUITES.join(" / ")}）`,
          hint: "suite 名取词表闭包（现为 behavioral）；扩容须同步 EVAL_SUITES 与 tests/behavioral/trigger-manifest.json suites（词表纪律，禁 argv 侧静默放宽）。",
        },
      ],
      [`eval: FAILED — EVAL_SUITE_UNKNOWN（${input.suite}）`],
    );
  }

  const seedsPath = input.seedsPath ?? BEHAVIORAL_SEEDS_PATH;
  if (!existsSync(seedsPath)) {
    return failOutcome<EvalResult>(
      command,
      { suite: input.suite, seeds_path: seedsPath, report: zeroReport() },
      [
        {
          code: "SEEDS_NOT_AVAILABLE",
          message: `seeds.json 未找到（${seedsPath}）`,
          hint: "seeds 账本是仓库资产（tests/behavioral/seeds.json）：在仓库内运行，或用测试/嵌入方注入 seedsPath。",
        },
      ],
      [`eval: FAILED — SEEDS_NOT_AVAILABLE（${seedsPath}）`],
    );
  }

  let loaded: ReturnType<typeof loadSeeds>;
  try {
    loaded = loadSeeds(seedsPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failOutcome<EvalResult>(
      command,
      { suite: input.suite, seeds_path: seedsPath, report: zeroReport() },
      [
        {
          code: "SEEDS_INVALID",
          message,
          hint: "seeds 账本结构纪律见契约 docs/p9-human-view-and-l5-contract.md §2.3（缺 id/family/evaluator 词表外/provenance 缺失均 fail-closed）；修正账本而非放宽校验。",
        },
      ],
      [`eval: FAILED — SEEDS_INVALID\n  ${message.split("\n").join("\n  ")}`],
    );
  }

  const report = runAllSeeds(loaded.seeds);
  if (!reportIsConsistent(report)) {
    return failOutcome<EvalResult>(
      command,
      { suite: input.suite, seeds_path: seedsPath, report },
      [
        {
          code: "EVAL_REPORT_INCONSISTENT",
          message:
            `报告自洽破坏：total=${report.total} executable=${report.executable} pending=${report.pending} passed=${report.passed} failed=${report.failed}`,
          hint: "执行器被改坏时拒绝判卷（fail-closed）：检查 runAllSeeds/reportIsConsistent（@pomaster/cli eval 模块）。",
        },
      ],
      ["eval: FAILED — EVAL_REPORT_INCONSISTENT"],
    );
  }

  const human = [
    `eval: ${report.passed} passed / ${report.failed} failed / ${report.pending} pending（suite ${input.suite}；seeds 注册 ${report.total}，executable ${report.executable}，retired ${report.retired}）`,
    `  evaluators: cli_keyword=${report.evaluatorSummary.cli_keyword} rule_v0=${report.evaluatorSummary.rule_v0}`,
    ...report.pendingList.map((p) => `  pending（显式缺席，不冒充绿）: ${p.id} — ${p.reason}`),
    ...report.retiredList.map((r) => `  retired（显式退役，不冒充绿也不滞留 pending）: ${r.id} — ${r.reason}`),
  ];
  if (report.failed > 0) {
    const failedIds = report.results
      .filter((r) => r.status === "failed")
      .map((r) => r.id);
    return failOutcome(
      command,
      { suite: input.suite, seeds_path: seedsPath, report },
      [
        {
          code: "EVAL_EXECUTABLE_FAILED",
          message: `executable seed 失败 ${report.failed} 条：${failedIds.join(", ")}`,
          hint: "可诊断 diff 见 --json result.report.results[].detail（期望 vs 实际路由 + 完整输入/结果 JSON）；pending 与失败是两种状态，禁把 pending 当失败修，更禁把失败标 pending。",
        },
      ],
      [
        ...human,
        ...report.results
          .filter((r) => r.status === "failed")
          .map((r) => `  FAILED ${r.id}: ${r.detail}`),
      ],
    );
  }
  return okOutcome(command, { suite: input.suite, seeds_path: seedsPath, report }, human);
}
