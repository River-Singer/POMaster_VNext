/**
 * production.ts —— `pomaster production` 命令面（P34b · PRD §95 全节 + §30 第四态 +
 * §55.1 + §90.4；docs/wave3-plan.md P34 出口判据的命令面侧）。
 *
 * **命令面命名权呈报项**：PRD §44 命令清单未定义 production 子命令（§95 只有概念
 * 面）——命令面词形是新造，全部进 @pomaster/schemas vocab.ts P34 段待收编注记
 * （absent_in_vocab_lock__pending_vocab_pr）+ docs/production-feedback-p34-report.md
 * §2 呈报 Owner（命令面命名权）。
 *
 * 命令组（--json envelope 全覆盖；判卷/落盘权威在 @pomaster/kernel production.ts
 * P34a 语义入口，本包只做 argv 收敛、错误词形映射与呈现）：
 * - band define <band-id>            ControlBand 定义落 .pomaster/production/bands/
 *                                    （phase 恒 IN_PRODUCTION——构造面封条在 kernel；
 *                                    谓词字段机校验 = 五算子闭集 + 数值阈值）；
 * - band list                        band 定义清单（无目录 = 显式空合法态）；
 * - evaluate <band-id>               recordObservation（evaluateControlBand 三态判定
 *                                    + observation 台账落账；BREACHED 时 evidence 产物
 *                                    同批落账 + envelope evidence_ref）；
 *                                    --value N | --observations-file path 二选一
 *                                    （观测缺席 = OBSERVATION_NOT_EVALUABLE exit 1
 *                                    fail-closed 非 fake 绿；NOT_EVALUABLE 判定同样
 *                                    显式入账 exit 1）；
 * - challenge <object-id>            §95.3 State Challenge（kernel challengeFromBreach
 *                                    走 applyTransaction 零旁路；change 轴
 *                                    STABLE→CHALLENGED；authorityRef=breach evidence
 *                                    引用——确定性工具信号即挑战权威）；
 *                                    申报对象 ≠ band.capability_ref / 非 CURRENT /
 *                                    重复 challenge → CHALLENGE_REJECTED 显式；
 * - diagnose <challenge-ref>         Agent Diagnosis 消费位（kernel recordDiagnosis；
 *                                    --kind 三分 + --notes 必填留痕）；无既有 BREACHED
 *                                    band evidence → DIAGNOSIS_WITHOUT_BREACH_EVIDENCE
 *                                    exit 1（§95.2 链序封条：无确定性检测在先，诊断
 *                                    不可入账）；
 * - metrics                          §55.1 八能力 Leading/Lagging 表呈现：可算面数值
 *                                    （MEASURED + basis 口径披露）+ NOT_MEASURABLE_YET
 *                                    显式（绝不冒充数值）+ METRICS_CAVEAT 逐字注记
 *                                    （「Metrics 用于风险提示，不直接替代专业判断」）；
 * - self-improvement register        §90.4 八信号登记（产物恒
 *                                    POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态；
 *                                    命令输出恒带「不得自动应用」注记——人读行 +
 *                                    result.no_auto_apply 常量位 + warnings 码位三层）；
 * - self-improvement list            候选台账呈现（无登记 = 显式空合法态）。
 *
 * 分层纪律：判卷/落盘权威在 kernel production.ts；本面零旁路写状态。错误词形纪律：
 * PRODUCTION_CLI_ERROR_VALUES（schemas vocab.ts P34b 段，pending_vocab_pr + 命令面
 * 命名权呈报）经元组解构取词（单一镜像点）；kernel GovernanceError 码位 → 命令面词形
 * 映射全部由确定性前置检查（读 band/breach 台账现状判分支）或（命令面, kernel 码位）
 * 显式查表承载，禁子串/模糊猜测映射。
 *
 * 初始化纪律：evaluate / challenge / diagnose / self-improvement register 落点引用
 * store 事件序（recorded_at_seq/applied_seq/diagnosed_at_seq/reported_at_seq）或写
 * store 治理事实（challenge），未 init 目录一律 NOT_INITIALIZED 显式拒绝（permit 面
 * requireInitialized 同款——createStore 会静默建骨架，禁静默建账）；band define/list
 * 与 metrics 是 .pomaster/production 台账面/纯读面，无 store 依赖（memory capture
 * 侧车同款先例）。
 */
import { readFileSync } from "node:fs";
import {
  BAND_PREDICATE_OPERATOR_VALUES,
  DIAGNOSIS_KIND_VALUES,
  GovernanceError,
  METRICS_CAVEAT,
  PRODUCTION_CLI_ERROR_VALUES,
  PRODUCTION_BANDS_RELATIVE,
  PRODUCTION_BREACHES_RELATIVE,
  PRODUCTION_CHALLENGES_RELATIVE,
  PRODUCTION_DIAGNOSES_RELATIVE,
  PRODUCTION_SELF_IMPROVEMENT_RELATIVE,
  POMASTER_SELF_IMPROVEMENT_CANDIDATE,
  PRODUCTION_SIGNAL_SOURCE_VALUES,
  SELF_IMPROVEMENT_SIGNAL_VALUES,
  challengeFromBreach,
  computeCapabilityOutcomeMetrics,
  createStore,
  listControlBands,
  listSelfImprovementCandidates,
  readControlBand,
  readBreach,
  recordDiagnosis,
  recordObservation,
  registerControlBand,
  registerSelfImprovementCandidate,
  type Actor,
  type BandPredicate,
  type ControlBand,
  type DiagnosisKindValue,
  type ProductionSignalSourceValue,
  type SelfImprovementSignalValue,
} from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseActorArgv, requireInitialized } from "./permit.js";

// 错误词形族单一镜像点：schemas vocab.ts PRODUCTION_CLI_ERROR_VALUES 元组解构
// （词形唯一来源；数组序即声明序——新增词形在 vocab 段追加，此处按位解构）。
// 族内第 6 位 DIAGNOSIS_WITHOUT_BREACH_EVIDENCE 有意不解构：该词形是 kernel
// GovernanceErrorCode 的透传复用（零二次造词），CLI 判定通路经
// governanceErrorToCliError 原样上抛，命令面代码无需点名——解构反成死绑定。
const [
  BAND_SCHEMA_INVALID,
  BAND_NOT_FOUND,
  OBSERVATION_NOT_EVALUABLE,
  CHALLENGE_REJECTED,
  EVIDENCE_NOT_FOUND,
] = PRODUCTION_CLI_ERROR_VALUES;

/** §90.4 呈报位恒带注记（L5695 逐字「不得自动应用」；result 常量位 + 人读行 + warning 三层承载）。 */
export const NO_AUTO_APPLY_NOTE =
  "呈报态——不得自动应用（PRD §90.4 L5695 逐字）：POMASTER_SELF_IMPROVEMENT_CANDIDATE 无任何自动应用通路，「应用」永远是人/Owner 经治理面的显式动作" as const;

function fail<T>(result: T, command: string, error: CliError): CommandOutcome<T> {
  return failOutcome(command, result, [error], [
    `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

/** 非治理错误的统一信封翻译（环境异常禁静默）。 */
function toCliError(err: unknown, docSection: string): CliError {
  if (err instanceof GovernanceError) {
    return governanceErrorToCliError(err);
  }
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: `查看 docs/kernel-api.md ${docSection}（production 契约）；环境异常禁静默。`,
  };
}

// ============================================================
// argv 数值解析（有限数纪律；禁墙钟禁 NaN/Infinity）
// ============================================================

/** argv 数值解析：有限数（观测值/阈值；NaN/Infinity/空串显式拒绝）。 */
export function parseFiniteNumberArgv(
  raw: string,
  flag: string,
): { readonly value: number } | { readonly error: CliError } {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || !Number.isFinite(Number(trimmed))) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `${flag} 须为有限数，得到 ${JSON.stringify(raw)}`,
        hint: "NaN/Infinity/空串不可进判定通路（§95.2 显式谓词纪律）；示例：--threshold 800。",
      },
    };
  }
  return { value: Number(trimmed) };
}

/** argv 序号解析：≥0 整数（A4 单调事件序号词形；禁墙钟）。 */
export function parseSeqArgv(
  raw: string,
  flag: string,
): { readonly value: number } | { readonly error: CliError } {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 0) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `${flag} 须为 ≥0 整数（A4 单调事件序号，禁墙钟），得到 ${JSON.stringify(raw)}`,
        hint: "观测序号锚 store 事件拍；缺席时取 store 当前 seq。",
      },
    };
  }
  return { value };
}

// ============================================================
// production band define（band 定义唯一命令入口）
// ============================================================

export interface ProductionBandDefineInput {
  readonly id: string;
  readonly title?: string;
  readonly capabilityRef?: string;
  readonly source?: string;
  readonly metricName?: string;
  readonly operator?: string;
  readonly threshold?: string;
  readonly thresholdMax?: string;
  readonly window?: string;
}

export interface ProductionBandDefineResult {
  readonly action: "band_define";
  readonly id: string;
  readonly title: string;
  readonly capability_ref: string;
  readonly phase: "IN_PRODUCTION";
  readonly source: string;
  readonly metric_name: string;
  readonly predicate: BandPredicate;
  readonly window: number | null;
  readonly path: string;
}

/** band define（ControlBand 定义落 .pomaster/production/bands/；谓词字段机校验在 kernel）。 */
export async function runProductionBandDefine(
  rootDir: string,
  input: ProductionBandDefineInput,
): Promise<CommandOutcome<ProductionBandDefineResult | null>> {
  const command = "production band define";
  const empty: ProductionBandDefineResult | null = null;
  // —— argv 必填面（呈现级收敛；kernel 是权威再判） ——
  const missing: string[] = [];
  if (input.title === undefined || input.title.trim().length === 0) missing.push("--title");
  if (input.capabilityRef === undefined || input.capabilityRef.trim().length === 0) missing.push("--capability-ref");
  if (input.source === undefined || input.source.trim().length === 0) missing.push("--source");
  if (input.metricName === undefined || input.metricName.trim().length === 0) missing.push("--metric-name");
  if (input.operator === undefined || input.operator.trim().length === 0) missing.push("--operator");
  if (input.threshold === undefined || input.threshold.trim().length === 0) missing.push("--threshold");
  if (missing.length > 0) {
    return fail(empty, command, {
      code: BAND_SCHEMA_INVALID,
      message: `band define 缺必填项：${missing.join(", ")}`,
      hint: "band 定义六要素：--title --capability-ref --source --metric-name --operator --threshold（between 另须 --threshold-max）。",
    });
  }
  if (!(PRODUCTION_SIGNAL_SOURCE_VALUES as readonly string[]).includes(input.source as string)) {
    return fail(empty, command, {
      code: BAND_SCHEMA_INVALID,
      message: `--source 词形非法：${input.source}`,
      hint: `§95.2 生产信号源五词形（L6126 空格词形转 snake_case）：${PRODUCTION_SIGNAL_SOURCE_VALUES.join(" | ")}。`,
    });
  }
  if (!(BAND_PREDICATE_OPERATOR_VALUES as readonly string[]).includes(input.operator as string)) {
    return fail(empty, command, {
      code: BAND_SCHEMA_INVALID,
      message: `--operator 词形非法：${input.operator}`,
      hint: `击穿谓词算子五值闭集（machine-evaluable）：${BAND_PREDICATE_OPERATOR_VALUES.join(" | ")}；between 另须 --threshold-max。`,
    });
  }
  const threshold = parseFiniteNumberArgv(input.threshold as string, "--threshold");
  if ("error" in threshold) {
    return fail(empty, command, { ...threshold.error, code: BAND_SCHEMA_INVALID });
  }
  let predicate: BandPredicate;
  if (input.operator === "between") {
    if (input.thresholdMax === undefined || input.thresholdMax.trim().length === 0) {
      return fail(empty, command, {
        code: BAND_SCHEMA_INVALID,
        message: "between 算子须 --threshold-max 成对（闭区间健康带 [threshold, threshold_max]）",
        hint: "单阈值算子（gt/lt/gte/lte）不得携带 --threshold-max；双阈值语义请用 between。",
      });
    }
    const thresholdMax = parseFiniteNumberArgv(input.thresholdMax, "--threshold-max");
    if ("error" in thresholdMax) {
      return fail(empty, command, { ...thresholdMax.error, code: BAND_SCHEMA_INVALID });
    }
    predicate = { operator: "between", threshold: threshold.value, threshold_max: thresholdMax.value };
  } else {
    if (input.thresholdMax !== undefined && input.thresholdMax.trim().length > 0) {
      return fail(empty, command, {
        code: BAND_SCHEMA_INVALID,
        message: `非 between 算子（${input.operator}）不得携带 --threshold-max（单/双阈值算子互斥——歧义即损坏）`,
        hint: "between 闭区间健康带须 threshold+threshold_max 成对；单阈值算子只携带 --threshold。",
      });
    }
    predicate = { operator: input.operator as BandPredicate["operator"], threshold: threshold.value };
  }
  let window: number | null = null;
  if (input.window !== undefined && input.window.trim().length > 0) {
    const parsed = Number(input.window.trim());
    if (!Number.isInteger(parsed) || parsed < 1) {
      return fail(empty, command, {
        code: BAND_SCHEMA_INVALID,
        message: `--window 须为 ≥1 整数或缺席（观测窗口声明位；v1 单观测评估不消费），得到 ${JSON.stringify(input.window)}`,
        hint: "window 是声明位非消费位（多观测窗口语义待后续批次，禁发明）；null = 未声明。",
      });
    }
    window = parsed;
  }
  try {
    const band = registerControlBand(rootDir, {
      id: input.id,
      title: input.title as string,
      capabilityRef: input.capabilityRef as string,
      source: input.source as ProductionSignalSourceValue,
      metricName: input.metricName as string,
      predicate,
      window,
    });
    const result: ProductionBandDefineResult = {
      action: "band_define",
      id: band.id,
      title: band.title,
      capability_ref: band.capability_ref,
      phase: band.phase,
      source: band.source,
      metric_name: band.metric_name,
      predicate: band.predicate,
      window: band.window,
      path: `${PRODUCTION_BANDS_RELATIVE}/${band.id}.json`,
    };
    const human = [
      `production band define → ${band.id}（phase=${band.phase} 恒 IN_PRODUCTION——§30 第四态；§95.1 生命周期扩展承载位）`,
      `  落点: ${result.path}`,
      `  谓词: ${band.metric_name} ${band.predicate.operator} ${String(band.predicate.threshold)}${band.predicate.operator === "between" ? `..${String(band.predicate.threshold_max)}` : ""}（machine-evaluable——禁自由文本判据）`,
      "  下一步: pomaster production evaluate <band-id> --value N（Deterministic Detection 三态判定）",
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    // band 定义面只有 schema 族错误（词形/谓词/重复登记）——确定性按面映射。
    if (err instanceof GovernanceError) {
      const detail = governanceErrorToCliError(err);
      return fail(empty, command, {
        code: BAND_SCHEMA_INVALID,
        message: detail.message,
        hint: detail.hint,
      });
    }
    return fail(empty, command, toCliError(err, "§95"));
  }
}

// ============================================================
// production band list（band 定义清单纯读）
// ============================================================

export interface ProductionBandListResult {
  readonly action: "band_list";
  readonly root_dir: string;
  readonly total: number;
  readonly bands: readonly {
    readonly id: string;
    readonly title: string;
    readonly capability_ref: string;
    readonly phase: string;
    readonly source: string;
    readonly metric_name: string;
    readonly predicate: BandPredicate;
  }[];
}

export function runProductionBandList(rootDir: string): CommandOutcome<ProductionBandListResult> {
  const command = "production band list";
  let bands: readonly ControlBand[];
  try {
    bands = listControlBands(rootDir);
  } catch (err) {
    return failOutcome<ProductionBandListResult>(
      command,
      { action: "band_list", root_dir: rootDir, total: 0, bands: [] },
      [toCliError(err, "§95")],
      [`production band list: FAILED — ${err instanceof Error ? err.message : String(err)}`],
    );
  }
  const result: ProductionBandListResult = {
    action: "band_list",
    root_dir: rootDir,
    total: bands.length,
    bands: bands.map((band) => ({
      id: band.id,
      title: band.title,
      capability_ref: band.capability_ref,
      phase: band.phase,
      source: band.source,
      metric_name: band.metric_name,
      predicate: band.predicate,
    })),
  };
  const human = [
    `production band list → ${bands.length} 条（${PRODUCTION_BANDS_RELATIVE}/；${bands.length === 0 ? "显式空合法态" : "id 字典序"}）`,
    ...bands.map(
      (band) =>
        `    ${band.id} [${band.phase}/${band.source}] ${band.metric_name} ${band.predicate.operator} ${String(band.predicate.threshold)}${band.predicate.operator === "between" ? `..${String(band.predicate.threshold_max)}` : ""} → ${band.capability_ref}`,
    ),
  ];
  return okOutcome(command, result, human);
}

// ============================================================
// production evaluate（Deterministic Detection + 台账落账）
// ============================================================

export interface ProductionEvaluateInput {
  readonly bandId: string;
  readonly value?: string;
  readonly observationsFile?: string;
  readonly observedAtSeq?: string;
}

export interface ProductionEvaluateResult {
  readonly action: "evaluate";
  readonly band_id: string;
  readonly status: string;
  readonly value: number | null;
  readonly detail: string | null;
  readonly observation_ref: string | null;
  readonly evidence_ref: string | null;
  readonly evidence_path: string | null;
  readonly observation_path: string | null;
  readonly observed_at_seq: number | null;
}

/**
 * evaluate（§95.2 Deterministic Detection 的命令面）：
 * - 出口语义 = 动作非判卷：OK / BREACHED 都是动作的成功产出（链的下一拍 challenge
 *   是显式动作），exit 0 + status 显式呈现；NOT_EVALUABLE exit 1 fail-closed
 *   （OBSERVATION_NOT_EVALUABLE——观测缺席/不可判绝不静默绿）；
 * - BREACHED 时 evidence 产物落账（kernel recordObservation 同批原子写）+
 *   envelope evidence_ref（PBR-* 内容寻址）。
 */
export async function runProductionEvaluate(
  rootDir: string,
  input: ProductionEvaluateInput,
): Promise<CommandOutcome<ProductionEvaluateResult>> {
  const command = "production evaluate";
  const empty: ProductionEvaluateResult = {
    action: "evaluate",
    band_id: input.bandId,
    status: "NOT_EVALUABLE",
    value: null,
    detail: null,
    observation_ref: null,
    evidence_ref: null,
    evidence_path: null,
    observation_path: null,
    observed_at_seq: null,
  };
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  // 观测来源二选一（互斥且必选其一——观测缺席 = fail-closed 非 fake 绿）。
  const hasValue = input.value !== undefined && input.value.trim().length > 0;
  const hasFile = input.observationsFile !== undefined && input.observationsFile.trim().length > 0;
  if (!hasValue && !hasFile) {
    return fail(empty, command, {
      code: OBSERVATION_NOT_EVALUABLE,
      message: "观测缺席：--value 与 --observations-file 均未提供——evaluate 无观测可判",
      hint: "单观测用 --value N（observed_at_seq 取 store 当前 seq 或 --observed-at-seq 显式覆盖）；批量/完整观测用 --observations-file <path>（JSON：{metric_name, value, observed_at_seq}）。",
    });
  }
  if (hasValue && hasFile) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--value 与 --observations-file 互斥且二选一（一次判定一个观测）",
      hint: "多观测评估是后续批次语义（window 声明位 v1 不消费）；勿在同一次调用混给两个来源。",
    });
  }
  // band 在册前置（确定性：band 不在册 = BAND_NOT_FOUND 非 kernel OBJECT_NOT_FOUND 透传）。
  let band;
  try {
    band = readControlBand(rootDir, input.bandId);
  } catch (err) {
    if (err instanceof GovernanceError && err.code === "OBJECT_NOT_FOUND") {
      return fail(empty, command, {
        code: BAND_NOT_FOUND,
        message: `band 定义不在册：${input.bandId}`,
        hint: `pomaster production band list 查看在册定义；先 production band define 登记（${PRODUCTION_BANDS_RELATIVE}/）。`,
      });
    }
    return fail(empty, command, toCliError(err, "§95"));
  }
  // —— 观测构造（数值+序号面；观测源任何不可用都是显式 OBSERVATION_NOT_EVALUABLE） ——
  let observation: { metric_name: string; value: number; observed_at_seq: number };
  if (hasValue) {
    const parsed = parseFiniteNumberArgv(input.value as string, "--value");
    if ("error" in parsed) {
      return fail(empty, command, {
        code: OBSERVATION_NOT_EVALUABLE,
        message: `观测值不可判：${parsed.error.message}`,
        hint: `${parsed.error.hint} 非数值观测没有 NOT_EVALUABLE 之外的合法出口（绝不静默折算 OK）。`,
      });
    }
    let observedAtSeq: number;
    if (input.observedAtSeq !== undefined && input.observedAtSeq.trim().length > 0) {
      const seq = parseSeqArgv(input.observedAtSeq, "--observed-at-seq");
      if ("error" in seq) return fail(empty, command, seq.error);
      observedAtSeq = seq.value;
    } else {
      // 缺席 = store 当前 seq（A4 禁墙钟——seq 锚定非时间锚定）。
      // requireInitialized 已过（generation.seq 在座）；null 分支是不可达护栏。
      const store = await createStore(rootDir);
      observedAtSeq = store.currentSeq ?? 0;
    }
    observation = { metric_name: band.metric_name, value: parsed.value, observed_at_seq: observedAtSeq };
  } else {
    const filePath = (input.observationsFile as string).trim();
    let text: string;
    try {
      text = readFileSync(filePath, "utf8");
    } catch (err) {
      return fail(empty, command, {
        code: OBSERVATION_NOT_EVALUABLE,
        message: `observations 文件不可读：${filePath}（${err instanceof Error ? err.message : String(err)}）`,
        hint: "observations 文件是 JSON 观测：{\"metric_name\": string, \"value\": finite number, \"observed_at_seq\": >=0 int}；路径确认后重试。",
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch (err) {
      return fail(empty, command, {
        code: OBSERVATION_NOT_EVALUABLE,
        message: `observations 文件不是合法 JSON：${filePath}（${err instanceof Error ? err.message : String(err)}）`,
        hint: "观测文件须为单个 JSON 对象（数组批量形态 v1 未注册，禁发明）。",
      });
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail(empty, command, {
        code: OBSERVATION_NOT_EVALUABLE,
        message: `observations 文件形态非法：${filePath}（须为单个 JSON 观测对象）`,
        hint: "{\"metric_name\": string, \"value\": finite number, \"observed_at_seq\": >=0 int}；数组批量形态 v1 未注册。",
      });
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.metric_name !== "string" || record.metric_name.length === 0) {
      return fail(empty, command, {
        code: OBSERVATION_NOT_EVALUABLE,
        message: `observations 文件缺 metric_name（band 联结键）：${filePath}`,
        hint: "metric_name 与 band.metric_name exact-match（不匹配 = NOT_EVALUABLE 显式入账，绝不就近匹配）。",
      });
    }
    if (typeof record.value !== "number" || !Number.isFinite(record.value)) {
      return fail(empty, command, {
        code: OBSERVATION_NOT_EVALUABLE,
        message: `observations 文件 value 非有限数：${filePath}（${String(record.value)}）`,
        hint: "NaN/Infinity 不可 JSON round-trip 亦不可进判定通路；观测不可用 = 显式 NOT_EVALUABLE。",
      });
    }
    if (typeof record.observed_at_seq !== "number" || !Number.isInteger(record.observed_at_seq) || record.observed_at_seq < 0) {
      return fail(empty, command, {
        code: OBSERVATION_NOT_EVALUABLE,
        message: `observations 文件 observed_at_seq 非 ≥0 整数：${filePath}（${String(record.observed_at_seq)}）`,
        hint: "A4 单调事件序号词形（禁墙钟）。",
      });
    }
    observation = {
      metric_name: record.metric_name,
      value: record.value,
      observed_at_seq: record.observed_at_seq,
    };
  }
  // —— 判定 + 台账落账（kernel recordObservation 权威面） ——
  try {
    const record = recordObservation(rootDir, input.bandId, observation);
    const observationPath = `.pomaster/production/observations/${record.id}.json`;
    if (record.evaluated_status === "NOT_EVALUABLE") {
      // 显式缺席入账（evaluated_status=NOT_EVALUABLE + breach_ref=null）+ exit 1：
      // 缺席呈现但不冒充 OK（fail-closed；observation 台账保留缺席记录供审计）。
      return failOutcome<ProductionEvaluateResult>(
        command,
        {
          ...empty,
          status: record.evaluated_status,
          value: record.value,
          detail: record.detail,
          observation_ref: record.id,
          observation_path: observationPath,
          observed_at_seq: record.observed_at_seq,
        },
        [
          {
            code: OBSERVATION_NOT_EVALUABLE,
            message: `band ${input.bandId} 判定 NOT_EVALUABLE：${record.detail}`,
            hint: "缺席原因码在 detail（METRIC_NAME_MISMATCH/VALUE_NOT_FINITE_NUMBER/PREDICATE_CORRUPT）；observation 已显式入账（禁静默丢弃），修正观测后重跑。",
          },
        ],
        [
          `production evaluate ${input.bandId} → NOT_EVALUABLE（exit 1 fail-closed——绝不静默折算 OK）`,
          `  缺席: ${record.detail}`,
          `  observation 台账: ${observationPath}（显式入账，breach_ref=null）`,
        ],
      );
    }
    const result: ProductionEvaluateResult = {
      action: "evaluate",
      band_id: input.bandId,
      status: record.evaluated_status,
      value: record.value,
      detail: record.detail,
      observation_ref: record.id,
      evidence_ref: record.breach_ref,
      evidence_path: record.breach_ref !== null ? `${PRODUCTION_BREACHES_RELATIVE}/${record.breach_ref}.json` : null,
      observation_path: observationPath,
      observed_at_seq: record.observed_at_seq,
    };
    const human =
      record.evaluated_status === "BREACHED"
        ? [
            `production evaluate ${input.bandId} → BREACHED（${record.detail}）`,
            `  Evidence 落账: ${result.evidence_path}（detected_by=tool_signal——判定来自工具信号非 LLM 自报，C5/§95.2）`,
            `  observation 台账: ${observationPath}（observed_at_seq=${String(record.observed_at_seq)}）`,
            `  下一步: pomaster production challenge ${band.capability_ref} --band ${input.bandId} --evidence ${record.breach_ref as string}（§95.3 State Challenge——显式动作非自动）`,
          ]
        : [
            `production evaluate ${input.bandId} → OK（${record.detail}）`,
            `  observation 台账: ${observationPath}（observed_at_seq=${String(record.observed_at_seq)}）`,
          ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(empty, command, toCliError(err, "§95"));
  }
}

// ============================================================
// production challenge（§95.3 State Challenge 命令面）
// ============================================================

export interface ProductionChallengeInput {
  readonly objectId: string;
  readonly bandId?: string;
  readonly evidence?: string;
  readonly note?: string;
}

export interface ProductionChallengeResult {
  readonly action: "challenge";
  readonly challenge_ref: string | null;
  readonly object_id: string;
  readonly band_id: string | null;
  readonly capability_ref: string | null;
  readonly from_change: "STABLE" | null;
  readonly to_change: "CHALLENGED" | null;
  readonly evidence_ref: string | null;
  readonly authority_ref: string | null;
  readonly applied_seq: number | null;
  readonly reason_short: string | null;
}

/**
 * challenge（§95.3 Production State Transition；kernel challengeFromBreach 走
 * applyTransaction 零旁路）。申报对象 <object-id> 必须与 band.capability_ref 全等
 * （确定性前置：挑战目标申报面与 band 挂载面一致——防挂错带）；拒绝路径全部
 * CHALLENGE_REJECTED 显式词形（拒绝原因在 message 逐字透传）。
 */
export async function runProductionChallenge(
  rootDir: string,
  input: ProductionChallengeInput,
): Promise<CommandOutcome<ProductionChallengeResult>> {
  const command = "production challenge";
  const empty: ProductionChallengeResult = {
    action: "challenge",
    challenge_ref: null,
    object_id: input.objectId,
    band_id: input.bandId ?? null,
    capability_ref: null,
    from_change: null,
    to_change: null,
    evidence_ref: null,
    authority_ref: null,
    applied_seq: null,
    reason_short: null,
  };
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  if (input.bandId === undefined || input.bandId.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--band 必填（challenge 必须挂在在册 control band 的击穿之后——§95.2 链序）",
      hint: "pomaster production band list 查看在册定义；无 band 直接 challenge 是链外捷径（结构性拒绝）。",
    });
  }
  if (input.evidence === undefined || input.evidence.trim().length === 0) {
    return fail(empty, command, {
      code: EVIDENCE_NOT_FOUND,
      message: "--evidence 必填（challenge 必持 breach Evidence 引用 PBR-<12hex>）",
      hint: "evidence 由 production evaluate 判定 BREACHED 时自动产出；禁手造引用（内容寻址 id）。",
    });
  }
  // band 在册前置。
  let band;
  try {
    band = readControlBand(rootDir, input.bandId);
  } catch (err) {
    if (err instanceof GovernanceError && err.code === "OBJECT_NOT_FOUND") {
      return fail(empty, command, {
        code: BAND_NOT_FOUND,
        message: `band 定义不在册：${input.bandId}`,
        hint: `pomaster production band list 查看在册定义；先 production band define 登记。`,
      });
    }
    return fail(empty, command, toCliError(err, "§95"));
  }
  // 申报对象 ↔ band 挂载对象一致性（确定性前置——防挂错带）。
  if (input.objectId !== band.capability_ref) {
    return fail(empty, command, {
      code: CHALLENGE_REJECTED,
      message: `申报对象 ${input.objectId} ≠ band ${band.id} 挂载对象 ${band.capability_ref}（challenge 目标须与 band.capability_ref 全等）`,
      hint: "band 挂载对象在 define 时绑定（capability_ref）；挑战它挂载的对象，或换用挂载该对象的 band。",
    });
  }
  // evidence 在册前置（词形非法/不在册同面呈现）。
  let breach;
  try {
    breach = readBreach(rootDir, input.evidence);
  } catch (err) {
    if (err instanceof GovernanceError && (err.code === "OBJECT_NOT_FOUND" || err.code === "SCHEMA_INVALID")) {
      return fail(empty, command, {
        code: EVIDENCE_NOT_FOUND,
        message: `breach evidence 不在册或词形非法：${input.evidence}`,
        hint: `production evaluate 判定 BREACHED 时自动产出（${PRODUCTION_BREACHES_RELATIVE}/PBR-<12hex>.json）；禁手造引用。`,
      });
    }
    return fail(empty, command, toCliError(err, "§95"));
  }
  // band ↔ breach 归属前置（kernel 同判；CLI 先呈现确定性词形）。
  if (breach.band_id !== band.id) {
    return fail(empty, command, {
      code: CHALLENGE_REJECTED,
      message: `breach ${breach.id} 属 band ${breach.band_id}，与目标 band ${band.id} 不符`,
      hint: "challenge 的 Evidence 必须来自目标 band 的击穿（§95.2 链序：Detection→Evidence→Challenge）。",
    });
  }
  try {
    const store = await createStore(rootDir);
    const outcome = await challengeFromBreach(
      store,
      input.bandId,
      input.evidence,
      input.note !== undefined ? { note: input.note } : undefined,
    );
    const result: ProductionChallengeResult = {
      action: "challenge",
      challenge_ref: outcome.challenge.id,
      object_id: input.objectId,
      band_id: outcome.challenge.band_id,
      capability_ref: outcome.challenge.capability_ref,
      from_change: outcome.challenge.from_change,
      to_change: outcome.challenge.to_change,
      evidence_ref: outcome.challenge.breach_ref,
      authority_ref: outcome.challenge.authority_ref,
      applied_seq: outcome.challenge.applied_seq,
      reason_short: outcome.challenge.reason_short,
    };
    const human = [
      `production challenge → ${input.objectId}: change ${outcome.challenge.from_change}→${outcome.challenge.to_change}（§95.3 Production State Transition——applied_seq=${String(outcome.transaction.appliedSeq)}）`,
      `  权威: breach Evidence ${outcome.challenge.authority_ref}（确定性工具信号即挑战权威——LOCKED 不是圣旨，也不是随便挑战）`,
      `  留痕: ${PRODUCTION_CHALLENGES_RELATIVE}/${outcome.challenge.id}.json`,
      "  下一步: pomaster production diagnose <challenge-ref> --kind <kind> --notes ...（Agent Diagnosis 消费位——必持既有 breach evidence）",
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    // challenge 面的 kernel 拒绝（非 CURRENT/已 CHALLENGED/MIGRATING/目标不在册/
    // 重复留痕）确定性映射 CHALLENGE_REJECTED；其余码位透传。
    if (err instanceof GovernanceError) {
      if (err.code === "TRANSITION_ILLEGAL" || err.code === "OBJECT_NOT_FOUND" || err.code === "SCHEMA_INVALID") {
        const detail = governanceErrorToCliError(err);
        return fail(empty, command, {
          code: CHALLENGE_REJECTED,
          message: detail.message,
          hint: detail.hint,
        });
      }
      return fail(empty, command, governanceErrorToCliError(err));
    }
    return fail(empty, command, toCliError(err, "§95"));
  }
}

// ============================================================
// production diagnose（Agent Diagnosis 消费位命令面）
// ============================================================

export interface ProductionDiagnoseInput {
  readonly challengeRef: string;
  readonly kind?: string;
  readonly notes?: string;
  readonly actor?: string;
}

export interface ProductionDiagnoseResult {
  readonly action: "diagnose";
  readonly diagnosis_ref: string | null;
  readonly challenge_ref: string | null;
  readonly breach_ref: string | null;
  readonly band_id: string | null;
  readonly capability_ref: string | null;
  readonly kind: string | null;
  readonly notes: string | null;
  readonly diagnosed_by: { readonly actor_type: string; readonly actor: string; readonly self_attested: boolean } | null;
}

/**
 * diagnose（§95.2 链序第 4 拍 Agent Diagnosis；§95.3 三分落点）。无既有 BREACHED
 * band evidence 的 diagnosis = DIAGNOSIS_WITHOUT_BREACH_EVIDENCE exit 1（kernel
 * 结构性封条透传——无确定性检测在先，诊断不可入账）。
 */
export async function runProductionDiagnose(
  rootDir: string,
  input: ProductionDiagnoseInput,
): Promise<CommandOutcome<ProductionDiagnoseResult>> {
  const command = "production diagnose";
  const empty: ProductionDiagnoseResult = {
    action: "diagnose",
    diagnosis_ref: null,
    challenge_ref: input.challengeRef,
    breach_ref: null,
    band_id: null,
    capability_ref: null,
    kind: input.kind ?? null,
    notes: null,
    diagnosed_by: null,
  };
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  if (input.kind === undefined || input.kind.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--kind 必填（§95.3 诊断三分）",
      hint: `三词形闭集（SCREAMING_SNAKE——大小写裁定呈报 Owner）：${DIAGNOSIS_KIND_VALUES.join(" | ")}。`,
    });
  }
  if (!(DIAGNOSIS_KIND_VALUES as readonly string[]).includes(input.kind)) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: `--kind 词形非法：${input.kind}`,
      hint: `§95.3 诊断三分（L6153 逐字语义；Implementation Issue/Config Issue/Architecture Evolution 的 SCREAMING_SNAKE 词形）：${DIAGNOSIS_KIND_VALUES.join(" | ")}。`,
    });
  }
  if (input.notes === undefined || input.notes.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--notes 必填（诊断注记留痕——自由文本住这里，不住判定通路）",
      hint: "诊断说明必填留痕（引用 breach evidence 的事实面）；空注记写不出可审计诊断。",
    });
  }
  let actor: { readonly actor: Actor } | { readonly error: CliError } = {
    actor: { actorType: "agent", actor: "claude/diagnosis", selfAttested: true },
  };
  if (input.actor !== undefined) {
    actor = parseActorArgv(input.actor);
    if ("error" in actor) return fail(empty, command, actor.error);
  }
  try {
    const record = recordDiagnosis(rootDir, input.challengeRef, {
      kind: input.kind as DiagnosisKindValue,
      notes: input.notes,
      diagnosedBy: actor.actor,
    });
    const result: ProductionDiagnoseResult = {
      action: "diagnose",
      diagnosis_ref: record.id,
      challenge_ref: record.challenge_ref,
      breach_ref: record.breach_ref,
      band_id: record.band_id,
      capability_ref: record.capability_ref,
      kind: record.kind,
      notes: record.notes,
      diagnosed_by: {
        actor_type: record.diagnosed_by.actor_type,
        actor: record.diagnosed_by.actor,
        self_attested: record.diagnosed_by.self_attested,
      },
    };
    const human = [
      `production diagnose → ${record.id}（kind=${record.kind}——§95.3 三分）`,
      `  链序: breach ${record.breach_ref} → challenge ${record.challenge_ref} → diagnosis（Deterministic Detection→Evidence→State Challenge→Agent Diagnosis 保序）`,
      `  台账: ${PRODUCTION_DIAGNOSES_RELATIVE}/${record.id}.json（diagnosed_by=${record.diagnosed_by.actor_type}:${record.diagnosed_by.actor}——C5 自报登记）`,
      "  下一步: Change Proposal / Rollback / Research（§95.2 链尾——经治理面显式动作，非自动应用）",
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(empty, command, toCliError(err, "§95"));
  }
}

// ============================================================
// production metrics（§55.1 八能力 Leading/Lagging 呈现）
// ============================================================

export interface ProductionMetricsResult {
  readonly action: "metrics";
  readonly root_dir: string;
  readonly caveat: typeof METRICS_CAVEAT;
  readonly runs_scanned: number;
  readonly runs_unreadable: number;
  readonly rows: readonly {
    readonly capability: string;
    readonly leading: string;
    readonly lagging: string;
    readonly leading_metric: {
      readonly key: string;
      readonly status: "MEASURED" | "NOT_MEASURABLE_YET";
      readonly value: number | null;
      readonly numerator: number | null;
      readonly denominator: number | null;
      readonly basis: string;
      readonly reason: string | null;
    };
    readonly lagging_metric: {
      readonly key: string;
      readonly status: "MEASURED" | "NOT_MEASURABLE_YET";
      readonly value: number | null;
      readonly numerator: number | null;
      readonly denominator: number | null;
      readonly basis: string;
      readonly reason: string | null;
    };
  }[];
}

/** 指标值呈现行（MEASURED=数值+分账口径；NOT_MEASURABLE_YET=缺席显式非数值）。 */
function metricHumanLine(role: string, label: string, metric: ProductionMetricsResult["rows"][number]["leading_metric"]): string {
  if (metric.status === "MEASURED") {
    const valueText = Number.isInteger(metric.value) ? String(metric.value) : (metric.value as number).toFixed(4);
    return `    ${role} ${label} = ${valueText}（${metric.key}；分账 ${String(metric.numerator)}/${String(metric.denominator)}）`;
  }
  return `    ${role} ${label} = NOT_MEASURABLE_YET（${metric.key}；${metric.reason ?? metric.basis}）`;
}

export function runProductionMetrics(rootDir: string): CommandOutcome<ProductionMetricsResult> {
  const command = "production metrics";
  let report;
  try {
    report = computeCapabilityOutcomeMetrics(rootDir);
  } catch (err) {
    return failOutcome<ProductionMetricsResult>(
      command,
      { action: "metrics", root_dir: rootDir, caveat: METRICS_CAVEAT, runs_scanned: 0, runs_unreadable: 0, rows: [] },
      [toCliError(err, "§55.1")],
      [`production metrics: FAILED — ${err instanceof Error ? err.message : String(err)}`],
    );
  }
  const result: ProductionMetricsResult = {
    action: "metrics",
    root_dir: rootDir,
    caveat: report.caveat,
    runs_scanned: report.runsScanned,
    runs_unreadable: report.runsUnreadable,
    rows: report.rows.map((row) => ({
      capability: row.capability,
      leading: row.leading,
      lagging: row.lagging,
      leading_metric: row.leadingMetric,
      lagging_metric: row.laggingMetric,
    })),
  };
  const measured = result.rows.reduce(
    (count, row) =>
      count + (row.leading_metric.status === "MEASURED" ? 1 : 0) + (row.lagging_metric.status === "MEASURED" ? 1 : 0),
    0,
  );
  const human = [
    `production metrics → §55.1 八能力 Leading/Lagging 表（十六指标：MEASURED ${measured} / NOT_MEASURABLE_YET ${16 - measured}——不可机算显式缺席，绝不冒充数值）`,
    `  gate 台账扫描: evidence/runs/ 共 ${String(result.runs_scanned)} 份（不可读显式计数 ${String(result.runs_unreadable)}）`,
    ...result.rows.flatMap((row) => [
      `  ${row.capability}`,
      metricHumanLine("Leading", row.leading, row.leading_metric),
      metricHumanLine("Lagging", row.lagging, row.lagging_metric),
    ]),
    `  ${report.caveat}`,
  ];
  return okOutcome(command, result, human);
}

// ============================================================
// production self-improvement register / list（§90.4 呈报位）
// ============================================================

export interface ProductionSelfImprovementRegisterInput {
  readonly signal?: string;
  readonly note?: string;
  readonly actor?: string;
  readonly evidenceRefs?: readonly string[];
}

export interface ProductionSelfImprovementRegisterResult {
  readonly action: "self_improvement_register";
  readonly id: string;
  readonly kind: typeof POMASTER_SELF_IMPROVEMENT_CANDIDATE;
  readonly signal: string;
  readonly signal_label: string;
  readonly note: string;
  readonly evidence_refs: readonly string[];
  readonly reported_by: { readonly actor_type: string; readonly actor: string; readonly self_attested: boolean };
  /** §90.4 封条的呈现位（恒 true——登记产物无任何自动应用通路）。 */
  readonly no_auto_apply: true;
  readonly no_auto_apply_note: typeof NO_AUTO_APPLY_NOTE;
  readonly path: string;
}

/**
 * self-improvement register（§90.4 八信号登记）。命令输出恒带「不得自动应用」注记：
 * result.no_auto_apply 常量位（机器）+ 人读行 + warnings 码位
 * POMASTER_SELF_IMPROVEMENT_CANDIDATE 三层承载（§90.4 结构封条：登记即呈报，
 * 不存在从 CANDIDATE 到 Router/Profile/Gate 配置变更的自动通路）。
 */
export async function runProductionSelfImprovementRegister(
  rootDir: string,
  input: ProductionSelfImprovementRegisterInput,
): Promise<CommandOutcome<ProductionSelfImprovementRegisterResult | null>> {
  const command = "production self-improvement register";
  const empty: ProductionSelfImprovementRegisterResult | null = null;
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  if (input.signal === undefined || input.signal.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--signal 必填（§90.4 八信号之一）",
      hint: `八信号闭集（snake_case 机器词形；人读原文 SELF_IMPROVEMENT_SIGNAL_PRD_LABELS）：${SELF_IMPROVEMENT_SIGNAL_VALUES.join(" | ")}。`,
    });
  }
  if (!(SELF_IMPROVEMENT_SIGNAL_VALUES as readonly string[]).includes(input.signal)) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: `--signal 词形非法：${input.signal}`,
      hint: `§90.4 八信号闭集（L5686-5693 逐字语义）：${SELF_IMPROVEMENT_SIGNAL_VALUES.join(" | ")}。`,
    });
  }
  if (input.note === undefined || input.note.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--note 必填（申报说明留痕）",
      hint: "§90.4 申报说明必填（证据引用可选 --evidence-ref 可重复）；空说明写不出可审计呈报。",
    });
  }
  let actor: { readonly actor: Actor } | { readonly error: CliError } = {
    actor: { actorType: "agent", actor: "claude/self-report", selfAttested: true },
  };
  if (input.actor !== undefined) {
    actor = parseActorArgv(input.actor);
    if ("error" in actor) return fail(empty, command, actor.error);
  }
  try {
    const record = registerSelfImprovementCandidate(rootDir, {
      signal: input.signal as SelfImprovementSignalValue,
      note: input.note,
      reportedBy: actor.actor,
      ...(input.evidenceRefs !== undefined && input.evidenceRefs.length > 0
        ? { evidenceRefs: input.evidenceRefs }
        : {}),
    });
    const result: ProductionSelfImprovementRegisterResult = {
      action: "self_improvement_register",
      id: record.id,
      kind: record.kind,
      signal: record.signal,
      signal_label: record.signal_label,
      note: record.note,
      evidence_refs: record.evidence_refs,
      reported_by: {
        actor_type: record.reported_by.actor_type,
        actor: record.reported_by.actor,
        self_attested: record.reported_by.self_attested,
      },
      no_auto_apply: true,
      no_auto_apply_note: NO_AUTO_APPLY_NOTE,
      path: `${PRODUCTION_SELF_IMPROVEMENT_RELATIVE}/${record.id}.json`,
    };
    const warnings: CliWarning[] = [
      {
        code: POMASTER_SELF_IMPROVEMENT_CANDIDATE,
        message: `${record.id}（${record.signal}）已登记为 POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态——不得自动应用（PRD §90.4 L5695 逐字）`,
        hint: "登记产物零 Router/Profile/Gate 配置变更、零 journal 事件、零 state/ 写入；「应用」永远是人/Owner 经治理面的显式动作。pomaster production self-improvement list 查看台账。",
      },
    ];
    const human = [
      `production self-improvement register → ${record.id}（kind=${record.kind} 呈报态）`,
      `  信号: ${record.signal}（${record.signal_label}——§90.4 bullet 原文逐字镜像）`,
      `  落点: ${result.path}（零 journal 事件、零 state/ 写入——纯呈报位）`,
      `  ${NO_AUTO_APPLY_NOTE}`,
      "  台账: pomaster production self-improvement list",
    ];
    return okOutcome(command, result, human, warnings);
  } catch (err) {
    return fail(empty, command, toCliError(err, "§90.4"));
  }
}

export interface ProductionSelfImprovementListResult {
  readonly action: "self_improvement_list";
  readonly root_dir: string;
  readonly total: number;
  readonly candidates: readonly {
    readonly id: string;
    readonly kind: string;
    readonly signal: string;
    readonly signal_label: string;
    readonly note: string;
    readonly evidence_refs: readonly string[];
    readonly reported_by: { readonly actor_type: string; readonly actor: string; readonly self_attested: boolean };
    readonly no_auto_apply: true;
  }[];
}

export function runProductionSelfImprovementList(
  rootDir: string,
): CommandOutcome<ProductionSelfImprovementListResult> {
  const command = "production self-improvement list";
  let candidates;
  try {
    candidates = listSelfImprovementCandidates(rootDir);
  } catch (err) {
    return failOutcome<ProductionSelfImprovementListResult>(
      command,
      { action: "self_improvement_list", root_dir: rootDir, total: 0, candidates: [] },
      [toCliError(err, "§90.4")],
      [`production self-improvement list: FAILED — ${err instanceof Error ? err.message : String(err)}`],
    );
  }
  const result: ProductionSelfImprovementListResult = {
    action: "self_improvement_list",
    root_dir: rootDir,
    total: candidates.length,
    candidates: candidates.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      signal: entry.signal,
      signal_label: entry.signal_label,
      note: entry.note,
      evidence_refs: entry.evidence_refs,
      reported_by: {
        actor_type: entry.reported_by.actor_type,
        actor: entry.reported_by.actor,
        self_attested: entry.reported_by.self_attested,
      },
      no_auto_apply: true,
    })),
  };
  const human = [
    `production self-improvement list → ${candidates.length} 条（${PRODUCTION_SELF_IMPROVEMENT_RELATIVE}/；${candidates.length === 0 ? "显式空合法态" : "恒 POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态"}）`,
    ...candidates.map(
      (entry) => `    ${entry.id} [${entry.signal}] ${entry.note}`,
    ),
    `  ${NO_AUTO_APPLY_NOTE}`,
  ];
  return okOutcome(command, result, human);
}
