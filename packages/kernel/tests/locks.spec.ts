/**
 * locks.spec.ts —— 三粒度互斥锁原语（P20 D 线地基②；D 线 §3.3）。
 *
 * 判据锚：
 * - 三粒度词形（§3.3.1 表）：change-<ref>.lock（强排他）/ task-<ref>.lock（弱意图）/
 *   unit-<key-hash>.lock（写写互斥；unit_type=unit_write 例文逐字）；lock id 机械派生
 *   （unit 取 objectKey sha256 前 6 hex——IR 键空间，S6）；
 * - 互斥：acquire 已持锁 → blocked 显式回带持有者快照（永不静默顶替/静默等待）；
 *   原子独占创建（link 语义）双会话同拍竞态只有一方成功；
 * - stale 判定（§3.3.1 逐字两支）：heartbeat 过期 或 holder.pid 不存在 → stale 显式
 *   带 reason；stale 只解锁「可 steal」，acquire 永不自动抢占（D2：自动抢占被禁止）；
 * - 抢占仪式：steal 必须 reason（D2 硬性要求）；fence 单调 +1（旧持有者迟写因 fence
 *   过期被拒——checkLockFence）；journal LOCK_STOLEN + 原 execution 封口 interrupted
 *   （§3.3.1「使原 execution 以 interrupted 结束」）；
 * - 释放/心跳仅持有人（LOCK_NOT_HELD 显式拒绝）；清单 listLocks 记录+判定并排
 *   （锁状态显式可见非隐式）；journal LOCK_ACQUIRED/LOCK_RELEASED（A4 seq 采样）；
 * - 会话 held_locks 双向同步（acquire/release/steal）；
 * - 交换式落盘（P20 红队发现 1 修复）：heartbeat/release/steal 三条既有锁写通路走
 *   swapLockCas（独占认领串行化——跨进程并发回归见 tests/integration/
 *   concurrent-session-locks.spec.ts E 段）；原 execution 已封口的 steal 容忍
 *   （回收不因档案面状态阻塞、不伪造第二次封口事件）。
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireLock,
  attachSession,
  beginExecution,
  checkLockFence,
  endExecution,
  heartbeatLock,
  listLocks,
  readLockRecord,
  readSessionRecord,
  releaseLock,
  stealLock,
  LOCK_DEFAULT_TTL_SECONDS,
  type LockRecord,
  type Store,
} from "@pomaster/kernel";
import { pathsOf } from "../src/paths.js";
import { makeStore } from "./helpers.js";

/**
 * 并发窗口注入器（store.spec.ts 同款 vi.mock 委托式 hook）：默认 hidePath=null =
 * 纯透传（本文件其余用例零影响）。G8 回归用 hidePath 让指定锁路径在 blockedOutcome
 * 快照读取时消失（确定性复现 link-EEXIST 与读取之间的并发释放窗口，禁 flake）。
 */
const ioInterceptor = vi.hoisted(() => ({
  hidePath: null as string | null,
}));

vi.mock("../src/io.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/io.js")>();
  return {
    ...actual,
    readText: (path: string) => {
      if (ioInterceptor.hidePath !== null && path === ioInterceptor.hidePath) {
        rmSync(path, { force: true });
      }
      return actual.readText(path);
    },
  };
});

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

const T0 = Date.parse("2026-08-30T09:00:00.000Z");
const A = "claude_9f3ab2c1";
const B = "codex_77c10d";

function lockPath(lockId: string): string {
  return join(root, ".pomaster", "runtime", "locks", `${lockId}.lock`);
}

function journalEvents(): Array<Record<string, unknown>> {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function attachBoth(): Promise<void> {
  await attachSession(store, { sessionKey: A, harness: "claude-code", now: T0 });
  await attachSession(store, { sessionKey: B, harness: "codex", now: T0 });
}

describe("acquireLock（原子获取）", () => {
  it("change 锁获取：文件落 runtime/locks/change-CHG-0042.lock；例文键在场 + fence=1 + journal LOCK_ACQUIRED", async () => {
    await attachBoth();
    const outcome = await acquireLock(store, {
      kind: "change",
      ref: "CHG-0042",
      sessionKey: A,
      purpose: "checkbox saga 收敛",
      now: T0,
    });
    if (outcome.outcome !== "acquired") throw new Error("expect acquired");
    expect(outcome.lock.lock_id).toBe("change-CHG-0042");
    expect(outcome.lock.lock_kind).toBe("change");
    expect(outcome.lock.fence).toBe(1);
    expect(outcome.lock.holder).toEqual({ session_key: A, execution_id: null, pid: null });
    expect(existsSync(lockPath("change-CHG-0042"))).toBe(true);
    const acquired = journalEvents().find((event) => event.type === "LOCK_ACQUIRED");
    expect(acquired?.lock_id).toBe("change-CHG-0042");
    // A4：事件按 store seq 采样——会话/锁原语不推进事务序，同拍事件同 seq（单调性由
    // store 事务管辖面保证；本平面靠 journal 行序表达先后）。
    expect(acquired?.seq).toBe(0);
    expect(Object.keys(acquired ?? {}).some((key) => key.endsWith("_at"))).toBe(false);
  });

  it("互斥：B 获取同 change 锁 → blocked 显式回带持有者快照（alive；永不静默顶替）", async () => {
    await attachBoth();
    await acquireLock(store, { kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 });
    const blocked = await acquireLock(store, {
      kind: "change",
      ref: "CHG-0042",
      sessionKey: B,
      now: T0 + 1000,
    });
    expect(blocked.outcome).toBe("blocked");
    if (blocked.outcome !== "blocked") return;
    expect(blocked.holder.session_key).toBe(A);
    expect(blocked.holder_liveness).toBe("alive");
    expect(blocked.stale_reason).toBeNull();
    expect(blocked.hint).toContain("stealLock");
  });

  it("lock_type 词形：unit 锁 = unit_write（例文逐字）；change/task 锁 null（原文词形缺位不发明）", async () => {
    await attachBoth();
    const unit = await acquireLock(store, {
      kind: "unit",
      objectKey: "FE.GRID.MASTER_EDITABLE_GRID.toColDef",
      sessionKey: A,
      now: T0,
    });
    const change = await acquireLock(store, { kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 });
    const task = await acquireLock(store, { kind: "task", ref: "TASK.T0117", sessionKey: A, now: T0 });
    if (unit.outcome !== "acquired" || change.outcome !== "acquired" || task.outcome !== "acquired") {
      throw new Error("expect all acquired");
    }
    expect(unit.lock.lock_type).toBe("unit_write");
    expect(change.lock.lock_type).toBeNull();
    expect(task.lock.lock_type).toBeNull();
    expect(unit.lock.lock_id).toMatch(/^unit-[0-9a-f]{6}$/);
    // 同 objectKey → 同 lock id（哈希派生确定性，IR 键空间）。
    const again = await acquireLock(store, {
      kind: "unit",
      objectKey: "FE.GRID.MASTER_EDITABLE_GRID.toColDef",
      sessionKey: B,
      now: T0,
    });
    expect(again.outcome).toBe("blocked");
    if (again.outcome !== "blocked") return;
    expect(again.lock_id).toBe(unit.lock.lock_id);
  });

  it("双会话同拍竞态：原子独占创建只有一方成功（另一方 blocked）", async () => {
    await attachBoth();
    const [first, second] = await Promise.all([
      acquireLock(store, { kind: "change", ref: "CHG-RACE", sessionKey: A, now: T0 }),
      acquireLock(store, { kind: "change", ref: "CHG-RACE", sessionKey: B, now: T0 }),
    ]);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["acquired", "blocked"]);
  });

  it("持有人未 attach → SESSION_NOT_FOUND；execution_id 未登记 → EXECUTION_NOT_FOUND（不接悬空引用）", async () => {
    await expect(
      acquireLock(store, { kind: "change", ref: "CHG-1", sessionKey: "ghost_1", now: T0 }),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    await attachSession(store, { sessionKey: A, harness: "claude-code", now: T0 });
    await expect(
      acquireLock(store, {
        kind: "change", ref: "CHG-1", sessionKey: A, executionId: "AGX-2026-09999", now: T0,
      }),
    ).rejects.toMatchObject({ code: "EXECUTION_NOT_FOUND" });
  });

  it("kind 词表外 → VOCAB_INVALID_VALUE；unit 缺 objectKey / change 缺 ref → SCHEMA_INVALID", async () => {
    await attachSession(store, { sessionKey: A, harness: "claude-code", now: T0 });
    await expect(
      acquireLock(store, { kind: "global" as never, ref: "X", sessionKey: A, now: T0 }),
    ).rejects.toMatchObject({ code: "VOCAB_INVALID_VALUE" });
    await expect(
      acquireLock(store, { kind: "unit", sessionKey: A, now: T0 }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      acquireLock(store, { kind: "change", sessionKey: A, now: T0 }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

describe("stale 判定与显式接管（D2）", () => {
  it("stale 判定两支显式带因：heartbeat 过期 / holder.pid 不存在；alive 不误判", async () => {
    await attachBoth();
    // 真实死亡 pid（spawnSync 短命子进程退出后其 pid 不再存活——判定的「pid 不存在」支）。
    const { spawnSync } = await import("node:child_process");
    const dead = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
    const deadPid = dead.pid as number;
    await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A, pid: deadPid, now: T0,
    });
    // heartbeat 过期支（注入 now 前移；即便 pid 已死也先报 heartbeat_expired——顺序判定）。
    const expired = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: B, now: T0 + (LOCK_DEFAULT_TTL_SECONDS + 1) * 1000,
    });
    expect(expired.outcome).toBe("blocked");
    if (expired.outcome === "blocked") {
      expect(expired.holder_liveness).toBe("stale");
      expect(expired.stale_reason).toBe("heartbeat_expired");
    }
    // pid 消亡支（heartbeat 刚刷新未过期，但持有人进程已死）。
    await heartbeatLock(store, "change-CHG-0042", A, T0 + (LOCK_DEFAULT_TTL_SECONDS + 1) * 1000 + 1000);
    const judged = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: B,
      now: T0 + (LOCK_DEFAULT_TTL_SECONDS + 1) * 1000 + 2000,
    });
    expect(judged.outcome).toBe("blocked");
    if (judged.outcome === "blocked") {
      expect(judged.holder_liveness).toBe("stale");
      expect(judged.stale_reason).toBe("holder_pid_gone");
    }
  });

  it("acquire 永不自动抢占 stale 锁（D2）——blocked 只给路标；steal 显式接管成功并记事件", async () => {
    await attachBoth();
    const execution = await beginExecution(store, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
      sessionKey: A,
      harness: "claude-code",
      startedAt: "2026-08-29T20:00:00.000Z",
    });
    await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A, executionId: execution.execution_id, now: T0,
    });
    const blocked = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: B, now: T0 + 10_000_000,
    });
    expect(blocked.outcome).toBe("blocked");
    const stolen = await stealLock(store, {
      lockId: "change-CHG-0042",
      sessionKey: B,
      reason: "昨晚会话已关",
      now: T0 + 10_000_100,
    });
    expect(stolen.stolen).toBe(true);
    expect(stolen.previous_holder.session_key).toBe(A);
    expect(stolen.lock.fence).toBe(2);
    expect(stolen.lock.holder.session_key).toBe(B);
    expect(journalEvents().some((event) => event.type === "LOCK_STOLEN")).toBe(true);
    const stolenEvent = journalEvents().find((event) => event.type === "LOCK_STOLEN");
    expect(stolenEvent?.reason).toBe("昨晚会话已关");
    expect(stolenEvent?.previous_fence).toBe(1);
    // 原 execution 封口 interrupted（D 线 §3.3.1）。
    expect(journalEvents().some((event) => event.type === "EXECUTION_INTERRUPTED")).toBe(true);
    const closed = readSessionRecord(pathsOf(store), A);
    expect(closed?.held_locks).toEqual([]);
    const bRecord = readSessionRecord(pathsOf(store), B);
    expect(bRecord?.held_locks).toEqual(["change-CHG-0042"]);
  });

  it("fencing token：steal 后旧持有者凭旧 fence 写闸被拒（stale_fence），新持有者 valid", async () => {
    await attachBoth();
    await acquireLock(store, { kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 });
    const paths = pathsOf(store);
    expect(checkLockFence(paths, "change-CHG-0042", 1)).toMatchObject({ outcome: "valid" });
    await stealLock(store, { lockId: "change-CHG-0042", sessionKey: B, reason: "接管", now: T0 + 5000 });
    expect(checkLockFence(paths, "change-CHG-0042", 1)).toMatchObject({
      outcome: "stale_fence", currentFence: 2,
    });
    expect(checkLockFence(paths, "change-CHG-0042", 2)).toMatchObject({ outcome: "valid" });
    expect(checkLockFence(paths, "change-NOPE", 1)).toMatchObject({ outcome: "unknown_lock" });
  });

  it("锁周期代绑定（G4）：release→re-acquire 新周期上，同 fence 旧周期凭据 stale_fence（僵尸凭据回魂封条）；steal 过户周期代不变", async () => {
    const paths = pathsOf(store);
    await attachBoth();
    const first = await acquireLock(store, { kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 });
    if (first.outcome !== "acquired") throw new Error("expect acquired");
    const staleCycle = first.lock.cycle;
    // 周期代是一次性随机位（16 字节 hex；runtime 侧车，非治理事实）。
    expect(staleCycle).toMatch(/^[0-9a-f]{32}$/);
    await releaseLock(store, "change-CHG-0042", A);
    // 锁不在场：凭据不跨周期存续（既有语义——unknown_lock 非 stale_fence）。
    expect(checkLockFence(paths, "change-CHG-0042", 1, staleCycle)).toMatchObject({
      outcome: "unknown_lock",
    });
    // 新锁周期 fence 重置 1：裸 fence 数字撞上当前值 → 兼容词形 valid；携带旧周期代
    // → stale_fence（G4 反例封条：fence 相等但周期代不匹配 = 跨周期复用的旧凭据）。
    const second = await acquireLock(store, { kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 + 1000 });
    if (second.outcome !== "acquired") throw new Error("expect acquired");
    expect(second.lock.fence).toBe(1);
    expect(second.lock.cycle).not.toBe(staleCycle);
    expect(checkLockFence(paths, "change-CHG-0042", 1)).toMatchObject({
      outcome: "valid", currentCycle: second.lock.cycle,
    });
    expect(checkLockFence(paths, "change-CHG-0042", 1, staleCycle)).toMatchObject({
      outcome: "stale_fence", currentFence: 1, currentCycle: second.lock.cycle,
    });
    expect(checkLockFence(paths, "change-CHG-0042", 1, second.lock.cycle)).toMatchObject({
      outcome: "valid",
    });
    // steal 过户：周期代透传不变、fence +1——同周期旧 fence 凭据照常 stale_fence。
    const stolen = await stealLock(store, {
      lockId: "change-CHG-0042", sessionKey: B, reason: "接管", now: T0 + 2000,
    });
    expect(stolen.lock.cycle).toBe(second.lock.cycle);
    expect(checkLockFence(paths, "change-CHG-0042", 1, second.lock.cycle)).toMatchObject({
      outcome: "stale_fence",
    });
    expect(checkLockFence(paths, "change-CHG-0042", 2, second.lock.cycle)).toMatchObject({
      outcome: "valid",
    });
  });

  it("blocked 快照遇锁瞬态消失 → ENVIRONMENT_ERROR 显式可重试（G8 禁 as 断言后解引用 null 裸崩）", async () => {
    await attachBoth();
    await acquireLock(store, { kind: "change", ref: "CHG-VANISH", sessionKey: A, now: T0 });
    // 注入：blockedOutcome 快照读取时锁文件恰好被并发方释放（link-EEXIST 与读取之间）。
    // 路径拼法与 lockRecordPath 同形（buildStorePaths 用 / 拼接）。
    ioInterceptor.hidePath = `${root}/.pomaster/runtime/locks/change-CHG-VANISH.lock`;
    try {
      await expect(
        acquireLock(store, { kind: "change", ref: "CHG-VANISH", sessionKey: B, now: T0 + 1000 }),
      ).rejects.toMatchObject({ code: "ENVIRONMENT_ERROR" });
    } finally {
      ioInterceptor.hidePath = null;
    }
  });

  it("steal 无 reason → SCHEMA_INVALID（偷锁不可耻，也不可无声）；未知锁 → LOCK_NOT_FOUND", async () => {
    await attachBoth();
    await expect(
      stealLock(store, { lockId: "change-CHG-0042", sessionKey: B, reason: "  ", now: T0 }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      stealLock(store, { lockId: "change-CHG-0042", sessionKey: B, reason: "接管", now: T0 }),
    ).rejects.toMatchObject({ code: "LOCK_NOT_FOUND" });
  });

  it("steal 会话未 attach → SESSION_NOT_FOUND（接管方也必须实名）", async () => {
    await attachSession(store, { sessionKey: A, harness: "claude-code", now: T0 });
    await acquireLock(store, { kind: "change", ref: "CHG-1", sessionKey: A, now: T0 });
    await expect(
      stealLock(store, { lockId: "change-CHG-1", sessionKey: "ghost_2", reason: "接管", now: T0 }),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
  });

  it("原 execution 已正常封口的锁 steal 容忍（EXECUTION_ALREADY_ENDED 不阻断回收、不伪造第二次封口事件）——锁回收不因档案面状态阻塞", async () => {
    await attachBoth();
    const execution = await beginExecution(store, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
      sessionKey: A,
      harness: "claude-code",
      startedAt: "2026-08-29T20:00:00.000Z",
    });
    await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A, executionId: execution.execution_id, now: T0,
    });
    // execution 先行正常封口（ended_at 在场）——steal 不得因重复封口被拒而留在
    // 「锁已过户、事件/会话面未同步」的半状态（P20 红队修复批次的顺带加固）。
    await endExecution(store, execution.execution_id, { endedAt: "2026-08-29T21:00:00.000Z" });
    const eventsBefore = journalEvents().length;
    const stolen = await stealLock(store, {
      lockId: "change-CHG-0042", sessionKey: B, reason: "接管", now: T0 + 5000,
    });
    expect(stolen.stolen).toBe(true);
    expect(stolen.lock.fence).toBe(2);
    // LOCK_STOLEN 在案（顶替留痕）且无 EXECUTION_INTERRUPTED（不伪造第二次封口）。
    expect(journalEvents().some((event) => event.type === "LOCK_STOLEN")).toBe(true);
    expect(journalEvents().some((event) => event.type === "EXECUTION_INTERRUPTED")).toBe(false);
    expect(journalEvents().length).toBe(eventsBefore + 1);
    // 双方会话 held_locks 同步完成（半状态不复存在）。
    expect(readSessionRecord(pathsOf(store), A)?.held_locks).toEqual([]);
    expect(readSessionRecord(pathsOf(store), B)?.held_locks).toEqual(["change-CHG-0042"]);
  });
});

describe("释放 / 心跳 / 清单（持有人纪律 + 显式可见）", () => {
  it("释放仅持有人：非持有人 LOCK_NOT_HELD；持有人释放删文件 + journal LOCK_RELEASED + held_locks 同步", async () => {
    await attachBoth();
    await acquireLock(store, { kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 });
    await expect(releaseLock(store, "change-CHG-0042", B)).rejects.toMatchObject({
      code: "LOCK_NOT_HELD",
    });
    await releaseLock(store, "change-CHG-0042", A);
    expect(existsSync(lockPath("change-CHG-0042"))).toBe(false);
    expect(journalEvents().some((event) => event.type === "LOCK_RELEASED")).toBe(true);
    const aRecord = readSessionRecord(pathsOf(store), A);
    expect(aRecord?.held_locks).toEqual([]);
    const again = await acquireLock(store, { kind: "change", ref: "CHG-0042", sessionKey: B, now: T0 + 1000 });
    expect(again.outcome).toBe("acquired");
  });

  it("心跳仅持有人：非持有人 LOCK_NOT_HELD；持有人刷新 heartbeat_at（stale 窗口前移）", async () => {
    await attachSession(store, { sessionKey: A, harness: "claude-code", now: T0 });
    await acquireLock(store, { kind: "change", ref: "CHG-1", sessionKey: A, now: T0 });
    await expect(heartbeatLock(store, "change-CHG-1", "codex_x", T0 + 1000)).rejects.toMatchObject({
      code: "LOCK_NOT_HELD",
    });
    const refreshed = await heartbeatLock(store, "change-CHG-1", A, T0 + 2000);
    expect(refreshed.heartbeat_at).toBe("2026-08-30T09:00:02.000Z");
  });

  it("listLocks 清单记录+判定并排（锁状态显式可见非隐式）；读零写（不落 journal）", async () => {
    await attachBoth();
    await acquireLock(store, { kind: "change", ref: "CHG-A", sessionKey: A, now: T0 });
    await acquireLock(store, { kind: "change", ref: "CHG-B", sessionKey: B, now: T0, ttlSeconds: 10 });
    const rows = listLocks(pathsOf(store), T0 + 1000);
    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((row) => [row.record.lock_id, row]));
    expect(byId.get("change-CHG-A")?.liveness).toBe("held");
    expect(byId.get("change-CHG-B")?.liveness).toBe("held");
    // ttl_seconds=10s 的锁：越界即 stale（严格超出边界拍）。
    const aged = listLocks(pathsOf(store), T0 + 11_000);
    const agedById = new Map(aged.map((row) => [row.record.lock_id, row]));
    expect(agedById.get("change-CHG-A")?.liveness).toBe("held");
    expect(agedById.get("change-CHG-B")?.liveness).toBe("stale");
    expect(agedById.get("change-CHG-B")?.stale_reason).toBe("heartbeat_expired");
    const journalBefore = journalEvents().length;
    listLocks(pathsOf(store), T0 + 11_000);
    expect(journalEvents().length).toBe(journalBefore);
  });

  it("锁文件损坏 → SCHEMA_INVALID（禁静默当无锁）；重复 acquire 同会话幂等加锁失败显式 blocked", async () => {
    await attachSession(store, { sessionKey: A, harness: "claude-code", now: T0 });
    await acquireLock(store, { kind: "change", ref: "CHG-1", sessionKey: A, now: T0 });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(lockPath("change-BROKEN"), "not json", "utf8");
    expect(() => readLockRecord(pathsOf(store), "change-BROKEN")).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
    const self = await acquireLock(store, {
      kind: "change", ref: "CHG-1", sessionKey: A, now: T0 + 1000,
    });
    // 同会话重复获取同样 blocked（互斥无豁免；持有人身份显式回带——不静默续期）。
    expect(self.outcome).toBe("blocked");
    if (self.outcome === "blocked") expect(self.holder.session_key).toBe(A);
  });

  it("锁记录例文键与派生锚（unit 锁 object_key/scope_change/purpose + acquired_at 墙钟位）", async () => {
    await attachSession(store, { sessionKey: A, harness: "claude-code", now: T0 });
    await acquireLock(store, {
      kind: "unit",
      objectKey: "FE.GRID.toColDef",
      sessionKey: A,
      scopeChange: "CHG-0042",
      purpose: "checkbox saga 收敛",
      now: T0,
    });
    const { readdirSync } = await import("node:fs");
    const fileName = readdirSync(join(root, ".pomaster", "runtime", "locks")).sort()[0] as string;
    const onDisk = JSON.parse(
      readFileSync(join(root, ".pomaster", "runtime", "locks", fileName), "utf8"),
    ) as LockRecord;
    expect(onDisk.object_key).toBe("FE.GRID.toColDef");
    expect(onDisk.scope_change).toBe("CHG-0042");
    expect(onDisk.purpose).toBe("checkbox saga 收敛");
    expect(onDisk.acquired_at).toBe("2026-08-30T09:00:00.000Z");
    expect(onDisk.heartbeat_at).toBe("2026-08-30T09:00:00.000Z");
    expect(onDisk.ttl_seconds).toBe(LOCK_DEFAULT_TTL_SECONDS);
    expect(onDisk.lock_id).toBe(fileName.slice(0, -".lock".length));
  });
});
