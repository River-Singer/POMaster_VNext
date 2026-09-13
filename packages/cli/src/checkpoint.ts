/**
 * checkpoint.ts —— `pomaster checkpoint` 命令面（W4-S2 · 09-10 PRD §6-1「优先复用
 * 现有记录，不按清单创建新库」+ 战役 W4 R4-1）。
 *
 * 命令组（两子命令；词形 SP 提案待 Owner 追认）：
 * - save <task-id>  组装恢复所需引用集快照落盘（state/checkpoints/CKPT-*.json）：
 *                   task 锚 / reconcile 判卷引用（--permit）/ execution 在途清单
 *                   （--execution → countExecutionInflightReceipts 结果，W4-S1 同轴）/
 *                   negative_history·unknowns 引用 / 封存 trace 引用 / workspace
 *                   git 锚。判卷权威在 kernel saveCheckpoint（引用逐项存在性校验
 *                   fail-closed 零落盘）；本面只做 workspace 锚的 git 只读采集与呈现。
 * - show <CKPT-n>   引用面纯读呈现（零写入字节快照钉；缺席 CHECKPOINT_NOT_FOUND）。
 *
 * 组合关系（分层，非重复——W4-S1 已落「恢复先对账」）：`session attach
 * --reconcile <permit>` 是恢复时点的新鲜度判定（⑥拍前置闸）；checkpoint show
 * 是「恢复所需引用面一键可见」（保存时点引用快照）。save/show 不做任何新鲜度
 * 判定、不冒充恢复动作链——人读面恒带恢复通路路标（恢复先对账）。
 *
 * 诚实纪律：
 * - workspace 锚由本面 git 只读采集（rev-parse HEAD + status --porcelain 计数），
 *   采集失败/非 git 工区 = anchor absent **显式申报**（execution-audit 锚定诚实
 *   同族——无锚不是伪造「干净」；本命令不做 worktree 根守卫——checkpoint 是引用
 *   快照非 diff 审计，锚语义如实标注「保存时点快照，非实时」）；
 * - 红线：零新 canonical kind（分区档案定位沿 trace seal）；落盘 ⊆
 *   state/checkpoints/ 单分区（字节快照测试钉）；不自动创建（显式命令触发）。
 */
import { spawnSync } from "node:child_process";
import {
  buildStorePaths,
  CHECKPOINT_ID_PATTERN,
  CHECKPOINT_SCHEMA,
  createStore,
  GovernanceError,
  readCheckpoint,
  saveCheckpoint,
  type CheckpointRecord,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";

/** git 只读采集超时上界（本地操作秒级即回；execution-audit 同款防挂死取向）。 */
const CHECKPOINT_GIT_TIMEOUT_MS = 30_000 as const;

/** 64MB（大仓 status 面回退 SPAWN_MAX_BUFFER_BYTES 同量级；直接字面量避免 gauntlet 反向依赖）。 */
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/**
 * workspace 锚 git 只读采集（rev-parse HEAD + status --porcelain 计数）。
 * 任何一步失败（非 git 工区/git 异常）→ undefined = anchor absent 显式申报
 * （kernel workspaceAnchorOf 落 anchor_status absent；不伪造锚）。
 */
function collectWorkspaceAnchor(
  rootDir: string,
): { gitHead: string; dirtyTrackedChanged: number; dirtyUntracked: number } | undefined {
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    timeout: CHECKPOINT_GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
    encoding: "utf8",
    windowsHide: true,
  });
  if (head.status !== 0 || head.error != null || typeof head.stdout !== "string") return undefined;
  const gitHead = head.stdout.trim();
  if (gitHead.length === 0) return undefined;
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: rootDir,
    timeout: CHECKPOINT_GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
    encoding: "utf8",
    windowsHide: true,
  });
  if (status.status !== 0 || status.error != null || typeof status.stdout !== "string") {
    return undefined;
  }
  const lines = status.stdout.split("\n").filter((line) => line.length > 0);
  const untracked = lines.filter((line) => line.startsWith("??")).length;
  return {
    gitHead,
    dirtyTrackedChanged: lines.length - untracked,
    dirtyUntracked: untracked,
  };
}

/** GovernanceError → CliError 归一（governance 码位透传；非治理错误 KERNEL_ERROR）。 */
function toCliError(err: unknown): CliError {
  if (err instanceof GovernanceError) return governanceErrorToCliError(err);
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "查看 docs/kernel-api.md §33（checkpoint 契约）；若为环境异常请勿静默降级。",
  };
}

// ============================================================
// checkpoint save
// ============================================================

export interface CheckpointSaveInput {
  readonly taskRef: string;
  readonly permitRef?: string;
  readonly executionId?: string;
  readonly ckptId?: string;
  readonly note?: string;
}

/** save 结果（snake_case 机读面）= kernel 记录闭形态逐字 + 落盘位与幂等旗。 */
export interface CheckpointSaveResult {
  readonly checkpoint_id: string;
  readonly schema: typeof CHECKPOINT_SCHEMA;
  readonly task_ref: string;
  readonly permit_ref: string | null;
  readonly execution: CheckpointRecord["execution"];
  readonly task_surface: CheckpointRecord["task_surface"];
  readonly unknowns_refs: readonly string[];
  readonly trace_ref: CheckpointRecord["trace_ref"];
  readonly workspace_anchor: CheckpointRecord["workspace_anchor"];
  readonly note: string | null;
  readonly captured_at_seq: number;
  readonly path: string;
  /** true = 显式同号重放且引用集逐字节一致（零写入幂等短路——store 幂等纪律）。 */
  readonly replayed: boolean;
}

function saveResultOf(result: {
  record: CheckpointRecord;
  path: string;
  replayed: boolean;
}): CheckpointSaveResult {
  return {
    checkpoint_id: result.record.checkpoint_id,
    schema: result.record.schema,
    task_ref: result.record.task_ref,
    permit_ref: result.record.permit_ref,
    execution: result.record.execution,
    task_surface: result.record.task_surface,
    unknowns_refs: result.record.unknowns_refs,
    trace_ref: result.record.trace_ref,
    workspace_anchor: result.record.workspace_anchor,
    note: result.record.note,
    captured_at_seq: result.record.captured_at_seq,
    path: result.path,
    replayed: result.replayed,
  };
}

function emptyRecord(): CheckpointRecord {
  return {
    checkpoint_id: "",
    schema: CHECKPOINT_SCHEMA,
    task_ref: "",
    permit_ref: null,
    execution: null,
    task_surface: {
      acceptance_ref: "",
      acceptance_count: 0,
      negative_history_ref: "",
      negative_history_count: 0,
    },
    unknowns_refs: [],
    trace_ref: null,
    workspace_anchor: {
      anchor_status: "absent",
      git_head: null,
      dirty_summary: null,
      note: "",
    },
    note: null,
    captured_at_seq: 0,
  };
}

function emptySaveResult(): CheckpointSaveResult {
  return { ...emptyRecord(), path: "", replayed: false };
}

/** 恢复通路路标（save/show 人读面共用词形——单一实现禁两套文案）。 */
export function checkpointResumeRouteLine(permitRef: string | null): string {
  return permitRef === null
    ? "  恢复通路: 恢复先对账（W4-S1 闸）——本 checkpoint 无对账锚（permit_ref=null），恢复前请显式选定 permit 基线（pomaster permit issue → session attach --reconcile <permit>）；checkpoint=引用快照，reconcile=新鲜度判定（分层）"
    : `  恢复通路: session attach --reconcile ${permitRef}（恢复先对账——W4-S1 前置闸）；checkpoint=引用快照，reconcile=新鲜度判定（分层，show/save 不重跑对账）`;
}

function inflightWord(state: "recorded" | "none", count: number): string {
  return state === "recorded"
    ? `在途·有已入账产物 ${String(count)} 件`
    : "在途·零产物（回执未存≠未发生）";
}

function workspaceAnchorLine(anchor: CheckpointRecord["workspace_anchor"]): string {
  const anchorFace =
    anchor.anchor_status === "collected"
      ? `git_head=${anchor.git_head}（dirty tracked=${String(anchor.dirty_summary?.tracked_changed ?? 0)}, untracked=${String(anchor.dirty_summary?.untracked ?? 0)}）`
      : "absent（无锚显式申报——非 git 工区或采集缺席，禁伪造锚）";
  return `  workspace 锚: ${anchorFace}——${anchor.note}`;
}

/**
 * `checkpoint save`：组装引用集快照落盘（kernel saveCheckpoint 唯一写通路）。
 * 本面职责：workspace 锚 git 只读采集（失败 = absent 显式申报）+ argv 收敛 + 呈现。
 */
export async function runCheckpointSave(
  rootDir: string,
  input: CheckpointSaveInput,
): Promise<CommandOutcome<CheckpointSaveResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return failOutcome<CheckpointSaveResult>(
      "checkpoint save",
      emptySaveResult(),
      [initialized.error],
      [`checkpoint save: FAILED — ${initialized.error.code}\n  hint: ${initialized.error.hint}`],
    );
  }
  try {
    const store = await createStore(rootDir);
    const result = await saveCheckpoint(store, {
      taskRef: input.taskRef,
      ...(input.permitRef !== undefined ? { permitRef: input.permitRef } : {}),
      ...(input.executionId !== undefined ? { executionId: input.executionId } : {}),
      ...(input.ckptId !== undefined ? { ckptId: input.ckptId } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      workspaceAnchor: collectWorkspaceAnchor(rootDir),
    });
    const record = result.record;
    const resultView = saveResultOf(result);
    const human = [
      `checkpoint save → ${result.replayed ? "IDEMPOTENT REPLAY" : "SAVED"} ${record.checkpoint_id}（task=${record.task_ref}, seq=${String(record.captured_at_seq)}）`,
      `  schema: ${CHECKPOINT_SCHEMA}${result.replayed ? "（同号重放引用集逐字节一致——零写入幂等短路，store 幂等纪律）" : ""}`,
      `  permit_ref: ${record.permit_ref ?? "null（无对账锚——恢复先对账须显式选定 permit 基线）"}`,
      `  execution: ${record.execution === null ? "null（未携带 --execution）" : `${record.execution.execution_id}（${inflightWord(record.execution.inflight_receipts.state, record.execution.inflight_receipts.receipt_count)}）`}`,
      `  task_surface: ${record.task_surface.acceptance_ref}（${String(record.task_surface.acceptance_count)} 条）/ ${record.task_surface.negative_history_ref}（${String(record.task_surface.negative_history_count)} 条）`,
      `  unknowns_refs: ${record.unknowns_refs.length === 0 ? "（无锚定本任务的 OPEN_QUESTION 登记——显式空）" : record.unknowns_refs.join("、")}`,
      `  trace_ref: ${record.trace_ref === null ? "null（无封存 trace）" : `${record.trace_ref.path}（${record.trace_ref.plane}）`}`,
      workspaceAnchorLine(record.workspace_anchor),
      ...(record.note !== null ? [`  note: ${record.note}`] : []),
      `  落盘: .pomaster/state/checkpoints/${record.checkpoint_id}.json（durable 进 Git——引用快照分区档案面，零 journal 事件零 canonical kind）`,
      checkpointResumeRouteLine(record.permit_ref),
    ];
    return okOutcome("checkpoint save", resultView, human);
  } catch (err) {
    const error = toCliError(err);
    return failOutcome<CheckpointSaveResult>(
      "checkpoint save",
      emptySaveResult(),
      [error],
      [`checkpoint save: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
}

// ============================================================
// checkpoint show
// ============================================================

export interface CheckpointShowResult {
  readonly checkpoint: CheckpointRecord;
  readonly path: string;
}

function emptyShowResult(): CheckpointShowResult {
  return { checkpoint: emptyRecord(), path: "" };
}

/**
 * `checkpoint show`：引用面纯读呈现（buildStorePaths 纯读装载——零写入；
 * 缺席 CHECKPOINT_NOT_FOUND / 词形非法 SCHEMA_INVALID）。呈现层只回放快照事实
 * （保存时点），新鲜度判定归恢复通路的 session attach --reconcile（分层纪律）。
 */
export async function runCheckpointShow(
  rootDir: string,
  checkpointId: string,
): Promise<CommandOutcome<CheckpointShowResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return failOutcome<CheckpointShowResult>(
      "checkpoint show",
      emptyShowResult(),
      [initialized.error],
      [`checkpoint show: FAILED — ${initialized.error.code}\n  hint: ${initialized.error.hint}`],
    );
  }
  // 词形预检（IO 前 fail-closed——两检分离纪律；readCheckpoint 同闸兜底）。
  if (!CHECKPOINT_ID_PATTERN.test(checkpointId)) {
    const error: CliError = {
      code: "SCHEMA_INVALID",
      message: `checkpoint_id 词形非法（须 CKPT-<序号>，如 CKPT-00001）：${checkpointId}`,
      hint: "checkpoint id 由 checkpoint save 产出并回显；state/checkpoints/ 的文件名即分母。",
    };
    return failOutcome("checkpoint show", emptyShowResult(), [error], [
      `checkpoint show: FAILED — ${error.code}\n  hint: ${error.hint}`,
    ]);
  }
  try {
    const record = readCheckpoint(buildStorePaths(rootDir), checkpointId);
    if (record === null) {
      const error: CliError = {
        code: "CHECKPOINT_NOT_FOUND",
        message: `checkpoint 不在座：${checkpointId}（state/checkpoints/CKPT-*.json 缺失——显式缺席非空结果）`,
        hint: "checkpoint save 产出引用快照（显式命令触发，不自动创建）；核对 id 或重新保存。",
      };
      return failOutcome("checkpoint show", emptyShowResult(), [error], [
        `checkpoint show: FAILED — ${error.code}\n  hint: ${error.hint}`,
      ]);
    }
    const human = [
      `checkpoint show → ${record.checkpoint_id}（保存于 seq=${String(record.captured_at_seq)}；schema=${record.schema}）`,
      `  task_ref: ${record.task_ref}`,
      `  task_surface: ${record.task_surface.acceptance_ref}（${String(record.task_surface.acceptance_count)} 条）/ ${record.task_surface.negative_history_ref}（${String(record.task_surface.negative_history_count)} 条）`,
      `  permit_ref: ${record.permit_ref ?? "null（无对账锚——恢复先对账须显式选定 permit 基线）"}`,
      `  execution: ${record.execution === null ? "null" : `${record.execution.execution_id}（${inflightWord(record.execution.inflight_receipts.state, record.execution.inflight_receipts.receipt_count)}——保存时点计数，非实时）`}`,
      `  unknowns_refs: ${record.unknowns_refs.length === 0 ? "（无——显式空）" : record.unknowns_refs.join("、")}`,
      `  trace_ref: ${record.trace_ref === null ? "null" : `${record.trace_ref.path}（${record.trace_ref.plane}）`}`,
      workspaceAnchorLine(record.workspace_anchor),
      ...(record.note !== null ? [`  note: ${record.note}`] : []),
      checkpointResumeRouteLine(record.permit_ref),
    ];
    return okOutcome(
      "checkpoint show",
      {
        checkpoint: record,
        path: `.pomaster/state/checkpoints/${record.checkpoint_id}.json`,
      },
      human,
    );
  } catch (err) {
    const error = toCliError(err);
    return failOutcome<CheckpointShowResult>(
      "checkpoint show",
      emptyShowResult(),
      [error],
      [`checkpoint show: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
}
