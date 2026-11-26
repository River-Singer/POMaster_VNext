import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, beginExecution, createStore, issuePermit, PLAN_CAPABILITY_WORDS, type GovernedId } from "@pomaster/kernel";
import { TRUSTED_BINDING_ADAPTERS, type BindingGateDeps, type JvmReportIO, type SpawnOutcome, type ToolBindingRecord } from "@pomaster/gauntlet-lite";
import { toolBindingSchema } from "@pomaster/schemas";
import { runInit, runPlanCompile, runPlanRun, runToolsValidate } from "@pomaster/cli";
import { planCohortKey } from "../src/plan-runner.js";
import { loadToolBindingRegistry } from "../src/tools.js";

const TASK = "TASK.JVM.PLAN";
const JAVA = "src/main/java/com/acme/Calc.java";
const PIT_REPORT = "target/pit-reports/mutations.xml";
const ARCH_REPORT = "target/surefire-reports/TEST-com.acme.LayerTest.xml";
const POM = '<project><dependencies><dependency><groupId>com.tngtech.archunit</groupId><artifactId>archunit-junit5</artifactId><version>1.3.0</version></dependency></dependencies></project>';
const PIT_XML = '<mutations><mutation detected="true" status="KILLED" numberOfTestsRun="1"><sourceFile>Calc.java</sourceFile><mutatedClass>com.acme.Calc</mutatedClass><lineNumber>12</lineNumber><mutator>MathMutator</mutator></mutation></mutations>';
const ARCH_XML = '<testsuite tests="1" failures="0" errors="0"><testcase name="layers" classname="com.acme.LayerTest"/></testsuite>';
const FACES = ["behavior=present:changed Java behavior", "dependency=present:architecture constraints"];
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "pomaster-plan-jvm-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function binding(kind: "pit" | "archunit" | "build"): ToolBindingRecord {
  const adapter = kind === "pit" ? "mutation" : kind === "archunit" ? "architecture" : "build";
  const gate = kind === "pit" ? "MUTATION" : kind === "archunit" ? "ARCHITECTURE" : "BUILD";
  return {
    id: `project.jvm.${kind}`, source: "project", transport: "cli",
    adapter_ref: `builtin.gauntlet-lite.${adapter}`,
    tool: `gauntlet:${kind === "build" ? "maven-surefire" : kind}`,
    tool_version_anchor: "3.9.6", gate, gate_def: `POLICY.GATE.${gate}@0.1.0`,
    metric_dialect: kind === "pit" ? "mutation:pit_changed_code" : kind === "archunit" ? "arch:archunit_junit" : "test:assertion_count",
    // Keep the reviewed native declarations; mutation_check is an acceptance obligation.
    capabilities: [kind === "archunit" ? "dependency_check" : "unit_behavior"],
    execution: { command: "mvn -B", cwd: "backend", timeout_ms: 1700 },
    report_contract: {
      format: kind === "pit" ? "pit-xml" : "surefire-xml",
      parser_ref: `builtin.gauntlet-lite.${adapter}/${kind === "pit" ? "pit-xml" : kind === "archunit" ? "archunit-junit" : "surefire-xml"}`,
      parser_version: "0.1.0",
    },
    environment: { requires: false },
  };
}

async function seed(requires: readonly string[] = ["mutation_check", "dependency_check"], bindings = [binding("pit"), binding("archunit")], scenarioRef?: string) {
  mkdirSync(join(root, "backend", "src/main/java/com/acme"), { recursive: true });
  // Registry detection currently reads project-root facts; native prepare reads binding.cwd.
  writeFileSync(join(root, "pom.xml"), POM);
  writeFileSync(join(root, "backend", "pom.xml"), POM);
  writeFileSync(join(root, "backend", JAVA), "package com.acme; class Calc {}\n");
  writeFileSync(join(root, "backend", "mutation-gate.json"), JSON.stringify({ runner: "pit", command: "mvn -B", pitVersion: "1.16.1", changedFiles: [JAVA] }));
  writeFileSync(join(root, "backend", "architecture-gate.json"), JSON.stringify({ tool: "archunit", tests: ["com.acme.LayerTest"], archunitVersion: "1.3.0" }));
  expect((await runInit(root)).ok).toBe(true);
  mkdirSync(join(root, ".pomaster", "tools"), { recursive: true });
  writeFileSync(join(root, ".pomaster", "tools", "bindings.json"), JSON.stringify({ version: 1, bindings }));
  const store = await createStore(root);
  await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: {
    id: TASK, kind: "task_object", axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "JVM 计划绑定集成", authority: { owner: "BOOTSTRAP_OWNER", delegates: [] }, origin: "natural",
    payload: { intent: "Run native JVM plan obligations", class_scan_result: { scope: "backend/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-JVM" },
      acceptance: [{ criterion: "Changed-code mutation and architecture constraints", claim: null, requires,
        ...(scenarioRef === undefined ? {} : { scenarios: [{ scenario_ref: scenarioRef,
          precondition: "Changed JVM code", interaction: "Run declared Maven gates",
          state_dimensions: ["module=backend"], expected_observation: "Changed mutants killed and architecture rules satisfied",
          runtime_confirmation_required: false }] }),
      }] },
  } as never }] });
  const permit = await issuePermit(store, { subjectIds: [TASK as GovernedId], requestedBy: { actorType: "agent", actor: "jvm-plan-test", selfAttested: true } });
  return (await beginExecution(store, { role: "orchestrator", runtime: "claude-code", identityKind: "interactive", taskId: TASK, permitIds: [permit.permitRef], startedAt: "2026-11-11T00:00:00.000Z" })).execution_id;
}

function harness(options: { pit?: string | null; arch?: string | null; stale?: boolean; invalidateFails?: boolean; run?: Partial<SpawnOutcome>; version?: string } = {}) {
  const files = new Map<string, string>();
  const calls: { command: string; cwd: string; timeoutMs: number }[] = [];
  const removed: string[] = [];
  const pitPath = resolve(root, "backend", PIT_REPORT);
  const archPath = resolve(root, "backend", ARCH_REPORT);
  if (options.stale) { files.set(pitPath, PIT_XML); files.set(archPath, ARCH_XML); }
  const reportIO: JvmReportIO = {
    readTextFile: path => files.get(path) ?? null,
    fileExists: path => files.has(path),
    removeFile: path => { removed.push(path); if (options.invalidateFails) throw new Error("EBUSY"); files.delete(path); },
  };
  const deps: BindingGateDeps = {
    executableProbe: () => "injected-maven-or-java",
    jvmReportIO: reportIO,
    spawnFn: (command, optionsForSpawn) => {
      calls.push({ command, ...optionsForSpawn });
      if (command.includes("--version")) return { status: 0, stdout: options.version ?? "Apache Maven 3.9.6", stderr: "", error: null, externalMs: 1 };
      const mutation = command.includes("pitest-maven");
      const xml = mutation ? (options.pit === undefined ? PIT_XML : options.pit) : (options.arch === undefined ? ARCH_XML : options.arch);
      if (xml !== null) files.set(resolve(optionsForSpawn.cwd, mutation ? PIT_REPORT : ARCH_REPORT), xml);
      return { status: 0, stdout: "not report evidence", stderr: "", error: null, externalMs: 1, ...options.run };
    },
  };
  return { deps, calls, removed, files, pitPath, archPath };
}
function input(executionId: string, profile?: string) {
  return { taskRef: TASK, executionId, changed: [`backend/${JAVA}`], faces: FACES, ...(profile === undefined ? {} : { profile }) };
}
function grnDoc(grn: string) {
  return JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "runs", `${grn}.json`), "utf8")) as {
    execution_id: string; source_snapshot: { window: { state: string } };
    gate_result: { result: { subject_id: string; gate: string; gate_def: string; tool_version: string; metric_dialect: string; verdict: string; scope: { note: string } } };
  };
}

// Only external process/report IO is injected. Schema loader, compiler, native judges,
// runner, source snapshots and kernel GRN writer are the production entrypoints.
describe("BE-2 schema registration -> compile -> native JVM plan run", () => {
  it("schema capability and trusted adapter closures match their production authorities", () => {
    const schema = toolBindingSchema as unknown as { definitions: { capability_word: { enum: string[] }; binding: { properties: { adapter_ref: { enum: string[] } } } } };
    expect(schema.definitions.capability_word.enum).toEqual([...PLAN_CAPABILITY_WORDS]);
    expect([...schema.definitions.binding.properties.adapter_ref.enum].sort()).toEqual(Object.keys(TRUSTED_BINDING_ADAPTERS).sort());
  });

  it("registers exact native contracts and HARDENING runs attributed PIT + ArchUnit GRNs with pins/module cwd", async () => {
    const executionId = await seed();
    expect(loadToolBindingRegistry(root).ok).toBe(true);
    for (const id of ["project.jvm.pit", "project.jvm.archunit"]) {
      const registration = await runToolsValidate(root, { id });
      expect(registration.ok).toBe(true);
      expect(registration.result.states).toMatchObject({ registered: true, validated: true });
    }
    const compiled = await runPlanCompile(root, input(executionId, "HARDENING"));
    expect(compiled.errors).toEqual([]);
    expect(compiled.result.items.filter(item => item.applicability === "REQUIRED").map(item => [item.capability, item.resolved_bindings.map(b => b.gate)])).toEqual([
      ["dependency_check", ["ARCHITECTURE"]], ["mutation_check", ["MUTATION"]],
    ]);
    const h = harness();
    const result = await runPlanRun(root, input(executionId, "HARDENING"), h.deps);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({ obligations_total: 2, recorded: 2, passed: 2 });
    expect(h.calls).toHaveLength(4);
    expect(h.calls.every(call => call.cwd === join(root, "backend") && call.timeoutMs === 1700)).toBe(true);
    expect(h.calls.filter(call => call.command.includes("--version")).map(call => call.command)).toEqual(["mvn --version", "mvn --version"]);
    expect(h.calls.find(call => call.command.includes("pitest-maven"))?.command).toContain("org.pitest:pitest-maven:1.16.1:mutationCoverage");
    expect(h.calls.find(call => call.command.includes("pitest-maven"))?.command).toContain("com.acme.Calc");
    expect(h.calls.find(call => call.command.includes("-Dtest"))?.command).toContain('-Dtest="com.acme.LayerTest"');
    for (const row of result.result.rows) {
      expect(row.grn).toMatch(/^GRN-\d+$/);
      const doc = grnDoc(row.grn);
      expect(doc.execution_id).toBe(executionId);
      expect(doc.source_snapshot.window.state).toBe("fresh");
      expect(doc.gate_result.result).toMatchObject({ subject_id: TASK, gate: row.gate, gate_def: `POLICY.GATE.${row.gate}@0.1.0`, tool_version: "3.9.6", verdict: "passed" });
      expect(doc.gate_result.result.scope.note.split("；")).toContain(`binding_id=${row.binding_id}`);
      expect(doc.gate_result.result.scope.note).toContain(`acceptance_ref=${row.acceptance_ref}`);
      expect(doc.gate_result.result.scope.note).toContain(`inputs_fingerprint=${compiled.result.inputs_fingerprint}`);
      expect(planCohortKey(row.acceptance_ref, row.scenario_ref, row.gate)).toBe(`${TASK}#acceptance[0]\0${row.gate}`);
    }
    const mutation = result.result.rows.find(row => row.gate === "MUTATION")!;
    expect(grnDoc(mutation.grn).gate_result.result.scope.note).toContain("1.16.1");
    const replay = await runPlanRun(root, input(executionId, "HARDENING"), h.deps);
    expect(replay.result.rows.map(row => row.grn)).toEqual(result.result.rows.map(row => row.grn));
    expect(h.calls).toHaveLength(4);
  });

  it("qualifies native GRNs by acceptance + scenario + gate in machine-consumer cohort/replay", async () => {
    const executionId = await seed(undefined, undefined, "changed-jvm");
    const h = harness();
    const result = await runPlanRun(root, input(executionId, "HARDENING"), h.deps);
    expect(result.errors).toEqual([]);
    expect(result.result).toMatchObject({ recorded: 2, passed: 2 });
    expect(result.result.rows.map(row => planCohortKey(row.acceptance_ref, row.scenario_ref, row.gate))).toEqual([
      `${TASK}#acceptance[0]\0changed-jvm\0ARCHITECTURE`, `${TASK}#acceptance[0]\0changed-jvm\0MUTATION`,
    ]);
    for (const row of result.result.rows) {
      const doc = grnDoc(row.grn);
      expect(doc.execution_id).toBe(executionId);
      expect(doc.gate_result.result.subject_id).toBe(TASK);
      expect(doc.gate_result.result.scope.note.split("；")).toContain("scenario_ref=changed-jvm");
      expect(doc.gate_result.result.scope.note.split("；")).toContain(`binding_id=${row.binding_id}`);
    }
    const replay = await runPlanRun(root, input(executionId, "HARDENING"), h.deps);
    expect(replay.result.rows.map(row => row.grn)).toEqual(result.result.rows.map(row => row.grn));
    expect(h.calls).toHaveLength(4);
  });

  it.each(["LIGHT", "STANDARD", undefined])("ordinary unit_behavior at %s has BUILD only, not a missing MUTATION obligation", async profile => {
    const executionId = await seed(["unit_behavior"], [binding("build"), binding("pit")]);
    const compiled = await runPlanCompile(root, input(executionId, profile));
    expect(compiled.ok).toBe(true);
    const required = compiled.result.items.filter(item => item.applicability === "REQUIRED");
    expect(required.map(item => item.capability)).toEqual(["unit_behavior"]);
    expect(required[0]?.resolved_bindings.map(b => b.gate)).toEqual(["BUILD"]);
    expect(required[0]?.tool_gap ?? "").not.toContain("MUTATION");
    const h = harness();
    const result = await runPlanRun(root, input(executionId, profile), h.deps);
    expect(result.result.obligations_total).toBe(1);
    expect(result.errors.some(error => error.code === "PLAN_BINDING_AMBIGUOUS")).toBe(false);
    expect(result.result.rows.map(row => row.gate)).toEqual(["BUILD"]);
    expect(h.calls.some(call => call.command.includes("pitest-maven"))).toBe(false);
  });

  it.each(["LIGHT", "STANDARD", undefined])("explicit mutation_check at %s retains required non-green policy_skip, never forced HARDENING", async profile => {
    const executionId = await seed(["mutation_check"], [binding("pit")]);
    const h = harness();
    const result = await runPlanRun(root, input(executionId, profile), h.deps);
    expect(result.ok).toBe(false);
    expect(result.result).toMatchObject({ obligations_total: 1, recorded: 1, passed: 0 });
    expect(result.result.rows[0]?.verdict).toBe("not_run");
    expect(grnDoc(result.result.rows[0]!.grn).gate_result.result.metric_dialect).toBe("mutation:policy_skip");
    expect(h.calls).toEqual([]);
  });

  it("rejects an unknown profile before native process or GRN creation", async () => {
    const executionId = await seed();
    const h = harness();
    const result = await runPlanRun(root, input(executionId, "UNKNOWN"), h.deps);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(result.result.recorded).toBe(0);
    expect(h.calls).toEqual([]);
    expect(existsSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"))).toBe(false);
  });

  it("missing required mutation binding cannot be covered by a native BUILD binding", async () => {
    const executionId = await seed(["mutation_check"], [binding("build")]);
    const compiled = await runPlanCompile(root, input(executionId, "HARDENING"));
    expect(compiled.result.items.find(item => item.capability === "mutation_check")?.tool_gap).toContain("MUTATION");
    const h = harness();
    const result = await runPlanRun(root, input(executionId, "HARDENING"), h.deps);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("PLAN_BINDING_AMBIGUOUS");
    expect(h.calls).toEqual([]);
  });

  it.each([
    { pit: null, arch: null },
    { stale: true, pit: null, arch: null },
    { pit: "<mutations>", arch: "<testsuite>" },
    { pit: PIT_XML.replace("Calc.java", "Other.java"), arch: ARCH_XML.replace("com.acme.LayerTest", "com.acme.BusinessTest") },
    { run: { status: 1, error: null } },
    { run: { status: null, error: "ETIMEDOUT" } },
    { version: "Java version 21.0.1" },
    { version: "Apache Maven 3.8.8" },
    { stale: true, invalidateFails: true },
  ])("missing/stale/malformed/foreign/failed reports cannot green required HARDENING evidence: %o", async options => {
    const executionId = await seed();
    const h = harness(options);
    const result = await runPlanRun(root, input(executionId, "HARDENING"), h.deps);
    expect(result.ok).toBe(false);
    expect(result.result).toMatchObject({ obligations_total: 2, recorded: 2, passed: 0 });
    expect(result.result.rows.map(row => row.verdict)).toEqual(options.version === "Apache Maven 3.8.8" ? ["warning", "warning"] : ["not_run", "not_run"]);
    if (options.stale) expect(h.removed).toEqual([h.archPath, h.pitPath]);
  });

  it.each([0, 1])("native failed reports remain failed with Maven exit %s", async status => {
    const executionId = await seed();
    const h = harness({
      pit: PIT_XML.replace('detected="true" status="KILLED"', 'detected="false" status="SURVIVED"'),
      arch: ARCH_XML.replace('failures="0"', 'failures="1"').replace('/></testsuite>', '><failure message="layer violation"/></testcase></testsuite>'),
      run: { status },
    });
    const result = await runPlanRun(root, input(executionId, "HARDENING"), h.deps);
    expect(result.ok).toBe(false);
    expect(result.result).toMatchObject({ recorded: 2, passed: 0 });
    expect(result.result.rows.map(row => row.verdict)).toEqual(["failed", "failed"]);
  });

  it.each([
    { adapter_ref: "builtin.gauntlet-lite.unregistered" },
    { report_contract: { ...binding("pit").report_contract, parser_ref: "project.parser/custom" } },
    { gate: "BUILD", gate_def: "POLICY.GATE.BUILD@0.1.0" },
  ])("unrecognized refs and native contract drift stay non-green: %o", async patch => {
    const executionId = await seed(["mutation_check"], [{ ...binding("pit"), ...patch }]);
    const h = harness();
    const result = await runPlanRun(root, input(executionId, "HARDENING"), h.deps);
    expect(result.ok).toBe(false);
    expect(result.result.passed).toBe(0);
    expect(h.calls).toEqual([]);
    expect(existsSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"))).toBe(patch.report_contract !== undefined);
  });
});
