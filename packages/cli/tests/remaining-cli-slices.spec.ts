import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createStore, applyTransaction, parseGovernedId, issuePermit, beginExecution, registerPersistedSignoffVerifier } from "@pomaster/kernel";
import { runTrustEnroll, runTrustRequest, verifySignoff } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig } from "./fixtures/trust/sshsig-signer.js";
import { runBaselineSet, runBaselineConfirm, baselineGateAssessment } from "../src/baseline.js";
import { runMaintain } from "../src/maintain.js";
import type { KeybindingRow, ObjectEnvelopeInput } from "@pomaster/kernel";
import { runBindingsSync, runBindingsDeclare, confirmedBindingConflicts, bindingDeclarationSubject, prepareBindingDeclaration, cliPersistedSignoffVerifier } from "../src/bindings.js";
import { assessBaselineContent } from "../src/baseline.js";
import { prepareFactAdd, runFactAdd } from "../src/fact.js";
import { guardFaultErrors, readGuardFaults } from "../src/guard-faults.js";
import { breakGlassSubject, verifyBreakGlass } from "../src/maintain.js";

const roots: string[] = [];
function temp(): string { const root = mkdtempSync(join(tmpdir(), "be4-cli-")); roots.push(root); return root; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const row = (overrides: Partial<KeybindingRow> = {}): KeybindingRow => ({ id: "KEYBINDING.TEST.ONE", binding_class: "page_to_dir", canonical_id: "PAGE.TEST", physical_path: "src/page", binding_status: "confirmed", match_rule: "mechanical", probe: { method: "directory-exists", last_run_seq: 0, result: "matched" }, ...overrides });
const envelope = (id: string): ObjectEnvelopeInput => ({ id: (parseGovernedId(id), id as ObjectEnvelopeInput["id"]), kind: "page_surface", axisProfile: "page_default", axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" }, titleZh: "测试页面", authority: { owner: "BUSINESS_OWNER", delegates: [] }, origin: "natural", payload: { surface: "V1" } });
async function seeded(): Promise<string> { const root = temp(); const store = await createStore(root); writeFileSync(join(root, ".pomaster/state/authority.json"), JSON.stringify({ version: 1, authorities: { BUSINESS_OWNER: {} } })); await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: envelope("PAGE.TEST") }] }); return root; }

describe("BE-4 binding API", () => {
  it("commits mechanical declarations through kernel ops and is byte-idempotent", async () => {
    const root = await seeded(); mkdirSync(join(root, "src/page"), { recursive: true });
    await runBindingsDeclare(root, row());
    const before = readFileSync(join(root, ".pomaster/state/truth-index.json"), "utf8"), journal = readFileSync(join(root, ".pomaster/state/journal.jsonl"), "utf8");
    await runBindingsSync(root);
    expect(readFileSync(join(root, ".pomaster/state/truth-index.json"), "utf8")).toBe(before);
    expect(readFileSync(join(root, ".pomaster/state/journal.jsonl"), "utf8")).toBe(journal);
    rmSync(join(root, "src/page"), { recursive: true });
    expect((await runBindingsSync(root)).rows[0]?.binding_status).toBe("stale");
  });
  it("probes missing bindings stale without writing during dry-run", async () => {
    const root = await seeded(); mkdirSync(join(root, ".pomaster/truth/keybindings"), { recursive: true }); writeFileSync(join(root, ".pomaster/truth/keybindings/KEYBINDING.TEST.ONE.json"), JSON.stringify(row()));
    const before = readFileSync(join(root, ".pomaster/state/truth-index.json"), "utf8");
    const result = await runBindingsSync(root, { dryRun: true });
    expect(result.rows[0]?.binding_status).toBe("stale");
    expect(readFileSync(join(root, ".pomaster/state/truth-index.json"), "utf8")).toBe(before);
  });
  it("checks both confirmed directions per class, not derived duplicates", () => {
    expect(confirmedBindingConflicts([row(), row({ id: "KEYBINDING.TEST.TWO", physical_path: "other" })])).toHaveLength(1);
    expect(confirmedBindingConflicts([row(), row({ id: "KEYBINDING.TEST.TWO", canonical_id: "PAGE.OTHER" })])).toHaveLength(1);
    expect(confirmedBindingConflicts([row(), row({ id: "KEYBINDING.TEST.TWO", binding_status: "derived" })])).toEqual([]);
  });
  it("uses the actual consumed SSH adapter and kernel signoffRef for manual declarations", async () => {
    const root = await seeded(), key = makeKey("ssh-ed25519"), pub = join(root, "owner.pub"), priv = join(root, "owner");
    writeFileSync(pub, key.line); writeFileSync(priv, opensshPrivateKeyText("aes256-ctr")); mkdirSync(join(root, "src/page"), { recursive: true });
    const env = { listAgentKeys: () => [] }; expect(runTrustEnroll(root, { key: pub, principal: "owner", private: priv }, env).ok).toBe(true);
    const declaration = row({ match_rule: "manual_confirmed" }), subject = bindingDeclarationSubject([declaration]);
    const request = runTrustRequest(root, { kind: "accept", ...subject, ttlMinutes: 3 }, env), id = request.result!.id as string, path = join(root, ".pomaster/trust/requests", `${id}.json`); writeFileSync(`${path}.sig`, signSshsig(key, readFileSync(path)));
    const plan = prepareBindingDeclaration(root, [declaration], id, env); expect(plan.ok).toBe(true);
    registerPersistedSignoffVerifier(cliPersistedSignoffVerifier);
    expect((await runBindingsDeclare(root, declaration, { signoffRefs: { [declaration.id]: id } })).rows[0]?.binding_status).toBe("confirmed");
    expect(verifySignoff(root, id, { kind: "accept", ...subject }, { consume: true, env }).ok).toBe(false);
    expect((await runBindingsDeclare(root, declaration, { signoffRefs: { [declaration.id]: id } })).rows[0]?.binding_status).toBe("confirmed");
    mkdirSync(join(root, "src/elsewhere"), { recursive: true });
    await expect(runBindingsDeclare(root, { ...declaration, physical_path: "src/elsewhere" }, { signoffRefs: { [declaration.id]: id } })).rejects.toThrow();
  });
  it("binds a declaration statement to exact roots and class", () => {
    expect(bindingDeclarationSubject([row()])).not.toEqual(bindingDeclarationSubject([row({ physical_path: "other" })]));
  });
});
describe("BE-4 baseline content", () => {
  it("does not lexically block writes; safely quotes custom scalar values", async () => {
    const root = await seeded();
    mkdirSync(join(root, ".pomaster/baseline/frontend"), { recursive: true });
    writeFileSync(join(root, ".pomaster/baseline/frontend/stack.yaml"), readFileSync(resolve("packages/cli/seeds/baseline/frontend/stack.yaml")));
    writeFileSync(join(root, ".pomaster/baseline/manifest.yaml"), readFileSync(resolve("packages/cli/seeds/baseline/manifest.yaml")));
    const value = "自定义: stack\nsecond line # retained";
    const result = await runBaselineSet(root, { lane: "frontend", key: "framework", value });
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    const text = readFileSync(join(root, ".pomaster/baseline/frontend/stack.yaml"), "utf8");
    expect(text).toContain(JSON.stringify(value));
    expect(assessBaselineContent(root, "baseline/frontend/stack.yaml", text).some(f => f.code === "BASELINE_STACK_VALUE_UNKNOWN")).toBe(true);
  });
  it("reports incomplete content through confirm and gate without replacing existing blockers", async () => {
    const root = await seeded(); mkdirSync(join(root, ".pomaster/baseline/frontend"), { recursive: true });
    writeFileSync(join(root, ".pomaster/baseline/frontend/stack.yaml"), readFileSync(resolve("packages/cli/seeds/baseline/frontend/stack.yaml")));
    writeFileSync(join(root, ".pomaster/baseline/manifest.yaml"), readFileSync(resolve("packages/cli/seeds/baseline/manifest.yaml")));
    const confirm = await runBaselineConfirm(root);
    expect(confirm.ok).toBe(false); expect(confirm.warnings.some(f => f.code === "BASELINE_STACK_VALUE_INCOMPLETE")).toBe(true);
    const gate = await baselineGateAssessment(root);
    expect(gate.errors[0]?.code).toBe("BASELINE_NOT_CONFIRMED"); expect(gate.warnings.some(f => f.code === "BASELINE_STACK_VALUE_INCOMPLETE")).toBe(true);
  });
  it("checks seed H2 and meaningful section values", () => {
    const root = temp(); mkdirSync(join(root, "src/page"), { recursive: true });
    const target = "baseline/frontend/architecture.md";
    expect(assessBaselineContent(root, target, "## Purpose\n测试产品\n## Layers\n`src/page`\n## Responsibility\n独立模块职责\n## Dependencies\nnone\n")).toEqual([]);
    expect(assessBaselineContent(root, target, "## Purpose\n- 起步值:UNKNOWN\n- 填写指引:写目的\n").some(f => f.code === "BASELINE_SECTION_INCOMPLETE")).toBe(true);
  });
  it("exposes missing Layers directories and supplement stack suggestions", () => {
    const findings = assessBaselineContent(temp(), "baseline/frontend/architecture.md", "## Purpose\n产品\n## Layers\n`src/missing`\n## Responsibility\n模块\n## Dependencies\nnone\n## 补充\n改用 vuex\n");
    expect(findings.map(f => f.code)).toContain("BASELINE_LAYER_DIRECTORY_MISSING");
    expect(findings.map(f => f.code)).toContain("BASELINE_SUPPLEMENT_STACK_SUGGESTION");
  });
  it("flags illegal stack values at consumption, permits explicit absence", () => {
    expect(assessBaselineContent(temp(), "baseline/backend/stack.yaml", "language: martian\nframework: none\npersistence: N/A\ndatabase: not_applicable\ncache: none\n").map(f => f.code)).toEqual(["BASELINE_STACK_VALUE_UNKNOWN"]);
  });
});
const candidate = (id: string): ObjectEnvelopeInput => ({ ...envelope(id), axes: { lifecycle: "PROPOSED", confidence: "UNRESOLVED", evidence: "PLANNED", change: "STABLE" } });
describe("BE-4 fact admission preparation", () => {
  it("rejects invalid payload and excessive TTL without issuing any permit", async () => {
    const root = await seeded(), actor = { actorType: "human" as const, actor: "owner", selfAttested: true };
    const before = readFileSync(join(root, ".pomaster/state/permits.json"), "utf8");
    await expect(prepareFactAdd(root, { envelope: { ...candidate("PAGE.ZZYXQ"), payload: [] as unknown as ObjectEnvelopeInput["payload"] }, need: "zzyxqunrelatedunicorn", actor })).rejects.toThrow();
    await expect(runFactAdd(root, { envelope: { ...candidate("PAGE.ZZYXQ"), payload: {} }, need: "zzyxqunrelatedunicorn", actor })).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "FACT_PAYLOAD_INVALID" } });
    await expect(prepareFactAdd(root, { envelope: candidate("PAGE.ZZYXQ"), need: "zzyxqunrelatedunicorn", actor, ttlBeats: 20 })).rejects.toThrow("FACT_PERMIT_TTL_INVALID");
    expect(readFileSync(join(root, ".pomaster/state/permits.json"), "utf8")).toBe(before);
  });
  it("denies duplicate creation with reuse advice", async () => {
    const result = await prepareFactAdd(await seeded(), { envelope: envelope("PAGE.TEST"), actor: { actorType: "human", actor: "owner", selfAttested: true } });
    expect(result.status).toBe("reuse"); expect(result.reuse_ids).toContain("PAGE.TEST");
  });
  it("binds actual proof, envelope preflight and one-id short TTL without issuing", async () => {
    const root = await seeded();
    const result = await prepareFactAdd(root, { envelope: candidate("PAGE.ZZYXQ"), need: "zzyxqunrelatedunicorn", actor: { actorType: "human", actor: "owner", selfAttested: true } });
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") throw new Error(JSON.stringify(result));
    expect(result.proof.result.verdict).toBe("passed"); expect(result.permitRequest.subjectIds).toEqual(["PAGE.ZZYXQ"]); expect(result.permitRequest.ttlBeats).toBeLessThanOrEqual(3);
    expect(result.validation_scope).toBe("official_kind_payload_and_sanctioned_checks");
  });
});
describe("BE-4 maintain attribution", () => {
  it("uses selected execution permit, rejects borrowed permits and missing attribution", async () => {
    const root = await seeded(), store = await createStore(root);
    const own = await issuePermit(store, { subjectIds: [envelope("PAGE.TEST").id], requestedBy: { actorType: "human", actor: "owner", selfAttested: true }, ttlBeats: 3 });
    const foreign = await issuePermit(store, { subjectIds: [envelope("PAGE.TEST").id], requestedBy: { actorType: "human", actor: "other", selfAttested: true }, changeRef: "CHANGE.OTHER", ttlBeats: 3 });
    const execution = await beginExecution(store, { role: "implementer", runtime: "claude-code", identityKind: "interactive", permitIds: [own.permitRef], startedAt: "2026-11-12T00:00:00Z" });
    const path = join(root, "tx.json"); writeFileSync(path, JSON.stringify({ ops: [{ op: "upsert_object", envelope: { ...envelope("PAGE.TEST"), titleZh: "新标题" } }] }));
    expect((await runMaintain(root, { changeOrTask: "CHANGE.TEST", opsFile: path })).errors[0]?.code).toBe("PERMIT_ATTRIBUTION_REQUIRED");
    expect((await runMaintain(root, { changeOrTask: "CHANGE.TEST", opsFile: path, executionId: execution.execution_id, permitRef: foreign.permitRef })).errors[0]?.code).toBe("PERMIT_SCOPE_DENIED");
    const result = await runMaintain(root, { changeOrTask: "CHANGE.TEST", opsFile: path, executionId: execution.execution_id, permitRef: own.permitRef });
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
  });
});
describe("BE-4 signed emergency preparation", () => {
  it("uses actual SSH signatures; rejects wrong payload/replay/long TTL without premature consumption", async () => {
    const root = await seeded(), key = makeKey("ssh-ed25519");
    const pub = join(root, "owner.pub"), priv = join(root, "owner"); writeFileSync(pub, key.line); writeFileSync(priv, opensshPrivateKeyText("aes256-ctr"));
    const env = { listAgentKeys: () => [], now: () => new Date("2026-11-12T00:00:00Z") };
    expect(runTrustEnroll(root, { key: pub, principal: "owner", private: priv }, env).ok).toBe(true);
    const spec = { ops: [{ op: "upsert_object" as const, envelope: envelope("PAGE.TEST") }], subjectIds: ["PAGE.TEST"], issuedAtSeq: 1, expiresAtSeq: 3, nonce: "unique-request" };
    const subject = breakGlassSubject(spec);
    const request = runTrustRequest(root, { kind: "accept", ...subject, ttlMinutes: 3 }, env); expect(request.ok).toBe(true);
    const id = request.result!.id as string, path = join(root, ".pomaster/trust/requests", `${id}.json`); writeFileSync(`${path}.sig`, signSshsig(key, readFileSync(path)));
    expect(verifyBreakGlass(root, id, spec, 1, env).ok).toBe(true);
    const wrong = verifyBreakGlass(root, id, { ...spec, nonce: "different-nonce" }, 1, env); expect(wrong.ok ? "" : wrong.error.code).toBe("TRUST_SIGNOFF_MISMATCH");
    const long = runTrustRequest(root, { kind: "accept", ...subject, ttlMinutes: 60 }, env), longId = long.result!.id as string, longPath = join(root, ".pomaster/trust/requests", `${longId}.json`); writeFileSync(`${longPath}.sig`, signSshsig(key, readFileSync(longPath)));
    const tooLong = verifyBreakGlass(root, longId, spec, 1, env); expect(tooLong.ok ? "" : tooLong.error.code).toBe("BREAK_GLASS_INVALID");
    expect(verifySignoff(root, id, { kind: "accept", ...subject }, { consume: true, env }).ok).toBe(true);
    const replay = verifyBreakGlass(root, id, spec, 1, env); expect(replay.ok ? "" : replay.error.code).toBe("TRUST_SIGNOFF_REPLAYED");
  });
  it("requires enrolled signature and exact ops/scope/sequence TTL", () => {
    const spec = { ops: [{ op: "upsert_object" as const, envelope: envelope("PAGE.TEST") }], subjectIds: ["PAGE.TEST"], issuedAtSeq: 1, expiresAtSeq: 3, nonce: "unique-request" };
    expect(breakGlassSubject(spec)).not.toEqual(breakGlassSubject({ ...spec, expiresAtSeq: 4 }));
    const verified = verifyBreakGlass(temp(), "SO-0123456789ab", spec, 1);
    expect(verified.ok).toBe(false); if (!verified.ok) expect(verified.error.code).toBe("TRUST_NOT_ENROLLED");
  });
});
describe("BE-4 product hook", () => {
  const hook = resolve("hooks/exec-guard-hook.py");
  const python = (script: string, root: string) => spawnSync("python", ["-B", "-c", `import importlib.util,sys,os,json\ns=importlib.util.spec_from_file_location('guard',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\n${script}`, hook, root], { encoding: "utf8", env: { ...process.env, POMASTER_CLI_ENTRY: "", PATH: process.env.PATH } });
  it("never discovers or executes a target-tree CLI artifact", () => {
    const root = temp(); mkdirSync(join(root, "packages/cli/dist"), { recursive: true }); writeFileSync(join(root, "packages/cli/dist/bin.js"), "throw Error('malicious target ran')");
    const result = python("os.environ['POMASTER_CLI_ENTRY']=os.path.join(sys.argv[2],'packages/cli/dist/bin.js')\nr=m.resolve_cli_entry(sys.argv[2]);assert r is None or not m.path_within(r,sys.argv[2]),r", root);
    expect(result.status, result.stderr).toBe(0);
  });
  it("fails closed through the actual hook for a confirmed-root launcher fault", () => {
    const root = temp(); mkdirSync(join(root, ".pomaster/state"), { recursive: true }); mkdirSync(join(root, ".pomaster/executions"), { recursive: true }); mkdirSync(join(root, ".pomaster/truth/keybindings"), { recursive: true }); mkdirSync(join(root, "src/page"), { recursive: true });
    writeFileSync(join(root, ".pomaster/state/truth-index.json"), "{}"); writeFileSync(join(root, ".pomaster/executions/AGX-2026-1.json"), JSON.stringify({ execution_id: "AGX-2026-1", ended_at: null, permit_ids: ["PERMIT.TEST.1"] })); writeFileSync(join(root, ".pomaster/truth/keybindings/KEYBINDING.TEST.ONE.json"), JSON.stringify(row()));
    const result = python("import io\nm.resolve_cli_entry=lambda root:None\nsys.stdin=io.StringIO(json.dumps({'tool_name':'Edit','tool_input':{'file_path':os.path.join(sys.argv[2],'src/page/file.ts')},'cwd':sys.argv[2]}))\nassert m.main()==2", root);
    expect(result.status, result.stderr).toBe(0); expect(readGuardFaults(root).events[0]?.protected).toBe(true);
  });
  it("keeps source writes advisory without an active execution, even if bindings are malformed", () => {
    const root = temp(); mkdirSync(join(root, ".pomaster/state"), { recursive: true }); mkdirSync(join(root, ".pomaster/truth/keybindings"), { recursive: true }); writeFileSync(join(root, ".pomaster/state/truth-index.json"), "{}"); writeFileSync(join(root, ".pomaster/truth/keybindings/broken.json"), "broken");
    const result = python("import io\nsys.stdin=io.StringIO(json.dumps({'tool_name':'Edit','tool_input':{'file_path':os.path.join(sys.argv[2],'src/page/file.ts')},'cwd':sys.argv[2]}))\nassert m.main()==0", root);
    expect(result.status, result.stderr).toBe(0); expect(result.stderr).toContain("ADVISORY"); expect(readGuardFaults(root).events).toEqual([]);
  });
  it("counts protected faults and exposes reusable closeout errors", () => {
    const root = temp(); mkdirSync(join(root, ".pomaster/state"), { recursive: true });
    const result = python("assert m.observe_fault(sys.argv[2],'src/page','launcher unavailable',True)==2", root);
    expect(result.status, result.stderr).toBe(0);
    expect(readGuardFaults(root).events).toHaveLength(1);
    expect(guardFaultErrors(root)[0]?.code).toBe("GUARD_FAULT_OBSERVED");
  });
  it("does not hide a protected fault behind another allowed target", () => {
    const root = temp(); for (const path of [".pomaster/state", ".pomaster/executions", ".pomaster/truth/keybindings", "src/page", "src/other"]) mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, ".pomaster/state/truth-index.json"), "{}"); writeFileSync(join(root, ".pomaster/executions/AGX-2026-1.json"), JSON.stringify({ execution_id: "AGX-2026-1", ended_at: null, permit_ids: ["PERMIT.TEST.1"] }));
    writeFileSync(join(root, ".pomaster/truth/keybindings/KEYBINDING.TEST.ONE.json"), JSON.stringify(row())); writeFileSync(join(root, ".pomaster/truth/keybindings/KEYBINDING.TEST.TWO.json"), JSON.stringify(row({ id: "KEYBINDING.TEST.TWO", canonical_id: "PAGE.OTHER", physical_path: "src/other" })));
    const result = python("import io\nm.judge_once=lambda root,permit,cid,target,tool:({'kind':'allowed','id':cid,'permit_ref':permit} if cid=='PAGE.TEST' else {'kind':'fault','reason':'runtime fault'})\nsys.stdin=io.StringIO(json.dumps({'tool_name':'Bash','tool_input':{'command':'touch ./src/page/a.ts ./src/other/b.ts'},'cwd':sys.argv[2]}))\nassert m.main()==2", root);
    expect(result.status, result.stderr).toBe(0); expect(readGuardFaults(root).events).toHaveLength(1);
  });
  it("never treats stale bindings as confirmed guard roots", () => {
    const root = temp(); mkdirSync(join(root, ".pomaster/truth/keybindings"), { recursive: true }); mkdirSync(join(root, "src/page"), { recursive: true });
    writeFileSync(join(root, ".pomaster/truth/keybindings/KEYBINDING.TEST.ONE.json"), JSON.stringify(row({ binding_status: "stale", probe: { method: "directory-exists", result: "unreachable", last_run_seq: 0 } })));
    const result = python("assert m.map_path_to_ids('src/page/file.ts',m.load_keybinding_rows(sys.argv[2]))==[]", root);
    expect(result.status, result.stderr).toBe(0);
  });
  it("counts unprotected fail-open faults", () => {
    const root = temp(); mkdirSync(join(root, ".pomaster/state"), { recursive: true });
    const result = python("assert m.observe_fault(sys.argv[2],'docs/new.txt','runtime error',False)==0", root);
    expect(result.status, result.stderr).toBe(0); expect(readGuardFaults(root).events[0]?.protected).toBe(false);
  });
  it("recovers an external PATH installation after a poisoned target entry", () => {
    const root = temp(), external = temp(), executable = process.platform === "win32" ? "pomaster.cmd" : "pomaster";
    mkdirSync(join(root, "bin")); mkdirSync(join(external, "bin"));
    for (const directory of [join(root, "bin"), join(external, "bin")]) {
      const path = join(directory, executable); writeFileSync(path, "malicious or trusted fixture; resolution only"); chmodSync(path, 0o755);
    }
    const result = python(`m.__file__=${JSON.stringify(join(external, "uninstalled", "hook.py"))}\nos.environ['PATH']=os.path.join(sys.argv[2],'bin')+os.pathsep+${JSON.stringify(join(external, "bin"))}\nassert m.resolve_cli_entry(sys.argv[2])==os.path.realpath(${JSON.stringify(join(external, "bin", executable))})`, root);
    expect(result.status, result.stderr).toBe(0);
  });
  it("retains valid faults while rejecting malformed events and non-string timestamps", () => {
    const root = temp(); mkdirSync(join(root, ".pomaster/state"), { recursive: true });
    const event = { type: "GUARD_FAULT_OBSERVED", observed_at: "2026-11-12T00:00:00Z", target: "docs/a", reason: "fault", protected: false, disposition: "fail_open" };
    writeFileSync(join(root, ".pomaster/state/guard-faults.jsonl"), [JSON.stringify(event), "broken", JSON.stringify({ ...event, observed_at: 1 })].join("\n"));
    const assessment = readGuardFaults(root);
    expect(assessment.events).toEqual([event]); expect(assessment.errors).toHaveLength(2);
    expect(guardFaultErrors(root)).toHaveLength(3);
  });
  it("discloses telemetry append failure without opening a protected write", () => {
    const result = python("assert m.observe_fault(sys.argv[2],'src/page','runtime error',True)==2", temp());
    expect(result.status, result.stderr).toBe(0); expect(result.stderr).toContain("GUARD_FAULT_LOG_INVALID"); expect(result.stderr).toContain("fail_closed");
  });
});
