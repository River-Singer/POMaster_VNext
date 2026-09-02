/**
 * analyzer-contract.ts —— Analyzer Output Contract 判卷 + 盲区四态映射
 * （P-v06 批次 0 Model Constitution；PRD v0.6 §148-149 + §1.2/§103）。
 *
 * 出处锚：
 * - PRD v0.6 §148 Analyzer Output Contract 逐字：每个 Analyzer 不只返回发现对象，
 *   还必须返回 scanned_scope / objects_resolved / relations_resolved /
 *   unsupported_constructs / unresolved_constructs / parse_failures / confidence /
 *   source_sha——「避免『只返回成功项』造成假绿」。本模块是该契约的**判卷构造面**
 *   （kernel analyze-only 纪律 spec-analyzer.ts 先例：导出面无写函数 / 零写 IO）。
 * - PRD v0.6 §149 Blind Spot Report 四态（SUPPORTED_AND_OBSERVED /
 *   SUPPORTED_NOT_FOUND / UNSUPPORTED / FAILED_TO_OBSERVE）：本仓**不新增词轴**
 *   （Owner 裁决 D-1~D-4 批次裁定：现有机制已承载）——四态是 PRD 词形的文档镜像
 *   （SELF_IMPROVEMENT_SIGNAL_PRD_LABELS 一词二形成文收编先例），规范存储位是
 *   既有 perception 词面：OBSERVED / NEGATIVE_OBSERVATION_VALUES 七值。
 *   核心不变量（§149 逐字「禁止把 FAILED_TO_OBSERVE 当成『不存在』」）：
 *   FAILED_TO_OBSERVE 恒归盲区位（unchecked_in_blindspot_estimated 同型），
 *   绝不入 absence 位（03 FROZEN 盲区证据链纪律）。
 * - PRD v0.6 §1.2 Derived Facts / §103 Analyzer Catalog：analyzer 产出的是派生事实
 *   （边经 relations.ts 登记、对象经既有 ingest 面）——本模块零写 IO、纯判卷。
 *
 * 词表纪律：confidence 复用 relation_confidence 三值（deterministic/probable/
 * declared，vocab-lock software_graph_vocab PR-0006）；词形轴唯一来源
 * @pomaster/schemas vocab.ts，本文件不发明词值。PRD_BLINDSPOT_STATES 四值是
 * PRD §149 原文词形的文档镜像位（非本仓词表轴——禁入判卷枚举）。
 */
import { NEGATIVE_OBSERVATION_VALUES, type NegativeObservationValue } from "./perception.js";
import { GovernanceError } from "./errors.js";
import type { RelationConfidenceValue } from "./vocab.js";

// ============================================================
// Analyzer Output Contract（§148 判卷构造）
// ============================================================

/** Analyzer 自报词形（ANALYZER.<DOMAIN>.<KIND>；PRD v0.6 §103 Catalog 词形族）。 */
export const ANALYZER_ID_PATTERN = /^ANALYZER\.[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]+)*$/;

/** 源快照锚词形（sha256:<64hex>；01 definitions.sha256_digest 同法）。 */
export const SOURCE_SHA_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Analyzer 报告（§148 八字段必答；camelCase 输入 / snake_case 呈现由消费方落盘面
 * 决定——本模块只判卷不落盘）。
 */
export interface AnalyzerReportInput {
  /** ANALYZER.* 自报词形（§103 Catalog 词形族）。 */
  readonly analyzer: string;
  /** 扫描范围（非空——「扫了什么」必答）。 */
  readonly scannedScope: string;
  readonly objectsResolved: number;
  readonly relationsResolved: number;
  /** 支持面之外的显式声明（合法缺席——不算失败，§149 UNSUPPORTED 侧）。 */
  readonly unsupportedConstructs?: readonly string[];
  /** 支持面内未解析构造（§149 FAILED_TO_OBSERVE 候选——确定性宣称杀手）。 */
  readonly unresolvedConstructs?: readonly string[];
  /** 解析失败清单（确定性宣称杀手）。 */
  readonly parseFailures?: readonly string[];
  /** 置信级（复用 relation_confidence 三值）。 */
  readonly confidence: string;
  /** 源快照锚（sha256:<64hex>——结论对哪个源快照成立，必答）。 */
  readonly sourceSha: string;
}

/** 归一后的报告（readonly 冻结形态）。 */
export interface AnalyzerReport {
  readonly analyzer: string;
  readonly scanned_scope: string;
  readonly objects_resolved: number;
  readonly relations_resolved: number;
  readonly unsupported_constructs: readonly string[];
  readonly unresolved_constructs: readonly string[];
  readonly parse_failures: readonly string[];
  readonly confidence: RelationConfidenceValue;
  readonly source_sha: string;
}

/**
 * Analyzer Output Contract 判卷（§148 八字段必答 + 三条反假绿不变式）：
 * ① 八字段全必答（缺席=SCHEMA_INVALID——「只返回成功项」结构性写不出合法报告）；
 * ② 确定性宣称杀手：parse_failures 或 unresolved_constructs 非空 ⇒ confidence 禁
 *    deterministic（宣称确定却带失败清单 = 假绿洗白）；unsupported_constructs 是
 *    声明面缺席（支持面之外显式声明），不禁 deterministic；
 * ③ source_sha 必须过 sha256 词形（结论对哪个源快照成立——Graph Rebuild §132
 *    可重复性的锚位）。
 * 纯判卷零写 IO（analyze-only 封条：spec-analyzer.ts 四落法同族）。
 */
export function normalizeAnalyzerReport(input: AnalyzerReportInput): AnalyzerReport {
  const analyzer = (input.analyzer ?? "").trim();
  if (!ANALYZER_ID_PATTERN.test(analyzer)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `analyzer 词形非法：${analyzer}（须 ANALYZER.<DOMAIN>.<KIND>——PRD §103 Catalog 词形族）`,
      "analyzer 自报词形是产出者身份位；自由文本不是身份",
      { analyzer },
    );
  }
  const scannedScope = (input.scannedScope ?? "").trim();
  if (scannedScope.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "scannedScope 为空（「扫了什么」必答——§148 避免只返回成功项的假绿）",
      "给出扫描范围（目录 glob / 文件清单锚 / 分母引用）",
      {},
    );
  }
  for (const [field, value] of [
    ["objectsResolved", input.objectsResolved],
    ["relationsResolved", input.relationsResolved],
  ] as const) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `${field} 非法（须非负整数）`,
        "§148 计数位必答（0 是合法值——零命中显式呈现不缺席）",
        { [field]: value },
      );
    }
  }
  const unsupported = stringListOf(input.unsupportedConstructs, "unsupportedConstructs");
  const unresolved = stringListOf(input.unresolvedConstructs, "unresolvedConstructs");
  const parseFailures = stringListOf(input.parseFailures, "parseFailures");
  const confidence = normalizeConfidence(input.confidence);
  if (
    confidence === "deterministic" &&
    (parseFailures.length > 0 || unresolved.length > 0)
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `confidence=deterministic 却携带 parse_failures(${parseFailures.length})/unresolved_constructs(${unresolved.length})（确定性宣称与失败清单并存 = 假绿洗白，§148）`,
      "降级 confidence=probable 并披露不确定性；或修复解析失败后再宣称确定",
      { analyzer, parse_failures: parseFailures.length, unresolved: unresolved.length },
    );
  }
  const sourceSha = (input.sourceSha ?? "").trim();
  if (!SOURCE_SHA_PATTERN.test(sourceSha)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `source_sha 词形非法（须 sha256:<64hex>——结论对哪个源快照成立的锚位，§148/§132）`,
      "源快照锚由基础设施计算（D24：人类禁触哈希）；缺锚的报告不可入账",
      { analyzer, source_sha: sourceSha.slice(0, 24) },
    );
  }
  return {
    analyzer,
    scanned_scope: scannedScope,
    objects_resolved: input.objectsResolved,
    relations_resolved: input.relationsResolved,
    unsupported_constructs: unsupported,
    unresolved_constructs: unresolved,
    parse_failures: parseFailures,
    confidence,
    source_sha: sourceSha,
  };
}

// ============================================================
// 盲区四态映射（§149；不新增词——PRD 词形文档镜像 + 规范位归既有 perception 词面）
// ============================================================

/** PRD §149 四态原文词形（文档镜像位——SELF_IMPROVEMENT_SIGNAL_PRD_LABELS 一词二形先例；禁入判卷枚举）。 */
export const PRD_BLINDSPOT_STATES = [
  "SUPPORTED_AND_OBSERVED",
  "SUPPORTED_NOT_FOUND",
  "UNSUPPORTED",
  "FAILED_TO_OBSERVE",
] as const;
export type PrdBlindSpotState = (typeof PRD_BLINDSPOT_STATES)[number];

/** 「已观察」规范呈现位（perception 正观察面；OBSERVED 必须 ≥1 artifact_refs 封条归 perception 侧）。 */
export const BLINDSPOT_CANONICAL_OBSERVED = "OBSERVED" as const;

/** 四态 → 规范存储位映射表（canonical 值 ⊆ OBSERVED ∪ NEGATIVE_OBSERVATION_VALUES——零新词）。 */
export const PRD_BLINDSPOT_STATE_MAPPING: Readonly<
  Record<PrdBlindSpotState, readonly (typeof BLINDSPOT_CANONICAL_OBSERVED | NegativeObservationValue)[]>
> = {
  SUPPORTED_AND_OBSERVED: ["OBSERVED"],
  // 「没看到≠不存在」：OBSERVED_ABSENT 有严格四前提（perception.ts OBSERVED_ABSENT 封条）。
  SUPPORTED_NOT_FOUND: ["OBSERVED_ABSENT"],
  UNSUPPORTED: ["NOT_OBSERVABLE", "SENSOR_UNAVAILABLE", "PERMISSION_DENIED", "ENVIRONMENT_INVALID"],
  FAILED_TO_OBSERVE: ["PROBE_FAILED", "INCONCLUSIVE"],
} as const satisfies Readonly<
  Record<PrdBlindSpotState, readonly (typeof BLINDSPOT_CANONICAL_OBSERVED | NegativeObservationValue)[]>
>;

/** 装载期自检（零新词不变式）：映射表 canonical 位必须 ⊆ OBSERVED ∪ NEGATIVE_OBSERVATION_VALUES——漂移立即 FATAL。 */
for (const state of PRD_BLINDSPOT_STATES) {
  for (const canonical of PRD_BLINDSPOT_STATE_MAPPING[state]) {
    if (canonical === BLINDSPOT_CANONICAL_OBSERVED) continue;
    if (!NEGATIVE_OBSERVATION_VALUES.includes(canonical)) {
      throw new Error(
        `PRD_BLINDSPOT_STATE_MAPPING[${state}] canonical「${canonical}」不在既有 perception 词面（零新词不变式被破坏——禁止发明盲区词值）`,
      );
    }
  }
}

/** 单次观察尝试（分母封闭计算输入）。 */
export interface BlindSpotAttempt {
  readonly input: string;
  readonly prd_state: PrdBlindSpotState;
}

/** 盲区分母封闭四态分账（computeLinkageCoverage 同型：observed+absent+unsupported+blindspot=total）。 */
export interface BlindSpotPartition {
  readonly total: number;
  readonly observed: number;
  readonly absent: number;
  readonly unsupported: number;
  /** FAILED_TO_OBSERVE 桶——恒入盲区位，绝不折算 absence（§149 逐字禁令）。 */
  readonly blindspot: number;
  readonly coverage_ratio: number;
  readonly zero_denominator: boolean;
  /** 盲区数显式呈现（03 GateCounts.uncheckedInBlindspotEstimated 同名键位语义）。 */
  readonly unchecked_in_blindspot_estimated: number;
}

/**
 * 四态分账（§149 不变量的结构性落点）：FAILED_TO_OBSERVE 恒入 blindspot 位——
 * 分母封闭（observed+absent+unsupported+blindspot=total）下它不可能被并进 absent；
 * 零分母 → coverage 0 + zero_denominator=true（零分母禁当满分，P26 封死同款）。
 * 词表外四态词形一律 SCHEMA_INVALID（禁静默归桶）。
 */
export function partitionBlindSpotAttempts(
  attempts: readonly BlindSpotAttempt[],
): BlindSpotPartition {
  let observed = 0;
  let absent = 0;
  let unsupported = 0;
  let blindspot = 0;
  for (const attempt of attempts) {
    switch (attempt.prd_state) {
      case "SUPPORTED_AND_OBSERVED":
        observed += 1;
        break;
      case "SUPPORTED_NOT_FOUND":
        absent += 1;
        break;
      case "UNSUPPORTED":
        unsupported += 1;
        break;
      case "FAILED_TO_OBSERVE":
        blindspot += 1;
        break;
      default:
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `盲区四态词形非法：${String(attempt.prd_state)}（PRD §149 四态文档镜像位）`,
          `合法词形：${PRD_BLINDSPOT_STATES.join(" / ")}`,
          { input: attempt.input },
        );
    }
  }
  const total = attempts.length;
  return {
    total,
    observed,
    absent,
    unsupported,
    blindspot,
    coverage_ratio: total > 0 ? observed / total : 0,
    zero_denominator: total === 0,
    unchecked_in_blindspot_estimated: blindspot,
  };
}

// ============================================================
// 内部共享
// ============================================================

function normalizeConfidence(value: string): RelationConfidenceValue {
  const trimmed = (value ?? "").trim();
  if (trimmed === "deterministic" || trimmed === "probable" || trimmed === "declared") {
    return trimmed;
  }
  throw new GovernanceError(
    "SCHEMA_INVALID",
    `confidence 词表外：${value}（software_graph_vocab.relation_confidence 三值闭包，PR-0006）`,
    "合法词形：deterministic | probable | declared",
    { confidence: value },
  );
}

function stringListOf(
  value: readonly string[] | undefined,
  field: string,
): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 非数组（§148 必答位：空数组是合法值，缺位不是）`,
      "给数组（可为空）；缺席=「只返回成功项」假绿通道",
      { field },
    );
  }
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `${field} 存在空/非字符串条目`,
        "每条披露位须为非空词形（构造锚 / 位置锚）",
        { field },
      );
    }
  }
  return value;
}
