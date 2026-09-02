/**
 * locks.ts —— 多会话互斥锁原语（P20 D 线地基②；D 线 §3.3 逐字语义，机制 clean-room
 * 重实现——「只取机制思想，不抄代码」，吸收旧体系三个失效案例的对抗性设计）。
 *
 * D 线语义锚（§3.3.1 逐字出处）：
 * - 三粒度：`change-<CHG-ID>.lock`（强：一个 change 同一时刻只有一个驱动会话）/
 *   `task-<TASK-ID>.lock`（弱：多读单写意图登记）/ `unit-<key-hash>.lock`（写写互斥，
 *   读写共享）；锁文件路径形态 `.pomaster/runtime/locks/`（§1.3 逐字）；
 * - fencing token：单调递增计数存于锁内；「锁被 steal 后旧持有者的迟写因 fence 过期
 *   被拒——防止『僵尸复活插队』」；
 * - stale 判定：`now - heartbeat_at > ttl` **或** holder.pid 不存在 → stale；
 * - 抢占仪式：「接管方必须 $ pomaster lock steal <lock> --reason，产生一条 append-only
 *   事件并使原 execution 以 interrupted 结束——偷锁不可耻，也不可无声」（D2 同源：
 *   自动抢占被禁止，显式 steal 才是合法通路——本原语 acquire 永不自动抢占 stale 锁）；
 * - 心跳：锁持有期间刷新 heartbeat_at（会话面顺手刷新走 session.refreshSession）。
 *
 * 原子获取（§3.3.1「避免读-改-写竞态」的机制意图，clean-room 落法）：目标平台独占
 * 创建原语 `fs.linkSync(tmp, target)`（POSIX link / Windows CreateHardLinkW 语义同为
 * 「目标已存在即 EEXIST」的原子判定）——D 线原文提的 os.replace 在两平台都覆写既有
 * 目标，会静默顶掉并发持有者的锁，与互斥语义相反，故取独占 link 落法。tmp 先落完整
 * 内容再原子入位：崩溃至多留下 tmp 碎片（与 store staged write 同一纪律），锁文件
 * 本体要么不在、要么完整。
 *
 * 既有锁的交换式更新（P20 红队发现 1 修复：steal 曾是 readLockRecord→writeLockFile
 * 的无 CAS 读-改-写——跨进程双 child 同抢一把锁 read-read-write-write 交错双双成功
 * 且 fence 相同，fencing 单调性/强排他失守、journal 只剩一条 LOCK_STOLEN）。文件系统
 * 无 compare-and-swap 原语，swapLockCas 用「独占认领」（rename target→claim 原子唯一
 * 胜出）构造串行化点：认领后字节复核 + linkSync 独占回装，任何交错下 fence 严格单调
 * （详见 swapLockCas 注）。journal 事件一律 appendLine 原子追加（覆写落法会把并发方
 * 整行抹掉）。
 *
 * fence 跨锁周期绑定（G2 审查 G4）：锁文件语义 = release 即消亡、re-acquire 重置
 * fence=1（新锁周期非续期），故裸 fence 数字在不同周期间可复现——旧周期凭据在锁
 * 重建后可重新通过 fence 相等性校验（「任何交错下双凭据不可能同 valid」的反例）。
 * 封条：锁记录携带一次性周期代 `cycle`（acquire 时生成、release 消亡、steal 过户
 * 不变），写闸凭据 = (cycle, fence) 二元组；checkLockFence 对携带周期锚的凭据做
 * 双轴校验，跨周期旧凭据同 fence 也判 stale_fence（周期代为 runtime 侧车随机位，
 * 非治理事实、不入任何 digest）。
 *
 * 墙钟语义（A4 分层）：acquired_at/heartbeat_at/ttl_seconds 是 runtime 侧车墙钟
 * （hash 管辖外——GOLDEN-L1-WALLCLOCK 判词「人类时间只住 evidence/runtime 侧车」）；
 * journal 事件（LOCK_ACQUIRED/LOCK_RELEASED/LOCK_STOLEN/LOCK_STALE_OBSERVED/
 * EXECUTION_INTERRUPTED）一律 seq 采样（A4，无墙钟）。确定性由 `now` 注入点保障。
 */
import { existsSync, linkSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { Store } from "./index.js";
import { GovernanceError } from "./errors.js";
import { appendLine, ensureDir, isNotFoundError, isTransientSwapError, readText, sleepSync, withBoundedRetry } from "./io.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";
import { sha256OfCanonical } from "./digest.js";
import { LOCK_KIND_VALUES, type LockKindValue } from "./vocab.js";
import {
  assertExecutionAttachable,
  closeExecutionInternal,
  EXECUTION_ID_PATTERN,
} from "./execution.js";
import { readSessionRecord, writeSessionFile } from "./session.js";

/** 锁目录相对路径（D 线 §1.3 逐字；易变态 runtime 侧车）。 */
export const LOCKS_RELATIVE = ".pomaster/runtime/locks";

/** 缺省锁 TTL（D 线 §3.3.1 例文 ttl_seconds: 900 逐字）。 */
export const LOCK_DEFAULT_TTL_SECONDS = 900 as const;

/** unit 锁 lock_type 原文词形（D 线 §3.3.1 例文逐字；change/task 锁原文未给词形留 null）。 */
export const UNIT_LOCK_TYPE = "unit_write" as const;

/** unit 锁文件名 hash 段位宽（D 线 §3.3.1 例文 unit-a3f19c：6 hex 位）。 */
const UNIT_HASH_CHARS = 6;

// ============================================================
// 类型（文件世界 snake_case，镜像 D 线 §3.3.1 锁文件例文键序）
// ============================================================

/** 锁持有人（D 线 §3.3.1 例文 holder 键 逐字：session_key / execution_id / pid）。 */
export interface LockHolder {
  readonly session_key: string;
  readonly execution_id: string | null;
  readonly pid: number | null;
}

/** 锁文件形态（runtime/locks/<lock_id>.lock；闭形态，缺席 = null 显式）。 */
export interface LockRecord {
  /** 锁 id = 文件名词干：change-<ref> / task-<ref> / unit-<hash6>。 */
  readonly lock_id: string;
  /** 三粒度（D 线 §3.3.1 表；词轴 LOCK_KIND_VALUES）。 */
  readonly lock_kind: LockKindValue;
  /** unit 锁 = "unit_write"（例文逐字）；change/task 锁 null（原文词形缺位不发明）。 */
  readonly lock_type: typeof UNIT_LOCK_TYPE | null;
  /** unit 锁的 Governed Code Unit key；其余 null。 */
  readonly object_key: string | null;
  /** 关联 change 锚（例文 scope_change）。 */
  readonly scope_change: string | null;
  /** 关联 task 锚（task/change 锁语境；例文未给词形，general_id 宽松收纳）。 */
  readonly scope_task: string | null;
  readonly holder: LockHolder;
  /**
   * 锁周期代（acquire 时一次性生成；release 随锁文件消亡、steal 过户不变）。
   * 凭据 = (cycle, fence) 二元组——fence 在 re-acquire 后重置 1，裸 fence 数字跨
   * 周期可复现；周期代使 checkLockFence 能拒绝「锁重建后回魂」的旧周期凭据（G4）。
   */
  readonly cycle: string;
  /** fencing token（从 1 起；steal 时 +1——旧持有者迟写因 fence 过期被拒）。 */
  readonly fence: number;
  readonly acquired_at: string;
  readonly heartbeat_at: string;
  readonly ttl_seconds: number;
  /** 人类散文目的位（例文 purpose；机器不解析判卷）。 */
  readonly purpose: string | null;
}

/** acquireLock 输入。 */
export interface LockAcquireInput {
  readonly kind: LockKindValue;
  /** change/task 锁的引用词（如 CHG-0042 / CHANGE.C0001 / TASK.T0087；文件名安全化）。 */
  readonly ref?: string;
  /** unit 锁必填：Governed Code Unit key（文件名取其 sha256 前 6 hex——key 本体含点段）。 */
  readonly objectKey?: string;
  /** 持有人会话（必须已 attach——SESSION_NOT_FOUND）。 */
  readonly sessionKey: string;
  /** 持有人执行身份（在场时过 PRD §25.4 词形 + 档案存在性校验）。 */
  readonly executionId?: string;
  /** 持有人进程号（stale 判定的第二信号；可选）。 */
  readonly pid?: number;
  readonly scopeChange?: string;
  readonly scopeTask?: string;
  readonly ttlSeconds?: number;
  readonly purpose?: string;
  /** 墙钟注入点（epoch ms；缺省当前墙钟——基础设施盖章语义）。 */
  readonly now?: number;
}

/** acquireLock 显式三态：acquired / blocked（含 stale 判定）/ invalid 显式拒绝。 */
export type LockAcquireOutcome =
  | { readonly outcome: "acquired"; readonly lock: LockRecord }
  | {
      readonly outcome: "blocked";
      readonly lock_id: string;
      readonly holder: LockHolder;
      readonly fence: number;
      /** 持有人活性（stale = 可走 steal 显式接管；acquire 永不自动抢占——D2）。 */
      readonly holder_liveness: "alive" | "stale";
      readonly stale_reason: LockStaleReason | null;
      /** 持有人会话注册缺席（锁面/会话面失配——挂空持锁者的显式检出）。 */
      readonly holder_session_missing: boolean;
      readonly hint: string;
    };

/** stale 判定缘由（显式可见：为何判 stale 必须带因，不静默）。 */
export type LockStaleReason = "heartbeat_expired" | "holder_pid_gone" | null;

/** stale 判定（纯函数）：heartbeat 过期 或 holder.pid 不存在（D 线 §3.3.1 逐字两支）。 */
export function judgeLockStaleness(
  record: LockRecord,
  now: number,
): { readonly stale: boolean; readonly reason: LockStaleReason } {
  const heartbeat = Date.parse(record.heartbeat_at);
  if (Number.isFinite(heartbeat) && now - heartbeat > record.ttl_seconds * 1000) {
    return { stale: true, reason: "heartbeat_expired" };
  }
  if (record.holder.pid !== null && !pidAlive(record.holder.pid)) {
    return { stale: true, reason: "holder_pid_gone" };
  }
  return { stale: false, reason: null };
}

/** 单机 pid 活性（process.kill(pid, 0)：ESRCH=不存在；EPERM=存在无权限=活）。 */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

// ============================================================
// 读取（kernel 内部跨模块复用 + CLI 纯读呈现共用语义）
// ============================================================

export function lockRecordPath(paths: StorePaths, lockId: string): string {
  return `${paths.locksDir}/${lockId}.lock`;
}

function assertLockIdWordForm(lockId: string): void {
  if (!/^(change|task)-[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(lockId) &&
      !/^unit-[0-9a-f]{6}$/.test(lockId)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `lock_id 词形非法（change-<ref> / task-<ref> / unit-<6位hex>，D 线 §3.3.1 文件名词形）：${lockId}`,
      "lock_id 由 acquireLock 按 kind+ref/objectKey 机械派生，禁止手拼",
      { lock_id: lockId },
    );
  }
}

/**
 * 读取单把锁。缺失 → null（调用方翻译为 LOCK_NOT_FOUND）；损坏 → SCHEMA_INVALID
 * （禁静默——锁面损坏即互斥语义失真，显性暴露后由 Owner 清理 runtime/locks/）。
 */
export function readLockRecord(paths: StorePaths, lockId: string): LockRecord | null {
  assertLockIdWordForm(lockId);
  const text = readText(lockRecordPath(paths, lockId));
  if (text === null) return null;
  return parseLockBytes(lockId, text);
}

/** 锁字节解析（readLockRecord 与 swapLockCas 认领复核共用；形态缺失即 SCHEMA_INVALID）。 */
function parseLockBytes(lockId: string, text: string): LockRecord {
  try {
    const parsed = JSON.parse(text) as LockRecord;
    if (
      parsed.lock_id !== lockId ||
      typeof parsed.fence !== "number" ||
      parsed.holder === undefined ||
      typeof parsed.cycle !== "string" ||
      parsed.cycle.length === 0
    ) {
      throw new SyntaxError("lock_id/fence/holder/cycle 形态缺失");
    }
    return parsed;
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `锁文件无法解析（损坏或手改）：${LOCKS_RELATIVE}/${lockId}.lock`,
      "恢复一致性：确认无活跃持有者后删除该锁文件重建（易变态 runtime 侧车）；勿手改后带病继续",
      { cause: String(error), lock_id: lockId },
    );
  }
}

/** 锁清单行（记录 + liveness 判定并排——锁状态显式可见非隐式，P20 出口判据）。 */
export interface LockLivenessRow {
  readonly record: LockRecord;
  readonly liveness: "held" | "stale";
  readonly stale_reason: LockStaleReason;
}

/** 列举全部锁（文件名字典序；纯读零写——清单面不落任何事件）。 */
export function listLocks(paths: StorePaths, now: number = Date.now()): LockLivenessRow[] {
  let names: string[];
  try {
    names = readdirSync(paths.locksDir).filter((name) => name.endsWith(".lock")).sort();
  } catch {
    return [];
  }
  const rows: LockLivenessRow[] = [];
  for (const name of names) {
    const lockId = name.slice(0, -".lock".length);
    const record = readLockRecord(paths, lockId);
    if (record === null) continue;
    const judged = judgeLockStaleness(record, now);
    rows.push({
      record,
      liveness: judged.stale ? "stale" : "held",
      stale_reason: judged.reason,
    });
  }
  return rows;
}

/**
 * fence 校验（写闸消费原语：hook/编排层记录所验凭据后的复验通道——「锁被 steal
 * 后旧持有者的迟写因 fence 过期被拒」）。显式三态：valid / stale_fence / unknown_lock。
 *
 * 周期绑定（G4 反例封条）：裸 fence 数字在 release→re-acquire 的锁重建后可复现
 * （新周期 fence 重置 1），旧周期凭据凭 fence 相等即可重新通过 = 「僵尸凭据回魂」。
 * 凭据因此应为 (cycle, fence) 二元组（acquireLock/stealLock 返回的 LockRecord 整体
 * 留痕）：传入 `cycle` 时做双轴校验——fence 相等但周期代不匹配（含锁已重建换代）
 * 一律 stale_fence；`currentCycle` 随结果回带，供调用方从裸 fence 升级为完整凭据。
 * 只传 fence 的旧词形按 fence-only 复验（存量兼容）——写闸消费方必须记录完整凭据，
 * 周期代缺失的锁文件（手改/旧版落盘）在 parseLockBytes 即 SCHEMA_INVALID 拒读。
 */
export function checkLockFence(
  paths: StorePaths,
  lockId: string,
  fence: number,
  cycle?: string,
): { readonly outcome: "valid"; readonly currentFence: number; readonly currentCycle: string }
| { readonly outcome: "stale_fence"; readonly currentFence: number; readonly currentCycle: string }
| { readonly outcome: "unknown_lock" } {
  const record = readLockRecord(paths, lockId);
  if (record === null) return { outcome: "unknown_lock" };
  if (!Number.isInteger(fence) || fence < 1) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `fence 须为正整数（锁内单调计数从 1 起）：${String(fence)}`,
      "fencing token 来自 acquireLock/stealLock 返回的锁记录，不自造",
      { fence },
    );
  }
  // 周期代失配 = 凭据来自已消亡的旧锁周期（fence 即使撞上当前值也是跨周期复用）。
  const cycleMismatch = cycle !== undefined && cycle !== record.cycle;
  return fence === record.fence && !cycleMismatch
    ? { outcome: "valid", currentFence: record.fence, currentCycle: record.cycle }
    : { outcome: "stale_fence", currentFence: record.fence, currentCycle: record.cycle };
}

// ============================================================
// 获取 / 心跳 / 释放 / 显式接管（写通道唯一在本模块）
// ============================================================

function requireCurrentSeq(paths: StorePaths): number {
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir: paths.pomasterDir },
    );
  }
  return currentSeq;
}

function appendJournalLine(paths: StorePaths, event: Record<string, unknown>): void {
  // 原子追加（P20 红队发现 1）：read-modify-write 覆写落法会把并发进程刚追加的整行
  // 抹掉（并发 steal 双条 LOCK_STOLEN 只剩一条——偷锁可无声）。O_APPEND/FILE_APPEND_DATA
  // 单次 write 落位于当时文件尾，并发追加各自完整留痕。
  appendLine(paths.journalPath, `${JSON.stringify(event)}\n`);
}

/** 锁 id 机械派生（文件名安全：change/task 取安全化 ref；unit 取 key 哈希前 6 hex）。 */
function deriveLockId(kind: LockKindValue, ref: string | undefined, objectKey: string | undefined): string {
  if (kind === "unit") {
    if (typeof objectKey !== "string" || objectKey.trim().length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "unit 锁缺 objectKey（Governed Code Unit key 必填——unit-<key-hash> 的哈希派生源）",
        "传受管写目标的对象键（D 线 §3.3.1：unit 锁建立在 IR 键空间上，S6 机器键优先）",
        {},
      );
    }
    const digest = sha256OfCanonical({ unit: objectKey.trim() });
    const hex = digest.startsWith("sha256:") ? digest.slice("sha256:".length) : digest;
    return `unit-${hex.slice(0, UNIT_HASH_CHARS)}`;
  }
  if (typeof ref !== "string" || ref.trim().length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${kind} 锁缺 ref（${kind === "change" ? "change" : "task"} 引用词必填）`,
      "传 change/task 引用（如 CHG-0042 / TASK.T0087；general_id 宽松词形）",
      {},
    );
  }
  const sanitized = ref
    .trim()
    .replaceAll(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^([.])/, "L$1")
    .slice(0, 120);
  return `${kind}-${sanitized}`;
}

/** 持有人会话与执行身份的挂载校验（锁的 holder 不接悬空引用）。 */
function assertHolderAnchors(
  paths: StorePaths,
  sessionKey: string,
  executionId: string | undefined,
): void {
  if (readSessionRecord(paths, sessionKey) === null) {
    throw new GovernanceError(
      "SESSION_NOT_FOUND",
      `锁持有人会话未 attach：${sessionKey}`,
      "先 attachSession 注册会话（D 线 §1.2：谁持有谁的锁一目了然——不接自报悬空持有人）",
      { session_key: sessionKey },
    );
  }
  if (executionId !== undefined) {
    assertExecutionAttachable(paths, executionId);
  }
}

/**
 * 原子获取锁：tmp 落完整内容 → linkSync 独占入位（目标已存在即 EEXIST = 已被持有）。
 * blocked 显式三态回带持有者快照与 stale 判定（acquire 永不自动抢占——D2：自动抢占
 * 掩盖协调问题；stale 锁走 stealLock 显式接管）。成功 journal LOCK_ACQUIRED。
 */
export async function acquireLock(
  store: Store,
  input: LockAcquireInput,
): Promise<LockAcquireOutcome> {
  const paths = pathsOf(store);
  const currentSeq = requireCurrentSeq(paths);
  const kind = LOCK_KIND_VALUES.find((value) => value === input.kind);
  if (kind === undefined) {
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `lock kind 词表外：${String(input.kind)}（D 线 §3.3.1 三粒度闭包）`,
      `合法词形：${LOCK_KIND_VALUES.join(" | ")}；扩值走词汇表 PR（pending_vocab_pr）`,
      { kind: input.kind },
    );
  }
  const lockId = deriveLockId(kind, input.ref, input.objectKey);
  assertHolderAnchors(paths, input.sessionKey, input.executionId);
  const ttlSeconds = input.ttlSeconds ?? LOCK_DEFAULT_TTL_SECONDS;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `ttlSeconds 须为正整数（秒）：${String(ttlSeconds)}`,
      `缺省 ${LOCK_DEFAULT_TTL_SECONDS}（D 线 §3.3.1 例文逐字）`,
      { ttl_seconds: ttlSeconds },
    );
  }
  const nowMs = input.now ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const record: LockRecord = {
    lock_id: lockId,
    lock_kind: kind,
    lock_type: kind === "unit" ? UNIT_LOCK_TYPE : null,
    object_key: kind === "unit" ? (input.objectKey as string).trim() : null,
    scope_change: input.scopeChange?.trim() ? input.scopeChange.trim() : null,
    scope_task: input.scopeTask?.trim() ? input.scopeTask.trim() : null,
    holder: {
      session_key: input.sessionKey,
      execution_id: input.executionId ?? null,
      pid: input.pid ?? null,
    },
    cycle: newLockCycle(),
    fence: 1,
    acquired_at: nowIso,
    heartbeat_at: nowIso,
    ttl_seconds: ttlSeconds,
    purpose: input.purpose?.trim() ? input.purpose.trim() : null,
  };
  ensureDir(paths.locksDir);
  const target = lockRecordPath(paths, lockId);
  const tmp = `${target}.tmp-${process.pid}-${Math.floor(nowMs)}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    try {
      linkSync(tmp, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        rmSync(tmp, { force: true });
        return blockedOutcome(paths, lockId, nowMs);
      }
      throw error;
    }
  } finally {
    // link 成功后 tmp 仍在（硬链接两目录项同 inode）；入位/受阻两分支都要清 tmp。
    if (existsSync(tmp)) unlinkSync(tmp);
  }
  appendJournalLine(paths, {
    type: "LOCK_ACQUIRED",
    seq: currentSeq,
    lock_id: lockId,
    lock_kind: kind,
    holder: record.holder,
    fence: record.fence,
  });
  addLockToSession(paths, input.sessionKey, lockId);
  return { outcome: "acquired", lock: record };
}

/** 锁周期代生成（一次性随机位；runtime 侧车用，非治理事实不入任何 digest）。 */
function newLockCycle(): string {
  return randomBytes(16).toString("hex");
}

/** blocked 快照组装（持有者快照 + stale 判定 + 会话注册缺席检出，全部显式）。 */
function blockedOutcome(paths: StorePaths, lockId: string, nowMs: number): LockAcquireOutcome {
  // EEXIST 证明锁瞬息前在座；此刻读取缺席 = 并发方在 link 与读之间释放/换代的
  // 瞬态窗口。禁 `as LockRecord` 断言后解引用 null 裸崩（G8）——显式可重试语义。
  const record = readLockRecord(paths, lockId);
  if (record === null) {
    throw new GovernanceError(
      "ENVIRONMENT_ERROR",
      `锁状态瞬态消失（认领判定时在座，读取快照时已被并发方释放/重建）：${LOCKS_RELATIVE}/${lockId}.lock`,
      "锁处于并发争用窗口——稍后重试 acquire；反复出现请核对是否存在异常高频的锁争用方",
      { lock_id: lockId },
    );
  }
  const judged = judgeLockStaleness(record, nowMs);
  const holderSession = readSessionRecord(paths, record.holder.session_key);
  const staleObserved = judged.stale;
  if (staleObserved) {
    appendJournalLine(paths, {
      type: "LOCK_STALE_OBSERVED",
      seq: readCurrentSeq(paths),
      lock_id: lockId,
      stale_reason: judged.reason,
      holder: record.holder,
      fence: record.fence,
    });
  }
  return {
    outcome: "blocked",
    lock_id: lockId,
    holder: record.holder,
    fence: record.fence,
    holder_liveness: judged.stale ? "stale" : "alive",
    stale_reason: judged.reason,
    holder_session_missing: holderSession === null,
    hint: judged.stale
      ? `锁被 stale 持有人占据（${judged.reason ?? "unknown"}）——走 stealLock 显式接管并记事件（D2：自动抢占被禁止）`
      : "锁由活跃持有者占据——wait / 协调移交 / stealLock（显式 + reason，事件留痕）",
  };
}

/**
 * 锁心跳（持有期间刷新 heartbeat_at；非持有人显式拒绝——LOCK_NOT_HELD）。
 * 交换式 CAS 落盘（读-改-写覆写会在与并发 steal 交错时把 fence 顶回去——swap 串行化）。
 * 心跳语义零 journal 事件（同会话刷新）。
 */
export async function heartbeatLock(
  store: Store,
  lockId: string,
  sessionKey: string,
  now: number = Date.now(),
): Promise<LockRecord> {
  const paths = pathsOf(store);
  return swapLockCas<LockRecord>(paths, lockId, (record) => {
    if (record.holder.session_key !== sessionKey) {
      throw new GovernanceError(
        "LOCK_NOT_HELD",
        `锁由 ${record.holder.session_key} 持有，${sessionKey} 无权心跳：${lockId}`,
        "锁心跳是持有人活性证明；非持有人刷新 = 顶替活性信号（禁静默）",
        { lock_id: lockId, holder: record.holder.session_key },
      );
    }
    const next: LockRecord = { ...record, heartbeat_at: new Date(now).toISOString() };
    return { next, result: next };
  });
}

/**
 * 释放锁（仅持有人会话；非持有人 LOCK_NOT_HELD 显式拒绝）。交换式 CAS 认领即退役
 * （认领到的字节 = 本方读取的世代才准删——与并发 steal 交错时本方认领到的是新世代，
 * 复核不匹配归还重读，绝无「A 读旧世代 / B steal 过户 / A 删掉 B 的锁」的丢失更新）。
 * 锁文件删除 + journal LOCK_RELEASED + 会话 held_locks 同步。
 */
export async function releaseLock(
  store: Store,
  lockId: string,
  sessionKey: string,
): Promise<{ readonly released: true; readonly lock_id: string }> {
  const paths = pathsOf(store);
  const currentSeq = requireCurrentSeq(paths);
  const retired = swapLockCas(paths, lockId, (record) => {
    if (record.holder.session_key !== sessionKey) {
      throw new GovernanceError(
        "LOCK_NOT_HELD",
        `锁由 ${record.holder.session_key} 持有，${sessionKey} 无权释放：${lockId}`,
        "释放只能由持有人发起；他人锁的处置走 stealLock 显式接管（+reason 记事件）",
        { lock_id: lockId, holder: record.holder.session_key },
      );
    }
    return {
      next: null,
      result: { holder: record.holder, fence: record.fence },
    };
  });
  appendJournalLine(paths, {
    type: "LOCK_RELEASED",
    seq: currentSeq,
    lock_id: lockId,
    holder: retired.holder,
    fence: retired.fence,
  });
  removeLockFromSession(paths, sessionKey, lockId);
  return { released: true, lock_id: lockId };
}

/** stealLock 输入（接管仪式：显式 reason 是 D2 硬性要求——「偷锁不可耻，也不可无声」）。 */
export interface LockStealInput {
  readonly lockId: string;
  /** 接管方会话（必须已 attach）。 */
  readonly sessionKey: string;
  /** 接管方执行身份（在场时过档案存在性校验）。 */
  readonly executionId?: string;
  /** 接管方进程号。 */
  readonly pid?: number;
  /** 接管事由（非空必填；journal 留痕）。 */
  readonly reason: string;
  readonly now?: number;
}

/**
 * 显式接管锁（抢占仪式）：fence +1（旧持有者迟写因 fence 过期被拒；周期代 cycle
 * 随 `...record` 透传不变——凭据 = (cycle, fence) 二元组，过户只消耗新 fence）+
 * journal LOCK_STOLEN + 原持有人 execution 封口 interrupted（D 线 §3.3.1「使原 execution 以
 * interrupted 结束」；档案缺失容忍——锁回收不因档案面损毁阻塞，EXECUTION_INTERRUPTED
 * 事件仍如实留痕；已正常封口的 execution 无需再 interrupt——封口事实由档案 ended_at
 * 如实呈现，不重复留痕）+ 双方会话 held_locks 同步。reason 空 = SCHEMA_INVALID。
 * 交换式 CAS 落盘（swapLockCas）：跨进程并发 steal 同一把锁时串行化过户——fence 严格
 * 单调（2→3…），绝无 read-read-write-write 交错下的双凭据同 valid（P20 红队发现 1）。
 */
export async function stealLock(
  store: Store,
  input: LockStealInput,
): Promise<{ readonly stolen: true; readonly lock: LockRecord; readonly previous_holder: LockHolder }> {
  const paths = pathsOf(store);
  const currentSeq = requireCurrentSeq(paths);
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "steal 必须带 reason（接管留痕是 D2 的硬性要求——偷锁不可耻，也不可无声）",
      "写清为何原持有人未释放（如：昨晚会话已关）",
      {},
    );
  }
  assertHolderAnchors(paths, input.sessionKey, input.executionId);
  const nowMs = input.now ?? Date.now();
  const outcome = swapLockCas(paths, input.lockId, (record) => {
    const previous = record.holder;
    const updated: LockRecord = {
      ...record,
      holder: {
        session_key: input.sessionKey,
        execution_id: input.executionId ?? null,
        pid: input.pid ?? null,
      },
      fence: record.fence + 1,
      acquired_at: new Date(nowMs).toISOString(),
      heartbeat_at: new Date(nowMs).toISOString(),
    };
    return { next: updated, result: { stolen: true as const, lock: updated, previous_holder: previous } };
  });
  appendJournalLine(paths, {
    type: "LOCK_STOLEN",
    seq: currentSeq,
    lock_id: input.lockId,
    previous_holder: outcome.previous_holder,
    by: { session_key: input.sessionKey },
    reason,
    fence: outcome.lock.fence,
    previous_fence: outcome.lock.fence - 1,
  });
  // 原持有人 execution 封口 interrupted（D 线 §3.3.1 原文词形；档案缺失容忍；
  // 已正常封口容忍——锁回收不因档案面状态阻塞，也不伪造第二次封口事件）。
  if (
    outcome.previous_holder.execution_id !== null &&
    EXECUTION_ID_PATTERN.test(outcome.previous_holder.execution_id)
  ) {
    try {
      closeExecutionInternal(
        store,
        paths,
        outcome.previous_holder.execution_id,
        { note: `interrupted: lock ${input.lockId} stolen by ${input.sessionKey} — ${reason}` },
        "EXECUTION_INTERRUPTED",
        true,
      );
    } catch (error) {
      if (!(error instanceof GovernanceError) || error.code !== "EXECUTION_ALREADY_ENDED") {
        throw error;
      }
    }
  }
  removeLockFromSession(paths, outcome.previous_holder.session_key, input.lockId);
  addLockToSession(paths, input.sessionKey, input.lockId);
  return outcome;
}

// ============================================================
// 会话 held_locks 同步（锁面写通道对会话指针的联记；D 线 §3.1 例文字段）
// ============================================================

function addLockToSession(paths: StorePaths, sessionKey: string, lockId: string): void {
  const session = readSessionRecord(paths, sessionKey);
  if (session === null) return;
  if (session.held_locks.includes(lockId)) return;
  writeSessionFile(paths, { ...session, held_locks: [...session.held_locks, lockId] });
}

function removeLockFromSession(paths: StorePaths, sessionKey: string, lockId: string): void {
  const session = readSessionRecord(paths, sessionKey);
  if (session === null) return;
  if (!session.held_locks.includes(lockId)) return;
  writeSessionFile(paths, {
    ...session,
    held_locks: session.held_locks.filter((held) => held !== lockId),
  });
}

// ============================================================
// 既有锁的交换式更新（跨进程 CAS；heartbeat / release / steal 三条写通路唯一落法）
// ============================================================

/** swap 重试上界与确定性退避档（无随机——并发测试可复现；耗尽显式上抛禁静默）。 */
const LOCK_SWAP_ATTEMPTS = 5;
const LOCK_SWAP_BACKOFF_MS = [20, 50, 100, 200, 400] as const;

/** swap 专属唯一邻接名（同进程单调计数 + pid：跨进程唯一、同进程重入唯一）。 */
let swapSequence = 0;
function uniqueAdjacentPath(target: string, tag: string): string {
  swapSequence += 1;
  return `${target}.${tag}-${process.pid}-${swapSequence}`;
}

/** 残片清理尽力而为（claim/tmp 残片不参与读面：listLocks 只认 *.lock 后缀）。 */
function removeBestEffort(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    /* 主流程已成立或已上抛；残片交由 Owner/下轮清理 */
  }
}

/**
 * 锁文件交换式更新（P20 红队发现 1 的修复核心）。
 *
 * 原落法 readLockRecord→writeLockFile（rename 覆写）是无 CAS 的读-改-写：跨进程双
 * child 同抢一把锁时 read-read-write-write 交错——双双成功且 fence 相同（双凭据同
 * valid，fencing 强排他失守），journal 也被旧快照覆写抹成一条。文件系统没有
 * compare-and-swap，本落法用「独占认领」构造串行化点：
 *
 *   1. 读目标字节 B0（计划函数据 B0 世代计算新内容；抛错发生在认领之前——零占用）；
 *   2. `renameSync(target → claim)` 原子认领（并发认领者唯一胜出，余者 ENOENT 重读）；
 *   3. 复核 claim 字节 ≠ B0 → 认领到他人已换入的新世代 → link 原样归还（EEXIST =
 *      归还窗口有 acquire 插入 → 认领世代弃置，新世代在座）后重读重试；
 *   4. `linkSync(tmp → target)` 独占回装（EEXIST = 认领窗口有 acquire 插入 fence=1
 *      新世代 → 弃本世代重读——新世代的 LOCK_ACQUIRED 与本轮 steal 的 LOCK_STOLEN
 *      各自成立，语义自洽）；
 *   5. 成功：清 tmp 目录项（硬链接同 inode）、退役 claim（旧世代随之消亡）。
 *
 * 性质：认领-回装窗口内 target 缺席，其余 swapper 认领一律 ENOENT → 任意交错下
 * fence 严格单调、双凭据不可能同 valid。崩溃至多留下 inert 残片（claim/tmp 不参与
 * 读面；target 缺席语义 = 锁不在场——fail-closed 方向：旧凭据 unknown_lock 被拒）。
 * 瞬时缺席（他人认领窗口）与真释放对读者不可区分 → 两拍重读仍缺席才判 LOCK_NOT_FOUND。
 */
function swapLockCas<T>(
  paths: StorePaths,
  lockId: string,
  plan: (current: LockRecord) => { readonly next: LockRecord | null; readonly result: T },
): T {
  const target = lockRecordPath(paths, lockId);
  let missingObserved = 0;
  for (let attempt = 0; ; attempt += 1) {
    if (attempt >= LOCK_SWAP_ATTEMPTS) {
      throw new GovernanceError(
        "ENVIRONMENT_ERROR",
        `锁交换竞态重试耗尽（${LOCK_SWAP_ATTEMPTS} 次确定性退避后仍无法独占认领）：${LOCKS_RELATIVE}/${lockId}.lock`,
        "并发方持续争用同一把锁——稍后重试该命令；反复出现请核对是否存在异常高频的锁争用方",
        { lock_id: lockId, attempts: LOCK_SWAP_ATTEMPTS },
      );
    }
    if (attempt > 0) {
      sleepSync(LOCK_SWAP_BACKOFF_MS[Math.min(attempt - 1, LOCK_SWAP_BACKOFF_MS.length - 1)] as number);
    }
    const before = readText(target);
    if (before === null) {
      missingObserved += 1;
      if (missingObserved >= 2) {
        throw new GovernanceError(
          "LOCK_NOT_FOUND",
          `锁不存在：${lockId}`,
          "核对 lock_id（runtime/locks/ 清单以 listLocks 显式呈现）",
          { lock_id: lockId },
        );
      }
      continue; // 他人认领窗口的瞬时缺席 → 短退避后重读
    }
    missingObserved = 0;
    const current = parseLockBytes(lockId, before);
    const { next, result } = plan(current);
    // 唯一邻接 tmp 名恒先取（next=null 的释放通路不落文件；清理对不存在路径安全）。
    const tmp = uniqueAdjacentPath(target, "tmp");
    if (next !== null) {
      try {
        writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      } catch (error) {
        removeBestEffort(tmp);
        throw error;
      }
    }
    const claim = uniqueAdjacentPath(target, "claim");
    try {
      // 认领 rename 吃有界确定性重试（Windows 下并发读者握着目标句柄时 rename 报瞬时
      // EPERM——同 io.ts 发现 4 的共享面语义；失败未发生状态变更，重试安全）。
      withBoundedRetry(() => renameSync(target, claim), isTransientSwapError);
    } catch (error) {
      removeBestEffort(tmp);
      if (isNotFoundError(error)) continue; // 被他人认领（或恰被释放）→ 重读
      throw error;
    }
    const claimedBytes = readText(claim);
    if (claimedBytes !== before) {
      // 认领到他人已换入的新世代：原样归还原位后重读（禁盲覆写——CAS 语义核心）。
      try {
        linkSync(claim, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          // 归还窗口有 acquire 插入新世代 → 认领世代弃置（新世代在座，fence 防写兜底）。
          removeBestEffort(tmp);
          removeBestEffort(claim);
          continue;
        }
        removeBestEffort(tmp);
        throw error; // claim 原样留盘（认领内容未受损——手工归位指路随错误上抛）
      }
      removeBestEffort(tmp);
      removeBestEffort(claim);
      continue;
    }
    if (next === null) {
      // 释放通路：认领即退役（不回装——释放语义 = 锁文件消亡）。
      try {
        rmSync(claim, { force: true });
      } catch (error) {
        throw new GovernanceError(
          "ENVIRONMENT_ERROR",
          `锁认领文件退役失败（锁已出位但残片在盘）：${claim}`,
          "手动删除该残片文件即完成释放（残片不参与读面，listLocks 只认 *.lock）",
          { lock_id: lockId, claim, cause: String(error) },
        );
      }
      return result;
    }
    try {
      linkSync(tmp, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        // 认领窗口有 acquire 插入新世代 → 弃本世代，重读新世代再走本轮仪式。
        removeBestEffort(tmp);
        removeBestEffort(claim);
        continue;
      }
      removeBestEffort(tmp);
      throw error; // claim 原样留盘（手工归位指路随错误上抛）
    }
    removeBestEffort(tmp); // link 后同 inode 双目录项：tmp 目录项清理（target 在座）
    removeBestEffort(claim); // 旧世代退役
    return result;
  }
}
