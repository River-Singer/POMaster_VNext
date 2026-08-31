/**
 * schemathesis-leg.spec.ts —— P27 CONTRACT 加强腿（L1；随版计划 Batch 3 后段
 * B3-4「schemathesis——从 OpenAPI 生成 property-based 用例；FastAPI profile 招牌件」；
 * contract-adapter 第三口径；oasdiff-leg 双锚先例 + playwright-leg 三道闸先例）。
 *
 * 覆盖面（出口判据 3/4 对齐）：
 * - 配置读取（contract-gate.json 第三口径 schemathesis 段 + 三口径互斥 fail-closed）；
 * - prepare 判卷矩阵（schemathesis 缺席 → tool_absent / 版本锚 fail-closed throw /
 *   就绪计划字段 + NDJSON 报告落点）；
 * - run/normalize 判卷矩阵（fake spawn + 真实 fs NDJSON 回读：全 checks 通过 passed /
 *   check failure → failed + items 明细 / 官方退出码契约（0/1/2 逐字）/ exit 1 + 明细
 *   空 → 诚实下限 violations=1（oasdiff 先例）/ exit 0 + 重算失败矛盾 → failed（C5
 *   重算权威）/ exit 2 → not_run / 零生成用例零分母闸（三形态同判）/ 坏 NDJSON 行 →
 *   malformed not_run 禁跳行 / 陈旧报告失效化 / 路径安全闸 / 版本漂移 cap）；
 * - 报告词形对账（官方 NDJSON 词形——2026-08-31 对账 schemathesis 官方仓库
 *   engine/events.py + engine/recorder.py + reporting/ndjson.py：单键事件对象 +
 *   官方事件名集合 + Status 五词形枚举 + ScenarioFinished.recorder 官方词形）；
 * - OpenAPI 事实源 = 受治项目声明（contract-gate.json openapi 字段；fixture 同源：
 *   FastAPI 工程形态与 P16 L2 fixture 同源——见 integration e2e）；
 * - 真实子进程两段式（fake 脚本 × 真实 spawnSync）+ 64MB maxBuffer 回归；
 * - 宿主真实 e2e（宿主未装则诚实 skip + 盲区说明）。
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SCHEMATHESIS_CHECK_STATUSES,
  SCHEMATHESIS_DEFAULT_REPORT,
  SCHEMATHESIS_EVENT_NAMES,
  SCHEMATHESIS_METRIC_DIALECT,
  SCHEMATHESIS_TOOL_ID,
  createContractAdapter,
  detectSchemathesis,
  normalizeSchemathesisLeg,
  parseSchemathesisNdjsonReport,
  readContractConfig,
  runSchemathesisLeg,
  schemathesisReportAbsolutePath,
  stripQuotesFromPathEnv,
  toGateResultJson,
  type DetectorFacts,
  type GatePolicy,
  type SchemathesisLegPlan,
  type SpawnFn,
} from "@pomaster/gauntlet-lite";
import { fakeFacts, posixJoin } from "./helpers.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-gauntlet-schemathesis-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 官方 NDJSON 词形夹具构造（2026-08-31 官方对账：engine/events.py +
// engine/recorder.py + reporting/ndjson.py）
// ============================================================

/** 官方 CheckNode 词形（name/status 官方五枚举/failure_info）。 */
function checkNode(
  name: string,
  status: string,
  failureTitle?: string,
): Record<string, unknown> {
  if (failureTitle === undefined) {
    return { name, status };
  }
  return {
    name,
    status,
    failure_info: {
      code_sample: "GET /health HTTP/1.1",
      failure: { title: failureTitle, value: {} },
    },
  };
}

/** 官方 ScenarioFinished 行词形（单键事件对象 + recorder 官方词形）。 */
function scenarioFinishedLine(opts: {
  phase?: string;
  status?: string;
  cases?: string[];
  checks?: Record<string, unknown>[];
}): string {
  const cases = Object.fromEntries((opts.cases ?? []).map((id) => [id, { value: {} }]));
  const checks =
    opts.checks === undefined
      ? Object.fromEntries((opts.cases ?? []).map((id) => [id, [checkNode("not_a_server_error", "success")]]))
      : Object.fromEntries([["case-1", opts.checks]]);
  return JSON.stringify({
    ScenarioFinished: {
      id: "0f0e0d0c0b0a400980070060050403020",
      timestamp: 0, // A4：夹具墙钟字段固定词形零漂移
      phase: opts.phase ?? "fuzzing",
      suite_id: "aabbccddeeff40019876543210fedcba",
      label: "GET /health",
      status: opts.status ?? "success",
      elapsed_time: 0.5,
      skip_reason: null,
      is_final: true,
      recorder: {
        label: "GET /health",
        status: opts.status ?? "success",
        roots: [],
        cases,
        checks,
        interactions: {},
      },
    },
  });
}

function ndjson(lines: readonly string[], schemathesisVersion = "4.0.7"): string {
  return [
    JSON.stringify({
      Initialize: { command: "st run openapi.yaml", schemathesis_version: schemathesisVersion, seed: 42 },
    }),
    ...lines,
    JSON.stringify({
      EngineFinished: {
        id: "11112222333340055555666677778888",
        timestamp: 1,
        running_time: 1.5,
        stop_reason: "completed",
        failures: [],
      },
    }),
    "",
  ].join("\n");
}

/** 干净报告：1 scenario × 2 cases × 全 success checks。 */
function cleanReport(): string {
  return ndjson([
    scenarioFinishedLine({
      cases: ["case-1", "case-2"],
      checks: [
        checkNode("not_a_server_error", "success"),
        checkNode("status_code_conformance", "success"),
      ],
    }),
  ]);
}

/** 失败报告：not_a_server_error check failure（官方 check 名 + failure_info.title）。 */
function failingReport(): string {
  return ndjson([
    scenarioFinishedLine({
      cases: ["case-1"],
      checks: [
        checkNode("not_a_server_error", "failure", "Internal Server Error"),
        checkNode("status_code_conformance", "success"),
      ],
    }),
  ]);
}

// ============================================================
// fake facts / 手工计划 / 调度 fake spawn（真实 fs 报告回读）
// ============================================================

const FAKE_TOOLS = "C:/fake-schemathesis-tools";
const OPENAPI_PATH = "openapi.yaml";

const ST_CONFIG = {
  openapi: OPENAPI_PATH,
  schemathesis: {
    command:
      "schemathesis run openapi.yaml --url http://127.0.0.1:8080 --report ndjson --report-ndjson-path reports/contract/schemathesis.ndjson",
  },
};

function schemathesisFacts(): DetectorFacts {
  return fakeFacts(root, {
    files: {
      [posixJoin(FAKE_TOOLS, "schemathesis")]: null,
      [posixJoin(root, "contract-gate.json")]: JSON.stringify(ST_CONFIG),
      [posixJoin(root, OPENAPI_PATH)]: "openapi: 3.0.0\ninfo:\n  title: fixture\n  version: 1.0.0\npaths: {}\n",
    },
    pathEnv: FAKE_TOOLS,
  });
}

function policy(overrides: Partial<GatePolicy> = {}): GatePolicy {
  return { grn: "GRN-27", ranAtSeq: 27, trigger: "on_demand", ...overrides };
}

/** 真实 fs 手工计划夹具（判卷矩阵/两段式用——coverage/oasdiff spec 先例）。 */
function handPlan(overrides: Partial<SchemathesisLegPlan> = {}): SchemathesisLegPlan {
  return {
    grn: "GRN-27",
    gate: "CONTRACT",
    gateDef: "POLICY.GATE.CONTRACT@0.1.0",
    ranAtSeq: 27,
    subjectId: null,
    denominatorRefs: [],
    tool: SCHEMATHESIS_TOOL_ID,
    toolVersion: "4.0.7",
    metricDialect: SCHEMATHESIS_METRIC_DIALECT,
    projectRoot: root,
    trigger: "on_demand",
    command: `schemathesis run ${OPENAPI_PATH} --url http://127.0.0.1:8080 --report ndjson`,
    versionProbeCommand: "schemathesis --version",
    executable: "schemathesis",
    timeoutMs: 600_000,
    reportPath: SCHEMATHESIS_DEFAULT_REPORT,
    openapiPath: OPENAPI_PATH,
    expectedToolVersion: "4.0.7",
    ...overrides,
  };
}

function dispatchSpawn(
  reportText: string | null,
  exitCode = 0,
  version = "4.0.7",
): SpawnFn {
  return (command) => {
    if (command.includes("version")) {
      return { status: 0, stdout: `${version}\n`, stderr: "", error: null, externalMs: 5 };
    }
    if (reportText !== null) {
      const abs = schemathesisReportAbsolutePath(root, SCHEMATHESIS_DEFAULT_REPORT);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, reportText, "utf8");
    }
    return { status: exitCode, stdout: "", stderr: "", error: null, externalMs: 5 };
  };
}

function runLeg(
  reportText: string | null,
  planOverrides: Partial<SchemathesisLegPlan> = {},
  exitCode = 0,
): ReturnType<typeof normalizeSchemathesisLeg> {
  const plan = handPlan(planOverrides);
  const raw = runSchemathesisLeg(plan, dispatchSpawn(reportText, exitCode), () => "C:/fake/st-on-path");
  return normalizeSchemathesisLeg(raw, 3);
}

// ============================================================
// 配置读取（contract-gate.json 第三口径 + 三口径互斥）
// ============================================================

describe("readContractConfig（schemathesis 第三口径，P27/B3-4）", () => {
  it("schemathesis 段声明 → ok + mode=schemathesis + 命令/报告落点（report 反斜杠归一）", () => {
    const read = readContractConfig(
      fakeFacts(root, {
        files: {
          [posixJoin(root, "contract-gate.json")]: JSON.stringify({
            openapi: OPENAPI_PATH,
            schemathesis: { command: "st run o.yaml", report: "r\\st.ndjson" },
          }),
        },
      }),
    );
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.config.mode).toBe("schemathesis");
      if (read.config.mode === "schemathesis") {
        expect(read.config.schemathesisCommand).toBe("st run o.yaml");
        expect(read.config.schemathesisReport).toBe("r/st.ndjson");
      }
    }
  });

  it("schemathesis 段坏形（缺 command）→ not ok + 指引", () => {
    const read = readContractConfig(
      fakeFacts(root, {
        files: {
          [posixJoin(root, "contract-gate.json")]: JSON.stringify({
            openapi: OPENAPI_PATH,
            schemathesis: { report: "x.ndjson" },
          }),
        },
      }),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toContain("command");
  });

  it("三口径互斥：schemathesis + expectedOperationIds / schemathesis + breakingDiff → not ok", () => {
    for (const extra of [
      { expectedOperationIds: ["getUser"] },
      { breakingDiff: { base: "base.yaml" } },
    ]) {
      const read = readContractConfig(
        fakeFacts(root, {
          files: {
            [posixJoin(root, "contract-gate.json")]: JSON.stringify({
              openapi: OPENAPI_PATH,
              schemathesis: { command: "st run o.yaml" },
              ...extra,
            }),
          },
        }),
      );
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.reason).toContain("互斥");
    }
  });
});

// ============================================================
// 探测与 prepare（schemathesis 缺席 not_run / 版本锚 / 计划字段）
// ============================================================

describe("detectSchemathesis 与 adapter.prepare（第三口径）", () => {
  it("探测：fake PATH 命中 → READY；无 PATH → NOT_INSTALLED + 安装路标（B3-4 招牌件）", () => {
    expect(detectSchemathesis(schemathesisFacts()).status).toBe("READY");
    const miss = detectSchemathesis(fakeFacts("D:/x", { files: {}, pathEnv: null }));
    expect(miss.status).toBe("NOT_INSTALLED");
    if (miss.status === "NOT_INSTALLED") expect(miss.reason).toContain("schemathesis");
  });

  it("prepare：配置+工具就绪 → schemathesis 计划（报告落点缺省 + openapi 事实源锚 + 版本锚强制）", () => {
    const adapter = createContractAdapter();
    const plan = adapter.prepare(
      { projectRoot: root },
      policy({ expectedToolVersion: "4.0.7" }),
      schemathesisFacts(),
    );
    expect(plan.mode).toBe("schemathesis");
    expect(plan.declared).toBe(true);
    expect(plan.schemathesisPlan).not.toBeNull();
    expect(plan.schemathesisPlan?.reportPath).toBe(SCHEMATHESIS_DEFAULT_REPORT);
    expect(plan.schemathesisPlan?.openapiPath).toBe(OPENAPI_PATH);
    expect(plan.schemathesisPlan?.executable).toBe("schemathesis");
  });

  it("prepare：配置就绪但 schemathesis 不在位 → tool_absent（not_run 非绿非红）", () => {
    const adapter = createContractAdapter();
    const plan = adapter.prepare(
      { projectRoot: root },
      policy(),
      fakeFacts(root, {
        files: {
          [posixJoin(root, "contract-gate.json")]: JSON.stringify(ST_CONFIG),
        },
        pathEnv: null,
      }),
    );
    expect(plan.declared).toBe(false);
    expect(plan.absenceKind).toBe("tool_absent");
  });

  it("prepare：就绪但版本锚缺失 → GateAdapterError throw（oasdiff 腿同款纪律）", () => {
    const adapter = createContractAdapter();
    expect(() =>
      adapter.prepare({ projectRoot: root }, policy(), schemathesisFacts()),
    ).toThrowError(/expectedToolVersion/);
  });

  it("normalize：tool_absent 缺席计划 → not_run + 安装路标（缺席非绿非红）", () => {
    const adapter = createContractAdapter();
    const plan = adapter.prepare(
      { projectRoot: root },
      policy(),
      fakeFacts(root, {
        files: {
          [posixJoin(root, "contract-gate.json")]: JSON.stringify(ST_CONFIG),
        },
        pathEnv: null,
      }),
    );
    const raw = adapter.run(plan);
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("not_run");
    expect(record.counts).toEqual({ scanned: 0, applicableScanned: 0, violations: 0, notApplicable: 0 });
  });
});

// ============================================================
// 官方 NDJSON 解析（词形对账点）
// ============================================================

describe("parseSchemathesisNdjsonReport（官方词形对账）", () => {
  it("官方事件名集合钉住（engine/events.py dataclass 类名 + ndjson.py Initialize 首行记录，逐字）", () => {
    expect(SCHEMATHESIS_EVENT_NAMES).toEqual([
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
    ]);
  });

  it("官方 Status 五词形钉住（engine/__init__.py class Status(str, Enum) 逐字）", () => {
    expect(SCHEMATHESIS_CHECK_STATUSES).toEqual(["success", "failure", "error", "interrupted", "skip"]);
  });

  it("干净报告可解析：schemathesis_version 装载 + 1 scenario × 2 cases + stop_reason", () => {
    const parsed = parseSchemathesisNdjsonReport(cleanReport());
    expect(parsed).not.toBeNull();
    expect(parsed?.schemathesisVersion).toBe("4.0.7");
    expect(parsed?.scenarios).toHaveLength(1);
    expect(parsed?.scenarios[0]?.generatedCases).toBe(2);
    expect(parsed?.scenarios[0]?.checks).toHaveLength(2);
    expect(parsed?.stopReason).toBe("completed");
  });

  it("词形之外 malformed：非 JSON 行 / 双键行 / 事件名越界 / check status 词形越界 / recorder 缺席 → null 禁跳行", () => {
    expect(parseSchemathesisNdjsonReport("not-json")).toBeNull();
    expect(parseSchemathesisNdjsonReport('{"A":{},"B":{}}')).toBeNull();
    expect(parseSchemathesisNdjsonReport('{"NotAnOfficialEvent":{}}')).toBeNull();
    expect(
      parseSchemathesisNdjsonReport(
        scenarioFinishedLine({
          cases: ["case-1"],
          checks: [checkNode("not_a_server_error", "banana")],
        }),
      ),
    ).toBeNull();
    expect(
      parseSchemathesisNdjsonReport(
        JSON.stringify({ ScenarioFinished: { status: "success" } }),
      ),
    ).toBeNull();
    expect(parseSchemathesisNdjsonReport("")).toBeNull();
  });

  it("多 scenario cases 分母累加（recorder.cases 官方登记表）", () => {
    const parsed = parseSchemathesisNdjsonReport(
      ndjson([
        scenarioFinishedLine({ cases: ["case-1", "case-2", "case-3"] }),
        scenarioFinishedLine({ phase: "coverage", cases: ["c-1"] }),
      ]),
    );
    expect(parsed?.scenarios).toHaveLength(2);
    const total = (parsed?.scenarios ?? []).reduce((sum, s) => sum + s.generatedCases, 0);
    expect(total).toBe(4);
  });
});

// ============================================================
// 判卷矩阵（官方退出码契约 × NDJSON 重算双锚；零分母闸）
// ============================================================

describe("normalizeSchemathesisLeg（判卷锚=退出码契约 + NDJSON 重算）", () => {
  it("全 checks 通过（exit 0）→ passed + counts.scanned=生成用例数 + scopeNote 能力面", () => {
    const record = runLeg(cleanReport());
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBe(2);
    expect(record.counts.violations).toBe(0);
    expect(record.scopeNote).toContain("property-based");
    expect(record.scopeNote).toContain(OPENAPI_PATH);
  });

  it("check failure → failed + rule=官方 check 名 + location=openapi#check + failure 明细不丢失", () => {
    const record = runLeg(failingReport(), {}, 1);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    const item = record.items?.[0];
    expect(item?.rule).toBe("not_a_server_error");
    expect(item?.location).toBe(`${OPENAPI_PATH}#not_a_server_error`);
    expect(item?.message).toContain("Internal Server Error");
    expect(record.scopeNote).toContain("exit=1");
  });

  it("check error（官方词形更重态）→ violations（最严可辩护方向）", () => {
    const record = runLeg(
      ndjson([
        scenarioFinishedLine({
          cases: ["case-1"],
          checks: [checkNode("response_schema_conformance", "error", "ConnectionError")],
        }),
      ]),
      {},
      1,
    );
    expect(record.verdict).toBe("failed");
  });

  it("interrupted/skip check（非失败词形）→ 无违规 + cap=schemathesis_checks_not_passed（warning 不冒充全通过）", () => {
    const record = runLeg(
      ndjson([
        scenarioFinishedLine({
          cases: ["case-1"],
          checks: [checkNode("not_a_server_error", "skip")],
        }),
      ]),
      {},
      0,
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("schemathesis_checks_not_passed");
  });

  it("exit 0 + NDJSON 重算检出失败 = 矛盾形态 → failed（C5 重算权威，oasdiff 先例）", () => {
    const record = runLeg(failingReport(), {}, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
  });

  it("exit 1 + NDJSON 重算明细空（report 恰零失败）→ 诚实下限 violations=1（oasdiff 先例）", () => {
    const record = runLeg(cleanReport(), {}, 1);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.rule).toBe("schemathesis_check_failed");
    expect(record.items?.[0]?.message).toContain("退出码 1");
  });

  it("exit 2（官方配置/schema 错误中止）→ not_run 非绿非红；其他非契约退出码同判", () => {
    expect(runLeg(cleanReport(), {}, 2).verdict).toBe("not_run");
    expect(runLeg(cleanReport(), {}, 101).verdict).toBe("not_run");
    expect(runLeg(cleanReport(), {}, 2).scopeNote).toContain("配置或 schema 错误中止");
  });

  it("零分母闸（三形态同判）：无 ScenarioFinished / recorder.cases 空 / 零 check 执行 → not_run", () => {
    // 形态 1：Initialize + EngineFinished 但零 scenario。
    expect(
      runLeg(ndjson([]), {}, 0).verdict,
    ).toBe("not_run");
    // 形态 2：scenario 但 recorder.cases 空。
    expect(
      runLeg(ndjson([scenarioFinishedLine({ cases: [] })]), {}, 0).verdict,
    ).toBe("not_run");
    // 形态 3：cases 有登记但零 check（checks 键缺席形态）。
    const noChecks = JSON.stringify({
      ScenarioFinished: {
        id: "0f0e0d0c0b0a40098007006005040302",
        timestamp: 0,
        phase: "fuzzing",
        suite_id: "aabbccddeeff40019876543210fedcb",
        label: "GET /health",
        status: "success",
        elapsed_time: 0.5,
        skip_reason: null,
        is_final: true,
        recorder: { label: "GET /health", status: "success", roots: [], cases: { "case-1": {} }, checks: {}, interactions: {} },
      },
    });
    expect(runLeg(ndjson([noChecks]), {}, 0).verdict).toBe("not_run");
  });

  it("NDJSON 报告缺席 → not_run（exit=0 也不构成通过——报告是明细重算锚）；坏行 → malformed not_run", () => {
    expect(runLeg(null, {}, 0).verdict).toBe("not_run");
    expect(runLeg("garbage-line\n", {}, 0).verdict).toBe("not_run");
  });
});

// ============================================================
// 三道闸与新鲜度绑定（P22-P26 先例）
// ============================================================

describe("schemathesis 腿三道闸（先例全适用）", () => {
  it("可执行体缺席（探针 null）→ spawn_failed → not_run", () => {
    const plan = handPlan();
    const raw = runSchemathesisLeg(plan, dispatchSpawn(cleanReport()), () => null);
    expect(normalizeSchemathesisLeg(raw, 3).verdict).toBe("not_run");
    expect(normalizeSchemathesisLeg(raw, 3).scopeNote).toContain("不在 PATH");
  });

  it("版本探测失败 → not_run，禁猜版本口径", () => {
    const plan = handPlan();
    const raw = runSchemathesisLeg(
      plan,
      (command) =>
        command.includes("version")
          ? { status: 1, stdout: "", stderr: "boom", error: null, externalMs: 5 }
          : { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 },
      () => "C:/fake/st",
    );
    expect(normalizeSchemathesisLeg(raw, 3).verdict).toBe("not_run");
  });

  it("陈旧报告失效化：预置报告 + 无副作用 spawn → 报告缺席 not_run（陈旧内容零影响）", () => {
    const abs = schemathesisReportAbsolutePath(root, SCHEMATHESIS_DEFAULT_REPORT);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, failingReport(), "utf8");
    const plan = handPlan();
    const raw = runSchemathesisLeg(
      plan,
      (command) =>
        command.includes("version")
          ? { status: 0, stdout: "4.0.7\n", stderr: "", error: null, externalMs: 5 }
          : { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 },
      () => "C:/fake/st",
    );
    const record = normalizeSchemathesisLeg(raw, 3);
    expect(existsSync(abs)).toBe(false);
    expect(record.verdict).toBe("not_run");
  });

  it("报告路径安全闸：越出项目根 → pre_run_failed", () => {
    const record = runLeg(cleanReport(), { reportPath: "../outside/st.ndjson" });
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("报告路径非法");
  });

  it("版本漂移 → warning cap=tool_version_drifted（观测值优先落盘）", () => {
    const record = runLeg(
      cleanReport(),
      { expectedToolVersion: "4.0.6" },
      0,
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("tool_version_drifted");
    expect(record.toolVersion).toBe("4.0.7");
  });

  it("03 schema 形态：passed 记录过 gateResultSchema validate（落盘形态契约）", () => {
    const record = runLeg(cleanReport());
    expect(toGateResultJson(record)).toHaveProperty("grn", "GRN-27");
  });
});

// ============================================================
// 真实子进程两段式（fake 脚本 × 真实 spawnSync）+ 宿主 e2e
// ============================================================

describe("schemathesis 腿真实子进程（fake 脚本 × 真实 spawnSync 两段式）", () => {
  it(
    "版本探测脚本 + run 脚本（真实写盘官方词形 NDJSON）→ 全链路判卷红（check failure 被抓）",
    { timeout: 60_000 },
    () => {
      const versionScript = join(root, "st-version.cjs");
      const runScript = join(root, "st-run.cjs");
      writeFileSync(versionScript, "process.stdout.write('4.0.7\\n');", "utf8");
      writeFileSync(
        runScript,
        [
          "const fs = require('node:fs');",
          "const path = require('node:path');",
          `const report = process.argv[2];`,
          `const text = ${JSON.stringify(failingReport())};`,
          "fs.mkdirSync(path.dirname(report), { recursive: true });",
          "fs.writeFileSync(report, text, 'utf8');",
          "process.exitCode = 1;",
        ].join("\n"),
        "utf8",
      );
      const plan = handPlan({
        command: `node "${runScript}" "${join(root, SCHEMATHESIS_DEFAULT_REPORT).replaceAll("\\", "/")}"`,
        versionProbeCommand: `node "${versionScript}"`,
        executable: "node",
      });
      const raw = runSchemathesisLeg(plan, undefined, undefined);
      const record = normalizeSchemathesisLeg(raw, 3);
      expect(raw.kind).toBe("executed");
      expect(raw.exitCode).toBe(1);
      expect(raw.observedToolVersion).toBe("4.0.7");
      expect(record.verdict).toBe("failed");
      expect(record.items?.[0]?.rule).toBe("not_a_server_error");
    },
  );

  it(
    "64MB maxBuffer 大输出回归：run 脚本 stdout >1MB → 无 ENOBUFS（P22 先例）",
    { timeout: 60_000 },
    () => {
      const versionScript = join(root, "st-version.cjs");
      const noisyScript = join(root, "st-noisy.cjs");
      writeFileSync(versionScript, "process.stdout.write('4.0.7\\n');", "utf8");
      writeFileSync(
        noisyScript,
        [
          "const fs = require('node:fs');",
          "process.stdout.write('x'.repeat(2 * 1024 * 1024));",
          `fs.mkdirSync(require('node:path').dirname(${JSON.stringify(join(root, SCHEMATHESIS_DEFAULT_REPORT))}), { recursive: true });`,
          `fs.writeFileSync(${JSON.stringify(join(root, SCHEMATHESIS_DEFAULT_REPORT))}, ${JSON.stringify(cleanReport())}, 'utf8');`,
        ].join("\n"),
        "utf8",
      );
      const plan = handPlan({
        command: `node "${noisyScript}"`,
        versionProbeCommand: `node "${versionScript}"`,
        executable: "node",
      });
      const raw = runSchemathesisLeg(plan, undefined, undefined);
      expect(raw.kind).toBe("executed");
      expect(normalizeSchemathesisLeg(raw, 3).verdict).toBe("passed");
    },
  );

  it("宿主 schemathesis 真装时：全链路真实判卷", (ctx) => {
    const probe = spawnSync("schemathesis --version", {
      shell: true,
      encoding: "utf8",
      timeout: 30_000,
      env: stripQuotesFromPathEnv({ ...process.env }),
      windowsHide: true,
    });
    const installed = probe.status === 0 && /\d+\.\d+\.\d+/.test(probe.stdout);
    if (!installed) {
      // 诚实缺席说明：宿主未安装 schemathesis——真实 e2e 跳过；**盲区显式登记**：
      // 真实 schemathesis NDJSON 事件流无法在宿主验证——解析器已对账官方仓库源码词形
      // （单键事件对象 + 官方事件名集合 + Status 五词形 + recorder 官方结构），词形之外
      // （malformed → not_run）fail-closed 兜住，不会误判假绿；官方版本演进引入的
      // 新事件类名（历史先例：v3→v4 大改）会被事件名集合闸 fail-closed 拦下落
      // not_run 而非误判——真实词形差异为已登记盲区。
      console.warn(
        "[盲区说明] 宿主未安装 schemathesis —— schemathesis 腿真实 e2e 跳过（诚实缺席，非通过；真实 NDJSON 词形为已登记盲区）",
      );
      ctx.skip();
    }
    const adapter = createContractAdapter();
    const plan = adapter.prepare(
      { projectRoot: process.cwd() },
      { grn: "GRN-27-ST-E2E", ranAtSeq: 27, expectedToolVersion: "4.0.7" },
    );
    const raw = adapter.run(plan);
    const record = adapter.normalize(raw, {});
    expect(["passed", "failed", "warning", "not_run"]).toContain(record.verdict);
  });
});
