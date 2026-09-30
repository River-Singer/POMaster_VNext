import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXECUTION_ID_PATTERN,
  PLAN_CAPABILITY_GATE_NAMES,
  assertRunSourceSnapshot,
  buildStorePaths,
  createStore,
  loadTruthIndex,
  persistEvidenceArtifact,
  readExecutionRecordById,
  sha256OfBytes,
  storagePathOfSha256,
  verifyEvidenceBinding,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { runCloseout } from "./closeout.js";
import { runPlanRun, type PlanDiagnosisEnvelope, type PlanRunInput } from "./plan-runner.js";
import { parseActorArgv } from "./permit.js";
import { judgeRunSourceStability } from "./source-snapshot.js";
import { runViewReview } from "./view.js";

export const FINALIZE_STAGES = ["PREFLIGHT", "VERIFYING", "VERIFY_BLOCKED", "AWAITING_REPLAY_REVIEW", "REPLAY_BLOCKED", "AWAITING_INDEPENDENT_VERIFICATION", "NEW_CLAIM_REQUIRED", "AWAITING_HUMAN_ACCEPT", "READY_FOR_CLOSEOUT", "CLOSEOUT_BLOCKED", "COMPLETED"] as const;
export type FinalizeStage = typeof FINALIZE_STAGES[number];

export interface FinalizeResult {
  readonly schema: "pomaster.finalize/v1";
  readonly task: string;
  readonly stage: FinalizeStage;
  readonly completed: boolean;
  readonly review_range: string | null;
  readonly verification_execution_id: string | null;
  readonly plan_fingerprint: string | null;
  readonly replay_receipt: string | null;
  readonly diagnostics: readonly PlanDiagnosisEnvelope[];
  readonly errors: readonly CliError[];
  readonly next_actions: readonly { readonly actor: "independent_verifier" | "human_owner" | "implementer"; readonly command: string; readonly reason: string }[];
}

export interface FinalizeStatusInput { readonly taskRef: string }
export interface FinalizeRunInput extends Omit<PlanRunInput, "taskRef"> {
  readonly taskRef: string;
  readonly reviewRange: string;
  readonly replayReceipt?: string;
  /** 与 verification execution 配对的主体词形；存在 mapped claim 时必填并前置拒绝自批。 */
  readonly verifier?: string;
}

export interface FinalizeReplayAdjudicateInput {
  readonly taskRef: string;
  readonly reviewRange: string;
  readonly planFingerprint: string;
  readonly executionId: string;
  readonly reviewedBy: string;
  readonly verdict: "allow-closeout" | "block-closeout";
  readonly note?: string;
}

export interface FinalizeReplayAdjudicateResult {
  readonly schema: "pomaster.replay-adjudication-issued/v1";
  readonly receipt_ref: string | null;
  readonly storage_path: string | null;
  readonly task_ref: string;
  readonly plan_fingerprint: string;
  readonly verdict: "allow-closeout" | "block-closeout" | null;
}

interface ReplayReceipt {
  readonly schema: "pomaster.replay-adjudication/v1";
  readonly task_ref: string;
  readonly review_range: string;
  readonly plan_fingerprint: string;
  readonly reviewed_by: string;
  readonly reviewer_execution_id: string;
  readonly verdict: "allow-closeout" | "block-closeout";
  readonly issued_at: string;
  readonly issuer: "pomaster.finalize.replay-adjudicate/v1";
  readonly note: string | null;
}

function base(task: string): FinalizeResult { return { schema: "pomaster.finalize/v1", task, stage: "PREFLIGHT", completed: false, review_range: null, verification_execution_id: null, plan_fingerprint: null, replay_receipt: null, diagnostics: [], errors: [], next_actions: [] }; }

async function taskLifecycle(rootDir: string, taskRef: string): Promise<string | null> {
  try {
    const paths = buildStorePaths(rootDir);
    const index = await loadTruthIndex(await createStore(rootDir));
    const row = index.objects.find((entry) => entry.id === taskRef);
    if (!row) return null;
    const body = JSON.parse(readFileSync(join(paths.pomasterDir, ...row.bodyRef.split("/")), "utf8")) as { axes?: { lifecycle?: unknown; evidence?: unknown } };
    if (body.axes?.evidence === "VERIFIED") return "COMPLETED";
    return typeof body.axes?.lifecycle === "string" ? body.axes.lifecycle : null;
  } catch { return null; }
}

export async function runFinalizeStatus(rootDir: string, input: FinalizeStatusInput): Promise<CommandOutcome<FinalizeResult>> {
  const lifecycle = await taskLifecycle(rootDir, input.taskRef);
  if (lifecycle === "COMPLETED") return okOutcome("finalize status", { ...base(input.taskRef), stage: "COMPLETED", completed: true }, [`finalize ${input.taskRef} → COMPLETED`]);
  if (lifecycle === null) return failOutcome("finalize status", base(input.taskRef), [{ code: "OBJECT_NOT_FOUND", message: `任务不存在或不可读：${input.taskRef}`, hint: "确认 TASK 引用与 store 完整性后重试。" }], [`finalize ${input.taskRef} → PREFLIGHT blocked`]);
  const cohort = await latestPlanCohort(rootDir, input.taskRef);
  if (cohort === null) {
    const result = { ...base(input.taskRef), stage: "PREFLIGHT" as const, next_actions: [{ actor: "implementer" as const, command: `pomaster finalize run ${input.taskRef} --verification-execution-id <AGX-*> --review-range <git-range>`, reason: "尚无可绑定 plan fingerprint 的 GRN。" }] };
    return okOutcome("finalize status", result, [`finalize ${input.taskRef} → PREFLIGHT`]);
  }
  const common = { ...base(input.taskRef), plan_fingerprint: cohort.fingerprint, verification_execution_id: cohort.executionId };
  if (!cohort.allPassed) {
    // 分母缺失/源码不稳定/worker-local 排除三型分流显式（W1-FR04：缺场景 ≠ 工具
    // verdict 失败；W2-FR05：源码不稳定 ≠ 非 passed——verdict 照实保留不自动改判；
    // W2-FR11 Case D：worker-local 保留在盘不入终验分母）。键词形 accRef / scenario / gate。
    const reasons: string[] = [];
    if (cohort.missingKeys.length > 0) {
      reasons.push(`当前 plan fingerprint 的 GRN 分母缺失（场景义务未满足）：${cohort.missingKeys.map((key) => key.split("\0").join(" / ")).join("；")}`);
    }
    if (cohort.workerLocalExcluded > 0) {
      reasons.push(`${cohort.workerLocalExcluded} 条 worker-local 证据保留在盘（append-only 不删除），不入终验分母——由编排器在稳定窗口终验后入列`);
    }
    if (cohort.sourceUnstableKeys.length > 0) {
      reasons.push(`GRN 源码稳定性不合格（运行窗口漂移或证据产出后相关源码已变化；source 未知不能 fresh），终验不得复用该绿：${cohort.sourceUnstableKeys.map((key) => key.split("\0").join(" / ")).join("；")}`);
    }
    const reason = reasons.length > 0 ? reasons.join("；") : "当前 plan fingerprint 的 GRN 存在非 passed。";
    const result = { ...common, stage: "VERIFY_BLOCKED" as const, next_actions: [{ actor: "implementer" as const, command: `pomaster finalize run ${input.taskRef} --verification-execution-id ${cohort.executionId ?? "<AGX-*>"} --review-range <git-range>`, reason }] };
    return okOutcome("finalize status", result, [`finalize ${input.taskRef} → VERIFY_BLOCKED`]);
  }
  const replay = latestReplayReceipt(rootDir, input.taskRef, cohort.fingerprint);
  if (replay === null) {
    const result = { ...common, stage: "AWAITING_REPLAY_REVIEW" as const, next_actions: [{ actor: "independent_verifier" as const, command: `pomaster finalize replay-adjudicate ${input.taskRef} --plan-fingerprint ${cohort.fingerprint} --review-range <git-range> --execution-id <AGX-*> --reviewed-by <type:name> --verdict <allow-closeout|block-closeout>`, reason: "缺少由受信签发入口持久化的 replay receipt。" }] };
    return okOutcome("finalize status", result, [`finalize ${input.taskRef} → AWAITING_REPLAY_REVIEW`]);
  }
  const withReplay = { ...common, review_range: replay.receipt.review_range, replay_receipt: replay.ref };
  if (replay.receipt.verdict === "block-closeout") {
    return okOutcome("finalize status", { ...withReplay, stage: "REPLAY_BLOCKED", next_actions: [{ actor: "implementer", command: `pomaster finalize replay-adjudicate ${input.taskRef} --plan-fingerprint ${cohort.fingerprint} --review-range ${replay.receipt.review_range} --execution-id <AGX-*> --reviewed-by <type:name> --verdict allow-closeout`, reason: "最新受信 replay 裁决阻断 closeout；修复后须重新独立复盘并签发新回执。" }] }, [`finalize ${input.taskRef} → REPLAY_BLOCKED`]);
  }
  const packet = await runViewReview(rootDir, { task: input.taskRef });
  if (!packet.ok) return failOutcome("finalize status", { ...withReplay, errors: packet.errors }, packet.errors, [`finalize ${input.taskRef} → status projection failed`]);
  const expected = packet.result.expected.acceptance;
  if (expected.length === 0 || expected.some((row) => row.claim === null || row.claim_verdict === null || ["PARTIALLY_VERIFIED", "REJECTED"].includes(row.claim_verdict))) {
    return okOutcome("finalize status", { ...withReplay, stage: "NEW_CLAIM_REQUIRED", next_actions: [{ actor: "implementer", command: "pomaster record claim --from <new-claim.json>", reason: "acceptance 缺映射 claim、claim 缺失或已有不可覆写的非绿裁决。" }] }, [`finalize ${input.taskRef} → NEW_CLAIM_REQUIRED`]);
  }
  if (expected.some((row) => row.claim_verdict !== "VERIFIED")) {
    return okOutcome("finalize status", { ...withReplay, stage: "AWAITING_INDEPENDENT_VERIFICATION", next_actions: [{ actor: "independent_verifier", command: "pomaster record verification --clm <CLM-*> --verifier <type:name> --execution-id <AGX-*>", reason: "映射 claim 尚未 VERIFIED。" }] }, [`finalize ${input.taskRef} → AWAITING_INDEPENDENT_VERIFICATION`]);
  }
  const mappedClaims = new Set(expected.flatMap((row) => row.claim === null ? [] : [row.claim]));
  const selfApproved = taskClaimFacts(rootDir, input.taskRef).find((claim) => mappedClaims.has(claim.clm) && claim.assertedBy !== null && claim.assertedBy === claim.recomputedBy);
  if (selfApproved !== undefined) {
    return okOutcome("finalize status", { ...withReplay, stage: "NEW_CLAIM_REQUIRED", next_actions: [{ actor: "implementer", command: "pomaster record claim --from <new-claim.json>", reason: `${selfApproved.clm} 为同主体自批 VERIFIED；既有裁决不可覆写。` }] }, [`finalize ${input.taskRef} → NEW_CLAIM_REQUIRED`]);
  }
  if (packet.result.accept_receipt.status !== "present") {
    return okOutcome("finalize status", { ...withReplay, stage: "AWAITING_HUMAN_ACCEPT", next_actions: [{ actor: "human_owner", command: `pomaster view review ${input.taskRef}`, reason: packet.result.accept_receipt.detail ?? "缺少有效 Human ACCEPT 回执。" }] }, [`finalize ${input.taskRef} → AWAITING_HUMAN_ACCEPT`]);
  }
  return okOutcome("finalize status", { ...withReplay, stage: "READY_FOR_CLOSEOUT", next_actions: [{ actor: "implementer", command: `pomaster finalize run ${input.taskRef} --verification-execution-id ${cohort.executionId ?? "<AGX-*>"} --review-range ${replay.receipt.review_range} --replay-receipt ${replay.ref}`, reason: "GRN、replay、claim verification 与 ACCEPT 均在座；重放 run 交由 closeout 唯一判卷器施断。" }] }, [`finalize ${input.taskRef} → READY_FOR_CLOSEOUT`]);
}

function actorLabel(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return typeof row["actor_type"] === "string" && typeof row["actor"] === "string" ? `${row["actor_type"]}:${row["actor"]}` : null;
}

function taskClaimFacts(rootDir: string, taskRef: string): Array<{ clm: string; assertedBy: string | null; recomputedBy: string | null; executionId: string | null; verdict: string | null }> {
  const facts: Array<{ clm: string; assertedBy: string | null; recomputedBy: string | null; executionId: string | null; verdict: string | null }> = [];
  try {
    for (const name of readdirSync(buildStorePaths(rootDir).claimsDir).filter((file) => /^CLM-[0-9]+\.json$/.test(file)).sort()) {
      const row = JSON.parse(readFileSync(join(buildStorePaths(rootDir).claimsDir, name), "utf8")) as Record<string, unknown>;
      const subject = row["subject"] as Record<string, unknown> | undefined;
      if (subject?.["object_id"] !== taskRef && row["subject_id"] !== taskRef) continue;
      const verification = row["verification"] as Record<string, unknown> | undefined;
      facts.push({ clm: name.slice(0, -5), assertedBy: actorLabel(row["asserted_by"]), recomputedBy: actorLabel(verification?.["recomputed_by"]), executionId: typeof row["execution_id"] === "string" ? row["execution_id"] : null, verdict: typeof verification?.["verdict"] === "string" ? verification["verdict"] : null });
    }
  } catch { /* status/read preflight will surface missing facts through closeout/view */ }
  return facts;
}

async function mappedTaskClaimFacts(rootDir: string, taskRef: string): Promise<ReturnType<typeof taskClaimFacts>> {
  try {
    const paths = buildStorePaths(rootDir);
    const index = await loadTruthIndex(await createStore(rootDir));
    const row = index.objects.find((entry) => entry.id === taskRef);
    if (row === undefined) return [];
    const body = JSON.parse(readFileSync(join(paths.pomasterDir, ...row.bodyRef.split("/")), "utf8")) as Record<string, unknown>;
    const payload = body["payload"] as Record<string, unknown> | undefined;
    const acceptance = Array.isArray(payload?.["acceptance"]) ? payload["acceptance"] : [];
    const mapped = new Set(acceptance.flatMap((entry) => entry !== null && typeof entry === "object" && typeof (entry as Record<string, unknown>)["claim"] === "string" ? [(entry as Record<string, unknown>)["claim"] as string] : []));
    return taskClaimFacts(rootDir, taskRef).filter((claim) => mapped.has(claim.clm));
  } catch { return []; }
}

function planFingerprintOf(row: Record<string, unknown>): string | null {
  const result = (row["gate_result"] as Record<string, unknown> | undefined)?.["result"] as Record<string, unknown> | undefined;
  const note = ((result?.["scope"] as Record<string, unknown> | undefined)?.["note"]);
  const field = typeof note === "string" ? note.split("；").find((part) => part.startsWith("inputs_fingerprint=")) : undefined;
  return field?.slice("inputs_fingerprint=".length) ?? null;
}

/**
 * 终验义务分母（W1-FR04 起含场景键）：acceptance 无场景 → key=`<accRef>\0<gate>`
 * （legacy 字节不变）；acceptance 声明场景 → 逐场景展开 key=`<accRef>\0<scenario>\0<gate>`
 * ——与 latestPlanCohort 的 cohort 键同构（两侧不同步则同 gate 多场景互相覆盖，
 * research §3 明确警告）。scenarios 词形垃圾由 plan compile kernel fail-closed 拒绝，
 * 此处坏行跳过（不进分母也不判假绿——缺键必然 allPassed=false）。
 */
async function requiredPlanKeys(rootDir: string, taskRef: string): Promise<Set<string>> {
  const required = new Set<string>();
  try {
    const paths = buildStorePaths(rootDir);
    const index = await loadTruthIndex(await createStore(rootDir));
    const row = index.objects.find((entry) => entry.id === taskRef);
    if (row === undefined) return required;
    const body = JSON.parse(readFileSync(join(paths.pomasterDir, ...row.bodyRef.split("/")), "utf8")) as Record<string, unknown>;
    const payload = body["payload"] as Record<string, unknown> | undefined;
    const acceptance = Array.isArray(payload?.["acceptance"]) ? payload["acceptance"] : [];
    acceptance.forEach((raw, indexNumber) => {
      if (raw === null || typeof raw !== "object") return;
      const record = raw as Record<string, unknown>;
      const capabilities = Array.isArray(record["requires"]) ? record["requires"] as unknown[] : [];
      const scenarioRefs = Array.isArray(record["scenarios"])
        ? (record["scenarios"] as unknown[]).flatMap((scenario) =>
            scenario !== null && typeof scenario === "object" && typeof (scenario as Record<string, unknown>)["scenario_ref"] === "string"
              ? [(scenario as Record<string, unknown>)["scenario_ref"] as string]
              : [],
          )
        : [];
      // key 词形：无场景（或缺席/空数组）→ `<accRef>\0<gate>`（legacy 字节不变）；
      // 声明场景 → 逐场景 `<accRef>\0<scenario>\0<gate>`。
      const scenarioKeys: readonly (string | null)[] = scenarioRefs.length === 0 ? [null] : scenarioRefs;
      for (const capability of capabilities) {
        if (typeof capability !== "string" || !(capability in PLAN_CAPABILITY_GATE_NAMES)) continue;
        for (const gate of PLAN_CAPABILITY_GATE_NAMES[capability as keyof typeof PLAN_CAPABILITY_GATE_NAMES]) {
          for (const scenarioKey of scenarioKeys) {
            required.add(scenarioKey === null
              ? `${taskRef}#acceptance[${indexNumber}]\0${gate}`
              : `${taskRef}#acceptance[${indexNumber}]\0${scenarioKey}\0${gate}`);
          }
        }
      }
    });
  } catch { /* malformed task is handled by the existing status/preflight paths */ }
  return required;
}

/** cohort 条目（键随行：W1-FR04 场景键 + W2-FR04 source 稳定性/用途呈报共用锚）。 */
interface CohortEntry {
  readonly key: string;
  readonly row: Record<string, unknown>;
  readonly result: Record<string, unknown>;
  readonly name: string;
}

/**
 * 终验 cohort 的源码稳定性判定（W2-FR05 消费闸；kernel 唯一比较核经
 * judgeRunSourceStability 单点）：主张了 source_snapshot 的 cohort 条目——运行窗口
 * fresh 且产出时相关面与当前捕获一致方可入列（相关源码已变化/窗口漂移/不可判的证据
 * 不证明稳定终态，终验不得复用该绿；source 未知不能 fresh）。legacy 无 snapshot 缺席
 * 诚实放行（不反填、不全局硬拒绝——既有资格行为零改动）。快照损坏按不稳定计
 * （关键证据畸形禁静默当合格）。
 */
function cohortSourceUnstableKeys(rootDir: string, entries: readonly CohortEntry[]): string[] {
  const unstable: string[] = [];
  for (const entry of entries) {
    const snapshot = entry.row["source_snapshot"];
    if (snapshot === undefined) continue;
    try {
      assertRunSourceSnapshot(snapshot);
      if (!judgeRunSourceStability(rootDir, snapshot).stable) unstable.push(entry.key);
    } catch {
      unstable.push(entry.key);
    }
  }
  return unstable;
}

async function latestPlanCohort(rootDir: string, taskRef: string): Promise<{ fingerprint: string; executionId: string | null; allPassed: boolean; missingKeys: readonly string[]; sourceUnstableKeys: readonly string[]; workerLocalExcluded: number } | null> {
  try {
    const runsDir = buildStorePaths(rootDir).runsDir;
    const rows = readdirSync(runsDir).filter((name) => /^GRN-[0-9]+\.json$/.test(name)).map((name) => {
      const row = JSON.parse(readFileSync(join(buildStorePaths(rootDir).runsDir, name), "utf8")) as Record<string, unknown>;
      const result = (row["gate_result"] as Record<string, unknown> | undefined)?.["result"] as Record<string, unknown> | undefined;
      return { name, n: Number(name.slice(4, -5)), row, result, fingerprint: planFingerprintOf(row) };
    }).filter((entry) => entry.result?.["subject_id"] === taskRef && entry.fingerprint !== null).sort((a, b) => b.n - a.n);
    const latest = rows[0];
    if (latest === undefined || latest.fingerprint === null) return null;
    const cohort = rows.filter((entry) => entry.fingerprint === latest.fingerprint && entry.row["execution_id"] === latest.row["execution_id"]);
    const latestByObligation = new Map<string, CohortEntry>();
    let workerLocalExcluded = 0;
    for (const entry of cohort) {
      const note = ((entry.result?.["scope"] as Record<string, unknown> | undefined)?.["note"]);
      const parts = typeof note === "string" ? note.split("；") : [];
      const acceptance = parts.find((part) => part.startsWith("acceptance_ref="))?.slice("acceptance_ref=".length);
      // W1-FR04：cohort 键含场景身份（与 requiredPlanKeys 同构：无场景 marker =
      // 两段键 `<acc>\0<gate>`（legacy 字节不变）；带场景 = 三段键 `<acc>\0<scenario>\0<gate>`）
      // ——同 gate 不同场景不得互相覆盖。
      const scenario = parts.find((part) => part.startsWith("scenario_ref="))?.slice("scenario_ref=".length) ?? "";
      const key = scenario === ""
        ? `${acceptance ?? ""}\0${String(entry.result?.["gate"] ?? "")}`
        : `${acceptance ?? ""}\0${scenario}\0${String(entry.result?.["gate"] ?? "")}`;
      // W2-FR11（Case D 归属）：worker-local 证据保留在盘（append-only 零删除）但不入
      // 终验分母——终验只消费符合终验归属的证据；被排除的键由编排器在稳定窗口重新
      // 机器验证补齐。未声明用途（legacy/历史 GRN）不排除（不全局硬拒绝）。
      if (entry.row["evidence_purpose"] === "worker_local") {
        workerLocalExcluded += 1;
        continue;
      }
      if (!latestByObligation.has(key)) latestByObligation.set(key, { key, row: entry.row, result: entry.result ?? {}, name: entry.name });
    }
    const actual = new Set(latestByObligation.keys());
    const required = await requiredPlanKeys(rootDir, taskRef);
    const currentRows = [...latestByObligation.values()];
    const passedAndBound = currentRows.every((entry) => entry.result?.["verdict"] === "passed" && (entry.result?.["gate"] !== "CONTROL_DATA_FLOW_RUNTIME" || verifyEvidenceBinding({ runRecordPath: join(runsDir, entry.name), evidenceDir: buildStorePaths(rootDir).evidenceDir }).bound));
    // W1-FR04 回放可诊断：缺失义务键显式点名（分母缺失型 VERIFY_BLOCKED 与「存在
    // 非 passed」 verdict 型失败分流呈现——禁把缺场景误报成工具失败）。
    const missingKeys = [...required].filter((key) => !actual.has(key)).sort();
    // W2-FR05 源码稳定性（Case D 资格闸）：窗口漂移/产出后相关源码变化/不可判 → 该键
    // 的证据不满足终验（verdict 照实保留，不自动改判；重验由 plan run 补执行承担）。
    const sourceUnstableKeys = cohortSourceUnstableKeys(rootDir, currentRows);
    return {
      fingerprint: latest.fingerprint,
      executionId: typeof latest.row["execution_id"] === "string" ? latest.row["execution_id"] : null,
      allPassed: currentRows.length > 0 && passedAndBound && required.size > 0 && missingKeys.length === 0 && sourceUnstableKeys.length === 0,
      missingKeys,
      sourceUnstableKeys,
      workerLocalExcluded,
    };
  } catch { return null; }
}

function parseTrustedReceipt(bytes: Buffer, expectedSha: string): ReplayReceipt | null {
  if (sha256OfBytes(bytes) !== expectedSha) return null;
  try {
    const row = JSON.parse(bytes.toString("utf8")) as Partial<ReplayReceipt>;
    if (row.schema !== "pomaster.replay-adjudication/v1" || row.issuer !== "pomaster.finalize.replay-adjudicate/v1"
      || typeof row.task_ref !== "string" || row.task_ref.length === 0
      || typeof row.review_range !== "string" || row.review_range.trim().length === 0
      || typeof row.plan_fingerprint !== "string" || !/^sha256:[0-9a-f]{64}$/.test(row.plan_fingerprint)
      || typeof row.reviewed_by !== "string" || row.reviewed_by.trim().length === 0
      || typeof row.reviewer_execution_id !== "string" || !EXECUTION_ID_PATTERN.test(row.reviewer_execution_id)
      || typeof row.issued_at !== "string" || !Number.isFinite(Date.parse(row.issued_at))
      || !["allow-closeout", "block-closeout"].includes(String(row.verdict))) return null;
    return row as ReplayReceipt;
  } catch { return null; }
}

function readTrustedReplayReceipt(rootDir: string, ref: string): { receipt: ReplayReceipt; ref: string } | null {
  if (!/^sha256:[0-9a-f]{64}$/.test(ref)) return null;
  try {
    const bytes = readFileSync(join(buildStorePaths(rootDir).evidenceDir, ...storagePathOfSha256(ref).split("/")));
    const receipt = parseTrustedReceipt(bytes, ref);
    return receipt === null ? null : { receipt, ref };
  } catch { return null; }
}

function listBlobPaths(dir: string): string[] {
  try { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? listBlobPaths(join(dir, entry.name)) : [join(dir, entry.name)]); } catch { return []; }
}

function latestReplayReceipt(rootDir: string, taskRef: string, fingerprint: string): { receipt: ReplayReceipt; ref: string } | null {
  const root = buildStorePaths(rootDir).blobsDir;
  const receipts = listBlobPaths(root).flatMap((path) => {
    try {
      const bytes = readFileSync(path);
      const ref = sha256OfBytes(bytes);
      const receipt = parseTrustedReceipt(bytes, ref);
      return receipt !== null && receipt.task_ref === taskRef && receipt.plan_fingerprint === fingerprint ? [{ receipt, ref }] : [];
    } catch { return []; }
  }).sort((a, b) => b.receipt.issued_at.localeCompare(a.receipt.issued_at) || b.ref.localeCompare(a.ref));
  return receipts[0] ?? null;
}

function readReplayReceipt(rootDir: string, ref: string, taskRef: string, reviewRange: string, planFingerprint: string): { ok: true; receipt: ReplayReceipt } | { ok: false; error: CliError; blocked: boolean } {
  try {
    const trusted = readTrustedReplayReceipt(rootDir, ref);
    if (trusted === null) return { ok: false, blocked: false, error: { code: "REPLAY_RECEIPT_UNTRUSTED", message: "replay receipt 必须是 replay-adjudicate 签发的 sha256 artifact 引用", hint: "运行 pomaster finalize replay-adjudicate；随意路径或自写 JSON 不进入受信裁决面。" } };
    const row = trusted.receipt;
    if (row.task_ref !== taskRef || row.review_range !== reviewRange || row.plan_fingerprint !== planFingerprint) {
      return { ok: false, blocked: false, error: { code: "REPLAY_RECEIPT_INVALID", message: "replay receipt 的任务、review range 或 plan fingerprint 不匹配", hint: "针对当前 plan fingerprint 重新运行 pomaster finalize replay-adjudicate。" } };
    }
    const execution = readExecutionRecordById(buildStorePaths(rootDir), row.reviewer_execution_id);
    if (execution === null || (execution.task_id !== null && execution.task_id !== taskRef)) return { ok: false, blocked: false, error: { code: "REPLAY_RECEIPT_INVALID", message: "replay receipt 的 reviewer execution 不存在或绑定其他 task", hint: "由绑定当前 task 的已登记 AGX 重新签发 replay receipt。" } };
    if (row.verdict === "block-closeout") return { ok: false, blocked: true, error: { code: "REPLAY_BLOCKED", message: "replay verdict=block-closeout", hint: "修复 replay 发现并由独立主体生成新的 finalized receipt；不得覆写旧回执。" } };
    return { ok: true, receipt: row };
  } catch (error) {
    return { ok: false, blocked: false, error: { code: "REPLAY_RECEIPT_INVALID", message: error instanceof Error ? error.message : String(error), hint: "检查受信 replay artifact 完整性后重试。" } };
  }
}

export async function runFinalizeReplayAdjudicate(rootDir: string, input: FinalizeReplayAdjudicateInput): Promise<CommandOutcome<FinalizeReplayAdjudicateResult>> {
  const empty: FinalizeReplayAdjudicateResult = { schema: "pomaster.replay-adjudication-issued/v1", receipt_ref: null, storage_path: null, task_ref: input.taskRef, plan_fingerprint: input.planFingerprint, verdict: null };
  const fail = (error: CliError) => failOutcome("finalize replay-adjudicate", empty, [error], [`finalize replay-adjudicate → FAILED — ${error.code}`]);
  if (await taskLifecycle(rootDir, input.taskRef) === null) return fail({ code: "OBJECT_NOT_FOUND", message: `任务不存在或不可读：${input.taskRef}`, hint: "确认 TASK 引用与 store 完整性后重试。" });
  if (!EXECUTION_ID_PATTERN.test(input.executionId)) return fail({ code: "SCHEMA_INVALID", message: `--execution-id 词形非法：${input.executionId}`, hint: "使用已登记的 AGX-<4位年份>-<序号>。" });
  const parsedActor = parseActorArgv(input.reviewedBy);
  if ("error" in parsedActor) return fail({ ...parsedActor.error, message: `--reviewed-by 词形非法：${input.reviewedBy}` });
  if (!/^sha256:[0-9a-f]{64}$/.test(input.planFingerprint) || input.reviewRange.trim().length === 0) return fail({ code: "SCHEMA_INVALID", message: "plan fingerprint 或 review range 词形非法", hint: "使用 finalize status/run 返回的当前 sha256 fingerprint，并提供非空 review range。" });
  const execution = readExecutionRecordById(buildStorePaths(rootDir), input.executionId);
  if (execution === null) return fail({ code: "EXECUTION_NOT_FOUND", message: `reviewer execution 未登记：${input.executionId}`, hint: "先登记绑定当前 task 的独立复盘 AGX。" });
  if (execution.task_id !== null && execution.task_id !== input.taskRef) return fail({ code: "EXECUTION_TASK_MISMATCH", message: `reviewer execution 已绑定其他 task：${execution.task_id}`, hint: `改用绑定 ${input.taskRef} 的独立 AGX。` });
  const current = await latestPlanCohort(rootDir, input.taskRef);
  if (current === null || current.fingerprint !== input.planFingerprint || !current.allPassed) return fail({ code: "REPLAY_PLAN_NOT_CURRENT", message: "所给 plan fingerprint 不是当前全 passed GRN cohort", hint: "先完成 finalize run 的机器验证，再用其返回的当前 fingerprint 签发 replay receipt。" });
  if (current.executionId === input.executionId) return fail({ code: "REPLAY_REVIEWER_NOT_INDEPENDENT", message: "replay reviewer execution 与当前机器验证 cohort 使用同一 AGX", hint: "由独立复盘主体使用不同于机器验证 cohort 的 AGX 签发 replay receipt。" });
  const claims = await mappedTaskClaimFacts(rootDir, input.taskRef);
  const collision = claims.find((claim) => claim.assertedBy === input.reviewedBy || claim.executionId === input.executionId);
  if (collision !== undefined) return fail({ code: "REPLAY_REVIEWER_NOT_INDEPENDENT", message: `${collision.clm} 的断言主体/执行身份与 replay reviewer 重合`, hint: "改用与 claim asserted_by 及 claim execution_id 分离的独立主体和 AGX。" });
  const prior = latestReplayReceipt(rootDir, input.taskRef, input.planFingerprint);
  const now = Date.now();
  const priorTime = prior === null ? 0 : Date.parse(prior.receipt.issued_at);
  const issuedAt = new Date(Number.isFinite(priorTime) ? Math.max(now, priorTime + 1) : now).toISOString();
  const receipt: ReplayReceipt = {
    schema: "pomaster.replay-adjudication/v1",
    task_ref: input.taskRef,
    review_range: input.reviewRange,
    plan_fingerprint: input.planFingerprint,
    reviewed_by: input.reviewedBy,
    reviewer_execution_id: input.executionId,
    verdict: input.verdict,
    issued_at: issuedAt,
    issuer: "pomaster.finalize.replay-adjudicate/v1",
    note: input.note?.trim() || null,
  };
  try {
    const artifact = persistEvidenceArtifact(buildStorePaths(rootDir).evidenceDir, { media: "pomaster/replay-adjudication+json", bytes: Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8") });
    const result: FinalizeReplayAdjudicateResult = { schema: "pomaster.replay-adjudication-issued/v1", receipt_ref: artifact.sha256, storage_path: artifact.storagePath, task_ref: input.taskRef, plan_fingerprint: input.planFingerprint, verdict: input.verdict };
    return okOutcome("finalize replay-adjudicate", result, [`replay adjudication issued → ${artifact.sha256} (${input.verdict})`]);
  } catch (error) {
    return fail({ code: "ENVIRONMENT_ERROR", message: error instanceof Error ? error.message : String(error), hint: "修复 evidence blob 存储后重试；签发失败不产生受信引用。" });
  }
}

export async function runFinalize(rootDir: string, input: FinalizeRunInput): Promise<CommandOutcome<FinalizeResult>> {
  if (await taskLifecycle(rootDir, input.taskRef) === "COMPLETED") return okOutcome("finalize run", { ...base(input.taskRef), stage: "COMPLETED", completed: true, review_range: input.reviewRange, verification_execution_id: input.executionId }, [`finalize ${input.taskRef} → COMPLETED（幂等）`]);
  if (input.reviewRange.trim().length === 0) {
    const error = { code: "SCHEMA_INVALID", message: "--review-range 不得为空", hint: "提供本轮独立复核的显式 git range；机器验证尚未启动。" };
    return failOutcome("finalize run", { ...base(input.taskRef), review_range: input.reviewRange, verification_execution_id: input.executionId, errors: [error] }, [error], [`finalize ${input.taskRef} → PREFLIGHT blocked`]);
  }
  const claims = await mappedTaskClaimFacts(rootDir, input.taskRef);
  if (claims.length > 0) {
    if (input.verifier === undefined) {
      const error = { code: "VERIFIER_IDENTITY_REQUIRED", message: "任务已有 claim；finalize 必须显式声明 verification 主体", hint: "追加 --verifier <agent|human|tool|kernel:name>，并确保与 claim asserted_by 分离。" };
      return failOutcome("finalize run", { ...base(input.taskRef), review_range: input.reviewRange, verification_execution_id: input.executionId, errors: [error] }, [error], [`finalize ${input.taskRef} → PREFLIGHT blocked`]);
    }
    const verifier = parseActorArgv(input.verifier);
    if ("error" in verifier) return failOutcome("finalize run", { ...base(input.taskRef), review_range: input.reviewRange, verification_execution_id: input.executionId, errors: [verifier.error] }, [verifier.error], [`finalize ${input.taskRef} → PREFLIGHT blocked`]);
    const collision = claims.find((claim) => claim.assertedBy === input.verifier || claim.executionId === input.executionId);
    if (collision !== undefined) {
      const error = { code: "VERIFICATION_SUBJECT_NOT_INDEPENDENT", message: `${collision.clm} 的 asserted_by/claim execution 与 verification 主体或 execution 重合`, hint: "使用与断言主体和实现 execution 均分离的 verifier 及 AGX；closeout 自批防线仍会二次判卷。" };
      return failOutcome("finalize run", { ...base(input.taskRef), review_range: input.reviewRange, verification_execution_id: input.executionId, errors: [error] }, [error], [`finalize ${input.taskRef} → PREFLIGHT blocked`]);
    }
  }
  // W2-FR11 Case D：finalize run 是编排器的 final-stable cohort 入口——其机器验证
  // 证据强制声明 final_stable 用途（调用方显式传入的其他用途被编排器语义覆盖：
  // 本命令的机器验证段就是「等待并行写入结束后的稳定窗口终验」，不属于 worker 本域）。
  const plan = await runPlanRun(rootDir, { ...input, verificationPurpose: "final_stable" });
  const result: FinalizeResult = { ...base(input.taskRef), stage: "VERIFYING", review_range: input.reviewRange, verification_execution_id: input.executionId, plan_fingerprint: plan.result.inputs_fingerprint || null, diagnostics: plan.result.diagnostics, errors: plan.errors };
  if (!plan.ok) return failOutcome("finalize run", { ...result, stage: "VERIFY_BLOCKED", next_actions: [{ actor: "implementer", command: `pomaster plan run --task ${input.taskRef} --execution-id ${input.executionId}`, reason: "机器验证存在非绿或前检阻塞；按 diagnostics 修复后重放 finalize。" }] }, plan.errors, [`finalize ${input.taskRef} → blocked at machine verification`]);
  if (!input.replayReceipt) {
    const error = { code: "AWAITING_REPLAY_REVIEW", message: "机器验证已通过，缺少独立 replay finalized receipt", hint: `先运行 finalize replay-adjudicate，再重放同一命令并追加 --replay-receipt <sha256>。` };
    return failOutcome("finalize run", { ...result, stage: "AWAITING_REPLAY_REVIEW", errors: [error], next_actions: [{ actor: "independent_verifier", command: `pomaster finalize replay-adjudicate ${input.taskRef} --execution-id <AGX-*> --reviewed-by <type:name> --review-range ${input.reviewRange} --plan-fingerprint ${plan.result.inputs_fingerprint} --verdict <allow-closeout|block-closeout>`, reason: "replay 必须由独立主体经受信入口签发，编排器不能自批。" }] }, [error], [`finalize ${input.taskRef} → pending replay review`]);
  }
  const replay = readReplayReceipt(rootDir, input.replayReceipt, input.taskRef, input.reviewRange, plan.result.inputs_fingerprint);
  if (!replay.ok) return failOutcome("finalize run", { ...result, stage: replay.blocked ? "REPLAY_BLOCKED" : "AWAITING_REPLAY_REVIEW", replay_receipt: input.replayReceipt, errors: [replay.error] }, [replay.error], [`finalize ${input.taskRef} → ${replay.blocked ? "replay blocked" : "pending replay review"}`]);
  const replayCollision = claims.find((claim) => claim.assertedBy === replay.receipt.reviewed_by || claim.executionId === replay.receipt.reviewer_execution_id);
  if (replayCollision !== undefined) {
    const error = { code: "REPLAY_REVIEWER_NOT_INDEPENDENT", message: `${replayCollision.clm} 与受信 replay reviewer 的主体或 execution 重合`, hint: "由独立主体使用独立 AGX 重新签发 replay adjudication receipt。" };
    return failOutcome("finalize run", { ...result, stage: "AWAITING_REPLAY_REVIEW", replay_receipt: input.replayReceipt, errors: [error] }, [error], [`finalize ${input.taskRef} → pending replay review`]);
  }
  const replayBoundResult = { ...result, replay_receipt: input.replayReceipt };
  const closeout = await runCloseout(rootDir, { taskId: input.taskRef });
  if (closeout.ok && closeout.result.change === "COMPLETED") return okOutcome("finalize run", { ...replayBoundResult, stage: "COMPLETED", completed: true }, [`finalize ${input.taskRef} → COMPLETED`]);
  const errors = closeout.errors;
  const awaitingAccept = errors.some((error) => error.code.startsWith("CLOSEOUT_ACCEPT_"));
  const needsNewClaim = errors.some((error) => ["DOD_CLAIM_UNMAPPED", "DOD_CLAIM_NOT_FOUND", "DOD_CLAIM_SELF_APPROVED"].includes(error.code) || /PARTIALLY_VERIFIED|REJECTED/.test(error.message));
  const awaitingVerification = errors.some((error) => error.code === "DOD_CLAIM_NOT_VERIFIED");
  const stage: FinalizeStage = needsNewClaim ? "NEW_CLAIM_REQUIRED" : awaitingVerification ? "AWAITING_INDEPENDENT_VERIFICATION" : awaitingAccept ? "AWAITING_HUMAN_ACCEPT" : "CLOSEOUT_BLOCKED";
  const actor = needsNewClaim ? "implementer" as const : awaitingVerification ? "independent_verifier" as const : awaitingAccept ? "human_owner" as const : "implementer" as const;
  return failOutcome("finalize run", { ...replayBoundResult, stage, errors, next_actions: [{ actor, command: awaitingAccept ? `pomaster view review ${input.taskRef}` : needsNewClaim ? `pomaster record claim --from <new-claim.json>` : awaitingVerification ? `pomaster record verification --clm <CLM-*> --verifier <independent-actor>` : `pomaster closeout ${input.taskRef}`, reason: errors.map((error) => error.code).join(", ") }] }, errors, [`finalize ${input.taskRef} → pending ${stage}`]);
}
