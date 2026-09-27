import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createControlDataFlowRuntimeAdapter, runBindingGate } from "../src/index.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function execute(report: unknown) {
  const root = mkdtempSync(join(tmpdir(), "pomaster-cdf-runtime-")); roots.push(root);
  writeFileSync(join(root, "package.json"), "{}");
  const adapter = createControlDataFlowRuntimeAdapter();
  const plan = adapter.prepare({ projectRoot: root, subjectId: "TASK.CDF" }, { grn: "GRN-0001", ranAtSeq: 1 });
  const raw = adapter.run(plan, () => ({ status: 0, stdout: JSON.stringify(report), stderr: "", error: null, externalMs: 1 }));
  return adapter.normalize(raw, { plan, isFixture: false });
}
const base = { schema: "pomaster.control-data-flow-runtime/v1", task_ref: "TASK.CDF", static_control_ref: "react:src/App.tsx:1:1:onClick", side_effect: "READ_ONLY", fixture: { isolated: false, ref: null }, cleanup: { required: false, attempted: false, succeeded: false }, observations: { control: true, request_or_storage: true, response_or_ack: true, readback: true, feedback: true, error_recovery: true }, correlation_id: "trace-1" };

describe("CONTROL_DATA_FLOW_RUNTIME adapter", () => {
  it("通过真实 binding 执行 control→序列化→持久化→readback→UI feedback，并清理隔离 fixture", () => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-cdf-runtime-real-")); roots.push(root);
    const fixtureRoot = join(root, "isolated-fixture");
    const probePath = fileURLToPath(new URL("./fixtures/control-data-flow-runtime/probe.mjs", import.meta.url));
    const correlationId = "cdf-real-trace-001";
    const controlValue = "Ada Lovelace";
    const staticControlRef = "react:src/Profile.tsx:27:9:onChange";
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "probe.json"), JSON.stringify({
      schema: "pomaster.control-data-flow-runtime-probe/v1",
      task_ref: "TASK.CDF.REAL",
      static_control_ref: staticControlRef,
      side_effect: "INTERACTIVE_REVERSIBLE",
      fixture: { isolated: true, ref: `fixture:${fixtureRoot}` },
      cleanup_ref: "fixture-probe:remove-isolated-root",
    }));

    const quote = (value: string) => `"${value.replaceAll('"', '\\"')}"`;
    const outcome = runBindingGate({
      id: "project.cdf.runtime.real",
      source: "built_in",
      transport: "cli",
      adapter_ref: "builtin.gauntlet-lite.control-data-flow-runtime",
      tool: "gauntlet:control-data-flow-runtime",
      tool_version_anchor: "0.1.0",
      gate: "CONTROL_DATA_FLOW_RUNTIME",
      gate_def: "POLICY.GATE.CONTROL_DATA_FLOW_RUNTIME@0.1.0",
      metric_dialect: "ui:control_flow_runtime_trace",
      capabilities: ["control_data_flow"],
      execution: {
        command: [
          "node",
          quote(probePath),
          "--fixture-root", quote(fixtureRoot),
          "--control-value", quote(controlValue),
          "--correlation-id", correlationId,
          "--task-ref", "TASK.CDF.REAL",
          "--static-control-ref", staticControlRef,
        ].join(" "),
        probe_manifest: "probe.json",
      },
      report_contract: {
        format: "pomaster-control-data-flow-runtime-json",
        parser_ref: "builtin.gauntlet-lite.control-data-flow-runtime/json-v1",
        parser_version: "0.1.0",
      },
    }, {
      projectRoot: root,
      grn: "GRN-9001",
      ranAtSeq: 1,
      subjectId: "TASK.CDF.REAL",
    }, { executableProbe: () => process.execPath });

    expect(outcome.record.verdict).toBe("passed");
    expect(outcome.artifact).toBeDefined();
    expect(existsSync(fixtureRoot)).toBe(false);
    const report = JSON.parse(Buffer.from(outcome.artifact!.bytes).toString("utf8")) as {
      correlation_id: string;
      cleanup: { attempted: boolean; succeeded: boolean };
      trace: Array<Record<string, unknown>>;
    };
    expect(report.correlation_id).toBe(correlationId);
    expect(report.cleanup).toEqual({ required: true, attempted: true, succeeded: true });
    expect(report.trace.map((event) => event.stage)).toEqual([
      "error_recovery",
      "control",
      "request_serialization",
      "persistence",
      "response_ack",
      "readback",
      "ui_state_feedback",
    ]);
    expect(report.trace.every((event) => event.correlation_id === correlationId)).toBe(true);
    const serialized = report.trace.find((event) => event.stage === "request_serialization")?.serialized;
    expect(JSON.parse(String(serialized))).toMatchObject({
      correlation_id: correlationId,
      payload: { control_id: "display-name", value: controlValue },
    });
    expect(report.trace.find((event) => event.stage === "persistence")?.persisted).toBe(true);
    expect(report.trace.find((event) => event.stage === "readback")?.value).toBe(controlValue);
    expect(report.trace.find((event) => event.stage === "ui_state_feedback")?.text).toBe(`Saved ${controlValue}`);
  });

  it("完整只读 trace 通过", () => expect(execute(base).verdict).toBe("passed"));
  it("可逆交互缺隔离 fixture 时 blocked", () => expect(execute({ ...base, side_effect: "INTERACTIVE_REVERSIBLE", fixture: { isolated: false, ref: null }, cleanup: { required: true, attempted: true, succeeded: true } }).verdict).toBe("blocked"));
  it("cleanup 失败和观测不完整均不得判绿", () => {
    expect(execute({ ...base, side_effect: "INTERACTIVE_REVERSIBLE", fixture: { isolated: true, ref: "fixture:local" }, cleanup: { required: true, attempted: true, succeeded: false } }).verdict).toBe("blocked");
    expect(execute({ ...base, observations: { ...base.observations, feedback: false } }).verdict).toBe("warning");
  });
  it("空静态链引用不构成 runtime 绑定", () => {
    expect(execute({ ...base, static_control_ref: " " }).verdict).toBe("not_run");
  });
  it("未隔离的可逆交互在 spawn 前阻断", () => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-cdf-runtime-preflight-")); roots.push(root);
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "probe.json"), JSON.stringify({ schema: "pomaster.control-data-flow-runtime-probe/v1", task_ref: "TASK.CDF", static_control_ref: "control:1", side_effect: "INTERACTIVE_REVERSIBLE", fixture: { isolated: false, ref: null }, cleanup_ref: null }));
    let starts = 0;
    expect(() => runBindingGate({ id: "project.cdf.runtime", source: "built_in", transport: "cli", adapter_ref: "builtin.gauntlet-lite.control-data-flow-runtime", tool: "gauntlet:control-data-flow-runtime", tool_version_anchor: "0.1.0", gate: "CONTROL_DATA_FLOW_RUNTIME", gate_def: "POLICY.GATE.CONTROL_DATA_FLOW_RUNTIME@0.1.0", metric_dialect: "ui:control_flow_runtime_trace", capabilities: ["control_data_flow"], execution: { command: "node probe.mjs", probe_manifest: "probe.json" }, report_contract: { format: "pomaster-control-data-flow-runtime-json", parser_ref: "builtin.gauntlet-lite.control-data-flow-runtime/json-v1", parser_version: "0.1.0" } }, { projectRoot: root, grn: "GRN-0001", ranAtSeq: 1, subjectId: "TASK.CDF" }, { executableProbe: () => "node", spawnFn: () => { starts += 1; return { status: 0, stdout: "{}", stderr: "", error: null, externalMs: 1 }; } })).toThrow(/隔离 fixture/);
    expect(starts).toBe(0);
  });
});
