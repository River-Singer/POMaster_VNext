/**
 * import-linter-leg.spec.ts —— ARCHITECTURE BE-Python 机判腿（P22 / gaps A7）。
 *
 * 覆盖（三态 + 判卷矩阵 + 真实子进程链路 + 探测缺席语义）：
 * - detect/prepare：tool=import-linter 声明 + 配置在位 → READY/declared；配置缺席 →
 *   NOT_INSTALLED / tool_absent → 全链 not_run（非绿非红）；版本锚缺失 → runner_not_ready；
 * - run/normalize 判卷矩阵（fake spawn 注入；按工具实际能力面——无机器可读输出，
 *   退出码官方语义 + stdout 文本两代词形宽容重算）：exit 1 + v2 总结行 → failed
 *   violations=broken 数；exit 0 + 总结行 → passed；gate ②：exit 1 无总结行 → not_run
 *   （执行证据不足，禁「诚实下限 1」坐实幻觉 failed——P22 红队 MAJOR 缺席误红修复）；
 *   exit 2 → not_run；gate ①a 可执行体 PATH 探测缺席 → not_run；gate ①b 探测语义
 *   收紧（Windows cmd status=1+error=null 缺席形态）→ not_run；exit 0 但总结行
 *   broken>0（矛盾）→ failed（重算权威）；版本漂移 → passed 降 warning；
 * - 真实子进程（fake lint-imports 脚本 × 真实 spawnSync 两段式，零安装零网络）+ 大输出
 *   （>1MB 默认缓冲）不被 ENOBUFS 截断（maxBuffer=64MB 回归钉）；
 * - 宿主探测缺席 → NOT_RUN 语义验证（Python 生态缺席的诚实判卷路径——出口判据 3 的
 *   「另一工具探测 + NOT_RUN 语义」面）；
 * - 三态 truth-index 记录互异（failed / passed / not_run 过 03 schema 且互异）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  IMPORT_LINTER_METRIC_DIALECT,
  IMPORT_LINTER_TOOL_ID,
  createArchitectureAdapter,
  normalizeImportLinterLeg,
  parseImportLinterStdout,
  runImportLinterLeg,
  stripQuotesFromPathEnv,
  toGateResultJson,
  type DetectorFacts,
  type ExecutableProbeFn,
  type GatePolicy,
  type GateResultRecord,
  type ImportLinterLegPlan,
  type SpawnFn,
  type SpawnOutcome,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";
import { fakeFacts, posixJoin } from "./helpers.js";

const ROOT = "D:/py-proj";

function policy(expectedToolVersion = "2.1.0"): GatePolicy {
  return { grn: "GRN-1901", ranAtSeq: 1901, trigger: "on_demand", expectedToolVersion };
}

/** import-linter 在位的 fake facts（.importlinter 配置）。 */
function importLinterFacts(): DetectorFacts {
  return fakeFacts(ROOT, {
    files: {
      [posixJoin(ROOT, "architecture-gate.json")]: JSON.stringify({ tool: "import-linter" }),
      [posixJoin(ROOT, ".importlinter")]: "[importlinter]\nroot_packages = myapp\n",
    },
  });
}

/** 声明在但配置缺席的 fake facts（NOT_INSTALLED 路径）。 */
function declarationOnlyFacts(): DetectorFacts {
  return fakeFacts(ROOT, {
    files: {
      [posixJoin(ROOT, "architecture-gate.json")]: JSON.stringify({ tool: "import-linter" }),
    },
  });
}

/** 按 spawn 次数分派的 fake（第 1 次 = 版本探测，第 2 次 = lint-imports 真跑）。 */
function scriptedSpawn(probe: Partial<SpawnOutcome>, run: Partial<SpawnOutcome>): SpawnFn {
  let call = 0;
  return () => {
    call += 1;
    const base = call === 1 ? probe : run;
    return { status: 0, stdout: "", stderr: "", error: null, externalMs: 5, ...base };
  };
}

const BROKEN_STDOUT = [
  "============",
  "import-linter",
  "============",
  "",
  "-------------",
  "Contracts",
  "-------------",
  "",
  "Analyzed 34 files",
  "",
  "Contracts: 4 kept, 2 broken.",
  "",
  "myapp.services cannot import myapp.api (contract: layered)",
  "myapp.cli cannot import myapp.api (contract: layered)",
].join("\n");

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

describe("architecture import-linter 腿：detect 与 prepare", () => {
  it("tool 声明 + .importlinter 在位 → READY（tool=gauntlet:import-linter）", () => {
    const detection = createArchitectureAdapter().detect(importLinterFacts());
    expect(detection.status).toBe("READY");
    if (detection.status === "READY") {
      expect(detection.tool).toBe(IMPORT_LINTER_TOOL_ID);
      expect(detection.evidence).toContain(".importlinter");
    }
  });

  it("配置缺席 → NOT_INSTALLED + pip install 指引（禁静默）", () => {
    const detection = createArchitectureAdapter().detect(declarationOnlyFacts());
    expect(detection.status).toBe("NOT_INSTALLED");
    if (detection.status === "NOT_INSTALLED") {
      expect(detection.reason).toMatch(/import-linter 配置/);
      expect(detection.installHint).toMatch(/pip install import-linter/);
    }
  });

  it("在位 → declared=true + mode=import-linter + 命令=lint-imports", () => {
    const adapter = createArchitectureAdapter();
    const plan = adapter.prepare({ projectRoot: ROOT }, policy(), importLinterFacts());
    expect(plan.declared).toBe(true);
    expect(plan.mode).toBe("import-linter");
    expect(plan.importLinterPlan?.command).toBe("lint-imports");
    expect(plan.toolConfigName).toBe(".importlinter");
  });

  it("版本锚缺失 → GateAdapterError runner_not_ready（pytest 腿同款纪律）", () => {
    const adapter = createArchitectureAdapter();
    expect(() =>
      adapter.prepare(
        { projectRoot: ROOT },
        { grn: "GRN-1", ranAtSeq: 1 },
        importLinterFacts(),
      ),
    ).toThrowError(/runner_not_ready.*expectedToolVersion/s);
  });
});

// ============================================================
// 文本重算器（两代词形宽容）
// ============================================================

describe("parseImportLinterStdout", () => {
  it("v2 总结行 / v1 标题行两代词形都能重算 broken；kept 只在 v2 出现", () => {
    const v2 = parseImportLinterStdout("Analyzed 34 files\nContracts: 4 kept, 2 broken.");
    expect(v2.broken).toBe(2);
    expect(v2.kept).toBe(4);
    const v1 = parseImportLinterStdout("Analyzed 12 files\nBroken contracts (3)\n...");
    expect(v1.broken).toBe(3);
    expect(v1.kept).toBe(0);
    const none = parseImportLinterStdout("unexpected shape");
    expect(none.broken).toBeNull();
    expect(none.kept).toBe(0);
  });
});

// ============================================================
// run/normalize 判卷矩阵（fake spawn）
// ============================================================

describe("import-linter 腿判卷矩阵", () => {
  it("三态① broken contracts 抓红：exit 1 + v2 总结行 → failed violations=broken 数 + items", () => {
    const record = fullPipeline(
      importLinterFacts(),
      scriptedSpawn(
        { status: 0, stdout: "import-linter 2.1.0" },
        { status: 1, stdout: BROKEN_STDOUT },
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.counts.scanned).toBe(6);
    expect(record.items?.length).toBeGreaterThan(0);
    expect(record.items?.[0]?.rule).toBe("import_linter_contract_broken");
    expect(record.items?.[0]?.location).toBe(".importlinter");
    expect(record.metricDialect).toBe(IMPORT_LINTER_METRIC_DIALECT);
    expect(record.tool).toBe(IMPORT_LINTER_TOOL_ID);
    const doc = toGateResultJson(record);
    if (!validate(doc)) console.error(validate.errors);
    expect(validate(doc)).toBe(true);
  });

  it("三态② 全部契约保持：exit 0 + 总结行 → passed", () => {
    const record = fullPipeline(
      importLinterFacts(),
      scriptedSpawn(
        { status: 0, stdout: "import-linter 2.1.0" },
        { status: 0, stdout: "Analyzed 34 files\nContracts: 6 kept, 0 broken." },
      ),
    );
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    expect(record.counts.scanned).toBe(6);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("三态③ 工具执行错误：exit 2 → not_run + stderr 摘录", () => {
    const record = fullPipeline(
      importLinterFacts(),
      scriptedSpawn(
        { status: 0, stdout: "import-linter 2.1.0" },
        { status: 2, stdout: "", stderr: "Invalid configuration" },
      ),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/工具执行错误/);
    expect(record.scopeNote).toContain("Invalid configuration");
  });

  it("版本探测失败（spawn ENOENT）→ not_run（spawn_failed，禁猜测版本口径）", () => {
    const record = fullPipeline(
      importLinterFacts(),
      scriptedSpawn({ status: null, error: "spawn ENOENT" }, {}),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/版本探测失败/);
  });

  it("gate ①a 可执行体 PATH 探测缺席 → spawn_failed（零 spawn，留痕带 PATH 语义）", () => {
    const calls: string[] = [];
    const spawn: SpawnFn = (command) => {
      calls.push(command);
      return { status: 0, stdout: "", stderr: "", error: null, externalMs: 1 };
    };
    // 生产命令词形（prepare 产物 = "lint-imports"）：首 token 即被探可执行体。
    const plan: ImportLinterLegPlan = {
      ...legPlan("D:/x/fake.cjs", "D:/x"),
      command: "lint-imports",
      versionProbeCommand: "lint-imports --version",
    };
    const raw = runImportLinterLeg(plan, spawn, () => null);
    expect(raw.kind).toBe("spawn_failed");
    expect(raw.failureReason).toMatch(/不在 PATH/);
    expect(raw.failureReason).toMatch(/lint-imports/);
    expect(calls).toHaveLength(0);
    const record = normalizeImportLinterLeg(raw, 0);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/不在 PATH/);
  });

  it("gate ①b 配置在位 + 工具缺席（Windows cmd status=1+error=null 形态）→ not_run 非绿非红", () => {
    // P22 红队 D1 形态：cmd 找不到命令时 spawn 层 error=null、status=1——
    // 旧实现视作「正常执行」落入真执行分支 → 幻觉 failed；现在探测语义收紧先拦。
    const cmdNotFound: Partial<SpawnOutcome> = {
      status: 1,
      error: null,
      stdout: "",
      stderr: "'lint-imports' 不是内部或外部命令，也不是可运行的程序或批处理文件。",
    };
    const record = fullPipeline(importLinterFacts(), scriptedSpawn(cmdNotFound, cmdNotFound));
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/版本探测失败/);
    expect(record.scopeNote).toMatch(/status=1/);
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("gate ② exit 1 无总结行词形 → not_run（执行证据不足，禁诚实下限坐实幻觉 failed）", () => {
    const record = fullPipeline(
      importLinterFacts(),
      scriptedSpawn(
        { status: 0, stdout: "import-linter 2.1.0" },
        { status: 1, stdout: "some unexpected wording" },
      ),
    );
    expect(record.verdict).toBe("not_run");
    expect(record.counts.violations).toBe(0);
    expect(record.scopeNote).toMatch(/执行证据不足/);
    expect(record.scopeNote).toContain("some unexpected wording");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("exit 0 但总结行 broken>0（矛盾）→ failed（C5 重算权威）", () => {
    const record = fullPipeline(
      importLinterFacts(),
      scriptedSpawn(
        { status: 0, stdout: "import-linter 2.1.0" },
        { status: 0, stdout: "Contracts: 3 kept, 1 broken." },
      ),
    );
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
  });

  it("版本漂移 → passed 降 warning；failed 不被 cap 洗白", () => {
    const drifted = fullPipeline(
      importLinterFacts(),
      scriptedSpawn(
        { status: 0, stdout: "import-linter 3.0.0" },
        { status: 0, stdout: "Contracts: 2 kept, 0 broken." },
      ),
    );
    expect(drifted.verdict).toBe("warning");
    expect(drifted.verdictCapReason).toBe("tool_version_drifted");
    const failedWithDrift = fullPipeline(
      importLinterFacts(),
      scriptedSpawn(
        { status: 0, stdout: "import-linter 3.0.0" },
        { status: 1, stdout: BROKEN_STDOUT },
      ),
    );
    expect(failedWithDrift.verdict).toBe("failed");
    expect(failedWithDrift.verdictCapReason).toBeNull();
  });
});

// ============================================================
// 真实子进程链路（fake lint-imports 脚本 × 真实 spawnSync；零安装零网络）
// ============================================================

const FAKE_LINT_IMPORTS_CJS = `const mode = process.env.FAKE_LINT_IMPORTS_MODE ?? "clean";
if (process.argv.includes("--version")) {
  process.stdout.write("import-linter 2.1.0\\n");
  process.exit(0);
}
const payloads = {
  clean: { code: 0, body: "Analyzed 12 files\\nContracts: 3 kept, 0 broken." },
  broken: { code: 1, body: "Analyzed 12 files\\nContracts: 2 kept, 1 broken.\\nmyapp.x cannot import myapp.api" },
  badconfig: { code: 2, body: "", err: "Invalid configuration" },
};
const payload = payloads[mode] ?? payloads.clean;
if (payload.err) process.stderr.write(payload.err);
process.stdout.write(payload.body);
process.exit(payload.code);
`;

/** 真实 spawnSync wrapper（PATH 消毒——phaseC 附录 A 教训——+ 注入 FAKE_LINT_IMPORTS_MODE）。 */
function realSpawnWithMode(mode: string): SpawnFn {
  return (command, options) => {
    const res = spawnSync(command, {
      shell: true,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: "utf8",
      windowsHide: true,
      env: stripQuotesFromPathEnv({ ...process.env, FAKE_LINT_IMPORTS_MODE: mode }),
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

function legPlan(scriptPath: string, projectRoot: string): ImportLinterLegPlan {
  return {
    tool: IMPORT_LINTER_TOOL_ID,
    toolVersion: "2.1.0",
    gate: "ARCHITECTURE",
    gateDef: "POLICY.GATE.ARCHITECTURE@0.1.0",
    metricDialect: IMPORT_LINTER_METRIC_DIALECT,
    grn: "GRN-1902",
    ranAtSeq: 1902,
    trigger: "on_demand",
    subjectId: null,
    denominatorRefs: [],
    projectRoot,
    command: `node "${scriptPath}"`,
    versionProbeCommand: `node "${scriptPath}" --version`,
    timeoutMs: 30_000,
    configName: ".importlinter",
    expectedToolVersion: "2.1.0",
  };
}

describe("import-linter 腿真实子进程（fake 脚本两段式）", () => {
  const dir = mkdtempSync(join(tmpdir(), "pomaster-lintimports-leg-"));
  const scriptPath = join(dir, "fake-lint-imports.cjs");
  writeFileSync(scriptPath, FAKE_LINT_IMPORTS_CJS, "utf8");

  it("clean → 真两段 spawn → passed", { timeout: 30_000 }, () => {
    const raw = runImportLinterLeg(legPlan(scriptPath, dir), realSpawnWithMode("clean"));
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("2.1.0");
    const record = normalizeImportLinterLeg(raw, 0);
    expect(record.verdict).toBe("passed");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("broken → 真两段 spawn → failed violations=1 + 行级 items", { timeout: 30_000 }, () => {
    const raw = runImportLinterLeg(legPlan(scriptPath, dir), realSpawnWithMode("broken"));
    const record = normalizeImportLinterLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.message).toContain("cannot import");
  });

  it("badconfig → 真两段 spawn → not_run（exit 2 = 工具执行错误）", { timeout: 30_000 }, () => {
    const raw = runImportLinterLeg(legPlan(scriptPath, dir), realSpawnWithMode("badconfig"));
    const record = normalizeImportLinterLeg(raw, 0);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("Invalid configuration");
  });
});

// ============================================================
// 大输出（maxBuffer）：默认 spawn 的 64MB 缓冲——>1MB stdout 不被 ENOBUFS 打断
// （Node 默认 1MB 会被真实大仓 stdout 打断成 ENOBUFS → 结构性 not_run，P22 红队 MAJOR）
//
// 跨平台确定性构造（ubuntu CI 实证修复）：单次 process.stdout.write(>管道缓冲) +
// 立即 process.exit() 在 POSIX 管道上会截断输出（写未落管进程已退——同脚本
// Windows 全量 / ubuntu 仅 ~0.66MB）。修复双管齐下：
// - 子进程侧 fs.writeSync(1,…) 循环补写（部分写/EAGAIN 重试）——「产出 >1MB
//   stdout」在本体层面跨平台保证全量落管，再 process.exit；
// - 填充行定宽（零填充词形）→ 期望字节数闭式可算，断言从 >1MB 收紧到精确相等
//   ——任何截断即刻红；若 spawn 回落 Node 默认 1MB，则 maxBuffer 超限 →
//   error=ENOBUFS → spawn_failed，同样红（原回归意图不变）。
// ============================================================

const BIG_FILLER_LINE = "module-00000 processed"; // 22 字符定宽（序号零填充）
const BIG_FILLER_LINES = 60000;
const BIG_TAIL_TEXT =
  "Contracts: 3 kept, 2 broken.\n" +
  "myapp.services cannot import myapp.api (contract: layered)\n" +
  "myapp.cli cannot import myapp.api (contract: layered)";
/** 子进程产出的 stdout 精确字节数（每填充行 +\n；尾行不再带结尾换行——与脚本逐字节同构，ASCII → length==字节）。 */
const BIG_STDOUT_EXPECTED_BYTES =
  (BIG_FILLER_LINE.length + 1) * BIG_FILLER_LINES + BIG_TAIL_TEXT.length;

const BIG_OUTPUT_LINT_IMPORTS_CJS = `const { writeSync } = require("node:fs");
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
  process.stdout.write("import-linter 2.1.0\\n");
  process.exit(0);
}
writeAll(("${BIG_FILLER_LINE}\\n").repeat(${BIG_FILLER_LINES}));
writeAll(${JSON.stringify(BIG_TAIL_TEXT)});
process.exit(1);
`;

describe("import-linter 腿大输出 maxBuffer（默认 spawn 64MB）", () => {
  const dir = mkdtempSync(join(tmpdir(), "pomaster-lintimports-big-"));
  const scriptPath = join(dir, "big-lint-imports.cjs");
  writeFileSync(scriptPath, BIG_OUTPUT_LINT_IMPORTS_CJS, "utf8");

  it(">1MB 合法输出走通两段 spawn 与判卷（failed violations=2，stdout 字节数精确恒等）", { timeout: 60_000 }, () => {
    // fixture 自证：构造目标 > Node 默认 1MB（本用例的回归判据前提）。
    expect(BIG_STDOUT_EXPECTED_BYTES).toBeGreaterThan(1024 * 1024);
    // 刻意走默认 importLinterSpawn（maxBuffer 修复位）；修复前 Node 默认 1MB
    // → error=ENOBUFS → spawn_failed，本用例红。
    const raw = runImportLinterLeg(legPlan(scriptPath, dir));
    expect(raw.kind).toBe("executed");
    // 精确恒等（强于原 >1MB）：跨 OS 全量落管，任何截断即刻红。
    expect(raw.stdout.length).toBe(BIG_STDOUT_EXPECTED_BYTES);
    const record = normalizeImportLinterLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(2);
    expect(record.counts.scanned).toBe(5);
  });
});

// ============================================================
// 三态 truth-index 记录互异（failed / passed / not_run）
// ============================================================

describe("三态 truth-index 记录互异", () => {
  it("同一声明面：failed / passed / not_run 三份记录互异且全部过 03 schema", () => {
    const failed = fullPipeline(
      importLinterFacts(),
      scriptedSpawn(
        { status: 0, stdout: "import-linter 2.1.0" },
        { status: 1, stdout: BROKEN_STDOUT },
      ),
    );
    const passed = fullPipeline(
      importLinterFacts(),
      scriptedSpawn(
        { status: 0, stdout: "import-linter 2.1.0" },
        { status: 0, stdout: "Contracts: 6 kept, 0 broken." },
      ),
    );
    const notRun = fullPipeline(declarationOnlyFacts(), scriptedSpawn({}, {}));
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
