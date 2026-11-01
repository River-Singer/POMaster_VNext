/**
 * execution-attach-permit.spec.ts —— 给在途执行追加许可（VNext 优化 V2-2；台账 VX-WRITE-07）。
 *
 * 判据：
 * - 在途执行（未封口、无实现交接）+ 在用许可（存在、未接管、未到期）→ permit_ids 追加，
 *   journal EXECUTION_PERMIT_ATTACHED（by / reason 留痕）；已挂载 → 零写入零事件；
 * - 已封口 EXECUTION_ALREADY_ENDED / 已有交接 SCHEMA_INVALID（EXECUTION_HANDOFF_BINDS_PERMITS）/
 *   许可到期 PERMIT_EXPIRED（PERMIT_ATTACH_EXPIRED）/ 许可缺席 PERMIT_NOT_FOUND / 执行缺席
 *   EXECUTION_NOT_FOUND / 空 reason SCHEMA_INVALID——全部零写入。
 * （execution.spec 用 vi.mock 注入并发窗口；本文件不依赖 mock，独立成档。）
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendImplementationHandoff,
  applyTransaction,
  attachPermit,
  beginExecution,
  endExecution,
  issuePermit,
  readExecutionRecordById,
  pathsOf,
  type Store,
} from "@pomaster/kernel";
import { denominatorEntry, gid, HUMAN, makeStore } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

const BASE = { role: "implementer", runtime: "claude-code", identityKind: "interactive", taskId: "TASK.FEATURE" } as const;

function journalEvents(type: string): Record<string, unknown>[] {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.type === type);
}

function executionBytes(id: string): string {
  return readFileSync(join(root, ".pomaster", "executions", `${id}.json`), "utf8");
}

async function permit(ttlBeats = 10): Promise<string> {
  return (await issuePermit(store, { subjectIds: [gid("PAGE.DASHBOARD")], requestedBy: HUMAN, ttlBeats })).permitRef;
}

describe("attachPermit（在途执行追加许可）", () => {
  it("追加到 permit_ids 末尾 + journal EXECUTION_PERMIT_ATTACHED；重复挂载零写入零事件", async () => {
    const first = await permit();
    const second = await issuePermit(store, { subjectIds: [gid("PAGE.SETTINGS")], requestedBy: HUMAN, changeRef: "CHANGE.EXTRA_001" });
    const execution = await beginExecution(store, { ...BASE, permitIds: [first], startedAt: "2026-10-30T00:00:00.000Z" });
    const result = await attachPermit(store, execution.execution_id, second.permitRef, HUMAN, "导出功能需要设置页写权");
    expect(result.changed).toBe(true);
    expect(result.eventSeq).toBe(0);
    expect(readExecutionRecordById(pathsOf(store), execution.execution_id)?.permit_ids).toEqual([first, second.permitRef]);
    expect(journalEvents("EXECUTION_PERMIT_ATTACHED")).toEqual([
      {
        type: "EXECUTION_PERMIT_ATTACHED",
        seq: 0,
        execution_id: execution.execution_id,
        permit_ref: second.permitRef,
        by: { actor_type: "human", actor: "owner" },
        reason: "导出功能需要设置页写权",
      },
    ]);

    const bytes = executionBytes(execution.execution_id);
    const replay = await attachPermit(store, execution.execution_id, second.permitRef, HUMAN, "重复挂载");
    expect(replay).toMatchObject({ changed: false, eventSeq: null });
    expect(executionBytes(execution.execution_id)).toBe(bytes);
    expect(journalEvents("EXECUTION_PERMIT_ATTACHED")).toHaveLength(1);
  });

  it("已封口执行 → EXECUTION_ALREADY_ENDED；已有实现交接 → SCHEMA_INVALID（交接绑定了许可集合）", async () => {
    const ref = await permit();
    const ended = await beginExecution(store, { ...BASE, startedAt: "2026-10-30T00:00:00.000Z" });
    await endExecution(store, ended.execution_id, { endedAt: "2026-10-30T01:00:00.000Z" });
    await expect(attachPermit(store, ended.execution_id, ref, HUMAN, "补挂")).rejects.toMatchObject({ code: "EXECUTION_ALREADY_ENDED" });

    const handedOff = await beginExecution(store, { ...BASE, startedAt: "2026-10-30T02:00:00.000Z" });
    appendImplementationHandoff(store, handedOff.execution_id, {
      taskId: "TASK.FEATURE",
      changedPaths: ["src/feature.ts"],
      summary: "implement feature",
      sourceSnapshot: {
        contract: "pomaster.source-snapshot/v1",
        head: null,
        relevant_paths: ["src/feature.ts"],
        digests: { "src/feature.ts": `sha256:${"a".repeat(64)}` },
        read_failures: [],
      },
      recordedAt: "2026-10-30T03:00:00.000Z",
    });
    const bytes = executionBytes(handedOff.execution_id);
    await expect(attachPermit(store, handedOff.execution_id, ref, HUMAN, "补挂")).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
      details: { reason_code: "EXECUTION_HANDOFF_BINDS_PERMITS" },
    });
    expect(executionBytes(handedOff.execution_id)).toBe(bytes);
  });

  it("许可到期 → PERMIT_EXPIRED（PERMIT_ATTACH_EXPIRED）；许可缺席 → PERMIT_NOT_FOUND；执行缺席 → EXECUTION_NOT_FOUND；空 reason → SCHEMA_INVALID", async () => {
    const ref = await permit(1);
    const execution = await beginExecution(store, { ...BASE, startedAt: "2026-10-30T00:00:00.000Z" });
    await applyTransaction(store, { ops: [{ op: "append_denominator", entry: denominatorEntry() as never }] });
    const bytes = executionBytes(execution.execution_id);
    await expect(attachPermit(store, execution.execution_id, ref, HUMAN, "补挂")).rejects.toMatchObject({
      code: "PERMIT_EXPIRED",
      details: { reason_code: "PERMIT_ATTACH_EXPIRED" },
    });
    await expect(attachPermit(store, execution.execution_id, "PERMIT.NOPE.1", HUMAN, "补挂")).rejects.toMatchObject({ code: "PERMIT_NOT_FOUND" });
    await expect(attachPermit(store, "AGX-2026-99999", ref, HUMAN, "补挂")).rejects.toMatchObject({ code: "EXECUTION_NOT_FOUND" });
    await expect(attachPermit(store, execution.execution_id, ref, HUMAN, " ")).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(executionBytes(execution.execution_id)).toBe(bytes);
    expect(journalEvents("EXECUTION_PERMIT_ATTACHED")).toEqual([]);
  });
});
