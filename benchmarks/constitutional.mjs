/**
 * constitutional.mjs —— Self-hosting benchmark · Constitutional/Architecture Change 档
 * （PRD §90.3 第三档；测试战略 L6-3）。
 *
 * 场景：「修改 State Model 并新增 Kernel Primitive」——宪法级/架构变更，
 * §90.3 期望 Profile = STRICT + Meta-Governance（映射口径已裁定：catalog 锚即档，
 * Owner 决议 2026-09-01，见本文件 a3_ruling）。
 *
 * 结构可区分性（§90.3「三类任务走同一套流程 = Adaptive Governance 失败」的判卷化）：
 *   - tiny / normal 走 CLI triage 关键词引擎（surface = "cli:triage"，信封只产
 *     profile/证据级/关键词，无 gate 执行载体）；
 *   - constitutional 走 kernel catalog v1 完整治理面（surface = "kernel:catalog+gatekeeper"），
 *     全部取 packages/kernel 既有 API 真实执行（禁止 mock 假跑）：
 *       1. catalog-lock 校验：readCatalogLock + verifyCatalogLock（全量条目 sha256 对账，
 *          D24 read-side 指纹）；
 *       2. profile 锚定：catalog-lock profile（web-standard@0）存在性——catalog 锚即档
 *          （A3 裁定 3，Owner 决议 2026-09-01）；
 *       3. 宪法级条目面：lock entries 的 GATE.*（gate recipe 6 条，A3 裁定 1 = 全量执行面；P-v06 批次 1 延展 NEW_ENTITY.CHECKS）
 *          与 AUTHORITY.*（§90.2 Meta-Governance Protected Set 的 Authority Model 锚 5 条）
 *          ——经共享读取器单点取得，零 readdir 旁路；
 *       4. gate 判卷就绪校验（A3 裁定 1+2 执行面）：6 条 gate 逐条做「定义在场 + lock 哈希锚
 *          + judging_rules 四硬判据词形（草稿升硬）」校验。诚实边界（关键）：vNext 仓库自身
 *          无业务分母（gate 真实判卷需要 subject 数据面），执行面 = 就绪校验，每条 gate 显式
 *          产出 execution="not_run"（分母缺席）计入独立披露字段 constitutional_gate_readiness
 *          ——ok 吃「6/6 就绪 + 四规则词形完整」，不吃假判卷；
 *       5. fixture 演示判卷（红绿各一，加分量）：kernel normalizeGateResult（C1 七态判卷器）
 *          以 catalog gate_def 锚真实执行——绿 = 合式载荷归一为 passed（trust 孪生一致），
 *          红 = counts.not_applicable 缺失被 FATAL 拒收（裁定 2 规则 1 的判卷器机制）；
 *          fixture 面（subject TEST.* + is_fixture=true，Q3 隔离）不冒充业务分母判卷，
 *          6 条 gate 的执行 verdict 仍为 not_run；
 *       6. DEF-GATEKEEPER「cannot self-approve」观测器行为校验（gatekeeper.ts 既有 API）：
 *          临时 store fixture（mkdtemp，前缀 pvnext-kernel-test-，finally 全树删除）上
 *          验证 同 execution 既提 proposal（CLM）又 ALLOW（GRN verdict=passed）→ drift
 *          触发；身份分离 → 不触发；空 store → 零分母不触发。
 *   - 三档各自产出路径签名（执行面 / gate 集合 / artifact 集合 / profile 值），脚本内
 *     机器断言两两不同；三者出现同路 → 本脚本红（§90.3 失败条款的判卷化）。
 *
 * A3 裁定纪律（Owner 决议 2026-09-01，按推荐全收）：三项裁定记入 a3_ruling
 * （ruling="APPROVED_OWNER_2026_09_01"，三项裁定内容逐字）——「PENDING_A3 不参与 ok」
 * 机制已移除，被裁定项转正为参与 ok 判定的真断言：
 *   裁定 1（gate 子集）→ constitutional-gate-subset-anchored（精确集合）+
 *   gate-judging-readiness-6-of-6；裁定 2（判定阈值）→ gate-judging-rules-hardened-wordform +
 *   gate-result-fixture-red/green；裁定 3（STRICT 映射）→ profile-anchor-present +
 *   distinct-axis-profile-value（catalog 锚即档，无双轨）。
 *
 * 退出码：0 = ok 断言全过；1 = 断言失败（含三档同路）；2 = 基准装置错误（kernel/CLI dist 缺失）。
 * 单跑：node benchmarks/constitutional.mjs（内部真跑 tiny+normal 以取得三档真实签名）；
 * 亦可由 run-all.mjs 传入已跑的两档条目复用，避免重复执行。
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { runTinyBenchmark } from "./tiny.mjs";
import { runNormalBenchmark } from "./normal.mjs";

export const CONSTITUTIONAL_TIER = "constitutional";
export const CONSTITUTIONAL_SCENARIO = "修改 State Model 并新增 Kernel Primitive";
/** §90.3 期望词形；映射口径已裁定（A3 裁定 3，Owner 2026-09-01）：catalog 锚即档——
 *  呈现面以 catalog-lock profile 锚（name@version）为宪法档位词形，triage 不物化 STRICT
 *  档（prompt_only 预留不动），无双轨。 */
export const CONSTITUTIONAL_EXPECTED = "STRICT + Meta-Governance";

// ============================================================
// A3 裁定常量（Owner 决议 2026-09-01，本会话 AskUserQuestion 直答，按推荐全收；
// 三项裁定内容逐字——台账由主控统一记，此处为执行面事实源）
// ============================================================

/** A3 裁定 id。 */
export const A3_RULING_ID = "APPROVED_OWNER_2026_09_01";

/** 裁定 1（gate 子集，逐字）：宪法档执行面 = catalog 全部 GATE.*。2026-09-03 延展：
 * P-v06 批次 1 增 GATE.NEW_ENTITY.CHECKS（meta-governance 同类——五否机判门禁），
 * A3「catalog 全部 GATE.*」语义随全集合自然延展至 6 条（延展留痕呈报 Owner）。 */
export const A3_RULING_GATE_SUBSET =
  "宪法档执行面 = catalog 6 条 GATE.* 全部（BE.API.CONTRACT_CHECKS / BE.CHG.CONTRACT_CHANGE_CHECKS / CHG.PRECHANGE_CHECKS / NEW_ENTITY.CHECKS / WEB.API.REQUEST_CHECKS / WEB.GRID.CHECKS；2026-09-03 P-v06 批次 1 延展 NEW_ENTITY.CHECKS 入执行面）";

/** 裁定 2（判定阈值，逐字）：judging_rules 四条草稿纪律全部升为硬判据。 */
export const A3_RULING_THRESHOLDS =
  "catalog gate_def_draft.judging_rules 四条草稿纪律（counts_not_applicable_required / trust_twin / blindspot_evidence / aggregate_honesty）全部升为硬判据";

/** 裁定 3（STRICT 映射，逐字）：catalog 锚即档，无双轨。 */
export const A3_RULING_STRICT_MAPPING =
  "catalog 锚即档——catalog-lock 的 profile 锚即宪法档位词形，triage 不物化 STRICT 档，无双轨";

/** 裁定 1 执行面的 gate id 全集（与 catalog-lock entries 的 GATE.* 6 条排序对账）。 */
export const A3_RULING_GATE_IDS = [
  "GATE.BE.API.CONTRACT_CHECKS",
  "GATE.BE.CHG.CONTRACT_CHANGE_CHECKS",
  "GATE.CHG.PRECHANGE_CHECKS",
  "GATE.NEW_ENTITY.CHECKS",
  "GATE.WEB.API.REQUEST_CHECKS",
  "GATE.WEB.GRID.CHECKS",
];

/** 裁定 2 的四硬判据键（gate_def_draft.judging_rules 词形，与 6 条 gate 定义逐字同键）。 */
export const A3_GATE_JUDGING_RULE_KEYS = [
  "counts_not_applicable_required",
  "trust_twin",
  "blindspot_evidence",
  "aggregate_honesty",
];

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
  let catalogRoot = null;

  try {
    catalogRoot = kernel.resolveCatalogRoot();
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
      detail: `catalog-lock profile="${profileAnchor}"（catalog_version=${lock.catalog_version}）${anchorShaped ? "，name@version 词形锚存在——catalog 锚即档（A3 裁定 3，Owner 2026-09-01）" : "，锚缺失或词形非法"}`,
    });

    // A3 裁定 1 转正（Owner 2026-09-01）：执行面 = catalog 6 条 GATE.* 全部——
    // 由旧「>0 存在性」升为与裁定词形逐一对应的精确集合判卷。
    const subsetExact =
      gateEntryIds.length === A3_RULING_GATE_IDS.length &&
      [...gateEntryIds].sort().join(",") === [...A3_RULING_GATE_IDS].sort().join(",");
    assertions.push({
      name: "constitutional-gate-subset-anchored",
      ok: subsetExact,
      detail: subsetExact
        ? `A3 裁定 1 转正（Owner 2026-09-01）：GATE.* 执行面 = catalog 全量 6 条且与裁定词形逐一对应（${gateEntryIds.join(", ")}），全部经 lock 哈希校验在场`
        : `A3 裁定 1 失配：lock GATE.* 集合（${gateEntryIds.join(", ") || "空"}）≠ 裁定 6 条全集（${A3_RULING_GATE_IDS.join(", ")}）`,
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
  // 1b) A3 裁定 1+2 执行面：gate 判卷就绪校验（6 条全量）+ fixture 演示判卷（红绿各一）
  //     诚实边界：vNext 仓库自身无业务分母（subject 数据面）→ 执行面 = 就绪校验，
  //     每条 gate 显式 execution="not_run"（分母缺席）计入 constitutional_gate_readiness，
  //     ok 吃「6/6 就绪 + 四规则词形完整」，不吃假判卷。
  // ============================================================
  let gateReadiness = [];
  let readinessCrashed = null;
  if (catalogRoot !== null && lock !== null) {
    try {
      gateReadiness = checkGateJudgingReadiness(kernel, catalogRoot, lock);
    } catch (error) {
      readinessCrashed = error instanceof Error ? error.message : String(error);
    }
  }

  if (gateReadiness.length === A3_RULING_GATE_IDS.length) {
    const ready = gateReadiness.filter((r) => r.readiness === "ready");
    const notReady = gateReadiness.filter((r) => r.readiness !== "ready");
    // not_run 封条：披露字段的 execution 恒为 not_run（分母缺席），禁假 passed 混入。
    const noFakeJudging = gateReadiness.every((r) => r.execution === "not_run");
    assertions.push({
      name: "gate-judging-readiness-6-of-6",
      ok: ready.length === 6 && noFakeJudging,
      detail:
        ready.length === 6 && noFakeJudging
          ? `A3 裁定 1+2 执行面（Owner 2026-09-01）：6/6 gate 判卷就绪（定义在场 + lock 哈希锚 + gate_def 锚词形逐条对账）；execution 恒 not_run（分母缺席显式披露于 constitutional_gate_readiness，禁假判卷；ok 只吃就绪不吃假 verdict）`
          : `就绪 ${ready.length}/6${notReady.length > 0 ? `（未就绪：${notReady.map((r) => `${r.gate_id}[${r.problems.join("；")}]`).join("；")}）` : ""}${noFakeJudging ? "" : "；披露字段出现非 not_run 的 execution（假判卷泄漏）"}`,
    });

    const rulesOk = gateReadiness.every((r) => r.rules_complete);
    assertions.push({
      name: "gate-judging-rules-hardened-wordform",
      ok: rulesOk,
      detail: rulesOk
        ? `A3 裁定 2 转正（Owner 2026-09-01）：judging_rules 四硬判据（${A3_GATE_JUDGING_RULE_KEYS.join(" / ")}）在 6 条 gate_def_draft 中全部可解析且非空（草稿词形升硬=词形逐条校验；判卷器机制另见 gate-result-fixture-red/green）`
        : `四硬判据词形残缺：${gateReadiness
            .filter((r) => !r.rules_complete)
            .map((r) => {
              const missing = A3_GATE_JUDGING_RULE_KEYS.filter((k) => r.judging_rules[k] !== true);
              return `${r.gate_id} 缺 ${missing.join("/")}`;
            })
            .join("；")}`,
    });

    if (ready.length === 6) {
      const anchor = ready[0].anchor; // 来自 catalog 定义非硬编码（GATE.BE.API.CONTRACT_CHECKS@0.1.0）
      try {
        const fixture = runGateResultFixtures(kernel, anchor);
        assertions.push({
          name: "gate-result-fixture-green",
          ok:
            fixture.green.verdict === "passed" &&
            fixture.green.trust.recomputed.matchesAsserted === true &&
            fixture.green.gateDef === anchor,
          detail: `fixture 绿（演示判卷，非业务分母）：normalizeGateResult 以 catalog 锚 ${anchor} 归一合式载荷 → verdict=passed，trust.asserted/recomputed 孪生一致（subject TEST.* + is_fixture=true，Q3 隔离；6 条 gate 执行 verdict 仍 not_run）`,
        });
        assertions.push({
          name: "gate-result-fixture-red",
          ok: fixture.redCaughtCode === "GATE_COUNTS_INVALID",
          detail:
            fixture.redCaughtCode === "GATE_COUNTS_INVALID"
              ? `fixture 红（演示判卷，非业务分母）：counts.not_applicable 缺失 → FATAL GATE_COUNTS_INVALID（裁定 2 规则 1 counts_not_applicable_required 的判卷器机制真实执行——『为何没查』必须是数字而非沉默）`
              : `fixture 红失效：畸形载荷未被 GATE_COUNTS_INVALID 拒收（${fixture.redCaughtCode ?? "未抛错"}）——判卷器机制漂移`,
        });
      } catch (error) {
        fail(
          "gate-result-fixture-green",
          `fixture 演示判卷执行崩溃：${error instanceof Error ? error.message : String(error)}`,
        );
        fail("gate-result-fixture-red", "fixture 演示判卷执行崩溃（同因红）");
      }
    } else {
      fail(
        "gate-result-fixture-green",
        `gate 就绪未 6/6（未就绪：${notReady.map((r) => r.gate_id).join(", ") || "unknown"}）——fixture 演示判卷不假跑`,
      );
      fail(
        "gate-result-fixture-red",
        `gate 就绪未 6/6（未就绪：${notReady.map((r) => r.gate_id).join(", ") || "unknown"}）——fixture 演示判卷不假跑`,
      );
    }
  } else {
    const why =
      readinessCrashed !== null
        ? `gate 就绪校验崩溃：${readinessCrashed}`
        : `catalog 治理面不可用（catalogRoot=${catalogRoot === null ? "null" : "ok"}，lock=${lock === null ? "null" : "ok"}）——A3 裁定执行面无法校验`;
    fail("gate-judging-readiness-6-of-6", why);
    fail("gate-judging-rules-hardened-wordform", `${why}（同因红）`);
    fail("gate-result-fixture-green", `${why}——fixture 演示判卷不假跑`);
    fail("gate-result-fixture-red", `${why}——fixture 演示判卷不假跑`);
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
      "gate-judging-readiness-report",
      "gate-result-fixture-red-green",
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
    detail: `profile 值轴：constitutional 锚 catalog profile="${signatureConstitutional.profile}"，tiny="${signatureTiny.profile}"，normal="${signatureNormal.profile}"（catalog 锚即档——A3 裁定 3，Owner 2026-09-01；triage 不物化 STRICT 档，无双轨）`,
  });

  const ok = assertions.length > 0 && assertions.every((a) => a.ok);

  const entry = {
    tier: CONSTITUTIONAL_TIER,
    scenario: CONSTITUTIONAL_SCENARIO,
    expected: CONSTITUTIONAL_EXPECTED,
    /** catalog profile 锚（非 triage 档位词）。A3 裁定 3（Owner 2026-09-01）：catalog 锚
     *  即档——profile_kind 的语义自 pending 候选转为裁定记录（无双轨）。 */
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
    /** A3 裁定记录（Owner 2026-09-01，三项裁定内容逐字；原 a3_pending_items 机制移除，
     *  被裁定项已转正为参与 ok 判定的真断言，promoted_to_assertions 记映射）。 */
    a3_ruling: a3Ruling(),
    /** A3 裁定 1+2 执行面披露字段：6 条 gate 判卷就绪明细 + execution=not_run（分母缺席
     *  显式披露——ok 吃「6/6 就绪 + 四规则词形完整」，不吃假判卷）。 */
    constitutional_gate_readiness: gateReadiness,
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

/**
 * A3 裁定记录（Owner 决议 2026-09-01，按推荐全收；三项裁定内容逐字）。
 * 原 a3_pending_items（ruling="PENDING_A3"，不参与 ok）机制移除——三项均已转正为
 * 参与 ok 判定的真断言（promoted_to_assertions 记映射）：
 *   - 裁定 1（gate 子集）：执行面 = catalog 6 条 GATE.* 全部 →
 *     constitutional-gate-subset-anchored（精确集合）+ gate-judging-readiness-6-of-6；
 *   - 裁定 2（判定阈值）：judging_rules 四条草稿纪律全部升为硬判据 →
 *     gate-judging-rules-hardened-wordform + gate-result-fixture-red/green（判卷器机制演示）；
 *   - 裁定 3（STRICT 映射）：catalog 锚即档、无双轨 →
 *     profile-anchor-present + distinct-axis-profile-value。
 */
function a3Ruling() {
  return {
    ruling: A3_RULING_ID,
    source: "Owner 决议 2026-09-01（本会话 AskUserQuestion 直答，按推荐全收）",
    items: [
      {
        id: "constitutional_gate_subset_selection",
        ruling: A3_RULING_ID,
        decision: A3_RULING_GATE_SUBSET,
        promoted_to_assertions: [
          "constitutional-gate-subset-anchored",
          "gate-judging-readiness-6-of-6",
        ],
      },
      {
        id: "constitutional_gate_thresholds",
        ruling: A3_RULING_ID,
        decision: A3_RULING_THRESHOLDS,
        promoted_to_assertions: [
          "gate-judging-rules-hardened-wordform",
          "gate-result-fixture-red",
          "gate-result-fixture-green",
        ],
      },
      {
        id: "strict_profile_mapping",
        ruling: A3_RULING_ID,
        decision: A3_RULING_STRICT_MAPPING,
        promoted_to_assertions: ["profile-anchor-present", "distinct-axis-profile-value"],
      },
    ],
  };
}

/**
 * A3 裁定 1+2 执行面：逐 gate「判卷就绪校验」（Owner 决议 2026-09-01）。
 * 三要素（全过才 readiness="ready"）：
 *   1. 定义在场：lock 登记路径文件可读、JSON 可解析、id 与 lock 条目一致、
 *      gate_def_draft.anchor 呈 "<id>@semver" 词形且与 id 同源；
 *   2. lock 哈希锚：文件字节 sha256 与 lock content_sha256 一致（per-gate 对账，
 *      kernel.sha256OfUtf8 与 verifyCatalogLock 同口径）；
 *   3. judging_rules 四硬判据词形（裁定 2：草稿升硬 = 校验每条 rule 在 gate_def 中
 *      可解析且非空——四键齐、每键值为非空字符串）。
 * 诚实边界：execution 恒 "not_run"——vNext 仓库自身无业务分母（subject 数据面），
 * gate 真实判卷需在消费项目数据面上执行；not_run 显式披露（not_run_reason 随行），
 * 禁假 passed。gate 文件经 lock 登记路径读取（非 readdir 旁路）。
 */
function checkGateJudgingReadiness(kernel, catalogRoot, lock) {
  const records = [];
  for (const entry of lock.entries.filter((e) => e.id.startsWith("GATE."))) {
    const problems = [];
    let raw = null;
    let body = null;
    try {
      raw = readFileSync(path.join(catalogRoot, entry.path), "utf8");
    } catch {
      problems.push("定义文件不可读");
    }
    if (raw !== null) {
      try {
        body = JSON.parse(raw);
      } catch {
        problems.push("定义 JSON 不可解析");
      }
    }
    const anchorPattern = new RegExp(`^${entry.id.replace(/\./g, "\\.")}@[0-9]+\\.[0-9]+\\.[0-9]+$`);
    if (raw === null || body === null) {
      records.push({
        gate_id: entry.id,
        lock_path: entry.path,
        anchor: null,
        definition_present: false,
        lock_hash_anchored: false,
        anchor_wordform_ok: false,
        judging_rules: {},
        rules_complete: false,
        readiness: "not_ready",
        problems,
        execution: "not_run",
        not_run_reason:
          "分母缺席（vNext 仓库自身无业务 subject 数据面）；且定义不可读/不可解析，就绪校验失败",
      });
      continue;
    }
    if (body.id !== entry.id) problems.push(`id 失配（文件=${body.id} lock=${entry.id}）`);
    const draft =
      typeof body.gate_def_draft === "object" && body.gate_def_draft !== null
        ? body.gate_def_draft
        : null;
    const anchor = draft !== null && typeof draft.anchor === "string" ? draft.anchor : null;
    const anchorWordformOk = anchor !== null && anchorPattern.test(anchor);
    if (!anchorWordformOk) problems.push(`gate_def 锚词形非法（${String(anchor)}）`);
    const rules =
      draft !== null && typeof draft.judging_rules === "object" && draft.judging_rules !== null
        ? draft.judging_rules
        : null;
    const ruleShape = {};
    let rulesComplete = true;
    for (const key of A3_GATE_JUDGING_RULE_KEYS) {
      const value = rules !== null ? rules[key] : undefined;
      const ok = typeof value === "string" && value.trim().length > 0;
      ruleShape[key] = ok;
      if (!ok) rulesComplete = false;
    }
    if (!rulesComplete) problems.push("judging_rules 四硬判据词形残缺");
    const lockHashAnchored = kernel.sha256OfUtf8(raw) === entry.content_sha256;
    if (!lockHashAnchored) problems.push("lock 哈希失配（物料改而未重锁）");
    records.push({
      gate_id: entry.id,
      lock_path: entry.path,
      anchor,
      definition_present: true,
      lock_hash_anchored: lockHashAnchored,
      anchor_wordform_ok: anchorWordformOk,
      judging_rules: ruleShape,
      rules_complete: rulesComplete,
      readiness: problems.length === 0 ? "ready" : "not_ready",
      problems,
      execution: "not_run",
      not_run_reason:
        "分母缺席：vNext 仓库自身无业务 subject 数据面，gate 真实判卷需在消费项目数据面执行（A3 裁定执行面=就绪校验；not_run 显式披露，禁假 passed）",
    });
  }
  return records;
}

/**
 * fixture 演示判卷（红绿各一，加分量）：kernel normalizeGateResult（C1 七态判卷器）
 * 以 catalog gate_def 锚真实执行。绿 = 合式载荷（counts.not_applicable 在场 +
 * trust.asserted/recomputed 孪生一致）归一为 verdict=passed；红 = counts.not_applicable
 * 缺失 → FATAL GATE_COUNTS_INVALID（裁定 2 规则 1 counts_not_applicable_required 的
 * 判卷器机制）。纯函数零落盘；subject TEST.* + is_fixture=true（Q3 fixture 隔离），
 * 不冒充业务分母判卷——6 条 gate 的执行 verdict 仍为 not_run。
 */
function runGateResultFixtures(kernel, anchor) {
  const claimedBy = { actorType: "tool", actor: "benchmarks:constitutional", selfAttested: true };
  const context = {
    ranAtSeq: 0,
    trigger: "on_demand",
    tool: "benchmarks:constitutional",
    toolVersion: "0.1.0",
    metricDialect: "bench:fixture_gate_payload",
  };
  const basePayload = {
    grn: "GRN-9001",
    gate: "BE_API_CONTRACT_CHECKS",
    gate_def: anchor,
    verdict: "passed",
    subject_id: "TEST.GATE_FIXTURE",
    is_fixture: true,
    counts: { scanned: 3, applicable_scanned: 3, violations: 0, not_applicable: 0 },
    trust: { asserted: { violations: 0 }, recomputed: { violations: 0 } },
  };
  const green = kernel.normalizeGateResult({ value: basePayload, claimedBy }, context);
  let redCaught = null;
  try {
    kernel.normalizeGateResult(
      {
        value: {
          ...basePayload,
          grn: "GRN-9002",
          counts: { scanned: 3, applicable_scanned: 3, violations: 0 }, // not_applicable 缺失
        },
        claimedBy,
      },
      context,
    );
  } catch (error) {
    redCaught = error;
  }
  return { green, redCaughtCode: redCaught !== null ? redCaught.code : null };
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
    a3_ruling: null,
    constitutional_gate_readiness: null,
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
      `[constitutional] surface=${entry.surface} profile=${entry.profile} gates=${entry.catalog?.gate_entry_ids.length ?? 0} a3_ruling=${entry.a3_ruling?.ruling ?? "none"} readiness=${Array.isArray(entry.constitutional_gate_readiness) ? entry.constitutional_gate_readiness.filter((r) => r.readiness === "ready").length : 0}/6 durationMs=${entry.durationMs} → ${entry.ok ? "PASS" : "FAIL"}${entry.error ? ` (${entry.error})` : ""}`,
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
