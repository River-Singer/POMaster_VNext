/**
 * seam-comparator.ts —— mock/real seam 词形与比较核（W5-FR09；契约
 * w5-probe-contract §4；MASTer 经验驱动优化战役 Wave 5）。
 *
 * 职责面：
 * - SeamLegObservation：runtime report v2 的加性可选段 seam_observation 的闭合词形
 *   （双腿各自自报的观察集合——比较对象，非判卷真值；判卷以比较器逐维度对账为准，
 *   C5「永不信任自报」纪律在 seam 面的落点是：比较器输出逐维度判定+理由，分歧=非绿）。
 * - compareSeamObservations：纯函数核——输入双腿 observation+oracle，输出逐维度
 *   对账（shape/nullability、status/error semantics、mutation outcome、state
 *   transition、visibility；一致/分歧/不可判显式）+理由；按 oracle 归一，不要求
 *   字节相等（随机 ID/时间戳等不参与）。消费归 plan-runner seam 义务判定（编排层
 *   义务未满足=cap 非绿——adapter 判卷语义不动）。
 *
 * 词形纪律：本模块一切字段名/闭包 = SP 提案待追认（非战役词形维持——收编走词汇表 PR
 * 逐批转正）；战役收编面（x-vocab-source: vocab-lock master_campaign_vocab，PR-0011，
 * Owner 裁定 1=A 2026-09-30）：seam_role 两值 / oracle visible_via/mapping_fields 词族
 * 已入锁。不新增工具注册面、不重造
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

/** 单维度对账条目（判定+理由——分歧/不可判必须显式点名，禁静默）。 */
export interface SeamDimensionVerdict {
  readonly dimension: SeamDimension;
  readonly outcome: SeamDimensionOutcome;
  readonly reason: string;
}

/** oracle 归一面（比较器消费的 oracle 最小面——BusinessObservationOracle 的可见性/字段义务）。 */
export interface SeamOracleInput {
  readonly visible_via: string;
  readonly mapping_fields: readonly string[];
}

/** seam 比较结果（纯函数核输出；divergent=非绿，undecidable=显式非绿待补证据）。 */
export interface SeamComparisonResult {
  readonly mock_leg: string;
  readonly real_leg: string;
  readonly operation_id: string | null;
  readonly scenario_ref: string | null;
  readonly dimensions: readonly SeamDimensionVerdict[];
  /** consistent=五维全一致且身份对齐；divergent=存在分歧；undecidable=无分歧但有不可判维度。 */
  readonly verdict: "consistent" | "divergent" | "undecidable";
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * mock/real seam 比较核（W5-FR09 契约 §4；纯函数零 I/O 零墙钟——同输入同输出）。
 * 按 oracle 归一、不要求字节相等（随机 ID/时间戳不参与）；五维度逐一对账：
 * - shape/nullability：字段集并集逐字段对账（type/nullable 逐字段相等；单腿独有
 *   字段=分歧——mock 承诺 real 缺席或反之即 shape 漂移）；oracle.mapping_fields
 *   在任一腿缺席=分歧（重读后必须出现的字段集——detail-only 缺值不容忍）。
 * - status/error semantics：错误语义词集（排序去重）相等。
 * - mutation outcome：persisted/undoable 对账（persisted 不等=Case E 落库 vs 仅解析
 *   分歧；undoable 缺席腿=undecidable 显式）。
 * - state transition：归一状态变化字符串对账；null=不可判。
 * - visibility：oracle 声明通道下两腿 visible 对账；oracle 缺席或腿值 null=不可判。
 * operation/scenario 身份断裂（同 operation/contract/scenario 绑定被违反）= mutation
 * 维度显式分歧（比较对象已不是同一义务的两腿）。
 */
export function compareSeamObservations(input: {
  readonly mock: SeamLegObservation;
  readonly real: SeamLegObservation;
  readonly mockLegId: string;
  readonly realLegId: string;
  readonly oracle: SeamOracleInput | null;
}): SeamComparisonResult {
  const { mock, real, mockLegId, realLegId, oracle } = input;
  const dimensions: SeamDimensionVerdict[] = [];

  // —— 身份对账（同一 operation/contract/scenario 绑定；断裂=显式分歧）——
  const identityAligned =
    mock.operation_id === real.operation_id && mock.scenario_ref === real.scenario_ref;

  // 1) shape/nullability
  const mockFields = new Map(mock.shape_fields.map((field) => [field.name, field]));
  const realFields = new Map(real.shape_fields.map((field) => [field.name, field]));
  const unionNames = sortedUnique([...mockFields.keys(), ...realFields.keys()]);
  const shapeReasons: string[] = [];
  let shapeOutcome: SeamDimensionOutcome = "consistent";
  for (const name of unionNames) {
    const inMock = mockFields.get(name);
    const inReal = realFields.get(name);
    if (inMock === undefined) {
      shapeOutcome = "divergent";
      shapeReasons.push(`${name}: 仅 real 腿在册（mock 缺席——shape 漂移）`);
      continue;
    }
    if (inReal === undefined) {
      shapeOutcome = "divergent";
      shapeReasons.push(`${name}: 仅 mock 腿在册（real 缺席——mock 承诺超出 real）`);
      continue;
    }
    if (inMock.type !== inReal.type) {
      shapeOutcome = "divergent";
      shapeReasons.push(`${name}: type ${inMock.type} ≠ ${inReal.type}`);
      continue;
    }
    if (inMock.nullable !== inReal.nullable) {
      shapeOutcome = "divergent";
      shapeReasons.push(`${name}: nullable ${String(inMock.nullable)} ≠ ${String(inReal.nullable)}（detail-only 缺值腿分歧）`);
    }
  }
  for (const field of oracle?.mapping_fields ?? []) {
    if (!mockFields.has(field) || !realFields.has(field)) {
      shapeOutcome = "divergent";
      shapeReasons.push(`${field}: oracle mapping_fields 在${mockFields.has(field) ? " real" : " mock"} 腿缺席（重读后必须出现——detail-only 缺值不容忍）`);
    }
  }
  dimensions.push({
    dimension: "shape_nullability",
    outcome: shapeOutcome,
    reason: shapeReasons.length === 0 ? `字段集 ${String(unionNames.length)} 项逐字段 type/nullable 对齐${oracle !== null && oracle.mapping_fields.length > 0 ? `（oracle mapping_fields ${oracle.mapping_fields.length} 项全在册）` : ""}` : shapeReasons.join("；"),
  });

  // 2) status/error semantics
  const mockErrors = sortedUnique(mock.error_semantics);
  const realErrors = sortedUnique(real.error_semantics);
  const errorEqual = mockErrors.length === realErrors.length && mockErrors.every((entry, index) => entry === realErrors[index]);
  dimensions.push({
    dimension: "error_semantics",
    outcome: errorEqual ? "consistent" : "divergent",
    reason: errorEqual
      ? `错误语义词集对齐（${String(mockErrors.length)} 项）`
      : `错误语义分歧：mock=[${mockErrors.join(",")}] real=[${realErrors.join(",")}]`,
  });

  // 3) mutation outcome（Case E 核心：落库 vs 仅解析）
  let mutationOutcome: SeamDimensionOutcome;
  let mutationReason: string;
  if (mock.mutation.persisted !== real.mutation.persisted) {
    mutationOutcome = "divergent";
    mutationReason = `mutation 分歧：mock persisted=${String(mock.mutation.persisted)} ≠ real persisted=${String(real.mutation.persisted)}（落库 vs 仅解析——shape 对称不证明副作用对称）`;
  } else if (mock.mutation.undoable === null || real.mutation.undoable === null) {
    mutationOutcome = "undecidable";
    mutationReason = "undoable 缺腿未观察（软删 vs 硬删可恢复性不可判——显式非绿待补证据）";
  } else if (mock.mutation.undoable !== real.mutation.undoable) {
    mutationOutcome = "divergent";
    mutationReason = `mutation 分歧：undoable ${String(mock.mutation.undoable)} ≠ ${String(real.mutation.undoable)}（软删 vs 硬删——可恢复性不对称）`;
  } else {
    mutationOutcome = "consistent";
    mutationReason = `persisted=${String(mock.mutation.persisted)} undoable=${String(mock.mutation.undoable)} 两腿对齐`;
  }
  if (!identityAligned) {
    mutationOutcome = "divergent";
    mutationReason = `${mutationReason}；身份断裂：operation mock=${mock.operation_id} ≠ real=${real.operation_id} 或 scenario mock=${mock.scenario_ref} ≠ real=${real.scenario_ref}（非同一义务的两腿）`;
  }
  dimensions.push({ dimension: "mutation_outcome", outcome: mutationOutcome, reason: mutationReason });

  // 4) state transition
  let stateOutcome: SeamDimensionOutcome;
  let stateReason: string;
  if (mock.state_transition === null || real.state_transition === null) {
    stateOutcome = "undecidable";
    stateReason = "state_transition 缺腿未观察（null=不可判——显式呈现）";
  } else if (mock.state_transition === real.state_transition) {
    stateOutcome = "consistent";
    stateReason = `状态变化对齐（${mock.state_transition}）`;
  } else {
    stateOutcome = "divergent";
    stateReason = `状态变化分歧：mock=${mock.state_transition} ≠ real=${real.state_transition}`;
  }
  dimensions.push({ dimension: "state_transition", outcome: stateOutcome, reason: stateReason });

  // 5) visibility（§1 oracle：声明通道+过滤上下文下确实出现）
  let visibleOutcome: SeamDimensionOutcome;
  let visibleReason: string;
  if (oracle === null) {
    visibleOutcome = "undecidable";
    visibleReason = "oracle 缺席（无可见性义务声明——visibility 维度不可判）";
  } else if (mock.visible === null || real.visible === null) {
    visibleOutcome = "undecidable";
    visibleReason = `visible 缺腿未观察（oracle 通道=${oracle.visible_via}）`;
  } else if (mock.visible === true && real.visible === true) {
    visibleOutcome = "consistent";
    visibleReason = `两腿在 oracle 通道 ${oracle.visible_via} 下均可见`;
  } else {
    visibleOutcome = "divergent";
    visibleReason = `可见性分歧（oracle 通道=${oracle.visible_via}）：mock visible=${String(mock.visible)} real visible=${String(real.visible)}`;
  }
  dimensions.push({ dimension: "visibility", outcome: visibleOutcome, reason: visibleReason });

  const hasDivergent = dimensions.some((row) => row.outcome === "divergent");
  const hasUndecidable = dimensions.some((row) => row.outcome === "undecidable");
  return {
    mock_leg: mockLegId,
    real_leg: realLegId,
    operation_id: mock.operation_id,
    scenario_ref: mock.scenario_ref,
    dimensions,
    verdict: hasDivergent ? "divergent" : hasUndecidable ? "undecidable" : "consistent",
  };
}
