/**
 * gate-result.ts —— 门禁结果归一（八拍⑤ VERIFY；C1 七态判卷）。
 *
 * C1 纪律：报绿的治理工具比没有工具更危险——七态 verdict + counts.notApplicable
 * 必填（「多少对象与本规则无关」必须是数字而不是沉默）+ asserted/recomputed 孪生
 * （永不信任自报值，失配本身是一级信号）。A8：GateResult 是运行产物，只住
 * evidence/runs/，永不入 truth-index。
 */
import { GovernanceError } from "./errors.js";
import { GovernedIdParseError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import type {
  Actor,
  Claimed,
  GateCounts,
  GateResult,
  GateRunContext,
  GovernedId,
} from "./index.js";
import {
  RUN_TRIGGER_VALUES,
  VERDICT_VALUES,
  type RunTriggerValue,
  type VerdictValue,
} from "./vocab.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 依次取第一个非 undefined 的键（同时兼容 snake_case 与 camelCase 的 CLAIMED 载荷）。 */
function pick(value: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (value[key] !== undefined) return value[key];
  }
  return undefined;
}

function asFiniteNonNegativeNumber(
  value: unknown,
): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function requireCount(
  value: unknown,
  field: string,
  hint: string,
): number {
  const parsed = asFiniteNonNegativeNumber(value);
  if (parsed === null) {
    throw new GovernanceError(
      "GATE_COUNTS_INVALID",
      `counts.${field} 缺失或非法（须为 ≥0 的有限数字）`,
      hint,
      { field, received: value },
    );
  }
  return parsed;
}

/**
 * 把工具/Agent 的 CLAIMED 输出归一为 03-gate-result 形态。语义（docs/kernel-api.md §6）：
 * - verdict 词表外值 → FATAL（VERDICT_VALUES 七态）；
 * - counts.notApplicable 缺失/NaN → FATAL（缺席必须显式表达，禁止静默跳过当通过）；
 * - verdict=skipped_blindspot 而 counts.unchecked_in_blindspot_estimated 缺失 → FATAL
 *   （03 schema：「skipped_blindspot 判定必须附证据」；四态纪律的机器防线）；
 * - subjectId 前缀 TEST.* ⇔ isFixture=true 双向强校验（Q3）；
 * - trust.asserted 保留为 CLAIMED（永不单独判卷）；recomputed 是判卷唯一依据；
 *   失配 → mismatch.detected=true（默认 recomputed_wins_recorded）且 passed 自动
 *   降级 warning 并留 verdictCapReason（C1「报绿的机器自我怀疑」机械化落点）；
 * - 本函数只做归一与显式化，永不阻断写入（gate 阻断语义由 closeout 编排层按 verdict 施加）。
 */
export function normalizeGateResult(
  raw: Claimed<unknown>,
  context: GateRunContext,
): GateResult {
  assertRunContext(context);
  if (!isRecord(raw.value)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "CLAIMED 载荷不是对象（GateResult 归一要求 object 形态）",
      "工具输出须为 03-gate-result 形状的对象；纯文本/数组请先在工具侧结构化",
      { receivedType: typeof raw.value },
    );
  }
  const value = raw.value;

  // —— grn（evidence/runs/ 身份字段，调用方必须提供） ——
  const grnRaw = pick(value, "grn");
  if (typeof grnRaw !== "string" || !/^GRN-[0-9]+$/.test(grnRaw)) {
    throw new GovernanceError(
      "GRN_INVALID",
      `grn 缺失或词形非法（须 GRN-[0-9]+）：${String(grnRaw)}`,
      "GRN id 由 GateRunner/调用方分配并落盘 evidence/runs/GRN-*.json；不要让 gate 工具自造格式",
      { grn: grnRaw },
    );
  }

  // —— verdict 七态（词表纪律：词表外值 FATAL） ——
  const verdictRaw = pick(value, "verdict");
  if (
    typeof verdictRaw !== "string" ||
    !VERDICT_VALUES.includes(verdictRaw as VerdictValue)
  ) {
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `verdict "${String(verdictRaw)}" 是词表外值`,
      `七态词表 VERDICT_VALUES：${VERDICT_VALUES.join(" / ")}；扩值必须走词汇表 PR，禁止就地添加`,
      { verdict: verdictRaw },
    );
  }
  let verdict = verdictRaw as VerdictValue;

  // —— gate / gateDef ——
  const gateRaw = pick(value, "gate");
  if (typeof gateRaw !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(gateRaw)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `gate 名缺失或非法（SCREAMING_SNAKE）：${String(gateRaw)}`,
      "gate 名须先在 gate_def 版本化登记（POLICY.GATE.<NAME>@semver 锚），再以登记名运行",
      { gate: gateRaw },
    );
  }
  const gateDefRaw = pick(value, "gate_def", "gateDef");
  if (
    typeof gateDefRaw !== "string" ||
    !/^[A-Z][A-Z0-9_.]+@[0-9]+\.[0-9]+\.[0-9]+$/.test(gateDefRaw)
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `gate_def 缺失或非法（定义 id@semver）：${String(gateDefRaw)}`,
      "gate_def 锚（如 POLICY.GATE.CONTENT_TRUTH@1.4.0）钉死口径，防门禁语义静默漂移",
      { gateDef: gateDefRaw },
    );
  }

  // —— counts：notApplicable 必填（C1 硬性） ——
  const countsRaw = pick(value, "counts");
  if (!isRecord(countsRaw)) {
    throw new GovernanceError(
      "GATE_COUNTS_INVALID",
      "counts 缺失或不是对象",
      "七态判卷的计数块必填：scanned / applicableScanned / violations / notApplicable（「23 处为何不算」必须是数字而不是沉默）",
      {},
    );
  }
  const countsOptionals: Record<string, number> = {};
  const suppressed = asFiniteNonNegativeNumber(
    pick(countsRaw, "suppressed_by_ledger", "suppressedByLedger"),
  );
  if (suppressed !== null) {
    countsOptionals.suppressedByLedger = suppressed;
  }
  const unchecked = asFiniteNonNegativeNumber(
    pick(countsRaw, "unchecked_in_blindspot_estimated", "uncheckedInBlindspotEstimated"),
  );
  if (unchecked !== null) {
    countsOptionals.uncheckedInBlindspotEstimated = unchecked;
  }
  const failedRecompute = asFiniteNonNegativeNumber(
    pick(countsRaw, "declarations_failed_recompute", "declarationsFailedRecompute"),
  );
  if (failedRecompute !== null) {
    countsOptionals.declarationsFailedRecompute = failedRecompute;
  }
  const counts: GateCounts = {
    scanned: requireCount(
      pick(countsRaw, "scanned"),
      "scanned",
      "扫描足迹（寻获载体/对象总数）必填且 ≥0",
    ),
    applicableScanned: requireCount(
      pick(countsRaw, "applicable_scanned", "applicableScanned"),
      "applicableScanned",
      "适用本 gate 规则的数量必填且 ≥0",
    ),
    violations: requireCount(
      pick(countsRaw, "violations"),
      "violations",
      "违规数必填且 ≥0（与 trust.recomputed.violations 同源）",
    ),
    notApplicable: requireCount(
      pick(countsRaw, "not_applicable", "notApplicable"),
      "notApplicable",
      "C1 硬性必填：「多少对象与本规则无关」必须是数字而不是沉默；NaN/省略均 FATAL",
    ),
    ...countsOptionals,
  };

  // —— 四态纪律：skipped_blindspot 必附盲区指标 ——
  // 03-gate-result verdict 注记（FROZEN）：「skipped_blindspot 判定必须附证据」。
  // 无指标的盲区跳过 = 「静默跳过当通过」的七态词形变体：对抗性 CLAIMED 载荷可借这个
  // 诚实词形把「什么都没查」洗成显式缺席态，聚合层无从分辨真盲区声明与空头声明。
  // 缺席必须显式表达（与 notApplicable 必填同一条 C1 线）→ FATAL。
  if (
    verdict === "skipped_blindspot" &&
    countsOptionals.uncheckedInBlindspotEstimated === undefined
  ) {
    throw new GovernanceError(
      "GATE_COUNTS_INVALID",
      `verdict=skipped_blindspot 但 counts.unchecked_in_blindspot_estimated 缺失（盲区指标必附）：${JSON.stringify(countsRaw)}`,
      "skipped_blindspot 判定必须附盲区证据：估计未检数（counts.unchecked_in_blindspot_estimated），或 gate_def 声明的 fixture_regression 证据引用；无指标的盲区跳过视为畸形 CLAIMED 载荷",
      { verdict, counts: countsRaw },
    );
  }

  // —— subjectId + Q3 fixture 隔离（双向强校验） ——
  const subjectRaw = pick(value, "subject_id", "subjectId");
  let subjectId: GovernedId | null = null;
  if (subjectRaw !== undefined && subjectRaw !== null && subjectRaw !== "") {
    if (typeof subjectRaw !== "string") {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "subject_id 必须是字符串（governed id 或 null）",
        "受检对象 id 须满足 closed-world 文法（parseGovernedId）",
        { subjectId: subjectRaw },
      );
    }
    try {
      parseGovernedId(subjectRaw);
      subjectId = subjectRaw as GovernedId;
    } catch (error) {
      if (error instanceof GovernedIdParseError) throw error;
      throw error;
    }
  }
  const isFixtureRaw = pick(value, "is_fixture", "isFixture");
  const isFixture = typeof isFixtureRaw === "boolean" ? isFixtureRaw : false;
  const subjectIsFixture = subjectId !== null && subjectId.startsWith("TEST.");
  if (subjectIsFixture !== isFixture) {
    throw new GovernanceError(
      "FIXTURE_ISOLATION_VIOLATION",
      `Q3 双向强校验失败：subjectId=${String(subjectId)} isFixture=${String(isFixture)}`,
      "subjectId 前缀 TEST.* ⇔ isFixture=true 必须同真同假；生产账本按 TEST. 前缀过滤 fixture 记录（防生产对象冒充 fixture，也防 fixture 混入生产）",
      { subjectId, isFixture },
    );
  }

  // —— denominatorRefs（C2：钉 (id, version_seen)） ——
  const denominatorRefList: { id: GovernedId; versionSeen: number }[] = [];
  const denomRaw = pick(value, "denominator_refs", "denominatorRefs");
  if (denomRaw !== undefined && denomRaw !== null) {
    if (!Array.isArray(denomRaw)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "denominator_refs 必须是数组（空数组=本 gate 无分母的显式诚实声明）",
        "C2：gate 结论必须绑定所用分母的 id+version_seen；没有分母就显式给 []",
        {},
      );
    }
    for (const entry of denomRaw) {
      if (!isRecord(entry)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          "denominator_refs 条目必须是 {id, version_seen} 对象",
          "C2 分母引用形态见 03-gate-result definitions.denominator_ref",
          { entry },
        );
      }
      const idRaw = pick(entry, "id");
      const versionRaw = pick(entry, "version_seen", "versionSeen");
      if (typeof idRaw !== "string") {
        throw new GovernanceError("SCHEMA_INVALID", "denominator_refs[].id 必须是字符串", "分母 id 形态 DENOMINATOR.<SCOPE>", { entry });
      }
      const version = asFiniteNonNegativeNumber(versionRaw);
      if (version === null || version < 1) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `denominator_refs[].version_seen 必须是 ≥1 整数：${String(versionRaw)}`,
          "分母版本从 1 起（05-denominator version minimum 1）；缺版本即未钉版本的悬空引用",
          { entry },
        );
      }
      parseGovernedId(idRaw); // closed-world 校验（未知前缀 FATAL）
      denominatorRefList.push({ id: idRaw as GovernedId, versionSeen: version });
    }
  }

  // —— blindspot（缺省诚实派生；produced>scanned = 扫描器自相矛盾 FATAL） ——
  const blindspotRaw = pick(value, "blindspot");
  const blindspotSource = isRecord(blindspotRaw) ? blindspotRaw : {};
  const scanned = asFiniteNonNegativeNumber(pick(blindspotSource, "scanned")) ?? counts.scanned;
  const produced = asFiniteNonNegativeNumber(pick(blindspotSource, "produced")) ?? counts.applicableScanned;
  if (produced > scanned) {
    throw new GovernanceError(
      "GATE_COUNTS_INVALID",
      `blindspot.produced(${produced}) > blindspot.scanned(${scanned})——扫描器自相矛盾`,
      "produced ≤ scanned 是扫描型 gate 的结构不变量（03 blindspot 注记）；检查扫描器统计口径",
      { scanned, produced },
    );
  }
  const escapeRaw = asFiniteNonNegativeNumber(pick(blindspotSource, "escape_ratio", "escapeRatio"));
  const escapeRatio =
    escapeRaw !== null && escapeRaw <= 1
      ? escapeRaw
      : scanned > 0
        ? Math.max(0, (scanned - produced) / scanned)
        : 0;

  // —— trust：asserted=CLAIMED（永不单独判卷）/ recomputed=判卷唯一依据 ——
  const trustRaw = pick(value, "trust");
  const trustSource = isRecord(trustRaw) ? trustRaw : {};
  const assertedRaw = pick(trustSource, "asserted");
  let assertedViolations: number | null = null;
  if (isRecord(assertedRaw)) {
    assertedViolations = asFiniteNonNegativeNumber(pick(assertedRaw, "violations"));
  }
  if (assertedViolations === null) {
    // 载荷顶层 violations 视为自报（工具最薄形态）。
    assertedViolations = asFiniteNonNegativeNumber(pick(value, "violations"));
  }
  const asserted: Claimed<{ readonly violations: number }> | null =
    assertedViolations === null
      ? null
      : { value: { violations: assertedViolations }, claimedBy: raw.claimedBy };

  const recomputedRaw = isRecord(pick(trustSource, "recomputed"))
    ? (pick(trustSource, "recomputed") as UnknownRecord)
    : undefined;
  let recomputedViolations =
    recomputedRaw !== undefined
      ? asFiniteNonNegativeNumber(pick(recomputedRaw, "violations"))
      : null;
  if (recomputedViolations === null) {
    // CLAIMED 载荷未携带独立重算块：v0 kernel 无法自行重算（GateRunner 层职责）。
    // 显式回退序：扫描计数块 violations（工具对现实的实测计数）→ 镜像 asserted。
    // 不伪造失配、也不伪造「已独立重算」——回退序在此显式声明（TODO: GateRunner
    // 接入独立重算后删除镜像回退）。
    const scanViolations = asFiniteNonNegativeNumber(pick(value, "violations"));
    if (scanViolations !== null) {
      recomputedViolations = scanViolations;
    } else if (asserted !== null) {
      recomputedViolations = asserted.value.violations;
    } else {
      recomputedViolations = counts.violations;
    }
  }
  const matchesAsserted =
    asserted === null ? true : recomputedViolations === asserted.value.violations;
  const mismatchDetected = !matchesAsserted;
  let capReason: string | null = null;
  const capRaw = pick(value, "verdict_cap_reason", "verdictCapReason");
  if (typeof capRaw === "string" && capRaw.length > 0) capReason = capRaw;
  if (mismatchDetected) {
    if (verdict === "passed") {
      // C1 verdict_cap：passed 不得踩在失配的自报结论上——自动降级 warning 并留原因码。
      verdict = "warning";
      capReason = capReason ?? "declare_recompute_mismatch";
    }
    if (capReason === null) {
      capReason = "declare_recompute_mismatch";
    }
  }
  const mismatchActionRaw = isRecord(pick(trustSource, "mismatch"))
    ? pick(pick(trustSource, "mismatch") as UnknownRecord, "action")
    : undefined;
  const mismatchAction =
    mismatchActionRaw === "escalate_to_authority"
      ? "escalate_to_authority"
      : "recomputed_wins_recorded";

  // —— duration（C6 双轨 primary 机器实测；不进 digest） ——
  const durationRaw = pick(value, "duration_ms", "durationMs");
  const durationSource = isRecord(durationRaw) ? durationRaw : {};
  const durationMs = {
    self: asFiniteNonNegativeNumber(pick(durationSource, "self")) ?? 0,
    external: asFiniteNonNegativeNumber(pick(durationSource, "external")) ?? 0,
  };

  return {
    grn: grnRaw,
    gate: gateRaw,
    gateDef: gateDefRaw,
    ranAtSeq: context.ranAtSeq,
    verdict,
    verdictCapReason: capReason,
    subjectId,
    isFixture,
    denominatorRefs: denominatorRefList,
    counts,
    blindspot: { scanned, produced, escapeRatio },
    trust: {
      asserted,
      recomputed: { violations: recomputedViolations, matchesAsserted },
      ...(mismatchDetected
        ? {
            mismatch: {
              detected: true,
              action: mismatchAction,
            },
          }
        : {}),
    },
    durationMs,
  };
}

function assertRunContext(context: GateRunContext): void {
  if (!Number.isInteger(context.ranAtSeq) || context.ranAtSeq < 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `ranAtSeq 须为 ≥0 整数（A4 单调事件序号）：${String(context.ranAtSeq)}`,
      "ran_at_seq 由 kernel 事务分配（禁墙钟）；GateRunner 从 store.currentSeq 取值",
      { ranAtSeq: context.ranAtSeq },
    );
  }
  if (typeof context.tool !== "string" || context.tool.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "context.tool 缺失（执行工具标识）",
      "03-gate-result.tool 必填（如 gauntlet:ui_text_scanner）",
      {},
    );
  }
  if (
    typeof context.toolVersion !== "string" ||
    !/^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$/.test(context.toolVersion)
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `context.toolVersion 须为 semver：${String(context.toolVersion)}`,
      "工具版本钉死口径（C6 Overhead 双轨归因依赖版本可辨识）",
      { toolVersion: context.toolVersion },
    );
  }
  if (!RUN_TRIGGER_VALUES.includes(context.trigger as RunTriggerValue)) {
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `trigger "${String(context.trigger)}" 是词表外值`,
      `run_trigger 词表：${RUN_TRIGGER_VALUES.join(" / ")}（扩值须同步 Kernel GateRunner）`,
      { trigger: context.trigger },
    );
  }
}

// ============================================================
// 落盘映射（store.record_gate_run 用）：GateResult(camel) → 03/07 run 文件(snake)
// ============================================================

/** GateResult → 03-gate-result 的 snake_case 形态（inline 内嵌进 07 run_record）。 */
export function gateResultToSnake(result: GateResult): UnknownRecord {
  const snake: UnknownRecord = {
    grn: result.grn,
    gate: result.gate,
    gate_def: result.gateDef,
    ran_at_seq: result.ranAtSeq,
    verdict: result.verdict,
    verdict_cap_reason: result.verdictCapReason,
    subject_id: result.subjectId,
    is_fixture: result.isFixture,
    denominator_refs: result.denominatorRefs.map((ref) => ({
      id: ref.id,
      version_seen: ref.versionSeen,
    })),
    counts: {
      scanned: result.counts.scanned,
      applicable_scanned: result.counts.applicableScanned,
      violations: result.counts.violations,
      not_applicable: result.counts.notApplicable,
      ...(result.counts.suppressedByLedger !== undefined
        ? { suppressed_by_ledger: result.counts.suppressedByLedger }
        : {}),
      ...(result.counts.uncheckedInBlindspotEstimated !== undefined
        ? { unchecked_in_blindspot_estimated: result.counts.uncheckedInBlindspotEstimated }
        : {}),
      ...(result.counts.declarationsFailedRecompute !== undefined
        ? { declarations_failed_recompute: result.counts.declarationsFailedRecompute }
        : {}),
    },
    blindspot: {
      scanned: result.blindspot.scanned,
      produced: result.blindspot.produced,
      escape_ratio: result.blindspot.escapeRatio,
    },
    trust: {
      asserted:
        result.trust.asserted === null
          ? null
          : {
              violations: result.trust.asserted.value.violations,
              declared_by: actorToSnake(result.trust.asserted.claimedBy),
            },
      recomputed: {
        violations: result.trust.recomputed.violations,
        matches_asserted: result.trust.recomputed.matchesAsserted,
      },
      ...(result.trust.mismatch !== undefined
        ? {
            mismatch: {
              detected: result.trust.mismatch.detected,
              action: result.trust.mismatch.action,
            },
          }
        : {}),
    },
    duration_ms: {
      self: result.durationMs.self,
      external: result.durationMs.external,
    },
    // 03 亦要求 tool/tool_version/metric_dialect/ran_at_utc：kernel GateResult v0
    // 契约不承载（GateRunner/gauntlet-lite 层职责）；此处诚实缺席而非伪造，
    // 由 evidence 侧车补充（TODO: GateRunner 接线后落全字段）。
  };
  return snake;
}

function actorToSnake(actor: Actor): UnknownRecord {
  return {
    actor_type: actor.actorType,
    actor: actor.actor,
    self_attested: actor.selfAttested,
  };
}

export { gateResultToSnake as gateResultToFileShape };
