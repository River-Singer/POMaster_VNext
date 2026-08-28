/**
 * golden.harness.ts —— Golden P0 用例数据驱动执行器。
 *
 * 用例账本：./cases.json（首批 20 条 P0，转写自 packages/schemas/assets/golden-seed-mapping.md）。
 * 执行面（本批三类可执行判定）：
 * 1. kernel 转移校验 —— 委托 @pomaster/kernel validateTransition；未实现（scaffold
 *    throw "not-implemented"）时回落 tests/golden/reference/transition.ts 参考镜像；
 * 2. id 解析 —— 委托 parseGovernedId/resolveAlias；未实现时回落 reference/governed-id.ts；
 * 3. triage 规则桶 —— kernel 尚无 triage 面，直接走 reference/triage.ts（rule_v0 P0 子集，
 *    镜像 design-thread-C §3.2/§7）。
 *
 * 纪律：
 * - 不可执行项必须携带非空 pendingReason（cases.json 转写时显式给出）——缺席显式表达，
 *   禁止静默跳过当通过；pending 计数进报告并输出 pendingList；
 * - expected.verdict / verdictAlternatives 只允许 03-gate-result 七态词形逐字
 *   （VERDICT_VALUES 元校验）；
 * - 执行器先 kernel 后参考镜像，逐用例记录 evaluator（kernel 落地后 golden 自动升级为
 *   kernel 契约测试）；
 * - 幂等（A4）：执行器全为纯函数、零墙钟——报告可字节级重放。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIFECYCLE_VALUES,
  VERDICT_VALUES,
  type LifecycleValue,
  type VerdictValue,
} from "@pomaster/schemas";
import {
  GovernedIdParseError,
  parseGovernedId,
  resolveAlias,
  validateTransition,
} from "@pomaster/kernel";
import {
  parseGovernedIdReference,
  resolveAliasReference,
  type AliasResolutionLike,
  type ParseResult,
} from "./reference/governed-id.js";
import {
  validateTransitionReference,
  type TransitionOutcomeLike,
} from "./reference/transition.js";
import {
  PROFILE_LADDER,
  triageRuleV0,
  type ProfileName,
  type TriageDecision,
  type TriageRequestInput,
} from "./reference/triage.js";

// ============================================================
// 用例形态（cases.json）
// ============================================================

export const GOLDEN_CASES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "cases.json",
);

export interface GoldenCaseTrace {
  readonly source: string;
  readonly decisions: readonly string[];
  readonly evidence: string;
  readonly breaks: string;
}

export interface GoldenCaseExpected {
  /** 03-gate-result definitions.verdict 七态逐字；非 gate 平面用例为 null。 */
  readonly verdict: VerdictValue | null;
  readonly verdictAlternatives?: readonly VerdictValue[];
  readonly outcome?: Readonly<Record<string, unknown>> | null;
  /** §0 判决维度词（FATAL/NO_CHANGE/字节全等等，非七态）照录位。 */
  readonly outcomeWords?: readonly string[];
  readonly note: string;
}

export interface TransitionExecutable {
  readonly kind: "transition";
  readonly attempts: readonly { readonly from: string; readonly to: string }[];
  readonly expectAll: "rejected" | "allowed";
}

export interface IdParseExecutable {
  readonly kind: "id-parse";
  readonly id: string;
  readonly expectParse: "ok" | "fatal";
  readonly expectReason?: "unknown_prefix" | "grammar";
  readonly expectPrefix?: string;
}

export interface AliasMapping {
  readonly legacy: string;
  readonly expectedCanonical: string;
  readonly rule: string;
  readonly mechanical: boolean;
}

export interface AliasExecutable {
  readonly kind: "alias";
  readonly mappings: readonly AliasMapping[];
}

export interface TriageExpectation {
  readonly effectiveProfile?: ProfileName;
  readonly effectiveProfileAtLeast?: ProfileName;
  readonly triggerHitsContains?: string;
  readonly floorApplied?: string | null;
  readonly overrideBelowFloorRejected?: boolean;
  readonly overrideOverpoweredByEscalation?: boolean;
}

export interface TriageExecutable {
  readonly kind: "triage";
  readonly request: TriageRequestInput;
  readonly expect: TriageExpectation;
}

export type GoldenCaseExecutable =
  | TransitionExecutable
  | IdParseExecutable
  | AliasExecutable
  | TriageExecutable;

export interface GoldenCase {
  readonly id: string;
  readonly group: string;
  readonly category: string;
  readonly p0: boolean;
  readonly title: string;
  readonly input: { readonly described: string } & Readonly<
    Record<string, unknown>
  >;
  readonly expected: GoldenCaseExpected;
  readonly trace: GoldenCaseTrace;
  readonly executable: GoldenCaseExecutable | null;
  /** 不可执行项的显式缺席原因（非空=本批 pending）。 */
  readonly pendingReason: string | null;
}

interface CasesFile {
  readonly suite: string;
  readonly cases: readonly GoldenCase[];
}

export function loadGoldenCases(): { suite: string; cases: readonly GoldenCase[] } {
  const raw: unknown = JSON.parse(readFileSync(GOLDEN_CASES_PATH, "utf8"));
  const file = raw as CasesFile;
  if (!Array.isArray(file.cases)) {
    throw new Error(`golden cases.json 形态非法：缺 cases 数组（${GOLDEN_CASES_PATH}）`);
  }
  return { suite: String(file.suite ?? "golden"), cases: file.cases };
}

// ============================================================
// 执行器：kernel 优先、参考镜像回落
// ============================================================

export type Evaluator = "kernel" | "reference";

function isNotImplementedError(e: unknown): boolean {
  return e instanceof Error && e.message === "not-implemented";
}

export interface TransitionAttemptResult extends TransitionOutcomeLike {
  readonly from: string;
  readonly to: string;
  readonly evaluator: Evaluator;
}

/** kernel 转移校验（未实现回落参考镜像）。 */
export function checkTransition(from: string, to: string): TransitionAttemptResult {
  try {
    const outcome = validateTransition(
      "lifecycle",
      from as LifecycleValue,
      to as LifecycleValue,
    );
    return { ...normalizeOutcome(outcome), from, to, evaluator: "kernel" };
  } catch (e) {
    if (!isNotImplementedError(e)) throw e;
  }
  return {
    ...validateTransitionReference(from, to),
    from,
    to,
    evaluator: "reference",
  };
}

function normalizeOutcome(o: TransitionOutcomeLike): TransitionOutcomeLike {
  return o.allowed
    ? {
        allowed: true,
        requires: o.requires ?? [],
        gracePolicyConfig: o.gracePolicyConfig ?? false,
        notes: o.notes ?? [],
      }
    : { allowed: false, reason: o.reason, hint: o.hint ?? "" };
}

export type IdParseResult =
  | { readonly ok: true; readonly parsed: { prefix: string; segments: readonly string[]; seq: number | null }; readonly evaluator: Evaluator }
  | { readonly ok: false; readonly reason: "unknown_prefix" | "grammar"; readonly detail: string; readonly evaluator: Evaluator };

/** kernel id 解析（未实现回落参考镜像）。 */
export function parseId(id: string): IdParseResult {
  try {
    const parsed = parseGovernedId(id);
    return {
      ok: true,
      parsed: { prefix: parsed.prefix, segments: parsed.segments, seq: parsed.seq },
      evaluator: "kernel",
    };
  } catch (e) {
    if (e instanceof GovernedIdParseError) {
      return { ok: false, reason: e.reason, detail: e.message, evaluator: "kernel" };
    }
    if (!isNotImplementedError(e)) throw e;
  }
  const ref: ParseResult = parseGovernedIdReference(id);
  return ref.ok
    ? { ok: true, parsed: ref.parsed, evaluator: "reference" }
    : { ok: false, reason: ref.reason, detail: ref.detail, evaluator: "reference" };
}

export interface AliasResult extends AliasResolutionLike {
  readonly evaluator: Evaluator;
}

/** kernel 别名解析（未实现回落参考镜像）。 */
export function resolveAliasChecked(spelling: string): AliasResult {
  try {
    const r = resolveAlias(spelling);
    return {
      input: r.input,
      canonical: r.canonical,
      legacyForms: r.legacyForms,
      matchedRuleLegacy: r.matchedRuleLegacy,
      note: r.note,
      evaluator: "kernel",
    };
  } catch (e) {
    if (!isNotImplementedError(e)) throw e;
  }
  return { ...resolveAliasReference(spelling), evaluator: "reference" };
}

export interface TriageResult {
  readonly decision: TriageDecision;
  readonly evaluator: Extract<Evaluator, "reference">;
}

/** triage 规则桶（kernel 尚无 triage 面 → 参考实现 rule_v0 P0 子集）。 */
export function runTriage(request: TriageRequestInput): TriageResult {
  return { decision: triageRuleV0(request), evaluator: "reference" };
}

// ============================================================
// 报告
// ============================================================

export type CaseRunStatus = "passed" | "failed" | "pending";

export interface GoldenCaseResult {
  readonly id: string;
  readonly kind: string;
  readonly status: CaseRunStatus;
  readonly evaluator?: Evaluator;
  readonly detail: string;
}

export interface GoldenReport {
  readonly suite: string;
  readonly total: number;
  readonly executable: number;
  readonly executed: number;
  readonly passed: number;
  readonly failed: number;
  readonly pending: number;
  readonly evaluatorSummary: { readonly kernel: number; readonly reference: number };
  readonly results: readonly GoldenCaseResult[];
  /** pending 清单（显式缺席，禁静默跳过）。 */
  readonly pendingList: readonly { readonly id: string; readonly reason: string }[];
}

function failResult(id: string, kind: string, detail: string): GoldenCaseResult {
  return { id, kind, status: "failed", detail };
}

function passResult(
  id: string,
  kind: string,
  evaluator: Evaluator | undefined,
  detail: string,
): GoldenCaseResult {
  return evaluator === undefined
    ? { id, kind, status: "passed", detail }
    : { id, kind, status: "passed", evaluator, detail };
}

/** 单用例执行：按 executable.kind 分派；无 executable → pending（显式）。 */
export function runGoldenCase(c: GoldenCase): GoldenCaseResult {
  if (c.executable === null) {
    const reason = c.pendingReason ?? "";
    if (reason.length === 0) {
      return failResult(
        c.id,
        "pending",
        "不可执行用例缺 pendingReason——缺席必须显式表达（禁静默跳过）",
      );
    }
    return {
      id: c.id,
      kind: "pending",
      status: "pending",
      detail: reason,
    };
  }
  const ex = c.executable;
  switch (ex.kind) {
    case "transition":
      return runTransitionCase(c, ex);
    case "id-parse":
      return runIdParseCase(c, ex);
    case "alias":
      return runAliasCase(c, ex);
    case "triage":
      return runTriageCase(c, ex);
  }
}

function runTransitionCase(
  c: GoldenCase,
  ex: TransitionExecutable,
): GoldenCaseResult {
  const attempts = ex.attempts;
  if (attempts.length === 0) {
    return failResult(c.id, ex.kind, "transition 用例缺 attempts");
  }
  for (const a of attempts) {
    if (
      !(LIFECYCLE_VALUES as readonly string[]).includes(a.from) ||
      !(LIFECYCLE_VALUES as readonly string[]).includes(a.to)
    ) {
      return failResult(
        c.id,
        ex.kind,
        `attempts 携带 lifecycle 词表外值：${JSON.stringify(a)}（词表纪律）`,
      );
    }
  }
  const results = attempts.map((a) => checkTransition(a.from, a.to));
  const evaluator = results.some((r) => r.evaluator === "kernel")
    ? "kernel"
    : "reference";
  const rejected = results.every((r) => r.allowed === false);
  const allowedAll = results.every((r) => r.allowed === true);
  if (ex.expectAll === "rejected" && rejected) {
    return passResult(
      c.id,
      ex.kind,
      evaluator,
      `全部拒绝：${results.map((r) => `${r.from}→${r.to}:${r.reason ?? "?"}`).join("；")}`,
    );
  }
  if (ex.expectAll === "allowed" && allowedAll) {
    return passResult(c.id, ex.kind, evaluator, "全部放行");
  }
  return failResult(
    c.id,
    ex.kind,
    `期望 ${String(ex.expectAll)} 实际 ${results
      .map((r) => `${r.from}→${r.to}=${r.allowed ? "allowed" : `rejected(${r.reason ?? "?"})`}`)
      .join("；")}`,
  );
}

function runIdParseCase(c: GoldenCase, ex: IdParseExecutable): GoldenCaseResult {
  const id = ex.id;
  const r = parseId(id);
  if (ex.expectParse === "ok") {
    if (!r.ok) {
      return failResult(c.id, ex.kind, `期望解析通过，实际 ${r.reason}：${r.detail}`);
    }
    if (ex.expectPrefix !== undefined && r.parsed.prefix !== ex.expectPrefix) {
      return failResult(
        c.id,
        ex.kind,
        `期望前缀 ${ex.expectPrefix}，实际 ${r.parsed.prefix}`,
      );
    }
    return passResult(c.id, ex.kind, r.evaluator, `解析通过（prefix=${r.parsed.prefix}）`);
  }
  if (r.ok) {
    return failResult(c.id, ex.kind, `期望解析 FATAL，实际通过：${JSON.stringify(r.parsed)}`);
  }
  if (ex.expectReason !== undefined && r.reason !== ex.expectReason) {
    return failResult(c.id, ex.kind, `期望 reason=${ex.expectReason}，实际 ${r.reason}`);
  }
  return passResult(c.id, ex.kind, r.evaluator, `解析 FATAL（${r.reason}）——closed-world 拦截生效`);
}

/**
 * aliases_v0 golden 触发面五族的家族判别（词形镜像 ALIASES_V0 legacy 串；PR-0001 后注册表
 * 八族——ISSUE.* / FTA-* / FB-* 为机械族，不走本非机械家族判别表；KB-* 家族实例存在
 * KB- 与 KB. 两种历史书写）。家族外 legacy（如开放问题#2 的 PAGE-APP-*——两代历史
 * 前缀不保留于 canonical id、只随对象 aliases[] 双向链保留）不做家族命中断言。
 */
const ALIAS_FAMILY_MATCHERS: readonly {
  readonly rule: string;
  readonly test: (spelling: string) => boolean;
}[] = [
  { rule: "GRID.*", test: (s) => s.startsWith("GRID.") },
  { rule: "KB-*", test: (s) => /^KB[-.]/.test(s) },
  { rule: "PAGE-TASK-STEP-*", test: (s) => s.startsWith("PAGE-TASK-STEP-") },
  { rule: "TASK-*", test: (s) => s.startsWith("TASK-") },
  { rule: "CHANGE-*", test: (s) => s.startsWith("CHANGE-") },
];

function runAliasCase(c: GoldenCase, ex: AliasExecutable): GoldenCaseResult {
  const mappings = ex.mappings;
  if (mappings.length === 0) {
    return failResult(c.id, ex.kind, "alias 用例缺 mappings");
  }
  const problems: string[] = [];
  const evaluators = new Set<Evaluator>();
  for (const m of mappings) {
    const canonicalParse = parseId(m.expectedCanonical);
    evaluators.add(canonicalParse.evaluator);
    if (!canonicalParse.ok) {
      problems.push(`${m.legacy} → 期望 canonical ${m.expectedCanonical} 解析失败（${canonicalParse.reason}）`);
      continue;
    }
    const legacyParse = parseId(m.legacy);
    if (legacyParse.ok) {
      problems.push(`legacy ${m.legacy} 竟通过 canonical 文法解析——legacy 拼写不得作为 canonical id（A6）`);
    }
    const res = resolveAliasChecked(m.legacy);
    evaluators.add(res.evaluator);
    if (m.mechanical) {
      if (res.canonical !== m.expectedCanonical) {
        problems.push(`机械收编失配：${m.legacy} → ${String(res.canonical)}，期望 ${m.expectedCanonical}`);
      }
      const back = resolveAliasChecked(m.expectedCanonical);
      if (!back.legacyForms.includes(m.legacy)) {
        problems.push(`双向链断裂：${m.expectedCanonical} 的 legacyForms 不含 ${m.legacy}`);
      }
    } else {
      const family = ALIAS_FAMILY_MATCHERS.find((f) => f.test(m.legacy));
      if (family && res.matchedRuleLegacy === null) {
        problems.push(
          `${m.legacy} 属 ${family.rule} 家族但解析器未命中（matchedRuleLegacy=null）`,
        );
      }
      if (res.canonical === m.expectedCanonical) {
        // 数据面映射被参考实现硬编码 = 臆造（应为 null，映射随对象登记）。
        problems.push(`参考实现不应对数据面映射臆造 canonical：${m.legacy}`);
      }
    }
  }
  const evaluator: Evaluator = evaluators.has("kernel") ? "kernel" : "reference";
  if (problems.length > 0) {
    return failResult(c.id, ex.kind, problems.join("；"));
  }
  return passResult(
    c.id,
    ex.kind,
    evaluator,
    `${mappings.length} 条收编映射全过：canonical 合法＋legacy 拒作 canonical＋机械族双向链闭合`,
  );
}

function profileRank(p: ProfileName): number {
  return PROFILE_LADDER.indexOf(p);
}

function runTriageCase(c: GoldenCase, ex: TriageExecutable): GoldenCaseResult {
  const req = ex.request;
  const expect = ex.expect;
  const { decision, evaluator } = runTriage(req);
  const problems: string[] = [];
  if (
    expect.effectiveProfile !== undefined &&
    decision.effectiveProfile !== expect.effectiveProfile
  ) {
    problems.push(
      `effectiveProfile 期望 ${expect.effectiveProfile}，实际 ${String(decision.effectiveProfile)}`,
    );
  }
  if (
    expect.effectiveProfileAtLeast !== undefined &&
    (decision.effectiveProfile === null ||
      profileRank(decision.effectiveProfile) < profileRank(expect.effectiveProfileAtLeast))
  ) {
    problems.push(
      `effectiveProfile 应 ≥ ${expect.effectiveProfileAtLeast}，实际 ${String(decision.effectiveProfile)}`,
    );
  }
  if (
    expect.triggerHitsContains !== undefined &&
    !decision.triggerHits.includes(expect.triggerHitsContains)
  ) {
    problems.push(
      `triggerHits 应含 ${expect.triggerHitsContains}，实际 [${decision.triggerHits.join(",")}]`,
    );
  }
  if (
    expect.floorApplied !== undefined &&
    decision.floorApplied !== expect.floorApplied
  ) {
    problems.push(
      `floorApplied 期望 ${String(expect.floorApplied)}，实际 ${String(decision.floorApplied)}`,
    );
  }
  if (
    expect.overrideBelowFloorRejected !== undefined &&
    decision.overrideBelowFloorRejected !== expect.overrideBelowFloorRejected
  ) {
    problems.push(
      `overrideBelowFloorRejected 期望 ${String(expect.overrideBelowFloorRejected)}，实际 ${String(decision.overrideBelowFloorRejected)}`,
    );
  }
  if (
    expect.overrideOverpoweredByEscalation !== undefined &&
    decision.overrideOverpoweredByEscalation !== expect.overrideOverpoweredByEscalation
  ) {
    problems.push(
      `overrideOverpoweredByEscalation 期望 ${String(expect.overrideOverpoweredByEscalation)}，实际 ${String(decision.overrideOverpoweredByEscalation)}`,
    );
  }
  if (problems.length > 0) {
    return failResult(c.id, ex.kind, `${problems.join("；")}｜decision=${JSON.stringify(decision)}`);
  }
  return passResult(
    c.id,
    ex.kind,
    evaluator,
    `rule_v0 判档生效：effective=${String(decision.effectiveProfile)} hits=[${decision.triggerHits.join(",")}]`,
  );
}

/** 全量执行并汇总（幂等：可重复调用字节级同结果）。 */
export function runAllCases(cases: readonly GoldenCase[]): GoldenReport {
  const results = cases.map((c) => runGoldenCase(c));
  const byStatus = (s: CaseRunStatus): number =>
    results.filter((r) => r.status === s).length;
  const executedResults = results.filter((r) => r.status !== "pending");
  return {
    suite: "golden-p0-batch1",
    total: results.length,
    executable: cases.filter((c) => c.executable !== null).length,
    executed: executedResults.length,
    passed: byStatus("passed"),
    failed: byStatus("failed"),
    pending: byStatus("pending"),
    evaluatorSummary: {
      kernel: results.filter((r) => r.evaluator === "kernel").length,
      reference: results.filter((r) => r.evaluator === "reference").length,
    },
    results,
    pendingList: results
      .filter((r) => r.status === "pending")
      .map((r) => ({ id: r.id, reason: r.detail })),
  };
}

// ============================================================
// 元校验（词表纪律 / 报告自洽）
// ============================================================

/** expected.verdict / verdictAlternatives 必须是 03 七态词形逐字（含 null 合法）。 */
export function verdictWordViolations(cases: readonly GoldenCase[]): string[] {
  const violations: string[] = [];
  const legal = VERDICT_VALUES as readonly string[];
  for (const c of cases) {
    const v = c.expected.verdict;
    if (v !== null && !legal.includes(v)) {
      violations.push(`${c.id}: verdict "${v}" 不在 03 七态词表`);
    }
    for (const alt of c.expected.verdictAlternatives ?? []) {
      if (!legal.includes(alt)) {
        violations.push(`${c.id}: verdictAlternatives "${alt}" 不在 03 七态词表`);
      }
    }
  }
  return violations;
}

/** 报告自洽：total = executed + pending = passed + failed + pending。 */
export function reportIsConsistent(report: GoldenReport): boolean {
  return (
    report.total === report.executed + report.pending &&
    report.total === report.passed + report.failed + report.pending &&
    report.pendingList.length === report.pending &&
    report.results.length === report.total
  );
}
