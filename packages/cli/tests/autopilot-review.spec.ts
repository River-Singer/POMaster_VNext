import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, beginExecution, createStore, issuePermit, loadTruthIndex, persistEvidenceArtifact, storagePathOfSha256, type GovernedId, type PlanAcceptanceItem } from "@pomaster/kernel";
import { CURRENT_GATE_DEFS } from "@pomaster/gauntlet-lite";
import { assessCloseoutMachine, runCloseout } from "../src/closeout.js";
import { runInit } from "../src/init.js";
import { projectReviewStatement, runAutopilotReviewDecide, runAutopilotReviewDraft, runAutopilotReviewView } from "../src/autopilot-review.js";
import { runAutopilotReviewApply } from "../src/autopilot-closeout.js";
import { loadIntakeLatest, runIntakeRead } from "../src/intake.js";
import { runTrustEnroll, runTrustRequest, statementSubject, verifySignoff } from "../src/trust.js";
import { captureEvidenceSourceSnapshot } from "../src/source-snapshot.js";
import { parsePerfThresholds } from "../src/perf.js";
import { compareSourceSnapshots } from "@pomaster/kernel";
import { makeKey, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

let root: string;
let key: TestKey;
const AGX = "AGX-2026-09001";
const TASK = "TASK.REVIEW.ONE";
const noAgent = { listAgentKeys: () => [] as string[] };
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const path = (ref: string) => join(root, ref);
function put(ref: string, value: unknown) {
  mkdirSync(dirname(path(ref)), { recursive: true });
  writeFileSync(path(ref), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}
function read(ref: string) { return JSON.parse(readFileSync(path(ref), "utf8")); }
function blob(ref: string) { return read(`.pomaster/evidence/${storagePathOfSha256(ref)}`); }
function sign(statement: string) {
  const subject = statementSubject(statement);
  const requested = runTrustRequest(root, { kind: "accept", ...subject }, noAgent);
  expect(requested.ok).toBe(true);
  const id = (requested.result as { id: string }).id;
  const requestPath = path(`.pomaster/trust/requests/${id}.json`);
  writeFileSync(`${requestPath}.sig`, signSshsig(key, readFileSync(requestPath)));
  return id;
}
async function seedTask(id = TASK, claim = "CLM-0001", gate = "BUILD", exclusions?: PlanAcceptanceItem["exclusions"]) {
  const store = await createStore(root);
  await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: {
    id, kind: "task_object", axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "Review task", authority: { owner: "BUSINESS_OWNER", delegates: [] }, origin: "natural",
    payload: { intent: "Final project delivery", round: "KO-review-r1", acceptance: [{ criterion: "Independent result", claim, requires: [gate === "PERFORMANCE" ? "load_test" : gate === "SECURITY" ? "permission_observation" : "unit_behavior"], ...(exclusions === undefined ? {} : { exclusions }) }], class_scan_result: { scope: "src/", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" } },
  } as never }] });
}
function evidence(verdict = "passed", gate = "BUILD", extraPaths: string[] = []) {
  const snap = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/app.ts", "dist/app.bin", ...extraPaths], head: null });
  put(".pomaster/evidence/runs/GRN-0001.json", {
    record_type: "run", grn: "GRN-0001", execution_id: AGX, evidence_purpose: "final_stable",
    source_snapshot: { before: snap, after: snap, window: compareSourceSnapshots(snap, snap) },
    gate_result: { mode: "inline", result: { grn: "GRN-0001", gate, gate_def: CURRENT_GATE_DEFS[gate], tool: "review-fixture", tool_version: "1.0.0", metric_dialect: "cases", verdict, ran_at_seq: 9999, subject_id: TASK, is_fixture: false } },
  });
  put(".pomaster/evidence/claims/CLM-0001.json", { record_type: "claim", clm: "CLM-0001", subject: { object_id: TASK }, asserted_by: { actor_type: "agent", actor: "builder" }, evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }], verification: { verdict: "VERIFIED", at_seq: 9999, recomputed_by: { actor_type: "agent", actor: "qa" } } });
}
function perfEvidence(entries: { topic: string; value: string; source: string }[]) {
  const sims = [{ name: "FirstSimulation", file: "perf/src/test/scala/FirstSimulation.scala" }, { name: "SecondSimulation", file: "perf/src/test/scala/SecondSimulation.scala" }];
  put("perf/pom.xml", "<project/>\n");
  for (const sim of sims) put(sim.file, `class ${sim.name}\n`);
  const fingerprint = hash(sims.map((sim) => hash(readFileSync(path(sim.file)))).join("\n") + hash(readFileSync(path("perf/pom.xml"))));
  put(".pomaster/perf/build.json", { schema: "pomaster.perf-build/v1", fingerprint, sims });
  const thresholds = parsePerfThresholds(entries);
  const rows = sims.map((sim) => ({ name: sim.name, ok: true, error: null, metrics: { total: 100, ko: 0, p95Ms: 100, p99Ms: 150, rps: 10 }, assertions: [{ kind: "p95<=500ms", threshold: 500, observed: 100, ok: true }] }));
  put(".pomaster/perf/runs/PERF-0001.json", { schema: "pomaster.perf-run/v1", run_id: "PERF-0001", verdict: "judged-passed", gate: "PERFORMANCE", duration_seconds: 10, thresholds, rows });
  put(".pomaster/perf/perf-runs.jsonl", `${JSON.stringify({ schema: "pomaster.perf-run/v1", seq: 1, id: "PERF-0001", verdict: "judged-passed", gate: "PERFORMANCE", thresholds, sims: rows.map(({ name, ok }) => ({ name, ok })), perf_fingerprint: fingerprint })}\n`);
  evidence("passed", "PERFORMANCE", ["perf/pom.xml", ...sims.map((sim) => sim.file)]);
  bindReport(".pomaster/perf/runs/PERF-0001.json");
}
function bindReport(ref: string) {
  const report = persistEvidenceArtifact(path(".pomaster/evidence"), { media: "json", bytes: readFileSync(path(ref)) });
  const run = read(".pomaster/evidence/runs/GRN-0001.json");
  run.artifact_refs = [{ sha256: report.sha256, storage_path: report.storagePath, media: report.media, byte_size: report.byteSize }];
  put(".pomaster/evidence/runs/GRN-0001.json", run);
}
async function fixture(gate = "BUILD", secondTask = false, thresholds: { topic: string; value: string; source: string }[] = [], exclusions?: PlanAcceptanceItem["exclusions"]) {
  const store = await createStore(root);
  put(".pomaster/state/authority.json", { version: 1, authorities: { BUSINESS_OWNER: {} } });
  put("input/requirements.md", "# Orders\n\n必须校验订单金额。\n");
  expect((await runIntakeRead(root, { paths: [path("input")], name: "review" })).ok).toBe(true);
  const loaded = loadIntakeLatest(root, "review");
  if (!loaded.ok) throw new Error("intake fixture");
  key = makeKey("ssh-ed25519");
  put("owner.pub", key.line);
  expect(runTrustEnroll(root, { key: path("owner.pub"), principal: "owner" }, noAgent).ok).toBe(true);
  const sheet = { schema: "pomaster.kickoff-sheet/v1", id: "KO-review-r1", workspace: "review", revision: loaded.data.files.revision, scope: { in: ["orders"], out: [] }, budget: { valid_days: 14, max_rework_rounds: 3, stop_on: [] }, thresholds, autonomy: { allow: ["naming"], stop: ["scope_change"] } };
  put(".pomaster/kickoff/KO-review-r1/sheet.json", sheet);
  const ref = ".pomaster/kickoff/KO-review-r1/sheet.json";
  const requested = runTrustRequest(root, { kind: "kickoff", subject: ref }, noAgent);
  const so = (requested.result as { id: string }).id;
  const req = path(`.pomaster/trust/requests/${so}.json`);
  writeFileSync(`${req}.sig`, signSshsig(key, readFileSync(req)));
  expect(verifySignoff(root, so, { kind: "kickoff", ref, sha256: hash(readFileSync(path(ref))) }, { consume: true, env: noAgent, consumedBy: "kickoff confirm" }).ok).toBe(true);
  const appliedAt = Date.now();
  put(".pomaster/kickoff/current.json", { schema: "pomaster.kickoff-current/v1", sheet: sheet.id, sheet_sha256: hash(readFileSync(path(ref))), signoff: so, principal: "owner", assurance: "unknown", applied_at: new Date(appliedAt).toISOString(), valid_until: new Date(appliedAt + 14 * 86400000).toISOString() });
  await seedTask(TASK, "CLM-0001", gate, exclusions);
  if (secondTask) await seedTask("TASK.REVIEW.TWO", "CLM-0002");
  put(".pomaster/plan/KO-review-r1/plan.json", { committed: true, fingerprint: "fixture-plan", units: [{ id: TASK, lane: "be", entity: "orders" }, ...(secondTask ? [{ id: "TASK.REVIEW.TWO", lane: "fe" }] : [])] });
  put(".pomaster/qa/KO-review-r1/cases-frozen.json", { schema: "pomaster.qa-cases/v1", round: sheet.id, revision: sheet.revision, sheet_sha256: hash(readFileSync(path(ref))), resolutions_sha256: loaded.data.files.resolutions_sha256, plan_fingerprint: "fixture-plan", cases: [{ id: "CASE-0001", source_refs: ["REQ-0001"], expected_zh: "校验金额" }], isolation: "not_isolated", parent: null });
  put(".pomaster/qa/current.json", { schema: "pomaster.qa-current/v1", round: sheet.id, sheet: sheet.id, sheet_sha256: hash(readFileSync(path(ref))), revision: sheet.revision, resolutions_sha256: loaded.data.files.resolutions_sha256, cases_frozen_sha256: hash(readFileSync(path(".pomaster/qa/KO-review-r1/cases-frozen.json"))), isolation: "not_isolated", parent: null });
  const permit = await issuePermit(store, { subjectIds: [TASK, ...(secondTask ? ["TASK.REVIEW.TWO"] : [])] as GovernedId[], requestedBy: { actorType: "agent", actor: "coordinator", selfAttested: true }, ttlBeats: 1000 });
  await beginExecution(store, { executionId: AGX, role: "orchestrator", runtime: "script", identityKind: "script", permitIds: [permit.permitRef] });
  put("src/app.ts", "export const result = 1;\n");
  put("dist/app.bin", "merged-build");
  evidence("passed", gate);
}
const draft = (candidates: unknown[] = []) => runAutopilotReviewDraft(root, { executionId: AGX, codePaths: ["src/app.ts"], buildPaths: ["dist/app.bin"], candidates: candidates as never });
async function ready(candidates: unknown[] = []) {
  const out = await draft(candidates);
  expect(out.ok, JSON.stringify(out.errors)).toBe(true);
  expect(out.result?.ready, JSON.stringify(out.result?.blockers)).toBe(true);
  return out.result!.review_ref;
}
async function decide(ref: string, verdict: "ACCEPT" | "REWORK" | "REJECT" = "ACCEPT", affectedUnits: string[] = [], reason = "") {
  const signoff = sign(projectReviewStatement(ref, verdict, affectedUnits, reason));
  return runAutopilotReviewDecide(root, { reviewRef: ref, verdict, affectedUnits, reason, signoff }, { trust: noAgent });
}
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "pomaster-ac1-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("project machine review uses the production closeout judge", () => {
  it("is read-only; ordinary closeout still needs a human receipt", async () => {
    await fixture();
    const before = readFileSync(path(".pomaster/state/truth-index.json"), "utf8");
    expect((await assessCloseoutMachine(root, { taskId: TASK })).ok).toBe(true);
    expect(readFileSync(path(".pomaster/state/truth-index.json"), "utf8")).toBe(before);
    expect((await runCloseout(root, { taskId: TASK })).errors[0]?.code).toBe("CLOSEOUT_ACCEPT_MISSING");
    await ready();
    expect((await runCloseout(root, { taskId: TASK })).ok).toBe(false);
  });
  it.each(["failed", "not_run"])("C09 required %s reports blocked, never ready", async (verdict) => {
    await fixture(); evidence(verdict);
    const out = await draft();
    expect(out.ok).toBe(true);
    expect(out.result?.ready).toBe(false);
    expect(out.result?.blockers.some((b) => b.code === `GATE_${verdict.toUpperCase()}`)).toBe(true);
  });
  it("the human review view is read-only and distinguishes stale historical content", async () => {
    await fixture(); const reviewRef = await ready();
    const before = readFileSync(path(".pomaster/state/truth-index.json"), "utf8");
    const view = await runAutopilotReviewView(root, { reviewRef });
    expect(view.ok).toBe(true); expect(view.result?.current).toBe(true);
    expect(view.result?.snapshot.requirement_review.length).toBeGreaterThan(0);
    expect(readFileSync(path(".pomaster/state/truth-index.json"), "utf8")).toBe(before);
    put("src/app.ts", "changed\n");
    const historical = await runAutopilotReviewView(root, { reviewRef });
    expect(historical.ok).toBe(false); expect(historical.result?.current).toBe(false);
    expect(historical.result?.snapshot.ready).toBe(true);
  });
  it("frozen QA cannot silently cover another plan version", async () => {
    await fixture(); const plan = read(".pomaster/plan/KO-review-r1/plan.json");
    plan.fingerprint = "changed-plan"; put(".pomaster/plan/KO-review-r1/plan.json", plan);
    expect((await draft()).errors[0]?.code).toBe("AUTOPILOT_REVIEW_QA_STALE");
  });
  it("C09 recorded performance cannot satisfy required thresholds", async () => {
    await fixture("PERFORMANCE");
    put(".pomaster/perf/perf-runs.jsonl", `${JSON.stringify({ schema: "pomaster.perf-run/v1", seq: 1, id: "PERF-0001", verdict: "recorded", gate: "PERFORMANCE", thresholds: { p95MaxMs: null } })}\n`);
    const out = await draft();
    expect(out.result?.ready).toBe(false);
    expect(out.result?.blockers.some((b) => b.code === "AUTOPILOT_PERFORMANCE_UNJUDGED")).toBe(true);
  });
  it("all planned tasks stay in the denominator, even with no evidence", async () => {
    await fixture("BUILD", true);
    const out = await draft();
    expect(out.result?.tasks).toHaveLength(2);
    expect(out.result?.ready).toBe(false);
  });
  it("optional NOT_RUN remains visible without becoming a mandatory gate", async () => {
    await fixture("BUILD", false, [], [{ capability: "load_test", basis: "This task changes no runtime performance behavior" }]);
    put(".pomaster/evidence/runs/GRN-0002.json", { record_type: "run", grn: "GRN-0002", gate_result: { mode: "inline", result: { grn: "GRN-0002", gate: "PERFORMANCE", verdict: "not_run", ran_at_seq: 9999, subject_id: TASK, tool: "optional-fixture", tool_version: "1.0.0", metric_dialect: "cases" } } });
    const out = await draft();
    expect(out.result?.ready, JSON.stringify(out.result?.blockers)).toBe(true);
    expect(out.result?.tasks[0]?.machine.gates?.rows.some((gate) => gate.grn === "GRN-0002" && gate.required === false && gate.verdict === "not_run")).toBe(true);
  });
  it("performance needs confirmed thresholds AND the actual report bound to a qualified GRN", async () => {
    const entries = [{ topic: "performance", value: "p95<=500ms", source: "owner" }];
    await fixture("PERFORMANCE", false, entries);
    const ledgerRef = ".pomaster/perf/perf-runs.jsonl";
    put(ledgerRef, `${JSON.stringify({ id: "PERF-0001", verdict: "judged-passed", thresholds: parsePerfThresholds(entries) })}\n`);
    expect((await draft()).result?.ready).toBe(false);
    bindReport(ledgerRef);
    expect((await draft()).result?.ready).toBe(false);
    perfEvidence(entries);
    const out = await draft();
    expect(out.result?.ready, JSON.stringify(out.result?.blockers)).toBe(true);
  });
  it.each(["partial", "unjudged", "threshold", "build"])("C09 rejects actual performance report %s even behind a passed GRN", async (fault) => {
    const entries = [{ topic: "performance", value: "p95<=500ms", source: "owner" }];
    await fixture("PERFORMANCE", false, entries); perfEvidence(entries);
    const report = read(".pomaster/perf/runs/PERF-0001.json");
    if (fault === "partial") report.rows.pop();
    if (fault === "unjudged") report.rows[1].assertions[0].ok = null;
    if (fault === "threshold") report.thresholds.p95MaxMs = 999;
    if (fault === "build") {
      put("perf/src/test/scala/SecondSimulation.scala", "changed simulation\n");
      evidence("passed", "PERFORMANCE", ["perf/pom.xml", "perf/src/test/scala/FirstSimulation.scala", "perf/src/test/scala/SecondSimulation.scala"]);
    }
    put(".pomaster/perf/runs/PERF-0001.json", report); bindReport(".pomaster/perf/runs/PERF-0001.json");
    const out = await draft();
    expect(out.result?.ready).toBe(false);
    expect(out.result?.blockers.some((entry) => entry.code === "AUTOPILOT_PERFORMANCE_UNJUDGED")).toBe(true);
  });
  it("C12 separate task passes cannot substitute for a merged-version verification", async () => {
    await fixture("BUILD", true);
    put("src/client.ts", "export const client = 1;\n"); put("dist/client.bin", "client-build");
    const snap = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/client.ts", "dist/client.bin"], head: null });
    const run = read(".pomaster/evidence/runs/GRN-0001.json");
    run.grn = "GRN-0002"; run.gate_result.result.grn = "GRN-0002"; run.gate_result.result.subject_id = "TASK.REVIEW.TWO";
    run.source_snapshot = { before: snap, after: snap, window: compareSourceSnapshots(snap, snap) };
    put(".pomaster/evidence/runs/GRN-0002.json", run);
    const claim = read(".pomaster/evidence/claims/CLM-0001.json");
    claim.clm = "CLM-0002"; claim.subject.object_id = "TASK.REVIEW.TWO"; claim.evidence_refs[0].grn = "GRN-0002";
    put(".pomaster/evidence/claims/CLM-0002.json", claim);
    const out = await draft();
    expect(out.result?.tasks.every((task) => task.machine_receipt.satisfied)).toBe(true);
    expect(out.result?.ready).toBe(false);
    expect(out.result?.blockers.some((blocker) => blocker.code === "AUTOPILOT_REVIEW_FINAL_BUILD_MISSING")).toBe(true);
  });
  it("real scenario plans cannot become ready with BUILD alone", async () => {
    await fixture();
    const plan = read(".pomaster/plan/KO-review-r1/plan.json");
    plan.schema = "pomaster.scenario-plan/v1"; plan.sheet = "KO-review-r1";
    put(".pomaster/plan/KO-review-r1/plan.json", plan);
    put("backend/src/Rule.java", "class Rule {}\n");
    put("backend/src/target/Seed.java", "class Seed {}\n");
    put(".pomaster/scaffold/generation-manifest.json", { schema: "pomaster.scaffold-generation/v1", template_sets: [], spec_semantic_sha256: "fixture", at_seq: 1, spec_snapshot: { app: { key: "review" }, surfaces: { admin: {}, public: {} }, entities: [] }, files: [{ path: "backend/src/Rule.java", sha256: hash(readFileSync(path("backend/src/Rule.java"))), template: "java.rule", immutable: false, keybinding_id: "KEYBINDING.REVIEW.SOURCE", canonical_id: "CAPABILITY.REVIEW.SOURCE" }], history: [] });
    const out = await draft();
    expect(out.result?.ready, JSON.stringify(out.errors)).toBe(false);
    expect(out.result?.blockers.some((entry) => entry.code === "AUTOPILOT_REVIEW_PROJECT_OBLIGATION_MISSING")).toBe(true);
    expect(out.result?.required_project_checks).toContain("sit");
    expect(out.result?.required_final_paths).toContain("backend/src/Rule.java");
    expect(out.result?.required_final_paths).toContain("backend/src/target/Seed.java");
  });
  it("related affected-object paths cannot be truncated by caller declarations", async () => {
    await fixture();
    const store = await createStore(root);
    const index = await loadTruthIndex(store);
    const row = index.objects.find((entry) => entry.id === TASK)!;
    const body = read(`.pomaster/${row.bodyRef}`);
    body.payload.affected_objects = ["CAPABILITY.REVIEW.SOURCE"];
    put(`.pomaster/${row.bodyRef}`, body);
    put(".pomaster/truth/keybindings/review.json", { id: "KEYBINDING.REVIEW.SOURCE", canonical_id: "CAPABILITY.REVIEW.SOURCE", binding_class: "capability_to_file", physical_path: "src/omitted.ts", binding_status: "confirmed" });
    put("src/omitted.ts", "export const omitted = true;\n");
    const out = await draft();
    expect(out.result?.ready).toBe(false);
    expect(out.result?.blockers.some((entry) => entry.code === "AUTOPILOT_REVIEW_FINAL_BUILD_MISSING")).toBe(true);
  });
  it("unmapped affected-object obligations fail closed", async () => {
    await fixture();
    const row = (await loadTruthIndex(await createStore(root))).objects.find((entry) => entry.id === TASK)!;
    const body = read(`.pomaster/${row.bodyRef}`); body.payload.affected_objects = ["CAPABILITY.UNKNOWN.SOURCE"];
    put(`.pomaster/${row.bodyRef}`, body);
    expect((await draft()).result?.ready).toBe(false);
  });
  it("unrelated well-formed evidence does not stale a signed project review", async () => {
    await fixture(); const ref = await ready();
    const unrelated = read(".pomaster/evidence/runs/GRN-0001.json");
    unrelated.grn = "GRN-9999"; unrelated.gate_result.result.grn = "GRN-9999";
    unrelated.gate_result.result.subject_id = "TASK.UNRELATED.ONE";
    put(".pomaster/evidence/runs/GRN-9999.json", unrelated);
    put(".pomaster/evidence/claims/CLM-9999.json", { record_type: "claim", clm: "CLM-9999", subject: { object_id: "TASK.UNRELATED.ONE" }, evidence_refs: [] });
    expect((await decide(ref)).ok).toBe(true);
  });
  it("only the bootstrap plane README placeholders are excluded; related valid evidence remains pinned", async () => {
    expect((await runInit(root, { architecture: "vue", platforms: "none" })).ok).toBe(true);
    await fixture();
    const out = await draft();
    expect(out.ok, JSON.stringify(out.errors)).toBe(true);
    expect(out.result?.ready).toBe(false); // Bootstrap baseline still needs its real confirmation.
    expect(out.result?.blockers.some(blocker => blocker.code === "BASELINE_NOT_CONFIRMED")).toBe(true);
    expect(out.result?.dependencies[".pomaster/evidence/runs/GRN-0001.json"]).toMatch(/^[0-9a-f]{64}$/);
    expect(out.result?.dependencies[".pomaster/evidence/claims/CLM-0001.json"]).toMatch(/^[0-9a-f]{64}$/);
    for (const plane of ["runs", "claims"]) expect(out.result?.dependencies[`.pomaster/evidence/${plane}/README.md`]).toBeUndefined();
    const ref = out.result!.review_ref;
    const bytes = readFileSync(path(`.pomaster/evidence/${storagePathOfSha256(ref)}`));
    put(".pomaster/evidence/runs/README.md", "changed plane documentation\n");
    expect((await runAutopilotReviewView(root, { reviewRef: ref })).result?.current).toBe(true);
    expect(readFileSync(path(`.pomaster/evidence/${storagePathOfSha256(ref)}`))).toEqual(bytes);
    put(".pomaster/evidence/claims/CLM-0001.json", "{damaged");
    expect((await runAutopilotReviewView(root, { reviewRef: ref })).ok).toBe(false);
  });
  it.each([
    [".pomaster/evidence/runs/GRN-9999.json", "{damaged"],
    [".pomaster/evidence/claims/CLM-9999.json", "{damaged"],
    [".pomaster/evidence/runs/GRN-9999.json", {}],
    [".pomaster/evidence/claims/CLM-9999.json", { subject: {} }],
    [".pomaster/evidence/runs/nested/README.md", "not an official plane placeholder"],
    [".pomaster/evidence/claims/notes.txt", "not evidence JSON"],
  ])("unknown or damaged non-placeholder evidence stays fail closed: %s", async (ref, value) => {
    expect((await runInit(root, { architecture: "vue", platforms: "none" })).ok).toBe(true);
    await fixture();
    put(ref, value);
    const bytes = readFileSync(path(ref));
    const out = await draft();
    expect(out.ok).toBe(false);
    expect(out.result).toBeNull();
    expect(out.errors.length).toBeGreaterThan(0);
    expect(readFileSync(path(ref))).toEqual(bytes);
  });
  it("an explicitly referenced damaged GRN is not hidden as unrelated evidence", async () => {
    await fixture();
    const claim = read(".pomaster/evidence/claims/CLM-0001.json");
    claim.evidence_refs.push({ ref_type: "gate_result", grn: "GRN-9999" });
    put(".pomaster/evidence/claims/CLM-0001.json", claim);
    put(".pomaster/evidence/runs/GRN-9999.json", "{damaged");
    const out = await draft();
    expect(out.ok && out.result?.ready).toBe(false);
    expect(readFileSync(path(".pomaster/evidence/runs/GRN-9999.json"), "utf8")).toBe("{damaged");
  });
  it("unknowable evidence membership remains fail closed", async () => {
    await fixture(); const ref = await ready();
    put(".pomaster/evidence/runs/GRN-9999.json", "{damaged");
    expect((await decide(ref)).ok).toBe(false);
  });
  it("required SIT cannot skip a missing actual ledger", async () => {
    await fixture(); evidence("passed", "sit");
    const out = await draft();
    expect(out.result?.ready).toBe(false);
    expect(out.result?.blockers.some((entry) => entry.code === "AUTOPILOT_REVIEW_LEDGER_NOT_PASSED")).toBe(true);
  });
  it("generic SECURITY does not manufacture a required ZAP leg", async () => {
    await fixture("SECURITY");
    expect((await draft()).result?.ready).toBe(true);
  });
  it("C12 final evidence without the merged build surface blocks", async () => {
    await fixture(); const run = read(".pomaster/evidence/runs/GRN-0001.json");
    const snap = captureEvidenceSourceSnapshot(root, { relevantPaths: ["src/app.ts"], head: null });
    run.source_snapshot = { before: snap, after: snap, window: compareSourceSnapshots(snap, snap) };
    put(".pomaster/evidence/runs/GRN-0001.json", run);
    expect((await draft()).result?.ready).toBe(false);
  });
});
describe("signed immutable decisions and recoverable application", () => {
  it("refuses missing signature and absent registry, no self-attested fallback", async () => {
    await fixture(); const ref = await ready();
    const out = await runAutopilotReviewDecide(root, { reviewRef: ref, verdict: "ACCEPT" });
    expect(out.errors[0]?.code).toBe("TRUST_SIGNOFF_REQUIRED");
    rmSync(path(".pomaster/trust"), { recursive: true });
    expect((await runAutopilotReviewDecide(root, { reviewRef: ref, verdict: "ACCEPT" })).errors[0]?.code).toBe("TRUST_NOT_ENROLLED");
  });
  it.each(["input/requirements.md", "src/app.ts", ".pomaster/evidence/runs/GRN-0001.json"])("C10 drift at draft→decide: %s", async (file) => {
    await fixture(); const ref = await ready();
    writeFileSync(path(file), `${readFileSync(path(file), "utf8")} `);
    const out = await decide(ref);
    expect(out.ok).toBe(false);
    expect(out.errors[0]?.code).toBe("AUTOPILOT_REVIEW_STALE");
  });
  it.each(["input/requirements.md", "src/app.ts", ".pomaster/evidence/runs/GRN-0001.json"])("C11 drift at decide→apply: %s", async (file) => {
    await fixture(); const accepted = await decide(await ready());
    expect(accepted.ok).toBe(true);
    writeFileSync(path(file), `${readFileSync(path(file), "utf8")} `);
    expect((await runAutopilotReviewApply(root, { decisionRef: accepted.result!.decision_ref })).ok).toBe(false);
    expect((await runCloseout(root, { taskId: TASK })).ok).toBe(false);
  });
  it("REWORK suspends only affected units; REJECT never applies", async () => {
    await fixture(); const reworked = await decide(await ready(), "REWORK", [TASK], "金额校验返工");
    expect(reworked.ok).toBe(true);
    expect(readFileSync(path(".pomaster/autopilot/suspensions.jsonl"), "utf8")).toContain(TASK);
    expect((await runAutopilotReviewApply(root, { decisionRef: reworked.result!.decision_ref })).errors[0]?.code).toBe("AUTOPILOT_REVIEW_NOT_ACCEPTED");
    const rejected = await decide(await ready(), "REJECT", [], "不接受");
    expect(rejected.ok).toBe(true);
    expect((await runAutopilotReviewApply(root, { decisionRef: rejected.result!.decision_ref })).ok).toBe(false);
  });
  it("snapshot tamper cannot be laundered through a caller-created receipt", async () => {
    await fixture(); const ref = await ready();
    put(`.pomaster/evidence/${storagePathOfSha256(ref)}`, { ...blob(ref), ready: true, tasks: [] });
    expect((await decide(ref)).errors[0]?.code).toBe("AUTOPILOT_REVIEW_TAMPERED");
    expect((await runCloseout(root, { taskId: TASK, projectAccept: ref })).ok).toBe(false);
  });
  it.each(["../outside.md", "C:/outside.md", "/outside.md", "themes/../../outside"])("rejects candidate path escape %s", async (theme) => {
    await fixture();
    const out = await draft([{ kind: "spec", subject: TASK, input: { text: "必须校验订单金额", theme, by: "agent:coordinator" } }]);
    expect(out.result?.ready).toBe(false);
  });
  it("rejects symlink targets before signing", async () => {
    await fixture();
    mkdirSync(path("outside")); mkdirSync(path(".pomaster/specs/hard/themes"), { recursive: true });
    symlinkSync(path("outside"), path(".pomaster/specs/hard/themes/escape"), "junction");
    const blocked = await draft([{ kind: "spec", subject: TASK, input: { theme: "themes/escape/rules", text: "必须校验订单金额", by: "agent:coordinator" } }]);
    expect(blocked.ok).toBe(false);
    expect(blocked.errors[0]?.code).toBe("AUTOPILOT_REVIEW_PATH_DENIED");
  });
  it("applies the exact reviewed spec, recovers effects and never consumes twice", async () => {
    await fixture();
    put(".pomaster/specs/hard/themes/index.md", "| 金额校验 | `themes/security.md` |\n");
    put(".pomaster/specs/hard/themes/security.md", "# Security\n\n## MUST\n\n## MUST NOT\n\n## SHOULD\n");
    const candidate = { kind: "spec", subject: TASK, input: { target: "spec", theme: "security", text: "订单金额必须使用整数最小货币单位", by: "agent:coordinator", scope: "订单接口", why: "避免浮点误差", check: "检查金额数据类型", do: "使用整数金额", dont: "使用浮点金额" } };
    const ref = await ready([candidate]);
    const accepted = await decide(ref); expect(accepted.ok, JSON.stringify(accepted.errors)).toBe(true);
    const decisionRef = accepted.result!.decision_ref;
    const interrupted = await runAutopilotReviewApply(root, { decisionRef }, { afterStage: (stage) => { if (stage === "candidate:0") throw new Error("crash"); } });
    expect(interrupted.ok).toBe(false);
    expect(readFileSync(path(".pomaster/specs/hard/themes/security.md"), "utf8")).toContain(candidate.input.text);
    const finished = await runAutopilotReviewApply(root, { decisionRef });
    expect(finished.ok, JSON.stringify(finished.errors)).toBe(true);
    expect(finished.result?.complete).toBe(true);
    const indexBefore = readFileSync(path(".pomaster/state/truth-index.json"), "utf8");
    const retry = await runAutopilotReviewApply(root, { decisionRef });
    expect(retry.ok).toBe(true);
    expect(readFileSync(path(".pomaster/state/truth-index.json"), "utf8")).toBe(indexBefore);
    expect(readdirSync(path(".pomaster/trust/consumed"))).toHaveLength(2);
    expect((await loadTruthIndex(await createStore(root))).objects.find((row) => row.id === TASK)?.axes.evidence).toBe("VERIFIED");
  }, 60_000);
  it("recovers interruption immediately after consuming the project signature", async () => {
    await fixture(); const reviewRef = await ready(); const signoff = sign(projectReviewStatement(reviewRef, "ACCEPT", [], ""));
    expect((await runAutopilotReviewDecide(root, { reviewRef, verdict: "ACCEPT", signoff }, { trust: noAgent, afterConsume: () => { throw new Error("crash"); } })).ok).toBe(false);
    const recovered = await runAutopilotReviewDecide(root, { reviewRef, verdict: "ACCEPT", signoff }, { trust: noAgent });
    expect(recovered.ok, JSON.stringify(recovered.errors)).toBe(true);
    expect((await runAutopilotReviewApply(root, { decisionRef: recovered.result!.decision_ref })).ok).toBe(true);
  });
  it("expired kickoff blocks application", async () => {
    await fixture(); const accepted = await decide(await ready());
    const current = read(".pomaster/kickoff/current.json"); current.valid_until = "2000-01-01T00:00:00Z"; put(".pomaster/kickoff/current.json", current);
    expect((await runAutopilotReviewApply(root, { decisionRef: accepted.result!.decision_ref })).ok).toBe(false);
  });
  it("rejects a caller-authored blob omitting final-code obligations even when signed", async () => {
    await fixture(); const ref = await ready(); const forged = { ...blob(ref), code_paths: [], build_paths: [] };
    const forgedRef = persistEvidenceArtifact(path(".pomaster/evidence"), { media: "json", bytes: Buffer.from(`${JSON.stringify(forged, null, 2)}\n`) }).sha256;
    expect((await decide(forgedRef)).ok).toBe(false);
  });
  it("REWORK records every affected unit once, with multiline feedback", async () => {
    await fixture("BUILD", true);
    const reviewRef = (await draft()).result!.review_ref;
    const units = [TASK, "TASK.REVIEW.TWO"];
    const reason = "金额校验\n权限回归";
    const signoff = sign(projectReviewStatement(reviewRef, "REWORK", units, reason));
    const input = { reviewRef, verdict: "REWORK" as const, affectedUnits: units, reason, signoff };
    expect((await runAutopilotReviewDecide(root, input, { trust: noAgent })).ok).toBe(true);
    expect((await runAutopilotReviewDecide(root, input, { trust: noAgent })).ok).toBe(true);
    const rows = readFileSync(path(".pomaster/autopilot/suspensions.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(rows.map((row) => row.unit).sort()).toEqual(units.sort());
  });
  it("new input file and new substantive spec invalidate the signed package", async () => {
    await fixture(); const ref = await ready();
    put("input/new-rule.md", "# New rule\n必须检查访问权限。\n");
    expect((await decide(ref)).ok).toBe(false);
    rmSync(path("input/new-rule.md"));
    const accepted = await decide(ref); expect(accepted.ok).toBe(true);
    put(".pomaster/specs/hard/themes/new-rule.md", "# New substantive rule\n订单需要新的审批规则。\n");
    expect((await runAutopilotReviewApply(root, { decisionRef: accepted.result!.decision_ref })).ok).toBe(false);
  });
  it("stale TASK semantics are rejected at both consumption boundaries", async () => {
    await fixture(); const ref = await ready();
    const index = await loadTruthIndex(await createStore(root));
    const row = index.objects.find((entry) => entry.id === TASK)!;
    const bodyPath = `.pomaster/${row.bodyRef}`;
    const original = readFileSync(path(bodyPath), "utf8");
    const body = JSON.parse(original); body.payload.intent = "Changed signed intent"; put(bodyPath, body);
    expect((await decide(ref)).ok).toBe(false);
    put(bodyPath, original);
    const accepted = await decide(ref); expect(accepted.ok).toBe(true);
    put(bodyPath, body);
    expect((await runAutopilotReviewApply(root, { decisionRef: accepted.result!.decision_ref })).ok).toBe(false);
  });
  it("signature content and replacement cannot be bypassed", async () => {
    await fixture(); const reviewRef = await ready();
    const signoff = sign(projectReviewStatement(reviewRef, "ACCEPT", [], ""));
    const altered = await runAutopilotReviewDecide(root, { reviewRef, verdict: "REJECT", signoff }, { trust: noAgent });
    expect(altered.errors[0]?.code).toBe("TRUST_SIGNOFF_MISMATCH");
    const accepted = await runAutopilotReviewDecide(root, { reviewRef, verdict: "ACCEPT", signoff }, { trust: noAgent });
    expect(accepted.ok).toBe(true);
    const req = path(`.pomaster/trust/requests/${signoff}.json`);
    writeFileSync(`${req}.sig`, signSshsig(makeKey("ssh-ed25519"), readFileSync(req)));
    expect((await runAutopilotReviewApply(root, { decisionRef: accepted.result!.decision_ref })).errors[0]?.code).toBe("TRUST_SIGNATURE_INVALID");
  });
  it("rejects absent signature bytes, wrong kind and expired signed requests", async () => {
    await fixture(); const reviewRef = await ready();
    const statement = statementSubject(projectReviewStatement(reviewRef, "ACCEPT", [], ""));
    for (const scenario of ["missing", "kind", "expired"]) {
      const requested = runTrustRequest(root, { kind: scenario === "kind" ? "kickoff" : "accept", ...statement }, { ...noAgent, ...(scenario === "expired" ? { now: () => new Date("2000-01-01T00:00:00Z") } : {}) });
      const signoff = (requested.result as { id: string }).id;
      const req = path(`.pomaster/trust/requests/${signoff}.json`);
      if (scenario !== "missing") writeFileSync(`${req}.sig`, signSshsig(key, readFileSync(req)));
      const out = await runAutopilotReviewDecide(root, { reviewRef, verdict: "ACCEPT", signoff }, { trust: noAgent });
      expect(out.errors[0]?.code).toBe(scenario === "missing" ? "TRUST_SIGNATURE_MISSING" : scenario === "kind" ? "TRUST_SIGNOFF_MISMATCH" : "TRUST_SIGNOFF_EXPIRED");
      expect(existsSync(path(`.pomaster/trust/consumed/${signoff}.json`))).toBe(false);
    }
  });
  it("recovers write-ahead intent before signature consumption without replay", async () => {
    await fixture(); const reviewRef = await ready(); const signoff = sign(projectReviewStatement(reviewRef, "ACCEPT", [], ""));
    const input = { reviewRef, verdict: "ACCEPT" as const, signoff };
    const interrupted = await runAutopilotReviewDecide(root, input, { trust: noAgent, beforeConsume: () => { throw new Error("crash before signature"); } });
    expect(interrupted.ok).toBe(false);
    expect(existsSync(path(`.pomaster/trust/consumed/${signoff}.json`))).toBe(false);
    expect((await runAutopilotReviewDecide(root, input, { trust: noAgent })).ok).toBe(true);
    expect(readdirSync(path(".pomaster/trust/consumed"))).toHaveLength(2);
  });
  it.each([`closeout:${TASK}`, "archive"])("recovers interruption after %s without duplicate effects", async (stage) => {
    await fixture(); const accepted = await decide(await ready());
    const decisionRef = accepted.result!.decision_ref;
    const interrupted = await runAutopilotReviewApply(root, { decisionRef }, { afterStage: (current) => { if (current === stage) throw new Error("crash after effect"); } });
    expect(interrupted.result?.complete).toBe(false);
    const before = readFileSync(path(".pomaster/state/truth-index.json"), "utf8");
    const resumed = await runAutopilotReviewApply(root, { decisionRef });
    expect(resumed.ok, JSON.stringify(resumed.errors)).toBe(true);
    expect(readFileSync(path(".pomaster/state/truth-index.json"), "utf8")).toBe(before);
    expect(readdirSync(path(".pomaster/trust/consumed"))).toHaveLength(2);
  });
  it("consumed owner and immutable assurance cannot be forged for project recovery", async () => {
    await fixture(); const accepted = await decide(await ready());
    const decisionRef = accepted.result!.decision_ref;
    const decision = blob(decisionRef);
    const consumedRef = `.pomaster/trust/consumed/${decision.signoff.signoff}.json`;
    const consumed = read(consumedRef); const original = readFileSync(path(consumedRef), "utf8");
    consumed.by = "different consumer"; put(consumedRef, consumed);
    expect((await runAutopilotReviewApply(root, { decisionRef })).errors[0]?.code).toBe("TRUST_SIGNOFF_MISMATCH");
    put(consumedRef, original);
    decision.signoff.assurance = "strong";
    const forged = persistEvidenceArtifact(path(".pomaster/evidence"), { media: "json", bytes: Buffer.from(`${JSON.stringify(decision, null, 2)}\n`) }).sha256;
    expect((await runAutopilotReviewApply(root, { decisionRef: forged })).errors[0]?.code).toBe("AUTOPILOT_REVIEW_TAMPERED");
  });
  it("malformed signed TTL is never a valid project signoff", async () => {
    await fixture(); const reviewRef = await ready(); const signoff = sign(projectReviewStatement(reviewRef, "ACCEPT"));
    const ref = `.pomaster/trust/requests/${signoff}.json`; const request = read(ref);
    request.expires_at = "not-a-date"; put(ref, request);
    writeFileSync(`${path(ref)}.sig`, signSshsig(key, readFileSync(path(ref))));
    expect((await runAutopilotReviewDecide(root, { reviewRef, verdict: "ACCEPT", signoff }, { trust: noAgent })).ok).toBe(false);
    expect(existsSync(path(`.pomaster/trust/consumed/${signoff}.json`))).toBe(false);
  });
  it("reordered or injected apply stages cannot become completion facts", async () => {
    await fixture(); const accepted = await decide(await ready()); const decisionRef = accepted.result!.decision_ref;
    expect((await runAutopilotReviewApply(root, { decisionRef }, { afterStage: () => { throw new Error("crash"); } })).ok).toBe(false);
    const events = `.pomaster/autopilot/reviews/applies/${decisionRef.slice(7)}/events.jsonl`;
    put(events, `${JSON.stringify({ stage: "complete", status: "done" })}\n`);
    expect((await runAutopilotReviewApply(root, { decisionRef })).errors[0]?.code).toBe("AUTOPILOT_REVIEW_TAMPERED");
  });
  it("a previously closed TASK cannot drift on retry", async () => {
    await fixture(); const accepted = await decide(await ready());
    const decisionRef = accepted.result!.decision_ref;
    expect((await runAutopilotReviewApply(root, { decisionRef })).ok).toBe(true);
    const row = (await loadTruthIndex(await createStore(root))).objects.find((entry) => entry.id === TASK)!;
    const body = read(`.pomaster/${row.bodyRef}`); body.payload.intent = "Different completed task"; put(`.pomaster/${row.bodyRef}`, body);
    expect((await runAutopilotReviewApply(root, { decisionRef })).errors[0]?.code).toBe("AUTOPILOT_REVIEW_STALE");
  });
  it("concurrent decisions consume once and concurrent applies cannot duplicate effects", async () => {
    await fixture(); const reviewRef = await ready(); const signoff = sign(projectReviewStatement(reviewRef, "ACCEPT"));
    const input = { reviewRef, verdict: "ACCEPT" as const, signoff };
    const results = await Promise.all([runAutopilotReviewDecide(root, input, { trust: noAgent }), runAutopilotReviewDecide(root, input, { trust: noAgent })]);
    const succeeded = results.filter((out) => out.ok);
    expect(succeeded.length).toBeGreaterThan(0);
    expect(new Set(succeeded.map((out) => out.result!.decision_ref)).size).toBe(1);
    expect(readdirSync(path(".pomaster/trust/consumed"))).toHaveLength(2);
    const decisionRef = succeeded[0]!.result!.decision_ref;
    const applies = await Promise.all([runAutopilotReviewApply(root, { decisionRef }), runAutopilotReviewApply(root, { decisionRef })]);
    expect(applies.filter((out) => out.ok)).toHaveLength(1);
    expect(readdirSync(path(".pomaster/trust/consumed"))).toHaveLength(2);
  });
  it("rechecks permits and budgets even after deciding", async () => {
    await fixture(); const accepted = await decide(await ready());
    const rows = Array.from({ length: 5 }, (_, index) => ({ unit: TASK, round: index + 1 }));
    put(".pomaster/autopilot/rounds.jsonl", rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    expect((await runAutopilotReviewApply(root, { decisionRef: accepted.result!.decision_ref })).errors[0]?.code).toBe("AUTOPILOT_BUDGET_EXHAUSTED");
    rmSync(path(".pomaster/autopilot/rounds.jsonl"));
    const permits = read(".pomaster/state/permits.json"); permits.permits[0].expires_at_seq = 0; put(".pomaster/state/permits.json", permits);
    expect((await runAutopilotReviewApply(root, { decisionRef: accepted.result!.decision_ref })).errors[0]?.code).toBe("AUTOPILOT_REVIEW_AUTHORIZATION_INVALID");
  });
});
