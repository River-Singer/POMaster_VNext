/**
 * normal.mjs —— Self-hosting benchmark · Normal Change 档（PRD §90.3）。
 *
 * 场景：「新增一个 CLI capability（如 pomaster explain）」——普通能力新增，
 * 期望 Profile ∈ [LIGHT, STANDARD]（§90.3 期望档；P0 关键词引擎下落到
 * DEFAULT_NO_SIGNAL → LIGHT 属正常，STANDARD 只在命中升档关键词时出现）。
 *
 * 断言：
 *   1. triage 信封 ok = true；
 *   2. result.profile ∈ [LIGHT, STANDARD]（既不许塌到 MINIMAL，也不允许越出矩阵）。
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
export const NORMAL_EXPECTED_PROFILES = ["LIGHT", "STANDARD"];

/** 解析 @pomaster/cli 的 bin（package.json bin → ./dist/bin.js）；缺失返回 null。 */
export function resolveCliBin() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bin = path.resolve(here, "..", "packages", "cli", "dist", "bin.js");
  return fs.existsSync(bin) ? bin : null;
}

/** 以子进程跑 `pomaster triage <request> --json`（args 数组直传，不经 shell）。 */
export function runTriage(cliBin, request) {
  const res = spawnSync(process.execPath, [cliBin, "triage", request, "--json"], {
    encoding: "utf8",
    windowsHide: true,
  });
  return {
    status: res.status,
    stdout: typeof res.stdout === "string" ? res.stdout : "",
    stderr: typeof res.stderr === "string" ? res.stderr : "",
  };
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

  const run = runTriage(cliBin, NORMAL_SCENARIO);

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
    assertions.push({ name: "envelope-ok", ok: envelope.ok === true, detail: `ok=${envelope.ok}` });
    const profile = envelope.result?.profile ?? null;
    assertions.push({
      name: "profile-in-light-standard",
      ok: NORMAL_EXPECTED_PROFILES.includes(profile),
      detail: `profile=${profile} (rule ${envelope.result?.matched_rule})，期望 ∈ [${NORMAL_EXPECTED_PROFILES.join(", ")}]`,
    });
  }

  const ok = assertions.length > 0 && assertions.every((a) => a.ok);
  const entry = {
    tier: NORMAL_TIER,
    scenario: NORMAL_SCENARIO,
    expected: NORMAL_EXPECTED_PROFILES,
    profile: envelope?.result?.profile ?? null,
    matched_rule: envelope?.result?.matched_rule ?? null,
    evidence_grade: envelope?.result?.evidence_grade ?? null,
    matched_keywords: envelope?.result?.matched_keywords ?? [],
    durationMs: Math.round(performance.now() - startedAt),
    ok,
    assertions,
  };
  if (!ok && envelope === null) entry.error = "triage 未产出可解析的 JSON 信封";
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
    `[normal] profile=${entry.profile} expected∈[${entry.expected.join(",")}] rule=${entry.matched_rule} durationMs=${entry.durationMs} → ${entry.ok ? "PASS" : "FAIL"}`,
  );
  process.exit(entry.ok ? 0 : entry.error ? 2 : 1);
}
