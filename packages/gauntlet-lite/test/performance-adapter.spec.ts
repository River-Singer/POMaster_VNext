/**
 * performance-adapter.spec.ts —— P27 PERFORMANCE 门禁双腿（L1；随版计划 Batch 3
 * 后段 B3-3「Lighthouse / web-vitals——对接 §29 性能预算字段」；PRD §29.1）。
 *
 * 覆盖面（出口判据逐条对齐）：
 * - 配置读取（performance-gate.json：budget 段 schema 派生字段集封闭 + 双 runner 段
 *   fail-closed；webVitals 的 versionProbe 必填——库非 CLI 无可派生缺省，禁猜口径）；
 * - 探测（detectLighthouse PATH 线索 / detectWebVitals package.json 声明线索 + adapter
 *   detect config 先于工具，security adapter 同款）；
 * - prepare 判卷矩阵（档位闸 policy_skip（MINIMAL/LIGHT/FAST 合法缺席——§27.1）/ 配置
 *   not_configured / 工具 not_run / 版本锚 fail-closed throw / 就绪计划字段 + carried
 *   预算交集算定）；
 * - run/normalize 判卷矩阵（fake spawn + 真实 fs 报告回读：预算超标 failed + items /
 *   等于预算不算超 / 判卷锚不完整 not_run（审计缺席/notApplicable/numericValue 缺席/
 *   声明 metric 缺条目）/ 零分母闸（budget 只声明非承载字段 / metrics 空数组）/
 *   malformed 报告 / 报告缺席 / 陈旧报告失效化 / 路径安全闸——三道闸先例全适用；
 *   判卷锚=报告重算，退出码非锚；版本漂移 cap；同名 metric 多实例聚合——P26 先例）；
 * - 报告词形对账（官方 LHR 词形 + 官方 Metric 词形——2026-08-31 官方仓库/文档逐字
 *   对账；词形之外 malformed → not_run 禁默认值；盲区登记：max_chunk_kb/max_memory_mb
 *   无 Lighthouse 官方单审计承载——不由本腿冒充判卷）；
 * - 双腿独立编排（runPerformanceGateLegs 二元组无聚合 verdict 位；互不牵连矩阵）；
 * - 真实子进程两段式（fake 可执行脚本 × 真实 spawnSync；出口判据 2——判定链真实
 *   走通）+ 64MB maxBuffer 大输出回归（P22 先例）；
 * - 宿主真实 e2e（宿主未装则诚实 skip + 盲区说明——宿主 e2e skip 纪律）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PERFORMANCE_TIMEOUT_MS,
  GATE_TIER_VALUES,
  LIGHTHOUSE_AUDIT_CARRIERS,
  LIGHTHOUSE_CARRIED_FIELDS,
  LIGHTHOUSE_DEFAULT_REPORT,
  LIGHTHOUSE_LONG_TASKS_AUDIT,
  LIGHTHOUSE_METRIC_DIALECT,
  LIGHTHOUSE_NETWORK_REQUESTS_AUDIT,
  LIGHTHOUSE_TOOL_ID,
  PERFORMANCE_BUDGET_EXCEEDED_RULE,
  PERFORMANCE_LEG_RUNNERS,
  PERFORMANCE_POLICY_SKIP_METRIC_DIALECT,
  WEB_VITALS_CARRIED_FIELDS,
  WEB_VITALS_DEFAULT_REPORT,
  WEB_VITALS_METRIC_DIALECT,
  WEB_VITALS_TOOL_ID,
  createLighthouseAdapter,
  createWebVitalsAdapter,
  detectLighthouse,
  detectSchemathesis,
  detectWebVitals,
  normalizePerformanceLeg,
  parseLighthouseJsonReport,
  parseWebVitalsReport,
  performanceCapabilityNote,
  performanceLegPolicyExempt,
  performanceReportAbsolutePath,
  readPerformanceGateConfig,
  resolvePerformanceReportPath,
  runPerformanceGateLegs,
  runPerformanceLeg,
  stripQuotesFromPathEnv,
  toGateResultJson,
  type DetectorFacts,
  type GatePolicy,
  type GateResultRecord,
  type PerformanceLegPlan,
  type SpawnFn,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-gauntlet-performance-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 官方词形夹具构造（2026-08-31 官方对账：types/lhr/*.d.ts + default-config.js +
// web-vitals src/types/base.ts）
// ============================================================

/** 官方 AuditResult 词形（超集字段齐备；装载面 id/scoreDisplayMode/numericValue/details）。 */
function auditEntry(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title: `Audit ${id}`,
    description: "official wordform fixture",
    score: 1,
    scoreDisplayMode: "informative",
    numericValue: 0,
    numericUnit: "unitless",
    ...overrides,
  };
}

/** 官方 LHR 根词形（audits 以审计 id 为键；categories/fetchTime 等容忍面）。 */
function lhrReport(audits: Record<string, unknown>): string {
  return JSON.stringify({
    lighthouseVersion: "12.0.0",
    fetchTime: "2026-08-31T00:00:00.000Z", // A4：夹具墙钟字段固定词形零漂移
    finalUrl: "https://fixture.example/",
    runWarnings: [],
    categories: { performance: { score: 1 } },
    audits,
  });
}

/** network-requests 官方 Table details 词形（items 逐条 {url, transferSize, resourceType, ...}）。 */
function networkRequestsAudit(items: readonly Record<string, unknown>[]): Record<string, unknown> {
  return auditEntry(LIGHTHOUSE_NETWORK_REQUESTS_AUDIT, {
    scoreDisplayMode: "informative",
    details: {
      type: "table",
      headings: [{ key: "transferSize", valueType: "bytes", label: "Transfer Size" }],
      items,
    },
  });
}

/** long-tasks 官方 Table details 词形（items 逐条 {url, startTime, duration}）。 */
function longTasksAudit(items: readonly Record<string, unknown>[]): Record<string, unknown> {
  return auditEntry(LIGHTHOUSE_LONG_TASKS_AUDIT, {
    scoreDisplayMode: "informative",
    details: {
      type: "table",
      headings: [{ key: "duration", valueType: "ms", label: "Duration" }],
      items,
    },
  });
}

function scriptRequest(transferSize: number): Record<string, unknown> {
  return {
    url: "https://fixture.example/app.js",
    protocol: "h2",
    transferSize,
    resourceSize: transferSize * 3,
    statusCode: 200,
    mimeType: "application/javascript",
    resourceType: "Script",
    finished: true,
  };
}

function longTask(duration: number): Record<string, unknown> {
  return {
    url: "https://fixture.example/app.js",
    startTime: 1200.5,
    duration,
  };
}

/** 齐备干净 LHR（lcp/inp 审计直读 + network-requests/long-tasks 派生——全部承载字段有实测）。 */
function cleanLhr(): string {
  return lhrReport({
    "first-contentful-paint": auditEntry("first-contentful-paint", { numericValue: 900, numericUnit: "millisecond" }),
    "largest-contentful-paint": auditEntry("largest-contentful-paint", {
      scoreDisplayMode: "numeric",
      score: 0.98,
      numericValue: 2100,
      numericUnit: "millisecond",
    }),
    "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
      scoreDisplayMode: "numeric",
      score: 0.99,
      numericValue: 120,
      numericUnit: "millisecond",
    }),
    [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([
      scriptRequest(200 * 1024),
      scriptRequest(50 * 1024),
      { url: "https://fixture.example/style.css", transferSize: 30 * 1024, resourceType: "Stylesheet" },
    ]),
    [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([longTask(150)]),
  });
}

/** 官方 Metric 词形条目（name 五枚举 + value + rating 三枚举；id/entries 官方可缺）。 */
function metric(
  name: string,
  value: number,
  rating = "good",
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return { name, value, rating, ...extras };
}

function wvReport(metrics: readonly Record<string, unknown>[]): string {
  // 容器 = POMaster 遍历契约 {"metrics":[Metric,...]}；条目 = 官方 Metric 词形。
  return JSON.stringify({ metrics });
}

function cleanWv(): string {
  return wvReport([
    metric("LCP", 2100, "good", { id: "lcp-1", entries: [], delta: 2100, navigationType: "navigate" }),
    metric("INP", 120, "good", { id: "inp-1", entries: [], delta: 120 }),
    metric("CLS", 0.01, "good"),
    metric("TTFB", 80, "good"),
  ]);
}

// ============================================================
// fake facts / 手工计划 / 调度 fake spawn（真实 fs 报告回读——playwright spec 先例）
// ============================================================

const FAKE_TOOLS = "C:/fake-performance-tools";

const FULL_CONFIG = {
  budget: { lcp_ms: 2500, inp_ms: 200, initial_js_gzip_kb: 500, long_task_ms: 200 },
  lighthouse: {
    command: "lighthouse https://fixture.example --output=json --output-path=reports/performance/lighthouse.json",
  },
  webVitals: {
    command: "node harness.mjs",
    versionProbe: "node harness-version.mjs",
  },
};

function performanceFacts(
  extraFiles: Record<string, string | null> = {},
  config: Record<string, unknown> = FULL_CONFIG,
): DetectorFacts {
  return fakeFacts(root, {
    files: {
      // fake PATH 上的可执行体占位（fileExists 按 files 键判存在——null=仅存在）。
      [posixJoin(FAKE_TOOLS, "lighthouse")]: null,
      [posixJoin(FAKE_TOOLS, "node")]: null,
      [posixJoin(root, "performance-gate.json")]: JSON.stringify(config),
      [posixJoin(root, "package.json")]: JSON.stringify({
        devDependencies: { "web-vitals": "^4.2.4" },
      }),
      ...extraFiles,
    },
    pathEnv: FAKE_TOOLS,
  });
}

function bareFacts(): DetectorFacts {
  return fakeFacts("D:/bare-perf-proj", { files: {} });
}

function policy(overrides: Partial<GatePolicy> = {}): GatePolicy {
  return { grn: "GRN-27", ranAtSeq: 27, trigger: "on_demand", ...overrides };
}

/** 真实 fs 手工计划夹具（判卷矩阵/两段式用——绕过 prepare 的 PATH 依赖，playwright spec 先例）。 */
function handPlan(
  runner: "lighthouse" | "web-vitals",
  overrides: Partial<PerformanceLegPlan> = {},
): PerformanceLegPlan {
  const budget = { lcp_ms: 2500, inp_ms: 200, initial_js_gzip_kb: 500, long_task_ms: 200 };
  const carried =
    runner === "lighthouse"
      ? Object.keys(budget).filter((f) => LIGHTHOUSE_CARRIED_FIELDS.includes(f)).sort()
      : Object.keys(budget).filter((f) => WEB_VITALS_CARRIED_FIELDS.includes(f)).sort();
  return {
    grn: "GRN-27",
    gate: "PERFORMANCE",
    gateDef: "POLICY.GATE.PERFORMANCE@0.1.0",
    ranAtSeq: 27,
    subjectId: null,
    denominatorRefs: [],
    tool: runner === "lighthouse" ? LIGHTHOUSE_TOOL_ID : WEB_VITALS_TOOL_ID,
    toolVersion: "12.0.0",
    metricDialect:
      runner === "lighthouse" ? LIGHTHOUSE_METRIC_DIALECT : WEB_VITALS_METRIC_DIALECT,
    projectRoot: root,
    runner,
    trigger: "on_demand",
    absenceKind: null,
    absentReason: null,
    absentHint: null,
    tier: "STANDARD",
    budget,
    carriedBudgetFields: carried,
    command:
      runner === "lighthouse"
        ? "lighthouse https://fixture.example --output=json"
        : `node "${join(root, "harness.mjs")}"`,
    versionProbeCommand: runner === "lighthouse" ? "lighthouse --version" : "node --version",
    executable: runner === "lighthouse" ? "lighthouse" : "node",
    timeoutMs: DEFAULT_PERFORMANCE_TIMEOUT_MS,
    reportPath:
      runner === "lighthouse" ? LIGHTHOUSE_DEFAULT_REPORT : WEB_VITALS_DEFAULT_REPORT,
    expectedToolVersion: "12.0.0",
    ...overrides,
  };
}

/** 调度 fake spawn：版本探测（命令含 version）→ 版本词形；真执行 → 写报告到真实 fs。 */
function dispatchSpawn(
  reportPath: string,
  reportText: string | null,
  version = "12.0.0",
): SpawnFn {
  return (command) => {
    if (command.includes("version")) {
      return { status: 0, stdout: `${version}\n`, stderr: "", error: null, externalMs: 5 };
    }
    if (reportText !== null) {
      const abs = performanceReportAbsolutePath(root, reportPath);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, reportText, "utf8");
    }
    return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
  };
}

/** 单腿全链路：run（注入 spawn + 可执行体探针放行）→ normalize。 */
function runLeg(
  runner: "lighthouse" | "web-vitals",
  reportText: string | null,
  planOverrides: Partial<PerformanceLegPlan> = {},
  spawn: SpawnFn | null = null,
  probe: ((executable: string) => string | null) | null = null,
): GateResultRecord {
  const reportPath =
    (planOverrides.reportPath as string | undefined) ??
    (runner === "lighthouse" ? LIGHTHOUSE_DEFAULT_REPORT : WEB_VITALS_DEFAULT_REPORT);
  const plan = handPlan(runner, planOverrides);
  const raw = runPerformanceLeg(
    plan,
    spawn ?? dispatchSpawn(reportPath, reportText),
    probe ?? (() => "C:/fake/perf-tool-on-path"),
  );
  return normalizePerformanceLeg(raw, 3);
}

// ============================================================
// 配置读取（performance-gate.json；budget 字段集 schema 封闭 + 双 runner 段）
// ============================================================

describe("readPerformanceGateConfig（performance-gate.json 配置面）", () => {
  it("文件缺席 → not ok + 配置指引（诚实缺席非静默）", () => {
    const read = readPerformanceGateConfig(bareFacts());
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.reason).toContain("performance-gate.json");
      expect(read.installHint).toContain("performance-gate.json");
    }
  });

  it("JSON 坏形 → not ok；根非对象 → not ok", () => {
    const badJson = fakeFacts(root, {
      files: { [posixJoin(root, "performance-gate.json")]: "{not json" },
    });
    expect(readPerformanceGateConfig(badJson).ok).toBe(false);
    const nonObject = fakeFacts(root, {
      files: { [posixJoin(root, "performance-gate.json")]: "[1,2]" },
    });
    expect(readPerformanceGateConfig(nonObject).ok).toBe(false);
  });

  it("budget 缺席/非对象 → not ok + §29.1 字段集指引", () => {
    const noBudget = fakeFacts(root, {
      files: {
        [posixJoin(root, "performance-gate.json")]: JSON.stringify({ lighthouse: FULL_CONFIG.lighthouse }),
      },
    });
    const read = readPerformanceGateConfig(noBudget);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("budget");
  });

  it("budget 发明字段（bundle_kb）→ not ok + 字段集封闭指引（schema additionalProperties:false 同源）", () => {
    const read = readPerformanceGateConfig(
      performanceFacts({}, {
        budget: { lcp_ms: 2500, bundle_kb: 300 },
        lighthouse: FULL_CONFIG.lighthouse,
      }),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.reason).toContain("bundle_kb");
      expect(read.reason).toContain("禁发明字段");
    }
  });

  it("budget 空对象 / 负数 / 非数值 → not ok（schema minProperties/minimum/type 同源）", () => {
    for (const budget of [{}, { lcp_ms: -1 }, { lcp_ms: "2500" }]) {
      const read = readPerformanceGateConfig(
        performanceFacts({}, { budget, lighthouse: FULL_CONFIG.lighthouse }),
      );
      expect(read.ok).toBe(false);
    }
  });

  it("budget 声明但零 runner 段 → not ok（判卷执行面缺席）", () => {
    const read = readPerformanceGateConfig(
      performanceFacts({}, { budget: { lcp_ms: 2500 } }),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("runner");
  });

  it("webVitals 段缺 versionProbe → not ok（库非 CLI 无可派生缺省，禁猜口径）", () => {
    const read = readPerformanceGateConfig(
      performanceFacts({}, {
        budget: { inp_ms: 200 },
        webVitals: { command: "node harness.mjs" },
      }),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("versionProbe");
  });

  it("合法配置 → ok + 双段声明 evidence + report 反斜杠归一", () => {
    const read = readPerformanceGateConfig(
      performanceFacts({}, {
        budget: { lcp_ms: 2500 },
        lighthouse: { command: "lighthouse <url> --output=json", report: "reports\\perf\\lh.json" },
        webVitals: { command: "node harness.mjs", versionProbe: "node --version", report: "reports\\perf\\wv.json" },
      }),
    );
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.config.lighthouse?.report).toBe("reports/perf/lh.json");
      expect(read.config.webVitals?.report).toBe("reports/perf/wv.json");
      expect(read.evidence).toContain("budget 1 字段");
    }
  });
});

// ============================================================
// 探测（detectLighthouse PATH 线索 / detectWebVitals package.json 声明线索）
// ============================================================

describe("detectors（P27 扩容面）", () => {
  it("detectLighthouse：PATH 命中 → READY（版本不可离线探测=null）；缺席 → NOT_INSTALLED + 安装建议", () => {
    const hit = detectLighthouse(
      fakeFacts("D:/x", { files: { [posixJoin(FAKE_TOOLS, "lighthouse")]: null }, pathEnv: FAKE_TOOLS }),
    );
    expect(hit.status).toBe("READY");
    if (hit.status === "READY") {
      expect(hit.detectedVersion).toBeNull();
      expect(hit.evidence).toContain("PATH 命中");
    }
    const miss = detectLighthouse(fakeFacts("D:/x", { files: {}, pathEnv: null }));
    expect(miss.status).toBe("NOT_INSTALLED");
    if (miss.status === "NOT_INSTALLED") {
      expect(miss.reason).toContain("lighthouse");
      expect(miss.installHint).toContain("安装建议");
    }
  });

  it("detectWebVitals：package.json 声明 → READY + 版本提取；未声明 → NOT_INSTALLED + 指引", () => {
    const ok = detectWebVitals(
      fakeFacts("D:/x", {
        files: {
          [posixJoin("D:/x", "package.json")]: JSON.stringify({ devDependencies: { "web-vitals": "^4.2.4" } }),
        },
      }),
    );
    expect(ok.status).toBe("READY");
    if (ok.status === "READY") expect(ok.detectedVersion).toBe("4.2.4");

    const miss = detectWebVitals(fakeFacts("D:/x", { files: {} }));
    expect(miss.status).toBe("NOT_INSTALLED");
    if (miss.status === "NOT_INSTALLED") expect(miss.installHint).toContain("web-vitals");
  });

  it("detectWebVitals：版本漂移（expectedVersion 锚）→ DRIFTED（判卷降级 warning 语义）", () => {
    const drifted = detectWebVitals(
      fakeFacts("D:/x", {
        files: {
          [posixJoin("D:/x", "package.json")]: JSON.stringify({ dependencies: { "web-vitals": "^4.2.4" } }),
        },
      }),
      { expectedVersion: "3.0.0" },
    );
    expect(drifted.status).toBe("DRIFTED");
  });

  it("detectSchemathesis：PATH 命中 → READY；缺席 → NOT_INSTALLED + pip 安装路标（B3-4）", () => {
    const hit = detectSchemathesis(
      fakeFacts("D:/x", { files: { [posixJoin(FAKE_TOOLS, "schemathesis")]: null }, pathEnv: FAKE_TOOLS }),
    );
    expect(hit.status).toBe("READY");
    const miss = detectSchemathesis(fakeFacts("D:/x", { files: {}, pathEnv: null }));
    expect(miss.status).toBe("NOT_INSTALLED");
    if (miss.status === "NOT_INSTALLED") expect(miss.installHint).toContain("schemathesis");
  });
});

// ============================================================
// prepare 判卷矩阵（档位闸 / 配置闸 / 工具闸 / 版本锚 / carried 交集）
// ============================================================

describe("prepare（双 adapter 四段契约；档位/配置/工具/版本锚闸）", () => {
  it("MINIMAL/LIGHT/FAST 档 → policy_skip 合法缺席（metric_dialect=performance:policy_skip + notApplicable 注记路径）；STANDARD/HARDENING 运行", () => {
    const adapter = createLighthouseAdapter();
    for (const tier of ["MINIMAL", "LIGHT", "FAST"] as const) {
      const plan = adapter.prepare(
        { projectRoot: root },
        policy({ gateTier: tier, expectedToolVersion: "12.0.0" }),
        performanceFacts(),
      );
      expect(plan.absenceKind).toBe("profile_not_required");
      expect(plan.metricDialect).toBe(PERFORMANCE_POLICY_SKIP_METRIC_DIALECT);
    }
    for (const tier of ["STANDARD", "HARDENING"] as const) {
      const plan = adapter.prepare(
        { projectRoot: root },
        policy({ gateTier: tier, expectedToolVersion: "12.0.0" }),
        performanceFacts(),
      );
      expect(plan.absenceKind).toBeNull();
    }
  });

  it("performanceLegPolicyExempt 与档位词轴一致（POLICY_EXEMPT 三档；词表禁扩）", () => {
    expect(performanceLegPolicyExempt("MINIMAL")).toBe(true);
    expect(performanceLegPolicyExempt("LIGHT")).toBe(true);
    expect(performanceLegPolicyExempt("FAST")).toBe(true);
    expect(performanceLegPolicyExempt("STANDARD")).toBe(false);
    expect(performanceLegPolicyExempt("HARDENING")).toBe(false);
    expect(GATE_TIER_VALUES).toHaveLength(5);
  });

  it("配置缺席 → not_configured（config_absent + 指引）；本 runner 段缺席 → not_configured（不影响另一腿）", () => {
    const adapter = createLighthouseAdapter();
    const absent = adapter.prepare({ projectRoot: root }, policy(), bareFacts());
    expect(absent.absenceKind).toBe("config_absent");

    const noLhSection = adapter.prepare(
      { projectRoot: root },
      policy(),
      performanceFacts({}, { budget: { lcp_ms: 2500 }, webVitals: FULL_CONFIG.webVitals }),
    );
    expect(noLhSection.absenceKind).toBe("config_absent");
    if (noLhSection.absentReason !== null) expect(noLhSection.absentReason).toContain("lighthouse");
  });

  it("配置就绪但工具不在位 → tool_absent（not_run 非绿非红；web-vitals 按 package.json 判）", () => {
    const adapter = createLighthouseAdapter();
    // PATH 缺失事实源（配置文件在位）→ lighthouse 不在位 → tool_absent。
    const plan = adapter.prepare(
      { projectRoot: root },
      policy(),
      fakeFacts(root, {
        files: {
          [posixJoin(root, "performance-gate.json")]: JSON.stringify(FULL_CONFIG),
        },
        pathEnv: null,
      }),
    );
    expect(plan.absenceKind).toBe("tool_absent");

    const wvAdapter = createWebVitalsAdapter();
    // package.json 缺席 → web-vitals 不在位 → tool_absent。
    const wvPlan = wvAdapter.prepare(
      { projectRoot: root },
      policy(),
      fakeFacts(root, {
        files: {
          [posixJoin(root, "performance-gate.json")]: JSON.stringify(FULL_CONFIG),
        },
        pathEnv: null,
      }),
    );
    expect(wvPlan.absenceKind).toBe("tool_absent");
  });

  it("就绪但版本锚缺失 → throw（编排层供给版本锚——security/playwright 腿同款）", () => {
    const adapter = createLighthouseAdapter();
    expect(() =>
      adapter.prepare(
        { projectRoot: root },
        policy({ expectedToolVersion: null }),
        performanceFacts(),
      ),
    ).toThrowError(/expectedToolVersion/);
  });

  it("就绪计划字段：budget/carried 交集算定 + carriedBudgetFields 只含承载字段（禁发明字段）", () => {
    const adapter = createLighthouseAdapter();
    const plan = adapter.prepare(
      { projectRoot: root },
      policy({ expectedToolVersion: "12.0.0" }),
      performanceFacts(),
    );
    expect(plan.absenceKind).toBeNull();
    expect(plan.carriedBudgetFields).toEqual(["initial_js_gzip_kb", "inp_ms", "lcp_ms", "long_task_ms"]);
    expect(plan.reportPath).toBe(LIGHTHOUSE_DEFAULT_REPORT);
    expect(plan.executable).toBe("lighthouse");
  });

  it("budget 含非承载字段（max_chunk_kb/max_memory_mb）→ carried 只含承载交集；web-vitals 腿 carried 只含 lcp_ms/inp_ms", () => {
    const config = {
      budget: { lcp_ms: 2500, max_chunk_kb: 800, max_memory_mb: 800 },
      webVitals: FULL_CONFIG.webVitals,
    };
    const wvAdapter = createWebVitalsAdapter();
    const plan = wvAdapter.prepare(
      { projectRoot: root },
      policy({ expectedToolVersion: "4.2.4" }),
      performanceFacts({}, config),
    );
    expect(plan.carriedBudgetFields).toEqual(["lcp_ms"]);
  });

  it("adapter.detect：config 先于工具（security adapter 同款）→ 双段声明 + 工具在位 = READY", () => {
    const detection = createLighthouseAdapter().detect(performanceFacts());
    expect(detection.status).toBe("READY");
    if (detection.status === "READY") expect(detection.evidence).toContain("performance-gate.json");
  });
});

// ============================================================
// lighthouse 腿判卷矩阵（判卷锚 = LHR 报告重算）
// ============================================================

describe("lighthouse 腿：预算超标判卷链（出口判据 1 亲验）", () => {
  it("干净报告（全部承载字段 ≤ 预算）→ passed + counts.scanned=4 + scopeNote 能力面声明", () => {
    const record = runLeg("lighthouse", cleanLhr());
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBe(4);
    expect(record.counts.violations).toBe(0);
    expect(record.scopeNote).toContain("能力面");
    expect(record.scopeNote).toContain("max_chunk_kb");
  });

  it("lcp_ms 超预算 → failed + rule=performance_budget_exceeded + location=审计 id#字段 + 实测/预算数值", () => {
    const lhr = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 3600.5,
        numericUnit: "millisecond",
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    const record = runLeg("lighthouse", lhr);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    const item = record.items?.[0];
    expect(item?.rule).toBe(PERFORMANCE_BUDGET_EXCEEDED_RULE);
    expect(item?.location).toBe("largest-contentful-paint#lcp_ms");
    expect(item?.message).toContain("3600.5");
    expect(item?.message).toContain("2500");
  });

  it("等于预算不算超（预算是上限不是下限）→ passed", () => {
    const lhr = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 2500,
        numericUnit: "millisecond",
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 200,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(500 * 1024)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([longTask(200)]),
    });
    const record = runLeg("lighthouse", lhr);
    expect(record.verdict).toBe("passed");
  });

  it("initial_js_gzip_kb 派生测量：Script transferSize 求和 ÷1024（Stylesheet 不计入）超标 → failed", () => {
    // 300KB + 250KB = 550KB Script 传输字节 > 500KB 预算；30KB Stylesheet 不计入。
    const lhr = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([
        scriptRequest(300 * 1024),
        scriptRequest(250 * 1024),
        { url: "https://fixture.example/s.css", transferSize: 30 * 1024, resourceType: "Stylesheet" },
      ]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    const record = runLeg("lighthouse", lhr);
    expect(record.verdict).toBe("failed");
    const item = record.items?.[0];
    expect(item?.location).toBe(`${LIGHTHOUSE_NETWORK_REQUESTS_AUDIT}#initial_js_gzip_kb`);
    expect(item?.message).toContain("550.0");
  });

  it("long_task_ms：单任务超上限逐条违规 + 官方降序截断披露；notApplicable（零长任务）= 干净", () => {
    const overLhr = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([longTask(180), longTask(320.7)]),
    });
    const over = runLeg("lighthouse", overLhr);
    expect(over.verdict).toBe("failed");
    expect(over.counts.violations).toBe(1);
    expect(over.items?.[0]?.message).toContain("321");

    const cleanLhrNoTasks = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: auditEntry(LIGHTHOUSE_LONG_TASKS_AUDIT, {
        scoreDisplayMode: "notApplicable",
        numericValue: undefined,
        details: { type: "table", headings: [], items: [] },
      }),
    });
    const clean = runLeg("lighthouse", cleanLhrNoTasks);
    expect(clean.verdict).toBe("passed");
  });

  it("单位词形闸（P27 双核验 MINOR）：numericUnit=\"second\" 词形漂移 → not_run（禁把秒当毫秒洗白，fail-closed）", () => {
    // 4.1（second 词形）按旧机械会与 2500 ms 预算直比 → 4.1 < 2500 落 passed=洗白；
    // 单位闸要求 numericUnit 官方恒为 'millisecond'，漂移即判卷锚不完整 not_run。
    const secondUnit = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 4.1,
        numericUnit: "second",
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    const record = runLeg("lighthouse", secondUnit);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("numericUnit");
    expect(record.scopeNote).toContain('"second"');
    expect(record.scopeNote).toContain("millisecond");
    expect(record.counts).toEqual({ scanned: 0, applicableScanned: 0, violations: 0, notApplicable: 0 });

    // numericUnit 缺席（官方 numeric 审计必携该字段）同判 not_run——非 millisecond 一律拒。
    const missingUnit = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 4100,
        numericUnit: undefined,
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    const missingRecord = runLeg("lighthouse", missingUnit);
    expect(missingRecord.verdict).toBe("not_run");
    expect(missingRecord.scopeNote).toContain("缺席");
  });

  it("官方 50ms 收录阈披露（P27 双核验 MINOR）：capability note 声明预算 <50 的覆盖收窄；判卷语义不动", () => {
    // long-tasks 官方只收录 duration ≥ 50ms（Long Tasks API 规范阈）——预算声明 <50
    // 时低于阈任务不进报告分母，能力面声明如实收窄（披露面修复；官方词形即官方边界）。
    const note = performanceCapabilityNote("lighthouse");
    expect(note).toContain("官方收录阈 50ms");
    expect(note).toContain("预算 <50");
    expect(note).toContain("判卷覆盖声明如实收窄");
    // scopeNote 恒携带能力面声明——落盘记录同样披露（web-vitals 腿无 long_task 承载不携带）。
    const record = runLeg("lighthouse", cleanLhr());
    expect(record.scopeNote).toContain("官方收录阈 50ms");
    expect(performanceCapabilityNote("web-vitals")).not.toContain("50ms");
  });

  it("判卷锚不完整：inp_ms 审计 notApplicable（官方 simulate 节流边界）→ not_run + 路标（非绿非红）", () => {
    const lhr = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "notApplicable",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    const record = runLeg("lighthouse", lhr);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("interaction-to-next-paint");
    expect(record.scopeNote).toContain("simulate");
    expect(record.counts).toEqual({ scanned: 0, applicableScanned: 0, violations: 0, notApplicable: 0 });
  });

  it("判卷锚不完整：审计缺席 / scoreDisplayMode=error / numericValue 非有限数 → not_run", () => {
    const missingAudit = lhrReport({
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    expect(runLeg("lighthouse", missingAudit).verdict).toBe("not_run");

    const errorAudit = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", { scoreDisplayMode: "error", errorMessage: "boom" }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 1,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    expect(runLeg("lighthouse", errorAudit).verdict).toBe("not_run");

    const noNumeric = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: undefined,
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 1,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    expect(runLeg("lighthouse", noNumeric).verdict).toBe("not_run");
  });

  it("network-requests items 条目词形越界（缺 transferSize/resourceType）→ not_run（坏形禁猜测判卷）", () => {
    const lhr = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([
        { url: "https://fixture.example/x.js", resourceType: "Script" },
      ]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    expect(runLeg("lighthouse", lhr).verdict).toBe("not_run");
  });

  it("零分母闸：budget 只声明非承载字段（max_chunk_kb/max_memory_mb）→ not_run（空分母禁当满分）", () => {
    const record = runLeg(
      "lighthouse",
      cleanLhr(),
      {
        budget: { max_chunk_kb: 800, max_memory_mb: 800 },
        carriedBudgetFields: [],
      },
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("零判卷分母");
    expect(record.scopeNote).toContain("max_chunk_kb");
  });
});

// ============================================================
// web-vitals 腿判卷矩阵（容器=遍历契约；条目=官方 Metric 词形）
// ============================================================

describe("web-vitals 腿：预算超标判卷链", () => {
  it("干净报告（LCP/INP ≤ 预算）→ passed；CLS/TTFB 非承载字段不消费", () => {
    const record = runLeg("web-vitals", cleanWv());
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBe(2);
  });

  it("LCP/INP 超预算 → failed + 逐条 items（实测/预算数值不丢失；carried 字段序=字集排序 inp_ms→lcp_ms）", () => {
    const record = runLeg(
      "web-vitals",
      wvReport([metric("LCP", 4100, "poor"), metric("INP", 260, "poor")]),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.items?.[0]?.location).toBe("web-vitals#INP");
    expect(record.items?.[0]?.message).toContain("260");
    expect(record.items?.[1]?.location).toBe("web-vitals#LCP");
    expect(record.items?.[1]?.message).toContain("4100");
  });

  it("同名 metric 多实例聚合：任一条目超预算即违规（P26 同名附件聚合先例；取首洗白封死）", () => {
    // 序 1：[净, 脏]；序 2：[脏, 净]——两序都 failed（多实例新 metric 官方语义）。
    for (const order of [["good", "poor"], ["poor", "good"]] as const) {
      const record = runLeg(
        "web-vitals",
        wvReport([
          metric("LCP", order[0] === "good" ? 1000 : 4100, order[0]),
          metric("LCP", order[1] === "good" ? 1000 : 4100, order[1]),
          metric("INP", 100, "good"),
        ]),
      );
      expect(record.verdict, `序 ${order.join(",")}`).toBe("failed");
      expect(record.counts.violations).toBe(1);
    }
  });

  it("判卷锚不完整：声明 budget.inp_ms 但报告无 INP 条目 → not_run + 路标（playwright 缺维先例）", () => {
    const record = runLeg("web-vitals", wvReport([metric("LCP", 1000, "good")]));
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("INP");
  });

  it("零分母闸：metrics 空数组 → not_run（空分母禁当满分）", () => {
    const record = runLeg("web-vitals", wvReport([]));
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("零分母");
  });

  it("报告词形对账：metrics 缺席/条目 name 词形越界/rating 词形越界/value 非有限数 → not_run 禁默认值", () => {
    expect(runLeg("web-vitals", '{"audits":{}}').verdict).toBe("not_run");
    expect(
      runLeg("web-vitals", wvReport([metric("FIRST_INPUT", 10, "good")])).verdict,
    ).toBe("not_run");
    expect(
      runLeg("web-vitals", wvReport([{ name: "LCP", value: 1000, rating: "excellent" }])).verdict,
    ).toBe("not_run");
    expect(
      runLeg("web-vitals", wvReport([{ name: "LCP", value: "1000", rating: "good" }])).verdict,
    ).toBe("not_run");
    expect(runLeg("web-vitals", "not-json").verdict).toBe("not_run");
  });
});

// ============================================================
// 共用机械：报告缺席 / malformed / 三道闸 / 版本漂移（两 runner 同款先例全适用）
// ============================================================

describe("performance 腿三道闸与新鲜度绑定（P22-P26 先例）", () => {
  it("可执行体缺席（探针 null）→ spawn_failed → not_run（Windows cmd 缺席伪装先拦截）", () => {
    const record = runLeg("lighthouse", cleanLhr(), {}, null, () => null);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("不在 PATH");
  });

  it("版本探测失败（非零退出/无版本词形）→ not_run，禁猜版本口径", () => {
    const plan = handPlan("lighthouse");
    const raw = runPerformanceLeg(
      plan,
      (command) =>
        command.includes("version")
          ? { status: 1, stdout: "", stderr: "boom", error: null, externalMs: 5 }
          : { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 },
      () => "C:/fake/lighthouse",
    );
    expect(normalizePerformanceLeg(raw, 3).verdict).toBe("not_run");

    const noSemver = runPerformanceLeg(
      plan,
      (command) =>
        command.includes("version")
          ? { status: 0, stdout: "lighthouse", stderr: "", error: null, externalMs: 5 }
          : { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 },
      () => "C:/fake/lighthouse",
    );
    expect(normalizePerformanceLeg(noSemver, 3).verdict).toBe("not_run");
  });

  it("报告未产出 → not_run（工具 exit=0 不构成通过——报告是唯一判卷锚）", () => {
    const record = runLeg("lighthouse", null);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("报告未产出");
  });

  it("报告词形不可解析（malformed）→ not_run + 摘录（禁默认值）", () => {
    const record = runLeg("lighthouse", "[1,2,3]");
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("词形不可解析");
  });

  it("陈旧报告失效化：预置报告 + 无副作用 spawn → 报告缺席 not_run（陈旧内容零影响）", () => {
    const abs = performanceReportAbsolutePath(root, LIGHTHOUSE_DEFAULT_REPORT);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, cleanLhr(), "utf8");
    const plan = handPlan("lighthouse");
    const raw = runPerformanceLeg(
      plan,
      (command) =>
        command.includes("version")
          ? { status: 0, stdout: "12.0.0\n", stderr: "", error: null, externalMs: 5 }
          : { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 }, // 真执行不写报告
      () => "C:/fake/lighthouse",
    );
    const record = normalizePerformanceLeg(raw, 3);
    expect(existsSync(abs)).toBe(false);
    expect(record.verdict).toBe("not_run");
  });

  it("报告路径安全闸：越出项目根 → pre_run_failed（失效化面禁变任意删除面）", () => {
    const record = runLeg("lighthouse", cleanLhr(), { reportPath: "../outside/lh.json" });
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("报告路径非法");
  });

  it("版本漂移 → warning cap=tool_version_drifted；漂移 + 违规 → failed 不洗白", () => {
    const drifted = runLeg(
      "lighthouse",
      cleanLhr(),
      { expectedToolVersion: "11.0.0" },
      dispatchSpawn(LIGHTHOUSE_DEFAULT_REPORT, cleanLhr(), "12.0.0"),
    );
    expect(drifted.verdict).toBe("warning");
    expect(drifted.verdictCapReason).toBe("tool_version_drifted");
    expect(drifted.toolVersion).toBe("12.0.0");

    const driftPlusViolation = runLeg(
      "lighthouse",
      lhrReport({
        "largest-contentful-paint": auditEntry("largest-contentful-paint", {
          scoreDisplayMode: "numeric",
          numericValue: 9999,
          numericUnit: "millisecond",
        }),
        "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
          scoreDisplayMode: "numeric",
          numericValue: 100,
          numericUnit: "millisecond",
        }),
        [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
        [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
      }),
      { expectedToolVersion: "11.0.0" },
    );
    expect(driftPlusViolation.verdict).toBe("failed");
    expect(driftPlusViolation.verdictCapReason).toBeNull();
  });

  it("web-vitals runner 同款三道闸：缺席探针 → not_run；路径非法 → not_run", () => {
    const missing = runLeg("web-vitals", cleanWv(), {}, null, () => null);
    expect(missing.verdict).toBe("not_run");
    const unsafe = runLeg("web-vitals", cleanWv(), { reportPath: "" });
    expect(unsafe.verdict).toBe("not_run");
  });
});

// ============================================================
// 报告解析器单元面（官方词形对账点）
// ============================================================

describe("官方报告解析器（parseLighthouseJsonReport / parseWebVitalsReport）", () => {
  it("LHR：audits 缺席/非对象/审计条目非对象/scoreDisplayMode 词形越界 → null", () => {
    expect(parseLighthouseJsonReport("{}")).toBeNull();
    expect(parseLighthouseJsonReport(JSON.stringify({ audits: [] }))).toBeNull();
    expect(
      parseLighthouseJsonReport(JSON.stringify({ audits: { x: 42 } })),
    ).toBeNull();
    expect(
      parseLighthouseJsonReport(
        JSON.stringify({ audits: { x: { scoreDisplayMode: "banana" } } }),
      ),
    ).toBeNull();
    expect(parseLighthouseJsonReport(cleanLhr())).not.toBeNull();
  });

  it("web-vitals：metrics 数组词形 + 官方五枚举 name + 三枚举 rating（cleanWv 可解析）", () => {
    const parsed = parseWebVitalsReport(cleanWv());
    expect(parsed).not.toBeNull();
    expect(parsed?.map((m) => m.name)).toEqual(["LCP", "INP", "CLS", "TTFB"]);
  });

  it("承载映射常量：lighthouse 四字段 / web-vitals 两字段 / 官方审计 id 逐字（对账锚）", () => {
    expect(LIGHTHOUSE_CARRIED_FIELDS).toEqual(["initial_js_gzip_kb", "inp_ms", "lcp_ms", "long_task_ms"]);
    expect(WEB_VITALS_CARRIED_FIELDS).toEqual(["inp_ms", "lcp_ms"]);
    expect(LIGHTHOUSE_AUDIT_CARRIERS.lcp_ms).toBe("largest-contentful-paint");
    expect(LIGHTHOUSE_AUDIT_CARRIERS.inp_ms).toBe("interaction-to-next-paint");
    expect(PERFORMANCE_LEG_RUNNERS).toEqual(["lighthouse", "web-vitals"]);
    expect(LIGHTHOUSE_DEFAULT_REPORT).toBe("reports/performance/lighthouse.json");
    expect(WEB_VITALS_DEFAULT_REPORT).toBe("reports/performance/web-vitals.json");
    expect(resolvePerformanceReportPath("lighthouse", null)).toBe(LIGHTHOUSE_DEFAULT_REPORT);
    expect(resolvePerformanceReportPath("web-vitals", "r\\wv.json")).toBe("r/wv.json");
  });
});

// ============================================================
// 双腿独立编排（二元组无聚合 verdict 位；互不牵连）
// ============================================================

describe("runPerformanceGateLegs（双独立 adapter 两记录编排）", () => {
  const IDENTITIES = [
    { grn: "GRN-271", ranAtSeq: 30 },
    { grn: "GRN-272", ranAtSeq: 31 },
  ] as const;

  /** 双腿共享调度 spawn：lighthouse 写超标 LHR；web-vitals 写干净报告（按 runner 版本探测命令分派版本）。 */
  function legsSpawn(opts: { lighthouse?: string | null; webVitals?: string | null }): SpawnFn {
    return (command) => {
      if (command.includes("lighthouse --version")) {
        return { status: 0, stdout: "12.0.0\n", stderr: "", error: null, externalMs: 5 };
      }
      if (command.includes("harness-version")) {
        return { status: 0, stdout: "4.2.4\n", stderr: "", error: null, externalMs: 5 };
      }
      const report = command.includes("lighthouse") ? opts.lighthouse : opts.webVitals;
      const reportPath = command.includes("lighthouse")
        ? LIGHTHOUSE_DEFAULT_REPORT
        : WEB_VITALS_DEFAULT_REPORT;
      if (report !== undefined && report !== null) {
        const abs = performanceReportAbsolutePath(root, reportPath);
        mkdirSync(join(abs, ".."), { recursive: true });
        writeFileSync(abs, report, "utf8");
      }
      return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
    };
  }

  function runLegs(opts: { lighthouse?: string | null; webVitals?: string | null }): readonly [
    GateResultRecord,
    GateResultRecord,
  ] {
    return runPerformanceGateLegs(
      { projectRoot: root, subjectId: null, denominatorRefs: [] },
      IDENTITIES,
      {
        facts: performanceFacts(),
        spawnFn: legsSpawn(opts),
        executableProbe: (name) =>
          ["lighthouse", "node"].includes(name) ? `${FAKE_TOOLS}/${name}` : null,
        gateTier: "STANDARD",
        expectedToolVersions: { lighthouse: "12.0.0", webVitals: "4.2.4" },
      },
    );
  }

  it("一腿红 + 一腿绿：两条记录 verdict 互异、tool/metric_dialect 随腿区分、GRN 独立", () => {
    const redLhr = lhrReport({
      "largest-contentful-paint": auditEntry("largest-contentful-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 9999,
        numericUnit: "millisecond",
      }),
      "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
        scoreDisplayMode: "numeric",
        numericValue: 100,
        numericUnit: "millisecond",
      }),
      [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
      [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
    });
    const [lh, wv] = runLegs({ lighthouse: redLhr, webVitals: cleanWv() });
    expect(lh.verdict).toBe("failed");
    expect(lh.tool).toBe(LIGHTHOUSE_TOOL_ID);
    expect(lh.metricDialect).toBe(LIGHTHOUSE_METRIC_DIALECT);
    expect(lh.grn).toBe("GRN-271");
    expect(wv.verdict).toBe("passed");
    expect(wv.tool).toBe(WEB_VITALS_TOOL_ID);
    expect(wv.metricDialect).toBe(WEB_VITALS_METRIC_DIALECT);
    expect(wv.grn).toBe("GRN-272");
  });

  it("互不牵连：lighthouse 段未声明（not_configured）→ web-vitals 照常真跑判卷", () => {
    const records = runPerformanceGateLegs(
      { projectRoot: root, subjectId: null, denominatorRefs: [] },
      IDENTITIES,
      {
        facts: performanceFacts(
          {},
          { budget: { lcp_ms: 2500, inp_ms: 200 }, webVitals: FULL_CONFIG.webVitals },
        ),
        spawnFn: legsSpawn({ webVitals: cleanWv() }),
        executableProbe: (name) =>
          ["lighthouse", "node"].includes(name) ? `${FAKE_TOOLS}/${name}` : null,
        gateTier: "STANDARD",
        expectedToolVersions: { lighthouse: "12.0.0", webVitals: "4.2.4" },
      },
    );
    expect(records[0]?.verdict).toBe("not_configured");
    expect(records[1]?.verdict).toBe("passed");
  });

  it("全绿双腿 → 双 passed；两条记录 03 schema 过 validate（落盘形态契约）", () => {
    const [lh, wv] = runLegs({ lighthouse: cleanLhr(), webVitals: cleanWv() });
    expect(lh.verdict).toBe("passed");
    expect(wv.verdict).toBe("passed");
    expect(validate(toGateResultJson(lh))).toBe(true);
    expect(validate(toGateResultJson(wv))).toBe(true);
  });

  it("policy_skip 档位：双腿各自 not_run+notApplicable=1（显式缺席语义，MINIMAL 档）", () => {
    const records = runPerformanceGateLegs(
      { projectRoot: root, subjectId: null, denominatorRefs: [] },
      IDENTITIES,
      {
        facts: performanceFacts(),
        spawnFn: legsSpawn({}),
        executableProbe: () => `${FAKE_TOOLS}/x`,
        gateTier: "MINIMAL",
        expectedToolVersions: { lighthouse: "12.0.0", webVitals: "4.2.4" },
      },
    );
    for (const record of records) {
      expect(record.verdict).toBe("not_run");
      expect(record.verdictCapReason).toBeNull();
      expect(record.counts.notApplicable).toBe(1);
      expect(record.scopeNote).toContain("SKIPPED_BY_POLICY");
      expect(record.scopeNote).toContain("MINIMAL");
    }
  });
});

// ============================================================
// 真实子进程两段式（fake 脚本 × 真实 spawnSync；出口判据 2——判定链真实走通）
// ============================================================

describe("performance 腿真实子进程（fake 脚本 × 真实 spawnSync 两段式）", () => {
  it(
    "版本探测脚本 + harness 脚本（真实写盘官方词形报告）→ 全链路判卷红（预算超标被抓）",
    { timeout: 60_000 },
    () => {
      const versionScript = join(root, "perf-version.cjs");
      const harnessScript = join(root, "perf-harness.cjs");
      // fake lighthouse CLI：--version → semver 词形；真执行 → 写官方词形 LHR 到缺省落点。
      writeFileSync(
        versionScript,
        "process.stdout.write('12.6.1\\n');",
        "utf8",
      );
      const overLhr = lhrReport({
        "largest-contentful-paint": auditEntry("largest-contentful-paint", {
          scoreDisplayMode: "numeric",
          numericValue: 5000,
          numericUnit: "millisecond",
        }),
        "interaction-to-next-paint": auditEntry("interaction-to-next-paint", {
          scoreDisplayMode: "numeric",
          numericValue: 100,
          numericUnit: "millisecond",
        }),
        [LIGHTHOUSE_NETWORK_REQUESTS_AUDIT]: networkRequestsAudit([scriptRequest(10)]),
        [LIGHTHOUSE_LONG_TASKS_AUDIT]: longTasksAudit([]),
      });
      writeFileSync(
        harnessScript,
        [
          "const fs = require('node:fs');",
          "const path = require('node:path');",
          `const report = process.argv[2] ?? '';`,
          `const text = ${JSON.stringify(overLhr)};`,
          "fs.mkdirSync(path.dirname(report), { recursive: true });",
          "fs.writeFileSync(report, text, 'utf8');",
        ].join("\n"),
        "utf8",
      );
      const plan = handPlan("lighthouse", {
        command: `node "${harnessScript}" "${join(root, LIGHTHOUSE_DEFAULT_REPORT).replaceAll("\\", "/")}"`,
        versionProbeCommand: `node "${versionScript}"`,
        executable: "node",
      });
      const raw = runPerformanceLeg(plan, undefined, undefined);
      const record = normalizePerformanceLeg(raw, 3);
      expect(raw.kind).toBe("executed");
      expect(raw.observedToolVersion).toBe("12.6.1");
      expect(record.verdict).toBe("failed");
      expect(record.items?.[0]?.message).toContain("5000");
    },
  );

  it(
    "64MB maxBuffer 大输出回归：harness stdout >1MB → 无 ENOBUFS（回落 1MB 即红，P22 先例）",
    { timeout: 60_000 },
    () => {
      const versionScript = join(root, "perf-version.cjs");
      const noisyScript = join(root, "perf-noisy.cjs");
      writeFileSync(versionScript, "process.stdout.write('12.0.0\\n');", "utf8");
      writeFileSync(
        noisyScript,
        [
          "const fs = require('node:fs');",
          "process.stdout.write('x'.repeat(2 * 1024 * 1024));",
          `fs.mkdirSync(require('node:path').dirname(${JSON.stringify(join(root, LIGHTHOUSE_DEFAULT_REPORT))}), { recursive: true });`,
          `fs.writeFileSync(${JSON.stringify(join(root, LIGHTHOUSE_DEFAULT_REPORT))}, ${JSON.stringify(cleanLhr())}, 'utf8');`,
        ].join("\n"),
        "utf8",
      );
      const plan = handPlan("lighthouse", {
        command: `node "${noisyScript}"`,
        versionProbeCommand: `node "${versionScript}"`,
        executable: "node",
      });
      const raw = runPerformanceLeg(plan, undefined, undefined);
      expect(raw.kind).toBe("executed");
      expect(normalizePerformanceLeg(raw, 3).verdict).toBe("passed");
    },
  );
});

// ============================================================
// 宿主真实 e2e（宿主 e2e skip 纪律；盲区显式登记）
// ============================================================

describe("performance 腿真实 e2e", () => {
  it("宿主 lighthouse 真装时：全链路真实判卷", (ctx) => {
    const probe = spawnSync("lighthouse --version", {
      shell: true,
      encoding: "utf8",
      timeout: 30_000,
      env: stripQuotesFromPathEnv({ ...process.env }),
      windowsHide: true,
    });
    const installed = probe.status === 0 && /\d+\.\d+\.\d+/.test(probe.stdout);
    if (!installed) {
      // 诚实缺席说明：宿主未安装 Lighthouse——真实 e2e 跳过；**盲区显式登记**：
      // 真实 LHR 序列化产物无法在宿主验证——解析器已对账官方 lhr.d.ts/
      // audit-result.d.ts/default-config.js 词形（审计 id + scoreDisplayMode 七枚举），
      // 词形之外（malformed → not_run）fail-closed 兜住，不会误判假绿；真实 Lighthouse
      // 产出与官方词形的实例差异（displayValue 本地化等装饰字段）不进装载面。
      console.warn(
        "[盲区说明] 宿主未安装 lighthouse —— lighthouse 腿真实 e2e 跳过（诚实缺席，非通过；真实 LHR 词形为已登记盲区）",
      );
      ctx.skip();
    }
    const adapter = createLighthouseAdapter();
    const plan = adapter.prepare(
      { projectRoot: process.cwd() },
      { grn: "GRN-27-E2E", ranAtSeq: 27, expectedToolVersion: "12.0.0" },
    );
    const raw = adapter.run(plan);
    const record = adapter.normalize(raw, {});
    expect(["passed", "failed", "warning", "not_run"]).toContain(record.verdict);
  });
});
