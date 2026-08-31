/**
 * performance-contract-legs-e2e.spec.ts —— P27 出口判据 E2E（tests/integration，
 * L2 账；FastAPI fixture 与 P16 同源复用——B3-4「与 L2 的 FastAPI fixture 同源共建」）：
 *
 * ① 三条 GRN 独立入账 truth-index：PERFORMANCE 双腿（lighthouse 实验室腿红——
 *    lcp_ms 超预算 + web-vitals 字段腿绿）+ CONTRACT schemathesis 腿（property-based
 *    check 失败红）真跑（fake spawn × 真实 adapter 归一 + 真实 fs 报告回读）→ 逐条过
 *    kernel normalizeGateResult 判卷复算（P12c 假绿封死边界同款）→ 单事务三条
 *    record_gate_run 入账 → evidence/runs/ 恰好三个 GRN 文件、verdict 逐字段互异、
 *    tool/metric_dialect 三件套随腿区分（出口判据 1/3 的入账面）；
 * ② 预算超标判卷链亲验（L2 面）：lcp_ms 超预算 items 落盘不丢失（实测/预算数值 +
 *    官方审计 id 位置）；budget 只声明非承载字段 → not_run 落盘（零分母闸非绿非红，
 *    出口判据 4 的 L2 面）；
 * ③ OpenAPI 事实源 = 受治项目声明：contract-gate.json openapi 字段（fixture 同源
 *    ——同一 FastAPI 工程形态内声明 openapi.yaml；语料 published_openapi_operationids
 *    =190 分母为只读参考，受治项目声明分母以 contract-gate.json 为准）；
 * ④ 无聚合呈现面：账本零「gauntlet:performance」聚合 run（双腿逐腿罗列——防假绿
 *    纪律，security/browser legs e2e 同款）；
 * ⑤ doctor 探测矩阵扩容：真实 runDoctor 呈现 lighthouse / web_vitals / schemathesis
 *    三探针（缺席 NOT_INSTALLED 非静默 + 安装路标；宿主真装则诚实容忍 READY）；
 * ⑥ 对抗：伪造「passed + violations>0」的记录在 P12c 边界 FATAL——零落账
 *    （GRN 文件零残留、seq 零推进，P0 第二欺骗通道封死先例）。
 *
 * fixture 工程形态（与 fixture-fastapi-project.spec.ts 同源共建——B3-4 出口判据）：
 * requirements.txt + main.py + pytest.ini + tests/test_main.py 四件套由共享构造器
 * fixture-fastapi-project-lib.ts 单一来源产出（P27 双核验 MINOR：两份逐字拷贝收敛，
 * 非 spec 不入账——fixture-chain-lib.ts 先例）；本 spec 在同形态上追加受治项目侧的
 * 性能/契约判卷输入声明（openapi.yaml + performance-gate.json + contract-gate.json），
 * 不安装依赖——验证的是治理链不是第三方栈自身构建。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LIGHTHOUSE_DEFAULT_REPORT,
  WEB_VITALS_DEFAULT_REPORT,
  createContractAdapter,
  runPerformanceGateLegs,
  schemathesisReportAbsolutePath,
  type DetectorFacts,
  type GateResultRecord,
  type SpawnFn,
} from "@pomaster/gauntlet-lite";
import type { Actor, Store } from "@pomaster/kernel";
import {
  GovernanceError,
  applyTransaction,
  createStore,
  gateResultToSnake,
  normalizeGateResult,
} from "@pomaster/kernel";
import { runDoctor, runInit } from "@pomaster/cli";
import { writeFastapiProjectFiles } from "./fixture-fastapi-project-lib.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(pathJoin(tmpdir(), "pvnext-perf-contract-legs-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// P16 FastAPI fixture 同源工程（八拍 fixture 形态 + P27 判卷输入声明）
// ============================================================
// 四件套由共享构造器单一来源产出（fixture-fastapi-project-lib.ts——与 P16 fixture
// spec 同源共建，B3-4 出口判据；本地逐字拷贝已删除，禁再各写一份）。

const OPENAPI_YAML = [
  "openapi: 3.0.0",
  "info:",
  "  title: fixture-api",
  "  version: 1.0.0",
  "paths:",
  "  /health:",
  "    get:",
      "      operationId: health_check",
  "      responses:",
  "        '200':",
  "          description: ok",
  "",
].join("\n");

const PERFORMANCE_CONFIG = {
  budget: { lcp_ms: 2500, inp_ms: 200 },
  lighthouse: {
    command:
      "lighthouse http://127.0.0.1:8080 --output=json --output-path=reports/performance/lighthouse.json",
  },
  webVitals: {
    command: "node harness.mjs",
    versionProbe: "node harness-version.mjs",
  },
};

const CONTRACT_CONFIG = {
  openapi: "openapi.yaml",
  schemathesis: {
    command:
      "schemathesis run openapi.yaml --url http://127.0.0.1:8080 --report ndjson --report-ndjson-path reports/contract/schemathesis.ndjson",
  },
};

/** 官方 LHR 词形（lcp 超预算红）；web-vitals 干净；NDJSON check 失败红。 */
const RED_LHR = JSON.stringify({
  lighthouseVersion: "12.0.0",
  fetchTime: "2026-08-31T00:00:00.000Z",
  finalUrl: "http://127.0.0.1:8080/",
  runWarnings: [],
  categories: { performance: { score: 0.5 } },
  audits: {
    "largest-contentful-paint": {
      id: "largest-contentful-paint",
      title: "Largest Contentful Paint",
      description: "official wordform",
      score: 0.3,
      scoreDisplayMode: "numeric",
      numericValue: 4100.5,
      numericUnit: "millisecond",
    },
    "interaction-to-next-paint": {
      id: "interaction-to-next-paint",
      title: "Interaction to Next Paint",
      description: "official wordform",
      score: 1,
      scoreDisplayMode: "numeric",
      numericValue: 120,
      numericUnit: "millisecond",
    },
  },
});

const GREEN_WV = JSON.stringify({
  metrics: [
    { name: "LCP", value: 2100, rating: "good", id: "lcp-1", entries: [], delta: 2100 },
    { name: "INP", value: 120, rating: "good", id: "inp-1", entries: [], delta: 120 },
  ],
});

const ST_FAILING_NDJSON = [
  JSON.stringify({
    Initialize: { command: "st run openapi.yaml", schemathesis_version: "4.0.7", seed: 42 },
  }),
  JSON.stringify({
    ScenarioFinished: {
      id: "0f0e0d0c0b0a400980070060050403020",
      timestamp: 0,
      phase: "fuzzing",
      suite_id: "aabbccddeeff40019876543210fedcba",
      label: "GET /health",
      status: "failure",
      elapsed_time: 0.5,
      skip_reason: null,
      is_final: true,
      recorder: {
        label: "GET /health",
        status: "failure",
        roots: [],
        cases: { "case-1": { value: {} }, "case-2": { value: {} } },
        checks: {
          "case-1": [
            { name: "not_a_server_error", status: "failure", failure_info: { code_sample: "", failure: { title: "Internal Server Error", value: {} } } },
            { name: "status_code_conformance", status: "success" },
          ],
        },
        interactions: {},
      },
    },
  }),
  JSON.stringify({
    EngineFinished: { id: "x", timestamp: 1, running_time: 1.5, stop_reason: "completed", failures: [] },
  }),
  "",
].join("\n");

// ============================================================
// fake facts 与调度 spawn（探测面 fake PATH；报告失效化/回读走真实 fs——security e2e 先例）
// ============================================================

const FAKE_TOOLS = "C:/fake-p27-tools";

function fixtureFacts(): DetectorFacts {
  const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const configPath = pathJoin(root, "performance-gate.json");
  const contractConfigPath = pathJoin(root, "contract-gate.json");
  const pkgPath = pathJoin(root, "package.json");
  return {
    projectRoot: root,
    pathEnv: FAKE_TOOLS,
    pathSeparator: process.platform === "win32" ? ";" : ":",
    executableSuffixes: suffixes,
    joinPath: (base, rel) => pathJoin(base, rel),
    fileExists: (absolutePath) => {
      for (const name of ["lighthouse", "node", "schemathesis"]) {
        for (const suffix of suffixes) {
          if (absolutePath === pathJoin(FAKE_TOOLS, name + suffix)) return true;
        }
      }
      return false;
    },
    readTextFile: (absolutePath) => {
      if (absolutePath === configPath && existsSync(configPath)) return readFileSync(configPath, "utf8");
      if (absolutePath === contractConfigPath && existsSync(contractConfigPath)) return readFileSync(contractConfigPath, "utf8");
      // web-vitals 探测读 package.json（fixture 工程无 package.json → NOT_INSTALLED 缺席线）。
      if (absolutePath === pkgPath) return JSON.stringify({ devDependencies: { "web-vitals": "^4.2.4" } });
      return null;
    },
  };
}

/** 调度 spawn：lighthouse/node 版本探测 → 版本词形；真执行按命令分派写报告（真实 fs）。 */
function legsSpawn(opts: { lighthouse?: string | null; webVitals?: string | null; schemathesis?: string | null; schemathesisExit?: number }): SpawnFn {
  return (command) => {
    if (command.includes("lighthouse --version")) {
      return { status: 0, stdout: "12.0.0\n", stderr: "", error: null, externalMs: 5 };
    }
    if (command.includes("harness-version")) {
      return { status: 0, stdout: "4.2.4\n", stderr: "", error: null, externalMs: 5 };
    }
    if (command.includes("node --version")) {
      return { status: 0, stdout: "v22.13.1\n", stderr: "", error: null, externalMs: 5 };
    }
    if (command.includes("schemathesis --version")) {
      return { status: 0, stdout: "4.0.7\n", stderr: "", error: null, externalMs: 5 };
    }
    if (command.includes("lighthouse")) {
      const report = opts.lighthouse;
      if (report !== undefined && report !== null) {
        const abs = pathJoin(root, LIGHTHOUSE_DEFAULT_REPORT);
        mkdirSync(pathJoin(abs, ".."), { recursive: true });
        writeFileSync(abs, report, "utf8");
      }
      return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
    }
    if (command.includes("schemathesis run")) {
      const report = opts.schemathesis;
      if (report !== undefined && report !== null) {
        const abs = schemathesisReportAbsolutePath(root, "reports/contract/schemathesis.ndjson");
        mkdirSync(pathJoin(abs, ".."), { recursive: true });
        writeFileSync(abs, report, "utf8");
      }
      return { status: opts.schemathesisExit ?? 0, stdout: "", stderr: "", error: null, externalMs: 5 };
    }
    if (command.includes("harness")) {
      const report = opts.webVitals;
      if (report !== undefined && report !== null) {
        const abs = pathJoin(root, WEB_VITALS_DEFAULT_REPORT);
        mkdirSync(pathJoin(abs, ".."), { recursive: true });
        writeFileSync(abs, report, "utf8");
      }
      return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5 };
    }
    return { status: 1, stdout: "", stderr: "no leg matched", error: null, externalMs: 5 };
  };
}

const LEG_IDENTITIES = [
  { grn: "GRN-0001", ranAtSeq: 10 },
  { grn: "GRN-0002", ranAtSeq: 11 },
] as const;

function runPerformanceLegs(): readonly [GateResultRecord, GateResultRecord] {
  return runPerformanceGateLegs(
    { projectRoot: root, subjectId: null, denominatorRefs: [] },
    LEG_IDENTITIES,
    {
      facts: fixtureFacts(),
      spawnFn: legsSpawn({ lighthouse: RED_LHR, webVitals: GREEN_WV }),
      executableProbe: (name) =>
        ["lighthouse", "node", "schemathesis"].includes(name) ? pathJoin(FAKE_TOOLS, name) : null,
      gateTier: "STANDARD",
      expectedToolVersions: { lighthouse: "12.0.0", webVitals: "4.2.4" },
    },
  );
}

/** CONTRACT adapter（schemathesis 口径，fake spawn/探针注入；prepare→run→normalize 全链路）。 */
function runContractSchemathesisLeg(grn: string, ranAtSeq: number): GateResultRecord {
  const adapter = createContractAdapter({
    schemathesisSpawnFn: legsSpawn({ schemathesis: ST_FAILING_NDJSON, schemathesisExit: 1 }),
    schemathesisExecutableProbe: (name) =>
      ["lighthouse", "node", "schemathesis"].includes(name) ? pathJoin(FAKE_TOOLS, name) : null,
  });
  const plan = adapter.prepare(
    { projectRoot: root, subjectId: null, denominatorRefs: [] },
    { grn, ranAtSeq, expectedToolVersion: "4.0.7", trigger: "on_demand" },
    fixtureFacts(),
  );
  const raw = adapter.run(plan);
  return adapter.normalize(raw, { declaredVerdict: null, isFixture: false });
}

/** check --gates 同款入账边界：normalizeGateResult 判卷复算 → 单事务 N op 入账。 */
async function ledgerIngest(records: readonly GateResultRecord[]): Promise<number> {
  const store: Store = await createStore(root);
  const trigger = "on_demand" as const;
  const judged = records.map((record) =>
    normalizeGateResult(
      {
        value: gateResultToSnake(record),
        claimedBy: {
          actorType: "tool",
          actor: record.tool,
          selfAttested: true,
        } satisfies Actor,
      },
      {
        ranAtSeq: record.ranAtSeq,
        trigger,
        tool: record.tool,
        toolVersion: record.toolVersion,
        metricDialect: record.metricDialect,
      },
    ),
  );
  const applied = await applyTransaction(store, {
    ops: judged.map((record) => ({
      op: "record_gate_run" as const,
      run: { grn: record.grn, trigger, result: record },
    })),
  });
  return applied.appliedSeq;
}

function runsDir(): string {
  return pathJoin(root, ".pomaster", "evidence", "runs");
}

function readRunInline(fileName: string): Record<string, unknown> {
  const record = JSON.parse(
    readFileSync(pathJoin(runsDir(), fileName), "utf8"),
  ) as { gate_result?: { result?: Record<string, unknown> } };
  return record.gate_result?.result ?? {};
}

// ============================================================
// E2E
// ============================================================

describe("P27 PERFORMANCE + CONTRACT legs E2E（FastAPI fixture 同源）", () => {
  it("① fixture 形态自检：FastAPI 四件套同源 + P27 判卷输入声明（openapi/双 gate 配置）齐备", () => {
    writeFastapiProjectFiles(root);
    writeFileSync(pathJoin(root, "openapi.yaml"), OPENAPI_YAML, "utf8");
    writeFileSync(pathJoin(root, "performance-gate.json"), JSON.stringify(PERFORMANCE_CONFIG), "utf8");
    writeFileSync(pathJoin(root, "contract-gate.json"), JSON.stringify(CONTRACT_CONFIG), "utf8");
    for (const rel of [
      "requirements.txt",
      "main.py",
      "pytest.ini",
      pathJoin("tests", "test_main.py"),
      "openapi.yaml",
      "performance-gate.json",
      "contract-gate.json",
    ]) {
      expect(existsSync(pathJoin(root, rel)), `${rel} 应在场`).toBe(true);
    }
  });

  it("② 三腿真跑 → P12c 复算 → 单事务三 GRN 落盘：lighthouse 红（预算超标）+ web-vitals 绿 + schemathesis 红", async () => {
    await runInit(root);
    writeFastapiProjectFiles(root);
    writeFileSync(pathJoin(root, "openapi.yaml"), OPENAPI_YAML, "utf8");
    writeFileSync(pathJoin(root, "performance-gate.json"), JSON.stringify(PERFORMANCE_CONFIG), "utf8");
    writeFileSync(pathJoin(root, "contract-gate.json"), JSON.stringify(CONTRACT_CONFIG), "utf8");

    const perfLegs = runPerformanceLegs();
    const stLeg = runContractSchemathesisLeg("GRN-0003", 12);
    const appliedSeq = await ledgerIngest([...perfLegs, stLeg]);
    expect(appliedSeq).toBeGreaterThan(0);

    const files = readdirSync(runsDir()).sort();
    expect(files).toEqual(["GRN-0001.json", "GRN-0002.json", "GRN-0003.json"]);

    const inlines = files.map(readRunInline);
    expect(inlines.map((inline) => inline["verdict"])).toEqual(["failed", "passed", "failed"]);
    expect(inlines.map((inline) => inline["gate"])).toEqual([
      "PERFORMANCE",
      "PERFORMANCE",
      "CONTRACT",
    ]);
    expect(inlines.map((inline) => inline["tool"])).toEqual([
      "gauntlet:lighthouse",
      "gauntlet:web-vitals",
      "gauntlet:schemathesis",
    ]);
    expect(inlines.map((inline) => inline["metric_dialect"])).toEqual([
      "performance:lighthouse_budget",
      "performance:web_vitals_budget",
      "contract:schemathesis_property_based",
    ]);

    // 出口判据 1 落盘面：预算超标判卷链 items 不丢失（实测/预算 + 官方审计 id 位置）。
    const lighthouse = inlines[0] as Record<string, unknown>;
    expect((lighthouse["counts"] as Record<string, unknown>)["violations"]).toBe(1);
    const items = lighthouse["items"] as readonly Record<string, unknown>[];
    expect(items[0]?.["rule"]).toBe("performance_budget_exceeded");
    expect(items[0]?.["location"]).toBe("largest-contentful-paint#lcp_ms");
    expect(String(items[0]?.["message"])).toContain("4100.5");
    expect(String(items[0]?.["message"])).toContain("2500");

    // 出口判据 3 落盘面：schemathesis property-based 判卷——check 名 + failure 明细。
    const schemathesis = inlines[2] as Record<string, unknown>;
    expect((schemathesis["counts"] as Record<string, unknown>)["scanned"]).toBe(2);
    const stItems = schemathesis["items"] as readonly Record<string, unknown>[];
    expect(stItems[0]?.["rule"]).toBe("not_a_server_error");
    expect(stItems[0]?.["location"]).toBe("openapi.yaml#not_a_server_error");
    expect(String(stItems[0]?.["message"])).toContain("Internal Server Error");
  });

  it("③ 零分母闸 L2 面：budget 只声明非承载字段 → lighthouse not_run 落盘（非绿非红显式缺席）", async () => {
    await runInit(root);
    writeFastapiProjectFiles(root);
    writeFileSync(
      pathJoin(root, "performance-gate.json"),
      JSON.stringify({
        budget: { max_chunk_kb: 800, max_memory_mb: 800 },
        lighthouse: PERFORMANCE_CONFIG.lighthouse,
        webVitals: PERFORMANCE_CONFIG.webVitals,
      }),
      "utf8",
    );
    const perfLegs = runPerformanceGateLegs(
      { projectRoot: root, subjectId: null, denominatorRefs: [] },
      LEG_IDENTITIES,
      {
        facts: fixtureFacts(),
        spawnFn: legsSpawn({ lighthouse: RED_LHR, webVitals: GREEN_WV }),
        executableProbe: (name) =>
          ["lighthouse", "node", "schemathesis"].includes(name) ? pathJoin(FAKE_TOOLS, name) : null,
        gateTier: "STANDARD",
        expectedToolVersions: { lighthouse: "12.0.0", webVitals: "4.2.4" },
      },
    );
    await ledgerIngest(perfLegs);
    const files = readdirSync(runsDir()).sort();
    expect(files).toEqual(["GRN-0001.json", "GRN-0002.json"]);
    const lighthouse = readRunInline("GRN-0001.json");
    expect(lighthouse["verdict"]).toBe("not_run");
    const scope = lighthouse["scope"] as Record<string, unknown> | undefined;
    expect(String(scope?.["note"])).toContain("零判卷分母");
  });

  it("④ 配置缺席不牵连：performance-gate.json 缺席 → 双腿 not_configured×2；schemathesis 腿照常真跑判红", async () => {
    await runInit(root);
    writeFastapiProjectFiles(root);
    writeFileSync(pathJoin(root, "openapi.yaml"), OPENAPI_YAML, "utf8");
    writeFileSync(pathJoin(root, "contract-gate.json"), JSON.stringify(CONTRACT_CONFIG), "utf8");

    const perfLegs = runPerformanceGateLegs(
      { projectRoot: root, subjectId: null, denominatorRefs: [] },
      LEG_IDENTITIES,
      {
        facts: fixtureFacts(),
        spawnFn: legsSpawn({ lighthouse: RED_LHR, webVitals: GREEN_WV }),
        executableProbe: (name) =>
          ["lighthouse", "node", "schemathesis"].includes(name) ? pathJoin(FAKE_TOOLS, name) : null,
        gateTier: "STANDARD",
        expectedToolVersions: { lighthouse: "12.0.0", webVitals: "4.2.4" },
      },
    );
    const stLeg = runContractSchemathesisLeg("GRN-0003", 12);
    await ledgerIngest([...perfLegs, stLeg]);

    const inlines = readdirSync(runsDir()).sort().map(readRunInline);
    expect(inlines.map((inline) => inline["verdict"])).toEqual([
      "not_configured",
      "not_configured",
      "failed",
    ]);
  });

  it("⑤ 无聚合呈现面：账本零「gauntlet:performance」聚合 run（双腿逐腿罗列）", async () => {
    await runInit(root);
    writeFastapiProjectFiles(root);
    writeFileSync(pathJoin(root, "openapi.yaml"), OPENAPI_YAML, "utf8");
    writeFileSync(pathJoin(root, "performance-gate.json"), JSON.stringify(PERFORMANCE_CONFIG), "utf8");

    const perfLegs = runPerformanceLegs();
    await ledgerIngest(perfLegs);
    const inlines = readdirSync(runsDir()).sort().map(readRunInline);
    expect(inlines).toHaveLength(2);
    for (const inline of inlines) {
      expect(inline["tool"]).not.toBe("gauntlet:performance");
      expect(inline["tool"]).not.toBe("gauntlet:performance-aggregate");
    }
  });

  it("⑥ 真实 runDoctor 呈现 P27 三探针（lighthouse / web_vitals / schemathesis 缺席非静默 + 安装路标）", async () => {
    await runInit(root);
    const outcome = await runDoctor(root);
    for (const name of ["lighthouse", "web_vitals", "schemathesis"]) {
      const probe = outcome.result.probes.find((p) => p.probe === name);
      expect(probe, name).toBeDefined();
      expect(probe?.status === "NOT_INSTALLED" || probe?.status === "READY").toBe(true);
      if (probe?.status === "NOT_INSTALLED") {
        expect(probe.hint, name).toMatch(/安装建议|install/i);
      }
    }
  });

  it("⑦ 对抗：伪造「passed + violations>0」自相矛盾记录在 P12c 边界 FATAL——事务零落账零残留", async () => {
    await runInit(root);
    const store: Store = await createStore(root);
    const forged: GateResultRecord = {
      grn: "GRN-9001",
      gate: "PERFORMANCE",
      gateDef: "POLICY.GATE.PERFORMANCE@0.1.0",
      ranAtSeq: 10,
      verdict: "passed",
      verdictCapReason: null,
      subjectId: null,
      isFixture: false,
      denominatorRefs: [],
      counts: { scanned: 2, applicableScanned: 2, violations: 2, notApplicable: 0 },
      blindspot: { scanned: 1, produced: 1, escapeRatio: 0 },
      trust: { asserted: null, recomputed: { violations: 2, matchesAsserted: true } },
      durationMs: { self: 0, external: 0 },
      tool: "gauntlet:lighthouse",
      toolVersion: "12.0.0",
      metricDialect: "performance:lighthouse_budget",
    };
    let raised: unknown = null;
    try {
      await applyTransaction(store, {
        ops: [
          {
            op: "record_gate_run" as const,
            run: {
              grn: forged.grn,
              trigger: "on_demand" as const,
              result: normalizeGateResult(
                {
                  value: gateResultToSnake(forged),
                  claimedBy: {
                    actorType: "tool",
                    actor: forged.tool,
                    selfAttested: true,
                  } satisfies Actor,
                },
                {
                  ranAtSeq: forged.ranAtSeq,
                  trigger: "on_demand",
                  tool: forged.tool,
                  toolVersion: forged.toolVersion,
                  metricDialect: forged.metricDialect,
                },
              ),
            },
          },
        ],
      });
    } catch (err) {
      raised = err;
    }
    // P12c 假绿封死：passed + violations>0 自相矛盾 → FATAL（GATE_COUNTS_INVALID 类）。
    expect(raised).toBeInstanceOf(GovernanceError);
    expect(existsSync(runsDir())).toBe(false);
  });
});
