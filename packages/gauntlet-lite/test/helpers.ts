/**
 * 测试夹具工厂（非 .spec.ts，不被 vitest 收集；仅供本包 spec 复用）。
 * 全部 fake 零 I/O：假 PATH / 假配置目录 / 假 spawn / vitest JSON 报告生成器。
 */
import type {
  DetectorFacts,
  GatePlan,
  SpawnFn,
  SpawnOutcome,
  ToolRunOutput,
} from "../src/adapter-types.js";
import { createBuildAdapter } from "../src/build-adapter.js";

// ------------------------------------------------------------
// DetectorFacts fake：files 映射即文件系统（key=joinPath 结果），pathEnv 即 PATH
// ------------------------------------------------------------

export function posixJoin(base: string, rel: string): string {
  return base.endsWith("/") ? `${base}${rel}` : `${base}/${rel}`;
}

export interface FakeProject {
  /** 路径 → 文本内容；null/缺省 = 仅存在（可执行占位）或不存在（undefined）。 */
  readonly files: Readonly<Record<string, string | null>>;
  readonly pathEnv?: string | null;
}

export function fakeFacts(projectRoot: string, project: FakeProject): DetectorFacts {
  return {
    projectRoot,
    pathEnv: project.pathEnv ?? null,
    pathSeparator: ";",
    executableSuffixes: ["", ".exe", ".cmd"],
    joinPath: posixJoin,
    fileExists: (p) => p in project.files,
    readTextFile: (p) => project.files[p] ?? null,
  };
}

export function packageJsonWithVitest(versionRange = "^2.1.8"): string {
  return JSON.stringify({ devDependencies: { vitest: versionRange } });
}

// ------------------------------------------------------------
// vitest JSON reporter（jest 兼容形态）生成器
// ------------------------------------------------------------

export type AssertionStatus = "passed" | "failed" | "pending" | "skipped" | "todo";

export interface FakeVitestFile {
  readonly name?: string;
  readonly assertions: readonly AssertionStatus[];
}

export interface VitestReportOverrides {
  /** 篡改自报汇总模拟撒谎工具；null = 删除字段（工具未自报）。 */
  readonly numFailedTests?: number | null;
}

function countStatus(statuses: readonly AssertionStatus[], wanted: AssertionStatus): number {
  return statuses.filter((s) => s === wanted).length;
}

export function vitestReport(
  files: readonly FakeVitestFile[],
  overrides: VitestReportOverrides = {},
): string {
  const all = files.flatMap((f) => f.assertions);
  const numPassedTests = countStatus(all, "passed");
  const numFailedTests = countStatus(all, "failed");
  const numPendingTests = countStatus(all, "pending");
  const numTodoTests = countStatus(all, "todo");
  const doc: Record<string, unknown> = {
    numTotalTestSuites: files.length,
    numPassedTestSuites: numFailedTests === 0 ? files.length : 0,
    numFailedTestSuites: numFailedTests > 0 ? 1 : 0,
    numPendingTestSuites: 0,
    numTotalTests: all.length,
    numPassedTests,
    numFailedTests,
    numPendingTests,
    numTodoTests,
    success: numFailedTests === 0,
    // A4：夹具内墙钟字段固定 0——测试输入字节稳定，绝不成为判卷输入。
    startTime: 0,
    testResults: files.map((f, fileIndex) => {
      const failed = countStatus(f.assertions, "failed");
      return {
        name: f.name ?? `src/module-${fileIndex}.spec.ts`,
        status: failed > 0 ? "failed" : "passed",
        startTime: 0,
        endTime: 0,
        message: "",
        assertionResults: f.assertions.map((status, i) => ({
          ancestorTitles: [],
          fullName: `spec ${fileIndex}.${i}`,
          title: `case-${i}`,
          status,
          durationMs: 1,
          failureMessages: [],
          meta: {},
        })),
      };
    }),
  };
  if (overrides.numFailedTests !== undefined) {
    if (overrides.numFailedTests === null) {
      delete doc["numFailedTests"];
    } else {
      doc["numFailedTests"] = overrides.numFailedTests;
    }
  }
  return JSON.stringify(doc);
}

// ------------------------------------------------------------
// pytest JUnit XML 报告生成器（pytest --junitxml 词形；normalize 输入与真实产物同构）
// ------------------------------------------------------------

export type JUnitCase = {
  readonly classname?: string;
  readonly name?: string;
  readonly status: "passed" | "failed" | "skipped";
};

/** 生成最小 JUnit XML（testsuite 属性自报汇总 = CLAIMED 攻击面；overrides 可撒谎）。 */
export function junitReport(
  cases: readonly JUnitCase[],
  overrides: { failures?: number | null; errors?: number | null } = {},
): string {
  const failed = cases.filter((c) => c.status === "failed").length;
  const skipped = cases.filter((c) => c.status === "skipped").length;
  // null = 删除自报属性（工具未自报的诚实形态）。
  const failuresAttr =
    overrides.failures === null ? "" : ` failures="${overrides.failures ?? failed}"`;
  const errorsAttr =
    overrides.errors === null ? "" : ` errors="${overrides.errors ?? 0}"`;
  const testcaseXml = cases
    .map((c, index) => {
      const classname = c.classname ?? "test_sample";
      const name = c.name ?? `test_case_${index}`;
      if (c.status === "passed") {
        return `<testcase classname="${classname}" name="${name}" time="0.001"/>`;
      }
      if (c.status === "failed") {
        return `<testcase classname="${classname}" name="${name}" time="0.001"><failure message="assert 1 == 2">AssertionError</failure></testcase>`;
      }
      return `<testcase classname="${classname}" name="${name}" time="0.001"><skipped type="pytest.skip" message="skip it">Skipped</skipped></testcase>`;
    })
    .join("\n");
  // A4：JUnit 的 time/timestamp 属耗时统计（03 的 digest 排除字段族），夹具固定词形零墙钟。
  const suiteAttrs = `skipped="${skipped}" tests="${cases.length}"${failuresAttr}${errorsAttr}`;
  return `<?xml version="1.0" encoding="utf-8"?>\n<testsuites><testsuite name="pytest"${suiteAttrs} time="0.010">\n${testcaseXml}\n</testsuite></testsuites>\n`;
}

// ------------------------------------------------------------
// spawn fake 与 plan/raw 工厂
// ------------------------------------------------------------

export function fakeSpawn(outcome: Partial<SpawnOutcome>): SpawnFn {
  return () => ({
    status: 0,
    stdout: "",
    stderr: "",
    error: null,
    externalMs: 5,
    ...outcome,
  });
}

/** 记录入参的 spawn fake：calls[n] = {command, options}。 */
export function recordingSpawn(outcome: Partial<SpawnOutcome>): {
  spawn: SpawnFn;
  calls: { command: string; options: { cwd: string; timeoutMs: number } }[];
} {
  const calls: { command: string; options: { cwd: string; timeoutMs: number } }[] = [];
  const spawn: SpawnFn = (command, options) => {
    calls.push({ command, options });
    return {
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      externalMs: 5,
      ...outcome,
    };
  };
  return { spawn, calls };
}

export const VITEST_PROJECT_ROOT = "D:/fake-proj";

/** 标准可执行 vitest 项目事实源（package.json 声明 vitest ^2.1.8）。 */
export function vitestProjectFacts(
  extraFiles: Readonly<Record<string, string | null>> = {},
): DetectorFacts {
  return fakeFacts(VITEST_PROJECT_ROOT, {
    files: {
      [posixJoin(VITEST_PROJECT_ROOT, "package.json")]: packageJsonWithVitest(),
      ...extraFiles,
    },
  });
}

/** 标准执行计划（经 prepare 产出，保证与真实链路同源）。 */
export function makePlan(
  policyOverrides: Partial<{
    grn: string;
    ranAtSeq: number;
    expectedToolVersion: string | null;
  }> = {},
): GatePlan {
  const adapter = createBuildAdapter();
  return adapter.prepare(
    { projectRoot: VITEST_PROJECT_ROOT },
    {
      grn: policyOverrides.grn ?? "GRN-1",
      ranAtSeq: policyOverrides.ranAtSeq ?? 7,
      expectedToolVersion: policyOverrides.expectedToolVersion ?? null,
    },
    vitestProjectFacts(),
  );
}

/** 经 run 产出 ToolRunOutput（注入 fake spawn，保证与真实链路同源）。 */
export function runWith(
  plan: GatePlan,
  outcome: Partial<SpawnOutcome>,
): ToolRunOutput {
  const adapter = createBuildAdapter();
  return adapter.run(plan, fakeSpawn(outcome));
}
