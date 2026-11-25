import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as kernel from "@pomaster/kernel";
import { runFactAdd } from "../src/fact.js";
import { runBindingsDeclare, runBindingsSync, bindingDeclarationSubject } from "../src/bindings.js";
import { runMaintain, runTruthBodyAdvance, breakGlassSubject } from "../src/maintain.js";
import { runTrustEnroll, runTrustRequest } from "../src/trust.js";
import { makeKey, signSshsig } from "./fixtures/trust/sshsig-signer.js";

vi.mock("node:fs", async (load) => {
  const actual = await load<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync), appendFileSync: vi.fn(actual.appendFileSync), writeFileSync: vi.fn(actual.writeFileSync), rmSync: vi.fn(actual.rmSync), ftruncateSync: vi.fn(actual.ftruncateSync), openSync: vi.fn(actual.openSync) };
});
const roots: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const actor: kernel.Actor = { actorType: "human", actor: "owner", selfAttested: true };
function envelope(id = "PAGE.ZZYXQ"): kernel.ObjectEnvelopeInput {
  return { id: id as kernel.GovernedId, kind: "page_surface", axisProfile: "page_default", titleZh: "候选页面", axes: { lifecycle: "PROPOSED", confidence: "UNRESOLVED", evidence: "PLANNED", change: "STABLE" }, authority: { owner: "BOOTSTRAP_OWNER", delegates: [] }, origin: "natural", payload: { surface: "V1" } };
}
async function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), "atomic-admissions-")); roots.push(root);
  const store = await kernel.createStore(root);
  fs.writeFileSync(join(root, ".pomaster/state/authority.json"), JSON.stringify({ version: 1, authorities: { BOOTSTRAP_OWNER: {} } }));
  await kernel.applyTransaction(store, { ops: [{ op: "upsert_object", envelope: envelope("PAGE.TEST") }] });
  return { root, store };
}
function snapshot(root: string) {
  return ["truth-index.json", "permits.json", "journal.jsonl"].map(name => fs.readFileSync(join(root, ".pomaster/state", name), "utf8"));
}
function signer(root: string) {
  const key = makeKey("ssh-ed25519"); fs.writeFileSync(join(root, "owner.pub"), key.line);
  expect(runTrustEnroll(root, { key: "owner.pub", principal: "owner" }, { listAgentKeys: () => [] }).ok).toBe(true);
  return (subject: { ref: string; sha256: string }, kind: "accept" | "kickoff" = "accept", ttlMinutes = 3) => {
    const result = runTrustRequest(root, { kind, ...subject, ttlMinutes }, { listAgentKeys: () => [] });
    expect(result.ok).toBe(true); const id = result.result!.id as string;
    const path = join(root, ".pomaster/trust/requests", `${id}.json`);
    fs.writeFileSync(`${path}.sig`, signSshsig(key, fs.readFileSync(path)));
    return id;
  };
}
function binding(): kernel.KeybindingRow {
  return { id: "KEYBINDING.PAGE.TEST", binding_class: "page_to_dir", canonical_id: "PAGE.TEST", physical_path: "src/page", binding_status: "confirmed", match_rule: "manual_confirmed", probe: { method: "review", last_run_seq: 1, result: "not_probed" } };
}

describe("atomic governed admissions", () => {
  it("admits typed candidate, actual proof and one-id permit at the same commit sequence", async () => {
    const { root } = await fixture();
    const result = await runFactAdd(root, { envelope: envelope(), actor, need: "zzyxqunrelatedunicorn" });
    expect(result.status).toBe("admitted");
    const journal = JSON.parse(`[${fs.readFileSync(join(root, ".pomaster/state/journal.jsonl"), "utf8").trim().split("\n").join(",")}]`);
    const permit = journal.findLast((event: { type: string }) => event.type === "PERMIT_ISSUED");
    const proof = journal.findLast((event: { type: string }) => event.type === "NEW_ENTITY_CHECKED");
    const tx = journal.findLast((event: { type: string }) => event.type === "TX_APPLIED");
    expect(permit.seq).toBe(tx.seq); expect(proof.seq).toBe(tx.seq); expect(proof.report.result.verdict).toBe("passed");
    const record = JSON.parse(fs.readFileSync(join(root, ".pomaster/state/permits.json"), "utf8")).permits.at(-1);
    expect(record.scope.subject_ids).toEqual(["PAGE.ZZYXQ"]); expect(record.expires_at_seq - record.issued_at_seq).toBeLessThanOrEqual(3);
  });
  it("rejects malformed required payload, silent promotion and unowned scope without artifacts", async () => {
    const { root, store } = await fixture(); const before = snapshot(root);
    await expect(runFactAdd(root, { envelope: { ...envelope(), payload: {} }, actor, need: "zzyxqunrelatedunicorn" })).rejects.toThrow();
    await expect(runFactAdd(root, { envelope: { ...envelope(), axes: { ...envelope().axes, lifecycle: "CURRENT" } }, actor, need: "zzyxqunrelatedunicorn" })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
    await kernel.beginExecution(store, { role: "implementer", runtime: "script", identityKind: "script", permitIds: [] });
    const active = snapshot(root);
    await expect(runFactAdd(root, { envelope: envelope(), actor, need: "zzyxqunrelatedunicorn" })).rejects.toThrow();
    expect(snapshot(root)).toEqual(active);
  });
  it.each([
    ["capability", "CAPABILITY.NEW", { canonical_realization: { component: "Widget" }, category: "grid" }, "category"],
    ["component", "COMPONENT.NEW", { component_name: "Widget", implements_capability: "CAPABILITY.WIDGET", import_path: "src/widget" }, "component_name"],
    ["contract_operation", "API_REQ.NEW", { method: "GET", path: "/new", operation_id: "new", classification: "QUERY", request_need: { fields: [] }, response_need: { fields: [] } }, "request_need"],
    ["error_term", "ERR.NEW", { error_class: "INVALID", user_message_zh: "错误" }, "error_class"],
    ["field_definition", "FIELD.NEW", { semantic_type: "string" }, "semantic_type"],
    ["page_surface", "PAGE.NEW", { surface: "V1" }, "surface"],
    ["knowledge_entry", "KNOWLEDGE.NEW", { failure_class: "INVALID", checks: ["check"] }, "checks"],
    ["business_rule", "POLICY.NEW", { statement_structured: { when: { state: "invalid" }, then: { reject: true } }, enforcement_point: "validator" }, "enforcement_point"],
    ["change_object", "CHANGE.NEW", { motivation: "repair", affected_objects: ["PAGE.TEST"], reopen_count: 0, class_scan_result: { scope: "src/*", hits: 1, fixed_count: 0, regression_case_ref: "TEST.REGRESSION" } }, "motivation"],
    ["task_object", "TASK.NEW", { intent: "repair", acceptance: [{ criterion: "valid", claim: "CLM-0001" }], class_scan_result: { scope: "src/*", hits: 1, fixed_count: 0, regression_case_ref: "TEST.REGRESSION" } }, "intent"],
  ] as const)("validates official %s required payload before any permit write", async (kind, id, payload, required) => {
    const { store, root } = await fixture();
    const candidate = { ...envelope(id), kind, payload } as kernel.ObjectEnvelopeInput;
    const before = snapshot(root);
    expect(() => kernel.validateFactCandidate(store, candidate)).not.toThrow();
    const invalid: Record<string, unknown> = { ...payload }; delete invalid[required];
    expect(() => kernel.validateFactCandidate(store, { ...candidate, payload: invalid })).toThrow();
    expect(snapshot(root)).toEqual(before);
  });
  it("rejects untyped optional budgets and malformed nested task acceptance", async () => {
    const { root, store } = await fixture(); const before = snapshot(root);
    const capability = { ...envelope("CAPABILITY.NEW"), kind: "capability" as const, payload: { canonical_realization: { component: "Widget" }, category: "grid", performance_budget: { lcp_ms: "fast" } } };
    expect(() => kernel.validateFactCandidate(store, capability)).toThrow();
    expect(snapshot(root)).toEqual(before);
  });
  it.each(["direct", "parent"])("admits only explicitly owned %s candidate scope, not Actor labels", async (scope) => {
    const { root, store } = await fixture();
    if (scope === "parent") await kernel.applyTransaction(store, { ops: [{ op: "upsert_object", envelope: { ...envelope("PAGE.TEST"), payload: { surface: "V1", candidate_ids: ["PAGE.ZZYXQ"] } } }] });
    const permit = await kernel.issuePermit(store, { subjectIds: [(scope === "direct" ? "PAGE.ZZYXQ" : "PAGE.TEST") as kernel.GovernedId], requestedBy: actor, ttlBeats: 3 });
    const execution = await kernel.beginExecution(store, { role: "implementer", runtime: "script", identityKind: "script", permitIds: [permit.permitRef] });
    const input = { envelope: envelope(), actor: { ...actor, actor: "not-authority" }, need: "zzyxqunrelatedunicorn", executionId: execution.execution_id, permitRef: permit.permitRef, ...(scope === "parent" ? { parentRef: "PAGE.TEST" as kernel.GovernedId } : {}) };
    expect((await runFactAdd(root, input)).status).toBe("admitted");
    const before = snapshot(root);
    await expect(runFactAdd(root, { ...input, envelope: envelope("PAGE.OUTSIDE") })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
  });
  it("real duplicate, configurable match, malformed ID and unavailable catalog produce no admission artifacts", async () => {
    const { root } = await fixture(); const before = snapshot(root);
    expect((await runFactAdd(root, { envelope: envelope("PAGE.TEST"), actor })).status).toBe("reuse");
    expect((await runFactAdd(root, { envelope: envelope(), actor, need: "PAGE.TEST" })).status).toBe("reuse");
    expect((await runFactAdd(root, { envelope: envelope("malformed"), actor, need: "zzyxqunrelatedunicorn" })).status).toBe("denied");
    await expect(runFactAdd(root, { envelope: envelope(), actor, need: "zzyxqunrelatedunicorn", catalogRoot: join(root, "missing-catalog") })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
  });
  it.each(["wrong-kind", "wrong-content", "wrong-nonce", "expired", "self-label"])("rejects %s manual proof without consuming authority", async (mode) => {
    const { root } = await fixture(); fs.mkdirSync(join(root, "src/page"), { recursive: true });
    const row = binding(), sign = signer(root), subject = bindingDeclarationSubject([row]);
    let id = sign(mode === "wrong-content" ? { ...subject, sha256: "a".repeat(64) } : subject, mode === "wrong-kind" ? "kickoff" : "accept");
    if (mode === "wrong-nonce") id = "SO-0123456789ab";
    if (mode === "expired") { vi.useFakeTimers(); vi.setSystemTime(Date.now() + 600_000); }
    const before = snapshot(root);
    await expect(runBindingsDeclare(root, row, { signoffRefs: mode === "self-label" ? {} : { [row.id]: id } })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before); expect(fs.existsSync(join(root, ".pomaster/trust/consumed", `${id}.json`))).toBe(false);
  });
  it("consumes a fresh real signature exactly once, replays, and refreshes stale probes without resigning", async () => {
    const { root } = await fixture(); fs.mkdirSync(join(root, "src/page"), { recursive: true });
    const row = binding(), id = signer(root)(bindingDeclarationSubject([row]));
    await runBindingsDeclare(root, row, { signoffRefs: { [row.id]: id } });
    const consumed = fs.readFileSync(join(root, ".pomaster/trust/consumed", `${id}.json`), "utf8"), before = snapshot(root);
    await runBindingsDeclare(root, row, { signoffRefs: { [row.id]: id } });
    expect(snapshot(root)).toEqual(before); expect(fs.readFileSync(join(root, ".pomaster/trust/consumed", `${id}.json`), "utf8")).toBe(consumed);
    fs.rmSync(join(root, "src/page"), { recursive: true }); expect((await runBindingsSync(root)).rows[0]?.binding_status).toBe("stale");
    fs.mkdirSync(join(root, "src/page"), { recursive: true }); expect((await runBindingsSync(root)).rows[0]?.binding_status).toBe("confirmed");
    await expect(runBindingsDeclare(root, { ...row, physical_path: "src/other" }, { signoffRefs: { [row.id]: id } })).rejects.toThrow();
  });
  it("rolls back nonce and authority when a staged rename fails", async () => {
    const { root } = await fixture(); fs.mkdirSync(join(root, "src/page"), { recursive: true });
    const row = binding(), id = signer(root)(bindingDeclarationSubject([row])), before = snapshot(root);
    const rename = fs.renameSync; vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).endsWith(`${row.id}.json`)) throw Object.assign(new Error("injected write failure"), { code: "EIO" });
      return rename(from, to);
    });
    await expect(runBindingsDeclare(root, row, { signoffRefs: { [row.id]: id } })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before); expect(fs.existsSync(join(root, ".pomaster/trust/consumed", `${id}.json`))).toBe(false);
  });
  it.each([0, 53, 400])("rolls back a journal append failure after %i bytes without removing prior foreign events", async (bytes) => {
    const { root } = await fixture(); fs.mkdirSync(join(root, "src/page"), { recursive: true });
    const row = binding(), id = signer(root)(bindingDeclarationSubject([row]));
    const journalPath = join(root, ".pomaster/state/journal.jsonl");
    fs.appendFileSync(journalPath, `${JSON.stringify({ type: "FOREIGN_EVENT", seq: 0 })}\n`);
    const before = snapshot(root), append = fs.appendFileSync;
    vi.spyOn(fs, "appendFileSync").mockImplementation((path, data, options) => {
      if (String(path).replaceAll("\\", "/") === journalPath.replaceAll("\\", "/")) {
        append(path, Buffer.from(String(data)).subarray(0, bytes), options);
        throw Object.assign(new Error("partial journal failure"), { code: "EIO" });
      }
      return append(path, data, options);
    });
    await expect(runBindingsDeclare(root, row, { signoffRefs: { [row.id]: id } })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
    expect(fs.existsSync(join(root, ".pomaster/trust/consumed", `${id}.json`))).toBe(false);
    expect(fs.existsSync(join(root, ".pomaster/state/pending-admission.json"))).toBe(false);
  });
  it("preserves a concurrently consumed nonce and writes no binding or authority", async () => {
    const { root } = await fixture(); fs.mkdirSync(join(root, "src/page"), { recursive: true });
    const row = binding(), id = signer(root)(bindingDeclarationSubject([row])), before = snapshot(root);
    const noncePath = join(root, ".pomaster/trust/consumed", `${id}.json`), open = fs.openSync;
    fs.mkdirSync(join(root, ".pomaster/trust/consumed"), { recursive: true });
    vi.spyOn(fs, "openSync").mockImplementation((path, flags, mode) => {
      if (flags === "wx" && String(path).replaceAll("\\", "/") === noncePath.replaceAll("\\", "/")) fs.writeFileSync(path, "competing-consumer", { flag: "wx" });
      return open(path, flags, mode);
    });
    await expect(runBindingsDeclare(root, row, { signoffRefs: { [row.id]: id } })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before); expect(fs.readFileSync(noncePath, "utf8")).toBe("competing-consumer");
    expect(fs.existsSync(join(root, ".pomaster/truth/keybindings", `${row.id}.json`))).toBe(false);
  });
  it("recovers an interrupted consumed transaction only with identical intent and signer assurance", async () => {
    const { root } = await fixture(); fs.mkdirSync(join(root, "src/page"), { recursive: true });
    const row = binding(), id = signer(root)(bindingDeclarationSubject([row]));
    const pendingPath = join(root, ".pomaster/state/pending-admission.json"), remove = fs.rmSync;
    vi.spyOn(fs, "rmSync").mockImplementation((path, options) => {
      if (String(path).replaceAll("\\", "/") === pendingPath.replaceAll("\\", "/")) throw Object.assign(new Error("interrupted cleanup"), { code: "EIO" });
      return remove(path, options);
    });
    vi.spyOn(fs, "ftruncateSync").mockImplementation(() => { throw new Error("process interrupted before rollback"); });
    await expect(runBindingsDeclare(root, row, { signoffRefs: { [row.id]: id } })).rejects.toThrow();
    vi.restoreAllMocks();
    const pending = JSON.parse(fs.readFileSync(pendingPath, "utf8")); pending.pid = 2147483647;
    fs.writeFileSync(pendingPath, JSON.stringify(pending));
    const consumedPath = join(root, ".pomaster/trust/consumed", `${id}.json`), consumed = fs.readFileSync(consumedPath, "utf8"), before = snapshot(root);
    await expect(kernel.applyTransaction(kernel.loadStoreReadOnly(root), { ...pending.transaction, note: "different intent" })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
    await kernel.applyTransaction(kernel.loadStoreReadOnly(root), pending.transaction);
    expect(fs.existsSync(pendingPath)).toBe(false); expect(fs.readFileSync(consumedPath, "utf8")).toBe(consumed);
    expect(JSON.parse(consumed).assurance).not.toBe("self_attested");
    const journal = fs.readFileSync(join(root, ".pomaster/state/journal.jsonl"), "utf8");
    expect(journal.match(/KEYBINDING_UPSERTED/g)).toHaveLength(1);
    expect((await kernel.applyTransaction(kernel.loadStoreReadOnly(root), pending.transaction)).shortCircuited).toBe(true);
  });
  it("replays stale staged permits without erasing a concurrent ordinary issue", async () => {
    const { root, store } = await fixture();
    const write = fs.writeFileSync;
    let foreign: Promise<kernel.Permit> | undefined;
    vi.spyOn(fs, "writeFileSync").mockImplementation((path, data, options) => {
      if (String(path).endsWith("pending-admission.json") && foreign === undefined) foreign = kernel.issuePermit(store, { subjectIds: ["PAGE.TEST" as kernel.GovernedId], requestedBy: { ...actor, actor: "concurrent-issuer" } });
      return write(path, data, options);
    });
    expect((await runFactAdd(root, { envelope: envelope(), actor, need: "zzyxqunrelatedunicorn" })).status).toBe("admitted");
    expect(foreign).toBeDefined();
    const permit = await foreign!;
    const records = JSON.parse(fs.readFileSync(join(root, ".pomaster/state/permits.json"), "utf8")).permits as { permit_ref: string }[];
    expect(records.map(record => record.permit_ref)).toContain(permit.permitRef);
    expect(records).toHaveLength(2);
    const events = fs.readFileSync(join(root, ".pomaster/state/journal.jsonl"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    expect(events.filter(event => event.type === "PERMIT_ISSUED" && event.permit_ref === permit.permitRef)).toHaveLength(1);
  });
  it("does not restore a foreign binding overwritten between staged swaps", async () => {
    const { root } = await fixture(); fs.mkdirSync(join(root, "src/page"), { recursive: true });
    const row = binding(), id = signer(root)(bindingDeclarationSubject([row]));
    const bindingPath = join(root, ".pomaster/truth/keybindings", `${row.id}.json`), before = snapshot(root);
    const rename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).endsWith("truth-index.json")) {
        fs.writeFileSync(bindingPath, "foreign-concurrent-state");
        throw Object.assign(new Error("later swap failure"), { code: "EIO" });
      }
      return rename(from, to);
    });
    await expect(runBindingsDeclare(root, row, { signoffRefs: { [row.id]: id } })).rejects.toThrow();
    expect(fs.readFileSync(bindingPath, "utf8")).toBe("foreign-concurrent-state");
    expect(snapshot(root)).toEqual(before);
    expect(fs.existsSync(join(root, ".pomaster/state/pending-admission.json"))).toBe(true);
  });
  it("requires a new declaration signature for a requested status change, not probe refresh", async () => {
    const { root } = await fixture(); fs.mkdirSync(join(root, "src/page"), { recursive: true });
    const row = binding(), sign = signer(root), id = sign(bindingDeclarationSubject([row]));
    await runBindingsDeclare(root, row, { signoffRefs: { [row.id]: id } });
    const before = snapshot(root);
    const changed = { ...row, binding_status: "derived" as const };
    await expect(runBindingsDeclare(root, changed)).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
    const fresh = sign(bindingDeclarationSubject([changed]));
    expect((await runBindingsDeclare(root, changed, { signoffRefs: { [row.id]: fresh } })).rows[0]?.binding_status).toBe("derived");
  });
  it("cannot expand an active parent candidate frame by sanctioned or unswept edits", async () => {
    const { root, store } = await fixture();
    const parent = { ...envelope("PAGE.TEST"), payload: { surface: "V1", candidate_ids: [] } };
    await kernel.applyTransaction(store, { ops: [{ op: "upsert_object", envelope: parent }] });
    const permit = await kernel.issuePermit(store, { subjectIds: [parent.id], requestedBy: actor });
    const execution = await kernel.beginExecution(store, { role: "implementer", runtime: "script", identityKind: "script", permitIds: [permit.permitRef] });
    const scope = { executionId: execution.execution_id, permitRef: permit.permitRef }, before = snapshot(root);
    await expect(kernel.applyTransaction(store, { ...scope, ops: [{ op: "upsert_object", envelope: { ...parent, payload: { ...parent.payload, candidate_ids: ["PAGE.ZZYXQ"] } } }] })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
    const row = (await kernel.loadTruthIndex(store)).objects.find(row => row.id === parent.id)!;
    const bodyPath = join(root, ".pomaster", row.bodyRef), body = JSON.parse(fs.readFileSync(bodyPath, "utf8"));
    body.payload.candidate_ids = ["PAGE.ZZYXQ"]; fs.writeFileSync(bodyPath, JSON.stringify(body));
    await expect(runFactAdd(root, { ...scope, envelope: envelope(), actor, need: "zzyxqunrelatedunicorn", parentRef: parent.id })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
  });
  it("includes new affected subjects in implicit semantic rehash scope", async () => {
    const { root, store } = await fixture();
    await kernel.applyTransaction(store, { ops: [{ op: "upsert_object", envelope: envelope("PAGE.OTHER") }] });
    const row = (await kernel.loadTruthIndex(store)).objects.find(row => row.id === "PAGE.TEST")!;
    const bodyPath = join(root, ".pomaster", row.bodyRef), body = JSON.parse(fs.readFileSync(bodyPath, "utf8"));
    body.payload.affected_objects = ["PAGE.OTHER"]; fs.writeFileSync(bodyPath, JSON.stringify(body));
    const permit = await kernel.issuePermit(store, { subjectIds: [row.id], requestedBy: actor });
    const execution = await kernel.beginExecution(store, { role: "implementer", runtime: "script", identityKind: "script", permitIds: [permit.permitRef] });
    const before = snapshot(root);
    expect(kernel.transactionMutationSubjects(store, { ops: [] })).toEqual(["PAGE.OTHER", "PAGE.TEST"]);
    await expect(kernel.applyTransaction(store, { executionId: execution.execution_id, ops: [] })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
  });
  it("a valid emergency cannot borrow another execution's permit identity", async () => {
    const { root, store } = await fixture();
    const ownPermit = await kernel.issuePermit(store, { subjectIds: ["PAGE.TEST" as kernel.GovernedId], requestedBy: actor });
    const otherPermit = await kernel.issuePermit(store, { subjectIds: ["PAGE.TEST" as kernel.GovernedId], requestedBy: actor });
    const own = await kernel.beginExecution(store, { role: "implementer", runtime: "script", identityKind: "script", permitIds: [ownPermit.permitRef] });
    await kernel.beginExecution(store, { role: "implementer", runtime: "script", identityKind: "script", permitIds: [otherPermit.permitRef] });
    const seq = (await kernel.loadTruthIndex(store)).generation.seq;
    const ops: kernel.TransactionOp[] = [{ op: "upsert_object", envelope: { ...envelope("PAGE.TEST"), titleZh: "紧急修订" } }];
    const spec = { ops, subjectIds: ["PAGE.TEST"], issuedAtSeq: seq, expiresAtSeq: seq + 3, nonce: "emergency-owned-scope" };
    const id = signer(root)(breakGlassSubject(spec)), before = snapshot(root);
    await expect(kernel.applyTransaction(store, { ops, executionId: own.execution_id, permitRef: otherPermit.permitRef, breakGlass: { ...spec, signoffRef: id } })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
    expect(fs.existsSync(join(root, ".pomaster/trust/consumed", `${id}.json`))).toBe(false);
  });
  it("fresh signed truth-body ADVANCE closes the actual observation atomically and replays", async () => {
    const { root, store } = await fixture();
    const index = await kernel.loadTruthIndex(store), bodyPath = join(root, ".pomaster", index.objects[0]!.bodyRef);
    const body = JSON.parse(fs.readFileSync(bodyPath, "utf8")); body.title_zh = "已复验页面";
    fs.writeFileSync(bodyPath, JSON.stringify(body));
    await kernel.applyTransaction(store, { ops: [] });
    const id = signer(root)(kernel.truthBodyAdvanceSubject(store, "PAGE.TEST"));
    const input = { id: "PAGE.TEST", actor: "human:owner", reason: "复验页面正文合法更改", evidenceRefs: ["test:atomic-admissions"], evidenceSha256: "a".repeat(64), signoffRef: id };
    await runTruthBodyAdvance(root, input);
    expect(kernel.assessTruthBodyEdits(store, ["PAGE.TEST"]).blockedIds).toEqual([]);
    const before = snapshot(root), noncePath = join(root, ".pomaster/trust/consumed", `${id}.json`), consumed = fs.readFileSync(noncePath, "utf8");
    await runTruthBodyAdvance(root, input);
    expect(snapshot(root)).toEqual(before); expect(fs.readFileSync(noncePath, "utf8")).toBe(consumed);
    await expect(runTruthBodyAdvance(root, { ...input, reason: "different intent" })).rejects.toThrow();
    expect(snapshot(root)).toEqual(before);
  });
  it("signed break-glass overrides only permit scope and journals disclosure; immutable origin still rejects", async () => {
    const { root, store } = await fixture();
    await kernel.beginExecution(store, { role: "implementer", runtime: "script", identityKind: "script", permitIds: [] });
    const sign = signer(root), index = await kernel.loadTruthIndex(store);
    const ops: kernel.TransactionOp[] = [{ op: "upsert_object", envelope: { ...envelope("PAGE.TEST"), titleZh: "紧急修订" } }];
    const spec = { ops, subjectIds: ["PAGE.TEST"], issuedAtSeq: index.generation.seq, expiresAtSeq: index.generation.seq + 3, nonce: "emergency-unique" };
    const id = sign(breakGlassSubject(spec)), path = join(root, "ops.json"); fs.writeFileSync(path, JSON.stringify({ ops }));
    const result = await runMaintain(root, { changeOrTask: "PAGE.TEST", opsFile: path, breakGlassSignoff: id, breakGlassSpec: spec });
    expect(result.ok, JSON.stringify(result.errors)).toBe(true); expect(fs.readFileSync(join(root, ".pomaster/state/journal.jsonl"), "utf8")).toContain("BREAK_GLASS_APPLIED");
    const invalidOps: kernel.TransactionOp[] = [{ op: "upsert_object", envelope: { ...envelope("PAGE.TEST"), origin: "ingested" } }];
    const invalid = { ...spec, ops: invalidOps, nonce: "different-emergency" }, invalidId = sign(breakGlassSubject(invalid));
    fs.writeFileSync(path, JSON.stringify({ ops: invalidOps })); const before = snapshot(root);
    expect((await runMaintain(root, { changeOrTask: "PAGE.TEST", opsFile: path, breakGlassSignoff: invalidId, breakGlassSpec: invalid })).ok).toBe(false);
    expect(snapshot(root)).toEqual(before); expect(fs.existsSync(join(root, ".pomaster/trust/consumed", `${invalidId}.json`))).toBe(false);
  });
});
