/**
 * tiny.mjs —— Self-hosting benchmark · Tiny Change 档（PRD §90.3）。
 *
 * 场景：「README badge 文案调整」——纯文案变更，期望 Profile = MINIMAL
 * （F_COPY_STYLE_ONLY 短路快道：命中文案/样式关键词且无升档触发）。
 *
 * 断言：
 *   1. triage 信封 ok = true；
 *   2. result.profile === "MINIMAL"；
 *   3. 原始输出（stdout+stderr）无 architect/research/spawn/subagent 字样
 *      （MINIMAL 档语义 = 几乎感觉不到治理，不得出现任何重角色 spawn 迹象）。
 *
 * 退出码：0 = 全部断言通过；1 = 断言失败；2 = 基准装置错误（CLI 缺失/崩溃）。
 * 单跑：node benchmarks/tiny.mjs ；亦可被 run-all.mjs import（import 时不自动执行）。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

export const TINY_TIER = "tiny";
export const TINY_SCENARIO = "README badge 文案调整";
export const TINY_EXPECTED_PROFILE = "MINIMAL";

/** MINIMAL 档输出中禁入的字样（命中即断言失败）。 */
const FORBIDDEN_SPAWN_PATTERN = /(architect|research|spawn|subagent)/i;

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
 * 跑 Tiny 档基准。返回档位条目（run-all.mjs 原样写入 last-results.json）：
 * { tier, scenario, expected, profile, matched_rule, evidence_grade,
 *   matched_keywords, durationMs, ok, error?, assertions[] }
 */
export async function runTinyBenchmark() {
  const startedAt = performance.now();
  const assertions = [];
  const fail = (name, detail) => assertions.push({ name, ok: false, detail });

  const cliBin = resolveCliBin();
  if (cliBin === null) {
    return {
      tier: TINY_TIER,
      scenario: TINY_SCENARIO,
      expected: TINY_EXPECTED_PROFILE,
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

  const run = runTriage(cliBin, TINY_SCENARIO);

  /** @type {any} */
  let envelope = null;
  let parseError = null;
  try {
    envelope = JSON.parse(run.stdout);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  if (envelope === null) {
    fail("envelope-parse", `stdout 不是 JSON 信封：${parseError ?? "unknown"}`);
  } else {
    assertions.push({ name: "envelope-ok", ok: envelope.ok === true, detail: `ok=${envelope.ok}` });
    assertions.push({
      name: "profile-minimal",
      ok: envelope.result?.profile === TINY_EXPECTED_PROFILE,
      detail: `profile=${envelope.result?.profile} (rule ${envelope.result?.matched_rule})`,
    });
    const raw = `${run.stdout}\n${run.stderr}`;
    const hit = raw.match(FORBIDDEN_SPAWN_PATTERN);
    assertions.push({
      name: "no-architect-research-spawn-words",
      ok: hit === null,
      detail: hit === null ? "raw 输出无禁入字样" : `命中禁入字样: ${hit[0]}`,
    });
  }

  const ok = assertions.length > 0 && assertions.every((a) => a.ok);
  const entry = {
    tier: TINY_TIER,
    scenario: TINY_SCENARIO,
    expected: TINY_EXPECTED_PROFILE,
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
  const entry = await runTinyBenchmark();
  for (const a of entry.assertions) {
    console.log(`  [${a.ok ? "PASS" : "FAIL"}] ${a.name}: ${a.detail}`);
  }
  console.log(
    `[tiny] profile=${entry.profile} expected=${entry.expected} rule=${entry.matched_rule} durationMs=${entry.durationMs} → ${entry.ok ? "PASS" : "FAIL"}`,
  );
  process.exit(entry.ok ? 0 : entry.error ? 2 : 1);
}
