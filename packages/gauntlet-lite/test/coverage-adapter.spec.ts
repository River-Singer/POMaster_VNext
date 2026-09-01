/**
 * coverage-adapter.spec.ts —— COVERAGE 门禁 adapter（P23 / 随版计划 Batch 2 B2-1）。
 *
 * 覆盖（P23 出口判据 1/3/4/5 + gate-recipe-runner 三态先例）：
 * - 出口判据 1「coverage 腿真执行」：fake c8 脚本 × 真实 spawnSync 两段式先例
 *   （版本探测 → 真执行产出报告 → 报告文件回读；零安装零网络）+ 宿主 c8/pytest-cov
 *   在场 e2e（宿主未装则 skip + 盲区说明——诚实缺席纪律）；
 * - 出口判据 3「HARDENING-only 档位语义」：MINIMAL/LIGHT/FAST 档合法缺席（policy_skip
 *   显式语义非静默跳过）；HARDENING 档缺席工具 = not_run 非绿非红；档位词形越形
 *   fail-closed；
 * - 出口判据 4「行/分支口径强制上报」：c8 报告缺行或缺分支口径 / pytest-cov 缺
 *   num_branches（--cov-branch 未生效形态）→ malformed → not_run 非默认值（禁 0%/100%
 *   兜底）；双口径齐备才判卷（violations = 低于阈值口径数）；
 * - 出口判据 5「阈值进配置 + 呈报项登记」：config thresholds 生效 / 缺省出厂兜底按
 *   档位分化（行阈值 MINIMAL 80 / LIGHT 60 / STANDARD 30——Owner 决议 2026-09-01
 *   批准转正；branches 60 未在批准包维持出厂值）+ scopeNote 批准注记在 record 留痕；
 * - P22 三腿同款三道闸先例：⓪ 可执行体 PATH 探测（缺席 → not_run 带留痕）→
 *   ① 版本探测（退出 0 且版本词形可得）→ ② 真执行；报告缺席/坏形 → not_run；
 * - 大输出 maxBuffer 回归（>1MB stdout 不被 Node 默认 1MB ENOBUFS 打断）；
 * - 三态 truth-index 记录互异 + 全部过 03 schema；
 * - 判卷锚声明回归：被包裹测试命令退出码非本 gate 判卷锚（测试失败归 BUILD gate）。
 * - P23 红队修复（MAJOR 陈旧报告误绿通道）：spawn 前 rmSync 失效化声明报告路径——
 *   预置陈旧报告 × 插件缺席（exit 4 fake spawn）→ not_run 带安装路标且陈旧内容零影响；
 *   预置陈旧 × 真执行成功 → 判卷锚=本次新报告（内容对账）；失效化失败（目录占位）与
 *   报告路径越出项目根 → pre_run_failed 拒绝执行（失效化面禁变任意删除面）；
 *   pytest-cov 腿 scopeNote 退出码注记 = pytest 自身语义（非「被包裹测试命令」误标注）。
 * - P23 红队修复（MINOR C5 双标消除）：parseC8Summary 从 covered/total 计数重算
 *   行/分支百分比（pct 字段不消费）——篡改 pct 不改变判卷；计数缺失 → malformed
 *   → not_run 非默认值。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeCrap,
  createCoverageAdapter,
  C8_METRIC_DIALECT,
  C8_TOOL_ID,
  COVERAGE_GATE_DEF,
  COVERAGE_GATE_NAME,
  COVERAGE_LINES_THRESHOLDS_BY_TIER,
  COVERAGE_POLICY_SKIP_METRIC_DIALECT,
  COVERAGE_PROVISIONAL_THRESHOLDS,
  coverageSpawn,
  detectC8,
  detectPytestCov,
  GATE_TIER_VALUES,
  normalizeCoverageLeg,
  parseC8Summary,
  parsePytestCovJson,
  platformDetectorFacts,
  platformExecutableProbe,
  PYTEST_COV_METRIC_DIALECT,
  PYTEST_COV_TOOL_ID,
  readCoverageGateConfig,
  resolveCoverageProvisionalThresholdsForTier,
  resolveCoverageReportPath,
  runCoverageLeg,
  stripQuotesFromPathEnv,
  toGateResultJson,
  type CoverageLegPlan,
  type GatePolicy,
  type GateResultRecord,
  type GateTier,
  type SpawnFn,
  type SpawnOutcome,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

let dir: string;
/** 当前夹具报告文本（fake run 副作用在失效化删除后「由工具重建」用；null = 工具不产出）。 */
let fixtureReport: string | null = null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-coverage-"));
  fixtureReport = null;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** 在真实临时目录落文件（run 侧报告回读 / prepare 侧真实探测共用）。 */
function put(rel: string, content: string): void {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

const C8_DECL = JSON.stringify({ devDependencies: { c8: "^5.3.0" } });
const C8_CONFIG = JSON.stringify({
  runner: "c8",
  command: "corepack pnpm exec vitest run",
});

function policy(overrides: Partial<GatePolicy> = {}): GatePolicy {
  return { grn: "GRN-2300", ranAtSeq: 2300, trigger: "on_demand", ...overrides };
}

/** 按 spawn 次数分派的 fake（第 1 次 = 版本探测，第 2 次 = 真执行；真执行可携带真实写盘副作用）。 */
function scriptedSpawn(
  probe: Partial<SpawnOutcome>,
  run: Partial<SpawnOutcome>,
  runSideEffect: () => void = () => {},
): SpawnFn {
  let call = 0;
  return () => {
    call += 1;
    const base = call === 1 ? probe : run;
    if (call > 1) {
      runSideEffect();
    }
    return {
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      externalMs: 5,
      ...base,
    };
  };
}

/**
 * run 侧 fake 副作用：把当前夹具报告写到声明报告路径——模拟第三方工具真实产出
 * （runCoverageLeg spawn 前会失效化删除预置报告，工具须在执行时重建，与真实链路同构）。
 */
function writesFixtureReport(): () => void {
  return () => {
    if (fixtureReport !== null) {
      put("coverage/coverage-summary.json", fixtureReport);
    }
  };
}

/** 全链路：prepare（真实临时目录探测）→ run（spawn/探针注入）→ normalize。 */
function fullPipeline(
  gatePolicy: GatePolicy = policy(),
  spawn: SpawnFn = scriptedSpawn(
    { status: 0, stdout: "5.3.0" },
    { status: 0, stdout: "" },
    writesFixtureReport(),
  ),
  probe: (executable: string) => string | null = () => "C:/fake/corepack",
  root = dir,
): GateResultRecord {
  const adapter = createCoverageAdapter({ spawnFn: spawn, executableProbe: probe });
  const plan = adapter.prepare({ projectRoot: root }, gatePolicy, platformDetectorFacts(root));
  const raw = adapter.run(plan);
  return adapter.normalize(raw, {});
}

// ============================================================
// 配置读取（fail-closed）
// ============================================================

describe("readCoverageGateConfig：fail-closed 配置面", () => {
  it("文件缺席 → 不 ok + 配置指引（诚实缺席，禁静默）", () => {
    const read = readCoverageGateConfig(fakeFacts("D:/cov-proj", { files: {} }));
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.reason).toContain("coverage-gate.json");
      expect(read.installHint).toMatch(/runner/);
    }
  });

  it.each([
    ["JSON 坏形", "{oops"],
    ["根非对象", JSON.stringify([1])],
    ["runner 越形", JSON.stringify({ runner: "jacoco" })],
    ["c8 缺 command", JSON.stringify({ runner: "c8" })],
    ["c8 command 空串", JSON.stringify({ runner: "c8", command: "  " })],
    ["pytest-cov 缺 covTarget", JSON.stringify({ runner: "pytest-cov" })],
    ["coverageReport 空串", JSON.stringify({ runner: "c8", command: "x", coverageReport: "" })],
    [
      "thresholds 半份（缺 branches）",
      JSON.stringify({ runner: "c8", command: "x", thresholds: { lines: 80 } }),
    ],
    [
      "thresholds 越界",
      JSON.stringify({ runner: "c8", command: "x", thresholds: { lines: 120, branches: 60 } }),
    ],
    [
      "crap 缺 complexityReport",
      JSON.stringify({ runner: "c8", command: "x", crap: { maxCrap: 30 } }),
    ],
    [
      "crap maxCrap 非正数",
      JSON.stringify({ runner: "c8", command: "x", crap: { complexityReport: "r.json", maxCrap: 0 } }),
    ],
  ])("malformed：%s → 不 ok + 指引", (_label, text) => {
    const read = readCoverageGateConfig(
      fakeFacts("D:/cov-proj", {
        files: { [posixJoin("D:/cov-proj", "coverage-gate.json")]: text },
      }),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.installHint.length).toBeGreaterThan(0);
    }
  });

  it("合法 c8 / pytest-cov 词形 → ok；coverageReport 缺省按 runner 解析", () => {
    const c8 = readCoverageGateConfig(
      fakeFacts("D:/cov-proj", {
        files: {
          [posixJoin("D:/cov-proj", "coverage-gate.json")]: JSON.stringify({
            runner: "c8",
            command: "corepack pnpm exec vitest run",
          }),
        },
      }),
    );
    expect(c8.ok).toBe(true);
    if (c8.ok) {
      expect(c8.config.runner).toBe("c8");
      expect(c8.config.testCommand).toBe("corepack pnpm exec vitest run");
      expect(c8.config.thresholds).toBeNull();
      expect(c8.config.crap).toBeNull();
    }
    const pytest = readCoverageGateConfig(
      fakeFacts("D:/cov-proj", {
        files: {
          [posixJoin("D:/cov-proj", "coverage-gate.json")]: JSON.stringify({
            runner: "pytest-cov",
            covTarget: "src",
          }),
        },
      }),
    );
    expect(pytest.ok).toBe(true);
    if (pytest.ok) {
      expect(pytest.config.covTarget).toBe("src");
    }
    expect(resolveCoverageReportPath("c8", null)).toBe("coverage/coverage-summary.json");
    expect(resolveCoverageReportPath("pytest-cov", null)).toBe("coverage.json");
    expect(resolveCoverageReportPath("pytest-cov", "reports\\cov.json")).toBe("reports/cov.json");
  });
});

// ============================================================
// 探测（detectors 单一探测面：detectC8 / detectPytestCov）
// ============================================================

describe("detect：c8 / pytest-cov 双腿探测（四态缺席语义）", () => {
  it("c8 声明 → READY + 版本；未声明 → NOT_INSTALLED + 安装指引", () => {
    const ready = detectC8(
      fakeFacts("D:/cov-proj", {
        files: {
          [posixJoin("D:/cov-proj", "package.json")]: JSON.stringify({
            devDependencies: { c8: "^5.3.0" },
          }),
        },
      }),
    );
    expect(ready.status).toBe("READY");
    if (ready.status === "READY") {
      expect(ready.tool).toBe("c8");
      expect(ready.detectedVersion).toBe("5.3.0");
    }
    const absent = detectC8(fakeFacts("D:/cov-proj", { files: {} }));
    expect(absent.status).toBe("NOT_INSTALLED");
    if (absent.status === "NOT_INSTALLED") {
      expect(absent.installHint).toMatch(/c8/);
    }
  });

  it("c8 版本漂移（expectedVersion 锚失配）→ DRIFTED", () => {
    const drifted = detectC8(
      fakeFacts("D:/cov-proj", {
        files: {
          [posixJoin("D:/cov-proj", "package.json")]: JSON.stringify({
            devDependencies: { c8: "^5.3.0" },
          }),
        },
      }),
      { expectedVersion: "9.0.0" },
    );
    expect(drifted.status).toBe("DRIFTED");
    if (drifted.status === "DRIFTED") {
      expect(drifted.detectedVersion).toBe("5.3.0");
      expect(drifted.expectedVersion).toBe("9.0.0");
    }
  });

  it.each([true, false])("c8/pytest-cov requiredByProfile=false → NOT_REQUIRED_BY_PROFILE（合法缺席显式计数）", (first) => {
    const detection = first
      ? detectC8(fakeFacts("D:/cov-proj", { files: {} }), { requiredByProfile: false })
      : detectPytestCov(fakeFacts("D:/cov-proj", { files: {} }), { requiredByProfile: false });
    expect(detection.status).toBe("NOT_REQUIRED_BY_PROFILE");
  });

  it("pytest-cov：pytest 配置命中 → READY（插件在位性诚实留待 run 期）；缺席 → NOT_INSTALLED + D17 deferred 注记", () => {
    const ready = detectPytestCov(
      fakeFacts("D:/cov-proj", {
        files: { [posixJoin("D:/cov-proj", "pytest.ini")]: "[pytest]" },
      }),
    );
    expect(ready.status).toBe("READY");
    if (ready.status === "READY") {
      expect(ready.evidence).toMatch(/run 期/);
    }
    const absent = detectPytestCov(fakeFacts("D:/cov-proj", { files: {} }));
    expect(absent.status).toBe("NOT_INSTALLED");
    if (absent.status === "NOT_INSTALLED") {
      expect(absent.reason).toMatch(/JaCoCo|deferred/);
      expect(absent.installHint).toMatch(/pytest-cov/);
    }
  });

  it("adapter detect：配置 + runner 工具合流（c8 READY / 工具缺席 NOT_INSTALLED）", () => {
    put("coverage-gate.json", C8_CONFIG);
    put("package.json", C8_DECL);
    const ready = createCoverageAdapter().detect(platformDetectorFacts(dir));
    expect(ready.status).toBe("READY");
    if (ready.status === "READY") {
      expect(ready.tool).toBe(C8_TOOL_ID);
      expect(ready.evidence).toContain("coverage-gate.json");
    }
    const noTool = createCoverageAdapter().detect(
      platformDetectorFacts(
        (() => {
          const bare = mkdtempSync(join(tmpdir(), "pomaster-coverage-bare-"));
          writeFileSync(join(bare, "coverage-gate.json"), C8_CONFIG, "utf8");
          return bare;
        })(),
      ),
    );
    expect(noTool.status).toBe("NOT_INSTALLED");
    if (noTool.status === "NOT_INSTALLED") {
      expect(noTool.reason).toMatch(/runner=c8/);
    }
  });
});

// ============================================================
// prepare：档位闸 → 配置闸 → 工具闸（缺席语义全部显式）
// ============================================================

describe("prepare：HARDENING-only 档位语义 + 三闸缺席分流", () => {
  describe("出口判据 3：MINIMAL/LIGHT/FAST 合法缺席；HARDENING 缺席工具 not_run", () => {
    it.each(["MINIMAL", "LIGHT", "FAST"] as const)(
      "tier=%s → plan.absenceKind=profile_not_required（显式语义非静默跳过）→ not_run + notApplicable=1",
      (tier) => {
        put("coverage-gate.json", C8_CONFIG);
        put("package.json", C8_DECL);
        const record = fullPipeline(policy({ gateTier: tier }));
        expect(record.verdict).toBe("not_run");
        expect(record.counts.notApplicable).toBe(1);
        expect(record.counts.violations).toBe(0);
        expect(record.metricDialect).toBe(COVERAGE_POLICY_SKIP_METRIC_DIALECT);
        expect(record.scopeNote).toMatch(/SKIPPED_BY_POLICY/);
        expect(record.scopeNote).toContain(`tier=${tier}`);
        expect(validate(toGateResultJson(record))).toBe(true);
      },
    );

    it("STANDARD/HARDENING 档：工具缺席 → not_run（非绿非红 + 安装路标，非 policy_skip）", () => {
      put("coverage-gate.json", C8_CONFIG);
      // 无 package.json → c8 未声明 → tool_absent。
      for (const tier of ["STANDARD", "HARDENING"] as const) {
        const record = fullPipeline(policy({ gateTier: tier }));
        expect(record.verdict).toBe("not_run");
        expect(record.metricDialect).not.toBe(COVERAGE_POLICY_SKIP_METRIC_DIALECT);
        expect(record.counts.notApplicable).toBe(0);
        expect(record.scopeNote).toMatch(/c8|安装建议/);
      }
    });

    it("档位词形越形 → fail-closed 抛错（禁静默回落默认档）", () => {
      put("coverage-gate.json", C8_CONFIG);
      put("package.json", C8_DECL);
      expect(() =>
        fullPipeline({ ...policy(), gateTier: "CRITICAL" as unknown as string } as GatePolicy),
      ).toThrowError(/gateTier 词形非法/);
    });
  });

  it("c8 腿就绪：命令形态（--reporter=json-summary + --reports-dir + 包裹命令）与计划字段", () => {
    put("coverage-gate.json", C8_CONFIG);
    put("package.json", C8_DECL);
    const adapter = createCoverageAdapter();
    const plan = adapter.prepare({ projectRoot: dir }, policy(), platformDetectorFacts(dir));
    expect(plan.absenceKind).toBeNull();
    expect(plan.runner).toBe("c8");
    expect(plan.tool).toBe(C8_TOOL_ID);
    expect(plan.toolVersion).toBe("5.3.0");
    expect(plan.metricDialect).toBe(C8_METRIC_DIALECT);
    expect(plan.gate).toBe(COVERAGE_GATE_NAME);
    expect(plan.gateDef).toBe(COVERAGE_GATE_DEF);
    expect(plan.command).toContain("--reporter=json-summary");
    expect(plan.command).toContain("--reports-dir=");
    expect(plan.command).toContain("corepack pnpm exec vitest run");
    expect(plan.coverageReportPath).toBe("coverage/coverage-summary.json");
    // 缺省档位 STANDARD（DEFAULT_GATE_TIER）→ 出厂兜底行阈值取分化值 30（Owner 决议
    // 2026-09-01）；branches 恒出厂值 60（未在批准包）。
    expect(plan.tier).toBe("STANDARD");
    expect(plan.thresholds).toEqual(resolveCoverageProvisionalThresholdsForTier("STANDARD"));
    expect(plan.thresholds).toEqual({ lines: 30, branches: 60 });
    expect(plan.thresholdsProvisional).toBe(true);
    expect(plan.executable).toBe("corepack");
  });

  it("配置显式 thresholds / coverageReport 生效（阈值配置化；出厂兜底旗翻转）", () => {
    put(
      "coverage-gate.json",
      JSON.stringify({
        runner: "c8",
        command: "npm test",
        coverageReport: "reports/c8",
        thresholds: { lines: 65, branches: 50 },
      }),
    );
    put("package.json", C8_DECL);
    const adapter = createCoverageAdapter();
    const plan = adapter.prepare({ projectRoot: dir }, policy(), platformDetectorFacts(dir));
    expect(plan.thresholds).toEqual({ lines: 65, branches: 50 });
    expect(plan.thresholdsProvisional).toBe(false);
    expect(plan.coverageReportPath).toBe("reports/c8/coverage-summary.json");
    expect(plan.command).toContain("--reports-dir=");
  });

  it("pytest-cov 腿：--cov-branch 强制分支口径 + 版本锚强制（缺锚 fail-closed）", () => {
    put(
      "coverage-gate.json",
      JSON.stringify({ runner: "pytest-cov", covTarget: "src" }),
    );
    put("pytest.ini", "[pytest]");
    const adapter = createCoverageAdapter();
    expect(() =>
      adapter.prepare({ projectRoot: dir }, policy({ expectedToolVersion: null }), platformDetectorFacts(dir)),
    ).toThrowError(/expectedToolVersion/);
    const plan = adapter.prepare(
      { projectRoot: dir },
      policy({ expectedToolVersion: "8.3.4" }),
      platformDetectorFacts(dir),
    );
    expect(plan.runner).toBe("pytest-cov");
    expect(plan.tool).toBe(PYTEST_COV_TOOL_ID);
    expect(plan.toolVersion).toBe("8.3.4");
    expect(plan.metricDialect).toBe(PYTEST_COV_METRIC_DIALECT);
    expect(plan.command).toContain('--cov="src"');
    // 出口判据 4 的 run 侧强制：分支口径旗标必须在命令中。
    expect(plan.command).toContain("--cov-branch");
    expect(plan.command).toContain("--cov-report=json:");
    expect(plan.executable).toBe("python");
    expect(plan.versionProbeCommand).toBe("python -m pytest --version");
  });

  it("pytest-cov 工具缺席 → tool_absent（HARDENING 缺席 not_run 路径）", () => {
    put(
      "coverage-gate.json",
      JSON.stringify({ runner: "pytest-cov", covTarget: "src" }),
    );
    const adapter = createCoverageAdapter();
    const plan = adapter.prepare({ projectRoot: dir }, policy(), platformDetectorFacts(dir));
    expect(plan.absenceKind).toBe("tool_absent");
    const record = adapter.normalize(adapter.run(plan), {});
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/pytest\.ini|pyproject/);
  });

  it("配置缺席（STANDARD 档）→ not_configured（诚实缺席，非 passed 非静默）", () => {
    const record = fullPipeline(policy({ gateTier: "STANDARD" }));
    expect(record.verdict).toBe("not_configured");
    expect(record.scopeNote).toMatch(/coverage-gate\.json/);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("c8 版本词形不可解析（workspace:* 词形）→ fail-closed 抛错（vitest 腿同款纪律）", () => {
    put("coverage-gate.json", C8_CONFIG);
    put("package.json", JSON.stringify({ devDependencies: { c8: "workspace:*" } }));
    const adapter = createCoverageAdapter();
    expect(() =>
      adapter.prepare({ projectRoot: dir }, policy(), platformDetectorFacts(dir)),
    ).toThrowError(/版本词形不可解析/);
  });
});

// ============================================================
// run/normalize 判卷矩阵（fake spawn + 预写报告文件；行/分支口径强制上报）
// ============================================================

/**
 * c8 coverage-summary 词形报告（口径齐备形态）。
 * 计数与 pct 一致（C5：parseC8Summary 从 covered/total 重算判卷——total 级
 * 1000 行/800 分支、文件级 100/100，covered 全整数，重算值 = pct）。
 */
function c8Summary(
  linesPct: number,
  branchesPct: number,
  files: Readonly<Record<string, { lines: number; branches: number }>> = {
    "src/a.ts": { lines: linesPct, branches: branchesPct },
  },
): string {
  const entries: Record<string, unknown> = {
    total: {
      lines: { pct: linesPct, covered: Math.round((linesPct / 100) * 1000), total: 1000 },
      branches: { pct: branchesPct, covered: Math.round((branchesPct / 100) * 800), total: 800 },
    },
  };
  for (const [file, f] of Object.entries(files)) {
    entries[file] = {
      lines: { pct: f.lines, covered: Math.round(f.lines), total: 100 },
      branches: { pct: f.branches, covered: Math.round(f.branches), total: 100 },
    };
  }
  return JSON.stringify(entries);
}

/** c8 腿就绪夹具（配置 + package.json + 预写报告文件；报告按需给）。 */
function c8ReadyFixture(reportText: string | null): void {
  put("coverage-gate.json", C8_CONFIG);
  put("package.json", C8_DECL);
  fixtureReport = reportText;
  if (reportText !== null) {
    put("coverage/coverage-summary.json", reportText);
  }
}

describe("coverage 判卷矩阵（violations=低于阈值口径；malformed=非默认值）", () => {
  it("三态① 低覆盖抓红：行/分支双口径低于档位阈值（HARDENING 80/60）→ failed violations=2 + items 携带实测/阈值/批准注记", () => {
    c8ReadyFixture(c8Summary(40, 30));
    const record = fullPipeline(policy({ gateTier: "HARDENING" }));
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.counts.scanned).toBe(2);
    expect(record.items).toHaveLength(2);
    expect(record.items?.[0]?.rule).toBe("coverage_below_threshold");
    expect(record.items?.[0]?.message).toContain("40.00%");
    expect(record.items?.[0]?.message).toContain("80");
    expect(record.items?.[0]?.message).toContain("档位 HARDENING 行覆盖率分化阈值");
    expect(record.items?.[0]?.message).toContain("Owner 决议 2026-09-01");
    expect(record.items?.[0]?.message).not.toContain("provisional 待 A4");
    expect(record.items?.[1]?.message).toContain("分支口径");
    expect(record.items?.[1]?.message).toContain("未在 2026-09-01 批准包");
    expect(record.scopeNote).toContain("档位 HARDENING 行覆盖率分化阈值");
    expect(record.scopeNote).toContain("Owner 决议 2026-09-01");
    expect(record.scopeNote).not.toContain("provisional 待 A4");
    expect(record.metricDialect).toBe(C8_METRIC_DIALECT);
    const doc = toGateResultJson(record);
    if (!validate(doc)) console.error(validate.errors);
    expect(validate(doc)).toBe(true);
  });

  it("三态② 达标绿：行/分支高于阈值 → passed（scopeNote 携带实测与阈值口径）", () => {
    c8ReadyFixture(c8Summary(85.7, 75));
    const record = fullPipeline();
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    expect(record.scopeNote).toContain("85.70%");
    expect(record.scopeNote).toContain("75.00%");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("单口径低于阈值 → failed violations=1（分支口径 messages 可辨）", () => {
    c8ReadyFixture(c8Summary(90, 55));
    const record = fullPipeline();
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.message).toContain("分支口径");
    expect(record.items?.[0]?.message).toContain("55.00%");
  });

  it("出口判据 4：缺分支口径 = malformed 非默认值 → not_run（禁 0%/100% 兜底）", () => {
    c8ReadyFixture(
      JSON.stringify({
        total: { lines: { pct: 80, covered: 8, total: 10 } },
        "src/a.ts": { lines: { pct: 80, covered: 1, total: 2 } },
      }),
    );
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/缺强制口径|强制上报/);
    expect(record.scopeNote).toMatch(/分支/);
    expect(record.counts.violations).toBe(0);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("出口判据 4：分支被测量数为 0（branches.total=0）→ not_run（口径缺席非默认值）", () => {
    c8ReadyFixture(
      JSON.stringify({
        total: {
          lines: { pct: 80, covered: 8, total: 10 },
          branches: { pct: 100, covered: 0, total: 0 },
        },
      }),
    );
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/malformed|强制口径/);
  });

  it("报告未产出（工具 exit 0 但无报告文件）→ not_run（报告是唯一判卷锚，禁当通过）", () => {
    c8ReadyFixture(null);
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/报告未产出/);
  });

  it("报告非 JSON → not_run（malformed，附摘录）", () => {
    c8ReadyFixture("panic: not json");
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("not json");
  });

  it("零测量（lines.total=0）→ not_run（无被测对象的报告不构成覆盖率事实）", () => {
    c8ReadyFixture(
      JSON.stringify({
        total: {
          lines: { pct: 100, covered: 0, total: 0 },
          branches: { pct: 100, covered: 0, total: 4 },
        },
      }),
    );
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
  });

  it("判卷锚声明回归：被包裹测试命令 exit 1（测试失败归 BUILD gate）不洗白不误判——按报告判卷", () => {
    c8ReadyFixture(c8Summary(90, 80));
    const record = fullPipeline(
      policy(),
      scriptedSpawn(
        { status: 0, stdout: "5.3.0" },
        { status: 1, stdout: "tests failed" },
        writesFixtureReport(),
      ),
    );
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("exit=1");
    expect(record.scopeNote).toMatch(/非本 gate 判卷锚/);
  });

  it("版本漂移：观测 6.1.0 ≠ policy 锚 5.3.0 → passed 降 warning；failed 不被 cap 洗白", () => {
    c8ReadyFixture(c8Summary(90, 80));
    const drifted = fullPipeline(
      policy({ expectedToolVersion: "5.3.0" }),
      scriptedSpawn({ status: 0, stdout: "6.1.0" }, { status: 0, stdout: "" }, writesFixtureReport()),
    );
    expect(drifted.verdict).toBe("warning");
    expect(drifted.verdictCapReason).toBe("tool_version_drifted");
    // 低覆盖 + 漂移并存 → failed 不洗白。
    c8ReadyFixture(c8Summary(40, 30));
    const failed = fullPipeline(
      policy({ expectedToolVersion: "5.3.0" }),
      scriptedSpawn({ status: 0, stdout: "6.1.0" }, { status: 0, stdout: "" }, writesFixtureReport()),
    );
    expect(failed.verdict).toBe("failed");
    expect(failed.verdictCapReason).toBeNull();
  });

  it("三道闸⓪：可执行体不在 PATH → not_run（Windows cmd 缺席伪装形态先拦）", () => {
    c8ReadyFixture(c8Summary(90, 80));
    const record = fullPipeline(policy(), scriptedSpawn({}, {}), () => null);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/可执行体.*不在 PATH/);
  });

  it("三道闸①：版本探测非零退出 → not_run（禁猜测版本口径）", () => {
    c8ReadyFixture(c8Summary(90, 80));
    const record = fullPipeline(
      policy(),
      scriptedSpawn({ status: 1, error: null, stdout: "" }, {}),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/版本探测失败/);
  });

  it("三道闸①：版本词形不可得（exit 0 但无 semver）→ not_run（探测语义收紧）", () => {
    c8ReadyFixture(c8Summary(90, 80));
    const record = fullPipeline(
      policy(),
      scriptedSpawn({ status: 0, stdout: "no version here" }, {}),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/版本探测失败/);
  });
});

// ============================================================
// P23 红队 MAJOR：陈旧报告误绿通道封死（spawn 前失效化 + exit=4 语义修正）
// ============================================================

/** pytest-cov coverage.json 词形报告（计数齐备；覆盖率水平可调）。 */
function pytestCovReport(
  linesCovered = 95,
  linesTotal = 100,
  branchesCovered = 90,
  branchesTotal = 100,
): string {
  return JSON.stringify({
    meta: { format: 3 },
    files: {
      "src/a.py": {
        summary: {
          covered_lines: linesCovered,
          num_statements: linesTotal,
          percent_covered: linesCovered,
          num_branches: branchesTotal,
          covered_branches: branchesCovered,
        },
      },
    },
    totals: {
      covered_lines: linesCovered,
      num_statements: linesTotal,
      percent_covered: linesCovered,
      num_branches: branchesTotal,
      covered_branches: branchesCovered,
    },
  });
}

/** pytest-cov 腿就绪夹具（配置 + pytest.ini）。 */
function pytestCovReadyFixture(): void {
  put("coverage-gate.json", JSON.stringify({ runner: "pytest-cov", covTarget: "src" }));
  put("pytest.ini", "[pytest]");
}

describe("runCoverageLeg 失效化纪律（P23 红队 MAJOR：陈旧报告禁跨 run 存活冒充本次判卷锚）", () => {
  it("插件缺席形态（pytest exit 4 fake spawn）+ 预置陈旧满覆盖报告 → not_run 带安装路标，陈旧内容零影响（非 passed/failed）", () => {
    pytestCovReadyFixture();
    // 陈旧遗留：若被读回判卷将冒充 passed（95/90 双达标）。
    put("coverage.json", pytestCovReport());
    const record = fullPipeline(
      policy({ expectedToolVersion: "8.3.4" }),
      scriptedSpawn(
        { status: 0, stdout: "8.3.4" },
        { status: 4, stdout: "", stderr: "ERROR: usage: pytest: error: unrecognized arguments: --cov" },
      ),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.counts.violations).toBe(0);
    expect(record.scopeNote).toMatch(/unrecognized arguments/);
    expect(record.scopeNote).toMatch(/pip install pytest-cov/);
    // 失效化机制在位：陈旧报告已在 spawn 前删除——「被读回判卷」通道不存在。
    expect(existsSync(join(dir, "coverage.json"))).toBe(false);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("预置陈旧报告 + 真执行成功产出新报告 → 判卷锚=本次新报告（内容对账：陈旧值零残留）", () => {
    put("coverage-gate.json", C8_CONFIG);
    put("package.json", C8_DECL);
    // 陈旧 = 30/20（若被读回将冒充 failed）；本次「工具」真产出 90/80。
    put("coverage/coverage-summary.json", c8Summary(30, 20));
    const fresh = c8Summary(90, 80);
    const record = fullPipeline(
      policy(),
      scriptedSpawn({ status: 0, stdout: "5.3.0" }, { status: 0, stdout: "" }, () => {
        put("coverage/coverage-summary.json", fresh);
      }),
    );
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("90.00%");
    expect(record.scopeNote).toContain("80.00%");
    expect(record.scopeNote).not.toContain("30.00%");
    expect(record.scopeNote).not.toContain("20.00%");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("预置陈旧报告 + run exit 0 但工具未产出报告 → not_run（陈旧锚已被失效化，诚实非绿）", () => {
    c8ReadyFixture(c8Summary(90, 80));
    // 刻意用无副作用 fake（工具执行了但不写报告）——若失效化缺席，陈旧满覆盖会被读回冒充 passed。
    const record = fullPipeline(
      policy(),
      scriptedSpawn({ status: 0, stdout: "5.3.0" }, { status: 0, stdout: "" }),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/报告未产出/);
  });

  it("报告路径为目录占位（rmSync 删不掉）→ pre_run_failed → not_run（无法保证新鲜性，fail-closed）", () => {
    put("coverage-gate.json", C8_CONFIG);
    put("package.json", C8_DECL);
    mkdirSync(join(dir, "coverage", "coverage-summary.json"), { recursive: true });
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/失效化失败/);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("报告路径越出项目根（../ 穿透）→ pre_run_failed 拒绝执行，根外预置文件零副作用（失效化面禁变删除面）", () => {
    const proj = join(dir, "proj");
    mkdirSync(proj, { recursive: true });
    writeFileSync(
      join(proj, "coverage-gate.json"),
      JSON.stringify({ runner: "c8", command: "x", coverageReport: "../evil.json" }),
      "utf8",
    );
    writeFileSync(join(proj, "package.json"), C8_DECL, "utf8");
    const evilPath = join(dir, "evil.json");
    writeFileSync(evilPath, '{"stale":true}', "utf8");
    const adapter = createCoverageAdapter({ spawnFn: scriptedSpawn({ status: 0, stdout: "5.3.0" }, { status: 0 }) });
    const plan = adapter.prepare({ projectRoot: proj }, policy(), platformDetectorFacts(proj));
    const record = adapter.normalize(adapter.run(plan), {});
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/越出项目根/);
    expect(existsSync(evilPath)).toBe(true);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("pytest-cov 腿 scopeNote 退出码注记 = pytest 自身语义（非「被包裹测试命令」误标注）", () => {
    pytestCovReadyFixture();
    const fresh = pytestCovReport(90, 100, 80, 100);
    const record = fullPipeline(
      policy({ expectedToolVersion: "8.3.4" }),
      scriptedSpawn(
        { status: 0, stdout: "8.3.4" },
        { status: 1, stdout: "" },
        () => put("coverage.json", fresh),
      ),
    );
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("exit=1");
    expect(record.scopeNote).toMatch(/pytest 自身退出码语义/);
    expect(record.scopeNote).not.toMatch(/被包裹测试命令语义/);
    expect(validate(toGateResultJson(record))).toBe(true);
  });
});

// ============================================================
// pytest-cov 报告解析（D17 Python 腿；--cov-branch 未生效形态拦截）
// ============================================================

describe("parsePytestCovJson：coverage.py JSON 词形（计数重算百分比）", () => {
  it("合法词形：从整数计数重算行/分支百分比 + 逐文件条目", () => {
    const metrics = parsePytestCovJson(
      JSON.stringify({
        meta: { format: 3 },
        files: {
          "src/a.py": {
            summary: {
              covered_lines: 8,
              num_statements: 10,
              percent_covered: 80,
              num_branches: 4,
              covered_branches: 2,
            },
          },
        },
        totals: {
          covered_lines: 8,
          num_statements: 10,
          percent_covered: 83.33,
          num_branches: 8,
          covered_branches: 6,
        },
      }),
    );
    // 行 8/10=80%；分支 6/8=75%（重算，不信工具自报 percent_covered=83.33——C5）。
    expect(metrics?.linesPct).toBeCloseTo(80, 12);
    expect(metrics?.branchesPct).toBeCloseTo(75, 12);
    expect(metrics?.files.get("src/a.py")?.linesPct).toBeCloseTo(80, 12);
  });

  it.each([
    ["num_branches 缺席（--cov-branch 未生效形态）", JSON.stringify({ totals: { covered_lines: 8, num_statements: 10 } })],
    ["num_branches=0", JSON.stringify({ totals: { covered_lines: 8, num_statements: 10, num_branches: 0, covered_branches: 0 } })],
    ["零语句", JSON.stringify({ totals: { covered_lines: 0, num_statements: 0, num_branches: 4, covered_branches: 0 } })],
    ["缺行口径", JSON.stringify({ totals: { num_branches: 4, covered_branches: 2 } })],
    ["非 JSON", "nope"],
  ])("malformed：%s → null（not_run 非默认值）", (_label, text) => {
    expect(parsePytestCovJson(text)).toBeNull();
  });
});

// ============================================================
// parseC8Summary：C5 计数重算一条线（P23 红队 MINOR：与 pytest-cov 腿同款双标消除）
// ============================================================

describe("parseC8Summary：C5 计数重算（pct 字段不消费，计数为唯一判卷锚）", () => {
  it("pct 字段被篡改而计数真实 → 判卷输入按重算值（篡改 pct 不改变判卷）", () => {
    const metrics = parseC8Summary(
      JSON.stringify({
        total: {
          lines: { pct: 99, covered: 400, total: 1000 },
          branches: { pct: 1, covered: 600, total: 800 },
        },
        "src/a.ts": {
          lines: { pct: 0, covered: 40, total: 100 },
          branches: { pct: 99, covered: 60, total: 100 },
        },
      }),
    );
    // 重算：行 400/1000=40%；分支 600/800=75%；自报 pct（99/1/0/99）零影响。
    expect(metrics?.linesPct).toBeCloseTo(40, 12);
    expect(metrics?.branchesPct).toBeCloseTo(75, 12);
    expect(metrics?.files.get("src/a.ts")?.linesPct).toBeCloseTo(40, 12);
    expect(metrics?.files.get("src/a.ts")?.branchesPct).toBeCloseTo(60, 12);
  });

  it("istanbul 词形 pct 字符串（\"40%\"）不消费——计数为锚顺带免疫词形漂移", () => {
    const metrics = parseC8Summary(
      JSON.stringify({
        total: {
          lines: { pct: "40%", covered: 4, total: 10 },
          branches: { pct: "75%", covered: 6, total: 8 },
        },
      }),
    );
    expect(metrics?.linesPct).toBeCloseTo(40, 12);
    expect(metrics?.branchesPct).toBeCloseTo(75, 12);
  });

  it.each([
    ["lines.covered 缺席", JSON.stringify({ total: { lines: { pct: 80, total: 10 }, branches: { covered: 6, total: 8 } } })],
    ["branches 计数缺席（pct 在场不救）", JSON.stringify({ total: { lines: { covered: 8, total: 10 }, branches: { pct: 75 } } })],
    ["covered 非数字", JSON.stringify({ total: { lines: { covered: "8", total: 10 }, branches: { covered: 6, total: 8 } } })],
  ])("计数缺失/不可解析 → null（malformed → not_run，禁按 pct 兜底判卷）", (_label, text) => {
    expect(parseC8Summary(text)).toBeNull();
  });

  it("文件级计数重算：行计数缺席 → 文件跳过；branches.total=0 → branchesPct=null", () => {
    const metrics = parseC8Summary(
      JSON.stringify({
        total: { lines: { covered: 8, total: 10 }, branches: { covered: 6, total: 8 } },
        "src/ok.ts": { lines: { covered: 1, total: 2 }, branches: { covered: 0, total: 0 } },
        "src/no-counts.ts": { lines: { pct: 50 }, branches: { covered: 1, total: 2 } },
      }),
    );
    expect(metrics?.files.size).toBe(1);
    expect(metrics?.files.get("src/ok.ts")?.linesPct).toBeCloseTo(50, 12);
    expect(metrics?.files.get("src/ok.ts")?.branchesPct).toBeNull();
  });

  it("判卷钉：total 自报 pct=99 而计数真实 40% → 全链判 failed（重算 40<80，HARDENING 档）——自报 pct 不进判卷", () => {
    const tampered = JSON.stringify({
      total: {
        lines: { pct: 99, covered: 400, total: 1000 },
        branches: { pct: 99, covered: 600, total: 800 },
      },
    });
    c8ReadyFixture(tampered);
    const record = fullPipeline(policy({ gateTier: "HARDENING" }));
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.message).toContain("40.00%");
    expect(record.scopeNote).toContain("40.00%");
  });
});

// ============================================================
// 行覆盖率三档分化判卷（Owner 决议 2026-09-01 A4 阈值包批准转正：
// MINIMAL 80 / LIGHT 60 / STANDARD 30；HARDENING/FAST 未在批准包沿用 80；
// branches 不参与分化恒 60）
// ============================================================

/**
 * 三档分化判卷夹具：直接构造 plan（plan.thresholds = 判卷契约——coverage-leg.ts
 * 「prepare 以 resolveCoverageProvisionalThresholdsForTier 单一实现消费本表」的同一
 * 消费路径）+ kind:"executed" 的腿输出 → normalizeCoverageLeg 判卷。
 * MINIMAL/LIGHT 档在 adapter prepare 面 policy-exempt（POLICY_EXEMPT_GATE_TIERS
 * 合法缺席），分化值的判卷可达面 = plan.thresholds 契约面；STANDARD/HARDENING 的
 * prepare 面接线另有专测（下方 prepare 消费分化表用例）。
 */
function tieredLegPlan(
  tier: GateTier,
  thresholds: { readonly lines: number; readonly branches: number },
  projectRoot: string,
): CoverageLegPlan {
  return {
    tool: C8_TOOL_ID,
    toolVersion: "5.3.0",
    gate: COVERAGE_GATE_NAME,
    gateDef: COVERAGE_GATE_DEF,
    metricDialect: C8_METRIC_DIALECT,
    grn: "GRN-2301",
    ranAtSeq: 2301,
    trigger: "on_demand",
    subjectId: null,
    denominatorRefs: [],
    projectRoot,
    runner: "c8",
    absenceKind: null,
    absentReason: null,
    absentHint: null,
    tier,
    command: "corepack pnpm exec vitest run",
    versionProbeCommand: "corepack pnpm exec c8 --version",
    executable: "corepack",
    timeoutMs: 60_000,
    coverageReportPath: "coverage/coverage-summary.json",
    thresholds,
    thresholdsProvisional: true,
    expectedToolVersion: null,
  };
}

/** 直接 normalize 的腿输出（executed + 预写报告文本；不经 spawn——判卷面单测）。 */
function tieredLegOutput(plan: CoverageLegPlan, reportText: string) {
  return {
    plan,
    kind: "executed" as const,
    exitCode: 0,
    stdout: "",
    stderr: "",
    observedToolVersion: "5.3.0",
    reportText,
    runnerUsageError: false,
    externalMs: 0,
    failureReason: null,
  };
}

describe("行覆盖率三档分化判卷（Owner 决议 2026-09-01 A4 阈值包）", () => {
  it.each([
    ["MINIMAL", 80, 79],
    ["LIGHT", 60, 59],
    ["STANDARD", 30, 29],
  ] as const)(
    "tier=%s 行阈值 %i：改动 %i%% 红（<阈值）→ failed 且行口径违规携带档位分化阈值与批准注记",
    (tier, threshold, below) => {
      const plan = tieredLegPlan(tier, resolveCoverageProvisionalThresholdsForTier(tier), dir);
      const record = normalizeCoverageLeg(tieredLegOutput(plan, c8Summary(below, 90)), 0);
      expect(record.verdict).toBe("failed");
      expect(record.counts.violations).toBe(1);
      expect(record.items?.[0]?.message).toContain("行口径");
      expect(record.items?.[0]?.message).toContain(`${String(below)}.00%`);
      expect(record.items?.[0]?.message).toContain(`阈值 ${String(threshold)}%`);
      expect(record.items?.[0]?.message).toContain(`档位 ${tier} 行覆盖率分化阈值`);
      expect(record.items?.[0]?.message).toContain("Owner 决议 2026-09-01");
      expect(record.items?.[0]?.message).not.toContain("provisional 待 A4");
    },
  );

  it.each([
    ["MINIMAL", 80],
    ["LIGHT", 60],
    ["STANDARD", 30],
  ] as const)(
    "tier=%s 行阈值 %i：改动达线 %i%% 绿（≥阈值，边界含等号）→ passed（分支 90 同过）",
    (tier, threshold) => {
      const plan = tieredLegPlan(tier, resolveCoverageProvisionalThresholdsForTier(tier), dir);
      const record = normalizeCoverageLeg(tieredLegOutput(plan, c8Summary(threshold, 90)), 0);
      expect(record.verdict).toBe("passed");
      expect(record.counts.violations).toBe(0);
      expect(record.scopeNote).toContain(`阈值 ≥${String(threshold)}`);
      expect(record.scopeNote).toContain("Owner 决议 2026-09-01");
      expect(record.scopeNote).not.toContain("provisional 待 A4");
    },
  );

  it("HARDENING 档值未在批准包：沿用 80（与 MINIMAL 同）——79 红 / 80 绿；注记带「后续呈报」", () => {
    const plan = tieredLegPlan(
      "HARDENING",
      resolveCoverageProvisionalThresholdsForTier("HARDENING"),
      dir,
    );
    const red = normalizeCoverageLeg(tieredLegOutput(plan, c8Summary(79, 90)), 0);
    expect(red.verdict).toBe("failed");
    expect(red.items?.[0]?.message).toContain("阈值 80%");
    const green = normalizeCoverageLeg(tieredLegOutput(plan, c8Summary(80, 90)), 0);
    expect(green.verdict).toBe("passed");
    expect(green.scopeNote).toContain("后续呈报");
  });

  it("同一报告跨档判定分化：行 50% 在 STANDARD 过（≥30）/ 在 HARDENING 红（<80）——分化真实改变判卷", () => {
    const report = c8Summary(50, 90);
    const standard = normalizeCoverageLeg(
      tieredLegOutput(
        tieredLegPlan("STANDARD", resolveCoverageProvisionalThresholdsForTier("STANDARD"), dir),
        report,
      ),
      0,
    );
    expect(standard.verdict).toBe("passed");
    const hardening = normalizeCoverageLeg(
      tieredLegOutput(
        tieredLegPlan("HARDENING", resolveCoverageProvisionalThresholdsForTier("HARDENING"), dir),
        report,
      ),
      0,
    );
    expect(hardening.verdict).toBe("failed");
    expect(hardening.items?.[0]?.message).toContain("50.00%");
    expect(hardening.items?.[0]?.message).toContain("阈值 80%");
  });

  it("branches 阈值不受分化影响：全档恒 60（resolve 层全表）+ 判卷面 STANDARD 40/55 只红分支（行 40≥30 过）", () => {
    for (const tier of GATE_TIER_VALUES) {
      expect(resolveCoverageProvisionalThresholdsForTier(tier).branches).toBe(60);
    }
    const plan = tieredLegPlan("STANDARD", resolveCoverageProvisionalThresholdsForTier("STANDARD"), dir);
    const record = normalizeCoverageLeg(tieredLegOutput(plan, c8Summary(40, 55)), 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.message).toContain("分支口径");
    expect(record.items?.[0]?.message).toContain("55.00%");
    expect(record.items?.[0]?.message).toContain("阈值 60%");
    expect(record.items?.[0]?.message).toContain("未在 2026-09-01 批准包");
  });

  it("分化表全表对账（批准三档 + HARDENING/FAST 未批沿用 80）", () => {
    expect(COVERAGE_LINES_THRESHOLDS_BY_TIER).toEqual({
      MINIMAL: 80,
      LIGHT: 60,
      FAST: 80,
      STANDARD: 30,
      HARDENING: 80,
    });
  });

  it("prepare 消费分化表：STANDARD 出厂兜底 {lines:30, branches:60} / HARDENING {lines:80, branches:60}；配置显式供给整体覆盖（配置优先）", () => {
    put("coverage-gate.json", C8_CONFIG);
    put("package.json", C8_DECL);
    const adapter = createCoverageAdapter();
    const standard = adapter.prepare(
      { projectRoot: dir },
      policy({ gateTier: "STANDARD" }),
      platformDetectorFacts(dir),
    );
    expect(standard.tier).toBe("STANDARD");
    expect(standard.thresholds).toEqual({ lines: 30, branches: 60 });
    const hardening = adapter.prepare(
      { projectRoot: dir },
      policy({ gateTier: "HARDENING" }),
      platformDetectorFacts(dir),
    );
    expect(hardening.thresholds).toEqual({ lines: 80, branches: 60 });
    // 配置显式供给时整体覆盖兜底（判卷不分档——coverage-adapter 消费契约）。
    put(
      "coverage-gate.json",
      JSON.stringify({
        runner: "c8",
        command: "npm test",
        thresholds: { lines: 50, branches: 45 },
      }),
    );
    const explicit = adapter.prepare(
      { projectRoot: dir },
      policy({ gateTier: "STANDARD" }),
      platformDetectorFacts(dir),
    );
    expect(explicit.thresholds).toEqual({ lines: 50, branches: 45 });
    expect(explicit.thresholdsProvisional).toBe(false);
  });
});

// ============================================================
// 真实子进程链路（fake c8 脚本 × 真实 spawnSync 两段式；零安装零网络）
// ============================================================

const FAKE_C8_CJS = `const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("8.4.0\\n");
  process.exit(0);
}
const dirArg = args.find((a) => a.startsWith("--reports-dir="));
const dirValue = dirArg ? dirArg.slice("--reports-dir=".length).replace(/^"|"$/g, "") : ".";
const lines = Number(process.env.FAKE_C8_LINES ?? "90");
const branches = Number(process.env.FAKE_C8_BRANCHES ?? "75");
fs.mkdirSync(dirValue, { recursive: true });
fs.writeFileSync(
  path.join(dirValue, "coverage-summary.json"),
  JSON.stringify({
    total: {
      lines: { pct: lines, covered: (lines / 100) * 10, total: 10 },
      branches: { pct: branches, covered: (branches / 100) * 8, total: 8 },
    },
    "src/a.ts": {
      lines: { pct: lines, covered: (lines / 100) * 10, total: 10 },
      branches: { pct: branches, covered: (branches / 100) * 8, total: 8 },
    },
  }),
);
process.stdout.write("wrapped command ran\\n");
process.exit(Number(process.env.FAKE_C8_EXIT ?? "0"));
`;

/** 真实 spawnSync wrapper（与 coverageSpawn 同参数形态 + 注入 FAKE_C8_*）。 */
function realSpawnWithEnv(env: Record<string, string>): SpawnFn {
  return (command, options) => {
    const res = spawnSync(command, {
      shell: true,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: "utf8",
      windowsHide: true,
      // PATH 引号消毒（phaseC 附录 A 教训：游离双引号会让 cmd.exe 吞段、node 失联）。
      env: stripQuotesFromPathEnv({ ...process.env, ...env }),
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

function c8LegPlan(scriptPath: string, projectRoot: string): CoverageLegPlan {
  const reportsDir = join(projectRoot, "coverage");
  return {
    tool: C8_TOOL_ID,
    toolVersion: "8.4.0",
    gate: COVERAGE_GATE_NAME,
    gateDef: COVERAGE_GATE_DEF,
    metricDialect: C8_METRIC_DIALECT,
    grn: "GRN-2302",
    ranAtSeq: 2302,
    trigger: "on_demand",
    subjectId: null,
    denominatorRefs: [],
    projectRoot,
    runner: "c8",
    absenceKind: null,
    absentReason: null,
    absentHint: null,
    tier: "HARDENING",
    command: `node "${scriptPath}" --reports-dir="${reportsDir}" wrapped`,
    versionProbeCommand: `node "${scriptPath}" --version`,
    executable: "node",
    timeoutMs: 60_000,
    coverageReportPath: "coverage/coverage-summary.json",
    thresholds: COVERAGE_PROVISIONAL_THRESHOLDS,
    thresholdsProvisional: true,
    expectedToolVersion: null,
  };
}

describe("coverage 腿真实子进程（fake c8 脚本两段式；出口判据 1）", () => {
  const workRoot = mkdtempSync(join(tmpdir(), "pomaster-c8-leg-"));
  const scriptPath = join(workRoot, "fake-c8.cjs");
  writeFileSync(scriptPath, FAKE_C8_CJS, "utf8");

  it("达标 → 真两段 spawn → 子进程真实产出报告文件 → passed", { timeout: 60_000 }, () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "pomaster-c8-run-pass-"));
    const raw = runCoverageLeg(
      c8LegPlan(scriptPath, projectRoot),
      realSpawnWithEnv({ FAKE_C8_LINES: "90", FAKE_C8_BRANCHES: "75" }),
    );
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("8.4.0");
    // 子进程真实写盘的报告被 run 侧回读（两段式全链：探测 → 执行 → 报告回读）。
    expect(raw.reportText).toContain('"total"');
    const record = normalizeCoverageLeg(raw, 0);
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("低覆盖 → 真两段 spawn → failed violations=2（报告由子进程产出）", { timeout: 60_000 }, () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "pomaster-c8-run-fail-"));
    const raw = runCoverageLeg(
      c8LegPlan(scriptPath, projectRoot),
      realSpawnWithEnv({ FAKE_C8_LINES: "40", FAKE_C8_BRANCHES: "30" }),
    );
    const record = normalizeCoverageLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.items?.every((item) => item.rule === "coverage_below_threshold")).toBe(true);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("大输出（>1MB stdout）：默认 coverageSpawn 64MB 缓冲不被 Node 默认 1MB ENOBUFS 打断", { timeout: 60_000 }, () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "pomaster-c8-run-big-"));
    const bigScript = join(workRoot, "big-c8.cjs");
    writeFileSync(
      bigScript,
      `const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("8.4.0\\n");
  process.exit(0);
}
process.stdout.write("x".repeat(1200 * 1024));
const dirArg = args.find((a) => a.startsWith("--reports-dir="));
const dirValue = dirArg ? dirArg.slice("--reports-dir=".length).replace(/^"|"$/g, "") : ".";
fs.mkdirSync(dirValue, { recursive: true });
fs.writeFileSync(
  path.join(dirValue, "coverage-summary.json"),
  JSON.stringify({
    total: {
      lines: { pct: 90, covered: 9, total: 10 },
      branches: { pct: 80, covered: 8, total: 10 },
    },
  }),
);
process.exit(0);
`,
      "utf8",
    );
    const raw = runCoverageLeg(c8LegPlan(bigScript, projectRoot));
    // 刻意走默认 coverageSpawn（maxBuffer 修复位，oasdiff 腿同款回归手法）——
    // 若回落 Node 默认 1MB，本用例将以 error=ENOBUFS → spawn_failed 变红。
    expect(raw.kind).toBe("executed");
    expect(raw.stdout.length).toBeGreaterThan(1024 * 1024);
    const record = normalizeCoverageLeg(raw, 0);
    expect(record.verdict).toBe("passed");
  });
});

// ============================================================
// 宿主在场 e2e（宿主未装 → skip + 盲区说明——诚实缺席纪律）
// ============================================================

describe("coverage 腿宿主真实 e2e（宿主未装则诚实 skip）", () => {
  it("真实 c8（corepack pnpm exec c8）：宿主在位时全链真跑判卷", { timeout: 120_000 }, (ctx) => {
    const facts = platformDetectorFacts(process.cwd());
    if (detectC8(facts).status !== "READY") {
      console.warn(
        "[盲区说明] 宿主未安装 c8 —— c8 真实覆盖率 e2e 跳过（诚实缺席，非通过）；判卷矩阵与真实子进程链路已由 fake spawn / fake 脚本覆盖",
      );
      ctx.skip();
    }
    put("coverage-gate.json", C8_CONFIG);
    put("package.json", C8_DECL);
    // 真实探测 + 真实 spawn + 真实 PATH 探针（零 fake；真实链路全段）。
    const record = fullPipeline(
      policy({ expectedToolVersion: null }),
      coverageSpawn,
      platformExecutableProbe,
    );
    // 真实链路判卷态必属诚实七态子集；报告缺席落 not_run（诚实），不冒充通过。
    expect(["passed", "failed", "warning", "not_run"]).toContain(record.verdict);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("真实 pytest-cov（python -m pytest --cov）：宿主在位时全链真跑判卷", { timeout: 120_000 }, (ctx) => {
    const probe = spawnSync("python -m pytest --version", {
      shell: true,
      encoding: "utf8",
      windowsHide: true,
    });
    const plugin = spawnSync('python -c "import pytest_cov"', {
      shell: true,
      encoding: "utf8",
      windowsHide: true,
    });
    if (probe.status !== 0 || plugin.status !== 0) {
      console.warn(
        "[盲区说明] 宿主未安装 pytest/pytest-cov —— Python 覆盖率腿真实 e2e 跳过（诚实缺席，非通过；D17 pytest-cov 先行的 run 期判卷矩阵已由 fake spawn 覆盖）",
      );
      ctx.skip();
    }
    put("coverage-gate.json", JSON.stringify({ runner: "pytest-cov", covTarget: "." }));
    put("pytest.ini", "[pytest]");
    const record = fullPipeline(policy({ expectedToolVersion: "8.0.0" }), coverageSpawn);
    expect(["passed", "failed", "warning", "not_run"]).toContain(record.verdict);
    expect(validate(toGateResultJson(record))).toBe(true);
  });
});

// ============================================================
// 三态 truth-index 记录互异（failed / passed / not_run）
// ============================================================

describe("三态 truth-index 记录互异", () => {
  it("同一 fixture 面：failed / passed / not_run 三份记录逐字段互异且全部过 03 schema", () => {
    c8ReadyFixture(c8Summary(40, 30));
    const failed = fullPipeline();
    c8ReadyFixture(c8Summary(90, 80));
    const passed = fullPipeline();
    // not_run 取「报告缺席」形态（工具在位但无报告——诚实缺席）；上一态的报告文件须真实清除。
    rmSync(join(dir, "coverage"), { recursive: true, force: true });
    c8ReadyFixture(null);
    const notRun = fullPipeline();
    expect(failed.verdict).toBe("failed");
    expect(passed.verdict).toBe("passed");
    expect(notRun.verdict).toBe("not_run");
    const serial = [failed, passed, notRun].map((record) =>
      JSON.stringify(toGateResultJson(record)),
    );
    expect(new Set(serial).size).toBe(3);
    for (const record of [failed, passed, notRun]) {
      const doc = toGateResultJson(record);
      if (!validate(doc)) console.error(validate.errors);
      expect(validate(doc)).toBe(true);
    }
  });
});

// ============================================================
// 计算器与解析器的公式一致性（coverage 腿与 CRAP 腿同源输入面）
// ============================================================

describe("coverage × CRAP 同源对账（CRAP 地基语义：行口径入公式）", () => {
  it("报告行口径 40% + 复杂度 5 → CRAP=computeCrap(5, 0.4)=10.4（公式在 CRAP 腿逐值复算）", () => {
    const metrics = parseC8Summary(c8Summary(40, 60));
    expect(metrics).not.toBeNull();
    const linesPct = metrics?.linesPct ?? 0;
    // PRD §28.1：c=5, cov=0.4 → 25×(0.6)³+5 = 25×0.216+5 = 5.4+5 = 10.4。
    expect(computeCrap(5, linesPct / 100)).toBeCloseTo(10.4, 12);
  });
});
