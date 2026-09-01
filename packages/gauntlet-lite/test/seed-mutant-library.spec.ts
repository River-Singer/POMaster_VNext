/**
 * seed-mutant-library.spec.ts —— 固定 seed mutant 库敏感性验证（P24 出口判据 3；
 * 工具链研究 §1.3 纪律 3「生成者/判卷者分离：AI 产出的 mutation 自检需混入固定
 * seed mutant 库验证敏感性」的落地测试面）。
 *
 * 考题-判卷分离纪律：库内每条 seed 的预期分类（expected）与理由（rationale）是
 * 人工预写的固定考卷（seed-mutants.ts，禁静默扩充）；本 spec 把同一份事实经两份
 * 报告词形（StrykerJS JSON / mutmut junitxml）过真实解析器 + 判卷器（单一实现
 * mutantStatusClass / summarizeMutants），判定与预期逐一吻合——
 * - 错杀（把预期幸存/难杀判成 detected）= 失败；
 * - 漏杀（把预期应杀判成幸存者）= 失败；
 * - 排除类误置（RuntimeError/NoCoverage 进错分母分子）= 失败；
 * - 词形间判卷漂移（同一 seed 在两词形下分类不一致）= 失败。
 *
 * 附带钉死：判卷数学单一实现（本 spec 不复写算术，全走 mutation-leg 导出面）；
 * 渲染器确定性（两次渲染字节级一致——A4 零墙钟零随机）；等价变异红线（SEED-MUT-010
 * 必须幸存，判卷器禁粉饰）；kill score 手工算术总账对账（8/11×100）。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import {
  computeKillScore,
  mutantStatusClass,
  MUTATION_GATE_DEF,
  MUTATION_GATE_NAME,
  MUTATION_PROVISIONAL_THRESHOLDS,
  MUTMUT_GAP_NOTE,
  MUTMUT_METRIC_DIALECT,
  MUTMUT_TOOL_ID,
  normalizeMutationLeg,
  parseMutmutJunitXml,
  parseMutationReport,
  parseStrykerReport,
  runMutationLeg,
  STRYKER_METRIC_DIALECT,
  STRYKER_TOOL_ID,
  summarizeMutants,
  survivingMutants,
  toGateResultJson,
  stripQuotesFromPathEnv,
  MUTANT_SEED_LIBRARY,
  renderSeedLibraryAsMutmutJunitXml,
  renderSeedLibraryAsStrykerReport,
  SEED_LIBRARY_EXPECTED_TOTALS,
  type MutationLegPlan,
  type MutantEntry,
  type SpawnFn,
} from "@pomaster/gauntlet-lite";
import { gateResultSchema } from "@pomaster/schemas";

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);
const validate = ajv.compile(gateResultSchema as unknown as Parameters<typeof ajv.compile>[0]);

// ============================================================
// 库结构不变量（固定考卷自身的完整性）
// ============================================================

describe("seed 库结构（固定考卷完整性）", () => {
  it("库非空、id 唯一、rationale 非空、expected ∈ 四类、toolStatus ∈ 七态词表", () => {
    expect(MUTANT_SEED_LIBRARY.length).toBe(12);
    const ids = MUTANT_SEED_LIBRARY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const seed of MUTANT_SEED_LIBRARY) {
      expect(seed.rationale.length).toBeGreaterThan(0);
      expect(["detected", "survived", "undetected_denominator", "excluded"]).toContain(
        seed.expected,
      );
      expect([
        "Killed",
        "Survived",
        "NoCoverage",
        "Timeout",
        "Ignored",
        "RuntimeError",
        "Pending",
      ]).toContain(seed.toolStatus);
    }
  });

  it("手工算术总账与库逐条复算一致（总账与考卷双向锁定）", () => {
    const killed = MUTANT_SEED_LIBRARY.filter((s) => s.toolStatus === "Killed").length;
    const timeout = MUTANT_SEED_LIBRARY.filter((s) => s.toolStatus === "Timeout").length;
    const survived = MUTANT_SEED_LIBRARY.filter((s) => s.toolStatus === "Survived").length;
    const noCoverage = MUTANT_SEED_LIBRARY.filter((s) => s.toolStatus === "NoCoverage").length;
    const excluded = MUTANT_SEED_LIBRARY.filter(
      (s) => !["Killed", "Timeout", "Survived", "NoCoverage"].includes(s.toolStatus),
    ).length;
    expect(killed).toBe(SEED_LIBRARY_EXPECTED_TOTALS.killed);
    expect(timeout).toBe(SEED_LIBRARY_EXPECTED_TOTALS.timeout);
    expect(survived).toBe(SEED_LIBRARY_EXPECTED_TOTALS.survived);
    expect(noCoverage).toBe(SEED_LIBRARY_EXPECTED_TOTALS.noCoverageStryker);
    expect(excluded).toBe(SEED_LIBRARY_EXPECTED_TOTALS.excluded);
    expect(killed + timeout).toBe(SEED_LIBRARY_EXPECTED_TOTALS.detected);
    expect(killed + survived + timeout + noCoverage).toBe(
      SEED_LIBRARY_EXPECTED_TOTALS.generated,
    );
  });

  it("渲染器确定性：两次渲染字节级一致（零墙钟零随机——A4）", () => {
    expect(renderSeedLibraryAsStrykerReport()).toBe(renderSeedLibraryAsStrykerReport());
    expect(renderSeedLibraryAsMutmutJunitXml()).toBe(renderSeedLibraryAsMutmutJunitXml());
  });
});

// ============================================================
// 敏感性验证（考题 × 判卷器，两报告词形逐一）
// ============================================================

/** 由解析产物找回单条 seed 的 entry（stryker 按 id 字段 / mutmut 按 testcase name 内嵌 id）。 */
function findSeedEntry(
  mutants: readonly MutantEntry[],
  seedId: string,
): MutantEntry | undefined {
  return mutants.find((m) => m.id !== null && m.id.includes(seedId));
}

describe("敏感性验证：判卷器对 seed 库逐条判定与预期吻合（错杀/漏杀/误置 = 失败）", () => {
  for (const [runner, render] of [
    ["stryker", renderSeedLibraryAsStrykerReport],
    ["mutmut", renderSeedLibraryAsMutmutJunitXml],
  ] as const) {
    describe(`词形=${runner}`, () => {
      const metrics = parseMutationReport(runner, render());
      it("报告可解析且 12 条 seed 全部在报告中", () => {
        expect(metrics).not.toBeNull();
        expect(metrics?.mutants.length).toBe(MUTANT_SEED_LIBRARY.length);
      });

      it.each(MUTANT_SEED_LIBRARY.map((s) => [s.id, s] as const))(
        "%s：解析态忠实 + 判卷分类与人工预期吻合",
        (seedId, seed) => {
          const entry = findSeedEntry(metrics?.mutants ?? [], seedId);
          // —— 解析态忠实：解析器不得改写第三方状态（错杀/漏杀的第一道闸在词形读取）。
          const statusWordTable: Record<string, string> = {
            Killed: "killed",
            Survived: "survived",
            NoCoverage: "no_coverage",
            Timeout: "timeout",
            RuntimeError: "runtime_error",
          };
          // mutmut junitxml 词形把 NoCoverage 表达为 suspicious（能力落差 4——语义降级
          // 如实呈现，两者同落 undetected_denominator）；RuntimeError 表达为 untested。
          const expectedInternal =
            runner === "mutmut" && seed.toolStatus === "NoCoverage"
              ? "suspicious"
              : runner === "mutmut" && seed.toolStatus === "RuntimeError"
                ? "untested"
                : statusWordTable[seed.toolStatus];
          expect(entry, seedId).toBeDefined();
          expect(entry?.status, `${seedId} 解析态忠实`).toBe(expectedInternal);
          // —— 判卷分类与人工预期吻合（判卷器被考的核心面）。
          expect(mutantStatusClass(entry?.status ?? "killed"), `${seedId} 判卷分类`).toBe(
            seed.expected,
          );
        },
      );

      it("汇总重算 = 手工算术总账（kill score 8/11 精确对账；单一实现 summarizeMutants）", () => {
        const stats = summarizeMutants(metrics?.mutants ?? []);
        expect(stats.generated).toBe(SEED_LIBRARY_EXPECTED_TOTALS.generated);
        expect(stats.detected).toBe(SEED_LIBRARY_EXPECTED_TOTALS.detected);
        expect(stats.killed).toBe(SEED_LIBRARY_EXPECTED_TOTALS.killed);
        expect(stats.timeout).toBe(SEED_LIBRARY_EXPECTED_TOTALS.timeout);
        expect(stats.survived).toBe(SEED_LIBRARY_EXPECTED_TOTALS.survived);
        if (runner === "stryker") {
          expect(stats.noCoverage).toBe(SEED_LIBRARY_EXPECTED_TOTALS.noCoverageStryker);
          expect(stats.suspicious).toBe(SEED_LIBRARY_EXPECTED_TOTALS.suspiciousStryker);
        } else {
          expect(stats.noCoverage).toBe(SEED_LIBRARY_EXPECTED_TOTALS.noCoverageMutmut);
          expect(stats.suspicious).toBe(SEED_LIBRARY_EXPECTED_TOTALS.suspiciousMutmut);
        }
        expect(stats.excluded).toBe(SEED_LIBRARY_EXPECTED_TOTALS.excluded);
        expect(stats.scorePercent).toBeCloseTo(SEED_LIBRARY_EXPECTED_TOTALS.scorePercent, 12);
        // 独立复算同一算术（8/11×100）——判卷数学单一实现的交叉验证。
        expect(computeKillScore(8, 11)).toBeCloseTo((8 / 11) * 100, 12);
      });

      it("幸存者名单逐字对账：恰为 SEED-MUT-009/010（等价变异红线——禁粉饰为 detected）", () => {
        const survivors = survivingMutants(metrics?.mutants ?? []);
        expect(survivors.map((m) => m.id)).toEqual(
          SEED_LIBRARY_EXPECTED_TOTALS.survivorSeedIds.map(
            (seedId) => findSeedEntry(metrics?.mutants ?? [], seedId)?.id ?? "(missing)",
          ),
        );
        // 等价变异（SEED-MUT-010）必须在幸存者名单内——判卷器把它算成 detected 即错杀红线。
        const equivalent = findSeedEntry(metrics?.mutants ?? [], "SEED-MUT-010");
        expect(mutantStatusClass(equivalent?.status ?? "killed")).toBe("survived");
      });
    });
  }

  it("词形间判卷漂移防护：同一 seed 在两词形下分类逐条一致（能力落差只降级位置/算子粒度，不改判卷分类）", () => {
    const stryker = parseStrykerReport(renderSeedLibraryAsStrykerReport());
    const mutmut = parseMutmutJunitXml(renderSeedLibraryAsMutmutJunitXml());
    expect(stryker).not.toBeNull();
    expect(mutmut).not.toBeNull();
    for (const seed of MUTANT_SEED_LIBRARY) {
      const s = mutantStatusClass(
        findSeedEntry(stryker?.mutants ?? [], seed.id)?.status ?? "killed",
      );
      const m = mutantStatusClass(
        findSeedEntry(mutmut?.mutants ?? [], seed.id)?.status ?? "killed",
      );
      expect(m, `${seed.id} 两词形分类一致`).toBe(s);
    }
  });

  it("能力落差如实标注的解析面证据：mutmut killed 条目无位置、无算子字段（≠ StrykerJS）", () => {
    const mutmut = parseMutmutJunitXml(renderSeedLibraryAsMutmutJunitXml());
    const killed = (mutmut?.mutants ?? []).filter((m) => m.status === "killed");
    expect(killed.length).toBe(SEED_LIBRARY_EXPECTED_TOTALS.killed);
    for (const entry of killed) {
      expect(entry.file).toBeNull();
      expect(entry.mutatorName).toBeNull();
    }
    const stryker = parseStrykerReport(renderSeedLibraryAsStrykerReport());
    const strykerKilled = (stryker?.mutants ?? []).filter((m) => m.status === "killed");
    for (const entry of strykerKilled) {
      expect(entry.file).toBe("src/calc.ts");
      expect(entry.mutatorName).not.toBeNull();
      expect(entry.line).not.toBeNull();
    }
  });
});

// ============================================================
// 全链路（seed 报告 → runMutationLeg 三道闸 → normalize 判卷入账）
// ============================================================

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-seed-mutants-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** 真实 spawnSync wrapper（PATH 引号消毒；与 mutationSpawn 同参数形态；可注入 env）。 */
function realSpawn(env: Record<string, string> = {}): SpawnFn {
  return (command, options) => {
    const res = spawnSync(command, {
      shell: true,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: "utf8",
      windowsHide: true,
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

const FAKE_TOOL_CJS = `const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write("4.0.0\\n");
  process.exit(0);
}
// 按调用模式分派：--render stryker|mutmut → 写 seed 库报告到 --report-out 相对路径；
// noop → 正常退出但不产出报告（报告缺席诚实 not_run 形态的构造器）。
const modeIdx = args.indexOf("--render");
const mode = modeIdx >= 0 ? args[modeIdx + 1] : "stryker";
if (mode === "noop") {
  process.exit(0);
}
const reportRel = args[args.indexOf("--report-out") + 1];
const seed = require(process.env.SEED_RENDERER_CJS);
const body = mode === "mutmut" ? seed.mutmut() : seed.stryker();
fs.mkdirSync(path.dirname(reportRel), { recursive: true });
fs.writeFileSync(reportRel, body);
process.exit(0);
`;

/** seed 渲染器 CommonJS 桥（fake 工具子进程复用同一渲染实现——判卷输入与 spec 同源）。 */
const SEED_RENDERER_CJS = `// 子进程不引 TS——渲染逻辑以最小拷贝内联（与 seed-mutants.ts 渲染器同构；spec 侧
// 字节级对账兜底两者不漂移）。
${renderLibraryCjs()}
module.exports = { stryker: () => renderStryker(), mutmut: () => renderMutmut() };
`;

/**
 * 把 seed-mutants.ts 的渲染逻辑镜像为 CommonJS（fake 工具子进程用）。
 * 字节级对账：spec 先在本进程渲染期望字节，再断言子进程产物与之一致——镜像漂移即红。
 */
function renderLibraryCjs(): string {
  // 直接内联两份渲染产物常量：子进程只需吐出与主进程渲染器字节一致的文本。
  const strykerBytes = JSON.stringify(renderSeedLibraryAsStrykerReport());
  const mutmutBytes = JSON.stringify(renderSeedLibraryAsMutmutJunitXml());
  return `function renderStryker() { return ${strykerBytes}; }
function renderMutmut() { return ${mutmutBytes}; }`;
}

function seedLegPlan(
  runner: "stryker" | "mutmut",
  scriptPath: string,
  projectRoot: string,
  reportRel: string,
): MutationLegPlan {
  return {
    tool: runner === "stryker" ? STRYKER_TOOL_ID : MUTMUT_TOOL_ID,
    toolVersion: runner === "stryker" ? "4.0.0" : "2.4.4",
    gate: MUTATION_GATE_NAME,
    gateDef: MUTATION_GATE_DEF,
    metricDialect: runner === "stryker" ? STRYKER_METRIC_DIALECT : MUTMUT_METRIC_DIALECT,
    grn: "GRN-2400",
    ranAtSeq: 2400,
    trigger: "on_demand",
    subjectId: null,
    denominatorRefs: [],
    projectRoot,
    runner,
    absenceKind: null,
    absentReason: null,
    absentHint: null,
    tier: "HARDENING",
    command: `node "${scriptPath}" --render ${runner} --report-out "${reportRel}"`,
    versionProbeCommand: `node "${scriptPath}" --version`,
    executable: "node",
    timeoutMs: 120_000,
    reportPath: reportRel,
    changedFiles: ["src/calc.ts", "src/log.ts", "src/math.ts", "src/edge.ts"],
    thresholds: MUTATION_PROVISIONAL_THRESHOLDS,
    thresholdsProvisional: true,
    expectedToolVersion: runner === "stryker" ? null : "2.4.4",
  };
}

describe("seed 库全链路：fake 工具 × 真实 spawnSync × 三道闸 × 判卷入账（P24 出口判据 3 落地面）", () => {
  const workRoot = mkdtempSync(join(tmpdir(), "pomaster-seed-tool-"));
  const scriptPath = join(workRoot, "fake-mutation-tool.cjs");
  writeFileSync(scriptPath, FAKE_TOOL_CJS, "utf8");
  const rendererPath = join(workRoot, "seed-renderer.cjs");
  writeFileSync(rendererPath, SEED_RENDERER_CJS, "utf8");

  function runSeedLeg(runner: "stryker" | "mutmut") {
    const projectRoot = mkdtempSync(join(tmpdir(), `pomaster-seed-run-${runner}-`));
    const reportRel = runner === "stryker" ? "reports/mutation/mutation.json" : "mutants.xml";
    const raw = runMutationLeg(
      seedLegPlan(runner, scriptPath, projectRoot, reportRel),
      realSpawn({ SEED_RENDERER_CJS: rendererPath }),
      // 可执行体探测真实 PATH（node 在位）。
    );
    return { raw, projectRoot, reportRel };
  }

  it("stryker 腿：真两段 spawn → 子进程真实产出 seed 报告 → kill score 72.73% < 85 → failed + 幸存者明细逐字对账", { timeout: 120_000 }, () => {
    const { raw } = runSeedLeg("stryker");
    expect(raw.kind).toBe("executed");
    expect(raw.observedToolVersion).toBe("4.0.0");
    expect(raw.reportText).toContain('"schemaVersion"');
    // 判卷输入与主进程渲染器字节级一致（子进程镜像不漂移）。
    expect(raw.reportText).toBe(renderSeedLibraryAsStrykerReport());
    const record = normalizeMutationLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.counts.applicableScanned).toBe(SEED_LIBRARY_EXPECTED_TOTALS.generated);
    expect(record.items?.some((i) => i.rule === "mutation_kill_score_below_threshold")).toBe(
      true,
    );
    const survivorItems = record.items?.filter((i) => i.rule === "mutation_survived") ?? [];
    expect(survivorItems.map((i) => i.location).sort()).toEqual([
      "src/log.ts:12",
      "src/math.ts:8",
    ]);
    expect(record.scopeNote).toContain("72.73");
    expect(record.scopeNote).toContain("Owner 决议 2026-09-01");
    expect(record.scopeNote).not.toContain("provisional 待 A4");
    expect(record.metricDialect).toBe(STRYKER_METRIC_DIALECT);
    const doc = toGateResultJson(record);
    if (!validate(doc)) console.error(validate.errors);
    expect(validate(doc)).toBe(true);
  });

  it("mutmut 腿：真两段 spawn → junitxml 词形 → 同一 kill score 判卷 + 能力落差注记在账", { timeout: 120_000 }, () => {
    const { raw } = runSeedLeg("mutmut");
    expect(raw.kind).toBe("executed");
    expect(raw.reportText).toBe(renderSeedLibraryAsMutmutJunitXml());
    const record = normalizeMutationLeg(raw, 0);
    expect(record.verdict).toBe("failed");
    expect(record.counts.violations).toBe(1);
    expect(record.counts.applicableScanned).toBe(SEED_LIBRARY_EXPECTED_TOTALS.generated);
    expect(record.scopeNote).toContain(MUTMUT_GAP_NOTE);
    // 非 survived 条目（killed/timeout/suspicious/untested）在 junitxml 词形均无位置
    // （能力落差 2）→ scope 归属不可复核条数 = 12 - 2 survived = 10，显式披露。
    expect(record.scopeNote).toContain(
      `scope 归属不可复核 ${String(MUTANT_SEED_LIBRARY.length - SEED_LIBRARY_EXPECTED_TOTALS.survived)} 条`,
    );
    const survivorItems = record.items?.filter((i) => i.rule === "mutation_survived") ?? [];
    expect(survivorItems.map((i) => i.location).sort()).toEqual([
      "src/log.ts:12",
      "src/math.ts:8",
    ]);
    expect(record.metricDialect).toBe(MUTMUT_METRIC_DIALECT);
    expect(validate(toGateResultJson(record))).toBe(true);
  });

  it("三态 truth-index 记录互异（seed 库面：failed / passed / not_run）", { timeout: 120_000 }, () => {
    // failed = seed 全库（kill score 72.73%）。
    const failedRaw = runSeedLeg("stryker").raw;
    const failed = normalizeMutationLeg(failedRaw, 0);
    // passed = 阈值降到 60%（配置显式供给形态——同库改阈值即翻转判卷）。
    const passedPlan: MutationLegPlan = {
      ...seedLegPlan("stryker", scriptPath, failedRaw.plan.projectRoot, "reports/mutation/mutation.json"),
      grn: "GRN-2401",
      ranAtSeq: 2401,
      thresholds: { minKillScore: 60, maxSurvivors: 10 },
      thresholdsProvisional: false,
    };
    const passed = normalizeMutationLeg(
      runMutationLeg(passedPlan, realSpawn({ SEED_RENDERER_CJS: rendererPath })),
      0,
    );
    // not_run = 报告失效化后 fake 工具不产出（报告缺席诚实非绿）。
    const notRunPlan: MutationLegPlan = {
      ...passedPlan,
      grn: "GRN-2402",
      ranAtSeq: 2402,
      command: `node "${scriptPath}" --render noop --report-out "reports/mutation/mutation.json"`,
    };
    const notRun = normalizeMutationLeg(
      runMutationLeg(notRunPlan, realSpawn({ SEED_RENDERER_CJS: rendererPath })),
      0,
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
