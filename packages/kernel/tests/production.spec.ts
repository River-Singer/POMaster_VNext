/**
 * production.spec.ts —— Production Feedback / Control Band v1 内核单元测试（P34a）。
 *
 * 覆盖（对位任务测试面）：
 * - §30 四态词形（PHASE_TIMELINE_VALUES 逐字 + 与 lifecycle 轴正交 + band phase 恒
 *   IN_PRODUCTION 构造面封条）；
 * - 词轴逐值（P34 段已随 vocab-pr-0004 收编——Owner 决议 2026-09-01：SIGNAL_SOURCE 五值 /
 *   DIAGNOSIS_KIND 三分 /
 *   BAND_PREDICATE_OPERATOR 五算子 / EVALUATION_STATUS 三态 / SELF_IMPROVEMENT_SIGNAL
 *   八信号 + PRD 原文逐字镜像 + 十六机器键与八能力表一致性）；
 * - 15-production-band schema 契约（registerControlBand 产物 ajv 校验 + allSchemas
 *   15 份聚合注册）；
 * - evaluateControlBand 三态全分支（谓词五算子正反例 + 指标名不匹配/值非有限/谓词
 *   损坏 = NOT_EVALUABLE 显式非 OK + BREACHED 产 Evidence 恒 detected_by=tool_signal
 *   + 纯函数确定性）——§95.2「不得把是否异常完全交给 LLM 主观判断」的机器面；
 * - recordObservation 台账（BREACHED/OK/NOT_EVALUABLE 三态落账形态 + 同批原子写 +
 *   重复观测显式拒绝 + 非有限值拒绝）；
 * - challengeFromBreach（§95.3 CURRENT→CHALLENGED 走 applyTransaction 前置核实：
 *   happy 链 / LOCKED 对象 authorityRef=breach 引用满足 store 既有前置 / 非 CURRENT
 *   / 重复 challenge / MIGRATING / 无 evidence / band≠breach 全拒绝面）；
 * - recordDiagnosis（无 breach evidence 的 diagnosis 结构性拒绝 DIAGNOSIS_WITHOUT_
 *   BREACH_EVIDENCE——工具信号前置封条 + kind 词形闭包 + 重复拒绝）；
 * - computeCapabilityOutcomeMetrics（§55.1 八行三列逐字 + Gauntlet first-pass/
 *   Architecture Gate 拦截可算子集数值正确 + fixture 隔离 + 其余显式
 *   NOT_MEASURABLE_YET 不冒充数值 + METRICS_CAVEAT 逐字注记）；
 * - registerSelfImprovementCandidate（§90.4 恒 POMASTER_SELF_IMPROVEMENT_CANDIDATE
 *   呈报态 + 无自动应用副作用：production 之外全树字节零变 + 模块导出面断言）；
 * - 装载面 fail-closed（手改词形/半账显式拒绝）。
 *
 * 测试卫生：fixture 一律临时目录（makeRoot/makeStore——pvnext-kernel-test- 前缀）；
 * gate 运行台账 fixture 直接落 evidence/runs/ 形态文件（07 run_record inline 形态）。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, appendFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import Ajv from "ajv";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT,
  makeRoot,
  makeStore,
  pageEnvelope,
} from "./helpers.js";
import {
  applyTransaction,
  BAND_PREDICATE_OPERATOR_VALUES,
  CAPABILITY_OUTCOME_METRIC_KEY_VALUES,
  CAPABILITY_OUTCOME_METRICS,
  challengeFromBreach,
  computeCapabilityOutcomeMetrics,
  CONTROL_BAND_EVALUATION_STATUS_VALUES,
  DETECTED_BY_TOOL_SIGNAL,
  DIAGNOSIS_KIND_VALUES,
  evaluateControlBand,
  GovernanceError,
  listBreaches,
  listChallenges,
  listControlBands,
  listDiagnoses,
  listObservations,
  listSelfImprovementCandidates,
  loadTruthIndex,
  METRICS_CAVEAT,
  POMASTER_SELF_IMPROVEMENT_CANDIDATE,
  PHASE_TIMELINE_VALUES,
  PRODUCTION_SIGNAL_SOURCE_VALUES,
  recordDiagnosis,
  recordObservation,
  readBreach,
  readControlBand,
  registerControlBand,
  registerSelfImprovementCandidate,
  SELF_IMPROVEMENT_SIGNAL_PRD_LABELS,
  SELF_IMPROVEMENT_SIGNAL_VALUES,
  type BandObservation,
  type Store,
} from "@pomaster/kernel";
import { allSchemas, productionBandSchema } from "@pomaster/schemas";
// LIFECYCLE_VALUES 走源码直连（与 vocab.spec 同款——kernel index 只导出契约面词形）。
import { LIFECYCLE_VALUES } from "../src/vocab.js";
import * as productionModule from "../src/production.js";

const ajv = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajv.addSchema(schema as Record<string, unknown>);
}
const validateBand = ajv.compile(productionBandSchema as object);

let root: string;
let store: Store;

beforeEach(async () => {
  root = makeRoot();
  const made = await makeStore();
  store = made.store;
  // makeStore 内部 mkdtemp 的根与 makeRoot 不同——统一用 makeStore 的 root 承载断言。
  root = made.root;
});

function errorCode(error: unknown): string {
  return error instanceof GovernanceError ? error.code : `not-governance-error:${String(error)}`;
}

/** 同步调用面错误码断言辅助（sync fn；期望抛 GovernanceError）。 */
function caughtCode(fn: () => unknown): string {
  try {
    fn();
    return "no-error";
  } catch (caught) {
    return errorCode(caught);
  }
}

/** 异步调用面错误码断言辅助（async fn 的 rejection 必须被捕获而非 unhandled）。 */
async function caughtCodeAsync(fn: () => Promise<unknown> | unknown): Promise<string> {
  try {
    await fn();
    return "no-error";
  } catch (caught) {
    return errorCode(caught);
  }
}

/** 异步调用面错误对象捕获（断言 message/detail 用）。 */
async function caughtError(fn: () => Promise<unknown> | unknown): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (caught) {
    return caught;
  }
}

function bandInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "carline-list-p99-latency",
    title: "车型列表接口 p99 延迟控制带",
    capabilityRef: "PAGE.DASHBOARD",
    source: "metric",
    metricName: "http.server.requests.p99_ms",
    predicate: { operator: "gt", threshold: 800 },
    ...overrides,
  };
}

function observationInput(overrides: Partial<BandObservation> = {}): BandObservation {
  return {
    metric_name: "http.server.requests.p99_ms",
    value: 950,
    observed_at_seq: 7,
    ...overrides,
  };
}

async function seedCurrentObject(axesOverride: Record<string, unknown> = {}): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: pageEnvelope({ axes: { ...pageEnvelope().axes, ...axesOverride } }) as never,
      },
    ],
  });
}

/** 全树字节快照（production 子树之外的 .pomaster 全部文件——§90.4 无副作用封条的判据面）。 */
function treeHashExcludingProduction(base: string): Map<string, string> {
  const out = new Map<string, string>();
  const pomaster = join(base, ".pomaster");
  if (!existsSync(pomaster)) return out;
  const walk = (current: string, rel: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relName = rel.length > 0 ? `${rel}/${entry.name}` : entry.name;
      const fullPath = `${current}/${entry.name}`;
      // production 子树整体跳过（rel 判定与分隔符无关——Windows join 差异免疫）。
      if (relName === "production") continue;
      if (entry.isFile()) {
        out.set(relName, createHash("sha256").update(readFileSync(fullPath)).digest("hex"));
      } else {
        walk(fullPath, relName);
      }
    }
  };
  walk(pomaster, "");
  return out;
}

/** gate 运行台账 fixture（07 run_record inline 形态直落 evidence/runs/）。 */
function seedGateRun(
  grn: string,
  gate: string,
  verdict: string,
  options: { subjectId?: string | null; isFixture?: boolean; ranAtSeq?: number } = {},
): void {
  const runsDir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(runsDir, { recursive: true });
  const record = {
    record_type: "run",
    grn,
    ran_at_seq: options.ranAtSeq ?? 1,
    trigger: { type: "on_demand" },
    gate_result: {
      mode: "inline",
      result: {
        grn,
        gate,
        gate_def: `POLICY.GATE.${gate}@1.0.0`,
        tool: "spec:production-fixture",
        tool_version: "1.0.0",
        metric_dialect: "fixture:count",
        ran_at_seq: options.ranAtSeq ?? 1,
        verdict,
        subject_id: options.subjectId ?? null,
        is_fixture: options.isFixture === true,
        counts: { scanned: 1, applicable_scanned: 1, violations: verdict === "passed" ? 0 : 1, not_applicable: 0 },
        blindspot: { scanned: 1, produced: 1, escape_ratio: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
        duration_ms: { self: 0, external: 0 },
      },
    },
  };
  writeFileSync(`${runsDir}/${grn}.json`, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  // journal 锚（真实 record_gate_run 经 applyTransaction 落 TX_APPLIED 事件；metrics
  // 可算面按锚收录——注水面封条的合法产物镜像）。
  const journalPath = join(root, ".pomaster", "state", "journal.jsonl");
  mkdirSync(join(root, ".pomaster", "state"), { recursive: true });
  const seq = options.ranAtSeq ?? 1;
  appendFileSync(
    journalPath,
    `${JSON.stringify({ type: "TX_APPLIED", seq, authority_ref: null, execution_id: null, note: null, ops: ["record_gate_run"], changed_object_ids: [], digest_warnings: 0 })}\n`,
    "utf8",
  );
}

/** 快捷链：band + BREACHED observation + （可选）challenge，返回 breach_ref。 */
async function seedBreachChain(options: { capabilityRef?: string; challenge?: boolean } = {}): Promise<string> {
  const capabilityRef = options.capabilityRef ?? "PAGE.DASHBOARD";
  registerControlBand(root, bandInput({ capabilityRef }) as never);
  const observation = recordObservation(root, "carline-list-p99-latency", observationInput());
  expect(observation.evaluated_status).toBe("BREACHED");
  expect(observation.breach_ref).not.toBeNull();
  const breachRef = observation.breach_ref as string;
  if (options.challenge === true) {
    await challengeFromBreach(store, "carline-list-p99-latency", breachRef);
  }
  return breachRef;
}

// ============================================================
// §30 四态词形轴
// ============================================================

describe("§30 四态词形轴（PHASE_TIMELINE_VALUES）", () => {
  it("四态逐字（PRD L2555-2563 PRE_DEV/IN_DEV/POST_DEV/IN_PRODUCTION）", () => {
    expect([...PHASE_TIMELINE_VALUES]).toEqual(["PRE_DEV", "IN_DEV", "POST_DEV", "IN_PRODUCTION"]);
  });

  it("与 state_axes.lifecycle 词轴正交（值域不相交——开发阶段轴非对象生命周期轴）", () => {
    for (const phase of PHASE_TIMELINE_VALUES) {
      expect(LIFECYCLE_VALUES.includes(phase as never)).toBe(false);
    }
    for (const lifecycle of LIFECYCLE_VALUES) {
      expect(PHASE_TIMELINE_VALUES.includes(lifecycle as never)).toBe(false);
    }
  });

  it("band 构造面无 phase 参数位——registerControlBand 产物 phase 恒 IN_PRODUCTION（§95.1 第四态承载）", () => {
    const band = registerControlBand(root, bandInput() as never);
    expect(band.phase).toBe("IN_PRODUCTION");
    expect(Object.keys(band).sort()).toEqual([
      "capability_ref",
      "id",
      "metric_name",
      "phase",
      "predicate",
      "source",
      "title",
      "window",
    ]);
  });
});

// ============================================================
// 词轴逐值（P34 段已收编——vocab-pr-0004 · Owner 决议 2026-09-01）
// ============================================================

describe("P34 词轴逐值（vocab-pr-0004 收编段 · Owner 决议 2026-09-01）", () => {
  it("§95.2 生产信号源五词形（L6126 空格词形转 snake_case：error budget→error_budget、SLO→slo）", () => {
    expect([...PRODUCTION_SIGNAL_SOURCE_VALUES]).toEqual(["metric", "log", "error_budget", "slo", "control_band"]);
  });

  it("§95.3 诊断三分（SCREAMING_SNAKE 词形——§31 ARCHITECTURE_EVOLUTION 同源先例；大小写裁定 Owner 2026-09-01 照准）", () => {
    expect([...DIAGNOSIS_KIND_VALUES]).toEqual(["IMPLEMENTATION_ISSUE", "CONFIG_ISSUE", "ARCHITECTURE_EVOLUTION"]);
  });

  it("band 谓词算子五值（P34 任务定案机器词形）", () => {
    expect([...BAND_PREDICATE_OPERATOR_VALUES]).toEqual(["gt", "lt", "gte", "lte", "between"]);
  });

  it("band 判定三态（fail-closed 三态显式；与 03 VERDICT_VALUES 七态正交）", () => {
    expect([...CONTROL_BAND_EVALUATION_STATUS_VALUES]).toEqual(["OK", "BREACHED", "NOT_EVALUABLE"]);
  });

  it("§90.4 自改进八信号（snake_case 机器词形）+ PRD bullet 原文逐字镜像", () => {
    expect([...SELF_IMPROVEMENT_SIGNAL_VALUES]).toEqual([
      "governance_overhead_ratio_anomaly",
      "gate_high_frequency_false_positive",
      "role_without_independent_evidence",
      "registry_empty_or_duplicate_view",
      "context_oversized_low_utilization",
      "repeated_architecture_challenge",
      "profile_frequent_manual_deescalation",
      "profile_frequent_inflight_escalation",
    ]);
    expect(Object.keys(SELF_IMPROVEMENT_SIGNAL_PRD_LABELS).length).toBe(8);
    expect(SELF_IMPROVEMENT_SIGNAL_PRD_LABELS.governance_overhead_ratio_anomaly).toBe(
      "Governance Overhead Ratio 长期异常",
    );
    expect(SELF_IMPROVEMENT_SIGNAL_PRD_LABELS.gate_high_frequency_false_positive).toBe("某 Gate 高频产生误报");
    expect(SELF_IMPROVEMENT_SIGNAL_PRD_LABELS.profile_frequent_manual_deescalation).toBe(
      "Profile 经常被人工降级，说明 Router 过度保守",
    );
    expect(SELF_IMPROVEMENT_SIGNAL_PRD_LABELS.profile_frequent_inflight_escalation).toBe(
      "Profile 经常在开发中升级，说明 Triage 过度乐观",
    );
  });

  it("§55.1 十六机器键 = 八能力表 leading+lagging 键全集（一致性）", () => {
    const rowKeys = CAPABILITY_OUTCOME_METRICS.flatMap((row) => [row.leadingKey, row.laggingKey]);
    expect(rowKeys).toHaveLength(16);
    expect([...rowKeys].sort()).toEqual([...CAPABILITY_OUTCOME_METRIC_KEY_VALUES].sort());
  });

  it("词形常量字面（POMASTER_SELF_IMPROVEMENT_CANDIDATE / DETECTED_BY_TOOL_SIGNAL）", () => {
    expect(POMASTER_SELF_IMPROVEMENT_CANDIDATE).toBe("POMASTER_SELF_IMPROVEMENT_CANDIDATE");
    expect(DETECTED_BY_TOOL_SIGNAL).toBe("tool_signal");
  });
});

// ============================================================
// registerControlBand（15-production-band schema 契约）
// ============================================================

describe("registerControlBand（15-production-band schema 契约）", () => {
  it("happy path：产物过 15-production-band ajv 校验 + readControlBand round-trip", () => {
    const band = registerControlBand(root, bandInput() as never);
    expect(validateBand(band)).toBe(true);
    const loaded = readControlBand(root, "carline-list-p99-latency");
    expect(loaded).toEqual(band);
    expect([...listControlBands(root)]).toEqual([band]);
  });

  it("15-production-band 已注册进 allSchemas（18 份聚合，P34 增量 14→15；W1-C 增量 15→16；VB-PR1 增量 16→17；W1-D2 增量 17→18）", () => {
    expect(productionBandSchema.$id).toBe(
      "https://pomaster.dev/schemas/production-band/v1-draft.json",
    );
    expect(allSchemas.productionBand).toBe(productionBandSchema);
    expect(Object.keys(allSchemas).length).toBe(18);
  });

  it("同 id 重复登记 = SCHEMA_INVALID（band 是可寻址定义，禁静默覆盖）", () => {
    registerControlBand(root, bandInput() as never);
    const error = (() => {
      try {
        registerControlBand(root, bandInput() as never);
        return null;
      } catch (caught) {
        return caught;
      }
    })();
    expect(errorCode(error)).toBe("SCHEMA_INVALID");
  });

  it("id slug 词形非法 / capability_ref 非 governed id / source 词表外 / metricName 词形非法 / title 空", () => {
    expect(caughtCode(() => { registerControlBand(root, bandInput({ id: "Bad_Slug!" }) as never); })).toBe("SCHEMA_INVALID");
    expect(caughtCode(() => { registerControlBand(root, bandInput({ capabilityRef: "capability.carline" }) as never); })).toBe("FATAL_ID_GRAMMAR");
    expect(caughtCode(() => { registerControlBand(root, bandInput({ capabilityRef: "NOT_A_PREFIX.X" }) as never); })).toBe("FATAL_UNKNOWN_PREFIX");
    expect(caughtCode(() => { registerControlBand(root, bandInput({ source: "vibe" }) as never); })).toBe("VOCAB_INVALID_VALUE");
    expect(caughtCode(() => { registerControlBand(root, bandInput({ metricName: "P99 Latency" }) as never); })).toBe("SCHEMA_INVALID");
    expect(caughtCode(() => { registerControlBand(root, bandInput({ title: "   " }) as never); })).toBe("SCHEMA_INVALID");
  });

  it("谓词完整性：between 失配对 / 下界>上界 / 单阈值算子携带 threshold_max / 非有限阈值 全拒绝", () => {
    expect(caughtCode(() => { registerControlBand(root, bandInput({ predicate: { operator: "between", threshold: 10 } }) as never); })).toBe("SCHEMA_INVALID");
    expect(caughtCode(() => { registerControlBand(root, bandInput({ predicate: { operator: "between", threshold: 30, threshold_max: 20 } }) as never); })).toBe("SCHEMA_INVALID");
    expect(caughtCode(() => { registerControlBand(root, bandInput({ predicate: { operator: "gt", threshold: 10, threshold_max: 20 } }) as never); })).toBe("SCHEMA_INVALID");
    expect(caughtCode(() => { registerControlBand(root, bandInput({ predicate: { operator: "gt", threshold: Number.NaN } }) as never); })).toBe("SCHEMA_INVALID");
    expect(caughtCode(() => { registerControlBand(root, bandInput({ predicate: { operator: "gt", threshold: Number.POSITIVE_INFINITY } }) as never); })).toBe("SCHEMA_INVALID");
  });

  it("window 声明位：null 缺省合法；0 拒绝", () => {
    expect(registerControlBand(root, bandInput({ window: null }) as never).window).toBeNull();
    expect(caughtCode(() => { registerControlBand(root, bandInput({ window: 0 }) as never); })).toBe("SCHEMA_INVALID");
  });

  it("空 root = 空集合法态（listControlBands 显式空数组）", () => {
    expect(listControlBands(root)).toEqual([]);
  });
});

// ============================================================
// evaluateControlBand 三态（Deterministic Detection 纯函数——§95.2 封条）
// ============================================================

describe("evaluateControlBand 三态全分支（§95.2 Deterministic Detection）", () => {
  const bandOf = (predicate: Record<string, unknown>, metricName = "m"): never =>
    ({
      id: "b",
      title: "b",
      capability_ref: "PAGE.DASHBOARD",
      phase: "IN_PRODUCTION",
      source: "metric",
      metric_name: metricName,
      predicate,
      window: null,
    }) as never;
  const obs = (value: number, metricName = "m"): BandObservation => ({ metric_name: metricName, value, observed_at_seq: 3 });

  it("gt：超阈值击穿；恰在阈值不击穿（严格大于）", () => {
    const band = bandOf({ operator: "gt", threshold: 800 });
    expect(evaluateControlBand(band, obs(800)).status).toBe("OK");
    expect(evaluateControlBand(band, obs(799.9)).status).toBe("OK");
    expect(evaluateControlBand(band, obs(800.1)).status).toBe("BREACHED");
  });

  it("gte：恰在阈值即击穿（含等号）", () => {
    const band = bandOf({ operator: "gte", threshold: 800 });
    expect(evaluateControlBand(band, obs(800)).status).toBe("BREACHED");
    expect(evaluateControlBand(band, obs(799)).status).toBe("OK");
  });

  it("lt：破下界击穿；恰在阈值不击穿（严格小于）", () => {
    const band = bandOf({ operator: "lt", threshold: 0.25 });
    expect(evaluateControlBand(band, obs(0.25)).status).toBe("OK");
    expect(evaluateControlBand(band, obs(0.26)).status).toBe("OK");
    expect(evaluateControlBand(band, obs(0.24)).status).toBe("BREACHED");
  });

  it("lte：恰在阈值即击穿（含等号）", () => {
    const band = bandOf({ operator: "lte", threshold: 0.25 });
    expect(evaluateControlBand(band, obs(0.25)).status).toBe("BREACHED");
    expect(evaluateControlBand(band, obs(0.3)).status).toBe("OK");
  });

  it("between：闭区间健康带（含端点 OK；带外两侧 BREACHED）", () => {
    const band = bandOf({ operator: "between", threshold: 10, threshold_max: 20 });
    expect(evaluateControlBand(band, obs(10)).status).toBe("OK");
    expect(evaluateControlBand(band, obs(20)).status).toBe("OK");
    expect(evaluateControlBand(band, obs(15)).status).toBe("OK");
    expect(evaluateControlBand(band, obs(9.99)).status).toBe("BREACHED");
    expect(evaluateControlBand(band, obs(20.01)).status).toBe("BREACHED");
  });

  it("指标名不匹配 = NOT_EVALUABLE（禁就近匹配；detail 携带缺席原因码）", () => {
    const band = bandOf({ operator: "gt", threshold: 1 });
    const evaluation = evaluateControlBand(band, obs(5, "other.metric"));
    expect(evaluation.status).toBe("NOT_EVALUABLE");
    expect(evaluation.breach).toBeNull();
    expect(evaluation.detail).toContain("METRIC_NAME_MISMATCH");
  });

  it("值非有限数值（NaN/Infinity/非 number）= NOT_EVALUABLE 显式非 OK", () => {
    const band = bandOf({ operator: "gt", threshold: 1 });
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const evaluation = evaluateControlBand(band, obs(value));
      expect(evaluation.status).toBe("NOT_EVALUABLE");
      expect(evaluation.detail).toContain("VALUE_NOT_FINITE_NUMBER");
    }
    const nonNumber = evaluateControlBand(band, obs("950" as unknown as number));
    expect(nonNumber.status).toBe("NOT_EVALUABLE");
  });

  it("谓词损坏（算子词表外/阈值非有限/between 失配对/单阈值带 max/下界>上界）= NOT_EVALUABLE 不抛不崩", () => {
    const cases: readonly Record<string, unknown>[] = [
      { operator: "looks_wrong", threshold: 1 },
      { operator: "gt", threshold: Number.NaN },
      { operator: "between", threshold: 1 },
      { operator: "gt", threshold: 1, threshold_max: 5 },
      { operator: "between", threshold: 30, threshold_max: 20 },
    ];
    for (const predicate of cases) {
      const evaluation = evaluateControlBand(bandOf(predicate as never), obs(5));
      expect(evaluation.status).toBe("NOT_EVALUABLE");
      expect(evaluation.detail).toContain("PREDICATE_CORRUPT");
      expect(evaluation.breach).toBeNull();
    }
  });

  it("BREACHED 产 Evidence：detected_by 恒 tool_signal（C5 判定来自工具信号）+ 内容寻址 id", () => {
    const band = bandOf({ operator: "gt", threshold: 800 });
    const evaluation = evaluateControlBand(band, obs(950));
    expect(evaluation.status).toBe("BREACHED");
    expect(evaluation.breach).not.toBeNull();
    const breach = evaluation.breach as NonNullable<typeof evaluation.breach>;
    expect(breach.detected_by).toBe("tool_signal");
    expect(breach.status).toBe("BREACHED");
    expect(breach.band_id).toBe("b");
    expect(breach.capability_ref).toBe("PAGE.DASHBOARD");
    expect(breach.metric_name).toBe("m");
    expect(breach.value).toBe(950);
    expect(breach.observed_at_seq).toBe(3);
    expect(breach.id).toMatch(/^PBR-[0-9a-f]{12}$/);
    expect(breach.observation_ref).toMatch(/^POB-[0-9a-f]{12}$/);
  });

  it("纯函数确定性：同输入两次判定 deep-equal（A4 同输入重放字节稳定）", () => {
    const band = bandOf({ operator: "gt", threshold: 800 });
    const a = evaluateControlBand(band, obs(950));
    const b = evaluateControlBand(band, obs(950));
    expect(a).toEqual(b);
  });
});

// ============================================================
// recordObservation（observation 台账 + breach 同批原子落盘）
// ============================================================

describe("recordObservation（observation 台账）", () => {
  it("BREACHED：observation + breach 两文件同批落盘（detected_by=tool_signal 落盘字面）", () => {
    registerControlBand(root, bandInput() as never);
    const record = recordObservation(root, "carline-list-p99-latency", observationInput());
    expect(record.evaluated_status).toBe("BREACHED");
    expect(record.breach_ref).toMatch(/^PBR-[0-9a-f]{12}$/);
    expect(existsSync(join(root, ".pomaster", "production", "observations", `${record.id}.json`))).toBe(true);
    const breach = readBreach(root, record.breach_ref as string);
    expect(breach.detected_by).toBe("tool_signal");
    expect(breach.band_id).toBe("carline-list-p99-latency");
    expect(listBreaches(root)).toHaveLength(1);
    expect(listObservations(root)).toHaveLength(1);
  });

  it("OK：无 breach 文件；breach_ref=null 显式", () => {
    registerControlBand(root, bandInput() as never);
    const record = recordObservation(root, "carline-list-p99-latency", observationInput({ value: 100 }));
    expect(record.evaluated_status).toBe("OK");
    expect(record.breach_ref).toBeNull();
    expect(listBreaches(root)).toHaveLength(0);
    expect(listObservations(root)).toHaveLength(1);
  });

  it("NOT_EVALUABLE（指标名不匹配）同样入账显式呈现（禁静默丢弃）且不产 breach", () => {
    registerControlBand(root, bandInput() as never);
    const record = recordObservation(
      root,
      "carline-list-p99-latency",
      observationInput({ metric_name: "wrong.metric" }),
    );
    expect(record.evaluated_status).toBe("NOT_EVALUABLE");
    expect(record.breach_ref).toBeNull();
    expect(listBreaches(root)).toHaveLength(0);
    expect(listObservations(root)).toHaveLength(1);
  });

  it("同观测重复落账 = SCHEMA_INVALID（内容寻址 id 撞册——幂等重放显式检出）", () => {
    registerControlBand(root, bandInput() as never);
    recordObservation(root, "carline-list-p99-latency", observationInput());
    expect(caughtCode(() => { recordObservation(root, "carline-list-p99-latency", observationInput()); })).toBe("SCHEMA_INVALID");
  });

  it("非有限值落账拒绝（NaN 不可 JSON round-trip；NOT_EVALUABLE 判定走纯函数面）", () => {
    registerControlBand(root, bandInput() as never);
    expect(caughtCode(() => { recordObservation(root, "carline-list-p99-latency", observationInput({ value: Number.NaN })); })).toBe("SCHEMA_INVALID");
  });

  it("band 缺席 = OBJECT_NOT_FOUND", () => {
    expect(caughtCode(() => { recordObservation(root, "no-such-band", observationInput()); })).toBe("OBJECT_NOT_FOUND");
  });

  it("band/observation 落点纪律：无 store 时零 .pomaster/state 触碰（只写 production 子树）", () => {
    const bare = makeRoot();
    registerControlBand(bare, bandInput() as never);
    recordObservation(bare, "carline-list-p99-latency", observationInput());
    expect(existsSync(join(bare, ".pomaster", "state"))).toBe(false);
    expect(existsSync(join(bare, ".pomaster", "production", "bands"))).toBe(true);
    expect(existsSync(join(bare, ".pomaster", "production", "observations"))).toBe(true);
  });
});

// ============================================================
// challengeFromBreach（§95.3 CURRENT→CHALLENGED——applyTransaction 前置核实）
// ============================================================

describe("challengeFromBreach（§95.3 State Challenge 零旁路）", () => {
  it("happy 链：change 轴 STABLE→CHALLENGED 经 applyTransaction 落 index + challenge 留痕", async () => {
    await seedCurrentObject();
    const breachRef = await seedBreachChain();
    const result = await challengeFromBreach(store, "carline-list-p99-latency", breachRef);
    expect(result.transaction.changedObjectIds).toContain("PAGE.DASHBOARD");
    const index = await loadTruthIndex(store);
    const row = index.objects.find((candidate) => candidate.id === "PAGE.DASHBOARD");
    expect(row?.axes.change).toBe("CHALLENGED");
    expect(row?.axes.lifecycle).toBe("CURRENT");
    expect(result.challenge.applied_seq).toBe(result.transaction.appliedSeq);
    expect(result.challenge.authority_ref).toBe(breachRef);
    expect(result.challenge.from_change).toBe("STABLE");
    expect(result.challenge.to_change).toBe("CHALLENGED");
    expect(listChallenges(root)).toHaveLength(1);
  });

  it("LOCKED 对象：authorityRef 承载 breach evidence 引用满足 store L1240 既有前置", async () => {
    await seedCurrentObject({ confidence: "LOCKED", change: "STABLE" });
    const breachRef = await seedBreachChain();
    const result = await challengeFromBreach(store, "carline-list-p99-latency", breachRef);
    expect(result.transaction.shortCircuited).toBe(false);
    const index = await loadTruthIndex(store);
    expect(index.objects.find((candidate) => candidate.id === "PAGE.DASHBOARD")?.axes.change).toBe("CHALLENGED");
  });

  it("band 缺席 / breach 缺席 = OBJECT_NOT_FOUND（无 evidence 显式拒绝）", async () => {
    expect(await caughtCodeAsync(() => challengeFromBreach(store, "no-band", "PBR-000000000000"))).toBe("OBJECT_NOT_FOUND");
    registerControlBand(root, bandInput() as never);
    expect(await caughtCodeAsync(() => challengeFromBreach(store, "carline-list-p99-latency", "PBR-000000000000"))).toBe("OBJECT_NOT_FOUND");
  });

  it("breach 属其他 band = SCHEMA_INVALID（Detection→Evidence→Challenge 链序）", async () => {
    registerControlBand(root, bandInput() as never);
    registerControlBand(root, bandInput({ id: "other-band", metricName: "other.metric" }) as never);
    const breachRef = recordObservation(root, "carline-list-p99-latency", observationInput()).breach_ref as string;
    expect(await caughtCodeAsync(() => challengeFromBreach(store, "other-band", breachRef))).toBe("SCHEMA_INVALID");
  });

  it("目标对象不在册 = OBJECT_NOT_FOUND（先 upsert 再 challenge）", async () => {
    registerControlBand(root, bandInput({ capabilityRef: "CAPABILITY.GHOST.OBJ" }) as never);
    const breachRef = recordObservation(root, "carline-list-p99-latency", observationInput()).breach_ref as string;
    expect(await caughtCodeAsync(() => challengeFromBreach(store, "carline-list-p99-latency", breachRef))).toBe("OBJECT_NOT_FOUND");
  });

  it("非 CURRENT 对象 = TRANSITION_ILLEGAL（§95.3 链头前置：Capability=CURRENT）", async () => {
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: pageEnvelope({
            axes: { lifecycle: "PROPOSED", confidence: "EXPERIMENTAL", evidence: "PLANNED", change: "STABLE" },
          }) as never,
        },
      ],
    });
    const breachRef = await seedBreachChain();
    expect(await caughtCodeAsync(() => challengeFromBreach(store, "carline-list-p99-latency", breachRef))).toBe("TRANSITION_ILLEGAL");
  });

  it("重复 challenge = TRANSITION_ILLEGAL（change 已 CHALLENGED；既有留痕指路）", async () => {
    await seedCurrentObject();
    const breachRef = await seedBreachChain({ challenge: true });
    const error = await caughtError(() => challengeFromBreach(store, "carline-list-p99-latency", breachRef));
    expect(errorCode(error)).toBe("TRANSITION_ILLEGAL");
    expect(error instanceof GovernanceError && error.message.includes("PCH-")).toBe(true);
  });

  it("MIGRATING 对象 = TRANSITION_ILLEGAL（迁移中不接受新挑战）", async () => {
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: pageEnvelope({
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "MIGRATING" },
            permitsActive: ["PERMIT.MIG_034"],
          }) as never,
        },
      ],
    });
    const breachRef = await seedBreachChain();
    expect(await caughtCodeAsync(() => challengeFromBreach(store, "carline-list-p99-latency", breachRef))).toBe("TRANSITION_ILLEGAL");
  });
});

// ============================================================
// recordDiagnosis（Agent Diagnosis 消费位——breach evidence 前置封条）
// ============================================================

describe("recordDiagnosis（§95.2 链序封条 + §95.3 三分）", () => {
  it("happy 链：BREACHED→challenge→diagnosis 入账（kind/notes/actor 留痕）", async () => {
    await seedCurrentObject();
    const breachRef = await seedBreachChain({ challenge: true });
    const challenges = listChallenges(root);
    const record = recordDiagnosis(root, challenges[0]?.id as string, {
      kind: "IMPLEMENTATION_ISSUE",
      notes: "p99 超标根因：列表接口未走缓存（实现问题非架构问题）",
      diagnosedBy: AGENT,
    });
    expect(record.kind).toBe("IMPLEMENTATION_ISSUE");
    expect(record.breach_ref).toBe(breachRef);
    expect(record.challenge_ref).toBe(challenges[0]?.id);
    expect(record.band_id).toBe("carline-list-p99-latency");
    expect(record.capability_ref).toBe("PAGE.DASHBOARD");
    expect(record.diagnosed_by.actor).toBe(AGENT.actor);
    expect(listDiagnoses(root)).toHaveLength(1);
  });

  it("challenge 不在册 = DIAGNOSIS_WITHOUT_BREACH_EVIDENCE（结构性拒绝——无检测在先诊断不可入账）", () => {
    expect(caughtCode(() => { recordDiagnosis(root, "PCH-000000000000", { kind: "CONFIG_ISSUE", notes: "x", diagnosedBy: AGENT }); })).toBe("DIAGNOSIS_WITHOUT_BREACH_EVIDENCE");
  });

  it("breach evidence 缺席（半账）= DIAGNOSIS_WITHOUT_BREACH_EVIDENCE", async () => {
    await seedCurrentObject();
    const breachRef = await seedBreachChain({ challenge: true });
    const challengeId = listChallenges(root)[0]?.id as string;
    // 手删 breach 文件制造半账（模拟台账损坏）——diagnosis 消费位必须 fail-closed。
    const breachPath = join(root, ".pomaster", "production", "breaches", `${breachRef}.json`);
    expect(existsSync(breachPath)).toBe(true);
    (await import("node:fs")).rmSync(breachPath);
    expect(caughtCode(() => { recordDiagnosis(root, challengeId, { kind: "CONFIG_ISSUE", notes: "x", diagnosedBy: AGENT }); })).toBe("DIAGNOSIS_WITHOUT_BREACH_EVIDENCE");
  });

  it("kind 词表外 = VOCAB_INVALID_VALUE；notes 空 = SCHEMA_INVALID", async () => {
    await seedCurrentObject();
    await seedBreachChain({ challenge: true });
    const challengeId = listChallenges(root)[0]?.id as string;
    expect(caughtCode(() => { recordDiagnosis(root, challengeId, { kind: "VIBE_CHECK" as never, notes: "x", diagnosedBy: AGENT }); })).toBe("VOCAB_INVALID_VALUE");
    expect(caughtCode(() => { recordDiagnosis(root, challengeId, { kind: "CONFIG_ISSUE", notes: "  ", diagnosedBy: AGENT }); })).toBe("SCHEMA_INVALID");
  });

  it("同内容重复诊断 = SCHEMA_INVALID（内容寻址撞册）", async () => {
    await seedCurrentObject();
    await seedBreachChain({ challenge: true });
    const challengeId = listChallenges(root)[0]?.id as string;
    recordDiagnosis(root, challengeId, { kind: "ARCHITECTURE_EVOLUTION", notes: "need cache layer", diagnosedBy: AGENT });
    expect(caughtCode(() => { recordDiagnosis(root, challengeId, { kind: "ARCHITECTURE_EVOLUTION", notes: "need cache layer", diagnosedBy: AGENT }); })).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// computeCapabilityOutcomeMetrics（§55.1 指标挂钩既有 gate 台账）
// ============================================================

describe("computeCapabilityOutcomeMetrics（§55.1 Leading/Lagging）", () => {
  it("八行三列逐字（PRD L3583-3592 表列原文）", () => {
    const report = computeCapabilityOutcomeMetrics(root);
    expect(report.rows.map((row) => [row.capability, row.leading, row.lagging])).toEqual([
      ["Brainstorm", "Change 收敛耗时", "开发中需求返工率"],
      ["Research", "高风险 Unknown 消减率", "技术选型返工率"],
      ["Context Projection", "Context 命中率 / 冗余率", "Agent 越界/误改率"],
      ["Governance Router", "Profile 首次命中率", "Governance Overhead"],
      ["Architecture Gate", "开发前拦截数", "架构返工/回滚率"],
      ["Knowledge Retrieval", "Relevant Knowledge 命中率", "同类 Bug 重复率"],
      ["Gauntlet", "First-pass Pass Rate", "Production Change Failure Rate"],
      ["Reconciliation", "Drift 发现率", "跨 Session State 错误率"],
    ]);
  });

  it("空台账：十六指标全 NOT_MEASURABLE_YET（value=null + reason 非空——绝不冒充数值）", () => {
    const report = computeCapabilityOutcomeMetrics(root);
    expect(report.runsScanned).toBe(0);
    for (const row of report.rows) {
      for (const metric of [row.leadingMetric, row.laggingMetric]) {
        expect(metric.status).toBe("NOT_MEASURABLE_YET");
        expect(metric.value).toBeNull();
        expect(metric.reason).not.toBeNull();
        expect(metric.reason?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("Gauntlet first-pass pass rate：按 subject 分组首次运行 passed 占比（后续运行不入分母）", () => {
    seedGateRun("GRN-100", "GAUNTLET", "failed", { subjectId: "PAGE.A", ranAtSeq: 1 });
    seedGateRun("GRN-101", "GAUNTLET", "passed", { subjectId: "PAGE.A", ranAtSeq: 2 }); // 二次修复，不入 first-pass
    seedGateRun("GRN-102", "GAUNTLET", "passed", { subjectId: "PAGE.B", ranAtSeq: 3 });
    const report = computeCapabilityOutcomeMetrics(root);
    const gauntletRow = report.rows.find((row) => row.capability === "Gauntlet");
    const leading = gauntletRow?.leadingMetric;
    expect(leading?.status).toBe("MEASURED");
    expect(leading?.value).toBe(0.5);
    expect(leading?.numerator).toBe(1);
    expect(leading?.denominator).toBe(2);
    expect(leading?.basis).toContain("GAUNTLET");
  });

  it("fixture 隔离：TEST.* / is_fixture 记录不入生产指标分母（Q3）", () => {
    seedGateRun("GRN-200", "GAUNTLET", "failed", { subjectId: "PAGE.A", ranAtSeq: 1 });
    seedGateRun("GRN-201", "GAUNTLET", "passed", { subjectId: "TEST.FIX_A", isFixture: true, ranAtSeq: 2 });
    const report = computeCapabilityOutcomeMetrics(root);
    const leading = report.rows.find((row) => row.capability === "Gauntlet")?.leadingMetric;
    expect(leading?.status).toBe("MEASURED");
    expect(leading?.value).toBe(0);
    expect(leading?.denominator).toBe(1); // 仅 PAGE.A（fixture 剔除）
  });

  it("Architecture Gate 开发前拦截数：ARCHITECTURE* verdict∈{failed,blocked} 计数", () => {
    seedGateRun("GRN-300", "ARCHITECTURE", "failed", { ranAtSeq: 1 });
    seedGateRun("GRN-301", "ARCHITECTURE", "blocked", { ranAtSeq: 2 });
    seedGateRun("GRN-302", "ARCHITECTURE", "passed", { ranAtSeq: 3 });
    seedGateRun("GRN-303", "LINT", "failed", { ranAtSeq: 4 }); // 非 ARCHITECTURE 门不计
    const report = computeCapabilityOutcomeMetrics(root);
    const archRow = report.rows.find((row) => row.capability === "Architecture Gate");
    expect(archRow?.leadingMetric.status).toBe("MEASURED");
    expect(archRow?.leadingMetric.value).toBe(2);
    expect(archRow?.laggingMetric.status).toBe("NOT_MEASURABLE_YET");
  });

  it("可算面不冒充：有 GAUNTLET 台账也不改变缺信号源指标的 NOT_MEASURABLE_YET", () => {
    seedGateRun("GRN-400", "GAUNTLET", "passed", { subjectId: "PAGE.A", ranAtSeq: 1 });
    const report = computeCapabilityOutcomeMetrics(root);
    const lagging = report.rows.find((row) => row.capability === "Gauntlet")?.laggingMetric;
    expect(lagging?.key).toBe("production_change_failure_rate");
    expect(lagging?.status).toBe("NOT_MEASURABLE_YET");
    expect(lagging?.value).toBeNull();
  });

  it("台账局部损坏显式计数（runsUnreadable）不静默也不中断", () => {
    seedGateRun("GRN-500", "GAUNTLET", "passed", { subjectId: "PAGE.A", ranAtSeq: 1 });
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    writeFileSync(`${runsDir}/GRN-501.json`, "{broken", "utf8");
    const report = computeCapabilityOutcomeMetrics(root);
    expect(report.runsScanned).toBe(1); // 解析成功分母（损坏文件不计入）
    expect(report.runsUnreadable).toBe(1); // 损坏显式计数（不静默跳过）
    expect(report.rows.find((row) => row.capability === "Gauntlet")?.leadingMetric.value).toBe(1);
  });

  it("§55.1 注记位：METRICS_CAVEAT 逐字随报告输出（风险提示不替代专业判断）", () => {
    const report = computeCapabilityOutcomeMetrics(root);
    expect(report.caveat).toBe(METRICS_CAVEAT);
    expect(METRICS_CAVEAT).toBe("注意：Metrics 用于风险提示，不直接替代专业判断。");
  });
});

// ============================================================
// registerSelfImprovementCandidate（§90.4 恒 CANDIDATE 呈报态）
// ============================================================

describe("registerSelfImprovementCandidate（§90.4 八信号登记）", () => {
  it("happy：产物 kind 恒 POMASTER_SELF_IMPROVEMENT_CANDIDATE + signal_label 逐字镜像", () => {
    const record = registerSelfImprovementCandidate(root, {
      signal: "gate_high_frequency_false_positive",
      note: "CONTENT_TRUTH 连续 5 轮误报",
      reportedBy: AGENT,
      evidenceRefs: ["GRN-0001", "GRN-0002"],
    });
    expect(record.kind).toBe("POMASTER_SELF_IMPROVEMENT_CANDIDATE");
    expect(record.signal_label).toBe("某 Gate 高频产生误报");
    expect(record.evidence_refs).toEqual(["GRN-0001", "GRN-0002"]);
    expect(listSelfImprovementCandidates(root)).toEqual([record]);
  });

  it("signal 词表外 / note 空 / 重复登记全显式拒绝", () => {
    expect(caughtCode(() => { registerSelfImprovementCandidate(root, { signal: "vibe" as never, note: "x", reportedBy: AGENT }); })).toBe("VOCAB_INVALID_VALUE");
    registerSelfImprovementCandidate(root, { signal: "repeated_architecture_challenge", note: "ACH-001 重复三次", reportedBy: AGENT });
    expect(caughtCode(() => { registerSelfImprovementCandidate(root, { signal: "repeated_architecture_challenge", note: "ACH-001 重复三次", reportedBy: AGENT }); })).toBe("SCHEMA_INVALID");
  });

  it("§90.4 封条：登记后 production 之外全树字节零变（无 Router/Profile/Gate/state 写通路）", async () => {
    await seedCurrentObject();
    const before = treeHashExcludingProduction(root);
    registerSelfImprovementCandidate(root, {
      signal: "profile_frequent_manual_deescalation",
      note: "STRICT→LIGHT 人工降级 4/5 次",
      reportedBy: AGENT,
    });
    const after = treeHashExcludingProduction(root);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [path, hash] of before) {
      expect(after.get(path)).toBe(hash);
    }
    const journal = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8").trim();
    expect(journal.split("\n").length).toBe(1); // 仅 seedCurrentObject 的一条 TX_APPLIED；登记零 journal 事件
  });

  it("模块导出面断言：production 模块无任何 Router/Profile/Gate 应用通路函数（导出名封闭集）", () => {
    const exportedNames = Object.keys(productionModule).sort();
    expect(exportedNames).toEqual([
      "CAPABILITY_OUTCOME_METRICS",
      "METRICS_CAVEAT",
      "PRODUCTION_BANDS_RELATIVE",
      "PRODUCTION_BREACHES_RELATIVE",
      "PRODUCTION_CHALLENGES_RELATIVE",
      "PRODUCTION_DIAGNOSES_RELATIVE",
      "PRODUCTION_OBSERVATIONS_RELATIVE",
      "PRODUCTION_RELATIVE",
      "PRODUCTION_SELF_IMPROVEMENT_RELATIVE",
      "challengeFromBreach",
      "computeCapabilityOutcomeMetrics",
      "evaluateControlBand",
      "listBreaches",
      "listChallenges",
      "listControlBands",
      "listDiagnoses",
      "listObservations",
      "listSelfImprovementCandidates",
      "readBreach",
      "readControlBand",
      "recordDiagnosis",
      "recordObservation",
      "registerControlBand",
      "registerSelfImprovementCandidate",
    ]);
    // 封条词面：任何导出名都不得携带「应用/配置/改写 Router·Profile」语义词形。
    const mutatorPattern = /^(apply|set|configure|install|mutate|promote|demote|escalate|downgrade|upgrade|writeProfile|setRouter)/;
    for (const name of exportedNames) {
      expect(mutatorPattern.test(name)).toBe(false);
    }
  });
});

// ============================================================
// 装载面 fail-closed（手改台账显式拒绝）
// ============================================================

describe("装载面 fail-closed（判卷不信任落盘字节）", () => {
  it("手改 band phase=IN_DEV → SCHEMA_INVALID（band 级收窄恒 IN_PRODUCTION）", () => {
    registerControlBand(root, bandInput() as never);
    const path = join(root, ".pomaster", "production", "bands", "carline-list-p99-latency.json");
    const handEdited = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    handEdited.phase = "IN_DEV";
    writeFileSync(path, `${JSON.stringify(handEdited, null, 2)}\n`, "utf8");
    expect(caughtCode(() => { readControlBand(root, "carline-list-p99-latency"); })).toBe("SCHEMA_INVALID");
  });

  it("手改 band 谓词（between 下界>上界）→ 装载面 SCHEMA_INVALID", () => {
    registerControlBand(root, bandInput({ predicate: { operator: "between", threshold: 10, threshold_max: 20 } }) as never);
    const path = join(root, ".pomaster", "production", "bands", "carline-list-p99-latency.json");
    const handEdited = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    handEdited.predicate = { operator: "between", threshold: 30, threshold_max: 20 };
    writeFileSync(path, `${JSON.stringify(handEdited, null, 2)}\n`, "utf8");
    expect(caughtCode(() => { readControlBand(root, "carline-list-p99-latency"); })).toBe("SCHEMA_INVALID");
  });

  it("手改 breach detected_by → SCHEMA_INVALID（detected_by 恒 tool_signal 字面）", async () => {
    registerControlBand(root, bandInput() as never);
    const breachRef = recordObservation(root, "carline-list-p99-latency", observationInput()).breach_ref as string;
    const path = join(root, ".pomaster", "production", "breaches", `${breachRef}.json`);
    const handEdited = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    handEdited.detected_by = "llm_self_report";
    writeFileSync(path, `${JSON.stringify(handEdited, null, 2)}\n`, "utf8");
    expect(caughtCode(() => { readBreach(root, breachRef); })).toBe("SCHEMA_INVALID");
  });

  it("BREACHED observation 缺 breach_ref（半账手改）→ SCHEMA_INVALID", () => {
    registerControlBand(root, bandInput() as never);
    const record = recordObservation(root, "carline-list-p99-latency", observationInput());
    const path = join(root, ".pomaster", "production", "observations", `${record.id}.json`);
    const handEdited = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    handEdited.breach_ref = null;
    writeFileSync(path, `${JSON.stringify(handEdited, null, 2)}\n`, "utf8");
    expect(caughtCode(() => { listObservations(root); })).toBe("SCHEMA_INVALID");
  });

  it("手改 candidate kind / signal_label → SCHEMA_INVALID（呈报位词形常量 + 原文镜像派生）", () => {
    const record = registerSelfImprovementCandidate(root, {
      signal: "context_oversized_low_utilization",
      note: "ctx 200k/命中 3%",
      reportedBy: AGENT,
    });
    const path = join(root, ".pomaster", "production", "self-improvement", `${record.id}.json`);
    const kindEdit = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    kindEdit.kind = "APPLIED_CHANGE";
    writeFileSync(path, `${JSON.stringify(kindEdit, null, 2)}\n`, "utf8");
    expect(caughtCode(() => { listSelfImprovementCandidates(root); })).toBe("SCHEMA_INVALID");
    const labelEdit = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    void labelEdit;
    // kind 已损坏的文件先恢复再改 label（逐面独立断言）
    delete (kindEdit as Record<string, unknown>).__restored;
    const restored = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    restored.kind = POMASTER_SELF_IMPROVEMENT_CANDIDATE;
    restored.signal_label = "自创标签";
    writeFileSync(path, `${JSON.stringify(restored, null, 2)}\n`, "utf8");
    expect(caughtCode(() => { listSelfImprovementCandidates(root); })).toBe("SCHEMA_INVALID");
  });

  it("手改 challenge 转移对 → SCHEMA_INVALID（§95.3 唯一合法边 STABLE→CHALLENGED）", async () => {
    await seedCurrentObject();
    await seedBreachChain({ challenge: true });
    const challengeId = listChallenges(root)[0]?.id as string;
    const path = join(root, ".pomaster", "production", "challenges", `${challengeId}.json`);
    const handEdited = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    handEdited.to_change = "STABLE";
    writeFileSync(path, `${JSON.stringify(handEdited, null, 2)}\n`, "utf8");
    expect(caughtCode(() => { listChallenges(root); })).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// 红队攻击面回归（P34 修复轮封条——1 MAJOR + 2 MINOR 得手面转回归）
// ============================================================

describe("红队攻击面回归（修复轮封条）", () => {
  it("A2d 封条：band 删档重登谓词放宽 → 旧 breach 驱动 challenge 被拒（陈旧证据不一致）", async () => {
    await seedCurrentObject();
    const breachRef = await seedBreachChain(); // breach 基于谓词 gt 800（值 950 击穿）
    // 文档许可路径删档重登：同 id、谓词放宽 gt 10000——950 在新谓词下根本不击穿。
    unlinkSync(join(root, ".pomaster", "production", "bands", "carline-list-p99-latency.json"));
    registerControlBand(
      root,
      bandInput({ predicate: { operator: "gt", threshold: 10000 } }) as never,
    );
    await expect(challengeFromBreach(store, "carline-list-p99-latency", breachRef)).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
    // challenge 未发生：对象 change 轴保持 STABLE、challenges 台账零新增。
    expect(listChallenges(root)).toHaveLength(0);
  });

  it("A2d 封条（跨对象变体）：重登改挂 capability_ref → 旧 breach 不得驱动他对象 challenge", async () => {
    await seedCurrentObject();
    const breachRef = await seedBreachChain();
    unlinkSync(join(root, ".pomaster", "production", "bands", "carline-list-p99-latency.json"));
    registerControlBand(
      root,
      bandInput({ capabilityRef: "PAGE.OTHER.PAGE" }) as never, // 词形合法但不在册
    );
    // 先撞定义一致性封条（capability_ref 错位在在册性检查之前拒绝）。
    await expect(challengeFromBreach(store, "carline-list-p99-latency", breachRef)).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
    expect(listChallenges(root)).toHaveLength(0);
  });

  it("A1c 封条：predicate 携带未知自由文本字段 → register/装载双入口拒绝（键闭集）", () => {
    expect(
      caughtCode(() =>
        registerControlBand(
          root,
          bandInput({ predicate: { operator: "gt", threshold: 800, looks_wrong: "用户觉得慢就算异常" } }) as never,
        ),
      ),
    ).toBe("SCHEMA_INVALID");
    // 手改已落盘 band 文件塞语义字段 → 装载面同样拒绝。
    registerControlBand(root, bandInput() as never);
    const path = join(root, ".pomaster", "production", "bands", "carline-list-p99-latency.json");
    const mutated = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    (mutated.predicate as Record<string, unknown>).criteria = "看起来不对劲";
    writeFileSync(path, `${JSON.stringify(mutated, null, 2)}\n`, "utf8");
    expect(caughtCode(() => readControlBand(root, "carline-list-p99-latency"))).toBe("SCHEMA_INVALID");
  });

  it("A5b 封条：直落 GRN 台账（无 journal 锚）不入 metrics 分母 + runsUnanchored 显式计数", () => {
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(runsDir, { recursive: true });
    // 红队原注水形态：10 份格式合法 GRN-90..99（ran_at_seq=999999 超前进序、无事务锚）。
    for (let i = 90; i <= 99; i += 1) {
      const record = {
        record_type: "run",
        grn: `GRN-${i}`,
        ran_at_seq: 999999,
        gate_result: {
          mode: "inline",
          result: {
            grn: `GRN-${i}`, gate: "GAUNTLET", gate_def: "POLICY.GATE.GAUNTLET@1.0.0",
            tool: "spec:inject", tool_version: "1.0.0", metric_dialect: "fixture:count",
            ran_at_seq: 999999, verdict: "passed", subject_id: "PAGE.FAKE", is_fixture: false,
            counts: { scanned: 1, applicable_scanned: 1, violations: 0, not_applicable: 0 },
            blindspot: { scanned: 1, produced: 1, escape_ratio: 0 },
            trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
            duration_ms: { self: 0, external: 0 },
          },
        },
      };
      writeFileSync(`${runsDir}/GRN-${i}.json`, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    }
    const report = computeCapabilityOutcomeMetrics(root);
    expect(report.runsScanned).toBe(0); // 注水文件全部不入分母
    expect(report.runsUnanchored).toBe(10); // 显式计数披露（非静默）
    const leading = report.rows.find((row) => row.capability === "Gauntlet")?.leadingMetric;
    expect(leading?.status).toBe("NOT_MEASURABLE_YET");
    expect(leading?.value).toBeNull();
    // 对照：带 journal 锚的真实产物镜像正常收录。
    seedGateRun("GRN-100", "GAUNTLET", "passed", { subjectId: "PAGE.A", ranAtSeq: 1 });
    const after = computeCapabilityOutcomeMetrics(root);
    expect(after.runsScanned).toBe(1);
    expect(after.runsUnanchored).toBe(10);
    expect(after.rows.find((row) => row.capability === "Gauntlet")?.leadingMetric.value).toBe(1);
  });
});
