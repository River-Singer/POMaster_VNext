/**
 * performance-leg.ts —— PERFORMANCE 门禁执行腿机械与官方报告解析（P27 / 随版计划
 * Batch 3 后段 B3-3「Lighthouse / web-vitals——对接 §29 性能预算字段」；PRD §29.1
 * performance_budget 六字段；security-leg.ts / playwright-leg.ts 同款三道闸先例）。
 *
 * 权威出处：
 * - 随版计划 B3-3 原文：「Lighthouse / web-vitals | PERFORMANCE | 对接 §29 性能
 *   预算字段（performance_budget：initial_js_gzip_kb/lcp_ms/inp_ms 等，PRD §29.1）」；
 * - PRD §29.1：六字段（initial_js_gzip_kb / max_chunk_kb / lcp_ms / inp_ms /
 *   long_task_ms / max_memory_mb）——字段集封闭，禁发明字段；schema 唯一来源 =
 *   02 信封 $definitions.PerformanceBudget（@pomaster/schemas
 *   performanceBudgetDefinition / PERFORMANCE_BUDGET_FIELDS 派生导出，零镜像漂移）；
 * - 「不同页面允许不同预算」（§29.1 原文）→ budget 声明全部字段可选、≥1 字段即合法。
 *
 * ============================================================
 * 双 runner 判卷分工（官方工具能力面对账，2026-08-31 逐字对账官方仓库/文档）
 * ============================================================
 * - **lighthouse 腿（实验室数据 lab）**：官方 Lighthouse LHR JSON 报告
 *   （`lighthouse --output=json --output-path=<file>` 产出；词形逐字段对账
 *   GoogleChrome/lighthouse 官方 types/lhr/lhr.d.ts + types/lhr/audit-result.d.ts
 *   + core/config/default-config.js，2026-08-31 官方词形：
 *   - LHR 根：{ audits: Record<string, AuditResult>, categories, fetchTime,
 *     lighthouseVersion, runWarnings, ... }（lhr.d.ts Result.audits——
 *     audits 以审计 id 为键）；
 *   - AuditResult：{ id, score: number|null, scoreDisplayMode:
 *     'numeric'|'binary'|'metricSavings'|'manual'|'informative'|'notApplicable'|'error',
 *     numericValue?: number, numericUnit?: string, details?, errorMessage?, ... }；
 *   - §29.1 字段 → 官方审计 id 映射（default-config.js 注册 id 逐字）：
 *     · lcp_ms → audits["largest-contentful-paint"]（core/audits/metrics/
 *       largest-contentful-paint.js：numericValue=timing，numericUnit 'millisecond'
 *       ——审计直读判卷前断言该单位词形（P27 双核验单位闸）：numericUnit ≠
 *       'millisecond' 即词形漂移，数值与 ms 预算不可比，禁把秒当毫秒比较
 *       （漂移方向=洗白），malformed → 判卷锚不完整 not_run fail-closed）；
 *     · inp_ms → audits["interaction-to-next-paint"]（core/audits/metrics/
 *       interaction-to-next-paint.js：numericValue=duration ms，numericUnit
 *       'millisecond'；**官方语义**：throttlingMethod=simulate（默认）或无交互时
 *       返回 notApplicable（scoreDisplayMode 'notApplicable'，numericValue 缺席）
 *       ——实验室单加载抓不到真实交互是工具已知边界，非本仓发明）；
 *     · initial_js_gzip_kb → audits["network-requests"]（core/audits/
 *       network-requests.js：details.items[] 逐条 {url, transferSize, resourceSize,
 *       resourceType, ...} 官方 Table 词形）——operationalization：resourceType
 *       === "Script" 条目的 transferSize（wire 传输字节 = gzip 后）求和 ÷ 1024 =
 *       KB。该 operationalization 在 scopeNote 如实披露（非官方单审计直读，是
 *       官方词形上的派生测量）；transferSize 非有限非负数的条目不计入求和并在
 *       scopeNote 披露条数（不发明 -1 等内部哨兵值语义）；
 *     · long_task_ms → audits["long-tasks"]（core/audits/long-tasks.js：
 *       details.items[] 逐条 {url, startTime, duration}，duration ms）——预算
 *       语义 = 单任务时长上限，任一条目 duration > 预算即违规。**官方收录阈披露**
 *       （P27 双核验 MINOR）：long-tasks 只收录 duration ≥ 50ms 的任务（Long Tasks
 *       API 规范阈）——预算声明 <50 时低于阈任务本就不进报告分母，判卷覆盖声明
 *       如实收窄（capability note 披露承载；判卷语义不动，官方词形即官方边界）。
 *       **官方截断披露**：
 *       报告只保留 duration 降序前 20 条（DISPLAYED_TASK_COUNT=20，源码
 *       slice(0, DISPLAYED_TASK_COUNT)）——超预算任务必在降序头部，截断不洗白
 *       违规存在性（「是否存在超预算任务」判卷面截断安全）；条数口径不消费
 *       （截断不安全，禁用）；
 *     · max_chunk_kb / max_memory_mb → **无 Lighthouse 官方单审计承载**（官方
 *       default-config 无 chunk 尺寸/内存审计），本腿不消费、显式登记盲区
 *       （禁发明承载）。若 budget 只声明这两个字段 → 本腿零判卷分母 → 零分母闸
 *       not_run（禁当满分）。
 * - **web-vitals 腿（字段数据 field）**：官方 GoogleChrome/web-vitals 库 Metric
 *   对象词形（src/types/base.ts，2026-08-31 官方词形：{ name:
 *   'CLS'|'FCP'|'INP'|'LCP'|'TTFB', value: number, rating:
 *   'good'|'needs-improvement'|'poor', delta, id, entries, navigationType, ... }）。
 *   官方无报告文件词形（库在页面内回调）——报告容器 = POMaster 遍历契约
 *   （traversal contract，与 playwright 腿 console/network 附件契约同构）：
 *   项目侧 harness（如 Playwright/无头浏览器脚本加载页面、注入 web-vitals
 *   onLCP/onINP 回调收集 Metric 对象）须自行产出 {"metrics": [Metric, ...]}
 *   JSON 报告到声明/缺省落点；**条目词形是官方 Metric（装载面：name/value/rating
 *   ——name 官方五枚举词形外 = malformed 禁猜；id/entries/navigationType 等
 *   官方字段容忍缺项不消费）**。判卷：lcp_ms → name="LCP"、inp_ms → name="INP"
 *   的 value 对预算；同名 metric 多条目**聚合判卷**（官方语义：bfcache 恢复等
 *   会产生新 metric 实例——任一条目超预算即违规，取首/取末都会开洗白通道，
 *   P26 同名附件聚合先例）。rating 是工具派生汇总，不消费（C5）。
 *
 * ============================================================
 * 判卷锚与三道闸（P22/P23/P24/P25/P26 先例全适用）
 * ============================================================
 * - 判卷锚 = 报告重算（C5）：官方报告是唯一判卷输入；工具退出码不是判卷锚
 *   （Lighthouse 违规不改变退出码语义随旗标漂移），报告回读 + 本侧逐字段重算
 *   预算超标才可对账。退出码只进 scopeNote 留痕。
 * - ⓪ 前置闸①a 可执行体 PATH 探测（Windows cmd 缺席以 status=1+error=null 伪装
 *   执行失败，spawn 前先证在位）→ spawn_failed → not_run；
 * - ① 前置闸①b 版本探测（`--version` 退出 0 且报出 semver 词形才算可执行）→
 *   spawn_failed → not_run，禁猜版本口径；
 * - ② 报告失效化（rmSync，P23 红队 MAJOR「陈旧报告误绿通道」封死）+ 真执行 +
 *   报告回读（缺席 = not_run，禁猜测判卷）。
 * - 报告路径安全闸：空路径/越出项目根 → pre_run_failed（rmSync 破坏性面前置拒绝）。
 *
 * ============================================================
 * 判卷矩阵（两 runner 共用机械、按 plan.runner 分派解析与承载面）
 * ============================================================
 * - violations = 声明预算中本 runner 承载字段的超标条数（value > budget 即超标，
 *   等于预算不算超——预算是上限不是下限）；每条超标一个 item（rule=
 *   performance_budget_exceeded，location=审计 id 或 metric 名 + 声明落点，
 *   message 携带实测值/预算值/字段名）；
 * - 声明预算中本 runner **不承载**的字段：不消费，scopeNote 能力面声明如实披露
 *   （P25 如实标注纪律；禁冒充全量判卷）；
 * - 声明预算中本 runner 承载、但报告未携带可判卷实测（审计缺席 / notApplicable /
 *   numericValue 非有限数 / numericUnit ≠ 'millisecond'（单位词形漂移——P27 双核验
 *   单位闸，禁把秒当毫秒比较）/ 声明 metric 无条目）→ 判卷锚不完整 → **not_run**
 *   （playwright 缺维先例；非绿非红禁默认值）；
 * - 零分母闸（P26 红队 MAJOR 先例）：可解析报告 + 本 runner 承载分母为零
 *   （budget 只声明非承载字段 / web-vitals 报告 metrics 空数组）→ not_run
 *   （空分母禁当满分，mutation-leg computeKillScore 先例）；
 * - 版本漂移 → warning cap=tool_version_drifted；violations > 0 → failed 不被
 *   cap 洗白（security/vitest/pytest/oasdiff 腿同一条线）。
 *
 * PATH 引号消毒（phaseC 附录 A 教训）；spawn maxBuffer 显式 64MB（P22 先例）；
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
import { PERFORMANCE_BUDGET_FIELDS } from "@pomaster/schemas";
import type {
  ExecutableProbeFn,
  GateResultItemInput,
  GateResultRecord,
  GateTier,
  SpawnFn,
  SpawnOutcome,
} from "./adapter-types.js";
import { POLICY_EXEMPT_GATE_TIERS, SPAWN_MAX_BUFFER_BYTES } from "./adapter-types.js";
import {
  firstCommandToken,
  platformExecutableProbe,
  sanitizeSemver,
  stripQuotesFromPathEnv,
} from "./detectors.js";
import { absenceRecord, capItems, type RecordPlanFields } from "./normalize-common.js";

export const PERFORMANCE_GATE_NAME = "PERFORMANCE";
export const PERFORMANCE_GATE_DEF = "POLICY.GATE.PERFORMANCE@0.1.0";
export const PERFORMANCE_GATE_CONFIG_FILE = "performance-gate.json";
export const LIGHTHOUSE_TOOL_ID = "gauntlet:lighthouse";
export const WEB_VITALS_TOOL_ID = "gauntlet:web-vitals";

/**
 * 双 runner metric_dialect（横切纪律 2：一条 GateResult 只携带一个 metric_dialect
 * ——lighthouse 实验室判卷与 web-vitals 字段判卷各自独立记录，禁混口径）。
 */
export const LIGHTHOUSE_METRIC_DIALECT = "performance:lighthouse_budget";
export const WEB_VITALS_METRIC_DIALECT = "performance:web_vitals_budget";
/** 缺席记录的机器可辨口径轴（security:undeclared 同款）。 */
export const PERFORMANCE_METRIC_DIALECT_UNDECLARED = "performance:undeclared";
export const PERFORMANCE_POLICY_SKIP_METRIC_DIALECT = "performance:policy_skip";

export const LIGHTHOUSE_VERSION_PROBE_COMMAND = "lighthouse --version";
export const LIGHTHOUSE_DEFAULT_REPORT = "reports/performance/lighthouse.json";
export const WEB_VITALS_DEFAULT_REPORT = "reports/performance/web-vitals.json";
export const DEFAULT_PERFORMANCE_TIMEOUT_MS = 600_000;

/** performance-gate.json 段键（webVitals=camelCase 段键，与 runner 词形分离）。 */
export type PerformanceLegRunner = "lighthouse" | "web-vitals";
export const PERFORMANCE_LEG_RUNNERS: readonly PerformanceLegRunner[] = [
  "lighthouse",
  "web-vitals",
];

// ============================================================
// §29.1 字段 → 官方承载映射（单一表——解析/判卷/scopeNote 共用，禁第二份拷贝；
// 字段集以 @pomaster/schemas PERFORMANCE_BUDGET_FIELDS 为准，禁在此扩字段）
// ============================================================

/** lighthouse 腿携带的 §29.1 字段（官方审计 id 对账；映射依据见文件头注）。 */
export const LIGHTHOUSE_AUDIT_CARRIERS = {
  lcp_ms: "largest-contentful-paint",
  inp_ms: "interaction-to-next-paint",
} as const;
/** lcp/inp 之外的 lighthouse 携带字段（派生测量面，见头注 operationalization）。 */
export const LIGHTHOUSE_DERIVED_CARRIERS = [
  "initial_js_gzip_kb",
  "long_task_ms",
] as const;
export const LIGHTHOUSE_CARRIED_FIELDS: readonly string[] = [
  ...Object.keys(LIGHTHOUSE_AUDIT_CARRIERS),
  ...LIGHTHOUSE_DERIVED_CARRIERS,
].sort();
/** 官方审计 id（network-requests / long-tasks——default-config.js 逐字）。 */
export const LIGHTHOUSE_NETWORK_REQUESTS_AUDIT = "network-requests";
export const LIGHTHOUSE_LONG_TASKS_AUDIT = "long-tasks";
/** 官方 network-requests items 的 JS 资源类型词形（Lighthouse resourceType 枚举）。 */
export const LIGHTHOUSE_SCRIPT_RESOURCE_TYPE = "Script";
/**
 * 官方 numericUnit 毫秒词形（P27 双核验单位闸锚）：lcp/inp 审计直读判卷的 numericUnit
 * 官方恒为 'millisecond'——词形漂移（'second' 等）时数值与 ms 预算不可比，单位换算
 * 禁猜测（漂移方向=洗白：4.1 秒会被误读成 4.1 ms 落入预算），malformed → not_run。
 */
export const LIGHTHOUSE_MS_NUMERIC_UNIT = "millisecond";

/** web-vitals 腿携带的 §29.1 字段（官方 Metric name 对账；映射依据见文件头注）。 */
export const WEB_VITALS_METRIC_CARRIERS = {
  lcp_ms: "LCP",
  inp_ms: "INP",
} as const;
export const WEB_VITALS_CARRIED_FIELDS: readonly string[] =
  Object.keys(WEB_VITALS_METRIC_CARRIERS).sort();

/** 官方 Metric.name 五枚举词形（web-vitals src/types/base.ts 逐字）。 */
export const WEB_VITALS_METRIC_NAMES: readonly string[] = [
  "CLS",
  "FCP",
  "INP",
  "LCP",
  "TTFB",
];
/** 官方 Metric.rating 三枚举词形（web-vitals src/types/base.ts 逐字；装载面必填）。 */
export const WEB_VITALS_METRIC_RATINGS: readonly string[] = [
  "good",
  "needs-improvement",
  "poor",
];

/** 官方 LHR scoreDisplayMode 词形（types/lhr/audit-result.d.ts 逐字）。 */
export const LIGHTHOUSE_SCORE_DISPLAY_MODES: readonly string[] = [
  "numeric",
  "binary",
  "metricSavings",
  "manual",
  "informative",
  "notApplicable",
  "error",
];

/** 预算超标违规 rule 词形（03 items[].rule）。 */
export const PERFORMANCE_BUDGET_EXCEEDED_RULE = "performance_budget_exceeded";

/** 能力面声明（每腿判卷记录恒携带——P25 如实标注纪律；承载映射随声明逐字）。 */
export function performanceCapabilityNote(runner: PerformanceLegRunner): string {
  if (runner === "lighthouse") {
    return (
      "能力面=Lighthouse 实验室预算判卷（PRD §29.1 字段子集 lcp_ms→largest-contentful-paint / " +
      "inp_ms→interaction-to-next-paint / initial_js_gzip_kb→network-requests Script transferSize 求和 " +
      "（operationalization：wire 字节=gzip 后，÷1024=KB）/ long_task_ms→long-tasks 单任务时长上限 " +
      "（官方收录阈 50ms：预算 <50 时低于阈任务不进报告分母，判卷覆盖声明如实收窄）；" +
      "max_chunk_kb/max_memory_mb 无 Lighthouse 官方单审计承载——显式盲区，不由本腿冒充判卷）；" +
      "inp_ms 官方边界：simulate 节流（默认）或无交互时审计 notApplicable（工具已知边界，如实 not_run）"
    );
  }
  return (
    "能力面=web-vitals 字段数据预算判卷（PRD §29.1 字段子集 lcp_ms→Metric LCP / inp_ms→Metric INP；" +
    "其余四字段非 web-vitals 官方 Metric 承载——不由本腿冒充判卷）；报告容器=POMaster 遍历契约 " +
    '{"metrics":[Metric,...]}（项目侧 harness 自行产出；条目词形=官方 Metric），' +
    "同名 metric 多条目聚合判卷（任一条目超预算即违规——bfcache 等官方多实例语义，取首/取末都会洗白）"
  );
}

// ============================================================
// spawn：PATH 引号消毒默认实现（与 securitySpawn/playwrightSpawn 同源同款）
// ============================================================

/** performance 腿默认 spawn：PATH 消毒 + shell:true + 显式 64MB maxBuffer（P22 先例）。 */
export const performanceSpawn: SpawnFn = (command, options) => {
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
// 配置读取（performance-gate.json；budget 段字段集 = schema 派生，禁发明）
// ============================================================

export const PERFORMANCE_CONFIG_HINT =
  "在项目根 performance-gate.json 声明性能预算判卷输入（P27/B3-3）：" +
  '"budget":{...}（PRD §29.1 字段子集，至少 1 个：initial_js_gzip_kb/max_chunk_kb/lcp_ms/inp_ms/long_task_ms/max_memory_mb——字段集封闭禁发明）、' +
  '双 runner 段按需声明（各自独立，可同时声明）：' +
  '"lighthouse":{"command":"lighthouse <url> --output=json --output-path=reports/performance/lighthouse.json"}（官方 LHR JSON 报告），' +
  '"webVitals":{"command":"<项目侧 web-vitals 收集 harness，须自行产出 {\\"metrics\\":[Metric,...]} JSON 报告>","versionProbe":"<版本探测命令>"}（' +
  "web-vitals 是库非 CLI，versionProbe 必填）；" +
  '各段可选 "report"（报告落点，缺省 reports/performance/<lighthouse|web-vitals>.json）；' +
  "未声明是诚实缺席（not_configured），不会被记为通过";

/** budget 声明（§29.1 字段 → 数值上限；字段集封闭 = schema 派生全集）。 */
export type PerformanceBudgetDeclaration = Readonly<Record<string, number>>;

/** 单 runner 段（lighthouse：versionProbe 可选有缺省；web-vitals：versionProbe 必填）。 */
export interface PerformanceLegToolConfig {
  /** 真执行命令原样执行（须自行产出官方词形报告到声明/缺省报告落点）。 */
  readonly command: string;
  /** 报告落点声明（可选；null = runner 缺省 reports/performance/<runner>.json）。 */
  readonly report: string | null;
  /** 版本探测命令（lighthouse 缺省 lighthouse --version；web-vitals 必填无缺省）。 */
  readonly versionProbe: string | null;
}

export interface PerformanceGateConfig {
  readonly budget: PerformanceBudgetDeclaration;
  readonly lighthouse: PerformanceLegToolConfig | null;
  readonly webVitals: PerformanceLegToolConfig | null;
}

export type PerformanceConfigRead =
  | { readonly ok: true; readonly config: PerformanceGateConfig; readonly evidence: string }
  | { readonly ok: false; readonly reason: string; readonly installHint: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** budget 段解析（字段集 = PERFORMANCE_BUDGET_FIELDS schema 派生；≥1 字段；值=非负有限数）。 */
function parseBudgetSection(
  value: unknown,
): { readonly kind: "ok"; readonly budget: PerformanceBudgetDeclaration } | {
  readonly kind: "invalid";
  readonly reason: string;
} {
  if (!isPlainObject(value)) {
    return {
      kind: "invalid",
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 的 "budget" 段必须是 JSON 对象（PRD §29.1 字段子集，至少 1 个字段：${PERFORMANCE_BUDGET_FIELDS.join(" / ")}）`,
    };
  }
  const budget: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!PERFORMANCE_BUDGET_FIELDS.includes(key)) {
      return {
        kind: "invalid",
        reason: `${PERFORMANCE_GATE_CONFIG_FILE} 的 "budget" 段字段 "${key}" 不在 §29.1 字段集（${PERFORMANCE_BUDGET_FIELDS.join(" / ")}）——字段集封闭（02 信封 $definitions.PerformanceBudget additionalProperties:false），禁发明字段`,
      };
    }
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return {
        kind: "invalid",
        reason: `${PERFORMANCE_GATE_CONFIG_FILE} 的 "budget" 段字段 "${key}" 必须是非负有限数（预算上限；schema $definitions.PerformanceBudget type:number minimum:0）`,
      };
    }
    budget[key] = raw;
  }
  if (Object.keys(budget).length === 0) {
    return {
      kind: "invalid",
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 的 "budget" 段为空对象（§29.1 允许字段子集但至少声明 1 个字段——空预算无判卷语义，schema minProperties:1）`,
    };
  }
  return { kind: "ok", budget };
}

/** 单 runner 段解析（webVitals 的 versionProbe 必填——库非 CLI 无可派生缺省，禁猜口径）。 */
function parseRunnerSection(
  runner: PerformanceLegRunner,
  value: unknown,
): { readonly kind: "ok"; readonly config: PerformanceLegToolConfig } | {
  readonly kind: "invalid";
  readonly reason: string;
} {
  if (!isPlainObject(value)) {
    return {
      kind: "invalid",
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 的 "${runner === "lighthouse" ? "lighthouse" : "webVitals"}" 段必须是 JSON 对象 {"command":"<真执行命令，须自行产出官方词形报告>"}`,
    };
  }
  const command = value["command"];
  if (typeof command !== "string" || command.trim().length === 0) {
    return {
      kind: "invalid",
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 的 "${runner === "lighthouse" ? "lighthouse" : "webVitals"}" 段缺少非空字符串字段 command（真执行命令，须自行产出官方词形报告到声明/缺省报告落点）`,
    };
  }
  const report = value["report"];
  if (report !== undefined && (typeof report !== "string" || report.trim().length === 0)) {
    return {
      kind: "invalid",
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 的 "${runner === "lighthouse" ? "lighthouse" : "webVitals"}" 段 report 必须是非空字符串（报告落点；缺省 reports/performance/${runner}.json）`,
    };
  }
  const versionProbe = value["versionProbe"];
  if (versionProbe !== undefined && (typeof versionProbe !== "string" || versionProbe.trim().length === 0)) {
    return {
      kind: "invalid",
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 的 "${runner === "lighthouse" ? "lighthouse" : "webVitals"}" 段 versionProbe 必须是非空字符串（版本探测命令）`,
    };
  }
  if (runner === "web-vitals" && versionProbe === undefined) {
    return {
      kind: "invalid",
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 的 "webVitals" 段缺少 versionProbe（web-vitals 是库非 CLI，版本探测命令无可派生缺省——禁猜口径；项目侧 harness 版本探测命令必须显式声明）`,
    };
  }
  return {
    kind: "ok",
    config: {
      command,
      report: typeof report === "string" ? report.replaceAll("\\", "/") : null,
      versionProbe: typeof versionProbe === "string" ? versionProbe : null,
    },
  };
}

/** 读 performance-gate.json（fail-closed：文件缺席/JSON 坏形/段越形不 ok + 指引）。 */
export function readPerformanceGateConfig(facts: {
  readonly projectRoot: string;
  readonly joinPath: (base: string, rel: string) => string;
  readonly readTextFile: (absolutePath: string) => string | null;
}): PerformanceConfigRead {
  const configPath = facts.joinPath(facts.projectRoot, PERFORMANCE_GATE_CONFIG_FILE);
  const raw = facts.readTextFile(configPath);
  if (raw === null) {
    return {
      ok: false,
      reason: `未找到 ${PERFORMANCE_GATE_CONFIG_FILE}（PERFORMANCE 门禁的预算判卷输入未声明）`,
      installHint: `配置指引：${PERFORMANCE_CONFIG_HINT}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默`,
      installHint: `修复 JSON 语法；形态见：${PERFORMANCE_CONFIG_HINT}`,
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 根必须是 JSON 对象（段键：budget / lighthouse / webVitals）`,
      installHint: `形态见：${PERFORMANCE_CONFIG_HINT}`,
    };
  }
  const budgetSection = parseBudgetSection(parsed["budget"]);
  if (budgetSection.kind === "invalid") {
    return {
      ok: false,
      reason: budgetSection.reason,
      installHint: `配置指引：${PERFORMANCE_CONFIG_HINT}`,
    };
  }
  const rawLighthouse = parsed["lighthouse"];
  const rawWebVitals = parsed["webVitals"];
  let lighthouse: PerformanceLegToolConfig | null = null;
  if (rawLighthouse !== undefined) {
    const read = parseRunnerSection("lighthouse", rawLighthouse);
    if (read.kind === "invalid") {
      return {
        ok: false,
        reason: read.reason,
        installHint: `配置指引：${PERFORMANCE_CONFIG_HINT}`,
      };
    }
    lighthouse = read.config;
  }
  let webVitals: PerformanceLegToolConfig | null = null;
  if (rawWebVitals !== undefined) {
    const read = parseRunnerSection("web-vitals", rawWebVitals);
    if (read.kind === "invalid") {
      return {
        ok: false,
        reason: read.reason,
        installHint: `配置指引：${PERFORMANCE_CONFIG_HINT}`,
      };
    }
    webVitals = read.config;
  }
  if (lighthouse === null && webVitals === null) {
    return {
      ok: false,
      reason: `${PERFORMANCE_GATE_CONFIG_FILE} 已声明 budget 但未声明任何 runner 段（lighthouse / webVitals 至少声明一段——判卷执行面缺席）`,
      installHint: `配置指引：${PERFORMANCE_CONFIG_HINT}`,
    };
  }
  return {
    ok: true,
    config: { budget: budgetSection.budget, lighthouse, webVitals },
    evidence: `配置文件命中: ${configPath}（budget ${Object.keys(budgetSection.budget).length} 字段；lighthouse=${lighthouse === null ? "未声明" : "声明"} / webVitals=${webVitals === null ? "未声明" : "声明"}）`,
  };
}

// ============================================================
// 计划与执行
// ============================================================

/** performance 腿执行计划（absenceKind 分流形态与 security/playwright 腿同款）。 */
export interface PerformanceLegPlan extends RecordPlanFields {
  readonly projectRoot: string;
  readonly runner: PerformanceLegRunner;
  readonly trigger: RunTriggerValue;
  readonly absenceKind: "profile_not_required" | "config_absent" | "tool_absent" | null;
  readonly absentReason: string | null;
  readonly absentHint: string | null;
  /** 档位（normalize 的 policy_skip 注记与判卷面留痕；prepare 解析自 policy.gateTier）。 */
  readonly tier: GateTier;
  /** 声明预算（prepare 从配置读入——判卷输入，normalize 只认计划内声明）。 */
  readonly budget: PerformanceBudgetDeclaration;
  /** 本 runner 承载的 §29.1 字段（声明预算 ∩ 承载集——判卷分母，prepare 算定）。 */
  readonly carriedBudgetFields: readonly string[];
  /** 真执行命令（performance-gate.json 本 runner 段声明，原样执行）。 */
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

export interface PerformanceLegOutput {
  readonly plan: PerformanceLegPlan;
  /**
   * pre_run_failed = spawn 前安全/失效化闸拒绝（报告路径非法或陈旧报告删不掉——
   * spawn 未发生，fail-closed not_run）。
   */
  readonly kind: "executed" | "spawn_failed" | "pre_run_failed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly observedToolVersion: string | null;
  /** 报告文件回读文本（报告回读先例；缺席 = null → not_run 非绿非红）。 */
  readonly reportText: string | null;
  readonly externalMs: number;
  readonly failureReason: string | null;
}

/** 报告绝对路径是否越出项目根（含路径即根——rmSync 破坏性面前置拒绝判据）。 */
function pathEscapesProjectRoot(projectRoot: string, absolutePath: string): boolean {
  const rel = pathRelative(pathResolve(projectRoot), pathResolve(absolutePath));
  return rel === "" || rel.startsWith("..") || pathIsAbsolute(rel);
}

/** 报告文件仓内相对路径（配置声明优先；缺省按 runner 固定落点）。 */
export function resolvePerformanceReportPath(
  runner: PerformanceLegRunner,
  configValue: string | null,
): string {
  const fallback =
    runner === "lighthouse"
      ? LIGHTHOUSE_DEFAULT_REPORT
      : WEB_VITALS_DEFAULT_REPORT;
  return (configValue ?? fallback).replaceAll("\\", "/");
}

/** 报告文件绝对路径（run 侧失效化/回读共用）。 */
export function performanceReportAbsolutePath(
  projectRoot: string,
  relativePath: string,
): string {
  return pathJoin(projectRoot, relativePath);
}

/** performance 腿 gate ①a 可执行体（firstCommandToken 同源；版本探测命令首 token）。 */
export function performanceLegExecutable(versionProbeCommand: string): string {
  return firstCommandToken(versionProbeCommand);
}

/** version 探测命令（prepare 组装 versionProbeCommand 用；web-vitals 必填已过配置闸）。 */
export function performanceVersionProbeCommand(
  runner: PerformanceLegRunner,
  configValue: string | null,
): string {
  if (runner === "lighthouse") {
    return configValue ?? LIGHTHOUSE_VERSION_PROBE_COMMAND;
  }
  // web-vitals 无缺省（配置闸已强制显式声明——此处 null 不可达，防御性回退探测缺席态）。
  return configValue ?? "";
}

/** 本 runner 承载的声明预算字段（声明预算 ∩ 承载集，prepare 算定判卷分母）。 */
export function carriedBudgetFieldsOf(
  runner: PerformanceLegRunner,
  budget: PerformanceBudgetDeclaration,
): readonly string[] {
  const carried =
    runner === "lighthouse" ? LIGHTHOUSE_CARRIED_FIELDS : WEB_VITALS_CARRIED_FIELDS;
  return Object.keys(budget)
    .filter((field) => carried.includes(field))
    .sort();
}

/**
 * performance 腿执行：可执行体前置闸 + 版本探测 + 报告失效化 + 真执行 + 报告回读。
 * 报告文件从仓内计划路径回读——官方报告文本止步于此（normalize 只认报告文本）。
 * spawn 前 rmSync 失效化（P23 红队 MAJOR 同款）：陈旧遗留报告禁跨 run 存活冒充本次判卷锚。
 */
export function runPerformanceLeg(
  plan: PerformanceLegPlan,
  spawnFn: SpawnFn = performanceSpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
): PerformanceLegOutput {
  // —— 前置闸①a：可执行体 PATH 探测（security/playwright 腿同款；Windows cmd 缺席
  // 以 status=1+error=null 伪装执行失败，spawn 前先证在位）。
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
      failureReason: `performance 腿（${plan.runner}）可执行体 ${plan.executable} 不在 PATH（工具缺席——Windows cmd 下会以 status=1+error=null 伪装成执行失败，故 spawn 前先证在位）；hint: 按探测面安装指引安装后重跑`,
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
      failureReason: `performance 腿（${plan.runner}）版本探测失败（status=${String(probe.status)}, error=${probe.error ?? "unknown"}, 版本词形${observedToolVersion === null ? "不可得" : "可得"}）——工具缺席或损坏（Windows cmd 缺席形态即 status=1+error=null）；hint: 按探测面安装指引安装后重跑`,
    };
  }

  // —— 前置闸②a：判卷锚路径安全闸（失效化 rmSync 破坏性面前置拒绝）。
  const reportAbs = performanceReportAbsolutePath(plan.projectRoot, plan.reportPath);
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
      failureReason: `performance 腿（${plan.runner}）报告路径非法：reportPath=${plan.reportPath === "" ? "(空)" : plan.reportPath}（空路径或越出项目根——spawn 前失效化面拒绝执行，fail-closed）`,
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
      failureReason: `performance 腿（${plan.runner}）报告失效化失败：${plan.reportPath} 在 spawn 前无法删除（被占用/权限不足/路径为目录占位）——无法保证本次判卷锚新鲜，fail-closed 拒绝执行`,
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
      ? `performance 腿（${plan.runner}）子进程执行失败（status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
  };
}

// ============================================================
// 官方 Lighthouse LHR 报告解析（词形对账 types/lhr/*.d.ts；词形之外一律 malformed → null）
// ============================================================

/** 官方 AuditResult 消费面（id/scoreDisplayMode/numericValue/numericUnit/details）。 */
export interface LighthouseAuditEntry {
  readonly id: string | null;
  readonly scoreDisplayMode: string | null;
  readonly numericValue: number | null;
  readonly numericUnit: string | null;
  readonly detailsItems: readonly unknown[] | null;
}

/** 官方 LHR 根消费面（audits 装载；categories/fetchTime/lighthouseVersion 容忍缺项不消费）。 */
export interface ParsedLighthouseReport {
  readonly audits: Readonly<Record<string, LighthouseAuditEntry>>;
}

/** 官方 Table details 词形提取（details.items——network-requests/long-tasks 消费面）。 */
function parseDetailsItems(value: unknown): readonly unknown[] | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const items = (value as Record<string, unknown>)["items"];
  return Array.isArray(items) ? items : null;
}

function parseAuditEntry(id: string, value: unknown): LighthouseAuditEntry | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const scoreDisplayMode = record["scoreDisplayMode"];
  if (
    typeof scoreDisplayMode === "string" &&
    !LIGHTHOUSE_SCORE_DISPLAY_MODES.includes(scoreDisplayMode)
  ) {
    // scoreDisplayMode 官方七枚举词形之外 = malformed（禁猜语义）。
    return null;
  }
  const numericValue = record["numericValue"];
  return {
    id: typeof record["id"] === "string" ? record["id"] : id,
    scoreDisplayMode: typeof scoreDisplayMode === "string" ? scoreDisplayMode : null,
    numericValue:
      typeof numericValue === "number" && Number.isFinite(numericValue)
        ? numericValue
        : null,
    numericUnit: typeof record["numericUnit"] === "string" ? record["numericUnit"] : null,
    detailsItems: parseDetailsItems(record["details"]),
  };
}

/**
 * 官方 LHR 解析（`--output=json` 词形；装载面 = audits 对象（逐审计
 * id/scoreDisplayMode/numericValue/numericUnit/details.items）；categories/
 * fetchTime/lighthouseVersion 等容忍缺项不消费——判卷一律从审计实测重算（C5）。
 * audits 缺席/非对象/审计条目词形越界 → null（malformed → not_run 禁默认值）。
 */
export function parseLighthouseJsonReport(text: string): ParsedLighthouseReport | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }
  const rawAudits = (root as Record<string, unknown>)["audits"];
  if (rawAudits === null || typeof rawAudits !== "object" || Array.isArray(rawAudits)) {
    return null;
  }
  const audits: Record<string, LighthouseAuditEntry> = {};
  for (const [id, entry] of Object.entries(rawAudits as Record<string, unknown>)) {
    const parsed = parseAuditEntry(id, entry);
    if (parsed === null) {
      return null;
    }
    audits[id] = parsed;
  }
  return { audits };
}

// ============================================================
// 官方 web-vitals 报告解析（容器 = POMaster 遍历契约；条目 = 官方 Metric 词形）
// ============================================================

/** 官方 Metric 消费面（name/value/rating 装载；id/entries/navigationType 容忍缺项不消费）。 */
export interface WebVitalsMetricEntry {
  readonly name: string;
  readonly value: number;
  readonly rating: string;
}

/**
 * web-vitals 报告解析：容器 = POMaster 遍历契约 {"metrics": [Metric, ...]}
 * （官方无报告文件词形——库在页面内回调，容器词形是项目侧义务，与 playwright
 * console/network 附件契约同构）；条目装载面 = 官方 Metric 的 name（官方五枚举，
 * 词形外 = malformed 禁猜）/ value（有限数）/ rating（官方三枚举）。metrics 缺席/
 * 非数组/条目词形越界 → null（malformed → not_run 禁默认值）。
 */
export function parseWebVitalsReport(text: string): readonly WebVitalsMetricEntry[] | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }
  const rawMetrics = (root as Record<string, unknown>)["metrics"];
  if (!Array.isArray(rawMetrics)) {
    return null;
  }
  const metrics: WebVitalsMetricEntry[] = [];
  for (const entry of rawMetrics) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    const name = record["name"];
    const value = record["value"];
    const rating = record["rating"];
    if (
      typeof name !== "string" ||
      !WEB_VITALS_METRIC_NAMES.includes(name) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      typeof rating !== "string" ||
      !WEB_VITALS_METRIC_RATINGS.includes(rating)
    ) {
      return null;
    }
    metrics.push({ name, value, rating });
  }
  return metrics;
}

// ============================================================
// normalize：报告重算 → GateResultRecord（预算超标判卷链）
// ============================================================

const SNIPPET_CHARS = 200;

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_CHARS
    ? `${collapsed.slice(0, SNIPPET_CHARS)}…`
    : collapsed;
}

/** 单字段「报告未携带可判卷实测」的统一路标词形。 */
function missingMeasurementDetail(
  runner: PerformanceLegRunner,
  field: string,
  detail: string,
): string {
  return `${field}：${detail}`;
}

/**
 * performance 腿判卷核心（判卷锚 = 报告重算；预算超标判卷链：声明预算 ∩ 承载集
 * = 判卷分母，逐字段实测 vs 预算重算；矩阵见文件头注）。
 *
 * counts/blindspot 载体粒度声明：
 * - counts.scanned = 声明预算 ∩ 承载集字段数（判卷分母由「声明预算 × 承载面」承载；
 *   web-vitals 腿的条目聚合不改变字段分母——多实例聚合到字段级判卷）；
 * - violations = 超标字段计数（一字段多条目超标 = 1 字段违规 + items 逐条目明细，
 *   聚合到字段级计数与 items 明细粒度不同是刻意设计并在此声明——oasdiff 腿
 *   scanned/violations 粒度分离先例）；
 * - blindspot 载体 = 报告文件本身（完整回读且可解析 + 承载字段全部有实测）。
 */
export function normalizePerformanceLeg(
  raw: PerformanceLegOutput,
  selfMs: number,
): GateResultRecord {
  const plan = raw.plan;
  if (raw.kind !== "executed") {
    // spawn_failed（探测/子进程不可执行）与 pre_run_failed（路径非法/陈旧报告删不掉）
    // 同走 not_run 非绿非红；failureReason 携带具体路标。
    return absenceRecord(
      plan,
      "not_run",
      `${raw.failureReason ?? "performance 腿子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  if (raw.reportText === null) {
    return absenceRecord(
      plan,
      "not_run",
      `performance 腿（${plan.runner}）报告未产出/不可读：${plan.reportPath}（工具 exit=${String(raw.exitCode)} 不构成通过——报告是唯一判卷锚；核对命令是否含官方报告输出落点声明后重跑）（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const carriedFields = plan.carriedBudgetFields;
  const notCarriedFields = Object.keys(plan.budget)
    .filter((field) => !carriedFields.includes(field))
    .sort();

  // —— 零分母闸（P26 红队 MAJOR 先例）：声明预算 ∩ 承载集 = 空判卷分母——
  // budget 只声明本 runner 不承载的字段 → 零迭代空转会落假绿。空分母非满分。
  if (carriedFields.length === 0) {
    return absenceRecord(
      plan,
      "not_run",
      `performance 腿（${plan.runner}）零判卷分母：budget 声明的 ${Object.keys(plan.budget).sort().join(" / ")} 均非本 runner 承载字段（承载集：${(plan.runner === "lighthouse" ? LIGHTHOUSE_CARRIED_FIELDS : WEB_VITALS_CARRIED_FIELDS).join(" / ")}）——空分母禁当满分（mutation-leg computeKillScore 先例：generated=0 必须落 not_run）；调整 budget 或改用承载这些字段的 runner（not_run，非绿非红，禁静默当通过）`,
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

  if (plan.runner === "lighthouse") {
    return normalizeLighthouseBudget(
      raw,
      selfMs,
      carriedFields,
      notCarriedFields,
      caps,
      effectiveVersion,
    );
  }
  return normalizeWebVitalsBudget(
    raw,
    selfMs,
    carriedFields,
    notCarriedFields,
    caps,
    effectiveVersion,
  );
}

/** lighthouse 腿预算判卷（官方 LHR 审计实测 vs 声明预算；映射见 LIGHTHOUSE_*_CARRIERS）。 */
function normalizeLighthouseBudget(
  raw: PerformanceLegOutput,
  selfMs: number,
  carriedFields: readonly string[],
  notCarriedFields: readonly string[],
  caps: string[],
  effectiveVersion: string,
): GateResultRecord {
  const plan = raw.plan;
  const parsed = parseLighthouseJsonReport(raw.reportText ?? "");
  if (parsed === null) {
    return absenceRecord(
      plan,
      "not_run",
      `performance 腿（lighthouse）报告词形不可解析：${plan.reportPath}——解析器对账官方 LHR 词形（audits 以审计 id 为键 + AuditResult.scoreDisplayMode 官方七枚举）；词形之外一律 malformed 落 not_run 禁默认值；报告摘录：${truncate((raw.reportText ?? "").slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const items: GateResultItemInput[] = [];
  const incompleteMeasurements: string[] = [];
  const uncarriedNotes: string[] = [];

  for (const field of carriedFields) {
    const budgetValue = plan.budget[field];
    if (field === "initial_js_gzip_kb") {
      const audit = parsed.audits[LIGHTHOUSE_NETWORK_REQUESTS_AUDIT];
      if (
        audit === undefined ||
        audit.scoreDisplayMode === "error" ||
        audit.detailsItems === null
      ) {
        incompleteMeasurements.push(
          missingMeasurementDetail(
            "lighthouse",
            field,
            `官方审计 "${LIGHTHOUSE_NETWORK_REQUESTS_AUDIT}" 缺席或 details.items 词形不可解析（判卷锚不完整——禁默认值）`,
          ),
        );
        continue;
      }
      // 官方 Table 词形逐条 {url, transferSize, resourceType, ...}；operationalization
      // 见文件头注（Script transferSize 求和 ÷1024）。非有限非负 transferSize 条目
      // 不计入并披露（不发明内部哨兵值语义）。
      let sumBytes = 0;
      let counted = 0;
      let excluded = 0;
      let malformed = false;
      for (const entry of audit.detailsItems) {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
          malformed = true;
          break;
        }
        const record = entry as Record<string, unknown>;
        const resourceType = record["resourceType"];
        const transferSize = record["transferSize"];
        if (typeof resourceType !== "string" || typeof transferSize !== "number") {
          malformed = true;
          break;
        }
        if (resourceType !== LIGHTHOUSE_SCRIPT_RESOURCE_TYPE) {
          continue;
        }
        if (!Number.isFinite(transferSize) || transferSize < 0) {
          excluded += 1;
          continue;
        }
        sumBytes += transferSize;
        counted += 1;
      }
      if (malformed) {
        incompleteMeasurements.push(
          missingMeasurementDetail(
            "lighthouse",
            field,
            `官方审计 "${LIGHTHOUSE_NETWORK_REQUESTS_AUDIT}" 的 details.items 条目词形越界（官方词形逐条含 resourceType/transferSize；坏形禁猜测判卷）`,
          ),
        );
        continue;
      }
      const measuredKb = sumBytes / 1024;
      if (budgetValue === undefined) {
        continue;
      }
      if (measuredKb > budgetValue) {
        items.push({
          rule: PERFORMANCE_BUDGET_EXCEEDED_RULE,
          location: `${LIGHTHOUSE_NETWORK_REQUESTS_AUDIT}#${field}`,
          message: `${field} 超预算：实测 ${measuredKb.toFixed(1)} KB（${LIGHTHOUSE_SCRIPT_RESOURCE_TYPE} transferSize 求和 / ${String(counted)} 条请求${excluded > 0 ? `；${String(excluded)} 条 transferSize 非有限非负未计入` : ""}）> 预算 ${String(budgetValue)} KB`,
        });
      }
      continue;
    }
    if (field === "long_task_ms") {
      const audit = parsed.audits[LIGHTHOUSE_LONG_TASKS_AUDIT];
      if (audit === undefined || audit.detailsItems === null) {
        incompleteMeasurements.push(
          missingMeasurementDetail(
            "lighthouse",
            field,
            `官方审计 "${LIGHTHOUSE_LONG_TASKS_AUDIT}" 缺席或 details.items 词形不可解析（判卷锚不完整——禁默认值）`,
          ),
        );
        continue;
      }
      // 官方词形逐条 {url, startTime, duration}；预算语义 = 单任务时长上限。
      // 官方只保留 duration 降序前 20 条（DISPLAYED_TASK_COUNT）——「是否存在超
      // 预算任务」判卷面截断安全（超预算者必在降序头部）；条数口径截断不安全不消费。
      if (audit.scoreDisplayMode === "notApplicable") {
        // 官方语义：零长任务 → 该字段判卷干净（无任务可超预算）。
        continue;
      }
      let anyMalformed = false;
      const overbudgetTasks: { url: string | null; duration: number }[] = [];
      for (const entry of audit.detailsItems) {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
          anyMalformed = true;
          break;
        }
        const record = entry as Record<string, unknown>;
        const duration = record["duration"];
        const url = record["url"];
        if (typeof duration !== "number" || !Number.isFinite(duration)) {
          anyMalformed = true;
          break;
        }
        if (budgetValue !== undefined && duration > budgetValue) {
          overbudgetTasks.push({
            url: typeof url === "string" ? url : null,
            duration,
          });
        }
      }
      if (anyMalformed) {
        incompleteMeasurements.push(
          missingMeasurementDetail(
            "lighthouse",
            field,
            `官方审计 "${LIGHTHOUSE_LONG_TASKS_AUDIT}" 的 details.items 条目词形越界（官方词形逐条含 duration 数值；坏形禁猜测判卷）`,
          ),
        );
        continue;
      }
      if (budgetValue === undefined) {
        continue;
      }
      for (const task of overbudgetTasks) {
        items.push({
          rule: PERFORMANCE_BUDGET_EXCEEDED_RULE,
          location: `${LIGHTHOUSE_LONG_TASKS_AUDIT}#${field}${task.url === null ? "" : `@${task.url.replaceAll("\\", "/")}`}`,
          message: `${field} 超预算：长任务实测 ${String(Math.round(task.duration))} ms > 单任务上限 ${String(budgetValue)} ms（官方报告按 duration 降序保留前 20 条——超预算任务必在其中，截断不洗白）`,
        });
      }
      continue;
    }
    // —— 官方审计直读字段（lcp_ms / inp_ms）——
    const auditId = LIGHTHOUSE_AUDIT_CARRIERS[field as "lcp_ms" | "inp_ms"];
    if (auditId === undefined) {
      // 不可达形态（carriedFields ⊆ 承载集，承载集 = 审计直读 ∪ 派生）——防御性显式拒绝。
      incompleteMeasurements.push(
        missingMeasurementDetail("lighthouse", field, "字段无 lighthouse 承载映射（内部判卷矩阵破坏）"),
      );
      continue;
    }
    const audit = parsed.audits[auditId];
    if (audit === undefined) {
      incompleteMeasurements.push(
        missingMeasurementDetail(
          "lighthouse",
          field,
          `官方审计 "${auditId}" 在报告 audits 中缺席（判卷锚不完整——禁默认值）`,
        ),
      );
      continue;
    }
    if (audit.scoreDisplayMode === "error") {
      incompleteMeasurements.push(
        missingMeasurementDetail(
          "lighthouse",
          field,
          `官方审计 "${auditId}" scoreDisplayMode=error（审计运行错误——判卷锚不完整，禁默认值）`,
        ),
      );
      continue;
    }
    if (audit.scoreDisplayMode === "notApplicable" || audit.numericValue === null) {
      // 官方语义（interaction-to-next-paint.js）：simulate 节流（默认）或无交互 →
      // notApplicable（numericValue 缺席）——实验室单加载抓不到真实交互是工具已知
      // 边界；判卷锚不完整 → not_run（非绿非红禁默认值，也禁当干净）。
      incompleteMeasurements.push(
        missingMeasurementDetail(
          "lighthouse",
          field,
          `官方审计 "${auditId}" ${audit.scoreDisplayMode === "notApplicable" ? "notApplicable（官方语义：simulate 节流默认形态或页面无交互，实验室单加载无实测）" : "numericValue 缺席/非有限数"}——本报告无法判卷该字段；改用 timespan 模式（--throttling-method=devtools + 交互注入）或由 web-vitals 腿承载该字段`,
        ),
      );
      continue;
    }
    if (audit.numericUnit !== LIGHTHOUSE_MS_NUMERIC_UNIT) {
      // 单位闸（P27 双核验 MINOR）：官方 numeric 审计的 numericUnit 恒为
      // 'millisecond'——词形漂移（'second' 等/缺席）时数值与 ms 预算不可比（4.1 秒
      // 会被误读成 4.1 ms 落入预算=洗白方向），单位换算禁猜测 → 判卷锚不完整
      // not_run（带留痕，fail-closed；非绿非红禁默认值）。
      incompleteMeasurements.push(
        missingMeasurementDetail(
          "lighthouse",
          field,
          `官方审计 "${auditId}" numericUnit=${audit.numericUnit === null ? "缺席" : `"${audit.numericUnit}"`} ≠ 官方 "${LIGHTHOUSE_MS_NUMERIC_UNIT}"（单位词形漂移——数值与 ms 预算不可比，单位换算禁猜测，fail-closed）`,
        ),
      );
      continue;
    }
    if (budgetValue === undefined) {
      continue;
    }
    if (audit.numericValue > budgetValue) {
      items.push({
        rule: PERFORMANCE_BUDGET_EXCEEDED_RULE,
        location: `${auditId}#${field}`,
        message: `${field} 超预算：实测 ${audit.numericValue.toFixed(1)}${audit.numericUnit === null ? "" : ` ${audit.numericUnit}`} > 预算 ${String(budgetValue)} ms（审计 ${auditId}）`,
      });
    }
  }

  for (const field of notCarriedFields) {
    uncarriedNotes.push(
      `${field}（非 lighthouse 承载字段——无官方单审计承载，显式盲区；不由本腿冒充判卷）`,
    );
  }

  if (incompleteMeasurements.length > 0) {
    // 判卷锚不完整（承载字段缺实测）→ not_run（playwright 缺维先例；声明面哪些
    // 字段无实测逐条点名，非绿非红禁默认值）。
    return absenceRecord(
      plan,
      "not_run",
      `performance 腿（lighthouse）判卷锚不完整：${incompleteMeasurements.join("；")}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const violations = items.length;

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
    `${performanceCapabilityNote("lighthouse")}；` +
    `违规 ${String(violations)} 条（判卷锚=报告 ${plan.reportPath} 重算：声明预算 ${Object.keys(plan.budget).sort().join(" / ")} ∩ lighthouse 承载集 = 判卷分母 ${carriedFields.join(" / ")}${uncarriedNotes.length > 0 ? `；未判卷字段：${uncarriedNotes.join("；")}` : ""}）；` +
    `runner=lighthouse exit=${String(raw.exitCode)}（退出码非判卷锚——判卷锚=报告重算）`;

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
      // 载体粒度 = 判卷分母字段数（items 明细可为任务/条目级——粒度声明见函数头注）。
      scanned: carriedFields.length,
      applicableScanned: carriedFields.length,
      violations,
      notApplicable: 0,
    },
    blindspot: {
      // 载体 = 报告文件本身（完整回读且可解析 + 承载字段全部有实测；非承载字段的
      // 盲区由能力面声明在 scopeNote 承载）。
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

/** web-vitals 腿预算判卷（官方 Metric 实测 vs 声明预算；同名多实例聚合）。 */
function normalizeWebVitalsBudget(
  raw: PerformanceLegOutput,
  selfMs: number,
  carriedFields: readonly string[],
  notCarriedFields: readonly string[],
  caps: string[],
  effectiveVersion: string,
): GateResultRecord {
  const plan = raw.plan;
  const parsed = parseWebVitalsReport(raw.reportText ?? "");
  if (parsed === null) {
    return absenceRecord(
      plan,
      "not_run",
      `performance 腿（web-vitals）报告词形不可解析：${plan.reportPath}——容器=POMaster 遍历契约 {"metrics":[Metric,...]}，条目对账官方 Metric 词形（name 官方五枚举 CLS/FCP/INP/LCP/TTFB + value 有限数 + rating 官方三枚举 good/needs-improvement/poor）；词形之外一律 malformed 落 not_run 禁默认值；报告摘录：${truncate((raw.reportText ?? "").slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  // —— 零分母闸（web-vitals 形态）：报告词形可解析但 metrics 空数组 = 零实测——
  // 空分母禁当满分（mutation-leg computeKillScore 先例）。
  if (parsed.length === 0) {
    return absenceRecord(
      plan,
      "not_run",
      `performance 腿（web-vitals）报告零分母：${plan.reportPath} 词形可解析但 metrics 为空数组——空分母禁当满分（mutation-leg computeKillScore 先例：generated=0 必须落 not_run）；核对 harness 是否真实收集并写入 Metric 条目后重跑（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const items: GateResultItemInput[] = [];
  const incompleteMeasurements: string[] = [];
  const uncarriedNotes: string[] = [];
  const metricNamesSeen = new Set(parsed.map((metric) => metric.name));

  for (const field of carriedFields) {
    const metricName = WEB_VITALS_METRIC_CARRIERS[field as "lcp_ms" | "inp_ms"];
    if (metricName === undefined) {
      // 不可达形态（web-vitals 承载集 = 字段映射域）——防御性显式拒绝。
      incompleteMeasurements.push(
        missingMeasurementDetail("web-vitals", field, "字段无 web-vitals 承载映射（内部判卷矩阵破坏）"),
      );
      continue;
    }
    if (!metricNamesSeen.has(metricName)) {
      // 声明预算字段缺实测（维度不完整）→ not_run（playwright 缺维先例禁默认值）。
      incompleteMeasurements.push(
        missingMeasurementDetail(
          "web-vitals",
          field,
          `报告无 name="${metricName}" 的 Metric 条目（声明预算字段缺实测——判卷锚不完整，禁默认值；核对 harness 是否注册了对应 on${metricName} 回调并写盘）`,
        ),
      );
      continue;
    }
    const budgetValue = plan.budget[field];
    if (budgetValue === undefined) {
      continue;
    }
    // 同名 metric 多实例聚合判卷（P26 同名附件聚合先例）：官方语义 bfcache 恢复等
    // 会产生新 metric 实例——任一条目超预算即违规（取首/取末都会开洗白通道）。
    const instances = parsed.filter((metric) => metric.name === metricName);
    for (const instance of instances) {
      if (instance.value > budgetValue) {
        items.push({
          rule: PERFORMANCE_BUDGET_EXCEEDED_RULE,
          location: `web-vitals#${metricName}`,
          message: `${field} 超预算：${metricName} 实测 ${instance.value.toFixed(1)} ms > 预算 ${String(budgetValue)} ms（同名多实例聚合判卷：本报告 ${String(instances.length)} 条 ${metricName} 条目）`,
        });
      }
    }
  }

  for (const field of notCarriedFields) {
    uncarriedNotes.push(
      `${field}（非 web-vitals 承载字段——官方 Metric 无该承载，显式盲区；不由本腿冒充判卷）`,
    );
  }

  if (incompleteMeasurements.length > 0) {
    return absenceRecord(
      plan,
      "not_run",
      `performance 腿（web-vitals）判卷锚不完整：${incompleteMeasurements.join("；")}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const violations = items.length;

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
    `${performanceCapabilityNote("web-vitals")}；` +
    `违规 ${String(violations)} 条（判卷锚=报告 ${plan.reportPath} 重算：声明预算 ${Object.keys(plan.budget).sort().join(" / ")} ∩ web-vitals 承载集 = 判卷分母 ${carriedFields.join(" / ")}；metrics 实测 ${String(parsed.length)} 条${uncarriedNotes.length > 0 ? `；未判卷字段：${uncarriedNotes.join("；")}` : ""}）；` +
    `runner=web-vitals exit=${String(raw.exitCode)}（退出码非判卷锚——判卷锚=报告重算）`;

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
      // 载体粒度 = 判卷分母字段数（多实例聚合到字段级；条目数进 scopeNote 留痕）。
      scanned: carriedFields.length,
      applicableScanned: carriedFields.length,
      violations,
      notApplicable: 0,
    },
    blindspot: {
      // 载体 = 报告文件本身（完整回读且可解析 + 承载字段全部有实测）。
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

/** 档位闸共用判定（securityLegPolicyExempt 同款）：MINIMAL/LIGHT/FAST 档合法缺席。 */
export function performanceLegPolicyExempt(tier: GateTier): boolean {
  return POLICY_EXEMPT_GATE_TIERS.includes(tier);
}

/** 档位注记（policy_skip 记录的 scopeNote 用；P12c 裁定映射 + §27.1 锚）。 */
export function performancePolicySkipNote(tier: GateTier): string {
  return `SKIPPED_BY_POLICY（映射现轴 not_run，非绿非红；PERFORMANCE ${tier} 档合法缺席——PRD §27.1 MINIMAL 档「Gate 以 affected build/test/visual verify 为主」；lighthouse/web-vitals 两腿独立缺席，任一腿 policy_skip 不牵连另一腿判卷路径；显式缺席语义非静默跳过；新轴值经 vocab-pr 呈报 Owner，未批前禁私加词表）`;
}
