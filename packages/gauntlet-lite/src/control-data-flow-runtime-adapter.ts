import { performance } from "node:perf_hooks";
import type { VerdictValue } from "@pomaster/schemas";
import type { DetectionResult, DetectorFacts, GateAdapter, GatePlan, GatePolicy, GateResultRecord, GateScope, NormalizeContext, SpawnFn, ToolRunOutput } from "./adapter-types.js";
import { GateAdapterError, asGovernedId } from "./adapter-types.js";
import { DEFAULT_RUN_TIMEOUT_MS, defaultSpawn } from "./build-adapter.js";
import { platformDetectorFacts } from "./detectors.js";
import { absenceRecord, assertCommonGates, toDenominatorRow } from "./normalize-common.js";

export const CONTROL_DATA_FLOW_RUNTIME_GATE_NAME = "CONTROL_DATA_FLOW_RUNTIME";
export const CONTROL_DATA_FLOW_RUNTIME_GATE_DEF = "POLICY.GATE.CONTROL_DATA_FLOW_RUNTIME@0.1.0";
export const CONTROL_DATA_FLOW_RUNTIME_TOOL_ID = "gauntlet:control-data-flow-runtime";
export const CONTROL_DATA_FLOW_RUNTIME_TOOL_VERSION = "0.1.0";
export const CONTROL_DATA_FLOW_RUNTIME_METRIC_DIALECT = "ui:control_flow_runtime_trace";
export const CONTROL_DATA_FLOW_RUNTIME_FORMAT = "pomaster-control-data-flow-runtime-json";
export const CONTROL_DATA_FLOW_RUNTIME_PARSER_REF = "builtin.gauntlet-lite.control-data-flow-runtime/json-v1";
export const CONTROL_DATA_FLOW_RUNTIME_ADAPTER_REF = "builtin.gauntlet-lite.control-data-flow-runtime";

export interface ControlDataFlowRuntimeReport {
  readonly schema: "pomaster.control-data-flow-runtime/v1";
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

export interface ControlDataFlowRuntimeProbeManifest {
  readonly schema: "pomaster.control-data-flow-runtime-probe/v1";
  readonly task_ref: string;
  readonly static_control_ref: string;
  readonly side_effect: "READ_ONLY" | "INTERACTIVE_REVERSIBLE";
  readonly fixture: { readonly isolated: boolean; readonly ref: string | null };
  readonly cleanup_ref: string | null;
}

export function assertSafeRuntimeProbeManifest(raw: string, subjectId: string | null): ControlDataFlowRuntimeProbeManifest {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new GateAdapterError("runner_not_ready", "runtime probe manifest 不是 JSON", "修复 manifest；工具尚未启动"); }
  if (!value || typeof value !== "object") throw new GateAdapterError("runner_not_ready", "runtime probe manifest 不是对象", "修复 manifest；工具尚未启动");
  const row = value as Record<string, unknown>;
  const fixture = row["fixture"] as Record<string, unknown> | undefined;
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

export function parseControlDataFlowRuntimeReport(stdout: string): ControlDataFlowRuntimeReport | null {
  try {
    const raw = JSON.parse(stdout) as unknown;
    const value = raw && typeof raw === "object" && "result" in raw ? (raw as { result: unknown }).result : raw;
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    const fixture = row["fixture"] as Record<string, unknown> | undefined;
    const cleanup = row["cleanup"] as Record<string, unknown> | undefined;
    const observations = row["observations"] as Record<string, unknown> | undefined;
    const observationKeys = ["control", "request_or_storage", "response_or_ack", "readback", "feedback", "error_recovery"] as const;
    if (row["schema"] !== "pomaster.control-data-flow-runtime/v1"
      || typeof row["task_ref"] !== "string" || row["task_ref"].trim().length === 0
      || typeof row["static_control_ref"] !== "string" || row["static_control_ref"].trim().length === 0
      || !["READ_ONLY", "INTERACTIVE_REVERSIBLE"].includes(String(row["side_effect"]))
      || typeof row["correlation_id"] !== "string" || row["correlation_id"].trim().length === 0
      || !fixture || typeof fixture["isolated"] !== "boolean" || !(fixture["ref"] === null || (typeof fixture["ref"] === "string" && fixture["ref"].trim().length > 0))
      || !cleanup || typeof cleanup["required"] !== "boolean" || typeof cleanup["attempted"] !== "boolean" || typeof cleanup["succeeded"] !== "boolean"
      || !observations || observationKeys.some((key) => typeof observations[key] !== "boolean")) return null;
    return value as ControlDataFlowRuntimeReport;
  } catch { return null; }
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
      if (report === null) return absenceRecord(raw.plan, "not_run", "runtime 输出不符合 pomaster.control-data-flow-runtime/v1", self, raw.externalMs);
      if (raw.plan.subjectId !== report.task_ref) return absenceRecord(raw.plan, "blocked", `runtime report task_ref=${report.task_ref} 与 subject=${String(raw.plan.subjectId)} 不一致`, self, raw.externalMs);
      if (report.side_effect === "INTERACTIVE_REVERSIBLE" && (!report.fixture.isolated || !report.fixture.ref || !report.cleanup.required)) return absenceRecord(raw.plan, "blocked", "INTERACTIVE_REVERSIBLE 仅允许隔离 fixture 且必须声明 cleanup", self, raw.externalMs);
      if (report.cleanup.required && (!report.cleanup.attempted || !report.cleanup.succeeded)) return absenceRecord(raw.plan, "blocked", "runtime probe cleanup 未成功，禁止判绿", self, raw.externalMs);
      const observed = Object.values(report.observations).filter(Boolean).length;
      const complete = observed === 6;
      const verdict: VerdictValue = complete && raw.exitCode === 0 ? "passed" : "warning";
      return {
        grn: raw.plan.grn, gate: raw.plan.gate, gateDef: raw.plan.gateDef, tool: raw.plan.tool, toolVersion: raw.plan.toolVersion, metricDialect: raw.plan.metricDialect, ranAtSeq: raw.plan.ranAtSeq, verdict,
        verdictCapReason: verdict === "warning" ? "runtime_trace_incomplete" : null,
        subjectId: raw.plan.subjectId === null ? null : asGovernedId(raw.plan.subjectId), isFixture: raw.plan.subjectId?.startsWith("TEST.") === true,
        denominatorRefs: raw.plan.denominatorRefs.map(toDenominatorRow), counts: { scanned: 6, applicableScanned: 6, violations: complete ? 0 : 6 - observed, notApplicable: 0 },
        blindspot: { scanned: 6, produced: observed, escapeRatio: (6 - observed) / 6 },
        trust: { asserted: { value: { violations: complete ? 0 : 6 - observed }, claimedBy: { actorType: "tool", actor: `${raw.plan.tool}@${raw.plan.toolVersion}`, selfAttested: true } }, recomputed: { violations: complete ? 0 : 6 - observed, matchesAsserted: true } },
        durationMs: { self, external: raw.externalMs },
        scopeNote: `runtime trace control_ref=${report.static_control_ref}；correlation_id=${report.correlation_id}；side_effect=${report.side_effect}；cleanup=${report.cleanup.succeeded ? "succeeded" : "not_required"}`,
      };
    },
  };
}
