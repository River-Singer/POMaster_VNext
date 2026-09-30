import { performance } from "node:perf_hooks";
import type { VerdictValue } from "@pomaster/schemas";
import type { DetectionResult, DetectorFacts, GateAdapter, GatePlan, GatePolicy, GateResultItemInput, GateResultRecord, GateScope, NormalizeContext, SpawnFn, ToolRunOutput } from "./adapter-types.js";
import { GateAdapterError, asGovernedId } from "./adapter-types.js";
import { OBSERVATION_CHANNEL_VALUES } from "@pomaster/kernel";
import { DEFAULT_RUN_TIMEOUT_MS, defaultSpawn } from "./build-adapter.js";
import { platformDetectorFacts } from "./detectors.js";
import { absenceRecord, assertCommonGates, capItems, toDenominatorRow } from "./normalize-common.js";
import type { SeamLegObservation } from "./seam-comparator.js";

export const CONTROL_DATA_FLOW_RUNTIME_GATE_NAME = "CONTROL_DATA_FLOW_RUNTIME";
export const CONTROL_DATA_FLOW_RUNTIME_GATE_DEF = "POLICY.GATE.CONTROL_DATA_FLOW_RUNTIME@0.1.0";
export const CONTROL_DATA_FLOW_RUNTIME_TOOL_ID = "gauntlet:control-data-flow-runtime";
export const CONTROL_DATA_FLOW_RUNTIME_TOOL_VERSION = "0.1.0";
export const CONTROL_DATA_FLOW_RUNTIME_METRIC_DIALECT = "ui:control_flow_runtime_trace";
export const CONTROL_DATA_FLOW_RUNTIME_FORMAT = "pomaster-control-data-flow-runtime-json";
export const CONTROL_DATA_FLOW_RUNTIME_PARSER_REF = "builtin.gauntlet-lite.control-data-flow-runtime/json-v1";
export const CONTROL_DATA_FLOW_RUNTIME_ADAPTER_REF = "builtin.gauntlet-lite.control-data-flow-runtime";

/** report schema 词形（v1=legacy；v2=W5 trace[] 词形——加性演进，v1 消费者兼容）。 */
export const CONTROL_DATA_FLOW_RUNTIME_REPORT_V1 = "pomaster.control-data-flow-runtime/v1";
export const CONTROL_DATA_FLOW_RUNTIME_REPORT_V2 = "pomaster.control-data-flow-runtime/v2";

/**
 * trace 段 stage 词表（W5 契约 §2 段序链：request→persist→re_read→mapping→visible
 * 不得乱序/缺段/串线——request_or_storage 合并键在段级拆分，API 接收未持久化、
 * 重读走错 scope、mapping 丢字段在段级可判）。
 */
export const CONTROL_DATA_FLOW_TRACE_STAGES = ["request", "persist", "re_read", "mapping", "visible"] as const;
export type ControlDataFlowTraceStage = (typeof CONTROL_DATA_FLOW_TRACE_STAGES)[number];

/**
 * trace 段闭合词形（W5 契约 §2）：七键闭包——之外拒绝。request_digest/readback_digest
 * 是内容寻址摘要（string|null）；visible_result 是 oracle 通道下的可见观察（boolean|null，
 * null=该段不可判）。身份对账（同 correlation/段序/digest 对账）归 normalize 判定面。
 */
export interface ControlDataFlowTraceSegment {
  readonly stage: ControlDataFlowTraceStage;
  readonly operation_id: string;
  readonly control_ref: string;
  readonly scenario_ref: string;
  readonly request_digest: string | null;
  readonly readback_digest: string | null;
  readonly visible_result: boolean | null;
  /**
   * 观察通道（裁定 7=B，2026-09-30；visible 段专用加性可选）：该段可见性结果由哪条
   * 通道观察（词表=kernel OBSERVATION_CHANNEL_VALUES api_list/api_detail/ui_surface）。
   * ui_surface 通道的义务满足还须报告 fixture_layer=real_browser + 执行账本浏览器
   * GRN 支撑（编排层义务判定消费——Node 沙箱报告不得自称 real_browser）。
   */
  readonly channel?: string;
}

export interface ControlDataFlowRuntimeReportV1 {
  readonly schema: typeof CONTROL_DATA_FLOW_RUNTIME_REPORT_V1;
  readonly task_ref: string;
  readonly static_control_ref: string;
  readonly side_effect: "READ_ONLY" | "INTERACTIVE_REVERSIBLE";
  readonly fixture: { readonly isolated: boolean; readonly ref: string | null };
  readonly cleanup: { readonly required: boolean; readonly attempted: boolean; readonly succeeded: boolean };
  readonly observations: {
    readonly control: boolean;
    readonly request_or_storage: boolean;
    readonly response_or_ack: boolean;
    readonly readback: boolean;
    readonly feedback: boolean;
    readonly error_recovery: boolean;
  };
  readonly correlation_id: string;
}

/**
 * report v2（W5 契约 §2 加性演进）：trace[] 段级因果链 + 可选 seam_observation
 * （mock/real 双腿观察——比较对象，非判卷真值）。v1 消费者兼容：v1 词形字段在
 * v2 全部保留（同义同形），解析层双词形识别。
 */
export interface ControlDataFlowRuntimeReportV2 extends Omit<ControlDataFlowRuntimeReportV1, "schema"> {
  readonly schema: typeof CONTROL_DATA_FLOW_RUNTIME_REPORT_V2;
  readonly trace: readonly ControlDataFlowTraceSegment[];
  readonly seam_observation?: SeamLegObservation;
  /**
   * fixture 分层 echo（裁定 7=B；manifest 声明、report 只作 echo——tool-binding 强
   * 对账：manifest 未声明时 report 不得自带，声明时必须同 kind）。
   */
  readonly fixture_layer?: FixtureLayerKind;
}

export type ControlDataFlowRuntimeReport = ControlDataFlowRuntimeReportV1 | ControlDataFlowRuntimeReportV2;

/** fixture 分层 kind 词表（W5 契约 §5：Node 文件沙箱不得改名冒充真实业务链）。 */
export const FIXTURE_LAYER_KINDS = ["node_file_sandbox", "node_http_service", "real_browser"] as const;
export type FixtureLayerKind = (typeof FIXTURE_LAYER_KINDS)[number];

/**
 * fixture 分层声明闭合词形（W5 契约 §5）：kind/proves/does_not_prove 三键闭包——
 * 报告消费端按声明呈现证明范围（proves/does_not_prove 空=显式零申报，合法但须显式）。
 */
export interface FixtureLayerDeclaration {
  readonly kind: FixtureLayerKind;
  readonly proves: readonly string[];
  readonly does_not_prove: readonly string[];
}

export interface ControlDataFlowRuntimeProbeManifest {
  readonly schema: "pomaster.control-data-flow-runtime-probe/v1";
  readonly task_ref: string;
  readonly static_control_ref: string;
  readonly side_effect: "READ_ONLY" | "INTERACTIVE_REVERSIBLE";
  readonly fixture: { readonly isolated: boolean; readonly ref: string | null };
  readonly cleanup_ref: string | null;
  /**
   * W5 契约 §2（加性可选）：编排启动时生成的预期 correlation ID——report 的
   * correlation_id 必须与 manifest 强对账（不等=报告无效，非 warning；对账判定
   * 归 tool-binding 执行面，legacy manifest 缺席时保持既有行为）。
   */
  readonly correlation_id?: string;
  /**
   * W5 契约 §5（加性可选）：fixture 分层声明——报告消费端按声明呈现证明范围；
   * Node 文件沙箱不得改名冒充真实业务链（缺席=未申报，诚实呈现）。
   */
  readonly fixture_layer?: FixtureLayerDeclaration;
}

/** fixture 分层声明闭合校验（W5 契约 §5：三键闭包 + kind 词表 + 数组词形）。 */
function parseFixtureLayerDeclaration(value: unknown): FixtureLayerDeclaration | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (key !== "kind" && key !== "proves" && key !== "does_not_prove") return null;
  }
  if (typeof row["kind"] !== "string" || !(FIXTURE_LAYER_KINDS as readonly string[]).includes(row["kind"])) return null;
  const strings = (raw: unknown): raw is readonly string[] =>
    Array.isArray(raw) && raw.every((entry) => typeof entry === "string" && entry.trim().length > 0);
  if (!strings(row["proves"]) || !strings(row["does_not_prove"])) return null;
  return value as FixtureLayerDeclaration;
}

export function assertSafeRuntimeProbeManifest(raw: string, subjectId: string | null): ControlDataFlowRuntimeProbeManifest {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new GateAdapterError("runner_not_ready", "runtime probe manifest 不是 JSON", "修复 manifest；工具尚未启动"); }
  if (!value || typeof value !== "object") throw new GateAdapterError("runner_not_ready", "runtime probe manifest 不是对象", "修复 manifest；工具尚未启动");
  const row = value as Record<string, unknown>;
  const fixture = row["fixture"] as Record<string, unknown> | undefined;
  // W5 契约 §5（加性可选）：fixture_layer/correlation_id 在座时须过词形校验
  //（缺席=legacy manifest 词形字节不变）。
  const fixtureLayer = row["fixture_layer"] === undefined ? undefined : parseFixtureLayerDeclaration(row["fixture_layer"]);
  if (row["fixture_layer"] !== undefined && fixtureLayer === null) {
    throw new GateAdapterError("runner_not_ready", "runtime probe manifest fixture_layer 词形非法（{kind, proves, does_not_prove} 闭合、kind 须在 node_file_sandbox/node_http_service/real_browser 词表）", "修正 manifest fixture_layer 声明；工具尚未启动");
  }
  if (row["correlation_id"] !== undefined && (typeof row["correlation_id"] !== "string" || (row["correlation_id"] as string).trim().length === 0)) {
    throw new GateAdapterError("runner_not_ready", "runtime probe manifest correlation_id 声明时须为非空字符串", "修正 manifest correlation_id；工具尚未启动");
  }
  if (row["schema"] !== "pomaster.control-data-flow-runtime-probe/v1"
    || typeof row["task_ref"] !== "string" || row["task_ref"].trim().length === 0
    || typeof row["static_control_ref"] !== "string" || row["static_control_ref"].trim().length === 0
    || !["READ_ONLY", "INTERACTIVE_REVERSIBLE"].includes(String(row["side_effect"]))
    || !fixture || typeof fixture["isolated"] !== "boolean"
    || !(fixture["ref"] === null || (typeof fixture["ref"] === "string" && fixture["ref"].trim().length > 0))
    || !(row["cleanup_ref"] === null || (typeof row["cleanup_ref"] === "string" && row["cleanup_ref"].trim().length > 0))) {
    throw new GateAdapterError("runner_not_ready", "runtime probe manifest 合同不合法", "使用 pomaster.control-data-flow-runtime-probe/v1；工具尚未启动");
  }
  if (subjectId !== null && row["task_ref"] !== subjectId) throw new GateAdapterError("runner_not_ready", `runtime probe task_ref=${String(row["task_ref"])} 与 ${subjectId} 不一致`, "修正 manifest 任务绑定；工具尚未启动");
  if (row["side_effect"] === "INTERACTIVE_REVERSIBLE" && (fixture["isolated"] !== true || typeof fixture["ref"] !== "string" || fixture["ref"].length === 0 || typeof row["cleanup_ref"] !== "string" || row["cleanup_ref"].length === 0)) {
    throw new GateAdapterError("runner_not_ready", "INTERACTIVE_REVERSIBLE 缺隔离 fixture 或 cleanup_ref", "补齐隔离 fixture 与受信 cleanup 引用；工具尚未启动");
  }
  return value as ControlDataFlowRuntimeProbeManifest;
}

function detection(facts: DetectorFacts): DetectionResult {
  const packageJson = facts.joinPath(facts.projectRoot, "package.json");
  return facts.fileExists(packageJson)
    ? { status: "READY", tool: CONTROL_DATA_FLOW_RUNTIME_TOOL_ID, detectedVersion: CONTROL_DATA_FLOW_RUNTIME_TOOL_VERSION, evidence: "受信 runtime probe binding" }
    : { status: "NOT_INSTALLED", tool: CONTROL_DATA_FLOW_RUNTIME_TOOL_ID, reason: "项目根 package.json 缺席", installHint: "在受检项目根运行 runtime probe" };
}

/** 六个指定 observation 键（唯一参与完整性与指标计算的键集——契约 §3 硬化锚）。 */
export const CONTROL_DATA_FLOW_OBSERVATION_KEYS = ["control", "request_or_storage", "response_or_ack", "readback", "feedback", "error_recovery"] as const;

/** trace 段闭合键集（契约 §2 七键；之外拒绝——fail-closed）。 */
const TRACE_SEGMENT_KEYS = ["stage", "operation_id", "control_ref", "scenario_ref", "request_digest", "readback_digest", "visible_result", "channel"] as const;

/**
 * trace 段词形校验（v2；契约 §2 七键闭包 + stage 词表 + 摘要/可见词形）。段序/
 * 身份对账归 normalize 判定面（W5.2）——本函数只判词形（解析层 fail-closed）。
 */
function parseTraceSegments(value: unknown): ControlDataFlowTraceSegment[] | null {
  if (!Array.isArray(value)) return null;
  const segments: ControlDataFlowTraceSegment[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    for (const key of Object.keys(row)) {
      if (!(TRACE_SEGMENT_KEYS as readonly string[]).includes(key)) return null;
    }
    if (typeof row["stage"] !== "string" || !(CONTROL_DATA_FLOW_TRACE_STAGES as readonly string[]).includes(row["stage"])) return null;
    if (typeof row["operation_id"] !== "string" || row["operation_id"].trim().length === 0) return null;
    if (typeof row["control_ref"] !== "string" || row["control_ref"].trim().length === 0) return null;
    if (typeof row["scenario_ref"] !== "string" || row["scenario_ref"].trim().length === 0) return null;
    const digest = (raw: unknown): raw is string | null => raw === null || (typeof raw === "string" && raw.trim().length > 0);
    if (!digest(row["request_digest"]) || !digest(row["readback_digest"])) return null;
    if (row["visible_result"] !== null && typeof row["visible_result"] !== "boolean") return null;
    // 观察通道（裁定 7=B）：加性可选，词表闭包（词表外=段词形非法）。
    if (row["channel"] !== undefined && (typeof row["channel"] !== "string" || !(OBSERVATION_CHANNEL_VALUES as readonly string[]).includes(row["channel"]))) return null;
    segments.push(raw as unknown as ControlDataFlowTraceSegment);
  }
  return segments;
}

export function parseControlDataFlowRuntimeReport(stdout: string): ControlDataFlowRuntimeReport | null {
  try {
    const raw = JSON.parse(stdout) as unknown;
    const value = raw && typeof raw === "object" && "result" in raw ? (raw as { result: unknown }).result : raw;
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    const fixture = row["fixture"] as Record<string, unknown> | undefined;
    const cleanup = row["cleanup"] as Record<string, unknown> | undefined;
    const observations = row["observations"] as Record<string, unknown> | undefined;
    const schema = row["schema"];
    const isV1 = schema === CONTROL_DATA_FLOW_RUNTIME_REPORT_V1;
    const isV2 = schema === CONTROL_DATA_FLOW_RUNTIME_REPORT_V2;
    if (!isV1 && !isV2) return null;
    // 六指定键逐一 boolean（v1/v2 同规——对象词形合法性；完整判定归 normalize）。
    if (!observations || CONTROL_DATA_FLOW_OBSERVATION_KEYS.some((key) => typeof observations[key] !== "boolean")) return null;
    // v2 额外键拒绝（契约 §3：fail-closed，不静默忽略）；v1 legacy 兼容不拒绝
    //（额外键不参与完整性与指标计算——W5.2 normalize 硬化）。
    if (isV2) {
      const keys = Object.keys(observations);
      if (keys.length !== CONTROL_DATA_FLOW_OBSERVATION_KEYS.length || CONTROL_DATA_FLOW_OBSERVATION_KEYS.some((key) => !(key in observations))) return null;
    }
    let trace: readonly ControlDataFlowTraceSegment[] | undefined;
    if (isV2) {
      const parsedTrace = parseTraceSegments(row["trace"]);
      if (parsedTrace === null) return null;
      trace = parsedTrace;
      if (row["seam_observation"] !== undefined && (row["seam_observation"] === null || typeof row["seam_observation"] !== "object")) return null;
    }
    if (typeof row["task_ref"] !== "string" || row["task_ref"].trim().length === 0
      || typeof row["static_control_ref"] !== "string" || row["static_control_ref"].trim().length === 0
      || !["READ_ONLY", "INTERACTIVE_REVERSIBLE"].includes(String(row["side_effect"]))
      || typeof row["correlation_id"] !== "string" || row["correlation_id"].trim().length === 0
      || !fixture || typeof fixture["isolated"] !== "boolean" || !(fixture["ref"] === null || (typeof fixture["ref"] === "string" && fixture["ref"].trim().length > 0))
      || !cleanup || typeof cleanup["required"] !== "boolean" || typeof cleanup["attempted"] !== "boolean" || typeof cleanup["succeeded"] !== "boolean") return null;
    // fixture_layer echo（裁定 7=B）：加性可选，kind 词表校验。
    if (isV2 && row["fixture_layer"] !== undefined
      && !(FIXTURE_LAYER_KINDS as readonly string[]).includes(String(row["fixture_layer"]))) return null;
    if (isV2) return { ...(value as object), trace } as unknown as ControlDataFlowRuntimeReportV2;
    return value as ControlDataFlowRuntimeReportV1;
  } catch { return null; }
}

/**
 * trace 段审计（W5 契约 §2/§3；normalize 判定面）——身份对账/段序/digest 在场：
 * - 段序：stage 词表序严格递增、无重复（乱序/重复=trace 乱序）；
 * - 身份：全段 scenario_ref 一致、operation_id 一致、control_ref=report.static_control_ref
 *   （不一致=串线/错 control）；
 * - request→readback 对账：request 段 request_digest、persist 段 readback_digest、
 *   re_read 段双 digest、mapping 段 readback_digest 在场；visible 段 visible_result 非 null
 *   （缺段摘要=因果链断裂）。
 * 部分链合法（段少但合规=词形与身份无违规；义务链完整性归编排层 oracle 义务判定）。
 * 违规条目以 rule 明细返回（判 failed 的依据）。
 */
function auditTraceSegments(report: ControlDataFlowRuntimeReportV2): GateResultItemInput[] {
  const issues: GateResultItemInput[] = [];
  const segments = report.trace;
  let lastOrder = -1;
  let scenarioRef: string | null = null;
  let operationId: string | null = null;
  for (const segment of segments) {
    const order = CONTROL_DATA_FLOW_TRACE_STAGES.indexOf(segment.stage);
    if (order <= lastOrder) {
      issues.push({ rule: "CDF_RT.TRACE_OUT_OF_ORDER", location: `trace[${segment.stage}]`, message: `trace 段序违规：${segment.stage} 乱序或重复（词表序 request→persist→re_read→mapping→visible）` });
    }
    lastOrder = order;
    if (scenarioRef === null) scenarioRef = segment.scenario_ref;
    else if (scenarioRef !== segment.scenario_ref) {
      issues.push({ rule: "CDF_RT.TRACE_IDENTITY_CROSSED", location: `trace[${segment.stage}]`, message: `trace 段 scenario_ref 串线：${segment.scenario_ref} ≠ ${scenarioRef}` });
    }
    if (operationId === null) operationId = segment.operation_id;
    else if (operationId !== segment.operation_id) {
      issues.push({ rule: "CDF_RT.TRACE_IDENTITY_CROSSED", location: `trace[${segment.stage}]`, message: `trace 段 operation_id 串线：${segment.operation_id} ≠ ${operationId}` });
    }
    if (segment.control_ref !== report.static_control_ref) {
      issues.push({ rule: "CDF_RT.TRACE_CONTROL_MISMATCH", location: `trace[${segment.stage}]`, message: `trace 段 control_ref=${segment.control_ref} 与报告 static_control_ref=${report.static_control_ref} 不一致（错 control）` });
    }
  }
  const byStage = new Map(segments.map((segment) => [segment.stage, segment]));
  const digestMissing = (stage: ControlDataFlowTraceStage, key: "request_digest" | "readback_digest"): void => {
    const segment = byStage.get(stage);
    if (segment !== undefined && (segment[key] === null || segment[key] === undefined)) {
      issues.push({ rule: "CDF_RT.TRACE_DIGEST_MISSING", location: `trace[${stage}]`, message: `${stage} 段 ${key} 缺席（request→readback 因果链对账断裂）` });
    }
  };
  digestMissing("request", "request_digest");
  digestMissing("persist", "readback_digest");
  digestMissing("re_read", "request_digest");
  digestMissing("re_read", "readback_digest");
  digestMissing("mapping", "readback_digest");
  const visibleSegment = byStage.get("visible");
  if (visibleSegment !== undefined && visibleSegment.visible_result === null) {
    issues.push({ rule: "CDF_RT.TRACE_DIGEST_MISSING", location: "trace[visible]", message: "visible 段 visible_result=null（可见性观察缺席——不可判）" });
  }
  return issues;
}

export function createControlDataFlowRuntimeAdapter(): GateAdapter<DetectionResult, GatePlan, ToolRunOutput> {
  return {
    adapterId: "gauntlet-lite:control-data-flow-runtime",
    detect: detection,
    prepare(scope: GateScope, policy: GatePolicy, facts?: DetectorFacts): GatePlan {
      const found = detection(facts ?? platformDetectorFacts(scope.projectRoot));
      if (found.status !== "READY") throw new GateAdapterError("runner_not_ready", "runtime probe 环境缺席", "补齐受信 runtime binding 与隔离 fixture");
      return { tool: CONTROL_DATA_FLOW_RUNTIME_TOOL_ID, toolVersion: CONTROL_DATA_FLOW_RUNTIME_TOOL_VERSION, gate: CONTROL_DATA_FLOW_RUNTIME_GATE_NAME, gateDef: CONTROL_DATA_FLOW_RUNTIME_GATE_DEF, metricDialect: CONTROL_DATA_FLOW_RUNTIME_METRIC_DIALECT, runner: "control_data_flow_runtime", command: "pomaster-runtime-cdf-probe --json", cwd: scope.projectRoot, timeoutMs: policy.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS, grn: policy.grn, ranAtSeq: policy.ranAtSeq, trigger: policy.trigger ?? "on_demand", subjectId: scope.subjectId ?? null, denominatorRefs: scope.denominatorRefs ?? [], expectedToolVersion: policy.expectedToolVersion ?? null };
    },
    run(plan: GatePlan, spawnFn: SpawnFn = defaultSpawn): ToolRunOutput {
      if (plan.runner !== "control_data_flow_runtime") throw new GateAdapterError("runner_not_implemented", "runtime runner 身份漂移", "使用受信 runtime CDF binding");
      const out = spawnFn(plan.command, { cwd: plan.cwd, timeoutMs: plan.timeoutMs });
      const unavailable = out.error !== null || out.status === null;
      return { plan, kind: unavailable ? "spawn_failed" : "executed", exitCode: out.status, stdout: out.stdout, stderr: out.stderr, externalMs: out.externalMs, failureReason: unavailable ? (out.error ?? "runtime probe 未执行") : null };
    },
    normalize(raw: ToolRunOutput, context: NormalizeContext): GateResultRecord {
      const started = performance.now();
      assertCommonGates(raw.plan, context);
      const self = Math.max(0, Math.round(performance.now() - started));
      if (raw.kind === "spawn_failed") return absenceRecord(raw.plan, "not_run", `${raw.failureReason ?? "runtime probe 未运行"}；未产生 runtime evidence`, self, raw.externalMs);
      const report = parseControlDataFlowRuntimeReport(raw.stdout);
      if (report === null) {
        // W5：v2 词形拒绝细分留痕（SCHEMA_INVALID fail-closed 的 not_run 语义——
        // 额外键/trace 段词形非法不得静默当「非 v1 格式」；裸 exit code 不参与判卷）。
        let rejection = "runtime 输出不符合 pomaster.control-data-flow-runtime/v1|v2";
        try {
          const rawJson: unknown = JSON.parse(raw.stdout);
          const inner = rawJson && typeof rawJson === "object" && "result" in rawJson ? (rawJson as { result: unknown }).result : rawJson;
          if ((inner as Record<string, unknown> | null | undefined)?.["schema"] === CONTROL_DATA_FLOW_RUNTIME_REPORT_V2) {
            rejection = "runtime 输出不符合 pomaster.control-data-flow-runtime/v2（SCHEMA_INVALID：observations 指定六键之外携带额外键或 trace 段词形非法——fail-closed，额外值不得参与判卷）";
          }
        } catch { /* 非 JSON 维持通用词形拒绝 */ }
        return absenceRecord(raw.plan, "not_run", rejection, self, raw.externalMs);
      }
      if (raw.plan.subjectId !== report.task_ref) return absenceRecord(raw.plan, "blocked", `runtime report task_ref=${report.task_ref} 与 subject=${String(raw.plan.subjectId)} 不一致`, self, raw.externalMs);
      if (report.side_effect === "INTERACTIVE_REVERSIBLE" && (!report.fixture.isolated || !report.fixture.ref || !report.cleanup.required)) return absenceRecord(raw.plan, "blocked", "INTERACTIVE_REVERSIBLE 仅允许隔离 fixture 且必须声明 cleanup", self, raw.externalMs);
      if (report.cleanup.required && (!report.cleanup.attempted || !report.cleanup.succeeded)) return absenceRecord(raw.plan, "blocked", "runtime probe cleanup 未成功，禁止判绿", self, raw.externalMs);
      // —— W5 契约 §3 观察判定硬化（修 research §5 计数缺陷）——
      // 六个指定键逐一 === true 才 complete（Object.values 计数作废——额外真值不得
      // 补足 6 判绿）；violations/ratio 只由指定键计算（额外值不可能产生负指标——
      // v1 额外键 legacy 兼容解析但不参与任何计数）。
      const specifiedKeys = CONTROL_DATA_FLOW_OBSERVATION_KEYS;
      const specifiedTrue = specifiedKeys.filter((key) => report.observations[key] === true).length;
      const complete = specifiedTrue === specifiedKeys.length;
      const observed = specifiedTrue;
      const observationViolations = specifiedKeys.length - specifiedTrue;
      // —— W5 契约 §2/§3 trace 段审计（v2）：身份对账/段序/digest 在场——违者判
      // failed（串线/乱序/缺摘要=因果链断裂，非 warning 可容忍项）。
      const traceIssues = report.schema === CONTROL_DATA_FLOW_RUNTIME_REPORT_V2
        ? auditTraceSegments(report)
        : [];
      const violations = observationViolations + traceIssues.length;
      const verdict: VerdictValue = traceIssues.length > 0
        ? "failed"
        : complete && raw.exitCode === 0 ? "passed" : "warning";
      return {
        grn: raw.plan.grn, gate: raw.plan.gate, gateDef: raw.plan.gateDef, tool: raw.plan.tool, toolVersion: raw.plan.toolVersion, metricDialect: raw.plan.metricDialect, ranAtSeq: raw.plan.ranAtSeq, verdict,
        verdictCapReason: verdict === "warning" ? "runtime_trace_incomplete" : null,
        subjectId: raw.plan.subjectId === null ? null : asGovernedId(raw.plan.subjectId), isFixture: raw.plan.subjectId?.startsWith("TEST.") === true,
        denominatorRefs: raw.plan.denominatorRefs.map(toDenominatorRow), counts: { scanned: 6, applicableScanned: 6, violations, notApplicable: 0 },
        blindspot: { scanned: 6, produced: observed, escapeRatio: observationViolations / 6 },
        trust: { asserted: { value: { violations }, claimedBy: { actorType: "tool", actor: `${raw.plan.tool}@${raw.plan.toolVersion}`, selfAttested: true } }, recomputed: { violations, matchesAsserted: true } },
        durationMs: { self, external: raw.externalMs },
        scopeNote: `runtime trace schema=${report.schema}；control_ref=${report.static_control_ref}；correlation_id=${report.correlation_id}；side_effect=${report.side_effect}；cleanup=${report.cleanup.succeeded ? "succeeded" : "not_required"}`,
        ...(traceIssues.length > 0 ? { items: capItems(traceIssues).items } : {}),
      };
    },
  };
}
