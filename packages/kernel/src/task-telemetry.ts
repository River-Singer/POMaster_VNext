/**
 * task-telemetry.ts —— reasoning/cost telemetry 派生评估核（W4-S5 · 战役 W4 R4-4 +
 * 09-10 PRD REQ-11 + §9 完整发布节「逐步收集」指标清单）。
 *
 * 需求锚（W4 PRD R4-4 逐字）：
 * - 「reasoning/cost/Horizon：解释型规则+telemetry；预算不削弱证据/权限」；
 * - 「无综合评分」（§21 同源——六指标独立呈现，报告结构零 score 位）；
 * - 「不持久化私有思维链」（本核输入面 = 既有治理平面计数投影，**无思维链输入
 *   通道**——journal/execution/claims/steering/negative-history/checkpoint 六平面
 *   全部是登记面结构化事实，模型私有推理文本不在任何输入平面）；
 * - REQ-11「Reasoning/cost/Horizon 复用现有策略与派生评估，学习先形成 candidate；
 *   不支持的 Provider 档位可解释；不自动新增治理规则」；
 * - §9 完整发布节（逐字）：「逐步收集 verified transition rate、失败方案复发、
 *   intent drift/rework、resume success、每次有效转换费用、Human intervention 与
 *   task horizon。同类任务/Provider/预算建立基线，不虚构提升百分比；无样本/零分母
 *   记为不可计算」。
 *
 * W0 reuse-map REQ-11 行边界（本切片只做半边）：reasoning scheduler / provider
 * effort mapping / 预算强制全部 NOT FOUND 且**不在本片**——本核是 telemetry 采集 +
 * 派生评估呈现（解释型规则=每指标 basis 口径披露），零调度、零预算强制、零阈值、
 * 零阻断（advisory 呈现面——RECONCILE「呈现强化非阻断」同取向）。
 *
 * ═══ 派生评估核（分层：gather IO 装载 + derive 纯函数判定）═══
 * - deriveTaskTelemetry：纯函数零 IO 零 store 零墙钟（plan-compiler /
 *   evidence-qualification 同款纪律；同输入重放 deep equal——A4）；输入 = 对既有
 *   平面的只读引用集合（TaskTelemetryInput——snake_case 纯数据合同，校验
 *   fail-closed）；输出 = 指标集（每指标带 status/value/numerator/denominator/
 *   basis 口径披露/breakdown 子计数）+ horizon_rows 明细 + evidence_census +
 *   inputs_fingerprint（sha256OfCanonical 整个输入——同指纹 = 同报告字节）；
 * - gatherTaskTelemetryInput：IO 装载单一面（只读零写——readJournalLines/
 *   listExecutionRecords/countExecutionInflightReceipts/readTaskSteeringConstraints/
 *   readTaskNegativeHistory/readCheckpoint 既有装载面复用；平面损坏 fail-closed
 *   禁静默当零记录——损坏时静默计数 = 假绿的计数比没有计数更危险）。
 *
 * ═══ 六指标口径终表（每指标带分母与可计算性——词形 SP 提案待追认）═══
 * 1. verified_transition_rate（§9 原文词形）：机算口径 = 锚定本任务的 claims 判定
 *    面——VERIFIED 施断（verification.verdict=VERIFIED）/ 判定流转总数。口径诚实
 *    声明：生命周期转移时点的 evidence 轴不可机算（journal 是事件流无 axes 历史，
 *    reconcile §3.3 同源判词）——转移事件计数独立呈现于 transition_events 字段，
 *    本 rate 不冒充「逐转移判定」；分母 0 = NOT_COMPUTABLE 显式。
 * 2. rework_signal（§9「失败方案复发/intent drift/rework」的最小机算投影）：负信号
 *    合计 = negative_history 条目（每条 status 恒 REJECTED——登记面词形）+ claims
 *    verdict=REJECTED 计数；信号计数非评分——无阈值不施断。
 * 3. steering_count：登记约束数（readTaskSteeringConstraints 同一装载面）；申报面
 *    计数——机器不验证约束遵守（W4-S3 declared 纪律延续）。
 * 4. resume_reconcile_signals（§9「resume success」的 v1 可观测投影）：checkpoint
 *    快照数 + 执行中断数（EXECUTION_INTERRUPTED 锚定本 task）。诚实披露：RECONCILE_
 *    DIRTY 阻断判卷零 journal 事件（W4-S1——阻断于一切副作用之前），不可从 journal
 *    计数；本信号是 resume 链路载体强度计数，非恢复成败判定。
 * 5. horizon（§9「task horizon」）：journal seq 跨度（A4 禁墙钟）——EXECUTION_BEGUN
 *    seq → EXECUTION_ENDED/INTERRUPTED seq；全部封口才可算聚合跨度；open 执行 =
 *    horizon_open 显式（NOT_COMPUTABLE 但 horizon_rows 明细照给——聚合不吞没）；
 *    零执行 = NOT_COMPUTABLE（分母 0）。
 * 6. cost_face（§9「每次有效转换费用」）：恒 NOT_MEASURABLE_YET——本仓无 token/
 *    费用计量源（§55.1 既有词形：缺独立信号源绝不冒充数值）；Provider 计量接入后
 *    由该信号源填充（填充位声明，非数值预填）。
 *
 * ═══ 词形纪律（SP 提案待 Owner 追认）═══
 * - 状态轴三值：MEASURED / NOT_MEASURABLE_YET 复用 §55.1 既有词形（production
 *   CAPABILITY_OUTCOME_METRIC_STATUS_VALUES 在册）；NOT_COMPUTABLE = 信号源在座而
 *   分母为零（「零分母记为不可计算」逐字承载——新词形 SP 提案）；
 * - horizon state 两值 closed|open（execution 封口语义既有词形收编）；inflight_
 *   receipts 分态 recorded|none 复用 W4-S1 既有词轴（零新词形）；
 * - 全部指标禁综合评分、禁百分比虚构（v1 无跨 session 基线平面——NOT_ 状态与
 *   basis 披露承载，不输出任何「较基线提升 X%」形态）。
 */
import { readdirSync } from "node:fs";
import {
  GovernanceError,
  governanceCodeForParseError,
  GovernedIdParseError,
} from "./errors.js";
import { sha256OfCanonical } from "./digest.js";
import { readText } from "./io.js";
import { parseGovernedId } from "./id.js";
import { readJournalLines, type StorePaths } from "./paths.js";
import {
  CHECKPOINT_ID_PATTERN,
  readCheckpoint,
} from "./checkpoint.js";
import {
  EXECUTION_ID_PATTERN,
  countExecutionInflightReceipts,
  listExecutionRecords,
} from "./execution.js";
import { readTaskNegativeHistory } from "./negative-history.js";
import { readTaskSteeringConstraints } from "./steering.js";

type UnknownRecord = Record<string, unknown>;

// ============================================================
// 词形常量（SP 提案待追认——沿 W4-S2/S3/S4 先例：通路局部词形常量集 + 提案留痕，
// 不动 vocab-lock 主表）
// ============================================================

/** 指标 key 六值轴（§9 指标清单的 v1 机算映射——固定序 = 报告 metrics 序，字节稳定）。 */
export const TASK_TELEMETRY_METRIC_KEYS = [
  "verified_transition_rate",
  "rework_signal",
  "steering_count",
  "resume_reconcile_signals",
  "horizon",
  "cost_face",
] as const;
export type TaskTelemetryMetricKey = (typeof TASK_TELEMETRY_METRIC_KEYS)[number];

/**
 * 指标状态三值轴：MEASURED（可算，value/numerator/denominator 分账披露）/
 * NOT_COMPUTABLE（信号源在座而分母为零——§9「零分母记为不可计算」，SP 提案新词形）/
 * NOT_MEASURABLE_YET（缺独立信号源——§55.1 既有词形复用，绝不冒充数值）。
 */
export const TASK_TELEMETRY_METRIC_STATUS = [
  "MEASURED",
  "NOT_COMPUTABLE",
  "NOT_MEASURABLE_YET",
] as const;
export type TaskTelemetryMetricStatus = (typeof TASK_TELEMETRY_METRIC_STATUS)[number];

/** horizon 行 state 两值（execution 封口语义既有词形收编——ended 在座 closed / 缺席 open）。 */
export const TASK_TELEMETRY_HORIZON_STATES = ["closed", "open"] as const;
export type TaskTelemetryHorizonState = (typeof TASK_TELEMETRY_HORIZON_STATES)[number];

// —— 红线注记常量（随报告逐次输出——notes 恒在四条） ——

/** 无综合评分红线（W4 PRD R4-4「无综合评分」；09-10 PRD §13 禁黑盒 alignment score）。 */
export const TASK_TELEMETRY_NO_COMPOSITE_SCORE_NOTE =
  "本报告无综合评分：六指标独立呈现，禁合成单一分数或黑盒 alignment score（W4 PRD R4-4；09-10 PRD §13）" as const;

/** 不持久化思维链红线（W4 PRD R4-4——本核输入面无思维链通道的结构性声明）。 */
export const TASK_TELEMETRY_NO_CHAIN_PERSISTENCE_NOTE =
  "本报告不持久化任何模型私有思维链：输入面为既有治理平面的结构化计数投影（journal/execution/claims/steering/negative-history/checkpoint），无思维链输入通道（W4 PRD R4-4）" as const;

/** advisory 呈现红线（REQ-11「不自动新增治理规则」；预算不削弱证据/权限的边界声明）。 */
export const TASK_TELEMETRY_ADVISORY_NOTE =
  "telemetry 是只读派生评估呈现：不设强制阈值、不阻断任何流程、预算面不削弱证据与权限要求（REQ-11）" as const;

/** 无百分比基线红线（§9「不虚构提升百分比」——v1 无跨 session 基线平面的诚实声明）。 */
export const TASK_TELEMETRY_NO_BASELINE_PERCENTAGE_NOTE =
  "本报告不做基线对比：v1 无跨 session 基线平面，不输出任何「较基线提升 X%」形态——基线建立须同类任务/Provider/预算分组且样本充分（09-10 PRD §9）" as const;

// ============================================================
// 输入合同（snake_case 纯数据——调用方经 gatherTaskTelemetryInput 装载或测试直构）
// ============================================================

/** 执行档案引用（锚定过滤的输入行；receipt_count = W4-S1 在途诚实回执计数）。 */
export interface TaskTelemetryExecutionRef {
  readonly execution_id: string;
  /** 档案 task_id（null = 未锚定任务——不参与任何任务分母，缺席不伪造）。 */
  readonly task_id: string | null;
  readonly receipt_count: number;
}

/** GRN 运行行（verdict 词形 = 既有七态闭包——本核只计数不改写）。 */
export interface TaskTelemetryRunRow {
  readonly grn: string;
  readonly subject_id: string | null;
  readonly verdict: string;
}

/** CLM 判定行（verdict 词形 = 四值闭包 VERIFIED/PARTIALLY_VERIFIED/UNVERIFIED/REJECTED）。 */
export interface TaskTelemetryClaimRow {
  readonly clm: string;
  readonly subject_id: string | null;
  readonly verdict: string;
}

/** negative_history 条目投影（status 恒 "REJECTED"——登记面词形，本核不发明新值）。 */
export interface TaskTelemetryNegativeEntryRef {
  readonly approach: string;
  readonly reason: string;
  readonly status: string;
}

/**
 * telemetry 输入（对既有平面的只读引用集合；闭形态八键）。journal_events 是
 * readJournalLines 的原样投影（本核只消费 type/seq/execution_id/ops/changed_object_ids
 * 五键——producer 词形零改动）。
 */
export interface TaskTelemetryInput {
  readonly task_ref: string;
  readonly journal_events: readonly UnknownRecord[];
  readonly executions: readonly TaskTelemetryExecutionRef[];
  readonly runs: readonly TaskTelemetryRunRow[];
  readonly claims: readonly TaskTelemetryClaimRow[];
  readonly steering_count: number;
  readonly negative_history: readonly TaskTelemetryNegativeEntryRef[];
  readonly checkpoint_count: number;
}

// ============================================================
// 报告形态（snake_case；闭形态——metrics 固定六键同序，字节稳定）
// ============================================================

/** 单指标机算结果（production CapabilityOutcomeMetricValue 同形 + breakdown 子计数）。 */
export interface TaskTelemetryMetric {
  readonly key: TaskTelemetryMetricKey;
  readonly status: TaskTelemetryMetricStatus;
  /** 机算值（NOT_COMPUTABLE / NOT_MEASURABLE_YET 恒 null——绝不冒充数值）。 */
  readonly value: number | null;
  readonly numerator: number | null;
  readonly denominator: number | null;
  /** 口径披露（MEASURED：机算 basis；NOT_COMPUTABLE：零分母说明；NOT_MEASURABLE_YET：缺什么信号源）。 */
  readonly basis: string;
  readonly reason: string | null;
  /** 子计数分解（比率类恒 null；信号合计类显式双子计数——机器可下钻）。 */
  readonly breakdown: Readonly<Record<string, number>> | null;
}

/** 逐执行 horizon 行（聚合 NOT_COMPUTABLE 时明细照给——聚合不吞没）。 */
export interface TaskTelemetryHorizonRow {
  readonly execution_id: string;
  readonly begun_seq: number | null;
  readonly ended_seq: number | null;
  readonly span: number | null;
  readonly state: TaskTelemetryHorizonState;
  /** W4-S1 在途诚实分态（recorded|none——回执未存 ≠ 未发生；零新词轴）。 */
  readonly inflight_receipts: { readonly state: "recorded" | "none"; readonly receipt_count: number };
}

/** verdict 计数 census（键字典序——JSON 字节稳定；全量呈现含全部 verdict 词形）。 */
export interface TaskTelemetryEvidenceCensus {
  readonly runs: Readonly<Record<string, number>>;
  readonly claims: Readonly<Record<string, number>>;
}

/** 任务 telemetry 报告（纯派生呈现——非 canonical 对象、零落盘、零 journal 事件）。 */
export interface TaskTelemetryReport {
  readonly task_ref: string;
  /** 输入指纹（sha256OfCanonical 整个输入——同指纹 = 同报告字节，快照等价物）。 */
  readonly inputs_fingerprint: string;
  readonly metrics: readonly TaskTelemetryMetric[];
  /** 本任务对象 lifecycle 转移事件计数（journal TX_APPLIED ops 含 transition_object 且 changed_object_ids 含 task_ref）。 */
  readonly transition_events: number;
  /** 任一锚定执行未封口 = true（horizon 聚合 NOT_COMPUTABLE 的显式形态位）。 */
  readonly horizon_open: boolean;
  readonly horizon_rows: readonly TaskTelemetryHorizonRow[];
  readonly evidence_census: TaskTelemetryEvidenceCensus;
  /** 红线注记恒在四条（顺序固定——见常量定义序）。 */
  readonly notes: readonly string[];
}

// ============================================================
// 输入校验（fail-closed——词形/计数面畸形显式拒绝，禁静默当空）
// ============================================================

/** taskRef 词形闸（negative-history assertTaskRef 同款判卷：parse 失败映射码位；前缀须 TASK）。 */
function assertTaskRefWordForm(taskRef: string): void {
  let parsed;
  try {
    parsed = parseGovernedId(taskRef);
  } catch (error) {
    if (error instanceof GovernedIdParseError) {
      throw new GovernanceError(
        governanceCodeForParseError(error),
        `task_ref 词形非法：${error.message}`,
        "id 须为 TASK.* canonical governed id（A5 closed-world）；TASK-0087 等 legacy 词形经 resolveAlias 收编（TASK-0087→TASK.T0087）",
        { task_ref: taskRef },
      );
    }
    throw error;
  }
  if (parsed.prefix !== "TASK") {
    throw new GovernanceError(
      "FATAL_UNKNOWN_PREFIX",
      `task_ref 前缀须为 TASK：${taskRef}（${parsed.prefix}.* 是其他对象面）`,
      "telemetry 分母锚定在册任务（task_object）；非 TASK.* 目标不在本通路射程",
      { task_ref: taskRef, prefix: parsed.prefix },
    );
  }
}

/** 输入合同校验（derive 入口逐键 fail-closed；gather 产出同受此闸——两路同判据）。 */
function assertInputContract(input: TaskTelemetryInput): void {
  assertTaskRefWordForm(input.task_ref);
  for (const execution of input.executions) {
    if (!EXECUTION_ID_PATTERN.test(execution.execution_id)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `executions[].execution_id 词形非法（须 AGX-<4位年份>-<序号>，PRD §25.4 例文 AGX-2026-00182）：${execution.execution_id}`,
        "执行身份由 beginExecution 分配（.pomaster/executions/AGX-*.json 是身份唯一事实源）；禁自造身份混入分母",
        { execution_id: execution.execution_id },
      );
    }
    if (
      !Number.isInteger(execution.receipt_count) ||
      execution.receipt_count < 0
    ) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `executions[].receipt_count 须为 ≥0 整数：${String(execution.receipt_count)}（${execution.execution_id}）`,
        "receipt_count 由 gather 经 countExecutionInflightReceipts 装载（W4-S1 同源）；负值/非整数 = 装载面畸形",
        { execution_id: execution.execution_id, receipt_count: execution.receipt_count },
      );
    }
  }
  for (const key of ["steering_count", "checkpoint_count"] as const) {
    const value = input[key];
    if (!Number.isInteger(value) || value < 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `${key} 须为 ≥0 整数：${String(value)}`,
        "计数面无负值——负计数 = 装载面或手构输入畸形，显式拒绝（禁静默当零）",
        { [key]: value },
      );
    }
  }
}

// ============================================================
// 派生评估核（纯函数——零 IO 零 store 零墙钟；同输入重放 deep equal）
// ============================================================

/**
 * 任务 telemetry 派生核：对既有平面只读引用集合做六指标聚合判定。全部口径与
 * 可计算性见模块头注「六指标口径终表」；词形/红线纪律见「词形纪律」节。
 */
export function deriveTaskTelemetry(input: TaskTelemetryInput): TaskTelemetryReport {
  assertInputContract(input);

  // —— journal 一次遍历（事件词形 = producer 既有词，只消费零新增） ——
  const begunByExecution = new Map<string, number>();
  const endedByExecution = new Map<string, number>();
  const interruptedExecutions = new Set<string>();
  let transitionEvents = 0;
  for (const event of input.journal_events) {
    const type = typeof event.type === "string" ? event.type : null;
    const seq = typeof event.seq === "number" ? event.seq : null;
    const executionId =
      typeof event.execution_id === "string" ? event.execution_id : null;
    if (type === "EXECUTION_BEGUN" && seq !== null && executionId !== null) {
      if (!begunByExecution.has(executionId)) begunByExecution.set(executionId, seq);
    } else if (
      (type === "EXECUTION_ENDED" || type === "EXECUTION_INTERRUPTED") &&
      seq !== null &&
      executionId !== null
    ) {
      if (!endedByExecution.has(executionId)) endedByExecution.set(executionId, seq);
      if (type === "EXECUTION_INTERRUPTED") interruptedExecutions.add(executionId);
    } else if (type === "TX_APPLIED") {
      const ops = Array.isArray(event.ops) ? event.ops : [];
      const changed = Array.isArray(event.changed_object_ids) ? event.changed_object_ids : [];
      if (ops.includes("transition_object") && changed.includes(input.task_ref)) {
        transitionEvents += 1;
      }
    }
  }

  // —— subject 锚定过滤（无锚不猜：subject_id/task_id 缺席的记录不进任何分母） ——
  const anchoredExecutions = input.executions
    .filter((execution) => execution.task_id === input.task_ref)
    .sort((a, b) => (a.execution_id < b.execution_id ? -1 : 1));
  const anchoredClaims = input.claims.filter((claim) => claim.subject_id === input.task_ref);
  const anchoredRuns = input.runs.filter((run) => run.subject_id === input.task_ref);

  // —— 指标 1：verified_transition_rate（claims 判定面口径——basis 披露口径边界） ——
  const verifiedCount = anchoredClaims.filter((claim) => claim.verdict === "VERIFIED").length;
  const verifiedTransitionRate: TaskTelemetryMetric =
    anchoredClaims.length === 0
      ? {
          key: "verified_transition_rate",
          status: "NOT_COMPUTABLE",
          value: null,
          numerator: null,
          denominator: 0,
          basis: RATE_BASIS,
          reason:
            "零分母：锚定本任务的 claims 判定为零（§9「无样本/零分母记为不可计算」——绝不冒充数值）",
          breakdown: null,
        }
      : {
          key: "verified_transition_rate",
          status: "MEASURED",
          value: verifiedCount / anchoredClaims.length,
          numerator: verifiedCount,
          denominator: anchoredClaims.length,
          basis: RATE_BASIS,
          reason: null,
          breakdown: null,
        };

  // —— 指标 2：rework_signal（负信号合计——计数非评分，无阈值不施断） ——
  const rejectedClaims = anchoredClaims.filter((claim) => claim.verdict === "REJECTED").length;
  const reworkSignal: TaskTelemetryMetric = {
    key: "rework_signal",
    status: "MEASURED",
    value: input.negative_history.length + rejectedClaims,
    numerator: null,
    denominator: null,
    basis:
      "负信号合计：negative_history 条目数（每条 status 恒 REJECTED——登记面词形）+ 锚定本任务 claims verdict=REJECTED 计数；信号计数非评分——无阈值不施断",
    reason: null,
    breakdown: { negative_history: input.negative_history.length, rejected_claims: rejectedClaims },
  };

  // —— 指标 3：steering_count（申报面计数——declared 纪律延续） ——
  const steeringCount: TaskTelemetryMetric = {
    key: "steering_count",
    status: "MEASURED",
    value: input.steering_count,
    numerator: null,
    denominator: null,
    basis:
      "state/steering-log.json 锚定本任务的登记约束数（readTaskSteeringConstraints 同一装载面）；申报面（declared）计数——机器不验证约束被遵守（遵守判定归 exec-guard/audit）",
    reason: null,
    breakdown: null,
  };

  // —— 指标 4：resume_reconcile_signals（载体强度计数——非恢复成败判定） ——
  const interruptedCount = anchoredExecutions.filter((execution) =>
    interruptedExecutions.has(execution.execution_id),
  ).length;
  const resumeReconcileSignals: TaskTelemetryMetric = {
    key: "resume_reconcile_signals",
    status: "MEASURED",
    value: input.checkpoint_count + interruptedCount,
    numerator: null,
    denominator: null,
    basis:
      "resume/reconcile 链路可观测载体计数：锚定本任务 checkpoint 快照数 + 执行中断（EXECUTION_INTERRUPTED）数；RECONCILE_DIRTY 阻断判卷零 journal 事件（W4-S1——阻断于一切副作用之前），不可从 journal 计数；本信号非恢复成败判定",
    reason: null,
    breakdown: { checkpoints: input.checkpoint_count, executions_interrupted: interruptedCount },
  };

  // —— 指标 5：horizon（journal seq 跨度；聚合只在全部封口时可算——明细恒给） ——
  const horizonRows: TaskTelemetryHorizonRow[] = anchoredExecutions.map((execution) => {
    const begunSeq = begunByExecution.get(execution.execution_id) ?? null;
    const endedSeq = endedByExecution.get(execution.execution_id) ?? null;
    return {
      execution_id: execution.execution_id,
      begun_seq: begunSeq,
      ended_seq: endedSeq,
      span: begunSeq !== null && endedSeq !== null ? endedSeq - begunSeq : null,
      state: endedSeq !== null ? "closed" : "open",
      inflight_receipts: {
        state: execution.receipt_count > 0 ? "recorded" : "none",
        receipt_count: execution.receipt_count,
      },
    };
  });
  const horizonOpen = horizonRows.some((row) => row.state === "open");
  let horizon: TaskTelemetryMetric;
  if (anchoredExecutions.length === 0) {
    horizon = {
      key: "horizon",
      status: "NOT_COMPUTABLE",
      value: null,
      numerator: null,
      denominator: 0,
      basis: HORIZON_BASIS,
      reason:
        "零分母：锚定本任务的执行身份为零（beginExecution 分母；§9「零分母记为不可计算」）",
      breakdown: null,
    };
  } else if (horizonOpen) {
    horizon = {
      key: "horizon",
      status: "NOT_COMPUTABLE",
      value: null,
      numerator: null,
      denominator: anchoredExecutions.length,
      basis: HORIZON_BASIS,
      reason: `horizon_open：${horizonRows.filter((row) => row.state === "open").length} 个执行未封口（EXECUTION_ENDED/INTERRUPTED 事件缺席）——聚合跨度终点缺席显式不可算；逐执行明细见 horizon_rows`,
      breakdown: null,
    };
  } else {
    // MEASURED 只在逐执行 begun/ended 双轴齐备时可判——部分行 seq 残态缺席时
    // 禁跨行 max/min 混算冒充聚合跨度（残态缺席 → NOT_COMPUTABLE 显式，绝不冒充
    // 数值/±Infinity/NaN，fail-closed 同纪律）。
    const rowsSequenced = horizonRows.every(
      (row) => row.begun_seq !== null && row.ended_seq !== null,
    );
    const begunValues = horizonRows
      .map((row) => row.begun_seq)
      .filter((seq): seq is number => seq !== null);
    const endedValues = horizonRows
      .map((row) => row.ended_seq)
      .filter((seq): seq is number => seq !== null);
    if (!rowsSequenced || begunValues.length === 0 || endedValues.length === 0) {
      // journal 事件行缺失（全封口档案在而事件缺席——异常残态）：跨度不可算显式，
      // 绝不出 ±Infinity/NaN 冒充数值（NOT_COMPUTABLE fail-closed 同纪律）。
      horizon = {
        key: "horizon",
        status: "NOT_COMPUTABLE",
        value: null,
        numerator: null,
        denominator: anchoredExecutions.length,
        basis: HORIZON_BASIS,
        reason:
          "journal 事件行缺席（EXECUTION_BEGUN 或 EXECUTION_ENDED/INTERRUPTED 词形零行——聚合跨度只在逐执行 begun/ended 双轴齐备时可算，禁跨行混算冒充）——seq 跨度不可算显式；逐执行明细见 horizon_rows",
        breakdown: null,
      };
    } else {
      horizon = {
        key: "horizon",
        status: "MEASURED",
        value: Math.max(...endedValues) - Math.min(...begunValues),
        numerator: null,
        denominator: anchoredExecutions.length,
        basis: HORIZON_BASIS,
        reason: null,
        breakdown: null,
      };
    }
  }

  // —— 指标 6：cost_face（恒 NOT_MEASURABLE_YET——本仓无计量源，填充位声明） ——
  const costFace: TaskTelemetryMetric = {
    key: "cost_face",
    status: "NOT_MEASURABLE_YET",
    value: null,
    numerator: null,
    denominator: null,
    basis:
      "cost 指标填充位：等待 Provider 用量信号源接入（DEF-RUNTIME-ADAPTER 面）；当前零计量输入——绝不虚构数值",
    reason:
      "本仓无 token/费用计量源（§9「每次有效转换费用」缺独立信号源）；Provider 计量接入后由该信号源填充（NOT_MEASURABLE_YET = 显式缺席——§55.1 词形先例）",
    breakdown: null,
  };

  return {
    task_ref: input.task_ref,
    inputs_fingerprint: sha256OfCanonical(input),
    metrics: [
      verifiedTransitionRate,
      reworkSignal,
      steeringCount,
      resumeReconcileSignals,
      horizon,
      costFace,
    ],
    transition_events: transitionEvents,
    horizon_open: horizonOpen,
    horizon_rows: horizonRows,
    evidence_census: {
      runs: censusOf(anchoredRuns.map((run) => run.verdict)),
      claims: censusOf(anchoredClaims.map((claim) => claim.verdict)),
    },
    notes: [
      TASK_TELEMETRY_NO_COMPOSITE_SCORE_NOTE,
      TASK_TELEMETRY_NO_CHAIN_PERSISTENCE_NOTE,
      TASK_TELEMETRY_ADVISORY_NOTE,
      TASK_TELEMETRY_NO_BASELINE_PERCENTAGE_NOTE,
    ],
  };
}

/** verified_transition_rate 口径披露（MEASURED/NOT_COMPUTABLE 共用——口径透明恒在）。 */
const RATE_BASIS =
  "机算口径：锚定本任务（subject.object_id=TASK.*）的 claims 判定面——VERIFIED 施断（verification.verdict=VERIFIED）/判定流转总数；生命周期转移时点的 evidence 轴不可机算（journal 是事件流无 axes 历史），转移事件计数独立呈现于 transition_events 字段";

/** horizon 口径披露（三态共用——A4 seq 跨度纪律恒在）。 */
const HORIZON_BASIS =
  "journal seq 跨度（A4 禁墙钟）：EXECUTION_BEGUN seq → EXECUTION_ENDED/EXECUTION_INTERRUPTED seq；聚合跨度只在全部封口时可算（open 执行 = horizon_open 显式）";

/** verdict census（键字典序输出 → JSON 字节稳定；reconcile censusOf 同款）。 */
function censusOf(verdicts: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const verdict of verdicts) {
    counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const key of [...counts.keys()].sort()) {
    const value = counts.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// ============================================================
// gather（IO 装载单一面——只读零写；平面损坏 fail-closed 禁静默当零记录）
// ============================================================

/** runs 平面文件名词形（gatekeeper CLAIM/RUN FILE_PATTERN 同源——分母纪律一致）。 */
const RUN_FILE_PATTERN = /^GRN-[0-9]+\.json$/;
/** claims 平面文件名词形（gatekeeper.ts:57 同款）。 */
const CLAIM_FILE_PATTERN = /^CLM-[0-9]+\.json$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 平面文件装载（reconcile parsePlaneFile 同款：缺席/损坏 fail-closed——禁静默当零记录）。 */
function parsePlaneJson(path: string, name: string): UnknownRecord {
  const text = readText(path);
  if (text === null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `证据文件不可读（清单在册而读取失败）：${path}`,
      "证据平面损坏即信号失真；从 git 恢复或重跑对应 record 通路（禁静默跳过损坏证据）",
      { evidence_path: path },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `证据文件无法解析（损坏或手改）：${name}`,
      "证据文件由 record 通道落盘；从 git 恢复该文件（禁静默跳过损坏证据）",
      { cause: String(error), evidence_path: path },
    );
  }
  if (!isRecord(parsed)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `证据文件须为 JSON 对象：${name}`,
      "canonical 证据记录由 record 通路落盘；形态漂移 = 手改痕迹，从 git 恢复",
      { evidence_path: path },
    );
  }
  return parsed;
}

/** runs 平面装载（reconcile scanRunsPlane 同款双形态兼容——verdict 必读 fail-closed）。 */
function scanRunsForTelemetry(paths: StorePaths): TaskTelemetryRunRow[] {
  let names: string[];
  try {
    names = readdirSync(paths.runsDir);
  } catch {
    return []; // 平面缺席 = 零记录（显式空——gather 无权建目录，纯读零写）
  }
  const rows: TaskTelemetryRunRow[] = [];
  for (const name of names.filter((candidate) => RUN_FILE_PATTERN.test(candidate)).sort()) {
    const record = parsePlaneJson(`${paths.runsDir}/${name}`, name);
    const inline = record.gate_result;
    const result =
      isRecord(inline) && isRecord(inline.result) ? inline.result : record;
    const verdict = result.verdict;
    if (typeof verdict !== "string" || verdict.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `evidence/runs/${name} 缺 verdict（既非 kernel canonical 07 形态也非 GateResult 值）`,
        "run 文件由 record 通道 canonical 化（compact/record gate-run），或从 git 恢复；禁静默跳过损坏证据",
        { file: name },
      );
    }
    const subjectRaw = result.subject_id ?? result.subjectId;
    const refRaw = record.grn;
    rows.push({
      grn: typeof refRaw === "string" && refRaw.length > 0 ? refRaw : name.replace(/\.json$/, ""),
      subject_id:
        typeof subjectRaw === "string" && subjectRaw.length > 0 ? subjectRaw : null,
      verdict,
    });
  }
  return rows;
}

/** claims 平面装载（reconcile scanClaimsPlane 同款——verification.verdict 判定块必读）。 */
function scanClaimsForTelemetry(paths: StorePaths): TaskTelemetryClaimRow[] {
  let names: string[];
  try {
    names = readdirSync(paths.claimsDir);
  } catch {
    return [];
  }
  const rows: TaskTelemetryClaimRow[] = [];
  for (const name of names.filter((candidate) => CLAIM_FILE_PATTERN.test(candidate)).sort()) {
    const record = parsePlaneJson(`${paths.claimsDir}/${name}`, name);
    const verification = record.verification;
    const verdict = isRecord(verification) ? verification.verdict : undefined;
    if (typeof verdict !== "string" || verdict.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `evidence/claims/${name} 缺 verification.verdict（非 claim canonical 形态）`,
        "claim 文件由 record 通道（record_claim）落盘，或从 git 恢复；禁静默跳过损坏证据",
        { file: name },
      );
    }
    const subject = record.subject;
    const refRaw = record.clm;
    rows.push({
      clm: typeof refRaw === "string" && refRaw.length > 0 ? refRaw : name.replace(/\.json$/, ""),
      subject_id:
        isRecord(subject) && typeof subject.object_id === "string" ? subject.object_id : null,
      verdict,
    });
  }
  return rows;
}

/** checkpoint 计数（readCheckpoint 损坏 fail-closed 内建；目录缺席 = 0 显式空）。 */
function countTaskCheckpoints(paths: StorePaths, taskRef: string): number {
  let names: string[];
  try {
    names = readdirSync(paths.checkpointsDir);
  } catch {
    return 0;
  }
  let count = 0;
  for (const name of names.filter((candidate) => candidate.endsWith(".json")).sort()) {
    const stem = name.replace(/\.json$/, "");
    if (!CHECKPOINT_ID_PATTERN.test(stem)) continue;
    const record = readCheckpoint(paths, stem);
    if (record !== null && record.task_ref === taskRef) count += 1;
  }
  return count;
}

/**
 * 任务 telemetry 输入装载（只读零写——六平面既有读取面复用；非 createStore 通路，
 * 调用方沿 CLI 纯读先例 requireInitialized + buildStorePaths 进入）。
 */
export function gatherTaskTelemetryInput(
  paths: StorePaths,
  taskRef: string,
): TaskTelemetryInput {
  assertTaskRefWordForm(taskRef);
  const executions = listExecutionRecords(paths)
    .filter((record) => record.task_id === taskRef)
    .map((record) => ({
      execution_id: record.execution_id,
      task_id: record.task_id,
      receipt_count: countExecutionInflightReceipts(paths, record.execution_id),
    }))
    .sort((a, b) => (a.execution_id < b.execution_id ? -1 : 1));
  return {
    task_ref: taskRef,
    journal_events: readJournalLines(paths),
    executions,
    runs: scanRunsForTelemetry(paths),
    claims: scanClaimsForTelemetry(paths),
    steering_count: readTaskSteeringConstraints(paths, taskRef).length,
    negative_history: readTaskNegativeHistory(paths, taskRef).map((entry) => ({
      approach: entry.approach,
      reason: entry.reason,
      status: entry.status,
    })),
    checkpoint_count: countTaskCheckpoints(paths, taskRef),
  };
}
