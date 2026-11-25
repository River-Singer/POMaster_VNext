import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, beginExecution, createStore, loadStoreReadOnly, loadTruthIndex, type GovernedId, type ObjectEnvelopeInput, type KeybindingRow } from "@pomaster/kernel";
import * as publicApi from "../src/index.js";
import { createProgram, runCli } from "../src/index.js";
import { runBindingsSync, runBindingsDeclare } from "../src/bindings.js";
import { runFactAdd } from "../src/fact.js";
import { breakGlassSubject, runTruthBodyAdvance } from "../src/maintain.js";
import { bootstrapTrustedWrites } from "../src/trusted-write-bootstrap.js";
import { runAutopilotReviewView } from "../src/autopilot-review.js";
import { runTrustEnroll, runTrustRequest, statementSubject, verifySignoff } from "../src/trust.js";
import { makeKey, signSshsig } from "./fixtures/trust/sshsig-signer.js";
import { assessCloseoutMachine } from "../src/closeout.js";
import { runAlerts, ALERTS_OUTPUT_HARD_CAP } from "../src/alerts.js";
import { runDoctor } from "../src/doctor.js";

let root: string;
const file = (path: string) => join(root, path);
function put(path: string, value: unknown) { fs.mkdirSync(join(file(path), ".."), { recursive: true }); fs.writeFileSync(file(path), typeof value === "string" ? value : JSON.stringify(value)); }
function tree(): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (path: string) => { for (const entry of fs.readdirSync(file(path), { withFileTypes: true })) { const next = path ? `${path}/${entry.name}` : entry.name; if (entry.isDirectory()) { result[`${next}/`] = "directory"; walk(next); } else result[next] = fs.readFileSync(file(next)).toString("base64"); } };
  walk(""); return result;
}
function envelope(id = "PAGE.TEST"): ObjectEnvelopeInput { return { id: id as GovernedId, kind: "page_surface", axisProfile: "page_default", titleZh: "候选", axes: { lifecycle: "PROPOSED", confidence: "UNRESOLVED", evidence: "PLANNED", change: "STABLE" }, authority: { owner: "BOOTSTRAP_OWNER", delegates: [] }, origin: "natural", payload: { surface: "V1" } }; }
async function cli(args: string[]) { const out: string[] = []; const err: string[] = []; const code = await runCli(["--dir", root, ...args, "--json"], { stdout: text => out.push(text), stderr: text => err.push(text) }); expect(out).toHaveLength(1); return { code, value: JSON.parse(out[0]!) as { command: string; ok: boolean; result: Record<string, unknown> & { permit?: { scope: { subjectIds: string[] } } }; errors: { code: string; hint: string }[]; warnings: { code: string }[] } }; }
function failed(result: Awaited<ReturnType<typeof cli>>, command: string) { expect(result.code).toBe(1); expect(result.value.ok).toBe(false); expect(result.value.command).toBe(command); expect(result.value.errors.length).toBeGreaterThan(0); expect(result.value.errors[0]?.code).not.toBe("UNEXPECTED_ERROR"); }
async function signed(subject: { ref: string; sha256: string }) {
  const key = makeKey("ssh-ed25519"); put("owner.pub", key.line);
  expect(runTrustEnroll(root, { key: file("owner.pub"), principal: "owner" }, { listAgentKeys: () => [] }).ok).toBe(true);
  const requested = runTrustRequest(root, { kind: "accept", ...subject, ttlMinutes: 3 }, { listAgentKeys: () => [] });
  expect(requested.ok).toBe(true); const id = requested.result!.id!;
  const path = `.pomaster/trust/requests/${id}.json`; put(`${path}.sig`, signSshsig(key, fs.readFileSync(file(path)))); return id;
}
const binding: KeybindingRow = { id: "KEYBINDING.PAGE.TEST", binding_class: "page_to_dir", canonical_id: "PAGE.TEST", physical_path: "src/page", binding_status: "confirmed", match_rule: "manual_confirmed", probe: { method: "review", last_run_seq: 1, result: "not_probed" } };

beforeEach(async () => { root = fs.mkdtempSync(join(tmpdir(), "pomaster-public-")); await createStore(root); put(".pomaster/state/authority.json", { version: 1, authorities: { BOOTSTRAP_OWNER: {} } }); await applyTransaction(loadStoreReadOnly(root), { ops: [{ op: "upsert_object", envelope: envelope() }] }); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 30 }));

describe("PUBLIC production wiring", () => {
  it("exports the actual production admission, review and bootstrap functions", () => {
    expect(publicApi.runBindingsSync).toBe(runBindingsSync);
    expect(publicApi.runBindingsDeclare).toBe(runBindingsDeclare);
    expect(publicApi.runFactAdd).toBe(runFactAdd);
    expect(publicApi.runTruthBodyAdvance).toBe(runTruthBodyAdvance);
    expect(publicApi.runAutopilotReviewView).toBe(runAutopilotReviewView);
    expect(publicApi.bootstrapTrustedWrites).toBe(bootstrapTrustedWrites);
  });
  it("registers bounded binding/fact/truth commands and original dispatch flags", () => {
    const program = createProgram();
    for (const [group, leaves] of [["bindings", ["sync", "declare", "statement"]], ["fact", ["add"]], ["truth-body", ["statement", "advance"]]] as const) expect(program.commands.find(c => c.name() === group)?.commands.map(c => c.name())).toEqual(leaves);
    expect(program.commands.find(c => c.name() === "execution")?.commands.find(c => c.name() === "handoff")?.options.some(o => o.long === "--dispatch")).toBe(true);
    expect(program.commands.find(c => c.name() === "record")?.commands.find(c => c.name() === "gate-run")?.options.some(o => o.long === "--dispatch")).toBe(true);
  });
  it("forwards original dispatch anchors into both production submission qualifiers", async () => {
    const execution = await beginExecution(loadStoreReadOnly(root), { role: "implementer", runtime: "script", identityKind: "script", permitIds: [] });
    put("gate.json", { gate: "BUILD", gate_def: "POLICY.GATE.BUILD@0.1.0", verdict: "passed", metric_dialect: "build:exit_code", subject_id: null, denominator_refs: [], counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 }, trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } }, duration_ms: { self: 1, external: 0 } });
    const before = tree();
    for (const args of [
      ["execution", "handoff", execution.execution_id, "--task", "PAGE.TEST", "--changed", "src/page.ts", "--summary", "original submission", "--dispatch", "not-a-dispatch"],
      ["record", "gate-run", "--from", file("gate.json"), "--execution-id", execution.execution_id, "--dispatch", "not-a-dispatch"],
    ]) {
      const result = await cli(args);
      failed(result, `${args[0]} ${args[1]}`);
      expect(result.value.errors[0]?.code).toBe("SCHEMA_INVALID");
      expect(result.value.errors[0]?.hint).toContain("DISP");
    }
    expect(tree()).toEqual(before);
  });
  it("binding dry-run and statement use production subjects without writing", async () => {
    put("rows.json", [binding]); const before = tree();
    const preview = await cli(["bindings", "sync", "--from", "rows.json", "--dry-run"]); expect(preview.code).toBe(0); expect(preview.value.result.mode).toBe("dry-run"); expect(preview.value.result.applied_seq).toBeNull();
    const statement = await cli(["bindings", "statement", "--from", "rows.json"]); expect(statement.code).toBe(0); expect(statement.value.result.ref).toBe("keybinding:KEYBINDING.PAGE.TEST"); expect(tree()).toEqual(before);
  });
  it("signed single-row declaration consumes the exact production signature", async () => {
    put("row.json", binding); const subject = await cli(["bindings", "statement", "--from", "row.json"]); expect(subject.code).toBe(0);
    const signoff = await signed(subject.value.result as { ref: string; sha256: string });
    const result = await cli(["bindings", "declare", "--from", "row.json", "--signoff", signoff]); expect(result.code, JSON.stringify(result.value)).toBe(0); expect(result.value.result.mode).toBe("apply"); expect(fs.existsSync(file(`.pomaster/trust/consumed/${signoff}.json`))).toBe(true);
  });
  it("rejects future-dated consumption as a recovery credential without rewriting it", async () => {
    const subject = statementSubject("bounded project recovery fixture");
    const signoff = await signed(subject);
    const owner = "autopilot review decide:fixture";
    expect(verifySignoff(root, signoff, { kind: "accept", ...subject }, { consume: true, consumedBy: owner, env: { listAgentKeys: () => [] } }).ok).toBe(true);
    const consumedPath = `.pomaster/trust/consumed/${signoff}.json`;
    const consumed = JSON.parse(fs.readFileSync(file(consumedPath), "utf8"));
    consumed.consumed_at = new Date(Date.now() + 60_000).toISOString();
    put(consumedPath, consumed);
    const before = tree();
    const recovered = verifySignoff(root, signoff, { kind: "accept", ...subject }, { consume: false, requireConsumed: true, requireConsumedBy: owner, env: { listAgentKeys: () => [] } });
    expect(recovered.ok).toBe(false);
    if (!recovered.ok) expect(recovered.error.code).toBe("TRUST_SIGNOFF_MISMATCH");
    expect(tree()).toEqual(before);
  });
  it.each(["../outside.json", "C:/outside.json", "bad.json", "large.json"])("rejects unsafe/malformed binding JSON %s without writes", async path => {
    put("bad.json", "{"); put("large.json", " ".repeat(1024 * 1024 + 1)); const before = tree(); failed(await cli(["bindings", "sync", "--from", path, "--dry-run"]), "bindings sync"); expect(tree()).toEqual(before);
  });
  it("malformed rows and repeated singleton options are non-green even in dry-run", async () => {
    put("row.json", { ...binding, binding_status: "invented" }); const before = tree(); failed(await cli(["bindings", "sync", "--from", "row.json", "--dry-run"]), "bindings sync"); failed(await cli(["bindings", "statement", "--from", "row.json", "--from", "row.json"]), "bindings statement"); expect(tree()).toEqual(before);
  });
  it("fact add admits an actual candidate and returns a narrow permit plus verification guidance", async () => {
    put("payload.json", { surface: "V1" }); const result = await cli(["fact", "add", "--kind", "page_surface", "--id", "PAGE.ZZYXQ", "--title", "候选", "--from", "payload.json", "--reason", "独立新增页面语义", "--by", "human:owner"]);
    expect(result.code, JSON.stringify(result.value)).toBe(0); expect(result.value.result.status).toBe("admitted"); expect(result.value.result.permit?.scope.subjectIds).toEqual(["PAGE.ZZYXQ"]); expect(result.value.result.next_action).toContain("VERIFY"); expect((await loadTruthIndex(loadStoreReadOnly(root))).objects.find(o => o.id === "PAGE.ZZYXQ")?.axes.lifecycle).toBe("PROPOSED");
  });
  it("fact missing payload, bad actor and noncandidate envelope stay non-green/read-only", async () => {
    const args = ["fact", "add", "--kind", "page_surface", "--id", "PAGE.ZZYXQ", "--title", "候选", "--reason", "独立新增页面语义", "--by", "human:owner"];
    const missing = await cli(args); failed(missing, "fact add"); expect(missing.value.errors[0]?.hint).toContain("--from");
    put("candidate.json", { ...envelope("PAGE.ZZYXQ"), axes: { ...envelope().axes, lifecycle: "CURRENT" } }); const before = tree(); failed(await cli([...args, "--from", "candidate.json"]), "fact add"); failed(await cli([...args.slice(0, -1), "owner"]), "fact add"); expect(tree()).toEqual(before);
  });
  it("maintain forwards bounded break-glass spec errors rather than dropping flags", async () => {
    put("ops.json", { ops: [] }); put("spec.json", "{"); const before = tree(); failed(await cli(["maintain", "TASK.TEST", "--ops", "ops.json", "--permit-ref", "P-1", "--break-glass-signoff", "SO-1", "--break-glass-spec", "spec.json"]), "maintain"); expect(tree()).toEqual(before);
  });
  it("truth body statement/advance call actual production validation, not fabricated gate PASS", async () => {
    const before = tree(); failed(await cli(["truth-body", "statement", "--id", "PAGE.TEST"]), "truth-body statement"); failed(await cli(["truth-body", "advance", "--id", "PAGE.TEST", "--by", "human:owner", "--reason", "真实正文审阅", "--evidence", "GRN-0001", "--evidence-sha256", "a".repeat(64)]), "truth-body advance"); expect(tree()).toEqual(before);
  });
});

describe("consumer diagnostics remain diagnostic", () => {
  it("alerts always succeed, disclose valid faults and cap human output without clearing telemetry", async () => {
    const event = { type: "GUARD_FAULT_OBSERVED", observed_at: "2026-01-01T00:00:00Z", target: "src/page", reason: "x".repeat(20000), protected: false, disposition: "fail_open" }; put(".pomaster/state/guard-faults.jsonl", `${JSON.stringify(event)}\n`); const before = tree();
    const result = await runAlerts(root); expect(result.ok).toBe(true); expect(result.warnings.some(w => w.code === "GUARD_FAULT_OBSERVED")).toBe(true); expect(result.human.join("\n").length).toBeLessThanOrEqual(ALERTS_OUTPUT_HARD_CAP); expect(tree()).toEqual(before);
  });
  it("doctor reports malformed telemetry as DEFECT and alerts remain nonblocking", async () => {
    put(".pomaster/state/guard-faults.jsonl", "{\n"); const before = tree(); const doctor = await runDoctor(root); expect(doctor.result.probes.find(p => p.probe === "guard_fault_telemetry")?.status).toBe("DEFECT"); expect(doctor.ok).toBe(false); const alerts = await runAlerts(root); expect(alerts.ok).toBe(true); expect(alerts.warnings.some(w => w.code === "GUARD_FAULT_LOG_INVALID")).toBe(true); expect(tree()).toEqual(before);
  });
  it("closeout retains non-green malformed telemetry and discloses actual signed emergency writes", async () => {
    await applyTransaction(loadStoreReadOnly(root), { ops: [{ op: "upsert_object", envelope: {
      ...envelope("TASK.TEST"), kind: "task_object", axisProfile: "task_default",
      payload: { intent: "Scoped diagnostics", acceptance: [{ criterion: "Independent verification", claim: "CLM-0001" }], affected_objects: ["PAGE.TEST"], class_scan_result: { scope: "src/page", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" } },
    } }] });
    const execution = await beginExecution(loadStoreReadOnly(root), { role: "implementer", runtime: "script", identityKind: "script", permitIds: [] });
    const index = await loadTruthIndex(loadStoreReadOnly(root));
    const ops = [{ op: "upsert_object" as const, envelope: { ...envelope(), titleZh: "Reviewed emergency correction" } }];
    const spec = { ops, subjectIds: ["PAGE.TEST"], issuedAtSeq: index.generation.seq, expiresAtSeq: index.generation.seq + 3, nonce: "public-emergency" };
    put("ops.json", { ops }); put("emergency.json", spec);
    const signoff = await signed(breakGlassSubject(spec));
    const applied = await cli(["maintain", "PAGE.TEST", "--ops", file("ops.json"), "--execution-id", execution.execution_id, "--break-glass-signoff", signoff, "--break-glass-spec", "emergency.json"]);
    expect(applied.code, JSON.stringify(applied.value)).toBe(0);
    put(".pomaster/state/guard-faults.jsonl", "{\n");
    const before = tree();
    const assessed = await assessCloseoutMachine(root, { taskId: "TASK.TEST" });
    expect(assessed.ok).toBe(false);
    expect(assessed.errors.some(error => error.code === "GUARD_FAULT_LOG_INVALID")).toBe(true);
    expect(assessed.result.break_glass_disclosures).toHaveLength(1);
    expect(assessed.warnings.some(warning => warning.code === "BREAK_GLASS_APPLIED")).toBe(true);
    expect(tree()).toEqual(before);
    const journalPath = ".pomaster/state/journal.jsonl";
    const events = fs.readFileSync(file(journalPath), "utf8").trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
    const disclosure = events.find(event => event.type === "BREAK_GLASS_APPLIED")!;
    for (const corruption of [{ signoff_ref: null }, { subject_ids: null }]) {
      put(journalPath, `${events.map(event => JSON.stringify(event === disclosure ? { ...event, ...corruption } : event)).join("\n")}\n`);
      const corrupted = tree();
      const invalid = await assessCloseoutMachine(root, { taskId: "TASK.TEST" });
      expect(invalid.ok).toBe(false);
      expect(invalid.errors.some(error => error.code === "BREAK_GLASS_DISCLOSURE_INVALID")).toBe(true);
      expect(tree()).toEqual(corrupted);
    }
  });
  it("closeout blocks actual related body edits but historical guard faults are not a permanent judge", async () => {
    const task = { ...envelope("TASK.TEST"), kind: "task_object" as const, axisProfile: "task_default", payload: { intent: "真实任务", acceptance: [{ criterion: "独立验证", claim: "CLM-0001" }], class_scan_result: { scope: "src/page", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" } } };
    await applyTransaction(loadStoreReadOnly(root), { ops: [{ op: "upsert_object", envelope: task }] });
    put(".pomaster/state/guard-faults.jsonl", `${JSON.stringify({ type: "GUARD_FAULT_OBSERVED", observed_at: "2026-01-01T00:00:00Z", target: "unrelated", reason: "retained history", protected: true, disposition: "fail_closed" })}\n`);
    const ordinary = await assessCloseoutMachine(root, { taskId: "TASK.TEST" }); expect(ordinary.errors.some(e => e.code === "GUARD_FAULT_OBSERVED")).toBe(false); expect(ordinary.warnings.some(w => w.code === "GUARD_FAULT_OBSERVED")).toBe(true);
    const row = (await loadTruthIndex(loadStoreReadOnly(root))).objects.find(o => o.id === "TASK.TEST")!; const path = `.pomaster/${row.bodyRef}`; const body = JSON.parse(fs.readFileSync(file(path), "utf8")); body.title_zh = "外部修改"; put(path, body); const before = tree();
    const changed = await assessCloseoutMachine(root, { taskId: "TASK.TEST" }); expect(changed.errors.some(e => e.code === "TRUTH_BODY_EDIT_UNCOVERED")).toBe(true); expect(changed.result.truth_body_edits?.blockedIds).toContain("TASK.TEST"); expect(tree()).toEqual(before);
  });
});
