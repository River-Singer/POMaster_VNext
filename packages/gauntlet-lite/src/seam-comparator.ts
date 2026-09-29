/**
 * seam-comparator.ts —— mock/real seam 词形与比较核（W5-FR09；契约
 * w5-probe-contract §4；MASTer 经验驱动优化战役 Wave 5）。
 *
 * 职责面：
 * - SeamLegObservation：runtime report v2 的加性可选段 seam_observation 的闭合词形
 *   （双腿各自自报的观察集合——比较对象，非判卷真值；判卷以比较器逐维度对账为准，
 *   C5「永不信任自报」纪律在 seam 面的落点是：比较器输出逐维度判定+理由，分歧=非绿）。
 * - compareSeamObservations（W5.2 落）：纯函数核——输入双腿 observation+oracle，
 *   输出逐维度对账（shape/nullability、status/error semantics、mutation outcome、
 *   state transition、visibility；一致/分歧/不可判显式）+理由；按 oracle 归一，
 *   不要求字节相等（随机 ID/时间戳等不参与）。
 *
 * 词形纪律：本模块一切字段名/闭包 = SP 提案待追认；不新增工具注册面、不重造
 * runtime runner（比较核是编排层义务判定的纯函数件）。
 */

/** shape 字段词形（shape/nullability 比较维度的载体；detail-only 缺值腿必测）。 */
export interface SeamShapeField {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
}

/** mutation outcome 词形（落库 vs 仅解析；undoable=null=不可判——软删 vs 硬删可恢复性）。 */
export interface SeamMutationObservation {
  readonly persisted: boolean;
  readonly undoable: boolean | null;
}

/**
 * 单腿 seam 观察（v2 report.seam_observation 闭合词形）：五比较维度的载体。
 * 闭合键：operation_id/contract_ref/scenario_ref/shape_fields/error_semantics/
 * mutation/state_transition/visible——之外拒绝（fail-closed）。
 */
export interface SeamLegObservation {
  readonly operation_id: string;
  readonly contract_ref: string | null;
  readonly scenario_ref: string;
  readonly shape_fields: readonly SeamShapeField[];
  /** 错误码语义词集（status/error semantics 维度；比较按集合相等——排序归一）。 */
  readonly error_semantics: readonly string[];
  readonly mutation: SeamMutationObservation;
  /** 归一状态变化描述（state transition 维度；null=该腿未观察=不可判）。 */
  readonly state_transition: string | null;
  /** oracle 通道+过滤上下文下可见（visibility 维度；null=不可判）。 */
  readonly visible: boolean | null;
}

/** seam 比较维度词形（契约 §4 五维；顺序固定——输出字节稳定）。 */
export const SEAM_DIMENSIONS = [
  "shape_nullability",
  "error_semantics",
  "mutation_outcome",
  "state_transition",
  "visibility",
] as const;
export type SeamDimension = (typeof SEAM_DIMENSIONS)[number];

/** 单维度判定词形：consistent=一致 | divergent=分歧 | undecidable=不可判（显式非绿）。 */
export type SeamDimensionOutcome = "consistent" | "divergent" | "undecidable";
