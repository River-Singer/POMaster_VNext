/**
 * schemathesis-leg.ts —— CONTRACT 门禁的 schemathesis property-based 执行腿
 * （P27 / 随版计划 Batch 3 后段 B3-4「schemathesis——从 OpenAPI 生成 property-based
 * 用例；FastAPI profile 招牌件」；PRD §26.2 CONTRACT Gate；oasdiff-leg.ts 两段式
 * 先例 + playwright-leg.ts 报告回读先例 + security-leg.ts 三道闸先例）。
 *
 * 权威出处：
 * - 随版计划 B3-4 原文：「schemathesis | CONTRACT 加强 | 从 OpenAPI 生成
 *   property-based 用例；FastAPI profile 招牌件；依赖 OpenAPI 事实源（语料已有
 *   published_openapi_operationids=190 分母）与 L2 的 FastAPI fixture 同源共建」；
 * - OpenAPI 来源 = 受治项目声明（contract-gate.json 的 openapi 字段——既有双口径
 *   同款；fixture 同源：与 P16 L2 FastAPI fixture 同一工程形态共建）。
 *
 * ============================================================
 * 工具真实词形对账（铁律 8；schemathesis v4 官方词形，2026-08-31 对账
 * schemathesis.readthedocs.io/en/stable/reference/cli/ + 官方仓库源码
 * src/schemathesis/engine/events.py / engine/recorder.py / reporting/ndjson.py）
 * ============================================================
 * - **run 语义（官方 CLI reference 逐字）**：`st run [OPTIONS] SCHEMA`（=
 *   `schemathesis run`）——SCHEMA = OpenAPI 文件路径或 URL；property-based 用例
 *   由 schemathesis 从 schema 生成并对目标 API 执行（phases: examples/coverage/
 *   fuzzing/stateful）；命令由受治项目在 contract-gate.json 声明（含 base-url、
 *   checks、报告旗标——项目侧运行面 POMaster 不越权拼装）；
 * - **官方退出码契约（CLI reference「Exit codes」逐字）**：0 = 全部 checks 通过；
 *   1 = 至少一个 check 失败或有 bug 报告；2 = 因配置或 schema 错误中止——官方
 *   CI 契约即判卷锚（oasdiff 0/1 同款）；其余退出码 = 工具执行错误 → not_run；
 * - **NDJSON 报告词形（--report ndjson --report-ndjson-path，官方
 *   reporting/ndjson.py 源码）**：每行一个 JSON 对象、单键 = 官方事件类名：
 *   · 首行 `{"Initialize":{"command","schemathesis_version","seed"}}`（NdjsonWriter.open）；
 *   · 事件行 `{"<EventName>":{...dataclass 字段...}}`（write_event；
 *     官方事件类：EngineStarted/PhaseStarted/PhaseFinished/SuiteStarted/
 *     SuiteFinished/ScenarioStarted/ScenarioFinished/FuzzScenarioStarted/
 *     FuzzScenarioFinished/Interrupted/NonFatalError/FatalError/EngineFinished/
 *     RateLimitRetry/SchemaAnalysisWarnings）；
 *   · `{"ScenarioFinished":{...,"recorder":{...}}}`：recorder = ScenarioRecorder
 *     官方词形 {label, status, roots, cases: {caseId: CaseNode}, checks:
 *     {caseId: [CheckNode]}, interactions: {caseId: Interaction}}；CheckNode =
 *     {name, status, failure_info}；status 官方五词形枚举（engine/__init__.py
 *     class Status(str, Enum)：'success'|'failure'|'error'|'interrupted'|'skip'）；
 *   · 终行 `{"EngineFinished":{...,"stop_reason":...}}`（is_terminal；stop_reason
 *     官方四词形：'completed'|'interrupted'|'failure_limit'|'max_time'）。
 *
 * ============================================================
 * 判卷锚与三道闸（P22-P26 先例全适用）
 * ============================================================
 * - 判卷锚 = 官方退出码契约 + NDJSON 报告重算（C5 重算权威，oasdiff 双锚同款）：
 *   · exit 0（官方全通过语义）+ NDJSON 重算检出 check 失败 → 矛盾形态按 C5
 *     重算权威判 failed（oasdiff「exit 0 + 明细>0」同款）；
 *   · exit 1（官方有失败语义）→ failed；NDJSON 重算检出 ≥1 条 check 失败 →
 *     violations = 失败条数 + items 明细（check name + failure_info）；NDJSON
 *     不可解析/明细空 → 诚实下限 violations=1 + stdout 摘录留痕（oasdiff 同款）；
 *   · exit 2（官方配置/schema 错误中止）→ not_run（工具执行错误，非判卷失败——
 *     禁把「没跑起来」记成红或绿）；
 *   · 其余退出码 → not_run。
 * - ⓪ 前置闸①a 可执行体 PATH 探测（Windows cmd 缺席伪装先拦截）→ not_run；
 * - ① 前置闸①b 版本探测（`schemathesis --version` 退出 0 且 semver 词形）→
 *   not_run，禁猜版本口径；
 * - ② 报告失效化（rmSync 陈旧报告误绿封死）+ 真执行 + 报告回读（缺席 = not_run）；
 *   报告路径安全闸（空路径/越出项目根 → pre_run_failed）。
 *
 * ============================================================
 * 零分母闸（P26 红队 MAJOR 先例；B3-4「生成 property-based 用例」的分母语义）
 * ============================================================
 * 报告词形可解析但全部 ScenarioFinished.recorder.cases 展开后零生成用例 = 空分母
 * ——「生成了 0 条用例且全部通过」是撒谎（mutation-leg computeKillScore：分母 0
 * 必须落 not_run 禁当满分）；三形态同判：无 ScenarioFinished 行 / recorder.cases
 * 空 / cases 全部未进 checks（零 check 执行）。checks 分母以 recorder.cases 键数
 * 计（官方 cases = 生成的测试用例登记表）。
 *
 * 判卷矩阵补充：
 * - check status ∈ {'failure','error'} → violations（官方五词形枚举内，最严可辩护
 *   方向——error 比 failure 更严重，两者都不是「通过」）；'success' 干净；
 *   'interrupted'/'skip' 非失败（cap=schemathesis_checks_not_passed 呈报，无违规时
 *   降 warning 不冒充全通过；有违规时 failed 不被 cap 洗白）；
 * - 官方词形之外（事件行非单键/事件名非官方集合/check status 词形越界/NDJSON 行
 *   不可解析）→ 整报告 malformed → not_run（坏行可能藏失败，禁跳行降级）。
 *
 * PATH 引号消毒；spawn maxBuffer 显式 64MB（P22 先例）；
 * D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  isAbsolute as pathIsAbsolute,
  join as pathJoin,
  relative as pathRelative,
  resolve as pathResolve,
} from "node:path";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  ExecutableProbeFn,
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
import { absenceRecord, capItems, type RecordPlanFields } from "./normalize-common.js";

export const SCHEMATHESIS_TOOL_ID = "gauntlet:schemathesis";
export const SCHEMATHESIS_METRIC_DIALECT = "contract:schemathesis_property_based";
export const SCHEMATHESIS_VERSION_PROBE_COMMAND = "schemathesis --version";
export const SCHEMATHESIS_DEFAULT_REPORT = "reports/contract/schemathesis.ndjson";
export const DEFAULT_SCHEMATHESIS_TIMEOUT_MS = 600_000;

/**
 * 官方 NDJSON 行键集合（逐字）：engine/events.py dataclass 类名 + reporting/ndjson.py
 * NdjsonWriter.open() 写入的 Initialize 首行记录（非 EngineEvent dataclass 但为官方
 * NDJSON 词形的一部分）——词形越界即 malformed。
 */
export const SCHEMATHESIS_EVENT_NAMES: readonly string[] = [
  "Initialize",
  "EngineStarted",
  "PhaseStarted",
  "PhaseFinished",
  "SchemaAnalysisWarnings",
  "SuiteStarted",
  "SuiteFinished",
  "ScenarioStarted",
  "ScenarioFinished",
  "FuzzScenarioStarted",
  "FuzzScenarioFinished",
  "Interrupted",
  "NonFatalError",
  "FatalError",
  "EngineFinished",
  "RateLimitRetry",
];

/** 官方 Status 五词形枚举（engine/__init__.py class Status(str, Enum) 逐字）。 */
export const SCHEMATHESIS_CHECK_STATUSES: readonly string[] = [
  "success",
  "failure",
  "error",
  "interrupted",
  "skip",
];

/** 官方 StopReason 四词形（engine/__init__.py class StopReason 逐字；容忍面）。 */
export const SCHEMATHESIS_STOP_REASONS: readonly string[] = [
  "completed",
  "interrupted",
  "failure_limit",
  "max_time",
];

// ============================================================
// spawn：PATH 引号消毒默认实现（oasdiffSpawn 同源同款）
// ============================================================

/** schemathesis 腿默认 spawn：PATH 消毒 + shell:true + 显式 64MB maxBuffer（P22 先例）。 */
export const schemathesisSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const sanitizedEnv = stripQuotesFromPathEnv({ ...process.env });
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    // 显式 64MB（Node 默认 1MB 会被大报告 ENOBUFS 打断 → 结构性 not_run）。
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

/** schemathesis 腿执行计划（contract-adapter prepare 组装；RecordPlanFields 结构子集）。 */
export interface SchemathesisLegPlan extends RecordPlanFields {
  readonly projectRoot: string;
  readonly trigger: RunTriggerValue;
  /** 真执行命令（contract-gate.json schemathesis 段声明，原样执行——schemathesis
   * run 语义的项目侧运行面：base-url/checks/报告旗标由项目拼装，POMaster 不越权）。 */
  readonly command: string;
  readonly versionProbeCommand: string;
  /** gate ①a 可执行体词形（版本探测命令首 token）。 */
  readonly executable: string;
  readonly timeoutMs: number;
  /** 仓内相对 NDJSON 报告文件路径（run 侧失效化 + 回读 + items.location 可移植词形）。 */
  readonly reportPath: string;
  /** 受检 OpenAPI 文件仓内相对路径（items.location 锚；受治项目声明的事实源）。 */
  readonly openapiPath: string;
  /** 版本锚（policy 供给，prepare 强制）；run 期观测值对账。 */
  readonly expectedToolVersion: string;
}

export interface SchemathesisLegOutput {
  readonly plan: SchemathesisLegPlan;
  /**
   * pre_run_failed = spawn 前安全/失效化闸拒绝（报告路径非法或陈旧报告删不掉——
   * spawn 未发生，fail-closed not_run）。
   */
  readonly kind: "executed" | "spawn_failed" | "pre_run_failed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly observedToolVersion: string | null;
  /** NDJSON 报告文件回读文本（缺席 = null → not_run 非绿非红）。 */
  readonly reportText: string | null;
  readonly externalMs: number;
  readonly failureReason: string | null;
}

/** 报告绝对路径是否越出项目根（含路径即根——rmSync 破坏性面前置拒绝判据）。 */
function pathEscapesProjectRoot(projectRoot: string, absolutePath: string): boolean {
  const rel = pathRelative(pathResolve(projectRoot), pathResolve(absolutePath));
  return rel === "" || rel.startsWith("..") || pathIsAbsolute(rel);
}

/** 报告文件仓内相对路径（配置声明优先；缺省固定落点）。 */
export function resolveSchemathesisReportPath(configValue: string | null): string {
  return (configValue ?? SCHEMATHESIS_DEFAULT_REPORT).replaceAll("\\", "/");
}

/** 报告文件绝对路径（run 侧失效化/回读共用）。 */
export function schemathesisReportAbsolutePath(
  projectRoot: string,
  relativePath: string,
): string {
  return pathJoin(projectRoot, relativePath);
}

/** schemathesis 腿 gate ①a 可执行体（firstCommandToken 同源）。 */
export function schemathesisLegExecutable(versionProbeCommand: string): string {
  return firstCommandToken(versionProbeCommand);
}

/**
 * schemathesis 腿执行：可执行体前置闸 + 版本探测 + 报告失效化 + 真执行 + 报告回读。
 * NDJSON 报告文件从仓内计划路径回读——官方报告文本止步于此（normalize 只认报告文本）。
 */
export function runSchemathesisLeg(
  plan: SchemathesisLegPlan,
  spawnFn: SpawnFn = schemathesisSpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
): SchemathesisLegOutput {
  // —— 前置闸①a：可执行体 PATH 探测（Windows cmd 缺席以 status=1+error=null 伪装）。
  const probeHit = executableProbe(plan.executable);
  if (probeHit === null) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion: null,
      reportText: null,
      externalMs: 0,
      failureReason: `schemathesis 腿可执行体 ${plan.executable} 不在 PATH（工具缺席——Windows cmd 下会以 status=1+error=null 伪装成执行失败，故 spawn 前先证在位）；hint: 按探测面安装指引安装后重跑`,
    };
  }

  // —— 前置闸①b：版本探测语义收紧（退出 0 且报出 semver 词形才算可执行）。
  const probeTimeoutMs = Math.min(plan.timeoutMs, 60_000);
  const probe: SpawnOutcome = spawnFn(plan.versionProbeCommand, {
    cwd: plan.projectRoot,
    timeoutMs: probeTimeoutMs,
  });
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
      reportText: null,
      externalMs: probe.externalMs,
      failureReason: `schemathesis 腿版本探测失败（status=${String(probe.status)}, error=${probe.error ?? "unknown"}, 版本词形${observedToolVersion === null ? "不可得" : "可得"}）——工具缺席或损坏（Windows cmd 缺席形态即 status=1+error=null）；hint: 按探测面安装指引安装后重跑`,
    };
  }

  // —— 前置闸②a：判卷锚路径安全闸（失效化 rmSync 破坏性面前置拒绝）。
  const reportAbs = schemathesisReportAbsolutePath(plan.projectRoot, plan.reportPath);
  if (plan.reportPath.length === 0 || pathEscapesProjectRoot(plan.projectRoot, reportAbs)) {
    return {
      plan,
      kind: "pre_run_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion,
      reportText: null,
      externalMs: probe.externalMs,
      failureReason: `schemathesis 腿报告路径非法：reportPath=${plan.reportPath === "" ? "(空)" : plan.reportPath}（空路径或越出项目根——spawn 前失效化面拒绝执行，fail-closed）`,
    };
  }

  // —— 前置闸②b：报告失效化（陈旧报告误绿通道封死，P23 红队 MAJOR 同款）。
  try {
    rmSync(reportAbs, { force: true });
  } catch {
    // force 只吞「不存在」；存在而删不掉走下方存在性复核 fail-closed。
  }
  if (existsSync(reportAbs)) {
    return {
      plan,
      kind: "pre_run_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion,
      reportText: null,
      externalMs: probe.externalMs,
      failureReason: `schemathesis 腿报告失效化失败：${plan.reportPath} 在 spawn 前无法删除（被占用/权限不足/路径为目录占位）——无法保证本次判卷锚新鲜，fail-closed 拒绝执行`,
    };
  }

  // —— ② 真执行 + 报告回读（退出码是官方 CI 契约判卷锚之一——见文件头注判卷矩阵；
  // NDJSON 报告是明细重算锚，两者缺一不可）。
  const run: SpawnOutcome = spawnFn(plan.command, {
    cwd: plan.projectRoot,
    timeoutMs: plan.timeoutMs,
  });
  let reportText: string | null = null;
  try {
    reportText = readFileSync(reportAbs, "utf8");
  } catch {
    reportText = null;
  }
  const spawnFailed = run.error !== null || run.status === null;
  return {
    plan,
    kind: spawnFailed ? "spawn_failed" : "executed",
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    observedToolVersion,
    reportText,
    externalMs: probe.externalMs + run.externalMs,
    failureReason: spawnFailed
      ? `schemathesis 腿子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
  };
}

// ============================================================
// 官方 NDJSON 报告解析（词形对账 engine/events.py + reporting/ndjson.py；
// 词形之外一律 malformed → null，禁跳坏行降级——坏行可能藏失败）
// ============================================================

/** 官方 CheckNode 消费面（name/status/failure_info）。 */
export interface SchemathesisCheckEntry {
  readonly name: string | null;
  readonly status: string;
  readonly failureMessage: string | null;
}

/** ScenarioFinished 的 recorder 消费面（cases 分母 + checks 明细）。 */
export interface SchemathesisScenarioEntry {
  readonly status: string | null;
  /** 官方 ScenarioRecorder.cases 键数（生成的测试用例登记表——判卷分母）。 */
  readonly generatedCases: number;
  readonly checks: readonly SchemathesisCheckEntry[];
}

/** 官方 NDJSON 报告消费面。 */
export interface ParsedSchemathesisReport {
  /** Initialize 行的 schemathesis_version（官方 NdjsonWriter.open 词形；缺项 null）。 */
  readonly schemathesisVersion: string | null;
  readonly scenarios: readonly SchemathesisScenarioEntry[];
  /** EngineFinished 的 stop_reason（官方四词形；缺项 null）。 */
  readonly stopReason: string | null;
}

/** 单行解析：官方词形 = 单键 JSON 对象且键 ∈ 官方事件名集合。 */
function parseNdjsonLine(
  line: string,
): { readonly eventName: string; readonly payload: Record<string, unknown> } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const keys = Object.keys(parsed as Record<string, unknown>);
  if (keys.length !== 1 || !SCHEMATHESIS_EVENT_NAMES.includes(keys[0] as string)) {
    return null;
  }
  const eventName = keys[0] as string;
  const payload = (parsed as Record<string, unknown>)[eventName];
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return { eventName, payload: payload as Record<string, unknown> };
}

/** 官方 CheckNode 词形提取（status 官方五词形枚举，词形外 = 整报告 malformed）。 */
function parseCheckEntry(value: unknown): SchemathesisCheckEntry | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const status = record["status"];
  if (typeof status !== "string" || !SCHEMATHESIS_CHECK_STATUSES.includes(status)) {
    return null;
  }
  const failureInfo =
    record["failure_info"] !== null && typeof record["failure_info"] === "object"
      ? (record["failure_info"] as Record<string, unknown>)
      : null;
  const failure =
    failureInfo !== null && failureInfo["failure"] !== null && typeof failureInfo["failure"] === "object"
      ? (failureInfo["failure"] as Record<string, unknown>)
      : null;
  let failureMessage: string | null = null;
  if (failure !== null) {
    // 官方 Failure.asdict() 词形（schemathesis.core.failures）——title/message 兼容提取。
    const title = failure["title"];
    const message = failure["message"];
    failureMessage =
      typeof title === "string"
        ? title
        : typeof message === "string"
          ? message
          : JSON.stringify(failure);
  }
  return {
    name: typeof record["name"] === "string" ? record["name"] : null,
    status,
    failureMessage,
  };
}

/**
 * 官方 NDJSON 报告解析：逐行解析（官方词形 = 单键事件对象）；行不可解析/事件名
 * 越界/check status 词形越界 → 整报告 null（malformed → not_run，禁跳坏行降级——
 * 坏行可能藏失败）。Initialize 首行词形容忍缺项（schemathesis_version 装载）；
 * ScenarioFinished.recorder.cases/checks 是判卷分母与明细来源。
 */
export function parseSchemathesisNdjsonReport(text: string): ParsedSchemathesisReport | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return null;
  }
  let schemathesisVersion: string | null = null;
  const scenarios: SchemathesisScenarioEntry[] = [];
  let stopReason: string | null = null;
  for (const line of lines) {
    const parsed = parseNdjsonLine(line);
    if (parsed === null) {
      return null;
    }
    if (parsed.eventName === "Initialize") {
      const version = parsed.payload["schemathesis_version"];
      schemathesisVersion = typeof version === "string" ? version : null;
      continue;
    }
    if (parsed.eventName === "ScenarioFinished") {
      const recorder =
        parsed.payload["recorder"] !== null && typeof parsed.payload["recorder"] === "object"
          ? (parsed.payload["recorder"] as Record<string, unknown>)
          : null;
      if (recorder === null) {
        return null;
      }
      const rawCases = recorder["cases"];
      const rawChecks = recorder["checks"];
      if (
        rawCases === null ||
        typeof rawCases !== "object" ||
        Array.isArray(rawCases) ||
        rawChecks === null ||
        typeof rawChecks !== "object" ||
        Array.isArray(rawChecks)
      ) {
        return null;
      }
      const checks: SchemathesisCheckEntry[] = [];
      for (const caseChecks of Object.values(rawChecks as Record<string, unknown>)) {
        if (!Array.isArray(caseChecks)) {
          return null;
        }
        for (const raw of caseChecks) {
          const check = parseCheckEntry(raw);
          if (check === null) {
            return null;
          }
          checks.push(check);
        }
      }
      const scenarioStatus = parsed.payload["status"];
      scenarios.push({
        status: typeof scenarioStatus === "string" ? scenarioStatus : null,
        generatedCases: Object.keys(rawCases as Record<string, unknown>).length,
        checks,
      });
      continue;
    }
    if (parsed.eventName === "EngineFinished") {
      const reason = parsed.payload["stop_reason"];
      if (reason !== undefined && reason !== null) {
        if (typeof reason !== "string" || !SCHEMATHESIS_STOP_REASONS.includes(reason)) {
          return null;
        }
        stopReason = reason;
      }
      continue;
    }
    // 其余官方事件（PhaseStarted/NonFatalError/...）——容忍不消费（分母以
    // ScenarioFinished.recorder 承载；NonFatalError 呈报面走 cap 记账位而非解析）。
  }
  return { schemathesisVersion, scenarios, stopReason };
}

// ============================================================
// normalize：官方退出码契约 + NDJSON 重算 → GateResultRecord（双锚，oasdiff 同款）
// ============================================================

const SNIPPET_CHARS = 200;

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_CHARS
    ? `${collapsed.slice(0, SNIPPET_CHARS)}…`
    : collapsed;
}

/**
 * schemathesis 腿判卷核心（判卷矩阵见文件头注；C5：violations 一律从 NDJSON
 * recorder.checks 重算，退出码是官方 CI 契约锚——双锚互证，矛盾形态按重算权威）。
 *
 * counts/blindspot 载体粒度声明：
 * - counts.scanned = recorder.cases 展开后的生成用例总数（B3-4「生成 property-based
 *   用例」的分母由官方 cases 登记表承载）；violations = check 失败条数（可与
 *   scanned 不同粒度——一个用例可挂多条 check——刻意设计并声明，oasdiff 粒度分离先例）；
 * - blindspot 载体 = 报告文件本身（完整回读且可解析 + 分母非零）。
 */
export function normalizeSchemathesisLeg(
  raw: SchemathesisLegOutput,
  selfMs: number,
): GateResultRecord {
  const plan = raw.plan;
  if (raw.kind !== "executed") {
    return absenceRecord(
      plan,
      "not_run",
      `${raw.failureReason ?? "schemathesis 腿子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  if (raw.reportText === null) {
    return absenceRecord(
      plan,
      "not_run",
      `schemathesis 腿 NDJSON 报告未产出/不可读：${plan.reportPath}（官方退出码=0 也不构成通过——报告是明细重算锚；核对命令是否含 --report ndjson --report-ndjson-path 声明后重跑）（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  const parsed = parseSchemathesisNdjsonReport(raw.reportText);
  if (parsed === null) {
    return absenceRecord(
      plan,
      "not_run",
      `schemathesis 腿 NDJSON 报告词形不可解析：${plan.reportPath}——解析器对账官方词形（每行单键事件对象，事件名官方集合；ScenarioFinished.recorder.cases/checks 官方词形；Status 官方五词形枚举）；词形之外一律 malformed 落 not_run 禁默认值；报告摘录：${truncate(raw.reportText.slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  // —— 零分母闸（P26 红队 MAJOR 先例；三形态同判）——
  const totalGenerated = parsed.scenarios.reduce(
    (sum, scenario) => sum + scenario.generatedCases,
    0,
  );
  const totalChecks = parsed.scenarios.reduce(
    (sum, scenario) => sum + scenario.checks.length,
    0,
  );
  if (
    parsed.scenarios.length === 0 ||
    totalGenerated === 0 ||
    totalChecks === 0
  ) {
    return absenceRecord(
      plan,
      "not_run",
      `schemathesis 腿报告零分母：${plan.reportPath} 词形可解析但生成用例分母为零（无 ScenarioFinished / recorder.cases 空 / 零 check 执行，三形态同判）——「生成 0 条用例且全部通过」是撒谎，空分母禁当满分（mutation-leg computeKillScore 先例：generated=0 必须落 not_run）；核对 SCHEMA 声明与 schemathesis run 旗标（如 --include-path 过滤是否过滤光了操作）后重跑（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const observed = raw.observedToolVersion;
  const effectiveVersion = observed ?? plan.toolVersion;

  const caps: string[] = [];
  if (
    observed !== null &&
    observed !== plan.expectedToolVersion &&
    plan.expectedToolVersion.length > 0
  ) {
    caps.push("tool_version_drifted");
  }

  // —— NDJSON 重算（C5 权威）：status ∈ {failure, error} → violations（最严可辩护
  // 方向——官方 error 比 failure 更严重，两者都不是「通过」）；interrupted/skip →
  // cap 呈报（非失败但不可静默当全通过）。
  const items: GateResultItemInput[] = [];
  let notPassedChecks = 0;
  for (const scenario of parsed.scenarios) {
    for (const check of scenario.checks) {
      if (check.status === "failure" || check.status === "error") {
        items.push({
          rule: check.name ?? "schemathesis_unnamed_check",
          location: `${plan.openapiPath}#${check.name ?? "(unnamed-check)"}`,
          message: `property-based check ${check.status}：${check.failureMessage ?? "(报告未携带失败详情)"}`,
        });
      } else if (check.status === "interrupted" || check.status === "skip") {
        notPassedChecks += 1;
      }
    }
  }
  if (notPassedChecks > 0) {
    caps.push("schemathesis_checks_not_passed");
  }
  // —— 官方退出码契约 × 重算对账（oasdiff 双锚同款）——
  const exitNote = `schemathesis exit=${String(raw.exitCode)}（官方契约：0=全部 checks 通过 / 1=至少一个 check 失败或有 bug 报告 / 2=配置或 schema 错误中止）`;
  let verdict: VerdictValue;
  let capReason: string | null;
  if (raw.exitCode === 2 || (raw.exitCode !== 0 && raw.exitCode !== 1)) {
    // 官方语义：配置/schema 错误中止 = 没跑起来，非判卷失败（禁记红也禁记绿）。
    return absenceRecord(
      plan,
      "not_run",
      `${exitNote}——工具执行错误（配置或 schema 错误中止 / 非契约退出码），非 property-based 判卷失败；stderr 摘录：${truncate(raw.stderr.slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  if (raw.exitCode === 1 && items.length === 0) {
    // 官方退出码已证有失败，NDJSON 重算明细为空——诚实下限 1（oasdiff 同款；
    // 先 push 后计数：counts.violations 与 items 必须同源一致，禁「passed+violations」
    // 式自相矛盾记录——P0 第二欺骗通道封死先例）。
    items.push({
      rule: "schemathesis_check_failed",
      location: plan.openapiPath,
      message: `schemathesis 官方退出码 1（至少一个 check 失败或有 bug 报告），但 NDJSON 重算明细为空；stdout 摘录：${truncate(raw.stdout.slice(0, SNIPPET_CHARS)) || "(空)"}`,
    });
  }
  const violations = items.length;
  if (violations > 0) {
    // 有重算失败 = failed（无论退出码——exit 0 + 失败是矛盾形态，按 C5 重算权威）。
    verdict = "failed";
    capReason = null;
  } else if (caps.length > 0) {
    verdict = "warning";
    capReason = caps.join("+");
  } else {
    verdict = "passed";
    capReason = null;
  }

  const scopeNote =
    `能力面=schemathesis property-based 契约测试（B3-4 招牌件：从受治项目声明的 OpenAPI ` +
    `（${plan.openapiPath}）生成用例并对目标 API 执行——schemathesis run 语义；官方 checks ` +
    `面 = not_a_server_error/status_code_conformance/response_schema_conformance 等，判卷分母 = ` +
    `报告 recorder.checks）；` +
    `违规 ${String(violations)} 条（判卷锚=NDJSON ${plan.reportPath} 重算：生成用例 ${String(totalGenerated)}（${String(parsed.scenarios.length)} scenario）/ checks ${String(totalChecks)}；` +
    `stop_reason=${parsed.stopReason ?? "(缺席)"}）；` +
    `${exitNote}`;

  const cappedItems = capItems(items);

  const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
    grn: plan.grn,
    gate: plan.gate,
    gateDef: plan.gateDef,
    ranAtSeq: plan.ranAtSeq,
    verdict,
    verdictCapReason: capReason,
    subjectId: plan.subjectId === null ? null : (plan.subjectId as GateResult["subjectId"]),
    isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
    denominatorRefs: plan.denominatorRefs.map((ref) => ({
      id: ref.id as GateResult["denominatorRefs"][number]["id"],
      versionSeen: ref.versionSeen,
    })),
    counts: {
      // 载体粒度 = 生成的 property-based 用例（B3-4 分母语义；粒度声明见函数头注）。
      scanned: totalGenerated,
      applicableScanned: totalGenerated,
      violations,
      notApplicable: 0,
    },
    blindspot: {
      // 载体 = 报告文件本身（完整回读且可解析 + 分母非零）。
      scanned: 1,
      produced: 1,
      escapeRatio: 0,
    },
    trust: {
      // NDJSON 是官方事件流记录而非自报判词；violations 由 recorder.checks 重算（C5）。
      asserted: null,
      recomputed: { violations, matchesAsserted: true },
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
