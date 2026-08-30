#!/usr/bin/env node
/**
 * 测试棘轮（ratchet）：统计 vitest 断言（it/test 用例）数量，低于 floor.json 的
 * minTests 即退出码 1。纪律：棘轮只升不降（见 tests/README.md）。
 *
 * 计数口径：1 assert = 1 个 vitest 用例（jest 兼容 JSON 的 numTotalTests，
 * 兜底 = testResults[].assertionResults 条目求和；子测试不计入）。
 * 本脚本不自动改写 floor——提升 floor 是人工/PR 动作，保持确定性与可审计。
 *
 * P15 分层账本：floor.json 含 ledger 段时，额外按层（L1-L5）与 L1 四域
 * （IR 不变量 / 状态机转移对 / Permit·Evidence 推导 / Router 判定矩阵）执行
 * fail-below-floor：任何一类实测计数低于其 floor 即退出码 1，输出分类明细；
 * 实测分解落 coverage/ratchet-ledger.json 供机器审计。mapping 是封闭分母：
 * 报告中未归类的 spec、mapping 指向报告外 spec 的条目、逐文件计数之和与总数
 * 分叉——三者均判失败。「类别齐全才是验收」（测试战略结构完整性原则）由此
 * 机器可证明。
 * 向后兼容：floor.json 无 ledger 段时行为与历史版本一致（仅总 floor 判定）。
 *
 * 实现注记：以 process.execPath 直连 vitest.mjs（shell:false + 参数数组），
 * 不经 cmd/PowerShell/corepack 解析——规避 Windows script-shell 差异、
 * PATH 截断与含空格路径的引号问题；CI（ubuntu）与本机行为一致。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const floorPath = join(scriptDir, "floor.json");
const outDir = join(repoRoot, "coverage");
const outPath = join(outDir, "vitest-report.json");
const ledgerOutPath = join(outDir, "ratchet-ledger.json");

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

// ---------------------------------------------------------------------------
// P15 分层账本（floor.json · ledger 段存在时启用；否则保持历史总 floor 行为）
// ---------------------------------------------------------------------------

function toPosix(p) {
  return p.split("\\").join("/");
}

const repoRootPosix = `${toPosix(repoRoot)}/`;
function relPosix(absolutePath) {
  const p = toPosix(absolutePath);
  return p.startsWith(repoRootPosix) ? p.slice(repoRootPosix.length) : p;
}

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

/** 校验 ledger 段结构；非法即 fail（结构性错误不等同于低于下限，须显式修复）。 */
function validateLedger(ledger) {
  if (ledger === null || typeof ledger !== "object") {
    fail("floor.json 的 ledger 段非法：需对象形态。");
  }
  if (ledger.layers === null || typeof ledger.layers !== "object" ||
      Object.keys(ledger.layers).length === 0) {
    fail("floor.json 的 ledger.layers 非法：需非空对象（L1-L5 → {floor}）。");
  }
  for (const [id, def] of Object.entries(ledger.layers)) {
    if (def === null || typeof def !== "object" || !isNonNegInt(def.floor)) {
      fail(`ledger.layers.${id} 非法：需非负整数 floor。`);
    }
  }
  if (ledger.domains === null || typeof ledger.domains !== "object") {
    fail("floor.json 的 ledger.domains 非法：需对象（可为空）。");
  }
  for (const [id, def] of Object.entries(ledger.domains)) {
    if (
      def === null ||
      typeof def !== "object" ||
      !isNonNegInt(def.floor) ||
      typeof def.layer !== "string" ||
      !(def.layer in ledger.layers)
    ) {
      fail(`ledger.domains.${id} 非法：需 {layer: <已定义层>, floor: <非负整数>}。`);
    }
  }
  if (ledger.mapping === null || typeof ledger.mapping !== "object" ||
      Object.keys(ledger.mapping).length === 0) {
    fail("floor.json 的 ledger.mapping 非法：需非空对象（spec 路径 → {layer, domain?}）。");
  }
  for (const [file, entry] of Object.entries(ledger.mapping)) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof entry.layer !== "string" ||
      !(entry.layer in ledger.layers)
    ) {
      fail(`ledger.mapping["${file}"] 非法：layer 缺失或未在 ledger.layers 定义。`);
    }
    if (entry.domain !== undefined) {
      if (typeof entry.domain !== "string" || !(entry.domain in ledger.domains)) {
        fail(`ledger.mapping["${file}"] 非法：domain 未在 ledger.domains 定义。`);
      }
      if (ledger.domains[entry.domain].layer !== entry.layer) {
        fail(
          `ledger.mapping["${file}"] 非法：domain ${entry.domain} 定义于层 ` +
            `${ledger.domains[entry.domain].layer}，与条目 layer=${entry.layer} 不一致。`,
        );
      }
    }
  }
}

/**
 * 从 vitest 报告提取逐文件用例数（键 = 仓库相对 posix 路径）。
 * 逐文件之和必须与总数闭合（口径分叉防护）。
 */
function perFileCounts(report) {
  const counts = new Map();
  if (!Array.isArray(report.testResults)) return counts;
  for (const tr of report.testResults) {
    const n = Array.isArray(tr.assertionResults) ? tr.assertionResults.length : 0;
    counts.set(relPosix(tr.name), n);
  }
  return counts;
}

function runLedger(ledger) {
  validateLedger(ledger);

  const fileCounts = perFileCounts(report);
  const reportFiles = new Set(fileCounts.keys());
  const mappingFiles = new Set(Object.keys(ledger.mapping).map(toPosix));

  const unmapped = [...reportFiles].filter((f) => !mappingFiles.has(f)).sort();
  const stale = [...mappingFiles].filter((f) => !reportFiles.has(f)).sort();
  const listed = (arr) =>
    arr.slice(0, 8).map((f) => `  - ${f}`).join("\n") +
    (arr.length > 8 ? `\n  - …等共 ${arr.length} 个` : "");

  // 封闭分母三查：未归类 / stale / 口径分叉。
  if (unmapped.length > 0) {
    fail(
      "分层账本存在未归类 spec（新增 spec 必须同步入 ledger.mapping）：\n" +
        listed(unmapped),
    );
  }
  if (stale.length > 0) {
    fail(
      "分层账本存在指向报告外 spec 的 stale 条目（spec 已删除/改名须同步清理 mapping）：\n" +
        listed(stale),
    );
  }
  const fileSum = [...fileCounts.values()].reduce((s, n) => s + n, 0);
  if (fileSum !== total) {
    fail(
      `分层账本口径分叉：逐文件计数之和 ${fileSum} ≠ 总数 ${total}` +
        `（报告形态异常，拒绝判卷）。\n${listed([...reportFiles])}`,
    );
  }

  // 分类实测。
  const layerActual = {};
  const domainActual = {};
  const files = {};
  for (const [file, n] of fileCounts) {
    const entry = ledger.mapping[file];
    layerActual[entry.layer] = (layerActual[entry.layer] ?? 0) + n;
    if (entry.domain !== undefined) {
      domainActual[entry.domain] = (domainActual[entry.domain] ?? 0) + n;
    }
    files[file] = { layer: entry.layer, domain: entry.domain ?? null, tests: n };
  }

  const rows = [];
  for (const [id, def] of Object.entries(ledger.layers)) {
    const actual = layerActual[id] ?? 0;
    rows.push({
      kind: "layer",
      id,
      title: def.title ?? id,
      floor: def.floor,
      actual,
      gap: Math.max(0, def.floor - actual),
      ok: actual >= def.floor,
    });
  }
  for (const [id, def] of Object.entries(ledger.domains)) {
    const actual = domainActual[id] ?? 0;
    rows.push({
      kind: "domain",
      id,
      title: def.title ?? id,
      layer: def.layer,
      floor: def.floor,
      actual,
      gap: Math.max(0, def.floor - actual),
      ok: actual >= def.floor,
    });
  }

  const fmt = (r) =>
    r.kind === "domain"
      ? `${r.layer}·${r.id}（${r.title}）`
      : `${r.id}（${r.title}）`;
  const gaps = rows.filter((r) => !r.ok);

  console.log("[ratchet] 分层账本明细（L1-L5 五层 + L1 四域，fail-below-floor）：");
  for (const r of gaps) {
    console.log(
      `  [GAP] ${fmt(r)}: actual ${r.actual} < floor ${r.floor}（缺 ${r.gap}）`,
    );
  }
  for (const r of rows.filter((r) => r.ok)) {
    console.log(`  [OK ] ${fmt(r)}: actual ${r.actual} >= floor ${r.floor}`);
  }

  // 实测分解落盘（机器审计位；floor.json 是策略，本文件是测量）。
  try {
    writeFileSync(
      ledgerOutPath,
      JSON.stringify(
        {
          totalTests: total,
          minTests: floor,
          belowFloorClasses: gaps.map((r) => ({
            class: r.kind === "domain" ? `${r.layer}·${r.id}` : r.id,
            title: r.title,
            floor: r.floor,
            actual: r.actual,
            gap: r.gap,
          })),
          layers: Object.fromEntries(
            rows
              .filter((r) => r.kind === "layer")
              .map((r) => [
                r.id,
                { title: r.title, floor: r.floor, actual: r.actual, ok: r.ok },
              ]),
          ),
          domains: Object.fromEntries(
            rows
              .filter((r) => r.kind === "domain")
              .map((r) => [
                r.id,
                {
                  title: r.title,
                  layer: r.layer,
                  floor: r.floor,
                  actual: r.actual,
                  ok: r.ok,
                },
              ]),
          ),
          files,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  } catch (error) {
    fail(`coverage/ratchet-ledger.json 写入失败: ${String(error)}`);
  }

  if (gaps.length > 0) {
    fail(
      "分层账本存在低于下限的类别（fail-below-floor，tests/ratchet/floor.json · ledger）：\n" +
        gaps
          .map(
            (r) =>
              `  - ${fmt(r)}: actual ${r.actual} < floor ${r.floor}，缺 ${r.gap}`,
          )
          .join("\n") +
        "\n棘轮按类只升不降：低于下限的类别须以真实测试补齐（每条测试对应代码中真实存在的不变量/转移/推导/判定，禁止凑数）；禁止删测试或调低 floor。",
    );
  }
  return rows;
}

if (floorRaw.ledger !== undefined) {
  runLedger(floorRaw.ledger);
  console.log("[ratchet] 分层账本：全部类别 >= floor（L1-L5 + L1 四域）");
}

if (total > floor) {
  console.log(
    `[ratchet] 提示：当前 ${total} > floor ${floor}。棘轮只升不降——请随本次改动一并提升 floor.json 的 minTests。`,
  );
}
console.log(`[ratchet] ok: ${total} >= floor ${floor}`);
