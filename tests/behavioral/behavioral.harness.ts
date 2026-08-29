/**
 * behavioral.harness.ts —— L5 Behavioral Eval 数据驱动执行器（契约
 * docs/p9-human-view-and-l5-contract.md §2.2/§2.4，镜像 tests/golden 三件套模式）。
 *
 * 种子账本：./seeds.json（25 注册 / 23 executable / 2 pending；期望在执行器代码评审前
 * 定稿——契约 §2.7.3 预注册纪律，与 corpus 校准回放互不回填）。
 *
 * 双 evaluator 分派（契约 §2.4）：
 * 1. cli_keyword —— bench-0002 已批准 provision 的关键词引擎：@pomaster/cli 的
 *    triageRequest（vitest alias 源码直连，不走 dist/spawn）；
 * 2. rule_v0 —— thread-C §3.2/§7 参考镜像：tests/golden/reference/triage.ts 的
 *    triageRuleV0（kernel 尚无 triage 面；落地后按 golden.harness 同款「kernel 优先、
 *    回落参考」升级，逐 seed 记录 evaluator 来源）。
 *
 * 纪律（镜像 golden.harness.ts）：
 * - 缺席显式：pendingReason 非空 = pending，不计入 executable；禁静默跳过当通过；
 * - absent_signals 机器断言：cli_keyword 全部 executable seed 强制断言 absent_signals
 *   与 TRIAGE_ABSENT_SIGNALS 八项闭表全等（缺席显式化的机器断言）；
 * - 可诊断 diff：判定失败时 detail 携带「期望 vs 实际路由 + 完整输入/结果 JSON」，
 *   不是裸 assert；
 * - 执行器全为纯函数、零墙钟、零 IO（不 spawn CLI dist、不读 MASTer 仓）——同输入
 *   字节级同报告（GOLDEN-L8-1 判据同款）；corpus 对账 loader 独立于执行器纯函数。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TRIAGE_ABSENT_SIGNALS,
  triageRequest,
  type TriageResult as CliTriageResult,
} from "@pomaster/cli";
import {
  PROFILE_LADDER,
  triageRuleV0,
  type ProfileName,
  type TriageDecision,
  type TriageRequestInput,
} from "../golden/reference/triage.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(THIS_DIR, "..", "..");
export const SEEDS_PATH = join(THIS_DIR, "seeds.json");
export const CALIBRATION_DIR = join(REPO_ROOT, "corpus", "master", "batch-1", "calibration");

/** 契约 §2.8.1：executable seeds 下限（fail-below-floor——不足即红）。 */
export const EXECUTABLE_SEED_FLOOR = 15;
/** 契约 §2.5 覆盖矩阵：七族 executable 承诺。C 族 executable=4：T-1 已批准生效（裁决2/bench-0003），
 * 契约 §2.7.2 翻转即验收——原 pending C-04 解除 pending，C-01 期望翻转为 STANDARD（flipped_from 记录翻转前状态）。 */
export const CONTRACT_FAMILY_EXECUTABLE: Readonly<Record<string, number>> = {
  A: 4,
  B: 6,
  C: 4,
  D: 2,
  E: 4,
  F: 1,
  G: 2,
};
/** 契约 §2.4/§2.5：X 族 = capability 路由追加 pending seed（注册于 F 族之后，不占 executable 分母）。 */
export const CAPABILITY_PENDING_SEED_ID = "L5-X-01-capability-router-no-architect-pending";
/** 契约 §2.5：pending 的稳定 id（F-2 churn 信号缺席 / X 追加 capability router；
 * 原 C-4 pending 已随 T-1 批准生效翻转为 executable，见 seeds.json flipped_from）。 */
export const PENDING_SEED_IDS = [
  "L5-F-02-churn-cluster-escalation-pending",
  CAPABILITY_PENDING_SEED_ID,
] as const;
/** 已翻转 seed 的稳定 id（flipped_from 非空；T-1 翻转对 C-01+C-04，authority=裁决2/bench-0003/commit ed947cf）。 */
export const FLIPPED_SEED_IDS = [
  "L5-C-01-replay-R2-008-t1-boundary-anchor",
  "L5-C-04-replay-R2-008-t1-flip-acceptance",
] as const;

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
}

interface SeedsFile {
  readonly suite?: string;
  readonly batch_code?: string;
  readonly seeds?: readonly BehavioralSeed[];
}

export function loadSeeds(): {
  suite: string;
  batchCode: string;
  seeds: readonly BehavioralSeed[];
} {
  const raw: unknown = JSON.parse(readFileSync(SEEDS_PATH, "utf8"));
  const file = raw as SeedsFile;
  if (!Array.isArray(file.seeds)) {
    throw new Error(`seeds.json 形态非法：缺 seeds 数组（${SEEDS_PATH}）`);
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
// 纯检查器（导出供 spec 对机器断言本身做单元验证）
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

export type SeedRunStatus = "passed" | "failed" | "pending";

export interface BehavioralSeedResult {
  readonly id: string;
  readonly family: L5Family;
  readonly evaluator: L5Evaluator;
  readonly status: SeedRunStatus;
  /** passed=命中摘要；failed=可诊断 diff（期望 vs 实际 + 输入/结果 JSON）；pending=缺席原因。 */
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

/** 单 seed 执行：pendingReason 非空 → pending；否则按 evaluator 分派。 */
export function runSeed(seed: BehavioralSeed): BehavioralSeedResult {
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
  readonly evaluatorSummary: {
    readonly cli_keyword: number;
    readonly rule_v0: number;
  };
  readonly familySummary: readonly FamilySummaryEntry[];
  readonly results: readonly BehavioralSeedResult[];
  /** pending 清单（显式缺席，禁静默跳过）。 */
  readonly pendingList: readonly { readonly id: string; readonly reason: string }[];
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
      executable: of.filter((r) => r.status !== "pending").length,
      passed: of.filter((r) => r.status === "passed").length,
      failed: of.filter((r) => r.status === "failed").length,
      pending: of.filter((r) => r.status === "pending").length,
    };
  }).filter((e) => e.registered > 0);
  return {
    suite: "behavioral-l5",
    batch_code: "L5-SEED",
    total: results.length,
    executable: seeds.filter((s) => (s.pendingReason ?? null) === null).length,
    executed: results.filter((r) => r.status !== "pending").length,
    passed: byStatus("passed"),
    failed: byStatus("failed"),
    pending: byStatus("pending"),
    evaluatorSummary: {
      cli_keyword: results.filter(
        (r) => r.status !== "pending" && r.evaluator === "cli_keyword",
      ).length,
      rule_v0: results.filter(
        (r) => r.status !== "pending" && r.evaluator === "rule_v0",
      ).length,
    },
    familySummary,
    results,
    pendingList: results
      .filter((r) => r.status === "pending")
      .map((r) => ({ id: r.id, reason: r.detail })),
  };
}

/** 报告自洽：total = executable + pending = passed + failed + pending；族合计闭环。 */
export function reportIsConsistent(report: BehavioralReport): boolean {
  return (
    report.total === report.executable + report.pending &&
    report.total === report.passed + report.failed + report.pending &&
    report.total === report.executed + report.pending &&
    report.pendingList.length === report.pending &&
    report.results.length === report.total &&
    report.familySummary.reduce((sum, f) => sum + f.registered, 0) === report.total &&
    report.executable === report.passed + report.failed
  );
}

// ============================================================
// corpus 谱系对账 loader（独立于执行器纯函数；读取仓内 batch-1 校准语料）
// ============================================================

export interface ReplayRecord {
  readonly replay_id: string;
  readonly title: string;
  readonly expected_profile: string;
  readonly expected_class: string;
  readonly agreement: string;
  readonly actual: {
    readonly profile: string;
    readonly matched_rule: string;
    readonly evidence_grade: string;
    readonly matched_keywords: readonly string[];
  };
}

interface ReplayResultsFile {
  readonly records?: readonly ReplayRecord[];
}

/** replay-results.json 逐记录（期望锚：回归锚的 actual 以此为准，契约 §2.6）。 */
export function loadReplayRecords(): readonly ReplayRecord[] {
  const raw: unknown = JSON.parse(
    readFileSync(join(CALIBRATION_DIR, "replay-results.json"), "utf8"),
  );
  const file = raw as ReplayResultsFile;
  if (!Array.isArray(file.records)) {
    throw new Error("replay-results.json 形态非法：缺 records 数组");
  }
  return file.records;
}

export interface SampleEntry {
  readonly replay_id: string;
  readonly title: string;
  readonly expected_profile: string;
  readonly expected_class: string;
  readonly source_task_dir: string;
}

interface SamplesFile {
  readonly samples?: readonly SampleEntry[];
}

/** samples.json 逐样本（逐字转录纪律与预注册期望的事实源，契约 §2.6）。 */
export function loadSampleEntries(): readonly SampleEntry[] {
  const raw: unknown = JSON.parse(
    readFileSync(join(CALIBRATION_DIR, "samples.json"), "utf8"),
  );
  const file = raw as SamplesFile;
  if (!Array.isArray(file.samples)) {
    throw new Error("samples.json 形态非法：缺 samples 数组");
  }
  return file.samples;
}

interface ProposedThresholdsFile {
  readonly replay_evidence_base?: {
    readonly results_sha256?: string;
  };
}

/**
 * 现盘 replay-results.json 的 sha256 与 proposed-thresholds.json pin 比对
 * （契约 §2.6：results_sha256 pin；对账本砖测试所锚语料即校准回放批准时的字节集）。
 */
export function replayResultsSha256MatchesPin(): {
  actual: string;
  pin: string;
  match: boolean;
} {
  const bytes = readFileSync(join(CALIBRATION_DIR, "replay-results.json"));
  const actual = createHash("sha256").update(bytes).digest("hex");
  const raw: unknown = JSON.parse(
    readFileSync(join(CALIBRATION_DIR, "proposed-thresholds.json"), "utf8"),
  );
  const pin = String(
    (raw as ProposedThresholdsFile).replay_evidence_base?.results_sha256 ?? "",
  );
  return { actual, pin, match: actual === pin && pin.length > 0 };
}
