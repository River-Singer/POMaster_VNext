/**
 * constitutional.mjs —— Self-hosting benchmark · Constitutional/Architecture Change 档
 * （PRD §90.3 第三档；测试战略 L6-3）。
 *
 * 场景：「修改 State Model 并新增 Kernel Primitive」——宪法级/架构变更，
 * §90.3 期望 Profile = STRICT + Meta-Governance（口径映射待 Owner A3 裁定，
 * 见本文件 a3_pending_items——不假绿也不误红）。
 *
 * 结构可区分性（§90.3「三类任务走同一套流程 = Adaptive Governance 失败」的判卷化）：
 *   - tiny / normal 走 CLI triage 关键词引擎（surface = "cli:triage"，信封只产
 *     profile/证据级/关键词，无 gate 执行载体）；
 *   - constitutional 走 kernel catalog v1 完整治理面（surface = "kernel:catalog+gatekeeper"），
 *     全部取 packages/kernel 既有 API 真实执行（禁止 mock 假跑）：
 *       1. catalog-lock 校验：readCatalogLock + verifyCatalogLock（全量条目 sha256 对账，
 *          D24 read-side 指纹）；
 *       2. profile 锚定：catalog-lock profile（web-standard@0）存在性；
 *       3. 宪法级条目面：lock entries 的 GATE.*（gate recipe 5 条）与 AUTHORITY.*
 *          （§90.2 Meta-Governance Protected Set 的 Authority Model 锚 5 条）——
 *          经共享读取器单点取得，零 readdir 旁路；
 *       4. DEF-GATEKEEPER「cannot self-approve」观测器行为校验（gatekeeper.ts 既有 API）：
 *          临时 store fixture（mkdtemp，前缀 pvnext-kernel-test-，finally 全树删除）上
 *          验证 同 execution 既提 proposal（CLM）又 ALLOW（GRN verdict=passed）→ drift
 *          触发；身份分离 → 不触发；空 store → 零分母不触发。
 *   - 三档各自产出路径签名（执行面 / gate 集合 / artifact 集合 / profile 值），脚本内
 *     机器断言两两不同；三者出现同路 → 本脚本红（§90.3 失败条款的判卷化）。
 *
 * A3 pending 纪律：宪法档「口径」（具体执行哪些宪法 gate、判定阈值、STRICT 档映射）
 * 属 Owner A3 裁定位——凡依赖未裁口径的项列入 a3_pending_items（ruling="PENDING_A3"），
 * 不参与 ok 判定；机器上今天可真判的部分（catalog-lock 完整性 / 路径签名可区分性 /
 * profile 锚定存在性 / gatekeeper 观测器行为）正常断言参与 ok。
 *
 * 退出码：0 = ok 断言全过；1 = 断言失败（含三档同路）；2 = 基准装置错误（kernel/CLI dist 缺失）。
 * 单跑：node benchmarks/constitutional.mjs（内部真跑 tiny+normal 以取得三档真实签名）；
 * 亦可由 run-all.mjs 传入已跑的两档条目复用，避免重复执行。
 */
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { runTinyBenchmark } from "./tiny.mjs";
import { runNormalBenchmark } from "./normal.mjs";

export const CONSTITUTIONAL_TIER = "constitutional";
export const CONSTITUTIONAL_SCENARIO = "修改 State Model 并新增 Kernel Primitive";
/** §90.3 期望词形；与 triage 档位的映射口径待 A3（STRICT 在 triage v0 为 prompt_only 预留）。 */
export const CONSTITUTIONAL_EXPECTED = "STRICT + Meta-Governance";

/** 临时 store fixture 目录前缀（铁律：绝不触碰真实 ~/.claude / 用户 home）。 */
const FIXTURE_PREFIX = "pvnext-kernel-test-";

/** kernel dist 位置（benches 同款解析：仓库内 packages/kernel/dist/index.js）。 */
export function resolveKernelDist() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(here, "..", "packages", "kernel", "dist", "index.js");
  return existsSync(dist) ? dist : null;
}

/** 稳定 stringify（键排序递归）——签名比较用，避免键序巧合影响判等。 */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * tiny/normal 档路径签名（从真实 triage 条目派生，不伪造）：
 * surface=cli:triage；profile=triage 判定原文；gate_ids 从条目上的 gate 载体字段派生
 * （triage-rule-v0 信封无 gate 执行载体 → 今天恒 []；未来信封长出 gate_ids 字段则自动跟随）；
 * artifact=triage-envelope（该档真实产物即信封本体）。
 * 纪律：签名体不含 tier 名——tier 是签名映射的键（path_signature.tiny/normal/…），
 * 若混入签名体，「两两不同」断言将因身份标签恒异而永真（判卷真空）；同路判定只看路径字段。
 */
function triageTierSignature(entry) {
  return {
    surface: "cli:triage",
    profile: entry.profile ?? null,
    matched_rule: entry.matched_rule ?? null,
    gate_ids: Array.isArray(entry.gate_ids) ? entry.gate_ids : [],
    artifacts: ["triage-envelope"],
  };
}

/**
 * 跑 Constitutional 档基准。options.tinyEntry / options.normalEntry 允许 run-all.mjs
 * 传入已跑条目复用；缺省时本函数真跑两档以取得三档签名。
 * 返回档位条目（run-all.mjs 原样写入 last-results.json）。
 */
export async function runConstitutionalBenchmark(options = {}) {
  const startedAt = performance.now();
  const assertions = [];
  const fail = (name, detail) => assertions.push({ name, ok: false, detail });

  // —— 两档真实条目（复用或真跑）——
  let tinyEntry = options.tinyEntry ?? null;
  let normalEntry = options.normalEntry ?? null;
  try {
    if (tinyEntry === null) tinyEntry = await runTinyBenchmark();
    if (normalEntry === null) normalEntry = await runNormalBenchmark();
  } catch (error) {
    return harnessError(
      startedAt,
      assertions,
      `tiny/normal 基准执行崩溃：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // —— kernel dist 装置检查（缺失 = 装置错误，exit 2 语义）——
  const kernelDist = resolveKernelDist();
  if (kernelDist === null) {
    return harnessError(
      startedAt,
      assertions,
      "kernel-dist-missing: packages/kernel/dist/index.js 不存在，先跑 `node scripts/build-all.mjs`",
      { tinyEntry, normalEntry },
    );
  }

  /** @type {any} */
  let kernel = null;
  try {
    kernel = await import(pathToFileURL(kernelDist).href);
  } catch (error) {
    return harnessError(
      startedAt,
      assertions,
      `kernel-dist-unloadable: ${error instanceof Error ? error.message : String(error)}`,
      { tinyEntry, normalEntry },
    );
  }

  // ============================================================
  // 1) catalog v1 完整治理面：catalog-lock 校验 + profile 锚定 + 宪法级条目面
  // ============================================================
  let lock = null;
  let verification = null;
  let gateEntryIds = [];
  let authorityEntryIds = [];
  let policiesTotal = 0;
  let policiesHumanOwner = 0;
  let catalogBroken = null;

  try {
    const catalogRoot = kernel.resolveCatalogRoot();
    lock = kernel.readCatalogLock(catalogRoot);
    verification = kernel.verifyCatalogLock(catalogRoot, lock);
    gateEntryIds = lock.entries.filter((e) => e.id.startsWith("GATE.")).map((e) => e.id);
    authorityEntryIds = lock.entries.filter((e) => e.id.startsWith("AUTHORITY.")).map((e) => e.id);
    const policies = kernel.loadCatalogPolicies(catalogRoot);
    policiesTotal = policies.length;
    policiesHumanOwner = policies.filter((p) => p.authorityOwner === "HUMAN_OWNER").length;
  } catch (error) {
    catalogBroken = error instanceof Error ? error.message : String(error);
  }

  if (catalogBroken !== null) {
    fail("catalog-lock-ok", `catalog 治理面读取/校验崩溃（fail-closed 显式爆）：${catalogBroken}`);
  } else {
    assertions.push({
      name: "catalog-lock-ok",
      ok: verification.ok === true && verification.drifts.length === 0,
      detail: `verifyCatalogLock ok=${verification.ok}，entries_checked=${verification.entries_checked}/${lock.entries.length}，drifts=${verification.drifts.length}${verification.drifts.length > 0 ? `（首处: ${verification.drifts[0].kind}: ${verification.drifts[0].path}）` : ""}（sha256 逐条对账，D24 read-side 指纹）`,
    });

    const profileAnchor = typeof lock.profile === "string" ? lock.profile : "";
    const anchorShaped = /^[^@\s]+@[^@\s]+$/.test(profileAnchor);
    assertions.push({
      name: "profile-anchor-present",
      ok: anchorShaped,
      detail: `catalog-lock profile="${profileAnchor}"（catalog_version=${lock.catalog_version}）${anchorShaped ? "，name@version 词形锚存在" : "，锚缺失或词形非法"}`,
    });

    assertions.push({
      name: "constitutional-gate-subset-anchored",
      ok: gateEntryIds.length > 0 && gateEntryIds.every((id) => id.startsWith("GATE.")),
      detail: `GATE.* 条目 ${gateEntryIds.length} 条经 lock 哈希校验在场（${gateEntryIds.join(", ")}）；具体执行子集与阈值属 A3 pending，不在本断言判定范围`,
    });

    assertions.push({
      name: "authority-model-anchor-present",
      ok: authorityEntryIds.length > 0,
      detail: `AUTHORITY.* 条目 ${authorityEntryIds.length} 条（§90.2 Protected Set 之 Authority Model 锚）：${authorityEntryIds.join(", ")}`,
    });

    assertions.push({
      name: "policies-loadable-human-owned",
      ok: policiesTotal > 0 && policiesHumanOwner === policiesTotal,
      detail: `loadCatalogPolicies=${policiesTotal} 条（共享读取器词表对账 fail-closed 真实执行）；authority.owner=HUMAN_OWNER ${policiesHumanOwner}/${policiesTotal}（cannot self-approve 锚）`,
    });
  }

  // ============================================================
  // 2) DEF-GATEKEEPER 观测器行为（cannot self-approve 纪律的机器面）
  //    临时 store fixture：mkdtemp + finally 全树删除；无墙钟依赖（now 注入定值，
  //    fixture 无 execution 档案 → in_window 走「宁严不漏」分支，与墙钟无关）。
  // ============================================================
  let gatekeeperReport = null;
  let gatekeeperError = null;
  try {
    gatekeeperReport = await runGatekeeperFixtures(kernel);
  } catch (error) {
    gatekeeperError = error instanceof Error ? error.message : String(error);
  }

  if (gatekeeperReport === null) {
    fail("gatekeeper-observer-behavior", `观测器 fixture 执行失败：${gatekeeperError ?? "unknown"}`);
  } else {
    assertions.push({
      name: "gatekeeper-drift-caught",
      ok:
        gatekeeperReport.drift.triggered === true &&
        gatekeeperReport.drift.rows.length === 1 &&
        gatekeeperReport.drift.rows[0].drift === true,
      detail: `同 execution 既 CLM（proposal）又 GRN passed（ALLOW）→ triggered=${gatekeeperReport.drift.triggered}，rows[0].drift=${gatekeeperReport.drift.rows[0]?.drift}（detectGatekeeperDrift 真实执行）`,
    });
    assertions.push({
      name: "gatekeeper-separated-identities-clean",
      ok: gatekeeperReport.clean.triggered === false,
      detail: `proposal 与 ALLOW 身份分离 → triggered=${gatekeeperReport.clean.triggered}（分身纪律：分离即无信号）`,
    });
    assertions.push({
      name: "gatekeeper-empty-store-zero-denominator",
      ok:
        gatekeeperReport.empty.executions_with_identity === 0 &&
        gatekeeperReport.empty.triggered === false,
      detail: `空 store → executions_with_identity=${gatekeeperReport.empty.executions_with_identity}，triggered=${gatekeeperReport.empty.triggered}（缺席不伪造，零分母显式）`,
    });
  }

  // ============================================================
  // 3) 三档路径签名 + 可区分性机器断言（§90.3 同路=失败的判卷化）
  // ============================================================
  const signatureTiny = triageTierSignature(tinyEntry);
  const signatureNormal = triageTierSignature(normalEntry);
  const signatureConstitutional = {
    surface: "kernel:catalog+gatekeeper",
    profile: lock !== null ? lock.profile : null,
    matched_rule: null, // 不走 triage 规则桶——无 triage 规则词形，这本身就是结构差异实体
    gate_ids: gateEntryIds,
    artifacts: [
      "catalog-lock-verification",
      "catalog-authority-anchor",
      "gatekeeper-drift-report",
      "three-tier-path-signature",
    ],
  };

  const sigTiny = stableStringify(signatureTiny);
  const sigNormal = stableStringify(signatureNormal);
  const sigConstitutional = stableStringify(signatureConstitutional);

  const pairwise = [
    { pair: "constitutional≠tiny", distinct: sigConstitutional !== sigTiny },
    { pair: "constitutional≠normal", distinct: sigConstitutional !== sigNormal },
    { pair: "tiny≠normal", distinct: sigTiny !== sigNormal },
  ];

  // —— RT3-tautology 封条：头版断言 = 三条真实轴断言的聚合（执行面 / gate 集合 /
  // profile 值）。签名对象里 surface/matched_rule/artifacts 是本档常量词形（结构性
  // 描述位，非测量值），只凭整签名两两不等会让「gate 集合塌缩到与 triage 档同路」
  // 时头版仍 PASS（判卷真空）——头版必须与轴断言同红同绿。
  const axisSurfaceDistinct =
    signatureConstitutional.surface !== signatureTiny.surface &&
    signatureConstitutional.surface !== signatureNormal.surface;
  const axisGateSetDistinct =
    signatureConstitutional.gate_ids.length > 0 &&
    signatureTiny.gate_ids.length === 0 &&
    signatureNormal.gate_ids.length === 0;
  const axisProfileDistinct =
    signatureConstitutional.profile !== null &&
    signatureConstitutional.profile !== signatureTiny.profile &&
    signatureConstitutional.profile !== signatureNormal.profile;

  const collapsedAxes = [
    { axis: "执行面", distinct: axisSurfaceDistinct },
    { axis: "gate集合", distinct: axisGateSetDistinct },
    { axis: "profile值", distinct: axisProfileDistinct },
  ].filter((a) => !a.distinct).map((a) => a.axis);
  assertions.push({
    name: "three-tier-path-signatures-distinct",
    ok: axisSurfaceDistinct && axisGateSetDistinct && axisProfileDistinct,
    detail:
      collapsedAxes.length === 0
        ? `三档在全部真实轴上两两可区分（§90.3 同路=失败未触发；头版=三轴聚合，非整签名两两不等的同义反复——surface/matched_rule/artifacts 为常量词形不计入）：surface constitutional="${signatureConstitutional.surface}" vs tiny/normal="cli:triage"；gate_ids constitutional=${signatureConstitutional.gate_ids.length} 条 vs 两档 0 条；profile constitutional="${signatureConstitutional.profile}" vs triage 档位词`
        : `三档同路（§90.3 Adaptive Governance 失败）：塌缩轴=${collapsedAxes.join("；")}（另整签名两两不等检测：${pairwise.filter((p) => !p.distinct).map((p) => p.pair).join("；") || "无"}）`,
  });

  // 轴级差异（比整签名不等更强的判卷：同路必须在具体轴上可见）
  assertions.push({
    name: "distinct-axis-execution-surface",
    ok: axisSurfaceDistinct,
    detail: `执行面轴：constitutional="${signatureConstitutional.surface}"，tiny="${signatureTiny.surface}"，normal="${signatureNormal.surface}"`,
  });
  assertions.push({
    name: "distinct-axis-gate-set",
    ok: axisGateSetDistinct,
    detail: `gate 集合轴：constitutional ${signatureConstitutional.gate_ids.length} 条 GATE.* vs tiny=${signatureTiny.gate_ids.length} / normal=${signatureNormal.gate_ids.length}（triage 信封无 gate 执行载体）`,
  });
  assertions.push({
    name: "distinct-axis-profile-value",
    ok: axisProfileDistinct,
    detail: `profile 值轴：constitutional 锚 catalog profile="${signatureConstitutional.profile}"，tiny="${signatureTiny.profile}"，normal="${signatureNormal.profile}"（triage 档位词 vs catalog name@version 锚）`,
  });

  const ok = assertions.length > 0 && assertions.every((a) => a.ok);

  const entry = {
    tier: CONSTITUTIONAL_TIER,
    scenario: CONSTITUTIONAL_SCENARIO,
    expected: CONSTITUTIONAL_EXPECTED,
    /** catalog profile 锚（非 triage 档位词——宪法档不走 triage，见 surface 轴）。 */
    profile: lock !== null ? lock.profile : null,
    profile_kind: "catalog-profile-anchor",
    surface: signatureConstitutional.surface,
    matched_rule: null,
    evidence_grade: "MEASURED",
    matched_keywords: [],
    catalog:
      lock !== null
        ? {
            catalog_version: lock.catalog_version,
            profile: lock.profile,
            entries_total: lock.entries.length,
            entries_checked: verification.entries_checked,
            drifts: verification.drifts.length,
            gate_entry_ids: gateEntryIds,
            authority_entry_ids: authorityEntryIds,
            policies_total: policiesTotal,
            policies_human_owner: policiesHumanOwner,
          }
        : null,
    gatekeeper:
      gatekeeperReport !== null
        ? {
            drift_fixture_triggered: gatekeeperReport.drift.triggered,
            clean_fixture_triggered: gatekeeperReport.clean.triggered,
            empty_store_executions: gatekeeperReport.empty.executions_with_identity,
          }
        : null,
    path_signature: {
      constitutional: signatureConstitutional,
      normal: signatureNormal,
      tiny: signatureTiny,
    },
    /** A3 pending 清单（不参与 ok 判定；Owner 裁定后逐项转正为断言）。 */
    a3_pending_items: a3PendingItems(gateEntryIds),
    durationMs: Math.round(performance.now() - startedAt),
    ok,
    assertions,
  };
  if (!ok && (catalogBroken !== null || gatekeeperReport === null)) {
    entry.error = "constitutional 治理面未完整执行（catalog 或 gatekeeper 环节崩溃，见断言明细）";
  }
  return entry;
}

/** gatekeeper 三 fixture：drift（既提又 ALLOW）/ clean（身份分离）/ empty（零分母）。 */
async function runGatekeeperFixtures(kernel) {
  const base = mkdtempSync(path.join(tmpdir(), FIXTURE_PREFIX));
  try {
    const driftDir = path.join(base, "drift");
    const cleanDir = path.join(base, "clean");
    const emptyDir = path.join(base, "empty");

    // fixture A：同 execution AGX-2026-9001 既提 proposal（CLM）又 ALLOW（GRN passed）。
    const driftStore = await kernel.createStore(driftDir);
    writeEvidence(driftStore.rootDir, {
      claims: [{ name: "CLM-1.json", executionId: "AGX-2026-9001" }],
      runs: [{ name: "GRN-1.json", executionId: "AGX-2026-9001" }],
    });
    const drift = kernel.detectGatekeeperDrift(driftStore, { now: 0 });

    // fixture B：proposal 与 ALLOW 身份分离（GRN 挂另一 execution，无 CLM）。
    const cleanStore = await kernel.createStore(cleanDir);
    writeEvidence(cleanStore.rootDir, {
      claims: [],
      runs: [{ name: "GRN-1.json", executionId: "AGX-2026-9002" }],
    });
    const clean = kernel.detectGatekeeperDrift(cleanStore, { now: 0 });

    // fixture C：空 store（骨架零证据）——零分母显式，缺席不伪造。
    const emptyStore = await kernel.createStore(emptyDir);
    const empty = kernel.detectGatekeeperDrift(emptyStore, { now: 0 });

    return { drift, clean, empty };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** 写入最小证据 fixture（canonical 词形：record_type + AGX execution_id；零时间戳）。 */
function writeEvidence(rootDir, { claims, runs }) {
  const runsDir = path.join(rootDir, ".pomaster", "evidence", "runs");
  const claimsDir = path.join(rootDir, ".pomaster", "evidence", "claims");
  mkdirSync(runsDir, { recursive: true });
  mkdirSync(claimsDir, { recursive: true });
  for (const claim of claims) {
    writeFileSync(
      path.join(claimsDir, claim.name),
      `${JSON.stringify({ record_type: "claim", execution_id: claim.executionId })}\n`,
      "utf8",
    );
  }
  for (const run of runs) {
    writeFileSync(
      path.join(runsDir, run.name),
      `${JSON.stringify({
        record_type: "run",
        execution_id: run.executionId,
        gate_result: { result: { verdict: "passed" } },
      })}\n`,
      "utf8",
    );
  }
}

/** A3 pending 清单：宪法档口径裁定位（不参与 ok；裁定后逐项转正）。 */
function a3PendingItems(gateEntryIds) {
  return [
    {
      id: "constitutional_gate_subset_selection",
      ruling: "PENDING_A3",
      question:
        "宪法档具体执行哪些宪法 gate（catalog 5 条 GATE.* recipe 的执行子集或全量）",
      candidates: gateEntryIds,
      current_behavior:
        "仅经 catalog-lock 哈希校验锚定在场（anchored），不执行任何 gate 判卷；不参与 ok",
      participates_in_ok: false,
    },
    {
      id: "constitutional_gate_thresholds",
      ruling: "PENDING_A3",
      question:
        "宪法档 gate 判定阈值与 passed 判据（gate_def_draft.judging_rules 为草稿词形，非裁定）",
      candidates: [
        "counts_not_applicable_required",
        "trust_twin",
        "blindspot_evidence",
        "aggregate_honesty",
      ],
      current_behavior: "不做 gate 判卷，因此无阈值断言；不参与 ok",
      participates_in_ok: false,
    },
    {
      id: "strict_profile_mapping",
      ruling: "PENDING_A3",
      question:
        "§90.3 期望「STRICT + Meta-Governance」与本基准呈现面的映射口径：triage v0 引擎无 STRICT 档（prompt_only 预留，ceiling_candidates 恒空）；宪法档现以 catalog profile 锚（name@version）呈现治理档",
      candidates: ["triage-STRICT-物化", "catalog-profile-锚即档", "双轨并行"],
      current_behavior:
        "profile 字段如实呈现 catalog 锚原值并标 profile_kind=catalog-profile-anchor，不冒充 triage STRICT；不参与 ok",
      participates_in_ok: false,
    },
  ];
}

/** 装置错误条目（exit 2 语义）：kernel/CLI 缺失或崩溃——非断言失败。 */
function harnessError(startedAt, assertions, message, extra = {}) {
  const entry = {
    tier: CONSTITUTIONAL_TIER,
    scenario: CONSTITUTIONAL_SCENARIO,
    expected: CONSTITUTIONAL_EXPECTED,
    profile: null,
    profile_kind: "catalog-profile-anchor",
    surface: "kernel:catalog+gatekeeper",
    matched_rule: null,
    evidence_grade: null,
    matched_keywords: [],
    catalog: null,
    gatekeeper: null,
    path_signature: null,
    a3_pending_items: [],
    durationMs: Math.round(performance.now() - startedAt),
    ok: false,
    error: message,
    assertions,
    ...extra,
  };
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
  const entry = await runConstitutionalBenchmark();
  if (entry.path_signature !== null) {
    for (const a of entry.assertions) {
      console.log(`  [${a.ok ? "PASS" : "FAIL"}] ${a.name}: ${a.detail}`);
    }
    console.log(
      `[constitutional] surface=${entry.surface} profile=${entry.profile} gates=${entry.catalog?.gate_entry_ids.length ?? 0} a3_pending=${entry.a3_pending_items.length} durationMs=${entry.durationMs} → ${entry.ok ? "PASS" : "FAIL"}${entry.error ? ` (${entry.error})` : ""}`,
    );
    console.log(
      `  [signature] constitutional surface="${entry.path_signature.constitutional.surface}" gates=${entry.path_signature.constitutional.gate_ids.length} | tiny surface="${entry.path_signature.tiny.surface}" gates=${entry.path_signature.tiny.gate_ids.length} | normal surface="${entry.path_signature.normal.surface}" gates=${entry.path_signature.normal.gate_ids.length}`,
    );
    process.exit(entry.ok ? 0 : entry.error ? 2 : 1);
  } else {
    console.log(`[constitutional] harness error: ${entry.error}`);
    process.exit(2);
  }
}
