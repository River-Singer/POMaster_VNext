/**
 * playwright-adapter.spec.ts —— P26 BROWSER 确定性腿（L1；随版计划 Batch 3 B3-1
 * 「Playwright——evidence 必含 console error / network 维度」；D22①；PRD §26.2）。
 *
 * 覆盖面（出口判据逐条对齐）：
 * - 配置读取（browser-gate.json playwright 段；文件级/段级 fail-closed）；
 * - 探测（detectPlaywright package.json @playwright/test 声明线索 + adapter.detect
 *   config 先于工具，security adapter 同款）；
 * - prepare 判卷矩阵（配置 not_configured / 工具 not_run / 版本锚 fail-closed throw /
 *   就绪计划字段；不做档位豁免——§27.1 MINIMAL visual verify 在主集）；
 * - run/normalize 判卷矩阵（fake spawn + 真实 fs 报告回读：passed / failed spec /
 *   console 维度违规 / network 维度违规 / flaky warning cap / 版本漂移 / skipped
 *   notApplicable / 维度缺失=not_run（出口判据 2）+ path-only/malformed 维度 /
 *   报告缺席/malformed 报告/陈旧报告失效化/路径安全闸——三道闸先例全适用；
 *   判卷锚=报告重算，退出码非锚）；
 * - 报告词形对账（官方 JSONReport 词形——testReporter.d.ts 对账；词形之外
 *   malformed → not_run 禁默认值；attachments body 双词形宽容：纯文本 + base64）；
 * - items 违规明细不丢失关键定位信息（spec file:line + 维度条目 text/url）；
 * - 真实子进程两段式（fake 可执行脚本 × 真实 spawnSync；出口判据 1——判定链
 *   真实走通）+ 64MB maxBuffer 大输出回归（回落 1MB 即 ENOBUFS 红，P22 先例）；
 * - 宿主真实 e2e（宿主未装则诚实 skip + 盲区说明——宿主 e2e skip 纪律；真实
 *   Playwright 报告词形无法宿主验证 → 显式盲区登记）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONSOLE_DIMENSION_ATTACHMENT,
  NETWORK_DIMENSION_ATTACHMENT,
  PLAYWRIGHT_DEFAULT_REPORT,
  PLAYWRIGHT_METRIC_DIALECT,
  PLAYWRIGHT_TOOL_ID,
  PLAYWRIGHT_VERSION_PROBE_COMMAND,
  createPlaywrightAdapter,
  detectPlaywright,
  extractDimension,
  normalizePlaywrightLeg,
  parsePlaywrightJsonReport,
  playwrightReportAbsolutePath,
  platformExecutableProbe,
  readPlaywrightGateConfig,
  resolvePlaywrightReportPath,
  runPlaywrightLeg,
  stripQuotesFromPathEnv,
  toGateResultJson,
  type DetectorFacts,
  type GatePolicy,
  type PlaywrightLegPlan,
  type SpawnFn,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-gauntlet-playwright-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 官方 JSONReport 词形夹具构造（对账 testReporter.d.ts；2026-08-31 官方词形）
// ============================================================

const FIXTURE_START_TIME = "2026-08-31T00:00:00.000Z"; // A4：夹具墙钟字段固定词形零漂移

/** 维度附件（契约词形：application/json + body 内联 JSON 数组；base64=官方序列化词形）。 */
function dimensionAttachment(
  name: string,
  entries: readonly unknown[],
  opts: { inline?: boolean; contentType?: string; body?: string } = {},
): Record<string, unknown> {
  const inline = opts.inline ?? true;
  if (!inline) {
    return {
      name,
      contentType: opts.contentType ?? "application/json",
      path: "reports/browser/attachment-cases.json",
    };
  }
  return {
    name,
    contentType: opts.contentType ?? "application/json",
    body: opts.body ?? Buffer.from(JSON.stringify(entries), "utf8").toString("base64"),
  };
}

function fullDimensions(entries: readonly unknown[] = []): Record<string, unknown>[] {
  return [
    dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, entries),
    dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, []),
  ];
}

/** 维度附件组（条目注入指定维度；另一维保持空数组——干净维度是合法形态）。 */
function dimensionsWith(
  consoleEntries: readonly unknown[],
  networkEntries: readonly unknown[],
): Record<string, unknown>[] {
  return [
    dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, consoleEntries),
    dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, networkEntries),
  ];
}

/** 官方 JSONReportTestResult 词形（超集字段齐备；attachments=消费面）。 */
function testResult(
  attachments: readonly Record<string, unknown>[],
  status = "passed",
): Record<string, unknown> {
  return {
    workerIndex: 0,
    parallelIndex: 0,
    status,
    duration: 1,
    error: undefined,
    errors: [],
    stdout: [],
    stderr: [],
    retry: 0,
    startTime: FIXTURE_START_TIME,
    attachments,
    annotations: [],
  };
}

/** 官方 JSONReportTest 词形。 */
function testEntry(
  status: "skipped" | "expected" | "unexpected" | "flaky",
  attachments: readonly Record<string, unknown>[] = fullDimensions(),
  results?: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return {
    timeout: 30000,
    annotations: [],
    expectedStatus: "passed",
    projectName: "chromium",
    projectId: "chromium",
    results: results ?? [testResult(attachments, status === "skipped" ? "skipped" : "passed")],
    status,
  };
}

/** 官方 JSONReportSpec 词形。 */
function specEntry(
  title: string,
  tests: readonly Record<string, unknown>[],
  file = "tests/traversal/pages.spec.ts",
  line = 3,
): Record<string, unknown> {
  return { tags: [], title, ok: true, tests, id: `spec-${title}`, file, line, column: 1 };
}

/** 官方 JSONReportSuite 词形（顶层 file suite）。 */
function suiteEntry(
  title: string,
  specs: readonly Record<string, unknown>[],
  suites: readonly Record<string, unknown>[] = [],
  file = "tests/traversal/pages.spec.ts",
): Record<string, unknown> {
  return { title, file, column: 1, line: 1, specs, suites };
}

/** 官方 JSONReport 词形根。 */
function reportJson(suites: readonly Record<string, unknown>[]): string {
  return JSON.stringify({
    config: { projects: [] },
    suites,
    errors: [],
    stats: {
      startTime: FIXTURE_START_TIME,
      duration: 5,
      expected: 1,
      unexpected: 0,
      flaky: 0,
      skipped: 0,
    },
  });
}

/** 干净单 test 报告（页面加载 spec + 双维度空数组 = 干净）。 */
const CLEAN_REPORT = reportJson([
  suiteEntry("tests/traversal/pages.spec.ts", [
    specEntry("页面加载 /", [testEntry("expected")]),
  ]),
]);

// ============================================================
// fake facts / 手工计划 / 调度 fake spawn（真实 fs 报告回读——security spec 先例）
// ============================================================

const FAKE_TOOLS = "C:/fake-playwright-tools";

function playwrightFacts(): DetectorFacts {
  return fakeFacts(root, {
    files: {
      [posixJoin(root, "browser-gate.json")]: JSON.stringify({
        playwright: { command: "corepack pnpm exec playwright test --reporter=json" },
      }),
      [posixJoin(root, "package.json")]: JSON.stringify({
        devDependencies: { "@playwright/test": "^1.49.0" },
      }),
    },
    pathEnv: FAKE_TOOLS,
  });
}

function bareFacts(): DetectorFacts {
  return fakeFacts("D:/bare-proj", { files: {} });
}

function policy(overrides: Partial<GatePolicy> = {}): GatePolicy {
  return { grn: "GRN-26", ranAtSeq: 26, trigger: "on_demand", ...overrides };
}

/** 真实 fs 手工计划夹具（判卷矩阵/两段式用——绕过 prepare 的 PATH 依赖，coverage spec 先例）。 */
function handPlan(overrides: Partial<PlaywrightLegPlan> = {}): PlaywrightLegPlan {
  return {
    grn: "GRN-26",
    gate: "BROWSER",
    gateDef: "POLICY.GATE.BROWSER@0.2.0",
    ranAtSeq: 26,
    subjectId: null,
    denominatorRefs: [],
    tool: PLAYWRIGHT_TOOL_ID,
    toolVersion: "1.49.0",
    metricDialect: PLAYWRIGHT_METRIC_DIALECT,
    projectRoot: root,
    trigger: "on_demand",
    absenceKind: null,
    absentReason: null,
    absentHint: null,
    command: `node "${join(root, "traversal.cjs")}"`,
    versionProbeCommand: "node --version",
    executable: "node",
    timeoutMs: 600_000,
    reportPath: PLAYWRIGHT_DEFAULT_REPORT,
    expectedToolVersion: "1.49.0",
    ...overrides,
  };
}

/** 调度 fake spawn：版本探测（命令含 version）→ 版本词形；真执行 → 写报告到真实 fs。 */
function dispatchSpawn(reportText: string | null, version = "Version 1.49.0"): SpawnFn {
  return (command) => {
    if (command.includes("version")) {
      return { status: 0, stdout: `${version}\n`, stderr: "", error: null, externalMs: 5 };
    }
    if (reportText !== null) {
      const abs = playwrightReportAbsolutePath(root, PLAYWRIGHT_DEFAULT_REPORT);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, reportText, "utf8");
    }
    return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
  };
}

/** 单腿全链路：run（注入 spawn + 可执行体探针放行）→ normalize。 */
function runLeg(
  reportText: string | null,
  planOverrides: Partial<PlaywrightLegPlan> = {},
  spawn: SpawnFn = dispatchSpawn(reportText),
): GateResultRecord {
  const plan = handPlan(planOverrides);
  const raw = runPlaywrightLeg(plan, spawn, () => "C:/fake/node-on-path");
  return normalizePlaywrightLeg(raw, 3);
}

// ============================================================
// 配置读取（browser-gate.json playwright 段；fail-closed）
// ============================================================

describe("readPlaywrightGateConfig（browser-gate.json 配置面）", () => {
  it("文件缺席 → not ok + 配置指引（诚实缺席非静默）", () => {
    const read = readPlaywrightGateConfig(bareFacts());
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.reason).toContain("browser-gate.json");
      expect(read.installHint).toContain("playwright");
    }
  });

  it("JSON 坏形 → not ok + 修复指引；根非对象 → not ok", () => {
    const badJson = fakeFacts(root, {
      files: { [posixJoin(root, "browser-gate.json")]: "{not json" },
    });
    const read = readPlaywrightGateConfig(badJson);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("不可解析");
    const badRoot = fakeFacts(root, {
      files: { [posixJoin(root, "browser-gate.json")]: "[]" },
    });
    const read2 = readPlaywrightGateConfig(badRoot);
    expect(read2.ok).toBe(false);
    if (!read2.ok) expect(read2.reason).toContain("根必须是 JSON 对象");
  });

  it("段未声明 / 段坏形 / command 缺失 → 逐项 not ok", () => {
    const empty = fakeFacts(root, {
      files: { [posixJoin(root, "browser-gate.json")]: "{}" },
    });
    expect(readPlaywrightGateConfig(empty).ok).toBe(false);
    const badSection = fakeFacts(root, {
      files: { [posixJoin(root, "browser-gate.json")]: '{"playwright":"x"}' },
    });
    expect(readPlaywrightGateConfig(badSection).ok).toBe(false);
    const noCommand = fakeFacts(root, {
      files: { [posixJoin(root, "browser-gate.json")]: '{"playwright":{}}' },
    });
    const read = readPlaywrightGateConfig(noCommand);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("command");
  });

  it("声明段 → ok + 缺省 report/versionProbe 落点；显式覆盖生效", () => {
    const minimal = fakeFacts(root, {
      files: {
        [posixJoin(root, "browser-gate.json")]: JSON.stringify({
          playwright: { command: "npx playwright test" },
        }),
      },
    });
    const read = readPlaywrightGateConfig(minimal);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.config.command).toBe("npx playwright test");
      expect(resolvePlaywrightReportPath(read.config.report)).toBe(
        "reports/browser/playwright.json",
      );
      expect(read.config.versionProbe).toBeNull();
    }
    const explicit = fakeFacts(root, {
      files: {
        [posixJoin(root, "browser-gate.json")]: JSON.stringify({
          playwright: {
            command: "npx playwright test",
            report: "reports/browser/pw.json",
            versionProbe: "npx playwright --version",
          },
        }),
      },
    });
    const read2 = readPlaywrightGateConfig(explicit);
    expect(read2.ok).toBe(true);
    if (read2.ok) {
      expect(read2.config.report).toBe("reports/browser/pw.json");
      expect(read2.config.versionProbe).toBe("npx playwright --version");
    }
  });

  it("report/versionProbe 越形（空串/非字符串）→ not ok", () => {
    const badReport = fakeFacts(root, {
      files: {
        [posixJoin(root, "browser-gate.json")]: JSON.stringify({
          playwright: { command: "x", report: "" },
        }),
      },
    });
    expect(readPlaywrightGateConfig(badReport).ok).toBe(false);
    const badProbe = fakeFacts(root, {
      files: {
        [posixJoin(root, "browser-gate.json")]: JSON.stringify({
          playwright: { command: "x", versionProbe: 42 },
        }),
      },
    });
    expect(readPlaywrightGateConfig(badProbe).ok).toBe(false);
  });
});

// ============================================================
// 探测（detectPlaywright + adapter.detect：config 先于工具）
// ============================================================

describe("detectPlaywright（package.json @playwright/test 线索）", () => {
  it("声明依赖 → READY + 版本提取；未声明 → NOT_INSTALLED + 安装路标；package.json 缺席 → NOT_INSTALLED", () => {
    const ready = detectPlaywright(playwrightFacts());
    expect(ready.status).toBe("READY");
    if (ready.status === "READY") {
      expect(ready.detectedVersion).toBe("1.49.0");
      expect(ready.evidence).toContain("@playwright/test");
    }
    const absent = detectPlaywright(
      fakeFacts(root, { files: { [posixJoin(root, "package.json")]: "{}" } }),
    );
    expect(absent.status).toBe("NOT_INSTALLED");
    if (absent.status === "NOT_INSTALLED") {
      expect(absent.installHint).toMatch(/playwright install|@playwright\/test/);
    }
    const noPkg = detectPlaywright(bareFacts());
    expect(noPkg.status).toBe("NOT_INSTALLED");
  });

  it("expectedVersion 失配 → DRIFTED（判卷降级 warning 语义）", () => {
    const drifted = detectPlaywright(playwrightFacts(), { expectedVersion: "1.50.0" });
    expect(drifted.status).toBe("DRIFTED");
    if (drifted.status === "DRIFTED") {
      expect(drifted.detectedVersion).toBe("1.49.0");
      expect(drifted.expectedVersion).toBe("1.50.0");
    }
  });

  it("NOT_REQUIRED_BY_PROFILE 词形（词表四态收编前冻结）", () => {
    const exempt = detectPlaywright(playwrightFacts(), { requiredByProfile: false });
    expect(exempt.status).toBe("NOT_REQUIRED_BY_PROFILE");
  });
});

describe("playwright adapter detect（config 先于工具，security adapter 同款）", () => {
  it("browser-gate.json 未声明 → NOT_INSTALLED（配置线索缺席）；声明 + 工具缺席 → NOT_INSTALLED 工具线索", () => {
    const adapter = createPlaywrightAdapter();
    const configAbsent = adapter.detect(bareFacts());
    expect(configAbsent.status).toBe("NOT_INSTALLED");
    if (configAbsent.status === "NOT_INSTALLED") {
      expect(configAbsent.reason).toContain("browser-gate.json");
    }
    const toolAbsent = adapter.detect(
      fakeFacts(root, {
        files: {
          [posixJoin(root, "browser-gate.json")]: JSON.stringify({
            playwright: { command: "npx playwright test" },
          }),
        },
      }),
    );
    expect(toolAbsent.status).toBe("NOT_INSTALLED");
    if (toolAbsent.status === "NOT_INSTALLED") {
      expect(toolAbsent.reason).toContain("playwright\" 段已声明但");
    }
    expect(adapter.detect(playwrightFacts()).status).toBe("READY");
  });
});

// ============================================================
// prepare 判卷矩阵（配置/工具/版本锚；不做档位豁免）
// ============================================================

describe("playwright adapter prepare（缺席分流 + 就绪计划）", () => {
  it("配置缺席 → not_configured 全链路（absenceKind=config_absent；scopeNote 带配置指引）", () => {
    const adapter = createPlaywrightAdapter();
    const plan = adapter.prepare({ projectRoot: "D:/bare-proj" }, policy(), bareFacts());
    const raw = adapter.run(plan);
    const record = adapter.normalize(raw, {});
    expect(plan.absenceKind).toBe("config_absent");
    expect(record.verdict).toBe("not_configured");
    expect(record.scopeNote).toContain("browser-gate.json");
    expect(record.scopeNote).toContain("playwright");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("工具缺席 → not_run（非绿非红）+ 安装路标；不牵连 MCP 交互腿的语义在 scopeNote 声明", () => {
    const adapter = createPlaywrightAdapter();
    const configOnly = fakeFacts(root, {
      files: {
        [posixJoin(root, "browser-gate.json")]: JSON.stringify({
          playwright: { command: "npx playwright test" },
        }),
      },
    });
    const plan = adapter.prepare({ projectRoot: root }, policy(), configOnly);
    const record = adapter.normalize(adapter.run(plan), {});
    expect(plan.absenceKind).toBe("tool_absent");
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("@playwright/test");
    expect(record.scopeNote).toContain("不牵连 MCP 交互腿");
  });

  it("就绪计划字段齐备（command/versionProbe/report/executable/版本锚）+ 版本锚缺失 fail-closed throw", () => {
    const adapter = createPlaywrightAdapter();
    const plan = adapter.prepare(
      { projectRoot: root },
      policy({ expectedToolVersion: "1.49.0" }),
      playwrightFacts(),
    );
    expect(plan.absenceKind).toBeNull();
    expect(plan.command).toBe("corepack pnpm exec playwright test --reporter=json");
    expect(plan.versionProbeCommand).toBe(PLAYWRIGHT_VERSION_PROBE_COMMAND);
    expect(plan.reportPath).toBe("reports/browser/playwright.json");
    expect(plan.executable).toBe("corepack");
    expect(plan.toolVersion).toBe("1.49.0");
    expect(plan.metricDialect).toBe("browser:playwright_traversal");
    expect(() =>
      adapter.prepare({ projectRoot: root }, policy(), playwrightFacts()),
    ).toThrowError(/expectedToolVersion/);
  });

  it("MINIMAL 档不豁免（§27.1 visual verify 在主集——BROWSER 腿全档判卷）", () => {
    const adapter = createPlaywrightAdapter();
    const plan = adapter.prepare(
      { projectRoot: root },
      policy({ gateTier: "MINIMAL", expectedToolVersion: "1.49.0" }),
      playwrightFacts(),
    );
    expect(plan.absenceKind).toBeNull();
  });
});

// ============================================================
// run/normalize 判卷矩阵（判卷锚=报告重算；出口判据 1/2 载体）
// ============================================================

describe("playwright 腿判卷矩阵（fake spawn × 真实 fs 报告回读）", () => {
  it("干净遍历（全 expected + 双维度空数组）→ passed + counts 载体=tests + 口径词形", () => {
    const record = runLeg(CLEAN_REPORT);
    expect(record.verdict).toBe("passed");
    expect(record.counts).toEqual({
      scanned: 1,
      applicableScanned: 1,
      violations: 0,
      notApplicable: 0,
    });
    expect(record.metricDialect).toBe("browser:playwright_traversal");
    expect(record.scopeNote).toContain("判卷锚=报告 reports/browser/playwright.json 重算");
    expect(record.scopeNote).toContain("退出码非判卷锚");
    const doc = toGateResultJson(record);
    if (!validate(doc)) console.error(validate.errors);
    expect(validate(doc)).toBe(true);
  });

  it("spec 失败（status=unexpected）→ failed + items rule=playwright_test_failed + 定位 file:line", () => {
    const report = reportJson([
      suiteEntry("tests/traversal/pages.spec.ts", [
        specEntry("页面加载 /", [
          testEntry("unexpected", fullDimensions(), [
            testResult(fullDimensions(), "failed"),
          ]),
        ]),
      ]),
    ]);
    const record = runLeg(report);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.rule).toBe("playwright_test_failed");
    expect(record.items?.[0]?.location).toBe("tests/traversal/pages.spec.ts:3");
    expect(record.items?.[0]?.message).toContain("页面加载 /");
  });

  it("Console Error 维度（B3-1 强制维度）→ 逐条计 violations + rule=browser_console_error + 条目 text/url 不丢失", () => {
    const consoleEntries: readonly unknown[] = [
      { text: "Uncaught TypeError: x is not a function", url: "https://app.local/main.js" },
      "plain string console error",
    ];
    const report = reportJson([
      suiteEntry("tests/traversal/pages.spec.ts", [
        specEntry("页面加载 /", [testEntry("expected", dimensionsWith(consoleEntries, []))]),
      ]),
    ]);
    const record = runLeg(report);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.items?.[0]?.rule).toBe("browser_console_error");
    expect(record.items?.[0]?.message).toContain("Uncaught TypeError");
    expect(record.items?.[0]?.message).toContain("https://app.local/main.js");
    expect(record.scopeNote).toContain("console-error 2");
  });

  it("Network Error 维度 → 逐条计 violations + rule=browser_network_error", () => {
    const networkEntries: readonly unknown[] = [
      { text: "request failed net::ERR_CONNECTION_REFUSED", url: "https://api.local/v1/list" },
    ];
    const report = reportJson([
      suiteEntry("tests/traversal/pages.spec.ts", [
        specEntry("页面加载 /", [testEntry("expected", dimensionsWith([], networkEntries))]),
      ]),
    ]);
    const record = runLeg(report);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.rule).toBe("browser_network_error");
    expect(record.items?.[0]?.message).toContain("ERR_CONNECTION_REFUSED");
    expect(record.scopeNote).toContain("network-error 1");
  });

  it("flaky（重试后通过）→ warning cap=playwright_flaky_tests（非静默）；flaky + 违规 → failed 不被 cap 洗白", () => {
    const flakyReport = reportJson([
      suiteEntry("tests/traversal/pages.spec.ts", [
        specEntry("页面加载 /", [testEntry("flaky")]),
      ]),
    ]);
    const record = runLeg(flakyReport);
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("playwright_flaky_tests");

    const flakyAndFailed = reportJson([
      suiteEntry("tests/traversal/pages.spec.ts", [
        specEntry("a", [testEntry("flaky")]),
        specEntry("b", [
          testEntry("unexpected", fullDimensions(), [testResult(fullDimensions(), "failed")]),
        ]),
      ]),
    ]);
    const record2 = runLeg(flakyAndFailed);
    expect(record2.verdict).toBe("failed");
    expect(record2.verdictCapReason).toBeNull();
  });

  it("skipped test → notApplicable 计数 + 维度不要求（无执行面）；重算权威：stats.unexpected 篡改不影响判卷", () => {
    const report = reportJson([
      suiteEntry("tests/traversal/pages.spec.ts", [
        specEntry("页面加载 /", [testEntry("expected")]),
        specEntry("核心流程 checkout", [testEntry("skipped")]),
      ]),
    ]);
    const record = runLeg(report);
    expect(record.verdict).toBe("passed");
    expect(record.counts).toEqual({
      scanned: 2,
      applicableScanned: 1,
      violations: 0,
      notApplicable: 1,
    });
    // C5 重算：把 stats.unexpected 篡改成 0（本就为 0）——反向：篡改 spec.ok=false 也不翻转
    const tampered = JSON.parse(
      reportJson([
        suiteEntry("tests/traversal/pages.spec.ts", [
          specEntry("页面加载 /", [testEntry("expected")]),
        ]),
      ]),
    ) as Record<string, unknown>;
    (tampered["stats"] as Record<string, unknown>)["unexpected"] = 99;
    const record2 = runLeg(JSON.stringify(tampered));
    expect(record2.verdict).toBe("passed");
    expect(record2.counts.violations).toBe(0);
  });

  it("七项清单 SPA Route/Login/核心流程承载：多 spec 全重算（含嵌套 suites 递归展开）", () => {
    const report = reportJson([
      suiteEntry("tests/traversal", [], [
        suiteEntry("tests/traversal/login.spec.ts", [
          specEntry("登录后进入控制台", [testEntry("expected")], "tests/traversal/login.spec.ts", 8),
        ], [], "tests/traversal/login.spec.ts"),
        suiteEntry("tests/traversal/spa.spec.ts", [
          specEntry("SPA 路由切换不整页刷新", [testEntry("expected")], "tests/traversal/spa.spec.ts", 12),
        ], [], "tests/traversal/spa.spec.ts"),
      ]),
    ]);
    const record = runLeg(report);
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBe(2);
  });
});

// ============================================================
// 维度完整性闸（出口判据 2：缺任一维 = 不完整判卷 → not_run，非默认值）
// ============================================================

describe("维度完整性闸（B3-1：evidence 必含 console error / network 维度）", () => {
  it("缺 console-errors 附件 → not_run（非绿非红）+ scopeNote 点名缺维与 spec 位置", () => {
    const report = reportJson([
      suiteEntry("tests/traversal/pages.spec.ts", [
        specEntry("页面加载 /", [
          testEntry("expected", [dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, [])]),
        ]),
      ]),
    ]);
    const record = runLeg(report);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("console-errors");
    expect(record.scopeNote).toContain("tests/traversal/pages.spec.ts");
    expect(record.scopeNote).toContain("不完整判卷");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("缺 network-errors 附件 → not_run；contentType 非 application/json → not_run", () => {
    const noNetwork = reportJson([
      suiteEntry("s", [
        specEntry("页面加载 /", [
          testEntry("expected", [dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, [])]),
        ]),
      ]),
    ]);
    const r1 = runLeg(noNetwork);
    expect(r1.verdict).toBe("not_run");
    expect(r1.scopeNote).toContain("network-errors");

    const badType = reportJson([
      suiteEntry("s", [
        specEntry("页面加载 /", [
          testEntry("expected", [
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, []),
            dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, [], {
              contentType: "text/plain",
            }),
          ]),
        ]),
      ]),
    ]);
    const r2 = runLeg(badType);
    expect(r2.verdict).toBe("not_run");
    expect(r2.scopeNote).toContain("application/json");
  });

  it("附件仅 path 落盘（无 body 内联）→ not_run（normalize 纯报告文本输入契约边界）", () => {
    const report = reportJson([
      suiteEntry("s", [
        specEntry("页面加载 /", [
          testEntry("expected", [
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, [], { inline: false }),
            dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, []),
          ]),
        ]),
      ]),
    ]);
    const record = runLeg(report);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("body 内联");
  });

  it("附件 body 不可解码（非纯文本非 base64 JSON）→ not_run；非数组 body → not_run", () => {
    const unparseable = reportJson([
      suiteEntry("s", [
        specEntry("页面加载 /", [
          testEntry("expected", [
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, [], { body: "!!!! not json !!!!" }),
            dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, []),
          ]),
        ]),
      ]),
    ]);
    const r1 = runLeg(unparseable);
    expect(r1.verdict).toBe("not_run");
    expect(r1.scopeNote).toContain("不可解码");

    const notArray = reportJson([
      suiteEntry("s", [
        specEntry("页面加载 /", [
          testEntry("expected", [
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, []),
            dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, [], {
              body: Buffer.from(JSON.stringify({ errors: [] }), "utf8").toString("base64"),
            }),
          ]),
        ]),
      ]),
    ]);
    const r2 = runLeg(notArray);
    expect(r2.verdict).toBe("not_run");
    expect(r2.scopeNote).toContain("非 JSON 数组");
  });

  it("base64 与纯文本双词形皆可解码（官方 Buffer.toString(base64) 序列化 + 纯文本内联）", () => {
    const asPlain = reportJson([
      suiteEntry("s", [
        specEntry("页面加载 /", [
          testEntry("expected", [
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, [], {
              body: JSON.stringify([{ text: "boom" }]),
            }),
            dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, []),
          ]),
        ]),
      ]),
    ]);
    const r1 = runLeg(asPlain);
    expect(r1.verdict).toBe("failed");
    expect(r1.counts.violations).toBe(1);
    // base64 词形已由默认构造器覆盖（dimensionAttachment 缺省 base64）。
    expect(extractDimension(parsePlaywrightJsonReport(CLEAN_REPORT)!.suites[0]!.specs[0]!.tests[0]!.attachments, CONSOLE_DIMENSION_ATTACHMENT).kind).toBe("ok");
  });

  it("skipped test 不要求维度（无执行面）→ 全 skipped 报告 passed + notApplicable 计数", () => {
    const report = reportJson([
      suiteEntry("s", [specEntry("核心流程 checkout", [testEntry("skipped")])]),
    ]);
    const record = runLeg(report);
    expect(record.verdict).toBe("passed");
    expect(record.counts.notApplicable).toBe(1);
  });
});

// ============================================================
// 同名多条附件聚合（P26 红队 MAJOR：官方 testInfo.attach 同名多次调用合法，
// 取首/取末皆开洗白通道——聚合全部条目，任何一条含违规即违规）
// ============================================================

describe("同名多条附件聚合（取首洗白通道封死）", () => {
  const DIRTY_CONSOLE: readonly unknown[] = [
    { text: "Uncaught TypeError: x is not a function", url: "https://app.local/main.js" },
  ];

  /** 同名 console-errors 双附件报告（序可翻转——净前脏后 / 脏前净后）。 */
  function sameNameConsoleReport(order: "clean-first" | "dirty-first"): string {
    const first = order === "clean-first" ? [] : DIRTY_CONSOLE;
    const second = order === "clean-first" ? DIRTY_CONSOLE : [];
    return reportJson([
      suiteEntry("tests/traversal/pages.spec.ts", [
        specEntry("页面加载 /", [
          testEntry("expected", [
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, first),
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, second),
            dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, []),
          ]),
        ]),
      ]),
    ]);
  }

  function parsedAttachments(report: string) {
    const parsed = parsePlaywrightJsonReport(report);
    expect(parsed).not.toBeNull();
    return parsed!.suites[0]!.specs[0]!.tests[0]!.attachments;
  }

  it("extractDimension：同名多条聚合全部条目（ok = 合并，序保持输入序）", () => {
    const attachments = parsedAttachments(
      reportJson([
        suiteEntry("s", [
          specEntry("t", [
            testEntry("expected", [
              dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, []),
              dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, [{ text: "e1" }]),
              dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, [{ text: "e2" }]),
              dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, []),
            ]),
          ]),
        ]),
      ]),
    );
    const extraction = extractDimension(attachments, CONSOLE_DIMENSION_ATTACHMENT);
    expect(extraction.kind).toBe("ok");
    if (extraction.kind === "ok") {
      expect(extraction.entries.map((entry) => entry.text)).toEqual(["e1", "e2"]);
    }
  });

  it("双序判卷一致：净前脏后 / 脏前净后 都 failed（红队亲跑实锤的取首洗白通道封死）", () => {
    for (const order of ["clean-first", "dirty-first"] as const) {
      const record = runLeg(sameNameConsoleReport(order));
      expect(record.verdict, `order=${order}`).toBe("failed");
      expect(record.counts.violations, `order=${order}`).toBe(1);
      expect(record.items?.[0]?.rule).toBe("browser_console_error");
      expect(record.items?.[0]?.message).toContain("Uncaught TypeError");
      expect(record.scopeNote).toContain("console-error 1");
    }
  });

  it("聚合面坏形条目禁被同名干净条目洗掉：path_only / 不可解码 均按该形态落 not_run", () => {
    const withPathOnly = reportJson([
      suiteEntry("s", [
        specEntry("页面加载 /", [
          testEntry("expected", [
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, []),
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, [], { inline: false }),
            dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, []),
          ]),
        ]),
      ]),
    ]);
    const r1 = runLeg(withPathOnly);
    expect(r1.verdict).toBe("not_run");
    expect(r1.scopeNote).toContain("body 内联");

    const withJunk = reportJson([
      suiteEntry("s", [
        specEntry("页面加载 /", [
          testEntry("expected", [
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, []),
            dimensionAttachment(CONSOLE_DIMENSION_ATTACHMENT, [], { body: "!!!! not json !!!!" }),
            dimensionAttachment(NETWORK_DIMENSION_ATTACHMENT, []),
          ]),
        ]),
      ]),
    ]);
    const r2 = runLeg(withJunk);
    expect(r2.verdict).toBe("not_run");
    expect(r2.scopeNote).toContain("不可解码");
  });
});

// ============================================================
// 零分母闸（P26 红队 MAJOR：空 suites / 空 specs / 空 tests 三形态禁当满分——
// mutation-leg computeKillScore 先例：分母为 0 必须落 not_run）
// ============================================================

describe("零分母闸（空分母形态非满分）", () => {
  it("suites:[] → not_run + scopeNote 点名零分母（counts 显式全零，非绿非红）", () => {
    const record = runLeg(reportJson([]));
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("零分母");
    expect(record.scopeNote).toContain("空 suites");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("suite.specs:[] → not_run；spec.tests:[] → not_run（两形态同判）", () => {
    const emptySpecs = runLeg(reportJson([suiteEntry("s", [])]));
    expect(emptySpecs.verdict).toBe("not_run");
    expect(emptySpecs.scopeNote).toContain("零分母");

    const emptyTests = runLeg(reportJson([suiteEntry("s", [specEntry("t", [])])]));
    expect(emptyTests.verdict).toBe("not_run");
    expect(emptyTests.scopeNote).toContain("零分母");
  });

  it("嵌套空 suites 递归展开后仍零 testcase → not_run（分母以 flatten 全集计）", () => {
    const record = runLeg(
      reportJson([suiteEntry("outer", [], [suiteEntry("inner", [])])]),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("mutation-leg computeKillScore");
  });
});

// ============================================================
// 报告词形对账（malformed → not_run 禁默认值；官方词形装载面）
// ============================================================

describe("报告词形对账（官方 JSONReport；词形之外 malformed）", () => {
  it("parse 层：非 JSON / suites 缺失 / suites 非数组 / test.status 词形越界 → null", () => {
    expect(parsePlaywrightJsonReport("not json")).toBeNull();
    expect(parsePlaywrightJsonReport("{}")).toBeNull();
    expect(parsePlaywrightJsonReport(JSON.stringify({ suites: {}, errors: [] }))).toBeNull();
    const badStatus = {
      suites: [
        {
          title: "s",
          file: "a.spec.ts",
          specs: [
            { title: "t", file: "a.spec.ts", tests: [{ status: "weird-word", results: [] }] },
          ],
        },
      ],
      errors: [],
    };
    expect(parsePlaywrightJsonReport(JSON.stringify(badStatus))).toBeNull();
  });

  it("normalize 层：executed test 零 results（自相矛盾报告）→ not_run；报告缺席 → not_run；malformed → not_run 带摘录", () => {
    const zeroResults = reportJson([
      suiteEntry("s", [
        { tags: [], title: "t", ok: true, tests: [{ status: "unexpected", results: [] }], id: "x", file: "a.spec.ts", line: 1, column: 1 },
      ]),
    ]);
    const r1 = runLeg(zeroResults);
    expect(r1.verdict).toBe("not_run");

    const r2 = runLeg(null);
    expect(r2.verdict).toBe("not_run");
    expect(r2.scopeNote).toContain("报告未产出");

    const r3 = runLeg(",,,");
    expect(r3.verdict).toBe("not_run");
    expect(r3.scopeNote).toContain("词形不可解析");
    expect(r3.scopeNote).toContain("JSONReport");
  });

  it("容错词形：line/projectName/id/stats 缺项仍可解析（装饰字段缺失不判 malformed）", () => {
    const minimal = JSON.stringify({
      suites: [
        {
          title: "s",
          file: "a.spec.ts",
          specs: [
            {
              title: "t",
              file: "a.spec.ts",
              tests: [
                {
                  status: "expected",
                  results: [{ attachments: fullDimensions() }],
                },
              ],
            },
          ],
        },
      ],
      errors: [],
    });
    const parsed = parsePlaywrightJsonReport(minimal);
    expect(parsed).not.toBeNull();
    const record = runLeg(minimal);
    expect(record.verdict).toBe("passed");
  });
});

// ============================================================
// 三道闸（可执行体探测 / 版本探测 / 报告失效化 + 路径安全闸）
// ============================================================

describe("playwright 腿三道闸（P22-P25 先例全适用）", () => {
  it("可执行体缺席（探针 null）→ spawn_failed → not_run（Windows cmd 缺席伪装先拦截）", () => {
    const plan = handPlan();
    const raw = runPlaywrightLeg(plan, dispatchSpawn(CLEAN_REPORT), () => null);
    const record = normalizePlaywrightLeg(raw, 0);
    expect(raw.kind).toBe("spawn_failed");
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("不在 PATH");
  });

  it("版本探测失败（非零退出/无版本词形）→ not_run，禁猜版本口径", () => {
    const plan = handPlan();
    const badSpawn: SpawnFn = (command) =>
      command.includes("version")
        ? { status: 1, stdout: "", stderr: "command not found", error: null, externalMs: 5 }
        : { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
    const raw = runPlaywrightLeg(plan, badSpawn, () => "C:/fake/node-on-path");
    expect(raw.kind).toBe("spawn_failed");
    const record = normalizePlaywrightLeg(raw, 0);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("版本探测失败");

    const noSemver: SpawnFn = (command) =>
      command.includes("version")
        ? { status: 0, stdout: "no version here", stderr: "", error: null, externalMs: 5 }
        : { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
    const raw2 = runPlaywrightLeg(plan, noSemver, () => "C:/fake/node-on-path");
    expect(raw2.kind).toBe("spawn_failed");
  });

  it("陈旧报告失效化：预置报告 + 无副作用 fake → 报告缺席 not_run（陈旧内容零影响）", () => {
    const abs = playwrightReportAbsolutePath(root, PLAYWRIGHT_DEFAULT_REPORT);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, CLEAN_REPORT, "utf8");
    const plan = handPlan();
    const noSideEffect: SpawnFn = (command) =>
      command.includes("version")
        ? { status: 0, stdout: "Version 1.49.0\n", stderr: "", error: null, externalMs: 5 }
        : { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
    const raw = runPlaywrightLeg(plan, noSideEffect, () => "C:/fake/node-on-path");
    expect(raw.reportText).toBeNull();
    const record = normalizePlaywrightLeg(raw, 0);
    expect(record.verdict).toBe("not_run");
    expect(existsSync(abs)).toBe(false);
  });

  it("报告路径安全闸：越出项目根 → pre_run_failed（失效化面禁变任意删除面）", () => {
    const plan = handPlan({ reportPath: "../outside/report.json" });
    const raw = runPlaywrightLeg(plan, dispatchSpawn(CLEAN_REPORT), () => "C:/fake/node-on-path");
    expect(raw.kind).toBe("pre_run_failed");
    const record = normalizePlaywrightLeg(raw, 0);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("路径非法");
  });

  it("版本漂移 → warning cap=tool_version_drifted；漂移 + 违规 → failed 不洗白", () => {
    const drifted = runLeg(
      CLEAN_REPORT,
      { expectedToolVersion: "1.50.0" },
      dispatchSpawn(CLEAN_REPORT, "Version 1.49.0"),
    );
    expect(drifted.verdict).toBe("warning");
    expect(drifted.verdictCapReason).toBe("tool_version_drifted");

    const failedReport = reportJson([
      suiteEntry("s", [
        specEntry("t", [
          testEntry("unexpected", fullDimensions(), [testResult(fullDimensions(), "failed")]),
        ]),
      ]),
    ]);
    const record2 = runLeg(
      failedReport,
      { expectedToolVersion: "1.50.0" },
      dispatchSpawn(failedReport, "Version 1.49.0"),
    );
    expect(record2.verdict).toBe("failed");
    expect(record2.verdictCapReason).toBeNull();
  });
});

// ============================================================
// items 截断预算 + 03 schema 形态
// ============================================================

describe("items 截断预算与 03 schema 形态", () => {
  it("101 条违规 → items 100 截断 + itemsTruncated 留痕", () => {
    const entries = Array.from({ length: 101 }, (_, i) => ({ text: `console ${String(i)}` }));
    const report = reportJson([
      suiteEntry("s", [
        specEntry("t", [testEntry("expected", dimensionsWith(entries, []))]),
      ]),
    ]);
    const record = runLeg(report);
    expect(record.counts.violations).toBe(101);
    expect(record.itemsTruncated).toBe(true);
    expect(record.items).toHaveLength(100);
    expect(validate(toGateResultJson(record))).toBe(true);
  });
});

// ============================================================
// 真实子进程链路（fake 脚本两段式 × 真实 spawnSync；出口判据 1）
// ============================================================

/** 真实 spawnSync wrapper（与 playwrightSpawn 同参数形态 + 注入 FAKE_PATH；P25 先例）。 */
function realSpawn(): SpawnFn {
  return (command, options) => {
    const res = spawnSync(command, {
      shell: true,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      env: stripQuotesFromPathEnv({ ...process.env }),
    });
    return {
      status: res.status,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      error: res.error?.message ?? null,
      externalMs: 5,
    };
  };
}

describe("playwright 真实子进程（fake 脚本 × 真实 spawnSync 两段式；出口判据 1）", () => {
  it("版本探测脚本 + 遍历脚本（真实写盘官方词形报告）→ 全链路判卷红（console 违规被抓）", { timeout: 60_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "pomaster-playwright-two-stage-"));
    const versionScript = join(dir, "fake-pw-version.cjs");
    writeFileSync(
      versionScript,
      'process.stdout.write("Version 1.49.0\\n");\n',
      "utf8",
    );
    const traversalScript = join(dir, "fake-pw-traversal.cjs");
    const consoleEntries = [{ text: "Uncaught ReferenceError: app is not defined", url: "https://app.local/" }];
    const reportText = reportJson([
      suiteEntry("tests/traversal/pages.spec.ts", [
        specEntry("页面加载 /", [testEntry("expected", dimensionsWith(consoleEntries, []))]),
      ]),
    ]);
    const reportAbs = playwrightReportAbsolutePath(root, PLAYWRIGHT_DEFAULT_REPORT);
    writeFileSync(
      traversalScript,
      [
        "const fs = require('node:fs');",
        `fs.mkdirSync(require('node:path').join(${JSON.stringify(reportAbs)}, '..'), { recursive: true });`,
        `fs.writeFileSync(${JSON.stringify(reportAbs)}, ${JSON.stringify(reportText)}, 'utf8');`,
      ].join("\n"),
      "utf8",
    );
    const plan = handPlan({
      command: `node "${traversalScript}"`,
      versionProbeCommand: `node "${versionScript}" --version`,
      executable: "node",
    });
    // 真实探针：node 在测试宿主 PATH 上真实命中（可执行体前置闸真实走通）。
    expect(platformExecutableProbe("node")).not.toBeNull();
    const raw = runPlaywrightLeg(plan, realSpawn());
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("1.49.0");
    expect(raw.reportText).not.toBeNull();
    const record = normalizePlaywrightLeg(raw, 3);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.rule).toBe("browser_console_error");
    expect(record.items?.[0]?.message).toContain("app is not defined");
    const doc = toGateResultJson(record);
    if (!validate(doc)) console.error(validate.errors);
    expect(validate(doc)).toBe(true);
  });

  it("64MB maxBuffer 大输出回归：遍历脚本 stdout >1MB → 无 ENOBUFS（回落 1MB 即红，P22 先例）", { timeout: 60_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "pomaster-playwright-maxbuf-"));
    const versionScript = join(dir, "fake-pw-version.cjs");
    writeFileSync(versionScript, 'process.stdout.write("Version 1.49.0\\n");\n', "utf8");
    const traversalScript = join(dir, "fake-pw-traversal.cjs");
    const reportAbs = playwrightReportAbsolutePath(root, PLAYWRIGHT_DEFAULT_REPORT);
    writeFileSync(
      traversalScript,
      [
        "const fs = require('node:fs');",
        "process.stdout.write('x'.repeat(2 * 1024 * 1024));",
        `fs.mkdirSync(require('node:path').join(${JSON.stringify(reportAbs)}, '..'), { recursive: true });`,
        `fs.writeFileSync(${JSON.stringify(reportAbs)}, ${JSON.stringify(CLEAN_REPORT)}, 'utf8');`,
      ].join("\n"),
      "utf8",
    );
    const plan = handPlan({
      command: `node "${traversalScript}"`,
      versionProbeCommand: `node "${versionScript}" --version`,
      executable: "node",
    });
    const raw = runPlaywrightLeg(plan, realSpawn());
    expect(raw.failureReason).toBeNull();
    expect(raw.kind).toBe("executed");
    const record = normalizePlaywrightLeg(raw, 0);
    expect(record.verdict).toBe("passed");
  });
});

// ============================================================
// 宿主真实 e2e（宿主未装 → 诚实 skip + 盲区说明）
// ============================================================

describe("playwright 腿真实 e2e", () => {
  it("宿主 browser-gate.json + @playwright/test 真装时：全链路真实判卷", (ctx) => {
    let hostPkg: { devDependencies?: Record<string, string>; dependencies?: Record<string, string> } | null = null;
    try {
      hostPkg = JSON.parse(
        readFileSync(join(process.cwd(), "package.json"), "utf8"),
      ) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
    } catch {
      hostPkg = null;
    }
    const declared =
      hostPkg?.devDependencies?.["@playwright/test"] ??
      hostPkg?.dependencies?.["@playwright/test"];
    const hostConfig = existsSync(join(process.cwd(), "browser-gate.json"));
    if (declared === undefined || !hostConfig) {
      // 诚实缺席说明：宿主未声明 @playwright/test / browser-gate.json——真实 e2e
      // 跳过；**盲区显式登记**：真实 Playwright 序列化报告词形（attachments body
      // 的确切编码词形）无法在宿主验证——解析器已对账官方 testReporter.d.ts 词形
      // 并对 body 采用纯文本 + base64 双词形宽容；真实词形差异被双词形之外
      // （malformed → not_run）fail-closed 兜住，不会误判假绿。
      console.warn(
        "[盲区说明] 宿主未声明 @playwright/test 或 browser-gate.json —— playwright 腿真实 e2e 跳过（诚实缺席，非通过；真实报告词形为已登记盲区）",
      );
      ctx.skip();
    }
    // 宿主真装路径（当前宿主不满足；真装后此链路为全真实子进程 + 真实报告）。
    const adapter = createPlaywrightAdapter();
    const plan = adapter.prepare(
      { projectRoot: process.cwd() },
      { grn: "GRN-26-E2E", ranAtSeq: 26, expectedToolVersion: "1.0.0" },
    );
    const raw = adapter.run(plan);
    const record = adapter.normalize(raw, {});
    expect(["passed", "failed", "warning", "not_run"]).toContain(record.verdict);
  });
});

// ============================================================
// 计划组装小件
// ============================================================

describe("计划组装小件", () => {
  it("executable 派生自 versionProbe 首 token（探针按 plan.executable 查找，缺席先拦截）", () => {
    const plan = handPlan({
      versionProbeCommand: "npx playwright --version",
      executable: "npx",
    });
    const raw = runPlaywrightLeg(plan, dispatchSpawn(null), () => null);
    expect(raw.failureReason).toContain("npx");
  });
});
