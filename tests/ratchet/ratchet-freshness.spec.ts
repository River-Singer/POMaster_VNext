import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * 棘轮测量新鲜度契约（审计 09-05 · F6；被测对象 tests/ratchet/ratchet.mjs）。
 *
 * 缺陷：旧版 ratchet 读固定路径 coverage/vitest-report.json——子进程失败且不产
 * 新报告时，上一次运行的陈旧报告仍被消费（exit 0 + 旧统计，报告 mtime 未变）。
 * 修复：报告走每次运行唯一的临时路径（vitest-report.<uuid>.json，读毕即清），
 * 旧报告结构性不可达；子进程失败/报告缺席/空文件/不可解析 JSON 一律显式失败
 * （非 0 退出）。
 *
 * 验收边界（审计原文，本 spec 不越界）：新报告含失败用例但计数达标不是缺陷——
 * 正确性归 CI 独立执行的 pnpm test，ratchet 只判数量；ratchet 无内部超时另属
 * 静态健壮性风险，本 spec 不钉。
 *
 * 手法：黑盒子进程。把当前 ratchet.mjs 原样复制进临时 fixture 仓库（每次测试取
 * 磁盘上的最新版本，零镜像漂移），node_modules/vitest/vitest.mjs 以可控桩替换
 * （ratchet 的 require.resolve 直连命中桩，不经 shell），按场景模拟 vitest 的
 * 退出码/报告产出行为。fixture floor 取 minTests=0：若报告缺席被误记为计数 0，
 * 0 >= 0 本应绿——非 0 退出即证明走的是显式失败而非 0 计数，两态可判别。
 */

type StubMode =
  | "exit23" // 模拟审计复现：子进程退出 23，不产任何报告
  | "silent0" // 退出 0 但零输出零报告（缺席态；无 no-tests 标记，不得归一为 0）
  | "good" // 正常路径：报告落 outputFile，计数 500
  | "empty" // 报告写空文件（0 字节）
  | "badjson" // 报告写截断/非法 JSON
  | "stdout-only" // 报告只落 stdout（兜底解析路径，历史行为保持）
  | "notests"; // "No test files found" + exit 0（零测试归一路径，历史行为保持）

/** vitest 桩：行为由 RATCHET_FIXTURE_STUB 决定；writeSync 直写 fd 1 保证 exit 前落管道。 */
const VITEST_STUB = `
import { writeFileSync, writeSync } from "node:fs";
const mode = process.env.RATCHET_FIXTURE_STUB ?? "exit23";
const outArg = process.argv.find((a) => a.startsWith("--outputFile="));
const outPath = outArg ? outArg.slice("--outputFile=".length) : "";
const good = JSON.stringify({ numTotalTests: 500 });
const say = (text) => writeSync(1, text);
if (mode === "exit23") process.exit(23);
if (mode === "silent0") process.exit(0);
if (mode === "good") { writeFileSync(outPath, good, "utf8"); process.exit(0); }
if (mode === "empty") { writeFileSync(outPath, "", "utf8"); process.exit(0); }
if (mode === "badjson") { writeFileSync(outPath, "{numTotalTests:", "utf8"); process.exit(0); }
if (mode === "stdout-only") { say("stub noise before json\\n" + good + "\\n"); process.exit(0); }
if (mode === "notests") { say("No test files found, exiting with code 0\\n"); process.exit(0); }
process.exit(99);
`;

const specDir = dirname(fileURLToPath(import.meta.url));
const realRatchetSource = readFileSync(join(specDir, "ratchet.mjs"), "utf8");
const SPAWN_TIMEOUT_MS = 30_000;
const fixtureRoots: string[] = [];

function makeFixture(options: {
  stubMode: StubMode;
  staleCanonicalReport?: boolean;
}): string {
  const root = mkdtempSync(join(tmpdir(), "ratchet-freshness-"));
  fixtureRoots.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "ratchet-freshness-fixture", private: true }),
    "utf8",
  );
  mkdirSync(join(root, "tests", "ratchet"), { recursive: true });
  writeFileSync(
    join(root, "tests", "ratchet", "ratchet.mjs"),
    realRatchetSource,
    "utf8",
  );
  writeFileSync(
    join(root, "tests", "ratchet", "floor.json"),
    JSON.stringify({ minTests: 0 }),
    "utf8",
  );
  mkdirSync(join(root, "node_modules", "vitest"), { recursive: true });
  writeFileSync(
    join(root, "node_modules", "vitest", "vitest.mjs"),
    VITEST_STUB,
    "utf8",
  );
  if (options.staleCanonicalReport) {
    // 审计复现场的陈旧报告：旧版固定路径上残留的上一次运行统计（新版永不读它）。
    mkdirSync(join(root, "coverage"), { recursive: true });
    writeFileSync(
      join(root, "coverage", "vitest-report.json"),
      JSON.stringify({ numTotalTests: 99999 }),
      "utf8",
    );
  }
  return root;
}

function runRatchet(root: string, stubMode: StubMode) {
  return spawnSync(
    process.execPath,
    [join(root, "tests", "ratchet", "ratchet.mjs")],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, RATCHET_FIXTURE_STUB: stubMode },
    },
  );
}

function outputOf(res: ReturnType<typeof runRatchet>): string {
  return `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
}

afterAll(() => {
  for (const root of fixtureRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("棘轮测量新鲜度（审计 F6：只消费本次运行产出的报告）", () => {
  it(
    "审计复现回归：子进程退出 23 且不产报告 → ratchet 非 0 退出且报错可读，陈旧报告不被消费",
    { timeout: SPAWN_TIMEOUT_MS },
    () => {
      const root = makeFixture({ stubMode: "exit23", staleCanonicalReport: true });
      const res = runRatchet(root, "exit23");
      expect(res.status, outputOf(res)).not.toBe(0);
      const out = outputOf(res);
      expect(out).toContain("报告缺失");
      expect(out).toContain("绝不沿用旧报告");
      expect(out).toContain("退出码=23");
      expect(out).not.toContain("[ratchet] ok");
      // 旧版固定路径上的陈旧报告原样保留（未被采纳，也不是 ratchet 的清理对象）；
      // coverage 内无本次运行的临时报告残留。
      expect(existsSync(join(root, "coverage", "vitest-report.json"))).toBe(true);
      expect(readdirSync(join(root, "coverage"))).toEqual(["vitest-report.json"]);
    },
  );

  it(
    "对照：子进程正常产出可读报告 → 行为与此前一致（exit 0 + 正确计数 + 临时报告读毕即清）",
    { timeout: SPAWN_TIMEOUT_MS },
    () => {
      const root = makeFixture({ stubMode: "good" });
      const res = runRatchet(root, "good");
      expect(res.status, outputOf(res)).toBe(0);
      const out = outputOf(res);
      expect(out).toContain("[ratchet] ok: 500 >= floor 0");
      expect(out).not.toContain("[ratchet] FAIL");
      // 本次产出读毕即清：下一次运行没有任何旧文件可复用（新鲜度的结构保证）。
      expect(existsSync(join(root, "coverage"))).toBe(true);
      expect(readdirSync(join(root, "coverage"))).toEqual([]);
    },
  );

  it(
    "报告缺席（子进程 exit 0 且零输出、无 no-tests 标记）→ 显式失败而非按 0 计数",
    { timeout: SPAWN_TIMEOUT_MS },
    () => {
      const root = makeFixture({ stubMode: "silent0" });
      const res = runRatchet(root, "silent0");
      expect(res.status, outputOf(res)).not.toBe(0);
      const out = outputOf(res);
      expect(out).toContain("报告缺失");
      expect(out).not.toContain("[ratchet] ok");
    },
  );

  it(
    "报告为空文件（0 字节）→ 显式失败（三态之一：空）",
    { timeout: SPAWN_TIMEOUT_MS },
    () => {
      const root = makeFixture({ stubMode: "empty" });
      const res = runRatchet(root, "empty");
      expect(res.status, outputOf(res)).not.toBe(0);
      expect(outputOf(res)).toContain("报告缺失");
    },
  );

  it(
    "报告不可解析（截断 JSON）→ 显式失败（三态之一：不可解析）",
    { timeout: SPAWN_TIMEOUT_MS },
    () => {
      const root = makeFixture({ stubMode: "badjson" });
      const res = runRatchet(root, "badjson");
      expect(res.status, outputOf(res)).not.toBe(0);
      expect(outputOf(res)).toContain("报告缺失");
    },
  );

  it(
    "stdout 兜底保留：报告仅落 stdout（文件缺席）时仍可读数，行为与此前一致",
    { timeout: SPAWN_TIMEOUT_MS },
    () => {
      const root = makeFixture({ stubMode: "stdout-only" });
      const res = runRatchet(root, "stdout-only");
      expect(res.status, outputOf(res)).toBe(0);
      expect(outputOf(res)).toContain("[ratchet] ok: 500 >= floor 0");
    },
  );

  it(
    "零测试归一保留：No test files found + exit 0 → 诚实计 0（非误报报告缺失）",
    { timeout: SPAWN_TIMEOUT_MS },
    () => {
      const root = makeFixture({ stubMode: "notests" });
      const res = runRatchet(root, "notests");
      expect(res.status, outputOf(res)).toBe(0);
      expect(outputOf(res)).toContain("[ratchet] ok: 0 >= floor 0");
    },
  );
});
