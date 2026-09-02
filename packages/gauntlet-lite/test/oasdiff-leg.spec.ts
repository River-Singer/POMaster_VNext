/**
 * oasdiff-leg.spec.ts —— CONTRACT oasdiff breaking-change diff 执行腿（P22 / gaps A6）。
 *
 * 覆盖（三态 + 判卷矩阵 + 三道闸 + 真实子进程链路）：
 * - detect/prepare：breakingDiff 声明 + oasdiff 在位 → READY/declared；oasdiff 缺席 →
 *   NOT_INSTALLED / plan.absenceKind=tool_absent → 全链 not_run（非绿非红）；版本锚缺失
 *   → runner_not_ready（pytest 腿同款）；两口径混声明 → NOT_INSTALLED（互斥）；
 * - run/normalize 判卷矩阵（fake spawn 注入）：exit 1 + JSON 明细 → failed violations=N +
 *   items；exit 0 + 空 stdout → passed；exit 1 + 不可解析（损坏工具词形）→ not_run（I2）；
 *   exit 1 + 可解析但空明细 → failed 下限 1（诚实下限，输出词形合法前提）；exit 7 →
 *   not_run；gate ①a 可执行体缺席 / gate ①b 版本探测收紧（退出 0 且 semver 词形）失败 →
 *   not_run；exit 0 + 明细>0 矛盾 → failed（重算权威）；版本漂移 → passed 降 warning
 *   （failed 不洗白）；
 * - 真实子进程（fake oasdiff 脚本 × 真实 spawnSync 两段式，零安装零网络）：clean → passed、
 *   breaking → failed、garbage → not_run（I2 损坏工具形态）、emptyBreaking → failed 下限；
 * - 宿主 oasdiff 在场 e2e（临时目录构造旧/新 OpenAPI 对——删除必填字段 / 改类型两种
 *   breaking 形态 + 非 breaking 对照；宿主未装则 skip + 盲区说明——诚实缺席）；
 * - 三态 truth-index 记录互异（failed / passed / not_run 三份记录逐字段不同 + 过 03 schema）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  OASDIFF_METRIC_DIALECT,
  OASDIFF_TOOL_ID,
  createContractAdapter,
  detectOasdiff,
  extractBreakingChanges,
  normalizeOasdiffLeg,
  platformDetectorFacts,
  runOasdiffLeg,
  stripQuotesFromPathEnv,
  toGateResultJson,
  type DetectorFacts,
  type GatePolicy,
  type GateResultRecord,
  type OasdiffLegPlan,
  type SpawnFn,
  type SpawnOutcome,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const TOOL_DIR = "C:/tools";

function policy(expectedToolVersion = "2.2.0"): GatePolicy {
  return { grn: "GRN-1701", ranAtSeq: 1701, trigger: "on_demand", expectedToolVersion };
}

/** oasdiff 在位的 fake facts（PATH 命中可执行占位）。 */
function oasdiffFacts(extraFiles: Record<string, string | null> = {}): DetectorFacts {
  return fakeFacts("D:/contract-proj", {
    pathEnv: TOOL_DIR,
    files: {
      [posixJoin(TOOL_DIR, "oasdiff")]: null,
      ...extraFiles,
    },
  });
}

/** 按 spawn 次数分派的 fake（第 1 次 = 版本探测，第 2 次 = breaking diff 真跑）。 */
function scriptedSpawn(probe: Partial<SpawnOutcome>, run: Partial<SpawnOutcome>): SpawnFn {
  let call = 0;
  return () => {
    call += 1;
    const base = call === 1 ? probe : run;
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

const BREAKING_JSON = JSON.stringify({
  "path-params-deleted": [
    { path: "/users/{id}", method: "GET", source: "spec/openapi.base.yaml" },
  ],
  "response-property-type-changed": [
    { path: "/users", method: "POST", property: "age", from: "integer", to: "string" },
  ],
});

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

/** 全链路：prepare（真实探测注入）→ run（spawn 注入）→ normalize。 */
function fullPipeline(
  facts: DetectorFacts,
  spawn: SpawnFn,
  gatePolicy: GatePolicy = policy(),
): GateResultRecord {
  const adapter = createContractAdapter({
    // gate ①a 可执行体探测注入 fake（宿主 PATH 无 oasdiff——判卷矩阵与宿主环境无关；
    // 探测闸自身行为由下方「可执行体探测」用例专测）。
    oasdiffExecutableProbe: () => "C:/fake/oasdiff-on-path",
  });
  const plan = adapter.prepare({ projectRoot: facts.projectRoot }, gatePolicy, facts);
  const raw = adapter.run(plan, spawn);
  return adapter.normalize(raw, {});
}

// ============================================================
// detect / prepare / 缺席语义
// ============================================================

describe("contract breaking_diff 腿：detect 与 prepare", () => {
  it("breakingDiff 声明 + oasdiff 在位 → READY（tool=gauntlet:oasdiff，evidence 合流）", () => {
    const detection = createContractAdapter().detect(
      oasdiffFacts({
        [posixJoin("D:/contract-proj", "contract-gate.json")]: JSON.stringify({
          openapi: "spec/openapi.yaml",
          breakingDiff: { base: "spec/openapi.base.yaml" },
        }),
      }),
    );
    expect(detection.status).toBe("READY");
    if (detection.status === "READY") {
      expect(detection.tool).toBe(OASDIFF_TOOL_ID);
      expect(detection.evidence).toContain("breaking_diff");
      expect(detection.evidence).toContain("PATH 命中");
    }
  });

  it("breakingDiff 声明 + oasdiff 缺席 → NOT_INSTALLED + 安装指引（禁静默）", () => {
    const detection = createContractAdapter().detect(
      fakeFacts("D:/contract-proj", {
        files: {
          [posixJoin("D:/contract-proj", "contract-gate.json")]: JSON.stringify({
            openapi: "spec/openapi.yaml",
            breakingDiff: { base: "spec/openapi.base.yaml" },
          }),
        },
      }),
    );
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/oasdiff/);
      expect(detection.installHint).toMatch(/npm install -g oasdiff|brew install oasdiff/);
    }
  });

  it("breakingDiff 与 expectedOperationIds 混声明 → NOT_INSTALLED（口径互斥）", () => {
    const detection = createContractAdapter().detect(
      oasdiffFacts({
        [posixJoin("D:/contract-proj", "contract-gate.json")]: JSON.stringify({
          openapi: "spec/openapi.yaml",
          breakingDiff: { base: "spec/openapi.base.yaml" },
          expectedOperationIds: ["getUser"],
        }),
      }),
    );
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/互斥/);
    }
  });

  it("oasdiff 在位 → declared=true + mode=breaking_diff + oasdiffPlan 命令形态（--format json）", () => {
    const adapter = createContractAdapter();
    const plan = adapter.prepare(
      { projectRoot: "D:/contract-proj" },
      policy(),
      oasdiffFacts({
        [posixJoin("D:/contract-proj", "contract-gate.json")]: JSON.stringify({
          openapi: "spec/openapi.yaml",
          breakingDiff: { base: "spec/openapi.base.yaml" },
        }),
      }),
    );
    expect(plan.declared).toBe(true);
    expect(plan.mode).toBe("breaking_diff");
    expect(plan.breakingBasePath).toBe("spec/openapi.base.yaml");
    expect(plan.oasdiffPlan?.command).toContain("breaking --format json");
    expect(plan.oasdiffPlan?.expectedToolVersion).toBe("2.2.0");
  });

  it("版本锚缺失（policy.expectedToolVersion=null）→ GateAdapterError runner_not_ready", () => {
    const adapter = createContractAdapter();
    expect(() =>
      adapter.prepare(
        { projectRoot: "D:/contract-proj" },
        { grn: "GRN-1", ranAtSeq: 1 },
        oasdiffFacts({
          [posixJoin("D:/contract-proj", "contract-gate.json")]: JSON.stringify({
            openapi: "spec/openapi.yaml",
            breakingDiff: { base: "spec/openapi.base.yaml" },
          }),
        }),
      ),
    ).toThrowError(/runner_not_ready.*expectedToolVersion/s);
  });
});

// ============================================================
// 三态之一：oasdiff 缺席 → not_run（非绿非红）
// ============================================================

describe("contract breaking_diff 腿：工具缺席 not_run", () => {
  it("全链路 → verdict=not_run + scopeNote 带安装路标 + counts 显式全零", () => {
    const record = fullPipeline(
      fakeFacts("D:/contract-proj", {
        files: {
          [posixJoin("D:/contract-proj", "contract-gate.json")]: JSON.stringify({
            openapi: "spec/openapi.yaml",
            breakingDiff: { base: "spec/openapi.base.yaml" },
          }),
        },
      }),
      scriptedSpawn({}, {}),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/oasdiff/);
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(validate(toGateResultJson(record))).toBe(true);
  });
});

// ============================================================
// run/normalize 判卷矩阵（fake spawn）
// ============================================================

const READY_FACTS = () =>
  oasdiffFacts({
    [posixJoin("D:/contract-proj", "contract-gate.json")]: JSON.stringify({
      openapi: "spec/openapi.yaml",
      breakingDiff: { base: "spec/openapi.base.yaml" },
    }),
  });

describe("oasdiff 腿判卷矩阵", () => {
  it("三态① breaking change 抓红：exit 1 + JSON 明细 → failed violations=明细数 + items", () => {
    const record = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 2.2.0" },
        { status: 1, stdout: BREAKING_JSON },
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.items).toHaveLength(2);
    expect(record.items?.every((item) => item.rule === "oasdiff_breaking_change")).toBe(true);
    expect(record.items?.[0]?.location).toContain("spec/openapi.yaml#");
    expect(record.metricDialect).toBe(OASDIFF_METRIC_DIALECT);
    expect(record.tool).toBe(OASDIFF_TOOL_ID);
    expect(record.toolVersion).toBe("2.2.0");
    const doc = toGateResultJson(record);
    if (!validate(doc)) console.error(validate.errors);
    expect(validate(doc)).toBe(true);
  });

  it("三态② 非 breaking：exit 0 + 空 stdout → passed（scopeNote 留 exit 语义）", () => {
    const record = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 2.2.0" },
        { status: 0, stdout: "" },
      ),
    );
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    expect(record.scopeNote).toMatch(/无 breaking changes/);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("exit 1 + 明细不可解析（损坏工具词形）→ not_run（I2：诚实下限只属输出词形合法场景）", () => {
    const record = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 2.2.0" },
        { status: 1, stdout: "panic: runtime error (非 JSON)" },
      ),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.counts.violations).toBe(0);
    expect(record.scopeNote).toMatch(/不可解析/);
    expect(record.scopeNote).toMatch(/损坏工具/);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("exit 1 + 明细可解析但为空 → failed violations=1（诚实下限：官方退出码已证有 breaking）", () => {
    const record = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 2.2.0" },
        { status: 1, stdout: "{}" },
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.scopeNote).toMatch(/下限/);
  });

  it("exit 7（工具执行错误/spec 加载失败）→ not_run + stderr 摘录", () => {
    const record = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 2.2.0" },
        { status: 7, stdout: "", stderr: "could not load spec" },
      ),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/工具执行错误/);
    expect(record.scopeNote).toContain("could not load spec");
  });

  it("版本探测失败 → not_run（spawn_failed，禁猜测版本口径）", () => {
    const record = fullPipeline(
      READY_FACTS(),
      scriptedSpawn({ status: null, error: "spawn ENOENT" }, {}),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/版本探测失败/);
  });

  it("gate ①a 可执行体不在 PATH → spawn_failed → not_run（I2 三道闸对齐，spawn 前先证在位）", () => {
    const adapter = createContractAdapter({ oasdiffExecutableProbe: () => null });
    const plan = adapter.prepare(
      { projectRoot: "D:/contract-proj" },
      policy(),
      READY_FACTS(),
    );
    const raw = adapter.run(
      plan,
      scriptedSpawn({ status: 0, stdout: "oasdiff 2.2.0" }, { status: 0, stdout: "" }),
    );
    expect(raw.outcome).toBe("breaking_diff");
    if (raw.outcome === "breaking_diff") {
      expect(raw.leg.kind).toBe("spawn_failed");
      expect(raw.leg.failureReason).toMatch(/不在 PATH/);
    }
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("not_run");
  });

  it("gate ①b 版本探测收紧（退出 0 无版本词形 / 非零退出）→ not_run（I2：损坏工具禁真跑）", () => {
    const noSemver = fullPipeline(
      READY_FACTS(),
      scriptedSpawn({ status: 0, stdout: "no version here" }, { status: 0, stdout: "" }),
    );
    expect(noSemver.verdict).toBe("not_run");
    expect(noSemver.scopeNote).toMatch(/版本探测失败/);
    expect(noSemver.scopeNote).toMatch(/损坏/);

    const nonzero = fullPipeline(
      READY_FACTS(),
      scriptedSpawn({ status: 1, stdout: "", stderr: "command not found" }, {}),
    );
    expect(nonzero.verdict).toBe("not_run");
    expect(nonzero.scopeNote).toMatch(/版本探测失败/);
  });

  it("exit 0 但 JSON 有明细（矛盾形态）→ failed（C5 重算权威）", () => {
    const record = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 2.2.0" },
        { status: 0, stdout: BREAKING_JSON },
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
  });

  it("版本漂移（观测 3.0.1 ≠ 锚 2.2.0）→ passed 降 warning；failed 不被 cap 洗白", () => {
    const drifted = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 3.0.1" },
        { status: 0, stdout: "" },
      ),
    );
    expect(drifted.verdict).toBe("warning");
    expect(drifted.verdictCapReason).toBe("tool_version_drifted");
    const failedWithDrift = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 3.0.1" },
        { status: 1, stdout: BREAKING_JSON },
      ),
    );
    expect(failedWithDrift.verdict).toBe("failed");
    expect(failedWithDrift.verdictCapReason).toBeNull();
  });
});

// ============================================================
// 明细宽容提取器（版本形态漂移防御）
// ============================================================

describe("extractBreakingChanges", () => {
  it("对象树 / 数组 / 字符串叶三种词形都收集；非 JSON → null", () => {
    const nested = extractBreakingChanges(
      JSON.stringify({ a: { b: ["one", "two"] }, c: "three" }),
      "spec/openapi.yaml",
    );
    expect(nested).toHaveLength(3);
    expect(nested?.[0]?.location).toBe("spec/openapi.yaml#a.b");
    const flatArray = extractBreakingChanges(
      JSON.stringify(["plain one", "plain two"]),
      "spec/openapi.yaml",
    );
    expect(flatArray).toHaveLength(2);
    expect(extractBreakingChanges("not json", "x")).toBeNull();
    expect(extractBreakingChanges("null", "x")).toBeNull();
  });
});

// ============================================================
// 真实子进程链路（fake oasdiff 脚本 × 真实 spawnSync；零安装零网络）
// ============================================================

const FAKE_OASDIFF_CJS = `const mode = process.env.FAKE_OASDIFF_MODE ?? "clean";
if (process.argv.includes("--version")) {
  process.stdout.write("oasdiff 2.2.0\\n");
  process.exit(0);
}
const payloads = {
  clean: { code: 0, body: "" },
  breaking: {
    code: 1,
    body: JSON.stringify({
      "response-property-type-changed": [
        { path: "/users", method: "POST", property: "age", from: "integer", to: "string" },
      ],
    }),
  },
  garbage: { code: 1, body: "panic: not json" },
  emptyBreaking: { code: 1, body: "{}" },
};
const payload = payloads[mode] ?? payloads.clean;
process.stdout.write(payload.body);
process.exit(payload.code);
`;

/** 真实 spawnSync wrapper（与 oasdiffSpawn 同参数形态 + 注入 FAKE_OASDIFF_MODE）。 */
function realSpawnWithMode(mode: string): SpawnFn {
  return (command, options) => {
    const res = spawnSync(command, {
      shell: true,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: "utf8",
      windowsHide: true,
      // PATH 引号消毒（phaseC 附录 A 教训：游离双引号会让 cmd.exe 吞段、node 失联）。
      env: stripQuotesFromPathEnv({ ...process.env, FAKE_OASDIFF_MODE: mode }),
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

function legPlan(scriptPath: string, projectRoot: string): OasdiffLegPlan {
  return {
    tool: OASDIFF_TOOL_ID,
    toolVersion: "2.2.0",
    gate: "CONTRACT",
    gateDef: "POLICY.GATE.CONTRACT@0.1.0",
    metricDialect: OASDIFF_METRIC_DIALECT,
    grn: "GRN-1702",
    ranAtSeq: 1702,
    trigger: "on_demand",
    subjectId: null,
    denominatorRefs: [],
    projectRoot,
    command: `node "${scriptPath}" breaking --format json base.yaml current.yaml`,
    versionProbeCommand: `node "${scriptPath}" --version`,
    executable: "node",
    timeoutMs: 30_000,
    basePath: "base.yaml",
    currentPath: "current.yaml",
    expectedToolVersion: "2.2.0",
  };
}

describe("oasdiff 腿真实子进程（fake 脚本两段式）", () => {
  const dir = mkdtempSync(join(tmpdir(), "pomaster-oasdiff-leg-"));
  const scriptPath = join(dir, "fake-oasdiff.cjs");
  writeFileSync(scriptPath, FAKE_OASDIFF_CJS, "utf8");

  it("clean → 真两段 spawn → passed", { timeout: 30_000 }, () => {
    const raw = runOasdiffLeg(legPlan(scriptPath, dir), realSpawnWithMode("clean"));
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("2.2.0");
    const record = normalizeOasdiffLeg(raw, 0);
    expect(record.verdict).toBe("passed");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("breaking → 真两段 spawn → failed violations=1 + items", { timeout: 30_000 }, () => {
    const raw = runOasdiffLeg(legPlan(scriptPath, dir), realSpawnWithMode("breaking"));
    const record = normalizeOasdiffLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.location).toContain("current.yaml#");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("garbage → 真两段 spawn → not_run（I2：损坏工具形态禁判假红下限）", { timeout: 30_000 }, () => {
    const raw = runOasdiffLeg(legPlan(scriptPath, dir), realSpawnWithMode("garbage"));
    const record = normalizeOasdiffLeg(raw, 0);
    expect(record.verdict).toBe("not_run");
    expect(record.counts.violations).toBe(0);
    expect(record.scopeNote).toMatch(/不可解析/);
  });

  it("emptyBreaking（exit 1 + 可解析空明细）→ 真两段 spawn → failed violations=1（诚实下限存活）", { timeout: 30_000 }, () => {
    const raw = runOasdiffLeg(legPlan(scriptPath, dir), realSpawnWithMode("emptyBreaking"));
    const record = normalizeOasdiffLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.scopeNote).toMatch(/下限/);
  });
});

// ============================================================
// 大输出（maxBuffer）：默认 spawn 的 64MB 缓冲——>1MB stdout 不被 ENOBUFS 打断
// （Node 默认 1MB 会被大 spec diff 输出打断成 ENOBUFS → 结构性 not_run，P22 红队 MAJOR）
//
// 跨平台确定性构造（ubuntu CI 实证修复）：单次 process.stdout.write(>管道缓冲) +
// 立即 process.exit() 在 POSIX 管道上会截断输出（同脚本 Windows 全量 / ubuntu 仅
// ~0.14MB）。子进程侧改为 fs.writeSync(1,…) 循环补写（部分写/EAGAIN 重试）——
// 「产出 >1MB stdout」跨平台保证全量落管；键宽零填充 → 每条目字节数恒定 → 期望
// 字节数闭式可算，断言收紧到精确相等（键为非数字词形 → JSON 对象键保持插入序，
// 序列化字节确定）。若 spawn 回落 Node 默认 1MB → maxBuffer 超限 → error=ENOBUFS
// → spawn_failed，同样红（原回归意图不变）。
// ============================================================

const BIG_OASDIFF_KEYS = 70000;
/** 定宽条目词形（序号零填充 5 位）——每条目恒 25 字节。 */
const BIG_OASDIFF_ENTRY = '"changed-path-00000":null';
/** 期望 stdout 精确字节数 = 条目 × N + 条目间逗号 (N-1) + 首尾大括号 2。 */
const BIG_OASDIFF_EXPECTED_BYTES =
  BIG_OASDIFF_ENTRY.length * BIG_OASDIFF_KEYS + (BIG_OASDIFF_KEYS - 1) + 2;

const BIG_OUTPUT_OASDIFF_CJS = `const { writeSync } = require("node:fs");
// flush-safe 全量落管：部分写（返回值 < 请求量）与 EAGAIN（非阻塞管道瞬时满）都
// 继续补写，直到全量进入管道——POSIX 管道 + process.exit() 前必须写完。
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
if (process.argv.includes("--version")) {
  process.stdout.write("oasdiff 2.2.0\\n");
  process.exit(0);
}
const payload = {};
for (let i = 0; i < ${BIG_OASDIFF_KEYS}; i++) {
  payload["changed-path-" + String(i).padStart(5, "0")] = null;
}
writeAll(JSON.stringify(payload));
process.exit(0);
`;

describe("oasdiff 腿大输出 maxBuffer（默认 spawn 64MB）", () => {
  const dir = mkdtempSync(join(tmpdir(), "pomaster-oasdiff-big-"));
  const scriptPath = join(dir, "big-oasdiff.cjs");
  writeFileSync(scriptPath, BIG_OUTPUT_OASDIFF_CJS, "utf8");

  it(">1MB 合法 JSON 走通两段 spawn 与判卷（passed，零 breaking，stdout 字节数精确恒等）", { timeout: 60_000 }, () => {
    // fixture 自证：构造目标 > Node 默认 1MB（本用例的回归判据前提）。
    expect(BIG_OASDIFF_EXPECTED_BYTES).toBeGreaterThan(1024 * 1024);
    // 刻意走默认 oasdiffSpawn（maxBuffer 修复位）；修复前 Node 默认 1MB
    // → error=ENOBUFS → spawn_failed，本用例红。null 叶子无信息量不计明细
    // （宽容提取器契约），故 >1MB 输出对应零 breaking。
    const raw = runOasdiffLeg(legPlan(scriptPath, dir));
    expect(raw.kind).toBe("executed");
    // 精确恒等（强于原 >1MB）：跨 OS 全量落管，任何截断即刻红。
    expect(raw.stdout.length).toBe(BIG_OASDIFF_EXPECTED_BYTES);
    const record = normalizeOasdiffLeg(raw, 0);
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
  });
});

// ============================================================
// 宿主 oasdiff 在场 e2e（真实 breaking 形态 fixture；宿主未装 → skip + 盲区说明）
// ============================================================

describe("oasdiff 腿宿主真实 e2e（临时目录构造旧/新 OpenAPI 对）", () => {
  it("真实 oasdiff：删除必填字段 + 改类型 breaking 形态 → failed violations>0", { timeout: 120_000 }, (ctx) => {
    // 探测宿主 PATH（真实探测，零 fake）。
    const facts = platformDetectorFacts(process.cwd());
    if (detectOasdiff(facts).status !== "READY") {
      console.warn(
        "[盲区说明] 宿主未安装 oasdiff —— breaking-change 真实 diff e2e 跳过（诚实缺席，非通过）；判卷矩阵与真实子进程链路已由 fake spawn / fake 脚本覆盖",
      );
      ctx.skip();
    }
    // 真实探测 + 真实 fixture + 真实 oasdiff（此分支只在装了 oasdiff 的宿主执行）。
    const root = mkdtempSync(join(tmpdir(), "pomaster-oasdiff-e2e-"));
    const base = {
      openapi: "3.0.3",
      info: { title: "demo", version: "1.0.0" },
      paths: {
        "/users": {
          post: {
            operationId: "createUser",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name", "age"],
                    properties: { name: { type: "string" }, age: { type: "integer" } },
                  },
                },
              },
            },
            responses: { "201": { description: "created" } },
          },
        },
      },
    };
    // breaking 形态①②合一：删除必填字段（age 出 required）+ 改字段类型（integer→string）。
    const breaking = JSON.parse(JSON.stringify(base)) as typeof base;
    const requestSchema = (
      (
        (breaking.paths as Record<string, unknown>)["/users"] as Record<string, unknown>
      )["post"] as Record<string, unknown>
    )["requestBody"] as Record<string, unknown>;
    const innerSchema = (
      (requestSchema["content"] as Record<string, unknown>)[
        "application/json"
      ] as Record<string, unknown>
    )["schema"] as Record<string, unknown>;
    innerSchema["required"] = ["name"];
    (innerSchema["properties"] as Record<string, unknown>)["age"] = { type: "string" };
    writeFileSync(join(root, "base.yaml"), JSON.stringify(base), "utf8");
    writeFileSync(join(root, "current.yaml"), JSON.stringify(breaking), "utf8");
    writeFileSync(
      join(root, "contract-gate.json"),
      JSON.stringify({ openapi: "current.yaml", breakingDiff: { base: "base.yaml" } }),
      "utf8",
    );
    const record = fullPipelineWithRealFacts(root);
    // 删除必填字段/改类型在真实 oasdiff 下必是 breaking —— failed 且 violations>0。
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBeGreaterThan(0);
  });
});

/** 宿主 e2e 专用：真实 platformDetectorFacts + 真实 oasdiffSpawn 的全链路。 */
function fullPipelineWithRealFacts(projectRoot: string): GateResultRecord {
  const adapter = createContractAdapter();
  const plan = adapter.prepare({ projectRoot }, policy());
  const raw = adapter.run(plan);
  return adapter.normalize(raw, {});
}

// ============================================================
// 三态 truth-index 记录互异（failed / passed / not_run）
// ============================================================

describe("三态 truth-index 记录互异", () => {
  it("同一 fixture 面：failed / passed / not_run 三份记录逐字段互异且全部过 03 schema", () => {
    const failed = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 2.2.0" },
        { status: 1, stdout: BREAKING_JSON },
      ),
    );
    const passed = fullPipeline(
      READY_FACTS(),
      scriptedSpawn(
        { status: 0, stdout: "oasdiff 2.2.0" },
        { status: 0, stdout: "" },
      ),
    );
    const notRun = fullPipeline(
      fakeFacts("D:/contract-proj", {
        files: {
          [posixJoin("D:/contract-proj", "contract-gate.json")]: JSON.stringify({
            openapi: "spec/openapi.yaml",
            breakingDiff: { base: "spec/openapi.base.yaml" },
          }),
        },
      }),
      scriptedSpawn({}, {}),
    );
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
