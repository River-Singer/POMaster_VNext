/**
 * maven 腿 spec（BE-1：BUILD 门禁 Maven Surefire 腿 + COVERAGE 门禁 JaCoCo 腿解析）。
 *
 * 覆盖：pom.xml 探测 / prepare 版本锚契约（mvn 版本无法从 pom 可靠探测——policy 供给）/
 * run 双 spawn（mvn --version 探测 + mvn -B test 实跑 + TEST-*.xml 回读拼装）/ surefire
 * XML 判卷矩阵（全绿 / 一过一挂 / 自报撒谎 / 全 skipped→skipped_blindspot / 非法 XML→
 * not_run，legLabel=maven 文案不冒用 pytest 词形）/ jacoco XML 行分支双口径解析。
 */
import { describe, expect, it } from "vitest";
import {
  SUREFIRE_RUN_COMMAND,
  SUREFIRE_TOOL_ID,
  createBuildAdapter,
  parseJacocoXml,
  type DetectorFacts,
  type GatePlan,
  type SpawnFn,
  type ToolRunOutput,
} from "@pomaster/gauntlet-lite";
import { fakeFacts, junitReport, posixJoin, VITEST_PROJECT_ROOT } from "./helpers.js";

const adapter = createBuildAdapter();

// ============================================================
// 夹具：maven 项目 facts / 计划 / spawn 序列 fake
// ============================================================

function mavenProjectFacts(): DetectorFacts {
  return fakeFacts(VITEST_PROJECT_ROOT, {
    files: { [posixJoin(VITEST_PROJECT_ROOT, "pom.xml")]: "<project><build></build></project>" },
  });
}

function makeMavenPlan(expectedToolVersion = "3.9.6"): GatePlan {
  return adapter.prepare(
    { projectRoot: VITEST_PROJECT_ROOT },
    { grn: "GRN-81", ranAtSeq: 81, expectedToolVersion },
    mavenProjectFacts(),
  );
}

/** 顺序应答的 spawn fake（pytest-adapter 同款）。 */
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
// prepare：版本锚契约 + 探测
// ============================================================

describe("maven 腿 prepare 与探测", () => {
  it("pom.xml 在座：计划携带 mvn -B test + policy 版本锚 + BUILD 口径锚", () => {
    const plan = makeMavenPlan("3.9.6");
    expect(plan.runner).toBe("maven");
    expect(plan.command).toBe(SUREFIRE_RUN_COMMAND);
    expect(plan.tool).toBe(SUREFIRE_TOOL_ID);
    expect(plan.toolVersion).toBe("3.9.6");
    expect(plan.gate).toBe("BUILD");
    expect(plan.metricDialect).toBe("test:assertion_count");
    expect(plan.grn).toBe("GRN-81");
    expect(plan.ranAtSeq).toBe(81);
  });

  it("pom.xml 缺席：探测 NOT_INSTALLED（缺席理由 + 安装路标，禁静默）", () => {
    const detection = adapter.detect(fakeFacts(VITEST_PROJECT_ROOT, { files: {} }));
    expect(detection.maven.status).toBe("NOT_INSTALLED");
    expect(detection.maven.reason).toContain("pom.xml");
  });

  it("缺版本锚 → runner_not_ready（maven 版本无法从 pom 可靠探测，禁伪造 semver）", () => {
    expect(() =>
      adapter.prepare(
        { projectRoot: VITEST_PROJECT_ROOT },
        { grn: "GRN-82", ranAtSeq: 82, expectedToolVersion: null },
        mavenProjectFacts(),
      ),
    ).toThrowError(/expectedToolVersion/);
  });
});

// ============================================================
// run：双 spawn（版本探测 + mvn -B test 实跑）
// ============================================================

describe("maven 腿 run", () => {
  it("两次 spawn：先 mvn --version 后 mvn -B test；观测版本从 stdout 提取", () => {
    const plan = makeMavenPlan("3.9.6");
    const { spawn, calls } = spawnSequence([
      { stdout: "Apache Maven 3.9.6 (bc0240f)" },
      { stdout: junitReport([{ status: "passed" }]) },
    ]);
    const raw = adapter.run(plan, spawn);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.command).toBe("mvn --version");
    expect(calls[1]?.command).toBe(SUREFIRE_RUN_COMMAND);
    expect(calls[1]?.options.cwd).toBe(VITEST_PROJECT_ROOT);
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("3.9.6");
  });

  it("版本探测 spawn 失败 → kind=spawn_failed（normalize 落 not_run，文案如实 maven 不冒用 pytest）", () => {
    const plan = makeMavenPlan();
    const { spawn } = spawnSequence([{ status: null, error: "spawn mvn ENOENT" }]);
    const raw = adapter.run(plan, spawn);
    expect(raw.kind).toBe("spawn_failed");
    expect(raw.failureReason).toMatch(/maven 版本探测失败/);
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/maven 版本探测失败/);
    expect(record.scopeNote).not.toMatch(/pytest/);
  });
});

// ============================================================
// normalize：surefire XML 判卷矩阵（JUnit 家族 walker 单一锚）
// ============================================================

function executedWith(xml: string): ToolRunOutput {
  const plan = makeMavenPlan();
  return { plan, kind: "executed", exitCode: 0, stdout: xml, stderr: "", externalMs: 12, failureReason: null, observedToolVersion: "3.9.6" };
}

describe("maven 腿 normalize（surefire XML 判卷矩阵）", () => {
  it("全绿：recomputed 逐用例重算 → passed；asserted 孪生在座", () => {
    const record = adapter.normalize(
      executedWith(junitReport([{ status: "passed" }, { status: "passed" }])),
      {},
    );
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    expect(record.trust.asserted?.value.violations).toBe(0);
    expect(record.trust.recomputed).toEqual({ violations: 0, matchesAsserted: true });
  });

  it("一过一挂：violations=1 → failed", () => {
    const record = adapter.normalize(
      executedWith(junitReport([{ status: "passed" }, { status: "failed" }])),
      {},
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
  });

  it("自报撒谎（属性 failures=0 但用例挂）→ recomputed wins + mismatch 记录", () => {
    const record = adapter.normalize(
      executedWith(junitReport([{ status: "failed" }], { failures: 0 })),
      {},
    );
    expect(record.verdict).toBe("failed");
    expect(record.trust.recomputed.matchesAsserted).toBe(false);
  });

  it("全 skipped → skipped_blindspot + 盲区指标必附（C1 同线）", () => {
    const record = adapter.normalize(
      executedWith(junitReport([{ status: "skipped" }, { status: "skipped" }])),
      {},
    );
    expect(record.verdict).toBe("skipped_blindspot");
  });

  it("非法 XML → not_run（maven 腿文案，不冒用 pytest 词形）", () => {
    const record = adapter.normalize(executedWith("<<<not xml>>>"), {});
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("maven 腿输出不可判卷");
    expect(record.scopeNote).not.toMatch(/pytest 腿/);
  });
});

// ============================================================
// jacoco XML 解析（行/分支双口径；report 级 counter 殿后布局）
// ============================================================

const JACOCO_XML = [
  '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "jacoco.dtd">',
  '<report name="demo">',
  '<package name="com/demo">',
  '<sourcefile name="Orders.java">',
  '<counter type="INSTRUCTION" missed="10" covered="90"/>',
  '<counter type="LINE" missed="2" covered="18"/>',
  '<counter type="COMPLEXITY" missed="1" covered="5"/>',
  '<counter type="BRANCH" missed="4" covered="6"/>',
  '</sourcefile>',
  '</package>',
  '<counter type="INSTRUCTION" missed="20" covered="180"/>',
  '<counter type="BRANCH" missed="8" covered="12"/>',
  '<counter type="LINE" missed="4" covered="36"/>',
  '</report>',
].join("\n");

describe("jacoco XML 解析（BE-1）", () => {
  it("行/分支双口径：report 级 counter = 总判卷锚；sourcefile = 逐文件分母", () => {
    const parsed = parseJacocoXml(JACOCO_XML);
    expect(parsed).not.toBeNull();
    expect(parsed?.linesPct).toBeCloseTo((36 / 40) * 100, 5);
    expect(parsed?.branchesPct).toBeCloseTo((12 / 20) * 100, 5);
    const file = parsed?.files.get("Orders.java");
    expect(file?.linesPct).toBeCloseTo((18 / 20) * 100, 5);
    expect(file?.branchesPct).toBeCloseTo((6 / 10) * 100, 5);
  });

  it("缺 report 级 counter / 非法文本 → null（判卷不可能，禁默认值）", () => {
    expect(parseJacocoXml("not jacoco")).toBeNull();
    expect(parseJacocoXml('<report name="x"><sourcefile name="A.java"/></report>')).toBeNull();
  });
});
