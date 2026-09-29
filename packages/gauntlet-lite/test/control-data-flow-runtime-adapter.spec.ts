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

  // ============================================================
  // W5 契约 §2 report v2 词形（trace[] 加性演进；v1 消费者兼容）
  // ============================================================

  const V2_TRACE = [
    { stage: "request", operation_id: "save-control-value", control_ref: "react:src/App.tsx:1:1:onClick", scenario_ref: "s1", request_digest: "sha256:aa", readback_digest: null, visible_result: null },
    { stage: "persist", operation_id: "save-control-value", control_ref: "react:src/App.tsx:1:1:onClick", scenario_ref: "s1", request_digest: null, readback_digest: "sha256:bb", visible_result: null },
    { stage: "re_read", operation_id: "save-control-value", control_ref: "react:src/App.tsx:1:1:onClick", scenario_ref: "s1", request_digest: "sha256:cc", readback_digest: "sha256:dd", visible_result: null },
    { stage: "mapping", operation_id: "save-control-value", control_ref: "react:src/App.tsx:1:1:onClick", scenario_ref: "s1", request_digest: null, readback_digest: "sha256:ee", visible_result: null },
    { stage: "visible", operation_id: "save-control-value", control_ref: "react:src/App.tsx:1:1:onClick", scenario_ref: "s1", request_digest: null, readback_digest: null, visible_result: true },
  ];
  const v2Base = { ...base, schema: "pomaster.control-data-flow-runtime/v2", trace: V2_TRACE };

  it("v2 报告（trace 五段合法词形）解析与判卷通过（加性演进——v1 消费者兼容并存）", () => {
    const record = execute(v2Base);
    expect(record.verdict).toBe("passed");
    expect(record.scopeNote).toContain("schema=pomaster.control-data-flow-runtime/v2");
  });

  it("v2 observations 额外键拒绝（SCHEMA_INVALID fail-closed——非 not_run 不得判绿）", () => {
    const record = execute({ ...v2Base, observations: { ...base.observations, extra_truthy: true } });
    expect(record.verdict).toBe("not_run");
    expect(record.scopeNote).toContain("额外键");
  });

  it("v2 trace 段词形非法（额外键 / stage 词表外 / 缺身份键）→ not_run（词形层 fail-closed）", () => {
    const badExtraKey = execute({ ...v2Base, trace: [{ ...V2_TRACE[0]!, correlation_id: "x" }, ...V2_TRACE.slice(1)] });
    expect(badExtraKey.verdict).toBe("not_run");
    const badStage = execute({ ...v2Base, trace: V2_TRACE.map((seg) => seg.stage === "persist" ? { ...seg, stage: "storage" } : seg) });
    expect(badStage.verdict).toBe("not_run");
    const missingIdentity = execute({ ...v2Base, trace: V2_TRACE.map((seg) => seg.stage === "request" ? { ...seg, scenario_ref: "" } : seg) });
    expect(missingIdentity.verdict).toBe("not_run");
  });

  it("v1 报告保持既有行为（无 trace 合法；额外 observation 键 legacy 兼容解析不拒绝）", () => {
    // v1 额外键在词形层不拒绝（legacy 兼容——非 not_run；其计数影响=W5.2 normalize
    // 硬化的对象：硬化后额外键不参与完整性与指标，本断言改为 passed）。
    const record = execute({ ...base, observations: { ...base.observations, extra_truthy: true } });
    expect(record.verdict).toBe("warning");
    expect(record.scopeNote).not.toContain("SCHEMA_INVALID");
  });

  // ============================================================
  // W5 契约 §2/§5 manifest 加性词形（correlation_id / fixture_layer）
  // ============================================================

  it("manifest correlation_id / fixture_layer 合法声明通过；词形非法在 spawn 前拒绝（工具未启动）", () => {
    const root = mkdtempSync(join(tmpdir(), "pomaster-cdf-runtime-w5-")); roots.push(root);
    writeFileSync(join(root, "package.json"), "{}");
    writeFileSync(join(root, "probe.json"), JSON.stringify({
      schema: "pomaster.control-data-flow-runtime-probe/v1",
      task_ref: "TASK.CDF.W5", static_control_ref: "control:1", side_effect: "READ_ONLY",
      fixture: { isolated: false, ref: null }, cleanup_ref: null,
      correlation_id: "corr-w5-001",
      fixture_layer: { kind: "node_http_service", proves: ["真实 socket+真实写盘"], does_not_prove: ["真实浏览器渲染"] },
    }));
    const binding = { id: "project.cdf.runtime.w5", source: "built_in", transport: "cli", adapter_ref: "builtin.gauntlet-lite.control-data-flow-runtime", tool: "gauntlet:control-data-flow-runtime", tool_version_anchor: "0.1.0", gate: "CONTROL_DATA_FLOW_RUNTIME", gate_def: "POLICY.GATE.CONTROL_DATA_FLOW_RUNTIME@0.1.0", metric_dialect: "ui:control_flow_runtime_trace", capabilities: ["control_data_flow"], execution: { command: "node probe.mjs", probe_manifest: "probe.json" }, report_contract: { format: "pomaster-control-data-flow-runtime-json", parser_ref: "builtin.gauntlet-lite.control-data-flow-runtime/json-v1", parser_version: "0.1.0" } } as const;
    const v2Report = JSON.stringify({ ...v2Base, task_ref: "TASK.CDF.W5", static_control_ref: "control:1", correlation_id: "corr-w5-001" });
    const outcome = runBindingGate(binding, { projectRoot: root, grn: "GRN-5001", ranAtSeq: 1, subjectId: "TASK.CDF.W5" }, { executableProbe: () => "node", spawnFn: () => ({ status: 0, stdout: v2Report, stderr: "", error: null, externalMs: 1 }) });
    expect(outcome.record.verdict).toBe("passed");
    // fixture 分层呈现：报告消费端按声明呈现证明范围（scope.note 携带 kind）。
    expect(outcome.record.scopeNote).toContain("fixture_layer=node_http_service");
    expect(outcome.record.scopeNote).toContain("binding_id=project.cdf.runtime.w5");

    writeFileSync(join(root, "probe.json"), JSON.stringify({ schema: "pomaster.control-data-flow-runtime-probe/v1", task_ref: "TASK.CDF.W5", static_control_ref: "control:1", side_effect: "READ_ONLY", fixture: { isolated: false, ref: null }, cleanup_ref: null, correlation_id: "   " }));
    expect(() => runBindingGate(binding, { projectRoot: root, grn: "GRN-5002", ranAtSeq: 2, subjectId: "TASK.CDF.W5" }, { executableProbe: () => "node", spawnFn: () => ({ status: 0, stdout: v2Report, stderr: "", error: null, externalMs: 1 }) })).toThrow(/correlation_id/);

    writeFileSync(join(root, "probe.json"), JSON.stringify({ schema: "pomaster.control-data-flow-runtime-probe/v1", task_ref: "TASK.CDF.W5", static_control_ref: "control:1", side_effect: "READ_ONLY", fixture: { isolated: false, ref: null }, cleanup_ref: null, fixture_layer: { kind: "real_business_chain", proves: [], does_not_prove: [] } }));
    expect(() => runBindingGate(binding, { projectRoot: root, grn: "GRN-5003", ranAtSeq: 3, subjectId: "TASK.CDF.W5" }, { executableProbe: () => "node", spawnFn: () => ({ status: 0, stdout: v2Report, stderr: "", error: null, externalMs: 1 }) })).toThrow(/fixture_layer/);
  });

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
