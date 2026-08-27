#!/usr/bin/env node
/**
 * 测试棘轮（ratchet）：统计 vitest 断言（it/test 用例）数量，低于 floor.json 的
 * minTests 即退出码 1。纪律：棘轮只升不降（见 tests/README.md）。
 *
 * 计数口径：1 assert = 1 个 vitest 用例（jest 兼容 JSON 的 numTotalTests，
 * 兜底 = testResults[].assertionResults 条目求和；子测试不计入）。
 * 本脚本不自动改写 floor——提升 floor 是人工/PR 动作，保持确定性与可审计。
 *
 * 实现注记：以 process.execPath 直连 vitest.mjs（shell:false + 参数数组），
 * 不经 cmd/PowerShell/corepack 解析——规避 Windows script-shell 差异、
 * PATH 截断与含空格路径的引号问题；CI（ubuntu）与本机行为一致。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const floorPath = join(scriptDir, "floor.json");
const outDir = join(repoRoot, "coverage");
const outPath = join(outDir, "vitest-report.json");

function fail(message) {
  console.error(`[ratchet] FAIL: ${message}`);
  process.exit(1);
}

let floorRaw;
try {
  floorRaw = JSON.parse(readFileSync(floorPath, "utf8"));
} catch (error) {
  fail(`floor.json 不可解析: ${String(error)}`);
}
if (
  floorRaw === null ||
  typeof floorRaw !== "object" ||
  !Number.isInteger(floorRaw.minTests) ||
  floorRaw.minTests < 0
) {
  fail(
    `floor.json 非法，需 {"minTests": <非负整数>}，实际: ${JSON.stringify(floorRaw)}`,
  );
}
const floor = floorRaw.minTests;

let vitestEntry;
try {
  const require = createRequire(join(repoRoot, "package.json"));
  vitestEntry = require.resolve("vitest/vitest.mjs");
} catch {
  vitestEntry = join(repoRoot, "node_modules", "vitest", "vitest.mjs");
}
if (!existsSync(vitestEntry)) {
  fail(`找不到 vitest 入口（${vitestEntry}）——请先 corepack pnpm install`);
}

mkdirSync(outDir, { recursive: true });

// --passWithNoTests：零测试时 vitest 正常产出空报告，由本脚本对照 floor 判定。
const res = spawnSync(
  process.execPath,
  [
    vitestEntry,
    "run",
    "--reporter=json",
    `--outputFile=${outPath}`,
    "--passWithNoTests",
  ],
  { cwd: repoRoot, encoding: "utf8" },
);

if (res.error) {
  fail(`无法启动 vitest: ${res.error.message}`);
}

let report = null;
if (existsSync(outPath)) {
  try {
    report = JSON.parse(readFileSync(outPath, "utf8"));
  } catch {
    report = null;
  }
}
if (report === null && typeof res.stdout === "string") {
  // 兜底：json reporter 的单行 JSON 在 stdout 末段（前面可能有测试自身的 console 输出）。
  const marker = res.stdout.lastIndexOf("\n{");
  const candidate = marker >= 0 ? res.stdout.slice(marker + 1) : res.stdout;
  try {
    report = JSON.parse(candidate.trim());
  } catch {
    report = null;
  }
}
if (report === null) {
  // --passWithNoTests + 零测试文件时 vitest 提前退出且不写报告：显式归一为计数 0
  //（诚实呈现，交由 floor 判定），而非误报"报告缺失"。
  if (
    res.status === 0 &&
    typeof res.stdout === "string" &&
    /No test files found/i.test(res.stdout)
  ) {
    report = { numTotalTests: 0 };
  } else {
    const tail = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.slice(-2000);
    fail(
      `vitest 报告缺失/不可解析。vitest 退出码=${res.status}\n--- 输出尾部 ---\n${tail}`,
    );
  }
}

let total;
if (typeof report.numTotalTests === "number") {
  total = report.numTotalTests;
} else if (Array.isArray(report.testResults)) {
  total = report.testResults.reduce(
    (sum, tr) =>
      sum + (Array.isArray(tr.assertionResults) ? tr.assertionResults.length : 0),
    0,
  );
} else {
  total = Number.NaN;
}
if (!Number.isInteger(total) || total < 0) {
  fail("报告不含可辨识的测试计数（numTotalTests / assertionResults）。");
}

if (total < floor) {
  fail(
    `测试总数 ${total} 低于棘轮下限 ${floor}（tests/ratchet/floor.json）。` +
      `棘轮只升不降：请新增/恢复用例，禁止删测试或调低 floor。`,
  );
}

if (total > floor) {
  console.log(
    `[ratchet] 提示：当前 ${total} > floor ${floor}。棘轮只升不降——请随本次改动一并提升 floor.json 的 minTests。`,
  );
}
console.log(`[ratchet] ok: ${total} >= floor ${floor}`);
