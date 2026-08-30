/**
 * session.spec.ts —— 会话身份原语（P20 D 线地基①；D 线 §1.2/§1.3/§3.1）。
 *
 * 判据锚：
 * - 注册/刷新语义（D 线 §3.1「attach = 注册/刷新 liveness；解析出本 session 上次绑定
 *   任务」）：首注册 created=true + journal SESSION_ATTACHED；刷新 created=false 且
 *   resumed_task/held_locks 回带、平台元数据 merge 保留；刷新零 journal（心跳语义）；
 * - 墙钟纪律（A4 分层）：last_seen_at 只住 runtime 侧车（GOLDEN-L1-WALLCLOCK 判词
 *   「人类时间只住 evidence/runtime 侧车」）；确定性由 now 注入点保障——同参数重放
 *   字节稳定；
 * - stale 判定（纯函数）：now - last_seen_at > ttl_seconds → stale（D 线 §3.1「超过
 *   TTL 即视作 stale」）；ttl_seconds 缺省 900（例文逐字）；
 * - session_key 词形：D 线例文 claude_9f3ab2c1 + 子代理后缀 .sa1（§1.2）；路径分隔符/
 *   首段点开头 fail-closed；
 * - 刷新未注册会话 → SESSION_NOT_FOUND（禁静默重建——重建会洗掉 held_locks/
 *   current_task 指针）；
 * - 顶替显式化（P20 红队发现 3）：attach 既有活会话且 harness 不同 = 会话载体顶替，
 *   缺省拒绝（SESSION_REPLACE_REQUIRED——零凭据顶替 = 无声接管，禁）；stale 前任
 *   （可证已亡）或显式 force 放行，放行即 journal SESSION_REPLACED 留痕；
 * - 会话清单 listSessionRecords：记录 + liveness 判定并排（显式可见非隐式）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acquireLock,
  attachSession,
  listSessionRecords,
  readSessionRecord,
  refreshSession,
  SESSION_DEFAULT_TTL_SECONDS,
  SESSION_KEY_PATTERN,
  SESSIONS_RELATIVE,
  judgeSessionLiveness,
  type SessionRecord,
  type Store,
} from "@pomaster/kernel";
import { pathsOf } from "../src/paths.js";
import { makeStore } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

const T0 = Date.parse("2026-08-30T09:00:00.000Z");

function sessionPath(key: string): string {
  return join(root, ".pomaster", "runtime", "sessions", `${key}.json`);
}

function journalEventTypes(): string[] {
  return journalEvents().map((event) => String(event.type));
}

function journalEvents(): Array<Record<string, unknown>> {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("attachSession（注册/刷新）", () => {
  it("首注册 created=true：D 线 §3.1 例文骨架九键在场 + ttl_seconds=900 + 空held_locks", async () => {
    const outcome = await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      platformMeta: { session_id: "9f3ab2c1-...", cwd: "D:/work" },
      currentTask: "TASK.T0117",
      now: T0,
    });
    expect(outcome.created).toBe(true);
    expect(outcome.resumed_task).toBe("TASK.T0117");
    expect(outcome.last_seen_at).toBe("2026-08-30T09:00:00.000Z");
    expect(outcome.ttl_seconds).toBe(SESSION_DEFAULT_TTL_SECONDS);
    expect(SESSION_DEFAULT_TTL_SECONDS).toBe(900);
    const record = readSessionRecord(pathsOf(store), "claude_9f3ab2c1") as SessionRecord;
    expect(Object.keys(record).sort()).toEqual(
      [
        "current_task", "held_locks", "harness", "last_seen_at", "local_memory_candidates",
        "open_questions_refs", "platform_meta", "session_key", "ttl_seconds",
      ].sort(),
    );
    expect(record.held_locks).toEqual([]);
    expect(record.platform_meta).toEqual({ session_id: "9f3ab2c1-...", cwd: "D:/work" });
    expect(existsSync(sessionPath("claude_9f3ab2c1"))).toBe(true);
    expect(SESSIONS_RELATIVE).toBe(".pomaster/runtime/sessions");
  });

  it("首注册 journal SESSION_ATTACHED；刷新零新增事件（心跳语义）且 last_seen_at 前移", async () => {
    await attachSession(store, { sessionKey: "codex_77c10d", harness: "codex", now: T0 });
    expect(journalEventTypes().filter((type) => type === "SESSION_ATTACHED")).toHaveLength(1);
    const refreshed = await attachSession(store, {
      sessionKey: "codex_77c10d",
      harness: "codex",
      now: T0 + 60_000,
    });
    expect(refreshed.created).toBe(false);
    expect(refreshed.last_seen_at).toBe("2026-08-30T09:01:00.000Z");
    expect(journalEventTypes().filter((type) => type === "SESSION_ATTACHED")).toHaveLength(1);
  });

  it("刷新保留既有任务指针（resume 探测）与平台元数据 merge 保留（同键覆盖）；显式改绑生效", async () => {
    await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      platformMeta: { session_id: "aaa", cwd: "D:/work" },
      currentTask: "TASK.T0117",
      now: T0,
    });
    const merge = await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      platformMeta: { cwd: "D:/work2" },
      now: T0 + 1_000,
    });
    expect(merge.resumed_task).toBe("TASK.T0117");
    const record = readSessionRecord(pathsOf(store), "claude_9f3ab2c1") as SessionRecord;
    expect(record.platform_meta).toEqual({ session_id: "aaa", cwd: "D:/work2" });
    const rebound = await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      currentTask: "TASK.T0123",
      now: T0 + 2_000,
    });
    expect(rebound.resumed_task).toBe("TASK.T0123");
  });

  it("session_key 词形：例文 + 子代理后缀 .sa1 合法；路径逃逸/空段 fail-closed SCHEMA_INVALID", async () => {
    expect(SESSION_KEY_PATTERN.test("claude_9f3ab2c1")).toBe(true);
    expect(SESSION_KEY_PATTERN.test("claude_9f3ab2c1.sa1")).toBe(true);
    expect(SESSION_KEY_PATTERN.test("claude_9f3ab2c1.sa2")).toBe(true);
    expect(SESSION_KEY_PATTERN.test("..\\evil")).toBe(false);
    expect(SESSION_KEY_PATTERN.test(".hidden")).toBe(false);
    expect(SESSION_KEY_PATTERN.test("a/b")).toBe(false);
    await expect(
      attachSession(store, { sessionKey: "../evil", harness: "claude-code", now: T0 }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(existsSync(join(root, "evil.json"))).toBe(false);
  });

  it("harness 空 → SCHEMA_INVALID（禁静默匿名）；ttlSeconds 非正整数 → SCHEMA_INVALID", async () => {
    await expect(
      attachSession(store, { sessionKey: "claude_x", harness: "  ", now: T0 }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      attachSession(store, { sessionKey: "claude_x", harness: "claude-code", ttlSeconds: 0, now: T0 }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

describe("attachSession（顶替显式化——P20 红队发现 3）", () => {
  it("既有活会话 + 不同 harness + 缺 force → SESSION_REPLACE_REQUIRED（零凭据顶替被拒；文件零变零事件）", async () => {
    await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      currentTask: "TASK.T0117",
      now: T0,
    });
    const bytesBefore = readFileSync(sessionPath("claude_9f3ab2c1"), "utf8");
    const eventsBefore = journalEventTypes();
    await expect(
      attachSession(store, { sessionKey: "claude_9f3ab2c1", harness: "codex", now: T0 + 1000 }),
    ).rejects.toMatchObject({
      code: "SESSION_REPLACE_REQUIRED",
      hint: expect.stringContaining("force"),
    });
    // 拒绝零副作用：文件字节不变（harness 未被无声换掉）+ journal 零新事件。
    expect(readFileSync(sessionPath("claude_9f3ab2c1"), "utf8")).toBe(bytesBefore);
    expect(journalEventTypes()).toEqual(eventsBefore);
    const record = readSessionRecord(pathsOf(store), "claude_9f3ab2c1") as SessionRecord;
    expect(record.harness).toBe("claude-code");
  });

  it("stale 前任 + 不同 harness → 顶替合法放行（接管通路）：SESSION_REPLACED 留痕 + 指针/持锁原样承接", async () => {
    await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      currentTask: "TASK.T0117",
      ttlSeconds: 100,
      now: T0,
    });
    await acquireLock(store, {
      kind: "change",
      ref: "CHG-0042",
      sessionKey: "claude_9f3ab2c1",
      now: T0,
    });
    // 越过 ttl(100s) → 前任可证已亡；不同 harness 的 attach 无需 force。
    const takeover = await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "codex",
      now: T0 + 200_000,
    });
    expect(takeover.created).toBe(false);
    expect(takeover.replaced).toBe(true);
    expect(takeover.resumed_task).toBe("TASK.T0117");
    expect(takeover.held_locks).toEqual(["change-CHG-0042"]);
    const events = journalEventTypes();
    expect(events).toContain("SESSION_REPLACED");
    const replaced = journalEvents().find((event) => event.type === "SESSION_REPLACED");
    expect(replaced?.session_key).toBe("claude_9f3ab2c1");
    expect(replaced?.previous_harness).toBe("claude-code");
    expect(replaced?.harness).toBe("codex");
    const record = readSessionRecord(pathsOf(store), "claude_9f3ab2c1") as SessionRecord;
    expect(record.harness).toBe("codex");
  });

  it("显式 force 顶替活会话：放行 + SESSION_REPLACED 留痕 + outcome.replaced=true；同 harness attach 不触发顶替判定（心跳语义零事件）", async () => {
    await attachSession(store, { sessionKey: "claude_9f3ab2c1", harness: "claude-code", now: T0 });
    const forced = await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "codex",
      force: true,
      now: T0 + 1000,
    });
    expect(forced.replaced).toBe(true);
    expect(journalEventTypes().filter((type) => type === "SESSION_REPLACED")).toHaveLength(1);
    const record = readSessionRecord(pathsOf(store), "claude_9f3ab2c1") as SessionRecord;
    expect(record.harness).toBe("codex");

    // 同 harness attach = 刷新：replaced=false 且零新事件（心跳语义不经顶替闸）。
    const eventsBefore = journalEventTypes();
    const refreshed = await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "codex",
      force: true,
      now: T0 + 2000,
    });
    expect(refreshed.replaced).toBe(false);
    expect(journalEventTypes()).toEqual(eventsBefore);
  });
});

describe("refreshSession（心跳顺手刷新）", () => {
  it("刷新 last_seen_at；未注册会话 → SESSION_NOT_FOUND（禁静默重建）", async () => {
    await expect(refreshSession(store, "ghost_1", T0)).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
    });
    await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      currentTask: "TASK.T0117",
      now: T0,
    });
    const refreshed = await refreshSession(store, "claude_9f3ab2c1", T0 + 30_000);
    expect(refreshed.last_seen_at).toBe("2026-08-30T09:00:30.000Z");
    expect(refreshed.current_task).toBe("TASK.T0117");
  });
});

describe("liveness 判定（stale 显式可见非隐式）", () => {
  it("judgeSessionLiveness 纯函数：TTL 内 alive / 超时 stale；损坏 last_seen_at 判 stale（fail-closed）", async () => {
    await attachSession(store, { sessionKey: "claude_9f3ab2c1", harness: "claude-code", now: T0 });
    const paths = pathsOf(store);
    const record = readSessionRecord(paths, "claude_9f3ab2c1") as SessionRecord;
    // 「超过 TTL 即视作 stale」（D 线 §3.1）：边界拍仍在 TTL 内，严格超出即 stale。
    expect(judgeSessionLiveness(record, T0 + 900_000)).toBe("alive");
    expect(judgeSessionLiveness(record, T0 + 900_001)).toBe("stale");
    expect(judgeSessionLiveness({ ...record, last_seen_at: "not-a-date" }, T0)).toBe("stale");
  });

  it("listSessionRecords 清单并排记录+判定：双会话一活一僵显式呈现", async () => {
    await attachSession(store, { sessionKey: "claude_9f3ab2c1", harness: "claude-code", now: T0 });
    await attachSession(store, { sessionKey: "codex_77c10d", harness: "codex", now: T0 });
    await refreshSession(store, "claude_9f3ab2c1", T0 + 1000);
    const rows = listSessionRecords(pathsOf(store), T0 + 2_000_000);
    expect(rows).toHaveLength(2);
    const byKey = new Map(rows.map((row) => [row.record.session_key, row.liveness]));
    expect(byKey.get("claude_9f3ab2c1")).toBe("stale");
    expect(byKey.get("codex_77c10d")).toBe("stale");
    const fresh = listSessionRecords(pathsOf(store), T0 + 1_000);
    const freshByKey = new Map(fresh.map((row) => [row.record.session_key, row.liveness]));
    expect(freshByKey.get("claude_9f3ab2c1")).toBe("alive");
    expect(freshByKey.get("codex_77c10d")).toBe("alive");
  });

  it("同参数重放字节稳定（now 注入；runtime 侧车不进 hash 但保留确定性判定面）", async () => {
    await attachSession(store, { sessionKey: "claude_9f3ab2c1", harness: "claude-code", now: T0 });
    const first = readFileSync(sessionPath("claude_9f3ab2c1"), "utf8");
    await attachSession(store, { sessionKey: "claude_9f3ab2c1", harness: "claude-code", now: T0 });
    const second = readFileSync(sessionPath("claude_9f3ab2c1"), "utf8");
    expect(second).toBe(first);
  });

  it("锁面联记：acquire 后 held_locks 同步（锁-会话指针一致性，D 线 §3.1 held_locks 字段）", async () => {
    await attachSession(store, { sessionKey: "claude_9f3ab2c1", harness: "claude-code", now: T0 });
    await acquireLock(store, {
      kind: "change",
      ref: "CHG-0042",
      sessionKey: "claude_9f3ab2c1",
      now: T0,
    });
    const record = readSessionRecord(pathsOf(store), "claude_9f3ab2c1") as SessionRecord;
    expect(record.held_locks).toEqual(["change-CHG-0042"]);
  });

  it("未初始化 store（索引缺席）→ NOT_CONFIGURED（fail-closed，禁旁路落盘）", async () => {
    const { rmSync } = await import("node:fs");
    rmSync(join(root, ".pomaster", "state", "truth-index.json"));
    await expect(
      attachSession(store, { sessionKey: "claude_x", harness: "claude-code", now: T0 }),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});
