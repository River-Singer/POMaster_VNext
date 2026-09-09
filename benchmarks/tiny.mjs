/**
 * tiny.mjs —— Self-hosting benchmark · Tiny Change 档（PRD §90.3）。
 *
 * 场景：「README badge 文案调整」——纯文案变更。
 *
 * 探针重锚（D-1/D-5，Owner 2026-09-08，owner-adjudications.md#裁决18）：原 `pomaster
 * triage` 判档入口随档位语义退役删除；tiny 档的度量意图「最小治理成本」改由 alerts
 * 未初始化/极简输出契约承载（`pomaster alerts --json`——hook 每轮面，恒 exit 0，
 * 未初始化=零输出静默）。
 *
 * 断言：
 *   1. alerts 信封 ok = true（恒 exit 0 hook 契约）；
 *   2. initialized=false（临时空目录）且 workflow_routing 缺席——零输出极简语义；
 *   3. 原始输出（stdout+stderr）无 architect/research/spawn/subagent 字样
 *      （几乎感觉不到治理，不得出现任何重角色 spawn 迹象）。
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
/** D-5 裁决 18：档位词退役——探针面词形（cli:alerts），profile 位恒 null。 */
export const TINY_EXPECTED_PROFILE = null;
export const TINY_SURFACE = "cli:alerts";

/** MINIMAL 档输出中禁入的字样（命中即断言失败）。 */
const FORBIDDEN_SPAWN_PATTERN = /(architect|research|spawn|subagent)/i;

/** 解析 @pomaster/cli 的 bin（package.json bin → ./dist/bin.js）；缺失返回 null。 */
export function resolveCliBin() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bin = path.resolve(here, "..", "packages", "cli", "dist", "bin.js");
  return fs.existsSync(bin) ? bin : null;
}

/** 以子进程跑 `pomaster alerts --json`（临时空目录——args 数组直传，不经 shell）。 */
export function runAlertsProbe(cliBin) {
  const probeDir = path.join(
    fs.realpathSync(path.dirname(fileURLToPath(import.meta.url))),
    ".probe-tmp-tiny",
  );
  fs.rmSync(probeDir, { recursive: true, force: true });
  fs.mkdirSync(probeDir, { recursive: true });
  const res = spawnSync(process.execPath, [cliBin, "--dir", probeDir, "alerts", "--json"], {
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

  const run = runAlertsProbe(cliBin);

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
      name: "uninitialized-zero-routing",
      ok:
        envelope.result?.initialized === false &&
        Array.isArray(envelope.result?.workflow_routing) &&
        envelope.result.workflow_routing.length === 0,
      detail: `initialized=${envelope.result?.initialized}，workflow_routing=[]（零输出极简——几乎感觉不到治理的度量点）`,
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
    surface: TINY_SURFACE,
    profile: null,
    matched_rule: envelope?.result?.matched_rule ?? null,
    evidence_grade: envelope?.result?.evidence_grade ?? null,
    matched_keywords: envelope?.result?.matched_keywords ?? [],
    durationMs: Math.round(performance.now() - startedAt),
    ok,
    assertions,
  };
  if (!ok && envelope === null) entry.error = "alerts 未产出可解析的 JSON 信封";
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
    `[tiny] surface=${entry.surface} durationMs=${entry.durationMs} → ${entry.ok ? "PASS" : "FAIL"}`,
  );
  process.exit(entry.ok ? 0 : entry.error ? 2 : 1);
}
