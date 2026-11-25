import * as fs from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
import { renderExecGuardLauncher } from "../src/heavy-entry.js";
import { readGuardFaults } from "../src/guard-faults.js";

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

async function faultLauncher(payload: unknown, slowStderr = false, closedStderr = false,
  options: { transport?: "backpressure" | "invalid-fd"; stderrFile?: boolean } = {}) {
  put("launcher-fixture/exec-guard-launcher.mjs", renderExecGuardLauncher(null));
  put("launcher-fixture/exec-guard-hook.py", fs.readFileSync(new URL("../../../hooks/exec-guard-hook.py", import.meta.url), "utf8"));
  const args: string[] = [];
  if (options.transport) {
    // Only replace child I/O, never the generated protection assessment. A standard
    // Writable deterministically queues every note; this does not assume fd 2 is nonblocking.
    put("launcher-fixture/stderr-loader.mjs", `
import { closeSync, openSync, write, writeFileSync } from "node:fs";
import { Writable } from "node:stream";
const original = process.stderr;
const invalidFd = ${options.transport === "invalid-fd"};
const trace = { queued: 0, completed: 0, backpressure: 0, errors: [] };
const transport = new Writable({
  highWaterMark: 1,
  write(chunk, encoding, callback) {
    setTimeout(() => {
      const done = error => {
        if (error) trace.errors.push(error.code);
        else trace.completed++;
        callback(error);
      };
      if (invalidFd) {
        // Close immediately before writing, so assessment file I/O cannot reuse the fd.
        const fd = openSync(new URL(import.meta.url), "r");
        closeSync(fd);
        write(fd, chunk, done);
      } else original.write(chunk, done);
    }, 2);
  },
});
const queuedWrite = transport.write.bind(transport);
transport.write = (...args) => {
  trace.queued++;
  const ready = queuedWrite(...args);
  if (!ready) trace.backpressure++;
  return ready;
};
Object.defineProperty(process, "stderr", { value: transport });
process.on("exit", () => writeFileSync(${JSON.stringify(file("launcher-fixture/stderr-trace.json"))}, JSON.stringify(trace)));
`);
    args.push("--import", pathToFileURL(file("launcher-fixture/stderr-loader.mjs")).href);
  }
  args.push(file("launcher-fixture/exec-guard-launcher.mjs"));
  const stderrFd = options.stderrFile ? fs.openSync(file("launcher-fixture/stderr.txt"), "w") : undefined;
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { PATH: file("no-such-bin"), SystemRoot: process.env.SystemRoot ?? "" },
    stdio: ["pipe", "pipe", stderrFd ?? "pipe"],
  });
  if (stderrFd !== undefined) fs.closeSync(stderrFd);
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  let resume: ReturnType<typeof setTimeout> | undefined;
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr.push(chunk);
    if (slowStderr) {
      child.stderr?.pause();
      resume = setTimeout(() => child.stderr?.resume(), 5);
    }
  });
  if (slowStderr) {
    child.stderr?.pause();
    resume = setTimeout(() => child.stderr?.resume(), 3_000);
  }
  const result = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
    child.stdin.once("error", reject);
  });
  const timeout = setTimeout(() => child.kill(), 15_000);
  if (closedStderr) child.stderr?.destroy();
  child.stdin.end(JSON.stringify(payload));
  try {
    return { ...await result, stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: options.stderrFile ? fs.readFileSync(file("launcher-fixture/stderr.txt"), "utf8") : Buffer.concat(stderr).toString("utf8") };
  } finally {
    clearTimeout(timeout);
    clearTimeout(resume);
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

describe("generated launcher production regressions", () => {
  it.each(["slow piped stderr", "deterministic Writable backpressure", "a real file descriptor"] as const)(
    "drains every bounded mixed-target diagnostic and the full final overflow reason to %s", async mode => {
    const ordinaryDir = join("src", ...Array.from({ length: 12 }, (_, n) => `${n}-${"x".repeat(120)}`));
    fs.mkdirSync(file(ordinaryDir), { recursive: true });
    const protectedTarget = file(".pomaster/state/truth-index.json");
    const before = fs.readFileSync(protectedTarget);
    const edits = [
      ...Array.from({ length: 255 }, (_, n) => ({ file_path: file(join(ordinaryDir, `ordinary-${n}.ts`)) })),
      { file_path: protectedTarget },
      { file_path: file("src/beyond-bound.ts") },
    ];
    const run = await faultLauncher({ tool_name: "MultiEdit", tool_input: { edits }, cwd: root },
      mode === "slow piped stderr", false, {
        transport: mode === "deterministic Writable backpressure" ? "backpressure" : undefined,
        stderrFile: mode === "a real file descriptor",
      });
    if (mode === "deterministic Writable backpressure") {
      const trace = JSON.parse(fs.readFileSync(file("launcher-fixture/stderr-trace.json"), "utf8"));
      expect(trace).toEqual({ queued: 258, completed: 258, backpressure: 258, errors: [] });
    }
    expect(run.code).toBe(2);
    expect(run.signal).toBeNull();
    expect(run.stdout).toBe("");
    const faults = readGuardFaults(root);
    expect(faults.errors).toEqual([]);
    expect(faults.events).toHaveLength(257);
    expect(faults.events.filter(event => !event.protected)).toHaveLength(255);
    expect(faults.events.at(-2)).toMatchObject({ target: protectedTarget, protected: true, disposition: "fail_closed" });
    const last = faults.events.at(-1)!;
    expect(last).toMatchObject({ target: "<unknown>", protected: true, disposition: "fail_closed" });
    expect(last.reason).toContain("Target/edit inventory budget exhausted; assessment truncated; protected target cannot be excluded");
    expect(run.stderr).toContain(`[pomaster exec-guard launcher] GUARD_FAULT_OBSERVED fail_closed: <unknown>: ${last.reason}\n`);
    expect(run.stderr.match(/GUARD_FAULT_OBSERVED /g)).toHaveLength(257);
    for (const event of faults.events) expect(run.stderr).toContain(`GUARD_FAULT_OBSERVED ${event.disposition}: ${event.target}: ${event.reason}\n`);
    expect(run.stderr).toMatch(/DENY: no Python 3\.8\+ found[^\n]+execution audit\n$/);
    expect(fs.readFileSync(protectedTarget)).toEqual(before);
  }, 20_000);

  it("keeps a protected refusal at exit 2 when the actual stderr pipe reader closes", async () => {
    const target = file(".pomaster/state/truth-index.json");
    const before = fs.readFileSync(target);
    const run = await faultLauncher({ tool_name: "Write", tool_input: { file_path: target }, cwd: root }, false, true);
    expect(run.code).toBe(2);
    expect(run.signal).toBeNull();
    expect(run.stdout).toBe("");
    const faults = readGuardFaults(root);
    expect(faults.errors).toEqual([]);
    expect(faults.events).toHaveLength(1);
    expect(faults.events[0]).toMatchObject({ target, protected: true, disposition: "fail_closed" });
    expect(fs.readFileSync(target)).toEqual(before);
  });

  it.each([false, true])("keeps invalid-fd diagnostics separate from the protected=%s exit disposition", async protectedTarget => {
    const target = file(protectedTarget ? ".pomaster/state/truth-index.json" : "src/ordinary.ts");
    put("src/ordinary.ts", "original ordinary bytes\n");
    const before = fs.readFileSync(file(".pomaster/state/truth-index.json"));
    const edits = [{ file_path: target }, { file_path: file("src/another.ts") }];
    const run = await faultLauncher({ tool_name: "MultiEdit", tool_input: { edits }, cwd: root }, false, false,
      { transport: "invalid-fd" });
    expect(run.code).toBe(protectedTarget ? 2 : 0);
    expect(run.signal).toBeNull();
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
    const trace = JSON.parse(fs.readFileSync(file("launcher-fixture/stderr-trace.json"), "utf8"));
    expect(trace).toEqual({ queued: 3, completed: 0, backpressure: 3, errors: ["EBADF"] });
    const faults = readGuardFaults(root);
    expect(faults.errors).toEqual([]);
    expect(faults.events).toHaveLength(2);
    expect(faults.events[0]).toMatchObject({ target, protected: protectedTarget,
      disposition: protectedTarget ? "fail_closed" : "fail_open" });
    expect(faults.events[1]).toMatchObject({ protected: false, disposition: "fail_open" });
    expect(fs.readFileSync(file(".pomaster/state/truth-index.json"))).toEqual(before);
    expect(fs.readFileSync(file("src/ordinary.ts"), "utf8")).toBe("original ordinary bytes\n");
  });

  it.each([
    ["src/ordinary.ts", false],
    ["src/page/new.ts", true],
    [".pomaster/state/truth-index.json", true],
  ] as const)("records one same-store alias fault for %s without losing protection", async (relative, protectedTarget) => {
    put("src/ordinary.ts", "original ordinary bytes\n");
    put("src/page/existing.ts", "original protected bytes\n");
    put(".pomaster/truth/keybindings/page.json", binding);
    const alias = file("store-alias");
    fs.symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
    const target = join(alias, relative);
    const before = fs.readFileSync(file(".pomaster/state/truth-index.json"));
    const run = await faultLauncher({ tool_name: "Write", tool_input: { file_path: target }, cwd: root });
    expect(run.code, run.stderr).toBe(protectedTarget ? 2 : 0);
    expect(run.stdout).toBe("");
    const faults = readGuardFaults(root);
    expect(faults.errors).toEqual([]);
    expect(faults.events).toHaveLength(1);
    expect(faults.events[0]).toMatchObject({ target, protected: protectedTarget, disposition: protectedTarget ? "fail_closed" : "fail_open" });
    expect(run.stderr.match(/GUARD_FAULT_OBSERVED /g)).toHaveLength(1);
    expect(fs.readFileSync(file(".pomaster/state/truth-index.json"))).toEqual(before);
    expect(fs.readFileSync(file("src/ordinary.ts"), "utf8")).toBe("original ordinary bytes\n");
    expect(fs.readFileSync(file("src/page/existing.ts"), "utf8")).toBe("original protected bytes\n");
  });

  it("reads same-store alias metadata once without falsely exhausting the entry budget", async () => {
    put("src/ordinary.ts", "original\n");
    for (let n = 0; n < 512; n++) put(`.pomaster/truth/keybindings/${n}.json`, { binding_class: "contract_operation_to_operationId" });
    const alias = file("store-alias");
    fs.symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
    const target = join(alias, "src/ordinary.ts");
    const run = await faultLauncher({ tool_name: "Write", tool_input: { file_path: target }, cwd: root });
    expect(run.code, run.stderr).toBe(0);
    const faults = readGuardFaults(root);
    expect(faults.errors).toEqual([]);
    expect(faults.events).toHaveLength(1);
    expect(faults.events[0]).toMatchObject({ target, protected: false, disposition: "fail_open" });
    expect(run.stderr).not.toContain("inventory budget exhausted");
  });

  it("still closes a lexical control-plane redirect into a different ordinary store", async () => {
    const other = file("other-store");
    fs.mkdirSync(other);
    await createStore(other);
    put("other-store/src/ordinary.ts", "original destination bytes\n");
    const link = file(".pomaster/state/redirect");
    fs.symlinkSync(join(other, "src"), link, process.platform === "win32" ? "junction" : "dir");
    const target = join(link, "ordinary.ts");
    const before = [root, other].map(project => fs.readFileSync(join(project, ".pomaster/state/truth-index.json")));
    const run = await faultLauncher({ tool_name: "Write", tool_input: { file_path: target }, cwd: root });
    expect(run.code, run.stderr).toBe(2);
    expect(run.stdout).toBe("");
    for (const [project, protectedTarget] of [[root, true], [other, false]] as const) {
      const faults = readGuardFaults(project);
      expect(faults.errors).toEqual([]);
      expect(faults.events).toHaveLength(1);
      expect(faults.events[0]).toMatchObject({ target, protected: protectedTarget, disposition: protectedTarget ? "fail_closed" : "fail_open" });
    }
    [root, other].forEach((project, n) => expect(fs.readFileSync(join(project, ".pomaster/state/truth-index.json"))).toEqual(before[n]));
    expect(fs.readFileSync(file("other-store/src/ordinary.ts"), "utf8")).toBe("original destination bytes\n");
  });
});

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
