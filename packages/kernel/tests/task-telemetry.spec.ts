/**
 * task-telemetry.spec.ts —— reasoning/cost telemetry 派生评估核（W4-S5 · 战役 W4
 * R4-4 + 09-10 PRD REQ-11 + §9 完整发布节）。
 *
 * 判据锚：
 * - 指标 = 对既有治理平面的**只读派生聚合**（journal/execution/claims/steering/
 *   negative-history/checkpoint——零新写面、零新 canonical kind）；每指标带分母与
 *   可计算性（§9「无样本/零分母记为不可计算」）；
 * - 词形纪律：MEASURED / NOT_MEASURABLE_YET 复用 §55.1 既有词形（production
 *   CAPABILITY_OUTCOME_METRIC_STATUS_VALUES 在册）；NOT_COMPUTABLE = 信号源在座
 *   而分母为零（SP 提案新词形——「零分母记为不可计算」的逐字承载）；
 * - 诚实红线：无综合评分（六指标独立呈现禁合成单一分数）；不持久化私有思维链
 *   （输入面无思维链通道）；不设强制阈值不阻断（telemetry 是 advisory 呈现）；
 *   cost 面如实 NOT_MEASURABLE_YET（本仓无 token/费用计量源——不虚构数值）；
 *   无跨 session 基线平面（v1）——不宣称任何提升百分比；
 * - 纯函数纪律：deriveTaskTelemetry 零 IO 零 store 零墙钟（同输入重放 deep
 *   equal，A4）；IO 装载独立在 gatherTaskTelemetryInput（单一装载面）。
 */
import { describe, expect, it } from "vitest";
import {
  GovernanceError,
  TASK_TELEMETRY_ADVISORY_NOTE,
  TASK_TELEMETRY_HORIZON_STATES,
  TASK_TELEMETRY_METRIC_KEYS,
  TASK_TELEMETRY_METRIC_STATUS,
  TASK_TELEMETRY_NO_BASELINE_PERCENTAGE_NOTE,
  TASK_TELEMETRY_NO_CHAIN_PERSISTENCE_NOTE,
  TASK_TELEMETRY_NO_COMPOSITE_SCORE_NOTE,
  buildStorePaths,
  deriveTaskTelemetry,
  gatherTaskTelemetryInput,
  type TaskTelemetryInput,
  type TaskTelemetryMetric,
  type TaskTelemetryMetricKey,
  type TaskTelemetryReport,
} from "@pomaster/kernel";
import { AGENT, makeStore } from "./helpers.js";

// ============================================================
// fixture 工厂（纯数据输入——derive 零 IO 的可测形态）
// ============================================================

const TASK = "TASK.TELEMETRY";

/** 空输入基线（全平面显式空——诚实缺席形态）。 */
function emptyInput(overrides: Partial<TaskTelemetryInput> = {}): TaskTelemetryInput {
  return {
    task_ref: TASK,
    journal_events: [],
    executions: [],
    runs: [],
    claims: [],
    steering_count: 0,
    negative_history: [],
    checkpoint_count: 0,
    ...overrides,
  };
}

/** journal 事件行构造（形态镜像 kernel 落盘词形——只带本核消费键）。 */
const txApplied = (seq: number, ops: string[], changed: string[]): Record<string, unknown> => ({
  type: "TX_APPLIED",
  seq,
  ops,
  changed_object_ids: changed,
});
const begunEvent = (seq: number, executionId: string): Record<string, unknown> => ({
  type: "EXECUTION_BEGUN",
  seq,
  execution_id: executionId,
});
const endedEvent = (seq: number, executionId: string): Record<string, unknown> => ({
  type: "EXECUTION_ENDED",
  seq,
  execution_id: executionId,
});
const interruptedEvent = (seq: number, executionId: string): Record<string, unknown> => ({
  type: "EXECUTION_INTERRUPTED",
  seq,
  execution_id: executionId,
});

/** 执行档案引用（gather 装载形态；receipt_count = W4-S1 在途回执计数）。 */
const exec = (executionId: string, taskId: string | null, receiptCount = 0) => ({
  execution_id: executionId,
  task_id: taskId,
  receipt_count: receiptCount,
});

function metricOf(
  report: TaskTelemetryReport,
  key: TaskTelemetryMetricKey,
): TaskTelemetryMetric {
  const found = report.metrics.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`test bug: metric ${key} missing`);
  return found;
}

// ============================================================
// A 段：空输入与零分母（诚实缺席——绝不冒充数值）
// ============================================================

describe("空输入与零分母（诚实缺席）", () => {
  it("全空输入：六指标全在座固定序——rate/horizon NOT_COMPUTABLE（零分母）、cost NOT_MEASURABLE_YET、计数面 MEASURED 0", () => {
    const report = deriveTaskTelemetry(emptyInput());
    expect(report.metrics.map((metric) => metric.key)).toEqual([...TASK_TELEMETRY_METRIC_KEYS]);
    const rate = metricOf(report, "verified_transition_rate");
    expect(rate.status).toBe("NOT_COMPUTABLE");
    expect(rate.denominator).toBe(0);
    expect(rate.reason).toContain("零分母");
    const horizon = metricOf(report, "horizon");
    expect(horizon.status).toBe("NOT_COMPUTABLE");
    expect(horizon.reason).toContain("零分母");
    const cost = metricOf(report, "cost_face");
    expect(cost.status).toBe("NOT_MEASURABLE_YET");
    expect(cost.reason).toContain("计量");
    for (const key of ["rework_signal", "steering_count", "resume_reconcile_signals"] as const) {
      const metric = metricOf(report, key);
      expect(metric.status).toBe("MEASURED");
      expect(metric.value).toBe(0);
    }
    expect(report.horizon_open).toBe(false);
    expect(report.horizon_rows).toEqual([]);
    expect(report.transition_events).toBe(0);
  });

  it("NOT_COMPUTABLE / NOT_MEASURABLE_YET 的 value/numerator 恒 null（绝不冒充数值——§55.1 fail-closed 半边）", () => {
    const report = deriveTaskTelemetry(emptyInput());
    for (const metric of report.metrics) {
      if (metric.status === "MEASURED") continue;
      expect(metric.value).toBeNull();
      expect(metric.numerator).toBeNull();
    }
    expect(metricOf(report, "cost_face").denominator).toBeNull();
  });

  it("cost_face 恒 NOT_MEASURABLE_YET（有其他信号也不改变——本仓无 token/费用计量源，不虚构）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        claims: [{ clm: "CLM-1", subject_id: TASK, verdict: "VERIFIED" }],
        steering_count: 3,
        checkpoint_count: 2,
      }),
    );
    const cost = metricOf(report, "cost_face");
    expect(cost.status).toBe("NOT_MEASURABLE_YET");
    expect(cost.value).toBeNull();
    expect(cost.reason).toContain("Provider");
  });
});

// ============================================================
// B 段：verified_transition_rate（判定面口径——分母透明）
// ============================================================

describe("verified_transition_rate（claims 判定面口径）", () => {
  it("claims 3 条含 1 VERIFIED → MEASURED 1/3（numerator/denominator 分账透明）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        claims: [
          { clm: "CLM-1", subject_id: TASK, verdict: "VERIFIED" },
          { clm: "CLM-2", subject_id: TASK, verdict: "UNVERIFIED" },
          { clm: "CLM-3", subject_id: TASK, verdict: "PARTIALLY_VERIFIED" },
        ],
      }),
    );
    const rate = metricOf(report, "verified_transition_rate");
    expect(rate.status).toBe("MEASURED");
    expect(rate.numerator).toBe(1);
    expect(rate.denominator).toBe(3);
    expect(rate.value).toBeCloseTo(1 / 3);
  });

  it("全 UNVERIFIED → MEASURED 0（零分子 ≠ 零分母——判定在座未达 VERIFIED 如实呈现）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        claims: [
          { clm: "CLM-1", subject_id: TASK, verdict: "UNVERIFIED" },
          { clm: "CLM-2", subject_id: TASK, verdict: "UNVERIFIED" },
        ],
      }),
    );
    const rate = metricOf(report, "verified_transition_rate");
    expect(rate.status).toBe("MEASURED");
    expect(rate.value).toBe(0);
    expect(rate.numerator).toBe(0);
    expect(rate.denominator).toBe(2);
  });

  it("subject 锚定过滤：他任务 claims 不进本任务分母（禁凑分母）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        claims: [
          { clm: "CLM-1", subject_id: "TASK.OTHER", verdict: "VERIFIED" },
          { clm: "CLM-2", subject_id: TASK, verdict: "VERIFIED" },
        ],
      }),
    );
    const rate = metricOf(report, "verified_transition_rate");
    expect(rate.denominator).toBe(1);
    expect(rate.numerator).toBe(1);
  });

  it("subject_id 缺席（null）的 claims 不进分母（无锚不猜——缺席不伪造）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({ claims: [{ clm: "CLM-1", subject_id: null, verdict: "VERIFIED" }] }),
    );
    expect(metricOf(report, "verified_transition_rate").status).toBe("NOT_COMPUTABLE");
  });

  it("transition_events：TX_APPLIED ops 含 transition_object 且 changed_object_ids 含本 task 才计数", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        journal_events: [
          txApplied(3, ["transition_object"], [TASK]),
          txApplied(4, ["transition_object", "upsert_object"], ["TASK.OTHER"]),
          txApplied(5, ["upsert_object"], [TASK]),
          txApplied(6, ["transition_object"], [TASK, "PAGE.X"]),
          { type: "EXECUTION_BEGUN", seq: 7, execution_id: "AGX-2026-00001" },
        ],
      }),
    );
    expect(report.transition_events).toBe(2);
  });

  it("rate 的 basis 披露机算口径（判定面）与转移时点轴不可机算的诚实声明", () => {
    const report = deriveTaskTelemetry(emptyInput());
    const rate = metricOf(report, "verified_transition_rate");
    expect(rate.basis).toContain("claims");
    expect(rate.basis).toContain("transition_events");
  });
});

// ============================================================
// C 段：rework / resume / steering（信号计数面——非评分）
// ============================================================

describe("rework_signal / resume_reconcile_signals / steering_count", () => {
  it("rework_signal = negative_history 条目 + claims REJECTED，breakdown 双子计数", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        claims: [
          { clm: "CLM-1", subject_id: TASK, verdict: "REJECTED" },
          { clm: "CLM-2", subject_id: TASK, verdict: "VERIFIED" },
        ],
        negative_history: [
          { approach: "方案 A", reason: "与 token 单一来源冲突", status: "REJECTED" },
          { approach: "方案 B", reason: "权限面不允许", status: "REJECTED" },
        ],
      }),
    );
    const rework = metricOf(report, "rework_signal");
    expect(rework.status).toBe("MEASURED");
    expect(rework.value).toBe(3);
    expect(rework.breakdown).toEqual({ negative_history: 2, rejected_claims: 1 });
  });

  it("resume_reconcile_signals = checkpoint + 被中断执行（锚定本 task），breakdown 双子计数", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        executions: [
          exec("AGX-2026-00001", TASK),
          exec("AGX-2026-00002", TASK),
          exec("AGX-2026-00003", "TASK.OTHER"),
        ],
        journal_events: [
          begunEvent(10, "AGX-2026-00001"),
          interruptedEvent(12, "AGX-2026-00001"),
          begunEvent(20, "AGX-2026-00003"),
          interruptedEvent(22, "AGX-2026-00003"),
        ],
        checkpoint_count: 2,
      }),
    );
    const resume = metricOf(report, "resume_reconcile_signals");
    expect(resume.status).toBe("MEASURED");
    expect(resume.value).toBe(3);
    expect(resume.breakdown).toEqual({ checkpoints: 2, executions_interrupted: 1 });
    expect(resume.basis).toContain("RECONCILE_DIRTY");
  });

  it("steering_count 透传登记数（申报面计数——basis 声明机器不验证遵守）", () => {
    const report = deriveTaskTelemetry(emptyInput({ steering_count: 4 }));
    const steering = metricOf(report, "steering_count");
    expect(steering.status).toBe("MEASURED");
    expect(steering.value).toBe(4);
    expect(steering.basis).toContain("declared");
  });
});

// ============================================================
// D 段：horizon（execution begin→end 的 seq 跨度）
// ============================================================

describe("horizon（journal seq 跨度——A4 禁墙钟）", () => {
  it("单执行全封口：span = ended_seq - begun_seq，horizon_open=false", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        executions: [exec("AGX-2026-00001", TASK, 2)],
        journal_events: [
          begunEvent(5, "AGX-2026-00001"),
          endedEvent(9, "AGX-2026-00001"),
        ],
      }),
    );
    const horizon = metricOf(report, "horizon");
    expect(horizon.status).toBe("MEASURED");
    expect(horizon.value).toBe(4);
    expect(report.horizon_open).toBe(false);
    expect(report.horizon_rows).toEqual([
      {
        execution_id: "AGX-2026-00001",
        begun_seq: 5,
        ended_seq: 9,
        span: 4,
        state: "closed",
        inflight_receipts: { state: "recorded", receipt_count: 2 },
      },
    ]);
  });

  it("多执行聚合跨度 = max(ended) - min(begun)（任务级 horizon，逐执行明细并行呈现）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        executions: [exec("AGX-2026-00001", TASK), exec("AGX-2026-00002", TASK)],
        journal_events: [
          begunEvent(5, "AGX-2026-00001"),
          endedEvent(9, "AGX-2026-00001"),
          begunEvent(30, "AGX-2026-00002"),
          endedEvent(40, "AGX-2026-00002"),
        ],
      }),
    );
    expect(metricOf(report, "horizon").value).toBe(35);
    expect(report.horizon_rows).toHaveLength(2);
  });

  it("open 执行（ended 缺席）→ horizon NOT_COMPUTABLE + horizon_open=true 显式；rows 明细照给（不吞没）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        executions: [exec("AGX-2026-00001", TASK), exec("AGX-2026-00002", TASK)],
        journal_events: [
          begunEvent(5, "AGX-2026-00001"),
          endedEvent(9, "AGX-2026-00001"),
          begunEvent(30, "AGX-2026-00002"),
        ],
      }),
    );
    const horizon = metricOf(report, "horizon");
    expect(horizon.status).toBe("NOT_COMPUTABLE");
    expect(horizon.value).toBeNull();
    expect(horizon.reason).toContain("horizon_open");
    expect(report.horizon_open).toBe(true);
    expect(report.horizon_rows).toHaveLength(2);
    const open = report.horizon_rows.find((row) => row.execution_id === "AGX-2026-00002");
    expect(open?.state).toBe("open");
    expect(open?.span).toBeNull();
  });

  it("零 receipts 执行的 inflight_receipts 分态 = none（W4-S1 词形复用——回执未存 ≠ 未发生）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        executions: [exec("AGX-2026-00001", TASK, 0)],
        journal_events: [begunEvent(5, "AGX-2026-00001"), endedEvent(6, "AGX-2026-00001")],
      }),
    );
    expect(report.horizon_rows[0]?.inflight_receipts).toEqual({ state: "none", receipt_count: 0 });
  });

  it("executions 未锚定本 task（task_id null / 他任务）不进 horizon 分母", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        executions: [exec("AGX-2026-00001", null), exec("AGX-2026-00002", "TASK.OTHER")],
        journal_events: [begunEvent(5, "AGX-2026-00001"), begunEvent(6, "AGX-2026-00002")],
      }),
    );
    expect(metricOf(report, "horizon").status).toBe("NOT_COMPUTABLE");
    expect(report.horizon_rows).toEqual([]);
  });

  it("journal begun 事件缺席（残态）→ horizon NOT_COMPUTABLE 显式（绝不出 ±Infinity/NaN 冒充数值）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        executions: [exec("AGX-2026-00001", TASK)],
        journal_events: [endedEvent(9, "AGX-2026-00001")],
      }),
    );
    const horizon = metricOf(report, "horizon");
    expect(horizon.status).toBe("NOT_COMPUTABLE");
    expect(horizon.value).toBeNull();
    expect(horizon.reason).toContain("缺席");
  });

  it("混合残态：单执行 begun 缺席而他执行双轴齐备（全行 ended 在座 horizon_open=false）→ 聚合仍 NOT_COMPUTABLE（禁跨行 seq 混算冒充聚合跨度）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        executions: [exec("AGX-2026-00001", TASK), exec("AGX-2026-00002", TASK)],
        journal_events: [
          begunEvent(30, "AGX-2026-00002"),
          endedEvent(40, "AGX-2026-00002"),
          endedEvent(9, "AGX-2026-00001"), // begun 缺席——残态
        ],
      }),
    );
    const horizon = metricOf(report, "horizon");
    expect(horizon.status).toBe("NOT_COMPUTABLE");
    expect(horizon.value).toBeNull();
    expect(horizon.reason).toContain("缺席");
    expect(report.horizon_open).toBe(false); // 全行 ended 在座——open 位不亮，残态走显式缺席
    const residual = report.horizon_rows.find(
      (row) => row.execution_id === "AGX-2026-00001",
    );
    expect(residual?.state).toBe("closed"); // ended 在座 → closed；span 逐行 null 不参与聚合
    expect(residual?.span).toBeNull();
  });
});

// ============================================================
// E 段：census / fingerprint / 词形闭包 / 红线注记 / 输入校验
// ============================================================

describe("census / fingerprint / 词形 / 红线 / 校验", () => {
  it("evidence_census：锚定本 task 的 runs/claims verdict 计数（键字典序——全量呈现不吞没）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        runs: [
          { grn: "GRN-1", subject_id: TASK, verdict: "passed" },
          { grn: "GRN-2", subject_id: TASK, verdict: "failed" },
          { grn: "GRN-3", subject_id: TASK, verdict: "passed" },
          { grn: "GRN-4", subject_id: "TASK.OTHER", verdict: "passed" },
        ],
        claims: [
          { clm: "CLM-1", subject_id: TASK, verdict: "VERIFIED" },
          { clm: "CLM-2", subject_id: TASK, verdict: "UNVERIFIED" },
        ],
      }),
    );
    expect(report.evidence_census.runs).toEqual({ failed: 1, passed: 2 });
    expect(report.evidence_census.claims).toEqual({ UNVERIFIED: 1, VERIFIED: 1 });
  });

  it("inputs_fingerprint：同输入同指纹、异输入异指纹（sha256OfCanonical 整个输入）", () => {
    const a = deriveTaskTelemetry(emptyInput({ steering_count: 1 }));
    const b = deriveTaskTelemetry(emptyInput({ steering_count: 1 }));
    const c = deriveTaskTelemetry(emptyInput({ steering_count: 2 }));
    expect(a.inputs_fingerprint).toBe(b.inputs_fingerprint);
    expect(a.inputs_fingerprint).not.toBe(c.inputs_fingerprint);
  });

  it("确定性：同输入重放 deep equal（纯函数零墙钟零 IO，A4）", () => {
    const input = emptyInput({
      journal_events: [begunEvent(5, "AGX-2026-00001"), endedEvent(9, "AGX-2026-00001")],
      executions: [exec("AGX-2026-00001", TASK)],
      claims: [{ clm: "CLM-1", subject_id: TASK, verdict: "VERIFIED" }],
    });
    expect(deriveTaskTelemetry(input)).toEqual(deriveTaskTelemetry(input));
  });

  it("词形闭包：六指标固定序 / 三值状态轴（两词形复用 §55.1）/ horizon 两值（SP 提案待追认）", () => {
    expect([...TASK_TELEMETRY_METRIC_KEYS]).toEqual([
      "verified_transition_rate",
      "rework_signal",
      "steering_count",
      "resume_reconcile_signals",
      "horizon",
      "cost_face",
    ]);
    expect([...TASK_TELEMETRY_METRIC_STATUS]).toEqual([
      "MEASURED",
      "NOT_COMPUTABLE",
      "NOT_MEASURABLE_YET",
    ]);
    expect([...TASK_TELEMETRY_HORIZON_STATES]).toEqual(["closed", "open"]);
  });

  it("红线注记常量在座：无综合评分 / 不持久化思维链 / advisory 无阈值 / 无百分比基线（W4 PRD R4-4 + REQ-11 + §9）", () => {
    expect(TASK_TELEMETRY_NO_COMPOSITE_SCORE_NOTE).toContain("综合评分");
    expect(TASK_TELEMETRY_NO_CHAIN_PERSISTENCE_NOTE).toContain("思维链");
    expect(TASK_TELEMETRY_ADVISORY_NOTE).toContain("不阻断");
    expect(TASK_TELEMETRY_NO_BASELINE_PERCENTAGE_NOTE).toContain("较基线提升");
    const report = deriveTaskTelemetry(emptyInput());
    expect(report.notes).toContain(TASK_TELEMETRY_NO_COMPOSITE_SCORE_NOTE);
    expect(report.notes).toContain(TASK_TELEMETRY_NO_CHAIN_PERSISTENCE_NOTE);
    expect(report.notes).toContain(TASK_TELEMETRY_ADVISORY_NOTE);
    expect(report.notes).toContain(TASK_TELEMETRY_NO_BASELINE_PERCENTAGE_NOTE);
  });

  it("报告零综合评分位：报告与指标的键集合白名单（无 score/rating/aggregate 数值字段——结构级钉）", () => {
    const report = deriveTaskTelemetry(
      emptyInput({
        claims: [{ clm: "CLM-1", subject_id: TASK, verdict: "VERIFIED" }],
        steering_count: 2,
        checkpoint_count: 1,
      }),
    );
    // 注记文本里出现「score」词形（红线声明本身）合法；结构键才是钉住对象。
    expect(Object.keys(report).sort()).toEqual([
      "evidence_census",
      "horizon_open",
      "horizon_rows",
      "inputs_fingerprint",
      "metrics",
      "notes",
      "task_ref",
      "transition_events",
    ]);
    for (const metric of report.metrics) {
      expect(Object.keys(metric).sort()).toEqual([
        "basis",
        "breakdown",
        "denominator",
        "key",
        "numerator",
        "reason",
        "status",
        "value",
      ]);
    }
  });

  it("输入校验：task_ref 非 TASK 词形 → fail-closed（FATAL_UNKNOWN_PREFIX / 文法码位透传）", () => {
    expect(() =>
      deriveTaskTelemetry(emptyInput({ task_ref: "PAGE.X" })),
    ).toThrow(expect.objectContaining({ code: "FATAL_UNKNOWN_PREFIX" }));
    expect(() =>
      deriveTaskTelemetry(emptyInput({ task_ref: "TASK-0087" })),
    ).toThrow(GovernanceError);
  });

  it("输入校验：executions 词形非法（非 AGX）→ SCHEMA_INVALID（禁自造身份混入分母）", () => {
    expect(() =>
      deriveTaskTelemetry(emptyInput({ executions: [exec("EXEC-1", TASK)] })),
    ).toThrow(expect.objectContaining({ code: "SCHEMA_INVALID" }));
  });

  it("输入校验：负计数（steering_count/checkpoint_count）→ SCHEMA_INVALID（计数面无负值）", () => {
    expect(() => deriveTaskTelemetry(emptyInput({ steering_count: -1 }))).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
    expect(() => deriveTaskTelemetry(emptyInput({ checkpoint_count: -1 }))).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });
});

// ============================================================
// F 段：gather（IO 装载单一面——只读）+ 全链
// ============================================================

describe("gatherTaskTelemetryInput（IO 装载；kernel 只读单一面）", () => {
  it("全链：登记面数据 → gather → derive（steering/negative-history/checkpoint/execution 逐面锚定）", async () => {
    const { store, root } = await makeStore();
    const { applyTransaction, appendTaskNegativeEntry, recordSteering, beginExecution, endExecution, saveCheckpoint } =
      await import("@pomaster/kernel");
    const { gid } = await import("./helpers.js");

    // seed task（task_object 强制 class_scan_result——negative-history.spec 同款）。
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: gid(TASK),
            kind: "task_object",
            axisProfile: "task_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "telemetry 承载任务",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              intent: "验证 telemetry gather 全链",
              class_scan_result: { scope: "tasks/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-W4-S5" },
            },
          } as never,
        },
      ],
    });
    await appendTaskNegativeEntry(store, {
      taskRef: TASK,
      approach: "方案 A",
      reason: "与 token 单一来源冲突",
      recordedBy: AGENT,
    });
    await recordSteering(store, {
      taskRef: TASK,
      constraint: "不要修改后端 API",
      sourceRef: "session:owner#turn-1",
      declaredBy: { actorType: "human", actor: "owner", selfAttested: false },
    });
    const closed = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "interactive",
      taskId: TASK,
    });
    await endExecution(store, closed.execution_id);
    const openExec = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "interactive",
      taskId: TASK,
    });
    await saveCheckpoint(store, { taskRef: TASK, executionId: closed.execution_id });

    const paths = buildStorePaths(root);
    const input = gatherTaskTelemetryInput(paths, TASK);
    const report = deriveTaskTelemetry(input);

    expect(input.steering_count).toBe(1);
    expect(input.negative_history).toHaveLength(1);
    expect(input.checkpoint_count).toBe(1);
    expect(input.executions).toHaveLength(2);
    const horizon = metricOf(report, "horizon");
    expect(horizon.status).toBe("NOT_COMPUTABLE"); // 一个执行在途 → horizon_open
    expect(report.horizon_open).toBe(true);
    expect(report.horizon_rows.map((row) => row.state).sort()).toEqual(["closed", "open"]);
    expect(metricOf(report, "rework_signal").value).toBe(1);
    expect(metricOf(report, "steering_count").value).toBe(1);
    const resume = metricOf(report, "resume_reconcile_signals");
    expect(resume.breakdown).toEqual({ checkpoints: 1, executions_interrupted: 0 });
    expect(openExec.execution_id).toBeTruthy();
  });

  it("gather 纯读：装载前后 journal 行数与 executions 目录文件数不变（零写面钉）", async () => {
    const { store, root } = await makeStore();
    const { beginExecution, endExecution } = await import("@pomaster/kernel");
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    await beginExecution(store, {
      role: "implementer",
      runtime: "script",
      identityKind: "interactive",
      taskId: TASK,
    }).then((record) => endExecution(store, record.execution_id));
    const journalPath = join(root, ".pomaster", "state", "journal.jsonl");
    const journalBefore = readFileSync(journalPath, "utf8").split("\n").filter(Boolean).length;
    const executionsBefore = readdirSync(join(root, ".pomaster", "executions")).length;

    gatherTaskTelemetryInput(buildStorePaths(root), TASK);

    expect(readFileSync(journalPath, "utf8").split("\n").filter(Boolean).length).toBe(journalBefore);
    expect(readdirSync(join(root, ".pomaster", "executions")).length).toBe(executionsBefore);
  });

  it("gather 词形闸：非 TASK 前缀 → FATAL_UNKNOWN_PREFIX（与 derive 输入校验同判据）", async () => {
    const { root } = await makeStore();
    expect(() => gatherTaskTelemetryInput(buildStorePaths(root), "PERMIT.X")).toThrow(
      expect.objectContaining({ code: "FATAL_UNKNOWN_PREFIX" }),
    );
  });
});
