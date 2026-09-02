/**
 * pure-read-zero-write.spec.ts —— 「纯读零写」命令的 ensureSidecars 旁路封条
 * （二轮审查 H3 · inspect.ts 先例的全量施用）。
 *
 * 病灶：session list / lock list / execution list / trace show（缺省投影）/
 * trace list / agents status 六处自述「纯读零写」，但经 createStore 装载——
 * 其 ensureSidecars 会在侧车缺失的存量 store 上静默重建空账
 * （authority.json / permits.json / journal.jsonl / heartbeat.jsonl + 运行时平面
 * 目录），丢失信号被吞。修法：装载走 kernel loadStoreReadOnly（与 createStore 同源
 * 校验，零写副作用）——侧车缺失按「显式空/缺席」呈现。头注一致性扫尾时发现
 * reconcile 为第七处同型点，一并施用同款修法。
 *
 * 判据（本 spec 三个锚）：
 * - 零写入：删除侧车的存量 store 上跑六命令，.pomaster 文件字节 + 目录集合
 *   前后快照逐一相等（ensureSidecars 复发即 fail）；
 * - 显式缺席：缺失平面按显式空呈现（0 sessions / 0 locks / 0 sealed traces），
 *   在场平面照常可读（executions=1、trace 投影可编译——零写装载不牺牲读面）；
 * - 零写装载不破判卷：同 store 上 corrupt index 场景仍 fail-closed（01 校验同闸）。
 */
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginExecution, createStore } from "@pomaster/kernel";
import {
  runAgentsStatus,
  runExecutionList,
  runLockList,
  runReconcile,
  runSessionList,
  runTraceList,
  runTraceShow,
} from "@pomaster/cli";
import { makeStore } from "../../../packages/kernel/tests/helpers.js";

let root: string;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** .pomaster 全树字节级快照：文件（内容逐字节）+ 目录集合（ensureSidecars 也建目录）。 */
function snapshot(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = full.slice(root.length + 1).split("\\").join("/");
      if (statSync(full).isDirectory()) {
        files.set(`${rel}/`, "");
        walk(full);
      } else {
        files.set(rel, readFileSync(full, "utf8"));
      }
    }
  };
  walk(join(root, ".pomaster"));
  return files;
}

/**
 * 存量 store + 侧车缺失形态：createStore 初建后 seed 一条执行档案（executions/
 * 在场平面），再删除 ensureSidecars 的全部补写目标（四侧车文件 + sessions/locks
 * 运行时平面目录）。executions/ 与 traces/ 保留——验证读面对在场平面照常工作。
 */
function stripSidecars(): void {
  const pomaster = join(root, ".pomaster");
  for (const rel of [
    join("state", "authority.json"),
    join("state", "permits.json"),
    join("state", "journal.jsonl"),
    join("runtime", "producers", "heartbeat.jsonl"),
  ]) {
    rmSync(join(pomaster, ...rel.split("\\")));
  }
  rmSync(join(pomaster, "runtime", "sessions"), { recursive: true, force: true });
  rmSync(join(pomaster, "runtime", "locks"), { recursive: true, force: true });
}

async function seedExecution(): Promise<string> {
  const store = await createStore(root);
  const record = await beginExecution(store, {
    role: "orchestrator",
    runtime: "claude-code",
    identityKind: "interactive",
    startedAt: "2026-08-30T00:00:00.000Z",
  });
  return record.execution_id;
}

describe("纯读零写命令在侧车缺失的存量 store 上（审查 H3）", () => {
  it("六命令零写入（字节级快照前后相等）+ 缺席显式空 + 在场平面照常可读", async () => {
    const agx = await seedExecution();
    stripSidecars();
    const before = snapshot();

    // —— session list：sessions 平面缺失 → 显式空，零重建 ——
    const sessions = await runSessionList(root);
    expect(sessions.ok).toBe(true);
    expect(sessions.result.sessions).toEqual([]);
    expect(sessions.human[0]).toContain("0 sessions");

    // —— lock list：locks 平面缺失 → 显式空 ——
    const locks = await runLockList(root);
    expect(locks.ok).toBe(true);
    expect(locks.result.locks).toEqual([]);
    expect(locks.human[0]).toContain("0 locks");

    // —— execution list：executions/ 在场 → 照常读出（零写装载不牺牲读面） ——
    const executions = await runExecutionList(root);
    expect(executions.ok).toBe(true);
    expect(executions.result.executions).toHaveLength(1);
    expect(executions.result.executions[0]?.execution_id).toBe(agx);

    // —— trace show（缺省投影）：journal/侧车缺失按空事实源投影，档案在场可编译 ——
    const show = await runTraceShow(root, agx);
    expect(show.ok).toBe(true);
    expect(show.result.mode).toBe("projection");
    expect(show.result.manifest).not.toBeNull();

    // —— trace list：封存平面缺失 → 显式空 ——
    const traces = await runTraceList(root);
    expect(traces.ok).toBe(true);
    expect(traces.result.traces).toEqual([]);
    expect(traces.human[0]).toContain("0 sealed traces");

    // —— agents status：聚合观测面，缺失平面 0 计数 + journal 扫描数显式 0 ——
    const agents = await runAgentsStatus(root);
    expect(agents.ok).toBe(true);
    expect(agents.result.sessions).toEqual([]);
    expect(agents.result.locks).toEqual([]);
    expect(agents.result.executions).toHaveLength(1);
    expect(agents.result.supervisor_trigger.journal_events_scanned).toBe(0);
    expect(agents.human[0]).toContain("sessions=0 locks=0 executions=1");

    // —— reconcile（H3 同型点扫尾）：同样自述纯读零写；无许可 → 显式 PERMIT_NOT_FOUND
    //    （fail-closed 错误信封，不因装载面写入而假绿/假红） ——
    const reconcile = await runReconcile(root, { permit: "PERMIT.NOPE" });
    expect(reconcile.ok).toBe(false);
    expect(reconcile.errors[0]?.code).toBe("PERMIT_NOT_FOUND");

    // —— 零写入封条：文件字节 + 目录集合前后逐一相等（ensureSidecars 复发即 fail） ——
    expect(snapshot()).toEqual(before);
  });

  it("同 store 未删侧车时 createStore 既往会补齐（对照：快照法能捕获重建）", async () => {
    // 对照组：删侧车后若走 createStore 装载，journal/authority 会被静默重建——
    // 本组用 createStore 实锤快照法对「重建」敏感（非恒等假绿）。
    await seedExecution();
    stripSidecars();
    const before = snapshot();
    await createStore(root); // ensureSidecars 重建四侧车
    const after = snapshot();
    expect(after.size).toBeGreaterThan(before.size);
    expect(before.has(".pomaster/state/journal.jsonl")).toBe(false);
    expect(after.has(".pomaster/state/journal.jsonl")).toBe(true);
  });

  it("纯读装载不牺牲判卷：可解析但 schema 非法的索引 → SCHEMA_INVALID fail-closed（01 校验同闸）", async () => {
    await seedExecution();
    stripSidecars();
    const indexPath = join(root, ".pomaster", "state", "truth-index.json");
    // 可解析 + 有 generation.seq（越过 requireInitialized 轻检）但结构非法——
    // 只有走到 loadStoreReadOnly 的 validateRawIndex 才会拦下（对照轻检不可达的防线）。
    writeFileSync(indexPath, `${JSON.stringify({ generation: { seq: 0 }, objects: "not-an-array" })}\n`);
    const outcome = await runExecutionList(root);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});
