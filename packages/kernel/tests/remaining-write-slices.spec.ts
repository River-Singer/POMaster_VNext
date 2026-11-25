import { readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// Keep this file's genuine consumed-SSH verifier; bootstrap only the real planner verifier.
vi.mock("../../cli/src/trusted-write-bootstrap.js", () => ({
  bootstrapTrustedWrites: () => kernel.registerPlannerConstructionVerifier(verifyScenarioConstruction),
}));
import * as kernel from "@pomaster/kernel";
import { makeRoot, makeStore, pageEnvelope, gid, readJournal, indexPath, AGENT, HUMAN, producerRecord } from "./helpers.js";
import { runInit } from "../../cli/src/init.js";
import { runIntakeDraft } from "../../cli/src/intake-draft.js";
import { runIntakePending, runIntakeRead, runIntakeResolve } from "../../cli/src/intake.js";
import { runKickoffConfirm, runKickoffDraft } from "../../cli/src/kickoff.js";
import { runPlanScenarios, verifyScenarioConstruction } from "../../cli/src/plan-scenarios.js";
import { prepareRelationEntry } from "../src/relations.js";
import { normalizeGateResult } from "../src/gate-result.js";
import { runTrustEnroll, runTrustRequest, verifySignoff } from "../../cli/src/trust.js";
import { makeKey, signSshsig } from "../../cli/tests/fixtures/trust/sshsig-signer.js";

// Exercise the same registered persisted SSH boundary, not a fabricated kernel pass proof.
let afterVerify: (() => void) | undefined;
const verifier: kernel.PersistedSignoffVerifier = (root, signoff, expected) => {
  const result = verifySignoff(root, signoff, { kind: expected.kind, ref: expected.ref, sha256: expected.sha256 }, { consume: false, requireConsumed: true, requireConsumedBy: expected.consumedBy, env: { listAgentKeys: () => [] } });
  if (!result.ok) throw new kernel.GovernanceError("SCHEMA_INVALID", result.error.message, result.error.hint, { reason_code: result.error.code });
  const effect = afterVerify;
  afterVerify = undefined;
  effect?.();
  return result.record;
};
kernel.registerPersistedSignoffVerifier(verifier);

function signedProof(root: string, expected: kernel.PersistedSignoffExpectation, consume = true): string {
  const key = makeKey("ssh-ed25519");
  writeFileSync(join(root, "owner.pub"), key.line);
  const enrollment = runTrustEnroll(root, { key: "owner.pub", principal: "owner" }, { listAgentKeys: () => [] });
  expect(enrollment.ok).toBe(true);
  const registry = JSON.parse(readFileSync(join(root, ".pomaster/trust/signers.json"), "utf8"));
  const id = "SO-123456789abc";
  const request = { schema: "pomaster.signoff-request/v1", id, kind: expected.kind, project_id: registry.project_id, subject: { ref: expected.ref, sha256: expected.sha256 }, summary: "Review exact governed content", nonce: "test-nonce", issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString() };
  mkdirSync(join(root, ".pomaster/trust/requests"), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(request));
  writeFileSync(join(root, `.pomaster/trust/requests/${id}.json`), bytes);
  writeFileSync(join(root, `.pomaster/trust/requests/${id}.json.sig`), signSshsig(key, bytes));
  if (consume) expect(verifySignoff(root, id, { kind: expected.kind, ref: expected.ref, sha256: expected.sha256 }, { consume: true, consumedBy: expected.consumedBy, env: { listAgentKeys: () => [] } }).ok).toBe(true);
  return id;
}

const objectTx = (envelope: Record<string, unknown>): kernel.Transaction => ({ ops: [{ op: "upsert_object", envelope }] }) as unknown as kernel.Transaction;
const transition = (id = "PAGE.DASHBOARD"): kernel.TransactionOp => ({ op: "transition_object", id: gid(id), patch: { confidence: "LOCKED" }, reasonShort: "review" });
async function worker(store: kernel.Store, ids: string[]) {
  const permit = await kernel.issuePermit(store, { subjectIds: ids.map(gid), requestedBy: AGENT });
  const execution = await kernel.beginExecution(store, { role: "implementer", runtime: "claude-code", identityKind: "interactive", permitIds: [permit.permitRef] });
  return { permit, execution };
}

async function seeded() {
  const fixture = await makeStore();
  const tx = { ops: [{ op: "upsert_object", envelope: pageEnvelope() }] } as unknown as kernel.Transaction;
  await kernel.applyTransaction(fixture.store, tx);
  const row = (await kernel.loadTruthIndex(fixture.store)).objects[0]!;
  return { ...fixture, tx, path: join(fixture.root, ".pomaster", row.bodyRef) };
}

const binding = (extra: Record<string, unknown> = {}) => ({
  id: "KEYBINDING.PAGE.DASHBOARD", binding_class: "page_to_dir", canonical_id: "PAGE.DASHBOARD",
  physical_path: "src/dashboard", binding_status: "derived", match_rule: "mechanical",
  probe: { method: "directory-exists", last_run_seq: 1, result: "matched" }, ...extra,
});
const bindTx = (row: Record<string, unknown>) => ({ ops: [{ op: "upsert_keybinding", row }] }) as unknown as kernel.Transaction;

async function admittedPlannerRound() {
  const root = makeRoot();
  expect((await runInit(root)).ok).toBe(true);
  const fixtures = fileURLToPath(new URL("../../cli/tests/fixtures/intake/", import.meta.url));
  for (const version of ["v1", "v2"]) expect((await runIntakeRead(root, { paths: [join(fixtures, version)], name: "orders" })).ok).toBe(true);
  const pending = runIntakePending(root, {}).result?.blocks ?? [];
  expect(pending.length).toBeGreaterThan(0);
  expect(runIntakeResolve(root, { block: pending.map(block => block.id), as: "skip", reason: "Synthetic fixture review; non-business configuration" }).ok).toBe(true);
  expect((await runIntakeRead(root, { paths: [join(fixtures, "v2")], name: "orders" })).ok).toBe(true);
  expect(runIntakeDraft(root, {}).ok).toBe(true);
  const key = makeKey("ssh-ed25519"), env = { trust: { listAgentKeys: () => [] }, probe: () => ({ ok: false, output: "" }) };
  writeFileSync(join(root, "owner.pub"), key.line);
  expect(runTrustEnroll(root, { key: "owner.pub", principal: "owner" }, env.trust).ok).toBe(true);
  const drafted = runKickoffDraft(root, {}, env);
  expect(drafted.ok, JSON.stringify(drafted.errors)).toBe(true);
  const round = drafted.result!.id, sheetPath = join(root, `.pomaster/kickoff/${round}/sheet.json`);
  const sheet = JSON.parse(readFileSync(sheetPath, "utf8"));
  const answers = Object.fromEntries(sheet.questions.filter((question: { classification: string }) => question.classification === "BLOCKING_AUTHORITY").map((question: { key: string }) => [question.key, "直属主管"]));
  writeFileSync(join(root, `.pomaster/kickoff/${round}/choices.yaml`), `answers: ${JSON.stringify(answers)}\nstack_decision:\n  backend: material\n`);
  expect(runKickoffDraft(root, {}, env).result?.ready).toBe(true);
  const request = runTrustRequest(root, { kind: "kickoff", subject: `.pomaster/kickoff/${round}/sheet.json` }, env.trust);
  expect(request.ok).toBe(true);
  const signoff = request.result!.id, requestPath = join(root, `.pomaster/trust/requests/${signoff}.json`);
  writeFileSync(`${requestPath}.sig`, signSshsig(key, readFileSync(requestPath)));
  const confirmed = await runKickoffConfirm(root, { signoff }, env);
  expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
  const planned = await runPlanScenarios(root);
  expect(planned.ok, JSON.stringify(planned.errors)).toBe(true);
  const store = await kernel.loadStoreReadOnly(root);
  const tx: kernel.Transaction = JSON.parse(readFileSync(join(root, `.pomaster/plan/${round}/units.tx.json`), "utf8"));
  return { root, round, store, tx };
}

const plannerState = (root: string) => ["state/truth-index.json", "state/permits.json", "state/relations.jsonl", "state/journal.jsonl"].map(path => readFileSync(join(root, ".pomaster", path), "utf8"));

describe("planner adoption independent review", () => {
  it("rejects an additional conflicting INSTANCE_OF edge on otherwise exact replay", async () => {
    const { root, tx, store } = await admittedPlannerRound();
    const task = tx.ops.find(op => op.op === "upsert_object");
    expect(task?.op).toBe("upsert_object");
    if (task?.op !== "upsert_object") throw new Error("Missing planner task");
    const edge = prepareRelationEntry({ type: "INSTANCE_OF", source: { domain: "truth", id: task.envelope.id }, target: { domain: "catalog", id: "RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY" }, origin: "static_analysis", confidence: "deterministic", producer: "ANALYZER.PLAN_SCENARIOS", sourceRef: "test:conflicting-adoption" }, (await kernel.loadTruthIndex(store)).generation.seq);
    const path = join(root, ".pomaster/state/relations.jsonl");
    writeFileSync(path, `${readFileSync(path, "utf8")}${JSON.stringify(edge)}\n`);
    const before = plannerState(root);
    await expect(kernel.applyTransaction(store, tx)).rejects.toMatchObject({ details: { reason_code: "PLANNER_ADOPTION_INVALID" } });
    expect(plannerState(root)).toEqual(before);
  });

  it.each(["plan", "kickoff", "signature"])("rechecks pre-validation %s snapshots before a no-change return", async input => {
    const { root, round, store, tx } = await admittedPlannerRound();
    const path = input === "plan" ? join(root, `.pomaster/plan/${round}/plan.json`)
      : input === "kickoff" ? join(root, ".pomaster/kickoff/current.json")
      : join(root, `.pomaster/trust/requests/${tx.plannerConstruction!.signoffRef}.json.sig`);
    const before = plannerState(root);
    const changed = input === "signature" ? "tampered signature after verification"
      : JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), ...(input === "plan" ? { units: [] } : { valid_until: "2000-01-01T00:00:00.000Z" }) });
    afterVerify = () => { writeFileSync(path, changed); };
    try {
      await expect(kernel.applyTransaction(store, tx)).rejects.toThrow();
      expect(readFileSync(path, "utf8")).toBe(changed);
      expect(plannerState(root)).toEqual(before);
    } finally { afterVerify = undefined; }
  });

  it("preserves an actionable legacy rebuild warning at the public replay entry", async () => {
    const { root, round, tx } = await admittedPlannerRound();
    const ops = tx.ops.map(op => {
      if (op.op !== "upsert_object") return op;
      const { keyBindings: _bindings, ...envelope } = op.envelope;
      void _bindings;
      return { ...op, envelope };
    });
    const legacy = { ...tx, ops }, intent = kernel.sha256OfCanonical(legacy);
    writeFileSync(join(root, `.pomaster/plan/${round}/units.tx.json`), JSON.stringify(legacy));
    const journalPath = join(root, ".pomaster/state/journal.jsonl");
    const events = readJournal(root).trim().split("\n").map(line => JSON.parse(line));
    for (const event of events) {
      if (event.type === "TX_APPLIED" && event.admission_intent === kernel.sha256OfCanonical(tx)) event.admission_intent = intent;
    }
    writeFileSync(journalPath, events.map(event => JSON.stringify(event)).join("\n") + "\n");
    const before = plannerState(root), result = await runPlanScenarios(root);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: "PLANNER_ADOPTION_REBUILD_REQUIRED", hint: expect.stringContaining("Owner signature") });
    expect(plannerState(root)).toEqual(before);
  });
});

describe("BE-4 sanctioned writes", () => {
  it("manual confirmation verifies a consumed persisted SSH signoff and replays without writes", async () => {
    const { store, root } = await seeded();
    mkdirSync(join(root, "src/dashboard"), { recursive: true });
    const row = binding({ binding_status: "confirmed", match_rule: "manual_confirmed", probe: { method: "manual-review", last_run_seq: 1, result: "not_probed" } }) as kernel.KeybindingRow;
    const subject = kernel.keybindingConfirmationSubject(row);
    await expect(kernel.applyTransaction(store, bindTx(row))).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "TRUST_SIGNOFF_REQUIRED" } });
    const signoffRef = signedProof(root, subject);
    const tx: kernel.Transaction = { ops: [{ op: "upsert_keybinding", row, signoffRef }] };
    await kernel.applyTransaction(store, tx);
    const index = readFileSync(indexPath(root), "utf8");
    const journal = readJournal(root);
    expect((await kernel.applyTransaction(store, bindTx(row))).shortCircuited).toBe(true);
    expect(readFileSync(indexPath(root), "utf8")).toBe(index);
    expect(readJournal(root)).toBe(journal);
    await expect(kernel.applyTransaction(store, { ops: [{ op: "upsert_keybinding", row: { ...row, physical_path: "src/other" }, signoffRef }] })).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "TRUST_SIGNOFF_MISMATCH" } });
    writeFileSync(join(root, `.pomaster/trust/requests/${signoffRef}.json.sig`), "tampered signature");
    await expect(kernel.applyTransaction(store, tx)).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "TRUST_SIGNATURE_INVALID" } });
  });

  it("unconsumed signatures cannot promote manual bindings", async () => {
    const { store, root } = await seeded();
    mkdirSync(join(root, "src/dashboard"), { recursive: true });
    const row = binding({ binding_status: "confirmed", match_rule: "manual_confirmed" }) as kernel.KeybindingRow;
    const signoffRef = signedProof(root, kernel.keybindingConfirmationSubject(row), false);
    await expect(kernel.applyTransaction(store, { ops: [{ op: "upsert_keybinding", row, signoffRef }] })).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "TRUST_SIGNOFF_MISMATCH" } });
  });

  it("truth body closure helper uses signed exact observed scope and rejects damaged ADVANCE history", async () => {
    const { store, root, path } = await seeded();
    const body = JSON.parse(readFileSync(path, "utf8"));
    body.title_zh = "已审正文标题";
    writeFileSync(path, JSON.stringify(body));
    await kernel.applyTransaction(store, { ops: [] });
    const subject = kernel.truthBodyAdvanceSubject(store, "PAGE.DASHBOARD");
    const signoffRef = signedProof(root, subject);
    const record = kernel.prepareTruthBodyAdvance(store, { id: "PAGE.DASHBOARD", actor: "human:owner", reason: "已验证当前正文并接受标题变更", evidenceRefs: ["test:current-body-review"], evidenceSha256: subject.sha256, signoffRef });
    const tx: kernel.Transaction = { ops: [{ op: "record_advance", record }] };
    await kernel.applyTransaction(store, tx);
    expect(kernel.assessTruthBodyEdits(store, ["PAGE.DASHBOARD"]).blockedIds).toEqual([]);
    const journal = readJournal(root);
    expect((await kernel.applyTransaction(store, tx)).shortCircuited).toBe(true);
    expect(readJournal(root)).toBe(journal);
    const advancePath = join(root, ".pomaster/state/advances/ADV-0001.json");
    const advance = JSON.parse(readFileSync(advancePath, "utf8"));
    advance.advance.rejudge.verdict = "DENY";
    writeFileSync(advancePath, JSON.stringify(advance));
    expect(kernel.assessTruthBodyEdits(store, ["PAGE.DASHBOARD"]).blockedIds).toEqual(["PAGE.DASHBOARD"]);
    await expect(kernel.applyTransaction(store, { ops: [] })).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("schema/payload/cross-axis/reference corruption rolls back before any indexed mutation", async () => {
    for (const modify of [
      (body: Record<string, unknown>) => { body.authority = null; },
      (body: Record<string, unknown>) => { body.payload = []; },
      (body: Record<string, unknown>) => { body.axes = { lifecycle: "PROPOSED", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" }; },
      (body: Record<string, unknown>) => { body.successor_ref = "PAGE.MISSING"; },
    ]) {
      const { store, root, path } = await seeded();
      const body = JSON.parse(readFileSync(path, "utf8"));
      modify(body);
      writeFileSync(path, JSON.stringify(body));
      const index = readFileSync(indexPath(root), "utf8");
      const journal = readJournal(root);
      await expect(kernel.applyTransaction(store, objectTx(pageEnvelope({ titleZh: "sanctioned update" })))).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "TRUTH_BODY_TAMPERED" } });
      expect(readFileSync(indexPath(root), "utf8")).toBe(index);
      expect(readJournal(root)).toBe(journal);
    }
  });

  it("unswept edits and damaged journal fail closed without observation writes", async () => {
    const { store, root, path, tx } = await seeded();
    const body = JSON.parse(readFileSync(path, "utf8"));
    body.title_zh = "未观察的正文";
    writeFileSync(path, JSON.stringify(body));
    const journal = readJournal(root);
    expect(kernel.assessTruthBodyEdits(store, ["PAGE.DASHBOARD"]).blockedIds).toEqual(["PAGE.DASHBOARD"]);
    expect(readJournal(root)).toBe(journal);
    writeFileSync(join(root, ".pomaster/state/journal.jsonl"), `${journal}{broken\n`);
    expect(kernel.assessTruthBodyEdits(store, ["PAGE.DASHBOARD"]).blockedIds).toEqual(["PAGE.DASHBOARD"]);
    await expect(kernel.applyTransaction(store, tx)).rejects.toThrow();
  });

  it("confirmed uniqueness is per class; derived duplicates are allowed and symlink escape becomes stale", async () => {
    const { store, root } = await seeded();
    await kernel.applyTransaction(store, objectTx(pageEnvelope({ id: gid("PAGE.OTHER") })));
    mkdirSync(join(root, "src/dashboard"), { recursive: true });
    await kernel.applyTransaction(store, bindTx(binding({ binding_status: "confirmed" })));
    const other = binding({ id: "KEYBINDING.PAGE.OTHER", canonical_id: "PAGE.OTHER", binding_status: "confirmed" });
    await expect(kernel.applyTransaction(store, bindTx(other))).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "KEYBINDING_CONFLICT" } });
    await kernel.applyTransaction(store, bindTx({ ...other, binding_status: "derived" }));
    const outside = await makeStore();
    symlinkSync(outside.root, join(root, "src/escape"), process.platform === "win32" ? "junction" : "dir");
    await kernel.applyTransaction(store, bindTx(binding({ physical_path: "src/escape", binding_status: "confirmed" })));
    expect(kernel.readKeybindings(root).find(row => row.id === "KEYBINDING.PAGE.DASHBOARD")?.binding_status).toBe("stale");
    rmSync(join(root, "src/dashboard"), { recursive: true });
    await kernel.applyTransaction(store, bindTx(binding()));
    expect(kernel.readKeybindings(root).find(row => row.id === "KEYBINDING.PAGE.DASHBOARD")?.probe.result).toBe("unreachable");
  });

  it("does not borrow another execution's permit, including explicit override and replay", async () => {
    const { store, root, tx } = await seeded();
    const own = await worker(store, ["PAGE.OTHER"]);
    const other = await worker(store, ["PAGE.DASHBOARD"]);
    const before = readFileSync(indexPath(root), "utf8");
    const journal = readJournal(root);
    for (const request of [
      { ...tx, executionId: own.execution.execution_id },
      { ops: [transition()], executionId: own.execution.execution_id },
      { ops: [transition()], executionId: own.execution.execution_id, permitRef: other.permit.permitRef },
      { ops: [transition()] },
    ]) await expect(kernel.applyTransaction(store, request)).rejects.toMatchObject({ code: "PERMIT_SCOPE_DENIED" });
    expect(readFileSync(indexPath(root), "utf8")).toBe(before);
    expect(readJournal(root)).toBe(journal);
    await kernel.applyTransaction(store, { ops: [transition()], executionId: other.execution.execution_id });
  });

  it("runs and journals actual New Entity judgement, rejecting caller pass flags and unavailable catalog", async () => {
    const { store, root } = await seeded();
    const own = await worker(store, ["PAGE.NOVEL"]);
    const tx = { ...objectTx(pageEnvelope({ id: gid("PAGE.NOVEL") })), executionId: own.execution.execution_id };
    await expect(kernel.applyTransaction(store, { ...tx, newEntity: { passed: true } } as unknown as kernel.Transaction)).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "NEW_ENTITY_PROOF_REQUIRED" } });
    const candidates = [{ wordForm: "PAGE.NOVEL", need: "zzzxqv_independent_novel_surface" }];
    await expect(kernel.applyTransaction(store, { ...tx, newEntity: { candidates, catalogRoot: join(root, "missing-catalog") } })).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "NEW_ENTITY_PROOF_REJECTED" } });
    await kernel.applyTransaction(store, { ...tx, newEntity: { candidates, catalogRoot: fileURLToPath(new URL("../../../catalog", import.meta.url)) } });
    const event = readJournal(root).split("\n").filter(Boolean).map(line => JSON.parse(line)).find(event => event.type === "NEW_ENTITY_CHECKED");
    expect(event.report.result.verdict).toBe("passed");
    expect(event.execution_id).toBe(own.execution.execution_id);
    expect(event.permit_refs).toEqual([own.permit.permitRef]);
  });

  it("resolves permitted verification subjects from pending claims in the same transaction", async () => {
    const { store, root } = await seeded();
    const own = await worker(store, ["PAGE.DASHBOARD"]);
    await kernel.applyTransaction(store, { executionId: own.execution.execution_id, ops: [
      { op: "record_claim", claim: { clm: "CLM-1001", subjectId: gid("PAGE.DASHBOARD"), assertion: "review", assertedBy: AGENT, evidenceRefs: [] } },
      { op: "verify_claim", claim: { clm: "CLM-1001", verifiedBy: HUMAN, evidenceRefs: ["PAGE.DASHBOARD"] } },
    ] });
    const claim = JSON.parse(readFileSync(join(root, ".pomaster/evidence/claims/CLM-1001.json"), "utf8"));
    expect(claim.verification.verdict).toBe("VERIFIED");
  });

  it("binding retargeting requires both old and new canonical subjects", async () => {
    const { store, root } = await seeded();
    await kernel.applyTransaction(store, objectTx(pageEnvelope({ id: gid("PAGE.OTHER") })));
    mkdirSync(join(root, "src/dashboard"), { recursive: true });
    await kernel.applyTransaction(store, bindTx(binding()));
    const own = await worker(store, ["PAGE.OTHER"]);
    await expect(kernel.applyTransaction(store, { executionId: own.execution.execution_id, ops: [{ op: "upsert_keybinding", row: binding({ canonical_id: "PAGE.OTHER" }) as kernel.KeybindingRow }] })).rejects.toMatchObject({ code: "PERMIT_SCOPE_DENIED", details: { id: "PAGE.DASHBOARD" } });
  });

  it("checks every governed batch subject including pending claims", async () => {
    const { store } = await seeded();
    await kernel.applyTransaction(store, objectTx(pageEnvelope({ id: gid("PAGE.OTHER") })));
    const own = await worker(store, ["PAGE.DASHBOARD"]);
    const claim = { clm: "CLM-1001", subjectId: gid("PAGE.OTHER"), assertion: "review", assertedBy: AGENT, evidenceRefs: [] };
    await expect(kernel.applyTransaction(store, { executionId: own.execution.execution_id, ops: [
      transition(), { op: "record_claim", claim },
      { op: "verify_claim", claim: { clm: claim.clm, verifiedBy: AGENT, evidenceRefs: ["PAGE.OTHER"] } },
    ] })).rejects.toMatchObject({ code: "PERMIT_SCOPE_DENIED" });
  });

  it("keeps genuinely unbound gate evidence compatible, but rejects unattributed runtime mutation", async () => {
    const { store } = await seeded();
    await kernel.beginExecution(store, { role: "implementer", runtime: "claude-code", identityKind: "interactive", permitIds: [] });
    const result = normalizeGateResult({ value: { grn: "GRN-9991", gate: "BUILD", gate_def: "POLICY.GATE.BUILD@1.0.0", verdict: "passed", counts: { scanned: 1, applicable_scanned: 1, violations: 0, not_applicable: 0 }, blindspot: { scanned: 1, produced: 1 } }, claimedBy: AGENT }, { tool: "test:build", toolVersion: "1.0.0", metricDialect: "test", ranAtSeq: 1, trigger: "on_demand" });
    await kernel.applyTransaction(store, { ops: [{ op: "record_gate_run", run: { grn: result.grn, result, trigger: "on_demand" } }] });
    await expect(kernel.applyTransaction(store, { ops: [{ op: "register_producer", record: producerRecord() as unknown as kernel.ProducerRecord }] })).rejects.toMatchObject({ code: "PERMIT_SCOPE_DENIED" });
  });

  it("does not let a generic truth-body advance certify an unrelated old/current digest", async () => {
    const { store, path } = await seeded();
    const body = JSON.parse(readFileSync(path, "utf8"));
    body.title_zh = "真实合法新标题";
    writeFileSync(path, JSON.stringify(body));
    await kernel.applyTransaction(store, { ops: [] });
    const after = { kind: "truth_body", ref: "PAGE.DASHBOARD", digest: kernel.digestValue(body), version: body.rev };
    const advance = kernel.buildAdvance({ basis: "explicit-evidence", actor: "human:owner", reason: "复核标题变更", evidenceRefs: ["test:body-review"], evidenceSha256: kernel.digestValue("review"), oldAnchor: { ...after, digest: kernel.digestValue("unrelated") }, newAnchor: after, affectedIds: ["PAGE.DASHBOARD"], rejudge: kernel.buildRejudge([{ gate: "truth.body.validation" }]) });
    await expect(kernel.applyTransaction(store, { ops: [{ op: "record_advance", record: { actor: "human:owner", reason: "复核标题变更", advance, currentAnchor: after as kernel.VnextAnchor } }] })).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
  it("invalid external edits reject even identical transaction replay, with no new journal/index", async () => {
    const { store, root, tx, path } = await seeded();
    const body = JSON.parse(readFileSync(path, "utf8"));
    body.axes.confidence = "INVENTED";
    writeFileSync(path, JSON.stringify(body));
    const beforeIndex = readFileSync(indexPath(root), "utf8");
    const beforeJournal = readJournal(root);
    await expect(kernel.applyTransaction(store, tx)).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "TRUTH_BODY_TAMPERED" } });
    expect(readFileSync(indexPath(root), "utf8")).toBe(beforeIndex);
    expect(readJournal(root)).toBe(beforeJournal);
  });

  it("legal external edits disclose and remain blocked until actual truth-body ADVANCE", async () => {
    const { store, root, path } = await seeded();
    const body = JSON.parse(readFileSync(path, "utf8"));
    body.title_zh = "合法新标题";
    writeFileSync(path, JSON.stringify(body));
    await kernel.applyTransaction(store, { ops: [] });
    expect(readJournal(root)).toContain("OUT_OF_BAND_EDIT_OBSERVED");
    const assess = (kernel as unknown as { assessTruthBodyEdits: (s: kernel.Store, ids: string[]) => { blockedIds: string[] } }).assessTruthBodyEdits;
    expect(assess(store, ["PAGE.DASHBOARD"]).blockedIds).toEqual(["PAGE.DASHBOARD"]);
    const event = readJournal(root).split("\n").filter(Boolean).map(line => JSON.parse(line)).find(e => e.type === "OUT_OF_BAND_EDIT_OBSERVED");
    const after = { kind: "truth_body", ref: "PAGE.DASHBOARD", digest: event.actual, version: body.rev } as kernel.VnextAnchor;
    const advance = kernel.buildAdvance({ basis: "explicit-evidence", actor: "human:owner", reason: "复核并推进外部标题变更", evidenceRefs: ["test:packages/kernel/tests/remaining-write-slices.spec.ts"], evidenceSha256: kernel.digestValue("review"), oldAnchor: { ...after, digest: event.stored }, newAnchor: { ...after }, affectedIds: ["PAGE.DASHBOARD"], rejudge: kernel.buildRejudge([{ gate: "truth.body.validation" }]) });
    await kernel.applyTransaction(store, { ops: [{ op: "record_advance", record: { actor: "human:owner", reason: "复核并推进外部标题变更", advance } }] });
    expect(assess(store, ["PAGE.DASHBOARD"]).blockedIds).toEqual([]);
  });

  it("binding is persisted through kernel, idempotent and unreachable becomes stale", async () => {
    const { store, root } = await seeded();
    mkdirSync(join(root, "src/dashboard"), { recursive: true });
    await kernel.applyTransaction(store, bindTx(binding()));
    const path = join(root, ".pomaster/truth/keybindings/KEYBINDING.PAGE.DASHBOARD.json");
    expect(JSON.parse(readFileSync(path, "utf8")).binding_status).toBe("derived");
    expect((await kernel.applyTransaction(store, bindTx(binding()))).shortCircuited).toBe(true);
    await kernel.applyTransaction(store, bindTx(binding({ physical_path: "src/missing" })));
    expect(JSON.parse(readFileSync(path, "utf8")).binding_status).toBe("stale");
  });

  it("missing explicit permit and outside scope are denied during active execution; predev stays compatible", async () => {
    const { store, root } = await seeded();
    // Use the real execution API rather than handcrafted execution records.
    const execution = await kernel.beginExecution(store, { role: "implementer", runtime: "claude-code", identityKind: "interactive", permitIds: [] });
    await expect(kernel.applyTransaction(store, { ops: [{ op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { confidence: "LOCKED" }, reasonShort: "review" }] })).rejects.toMatchObject({ code: "PERMIT_SCOPE_DENIED" });
    expect(execution).toBeDefined();
    expect(readJournal(root)).not.toContain('"ops":["transition_object"]');
  });
});
