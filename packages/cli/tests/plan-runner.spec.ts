import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, beginExecution, createStore } from "@pomaster/kernel";
import type { ToolBindingRecord } from "@pomaster/gauntlet-lite";
import {
  runCli,
  runInit,
  runPlanRun,
  runFinalize,
  runFinalizeReplayAdjudicate,
  runFinalizeStatus,
  runReconImportGraph,
  runScopeReviewAdopt,
} from "@pomaster/cli";

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

function controlDataFlowRuntimeBinding(): ToolBindingRecord {
  return {
    id: "project.ui.control-data-flow-runtime", source: "built_in", transport: "cli",
    adapter_ref: "builtin.gauntlet-lite.control-data-flow-runtime",
    tool: "gauntlet:control-data-flow-runtime", tool_version_anchor: "0.1.0",
    gate: "CONTROL_DATA_FLOW_RUNTIME", gate_def: "POLICY.GATE.CONTROL_DATA_FLOW_RUNTIME@0.1.0",
    metric_dialect: "ui:control_flow_runtime_trace", capabilities: ["control_data_flow"],
    execution: { command: "node cdf-runtime-fake.mjs", cwd: ".", probe_manifest: "cdf-runtime-probe.json" },
    report_contract: { format: "pomaster-control-data-flow-runtime-json", parser_ref: "builtin.gauntlet-lite.control-data-flow-runtime/json-v1", parser_version: "0.1.0" },
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
  writeFileSync(join(root, "cdf-runtime-fake.mjs"), `process.stdout.write(JSON.stringify({schema:'pomaster.control-data-flow-runtime/v1',task_ref:'TASK.CDF.RUNNER',static_control_ref:'react:src/App.tsx:1:1:onClick',side_effect:'READ_ONLY',fixture:{isolated:false,ref:null},cleanup:{required:false,attempted:false,succeeded:false},observations:{control:true,request_or_storage:true,response_or_ack:true,readback:true,feedback:true,error_recovery:true},correlation_id:'trace-1'}));`);
  writeFileSync(join(root, "cdf-runtime-probe.json"), JSON.stringify({ schema: "pomaster.control-data-flow-runtime-probe/v1", task_ref: "TASK.CDF.RUNNER", static_control_ref: "react:src/App.tsx:1:1:onClick", side_effect: "READ_ONLY", fixture: { isolated: false, ref: null }, cleanup_ref: null }));
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
      controlDataFlowRuntimeBinding(),
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

async function adoptCurrentRealityScope(executionId: string): Promise<{ readonly blobPath: string }> {
  const scan = await runReconImportGraph(root, {
    executionId,
    roots: ["tsc-fake.mjs"],
    task: "TASK.STATIC.RUNNER",
    maxDepth: 4,
  });
  expect(scan.ok).toBe(true);
  const blobPath = join(root, ".pomaster", "evidence", ...(scan.result.report_blob?.storage_path ?? "").split("/"));
  const report = JSON.parse(readFileSync(blobPath, "utf8")) as {
    scope_review: { machine_derived_candidates: Array<{ path: string }> };
  };
  const reviewPath = join(root, "scope-review.json");
  writeFileSync(reviewPath, JSON.stringify({
    decisions: report.scope_review.machine_derived_candidates.map((candidate) => ({
      path: candidate.path,
      status: "unknown",
      basis: "测试用技术审阅；不代表 Owner 裁决",
    })),
  }));
  const adopted = await runScopeReviewAdopt(root, {
    observationRef: scan.result.observation_id as string,
    taskRef: "TASK.STATIC.RUNNER",
    reviewFile: reviewPath,
    actor: "agent:test",
    sourceRef: "test:plan-runner",
  });
  expect(adopted.ok).toBe(true);
  return { blobPath };
}

// ============================================================
// W1-FR04 场景化分母（acceptance×capability×scenario；Case C 复选框三态同源）
// ============================================================

const CHECKBOX_SCENARIOS = [
  {
    scenario_ref: "selected-no-hover",
    precondition: "复选框处于选中态",
    interaction: "指针不在复选框上（no-hover）",
    state_dimensions: ["selected=true", "hover=false"],
    expected_observation: "悬浮提示不显示；复选框保持选中呈现",
    runtime_confirmation_required: false,
  },
  {
    scenario_ref: "selected-hover",
    precondition: "复选框处于选中态",
    interaction: "指针悬停于复选框上",
    state_dimensions: ["selected=true", "hover=true"],
    expected_observation: "悬浮提示显示当前选中说明",
    runtime_confirmation_required: false,
  },
  {
    scenario_ref: "unselected-hover",
    precondition: "复选框处于未选中态",
    interaction: "指针悬停于复选框上",
    state_dimensions: ["selected=false", "hover=true"],
    expected_observation: "悬浮提示显示未选中引导文案",
    runtime_confirmation_required: true,
  },
];

/** 在 fixture 之上播种三态场景任务（TASK.STATIC.SCEN；默认单 acceptance，可注入变体）。 */
async function seedScenarioTask(acceptance?: unknown[]): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: {
    id: "TASK.STATIC.SCEN", kind: "task_object", axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "复选框三态场景任务", authority: { owner: "BOOTSTRAP_OWNER", delegates: [] }, origin: "natural",
    payload: { intent: "三态场景分母执行", class_scan_result: { scope: "src/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-SCEN" }, acceptance: acceptance ?? [{ criterion: "复选框三态交互均须正确呈现提示", claim: null, requires: ["static_analysis"], scenarios: CHECKBOX_SCENARIOS }] },
  } as never }] });
}

function grnPath(grn: string): string {
  return join(root, ".pomaster", "evidence", "runs", `${grn}.json`);
}

function grnNote(grn: string): string {
  const doc = JSON.parse(readFileSync(grnPath(grn), "utf8")) as {
    gate_result: { result: { scope: { note: string } } };
  };
  return doc.gate_result.result.scope.note;
}

describe("plan run（W1-FR04 场景化分母）", () => {
  it("场景化 plan run：gates×场景全分母执行，rows/GRN note 逐场景对账", async () => {
    const executionId = await fixture();
    await seedScenarioTask();
    const outcome = await runPlanRun(root, { taskRef: "TASK.STATIC.SCEN", executionId, changed: ["src/a.ts"], faces });
    expect(outcome.ok).toBe(true);
    expect(outcome.result).toMatchObject({ obligations_total: 6, recorded: 6, passed: 6 });
    const typecheckRows = outcome.result.rows.filter((row) => row.gate === "TYPECHECK");
    expect(typecheckRows.map((row) => row.scenario_ref)).toEqual([
      "selected-hover",
      "selected-no-hover",
      "unselected-hover",
    ]);
    for (const row of outcome.result.rows) {
      expect(row.scenario_ref).not.toBeNull();
      expect(grnNote(row.grn)).toContain(`scenario_ref=${row.scenario_ref}`);
    }
  });

  it("复用身份含场景：同场景同指纹复用；缺失场景不被同 gate 其他场景的 passed 覆盖（重跑补执行）", async () => {
    const executionId = await fixture();
    await seedScenarioTask();
    const first = await runPlanRun(root, { taskRef: "TASK.STATIC.SCEN", executionId, changed: ["src/a.ts"], faces });
    expect(first.ok).toBe(true);
    const grnByKey = new Map(first.result.rows.map((row) => [`${row.gate}::${row.scenario_ref}`, row.grn]));
    // 模拟 selected-hover 场景证据缺失（该场景两态证据丢失——同 gate 其余场景证据仍在）。
    rmSync(grnPath(grnByKey.get("TYPECHECK::selected-hover") as string));
    rmSync(grnPath(grnByKey.get("LINT::selected-hover") as string));

    const second = await runPlanRun(root, { taskRef: "TASK.STATIC.SCEN", executionId, changed: ["src/a.ts"], faces });
    expect(second.ok).toBe(true);
    const secondByKey = new Map(second.result.rows.map((row) => [`${row.gate}::${row.scenario_ref}`, row.grn]));
    // 未缺失场景复用原 GRN（同场景同指纹合法复用）。
    expect(secondByKey.get("TYPECHECK::selected-no-hover")).toBe(grnByKey.get("TYPECHECK::selected-no-hover"));
    expect(secondByKey.get("LINT::unselected-hover")).toBe(grnByKey.get("LINT::unselected-hover"));
    // 缺失场景重新执行产生新 GRN（禁被 selected-no-hover 等 passed 顶替复用），note 场景 marker 正确。
    const rebound = secondByKey.get("TYPECHECK::selected-hover") as string;
    expect(rebound).not.toBe(grnByKey.get("TYPECHECK::selected-hover"));
    expect(grnNote(rebound)).toContain("scenario_ref=selected-hover");
    // 盘上 GRN = 首轮 6 − 删 2 + 重执行 2 = 6（append-only 序号继续增长；新序号证据在 rebound ≠ 旧值）。
    expect(readdirSync(join(root, ".pomaster", "evidence", "runs")).filter((name) => /^GRN-/.test(name))).toHaveLength(6);
  });

  it("finalize cohort 键含场景：缺场景 GRN → VERIFY_BLOCKED（同 gate 多场景不互相覆盖）；补齐后恢复", async () => {
    const executionId = await fixture();
    await seedScenarioTask();
    const first = await runPlanRun(root, { taskRef: "TASK.STATIC.SCEN", executionId, changed: ["src/a.ts"], faces });
    expect(first.ok).toBe(true);
    const grnByKey = new Map(first.result.rows.map((row) => [`${row.gate}::${row.scenario_ref}`, row.grn]));
    // 单态证据丢失（unselected-hover 的 TYPECHECK 态）：整条 Acceptance 覆盖不充分。
    rmSync(grnPath(grnByKey.get("TYPECHECK::unselected-hover") as string));

    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.SCEN" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("VERIFY_BLOCKED");

    const rerun = await runPlanRun(root, { taskRef: "TASK.STATIC.SCEN", executionId, changed: ["src/a.ts"], faces });
    expect(rerun.ok).toBe(true);
    const statusAfter = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.SCEN" });
    expect(statusAfter.ok).toBe(true);
    expect(statusAfter.result.stage).toBe("AWAITING_REPLAY_REVIEW");
  });
});

// ============================================================
// PR-W1.3 Case C 回放（复选框三态：selected/no-hover、selected/hover、unselected/hover）
// ============================================================
//
// 事故原型（MASTer 经验汇编）：选中态 pointer-out 通过、缺 selected+hover——
// 单态证据不满足整体，但原单态 GRN 保留 passed；漏态/重复同态/错验收/错场景的
// Evidence 均不能满足三态要求；分状态证据映射可逐场景对账。

/** 全量三态回放底座：fixture + 场景任务 + 一次全分母 plan run。 */
async function runScenarioPlan(acceptance?: unknown[]): Promise<{ executionId: string; grnByKey: Map<string, string> }> {
  const executionId = await fixture();
  await seedScenarioTask(acceptance);
  const outcome = await runPlanRun(root, { taskRef: "TASK.STATIC.SCEN", executionId, changed: ["src/a.ts"], faces });
  expect(outcome.ok).toBe(true);
  return { executionId, grnByKey: new Map(outcome.result.rows.map((row) => [`${row.gate}::${row.scenario_ref}`, row.grn])) };
}

function grnFiles(): string[] {
  return readdirSync(join(root, ".pomaster", "evidence", "runs")).filter((name) => /^GRN-/.test(name));
}

/** 拷贝既有 GRN 为新序号文件（fixture 态操纵：模拟重复/错位的历史证据）。 */
function cloneGrn(sourceGrn: string, noteOverride?: (note: string) => string): string {
  const raw = JSON.parse(readFileSync(grnPath(sourceGrn), "utf8")) as {
    gate_result: { result: { scope: { note: string } } };
  };
  if (noteOverride !== undefined) {
    raw.gate_result.result.scope.note = noteOverride(raw.gate_result.result.scope.note);
  }
  const numbers = grnFiles().map((name) => Number(name.slice(4, -5)));
  const next = `GRN-${String(Math.max(...numbers) + 1).padStart(4, "0")}.json`;
  writeFileSync(join(root, ".pomaster", "evidence", "runs", next), JSON.stringify(raw));
  return next.slice(0, -5);
}

describe("Case C 回放（复选框三态；PR-W1.3）", () => {
  it("三态证据齐备：全分母绿 → AWAITING_REPLAY_REVIEW；分状态证据映射可逐场景对账（6 组合各恰好一条）", async () => {
    const { grnByKey } = await runScenarioPlan();
    expect(grnByKey.size).toBe(6);
    for (const scenario of ["selected-no-hover", "selected-hover", "unselected-hover"]) {
      for (const gate of ["TYPECHECK", "LINT"]) {
        const grn = grnByKey.get(`${gate}::${scenario}`);
        expect(grn).toBeDefined();
        const note = grnNote(grn as string);
        expect(note).toContain(`scenario_ref=${scenario}`);
        expect(note).toContain(`acceptance_ref=TASK.STATIC.SCEN#acceptance[0]`);
      }
    }
    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.SCEN" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("AWAITING_REPLAY_REVIEW");
  });

  it("单态证据不满足整体：只留 selected/no-hover → VERIFY_BLOCKED，原单态 GRN 保留 passed 不降级；三态补齐后恢复", async () => {
    const { executionId, grnByKey } = await runScenarioPlan();
    // 删除 selected/hover 与 unselected/hover 的全部证据（模拟只验证了一态）。
    for (const key of ["TYPECHECK::selected-hover", "LINT::selected-hover", "TYPECHECK::unselected-hover", "LINT::unselected-hover"]) {
      rmSync(grnPath(grnByKey.get(key) as string));
    }

    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.SCEN" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("VERIFY_BLOCKED");
    // 原单态 GRN 保留 passed（不因整体覆盖不足而降级/删除）。
    expect(grnNote(grnByKey.get("TYPECHECK::selected-no-hover") as string)).toContain("scenario_ref=selected-no-hover");

    // 三态证据补齐（重跑补执行）→ 满足整体。
    const rerun = await runPlanRun(root, { taskRef: "TASK.STATIC.SCEN", executionId, changed: ["src/a.ts"], faces });
    expect(rerun.ok).toBe(true);
    const statusAfter = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.SCEN" });
    expect(statusAfter.ok).toBe(true);
    expect(statusAfter.result.stage).toBe("AWAITING_REPLAY_REVIEW");
  });

  it("漏态：三缺一（缺 selected/hover 的 TYPECHECK 态）→ VERIFY_BLOCKED 且诊断显式点名缺失场景键", async () => {
    const { grnByKey } = await runScenarioPlan();
    rmSync(grnPath(grnByKey.get("TYPECHECK::selected-hover") as string));

    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.SCEN" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("VERIFY_BLOCKED");
    // 分母缺失型 VERIFY_BLOCKED 不得误报「存在非 passed」——诊断须定位到相应场景。
    expect(status.result.next_actions[0]?.reason).toContain("分母缺失");
    expect(status.result.next_actions[0]?.reason).toContain("selected-hover");
  });

  it("重复同态：同场景重复 GRN 不缩分母也不顶缺（ latest 同态仍只算一态）→ 仍 VERIFY_BLOCKED", async () => {
    const { grnByKey } = await runScenarioPlan();
    // 缺 selected/hover 的 TYPECHECK；再用重复的 selected-no-hover TYPECHECK GRN（大序号=最新）填盘。
    rmSync(grnPath(grnByKey.get("TYPECHECK::selected-hover") as string));
    cloneGrn(grnByKey.get("TYPECHECK::selected-no-hover") as string);

    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.SCEN" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("VERIFY_BLOCKED");
    expect(status.result.next_actions[0]?.reason).toContain("selected-hover");
  });

  it("错场景的 Evidence：scenario_ref 不在任务场景集合的 GRN 不满足分母（多证据不顶缺）", async () => {
    const { grnByKey } = await runScenarioPlan();
    rmSync(grnPath(grnByKey.get("TYPECHECK::selected-hover") as string));
    cloneGrn(grnByKey.get("TYPECHECK::selected-no-hover") as string, (note) =>
      note.replace("scenario_ref=selected-no-hover", "scenario_ref=hover-extra"),
    );

    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.SCEN" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("VERIFY_BLOCKED");
    expect(status.result.next_actions[0]?.reason).toContain("selected-hover");
  });

  it("其他 Acceptance 的 Evidence：同 gate 同场景的另一验收 GRN 不满足本验收分母（挪证隔离）", async () => {
    const { grnByKey } = await runScenarioPlan([
      { criterion: "复选框三态交互均须正确呈现提示", claim: null, requires: ["static_analysis"], scenarios: CHECKBOX_SCENARIOS },
      { criterion: "另一验收（同能力无场景）", claim: null, requires: ["static_analysis"] },
    ]);
    // 删本验收（acceptance[0]）的 selected/hover TYPECHECK；另一验收 acceptance[1] 的 TYPECHECK GRN 在盘但不得挪用。
    rmSync(grnPath(grnByKey.get("TYPECHECK::selected-hover") as string));
    expect(grnFiles().some((name) => {
      const doc = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "runs", name), "utf8")) as { gate_result: { result: { scope: { note: string } } } };
      return doc.gate_result.result.scope.note.includes("acceptance_ref=TASK.STATIC.SCEN#acceptance[1]");
    })).toBe(true);

    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.SCEN" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("VERIFY_BLOCKED");
    expect(status.result.next_actions[0]?.reason).toContain("selected-hover");
  });
});

describe("plan run", () => {
  it("finalize 在工具启动前拒绝 verification execution/主体与 claim 断言侧重合", async () => {
    const implementationExecutionId = await fixture();
    const store = await createStore(root);
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: {
      id: "TASK.STATIC.RUNNER", kind: "task_object", axisProfile: "task_default",
      axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
      titleZh: "计划执行器测试", authority: { owner: "BOOTSTRAP_OWNER", delegates: [] }, origin: "natural",
      payload: { intent: "执行静态分析双 obligation", class_scan_result: { scope: "src/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-PLAN" }, acceptance: [{ criterion: "类型与 lint 都须通过", claim: "CLM-0001", requires: ["static_analysis"] }] },
    } as never }, { op: "record_claim", claim: {
      clm: "CLM-0001",
      subjectId: "TASK.STATIC.RUNNER" as never,
      assertion: "实现侧断言",
      assertedBy: { actorType: "agent", actor: "implementer", selfAttested: true },
      evidenceRefs: [],
      executionId: implementationExecutionId,
    } }] });

    const sameExecution = await runFinalize(root, { taskRef: "TASK.STATIC.RUNNER", executionId: implementationExecutionId, verifier: "agent:independent", reviewRange: "HEAD~1..HEAD", changed: ["src/a.ts"], faces });
    expect(sameExecution.ok).toBe(false);
    expect(sameExecution.errors[0]?.code).toBe("VERIFICATION_SUBJECT_NOT_INDEPENDENT");
    expect(readdirSync(join(root, ".pomaster", "evidence", "runs")).filter((name) => /^GRN-/.test(name))).toHaveLength(0);

    const independentExecution = await beginExecution(store, { role: "qa", runtime: "claude-code", identityKind: "interactive", taskId: "TASK.STATIC.RUNNER", startedAt: "2026-09-23T01:00:00.000Z" });
    const sameActor = await runFinalize(root, { taskRef: "TASK.STATIC.RUNNER", executionId: independentExecution.execution_id, verifier: "agent:implementer", reviewRange: "HEAD~1..HEAD", changed: ["src/a.ts"], faces });
    expect(sameActor.ok).toBe(false);
    expect(sameActor.errors[0]?.code).toBe("VERIFICATION_SUBJECT_NOT_INDEPENDENT");
    expect(readdirSync(join(root, ".pomaster", "evidence", "runs")).filter((name) => /^GRN-/.test(name))).toHaveLength(0);
  });

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
    expect(outcome.result).toMatchObject({ obligations_total: 2, recorded: 2, passed: 2 });
    expect(outcome.result.rows.map((row) => row.gate)).toEqual(["CONTROL_DATA_FLOW", "CONTROL_DATA_FLOW_RUNTIME"]);
    const grn = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"), "utf8"));
    expect(grn.gate_result.result.scope.note).toContain("静态 passed 仅表示");
    const runtimeGrn = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0002.json"), "utf8"));
    expect(runtimeGrn.artifact_refs).toHaveLength(1);
    expect(runtimeGrn.gate_result.result.scope.note).toContain("correlation_id=trace-1");

    const pending = await runFinalize(root, { taskRef: "TASK.CDF.RUNNER", executionId, reviewRange: "HEAD~1..HEAD", changed: ["src/App.tsx"], faces });
    expect(pending.ok).toBe(false);
    expect(pending.result).toMatchObject({ stage: "AWAITING_REPLAY_REVIEW", completed: false });
    expect(readdirSync(join(root, ".pomaster", "evidence", "runs")).filter((name) => /^GRN-/.test(name))).toHaveLength(2);

    const replayReceipt = join(root, "replay-receipt.json");
    writeFileSync(replayReceipt, JSON.stringify({
      schema: "pomaster.replay-adjudication/v1",
      task_ref: "TASK.CDF.RUNNER",
      review_range: "HEAD~1..HEAD",
      plan_fingerprint: pending.result.plan_fingerprint,
      reviewed_by: "agent:independent-reviewer",
      verdict: "allow-closeout",
    }));
    const staleReplay = await runFinalize(root, { taskRef: "TASK.CDF.RUNNER", executionId, reviewRange: "HEAD~1..HEAD", replayReceipt, changed: ["src/App.tsx"], faces });
    expect(staleReplay.ok).toBe(false);
    expect(staleReplay.result.stage).toBe("AWAITING_REPLAY_REVIEW");
    expect(staleReplay.errors[0]?.code).toBe("REPLAY_RECEIPT_UNTRUSTED");

    const sameCohortReviewer = await runFinalizeReplayAdjudicate(root, { taskRef: "TASK.CDF.RUNNER", executionId, reviewRange: "HEAD~1..HEAD", planFingerprint: pending.result.plan_fingerprint as string, reviewedBy: "agent:independent-reviewer", verdict: "block-closeout" });
    expect(sameCohortReviewer.ok).toBe(false);
    expect(sameCohortReviewer.errors[0]?.code).toBe("REPLAY_REVIEWER_NOT_INDEPENDENT");
    const reviewerExecution = await beginExecution(store, { role: "qa", runtime: "claude-code", identityKind: "interactive", taskId: "TASK.CDF.RUNNER", startedAt: "2026-09-23T02:00:00.000Z" });
    const blockedReceipt = await runFinalizeReplayAdjudicate(root, { taskRef: "TASK.CDF.RUNNER", executionId: reviewerExecution.execution_id, reviewRange: "HEAD~1..HEAD", planFingerprint: pending.result.plan_fingerprint as string, reviewedBy: "agent:independent-reviewer", verdict: "block-closeout" });
    expect(blockedReceipt.ok).toBe(true);
    expect(blockedReceipt.result.receipt_ref).toMatch(/^sha256:/);
    const replayBlocked = await runFinalize(root, { taskRef: "TASK.CDF.RUNNER", executionId, reviewRange: "HEAD~1..HEAD", replayReceipt: blockedReceipt.result.receipt_ref as string, changed: ["src/App.tsx"], faces });
    expect(replayBlocked.ok).toBe(false);
    expect(replayBlocked.result.stage).toBe("REPLAY_BLOCKED");

    const allowedReceipt = await runFinalizeReplayAdjudicate(root, { taskRef: "TASK.CDF.RUNNER", executionId: reviewerExecution.execution_id, reviewRange: "HEAD~1..HEAD", planFingerprint: pending.result.plan_fingerprint as string, reviewedBy: "agent:independent-reviewer", verdict: "allow-closeout" });
    expect(allowedReceipt.ok).toBe(true);
    const awaitingClaim = await runFinalize(root, { taskRef: "TASK.CDF.RUNNER", executionId, reviewRange: "HEAD~1..HEAD", replayReceipt: allowedReceipt.result.receipt_ref as string, changed: ["src/App.tsx"], faces });
    expect(awaitingClaim.ok).toBe(false);
    expect(awaitingClaim.result.stage).toBe("NEW_CLAIM_REQUIRED");
    expect(readdirSync(join(root, ".pomaster", "evidence", "runs")).filter((name) => /^GRN-/.test(name))).toHaveLength(2);

    const status = await runFinalizeStatus(root, { taskRef: "TASK.CDF.RUNNER" });
    expect(status.ok).toBe(true);
    expect(status.result).toMatchObject({ stage: "NEW_CLAIM_REQUIRED", plan_fingerprint: pending.result.plan_fingerprint });

    const runtimeStoragePath = runtimeGrn.artifact_refs[0].blob.storage_path as string;
    rmSync(join(root, ".pomaster", "evidence", ...runtimeStoragePath.split("/")));
    const repairedBinding = await runPlanRun(root, { taskRef: "TASK.CDF.RUNNER", executionId, changed: ["src/App.tsx"], faces });
    expect(repairedBinding.ok).toBe(true);
    expect(repairedBinding.result.rows.map((row) => row.grn)).toEqual(["GRN-0001", "GRN-0003"]);
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

    writeFileSync(join(root, "tsc-fake-v2.mjs"), "process.stdout.write('src/a.ts' + String.fromCharCode(10) + 'src/b.ts');");
    const registryPath = join(root, ".pomaster", "tools", "bindings.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8"));
    registry.bindings[0].execution.command = "node tsc-fake-v2.mjs --project tsconfig.json --noEmit --listFiles --pretty false";
    writeFileSync(registryPath, JSON.stringify(registry));
    const bindingChanged = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(bindingChanged.ok).toBe(true);
    expect(bindingChanged.result.inputs_fingerprint).toBe(outcome.result.inputs_fingerprint);
    expect(bindingChanged.result.rows.map((row) => row.grn)).toEqual(["GRN-0003", "GRN-0002"]);
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
    expect(outcome.result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({
      contract: "pomaster.plan-diagnosis/v1",
      original: expect.objectContaining({ verdict: "not_run", evidence_ref: expect.stringMatching(/^GRN-/) }),
      condition: "blocked",
    })]));
    expect(outcome.result).toMatchObject({ obligations_total: 2, recorded: 2, passed: 1, partial: false });
    expect(outcome.result.rows.map((row) => row.verdict)).toEqual(["passed", "not_run"]);

    registry.bindings[1].environment = { requires: false };
    writeFileSync(registryPath, JSON.stringify(registry));
    const replay = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(replay.ok).toBe(true);
    expect(replay.result.rows.map((row) => row.grn)).toEqual(["GRN-0003", "GRN-0004"]);
    expect(readdirSync(join(root, ".pomaster", "evidence", "runs")).filter((name) => /^GRN-/.test(name))).toHaveLength(4);
    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.RUNNER" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("AWAITING_REPLAY_REVIEW");
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

    writeFileSync(join(root, "eslint-fake.mjs"), "process.stdout.write(JSON.stringify([{filePath:'src/a.ts',messages:[],errorCount:0,warningCount:0,fatalErrorCount:0}]));");
    const replay = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(replay.ok).toBe(true);
    expect(replay.result.rows.map((row) => row.grn)).toEqual(["GRN-0001", "GRN-0003"]);
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

  it("最新 reality scope 过期时在工具启动和 GRN 分配前阻断", async () => {
    const executionId = await fixture();
    writeFileSync(
      join(root, "tsc-fake.mjs"),
      "import { writeFileSync } from 'node:fs'; writeFileSync('tool-ran.marker','ran');",
    );
    await adoptCurrentRealityScope(executionId);
    writeFileSync(join(root, "reality-drift.mjs"), "export const drift = true;\n");
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("REALITY_SCOPE_STALE");
    expect(existsSync(join(root, "tool-ran.marker"))).toBe(false);
    expect(outcome.result.rows).toEqual([]);
    expect(existsSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"))).toBe(false);
  });

  it("最新 reality scope 证据损坏时在工具启动和 GRN 分配前阻断", async () => {
    const executionId = await fixture();
    writeFileSync(
      join(root, "tsc-fake.mjs"),
      "import { writeFileSync } from 'node:fs'; writeFileSync('tool-ran.marker','ran');",
    );
    const { blobPath } = await adoptCurrentRealityScope(executionId);
    writeFileSync(blobPath, "{damaged", "utf8");
    const outcome = await runPlanRun(root, {
      taskRef: "TASK.STATIC.RUNNER",
      executionId,
      changed: ["src/a.ts"],
      faces,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("REALITY_SCOPE_UNJUDGEABLE");
    expect(existsSync(join(root, "tool-ran.marker"))).toBe(false);
    expect(outcome.result.rows).toEqual([]);
    expect(existsSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"))).toBe(false);
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

// ============================================================
// W2-FR05 source freshness（PR-W2.2：producer 前采样 + 复用资格 + 终验消费负例矩阵）
// ============================================================
//
// 合同（research §4 + kernel source-snapshot.ts）：GRN 携带运行窗口双采样
// （before/after/window）；相关面变了不直接复用旧绿；声明外变化零影响；
// 窗口漂移的证据保留真实 verdict 但不证明稳定终态（终验不得复用该绿）。

function grnDoc(grn: string): { source_snapshot?: Record<string, unknown>; gate_result: { result: { verdict: string } } } {
  return JSON.parse(readFileSync(grnPath(grn), "utf8")) as never;
}

/** 在 fixture 上创建相关面真实文件（默认 digest 捕获需要内容在盘）。 */
function writeSource(relative: string, content: string): void {
  const absolute = join(root, ...relative.split("/"));
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/** 窗口内改写相关源码的 typecheck fake（Case D 原型：worker 验证窗口 A→B）。 */
const MUTATING_TSC_FAKE = [
  "import { writeFileSync, mkdirSync } from 'node:fs';",
  "mkdirSync('src', { recursive: true });",
  // 单引号普通串 + \\n：写入 .mjs 的是换行转义序列（模板字面量会把 \n 变成真实换行，
  // 落盘即 SyntaxError——工具 exit 1 被 adapter 判 not_run，不是窗口语义）。
  "writeFileSync('src/a.ts', 'export const a = 2;\\n');",
  "process.stdout.write('src/a.ts' + String.fromCharCode(10) + 'src/b.ts');",
].join("\n");

describe("plan run source freshness（W2-FR05 负例矩阵）", () => {
  it("producer 前采样：GRN 携带 source_snapshot（before/after/window fresh；digest 与盘上内容同源）", async () => {
    const executionId = await fixture();
    writeSource("src/a.ts", "export const a = 1;\n");
    const outcome = await runPlanRun(root, { taskRef: "TASK.STATIC.RUNNER", executionId, changed: ["src/a.ts"], faces });
    expect(outcome.ok).toBe(true);
    for (const row of outcome.result.rows) {
      const snapshot = grnDoc(row.grn).source_snapshot;
      expect(snapshot).toBeDefined();
      const window = (snapshot as { window: { state: string } }).window;
      expect(window.state).toBe("fresh");
      const after = (snapshot as { after: { digests: Record<string, string> } }).after;
      expect(Object.keys(after.digests)).toEqual(["src/a.ts"]);
      expect(after.digests["src/a.ts"]).toBe(
        `sha256:${createHash("sha256").update(readFileSync(join(root, "src", "a.ts"))).digest("hex")}`,
      );
    }
  });

  it("GRN 后改相关文件 → 旧 Evidence 不再满足 Acceptance：复用拒绝补执行，旧 GRN append-only 保留，补验后终验恢复", async () => {
    const executionId = await fixture();
    writeSource("src/a.ts", "export const a = 1;\n");
    const first = await runPlanRun(root, { taskRef: "TASK.STATIC.RUNNER", executionId, changed: ["src/a.ts"], faces });
    expect(first.ok).toBe(true);
    const firstGrns = first.result.rows.map((row) => row.grn);

    writeSource("src/a.ts", "export const a = 2;\n");
    const second = await runPlanRun(root, { taskRef: "TASK.STATIC.RUNNER", executionId, changed: ["src/a.ts"], faces });
    expect(second.ok).toBe(true);
    // 相关面变了 → 复用拒绝（同 execution 同 fingerprint 同 binding 也不复用旧绿）。
    for (const row of second.result.rows) expect(firstGrns).not.toContain(row.grn);
    // 旧 GRN append-only 保留，verdict 不改写（不自动改判、不删除）。
    for (const grn of firstGrns) {
      expect(existsSync(grnPath(grn))).toBe(true);
      expect(grnDoc(grn).gate_result.result.verdict).toBe("passed");
    }
    // 补验 GRN window fresh 且与当前一致 → 终验恢复 AWAITING_REPLAY_REVIEW。
    for (const row of second.result.rows) {
      expect((grnDoc(row.grn).source_snapshot as { window: { state: string } }).window.state).toBe("fresh");
    }
    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.RUNNER" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("AWAITING_REPLAY_REVIEW");
  });

  it("改无关文件 → 不失效：同 GRN 复用照常（声明外变化零影响，不全局一刀切）", async () => {
    const executionId = await fixture();
    writeSource("src/a.ts", "export const a = 1;\n");
    const first = await runPlanRun(root, { taskRef: "TASK.STATIC.RUNNER", executionId, changed: ["src/a.ts"], faces });
    expect(first.ok).toBe(true);
    writeSource("src/unrelated.ts", "export const noise = true;\n");
    const second = await runPlanRun(root, { taskRef: "TASK.STATIC.RUNNER", executionId, changed: ["src/a.ts"], faces });
    expect(second.ok).toBe(true);
    expect(second.result.rows.map((row) => row.grn)).toEqual(first.result.rows.map((row) => row.grn));
  });

  it("共享配置变 → 计入（sharedSourcePaths 并入相关分母；变化后补执行）", async () => {
    const executionId = await fixture();
    writeSource("src/a.ts", "export const a = 1;\n");
    writeSource("tsconfig.json", "{}\n");
    const input = { taskRef: "TASK.STATIC.RUNNER", executionId, changed: ["src/a.ts"], sharedSourcePaths: ["tsconfig.json"], faces } as const;
    const first = await runPlanRun(root, input);
    expect(first.ok).toBe(true);
    writeSource("tsconfig.json", "{\n  // 漂移\n}\n");
    const second = await runPlanRun(root, input);
    expect(second.ok).toBe(true);
    for (const row of second.result.rows) expect(first.result.rows.map((r) => r.grn)).not.toContain(row.grn);
  });

  it("运行窗口内相关源码被改（A→B）→ window stale 落账、真实 verdict 不改写、终验拒绝复用该绿；稳定窗口重验后恢复", async () => {
    const executionId = await fixture();
    writeSource("src/a.ts", "export const a = 1;\n");
    writeFileSync(join(root, "tsc-fake.mjs"), MUTATING_TSC_FAKE);
    const drifted = await runPlanRun(root, { taskRef: "TASK.STATIC.RUNNER", executionId, changed: ["src/a.ts"], faces });
    // 真实工具 verdict 保留（不得把不稳定窗口的绿改红，也不得冒充稳定终态）。
    expect(drifted.ok).toBe(true);
    for (const row of drifted.result.rows) {
      expect(grnDoc(row.grn).gate_result.result.verdict).toBe("passed");
      expect((grnDoc(row.grn).source_snapshot as { window: { state: string; drift: string[] } }).window.state).toBe("stale");
    }
    // 终验拒绝复用该绿（window stale ≠ 稳定终态证据）。
    const status = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.RUNNER" });
    expect(status.ok).toBe(true);
    expect(status.result.stage).toBe("VERIFY_BLOCKED");
    expect(status.result.next_actions[0]?.reason).toContain("源码稳定性");

    // 稳定窗口重验：候选 window stale 不复用 → 补执行 → fresh → 终验恢复。
    writeFileSync(
      join(root, "tsc-fake.mjs"),
      "process.stdout.write('src/a.ts' + String.fromCharCode(10) + 'src/b.ts');",
    );
    const stable = await runPlanRun(root, { taskRef: "TASK.STATIC.RUNNER", executionId, changed: ["src/a.ts"], faces });
    expect(stable.ok).toBe(true);
    for (const row of stable.result.rows) {
      expect(drifted.result.rows.map((r) => r.grn)).not.toContain(row.grn);
      expect((grnDoc(row.grn).source_snapshot as { window: { state: string } }).window.state).toBe("fresh");
    }
    const statusAfter = await runFinalizeStatus(root, { taskRef: "TASK.STATIC.RUNNER" });
    expect(statusAfter.ok).toBe(true);
    expect(statusAfter.result.stage).toBe("AWAITING_REPLAY_REVIEW");
  });
});
