import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, beginExecution, createStore } from "@pomaster/kernel";
import type { ToolBindingRecord } from "@pomaster/gauntlet-lite";
import { runCli, runInit, runPlanRun } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-plan-runner-"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function binding(
  id: string,
  adapter: "typecheck" | "lint",
  tool: string,
  gate: "TYPECHECK" | "LINT",
  command: string,
): ToolBindingRecord {
  const isLint = adapter === "lint";
  return {
    id,
    source: "built_in",
    transport: "cli",
    adapter_ref: `builtin.gauntlet-lite.${adapter}`,
    tool,
    tool_version_anchor: isLint ? "9.18.0" : "5.7.3",
    gate,
    gate_def: `POLICY.GATE.${gate}@0.1.0`,
    metric_dialect: isLint ? "lint:finding_count" : "type:program_file_scan",
    capabilities: ["static_analysis"],
    execution: { command, cwd: "." },
    report_contract: isLint
      ? {
          format: "eslint-json",
          parser_ref: "builtin.gauntlet-lite.lint/eslint-json",
          parser_version: "0.1.0",
        }
      : {
          format: "tsc-text-diagnostics",
          parser_ref: "builtin.gauntlet-lite.typecheck/tsc-text",
          parser_version: "0.1.0",
        },
    environment: { requires: false },
  };
}

function controlDataFlowBinding(): ToolBindingRecord {
  return {
    id: "project.ui.control-data-flow",
    source: "built_in",
    transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.control-data-flow",
    tool: "gauntlet:control-data-flow",
    tool_version_anchor: "0.1.0",
    gate: "CONTROL_DATA_FLOW",
    gate_def: "POLICY.GATE.CONTROL_DATA_FLOW@0.1.0",
    metric_dialect: "ui:control_flow_chain",
    capabilities: ["control_data_flow"],
    execution: { command: "node cdf-fake.mjs", cwd: "." },
    report_contract: {
      format: "pomaster-control-data-flow-json",
      parser_ref: "builtin.gauntlet-lite.control-data-flow/json-v1",
      parser_version: "0.1.0",
    },
    environment: { requires: false },
  };
}

async function fixture(): Promise<string> {
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "plan-runner-fixture",
    devDependencies: { typescript: "^5.7.3", eslint: "^9.18.0" },
  }));
  writeFileSync(
    join(root, "tsc-fake.mjs"),
    "process.stdout.write('src/a.ts' + String.fromCharCode(10) + 'src/b.ts');",
  );
  writeFileSync(
    join(root, "eslint-fake.mjs"),
    "process.stdout.write(JSON.stringify([{filePath:'src/a.ts',messages:[],errorCount:0,warningCount:0,fatalErrorCount:0}]));",
  );
  writeFileSync(join(root, "cdf-fake.mjs"), `process.stdout.write(JSON.stringify({schema:'pomaster.control-data-flow/v1',source_root:'.',files_scanned:1,controls_scanned:1,controls:[{control_ref:'react:src/App.tsx:1:1:onClick',framework:'react',element:'button',event:'onClick',conclusion:'proven',stages:[],issues:[],runtime_confirmation_required:true}],parse_failures:[]}));`);
  await runInit(root);
  mkdirSync(join(root, ".pomaster", "tools"), { recursive: true });
  writeFileSync(join(root, ".pomaster", "tools", "bindings.json"), JSON.stringify({
    version: 1,
    bindings: [
      binding(
        "project.type.tsc-typecheck",
        "typecheck",
        "gauntlet:tsc",
        "TYPECHECK",
        "node tsc-fake.mjs --project tsconfig.json --noEmit --listFiles --pretty false",
      ),
      binding(
        "project.static.eslint-lint",
        "lint",
        "gauntlet:eslint",
        "LINT",
        "node eslint-fake.mjs src --format json",
      ),
      controlDataFlowBinding(),
    ],
  }));
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [{
      op: "upsert_object",
      envelope: {
        id: "TASK.STATIC.RUNNER",
        kind: "task_object",
        axisProfile: "task_default",
        axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
        titleZh: "计划执行器测试",
        authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
        origin: "natural",
        payload: {
          intent: "执行静态分析双 obligation",
          class_scan_result: { scope: "src/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-PLAN" },
          acceptance: [{ criterion: "类型与 lint 都须通过", claim: null, requires: ["static_analysis"] }],
        },
      } as never,
    }],
  });
  const execution = await beginExecution(store, {
    role: "orchestrator",
    runtime: "claude-code",
    identityKind: "interactive",
    startedAt: "2026-09-23T00:00:00.000Z",
  });
  return execution.execution_id;
}

const faces = [
  "behavior=present:静态分析配置变化",
  "ui=absent:无 UI",
  "api=absent:无 API",
  "data_read_write=absent:无数据读写",
  "migration=absent:无迁移",
  "permission=absent:无权限",
  "dependency=absent:无依赖变化",
  "concurrency=absent:无并发",
  "performance=absent:无性能",
  "deployment_config=absent:无部署配置",
];

describe("plan run", () => {
  it("control_data_flow 经受信 binding 执行并以 CONTROL_DATA_FLOW GRN 入账", async () => {
    const executionId = await fixture();
    const store = await createStore(root);
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: {
      id: "TASK.CDF.RUNNER", kind: "task_object", axisProfile: "task_default",
      axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
      titleZh: "控件数据流计划执行", authority: { owner: "BOOTSTRAP_OWNER", delegates: [] }, origin: "natural",
      payload: { intent: "审计控件数据链", class_scan_result: { scope: "src/**", hits: 1, fixed_count: 1, regression_case_ref: "GRN-CDF" }, acceptance: [{ criterion: "控件结构链闭合", claim: null, requires: ["control_data_flow"] }] },
    } as never }] });
    const outcome = await runPlanRun(root, { taskRef: "TASK.CDF.RUNNER", executionId, changed: ["src/App.tsx"], faces });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatchObject({ obligations_total: 1, recorded: 1, passed: 1 });
    expect(outcome.result.rows[0]).toMatchObject({ capability: "control_data_flow", gate: "CONTROL_DATA_FLOW", verdict: "passed" });
    const grn = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"), "utf8"));
    expect(grn.gate_result.result.scope.note).toContain("静态 passed 仅表示");
  });

  it("static_analysis 展开 TYPECHECK/LINT，串行执行并留下两个 task+execution 归因 GRN", async () => {
    const executionId = await fixture();
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatchObject({ obligations_total: 2, recorded: 2, passed: 2, partial: false });
    expect(outcome.result.rows.map((row) => row.gate)).toEqual(["TYPECHECK", "LINT"]);
    expect(outcome.result.rows.map((row) => row.grn)).toEqual(["GRN-0001", "GRN-0002"]);
    for (const row of outcome.result.rows) {
      const doc = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "runs", `${row.grn}.json`), "utf8"));
      expect(doc.execution_id).toBe(executionId);
      expect(doc.gate_result.result.subject_id).toBe("TASK.STATIC.RUNNER");
    }
  });

  it("available 与 unavailable obligation 混合时全部入账，非绿使命令失败", async () => {
    const executionId = await fixture();
    const registryPath = join(root, ".pomaster", "tools", "bindings.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    registry.bindings[1].environment = { requires: true, env_receipt_ref: "ENVREC-9999" };
    writeFileSync(registryPath, JSON.stringify(registry));
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toMatchObject({ obligations_total: 2, recorded: 2, passed: 1, partial: false });
    expect(outcome.result.rows.map((row) => row.verdict)).toEqual(["passed", "not_run"]);
  });

  it("畸形工具输出形成七态非绿 GRN，不会只留下 CLI 文本", async () => {
    const executionId = await fixture();
    writeFileSync(join(root, "eslint-fake.mjs"), "process.stdout.write('not-json');");
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toMatchObject({ obligations_total: 2, recorded: 2, passed: 1, partial: false });
    expect(outcome.result.rows.map((row) => row.verdict)).toEqual(["passed", "not_run"]);
    const nonGreen = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0002.json"), "utf8"),
    );
    expect(nonGreen.gate_result.result.verdict).toBe("not_run");
  });

  it("diagnose-on-failure 只诊断已入账 failed GRN", async () => {
    const executionId = await fixture();
    writeFileSync(
      join(root, "tsc-fake.mjs"),
      "process.stdout.write('src/a.ts(1,1): error TS2322: Type mismatch');",
    );
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
      diagnoseOnFailure: true,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.result.rows[0]).toMatchObject({ verdict: "failed" });
    expect(outcome.result.rows[0]?.diagnosis).not.toBeNull();
    expect(outcome.result.rows[1]).toMatchObject({ verdict: "passed", diagnosis: null });
  });

  it("后项 adapter gate_def 漂移在入账前拒绝，保留前项 GRN 并标记 partial", async () => {
    const executionId = await fixture();
    const registryPath = join(root, ".pomaster", "tools", "bindings.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    registry.bindings[1].gate_def = "POLICY.GATE.LINT@9.9.9";
    writeFileSync(registryPath, JSON.stringify(registry));
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PLAN_BINDING_DRIFT");
    expect(outcome.result).toMatchObject({ obligations_total: 2, recorded: 1, partial: true });
    expect(existsSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"))).toBe(true);
    expect(existsSync(join(root, ".pomaster", "evidence", "runs", "GRN-0002.json"))).toBe(false);
  });

  it("不存在的 AGX 在编译和执行前拒绝且不留下 GRN", async () => {
    await fixture();
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId: "AGX-2026-99999",
      faces,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    expect(outcome.result.rows).toEqual([]);
  });

  it("损坏的 AGX 档案在工具启动前 fail-closed", async () => {
    const executionId = await fixture();
    writeFileSync(
      join(root, "tsc-fake.mjs"),
      "import { writeFileSync } from 'node:fs'; writeFileSync('tool-ran.marker','ran');",
    );
    writeFileSync(
      join(root, ".pomaster", "executions", `${executionId}.json`),
      "{not-json",
    );
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(existsSync(join(root, "tool-ran.marker"))).toBe(false);
    expect(outcome.result.rows).toEqual([]);
  });

  it("AGX 已归属其他 task 时拒绝跨 task 借用", async () => {
    const executionId = await fixture();
    const executionPath = join(root, ".pomaster", "executions", `${executionId}.json`);
    const execution = JSON.parse(readFileSync(executionPath, "utf8"));
    execution.task_id = "TASK.OTHER";
    writeFileSync(executionPath, JSON.stringify(execution));
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("EXECUTION_TASK_MISMATCH");
    expect(outcome.result.rows).toEqual([]);
  });

  it("CLI 对混合 verdict 输出完整 JSON 并返回 exit 1", async () => {
    const executionId = await fixture();
    const registryPath = join(root, ".pomaster", "tools", "bindings.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    registry.bindings[1].environment = { requires: true, env_receipt_ref: "ENVREC-9999" };
    writeFileSync(registryPath, JSON.stringify(registry));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exit = await runCli(
      [
        "--dir", root,
        "plan", "run",
        "--task", "TASK.STATIC.RUNNER",
        "--execution-id", executionId,
        "--changed", "src/a.ts",
        ...faces.flatMap((face) => ["--face", face]),
        "--json",
      ],
      { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
    );
    expect(exit).toBe(1);
    expect(stderr).toEqual([]);
    const envelope = JSON.parse(stdout.join("\n"));
    expect(envelope).toMatchObject({
      command: "plan run",
      ok: false,
      result: { obligations_total: 2, recorded: 2, passed: 1, partial: false },
    });
    expect(envelope.result.rows.map((row: { verdict: string }) => row.verdict)).toEqual([
      "passed",
      "not_run",
    ]);
  });
});
