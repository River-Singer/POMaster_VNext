/**
 * decision-graph.ts —— Grounded Decision Graph 纯函数面（v0.5.3 P0.5 · VB-PR1）。
 *
 * PRD 出处（v0.5.3 逐字锚）：
 * - §5.2 Decision Node 最小形态：十键节点（decision_id/class/prompt/depends_on/affects/
 *   grounding 七 refs+conflicts+missing_facts/options/recommendation/authority/resolution）；
 * - §5.3/§12 反幻觉：LLM Prior 可以生成问题，不能生成项目现实——无 Ref 事实必须保持
 *   Hypothesis/Unknown 形态（G4），Recommendation 必带 basis_refs/tradeoff/uncertainty（G7），
 *   INFERENCE 必须显式披露（§12.2），CONFLICT 禁自行挑答案（§12.3），INFERENCE 不升 Fact（§12.4）；
 * - §6 Grounding Gate：G1-G8 逐检查 → 五值派生 verdict（READY_FOR_DECISION/NEEDS_DERIVATION/
 *   NEEDS_RESEARCH/CONFLICT_REVIEW/INSUFFICIENT_GROUNDING）——**派生判定，不进 Canonical
 *   Object State Axis，也不落盘**（§6.2 逐字）；
 * - §7.3 Decision Frontier：prerequisites 已满足且有资格被处理的 Decision 集合——动态计算
 *   不落盘（§16 禁 frontier.json）；
 * - §9.1/§9.3/§9.4 Research Request：九键词形 + mode 复用 RESEARCH_MODE_VALUES 六模式 +
 *   §9.4 Request Gate（来源不足 + 可被证据回答在本函数判；影响当前决策/成本合算由调用方
 *   申报并以 G-Gate verdict=NEEDS_RESEARCH 为前置凭证）；
 * - §10.1/§10.2 Research Handoff：finding 带 request_refs/decision_refs/relation 六值回填
 *   decision graph（research_finding_refs 增量、missing_facts 消解、CONTRADICTS_PREMISE →
 *   conflict 披露面）；relation 六值与 RESEARCH_AUTHORITY_EFFECT_VALUES 划界注记见
 *   DECISION_RELATION_VALUES（Owner 裁决9③）；
 * - §13.2/§14 resolveDecision：ACCEPT/CHANGE/UNKNOWN/DEFER 四词形；UNKNOWN 六问重分类
 *   （复用 09 blocker_triage 八问语义的六问子集——只有 No/No/No/No/No/Yes 才是真正 Blocker，
 *   且按 09 纪律只产 BLOCKER_CANDIDATE，升级 HARD_BLOCKER 必须走 09 八问升级通路）；
 * - §15 Discovery Sufficiency Gate：停止条件不是「所有 Decision 都 RESOLVED」，而是当前
 *   Increment 不存在尚未处理且会显著改变的维度 + 残留均有合法分类；判据面复用 09
 *   msd_assessment 三轴 + msd_reached（promotion_basis=msd_reached 的机器判据面）。
 *
 * 词形纪律（Owner 裁决9②③，词表三镜像不动——VB-A 独立批）：
 * - DECISION./RESEARCH.REQ./FINDING./DISCOVERY.INTENT./FACT. 是 **Discovery 平面局部词形**
 *   （state_plane_refs 先例：PERMIT/POB/AGX 同族），不入 GOVERNED_ID_PREFIXES、不过
 *   parseGovernedId，校验=本模块词形正则 + 图内存在性；TODO(vocab-pr) 待独立词汇表批收编；
 * - CONTRACT.* 是 PRD §5.2 示意词形（现词表无此前缀——实测张力随裁决9② 定案按示意处理），
 *   truth_refs/contract_refs 等外部引用槽按宽松词形（存在性对账归 Truth 对账面，P1）；
 * - 禁词 GRILLING/GRILLED/GRILL_CONFIRMED（§1.1 不新增 State Axis）以负例登记（09 号
 *   forbidden_wordforms 先例）：不得出现在 decision_id/class/options 词形位。
 *
 * 纪律：
 * - 纯函数零 IO 不 throw——非法输入一律显式 outcome 拒绝（fail-closed，对齐
 *   discovery-chain/question-gate 判卷风格）；同输入重放深度相等（无墙钟 A4：一切事件序
 *   靠调用方供给的 seq，本模块零 Date/零随机）；
 * - graph_fingerprint 由本模块自动维护（sha256OfCanonical，D24：human_touch forbidden /
 *   write_blocking:false / read_only_service）；
 * - 零写入通道：本模块不落盘——decision-graph.json 的读写归 CLI 命令面（PR-2 起），
 *   提升仍走 promote→maintain（§21 禁绕过）；
 * - invalidateDependentDecisions（§7.4 Upstream Change Invalidation）留 P1：
 *   TODO(v053-p1)——P0.5 frontier 对上游非 ACCEPT/CHANGE resolution 的下游一律保守排除。
 */
import { canonicalJson, sha256OfCanonical } from "./digest.js";
import {
  RESEARCH_EVIDENCE_LEVEL_VALUES,
  RESEARCH_MODE_VALUES,
  type ResearchEvidenceLevelValue,
  type ResearchModeValue,
} from "./vocab.js";

// ============================================================
// 词形常量（Discovery 平面局部词形 + 派生词轴；TODO(vocab-pr) 独立批收编）
// ============================================================

/**
 * 禁词负例（PRD §1.1 逐字：不新增 State Axis——Grill 过程词不得变成状态词形）。
 * 09-msd-uncertainty definitions.unknown_classification x-pomaster-vocab.forbidden_wordforms
 * 同款登记位；kernel 侧在词形位（decision_id/class/options）机器拒绝。
 */
export const DECISION_GRAPH_FORBIDDEN_WORDFORMS = [
  "GRILLING",
  "GRILLED",
  "GRILL_CONFIRMED",
] as const;

/** decision_id / depends_on 词形（Discovery 平面局部，非 governed——DECISION.D017，PRD §5.2）。 */
export const DECISION_ID_PATTERN = /^DECISION\.[A-Z][A-Z0-9_]{0,31}(\.[0-9]+)?$/;

/** research_request id 词形（RESEARCH.REQ.017，PRD §9.1）。 */
export const RESEARCH_REQUEST_ID_PATTERN = /^RESEARCH\.REQ\.[0-9]+$/;

/** finding id 词形（FINDING.R017.1，PRD §10.2 key_findings）。 */
export const FINDING_ID_PATTERN = /^FINDING\.R[0-9]+\.[0-9]+$/;

/** intent 引用词形（DISCOVERY.INTENT.001，PRD §5.2 grounding.intent_refs）。 */
export const DISCOVERY_INTENT_REF_PATTERN = /^DISCOVERY\.INTENT\.[0-9]+$/;

/** 缺失事实词形（FACT.CROSS_MODEL.MATCHING_SEMANTICS，PRD §5.2 missing_facts）。 */
export const MISSING_FACT_REF_PATTERN =
  /^FACT\.[A-Z][A-Z0-9_]{0,31}(\.[A-Z][A-Z0-9_]{0,31}){0,3}$/;

/**
 * decision class 闭包（Owner 裁决9②：SCOPE 单值起步——schema 冻结 + pending_vocab_pr；
 * 扩值走词汇表 PR，禁止实现侧私扩）。x-vocab-source: PRD v0.5.3 §5.2 示例词形。
 */
export const DECISION_CLASS_VALUES = ["SCOPE"] as const;
export type DecisionClassValue = (typeof DECISION_CLASS_VALUES)[number];

/**
 * Grounding Verdict 五值（PRD §6.2 逐字）。**派生判定不落盘**（§6.2：不进入 Canonical
 * Object State Axis）——本词轴仅 kernel 常量承载，schema 18 无 verdict 字段。
 */
export const GROUNDING_VERDICT_VALUES = [
  "READY_FOR_DECISION",
  "NEEDS_DERIVATION",
  "NEEDS_RESEARCH",
  "CONFLICT_REVIEW",
  "INSUFFICIENT_GROUNDING",
] as const;
export type GroundingVerdict = (typeof GROUNDING_VERDICT_VALUES)[number];

/**
 * finding↔decision relation 六值（PRD §10.1 闭包逐字）。
 * 划界注记（Owner 裁决9③）：relation 管「finding 对某个 Decision 的证据关系」；
 * RESEARCH_AUTHORITY_EFFECT_VALUES（NONE/SUPPORTS/CONFLICTS，10 号 schema）管「finding
 * 对既有 Authority 的效应」——两轴值域不相交、语义近邻，并存禁互填。
 */
export const DECISION_RELATION_VALUES = [
  "RESOLVES_FACT",
  "SUPPORTS_OPTION",
  "WEAKENS_OPTION",
  "CONTRADICTS_PREMISE",
  "NO_DECISION_EFFECT",
  "INSUFFICIENT_EVIDENCE",
] as const;
export type DecisionRelationValue = (typeof DECISION_RELATION_VALUES)[number];

/** Human 答面四词形（PRD §13.2 逐字：ACCEPT/CHANGE/UNKNOWN/DEFER）。 */
export const DECISION_ANSWER_VALUES = ["ACCEPT", "CHANGE", "UNKNOWN", "DEFER"] as const;
export type DecisionAnswer = (typeof DECISION_ANSWER_VALUES)[number];

/**
 * Recommendation source 披露位（PRD §12.2：如果只有模型经验，Recommendation Source =
 * INFERENCE 必须明确披露；不得说「根据项目现状建议」却没有任何项目引用）。
 * PROJECT_GROUNDED = basis_refs 全部携带 Ref。TODO(vocab-pr)。
 */
export const RECOMMENDATION_SOURCE_VALUES = ["PROJECT_GROUNDED", "INFERENCE"] as const;
export type RecommendationSourceValue = (typeof RECOMMENDATION_SOURCE_VALUES)[number];

/**
 * G2 检索面词形（PRD §6.1 G2「Current Truth / Docs / Repo / Evidence」逐字四面）。
 * 刻意不含 KNOWLEDGE——§83.2 铁律：Knowledge 是 ADVISORY 策展源，永不进 gate 判卷输入。
 */
export const GROUNDING_SURFACE_VALUES = [
  "CURRENT_TRUTH",
  "DOCS",
  "REPO",
  "EVIDENCE",
] as const;
export type GroundingSurfaceValue = (typeof GROUNDING_SURFACE_VALUES)[number];

/**
 * G6 缺失事实路由词形（PRD §6.1 G6：缺少的是事实时，标为 Derivable / Researchable，
 * 而不是直接 Ask Human——ASK_HUMAN 刻意不在本轴：事实型问题禁止问 Human，PRD §8 逐字）。
 * 词源复用 Question Gate 分类（DERIVABLE/RESEARCHABLE）。TODO(vocab-pr)。
 */
export const MISSING_FACT_ROUTE_VALUES = ["DERIVABLE", "RESEARCHABLE"] as const;
export type MissingFactRouteValue = (typeof MISSING_FACT_ROUTE_VALUES)[number];

/**
 * UNKNOWN 重分类处置词形（§14 六问重分类的输出；词源复用：DERIVABLE/RESEARCHABLE =
 * Question Gate 分类，ASSUMPTION/DEFERRED_DECISION/DISCOVERY_REQUIRED/BLOCKER_CANDIDATE
 * = MSD 十分类子集——零新分类词，四克制）。
 */
export const UNKNOWN_DISPOSITION_VALUES = [
  "DERIVABLE",
  "RESEARCHABLE",
  "ASSUMPTION",
  "DEFERRED_DECISION",
  "DISCOVERY_REQUIRED",
  "BLOCKER_CANDIDATE",
] as const;
export type UnknownDisposition = (typeof UNKNOWN_DISPOSITION_VALUES)[number];

/**
 * §15 Sufficiency 显著改变维度（任务口径八维：Goal/Scope/Behavior/Authority/Acceptance/
 * Critical Contract/Architecture Boundary/Irreversible）。诚实注记：PRD §15 原文还有第九维
 * Critical Failure Behavior——其 class 词形映射待词表批扩容后并入（当前 class 闭包仅 SCOPE，
 * 无法表达该维），不悄悄吞并也不悄悄丢弃，随 deferred 项呈报。
 */
export const SUFFICIENCY_DIMENSIONS = [
  "GOAL",
  "SCOPE",
  "BEHAVIOR",
  "AUTHORITY",
  "ACCEPTANCE",
  "CRITICAL_CONTRACT",
  "ARCHITECTURE_BOUNDARY",
  "IRREVERSIBLE",
] as const;
export type SufficiencyDimension = (typeof SUFFICIENCY_DIMENSIONS)[number];

/**
 * class → 显著改变维度映射（研究口径：九维「显著改变」由 decision class 词形承载，
 * Owner 裁决9②）。当前闭包只有 SCOPE；未映射 class 一律保守按显著处理（fail-closed）。
 */
export const DECISION_CLASS_TO_DIMENSIONS: Readonly<
  Record<DecisionClassValue, readonly SufficiencyDimension[]>
> = {
  SCOPE: ["SCOPE"],
};

/**
 * §15 残留合法分类（PRD §15：其余可以合法存在为 Assumption / Deferred Decision /
 * Future Consideration / Known Unknown）。词源复用 MSD 十分类子集（SOFT_UNCERTAINTY 承载
 * Known Unknown 语义——不发明新词）；零墙钟、零新轴。
 */
export const SUFFICIENCY_RESIDUAL_CLASSIFICATIONS = [
  "ASSUMPTION",
  "DEFERRED_DECISION",
  "FUTURE_CONSIDERATION",
  "SOFT_UNCERTAINTY",
] as const;
export type SufficiencyResidualClassification =
  (typeof SUFFICIENCY_RESIDUAL_CLASSIFICATIONS)[number];

/**
 * §9.3 Research Mode 自动路由（Decision Gap → mode 推荐表；mode 词形复用
 * RESEARCH_MODE_VALUES 六模式——零新轴）。Human 可以覆盖推荐，但**不得因为「更全面」
 * 默认 MIXED**（§9.3 逐字）——无 gap 类型且无显式 mode 时显式拒绝，绝不发明缺省。
 */
export const RESEARCH_MODE_ROUTE_HINTS: Readonly<
  Record<string, ResearchModeValue>
> = {
  CURRENT_REALITY: "INTERNAL",
  EXTERNAL_CAPABILITY: "EXTERNAL",
  REALITY_VS_PRACTICE: "MIXED",
  OPTION_COMPARISON: "COMPARATIVE",
  BLAST_RADIUS: "IMPACT",
  ROOT_CAUSE: "FORENSIC",
};
export type ResearchModeRouteHint = keyof typeof RESEARCH_MODE_ROUTE_HINTS;

/** 宽松引用词形（truth_refs/contract_refs/architecture_refs/implementation_refs/evidence_refs/knowledge_refs/affects/basis_refs/known_context_refs 共用；冒号放行 URI 形证据引用如 repo://…）。 */
const LOOSE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/:]*$/;

/** option 词形（INCLUDE_CURRENT_INCREMENT / DEFER，PRD §5.2 options）。 */
const OPTION_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/** authority.owner 词形（对齐 owner_registry SCREAMING_SNAKE 风格；存在性对账归消费面）。 */
const AUTHORITY_OWNER_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

/** graph_fingerprint 词形（sha256:64hex，01 definitions.sha256_digest 同族）。 */
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

// ============================================================
// 类型（§5.2 十键节点 + §9.1 request + §10.2 handoff）
// ============================================================

/** §12.3 冲突披露条目（CONFLICT_REVIEW 素材面：矛盾陈述 + 冲突各方引用 ≥2）。 */
export interface DecisionConflictEntry {
  readonly statement: string;
  readonly refs: readonly string[];
}

/** §5.2 grounding 十键（七 refs + conflicts + missing_facts；全部显式——空数组合法，缺席非法）。 */
export interface DecisionGrounding {
  readonly intent_refs: readonly string[];
  readonly truth_refs: readonly string[];
  readonly contract_refs: readonly string[];
  readonly architecture_refs: readonly string[];
  readonly implementation_refs: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly knowledge_refs: readonly string[];
  readonly research_finding_refs: readonly string[];
  readonly conflicts: readonly DecisionConflictEntry[];
  readonly missing_facts: readonly string[];
}

/** §5.2/§12.2 recommendation（option/basis_refs/rationale/tradeoff/uncertainty/source 六字段全必填）。 */
export interface DecisionRecommendation {
  readonly option: string;
  readonly basis_refs: readonly string[];
  readonly rationale: string;
  readonly tradeoff: string;
  readonly uncertainty: string;
  readonly source: RecommendationSourceValue;
}

/** §5.2 authority（owner 词形对齐 owner_registry；存在性对账归 authority.json 消费面）。 */
export interface DecisionAuthority {
  readonly owner: string;
}

/** §5.2 resolution（null = OPEN；UNKNOWN 携带 §14 重分类处置；seq = 调用方事件拍，零墙钟）。 */
export interface DecisionResolution {
  readonly answer: DecisionAnswer;
  readonly value?: string;
  readonly classified?: UnknownDisposition;
  readonly seq?: number;
}

/** §5.2 十键节点（十键全必填——一次锁全，schema 18 同构）。 */
export interface DecisionNode {
  readonly decision_id: string;
  readonly class: DecisionClassValue;
  readonly prompt: string;
  readonly depends_on: readonly string[];
  readonly affects: readonly string[];
  readonly grounding: DecisionGrounding;
  readonly options: readonly string[];
  readonly recommendation: DecisionRecommendation | null;
  readonly authority: DecisionAuthority;
  readonly resolution: DecisionResolution | null;
}

/** §5/§16 Decision Graph（scratchpad 平面 sidecar；request_refs 仅为同步标记——正式 requests 住 research/index.yaml）。 */
export interface DecisionGraph {
  /** kernel 自动维护的图指纹（sha256OfCanonical({projection_fingerprint, decisions, request_refs})；D24：human_touch forbidden / write_blocking:false）。 */
  readonly graph_fingerprint: string;
  /** §4.3 Projection Fingerprint 引用（build 时存入，重建保真透传；P0.5 只存，P1 消费 STALE_GROUNDING）。 */
  readonly projection_fingerprint?: string;
  readonly decisions: readonly DecisionNode[];
  readonly request_refs: readonly string[];
}

/** graph_fingerprint 的唯一计算点（D24：人类禁算哈希——本模块是自动维护面）。 */
function fingerprintOf(
  projectionFingerprint: string | undefined,
  decisions: readonly DecisionNode[],
  requestRefs: readonly string[],
): string {
  return sha256OfCanonical({
    projection_fingerprint: projectionFingerprint ?? null,
    decisions,
    request_refs: [...requestRefs],
  });
}

/** buildDecisionGraph 的候选节点输入（LLM 草稿词形；resolution 不得随 build 进入——图以全 OPEN 起步）。 */
export interface DecisionNodeCandidate {
  readonly decision_id: string;
  readonly class: string;
  readonly prompt: string;
  readonly depends_on: readonly string[];
  readonly affects: readonly string[];
  readonly grounding: DecisionGrounding;
  readonly options: readonly string[];
  readonly recommendation: DecisionRecommendation | null;
  readonly authority: DecisionAuthority;
}

export interface BuildDecisionGraphOptions {
  /** §4.3 Projection Fingerprint 引用（sha256:… 词形；P0.5 只存，P1 消费 STALE_GROUNDING）。 */
  readonly projectionFingerprint?: string;
  /** 已在 research/index.yaml 落档的 request id 同步标记（词形 RESEARCH.REQ.*）。 */
  readonly requestRefs?: readonly string[];
}

export type BuildDecisionGraphRejectReason =
  | "empty_candidates"
  /** 候选形态畸形（非对象 / 数组位异形 / grounding 或 recommendation 非对象）——G8：按契约显式 outcome 拒绝，禁裸 TypeError。 */
  | "candidate_malformed"
  | "decision_id_invalid"
  | "forbidden_wordform"
  | "duplicate_decision_id"
  | "class_unknown"
  | "prompt_empty"
  | "depends_on_invalid"
  | "depends_on_dangling"
  | "dependency_cycle"
  | "options_invalid"
  | "grounding_invalid"
  | "recommendation_invalid"
  | "authority_invalid"
  | "resolution_not_allowed_at_build"
  | "fingerprint_invalid"
  | "request_ref_invalid";

export type BuildDecisionGraphOutcome =
  | {
      readonly ok: true;
      readonly graph: DecisionGraph;
      readonly notes: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: BuildDecisionGraphRejectReason;
      readonly details: readonly string[];
      readonly hint: string;
    };

// ============================================================
// buildDecisionGraph（§5.2 + §16：环/悬空/词表外/反幻觉形态 fail-closed）
// ============================================================

function isPlainNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLooseRef(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && LOOSE_REF_PATTERN.test(value);
}

function hitsForbiddenWordform(value: string): string | null {
  for (const word of DECISION_GRAPH_FORBIDDEN_WORDFORMS) {
    if (value === word || value.includes(word)) return word;
  }
  return null;
}

/**
 * 校验单个候选节点（build 内部；类型化拒绝原因——不做关键字反推）。
 * 形状防线（G8）：本模块契约是「纯函数零 IO 不 throw——非法输入一律显式 outcome
 * 拒绝」，畸形候选（候选非对象 / depends_on·affects·options 非数组 / grounding
 * 或 recommendation 非 null 非对象 / 十键槽位缺席后仍跑逐项循环）一律折叠为
 * candidate_malformed（或归位既有 reason），禁裸 TypeError 通道。
 */
type CandidateValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: BuildDecisionGraphRejectReason; readonly details: readonly string[] };

function validateCandidate(candidate: DecisionNodeCandidate): CandidateValidation {
  const details: string[] = [];
  let ok = true;
  let reason: BuildDecisionGraphRejectReason = "decision_id_invalid";
  const setReason = (next: BuildDecisionGraphRejectReason): void => {
    // 首个失败类优先（报告主原因稳定：按 G1→…→词形序声明）。
    if (ok) reason = next;
    ok = false;
  };
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return {
      ok: false,
      reason: "candidate_malformed",
      details: [`候选不是对象（${String(candidate)}）——§5.2 十键节点须为对象形态`],
    };
  }
  if (typeof candidate.decision_id !== "string" || !DECISION_ID_PATTERN.test(candidate.decision_id)) {
    setReason("decision_id_invalid");
    details.push(
      `decision_id "${String(candidate.decision_id)}" 不匹配 DECISION.<SEGMENT>[.SEQ] 词形（Discovery 平面局部词形，非 governed 前缀——state_plane_refs 先例）`,
    );
  } else {
    const forbidden = hitsForbiddenWordform(candidate.decision_id);
    if (forbidden !== null) {
      setReason("forbidden_wordform");
      details.push(`decision_id 含禁词 ${forbidden}（§1.1 不新增 State Axis；禁词负例登记，09 号 forbidden_wordforms 先例）`);
    }
  }
  const forbiddenClass =
    typeof candidate.class === "string" ? hitsForbiddenWordform(candidate.class) : null;
  if (forbiddenClass !== null) {
    // 禁词诊断优先于词表外诊断（GRILLING 等禁词不在闭包内，但语义诊断更具体）。
    setReason("forbidden_wordform");
    details.push(`class 含禁词 ${forbiddenClass}（§1.1 不新增 State Axis）`);
  }
  if (!(DECISION_CLASS_VALUES as readonly string[]).includes(candidate.class)) {
    setReason("class_unknown");
    details.push(
      `class "${String(candidate.class)}" 不在 decision class 闭包（${DECISION_CLASS_VALUES.join("/")}；Owner 裁决9② SCOPE 单值起步——扩值走词汇表 PR，禁止实现侧私扩）`,
    );
  }
  if (!isPlainNonEmptyString(candidate.prompt)) {
    setReason("prompt_empty");
    details.push("prompt 必须是非空字符串（空泛占位不是可判定问题）");
  }
  if (!Array.isArray(candidate.depends_on)) {
    setReason("candidate_malformed");
    details.push(`depends_on 须为数组（§5.2 十键形态；得到 ${typeof candidate.depends_on}）`);
  } else {
    for (const dep of candidate.depends_on) {
      if (typeof dep !== "string" || !DECISION_ID_PATTERN.test(dep)) {
        setReason("depends_on_invalid");
        details.push(`depends_on 条目 "${String(dep)}" 不是 DECISION.* 词形`);
      }
    }
  }
  if (!Array.isArray(candidate.affects)) {
    setReason("candidate_malformed");
    details.push(`affects 须为数组（§5.2 十键形态；得到 ${typeof candidate.affects}）`);
  } else {
    for (const affect of candidate.affects) {
      if (!isLooseRef(affect)) {
        setReason("grounding_invalid");
        details.push(`affects 条目 "${String(affect)}" 不是合法宽松引用词形`);
      }
    }
  }
  // option 去重集（recommendation.option ∈ options 校验共用；options 异形时恒空——
  // recommendation 校验随之如实报 recommendation_invalid，不 crash）。
  const seenOptions = new Set<string>();
  if (!Array.isArray(candidate.options)) {
    setReason("candidate_malformed");
    details.push(`options 须为数组（§5.2 十键形态；得到 ${typeof candidate.options}）`);
  } else if (candidate.options.length === 0) {
    setReason("options_invalid");
    details.push("options 不得为空（§5.2：决策节点至少携带候选选项；零选项节点不可判卷）");
  } else {
    for (const option of candidate.options) {
      if (typeof option !== "string" || !OPTION_PATTERN.test(option)) {
        setReason("options_invalid");
        details.push(`option "${String(option)}" 不匹配大写词形 ^[A-Z][A-Z0-9_]{0,63}$`);
        continue;
      }
      const forbidden = hitsForbiddenWordform(option);
      if (forbidden !== null) {
        setReason("forbidden_wordform");
        details.push(`option 含禁词 ${forbidden}（Grill 过程词不得变成 State Axis 词形，§1.1）`);
      }
      if (seenOptions.has(option)) {
        setReason("options_invalid");
        details.push(`option "${option}" 重复`);
      }
      seenOptions.add(option);
    }
  }
  // —— grounding 十键全显式校验（空数组合法，缺席非法——C1 显式缺席纪律） ——
  const grounding = candidate.grounding;
  const tenKeySlots: readonly (keyof DecisionGrounding)[] = [
    "intent_refs",
    "truth_refs",
    "contract_refs",
    "architecture_refs",
    "implementation_refs",
    "evidence_refs",
    "knowledge_refs",
    "research_finding_refs",
    "conflicts",
    "missing_facts",
  ];
  // 形状防线（G8）：grounding 非 null 非对象 → candidate_malformed 并跳过全部十键
  // 循环；单个槽位缺席/异形 → grounding_invalid 且跳过该槽位的逐项循环（禁裸 TypeError）。
  const groundingUsable =
    typeof grounding === "object" && grounding !== null && !Array.isArray(grounding);
  if (!groundingUsable) {
    setReason("candidate_malformed");
    details.push(
      `grounding 须为十键对象（§5.2 十键一次锁全；得到 ${Array.isArray(grounding) ? "array" : typeof grounding}）`,
    );
  } else {
    for (const slot of tenKeySlots) {
      if (!Array.isArray(grounding[slot])) {
        setReason("grounding_invalid");
        details.push(`grounding.${slot} 缺席或非数组（§5.2 十键一次锁全：空数组合法，缺席非法）`);
      }
    }
    if (Array.isArray(grounding.intent_refs)) {
      for (const intent of grounding.intent_refs) {
        if (typeof intent !== "string" || !DISCOVERY_INTENT_REF_PATTERN.test(intent)) {
          setReason("grounding_invalid");
          details.push(`grounding.intent_refs 条目 "${String(intent)}" 不是 DISCOVERY.INTENT.<n> 词形（G1 Intent Anchor 的判卷输入）`);
        }
      }
    }
    for (const slot of ["truth_refs", "contract_refs", "architecture_refs", "implementation_refs", "evidence_refs", "knowledge_refs"] as const) {
      if (!Array.isArray(grounding[slot])) continue; // 异形槽位已在十键检查报 grounding_invalid
      for (const ref of grounding[slot] as readonly unknown[]) {
        if (!isLooseRef(ref)) {
          setReason("grounding_invalid");
          details.push(
            `grounding.${slot} 引用 "${String(ref)}" 不是合法宽松引用词形（非空、字母/数字开头、不含空白；CONTRACT.* 等 PRD 示意词形按宽松词形放行）`,
          );
        }
      }
    }
    if (Array.isArray(grounding.research_finding_refs)) {
      for (const findingRef of grounding.research_finding_refs) {
        if (typeof findingRef !== "string" || !FINDING_ID_PATTERN.test(findingRef)) {
          setReason("grounding_invalid");
          details.push(`grounding.research_finding_refs 条目 "${String(findingRef)}" 不是 FINDING.R<n>.<n> 词形`);
        }
      }
    }
    if (Array.isArray(grounding.missing_facts)) {
      for (const fact of grounding.missing_facts) {
        if (typeof fact !== "string" || !MISSING_FACT_REF_PATTERN.test(fact)) {
          setReason("grounding_invalid");
          details.push(`grounding.missing_facts 条目 "${String(fact)}" 不是 FACT.* 词形（缺失事实必须保持 Hypothesis/Unknown 形态，§5.3/§12.1）`);
        }
      }
    }
    if (Array.isArray(grounding.conflicts)) {
      for (const conflict of grounding.conflicts) {
        const entry = conflict as Partial<DecisionConflictEntry>;
        if (
          typeof entry !== "object" ||
          entry === null ||
          !isPlainNonEmptyString(entry.statement) ||
          !Array.isArray(entry.refs) ||
          entry.refs.length < 2 ||
          !entry.refs.every((ref) => isLooseRef(ref))
        ) {
          setReason("grounding_invalid");
          details.push(
            `grounding.conflicts 条目非法（须 { statement 非空, refs ≥2 个宽松引用 }——矛盾至少两方，单引用构不成冲突；§12.3 Contradiction Must Be Surfaced）`,
          );
        }
      }
    }
  }
  // —— recommendation 形态（§12.2 六字段；语义判卷归 G-Gate，此处锁形态） ——
  // 形状防线（G8）：非 null 且非对象 → candidate_malformed（禁 rec.option 解引用裸崩）。
  if (candidate.recommendation !== null && candidate.recommendation !== undefined &&
      (typeof candidate.recommendation !== "object" || Array.isArray(candidate.recommendation))) {
    setReason("candidate_malformed");
    details.push(
      `recommendation 须为六字段对象或 null（§5.2/§12.2；得到 ${Array.isArray(candidate.recommendation) ? "array" : typeof candidate.recommendation}）`,
    );
  } else if (candidate.recommendation !== null) {
    const rec = candidate.recommendation;
    if (!seenOptions.has(rec.option)) {
      setReason("recommendation_invalid");
      details.push(`recommendation.option "${String(rec.option)}" 不在本节点 options 内（推荐只能是已列候选之一）`);
    }
    if (!Array.isArray(rec.basis_refs) || rec.basis_refs.length === 0) {
      setReason("recommendation_invalid");
      details.push("recommendation.basis_refs 不得为空（§12.2 Recommendation Must Have Basis——无 basis 的推荐在本模块就无法成形）");
    } else {
      for (const basis of rec.basis_refs) {
        if (!isLooseRef(basis)) {
          setReason("recommendation_invalid");
          details.push(`recommendation.basis_refs 引用 "${String(basis)}" 不是合法宽松引用词形`);
        }
      }
      // grounding 异形时（candidate_malformed 已记）跳过 missing_facts 交叉检查（禁二次裸崩）。
      if (groundingUsable && Array.isArray(grounding.missing_facts)) {
        for (const basis of rec.basis_refs) {
          if ((grounding.missing_facts as readonly string[]).includes(basis as string)) {
            setReason("recommendation_invalid");
            details.push(
              `recommendation.basis_refs 引用了 missing_facts 中登记的缺失事实 "${String(basis)}"（§12.1 No Unreferenced Project Fact——缺失事实是 Hypothesis/Unknown，不得冒充推荐前提）`,
            );
          }
        }
      }
    }
    if (!isPlainNonEmptyString(rec.rationale)) {
      setReason("recommendation_invalid");
      details.push("recommendation.rationale 必须非空");
    }
    if (!isPlainNonEmptyString(rec.tradeoff)) {
      setReason("recommendation_invalid");
      details.push("recommendation.tradeoff 必须非空（§12.2：每个 Recommendation 必须至少包含 basis_refs/tradeoff/uncertainty）");
    }
    if (!isPlainNonEmptyString(rec.uncertainty)) {
      setReason("recommendation_invalid");
      details.push("recommendation.uncertainty 必须非空（§12.2 同上）");
    }
    if (!(RECOMMENDATION_SOURCE_VALUES as readonly string[]).includes(rec.source)) {
      setReason("recommendation_invalid");
      details.push(
        `recommendation.source "${String(rec.source)}" 不在披露位词表（${RECOMMENDATION_SOURCE_VALUES.join("/")}；§12.2：只有模型经验必须显式申报 INFERENCE）`,
      );
    }
  }
  if (!isPlainNonEmptyString(candidate.authority?.owner) || !AUTHORITY_OWNER_PATTERN.test(candidate.authority.owner)) {
    setReason("authority_invalid");
    details.push(
      `authority.owner "${String(candidate.authority?.owner)}" 必须匹配 SCREAMING_SNAKE 词形（对齐 authority.json owner_registry；存在性对账归消费面——G8 Authority Resolution）`,
    );
  }
  if (ok) return { ok: true };
  return { ok: false, reason, details };
}

/** depends_on 有向图环检测（DFS 三色；返回成环节点路径，空数组 = 无环）。 */
function findCycle(deps: ReadonlyMap<string, readonly string[]>): readonly string[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  let cycle: string[] = [];
  const visit = (id: string): void => {
    if (cycle.length > 0) return;
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of deps.get(id) ?? []) {
      const state = color.get(dep) ?? WHITE;
      if (state === GRAY) {
        const start = stack.indexOf(dep);
        cycle = [...stack.slice(start === -1 ? 0 : start), dep];
        return;
      }
      if (state === WHITE) visit(dep);
      if (cycle.length > 0) return;
    }
    stack.pop();
    color.set(id, BLACK);
  };
  for (const id of deps.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) visit(id);
    if (cycle.length > 0) break;
  }
  return cycle;
}

/**
 * buildDecisionGraph（纯函数，§5.2）：
 * - LLM 候选节点 → 校验后 graph 对象：id 词形/唯一、depends_on 无环/无悬空、class 闭包、
 *   §12.1 缺失事实不得冒充推荐前提、禁词负例（GRILLING/GRILLED/GRILL_CONFIRMED）拒绝；
 * - graph_fingerprint 由 kernel 自动维护（sha256OfCanonical({projection_fingerprint,
 *   decisions, request_refs})，D24：human_touch forbidden / write_blocking:false）；
 * - build 产物全 OPEN（resolution 不得随 build 进入——resolution 只经 resolveDecision 写入）；
 * - 非法输入显式拒绝不 throw（fail-closed：环/悬空/词表外 class/禁词/无 basis 推荐一律红）。
 */
export function buildDecisionGraph(
  candidates: readonly DecisionNodeCandidate[],
  options: BuildDecisionGraphOptions = {},
): BuildDecisionGraphOutcome {
  // 形状防线（G8）：candidates 本体非数组 → 显式 outcome 拒绝（禁 .length/.map 裸崩）。
  if (!Array.isArray(candidates)) {
    return {
      ok: false,
      reason: "candidate_malformed",
      details: [`candidates 不是数组（得到 ${typeof candidates}）——图构建输入须为候选节点数组`],
      hint: "传 §5.2 十键候选节点数组（至少一个；先经 Grill 暴露 Candidate Decision，§5.1）",
    };
  }
  if (candidates.length === 0) {
    return {
      ok: false,
      reason: "empty_candidates",
      details: ["candidates 为空（图至少含一个 Decision 节点；schema 18 decisions minItems 1 同构）"],
      hint: "先经 Grill 暴露至少一个 Candidate Decision（§5.1：Decision Graph 不是空 Question List），再 build",
    };
  }
  // —— 指纹输入词形 ——
  if (options.projectionFingerprint !== undefined && !SHA256_PATTERN.test(options.projectionFingerprint)) {
    return {
      ok: false,
      reason: "fingerprint_invalid",
      details: [`projectionFingerprint "${String(options.projectionFingerprint)}" 不是 sha256:<64hex> 词形（§4.3 Projection Fingerprint；D24：由 kernel/上游内容寻址自动产生，人类禁算）`],
      hint: "传入 compileDiscoveryProjection 产出的 inputsFingerprint（PR-2），或省略（fingerprint 仍按图内容自动计算）",
    };
  }
  const requestRefs = options.requestRefs ?? [];
  for (const ref of requestRefs) {
    if (!RESEARCH_REQUEST_ID_PATTERN.test(ref)) {
      return {
        ok: false,
        reason: "request_ref_invalid",
        details: [`request_refs 条目 "${ref}" 不是 RESEARCH.REQ.<n> 词形`],
        hint: "request_refs 是 research/index.yaml 的同步标记（§16 禁第二持久化面）；正式 request 形态见 definitions.research_request（PR-4 接线）",
      };
    }
  }
  // —— 节点级校验（含 id 唯一） ——
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      "resolution" in candidate &&
      (candidate as { resolution?: unknown }).resolution !== undefined &&
      (candidate as { resolution?: unknown }).resolution !== null
    ) {
      return {
        ok: false,
        reason: "resolution_not_allowed_at_build",
        details: [`候选 ${String((candidate as { decision_id?: unknown }).decision_id)} 携带 resolution——build 产物必须全 OPEN（resolution 只经 resolveDecision 写入；graph 以 OPEN 起步是 frontier 动态计算的前提）`],
        hint: "从候选剔除 resolution 字段；已有裁决走 resolveDecision 重新录入",
      };
    }
    const validation = validateCandidate(candidate);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
        details: [...validation.details],
        hint: "按 details 逐条修正候选节点后重跑 build（fail-closed：非法候选不入图）",
      };
    }
    if (seen.has(candidate.decision_id)) {
      return {
        ok: false,
        reason: "duplicate_decision_id",
        details: [`decision_id "${candidate.decision_id}" 重复（id 唯一是 depends_on/affects 引用完整性的前提）`],
        hint: "同一 Decision 只能有一个节点；变体选项用 options 表达，不用重复节点表达",
      };
    }
    seen.add(candidate.decision_id);
  }
  // —— 图级：悬空依赖 + 环 ——
  const dangling: string[] = [];
  for (const candidate of candidates) {
    for (const dep of candidate.depends_on) {
      if (!seen.has(dep)) {
        dangling.push(`${candidate.decision_id} → ${dep}（依赖不在图内）`);
      }
    }
  }
  if (dangling.length > 0) {
    return {
      ok: false,
      reason: "depends_on_dangling",
      details: dangling,
      hint: "悬空依赖：先把被依赖的 Candidate Decision 纳入图，或删除该 depends_on 条目（§7.3：prerequisites 未满足的 Decision 不得提前暴露，悬空引用更不行）",
    };
  }
  const deps = new Map<string, readonly string[]>(
    candidates.map((c) => [c.decision_id, c.depends_on]),
  );
  const cycle = findCycle(deps);
  if (cycle.length > 0) {
    return {
      ok: false,
      reason: "dependency_cycle",
      details: [`依赖环：${cycle.join(" → ")}`],
      hint: "§5.1：Decision Graph 是 DAG——环意味着 prerequisite 关系自相矛盾；拆出真正的先后顺序或合并节点",
    };
  }
  const decisions: DecisionNode[] = candidates.map((candidate) => ({
    decision_id: candidate.decision_id,
    class: candidate.class as DecisionClassValue,
    prompt: candidate.prompt,
    depends_on: [...candidate.depends_on],
    affects: [...candidate.affects],
    grounding: { ...candidate.grounding },
    options: [...candidate.options],
    recommendation: candidate.recommendation === null ? null : { ...candidate.recommendation },
    authority: { ...candidate.authority },
    resolution: null,
  }));
  const graph: DecisionGraph = {
    graph_fingerprint: fingerprintOf(options.projectionFingerprint, decisions, requestRefs),
    ...(options.projectionFingerprint !== undefined
      ? { projection_fingerprint: options.projectionFingerprint }
      : {}),
    decisions,
    request_refs: [...requestRefs],
  };
  return {
    ok: true,
    graph,
    notes: [
      "frontier 由 graph 动态计算不落盘（§16：禁 frontier.json——computeDecisionFrontier 纯派生）",
      "Grounding Verdict 是派生判定不进 State Axis 也不落盘（§6.2；evaluateDecisionGrounding 按需重算）",
      "graph_fingerprint 由 kernel 自动维护（D24：human_touch forbidden / write_blocking:false；P0.5 只存，P1 消费 STALE_GROUNDING）",
    ],
  };
}

// ============================================================
// computeDecisionFrontier（§7.3：动态计算，零持久化）
// ============================================================

/** 上游何谓「已解决」：只有 ACCEPT/CHANGE 算 prerequisites 满足（DEFER/UNKNOWN/OPEN 的下游一律保守排除）。 */
const SATISFYING_ANSWERS: readonly DecisionAnswer[] = ["ACCEPT", "CHANGE"];

export interface DecisionFrontierReport {
  /** 当前有资格被处理的 Decision（OPEN 且 prerequisites 全满足）——§7.3 Frontier 逐字。 */
  readonly frontier: readonly string[];
  /** OPEN 但 prerequisites 未全满足（含上游 DEFER/UNKNOWN 保守排除），附未满足依赖明细。 */
  readonly waiting: readonly string[];
  readonly waitingReasons: Readonly<Record<string, readonly string[]>>;
  readonly resolved: readonly string[];
  readonly deferred: readonly string[];
  readonly unknown: readonly string[];
  readonly notes: readonly string[];
}

export type DecisionFrontierOutcome =
  | { readonly ok: true; readonly report: DecisionFrontierReport }
  | {
      readonly ok: false;
      readonly reason: "dangling_dependency" | "dependency_cycle";
      readonly details: readonly string[];
      readonly hint: string;
    };

/**
 * computeDecisionFrontier（纯函数，§7.3）：每一轮 Grill 只处理当前 Frontier——
 * 避免「一次给人 20 个待确认」。分区五桶：frontier/waiting/resolved/deferred/unknown；
 * 上游非 ACCEPT/CHANGE（含 DEFER/UNKNOWN/OPEN）的下游一律不入 frontier（保守：P1
 * invalidation 落地前不给未满足的 prerequisite 放行）。**零持久化**（§16 禁 frontier.json）。
 * 防御：手搓 graph 携带悬空依赖/环 → 显式拒绝（frontier 是 ordering 判卷，前提是 DAG 完整）。
 */
export function computeDecisionFrontier(graph: DecisionGraph): DecisionFrontierOutcome {
  const ids = new Set<string>();
  for (const node of graph.decisions) {
    ids.add(node.decision_id);
  }
  const dangling: string[] = [];
  for (const node of graph.decisions) {
    for (const dep of node.depends_on) {
      if (!ids.has(dep)) {
        dangling.push(`${node.decision_id} → ${dep}（依赖不在图内）`);
      }
    }
  }
  if (dangling.length > 0) {
    return {
      ok: false,
      reason: "dangling_dependency",
      details: dangling,
      hint: "graph 存在悬空依赖（未经 buildDecisionGraph 构造？）——先修复图再算 frontier",
    };
  }
  const cycle = findCycle(new Map(graph.decisions.map((n) => [n.decision_id, n.depends_on])));
  if (cycle.length > 0) {
    return {
      ok: false,
      reason: "dependency_cycle",
      details: [`依赖环：${cycle.join(" → ")}`],
      hint: "graph 存在依赖环（未经 buildDecisionGraph 构造？）——环图无合法拓扑序，frontier 不可判",
    };
  }
  const frontier: string[] = [];
  const waiting: string[] = [];
  const waitingReasons: Record<string, readonly string[]> = {};
  const resolved: string[] = [];
  const deferred: string[] = [];
  const unknown: string[] = [];
  for (const node of graph.decisions) {
    const resolution = node.resolution;
    if (resolution === null) {
      const unmet = node.depends_on.filter((dep) => {
        const upstream = graph.decisions.find((n) => n.decision_id === dep);
        const answer = upstream?.resolution?.answer;
        return answer === undefined || !SATISFYING_ANSWERS.includes(answer);
      });
      if (unmet.length === 0) {
        frontier.push(node.decision_id);
      } else {
        waiting.push(node.decision_id);
        waitingReasons[node.decision_id] = unmet;
      }
      continue;
    }
    if (resolution.answer === "ACCEPT" || resolution.answer === "CHANGE") {
      resolved.push(node.decision_id);
    } else if (resolution.answer === "DEFER") {
      deferred.push(node.decision_id);
    } else {
      unknown.push(node.decision_id);
    }
  }
  return {
    ok: true,
    report: {
      frontier,
      waiting,
      waitingReasons,
      resolved,
      deferred,
      unknown,
      notes: [
        "frontier 是纯派生视图：不落盘、无对应文件（§16 禁 frontier.json）；每轮 Grill 重算",
        "prerequisites 满足 = 上游 resolution ∈ ACCEPT/CHANGE；DEFER/UNKNOWN/OPEN 的下游保守排除（P1 invalidation 前不放行）",
      ],
    },
  };
}

// ============================================================
// evaluateDecisionGrounding（§6.1 G1-G8 + §6.2 五值 verdict）
// ============================================================

export type GroundingCheckId = "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8";

export interface GroundingCheckResult {
  readonly check: GroundingCheckId;
  readonly passed: boolean;
  readonly detail: string;
}

export interface DecisionGroundingInput {
  /** 待判卷节点（应来自 graph；防御：不在图内 = G3 fail）。 */
  readonly node: DecisionNode;
  /** 节点所属图（G3 依赖完整性以图内重算为准——R6：判卷以重算为准，不信申报）。 */
  readonly graph: DecisionGraph;
  /** G2 输入：本轮已检索的现实面（机械可重算面；Knowledge 不入——§83.2 ADVISORY 永不进 gate）。 */
  readonly retrievedSurfaces: readonly GroundingSurfaceValue[];
  /** G6 输入：缺失事实路由申报（key = missing_facts 成员；值 = DERIVABLE/RESEARCHABLE）。 */
  readonly missingFactRouting?: Readonly<Record<string, MissingFactRouteValue>>;
}

export interface DecisionGroundingOutcome {
  readonly verdict: GroundingVerdict;
  /** G1-G8 全量逐条判定（不只第一个失败——判卷面完整可审计）。 */
  readonly checks: readonly GroundingCheckResult[];
  /** 决定 verdict 的检查；READY_FOR_DECISION = null。 */
  readonly failedCheck: GroundingCheckId | null;
  readonly notes: readonly string[];
}

/**
 * evaluateDecisionGrounding（纯函数，§6.1/§6.2）：G1-G8 逐条判卷 → 五值派生 verdict。
 * verdict 派生优先序（确定性，实现注释即判卷表）：
 *   1. G1/G2/G3/G4/G7/G8 任一失败 → INSUFFICIENT_GROUNDING（grounding 太薄，连路由都不成立）；
 *   2. G5（已披露冲突在场）→ CONFLICT_REVIEW（禁自行挑答案——正式治理路径优先于继续取证）；
 *   3. G6 缺失事实路由：任一 RESEARCHABLE → NEEDS_RESEARCH；全部 DERIVABLE → NEEDS_DERIVATION；
 *      存在未路由缺失事实 / 路由越界 → INSUFFICIENT_GROUNDING（G6 fail）；
 *   4. 全过 → READY_FOR_DECISION（只有本 verdict 才允许进入 Question Gate 的人机交互路径）。
 * 判卷全部机械重算（R6）：G3 以 graph 重算为准；G4/G7 对 node 字段重算；不采信任何自报状态。
 * 零 throw；verdict 不落盘、不进 State Axis（§6.2）。
 */
export function evaluateDecisionGrounding(input: DecisionGroundingInput): DecisionGroundingOutcome {
  const node = input.node;
  const checks: GroundingCheckResult[] = [];
  const notes: string[] = [];
  const fail = (check: GroundingCheckId, detail: string): void => {
    checks.push({ check, passed: false, detail });
  };
  const pass = (check: GroundingCheckId, detail: string): void => {
    checks.push({ check, passed: true, detail });
  };

  // —— G1 Intent Anchor ——
  if (node.grounding.intent_refs.length === 0) {
    fail("G1", "intent_refs 为空：这个 Decision 没有锚定到当前 Intent/Scope（§6.1 G1——悬浮 Decision 不许问）");
  } else {
    pass("G1", `intent_refs 锚定 ${node.grounding.intent_refs.join("、")}`);
  }

  // —— G2 Existing Reality ——
  const surfaces = [...new Set(input.retrievedSurfaces)].filter((s) =>
    (GROUNDING_SURFACE_VALUES as readonly string[]).includes(s),
  );
  if (surfaces.length === 0) {
    fail("G2", "未检索任何现实面（Current Truth/Docs/Repo/Evidence 全缺——§6.1 G2：未检索现实 → grounding 不足；Knowledge 不入判卷，§83.2）");
  } else {
    pass("G2", `已检索现实面：${surfaces.join("/")}`);
  }

  // —— G3 Dependency Integrity（以 graph 重算为准） ——
  const graphIds = new Set(input.graph.decisions.map((n) => n.decision_id));
  const inGraph = graphIds.has(node.decision_id);
  const danglingDeps = node.depends_on.filter((dep) => !graphIds.has(dep));
  const cycle = findCycle(new Map(input.graph.decisions.map((n) => [n.decision_id, n.depends_on])));
  if (!inGraph) {
    fail("G3", `节点 ${node.decision_id} 不在 graph 内（G3 以图重算为准——孤儿节点无依赖完整性可判）`);
  } else if (danglingDeps.length > 0) {
    fail("G3", `悬空 prerequisites：${danglingDeps.join("、")}`);
  } else if (cycle.length > 0) {
    fail("G3", `图存在依赖环：${cycle.join(" → ")}（prerequisite 关系自相矛盾）`);
  } else {
    const openDeps = node.depends_on.filter((dep) => {
      const upstream = input.graph.decisions.find((n) => n.decision_id === dep);
      return upstream !== undefined && upstream.resolution === null;
    });
    pass(
      "G3",
      openDeps.length > 0
        ? `依赖完整且状态显式（OPEN prerequisites：${openDeps.join("、")}——显式未解决是合法状态，frontier 负责门控）`
        : "依赖完整且状态显式",
    );
  }

  // —— G4 Factual Premise Integrity（§12.1） ——
  const missingFacts = node.grounding.missing_facts;
  if (node.recommendation === null) {
    pass("G4", "无 recommendation（G4 前提判卷不适用；G7 另判推荐在位性）");
  } else if (node.recommendation.basis_refs.length === 0) {
    fail("G4", "recommendation.basis_refs 为空：推荐前提零 Ref（§12.1 No Unreferenced Project Fact——无 Ref 项目事实拒为 Recommendation Premise）");
  } else {
    const laundered = node.recommendation.basis_refs.filter((basis) =>
      missingFacts.includes(basis),
    );
    if (laundered.length > 0) {
      fail("G4", `推荐前提引用了缺失事实：${laundered.join("、")}（缺失事实是 Hypothesis/Unknown 形态，不得冒充已成立前提——§12.1）`);
    } else {
      pass("G4", `全部推荐前提携带 Ref（${String(node.recommendation.basis_refs.length)} 条，且与 missing_facts 无交集）`);
    }
  }

  // —— G7 Recommendation Traceability（§12.2） ——
  if (node.recommendation === null) {
    fail("G7", "无 recommendation：不可判卷推荐可追溯性——没有推荐就不许问人（Question Card 必须展示推荐/依据/代价，§13.2）");
  } else {
    const rec = node.recommendation;
    const gaps: string[] = [];
    if (rec.basis_refs.length === 0) gaps.push("basis_refs 为空");
    if (rec.tradeoff.trim().length === 0) gaps.push("tradeoff 为空");
    if (rec.uncertainty.trim().length === 0) gaps.push("uncertainty 为空");
    if (gaps.length > 0) {
      fail("G7", `推荐可追溯性缺口：${gaps.join("；")}（§12.2 Recommendation Must Have Basis）`);
    } else if (rec.source === "PROJECT_GROUNDED" && rec.basis_refs.length === 0) {
      fail("G7", "source=PROJECT_GROUNDED 但 basis_refs 为空：不得说「根据项目现状建议」却没有任何项目引用（§12.2 逐字）");
    } else {
      pass("G7", `推荐可追溯：basis_refs ${String(rec.basis_refs.length)} 条 + tradeoff/uncertainty 在位`);
      if (rec.source === "INFERENCE") {
        notes.push(
          "§12.2 INFERENCE 披露位：本推荐 source=INFERENCE（模型经验）——呈现面必须显式披露，不得包装成项目事实",
        );
      }
    }
  }

  // —— G8 Authority Resolution ——
  if (!AUTHORITY_OWNER_PATTERN.test(node.authority.owner)) {
    fail("G8", `authority.owner "${node.authority.owner}" 缺失或词形非法（§6.1 G8：若最终需要 Human Decision，必须知道谁有权决定；词形对齐 owner_registry）`);
  } else {
    pass("G8", `authority.owner=${node.authority.owner}（存在性对账归 authority.json 消费面）`);
  }

  // —— G5 Conflict Visibility（§12.3：已披露冲突 → CONFLICT_REVIEW，禁自行挑答案） ——
  const hasConflicts = node.grounding.conflicts.length > 0;
  if (hasConflicts) {
    fail("G5", `${String(node.grounding.conflicts.length)} 条冲突待审（BP/Prototype/Repo 各执一词时禁自行挑「看起来最合理」的——§12.3；上报正式治理/Authority 路径裁决）`);
    notes.push(
      "CONFLICT_REVIEW 出口：复用 Exception Ledger CONFLICT 分类（EXCEPTION_CLASSIFICATION_VALUES）上报正式治理面——冲突是发现不是裁决",
    );
  } else {
    pass("G5", "无未披露冲突（conflicts 为空）");
  }

  // —— G6 Missing Fact Routing ——
  const routing = input.missingFactRouting ?? {};
  const routeKeys = Object.keys(routing);
  const invalidRoutes = routeKeys.filter((key) => !(MISSING_FACT_ROUTE_VALUES as readonly string[]).includes(routing[key] as MissingFactRouteValue));
  const unrouted = missingFacts.filter((fact) => routing[fact] === undefined);
  const overreach = routeKeys.filter((key) => !missingFacts.includes(key));
  let routingBroken = false;
  if (invalidRoutes.length > 0 || unrouted.length > 0 || overreach.length > 0) {
    routingBroken = true;
    const detailBits: string[] = [];
    if (invalidRoutes.length > 0) detailBits.push(`非法路由词形：${invalidRoutes.join("、")}（只许 DERIVABLE/RESEARCHABLE——事实型问题禁止 Ask Human，PRD §8）`);
    if (unrouted.length > 0) detailBits.push(`缺失事实未路由：${unrouted.join("、")}（§6.1 G6：缺少事实必须标为 Derivable/Researchable，不许直接 Ask Human）`);
    if (overreach.length > 0) detailBits.push(`路由越界：${overreach.join("、")} 不在 missing_facts 内（申报与重算脱节——R6 以重算为准）`);
    fail("G6", detailBits.join("；"));
  } else if (missingFacts.length === 0) {
    pass("G6", "无缺失事实（路由判卷不适用）");
  } else {
    const routes = missingFacts.map((fact) => routing[fact] as MissingFactRouteValue);
    if (routes.includes("RESEARCHABLE")) {
      pass("G6", `缺失事实已全部路由（含 RESEARCHABLE：${missingFacts.filter((f) => routing[f] === "RESEARCHABLE").join("、")}）`);
    } else {
      pass("G6", `缺失事实已全部路由（DERIVABLE：${missingFacts.join("、")}）`);
    }
    notes.push("缺失事实保持 Hypothesis/Unknown 形态直至取得 Ref（§5.3——LLM Prior 可以生成问题，不能生成项目现实）");
  }

  // —— 派生 verdict（优先序见函数头判卷表；checks 已全量 8 条，判卷面完整可审计） ——
  const firstInsufficient = checks.find((c) => !c.passed && c.check !== "G5" && c.check !== "G6");
  if (firstInsufficient !== undefined) {
    return { verdict: "INSUFFICIENT_GROUNDING", checks, failedCheck: firstInsufficient.check, notes };
  }
  if (hasConflicts) {
    return { verdict: "CONFLICT_REVIEW", checks, failedCheck: "G5", notes };
  }
  if (routingBroken) {
    return { verdict: "INSUFFICIENT_GROUNDING", checks, failedCheck: "G6", notes };
  }
  if (missingFacts.length > 0) {
    const anyResearchable = missingFacts.some((fact) => routing[fact] === "RESEARCHABLE");
    if (anyResearchable) {
      notes.push("NEEDS_RESEARCH → createResearchRequest（§9.4 Request Gate：来源不足 + 可被证据回答在本函数 verdict 已承载；影响当前决策/成本合算由调用方申报）");
      return { verdict: "NEEDS_RESEARCH", checks, failedCheck: null, notes };
    }
    notes.push("NEEDS_DERIVATION → 先消化上游来源（Current Truth/Docs/Repo/Evidence/Knowledge 低风险默认）再重跑 gate");
    return { verdict: "NEEDS_DERIVATION", checks, failedCheck: null, notes };
  }
  notes.push("READY_FOR_DECISION：仅此 verdict 允许进入 Question Gate 的人机交互路径（§6.2）");
  return { verdict: "READY_FOR_DECISION", checks, failedCheck: null, notes };
}

// ============================================================
// createResearchRequest（§9.1 九键 + §9.3 mode 路由 + §9.4 Request Gate 前两条）
// ============================================================

export interface ResearchRequestDraft {
  /** 缺省时由 nextSeq 机械派生 RESEARCH.REQ.<n>。 */
  readonly id?: string;
  /** 来源 Decision（≥1——Research Request 必须锚定到 Decision，这是 §9.1 的立约点）。 */
  readonly origin_decision_refs: readonly string[];
  /** 精确可判定的事实主张（§9.1：不再接受宽泛问题）。 */
  readonly proposition: string;
  readonly why_needed: string;
  readonly known_context_refs?: readonly string[];
  /** 显式 mode（复用 RESEARCH_MODE_VALUES 六模式）；缺省时由 gapKind 路由（§9.3）。 */
  readonly mode?: ResearchModeValue;
  /** 期望证据级（复用五级 Evidence 词形；例 IMPLEMENTATION）。 */
  readonly required_evidence: ResearchEvidenceLevelValue;
  /** §9.2 证伪纪律：false 合法但 notes 显式提示（Research 必须主动寻找 Contradicting Evidence）。 */
  readonly disconfirming_evidence_required: boolean;
  /** 停机判据（≥1——什么时候可以停，防止无限 Ceremony）。 */
  readonly stop_when: readonly string[];
  /** §81.1：Research 有发现权无裁决权——本请求的越权禁令逐字申报。 */
  readonly forbidden_conclusion: string;
}

export interface CreateResearchRequestInput {
  readonly request: ResearchRequestDraft;
  /** id 派生序号（调用方供给——零墙钟 A4：禁时间戳，序号靠 seq 不靠钟）。 */
  readonly nextSeq: number;
  /** §9.3 路由输入：Decision Gap 类型（request.mode 缺省时必填）。 */
  readonly gapKind?: ResearchModeRouteHint;
}

export type ResearchRequest = {
  readonly id: string;
  readonly origin_decision_refs: readonly string[];
  readonly proposition: string;
  readonly why_needed: string;
  readonly known_context_refs: readonly string[];
  readonly mode: ResearchModeValue;
  readonly required_evidence: ResearchEvidenceLevelValue;
  readonly disconfirming_evidence_required: boolean;
  readonly stop_when: readonly string[];
  readonly forbidden_conclusion: string;
};

export type CreateResearchRequestOutcome =
  | { readonly ok: true; readonly request: ResearchRequest; readonly notes: readonly string[] }
  | {
      readonly ok: false;
      readonly reason:
        | "origin_decision_ref_invalid"
        | "proposition_empty"
        | "why_needed_empty"
        | "mode_unresolvable"
        | "mode_unknown"
        | "required_evidence_unknown"
        | "stop_when_empty"
        | "forbidden_conclusion_empty"
        | "id_invalid"
        | "seq_invalid";
      readonly details: readonly string[];
      readonly hint: string;
    };

/**
 * createResearchRequest（纯函数，§9.1/§9.3/§9.4）：NEEDS_RESEARCH verdict 的节点 →
 * 精确 Research Request 九键词形。
 * 本函数判 §9.4 四条件的前两条（来源不足 = G-Gate verdict=NEEDS_RESEARCH 的前置凭证，
 * 由调用方随队传递；可被证据回答 = required_evidence 在位）；后两条（影响当前决策/
 * 成本合算）由调用方申报——机器不替人做成本判断（§9.4：Research 不能成为新的 Ceremony）。
 * mode：显式 mode 优先；缺省按 gapKind 路由（§9.3 表）；两者皆缺 → 显式拒绝
 * （「不得因为更全面默认 MIXED」逐字兑现——零缺省政策）。
 */
export function createResearchRequest(input: CreateResearchRequestInput): CreateResearchRequestOutcome {
  const draft = input.request;
  if (!Number.isInteger(input.nextSeq) || input.nextSeq < 1) {
    return {
      ok: false,
      reason: "seq_invalid",
      details: [`nextSeq ${String(input.nextSeq)} 必须是 ≥1 的整数（零墙钟 A4：request 序号靠 seq 不靠钟）`],
      hint: "调用方维护 request 序号（扫描 research/index.yaml 既有 id 取最小未占用，同 brainstorm start 先例）",
    };
  }
  if (draft.origin_decision_refs.length === 0) {
    return {
      ok: false,
      reason: "origin_decision_ref_invalid",
      details: ["origin_decision_refs 为空（§9.1：Brainstorm 触发 Research 必须生成锚定到 Decision 的精确请求，不接受无主研究）"],
      hint: "把受影响 Decision id（DECISION.*）填入 origin_decision_refs；--from-decision 通路（PR-4）同源",
    };
  }
  for (const ref of draft.origin_decision_refs) {
    if (!DECISION_ID_PATTERN.test(ref)) {
      return {
        ok: false,
        reason: "origin_decision_ref_invalid",
        details: [`origin_decision_ref "${ref}" 不是 DECISION.* 词形（Discovery 平面局部词形）`],
        hint: "修正词形后再开 request",
      };
    }
  }
  if (new Set(draft.origin_decision_refs).size !== draft.origin_decision_refs.length) {
    return {
      ok: false,
      reason: "origin_decision_ref_invalid",
      details: ["origin_decision_refs 含重复 id"],
      hint: "去重后重试",
    };
  }
  if (!isPlainNonEmptyString(draft.proposition)) {
    return {
      ok: false,
      reason: "proposition_empty",
      details: ["proposition 必须是精确可判定的事实主张（§9.1：不再接受「帮我研究一下 X」式宽泛问题）"],
      hint: "改写为可用证据证实/证伪的单一命题（例：现有数据中是否存在统一匹配键）",
    };
  }
  if (!isPlainNonEmptyString(draft.why_needed)) {
    return {
      ok: false,
      reason: "why_needed_empty",
      details: ["why_needed 必须非空（哪个 Decision 的 Recommendation 依赖本事实，逐字写明）"],
      hint: "例：DECISION.D017 的 Recommendation 依赖跨车型匹配复杂度判断",
    };
  }
  let mode: ResearchModeValue;
  if (draft.mode !== undefined) {
    if (!(RESEARCH_MODE_VALUES as readonly string[]).includes(draft.mode)) {
      return {
        ok: false,
        reason: "mode_unknown",
        details: [`mode "${String(draft.mode)}" 不在 RESEARCH_MODE_VALUES 六模式（INTERNAL/EXTERNAL/MIXED/COMPARATIVE/IMPACT/FORENSIC——复用既有轴，零新词形）`],
        hint: "改用六模式词形，或省略 mode 由 gapKind 路由",
      };
    }
    mode = draft.mode;
  } else if (input.gapKind !== undefined) {
    const routed = RESEARCH_MODE_ROUTE_HINTS[input.gapKind];
    if (routed === undefined) {
      return {
        ok: false,
        reason: "mode_unresolvable",
        details: [`gapKind "${String(input.gapKind)}" 不在 §9.3 路由表（${Object.keys(RESEARCH_MODE_ROUTE_HINTS).join("/")}）`],
        hint: "改用路由表词形，或显式给 mode",
      };
    }
    mode = routed;
  } else {
    return {
      ok: false,
      reason: "mode_unresolvable",
      details: ["mode 与 gapKind 均缺省（§9.3：不得因为「更全面」默认 MIXED——零缺省政策）"],
      hint: "显式给 mode，或给 gapKind 走 §9.3 路由表",
    };
  }
  if (!(RESEARCH_EVIDENCE_LEVEL_VALUES as readonly string[]).includes(draft.required_evidence)) {
    return {
      ok: false,
      reason: "required_evidence_unknown",
      details: [`required_evidence "${String(draft.required_evidence)}" 不在五级 Evidence 词表（复用 RESEARCH_EVIDENCE_LEVEL_VALUES）`],
      hint: "改用 AUTHORITATIVE/PRIMARY/IMPLEMENTATION/SECONDARY/INFERENCE 词形",
    };
  }
  if (!Array.isArray(draft.stop_when) || draft.stop_when.length === 0 || !draft.stop_when.every((s) => isPlainNonEmptyString(s))) {
    return {
      ok: false,
      reason: "stop_when_empty",
      details: ["stop_when 必须至少一条非空停机判据（防 Research 成为无限 Ceremony——§9.4）"],
      hint: "写明「定位到权威字段 / 证明不存在 / 发现冲突并形成 caveat」级别的可判定停机条件",
    };
  }
  if (!isPlainNonEmptyString(draft.forbidden_conclusion)) {
    return {
      ok: false,
      reason: "forbidden_conclusion_empty",
      details: ["forbidden_conclusion 必须非空（§81.1：Research 有发现权无裁决权——越权禁令逐字申报在请求上）"],
      hint: "例：Research 不得决定当前 Increment 是否包含跨车型能力",
    };
  }
  const id = draft.id ?? `RESEARCH.REQ.${String(input.nextSeq)}`;
  if (!RESEARCH_REQUEST_ID_PATTERN.test(id)) {
    return {
      ok: false,
      reason: "id_invalid",
      details: [`id "${id}" 不是 RESEARCH.REQ.<n> 词形`],
      hint: "显式 id 须匹配 ^RESEARCH\\.REQ\\.[0-9]+$；缺省派生形如 RESEARCH.REQ.17",
    };
  }
  const notes: string[] = [
    `§9.4 Request Gate：来源不足（G-Gate verdict=NEEDS_RESEARCH）+ 可被证据回答（required_evidence=${draft.required_evidence}）已判；影响当前决策/成本合算由调用方申报`,
  ];
  if (!draft.disconfirming_evidence_required) {
    notes.push(
      "§9.2 证伪纪律提示：disconfirming_evidence_required=false——Research 仍必须主动寻找 Contradicting Evidence；申报 false 需在 why_needed 说明理由",
    );
  } else {
    notes.push("§9.2 证伪纪律：Research 的核心问题是证伪——必须同时寻找 Supporting 与 Contradicting Evidence");
  }
  notes.push("finding 回填时 relation 六值与 authority_effect 三值两轴并存禁互填（Owner 裁决9③ 划界）");
  return {
    ok: true,
    request: {
      id,
      origin_decision_refs: [...draft.origin_decision_refs],
      proposition: draft.proposition,
      why_needed: draft.why_needed,
      known_context_refs: [...(draft.known_context_refs ?? [])],
      mode,
      required_evidence: draft.required_evidence,
      disconfirming_evidence_required: draft.disconfirming_evidence_required,
      stop_when: [...draft.stop_when],
      forbidden_conclusion: draft.forbidden_conclusion,
    },
    notes,
  };
}

// ============================================================
// applyResearchHandoff（§10.1/§10.2：finding 联结回填 + §12.4 洗白防御）
// ============================================================

/** §10.1 finding v2 联结形态（六字段既有面之外的新联结键；10 号 schema 零改动——本形态住 schema 18 definitions）。 */
export interface HandoffFinding {
  readonly finding_id: string;
  readonly statement: string;
  /** 五级 Evidence 词形原样携带（§12.4：INFERENCE 不升 Fact——G4 继续按词形判卷）。 */
  readonly evidence_type: ResearchEvidenceLevelValue;
  readonly sources: readonly string[];
  readonly caveats: readonly string[];
  readonly request_refs: readonly string[];
  readonly decision_refs: readonly string[];
  readonly relation: DecisionRelationValue;
  /** RESOLVES_FACT 专用：被消解的缺失事实（须已在目标 decision 的 missing_facts 登记）。 */
  readonly resolves_missing_facts?: readonly string[];
}

/** §10.2 decision-aware handoff（artifact_ref + answered/affected + key_findings + unresolved + 两件摘要）。 */
export interface ResearchHandoffInput {
  readonly artifact_ref: string;
  readonly answered_requests: readonly string[];
  readonly affected_decisions: readonly string[];
  readonly key_findings: readonly HandoffFinding[];
  readonly unresolved_requests: readonly string[];
  readonly one_line_summary: string;
  readonly critical_caveat: string;
}

export type ApplyResearchHandoffOutcome =
  | {
      readonly ok: true;
      /** false = 同 handoff 重放幂等 NO_CHANGE（对齐 brainstorm start/promote 幂等纪律）。 */
      readonly changed: boolean;
      readonly graph: DecisionGraph;
      readonly notes: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason:
        | "unknown_request_ref"
        | "unknown_decision_ref"
        | "answered_unresolved_conflict"
        | "finding_invalid"
        | "finding_request_unknown"
        | "resolves_unregistered_fact"
        | "inference_cannot_resolve_fact"
        | "contradiction_without_source"
        | "artifact_ref_invalid";
      readonly details: readonly string[];
      readonly hint: string;
    };

/**
 * applyResearchHandoff（纯函数，§10.2）：research handoff → graph 回填（纯派生新图，不改入参）。
 * - grounding.research_finding_refs 增量（append-only 去重）；
 * - RESOLVES_FACT + resolves_missing_facts → 消解目标 decision 的 missing_facts；
 * - CONTRADICTS_PREMISE → 目标 decision 的 conflicts 追加披露条目（下一轮 G-Gate 判
 *   CONFLICT_REVIEW——§12.3 禁自行挑答案）；
 * - INSUFFICIENT_EVIDENCE / NO_DECISION_EFFECT → 不回填（前者 notes 携带 caveat，节点保持
 *   NEEDS_RESEARCH；后者显式 no-op）；
 * - §12.4 反洗白：INFERENCE + RESOLVES_FACT → 拒绝（INFERENCE 不因进入 handoff 就升级为
 *   项目事实）；CONTRADICTS_PREMISE 零来源 → 拒绝（无来源矛盾主张不成立）；
 * - request_refs/answered/unresolved 与 graph.request_refs 对账（悬空显式拒绝——ref-integrity）；
 * - 幂等：同 handoff 重放 = changed:false NO_CHANGE（canonical 深比）。
 */
export function applyResearchHandoff(
  graph: DecisionGraph,
  handoff: ResearchHandoffInput,
): ApplyResearchHandoffOutcome {
  if (!isPlainNonEmptyString(handoff.artifact_ref)) {
    return {
      ok: false,
      reason: "artifact_ref_invalid",
      details: ["artifact_ref 必须非空（research artifact 寻址位——handoff 只传路径不传内容，context pollution guard）"],
      hint: "填 <host>/research/ 形态的 artifact 根（§10.2 artifact_ref）",
    };
  }
  const knownRequests = new Set(graph.request_refs);
  const answeredSet = new Set(handoff.answered_requests);
  for (const req of [...handoff.answered_requests, ...handoff.unresolved_requests]) {
    if (!knownRequests.has(req)) {
      return {
        ok: false,
        reason: "unknown_request_ref",
        details: [`request "${req}" 不在 graph.request_refs 同步标记内（悬空 request 引用——ref-integrity 纪律）`],
        hint: "request 落档 research/index.yaml 后把 id 同步进 graph.request_refs（build 的 requestRefs 选项或 PR-4 编排），再应用 handoff",
      };
    }
  }
  for (const req of handoff.unresolved_requests) {
    if (answeredSet.has(req)) {
      return {
        ok: false,
        reason: "answered_unresolved_conflict",
        details: [`request "${req}" 同时出现在 answered_requests 与 unresolved_requests（自相矛盾申报——fail-closed）`],
        hint: "一个 request 要么已答要么未答；部分回答拆成两条 request",
      };
    }
  }
  const decisionIndex = new Map<string, DecisionNode>(
    graph.decisions.map((n) => [n.decision_id, n]),
  );
  for (const id of handoff.affected_decisions) {
    if (!decisionIndex.has(id)) {
      return {
        ok: false,
        reason: "unknown_decision_ref",
        details: [`affected_decisions 引用 "${id}" 不在图内（悬空 decision 引用）`],
        hint: "handoff 只能回填图内已存在的 Decision",
      };
    }
  }
  const seenFindingIds = new Set<string>();
  for (const finding of handoff.key_findings) {
    if (!FINDING_ID_PATTERN.test(finding.finding_id)) {
      return {
        ok: false,
        reason: "finding_invalid",
        details: [`finding_id "${finding.finding_id}" 不是 FINDING.R<n>.<n> 词形`],
        hint: "例：FINDING.R017.1",
      };
    }
    if (seenFindingIds.has(finding.finding_id)) {
      return {
        ok: false,
        reason: "finding_invalid",
        details: [`finding_id "${finding.finding_id}" 在本 handoff 内重复`],
        hint: "同一 finding 只登记一次",
      };
    }
    seenFindingIds.add(finding.finding_id);
    if (!isPlainNonEmptyString(finding.statement)) {
      return { ok: false, reason: "finding_invalid", details: [`finding ${finding.finding_id} statement 必须非空`], hint: "补发现陈述" };
    }
    if (!(RESEARCH_EVIDENCE_LEVEL_VALUES as readonly string[]).includes(finding.evidence_type)) {
      return { ok: false, reason: "finding_invalid", details: [`finding ${finding.finding_id} evidence_type 不在五级 Evidence 词表`], hint: "复用 RESEARCH_EVIDENCE_LEVEL_VALUES" };
    }
    if (!Array.isArray(finding.sources)) {
      return { ok: false, reason: "finding_invalid", details: [`finding ${finding.finding_id} sources 必须是数组（空数组仅 INFERENCE 级豁免）`], hint: "补 sources" };
    }
    if (finding.sources.length === 0 && finding.evidence_type !== "INFERENCE") {
      return {
        ok: false,
        reason: "finding_invalid",
        details: [`finding ${finding.finding_id} evidence_type=${finding.evidence_type} 而 sources 为空（零来源断言不冒充已取证——§12.4 幻觉洗白面）`],
        hint: "补真实来源，或把证据级降为 INFERENCE",
      };
    }
    if (!Array.isArray(finding.caveats) || finding.caveats.length === 0 || !finding.caveats.every((c) => isPlainNonEmptyString(c))) {
      return {
        ok: false,
        reason: "finding_invalid",
        details: [`finding ${finding.finding_id} caveats 必须至少一条非空（无告警也写显式陈述——adjudicateResearchFindings 同纪律）`],
        hint: "例：两个策略均未被 Architecture Truth 定义为正式标准",
      };
    }
    for (const req of finding.request_refs) {
      if (!answeredSet.has(req)) {
        return {
          ok: false,
          reason: "finding_request_unknown",
          details: [`finding ${finding.finding_id} 的 request_refs 引用 "${req}" 不在本 handoff 的 answered_requests 内（finding 必须知道自己回答了什么——§10.1）`],
          hint: "request_refs ⊆ answered_requests",
        };
      }
    }
    for (const id of finding.decision_refs) {
      if (!decisionIndex.has(id)) {
        return {
          ok: false,
          reason: "unknown_decision_ref",
          details: [`finding ${finding.finding_id} 的 decision_refs 引用 "${id}" 不在图内`],
          hint: "finding 只能指向图内 Decision",
        };
      }
    }
    if (!(DECISION_RELATION_VALUES as readonly string[]).includes(finding.relation)) {
      return {
        ok: false,
        reason: "finding_invalid",
        details: [`finding ${finding.finding_id} relation "${String(finding.relation)}" 不在六值闭包（${DECISION_RELATION_VALUES.join("/")}）`],
        hint: "relation 管 finding↔Decision 证据关系；authority_effect 三值是另一轴（禁互填）",
      };
    }
    const needsDecisionRefs =
      finding.relation === "RESOLVES_FACT" ||
      finding.relation === "SUPPORTS_OPTION" ||
      finding.relation === "WEAKENS_OPTION" ||
      finding.relation === "CONTRADICTS_PREMISE";
    if (needsDecisionRefs && finding.decision_refs.length === 0) {
      return {
        ok: false,
        reason: "finding_invalid",
        details: [`finding ${finding.finding_id} relation=${finding.relation} 而 decision_refs 为空（该 relation 必须指向至少一个 Decision）`],
        hint: "NO_DECISION_EFFECT/INSUFFICIENT_EVIDENCE 才允许空 decision_refs",
      };
    }
    const resolves = finding.resolves_missing_facts ?? [];
    if (finding.relation === "RESOLVES_FACT" && resolves.length === 0) {
      return {
        ok: false,
        reason: "finding_invalid",
        details: [`finding ${finding.finding_id} relation=RESOLVES_FACT 但 resolves_missing_facts 为空（宣称消解事实却不点名是哪个——不可判卷）`],
        hint: "填目标 decision 的 missing_facts 成员（FACT.*）",
      };
    }
    if (finding.relation !== "RESOLVES_FACT" && resolves.length > 0) {
      return {
        ok: false,
        reason: "finding_invalid",
        details: [`finding ${finding.finding_id} relation=${finding.relation} 却携带 resolves_missing_facts（自相矛盾——只有 RESOLVES_FACT 消解缺失事实）`],
        hint: "去掉 resolves_missing_facts 或改 relation",
      };
    }
    for (const fact of resolves) {
      if (!MISSING_FACT_REF_PATTERN.test(fact)) {
        return { ok: false, reason: "finding_invalid", details: [`finding ${finding.finding_id} resolves_missing_facts 条目 "${fact}" 不是 FACT.* 词形`], hint: "例：FACT.CROSS_MODEL.MATCHING_SEMANTICS" };
      }
      for (const id of finding.decision_refs) {
        const target = decisionIndex.get(id);
        if (
          target !== undefined &&
          !target.grounding.missing_facts.includes(fact) &&
          // 幂等豁免：同 finding 已回填（重放）时事实可已被本 finding 消解——fresh 矛盾仍拒。
          !target.grounding.research_finding_refs.includes(finding.finding_id)
        ) {
          return {
            ok: false,
            reason: "resolves_unregistered_fact",
            details: [`finding ${finding.finding_id} 宣称消解 "${fact}"，但 ${id} 的 missing_facts 并未登记该事实（消解只能发生在已登记缺口上）`],
            hint: "先确认目标 decision 的 missing_facts；未登记的缺口不需要消解",
          };
        }
      }
    }
    if (finding.evidence_type === "INFERENCE" && finding.relation === "RESOLVES_FACT") {
      return {
        ok: false,
        reason: "inference_cannot_resolve_fact",
        details: [`finding ${finding.finding_id} evidence_type=INFERENCE 且 relation=RESOLVES_FACT（§12.4 Research Cannot Launder Inference into Fact——INFERENCE 不因进入 handoff 就升级为项目事实）`],
        hint: "先取得 IMPLEMENTATION 及以上证据级再消解缺失事实；INFERENCE 只能 SUPPORTS/WEAKENS 或登记 caveat",
      };
    }
    if (finding.relation === "CONTRADICTS_PREMISE" && finding.sources.length === 0) {
      return {
        ok: false,
        reason: "contradiction_without_source",
        details: [`finding ${finding.finding_id} relation=CONTRADICTS_PREMISE 而 sources 为空（矛盾主张必须带来源——零来源矛盾不成立）`],
        hint: "补矛盾方来源引用（commit/路径/文档）",
      };
    }
  }
  // —— 构造回填后的新图（不可变：新节点对象替换受影响节点） ——
  const changedIds = new Set<string>();
  for (const finding of handoff.key_findings) {
    for (const id of finding.decision_refs) changedIds.add(id);
  }
  if (changedIds.size === 0) {
    // 无 decision_refs 的 handoff（全 NO_DECISION_EFFECT/INSUFFICIENT_EVIDENCE）：图不变。
    return {
      ok: true,
      changed: false,
      graph,
      notes: [
        "handoff 无图内 decision_refs（全 NO_DECISION_EFFECT/INSUFFICIENT_EVIDENCE）——NO_CHANGE",
        ...handoff.key_findings.map((f) => `finding ${f.finding_id}：relation=${f.relation}，evidence_type=${f.evidence_type} 原样携带（§12.4 INFERENCE 不升 Fact）`),
      ],
    };
  }
  const notes: string[] = [];
  const decisions = graph.decisions.map((node) => {
    if (!changedIds.has(node.decision_id)) return node;
    const grounding = node.grounding;
    let findingRefs = [...grounding.research_finding_refs];
    let missingFacts = [...grounding.missing_facts];
    const conflicts = [...grounding.conflicts];
    let nodeChanged = false;
    for (const finding of handoff.key_findings) {
      if (!finding.decision_refs.includes(node.decision_id)) continue;
      if (!findingRefs.includes(finding.finding_id)) {
        findingRefs = [...findingRefs, finding.finding_id];
        nodeChanged = true;
      }
      if (finding.relation === "RESOLVES_FACT") {
        const resolves = finding.resolves_missing_facts ?? [];
        const filtered = missingFacts.filter((fact) => !resolves.includes(fact));
        if (filtered.length !== missingFacts.length) {
          missingFacts = filtered;
          nodeChanged = true;
          notes.push(`${node.decision_id}：missing_facts 消解 ${resolves.join("、")}（finding ${finding.finding_id}，evidence_type=${finding.evidence_type}）`);
        }
      }
      if (finding.relation === "CONTRADICTS_PREMISE") {
        // 幂等去重：同 statement+refs 的冲突条目已登记（重放）则不重复追加。
        const duplicate = conflicts.some(
          (c) =>
            c.statement === finding.statement &&
            c.refs.length === finding.sources.length + 1 &&
            c.refs[0] === finding.finding_id &&
            finding.sources.every((s, i) => c.refs[i + 1] === s),
        );
        if (!duplicate) {
          conflicts.push({ statement: finding.statement, refs: [finding.finding_id, ...finding.sources] });
          nodeChanged = true;
          notes.push(`${node.decision_id}：CONTRADICTS_PREMISE 已入 conflicts 披露面——下一轮 G-Gate 判 CONFLICT_REVIEW（§12.3 禁自行挑答案）`);
        }
      }
      if (finding.relation === "INSUFFICIENT_EVIDENCE") {
        notes.push(`${node.decision_id}：finding ${finding.finding_id} relation=INSUFFICIENT_EVIDENCE——证据不足，节点保持 NEEDS_RESEARCH；caveat：${finding.caveats[0] ?? ""}`);
      }
      if (finding.relation === "NO_DECISION_EFFECT") {
        notes.push(`${node.decision_id}：finding ${finding.finding_id} relation=NO_DECISION_EFFECT——显式 no-op`);
      }
    }
    if (!nodeChanged) return node;
    return { ...node, grounding: { ...grounding, research_finding_refs: findingRefs, missing_facts: missingFacts, conflicts } };
  });
  const decisionsChanged = canonicalJson(decisions) !== canonicalJson(graph.decisions);
  const nextGraph: DecisionGraph = {
    ...graph,
    graph_fingerprint: fingerprintOf(graph.projection_fingerprint, decisions, graph.request_refs),
    decisions,
  };
  if (!decisionsChanged) {
    return {
      ok: true,
      changed: false,
      graph,
      notes: ["同 handoff 重放：回填结果与现图深度一致——NO_CHANGE（幂等，对齐 brainstorm start/promote 纪律）"],
    };
  }
  notes.push("graph 已回填：research_finding_refs 增量 + missing_facts 消解（如适用）；frontier 由调用方重算（纯派生）");
  return { ok: true, changed: true, graph: nextGraph, notes };
}

// ============================================================
// resolveDecision（§13.2 四词形 + §14 UNKNOWN 六问重分类）
// ============================================================

/** §14 六问重分类输入（复用 09 blocker_triage 八问语义的六问子集——前五问任一 yes 即有出路）。 */
export interface UnknownTriage {
  readonly can_derive: boolean;
  readonly can_research: boolean;
  readonly can_safely_assume: boolean;
  readonly can_defer: boolean;
  readonly can_prototype_observe: boolean;
  /** 只有 No/No/No/No/No/Yes 才是真正 Blocker（§14 逐字）。 */
  readonly blocks_current_increment: boolean;
}

export interface ResolveDecisionInput {
  readonly decisionId: string;
  readonly answer: DecisionAnswer;
  /** CHANGE 必填（人给的新 option）；ACCEPT/UNKNOWN/DEFER 携带 value = 矛盾拒绝。 */
  readonly value?: string;
  /** UNKNOWN 必填（§14：UNKNOWN 不是失败，但必须重分类——不许登记死端）。 */
  readonly unknownTriage?: UnknownTriage;
  /** 事件拍（调用方供给；零墙钟 A4：过期判定靠 seq/fingerprint，禁时间戳）。 */
  readonly seq?: number;
}

export type ResolveDecisionOutcome =
  | {
      readonly ok: true;
      /** false = 同决议重放幂等 NO_CHANGE。 */
      readonly changed: boolean;
      readonly graph: DecisionGraph;
      readonly notes: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason:
        | "unknown_decision_ref"
        | "accept_requires_recommendation"
        | "accept_conflicts_with_value"
        | "defer_conflicts_with_value"
        | "change_requires_value"
        | "unknown_requires_triage"
        | "unknown_triage_contradictory"
        | "answer_unknown"
        | "seq_invalid";
      readonly details: readonly string[];
      readonly hint: string;
    };

/** §14 六问 → 处置派生（顺序 = PRD 原文行序：derive → research → assume → defer → prototype/observe → block）。 */
export function classifyUnknownTriage(triage: UnknownTriage): UnknownDisposition {
  if (triage.can_derive) return "DERIVABLE";
  if (triage.can_research) return "RESEARCHABLE";
  if (triage.can_safely_assume) return "ASSUMPTION";
  if (triage.can_defer) return "DEFERRED_DECISION";
  if (triage.can_prototype_observe) return "DISCOVERY_REQUIRED";
  return "BLOCKER_CANDIDATE";
}

/**
 * resolveDecision（纯函数，§13.2/§14）：
 * - ACCEPT = 采纳 recommendation.option（无推荐不可 ACCEPT；ACCEPT 带 value = 矛盾拒绝）；
 * - CHANGE 必带 value（人给的新 option），notes 携带受影响 grounding 重算申报路标；
 * - UNKNOWN 必带六问 triage：按 PRD 原文行序取第一个 yes 派生处置；全 no + blocks=false =
 *   自相矛盾显式拒绝（不知怎么做又不阻塞 = 申报失真）；全 no + blocks=true →
 *   BLOCKER_CANDIDATE（09 纪律：blocker 只能从 candidate 起步，升级 HARD_BLOCKER 必须走
 *   09 blocker_triage 八问升级通路——本函数永不直接产 HARD_BLOCKER）；
 * - DEFER = 显式延后（§15 合法残留 Deferred Decision，不阻塞 sufficiency）；
 * - 幂等：同决议重放 = changed:false NO_CHANGE；重开（不同答案）允许，notes 显式记录覆盖。
 */
export function resolveDecision(
  graph: DecisionGraph,
  input: ResolveDecisionInput,
): ResolveDecisionOutcome {
  const target = graph.decisions.find((n) => n.decision_id === input.decisionId);
  if (target === undefined) {
    return {
      ok: false,
      reason: "unknown_decision_ref",
      details: [`decision "${input.decisionId}" 不在图内`],
      hint: "answer 只受理图内 Decision（--from-decision 同源词形）",
    };
  }
  if (input.seq !== undefined && (!Number.isInteger(input.seq) || input.seq < 1)) {
    return {
      ok: false,
      reason: "seq_invalid",
      details: [`seq ${String(input.seq)} 必须是 ≥1 的整数（事件拍；零墙钟 A4）`],
      hint: "调用方供给 store seq / 本地事件序",
    };
  }
  const notes: string[] = [];
  let resolution: DecisionResolution;
  switch (input.answer) {
    case "ACCEPT": {
      if (input.value !== undefined) {
        return {
          ok: false,
          reason: "accept_conflicts_with_value",
          details: ["ACCEPT 携带 value（ACCEPT 的语义就是采纳 recommendation.option——另立选项是 CHANGE）"],
          hint: "改用 --value（CHANGE）或去掉 value",
        };
      }
      if (target.recommendation === null) {
        return {
          ok: false,
          reason: "accept_requires_recommendation",
          details: [`decision ${input.decisionId} 无 recommendation，无可采纳（§13.2 Question Card 必须先展示推荐）`],
          hint: "先补齐推荐（G7 通过）再 ACCEPT",
        };
      }
      resolution = { answer: "ACCEPT", ...(input.seq !== undefined ? { seq: input.seq } : {}) };
      notes.push(`ACCEPT：采纳推荐 option ${target.recommendation.option}（§13.2）`);
      break;
    }
    case "CHANGE": {
      if (!isPlainNonEmptyString(input.value)) {
        return {
          ok: false,
          reason: "change_requires_value",
          details: ["CHANGE 必须带 value（人给的新 option）——空 CHANGE 不可判卷"],
          hint: "例：--value INCLUDE_CURRENT_INCREMENT",
        };
      }
      resolution = { answer: "CHANGE", value: input.value, ...(input.seq !== undefined ? { seq: input.seq } : {}) };
      notes.push(`CHANGE：采纳人工新 option ${input.value}（原推荐 ${target.recommendation?.option ?? "无"}被否）`);
      notes.push("受影响 grounding 需重算（re-ground）：新 option 可能改写事实前提与依赖——下一轮 ground 重跑 G-Gate（fingerprint STALE 消费为 P1）");
      break;
    }
    case "UNKNOWN": {
      const triage = input.unknownTriage;
      if (triage === undefined) {
        return {
          ok: false,
          reason: "unknown_requires_triage",
          details: ["UNKNOWN 必须携带六问 triage（§14：UNKNOWN 不是失败，但必须重新分类——登记死端违规）"],
          hint: "六问：Can derive? / Can research? / Can safely assume? / Can defer? / Can prototype-observe? / Does it truly block?",
        };
      }
      const anyRoute =
        triage.can_derive ||
        triage.can_research ||
        triage.can_safely_assume ||
        triage.can_defer ||
        triage.can_prototype_observe;
      if (!anyRoute && !triage.blocks_current_increment) {
        return {
          ok: false,
          reason: "unknown_triage_contradictory",
          details: ["六问全 no 且 blocks_current_increment=false（不知如何处置又不阻塞 = 申报自相矛盾——五问全 no 的唯一合法出口是「真阻塞」）"],
          hint: "修正六问：既然五条出路全无且必须前进，blocks_current_increment 应为 true；反之至少一条出路为 yes",
        };
      }
      const classified = classifyUnknownTriage(triage);
      resolution = { answer: "UNKNOWN", classified, ...(input.seq !== undefined ? { seq: input.seq } : {}) };
      notes.push(`UNKNOWN → 重分类 ${classified}（§14 六问，行序取第一个 yes）`);
      if (classified === "BLOCKER_CANDIDATE") {
        notes.push(
          "BLOCKER_CANDIDATE（非 HARD_BLOCKER）：按 09 纪律 blocker 只能从 candidate 起步——升级 HARD_BLOCKER 必须走 09 blocker_triage 八问升级通路（高风险且无法安全假设）",
        );
      }
      if (classified === "ASSUMPTION") {
        notes.push("ASSUMPTION 处置：须落 assumption_risk 分级（§82.4；HIGH 默认需要 Authority）");
      }
      break;
    }
    case "DEFER": {
      if (input.value !== undefined) {
        return {
          ok: false,
          reason: "defer_conflicts_with_value",
          details: ["DEFER 携带 value（DEFER 的语义是显式延后本决策，不接受附带选项）"],
          hint: "去掉 value；延后到哪一轮的说明放 why 类字段（P1)",
        };
      }
      resolution = { answer: "DEFER", ...(input.seq !== undefined ? { seq: input.seq } : {}) };
      notes.push("DEFER：显式延后（§15 合法残留 Deferred Decision——不阻塞 sufficiency，登记防丢失）");
      break;
    }
    default:
      return {
        ok: false,
        reason: "answer_unknown",
        details: [`answer "${String(input.answer)}" 不在四词形（${DECISION_ANSWER_VALUES.join("/")}，§13.2）`],
        hint: "CLI 面 --accept/--value/--unknown/--defer 四变体（PR-3 接线）",
      };
  }
  if (
    target.resolution !== null &&
    target.resolution.answer === resolution.answer &&
    target.resolution.value === resolution.value &&
    target.resolution.classified === resolution.classified
  ) {
    return {
      ok: true,
      changed: false,
      graph,
      notes: ["同决议重放：resolution 未变化——NO_CHANGE（幂等）", ...notes],
    };
  }
  if (target.resolution !== null) {
    notes.push(`重开：原 resolution（answer=${target.resolution.answer}）被覆盖——重开事实显式留痕（§19 Decision Reopen Rate 的可审计面）`);
  }
  const decisions = graph.decisions.map((node) =>
    node.decision_id === input.decisionId ? { ...node, resolution } : node,
  );
  return {
    ok: true,
    changed: true,
    graph: {
      ...graph,
      graph_fingerprint: fingerprintOf(graph.projection_fingerprint, decisions, graph.request_refs),
      decisions,
    },
    notes,
  };
}

// ============================================================
// evaluateDiscoverySufficiency（§15：九维显著改变 + 残留合法分类 + 09 msd 三轴）
// ============================================================

export interface SufficiencyResidual {
  readonly statement: string;
  readonly classification: SufficiencyResidualClassification;
}

export interface DiscoverySufficiencyInput {
  readonly graph: DecisionGraph;
  /** OPEN 之外的合法残留登记（§15：Assumption/Deferred/Future/Known Unknown）。 */
  readonly residuals: readonly SufficiencyResidual[];
  /** 09 msd_assessment 三轴（复用词形与语义——调用方按 09 判定供给）。 */
  readonly msd: {
    readonly goal_defined: boolean;
    readonly scope_defined: boolean;
    readonly acceptance_verifiable: boolean;
  };
}

export interface SufficiencyBlockingItem {
  readonly decision_id: string | null;
  readonly detail: string;
}

export interface DiscoverySufficiencyReport {
  readonly sufficient: boolean;
  /** 09 msd 三轴派生（全 true ⇒ true；任一 false ⇒ false——09 allOf 双向强制的 kernel 同款）。 */
  readonly msd_reached: boolean;
  readonly blocking: readonly SufficiencyBlockingItem[];
  readonly deferred: readonly string[];
  readonly assumptions: readonly string[];
  readonly unknowns: readonly string[];
  readonly future_considerations: readonly string[];
  readonly notes: readonly string[];
}

export type EvaluateDiscoverySufficiencyOutcome =
  | { readonly ok: true; readonly report: DiscoverySufficiencyReport }
  | {
      readonly ok: false;
      readonly reason: "residual_classification_unknown" | "residual_statement_empty";
      readonly details: readonly string[];
      readonly hint: string;
    };

/**
 * evaluateDiscoverySufficiency（纯函数，§15）：Brainstorm 的停止条件判卷面。
 * - 图侧：任何 OPEN decision（当前 class 闭包仅 SCOPE → Scope 维显著改变）→ blocking；
 *   UNKNOWN 已重分类为 DERIVABLE/RESEARCHABLE/DISCOVERY_REQUIRED/BLOCKER_CANDIDATE →
 *   blocking（取证/升级未完成）；UNKNOWN→ASSUMPTION/DEFERRED_DECISION → 合法停靠桶；
 *   已决议（ACCEPT/CHANGE）但 conflicts 未消解 → blocking（§12.3：冲突必须走治理面，
 *   带冲突晋升 = 偷渡）；
 * - 残留侧：classification 词表外 → 输入级拒绝（fail-closed）；合法残留入四桶
 *   （deferred/assumptions/unknowns[含 SOFT_UNCERTAINTY=Known Unknown]/future_considerations）；
 * - MSD：09 msd_assessment 三轴派生 msd_reached（三轴全 true ⇒ true，任一 false ⇒ false）；
 *   未达成 → blocking；
 * - 零分母显式不足（G6）：零决策图（decisions=[]）即便零残留 + MSD 三轴全绿也
 *   sufficient=false——零分母当满分是 promotion_basis=msd_reached 判据面上的假绿，
 *   显式 blocking 项携带「零分母」原因，禁冒充「已评估充分」；
 * - sufficient = blocking 为空。产出即 promotion_basis=msd_reached 的机器判据面
 *   （§15：满足后 READY_TO_PROMOTE，仍经 maintain 晋升——零新写入通道）。
 * 诚实注记：PRD §15 原文第九维 Critical Failure Behavior 的 class 映射待词表批扩容
 * （SUFFICIENCY_DIMENSIONS 为任务口径八维）——notes 显式携带，不悄悄丢弃。
 */
export function evaluateDiscoverySufficiency(
  input: DiscoverySufficiencyInput,
): EvaluateDiscoverySufficiencyOutcome {
  const details: string[] = [];
  for (const residual of input.residuals) {
    if (!isPlainNonEmptyString(residual.statement)) {
      details.push("残留 statement 必须非空（「待定」不是陈述）");
    }
    if (!(SUFFICIENCY_RESIDUAL_CLASSIFICATIONS as readonly string[]).includes(residual.classification)) {
      details.push(
        `残留分类 "${String(residual.classification)}" 不在合法残留词表（${SUFFICIENCY_RESIDUAL_CLASSIFICATIONS.join("/")}——§15：其余可以合法存在为 Assumption/Deferred Decision/Future Consideration/Known Unknown）`,
      );
    }
  }
  if (details.length > 0) {
    return {
      ok: false,
      reason: details.some((d) => d.includes("分类")) ? "residual_classification_unknown" : "residual_statement_empty",
      details,
      hint: "残留分类复用 MSD 十分类子集（SOFT_UNCERTAINTY 承载 Known Unknown）；非法分类 = 输入错误不是 insufficient",
    };
  }
  const blocking: SufficiencyBlockingItem[] = [];
  const deferred: string[] = [];
  const assumptions: string[] = [];
  const unknowns: string[] = [];
  const future: string[] = [];
  const notes: string[] = [];
  // 零分母显式不足（G6）：停止条件「不存在尚未处理且会显著改变的维度」的前提是
  // 存在决策分母——零决策图上「无 blocking」是零分母当满分，不是已评估充分。
  if (input.graph.decisions.length === 0) {
    blocking.push({
      decision_id: null,
      detail:
        "零决策图（decisions=[]）——零分母不得判 sufficient（§15 停止条件的前提是图非空；先经 Grill 暴露至少一个 Candidate Decision 再判卷，§5.1）",
    });
  }
  for (const residual of input.residuals) {
    if (residual.classification === "DEFERRED_DECISION") deferred.push(residual.statement);
    else if (residual.classification === "ASSUMPTION") assumptions.push(residual.statement);
    else if (residual.classification === "SOFT_UNCERTAINTY") unknowns.push(residual.statement);
    else future.push(residual.statement);
  }
  for (const node of input.graph.decisions) {
    const resolution = node.resolution;
    if (resolution === null) {
      const dimensions = DECISION_CLASS_TO_DIMENSIONS[node.class] ?? [];
      blocking.push({
        decision_id: node.decision_id,
        detail:
          dimensions.length > 0
            ? `OPEN decision（class ${node.class} → ${dimensions.join("/")} 维显著改变，§15）`
            : `OPEN decision（class ${node.class} 未映射显著改变维度——保守按显著处理，fail-closed）`,
      });
      continue;
    }
    if (resolution.answer === "DEFER") {
      deferred.push(`${node.decision_id}（DEFER 显式延后）`);
      continue;
    }
    if (resolution.answer === "UNKNOWN") {
      const classified = resolution.classified;
      if (classified === "ASSUMPTION") {
        assumptions.push(`${node.decision_id}（UNKNOWN→ASSUMPTION）`);
      } else if (classified === "DEFERRED_DECISION") {
        deferred.push(`${node.decision_id}（UNKNOWN→DEFERRED_DECISION）`);
      } else {
        blocking.push({
          decision_id: node.decision_id,
          detail: `UNKNOWN 重分类=${classified ?? "（缺失）"}：取证/升级未完成（§14 六问未走出路）`,
        });
      }
      continue;
    }
    // ACCEPT/CHANGE：已决议——但带未消解冲突晋升 = §12.3 偷渡。
    if (node.grounding.conflicts.length > 0) {
      blocking.push({
        decision_id: node.decision_id,
        detail: `已决议（${resolution.answer}）但 ${String(node.grounding.conflicts.length)} 条冲突未消解（§12.3：冲突必须经正式治理面裁决，带冲突晋升是偷渡）`,
      });
    }
  }
  const msd_reached =
    input.msd.goal_defined && input.msd.scope_defined && input.msd.acceptance_verifiable;
  if (!msd_reached) {
    const missing: string[] = [];
    if (!input.msd.goal_defined) missing.push("goal_defined");
    if (!input.msd.scope_defined) missing.push("scope_defined");
    if (!input.msd.acceptance_verifiable) missing.push("acceptance_verifiable");
    blocking.push({
      decision_id: null,
      detail: `MSD 未达成（09 msd_assessment 三轴未全绿：${missing.join("、")}）——§15 满足后 READY_TO_PROMOTE 的 promotion_basis=msd_reached 以此为判据面`,
    });
  }
  notes.push(
    "八维显著改变维度（任务口径）：Goal/Scope/Behavior/Authority/Acceptance/Critical Contract/Architecture Boundary/Irreversible——PRD §15 原文第九维 Critical Failure Behavior 的 class 词形映射待词表批扩容后并入（当前 class 闭包仅 SCOPE）",
  );
  notes.push("sufficient 后仍经 promote→maintain 晋升（§15/§21：零新写入通道，Discovery 层不私造第二写入面）");
  return {
    ok: true,
    report: {
      sufficient: blocking.length === 0,
      msd_reached,
      blocking,
      deferred,
      assumptions,
      unknowns,
      future_considerations: future,
      notes,
    },
  };
}

// ============================================================
// TODO(v053-p1)：invalidateDependentDecisions（§7.4 Upstream Change Invalidation）
// ============================================================
// P1 项（PRD §20 P1「Upstream Decision Invalidation」逐字）：graph + changed decision ids
// → 下游递归派生 INVALIDATED_BY_UPSTREAM_DECISION + frontier 重算 + 受影响 grounding
// fingerprint 失效重 ground。P0.5 的保守替位：frontier 对上游非 ACCEPT/CHANGE 的下游
// 一律排除（computeDecisionFrontier），node 词形已预留 resolution/value/classified 位，
// schema 18 不锁 invalidation 实现细节（字段演化走 Schema PR）。
