/**
 * runtime.ts —— D 线地基 CLI 命令面：`session` / `lock` / `execution` 三命令组
 * （P20-Commands；D 线 §1.2/§3.1/§3.3 的 CLI 词形兑现 + A10「CLI 零 session 命令」闭合）。
 *
 * 词形锚（D 线原文叙述形态逐字对齐处）：
 * - `pomaster session attach`（§1.2：注册/刷新 liveness；解析出本 session 上次绑定任务
 *   = resumed_task 回显）；`pomaster lock steal <lock> --reason`（§3.3.1 抢占仪式逐字）；
 * - `pomaster lock acquire`（§3.3.1 叙述形态；--kind change|task|unit 三粒度词轴
 *   LOCK_KIND_VALUES，unit 锁 --object-key 走 S6 机器键）。
 *
 * 纪律落点：
 * - 判卷权威在 kernel（session.ts/locks.ts/execution.ts），本模块只做编排与呈现；
 *   GovernanceError 原码透传（SESSION_NOT_FOUND / LOCK_NOT_HELD / EXECUTION_* 等）；
 * - lock acquire 的 blocked **不是静默成功**：ok=false exit 1 + errors LOCK_BLOCKED
 *   （result 仍携带持有者快照/liveness/stale_reason 供脚本消费）——判卷语义对齐
 *   permit check「非 allow 一律 exit 1」先例；
 * - 墙钟注入点（now/started_at）不进 CLI 面：盖章语义 = 基础设施印时刻，argv 申报
 *   即会话自报（D 线 S1「永不信任会话自报」）；测试确定性走 kernel API 直调；
 * - 纯读命令零写装载（审查 H3）：session/lock/execution list 自述「纯读零写」，
 *   装载走 kernel loadStoreReadOnly（零写副作用）而非 createStore（其 ensureSidecars
 *   会在侧车缺失的存量 store 上静默重建空账，丢失信号被吞）——侧车缺失按「显式空/
 *   缺席」呈现；
 * - 局部词（LOCK_BLOCKED、liveness 两值、execution 呈现两态）均带 TODO(vocab-pr)
 *   注记，禁私加 vocab.ts 主表（呈报项见 docs/wave3-p20-sec79-backfill-44-8.md）。
 */
import {
  acquireLock,
  attachSession,
  beginExecution,
  createStore,
  endExecution,
  EXECUTION_ID_PATTERN,
  GovernanceError,
  heartbeatLock,
  listExecutionRecords,
  listLocks,
  listSessionRecords,
  loadStoreReadOnly,
  pathsOf,
  refreshSession,
  releaseLock,
  stealLock,
  type Store,
  type StorePaths,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";

// ============================================================
// 共享骨架：kernel 失败翻译 / argv 形状解析
// ============================================================

/** GovernanceError → 失败信封（原码透传 + 人读两行；判卷权威在 kernel 的呈现纪律）。 */
function kernelFail<TResult>(
  command: string,
  err: unknown,
  empty: TResult,
): CommandOutcome<TResult> {
  const error: CliError =
    err instanceof GovernanceError
      ? governanceErrorToCliError(err)
      : {
          code: "KERNEL_ERROR",
          message: err instanceof Error ? err.message : String(err),
          hint: "kernel 原语调用失败；契约见 docs/kernel-api.md §13。",
        };
  return failOutcome<TResult>(
    command,
    empty,
    [error],
    [`${command}: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/** requireInitialized 失败 → 失败信封（三命令组共用的前置闸）。 */
function notInitializedFail<TResult>(
  command: string,
  error: CliError,
  empty: TResult,
): CommandOutcome<TResult> {
  return failOutcome<TResult>(
    command,
    empty,
    [error],
    [`${command}: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/** --execution-id 词形预检（AGX-n；档案存在性校验归 kernel——两检分离同 record 通路）。
 * 导出供 trace 命令组复用（W1-C2；单一实现禁两套 argv 词形预检）。 */
export function parseExecutionIdArgv(
  raw: string | undefined,
): { readonly executionId: string | undefined } | { readonly error: CliError } {
  if (raw === undefined) return { executionId: undefined };
  if (!EXECUTION_ID_PATTERN.test(raw)) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--execution-id 词形非法（须 AGX-<4位年份>-<序号>，PRD §25.4 例文 AGX-2026-00182）：${raw}`,
        hint: "execution_id 由 execution begin 分配（缺省 = 现有最大序号 +1，5 位零填充）；禁止自造身份（S1）。",
      },
    };
  }
  return { executionId: raw };
}

/** --pid 解析（正整数；stale 判定第二信号 holder_pid_gone 的输入）。 */
function parsePidArgv(
  raw: string | undefined,
): { readonly pid: number | undefined } | { readonly error: CliError } {
  if (raw === undefined) return { pid: undefined };
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--pid 须为正整数：${raw}`,
        hint: "pid 是持有人进程号（stale 判定的第二信号：holder.pid 不存在 → stale）。",
      },
    };
  }
  return { pid: value };
}

/** --ttl 解析（正整数秒；缺省由 kernel 按例文 900）。 */
function parseTtlSecondsArgv(
  raw: string | undefined,
): { readonly ttl: number | undefined } | { readonly error: CliError } {
  if (raw === undefined) return { ttl: undefined };
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--ttl 须为正整数（秒）：${raw}`,
        hint: "会话/锁 TTL 是墙钟秒（runtime 侧车合法位，A4）；缺省 900（D 线例文逐字）。",
      },
    };
  }
  return { ttl: value };
}

// ============================================================
// session 命令组
// ============================================================

export interface SessionAttachInput {
  readonly sessionKey: string;
  readonly harness: string;
  readonly task?: string;
  readonly ttl?: string;
  /** platform_meta 键值对（k=v；可重复）。 */
  readonly meta?: readonly string[];
  /** 顶替授权（既有活会话 + harness 不同时必填——缺省拒绝无声顶替；journal SESSION_REPLACED）。 */
  readonly force?: boolean;
}

export interface SessionAttachResult {
  readonly session_key: string;
  readonly created: boolean;
  /** true = 既有会话被顶替（harness 易主；journal SESSION_REPLACED 留痕）。 */
  readonly replaced: boolean;
  readonly resumed_task: string | null;
  readonly held_locks: readonly string[];
  readonly last_seen_at: string;
  readonly ttl_seconds: number;
}

function emptySessionAttach(): SessionAttachResult {
  return {
    session_key: "",
    created: false,
    replaced: false,
    resumed_task: null,
    held_locks: [],
    last_seen_at: "",
    ttl_seconds: 0,
  };
}

/** --meta k=v 解析（k 非空、恰一个 = 号；v 允许空串）。 */
function parseMetaArgv(
  raw: readonly string[] | undefined,
): { readonly meta: Record<string, string> } | { readonly error: CliError } {
  const meta: Record<string, string> = {};
  for (const item of raw ?? []) {
    const eq = item.indexOf("=");
    if (eq <= 0) {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: `--meta 词形非法（须 <key>=<value>，key 非空）：${item}`,
          hint: "platform_meta 是字符串键值对（hook session_id / cwd 等）；可重复传多个。",
        },
      };
    }
    meta[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return { meta };
}

/**
 * `session attach`：注册/刷新会话（D 线 §3.1）。首注册 journal SESSION_ATTACHED；
 * 刷新 = 心跳零事件；既有活会话 harness 不同 → 缺省拒绝 SESSION_REPLACE_REQUIRED
 * （顶替不可无声——显式 force 才顶替并落 SESSION_REPLACED）；resumed_task 回带既有
 * 任务指针（resume 探测输入）。
 */
export async function runSessionAttach(
  rootDir: string,
  input: SessionAttachInput,
): Promise<CommandOutcome<SessionAttachResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("session attach", initialized.error, emptySessionAttach());
  }
  const meta = parseMetaArgv(input.meta);
  if ("error" in meta) {
    return notInitializedFail("session attach", meta.error, emptySessionAttach());
  }
  const ttl = parseTtlSecondsArgv(input.ttl);
  if ("error" in ttl) {
    return notInitializedFail("session attach", ttl.error, emptySessionAttach());
  }
  try {
    const store = await createStore(rootDir);
    const outcome = await attachSession(store, {
      sessionKey: input.sessionKey,
      harness: input.harness,
      ...(input.task !== undefined ? { currentTask: input.task } : {}),
      ...(Object.keys(meta.meta).length > 0 ? { platformMeta: meta.meta } : {}),
      ...(ttl.ttl !== undefined ? { ttlSeconds: ttl.ttl } : {}),
      ...(input.force === true ? { force: true } : {}),
    });
    const result: SessionAttachResult = {
      session_key: outcome.session_key,
      created: outcome.created,
      replaced: outcome.replaced,
      resumed_task: outcome.resumed_task,
      held_locks: outcome.held_locks,
      last_seen_at: outcome.last_seen_at,
      ttl_seconds: outcome.ttl_seconds,
    };
    const status = outcome.created ? "CREATED" : outcome.replaced ? "REPLACED" : "REFRESHED";
    const human = [
      `session attach → ${status} ${outcome.session_key} (harness=${input.harness}, liveness=alive)`,
      ...(outcome.replaced
        ? [`  顶替留痕：journal SESSION_REPLACED（原 harness 已被显式 force 顶替——不可无声）`]
        : []),
      ...(outcome.resumed_task !== null
        ? [`  resumed_task: ${outcome.resumed_task}（本 session 上次绑定的任务指针——resume 白名单询问输入）`]
        : []),
      ...(outcome.held_locks.length > 0
        ? [`  held_locks: ${outcome.held_locks.join(", ")}`]
        : []),
    ];
    return okOutcome("session attach", result, human);
  } catch (err) {
    return kernelFail("session attach", err, emptySessionAttach());
  }
}

export interface SessionRefreshResult {
  readonly session_key: string;
  readonly last_seen_at: string;
  readonly ttl_seconds: number;
}

function emptySessionRefresh(): SessionRefreshResult {
  return { session_key: "", last_seen_at: "", ttl_seconds: 0 };
}

/** `session refresh`：心跳顺手刷新（D 线 §3.1「任何一次 CLI 调用顺手刷新」的显式入口）。 */
export async function runSessionRefresh(
  rootDir: string,
  sessionKey: string,
): Promise<CommandOutcome<SessionRefreshResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("session refresh", initialized.error, emptySessionRefresh());
  }
  try {
    const store = await createStore(rootDir);
    const record = await refreshSession(store, sessionKey);
    return okOutcome(
      "session refresh",
      {
        session_key: record.session_key,
        last_seen_at: record.last_seen_at,
        ttl_seconds: record.ttl_seconds,
      },
      [
        `session refresh → ${record.session_key} (last_seen_at=${record.last_seen_at}，心跳零事件——liveness 刷新不刷事件流)`,
      ],
    );
  } catch (err) {
    return kernelFail("session refresh", err, emptySessionRefresh());
  }
}

export interface SessionListResult {
  readonly sessions: readonly {
    readonly session_key: string;
    readonly harness: string;
    readonly liveness: "alive" | "stale";
    readonly current_task: string | null;
    readonly held_locks: readonly string[];
    readonly last_seen_at: string;
  }[];
}

/** `session list`：会话清单（记录 + liveness 并排；纯读零写——装载走 loadStoreReadOnly
 *  零写副作用，审查 H3；空/侧车缺失 = 显式空）。 */
export async function runSessionList(
  rootDir: string,
): Promise<CommandOutcome<SessionListResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("session list", initialized.error, { sessions: [] });
  }
  try {
    const store = loadStoreReadOnly(rootDir);
    const rows = listSessionRecords(pathsOf(store));
    const result: SessionListResult = {
      sessions: rows.map((row) => ({
        session_key: row.record.session_key,
        harness: row.record.harness,
        liveness: row.liveness,
        current_task: row.record.current_task,
        held_locks: row.record.held_locks,
        last_seen_at: row.record.last_seen_at,
      })),
    };
    const human = [
      result.sessions.length === 0
        ? "session list → 0 sessions（尚无会话注册——显式空，attach 后在此呈现）"
        : `session list → ${result.sessions.length} sessions`,
      ...result.sessions.map(
        (row) =>
          `  ${row.session_key} (${row.harness}) liveness=${row.liveness} locks=[${row.held_locks.join(", ")}]${row.current_task !== null ? ` task=${row.current_task}` : ""}`,
      ),
    ];
    return okOutcome("session list", result, human);
  } catch (err) {
    return kernelFail("session list", err, { sessions: [] });
  }
}

// ============================================================
// lock 命令组
// ============================================================

export interface LockAcquireInput {
  readonly kind: string;
  readonly ref?: string;
  readonly objectKey?: string;
  readonly sessionKey: string;
  readonly executionId?: string;
  readonly pid?: string;
  readonly scopeChange?: string;
  readonly scopeTask?: string;
  readonly ttl?: string;
  readonly purpose?: string;
}

export type LockAcquireResult =
  | {
      readonly outcome: "acquired";
      readonly lock_id: string;
      readonly lock_kind: string;
      readonly fence: number;
      readonly holder_session_key: string;
      readonly execution_id: string | null;
    }
  | {
      readonly outcome: "blocked";
      readonly lock_id: string;
      readonly holder_session_key: string;
      readonly holder_execution_id: string | null;
      readonly fence: number;
      readonly holder_liveness: "alive" | "stale";
      readonly stale_reason: string | null;
      readonly holder_session_missing: boolean;
    };

/** LOCK_BLOCKED（CLI 局部码 TODO(vocab-pr)）：blocked 非静默成功——判卷语义对齐 permit check。 */
export const LOCK_BLOCKED = "LOCK_BLOCKED";

function emptyLockAcquire(): LockAcquireResult {
  return {
    outcome: "blocked",
    lock_id: "",
    holder_session_key: "",
    holder_execution_id: null,
    fence: 0,
    holder_liveness: "alive",
    stale_reason: null,
    holder_session_missing: false,
  };
}

/**
 * `lock acquire`：三粒度互斥锁获取。acquired → exit 0；blocked → exit 1 +
 * LOCK_BLOCKED（持有者快照/liveness/stale_reason 随信封回带——acquire 永不自动
 * 抢占，stale 持有者走 lock steal 显式接管）。
 */
export async function runLockAcquire(
  rootDir: string,
  input: LockAcquireInput,
): Promise<CommandOutcome<LockAcquireResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("lock acquire", initialized.error, emptyLockAcquire());
  }
  const pid = parsePidArgv(input.pid);
  if ("error" in pid) {
    return notInitializedFail("lock acquire", pid.error, emptyLockAcquire());
  }
  const ttl = parseTtlSecondsArgv(input.ttl);
  if ("error" in ttl) {
    return notInitializedFail("lock acquire", ttl.error, emptyLockAcquire());
  }
  const executionId = parseExecutionIdArgv(input.executionId);
  if ("error" in executionId) {
    return notInitializedFail("lock acquire", executionId.error, emptyLockAcquire());
  }
  try {
    const store = await createStore(rootDir);
    const acquired = await acquireLock(store, {
      kind: input.kind as never,
      ...(input.ref !== undefined ? { ref: input.ref } : {}),
      ...(input.objectKey !== undefined ? { objectKey: input.objectKey } : {}),
      sessionKey: input.sessionKey,
      ...(executionId.executionId !== undefined
        ? { executionId: executionId.executionId }
        : {}),
      ...(pid.pid !== undefined ? { pid: pid.pid } : {}),
      ...(input.scopeChange !== undefined ? { scopeChange: input.scopeChange } : {}),
      ...(input.scopeTask !== undefined ? { scopeTask: input.scopeTask } : {}),
      ...(ttl.ttl !== undefined ? { ttlSeconds: ttl.ttl } : {}),
      ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
    });
    if (acquired.outcome === "acquired") {
      const result: LockAcquireResult = {
        outcome: "acquired",
        lock_id: acquired.lock.lock_id,
        lock_kind: acquired.lock.lock_kind,
        fence: acquired.lock.fence,
        holder_session_key: acquired.lock.holder.session_key,
        execution_id: acquired.lock.holder.execution_id,
      };
      return okOutcome(
        "lock acquire",
        result,
        [
          `lock acquire → ACQUIRED ${acquired.lock.lock_id} (fence=${acquired.lock.fence}, holder=${acquired.lock.holder.session_key})`,
          ...(acquired.lock.holder.execution_id !== null
            ? [`  execution: ${acquired.lock.holder.execution_id}`]
            : []),
        ],
      );
    }
    const blocked: LockAcquireResult = {
      outcome: "blocked",
      lock_id: acquired.lock_id,
      holder_session_key: acquired.holder.session_key,
      holder_execution_id: acquired.holder.execution_id,
      fence: acquired.fence,
      holder_liveness: acquired.holder_liveness,
      stale_reason: acquired.stale_reason,
      holder_session_missing: acquired.holder_session_missing,
    };
    return failOutcome(
      "lock acquire",
      blocked,
      [
        {
          code: LOCK_BLOCKED,
          message: `${acquired.lock_id} 由 ${acquired.holder.session_key} 持有（liveness=${acquired.holder_liveness}${acquired.stale_reason !== null ? `, stale_reason=${acquired.stale_reason}` : ""}）`,
          hint: acquired.hint,
        },
      ],
      [
        `lock acquire → BLOCKED ${acquired.lock_id}`,
        `  holder: ${acquired.holder.session_key} (execution=${acquired.holder.execution_id ?? "null"}, fence=${acquired.fence}, liveness=${acquired.holder_liveness}${acquired.stale_reason !== null ? `, stale_reason=${acquired.stale_reason}` : ""})`,
        ...(acquired.holder_session_missing
          ? ["  holder_session_missing: true（持有者会话注册缺席——锁面/会话面失配的显式检出）"]
          : []),
        `  hint: ${acquired.hint}`,
      ],
    );
  } catch (err) {
    return kernelFail("lock acquire", err, emptyLockAcquire());
  }
}

export interface LockHeartbeatReleaseResult {
  readonly lock_id: string;
  readonly holder_session_key: string | null;
}

const EMPTY_LOCK_REF: LockHeartbeatReleaseResult = {
  lock_id: "",
  holder_session_key: null,
};

/** `lock heartbeat`：持有人活性证明刷新（非持有人 LOCK_NOT_HELD 显式拒绝）。 */
export async function runLockHeartbeat(
  rootDir: string,
  lockId: string,
  sessionKey: string,
): Promise<CommandOutcome<LockHeartbeatReleaseResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("lock heartbeat", initialized.error, EMPTY_LOCK_REF);
  }
  try {
    const store = await createStore(rootDir);
    const record = await heartbeatLock(store, lockId, sessionKey);
    return okOutcome(
      "lock heartbeat",
      { lock_id: record.lock_id, holder_session_key: record.holder.session_key },
      [`lock heartbeat → ${record.lock_id} (heartbeat_at=${record.heartbeat_at}，心跳零事件)`],
    );
  } catch (err) {
    return kernelFail("lock heartbeat", err, EMPTY_LOCK_REF);
  }
}

/** `lock release`：持有人释放（锁文件删除 + journal LOCK_RELEASED + 会话 held_locks 同步）。 */
export async function runLockRelease(
  rootDir: string,
  lockId: string,
  sessionKey: string,
): Promise<CommandOutcome<LockHeartbeatReleaseResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("lock release", initialized.error, EMPTY_LOCK_REF);
  }
  try {
    const store = await createStore(rootDir);
    const released = await releaseLock(store, lockId, sessionKey);
    return okOutcome(
      "lock release",
      { lock_id: released.lock_id, holder_session_key: sessionKey },
      [`lock release → RELEASED ${released.lock_id} (journal LOCK_RELEASED 留痕)`],
    );
  } catch (err) {
    return kernelFail("lock release", err, EMPTY_LOCK_REF);
  }
}

export interface LockStealInput {
  readonly lockId: string;
  readonly sessionKey: string;
  readonly reason: string;
  readonly executionId?: string;
  readonly pid?: string;
}

export interface LockStealResult {
  readonly lock_id: string;
  readonly fence: number;
  readonly previous_holder_session_key: string;
  readonly previous_execution_interrupted: string | null;
}

function emptyLockSteal(): LockStealResult {
  return {
    lock_id: "",
    fence: 0,
    previous_holder_session_key: "",
    previous_execution_interrupted: null,
  };
}

/** `lock steal <lock> --reason`（D 线 §3.3.1 抢占仪式逐字词形）：fence+1 + 原执行封口。 */
export async function runLockSteal(
  rootDir: string,
  input: LockStealInput,
): Promise<CommandOutcome<LockStealResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("lock steal", initialized.error, emptyLockSteal());
  }
  const pid = parsePidArgv(input.pid);
  if ("error" in pid) {
    return notInitializedFail("lock steal", pid.error, emptyLockSteal());
  }
  const executionId = parseExecutionIdArgv(input.executionId);
  if ("error" in executionId) {
    return notInitializedFail("lock steal", executionId.error, emptyLockSteal());
  }
  try {
    const store = await createStore(rootDir);
    const stolen = await stealLock(store, {
      lockId: input.lockId,
      sessionKey: input.sessionKey,
      reason: input.reason,
      ...(executionId.executionId !== undefined
        ? { executionId: executionId.executionId }
        : {}),
      ...(pid.pid !== undefined ? { pid: pid.pid } : {}),
    });
    const result: LockStealResult = {
      lock_id: stolen.lock.lock_id,
      fence: stolen.lock.fence,
      previous_holder_session_key: stolen.previous_holder.session_key,
      previous_execution_interrupted: stolen.previous_holder.execution_id,
    };
    return okOutcome(
      "lock steal",
      result,
      [
        `lock steal → STOLEN ${stolen.lock.lock_id} (fence=${stolen.lock.fence}, 原持有者=${stolen.previous_holder.session_key})`,
        ...(stolen.previous_holder.execution_id !== null
          ? [`  原 execution ${stolen.previous_holder.execution_id} 已封口 interrupted（journal EXECUTION_INTERRUPTED）`]
          : []),
        `  reason: ${input.reason}`,
      ],
    );
  } catch (err) {
    return kernelFail("lock steal", err, emptyLockSteal());
  }
}

export interface LockListResult {
  readonly locks: readonly {
    readonly lock_id: string;
    readonly lock_kind: string;
    readonly holder_session_key: string;
    readonly holder_execution_id: string | null;
    readonly fence: number;
    readonly liveness: "held" | "stale";
    readonly stale_reason: string | null;
  }[];
}

/** `lock list`：锁清单（记录 + liveness 并排；纯读零写——装载走 loadStoreReadOnly
 *  零写副作用，审查 H3；空/侧车缺失 = 显式空）。 */
export async function runLockList(rootDir: string): Promise<CommandOutcome<LockListResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("lock list", initialized.error, { locks: [] });
  }
  try {
    const store = loadStoreReadOnly(rootDir);
    const rows = listLocks(pathsOf(store));
    const result: LockListResult = {
      locks: rows.map((row) => ({
        lock_id: row.record.lock_id,
        lock_kind: row.record.lock_kind,
        holder_session_key: row.record.holder.session_key,
        holder_execution_id: row.record.holder.execution_id,
        fence: row.record.fence,
        liveness: row.liveness,
        stale_reason: row.stale_reason,
      })),
    };
    const human = [
      result.locks.length === 0
        ? "lock list → 0 locks（尚无锁文件——显式空，acquire 后在此呈现）"
        : `lock list → ${result.locks.length} locks`,
      ...result.locks.map(
        (row) =>
          `  ${row.lock_id} holder=${row.holder_session_key} fence=${row.fence} liveness=${row.liveness}${row.stale_reason !== null ? ` stale_reason=${row.stale_reason}` : ""}`,
      ),
    ];
    return okOutcome("lock list", result, human);
  } catch (err) {
    return kernelFail("lock list", err, { locks: [] });
  }
}

// ============================================================
// execution 命令组
// ============================================================

export interface ExecutionBeginInput {
  readonly role: string;
  readonly runtime: string;
  readonly identityKind: string;
  readonly executionId?: string;
  readonly sessionKey?: string;
  readonly harness?: string;
  readonly taskId?: string;
  readonly changeId?: string;
  readonly permitIds?: readonly string[];
  readonly policyLock?: string;
  readonly model?: string;
  readonly notes?: string;
}

export interface ExecutionBeginResult {
  readonly execution_id: string;
  readonly role: string;
  readonly runtime: string;
  readonly identity_kind: string;
  readonly session_key: string | null;
  readonly started_at: string;
}

function emptyExecutionBegin(): ExecutionBeginResult {
  return {
    execution_id: "",
    role: "",
    runtime: "",
    identity_kind: "",
    session_key: null,
    started_at: "",
  };
}

/**
 * `execution begin`：登记执行身份（AGX-n 缺省分配=现有最大序号+1）。started_at 由
 * 本命令以基础设施墙钟盖章（非 argv 申报——盖章点不进 CLI 面，D 线 S1）。
 */
export async function runExecutionBegin(
  rootDir: string,
  input: ExecutionBeginInput,
): Promise<CommandOutcome<ExecutionBeginResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("execution begin", initialized.error, emptyExecutionBegin());
  }
  const executionId = parseExecutionIdArgv(input.executionId);
  if ("error" in executionId) {
    return notInitializedFail("execution begin", executionId.error, emptyExecutionBegin());
  }
  try {
    const store = await createStore(rootDir);
    const record = await beginExecution(store, {
      role: input.role,
      runtime: input.runtime,
      identityKind: input.identityKind,
      ...(executionId.executionId !== undefined
        ? { executionId: executionId.executionId }
        : {}),
      ...(input.sessionKey !== undefined ? { sessionKey: input.sessionKey } : {}),
      ...(input.harness !== undefined ? { harness: input.harness } : {}),
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.changeId !== undefined ? { changeId: input.changeId } : {}),
      ...(input.permitIds !== undefined ? { permitIds: input.permitIds } : {}),
      ...(input.policyLock !== undefined ? { policyLock: input.policyLock } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    const result: ExecutionBeginResult = {
      execution_id: record.execution_id,
      role: record.role,
      runtime: record.runtime,
      identity_kind: record.identity_kind,
      session_key: record.session_key,
      started_at: record.started_at,
    };
    return okOutcome(
      "execution begin",
      result,
      [
        `execution begin → ${record.execution_id} (role=${record.role}, runtime=${record.runtime}, identity_kind=${record.identity_kind})`,
        ...(record.session_key !== null
          ? [`  session: ${record.session_key} (${record.harness ?? "null"})`]
          : []),
        `  后续证据入账携带 --execution-id ${record.execution_id}（GRN/CLM 承载身份——DEF-GATEKEEPER 观测面联结键）`,
      ],
    );
  } catch (err) {
    return kernelFail("execution begin", err, emptyExecutionBegin());
  }
}

export interface ExecutionEndResult {
  readonly execution_id: string;
  readonly ended_at: string;
}

const EMPTY_EXECUTION_END: ExecutionEndResult = { execution_id: "", ended_at: "" };

/** `execution end <AGX-id>`：封口（ended_at 盖章 + journal EXECUTION_ENDED）。 */
export async function runExecutionEnd(
  rootDir: string,
  executionId: string,
  note?: string,
): Promise<CommandOutcome<ExecutionEndResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("execution end", initialized.error, EMPTY_EXECUTION_END);
  }
  const wordForm = parseExecutionIdArgv(executionId);
  if ("error" in wordForm) {
    return notInitializedFail("execution end", wordForm.error, EMPTY_EXECUTION_END);
  }
  try {
    const store = await createStore(rootDir);
    const record = await endExecution(
      store,
      executionId,
      note !== undefined ? { note } : undefined,
    );
    return okOutcome(
      "execution end",
      { execution_id: record.execution_id, ended_at: record.ended_at ?? "" },
      [`execution end → ENDED ${record.execution_id} (ended_at=${record.ended_at})`],
    );
  } catch (err) {
    return kernelFail("execution end", err, EMPTY_EXECUTION_END);
  }
}

export interface ExecutionListResult {
  readonly executions: readonly {
    readonly execution_id: string;
    readonly role: string;
    readonly runtime: string;
    readonly identity_kind: string;
    readonly session_key: string | null;
    /** 呈现两态（CLI 局部词 TODO(vocab-pr)）：ended_at null=active；interrupted 状态归 journal 面。 */
    readonly status: "active" | "ended";
    readonly started_at: string;
    readonly ended_at: string | null;
  }[];
}

/** `execution list`：执行身份档案清单（纯读零写——装载走 loadStoreReadOnly 零写副
 *  作用，审查 H3；空/侧车缺失 = 显式空）。 */
export async function runExecutionList(
  rootDir: string,
): Promise<CommandOutcome<ExecutionListResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return notInitializedFail("execution list", initialized.error, { executions: [] });
  }
  try {
    const store = loadStoreReadOnly(rootDir);
    const records = listExecutionRecords(pathsOf(store));
    const result: ExecutionListResult = {
      executions: records.map((record) => ({
        execution_id: record.execution_id,
        role: record.role,
        runtime: record.runtime,
        identity_kind: record.identity_kind,
        session_key: record.session_key,
        status: record.ended_at === null ? "active" : "ended",
        started_at: record.started_at,
        ended_at: record.ended_at,
      })),
    };
    const human = [
      result.executions.length === 0
        ? "execution list → 0 executions（尚无执行身份档案——显式空，execution begin 后在此呈现）"
        : `execution list → ${result.executions.length} executions`,
      ...result.executions.map(
        (row) =>
          `  ${row.execution_id} (${row.role}/${row.runtime}/${row.identity_kind}) status=${row.status} session=${row.session_key ?? "null"}`,
      ),
    ];
    return okOutcome("execution list", result, human);
  } catch (err) {
    return kernelFail("execution list", err, { executions: [] });
  }
}

/** 供 agents 观测面复用的 paths 访问（本模块内单一出口；StorePaths 公共化随本批）。 */
export function runtimeStorePaths(store: Store): StorePaths {
  return pathsOf(store);
}
