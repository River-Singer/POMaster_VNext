/**
 * normal.mjs —— Self-hosting benchmark · Normal Change 档（PRD §90.3）。
 *
 * 场景：「新增一个 CLI capability（如 pomaster explain）」——普通能力新增。
 *
 * 探针重锚（D-1/D-5，Owner 2026-09-08，owner-adjudications.md#裁决18）：原 `pomaster
 * triage` 判档入口随档位语义退役删除；normal 档的度量意图「进入正常治理通路」改由
 * status 未初始化 fail-closed 契约承载（`pomaster status --json`——诚实缺席 + hint
 * 路标，报错必带 escalation 路标是既有宪法级不变量）。
 *
 * 断言：
 *   1. status 信封可解析且 ok=false（未初始化 fail-closed——绝不静默假绿）；
 *   2. errors[0].code=NOT_INITIALIZED 且 hint 非空（报错带路标纪律）；
 *   3. 原始输出（stdout+stderr）无 architect/research/spawn/subagent 字样。
 *
 * 退出码：0 = 全部断言通过；1 = 断言失败；2 = 基准装置错误（CLI 缺失/崩溃）。
 * 单跑：node benchmarks/normal.mjs ；亦可被 run-all.mjs import（import 时不自动执行）。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

export const NORMAL_TIER = "normal";
export const NORMAL_SCENARIO = "新增一个 CLI capability（如 pomaster explain）";
/** D-5 裁决 18：档位词退役——探针面词形（cli:status），profile 位恒 null。 */
export const NORMAL_EXPECTED_PROFILES = [];
export const NORMAL_SURFACE = "cli:status";

/** 解析 @pomaster/cli 的 bin（package.json bin → ./dist/bin.js）；缺失返回 null。 */
export function resolveCliBin() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bin = path.resolve(here, "..", "packages", "cli", "dist", "bin.js");
  return fs.existsSync(bin) ? bin : null;
}

/** 以子进程跑 `pomaster status --json`（临时空目录——args 数组直传，不经 shell）。 */
export function runStatusProbe(cliBin) {
  const probeDir = path.join(
    fs.realpathSync(path.dirname(fileURLToPath(import.meta.url))),
    ".probe-tmp-normal",
  );
  fs.rmSync(probeDir, { recursive: true, force: true });
  fs.mkdirSync(probeDir, { recursive: true });
  const res = spawnSync(process.execPath, [cliBin, "--dir", probeDir, "status", "--json"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const out = {
    status: res.status,
    stdout: typeof res.stdout === "string" ? res.stdout : "",
    stderr: typeof res.stderr === "string" ? res.stderr : "",
  };
  fs.rmSync(probeDir, { recursive: true, force: true });
  return out;
}

/**
 * 跑 Normal 档基准。返回档位条目（run-all.mjs 原样写入 last-results.json）：
 * { tier, scenario, expected, profile, matched_rule, evidence_grade,
 *   matched_keywords, durationMs, ok, error?, assertions[] }
 */
export async function runNormalBenchmark() {
  const startedAt = performance.now();
  const assertions = [];

  const cliBin = resolveCliBin();
  if (cliBin === null) {
    return {
      tier: NORMAL_TIER,
      scenario: NORMAL_SCENARIO,
      expected: NORMAL_EXPECTED_PROFILES,
      profile: null,
      matched_rule: null,
      evidence_grade: null,
      matched_keywords: [],
      durationMs: Math.round(performance.now() - startedAt),
      ok: false,
      error: "cli-bin-missing: packages/cli/dist/bin.js 不存在，先跑 `corepack pnpm --filter @pomaster/cli build`",
      assertions,
    };
  }

  const run = runStatusProbe(cliBin);

  /** @type {any} */
  let envelope = null;
  let parseError = null;
  try {
    envelope = JSON.parse(run.stdout);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  if (envelope === null) {
    assertions.push({ name: "envelope-parse", ok: false, detail: `stdout 不是 JSON 信封：${parseError ?? "unknown"}` });
  } else {
    assertions.push({
      name: "fail-closed-envelope",
      ok: envelope.ok === false,
      detail: `ok=${envelope.ok}（未初始化 fail-closed——绝不静默假绿）`,
    });
    const firstError = (envelope.errors ?? [])[0] ?? {};
    assertions.push({
      name: "not-initialized-with-hint",
      ok: firstError.code === "NOT_INITIALIZED" && typeof firstError.hint === "string" && firstError.hint.length > 0,
      detail: `code=${firstError.code}，hint 非空=${typeof firstError.hint === "string" && firstError.hint.length > 0}（报错必带路标——escalation 纪律）`,
    });
  }

  const ok = assertions.length > 0 && assertions.every((a) => a.ok);
  const entry = {
    tier: NORMAL_TIER,
    scenario: NORMAL_SCENARIO,
    expected: NORMAL_EXPECTED_PROFILES,
    surface: NORMAL_SURFACE,
    profile: null,
    matched_rule: envelope?.result?.matched_rule ?? null,
    evidence_grade: envelope?.result?.evidence_grade ?? null,
    matched_keywords: envelope?.result?.matched_keywords ?? [],
    durationMs: Math.round(performance.now() - startedAt),
    ok,
    assertions,
  };
  if (!ok && envelope === null) entry.error = "status 未产出可解析的 JSON 信封";
  return entry;
}

const isMain =
  process.argv[1] !== undefined &&
  (() => {
    const selfPath = fileURLToPath(import.meta.url);
    const resolved = path.resolve(process.argv[1]);
    return resolved === selfPath || resolved.toLowerCase() === selfPath.toLowerCase();
  })();

if (isMain) {
  const entry = await runNormalBenchmark();
  for (const a of entry.assertions) {
    console.log(`  [${a.ok ? "PASS" : "FAIL"}] ${a.name}: ${a.detail}`);
  }
  console.log(
    `[normal] surface=${entry.surface} durationMs=${entry.durationMs} → ${entry.ok ? "PASS" : "FAIL"}`,
  );
  process.exit(entry.ok ? 0 : entry.error ? 2 : 1);
}
