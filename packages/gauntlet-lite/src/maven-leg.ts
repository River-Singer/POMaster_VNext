/**
 * maven-leg.ts —— BUILD 门禁 Maven Surefire 腿 + COVERAGE 门禁 JaCoCo 腿的 run +
 * 解析（BE-1；PRD D-10 后端四类基础测试的 Maven 面）。
 *
 * 职责边界（detect 归 build-adapter.ts 的 detectMaven / detectors 的 jacoco 面）：
 * - surefire 腿：`mvn --version` 探测（观测值与 policy 版本锚对账，pytest 腿 C5 孪生）
 *   → `mvn -B test` 实跑 → 回读 target/surefire-reports/TEST-*.xml（JUnit 家族词形，
 *   与 pytest-junit 同构——判卷 walker 单一锚 parseJUnitXml 复用，producer 词形如实
 *   分立 surefire-xml）。
 * - jacoco 腿：`mvn -B verify` 实跑 → 回读 target/site/jacoco/jacoco.xml（XML counter
 *   词形 INSTRUCTION/LINE/BRANCH×missed/covered）→ 行/分支双口径（coverage-leg 判卷
 *   矩阵同款：两口径强制，缺席口径 = malformed 非默认值）。
 *
 * PATH 引号消毒（pytest-leg 同款教训）：spawn maxBuffer 显式 SPAWN_MAX_BUFFER_BYTES。
 *
 * 判卷语义（与 pytest 腿同一条线）：normalize 判卷归 build-adapter/coverage-leg 既有
 * 归一化（本文件只产 run 产物 + 报告文本），recomputed 从用例逐条重算、asserted =
 * testsuite 属性自报孪生、全 skipped → skipped_blindspot；exit 非判卷锚。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { SpawnFn, SpawnOutcome, ToolRunOutput } from "./adapter-types.js";
import { SPAWN_MAX_BUFFER_BYTES } from "./adapter-types.js";
import { sanitizeSemver, stripQuotesFromPathEnv } from "./detectors.js";

export const SUREFIRE_TOOL_ID = "gauntlet:maven-surefire";
export const SUREFIRE_RUN_COMMAND = "mvn -B test";
export const SUREFIRE_VERSION_PROBE_COMMAND = "mvn --version";
export const SUREFIRE_FORMAT = "surefire-xml";
export const SUREFIRE_PARSER_REF = "builtin.gauntlet-lite.build/surefire-xml";
/** surefire 报告目录（仓内相对路径；Maven 默认布局）。 */
export const SUREFIRE_REPORTS_DIR = "target/surefire-reports";
// jacoco 词形常量（JACOCO_TOOL_ID / JACOCO_METRIC_DIALECT / JACOCO_DEFAULT_REPORT）
// 归 coverage-leg.ts 单一所有（export * 去重）；本文件只持 run 期专属常量。
export const JACOCO_RUN_COMMAND = "mvn -B verify";
export const JACOCO_VERSION_PROBE_COMMAND = "mvn --version";

// ============================================================
// spawn：PATH 引号消毒默认实现（pytest-leg 同款）
// ============================================================

export const mavenSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const sanitizedEnv = stripQuotesFromPathEnv({ ...process.env });
  const run = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
    windowsHide: true,
    env: sanitizedEnv,
  });
  const externalMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    status: run.status,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    error: run.error?.message ?? null,
    externalMs,
  };
};

// ============================================================
// 探测辅助（pom.xml 面；版本锚 policy 供给——run 期实测对账）
// ============================================================

/** pom.xml 在座判据（surefire 探测 / tools init 识别共用单一锚）。 */
export function pomXmlExists(projectRoot: string): boolean {
  return existsSync(join(projectRoot, "pom.xml"));
}

/** pom.xml 是否声明 jacoco（jacoco 腿 READY 判据——配置驱动画，同 pytest 的 [tool.pytest] 口径）。 */
export function pomDeclaresJacoco(projectRoot: string): boolean {
  const raw = readFileSync(join(projectRoot, "pom.xml"), "utf8");
  return raw.includes("jacoco");
}

/** mvn 版本探测（观测值；探测失败 → null，判卷面 not_run 不猜测口径）。 */
export function probeMavenVersion(projectRoot: string): string | null {
  const outcome: SpawnOutcome = mavenSpawn(SUREFIRE_VERSION_PROBE_COMMAND, { cwd: projectRoot, timeoutMs: 60_000 });
  if (outcome.error !== null || outcome.status !== 0) return null;
  return sanitizeSemver(outcome.stdout);
}

// ============================================================
// surefire 腿 run：版本探测 → mvn -B test → TEST-*.xml 回读拼装（stdout 携带 XML）
// ============================================================

export function runSurefireLeg(plan: ToolRunOutput["plan"], spawnFn: SpawnFn = mavenSpawn): ToolRunOutput {
  const probeTimeoutMs = Math.min(plan.timeoutMs, 60_000);
  const probe: SpawnOutcome = spawnFn(SUREFIRE_VERSION_PROBE_COMMAND, { cwd: plan.cwd, timeoutMs: probeTimeoutMs });
  if (probe.error !== null || probe.status === null) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: probe.status,
      stdout: probe.stdout,
      stderr: probe.stderr,
      externalMs: probe.externalMs,
      failureReason: `maven 版本探测失败（status=${String(probe.status)}, error=${probe.error ?? "unknown"}）——mvn 不可执行；hint: 安装 Maven 或修正 PATH 后重跑`,
      observedToolVersion: null,
    };
  }
  const observedToolVersion = sanitizeSemver(probe.stdout);
  const run: SpawnOutcome = spawnFn(plan.command, { cwd: plan.cwd, timeoutMs: plan.timeoutMs });
  // 报告回读：target/surefire-reports/TEST-*.xml 全量拼装（多模块/多套件 = 多文件）；
  // 全缺席 = 空串 → normalize 诚实 not_run（surefire 被跳过/无测试都落这里，禁猜测）。
  const reportsDir = join(plan.cwd, ...SUREFIRE_REPORTS_DIR.split("/"));
  let xml = "";
  if (existsSync(reportsDir)) {
    for (const name of readdirSync(reportsDir).sort()) {
      if (!name.startsWith("TEST-") || !name.endsWith(".xml")) continue;
      try {
        xml += readFileSync(join(reportsDir, name), "utf8");
      } catch {
        // 单文件读失败跳过（其余文件仍判卷；全失败 = 空串 → not_run）。
      }
    }
  }
  const spawnFailed = run.error !== null || run.status === null;
  return {
    plan,
    kind: spawnFailed ? "spawn_failed" : "executed",
    exitCode: run.status,
    stdout: xml,
    stderr: run.stderr,
    externalMs: probe.externalMs + run.externalMs,
    failureReason: spawnFailed
      ? `surefire 子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : xml === ""
        ? "surefire 报告缺席（target/surefire-reports 无 TEST-*.xml——测试被跳过或未产出）"
        : null,
    observedToolVersion,
  };
}

// ============================================================
// jacoco 腿 run：mvn -B verify → jacoco.xml 回读（reportText 供 coverage normalize）
// ============================================================

export function runJacocoLeg(
  plan: { readonly command: string; readonly cwd: string; readonly timeoutMs: number; readonly coverageReportPath: string },
  spawnFn: SpawnFn = mavenSpawn,
): { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string; readonly reportText: string | null; readonly observedToolVersion: string | null; readonly externalMs: number; readonly failureReason: string | null } {
  const startedAt = performance.now();
  const probe: SpawnOutcome = spawnFn(JACOCO_VERSION_PROBE_COMMAND, { cwd: plan.cwd, timeoutMs: Math.min(plan.timeoutMs, 60_000) });
  const observedToolVersion = probe.error === null && probe.status === 0 ? sanitizeSemver(probe.stdout) : null;
  const run: SpawnOutcome = spawnFn(plan.command, { cwd: plan.cwd, timeoutMs: plan.timeoutMs });
  let reportText: string | null = null;
  try {
    reportText = readFileSync(join(plan.cwd, ...plan.coverageReportPath.split("/")), "utf8");
  } catch {
    reportText = null;
  }
  const externalMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    reportText,
    observedToolVersion,
    externalMs,
    failureReason: run.error !== null || run.status === null ? `jacoco 子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）` : null,
  };
}

// ============================================================
// jacoco XML 解析（行/分支双口径强制；报告级 counter = 总判卷锚，sourcefile = 分母）
// ============================================================

export interface JacocoCoverage {
  readonly linesPct: number;
  readonly branchesPct: number;
  readonly files: ReadonlyMap<string, { readonly linesPct: number; readonly branchesPct: number | null }>;
}

function counterPair(body: string, type: "LINE" | "BRANCH"): { readonly missed: number; readonly covered: number } | null {
  const m = new RegExp(`<counter type="${type}" missed="(\\d+)" covered="(\\d+)"\\/>`).exec(body);
  if (m === null) return null;
  return { missed: Number.parseInt(m[1] ?? "0", 10), covered: Number.parseInt(m[2] ?? "0", 10) };
}

function pct(covered: number, missed: number): number {
  const total = covered + missed;
  return total === 0 ? 0 : (covered / total) * 100;
}

/** jacoco XML → 行/分支口径（report 级 counter = 总判卷锚；sourcefile 级 = 逐文件分母）。 */
export function parseJacocoXml(xml: string): JacocoCoverage | null {
  if (!/<report\b/.test(xml) || !xml.includes("<counter")) return null;
  // report 级 counter 在最后一个 </package> 之后（jacoco 布局：包内 counter 各层都有，
  // 报告级汇总殿后）——取其后的正文匹配，禁跨层聚合猜测。
  const lastPackageEnd = xml.lastIndexOf("</package>");
  const reportTail = lastPackageEnd === -1 ? xml : xml.slice(lastPackageEnd);
  const lineCounter = counterPair(reportTail, "LINE");
  const branchCounter = counterPair(reportTail, "BRANCH");
  if (lineCounter === null || branchCounter === null) return null;
  const files = new Map<string, { linesPct: number; branchesPct: number | null }>();
  const sourcefileRegex = /<sourcefile name="([^"]+)"([\s\S]*?)<\/sourcefile>/g;
  let match: RegExpExecArray | null;
  while ((match = sourcefileRegex.exec(xml)) !== null) {
    const name = match[1] ?? "";
    const body = match[2] ?? "";
    const line = counterPair(body, "LINE");
    if (line === null) continue;
    const branch = counterPair(body, "BRANCH");
    const branchTotal = branch === null ? 0 : branch.covered + branch.missed;
    files.set(name, {
      linesPct: pct(line.covered, line.missed),
      branchesPct: branch !== null && branchTotal > 0 ? pct(branch.covered, branch.missed) : null,
    });
  }
  return {
    linesPct: pct(lineCounter.covered, lineCounter.missed),
    branchesPct: pct(branchCounter.covered, branchCounter.missed),
    files,
  };
}
