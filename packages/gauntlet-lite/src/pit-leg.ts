/** PIT Maven execution/report extraction; normalizeMutationLeg owns judgment. */
import type { DetectionResult, DetectorFacts, ExecutableProbeFn, GatePlan, SpawnFn } from "./adapter-types.js";
import { mavenSpawn } from "./maven-leg.js";
import type { MutantEntry, MutantStatus, MutationLegOutput, MutationLegPlan, MutationReportMetrics } from "./mutation-leg.js";
import { isExactJvmVersion, isJvmMavenInvoker, isJvmRelativePath, isPitReportPath, jvmXmlChildren, parseJvmXml, platformJvmReportIO, runJvmMavenReports, type JvmReportIO } from "./jvm-report.js";

export const PIT_TOOL_ID = "gauntlet:pit";
export const PIT_METRIC_DIALECT = "mutation:pit_changed_code";
export const PIT_DEFAULT_REPORT = "target/pit-reports/mutations.xml";

export function detectPit(facts: DetectorFacts): DetectionResult {
  const configText = facts.readTextFile(facts.joinPath(facts.projectRoot, "mutation-gate.json"));
  if (configText !== null) {
    try {
      const config = JSON.parse(configText) as { report?: unknown } | null;
      if (config?.report !== undefined && (typeof config.report !== "string" || !isPitReportPath(config.report))) {
        return { status: "NOT_INSTALLED", tool: PIT_TOOL_ID, reason: "PIT report must be generated at target/pit-reports/**/mutations.xml", installHint: "Restrict report and reportsDirectory to the selected Maven module's target/pit-reports tree; source/custom external namespaces are unsupported" };
      }
    } catch {
      return { status: "NOT_INSTALLED", tool: PIT_TOOL_ID, reason: "PIT configuration is not valid JSON", installHint: "Fix mutation-gate.json before running PIT" };
    }
  }
  return facts.fileExists(facts.joinPath(facts.projectRoot, "pom.xml"))
    ? { status: "READY", tool: PIT_TOOL_ID, detectedVersion: null, evidence: "pom.xml: PIT plugin invoked by explicitly pinned Maven goal" }
    : { status: "NOT_INSTALLED", tool: PIT_TOOL_ID, reason: "PIT Maven runner requires root pom.xml", installHint: "Use the existing JVM project root and declare pitVersion in mutation-gate.json; no automatic installation" };
}
/** Derive package/class from a declared conventional Maven Java source path. */
export function pitClassForFile(file: string): string | null {
  if (!isJvmRelativePath(file)) return null;
  const normalized = file.replaceAll("\\", "/");
  const match = /(?:^|\/)src\/main\/java\/((?:[A-Za-z_$][\w$]*\/)*[A-Za-z_$][\w$]*)\.java$/.exec(normalized);
  return match?.[1]?.replaceAll("/", ".") ?? null;
}
export function buildPitCommand(command: string, changedFiles: readonly string[], pitVersion: string, reportPath: string): string {
  if (!isJvmMavenInvoker(command) || !isExactJvmVersion(pitVersion) || !isPitReportPath(reportPath)) throw new Error("PIT requires a Maven invoker, exact version and generated target/pit-reports/**/mutations.xml report");
  const classes = changedFiles.map(pitClassForFile);
  if (classes.length === 0 || classes.some((name) => name === null)) throw new Error("PIT needs conventional Maven changed Java source paths");
  const targets = [...new Set(classes.flatMap((name) => [name, `${name}$*`]))].join(",");
  // cmd.exe preserves '$'; POSIX double quotes otherwise expand the $* shell parameter.
  const quotedTargets = process.platform === "win32" ? targets : targets.replaceAll("$", "\\$");
  const directory = reportPath.replaceAll("\\", "/").slice(0, -"/mutations.xml".length);
  return `${command.trim()} org.pitest:pitest-maven:${pitVersion}:mutationCoverage -DtargetClasses="${quotedTargets}" -DoutputFormats=XML -DtimestampedReports=false -DreportsDirectory="${directory}"`;
}
export function runPitLeg(
  plan: MutationLegPlan,
  spawnFn: SpawnFn = mavenSpawn,
  executableProbe?: ExecutableProbeFn,
  reportIO: JvmReportIO = platformJvmReportIO,
): MutationLegOutput {
  const mavenPlan: GatePlan = { ...plan, runner: "maven", cwd: plan.projectRoot };
  const raw = runJvmMavenReports(mavenPlan, [plan.reportPath], spawnFn, executableProbe, reportIO);
  return { plan, kind: raw.kind, exitCode: raw.exitCode, stdout: raw.stdout, stderr: raw.stderr,
    observedToolVersion: raw.observedToolVersion ?? null, reportText: raw.reports[0]?.text ?? null,
    externalMs: raw.externalMs, failureReason: raw.failureReason };
}
const PIT_STATUSES: Readonly<Record<string, MutantStatus>> = {
  KILLED: "killed", SURVIVED: "survived", TIMED_OUT: "timeout", NO_COVERAGE: "no_coverage",
  NON_VIABLE: "nonviable", MEMORY_ERROR: "memory_error", RUN_ERROR: "runtime_error",
  NOT_STARTED: "pending", STARTED: "untested",
};
/** Native PIT mutations.xml (org.pitest plugin), with exact changed-source attribution.
 * PIT's detected=true includes NON_VIABLE; detected is never used as the killed count.
 * Ambiguous/unmatched package+source filenames get an out-of-scope sentinel, not null
 * (null in the legacy mutmut dialect trusts command scope and would inflate the score).
 */
export function parsePitReport(text: string, changedFiles: readonly string[]): MutationReportMetrics | null {
  const root = parseJvmXml(text);
  if (root === null || root.name !== "mutations" || root.text.trim().length > 0) return null;
  const mutants: MutantEntry[] = [];
  for (const entry of root.children) {
    if (entry.name !== "mutation" || entry.text.trim().length > 0) return null;
    const statusWord = entry.attributes["status"] ?? "";
    const status = Object.hasOwn(PIT_STATUSES, statusWord) ? PIT_STATUSES[statusWord] : undefined;
    const detected = entry.attributes["detected"];
    if (status === undefined || (detected !== "true" && detected !== "false")) return null;
    if ((status === "killed" || status === "timeout") && detected !== "true") return null;
    if ((status === "survived" || status === "no_coverage") && detected !== "false") return null;
    const tests = entry.attributes["numberOfTestsRun"];
    if (tests !== undefined && (!/^\d+$/.test(tests) || (status === "killed" && Number(tests) === 0))) return null;
    const field = (name: string): string | null => {
      const children = jvmXmlChildren(entry, name);
      return children.length === 1 && children[0]?.children.length === 0 ? children[0].text.trim() : null;
    };
    const source = field("sourceFile");
    const className = field("mutatedClass");
    const lineWord = field("lineNumber");
    const mutatorName = field("mutator");
    if (source === null || !/^[A-Za-z_$][\w$]*\.java$/.test(source) || className === null || !/^(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*$/.test(className) || lineWord === null || !/^[1-9]\d*$/.test(lineWord) || !Number.isSafeInteger(Number(lineWord)) || !mutatorName) return null;
    const dot = className.lastIndexOf(".");
    const packagePath = dot === -1 ? "" : `${className.slice(0, dot).replaceAll(".", "/")}/`;
    const sourcePath = `${packagePath}${source}`;
    const candidates = changedFiles.map((path) => path.replaceAll("\\", "/")).filter((path) => path.endsWith(`/src/main/java/${sourcePath}`) || path === `src/main/java/${sourcePath}`);
    const file = candidates.length === 1 ? candidates[0]! : `pit-unmatched/${sourcePath}`;
    mutants.push({ id: `${className}:${lineWord}:${mutatorName}:${field("index") ?? "?"}:${mutants.length}`, file, line: Number(lineWord), mutatorName, status });
  }
  return { mutants };
}
