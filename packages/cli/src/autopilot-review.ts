/** Project snapshots compose the existing closeout judgment, never replace it. */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { applyTransaction, checkPermit, compareSourceSnapshots, loadStoreReadOnly, loadTruthIndex, parseGovernedId, persistEvidenceArtifact, qualifyEvidenceBatch, sha256OfBytes, sha256OfCanonical, storagePathOfSha256, type ExecutionRecord, type GovernedId } from "@pomaster/kernel";
import { acceptRevisionFingerprint, assessCloseoutMachine, requiredGateNamesFromAcceptance, type CloseoutAcceptReceipt, type CloseoutResult } from "./closeout.js";
import { runAutopilotSuspend } from "./autopilot-dispatch.js";
import { runAutopilotEscalateRecord } from "./autopilot-escalate.js";
import { failOutcome, okOutcome, type CliError, type CommandOutcome } from "./envelope.js";
import { readEvidenceQualificationRequirement, readRunQualificationView } from "./evidence-qualification.js";
import { loadIntakeLatest, runIntakeCheck } from "./intake.js";
import { discoverSims, parsePerfThresholds, PERF_BUILD_MANIFEST, PERF_BUILD_SCHEMA, PERF_GATE, PERF_LEDGER, PERF_RUN_SCHEMA, PERF_RUNS_DIR, type PerfBuildResult, type PerfThresholdEntry, type PerfThresholds, type PerfSimRow } from "./perf.js";
import { readGenerationManifest, type ScaffoldGenerationManifest } from "./scaffold-generate.js";
import { assessScaffoldSpec } from "./scaffold-governance.js";
import { buildSitScenario, SIT_BUILD_MANIFEST, SIT_BUILD_SCHEMA, SIT_GATE, SIT_LEDGER, SIT_RUN_SCHEMA, SIT_RUNS_DIR, type SitBuildResult, type SitCheckRow, type SitStepCtx } from "./sit.js";
import { SCAFFOLD_GENERATION_MANIFEST_RELATIVE } from "./store-layout.js";
import { ZAP_GATE, ZAP_LEDGER, ZAP_RUN_SCHEMA, ZAP_RUNS_DIR } from "./zap.js";
import { runQaCasesCheck } from "./qa-cases.js";
import { captureEvidenceSourceSnapshot } from "./source-snapshot.js";
import { runSpecUpdate, type SpecUpdateInput } from "./spec-update.js";
import { lintProjectSpecs } from "./spec-writing.js";
import { fileSha256, loadRegistry, statementSubject, verifySignoff, type SignoffRecord, type TrustEnv } from "./trust.js";

export const PROJECT_REVIEW_SCHEMA = "pomaster.autopilot-review/v1";
export const PROJECT_DECISION_SCHEMA = "pomaster.autopilot-project-decision/v1";
export const PROJECT_REVIEW_DIR = ".pomaster/autopilot/reviews";
export type ProjectVerdict = "ACCEPT" | "REWORK" | "REJECT";
export type ReviewCandidate =
  | { readonly kind: "spec"; readonly subject: string; readonly input: SpecUpdateInput }
  | { readonly kind: "truth-reconcile"; readonly subject: string; readonly object: string; readonly sha256: string };
export interface PreparedReviewCandidate {
  readonly candidate: ReviewCandidate;
  readonly target: string;
  readonly before_sha256: string;
  readonly after_sha256: string;
  readonly preview: string;
}
export interface ReviewTask {
  readonly task: string;
  readonly semantic_revision: string;
  readonly machine: CloseoutResult;
  readonly machine_receipt: { readonly actor: string; readonly authorization: string; readonly run: string; readonly task: string; readonly version: string; readonly satisfied: boolean };
}
export interface ProjectReviewSnapshot {
  readonly schema: typeof PROJECT_REVIEW_SCHEMA;
  readonly round: string;
  readonly execution_id: string;
  readonly ready: boolean;
  readonly blockers: readonly CliError[];
  readonly tasks: readonly ReviewTask[];
  readonly dependencies: Readonly<Record<string, string>>;
  readonly input_files: Readonly<Record<string, string>>;
  readonly input_roots: readonly string[];
  readonly code_paths: readonly string[];
  readonly build_paths: readonly string[];
  readonly required_final_paths: readonly string[];
  readonly required_project_checks: readonly string[];
  readonly requirement_review: readonly { readonly id: string; readonly text: string; readonly source: { readonly file: string; readonly revision: number; readonly block: string | null; readonly locator: string }; readonly qa_cases: readonly string[]; readonly task_scope: readonly string[]; readonly mapping: "expanded_unknown" }[];
  readonly candidates: readonly PreparedReviewCandidate[];
  readonly candidate_inputs: readonly ReviewCandidate[];
  readonly qa_isolation: "not_isolated";
  readonly qa_limitation: string;
}
export interface ProjectDecision {
  readonly schema: typeof PROJECT_DECISION_SCHEMA;
  readonly review_ref: string;
  readonly verdict: ProjectVerdict;
  readonly affected_units: readonly string[];
  readonly reason: string;
  readonly signoff: SignoffRecord;
}
export interface ReviewDraftInput {
  readonly executionId: string;
  readonly codePaths: readonly string[];
  readonly buildPaths: readonly string[];
  readonly candidates?: readonly ReviewCandidate[];
}
export interface ReviewDraftResult extends ProjectReviewSnapshot { readonly review_ref: string }
export interface ReviewDecisionResult { readonly decision_ref: string; readonly verdict: ProjectVerdict }

export class ReviewBlocked extends Error {
  constructor(readonly detail: CliError) { super(detail.message); }
}
export function reviewBlock(code: string, message: string): never {
  throw new ReviewBlocked({ code, message, hint: "Refresh the reviewed inputs through the existing revision/kickoff/QA/evidence authority flows; never edit a signed snapshot." });
}
export function reviewError(error: unknown): CliError {
  if (error instanceof ReviewBlocked) return error.detail;
  const known = error as { code?: string; hint?: string };
  return { code: known.code ?? "AUTOPILOT_REVIEW_ERROR", message: error instanceof Error ? error.message : String(error), hint: known.hint ?? "Inspect the retained apply intent and retry only after fixing the underlying cause." };
}
function json<T>(absolute: string): T { return JSON.parse(readFileSync(absolute, "utf8")) as T; }

/** No normalization can launder traversal or Windows paths. Reject link components, including junctions. */
export function reviewPath(root: string, ref: string): string {
  if (typeof ref !== "string" || ref.length === 0 || isAbsolute(ref) || /^[A-Za-z]:/.test(ref) || ref.includes("\\") || ref.includes(":") || /[\x00-\x1f]/.test(ref) || ref.split("/").some((part) => part === "" || part === "." || part === "..")) reviewBlock("AUTOPILOT_REVIEW_PATH_DENIED", `Unsafe project path: ${String(ref)}`);
  const base = realpathSync(root);
  let cursor = base;
  for (const part of ref.split("/")) {
    cursor = join(cursor, part);
    let present = false;
    try {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink > 1))) reviewBlock("AUTOPILOT_REVIEW_PATH_DENIED", `Linked or special project path: ${ref}`);
      present = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (present) {
      const rel = relative(base, realpathSync(cursor));
      if (rel.startsWith("..") || isAbsolute(rel)) reviewBlock("AUTOPILOT_REVIEW_PATH_DENIED", `Escaping project path: ${ref}`);
    }
  }
  return cursor;
}
function inputInventory(roots: readonly string[]): string[] {
  const inventory: string[] = [];
  const walk = (absolute: string, depth: number): void => {
    if (depth > 64 || inventory.length > 20000) reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", "Input inventory exceeds the bounded review surface");
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) reviewBlock("AUTOPILOT_REVIEW_PATH_DENIED", `Linked input surface: ${absolute}`);
    if (stat.isDirectory()) for (const name of readdirSync(absolute).sort()) walk(join(absolute, name), depth + 1);
    else if (stat.isFile()) inventory.push(absolute);
    else reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", "Input surface contains a non-file resource");
  };
  for (const root of roots) walk(root, 0);
  return [...new Set(inventory)].sort();
}
function files(root: string, ref: string): string[] {
  const absolute = reviewPath(root, ref);
  if (!existsSync(absolute)) return [];
  if (lstatSync(absolute).isFile()) return [ref];
  return readdirSync(absolute).sort().flatMap((name) => files(root, `${ref}/${name}`));
}
export function persistReviewBlob(root: string, value: unknown): string {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  reviewPath(root, `.pomaster/evidence/${storagePathOfSha256(sha256OfBytes(bytes))}`);
  return persistEvidenceArtifact(join(root, ".pomaster/evidence"), { media: "json", bytes }).sha256;
}
export function readReviewBlob<T>(root: string, ref: string): T {
  if (typeof ref !== "string" || !/^sha256:[0-9a-f]{64}$/.test(ref)) reviewBlock("AUTOPILOT_REVIEW_TAMPERED", "Only a content-addressed evidence reference is accepted");
  const absolute = reviewPath(root, `.pomaster/evidence/${storagePathOfSha256(ref)}`);
  if (!existsSync(absolute) || sha256OfBytes(readFileSync(absolute)) !== ref) reviewBlock("AUTOPILOT_REVIEW_TAMPERED", `Missing or tampered snapshot ${ref}`);
  return json<T>(absolute);
}
export function projectReviewStatement(reviewRef: string, verdict: ProjectVerdict, affectedUnits: readonly string[] = [], reason = ""): string {
  return `project review ${JSON.stringify({ review_ref: reviewRef, verdict, affected_units: [...new Set(affectedUnits)].sort(), reason: reason.trim() })}`;
}

interface CurrentKickoff { schema: string; sheet: string; sheet_sha256: string; signoff: string; valid_until: string; applied_at: string }
interface ReviewSheet { schema: string; id: string; workspace: string; revision: number; thresholds: readonly PerfThresholdEntry[]; provenance?: { draft_sha256: string; choices_sha256: string }; budget: { valid_days: number; max_rework_rounds: number } }
interface ReviewPlan { schema?: string; sheet?: string; committed: boolean; fingerprint: string; units: { id: string; lane?: string; entity?: string | null; affected_objects?: string[] }[] }

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readLines(root: string, ref: string): Record<string, unknown>[] {
  const absolute = reviewPath(root, ref);
  if (!existsSync(absolute)) return [];
  return readFileSync(absolute, "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => {
    const value: unknown = JSON.parse(line);
    if (!record(value)) reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", `Malformed ledger row: ${ref}`);
    return value;
  });
}
function sourceFiles(root: string, ref: string, depth = 0): string[] {
  if (depth > 32) reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", "Source inventory exceeds review depth");
  const absolute = reviewPath(root, ref);
  if (!existsSync(absolute)) return [];
  if (lstatSync(absolute).isFile()) return [ref];
  return readdirSync(absolute).sort().filter((name) => !["node_modules", ".git", ".pomaster"].includes(name) &&
    (ref.split("/").includes("src") || !["target", "dist"].includes(name))).flatMap((name) => sourceFiles(root, `${ref}/${name}`, depth + 1));
}

function relatedEvidenceFiles(root: string, tasks: readonly string[], explicit: ReadonlySet<string>): string[] {
  return ["runs", "claims"].flatMap((plane) => files(root, `.pomaster/evidence/${plane}`)).filter((ref) => {
    if (explicit.has(ref)) return true;
    // init's two plane-level documentation placeholders are not evidence records.
    // Keep every other file (including nested READMEs and damaged JSON) fail-closed.
    if (ref === ".pomaster/evidence/runs/README.md" || ref === ".pomaster/evidence/claims/README.md") return false;
    const value = json<unknown>(reviewPath(root, ref));
    if (!record(value)) reviewBlock("AUTOPILOT_REVIEW_EVIDENCE_UNQUALIFIED", `Unknowable evidence subject: ${ref}`);
    const inline = record(value.gate_result) && record(value.gate_result.result) ? value.gate_result.result : value;
    const subject = planeSubject(value, inline);
    if (typeof subject !== "string" || !subject) reviewBlock("AUTOPILOT_REVIEW_EVIDENCE_UNQUALIFIED", `Unknowable evidence subject: ${ref}`);
    return tasks.includes(subject);
  }).sort();
}
function planeSubject(value: Record<string, unknown>, inline: Record<string, unknown>): unknown {
  return record(value.subject) ? value.subject.object_id : inline.subject_id ?? inline.subjectId;
}

function validateSitBuild(root: string, manifest: ScaffoldGenerationManifest | null, addPath: (ref: string) => void): SitBuildResult {
  const build = json<SitBuildResult>(reviewPath(root, SIT_BUILD_MANIFEST));
  if (build.schema !== SIT_BUILD_SCHEMA || !Array.isArray(build.jars) || !build.jars.length) reviewBlock("AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", "Required SIT build manifest has no executable artifacts");
  for (const jar of build.jars) {
    if (fileSha256(reviewPath(root, jar.path)) !== jar.sha256) reviewBlock("AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", `SIT build artifact changed: ${jar.path}`);
    addPath(jar.path);
  }
  if (manifest && Object.keys(manifest.spec_snapshot.surfaces).some((surface) => !build.jars.some((jar) => jar.surface === surface))) reviewBlock("AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", "SIT build omits a declared deployment surface");
  if (build.frontend) {
    const output = files(root, build.frontend.dir);
    if (!output.length) reviewBlock("AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", "Declared frontend build is empty");
    for (const ref of output) addPath(ref);
  }
  const fingerprint = sha256OfBytes(Buffer.from(build.jars.map((jar) => jar.sha256).join("\n") + (build.frontend === null ? "" : String(build.frontend.bytes)))).slice(7);
  if (fingerprint !== build.fingerprint) reviewBlock("AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", "SIT build fingerprint is inconsistent with producer artifacts");
  return build;
}

function assertPerfCoverage(root: string, ledger: Record<string, unknown>, report: Record<string, unknown>, confirmed: PerfThresholds, addPath: (ref: string) => void): void {
  const build = json<PerfBuildResult>(reviewPath(root, PERF_BUILD_MANIFEST));
  const sims = discoverSims(root);
  if (build.schema !== PERF_BUILD_SCHEMA || !sims.length || sha256OfCanonical(sims) !== sha256OfCanonical(build.sims)) reviewBlock("AUTOPILOT_PERFORMANCE_UNJUDGED", "Performance simulation denominator differs from the actual build");
  for (const sim of sims) addPath(sim.file);
  addPath("perf/pom.xml");
  const fingerprint = sha256OfBytes(Buffer.from(sims.map((sim) => fileSha256(reviewPath(root, sim.file))).join("\n") + fileSha256(reviewPath(root, "perf/pom.xml")))).slice(7);
  if (fingerprint !== build.fingerprint || ledger.perf_fingerprint !== fingerprint) reviewBlock("AUTOPILOT_PERFORMANCE_UNJUDGED", "Performance build fingerprint is stale");
  const rows = report.rows as PerfSimRow[];
  if (!Array.isArray(rows) || rows.length !== sims.length || new Set(rows.map((row) => row.name)).size !== sims.length || sims.some((sim) => !rows.some((row) => row.name === sim.name)) || !Array.isArray(ledger.sims) || sha256OfCanonical(rows.map(({ name, ok }) => ({ name, ok }))) !== sha256OfCanonical(ledger.sims)) reviewBlock("AUTOPILOT_PERFORMANCE_UNJUDGED", "Required performance simulations are absent or partial");
  const expected = [
    [confirmed.p95MaxMs, (v: number) => `p95<=${v}ms`], [confirmed.p99MaxMs, (v: number) => `p99<=${v}ms`],
    [confirmed.rpsMin, (v: number) => `rps>=${v}`], [confirmed.errorRateMaxPct, (v: number) => `error_rate<=${v}%`],
  ] as const;
  for (const row of rows) {
    if (row.ok !== true || row.error !== null || !row.metrics || typeof row.metrics.total !== "number" || row.metrics.total <= 0 || !Array.isArray(row.assertions) || row.assertions.length !== expected.filter(([value]) => value !== null).length || expected.some(([value, kind]) => value !== null && !row.assertions.some((assertion) => assertion.kind === kind(value) && assertion.threshold === value && assertion.ok === true && typeof assertion.observed === "number" && Number.isFinite(assertion.observed) && (assertion.kind.startsWith("rps") ? assertion.observed >= value : assertion.observed <= value)))) reviewBlock("AUTOPILOT_PERFORMANCE_UNJUDGED", "Required signed performance assertions are missing, contradictory, unjudged or failed");
  }
}


function reviewTrustBoundary(root: string): void {
  reviewPath(root, ".pomaster/trust/signers.json");
  files(root, ".pomaster/trust/requests");
  files(root, ".pomaster/trust/consumed");
}

async function authority(root: string, executionId: string, subjects: readonly string[]): Promise<{ current: CurrentKickoff; sheet: ReviewSheet; plan: ReviewPlan; execution: ExecutionRecord; permits: Record<string, string> }> {
  reviewTrustBoundary(root);
  const current = json<CurrentKickoff>(reviewPath(root, ".pomaster/kickoff/current.json"));
  const sheetRef = `.pomaster/kickoff/${current.sheet}/sheet.json`;
  const sheet = json<ReviewSheet>(reviewPath(root, sheetRef));
  if (current.schema !== "pomaster.kickoff-current/v1" || sheet.schema !== "pomaster.kickoff-sheet/v1" || sheet.id !== current.sheet || fileSha256(reviewPath(root, sheetRef)) !== current.sheet_sha256 || !Number.isFinite(Date.parse(current.valid_until)) || Date.parse(current.valid_until) <= Date.now()) reviewBlock("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID", "Kickoff is absent, stale, or expired");
  const days = sheet.budget?.valid_days;
  if (!Number.isSafeInteger(days) || days <= 0 || !Number.isFinite(Date.parse(current.applied_at)) || Date.parse(current.applied_at) > Date.now() || Date.parse(current.valid_until) !== Date.parse(current.applied_at) + days * 86400000) reviewBlock("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID", "Kickoff validity must match its signed finite budget");
  const proof = verifySignoff(root, current.signoff, { kind: "kickoff", ref: sheetRef, sha256: current.sheet_sha256 }, { consume: false, requireConsumed: true, requireConsumedBy: "kickoff confirm" });
  if (!proof.ok) throw new ReviewBlocked(proof.error);
  const consumed = json<{ consumed_at: string }>(reviewPath(root, `.pomaster/trust/consumed/${current.signoff}.json`));
  if (Date.parse(current.applied_at) < Date.parse(consumed.consumed_at) || Date.now() >= Date.parse(consumed.consumed_at) + days * 86400000) reviewBlock("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID", "Unsigned kickoff timestamps cannot renew the consumed signed budget");
  const plan = json<ReviewPlan>(reviewPath(root, `.pomaster/plan/${current.sheet}/plan.json`));
  if (plan.committed !== true || !Array.isArray(plan.units) || plan.units.length === 0 || new Set(plan.units.map((unit) => unit.id)).size !== plan.units.length) reviewBlock("AUTOPILOT_PLAN_MISSING", "A nonempty committed plan is the project TASK denominator");
  const cap = sheet.budget?.max_rework_rounds;
  if (!Number.isSafeInteger(cap) || cap < 0) reviewBlock("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID", "Kickoff must declare a finite round budget");
  const rounds = readLines(root, ".pomaster/autopilot/rounds.jsonl");
  const dispatches = readLines(root, ".pomaster/autopilot/dispatches.jsonl");
  for (const unit of plan.units) {
    if (rounds.some((line) => typeof line.unit !== "string") || dispatches.some((line) => typeof line.unit !== "string")) reviewBlock("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID", "Unknowable budget ownership cannot be excluded");
    const used = rounds.filter((line) => line.unit === unit.id).length;
    const generations = dispatches.filter((line) => line.unit === unit.id).map((line) => Number(line.generation));
    if (used > cap + 1 || generations.some((generation) => !Number.isSafeInteger(generation) || generation > cap + 1)) reviewBlock("AUTOPILOT_BUDGET_EXHAUSTED", `Signed budget exceeded for ${unit.id}`);
  }
  const execution = json<ExecutionRecord>(reviewPath(root, `.pomaster/executions/${executionId}.json`));
  if (execution.schema !== "pomaster.execution/v1" || execution.execution_id !== executionId || !/^AGX-[0-9]{4}-[0-9]+$/.test(executionId) || !Array.isArray(execution.permit_ids) || execution.permit_ids.length === 0 || execution.ended_at !== null) reviewBlock("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID", "Review requires a live registered execution with attached permits");
  if (!["orchestrator", "qa", "script"].includes(execution.role)) reviewBlock("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID", "An implementation execution cannot issue project machine receipts");
  const store = loadStoreReadOnly(root);
  const index = await loadTruthIndex(store);
  const ledger = json<{ permits: { permit_ref: string; expires_at_seq: number; stolen_at_seq: number | null }[] }>(reviewPath(root, ".pomaster/state/permits.json"));
  const seq = json<{ generation: { seq: number } }>(reviewPath(root, ".pomaster/state/truth-index.json")).generation.seq;
  const owners = json<{ authorities: Record<string, unknown> }>(reviewPath(root, ".pomaster/state/authority.json"));
  const permits: Record<string, string> = {};
  for (const subject of subjects) {
    parseGovernedId(subject);
    const row = index.objects.find((entry) => entry.id === subject);
    if (row === undefined || !Object.hasOwn(owners.authorities, row.authorityOwner)) reviewBlock("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID", `Unregistered subject owner: ${subject}`);
    // Screen expiry before checkPermit: expired checks emit journal events and assessment must be read-only.
    let allowed = false;
    for (const permit of ledger.permits.filter((item) => execution.permit_ids.includes(item.permit_ref) && item.stolen_at_seq === null && seq < item.expires_at_seq)) {
      if ((await checkPermit(store, permit.permit_ref, { id: subject as GovernedId, op: "upsert_object" })).outcome === "allowed") { allowed = true; permits[subject] = permit.permit_ref; break; }
    }
    if (!allowed) reviewBlock("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID", `No live attached permit covers ${subject}`);
  }
  return { current, sheet, plan, execution, permits };
}

async function prepareCandidate(root: string, candidate: ReviewCandidate, planned: readonly string[], executionId: string): Promise<PreparedReviewCandidate> {
  if (candidate === null || !planned.includes(candidate.subject)) reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Candidate must be anchored to a listed TASK");
  if (candidate.kind === "truth-reconcile") {
    parseGovernedId(candidate.object);
    const row = (await loadTruthIndex(loadStoreReadOnly(root))).objects.find((entry) => entry.id === candidate.object);
    if (row === undefined || row.kind === "task_object") reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Reconciliation must refer to an existing non-TASK truth object; TASK revisions are already in the closeout denominator");
    const target = `.pomaster/${row.bodyRef}`;
    if (fileSha256(reviewPath(root, target)) !== candidate.sha256) reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Reconciliation has substantive differences; no conditional truth mutation API is available");
    return { candidate, target, before_sha256: candidate.sha256, after_sha256: candidate.sha256, preview: "Exact unchanged truth reconciliation; no rule generated or written" };
  }
  if (candidate.kind !== "spec") reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Unsupported candidate authority API");
  const input = candidate.input;
  if (!input || !input.theme || input.area !== undefined || input.drawer !== undefined || (input.target !== undefined && input.target !== "spec")) reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Only explicit existing hard-theme spec updates are supported");
  const theme = input.theme.replace(/\.md$/, "");
  const target = `.pomaster/specs/hard/${theme.includes("/") ? theme : `themes/${theme}`}.md`;
  const absolute = reviewPath(root, target);
  const routePath = reviewPath(root, ".pomaster/specs/hard/themes/index.md");
  if (!existsSync(absolute) || !readFileSync(routePath, "utf8").includes(`\`${target.replace(".pomaster/specs/hard/", "")}\``)) reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Target must already exist in the controlled theme route");
  const temp = mkdtempSync(join(tmpdir(), "pomaster-review-preflight-"));
  try {
    // Test the production writer and lint on disposable spec bytes, not on live project state.
    files(root, ".pomaster/specs");
    mkdirSync(join(temp, ".pomaster"));
    cpSync(reviewPath(root, ".pomaster/specs"), join(temp, ".pomaster/specs"), { recursive: true });
    // A disposable transaction checks governed authority without changing live state.
    for (const plane of ["state", "truth", "executions", "evidence/runs"]) {
      const ref = `.pomaster/${plane}`;
      if (existsSync(reviewPath(root, ref))) {
        files(root, ref);
        cpSync(reviewPath(root, ref), join(temp, ref), { recursive: true });
      }
    }
    const live = await authority(root, executionId, [candidate.subject]);
    await applyTransaction(loadStoreReadOnly(temp), { executionId, ...{ permitRef: live.permits[candidate.subject] }, ops: [{ op: "transition_object", id: candidate.subject as GovernedId, patch: {}, reasonShort: "project candidate authority preflight (no semantic mutation)" }] });
    const outcome = runSpecUpdate(temp, { ...input, target: "spec", dryRun: false });
    if (!outcome.ok || outcome.result === null) throw new ReviewBlocked(outcome.errors[0] ?? { code: "AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", message: "Writer preflight failed", hint: "Fix candidate" });
    if (outcome.result.file !== target) reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Writer selected a different target");
    if (lintProjectSpecs(temp).issues.length > 0) reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Pre-reviewed spec output failed spec-lint");
    return { candidate, target, before_sha256: fileSha256(absolute), after_sha256: fileSha256(join(temp, target)), preview: readFileSync(join(temp, target), "utf8") };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

async function collectReview(root: string, input: ReviewDraftInput, appliedCandidates: readonly PreparedReviewCandidate[] = []): Promise<ProjectReviewSnapshot> {
  const initial = await authority(root, input.executionId, []);
  const taskIds = initial.plan.units.map((unit) => unit.id).sort();
  await authority(root, input.executionId, taskIds);
  const blockers: CliError[] = [];
  const dependencies: Record<string, string> = {};
  const pin = (ref: string) => { dependencies[ref] = fileSha256(reviewPath(root, ref)); };
  const codePaths = [...new Set(input.codePaths)].sort();
  const buildPaths = [...new Set(input.buildPaths)].sort();
  if (codePaths.length === 0 || buildPaths.length === 0) reviewBlock("AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", "Final merged code and build surfaces must both be declared");
  for (const ref of [...codePaths, ...buildPaths]) pin(ref);
  for (const ref of [".pomaster/kickoff/current.json", `.pomaster/kickoff/${initial.current.sheet}/sheet.json`, `.pomaster/plan/${initial.current.sheet}/plan.json`, ".pomaster/qa/current.json", ".pomaster/state/authority.json"]) pin(ref);
  for (const ref of files(root, `.pomaster/kickoff/${initial.current.sheet}`).filter((ref) => !ref.endsWith("apply.json"))) pin(ref);
  for (const ref of files(root, `.pomaster/plan/${initial.current.sheet}`)) pin(ref);
  let qaRound: string | null = initial.current.sheet;
  const qaRounds = new Set<string>();
  while (qaRound !== null) {
    if (qaRounds.has(qaRound)) reviewBlock("AUTOPILOT_REVIEW_QA_STALE", "Frozen QA ancestry is cyclic");
    qaRounds.add(qaRound);
    const ref: string = `.pomaster/qa/${qaRound}/cases-frozen.json`;
    pin(ref);
    const frozen: { parent?: { round: string } | null } = json(reviewPath(root, ref));
    qaRound = frozen.parent?.round ?? null;
  }
  const qa = runQaCasesCheck(root);
  blockers.push(...qa.errors);
  const qaPointer = json<{ round: string; sheet_sha256: string; revision: number; resolutions_sha256: string }>(reviewPath(root, ".pomaster/qa/current.json"));
  const frozen = json<{ sheet_sha256: string; revision: number; resolutions_sha256: string; plan_fingerprint: string }>(reviewPath(root, `.pomaster/qa/${initial.current.sheet}/cases-frozen.json`));
  if (qaPointer.round !== initial.current.sheet || qaPointer.sheet_sha256 !== initial.current.sheet_sha256 || frozen.sheet_sha256 !== initial.current.sheet_sha256 || qaPointer.revision !== initial.sheet.revision || frozen.revision !== initial.sheet.revision || frozen.plan_fingerprint !== initial.plan.fingerprint) reviewBlock("AUTOPILOT_REVIEW_QA_STALE", "Frozen QA belongs to another kickoff/input/plan version");
  const loaded = loadIntakeLatest(root, initial.sheet.workspace);
  if (!loaded.ok || loaded.data.files.revision !== initial.sheet.revision) reviewBlock("AUTOPILOT_REVIEW_STALE", "Input revision changed after kickoff");
  if (qaPointer.resolutions_sha256 !== loaded.data.files.resolutions_sha256 || frozen.resolutions_sha256 !== loaded.data.files.resolutions_sha256) reviewBlock("AUTOPILOT_REVIEW_QA_STALE", "Frozen QA no longer matches the current intake resolutions");
  if (initial.sheet.provenance) {
    const draftPath = join(loaded.workspace.dir, "draft/draft.json");
    const choicesPath = reviewPath(root, `.pomaster/kickoff/${initial.current.sheet}/choices.yaml`);
    if (fileSha256(draftPath) !== initial.sheet.provenance.draft_sha256 || fileSha256(choicesPath) !== initial.sheet.provenance.choices_sha256) reviewBlock("AUTOPILOT_REVIEW_STALE", "Signed kickoff intake/choices provenance changed");
  }
  blockers.push(...runIntakeCheck(root, { name: initial.sheet.workspace }).errors);
  const inputFiles: Record<string, string> = {};
  const inputRoots = loaded.data.files.inputs.map((input) => resolve(root, input));
  for (const source of inputInventory(inputRoots)) inputFiles[source] = fileSha256(source);
  for (const file of loaded.data.files.files) {
    const inputRoot = inputRoots[file.root]!;
    const source = resolve(lstatSync(inputRoot).isDirectory() ? inputRoot : dirname(inputRoot), file.path);
    if (!existsSync(source) || fileSha256(source) !== file.sha256) reviewBlock("AUTOPILOT_REVIEW_STALE", `Input bytes changed: ${source}`);
    inputFiles[source] = file.sha256;
  }
  for (const ref of files(root, relative(root, loaded.workspace.dir).replace(/\\/g, "/"))) pin(ref);
  for (const ref of [".pomaster/baseline", ".pomaster/scaffold", ".pomaster/specs"]) for (const file of files(root, ref)) pin(file);
  const tasks: ReviewTask[] = [];
  const requiredFinalPaths = new Set([...codePaths, ...buildPaths]);
  const addFinalPath = (ref: string) => { requiredFinalPaths.add(ref); pin(ref); };
  const finalVerificationSurfaces: (readonly string[])[] = [];
  const qualifiedArtifacts = new Map<string, Set<string>>();
  const artifactSurfaces = new Map<string, (readonly string[])[]>();
  const explicitEvidence = new Set<string>();
  const requiredGates = new Set<string>();
  const index = await loadTruthIndex(loadStoreReadOnly(root));
  const manifestRead = await readGenerationManifest(root);
  if (manifestRead.kind === "malformed") reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", manifestRead.detail);
  const manifest = manifestRead.kind === "ok" ? manifestRead.manifest : null;
  // A missing generation authority is a fullstack gap, not a downgrade to legacy review.
  const fullstack = initial.plan.schema === "pomaster.scenario-plan/v1";
  if (fullstack && manifest === null) blockers.push({ code: "AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", message: "Fullstack scenario plan is missing its generation manifest and source/build denominator", hint: "Restore the existing confirmed scaffold generation authority before project review; BUILD alone cannot substitute for fullstack verification" });
  const keybindings = files(root, ".pomaster/truth/keybindings").map((ref) => {
    pin(ref);
    const value = json<unknown>(reviewPath(root, ref));
    if (!record(value) || typeof value.id !== "string" || typeof value.canonical_id !== "string" || typeof value.physical_path !== "string") reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", `Malformed KEYBINDING: ${ref}`);
    return value;
  });
  const expandAffected = (raw: unknown) => {
    if (raw === undefined) return;
    if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", "Affected-object denominator is malformed");
    for (const id of raw as string[]) {
      const bindings = keybindings.filter((binding) => binding.id === id || binding.canonical_id === id);
      if (bindings.some((binding) => binding.binding_status === "stale")) blockers.push({ code: "AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", message: `Stale physical dependency mapping for ${id}`, hint: "Reconcile the existing KEYBINDING authority before review" });
      const paths = bindings.filter((binding) => binding.binding_class !== "contract_operation_to_operationId").flatMap((binding) => {
        const ref = binding.physical_path as string;
        const absolute = reviewPath(root, ref);
        return existsSync(absolute) && lstatSync(absolute).isDirectory() ? sourceFiles(root, ref) : [ref];
      });
      for (const file of manifest?.files ?? []) if (file.keybinding_id === id || file.canonical_id === id) paths.push(file.path);
      if (!paths.length) blockers.push({ code: "AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", message: `No physical dependency mapping for ${id}`, hint: "Complete the existing KEYBINDING/plan dependency edges; omission is not independence" });
      for (const ref of new Set(paths)) addFinalPath(ref);
    }
  };
  for (const unit of initial.plan.units) expandAffected(unit.affected_objects);
  if (manifest) {
    const scaffold = await assessScaffoldSpec(root);
    if ("code" in scaffold || scaffold.state !== "confirmed" || scaffold.semantic_sha256 !== manifest.spec_semantic_sha256) blockers.push({ code: "AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", message: "Generation denominator lacks unchanged confirmed domain authority", hint: "Reconcile the existing scaffold confirmation and generation manifest" });
    pin(SCAFFOLD_GENERATION_MANIFEST_RELATIVE);
    for (const file of manifest.files) addFinalPath(file.path);
    // Generated roots also contain project-owned seed logic, not only regenerable files.
    for (const prefix of new Set(manifest.files.map((file) => file.path.split("/")[0]!))) {
      for (const ref of sourceFiles(root, prefix)) addFinalPath(ref);
    }
  }
  const roundTaskIds = index.objects.filter((row) => row.kind === "task_object" && json<{ payload?: { round?: string } }>(reviewPath(root, `.pomaster/${row.bodyRef}`)).payload?.round === initial.current.sheet).map((row) => row.id).sort();
  if (JSON.stringify(roundTaskIds) !== JSON.stringify(taskIds)) reviewBlock("AUTOPILOT_REVIEW_TASK_MISSING", "Committed plan omits TASKs belonging to this increment");
  if (fullstack && manifest) {
    if (initial.plan.sheet !== initial.current.sheet || initial.plan.units.filter((unit) => unit.lane === "contract").length !== 1 || !manifest.spec_snapshot.entities.length) blockers.push({ code: "AUTOPILOT_REVIEW_TASK_MISSING", message: "Fullstack plan omits the contract/domain unit denominator", hint: "Recompile the existing scenario plan over the confirmed domain" });
    for (const entity of manifest.spec_snapshot.entities) for (const lane of ["db", "be", "fe"]) {
      if (!initial.plan.units.some((unit) => unit.entity === entity.key && unit.lane === lane)) reviewBlock("AUTOPILOT_REVIEW_TASK_MISSING", `Plan omits ${entity.key}/${lane}`);
    }
  }
  let sitBuild: SitBuildResult | null = null;
  if (existsSync(reviewPath(root, SIT_BUILD_MANIFEST)) || fullstack) {
    try {
      pin(SIT_BUILD_MANIFEST);
      sitBuild = validateSitBuild(root, manifest, addFinalPath);
      if (fullstack && sitBuild.frontend === null) reviewBlock("AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", "Fullstack project has no final frontend build");
    } catch (error) { blockers.push(reviewError(error)); }
  }
  const specGateRefs = new Set<string>();
  const changes = new Set(taskIds.map((task) => {
    const row = index.objects.find((entry) => entry.id === task)!;
    return json<{ payload: { implements_change?: string } }>(reviewPath(root, `.pomaster/${row.bodyRef}`)).payload.implements_change;
  }).filter((ref): ref is string => typeof ref === "string"));
  for (const row of index.objects.filter((entry) => entry.id.startsWith("SPEC."))) {
    const ref = `.pomaster/${row.bodyRef}`;
    const spec = json<{ payload: Record<string, unknown> }>(reviewPath(root, ref));
    if (!record(spec.payload)) reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", `Unknowable Evidence Spec: ${row.id}`);
    if (!taskIds.includes(String(spec.payload.bound_task_ref)) && !changes.has(String(spec.payload.bound_change_ref))) continue;
    pin(ref);
    if (row.axes.lifecycle !== "CURRENT") continue;
    for (const clause of Array.isArray(spec.payload.requirements) ? spec.payload.requirements : []) {
      if (!record(clause)) continue;
      for (const grn of Array.isArray(clause.gate_refs) ? clause.gate_refs : []) if (typeof grn === "string") {
        specGateRefs.add(grn); explicitEvidence.add(`.pomaster/evidence/runs/${grn}.json`);
      }
      for (const clm of Array.isArray(clause.claim_refs) ? clause.claim_refs : []) if (typeof clm === "string") explicitEvidence.add(`.pomaster/evidence/claims/${clm}.json`);
    }
  }
  for (const task of taskIds) {
    const row = index.objects.find((entry) => entry.id === task);
    if (!row || row.kind !== "task_object") reviewBlock("AUTOPILOT_REVIEW_TASK_MISSING", `Plan TASK is missing: ${task}`);
    const body = json<{ payload: Record<string, unknown> }>(reviewPath(root, `.pomaster/${row.bodyRef}`));
    if (body.payload.round !== initial.current.sheet) reviewBlock("AUTOPILOT_REVIEW_TASK_MISSING", `TASK belongs to another increment: ${task}`);
    expandAffected(body.payload.affected_objects);
    for (const name of requiredGateNamesFromAcceptance(body.payload.acceptance).required) requiredGates.add(name);
    for (const entry of Array.isArray(body.payload.acceptance) ? body.payload.acceptance : []) {
      if (record(entry) && typeof entry.claim === "string") explicitEvidence.add(`.pomaster/evidence/claims/${entry.claim}.json`);
    }
    const semanticRevision = acceptRevisionFingerprint(body);
    const assessment = await assessCloseoutMachine(root, { taskId: task });
    blockers.push(...assessment.errors);
    tasks.push({ task, semantic_revision: semanticRevision, machine: assessment.result, machine_receipt: { actor: `agent:${initial.execution.execution_id}`, authorization: initial.current.sheet, run: initial.execution.execution_id, task, version: semanticRevision, satisfied: assessment.ok } });
    for (const clause of assessment.result.dod?.spec?.entries ?? []) {
      if (clause.ok && clause.satisfied_by?.startsWith("gate ")) {
        const grn = clause.satisfied_by.slice(5);
        const named = assessment.result.gates?.rows.find((gate) => gate.grn === grn)?.gate;
        if (named) requiredGates.add(named);
      }
    }
    const requirement = await readEvidenceQualificationRequirement(root, body.payload.baseline_dependencies);
    for (const gate of assessment.result.gates?.rows.filter((entry) => entry.latest && (entry.required !== false || specGateRefs.has(entry.grn))) ?? []) {
      const ref = `.pomaster/evidence/runs/${gate.grn}.json`;
      pin(ref);
      const run = json<{ evidence_purpose?: string; artifact_refs?: { sha256: string; storage_path: string }[] }>(reviewPath(root, ref));
      const view = await readRunQualificationView(join(root, ".pomaster/evidence/runs"), gate.grn);
      if (!view || "damage" in view) { blockers.push({ code: "AUTOPILOT_REVIEW_EVIDENCE_UNQUALIFIED", message: `Damaged ${gate.grn}`, hint: "Rerun verification" }); continue; }
      const qualified = qualifyEvidenceBatch([{ ref: gate.grn, surface: "run", captured_at_seq: view.ranAtSeq, gate: view.gate, gate_def: view.gateDef, oracle_ref: null, execution_id: view.executionId, subject: task, ...(view.baselineInputs ? { baseline_inputs: view.baselineInputs } : {}) }], requirement).findings.every((finding) => finding.qualified);
      const snap = view.sourceSnapshot;
      if (snap) for (const path of snap.after.relevant_paths) requiredFinalPaths.add(path);
      const stable = snap && snap.window.state === "fresh" && compareSourceSnapshots(snap.after, captureEvidenceSourceSnapshot(root, { relevantPaths: snap.after.relevant_paths })).state === "fresh";
      if (!qualified || run.evidence_purpose !== "final_stable" || !stable) blockers.push({ code: "AUTOPILOT_REVIEW_FINAL_EVIDENCE_MISSING", message: `${gate.grn} is not qualified final-stable evidence`, hint: "Run the required gate on the final version with source bindings" });
      const eligible = qualified && run.evidence_purpose === "final_stable" && stable && view.subject === task && gate.verdict === "passed";
      if (eligible && snap) finalVerificationSurfaces.push(snap.after.relevant_paths);
      if (snap) for (const path of snap.after.relevant_paths) pin(path);
      for (const artifact of run.artifact_refs ?? []) {
        const artifactPath = `.pomaster/evidence/${storagePathOfSha256(artifact.sha256)}`;
        if (artifact.storage_path !== storagePathOfSha256(artifact.sha256) || sha256OfBytes(readFileSync(reviewPath(root, artifactPath))) !== artifact.sha256) reviewBlock("AUTOPILOT_REVIEW_EVIDENCE_UNQUALIFIED", "GRN artifact is missing or tampered");
        pin(artifactPath);
        if (eligible) {
          const digests = qualifiedArtifacts.get(gate.gate ?? "") ?? new Set<string>();
          digests.add(artifact.sha256);
          qualifiedArtifacts.set(gate.gate ?? "", digests);
          const surfaces = artifactSurfaces.get(artifact.sha256) ?? [];
          surfaces.push(snap!.after.relevant_paths);
          artifactSurfaces.set(artifact.sha256, surfaces);
        }
      }
    }
  }
  const finalMergedEvidence = finalVerificationSurfaces.some((surface) => [...requiredFinalPaths].every((path) => surface.includes(path)));
  if (!finalMergedEvidence) blockers.push({ code: "AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", message: "No qualified passed final-stable GRN covers the complete declared merged code and build snapshot", hint: "Verify the integrated build, not independent branch/local results" });
  for (const file of relatedEvidenceFiles(root, taskIds, explicitEvidence)) pin(file);
  const candidates: PreparedReviewCandidate[] = [];
  for (const candidate of input.candidates ?? []) {
    try {
      let prepared = await prepareCandidate(root, candidate, taskIds, input.executionId);
      const approved = appliedCandidates.find((entry) => entry.target === prepared.target);
      if (approved && prepared.before_sha256 === approved.after_sha256 && prepared.after_sha256 === approved.after_sha256 && prepared.preview === approved.preview && sha256OfCanonical(prepared.candidate) === sha256OfCanonical(approved.candidate)) {
        prepared = { ...prepared, before_sha256: approved.before_sha256 };
      }
      if (candidates.some((entry) => entry.target === prepared.target)) reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Duplicate candidate target");
      candidates.push(prepared); pin(prepared.target);
      if (approved && dependencies[prepared.target] === approved.after_sha256) dependencies[prepared.target] = approved.before_sha256;
    } catch (error) { blockers.push(reviewError(error)); }
  }
  const requiresGate = (name: string) => requiredGates.has(name) || tasks.some((task) => task.machine.gates?.rows.some((gate) => gate.latest && gate.required !== false && gate.gate === name));
  const zapRequired = fullstack || [...qualifiedArtifacts.get(ZAP_GATE) ?? []].some((ref) => {
    try { return readReviewBlob<{ schema?: string }>(root, ref).schema === ZAP_RUN_SCHEMA; }
    catch (error) { if (error instanceof SyntaxError) return false; throw error; }
  });
  const requiredChecks = new Set<string>(fullstack ? ["BUILD", "BROWSER", PERF_GATE, ZAP_GATE, SIT_GATE, "zap:baseline", "zap:api"] : []);
  if (fullstack) for (const gate of ["BUILD", "BROWSER", PERF_GATE, ZAP_GATE]) {
    if (!requiredGates.has(gate)) blockers.push({ code: "AUTOPILOT_REVIEW_PROJECT_OBLIGATION_MISSING", message: `Signed fullstack scenario has no required ${gate} obligation in its TASK/Evidence Spec authority`, hint: "Complete the existing scenario verification plan/Evidence Spec; local BUILD alone is not project validation" });
  }
  // Actual reports only constrain eligible GRNs; they can never supply a passing verdict.
  for (const leg of [
    { gate: SIT_GATE, ledger: SIT_LEDGER, detail: SIT_RUNS_DIR, schema: SIT_RUN_SCHEMA, prefix: "SIT", passed: "passed", required: fullstack || requiresGate(SIT_GATE) },
    { gate: PERF_GATE, ledger: PERF_LEDGER, detail: PERF_RUNS_DIR, schema: PERF_RUN_SCHEMA, prefix: "PERF", passed: "judged-passed", required: fullstack || requiresGate(PERF_GATE) },
    { gate: ZAP_GATE, ledger: ZAP_LEDGER, detail: ZAP_RUNS_DIR, schema: ZAP_RUN_SCHEMA, prefix: "ZAP", passed: "passed", required: zapRequired },
  ]) {
    if (!leg.required) continue;
    requiredChecks.add(leg.gate);
    try {
      const rows = readLines(root, leg.ledger);
      if (!rows.length) reviewBlock(leg.gate === PERF_GATE ? "AUTOPILOT_PERFORMANCE_UNJUDGED" : "AUTOPILOT_REVIEW_LEDGER_NOT_PASSED", `Required ${leg.gate} has no actual run ledger`);
      pin(leg.ledger);
      if (rows.some((row, index) => row.schema !== leg.schema || row.gate !== leg.gate || row.seq !== index + 1 || row.id !== `${leg.prefix}-${String(index + 1).padStart(4, "0")}`)) reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", `Actual ${leg.gate} ledger identity is malformed`);
      const groups = leg.gate === SIT_GATE ? initial.plan.units.filter((unit) => unit.entity !== null && unit.entity !== undefined).map((unit) => unit.entity!) : leg.gate === ZAP_GATE && fullstack ? ["baseline", "api"] : [""];
      if (!groups.length) reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", "Required SIT has no planned entity denominator");
      for (const group of new Set(groups)) {
        const result = rows.filter((row) => leg.gate === SIT_GATE ? row.entity === group : leg.gate === ZAP_GATE && group ? row.mode === group : true).at(-1);
        if (!result || result.verdict !== leg.passed) reviewBlock(leg.gate === PERF_GATE ? "AUTOPILOT_PERFORMANCE_UNJUDGED" : "AUTOPILOT_REVIEW_LEDGER_NOT_PASSED", `Required ${leg.gate}/${group} is absent, failed or unjudged`);
        const detailRef = `${leg.detail}/${result.id}.json`;
        const detailPath = reviewPath(root, detailRef);
        const report = json<Record<string, unknown>>(detailPath);
        pin(detailRef);
        if (!record(report) || report.schema !== leg.schema || report.run_id !== result.id || report.verdict !== result.verdict) reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", "Run ledger does not match its producer report");
        const bound = new Set([...(qualifiedArtifacts.get(leg.gate) ?? []), ...(leg.gate === SIT_GATE ? qualifiedArtifacts.get("BUILD") ?? [] : [])]);
        const detailDigest = `sha256:${fileSha256(detailPath)}`;
        if (!bound.has(detailDigest)) reviewBlock("AUTOPILOT_REVIEW_LEDGER_UNBOUND", `Actual ${leg.gate} report lacks a qualified final-stable subject-bound GRN artifact`);
        if (leg.gate === PERF_GATE) {
          const confirmed = parsePerfThresholds(initial.sheet.thresholds ?? []);
          const assertionKeys = ["p95MaxMs", "p99MaxMs", "rpsMin", "errorRateMaxPct"] as const;
          if (!assertionKeys.some((key) => confirmed[key] !== null) || confirmed.undetermined.length || sha256OfCanonical(confirmed) !== sha256OfCanonical(result.thresholds) || sha256OfCanonical(confirmed) !== sha256OfCanonical(report.thresholds)) reviewBlock("AUTOPILOT_PERFORMANCE_UNJUDGED", "Required thresholds are unset or differ from the signed kickoff");
          pin(PERF_BUILD_MANIFEST);
          assertPerfCoverage(root, result, report, confirmed, addFinalPath);
          for (const entry of initial.sheet.thresholds ?? []) {
            for (const match of (entry.value ?? "").matchAll(/(p95|p99|rps|error_rate)\s*([<>])(?![=])\s*(\d+(?:\.\d+)?)/gi)) {
              const metric = match[1]!.toLowerCase();
              const limit = Number(match[3]);
              if ((report.rows as PerfSimRow[]).some((row) => row.assertions.some((assertion) => assertion.kind.startsWith(metric) && assertion.observed === limit))) reviewBlock("AUTOPILOT_PERFORMANCE_UNJUDGED", "Producer-normalized inclusive assertions do not satisfy the signed strict inequality at its boundary");
            }
          }
        } else if (leg.gate === SIT_GATE) {
          if (!sitBuild || result.build_fingerprint !== sitBuild.fingerprint || report.build_fingerprint !== sitBuild.fingerprint || report.entity !== group) reviewBlock("AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", "SIT report does not cover the actual final build/entity");
          const checks = report.rows as SitCheckRow[];
          const entity = manifest?.spec_snapshot.entities.find((entity) => entity.key === group);
          if (!entity || !manifest) reviewBlock("AUTOPILOT_REVIEW_INPUT_UNJUDGEABLE", "Cannot derive SIT coverage without its real domain/generation authority");
          const expected = buildSitScenario({ ...manifest.spec_snapshot, entities: [entity] }).steps;
          if (!Array.isArray(checks) || checks.length !== expected.length || !checks.length || new Set(checks.map((check) => check.id)).size !== checks.length || expected.some((step) => !checks.some((check) => check.id === step.id && check.surface === step.surface && check.kind === step.kind && ["passed", "not_applicable"].includes(check.verdict)))) reviewBlock("AUTOPILOT_REVIEW_LEDGER_NOT_PASSED", "Required SIT per-entity scenario coverage is partial or failed");
          const noIo = async (): Promise<never> => { throw new Error("Applicability-only review cannot perform IO"); };
          for (const check of checks.filter((check) => check.verdict === "not_applicable")) {
            const context: SitStepCtx = { http: noIo, db: noIo, adminBase: "", publicBase: "", actorAdmin: "", actorNone: "", appKey: manifest.spec_snapshot.app.key, entity, runSeq: 1, state: { createdIds: [1, 2, 3, 4], codes: ["A", "B", "C", "D"], createdId: 1, disabledId: 2, ownedId: 3, updatedVersion: 1 } };
            const applicability = await expected.find((step) => step.id === check.id)!.exec(context).catch(() => null);
            if (applicability?.verdict !== "not_applicable" || applicability.detail !== check.detail) reviewBlock("AUTOPILOT_REVIEW_LEDGER_NOT_PASSED", "SIT N/A is not grounded in the production domain applicability contract");
          }
          const counts = { passed: checks.filter((check) => check.verdict === "passed").length, failed: 0, not_applicable: checks.filter((check) => check.verdict === "not_applicable").length };
          if (sha256OfCanonical(counts) !== sha256OfCanonical(result.counts)) reviewBlock("AUTOPILOT_REVIEW_LEDGER_NOT_PASSED", "SIT ledger counts differ from its complete scenario report");
        } else {
          if (!manifest || !sitBuild || !Array.isArray(report.scan_targets) || !report.scan_targets.length || report.mode !== result.mode || !Array.isArray(report.findings) || report.findings.some((finding) => !record(finding) || !["IGNORE"].includes(String(finding.action)))) reviewBlock("AUTOPILOT_REVIEW_LEDGER_NOT_PASSED", "Required ZAP scan coverage/identity is missing or non-green");
          const targets = Object.keys(manifest.spec_snapshot.surfaces).map((surface) => `${result.mode}:${surface}`).sort();
          if (JSON.stringify([...report.scan_targets].sort()) !== JSON.stringify(targets)) reviewBlock("AUTOPILOT_REVIEW_LEDGER_NOT_PASSED", "ZAP report omits or duplicates a deployment surface");
        }
        if (!(artifactSurfaces.get(detailDigest) ?? []).some((surface) => [...requiredFinalPaths, ...(leg.gate === ZAP_GATE ? [SIT_BUILD_MANIFEST] : [])].every((ref) => surface.includes(ref)))) reviewBlock("AUTOPILOT_REVIEW_LEDGER_UNBOUND", `Actual ${leg.gate} report is not source-bound to the complete final build`);
      }
    } catch (error) { blockers.push(reviewError(error)); }
  }
  if (!finalVerificationSurfaces.some((surface) => [...requiredFinalPaths].every((path) => surface.includes(path))) && !blockers.some((blocker) => blocker.code === "AUTOPILOT_REVIEW_FINAL_BUILD_MISSING")) blockers.push({ code: "AUTOPILOT_REVIEW_FINAL_BUILD_MISSING", message: "Final evidence omits authoritative source/build/simulation paths", hint: "Verify one merged snapshot over the complete expanded dependency surface" });
  const cases = json<{ cases: { id: string; source_refs: string[] }[] }>(reviewPath(root, `.pomaster/qa/${initial.current.sheet}/cases-frozen.json`)).cases;
  const requirementReview = loaded.data.items.map((item) => ({ id: item.id, text: item.text, source: item.origin, qa_cases: cases.filter((entry) => entry.source_refs.includes(item.id)).map((entry) => entry.id), task_scope: taskIds, mapping: "expanded_unknown" as const }));
  // Dependency gaps expand verification; they cannot imply exact item-to-code attribution.
  await authority(root, input.executionId, taskIds);
  return { schema: PROJECT_REVIEW_SCHEMA, round: initial.current.sheet, execution_id: input.executionId, ready: blockers.length === 0, blockers, tasks, dependencies, input_files: inputFiles, input_roots: inputRoots, code_paths: codePaths, build_paths: buildPaths, required_final_paths: [...requiredFinalPaths].sort(), required_project_checks: [...requiredChecks].sort(), requirement_review: requirementReview, candidates, candidate_inputs: input.candidates ?? [], qa_isolation: "not_isolated", qa_limitation: "No verifiable host write/held-out-read enforcement; different sessions or labels do not establish isolation." };
}

export async function runAutopilotReviewDraft(root: string, input: ReviewDraftInput): Promise<CommandOutcome<ReviewDraftResult | null>> {
  try {
    const snapshot = await collectReview(root, input);
    const review_ref = persistReviewBlob(root, snapshot);
    return okOutcome("autopilot review draft", { ...snapshot, review_ref }, [`project review ${review_ref}: ${snapshot.ready ? "awaiting human decision" : "BLOCKED progress report"}; QA not_isolated`]);
  } catch (error) { return failOutcome("autopilot review draft", null, [reviewError(error)], []); }
}

/** Recheck signed bytes, membership, live permits and all current machine obligations. */
export async function validateProjectReview(root: string, ref: string, allowAppliedCandidates = false): Promise<ProjectReviewSnapshot> {
  const snapshot = readReviewBlob<ProjectReviewSnapshot>(root, ref);
  if (snapshot.schema !== PROJECT_REVIEW_SCHEMA || !Array.isArray(snapshot.tasks) || !snapshot.dependencies || !Array.isArray(snapshot.candidates)) reviewBlock("AUTOPILOT_REVIEW_TAMPERED", "Invalid project review schema");
  for (const [path, digest] of Object.entries(snapshot.dependencies)) {
    const current = existsSync(reviewPath(root, path)) ? fileSha256(reviewPath(root, path)) : null;
    const applied = allowAppliedCandidates && snapshot.candidates.find((candidate) => candidate.target === path && candidate.after_sha256 === current);
    if (current !== digest && !applied) reviewBlock("AUTOPILOT_REVIEW_STALE", `Reviewed dependency changed: ${path}`);
  }
  for (const [source, digest] of Object.entries(snapshot.input_files)) if (!existsSync(source) || fileSha256(source) !== digest) reviewBlock("AUTOPILOT_REVIEW_STALE", `Reviewed input changed: ${source}`);
  const state = await authority(root, snapshot.execution_id, snapshot.tasks.map((task) => task.task));
  if (JSON.stringify(state.plan.units.map((unit) => unit.id).sort()) !== JSON.stringify(snapshot.tasks.map((task) => task.task))) reviewBlock("AUTOPILOT_REVIEW_STALE", "Plan TASK denominator changed");
  const index = await loadTruthIndex(loadStoreReadOnly(root));
  for (const task of snapshot.tasks) {
    const row = index.objects.find((entry) => entry.id === task.task);
    if (!row || acceptRevisionFingerprint(json(reviewPath(root, `.pomaster/${row.bodyRef}`))) !== task.semantic_revision) reviewBlock("AUTOPILOT_REVIEW_STALE", `TASK semantic revision changed: ${task.task}`);
    const assessment = await assessCloseoutMachine(root, { taskId: task.task });
    if (snapshot.ready && !assessment.ok) reviewBlock("AUTOPILOT_REVIEW_STALE", `Machine obligations no longer satisfied: ${task.task}`);
  }
  const recomputed = await collectReview(root, { executionId: snapshot.execution_id, codePaths: snapshot.code_paths, buildPaths: snapshot.build_paths, candidates: snapshot.candidate_inputs }, allowAppliedCandidates ? snapshot.candidates : []);
  if (sha256OfCanonical(recomputed) !== sha256OfCanonical(snapshot)) reviewBlock("AUTOPILOT_REVIEW_STALE", "Review is not the exact production-derived snapshot of current obligations, dependencies and candidates");
  return snapshot;
}

export interface ReviewViewResult { readonly review_ref: string; readonly current: boolean; readonly snapshot: ProjectReviewSnapshot }
/** Historical content remains readable even when it no longer authorizes a decision. */
export async function runAutopilotReviewView(root: string, input: { readonly reviewRef: string }): Promise<CommandOutcome<ReviewViewResult | null>> {
  let snapshot: ProjectReviewSnapshot | null = null;
  try {
    snapshot = readReviewBlob<ProjectReviewSnapshot>(root, input.reviewRef);
    await validateProjectReview(root, input.reviewRef, true);
    return okOutcome("autopilot review view", { review_ref: input.reviewRef, current: true, snapshot }, [
      `project review ${input.reviewRef}: ${snapshot.ready ? "machine ready; human acceptance still required" : "BLOCKED progress report"}`,
      JSON.stringify(snapshot, null, 2),
    ]);
  } catch (error) {
    return failOutcome("autopilot review view", snapshot === null ? null : { review_ref: input.reviewRef, current: false, snapshot }, [reviewError(error)], ["Immutable historical review; stale or damaged content cannot authorize acceptance"]);
  }
}

export function decisionConsumptionOwner(intent: unknown): string { return `autopilot review decide:${sha256OfCanonical(intent)}`; }
export async function loadAcceptedProjectDecision(root: string, decisionRef: string): Promise<{ decision: ProjectDecision; snapshot: ProjectReviewSnapshot }> {
  reviewTrustBoundary(root);
  const decision = readReviewBlob<ProjectDecision>(root, decisionRef);
  if (decision.schema !== PROJECT_DECISION_SCHEMA || decision.verdict !== "ACCEPT") reviewBlock("AUTOPILOT_REVIEW_NOT_ACCEPTED", "Only a project Human ACCEPT may apply or close out");
  const { review_ref, verdict, affected_units, reason } = decision;
  const statement = projectReviewStatement(review_ref, verdict, affected_units, reason);
  const intent = { review_ref, verdict, affected_units, reason, signoff: decision.signoff.signoff };
  if (!decision.signoff.signoff || decision.signoff.assurance === "self_attested") reviewBlock("TRUST_SIGNOFF_REQUIRED", "Project acceptance never falls back to self-attestation");
  const verified = verifySignoff(root, decision.signoff.signoff, { kind: "accept", ...statementSubject(statement) }, { consume: false, requireConsumed: true, requireConsumedBy: decisionConsumptionOwner(intent) });
  if (!verified.ok) throw new ReviewBlocked(verified.error);
  if (verified.record.principal !== decision.signoff.principal || verified.record.fingerprint !== decision.signoff.fingerprint || verified.record.assurance !== decision.signoff.assurance) reviewBlock("AUTOPILOT_REVIEW_TAMPERED", "Decision signer differs from the consumed signature");
  const snapshot = await validateProjectReview(root, decision.review_ref, true);
  if (!snapshot.ready || snapshot.blockers.length !== 0) reviewBlock("AUTOPILOT_REVIEW_NOT_READY", "A blocked progress report is not an acceptable project snapshot");
  return { decision, snapshot };
}

export async function runAutopilotReviewDecide(root: string, input: { readonly reviewRef: string; readonly verdict: ProjectVerdict; readonly affectedUnits?: readonly string[]; readonly reason?: string; readonly signoff?: string }, env: { readonly trust?: TrustEnv; readonly beforeConsume?: () => void; readonly afterConsume?: () => void } = {}): Promise<CommandOutcome<ReviewDecisionResult | null>> {
  try {
    reviewTrustBoundary(root);
    const registry = loadRegistry(root);
    if (registry.state !== "ok") reviewBlock(registry.state === "absent" ? "TRUST_NOT_ENROLLED" : "TRUST_REGISTRY_INVALID", "Project human decisions require an enrolled signer");
    if (!input.signoff) reviewBlock("TRUST_SIGNOFF_REQUIRED", "Missing human signature for project decision");
    if (!["ACCEPT", "REWORK", "REJECT"].includes(input.verdict)) reviewBlock("SCHEMA_INVALID", "Invalid project decision");
    const snapshot = await validateProjectReview(root, input.reviewRef);
    const affected = [...new Set(input.affectedUnits ?? [])].sort();
    const reason = (input.reason ?? "").trim();
    if (affected.some((task) => !snapshot.tasks.some((entry) => entry.task === task)) || (input.verdict === "REWORK" && (affected.length === 0 || !reason)) || (input.verdict !== "REWORK" && affected.length !== 0)) reviewBlock("SCHEMA_INVALID", "REWORK requires a scoped listed TASK subset and reason; ACCEPT/REJECT cannot narrow the denominator");
    if (input.verdict === "ACCEPT" && !snapshot.ready) reviewBlock("AUTOPILOT_REVIEW_NOT_READY", "Machine obligations are blocked");
    const intent = { review_ref: input.reviewRef, verdict: input.verdict, affected_units: affected, reason, signoff: input.signoff };
    const owner = decisionConsumptionOwner(intent);
    const intentPath = reviewPath(root, `${PROJECT_REVIEW_DIR}/decisions/${owner.split("sha256:")[1]}.json`);
    const exists = existsSync(intentPath);
    const subject = statementSubject(projectReviewStatement(input.reviewRef, input.verdict, affected, reason));
    const precheck = verifySignoff(root, input.signoff, { kind: "accept", ...subject }, { consume: false, ...(exists ? { allowConsumed: true, requireConsumedBy: owner } : {}), env: env.trust });
    if (!precheck.ok) throw new ReviewBlocked(precheck.error);
    if (!exists) {
      mkdirSync(dirname(intentPath), { recursive: true });
      writeFileSync(intentPath, `${JSON.stringify(intent, null, 2)}\n`, { flag: "wx" });
    } else if (sha256OfCanonical(json(intentPath)) !== sha256OfCanonical(intent)) reviewBlock("AUTOPILOT_REVIEW_TAMPERED", "Decision recovery intent changed");
    env.beforeConsume?.();
    await validateProjectReview(root, input.reviewRef); // immediately before consumption
    const proof = verifySignoff(root, input.signoff, { kind: "accept", ...subject }, { consume: true, ...(exists ? { allowConsumed: true, requireConsumedBy: owner } : {}), env: env.trust, consumedBy: owner });
    if (!proof.ok) throw new ReviewBlocked(proof.error);
    env.afterConsume?.();
    const decision: ProjectDecision = { schema: PROJECT_DECISION_SCHEMA, review_ref: input.reviewRef, verdict: input.verdict, affected_units: affected, reason, signoff: proof.record };
    const decisionRef = persistReviewBlob(root, decision);
    if (input.verdict === "REWORK") {
      // Recover idempotently through the existing scoped suspension/escalation ledgers.
      for (const unit of affected) {
        const marker = `${decisionRef}: ${reason}`;
        const ledger = reviewPath(root, ".pomaster/autopilot/suspensions.jsonl");
        const previous = existsSync(ledger) ? readFileSync(ledger, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as { unit: string; reason_zh: string; action: string }) : [];
        if (!previous.some((entry) => entry.unit === unit && entry.reason_zh === marker && entry.action === "suspend")) {
          await validateProjectReview(root, input.reviewRef);
          const out = runAutopilotSuspend(root, { unit, reason: marker });
          if (!out.ok) throw new ReviewBlocked(out.errors[0]!);
        }
      }
      const ledger = reviewPath(root, ".pomaster/autopilot/escalations.jsonl");
      if (!existsSync(ledger) || !readFileSync(ledger, "utf8").includes(decisionRef)) {
        const out = runAutopilotEscalateRecord(root, { context: "plan", subject: decisionRef, reason, refs: affected });
        if (!out.ok) throw new ReviewBlocked(out.errors[0]!);
      }
    }
    return okOutcome("autopilot review decide", { decision_ref: decisionRef, verdict: input.verdict }, [`project Human ${input.verdict}: ${decisionRef}`]);
  } catch (error) { return failOutcome("autopilot review decide", null, [reviewError(error)], []); }
}

export async function validateProjectAcceptForCloseout(root: string, decisionRef: string, task: string, revision: string): Promise<{ receipt: CloseoutAcceptReceipt; executionId: string; permitRef: string } | { error: CliError }> {
  try {
    const { snapshot } = await loadAcceptedProjectDecision(root, decisionRef);
    if (!snapshot.tasks.some((entry) => entry.task === task && entry.semantic_revision === revision)) reviewBlock("AUTOPILOT_REVIEW_TASK_NOT_ACCEPTED", "Project ACCEPT does not cover this exact TASK semantic version");
    if (snapshot.candidates.some((candidate) => fileSha256(reviewPath(root, candidate.target)) !== candidate.after_sha256)) reviewBlock("AUTOPILOT_REVIEW_APPLY_INCOMPLETE", "Reviewed candidates must be applied before TASK closeout");
    const current = await authority(root, snapshot.execution_id, [task]);
    return { receipt: { decision_id: decisionRef, graph: `evidence/${storagePathOfSha256(decisionRef)}` }, executionId: snapshot.execution_id, permitRef: current.permits[task]! };
  } catch (error) { return { error: reviewError(error) }; }
}
