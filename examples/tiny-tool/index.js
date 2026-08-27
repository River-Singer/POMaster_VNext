/**
 * index.js —— tiny-csv-tool 演示入口：解析→序列化→往返（roundtrip）自检。
 *
 * 运行：node index.js
 * 该往返探针即 .pomaster/evidence/runs/GRN-0001.json（subject=TEST.CSV.QUOTED_CELL）
 * 所记录的 CSV_ROUNDTRIP gate 的工具侧实现（Phase C 八拍演示靶子）。
 */
import { parseCsv } from "./src/parse.js";
import { serializeRows } from "./src/serialize.js";

const sample = [
  ["part", "price_note"],
  ["VSI-A", "单件VSI A价/整车VSI A价, 分档报价"],
  ['Type "S"', "line1\nline2"],
];

const serialized = serializeRows(sample);
const { rows, issues } = parseCsv(serialized);

const roundtripOk = JSON.stringify(rows) === JSON.stringify(sample);
console.log("[tiny-csv-tool] serialized:");
console.log(serialized);
console.log("[tiny-csv-tool] failure-pattern checks:", issues);
console.log(`[tiny-csv-tool] roundtrip ${roundtripOk ? "OK" : "MISMATCH"}`);
if (!roundtripOk) {
  process.exitCode = 1;
}
