// 协调器派发钉测（code-spec autopilot-dispatch.md；PRD 11-11-agent-autopilot AP-2 / D-8）：
// 消费既有路由投影（零第二套阶段判据）；派发包 D-8 字段面 + 幂等（包指纹）+ 换代
// supersedes + 预算熔断（max_rework_rounds）+ 连续失败熔断 + 局部挂起；QA 真值被改全拒。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { applyTransaction, createStore, readKeybindings, type ObjectEnvelopeInput } from "@pomaster/kernel";
import { readGenerationManifest } from "../src/scaffold-generate.js";
import { SCAFFOLD_GENERATION_MANIFEST_RELATIVE } from "../src/store-layout.js";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/init.js";
import { runIntakeDraft } from "../src/intake-draft.js";
import { runIntakePending, runIntakeRead, runIntakeResolve } from "../src/intake.js";
import { runKickoffConfirm, runKickoffDraft, type KickoffEnv } from "../src/kickoff.js";
import { runPlanScenarios } from "../src/plan-scenarios.js";
import { runQaCasesDraft, runQaCasesFreeze } from "../src/qa-cases.js";
import { runExecutionAttachPermit, runExecutionBegin } from "../src/runtime.js";
import { runPermitIssue } from "../src/permit.js";
import { createProgram, runCli } from "../src/index.js";
import type { AutopilotDispatchPack } from "../src/autopilot-dispatch.js";
import { runAutopilotBudgetRecord, runAutopilotDispatch, runAutopilotResume, runAutopilotStatus, runAutopilotSuspend, AUTOPILOT_STOP_CONSECUTIVE_FAILURES } from "../src/autopilot-dispatch.js";
import { runTrustEnroll, runTrustRequest, type TrustEnv } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");
const AGX = "AGX-2026-009001";

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-ap2-"));
  expect((await runInit(dir)).ok).toBe(true);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noAgent: TrustEnv = { listAgentKeys: () => [] };
const bareMachine: KickoffEnv = { trust: noAgent, probe: () => ({ ok: false, output: "" }) };
const GAP_TEXT = "审批人的范围没写：是直属主管还是部门负责人";
const kickoffDir = (id: string) => join(dir, ".pomaster", "kickoff", id);
const apPath = (...parts: string[]) => join(dir, ".pomaster", "autopilot", ...parts);
const qaPath = (...parts: string[]) => join(dir, ".pomaster", "qa", ...parts);
const readSheet = (id: string) => JSON.parse(readFileSync(join(kickoffDir(id), "sheet.json"), "utf8")) as { questions: { key: string; classification: string }[] };

async function readyIntake(): Promise<void> {
  for (const version of ["v1", "v2"]) expect((await runIntakeRead(dir, { paths: [join(FIXTURES, version)], name: "orders" })).ok).toBe(true);
  const pending = runIntakePending(dir, {}).result?.blocks ?? [];
  const note = pending.find((block) => JSON.stringify(block).includes("内部备注"));
  expect(note).toBeDefined();
  expect(runIntakeResolve(dir, { block: [note?.id ?? ""], as: "gap", text: GAP_TEXT }).ok).toBe(true);
  const rest = pending.filter((block) => block.id !== note?.id).map((block) => block.id);
  if (rest.length > 0) expect(runIntakeResolve(dir, { block: rest, as: "skip", reason: "项目配置，不是需求" }).ok).toBe(true);
  expect((await runIntakeRead(dir, { paths: [join(FIXTURES, "v2")], name: "orders" })).ok).toBe(true);
  expect(runIntakeDraft(dir, {}).ok).toBe(true);
}

function draft(env: KickoffEnv = bareMachine) {
  const outcome = runKickoffDraft(dir, {}, env);
  expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
  return outcome.result as NonNullable<typeof outcome.result>;
}

let ownerKey: TestKey | null = null;
function enrollOwner(): TestKey {
  const key = makeKey("ssh-ed25519");
  writeFileSync(join(dir, "owner.pub"), `${key.line}\n`);
  writeFileSync(join(dir, "owner"), opensshPrivateKeyText("aes256-ctr"));
  expect(runTrustEnroll(dir, { key: join(dir, "owner.pub"), principal: "owner", private: join(dir, "owner") }, noAgent).ok).toBe(true);
  return key;
}

function sign(key: TestKey, kind: string, subject: string): string {
  const request = runTrustRequest(dir, { kind, subject }, noAgent);
  expect(request.ok, JSON.stringify(request.errors)).toBe(true);
  const id = (request.result as { id: string }).id;
  const path = join(dir, ".pomaster", "trust", "requests", `${id}.json`);
  writeFileSync(`${path}.sig`, signSshsig(key, readFileSync(path)));
  return id;
}

const blockingKey = (id: string) => readSheet(id).questions.find((question) => question.classification === "BLOCKING_AUTHORITY")?.key ?? "";

function answer(id: string, extra = "", backend = "material"): void {
  writeFileSync(join(kickoffDir(id), "choices.yaml"), `answers:\n  ${blockingKey(id)}: 直属主管\nstack_decision:\n  backend: ${backend}\n${extra}`);
}

/** 签好、confirm 完、plan 已提交、QA 已冻结、执行身份已在册的全绿轮次。 */
async function greenRound(extraChoices = "", backend = "material"): Promise<string> {
  await readyIntake();
  ownerKey = enrollOwner();
  const { id } = draft();
  answer(id, extraChoices, backend);
  expect(draft().ready).toBe(true);
  const signoff = sign(ownerKey as TestKey, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
  const confirmed = await runKickoffConfirm(dir, { signoff }, bareMachine);
  expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
  const planned = await runPlanScenarios(dir);
  expect(planned.ok, JSON.stringify(planned.errors)).toBe(true);
  expect(runQaCasesDraft(dir).ok).toBe(true);
  expect(runQaCasesFreeze(dir).ok).toBe(true);
  const began = await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: AGX });
  expect(began.ok, JSON.stringify(began.errors)).toBe(true);
  return id;
}

const dispatch = () => runAutopilotDispatch(dir, { executionId: AGX });
const taskPath = (unit: string) => join(dir, ".pomaster", "truth", "objects", "task-object", `${unit.toLowerCase().replace(/_/g, "-")}.json`);
const taskPayload = (unit: string) => (JSON.parse(readFileSync(taskPath(unit), "utf8")) as { payload: { intent: string; affected_objects: string[] } }).payload;

/** Owned maintenance only: reuse the original admitted envelope and kernel permit transaction. */
async function updateTask(unit: string, patch: Record<string, unknown>, permitRef?: string): Promise<string> {
  const round = JSON.parse(readFileSync(join(dir, ".pomaster", "kickoff", "current.json"), "utf8")) as { sheet: string };
  const tx = JSON.parse(readFileSync(join(dir, ".pomaster", "plan", round.sheet, "units.tx.json"), "utf8")) as { ops: { op: string; envelope?: ObjectEnvelopeInput }[] };
  const envelope = tx.ops.find(op => op.op === "upsert_object" && op.envelope?.id === unit)!.envelope!;
  const payload = { ...taskPayload(unit), ...patch };
  if (permitRef === undefined) {
    const subjects = [...new Set([unit, ...taskPayload(unit).affected_objects, ...(payload.affected_objects as string[])])];
    const permit = await runPermitIssue(dir, { subjects, actor: "agent:dogfood-worker", changeRef: unit });
    expect(permit.ok, JSON.stringify(permit.errors)).toBe(true);
    permitRef = permit.result.permit_ref;
    const attached = await runExecutionAttachPermit(dir, AGX, { permit: permitRef, actor: "agent:dogfood-worker", reason: "owned TASK maintenance regression" });
    expect(attached.ok, JSON.stringify(attached.errors)).toBe(true);
  }
  await applyTransaction(await createStore(dir), { executionId: AGX, permitRef,
    ops: [{ op: "upsert_object", envelope: { ...envelope, payload } }],
  });
  return permitRef;
}

describe("autopilot dispatch 前置链", () => {
  it("无确认单 → QA_KICKOFF_NOT_IN_FORCE；词形非法 AGX → SCHEMA_INVALID；不在册 AGX → AUTOPILOT_EXECUTION_NOT_FOUND", async () => {
    expect((await runAutopilotDispatch(dir, { executionId: AGX })).errors[0]?.code).toBe("QA_KICKOFF_NOT_IN_FORCE");
    await greenRound();
    expect((await runAutopilotDispatch(dir, { executionId: "agent-x" })).errors[0]?.code).toBe("SCHEMA_INVALID");
    expect((await runAutopilotDispatch(dir, { executionId: "AGX-2026-999999" })).errors[0]?.code).toBe("AUTOPILOT_EXECUTION_NOT_FOUND");
  });

  it("QA 未冻结 → QA_CASES_NOT_FROZEN；冻结集被改 → QA_CASES_TAMPERED（验收真值可疑全拒）", async () => {
    await readyIntake();
    ownerKey = enrollOwner();
    const { id } = draft();
    answer(id);
    expect(draft().ready).toBe(true);
    const signoff = sign(ownerKey as TestKey, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
    expect((await runKickoffConfirm(dir, { signoff }, bareMachine)).ok).toBe(true);
    expect((await runPlanScenarios(dir)).ok).toBe(true);
    expect((await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: AGX })).ok).toBe(true);
    expect((await dispatch()).errors[0]?.code).toBe("QA_CASES_NOT_FROZEN");

    expect(runQaCasesDraft(dir).ok).toBe(true);
    expect(runQaCasesFreeze(dir).ok).toBe(true);
    const frozenPath = qaPath(id, "cases-frozen.json");
    writeFileSync(frozenPath, `${readFileSync(frozenPath, "utf8")}x`, "utf8");
    expect((await dispatch()).errors[0]?.code).toBe("QA_CASES_TAMPERED");
  });
});

describe("dogfood dispatch context and execution-owned permits", () => {
  const unit = "TASK.KO_ORDERS_R3.BE.ORDERS";
  const foreignUnit = "TASK.KO_ORDERS_R3.FE.ORDERS";
  const foreignAgx = "AGX-2026-009002";
  const actor = "agent:dogfood-worker";
  const executionPath = () => join(dir, ".pomaster", "executions", `${AGX}.json`);
  const permitsPath = () => join(dir, ".pomaster", "state", "permits.json");
  const readPack = (disp: string) => JSON.parse(readFileSync(apPath("dispatches", `${disp}.json`), "utf8")) as AutopilotDispatchPack;
  async function issue(subject: string): Promise<string> {
    const result = await runPermitIssue(dir, { subjects: [subject], actor, changeRef: subject });
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    return result.result.permit_ref;
  }

  it("DF-DISPATCH-01 fresh advertised command parses public argv; saved role is reused by the real context command", async () => {
    await greenRound();
    const first = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    const freshPack = readPack(first.result!.dispatched[0]!.disp);
    const argv = freshPack.context_ref.split("（")[0]!.trim().split(/\s+/).slice(1);
    expect(argv).not.toContain("--task");
    // The public router has no concrete role before a manifest exists; fill only its role placeholder.
    const publicArgv = argv.map(value => value === "<role>" ? "backend" : value);
    const program = createProgram(undefined, { stdout: () => {}, stderr: () => {} });
    const compile = program.commands.find(c => c.name() === "context")!.commands.find(c => c.name() === "compile")!;
    let parsed: Record<string, unknown> | undefined;
    compile.action(opts => { parsed = opts as Record<string, unknown>; });
    await program.parseAsync(publicArgv, { from: "user" });
    expect(parsed).toMatchObject({ change: unit, role: "backend" });

    expect(await runCli(["--dir", dir, "context", "compile", "--change", unit, "--role", "backend", "--stage", "implement", "--json"], { stdout: () => {}, stderr: () => {} })).toBe(0);
    // A new execution produces a fresh pack without changing the original dispatch or its budget.
    expect((await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: foreignAgx, taskId: unit })).ok).toBe(true);
    const second = await runAutopilotDispatch(dir, { executionId: foreignAgx, unit });
    const pack = readPack(second.result!.dispatched[0]!.disp);
    expect(pack.context_ref).toContain(`--change ${unit}`);
    expect(pack.context_ref).toContain("--role backend");
    const advertised = pack.context_ref.split("（")[0]!.trim().split(/\s+/).slice(1);
    const stdout: string[] = [];
    const stderr: string[] = [];
    expect(await runCli(["--dir", dir, ...advertised, "--json"], { stdout: value => stdout.push(value), stderr: value => stderr.push(value) }), stderr.join("\n")).toBe(0);
    expect(JSON.parse(stdout.join("\n"))).toMatchObject({ command: "context compile", ok: true });
  });

  it.each(["owned", "foreign", "none"] as const)("DF-DISPATCH-02 real permit pack: %s attached set", async ownership => {
    await greenRound();
    let owned: string | undefined;
    let foreign: string | undefined;
    if (ownership === "owned") {
      owned = await issue(unit);
      expect((await runExecutionAttachPermit(dir, AGX, { permit: owned, actor, reason: "bounded BE work" })).ok).toBe(true);
    }
    if (ownership !== "none") {
      foreign = await issue(foreignUnit);
      expect((await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: foreignAgx, taskId: foreignUnit, permitIds: [foreign] })).ok).toBe(true);
    }
    // Obsolete filename discovery must never advertise even a plausible foreign permit.
    mkdirSync(join(dir, ".pomaster", "permits"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "permits", `${foreign ?? "PERMIT.OBSOLETE.1"}.json`), "{}");
    const executionBefore = readFileSync(executionPath());
    const permitsBefore = readFileSync(permitsPath());
    const outcome = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(outcome.result!.dispatched).toHaveLength(1);
    const pack = readPack(outcome.result!.dispatched[0]!.disp);
    expect(pack.permit_refs).toEqual(owned === undefined ? [] : [owned]);
    expect(pack.permit_refs).not.toContain(foreign);
    expect(outcome.warnings.some(w => w.code === "AUTOPILOT_PERMIT_ABSENT")).toBe(owned === undefined);
    expect(pack.write_scope.affected_objects).toEqual([...new Set(taskPayload(unit).affected_objects)].sort());
    expect(readFileSync(executionPath())).toEqual(executionBefore);
    expect(readFileSync(permitsPath())).toEqual(permitsBefore);
  });

  it("DF-DISPATCH-02 attachment refresh replaces stale traceability once, then remains idempotent", async () => {
    await greenRound();
    const first = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    const original = first.result!.dispatched[0]!.disp;
    const originalBytes = readFileSync(apPath("dispatches", `${original}.json`));
    expect(readPack(original).permit_refs).toEqual([]);
    const attached = await issue(unit);
    expect((await runExecutionAttachPermit(dir, AGX, { permit: attached, actor, reason: "recover absent worker permit" })).ok).toBe(true);
    const refreshed = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    expect(refreshed.result!.dispatched).toHaveLength(1);
    const current = refreshed.result!.dispatched[0]!.disp;
    expect(readPack(current).permit_refs).toEqual([attached]);
    expect(readFileSync(apPath("dispatches", `${original}.json`))).toEqual(originalBytes);
    const rows = readFileSync(apPath("dispatches.jsonl"), "utf8").trim().split("\n");
    expect(JSON.parse(rows[1]!)).toMatchObject({ supersedes: original, generation: 2 });
    expect((await runAutopilotDispatch(dir, { executionId: AGX, unit })).result!.no_change).toEqual([{ unit, disp: current }]);
    expect(readFileSync(apPath("dispatches.jsonl"), "utf8").trim().split("\n")).toEqual(rows);
  });

  it.each(["execution-json", "execution-permits", "permit-json", "permit-row", "dangling-permit"])("DF-DISPATCH-02 %s damage fails visibly before any pack or dispatch ledger", async damage => {
    await greenRound();
    if (damage === "execution-json") writeFileSync(executionPath(), "{");
    if (damage === "execution-permits" || damage === "dangling-permit") {
      const execution = JSON.parse(readFileSync(executionPath(), "utf8")) as Record<string, unknown>;
      execution.permit_ids = damage === "execution-permits" ? "PERMIT.BAD.1" : ["PERMIT.MISSING.1"];
      writeFileSync(executionPath(), JSON.stringify(execution));
    }
    if (damage === "permit-json") writeFileSync(permitsPath(), "{");
    if (damage === "permit-row") writeFileSync(permitsPath(), JSON.stringify({ version: 1, permits: [null] }));
    const outcome = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.warnings.some(w => w.code === "AUTOPILOT_PERMIT_ABSENT")).toBe(false);
    expect(existsSync(apPath("dispatches.jsonl"))).toBe(false);
    expect(existsSync(apPath("dispatches"))).toBe(false);
  });
});

describe("dogfood metadata and actual TASK scope", () => {
  const unit = "TASK.KO_ORDERS_R3.BE.ORDERS";
  const packPath = (disp: string) => apPath("dispatches", `${disp}.json`);
  const readPack = (disp: string) => JSON.parse(readFileSync(packPath(disp), "utf8")) as AutopilotDispatchPack;

  it.each(["permits.json", "journal.jsonl"])("DF-DISPATCH-METADATA empty attached execution rejects unreadable %s before any dispatch write", async name => {
    await greenRound();
    const executionPath = join(dir, ".pomaster", "executions", `${AGX}.json`);
    const executionBefore = readFileSync(executionPath);
    expect(JSON.parse(executionBefore.toString()).permit_ids).toEqual([]);
    const indexPath = join(dir, ".pomaster", "state", "truth-index.json");
    const indexBefore = readFileSync(indexPath);
    const path = join(dir, ".pomaster", "state", name);
    const original = readFileSync(path);
    renameSync(path, `${path}.saved`);
    mkdirSync(path);
    try {
      const outcome = await runAutopilotDispatch(dir, { executionId: AGX, unit });
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
      expect(outcome.warnings).toEqual([]);
      expect(existsSync(apPath("dispatches"))).toBe(false);
      expect(existsSync(apPath("dispatches.jsonl"))).toBe(false);
      expect(readFileSync(executionPath)).toEqual(executionBefore);
      expect(readFileSync(indexPath)).toEqual(indexBefore);
      expect(readFileSync(`${path}.saved`)).toEqual(original);
    } finally {
      rmSync(path, { recursive: true });
      renameSync(`${path}.saved`, path);
    }
    expect(readFileSync(path)).toEqual(original);
    expect((await runAutopilotDispatch(dir, { executionId: AGX, unit })).result!.dispatched).toHaveLength(1);
  });

  it("DF-SCOPE actual signed scaffold TASK projects all 64 affected IDs and only their real paths, with no attached write grant", async () => {
    await greenRound("", "scaffold");
    const declared = taskPayload(unit).affected_objects;
    expect(declared).toHaveLength(64);
    const manifest = await readGenerationManifest(dir);
    expect(manifest.kind).toBe("ok");
    if (manifest.kind !== "ok") throw new Error("expected real generation manifest");
    const selected = manifest.manifest.files.filter(file => declared.includes(file.keybinding_id));
    const bindings = readKeybindings(dir);
    const indexPath = join(dir, ".pomaster", "state", "truth-index.json");
    const before = readFileSync(indexPath);
    const outcome = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    expect(outcome.result!.blocked).toEqual([]);
    const pack = readPack(outcome.result!.dispatched[0]!.disp);
    expect(pack.task).toBe(unit);
    expect(pack.write_scope).toMatchObject({ lane: "be", entity: "orders" });
    expect(pack.write_scope.affected_objects).toEqual([...new Set(declared)].sort());
    expect(pack.write_scope.affected_objects).not.toContain(unit);
    expect(pack.write_scope.paths).toEqual([...new Set(selected.map(file => file.path))].sort());
    expect(pack.write_scope.paths).toHaveLength(64);
    for (const file of selected) {
      expect(bindings.find(row => row.id === file.keybinding_id)?.physical_path).toBe(file.path);
      expect(existsSync(join(dir, file.path))).toBe(true);
    }
    expect(pack.permit_refs).toEqual([]);
    expect(outcome.warnings.some(w => w.code === "AUTOPILOT_PERMIT_ABSENT")).toBe(true);
    expect(readFileSync(indexPath)).toEqual(before);
  });

  it.each(["payload-array", "missing-affected-objects"] as const)("DF-SCOPE %s is unknown, not a declared zero scope, and blocks only its unit", async damage => {
    await greenRound("", "scaffold");
    expect(taskPayload(unit).affected_objects).toHaveLength(64);
    // Deliberately damage only this test's TEMP TASK; do not admit or rehash illegal truth.
    const body = JSON.parse(readFileSync(taskPath(unit), "utf8")) as Record<string, unknown>;
    if (damage === "payload-array") body.payload = [];
    else delete (body.payload as Record<string, unknown>).affected_objects;
    const tamperedBytes = `${JSON.stringify(body, null, 2)}\n`;
    writeFileSync(taskPath(unit), tamperedBytes, "utf8");
    const protectedFiles = () => ["truth", "state", "executions"].flatMap(folder =>
      readdirSync(join(dir, ".pomaster", folder), { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)),
    ).sort();
    const filesBefore = protectedFiles();
    const bytesBefore = filesBefore.map(path => readFileSync(path));

    const outcome = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(outcome.result!.blocked).toEqual([expect.objectContaining({ unit, code: "SCHEMA_INVALID" })]);
    expect(outcome.result!.dispatched).toEqual([]);
    expect(outcome.result!.no_change).toEqual([]);
    expect(existsSync(apPath("dispatches"))).toBe(false);
    expect(existsSync(apPath("dispatches.jsonl"))).toBe(false);
    expect(protectedFiles()).toEqual(filesBefore);
    filesBefore.forEach((path, index) => expect(readFileSync(path)).toEqual(bytesBefore[index]));
    expect(readFileSync(taskPath(unit), "utf8")).toBe(tamperedBytes);

    // Whole-round dispatch still serves the other units, without a pack or row for this one.
    const partial = await dispatch();
    expect(partial.ok, JSON.stringify(partial.errors)).toBe(true);
    expect(partial.result!.blocked).toEqual([expect.objectContaining({ unit, code: "SCHEMA_INVALID" })]);
    expect(partial.result!.dispatched).toHaveLength(3);
    expect(partial.result!.dispatched.every(entry => entry.unit !== unit)).toBe(true);
    expect(readdirSync(apPath("dispatches")).sort()).toEqual(partial.result!.dispatched.map(entry => `${entry.disp}.json`).sort());
    for (const entry of partial.result!.dispatched) expect(readPack(entry.disp).task).toBe(entry.unit);
    const ledgerBefore = readFileSync(apPath("dispatches.jsonl"), "utf8");
    const rows = ledgerBefore.trim().split("\n").map(line => JSON.parse(line) as { unit: string });
    expect(rows.map(row => row.unit)).toEqual(partial.result!.dispatched.map(entry => entry.unit));
    expect(rows.some(row => row.unit === unit)).toBe(false);
    const retried = await dispatch();
    expect(retried.result!.blocked).toEqual([expect.objectContaining({ unit, code: "SCHEMA_INVALID" })]);
    expect(retried.result!.dispatched).toEqual([]);
    expect(retried.result!.no_change).toEqual(partial.result!.dispatched);
    expect(readFileSync(apPath("dispatches.jsonl"), "utf8")).toBe(ledgerBefore);
    expect(protectedFiles()).toEqual(filesBefore);
    filesBefore.forEach((path, index) => expect(readFileSync(path)).toEqual(bytesBefore[index]));
    expect(readFileSync(taskPath(unit), "utf8")).toBe(tamperedBytes);
  });

  it.each(["unknown", "stale", "escaping-binding", "escaping-manifest", "manifest-mismatch", "missing-target", "damaged-binding"])("DF-SCOPE %s cannot emit a falsely complete package", async damage => {
    await greenRound("", "scaffold");
    if (damage === "unknown") await updateTask(unit, { affected_objects: [...taskPayload(unit).affected_objects, "TASK.KO_ORDERS_R3.CONTRACT"] });
    const target = readKeybindings(dir).find(row => row.id === taskPayload(unit).affected_objects[0])!;
    const bindingPath = join(dir, ".pomaster", "truth", "keybindings", `${target.id.toLowerCase()}.json`);
    if (damage === "stale") writeFileSync(bindingPath, JSON.stringify({ ...target, binding_status: "stale" }));
    if (damage === "escaping-binding") writeFileSync(bindingPath, JSON.stringify({ ...target, physical_path: "../outside.java" }));
    if (damage === "damaged-binding") writeFileSync(bindingPath, "{");
    if (damage === "missing-target") rmSync(join(dir, target.physical_path));
    if (damage === "escaping-manifest" || damage === "manifest-mismatch") {
      const path = join(dir, SCAFFOLD_GENERATION_MANIFEST_RELATIVE);
      const manifest = JSON.parse(readFileSync(path, "utf8")) as { files: { keybinding_id: string; path: string }[] };
      manifest.files.find(file => file.keybinding_id === target.id)!.path = damage === "escaping-manifest" ? "../outside.java" : "backend/other.java";
      writeFileSync(path, JSON.stringify(manifest));
    }
    const bodyBefore = readFileSync(taskPath(unit));
    const outcome = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    expect(outcome.result!.dispatched).toEqual([]);
    expect(outcome.result!.blocked).toEqual([expect.objectContaining({ unit, code: "SCHEMA_INVALID" })]);
    expect(existsSync(apPath("dispatches"))).toBe(false);
    expect(existsSync(apPath("dispatches.jsonl"))).toBe(false);
    expect(readFileSync(taskPath(unit))).toEqual(bodyBefore);
  });

  it("DF-SCOPE sanctioned denominator-only changes reissue immutable packs, deduplicate and do not reset caps", async () => {
    await greenRound("budget:\n  max_rework_rounds: 1\n", "scaffold");
    const declared = taskPayload(unit).affected_objects;
    const permitRef = await updateTask(unit, {});
    const first = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    const original = first.result!.dispatched[0]!.disp;
    const originalBytes = readFileSync(packPath(original));
    const permitsBefore = readFileSync(join(dir, ".pomaster", "state", "permits.json"));
    // Change neither intent/acceptance nor attached permits: only the actual affected denominator.
    const revised = [...declared.slice(1), declared[1]!];
    await updateTask(unit, { affected_objects: revised }, permitRef);
    const second = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    expect(second.result!.dispatched).toHaveLength(1);
    const refreshed = second.result!.dispatched[0]!.disp;
    expect(refreshed).not.toBe(original);
    expect(readPack(refreshed).write_scope.affected_objects).toEqual([...new Set(revised)].sort());
    expect(readPack(refreshed).write_scope.paths).toHaveLength(63);
    expect(readPack(refreshed).permit_refs).toEqual(readPack(original).permit_refs);
    expect(readFileSync(packPath(original))).toEqual(originalBytes);
    const rows = readFileSync(apPath("dispatches.jsonl"), "utf8");
    expect(JSON.parse(rows.trim().split("\n")[1]!)).toMatchObject({ generation: 2, supersedes: original });
    expect((await runAutopilotDispatch(dir, { executionId: AGX, unit })).result!.no_change).toEqual([{ unit, disp: refreshed }]);
    expect(readFileSync(apPath("dispatches.jsonl"), "utf8")).toBe(rows);
    await updateTask(unit, { affected_objects: declared.slice(2) }, permitRef);
    const third = await runAutopilotDispatch(dir, { executionId: AGX, unit });
    expect(third.result!.blocked[0]?.code).toBe("AUTOPILOT_BUDGET_EXHAUSTED");
    expect(readFileSync(apPath("dispatches.jsonl"), "utf8")).toBe(rows);
    expect(readFileSync(join(dir, ".pomaster", "state", "permits.json"))).toEqual(permitsBefore);
    expect(readFileSync(packPath(original))).toEqual(originalBytes);
  });

  it.each(["scaffold", "legacy-no-generation"] as const)("DF-SCOPE explicit [] in a %s TASK preserves zero-target traceability without granting permission", async fixture => {
    await greenRound("", fixture === "scaffold" ? "scaffold" : "material");
    await updateTask(unit, { affected_objects: [] });
    expect(taskPayload(unit).affected_objects).toEqual([]);
    // An explicit legacy zero-target declaration needs no generation-path mapping.
    if (fixture === "legacy-no-generation") rmSync(join(dir, SCAFFOLD_GENERATION_MANIFEST_RELATIVE));
    const emptyAgx = "AGX-2026-009003";
    expect((await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: emptyAgx, taskId: unit })).ok).toBe(true);
    const executionPath = join(dir, ".pomaster", "executions", `${emptyAgx}.json`);
    const protectedPaths = [taskPath(unit), executionPath, ...["truth-index.json", "journal.jsonl", "permits.json"].map(name => join(dir, ".pomaster", "state", name))];
    const bytesBefore = protectedPaths.map(path => readFileSync(path));
    const attached = (JSON.parse(readFileSync(executionPath, "utf8")) as { permit_ids: string[] }).permit_ids;
    expect(attached).toEqual([]);
    const outcome = await runAutopilotDispatch(dir, { executionId: emptyAgx, unit });
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    expect(outcome.result!.blocked).toEqual([]);
    expect(outcome.result!.dispatched).toHaveLength(1);
    const pack = readPack(outcome.result!.dispatched[0]!.disp);
    expect(pack.task).toBe(unit);
    expect(pack.write_scope).toMatchObject({ affected_objects: [], paths: [] });
    expect(pack.permit_refs).toEqual([...new Set(attached)].sort());
    expect(outcome.warnings.some(w => w.code === "AUTOPILOT_PERMIT_ABSENT")).toBe(attached.length === 0);
    const ledgerBefore = readFileSync(apPath("dispatches.jsonl"));
    expect((await runAutopilotDispatch(dir, { executionId: emptyAgx, unit })).result!.no_change).toEqual(outcome.result!.dispatched);
    expect(readFileSync(apPath("dispatches.jsonl"))).toEqual(ledgerBefore);
    protectedPaths.forEach((path, index) => expect(readFileSync(path)).toEqual(bytesBefore[index]));
  });
});

describe("autopilot dispatch 派发与幂等", () => {
  it("happy path：4 单元全派发，DISP-#### 连号、包文件在座、字段面齐（route/versions/qa_cases/budget）", async () => {
    await greenRound();
    const outcome = await dispatch();
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    expect(result.round).toBe("KO-orders-r3");
    expect(result.dispatched.length).toBe(4);
    expect(result.blocked.length).toBe(0);
    expect(result.dispatched.map((entry) => entry.disp)).toEqual(["DISP-0001", "DISP-0002", "DISP-0003", "DISP-0004"]);

    const pointer = JSON.parse(readFileSync(qaPath("current.json"), "utf8")) as { cases_frozen_sha256: string };
    for (const entry of result.dispatched) {
      const packPath = apPath("dispatches", `${entry.disp}.json`);
      expect(existsSync(packPath)).toBe(true);
      const pack = JSON.parse(readFileSync(packPath, "utf8")) as {
        schema: string;
        task: string;
        execution_id: string;
        route: { route_id: string; exit_condition: string };
        versions: { qa_frozen_sha256: string; intake_revision: number; plan_fingerprint: string };
        qa_cases: { digest: string; case_ids: string[] };
        budget: { max_rework_rounds: number };
        recovery: string[];
      };
      expect(pack.schema).toBe("pomaster.autopilot-dispatch/v1");
      expect(pack.task).toBe(entry.unit);
      expect(pack.execution_id).toBe(AGX);
      expect(pack.route.route_id.length).toBeGreaterThan(0);
      expect(pack.route.exit_condition.length).toBeGreaterThan(0);
      expect(pack.versions.qa_frozen_sha256).toBe(pointer.cases_frozen_sha256);
      expect(pack.versions.intake_revision).toBeGreaterThan(0);
      expect(pack.qa_cases.digest).toBe(pointer.cases_frozen_sha256);
      expect(pack.qa_cases.case_ids.length).toBeGreaterThan(0);
      expect(pack.budget.max_rework_rounds).toBeGreaterThan(0);
      expect(pack.recovery.length).toBeGreaterThan(0);
    }

    // 账：4 行 append-only（DISP 连号、lane 面在座）
    const ledger = readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "");
    expect(ledger.length).toBe(4);
  });

  it("幂等：重跑全 NO_CHANGE 引用原 DISP、零新账行；改单元意图 → 换代重派 supersedes", async () => {
    await greenRound();
    const first = await dispatch();
    expect(first.ok).toBe(true);
    const firstResult = first.result as NonNullable<typeof first.result>;
    const ledgerBefore = readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length;

    const second = await dispatch();
    expect(second.ok, JSON.stringify(second.errors)).toBe(true);
    const secondResult = second.result as NonNullable<typeof second.result>;
    expect(secondResult.no_change.length).toBe(4);
    expect(secondResult.dispatched.length).toBe(0);
    expect(readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length).toBe(ledgerBefore);

    // 改一个单元的意图（truth 正文）→ 只该单元换代重派
    const unit = firstResult.dispatched[0]!.unit;
    const bodyPath = join(dir, ".pomaster", "truth", "objects", "task-object", `${unit.toLowerCase().replace(/_/g, "-")}.json`);
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as { payload: { intent: string } };
    body.payload.intent = `${body.payload.intent}（派发后单元合同被合法修订）`;
    writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    const third = await dispatch();
    expect(third.ok).toBe(true);
    const thirdResult = third.result as NonNullable<typeof third.result>;
    expect(thirdResult.no_change.length).toBe(3);
    expect(thirdResult.dispatched.length).toBe(1);
    const newDisp = thirdResult.dispatched[0]!;
    expect(newDisp.unit).toBe(unit);
    const ledger = readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "");
    expect(ledger.length).toBe(ledgerBefore + 1);
    const line = JSON.parse(ledger[ledger.length - 1] ?? "{}") as { disp: string; supersedes: string | null; generation: number };
    expect(line.disp).toBe(newDisp.disp);
    expect(line.supersedes).toBe(firstResult.dispatched.find((entry) => entry.unit === unit)?.disp ?? null);
    expect(line.generation).toBe(2);
  });

  it("预算熔断：choices 声明 max_rework_rounds=1 → 第 3 代（2 次重派）拒派 AUTOPILOT_BUDGET_EXHAUSTED", async () => {
    await greenRound("budget:\n  max_rework_rounds: 1\n");
    expect((await dispatch()).ok).toBe(true);
    const unit = "TASK.KO_ORDERS_R3.BE.ORDERS";
    const bodyPath = join(dir, ".pomaster", "truth", "objects", "task-object", `${unit.toLowerCase().replace(/_/g, "-")}.json`);
    const mutate = () => {
      const body = JSON.parse(readFileSync(bodyPath, "utf8")) as { payload: { intent: string } };
      body.payload.intent = `${body.payload.intent}（再改）`;
      writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    };
    mutate();
    const second = await dispatch();
    expect(second.ok).toBe(true);
    // 第 2 代 = 1 次重派 ≤ cap 1 → 放行；再改 → 2 次重派 > 1 → 该单元熔断
    mutate();
    const third = await dispatch();
    expect(third.ok).toBe(true);
    const result = third.result as NonNullable<typeof third.result>;
    const exhausted = result.blocked.find((entry) => entry.unit === unit);
    expect(exhausted?.code).toBe("AUTOPILOT_BUDGET_EXHAUSTED");
  });
});

describe("局部挂起与连续失败熔断", () => {
  it("suspend 跳过该单元其余照常；resume 恢复派发；--unit 收窄", async () => {
    await greenRound();
    const unit = "TASK.KO_ORDERS_R3.FE.ORDERS";
    const suspended = runAutopilotSuspend(dir, { unit, reason: "等待 Owner 裁定审批链口径" });
    expect(suspended.ok, JSON.stringify(suspended.errors)).toBe(true);
    expect(suspended.result).toMatchObject({ action: "suspend", unit });
    expect(runAutopilotSuspend(dir, { unit, reason: "" }).errors[0]?.code).toBe("SCHEMA_INVALID");

    const outcome = await dispatch();
    expect(outcome.ok).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    expect(result.suspended).toEqual([unit]);
    expect(result.dispatched.length).toBe(3);

    expect(runAutopilotResume(dir, { unit }).ok).toBe(true);
    const resumed = await dispatch();
    const resumedResult = resumed.result as NonNullable<typeof resumed.result>;
    expect(resumedResult.suspended.length).toBe(0);
    expect(resumedResult.no_change.length).toBe(3);
    expect(resumedResult.dispatched.map((entry) => entry.unit)).toEqual([unit]);

    // --unit 收窄：只派一个
    const narrowed = await runAutopilotDispatch(dir, { executionId: AGX, unit: "TASK.KO_ORDERS_R3.CONTRACT" });
    const narrowedResult = narrowed.result as NonNullable<typeof narrowed.result>;
    expect(narrowedResult.no_change.length).toBe(1);
    expect(narrowedResult.dispatched.length).toBe(0);
    expect((await runAutopilotDispatch(dir, { executionId: AGX, unit: "TASK.NOT.IN.PLAN" })).errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("连续失败 ≥3：STOP_REQUIRED（status 熔断态 + dispatch 拒派该单元）；spend 记账与花费 unknown", async () => {
    await greenRound();
    const unit = "TASK.KO_ORDERS_R3.BE.ORDERS";
    for (let round = 0; round < AUTOPILOT_STOP_CONSECUTIVE_FAILURES; round += 1) {
      const recorded = runAutopilotBudgetRecord(dir, { executionId: AGX, failure: true, unit, reason: `GRN failed：验收断言红（第 ${round + 1} 次）` });
      expect(recorded.ok).toBe(true);
    }
    // 花费不可计量显式 unknown
    expect(runAutopilotBudgetRecord(dir, { executionId: AGX, costUnknown: true, rounds: 2, minutes: 30 }).ok).toBe(true);
    expect(runAutopilotBudgetRecord(dir, { executionId: AGX, failure: true, unit: "TASK.NOT.IN.PLAN", reason: "x" }).errors[0]?.code).toBe("SCHEMA_INVALID");

    const status = runAutopilotStatus(dir);
    expect(status.ok).toBe(true);
    const statusResult = status.result as NonNullable<typeof status.result>;
    expect(statusResult.circuit).toBe("STOP_REQUIRED");
    expect(statusResult.budget.spend_lines).toBe(1);

    const outcome = await dispatch();
    expect(outcome.ok).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    const stopped = result.blocked.find((entry) => entry.unit === unit);
    expect(stopped?.code).toBe("AUTOPILOT_STOP_REQUIRED");
    // 其余单元照常派发（局部熔断不冻结全局）
    expect(result.dispatched.length).toBe(3);
  });
});

describe("autopilot status", () => {
  it("纯读呈现：未派发 PENDING → 派发后 DISPATCHED；无 plan 时显式；escalations open 计数", async () => {
    const before = runAutopilotStatus(dir);
    expect(before.ok).toBe(true);
    expect((before.result as { round: string | null }).round).toBeNull();

    await greenRound();
    const mid = runAutopilotStatus(dir);
    const midResult = mid.result as NonNullable<typeof mid.result>;
    expect(midResult.units.length).toBe(4);
    expect(midResult.units.every((row) => row.state === "PENDING")).toBe(true);
    expect(midResult.qa_digest_ok).toBe(true);

    expect((await dispatch()).ok).toBe(true);
    const after = runAutopilotStatus(dir);
    const afterResult = after.result as NonNullable<typeof after.result>;
    expect(afterResult.units.every((row) => row.state === "DISPATCHED")).toBe(true);
    expect(afterResult.circuit).toBe("OK");

    // 账只增不改：status 后账行数不变
    const ledgerLines = readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length;
    runAutopilotStatus(dir);
    expect(readFileSync(apPath("dispatches.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").length).toBe(ledgerLines);
  });
});
