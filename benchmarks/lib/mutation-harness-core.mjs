/**
 * mutation-harness-core.mjs —— benchmarks/mutation-kill.mjs 的可测核心（L6-1 交付 4：
 * 判卷 / 分数重算 / 恢复完整性纯函数化，harness 脚本保持薄；vitest 测试面
 * tests/mutation-harness-core.spec.ts 用同一批导出对账）。
 *
 * 定位（测试战略 L6-1）：对 Decision/Gate 模块实测「Mutation kill score ≥ 85%
 * （changed-code scope）」。本模块只做纯逻辑，零 I/O、零墙钟、零随机：
 * - mutant 应用 = 精确 old→new 单点替换（old 必须在源文件恰出现一次——多站点/零命中
 *   一律报错，禁静默选第一个命中）；
 * - 判卷分类 = scoped vitest 退出码 + jest-json 报告 → survived / killed /
 *   harness_error 三态（**可解析报告是判卷唯一证据面：无可解析报告 = harness_error**
 *   ——环境故障/报告缺失当 killed 会虚高 score、当 survived 会伪造幸存者，两个方向
 *   都违反诚实性至上纪律）；
 * - kill score 重算 = detected / generated × 100（StrykerJS 口径子集：本 harness 的
 *   mutant 只有 Killed/Survived 两态，无 timeout/no_coverage——detected=killed，
 *   generated=killed+survived；空分母抛错禁当 0% 或 100%，与 gauntlet-lite
 *   mutation-leg computeKillScore 同一域闸姿态）；
 * - 报告合成 = StrykerJS mutation-testing-elements 词形（判卷锚词形复用——判卷侧由
 *   gauntlet-lite parseStrykerReport / summarizeMutants / normalizeMutationLeg 消费，
 *   生成者/判卷者分离纪律）。
 *
 * D24/A4：sha256Hex 仅供恢复完整性复核，不作内容身份；无墙钟字段。
 */
import { createHash } from "node:crypto";

/**
 * 单条 mutant 定义（harness 数据面）。
 * old/new 以 LF 书写；应用时按目标文件实际 EOL 转换后做单点精确替换。
 *
 * @typedef {object} MutantDef
 * @property {string} id            mutant 身份（MUT-<模块前缀>-<序号>）。
 * @property {string} file          仓内相对源文件路径（正斜杠）。
 * @property {string} mutatorName   变异算子类名（判卷报告词形用）。
 * @property {string} description   中文描述（落在哪个决策分支、为什么是真分支）。
 * @property {string} old           精确原文片段（LF；必须在该文件恰出现一次）。
 * @property {string} new           替换后片段（LF）。
 */

/**
 * 逐 mutant 判卷结果。
 *
 * @typedef {object} MutantOutcome
 * @property {string} id
 * @property {string} file
 * @property {number} line               命中行号（原文 1-based）。
 * @property {string} mutatorName
 * @property {string} description
 * @property {boolean} killed
 * @property {"mapped_scope"|"kernel_recheck"} killedBy 判杀通道（复核通道显式留痕）。
 * @property {string[]} killingTests     杀死该 mutant 的测试全名（幸存者为 []）。
 * @property {number} durationMs         该 mutant 判卷墙钟耗时（允许字段）。
 */

/** 文件实际 EOL 检测（混合 EOL 以多数派为准的简化口径：含任一 CRLF 即按 CRLF 处理）。 */
export function detectEol(content) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

/** 把 LF 书写的片段转换为目标文件 EOL 词形。 */
export function convertEol(text, eol) {
  return eol === "\r\n" ? text.replace(/\r?\n/g, "\r\n") : text.replace(/\r\n/g, "\n");
}

/**
 * 把 mutant 应用到源内容：old 恰出现一次才允许替换（零命中/多命中均报错——
 * mutant 必须钉死唯一站点）；返回替换后全文与命中行号。
 *
 * @param {string} content 源文件全文。
 * @param {MutantDef} mutant mutant 定义。
 * @returns {{ ok: true, mutated: string, line: number } | { ok: false, error: string }}
 */
export function applyMutantToContent(content, mutant) {
  const eol = detectEol(content);
  const oldText = convertEol(mutant.old, eol);
  const newText = convertEol(mutant.new, eol);
  const first = content.indexOf(oldText);
  if (first === -1) {
    return {
      ok: false,
      error: `mutant ${mutant.id} old 片段在 ${mutant.file} 零命中（源已漂移或站点写错）——禁静默跳过`,
    };
  }
  if (content.indexOf(oldText, first + 1) !== -1) {
    return {
      ok: false,
      error: `mutant ${mutant.id} old 片段在 ${mutant.file} 命中多次——mutant 必须钉死唯一站点，禁静默选第一个`,
    };
  }
  const mutated = content.slice(0, first) + newText + content.slice(first + oldText.length);
  const line = content.slice(0, first).split("\n").length;
  return { ok: true, mutated, line };
}

/**
 * 判卷分类：把一次 scoped vitest 子进程结果归入 survived / killed / harness_error。
 * 规则（fail-closed 诚实语义；RT1-B2 封条）：
 * - **可解析 json 报告是判卷的唯一证据面**：无可解析报告 = 无测试证据 = harness_error
 *   （exit 码本身不是判卷输入——伪造 exit 1 不得折进 killed，伪造 exit 0 也不得折进
 *   survived；收集期崩溃 / 报告缺失 / runner 无法 spawn 一律 harness_error，调用方
 *   以 exit 2 拒绝判卷——「把环境故障当 killed」会虚高 score，「当 survived」则伪造
 *   幸存者，两个方向都违反诚实性至上纪律）；
 * - exit 0 + 报告 0 failed        → survived；
 * - exit 1 + 报告有 failed 明细    → killed（killingTests 取 failed 断言全名）；
 * - exit 1 + 报告无逐条 failed     → killed（killingTests 落显式占位——报告在座但无
 *   逐测试明细，留痕非无证据）；
 * - exit 0 + 报告 numFailedTests>0 → harness_error（退出码与报告矛盾，判卷输入不可信）。
 *
 * @param {{ status: number | null, errorMessage: string | null, jsonText: string | null }} run
 * @returns {{ outcome: "survived"|"killed"|"harness_error", killingTests: string[], detail: string }}
 */
export function classifyVitestRun(run) {
  const { status, errorMessage, jsonText } = run;
  const parsed = tryParseVitestJson(jsonText);
  if (parsed === null) {
    return {
      outcome: "harness_error",
      killingTests: [],
      detail: `无可解析 json 报告（status=${String(status)}，error=${errorMessage ?? "unknown"}）——报告是判卷唯一证据面，无报告不构成 killed 也不构成 survived（fail-closed）`,
    };
  }
  if (status === 0) {
    if (parsed.numFailedTests > 0) {
      return {
        outcome: "harness_error",
        killingTests: [],
        detail: `exit 0 但 json 报告 numFailedTests=${parsed.numFailedTests}——退出码与报告矛盾，判卷输入不可信`,
      };
    }
    return { outcome: "survived", killingTests: [], detail: "scoped 测试全绿（exit 0 + 报告 0 failed）" };
  }
  if (status === 1) {
    const killingTests = [];
    for (const suite of parsed.testResults ?? []) {
      for (const assertion of suite.assertionResults ?? []) {
        if (assertion.status === "failed" && assertion.fullName) {
          killingTests.push(assertion.fullName);
        }
      }
    }
    return {
      outcome: "killed",
      killingTests: killingTests.length > 0 ? killingTests : ["(exit 1，json 报告在座但无逐条 failed 明细)"],
      detail: `exit 1，json 报告 numFailedTests=${parsed.numFailedTests}，failed 明细 ${killingTests.length} 条`,
    };
  }
  return {
    outcome: "harness_error",
    killingTests: [],
    detail: `vitest 子进程异常退出：status=${String(status)}，报告 ${parsed.numFailedTests} failed——退出码词形外（非 0/1）不作判卷`,
  };
}

function tryParseVitestJson(jsonText) {
  if (jsonText === null || jsonText.length === 0) return null;
  try {
    const parsed = JSON.parse(jsonText);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * kill score 重算（C5 同姿态：判卷算术单一来源）。
 * 本 harness 的 mutant 两态口径：detected = killed；generated = killed + survived。
 * 空分母抛错（禁把空分母当 0% 或 100%）。
 *
 * @param {readonly { killed: boolean }[]} outcomes
 * @returns {{ generated: number, killed: number, survived: number, detected: number, scorePercent: number }}
 */
export function recomputeMutationTotals(outcomes) {
  let killed = 0;
  let survived = 0;
  for (const o of outcomes) {
    if (o.killed) killed += 1;
    else survived += 1;
  }
  const generated = killed + survived;
  if (generated <= 0) {
    throw new Error(
      `kill score 空分母（generated=${generated}）——调用方必须先保证至少一条 mutant，禁把空分母当 0% 或 100%`,
    );
  }
  return {
    generated,
    killed,
    survived,
    detected: killed,
    scorePercent: (killed / generated) * 100,
  };
}

/**
 * 合成 StrykerJS mutation-testing-elements 词形报告（判卷锚消费词形；确定性序列化——
 * 按输入序排列，零墙钟零随机）。
 *
 * @param {readonly MutantOutcome[]} outcomes
 * @returns {string} JSON 文本（schemaVersion 1.0；status ∈ Killed|Survived）。
 */
export function buildElementsReport(outcomes) {
  const files = {};
  for (const o of outcomes) {
    const bucket = files[o.file] ?? (files[o.file] = { language: "typescript", mutants: [] });
    bucket.mutants.push({
      id: o.id,
      mutatorName: o.mutatorName,
      replacement: "(harness)",
      location: { start: { line: o.line, column: 1 }, end: { line: o.line, column: 2 } },
      status: o.killed ? "Killed" : "Survived",
    });
  }
  return JSON.stringify({ schemaVersion: "1.0", files, testFiles: {}, projectRoot: "." });
}

/**
 * harness 算术 × gauntlet-lite 判卷器对账（可复算对账纪律：分数必须是重算值且两路
 * 独立重算一致；不一致即判卷管线破损）。
 *
 * @param {{ generated: number, killed: number, survived: number, detected: number, scorePercent: number }} judgeStats
 * @param {{ generated: number, killed: number, survived: number, detected: number, scorePercent: number }} harnessTotals
 * @returns {{ ok: boolean, mismatches: string[] }}
 */
export function crosscheckJudgeStats(judgeStats, harnessTotals) {
  const mismatches = [];
  const EPS = 1e-9;
  for (const key of ["generated", "killed", "survived", "detected"]) {
    if (judgeStats[key] !== harnessTotals[key]) {
      mismatches.push(`${key}: judge=${String(judgeStats[key])} harness=${String(harnessTotals[key])}`);
    }
  }
  if (Math.abs(judgeStats.scorePercent - harnessTotals.scorePercent) > EPS) {
    mismatches.push(
      `scorePercent: judge=${String(judgeStats.scorePercent)} harness=${String(harnessTotals.scorePercent)}`,
    );
  }
  return { ok: mismatches.length === 0, mismatches };
}

/** sha256 十六进制摘要（恢复完整性复核专用；非内容身份字段）。 */
export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * 落盘结果 at-rest 校验（RT2 封条）：重放判卷锚（持久化的合成报告 → 判卷器重算）
 * 并与落盘自报逐项对账——手改落盘分数/计数/判卷词形/killed 位必须在此被检出，
 * 不再依赖「下次手动重跑覆盖」。mutation-kill.mjs --verify 以 gauntlet-lite dist
 * 的真实 parseStrykerReport / summarizeMutants 作 deps 注入；单测用同一真实判卷器。
 *
 * @param {Record<string, unknown>} results 落盘 results 对象（JSON.parse 产物）。
 * @param {{
 *   parseStrykerReport(text: string): { mutants: readonly Record<string, unknown>[] } | null,
 *   summarizeMutants(mutants: readonly Record<string, unknown>[]): {
 *     generated: number, killed: number, survived: number, detected: number, scorePercent: number,
 *   },
 * }} deps 判卷锚（生成者/判卷者分离——校验器不自带第二套解析/汇总算术）。
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function verifyMutationResults(results, deps) {
  const problems = [];
  if (typeof results?.harness_report !== "string" || results.harness_report.length === 0) {
    problems.push(
      "results.harness_report 缺席——文件早于 RT2 封条版本（无 at-rest 判卷锚可重放），重跑 harness 生成新格式后再 verify",
    );
    return { ok: false, problems };
  }
  const parsed = deps.parseStrykerReport(results.harness_report);
  if (parsed === null) {
    problems.push("harness_report 词形不可解析（malformed）——判卷锚破损");
    return { ok: false, problems };
  }
  const judge = deps.summarizeMutants(parsed.mutants);
  const totals = results.totals ?? {};
  for (const key of ["generated", "killed", "survived", "detected"]) {
    if (judge[key] !== totals[key]) {
      problems.push(`totals.${key}: 落盘=${String(totals[key])} 判卷锚重算=${String(judge[key])}`);
    }
  }
  const claimedScore = results.recomputed_score;
  if (typeof claimedScore !== "number" || Math.abs(claimedScore - judge.scorePercent) > 1e-9) {
    problems.push(`recomputed_score: 落盘=${String(claimedScore)} 判卷锚重算=${String(judge.scorePercent)}`);
  }

  // mutants[] 与报告逐条互证（条目集一致 + 判卷位一致）。
  const mutants = Array.isArray(results.mutants) ? results.mutants : [];
  if (mutants.length !== judge.generated) {
    problems.push(`mutants.length=${String(mutants.length)} ≠ generated=${String(judge.generated)}`);
  }
  const statusById = new Map();
  for (const m of parsed.mutants) statusById.set(m.id, m.status);
  for (const m of mutants) {
    const status = statusById.get(m?.id);
    if (status === undefined) {
      problems.push(`mutants[] 条目 ${String(m?.id)} 在 harness_report 中缺席`);
      continue;
    }
    // parseStrykerReport 把七态词形归一为小写（Killed→killed）——比较用小写词形。
    if ((String(status).toLowerCase() === "killed") !== (m.killed === true)) {
      problems.push(`mutant ${String(m?.id)}: 落盘 killed=${String(m?.killed)} 与报告 status=${String(status)} 矛盾`);
    }
  }
  if (statusById.size !== mutants.length) {
    problems.push(`harness_report mutant 数=${String(statusById.size)} ≠ mutants[]=${String(mutants.length)}`);
  }

  // gate_record / ok 与阈值重算对账。
  const rec = results.gate_record ?? {};
  const th = results.thresholds ?? {};
  if (rec?.counts?.applicableScanned !== judge.generated) {
    problems.push(
      `gate_record.counts.applicableScanned=${String(rec?.counts?.applicableScanned)} ≠ generated=${String(judge.generated)}`,
    );
  }
  if (typeof th.minKillScore === "number" && typeof th.maxSurvivors === "number") {
    const expectedViolations =
      (judge.scorePercent < th.minKillScore ? 1 : 0) + (judge.survived > th.maxSurvivors ? 1 : 0);
    if (rec?.counts?.violations !== expectedViolations) {
      problems.push(
        `gate_record.counts.violations=${String(rec?.counts?.violations)} ≠ 阈值重算=${String(expectedViolations)}`,
      );
    }
    const expectedVerdict = expectedViolations === 0 ? "passed" : "failed";
    if (rec?.verdict !== expectedVerdict) {
      problems.push(`gate_record.verdict=${String(rec?.verdict)} ≠ 阈值重算=${expectedVerdict}`);
    }
    const expectedOk = judge.scorePercent >= th.minKillScore && judge.survived <= th.maxSurvivors;
    if (results.ok !== expectedOk) {
      problems.push(`results.ok=${String(results.ok)} ≠ 阈值重算=${String(expectedOk)}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
