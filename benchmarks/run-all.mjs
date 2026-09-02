/**
 * run-all.mjs —— Self-hosting benchmark 四档合跑 + 结果落盘（PRD §90.3 / C7 / L6-3；
 * 第四档 Applicability = PRD v0.5.2 §15 Benchmark A，W1-A2，Owner 裁决 8 ② 2026-09-01）。
 *
 * 行为：
 *   1. 依次跑 Tiny（期望 MINIMAL）、Normal（期望 LIGHT/STANDARD）、Constitutional
 *      （期望 STRICT + Meta-Governance；映射已裁定 catalog 锚即档，Owner 2026-09-01）、
 *      Applicability（README 文案调整 → MINIMAL + catalogEntries 确定性排除
 *      policy.api 族 / policy.sec 族 + context explain 逐条 why——PRD v0.5.2 §15 Benchmark A）
 *      四档；constitutional 档复用本轮已跑的 tiny/normal 条目做三档路径签名可区分性
 *      判卷，applicability 档复用本轮 tiny/normal/constitutional 条目做四档签名判卷
 *      （均不重复执行子进程）；
 *   2. 把四档真实输出写入 benchmarks/last-results.json（含 durationMs / profile /
 *      断言明细 / 路径签名 / a3_ruling / constitutional_gate_readiness /
 *      applicability 判卷面明细）；
 *   3. 运行序以整数 seq + run_id（bench-NNNN）标识——timestamp 禁入，
 *      seq 即 C7 校准轮代号（校准报告 calibration-template.md 以它为锚）。
 *
 * schema 演进（/2 → /3 → /4，向后兼容）：/3 = A3 三项裁定转正（Owner 决议 2026-09-01）
 * ——entries[].a3_pending_items 与顶层 a3_pending_items 更名为 a3_ruling
 * （ruling="APPROVED_OWNER_2026_09_01"，三项裁定内容逐字 + promoted_to_assertions 转正
 * 映射；「PENDING_A3 不参与 ok」机制移除），constitutional 条目新增
 * constitutional_gate_readiness（裁定 1+2 执行面：5 条 gate 判卷就绪明细 + execution=not_run
 * 分母缺席显式披露）；/4（W1-A2 P0.5-1 T4，PRD v0.5.2 §15 Benchmark A）新增第四档
 * applicability 条目（entries[] 多一条 tier="applicability"，含 applicability 判卷面
 * 明细 + 四档路径签名；诚实边界注记：真实 catalog 无 DB 域条目，DB 排除真判卷由
 * catalog-applicability-case-b.spec fixture 承载——O9）；既有消费面（readPrevSeq 只取
 * seq；m6 evidence pack 取 run_id/summary）字段不变。
 *
 * 退出码：0 = 四档断言全过；1 = 存在断言失败；2 = 基准装置错误（dist 缺失/崩溃）。
 * 运行：node benchmarks/run-all.mjs
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { runTinyBenchmark } from "./tiny.mjs";
import { runNormalBenchmark } from "./normal.mjs";
import { runConstitutionalBenchmark } from "./constitutional.mjs";
import { runApplicabilityBenchmark } from "./applicability.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = path.resolve(here, "last-results.json");

const RESULTS_SCHEMA = "pomaster.vnext.selfhosting-benchmark-results/4";

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
const applicabilityEntry = await runApplicabilityBenchmark({
  tinyEntry,
  normalEntry,
  constitutionalEntry,
});
const entries = [tinyEntry, normalEntry, constitutionalEntry, applicabilityEntry];

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
    "timestamp 禁入：运行序以 seq/run_id 标识（seq 即 C7 校准轮代号，见 calibration-template.md）。schema /4 向后兼容 /3//2//1：/2 新增 path_signature；/3 将 a3_pending_items 更名为 a3_ruling（A3 三项裁定转正，Owner 2026-09-01）并在 constitutional 条目新增 constitutional_gate_readiness；/4 新增第四档 applicability 条目（PRD v0.5.2 §15 Benchmark A，W1-A2——entries[] 多一条 tier=\"applicability\"，readPrevSeq/summary 消费面不变）。",
};

fs.writeFileSync(resultsPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const e of entries) {
  const expected =
    Array.isArray(e.expected) ? `[${e.expected.join(",")}]` : e.expected;
  const profileWord =
    e.tier === "constitutional" || e.tier === "applicability"
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
