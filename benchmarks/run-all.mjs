/**
 * run-all.mjs —— Self-hosting benchmark 两档合跑 + 结果落盘（PRD §90.3 / C7）。
 *
 * 行为：
 *   1. 依次跑 Tiny（期望 MINIMAL）与 Normal（期望 LIGHT/STANDARD）两档；
 *   2. 把两档真实输出写入 benchmarks/last-results.json（含 durationMs / profile /
 *      断言明细）；
 *   3. 运行序以整数 seq + run_id（bench-NNNN）标识——timestamp 禁入，
 *      seq 即 C7 校准轮代号（校准报告 calibration-template.md 以它为锚）。
 *
 * 退出码：0 = 两档断言全过；1 = 存在断言失败；2 = 基准装置错误（CLI 缺失/崩溃）。
 * 运行：node benchmarks/run-all.mjs
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { runTinyBenchmark } from "./tiny.mjs";
import { runNormalBenchmark } from "./normal.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = path.resolve(here, "last-results.json");

const RESULTS_SCHEMA = "pomaster.vnext.selfhosting-benchmark-results/1";

function readPrevSeq() {
  try {
    const prev = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    return Number.isInteger(prev?.seq) ? prev.seq : 0;
  } catch {
    return 0;
  }
}

const entries = [await runTinyBenchmark(), await runNormalBenchmark()];

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
  note: "timestamp 禁入：运行序以 seq/run_id 标识（seq 即 C7 校准轮代号，见 calibration-template.md）。",
};

fs.writeFileSync(resultsPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const e of entries) {
  const expected =
    Array.isArray(e.expected) ? `[${e.expected.join(",")}]` : e.expected;
  console.log(
    `[${e.tier}] profile=${e.profile} expected=${expected} rule=${e.matched_rule} durationMs=${e.durationMs} → ${e.ok ? "PASS" : "FAIL"}${e.error ? ` (${e.error})` : ""}`,
  );
}
console.log(
  `${report.run_id} (seq=${seq}) → ${path.basename(resultsPath)} 已写入；结果 ${report.summary.passed}/${report.summary.total} passed`,
);

process.exit(harnessBroken ? 2 : report.ok ? 0 : 1);
