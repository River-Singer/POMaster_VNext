/**
 * typecheck-lint-adapter.spec.ts —— W3-S2 切片：TS 族核心能力真实接入
 * （C02 Type/Static——tsc / vue-tsc / ESLint）的受信 adapter 能力测试。
 *
 * 判据锚：
 * - c99-gap-declaration.md 表 B C02 行：新建受信 adapter
 *   （refs: builtin.gauntlet-lite.typecheck / builtin.gauntlet-lite.lint）
 *   →bindings→resolved→executed；ESLint 禁 --fix；tsc 不用 --skipLibCheck 之类放宽旗标。
 * - test-tool-catalog.md C02 行钉住行为：不把编译转译成功当 typecheck（--noEmit 强制）；
 *   不能以空根 tsconfig 求绿（零分母 cap——空根 references-only tsconfig 静默 exit 0
 *   假绿向量实测在案）；tsc 诊断是文本不是 JSON，adapter 保存原文并逐条解析诊断；
 *   ESLint 保持 JSON 全量（逐 message 重算 + errorCount asserted 孪生）。
 * - 五类验收样本沿 test-weakening / execution-audit 的 fail-closed 先例：
 *   真实成功 / 业务失败 / 工具缺失 / 坏报告 / 空输出。
 * - C5 重算纪律：判卷唯一依据 = 逐条重算（tsc 文本诊断逐行 / ESLint messages 逐条），
 *   工具自报 = asserted（CLAIMED）孪生；C1：零分母/坏报告/缺席显式落态，禁静默当通过。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLintAdapter,
  createTypecheckAdapter,
  ESLINT_TOOL_ID,
  GateAdapterError,
  LINT_GATE_DEF,
  LINT_GATE_NAME,
  LINT_METRIC_DIALECT,
  resolveTrustedBindingAdapter,
  TSC_TOOL_ID,
  TYPECHECK_GATE_DEF,
  TYPECHECK_GATE_NAME,
  TYPECHECK_METRIC_DIALECT,
  VUE_TSC_TOOL_ID,
  bindingAdapterContractMatches,
  runBindingGate,
  toGateResultJson,
  type DetectionResult,
  type DetectorFacts,
  type GatePlan,
  type GateScope,
  type GatePolicy,
  type ToolBindingRecord,
  type ToolRunOutput,
} from "@pomaster/gauntlet-lite";

// ============================================================
// fixture：内存 DetectorFacts（探测矩阵零 I/O 可单测——adapter-types.ts 注入面契约）
// ============================================================

const ROOT = "d:\\proj";

function makeFacts(files: Record<string, string>, pathEnv = "C:\\tools;C:\\windows"): DetectorFacts {
  // fixture 键用仓内相对路径；read 面剥 ROOT 前缀对齐（joinPath 语义同源一致——契约）。
  const keyOf = (p: string): string =>
    p.startsWith(`${ROOT}\\`) ? p.slice(ROOT.length + 1) : p;
  return {
    projectRoot: ROOT,
    pathEnv,
    pathSeparator: ";",
    executableSuffixes: [".cmd", ".exe", ""],
    joinPath: (base, rel) => (rel.length === 0 ? base : `${base}\\${rel}`),
    fileExists: (p) => keyOf(p) in files,
    readTextFile: (p) => files[keyOf(p)] ?? null,
  };
}

function pkgJson(deps: Record<string, string>): string {
  return JSON.stringify({ name: "fixture", devDependencies: deps });
}

/** TS 族 typecheck 绑定标准形（字段值 = 本仓 dogfood 绑定同款词形）。 */
function typecheckBinding(overrides?: Partial<ToolBindingRecord>): ToolBindingRecord {
  return {
    id: "project.type.tsc-typecheck",
    source: "built_in",
    transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.typecheck",
    tool: "gauntlet:tsc",
    tool_version_anchor: "5.7.3",
    gate: "TYPECHECK",
    gate_def: "POLICY.GATE.TYPECHECK@0.1.0",
    metric_dialect: "type:program_file_scan",
    capabilities: ["static_analysis"],
    execution: {
      command:
        "node tsc-fake.mjs --project packages/kernel/tsconfig.json --noEmit --listFiles --pretty false",
      cwd: ".",
    },
    report_contract: {
      format: "tsc-text-diagnostics",
      parser_ref: "builtin.gauntlet-lite.typecheck/tsc-text",
      parser_version: "0.1.0",
    },
    evidence_targets: [],
    environment: { requires: false },
    ...overrides,
  } as ToolBindingRecord;
}

/** Lint 族 eslint 绑定标准形。 */
function lintBinding(overrides?: Partial<ToolBindingRecord>): ToolBindingRecord {
  return {
    id: "project.static.eslint-lint",
    source: "built_in",
    transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.lint",
    tool: "gauntlet:eslint",
    tool_version_anchor: "9.18.0",
    gate: "LINT",
    gate_def: "POLICY.GATE.LINT@0.1.0",
    metric_dialect: "lint:finding_count",
    capabilities: ["static_analysis"],
    execution: {
      command: "node eslint-fake.mjs packages/kernel/src --format json",
      cwd: ".",
    },
    report_contract: {
      format: "eslint-json",
      parser_ref: "builtin.gauntlet-lite.lint/eslint-json",
      parser_version: "0.1.0",
    },
    evidence_targets: [],
    environment: { requires: false },
    ...overrides,
  } as ToolBindingRecord;
}

function fakeSpawn(stdout: string, status: number | null = 0, error: string | null = null) {
  const calls: { command: string; cwd: string; timeoutMs: number }[] = [];
  const spawnFn = (command: string, options: { cwd: string; timeoutMs: number }) => {
    calls.push({ command, cwd: options.cwd, timeoutMs: options.timeoutMs });
    return { status, stdout, stderr: "", error, externalMs: 5 };
  };
  return { spawnFn, calls };
}

function makePlan(adapter: "tsc" | "eslint", overrides?: Partial<GatePlan>): GatePlan {
  const scope: GateScope = { projectRoot: ROOT };
  const policy: GatePolicy = { grn: "GRN-1", ranAtSeq: 1, expectedToolVersion: null };
  const plan =
    adapter === "tsc"
      ? createTypecheckAdapter().prepare(scope, policy, makeFacts({ "package.json": pkgJson({ typescript: "^5.7.3" }) }))
      : createLintAdapter().prepare(scope, policy, makeFacts({ "package.json": pkgJson({ eslint: "^9.18.0" }) }));
  return { ...plan, ...overrides };
}

function run(adapter: "tsc" | "eslint", plan: GatePlan, stdout: string, status = 0) {
  const a = adapter === "tsc" ? createTypecheckAdapter() : createLintAdapter();
  const raw = a.run(plan, fakeSpawn(stdout, status).spawnFn);
  return a.normalize(raw, { declaredVerdict: null, isFixture: false });
}

// ============================================================
// 受信 adapter 注册表 + validated 判定式
// ============================================================

describe("TRUSTED_BINDING_ADAPTERS 扩容（W3-S2：TS 族双受信 adapter）", () => {
  it("builtin.gauntlet-lite.typecheck 在册：能力/格式/parser/口径/工具 id 闭包齐备（vue-tsc 同闭包诚实登记）", () => {
    const decl = resolveTrustedBindingAdapter("builtin.gauntlet-lite.typecheck");
    expect(decl).not.toBeNull();
    expect(decl?.adapterKey).toBe("typecheck");
    expect(decl?.capabilities).toEqual(["static_analysis"]);
    expect(decl?.accepted_formats).toContain("tsc-text-diagnostics");
    expect(decl?.accepted_parser_refs).toContain("builtin.gauntlet-lite.typecheck/tsc-text");
    expect(decl?.accepted_metric_dialects).toContain("type:program_file_scan");
    expect(decl?.accepted_tool_ids).toEqual([TSC_TOOL_ID, VUE_TSC_TOOL_ID]);
    // detectorFor 覆盖两工具形态；未覆盖 tool → null（禁猜测）。
    expect(decl?.detectorFor(TSC_TOOL_ID)).not.toBeNull();
    expect(decl?.detectorFor(VUE_TSC_TOOL_ID)).not.toBeNull();
    expect(decl?.detectorFor("gauntlet:eslint")).toBeNull();
  });

  it("builtin.gauntlet-lite.lint 在册：eslint 单工具闭包（旧 BUILD 选择器不受影响——兼容并存红线）", () => {
    const decl = resolveTrustedBindingAdapter("builtin.gauntlet-lite.lint");
    expect(decl).not.toBeNull();
    expect(decl?.adapterKey).toBe("lint");
    expect(decl?.capabilities).toEqual(["static_analysis"]);
    expect(decl?.accepted_tool_ids).toEqual([ESLINT_TOOL_ID]);
    expect(decl?.accepted_formats).toContain("eslint-json");
    // 红线：不删旧 BUILD 选择器——受信注册表仍是三条 ref 并存。
    expect(resolveTrustedBindingAdapter("builtin.gauntlet-lite.build")).not.toBeNull();
  });

  it("validated 判定式：TS 族绑定五键匹配通过；能力冒领（visual_diff）/工具越闭包拒绝", () => {
    expect(bindingAdapterContractMatches(typecheckBinding()).ok).toBe(true);
    expect(bindingAdapterContractMatches(lintBinding()).ok).toBe(true);
    const claim = bindingAdapterContractMatches(typecheckBinding({ capabilities: ["visual_diff"] }));
    expect(claim.ok).toBe(false);
    const cross = bindingAdapterContractMatches(typecheckBinding({ tool: ESLINT_TOOL_ID }));
    expect(cross.ok).toBe(false);
  });
});

// ============================================================
// detect（探测器家族 = package.json 声明同源，不自造第二套探测）
// ============================================================

describe("detect：TS 族探测（package.json 声明族——detectVitest 同源先例）", () => {
  it("typescript + eslint 声明在座 → READY 且版本经 sanitizeSemver 锚定", () => {
    const ts = createTypecheckAdapter().detect(
      makeFacts({ "package.json": pkgJson({ typescript: "^5.7.3", "vue-tsc": "^2.1.10" }) }),
    );
    expect(ts.status).toBe("READY");
    expect(ts.tsc.status).toBe("READY");
    expect(ts.tsc).toMatchObject({ tool: TSC_TOOL_ID, detectedVersion: "5.7.3" });
    expect(ts.vueTsc).toMatchObject({ tool: VUE_TSC_TOOL_ID, detectedVersion: "2.1.10" });

    const eslint = createLintAdapter().detect(
      makeFacts({ "package.json": pkgJson({ eslint: "^9.18.0" }) }),
    );
    expect(eslint).toMatchObject({
      status: "READY",
      tool: ESLINT_TOOL_ID,
      detectedVersion: "9.18.0",
    });
  });

  it("工具缺失 → NOT_INSTALLED 带理由与安装建议（缺席必带路标）；vue-tsc 未声明诚实缺席", () => {
    const facts = makeFacts({ "package.json": pkgJson({ eslint: "^9.18.0" }) });
    const ts = createTypecheckAdapter().detect(facts);
    expect(ts.status).toBe("NOT_INSTALLED");
    expect(ts.tsc.status).toBe("NOT_INSTALLED");
    expect((ts.tsc as Extract<DetectionResult, { status: "NOT_INSTALLED" }>).installHint.length).toBeGreaterThan(0);
    expect(ts.vueTsc.status).toBe("NOT_INSTALLED");

    const noPkg = createLintAdapter().detect(makeFacts({}));
    expect(noPkg.status).toBe("NOT_INSTALLED");
    expect((noPkg as Extract<DetectionResult, { status: "NOT_INSTALLED" }>).reason.length).toBeGreaterThan(0);
  });
});

// ============================================================
// prepare / run（红线旗标守卫）
// ============================================================

describe("prepare + run：执行计划与红线旗标守卫", () => {
  it("prepare：runner/gate/gate_def/口径/工具/版本锚齐备（tsc 优先于 vue-tsc——BUILD 选择器先例）", () => {
    const plan = makePlan("tsc");
    expect(plan).toMatchObject({
      tool: TSC_TOOL_ID,
      toolVersion: "5.7.3",
      gate: TYPECHECK_GATE_NAME,
      gateDef: TYPECHECK_GATE_DEF,
      metricDialect: TYPECHECK_METRIC_DIALECT,
      runner: "tsc",
    });
    expect(TYPECHECK_GATE_DEF).toBe("POLICY.GATE.TYPECHECK@0.1.0");
    expect(TYPECHECK_METRIC_DIALECT).toBe("type:program_file_scan");

    const lintPlan = makePlan("eslint");
    expect(lintPlan).toMatchObject({
      tool: ESLINT_TOOL_ID,
      gate: LINT_GATE_NAME,
      gateDef: LINT_GATE_DEF,
      metricDialect: LINT_METRIC_DIALECT,
      runner: "eslint",
    });
    expect(LINT_GATE_DEF).toBe("POLICY.GATE.LINT@0.1.0");
    expect(LINT_METRIC_DIALECT).toBe("lint:finding_count");
  });

  it("prepare：仅 vue-tsc 在座 → 选 vue-tsc；双腿全缺席 → GateAdapterError（诚实 not_configured 面）", () => {
    const adapter = createTypecheckAdapter();
    const vueOnly = adapter.prepare(
      { projectRoot: ROOT },
      { grn: "GRN-1", ranAtSeq: 1 },
      makeFacts({ "package.json": pkgJson({ "vue-tsc": "^2.1.10" }) }),
    );
    expect(vueOnly.tool).toBe(VUE_TSC_TOOL_ID);

    expect(() =>
      adapter.prepare(
        { projectRoot: ROOT },
        { grn: "GRN-1", ranAtSeq: 1 },
        makeFacts({ "package.json": pkgJson({ eslint: "^9.18.0" }) }),
      ),
    ).toThrow(GateAdapterError);
  });

  it("红线守卫：ESLint 命令含 --fix/--fix-dry-run → run 拒绝（GateAdapterError）", () => {
    const adapter = createLintAdapter();
    for (const bad of [
      "corepack pnpm exec eslint src --fix --format json",
      "corepack pnpm exec eslint src --fix-dry-run --format json",
      "corepack pnpm exec eslint src --fix-type problem --format json",
    ]) {
      expect(() =>
        adapter.run(makePlan("eslint", { command: bad }), fakeSpawn("[]").spawnFn),
      ).toThrow(GateAdapterError);
    }
  });

  it("红线守卫：tsc 命令缺 --noEmit（把编译转译当 typecheck）或含 --skipLibCheck（放宽旗标）→ run 拒绝", () => {
    const adapter = createTypecheckAdapter();
    expect(() =>
      adapter.run(
        makePlan("tsc", { command: "corepack pnpm exec tsc -p tsconfig.json --listFiles" }),
        fakeSpawn("").spawnFn,
      ),
    ).toThrow(GateAdapterError);
    expect(() =>
      adapter.run(
        makePlan("tsc", {
          command: "corepack pnpm exec tsc -p tsconfig.json --noEmit --skipLibCheck --listFiles",
        }),
        fakeSpawn("").spawnFn,
      ),
    ).toThrow(GateAdapterError);
  });

  it("run：命令透传（binding 只供执行面参数）+ spawn 层错误 → spawn_failed", () => {
    const { spawnFn, calls } = fakeSpawn("");
    const raw = createTypecheckAdapter().run(makePlan("tsc"), spawnFn);
    expect(raw.kind).toBe("executed");
    expect(calls[0]?.command).toBe(makePlan("tsc").command);

    const broken = createLintAdapter().run(
      makePlan("eslint"),
      fakeSpawn("", null, "spawn failed").spawnFn,
    );
    expect(broken.kind).toBe("spawn_failed");
    expect(broken.failureReason).not.toBeNull();
  });
});

// ============================================================
// normalize：tsc 文本诊断判卷（五类验收样本）
// ============================================================

const TSC_CLEAN = [
  "d:\\proj\\node_modules\\typescript\\lib\\lib.es5.d.ts",
  "d:\\proj\\src\\a.ts",
  "d:\\proj\\src\\b.ts",
  "",
].join("\n");

const TSC_DIRTY = [
  "d:\\proj\\node_modules\\typescript\\lib\\lib.es5.d.ts",
  "d:\\proj\\src\\a.ts",
  "d:\\proj\\src\\b.ts",
  "d:\\proj\\src\\b.ts(10,5): error TS2322: Type 'number' is not assignable to type 'string'.",
  "d:\\proj\\src\\c.ts(3,1): error TS2304: Cannot find name 'foo'.",
  "",
].join("\n");

describe("normalize：typecheck（tsc 文本诊断逐条重算——C5）", () => {
  it("样本①真实成功：程序文件分母在座 + 零诊断 → passed（scanned=3 且 blindspot 全 produced）", () => {
    const record = run("tsc", makePlan("tsc"), TSC_CLEAN, 0);
    expect(record.verdict).toBe("passed");
    expect(record.counts).toMatchObject({ scanned: 3, applicableScanned: 3, violations: 0, notApplicable: 0 });
    expect(record.blindspot).toMatchObject({ scanned: 3, produced: 3, escapeRatio: 0 });
    // 口径披露：tsc --pretty false 无自报汇总 → asserted=null 是诚实信号，counts 由重算得出。
    expect(record.trust.asserted).toBeNull();
    expect(record.trust.recomputed.violations).toBe(0);
  });

  it("样本②业务失败：error 诊断逐条重算 → failed + items 相对路径明细（禁绝对盘符）", () => {
    const record = run("tsc", makePlan("tsc"), TSC_DIRTY, 2);
    expect(record.verdict).toBe("failed");
    expect(record.counts).toMatchObject({ scanned: 3, violations: 2 });
    expect(record.blindspot).toMatchObject({ scanned: 3, produced: 1 });
    expect(record.items).toHaveLength(2);
    expect(record.items?.[0]).toMatchObject({
      rule: "TS2322",
      location: "src/b.ts:10:5",
      message: "Type 'number' is not assignable to type 'string'.",
    });
    expect(record.items?.[1]?.rule).toBe("TS2304");
    // 退出码不洗白：exit 2 与重算 violations>0 同向；哪怕 exit 0 携带诊断也判 failed（重算 wins）。
    const sneaky = run("tsc", makePlan("tsc"), TSC_DIRTY, 0);
    expect(sneaky.verdict).toBe("failed");
  });

  it("样本③空输出假绿向量：空根 tsconfig 静默 exit 0 → 零分母 cap 降 warning（禁默认 PASS）", () => {
    const record = run("tsc", makePlan("tsc"), "", 0);
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toContain("zero_scanned_files_nothing_typechecked");
    expect(record.counts.scanned).toBe(0);
  });

  it("样本④坏报告：非零退出 + 零可解析诊断词形 → not_run（裸 exit code 不能替代行为证据）", () => {
    const record = run("tsc", makePlan("tsc"), "error TS5083: Cannot read file 'x'.", 2);
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote ?? "").toContain("not_run");
  });

  it("样本④补（假绿向量封堵）：非零退出 + --listFiles 分母在座但零可解析 error 词形（TS2688 型无位置词形配置错误）→ not_run，禁以分母洗绿", () => {
    // tsc 合同：非零退出必有 error 在座；无 (line,col) 位置词形的配置级错误
    // （如 error TS2688）不被诊断正则命中——若因此落 passed 即假绿（check 轮实证）。
    const stdout = [
      "d:\\proj\\src\\a.ts",
      "d:\\proj\\src\\b.ts",
      "error TS2688: Cannot find type definition file for 'node'.",
      "",
    ].join("\n");
    const record = run("tsc", makePlan("tsc"), stdout, 2);
    expect(record.verdict).toBe("not_run");
    expect(record.counts).toMatchObject({ scanned: 0, violations: 0 });
    expect(record.scopeNote ?? "").toContain("TS2688");
  });

  it("样本⑤spawn 失败 → not_run 显式缺席（非绿非红，counts 显式全零）", () => {
    const adapter = createTypecheckAdapter();
    const raw = adapter.run(makePlan("tsc"), fakeSpawn("", null, "spawn failed").spawnFn);
    const record = adapter.normalize(raw, { declaredVerdict: null, isFixture: false });
    expect(record.verdict).toBe("not_run");
    expect(record.counts).toMatchObject({ scanned: 0, violations: 0, notApplicable: 0 });
  });

  it("warning 诊断不计罚但显式披露（scopeNote 留痕——『为何没查』必须是文字或数字而非沉默）", () => {
    const stdout = [
      "d:\\proj\\src\\a.ts",
      "d:\\proj\\src\\a.ts(1,1): warning TS9999: synthetic warning.",
      "",
    ].join("\n");
    const record = run("tsc", makePlan("tsc"), stdout, 0);
    expect(record.verdict).toBe("passed");
    expect(record.counts).toMatchObject({ scanned: 1, violations: 0, notApplicable: 0 });
    expect(record.scopeNote ?? "").toContain("warning");
  });

  it("版本漂移：探测版本 ≠ expectedToolVersion 锚 → passed 降 warning + tool_version_drifted", () => {
    const adapter = createTypecheckAdapter();
    const plan = adapter.prepare(
      { projectRoot: ROOT },
      { grn: "GRN-1", ranAtSeq: 1, expectedToolVersion: "5.7.3" },
      makeFacts({ "package.json": pkgJson({ typescript: "^5.9.3" }) }),
    );
    const record = adapter.run(plan, fakeSpawn(TSC_CLEAN, 0).spawnFn);
    const norm = adapter.normalize(record, { declaredVerdict: null, isFixture: false });
    expect(norm.verdict).toBe("warning");
    expect(norm.verdictCapReason).toContain("tool_version_drifted");
  });

  it("items 截断：>100 条诊断按预算截断并留痕 itemsTruncated（x-budget 纪律）", () => {
    const lines = ["d:\\proj\\src\\bulk.ts"];
    for (let i = 0; i < 120; i++) {
      lines.push(`d:\\proj\\src\\bulk.ts(${i + 1},1): error TS2322: synthetic ${i}.`);
    }
    const record = run("tsc", makePlan("tsc"), lines.join("\n"), 2);
    expect(record.counts.violations).toBe(120);
    expect(record.items).toHaveLength(100);
    expect(record.itemsTruncated).toBe(true);
  });
});

// ============================================================
// normalize：eslint JSON 判卷（五类验收样本）
// ============================================================

const ESLINT_CLEAN = JSON.stringify([
  { filePath: "d:\\proj\\src\\a.ts", messages: [], errorCount: 0, warningCount: 0, fatalErrorCount: 0 },
  { filePath: "d:\\proj\\src\\b.ts", messages: [], errorCount: 0, warningCount: 0, fatalErrorCount: 0 },
]);

const ESLINT_DIRTY = JSON.stringify([
  {
    filePath: "d:\\proj\\src\\a.ts",
    messages: [
      { ruleId: "no-explicit-any", severity: 2, line: 4, column: 13, message: "Unexpected any." },
      { ruleId: "no-unused-vars", severity: 1, line: 9, column: 7, message: "'x' is defined but never used." },
    ],
    errorCount: 1,
    warningCount: 1,
    fatalErrorCount: 0,
  },
]);

describe("normalize：lint（ESLint JSON 逐 message 重算——C5，errorCount 只是 asserted 孪生）", () => {
  it("样本①真实成功：零 error + warning 披露 → passed（asserted 孪生匹配）", () => {
    const record = run("eslint", makePlan("eslint"), ESLINT_CLEAN, 0);
    expect(record.verdict).toBe("passed");
    expect(record.counts).toMatchObject({ scanned: 2, violations: 0 });
    expect(record.trust.asserted).toMatchObject({ value: { violations: 0 } });
    expect(record.trust.recomputed).toMatchObject({ violations: 0, matchesAsserted: true });
  });

  it("样本②业务失败：severity=2 逐条重算 → failed + items 明细；severity=1 warning 只披露不判罚", () => {
    const record = run("eslint", makePlan("eslint"), ESLINT_DIRTY, 1);
    expect(record.verdict).toBe("failed");
    expect(record.counts).toMatchObject({ scanned: 1, violations: 1 });
    expect(record.items?.[0]).toMatchObject({
      rule: "no-explicit-any",
      location: "src/a.ts:4:13",
      message: "Unexpected any.",
    });
    expect(record.scopeNote ?? "").toContain("warning");
  });

  it("工具自报失配：errorCount 与重算不符 → declare_recompute_mismatch + recomputed wins（failed 不被洗白）", () => {
    const lying = JSON.stringify([
      {
        filePath: "d:\\proj\\src\\a.ts",
        messages: [
          { ruleId: "no-explicit-any", severity: 2, line: 4, column: 13, message: "Unexpected any." },
        ],
        errorCount: 5,
        warningCount: 0,
        fatalErrorCount: 0,
      },
    ]);
    const record = run("eslint", makePlan("eslint"), lying, 1);
    expect(record.verdict).toBe("failed");
    // failed 不被 cap 洗白（build adapter 先例）：cap reason 只解释 passed 降级；
    // 失配本身经 trust.mismatch 显式在账（recomputed wins）。
    expect(record.trust.mismatch).toMatchObject({ detected: true, action: "recomputed_wins_recorded" });
    expect(record.trust.recomputed.matchesAsserted).toBe(false);
    expect(record.counts.violations).toBe(1);
  });

  it("样本③空输出：`[]`（零文件被扫）exit 0 → 零分母 cap 降 warning（禁默认 PASS）", () => {
    const record = run("eslint", makePlan("eslint"), "[]", 0);
    expect(record.verdict).toBe("warning");
    expect(record.verdictCapReason).toContain("zero_scanned_files_nothing_linted");
  });

  it("样本④坏报告：非 JSON / 根形态漂移 → not_run（裸 exit code 不能替代行为证据）", () => {
    const garbage = run("eslint", makePlan("eslint"), "Oops! Config error.", 2);
    expect(garbage.verdict).toBe("not_run");
    const drift = run("eslint", makePlan("eslint"), JSON.stringify({ results: [] }), 0);
    expect(drift.verdict).toBe("not_run");
  });

  it("样本⑤spawn 失败 → not_run；severity 词形外值 → GateNormalizeError 拒绝静默归桶", () => {
    const adapter = createLintAdapter();
    const raw = adapter.run(makePlan("eslint"), fakeSpawn("", null, "spawn failed").spawnFn);
    expect(adapter.normalize(raw, { declaredVerdict: null, isFixture: false }).verdict).toBe("not_run");

    const weird = JSON.stringify([
      {
        filePath: "d:\\proj\\src\\a.ts",
        messages: [{ ruleId: "x", severity: 3, line: 1, column: 1, message: "?" }],
        errorCount: 0,
        warningCount: 0,
        fatalErrorCount: 0,
      },
    ]);
    expect(() => run("eslint", makePlan("eslint"), weird, 0)).toThrow(/unknown_assertion_status|拒绝|归桶/);
  });

  it("ruleId=null（parsing error 形态）→ 显式规则位命名，不落空 rule", () => {
    const parse = JSON.stringify([
      {
        filePath: "d:\\proj\\src\\broken.ts",
        messages: [
          { ruleId: null, severity: 2, fatal: true, line: 1, column: 1, message: "Parsing error: unexpected token" },
        ],
        errorCount: 1,
        warningCount: 0,
        fatalErrorCount: 1,
      },
    ]);
    const record = run("eslint", makePlan("eslint"), parse, 1);
    expect(record.verdict).toBe("failed");
    expect(record.items?.[0]?.rule).not.toBe("");
    expect(record.items?.[0]?.rule.length).toBeGreaterThan(0);
  });
});

// ============================================================
// runBindingGate 集成（受信注册表 → 管线 → 留痕）
// ============================================================

describe("runBindingGate：TS 族绑定走统一执行通路（复用 R1-4 闭环——不另起执行器）", () => {
  it("typecheck 绑定 happy path：passed + binding_id 留痕 + 执行面覆盖", () => {
    // runBindingGate 不注入 facts → prepare 走 platformDetectorFacts 真实 fs——
    // 与 tool-binding.spec makeVitestRepo 同法：真实临时仓供给探测事实源。
    const repo = mkdtempSync(join(tmpdir(), "pomaster-tck-"));
    writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({ name: "tck-fixture", devDependencies: { typescript: "^5.7.3" } }),
      "utf8",
    );
    const { spawnFn } = fakeSpawn(TSC_CLEAN.replaceAll("d:\\proj", repo.replaceAll("\\", "\\\\")), 0);
    try {
      const outcome = runBindingGate(
        typecheckBinding(),
        { projectRoot: repo, grn: "GRN-2", ranAtSeq: 2, subjectId: "TEST.TSC.PROBE" },
        {
          spawnFn,
          executableProbe: () => "C:\\tools\\node.cmd",
        },
      );
      expect(outcome.binding_id).toBe("project.type.tsc-typecheck");
      expect(outcome.record.verdict).toBe("passed");
      expect(outcome.record.gate).toBe("TYPECHECK");
      expect(outcome.record.isFixture).toBe(true);
      expect(outcome.record.scopeNote ?? "").toContain("binding_id=project.type.tsc-typecheck");
      expect(outcome.plan.command).toContain("--noEmit");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("探针缺席 → GateAdapterError（available 禁 executed——工具发现≠调用授权）", () => {
    expect(() =>
      runBindingGate(
        typecheckBinding(),
        { projectRoot: ROOT, grn: "GRN-3", ranAtSeq: 3 },
        { executableProbe: () => null },
      ),
    ).toThrow(GateAdapterError);
  });
});

// ============================================================
// 03 线格式序列化
// ============================================================

describe("toGateResultJson：TS 族记录落 03-gate-result 蛇形线格式", () => {
  it("items[] / scope.note / counts snake_case 全量承载", () => {
    const adapter = createTypecheckAdapter();
    const raw: ToolRunOutput = adapter.run(makePlan("tsc"), fakeSpawn(TSC_DIRTY, 2).spawnFn);
    const record = adapter.normalize(raw, { declaredVerdict: null, isFixture: false });
    const doc = toGateResultJson(record) as Record<string, unknown>;
    expect(doc["gate"]).toBe("TYPECHECK");
    expect(doc["gate_def"]).toBe("POLICY.GATE.TYPECHECK@0.1.0");
    expect(doc["metric_dialect"]).toBe("type:program_file_scan");
    const counts = doc["counts"] as Record<string, unknown>;
    expect(counts["violations"]).toBe(2);
    const items = doc["items"] as readonly Record<string, unknown>[];
    expect(items[0]?.["rule"]).toBe("TS2322");
    expect((doc["scope"] as { note: string }).note.length).toBeGreaterThan(0);
  });
});
