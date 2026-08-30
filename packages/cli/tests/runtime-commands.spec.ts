/**
 * runtime-commands.spec.ts —— D 线地基 CLI 命令面：session / lock / execution
 * 三命令组（P20-Commands；A10「CLI 零 session 命令」的兑现账）。
 *
 * 判据锚：
 * - 判卷权威在 kernel：CLI 只编排呈现，kernel 原码透传（SESSION_NOT_FOUND /
 *   LOCK_NOT_HELD / VOCAB_INVALID_VALUE / EXECUTION_* 等）；
 * - session attach：首注册 CREATED / 既有 REFRESHED / 顶替 REPLACED + resumed_task
 *   回显（D 线 §3.1 attach 即 resume 探测）；顶替显式化（P20 红队发现 3）——活会话
 *   换 harness 缺 --force 拒绝（SESSION_REPLACE_REQUIRED），显式 force 落 journal
 *   SESSION_REPLACED；词形/参数面 fail-closed；
 * - lock acquire：ACQUIRED exit 0；blocked → exit 1 LOCK_BLOCKED 且回带持有者快照
 *   /liveness/stale_reason（非静默成功——判卷语义对齐 permit check 先例）；acquire
 *   永不自动抢占（D2），stale 持有者走 lock steal 显式接管（fence+1 + 原执行封口
 *   interrupted——D 线 §3.3.1 仪式）；
 * - execution begin/end/list：AGX-n 缺省分配 + 词表三轴闭包 + session/harness 成对
 *   纪律 + 重复封口显式拒绝；
 * - --execution-id/--pid/--ttl/--meta argv 形状预检（IO 前 fail-closed）；
 * - 墙钟注入点不进 CLI 面（盖章语义——本套件对 liveness/stale 的确定性判定走
 *   kernel API，CLI 面只验信封结构与码位）。
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachSession,
  beginExecution,
  listSessionRecords,
  pathsOf,
  readExecutionRecordById,
  sha256OfCanonical,
  type Store,
} from "@pomaster/kernel";
import {
  runExecutionBegin,
  runExecutionEnd,
  runExecutionList,
  runLockAcquire,
  runLockHeartbeat,
  runLockList,
  runLockRelease,
  runLockSteal,
  runSessionAttach,
  runSessionList,
  runSessionRefresh,
} from "@pomaster/cli";
import { makeStore } from "../../../packages/kernel/tests/helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});


// ============================================================
// session 命令组
// ============================================================

describe("session attach / refresh / list", () => {
  it("attach 首次 → CREATED + created=true + journal SESSION_ATTACHED（D 线 §3.1）", async () => {
    const outcome = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.created).toBe(true);
    expect(outcome.result.session_key).toBe("claude_9f3ab2c1");
    expect(outcome.result.ttl_seconds).toBe(900);
    expect(outcome.result.resumed_task).toBeNull();
    expect(outcome.human[0]).toContain("CREATED");
    const journal = await import("node:fs");
    expect(
      journal.readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8"),
    ).toContain("SESSION_ATTACHED");
  });

  it("attach 既有 → REFRESHED created=false；--task 绑定后再次 attach 回显 resumed_task（resume 探测）", async () => {
    const first = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      task: "TASK.T0087",
    });
    expect(first.result.created).toBe(true);
    const second = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
    });
    expect(second.ok).toBe(true);
    expect(second.result.created).toBe(false);
    expect(second.result.resumed_task).toBe("TASK.T0087");
    expect(second.human.some((line) => line.includes("TASK.T0087"))).toBe(true);
  });

  it("顶替显式化（P20 红队发现 3）：活会话换 harness 缺 --force → SESSION_REPLACE_REQUIRED；--force → REPLACED + SESSION_REPLACED 留痕", async () => {
    const first = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      task: "TASK.T0087",
    });
    expect(first.ok).toBe(true);
    // 缺 force：拒绝（kernel 码位透传）。
    const rejected = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "codex",
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.errors[0]?.code).toBe("SESSION_REPLACE_REQUIRED");
    expect(rejected.errors[0]?.hint).toContain("--force");
    // 显式 --force：REPLACED + journal 留痕 + resumed_task 承接（顶替不洗指针）。
    const forced = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "codex",
      force: true,
    });
    expect(forced.ok).toBe(true);
    expect(forced.result.created).toBe(false);
    expect(forced.result.replaced).toBe(true);
    expect(forced.result.resumed_task).toBe("TASK.T0087");
    expect(forced.human[0]).toContain("REPLACED");
    const fs = await import("node:fs");
    const journal = fs.readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    expect(journal).toContain("SESSION_REPLACED");
  });

  it("未初始化目录 → NOT_INITIALIZED fail-closed（缺席显式）", async () => {
    const outcome = await runSessionAttach(root + "-absent", {
      sessionKey: "claude_x",
      harness: "claude-code",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });

  it("session_key 词形非法 → kernel SCHEMA_INVALID 原码透传", async () => {
    const outcome = await runSessionAttach(root, {
      sessionKey: "../escape",
      harness: "claude-code",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("session_key 词形非法");
  });

  it("argv 形状预检：--meta 缺等号 / --ttl 非正整数 → SCHEMA_INVALID（IO 前 fail-closed）", async () => {
    const badMeta = await runSessionAttach(root, {
      sessionKey: "claude_x",
      harness: "claude-code",
      meta: ["no-equals-sign"],
    });
    expect(badMeta.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(badMeta.errors[0]?.message).toContain("--meta");
    const badTtl = await runSessionAttach(root, {
      sessionKey: "claude_x",
      harness: "claude-code",
      ttl: "0",
    });
    expect(badTtl.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(badTtl.errors[0]?.message).toContain("--ttl");
  });

  it("refresh 未注册会话 → SESSION_NOT_FOUND（禁静默重建）；已注册 → ok 且零事件", async () => {
    const missing = await runSessionRefresh(root, "claude_ghost");
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("SESSION_NOT_FOUND");
    await runSessionAttach(root, { sessionKey: "claude_a", harness: "claude-code" });
    const fs = await import("node:fs");
    // attach 首注册已落 SESSION_ATTACHED；以 attach 后为基线验证「刷新 = 心跳零事件」。
    const journalBaseline = fs.readFileSync(
      join(root, ".pomaster", "state", "journal.jsonl"),
      "utf8",
    );
    const refreshed = await runSessionRefresh(root, "claude_a");
    expect(refreshed.ok).toBe(true);
    expect(refreshed.result.session_key).toBe("claude_a");
    expect(
      fs.readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8"),
    ).toBe(journalBaseline);
  });

  it("list：空 = 显式空文案；attach 后逐行呈现 liveness/held_locks/task", async () => {
    const empty = await runSessionList(root);
    expect(empty.ok).toBe(true);
    expect(empty.result.sessions).toEqual([]);
    expect(empty.human[0]).toContain("0 sessions");
    // CLI 面不暴露墙钟注入点（盖章语义）——attach 走当前墙钟，清单即刻读为 alive。
    await attachSession(store, {
      sessionKey: "claude_a",
      harness: "claude-code",
      currentTask: "TASK.T0087",
    });
    const listed = await runSessionList(root);
    expect(listed.result.sessions).toHaveLength(1);
    expect(listed.result.sessions[0]).toMatchObject({
      session_key: "claude_a",
      harness: "claude-code",
      liveness: "alive",
      current_task: "TASK.T0087",
    });
  });
});

// ============================================================
// lock 命令组
// ============================================================

describe("lock acquire / heartbeat / release / steal / list", () => {
  it("acquire 全链：attach → ACQUIRED（fence=1 + 信封回读）；未 attach → SESSION_NOT_FOUND", async () => {
    const noSession = await runLockAcquire(root, {
      kind: "change",
      ref: "CHG-0042",
      sessionKey: "claude_ghost",
    });
    expect(noSession.ok).toBe(false);
    expect(noSession.errors[0]?.code).toBe("SESSION_NOT_FOUND");
    await runSessionAttach(root, { sessionKey: "claude_a", harness: "claude-code" });
    const acquired = await runLockAcquire(root, {
      kind: "change",
      ref: "CHG-0042",
      sessionKey: "claude_a",
    });
    expect(acquired.ok).toBe(true);
    expect(acquired.result).toMatchObject({
      outcome: "acquired",
      lock_id: "change-CHG-0042",
      fence: 1,
      holder_session_key: "claude_a",
    });
  });

  it("acquire blocked → exit 1 LOCK_BLOCKED + 持有者快照/liveness 回带（非静默成功）", async () => {
    await runSessionAttach(root, { sessionKey: "claude_a", harness: "claude-code" });
    await runSessionAttach(root, { sessionKey: "codex_b", harness: "codex" });
    const first = await runLockAcquire(root, {
      kind: "change",
      ref: "CHG-0042",
      sessionKey: "claude_a",
    });
    expect(first.ok).toBe(true);
    const second = await runLockAcquire(root, {
      kind: "change",
      ref: "CHG-0042",
      sessionKey: "codex_b",
    });
    expect(second.ok).toBe(false);
    expect(second.errors[0]?.code).toBe("LOCK_BLOCKED");
    expect(second.result.outcome).toBe("blocked");
    expect(second.result).toMatchObject({
      lock_id: "change-CHG-0042",
      holder_session_key: "claude_a",
      holder_liveness: "alive",
      fence: 1,
    });
    expect(second.human.some((line) => line.includes("BLOCKED"))).toBe(true);
  });

  it("acquire 参数面：词表外 kind → VOCAB_INVALID_VALUE；--execution-id 自造 → EXECUTION_NOT_FOUND；词形坏/--pid 非法 → SCHEMA_INVALID", async () => {
    await runSessionAttach(root, { sessionKey: "claude_a", harness: "claude-code" });
    const badKind = await runLockAcquire(root, {
      kind: "global",
      ref: "X",
      sessionKey: "claude_a",
    });
    expect(badKind.errors[0]?.code).toBe("VOCAB_INVALID_VALUE");
    const ghostExecution = await runLockAcquire(root, {
      kind: "change",
      ref: "CHG-0001",
      sessionKey: "claude_a",
      executionId: "AGX-2026-09999",
    });
    expect(ghostExecution.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    const badWordForm = await runLockAcquire(root, {
      kind: "change",
      ref: "CHG-0001",
      sessionKey: "claude_a",
      executionId: "exec-1",
    });
    expect(badWordForm.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(badWordForm.errors[0]?.message).toContain("--execution-id 词形非法");
    const badPid = await runLockAcquire(root, {
      kind: "change",
      ref: "CHG-0001",
      sessionKey: "claude_a",
      pid: "-3",
    });
    expect(badPid.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(badPid.errors[0]?.message).toContain("--pid");
  });

  it("heartbeat：非持有人 LOCK_NOT_HELD；持有人 ok 且零事件（心跳语义）", async () => {
    await runSessionAttach(root, { sessionKey: "claude_a", harness: "claude-code" });
    await runSessionAttach(root, { sessionKey: "codex_b", harness: "codex" });
    await runLockAcquire(root, { kind: "change", ref: "CHG-0001", sessionKey: "claude_a" });
    const journal = await import("node:fs");
    const before = journal.readFileSync(
      join(root, ".pomaster", "state", "journal.jsonl"),
      "utf8",
    );
    const notHolder = await runLockHeartbeat(root, "change-CHG-0001", "codex_b");
    expect(notHolder.ok).toBe(false);
    expect(notHolder.errors[0]?.code).toBe("LOCK_NOT_HELD");
    const holder = await runLockHeartbeat(root, "change-CHG-0001", "claude_a");
    expect(holder.ok).toBe(true);
    expect(
      journal.readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8"),
    ).toBe(before);
  });

  it("release：持有人释放 → journal LOCK_RELEASED + 会话 held_locks 同步清空", async () => {
    await runSessionAttach(root, { sessionKey: "claude_a", harness: "claude-code" });
    await runLockAcquire(root, { kind: "unit", objectKey: "FE.GRID.toColDef", sessionKey: "claude_a" });
    const sessionBefore = listSessionRecords(pathsOf(store)).find(
      (row) => row.record.session_key === "claude_a",
    );
    expect(sessionBefore?.record.held_locks).toEqual(["unit-" + unitHashSuffix()]);
    const released = await runLockRelease(
      root,
      sessionBefore?.record.held_locks[0] ?? "",
      "claude_a",
    );
    expect(released.ok).toBe(true);
    const sessionAfter = listSessionRecords(pathsOf(store)).find(
      (row) => row.record.session_key === "claude_a",
    );
    expect(sessionAfter?.record.held_locks).toEqual([]);
    const journal = await import("node:fs");
    expect(
      journal.readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8"),
    ).toContain("LOCK_RELEASED");
  });

  it("steal：空 reason → SCHEMA_INVALID；仪式成功 → fence+1 + 原持有人 execution 封口 interrupted", async () => {
    await runSessionAttach(root, { sessionKey: "claude_a", harness: "claude-code" });
    await runSessionAttach(root, { sessionKey: "codex_b", harness: "codex" });
    const execution = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "interactive",
      sessionKey: "claude_a",
      harness: "claude-code",
      startedAt: "2026-08-30T09:00:00.000Z",
    });
    await runLockAcquire(root, {
      kind: "change",
      ref: "CHG-0007",
      sessionKey: "claude_a",
      executionId: execution.execution_id,
    });
    const blankReason = await runLockSteal(root, {
      lockId: "change-CHG-0007",
      sessionKey: "codex_b",
      reason: "   ",
    });
    expect(blankReason.ok).toBe(false);
    expect(blankReason.errors[0]?.code).toBe("SCHEMA_INVALID");
    const stolen = await runLockSteal(root, {
      lockId: "change-CHG-0007",
      sessionKey: "codex_b",
      reason: "原窗口已由 Owner 关闭",
    });
    expect(stolen.ok).toBe(true);
    expect(stolen.result).toMatchObject({
      lock_id: "change-CHG-0007",
      fence: 2,
      previous_holder_session_key: "claude_a",
      previous_execution_interrupted: execution.execution_id,
    });
    const closed = readExecutionRecordById(pathsOf(store), execution.execution_id);
    expect(closed?.ended_at).not.toBeNull();
    const journal = await import("node:fs");
    const journalText = journal.readFileSync(
      join(root, ".pomaster", "state", "journal.jsonl"),
      "utf8",
    );
    expect(journalText).toContain("LOCK_STOLEN");
    expect(journalText).toContain("EXECUTION_INTERRUPTED");
  });

  it("list：空 = 显式空；有锁呈现 liveness 与 stale_reason（记录 + 判定并排）", async () => {
    const empty = await runLockList(root);
    expect(empty.result.locks).toEqual([]);
    expect(empty.human[0]).toContain("0 locks");
    // ttl=1s + 立即清单（当前墙钟盖章）→ held；stale 判定的确定性变异走 kernel 面。
    await attachSession(store, { sessionKey: "claude_a", harness: "claude-code" });
    await runLockAcquire(root, {
      kind: "task",
      ref: "TASK.T0087",
      sessionKey: "claude_a",
      ttl: "1",
    });
    const listed = await runLockList(root);
    expect(listed.result.locks).toHaveLength(1);
    expect(listed.result.locks[0]).toMatchObject({
      lock_id: "task-TASK.T0087",
      lock_kind: "task",
      holder_session_key: "claude_a",
      liveness: "held",
      stale_reason: null,
    });
  });
});

// ============================================================
// execution 命令组
// ============================================================

describe("execution begin / end / list", () => {
  it("begin 缺省分配 = AGX-2026-00001（5 位零填充）+ 信封逐键回读", async () => {
    const outcome = await runExecutionBegin(root, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "interactive",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.execution_id).toMatch(/^AGX-[0-9]{4}-00001$/);
    expect(outcome.result).toMatchObject({
      role: "implementer",
      runtime: "claude-code",
      identity_kind: "interactive",
      session_key: null,
    });
    expect(outcome.human.some((line) => line.includes("--execution-id"))).toBe(true);
  });

  it("begin 词表三轴闭包：词表外 role → VOCAB_INVALID_VALUE fail-closed", async () => {
    const outcome = await runExecutionBegin(root, {
      role: "supervisor",
      runtime: "claude-code",
      identityKind: "interactive",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("VOCAB_INVALID_VALUE");
    expect(outcome.errors[0]?.message).toContain("role");
  });

  it("begin 成对纪律：--session-key 未 attach → SESSION_NOT_FOUND；session-key 无 harness → SCHEMA_INVALID", async () => {
    const ghost = await runExecutionBegin(root, {
      role: "qa",
      runtime: "codex",
      identityKind: "subagent",
      sessionKey: "codex_ghost",
      harness: "codex",
    });
    expect(ghost.errors[0]?.code).toBe("SESSION_NOT_FOUND");
    await attachSession(store, { sessionKey: "codex_b", harness: "codex" });
    const orphan = await runExecutionBegin(root, {
      role: "qa",
      runtime: "codex",
      identityKind: "subagent",
      sessionKey: "codex_b",
    });
    expect(orphan.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(orphan.errors[0]?.message).toContain("成对");
  });

  it("end：封口置 ended_at + journal EXECUTION_ENDED；重复封口 EXECUTION_ALREADY_ENDED；词形坏 → SCHEMA_INVALID", async () => {
    const execution = await runExecutionBegin(root, {
      role: "research",
      runtime: "claude-code",
      identityKind: "subagent",
    });
    const ended = await runExecutionEnd(root, execution.result.execution_id);
    expect(ended.ok).toBe(true);
    expect(ended.result.ended_at).not.toBe("");
    const again = await runExecutionEnd(root, execution.result.execution_id);
    expect(again.ok).toBe(false);
    expect(again.errors[0]?.code).toBe("EXECUTION_ALREADY_ENDED");
    const badForm = await runExecutionEnd(root, "EX-1");
    expect(badForm.errors[0]?.code).toBe("SCHEMA_INVALID");
    const journal = await import("node:fs");
    expect(
      journal.readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8"),
    ).toContain("EXECUTION_ENDED");
  });

  it("list：空 = 显式空；begin/end 后呈现 active → ended 两态", async () => {
    const empty = await runExecutionList(root);
    expect(empty.result.executions).toEqual([]);
    expect(empty.human[0]).toContain("0 executions");
    const first = await runExecutionBegin(root, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
    });
    const second = await runExecutionBegin(root, {
      role: "research",
      runtime: "codex",
      identityKind: "subagent",
    });
    await runExecutionEnd(root, second.result.execution_id);
    const listed = await runExecutionList(root);
    expect(listed.result.executions).toHaveLength(2);
    expect(listed.result.executions[0]).toMatchObject({
      execution_id: first.result.execution_id,
      status: "active",
      ended_at: null,
    });
    expect(listed.result.executions[1]).toMatchObject({
      status: "ended",
    });
  });
});

/** unit 锁文件名 hash 段（与 kernel deriveLockId 同源 6 hex——测试内本地复算）。 */
function unitHashSuffix(): string {
  const digest = sha256OfCanonical({ unit: "FE.GRID.toColDef" });
  const hex = digest.startsWith("sha256:") ? digest.slice("sha256:".length) : digest;
  return hex.slice(0, 6);
}
