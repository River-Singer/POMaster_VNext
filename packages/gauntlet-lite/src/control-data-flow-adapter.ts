import { performance } from "node:perf_hooks";
import type { VerdictValue } from "@pomaster/schemas";
import type { ControlDataFlowReport, ControlFlowIssue } from "./control-data-flow-analyzer.js";
import type { DetectionResult, DetectorFacts, GateAdapter, GatePlan, GatePolicy, GateResultItemInput, GateResultRecord, GateScope, NormalizeContext, SpawnFn, ToolRunOutput } from "./adapter-types.js";
import { GateAdapterError, asGovernedId } from "./adapter-types.js";
import { DEFAULT_RUN_TIMEOUT_MS, defaultSpawn } from "./build-adapter.js";
import { platformDetectorFacts } from "./detectors.js";
import { absenceRecord, assertCommonGates, capItems, toDenominatorRow } from "./normalize-common.js";

export const CONTROL_DATA_FLOW_GATE_NAME = "CONTROL_DATA_FLOW";
export const CONTROL_DATA_FLOW_GATE_DEF = "POLICY.GATE.CONTROL_DATA_FLOW@0.1.0";
export const CONTROL_DATA_FLOW_TOOL_ID = "gauntlet:control-data-flow";
export const CONTROL_DATA_FLOW_TOOL_VERSION = "0.1.0";
export const CONTROL_DATA_FLOW_METRIC_DIALECT = "ui:control_flow_chain";
export const CONTROL_DATA_FLOW_FORMAT = "pomaster-control-data-flow-json";
export const CONTROL_DATA_FLOW_PARSER_REF = "builtin.gauntlet-lite.control-data-flow/json-v1";
export const CONTROL_DATA_FLOW_ADAPTER_REF = "builtin.gauntlet-lite.control-data-flow";
export const CONTROL_DATA_FLOW_COMMAND = "pomaster control-data-flow analyze --report-only";

function builtInDetection(facts: DetectorFacts): DetectionResult {
  const packageJson = facts.joinPath(facts.projectRoot, "package.json");
  if (!facts.fileExists(packageJson)) return { status: "NOT_INSTALLED", tool: CONTROL_DATA_FLOW_TOOL_ID, reason: "项目根 package.json 缺席，无法建立源码审计边界", installHint: "在项目根运行或显式修正 ToolBinding execution.cwd" };
  return { status: "READY", tool: CONTROL_DATA_FLOW_TOOL_ID, detectedVersion: CONTROL_DATA_FLOW_TOOL_VERSION, evidence: "POMaster 发行包内建 analyzer/parser" };
}

function isReport(value: unknown): value is ControlDataFlowReport {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row["schema"] !== "pomaster.control-data-flow/v1" || !Number.isInteger(row["files_scanned"]) || !Number.isInteger(row["controls_scanned"]) || !Array.isArray(row["controls"]) || !Array.isArray(row["parse_failures"])) return false;
  const controlsValid = row["controls"].every((entry) => {
    if (entry === null || typeof entry !== "object") return false;
    const control = entry as Record<string, unknown>;
    return typeof control["control_ref"] === "string"
      && ["proven", "broken", "unknown", "not_applicable"].includes(String(control["conclusion"]))
      && Array.isArray(control["stages"])
      && Array.isArray(control["issues"])
      && control["issues"].every((candidate) => {
        if (candidate === null || typeof candidate !== "object") return false;
        const issue = candidate as Record<string, unknown>;
        const anchor = issue["anchor"] as Record<string, unknown> | undefined;
        return typeof issue["rule"] === "string"
          && typeof issue["message"] === "string"
          && ["violation", "blindspot"].includes(String(issue["certainty"]))
          && anchor !== undefined
          && typeof anchor["file"] === "string"
          && Number.isInteger(anchor["line"])
          && Number.isInteger(anchor["column"]);
      });
  });
  const failuresValid = row["parse_failures"].every((entry) => entry !== null
    && typeof entry === "object"
    && typeof (entry as Record<string, unknown>)["file"] === "string"
    && typeof (entry as Record<string, unknown>)["message"] === "string");
  return controlsValid && failuresValid;
}

function parseReport(stdout: string): ControlDataFlowReport | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (isReport(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const envelope = parsed as Record<string, unknown>;
      if (envelope["result"] && isReport(envelope["result"])) return envelope["result"];
    }
  } catch { /* not judgeable */ }
  return null;
}

function allIssues(report: ControlDataFlowReport): ControlFlowIssue[] { return report.controls.flatMap((control) => control.issues); }

export function createControlDataFlowAdapter(): GateAdapter<DetectionResult, GatePlan, ToolRunOutput> {
  return {
    adapterId: "gauntlet-lite:control-data-flow",
    detect: builtInDetection,
    prepare(scope: GateScope, policy: GatePolicy, facts?: DetectorFacts): GatePlan {
      const detection = builtInDetection(facts ?? platformDetectorFacts(scope.projectRoot));
      if (detection.status !== "READY") throw new GateAdapterError(
        "runner_not_ready",
        detection.status === "NOT_INSTALLED" ? detection.reason : `内建 analyzer 状态异常：${detection.status}`,
        detection.status === "NOT_INSTALLED" ? detection.installHint : "修复 ToolBinding/analyzer 版本漂移后重试",
      );
      return { tool: CONTROL_DATA_FLOW_TOOL_ID, toolVersion: CONTROL_DATA_FLOW_TOOL_VERSION, gate: CONTROL_DATA_FLOW_GATE_NAME, gateDef: CONTROL_DATA_FLOW_GATE_DEF, metricDialect: CONTROL_DATA_FLOW_METRIC_DIALECT, runner: "control_data_flow", command: CONTROL_DATA_FLOW_COMMAND, cwd: scope.projectRoot, timeoutMs: policy.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS, grn: policy.grn, ranAtSeq: policy.ranAtSeq, trigger: policy.trigger ?? "on_demand", subjectId: scope.subjectId ?? null, denominatorRefs: scope.denominatorRefs ?? [], expectedToolVersion: policy.expectedToolVersion ?? null };
    },
    run(plan: GatePlan, spawnFn: SpawnFn = defaultSpawn): ToolRunOutput {
      if (plan.runner !== "control_data_flow") throw new GateAdapterError("runner_not_implemented", `runner=${String(plan.runner)} 不是 control-data-flow adapter`, "使用受信 CONTROL_DATA_FLOW binding");
      const outcome = spawnFn(plan.command, { cwd: plan.cwd, timeoutMs: plan.timeoutMs });
      const failed = outcome.error !== null || outcome.status === null;
      return { plan, kind: failed ? "spawn_failed" : "executed", exitCode: outcome.status, stdout: outcome.stdout, stderr: outcome.stderr, externalMs: outcome.externalMs, failureReason: failed ? `控件数据流 analyzer 不可执行：${outcome.error ?? "unknown"}` : null };
    },
    normalize(raw: ToolRunOutput, context: NormalizeContext): GateResultRecord {
      const started = performance.now();
      assertCommonGates(raw.plan, context);
      const self = Math.max(0, Math.round(performance.now() - started));
      if (raw.kind === "spawn_failed") return absenceRecord(raw.plan, "not_run", `${raw.failureReason ?? "analyzer 未运行"}（not_run，禁静默当通过）`, self, raw.externalMs);
      const report = parseReport(raw.stdout);
      if (report === null) return absenceRecord(raw.plan, "not_run", "控件数据流输出不是 pomaster.control-data-flow/v1；parser 无法判卷，裸 exit code 不替代结构证据", self, raw.externalMs);
      if (report.controls_scanned !== report.controls.length || report.files_scanned < 0) return absenceRecord(raw.plan, "not_run", "控件数据流报告自报分母与 controls[] 不一致，拒绝信任自报计数", self, raw.externalMs);
      if (report.controls_scanned === 0) return absenceRecord(raw.plan, "not_run", `零控件分母（files_scanned=${report.files_scanned}），静态审计未发生有效判卷`, self, raw.externalMs);
      const issues = allIssues(report);
      const violations = issues.filter((entry) => entry.certainty === "violation");
      const blindspots = issues.filter((entry) => entry.certainty === "blindspot").length + report.parse_failures.length;
      const verdict: VerdictValue = violations.length > 0 ? "failed" : blindspots > 0 ? "warning" : "passed";
      const produced = report.controls.filter((control) => control.conclusion === "proven" || control.conclusion === "broken").length;
      const issueItems: GateResultItemInput[] = [
        ...issues.map((entry) => ({ rule: entry.rule, location: `${entry.anchor.file}:${entry.anchor.line}:${entry.anchor.column}`, message: entry.message })),
        ...report.parse_failures.map((entry) => ({ rule: "CDF.PARSE_FAILURE", location: entry.file, message: entry.message })),
      ];
      const capped = capItems(issueItems.sort((a, b) => `${a.location}:${a.rule}`.localeCompare(`${b.location}:${b.rule}`)));
      const record: GateResultRecord = {
        grn: raw.plan.grn, gate: raw.plan.gate, gateDef: raw.plan.gateDef, tool: raw.plan.tool, toolVersion: raw.plan.toolVersion, metricDialect: raw.plan.metricDialect, ranAtSeq: raw.plan.ranAtSeq, verdict,
        verdictCapReason: verdict === "warning" ? "unresolved_or_parse_blindspot" : null,
        subjectId: raw.plan.subjectId === null ? null : asGovernedId(raw.plan.subjectId), isFixture: raw.plan.subjectId?.startsWith("TEST.") === true,
        denominatorRefs: raw.plan.denominatorRefs.map(toDenominatorRow),
        counts: { scanned: report.controls_scanned, applicableScanned: report.controls_scanned, violations: violations.length, notApplicable: 0 },
        blindspot: { scanned: report.controls_scanned + report.parse_failures.length, produced, escapeRatio: (report.controls_scanned + report.parse_failures.length) === 0 ? 0 : (report.controls_scanned + report.parse_failures.length - produced) / (report.controls_scanned + report.parse_failures.length) },
        trust: { asserted: { value: { violations: violations.length }, claimedBy: { actorType: "tool", actor: `${raw.plan.tool}@${raw.plan.toolVersion}`, selfAttested: true } }, recomputed: { violations: violations.length, matchesAsserted: true } },
        durationMs: { self, external: raw.externalMs },
        scopeNote: `静态 passed 仅表示配置分母内结构链闭合，不证明真实 API、持久化或浏览器回显；runtime_confirmation_required=${report.controls_scanned}；files_scanned=${report.files_scanned}；parse_failures=${report.parse_failures.length}`,
        ...(capped.items.length > 0 ? { items: capped.items } : {}), ...(capped.itemsTruncated ? { itemsTruncated: true } : {}),
      };
      return record;
    },
  };
}
