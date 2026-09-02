/**
 * pytest 腿 spec（G5 谱系扩展第一交付：detect 已有，run + normalize 补全）。
 *
 * 覆盖：prepare 版本锚契约 / run 双 spawn（版本探测 + --junitxml 实跑）/ PATH 引号消毒
 * （phaseC 附录 A 教训）/ JUnit XML 判卷矩阵（全绿 / 一过一挂 / 自报撒谎 / 全 skipped→
 * skipped_blindspot 必附盲区指标 / 非法 XML→not_run / 观测版本漂移）/ 真实 pytest e2e
 * （自建最小 fixture 工程，宿主无 pytest 则 skip 并附盲区说明——诚实缺席，非通过）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PYTEST_RUN_COMMAND,
  createBuildAdapter,
  parseJUnitXml,
  pytestSpawn,
  stripQuotesFromPathEnv,
  toGateResultJson,
  type DetectorFacts,
  type GatePlan,
  type SpawnFn,
  type ToolRunOutput,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, junitReport, posixJoin, VITEST_PROJECT_ROOT } from "./helpers.js";

const adapter = createBuildAdapter();

// ============================================================
// 夹具：pytest 项目 facts / 计划 / spawn 序列 fake
// ============================================================

const PYTEST_INI = "[pytest]\ntestpaths = .\n";

function pytestProjectFacts(): DetectorFacts {
  return fakeFacts(VITEST_PROJECT_ROOT, {
    files: { [posixJoin(VITEST_PROJECT_ROOT, "pytest.ini")]: PYTEST_INI },
  });
}

function makePytestPlan(expectedToolVersion = "8.3.4"): GatePlan {
  return adapter.prepare(
    { projectRoot: VITEST_PROJECT_ROOT },
    { grn: "GRN-71", ranAtSeq: 71, expectedToolVersion },
    pytestProjectFacts(),
  );
}

/** 顺序应答的 spawn fake：outcomes[n] = 第 n+1 次 spawn 的结果（越界复用末项）。 */
function spawnSequence(outcomes: Array<Record<string, unknown>>): {
  spawn: SpawnFn;
  calls: { command: string; options: { cwd: string; timeoutMs: number } }[];
} {
  const calls: { command: string; options: { cwd: string; timeoutMs: number } }[] = [];
  let index = 0;
  const spawn: SpawnFn = (command, options) => {
    calls.push({ command, options });
    const outcome = outcomes[Math.min(index, outcomes.length - 1)] ?? {};
    index++;
    return {
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      externalMs: 5,
      ...(outcome as Partial<ToolRunOutput>),
    } as never;
  };
  return { spawn, calls };
}

// ============================================================
// 宿主 pytest 探测（真实 e2e 的诚实缺席守卫；用产品自己的 pytestSpawn 探测——顺带狗粮）
// ============================================================

const HOST_PYTEST_PROBE = pytestSpawn("python -m pytest --version", {
  cwd: tmpdir(),
  timeoutMs: 60_000,
});
const HOST_PYTEST_SEMVER =
  HOST_PYTEST_PROBE.status === 0
    ? /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(
        `${HOST_PYTEST_PROBE.stdout}${HOST_PYTEST_PROBE.stderr}`,
      )?.[1] ?? null
    : null;

// ============================================================
// prepare：版本锚契约
// ============================================================

describe("pytest 腿 prepare", () => {
  it("计划携带 python -m pytest 命令 + policy 版本锚 + BUILD 口径锚", () => {
    const plan = makePytestPlan("8.3.4");
    expect(plan.runner).toBe("pytest");
    expect(plan.command).toBe(PYTEST_RUN_COMMAND);
    expect(plan.command).toContain("python -m pytest");
    expect(plan.tool).toBe("gauntlet:pytest");
    expect(plan.toolVersion).toBe("8.3.4");
    expect(plan.gate).toBe("BUILD");
    expect(plan.metricDialect).toBe("test:assertion_count");
    expect(plan.cwd).toBe(VITEST_PROJECT_ROOT);
    expect(plan.grn).toBe("GRN-71");
    expect(plan.ranAtSeq).toBe(71);
  });

  it("缺版本锚 → runner_not_ready（pytest 版本无法从配置探测，禁伪造 semver）", () => {
    expect(() =>
      adapter.prepare(
        { projectRoot: VITEST_PROJECT_ROOT },
        { grn: "GRN-72", ranAtSeq: 72, expectedToolVersion: null },
        pytestProjectFacts(),
      ),
    ).toThrowError(/expectedToolVersion/);
  });
});

// ============================================================
// run：双 spawn + junitxml 附加 + PATH 消毒
// ============================================================

describe("pytest 腿 run", () => {
  it("两次 spawn：先版本探测后 junit 实跑；命令追加 --junitxml；观测版本从 stdout 提取", () => {
    const plan = makePytestPlan("8.3.4");
    const { spawn, calls } = spawnSequence([
      { stdout: "pytest 8.3.4" },
      { stdout: junitReport([{ status: "passed" }]) },
    ]);
    const raw = adapter.run(plan, spawn);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.command).toBe("python -m pytest --version");
    expect(calls[1]?.command).toContain(PYTEST_RUN_COMMAND);
    expect(calls[1]?.command).toMatch(/--junitxml="/);
    expect(calls[1]?.options.cwd).toBe(VITEST_PROJECT_ROOT);
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("8.3.4");
    expect(raw.stdout).toContain("<testcase");
  });

  it("版本探测 spawn 失败 → kind=spawn_failed + failureReason（normalize 落 not_run，禁猜测判卷）", () => {
    const plan = makePytestPlan();
    const { spawn } = spawnSequence([
      { status: null, error: "spawn python ENOENT", stdout: "" },
    ]);
    const raw = adapter.run(plan, spawn);
    expect(raw.kind).toBe("spawn_failed");
    expect(raw.failureReason).toMatch(/版本探测失败/);
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("not_run");
  });

  it("stripQuotesFromPathEnv：游离双引号被剥离（附录 A 教训）、无引号原样返回、PATH 缺失不动", () => {
    const poisoned = { PATH: 'C:/Windows;D:/Aspark/spark/bin";C:/tools', TEMP: "x" };
    const clean = stripQuotesFromPathEnv(poisoned);
    expect(clean.PATH).toBe("C:/Windows;D:/Aspark/spark/bin;C:/tools");
    expect(clean.TEMP).toBe("x");
    const alreadyClean = { PATH: "C:/Windows" };
    expect(stripQuotesFromPathEnv(alreadyClean)).toBe(alreadyClean);
    expect(stripQuotesFromPathEnv({}).PATH).toBeUndefined();
  });
});

// ============================================================
// normalize：JUnit XML 判卷矩阵
// ============================================================

function normalizeWithXml(plan: GatePlan, xml: string, observedVersion?: string): ReturnType<typeof adapter.normalize> {
  const { spawn } = spawnSequence([
    { stdout: observedVersion === undefined ? `pytest ${plan.toolVersion}` : `pytest ${observedVersion}` },
    { stdout: xml },
  ]);
  return adapter.normalize(adapter.run(plan, spawn), {});
}

describe("pytest 腿 normalize：七态判卷", () => {
  it("全绿（1 passed）→ passed；counts 用例粒度 1/1/0/0；blindspot 载体粒度 1/1/0", () => {
    const record = normalizeWithXml(
      makePytestPlan(),
      junitReport([{ status: "passed" }]),
    );
    expect(record.verdict).toBe("passed");
    expect(record.verdictCapReason).toBeNull();
    expect(record.counts).toEqual({
      scanned: 1,
      applicableScanned: 1,
      violations: 0,
      notApplicable: 0,
    });
    expect(record.blindspot).toEqual({ scanned: 1, produced: 1, escapeRatio: 0 });
  });

  it("一过一挂 → failed；violations 从 <testcase> 逐条重算=1；asserted=testsuite failures 属性（孪生同源）", () => {
    const record = normalizeWithXml(
      makePytestPlan(),
      junitReport([{ status: "passed" }, { status: "failed" }]),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.counts.scanned).toBe(2);
    expect(record.trust.asserted?.value.violations).toBe(1);
    expect(record.trust.recomputed).toEqual({ violations: 1, matchesAsserted: true });
    expect(record.trust.asserted?.claimedBy.actor).toBe("gauntlet:pytest@8.3.4");
  });

  it("自报撒谎（failures=\"0\" 实挂 1）→ mismatch.detected + recomputed_wins_recorded；failed 不被 cap 洗白", () => {
    const record = normalizeWithXml(
      makePytestPlan(),
      junitReport([{ status: "failed" }], { failures: 0 }),
    );
    expect(record.trust.recomputed.violations).toBe(1);
    expect(record.trust.mismatch).toEqual({
      detected: true,
      action: "recomputed_wins_recorded",
    });
    expect(record.verdict).toBe("failed");
    expect(record.verdictCapReason).toBeNull();
  });

  it("全 skipped → verdict=skipped_blindspot 且盲区指标必附（uncheckedInBlindspotEstimated=skip 数，铁律四态纪律）", () => {
    const record = normalizeWithXml(
      makePytestPlan(),
      junitReport([
        { classname: "test_a", status: "skipped" },
        { classname: "test_a", status: "skipped" },
      ]),
    );
    expect(record.verdict).toBe("skipped_blindspot");
    expect(record.counts.notApplicable).toBe(2);
    expect(record.counts.applicableScanned).toBe(0);
    expect(record.counts.uncheckedInBlindspotEstimated).toBe(2);
    // C3 封条合规位：skipped_blindspot 必附盲区证据引用（指向计数词形，非虚构 fixture 名）。
    expect(record.blindspot).toEqual({
      scanned: 1,
      produced: 0,
      escapeRatio: 1,
      fixtureRegression: "PYTEST_ALL_SKIPPED/unchecked_in_blindspot_estimated=2",
    });
    // 03 schema 复验：附上盲区指标 + fixture_regression 证据引用的 skipped_blindspot 是
    // 合法文档（缺指标会被 kernel 入账层 FATAL；缺证据引用会被 03 allOf 封条拒绝）。
    const ajv = new Ajv({ strictSchema: false });
    addFormats(ajv);
    const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("非法 XML（未闭合 testcase）→ not_run（判卷不可能，禁猜测）", () => {
    expect(parseJUnitXml("<testsuite><testcase classname=\"a\">")).toBeNull();
    const record = normalizeWithXml(makePytestPlan(), "<testsuite><testcase classname=\"a\">");
    expect(record.verdict).toBe("not_run");
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
  });

  it("观测版本 ≠ policy 锚 → warning + tool_version_drifted；record.toolVersion 落观测值（实际执行的工具）", () => {
    const record = normalizeWithXml(
      makePytestPlan("8.3.4"),
      junitReport([{ status: "passed" }]),
      "9.1.1",
    );
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe("tool_version_drifted");
    expect(record.toolVersion).toBe("9.1.1");
  });

  it("口径透传：record 携带 gauntlet:pytest / BUILD / test:assertion_count / grn / ranAtSeq", () => {
    const record = normalizeWithXml(
      makePytestPlan(),
      junitReport([{ status: "passed" }]),
    );
    expect(record.tool).toBe("gauntlet:pytest");
    expect(record.toolVersion).toBe("8.3.4");
    expect(record.gate).toBe("BUILD");
    expect(record.gateDef).toBe("POLICY.GATE.BUILD@0.1.0");
    expect(record.metricDialect).toBe("test:assertion_count");
    expect(record.grn).toBe("GRN-71");
    expect(record.ranAtSeq).toBe(71);
  });
});

// ============================================================
// 真实 pytest e2e（自建最小 fixture 工程；宿主无 pytest → skip + 盲区说明）
// ============================================================

describe("pytest 腿真实 e2e（临时 fixture 工程）", () => {
  it("宿主有 pytest：1 过 1 挂两用例全链路 → failed violations=1，产物过 03 schema", { timeout: 120_000 }, (ctx) => {
    if (HOST_PYTEST_SEMVER === null) {
      // 诚实缺席说明：宿主无 python -m pytest（或探测 spawn 失败）——本用例跳过，
      // 判卷矩阵已由 JUnit XML 夹具覆盖；真实子进程链路的缺席是显式盲区，不是通过。
      console.warn(
        "[盲区说明] 宿主无 python -m pytest —— pytest 腿真实 e2e 跳过（诚实缺席，非通过）",
      );
      ctx.skip();
    }
    // 最小 fixture 工程：pytest.ini + 1 过 1 挂两用例（任务点名形态）。
    const root = mkdtempSync(join(tmpdir(), "pomaster-gauntlet-pytest-e2e-"));
    writeFileSync(join(root, "pytest.ini"), PYTEST_INI, "utf8");
    writeFileSync(
      join(root, "test_sample.py"),
      "def test_ok():\n    assert 1 + 1 == 2\n\n\ndef test_broken():\n    assert 1 + 1 == 3\n",
      "utf8",
    );
    // 版本锚用宿主实测版本（探测与判卷同源，不制造人为漂移）。
    const plan = adapter.prepare(
      { projectRoot: root },
      { grn: "GRN-77", ranAtSeq: 77, expectedToolVersion: HOST_PYTEST_SEMVER ?? "0.0.0" },
      pytestProjectFacts(),
    );
    // 真实 run：不注入 spawnFn → 默认 pytestSpawn（PATH 游离引号消毒生效路径）。
    const raw: ToolRunOutput = adapter.run(plan);
    const record = adapter.normalize(raw, {});
    expect(raw.kind).toBe("executed");
    expect(record.verdict).toBe("failed");
    expect(record.counts.scanned).toBe(2);
    expect(record.counts.violations).toBe(1);
    expect(record.counts.notApplicable).toBe(0);
    expect(record.toolVersion).toBe(HOST_PYTEST_SEMVER);
    const ajv = new Ajv({ strictSchema: false });
    addFormats(ajv);
    const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);
    const doc = toGateResultJson(record);
    if (!validate(doc)) {
      console.error(validate.errors);
    }
    expect(validate(doc)).toBe(true);
  });
});
