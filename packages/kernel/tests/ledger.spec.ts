/**
 * ledger.spec.ts —— Exception Ledger（§49.2 异常状态登记面；P19）。
 *
 * 判据锚：
 * - §49.2 分类五值闭包（ASSUMPTION/OPEN_QUESTION/DEFERRED_DECISION/CONFLICT/
 *   HARD_BLOCKER）；词表外 fail-closed SCHEMA_INVALID；
 * - EXC-n 确定性递增分配（GRN/CLM 通路分配同款词形；非幂等——重复登记 = 新条目，
 *   同 permit issue 先例：静默去重会吞掉重复申报信号）；
 * - journal EXCEPTION_RECORDED 事件流（A4 事件拍非墙钟；§49「可以重建」的事件底座）；
 * - staged write 失败不落半写状态（原文件保留）；
 * - 台账缺席 = 合法空（opt-in 登记面）；损坏 = SCHEMA_INVALID（禁静默当空表）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  isExceptionLedgerRef,
  recordException,
  type Store,
} from "@pomaster/kernel";
import { AGENT, gid, HUMAN, makeStore, pageEnvelope } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

function ledgerFile(): { version: number; entries: Array<Record<string, unknown>> } {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "state", "exception-ledger.json"), "utf8"),
  ) as { version: number; entries: Array<Record<string, unknown>> };
}

function journal(): string {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
}

async function seedObject(): Promise<void> {
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: pageEnvelope() }],
    authorityRef: "TEST_SEED",
  });
}

describe("recordException（§49.2 入账）", () => {
  it("EXC-n 确定性递增：首条 EXC-1；台账五字段齐备 + recorded_at_seq 采样 store seq（A4）", async () => {
    await seedObject();
    const entry = await recordException(store, {
      classification: "ASSUMPTION",
      statement: "卡片布局按 12 列栅格假设推进",
      objectRef: gid("PAGE.DASHBOARD"),
      changeRef: "CHANGE.C0001",
      recordedBy: HUMAN,
    });
    expect(entry.ledger_ref).toBe("EXC-1");
    expect(isExceptionLedgerRef(entry.ledger_ref)).toBe(true);
    expect(entry.classification).toBe("ASSUMPTION");
    expect(entry.statement).toBe("卡片布局按 12 列栅格假设推进");
    expect(entry.object_ref).toBe("PAGE.DASHBOARD");
    expect(entry.change_ref).toBe("CHANGE.C0001");
    expect(entry.recorded_by).toEqual({
      actor_type: "human",
      actor: "owner",
      self_attested: false,
    });
    expect(entry.recorded_at_seq).toBe(1);
    const onDisk = ledgerFile();
    expect(onDisk.version).toBe(1);
    expect(onDisk.entries).toHaveLength(1);
  });

  it("递增分配跨条目单调（EXC-2/EXC-3）；非幂等——重复登记同内容 = 新条目（同 permit issue 先例）", async () => {
    await seedObject();
    const input = {
      classification: "CONFLICT",
      statement: "两份契约对同一 operationId 语义冲突",
      recordedBy: AGENT,
    } as const;
    const first = await recordException(store, { ...input });
    const second = await recordException(store, { ...input });
    expect(first.ledger_ref).toBe("EXC-1");
    expect(second.ledger_ref).toBe("EXC-2");
    expect(ledgerFile().entries).toHaveLength(2);
  });

  it("classification 词表外 → SCHEMA_INVALID fail-closed（§49.2 五分类闭包；零落盘）", async () => {
    await seedObject();
    await expect(
      recordException(store, {
        classification: "MAYBE_BROKEN",
        statement: "词表外分类尝试",
        recordedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(() => ledgerFile()).toThrow(); // 文件未落盘（空.entries 写入都不发生）
    expect(journal()).not.toContain("EXCEPTION_RECORDED");
  });

  it("statement 空白 → SCHEMA_INVALID（「待定」不是陈述；同 09 unknown_item 语义）", async () => {
    await seedObject();
    for (const statement of ["", "   "]) {
      await expect(
        recordException(store, {
          classification: "OPEN_QUESTION",
          statement,
          recordedBy: AGENT,
        }),
      ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    }
    expect(journal()).not.toContain("EXCEPTION_RECORDED");
  });

  it("journal EXCEPTION_RECORDED 事件流：每条登记一行（seq + ledger_ref + classification）", async () => {
    await seedObject();
    await recordException(store, {
      classification: "HARD_BLOCKER",
      statement: "上游数据源契约缺失",
      recordedBy: AGENT,
      note: "Authority 裁决位：BUSINESS_OWNER",
    });
    const lines = journal().trimEnd().split("\n");
    const event = JSON.parse(lines[lines.length - 1] ?? "{}") as Record<string, unknown>;
    expect(event.type).toBe("EXCEPTION_RECORDED");
    expect(event.ledger_ref).toBe("EXC-1");
    expect(event.classification).toBe("HARD_BLOCKER");
    expect(event.seq).toBe(1);
  });

  it("object_ref/change_ref/note 缺席归 null（台账字段齐备，不允许 undefined 渗漏）", async () => {
    await seedObject();
    const entry = await recordException(store, {
      classification: "DEFERRED_DECISION",
      statement: "批量导入恢复交互延后决策",
      recordedBy: HUMAN,
    });
    expect(entry.object_ref).toBeNull();
    expect(entry.change_ref).toBeNull();
    expect(entry.note).toBeNull();
  });

  it("store 未初始化 → NOT_CONFIGURED（禁静默建账）", async () => {
    // makeStore 已初始化；用未初始化的空目录构造裸场景。
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const bareRoot = mkdtempSync(join(tmpdir(), "pvnext-ledger-bare-"));
    const { createStore } = await import("@pomaster/kernel");
    const bare = await createStore(bareRoot);
    // createStore 幂等初始化骨架——recordException 依赖 seq；删除索引模拟未初始化。
    const { rmSync } = await import("node:fs");
    rmSync(join(bareRoot, ".pomaster", "state", "truth-index.json"));
    await expect(
      recordException(bare, {
        classification: "ASSUMPTION",
        statement: "未初始化 store 尝试入账",
        recordedBy: AGENT,
      }),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});

describe("ledger 台账读取语义", () => {
  it("isExceptionLedgerRef：EXC-n 词形判定（GRN/CLM 通路分配同款；非 governed id）", () => {
    expect(isExceptionLedgerRef("EXC-1")).toBe(true);
    expect(isExceptionLedgerRef("EXC-42")).toBe(true);
    expect(isExceptionLedgerRef("EXC-0")).toBe(true);
    expect(isExceptionLedgerRef("EXC-x")).toBe(false);
    expect(isExceptionLedgerRef("EXC-")).toBe(false);
    expect(isExceptionLedgerRef("PERMIT.X.1")).toBe(false);
  });

  it("台账损坏（entries 非数组）→ SCHEMA_INVALID（禁静默当空表）", async () => {
    await seedObject();
    await recordException(store, {
      classification: "ASSUMPTION",
      statement: "损坏前登记",
      recordedBy: HUMAN,
    });
    const path = join(root, ".pomaster", "state", "exception-ledger.json");
    writeFileSync(path, JSON.stringify({ version: 1, entries: "not-an-array" }), "utf8");
    await expect(
      recordException(store, {
        classification: "ASSUMPTION",
        statement: "损坏后登记",
        recordedBy: HUMAN,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("台账 JSON 损坏 → SCHEMA_INVALID（投影侧 fail-closed：异常面不可信即拒绝消费）", async () => {
    await seedObject();
    const path = join(root, ".pomaster", "state", "exception-ledger.json");
    writeFileSync(path, "{broken", "utf8");
    await expect(
      recordException(store, {
        classification: "ASSUMPTION",
        statement: "损坏后登记",
        recordedBy: HUMAN,
      }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});
