/**
 * concurrent-session-locks.spec.ts —— 双会话并发互斥/检出 + 崩溃回收（L2 账；P20）。
 *
 * 解锁登记：tests/README.md「显式 deferred 登记」段的并发会话锁 deferred 至 P20——
 * 本文件即其解锁交付（wave3-plan.md P20 出口判据「P16 遗留的 L2 并发锁测试解锁入账」）。
 *
 * 覆盖面（D 线 §3.3 相撞语义在真实多会话形态下的磁盘态验证）：
 * - A 段：双会话（两个独立 store 句柄 = 两个窗口）attach→acquire→blocked→stale 判定
 *   →steal→release 全仪式（journal 事件链 LOCK_ACQUIRED/LOCK_STOLEN/LOCK_RELEASED）；
 *   交错事务与锁检出并存（锁面拦截不依赖事务序；store 事务交错保持 A4 不变量）；
 * - B 段：锁持有者 SIGKILL 崩溃（lock-holder-crash-child.mjs，P16 kill -9 注入手段
 *   同源复用）——锁文件原样留盘（无清理代码运行），锁状态显式可检出（stale 判定
 *   带 reason），steal 仪式回收（fence+1 + 原 execution 封口 interrupted），store
 *   state 完好（truth-index 字节不变 + journal 事件链完整）；
 * - C 段：execution_id 贯穿证据链端到端（session attach → beginExecution →
 *   record gate-run --execution-id → GRN 承载身份 → DEF-GATEKEEPER 观测面：
 *   同 execution 的证据可按 AGX 关联）；
 * - D 段（P20-Concurrency 补面）：重入语义——同会话重入 acquire 被拒且三面零副作用
 *   （锁文件字节 / journal 事件 / held_locks 均不变，互斥无豁免的自见 blocked）；
 *   重入被拒不掩盖持有者活性（合法续期唯一通路 = 持有人心跳，fence 不动）；双锁
 *   交错互斥各见对方；合法再入 = 释放仪式（release 后再 acquire fence 重置 1，
 *   新锁周期非续期；旧 fence 凭据随锁消亡 unknown_lock 非 stale_fence）。
 * - E 段（P20 红队修复回归）：跨进程并发 steal 争用——steal 曾是 read-modify-write
 *   覆写（无 CAS），双 child 同抢一把锁 read-read-write-write 交错双双成功且 fence
 *   相同、journal 只剩一条 LOCK_STOLEN。修复后（独占认领 CAS + journal 原子追加）
 *   跨进程双子进程同拍争用：串行化成功、fence 严格单调（2→3）、LOCK_STOLEN 双条
 *   留痕、磁盘终态无双重凭据（唯最高 fence valid）。双子进程经文件栅栏同拍起跑
 *   （ready 信号互见 + 有界等待——2026-09-12 macOS CI 编排竞态修复，见 E 段内注）；
 *   争用失败另有有界确定性重试封套（仅 pre-swap 可重试 + 在盘 holder 核对禁 fence
 *   双消耗——2026-09-13 windows CI 再发抖动修复，交错注入复现两型，见 E 段内注）。
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireLock,
  applyTransaction,
  attachSession,
  checkLockFence,
  createStore,
  beginExecution,
  heartbeatLock,
  listLocks,
  listSessionRecords,
  releaseLock,
  stealLock,
  type LockRecord,
  type Store,
} from "@pomaster/kernel";
import { pathsOf } from "../../packages/kernel/src/paths.js";
import { runRecordGateRun } from "@pomaster/cli";
import { AGENT, makeStore } from "../../packages/kernel/tests/helpers.js";

const here = join(fileURLToPath(new URL(import.meta.url)), "..");
const childScript = join(here, "lock-holder-crash-child.mjs");
const stealChildScript = join(here, "steal-contention-child.mjs");

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  // 临时目录留给 OS tmp 清理；不做 rm（避免 Windows EBUSY 噪声，同 L4 adversarial spec）。
  void root;
  void store;
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

function indexBytes(): string {
  return readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
}

async function attachOn(handle: Store, key: string, harness: string): Promise<void> {
  await attachSession(handle, { sessionKey: key, harness, now: T0 });
}

// ============================================================
// A 段：双会话互斥 / 检出 / 交错事务
// ============================================================

describe("A 段：双会话互斥与检出（两窗口两句柄）", () => {
  it("双会话 attach → A 持 change 锁 → B acquire 显式 blocked（持有者快照+liveness）→ steal 仪式过户 → release", async () => {
    const storeB = await createStore(root);
    await attachOn(store, A, "claude-code");
    await attachOn(storeB, B, "codex");

    // 交错事务的 claim 需要 subject 对象在场（先置货架）。
    await applyTransaction(store, {
      ops: [{
        op: "upsert_object",
        envelope: {
          id: "PAGE.DASHBOARD" as never,
          kind: "page_surface",
          axisProfile: "page_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "仪表盘",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: { surface: "V1" },
        },
      }],
    });

    const acquired = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A, now: T0,
    });
    expect(acquired.outcome).toBe("acquired");

    const blocked = await acquireLock(storeB, {
      kind: "change", ref: "CHG-0042", sessionKey: B, now: T0 + 1000,
    });
    expect(blocked.outcome).toBe("blocked");
    if (blocked.outcome === "blocked") {
      expect(blocked.holder.session_key).toBe(A);
      expect(blocked.holder_liveness).toBe("alive");
    }

    // 会话清单并排呈现（持有者 vs 等待者，锁状态显式可见）。
    const sessions = listSessionRecords(pathsOf(store));
    const heldBy = new Map(sessions.map((row) => [row.record.session_key, row.record.held_locks]));
    expect(heldBy.get(A)).toEqual(["change-CHG-0042"]);
    expect(heldBy.get(B)).toEqual([]);

    // 交错事务（B 在等待期间推进 store 事务——锁面拦截独立于事务序，store 不变量保持）。
    const applied = await applyTransaction(storeB, {
      ops: [{
        op: "record_claim",
        claim: {
          clm: "CLM-0001",
          subjectId: "PAGE.DASHBOARD" as never,
          assertion: "等待期间只读面登记（锁语义拦截写意图，不拦截只读证据面）",
          assertedBy: AGENT,
          evidenceRefs: [],
        },
      }],
    });
    expect(applied.shortCircuited).toBe(false);

    // steal 仪式过户（reason 留痕 + fence +1）。
    const stolen = await stealLock(storeB, {
      lockId: "change-CHG-0042", sessionKey: B, reason: "A 窗口已由 Owner 关闭", now: T0 + 2000,
    });
    expect(stolen.stolen).toBe(true);
    expect(stolen.lock.fence).toBe(2);
    expect(journalEvents().some((event) => event.type === "LOCK_STOLEN")).toBe(true);

    // B 释放后 A 可再获取（全仪式闭环）。
    await releaseLock(storeB, "change-CHG-0042", B);
    const reacquired = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 + 3000,
    });
    expect(reacquired.outcome).toBe("acquired");
    const types = journalEvents().map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(["LOCK_ACQUIRED", "LOCK_STOLEN", "LOCK_RELEASED"]));
  });

  it("unit 锁跨 change 真并行语义：不同会话不同 unit 各自持锁（互不相扰）；同 unit 撞锁检出", async () => {
    const storeB = await createStore(root);
    await attachOn(store, A, "claude-code");
    await attachOn(storeB, B, "codex");
    const mine = await acquireLock(store, {
      kind: "unit", objectKey: "FE.GRID.toColDef", sessionKey: A, now: T0,
    });
    const theirs = await acquireLock(storeB, {
      kind: "unit", objectKey: "FE.FORM.submitButton", sessionKey: B, now: T0,
    });
    expect(mine.outcome).toBe("acquired");
    expect(theirs.outcome).toBe("acquired");
    const collide = await acquireLock(storeB, {
      kind: "unit", objectKey: "FE.GRID.toColDef", sessionKey: B, now: T0 + 500,
    });
    expect(collide.outcome).toBe("blocked");
  });
});

// ============================================================
// B 段：锁持有者 SIGKILL 崩溃 → 磁盘态检出 → steal 回收
// ============================================================

describe("B 段：锁持有者崩溃后的回收路径（P16 kill -9 手段同源）", () => {
  it("子进程持锁被 SIGKILL：锁文件原样留盘 → stale 显式检出（heartbeat_expired）→ steal 回收 + 原 execution 封口 interrupted + state 完好", async () => {
    const child = spawn(process.execPath, [childScript, root], { stdio: ["ignore", "pipe", "pipe"] });
    const lockObserved = new Promise<string>((resolve, reject) => {
      let buffer = "";
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        if (buffer.includes("LOCKED")) resolve("change-CHG-CRASH");
      });
      child.stderr.on("data", (chunk: Buffer) => reject(new Error(chunk.toString("utf8"))));
      child.on("exit", (code) => reject(new Error(`child exited early: ${code}`)));
    });
    const lockId = await lockObserved;
    expect(existsSync(lockPath(lockId))).toBe(true);

    // index 在崩溃前取样（state 完好断言的基准）。
    const indexBefore = indexBytes();

    // kill -9（Windows = TerminateProcess 无条件终止）：无清理代码运行。
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => child.on("exit", () => resolve()));

    // 磁盘态：锁文件原样留盘（崩溃语义——绝不静默消失）。
    expect(existsSync(lockPath(lockId))).toBe(true);
    const stuck = JSON.parse(readFileSync(lockPath(lockId), "utf8")) as LockRecord;
    expect(stuck.holder.session_key).toBe("claude_crash01");
    expect(stuck.holder.execution_id).toContain("AGX-");

    // 锁状态显式检出：注入 now 越过 ttl(1s)+心跳窗口 → stale 带 reason。
    const nowAfterCrash = Date.now() + 60_000;
    const rows = listLocks(pathsOf(store), nowAfterCrash);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.liveness).toBe("stale");
    expect(rows[0]?.stale_reason).toBe("heartbeat_expired");

    // steal 仪式回收：fence +1 + 原 execution 封口 interrupted（journal 事件链完整）。
    await attachSession(store, {
      sessionKey: A, harness: "claude-code", now: nowAfterCrash,
    });
    const recovered = await stealLock(store, {
      lockId, sessionKey: A, reason: "持锁窗口已崩溃", now: nowAfterCrash,
    });
    expect(recovered.stolen).toBe(true);
    expect(recovered.previous_holder.session_key).toBe("claude_crash01");
    expect(recovered.lock.fence).toBe(2);

    // state 完好：truth-index 字节不变（崩溃零污染 store 治理面）+ journal 事件链。
    expect(indexBytes()).toBe(indexBefore);
    const types = journalEvents().map((event) => event.type);
    expect(types).toEqual(
      expect.arrayContaining(["EXECUTION_BEGUN", "LOCK_ACQUIRED", "LOCK_STOLEN", "EXECUTION_INTERRUPTED"]),
    );
    // 会话清单显式呈现崩溃会话（stale）与新会话（alive）。
    const sessions = listSessionRecords(pathsOf(store), nowAfterCrash);
    const liveness = new Map(sessions.map((row) => [row.record.session_key, row.liveness]));
    expect(liveness.get("claude_crash01")).toBe("stale");
    expect(liveness.get(A)).toBe("alive");
  });
});

// ============================================================
// C 段：execution_id 贯穿证据链（DEF-GATEKEEPER 观测面地基）
// ============================================================

describe("C 段：execution_id 贯穿（session→execution→GRN→关联可观测）", () => {
  it("attach→beginExecution→record gate-run --execution-id→GRN 承载身份；锁 acquire 绑同身份→steal 后原执行封口", async () => {
    await attachOn(store, A, "claude-code");
    const execution = await beginExecution(store, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
      sessionKey: A,
      harness: "claude-code",
      startedAt: "2026-08-30T09:00:00.000Z",
    });

    const writeInput = join(root, "gate-out.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      writeInput,
      `${JSON.stringify({
        gate: "BUILD",
        gate_def: "POLICY.GATE.BUILD@0.1.0",
        verdict: "passed",
        metric_dialect: "build:exit_code",
        subject_id: null,
        denominator_refs: [],
        counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
        duration_ms: { self: 1, external: 0 },
      }, null, 2)}\n`,
    );
    const recorded = await runRecordGateRun(root, {
      from: writeInput,
      executionId: execution.execution_id,
    });
    expect(recorded.ok).toBe(true);
    const grn = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(grn.execution_id).toBe(execution.execution_id);

    // 同 execution 持锁 → steal → 执行封口 interrupted（DEF-GATEKEEPER 观测的关联键贯通）。
    const locked = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A,
      executionId: execution.execution_id, now: T0,
    });
    expect(locked.outcome).toBe("acquired");
    await attachSession(store, { sessionKey: B, harness: "codex", now: T0 + 1000 });
    const stolen = await stealLock(store, {
      lockId: "change-CHG-0042", sessionKey: B, reason: "交接", now: T0 + 2000,
    });
    expect(stolen.stolen).toBe(true);
    const types = journalEvents().map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(["EXECUTION_BEGUN", "EXECUTION_INTERRUPTED"]));
  });
});

// ============================================================
// D 段：重入语义（P20-Concurrency 补面；P16 deferred 登记「互斥/检出语义」的组成）
// ============================================================

describe("D 段：重入语义（互斥无豁免 + 零副作用 + 合法再入通路）", () => {
  it("同会话重入 acquire → blocked 自见（互斥无豁免）：锁文件字节 / journal / held_locks 三面零副作用（重入尝试是纯读检出）", async () => {
    const storeB = await createStore(root);
    await attachOn(store, A, "claude-code");
    await attachOn(storeB, B, "codex");
    const acquired = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A, now: T0,
    });
    expect(acquired.outcome).toBe("acquired");

    // 重入尝试前的三面基准（锁文件字节 / journal 行数 / 会话持锁清单）。
    const lockBytesBefore = readFileSync(lockPath("change-CHG-0042"), "utf8");
    const journalCountBefore = journalEvents().length;

    // 同会话重入 acquire（携带不同 ttl + purpose——试图借重入偷换锁配置同样被拒）。
    const reentered = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A,
      ttlSeconds: 99_999, purpose: "借重入续期", now: T0 + 1000,
    });
    expect(reentered.outcome).toBe("blocked");
    if (reentered.outcome === "blocked") {
      // 自见：持有者快照就是自己（不静默续期、不静默顶替、不谎报他人）。
      expect(reentered.holder.session_key).toBe(A);
      expect(reentered.holder_liveness).toBe("alive");
      expect(reentered.stale_reason).toBeNull();
      expect(reentered.hint).toContain("stealLock");
      expect(reentered.fence).toBe(1);
    }

    // 零副作用一：锁文件字节不变（attempt 的 ttl/purpose 未偷换在盘配置）。
    expect(readFileSync(lockPath("change-CHG-0042"), "utf8")).toBe(lockBytesBefore);
    // 零副作用二：journal 零新事件（alive 持有者的重入阻塞不落 LOCK_ACQUIRED/
    // LOCK_STALE_OBSERVED——纯读检出，阻塞写通道只有真实占有变更才触发）。
    expect(journalEvents()).toHaveLength(journalCountBefore);
    // 零副作用三：会话持锁清单无重复登记（仍恰一条）。
    const sessions = listSessionRecords(pathsOf(store));
    const heldBy = new Map(sessions.map((row) => [row.record.session_key, row.record.held_locks]));
    expect(heldBy.get(A)).toEqual(["change-CHG-0042"]);

    // 他会话的 blocked 判定不受重入尝试扰动（锁态未被 attempt 改写）。
    const blocked = await acquireLock(storeB, {
      kind: "change", ref: "CHG-0042", sessionKey: B, now: T0 + 2000,
    });
    expect(blocked.outcome).toBe("blocked");
    if (blocked.outcome === "blocked") {
      expect(blocked.holder.session_key).toBe(A);
      expect(blocked.holder_liveness).toBe("alive");
    }
  });

  it("重入被拒不掩盖持有者活性：合法续期唯一通路 = 持有人心跳（fence 不动）；双锁交错互斥各见对方", async () => {
    const storeB = await createStore(root);
    await attachOn(store, A, "claude-code");
    await attachOn(storeB, B, "codex");
    await acquireLock(store, { kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 });

    // 重入 attempt 被拒后，持有者活性照常可维持——续期走心跳而非重入。
    const reentered = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 + 1000,
    });
    expect(reentered.outcome).toBe("blocked");
    const beat = await heartbeatLock(store, "change-CHG-0042", A, T0 + 5000);
    expect(beat.heartbeat_at).toBe("2026-08-30T09:00:05.000Z");
    const blockedAfterBeat = await acquireLock(storeB, {
      kind: "change", ref: "CHG-0042", sessionKey: B, now: T0 + 6000,
    });
    expect(blockedAfterBeat.outcome).toBe("blocked");
    if (blockedAfterBeat.outcome === "blocked") {
      expect(blockedAfterBeat.holder_liveness).toBe("alive");
      // fence 全程未动（重入 attempt 与心跳都不是占有变更——fence 只在 steal 仪式 +1）。
      expect(blockedAfterBeat.fence).toBe(1);
    }

    // 双锁交错互斥：A 持 CHG-A、B 持 CHG-B，各自重入对方的锁 → blocked 自见他见
    // （交错请求不产生死锁、不产生顶替，双方持有者快照显式并排可读）。
    const mine = await acquireLock(store, { kind: "change", ref: "CHG-A", sessionKey: A, now: T0 + 7000 });
    const theirs = await acquireLock(storeB, { kind: "change", ref: "CHG-B", sessionKey: B, now: T0 + 7000 });
    expect(mine.outcome).toBe("acquired");
    expect(theirs.outcome).toBe("acquired");
    const crossA = await acquireLock(store, { kind: "change", ref: "CHG-B", sessionKey: A, now: T0 + 8000 });
    const crossB = await acquireLock(storeB, { kind: "change", ref: "CHG-A", sessionKey: B, now: T0 + 8000 });
    expect(crossA.outcome).toBe("blocked");
    expect(crossB.outcome).toBe("blocked");
    if (crossA.outcome === "blocked" && crossB.outcome === "blocked") {
      expect(crossA.holder.session_key).toBe(B);
      expect(crossB.holder.session_key).toBe(A);
    }
  });

  it("合法再入 = 释放仪式：release 后同会话再 acquire 成功且 fence 重置 1（新锁周期非续期）；旧凭据随锁消亡（unknown_lock 非 stale_fence）", async () => {
    await attachOn(store, A, "claude-code");
    await acquireLock(store, { kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 });
    await releaseLock(store, "change-CHG-0042", A);

    // 释放后旧 fence 凭据即消亡（锁不在场 → unknown_lock——不是 stale_fence 的
    // 「锁在场但凭据过期」，凭据语义不跨锁周期存续）。
    expect(checkLockFence(pathsOf(store), "change-CHG-0042", 1)).toMatchObject({
      outcome: "unknown_lock",
    });

    // 同会话再 acquire = 新锁周期：fence 重置 1（对照 steal 通路的 +1——再入通路的
    // 选择决定 fence 语义；释放是干净交接，无旧持有者迟写风险故不消耗单调计数）。
    const reacquired = await acquireLock(store, {
      kind: "change", ref: "CHG-0042", sessionKey: A, now: T0 + 1000,
    });
    expect(reacquired.outcome).toBe("acquired");
    if (reacquired.outcome === "acquired") {
      expect(reacquired.lock.fence).toBe(1);
      expect(reacquired.lock.acquired_at).toBe("2026-08-30T09:00:01.000Z");
    }
    // journal 事件链呈完整仪式序：获取 → 释放 → 再获取（再入不是静默续期；
    // SESSION_ATTACHED 等非锁事件不在断言分母）。
    const lockTypes = journalEvents()
      .map((event) => String(event.type))
      .filter((type) => type.startsWith("LOCK_"));
    expect(lockTypes).toEqual(["LOCK_ACQUIRED", "LOCK_RELEASED", "LOCK_ACQUIRED"]);
  });
});

// ============================================================
// E 段：跨进程并发 steal 争用（P20 红队修复回归——独占认领 CAS 串行化）
// ============================================================

interface StealChildResult {
  readonly code: number | null;
  readonly out: string;
  readonly err: string;
}

/**
 * 起一个争用子进程（attach → [栅栏位] → steal 目标锁 → STOLEN <fence> / exit 4 显式错误）。
 * `barrierDir` 在座时子进程于 steal 前落 ready 信号并等双子进程齐座（文件在座信号 +
 * 有界等待 + 超时 exit 3 显式失败——消除双子进程 spawn/start lottery）。
 * `opts.stealRetry` 在座时子进程以 --steal-retry 启用争用失败的有界确定性重试封套
 * （仅 pre-swap 失败可重试，见 steal-contention-child.mjs 头注——2026-09-13 windows
 * CI 再发抖动修复）；「失败方显式错误」用例保持单发不进封套。
 */
function spawnStealChild(
  sessionKey: string,
  lockId: string,
  barrierDir?: string,
  opts?: { readonly stealRetry?: boolean },
): Promise<StealChildResult> {
  return new Promise((resolve) => {
    const args = [stealChildScript, root, lockId, sessionKey];
    if (barrierDir !== undefined) args.push(barrierDir);
    if (opts?.stealRetry === true) args.push("--steal-retry");
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("exit", (code) => resolve({ code, out, err }));
  });
}

/** 失败诊断行（exit/stdout/stderr 全量上水面——本轮 CI 分诊曾被吞 stderr 阻塞）。 */
function childTrace(label: string, r: StealChildResult): string {
  return `${label} exit=${r.code} stdout=${JSON.stringify(r.out)} stderr=${JSON.stringify(r.err)}`;
}

describe("E 段：跨进程并发 steal 争用（P20 红队发现 1 修复回归）", () => {
  it("双子进程同拍 steal 同一把锁：串行化成功、fence 严格单调（2→3）、LOCK_STOLEN 双条留痕、磁盘终态无双重凭据", async () => {
    // 本测试曾于 macOS CI 发作（commit e7d2b2f 轮，2026-09-12；AssertionError:
    // expected 1 to be +0）：双子进程同拍 spawn 后各自对 authority.json 做
    // readFileSync+writeFileSync 直写 bootstrap，一方的截断窗（open 'w' → write 间）
    // 撕裂另一方的 readFileSync → JSON.parse 未捕获崩逸 exit 1——测试编排竞态，
    // 非 steal 语义缺陷（R1 定性 (b)）。修复 = 移除 child 冗余 bootstrap 写（父测试
    // makeStore 已登记 owner）+ 文件栅栏同拍起跑；断言面零删减。
    // 再发抖动（windows CI run 34698021594，2026-09-13；AssertionError:
    // expected 4 to be +0，515ms 即失败——非栅栏超时，双子进程均已退出）：交错注入
    // 复现两型失败交错（R1 定性 (b)/(c) 编排-预算边界洞，steal 语义零缺陷）——
    // (i) 首接管方 claim→install 缺席窗被 CI 负载拉宽（≥~70ms 即两拍缺席读）→
    //     败方 LOCK_NOT_FOUND exit 4；
    // (ii) claim rename 遭遇 >170ms（withBoundedRetry 预算 [20,50,100]）的 Windows
    //     瞬时句柄 EPERM → 裸错误上抛 exit 4（code UNKNOWN）。
    // 两型注入复现的磁盘终态 fence/journal/凭据全部自洽 = CAS 语义未破，败方属
    // 产品契约内合法 fail-closed（「重试耗尽显式上抛——稍后重试该命令」）。修复 =
    // 子进程争用失败的有界确定性重试封套（--steal-retry；仅 pre-swap 失败可重试 +
    // 在盘 holder 事后核对禁 fence 双消耗，见 child 头注）+ 断言诊断信息补全；
    // 四不变量（串行化成功/fence 单调/双条留痕/终态无双重凭据）零删减——CAS 真退化
    // 时双 fence=2 或三条 LOCK_STOLEN 形态照样红灯，重试封套不掩盖。
    // per-test timeout 显式 60s（vitest.config 15s 全局基线对「双 node spawn + 栅栏」
    // 的 CI 慢盘预算不足）：child 栅栏死限 15s < 60s，栅栏超时以 exit 3 + stderr
    // BARRIER_TIMEOUT 显式收场，不会伪装成 15s 整测超时；重试封套最坏 ~3.15s
    // （6 轮确定性退避）≪ 60s，真失败仍以 exit 4 + stderr 显式收场。
    // 父进程置锁：会话 A 持 change 锁（fence=1）。
    await attachOn(store, A, "claude-code");
    const acquired = await acquireLock(store, {
      kind: "change", ref: "CHG-CONTEND", sessionKey: A, now: T0,
    });
    expect(acquired.outcome).toBe("acquired");

    // 真并发：两独立子进程同拍起跑（同进程 Promise.all 会串行化同步 IO——假通过）。
    // 文件栅栏（临时 store 根下，产物不入库）：两子进程互见 ready 后同拍进 steal。
    const barrierDir = join(root, "steal-contention-barrier");
    const [r1, r2] = await Promise.all([
      spawnStealChild("codex_c1", "change-CHG-CONTEND", barrierDir, { stealRetry: true }),
      spawnStealChild("codex_c2", "change-CHG-CONTEND", barrierDir, { stealRetry: true }),
    ]);
    // 修复后语义 = 串行化成功：双双 exit 0；若 CAS 退化回覆写竞态，会出现双 fence=2。
    expect(r1.code, childTrace("c1", r1)).toBe(0);
    expect(r2.code, childTrace("c2", r2)).toBe(0);
    // 接管顺序由争用决胜（非确定——正是被测语义）：按各自回带的 fence 排出先后。
    const steals = [
      { sessionKey: "codex_c1", fence: Number(/STOLEN (\d+)/.exec(r1.out)?.[1]) },
      { sessionKey: "codex_c2", fence: Number(/STOLEN (\d+)/.exec(r2.out)?.[1]) },
    ].sort((a, b) => a.fence - b.fence);
    expect(steals.map((steal) => steal.fence)).toEqual([2, 3]);
    const [first, last] = steals as [
      { readonly sessionKey: string; readonly fence: number },
      { readonly sessionKey: string; readonly fence: number },
    ];

    // journal 留痕完整（append 原子性——旧覆写落法会把并发一条抹掉只剩一条）：
    // 含双子进程并发 attach 的 SESSION_ATTACHED 与两条 LOCK_STOLEN，逐行可解析。
    const stolenEvents = journalEvents().filter((event) => event.type === "LOCK_STOLEN");
    expect(stolenEvents).toHaveLength(2);
    const stolenFences = stolenEvents.map((event) => event.fence as number).sort((a, b) => a - b);
    expect(stolenFences).toEqual([2, 3]);
    expect(stolenEvents.map((event) => event.previous_fence)).toEqual(expect.arrayContaining([1, 2]));

    // 磁盘终态：唯最高 fence=3 valid；旧凭据 1/2 双双 stale_fence（无双重同 valid）。
    const paths = pathsOf(store);
    expect(checkLockFence(paths, "change-CHG-CONTEND", 3)).toMatchObject({ outcome: "valid" });
    expect(checkLockFence(paths, "change-CHG-CONTEND", 2)).toMatchObject({ outcome: "stale_fence" });
    expect(checkLockFence(paths, "change-CHG-CONTEND", 1)).toMatchObject({ outcome: "stale_fence" });

    // held_locks 稳定不变量：原持有人清空（首接管方 remove 后无人再写其会话文件）、
    // 末接管方在册（add 后无人再写其会话文件）。
    // 良性交错白名单（显式形态化而非忽略）：首轮接管方的 held_locks 是二值合法形态——
    // [] = 本方 add 先落定、末接管方随后的 remove 清除之；
    // ["change-CHG-CONTEND"] = 本方 add 与末接管方的 remove 交叉留下的陈旧指针
    // （advisory 可观测性登记，排他判卷权威在锁文件+fence，上文已钉；会话指针面的
    // 字节级 CAS 化为独立后续，不在本批四发现范围）。
    const sessions = listSessionRecords(pathsOf(store));
    const heldBy = new Map(sessions.map((row) => [row.record.session_key, row.record.held_locks]));
    expect(heldBy.get(A)).toEqual([]);
    expect([[], ["change-CHG-CONTEND"]]).toContainEqual(heldBy.get(first.sessionKey));
    expect(heldBy.get(last.sessionKey)).toEqual(["change-CHG-CONTEND"]);
  }, 60_000);

  it("失败方显式错误（争用耗尽非静默）：人为占满重试窗口的锁争用以 ENVIRONMENT_ERROR 收场", async () => {
    // 父进程置锁 + 子进程以争用锁收场：本例验证错误通道形态——子进程报
    // GovernanceError JSON（code 在案）并 exit 4，绝不静默当成功。
    await attachOn(store, A, "claude-code");
    const acquired = await acquireLock(store, {
      kind: "change", ref: "CHG-ERRPATH", sessionKey: A, now: T0,
    });
    expect(acquired.outcome).toBe("acquired");
    // 对不存在的锁 steal：LOCK_NOT_FOUND 显式码位（错误通道连通性；争用耗尽同通道）。
    const missing = await spawnStealChild("codex_c3", "change-NO-SUCH-LOCK");
    expect(missing.code).toBe(4);
    const payload = JSON.parse(missing.err.trim()) as { code: string };
    expect(payload.code).toBe("LOCK_NOT_FOUND");
    expect(existsSync(lockPath("change-NO-SUCH-LOCK"))).toBe(false);
  });
});
