/**
 * crap.spec.ts —— CRAP 原生计算器（P23 / 随版计划 Batch 2 B2-2）。
 *
 * 覆盖（P23 出口判据 2「CRAP 由 POMaster 公式计算且算例对账精确（不是从工具输出
 * 直接抄）——公式实现错了=MAJOR」+ 出口判据 3 档位语义 + 出口判据 5 阈值 provisional）：
 * - PRD §28.1 公式 CRAP = Complexity²×(1−Coverage)³+Complexity 手工算例逐值对账
 *   （全部取二进制精确算例：Coverage ∈ {0, 0.25, 0.5, 0.75, 1}，逐值 toBe 精确相等，
 *   禁 toBeCloseTo 含糊）；
 * - 输入域 fail-closed（complexity 非负有限 / coverage ∈[0,1]；越域抛错禁静默钳位）；
 * - 单调性性质（复杂度↑⇒CRAP↑；覆盖↑⇒CRAP↓——公式实现方向性错误即红）；
 * - 复杂度报告解析（radon 词形取文件内最大块复杂度 / 直拍数字词形；词形之外一律
 *   malformed → null；工具预计算的 crap 字段不消费——生成者/判卷者分离）；
 * - 全链路判卷矩阵（coverage-adapter 组装、真实临时目录文件输入）：HARDENING 超标
 *   抓红（items 携带公式输入可复算对账）/ 达标绿 / STANDARD 档超标降 warning 呈报
 *   （HARDENING-only 生效，非静默 passed）/ 缺复杂度或覆盖率输入 = 显式 not_run
 *   非默认值（P23 出口判据）/ 连接缺口 notApplicable 显式计数 / 零命中自我怀疑 /
 *   反向连接披露（P23 红队 MINOR：覆盖率有而复杂度无的文件 scopeNote 显式计数，
 *   不入分母不影响判卷，coverage_unmatched 词形）；
 * - MINIMAL 档合法缺席（policy_skip：not_run + notApplicable=1 + 机器可辨口径）；
 * - 阈值配置化（config maxCrap 生效）+ provisional 呈报项登记（词形钉住「provisional」
 *   「A4」——系统不自批为永久值）；
 * - 三态 truth-index 记录互异 + 全部过 03 schema。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeCrap,
  createCrapGateAdapter,
  CRAP_DEFERRED_CAP,
  CRAP_GATE_DEF,
  CRAP_METRIC_DIALECT,
  CRAP_POLICY_SKIP_METRIC_DIALECT,
  CRAP_PROVISIONAL_MAX_CRAP,
  CRAP_PROVISIONAL_REGISTRATION,
  CRAP_TOOL_ID,
  DEFAULT_GATE_TIER,
  GATE_TIER_VALUES,
  normalizeCrapLeg,
  parseComplexityReport,
  platformDetectorFacts,
  PROVISIONAL_THRESHOLD_REGISTRATIONS,
  toGateResultJson,
  ZERO_MATCHED_CAP,
  type CrapLegOutput,
  type CrapLegPlan,
  type GatePolicy,
  type GateResultRecord,
  type GateTier,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

// ============================================================
// 公式：手工算例逐值对账（PRD §28.1；二进制精确算例，禁含糊比较）
// ============================================================

describe("computeCrap：PRD §28.1 公式手工算例逐值对账（公式实现错了=MAJOR）", () => {
  // 手工推导：CRAP = c² × (1−cov)³ + c。
  it.each([
    // [complexity, coverage, 期望 CRAP, 手工推导]
    [1, 0, 2, "1²×(1−0)³+1 = 1+1 = 2"],
    [5, 0, 30, "5²×1+5 = 25+5 = 30"],
    [5, 1, 5, "5²×0³+5 = 0+5 = 5（满覆盖 → CRAP=complexity）"],
    [2, 1, 2, "2²×0+2 = 2"],
    [6, 0.5, 10.5, "6²×(0.5)³+6 = 36×0.125+6 = 4.5+6"],
    [8, 0.5, 16, "8²×0.125+8 = 64×0.125+8 = 8+8"],
    [3, 0.75, 3.140625, "3²×(0.25)³+3 = 9×0.015625+3 = 0.140625+3"],
    [10, 0.25, 52.1875, "10²×(0.75)³+10 = 100×0.421875+10 = 42.1875+10"],
    [4, 0.25, 10.75, "4²×(0.75)³+4 = 16×0.421875+4 = 6.75+4"],
    [0, 0, 0, "0²×1+0 = 0"],
    [0, 1, 0, "0²×0+0 = 0"],
  ])("crap($0, $1) === $2（$3）", (complexity, coverage, expected) => {
    expect(computeCrap(complexity as number, coverage as number)).toBe(expected);
  });

  it("方向性性质：复杂度↑（覆盖固定）⇒ CRAP 严格递增；覆盖↑（复杂度固定>0）⇒ CRAP 严格递减", () => {
    for (let c = 1; c <= 12; c++) {
      expect(computeCrap(c + 1, 0.5)).toBeGreaterThan(computeCrap(c, 0.5));
    }
    // 覆盖取二进制精确的八分点（0, 0.125, …, 1），禁浮点噪声干扰严格不等号。
    for (let k = 0; k < 8; k++) {
      expect(computeCrap(7, k / 8)).toBeGreaterThan(computeCrap(7, (k + 1) / 8));
    }
  });

  it("输入域 fail-closed：越域抛错（禁静默钳位/默认值）", () => {
    for (const bad of [-1, NaN, Infinity, -0.001]) {
      expect(() => computeCrap(bad, 0.5)).toThrowError(/complexity/);
    }
    for (const bad of [-0.1, 1.1, NaN, Infinity, -Infinity]) {
      expect(() => computeCrap(5, bad)).toThrowError(/coverage/);
    }
  });
});

// ============================================================
// 复杂度报告解析（fail-closed；工具预计算 CRAP 不消费）
// ============================================================

describe("parseComplexityReport：两种合法词形 + 词形之外一律 malformed", () => {
  it("radon cc --json 词形：map<file, blocks[{complexity}]> → 文件内最大块复杂度", () => {
    const report = parseComplexityReport(
      JSON.stringify({
        "src/a.py": [
          { type: "function", name: "f", complexity: 6, lineno: 1 },
          { type: "function", name: "g", complexity: 2, lineno: 8 },
        ],
        "src/b.py": [{ type: "class", name: "C", complexity: 3 }],
      }),
    );
    expect(report?.get("src/a.py")).toBe(6);
    expect(report?.get("src/b.py")).toBe(3);
    expect(report?.size).toBe(2);
  });

  it("直拍数字词形：map<file, number>；键分隔符/./ 前缀归一", () => {
    const report = parseComplexityReport(
      JSON.stringify({ "src\\win.py": 4, "./rel.py": 7 }),
    );
    expect(report?.get("src/win.py")).toBe(4);
    expect(report?.get("rel.py")).toBe(7);
  });

  it("生成者/判卷者分离：块内工具预计算的 crap 字段不消费（公式只在本侧重算）", () => {
    const report = parseComplexityReport(
      JSON.stringify({ "src/liar.py": [{ complexity: 5, crap: 0 }] }),
    );
    // 工具谎报 crap=0 不影响：解析出的复杂度是 5，判卷用本侧公式重算（c=5, cov=0 → CRAP=30）。
    expect(report?.get("src/liar.py")).toBe(5);
  });

  it.each([
    ["非 JSON 文本", "not json {"],
    ["root 是数组", JSON.stringify([{ complexity: 1 }])],
    ["root 是标量", JSON.stringify(42)],
    ["负复杂度数字", JSON.stringify({ "a.py": -3 })],
    ["值为 null（非数字非数组）", JSON.stringify({ "a.py": null })],
    ["数组内块缺 complexity 字段", JSON.stringify({ "a.py": [{ name: "f" }] })],
    ["数组内块是非对象", JSON.stringify({ "a.py": [5] })],
    ["空数组（文件分母必须在场）", JSON.stringify({ "a.py": [] })],
    ["值为字符串", JSON.stringify({ "a.py": "6" })],
  ])("malformed：%s → null（交 not_run 错误态，禁默认值）", (_label, text) => {
    expect(parseComplexityReport(text)).toBeNull();
  });
});

// ============================================================
// 全链路判卷矩阵（coverage-adapter 组装 + 真实临时目录文件输入）
// ============================================================

/** 真实临时目录项目（文件直落磁盘——run 侧 readFileSync 真读，零 fake I/O）。 */
function crapProject(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "pomaster-crap-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

/** c8 coverage-summary 词形报告（totals 合法 + 逐文件行口径；计数与 pct 一致——C5 重算后判卷值 = pct）。 */
function c8Report(files: Readonly<Record<string, number>>): string {
  const entries: Record<string, unknown> = {
    total: {
      lines: { pct: 50, covered: 1, total: 2 },
      branches: { pct: 100, covered: 2, total: 2 },
      functions: { pct: 100, covered: 1, total: 1 },
      statements: { pct: 50, covered: 1, total: 2 },
    },
  };
  for (const [file, linesPct] of Object.entries(files)) {
    entries[file] = {
      // 文件级 100 行分母：covered = linesPct（0-100 整数），重算值 = linesPct。
      lines: { pct: linesPct, covered: Math.round(linesPct), total: 100 },
      branches: { pct: 100, covered: 100, total: 100 },
    };
  }
  return JSON.stringify(entries);
}

const RADON_REPORT = JSON.stringify({
  "src/hot.py": [
    { complexity: 10, name: "hot" },
    { complexity: 2, name: "tiny" },
  ],
  "src/calm.py": [{ complexity: 2, name: "calm" }],
});

function crapPolicy(tier: GateTier): GatePolicy {
  return { grn: "GRN-2301", ranAtSeq: 2301, trigger: "on_demand", gateTier: tier };
}

function runCrapPipeline(
  files: Readonly<Record<string, string>>,
  tier: GateTier = "HARDENING",
): GateResultRecord {
  const root = crapProject(files);
  const adapter = createCrapGateAdapter();
  const plan = adapter.prepare({ projectRoot: root }, crapPolicy(tier));
  const raw = adapter.run(plan);
  return adapter.normalize(raw, {});
}

const CONFIG_C8 = JSON.stringify({
  runner: "c8",
  command: "corepack pnpm exec vitest run",
  crap: { complexityReport: "reports/complexity.json" },
});

describe("CRAP 全链路判卷矩阵（HARDENING-only 生效；fail-closed 输入闸）", () => {
  it("三态① HARDENING 超标抓红：CRAP=110>30 → failed + items 携带公式输入可复算对账", () => {
    const record = runCrapPipeline({
      "coverage-gate.json": CONFIG_C8,
      "reports/complexity.json": RADON_REPORT,
      "coverage/coverage-summary.json": c8Report({ "src/hot.py": 0, "src/calm.py": 100 }),
    });
    // src/hot.py: c=10, cov=0 → 100×1+10=110 > 30（violations）；src/calm.py: c=2, cov=1 → 2。
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.counts.scanned).toBe(2);
    expect(record.counts.applicableScanned).toBe(2);
    expect(record.items?.[0]?.location).toBe("src/hot.py");
    expect(record.items?.[0]?.message).toContain("CRAP=110");
    expect(record.items?.[0]?.message).toContain("complexity=10");
    expect(record.items?.[0]?.message).toContain("PRD §28.1");
    expect(record.metricDialect).toBe(CRAP_METRIC_DIALECT);
    expect(record.tool).toBe(CRAP_TOOL_ID);
    const doc = toGateResultJson(record);
    if (!validate(doc)) console.error(validate.errors);
    expect(validate(doc)).toBe(true);
  });

  it("三态② 达标绿：全部文件 CRAP ≤ maxCrap → passed", () => {
    const record = runCrapPipeline({
      "coverage-gate.json": CONFIG_C8,
      "reports/complexity.json": JSON.stringify({ "src/calm.py": [{ complexity: 2 }] }),
      "coverage/coverage-summary.json": c8Report({ "src/calm.py": 100 }),
    });
    expect(record.verdict).toBe("passed");
    expect(record.counts.violations).toBe(0);
    expect(record.scopeNote).toContain("max CRAP=2");
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("三态③ 输入缺席 = 显式 not_run 非默认值：复杂度报告缺席 → not_run + counts 显式全零", () => {
    const record = runCrapPipeline({
      "coverage-gate.json": JSON.stringify({
        runner: "c8",
        command: "x",
        crap: { complexityReport: "reports/absent.json" },
      }),
      "coverage/coverage-summary.json": c8Report({ "src/hot.py": 0 }),
    });
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/复杂度输入缺席/);
    expect(record.counts).toEqual({
      scanned: 0,
      applicableScanned: 0,
      violations: 0,
      notApplicable: 0,
    });
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("三态③ 输入缺席 = 显式 not_run 非默认值：覆盖率报告缺席 → not_run（指路先跑 COVERAGE gate）", () => {
    const record = runCrapPipeline({
      "coverage-gate.json": CONFIG_C8,
      "reports/complexity.json": RADON_REPORT,
    });
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toMatch(/覆盖率输入缺席/);
    expect(record.scopeNote).toMatch(/COVERAGE gate/);
  });

  it("词形不可解析 = 错误态非默认值：复杂度报告坏形 → not_run；覆盖率报告坏形 → not_run", () => {
    const badComplexity = runCrapPipeline({
      "coverage-gate.json": JSON.stringify({
        runner: "c8",
        command: "x",
        crap: { complexityReport: "reports/complexity.json" },
      }),
      "reports/complexity.json": "{oops",
      "coverage/coverage-summary.json": c8Report({ "src/hot.py": 0 }),
    });
    expect(badComplexity.verdict).toBe("not_run");
    expect(badComplexity.scopeNote).toMatch(/复杂度报告词形不可解析/);
    const badCoverage = runCrapPipeline({
      "coverage-gate.json": JSON.stringify({
        runner: "c8",
        command: "x",
        crap: { complexityReport: "reports/complexity.json" },
      }),
      "reports/complexity.json": RADON_REPORT,
      "coverage/coverage-summary.json": "not a coverage report",
    });
    expect(badCoverage.verdict).toBe("not_run");
    expect(badCoverage.scopeNote).toMatch(/覆盖率报告词形不可解析/);
  });

  it("HARDENING-only 生效：STANDARD 档超标不判罚——violations=0 但降 warning 呈报（非静默 passed）", () => {
    const files = {
      "coverage-gate.json": CONFIG_C8,
      "reports/complexity.json": RADON_REPORT,
      "coverage/coverage-summary.json": c8Report({ "src/hot.py": 0, "src/calm.py": 100 }),
    };
    const hardening = runCrapPipeline(files, "HARDENING");
    const standard = runCrapPipeline(files, "STANDARD");
    expect(hardening.verdict).toBe("failed");
    expect(hardening.counts.violations).toBe(1);
    expect(standard.verdict).toBe("warning");
    expect(standard.verdictCapReason).toBe(CRAP_DEFERRED_CAP);
    expect(standard.counts.violations).toBe(0);
    expect(standard.scopeNote).toMatch(/HARDENING-only 生效/);
    expect(standard.scopeNote).toContain("超标 1 个文件");
  });

  it("连接缺口显式计数：复杂度分母内文件无覆盖率条目 → notApplicable=1（非静默非猜值）", () => {
    const record = runCrapPipeline({
      "coverage-gate.json": JSON.stringify({
        runner: "c8",
        command: "x",
        crap: { complexityReport: "reports/complexity.json" },
      }),
      "reports/complexity.json": JSON.stringify({
        "src/a.py": [{ complexity: 3 }],
        "src/missing-coverage.py": [{ complexity: 9 }],
      }),
      "coverage/coverage-summary.json": c8Report({ "src/a.py": 100 }),
    });
    expect(record.counts.scanned).toBe(2);
    expect(record.counts.applicableScanned).toBe(1);
    expect(record.counts.notApplicable).toBe(1);
    expect(record.counts.violations).toBe(0);
    expect(record.blindspot.escapeRatio).toBe(0.5);
    expect(record.scopeNote).toMatch(/连接缺口 1 个/);
    expect(record.scopeNote).toContain("src/missing-coverage.py");
    // src/a.py: c=3, cov=1 → CRAP=3 ≤ 30 → passed（缺口只显式计数不牵连判罚）。
    expect(record.verdict).toBe("passed");
  });

  it("反向连接披露（P23 红队 MINOR）：覆盖率有而复杂度无的文件 → scopeNote 显式计数（不入分母不影响判卷，非静默缩分母）", () => {
    const record = runCrapPipeline({
      "coverage-gate.json": JSON.stringify({
        runner: "c8",
        command: "x",
        crap: { complexityReport: "reports/complexity.json" },
      }),
      "reports/complexity.json": JSON.stringify({
        "src/a.py": [{ complexity: 3 }],
      }),
      "coverage/coverage-summary.json": c8Report({
        "src/a.py": 100,
        "src/only-in-coverage.py": 0,
      }),
    });
    // 单向文件不入 CRAP 分母：scanned/notApplicable 轴不变（仍专指复杂度→覆盖率方向）。
    expect(record.counts.scanned).toBe(1);
    expect(record.counts.applicableScanned).toBe(1);
    expect(record.counts.notApplicable).toBe(0);
    expect(record.counts.violations).toBe(0);
    // 披露面在 scopeNote：计数 + 文件名 + coverage_unmatched 词形在场。
    expect(record.scopeNote).toContain("覆盖率独有 1 个");
    expect(record.scopeNote).toContain("coverage_unmatched");
    expect(record.scopeNote).toContain("src/only-in-coverage.py");
    // 不发明新 verdict 语义：a.py CRAP=3 → passed 不受披露影响。
    expect(record.verdict).toBe("passed");
  });

  it("零连接命中 → warning + zero_matched_units_nothing_verified（报绿的机器自我怀疑）；反向独有文件同步披露", () => {
    const record = runCrapPipeline({
      "coverage-gate.json": JSON.stringify({
        runner: "c8",
        command: "x",
        crap: { complexityReport: "reports/complexity.json" },
      }),
      "reports/complexity.json": JSON.stringify({
        "src/only-in-complexity.py": [{ complexity: 9 }],
      }),
      "coverage/coverage-summary.json": c8Report({ "src/only-in-coverage.py": 0 }),
    });
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toBe(ZERO_MATCHED_CAP);
    expect(record.counts.notApplicable).toBe(1);
    expect(record.scopeNote).toContain("覆盖率独有 1 个");
    expect(record.scopeNote).toContain("src/only-in-coverage.py");
  });

  it("阈值配置化：config maxCrap=5 生效（c=2 cov=0 → CRAP=6>5 → failed），配置供给无 provisional 注记", () => {
    const record = runCrapPipeline({
      "coverage-gate.json": JSON.stringify({
        runner: "c8",
        command: "x",
        thresholds: { lines: 80, branches: 60 },
        crap: { complexityReport: "reports/complexity.json", maxCrap: 5 },
      }),
      "reports/complexity.json": JSON.stringify({ "src/mid.py": [{ complexity: 2 }] }),
      "coverage/coverage-summary.json": c8Report({ "src/mid.py": 0 }),
    });
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.items?.[0]?.message).toContain("maxCrap=5");
    expect(record.items?.[0]?.message).not.toContain("provisional");
    expect(record.scopeNote).toContain("（配置显式供给）");
  });

  it("pytest-cov runner 的覆盖率报告同源消费（D17 Python 腿词形）", () => {
    const record = runCrapPipeline({
      "coverage-gate.json": JSON.stringify({
        runner: "pytest-cov",
        covTarget: "src",
        crap: { complexityReport: "reports/complexity.json" },
      }),
      "reports/complexity.json": JSON.stringify({ "src/hot.py": [{ complexity: 10 }] }),
      "coverage.json": JSON.stringify({
        meta: { format: 3 },
        files: {
          "src/hot.py": {
            summary: {
              covered_lines: 0,
              num_statements: 10,
              percent_covered: 0,
              num_branches: 4,
              covered_branches: 0,
            },
          },
        },
        totals: {
          covered_lines: 0,
          num_statements: 10,
          percent_covered: 0,
          num_branches: 4,
          covered_branches: 0,
        },
      }),
    });
    // src/hot.py: c=10, cov=0 → CRAP=110 > 30。
    expect(record.verdict).toBe("failed");
    expect(record.items?.[0]?.location).toBe("src/hot.py");
    expect(record.items?.[0]?.message).toContain("CRAP=110");
  });

  it("MINIMAL 档合法缺席（§73 Case G）：prepare 短路 → not_run + notApplicable=1 + policy_skip 口径", () => {
    const root = crapProject({
      "coverage-gate.json": CONFIG_C8,
    });
    const adapter = createCrapGateAdapter();
    const plan = adapter.prepare({ projectRoot: root }, crapPolicy("MINIMAL"));
    expect(plan.absenceKind).toBe("profile_not_required");
    const record = adapter.normalize(adapter.run(plan), {});
    expect(record.verdict).toBe("not_run");
    expect(record.counts.notApplicable).toBe(1);
    expect(record.metricDialect).toBe(CRAP_POLICY_SKIP_METRIC_DIALECT);
    expect(record.scopeNote).toMatch(/SKIPPED_BY_POLICY/);
    expect(record.scopeNote).toMatch(/Case G/);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("配置缺席 → not_configured（诚实缺席，非静默非 passed）", () => {
    const root = crapProject({});
    const adapter = createCrapGateAdapter();
    const plan = adapter.prepare({ projectRoot: root }, crapPolicy("HARDENING"));
    const record = adapter.normalize(adapter.run(plan), {});
    expect(plan.absenceKind).toBe("config_absent");
    expect(record.verdict).toBe("not_configured");
    expect(record.scopeNote).toMatch(/coverage-gate\.json/);
  });

  it("crap 段未声明 → not_configured + Case G 注记（CRAP 不做 P0 前置）", () => {
    const root = crapProject({
      "coverage-gate.json": JSON.stringify({ runner: "c8", command: "x" }),
    });
    const adapter = createCrapGateAdapter();
    const record = adapter.normalize(
      adapter.run(adapter.prepare({ projectRoot: root }, crapPolicy("HARDENING"))),
      {},
    );
    expect(record.verdict).toBe("not_configured");
    expect(record.scopeNote).toMatch(/crap 段/);
    expect(record.scopeNote).toMatch(/Case G/);
  });
});

// ============================================================
// detect（配置面探测：无第三方工具可探测——探测即输入声明面探测）
// ============================================================

describe("CRAP adapter detect", () => {
  it("crap 段已声明 → READY（tool=gauntlet:crap，POMaster 原生公式身份）", () => {
    const root = crapProject({
      "coverage-gate.json": CONFIG_C8,
    });
    const detection = createCrapGateAdapter().detect(platformDetectorFacts(root));
    expect(detection.status).toBe("READY");
    if (detection.status === "READY") {
      expect(detection.tool).toBe(CRAP_TOOL_ID);
      expect(detection.evidence).toContain("reports/complexity.json");
    }
  });

  it("crap 段未声明 / 配置缺席 → NOT_INSTALLED + 指引（禁静默）", () => {
    const undeclared = createCrapGateAdapter().detect(
      platformDetectorFacts(
        crapProject({
          "coverage-gate.json": JSON.stringify({ runner: "c8", command: "x" }),
        }),
      ),
    );
    expect(undeclared.status).toBe("NOT_INSTALLED");
    if (undeclared.status === "NOT_INSTALLED") {
      expect(undeclared.reason).toMatch(/crap 段/);
      expect(undeclared.installHint).toMatch(/complexityReport/);
    }
    const absent = createCrapGateAdapter().detect(platformDetectorFacts(crapProject({})));
    expect(absent.status).toBe("NOT_INSTALLED");
  });
});

// ============================================================
// 阈值 provisional 纪律（呈报项登记；A4 对齐点）
// ============================================================

describe("provisional 阈值呈报项登记（系统不自批为永久值）", () => {
  it("CRAP 阈值呈报项：status=provisional、注记含「provisional」与「A4」、值与出厂兜底一致", () => {
    expect(CRAP_PROVISIONAL_REGISTRATION.status).toBe("provisional");
    expect(CRAP_PROVISIONAL_REGISTRATION.value).toBe(CRAP_PROVISIONAL_MAX_CRAP);
    expect(CRAP_PROVISIONAL_MAX_CRAP).toBe(30);
    expect(CRAP_PROVISIONAL_REGISTRATION.note).toContain("provisional");
    expect(CRAP_PROVISIONAL_REGISTRATION.note).toContain("A4");
    expect(CRAP_PROVISIONAL_REGISTRATION.key).toBe("coverage-gate.json crap.maxCrap");
  });

  it("coverage 行/分支阈值呈报项同表登记（两键齐备，逐项 provisional）", () => {
    expect(PROVISIONAL_THRESHOLD_REGISTRATIONS).toHaveLength(2);
    for (const entry of PROVISIONAL_THRESHOLD_REGISTRATIONS) {
      expect(entry.status).toBe("provisional");
      expect(entry.note).toContain("provisional");
      expect(entry.note).toContain("A4");
    }
    expect(PROVISIONAL_THRESHOLD_REGISTRATIONS.map((e) => e.value)).toEqual([80, 60]);
  });

  it("档位词轴：五词形 PRD 出处闭包 + 缺省 STANDARD", () => {
    expect([...GATE_TIER_VALUES]).toEqual([
      "MINIMAL",
      "LIGHT",
      "FAST",
      "STANDARD",
      "HARDENING",
    ]);
    expect(DEFAULT_GATE_TIER).toBe("STANDARD");
  });
});

// ============================================================
// 三态 truth-index 记录互异（failed / passed / not_run）
// ============================================================

describe("三态 truth-index 记录互异", () => {
  it("failed / passed / not_run 三份 CRAP 记录逐字段互异且全部过 03 schema", () => {
    const passed = runCrapPipeline({
      "coverage-gate.json": CONFIG_C8,
      "reports/complexity.json": JSON.stringify({ "src/calm.py": [{ complexity: 2 }] }),
      "coverage/coverage-summary.json": c8Report({ "src/calm.py": 100 }),
    });
    const failed = runCrapPipeline({
      "coverage-gate.json": CONFIG_C8,
      "reports/complexity.json": RADON_REPORT,
      "coverage/coverage-summary.json": c8Report({ "src/hot.py": 0, "src/calm.py": 100 }),
    });
    const notRun = runCrapPipeline({
      "coverage-gate.json": JSON.stringify({
        runner: "c8",
        command: "x",
        crap: { complexityReport: "reports/absent.json" },
      }),
      "coverage/coverage-summary.json": c8Report({ "src/hot.py": 0 }),
    });
    expect(failed.verdict).toBe("failed");
    expect(passed.verdict).toBe("passed");
    expect(notRun.verdict).toBe("not_run");
    const serial = [failed, passed, notRun].map((r) => JSON.stringify(toGateResultJson(r)));
    expect(new Set(serial).size).toBe(3);
    for (const record of [failed, passed, notRun]) {
      const doc = toGateResultJson(record);
      if (!validate(doc)) console.error(validate.errors);
      expect(validate(doc)).toBe(true);
    }
    expect(CRAP_GATE_DEF).toBe("POLICY.GATE.COMPLEXITY_CRAP@0.1.0");
  });
});

// ============================================================
// normalizeCrapLeg 直调（管线契约破坏的防御性显式拒绝）
// ============================================================

describe("normalizeCrapLeg 防御性档位闸", () => {
  function legOutput(tier: GateTier): CrapLegOutput {
    const plan = {
      tool: CRAP_TOOL_ID,
      toolVersion: "0.1.0",
      gate: "COMPLEXITY_CRAP",
      gateDef: CRAP_GATE_DEF,
      metricDialect: CRAP_METRIC_DIALECT,
      grn: "GRN-1",
      ranAtSeq: 1,
      trigger: "on_demand",
      subjectId: null,
      denominatorRefs: [],
      projectRoot: "D:/x",
      absenceKind: null,
      absentReason: null,
      absentHint: null,
      complexityReportPath: "reports/complexity.json",
      coverageReportPath: "coverage/coverage-summary.json",
      coverageRunner: "c8",
      maxCrap: 30,
      maxCrapProvisional: true,
      tier,
    } as CrapLegPlan;
    return { plan, complexityText: "{}", coverageText: "{}", externalMs: 0 };
  }

  it("MINIMAL/LIGHT/FAST 档到达 normalize = 管线契约破坏 → blocked（禁静默按 STANDARD 判）", () => {
    for (const tier of ["MINIMAL", "LIGHT", "FAST"] as const) {
      const record = normalizeCrapLeg(legOutput(tier), 0);
      expect(record.verdict).toBe("blocked");
      expect(record.scopeNote).toMatch(/管线契约破坏/);
    }
  });
});
