/**
 * Production Verification Plan runner.
 *
 * The compiler remains the only binding-selection authority. This module consumes
 * resolved_bindings verbatim, executes obligations serially, and records each GRN
 * through recordGateRunValue so kernel record_gate_run stays the sole write path.
 */
import {
  EXECUTION_ID_PATTERN,
  GovernanceError,
  PLAN_CAPABILITY_GATE_NAMES,
  assertExecutionAttachable,
  buildStorePaths,
  createStore,
  persistEvidenceArtifact,
  readExecutionRecordById,
  sha256OfCanonical,
  verifyEvidenceBinding,
  type VerificationPlanResolvedBinding,
} from "@pomaster/kernel";
import {
  BINDING_ANNOTATION_PREFIX,
  GateAdapterError,
  absenceRecord,
  runBindingGate,
  type GateResultRecord,
  type ToolBindingRecord,
} from "@pomaster/gauntlet-lite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { allocateEvidenceRef } from "./evidence.js";
import { runDiagnose, type DiagnoseResult } from "./diagnose.js";
import { runPlanCompile, type PlanCompileInput } from "./plan.js";
import { governanceErrorToCliError } from "./permit.js";
import { runRecordGateRunValue } from "./record.js";
import { runsDirPath } from "./store-layout.js";
import { computeBindingStates, loadToolBindingRegistry } from "./tools.js";

export interface PlanRunInput extends Omit<PlanCompileInput, "inputFile"> {
  readonly taskRef: string;
  readonly executionId: string;
  readonly diagnoseOnFailure?: boolean;
}

export interface PlanRunRow {
  readonly acceptance_ref: string;
  readonly capability: string;
  readonly binding_id: string;
  readonly gate: string;
  readonly grn: string;
  readonly verdict: string;
  readonly diagnosis: DiagnoseResult | null;
}

export interface PlanDiagnosisEnvelope {
  readonly contract: "pomaster.plan-diagnosis/v1";
  readonly trigger: { readonly phase: "execution_preflight" | "plan_compile" | "binding_preflight" | "gate_execution" | "gate_recording"; readonly kind: "cli_error" | "gate_result" | "runner_error" };
  readonly original: { readonly error_code: string | null; readonly verdict: string | null; readonly evidence_ref: string | null; readonly binding_id: string | null; readonly gate: string | null };
  readonly condition: "failure" | "blocked" | "inconclusive";
  readonly diagnosis: DiagnoseResult | null;
  readonly diagnosis_error: CliError | null;
  readonly retry: { readonly retryable: boolean; readonly after: string | null };
  readonly next_actions: readonly string[];
}

export interface PlanRunResult {
  readonly task_ref: string;
  readonly execution_id: string;
  readonly inputs_fingerprint: string;
  readonly obligations_total: number;
  readonly recorded: number;
  readonly passed: number;
  readonly partial: boolean;
  readonly rows: readonly PlanRunRow[];
  readonly diagnostics: readonly PlanDiagnosisEnvelope[];
}

function empty(input: PlanRunInput): PlanRunResult {
  return {
    task_ref: input.taskRef,
    execution_id: input.executionId,
    inputs_fingerprint: "",
    obligations_total: 0,
    recorded: 0,
    passed: 0,
    partial: false,
    rows: [],
    diagnostics: [],
  };
}

function fail(
  input: PlanRunInput,
  result: PlanRunResult,
  error: CliError,
  trigger?: PlanDiagnosisEnvelope["trigger"],
): CommandOutcome<PlanRunResult> {
  const phase = trigger?.phase ?? (error.code.startsWith("REALITY_SCOPE_") ? "plan_compile"
    : error.code.startsWith("EXECUTION_") || error.code === "SCHEMA_INVALID" ? "execution_preflight"
      : error.code.startsWith("PLAN_BINDING_") ? "binding_preflight" : "plan_compile");
  const diagnostic = diagnosisForError(error, phase, trigger?.kind ?? "cli_error");
  return failOutcome("plan run", { ...result, diagnostics: [...result.diagnostics, diagnostic] }, [error], [
    `plan run: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

function diagnosisForError(
  error: CliError,
  phase: PlanDiagnosisEnvelope["trigger"]["phase"],
  kind: PlanDiagnosisEnvelope["trigger"]["kind"] = "cli_error",
): PlanDiagnosisEnvelope {
  const retryable = ["REALITY_SCOPE_STALE", "REALITY_SCOPE_UNJUDGEABLE", "PLAN_RUN_RECORD_FAILED", "ENVIRONMENT_ERROR"].includes(error.code);
  return {
    contract: "pomaster.plan-diagnosis/v1",
    trigger: { phase, kind },
    original: { error_code: error.code, verdict: null, evidence_ref: null, binding_id: null, gate: null },
    condition: "blocked", diagnosis: null, diagnosis_error: null,
    retry: { retryable, after: retryable ? error.hint : null },
    next_actions: [error.hint],
  };
}

function conditionOf(verdict: string): PlanDiagnosisEnvelope["condition"] {
  if (verdict === "failed") return "failure";
  if (["blocked", "not_run", "not_configured"].includes(verdict)) return "blocked";
  return "inconclusive";
}

function bindingMatchesProjection(
  binding: ToolBindingRecord,
  projection: VerificationPlanResolvedBinding,
): boolean {
  return (
    binding.id === projection.binding_id &&
    binding.tool === projection.tool &&
    binding.gate === projection.gate &&
    binding.gate_def === projection.gate_def
  );
}

function bindingFingerprint(binding: ToolBindingRecord): string {
  return sha256OfCanonical(binding);
}

function stampedAbsence(
  binding: ToolBindingRecord,
  grn: string,
  ranAtSeq: number,
  taskRef: string,
  verdict: "not_run" | "blocked",
  note: string,
): GateResultRecord {
  return absenceRecord(
    {
      grn,
      gate: binding.gate,
      gateDef: binding.gate_def,
      ranAtSeq,
      tool: binding.tool,
      toolVersion: binding.tool_version_anchor,
      metricDialect: binding.metric_dialect,
      subjectId: taskRef,
      denominatorRefs: [],
    },
    verdict,
    `${note}；${BINDING_ANNOTATION_PREFIX}${binding.id}`,
    0,
    0,
  );
}

function findRecordedObligation(rootDir: string, executionId: string, taskRef: string, acceptanceRef: string, binding: ToolBindingRecord, fingerprint: string): { grn: string; verdict: "passed" } | null {
  try {
    const dir = runsDirPath(rootDir);
    const markers = [
      `acceptance_ref=${acceptanceRef}`,
      `inputs_fingerprint=${fingerprint}`,
      `${BINDING_ANNOTATION_PREFIX}${binding.id}`,
      `binding_fingerprint=${bindingFingerprint(binding)}`,
    ];
    for (const file of readdirSync(dir).filter((name) => /^GRN-[0-9]+\.json$/.test(name)).sort().reverse()) {
      const row = JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
      if (row["execution_id"] !== executionId) continue;
      const result = ((row["gate_result"] as Record<string, unknown> | undefined)?.["result"] as Record<string, unknown> | undefined);
      const scope = result?.["scope"] as Record<string, unknown> | undefined;
      const note = scope?.["note"];
      const noteFields = typeof note === "string" ? note.split("；") : [];
      if (result?.["subject_id"] !== taskRef || !markers.every((marker) => noteFields.includes(marker)) || result["verdict"] !== "passed") continue;
      if (binding.gate === "CONTROL_DATA_FLOW_RUNTIME") {
        const paths = buildStorePaths(rootDir);
        const bindingOutcome = verifyEvidenceBinding({ runRecordPath: join(dir, file), evidenceDir: paths.evidenceDir });
        if (!bindingOutcome.bound) continue;
      }
      return { grn: file.slice(0, -5), verdict: "passed" };
    }
  } catch { /* absence means execute normally */ }
  return null;
}

/** Serial plan execution; stops dispatch after the first fatal execution/recording error. */
export async function runPlanRun(
  rootDir: string,
  input: PlanRunInput,
): Promise<CommandOutcome<PlanRunResult>> {
  let result = empty(input);
  if (!EXECUTION_ID_PATTERN.test(input.executionId)) {
    return fail(input, result, {
      code: "SCHEMA_INVALID",
      message: `--execution-id 词形非法：${input.executionId}`,
      hint: "使用 beginExecution 已登记的 AGX-<4位年份>-<序号> 身份。",
    });
  }
  try {
    const paths = buildStorePaths(rootDir);
    assertExecutionAttachable(paths, input.executionId);
    const execution = readExecutionRecordById(paths, input.executionId);
    if (execution !== null && execution.task_id !== null && execution.task_id !== input.taskRef) {
      return fail(input, result, {
        code: "EXECUTION_TASK_MISMATCH",
        message: `execution_id 已绑定其他 task：${input.executionId} -> ${execution.task_id}`,
        hint: `改用绑定 ${input.taskRef} 的执行身份，或登记 task_id 缺席的真实直连执行；禁止跨 task 借用 AGX 归因。`,
      });
    }
  } catch (error) {
    return fail(
      input,
      result,
      error instanceof GovernanceError
        ? governanceErrorToCliError(error)
        : {
            code: "KERNEL_ERROR",
            message: error instanceof Error ? error.message : String(error),
            hint: "执行身份预检失败；修复 execution 档案后重试，工具尚未启动。",
          },
    );
  }

  const loaded = loadToolBindingRegistry(rootDir);
  if (!loaded.ok) return fail(input, result, loaded.error);

  const compiled = await runPlanCompile(rootDir, {
    taskRef: input.taskRef,
    changed: input.changed,
    consumers: input.consumers,
    faces: input.faces,
    complexity: input.complexity,
    profile: input.profile,
    note: input.note,
  });
  if (!compiled.ok) {
    return fail(input, result, compiled.errors[0] ?? {
      code: "SCHEMA_INVALID",
      message: "Verification Plan 编译失败",
      hint: "修复 task、变更面或 ToolBinding registry 后重试。",
    });
  }

  const requiredItems = compiled.result.items.filter((item) => item.applicability === "REQUIRED");
  const expectedObligations = requiredItems.reduce(
    (total, item) => total + PLAN_CAPABILITY_GATE_NAMES[item.capability].length,
    0,
  );
  const obligations = requiredItems
    .flatMap((item) => item.resolved_bindings.map((binding) => ({ item, binding })));
  result = { ...result, inputs_fingerprint: compiled.result.inputs_fingerprint, obligations_total: expectedObligations };

  if (expectedObligations === 0) {
    return fail(input, result, {
      code: "PLAN_NO_REQUIRED_OBLIGATIONS",
      message: "Verification Plan 没有 REQUIRED gate obligation，禁止零分母成功",
      hint: "修正 task acceptance.requires 或变更面后重新编译并运行。",
    });
  }

  if (requiredItems.some((item) => {
    const expected = PLAN_CAPABILITY_GATE_NAMES[item.capability];
    return expected.some((gate) => !item.resolved_bindings.some((binding) => binding.gate === gate));
  })) {
    return fail(input, result, {
      code: "PLAN_BINDING_AMBIGUOUS",
      message: "至少一个 REQUIRED 计划项没有可核对的 binding/gate/gate_def 身份，执行前拒绝",
      hint: "在 .pomaster/tools/bindings.json 为该 capability 的每个 required gate 登记 ToolBinding 后重新 compile/run。",
    });
  }
  for (const { binding: projection } of obligations) {
    const binding = loaded.registry.bindings.find((candidate) => candidate.id === projection.binding_id);
    if (binding === undefined || !bindingMatchesProjection(binding, projection)) {
      return fail(input, result, {
        code: "PLAN_BINDING_DRIFT",
        message: `计划绑定投影与 registry 漂移：${projection.binding_id}`,
        hint: "重新运行 plan compile/run；禁止执行已漂移的 binding 身份。",
      });
    }
  }

  const stateById = new Map(
    computeBindingStates(rootDir, loaded.registry.bindings, {
      planItems: compiled.result.items,
    }).map((row) => [row.binding_id, row]),
  );
  const bindingById = new Map(loaded.registry.bindings.map((binding) => [binding.id, binding]));
  const rows: PlanRunRow[] = [];

  for (const obligation of obligations) {
    const projection = obligation.binding;
    const binding = bindingById.get(projection.binding_id) as ToolBindingRecord;
    const previous = findRecordedObligation(rootDir, input.executionId, input.taskRef, obligation.item.acceptance_ref, binding, compiled.result.inputs_fingerprint);
    if (previous !== null) {
      rows.push({ acceptance_ref: obligation.item.acceptance_ref, capability: obligation.item.capability, binding_id: binding.id, gate: binding.gate, grn: previous.grn, verdict: previous.verdict, diagnosis: null });
      continue;
    }
    const grn = allocateEvidenceRef(runsDirPath(rootDir), "GRN");
    const store = await createStore(rootDir);
    const ranAtSeq = store.currentSeq ?? 0;
    let record: GateResultRecord;
    let artifactRefs: ReturnType<typeof persistEvidenceArtifact>[] | undefined;
    try {
      const state = stateById.get(binding.id);
      const executed = state?.available === true && state.selected === true
        ? runBindingGate(binding, {
            projectRoot: rootDir,
            grn,
            ranAtSeq,
            subjectId: input.taskRef,
          })
        : null;
      record = executed?.record ?? stampedAbsence(
            binding,
            grn,
            ranAtSeq,
            input.taskRef,
            "not_run",
            `binding unavailable：${state?.gaps.join("；") ?? "六分态缺席"}`,
          );
      artifactRefs = executed?.artifact === undefined
        ? undefined
        : [persistEvidenceArtifact(buildStorePaths(rootDir).evidenceDir, executed.artifact)];
    } catch (error) {
      if (error instanceof GateAdapterError) {
        record = stampedAbsence(binding, grn, ranAtSeq, input.taskRef, "not_run", error.message);
      } else {
        record = stampedAbsence(
          binding,
          grn,
          ranAtSeq,
          input.taskRef,
          "blocked",
          `binding 执行环境异常：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    record = { ...record, scopeNote: `acceptance_ref=${obligation.item.acceptance_ref}；inputs_fingerprint=${compiled.result.inputs_fingerprint}；binding_fingerprint=${bindingFingerprint(binding)}；${record.scopeNote ?? ""}` };
    if (record.gate !== binding.gate || record.gateDef !== binding.gate_def) {
      return fail(input, { ...result, recorded: rows.length, partial: rows.length > 0, rows }, {
        code: "PLAN_BINDING_DRIFT",
        message: `adapter 结果身份漂移：binding=${binding.id} expected=${binding.gate}/${binding.gate_def} actual=${record.gate}/${record.gateDef}`,
        hint: "修复 trusted adapter 与 ToolBinding 的 gate/gate_def 合同；漂移结果不会入账。",
      }, { phase: "gate_execution", kind: "runner_error" });
    }

    const recorded = await runRecordGateRunValue(rootDir, {
      record,
      ...(artifactRefs !== undefined ? { artifactRefs } : {}),
      grn,
      trigger: "on_demand",
      executionId: input.executionId,
      subjects: [input.taskRef],
    });
    if (!recorded.ok || recorded.result.grn === null || recorded.result.verdict === null) {
      return fail(input, { ...result, recorded: rows.length, partial: rows.length > 0, rows }, recorded.errors[0] ?? {
        code: "PLAN_RUN_RECORD_FAILED",
        message: `binding ${binding.id} 的 GRN 入账失败`,
        hint: "已入账 GRN 保持 append-only；修复 store/执行身份后重跑。",
      }, { phase: "gate_recording", kind: "runner_error" });
    }

    let diagnosis: DiagnoseResult | null = null;
    let diagnosisError: CliError | null = null;
    if (recorded.result.verdict === "failed") {
      const diagnosed = await runDiagnose(rootDir, {
        report: `Verification Plan obligation failed: ${obligation.item.acceptance_ref}/${obligation.item.capability}/${binding.gate}`,
        symptom: null,
        domain: null,
        evidence: [recorded.result.grn],
      });
      if (diagnosed.ok) diagnosis = diagnosed.result;
      else diagnosisError = diagnosed.errors[0] ?? null;
    }
    rows.push({
      acceptance_ref: obligation.item.acceptance_ref,
      capability: obligation.item.capability,
      binding_id: binding.id,
      gate: binding.gate,
      grn: recorded.result.grn,
      verdict: recorded.result.verdict,
      diagnosis,
    });
    if (recorded.result.verdict !== "passed") {
      result = { ...result, diagnostics: [...result.diagnostics, {
        contract: "pomaster.plan-diagnosis/v1",
        trigger: { phase: "gate_execution", kind: "gate_result" },
        original: { error_code: null, verdict: recorded.result.verdict, evidence_ref: recorded.result.grn, binding_id: binding.id, gate: binding.gate },
        condition: conditionOf(recorded.result.verdict), diagnosis, diagnosis_error: diagnosisError,
        retry: { retryable: ["blocked", "not_run", "not_configured"].includes(recorded.result.verdict), after: record.scopeNote ?? null },
        next_actions: [record.scopeNote ?? "检查 GRN 证据并修复对应前置条件"],
      }] };
    }
  }

  const passed = rows.filter((row) => row.verdict === "passed").length;
  result = { ...result, recorded: rows.length, passed, partial: false, rows };
  const human = [
    `plan run → ${passed}/${rows.length} REQUIRED obligations passed（task=${input.taskRef}, execution=${input.executionId}）`,
    ...rows.map((row) => `  ${row.verdict.padEnd(15)} ${row.acceptance_ref} · ${row.capability} · ${row.binding_id} · ${row.grn}`),
    "  GRN 已逐项 append-only 入账；本命令不创建 claim、不 independent verify、不 closeout。",
  ];
  if (passed === rows.length && rows.length > 0) return okOutcome("plan run", result, human);
  return failOutcome(
    "plan run",
    result,
    rows.filter((row) => row.verdict !== "passed").map((row) => ({
      code: `GATE_${row.verdict.toUpperCase()}`,
      message: `${row.acceptance_ref}/${row.capability}: verdict=${row.verdict} (${row.grn})`,
      hint: "按对应 GRN scope.note 修复工具、配置或判卷失败后重跑；非 passed 均不构成成功。",
    })),
    human,
  );
}
