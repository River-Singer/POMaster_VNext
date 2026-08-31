import { describe, expect, it } from "vitest";
import {
  applyMutantToContent,
  buildElementsReport,
  classifyVitestRun,
  convertEol,
  crosscheckJudgeStats,
  detectEol,
  recomputeMutationTotals,
  sha256Hex,
  verifyMutationResults,
  type MutantDef,
  type MutantOutcome,
} from "../benchmarks/lib/mutation-harness-core.mjs";
import { parseStrykerReport, summarizeMutants } from "@pomaster/gauntlet-lite";

/**
 * mutation-harness-core.spec.ts —— benchmarks/mutation-kill.mjs 可测核心的单元面
 * （L6-1 交付 4：判卷 / 分数重算 / 恢复完整性抽纯函数后补 vitest 覆盖；
 * benchmarks 脚本保持薄，判卷数学单一实现：分数对账复用 gauntlet-lite
 * parseStrykerReport + summarizeMutants，不在测试侧复写第二套算术）。
 *
 * 对应纪律：生成者/判卷者分离（本 spec 用固定输入考判卷器——错杀/漏杀/空分母
 * 当满分均红）；harness_error 三态语义（runner 故障禁当 killed 虚高 score）；
 * 单点替换唯一站点强制（零命中/多命中禁静默）。
 */

const SAMPLE = [
  "export function decide(x: number): number {",
  "  if (x > 0) {",
  '    return x + 1;',
  "  }",
  "  return 0;",
  "}",
].join("\n");

const MUTANT: MutantDef = {
  id: "MUT-T-001",
  file: "sample.ts",
  mutatorName: "ComparisonOperator",
  description: "比较翻转考题",
  old: "if (x > 0) {",
  new: "if (x < 0) {",
};

describe("applyMutantToContent（单点替换 + 唯一站点强制）", () => {
  it("唯一命中：替换成功并报告 1-based 行号", () => {
    const applied = applyMutantToContent(SAMPLE, MUTANT);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.line).toBe(2);
    expect(applied.mutated).toContain("if (x < 0) {");
    expect(applied.mutated).not.toContain("if (x > 0) {");
  });

  it("恢复完整性反向：mutated 把 new 换回 old 得到字节级原文（LF 与 CRLF 两词形）", () => {
    const applied = applyMutantToContent(SAMPLE, MUTANT);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.mutated.replace(MUTANT.new, MUTANT.old)).toBe(SAMPLE);
    const crlf = convertEol(SAMPLE, "\r\n");
    const appliedCrlf = applyMutantToContent(crlf, MUTANT);
    expect(appliedCrlf.ok).toBe(true);
    if (!appliedCrlf.ok) return;
    expect(appliedCrlf.mutated.replace(convertEol(MUTANT.new, "\r\n"), convertEol(MUTANT.old, "\r\n"))).toBe(crlf);
  });

  it("零命中 → 显式报错（禁静默跳过）", () => {
    const applied = applyMutantToContent(SAMPLE, { ...MUTANT, old: "if (x >= 0) {" });
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.error).toContain("零命中");
  });

  it("红队回归 RT1-A：零变更 mutant（old===new）→ mutated===原文（调用方读回验证可判 invalid 不入分母）", () => {
    const applied = applyMutantToContent(SAMPLE, { ...MUTANT, new: MUTANT.old });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.mutated).toBe(SAMPLE);
  });

  it("多命中 → 显式报错（禁静默选第一个命中站点）", () => {
    const applied = applyMutantToContent(SAMPLE, { ...MUTANT, old: "return 0;" });
    // 单行 sample 只有一处 return 0——构造双份文本制造多命中形态。
    const doubled = applyMutantToContent(`${SAMPLE}\n${SAMPLE}`, { ...MUTANT, old: "if (x > 0) {" });
    expect(doubled.ok).toBe(false);
    if (!doubled.ok) expect(doubled.error).toContain("命中多次");
    expect(applied.ok).toBe(true);
  });

  it("CRLF 文件：old/new 按文件 EOL 转换后仍单点命中", () => {
    const crlf = convertEol(SAMPLE, "\r\n");
    expect(detectEol(crlf)).toBe("\r\n");
    const applied = applyMutantToContent(crlf, MUTANT);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.mutated).toContain(convertEol(MUTANT.new, "\r\n"));
  });

  it("detectEol：LF 文件不误判 CRLF", () => {
    expect(detectEol(SAMPLE)).toBe("\n");
  });
});

describe("classifyVitestRun（三态判卷：survived / killed / harness_error）", () => {
  it("exit 0 → survived", () => {
    const v = classifyVitestRun({ status: 0, errorMessage: null, jsonText: '{"numFailedTests":0}' });
    expect(v.outcome).toBe("survived");
    expect(v.killingTests).toEqual([]);
  });

  it("exit 0 但 json 报 numFailedTests>0 → harness_error（判卷输入矛盾不可信）", () => {
    const v = classifyVitestRun({ status: 0, errorMessage: null, jsonText: '{"numFailedTests":3}' });
    expect(v.outcome).toBe("harness_error");
  });

  it("exit 1 + json → killed，killingTests 取 failed 断言全名", () => {
    const json = JSON.stringify({
      numFailedTests: 2,
      testResults: [
        {
          assertionResults: [
            { status: "passed", fullName: "a > ok" },
            { status: "failed", fullName: "a > 边界用例" },
            { status: "failed", fullName: "a > 值断言" },
          ],
        },
      ],
    });
    const v = classifyVitestRun({ status: 1, errorMessage: null, jsonText: json });
    expect(v.outcome).toBe("killed");
    expect(v.killingTests).toEqual(["a > 边界用例", "a > 值断言"]);
  });

  it("红队回归 RT1-B2：伪造 exit 1 且无 json 报告 → harness_error（禁折进 killed——伪造 100% 通道封死）", () => {
    // 攻击形态：判卷运行步骤被替换为「直接返回 {status:1, jsonText:null}」——
    // 封条前该形态一律判 killed，30 条零测试运行的 mutant 产出假 100%（实测得手）。
    const v = classifyVitestRun({ status: 1, errorMessage: null, jsonText: null });
    expect(v.outcome).toBe("harness_error");
    expect(v.killingTests).toEqual([]);
    // 同封条覆盖错误消息形态（真实采集期崩溃同一无证据形态）。
    const v2 = classifyVitestRun({ status: 1, errorMessage: "EPIPE", jsonText: null });
    expect(v2.outcome).toBe("harness_error");
    expect(v2.detail).toContain("唯一证据面");
  });

  it("红队回归 RT1-B2 对偶面：伪造 exit 0 且无 json 报告 → harness_error（禁折进 survived）", () => {
    const v = classifyVitestRun({ status: 0, errorMessage: null, jsonText: null });
    expect(v.outcome).toBe("harness_error");
  });

  it("exit 1 + 报告在座但无逐条 failed 明细 → killed（占位留痕，非无报告）", () => {
    const v = classifyVitestRun({ status: 1, errorMessage: null, jsonText: '{"numFailedTests":1}' });
    expect(v.outcome).toBe("killed");
    expect(v.killingTests.length).toBe(1);
    expect(v.killingTests[0]).toContain("无逐条 failed 明细");
  });

  it("status null（runner 超时/无法 spawn）→ harness_error（runner 故障禁当 killed 虚高 score）", () => {
    const v = classifyVitestRun({ status: null, errorMessage: "ETIMEDOUT", jsonText: null });
    expect(v.outcome).toBe("harness_error");
  });

  it("其他退出码（如 2）→ harness_error", () => {
    const v = classifyVitestRun({ status: 2, errorMessage: null, jsonText: null });
    expect(v.outcome).toBe("harness_error");
  });
});

describe("recomputeMutationTotals（kill score 重算，C5 同姿态）", () => {
  it("手工算术总账对账（seed 库同款纪律：8/11 → 72.72…%）", () => {
    // 8 killed + 3 survived = generated 11（seed 库 8/11 手工算术锚同源）。
    const eleven = [
      ...Array.from({ length: 8 }, (_, i) => ({ killed: true, id: `k${String(i)}` })),
      ...Array.from({ length: 3 }, (_, i) => ({ killed: false, id: `s${String(i)}` })),
    ];
    const totals = recomputeMutationTotals(eleven);
    expect(totals.generated).toBe(11);
    expect(totals.killed).toBe(8);
    expect(totals.survived).toBe(3);
    expect(totals.detected).toBe(8);
    expect(totals.scorePercent).toBeCloseTo((8 / 11) * 100, 12);
    // 正交 7/4 组合防「凑巧过账」。
    const seven = recomputeMutationTotals([
      ...Array.from({ length: 7 }, (_, i) => ({ killed: true, id: `p${String(i)}` })),
      ...Array.from({ length: 4 }, (_, i) => ({ killed: false, id: `q${String(i)}` })),
    ]);
    expect(seven.scorePercent).toBeCloseTo((7 / 11) * 100, 12);
  });

  it("空分母 → 抛错（禁把空分母当 0% 或 100%）", () => {
    expect(() => recomputeMutationTotals([])).toThrow(/空分母/);
  });

  it("全杀 → 100%；零杀 → 0%", () => {
    expect(recomputeMutationTotals([{ killed: true }, { killed: true }]).scorePercent).toBe(100);
    expect(recomputeMutationTotals([{ killed: false }, { killed: false }]).scorePercent).toBe(0);
  });
});

describe("buildElementsReport × gauntlet-lite 判卷器（生成者/判卷者分离对账）", () => {
  const outcomes: MutantOutcome[] = [
    { id: "MUT-A-001", file: "src/a.ts", line: 10, mutatorName: "ComparisonOperator", description: "d", killed: true, killedBy: "mapped_scope", killingTests: ["t1"], durationMs: 5 },
    { id: "MUT-A-002", file: "src/a.ts", line: 20, mutatorName: "BoundaryConstant", description: "d", killed: false, killedBy: null, killingTests: [], durationMs: 6 },
    { id: "MUT-B-001", file: "src/b.ts", line: 30, mutatorName: "BooleanNegation", description: "d", killed: true, killedBy: "kernel_recheck", killingTests: ["t2"], durationMs: 7 },
  ];

  it("合成报告经真实 parseStrykerReport 解析且 summarizeMutants 与 harness 算术一致", () => {
    const parsed = parseStrykerReport(buildElementsReport(outcomes));
    expect(parsed).not.toBeNull();
    if (parsed === null) return;
    const stats = summarizeMutants(parsed.mutants);
    const harness = recomputeMutationTotals(outcomes);
    expect(stats.generated).toBe(harness.generated);
    expect(stats.killed).toBe(harness.killed);
    expect(stats.survived).toBe(harness.survived);
    expect(stats.detected).toBe(harness.detected);
    expect(stats.scorePercent).toBeCloseTo(harness.scorePercent, 12);
    const cross = crosscheckJudgeStats(stats, harness);
    expect(cross.ok).toBe(true);
  });

  it("对账失配可检出（judge 与 harness 数字分叉 → mismatches 非空）", () => {
    const cross = crosscheckJudgeStats(
      { generated: 3, killed: 2, survived: 1, detected: 2, scorePercent: 66.67 },
      { generated: 3, killed: 3, survived: 0, detected: 3, scorePercent: 100 },
    );
    expect(cross.ok).toBe(false);
    expect(cross.mismatches.length).toBeGreaterThan(0);
  });

  it("跨文件分组：报告按 file 分桶（scope 复核可逐条定位）", () => {
    const report = JSON.parse(buildElementsReport(outcomes)) as {
      files: Record<string, { mutants: { id: string }[] }>;
    };
    expect(Object.keys(report.files).sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(report.files["src/a.ts"]?.mutants.map((m) => m.id)).toEqual(["MUT-A-001", "MUT-A-002"]);
  });

  it("两状词形之外不产出（status ∈ Killed|Survived；无 timeout/no_coverage 假词形）", () => {
    const report = JSON.parse(buildElementsReport(outcomes)) as {
      files: Record<string, { mutants: { status: string }[] }>;
    };
    for (const file of Object.values(report.files)) {
      for (const m of file.mutants) expect(["Killed", "Survived"]).toContain(m.status);
    }
  });
});

describe("sha256Hex（恢复完整性复核基元）", () => {
  it("已知向量：sha256('abc') = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("内容不同 → 摘要不同；同内容 Buffer 与字符串等价", () => {
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
    expect(sha256Hex(Buffer.from("abc", "utf8"))).toBe(sha256Hex("abc"));
  });
});

describe("verifyMutationResults（RT2 封条：落盘结果 at-rest 校验）", () => {
  // 真实判卷器作 deps（生成者/判卷者分离——校验器不自带第二套解析/汇总算术）。
  const deps = { parseStrykerReport, summarizeMutants };

  /** 构造一份与落盘自报完全一致的合法 results（2 killed + 1 survived）。 */
  function genuineResults(): Record<string, unknown> {
    const outcomes: MutantOutcome[] = [
      { id: "MUT-A-001", file: "src/a.ts", line: 10, mutatorName: "ComparisonOperator", description: "d", killed: true, killedBy: "mapped_scope", killingTests: ["t1"], durationMs: 5 },
      { id: "MUT-A-002", file: "src/a.ts", line: 20, mutatorName: "BoundaryConstant", description: "d", killed: false, killedBy: null, killingTests: [], durationMs: 6 },
      { id: "MUT-B-001", file: "src/b.ts", line: 30, mutatorName: "BooleanNegation", description: "d", killed: true, killedBy: "kernel_recheck", killingTests: ["t2"], durationMs: 7 },
    ];
    const totals = recomputeMutationTotals(outcomes);
    return {
      schema: "pomaster.vnext.mutation-kill-results/1",
      seq: 1,
      ok: totals.scorePercent >= 85 && totals.survived <= 10,
      harness_report: buildElementsReport(outcomes),
      mutants: outcomes,
      totals,
      recomputed_score: totals.scorePercent,
      thresholds: { minKillScore: 85, maxSurvivors: 10 },
      gate_record: {
        verdict: "failed",
        counts: {
          applicableScanned: totals.generated,
          violations: (totals.scorePercent < 85 ? 1 : 0) + (totals.survived > 10 ? 1 : 0),
        },
      },
    };
  }

  it("合法落盘结果 → 对账一致 ok=true", () => {
    const verdict = verifyMutationResults(genuineResults(), deps);
    expect(verdict.ok).toBe(true);
    expect(verdict.problems).toEqual([]);
  });

  it("harness_report 缺席（封条前旧格式）→ 显式拒绝并指明重跑，禁静默通过", () => {
    const legacy = genuineResults();
    delete legacy.harness_report;
    const verdict = verifyMutationResults(legacy, deps);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems[0]).toContain("harness_report 缺席");
  });

  it("红队回归 RT2：手改落盘分数/计数 → 判卷锚重放检出（零自动化重跑防线封死）", () => {
    // 攻击形态：手改 recomputed_score/totals 为满分——封条前零检出直到手动重跑。
    const tampered = genuineResults() as Record<string, unknown>;
    tampered.recomputed_score = 100;
    (tampered.totals as Record<string, unknown>) = {
      ...(tampered.totals as Record<string, unknown>),
      killed: 3,
      survived: 0,
      detected: 3,
      scorePercent: 100,
    };
    const verdict = verifyMutationResults(tampered, deps);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("; ")).toContain("recomputed_score");
    expect(verdict.problems.join("; ")).toContain("totals.killed");
    expect(verdict.problems.join("; ")).toContain("totals.survived");
  });

  it("红队回归 RT2 对偶面：翻转 mutants[].killed 位 → 与报告 status 逐条互证检出", () => {
    const tampered = genuineResults();
    (tampered.mutants as MutantOutcome[])[0]!.killed = false;
    (tampered.mutants as MutantOutcome[])[1]!.killed = true;
    const verdict = verifyMutationResults(tampered, deps);
    expect(verdict.ok).toBe(false);
    const joined = verdict.problems.join("; ");
    expect(joined).toContain("MUT-A-001");
    expect(joined).toContain("MUT-A-002");
  });

  it("删除一条 mutants[] 条目（分母缩员）→ 条目数对账检出", () => {
    const tampered = genuineResults();
    tampered.mutants = (tampered.mutants as MutantOutcome[]).slice(1);
    const verdict = verifyMutationResults(tampered, deps);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("; ")).toContain("mutants.length");
  });

  it("ok 位与阈值重算矛盾（分数未达 85 却 ok=true）→ 检出", () => {
    const tampered = genuineResults();
    tampered.ok = true; // genuineResults 里 66.67% < 85 → ok 本应为 false
    const verdict = verifyMutationResults(tampered, deps);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("; ")).toContain("results.ok");
  });
});
