/**
 * Brownfield bootstrap task.
 *
 * This uses the normal kernel task object surface. There is no second task
 * ledger: the task is visible to status/session/alerts and can be continued by
 * the regular maintain/permit/verification paths.
 */
import { applyTransaction, createStore, envelopeFromTaskBody, loadTruthIndex, type Store } from "@pomaster/kernel";
import { readBodyEnvelope } from "./projection-common.js";
import { failOutcome, okOutcome, type CliError, type CliWarning, type CommandOutcome } from "./envelope.js";
import type { InitModeDetection, InitReconReport } from "./init-mode.js";
import { architectureAnswers, parseArchitectureId, writeArchitectureProfile, type ArchitectureId, type ArchitectureProfile } from "./architecture-profile.js";
import { applyStackAnswers } from "./baseline.js";
import type { InitFileReport } from "./init.js";

export const PROJECT_IDENTIFICATION_TASK_BASE = "TASK.INIT_PROJECT_IDENTIFICATION";
export const PROJECT_IDENTIFICATION_KIND = "project_identification";

export interface ProjectIdentificationResult {
  readonly state: "created" | "existing" | "not_applicable" | "failed";
  readonly task_id: string | null;
  readonly created: boolean;
}

interface UnknownRecord {
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function findExistingTask(
  rootDir: string,
  store: Store,
): Promise<{ readonly id: string; readonly ids: ReadonlySet<string> } | null> {
  const index = await loadTruthIndex(store);
  const ids = new Set(index.objects.map((row) => String(row.id)));
  for (const row of index.objects) {
    if (!String(row.id).startsWith("TASK.")) continue;
    const loaded = await readBodyEnvelope(rootDir, { ...(row as unknown as UnknownRecord), body_ref: row.bodyRef });
    const body = "error" in loaded ? null : loaded.body;
    const payload = isRecord(body?.payload) ? body.payload : null;
    if (payload?.init_task === PROJECT_IDENTIFICATION_KIND) {
      return { id: String(row.id), ids };
    }
  }
  return { id: "", ids };
}

function candidateId(ids: ReadonlySet<string>): string {
  if (!ids.has(PROJECT_IDENTIFICATION_TASK_BASE)) return PROJECT_IDENTIFICATION_TASK_BASE;
  let n = 2;
  while (ids.has(`${PROJECT_IDENTIFICATION_TASK_BASE}_${n}`)) n += 1;
  return `${PROJECT_IDENTIFICATION_TASK_BASE}_${n}`;
}

function detectionFacts(detection: InitModeDetection): Readonly<Record<string, unknown>> {
  if (detection.kind !== "brownfield_candidate") return { kind: detection.kind };
  return {
    kind: detection.kind,
    source_files: detection.summary.source_files,
    migration_stacks: [...detection.summary.migration_stacks],
    sbom_tool: detection.summary.sbom_tool,
  };
}

/** Create the one brownfield identification task, preserving evidence and unknowns. */
export async function ensureProjectIdentificationTask(
  rootDir: string,
  detection: InitModeDetection,
  recon: InitReconReport | null,
  warnings: CliWarning[],
): Promise<ProjectIdentificationResult> {
  if (detection.kind !== "brownfield_candidate") {
    return { state: "not_applicable", task_id: null, created: false };
  }

  try {
    const store = await createStore(rootDir);
    const existing = await findExistingTask(rootDir, store);
    if (existing !== null && existing.id !== "") {
      return { state: "existing", task_id: existing.id, created: false };
    }
    const taskId = candidateId(existing?.ids ?? new Set<string>());
    const reconRefs = recon?.legs === null || recon === null
      ? []
      : [
          recon.legs.import_graph.observation_id,
          recon.legs.migrations.receipt_id,
          recon.legs.sbom.observation_id,
        ].filter((ref): ref is string => ref !== null);
    const facts = detectionFacts(detection);
    const reconState = recon === null
      ? { status: "NOT_RUN", evidence_refs: [] as readonly string[] }
      : { status: recon.status, evidence_refs: reconRefs };
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: taskId as never,
            kind: "task_object",
            axisProfile: "task_default",
            axes: {
              lifecycle: "PROPOSED",
              confidence: "UNRESOLVED",
              evidence: "PLANNED",
              change: "STABLE",
            },
            titleZh: "项目识别与架构确认",
            authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
            origin: "ingested",
            payload: {
              init_task: PROJECT_IDENTIFICATION_KIND,
              intent: "先总结当前项目用途、目录职责、运行方式、依赖边界和实际架构，再确认项目治理 profile。",
              expected_outcome: "产出可追溯的项目摘要与架构确认；低置信度事实保留 UNKNOWN，不把观察候选写成确认事实。",
              identification_status: "pending",
              observed_facts: facts,
              recon: reconState,
              unknowns: [
                "business_purpose",
                "primary_user_and_entrypoints",
                "architecture_boundaries",
                "runtime_and_deployment_topology",
                "governance_profile",
              ],
              acceptance: [
                { criterion: "项目用途、主要入口和目录职责已由识别任务记录", claim: null },
                { criterion: "项目实际架构、未知项和证据来源已由 Owner/agent 确认", claim: null },
              ],
              class_scan_result: {
                scope: "brownfield project identification task（定义任务，不扫描代码缺陷）",
                hits: 0,
                fixed_count: 0,
                regression_case_ref: "GRN.POMASTER.INIT_PROJECT_IDENTIFICATION",
              },
            },
            sources: [
              {
                type: "human_directive",
                ref: "pomaster:init:project-identification",
                capturedBy: "tool:pomaster-init",
                pin: { baseline: detection.kind },
              },
            ],
            notesMd: [
              "该 TASK 由非空目录进入 init 时自动创建。",
              "先完成项目识别和架构确认，再进入普通开发 TASK；UNKNOWN 必须保留并附证据来源。",
              `recon evidence refs: ${reconRefs.length > 0 ? reconRefs.join(", ") : "暂无（NOT_RUN）"}`,
            ].join("\n"),
          },
        },
      ],
      note: "pomaster init 自动创建 brownfield 项目识别 TASK（复用 kernel task ledger）",
    });
    return { state: "created", task_id: taskId, created: true };
  } catch (err) {
    warnings.push({
      code: "INIT_PROJECT_IDENTIFICATION_FAILED",
      message: `项目识别 TASK 创建失败：${err instanceof Error ? err.message : String(err)}`,
      hint: "init 其它产物保留；修复 store/authority 后重跑 pomaster init，缺席任务会按幂等规则补建。",
    });
    return { state: "failed", task_id: null, created: false };
  }
}

export interface ProjectIdentificationReportInput {
  readonly taskId: string;
  readonly purpose: string;
  readonly architecture: string;
  readonly stack: readonly string[];
  readonly directories: readonly string[];
  readonly commands: readonly string[];
  readonly evidence: readonly string[];
  readonly unknowns: readonly string[];
}

export interface ProjectIdentificationConfirmInput {
  readonly taskId: string;
  readonly actor: string;
}

export interface ProjectIdentificationCommandResult {
  readonly task_id: string;
  readonly status: "reported" | "confirmed";
  readonly architecture: ArchitectureId;
  readonly architecture_profile: ArchitectureProfile | null;
  readonly files: readonly InitFileReport[];
  readonly change: "APPLIED" | "NO_CHANGE";
}

type LoadedIdentificationTask = {
  readonly store: Store;
  readonly body: UnknownRecord;
  readonly payload: UnknownRecord;
};

async function loadIdentificationTask(
  rootDir: string,
  taskId: string,
): Promise<LoadedIdentificationTask | { readonly error: { readonly code: string; readonly message: string; readonly hint: string } }> {
  try {
    const store = await createStore(rootDir);
    const index = await loadTruthIndex(store);
    const row = index.objects.find((entry) => entry.id === taskId);
    if (row === undefined) {
      return { error: { code: "OBJECT_NOT_FOUND", message: `项目识别 TASK 不在册：${taskId}`, hint: "先在非空未初始化目录运行 pomaster init。" } };
    }
    const loaded = await readBodyEnvelope(rootDir, { ...(row as unknown as UnknownRecord), body_ref: row.bodyRef });
    if ("error" in loaded) return loaded;
    const payload = isRecord(loaded.body.payload) ? loaded.body.payload : {};
    if (loaded.body.kind !== "task_object" || payload.init_task !== PROJECT_IDENTIFICATION_KIND) {
      return { error: { code: "SCHEMA_INVALID", message: `${taskId} 不是 init 创建的项目识别 TASK`, hint: `使用 ${PROJECT_IDENTIFICATION_TASK_BASE} 或 init 返回的 project_identification.task_id。` } };
    }
    return { store, body: loaded.body, payload };
  } catch (err) {
    return { error: { code: "KERNEL_ERROR", message: err instanceof Error ? err.message : String(err), hint: "修复 store 后重试；命令不会旁路 kernel 写入。" } };
  }
}

function normalizedList(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort();
}

function failure(
  action: string,
  input: { readonly taskId: string },
  error: { readonly code: string; readonly message: string; readonly hint: string },
): CommandOutcome<ProjectIdentificationCommandResult> {
  return failOutcome(
    action,
    { task_id: input.taskId, status: "reported", architecture: "vue", architecture_profile: null, files: [], change: "NO_CHANGE" },
    [error],
    [`${action}: FAILED — ${error.code}`, `  ${error.message}`, `  hint: ${error.hint}`],
  );
}

export async function runProjectIdentificationReport(
  rootDir: string,
  input: ProjectIdentificationReportInput,
): Promise<CommandOutcome<ProjectIdentificationCommandResult>> {
  const architecture = parseArchitectureId(input.architecture);
  if (!architecture.ok) return failure("project-identification report", input, { code: "SCHEMA_INVALID", message: architecture.message, hint: architecture.hint });
  const purpose = input.purpose.trim();
  const stack = normalizedList(input.stack);
  const directories = normalizedList(input.directories);
  const commands = normalizedList(input.commands);
  const evidence = normalizedList(input.evidence);
  const unknowns = normalizedList(input.unknowns);
  if (purpose.length === 0 || stack.length === 0 || directories.length === 0 || commands.length === 0 || evidence.length === 0) {
    return failure("project-identification report", input, {
      code: "SCHEMA_INVALID",
      message: "识别报告缺必填字段（purpose/stack/directories/commands/evidence 均须非空）",
      hint: "unknowns 可为空；其余字段必须来自仓库证据，禁止用猜测补齐。",
    });
  }
  const loaded = await loadIdentificationTask(rootDir, input.taskId);
  if ("error" in loaded) return failure("project-identification report", input, loaded.error);
  if (loaded.payload.identification_status === "completed") {
    return failure("project-identification report", input, { code: "PROJECT_IDENTIFICATION_ALREADY_CONFIRMED", message: `${input.taskId} 已由 Owner 确认`, hint: "架构换型须走显式治理变更，不能重写已确认识别报告。" });
  }
  const report = { purpose, architecture: architecture.id, stack, directories, commands, evidence, unknowns };
  const existing = isRecord(loaded.payload.report) ? loaded.payload.report : null;
  if (loaded.payload.identification_status === "reported" && JSON.stringify(existing) === JSON.stringify(report)) {
    return okOutcome("project-identification report", { task_id: input.taskId, status: "reported", architecture: architecture.id, architecture_profile: null, files: [], change: "NO_CHANGE" }, [`project-identification report ${input.taskId} → NO_CHANGE（等待 Owner confirm）`]);
  }
  try {
    await applyTransaction(loaded.store, {
      ops: [{ op: "upsert_object", envelope: envelopeFromTaskBody(loaded.body, { ...loaded.payload, identification_status: "reported", report, owner_confirmation: null }, input.taskId) }],
      authorityRef: input.taskId as never,
      note: "提交 brownfield 项目识别报告；尚未确认架构，零治理生成",
    });
  } catch (err) {
    return failure("project-identification report", input, { code: "KERNEL_ERROR", message: err instanceof Error ? err.message : String(err), hint: "识别报告必须经 task_object 全信封事务写入。" });
  }
  return okOutcome("project-identification report", { task_id: input.taskId, status: "reported", architecture: architecture.id, architecture_profile: null, files: [], change: "APPLIED" }, [`project-identification report ${input.taskId} → APPLIED`, `  next: pomaster project-identification confirm ${input.taskId} --actor human:<owner>`]);
}

export async function runProjectIdentificationConfirm(
  rootDir: string,
  input: ProjectIdentificationConfirmInput,
): Promise<CommandOutcome<ProjectIdentificationCommandResult>> {
  if (!/^human:[^\s:]+$/.test(input.actor)) {
    return failure("project-identification confirm", input, { code: "SCHEMA_INVALID", message: "--actor 必须是 human:<name>", hint: "该步骤是 Owner 显式确认闸，agent/tool 身份不能代签。" });
  }
  const loaded = await loadIdentificationTask(rootDir, input.taskId);
  if ("error" in loaded) return failure("project-identification confirm", input, loaded.error);
  const report = isRecord(loaded.payload.report) ? loaded.payload.report : null;
  const architecture = parseArchitectureId(typeof report?.architecture === "string" ? report.architecture : undefined);
  if (loaded.payload.identification_status !== "reported" && loaded.payload.identification_status !== "completed") {
    return failure("project-identification confirm", input, { code: "PROJECT_IDENTIFICATION_REPORT_REQUIRED", message: "项目识别报告尚未提交", hint: `先运行 pomaster project-identification report ${input.taskId} ...` });
  }
  if (!architecture.ok) return failure("project-identification confirm", input, { code: "SCHEMA_INVALID", message: architecture.message, hint: architecture.hint });
  const files: InitFileReport[] = [];
  // Keep the task active until every architecture-bound governance write has
  // succeeded. A conflict or I/O failure must not hide the identification task
  // from next-action while leaving the project only partially governed.
  const generated = await writeArchitectureProfile(rootDir, architecture.id, files, { source: "owner_confirmed_task", confirmedTaskRef: input.taskId });
  if (!generated.ok) return failure("project-identification confirm", input, { code: generated.code, message: generated.message, hint: generated.hint });
  const generationErrors: CliError[] = [];
  await applyStackAnswers(rootDir, architectureAnswers(architecture.id), files, generationErrors);
  if (generationErrors.length > 0) {
    const first = generationErrors[0];
    return failure("project-identification confirm", input, {
      code: first?.code ?? "INVALID_STATE",
      message: first?.message ?? "架构 baseline 回填失败",
      hint: first?.hint ?? "修复 baseline 文件后重试；识别 TASK 保持 active。",
    });
  }
  if (loaded.payload.identification_status !== "completed") {
    try {
      await applyTransaction(loaded.store, {
        ops: [{ op: "upsert_object", envelope: envelopeFromTaskBody(loaded.body, { ...loaded.payload, identification_status: "completed", owner_confirmation: { actor: input.actor, architecture: architecture.id } }, input.taskId) }],
        authorityRef: input.taskId as never,
        note: "Owner 确认项目识别报告与架构 profile",
      });
    } catch (err) {
      return failure("project-identification confirm", input, { code: "KERNEL_ERROR", message: err instanceof Error ? err.message : String(err), hint: "Owner 确认必须经 task_object 全信封事务写入。" });
    }
  }
  const changed = loaded.payload.identification_status !== "completed" || files.some((file) => file.action !== "unchanged");
  return okOutcome("project-identification confirm", { task_id: input.taskId, status: "confirmed", architecture: architecture.id, architecture_profile: generated.profile, files, change: changed ? "APPLIED" : "NO_CHANGE" }, [`project-identification confirm ${input.taskId} → ${changed ? "APPLIED" : "NO_CHANGE"}`, `  architecture: ${architecture.id}（Owner ${input.actor}）`]);
}
