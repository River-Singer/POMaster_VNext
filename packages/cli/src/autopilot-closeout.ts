/** Write-ahead application of exact reviewed content, never an arbitrary writer. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadStoreReadOnly, loadTruthIndex, sha256OfCanonical } from "@pomaster/kernel";
import { acceptRevisionFingerprint, runCloseout } from "./closeout.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { fileSha256 } from "./trust.js";
import { runSpecUpdate } from "./spec-update.js";
import { loadAcceptedProjectDecision, persistReviewBlob, readReviewBlob, reviewBlock, reviewError, reviewPath, type ProjectReviewSnapshot } from "./autopilot-review.js";

interface ApplyIntent {
  readonly schema: "pomaster.autopilot-review-apply/v1";
  readonly decision_ref: string;
  readonly review_ref: string;
  readonly candidate_targets: readonly { target: string; before_sha256: string; after_sha256: string }[];
  readonly task_versions: readonly { task: string; semantic_revision: string }[];
  readonly stages: readonly string[];
}
interface ApplyEvent { readonly stage: string; readonly status: "pending" | "done"; readonly artifact?: string }
export interface ProjectApplyResult {
  readonly complete: boolean;
  readonly decision_ref: string;
  readonly archive_ref: string | null;
  readonly done: readonly string[];
}
function intentFor(decisionRef: string, reviewRef: string, snapshot: ProjectReviewSnapshot): ApplyIntent {
  return { schema: "pomaster.autopilot-review-apply/v1", decision_ref: decisionRef, review_ref: reviewRef, candidate_targets: snapshot.candidates.map(({ target, before_sha256, after_sha256 }) => ({ target, before_sha256, after_sha256 })), task_versions: snapshot.tasks.map(({ task, semantic_revision }) => ({ task, semantic_revision })), stages: [...snapshot.candidates.map((_, index) => `candidate:${index}`), ...snapshot.tasks.map((task) => `closeout:${task.task}`), "archive", "complete"] };
}
/** Infrastructure interruption point for deterministic crash tests; never supplies authority or candidates. */
export async function runAutopilotReviewApply(root: string, input: { readonly decisionRef: string }, env: { readonly afterStage?: (stage: string) => void } = {}): Promise<CommandOutcome<ProjectApplyResult | null>> {
  let lockPath: string | null = null;
  let ownedLock = false;
  let events: ApplyEvent[] = [];
  let archiveRef: string | null = null;
  try {
    const { decision, snapshot } = await loadAcceptedProjectDecision(root, input.decisionRef);
    const dir = `.pomaster/autopilot/reviews/applies/${input.decisionRef.slice("sha256:".length)}`;
    // Serialize signed applies across decisions, not just replays of one receipt.
    lockPath = reviewPath(root, ".pomaster/autopilot/reviews/apply.lock");
    mkdirSync(dirname(lockPath), { recursive: true });
    mkdirSync(reviewPath(root, dir), { recursive: true });
    if (existsSync(lockPath)) {
      reviewBlock("AUTOPILOT_REVIEW_APPLY_LOCKED", "Signed apply lock exists; inspect its owner and retained intent before explicit stale-lock recovery. Automatic check-then-unlink cannot safely reclaim a concurrent writer's lock");
    }
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, decision_ref: input.decisionRef }), { flag: "wx" });
    ownedLock = true;
    const intent = intentFor(input.decisionRef, decision.review_ref, snapshot);
    const intentPath = reviewPath(root, `${dir}/intent.json`);
    if (!existsSync(intentPath)) writeFileSync(intentPath, `${JSON.stringify(intent, null, 2)}\n`, { flag: "wx" });
    else if (sha256OfCanonical(JSON.parse(readFileSync(intentPath, "utf8"))) !== sha256OfCanonical(intent)) reviewBlock("AUTOPILOT_REVIEW_TAMPERED", "Signed apply intent changed");
    const eventsPath = reviewPath(root, `${dir}/events.jsonl`);
    events = existsSync(eventsPath) ? readFileSync(eventsPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as ApplyEvent) : [];
    const completed = new Set<string>();
    for (const event of events) {
      if (event === null || typeof event !== "object" || event.stage !== intent.stages[completed.size] || !["pending", "done"].includes(event.status) ||
          Object.keys(event).some((key) => !["stage", "status", "artifact"].includes(key)) ||
          (event.artifact !== undefined && (event.stage !== "archive" || event.status !== "done")) ||
          (event.stage === "archive" && event.status === "done" && typeof event.artifact !== "string")) reviewBlock("AUTOPILOT_REVIEW_TAMPERED", "Apply event stream has reordered, duplicated or malformed stages");
      if (event.status === "done") completed.add(event.stage);
    }
    const done = (stage: string) => events.some((event) => event.stage === stage && event.status === "done");
    const record = (event: ApplyEvent) => { appendFileSync(eventsPath, `${JSON.stringify(event)}\n`); events.push(event); };
    const recheck = () => loadAcceptedProjectDecision(root, input.decisionRef);
    for (let index = 0; index < snapshot.candidates.length; index += 1) {
      const stage = `candidate:${index}`;
      const candidate = snapshot.candidates[index]!;
      await recheck();
      const target = reviewPath(root, candidate.target);
      const digest = fileSha256(target);
      if (done(stage) && digest !== candidate.after_sha256) reviewBlock("AUTOPILOT_REVIEW_STALE", `Previously applied candidate changed: ${candidate.target}`);
      if (done(stage)) continue;
      record({ stage, status: "pending" }); // write-ahead, before the controlled writer
      if (digest !== candidate.after_sha256) {
        if (digest !== candidate.before_sha256) reviewBlock("AUTOPILOT_REVIEW_STALE", "Candidate conditional update failed");
        if (candidate.candidate.kind !== "spec") reviewBlock("AUTOPILOT_REVIEW_CANDIDATE_BLOCKED", "Truth reconciliation is read-only; substantive writes require a conditional authority API");
        const written = runSpecUpdate(root, { ...candidate.candidate.input, target: "spec", dryRun: false });
        if (!written.ok || written.result?.file !== candidate.target) throw Object.assign(new Error("Controlled spec writer refused the reviewed candidate"), written.errors[0]);
      }
      if (fileSha256(reviewPath(root, candidate.target)) !== candidate.after_sha256) reviewBlock("AUTOPILOT_REVIEW_STALE", "Controlled writer output differs from the exact pre-reviewed output");
      env.afterStage?.(stage); // crash here: recovery recognizes the exact output without writing it twice
      record({ stage, status: "done" });
    }
    for (const task of snapshot.tasks) {
      const stage = `closeout:${task.task}`;
      await recheck();
      const currentIndex = await loadTruthIndex(loadStoreReadOnly(root));
      const row = currentIndex.objects.find((entry) => entry.id === task.task);
      if (!row || acceptRevisionFingerprint(JSON.parse(readFileSync(reviewPath(root, `.pomaster/${row.bodyRef}`), "utf8"))) !== task.semantic_revision) reviewBlock("AUTOPILOT_REVIEW_STALE", "TASK conditional version check failed");
      if (done(stage) && row.axes.evidence !== "VERIFIED") reviewBlock("AUTOPILOT_REVIEW_STALE", "Previously closed TASK no longer has completion evidence");
      if (done(stage)) continue;
      record({ stage, status: "pending" });
      if (row.axes.evidence !== "VERIFIED") {
        const closed = await runCloseout(root, { taskId: task.task, projectAccept: input.decisionRef, authorityRef: input.decisionRef, note: `project ACCEPT ${decision.review_ref}` });
        if (!closed.ok) throw Object.assign(new Error("Task closeout refused"), closed.errors[0]);
      }
      env.afterStage?.(stage);
      record({ stage, status: "done" });
    }
    await recheck();
    const archive = { schema: "pomaster.autopilot-increment-archive/v1", decision_ref: input.decisionRef, review_ref: decision.review_ref, round: snapshot.round, tasks: intent.task_versions, candidates: intent.candidate_targets, qa_isolation: snapshot.qa_isolation };
    if (!done("archive")) {
      record({ stage: "archive", status: "pending" });
      archiveRef = persistReviewBlob(root, archive);
      env.afterStage?.("archive");
      record({ stage: "archive", status: "done", artifact: archiveRef });
    } else {
      archiveRef = events.find((event) => event.stage === "archive" && event.status === "done")?.artifact ?? null;
      if (!archiveRef || sha256OfCanonical(readReviewBlob(root, archiveRef)) !== sha256OfCanonical(archive)) reviewBlock("AUTOPILOT_REVIEW_TAMPERED", "Increment archive is missing or changed");
    }
    await recheck();
    if (!done("complete")) {
      if (!intent.stages.filter((stage) => stage !== "complete").every(done)) reviewBlock("AUTOPILOT_REVIEW_APPLY_INCOMPLETE", "Cannot complete before every candidate, TASK closeout and archive is done");
      record({ stage: "complete", status: "done" });
    }
    const result: ProjectApplyResult = { complete: true, decision_ref: input.decisionRef, archive_ref: archiveRef, done: events.filter((event) => event.status === "done").map((event) => event.stage) };
    return okOutcome("autopilot review apply", result, [`project increment archived: ${archiveRef}; TASK completion comes from closeout`]);
  } catch (error) {
    return failOutcome("autopilot review apply", { complete: false, decision_ref: input.decisionRef, archive_ref: archiveRef, done: events.filter((event) => event.status === "done").map((event) => event.stage) }, [reviewError(error)], ["Signed apply incomplete; exact intent and history retained for recovery"]);
  } finally {
    if (ownedLock && lockPath && existsSync(lockPath)) unlinkSync(lockPath);
  }
}
