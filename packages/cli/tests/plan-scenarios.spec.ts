// 场景规划钉测（code-spec scenario-planning.md v2；PRD 11-11-agent-autopilot PL-1 / D-6）：
// 生效确认单 + 已确认领域规格 → 场景依赖候选 + scaffold generate + DB/BE/FE/契约单元落成 TASK
// 对象（kernel applyTransaction 唯一写路径），journal PLAN_COMPILED；重跑 NO_CHANGE；
// 确认单缺席/过期/字节漂移、单元在座内容不同都拒绝。
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const catalogFixture = vi.hoisted(() => ({ root: "" }));
vi.mock("../../kernel/src/catalog.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../kernel/src/catalog.js")>();
  return { ...actual, resolveCatalogRoot: () => catalogFixture.root || actual.resolveCatalogRoot() };
});
import { runInit } from "../src/init.js";
import { runIntakeDraft } from "../src/intake-draft.js";
import { runIntakePending, runIntakeRead, runIntakeResolve } from "../src/intake.js";
import { runKickoffConfirm, runKickoffDraft, type KickoffEnv } from "../src/kickoff.js";
import { applyCompactShellPatch, runPlanScenarios, verifyScenarioConstruction } from "../src/plan-scenarios.js";
import { journalFilePath } from "../src/store-layout.js";
import { runPlanCompile } from "../src/plan.js";
import { runPlanRun, type PlanRunInput, type PlanRunResult } from "../src/plan-runner.js";
import { runCli } from "../src/index.js";
import type { CliEnvelope } from "../src/envelope.js";
import { runAutopilotDispatch } from "../src/autopilot-dispatch.js";
import { runQaCasesDraft, runQaCasesFreeze } from "../src/qa-cases.js";
import { runPermitIssue } from "../src/permit.js";
import { defaultSpawn, type SpawnOutcome, type ToolBindingRecord } from "@pomaster/gauntlet-lite";
import { runExecutionBegin } from "../src/runtime.js";
import { applyTransaction, loadStoreReadOnly, readCatalogLock, verifyCatalogLock, sha256OfUtf8, type Transaction } from "@pomaster/kernel";
import { runTrustEnroll, runTrustRequest, type TrustEnv } from "../src/trust.js";
import { makeKey, opensshPrivateKeyText, signSshsig, type TestKey } from "./fixtures/trust/sshsig-signer.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "intake");

let dir: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-plan-scenarios-"));
  expect((await runInit(dir)).ok).toBe(true);
  catalogFixture.root = join(dir, "catalog-fixture");
  cpSync(join(FIXTURES, "../../../../../catalog"), catalogFixture.root, { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noAgent: TrustEnv = { listAgentKeys: () => [] };
const bareMachine: KickoffEnv = { trust: noAgent, probe: () => ({ ok: false, output: "" }) };
const GAP_TEXT = "审批人的范围没写：是直属主管还是部门负责人";

const kickoffDir = (id: string) => join(dir, ".pomaster", "kickoff", id);
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

function answer(id: string, extra = ""): void {
  writeFileSync(join(kickoffDir(id), "choices.yaml"), `answers:\n  ${blockingKey(id)}: 直属主管\nstack_decision:\n  backend: material\n${extra}`);
}

/** 签好、confirm 完的轮次（style 追加进 choices）。 */
async function confirmedRound(extra = ""): Promise<string> {
  await readyIntake();
  const key = enrollOwner();
  const { id } = draft();
  answer(id, extra);
  expect(draft().ready).toBe(true);
  const signoff = sign(key, "kickoff", `.pomaster/kickoff/${id}/sheet.json`);
  const confirmed = await runKickoffConfirm(dir, { signoff }, bareMachine);
  expect(confirmed.ok, JSON.stringify(confirmed.errors)).toBe(true);
  return id;
}

// Synthetic signer fixtures above exercise cryptography, not a real Owner's approval.
function governanceBytes(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (ref: string): void => {
    for (const entry of readdirSync(join(dir, ".pomaster", ref), { withFileTypes: true })) {
      const child = ref ? `${ref}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { files[`${child}/`] = "directory"; walk(child); }
      else files[child] = readFileSync(join(dir, ".pomaster", child)).toString("hex");
    }
  };
  walk("");
  return files;
}

async function nativePlanFixture() {
  await confirmedRound();
  const planned = await runPlanScenarios(dir);
  expect(planned.ok, JSON.stringify(planned.errors)).toBe(true);
  expect(runQaCasesDraft(dir).ok).toBe(true);
  expect(runQaCasesFreeze(dir).ok).toBe(true);
  const taskRef = planned.result!.units.find(unit => unit.lane === "be")!.id;
  const otherTask = planned.result!.units.find(unit => unit.lane === "db")!.id;
  const vitestRoot = join(FIXTURES, "../../../../../node_modules/vitest");
  const version = JSON.parse(readFileSync(join(vitestRoot, "package.json"), "utf8")).version as string;
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", devDependencies: { vitest: version } }));
  writeFileSync(join(dir, "orders-rule.mjs"), "export const requiresApproval = amount => amount > 1000000;\n");
  writeFileSync(join(dir, "orders-rule.test.mjs"), "import { requiresApproval } from './orders-rule.mjs';\nit.each([[999999,false],[1000000,false],[1500000,true]])('approval threshold %s', (amount, required) => { expect(requiresApproval(amount)).toBe(required); });\n");
  writeFileSync(join(dir, "plan-vitest.config.mjs"), "export default { test: { globals: true, include: ['orders-rule.test.mjs'], minWorkers: 1, maxWorkers: 1, passWithNoTests: false } };\n");
  const binding: ToolBindingRecord = {
    id: "project.test.vitest", source: "project", transport: "cli", adapter_ref: "builtin.gauntlet-lite.build",
    tool: "gauntlet:vitest", tool_version_anchor: version, gate: "BUILD", gate_def: "POLICY.GATE.BUILD@0.1.0",
    metric_dialect: "test:assertion_count", capabilities: ["unit_behavior"],
    execution: { command: `node "${join(vitestRoot, "vitest.mjs")}" run --root "${dir}" --config "${join(dir, "plan-vitest.config.mjs")}" --reporter=json`, cwd: ".", timeout_ms: 60000 },
    report_contract: { format: "vitest-json-stdout", parser_ref: "builtin.gauntlet-lite.build/vitest-json", parser_version: "0.1.0" },
    environment: { requires: false },
  };
  mkdirSync(join(dir, ".pomaster/tools"), { recursive: true });
  writeFileSync(join(dir, ".pomaster/tools/bindings.json"), JSON.stringify({ version: 1, bindings: [binding] }));
  const owned = async (task = taskRef) => {
    const permit = await runPermitIssue(dir, { subjects: [task], actor: "agent:dogfood-test", changeRef: task, ttlBeats: "100" });
    expect(permit.ok, JSON.stringify(permit.errors)).toBe(true);
    const execution = await runExecutionBegin(dir, { role: "qa", runtime: "script", identityKind: "script", taskId: task, permitIds: [permit.result.permit_ref!] });
    expect(execution.ok, JSON.stringify(execution.errors)).toBe(true);
    return execution.result.execution_id;
  };
  const dispatch = async (executionId: string, task = taskRef) => {
    const result = await runAutopilotDispatch(dir, { executionId, unit: task });
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    expect(result.result!.blocked).toEqual([]);
    return (result.result!.dispatched[0] ?? result.result!.no_change[0])!.disp;
  };
  const executionId = await owned();
  const input: PlanRunInput = { taskRef, executionId, changed: ["orders-rule.mjs", "orders-rule.test.mjs"], faces: ["behavior=present:confirmed Orders approval implementation"] };
  return { input, otherTask, owned, dispatch };
}

async function publicPlan(input: PlanRunInput): Promise<CliEnvelope<PlanRunResult>> {
  const stdout: string[] = [], stderr: string[] = [];
  const code = await runCli([
    "--dir", dir, "plan", "run", "--task", input.taskRef, "--execution-id", input.executionId,
    ...(input.changed ?? []).flatMap(path => ["--changed", path]),
    ...(input.faces ?? []).flatMap(face => ["--face", face]),
    ...(input.dispatchRef === undefined ? [] : ["--dispatch", input.dispatchRef]), "--json",
  ], { stdout: line => stdout.push(line), stderr: line => stderr.push(line) });
  expect(stdout, stderr.join("\n")).toHaveLength(1);
  const envelope = JSON.parse(stdout[0]!) as CliEnvelope<PlanRunResult>;
  expect(code).toBe(envelope.ok ? 0 : 1);
  return envelope;
}

function expectNativePass(output: SpawnOutcome): void {
  expect(output.status, output.stderr).toBe(0);
  const report = JSON.parse(output.stdout);
  expect(report).toMatchObject({ success: true, numTotalTests: 3, numPassedTests: 3, numFailedTests: 0 });
  expect(report.testResults[0].assertionResults.map((row: { status: string }) => row.status)).toEqual(["passed", "passed", "passed"]);
}

describe("DF-PLAN-RECORD original dispatch qualification", () => {
  it("signed generated TASK → frozen QA → owned dispatch → native Vitest GRN; public argv reuses only the original anchor", async () => {
    const { input, dispatch } = await nativePlanFixture();
    const dispatchRef = await dispatch(input.executionId);
    const processes: SpawnOutcome[] = [];
    const first = await runPlanRun(dir, { ...input, dispatchRef }, {
      spawnFn: (command, options) => { const output = defaultSpawn(command, options); processes.push(output); return output; },
    });
    expect(processes).toHaveLength(1);
    expectNativePass(processes[0]!);
    expect(first.ok, JSON.stringify(first.errors)).toBe(true);
    expect(first.result).toMatchObject({ obligations_total: 1, recorded: 1, passed: 1 });
    const grn = first.result.rows[0]!.grn;
    const run = JSON.parse(readFileSync(join(dir, `.pomaster/evidence/runs/${grn}.json`), "utf8"));
    expect(run.execution_id).toBe(input.executionId);
    expect(run.gate_result.result).toMatchObject({ subject_id: input.taskRef, tool: "gauntlet:vitest", verdict: "passed" });
    expect(run).not.toHaveProperty("evidence_purpose");
    const journal = readFileSync(journalFilePath(dir), "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(journal.filter(event => event.type === "TX_APPLIED" && event.note?.includes("autopilot_dispatch="))).toEqual([
      expect.objectContaining({ note: expect.stringContaining(`autopilot_dispatch=${dispatchRef}`) }),
    ]);
    const before = governanceBytes();
    const cached = await publicPlan({ ...input, dispatchRef });
    expect(cached.ok, JSON.stringify(cached.errors)).toBe(true);
    expect(cached.result.rows[0]!.grn).toBe(grn);
    expect((await publicPlan(input)).errors[0]?.code).toBe("AUTOPILOT_RECORD_NOT_FOUND");
    expect(governanceBytes()).toEqual(before);
  }, 60000);

  it("missing, invalid, foreign TASK/AGX, mismatched input and superseded originals cannot use warm cache or requalify", async () => {
    const { input, otherTask, owned, dispatch } = await nativePlanFixture();
    const original = await dispatch(input.executionId);
    expect((await runPlanRun(dir, { ...input, dispatchRef: original })).ok).toBe(true);
    const otherAgx = await owned(otherTask), otherDisp = await dispatch(otherAgx, otherTask);
    const nextAgx = await owned(), latest = await dispatch(nextAgx);
    expect(latest).not.toBe(original);
    const rejected: [PlanRunInput, string][] = [
      [input, "AUTOPILOT_RECORD_NOT_FOUND"],
      [{ ...input, dispatchRef: "bad-original" }, "SCHEMA_INVALID"],
      [{ ...input, dispatchRef: "DISP-9999" }, "SCHEMA_INVALID"],
      [{ ...input, dispatchRef: otherDisp }, "SCHEMA_INVALID"],
      [{ ...input, dispatchRef: latest }, "SCHEMA_INVALID"],
      [{ ...input, executionId: nextAgx, dispatchRef: original }, "SCHEMA_INVALID"],
      [{ ...input, taskRef: otherTask, dispatchRef: original }, "EXECUTION_TASK_MISMATCH"],
      [{ ...input, dispatchRef: original }, "AUTOPILOT_REVISION_AHEAD"],
      [{ ...input, requalify: true, by: "agent:dogfood-test" }, "AUTOPILOT_RECORD_NOT_FOUND"],
      [{ ...input, dispatchRef: original, requalify: true, by: "agent:dogfood-test" }, "AUTOPILOT_REVISION_AHEAD"],
      [{ ...input, executionId: nextAgx, dispatchRef: original, requalify: true, by: "agent:dogfood-test" }, "SCHEMA_INVALID"],
    ];
    const before = governanceBytes();
    const spawnFn = vi.fn(() => { throw new Error("rejected submissions must not launch tools"); });
    const executableProbe = vi.fn(() => { throw new Error("rejected submissions must not probe tools"); });
    for (const [submission, code] of rejected) {
      const result = await runPlanRun(dir, submission, { spawnFn, executableProbe });
      expect(result.errors[0]?.code, JSON.stringify(submission)).toBe(code);
      expect(result.result).toMatchObject({ recorded: 0, passed: 0, rows: [] });
      expect(governanceBytes()).toEqual(before);
    }
    expect(spawnFn).not.toHaveBeenCalled();
    expect(executableProbe).not.toHaveBeenCalled();
  }, 60000);

  it("recording rechecks the original after actual Vitest execution, rejecting an expired submission without a GRN", async () => {
    const { input, dispatch } = await nativePlanFixture();
    const dispatchRef = await dispatch(input.executionId);
    const before = governanceBytes();
    const now = Date.now(), processes: SpawnOutcome[] = [];
    let clock: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const result = await runPlanRun(dir, { ...input, dispatchRef }, {
        spawnFn: (command, options) => {
          const output = defaultSpawn(command, options); processes.push(output);
          clock = vi.spyOn(Date, "now").mockReturnValue(now + 30 * 86400000);
          return output;
        },
      });
      expect(processes).toHaveLength(1);
      expectNativePass(processes[0]!);
      expect(result.errors[0]?.code).toBe("AUTOPILOT_REVISION_AHEAD");
      expect(result.result).toMatchObject({ recorded: 0, rows: [] });
      expect(governanceBytes()).toEqual(before);
    } finally { clock?.mockRestore(); }
  }, 60000);

  it("undispatched legacy calls omit provenance/purpose and remain byte-identical on reuse", async () => {
    const { input } = await nativePlanFixture();
    const first = await publicPlan(input);
    expect(first.ok, JSON.stringify(first.errors)).toBe(true);
    const before = governanceBytes();
    const replay = await runPlanRun(dir, { ...input, dispatchRef: undefined });
    expect(replay.ok).toBe(true);
    expect(replay.result).toEqual(first.result);
    expect(governanceBytes()).toEqual(before);
    expect(readFileSync(journalFilePath(dir), "utf8")).not.toContain("autopilot_dispatch=");
  }, 60000);
});

describe("compact shell 补丁（纯函数）", () => {
  const seed = [
    `<template>`,
    `  <a-config-provider :locale="zhCN">`,
    `    <a-layout class="shell">`,
    `  </a-config-provider>`,
    `</template>`,
    ``,
    `<script setup lang="ts">`,
    `import zhCN from "ant-design-vue/es/locale/zh_CN";`,
    `</script>`,
  ].join("\n");

  it("两处行级插入：ConfigProvider 挂 compactTheme、script 注入算法与控件高", () => {
    const patch = applyCompactShellPatch(seed, "KO-orders-r3");
    expect(patch.changed).toBe(true);
    expect(patch.text).toContain(`<a-config-provider :locale="zhCN" :theme="compactTheme">`);
    expect(patch.text).toContain(`const compactTheme = { algorithm: antdTheme.compactAlgorithm, token: { controlHeight: 24 } };`);
    expect(patch.text).toContain("KO-orders-r3");
    const again = applyCompactShellPatch(patch.text, "KO-orders-r3");
    expect(again.changed).toBe(false);
    expect(again.text).toBe(patch.text);
  });

  it("锚不在座（非生成 shell）不动", () => {
    expect(applyCompactShellPatch("<template><div /></template>", "KO-x").changed).toBe(false);
  });
});

describe("plan scenarios", () => {
  const archetypePath = "archetypes/archetype.governance.task_unit.json";
  const modelId = "ARCHETYPE.GOVERNANCE.TASK_UNIT";
  const stateBytes = () => ["state/permits.json", "state/truth-index.json", "state/journal.jsonl", "state/relations.jsonl"].map(path => {
    const full = join(dir, ".pomaster", path);
    return existsSync(full) ? readFileSync(full, "utf8") : null;
  });

  it("adopts the real locked TASK model with TASK-subject claims and actual artifact bindings atomically", async () => {
    const lock = readCatalogLock(catalogFixture.root);
    expect(verifyCatalogLock(catalogFixture.root).ok).toBe(true);
    expect(lock.controlled_children.allowed).toContain(archetypePath);
    expect(lock.controlled_children.required).toContain(archetypePath);
    const entry = lock.entries.find(entry => entry.id === modelId);
    expect(entry?.path).toBe(archetypePath);
    expect(entry?.content_sha256).toBe(sha256OfUtf8(readFileSync(join(catalogFixture.root, archetypePath), "utf8")));
    const round = await confirmedRound();
    const result = await runPlanScenarios(dir);
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
    const edges = readFileSync(join(dir, ".pomaster/state/relations.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(edges).toHaveLength(4);
    for (const unit of result.result!.units) {
      const body = JSON.parse(readFileSync(join(dir, ".pomaster/truth/objects/task-object", `${unit.id.toLowerCase().replaceAll("_", "-")}.json`), "utf8"));
      const laneCapabilities = { contract: ["api_contract"], db: ["migration_drill"], be: ["unit_behavior"], fe: ["ui_render"] };
      expect(body.payload.acceptance[0].requires).toEqual(laneCapabilities[unit.lane]);
      const compiled = await runPlanCompile(dir, { taskRef: unit.id });
      expect(compiled.ok, JSON.stringify(compiled.errors)).toBe(true);
      expect(compiled.result.items.filter(item => item.applicability === "REQUIRED").map(item => item.capability)).toEqual(laneCapabilities[unit.lane]);
      expect(compiled.result.items.filter(item => item.applicability === "REQUIRED").every(item => item.tool_gap !== null)).toBe(true);
      expect(body.key_bindings.code).toBeUndefined();
      expect(body.key_bindings.artifact).toHaveLength(3);
      for (const binding of body.key_bindings.artifact) {
        expect(binding.artifact_type).toBe("file");
        expect(binding.match_rule).toBe("mechanical");
        expect(binding.expect.sha256).toBe(sha256OfUtf8(readFileSync(join(dir, binding.value), "utf8")));
      }
      const claim = JSON.parse(readFileSync(join(dir, ".pomaster/evidence/claims", `${body.payload.acceptance[0].claim}.json`), "utf8"));
      expect(claim.subject.object_id).toBe(unit.id);
      expect(claim.verification.verdict).toBe("UNVERIFIED");
      expect(claim.evidence_refs).toEqual([]);
      expect(edges.find(edge => edge.source.id === unit.id)).toMatchObject({
        type: "INSTANCE_OF", source: { domain: "truth", id: unit.id }, target: { domain: "catalog", id: modelId },
        origin: "static_analysis", confidence: "deterministic", producer: "ANALYZER.PLAN_SCENARIOS",
        provenance: { source_ref: `.pomaster/plan/${round}/units.tx.json`, locator: expect.stringContaining(unit.id), observation_ref: null, declared_by: null },
      });
    }
    const before = stateBytes();
    expect((await runPlanScenarios(dir)).result?.change).toBe("NO_CHANGE");
    expect(stateBytes()).toEqual(before);
  });

  it.each(["passed", "failed", "absent", "unavailable"])("generated BE acceptance runs the actual Vitest binding (%s), not a zero-denominator exemption", async verdict => {
    await confirmedRound();
    const planned = await runPlanScenarios(dir);
    expect(planned.ok, JSON.stringify(planned.errors)).toBe(true);
    const taskRef = planned.result!.units.find(unit => unit.lane === "be")!.id;
    const vitestRoot = join(FIXTURES, "../../../../../node_modules/vitest");
    const version = JSON.parse(readFileSync(join(vitestRoot, "package.json"), "utf8")).version as string;
    expect(version).toBe("2.1.9");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", devDependencies: { vitest: version } }));
    writeFileSync(join(dir, "orders-rule.mjs"), `export const requiresApproval = amount => amount > ${verdict === "failed" ? "1500000" : "1000000"};\n`);
    writeFileSync(join(dir, "orders-rule.test.mjs"), `import { requiresApproval } from './orders-rule.mjs';\nit('confirmed high-value order needs approval', () => { expect(requiresApproval(1500000)).toBe(true); });\n`);
    writeFileSync(join(dir, "plan-vitest.config.mjs"), `export default { test: { globals: true, include: ['orders-rule.test.mjs'], minWorkers: 1, maxWorkers: 1, passWithNoTests: false } };\n`);
    const binding: ToolBindingRecord = {
      id: "project.test.vitest", source: "project", transport: "cli", adapter_ref: "builtin.gauntlet-lite.build",
      tool: "gauntlet:vitest", tool_version_anchor: version, gate: "BUILD", gate_def: "POLICY.GATE.BUILD@0.1.0",
      metric_dialect: "test:assertion_count", capabilities: ["unit_behavior"],
      execution: { command: `${verdict === "unavailable" ? `"${join(dir, "missing-vitest-executable")}"` : "node"} "${join(vitestRoot, "vitest.mjs")}" run --root "${dir}" --config "${join(dir, "plan-vitest.config.mjs")}" --reporter=json`, cwd: ".", timeout_ms: 60000 },
      report_contract: { format: "vitest-json-stdout", parser_ref: "builtin.gauntlet-lite.build/vitest-json", parser_version: "0.1.0" },
      environment: { requires: false },
    };
    mkdirSync(join(dir, ".pomaster/tools"), { recursive: true });
    writeFileSync(join(dir, ".pomaster/tools/bindings.json"), JSON.stringify({ version: 1, bindings: verdict === "absent" ? [] : [binding] }));
    const permit = await runPermitIssue(dir, { subjects: [taskRef], actor: "agent:dogfood-test", changeRef: taskRef, ttlBeats: "100" });
    expect(permit.ok, JSON.stringify(permit.errors)).toBe(true);
    const execution = await runExecutionBegin(dir, { role: "qa", runtime: "script", identityKind: "script", taskId: taskRef, permitIds: [permit.result.permit_ref!] });
    expect(execution.ok, JSON.stringify(execution.errors)).toBe(true);
    const input = { taskRef, changed: ["orders-rule.mjs", "orders-rule.test.mjs"], faces: ["behavior=present:confirmed Orders approval rule implementation"] };
    const compiled = await runPlanCompile(dir, input);
    expect(compiled.ok, JSON.stringify(compiled.errors)).toBe(true);
    expect(compiled.result.applicability_counts.REQUIRED).toBe(1);
    const required = compiled.result.items.find(item => item.applicability === "REQUIRED")!;
    expect(required.capability).toBe("unit_behavior");
    if (verdict === "absent" || verdict === "unavailable") expect(required.tool_gap).not.toBeNull();
    else expect(required.resolved_bindings).toEqual([{ binding_id: binding.id, tool: binding.tool, gate: binding.gate, gate_def: binding.gate_def }]);
    const processes: SpawnOutcome[] = [];
    const result = await runPlanRun(dir, { ...input, executionId: execution.result.execution_id }, {
      spawnFn: (command, options) => { const output = defaultSpawn(command, options); processes.push(output); return output; },
    });
    expect(result.result.obligations_total).toBe(1);
    expect(result.errors.some(error => error.code === "PLAN_NO_REQUIRED_OBLIGATIONS")).toBe(false);
    if (verdict === "absent" || verdict === "unavailable") {
      expect(result.ok).toBe(false);
      expect(result.result.passed).toBe(0);
      expect(result.result.rows.every(row => row.verdict !== "passed")).toBe(true);
      if (verdict === "absent") expect(result.result.recorded).toBe(0);
      expect(processes).toHaveLength(0);
    } else {
      expect(processes).toHaveLength(1);
      expect(processes[0]!.status).toBe(verdict === "passed" ? 0 : 1);
      expect(JSON.parse(processes[0]!.stdout).testResults[0].assertionResults).toHaveLength(1);
      expect(result.ok, JSON.stringify(result.errors)).toBe(verdict === "passed");
      expect(result.result.rows[0]).toMatchObject({ capability: "unit_behavior", binding_id: binding.id, gate: "BUILD", verdict });
      expect(result.result.recorded).toBe(1);
      const grn = result.result.rows[0]!.grn;
      const run = JSON.parse(readFileSync(join(dir, `.pomaster/evidence/runs/${grn}.json`), "utf8"));
      expect(run.execution_id).toBe(execution.result.execution_id);
      expect(run.gate_result.result).toMatchObject({ subject_id: taskRef, tool: binding.tool, verdict });
    }
    const tx = JSON.parse(readFileSync(join(dir, `.pomaster/plan/${planned.result!.round}/units.tx.json`), "utf8")) as Transaction;
    for (const op of tx.ops) if (op.op === "record_claim") {
      const claim = JSON.parse(readFileSync(join(dir, `.pomaster/evidence/claims/${op.claim.clm}.json`), "utf8"));
      expect(claim.verification.verdict).toBe("UNVERIFIED");
      expect(claim.evidence_refs).toEqual([]);
    }
  }, 60000);

  it.each(["committed", "interrupted", "missing-projection"])("legacy missing requirements demand a new signed round without rewriting history (%s)", async projection => {
    const round = await confirmedRound();
    expect((await runPlanScenarios(dir)).ok).toBe(true);
    const txPath = join(dir, `.pomaster/plan/${round}/units.tx.json`);
    const tx = JSON.parse(readFileSync(txPath, "utf8")) as Transaction;
    for (const op of tx.ops) if (op.op === "upsert_object") {
      const acceptance = op.envelope.payload.acceptance as { requires?: string[] }[];
      for (const item of acceptance) delete item.requires;
    }
    writeFileSync(txPath, JSON.stringify(tx));
    const planPath = join(dir, `.pomaster/plan/${round}/plan.json`);
    if (projection === "interrupted") { const plan = JSON.parse(readFileSync(planPath, "utf8")); plan.committed = false; writeFileSync(planPath, JSON.stringify(plan)); }
    if (projection === "missing-projection") rmSync(planPath);
    const store = await loadStoreReadOnly(dir);
    const before = stateBytes();
    const recordPaths = tx.ops.flatMap(op => op.op === "record_claim" ? [join(dir, `.pomaster/evidence/claims/${op.claim.clm}.json`)] : op.op === "upsert_object" ? [join(dir, ".pomaster/truth/objects/task-object", `${op.envelope.id.toLowerCase().replaceAll("_", "-")}.json`)] : []);
    const recordBytes = recordPaths.map(path => readFileSync(path));
    const retainedBytes = readFileSync(txPath), planBytes = existsSync(planPath) ? readFileSync(planPath) : null;
    await expect(verifyScenarioConstruction(dir, tx)).rejects.toMatchObject({ details: { reason_code: "PLANNER_ADOPTION_REBUILD_REQUIRED" }, hint: expect.stringContaining("new intake revision") });
    await expect(applyTransaction(store, tx)).rejects.toMatchObject({ details: { reason_code: "PLANNER_ADOPTION_REBUILD_REQUIRED" } });
    const replay = await runPlanScenarios(dir);
    expect(replay.errors[0]?.code).toBe("PLANNER_ADOPTION_REBUILD_REQUIRED");
    expect(replay.errors[0]?.hint).toContain("Owner signature");
    expect(stateBytes()).toEqual(before);
    expect(readFileSync(txPath)).toEqual(retainedBytes);
    expect(existsSync(planPath) ? readFileSync(planPath) : null).toEqual(planBytes);
    expect(recordPaths.map(path => readFileSync(path))).toEqual(recordBytes);
  });

  it.each(["missing", "bytes", "identity", "membership", "unsuitable", "malformed"])("rejects %s catalog adoption before permit/task/claim/relation writes", async fault => {
    await confirmedRound();
    const path = join(catalogFixture.root, archetypePath);
    if (fault === "missing") rmSync(path, { force: true });
    else if (fault === "bytes") writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
    else if (fault === "malformed") writeFileSync(path, "{");
    else if (fault === "membership") {
      const lockPath = join(catalogFixture.root, "catalog-lock.draft.json"), lock = JSON.parse(readFileSync(lockPath, "utf8"));
      lock.controlled_children.required = lock.controlled_children.required.filter((entry: string) => entry !== archetypePath);
      writeFileSync(lockPath, JSON.stringify(lock));
    } else {
      const model = JSON.parse(readFileSync(path, "utf8"));
      if (fault === "identity") model.id = "RUNTIME_ARCHETYPE.ENVIRONMENT_PARITY";
      else model.instantiation.truth_kind = "capability";
      writeFileSync(path, JSON.stringify(model));
      const lockPath = join(catalogFixture.root, "catalog-lock.draft.json"), lock = JSON.parse(readFileSync(lockPath, "utf8"));
      lock.entries.find((entry: { path: string }) => entry.path === archetypePath).content_sha256 = sha256OfUtf8(readFileSync(path, "utf8"));
      writeFileSync(lockPath, JSON.stringify(lock));
    }
    const before = stateBytes();
    const result = await runPlanScenarios(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.hint).toBeTruthy();
    expect(stateBytes()).toEqual(before);
  });

  it.each(["missing-edge", "forged-edge", "binding-bytes", "declared-binding", "legacy"])("replay rejects %s without duplicate or repair effects", async fault => {
    const round = await confirmedRound();
    expect((await runPlanScenarios(dir)).ok).toBe(true);
    const relationPath = join(dir, ".pomaster/state/relations.jsonl");
    if (fault === "missing-edge") rmSync(relationPath);
    else if (fault === "forged-edge") {
      const edges = readFileSync(relationPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
      edges[0].provenance.source_ref = "forged";
      writeFileSync(relationPath, edges.map(edge => JSON.stringify(edge)).join("\n") + "\n");
    } else if (fault === "binding-bytes") {
      const path = join(dir, `.pomaster/plan/${round}/scenarios.json`);
      writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
    } else {
      const path = join(dir, `.pomaster/plan/${round}/units.tx.json`), tx = JSON.parse(readFileSync(path, "utf8"));
      if (fault === "legacy") {
        for (const op of tx.ops) if (op.op === "upsert_object") delete op.envelope.keyBindings;
      } else tx.ops[0].envelope.keyBindings.artifact[0].value = "owner.pub";
      writeFileSync(path, JSON.stringify(tx));
    }
    const before = stateBytes();
    const result = await runPlanScenarios(dir);
    expect(result.ok).toBe(false);
    expect(stateBytes()).toEqual(before);
  });

  it("生效确认单 + 确认规格：场景候选 + scaffold 契约 + 单元落成 TASK（compact 落地），重跑 NO_CHANGE", async () => {
    const id = await confirmedRound("style: compact\n");
    const outcome = await runPlanScenarios(dir);
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const result = outcome.result as NonNullable<typeof outcome.result>;
    expect(result).toMatchObject({ sheet: id, change: "CREATED", style_landed: true });
    // 单元分母：契约 1 + 每实体 db/be/fe（fixture 1 个实体）
    expect(result.units.length).toBe(4);
    expect(result.units.map((unit) => unit.id)).toContain(`TASK.KO_ORDERS_R3.CONTRACT`);
    for (const lane of ["DB", "BE", "FE"] as const) {
      expect(result.units.some((unit) => unit.id === `TASK.KO_ORDERS_R3.${lane}.ORDERS`)).toBe(true);
    }
    expect(result.claims.length).toBe(result.units.length);
    expect(result.applied_at_seq).toBeGreaterThan(0);

    // TASK 对象在座：索引行有轴，正文文件有 payload（lane/style/round）
    const index = JSON.parse(readFileSync(join(dir, ".pomaster", "state", "truth-index.json"), "utf8")) as { objects: { id: string; axes: { lifecycle: string } }[] };
    const beRow = index.objects.find((entry) => entry.id === `TASK.KO_ORDERS_R3.BE.ORDERS`);
    expect(beRow).toBeDefined();
    expect(beRow?.axes.lifecycle).toBe("PROPOSED");
    const body = JSON.parse(readFileSync(join(dir, ".pomaster", "truth", "objects", "task-object", "task.ko-orders-r3.be.orders.json"), "utf8")) as { payload: { lane?: string; style?: string; round?: string; acceptance: { criterion: string; claim: string }[] } };
    expect(body.payload).toMatchObject({ lane: "be", style: "compact", round: id });
    expect(body.payload.acceptance[0]?.claim).toMatch(/^CLM-\d{4}$/);

    // journal PLAN_COMPILED + plan.json 已提交
    expect(readFileSync(journalFilePath(dir), "utf8")).toContain("PLAN_COMPILED");
    const plan = JSON.parse(readFileSync(join(dir, ".pomaster", "plan", id, "plan.json"), "utf8")) as { committed: boolean; applied_at_seq: number; style: { landed: boolean; choice: string } };
    expect(plan.committed).toBe(true);
    expect(plan.style).toMatchObject({ choice: "compact", landed: true });

    // 重跑：指纹一致 + 已提交 → NO_CHANGE 零写入
    const rerun = await runPlanScenarios(dir);
    expect(rerun.ok).toBe(true);
    expect(rerun.result).toMatchObject({ change: "NO_CHANGE", applied_at_seq: plan.applied_at_seq });
  });

  it("checks the enrolled kickoff signature even without an active worker and on NO_CHANGE", async () => {
    const round = await confirmedRound();
    const current = JSON.parse(readFileSync(join(dir, ".pomaster/kickoff/current.json"), "utf8")) as { signoff: string };
    const signature = join(dir, ".pomaster/trust/requests", `${current.signoff}.json.sig`), bytes = readFileSync(signature);
    rmSync(signature);
    expect((await runPlanScenarios(dir)).ok).toBe(false);
    writeFileSync(signature, bytes);
    expect((await runPlanScenarios(dir)).ok).toBe(true);
    const transaction = JSON.parse(readFileSync(join(dir, ".pomaster/plan", round, "units.tx.json"), "utf8")) as Transaction;
    expect(transaction.plannerConstruction?.signoffRef).toBe(current.signoff);
    const store = await loadStoreReadOnly(dir), before = readFileSync(journalFilePath(dir), "utf8");
    expect((await applyTransaction(store, transaction)).shortCircuited).toBe(true);
    expect(readFileSync(journalFilePath(dir), "utf8")).toBe(before);
    rmSync(signature);
    expect((await runPlanScenarios(dir)).ok).toBe(false);
  });
  it("recovers an interrupted projection from the actual committed transaction without new claims or permits", async () => {
    const round = await confirmedRound();
    expect((await runPlanScenarios(dir)).ok).toBe(true);
    const planPath = join(dir, ".pomaster/plan", round, "plan.json"), plan = JSON.parse(readFileSync(planPath, "utf8"));
    plan.committed = false; plan.applied_at_seq = null; writeFileSync(planPath, JSON.stringify(plan));
    const before = readFileSync(journalFilePath(dir), "utf8"), permits = readFileSync(join(dir, ".pomaster/state/permits.json"), "utf8");
    expect((await runPlanScenarios(dir)).ok).toBe(true);
    expect(readFileSync(journalFilePath(dir), "utf8")).toBe(before);
    expect(readFileSync(join(dir, ".pomaster/state/permits.json"), "utf8")).toBe(permits);
    const tx = JSON.parse(readFileSync(join(dir, ".pomaster/plan", round, "units.tx.json"), "utf8")) as Transaction;
    const forged = JSON.parse(JSON.stringify(tx).replace(/CLM-([0-9]+)/g, (_, seq: string) => `CLM-${Number(seq) + 100_000}`)) as Transaction;
    await expect(verifyScenarioConstruction(dir, forged)).rejects.toThrow("Claim seed differs");
    const claim = tx.ops.find(op => op.op === "record_claim");
    expect(claim?.op).toBe("record_claim");
    if (claim?.op !== "record_claim") throw new Error("Missing actual committed claim");
    rmSync(join(dir, ".pomaster/evidence/claims", `${claim.claim.clm}.json`));
    expect((await runPlanScenarios(dir)).ok).toBe(false);
    expect(readFileSync(journalFilePath(dir), "utf8")).toBe(before);
  });
  it("does not extend the signed finite kickoff budget through unsigned current metadata", async () => {
    await confirmedRound();
    const path = join(dir, ".pomaster/kickoff/current.json"), current = JSON.parse(readFileSync(path, "utf8"));
    current.valid_until = new Date(Date.parse(current.valid_until) + 100 * 86_400_000).toISOString();
    writeFileSync(path, JSON.stringify(current));
    expect((await runPlanScenarios(dir)).ok).toBe(false);
  });
  it("active unrelated worker cannot lend permissions: finite signed runtime-instance construction",  async () => {
    const round = await confirmedRound();
    expect((await runExecutionBegin(dir, { role: "implementer", runtime: "script", identityKind: "script", executionId: "AGX-2026-009010" })).ok).toBe(true);
    const planned = await runPlanScenarios(dir);
    expect(planned.ok, JSON.stringify(planned.errors)).toBe(true);
    const journal = readFileSync(journalFilePath(dir), "utf8").trim().split("\n").map(line => JSON.parse(line));
    const proofs = journal.filter(event => event.type === "PLANNER_INSTANCE_ADMITTED");
    expect(proofs).toHaveLength(1);
    expect(proofs[0].adoption).toBe("ARCHETYPE.GOVERNANCE.TASK_UNIT");
    expect(proofs[0].catalog_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(proofs[0].subject_ids).toEqual(expect.arrayContaining(planned.result!.units.map(unit => unit.id)));
    expect(journal.some(event => event.type === "NEW_ENTITY_CHECKED" && planned.result?.units.some(unit => unit.id === event.id))).toBe(false);
    const permit = JSON.parse(readFileSync(join(dir, ".pomaster", "state", "permits.json"), "utf8")).permits.find((entry: { change_ref: string }) => entry.change_ref === `.pomaster/kickoff/${round}/sheet.json`);
    expect(permit).toBeDefined();
    expect(permit.expires_at_seq - permit.issued_at_seq).toBeLessThanOrEqual(3);
    expect(permit.scope.subject_ids).toEqual(expect.arrayContaining(planned.result!.units.map(unit => unit.id)));
    expect(permit.scope.subject_ids).not.toContain("TASK.UNRELATED");
    const tx = JSON.parse(readFileSync(join(dir, ".pomaster", "plan", round, "units.tx.json"), "utf8"));
    expect(tx.executionId).toBeUndefined();
    expect(tx.permitRef).toBeUndefined();
    expect(tx.newEntity).toBeUndefined();
    expect(tx.plannerConstruction.signoffRef).toBe(proofs[0].signoff_ref);
    const journalBefore = readFileSync(journalFilePath(dir));
    const forged = structuredClone(tx) as Transaction;
    const first = forged.ops[0];
    if (first?.op !== "upsert_object") throw new Error("Missing deterministic task");
    const unauthorized = { ...forged, ops: [{ ...first, envelope: { ...first.envelope, id: "TASK.UNRELATED" as typeof first.envelope.id } }, ...forged.ops.slice(1)] };
    await expect(applyTransaction(loadStoreReadOnly(dir), unauthorized)).rejects.toMatchObject({ code: "SCHEMA_INVALID", details: { reason_code: "PLANNER_CONSTRUCTION_INVALID" } });
    expect(readFileSync(journalFilePath(dir))).toEqual(journalBefore);
    expect((await runPlanScenarios(dir)).result?.change).toBe("NO_CHANGE");
    expect(readFileSync(journalFilePath(dir))).toEqual(journalBefore);
  });

  it("C03 direct kickoff ignores synthetic TTY and human label without a content-bound signature", async () => {
    await readyIntake();
    enrollOwner();
    const { id } = draft();
    answer(id);
    expect(draft().ready).toBe(true);
    const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      const rejected = await runKickoffConfirm(dir, {}, bareMachine);
      expect(rejected.errors[0]?.code).toBe("TRUST_SIGNOFF_REQUIRED");
      expect(existsSync(join(dir, ".pomaster", "kickoff", "current.json"))).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(process.stdout, "isTTY", descriptor);
      else Reflect.deleteProperty(process.stdout, "isTTY");
    }
  });

  it("没选样式（standard）：规划照常，plan.json 记 standard 且无需 shell 补丁", async () => {
    const id = await confirmedRound();
    const outcome = await runPlanScenarios(dir);
    expect(outcome.ok, JSON.stringify(outcome.errors)).toBe(true);
    const plan = JSON.parse(readFileSync(join(dir, ".pomaster", "plan", id, "plan.json"), "utf8")) as { style: { choice: string; landed: boolean } };
    expect(plan.style).toMatchObject({ choice: "standard", landed: true });
    expect(outcome.warnings.some((warning) => warning.code === "PLAN_STYLE_NOT_LANDED")).toBe(false);
  });

  it("没有生效确认单：拒绝（PLAN_KICKOFF_NOT_IN_FORCE）", async () => {
    expect((await runPlanScenarios(dir)).errors[0]?.code).toBe("PLAN_KICKOFF_NOT_IN_FORCE");
  });

  it("确认单过期或字节漂移：拒绝（PLAN_KICKOFF_NOT_IN_FORCE），签过的轮次不授权新规划", async () => {
    const id = await confirmedRound();
    const currentPath = join(dir, ".pomaster", "kickoff", "current.json");
    const current = JSON.parse(readFileSync(currentPath, "utf8")) as { valid_until: string };
    writeFileSync(currentPath, `${JSON.stringify({ ...current, valid_until: "2026-01-01T00:00:00.000Z" }, null, 2)}\n`, "utf8");
    expect((await runPlanScenarios(dir)).errors[0]?.code).toBe("PLAN_KICKOFF_NOT_IN_FORCE");

    // 恢复有效期，改 sheet 字节（模拟确认后又改了材料/choices）
    writeFileSync(currentPath, `${JSON.stringify({ ...current }, null, 2)}\n`, "utf8");
    const sheetPath = join(kickoffDir(id), "sheet.json");
    writeFileSync(sheetPath, `${readFileSync(sheetPath, "utf8")}\n`, "utf8");
    expect((await runPlanScenarios(dir)).errors[0]?.code).toBe("PLAN_KICKOFF_NOT_IN_FORCE");
  });

  it("单元任务已在座且内容不同：PLAN_UNIT_DRIFT，不静默改任务", async () => {
    const id = await confirmedRound();
    expect((await runPlanScenarios(dir)).ok).toBe(true);
    // 手改在座任务意图（模拟任务已开工被人改过）+ 抹掉 plan.json 强制重建
    const bodyPath = join(dir, ".pomaster", "truth", "objects", "task-object", "task.ko-orders-r3.be.orders.json");
    expect(existsSync(bodyPath)).toBe(true);
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as { payload: { intent: string } };
    body.payload.intent = `${body.payload.intent}（开工后被手工调整过）`;
    writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    rmSync(join(dir, ".pomaster", "plan", id), { recursive: true, force: true });
    const outcome = await runPlanScenarios(dir);
    expect(outcome.errors[0]?.code).toBe("PLAN_UNIT_DRIFT");
    expect(outcome.errors[0]?.message).toContain(`TASK.KO_ORDERS_R3.BE.ORDERS`);
  });
});
