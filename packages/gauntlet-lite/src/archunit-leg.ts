/** BE-2 ArchUnit Maven execution + known Surefire report selection.
 * The existing parseJUnitXml/normalizePytestLeg remain the only assertion walker/judge.
 */
import type { DetectionResult, DetectorFacts, ExecutableProbeFn, GatePlan, SpawnFn, ToolRunOutput } from "./adapter-types.js";
import { mavenSpawn, SUREFIRE_REPORTS_DIR } from "./maven-leg.js";
import { parseJUnitXml } from "./pytest-leg.js";
import { isExactJvmVersion, isJvmMavenInvoker, jvmXmlChildren, parseJvmXml, platformJvmReportIO, runJvmMavenReports, type JvmReportIO, type JvmXmlElement } from "./jvm-report.js";

export const ARCHUNIT_TOOL_ID = "gauntlet:archunit";
export const ARCHUNIT_METRIC_DIALECT = "arch:archunit_junit";
export const DEFAULT_ARCHUNIT_TIMEOUT_MS = 600_000;
export interface ArchUnitLegPlan extends GatePlan {
  readonly runner: "maven";
  readonly architectureTests: readonly string[];
  readonly reportPaths: readonly string[];
  readonly archunitVersion: string;
}
/** Local dependency declarations only; dependencyManagement alone is not installation.
 * Properties may anchor a version, but unresolved/inherited versions are not guessed.
 */
export function readArchUnitVersion(facts: DetectorFacts): string | null {
  const text = facts.readTextFile(facts.joinPath(facts.projectRoot, "pom.xml"));
  const root = text === null ? null : parseJvmXml(text);
  if (root === null || root.name !== "project") return null;
  const properties = jvmXmlChildren(root, "properties")[0];
  const versions = new Set<string>();
  for (const bucket of jvmXmlChildren(root, "dependencies")) {
    for (const dependency of jvmXmlChildren(bucket, "dependency")) {
      const value = (name: string) => jvmXmlChildren(dependency, name)[0]?.text.trim();
      if (value("groupId") !== "com.tngtech.archunit" || !/^archunit(?:-junit[45](?:-(?:api|engine))?)?$/.test(value("artifactId") ?? "")) continue;
      let version = value("version");
      const property = /^\$\{([^}]+)\}$/.exec(version ?? "")?.[1];
      if (property !== undefined) version = properties?.children.find((child) => child.name === property)?.text.trim();
      if (!isExactJvmVersion(version)) return null;
      versions.add(version);
    }
  }
  return versions.size === 1 ? [...versions][0]! : null;
}
export function detectArchUnit(facts: DetectorFacts): DetectionResult {
  const version = readArchUnitVersion(facts);
  return version === null
    ? { status: "NOT_INSTALLED", tool: ARCHUNIT_TOOL_ID, reason: "Root pom.xml needs an ArchUnit dependency with a locally resolvable exact version", installHint: "Use existing project architecture tests and pin the declared ArchUnit dependency; inherited/unknown versions cannot prove readiness" }
    : { status: "READY", tool: ARCHUNIT_TOOL_ID, detectedVersion: null, evidence: `pom.xml declares ArchUnit=${version}; Maven version/availability is verified at run (BE-1 toolVersion contract)` };
}
export function archUnitReportsForTests(tests: readonly string[]): readonly string[] {
  return tests.map((name) => `${SUREFIRE_REPORTS_DIR}/TEST-${name}.xml`);
}
export function buildArchUnitCommand(command: string, tests: readonly string[]): string {
  if (!isJvmMavenInvoker(command) || tests.length === 0 || tests.some(name => !/^(?:[A-Za-z_][\w]*\.)+[A-Za-z_][\w]*$/.test(name))) throw new Error("ArchUnit requires a safe Maven invoker and exact test class names");
  return `${command.trim()} test -Dtest="${tests.join(",")}"`;
}
/** Canonical XML transport into the existing walker: comments/CDATA never become tags,
 * and valid single-quoted/entity-encoded attributes have the walker's canonical form.
 * This converts syntax only; assertion status/counting still belongs to parseJUnitXml.
 */
function walkerXml(element: JvmXmlElement): string {
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const attrs = Object.entries(element.attributes).map(([name, value]) => ` ${name}="${escape(value)}"`).join("");
  const children = element.children.filter(child => !["properties", "system-out", "system-err"].includes(child.name));
  return `<${element.name}${attrs}>${escape(element.text)}${children.map(walkerXml).join("")}</${element.name}>`;
}
/** Only identify XML testcase carriers structurally; do not interpret status here. */
function testcaseElements(root: JvmXmlElement): readonly JvmXmlElement[] | null {
  if (root.name === "testcase") {
    if (root.text.trim().length > 0 || root.children.some((child) => !["skipped", "failure", "error", "system-out", "system-err", "properties"].includes(child.name)) ||
        root.children.filter((child) => ["skipped", "failure", "error"].includes(child.name)).length > 1 ||
        root.children.some(child => ["skipped", "failure", "error"].includes(child.name) && child.children.length > 0) ||
        !root.attributes["name"]?.trim()) return null;
    return [root];
  }
  if (root.name !== "testsuite" && root.name !== "testsuites") return null;
  if (root.text.trim().length > 0) return null;
  const out: JvmXmlElement[] = [];
  for (const child of root.children) {
    if (["properties", "system-out", "system-err"].includes(child.name)) continue;
    const nested = testcaseElements(child);
    if (nested === null) return null;
    out.push(...nested);
  }
  return out;
}
export function runArchUnitLeg(
  plan: ArchUnitLegPlan,
  spawnFn: SpawnFn = mavenSpawn,
  executableProbe?: ExecutableProbeFn,
  reportIO: JvmReportIO = platformJvmReportIO,
): ToolRunOutput {
  const raw = runJvmMavenReports(plan, plan.reportPaths, spawnFn, executableProbe, reportIO);
  if (raw.kind !== "executed") return raw;
  const rejected = (reason: string): ToolRunOutput => ({ ...raw, kind: "spawn_failed", stdout: "", failureReason: reason });
  const classes = new Set(plan.architectureTests);
  const seen = new Set<string>();
  let assertedTotal = 0;
  let allAsserted = true;
  let failedAssertions = 0;
  const canonicalReports: string[] = [];
  for (const report of raw.reports) {
    const root = parseJvmXml(report.text);
    if (root === null || !["testsuite", "testsuites"].includes(root.name)) return rejected(`Invalid ArchUnit XML report: ${report.path}`);
    const elements = testcaseElements(root);
    const canonical = walkerXml(root);
    canonicalReports.push(canonical);
    const parsed = parseJUnitXml(canonical);
    if (parsed === null || elements === null || elements.length !== parsed.testcases.length) return rejected(`Empty/malformed ArchUnit testcase set: ${report.path}`);
    for (const testcase of parsed.testcases) {
      if (testcase.classname === null || !classes.has(testcase.classname)) return rejected(`Architecture report scope mismatch: ${testcase.classname ?? "no class"}`);
      seen.add(testcase.classname);
      if (testcase.status === "failed") failedAssertions++;
    }
    // Single suite self-report per known report. Nested multi-suite summaries cannot
    // be inferred by the legacy walker; omit asserted rather than fabricate its sum.
    if (root.name !== "testsuite" || root.children.some((child) => child.name === "testsuite") || parsed.assertedViolations === null) allAsserted = false;
    else assertedTotal += parsed.assertedViolations;
  }
  if ([...classes].some((name) => !seen.has(name))) return rejected("Missing declared architecture test class in known reports");
  if (raw.exitCode !== 0 && failedAssertions === 0) return rejected(`ArchUnit Maven execution failed (exit=${raw.exitCode}) without failed architecture assertions`);
  // Aggregate original CLAIMED suite counts, not recomputed counts. The shared
  // normalizer still detects self-report mismatches and makes the final verdict.
  const attrs = allAsserted ? ` failures="${assertedTotal}" errors="0"` : "";
  const xml = canonicalReports.join("\n");
  return { ...raw, stdout: `<testsuite${attrs}>${xml}</testsuite>` };
}
