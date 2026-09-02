/**
 * pytest-leg.ts —— BUILD 门禁 pytest 腿的 run + normalize（G5 谱系扩展第一交付）。
 *
 * 职责边界（detect 归 build-adapter.ts 的 detectPytest，早已就位）：
 * - run：`python -m pytest --version` 探测（版本观测值与 policy 版本锚对账，C5 孪生）
 *   → `python -m pytest --junitxml=<临时目录>/junit.xml` 实跑（JUnit XML 是 pytest 核心
 *   能力，零第三方插件）→ 读取报告文件内容作为 normalize 输入（第三方文本止步于此）；
 * - normalize：JUnit XML → GateResultRecord（七态判卷 / notApplicable 显式计数 /
 *   asserted-recomputed 孪生 / duration self-external 拆分）。
 *
 * PATH 引号消毒（phaseC 附录 A 的教训）：本机 PATH 含游离双引号时 Git Bash 自容错，
 * 但 spawnSync(..., {shell:true}) 落到 cmd.exe 后，引号配对解析把后续整段 PATH 吞成
 * 一个 token，`node`/`python` 全部失联。pytestSpawn 显式剥离子进程 env 副本里 PATH 的
 * 双引号（绝不改写用户环境）；命令形态用 `python -m pytest`（entry-point shim 在
 * Windows 上的 PATH 依赖更脆，-m 调用只要包可导入即可执行）。
 *
 * 判卷语义（C1/C5，与 vitest 腿同一条线）：
 * - recomputed（判卷唯一依据）= 从 <testcase> 逐条重算（failure/error→failed、
 *   skipped→notApplicable、其余→passed），绝不采信 testsuite 属性汇总；
 * - asserted（CLAIMED）= testsuite 的 failures+errors 属性自报；失配 → mismatch +
 *   recomputed_wins_recorded；
 * - 全部用例 skipped → verdict=skipped_blindspot 且 counts.uncheckedInBlindspotEstimated
 *   必附盲区指标（03 注记 + kernel normalizeGateResult 的 FATAL 校验是同一条 C1 线：
 *   附上指标即合规，绕过校验才是违规）；
 * - spawn 失败 / XML 不可解析 → not_run（非绿非红终局报告，禁静默当通过）；
 * - 观测版本 ≠ policy 锚 → tool_version_drifted cap（passed 降级 warning，failed 不洗白）；
 *   观测值优先落盘（03 tool_version 记录实际执行的工具）。
 * A4/D24：ranAtSeq 由编排层单调供给；durationMs 机器实测（03 的 digest 排除字段），
 * 永不参与身份、永不阻断写入；本文件不计算任何 sha。
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { GateCounts, GateResult } from "@pomaster/kernel";
import type { VerdictValue } from "@pomaster/schemas";
import type { GatePlan, GateResultRecord, SpawnFn, SpawnOutcome, ToolRunOutput } from "./adapter-types.js";
import { absenceRecord, capItems } from "./normalize-common.js";
import { sanitizeSemver, stripQuotesFromPathEnv } from "./detectors.js";

export const PYTEST_TOOL_ID = "gauntlet:pytest";
export const PYTEST_RUN_COMMAND = "python -m pytest -p no:cacheprovider";
export const PYTEST_VERSION_PROBE_COMMAND = "python -m pytest --version";

// ============================================================
// spawn：PATH 引号消毒默认实现（消毒器住 detectors.ts，与 BROWSER smoke 共用）
// ============================================================

/** pytest 腿默认 spawn：PATH 消毒 + shell:true（Windows 下 python 为 PATH 解析）。 */
export const pytestSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const sanitizedEnv = stripQuotesFromPathEnv({ ...process.env });
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    windowsHide: true,
    env: sanitizedEnv,
  });
  const externalMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error?.message ?? null,
    externalMs,
  };
};

// ============================================================
// run：版本探测 + junit 实跑（第三方文本止步于此）
// ============================================================

/**
 * pytest 腿执行：两次 spawn（版本探测 → junit 实跑）+ 报告文件回读。
 * 报告文件走 OS 临时目录（mkdtemp），读完即删；注入 fake spawn 时（测试）报告文件
 * 不存在，run 原样透传 fake stdout——normalize 只认「stdout 携带的 XML」，两种来源同构。
 */
export function runPytestLeg(
  plan: GatePlan,
  spawnFn: SpawnFn = pytestSpawn,
): ToolRunOutput {
  // ① 版本探测（观测值；探测失败 → not_run，不猜测版本口径）
  const probeTimeoutMs = Math.min(plan.timeoutMs, 60_000);
  const probe: SpawnOutcome = spawnFn(PYTEST_VERSION_PROBE_COMMAND, {
    cwd: plan.cwd,
    timeoutMs: probeTimeoutMs,
  });
  if (probe.error !== null || probe.status === null) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: probe.status,
      stdout: probe.stdout,
      stderr: probe.stderr,
      externalMs: probe.externalMs,
      failureReason: `pytest 版本探测失败（status=${String(probe.status)}, error=${probe.error ?? "unknown"}）——python -m pytest 不可执行；hint: 安装 pytest 或修正 PATH 后重跑`,
      observedToolVersion: null,
    };
  }
  const observedToolVersion = sanitizeSemver(probe.stdout);

  // ② junit 实跑（报告落临时目录；mkdtemp 失败降级为无报告文件——normalize 诚实 not_run）
  let runCommand = plan.command;
  let reportDir: string | null = null;
  try {
    reportDir = mkdtempSync(join(tmpdir(), "pomaster-gauntlet-pytest-"));
    runCommand = `${plan.command} --junitxml="${join(reportDir, "junit.xml")}"`;
  } catch {
    reportDir = null;
  }
  const run: SpawnOutcome = spawnFn(runCommand, {
    cwd: plan.cwd,
    timeoutMs: plan.timeoutMs,
  });
  let stdout = run.stdout;
  if (reportDir !== null) {
    try {
      // 报告文件内容优先于控制台文本（normalize 输入统一为 JUnit XML）。
      stdout = readFileSync(join(reportDir, "junit.xml"), "utf8");
    } catch {
      // 报告文件不可读（spawn 被注入 fake / pytest 未产出）→ 保留控制台 stdout，
      // normalize 解析失败将诚实落 not_run（禁猜测判卷）。
    }
    try {
      rmSync(reportDir, { recursive: true, force: true });
    } catch {
      // 临时目录清理失败不阻断判卷（OS tmp 兜底回收）；绝不让清理错误改判 verdict。
    }
  }
  const spawnFailed = run.error !== null || run.status === null;
  return {
    plan,
    kind: spawnFailed ? "spawn_failed" : "executed",
    exitCode: run.status,
    stdout,
    stderr: run.stderr,
    externalMs: probe.externalMs + run.externalMs,
    failureReason: spawnFailed
      ? `pytest 子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
    observedToolVersion,
  };
}

// ============================================================
// normalize：JUnit XML → GateResultRecord
// ============================================================

interface JUnitTestCase {
  readonly status: "passed" | "failed" | "skipped";
  readonly classname: string | null;
}

interface JUnitSummary {
  readonly testcases: readonly JUnitTestCase[];
  /** testsuite 属性 failures+errors（工具自报汇总，CLAIMED）；属性缺失 → null。 */
  readonly assertedViolations: number | null;
}

/**
 * 宽容解析 pytest 产出的 JUnit XML（self-closing 与带子元素两种 testcase 词形；
 * 属性值中的 `<` 由 pytest 转义，故按 `<failure`/`<error`/`<skipped` 子元素标签判态
 * 不会被 classname 误触发）。结构不完整（未闭合 testcase / 零 testcase）→ null，
 * 交 not_run 终局报告。
 */
export function parseJUnitXml(xml: string): JUnitSummary | null {
  const openTagRegex = /<testcase\b[^>]*>/g;
  const testcases: JUnitTestCase[] = [];
  let match: RegExpExecArray | null;
  while ((match = openTagRegex.exec(xml)) !== null) {
    const openTag = match[0];
    if (openTag.endsWith("/>")) {
      // self-closing：无子元素 = passed。
      testcases.push({ status: "passed", classname: extractClassname(openTag) });
      continue;
    }
    const bodyStart = match.index + openTag.length;
    const closeIndex = xml.indexOf("</testcase>", bodyStart);
    if (closeIndex === -1) {
      return null; // 结构不完整：判卷不可能（禁猜测）。
    }
    const body = xml.slice(bodyStart, closeIndex);
    // 跳过 body（防 failure 消息里再现 <testcase 字样的干扰；pytest 会转义，此为双保险）。
    openTagRegex.lastIndex = closeIndex + "</testcase>".length;
    const status = body.includes("<skipped")
      ? "skipped"
      : body.includes("<failure") || body.includes("<error")
        ? "failed"
        : "passed";
    testcases.push({ status, classname: extractClassname(openTag) });
  }
  if (testcases.length === 0) {
    return null;
  }
  return { testcases, assertedViolations: extractAssertedViolations(xml) };
}

function extractClassname(openTag: string): string | null {
  const m = /classname="([^"]*)"/.exec(openTag);
  return m?.[1] ?? null;
}

function extractAssertedViolations(xml: string): number | null {
  const suiteTag = /<testsuite\b[^>]*>/.exec(xml);
  if (suiteTag === null) {
    return null;
  }
  const failures = /\bfailures="(\d+)"/.exec(suiteTag[0]);
  const errors = /\berrors="(\d+)"/.exec(suiteTag[0]);
  if (failures === null && errors === null) {
    return null;
  }
  return (failures === null ? 0 : Number.parseInt(failures[1] ?? "0", 10)) +
    (errors === null ? 0 : Number.parseInt(errors[1] ?? "0", 10));
}

/**
 * pytest 腿判卷核心（C5：从 <testcase> 逐条重算；testsuite 属性只作 asserted 孪生）。
 * 口径：counts 以用例为粒度（与 vitest 腿同口径）；blindspot 以 classname 载体为粒度。
 */
export function normalizePytestLeg(
  plan: GatePlan,
  raw: ToolRunOutput,
  selfMs: number,
): GateResultRecord {
  if (raw.kind === "spawn_failed") {
    return absenceRecord(plan, "not_run", null, selfMs, raw.externalMs);
  }
  const parsed = parseJUnitXml(raw.stdout);
  if (parsed === null) {
    // 非法/空 JUnit XML（崩溃/被杀/报告缺失）——判卷不可能，not_run 是终局性诚实报告。
    return absenceRecord(plan, "not_run", null, selfMs, raw.externalMs);
  }

  // —— 观测版本优先落盘（03 tool_version 记录实际执行的工具；探测失败回退计划锚）——
  const observed = raw.observedToolVersion ?? null;
  const effectiveVersion = observed ?? plan.toolVersion;

  let violations = 0;
  let notApplicable = 0;
  const carriers = new Map<string, { executed: boolean }>();
  for (const testcase of parsed.testcases) {
    const carrier = testcase.classname ?? "(no classname)";
    const bucket = carriers.get(carrier) ?? { executed: false };
    if (testcase.status !== "skipped") {
      bucket.executed = true;
    }
    carriers.set(carrier, bucket);
    if (testcase.status === "failed") {
      violations++;
    } else if (testcase.status === "skipped") {
      notApplicable++;
    }
  }
  const scanned = parsed.testcases.length;
  const applicableScanned = scanned - notApplicable;
  let filesProduced = 0;
  for (const bucket of carriers.values()) {
    if (bucket.executed) filesProduced++;
  }

  // asserted（CLAIMED）：testsuite failures+errors 属性自报；缺失 → null（诚实信号）。
  const asserted =
    parsed.assertedViolations === null
      ? null
      : {
          value: { violations: parsed.assertedViolations },
          claimedBy: {
            actorType: "tool" as const,
            actor: `${PYTEST_TOOL_ID}@${effectiveVersion}`,
            selfAttested: true,
          },
        };
  const matchesAsserted = asserted === null || asserted.value.violations === violations;
  const mismatchDetected = asserted !== null && !matchesAsserted;

  const caps: string[] = [];
  if (mismatchDetected) {
    caps.push("declare_recompute_mismatch");
  }
  if (applicableScanned === 0) {
    caps.push("zero_executed_assertions_nothing_verified");
  }
  if (
    observed !== null &&
    plan.expectedToolVersion !== null &&
    observed !== plan.expectedToolVersion
  ) {
    caps.push("tool_version_drifted");
  }

  // 全 skipped（零执行断言且零违例）→ skipped_blindspot + 盲区指标必附（见下方分支注记）。
  const allSkippedBlindspot = violations === 0 && applicableScanned === 0 && notApplicable > 0;
  const counts: GateCounts = {
    scanned,
    applicableScanned,
    violations,
    notApplicable,
    ...(allSkippedBlindspot
      ? { uncheckedInBlindspotEstimated: notApplicable }
      : {}),
  };
  let verdict: VerdictValue;
  let capReason: string | null;
  if (violations > 0) {
    // failed 不被 cap 洗白（与 vitest 腿同一条线）。
    verdict = "failed";
    capReason = null;
  } else if (allSkippedBlindspot) {
    // 全 skipped → 七态里最诚实的词形 skipped_blindspot，且盲区指标必附：
    // uncheckedInBlindspotEstimated = 估计未检数（被跳过的全部用例）。
    // 03 注记与 kernel normalizeGateResult 的 FATAL 校验是同一条 C1 线——
    // 附上指标即合规；不附指标的 skipped_blindspot 会在 kernel 入账层被拒。
    verdict = "skipped_blindspot";
    capReason = null;
  } else {
    verdict = caps.length > 0 ? "warning" : "passed";
    capReason = caps.length > 0 ? caps.join("+") : null;
  }

  const filesScanned = carriers.size;
  const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
    grn: plan.grn,
    gate: plan.gate,
    gateDef: plan.gateDef,
    ranAtSeq: plan.ranAtSeq,
    verdict,
    verdictCapReason: capReason,
    subjectId:
      plan.subjectId === null ? null : (plan.subjectId as GateResult["subjectId"]),
    isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
    denominatorRefs: plan.denominatorRefs.map((ref) => ({
      id: ref.id as GateResult["denominatorRefs"][number]["id"],
      versionSeen: ref.versionSeen,
    })),
    counts,
    blindspot: {
      scanned: filesScanned,
      produced: filesProduced,
      escapeRatio:
        filesScanned === 0 ? 0 : (filesScanned - filesProduced) / filesScanned,
      // C3 封条合规位：03 allOf「skipped_blindspot ⇒ blindspot.fixture_regression 必附」。
      // 本腿的证据锚是盲区指标本身（被跳过用例数=估计未检数），引用词形指向该计数——
      // 不是虚构的回归 fixture 名（禁伪造证据引用）。
      ...(allSkippedBlindspot
        ? {
            fixtureRegression: `PYTEST_ALL_SKIPPED/unchecked_in_blindspot_estimated=${notApplicable}`,
          }
        : {}),
    },
    trust: {
      asserted,
      recomputed: { violations, matchesAsserted },
      ...(mismatchDetected
        ? { mismatch: { detected: true, action: "recomputed_wins_recorded" as const } }
        : {}),
    },
    durationMs: { self: selfMs, external: raw.externalMs },
  };
  return {
    ...record,
    tool: plan.tool,
    toolVersion: effectiveVersion,
    metricDialect: plan.metricDialect,
    ...(violations > 0
      ? capItems(
          parsed.testcases
            .map((testcase, index) => ({ testcase, index }))
            .filter((entry) => entry.testcase.status === "failed")
            .map((entry) => ({
              rule: "pytest_assertion_failed",
              location: `${entry.testcase.classname ?? "(no classname)"}`,
              message: `用例 ${entry.index + 1} 断言失败（JUnit <failure>）`,
            })),
        )
      : {}),
  };
}
