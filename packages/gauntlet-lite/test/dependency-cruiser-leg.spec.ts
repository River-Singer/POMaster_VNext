/**
 * dependency-cruiser-leg.spec.ts —— ARCHITECTURE FE（JS/TS）机判腿（P22 / gaps A7）。
 *
 * 覆盖（三态 + 判卷矩阵 + 真实子进程链路）：
 * - detect/prepare：tool=dependency-cruiser 声明 + 配置在位 → READY/declared；配置缺席 →
 *   NOT_INSTALLED / plan.absenceKind=tool_absent → 全链 not_run（非绿非红）；版本锚缺失 →
 *   runner_not_ready；rules 与 tool 混声明 → NOT_INSTALLED（互斥）；tool 词表外 →
 *   NOT_INSTALLED；
 * - run/normalize 判卷矩阵（fake spawn 注入）：JSON 明细 → failed violations=条数 + items
 *   （rule/location/message 三键）；零违规 → passed；JSON 不可解析 → not_run；gate ①a
 *   可执行体 PATH 探测缺席 → not_run；gate ①b 探测语义收紧（Windows cmd status=1 +
 *   error=null / shell exit 127 缺席形态）→ not_run 非绿非红；明细空但 exit 非零（矛盾）
 *   → failed 下限 1；版本漂移 → passed 降 warning；
 * - 真实子进程（fake depcruise 脚本 × 真实 spawnSync 两段式，零安装零网络）+ 大输出
 *   （>1MB JSON 报告）不被 ENOBUFS 截断（maxBuffer=64MB 回归钉）；
 * - 宿主真跑 e2e（fixture 内 junction 复制宿主真实 dependency-cruiser 安装——
 *   node_modules/.bin 解析链可用；宿主未装仍 skip + 盲区说明——诚实缺席）；
 * - 三态 truth-index 记录互异（failed / passed / not_run 过 03 schema 且互异）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  DEPCUISE_METRIC_DIALECT,
  DEPCUISE_TOOL_ID,
  createArchitectureAdapter,
  normalizeDepcruiseLeg,
  runDepcruiseLeg,
  stripQuotesFromPathEnv,
  toGateResultJson,
  type DetectorFacts,
  type ExecutableProbeFn,
  type GatePolicy,
  type GateResultRecord,
  type DepcruiseLegPlan,
  type SpawnFn,
  type SpawnOutcome,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const ROOT = "D:/arch-proj";

function policy(expectedToolVersion = "16.5.0"): GatePolicy {
  return { grn: "GRN-1801", ranAtSeq: 1801, trigger: "on_demand", expectedToolVersion };
}

const TOOL_CONFIG = JSON.stringify({ forbidden: [] });

/** dependency-cruiser 在位的 fake facts（配置文件 + package.json 依赖声明）。 */
function depcruiseFacts(): DetectorFacts {
  return fakeFacts(ROOT, {
    files: {
      [posixJoin(ROOT, "architecture-gate.json")]: JSON.stringify({
        tool: "dependency-cruiser",
        toolRoot: "src",
      }),
      [posixJoin(ROOT, ".dependency-cruiser.cjs")]: TOOL_CONFIG,
      [posixJoin(ROOT, "package.json")]: JSON.stringify({
        devDependencies: { "dependency-cruiser": "^16.5.0" },
      }),
    },
  });
}

/** 声明在但配置缺席的 fake facts（NOT_INSTALLED 路径）。 */
function declarationOnlyFacts(): DetectorFacts {
  return fakeFacts(ROOT, {
    files: {
      [posixJoin(ROOT, "architecture-gate.json")]: JSON.stringify({
        tool: "dependency-cruiser",
      }),
    },
  });
}

/** 按 spawn 次数分派的 fake（第 1 次 = 版本探测，第 2 次 = depcruise 真跑）。 */
function scriptedSpawn(probe: Partial<SpawnOutcome>, run: Partial<SpawnOutcome>): SpawnFn {
  let call = 0;
  return () => {
    call += 1;
    const base = call === 1 ? probe : run;
    return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5, ...base };
  };
}

const VIOLATIONS_JSON = JSON.stringify({
  summary: {
    violations: [
      {
        from: "src/pages/dashboard.ts",
        to: "ag-grid-community",
        rule: { name: "no-direct-ag-grid", severity: "error" },
        comment: "须经 components/grid wrapper",
      },
      {
        from: "src/pages/settings.ts",
        to: "ag-grid-enterprise",
        rule: { name: "no-direct-ag-grid", severity: "error" },
      },
    ],
    ruleCount: 1,
  },
  modules: [{ source: "src/pages/dashboard.ts" }, {}, {}, {}],
});

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

/** 可执行体探测 fake：恒命中（gate ①a PATH 扫描注入面——判卷矩阵与宿主环境无关）。 */
const hitProbe: ExecutableProbeFn = (executable) => `C:/fake-bin/${executable}`;

/** 全链路：prepare（真实探测注入）→ run（spawn 注入）→ normalize（探测面注入 fake 命中）。 */
function fullPipeline(
  facts: DetectorFacts,
  spawn: SpawnFn,
  gatePolicy: GatePolicy = policy(),
): GateResultRecord {
  const adapter = createArchitectureAdapter({
    depcruiseExecutableProbe: hitProbe,
    importLinterExecutableProbe: hitProbe,
  });
  const plan = adapter.prepare({ projectRoot: facts.projectRoot }, gatePolicy, facts);
  const raw = adapter.run(plan, spawn);
  return adapter.normalize(raw, {});
}

// ============================================================
// detect / prepare / 缺席语义
// ============================================================

describe("architecture dependency-cruiser 腿：detect 与 prepare", () => {
  it("tool 声明 + 配置在位 → READY（tool=gauntlet:dependency-cruiser，evidence 合流）", () => {
    const detection = createArchitectureAdapter().detect(depcruiseFacts());
    expect(detection.status).toBe("READY");
    if (detection.status === "READY") {
      expect(detection.tool).toBe(DEPCUISE_TOOL_ID);
      expect(detection.evidence).toContain("dependency-cruiser");
    }
  });

  it("依赖声明在但配置缺席 → NOT_INSTALLED + depcruise --init 指引（禁静默）", () => {
    const detection = createArchitectureAdapter().detect(declarationOnlyFacts());
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/dependency-cruiser 配置/);
      expect(detection.installHint).toMatch(/depcruise --init/);
    }
  });

  it("rules 与 tool 混声明 → NOT_INSTALLED（口径互斥）", () => {
    const detection = createArchitectureAdapter().detect(
      fakeFacts(ROOT, {
        files: {
          [posixJoin(ROOT, "architecture-gate.json")]: JSON.stringify({
            tool: "dependency-cruiser",
            rules: [{ name: "r", scopePrefix: "src/", forbidden: "ag-grid-community" }],
          }),
        },
      }),
    );
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/互斥/);
    }
  });

  it("tool 词表外 → NOT_INSTALLED（闭集指引）", () => {
    const detection = createArchitectureAdapter().detect(
      fakeFacts(ROOT, {
        files: {
          [posixJoin(ROOT, "architecture-gate.json")]: JSON.stringify({ tool: "eslint" }),
        },
      }),
    );
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/dependency-cruiser \| import-linter/);
    }
  });

  it("在位 → declared=true + mode=dependency-cruiser + 命令形态（--output-type json）", () => {
    const adapter = createArchitectureAdapter();
    const plan = adapter.prepare({ projectRoot: ROOT }, policy(), depcruiseFacts());
    expect(plan.declared).toBe(true);
    expect(plan.mode).toBe("dependency-cruiser");
    expect(plan.depcruisePlan?.command).toContain('--config ".dependency-cruiser.cjs"');
    expect(plan.depcruisePlan?.command).toContain("--output-type json");
    expect(plan.depcruisePlan?.toolRoot).toBe("src");
  });

  it("版本锚缺失 → GateAdapterError runner_not_ready（pytest 腿同款纪律）", () => {
    const adapter = createArchitectureAdapter();
    expect(() =>
      adapter.prepare({ projectRoot: ROOT }, { grn: "GRN-1", ranAtSeq: 1 }, depcruiseFacts()),
    ).toThrowError(/runner_not_ready.*expectedToolVersion/s);
  });
});

// ============================================================
// run/normalize 判卷矩阵（fake spawn）
// ============================================================

describe("dependency-cruiser 腿判卷矩阵", () => {
  it("三态① 违规依赖抓红：JSON 明细 → failed violations=条数 + items 三键", () => {
    const record = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        { status: 0, stdout: "16.5.0" },
        { status: 1, stdout: VIOLATIONS_JSON },
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.counts.scanned).toBe(4);
    expect(record.items).toHaveLength(2);
    expect(record.items?.[0]?.rule).toBe("no-direct-ag-grid");
    expect(record.items?.[0]?.location).toBe("src/pages/dashboard.ts -> ag-grid-community");
    expect(record.items?.[0]?.message).toContain("error");
    expect(record.metricDialect).toBe(DEPCUISE_METRIC_DIALECT);
    expect(record.tool).toBe(DEPCUISE_TOOL_ID);
    const doc = toGateResultJson(record);
    if (!validate(doc)) console.error(validate.errors);
    expect(validate(doc)).toBe(true);
  });

  it("三态② 零违规：exit 0 + 空明细 → passed（scanned=modules 数）", () => {
    const record = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        { status: 0, stdout: "16.5.0" },
        {
          status: 0,
          stdout: JSON.stringify({ summary: { violations: [] }, modules: [{}, {}] }),
        },
      ),
    );
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    expect(record.counts.scanned).toBe(2);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("三态③ 报告不可解析 → not_run（禁猜测判卷）", () => {
    const record = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        { status: 0, stdout: "16.5.0" },
        { status: 1, stdout: "depcruise crashed" },
      ),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/不可解析/);
  });

  it("版本探测失败（spawn ENOENT）→ not_run（spawn_failed）", () => {
    const record = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn({ status: null, error: "spawn ENOENT" }, {}),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/版本探测失败/);
  });

  it("gate ①a 命令链可执行体（corepack）PATH 缺席 → spawn_failed（零 spawn，留痕）", () => {
    const calls: string[] = [];
    const spawn: SpawnFn = (command) => {
      calls.push(command);
      return { status: 0, stdout: "", stderr: "", error: null, externalMs: 1 };
    };
    const raw = runDepcruiseLeg(legPlan("D:/x/fake.cjs", "D:/x"), spawn, () => null);
    expect(raw.kind).toBe("spawn_failed");
    expect(raw.failureReason).toMatch(/不在 PATH/);
    expect(raw.failureReason).toMatch(/corepack/);
    expect(calls).toHaveLength(0);
    expect(normalizeDepcruiseLeg(raw, 0).verdict).toBe("not_run");
  });

  it("gate ①b 工具缺席 Windows cmd 形态（status=1+error=null）→ not_run 非绿非红", () => {
    const record = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        {
          status: 1,
          error: null,
          stdout: "",
          stderr: "Command failed: depcruise not found",
        },
        { status: 1, error: null, stdout: "", stderr: "Command failed" },
      ),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/版本探测失败/);
    expect(record.scopeNote).toMatch(/status=1/);
    expect(record.counts.violations).toBe(0);
  });

  it("exit 127 缺席形态不误红：探测 127 → not_run；探测过但真跑 127 空 stdout → not_run", () => {
    // shell 找不到命令（Linux/CI 形态）：gate ①b 在探测侧先拦。
    const probeSide = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        { status: 127, error: null, stdout: "", stderr: "sh: depcruise: command not found" },
        { status: 127, error: null, stdout: "", stderr: "sh: depcruise: command not found" },
      ),
    );
    expect(probeSide.verdict).toBe("not_run");
    expect(probeSide.counts.violations).toBe(0);
    // 若探测侥幸通过而真跑是 127 + 空 stdout：normalize 侧 JSON 可解析门槛兜底 not_run
    // （绝不落入「明细空但 exit 非零 → failed 下限 1」——那是合法 JSON 专属的矛盾分支）。
    const runSide = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        { status: 0, stdout: "16.5.0" },
        { status: 127, error: null, stdout: "", stderr: "sh: depcruise: not found" },
      ),
    );
    expect(runSide.verdict).toBe("not_run");
    expect(runSide.scopeNote).toMatch(/不可解析/);
  });

  it("明细空但 exit 非零（官方语义有 error 级违规）→ failed 下限 1 + 矛盾留痕", () => {
    const record = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        { status: 0, stdout: "16.5.0" },
        { status: 1, stdout: JSON.stringify({ summary: { violations: [] }, modules: [{}] }) },
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.scopeNote).toMatch(/诚实下限/);
  });

  it("版本漂移 → passed 降 warning；failed 不被 cap 洗白", () => {
    const drifted = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        { status: 0, stdout: "17.0.0" },
        { status: 0, stdout: JSON.stringify({ summary: { violations: [] }, modules: [{}] }) },
      ),
    );
    expect(drifted.verdict).toBe("warning");
    expect(drifted.verdictCapReason).toBe("tool_version_drifted");
    const failedWithDrift = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn({ status: 0, stdout: "17.0.0" }, { status: 1, stdout: VIOLATIONS_JSON }),
    );
    expect(failedWithDrift.verdict).toBe("failed");
    expect(failedWithDrift.verdictCapReason).toBeNull();
  });
});

// ============================================================
// 真实子进程链路（fake depcruise 脚本 × 真实 spawnSync；零安装零网络）
// ============================================================

const FAKE_DEPCUISE_CJS = `const mode = process.env.FAKE_DEPCUISE_MODE ?? "clean";
if (process.argv.includes("--version")) {
  process.stdout.write("16.5.0\\n");
  process.exit(0);
}
const payloads = {
  clean: { code: 0, body: JSON.stringify({ summary: { violations: [] }, modules: [{}, {}] }) },
  violations: {
    code: 1,
    body: JSON.stringify({
      summary: {
        violations: [
          { from: "src/a.ts", to: "ag-grid-community", rule: { name: "no-direct-ag-grid", severity: "error" } },
        ],
      },
      modules: [{}, {}, {}],
    }),
  },
  garbage: { code: 1, body: "not json" },
};
const payload = payloads[mode] ?? payloads.clean;
process.stdout.write(payload.body);
process.exit(payload.code);
`;

/** 真实 spawnSync wrapper（PATH 消毒——phaseC 附录 A 教训——+ 注入 FAKE_DEPCUISE_MODE）。 */
function realSpawnWithMode(mode: string): SpawnFn {
  return (command, options) => {
    const res = spawnSync(command, {
      shell: true,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: "utf8",
      windowsHide: true,
      env: stripQuotesFromPathEnv({ ...process.env, FAKE_DEPCUISE_MODE: mode }),
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

function legPlan(scriptPath: string, projectRoot: string): DepcruiseLegPlan {
  return {
    tool: DEPCUISE_TOOL_ID,
    toolVersion: "16.5.0",
    gate: "ARCHITECTURE",
    gateDef: "POLICY.GATE.ARCHITECTURE@0.1.0",
    metricDialect: DEPCUISE_METRIC_DIALECT,
    grn: "GRN-1802",
    ranAtSeq: 1802,
    trigger: "on_demand",
    subjectId: null,
    denominatorRefs: [],
    projectRoot,
    command: `node "${scriptPath}" src --config .dependency-cruiser.cjs --output-type json`,
    versionProbeCommand: `node "${scriptPath}" --version`,
    timeoutMs: 30_000,
    toolRoot: "src",
    configName: ".dependency-cruiser.cjs",
    expectedToolVersion: "16.5.0",
  };
}

describe("dependency-cruiser 腿真实子进程（fake 脚本两段式）", () => {
  const dir = mkdtempSync(join(tmpdir(), "pomaster-depcruise-leg-"));
  const scriptPath = join(dir, "fake-depcruise.cjs");
  writeFileSync(scriptPath, FAKE_DEPCUISE_CJS, "utf8");

  it("clean → 真两段 spawn → passed", { timeout: 30_000 }, () => {
    const raw = runDepcruiseLeg(legPlan(scriptPath, dir), realSpawnWithMode("clean"));
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("16.5.0");
    const record = normalizeDepcruiseLeg(raw, 0);
    expect(record.verdict).toBe("passed");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("violations → 真两段 spawn → failed violations=1 + items", { timeout: 30_000 }, () => {
    const raw = runDepcruiseLeg(legPlan(scriptPath, dir), realSpawnWithMode("violations"));
    const record = normalizeDepcruiseLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.rule).toBe("no-direct-ag-grid");
  });
});

// ============================================================
// 大输出（maxBuffer）：默认 spawn 的 64MB 缓冲——>1MB 合法 JSON 报告不被 ENOBUFS 打断
// （真实项目 depcruise JSON 报告 ~1.3MB 被 Node 默认 1MB 打断是 P22 红队实测形态）
// ============================================================

const BIG_OUTPUT_DEPCUISE_CJS = `if (process.argv.includes("--version")) {
  process.stdout.write("16.5.0\\n");
  process.exit(0);
}
const modules = [];
for (let i = 0; i < 40000; i++) modules.push({ source: "src/module-" + i + ".ts" });
process.stdout.write(JSON.stringify({ summary: { violations: [] }, modules }));
process.exit(0);
`;

describe("dependency-cruiser 腿大输出 maxBuffer（默认 spawn 64MB）", () => {
  const dir = mkdtempSync(join(tmpdir(), "pomaster-depcruise-big-"));
  const scriptPath = join(dir, "big-depcruise.cjs");
  writeFileSync(scriptPath, BIG_OUTPUT_DEPCUISE_CJS, "utf8");

  it(">1MB 合法 JSON 报告走通两段 spawn 与判卷（passed，scanned=40000）", { timeout: 60_000 }, () => {
    // 刻意走默认 depcruiseSpawn（maxBuffer 修复位）；修复前 Node 默认 1MB
    // → error=ENOBUFS → spawn_failed，本用例红。
    const raw = runDepcruiseLeg(legPlan(scriptPath, dir));
    expect(raw.kind).toBe("executed");
    expect(raw.stdout.length).toBeGreaterThan(1024 * 1024);
    const record = normalizeDepcruiseLeg(raw, 0);
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBe(40000);
  });
});

// ============================================================
// 宿主真跑 e2e（fixture junction 复制宿主真实安装——node_modules/.bin 解析链可用；
// 宿主未装仍 skip + 盲区说明——诚实缺席）
// ============================================================

describe("dependency-cruiser 腿宿主真实 e2e", () => {
  it("宿主安装 dependency-cruiser 时：真实 depcruise 全链路 → 结构性判卷（不恒真）", { timeout: 120_000 }, (ctx) => {
    // 宿主真装判定 = require.resolve 真实解析（devDependencies 声明 ≠ 已安装；
    // 根级/包级安装都从本 spec 文件位置向上走 node_modules 解析——piazza 单一真相）。
    const require = createRequire(import.meta.url);
    let depcruisePkgDir: string | null = null;
    try {
      depcruisePkgDir = dirname(require.resolve("dependency-cruiser/package.json"));
    } catch {
      depcruisePkgDir = null;
    }
    if (depcruisePkgDir === null) {
      console.warn(
        "[盲区说明] 宿主未安装 dependency-cruiser —— 真实 depcruise e2e 跳过（诚实缺席，非通过）；判卷矩阵与真实子进程链路已由 fake spawn / fake 脚本覆盖",
      );
      ctx.skip();
      return;
    }
    // 前置探测：corepack/pnpm 不可用（命令链第一环）→ 真分支不可走通 → 诚实 skip，
    // 禁因宿主工具链缺失误报红（runGate 判卷矩阵已由 fake spawn 覆盖缺席语义）。
    const corepackProbe = spawnSync("corepack pnpm --version", {
      shell: true,
      encoding: "utf8",
      windowsHide: true,
      env: stripQuotesFromPathEnv({ ...process.env }),
    });
    if (corepackProbe.error !== null || corepackProbe.status !== 0) {
      console.warn(
        "[盲区说明] 宿主 corepack/pnpm 不可用 —— 真实 depcruise e2e 跳过（诚实缺席，非通过）",
      );
      ctx.skip();
      return;
    }
    // —— fixture 布局修正（P22 审计 MINOR：孤立 tmp fixture 无 node_modules，
    // `corepack pnpm exec depcruise` 沿 node_modules/.bin 解析必然失败 → 假 not_run）：
    // junction（Windows 免管理员）/symlink dependency-cruiser 包目录 + 复制宿主真实
    // .bin/depcruise* shims（shim 内相对路径经链接落回真实包；依赖仍沿真实包位置
    // realpath 解析）。验收 = 宿主真装时本分支可真实走通；宿主未装仍 skip。
    const realBinDir = join(dirname(depcruisePkgDir), "..", ".bin");
    const binShims = existsSync(realBinDir)
      ? readdirSync(realBinDir).filter((name) => /^depcruise(\.(cmd|ps1))?$/.test(name))
      : [];
    if (binShims.length === 0) {
      console.warn(
        "[盲区说明] 宿主 .bin 无 depcruise shims（非标准安装布局）—— 真实 e2e 跳过（诚实缺席）",
      );
      ctx.skip();
      return;
    }
    const root = mkdtempSync(join(tmpdir(), "pomaster-depcruise-e2e-"));
    const fixtureBin = join(root, "node_modules", ".bin");
    mkdirSync(fixtureBin, { recursive: true });
    symlinkSync(depcruisePkgDir, join(root, "node_modules", "dependency-cruiser"), "junction");
    for (const shim of binShims) {
      copyFileSync(join(realBinDir, shim), join(fixtureBin, shim));
    }
    writeFileSync(
      join(root, "architecture-gate.json"),
      // toolRoot 用 glob 词形：真实 depcruise v16 在 Windows 下对裸目录参数的发现为
      // 0 modules（实测形态；文件/glob 参数正常）——glob 是真实受治项目在 Windows 的
      // 可用配置词形，fixture 与生产同构。
      JSON.stringify({ tool: "dependency-cruiser", toolRoot: "src/**/*.ts" }),
      "utf8",
    );
    writeFileSync(
      join(root, ".dependency-cruiser.cjs"),
      "module.exports = { forbidden: [{ name: 'no-lodash', severity: 'error', from: {}, to: { path: 'lodash' } }] };",
      "utf8",
    );
    // packageManager 与本仓同词形——corepack 在 fixture 内解析到同一 pnpm（生产同构）。
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        private: true,
        packageManager: "pnpm@9.15.9",
        devDependencies: { "dependency-cruiser": "^16.5.0" },
      }),
      "utf8",
    );
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export const ok = 1;\n", "utf8");
    const adapter = createArchitectureAdapter();
    const plan = adapter.prepare({ projectRoot: root }, policy());
    const raw = adapter.run(plan);
    const record = adapter.normalize(raw, {});
    expect(record.verdict).toBe("passed");
    expect(record.counts.scanned).toBeGreaterThan(0);
  });
});

// ============================================================
// 三态 truth-index 记录互异（failed / passed / not_run）
// ============================================================

describe("三态 truth-index 记录互异", () => {
  it("同一声明面：failed / passed / not_run 三份记录互异且全部过 03 schema", () => {
    const failed = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        { status: 0, stdout: "16.5.0" },
        { status: 1, stdout: VIOLATIONS_JSON },
      ),
    );
    const passed = fullPipeline(
      depcruiseFacts(),
      scriptedSpawn(
        { status: 0, stdout: "16.5.0" },
        {
          status: 0,
          stdout: JSON.stringify({ summary: { violations: [] }, modules: [{}, {}] }),
        },
      ),
    );
    const notRun = fullPipeline(
      declarationOnlyFacts(),
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
