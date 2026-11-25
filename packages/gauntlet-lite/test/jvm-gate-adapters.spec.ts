import { Ajv } from "ajv";
import { createRequire } from "node:module";
const addFormats = createRequire(import.meta.url)("ajv-formats") as (ajv: Ajv) => void;
import { describe, expect, it, vi } from "vitest";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { gateResultSchema } from "@pomaster/schemas";
import {
  buildPitCommand, createArchitectureAdapter, createMutationAdapter, parsePitReport, summarizeMutants,
  bindingAdapterContractMatches, runBindingGate,
  toGateResultJson, type GatePolicy, type JvmReportIO, type SpawnFn, type SpawnOutcome, type ToolBindingRecord,
} from "@pomaster/gauntlet-lite";
import { fakeFacts } from "./helpers.js";
import { platformDetectorFacts } from "../src/detectors.js";
import { platformJvmReportIO, runJvmMavenReports } from "../src/jvm-report.js";
import { runArchUnitLeg } from "../src/archunit-leg.js";
import { runPitLeg } from "../src/pit-leg.js";

// In-memory fixture only: use the host path semantics without creating this directory.
const ROOT = resolve(tmpdir(), "pomaster JVM fixture project");
const PIT_REPORT = "target/pit-reports/mutations.xml";
const ARCH_REPORT = "target/surefire-reports/TEST-com.acme.LayerTest.xml";
const JAVA_FILE = "src/main/java/com/acme/Calc.java";
const POLICY: GatePolicy = { grn: "GRN-820", ranAtSeq: 820, gateTier: "HARDENING", expectedToolVersion: "3.9.6", timeoutMs: 1700 };
const POM = '<project><dependencies><dependency><groupId>com.tngtech.archunit</groupId><artifactId>archunit-junit5</artifactId><version>${archunit.version}</version></dependency></dependencies><properties><archunit.version>1.3.0</archunit.version></properties></project>';
const pitConfig = { runner: "pit", command: "mvn -B", pitVersion: "1.16.1", changedFiles: [JAVA_FILE] };
const archConfig = { tool: "archunit", tests: ["com.acme.LayerTest"] };
const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema);

function mutant(status: string, overrides: { source?: string; detected?: string; tests?: string } = {}): string {
  const detected = overrides.detected ?? (["KILLED", "TIMED_OUT", "NON_VIABLE"].includes(status) ? "true" : "false");
  return `<mutation detected="${detected}" status="${status}" numberOfTestsRun="${overrides.tests ?? "1"}"><sourceFile>${overrides.source ?? "Calc.java"}</sourceFile><mutatedClass>com.acme.Calc</mutatedClass><mutatedMethod>add</mutatedMethod><lineNumber>12</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator><index>0</index><block>0</block></mutation>`;
}
function pitXml(...entries: string[]): string { return `<?xml version="1.0"?><mutations>${entries.join("")}</mutations>`; }
function junit(status = "passed", classname = "com.acme.LayerTest", failures = status === "failed" ? 1 : 0): string {
  const body = status === "failed" ? '<failure message="layer violation">Service imports Controller</failure>' : status === "skipped" ? '<skipped message="disabled"/>' : "";
  return `<?xml version="1.0"?><testsuite tests="1" failures="${failures}" errors="0"><testcase name="layers" classname="${classname}">${body}</testcase></testsuite>`;
}
function harness(report: string | null, options: { version?: string; run?: Partial<SpawnOutcome>; noRunner?: boolean; stale?: boolean; invalidateFails?: boolean; reports?: Record<string, string> } = {}, projectRoot = ROOT) {
  const files = new Map<string, string>(Object.entries(options.reports ?? {}).map(([path, text]) => [resolve(path), text]));
  if (options.stale) { files.set(resolve(projectRoot, PIT_REPORT), pitXml(mutant("KILLED"))); files.set(resolve(projectRoot, ARCH_REPORT), junit()); }
  const calls: { command: string; timeoutMs: number }[] = [];
  const removed: string[] = [];
  const reportIO: JvmReportIO = {
    readTextFile: (path) => files.get(path) ?? null,
    fileExists: (path) => files.has(path),
    removeFile: (path) => { removed.push(path); if (options.invalidateFails) throw new Error("EBUSY"); files.delete(path); },
  };
  const spawn: SpawnFn = (command, spawnOptions) => {
    calls.push({ command, timeoutMs: spawnOptions.timeoutMs });
    if (command.includes("--version")) return { status: 0, stdout: options.version ?? "Apache Maven 3.9.6", stderr: "", error: null, externalMs: 2 };
    if (report !== null) files.set(resolve(spawnOptions.cwd, command.includes("pitest-maven") ? PIT_REPORT : ARCH_REPORT), report);
    for (const [path, text] of Object.entries(options.reports ?? {})) files.set(resolve(path), text);
    return { status: 0, stdout: "BUILD SUCCESS", stderr: "", error: null, externalMs: 3, ...options.run };
  };
  return { reportIO, spawn, calls, removed, files, probe: () => options.noRunner ? null : resolve(tmpdir(), "pomaster JVM tools", process.platform === "win32" ? "mvn.cmd" : "mvn") };
}
function facts(configName: string, config: unknown, pom: string | null = POM, projectRoot = ROOT) {
  return {
    ...fakeFacts(projectRoot, { files: { [resolve(projectRoot, configName)]: JSON.stringify(config), ...(pom === null ? {} : { [resolve(projectRoot, "pom.xml")]: pom }) } }),
    joinPath: resolve,
  };
}
function runPit(report: string | null, options: Parameters<typeof harness>[1] = {}, config: unknown = pitConfig, policy = POLICY) {
  const h = harness(report, options);
  const adapter = createMutationAdapter({ spawnFn: h.spawn, executableProbe: h.probe, reportIO: h.reportIO });
  const f = facts("mutation-gate.json", config);
  const plan = adapter.prepare({ projectRoot: ROOT }, policy, f);
  const record = adapter.normalize(adapter.run(plan), {});
  expect(validate(toGateResultJson(record)), JSON.stringify(validate.errors)).toBe(true);
  return { ...h, adapter, plan, record, f };
}
function runArch(report: string | null, options: Parameters<typeof harness>[1] = {}, config: unknown = archConfig, policy = POLICY, pom: string | null = POM) {
  const h = harness(report, options);
  const adapter = createArchitectureAdapter({ archunitSpawnFn: h.spawn, archunitExecutableProbe: h.probe, archunitReportIO: h.reportIO });
  const f = facts("architecture-gate.json", config, pom);
  const plan = adapter.prepare({ projectRoot: ROOT }, policy, f);
  const record = adapter.normalize(adapter.run(plan), {});
  expect(validate(toGateResultJson(record)), JSON.stringify(validate.errors)).toBe(true);
  return { ...h, adapter, plan, record, f };
}

describe("JVM generated report boundary", () => {
  it("uses a native absolute, space-containing fake fixture root independent of checkout cwd", () => {
    expect(ROOT).toBe(resolve(tmpdir(), "pomaster JVM fixture project"));
    expect(isAbsolute(ROOT)).toBe(true);
    expect(ROOT).toContain(" ");
  });
  it.each([
    { runner: "pit", projectRoot: ROOT },
    { runner: "archunit", projectRoot: ROOT },
    { runner: "pit", projectRoot: resolve(ROOT, "backend module") },
    { runner: "archunit", projectRoot: resolve(ROOT, "backend module") },
  ])("$runner fake producer and report consumer agree on exact native paths in $projectRoot", ({ runner, projectRoot }) => {
    const report = runner === "pit" ? PIT_REPORT : ARCH_REPORT;
    const xml = runner === "pit" ? pitXml(mutant("KILLED")) : junit();
    const expectedPath = resolve(projectRoot, report);
    const h = harness(xml, {}, projectRoot);
    const readTextFile = vi.fn(h.reportIO.readTextFile);
    const fileExists = vi.fn(h.reportIO.fileExists);
    const spawn = vi.fn(h.spawn);
    const reportIO = { ...h.reportIO, readTextFile, fileExists };
    const configName = runner === "pit" ? "mutation-gate.json" : "architecture-gate.json";
    const f = facts(configName, runner === "pit" ? pitConfig : archConfig, POM, projectRoot);
    expect(f.joinPath(projectRoot, configName)).toBe(resolve(projectRoot, configName));
    expect(f.fileExists(resolve(projectRoot, configName))).toBe(true);
    const record = runner === "pit"
      ? (() => { const adapter = createMutationAdapter({ spawnFn: spawn, executableProbe: h.probe, reportIO }); return adapter.normalize(adapter.run(adapter.prepare({ projectRoot }, POLICY, f)), {}); })()
      : (() => { const adapter = createArchitectureAdapter({ archunitSpawnFn: spawn, archunitExecutableProbe: h.probe, archunitReportIO: reportIO }); return adapter.normalize(adapter.run(adapter.prepare({ projectRoot }, POLICY, f)), {}); })();
    expect(record.verdict).toBe("passed");
    expect(isAbsolute(expectedPath)).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls.map(([, options]) => options.cwd)).toEqual([projectRoot, projectRoot]);
    expect(h.removed).toEqual([expectedPath]);
    expect(fileExists).toHaveBeenCalledWith(expectedPath);
    expect(readTextFile).toHaveBeenCalledTimes(1);
    expect(readTextFile).toHaveBeenCalledWith(expectedPath);
    expect([...h.files.keys()]).toEqual([expectedPath]);
    expect(h.reportIO.readTextFile(expectedPath)).toBe(xml);
    const unknownPath = resolve(projectRoot, "other", report);
    expect(h.reportIO.fileExists(unknownPath)).toBe(false);
    expect(h.reportIO.readTextFile(unknownPath)).toBeNull();
  });
  const badArchReports = [
    "pom.xml", "src/main/resources/beans.xml", "src/test/resources/TEST-com.acme.LayerTest.xml",
    "reports/TEST-com.acme.LayerTest.xml", "backend/target/surefire-reports/TEST-com.acme.LayerTest.xml",
    "target/classes/TEST-com.acme.LayerTest.xml", "target/surefire-reports/pom.xml",
    "target/surefire-reports/TEST-com.acme.BusinessTest.xml",
  ];
  const badPitReports = [
    "pom.xml", "src/main/resources/mutations.xml", "src/test/resources/mutations.xml",
    "reports/mutations.xml", "backend/target/pit-reports/mutations.xml", "target/classes/mutations.xml",
  ];
  it.each(badArchReports)("ArchUnit config rejects %s without touching original XML or spawning", (report) => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-jvm-output-"));
    try {
      writeFileSync(join(root, "pom.xml"), POM);
      mkdirSync(join(root, report, ".."), { recursive: true });
      if (report !== "pom.xml") writeFileSync(join(root, report), junit());
      const original = readFileSync(join(root, report), "utf8");
      writeFileSync(join(root, "architecture-gate.json"), JSON.stringify({ ...archConfig, reports: [report] }));
      const removeFile = vi.fn(platformJvmReportIO.removeFile);
      const readTextFile = vi.fn(platformJvmReportIO.readTextFile);
      const spawn = vi.fn(harness(null).spawn);
      const adapter = createArchitectureAdapter({ archunitSpawnFn: spawn, archunitExecutableProbe: () => "mvn", archunitReportIO: { ...platformJvmReportIO, removeFile, readTextFile } });
      const f = platformDetectorFacts(root);
      const record = adapter.normalize(adapter.run(adapter.prepare({ projectRoot: root }, POLICY, f)), {});
      expect(removeFile).not.toHaveBeenCalled();
      expect(readTextFile).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
      expect(readFileSync(join(root, report), "utf8")).toBe(original);
      expect(adapter.detect(f).status).toBe("NOT_INSTALLED");
      expect(record.verdict).toBe("not_configured");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it.each(badPitReports)("PIT config rejects reportsDirectory for %s before source deletion or spawn", (report) => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-jvm-output-"));
    try {
      writeFileSync(join(root, "pom.xml"), POM);
      mkdirSync(join(root, report, ".."), { recursive: true });
      if (report !== "pom.xml") writeFileSync(join(root, report), pitXml(mutant("KILLED")));
      const original = readFileSync(join(root, report), "utf8");
      writeFileSync(join(root, "mutation-gate.json"), JSON.stringify({ ...pitConfig, report }));
      const removeFile = vi.fn(platformJvmReportIO.removeFile);
      const readTextFile = vi.fn(platformJvmReportIO.readTextFile);
      const spawn = vi.fn(harness(null).spawn);
      const adapter = createMutationAdapter({ spawnFn: spawn, executableProbe: () => "mvn", reportIO: { ...platformJvmReportIO, removeFile, readTextFile } });
      const record = adapter.normalize(adapter.run(adapter.prepare({ projectRoot: root }, POLICY, platformDetectorFacts(root))), {});
      expect(removeFile).not.toHaveBeenCalled();
      expect(readTextFile).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
      expect(readFileSync(join(root, report), "utf8")).toBe(original);
      expect(["not_configured", "not_run"]).toContain(record.verdict);
      expect(() => buildPitCommand("mvn -B", [JAVA_FILE], "1.16.1", report)).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it.each(badArchReports)("shared helper and public ArchUnit plan reject %s before all report IO/spawn", (report) => {
    const h = harness(null);
    const adapter = createArchitectureAdapter();
    const plan = adapter.prepare({ projectRoot: ROOT }, POLICY, facts("architecture-gate.json", archConfig)).archunitPlan!;
    const readTextFile = vi.fn(h.reportIO.readTextFile);
    const spawn = vi.fn(h.spawn);
    const reportIO = { ...h.reportIO, readTextFile };
    expect(runJvmMavenReports(plan, [ARCH_REPORT, report], spawn, h.probe, reportIO).kind).toBe("spawn_failed");
    expect(runArchUnitLeg({ ...plan, reportPaths: [report] }, spawn, h.probe, reportIO).kind).toBe("spawn_failed");
    expect(h.removed).toEqual([]);
    expect(readTextFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
  it.each(badPitReports)("shared helper and public PIT plan reject %s before all report IO/spawn", (report) => {
    const h = harness(null);
    const plan = createMutationAdapter().prepare({ projectRoot: ROOT }, POLICY, facts("mutation-gate.json", pitConfig));
    const readTextFile = vi.fn(h.reportIO.readTextFile);
    const spawn = vi.fn(h.spawn);
    const reportIO = { ...h.reportIO, readTextFile };
    expect(runJvmMavenReports({ ...plan, runner: "maven", cwd: ROOT }, [report], spawn, h.probe, reportIO).kind).toBe("spawn_failed");
    expect(runPitLeg({ ...plan, reportPath: report }, spawn, h.probe, reportIO).kind).toBe("spawn_failed");
    expect(h.removed).toEqual([]);
    expect(readTextFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
  it.each(["src/main/resources", "target/classes", "target/pit-reports/other"])("PIT low-level plans reject mismatching reportsDirectory=%s before IO/spawn", (directory) => {
    const h = harness(null);
    const plan = createMutationAdapter().prepare({ projectRoot: ROOT }, POLICY, facts("mutation-gate.json", pitConfig));
    const readTextFile = vi.fn(h.reportIO.readTextFile);
    const spawn = vi.fn(h.spawn);
    const command = plan.command.replace('reportsDirectory="target/pit-reports"', `reportsDirectory="${directory}"`);
    expect(runPitLeg({ ...plan, command }, spawn, h.probe, { ...h.reportIO, readTextFile }).kind).toBe("spawn_failed");
    expect(h.removed).toEqual([]);
    expect(readTextFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
  it.each([
    { runner: "archunit", report: ARCH_REPORT },
    { runner: "pit", report: PIT_REPORT },
    { runner: "pit", report: "target/pit-reports/changed/round/mutations.xml" },
  ])("$runner invalidates only its generated $report and judges fresh XML", ({ runner, report }) => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-jvm-generated-"));
    try {
      writeFileSync(join(root, "pom.xml"), POM);
      mkdirSync(join(root, "src/main/resources"), { recursive: true });
      writeFileSync(join(root, "src/main/resources/beans.xml"), "<beans/>");
      mkdirSync(join(root, report, ".."), { recursive: true });
      writeFileSync(join(root, report), runner === "pit" ? pitXml(mutant("SURVIVED")) : junit("failed"));
      writeFileSync(join(root, runner === "pit" ? "mutation-gate.json" : "architecture-gate.json"), JSON.stringify(runner === "pit" ? { ...pitConfig, report } : { ...archConfig, reports: [report] }));
      const spawn: SpawnFn = (command) => {
        if (command.includes("--version")) return { status: 0, stdout: "Apache Maven 3.9.6", stderr: "", error: null, externalMs: 0 };
        expect(existsSync(join(root, report))).toBe(false);
        if (runner === "pit") expect(command).toContain(`-DreportsDirectory="${report.slice(0, -"/mutations.xml".length)}"`);
        writeFileSync(join(root, report), runner === "pit" ? pitXml(mutant("KILLED")) : junit());
        return { status: 0, stdout: "not evidence", stderr: "", error: null, externalMs: 1 };
      };
      const f = platformDetectorFacts(root);
      const scope = { projectRoot: root };
      const record = runner === "pit"
        ? (() => { const adapter = createMutationAdapter({ spawnFn: spawn, executableProbe: () => "mvn" }); return adapter.normalize(adapter.run(adapter.prepare(scope, POLICY, f)), {}); })()
        : (() => { const adapter = createArchitectureAdapter({ archunitSpawnFn: spawn, archunitExecutableProbe: () => "mvn" }); return adapter.normalize(adapter.run(adapter.prepare(scope, POLICY, f)), {}); })();
      expect(record.verdict).toBe("passed");
      expect(readFileSync(join(root, "pom.xml"), "utf8")).toBe(POM);
      expect(readFileSync(join(root, "src/main/resources/beans.xml"), "utf8")).toBe("<beans/>");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it.each(["archunit", "pit"])("%s cannot invalidate generated paths aliased to in-project source directories", (runner) => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-jvm-alias-"));
    try {
      const source = join(root, "src/main/resources");
      const report = runner === "pit" ? PIT_REPORT : ARCH_REPORT;
      const filename = report.split("/").at(-1)!;
      mkdirSync(source, { recursive: true });
      writeFileSync(join(root, "pom.xml"), POM);
      writeFileSync(join(source, filename), runner === "pit" ? pitXml(mutant("KILLED")) : junit());
      const original = readFileSync(join(source, filename), "utf8");
      mkdirSync(join(root, "target"));
      symlinkSync(source, join(root, "target", runner === "pit" ? "pit-reports" : "surefire-reports"), process.platform === "win32" ? "junction" : "dir");
      const spawn = vi.fn(harness(null).spawn);
      const f = facts(runner === "pit" ? "mutation-gate.json" : "architecture-gate.json", runner === "pit" ? pitConfig : archConfig, POM, root);
      const scope = { projectRoot: root };
      const record = runner === "pit"
        ? (() => { const adapter = createMutationAdapter({ spawnFn: spawn, executableProbe: () => "mvn" }); return adapter.normalize(adapter.run(adapter.prepare(scope, POLICY, f)), {}); })()
        : (() => { const adapter = createArchitectureAdapter({ archunitSpawnFn: spawn, archunitExecutableProbe: () => "mvn" }); return adapter.normalize(adapter.run(adapter.prepare(scope, POLICY, f)), {}); })();
      expect(record.verdict).toBe("not_run");
      expect(spawn).not.toHaveBeenCalled();
      expect(readFileSync(join(source, filename), "utf8")).toBe(original);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("BE-2 PIT production mutation adapter", () => {
  it("executes pinned org.pitest Maven goal, extracts XML and uses changed-code judge", () => {
    const { plan, record, calls, adapter, f } = runPit(pitXml(mutant("KILLED"), mutant("TIMED_OUT"), mutant("NON_VIABLE")));
    expect(adapter.detect(f)).toMatchObject({ status: "READY", tool: "gauntlet:pit" });
    expect(plan.runner).toBe("pit");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ command: "mvn --version", timeoutMs: 1700 });
    expect(calls[1]?.command).toContain("org.pitest:pitest-maven:1.16.1:mutationCoverage");
    expect(calls[1]?.command).toContain(`-DtargetClasses="com.acme.Calc,com.acme.Calc${process.platform === "win32" ? "$" : "\\$"}*"`);
    expect(calls[1]?.command).toContain("-DoutputFormats=XML");
    expect(calls[1]?.command).toContain("-DtimestampedReports=false");
    expect(calls[1]?.timeoutMs).toBe(1700);
    expect(record).toMatchObject({ verdict: "passed", tool: "gauntlet:pit", toolVersion: "3.9.6", metricDialect: "mutation:pit_changed_code", counts: { applicableScanned: 2 } });
    expect(record.scopeNote).toContain("killed 1 + timeout 1");
    expect(record.scopeNote).toContain("nonviable=1");
  });
  it("survivors produce actual threshold failure and survivor locations", () => {
    const { record } = runPit(pitXml(mutant("KILLED"), mutant("SURVIVED")));
    expect(record.verdict).toBe("failed");
    expect(record.items).toEqual(expect.arrayContaining([expect.objectContaining({ rule: "mutation_survived", location: `${JAVA_FILE}:12` })]));
    expect(record.counts.applicableScanned).toBe(2);
  });
  it.each(["NOT_STARTED", "STARTED", "NON_VIABLE", "MEMORY_ERROR", "RUN_ERROR"])("%s alone never becomes killed or a passing zero denominator", (status) => {
    const { record } = runPit(pitXml(mutant(status)));
    expect(record.verdict).toBe("not_run");
  });
  it("partial unexecuted mutants cap green instead of being silently killed", () => {
    const { record } = runPit(pitXml(mutant("KILLED"), mutant("NOT_STARTED")));
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toContain("pit_incomplete_mutants");
    expect(record.counts.applicableScanned).toBe(1);
  });
  it("NO_COVERAGE reduces score without being a survivor", () => {
    const { record } = runPit(pitXml(mutant("KILLED"), mutant("NO_COVERAGE")));
    expect(record.verdict).toBe("failed");
    expect(record.items?.some((item) => item.rule === "mutation_survived")).toBe(false);
  });
  it.each([null, "bad XML", '<mutations><mutation status="KILLED"/></mutations>', pitXml(mutant("ALIEN")), pitXml(mutant("KILLED", { tests: "0" })), pitXml(mutant("KILLED")).replace("</mutations>", ""), '<!DOCTYPE mutations [<!ENTITY injected "x">]><mutations/>'])("missing or invalid report %s is not_run", (xml) => {
    expect(runPit(xml).record.verdict).toBe("not_run");
  });
  it("foreign source and ambiguous source roots cannot inflate changed-code score", () => {
    expect(runPit(pitXml(mutant("KILLED", { source: "Other.java" }))).record.verdict).toBe("not_run");
    const config = { ...pitConfig, changedFiles: [JAVA_FILE, `backend/${JAVA_FILE}`] };
    expect(runPit(pitXml(mutant("KILLED")), {}, config).record.verdict).toBe("not_run");
  });
  it.each([{ ...pitConfig, pitVersion: undefined }, { ...pitConfig, pitVersion: "LATEST" }, { ...pitConfig, changedFiles: ["../Calc.java"] }, { ...pitConfig, report: "../mutations.xml" }, { ...pitConfig, command: "mvn -B && arbitrary" }])("invalid config yields not_configured without spawn", (config) => {
    const { record, calls } = runPit(pitXml(mutant("KILLED")), {}, config);
    expect(record.verdict).toBe("not_configured"); expect(calls).toHaveLength(0);
  });
  it("missing Maven version anchor is not_configured", () => {
    expect(runPit(null, {}, pitConfig, { ...POLICY, expectedToolVersion: null }).record.verdict).toBe("not_configured");
  });
  it("profile policy remains HARDENING-only", () => {
    const { record, calls } = runPit(null, {}, pitConfig, { ...POLICY, gateTier: "STANDARD" });
    expect(record.metricDialect).toBe("mutation:policy_skip"); expect(calls).toHaveLength(0);
  });
  it("version drift caps success but cannot wash out survivors", () => {
    expect(runPit(pitXml(mutant("KILLED")), { version: "Apache Maven 3.9.9" }).record.verdict).toBe("warning");
    expect(runPit(pitXml(mutant("SURVIVED")), { version: "Apache Maven 3.9.9" }).record.verdict).toBe("failed");
  });
  it("missing runner and bad version output stop before execution", () => {
    expect(runPit(null, { noRunner: true }).calls).toHaveLength(0);
    const bad = runPit(null, { version: "Java version 21.0.1" });
    expect(bad.record.verdict).toBe("not_run"); expect(bad.calls).toHaveLength(1);
  });
  it("stale report is removed; failed invalidation prevents execution", () => {
    expect(runPit(null, { stale: true }).record.verdict).toBe("not_run");
    const blocked = runPit(null, { stale: true, invalidateFails: true });
    expect(blocked.record.verdict).toBe("not_run"); expect(blocked.calls).toHaveLength(1);
  });
  it.each([{ status: null, error: "spawnSync mvn.cmd ETIMEDOUT" }, { status: 1, error: "ETIMEDOUT" }, { status: 1, error: null }])("Windows timeout/execution error cannot pass even with XML: %o", (run) => {
    expect(runPit(pitXml(mutant("KILLED")), { run }).record.verdict).toBe("not_run");
  });
  it("POSIX Maven command preserves the literal inner-class dollar wildcard", () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    try {
      expect(buildPitCommand("mvn -B", [JAVA_FILE], "1.16.1", PIT_REPORT)).toContain('com.acme.Calc\\$*');
    } finally { vi.unstubAllGlobals(); }
  });
  it("native filesystem report extraction works without stdout evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-be2-jvm-"));
    try {
      const adapter = createMutationAdapter({ executableProbe: () => "fake-mvn", spawnFn: (command) => {
        if (command.includes("--version")) return { status: 0, stdout: "Apache Maven 3.9.6", stderr: "", error: null, externalMs: 0 };
        mkdirSync(join(root, "target/pit-reports"), { recursive: true });
        writeFileSync(join(root, PIT_REPORT), pitXml(mutant("SURVIVED")));
        return { status: 1, stdout: "BUILD FAILURE", stderr: "", error: null, externalMs: 1 };
      } });
      const f = facts("mutation-gate.json", pitConfig, "<project/>", root);
      const record = adapter.normalize(adapter.run(adapter.prepare({ projectRoot: root }, POLICY, f)), {});
      expect(record.verdict).toBe("failed");
      expect(record.counts.applicableScanned).toBe(1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("probe timeout caps at 60 seconds while execution retains policy timeout", () => {
    const { calls } = runPit(pitXml(mutant("KILLED")), {}, pitConfig, { ...POLICY, timeoutMs: 120000 });
    expect(calls.map((call) => call.timeoutMs)).toEqual([60000, 120000]);
  });
  it("probes the selected Maven wrapper, not an unrelated PATH Maven", () => {
    const { calls } = runPit(pitXml(mutant("KILLED")), {}, { ...pitConfig, command: "./mvnw -B" });
    expect(calls[0]?.command).toBe("./mvnw --version");
  });
  it.for(["hardlink", "symlink"])("rejects a post-run %s report instead of following foreign bytes", (kind, context) => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-be2-links-"));
    try {
      writeFileSync(join(root, "foreign.xml"), pitXml(mutant("KILLED")));
      let unsupported = false;
      const adapter = createMutationAdapter({ executableProbe: () => "fake-mvn", spawnFn: (command) => {
        if (command.includes("--version")) return { status: 0, stdout: "Apache Maven 3.9.6", stderr: "", error: null, externalMs: 0 };
        mkdirSync(join(root, "target/pit-reports"), { recursive: true });
        try {
          if (kind === "hardlink") linkSync(join(root, "foreign.xml"), join(root, PIT_REPORT));
          else symlinkSync(join(root, "foreign.xml"), join(root, PIT_REPORT), "file");
        } catch (error) {
          if (kind === "symlink" && ["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) unsupported = true;
          else throw error;
        }
        return { status: 0, stdout: "BUILD SUCCESS", stderr: "", error: null, externalMs: 1 };
      } });
      const f = facts("mutation-gate.json", pitConfig, POM, root);
      const record = adapter.normalize(adapter.run(adapter.prepare({ projectRoot: root }, POLICY, f)), {});
      if (unsupported) { context.skip(); return; }
      expect(record.verdict).toBe("not_run");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it.each(["constructor", "toString", "__proto__"])("rejects inherited-object PIT status %s", status => {
    expect(parsePitReport(pitXml(mutant(status)), [JAVA_FILE])).toBeNull();
  });
  it("PIT parser exposes native distinctions without a new gate normalizer", () => {
    const parsed = parsePitReport(pitXml(mutant("KILLED"), mutant("SURVIVED"), mutant("NON_VIABLE")), [JAVA_FILE]);
    expect(parsed?.mutants.map((entry) => entry.status)).toEqual(["killed", "survived", "nonviable"]);
    expect(summarizeMutants(parsed!.mutants)).toMatchObject({ generated: 2, killed: 1, survived: 1, excluded: 1 });
  });
});

describe("BE-2 bound public JVM pipeline", () => {
  const binding = (runner: "pit" | "archunit"): ToolBindingRecord => ({
    id: `project.${runner}`, source: "project", transport: "cli", adapter_ref: `builtin.gauntlet-lite.${runner === "pit" ? "mutation" : "architecture"}`,
    tool: `gauntlet:${runner}`, tool_version_anchor: "3.9.6", gate: runner === "pit" ? "MUTATION" : "ARCHITECTURE",
    gate_def: `POLICY.GATE.${runner === "pit" ? "MUTATION" : "ARCHITECTURE"}@0.1.0`,
    metric_dialect: runner === "pit" ? "mutation:pit_changed_code" : "arch:archunit_junit", capabilities: [runner === "pit" ? "unit_behavior" : "dependency_check"],
    execution: { command: "mvn -B", cwd: "backend", timeout_ms: 1700 },
    report_contract: { format: runner === "pit" ? "pit-xml" : "surefire-xml", parser_ref: `builtin.gauntlet-lite.${runner === "pit" ? "mutation/pit-xml" : "architecture/archunit-junit"}`, parser_version: "0.1.0" },
  });
  it.each(["pit", "archunit"] as const)("runs selected %s binding in its Maven project root without erasing scope/plugin pins", runner => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-be2-binding-"));
    try {
      mkdirSync(join(root, "backend"));
      writeFileSync(join(root, "backend/pom.xml"), POM);
      writeFileSync(join(root, "backend", runner === "pit" ? "mutation-gate.json" : "architecture-gate.json"), JSON.stringify(runner === "pit" ? pitConfig : archConfig));
      const calls: { command: string; cwd: string }[] = [];
      const spawn: SpawnFn = (command, options) => {
        calls.push({ command, cwd: options.cwd });
        if (command.includes("--version")) return { status: 0, stdout: "Apache Maven 3.9.6", stderr: "", error: null, externalMs: 1 };
        const path = runner === "pit" ? PIT_REPORT : ARCH_REPORT;
        mkdirSync(join(options.cwd, runner === "pit" ? "target/pit-reports" : "target/surefire-reports"), { recursive: true });
        writeFileSync(join(options.cwd, path), runner === "pit" ? pitXml(mutant("KILLED")) : junit());
        return { status: 0, stdout: "not evidence", stderr: "", error: null, externalMs: 1 };
      };
      const b = binding(runner);
      expect(bindingAdapterContractMatches(b).ok).toBe(true);
      const out = runBindingGate(b, { projectRoot: root, grn: POLICY.grn, ranAtSeq: POLICY.ranAtSeq, gateTier: "HARDENING" }, { spawnFn: spawn, executableProbe: () => "mvn" });
      expect(out.record).toMatchObject({ verdict: "passed", tool: b.tool, gate: b.gate, metricDialect: b.metric_dialect });
      expect(calls.every(call => call.cwd === join(root, "backend"))).toBe(true);
      expect(calls[1]?.command).toContain(runner === "pit" ? "org.pitest:pitest-maven:1.16.1:mutationCoverage" : '-Dtest="com.acme.LayerTest"');
      expect(out.record.scopeNote).toContain(`binding_id=project.${runner}`);
      expect(validate(toGateResultJson(out.record)), JSON.stringify(validate.errors)).toBe(true);
      expect(() => runBindingGate({ ...b, gate: "BUILD" }, { projectRoot: root, grn: POLICY.grn, ranAtSeq: POLICY.ranAtSeq }, { spawnFn: spawn, executableProbe: () => "mvn" })).toThrow();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("BE-2 ArchUnit production architecture adapter", () => {
  it("runs only declared architecture classes and reuses Surefire/JUnit normalization", () => {
    const { adapter, f, record, plan, calls } = runArch(junit());
    expect(adapter.detect(f)).toMatchObject({ status: "READY", tool: "gauntlet:archunit" });
    expect(plan.mode).toBe("archunit");
    expect(calls[1]?.command).toContain('test -Dtest="com.acme.LayerTest"');
    expect(record).toMatchObject({ gate: "ARCHITECTURE", tool: "gauntlet:archunit", toolVersion: "3.9.6", verdict: "passed", counts: { scanned: 1, violations: 0 } });
    expect(record.scopeNote).toContain("ArchUnit=1.3.0");
    expect(record.trust.asserted?.claimedBy.actor).toBe("gauntlet:archunit@3.9.6");
    expect(adapter.detect(f)).toMatchObject({ detectedVersion: null });
  });
  it("layer violations remain failed with real recomputation and mismatch tracking", () => {
    const { record } = runArch(junit("failed", "com.acme.LayerTest", 0), { run: { status: 1 } });
    expect(record.verdict).toBe("failed"); expect(record.counts.violations).toBe(1);
    expect(record.trust.recomputed.matchesAsserted).toBe(false);
  });
  it("all skipped is skipped_blindspot, not passing unrelated Java tests", () => {
    const { record } = runArch(junit("skipped"), { reports: { [resolve(ROOT, "target/surefire-reports/TEST-com.acme.BusinessTest.xml")]: junit("passed", "com.acme.BusinessTest") } });
    expect(record.verdict).toBe("skipped_blindspot");
    expect(record.counts.uncheckedInBlindspotEstimated).toBe(1);
    expect(record.blindspot.fixtureRegression).toBeTruthy();
  });
  it.each([null, "garbage", '<testsuite tests="0"/>', junit().replace("</testsuite>", ""), junit("passed", "com.acme.BusinessTest"), junit().replace("<testcase", "<broken><testcase")])("empty/malformed/foreign report %s is not_run", (report) => {
    expect(runArch(report).record.verdict).toBe("not_run");
  });
  it("known report set requires every declared class and never reads arbitrary tests", () => {
    const config = { ...archConfig, tests: ["com.acme.LayerTest", "com.acme.OtherLayerTest"] };
    expect(runArch(junit(), {}, config).record.verdict).toBe("not_run");
    const reports = { [resolve(ROOT, "target/surefire-reports/TEST-com.acme.OtherLayerTest.xml")]: junit("failed", "com.acme.OtherLayerTest") };
    const { record } = runArch(junit(), { reports }, config);
    expect(record.verdict).toBe("failed"); expect(record.counts.scanned).toBe(2); expect(record.counts.violations).toBe(1);
  });
  it.each([{ tool: "archunit" }, { tool: "archunit", tests: [] }, { ...archConfig, reports: ["../../TEST.xml"] }, { ...archConfig, tests: ["LayerTest; exit 0"] }, { ...archConfig, archunitVersion: "9.9.9" }])("bad architecture declaration is not_configured: %o", (config) => {
    const { record, calls } = runArch(junit(), {}, config);
    expect(record.verdict).toBe("not_configured"); expect(calls).toHaveLength(0);
  });
  it("unresolved/missing dependency version and missing Maven anchor never fabricate readiness", () => {
    expect(runArch(junit(), {}, archConfig, POLICY, POM.replace("<archunit.version>1.3.0</archunit.version>", "")).record.verdict).toBe("not_configured");
    expect(runArch(junit(), {}, archConfig, { ...POLICY, expectedToolVersion: null }).record.verdict).toBe("not_configured");
    expect(runArch(junit(), {}, archConfig, POLICY, "<project/>").record.verdict).toBe("not_run");
  });
  it("no runner, bad probe, stale reports and invalidation failure are non-green", () => {
    expect(runArch(null, { noRunner: true }).record.verdict).toBe("not_run");
    expect(runArch(null, { version: "not maven" }).calls).toHaveLength(1);
    expect(runArch(null, { stale: true }).record.verdict).toBe("not_run");
    expect(runArch(null, { stale: true, invalidateFails: true }).calls).toHaveLength(1);
  });
  it.each([{ status: null, error: "spawnSync mvn.cmd ETIMEDOUT" }, { status: 1, error: "ETIMEDOUT" }, { status: 1, error: null }])("Windows timeout/execution error cannot pass even with a report: %o", (run) => {
    expect(runArch(junit(), { run }).record.verdict).toBe("not_run");
  });
  it.each([
    junit().replace("</testcase>", "<skippd/></testcase>"),
    junit().replace("</testcase>", "<failure/><skipped/></testcase>"),
    junit().replace("</testsuite>", "<unknown/></testsuite>"),
  ])("invalid JUnit elements do not fabricate architecture success", (report) => {
    expect(runArch(report).record.verdict).toBe("not_run");
  });
  it("mixed rules/tool declarations and duplicate canonical reports are invalid", () => {
    expect(runArch(junit(), {}, { ...archConfig, rules: "invalid mixed mode" }).record.verdict).toBe("not_configured");
    const config = { ...archConfig, reports: [ARCH_REPORT, ARCH_REPORT.replaceAll("/", "\\")] };
    expect(runArch(junit(), {}, config).record.verdict).toBe("not_configured");
  });
  it("accepts valid single-quoted/entity-encoded class attributes through the shared walker", () => {
    const xml = junit().replace('classname="com.acme.LayerTest"', "classname='com.acme.&#76;ayerTest'");
    expect(runArch(xml).record.verdict).toBe("passed");
  });
  it("CDATA/comment lookalike tags cannot turn architecture failures into skips", () => {
    const xml = junit("failed").replace("Service imports Controller", "<![CDATA[<skipped/>]]><!-- <skipped/> -->");
    expect(runArch(xml, { run: { status: 1 } }).record.verdict).toBe("failed");
  });
  it("PIT command builder rejects arbitrary invokers even as a public API", () => {
    expect(() => buildPitCommand("mvn && unsafe", [JAVA_FILE], "1.16.1", PIT_REPORT)).toThrow();
  });
  it("Maven version drift is warning, but never washes failed architecture assertions", () => {
    expect(runArch(junit(), { version: "Apache Maven 3.9.9" }).record.verdict).toBe("warning");
    expect(runArch(junit("failed"), { version: "Apache Maven 3.9.9" }).record.verdict).toBe("failed");
  });
});
