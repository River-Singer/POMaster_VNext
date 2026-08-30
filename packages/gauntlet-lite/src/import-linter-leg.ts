/**
 * import-linter-leg.ts —— ARCHITECTURE 门禁 BE-Python 机判腿
 * （P22 Batch 1 补课 / gaps A7；随版计划 Batch 1 原文：
 * 「dependency-cruiser（FE）/ import-linter（BE-Python）→ ARCHITECTURE | 层依赖 +
 * forbidden-import 机判」）。
 *
 * 职责边界（run + normalize；探测归 detectors.detectImportLinter，声明解析归
 * architecture-adapter）：
 * - run：可执行体前置闸 + 两次 spawn（pytest-leg 同款两段式）——
 *   ⓪ 可执行体 PATH 探测（gate ①a，P22 红队 MAJOR 缺席误红修复）：Windows cmd 下
 *   命令缺席以 status=1+error=null 伪装成「正常执行失败」，spawn 层无从分辨——
 *   spawn 前先扫 PATH 证可执行体在位（detectOasdiff findExecutableOnPath 同源先例；
 *   注入面 ExecutableProbeFn，缺省扫真实 process.env.PATH），缺席 → spawn_failed →
 *   not_run 带留痕；
 *   ① `lint-imports --version` 版本探测（观测值与 policy 版本锚对账，C5 孪生）——
 *   探测语义收紧（gate ①b）：必须「退出 0 且报出版本词形」才算可执行（status≠0 /
 *   词形不可得 = 工具缺席或损坏，Windows cmd 缺席形态即 status=1+error=null）→
 *   spawn_failed → not_run，禁猜测版本口径；
 *   ② `lint-imports` 真执行（配置由工具自身发现：.importlinter / setup.cfg /
 *   pyproject.toml；第三方文本止步于此）。
 * - normalize（按工具实际能力面：import-linter 无机器可读输出，判卷锚 = 官方退出码
 *   语义 + stdout 文本宽容重算）：
 *   · 退出码：0 = 全部契约保持、1 = 存在 broken contracts（官方 CI 语义）；
 *   其余退出码（含配置错误）= 工具执行错误 → not_run；
 *   · 形态闸（gate ②，P22 红队 MAJOR 缺席误红修复）：exit 1 且 stdout 两代总结行
 *   词形全不可得 → not_run（工具错误语义）——「存在 broken」的退出码语义以工具真实
 *   执行为前提，执行证据不足时 violations 不得取「诚实下限 1」坐实幻觉数字制造
 *   failed 假红（违反「缺席=NOT_RUN」契约的形态在此封死）；
 *   · violations 重算：stdout 总结行「Contracts: N kept, M broken」（v2 词形）与
 *   「Broken contracts (M)」（v1 词形）两代词形宽容正则——重算 M；
 *   · items：stdout 中含 BROKEN 的行逐行提取（行级明细尽力形态）；无行级明细时单条
 *   锚到配置文件（缺席理由禁静默）。
 * - counts 以「契约」为粒度（scanned = kept + broken 总结行重算；blindspot 同源）。
 *
 * PATH 引号消毒（phaseC 附录 A 教训，与 pytest-leg/oasdiff-leg 同源）；
 * spawn maxBuffer = SPAWN_MAX_BUFFER_BYTES（64MB，Node 默认 1MB 会被大仓库 lint
 * 输出 ENOBUFS 打断——结构性 not_run）；
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

export const IMPORT_LINTER_TOOL_ID = "gauntlet:import-linter";
export const IMPORT_LINTER_METRIC_DIALECT = "arch:import_linter_broken_contracts";
export const IMPORT_LINTER_RUN_COMMAND = "lint-imports";
export const IMPORT_LINTER_VERSION_PROBE_COMMAND = "lint-imports --version";
export const DEFAULT_IMPORT_LINTER_TIMEOUT_MS = 300_000;

// ============================================================
// spawn：PATH 引号消毒默认实现（与 pytestSpawn/oasdiffSpawn 同源同款）
// ============================================================

/** import-linter 腿默认 spawn：PATH 消毒 + shell:true（Windows 下为 PATH 解析）。 */
export const importLinterSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const sanitizedEnv = stripQuotesFromPathEnv({ ...process.env });
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    // 显式 64MB（Node 默认 1MB 会被大仓库 stdout ENOBUFS 打断 → 结构性 not_run）。
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

/** import-linter 机判腿执行计划（architecture-adapter prepare 组装）。 */
export interface ImportLinterLegPlan {
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
  /** 真执行命令（prepare 组装；配置由工具自身发现）。 */
  readonly command: string;
  readonly versionProbeCommand: string;
  readonly timeoutMs: number;
  /** 配置文件名（探测命中的候选；items.location 兜底锚）。 */
  readonly configName: string;
  /** 版本锚（policy 供给，prepare 强制）；run 期观测值对账。 */
  readonly expectedToolVersion: string;
}

export type ImportLinterLegOutput = {
  readonly plan: ImportLinterLegPlan;
  readonly kind: "executed" | "spawn_failed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly observedToolVersion: string | null;
  readonly externalMs: number;
  readonly failureReason: string | null;
};

/**
 * import-linter 腿执行：可执行体前置闸 + 版本探测 + lint-imports 真跑（两段式）。
 * gate ①a/①b 见文件头注：探测失败（可执行体缺席 / 探测非零退出 / 版本词形不可得）
 * 一律 spawn_failed → normalize 落 not_run——Windows cmd 下命令缺席以
 * status=1+error=null 伪装成「正常执行失败」，禁把它当真实判卷输入。
 */
export function runImportLinterLeg(
  plan: ImportLinterLegPlan,
  spawnFn: SpawnFn = importLinterSpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
): ImportLinterLegOutput {
  // —— 前置闸①a：可执行体 PATH 探测（缺席 → not_run 带留痕，禁落入真执行判卷）。
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
      failureReason: `import-linter 可执行体 ${executable} 不在 PATH（工具缺席——Windows cmd 下会以 status=1+error=null 伪装成执行失败，故 spawn 前先证在位）；hint: pip install import-linter 后重跑`,
    };
  }

  const probeTimeoutMs = Math.min(plan.timeoutMs, 60_000);
  const probe: SpawnOutcome = spawnFn(plan.versionProbeCommand, {
    cwd: plan.projectRoot,
    timeoutMs: probeTimeoutMs,
  });
  // —— 前置闸①b：版本探测语义收紧——「可执行」必须以「退出 0 且报出版本词形」为证；
  // status≠0（含 cmd 缺席形态 status=1+error=null）/ 词形不可得 = 工具缺席或损坏。
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
      failureReason: `import-linter 版本探测失败（status=${String(probe.status)}, error=${probe.error ?? "unknown"}, 版本词形${observedToolVersion === null ? "不可得" : "可得"}）——lint-imports 不可执行（工具缺席/损坏；Windows cmd 缺席形态即 status=1+error=null）；hint: pip install import-linter 后重跑`,
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
      ? `import-linter 机判子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
  };
}

// ============================================================
// 文本重算（按工具实际能力面：无机器可读输出，v1/v2 两代词形宽容正则）
// ============================================================

export interface ImportLinterTextReport {
  /** broken contract 数（总结行重算；提取失败 → null）。 */
  readonly broken: number | null;
  /** kept contract 数（总结行重算；提取失败 → 0 显式——只知道 broken 时诚实下界）。 */
  readonly kept: number;
  /** stdout 中含 BROKEN 的行（行级明细尽力形态，保序）。 */
  readonly brokenLines: readonly string[];
}

/**
 * 从 lint-imports stdout 宽容重算契约判卷面：
 * - v2 词形总结行：「Contracts: 2 kept, 1 broken.」
 * - v1 词形标题行：「Broken contracts (1)」
 * 两代词形都不在 → broken=null（交诚实下限路径）。kept 只在 v2 总结行出现。
 */
export function parseImportLinterStdout(stdout: string): ImportLinterTextReport {
  const brokenSummary = /Contracts:\s*\d+\s+kept,\s*(\d+)\s+broken/i.exec(stdout);
  const brokenHeading = /Broken contracts\s*\((\d+)\)/i.exec(stdout);
  const broken =
    brokenSummary !== null
      ? Number.parseInt(brokenSummary[1] ?? "0", 10)
      : brokenHeading !== null
        ? Number.parseInt(brokenHeading[1] ?? "0", 10)
        : null;
  const keptMatch = /Contracts:\s*(\d+)\s+kept/i.exec(stdout);
  const kept = keptMatch !== null ? Number.parseInt(keptMatch[1] ?? "0", 10) : 0;
  // 行级明细（尽力形态）：排除已知结构行（装饰线/标题/Options/Analyzed/总结行）后，
  // 收集含 import 词形的行——真实明细行词形是「X cannot import Y (...)」（v2）与
  // 「X is importable ...」/broken dependency 行（v1），都含 import 词根。
  const summaryLinePattern = /Contracts?:\s*\d+\s+kept/i;
  const structuralLine =
    /^[-=]+$|^import-linter$|^(options|contracts)$|^analyzed\b/i;
  const brokenLines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !structuralLine.test(line) &&
        !summaryLinePattern.test(line) &&
        /import/i.test(line),
    );
  return { broken, kept, brokenLines };
}

// ============================================================
// normalize：退出码锚 + 文本重算 → GateResultRecord
// ============================================================

const SNIPPET_CHARS = 200;

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_CHARS ? `${collapsed.slice(0, SNIPPET_CHARS)}…` : collapsed;
}

/**
 * import-linter 腿判卷核心（判卷矩阵见文件头注；C5：violations 从 stdout 文本重算，
 * 退出码为官方语义锚）。
 * 口径声明：counts 以「契约」为粒度（scanned = kept + broken；blindspot 同源）。
 */
export function normalizeImportLinterLeg(
  raw: ImportLinterLegOutput,
  selfMs: number,
): GateResultRecord {
  const plan = raw.plan;
  if (raw.kind === "spawn_failed") {
    return absenceRecord(
      plan,
      "not_run",
      `${raw.failureReason ?? "import-linter 子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
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

  const exitNote = `lint-imports exit=${String(raw.exitCode)}（0=全部契约保持 / 1=存在 broken contracts / 其他=工具错误）`;

  if (raw.exitCode !== 0 && raw.exitCode !== 1) {
    // 其余退出码（配置错误 / 环境异常）= 工具执行错误 → not_run（非 breaking 判卷）。
    return absenceRecord(
      plan,
      "not_run",
      `${exitNote}——工具执行错误（非契约判卷）；stderr 摘录：${truncate(raw.stderr.slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const parsed = parseImportLinterStdout(raw.stdout);

  // —— 形态闸（gate ②，P22 红队 MAJOR 缺席误红修复）：exit 1 + stdout 两代总结行词形
  // 全不可得 = 执行证据不足——「存在 broken」的官方退出码语义以工具真实执行为前提，
  // 此形态原「violations=1 诚实下限」会把缺席伪装（Windows cmd exit 1 + 空 stdout）
  // 坐实成幻觉 failed 假红。改判 not_run（工具错误语义，非绿非红），stdout 摘录留痕。
  if (raw.exitCode === 1 && parsed.broken === null) {
    return absenceRecord(
      plan,
      "not_run",
      `${exitNote} 且 stdout 无可重算总结行（两代词形均不可得）——执行证据不足，violations 不取下限（缺席伪装成 exit 1 会坐实幻觉 failed，P22 红队 D1 形态闸）；stdout 摘录：${truncate(raw.stdout.slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  let violations: number;
  let scopeNote: string;
  if (parsed.broken !== null) {
    violations = parsed.broken;
    scopeNote =
      raw.exitCode === 0
        ? `${exitNote}；kept=${parsed.kept} broken=${parsed.broken}（总结行重算）`
        : `${exitNote}；kept=${parsed.kept} broken=${parsed.broken}（总结行重算；配置=${plan.configName}）`;
  } else {
    // exit 0（官方全保持语义）且无可重算总结行——判 passed，词形漂移留痕。
    violations = 0;
    scopeNote = `${exitNote}；stdout 无可重算总结行（词形漂移？），退出码语义为判卷锚——stdout 摘录：${truncate(raw.stdout.slice(0, SNIPPET_CHARS)) || "(空)"}`;
  }

  // 退出码与重算矛盾（exit 0 但总结行报 broken>0）→ 重算权威 failed（C5）：
  // effectiveViolations 即重算值本身；矛盾只影响 scopeNote 的留痕措辞。
  const contradiction = raw.exitCode === 0 && parsed.broken !== null && parsed.broken > 0;
  const effectiveViolations = violations;

  let verdict: VerdictValue;
  let capReason: string | null;
  if (effectiveViolations > 0) {
    // failed 不被 cap 洗白（与 vitest/pytest 腿同一条线）。
    verdict = "failed";
    capReason = null;
    scopeNote = contradiction
      ? `${scopeNote}——与退出码矛盾，按 C5 重算权威判 failed`
      : scopeNote;
  } else {
    verdict = caps.length > 0 ? "warning" : "passed";
    capReason = caps.length > 0 ? caps.join("+") : null;
  }

  const scanned = parsed.kept + effectiveViolations;

  const items: readonly GateResultItemInput[] =
    effectiveViolations === 0
      ? []
      : parsed.brokenLines.length > 0
        ? parsed.brokenLines.map((line) => ({
            rule: "import_linter_contract_broken",
            location: plan.configName,
            message: truncate(line),
          }))
        : [
            {
              rule: "import_linter_contract_broken",
              location: plan.configName,
              message: `存在 broken contracts（violations=${effectiveViolations}）；行级明细不可得（词形漂移？）`,
            },
          ];

  const cappedItems = capItems(items);

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
      // import-linter 无数量自报字段（文本明细是判卷输入）——asserted=null（C5）。
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
    scopeNote,
    ...(cappedItems.items.length > 0 ? { items: cappedItems.items } : {}),
    ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
  };
}
