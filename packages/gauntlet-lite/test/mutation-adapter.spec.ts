/**
 * mutation-adapter.spec.ts —— MUTATION 门禁 adapter（P24 / 随版计划 Batch 2 B2-3
 * StrykerJS + B2-4 mutmut）。
 *
 * 覆盖（P24 出口判据 1/2/5/6 + P22/P23 腿先例）：
 * - 出口判据 1「双 adapter 真执行」：fake 可执行脚本 × 真实 spawnSync 两段式（stryker
 *   腿 / mutmut 腿各自 fake 工具子进程真实写盘产出报告 + 报告回读；零安装零网络）+
 *   宿主 stryker/mutmut 在场 e2e（宿主未装则 skip + 盲区说明——诚实缺席纪律）；
 * - 出口判据 2「changed-code scope 生效」：命令面（composed 命令携带 --mutate /
 *   --paths-to-mutate 旗标，fake 工具留痕证明旗标真实到达工具）+ 判卷面（构造「工具
 *   无视 scope 旗标乱写 scope 外 mutant」形态——scope 外条目不入分母不入分子，
 *   notApplicable 显式计数；scope 全外 → not_run 禁当满分）；
 * - 出口判据 5「能力落差如实标注」：mutmut 腿每条执行记录 scopeNote 恒携带
 *   MUTMUT_GAP_NOTE（无 schema 化报告/无位置/无算子/suspicious 保守口径）；
 * - 出口判据 6「HARDENING 档专属生效」：MINIMAL/LIGHT/FAST → policy_skip 合法缺席
 *   （P12c 映射）；STANDARD → policy_skip 且注记单列 B2-3 原文「HARDENING 档专属」
 *   整 gate 专属裁定（决策 D1——非 CRAP 阈值专属语义）；HARDENING 档缺席工具 = not_run
 *   非绿非红；档位词形越形 fail-closed；
 * - kill score 双阈值判卷（violations 语义=决策 D2）：score 低于下限 / survivor 超上限
 *   各记一条；幸存者明细（PRD §28 survivor list）承载 items；failed 不被 cap 洗白；
 * - P22/P23 三道闸先例：⓪ 可执行体 PATH 探测 / ① 版本探测收紧 / ②a 报告路径安全闸 /
 *   ②b spawn 前 rmSync 失效化（陈旧报告误绿通道封死 + 失效化失败 pre_run_failed）；
 * - 大输出 maxBuffer 回归（>1MB stdout 不被 Node 默认 1MB ENOBUFS 打断）；
 * - mutmut 腿版本锚强制（pytest-cov 腿同款 fail-closed）；
 * - provisional 阈值呈报项登记（「provisional 待 A4」词形钉死——系统不自批）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMutationAdapter,
  detectMutmut,
  detectStryker,
  MUTATION_GATE_CONFIG_FILE,
  MUTATION_GATE_DEF,
  MUTATION_GATE_NAME,
  MUTATION_METRIC_DIALECT_UNDECLARED,
  MUTATION_POLICY_SKIP_METRIC_DIALECT,
  MUTATION_PROVISIONAL_REGISTRATIONS,
  MUTATION_PROVISIONAL_THRESHOLDS,
  MUTMUT_GAP_NOTE,
  MUTMUT_METRIC_DIALECT,
  MUTMUT_TOOL_ID,
  mutationSpawn,
  normalizeMutationLeg,
  platformDetectorFacts,
  platformExecutableProbe,
  readMutationGateConfig,
  resolveMutationReportPath,
  runMutationLeg,
  STRYKER_METRIC_DIALECT,
  STRYKER_TOOL_ID,
  toGateResultJson,
  stripQuotesFromPathEnv,
  type GatePolicy,
  type GateResultRecord,
  type MutationLegPlan,
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
  dir = mkdtempSync(join(tmpdir(), "pomaster-mutation-"));
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

const STRYKER_DECL = JSON.stringify({ devDependencies: { "@stryker-mutator/core": "^4.0.0" } });
const STRYKER_CONFIG = JSON.stringify({
  runner: "stryker",
  command: "corepack pnpm exec stryker run",
  changedFiles: ["src/calc.ts"],
});

function policy(overrides: Partial<GatePolicy> = {}): GatePolicy {
  return {
    grn: "GRN-2400",
    ranAtSeq: 2400,
    trigger: "on_demand",
    gateTier: "HARDENING",
    ...overrides,
  };
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

/** run 侧 fake 副作用：把当前夹具报告写到声明报告路径（模拟第三方工具真实产出）。 */
function writesFixtureReport(): () => void {
  return () => {
    if (fixtureReport !== null) {
      put("reports/mutation/mutation.json", fixtureReport);
    }
  };
}

/** 全链路：prepare（真实临时目录探测）→ run（spawn/探针注入）→ normalize。 */
function fullPipeline(
  gatePolicy: GatePolicy = policy(),
  spawn: SpawnFn = scriptedSpawn(
    { status: 0, stdout: "4.0.0" },
    { status: 0, stdout: "" },
    writesFixtureReport(),
  ),
  probe: (executable: string) => string | null = () => "C:/fake/corepack",
  root = dir,
): GateResultRecord {
  const adapter = createMutationAdapter({ spawnFn: spawn, executableProbe: probe });
  const plan = adapter.prepare({ projectRoot: root }, gatePolicy, platformDetectorFacts(root));
  const raw = adapter.run(plan);
  return adapter.normalize(raw, {});
}

// ============================================================
// 配置读取（fail-closed）
// ============================================================

describe("readMutationGateConfig：fail-closed 配置面", () => {
  it("文件缺席 → 不 ok + 配置指引（诚实缺席，禁静默）", () => {
    const read = readMutationGateConfig(fakeFacts("D:/mut-proj", { files: {} }));
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.reason).toContain("mutation-gate.json");
      expect(read.installHint).toMatch(/runner/);
    }
  });

  it.each([
    ["JSON 坏形", "{oops"],
    ["根非对象", JSON.stringify([1])],
    ["runner 越形", JSON.stringify({ runner: "pit" })],
    ["缺 command", JSON.stringify({ runner: "stryker", changedFiles: ["src/a.ts"] })],
    ["command 空串", JSON.stringify({ runner: "stryker", command: "  ", changedFiles: ["a"] })],
    ["缺 changedFiles", JSON.stringify({ runner: "stryker", command: "stryker run" })],
    ["changedFiles 空数组", JSON.stringify({ runner: "stryker", command: "x", changedFiles: [] })],
    [
      "changedFiles 含空串",
      JSON.stringify({ runner: "stryker", command: "x", changedFiles: ["a.ts", ""] }),
    ],
    ["report 空串", JSON.stringify({ runner: "stryker", command: "x", changedFiles: ["a"], report: "" })],
    [
      "thresholds 半份（缺 maxSurvivors）",
      JSON.stringify({ runner: "stryker", command: "x", changedFiles: ["a"], thresholds: { minKillScore: 85 } }),
    ],
    [
      "minKillScore 越界（>100）",
      JSON.stringify({ runner: "stryker", command: "x", changedFiles: ["a"], thresholds: { minKillScore: 120, maxSurvivors: 1 } }),
    ],
    [
      "maxSurvivors 非整数",
      JSON.stringify({ runner: "stryker", command: "x", changedFiles: ["a"], thresholds: { minKillScore: 85, maxSurvivors: 1.5 } }),
    ],
  ])("malformed：%s → 不 ok + 指引", (_label, text) => {
    const read = readMutationGateConfig(
      fakeFacts("D:/mut-proj", {
        files: { [posixJoin("D:/mut-proj", MUTATION_GATE_CONFIG_FILE)]: text },
      }),
    );
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.installHint.length).toBeGreaterThan(0);
    }
  });

  it("合法 stryker / mutmut 词形 → ok；report 缺省按 runner 解析；changedFiles 反斜杠归一", () => {
    const stryker = readMutationGateConfig(
      fakeFacts("D:/mut-proj", {
        files: {
          [posixJoin("D:/mut-proj", MUTATION_GATE_CONFIG_FILE)]: JSON.stringify({
            runner: "stryker",
            command: "corepack pnpm exec stryker run",
            changedFiles: ["src\\calc.ts", "src/edge.ts"],
          }),
        },
      }),
    );
    expect(stryker.ok).toBe(true);
    if (stryker.ok) {
      expect(stryker.config.runner).toBe("stryker");
      expect(stryker.config.changedFiles).toEqual(["src/calc.ts", "src/edge.ts"]);
      expect(stryker.config.thresholds).toBeNull();
      expect(stryker.config.report).toBeNull();
    }
    const mutmut = readMutationGateConfig(
      fakeFacts("D:/mut-proj", {
        files: {
          [posixJoin("D:/mut-proj", MUTATION_GATE_CONFIG_FILE)]: JSON.stringify({
            runner: "mutmut",
            command: "python -m mutmut run",
            changedFiles: ["src/calc.py"],
          }),
        },
      }),
    );
    expect(mutmut.ok).toBe(true);
    if (mutmut.ok) {
      expect(mutmut.config.runner).toBe("mutmut");
    }
    expect(resolveMutationReportPath("stryker", null)).toBe("reports/mutation/mutation.json");
    expect(resolveMutationReportPath("mutmut", null)).toBe("mutants.xml");
    expect(resolveMutationReportPath("mutmut", "reports\\m.xml")).toBe("reports/m.xml");
  });
});

// ============================================================
// 探测（detectors 单一探测面：detectStryker / detectMutmut）
// ============================================================

describe("detect：stryker / mutmut 双腿探测（四态缺席语义）", () => {
  it("stryker：@stryker-mutator/core 声明 → READY + 版本；未声明 → NOT_INSTALLED + 安装指引", () => {
    const ready = detectStryker(
      fakeFacts("D:/mut-proj", {
        files: {
          [posixJoin("D:/mut-proj", "package.json")]: JSON.stringify({
            devDependencies: { "@stryker-mutator/core": "^4.0.0" },
          }),
        },
      }),
    );
    expect(ready.status).toBe("READY");
    if (ready.status === "READY") {
      expect(ready.tool).toBe("@stryker-mutator/core");
      expect(ready.detectedVersion).toBe("4.0.0");
    }
    const absent = detectStryker(fakeFacts("D:/mut-proj", { files: {} }));
    expect(absent.status).toBe("NOT_INSTALLED");
    if (absent.status === "NOT_INSTALLED") {
      expect(absent.installHint).toMatch(/stryker-mutator/);
    }
  });

  it("stryker 版本漂移（expectedVersion 锚失配）→ DRIFTED", () => {
    const drifted = detectStryker(
      fakeFacts("D:/mut-proj", {
        files: {
          [posixJoin("D:/mut-proj", "package.json")]: JSON.stringify({
            devDependencies: { "@stryker-mutator/core": "^4.0.0" },
          }),
        },
      }),
      { expectedVersion: "9.0.0" },
    );
    expect(drifted.status).toBe("DRIFTED");
    if (drifted.status === "DRIFTED") {
      expect(drifted.detectedVersion).toBe("4.0.0");
      expect(drifted.expectedVersion).toBe("9.0.0");
    }
  });

  it("mutmut：pyproject [tool.mutmut] / setup.cfg [mutmut] → READY（在位性留待 run 期）；缺席 → NOT_INSTALLED + D17/B2-4 注记", () => {
    const pyproject = detectMutmut(
      fakeFacts("D:/mut-proj", {
        files: { [posixJoin("D:/mut-proj", "pyproject.toml")]: "[tool.mutmut]\npaths_to_mutate=src\n" },
      }),
    );
    expect(pyproject.status).toBe("READY");
    if (pyproject.status === "READY") {
      expect(pyproject.evidence).toMatch(/run 期/);
    }
    const setupCfg = detectMutmut(
      fakeFacts("D:/mut-proj", {
        files: { [posixJoin("D:/mut-proj", "setup.cfg")]: "[mutmut]\npaths_to_mutate=src\n" },
      }),
    );
    expect(setupCfg.status).toBe("READY");
    const absent = detectMutmut(fakeFacts("D:/mut-proj", { files: {} }));
    expect(absent.status).toBe("NOT_INSTALLED");
    if (absent.status === "NOT_INSTALLED") {
      expect(absent.reason).toMatch(/B2-4|mutmut/);
      expect(absent.installHint).toMatch(/pip install mutmut/);
    }
  });

  it.each([true, false])("stryker/mutmut requiredByProfile=false → NOT_REQUIRED_BY_PROFILE（HARDENING 档专属合法缺席）", (first) => {
    const detection = first
      ? detectStryker(fakeFacts("D:/mut-proj", { files: {} }), { requiredByProfile: false })
      : detectMutmut(fakeFacts("D:/mut-proj", { files: {} }), { requiredByProfile: false });
    expect(detection.status).toBe("NOT_REQUIRED_BY_PROFILE");
    if (detection.status === "NOT_REQUIRED_BY_PROFILE") {
      expect(detection.reason).toMatch(/HARDENING/);
    }
  });

  it("adapter detect：配置 + runner 工具合流（stryker READY / 工具缺席 NOT_INSTALLED 带 runner 语境）", () => {
    put(MUTATION_GATE_CONFIG_FILE, STRYKER_CONFIG);
    put("package.json", STRYKER_DECL);
    const ready = createMutationAdapter().detect(platformDetectorFacts(dir));
    expect(ready.status).toBe("READY");
    if (ready.status === "READY") {
      expect(ready.tool).toBe(STRYKER_TOOL_ID);
      expect(ready.evidence).toContain("mutation-gate.json");
    }
    const noTool = createMutationAdapter().detect(
      platformDetectorFacts(
        (() => {
          const bare = mkdtempSync(join(tmpdir(), "pomaster-mutation-bare-"));
          writeFileSync(join(bare, MUTATION_GATE_CONFIG_FILE), STRYKER_CONFIG, "utf8");
          return bare;
        })(),
      ),
    );
    expect(noTool.status).toBe("NOT_INSTALLED");
    if (noTool.status === "NOT_INSTALLED") {
      expect(noTool.reason).toMatch(/runner=stryker/);
    }
  });
});

// ============================================================
// prepare：档位闸 → 配置闸 → 工具闸（缺席语义全部显式）
// ============================================================

describe("prepare：HARDENING 档专属档位语义（决策 D1）+ 三闸缺席分流", () => {
  describe("出口判据 6：MINIMAL/LIGHT/FAST 合法缺席；STANDARD 按 B2-3 原文裁定缺席；HARDENING 才跑", () => {
    it.each(["MINIMAL", "LIGHT", "FAST"] as const)(
      "tier=%s → plan.absenceKind=profile_not_required → not_run + notApplicable=1（显式语义非静默跳过）",
      (tier) => {
        put(MUTATION_GATE_CONFIG_FILE, STRYKER_CONFIG);
        put("package.json", STRYKER_DECL);
        const record = fullPipeline(policy({ gateTier: tier }));
        expect(record.verdict).toBe("not_run");
        expect(record.counts.notApplicable).toBe(1);
        expect(record.counts.violations).toBe(0);
        expect(record.metricDialect).toBe(MUTATION_POLICY_SKIP_METRIC_DIALECT);
        expect(record.scopeNote).toMatch(/SKIPPED_BY_POLICY/);
        expect(record.scopeNote).toContain(`tier=${tier}`);
        expect(record.scopeNote).toMatch(/HARDENING 档专属/);
        expect(validate(toGateResultJson(record))).toBe(true);
      },
    );

    it("STANDARD 档 → policy_skip 且注记单列 B2-3「HARDENING 档专属」整 gate 裁定（决策 D1——非 CRAP 阈值专属语义）", () => {
      put(MUTATION_GATE_CONFIG_FILE, STRYKER_CONFIG);
      put("package.json", STRYKER_DECL);
      const record = fullPipeline(policy({ gateTier: "STANDARD" }));
      expect(record.verdict).toBe("not_run");
      expect(record.counts.notApplicable).toBe(1);
      expect(record.metricDialect).toBe(MUTATION_POLICY_SKIP_METRIC_DIALECT);
      expect(record.scopeNote).toContain("tier=STANDARD");
      expect(record.scopeNote).toMatch(/B2-3 原文「HARDENING 档专属」是整 gate 专属/);
      expect(record.scopeNote).toMatch(/非 CRAP B2-2/);
      expect(validate(toGateResultJson(record))).toBe(true);
    });

    it("HARDENING 档：工具缺席 → not_run（非绿非红 + 安装路标，非 policy_skip）", () => {
      put(MUTATION_GATE_CONFIG_FILE, STRYKER_CONFIG);
      // 无 package.json → @stryker-mutator/core 未声明 → tool_absent。
      const record = fullPipeline(policy({ gateTier: "HARDENING" }));
      expect(record.verdict).toBe("not_run");
      expect(record.metricDialect).not.toBe(MUTATION_POLICY_SKIP_METRIC_DIALECT);
      expect(record.counts.notApplicable).toBe(0);
      expect(record.scopeNote).toMatch(/stryker|安装建议/);
    });

    it("档位词形越形 → fail-closed 抛错（禁静默回落默认档）", () => {
      put(MUTATION_GATE_CONFIG_FILE, STRYKER_CONFIG);
      put("package.json", STRYKER_DECL);
      expect(() =>
        fullPipeline({ ...policy(), gateTier: "CRITICAL" as unknown as string } as GatePolicy),
      ).toThrowError(/gateTier 词形非法/);
    });
  });

  it("stryker 腿就绪：命令形态（--mutate scope 旗标 + 声明命令）与计划字段", () => {
    put(MUTATION_GATE_CONFIG_FILE, STRYKER_CONFIG);
    put("package.json", STRYKER_DECL);
    const adapter = createMutationAdapter();
    const plan = adapter.prepare({ projectRoot: dir }, policy(), platformDetectorFacts(dir));
    expect(plan.absenceKind).toBeNull();
    expect(plan.runner).toBe("stryker");
    expect(plan.tool).toBe(STRYKER_TOOL_ID);
    expect(plan.toolVersion).toBe("4.0.0");
    expect(plan.metricDialect).toBe(STRYKER_METRIC_DIALECT);
    expect(plan.gate).toBe(MUTATION_GATE_NAME);
    expect(plan.gateDef).toBe(MUTATION_GATE_DEF);
    // changed-code scope 命令面：composed 命令必须携带 --mutate 旗标与变更清单。
    expect(plan.command).toBe('corepack pnpm exec stryker run --mutate "src/calc.ts"');
    expect(plan.reportPath).toBe("reports/mutation/mutation.json");
    expect(plan.thresholds).toEqual(MUTATION_PROVISIONAL_THRESHOLDS);
    expect(plan.thresholdsProvisional).toBe(true);
    expect(plan.executable).toBe("corepack");
    expect(plan.versionProbeCommand).toBe("corepack pnpm exec stryker --version");
  });

  it("配置显式 thresholds / report 生效（阈值配置化；provisional 旗翻转）", () => {
    put(
      MUTATION_GATE_CONFIG_FILE,
      JSON.stringify({
        runner: "stryker",
        command: "npx stryker run",
        changedFiles: ["src/a.ts", "src/b.ts"],
        report: "reports/mut/mutation.json",
        thresholds: { minKillScore: 70, maxSurvivors: 3 },
      }),
    );
    put("package.json", STRYKER_DECL);
    const adapter = createMutationAdapter();
    const plan = adapter.prepare({ projectRoot: dir }, policy(), platformDetectorFacts(dir));
    expect(plan.thresholds).toEqual({ minKillScore: 70, maxSurvivors: 3 });
    expect(plan.thresholdsProvisional).toBe(false);
    expect(plan.reportPath).toBe("reports/mut/mutation.json");
    expect(plan.command).toContain('--mutate "src/a.ts,src/b.ts"');
  });

  it("mutmut 腿：--paths-to-mutate scope 旗标 + 版本锚强制（缺锚 fail-closed 抛错）", () => {
    put(
      MUTATION_GATE_CONFIG_FILE,
      JSON.stringify({
        runner: "mutmut",
        command: "python -m mutmut run",
        changedFiles: ["src/calc.py"],
      }),
    );
    put("pyproject.toml", "[tool.mutmut]\n");
    const adapter = createMutationAdapter();
    expect(() =>
      adapter.prepare({ projectRoot: dir }, policy({ expectedToolVersion: null }), platformDetectorFacts(dir)),
    ).toThrowError(/expectedToolVersion/);
    const plan = adapter.prepare(
      { projectRoot: dir },
      policy({ expectedToolVersion: "2.4.4" }),
      platformDetectorFacts(dir),
    );
    expect(plan.runner).toBe("mutmut");
    expect(plan.tool).toBe(MUTMUT_TOOL_ID);
    expect(plan.toolVersion).toBe("2.4.4");
    expect(plan.metricDialect).toBe(MUTMUT_METRIC_DIALECT);
    expect(plan.command).toBe('python -m mutmut run --paths-to-mutate "src/calc.py"');
    expect(plan.executable).toBe("python");
    expect(plan.versionProbeCommand).toBe("python -m mutmut --version");
    expect(plan.reportPath).toBe("mutants.xml");
  });

  it("mutmut 工具缺席 → tool_absent（HARDENING 缺席 not_run 路径）", () => {
    put(
      MUTATION_GATE_CONFIG_FILE,
      JSON.stringify({ runner: "mutmut", command: "python -m mutmut run", changedFiles: ["src/c.py"] }),
    );
    const adapter = createMutationAdapter();
    const plan = adapter.prepare({ projectRoot: dir }, policy(), platformDetectorFacts(dir));
    expect(plan.absenceKind).toBe("tool_absent");
    const record = adapter.normalize(adapter.run(plan), {});
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/tool\.mutmut|\[mutmut\]|安装建议/);
  });

  it("配置缺席（HARDENING 档）→ not_configured（诚实缺席，非 passed 非静默）", () => {
    const record = fullPipeline(policy({ gateTier: "HARDENING" }));
    expect(record.verdict).toBe("not_configured");
    expect(record.scopeNote).toMatch(/mutation-gate\.json/);
    expect(record.metricDialect).toBe(MUTATION_METRIC_DIALECT_UNDECLARED);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("stryker 版本词形不可解析（workspace:* 词形）→ fail-closed 抛错（c8 腿同款纪律）", () => {
    put(MUTATION_GATE_CONFIG_FILE, STRYKER_CONFIG);
    put("package.json", JSON.stringify({ devDependencies: { "@stryker-mutator/core": "workspace:*" } }));
    const adapter = createMutationAdapter();
    expect(() =>
      adapter.prepare({ projectRoot: dir }, policy(), platformDetectorFacts(dir)),
    ).toThrowError(/版本词形不可解析/);
  });
});

// ============================================================
// run/normalize 判卷矩阵（fake spawn + 预写报告；kill score 双阈值 + scope 复核）
// ============================================================

/** StrykerJS mutation-testing-elements 词形报告（files → mutants）。 */
function strykerReport(
  files: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>>,
): string {
  return JSON.stringify({
    schemaVersion: "1.0",
    files: Object.fromEntries(
      Object.entries(files).map(([file, mutants]) => [
        file,
        {
          language: "typescript",
          mutants: mutants.map(([mutatorName, status], i) => ({
            id: `m-${String(i + 1)}`,
            mutatorName,
            location: { start: { line: i + 1, column: 1 }, end: { line: i + 1, column: 2 } },
            status,
          })),
        },
      ]),
    ),
    testFiles: {},
    projectRoot: ".",
  });
}

/** stryker 腿就绪夹具（配置 + package.json + 预写报告文件；报告按需给）。 */
function strykerReadyFixture(reportText: string | null, thresholds?: object): void {
  put(
    MUTATION_GATE_CONFIG_FILE,
    JSON.stringify({
      runner: "stryker",
      command: "corepack pnpm exec stryker run",
      changedFiles: ["src/calc.ts"],
      ...(thresholds ? { thresholds } : {}),
    }),
  );
  put("package.json", STRYKER_DECL);
  fixtureReport = reportText;
  if (reportText !== null) {
    put("reports/mutation/mutation.json", reportText);
  }
}

describe("kill score 判卷矩阵（violations=双阈值违例，决策 D2；幸存者明细=PRD §28 survivor list）", () => {
  it("满分绿：3 killed → kill score 100% → passed（scopeNote 携带 detected/generated 与 provisional 注记）", () => {
    strykerReadyFixture(
      strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Killed"], ["BooleanLiteral", "Killed"], ["ComparisonOperator", "Killed"]] }),
    );
    const record = fullPipeline();
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    expect(record.counts.applicableScanned).toBe(3);
    expect(record.scopeNote).toContain("100.00%");
    expect(record.scopeNote).toContain("provisional 待 A4");
    expect(record.metricDialect).toBe(STRYKER_METRIC_DIALECT);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("三态① kill score 抓红：1 killed + 2 survived → score 33.33% < 85 → failed violations=1 + items 携带实测/阈值/L6 锚", () => {
    strykerReadyFixture(
      strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Killed"], ["StringLiteral", "Survived"], ["ConditionalExpression", "Survived"]] }),
    );
    const record = fullPipeline();
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.some((i) => i.rule === "mutation_kill_score_below_threshold")).toBe(true);
    const item = record.items?.find((i) => i.rule === "mutation_kill_score_below_threshold");
    expect(item?.message).toContain("33.33%");
    expect(item?.message).toContain("85.00");
    expect(item?.message).toContain("provisional 待 A4");
    expect(item?.message).toMatch(/L6-1/);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("survivor 上限抓红：18 killed + 2 survived（score 90% 达标）+ 配置 maxSurvivors=1 → failed violations=1（cap 独立判罚）", () => {
    const mutants: (readonly [string, string])[] = [
      ...Array.from({ length: 18 }, () => ["ArithmeticOperator", "Killed"] as const),
      ["StringLiteral", "Survived"],
      ["ConditionalExpression", "Survived"],
    ];
    strykerReadyFixture(strykerReport({ "src/calc.ts": mutants }), {
      minKillScore: 85,
      maxSurvivors: 1,
    });
    const record = fullPipeline();
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.some((i) => i.rule === "mutation_survivors_above_cap")).toBe(true);
    // 幸存者明细 = PRD §28 survivor list（判卷留痕非逐条判罚——载体粒度声明）。
    expect(record.items?.filter((i) => i.rule === "mutation_survived")).toHaveLength(2);
    expect(record.scopeNote).toMatch(/survivor|幸存者/);
  });

  it("幸存者明细随 passed 记录留痕（score 达标但有幸存者 → passed + survivor list 在账）", () => {
    const mutants: (readonly [string, string])[] = [
      ...Array.from({ length: 18 }, () => ["ArithmeticOperator", "Killed"] as const),
      ["StringLiteral", "Survived"],
    ];
    strykerReadyFixture(strykerReport({ "src/calc.ts": mutants }));
    const record = fullPipeline();
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    const survivors = record.items?.filter((i) => i.rule === "mutation_survived") ?? [];
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.location).toBe("src/calc.ts:19");
    expect(survivors[0]?.message).toContain("StringLiteral");
  });

  it("timeout 计入 detected 分子（StrykerJS 口径）：17 killed + 1 timeout + 2 survived → score 90% passed", () => {
    const mutants: (readonly [string, string])[] = [
      ...Array.from({ length: 17 }, () => ["ArithmeticOperator", "Killed"] as const),
      ["WhileLoop", "Timeout"],
      ["StringLiteral", "Survived"],
      ["ConditionalExpression", "Survived"],
    ];
    strykerReadyFixture(strykerReport({ "src/calc.ts": mutants }));
    const record = fullPipeline();
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("killed 17 + timeout 1");
    expect(record.scopeNote).toContain("survived 2");
  });

  it("排除类不入分母（RuntimeError/Ignored/Pending）：8 killed + 1 RuntimeError + 1 Ignored + 1 Pending → score 100% passed", () => {
    strykerReadyFixture(
      strykerReport({
        "src/calc.ts": [
          ["ArithmeticOperator", "Killed"],
          ["BooleanLiteral", "Killed"],
          ["ComparisonOperator", "Killed"],
          ["LogicalOperator", "Killed"],
          ["UpdateOperator", "Killed"],
          ["NegateExpression", "Killed"],
          ["StringLiteral", "Killed"],
          ["BlockStatement", "Killed"],
          ["ErrorTable", "RuntimeError"],
          ["DeadCode", "Ignored"],
          ["Todo", "Pending"],
        ],
      }),
    );
    const record = fullPipeline();
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("排除类 3");
    expect(record.counts.applicableScanned).toBe(8);
  });

  it("出口判据 2（判卷面 scope 复核）：工具无视 scope 旗标乱写 scope 外幸存者 → 不入分母不入分子 + notApplicable 显式计数", () => {
    // in-scope：2 killed（score 100%）；out-of-scope：1 survived（若被计入将把 score 拉到 66.67%）。
    strykerReadyFixture(
      strykerReport({
        "src/calc.ts": [["ArithmeticOperator", "Killed"], ["BooleanLiteral", "Killed"]],
        "src/unrelated.ts": [["StringLiteral", "Survived"]],
      }),
    );
    const record = fullPipeline();
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBe(3);
    expect(record.counts.applicableScanned).toBe(2);
    expect(record.counts.notApplicable).toBe(1);
    expect(record.blindspot.escapeRatio).toBeCloseTo(1 / 3, 12);
    expect(record.scopeNote).toContain("scope 外 1 条");
    expect(record.items?.filter((i) => i.rule === "mutation_survived") ?? []).toHaveLength(0);
  });

  it("出口判据 2：scope 全外（changedFiles 与报告零交集）→ not_run（禁把空分母当 0% 或 100%）", () => {
    strykerReadyFixture(
      strykerReport({ "src/unrelated.ts": [["ArithmeticOperator", "Survived"]] }),
    );
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/零 mutants|空分母/);
  });

  it("报告非 JSON → not_run（malformed，附摘录）", () => {
    strykerReadyFixture("panic: not json");
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("not json");
  });

  it("Stryker 词表外状态（词形漂移）→ not_run（fail-closed，禁猜新词形）", () => {
    strykerReadyFixture(
      JSON.stringify({
        schemaVersion: "2.0",
        files: { "src/calc.ts": { mutants: [{ id: "x", status: "Zapped" }] } },
      }),
    );
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/词形不可解析|七态/);
  });

  it("schemaVersion 缺席 → not_run（stryker 词形在位性闸）", () => {
    strykerReadyFixture(JSON.stringify({ files: {} }));
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
  });

  it("报告未产出（工具 exit 1 但无报告文件）→ not_run（退出码是第三方语义，非判卷锚）", () => {
    strykerReadyFixture(null);
    const record = fullPipeline(
      policy(),
      scriptedSpawn({ status: 0, stdout: "4.0.0" }, { status: 1, stdout: "", stderr: "score below threshold" }),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/报告未产出/);
    expect(record.scopeNote).toMatch(/判卷锚/);
  });

  it("版本漂移：观测 5.1.0 ≠ policy 锚 4.0.0 → passed 降 warning；failed 不被 cap 洗白", () => {
    strykerReadyFixture(strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Killed"]] }));
    const drifted = fullPipeline(
      policy({ expectedToolVersion: "4.0.0" }),
      scriptedSpawn({ status: 0, stdout: "5.1.0" }, { status: 0, stdout: "" }, writesFixtureReport()),
    );
    expect(drifted.verdict).toBe("warning");
    expect(drifted.verdictCapReason).toBe("tool_version_drifted");
    strykerReadyFixture(
      strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Survived"]] }),
    );
    const failed = fullPipeline(
      policy({ expectedToolVersion: "4.0.0" }),
      scriptedSpawn({ status: 0, stdout: "5.1.0" }, { status: 0, stdout: "" }, writesFixtureReport()),
    );
    expect(failed.verdict).toBe("failed");
    expect(failed.verdictCapReason).toBeNull();
  });

  it("三道闸⓪：可执行体不在 PATH → not_run（Windows cmd 缺席伪装形态先拦）", () => {
    strykerReadyFixture(strykerReport({ "src/calc.ts": [["A", "Killed"]] }));
    const record = fullPipeline(policy(), scriptedSpawn({}, {}), () => null);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/可执行体.*不在 PATH/);
  });

  it("三道闸①：版本探测非零退出 / 版本词形不可得 → not_run（禁猜测版本口径）", () => {
    strykerReadyFixture(strykerReport({ "src/calc.ts": [["A", "Killed"]] }));
    const nonZero = fullPipeline(policy(), scriptedSpawn({ status: 1, error: null, stdout: "" }, {}));
    expect(nonZero.verdict).toBe("not_run");
    expect(nonZero.scopeNote).toMatch(/版本探测失败/);
    const noSemver = fullPipeline(policy(), scriptedSpawn({ status: 0, stdout: "no version here" }, {}));
    expect(noSemver.verdict).toBe("not_run");
    expect(noSemver.scopeNote).toMatch(/版本探测失败/);
  });
});

// ============================================================
// mutmut 腿判卷 + 能力落差如实标注（B2-4）
// ============================================================

describe("mutmut 腿：junitxml 词形判卷 + 能力落差注记恒在（出口判据 5）", () => {
  /** mutmut junitxml 词形（killed 无位置 / failure 携带 file:line / error / skipped message）。 */
  function mutmutXml(
    killed: number,
    survivedEntries: readonly string[] = [],
    extra = "",
  ): string {
    const cases = [
      ...Array.from({ length: killed }, (_, i) => `    <testcase classname="mutmut" name="Mutant #${String(i + 1)}"/>`),
      ...survivedEntries.map(
        (loc, i) =>
          `    <testcase classname="mutmut" name="Mutant #S${String(i)}"><failure message="${loc} mutant survived">Mutant survived</failure></testcase>`,
      ),
    ];
    return `<?xml version="1.0" encoding="utf-8"?>\n<testsuites><testsuite name="mutmut" tests="${String(killed + survivedEntries.length)}" failures="${String(survivedEntries.length)}" errors="0" skipped="0">\n${cases.join("\n")}\n${extra}\n</testsuite></testsuites>`;
  }

  function mutmutReadyFixture(reportText: string | null): void {
    put(
      MUTATION_GATE_CONFIG_FILE,
      JSON.stringify({
        runner: "mutmut",
        command: "python -m mutmut run",
        changedFiles: ["src/calc.py"],
      }),
    );
    put("pyproject.toml", "[tool.mutmut]\n");
    fixtureReport = reportText;
    if (reportText !== null) {
      put("mutants.xml", reportText);
    }
  }

  /** run 侧 fake 副作用：把当前夹具 junitxml 报告写到声明报告路径。 */
  function writesMutmutReport(): () => void {
    return () => {
      if (fixtureReport !== null) {
        put("mutants.xml", fixtureReport);
      }
    };
  }

  it("全绿：8 killed（无位置条目按命令面信任计数）→ passed + 能力落差注记 + scope 归属不可复核披露", () => {
    mutmutReadyFixture(mutmutXml(8));
    const record = fullPipeline(
      policy({ expectedToolVersion: "2.4.4" }),
      scriptedSpawn({ status: 0, stdout: "2.4.4" }, { status: 0 }, writesMutmutReport()),
    );
    expect(record.verdict).toBe("passed");
    expect(record.counts.applicableScanned).toBe(8);
    expect(record.scopeNote).toContain(MUTMUT_GAP_NOTE);
    expect(record.scopeNote).toContain("scope 归属不可复核 8 条");
    expect(record.metricDialect).toBe(MUTMUT_METRIC_DIALECT);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("mutmut 幸存者带 file:line（failure message）→ 入幸存者名单；suspicious 保守入分母不计分子", () => {
    mutmutReadyFixture(
      mutmutXml(
        17,
        ["src/calc.py:12"],
        '    <testcase classname="mutmut" name="Mutant #Z1"><skipped message="suspicious"/></testcase>\n    <testcase classname="mutmut" name="Mutant #Z2"><error message="timeout">timed out</error></testcase>',
      ),
    );
    // 17 killed + 1 timeout = detected 18；1 survived + 1 suspicious = undetected 分母 2；
    // generated = 20；score = 90% → passed（阈值 85）。
    const record = fullPipeline(
      policy({ expectedToolVersion: "2.4.4" }),
      scriptedSpawn({ status: 0, stdout: "2.4.4" }, { status: 0 }, writesMutmutReport()),
    );
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("killed 17 + timeout 1");
    expect(record.scopeNote).toContain("suspicious 1");
    const survivors = record.items?.filter((i) => i.rule === "mutation_survived") ?? [];
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.location).toBe("src/calc.py:12");
    // mutmut junitxml 无变异算子字段（能力落差 3）→ 明细注明缺席。
    expect(survivors[0]?.message).toMatch(/mutator 词形缺席/);
  });

  it("skipped 词表外 message → not_run（junitxml 词形漂移 fail-closed）", () => {
    mutmutReadyFixture(
      `<?xml version="1.0" encoding="utf-8"?>\n<testsuites><testsuite name="mutmut" tests="2" failures="0" errors="0" skipped="2">\n    <testcase classname="mutmut" name="Mutant #1"/>\n    <testcase classname="mutmut" name="Mutant #2"><skipped message="whatever"/></testcase>\n</testsuite></testsuites>`,
    );
    const record = fullPipeline(
      policy({ expectedToolVersion: "2.4.4" }),
      scriptedSpawn({ status: 0, stdout: "2.4.4" }, { status: 0 }, writesMutmutReport()),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/词形不可解析|junitxml/);
  });
});

// ============================================================
// P23 红队 MAJOR 同款：陈旧报告误绿通道封死（spawn 前失效化）
// ============================================================

describe("runMutationLeg 失效化纪律（陈旧报告禁跨 run 存活冒充本次判卷锚）", () => {
  it("预置陈旧满 score 报告 + 真执行成功产出新报告 → 判卷锚=本次新报告（内容对账：陈旧值零残留）", () => {
    const stale = strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Survived"]] });
    put(MUTATION_GATE_CONFIG_FILE, STRYKER_CONFIG);
    put("package.json", STRYKER_DECL);
    put("reports/mutation/mutation.json", stale);
    const fresh = strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Killed"]] });
    const record = fullPipeline(
      policy(),
      scriptedSpawn({ status: 0, stdout: "4.0.0" }, { status: 0, stdout: "" }, () => {
        put("reports/mutation/mutation.json", fresh);
      }),
    );
    expect(record.verdict).toBe("passed");
    expect(record.counts.applicableScanned).toBe(1);
    expect(record.scopeNote).toContain("100.00%");
  });

  it("预置陈旧报告 + run exit 0 但工具未产出报告 → not_run（陈旧锚已被失效化，诚实非绿非红）", () => {
    strykerReadyFixture(strykerReport({ "src/calc.ts": [["A", "Killed"]] }));
    const record = fullPipeline(
      policy(),
      scriptedSpawn({ status: 0, stdout: "4.0.0" }, { status: 0, stdout: "" }),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/报告未产出/);
    // 失效化机制在位：陈旧报告已在 spawn 前删除。
    expect(existsSync(join(dir, "reports/mutation/mutation.json"))).toBe(false);
  });

  it("报告路径为目录占位（rmSync 删不掉）→ pre_run_failed → not_run（无法保证新鲜性，fail-closed）", () => {
    put(MUTATION_GATE_CONFIG_FILE, STRYKER_CONFIG);
    put("package.json", STRYKER_DECL);
    mkdirSync(join(dir, "reports", "mutation", "mutation.json"), { recursive: true });
    const record = fullPipeline();
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/失效化失败/);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("报告路径越出项目根（../ 穿透）→ pre_run_failed 拒绝执行，根外预置文件零副作用（失效化面禁变删除面）", () => {
    const proj = join(dir, "proj");
    mkdirSync(proj, { recursive: true });
    writeFileSync(
      join(proj, MUTATION_GATE_CONFIG_FILE),
      JSON.stringify({
        runner: "stryker",
        command: "x",
        changedFiles: ["a.ts"],
        report: "../evil.json",
      }),
      "utf8",
    );
    writeFileSync(join(proj, "package.json"), STRYKER_DECL, "utf8");
    const evilPath = join(dir, "evil.json");
    writeFileSync(evilPath, '{"stale":true}', "utf8");
    const adapter = createMutationAdapter({
      spawnFn: scriptedSpawn({ status: 0, stdout: "4.0.0" }, { status: 0 }),
    });
    const plan = adapter.prepare({ projectRoot: proj }, policy(), platformDetectorFacts(proj));
    const record = adapter.normalize(adapter.run(plan), {});
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/越出项目根/);
    expect(existsSync(evilPath)).toBe(true);
    expect(validate(toGateResultJson(record))).toBe(true);
  });
});

// ============================================================
// 真实子进程链路（fake 工具脚本 × 真实 spawnSync 两段式；出口判据 1）
// ============================================================

const FAKE_STRYKER_CJS = `const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("4.0.0\\n");
  process.exit(0);
}
// 记录 scope 旗标到达证据（出口判据 2 命令面：--mutate 后第一个参数 = 逗号联集）。
const mutateIdx = args.indexOf("--mutate");
if (mutateIdx >= 0) {
  fs.writeFileSync("saw-mutate.txt", args[mutateIdx + 1] ?? "(none)");
}
const killed = Number(process.env.FAKE_STRYKER_KILLED ?? "3");
const survived = Number(process.env.FAKE_STRYKER_SURVIVED ?? "0");
const mutants = [
  ...Array.from({ length: killed }, () => ({ status: "Killed" })),
  ...Array.from({ length: survived }, () => ({ status: "Survived" })),
];
fs.mkdirSync(path.join("reports", "mutation"), { recursive: true });
fs.writeFileSync(
  path.join("reports", "mutation", "mutation.json"),
  JSON.stringify({ schemaVersion: "1.0", files: { "src/calc.ts": { language: "typescript", mutants } }, testFiles: {}, projectRoot: "." }),
);
process.exit(0);
`;

const FAKE_MUTMUT_CJS = `const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("2.4.4\\n");
  process.exit(0);
}
const mutateIdx = args.indexOf("--paths-to-mutate");
if (mutateIdx >= 0) {
  fs.writeFileSync("saw-paths.txt", args[mutateIdx + 1] ?? "(none)");
}
const killed = Number(process.env.FAKE_MUTMUT_KILLED ?? "3");
const cases = Array.from({ length: killed }, (_, i) => \`    <testcase classname="mutmut" name="Mutant #\${String(i + 1)}"/>\`).join("\\n");
fs.writeFileSync("mutants.xml", \`<?xml version="1.0" encoding="utf-8"?>\\n<testsuites><testsuite name="mutmut" tests="\${String(killed)}" failures="0" errors="0" skipped="0">\\n\${cases}\\n</testsuite></testsuites>\`);
process.exit(0);
`;

/** 真实 spawnSync wrapper（与 mutationSpawn 同参数形态 + 注入 FAKE_*）。 */
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

function strykerLegPlan(scriptPath: string, projectRoot: string): MutationLegPlan {
  return {
    tool: STRYKER_TOOL_ID,
    toolVersion: "4.0.0",
    gate: MUTATION_GATE_NAME,
    gateDef: MUTATION_GATE_DEF,
    metricDialect: STRYKER_METRIC_DIALECT,
    grn: "GRN-2401",
    ranAtSeq: 2401,
    trigger: "on_demand",
    subjectId: null,
    denominatorRefs: [],
    projectRoot,
    runner: "stryker",
    absenceKind: null,
    absentReason: null,
    absentHint: null,
    tier: "HARDENING",
    command: `node "${scriptPath}" run --mutate "src/calc.ts"`,
    versionProbeCommand: `node "${scriptPath}" --version`,
    executable: "node",
    timeoutMs: 60_000,
    reportPath: "reports/mutation/mutation.json",
    changedFiles: ["src/calc.ts"],
    thresholds: MUTATION_PROVISIONAL_THRESHOLDS,
    thresholdsProvisional: true,
    expectedToolVersion: null,
  };
}

describe("mutation 双腿真实子进程（fake 工具脚本两段式；出口判据 1）", () => {
  const workRoot = mkdtempSync(join(tmpdir(), "pomaster-mutation-leg-"));
  const strykerScript = join(workRoot, "fake-stryker.cjs");
  writeFileSync(strykerScript, FAKE_STRYKER_CJS, "utf8");
  const mutmutScript = join(workRoot, "fake-mutmut.cjs");
  writeFileSync(mutmutScript, FAKE_MUTMUT_CJS, "utf8");

  it("stryker 腿达标：真两段 spawn → 子进程真实产出报告 + scope 旗标到达证据 → passed", { timeout: 60_000 }, () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "pomaster-stryker-run-pass-"));
    const raw = runMutationLeg(
      strykerLegPlan(strykerScript, projectRoot),
      realSpawnWithEnv({ FAKE_STRYKER_KILLED: "3", FAKE_STRYKER_SURVIVED: "0" }),
    );
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("4.0.0");
    // 子进程真实写盘的报告被 run 侧回读（两段式全链：探测 → 执行 → 报告回读）。
    expect(raw.reportText).toContain('"schemaVersion"');
    // 命令面 scope 旗标到达证据：fake 工具把收到的 --mutate 值落盘。
    expect(readIfExists(join(projectRoot, "saw-mutate.txt"))).toBe("src/calc.ts");
    const record = normalizeMutationLeg(raw, 0);
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("stryker 腿低 score：真两段 spawn → failed（报告由子进程产出）", { timeout: 60_000 }, () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "pomaster-stryker-run-fail-"));
    const raw = runMutationLeg(
      strykerLegPlan(strykerScript, projectRoot),
      realSpawnWithEnv({ FAKE_STRYKER_KILLED: "1", FAKE_STRYKER_SURVIVED: "2" }),
    );
    const record = normalizeMutationLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.scopeNote).toContain("33.33%");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("mutmut 腿达标：真两段 spawn → junitxml 报告回读 + --paths-to-mutate 旗标到达证据 → passed", { timeout: 60_000 }, () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "pomaster-mutmut-run-pass-"));
    const plan: MutationLegPlan = {
      ...strykerLegPlan(mutmutScript, projectRoot),
      tool: MUTMUT_TOOL_ID,
      toolVersion: "2.4.4",
      metricDialect: MUTMUT_METRIC_DIALECT,
      runner: "mutmut",
      command: `node "${mutmutScript}" run --paths-to-mutate "src/calc.py"`,
      versionProbeCommand: `node "${mutmutScript}" --version`,
      reportPath: "mutants.xml",
      changedFiles: ["src/calc.py"],
      expectedToolVersion: "2.4.4",
      grn: "GRN-2402",
      ranAtSeq: 2402,
    };
    const raw = runMutationLeg(plan, realSpawnWithEnv({ FAKE_MUTMUT_KILLED: "3" }));
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("2.4.4");
    expect(raw.reportText).toContain("<testsuite");
    expect(readIfExists(join(projectRoot, "saw-paths.txt"))).toBe("src/calc.py");
    const record = normalizeMutationLeg(raw, 0);
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain(MUTMUT_GAP_NOTE);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("大输出（>1MB stdout）：默认 mutationSpawn 64MB 缓冲不被 Node 默认 1MB ENOBUFS 打断", { timeout: 60_000 }, () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "pomaster-stryker-run-big-"));
    const bigScript = join(workRoot, "big-stryker.cjs");
    writeFileSync(
      bigScript,
      `const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("4.0.0\\n");
  process.exit(0);
}
process.stdout.write("x".repeat(1200 * 1024));
fs.mkdirSync("reports/mutation", { recursive: true });
fs.writeFileSync(
  "reports/mutation/mutation.json",
  JSON.stringify({ schemaVersion: "1.0", files: { "src/calc.ts": { mutants: [{ id: "1", status: "Killed" }] } }, testFiles: {}, projectRoot: "." }),
);
process.exit(0);
`,
      "utf8",
    );
    const raw = runMutationLeg(strykerLegPlan(bigScript, projectRoot));
    // 刻意走默认 mutationSpawn（maxBuffer 修复位，coverage 腿同款回归手法）——
    // 若回落 Node 默认 1MB，本用例将以 error=ENOBUFS → spawn_failed 变红。
    expect(raw.kind).toBe("executed");
    expect(raw.stdout.length).toBeGreaterThan(1024 * 1024);
    const record = normalizeMutationLeg(raw, 0);
    expect(record.verdict).toBe("passed");
  });
});

/** 存在读（run 侧旗标到达证据文件）；缺席 = null。 */
function readIfExists(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

// ============================================================
// 宿主在场 e2e（宿主未装 → skip + 盲区说明——诚实缺席纪律）
// ============================================================

describe("mutation 双腿宿主真实 e2e（宿主未装则诚实 skip）", () => {
  it("真实 StrykerJS：宿主在位时全链真跑判卷", { timeout: 120_000 }, (ctx) => {
    const facts = platformDetectorFacts(process.cwd());
    if (detectStryker(facts).status !== "READY") {
      console.warn(
        "[盲区说明] 宿主未安装 @stryker-mutator/core —— StrykerJS 真实变异 e2e 跳过（诚实缺席，非通过）；判卷矩阵与真实子进程链路已由 fake spawn / fake 脚本覆盖",
      );
      ctx.skip();
    }
    strykerReadyFixture(strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Killed"]] }));
    // 真实探测 + 真实 spawn + 真实 PATH 探针（零 fake；真实链路全段）。
    const record = fullPipeline(policy({ expectedToolVersion: null }), mutationSpawn, platformExecutableProbe);
    // 真实链路判卷态必属诚实七态子集；报告缺席落 not_run（诚实），不冒充通过。
    expect(["passed", "failed", "warning", "not_run"]).toContain(record.verdict);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("真实 mutmut：宿主在位时全链真跑判卷", { timeout: 120_000 }, (ctx) => {
    const probe = spawnSync("python -m mutmut --version", {
      shell: true,
      encoding: "utf8",
      windowsHide: true,
    });
    if (probe.status !== 0) {
      console.warn(
        "[盲区说明] 宿主未安装 mutmut —— Python 变异腿真实 e2e 跳过（诚实缺席，非通过；B2-4 run 期判卷矩阵已由 fake spawn 覆盖）",
      );
      ctx.skip();
    }
    put(
      MUTATION_GATE_CONFIG_FILE,
      JSON.stringify({ runner: "mutmut", command: "python -m mutmut run", changedFiles: ["src"] }),
    );
    put("pyproject.toml", "[tool.mutmut]\n");
    const record = fullPipeline(policy({ expectedToolVersion: "2.0.0" }), mutationSpawn);
    expect(["passed", "failed", "warning", "not_run"]).toContain(record.verdict);
    expect(validate(toGateResultJson(record))).toBe(true);
  });
});

// ============================================================
// 三态 truth-index 记录互异（failed / passed / not_run）
// ============================================================

describe("三态 truth-index 记录互异", () => {
  it("同一 fixture 面：failed / passed / not_run 三份记录逐字段互异且全部过 03 schema", () => {
    strykerReadyFixture(
      strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Survived"], ["BooleanLiteral", "Survived"]] }),
    );
    const failed = fullPipeline();
    strykerReadyFixture(
      strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Killed"], ["BooleanLiteral", "Killed"]] }),
    );
    const passed = fullPipeline();
    // not_run 取「报告缺席」形态（工具在位但无报告——诚实缺席）；上一态的报告文件须真实清除。
    rmSync(join(dir, "reports"), { recursive: true, force: true });
    strykerReadyFixture(null);
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
// provisional 阈值呈报项登记（A4；系统不自批——crap.spec 同款钉子）
// ============================================================

describe("MUTATION provisional 阈值呈报项登记（A4 打包批准位）", () => {
  it("minKillScore=85（L6 锚）/ maxSurvivors（survivor 上限）双双 provisional，词形钉死禁自批", () => {
    expect(MUTATION_PROVISIONAL_REGISTRATIONS).toHaveLength(2);
    for (const row of MUTATION_PROVISIONAL_REGISTRATIONS) {
      expect(row.status).toBe("provisional");
      expect(row.note).toContain("provisional");
      expect(row.note).toContain("A4");
      expect(row.note).toMatch(/系统不自批/);
      expect(row.key).toMatch(/^mutation-gate\.json thresholds\./);
    }
    expect(MUTATION_PROVISIONAL_REGISTRATIONS[0]?.value).toBe(
      MUTATION_PROVISIONAL_THRESHOLDS.minKillScore,
    );
    expect(MUTATION_PROVISIONAL_REGISTRATIONS[0]?.value).toBe(85);
    expect(MUTATION_PROVISIONAL_REGISTRATIONS[1]?.value).toBe(
      MUTATION_PROVISIONAL_THRESHOLDS.maxSurvivors,
    );
  });

  it("执行记录 scopeNote 恒携带 provisional 词形（出厂兜底态）", () => {
    strykerReadyFixture(strykerReport({ "src/calc.ts": [["ArithmeticOperator", "Killed"]] }));
    const record = fullPipeline();
    expect(record.scopeNote).toContain("provisional 待 A4");
  });
});
