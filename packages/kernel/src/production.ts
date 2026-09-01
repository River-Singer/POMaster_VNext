/**
 * production.ts —— Production Feedback / Control Band v1 内核（P34a · PRD §95 全节 +
 * §30 第四态 + §55.1 + §90.4；docs/wave3-plan.md P34 出口判据的 kernel 侧）。
 *
 * 出处锚（逐字词形全部注记出处；枚举唯一镜像点 @pomaster/schemas vocab.ts P34 段）：
 * - PRD §30（L2553-2563）：开发时间轴四态 PRE_DEV / IN_DEV / POST_DEV / IN_PRODUCTION
 *   逐字（PHASE_TIMELINE_VALUES）；§30「IN_PRODUCTION 目标：把生产运行事实重新变成
 *   Evidence 与 Change Trigger」是本模块的存在理由。
 * - PRD §95.1（L6101-6119）：生命周期扩展
 *   PRE_DEV→IN_DEV→POST_DEV→IN_PRODUCTION→new Evidence/Incident/Opportunity→Change ↺
 *   （状态承载：band.phase 恒 IN_PRODUCTION + §95.3 challenge 转移走 change 轴）。
 * - PRD §95.2（L6121-6140）：链 = metric/log/error budget/SLO/control band（五信号源
 *   逐字，空格词形转 snake_case）→ Deterministic Detection → Evidence → State
 *   Challenge → Agent Diagnosis → Change Proposal/Rollback/Research。
 *   **§95.2 结构封条（本阶段灵魂）：不得把「是否异常」完全交给 LLM 主观判断**——
 *   异常判定函数 evaluateControlBand 只接受显式谓词（五算子闭集 + 数值阈值，
 *   additionalProperties:false 封死自由文本判据字段位）+ 数值 observation；判定通路
 *   无任何自由文本入参位（类型面即封条）；BREACHED 产 Evidence 恒 detected_by=
 *   tool_signal（C5：判定来自工具信号非 LLM 自报）；Agent Diagnosis 消费位只能引用
 *   既有 BREACHED band evidence（recordDiagnosis 结构性校验，否则
 *   DIAGNOSIS_WITHOUT_BREACH_EVIDENCE 拒绝——链序 Deterministic Detection →
 *   Evidence → State Challenge → Agent Diagnosis 的结构性保序）。
 * - PRD §95.3（L6141-6156）：Capability=CURRENT + Performance control band breached →
 *   Capability=CHALLENGED → Diagnosis/Evidence → Implementation Issue / Config Issue /
 *   Architecture Evolution 三分（DIAGNOSIS_KIND_VALUES，SCREAMING_SNAKE 词形——
 *   §31 challenge classification 先例词形 ARCHITECTURE_EVOLUTION 同源，大小写裁定
 *   Owner 2026-09-01 照准）。「生产现实因此成为下一轮 Current State 的外部反馈」。
 * - PRD §55.1（L3579-3597）：八能力 Leading/Lagging 表（CAPABILITY_OUTCOME_METRICS
 *   三列逐字常量化）+「某能力若长期只增加步骤而不改善 Leading/Lagging Outcome，应进入
 *   POMASTER_SELF_IMPROVEMENT_CANDIDATE」+「注意：Metrics 用于风险提示，不直接替代
 *   专业判断」（METRICS_CAVEAT 逐字随报告输出）；不可机算指标显式 NOT_MEASURABLE_YET
 *   不冒充数值（fail-closed）。
 * - PRD §90.4（L5682-5696）：八信号（SELF_IMPROVEMENT_SIGNAL_VALUES snake_case 机器
 *   词形 + SELF_IMPROVEMENT_SIGNAL_PRD_LABELS 原文逐字镜像）→ 登记产物恒
 *   POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态，**不得自动应用**（L5695 逐字）。
 *   §90.4 结构封条：本模块不 import 任何 Router/Profile/Gate 配置修改函数（kernel
 *   现存面亦无此类函数），登记函数只写 .pomaster/production/self-improvement/ 子树，
 *   零 journal 事件零 state/ 写入（纯呈报位的结构性落法）；「应用」永远是人/Owner
 *   经治理面显式动作，kernel 不提供任何从 CANDIDATE 到配置变更的自动通路。
 *
 * 生命周期接线（§95.3 CURRENT→CHALLENGED 零旁路）：
 * - challengeFromBreach 走 store applyTransaction 既有通路（transition_object op
 *   patch change=STABLE→CHALLENGED；CHALLENGED 复用既有 CHANGE_VALUES 词形零新增）；
 * - store.ts L1240 既有前置核实结论：LOCKED+STABLE→CHALLENGED 要求 tx.authorityRef
 *   非空（DECISION.* / CHANGE.* / PERMIT.* 宽松 general_id 形态，store 仅校验非空）——
 *   本模块把 breach Evidence 引用（PBR-*）作为 tx.authorityRef 接线（确定性工具信号
 *   即挑战权威：「LOCKED 不是圣旨，但也不是随便挑战」的 §95.2 兑现形态）。呈报项已裁：
 *   authorityRef 承载 PBR-* 的接线事实经 vocab-pr-0004 登记于 vocab-lock
 *   id_namespace.state_plane_refs（Owner 决议 2026-09-01）；
 * - §95.3 前置（capability lifecycle=CURRENT、change=STABLE、breach evidence 存在且
 *   属该 band）在事务外显式核实，非 CURRENT/重复 challenge/无 evidence 显式拒绝。
 *
 * 存储形态（.pomaster/production/ 子树；新分区呈报项；不进 content_digest、
 * 零 journal 事件——band/observation/breach/challenge/diagnosis/candidate 六类台账
 * 是 §95.2 链的 staging/登记平面，其中唯一治理事实变更（change 轴转移）经
 * applyTransaction 落 state/ 并由事务自身记 TX_APPLIED journal）：
 * - .pomaster/production/bands/<band-id>.json                 band 定义（15-production-band
 *   schema 契约；phase 恒 IN_PRODUCTION——构造面无 phase 参数位=写不出非生产带）；
 * - .pomaster/production/observations/POB-<12hex>.json        observation 台账（三态判定随录）；
 * - .pomaster/production/breaches/PBR-<12hex>.json            breach Evidence（detected_by
 *   恒 tool_signal——词形常量字段落盘）；
 * - .pomaster/production/challenges/PCH-<12hex>.json          challenge 留痕（事务结果镜像）；
 * - .pomaster/production/diagnoses/PDG-<12hex>.json           diagnosis 台账；
 * - .pomaster/production/self-improvement/PSI-<12hex>.json    §90.4 候选（恒 CANDIDATE 呈报态）。
 * id 全部内容寻址（identity 载荷 canonical JSON 的 sha256 前 12 hex——同输入重放显式
 * 检出重复，A4 无墙钟无随机；HM-/GRN-/CLM- 同族通路编号词形，非 governed 前缀不过
 * parseGovernedId）。
 */
import { existsSync, readdirSync } from "node:fs";
import type { Actor, GovernedId, Store, TransactionResult } from "./index.js";
import { GovernanceError, GovernedIdParseError, governanceCodeForParseError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import { captureOriginal, executeWrites, readText } from "./io.js";
import { buildStorePaths, readCurrentSeq, readJournalLines } from "./paths.js";
import { applyTransaction, loadTruthIndex } from "./store.js";
import { sha256OfCanonical } from "./digest.js";
import {
  BAND_PREDICATE_OPERATOR_VALUES,
  CONTROL_BAND_EVALUATION_STATUS_VALUES,
  DETECTED_BY_TOOL_SIGNAL,
  DIAGNOSIS_KIND_VALUES,
  POMASTER_SELF_IMPROVEMENT_CANDIDATE,
  PHASE_TIMELINE_VALUES,
  PRODUCTION_SIGNAL_SOURCE_VALUES,
  SELF_IMPROVEMENT_SIGNAL_PRD_LABELS,
  SELF_IMPROVEMENT_SIGNAL_VALUES,
  type BandPredicateOperatorValue,
  type CapabilityOutcomeMetricKey,
  type ControlBandEvaluationStatusValue,
  type DiagnosisKindValue,
  type ProductionSignalSourceValue,
  type SelfImprovementSignalValue,
} from "./vocab.js";

// ============================================================
// 存储路径（.pomaster/production/ 子树；数据落点纪律见头注）
// ============================================================

/** production 子树根相对路径（P34 新分区——呈报项）。 */
export const PRODUCTION_RELATIVE = ".pomaster/production";

/** band 定义目录（.pomaster/production/bands/）。 */
export const PRODUCTION_BANDS_RELATIVE = `${PRODUCTION_RELATIVE}/bands`;
/** observation 台账目录（.pomaster/production/observations/）。 */
export const PRODUCTION_OBSERVATIONS_RELATIVE = `${PRODUCTION_RELATIVE}/observations`;
/** breach evidence 目录（.pomaster/production/breaches/）。 */
export const PRODUCTION_BREACHES_RELATIVE = `${PRODUCTION_RELATIVE}/breaches`;
/** challenge 留痕目录（.pomaster/production/challenges/）。 */
export const PRODUCTION_CHALLENGES_RELATIVE = `${PRODUCTION_RELATIVE}/challenges`;
/** diagnosis 台账目录（.pomaster/production/diagnoses/）。 */
export const PRODUCTION_DIAGNOSES_RELATIVE = `${PRODUCTION_RELATIVE}/diagnoses`;
/** §90.4 自改进候选目录（.pomaster/production/self-improvement/）。 */
export const PRODUCTION_SELF_IMPROVEMENT_RELATIVE = `${PRODUCTION_RELATIVE}/self-improvement`;

function subdirOf(rootDir: string, relative: string): string {
  return `${rootDir}/${relative}`;
}

function entryPath(rootDir: string, relative: string, filename: string): string {
  return `${subdirOf(rootDir, relative)}/${filename}`;
}

// ============================================================
// 类型（文件世界 snake_case，镜像 15-production-band schema 与各台账记录）
// ============================================================

/** 击穿谓词（machine-evaluable；§95.2 封条的类型面：禁自由文本判据字段位）。 */
export interface BandPredicate {
  readonly operator: BandPredicateOperatorValue;
  /** 击穿阈值（between 时为健康带下界；有限数）。 */
  readonly threshold: number;
  /** 健康带上界（仅 between 且必填——单/双阈值算子互斥，装载面同判）。 */
  readonly threshold_max?: number;
}

/**
 * Control band 定义（.pomaster/production/bands/<id>.json；15-production-band schema
 * 镜像）。phase 恒 IN_PRODUCTION（§30 第四态；§95.1 生命周期扩展承载位）——
 * registerControlBand 输入面无 phase 参数位（构造面封条：写不出非生产带）。
 */
export interface ControlBand {
  readonly id: string;
  readonly title: string;
  /** 受治理对象引用（parseGovernedId closed-world 校验；§95.3 CURRENT→CHALLENGED 目标）。 */
  readonly capability_ref: string;
  readonly phase: "IN_PRODUCTION";
  readonly source: ProductionSignalSourceValue;
  /** observation 联结键（exact match；不匹配 = NOT_EVALUABLE 显式）。 */
  readonly metric_name: string;
  readonly predicate: BandPredicate;
  /** 观测窗口声明位（v1 单观测评估不消费——多观测窗口语义待后续批次，禁发明）。 */
  readonly window: number | null;
}

/** 生产观测（evaluateControlBand 判定输入；数值+枚举面——禁自由文本判据）。 */
export interface BandObservation {
  readonly metric_name: string;
  readonly value: number;
  readonly observed_at_seq: number;
}

/** breach Evidence（.pomaster/production/breaches/PBR-*.json；detected_by 恒 tool_signal）。 */
export interface BreachEvidenceRecord {
  readonly id: string;
  readonly band_id: string;
  readonly capability_ref: string;
  readonly metric_name: string;
  readonly value: number;
  readonly observed_at_seq: number;
  readonly predicate: BandPredicate;
  readonly detected_by: typeof DETECTED_BY_TOOL_SIGNAL;
  readonly status: "BREACHED";
  readonly observation_ref: string;
  readonly recorded_at_seq: number | null;
}

/** evaluateControlBand 三态判定结果（BREACHED 时携带完整 breach Evidence 产物）。 */
export interface BandEvaluation {
  readonly band_id: string;
  readonly metric_name: string;
  readonly status: ControlBandEvaluationStatusValue;
  /** 观测值（NOT_EVALUABLE 且值本身不可用时 null）。 */
  readonly value: number | null;
  /** 判定细节（OK/BREACHED 时为谓词判式呈现；NOT_EVALUABLE 时为缺席原因码）。 */
  readonly detail: string;
  readonly breach: BreachEvidenceRecord | null;
}

/** observation 台账记录（.pomaster/production/observations/POB-*.json）。 */
export interface ObservationRecord {
  readonly id: string;
  readonly band_id: string;
  readonly metric_name: string;
  readonly value: number;
  readonly observed_at_seq: number;
  readonly evaluated_status: ControlBandEvaluationStatusValue;
  readonly breach_ref: string | null;
  readonly detail: string;
  readonly recorded_at_seq: number | null;
}

/** challenge 留痕（.pomaster/production/challenges/PCH-*.json；事务结果镜像）。 */
export interface ChallengeRecord {
  readonly id: string;
  readonly band_id: string;
  readonly breach_ref: string;
  readonly capability_ref: string;
  readonly from_change: "STABLE";
  readonly to_change: "CHALLENGED";
  readonly reason_short: string;
  /** store L1240 前置承载位（=breach_ref；接线裁定见头注「生命周期接线」）。 */
  readonly authority_ref: string;
  readonly applied_seq: number;
  readonly note: string | null;
}

/** diagnosis 台账（.pomaster/production/diagnoses/PDG-*.json）。 */
export interface DiagnosisRecord {
  readonly id: string;
  readonly challenge_ref: string;
  readonly breach_ref: string;
  readonly band_id: string;
  readonly capability_ref: string;
  readonly kind: DiagnosisKindValue;
  readonly notes: string;
  readonly diagnosed_by: {
    readonly actor_type: Actor["actorType"];
    readonly actor: string;
    readonly self_attested: boolean;
  };
  readonly diagnosed_at_seq: number | null;
}

/** §90.4 自改进候选（.pomaster/production/self-improvement/PSI-*.json；恒 CANDIDATE 呈报态）。 */
export interface SelfImprovementCandidateRecord {
  /** PRD L5695 逐字产物词形（POMASTER_SELF_IMPROVEMENT_CANDIDATE）恒占 kind 位。 */
  readonly id: string;
  readonly kind: typeof POMASTER_SELF_IMPROVEMENT_CANDIDATE;
  readonly signal: SelfImprovementSignalValue;
  /** §90.4 bullet 原文逐字镜像（SELF_IMPROVEMENT_SIGNAL_PRD_LABELS 派生，非自报）。 */
  readonly signal_label: string;
  readonly note: string;
  readonly evidence_refs: readonly string[];
  readonly reported_by: {
    readonly actor_type: Actor["actorType"];
    readonly actor: string;
    readonly self_attested: boolean;
  };
  readonly reported_at_seq: number | null;
}

// ============================================================
// id 派生（内容寻址；A4 无墙钟无随机）
// ============================================================

/** 内容寻址 id：前缀 + sha256(canonicalJson(identity)) 前 12 hex（同文同 id 显式检出）。 */
function productionEntryId(
  prefix: "POB" | "PBR" | "PCH" | "PDG" | "PSI",
  identity: unknown,
): string {
  return `${prefix}-${sha256OfCanonical(identity).slice("sha256:".length, "sha256:".length + 12)}`;
}

const ENTRY_ID_PATTERN = /^(POB|PBR|PCH|PDG|PSI)-[0-9a-f]{12}$/;

// ============================================================
// 校验辅助（fail-closed；memory-harvest 同款）
// ============================================================

function requireVocab<T extends string>(
  value: string,
  values: readonly T[],
  field: string,
  source: string,
): T {
  const matched = values.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `${field} 词表外：${value}（${source}）`,
      `合法词形：${values.join(" | ")}；扩值走词汇表 PR（production_band_vocab@vocab-pr-0004 已收编）`,
      { [field]: value },
    );
  }
  return matched;
}

function requireNonEmpty(value: string, field: string, why: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 为空（${why}）`,
      why,
      { [field]: value },
    );
  }
  return trimmed;
}

function requireFiniteNumber(value: unknown, field: string, why: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 须为有限数（${why}），得到 ${String(value)}`,
      "NaN/Infinity 不可 JSON round-trip 亦不可进判定通路（§95.2 显式谓词纪律）",
      { [field]: value },
    );
  }
  return value;
}

function requireNonNegativeInt(value: unknown, field: string, why: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 须为 ≥0 整数（${why}），得到 ${String(value)}`,
      "A4 单调事件序号词形",
      { [field]: value },
    );
  }
  return value;
}

/**
 * 谓词完整性校验（单/双阈值互斥 + between 成对 + 下界 ≤ 上界 + 全有限数）。
 * 破坏 = SCHEMA_INVALID（落盘面）；判定面（evaluateControlBand）对同形态损坏
 * 显式 NOT_EVALUABLE 不抛（三态纪律：判定永不因载荷损坏静默绿或崩溃）。
 */
function validatePredicate(
  predicate: BandPredicate,
  field: string,
): void {
  if (predicate === null || typeof predicate !== "object") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 缺失或非对象（machine-evaluable 谓词必填）`,
      "谓词形态 {operator, threshold[, threshold_max]}；自由文本判据字段结构性不存在（§95.2 封条）",
      { [field]: predicate },
    );
  }
  // 键闭集校验（红队 A1c 封条：15 schema additionalProperties:false 的 kernel 装载面
  // 镜像）——手改 band/breach 文件塞入 criteria/looks_wrong 类语义暗示字段在
  // register/装载/breach 三入口统一拒绝；附加字段对判定惰性，但台账可携带语义
  // 字段供人/LLM 误读为判据，结构性封死。
  for (const key of Object.keys(predicate)) {
    if (key !== "operator" && key !== "threshold" && key !== "threshold_max") {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `${field} 携带未知字段「${key}」（谓词键闭集 operator/threshold/threshold_max）`,
        "自由文本判据字段结构性不存在（§95.2：不得把是否异常交给 LLM 主观判断）；恢复 git 版本或删除该字段",
        { [field]: predicate, unknown_key: key },
      );
    }
  }
  const operator = requireVocab(
    String(predicate.operator),
    BAND_PREDICATE_OPERATOR_VALUES,
    `${field}.operator`,
    "击穿谓词算子五值闭集",
  );
  const threshold = requireFiniteNumber(
    predicate.threshold,
    `${field}.threshold`,
    "击穿阈值必填",
  );
  if (operator === "between") {
    const max = requireFiniteNumber(
      predicate.threshold_max,
      `${field}.threshold_max`,
      "between 算子须 threshold+threshold_max 成对（闭区间健康带）",
    );
    if (threshold > max) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `${field}: threshold(${String(threshold)}) > threshold_max(${String(max)})（健康带下界不得高于上界）`,
        "between 闭区间健康带 [threshold, threshold_max]；下界 > 上界是自相矛盾谓词",
        { [field]: predicate },
      );
    }
  } else if (predicate.threshold_max !== undefined && predicate.threshold_max !== null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field}: 非 between 算子不得携带 threshold_max（单/双阈值算子互斥——歧义即损坏）`,
      "单阈值算子（gt/lt/gte/lte）只携带 threshold；双阈值语义请用 between",
      { [field]: predicate },
    );
  }
}

// ============================================================
// registerControlBand（band 定义唯一构造面——phase 恒 IN_PRODUCTION）
// ============================================================

/** registerControlBand 输入（无 phase 参数位——构造面封条：band 只在 IN_PRODUCTION 存在）。 */
export interface ControlBandInput {
  /** band id（确定性 slug：^[a-z0-9][a-z0-9_-]{0,63}$；.pomaster/production/bands/ 落点名）。 */
  readonly id: string;
  readonly title: string;
  /** 受治理对象 id（parseGovernedId closed-world 校验；§95.3 challenge 转移目标）。 */
  readonly capabilityRef: string;
  readonly source: ProductionSignalSourceValue;
  readonly metricName: string;
  readonly predicate: BandPredicate;
  /** 观测窗口声明位（v1 不消费；缺省 null）。 */
  readonly window?: number | null;
}

const BAND_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const METRIC_NAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,127}$/;

/**
 * band 定义登记（唯一构造面）：词形全量 fail-closed（id slug/source/capability_ref
 * governed 文法/谓词完整性）+ phase 恒 IN_PRODUCTION；同 id 重复登记 = SCHEMA_INVALID
 * （band 是可寻址定义不是流水记录；改定义 = 新 id 或显式删除旧文件后重登，禁静默覆盖）。
 */
export function registerControlBand(
  rootDir: string,
  input: ControlBandInput,
): ControlBand {
  if (!BAND_ID_PATTERN.test(input.id)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `band id 词形非法：${input.id}（须 ^[a-z0-9][a-z0-9_-]{0,63}$ 确定性 slug）`,
      "band id 是落盘文件名兼联结键（禁墙钟禁随机，A4）；如 carline-list-p99-latency",
      { id: input.id },
    );
  }
  const path = entryPath(rootDir, PRODUCTION_BANDS_RELATIVE, `${input.id}.json`);
  if (readText(path) !== null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `band 定义已存在：${PRODUCTION_BANDS_RELATIVE}/${input.id}.json（同 id 重复登记）`,
      "band 是可寻址定义不是流水记录——换新 id 或显式删除旧定义后重登；禁静默覆盖",
      { id: input.id, path },
    );
  }
  const title = requireNonEmpty(input.title, "title", "band 人读标题必填（呈现位，不进判定通路）");
  // capability_ref：governed id closed-world 文法校验（A5）。
  try {
    parseGovernedId(input.capabilityRef);
  } catch (error) {
    if (error instanceof GovernedIdParseError) {
      throw new GovernanceError(
        governanceCodeForParseError(error),
        `capability_ref governed id 非法：${error.message}`,
        "band 挂载受治理对象（§95.3 CURRENT→CHALLENGED 的转移目标）；前缀闭包见 vocab-lock id_namespace（A5）",
        { capability_ref: input.capabilityRef },
      );
    }
    throw error;
  }
  const source = requireVocab(
    input.source,
    PRODUCTION_SIGNAL_SOURCE_VALUES,
    "source",
    "§95.2 生产信号源五词形（metric/log/error_budget/slo/control_band）",
  );
  const metricName = requireNonEmpty(input.metricName, "metricName", "observation 联结键必填");
  if (!METRIC_NAME_PATTERN.test(metricName)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `metricName 词形非法：${metricName}（须 ^[a-z0-9][a-z0-9_.-]{0,127}$ 机器可比较标识）`,
      "metric_name 是 observation exact-match 联结键（不匹配=NOT_EVALUABLE 显式）；小写 snake/dot/dash",
      { metric_name: metricName },
    );
  }
  validatePredicate(input.predicate, "predicate");
  let window: number | null = null;
  if (input.window !== undefined && input.window !== null) {
    window = requireNonNegativeInt(input.window, "window", "观测窗口声明位（≥1 整数或 null；v1 不消费）");
    if (window < 1) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `window 须为 ≥1 整数或 null，得到 ${String(window)}`,
        "window 是声明位非消费位（多观测窗口语义待后续批次）；0 无窗口语义",
        { window },
      );
    }
  }
  const band: ControlBand = {
    id: input.id,
    title,
    capability_ref: input.capabilityRef,
    phase: "IN_PRODUCTION",
    source,
    metric_name: metricName,
    predicate: input.predicate,
    window,
  };
  executeWrites([
    {
      path,
      next: `${JSON.stringify(band, null, 2)}\n`,
      original: captureOriginal(path),
    },
  ]);
  return band;
}

// ============================================================
// band 装载（装载面 fail-closed；词形闭包 + phase 常量 + 谓词完整性复核）
// ============================================================

/** 装载面 fail-closed（判卷不信任落盘字节——手改 band 在此显式拒绝）。 */
function validateLoadedBand(record: unknown, path: string): ControlBand {
  const band = record as ControlBand;
  const fail = (detail: string, hint: string): GovernanceError =>
    new GovernanceError("SCHEMA_INVALID", `${path} ${detail}`, hint, { path });
  if (typeof band.id !== "string" || !BAND_ID_PATTERN.test(band.id)) {
    throw fail(`id 词形非法：${String(band.id)}`, "band id 须确定性 slug；恢复 git/备份或删除手改文件");
  }
  requireNonEmpty(String(band.title ?? ""), "title", "band 人读标题必填（装载面复核）");
  if (typeof band.capability_ref !== "string") {
    throw fail("capability_ref 缺失", "band 必须挂载受治理对象（§95.3 转移目标）；恢复备份");
  }
  try {
    parseGovernedId(band.capability_ref);
  } catch (error) {
    throw fail(
      `capability_ref governed id 非法：${error instanceof Error ? error.message : String(error)}`,
      "恢复备份；capability_ref 须过 parseGovernedId（A5 closed-world）",
    );
  }
  const phase = requireVocab(
    String(band.phase),
    PHASE_TIMELINE_VALUES,
    "phase",
    "§30 四态时间轴（PRE_DEV/IN_DEV/POST_DEV/IN_PRODUCTION）",
  );
  if (phase !== "IN_PRODUCTION") {
    throw fail(
      `phase=${phase}（band 级收窄恒 IN_PRODUCTION——§95 生产反馈带只在第四态生效）`,
      "PRE_DEV/IN_DEV/POST_DEV 相位的门禁归 Gauntlet/Gate 体系；恢复备份",
    );
  }
  requireVocab(
    String(band.source),
    PRODUCTION_SIGNAL_SOURCE_VALUES,
    "source",
    "§95.2 生产信号源五词形",
  );
  if (typeof band.metric_name !== "string" || !METRIC_NAME_PATTERN.test(band.metric_name)) {
    throw fail(`metric_name 词形非法：${String(band.metric_name)}`, "恢复备份；metric_name 是 observation 联结键");
  }
  validatePredicate(band.predicate as BandPredicate, "predicate");
  if (
    band.window !== null &&
    band.window !== undefined &&
    (typeof band.window !== "number" || !Number.isInteger(band.window) || band.window < 1)
  ) {
    throw fail("window 非 ≥1 整数或 null", "window 是声明位；恢复备份");
  }
  return band;
}

function loadProductionRecord(rootDir: string, relative: string, filename: string): unknown {
  const path = entryPath(rootDir, relative, filename);
  const text = readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${path} 无法解析（损坏或手改）`,
      "恢复备份；production 台账由 kernel production.ts 语义入口维护，禁止手改",
      { path, cause: String(error) },
    );
  }
}

/** 按 id 读 band 定义（缺席 = OBJECT_NOT_FOUND 显式）。 */
export function readControlBand(rootDir: string, bandId: string): ControlBand {
  const record = loadProductionRecord(rootDir, PRODUCTION_BANDS_RELATIVE, `${bandId}.json`);
  if (record === null) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `band 定义不在册：${bandId}（${PRODUCTION_BANDS_RELATIVE}/ 无此 id）`,
      "production bands 列出在册定义；band id 是确定性 slug（registerControlBand 登记）",
      { band_id: bandId },
    );
  }
  return validateLoadedBand(record, entryPath(rootDir, PRODUCTION_BANDS_RELATIVE, `${bandId}.json`));
}

/** band 全量装载（id 字典序——确定性；无目录 = 空集合法态）。 */
export function listControlBands(rootDir: string): readonly ControlBand[] {
  return listProductionRecords(rootDir, PRODUCTION_BANDS_RELATIVE).map(({ record, path }) =>
    validateLoadedBand(record, path),
  );
}

interface ProductionRecordRef {
  readonly filename: string;
  readonly path: string;
  readonly record: unknown;
}

/** production 台账通用扫描（文件名字典序——确定性；无目录 = 空集合法态）。 */
function listProductionRecords(rootDir: string, relative: string): readonly ProductionRecordRef[] {
  const dir = subdirOf(rootDir, relative);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith(".json"))
    .map((f) => f.name)
    .sort()
    .map((filename) => {
      const path = entryPath(rootDir, relative, filename);
      const text = readText(path);
      if (text === null) {
        throw new GovernanceError(
          "ENVIRONMENT_ERROR",
          `production 台账文件扫描时在座读取缺席：${path}`,
          "并发删改；重跑（禁静默跳过）",
          { path },
        );
      }
      try {
        return { filename, path, record: JSON.parse(text) as unknown };
      } catch (error) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `${path} 无法解析（损坏或手改）`,
          "恢复备份；production 台账由 kernel production.ts 语义入口维护，禁止手改",
          { path, cause: String(error) },
        );
      }
    });
}

// ============================================================
// evaluateControlBand（Deterministic Detection 纯函数——§95.2 结构封条落点）
// ============================================================

/**
 * 确定性判定（纯函数；band × observation → OK | BREACHED | NOT_EVALUABLE）：
 * - 指标名 exact match 不匹配 → NOT_EVALUABLE（禁就近匹配/猜测）；
 * - 值非有限数值（非 number/NaN/Infinity）→ NOT_EVALUABLE（显式缺席绝不静默 OK）；
 * - 谓词损坏（算子词表外/阈值非有限/between 失配对/单阈值算子携带 threshold_max/
 *   between 下界 > 上界）→ NOT_EVALUABLE（判定面不抛不崩——载荷损坏是显式缺席态）；
 * - 击穿语义：gt 值>阈值击穿 / lt 值<阈值击穿 / gte、lte 同理含等号 / between 值出
 *   闭区间 [threshold, threshold_max] 击穿（带内含端点 = OK）；
 * - BREACHED 时产完整 breach Evidence 产物（detected_by 恒 tool_signal——C5：判定
 *   来自工具信号非 LLM 自报；id 内容寻址确定性派生）。
 * 类型面即封条：本签名只接受 BandPredicate（五算子+数值阈值）与 BandObservation
 * （指标名+数值+序号）——自由文本判据字段在类型与运行时双重结构性不存在。
 */
export function evaluateControlBand(
  band: ControlBand,
  observation: BandObservation,
): BandEvaluation {
  const notEvaluable = (detail: string, value: number | null): BandEvaluation => ({
    band_id: band.id,
    metric_name: observation.metric_name,
    status: "NOT_EVALUABLE",
    value,
    detail,
    breach: null,
  });
  if (observation.metric_name !== band.metric_name) {
    return notEvaluable(
      `METRIC_NAME_MISMATCH: band 联结键 ${band.metric_name} ≠ observation ${observation.metric_name}`,
      typeof observation.value === "number" && Number.isFinite(observation.value) ? observation.value : null,
    );
  }
  if (typeof observation.value !== "number" || !Number.isFinite(observation.value)) {
    return notEvaluable(
      `VALUE_NOT_FINITE_NUMBER: 观测值 ${String(observation.value)} 非有限数值`,
      null,
    );
  }
  const value = observation.value;
  const predicate = band.predicate as BandPredicate | null | undefined;
  if (predicate === null || predicate === undefined || typeof predicate !== "object") {
    return notEvaluable("PREDICATE_CORRUPT: 谓词缺失或非对象", value);
  }
  const operator = BAND_PREDICATE_OPERATOR_VALUES.find(
    (candidate) => candidate === (predicate as BandPredicate).operator,
  );
  if (operator === undefined) {
    return notEvaluable(`PREDICATE_CORRUPT: 算子词表外 ${String((predicate as BandPredicate).operator)}`, value);
  }
  const threshold = (predicate as BandPredicate).threshold;
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
    return notEvaluable(`PREDICATE_CORRUPT: 阈值非有限数 ${String(threshold)}`, value);
  }
  const thresholdMax = (predicate as BandPredicate).threshold_max;
  if (operator === "between") {
    if (typeof thresholdMax !== "number" || !Number.isFinite(thresholdMax)) {
      return notEvaluable("PREDICATE_CORRUPT: between 缺有限 threshold_max（健康带须成对）", value);
    }
    if (threshold > thresholdMax) {
      return notEvaluable(
        `PREDICATE_CORRUPT: 健康带下界 ${String(threshold)} > 上界 ${String(thresholdMax)}`,
        value,
      );
    }
  } else if (thresholdMax !== undefined && thresholdMax !== null) {
    return notEvaluable("PREDICATE_CORRUPT: 非 between 算子携带 threshold_max（单/双阈值互斥）", value);
  }
  let breached: boolean;
  switch (operator) {
    case "gt":
      breached = value > threshold;
      break;
    case "gte":
      breached = value >= threshold;
      break;
    case "lt":
      breached = value < threshold;
      break;
    case "lte":
      breached = value <= threshold;
      break;
    case "between":
      breached = value < threshold || value > (thresholdMax as number);
      break;
  }
  const detail = `predicate: ${band.metric_name}=${String(value)} ${operator} ${String(threshold)}${
    operator === "between" ? `..${String(thresholdMax)}` : ""
  }`;
  if (!breached) {
    return { band_id: band.id, metric_name: band.metric_name, status: "OK", value, detail, breach: null };
  }
  const identity = observationIdentityOf(band.id, observation);
  const breach: BreachEvidenceRecord = {
    id: productionEntryId("PBR", identity),
    band_id: band.id,
    capability_ref: band.capability_ref,
    metric_name: band.metric_name,
    value,
    observed_at_seq: observation.observed_at_seq,
    predicate: band.predicate,
    detected_by: DETECTED_BY_TOOL_SIGNAL,
    status: "BREACHED",
    observation_ref: productionEntryId("POB", identity),
    recorded_at_seq: null,
  };
  return { band_id: band.id, metric_name: band.metric_name, status: "BREACHED", value, detail, breach };
}

function observationIdentityOf(bandId: string, observation: BandObservation): unknown {
  return {
    band_id: bandId,
    metric_name: observation.metric_name,
    value: observation.value,
    observed_at_seq: observation.observed_at_seq,
  };
}

// ============================================================
// recordObservation（observation 台账唯一写入点；BREACHED 同事务写 breach）
// ============================================================

/**
 * observation 落账：装载 band → evaluateControlBand 确定性判定 → observation 记录
 * 与（BREACHED 时）breach Evidence 同批 staged 落盘（单次 executeWrites——半账不可达）。
 * 重复观测（同 band+metric+value+seq 内容寻址 id 撞册）= SCHEMA_INVALID 显式（A4
 * 同输入重放检出；调重复跑请用既有台账呈现）。NOT_EVALUABLE 观测同样入账
 * （evaluated_status=NOT_EVALUABLE、breach_ref=null——缺席显式呈现，禁静默丢弃）。
 * 落账面要求观测值为有限数（NaN/Infinity 不可 JSON round-trip；判 NOT_EVALUABLE
 * 请用 evaluateControlBand 纯函数面）。
 */
export function recordObservation(
  rootDir: string,
  bandId: string,
  observation: BandObservation,
): ObservationRecord {
  const band = readControlBand(rootDir, bandId);
  if (typeof observation.metric_name !== "string" || observation.metric_name.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "observation.metric_name 须为非空字符串（band 联结键）",
      "metric_name exact-match 联结 band.metric_name；不匹配会被判 NOT_EVALUABLE 而非猜测",
      { metric_name: observation.metric_name },
    );
  }
  if (typeof observation.value !== "number" || !Number.isFinite(observation.value)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `observation.value 须为有限数（落账面），得到 ${String(observation.value)}`,
      "NaN/Infinity 不可 JSON round-trip；非数值观测的 NOT_EVALUABLE 判定请用 evaluateControlBand 纯函数面",
      { value: observation.value },
    );
  }
  requireNonNegativeInt(observation.observed_at_seq, "observed_at_seq", "观测序号（A4 单调事件序号词形）");
  const evaluation = evaluateControlBand(band, observation);
  const identity = observationIdentityOf(bandId, observation);
  const id = productionEntryId("POB", identity);
  const observationPath = entryPath(rootDir, PRODUCTION_OBSERVATIONS_RELATIVE, `${id}.json`);
  if (readText(observationPath) !== null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `同观测已入账：${PRODUCTION_OBSERVATIONS_RELATIVE}/${id}.json（内容寻址 id 撞册）`,
      "同 (band, metric, value, seq) 重复落账是调用方缺陷或幂等重放——呈现走台账读取，不重复入册",
      { id, path: observationPath },
    );
  }
  const paths = buildStorePaths(rootDir);
  const record: ObservationRecord = {
    id,
    band_id: bandId,
    metric_name: observation.metric_name,
    value: observation.value,
    observed_at_seq: observation.observed_at_seq,
    evaluated_status: evaluation.status,
    breach_ref: evaluation.breach?.id ?? null,
    detail: evaluation.detail,
    recorded_at_seq: readCurrentSeq(paths),
  };
  const writes = [
    {
      path: observationPath,
      next: `${JSON.stringify(record, null, 2)}\n`,
      original: captureOriginal(observationPath),
    },
  ];
  if (evaluation.breach !== null) {
    const breachRecord: BreachEvidenceRecord = { ...evaluation.breach, recorded_at_seq: record.recorded_at_seq };
    const breachPath = entryPath(rootDir, PRODUCTION_BREACHES_RELATIVE, `${breachRecord.id}.json`);
    if (readText(breachPath) !== null) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `breach evidence 已在册：${PRODUCTION_BREACHES_RELATIVE}/${breachRecord.id}.json（observation 未在册而 breach 在册 = 台账半账损坏）`,
        "observation 与 breach 单批原子落盘（executeWrites staged）；半账说明台账被手改，恢复备份",
        { breach_ref: breachRecord.id },
      );
    }
    writes.push({
      path: breachPath,
      next: `${JSON.stringify(breachRecord, null, 2)}\n`,
      original: captureOriginal(breachPath),
    });
  }
  executeWrites(writes);
  return record;
}

/** observation 全量装载（id 字典序；装载面 fail-closed）。 */
export function listObservations(rootDir: string): readonly ObservationRecord[] {
  return listProductionRecords(rootDir, PRODUCTION_OBSERVATIONS_RELATIVE).map(
    ({ record, path }) => validateLoadedObservation(record, path),
  );
}

function validateLoadedObservation(record: unknown, path: string): ObservationRecord {
  const entry = record as ObservationRecord;
  const fail = (detail: string, hint: string): GovernanceError =>
    new GovernanceError("SCHEMA_INVALID", `${path} ${detail}`, hint, { path });
  if (typeof entry.id !== "string" || !entry.id.startsWith("POB-") || !ENTRY_ID_PATTERN.test(entry.id)) {
    throw fail(`id 词形非法：${String(entry.id)}`, "observation id 须 POB-<12hex> 内容寻址；恢复备份");
  }
  if (typeof entry.band_id !== "string" || entry.band_id.length === 0) {
    throw fail("band_id 缺失", "恢复备份");
  }
  requireFiniteNumber(entry.value, "value", "observation 台账值位");
  requireNonNegativeInt(entry.observed_at_seq, "observed_at_seq", "观测序号");
  const status = requireVocab(
    String(entry.evaluated_status),
    CONTROL_BAND_EVALUATION_STATUS_VALUES,
    "evaluated_status",
    "band 判定三态（OK/BREACHED/NOT_EVALUABLE）",
  );
  if (status === "BREACHED") {
    if (typeof entry.breach_ref !== "string" || !entry.breach_ref.startsWith("PBR-")) {
      throw fail("BREACHED 观测缺 breach_ref（PBR-*）", "BREACHED 必产 Evidence（§95.2 链序）；恢复备份");
    }
  } else if (entry.breach_ref !== null) {
    throw fail(`${status} 观测携带 breach_ref（非击穿无 Evidence——手改痕迹）`, "恢复备份");
  }
  if (typeof entry.detail !== "string" || entry.detail.length === 0) {
    throw fail("detail 缺失（判定细节必留痕）", "恢复备份");
  }
  return entry;
}

/** 按 id 读 breach evidence（缺席 = OBJECT_NOT_FOUND 显式）。 */
export function readBreach(rootDir: string, breachRef: string): BreachEvidenceRecord {
  if (!/^PBR-[0-9a-f]{12}$/.test(breachRef)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `breach 引用词形非法：${breachRef}（须 PBR-<12hex>）`,
      "breach evidence id 由 evaluateControlBand 内容寻址派生，禁手造",
      { breach_ref: breachRef },
    );
  }
  const path = entryPath(rootDir, PRODUCTION_BREACHES_RELATIVE, `${breachRef}.json`);
  const record = loadProductionRecord(rootDir, PRODUCTION_BREACHES_RELATIVE, `${breachRef}.json`);
  if (record === null) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `breach evidence 不在册：${breachRef}（${PRODUCTION_BREACHES_RELATIVE}/ 无此 id）`,
      "production breaches 列出在册 Evidence；breach 由 recordObservation 判定 BREACHED 时自动产出",
      { breach_ref: breachRef },
    );
  }
  return validateLoadedBreach(record, path);
}

function validateLoadedBreach(record: unknown, path: string): BreachEvidenceRecord {
  const entry = record as BreachEvidenceRecord;
  const fail = (detail: string, hint: string): GovernanceError =>
    new GovernanceError("SCHEMA_INVALID", `${path} ${detail}`, hint, { path });
  if (typeof entry.id !== "string" || !ENTRY_ID_PATTERN.test(entry.id) || !entry.id.startsWith("PBR-")) {
    throw fail(`id 词形非法：${String(entry.id)}`, "breach id 须 PBR-<12hex>；恢复备份");
  }
  if (entry.detected_by !== DETECTED_BY_TOOL_SIGNAL) {
    throw fail(
      `detected_by=${String(entry.detected_by)}（恒 ${DETECTED_BY_TOOL_SIGNAL}——C5 判定来自工具信号）`,
      "detected_by 是词形常量字段落盘位，手改即损坏；恢复备份",
    );
  }
  if (entry.status !== "BREACHED") {
    throw fail(`status=${String(entry.status)}（breach 台账只收 BREACHED 产物）`, "恢复备份");
  }
  requireFiniteNumber(entry.value, "value", "breach 台账值位");
  requireNonNegativeInt(entry.observed_at_seq, "observed_at_seq", "观测序号");
  validatePredicate(entry.predicate as BandPredicate, "predicate");
  return entry;
}

/** breach evidence 全量装载（id 字典序）。 */
export function listBreaches(rootDir: string): readonly BreachEvidenceRecord[] {
  return listProductionRecords(rootDir, PRODUCTION_BREACHES_RELATIVE).map(
    ({ record, path }) => validateLoadedBreach(record, path),
  );
}

// ============================================================
// challengeFromBreach（§95.3 State Challenge——走 applyTransaction 零旁路）
// ============================================================

export interface ChallengeFromBreachOptions {
  /** 事务注记（journal TX_APPLIED note 位）。 */
  readonly note?: string;
}

export interface ChallengeFromBreachResult {
  readonly challenge: ChallengeRecord;
  readonly transaction: TransactionResult;
}

/**
 * §95.3 Production State Transition：Capability=CURRENT + control band breached →
 * Capability=CHALLENGED（change 轴 STABLE→CHALLENGED，走 store applyTransaction 既有
 * 通路零旁路）。前置显式核实（事务外）：
 * 1. band 在册且 breach evidence 在册且属该 band（无 evidence = 显式拒绝）；
 * 2. 目标对象在册且 lifecycle=CURRENT（§95.3 链头词形；非 CURRENT 显式拒绝）；
 * 3. change=STABLE（已 CHALLENGED = 重复 challenge 显式拒绝；MIGRATING 拒绝）；
 * 4. 同 (band, breach) 挑战留痕未存在（幂等重放显式拒绝）。
 * 事务接线：transition_object patch {change: "CHALLENGED"}；authorityRef=breach_ref
 * （PBR-* 工具信号引用满足 store LOCKED+STABLE→CHALLENGED 前置——接线裁定见头注）。
 */
export async function challengeFromBreach(
  store: Store,
  bandId: string,
  breachRef: string,
  options?: ChallengeFromBreachOptions,
): Promise<ChallengeFromBreachResult> {
  const rootDir = store.rootDir;
  const band = readControlBand(rootDir, bandId);
  const breach = readBreach(rootDir, breachRef);
  if (breach.band_id !== band.id) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `breach ${breach.id} 属 band ${breach.band_id}，与目标 band ${band.id} 不符`,
      "challenge 的 Evidence 必须来自目标 band 的击穿（§95.2 链序：Detection→Evidence→Challenge）",
      { band_id: band.id, breach_ref: breach.id, breach_band_id: breach.band_id },
    );
  }
  // breach↔band 定义一致性复核（红队 A2d 封条）：band_id 相符不保证 breach 内落的
  // capability_ref/metric_name/predicate 与现行 band 定义一致——同 id 删档重登
  // （谓词放宽或 capability_ref 改挂）后旧 breach 会驱动陈旧谓词/跨对象 challenge。
  // 三字段逐一对照：任一不符 = 陈旧证据显式拒绝，需重新 evaluate 产新 breach。
  const stale =
    breach.capability_ref !== band.capability_ref ||
    breach.metric_name !== band.metric_name ||
    breach.predicate.operator !== band.predicate.operator ||
    breach.predicate.threshold !== band.predicate.threshold ||
    (breach.predicate.threshold_max ?? null) !== (band.predicate.threshold_max ?? null);
  if (stale) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `breach ${breach.id} 与现行 band ${band.id} 定义不一致（capability_ref/metric_name/predicate 任一错位——band 曾被删除重登或手改，证据陈旧）`,
      "陈旧证据不接受：删除旧 breach 后按现行 band 定义重新 production evaluate 产新 breach，再发起 challenge",
      {
        band_id: band.id,
        breach_ref: breach.id,
        breach_capability_ref: breach.capability_ref,
        band_capability_ref: band.capability_ref,
        breach_metric_name: breach.metric_name,
        band_metric_name: band.metric_name,
        breach_predicate: breach.predicate,
        band_predicate: band.predicate,
      },
    );
  }
  const capabilityRef = band.capability_ref;
  const index = await loadTruthIndex(store);
  const row = index.objects.find((candidate) => candidate.id === capabilityRef);
  if (row === undefined) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `challenge 目标对象不在册：${capabilityRef}（band ${band.id} capability_ref）`,
      "先 upsert_object 登记受治理对象，再发起 §95.3 challenge；band.capability_ref 须指向在册对象",
      { capability_ref: capabilityRef, band_id: band.id },
    );
  }
  if (row.axes.lifecycle !== "CURRENT") {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${capabilityRef}: lifecycle=${row.axes.lifecycle} 非 CURRENT（§95.3 链头前置：Capability=CURRENT + band breached → CHALLENGED）`,
      "§95.3 转移只从 CURRENT 态发起；非 CURRENT 对象的处置走既有 lifecycle 迁移面",
      { capability_ref: capabilityRef, lifecycle: row.axes.lifecycle },
    );
  }
  if (row.axes.change === "CHALLENGED") {
    const prior = listChallenges(rootDir).filter(
      (candidate) => candidate.capability_ref === capabilityRef,
    );
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${capabilityRef}: change 已 CHALLENGED（重复 challenge 显式拒绝${prior.length > 0 ? `；既有挑战留痕 ${prior.map((candidate) => candidate.id).join(", ")}` : ""}）`,
      "对象已处 CHALLENGED 态——同一挑战不重复发起；处置走 diagnosis/恢复面，重复留痕先清既有 challenge 记录",
      { capability_ref: capabilityRef, prior_challenges: prior.map((candidate) => candidate.id) },
    );
  }
  if (row.axes.change !== "STABLE") {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${capabilityRef}: change=${row.axes.change} 非 STABLE（MIGRATING 迁移中不接受新挑战）`,
      "§95.3 转移边是 STABLE→CHALLENGED；MIGRATING 由 PERMIT 体系管辖",
      { capability_ref: capabilityRef, change: row.axes.change },
    );
  }
  const challengeId = productionEntryId("PCH", { band_id: band.id, breach_ref: breach.id });
  const challengePath = entryPath(rootDir, PRODUCTION_CHALLENGES_RELATIVE, `${challengeId}.json`);
  if (readText(challengePath) !== null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `同 (band, breach) 挑战留痕已存在：${PRODUCTION_CHALLENGES_RELATIVE}/${challengeId}.json`,
      "一击穿至多驱动一次 challenge（内容寻址留痕幂等）；重复调用是调用方缺陷",
      { challenge_id: challengeId },
    );
  }
  const reasonShort = `control band breached: ${band.id} (${band.metric_name}=${String(breach.value)} ${band.predicate.operator} ${String(band.predicate.threshold)})`;
  const transaction = await applyTransaction(store, {
    ops: [
      {
        op: "transition_object",
        // capabilityRef 已过 parseGovernedId（registerControlBand/装载面 fail-closed），
        // 此处 cast 是 branded type 的合法收窄。
        id: capabilityRef as GovernedId,
        patch: { change: "CHALLENGED" },
        reasonShort,
      },
    ],
    authorityRef: breach.id,
    note: options?.note ?? `P34 §95.3 state challenge from band ${band.id} breach ${breach.id}`,
  });
  const challenge: ChallengeRecord = {
    id: challengeId,
    band_id: band.id,
    breach_ref: breach.id,
    capability_ref: capabilityRef,
    from_change: "STABLE",
    to_change: "CHALLENGED",
    reason_short: reasonShort,
    authority_ref: breach.id,
    applied_seq: transaction.appliedSeq,
    note: options?.note ?? null,
  };
  executeWrites([
    {
      path: challengePath,
      next: `${JSON.stringify(challenge, null, 2)}\n`,
      original: captureOriginal(challengePath),
    },
  ]);
  return { challenge, transaction };
}

function validateLoadedChallenge(record: unknown, path: string): ChallengeRecord {
  const entry = record as ChallengeRecord;
  const fail = (detail: string, hint: string): GovernanceError =>
    new GovernanceError("SCHEMA_INVALID", `${path} ${detail}`, hint, { path });
  if (typeof entry.id !== "string" || !entry.id.startsWith("PCH-") || !ENTRY_ID_PATTERN.test(entry.id)) {
    throw fail(`id 词形非法：${String(entry.id)}`, "challenge id 须 PCH-<12hex>；恢复备份");
  }
  if (typeof entry.band_id !== "string" || entry.band_id.length === 0) {
    throw fail("band_id 缺失", "恢复备份");
  }
  if (typeof entry.breach_ref !== "string" || !entry.breach_ref.startsWith("PBR-")) {
    throw fail("breach_ref 缺失或词形非法（PBR-*）", "challenge 必持 breach Evidence 引用（§95.2 链序）；恢复备份");
  }
  if (typeof entry.capability_ref !== "string" || entry.capability_ref.length === 0) {
    throw fail("capability_ref 缺失", "恢复备份");
  }
  if (entry.from_change !== "STABLE" || entry.to_change !== "CHALLENGED") {
    throw fail(
      `转移对非法：${String(entry.from_change)}→${String(entry.to_change)}（§95.3 唯一合法边 STABLE→CHALLENGED）`,
      "恢复备份",
    );
  }
  if (entry.authority_ref !== entry.breach_ref) {
    throw fail(
      `authority_ref=${String(entry.authority_ref)} ≠ breach_ref（P34 接线裁定：工具信号引用即挑战权威）`,
      "恢复备份",
    );
  }
  requireNonNegativeInt(entry.applied_seq, "applied_seq", "事务序号");
  return entry;
}

/** challenge 留痕全量装载（id 字典序）。 */
export function listChallenges(rootDir: string): readonly ChallengeRecord[] {
  return listProductionRecords(rootDir, PRODUCTION_CHALLENGES_RELATIVE).map(
    ({ record, path }) => validateLoadedChallenge(record, path),
  );
}

// ============================================================
// recordDiagnosis（Agent Diagnosis 消费位——breach evidence 前置封条）
// ============================================================

export interface DiagnosisInput {
  /** §95.3 诊断三分（IMPLEMENTATION_ISSUE / CONFIG_ISSUE / ARCHITECTURE_EVOLUTION）。 */
  readonly kind: DiagnosisKindValue;
  /** 诊断注记（必填留痕；自由文本住这里——不住判定通路）。 */
  readonly notes: string;
  /** 诊断主体（C5 自报登记）。 */
  readonly diagnosedBy: Actor;
}

/**
 * Agent Diagnosis 消费位（§95.2 链序第 4 拍；§95.3 三分落点）。**结构性封条**：
 * diagnosis 必须引用存在且 BREACHED 的 band evidence（challenge 留痕在册 + 其
 * breach_ref 可解析为在册 breach 记录），否则 DIAGNOSIS_WITHOUT_BREACH_EVIDENCE
 * 显式拒绝——「判定来自工具信号非 LLM 自报」的链序保序（无确定性检测在先，诊断
 * 不可入账）。kind 词形全量 fail-closed；notes 必填；同内容重复诊断显式拒绝。
 */
export function recordDiagnosis(
  rootDir: string,
  challengeRef: string,
  input: DiagnosisInput,
): DiagnosisRecord {
  const challenge = listChallenges(rootDir).find((candidate) => candidate.id === challengeRef);
  if (challenge === undefined) {
    throw new GovernanceError(
      "DIAGNOSIS_WITHOUT_BREACH_EVIDENCE",
      `challenge 留痕不在册：${challengeRef}（${PRODUCTION_CHALLENGES_RELATIVE}/ 无此 id）`,
      "diagnosis 必须挂在既有 §95.3 challenge 之后（Deterministic Detection→Evidence→State Challenge→Agent Diagnosis）；先 challengeFromBreach",
      { challenge_ref: challengeRef },
    );
  }
  let breach: BreachEvidenceRecord;
  try {
    breach = readBreach(rootDir, challenge.breach_ref);
  } catch (error) {
    if (error instanceof GovernanceError && (error.code === "OBJECT_NOT_FOUND" || error.code === "SCHEMA_INVALID")) {
      throw new GovernanceError(
        "DIAGNOSIS_WITHOUT_BREACH_EVIDENCE",
        `challenge ${challenge.id} 引用的 breach evidence 不可解析为在册 BREACHED 记录：${challenge.breach_ref}`,
        "diagnosis 前置 = 存在且 BREACHED 的 band evidence；台账半账/手改请恢复备份后重走链",
        { challenge_ref: challenge.id, breach_ref: challenge.breach_ref, cause: error.message },
      );
    }
    throw error;
  }
  if (breach.band_id !== challenge.band_id) {
    throw new GovernanceError(
      "DIAGNOSIS_WITHOUT_BREACH_EVIDENCE",
      `challenge ${challenge.id} 引用的 breach ${breach.id} 属 band ${breach.band_id} ≠ challenge band ${challenge.band_id}（半账/手改痕迹）`,
      "challenge↔breach↔band 三方一致是链序前置；恢复备份",
      { challenge_ref: challenge.id, breach_ref: breach.id },
    );
  }
  const kind = requireVocab(
    input.kind,
    DIAGNOSIS_KIND_VALUES,
    "kind",
    "§95.3 诊断三分（Implementation Issue/Config Issue/Architecture Evolution，SCREAMING_SNAKE 词形——大小写裁定 Owner 2026-09-01 照准）",
  );
  const notes = requireNonEmpty(input.notes, "notes", "诊断注记必填留痕");
  if (typeof input.diagnosedBy?.actor !== "string" || input.diagnosedBy.actor.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "diagnosedBy.actor 缺失（诊断主体留痕必填）",
      "C5 自报登记：actor_type/actor/self_attested 三字段；自报永不单独判卷",
      { diagnosedBy: input.diagnosedBy },
    );
  }
  const id = productionEntryId("PDG", {
    challenge_ref: challenge.id,
    kind,
    notes,
  });
  const diagnosisPath = entryPath(rootDir, PRODUCTION_DIAGNOSES_RELATIVE, `${id}.json`);
  if (readText(diagnosisPath) !== null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `同内容诊断已入账：${PRODUCTION_DIAGNOSES_RELATIVE}/${id}.json（内容寻址 id 撞册）`,
      "同 (challenge, kind, notes) 重复诊断是调用方缺陷或幂等重放；补充新诊断请携带新注记",
      { id },
    );
  }
  const paths = buildStorePaths(rootDir);
  const record: DiagnosisRecord = {
    id,
    challenge_ref: challenge.id,
    breach_ref: challenge.breach_ref,
    band_id: challenge.band_id,
    capability_ref: challenge.capability_ref,
    kind,
    notes,
    diagnosed_by: {
      actor_type: input.diagnosedBy.actorType,
      actor: input.diagnosedBy.actor,
      self_attested: input.diagnosedBy.selfAttested,
    },
    diagnosed_at_seq: readCurrentSeq(paths),
  };
  executeWrites([
    {
      path: diagnosisPath,
      next: `${JSON.stringify(record, null, 2)}\n`,
      original: captureOriginal(diagnosisPath),
    },
  ]);
  return record;
}

function validateLoadedDiagnosis(record: unknown, path: string): DiagnosisRecord {
  const entry = record as DiagnosisRecord;
  const fail = (detail: string, hint: string): GovernanceError =>
    new GovernanceError("SCHEMA_INVALID", `${path} ${detail}`, hint, { path });
  if (typeof entry.id !== "string" || !entry.id.startsWith("PDG-") || !ENTRY_ID_PATTERN.test(entry.id)) {
    throw fail(`id 词形非法：${String(entry.id)}`, "diagnosis id 须 PDG-<12hex>；恢复备份");
  }
  if (typeof entry.challenge_ref !== "string" || !entry.challenge_ref.startsWith("PCH-")) {
    throw fail("challenge_ref 缺失或词形非法（PCH-*）", "diagnosis 必挂 challenge（§95.2 链序封条）；恢复备份");
  }
  if (typeof entry.breach_ref !== "string" || !entry.breach_ref.startsWith("PBR-")) {
    throw fail("breach_ref 缺失或词形非法（PBR-*）", "diagnosis 必持 breach Evidence 引用；恢复备份");
  }
  requireVocab(
    String(entry.kind),
    DIAGNOSIS_KIND_VALUES,
    "kind",
    "§95.3 诊断三分",
  );
  if (typeof entry.notes !== "string" || entry.notes.length === 0) {
    throw fail("notes 缺失", "诊断注记必填留痕；恢复备份");
  }
  if (entry.diagnosed_by === null || typeof entry.diagnosed_by !== "object") {
    throw fail("diagnosed_by 缺失", "诊断主体留痕必填；恢复备份");
  }
  return entry;
}

/** diagnosis 台账全量装载（id 字典序）。 */
export function listDiagnoses(rootDir: string): readonly DiagnosisRecord[] {
  return listProductionRecords(rootDir, PRODUCTION_DIAGNOSES_RELATIVE).map(
    ({ record, path }) => validateLoadedDiagnosis(record, path),
  );
}

// ============================================================
// computeCapabilityOutcomeMetrics（§55.1 八能力 Leading/Lagging 指标派生）
// ============================================================

/** §55.1 八能力表行（capability/leading/lagging 三列 PRD L3583-3592 逐字 + 机器键）。 */
export interface CapabilityOutcomeMetricRow {
  readonly capability: string;
  readonly leading: string;
  readonly lagging: string;
  readonly leadingKey: CapabilityOutcomeMetricKey;
  readonly laggingKey: CapabilityOutcomeMetricKey;
}

/**
 * PRD §55.1 八能力 Leading/Lagging 表逐字常量（L3583-3592 表列原文；机器键映射见
 * @pomaster/schemas CAPABILITY_OUTCOME_METRIC_KEY_VALUES——vocab-pr-0004 收编，
 * Owner 决议 2026-09-01）。
 */
export const CAPABILITY_OUTCOME_METRICS: readonly CapabilityOutcomeMetricRow[] = [
  {
    capability: "Brainstorm",
    leading: "Change 收敛耗时",
    lagging: "开发中需求返工率",
    leadingKey: "brainstorm_change_convergence_time",
    laggingKey: "in_dev_requirement_rework_rate",
  },
  {
    capability: "Research",
    leading: "高风险 Unknown 消减率",
    lagging: "技术选型返工率",
    leadingKey: "research_high_risk_unknown_reduction_rate",
    laggingKey: "research_tech_choice_rework_rate",
  },
  {
    capability: "Context Projection",
    leading: "Context 命中率 / 冗余率",
    lagging: "Agent 越界/误改率",
    leadingKey: "context_hit_or_redundancy_rate",
    laggingKey: "agent_boundary_violation_rate",
  },
  {
    capability: "Governance Router",
    leading: "Profile 首次命中率",
    lagging: "Governance Overhead",
    leadingKey: "profile_first_hit_rate",
    laggingKey: "governance_overhead",
  },
  {
    capability: "Architecture Gate",
    leading: "开发前拦截数",
    lagging: "架构返工/回滚率",
    leadingKey: "arch_gate_predev_interceptions",
    laggingKey: "architecture_rework_rollback_rate",
  },
  {
    capability: "Knowledge Retrieval",
    leading: "Relevant Knowledge 命中率",
    lagging: "同类 Bug 重复率",
    leadingKey: "relevant_knowledge_hit_rate",
    laggingKey: "same_class_bug_recurrence_rate",
  },
  {
    capability: "Gauntlet",
    leading: "First-pass Pass Rate",
    lagging: "Production Change Failure Rate",
    leadingKey: "gauntlet_first_pass_pass_rate",
    laggingKey: "production_change_failure_rate",
  },
  {
    capability: "Reconciliation",
    leading: "Drift 发现率",
    lagging: "跨 Session State 错误率",
    leadingKey: "drift_detection_rate",
    laggingKey: "cross_session_state_error_rate",
  },
];

/** §55.1 L3595-3596 逐字注记（随指标报告逐次输出——「注记位」的承载）。 */
export const METRICS_CAVEAT =
  "注意：Metrics 用于风险提示，不直接替代专业判断。" as const;

/** 单指标机算结果（MEASURED 带 value+分账口径；NOT_MEASURABLE_YET 带缺席理由）。 */
export interface CapabilityOutcomeMetricValue {
  readonly key: CapabilityOutcomeMetricKey;
  readonly status: "MEASURED" | "NOT_MEASURABLE_YET";
  /** 机算值（NOT_MEASURABLE_YET 恒 null——绝不冒充数值）。 */
  readonly value: number | null;
  readonly numerator: number | null;
  readonly denominator: number | null;
  /** 口径披露（MEASURED：机算 basis；NOT_MEASURABLE_YET：缺什么信号源）。 */
  readonly basis: string;
  readonly reason: string | null;
}

export interface CapabilityOutcomeReport {
  readonly rootDir: string;
  /** 八行逐字（三列原文 + 两指标机算结果）。 */
  readonly rows: readonly {
    readonly capability: string;
    readonly leading: string;
    readonly lagging: string;
    readonly leadingMetric: CapabilityOutcomeMetricValue;
    readonly laggingMetric: CapabilityOutcomeMetricValue;
  }[];
  /** §55.1 L3595-3596 逐字注记（METRICS_CAVEAT）。 */
  readonly caveat: typeof METRICS_CAVEAT;
  /** gate 台账扫描分母（evidence/runs/ 解析成功文件数——显式呈现非静默）。 */
  readonly runsScanned: number;
  readonly runsUnreadable: number;
  /** 无 journal 锚被拒收的 runs 文件数（注水面披露——非静默）。 */
  readonly runsUnanchored: number;
}

interface RunLedgerRow {
  readonly grn: string;
  readonly ran_at_seq: number;
  readonly gate: string;
  readonly verdict: string;
  readonly subjectId: string | null;
  readonly isFixture: boolean;
}

/**
 * gate 运行台账装载（evidence/runs/GRN-*.json；07 run_record inline 形态）。
 * 损坏文件计数显式（runsUnreadable）不静默跳过也不中断——指标是风险提示位，
 * 台账局部损坏以显式计数呈现。
 */
function loadRunLedger(rootDir: string): {
  readonly rows: readonly RunLedgerRow[];
  readonly unreadable: number;
  /** 无 journal 锚而被拒收的文件数（红队 A5b 封条：直落 GRN-*.json 注水面）。 */
  readonly unanchored: number;
} {
  const paths = buildStorePaths(rootDir);
  const dir = paths.runsDir;
  if (!existsSync(dir)) return { rows: [], unreadable: 0, unanchored: 0 };
  // journal 锚集（TX_APPLIED 事件 seq，ops 含 record_gate_run）——metrics 可算面
  // 只收录有真实事务锚的 run 文件；直落台账的伪造文件显式拒收并计数披露。
  const anchors = new Set(
    readJournalLines(paths)
      .filter(
        (event) =>
          event.type === "TX_APPLIED" &&
          Array.isArray(event.ops) &&
          (event.ops as unknown[]).includes("record_gate_run") &&
          typeof event.seq === "number",
      )
      .map((event) => event.seq as number),
  );
  const rows: RunLedgerRow[] = [];
  let unreadable = 0;
  let unanchored = 0;
  for (const filename of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const text = readText(`${dir}/${filename}`);
    if (text === null) {
      unreadable += 1;
      continue;
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const ranAtSeq = typeof parsed.ran_at_seq === "number" ? parsed.ran_at_seq : 0;
      if (!anchors.has(ranAtSeq)) {
        // 无 journal 锚 = 非真实事务产物（直落注水/手改）——不收录不静默。
        unanchored += 1;
        continue;
      }
      const result = (parsed.gate_result as { result?: Record<string, unknown> } | undefined)?.result ?? {};
      rows.push({
        grn: String(parsed.grn ?? filename),
        ran_at_seq: ranAtSeq,
        gate: String(result.gate ?? ""),
        verdict: String(result.verdict ?? ""),
        subjectId: typeof result.subject_id === "string" && result.subject_id.length > 0 ? result.subject_id : null,
        isFixture: result.is_fixture === true,
      });
    } catch {
      unreadable += 1;
    }
  }
  return { rows, unreadable, unanchored };
}

/**
 * §55.1 Capability Outcome Metrics（wave3-plan P34 出口判据「§55.1 Leading/Lagging
 * 指标挂钩既有 gate/evidence 数据」的 kernel 面）。
 *
 * 可算子集（从既有 gate 运行台账 evidence/runs/ 机算；口径随 basis 逐指标披露）：
 * - gauntlet_first_pass_pass_rate：GAUNTLET* 门运行按 subject 分组的**首次运行**
 *   passed 占比（first-pass 判卷面；subject 去重分母；fixture 记录剔除——Q3 生产
 *   指标不吃 TEST.* 账）；
 * - arch_gate_predev_interceptions：ARCHITECTURE* 门 verdict∈{failed,blocked} 运行
 *   计数（拦截=门禁否决；「开发前」口径细化呈报项：v1 run_trigger 词表无 pre-dev
 *   标记位，按 ARCHITECTURE 门否决计数呈报）。
 * 其余十四指标显式 NOT_MEASURABLE_YET（缺独立信号源台账——每指标带缺席理由，
 * 绝不冒充数值，§55.1「不直接替代专业判断」的 fail-closed 半边）。
 * METRICS_CAVEAT（§55.1 L3595-3596 逐字）随报告逐次输出（注记位）。
 */
export function computeCapabilityOutcomeMetrics(rootDir: string): CapabilityOutcomeReport {
  const { rows, unreadable, unanchored } = loadRunLedger(rootDir);
  // Q3 fixture 隔离：生产指标不吃 TEST.* 账（fixture 记录剔除，口径披露）。
  const production = rows.filter((row) => !row.isFixture);
  const gauntletRuns = production.filter(
    (row) => row.gate === "GAUNTLET" || row.gate.startsWith("GAUNTLET_"),
  );
  const archRuns = production.filter(
    (row) => row.gate === "ARCHITECTURE" || row.gate.startsWith("ARCHITECTURE_"),
  );

  const measured = (
    key: CapabilityOutcomeMetricKey,
    value: number,
    numerator: number | null,
    denominator: number | null,
    basis: string,
  ): CapabilityOutcomeMetricValue => ({
    key,
    status: "MEASURED",
    value,
    numerator,
    denominator,
    basis,
    reason: null,
  });
  const notMeasurable = (
    key: CapabilityOutcomeMetricKey,
    reason: string,
  ): CapabilityOutcomeMetricValue => ({
    key,
    status: "NOT_MEASURABLE_YET",
    value: null,
    numerator: null,
    denominator: null,
    basis: reason,
    reason,
  });

  const metricValues = new Map<CapabilityOutcomeMetricKey, CapabilityOutcomeMetricValue>();

  // —— Gauntlet first-pass pass rate（可算） ——
  const subjectFirstRuns = new Map<string, RunLedgerRow>();
  for (const run of gauntletRuns) {
    if (run.subjectId === null) continue; // 无 subject 运行不入 first-pass 分母（口径披露）
    const current = subjectFirstRuns.get(run.subjectId);
    if (
      current === undefined ||
      run.ran_at_seq < current.ran_at_seq ||
      (run.ran_at_seq === current.ran_at_seq && run.grn < current.grn)
    ) {
      subjectFirstRuns.set(run.subjectId, run);
    }
  }
  const firstRuns = [...subjectFirstRuns.values()];
  if (firstRuns.length === 0) {
    metricValues.set(
      "gauntlet_first_pass_pass_rate",
      notMeasurable(
        "gauntlet_first_pass_pass_rate",
        "gate 台账（evidence/runs/）无 GAUNTLET* 非 fixture 运行——first-pass 分母为空，不冒充数值",
      ),
    );
  } else {
    const passed = firstRuns.filter((run) => run.verdict === "passed").length;
    metricValues.set(
      "gauntlet_first_pass_pass_rate",
      measured(
        "gauntlet_first_pass_pass_rate",
        passed / firstRuns.length,
        passed,
        firstRuns.length,
        `gate 台账 GAUNTLET* 非 fixture 运行按 subject 分组的首次运行 passed 占比（subjects=${firstRuns.length}；无 subject 运行与 fixture 记录不入分母）`,
      ),
    );
  }

  // —— Architecture Gate 开发前拦截数（可算） ——
  if (archRuns.length === 0) {
    metricValues.set(
      "arch_gate_predev_interceptions",
      notMeasurable(
        "arch_gate_predev_interceptions",
        "gate 台账（evidence/runs/）无 ARCHITECTURE* 非 fixture 运行——拦截计数分母为空，不冒充数值",
      ),
    );
  } else {
    const interceptions = archRuns.filter(
      (run) => run.verdict === "failed" || run.verdict === "blocked",
    ).length;
    metricValues.set(
      "arch_gate_predev_interceptions",
      measured(
        "arch_gate_predev_interceptions",
        interceptions,
        interceptions,
        null,
        `gate 台账 ARCHITECTURE* 非 fixture 运行 verdict∈{failed,blocked} 计数（runs=${archRuns.length}）；「开发前」口径细化呈报项：v1 run_trigger 无 pre-dev 标记位`,
      ),
    );
  }

  // —— 其余十四指标：显式 NOT_MEASURABLE_YET（缺席理由逐指标登记） ——
  const pendingReasons: Partial<Record<CapabilityOutcomeMetricKey, string>> = {
    brainstorm_change_convergence_time:
      "缺 Brainstorm→Change 收敛事件台账（收敛耗时需要会话时间线信号源）",
    in_dev_requirement_rework_rate: "缺开发中需求变更/返工事件台账",
    research_high_risk_unknown_reduction_rate: "缺 Research Unknown 消减事件台账（MSD 载体未挂指标）",
    research_tech_choice_rework_rate: "缺技术选型变更/返工事件台账",
    context_hit_or_redundancy_rate: "缺 Context 命中/冗余计量信号源",
    agent_boundary_violation_rate: "缺 Agent 越界/误改事件台账",
    profile_first_hit_rate: "缺 Router Profile 命中台账（Router 判定流未入账）",
    governance_overhead: "缺任务级治理成本/总成本双轨分母（C6 duration 双轨仅覆盖 gate 运行局部）",
    architecture_rework_rollback_rate: "缺架构返工/回滚事件台账",
    relevant_knowledge_hit_rate: "缺 Knowledge 检索命中台账",
    same_class_bug_recurrence_rate: "缺同类 Bug 复现事件台账",
    production_change_failure_rate: "缺 Production Change 成败台账（§95 challenge/diagnosis 链 v1 刚落地，样本面未建）",
    drift_detection_rate: "缺 Drift 真值分母（reconcile 台账只有发现面无真值面）",
    cross_session_state_error_rate: "缺跨 Session State 错误事件台账",
  };
  for (const [key, reason] of Object.entries(pendingReasons) as readonly [
    CapabilityOutcomeMetricKey,
    string,
  ][]) {
    metricValues.set(key, notMeasurable(key, reason));
  }

  return {
    rootDir,
    rows: CAPABILITY_OUTCOME_METRICS.map((row) => ({
      capability: row.capability,
      leading: row.leading,
      lagging: row.lagging,
      leadingMetric: metricValues.get(row.leadingKey) as CapabilityOutcomeMetricValue,
      laggingMetric: metricValues.get(row.laggingKey) as CapabilityOutcomeMetricValue,
    })),
    caveat: METRICS_CAVEAT,
    runsScanned: rows.length,
    runsUnreadable: unreadable,
    runsUnanchored: unanchored,
  };
}

// ============================================================
// registerSelfImprovementCandidate（§90.4——恒 CANDIDATE 呈报态，无自动应用通路）
// ============================================================

export interface SelfImprovementSignalInput {
  /** §90.4 八信号之一（SELF_IMPROVEMENT_SIGNAL_VALUES）。 */
  readonly signal: SelfImprovementSignalValue;
  /** 申报说明（必填留痕）。 */
  readonly note: string;
  /** 申报主体（C5 自报登记）。 */
  readonly reportedBy: Actor;
  /** 证据引用（宽松词形；缺省空数组显式）。 */
  readonly evidenceRefs?: readonly string[];
}

/**
 * §90.4 八信号登记（产物恒 POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态）。
 * **§90.4 结构封条（头注声明）**：本模块不 import 任何 Router/Profile/Gate 配置
 * 修改函数；本函数只写 .pomaster/production/self-improvement/ 子树、零 journal 事件、
 * 零 state/ 写入——登记即呈报，不存在任何从 CANDIDATE 到 Router/Profile/Gate 配置
 * 变更的自动通路（PRD L5695 逐字「不得自动应用」；「应用」永远是人经治理面的显式
 * 动作）。同 (signal, note) 内容寻址重复登记显式拒绝。
 */
export function registerSelfImprovementCandidate(
  rootDir: string,
  input: SelfImprovementSignalInput,
): SelfImprovementCandidateRecord {
  const signal = requireVocab(
    input.signal,
    SELF_IMPROVEMENT_SIGNAL_VALUES,
    "signal",
    "§90.4 自改进八信号（snake_case 机器词形；人读原文见 SELF_IMPROVEMENT_SIGNAL_PRD_LABELS）",
  );
  const note = requireNonEmpty(input.note, "note", "§90.4 申报说明必填留痕");
  if (typeof input.reportedBy?.actor !== "string" || input.reportedBy.actor.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "reportedBy.actor 缺失（申报主体留痕必填）",
      "C5 自报登记：actor_type/actor/self_attested 三字段",
      { reportedBy: input.reportedBy },
    );
  }
  const evidenceRefs = [...(input.evidenceRefs ?? [])];
  for (const ref of evidenceRefs) {
    if (typeof ref !== "string" || ref.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `evidence_refs 条目须为非空字符串，得到 ${String(ref)}`,
        "宽松词形引用（GRN-*/PBR-*/路径）；空条目显式拒绝",
        { evidence_refs: ref },
      );
    }
  }
  const id = productionEntryId("PSI", { signal, note });
  const candidatePath = entryPath(
    rootDir,
    PRODUCTION_SELF_IMPROVEMENT_RELATIVE,
    `${id}.json`,
  );
  if (readText(candidatePath) !== null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `同 (signal, note) 候选已登记：${PRODUCTION_SELF_IMPROVEMENT_RELATIVE}/${id}.json（内容寻址 id 撞册）`,
      "重复登记是调用方缺陷或幂等重放——呈现走台账读取；补充新申报请携带新说明",
      { id },
    );
  }
  const paths = buildStorePaths(rootDir);
  const record: SelfImprovementCandidateRecord = {
    id,
    kind: POMASTER_SELF_IMPROVEMENT_CANDIDATE,
    signal,
    signal_label: SELF_IMPROVEMENT_SIGNAL_PRD_LABELS[signal],
    note,
    evidence_refs: evidenceRefs,
    reported_by: {
      actor_type: input.reportedBy.actorType,
      actor: input.reportedBy.actor,
      self_attested: input.reportedBy.selfAttested,
    },
    reported_at_seq: readCurrentSeq(paths),
  };
  executeWrites([
    {
      path: candidatePath,
      next: `${JSON.stringify(record, null, 2)}\n`,
      original: captureOriginal(candidatePath),
    },
  ]);
  return record;
}

function validateLoadedCandidate(record: unknown, path: string): SelfImprovementCandidateRecord {
  const entry = record as SelfImprovementCandidateRecord;
  const fail = (detail: string, hint: string): GovernanceError =>
    new GovernanceError("SCHEMA_INVALID", `${path} ${detail}`, hint, { path });
  if (typeof entry.id !== "string" || !entry.id.startsWith("PSI-") || !ENTRY_ID_PATTERN.test(entry.id)) {
    throw fail(`id 词形非法：${String(entry.id)}`, "candidate id 须 PSI-<12hex>；恢复备份");
  }
  if (entry.kind !== POMASTER_SELF_IMPROVEMENT_CANDIDATE) {
    throw fail(
      `kind=${String(entry.kind)}（恒 ${POMASTER_SELF_IMPROVEMENT_CANDIDATE}——登记产物不存在其他形态）`,
      "呈报位词形常量；恢复备份",
    );
  }
  const signal = requireVocab(
    String(entry.signal),
    SELF_IMPROVEMENT_SIGNAL_VALUES,
    "signal",
    "§90.4 八信号",
  );
  if (entry.signal_label !== SELF_IMPROVEMENT_SIGNAL_PRD_LABELS[signal]) {
    throw fail(
      `signal_label 与 PRD 原文镜像不符（${String(entry.signal_label)}）`,
      "signal_label 由 SELF_IMPROVEMENT_SIGNAL_PRD_LABELS 派生非自报；恢复备份",
    );
  }
  if (typeof entry.note !== "string" || entry.note.length === 0) {
    throw fail("note 缺失", "申报说明必填留痕；恢复备份");
  }
  if (!Array.isArray(entry.evidence_refs)) {
    throw fail("evidence_refs 非数组", "恢复备份");
  }
  return entry;
}

/** §90.4 候选台账全量装载（id 字典序）。 */
export function listSelfImprovementCandidates(rootDir: string): readonly SelfImprovementCandidateRecord[] {
  return listProductionRecords(rootDir, PRODUCTION_SELF_IMPROVEMENT_RELATIVE).map(
    ({ record, path }) => validateLoadedCandidate(record, path),
  );
}
