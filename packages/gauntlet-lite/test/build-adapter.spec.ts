/**
 * BUILD adapter 组装面正反例：detect 双腿四态 / prepare 计划纯数据 / run spawn 注入 /
 * pytest 显式 not-implemented / detect→prepare→run→normalize 全链路集成。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GateAdapterError,
  TEST_METRIC_DIALECT,
  VITEST_RUN_COMMAND,
  createBuildAdapter,
  gateAdapters,
  toGateResultJson,
  toolDetectors,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import {
  VITEST_PROJECT_ROOT,
  fakeFacts,
  packageJsonWithVitest,
  posixJoin,
  recordingSpawn,
  vitestProjectFacts,
  vitestReport,
} from "./helpers.js";

const adapter = createBuildAdapter();

function factsWithPackageJson(body: string) {
  return fakeFacts(VITEST_PROJECT_ROOT, {
    files: { [posixJoin(VITEST_PROJECT_ROOT, "package.json")]: body },
  });
}

// ============================================================
// detect：vitest / pytest 双腿四态
// ============================================================

describe("build adapter detect", () => {
  it("package.json 声明 vitest → vitest READY + composite READY，pytest 腿如实 NOT_INSTALLED", () => {
    const detection = adapter.detect(vitestProjectFacts());
    expect(detection.status).toBe("READY");
    expect(detection.vitest.status).toBe("READY");
    expect(detection.pytest.status).toBe("NOT_INSTALLED");
  });

  it("版本词形净化：'^2.1.8' → detectedVersion '2.1.8'（tool_version 需纯 semver）", () => {
    const detection = adapter.detect(vitestProjectFacts());
    expect(detection.vitest.status === "READY" && detection.vitest.detectedVersion).toBe(
      "2.1.8",
    );
  });

  it("无 vitest 但有 pytest.ini → pytest READY，composite READY（prepare 走 pytest 腿）", () => {
    const detection = adapter.detect(
      fakeFacts(VITEST_PROJECT_ROOT, {
        files: {
          [posixJoin(VITEST_PROJECT_ROOT, "pytest.ini")]: "[pytest]",
        },
      }),
    );
    expect(detection.pytest.status).toBe("READY");
    expect(detection.vitest.status).toBe("NOT_INSTALLED");
    expect(detection.status).toBe("READY");
  });

  it("pyproject.toml [tool.pytest.ini_options] → pytest READY", () => {
    const detection = adapter.detect(
      fakeFacts(VITEST_PROJECT_ROOT, {
        files: {
          [posixJoin(VITEST_PROJECT_ROOT, "pyproject.toml")]:
            "[tool.pytest.ini_options]\naddopts='-q'",
        },
      }),
    );
    expect(detection.pytest.status).toBe("READY");
  });

  it("空项目 → composite NOT_INSTALLED，两腿各带安装建议", () => {
    const detection = adapter.detect(fakeFacts(VITEST_PROJECT_ROOT, { files: {} }));
    expect(detection.status).toBe("NOT_INSTALLED");
    expect(detection.vitest.status).toBe("NOT_INSTALLED");
    expect(detection.pytest.status).toBe("NOT_INSTALLED");
    if (detection.vitest.status === "NOT_INSTALLED") {
      expect(detection.vitest.installHint).toMatch(/vitest/);
    }
  });

  it("package.json 不可解析 → NOT_INSTALLED 显式留痕（禁静默）", () => {
    const detection = adapter.detect(factsWithPackageJson("{ broken"));
    expect(detection.vitest.status).toBe("NOT_INSTALLED");
    if (detection.vitest.status === "NOT_INSTALLED") {
      expect(detection.vitest.reason).toMatch(/不可解析/);
    }
  });
});

// ============================================================
// prepare：纯数据执行计划
// ============================================================

describe("build adapter prepare", () => {
  it("计划携带 corepack pnpm exec vitest run --reporter=json 命令与口径锚", () => {
    const plan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT },
      { grn: "GRN-9", ranAtSeq: 42, trigger: "pre_closeout" },
      vitestProjectFacts(),
    );
    expect(plan.command).toBe(VITEST_RUN_COMMAND);
    expect(plan.command).toContain("corepack pnpm exec vitest run --reporter=json");
    expect(plan.cwd).toBe(VITEST_PROJECT_ROOT);
    expect(plan.gate).toBe("BUILD");
    expect(plan.metricDialect).toBe(TEST_METRIC_DIALECT);
    expect(plan.grn).toBe("GRN-9");
    expect(plan.ranAtSeq).toBe(42);
    expect(plan.trigger).toBe("pre_closeout");
    expect(plan.toolVersion).toBe("2.1.8");
  });

  it("无任何 runner 就绪 → GateAdapterError runner_not_ready（附安装路标）", () => {
    expect(() =>
      adapter.prepare(
        { projectRoot: VITEST_PROJECT_ROOT },
        { grn: "GRN-9", ranAtSeq: 1 },
        fakeFacts(VITEST_PROJECT_ROOT, { files: {} }),
      ),
    ).toThrowError(GateAdapterError);
    try {
      adapter.prepare(
        { projectRoot: VITEST_PROJECT_ROOT },
        { grn: "GRN-9", ranAtSeq: 1 },
        fakeFacts(VITEST_PROJECT_ROOT, { files: {} }),
      );
    } catch (error) {
      expect((error as GateAdapterError).reason).toBe("runner_not_ready");
      expect((error as GateAdapterError).hint).toMatch(/vitest/);
    }
  });

  it("仅 pytest 就绪但缺版本锚 → runner_not_ready（pytest 版本无法从配置探测，禁伪造 semver）", () => {
    const pytestOnly = fakeFacts(VITEST_PROJECT_ROOT, {
      files: { [posixJoin(VITEST_PROJECT_ROOT, "pytest.ini")]: "[pytest]" },
    });
    expect(() =>
      adapter.prepare(
        { projectRoot: VITEST_PROJECT_ROOT },
        { grn: "GRN-9", ranAtSeq: 1, expectedToolVersion: null },
        pytestOnly,
      ),
    ).toThrowError(GateAdapterError);
    try {
      adapter.prepare(
        { projectRoot: VITEST_PROJECT_ROOT },
        { grn: "GRN-9", ranAtSeq: 1, expectedToolVersion: null },
        pytestOnly,
      );
    } catch (error) {
      expect((error as GateAdapterError).reason).toBe("runner_not_ready");
      expect((error as GateAdapterError).message).toMatch(/expectedToolVersion/);
      expect((error as GateAdapterError).hint).toMatch(/版本锚/);
    }
  });
});

// ============================================================
// run：spawn 注入与显式拒绝
// ============================================================

describe("build adapter run", () => {
  it("spawn 收到 plan 的 command/cwd/timeoutMs，stdout/exitCode/externalMs 原样透传", () => {
    const plan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT },
      { grn: "GRN-10", ranAtSeq: 1, timeoutMs: 5555 },
      vitestProjectFacts(),
    );
    const { spawn, calls } = recordingSpawn({
      stdout: vitestReport([{ assertions: ["passed"] }]),
      externalMs: 4321,
      status: 1,
    });
    const raw = adapter.run(plan, spawn);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe(plan.command);
    expect(calls[0]?.options.cwd).toBe(VITEST_PROJECT_ROOT);
    expect(calls[0]?.options.timeoutMs).toBe(5555);
    expect(raw.kind).toBe("executed");
    expect(raw.exitCode).toBe(1);
    expect(raw.externalMs).toBe(4321);
  });

  it("spawn 层失败（error 非空）→ kind=spawn_failed + failureReason（normalize 落 not_run）", () => {
    const plan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT },
      { grn: "GRN-11", ranAtSeq: 1 },
      vitestProjectFacts(),
    );
    const raw = adapter.run(
      plan,
      () => ({
        status: null,
        stdout: "",
        stderr: "",
        error: "spawn corepack ENOENT",
        externalMs: 7,
      }),
    );
    expect(raw.kind).toBe("spawn_failed");
    expect(raw.failureReason).toMatch(/ENOENT/);
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("not_run");
    // I3：failureReason 透传进 not_run 记录的 scopeNote（缺席必须说清「为何没查」，禁 null 静默）。
    expect(record.scopeNote).toMatch(/ENOENT/);
    expect(record.scopeNote).toMatch(/not_run/);
  });

  it("exit 0 但 stdout 非合法 vitest JSON → not_run + scopeNote 带判卷不可能原因（I3 禁 null 静默）", () => {
    const plan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT },
      { grn: "GRN-13", ranAtSeq: 1 },
      vitestProjectFacts(),
    );
    const raw = adapter.run(plan, () => ({
      status: 0,
      stdout: "crashed mid-run, not json",
      stderr: "",
      error: null,
      externalMs: 9,
    }));
    expect(raw.kind).toBe("executed");
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("not_run");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(record.scopeNote).toMatch(/不可判卷/);
    expect(record.scopeNote).toMatch(/非合法 JSON/);
  });

  it("pytest runner 计划（带版本锚）→ prepare 产出 pytest 腿 + run 正常派发（G5 后不再拒绝）", () => {
    const pytestOnly = fakeFacts(VITEST_PROJECT_ROOT, {
      files: { [posixJoin(VITEST_PROJECT_ROOT, "pytest.ini")]: "[pytest]" },
    });
    const pytestPlan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT },
      { grn: "GRN-12", ranAtSeq: 1, expectedToolVersion: "8.3.4" },
      pytestOnly,
    );
    expect(pytestPlan.runner).toBe("pytest");
    expect(pytestPlan.tool).toBe("gauntlet:pytest");
    expect(pytestPlan.toolVersion).toBe("8.3.4");
    expect(pytestPlan.command).toContain("python -m pytest");
    // run 派发：fake spawn 透传 stdout（JUnit XML），kind=executed（归一层细节归 pytest-adapter.spec）。
    const raw = adapter.run(
      pytestPlan,
      () => ({
        status: 0,
        stdout: "<testsuite failures=\"0\"><testcase name=\"a\"/></testsuite>",
        stderr: "",
        error: null,
        externalMs: 3,
      }),
    );
    expect(raw.kind).toBe("executed");
    expect(raw.exitCode).toBe(0);
  });
});

// ============================================================
// detect → prepare → run → normalize 全链路集成
// ============================================================

describe("BUILD gate 全链路（fake spawn 集成）", () => {
  it("失败报告走完全链路：verdict=failed，产物可序列化为 03 文档", () => {
    const detection = adapter.detect(vitestProjectFacts());
    expect(detection.status).toBe("READY");
    const plan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT, subjectId: null },
      { grn: "GRN-99", ranAtSeq: 100 },
      vitestProjectFacts(),
    );
    const { spawn } = recordingSpawn({
      stdout: vitestReport([{ assertions: ["failed", "passed"] }]),
      externalMs: 88,
      status: 1,
    });
    const raw = adapter.run(plan, spawn);
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);

    const ajv = new Ajv({ strictSchema: false });
    addFormats(ajv);
    const validate = ajv.compile(
      gateResultSchema as unknown as Parameters<typeof ajv.compile>[0],
    );
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("registry 导出面：gateAdapters.build 与 toolDetectors 十五探测齐备（P27 扩容 lighthouse/webVitals/schemathesis）", () => {
    expect(gateAdapters.build.adapterId).toBe("gauntlet-lite:build");
    expect(Object.keys(toolDetectors).sort()).toEqual([
      "c8",
      "chromeDevtoolsMcp",
      "dependencyCruiser",
      "gitleaks",
      "importLinter",
      "lighthouse",
      "mutmut",
      "oasdiff",
      "pipAudit",
      "playwright",
      "pytestCov",
      "schemathesis",
      "semgrep",
      "stryker",
      "webVitals",
    ]);
  });

  it("package.json 词形不可解析版本（'workspace:*'）→ prepare 显式拒绝（不伪造 tool_version）", () => {
    expect(() =>
      adapter.prepare(
        { projectRoot: VITEST_PROJECT_ROOT },
        { grn: "GRN-13", ranAtSeq: 1 },
        factsWithPackageJson(packageJsonWithVitest("workspace:*")),
      ),
    ).toThrowError(/tool_version/);
  });
});

// ============================================================
// vitest 腿大输出 maxBuffer（I4：defaultSpawn 显式 64MB——此前未设，Node 默认 1MB
// 会被大 vitest JSON 报告 ENOBUFS 打断 → 结构性 not_run，P22 红队 MAJOR 同款）。
//
// 跨平台确定性构造（oasdiff-leg 大输出先例同款）：子进程侧 fs.writeSync(1,…) 循环
// 补写（部分写/EAGAIN 重试）——「产出 >1MB stdout」跨平台保证全量落管；期望字节数
// 闭式可算，断言收紧到精确相等。若 defaultSpawn 回落 Node 默认 1MB → error=ENOBUFS
// → spawn_failed，同样红（原回归意图不变）。
// ============================================================

const BIG_VITEST_ASSERTIONS = 60_000; // {"status":"passed"} + 逗号 ≈ 20B/条 → >1MB。

/** 与子进程脚本同构构造期望 JSON（同键序 → JSON.stringify 字节恒等）。 */
function bigVitestExpectedJson(): string {
  const assertionResults: Array<{ status: string }> = [];
  for (let i = 0; i < BIG_VITEST_ASSERTIONS; i += 1) {
    assertionResults.push({ status: "passed" });
  }
  return JSON.stringify({
    numFailedTests: 0,
    success: true,
    testResults: [{ assertionResults }],
  });
}

const BIG_VITEST_RUNNER_CJS = `const { writeSync } = require("node:fs");
function writeAll(text) {
  const buf = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buf.length) {
    try {
      offset += writeSync(1, buf, offset, buf.length - offset);
    } catch (error) {
      if (error && error.code === "EAGAIN") continue;
      throw error;
    }
  }
}
const assertionResults = [];
for (let i = 0; i < ${BIG_VITEST_ASSERTIONS}; i++) assertionResults.push({ status: "passed" });
writeAll(JSON.stringify({ numFailedTests: 0, success: true, testResults: [{ assertionResults }] }));
process.exit(0);
`;

describe("vitest 腿大输出 maxBuffer（I4：defaultSpawn 64MB，真实子进程）", () => {
  it(">1MB 合法 vitest JSON 走通 defaultSpawn + 判卷（passed，stdout 字节数精确恒等）", { timeout: 60_000 }, () => {
    const expectedJson = bigVitestExpectedJson();
    // fixture 自证：构造目标 > Node 默认 1MB（本用例的回归判据前提）。
    expect(expectedJson.length).toBeGreaterThan(1024 * 1024);
    const dir = mkdtempSync(join(tmpdir(), "pomaster-build-big-"));
    const scriptPath = join(dir, "big-vitest-report.cjs");
    writeFileSync(scriptPath, BIG_VITEST_RUNNER_CJS, "utf8");
    const plan = adapter.prepare(
      { projectRoot: VITEST_PROJECT_ROOT },
      { grn: "GRN-14", ranAtSeq: 1 },
      vitestProjectFacts(),
    );
    // 命令与 cwd 一并替换为真实临时目录（defaultSpawn 是修复位——不注入 spawnFn 走默认实现）。
    const raw = adapter.run({ ...plan, command: `node "${scriptPath}"`, cwd: dir });
    expect(raw.kind).toBe("executed");
    expect(raw.failureReason).toBeNull();
    // 精确恒等（强于 >1MB）：跨 OS 全量落管，任何截断/ENOBUFS 即刻红。
    expect(raw.stdout.length).toBe(expectedJson.length);
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBe(BIG_VITEST_ASSERTIONS);
  });
});
