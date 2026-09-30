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
  assertRunSourceSnapshot,
  buildStorePaths,
  compareSourceSnapshots,
  createStore,
  persistEvidenceArtifact,
  readExecutionRecordById,
  sha256OfCanonical,
  verifyEvidenceBinding,
  type EvidencePurposeValue,
  type EvidenceSourceSnapshot,
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
import { captureEvidenceBaselineInputs } from "./evidence-qualification.js";
import { runDiagnose, type DiagnoseResult } from "./diagnose.js";
import { detectBrowserLegAvailable, runPlanCompile, type PlanCompileInput } from "./plan.js";
import { governanceErrorToCliError } from "./permit.js";
import { runRecordGateRunValue } from "./record.js";
import { captureEvidenceSourceSnapshot } from "./source-snapshot.js";
import { runsDirPath } from "./store-layout.js";
import { computeBindingStates, loadToolBindingRegistry } from "./tools.js";
import {
  judgeRuntimeObligations,
  scanBrowserLegGrnBacked,
  loadStaticControlDenominatorFromDisk,
  type RuntimeObligationRow,
} from "./plan-runtime-obligations.js";

export interface PlanRunInput extends Omit<PlanCompileInput, "inputFile"> {
  readonly taskRef: string;
  readonly executionId: string;
  readonly diagnoseOnFailure?: boolean;
  /**
   * FR-05 共享依赖/配置面（W2.2）：除任务变更面（changed）外显式并入 source 相关分母的
   * 共享路径（如 tsconfig/package.json/共享样式/SQL/后端源码——零扩展名白名单，声明即
   * 进入分母）；声明外变化零影响。缺席 = 分母仅 changed。
   */
  readonly sharedSourcePaths?: readonly string[];
  /**
   * 证据用途声明（W2-FR11 Case D 归属）：worker_local = worker 本域中间证据（GRN
   * append-only 保留在盘，终验 cohort 不消费）；final_stable = 编排器稳定窗口终验证据。
   * 缺席 = 未声明（legacy 兼容——不冒充任一用途，消费面沿既有行为）。runFinalize 强制
   * final_stable（编排器语义），本入参显式声明供 worker/编排两侧区分归属。
   */
  readonly verificationPurpose?: EvidencePurposeValue;
}

export interface PlanRunRow {
  readonly acceptance_ref: string;
  /** W1-FR04 场景身份（场景化条目非 null；legacy 条目 null——消费矩阵零破坏）。 */
  readonly scenario_ref: string | null;
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

/**
 * 复用身份判定（W1-FR04 起含场景身份；W2-FR05 起含源码稳定性）：同 AGX + task +
 * acceptance + scenario + plan fingerprint + binding id/fingerprint 且 verdict=passed
 * （runtime gate 另核 artifact 绑定）方可复用——场景 marker 缺席的历史 GRN 不满足带
 * 场景条目的 marker 集合（不会被借作场景证据），带场景条目也不会互相覆盖（同 gate
 * 不同场景 marker 互斥）。
 *
 * W2-FR05 源码稳定性复用闸：候选 GRN 主张了 source_snapshot 时——窗口 fresh 且产出时
 * 相关面与本次运行启动捕获一致（kernel 唯一比较核）方可复用，**相关面变了不直接复用
 * 旧绿**（旧 GRN append-only 保留，重新执行产生新证据）；窗口漂移的候选同样不复用
 * （不稳定窗口的绿不证明稳定终态）。快照损坏/畸形 → 视同不复用（重执行是保守结果，
 * 且既有 GRN 不动）；候选无 snapshot（legacy）→ 缺席诚实走既有行为（不反填、不全局
 * 硬拒绝）。反向（本次运行未声明分母而候选有 snapshot）亦不复用——无面可判不冒充对齐。
 */
function findRecordedObligation(rootDir: string, executionId: string, taskRef: string, acceptanceRef: string, scenarioRef: string | null, binding: ToolBindingRecord, fingerprint: string, currentSource: EvidenceSourceSnapshot | undefined): { grn: string; verdict: "passed" } | null {
  try {
    const dir = runsDirPath(rootDir);
    const markers = [
      `acceptance_ref=${acceptanceRef}`,
      ...(scenarioRef !== null ? [`scenario_ref=${scenarioRef}`] : []),
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
      const snapshot = row["source_snapshot"];
      if (snapshot !== undefined) {
        if (currentSource === undefined) continue;
        try {
          assertRunSourceSnapshot(snapshot);
          if (snapshot.window.state !== "fresh") continue;
          if (compareSourceSnapshots(snapshot.after, currentSource).state !== "fresh") continue;
        } catch {
          continue; // 畸形/损坏快照 → 不复用（重执行保守；既有 GRN 不动，损伤呈报归资格链）
        }
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

  // 行序按 obligation 序保持（复用行与入账行交错时仍逐 obligation 对位——旧实现单循环
  // 天然保序；W2.2 两段化后经 rowByIndex 同位回填）。
  const rowByIndex = new Map<number, PlanRunRow>();
  const rowsSoFar = (): PlanRunRow[] =>
    obligations.flatMap((_, index) => {
      const row = rowByIndex.get(index);
      return row === undefined ? [] : [row];
    });

  // —— W2-FR05 producer 前采样（工具启动前；对照 check.ts --gates 同源路径）——
  // baseline snapshot（captureEvidenceBaselineInputs 单源）+ 相关源码面 before 捕获。
  // 分母 = 任务变更面（changed，plan fingerprint 的 changeSurface 同一面）+ 显式共享
  // 依赖/配置（sharedSourcePaths）；空分母不捕获不主张（缺席诚实——无 snapshot 的 GRN
  // 走 legacy 语义，非静默放行）。
  const sourceSurface = [...new Set([...(input.changed ?? []), ...(input.sharedSourcePaths ?? [])])].sort();
  const sourceBefore = sourceSurface.length > 0
    ? captureEvidenceSourceSnapshot(rootDir, { relevantPaths: sourceSurface })
    : undefined;
  const baselineInputs = await captureEvidenceBaselineInputs(rootDir);

  // —— pass 1a：复用判定（先于 GRN 分配——两段化后分配不再是逐条「落账即占号」，
  // 须对需执行义务一次性分配连续号段，与 check.ts allocateGateRecipeGrns 同形）——
  interface PendingObligation {
    readonly index: number;
    readonly item: (typeof obligations)[number]["item"];
    readonly binding: ToolBindingRecord;
    readonly grn: string;
    readonly record: GateResultRecord;
    readonly artifactRefs: ReturnType<typeof persistEvidenceArtifact>[] | undefined;
    /** W5：runtime/静态 CDF artifact 原始字节（义务判定消费；无 artifact 行 undefined）。 */
    readonly artifactBytes: Uint8Array | undefined;
  }
  const needing: { index: number; item: (typeof obligations)[number]["item"]; binding: ToolBindingRecord }[] = [];
  for (let obligationIndex = 0; obligationIndex < obligations.length; obligationIndex += 1) {
    const obligation = obligations[obligationIndex] as (typeof obligations)[number];
    const binding = bindingById.get(obligation.binding.binding_id) as ToolBindingRecord;
    const previous = findRecordedObligation(rootDir, input.executionId, input.taskRef, obligation.item.acceptance_ref, obligation.item.scenario_ref ?? null, binding, compiled.result.inputs_fingerprint, sourceBefore);
    if (previous !== null) {
      rowByIndex.set(obligationIndex, { acceptance_ref: obligation.item.acceptance_ref, scenario_ref: obligation.item.scenario_ref ?? null, capability: obligation.item.capability, binding_id: binding.id, gate: binding.gate, grn: previous.grn, verdict: previous.verdict, diagnosis: null });
      continue;
    }
    needing.push({ index: obligationIndex, item: obligation.item, binding });
  }
  const grnBase = allocateEvidenceRef(runsDirPath(rootDir), "GRN");
  const grnBaseNumber = Number(grnBase.slice("GRN-".length));

  // —— pass 1b：工具执行（不落账——窗口 after 捕获须覆盖全部工具执行的写入窗口，
  // 单循环入账会把「执行后状态」劈成逐 GRN 端点，A→B 跨 GRN 漂移不可见） ——
  const pending: PendingObligation[] = [];
  let bindingDrift: CliError | null = null;

  for (let needingIndex = 0; needingIndex < needing.length; needingIndex += 1) {
    const entry = needing[needingIndex] as (typeof needing)[number];
    const binding = entry.binding;
    const grn = `GRN-${String(grnBaseNumber + needingIndex).padStart(4, "0")}`;
    const store = await createStore(rootDir);
    const ranAtSeq = store.currentSeq ?? 0;
    let record: GateResultRecord;
    let artifactRefs: ReturnType<typeof persistEvidenceArtifact>[] | undefined;
    let artifactBytes: Uint8Array | undefined;
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
      artifactBytes = executed?.artifact?.bytes;
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

    // W1-FR04：场景身份以 scenario_ref=<局部键> 进 note marker（run 复用/终验 cohort
    // 键共用锚）；无场景条目不带此段（legacy GRN note 字节不变）。
    record = { ...record, scopeNote: `acceptance_ref=${entry.item.acceptance_ref}${entry.item.scenario_ref == null ? "" : `；scenario_ref=${entry.item.scenario_ref}`}；inputs_fingerprint=${compiled.result.inputs_fingerprint}；binding_fingerprint=${bindingFingerprint(binding)}；${record.scopeNote ?? ""}` };
    if (record.gate !== binding.gate || record.gateDef !== binding.gate_def) {
      bindingDrift = {
        code: "PLAN_BINDING_DRIFT",
        message: `adapter 结果身份漂移：binding=${binding.id} expected=${binding.gate}/${binding.gate_def} actual=${record.gate}/${record.gateDef}`,
        hint: "修复 trusted adapter 与 ToolBinding 的 gate/gate_def 合同；漂移结果不会入账。",
      };
      break;
    }
    pending.push({ index: entry.index, item: entry.item, binding, grn, record, artifactRefs, artifactBytes });
  }

  // —— W5 runtime 场景义务判定（契约 §1-§4；pass 1b 后、入账前）——
  // static 交叉核验 + oracle 声明链 + seam 双腿比较：义务未满足 = 编排层 cap 非绿
  // （工具真实 verdict 保留留痕；cap 只降不升——已有非绿行仅追加缺口注记）。
  const w5Rows: RuntimeObligationRow[] = pending
    .filter((entry) => entry.binding.gate === "CONTROL_DATA_FLOW" || entry.binding.gate === "CONTROL_DATA_FLOW_RUNTIME")
    .map((entry) => {
      const projection = entry.item.resolved_bindings.find((row) => row.binding_id === entry.binding.id);
      return {
        grn: entry.grn,
        gate: entry.binding.gate,
        binding_id: entry.binding.id,
        seam_role: projection?.seam_role ?? entry.binding.seam_role ?? null,
        acceptance_ref: entry.item.acceptance_ref,
        scenario_ref: entry.item.scenario_ref ?? null,
        scenario_oracle: entry.item.scenario_oracle ?? null,
        seam_obligation: entry.item.seam_obligation ?? null,
        artifact_bytes: entry.artifactBytes ?? null,
      };
    });
  const hasPendingStatic = w5Rows.some((row) => row.gate === "CONTROL_DATA_FLOW");
  const diskDenominator = hasPendingStatic
    ? null
    : loadStaticControlDenominatorFromDisk(rootDir, input.executionId, input.taskRef);
  const w5Caps = judgeRuntimeObligations({
    rows: w5Rows,
    staticDenominatorFromDisk: diskDenominator,
    browserToolPresent: detectBrowserLegAvailable(rootDir),
    browserLegBacked: scanBrowserLegGrnBacked(rootDir, input.executionId, input.taskRef),
  });
  const cappedPending = pending.map((entry) => {
    const cap = w5Caps.get(entry.grn);
    if (cap === undefined) return entry;
    if (entry.record.verdict === "passed") {
      return { ...entry, record: { ...entry.record, verdict: cap.verdict, verdictCapReason: cap.reason, scopeNote: `${entry.record.scopeNote ?? ""}；verdict_before_obligation_cap=passed；w5_obligation_cap=${cap.reason}；${cap.note}` } };
    }
    return { ...entry, record: { ...entry.record, scopeNote: `${entry.record.scopeNote ?? ""}；w5_obligation_cap=${cap.reason}；${cap.note}` } };
  });
  pending.length = 0;
  pending.push(...cappedPending);

  // —— 运行窗口 after 捕获 + window 判定（覆盖全部工具执行；before/after 同一
  // sourceSurface——「执行后捕获同一面」；端点相等 ≠ 无 A→B→A，kernel 合同显式边界） ——
  const sourceAfter = sourceBefore !== undefined
    ? captureEvidenceSourceSnapshot(rootDir, { relevantPaths: sourceSurface })
    : undefined;
  const runSourceSnapshot = sourceBefore !== undefined && sourceAfter !== undefined
    ? { before: sourceBefore, after: sourceAfter, window: compareSourceSnapshots(sourceBefore, sourceAfter) }
    : undefined;

  // —— pass 2：GRN 逐条入账（kernel record_gate_run 唯一写路径；遇首个入账失败即停
  // ——partial 语义与既有行为一致）。baseline_inputs / source_snapshot 与 check.ts 既有
  // producer 路径同源携带（W2.2 已知缺口修复：值通路贯穿，不再只序列化 gate_result/
  // artifact_refs）。
  for (const item of pending) {
    const recorded = await runRecordGateRunValue(rootDir, {
      record: item.record,
      ...(item.artifactRefs !== undefined ? { artifactRefs: item.artifactRefs } : {}),
      grn: item.grn,
      trigger: "on_demand",
      executionId: input.executionId,
      subjects: [input.taskRef],
      ...(baselineInputs !== undefined ? { baselineInputs } : {}),
      ...(runSourceSnapshot !== undefined ? { sourceSnapshot: runSourceSnapshot } : {}),
      ...(input.verificationPurpose !== undefined ? { evidencePurpose: input.verificationPurpose } : {}),
    });
    if (!recorded.ok || recorded.result.grn === null || recorded.result.verdict === null) {
      return fail(input, { ...result, recorded: rowsSoFar().length, partial: rowsSoFar().length > 0, rows: rowsSoFar() }, recorded.errors[0] ?? {
        code: "PLAN_RUN_RECORD_FAILED",
        message: `binding ${item.binding.id} 的 GRN 入账失败`,
        hint: "已入账 GRN 保持 append-only；修复 store/执行身份后重跑。",
      }, { phase: "gate_recording", kind: "runner_error" });
    }

    let diagnosis: DiagnoseResult | null = null;
    let diagnosisError: CliError | null = null;
    if (recorded.result.verdict === "failed") {
      const diagnosed = await runDiagnose(rootDir, {
        report: `Verification Plan obligation failed: ${item.item.acceptance_ref}/${item.item.capability}/${item.binding.gate}`,
        symptom: null,
        domain: null,
        evidence: [recorded.result.grn],
      });
      if (diagnosed.ok) diagnosis = diagnosed.result;
      else diagnosisError = diagnosed.errors[0] ?? null;
    }
    rowByIndex.set(item.index, {
      acceptance_ref: item.item.acceptance_ref,
      scenario_ref: item.item.scenario_ref ?? null,
      capability: item.item.capability,
      binding_id: item.binding.id,
      gate: item.binding.gate,
      grn: recorded.result.grn,
      verdict: recorded.result.verdict,
      diagnosis,
    });
    if (recorded.result.verdict !== "passed") {
      result = { ...result, diagnostics: [...result.diagnostics, {
        contract: "pomaster.plan-diagnosis/v1",
        trigger: { phase: "gate_execution", kind: "gate_result" },
        original: { error_code: null, verdict: recorded.result.verdict, evidence_ref: recorded.result.grn, binding_id: item.binding.id, gate: item.binding.gate },
        condition: conditionOf(recorded.result.verdict), diagnosis, diagnosis_error: diagnosisError,
        retry: { retryable: ["blocked", "not_run", "not_configured"].includes(recorded.result.verdict), after: item.record.scopeNote ?? null },
        next_actions: [item.record.scopeNote ?? "检查 GRN 证据并修复对应前置条件"],
      }] };
    }
  }

  // drift 中断在入账之后呈报（已执行 GRN 保留 append-only 落账——旧实现逐条入账同态）。
  if (bindingDrift !== null) {
    return fail(input, { ...result, recorded: rowsSoFar().length, partial: rowsSoFar().length > 0, rows: rowsSoFar() }, bindingDrift, { phase: "gate_execution", kind: "runner_error" });
  }

  const rows = rowsSoFar();
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
