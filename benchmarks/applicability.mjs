/**
 * applicability.mjs —— Self-hosting benchmark · Applicability 档（PRD v0.5.2 §15 Benchmark A；
 * §14 P0.5-1 T3 标注战役后的真实 catalog 判卷面；W1-A2，Owner 裁决 8 ② 2026-09-01）。
 *
 * 场景：「README badge 文案调整」（与 tiny 档同场景——纯文案变更）。
 * 组合断言（研究 applicability.md §4.4 落法）：
 *   1. triage 信封 profile=MINIMAL（tiny 档同引擎：自同场景 triage 信封取 profile；
 *      run-all 传入本轮 tiny 条目则复用，不重复执行子进程）；
 *   2. `context compile --role frontend --capability CAPABILITY.PRESENTATION` 的
 *      catalogEntries 不含「非回退泄漏」的 policy.api.* / policy.sec.* 族（真实 catalog
 *      T3 标注承载的更严真断言；I7 修正：lane=any 保守回退纳入且 explain 决策面
 *      fallback_lane=true 披露的条目是已披露回退而非泄漏——SEC 第三方执行体登记
 *      撤账后的诚实词形；进编译但决策面无 fallback 披录 = 泄漏，fail-closed 判红）；
 *   3. 编译原始输出（stdout+stderr）无 architect/research/spawn/subagent 字样
 *      （MINIMAL 档纪律延续 tiny 先例）；
 *   4. `context explain` 逐条 why：每个决策恰有一面 why（included→why_included /
 *      excluded→why_excluded），API/Sec 族 excluded 且 why_excluded 携带
 *      capabilities 轴详情（PRD §5.4 Explainability——「每个决定可解释」）。
 *
 * 诚实边界（研究 applicability.md R6 / Owner 裁决 8 ② O9——DB Transaction 验收 fixture-only）：
 *   - 真实 catalog 无 DB transaction / backend persistence 条目（db_domain_entries_total=0
 *     如实披露）——I8③ 修正：绊线判读对象 = catalog 锁全集 id（catalog 分母）而非编译
 *     输出（编译分母冒充 catalog 分母的原缺陷：DB 条目被排除在编译外时空分母假绿）；
 *     DB 域条目出现在 catalog 即红。DB 排除逻辑的真判卷由
 *     tests/integration/catalog-applicability-case-b.spec.ts 的 fixture DB 条目承载
 *     （fixture-only，真实条目挂 catalog 扩容后续任务）；
 *   - 本档判卷面 = capabilities 轴（T3 标注的 API/Sec 族）；change_class / profile 轴
 *     的判卷覆盖由 kernel/集成 spec 承载，本档不冒充全轴判卷。
 *
 * 路径签名（§90.3「同路 = Adaptive Governance 失败」的四档延续）：
 *   surface="cli:context-applicability"（走 context compile/explain 命令面，与
 *   cli:triage / kernel:catalog+gatekeeper 不同流程）；artifacts 与 excluded_refs
 *   为本档真实产物轴。轴断言与整签名两两不等聚合——surface/artifacts 为结构性
 *   常量词形（constitutional RT3-tautology 封条同款纪律），判卷真值在
 *   excluded_refs>0（标注回归即红）与 compile/explain 真实执行。
 *
 * 退出码：0 = 全部断言通过；1 = 断言失败（含签名同路）；2 = 基准装置错误（CLI 缺失/崩溃）。
 * 单跑：node benchmarks/applicability.mjs ；亦可被 run-all.mjs import（import 时不自动执行）。
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TINY_SCENARIO, resolveCliBin, runTinyBenchmark } from "./tiny.mjs";
import { runNormalBenchmark } from "./normal.mjs";

export const APPLICABILITY_TIER = "applicability";
export const APPLICABILITY_SCENARIO = TINY_SCENARIO; // README badge 文案调整（与 tiny 同场景）
export const APPLICABILITY_EXPECTED =
  "MINIMAL + catalog applicability exclusion（PRD v0.5.2 §15 Benchmark A）";

/** 仓根（catalog 锁的绊线分母读取锚；本文件住 <repo>/benchmarks/）。 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_LOCK_PATH = path.join(REPO_ROOT, "catalog", "catalog-lock.draft.json");

/** 编译用 capability 输入（README 文案调整 = 纯呈现面变更；PRD §16 Case B 同词形）。 */
const COMPILE_CAPABILITIES = ["CAPABILITY.PRESENTATION"];

/** MINIMAL 档输出中禁入的字样（tiny 先例同款正则）。 */
const FORBIDDEN_SPAWN_PATTERN = /(architect|research|spawn|subagent)/i;

/** API/Sec 族 ref 判定（catalog-applicability-case-b.spec.ts 同款词形面）。 */
const API_SEC_REF = (ref) =>
  ref.startsWith("POLICY.API.") || ref.includes(".API.") || ref.includes(".SEC.");

/** 临时 fixture 目录前缀（铁律：绝不触碰真实 home/.pomaster）。 */
const FIXTURE_PREFIX = "pvnext-bench-applicability-";

/** 稳定 stringify（键排序递归）——签名比较用（constitutional.mjs 同款实现，本档本地复制避免跨档耦合）。 */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** 以子进程跑 `pomaster --dir <dir> <args...> --json`（args 数组直传，不经 shell）。 */
function runCliJson(cliBin, dir, args) {
  const res = spawnSync(process.execPath, [cliBin, "--dir", dir, ...args, "--json"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const stdout = typeof res.stdout === "string" ? res.stdout : "";
  let envelope = null;
  let parseError = null;
  try {
    envelope = JSON.parse(stdout);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }
  return {
    status: res.status,
    stdout,
    stderr: typeof res.stderr === "string" ? res.stderr : "",
    envelope,
    parseError,
  };
}

/**
 * 跑 Applicability 档基准。options.tinyEntry / normalEntry / constitutionalEntry 允许
 * run-all.mjs 传入已跑条目复用（triage 判定与签名面）；缺省时本函数真跑 tiny+normal
 * 两档取得真实判定与签名（constitutional.mjs 同款装置纪律，禁伪造签名面）。
 * 返回档位条目（run-all.mjs 原样写入 last-results.json）。
 */
export async function runApplicabilityBenchmark(options = {}) {
  const startedAt = performance.now();
  const assertions = [];
  const fail = (name, detail) => assertions.push({ name, ok: false, detail });

  const cliBin = resolveCliBin();
  if (cliBin === null) {
    return {
      tier: APPLICABILITY_TIER,
      scenario: APPLICABILITY_SCENARIO,
      expected: APPLICABILITY_EXPECTED,
      profile: null,
      matched_rule: null,
      evidence_grade: null,
      matched_keywords: [],
      applicability: null,
      path_signature: null,
      durationMs: Math.round(performance.now() - startedAt),
      ok: false,
      error: "cli-bin-missing: packages/cli/dist/bin.js 不存在，先跑 `corepack pnpm --filter @pomaster/cli build`",
      assertions,
    };
  }

  // —— 两档真实条目（复用或真跑；签名面与 triage 判定的共同事实源，constitutional 同款）——
  let tinyEntry = options.tinyEntry ?? null;
  let normalEntry = options.normalEntry ?? null;
  try {
    if (tinyEntry === null) tinyEntry = await runTinyBenchmark();
    if (normalEntry === null) normalEntry = await runNormalBenchmark();
  } catch (error) {
    return {
      tier: APPLICABILITY_TIER,
      scenario: APPLICABILITY_SCENARIO,
      expected: APPLICABILITY_EXPECTED,
      profile: null,
      matched_rule: null,
      evidence_grade: null,
      matched_keywords: [],
      applicability: null,
      path_signature: null,
      durationMs: Math.round(performance.now() - startedAt),
      ok: false,
      error: `tiny/normal 基准执行崩溃：${error instanceof Error ? error.message : String(error)}`,
      assertions,
    };
  }

  // ============================================================
  // ① triage profile=MINIMAL（tiny 档同引擎真实判定）
  // ============================================================
  const triageProfile = tinyEntry.profile ?? null;
  const triageMatchedRule = tinyEntry.matched_rule ?? null;
  const triageMatchedKeywords = tinyEntry.matched_keywords ?? [];
  assertions.push({
    name: "triage-profile-minimal",
    ok: triageProfile === "MINIMAL",
    detail: `triage profile=${triageProfile}（rule=${triageMatchedRule}；README 文案调整期望 MINIMAL——tiny 档同引擎）`,
  });

  // ============================================================
  // ②③④ context compile / explain 实跑（临时 fixture 工程，init 后编译；finally 全树删除）
  // ============================================================
  let compileEnvelope = null;
  let explainEnvelope = null;
  let rawOutput = "";
  let harnessError = null;
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), FIXTURE_PREFIX));
  try {
    const init = runCliJson(cliBin, fixtureRoot, ["init"]);
    if (init.status !== 0) {
      harnessError = `init 失败（status=${init.status}）：${init.stderr || init.stdout}`;
    } else {
      const compile = runCliJson(cliBin, fixtureRoot, [
        "context", "compile",
        "--role", "frontend",
        "--capability", COMPILE_CAPABILITIES[0],
      ]);
      rawOutput = `${compile.stdout}\n${compile.stderr}`;
      if (compile.envelope === null) {
        harnessError = `context compile 未产出可解析 JSON 信封：${compile.parseError ?? "unknown"}`;
      } else if (compile.envelope.ok !== true) {
        harnessError = `context compile 信封 ok=false：${JSON.stringify(compile.envelope.errors ?? [])}`;
      } else {
        compileEnvelope = compile.envelope;
      }
      if (compileEnvelope !== null) {
        const explain = runCliJson(cliBin, fixtureRoot, [
          "context", "explain",
          "--role", "frontend",
          "--capability", COMPILE_CAPABILITIES[0],
        ]);
        if (explain.envelope === null) {
          harnessError = `context explain 未产出可解析 JSON 信封：${explain.parseError ?? "unknown"}`;
        } else if (explain.envelope.ok !== true) {
          harnessError = `context explain 信封 ok=false：${JSON.stringify(explain.envelope.errors ?? [])}`;
        } else {
          explainEnvelope = explain.envelope;
        }
      }
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }

  let catalogRefs = [];
  let excludedApiSecRefs = [];
  let allDecisions = [];
  let apiSecFallbackIncludedRefs = [];
  let catalogIds = [];
  let catalogScanError = null;
  if (harnessError !== null) {
    fail("compile-explain-harness", harnessError);
  } else {
    const manifest = compileEnvelope.result?.manifest ?? {};
    catalogRefs = (manifest.catalog_entries ?? []).map((entry) => entry.ref);
    allDecisions = explainEnvelope.result?.decisions ?? [];
    const decisionByRef = new Map(
      allDecisions.map((decision) => [decision.ref, decision]),
    );

    // ② catalogEntries 不含「非回退泄漏」的 API/Sec 族（T3 标注后的确定性排除）。
    // I7 语义修正：POLICY.SEC.THIRD_PARTY_EXECUTION_REGISTER 撤账（源协议正文无契约
    // 动词面，不满足保守派生纪律）后走 lane=any 缺省回退——explain 决策面
    // fallback_lane=true 的纳入是已披露的保守回退（O7 行为零变化）而非泄漏；真泄漏 =
    // API/Sec ref 进编译分母且无 fallback_lane 披露（机器轴判卷回归或被静默吞）。
    // 编译分母与 explain 决策面交叉对账：进编译却查无决策记录同样判泄漏（fail-closed）。
    const apiSecInCompile = catalogRefs.filter(API_SEC_REF);
    const leaked = apiSecInCompile.filter((ref) => {
      const decision = decisionByRef.get(ref);
      return !(decision?.decision === "included" && decision.fallback_lane === true);
    });
    apiSecFallbackIncludedRefs = apiSecInCompile.filter((ref) => {
      const decision = decisionByRef.get(ref);
      return decision?.decision === "included" && decision.fallback_lane === true;
    });
    assertions.push({
      name: "catalog-no-api-sec-entries",
      ok: leaked.length === 0,
      detail:
        leaked.length === 0
          ? `catalogEntries 的 API/Sec 族 ${apiSecInCompile.length} 条零非回退泄漏（capabilities=[${COMPILE_CAPABILITIES.join("/")}] 输入下：capabilities 轴确定性排除为常态；${apiSecFallbackIncludedRefs.length} 条经 lane=any 保守回退纳入且 fallback_lane=true 披露——SEC 第三方执行体登记 I7 撤账后的诚实词形，O7 行为零变化）`
          : `API/Sec 族非回退泄漏进纯呈现面 Change 的上下文：${leaked.join(", ")}——机器 applicability 判定回归（含进编译但 explain 决策面无 fallback_lane 披录的形态）`,
    });

    // ③ 编译原始输出无 architect/research/spawn/subagent 字样。
    const hit = rawOutput.match(FORBIDDEN_SPAWN_PATTERN);
    assertions.push({
      name: "no-architect-research-spawn-words",
      ok: hit === null,
      detail: hit === null ? "raw 输出无禁入字样" : `命中禁入字样: ${hit[0]}`,
    });

    // ④ context explain 逐条 why + API/Sec 族 excluded 可解释（PRD §5.4）。
    const malformed = allDecisions.filter(
      (decision) =>
        (decision.decision === "included" && typeof decision.why_included !== "string") ||
        (decision.decision === "excluded" && typeof decision.why_excluded !== "string") ||
        (decision.decision !== "included" && decision.decision !== "excluded"),
    );
    assertions.push({
      name: "explain-decisions-why-complete",
      ok: allDecisions.length > 0 && malformed.length === 0,
      detail:
        malformed.length === 0
          ? `decisions ${allDecisions.length} 条逐条 why 完整（included→why_included / excluded→why_excluded——PRD §5.4 决策记录面）`
          : `${malformed.length}/${allDecisions.length} 条决策 why 残缺（${malformed.slice(0, 3).map((d) => d.ref).join(", ")}）`,
    });
    excludedApiSecRefs = allDecisions
      .filter((decision) => decision.decision === "excluded" && API_SEC_REF(decision.ref))
      .map((decision) => decision.ref);
    const whyCarriesAxis = allDecisions
      .filter((decision) => decision.decision === "excluded" && API_SEC_REF(decision.ref))
      .filter((decision) => decision.why_excluded.includes("capabilities=[CAPABILITY.API_CONTRACT]"));
    assertions.push({
      name: "explain-api-sec-excluded-with-capability-why",
      ok:
        excludedApiSecRefs.length > 0 &&
        excludedApiSecRefs.length === whyCarriesAxis.length,
      detail:
        excludedApiSecRefs.length > 0
          ? `excluded 的 API/Sec 族 ${excludedApiSecRefs.length} 条全部 why_excluded 携带 capabilities=[CAPABILITY.API_CONTRACT] 轴详情（${whyCarriesAxis.length}/${excludedApiSecRefs.length}；「EXCLUDE unless contract affected」的机器语义可解释）`
          : `excluded 分母内零 API/Sec 族（decisions=${allDecisions.length}）——排除面分母塌空，T3 标注缺席或判定回归`,
    });
  }

  // ============================================================
  // 诚实边界披露（O9：真实 catalog 无 DB 域条目——绊线式，I8③ 修正判读分母）
  // ============================================================
  // I8③：原实现扫编译输出（catalogRefs）——编译分母冒充 catalog 分母：DB 条目即使
  // 真实存在于 catalog，也会被 capabilities/档位排除在本次编译外，扫编译面恒空 =
  // 「真实 catalog 无 DB 域条目」的自述被空分母假绿冒充。修正为绊线式判读（自述
  // 语义）：直接扫 catalog 锁（catalog/catalog-lock.draft.json 全集 id），DB 域条目
  // 出现即红（提示重审本断言面与 O9 fixture-only 裁决前提）；锁不可读按失败处理
  // （fail-closed，禁分母不可得时报绿）。
  const DB_DOMAIN_ID = (id) => id.includes(".DB.") || id.includes("PERSISTENCE");
  try {
    const lock = JSON.parse(readFileSync(CATALOG_LOCK_PATH, "utf8"));
    catalogIds = (Array.isArray(lock.entries) ? lock.entries : [])
      .map((entry) => String(entry?.id ?? ""))
      .filter((id) => id.length > 0);
  } catch (error) {
    catalogScanError = error instanceof Error ? error.message : String(error);
  }
  const dbDomainCatalogIds = catalogIds.filter(DB_DOMAIN_ID);
  const dbDomainDecisions = allDecisions.filter((decision) => DB_DOMAIN_ID(decision.ref));
  assertions.push({
    name: "db-domain-excluded-disclosed",
    ok:
      catalogScanError === null &&
      dbDomainCatalogIds.length > 0 &&
      dbDomainDecisions.length === dbDomainCatalogIds.length &&
      dbDomainDecisions.every((d) => d.decision === "excluded" && d.why_excluded.length > 0),
    detail:
      catalogScanError !== null
        ? `catalog 锁不可读（${path.relative(REPO_ROOT, CATALOG_LOCK_PATH)}）：${catalogScanError}——绊线分母不可得，按失败处理（fail-closed）`
        : dbDomainCatalogIds.length === 0
          ? `真实 catalog 锁 ${catalogIds.length} 条零 DB 域条目（O9 fixture-only 裁决；db_domain_entries_total=0 如实披露——绊线扫 catalog 全集而非编译分母，I8③ 修正）`
          : dbDomainDecisions.length === dbDomainCatalogIds.length &&
              dbDomainDecisions.every((d) => d.decision === "excluded" && d.why_excluded.length > 0)
            ? `DB 域条目 ${dbDomainCatalogIds.length} 条（${dbDomainCatalogIds.slice(0, 3).join(", ")}…）全部 excluded 且 why_excluded 携带排除详情——O9 前提经 B6 播种移植（D3 逐卡入册）推翻后改判卷式：出现不再是绊线，无排除详情才是（泄漏语义与 API/Sec 族同构）；真判卷仍由 catalog-applicability-case-b.spec fixture 承载`
            : `DB 域条目 ${dbDomainCatalogIds.length} 条中 ${dbDomainDecisions.length} 条有 explain 决策，且存在非 excluded 或 why 残缺——泄漏/残缺判红`,
  });

  // ============================================================
  // 四档路径签名 + 可区分性（§90.3 同路=失败的判卷化；constitutional RT3 封条同款）
  // ============================================================
  const signatureApplicability = {
    surface: "cli:context-applicability",
    profile: triageProfile,
    matched_rule: triageMatchedRule,
    gate_ids: [],
    artifacts: ["triage-envelope", "projection-manifest", "explain-decision-record"],
  };
  const signatureTiny = {
    surface: "cli:triage",
    profile: tinyEntry?.profile ?? null,
    matched_rule: tinyEntry?.matched_rule ?? null,
    gate_ids: [],
    artifacts: ["triage-envelope"],
  };
  const signatureNormal = {
    surface: "cli:triage",
    profile: normalEntry?.profile ?? null,
    matched_rule: normalEntry?.matched_rule ?? null,
    gate_ids: [],
    artifacts: ["triage-envelope"],
  };
  // constitutional 签名仅在 run-all 传入时参与四档两两判卷；单跑态三档两两 + surface 轴判卷
  // （constitutional 为 kernel 面 surface，与本档 cli:context-applicability 结构性互异，缺席不塌缩）。
  const signatureConstitutional =
    options.constitutionalEntry?.path_signature?.constitutional ?? null;

  const signatures = {
    applicability: signatureApplicability,
    tiny: signatureTiny,
    normal: signatureNormal,
  };
  if (signatureConstitutional !== null) signatures.constitutional = signatureConstitutional;

  const pairwise = [];
  const keys = Object.keys(signatures);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      pairwise.push({
        pair: `${keys[i]}≠${keys[j]}`,
        distinct:
          stableStringify(signatures[keys[i]]) !== stableStringify(signatures[keys[j]]),
      });
    }
  }
  const samePathPairs = pairwise.filter((item) => !item.distinct).map((item) => item.pair);
  // 轴级差异（比整签名不等更强的判卷；surface/artifacts 为结构性常量词形已在注记披露）：
  // - 执行面轴：本档走 context compile/explain 命令面（cli:triage / kernel:catalog+gatekeeper 之外）；
  // - 判卷产物轴：excluded_refs 非空是本档独有测量面（标注回归即红）。
  const axisSurfaceDistinct =
    signatureApplicability.surface !== signatureTiny.surface &&
    signatureApplicability.surface !== signatureNormal.surface &&
    (signatureConstitutional === null ||
      signatureApplicability.surface !== signatureConstitutional.surface);
  const axisExclusionDistinct = excludedApiSecRefs.length > 0;
  assertions.push({
    name: "four-tier-path-signatures-distinct",
    ok: samePathPairs.length === 0 && axisSurfaceDistinct && axisExclusionDistinct,
    detail:
      samePathPairs.length === 0 && axisSurfaceDistinct && axisExclusionDistinct
        ? `四档路径签名两两可区分（§90.3 同路=失败未触发）：surface="${signatureApplicability.surface}"（context compile/explain 命令面）+ excluded_refs=${excludedApiSecRefs.length} 条（本档独有判卷轴；surface/artifacts 为结构性常量词形——constitutional RT3 封条同款注记）`
        : `四档同路塌缩：同路对=[${samePathPairs.join("; ") || "无"}]，surface 轴可区分=${axisSurfaceDistinct}，excluded_refs=${excludedApiSecRefs.length}（§90.3 Adaptive Governance 失败条款）`,
  });

  const ok = assertions.length > 0 && assertions.every((a) => a.ok);
  const entry = {
    tier: APPLICABILITY_TIER,
    scenario: APPLICABILITY_SCENARIO,
    expected: APPLICABILITY_EXPECTED,
    profile: triageProfile,
    surface: signatureApplicability.surface,
    matched_rule: triageMatchedRule,
    evidence_grade: "MEASURED",
    matched_keywords: triageMatchedKeywords,
    applicability: {
      compile_role: "frontend",
      compile_capabilities: COMPILE_CAPABILITIES,
      catalog_entries_total: catalogRefs.length,
      excluded_api_sec_refs: excludedApiSecRefs,
      api_sec_compile_refs_total: catalogRefs.filter(API_SEC_REF).length,
      api_sec_fallback_included_refs: apiSecFallbackIncludedRefs,
      decisions_total: allDecisions.length,
      catalog_lock_entries_total: catalogIds.length,
      db_domain_entries_total: dbDomainCatalogIds.length,
      honest_boundary:
        "真实 catalog 无 DB transaction / backend persistence 条目（Owner 裁决 8 ② O9 fixture-only；绊线扫 catalog 锁全集而非编译分母——I8③ 修正「编译分母冒充 catalog 分母」）：DB 排除逻辑的真判卷由 catalog-applicability-case-b.spec 的 fixture DB 条目承载；本档判卷面=capabilities 轴（T3 标注的 API/Sec 族）+ lane=any 保守回退披露（fallback_lane=true 非泄漏——I7 撤账后的诚实词形），change_class/profile 轴判卷由 kernel/集成 spec 承载。",
    },
    path_signature: signatures,
    durationMs: Math.round(performance.now() - startedAt),
    ok,
    assertions,
  };
  if (!ok && harnessError !== null) {
    entry.error = `context compile/explain 未完整执行（见断言明细）：${harnessError}`;
  }
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
  const entry = await runApplicabilityBenchmark();
  for (const a of entry.assertions) {
    console.log(`  [${a.ok ? "PASS" : "FAIL"}] ${a.name}: ${a.detail}`);
  }
  console.log(
    `[${entry.tier}] surface=${entry.surface} profile=${entry.profile} excluded_api_sec=${entry.applicability?.excluded_api_sec_refs.length ?? "n/a"} durationMs=${entry.durationMs} → ${entry.ok ? "PASS" : "FAIL"}${entry.error ? ` (${entry.error})` : ""}`,
  );
  process.exit(entry.ok ? 0 : entry.error ? 2 : 1);
}
