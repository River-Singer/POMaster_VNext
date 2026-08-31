/**
 * run-all.mjs —— Self-hosting benchmark 三档合跑 + 结果落盘（PRD §90.3 / C7 / L6-3）。
 *
 * 行为：
 *   1. 依次跑 Tiny（期望 MINIMAL）、Normal（期望 LIGHT/STANDARD）、Constitutional
 *      （期望 STRICT + Meta-Governance，口径 A3 pending）三档；constitutional 档复用
 *      本轮已跑的 tiny/normal 条目做三档路径签名可区分性判卷（不重复执行子进程）；
 *   2. 把三档真实输出写入 benchmarks/last-results.json（含 durationMs / profile /
 *      断言明细 / 路径签名 / a3_pending_items）；
 *   3. 运行序以整数 seq + run_id（bench-NNNN）标识——timestamp 禁入，
 *      seq 即 C7 校准轮代号（校准报告 calibration-template.md 以它为锚）。
 *
 * schema 演进（/1 → /2，向后兼容）：新增 entries[].path_signature /
 * entries[].a3_pending_items（constitutional 档）与顶层 a3_pending_items 汇总；
 * 既有消费面（readPrevSeq 只取 seq；m6 evidence pack 取 run_id/summary）字段不变。
 *
 * 退出码：0 = 三档断言全过；1 = 存在断言失败；2 = 基准装置错误（dist 缺失/崩溃）。
 * 运行：node benchmarks/run-all.mjs
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { runTinyBenchmark } from "./tiny.mjs";
import { runNormalBenchmark } from "./normal.mjs";
import { runConstitutionalBenchmark } from "./constitutional.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = path.resolve(here, "last-results.json");

const RESULTS_SCHEMA = "pomaster.vnext.selfhosting-benchmark-results/2";

function readPrevSeq() {
  try {
    const prev = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    return Number.isInteger(prev?.seq) ? prev.seq : 0;
  } catch {
    return 0;
  }
}

const tinyEntry = await runTinyBenchmark();
const normalEntry = await runNormalBenchmark();
const constitutionalEntry = await runConstitutionalBenchmark({
  tinyEntry,
  normalEntry,
});
const entries = [tinyEntry, normalEntry, constitutionalEntry];

const harnessBroken = entries.some((e) => typeof e.error === "string");
const seq = readPrevSeq() + 1;
const report = {
  schema: RESULTS_SCHEMA,
  run_id: `bench-${String(seq).padStart(4, "0")}`,
  seq,
  ok: entries.every((e) => e.ok === true),
  summary: {
    total: entries.length,
    passed: entries.filter((e) => e.ok === true).length,
    failed: entries.filter((e) => e.ok !== true).length,
  },
  entries,
  /** L6-3：宪法档口径裁定位清单（Owner A3）——不参与 ok 判定，裁定后逐项转正。 */
  a3_pending_items: constitutionalEntry.a3_pending_items ?? [],
  note:
    "timestamp 禁入：运行序以 seq/run_id 标识（seq 即 C7 校准轮代号，见 calibration-template.md）。schema /2 向后兼容 /1：新增 path_signature 与 a3_pending_items 字段，readPrevSeq/summary 消费面不变。",
};

fs.writeFileSync(resultsPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const e of entries) {
  const expected =
    Array.isArray(e.expected) ? `[${e.expected.join(",")}]` : e.expected;
  const profileWord =
    e.tier === "constitutional"
      ? `surface=${e.surface} profile=${e.profile}`
      : `profile=${e.profile} expected=${expected} rule=${e.matched_rule}`;
  console.log(
    `[${e.tier}] ${profileWord} durationMs=${e.durationMs} → ${e.ok ? "PASS" : "FAIL"}${e.error ? ` (${e.error})` : ""}`,
  );
}
const a3Count = report.a3_pending_items.length;
console.log(
  `${report.run_id} (seq=${seq}) → ${path.basename(resultsPath)} 已写入；结果 ${report.summary.passed}/${report.summary.total} passed；a3_pending=${a3Count}（不参与 ok，Owner A3 裁定位）`,
);

process.exit(harnessBroken ? 2 : report.ok ? 0 : 1);
