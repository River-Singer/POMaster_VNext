/**
 * checkpoint.ts —— Checkpoint 载体（W4-S2 · 09-10 PRD §6-1 + 战役 W4 R4-1）。
 *
 * 语义裁决（本切片核心设计决策）：
 * - checkpoint = 对「恢复所需世界状态引用集」的**显式快照**，不是新真值库——
 *   每一项都是**引用**（既有实体），checkpoint 本体只是一个可重建的引用清单
 *   文件（09-10 PRD §6-1「优先复用现有记录，不按清单创建新库」逐字）；
 * - 红线三条：零新 canonical kind（checkpoint 不是 governed 对象，是运行时档案
 *   面——沿 trace seal 的分区档案定位；零 TransactionOp、不进 truth-index、
 *   不进 content_digest）；不自动创建（显式命令触发）；不删除既有面；
 * - 零 journal 事件（P34 production 新分区 + trace seal 分区档案先例——分区档案
 *   非治理事实变更；A4 时点锚 = captured_at_seq 采样，无墙钟）。
 *
 * 引用清单字段（六项，W4-S2 设计定案）：
 * 1. task 锚（task_ref）：TASK.* canonical governed id，须在册 kind=task_object
 *    （OBJECT_NOT_FOUND / SCHEMA_INVALID / FATAL_UNKNOWN_PREFIX 透传——
 *    negative-history assertTaskRef 同款判卷）；
 * 2. reconcile 判卷引用（permit_ref）：须在许可台账（PERMIT_NOT_FOUND 透传）——
 *    恢复时 `session attach --reconcile <permit>`（W4-S1 前置闸）的消费引用；
 * 3. execution 在途清单：已登记执行身份（assertExecutionAttachable——SCHEMA_
 *    INVALID / EXECUTION_NOT_FOUND 同款）+ countExecutionInflightReceipts 结果
 *    （W4-S1 同轴 recorded|none 复用，零新词轴）+ 封存 trace 引用（durable
 *    优先，显式 null 非伪造）；
 * 4. task payload 引用面：acceptance/negative_history 计数与 #词位引用指针
 *    （negative_history 走 readTaskNegativeHistory 同一装载面——单一实现）；
 * 5. unknowns 引用（unknowns_refs）：Exception Ledger 中锚定本任务的
 *    OPEN_QUESTION 的 EXC 引用（view review Known Unknown 同一判据——
 *    classification+object_ref 全等，禁第二套启发式）；
 * 6. workspace 状态锚（workspace_anchor）：git HEAD + dirty 摘要——**调用方采集
 *    显式申报**（execution-audit --diff-base 锚定诚实同族；采集缺席 =
 *    anchor_status absent 显式申报，非伪造）。标注「保存时点快照，非实时」。
 *
 * 分层纪律（与 W4-S1 的组合关系）：checkpoint = 引用快照（保存时点存在性校验），
 * reconcile = 新鲜度判定（恢复时点）——save/show 不做任何新鲜度判定，不冒充
 * 「恢复动作链」；恢复通路 = session attach --task <ref> --reconcile <permit>。
 *
 * 幂等纪律（store 同款）：显式 ckptId 同号重放，重算引用集逐字节比对——一致 =
 * 零写入幂等短路（replayed=true）；异内容 = CHECKPOINT_ALREADY_EXISTS 显式冲突
 * （EVIDENCE_ALREADY_EXISTS 同族语义——世界演进后旧号不可静默覆写）。缺省分配
 * = 现有最大序号 +1（CKPT-00001 五位零填充，AGX allocateExecutionId 同法）。
 *
 * 落盘（layout 纪律已核）：state/checkpoints/CKPT-*.json（durable，进 Git——
 * 恢复引用必须跨重启/跨 clone 存活，runtime/ 易变面不适用；traces/ 是 AGX 锚定
 * 执行行为投影分区【裁决 8 ②固定语义】，task 锚定的恢复面不入）——kernel
 * paths.ts checkpointsDir 登记 + CLI layout.ts LAYOUT_DIRECTORIES 双向对账，
 * 沿 state/contexts/ 同类先例（per-task 生成服务面，非第二配置源）。
 *
 * 词形纪律（SP 提案待 Owner 追认）：pomaster.checkpoint/v1 schema、CKPT-<n> id
 * 词形、CHECKPOINT_NOT_FOUND / CHECKPOINT_ALREADY_EXISTS 错误码、anchor_status
 * 两值轴（collected|absent）——kernel 局部词 TODO(vocab-pr) 承载（W4-S1
 * execution_inflight_evidence SP 提案同法）；错误码复用闭集：NOT_CONFIGURED /
 * OBJECT_NOT_FOUND / SCHEMA_INVALID / PERMIT_NOT_FOUND / EXECUTION_NOT_FOUND /
 * FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR。
 */
import { readdirSync } from "node:fs";
import type { Store } from "./index.js";
import { GovernanceError, governanceCodeForParseError, GovernedIdParseError } from "./errors.js";
import { captureOriginal, ensureDir, executeWrites, readText } from "./io.js";
import { pathsOf, readCurrentSeq, readRawIndex, type StorePaths } from "./paths.js";
import { readPermitsFile } from "./permits.js";
import { readExceptionLedgerFile } from "./ledger.js";
import { assertExecutionAttachable, countExecutionInflightReceipts } from "./execution.js";
import { parseGovernedId } from "./id.js";
import { readTaskNegativeHistory } from "./negative-history.js";
import { RAW_TRACES_RELATIVE, TRACES_RELATIVE } from "./trace.js";

// ============================================================
// 词形常量（SP 提案待追认——头注「词形纪律」）
// ============================================================

/** checkpoint 分区相对路径（durable 恢复引用面；进 Git）。 */
export const CHECKPOINTS_RELATIVE = ".pomaster/state/checkpoints";

/** checkpoint 档案 schema 词形（镜像 EXECUTION_SCHEMA / EXECUTION_TRACE_SCHEMA 先例）。 */
export const CHECKPOINT_SCHEMA = "pomaster.checkpoint/v1" as const;

/** CKPT 词形（CKPT-<序号>；AGX-n 同款通路编号——非 governed 前缀，不入 id_namespace 闭包）。 */
export const CHECKPOINT_ID_PATTERN = /^CKPT-[0-9]+$/;

/** 缺省分配序号位宽（AGX 同款 5 位零填充；>99999 自然位数）。 */
const CHECKPOINT_SEQ_PAD = 5;

/** workspace 锚诚实注记（闭形态恒在键——「保存时点快照，非实时」逐字锚）。 */
export const CHECKPOINT_WORKSPACE_ANCHOR_NOTE =
  "保存时点快照，非实时（恢复新鲜度判定归 session attach --reconcile）" as const;

// ============================================================
// 类型（文件世界 snake_case；闭形态——一切键显式在场，缺席 = null/空数组）
// ============================================================

/**
 * execution 在途分态（W4-S1 execution_inflight_evidence 同轴复用，零新词轴）：
 * recorded = 有已入账产物 N 件；none = 零产物（回执未存 ≠ 未发生）。
 */
export interface CheckpointInflightReceipts {
  readonly state: "recorded" | "none";
  readonly receipt_count: number;
}

/** execution 引用块（null = 未携带 --execution，显式缺席非伪造）。 */
export interface CheckpointExecutionRef {
  readonly execution_id: string;
  readonly inflight_receipts: CheckpointInflightReceipts;
}

/** task payload 引用面（引用指针 + 计数——不复制正文，单一事实源在 task payload）。 */
export interface CheckpointTaskSurface {
  /** Expected 依据引用指针（payload.acceptance 词位）。 */
  readonly acceptance_ref: string;
  readonly acceptance_count: number;
  /** negative history 引用指针（payload.negative_history 词位）。 */
  readonly negative_history_ref: string;
  readonly negative_history_count: number;
}

/** 封存 trace 引用（null = 无封存 trace，显式缺席）。 */
export interface CheckpointTraceRef {
  /** 项目根相对 posix 路径（.pomaster/traces/ 或 .pomaster/runtime/traces/）。 */
  readonly path: string;
  readonly plane: "durable" | "ephemeral";
}

/**
 * workspace 状态锚（锚定诚实：采集面由调用方显式申报；非 git 工区 = absent
 * 显式申报——无锚不是伪造「干净」）。note 恒在（保存时点快照，非实时）。
 */
export interface CheckpointWorkspaceAnchor {
  readonly anchor_status: "collected" | "absent";
  readonly git_head: string | null;
  readonly dirty_summary: {
    readonly tracked_changed: number;
    readonly untracked: number;
  } | null;
  readonly note: string;
}

/**
 * Checkpoint 档案（state/checkpoints/CKPT-*.json 行形态；闭形态 11 键——缺席 =
 * null/空数组显式，C1）。
 */
export interface CheckpointRecord {
  readonly checkpoint_id: string;
  readonly schema: typeof CHECKPOINT_SCHEMA;
  readonly task_ref: string;
  /** reconcile 判卷引用（null = 无对账锚——恢复先对账须显式选定 permit 基线）。 */
  readonly permit_ref: string | null;
  readonly execution: CheckpointExecutionRef | null;
  readonly task_surface: CheckpointTaskSurface;
  /** 锚定本任务的 OPEN_QUESTION EXC 引用（登记序；view review 同判据）。 */
  readonly unknowns_refs: readonly string[];
  readonly trace_ref: CheckpointTraceRef | null;
  readonly workspace_anchor: CheckpointWorkspaceAnchor;
  /** 人类散文注记（机器不得解析其内容做判卷，P9）。 */
  readonly note: string | null;
  /** 保存时点 store seq（A4 时点锚，无墙钟）。 */
  readonly captured_at_seq: number;
}

/** workspace 锚申报（CLI git 只读采集面；三键成组——半给 = SCHEMA_INVALID）。 */
export interface CheckpointWorkspaceAnchorInput {
  readonly gitHead: string;
  readonly dirtyTrackedChanged: number;
  readonly dirtyUntracked: number;
}

/** saveCheckpoint 输入（camelCase 输入世界）。 */
export interface CheckpointSaveInput {
  readonly taskRef: string;
  readonly permitRef?: string;
  readonly executionId?: string;
  /** 显式指定（词形校验；同号重放按引用集字节判定：一致→幂等短路，异→显式冲突）。 */
  readonly ckptId?: string;
  readonly note?: string;
  readonly workspaceAnchor?: CheckpointWorkspaceAnchorInput;
}

export interface CheckpointSaveResult {
  readonly record: CheckpointRecord;
  readonly path: string;
  /** true = 显式同号重放且引用集逐字节一致（零写入幂等短路——store 幂等纪律）。 */
  readonly replayed: boolean;
}

// ============================================================
// 读取（纯读零写；CLI show 消费）
// ============================================================

/** checkpoint 档案文件路径（id 已过词形校验的前提下由调用方拼装）。 */
export function checkpointRecordPath(paths: StorePaths, checkpointId: string): string {
  return `${paths.checkpointsDir}/${checkpointId}.json`;
}

/**
 * 读取单条 checkpoint。缺失 → null（调用方翻译为 CHECKPOINT_NOT_FOUND）；存在但
 * 损坏/id 不一致/schema 漂移 → SCHEMA_INVALID（禁静默当缺席——引用清单损坏即恢复
 * 面失真，显性暴露；loadSealedManifest 同款 fail-closed 装载纪律）。
 */
export function readCheckpoint(paths: StorePaths, checkpointId: string): CheckpointRecord | null {
  if (!CHECKPOINT_ID_PATTERN.test(checkpointId)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `checkpoint_id 词形非法（须 CKPT-<序号>）：${checkpointId}`,
      "checkpoint_id 由 checkpoint save 分配（CKPT-00001 起五位零填充）；核对 state/checkpoints/ 的文件名",
      { checkpoint_id: checkpointId },
    );
  }
  const path = checkpointRecordPath(paths, checkpointId);
  const text = readText(path);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `checkpoint 档案无法解析（损坏或手改）：${CHECKPOINTS_RELATIVE}/${checkpointId}.json`,
      "从 git 恢复该文件；档案由 kernel saveCheckpoint 维护，禁止手改",
      { cause: String(error), checkpoint_id: checkpointId },
    );
  }
  const fail = (detail: string): GovernanceError =>
    new GovernanceError(
      "SCHEMA_INVALID",
      `checkpoint 档案形态非法：${path} ${detail}`,
      "从 git 恢复该文件；档案由 kernel saveCheckpoint 落盘（闭形态），禁止手改",
      { checkpoint_id: checkpointId },
    );
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw fail("根须为对象");
  }
  const record = parsed as CheckpointRecord;
  if (record.schema !== CHECKPOINT_SCHEMA) throw fail(`schema 词形漂移：${String(record.schema)}`);
  if (record.checkpoint_id !== checkpointId) {
    throw fail(`checkpoint_id 与文件名不一致：${String(record.checkpoint_id)}`);
  }
  if (typeof record.task_ref !== "string" || record.task_ref.length === 0) {
    throw fail("task_ref 缺失或为空");
  }
  if (
    typeof record.captured_at_seq !== "number" ||
    !Number.isInteger(record.captured_at_seq) ||
    record.captured_at_seq < 0
  ) {
    throw fail("captured_at_seq 须为 ≥0 整数（A4 时点锚）");
  }
  return record;
}

// ============================================================
// 缺省分配（现有最大序号 +1；allocateExecutionId 同法）
// ============================================================

/** 缺省分配：现有最大序号 +1（跨号扫描全局 max），5 位零填充。 */
export function allocateCheckpointId(paths: StorePaths): string {
  let max = 0;
  try {
    for (const name of readdirSync(paths.checkpointsDir)) {
      const match = /^CKPT-([0-9]+)\.json$/.exec(name);
      if (match !== null) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value > max) max = value;
      }
    }
  } catch {
    // 目录缺失 = 零档案（首条分配）；写路径 ensureDir 兜底。
  }
  return `CKPT-${String(max + 1).padStart(CHECKPOINT_SEQ_PAD, "0")}`;
}

// ============================================================
// 保存（唯一写通路；引用逐项存在性校验——fail-closed 零落盘）
// ============================================================

/**
 * 保存恢复引用集快照（显式命令触发，不自动创建）。
 *
 * 流程：NOT_CONFIGURED 守卫 → id（显式词形闸 / 缺省分配）→ task 锚校验（词形 →
 * 在册 → kind → 正文 → acceptance 计数 + negative_history 计数）→ permit 校验
 * （台账成员判定）→ execution 校验（assertExecutionAttachable）+ 在途计数 +
 * trace_ref 存在性 → unknowns 引用收集 → workspace 锚形状校验 → 闭形态组装 →
 * 幂等判定（显式同号：重算引用集逐字节比对）→ executeWrites（落盘前并发复核，
 * beginExecution 同族）。
 *
 * 零 journal 事件；零 store 事务；零 TransactionOp——落盘面 ⊆ state/checkpoints/。
 */
export async function saveCheckpoint(
  store: Store,
  input: CheckpointSaveInput,
): Promise<CheckpointSaveResult> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir: store.rootDir },
    );
  }

  const checkpointId =
    input.ckptId !== undefined ? input.ckptId.trim() : allocateCheckpointId(paths);
  if (!CHECKPOINT_ID_PATTERN.test(checkpointId)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `checkpoint_id 词形非法（须 CKPT-<序号>，如 CKPT-00001）：${checkpointId}`,
      "显式指定须匹配 CKPT 词形；缺省分配由本函数按「现有最大序号 +1」产出",
      { checkpoint_id: checkpointId },
    );
  }

  const taskSurface = assertTaskAnchor(paths, input.taskRef);

  const permitRef = input.permitRef;
  if (permitRef !== undefined) {
    assertPermitRef(paths, permitRef);
  }

  let execution: CheckpointExecutionRef | null = null;
  let traceRef: CheckpointTraceRef | null = null;
  if (input.executionId !== undefined) {
    // assertExecutionAttachable：词形非法 SCHEMA_INVALID / 未登记 EXECUTION_NOT_FOUND
    // （EXECUTION_NOT_FOUND 同款——S1 禁自造身份；已封口执行允许事后引用）。
    assertExecutionAttachable(paths, input.executionId);
    const receiptCount = countExecutionInflightReceipts(paths, input.executionId);
    execution = {
      execution_id: input.executionId,
      inflight_receipts: {
        state: receiptCount > 0 ? "recorded" : "none",
        receipt_count: receiptCount,
      },
    };
    traceRef = sealedTraceRefOf(paths, input.executionId);
  }

  const unknownsRefs = unknownsRefsOf(paths, input.taskRef);
  const workspaceAnchor = workspaceAnchorOf(input.workspaceAnchor);

  const note =
    input.note !== undefined && input.note.trim().length > 0 ? input.note.trim() : null;

  const record: CheckpointRecord = {
    checkpoint_id: checkpointId,
    schema: CHECKPOINT_SCHEMA,
    task_ref: input.taskRef,
    permit_ref: permitRef ?? null,
    execution,
    task_surface: taskSurface,
    unknowns_refs: unknownsRefs,
    trace_ref: traceRef,
    workspace_anchor: workspaceAnchor,
    note,
    captured_at_seq: currentSeq,
  };
  const path = checkpointRecordPath(paths, checkpointId);
  const serialized = `${JSON.stringify(record, null, 2)}\n`;

  // —— 幂等判定（store 同款纪律）：显式同号重放按引用集字节比对。 ——
  const existing = readText(path);
  if (existing !== null) {
    if (existing === serialized) return { record, path, replayed: true };
    throw alreadyExistsError(checkpointId, path);
  }

  ensureDir(paths.checkpointsDir);
  // 落盘前并发复核（beginExecution A1 同族——检查-落盘窗口收窄到复核 → rename）。
  const original = captureOriginal(path);
  if (original !== null) {
    if (original === serialized) return { record, path, replayed: true };
    throw alreadyExistsError(checkpointId, path);
  }
  executeWrites([{ path, next: serialized, original }]);
  return { record, path, replayed: false };
}

function alreadyExistsError(checkpointId: string, path: string): GovernanceError {
  return new GovernanceError(
    "CHECKPOINT_ALREADY_EXISTS",
    `checkpoint 已在座且引用集不同（同号重放异内容显式冲突——禁静默覆写恢复快照）：${checkpointId}（${path}）`,
    "世界已演进：用缺省分配保存新 checkpoint（pomaster checkpoint save <task-id>）；确需覆盖须显式删除旧文件后重放（审计面禁静默覆盖）",
    { checkpoint_id: checkpointId, path },
  );
}

// ============================================================
// 引用逐项校验（fail-closed；码位复用闭集——禁新码位）
// ============================================================

/**
 * task 锚校验 + payload 引用面计数（assertTaskRef 判卷同款：GovernedIdParseError →
 * governanceCodeForParseError；前缀须 TASK）。acceptance 计数取 payload 数组
 * （canonical 落盘保证形状，漂移 = 手改痕迹显性暴露）；negative_history 计数走
 * readTaskNegativeHistory 同一装载面（缺席诚实 0；畸形其自有 SCHEMA_INVALID 判卷）。
 */
function assertTaskAnchor(
  paths: StorePaths,
  taskRef: string,
): CheckpointTaskSurface {
  let parsed;
  try {
    parsed = parseGovernedId(taskRef);
  } catch (error) {
    if (error instanceof GovernedIdParseError) {
      throw new GovernanceError(
        governanceCodeForParseError(error),
        `task_ref 词形非法：${error.message}`,
        "checkpoint 绑定 TASK.* canonical governed id（A5 closed-world）；TASK-0087 等 legacy 词形经 resolveAlias 收编（TASK-0087→TASK.T0087）",
        { taskRef },
      );
    }
    throw error;
  }
  if (parsed.prefix !== "TASK") {
    throw new GovernanceError(
      "FATAL_UNKNOWN_PREFIX",
      `task_ref 前缀须为 TASK：${taskRef}（${parsed.prefix}.* 是其他对象面）`,
      "checkpoint 绑定任务恢复面（task 锚是引用集主键）；非 TASK.* 目标不在本通路射程",
      { taskRef, prefix: parsed.prefix },
    );
  }

  const raw = readRawIndex(paths);
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: paths.pomasterDir },
    );
  }
  const objects = raw.objects;
  const row = Array.isArray(objects)
    ? objects.find(
        (candidate): candidate is Record<string, unknown> =>
          typeof candidate === "object" && candidate !== null &&
          (candidate as Record<string, unknown>).id === taskRef,
      )
    : undefined;
  if (row === undefined) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `任务不在册：${taskRef}（truth-index 无此 id——checkpoint 主键绑定在册 task_object）`,
      "先经 create/change 通路落 TASK.* 对象（或核对 id 词形）；pomaster inspect <task-id> 查在册对象",
      { taskRef },
    );
  }
  if (row.kind !== "task_object") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${taskRef} kind=${String(row.kind)} 非 task_object（checkpoint 主键绑定任务恢复面，禁跨 kind 借位）`,
      "核对目标 id；change_object 等其他 kind 的恢复锚不在本通路射程",
      { taskRef, kind: row.kind },
    );
  }
  const bodyRef = row.body_ref;
  if (typeof bodyRef !== "string" || bodyRef.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${taskRef} 索引行缺 body_ref（索引/正文失配——从 git 恢复）`,
      "从 git 恢复 state/truth-index.json；索引由 kernel 事务维护，禁止手改",
      { taskRef },
    );
  }
  const bodyText = readText(`${paths.pomasterDir}/${bodyRef}`);
  if (bodyText === null) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `${taskRef} 正文缺失：${bodyRef}（索引在册而正文不在——D24 漂移）`,
      "从 git 恢复正文文件；恢复引用快照不对缺失正文静默（会伪造引用面）",
      { taskRef, body_ref: bodyRef },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${taskRef} 正文不可解析（损坏或手改）`,
      "从 git 恢复该正文；引用面计数需读正文，损坏正文不可静默当空壳",
      { taskRef, cause: String(error) },
    );
  }
  const payload =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).payload
      : undefined;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${taskRef} payload 缺失或非对象（02 信封 payload 必填）`,
      "从 git 恢复该正文；canonical 落盘保证 payload 对象形状，漂移 = 手改痕迹",
      { taskRef },
    );
  }
  const acceptance = (payload as Record<string, unknown>).acceptance;
  if (acceptance !== undefined && !Array.isArray(acceptance)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${taskRef} payload.acceptance 在场但非数组（02b task_object 契约形状）`,
      "从 git 恢复该正文；canonical 落盘保证 acceptance 数组形状，在场漂移 = 手改痕迹",
      { taskRef },
    );
  }
  // 键缺席 = 诚实缺席（计数 0 显式——引用面不猜测；negative-history 字段面同取向）。
  const negativeHistory = readTaskNegativeHistory(paths, taskRef);
  return {
    acceptance_ref: `${taskRef}#acceptance`,
    acceptance_count: Array.isArray(acceptance) ? acceptance.length : 0,
    negative_history_ref: `${taskRef}#negative_history`,
    negative_history_count: negativeHistory.length,
  };
}

/** permit 台账成员判定（readPermitsFile 同一装载面；未知 → PERMIT_NOT_FOUND 透传）。 */
function assertPermitRef(paths: StorePaths, permitRef: string): void {
  const permits = readPermitsFile(paths).permits;
  if (!permits.some((permit) => permit.permit_ref === permitRef)) {
    throw new GovernanceError(
      "PERMIT_NOT_FOUND",
      `许可不在台账（state/permits.json）：${permitRef}`,
      "先 pomaster permit issue 签发，或核对引用；checkpoint 的 permit_ref 是恢复时 session attach --reconcile 的判卷引用（W4-S1 闸）",
      { permit_ref: permitRef },
    );
  }
}

/** 封存 trace 存在性（durable 优先；双平面缺席 = null 显式——引用存在性如实）。 */
function sealedTraceRefOf(paths: StorePaths, executionId: string): CheckpointTraceRef | null {
  const durable = `${paths.tracesDir}/${executionId}.json`;
  const ephemeral = `${paths.rawTracesDir}/${executionId}.json`;
  if (readText(durable) !== null) {
    return { path: `${TRACES_RELATIVE}/${executionId}.json`, plane: "durable" };
  }
  if (readText(ephemeral) !== null) {
    return { path: `${RAW_TRACES_RELATIVE}/${executionId}.json`, plane: "ephemeral" };
  }
  return null;
}

/**
 * unknowns 引用收集：Exception Ledger 中锚定本任务（object_ref 全等）的
 * OPEN_QUESTION 的 EXC 引用（view review Known Unknown 分区同一判据——
 * classification+object_ref 双键全等，禁第二套启发式；登记序 = 确定性）。
 */
function unknownsRefsOf(paths: StorePaths, taskRef: string): readonly string[] {
  const ledger = readExceptionLedgerFile(paths);
  return ledger.entries
    .filter(
      (entry) =>
        entry.classification === "OPEN_QUESTION" && entry.object_ref === taskRef,
    )
    .map((entry) => entry.ledger_ref);
}

/**
 * workspace 锚形状校验（kernel 纯函数校验核）：三键成组——gitHead 缺席 = absent
 * 显式申报；gitHead 在场而 dirty 计数缺席/非负整数 = SCHEMA_INVALID（半给锚
 * 禁静默补零——伪造 dirty=0 冒充干净）。note 恒在（CHECKPOINT_WORKSPACE_ANCHOR_NOTE）。
 */
function workspaceAnchorOf(
  input: CheckpointWorkspaceAnchorInput | undefined,
): CheckpointWorkspaceAnchor {
  if (input === undefined || input.gitHead.trim().length === 0) {
    return {
      anchor_status: "absent",
      git_head: null,
      dirty_summary: null,
      note: CHECKPOINT_WORKSPACE_ANCHOR_NOTE,
    };
  }
  const tracked = input.dirtyTrackedChanged;
  const untracked = input.dirtyUntracked;
  const badCount =
    typeof tracked !== "number" || !Number.isInteger(tracked) || tracked < 0 ||
    typeof untracked !== "number" || !Number.isInteger(untracked) || untracked < 0;
  if (badCount) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "workspace 锚半给（git_head 在场而 dirty 计数缺席或非 ≥0 整数——禁静默补零冒充干净）",
      "采集面三键成组申报（gitHead + dirtyTrackedChanged + dirtyUntracked），或整体缺省（anchor absent 显式申报）",
      { git_head: input.gitHead },
    );
  }
  return {
    anchor_status: "collected",
    git_head: input.gitHead.trim(),
    dirty_summary: { tracked_changed: tracked, untracked: untracked },
    note: CHECKPOINT_WORKSPACE_ANCHOR_NOTE,
  };
}
