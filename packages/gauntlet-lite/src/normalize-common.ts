/**
 * normalize-common.ts —— 各 gate adapter 的 normalize 共享件（判卷闸门 + 缺席记录构造）。
 *
 * 抽取动机（G5 谱系扩展）：BUILD（vitest/pytest 双腿）/ CONTRACT / ARCHITECTURE /
 * BROWSER 四 adapter 共用同一套 FATAL 闸门（grn 词形 / ranAtSeq 非负 / declaredVerdict
 * 七态词表 / Q3 fixture 双向耦合）与同一种「缺席显式记录」形态（counts 显式全零、
 * trust.asserted=null、blindspot 0/0/0）——判卷纪律只许有一份实现，四份拷贝必然漂移。
 *
 * 纪律锚（与 adapter-types.ts 同源）：
 * - C1：缺席必须显式表达（counts 全零是显式零，不是省略）；
 * - C5：declaredVerdict 词表内值也不采信（闸门只做词表校验与留痕，判卷一律重算）；
 * - A4：ranAtSeq 由编排层单调供给，禁墙钟（performance.now 只进 durationMs——
 *   03 的 digest 排除字段，允许机器实测，永不参与身份）；
 * - D24：本文件不计算任何 sha（digest 只住读侧，无人工算 sha 路径）。
 */
import type { DenominatorRefRow, GateResult } from "@pomaster/kernel";
import { VERDICT_VALUES } from "@pomaster/schemas";
import type { VerdictValue } from "@pomaster/schemas";
import type {
  GateDenominatorRefInput,
  GateNormalizeError,
  GateResultRecord,
  NormalizeContext,
} from "./adapter-types.js";
import { GateNormalizeError as GateNormalizeErrorCtor } from "./adapter-types.js";

export const GRN_PATTERN = /^GRN-[0-9]+$/;

/** 归一失败的统一出口（FATAL 无 WARNING 档；报错带路标：message 必含 hint）。 */
export function fail(
  reason: GateNormalizeError["reason"],
  detail: string,
  hint: string,
): never {
  throw new GateNormalizeErrorCtor(reason, detail, hint);
}

/** GovernedId 边界收窄用的最小计划字段（GatePlan 与三个新 adapter 的计划形态的结构子集）。 */
export interface RecordPlanFields {
  readonly grn: string;
  readonly gate: string;
  readonly gateDef: string;
  readonly ranAtSeq: number;
  readonly subjectId: string | null;
  readonly denominatorRefs: readonly GateDenominatorRefInput[];
  readonly tool: string;
  readonly toolVersion: string;
  readonly metricDialect: string;
}

export function toDenominatorRow(ref: GateDenominatorRefInput): DenominatorRefRow {
  return { id: ref.id as DenominatorRefRow["id"], versionSeen: ref.versionSeen };
}

/**
 * normalize 入口共用的 FATAL 闸门（四查，顺序与报错语义与 BUILD adapter 原实现逐字一致）：
 * 1) grn 词形（GRN-[0-9]+，evidence/runs/ 身份字段）；
 * 2) ranAtSeq 非负整数（A4：禁墙钟倒灌）；
 * 3) declaredVerdict 七态词表（C5：词表外 FATAL；词表内也不采信）；
 * 4) Q3 fixture 双向耦合（subjectId 前缀 TEST.* ⇔ isFixture=true）。
 */
export function assertCommonGates(
  plan: Pick<RecordPlanFields, "grn" | "ranAtSeq" | "subjectId">,
  context: NormalizeContext,
): void {
  if (!GRN_PATTERN.test(plan.grn)) {
    fail(
      "grn_format",
      `grn=${plan.grn} 不满足 ^GRN-[0-9]+$`,
      "GRN 由编排层按 evidence/runs/ 词形分配（03-gate-result definitions.grn_id）",
    );
  }
  if (!Number.isInteger(plan.ranAtSeq) || plan.ranAtSeq < 0) {
    fail(
      "ran_at_seq_invalid",
      `ranAtSeq=${String(plan.ranAtSeq)} 非非负整数`,
      "A4：新鲜度用单调 seq，禁墙钟时间（ranAtSeq 由 store 事务供给）",
    );
  }
  if (
    context.declaredVerdict !== undefined &&
    context.declaredVerdict !== null &&
    !VERDICT_VALUES.includes(
      context.declaredVerdict as (typeof VERDICT_VALUES)[number],
    )
  ) {
    fail(
      "verdict_out_of_vocab",
      `declaredVerdict="${context.declaredVerdict}" 不在七态词表`,
      `七态 = ${VERDICT_VALUES.join(" / ")}（@pomaster/schemas VERDICT_VALUES）；扩值走词汇表 PR（TODO(vocab-pr)），禁止就地添加`,
    );
  }
  const subjectIsFixture =
    plan.subjectId !== null && plan.subjectId.startsWith("TEST.");
  const declaredFixture = context.isFixture ?? false;
  // Q3 双向强校验：subjectId 前缀 TEST.* ⇔ isFixture=true。
  if (subjectIsFixture !== declaredFixture) {
    fail(
      "fixture_flag_mismatch",
      `subjectId=${String(plan.subjectId)} 与 isFixture=${String(declaredFixture)} 违反 Q3 双向耦合`,
      "subjectId 前缀 TEST.* 当且仅当 isFixture=true（vocab-lock prefixes_v0 TEST. 注记）；生产对象冒充 fixture 与 fixture 混入生产账本双向封死",
    );
  }
}

/**
 * 缺席/终局性记录构造（verdict=not_run / not_configured 等非绿非红态共用）。
 * counts 显式全零 + blindspot 0/0/0 + trust.asserted=null——「显式零」而非省略（C1）；
 * scopeNote 可选携带缺席理由与安装/配置指引（03 scope.note，schema 合法位），
 * 报错带路标纪律：缺席记录必须说清「为何没查、去哪补」。
 */
export function absenceRecord(
  plan: RecordPlanFields,
  verdict: Extract<VerdictValue, "not_run" | "not_configured">,
  scopeNote: string | null,
  selfMs: number,
  externalMs: number,
): GateResultRecord {
  const base: GateResult = {
    grn: plan.grn,
    gate: plan.gate,
    gateDef: plan.gateDef,
    ranAtSeq: plan.ranAtSeq,
    verdict,
    verdictCapReason: null,
    subjectId:
      plan.subjectId === null ? null : (plan.subjectId as GateResult["subjectId"]),
    isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
    denominatorRefs: plan.denominatorRefs.map((ref) => toDenominatorRow(ref)),
    counts: { scanned: 0, applicableScanned: 0, violations: 0, notApplicable: 0 },
    blindspot: { scanned: 0, produced: 0, escapeRatio: 0 },
    trust: {
      asserted: null,
      recomputed: { violations: 0, matchesAsserted: true },
    },
    durationMs: { self: selfMs, external: externalMs },
  };
  return {
    ...base,
    tool: plan.tool,
    toolVersion: plan.toolVersion,
    metricDialect: plan.metricDialect,
    ...(scopeNote === null ? {} : { scopeNote }),
  };
}

/**
 * 03 items[] 违规明细的截断预算（x-budget：单 GateResult ≤8KB 粗上限；
 * 100 条后截断并置 itemsTruncated=true 留痕——完整明细按 gate_def 溢出策略归档）。
 */
export const MAX_RESULT_ITEMS = 100;

/** 截断并标记（输入假设已按确定性顺序排序——调用方不得用墙钟/随机序）。 */
export function capItems<T>(
  items: readonly T[],
): { items: readonly T[]; itemsTruncated: boolean } {
  return items.length > MAX_RESULT_ITEMS
    ? { items: items.slice(0, MAX_RESULT_ITEMS), itemsTruncated: true }
    : { items, itemsTruncated: false };
}
