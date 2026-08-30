/**
 * dependency-cruiser-leg.ts —— ARCHITECTURE 门禁 FE（JS/TS）机判腿
 * （P22 Batch 1 补课 / gaps A7；随版计划 Batch 1 原文：
 * 「dependency-cruiser（FE）/ import-linter（BE-Python）→ ARCHITECTURE | 层依赖 +
 * forbidden-import 机判」）。
 *
 * 职责边界（run + normalize；探测归 detectors.detectDependencyCruiser，声明解析归
 * architecture-adapter）：
 * - run：可执行体前置闸 + 两次 spawn（pytest-leg 同款两段式）——
 *   ⓪ 可执行体 PATH 探测（gate ①a，P22 红队 MAJOR 缺席误红修复，import-linter 腿
 *   同款）：扫命令链首 token（corepack）证 shell 命令可解析——dependency-cruiser 本体
 *   经 pnpm 从 node_modules/.bin 解析不在 PATH，扫 corepack 是命令链可解析性的诚实
 *   下界（注入面 ExecutableProbeFn，缺省扫真实 process.env.PATH）；缺席 →
 *   spawn_failed → not_run 带留痕；
 *   ① `corepack pnpm exec depcruise --version` 版本探测（观测值与 policy 版本锚对账，
 *   C5 孪生）——探测语义收紧（gate ①b）：必须「退出 0 且报出版本词形」才算可执行
 *   （dependency-cruiser 缺席时 pnpm 以非零退出 + error=null 伪装正常失败；Linux shell
 *   缺席形态为 exit 127）→ spawn_failed → not_run；
 *   ② `corepack pnpm exec depcruise <toolRoot> --config <cfg> --output-type json`
 *   真执行（corepack pnpm exec 沿 build-adapter vitest 腿惯例；第三方 JSON 止步于此）。
 * - normalize：`--output-type json` 的 summary.violations[] 逐条重算（C5）——
 *   violations = 违规依赖条数（layer/forbidden 规则命中），items 每条
 *   {rule: 规则名, location: from -> to, message: severity/comment}；violations>0 →
 *   failed；=0 → passed；JSON 不可解析 / spawn 失败 → not_run（非绿非红，禁静默）。
 *   退出码与明细矛盾时以明细重算为准（C5 重算权威）；明细空但退出码非零 →
 *   failed violations=1 诚实下限 + scopeNote 矛盾留痕。缺席误红的兜底双保险：
 *   工具缺席形态（exit 1/127 + stdout 空/错误文本）过不了 parseDepcruiseReport 的
 *   JSON 可解析门槛 → not_run（gate ① 在 run 侧先拦，本门槛是 normalize 侧终局闸）。
 * - counts 以「被校验模块」为粒度（scanned = modules 数），violations = 规则命中条数
 *   （两块粒度不同是刻意设计并声明——build adapter 同款口径纪律）。
 *
 * PATH 引号消毒（phaseC 附录 A 教训，与 pytest-leg/oasdiff-leg 同源）；
 * spawn maxBuffer = SPAWN_MAX_BUFFER_BYTES（64MB——真实项目 JSON 报告 ~1.3MB 被
 * Node 默认 1MB 缓冲 ENOBUFS 打断是 P22 红队实测形态）；
 * D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  ExecutableProbeFn,
  GateDenominatorRefInput,
  GateResultItemInput,
  GateResultRecord,
  SpawnFn,
  SpawnOutcome,
} from "./adapter-types.js";
import { SPAWN_MAX_BUFFER_BYTES } from "./adapter-types.js";
import {
  firstCommandToken,
  platformExecutableProbe,
  sanitizeSemver,
  stripQuotesFromPathEnv,
} from "./detectors.js";
import { absenceRecord, capItems } from "./normalize-common.js";

export const DEPCUISE_TOOL_ID = "gauntlet:dependency-cruiser";
export const DEPCUISE_METRIC_DIALECT = "arch:depcruise_rule_violations";
export const DEPCUISE_VERSION_PROBE_COMMAND = "corepack pnpm exec depcruise --version";
export const DEPCUISE_DEFAULT_TOOL_ROOT = "src";
export const DEFAULT_DEPCUISE_TIMEOUT_MS = 300_000;

// ============================================================
// spawn：PATH 引号消毒默认实现（与 pytestSpawn/oasdiffSpawn 同源同款）
// ============================================================

/** depcruise 腿默认 spawn：PATH 消毒 + shell:true（Windows 下 corepack 为 .cmd shim）。 */
export const depcruiseSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const sanitizedEnv = stripQuotesFromPathEnv({ ...process.env });
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    // 显式 64MB（真实项目 JSON 报告 ~1.3MB 被 Node 默认 1MB ENOBUFS 打断的实测形态）。
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
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
// 计划与执行
// ============================================================

/** dependency-cruiser 机判腿执行计划（architecture-adapter prepare 组装）。 */
export interface DepcruiseLegPlan {
  readonly tool: string;
  readonly toolVersion: string;
  readonly gate: string;
  readonly gateDef: string;
  readonly metricDialect: string;
  readonly grn: string;
  readonly ranAtSeq: number;
  readonly trigger: RunTriggerValue;
  readonly subjectId: string | null;
  readonly denominatorRefs: readonly GateDenominatorRefInput[];
  readonly projectRoot: string;
  /** 真执行命令（--output-type json；prepare 组装）。 */
  readonly command: string;
  readonly versionProbeCommand: string;
  readonly timeoutMs: number;
  /** 机判扫描根（仓内相对路径；architecture-gate.json toolRoot，默认 src）。 */
  readonly toolRoot: string;
  /** 仓内相对配置文件名（DEPCUISE_CONFIG_CANDIDATES 命中项；items/说明引用）。 */
  readonly configName: string;
  /** 版本锚（policy 供给，prepare 强制）；run 期观测值对账。 */
  readonly expectedToolVersion: string;
}

export type DepcruiseLegOutput = {
  readonly plan: DepcruiseLegPlan;
  readonly kind: "executed" | "spawn_failed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly observedToolVersion: string | null;
  readonly externalMs: number;
  readonly failureReason: string | null;
};

/**
 * dependency-cruiser 腿执行：可执行体前置闸 + 版本探测 + JSON 报告真跑（两段式）。
 * gate ①a/①b 见文件头注（import-linter 腿同款）：探测失败（corepack 缺席 / 探测非零
 * 退出 / 版本词形不可得）一律 spawn_failed → normalize 落 not_run。
 */
export function runDepcruiseLeg(
  plan: DepcruiseLegPlan,
  spawnFn: SpawnFn = depcruiseSpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
): DepcruiseLegOutput {
  // —— 前置闸①a：命令链首 token（corepack）PATH 探测（缺席 → not_run 带留痕）。
  const executable = firstCommandToken(plan.command);
  const probeHit = executableProbe(executable);
  if (probeHit === null) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion: null,
      externalMs: 0,
      failureReason: `dependency-cruiser 命令链可执行体 ${executable} 不在 PATH（命令不可解析——Windows cmd 下会以 status=1+error=null 伪装成执行失败，故 spawn 前先证在位）；hint: 确认 corepack/pnpm 与 devDependencies 已装 dependency-cruiser 后重跑`,
    };
  }

  const probeTimeoutMs = Math.min(plan.timeoutMs, 60_000);
  const probe: SpawnOutcome = spawnFn(plan.versionProbeCommand, {
    cwd: plan.projectRoot,
    timeoutMs: probeTimeoutMs,
  });
  // —— 前置闸①b：版本探测语义收紧（缺席形态：pnpm 非零退出 + error=null / shell 127）。
  const observedToolVersion = sanitizeSemver(probe.stdout);
  if (
    probe.error !== null ||
    probe.status === null ||
    probe.status !== 0 ||
    observedToolVersion === null
  ) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: probe.status,
      stdout: probe.stdout,
      stderr: probe.stderr,
      observedToolVersion: null,
      externalMs: probe.externalMs,
      failureReason: `dependency-cruiser 版本探测失败（status=${String(probe.status)}, error=${probe.error ?? "unknown"}, 版本词形${observedToolVersion === null ? "不可得" : "可得"}）——corepack pnpm exec depcruise 不可执行（工具缺席/损坏）；hint: 确认 devDependencies 已装 dependency-cruiser 后重跑`,
    };
  }

  const run: SpawnOutcome = spawnFn(plan.command, {
    cwd: plan.projectRoot,
    timeoutMs: plan.timeoutMs,
  });
  const spawnFailed = run.error !== null || run.status === null;
  return {
    plan,
    kind: spawnFailed ? "spawn_failed" : "executed",
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    observedToolVersion,
    externalMs: probe.externalMs + run.externalMs,
    failureReason: spawnFailed
      ? `dependency-cruiser 机判子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
  };
}

// ============================================================
// 报告重算（--output-type json；C5：summary.violations 逐条重算）
// ============================================================

export interface DepcruiseViolationItem {
  readonly rule: string;
  readonly location: string;
  readonly message: string;
}

export interface DepcruiseReport {
  /** 规则命中明细（判卷分母外 nothing；每条进 items）。 */
  readonly violations: readonly DepcruiseViolationItem[];
  /** 被校验模块数（counts.scanned 分母；JSON 缺 modules 时以 violations 数兜底）。 */
  readonly modulesSeen: number;
}

function truncateMessage(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > 200 ? `${collapsed.slice(0, 200)}…` : collapsed;
}

/**
 * 解析 dependency-cruiser `--output-type json` 报告（summary.violations[] + modules[]）。
 * 结构不完整（非对象 / violations 非数组）→ null，交 not_run 路径（禁猜测判卷）。
 */
export function parseDepcruiseReport(stdout: string): DepcruiseReport | null {
  let root: unknown;
  try {
    root = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }
  const loose = root as Record<string, unknown>;
  const summary =
    loose["summary"] !== null && typeof loose["summary"] === "object"
      ? (loose["summary"] as Record<string, unknown>)
      : null;
  if (summary === null || !Array.isArray(summary["violations"])) {
    return null;
  }
  const violations: DepcruiseViolationItem[] = [];
  for (const entry of summary["violations"] as unknown[]) {
    const v =
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;
    if (v === null) {
      return null; // 明细条目坏形：整体拒绝（禁静默丢明细，与 kernel items 同一条线）。
    }
    const rule =
      v["rule"] !== null && typeof v["rule"] === "object"
        ? (v["rule"] as Record<string, unknown>)
        : null;
    const ruleName =
      typeof rule?.["name"] === "string" ? rule["name"] : "depcruise_rule_violation";
    const from = typeof v["from"] === "string" ? v["from"] : "(unknown)";
    const to = typeof v["to"] === "string" ? v["to"] : "(unknown)";
    const severity = typeof rule?.["severity"] === "string" ? rule["severity"] : "error";
    const comment = typeof v["comment"] === "string" ? `；${v["comment"]}` : "";
    violations.push({
      rule: ruleName,
      location: `${from} -> ${to}`,
      message: `dependency-cruiser ${severity} 级违规${comment}`,
    });
  }
  const modulesSeen = Array.isArray(loose["modules"])
    ? (loose["modules"] as unknown[]).length
    : violations.length;
  return { violations, modulesSeen };
}

// ============================================================
// normalize：JSON 报告重算 → GateResultRecord
// ============================================================

/**
 * dependency-cruiser 腿判卷核心（C5：violations 从 summary.violations 逐条重算）。
 * 口径声明：counts.scanned = 被校验模块数；violations = 规则命中条数（粒度不同是
 * 刻意设计并声明）；blindspot 以模块为载体粒度。
 */
export function normalizeDepcruiseLeg(
  raw: DepcruiseLegOutput,
  selfMs: number,
): GateResultRecord {
  const plan = raw.plan;
  if (raw.kind === "spawn_failed") {
    return absenceRecord(
      plan,
      "not_run",
      `${raw.failureReason ?? "dependency-cruiser 子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const observed = raw.observedToolVersion;
  const effectiveVersion = observed ?? plan.toolVersion;

  const caps: string[] = [];
  if (observed !== null && observed !== plan.expectedToolVersion) {
    caps.push("tool_version_drifted");
  }

  const parsed = parseDepcruiseReport(raw.stdout);
  if (parsed === null) {
    // 报告不可解析（崩溃/被杀/输出词形漂移）——判卷不可能，not_run 是终局性诚实报告。
    return absenceRecord(
      plan,
      "not_run",
      `dependency-cruiser JSON 报告不可解析（--output-type json 词形漂移或进程异常；exit=${String(raw.exitCode)}）——not_run 非绿非红，禁猜测判卷；stderr 摘录：${truncateMessage(raw.stderr.slice(0, 200)) || "(空)"}`,
      selfMs,
      raw.externalMs,
    );
  }

  const violations = parsed.violations.length;
  const scanned = Math.max(parsed.modulesSeen, violations);

  // 退出码与重算矛盾（dependency-cruiser 官方语义：error 级违规 → 退出码非零）——
  // 明细空但退出码非零 → 诚实下限 1 + 留痕；明细>0 以重算为准（C5 权威）。
  let effectiveViolations = violations;
  let contradictionNote: string | null = null;
  if (violations === 0 && raw.exitCode !== 0 && raw.exitCode !== null) {
    effectiveViolations = 1;
    contradictionNote = `dependency-cruiser exit=${String(raw.exitCode)}（官方语义：存在 error 级违规）但 JSON 明细为空——violations 取诚实下限 1`;
  }

  let verdict: VerdictValue;
  let capReason: string | null;
  if (effectiveViolations > 0) {
    // failed 不被 cap 洗白（与 vitest/pytest 腿同一条线）。
    verdict = "failed";
    capReason = null;
  } else if (scanned === 0) {
    // 零模块被校验（toolRoot 拼错/空目录）——零扫描不可能是 passed（报绿自我怀疑）。
    verdict = "warning";
    capReason = "zero_modules_nothing_verified";
  } else {
    verdict = caps.length > 0 ? "warning" : "passed";
    capReason = caps.length > 0 ? caps.join("+") : null;
  }

  const cappedItems = capItems(
    parsed.violations.map((violation): GateResultItemInput => ({
      rule: violation.rule,
      location: violation.location,
      message: violation.message,
    })),
  );

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
    counts: {
      scanned,
      applicableScanned: scanned,
      violations: effectiveViolations,
      notApplicable: 0,
    },
    blindspot: { scanned, produced: scanned, escapeRatio: 0 },
    trust: {
      // dependency-cruiser JSON 自报的是明细本体（判卷输入），无独立数量自报字段——
      // asserted=null，计数唯一来源是逐条重算（C5）。
      asserted: null,
      recomputed: { violations: effectiveViolations, matchesAsserted: true },
    },
    durationMs: { self: selfMs, external: raw.externalMs },
  };
  return {
    ...record,
    tool: plan.tool,
    toolVersion: effectiveVersion,
    metricDialect: plan.metricDialect,
    ...(contradictionNote !== null ? { scopeNote: contradictionNote } : {}),
    ...(cappedItems.items.length > 0 ? { items: cappedItems.items } : {}),
    ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
  };
}
