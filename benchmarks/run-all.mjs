/**
 * run-all.mjs —— Self-hosting benchmark 三档合跑 + 结果落盘（PRD §90.3 / C7 / L6-3）。
 *
 * 行为：
 *   1. 依次跑 Tiny（期望 MINIMAL）、Normal（期望 LIGHT/STANDARD）、Constitutional
 *      （期望 STRICT + Meta-Governance；映射已裁定 catalog 锚即档，Owner 2026-09-01）
 *      三档；constitutional 档复用本轮已跑的 tiny/normal 条目做三档路径签名可区分性判卷
 *      （不重复执行子进程）；
 *   2. 把三档真实输出写入 benchmarks/last-results.json（含 durationMs / profile /
 *      断言明细 / 路径签名 / a3_ruling / constitutional_gate_readiness）；
 *   3. 运行序以整数 seq + run_id（bench-NNNN）标识——timestamp 禁入，
 *      seq 即 C7 校准轮代号（校准报告 calibration-template.md 以它为锚）。
 *
 * schema 演进（/2 → /3，向后兼容）：A3 三项裁定转正（Owner 决议 2026-09-01）——
 * entries[].a3_pending_items 与顶层 a3_pending_items 更名为 a3_ruling
 * （ruling="APPROVED_OWNER_2026_09_01"，三项裁定内容逐字 + promoted_to_assertions 转正
 * 映射；「PENDING_A3 不参与 ok」机制移除），constitutional 条目新增
 * constitutional_gate_readiness（裁定 1+2 执行面：5 条 gate 判卷就绪明细 + execution=not_run
 * 分母缺席显式披露）；既有消费面（readPrevSeq 只取 seq；m6 evidence pack 取
 * run_id/summary）字段不变。
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

const RESULTS_SCHEMA = "pomaster.vnext.selfhosting-benchmark-results/3";

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
  /** A3 裁定记录（Owner 2026-09-01，三项裁定转正为 ok 断言；原 a3_pending_items 机制移除）。 */
  a3_ruling: constitutionalEntry.a3_ruling ?? null,
  note:
    "timestamp 禁入：运行序以 seq/run_id 标识（seq 即 C7 校准轮代号，见 calibration-template.md）。schema /3 向后兼容 /2//1：/3 将 a3_pending_items 更名为 a3_ruling（A3 三项裁定转正，Owner 2026-09-01）并在 constitutional 条目新增 constitutional_gate_readiness；readPrevSeq/summary 消费面不变。",
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
const rulingId = report.a3_ruling?.ruling ?? "none";
console.log(
  `${report.run_id} (seq=${seq}) → ${path.basename(resultsPath)} 已写入；结果 ${report.summary.passed}/${report.summary.total} passed；a3_ruling=${rulingId}（A3 三项裁定已转正为 ok 断言，Owner 2026-09-01）`,
);

process.exit(harnessBroken ? 2 : report.ok ? 0 : 1);
