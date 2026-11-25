/** Bounded Maven execution and generated report validation; existing judges own assertions. */
import { constants, closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, win32 } from "node:path";
import type { ExecutableProbeFn, GatePlan, SpawnFn, ToolRunOutput } from "./adapter-types.js";
import { platformExecutableProbe } from "./detectors.js";
import { mavenSpawn } from "./maven-leg.js";

export interface JvmReportIO {
  readonly readTextFile: (absolutePath: string) => string | null;
  readonly fileExists: (absolutePath: string) => boolean;
  /** Remove only a known report file; failure must prevent tool execution. */
  readonly removeFile: (absolutePath: string) => void;
}
export const platformJvmReportIO: JvmReportIO = {
  readTextFile: (path) => {
    let fd: number | undefined;
    try {
      const before = lstatSync(path);
      if (!before.isFile() || before.nlink !== 1) return null;
      fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== before.ino || opened.dev !== before.dev) return null;
      const text = readFileSync(fd, "utf8");
      const after = lstatSync(path);
      if (!after.isFile() || after.nlink !== 1 || after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size || after.mtimeMs !== before.mtimeMs) return null;
      return text;
    } catch { return null; }
    finally { if (fd !== undefined) closeSync(fd); }
  },
  fileExists: existsSync,
  removeFile: (path) => rmSync(path, { force: true }),
};
export function isJvmRelativePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return normalized.length > 0 && !isAbsolute(normalized) && !win32.isAbsolute(normalized) &&
    !normalized.includes(":") && !/[\x00-\x1f"'`$;&|<>%!*?]/.test(normalized) &&
    normalized.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
/** Report paths are relative to the selected Maven module, never a source namespace. */
export function isPitReportPath(path: string): boolean {
  return isJvmRelativePath(path) && /^target\/pit-reports(?:\/[^/]+)*\/mutations\.xml$/.test(path.replaceAll("\\", "/"));
}
export function isArchUnitReportSet(tests: readonly unknown[], reports: readonly unknown[]): boolean {
  if (tests.length === 0 || tests.some((name) => typeof name !== "string" || !/^(?:[A-Za-z_][\w]*\.)+[A-Za-z_][\w]*$/.test(name)) || new Set(tests).size !== tests.length) return false;
  const expected = new Set(tests.map((name) => `target/surefire-reports/TEST-${name}.xml`));
  const normalized = reports.map((path) => typeof path === "string" && isJvmRelativePath(path) ? path.replaceAll("\\", "/") : "");
  return normalized.length === expected.size && new Set(normalized).size === expected.size && normalized.every((path) => expected.has(path));
}
function validReportSet(plan: GatePlan, reports: readonly string[]): boolean {
  if (plan.tool === "gauntlet:archunit") {
    return "architectureTests" in plan && Array.isArray(plan.architectureTests) && isArchUnitReportSet(plan.architectureTests, reports);
  }
  if (plan.tool !== "gauntlet:pit" || reports.length !== 1 || !isPitReportPath(reports[0] ?? "")) return false;
  const directory = reports[0]!.replaceAll("\\", "/").slice(0, -"/mutations.xml".length);
  const declarations = [...plan.command.matchAll(/-DreportsDirectory=(?:"([^"]*)"|([^\s]+))/g)];
  return declarations.length === 1 && (declarations[0]?.[1] ?? declarations[0]?.[2])?.replaceAll("\\", "/") === directory;
}
export function isExactJvmVersion(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}
/** Restrict config commands to a Maven invoker, not arbitrary shell composition or goals. */
export function isJvmMavenInvoker(command: string): boolean {
  return /^(?:mvn(?:\.cmd)?|\.\/mvnw|mvnw(?:\.cmd)?)(?:\s+(?:-B|--batch-mode|-q|--quiet|-o|--offline))*$/.test(command.trim());
}
function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${win32.sep}`) && !rel.startsWith("../") && !isAbsolute(rel);
}
/** Even an in-project symlink can alias generated reports to source files. */
function safeReportParent(root: string, path: string): boolean {
  try {
    const realRoot = realpathSync(root);
    let parent = dirname(path);
    while (parent !== root) {
      if (!inside(root, parent)) return false;
      try {
        const stat = lstatSync(parent);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
        if (!inside(realRoot, realpathSync(parent))) return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
      }
      parent = dirname(parent);
    }
    return true;
  } catch { return false; }
}
export interface JvmMavenOutput extends ToolRunOutput {
  readonly reports: readonly { readonly path: string; readonly text: string }[];
}
/** BE-1 version/timeout contract; stricter availability and fresh known-report checks. */
export function runJvmMavenReports(
  plan: GatePlan,
  reportPaths: readonly string[],
  spawnFn: SpawnFn = mavenSpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
  reportIO: JvmReportIO = platformJvmReportIO,
): JvmMavenOutput {
  let externalMs = 0;
  let observedToolVersion: string | null = null;
  const absent = (reason: string, exitCode: number | null = null): JvmMavenOutput => ({
    plan, kind: "spawn_failed", exitCode, stdout: "", stderr: "", externalMs,
    failureReason: `${reason}; hint: verify Maven/Java, pinned versions and known XML report paths`,
    observedToolVersion, reports: [],
  });
  if (!Number.isFinite(plan.timeoutMs) || plan.timeoutMs <= 0) return absent("Invalid JVM timeout");
  if (!validReportSet(plan, reportPaths)) return absent("Invalid JVM generated report set: require class-matched target/surefire-reports or target/pit-reports/**/mutations.xml");
  const root = resolve(plan.cwd);
  const normalizedPaths = reportPaths.map((path) => path.replaceAll("\\", "/"));
  const absolutePaths = normalizedPaths.map((path) => resolve(root, path));
  if (absolutePaths.some((path) => !inside(root, path) || (reportIO === platformJvmReportIO && !safeReportParent(root, path)))) return absent("JVM report path escapes generated output namespace");
  const executable = plan.command.trim().split(/\s+/)[0] ?? "mvn";
  const invokerAvailable = executable.startsWith("./") && executableProbe === platformExecutableProbe
    ? (() => { try { return lstatSync(resolve(plan.cwd, executable)).isFile(); } catch { return false; } })()
    : executableProbe(executable) !== null;
  if (!invokerAvailable || executableProbe("java") === null) return absent("JVM runner not available (selected Maven invoker/Java)");
  try {
    const probe = spawnFn(`${executable} --version`, { cwd: plan.cwd, timeoutMs: Math.min(plan.timeoutMs, 60_000) });
    externalMs += probe.externalMs;
    const version = /(?:^|\n)\s*Apache Maven (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(probe.stdout.replace(/\x1b\[[0-9;]*m/g, ""));
    if (probe.error !== null || probe.status !== 0 || version === null) return absent("Maven version probe failed or unrecognizable", probe.status);
    observedToolVersion = version[1] ?? null;
    if (reportIO === platformJvmReportIO && absolutePaths.some((path) => !safeReportParent(root, path))) return absent("JVM report parent changed outside generated output namespace");
    for (const path of normalizedPaths) {
      const absolute = resolve(root, path);
      if (!inside(root, absolute) || (reportIO === platformJvmReportIO && !safeReportParent(root, absolute))) return absent("JVM report path escapes project");
      reportIO.removeFile(absolute);
      if (reportIO.fileExists(absolute)) return absent(`Cannot invalidate JVM report ${path}`);
    }
    const run = spawnFn(plan.command, { cwd: plan.cwd, timeoutMs: plan.timeoutMs });
    externalMs += run.externalMs;
    if (run.error !== null || run.status === null) return absent(`JVM execution error/timeout: ${run.error ?? "null exit status"}`, run.status);
    const reports: { path: string; text: string }[] = [];
    for (const path of normalizedPaths) {
      const absolute = resolve(root, path);
      if (reportIO === platformJvmReportIO && !safeReportParent(root, absolute)) return absent("JVM report parent changed outside project", run.status);
      const text = reportIO.readTextFile(absolute);
      if (text === null) return absent(`JVM report missing/unreadable: ${path}`, run.status);
      reports.push({ path, text });
    }
    return { plan, kind: "executed", exitCode: run.status, stdout: reports.map((report) => report.text).join("\n"), stderr: run.stderr, externalMs, observedToolVersion, failureReason: null, reports };
  } catch (error) {
    return absent(`JVM probe/execution/report IO failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Small XML envelope reader, not a second assertion walker. DTDs/entities are not executed.
 * Complete nesting, quoted attributes and escaped text are required before shared walkers
 * receive Surefire XML or PIT fields are extracted. Comments and CDATA are data only.
 */
export interface JvmXmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: JvmXmlElement[];
  text: string;
}
function xmlText(text: string): string | null {
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) return null;
  try {
    return text.replace(/&([^;]+);/g, (_, entity: string) => {
      const known: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
      if (Object.hasOwn(known, entity)) return known[entity]!;
      const code = entity.startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (!(code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff))) throw new Error("Invalid XML code point");
      return String.fromCodePoint(code);
    });
  } catch { return null; }
}
export function parseJvmXml(xml: string): JvmXmlElement | null {
  const stack: JvmXmlElement[] = [];
  let root: JvmXmlElement | null = null;
  let offset = 0;
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/(?:[A-Za-z_][\w.:-]*)\s*>|<[A-Za-z_][\w.:-]*(?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*\/?>|[^<]+/g;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(xml)) !== null) {
    if (match.index !== offset) return null;
    const token = match[0];
    offset = tokens.lastIndex;
    if (token.startsWith("<!--")) { if (token.slice(4, -3).includes("--")) return null; continue; }
    if (token.startsWith("<?")) { if (stack.length > 0 || root !== null || !/^<\?xml\s/.test(token)) return null; continue; }
    if (token.startsWith("<![CDATA[")) {
      const parent = stack[stack.length - 1];
      if (parent === undefined) return null;
      parent.text += token.slice(9, -3); continue;
    }
    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim();
      if (stack.pop()?.name !== name) return null;
    } else if (token.startsWith("<")) {
      const name = /^<([A-Za-z_][\w.:-]*)/.exec(token)?.[1];
      if (name === undefined) return null;
      const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
      const attrs = token.slice(name.length + 1);
      const attrRegex = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let attr: RegExpExecArray | null;
      while ((attr = attrRegex.exec(attrs)) !== null) {
        const key = attr[1] ?? "";
        if (Object.hasOwn(attributes, key)) return null;
        const value = xmlText(attr[2] ?? attr[3] ?? "");
        if (value === null) return null;
        attributes[key] = value;
      }
      const element: JvmXmlElement = { name, attributes, children: [], text: "" };
      const parent = stack[stack.length - 1];
      if (parent !== undefined) parent.children.push(element);
      else if (root === null) root = element;
      else return null;
      if (!token.endsWith("/>")) { if (stack.length >= 256) return null; stack.push(element); }
    } else {
      const text = xmlText(token);
      if (text === null || token.includes("]]>")) return null;
      const parent = stack[stack.length - 1];
      if (parent !== undefined) parent.text += text;
      else if (text.trim().length > 0 && text !== "\ufeff") return null;
    }
  }
  return offset === xml.length && stack.length === 0 ? root : null;
}
export function jvmXmlChildren(element: JvmXmlElement, name: string): readonly JvmXmlElement[] {
  return element.children.filter((child) => child.name === name);
}
