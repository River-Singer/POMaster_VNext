/**
 * invalidation.ts —— 失效后果分类 + projection freshness 单点判卷 + Authority 冲突
 * 呈现 + 稳定引用解析（W3 切片 FR-06/07/08/12；Case A/B/G 判据面）。
 *
 * 定位红线（PRD W3 + research dependency-authority-and-routing.md §5 必守约束）：
 * - **自动失效 ≠ 自动决策**：失效的含义是「旧结论不能直接再用」——本面纯函数零 IO
 *   零写入，不改 Human Decision 字节、不自动 REBIND 到猜测新答案、不扩大 Permit；
 *   review/REBIND 行的处置注记固定声明「不自动改/不自动执行」，裁决通路只呈现不执行
 *   （裁决是 Owner 权限）；
 * - **freshness 单点判卷**：judgeProjectionFreshness 只比较既有指纹（指纹算法归
 *   kernel projection.ts inputsFingerprint 单点、消费词形复用 Context STALE_GROUNDING
 *   ——禁第二指纹算法）；旧 generated 未重建 stale → 拒当 current authority；重建后
 *   按新指纹重新判定；历史产物无指纹记录 unjudgeable（禁事后补当前指纹冒充历史基线
 *   ——研究 §4 方案 B 逐字）；
 * - **Authority 冲突呈现与裁决分离**：同 scope/dimension 双 canonical claim → 显式
 *   Conflict + 双 claimant provenance（identity/type/location/version/supersession/
 *   Owner 证据）；消歧只认显式 supersession 声明（单向声明消歧、双向互指=矛盾仍
 *   conflicted）；**不按 mtime/文件名/自称 canonical 静默选胜者**（H 审计的 mtime
 *   裁胜者建议不采纳——W0 promotion-audit R7 同款裁定）；不同 scope（维度）合法
 *   并存不误报；裁决通路只呈现路标，零裁决输出；
 * - **稳定引用**：semantic ID（governed id / PROTOCOL.* / DECISION.* / 来源 id）承载
 *   长期机器关系；path/span/line 只导航（navigation_only + unknown 显式）；历史
 *   line-only 引用不猜测升级（AC-09）；与 W4 spec-routing.ts 的 PROTOCOL_ID_PATTERN
 *   约定对齐（复用同一词形常量，不改其合同）。
 */
import { PROTOCOL_ID_PATTERN } from "./spec-routing.js";
import { DECISION_ID_PATTERN } from "./decision-graph.js";
import { GovernedIdParseError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import {
  deriveImpactClosure,
  type DerivedImpactResult,
  type DeriveImpactInput,
  type ImpactNodeId,
  type ImpactPlaneValue,
} from "./impact-derive.js";

// ============================================================
// 后果分类（五分类闭包；no-current-task-impact = 闭包内 × 任务无关）
// ============================================================

/**
 * 失效后果五分类（PRD W3 逐字词形）：
 * - recompile：generated 投影/视图须按新输入重建；
 * - REBIND：对象/来源钉上游 revision 锚漂移——需显式重绑定申报（不自动执行）；
 * - requalify：证据要求面（SPEC.*）观察的是旧版上游——需重新取证重资格；
 * - review：Human 决策面（discovery 平面 DECISION.*）受上游变化影响——需 Human
 *   重审（自动失效不代替 Human 重做决策——逐字红线）；
 * - no-current-task-impact：节点在受影响闭包内但与当前任务范围无交集（保守合同：
 *   无依赖证明 ≠ 证明无影响——行保留呈现不过滤，AC-14 相关语义 unknown 不被过滤）。
 */
export const INVALIDATION_CONSEQUENCE_VALUES = [
  "recompile",
  "REBIND",
  "requalify",
  "review",
  "no-current-task-impact",
] as const;
export type InvalidationConsequenceValue = (typeof INVALIDATION_CONSEQUENCE_VALUES)[number];

/** SPEC. 前缀（Evidence Spec 一等对象——vocab-pr-0008；重资格面的身份判据）。 */
const SPEC_PREFIX = "SPEC.";

/**
 * 后果分类（确定性表；同输入同输出）。taskScope 缺席 = 不做任务二分（全部按受
 * 影响呈现——无申报不猜测任务范围）；在场则范围外节点 no-current-task-impact。
 */
export function classifyConsequence(
  node: { readonly plane: ImpactPlaneValue; readonly id: string },
  context?: { readonly taskScope?: readonly string[] },
): { readonly consequence: InvalidationConsequenceValue; readonly why: string } {
  if (context?.taskScope !== undefined && !context.taskScope.includes(node.id)) {
    return {
      consequence: "no-current-task-impact",
      why: `节点在受影响闭包内但不在当前任务范围申报（taskScope ${String(context.taskScope.length)} 项）内——保守呈现不过滤；无依赖证明 ≠ 证明无影响`,
    };
  }
  switch (node.plane) {
    case "generated":
      return {
        consequence: "recompile",
        why: "generated 产物声明的输入已变化（inputs 指纹将漂移）——旧产物须按新输入重编译后才能重新判 fresh",
      };
    case "discovery":
      return {
        consequence: "review",
        why: "Human Decision 面受上游变化影响（自动失效不代替 Human 重做决策）——须人工复审后显式重开或确认",
      };
    case "truth":
      return node.id.startsWith(SPEC_PREFIX)
        ? {
            consequence: "requalify",
            why: "证据要求面（SPEC.*）锚定的上游已变化——既有证据观察的是旧版，须重新取证重资格",
          }
        : {
            consequence: "REBIND",
            why: "对象钉上游锚（source_refs/denominator）漂移——须显式重绑定申报后对象才可继续引用新上游（不自动改写对象）",
          };
    case "source":
      return {
        consequence: "REBIND",
        why: "来源版本注记漂移（version 锚须显式重登记）——消费方重绑定前不得默认引用新版本语义",
      };
    case "catalog":
      return {
        consequence: "review",
        why: "catalog 条目（原型面）受波及——采用实例的语义适配须人工复核",
      };
  }
}

// ============================================================
// 失效后果行（闭包 × 后果分类整合；why 理由链）
// ============================================================

export interface InvalidationRow {
  readonly plane: ImpactPlaneValue;
  readonly id: string;
  readonly consequence: InvalidationConsequenceValue;
  readonly depth: number;
  readonly why: {
    /** 上游指纹/revision 变化点（Case A 的「BP v1→v2」呈现位）。 */
    readonly upstream_change: {
      readonly root: ImpactNodeId;
      readonly revision_before: string | null;
      readonly revision_after: string | null;
    };
    /** 直接触发本行的命中边（why 链第一跳；全链见 closure rows path_edge_ids）。 */
    readonly hit_edge: {
      readonly edge_id: string;
      readonly kind: string;
      readonly depth: number;
    };
    /** 分类理由（classifyConsequence 逐字）。 */
    readonly reason: string;
  };
  /** 本行处置是否必须 Human 参与（review 类恒 true——自动失效不代替 Human）。 */
  readonly requires_human: boolean;
  /** 处置注记（review/REBIND 行固定携带「不自动改/不自动执行」红线词形）。 */
  readonly disposition_note: string;
}

export interface InvalidationChange {
  /** 变化上游（受影响闭包的 root）。 */
  readonly root: ImpactNodeId;
  /** 上游 revision 变化（before→after；null = 无锚记录——显式缺席）。 */
  readonly revision_before: string | null;
  readonly revision_after: string | null;
}

export interface DeriveInvalidationOptions {
  readonly maxDepth?: number;
  /** 当前任务影响范围申报（id 集合；缺席 = 不做任务二分）。 */
  readonly taskScope?: readonly string[];
}

export interface DeriveInvalidationResult {
  readonly rows: readonly InvalidationRow[];
  /** 底层派生闭包（path/unresolved/分母注记全量——rows 是其后果投影）。 */
  readonly closure: DerivedImpactResult;
}

/**
 * deriveInvalidationRows（纯函数）：派生闭包（impact-derive.ts）× 后果分类整合——
 * 每条后果行携带 why 理由链（上游变化点 revision before/after + 命中边）与处置
 * 红线注记。自动失效 ≠ 自动决策：本函数零写入零裁决输出，Human Decision 字节
 * 不可能被本面触碰（Case A 字节不变断言的合同保证）。
 */
export function deriveInvalidationRows(
  input: DeriveImpactInput,
  change: InvalidationChange,
  options?: DeriveInvalidationOptions,
): DeriveInvalidationResult {
  const closure = deriveImpactClosure(input, change.root, { maxDepth: options?.maxDepth });
  const taskScope = options?.taskScope;
  const rows: InvalidationRow[] = closure.rows.map((row) => {
    const classified = classifyConsequence({ plane: row.plane, id: row.id }, { taskScope });
    const requiresHuman =
      classified.consequence === "review" || classified.consequence === "requalify";
    const dispositionNote =
      classified.consequence === "review"
        ? "须 Human 重审后显式重开或确认（系统无自动裁决通路——不自动改 Human Decision 字节）"
        : classified.consequence === "REBIND"
          ? "旧绑定不再可用（不自动 REBIND 到猜测新答案）——重绑定须显式申报后生效"
          : classified.consequence === "recompile"
            ? "旧产物拒当 current authority（消费端 stale 拒收）——重编译后按新指纹重新判定（重建动作由既有命令面执行，本面零写入）"
            : classified.consequence === "requalify"
              ? "既有证据不再自动 qualified（不自动改证据 verdict）——重新取证后按既有资格面重新判定"
              : "与当前任务范围无交集——保留全项目可见性，不因本行阻断当前任务（AC-14 无关 unknown 不阻小改）";
    return {
      plane: row.plane,
      id: row.id,
      consequence: classified.consequence,
      depth: row.depth,
      why: {
        upstream_change: {
          root: change.root,
          revision_before: change.revision_before,
          revision_after: change.revision_after,
        },
        hit_edge: {
          edge_id: row.via_edge_id,
          kind: row.via_kind,
          depth: row.depth,
        },
        reason: classified.why,
      },
      requires_human: requiresHuman,
      disposition_note: dispositionNote,
    };
  });
  return { rows, closure };
}

// ============================================================
// projection freshness（四态单点判卷；Context STALE_GROUNDING 模式）
// ============================================================

/**
 * projection freshness 四态（Context absent/fresh/stale_grounding 三态 + unjudgeable）。
 * STALE_GROUNDING 词形原样复用（vocab-lock presentation_axes.context_manifest_words
 * 同词——不发明第二 stale 词形）；unjudgeable 承载「历史产物无指纹记录/消费端无法
 * 重算」的诚实不可判（非绿不假绿）。
 */
export const PROJECTION_FRESHNESS_STATES = [
  "fresh",
  "stale_grounding",
  "absent",
  "unjudgeable",
] as const;
export type ProjectionFreshnessState = (typeof PROJECTION_FRESHNESS_STATES)[number];

/**
 * freshness 已接入 producer 清单（有落盘 inputs 指纹键可判的产物面——诚实清单随
 * 结果/呈现携带，「不能声称所有 generated 文件已覆盖」的合同承载位）。
 */
export const FRESHNESS_ADAPTED_PRODUCERS: readonly string[] = [
  "context manifest（state/contexts/*.context.json——inputs_fingerprint 键在座，vNext Batch 2 D7；stale 判卷经本函数单点比较，指纹算法归 kernel projection inputsFingerprint 单点）",
];

/**
 * freshness 未接入 producer 诚实清单（无落盘指纹记录位——消费端 unjudgeable，
 * 禁事后补当前指纹冒充历史基线；接入须先给产物补指纹键，不在本面猜测）。
 */
export const FRESHNESS_UNADAPTED_PRODUCERS: readonly string[] = [
  "readiness 视图（纯读投影无落盘产物——无指纹记录位可判）",
  "handoff 档案（research handoff 落盘无 inputs_fingerprint 键——消费端 unjudgeable）",
  "reconciliation 报告（无 inputs_fingerprint 键——消费端 unjudgeable）",
  "其余无指纹键的 generated 文档（summary 等——消费端 unjudgeable，不猜测升级为 stale/fresh）",
];

export interface ProjectionFreshnessInput {
  /** 产物是否在盘（absent 判据）。 */
  readonly artifact_present: boolean;
  /** 产物落盘时记录的 inputs 指纹（null = 无指纹记录——历史产物诚实态）。 */
  readonly recorded_inputs_fingerprint: string | null;
  /** 消费端重算的 inputs 指纹（null = 无法重算）。 */
  readonly recomputed_inputs_fingerprint: string | null;
}

export interface ProjectionFreshnessJudgment {
  readonly state: ProjectionFreshnessState;
  /** 判卷依据（确定性词形；stale 恒含 STALE_GROUNDING 机器词形）。 */
  readonly detail: string;
  /**
   * 可否充当 current authoritative context（fresh 恒 true；stale/absent/unjudgeable
   * 恒 false——旧 generated 未重建不得充当 current authoritative context，R6）。
   */
  readonly current_authority_eligible: boolean;
}

/**
 * judgeProjectionFreshness（纯函数；freshness 单点判卷合同）：只比较调用方给定的
 * recorded/recomputed 指纹——指纹算法不在本面（kernel projection inputsFingerprint
 * 单点计算，Context compile/judgeTaskContextFreshness 同源），本函数是全部 generated
 * 消费面共享的四态比较器（禁第二比较器）。
 */
export function judgeProjectionFreshness(
  input: ProjectionFreshnessInput,
): ProjectionFreshnessJudgment {
  if (!input.artifact_present) {
    return {
      state: "absent",
      detail: "产物不在盘（absent——无产物可判；不冒充已判 fresh/stale）",
      current_authority_eligible: false,
    };
  }
  if (input.recorded_inputs_fingerprint === null) {
    return {
      state: "unjudgeable",
      detail:
        "产物在盘但无 inputs 指纹记录（历史产物未绑定生成时输入）——unjudgeable：禁事后补当前指纹冒充历史基线，不得充当 current authority；重编译后按新指纹判定",
      current_authority_eligible: false,
    };
  }
  if (input.recomputed_inputs_fingerprint === null) {
    return {
      state: "unjudgeable",
      detail:
        "消费端无法重算 inputs 指纹（输入面不可达）——unjudgeable：未知不能冒充 fresh，不得充当 current authority",
      current_authority_eligible: false,
    };
  }
  if (input.recorded_inputs_fingerprint === input.recomputed_inputs_fingerprint) {
    return {
      state: "fresh",
      detail: "产物记录指纹与重算指纹一致（同输入重放）——可充当 current authoritative context",
      current_authority_eligible: true,
    };
  }
  return {
    state: "stale_grounding",
    detail: `STALE_GROUNDING：产物记录 inputs_fingerprint=${input.recorded_inputs_fingerprint} 与当前重算 ${input.recomputed_inputs_fingerprint} 漂移——旧 generated 未重建不得充当 current authoritative context；重编译后按新指纹重新判定`,
    current_authority_eligible: false,
  };
}

// ============================================================
// Authority 冲突（同 scope/dimension 双 canonical；呈现与裁决分离）
// ============================================================

/** Authority claim 输入（sources/index.yaml 装载产物 + 消歧申报位）。 */
export interface AuthorityClaimInput {
  /** 来源 identity（sources entry id——项目内稳定锚）。 */
  readonly source_id: string;
  /** 来源工件类型（开放词形原样呈现）。 */
  readonly type: string;
  /** 来源位置（repo 相对路径或 URL——provenance 呈现位，非判卷输入）。 */
  readonly location: string;
  /** 版本注记（null = 未申报——显式缺席，不冒充已锚定）。 */
  readonly version: string | null;
  /** 正权威维度（authoritative_for 原样）。 */
  readonly authoritative_for: readonly string[];
  /**
   * 显式 supersession 声明（本来源已被谁取代——声明锚须来自显式登记面如对象信封
   * supersedes 链 / Owner 台账锚；null = 无声明）。禁 mtime/文件名/自称 canonical
   * 推断——本面无这些输入，声明是唯一消歧通路。
   */
  readonly superseded_by: string | null;
  /** Owner 证据锚（EXC-n / 裁决台账引用；null = 无——provenance 呈现位）。 */
  readonly owner_evidence: string | null;
}

export interface AuthorityConflictClaimant {
  readonly source_id: string;
  readonly type: string;
  readonly location: string;
  readonly version: string | null;
  readonly superseded_by: string | null;
  readonly owner_evidence: string | null;
}

export interface AuthorityConflictRow {
  /** 冲突维度（同 scope/dimension 的 scope 位——sources 开放维度词）。 */
  readonly dimension: string;
  readonly claimants: readonly AuthorityConflictClaimant[];
  /**
   * 消歧状态：conflicted = 未消歧双活（须 Owner 裁决）；superseded = 存在显式单向
   * supersession 声明（呈现取代关系——不判 conflict，但仍呈现供复核）。
   */
  readonly status: "conflicted" | "superseded";
  /** 冲突陈述（确定性词形；点名维度与 claimants）。 */
  readonly detail: string;
  /** 裁决通路（呈现层指路——裁决是 Owner 权限，本面零裁决输出）。 */
  readonly adjudication_route: string;
}

export interface AuthorityConflictReport {
  readonly conflicts: readonly AuthorityConflictRow[];
  /** 不同维度合法并存的 claim 数（不误报的可见性计数）。 */
  readonly coexisting: number;
  /** 判卷边界注记（mtime/文件名/自称 canonical 禁令的固定词形）。 */
  readonly note: string;
}

/**
 * deriveAuthorityConflicts（纯函数）：同维度（authoritative_for 交集）≥2 个 claim →
 * 冲突候选；显式单向 supersession 声明（A 被 B 取代且 B 在同一 claimant 集）→
 * superseded 消歧呈现；无声明或双向互指 → conflicted。不同维度并存零冲突（不误报）。
 * provenance 全显式（identity/type/location/version/superseded_by/owner_evidence）；
 * 裁决通路只呈现路标（Owner 权限），本面零裁决输出零胜者选择。
 */
export function deriveAuthorityConflicts(
  claims: readonly AuthorityClaimInput[],
): AuthorityConflictReport {
  const note =
    "判卷边界：不按 mtime、不按文件名、不按文档自称 canonical 静默选胜者（H 审计 mtime 建议不采纳——W0 promotion-audit R7 同款裁定）；消歧只认显式 supersession 声明；冲突呈现与 Human 裁决通路分离（裁决是 Owner 权限）";
  const adjudicationRoute =
    "Owner 裁决通路（呈现即指路，本面零裁决）：修订 sources/index.yaml 双轴申报（声明 supersession 或收窄维度）；差异显式登记 pomaster ledger record --classification CONFLICT；裁决留痕由 Owner 自选（产品仓 corpus 台账或消费项目内 Owner 留痕处）";

  // —— 维度 → claimants 索引（同 scope/dimension 聚类） ——
  const byDimension = new Map<string, AuthorityClaimInput[]>();
  for (const claim of claims) {
    for (const dimension of claim.authoritative_for) {
      const list = byDimension.get(dimension) ?? [];
      list.push(claim);
      byDimension.set(dimension, list);
    }
  }
  const claimantOf = (claim: AuthorityClaimInput): AuthorityConflictClaimant => ({
    source_id: claim.source_id,
    type: claim.type,
    location: claim.location,
    version: claim.version,
    superseded_by: claim.superseded_by,
    owner_evidence: claim.owner_evidence,
  });
  const conflicts: AuthorityConflictRow[] = [];
  const seenDimensions = new Set<string>();
  for (const [dimension, dimensionClaims] of byDimension) {
    if (dimensionClaims.length < 2) continue;
    if (seenDimensions.has(dimension)) continue;
    seenDimensions.add(dimension);
    const byId = new Map(dimensionClaims.map((claim) => [claim.source_id, claim]));
    // 单向 supersession 消歧判定：某 claimant 的 superseded_by 指向同维度在座 claimant
    // 且无反向互指 → superseded；其余（无声明 / 双向互指）→ conflicted。
    let supersededPair = false;
    let contradictory = false;
    for (const claim of dimensionClaims) {
      if (claim.superseded_by === null) continue;
      const successor = byId.get(claim.superseded_by);
      if (successor === undefined) continue; // 取代者不在同维度在座——不影响本维度消歧。
      if (successor.superseded_by === claim.source_id) {
        contradictory = true; // 双向互指 = 矛盾声明，禁静默任选。
      } else {
        supersededPair = true;
      }
    }
    const claimants = dimensionClaims
      .map(claimantOf)
      .sort((a, b) => (a.source_id < b.source_id ? -1 : a.source_id > b.source_id ? 1 : 0));
    conflicts.push({
      dimension,
      claimants,
      status: supersededPair && !contradictory ? "superseded" : "conflicted",
      detail:
        `维度「${dimension}」存在 ${String(dimensionClaims.length)} 个权威声明（${dimensionClaims
          .map((claim) => `${claim.source_id}${claim.version === null ? "" : `@${claim.version}`}`)
          .sort()
          .join(" vs ")}）——同 scope/dimension 双 canonical 未消歧须显式呈现（禁静默选胜者）`,
      adjudication_route: adjudicationRoute,
    });
  }
  conflicts.sort((a, b) => (a.dimension < b.dimension ? -1 : a.dimension > b.dimension ? 1 : 0));
  const coexisting = claims.filter(
    (claim) => !conflicts.some(
      (conflict) => conflict.status === "conflicted" &&
        conflict.claimants.some((claimant) => claimant.source_id === claim.source_id),
    ),
  ).length;
  return { conflicts, coexisting, note };
}

// ============================================================
// 稳定引用解析（semantic ID 承载机器关系；path/span/line 只导航）
// ============================================================

/** 稳定引用解析三态（semantic_id / navigation_only / unresolvable）。 */
export const STABLE_REFERENCE_KINDS = [
  "semantic_id",
  "navigation_only",
  "unresolvable",
] as const;
export type StableReferenceKind = (typeof STABLE_REFERENCE_KINDS)[number];

export interface StableReferenceResolution {
  readonly ref: string;
  readonly kind: StableReferenceKind;
  /** kind=semantic_id 时的机器身份（原样回传）；其余恒 null。 */
  readonly semantic_id: string | null;
  /** 机器关系可用性（semantic_id 恒 true；navigation_only/unresolvable 恒 false）。 */
  readonly machine_relation_eligible: boolean;
  /** unknown 显式位（semantic_id = null；导航位/unresolvable 携带不猜测升级的理由）。 */
  readonly unknown_reason: string | null;
}

/** sources entry id 词形（20-sources-authority schema source_entry.id 同法式）。 */
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** 行号/锚导航词形（路径:数字 或 #L数字 / #锚——只导航不进机器关系）。 */
const LINE_ANCHOR_PATTERN = /:[0-9]+$|#L[0-9]+$/;

/**
 * resolveStableReference（纯函数）：引用词形四判——
 * - governed id（A5 closed-world）/ PROTOCOL.*（W4 spec-routing 同词形常量复用）/
 *   DECISION.*（Discovery 局部词形）/ 来源 id（20 schema 词形）→ semantic_id
 *   （机器关系可用——长期关系以它承载）；
 * - 含行号锚或路径词形 → navigation_only + unknown 显式（path/span/line 只导航；
 *   历史行号引用插入行后即漂移——显式 unknown 不猜测升级，AC-09）；
 * - 空引用 → unresolvable。
 */
export function resolveStableReference(ref: string): StableReferenceResolution {
  if (ref.length === 0) {
    return {
      ref,
      kind: "unresolvable",
      semantic_id: null,
      machine_relation_eligible: false,
      unknown_reason: "引用为空（unresolvable——显式缺席非静默）",
    };
  }
  let governedOk = false;
  try {
    parseGovernedId(ref);
    governedOk = true;
  } catch (error) {
    if (!(error instanceof GovernedIdParseError)) throw error;
  }
  if (governedOk || PROTOCOL_ID_PATTERN.test(ref) || DECISION_ID_PATTERN.test(ref)) {
    return {
      ref,
      kind: "semantic_id",
      semantic_id: ref,
      machine_relation_eligible: true,
      unknown_reason: null,
    };
  }
  if (SOURCE_ID_PATTERN.test(ref)) {
    return {
      ref,
      kind: "semantic_id",
      semantic_id: ref,
      machine_relation_eligible: true,
      unknown_reason: null,
    };
  }
  if (LINE_ANCHOR_PATTERN.test(ref)) {
    return {
      ref,
      kind: "navigation_only",
      semantic_id: null,
      machine_relation_eligible: false,
      unknown_reason:
        "line-only 引用（path:line 只导航——历史行号在插入行后漂移）：机器关系 unknown 显式，不猜测升级为 semantic id（AC-09）",
    };
  }
  if (ref.includes("/") || ref.includes("\\")) {
    return {
      ref,
      kind: "navigation_only",
      semantic_id: null,
      machine_relation_eligible: false,
      unknown_reason:
        "path-only 引用（路径只导航不进机器关系——内容位可重挂，机器关系 unknown 显式，不猜测升级，AC-09）",
    };
  }
  return {
    ref,
    kind: "unresolvable",
    semantic_id: null,
    machine_relation_eligible: false,
    unknown_reason: `引用词形不可解析为已知身份面（governed id / PROTOCOL.* / DECISION.* / 来源 id / 路径）：${ref}`,
  };
}
