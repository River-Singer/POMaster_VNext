/**
 * playwright-leg.ts —— BROWSER 门禁确定性腿执行机械 + 官方报告解析（P26 /
 * 随版计划 Batch 3 B3-1「Playwright——evidence 必含 console error / network 维度」；
 * D22①「确定性腿：Playwright adapter（CI 断言：路由/console error/网络错误/核心流程）」；
 * PRD §26.2 BROWSER Gate 七项清单；security-leg.ts 同款三道闸先例）。
 *
 * ============================================================
 * 判卷锚与三道闸（P22/P23/P24/P25 先例全适用）
 * ============================================================
 * - 判卷锚 = 报告重算（C5）：官方 Playwright JSONReport 是唯一判卷输入；Playwright
 *   test 进程退出码不是判卷锚（「有失败即非零退出」语义随配置/重试漂移），报告回读
 *   + 本侧逐 test 重算才可对账。退出码只进 scopeNote 留痕。
 * - ⓪ 前置闸①a 可执行体 PATH 探测（Windows cmd 缺席以 status=1+error=null 伪装
 *   执行失败，spawn 前先证在位）→ spawn_failed → not_run；
 * - ① 前置闸①b 版本探测（`--version` 退出 0 且报出 semver 词形才算可执行）→
 *   spawn_failed → not_run，禁猜版本口径；
 * - ② 报告失效化（rmSync，P23 红队 MAJOR「陈旧报告误绿通道」封死）+ 真执行 +
 *   报告回读（缺席 = not_run，禁猜测判卷）。
 * - 报告路径安全闸：空路径/越出项目根 → pre_run_failed（rmSync 破坏性面前置拒绝）。
 *
 * ============================================================
 * 报告词形对账纪律（P22-P25 系统性教训；铁律 8）
 * ============================================================
 * 解析器消费的是 **Playwright 官方 JSONReport 词形**（`npx playwright test
 * --reporter=json` 产出；词形逐字段对账 microsoft/playwright 仓库官方类型
 * `packages/playwright/types/testReporter.d.ts` 的 JSONReport / JSONReportSuite /
 * JSONReportSpec / JSONReportTest / JSONReportTestResult——2026-08-31 官方词形：
 * - JSONReport: { config, suites: JSONReportSuite[], errors: TestError[], stats:
 *   { startTime, duration, expected, unexpected, flaky, skipped } }
 * - JSONReportSuite: { title, file, column, line, specs, suites? }（suites 递归嵌套）
 * - JSONReportSpec: { tags: string[], title, ok, tests, id, file, line, column }
 * - JSONReportTest: { timeout, annotations, expectedStatus, projectName, projectId,
 *   results, status: 'skipped'|'expected'|'unexpected'|'flaky' }
 * - JSONReportTestResult: { ..., attachments: { name, path?, body?, contentType }[] }
 * 本解析器的消费面（装载信息）与容忍面（装饰字段）：
 * - 装载（缺失即 malformed → not_run，禁默认值）：root.suites/root.errors 数组；
 *   suite.title/suite.file/suite.specs；spec.title/spec.file/spec.tests；
 *   test.status（官方四词形枚举，词形外=malformed）+ test.results（非空数组，
 *   executed test 零 results = 自相矛盾报告）；result.attachments 数组 + 条目
 *   name/contentType。
 * - 容忍（官方词形恒在但不消费，缺失不判 malformed）：config/stats/ok/tags/id/
 *   line/column/projectName/projectId/annotations——判卷一律从 test.status 重算
 *   （C5：stats.unexpected 与 spec.ok 是工具派生汇总，不作判卷锚，P23 红队
 *   「pct 字段不消费」同款纪律）。
 * **盲区显式登记**：本宿主未安装 Playwright，真实序列化产物无法在宿主验证——
 *   解析器对 attachments[].body 采用双词形宽容（官方 Reporter API 的 body 是
 *   Buffer，JSON 序列化为 base64 字符串；先按纯文本 JSON.parse，失败再 base64
 *   解码后 JSON.parse——两词形皆官方机制，词形漂移不判假红）；宿主 e2e 按
 *   skip 纪律显式跳过并留盲区说明。
 *
 * ============================================================
 * console error / network 维度契约（B3-1 强制：缺任一维 = 不完整判卷 → not_run）
 * ============================================================
 * 官方 JSONReport 无专设 console/network 字段；官方词形提供的一等扩展载体是
 * JSONReportTestResult.attachments[]（{name, contentType, path?, body?}）。
 * POMaster 侧遍历契约（traversal contract，与 security-gate.json 的「命令必须
 * 自行产出报告」同构的项目侧义务）：
 * - 每个执行（status ≠ skipped）的 test 的**末次 result**（官方按 retry 顺序排列，
 *   末位 = 最终尝试）必须携带名为 `console-errors` 与 `network-errors` 的附件；
 * - **同名多条聚合**（P26 红队 MAJOR 修复）：官方 testInfo.attach 同名多次调用
 *   合法（官方无去重/覆盖语义），同名契约附件的全部条目聚合判卷（维度内容 =
 *   多条合并，任何一条含违规即违规）——取首/取末都会开洗白通道（净前脏后/脏前
 *   净后两序皆判违规）；聚合面任一条目 path_only/unparseable/not_array 按该形态
 *   落（坏形条目禁被同名干净条目洗掉）；
 * - 附件 contentType 必须以 `application/json` 开头；载体必须是 body 内联
 *   （仅 path 落盘 = 载体不可用 → 不完整判卷，normalize 保持纯报告文本输入）；
 * - 附件 body 解码后必须是 JSON **数组**（空数组 = 干净是合法维度；缺席/非数组/
 *   不可解码 = 不完整判卷 → not_run，非默认值）；
 * - 维度条目宽容解析：字符串原样收；对象提取 text/message/title 文本字段与
 *   url/location 位置字段（缺项降级占位不丢弃——条目本身的存在就是违规信号）。
 * 项目侧典型实现：traversal fixture 里 page.on("console") 收集 msg.type()==="error"
 * 与 page.on("pageerror")，page.on("requestfailed")/非 2xx 响应收集网络错误，
 * afterEach 经 testInfo.attach(name, {body: JSON.stringify(...), contentType:
 * "application/json"}) 附着——机制全部是 Playwright 官方 API，无任何私造词形。
 *
 * ============================================================
 * §26.2 七项清单映射（逐项承载见 BROWSER_GATE_CHECKLIST_MAPPING，browser-adapter.ts）
 * ============================================================
 * - BROWSER 门禁不做档位豁免（PRD §27.1 MINIMAL 档原文「Gate 以 affected
 *   build/test/visual verify 为主」——visual verify 在最小档主集内，BROWSER 腿
 *   全档判卷；缺席语义由 config_absent/tool_absent 显式承载）。
 * - PATH 引号消毒（phaseC 附录 A 教训）；spawn maxBuffer 显式 64MB（P22 先例）；
 *   D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
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

export const PLAYWRIGHT_TOOL_ID = "gauntlet:playwright";
export const PLAYWRIGHT_METRIC_DIALECT = "browser:playwright_traversal";
export const PLAYWRIGHT_METRIC_DIALECT_UNDECLARED = "browser:undeclared";

export const BROWSER_GATE_CONFIG_FILE = "browser-gate.json";
export const PLAYWRIGHT_VERSION_PROBE_COMMAND =
  "corepack pnpm exec playwright --version";
export const PLAYWRIGHT_DEFAULT_REPORT = "reports/browser/playwright.json";
export const PLAYWRIGHT_DEFAULT_TIMEOUT_MS = 600_000;

/** console error 维度附件名（POMaster 遍历契约；载体=官方 attachments 词形）。 */
export const CONSOLE_DIMENSION_ATTACHMENT = "console-errors";
/** network error 维度附件名（POMaster 遍历契约；载体=官方 attachments 词形）。 */
export const NETWORK_DIMENSION_ATTACHMENT = "network-errors";
/** 维度附件 contentType 前缀（官方 attachments.contentType 自由串，契约锚 application/json）。 */
const DIMENSION_CONTENT_TYPE_PREFIX = "application/json";

export const PLAYWRIGHT_CONFIG_HINT =
  '在项目根 browser-gate.json 声明 BROWSER 确定性腿（P26/B3-1）：' +
  '{"playwright":{"command":"<遍历命令，须自行产出 Playwright JSON 报告到声明/缺省报告落点>"}}；' +
  '可选 "report"（报告落点，缺省 reports/browser/playwright.json——报告经 playwright.config 的 ' +
  "reporter [['json',{outputFile}]] 或 PLAYWRIGHT_JSON_OUTPUT_FILE 环境变量落盘，官方词形）、" +
  '可选 "versionProbe"（版本探测命令，缺省 corepack pnpm exec playwright --version）；' +
  '遍历契约：每个执行的 test 末次 result 须附着 "console-errors" 与 "network-errors" 两个 ' +
  "application/json 内联附件（JSON 数组，可空）——缺任一维=不完整判卷（B3-1 原文强制）；" +
  "未声明是诚实缺席（not_configured），不会被记为通过";

/** 单段配置（browser-gate.json 的 playwright 段；两可选字段缺省按常量落点）。 */
export interface PlaywrightLegConfig {
  /** 遍历命令原样执行（须自行产出官方 JSONReport 到声明/缺省报告落点）。 */
  readonly command: string;
  /** 报告落点声明（可选；null = 缺省 reports/browser/playwright.json）。 */
  readonly report: string | null;
  /** 版本探测命令（可选；null = 缺省 corepack pnpm exec playwright --version）。 */
  readonly versionProbe: string | null;
}

export type PlaywrightConfigRead =
  | { readonly ok: true; readonly config: PlaywrightLegConfig; readonly evidence: string }
  | { readonly ok: false; readonly reason: string; readonly installHint: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 读 browser-gate.json 的 playwright 段（fail-closed：文件缺席/JSON 坏形/段越形不 ok + 指引）。 */
export function readPlaywrightGateConfig(facts: {
  readonly projectRoot: string;
  readonly joinPath: (base: string, rel: string) => string;
  readonly readTextFile: (absolutePath: string) => string | null;
}): PlaywrightConfigRead {
  const configPath = facts.joinPath(facts.projectRoot, BROWSER_GATE_CONFIG_FILE);
  const raw = facts.readTextFile(configPath);
  if (raw === null) {
    return {
      ok: false,
      reason: `未找到 ${BROWSER_GATE_CONFIG_FILE}（BROWSER 门禁确定性腿的判卷输入未声明）`,
      installHint: `配置指引：${PLAYWRIGHT_CONFIG_HINT}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: `${BROWSER_GATE_CONFIG_FILE} 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默`,
      installHint: `修复 JSON 语法；形态见：${PLAYWRIGHT_CONFIG_HINT}`,
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      reason: `${BROWSER_GATE_CONFIG_FILE} 根必须是 JSON 对象（段键：playwright）`,
      installHint: `形态见：${PLAYWRIGHT_CONFIG_HINT}`,
    };
  }
  const section = parsed["playwright"];
  if (section === undefined) {
    return {
      ok: false,
      reason: `${BROWSER_GATE_CONFIG_FILE} 未声明 "playwright" 段（确定性腿判卷输入未声明——诚实缺席）`,
      installHint: `配置指引：${PLAYWRIGHT_CONFIG_HINT}`,
    };
  }
  if (!isPlainObject(section)) {
    return {
      ok: false,
      reason: `${BROWSER_GATE_CONFIG_FILE} 的 "playwright" 段必须是 JSON 对象 {"command":"<遍历命令，须自行产出 Playwright JSON 报告>"}`,
      installHint: `段形态见：${PLAYWRIGHT_CONFIG_HINT}`,
    };
  }
  const command = section["command"];
  if (typeof command !== "string" || command.trim().length === 0) {
    return {
      ok: false,
      reason: `${BROWSER_GATE_CONFIG_FILE} 的 "playwright" 段缺少非空字符串字段 command（遍历命令，须自行产出官方 JSONReport 到声明/缺省报告落点）`,
      installHint: `字段形态见：${PLAYWRIGHT_CONFIG_HINT}`,
    };
  }
  const report = section["report"];
  if (report !== undefined && (typeof report !== "string" || report.trim().length === 0)) {
    return {
      ok: false,
      reason: `${BROWSER_GATE_CONFIG_FILE} 的 "playwright" 段 report 必须是非空字符串（报告落点；缺省 ${PLAYWRIGHT_DEFAULT_REPORT}）`,
      installHint: `字段形态见：${PLAYWRIGHT_CONFIG_HINT}`,
    };
  }
  const versionProbe = section["versionProbe"];
  if (
    versionProbe !== undefined &&
    (typeof versionProbe !== "string" || versionProbe.trim().length === 0)
  ) {
    return {
      ok: false,
      reason: `${BROWSER_GATE_CONFIG_FILE} 的 "playwright" 段 versionProbe 必须是非空字符串（版本探测命令；缺省 ${PLAYWRIGHT_VERSION_PROBE_COMMAND}）`,
      installHint: `字段形态见：${PLAYWRIGHT_CONFIG_HINT}`,
    };
  }
  return {
    ok: true,
    config: {
      command,
      report: typeof report === "string" ? report.replaceAll("\\", "/") : null,
      versionProbe: typeof versionProbe === "string" ? versionProbe : null,
    },
    evidence: `配置文件命中: ${configPath}（playwright 段已声明）`,
  };
}

// ============================================================
// spawn：PATH 引号消毒默认实现（与 securitySpawn/coverageSpawn 同源同款）
// ============================================================

/** playwright 腿默认 spawn：PATH 消毒 + shell:true + 显式 64MB maxBuffer（P22 先例）。 */
export const playwrightSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const sanitizedEnv = stripQuotesFromPathEnv({ ...process.env });
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    // 显式 64MB（Node 默认 1MB 会被大报告/大输出 ENOBUFS 打断 → 结构性 not_run）。
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

/** playwright 腿执行计划（absenceKind 分流形态与 security/coverage 腿同款）。 */
export interface PlaywrightLegPlan extends RecordPlanFields {
  readonly projectRoot: string;
  readonly trigger: RunTriggerValue;
  readonly absenceKind: "config_absent" | "tool_absent" | null;
  readonly absentReason: string | null;
  readonly absentHint: string | null;
  /** 真执行命令（browser-gate.json 声明，原样执行——报告落点由命令自行产出）。 */
  readonly command: string;
  readonly versionProbeCommand: string;
  /** gate ①a 可执行体词形（版本探测命令首 token）。 */
  readonly executable: string;
  readonly timeoutMs: number;
  /** 仓内相对报告文件路径（run 侧失效化 + 回读 + items.location 可移植词形）。 */
  readonly reportPath: string;
  /** 版本锚（policy 供给——版本无法从配置文件可靠探测，security 腿同款）。 */
  readonly expectedToolVersion: string;
}

export interface PlaywrightLegOutput {
  readonly plan: PlaywrightLegPlan;
  /**
   * pre_run_failed = spawn 前安全/失效化闸拒绝（报告路径非法或陈旧报告删不掉——
   * spawn 未发生，fail-closed not_run）。
   */
  readonly kind: "executed" | "spawn_failed" | "pre_run_failed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly observedToolVersion: string | null;
  /** 报告文件回读文本（security 腿报告回读先例；缺席 = null → not_run 非绿非红）。 */
  readonly reportText: string | null;
  readonly externalMs: number;
  readonly failureReason: string | null;
}

/** 报告绝对路径是否越出项目根（含路径即根——rmSync 破坏性面前置拒绝判据）。 */
function pathEscapesProjectRoot(projectRoot: string, absolutePath: string): boolean {
  const rel = pathRelative(pathResolve(projectRoot), pathResolve(absolutePath));
  return rel === "" || rel.startsWith("..") || pathIsAbsolute(rel);
}

/** 报告文件绝对路径（run 侧失效化/回读共用）。 */
export function playwrightReportAbsolutePath(
  projectRoot: string,
  relativePath: string,
): string {
  return pathJoin(projectRoot, relativePath);
}

/** 报告文件仓内相对路径（配置声明优先；缺省固定落点）。 */
export function resolvePlaywrightReportPath(configValue: string | null): string {
  return (configValue ?? PLAYWRIGHT_DEFAULT_REPORT).replaceAll("\\", "/");
}

/**
 * playwright 腿执行：可执行体前置闸 + 版本探测 + 报告失效化 + 真执行 + 报告回读。
 * 报告文件从仓内计划路径回读——官方 JSONReport 文本止步于此（normalize 只认报告文本）。
 * spawn 前 rmSync 失效化（P23 红队 MAJOR 同款）：陈旧遗留报告禁跨 run 存活冒充本次判卷锚。
 */
export function runPlaywrightLeg(
  plan: PlaywrightLegPlan,
  spawnFn: SpawnFn = playwrightSpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
): PlaywrightLegOutput {
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
      failureReason: `playwright 腿可执行体 ${plan.executable} 不在 PATH（工具缺席——Windows cmd 下会以 status=1+error=null 伪装成执行失败，故 spawn 前先证在位）；hint: 按探测面安装指引安装后重跑`,
    };
  }

  // —— 前置闸①b：版本探测语义收紧（退出 0 且报出版本词形才算可执行）。
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
      failureReason: `playwright 腿版本探测失败（status=${String(probe.status)}, error=${probe.error ?? "unknown"}, 版本词形${observedToolVersion === null ? "不可得" : "可得"}）——工具缺席或损坏（Windows cmd 缺席形态即 status=1+error=null）；hint: 按探测面安装指引安装后重跑`,
    };
  }

  // —— 前置闸②a：判卷锚路径安全闸（失效化 rmSync 破坏性面前置拒绝）。
  const reportAbs = playwrightReportAbsolutePath(plan.projectRoot, plan.reportPath);
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
      failureReason: `playwright 腿报告路径非法：reportPath=${plan.reportPath === "" ? "(空)" : plan.reportPath}（空路径或越出项目根——spawn 前失效化面拒绝执行，fail-closed）`,
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
      failureReason: `playwright 腿报告失效化失败：${plan.reportPath} 在 spawn 前无法删除（被占用/权限不足/路径为目录占位）——无法保证本次判卷锚新鲜，fail-closed 拒绝执行`,
    };
  }

  // —— ② 真执行 + 报告回读（退出码非判卷锚——文件头注；normalize 以报告为锚）。
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
      ? `playwright 腿子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
  };
}

// ============================================================
// 官方 JSONReport 解析（词形对账 testReporter.d.ts；词形之外一律 malformed → null）
// ============================================================

/** 官方 attachments[] 条目词形（name/contentType 装载；body/path 双载体保留原文）。 */
export interface PlaywrightAttachment {
  readonly name: string;
  readonly contentType: string;
  /** 官方 JSONReportTestResult.attachments[].body（序列化后为字符串——base64 或纯文本双词形，原文保留）。 */
  readonly body: string | null;
  readonly path: string | null;
}

/** 官方 JSONReportTest 消费面（status 官方四词形枚举；attachments=末次 result 载体）。 */
export interface PlaywrightTestEntry {
  readonly status: "skipped" | "expected" | "unexpected" | "flaky";
  readonly projectName: string | null;
  readonly attachments: readonly PlaywrightAttachment[];
  /** 末次 result 的首条 error message（官方 JSONReportError.message；缺项 null）。 */
  readonly errorMessage: string | null;
}

/** 官方 JSONReportSpec 消费面（title/file 装载；line 容忍缺项）。 */
export interface PlaywrightSpecEntry {
  readonly title: string;
  readonly file: string;
  readonly line: number | null;
  readonly tests: readonly PlaywrightTestEntry[];
}

/** 官方 JSONReportSuite 消费面（suites 递归嵌套——官方 suites?: JSONReportSuite[]）。 */
export interface PlaywrightSuiteEntry {
  readonly title: string;
  readonly file: string;
  readonly specs: readonly PlaywrightSpecEntry[];
  readonly suites: readonly PlaywrightSuiteEntry[];
}

export interface ParsedPlaywrightReport {
  readonly suites: readonly PlaywrightSuiteEntry[];
  readonly errors: readonly string[];
}

const PLAYWRIGHT_TEST_STATUSES: readonly string[] = [
  "skipped",
  "expected",
  "unexpected",
  "flaky",
];

/** 官方 JSONReportError.message 提取（TestError.message 官方可缺——缺项 null）。 */
function parseErrorMessage(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const message = (value as Record<string, unknown>)["message"];
  return typeof message === "string" ? message : null;
}

/** 官方 JSONReportTestResult 消费面提取（attachments 装载 + 首条 error message）。 */
function parseTestResult(value: unknown):
  | {
      readonly attachments: readonly PlaywrightAttachment[];
      readonly errorMessage: string | null;
    }
  | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const rawAttachments = record["attachments"];
  if (!Array.isArray(rawAttachments)) {
    return null;
  }
  const attachments: PlaywrightAttachment[] = [];
  for (const entry of rawAttachments) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const att = entry as Record<string, unknown>;
    const name = att["name"];
    const contentType = att["contentType"];
    if (typeof name !== "string" || typeof contentType !== "string") {
      return null;
    }
    attachments.push({
      name,
      contentType,
      body: typeof att["body"] === "string" ? att["body"] : null,
      path: typeof att["path"] === "string" ? att["path"] : null,
    });
  }
  // errors[] 首条 message（官方 JSONReportError[]；元素缺 message 时占位降级非丢弃）。
  const rawErrors = record["errors"];
  let errorMessage: string | null = null;
  if (Array.isArray(rawErrors)) {
    for (const raw of rawErrors) {
      const message = parseErrorMessage(raw);
      if (message !== null) {
        errorMessage = message;
        break;
      }
    }
  }
  return { attachments, errorMessage };
}

/** 官方 JSONReportTest 词形提取（status 官方四词形枚举，词形外=malformed 禁猜）。 */
function parseTestEntry(value: unknown): PlaywrightTestEntry | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const rawStatus = record["status"];
  if (
    typeof rawStatus !== "string" ||
    !PLAYWRIGHT_TEST_STATUSES.includes(rawStatus)
  ) {
    return null;
  }
  const status = rawStatus as PlaywrightTestEntry["status"];
  const rawResults = record["results"];
  if (!Array.isArray(rawResults)) {
    return null;
  }
  if (status !== "skipped" && rawResults.length === 0) {
    // executed test 零 results = 自相矛盾报告（官方 retry 序恒 ≥1 条）→ malformed。
    return null;
  }
  // 官方 results 按 retry 顺序排列——末位 = 最终尝试（维度/错误以最终尝试为准）。
  const finalResult =
    rawResults.length > 0 ? parseTestResult(rawResults[rawResults.length - 1]) : null;
  if (finalResult === null) {
    return null;
  }
  const projectName = record["projectName"];
  return {
    status,
    projectName: typeof projectName === "string" ? projectName : null,
    attachments: finalResult.attachments,
    errorMessage: finalResult.errorMessage,
  };
}

/** 官方 JSONReportSpec 词形提取（title/file/tests 装载；line 容忍缺项）。 */
function parseSpecEntry(value: unknown): PlaywrightSpecEntry | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = record["title"];
  const file = record["file"];
  const rawTests = record["tests"];
  if (typeof title !== "string" || typeof file !== "string" || !Array.isArray(rawTests)) {
    return null;
  }
  const tests: PlaywrightTestEntry[] = [];
  for (const raw of rawTests) {
    const test = parseTestEntry(raw);
    if (test === null) {
      return null;
    }
    tests.push(test);
  }
  const line = record["line"];
  return {
    title,
    file,
    line: typeof line === "number" && Number.isFinite(line) ? line : null,
    tests,
  };
}

/** 官方 JSONReportSuite 词形提取（title/file/specs 装载；suites 递归可选）。 */
function parseSuiteEntry(value: unknown): PlaywrightSuiteEntry | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = record["title"];
  const file = record["file"];
  const rawSpecs = record["specs"];
  if (typeof title !== "string" || typeof file !== "string" || !Array.isArray(rawSpecs)) {
    return null;
  }
  const specs: PlaywrightSpecEntry[] = [];
  for (const raw of rawSpecs) {
    const spec = parseSpecEntry(raw);
    if (spec === null) {
      return null;
    }
    specs.push(spec);
  }
  const suites: PlaywrightSuiteEntry[] = [];
  const rawSuites = record["suites"];
  if (rawSuites !== undefined) {
    if (!Array.isArray(rawSuites)) {
      return null;
    }
    for (const raw of rawSuites) {
      const suite = parseSuiteEntry(raw);
      if (suite === null) {
        return null;
      }
      suites.push(suite);
    }
  }
  return { title, file, specs, suites };
}

/**
 * 官方 Playwright JSONReport 解析（`--reporter=json` 词形；装载面见文件头注——
 * 装载字段缺失/词形越界一律 null（malformed → not_run 禁默认值）；config/stats
 * 容忍缺项（不消费，判卷一律从 test.status 重算——C5）。
 */
export function parsePlaywrightJsonReport(text: string): ParsedPlaywrightReport | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }
  const record = root as Record<string, unknown>;
  const rawSuites = record["suites"];
  const rawErrors = record["errors"];
  if (!Array.isArray(rawSuites) || !Array.isArray(rawErrors)) {
    return null;
  }
  const suites: PlaywrightSuiteEntry[] = [];
  for (const raw of rawSuites) {
    const suite = parseSuiteEntry(raw);
    if (suite === null) {
      return null;
    }
    suites.push(suite);
  }
  // 官方 errors: TestError[]（message 官方可缺——缺项占位降级非丢弃；本腿不消费
  // 全局 errors 判卷——遍历分母以 suites 为准；留作词形装载面完整性）。
  const errors: string[] = [];
  for (const raw of rawErrors) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    const message = parseErrorMessage(raw);
    errors.push(message ?? "(message-missing)");
  }
  return { suites, errors };
}

// ============================================================
// 维度提取（console-errors / network-errors 附件；缺任一维 = 不完整判卷）
// ============================================================

/** 维度条目宽容解析词形（字符串原样收；对象提取文本/位置字段，缺项降级占位）。 */
export interface DimensionEntry {
  readonly text: string | null;
  readonly url: string | null;
}

export type DimensionExtraction =
  | { readonly kind: "ok"; readonly entries: readonly DimensionEntry[] }
  | { readonly kind: "missing"; readonly detail: string }
  | { readonly kind: "path_only"; readonly detail: string }
  | { readonly kind: "unparseable"; readonly detail: string }
  | { readonly kind: "not_array"; readonly detail: string };

/**
 * 附件 body 双词形解码（盲区宽容，见文件头注）：先按纯文本 JSON.parse（纯文本
 * 内联词形）；失败再 base64 解码后 JSON.parse（官方 Buffer.toString("base64")
 * 序列化词形）。两词形皆官方机制；词形之外（两者皆败）= 不可解码。
 */
function decodeDimensionArray(body: string):
  | { readonly kind: "array"; readonly value: readonly unknown[] }
  | { readonly kind: "not_array" }
  | { readonly kind: "unparseable" } {
  let parsed: unknown;
  let plainParsed = false;
  try {
    parsed = JSON.parse(body);
    plainParsed = true;
  } catch {
    // 纯文本词形失败——尝试 base64 词形。
  }
  if (!plainParsed) {
    let decoded: string;
    try {
      decoded = Buffer.from(body, "base64").toString("utf8");
    } catch {
      return { kind: "unparseable" };
    }
    try {
      parsed = JSON.parse(decoded);
    } catch {
      return { kind: "unparseable" };
    }
  }
  if (!Array.isArray(parsed)) {
    return { kind: "not_array" };
  }
  return { kind: "array", value: parsed };
}

function toDimensionEntry(raw: unknown): DimensionEntry {
  if (typeof raw === "string") {
    return { text: raw, url: null };
  }
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const text =
      typeof record["text"] === "string"
        ? record["text"]
        : typeof record["message"] === "string"
          ? record["message"]
          : typeof record["title"] === "string"
            ? record["title"]
            : null;
    const url =
      typeof record["url"] === "string"
        ? record["url"]
        : typeof record["location"] === "string"
          ? record["location"]
          : null;
    return { text, url };
  }
  // 数字/布尔/null 条目——存在即信号，字段缺项占位降级非丢弃。
  return { text: null, url: null };
}

/**
 * 从末次 result 的 attachments 提取一个维度（POMaster 遍历契约，见文件头注）：
 * - 契约名附件缺席 → missing（B3-1：缺任一维 = 不完整判卷）；
 * - contentType 不以 application/json 开头 → missing（契约形态不符——维度未按
 *   声明形态承载；正文形态的宽容只属于 body 编码词形，contentType 是契约锚）；
 * - 仅 path 落盘（无 body）→ path_only（normalize 纯报告文本输入的契约边界）；
 * - body 不可解码 → unparseable；解码后非数组 → not_array（空数组 = 干净是合法维度）。
 *
 * **同名多条聚合**（P26 红队 MAJOR 修复）：官方 testInfo.attach 同名多次调用合法
 * （官方 Reporter API 无去重/覆盖语义），取首条 = 「净前脏后」洗白通道——附件序
 * [console-errors:净, console-errors:脏] 会被首条洗成干净（红队亲跑实锤）。修复 =
 * 聚合全部同名契约附件的条目（维度内容 = 多条合并）：任何一条含违规即违规（最
 * 保守且与「任何脏条目必现形」的判卷语义对齐）；聚合面任一条目出现 path_only /
 * unparseable / not_array 均按该形态落（fail-closed——坏形条目可能携带被隐藏的
 * 违规，不允许被同名的干净条目洗掉）。
 */
export function extractDimension(
  attachments: readonly PlaywrightAttachment[],
  attachmentName: string,
): DimensionExtraction {
  const hits = attachments.filter(
    (att) =>
      att.name === attachmentName &&
      att.contentType.startsWith(DIMENSION_CONTENT_TYPE_PREFIX),
  );
  if (hits.length === 0) {
    return {
      kind: "missing",
      detail: `名为「${attachmentName}」的 ${DIMENSION_CONTENT_TYPE_PREFIX} 附件缺席`,
    };
  }
  const entries: DimensionEntry[] = [];
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index] as PlaywrightAttachment;
    const ordinal = `同名 ${String(hits.length)} 条中第 ${String(index + 1)} 条`;
    if (hit.body === null) {
      return {
        kind: "path_only",
        detail: `附件「${attachmentName}」（${ordinal}）仅 path 落盘无 body 内联（契约要求 body 内联 JSON 数组；同名多条聚合面任一条目坏形即不完整判卷）`,
      };
    }
    const decoded = decodeDimensionArray(hit.body);
    if (decoded.kind === "unparseable") {
      return {
        kind: "unparseable",
        detail: `附件「${attachmentName}」（${ordinal}）body 不可解码（纯文本与 base64 两官方词形皆非 JSON；坏形条目禁被同名干净条目洗掉）`,
      };
    }
    if (decoded.kind === "not_array") {
      return {
        kind: "not_array",
        detail: `附件「${attachmentName}」（${ordinal}）body 解码后非 JSON 数组（契约要求数组，空数组=干净是合法维度；坏形条目禁被同名干净条目洗掉）`,
      };
    }
    entries.push(...decoded.value.map(toDimensionEntry));
  }
  return { kind: "ok", entries };
}

// ============================================================
// normalize：报告重算 → GateResultRecord（七项清单判卷承载，见 CHECKLIST_MAPPING）
// ============================================================

const SNIPPET_CHARS = 200;

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_CHARS
    ? `${collapsed.slice(0, SNIPPET_CHARS)}…`
    : collapsed;
}

/** 遍历套件展开（suites 递归 → 全 spec 线性序；确定性：先 specs 后子 suites）。 */
function flattenSpecs(suites: readonly PlaywrightSuiteEntry[]): PlaywrightSpecEntry[] {
  const out: PlaywrightSpecEntry[] = [];
  for (const suite of suites) {
    out.push(...suite.specs);
    out.push(...flattenSpecs(suite.suites));
  }
  return out;
}

/** playwright 腿判卷核心（判卷锚=报告重算；七项清单承载见 BROWSER_GATE_CHECKLIST_MAPPING）。 */
export function normalizePlaywrightLeg(
  raw: PlaywrightLegOutput,
  selfMs: number,
): GateResultRecord {
  const plan = raw.plan;
  if (raw.kind !== "executed") {
    // spawn_failed（探测/子进程不可执行）与 pre_run_failed（路径非法/陈旧报告删不掉）
    // 同走 not_run 非绿非红；failureReason 携带具体路标。
    return absenceRecord(
      plan,
      "not_run",
      `${raw.failureReason ?? "playwright 腿子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  if (raw.reportText === null) {
    return absenceRecord(
      plan,
      "not_run",
      `playwright 腿报告未产出/不可读：${plan.reportPath}（工具 exit=${String(raw.exitCode)} 不构成通过——报告是唯一判卷锚；核对命令是否含 --reporter=json 报告落点声明后重跑）（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  const parsed = parsePlaywrightJsonReport(raw.reportText);
  if (parsed === null) {
    return absenceRecord(
      plan,
      "not_run",
      `playwright 腿报告词形不可解析：${plan.reportPath}——解析器对账官方 JSONReport 词形（suites/specs/tests/results/attachments，test.status 官方四词形枚举）；词形之外一律 malformed 落 not_run 禁默认值；报告摘录：${truncate(raw.reportText.slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
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

  const specs = flattenSpecs(parsed.suites);

  // —— 零分母闸（P26 红队 MAJOR 修复）：报告词形可解析但 suites/specs/tests 展开后
  // 零 testcase（空 suites / 空 specs / 空 tests 三形态同判）——维度闸与判卷循环
  // 零迭代空转会落「passed + counts.scanned=0」假绿。自家先例 mutation-leg
  // computeKillScore：分母为 0 必须落 not_run 禁当满分（0%/100% 皆禁）。空分母
  // 形态非满分，非绿非红。
  const totalTests = specs.reduce((sum, spec) => sum + spec.tests.length, 0);
  if (totalTests === 0) {
    return absenceRecord(
      plan,
      "not_run",
      `playwright 腿报告零分母：${plan.reportPath} 词形可解析但 suites/specs/tests 展开后零 testcase（空 suites / 空 specs / 空 tests 三形态同判）——空分母禁当满分（mutation-leg computeKillScore 先例：generated=0 必须落 not_run）；核对遍历命令是否真实执行用例（--reporter=json 报告空集）后重跑（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  // —— 维度完整性闸（B3-1 强制：缺任一维 = 不完整判卷 → not_run，非默认值）。
  // 载体 = 每个执行 test 的末次 result attachments；skipped test 无执行面不要求维度。
  for (const spec of specs) {
    for (const test of spec.tests) {
      if (test.status === "skipped") {
        continue;
      }
      for (const [dimensionName] of [
        [CONSOLE_DIMENSION_ATTACHMENT, "console error"],
        [NETWORK_DIMENSION_ATTACHMENT, "network error"],
      ] as const) {
        const extraction = extractDimension(test.attachments, dimensionName);
        if (extraction.kind !== "ok") {
          const where = `${spec.file}${spec.line === null ? "" : `:${String(spec.line)}`} › ${spec.title}`;
          return absenceRecord(
            plan,
            "not_run",
            `playwright 腿维度不完整（${dimensionName}）：spec「${where}」的执行 test 末次 result —— ${extraction.detail}；遍历契约：每个执行 test 须附着 "${CONSOLE_DIMENSION_ATTACHMENT}" 与 "${NETWORK_DIMENSION_ATTACHMENT}" 两个 application/json 内联 JSON 数组附件（B3-1 原文：evidence 必含 console error / network 维度，缺任一维=不完整判卷）（not_run，非绿非红，禁静默当通过）`,
            selfMs,
            raw.externalMs,
          );
        }
      }
    }
  }

  const items: GateResultItemInput[] = [];
  let scanned = 0;
  let skipped = 0;
  let unexpected = 0;
  let flaky = 0;
  let consoleEntries = 0;
  let networkEntries = 0;

  for (const spec of specs) {
    const location = `${spec.file.replaceAll("\\", "/")}${spec.line === null ? "" : `:${String(spec.line)}`}`;
    for (const test of spec.tests) {
      scanned += 1;
      if (test.status === "skipped") {
        skipped += 1;
        continue;
      }
      if (test.status === "unexpected") {
        unexpected += 1;
        items.push({
          rule: "playwright_test_failed",
          location,
          message: `遍历 spec 失败：${test.projectName === null ? "" : `${test.projectName} › `}${spec.title}（status=unexpected）${test.errorMessage === null ? "" : `；${truncate(test.errorMessage)}`}`,
        });
      }
      if (test.status === "flaky") {
        flaky += 1;
      }
      const consoleDimension = extractDimension(
        test.attachments,
        CONSOLE_DIMENSION_ATTACHMENT,
      );
      if (consoleDimension.kind === "ok") {
        for (const entry of consoleDimension.entries) {
          consoleEntries += 1;
          items.push({
            rule: "browser_console_error",
            location,
            message: `Console Error：${entry.text ?? "(条目未携带文本字段 text/message/title)"}${entry.url === null ? "" : `；url=${entry.url}`}`,
          });
        }
      }
      const networkDimension = extractDimension(
        test.attachments,
        NETWORK_DIMENSION_ATTACHMENT,
      );
      if (networkDimension.kind === "ok") {
        for (const entry of networkDimension.entries) {
          networkEntries += 1;
          items.push({
            rule: "browser_network_error",
            location,
            message: `Network Error：${entry.text ?? "(条目未携带文本字段 text/message/title)"}${entry.url === null ? "" : `；url=${entry.url}`}`,
          });
        }
      }
    }
  }

  const violations = items.length;
  if (flaky > 0) {
    // flaky = 重试后通过（官方 test.status='flaky'）——非 violations 但不可静默：
    // cap 呈报（无违规时降 warning；有违规时 failed 不被 cap 洗白，security 腿同线）。
    caps.push("playwright_flaky_tests");
  }

  let verdict: VerdictValue;
  let capReason: string | null;
  if (violations > 0) {
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
    `能力面=确定性遍历（PRD §26.2 七项清单承载见 BROWSER_GATE_CHECKLIST_MAPPING；` +
    `页面加载/Console Error/Network Error 直接判卷，SPA Route/Login/核心流程经项目遍历套件 ` +
    `spec 覆盖——全 spec 结果重算不猜归类；D22①）；` +
    `违规 ${String(violations)} 条（判卷锚=报告 ${plan.reportPath} 重算：失败 spec ${String(unexpected)} + console-error ${String(consoleEntries)} + network-error ${String(networkEntries)}）；` +
    `tests ${String(scanned)}（skipped ${String(skipped)} / flaky ${String(flaky)}）；` +
    `runner=playwright exit=${String(raw.exitCode)}（退出码非判卷锚）`;

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
      // 载体粒度 = 遍历 test（分母由报告承载）。
      scanned,
      applicableScanned: scanned - skipped,
      violations,
      notApplicable: skipped,
    },
    blindspot: {
      // 载体 = 报告文件本身（完整回读且可解析 + 双维度完整；维度外盲区由能力面声明承载）。
      scanned: 1,
      produced: 1,
      escapeRatio: 0,
    },
    trust: {
      // 报告是工具测量输出而非自报判词；violations 由报告重算得出（C5，security 腿同款）。
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

// ============================================================
// 计划组装共用件（adapter prepare 消费）
// ============================================================

/** gate ①a 可执行体（versionProbe 命令首 token；firstCommandToken 同源）。 */
export function playwrightLegExecutable(versionProbeCommand: string): string {
  return firstCommandToken(versionProbeCommand);
}
