/**
 * maintain.spec.ts —— `pomaster maintain <change-or-task>`：受控变更 + pre-dev 链（A2+A3）。
 *
 * 判据：
 * - apply 模式（A2）：--ops 显式事务走 kernel applyTransaction——APPLIED/NO_CHANGE、
 *   seq 锚定、journal authority_ref 留痕（change-or-task 锚缺省兜底）；判卷权威在
 *   kernel：合法性与 ghost owner 全由 kernel 裁决（CLI 零判卷），失败零残留（staged 回滚）；
 * - pre-dev 链（A3）：triage→permit issue→context compile 三步全走（不发明
 *   MINIMAL 跳过 permit 之类的分支政策）；链的闭合性——② 签发的许可经 taskRef
 *   许可通道让 ③ 投影 MUST 区命中 scope 对象（kernel 契约，不是 CLI 编排出来的）；
 * - fail-closed：--ops/--phase 互斥且必给其一；--phase 词表外值显式拒绝；链步失败
 *   failed_at_step 显式 + kernel/子命令码位透传。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, beginExecution, createStore } from "@pomaster/kernel";
import {
  runCli,
  runMaintain,
  type CliEnvelope,
  type MaintainApplyResult,
  type MaintainPreDevResult,
} from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-maintain-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture
// ============================================================

const CAP_ID = "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS";
const ANCHOR = "CHANGE.P11_MAINTAIN";

async function seedStore(): Promise<void> {
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

async function seedCapability(): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: CAP_ID,
          kind: "capability",
          axisProfile: "capability_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "CSV 序列化",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {},
        } as never,
      },
    ],
  });
}

const UPSERT_TX = {
  ops: [
    {
      op: "upsert_object",
      envelope: {
        id: "PAGE.DASHBOARD",
        kind: "page_surface",
        axisProfile: "page_default",
        axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
        titleZh: "仪表盘",
        authority: { owner: "BUSINESS_OWNER", delegates: [] },
        origin: "natural",
        payload: { surface: "V1" },
      },
    },
  ],
};

function writeTx(name: string, value: unknown): string {
  const path = join(root, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function journalText(): string {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
}

function journalEvents(): Record<string, unknown>[] {
  return journalText()
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** .pomaster 文树快照（零残留判据）。 */
function snapshot(): string[] {
  const base = join(root, ".pomaster");
  const entries: string[] = [];
  const walk = (current: string, rel: string): void => {
    let items: ReturnType<typeof readdirSync>;
    try {
      items = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const child = join(current, item.name);
      const childRel = rel === "" ? item.name : `${rel}/${item.name}`;
      if (item.isDirectory()) walk(child, childRel);
      else entries.push(`${childRel}:${readFileSync(child, "utf8")}`);
    }
  };
  walk(base, "");
  return entries.sort();
}

// ============================================================
// apply 模式（A2：受控变更；判卷权威在 kernel applyTransaction）
// ============================================================

describe("maintain apply 模式（--ops 受控变更）", () => {
  it("happy path：APPLIED + change-or-task 锚兜底 authorityRef + journal 留痕", async () => {
    await seedStore();
    const txPath = writeTx("tx.json", UPSERT_TX);
    const outcome = await runMaintain(root, { changeOrTask: ANCHOR, opsFile: txPath });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result as MaintainApplyResult;
    expect(result.mode).toBe("apply");
    expect(result.change).toBe("APPLIED");
    expect(result.applied_seq).toBe(1);
    expect(result.changed_object_ids).toEqual(["PAGE.DASHBOARD"]);
    expect(result.authority_ref).toBe(ANCHOR);
    expect(result.ops_counts).toEqual({ upsert_object: 1 });
    expect(result.short_circuited).toBe(false);

    // 判卷权威在 kernel 的落盘证据：对象真入账、journal TX_APPLIED 带 authority_ref。
    const index = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    ) as { objects: { id: string }[] };
    expect(index.objects.map((row) => row.id)).toContain("PAGE.DASHBOARD");
    const applied = journalEvents().find((event) => event.type === "TX_APPLIED");
    expect(applied?.authority_ref).toBe(ANCHOR);
  });

  it("幂等重放：同 tx 二次 maintain → NO_CHANGE 且 truth-index/journal 字节不变", async () => {
    await seedStore();
    const txPath = writeTx("tx.json", UPSERT_TX);
    await runMaintain(root, { changeOrTask: ANCHOR, opsFile: txPath });
    const indexBefore = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const journalBefore = journalText();

    const second = await runMaintain(root, { changeOrTask: ANCHOR, opsFile: txPath });
    expect(second.ok).toBe(true);
    const result = second.result as MaintainApplyResult;
    expect(result.change).toBe("NO_CHANGE");
    expect(result.applied_seq).toBe(1); // seq 不空转
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(indexBefore);
    expect(journalText()).toBe(journalBefore);
  });

  it("authorityRef 解析优先级：--authority-ref 覆盖 change-or-task 位置锚", async () => {
    await seedStore();
    const txPath = writeTx("tx.json", UPSERT_TX);
    const outcome = await runMaintain(root, {
      changeOrTask: ANCHOR,
      opsFile: txPath,
      authorityRef: "DECISION.D24",
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as MaintainApplyResult;
    expect(result.authority_ref).toBe("DECISION.D24");
    const applied = journalEvents().find((event) => event.type === "TX_APPLIED");
    expect(applied?.authority_ref).toBe("DECISION.D24");
  });

  it("fail-closed：缺模式/双模式互斥/坏 tx 文件 → SCHEMA_INVALID（零写状态）", async () => {
    await seedStore();
    // 缺模式：静默无操作不是合法出口。
    const neither = await runMaintain(root, { changeOrTask: ANCHOR });
    expect(neither.ok).toBe(false);
    expect(neither.errors[0]?.code).toBe("SCHEMA_INVALID");
    // 双模式互斥。
    const txPath = writeTx("tx.json", UPSERT_TX);
    const both = await runMaintain(root, {
      changeOrTask: ANCHOR,
      opsFile: txPath,
      phase: "pre-dev",
    });
    expect(both.ok).toBe(false);
    expect(both.errors[0]?.code).toBe("SCHEMA_INVALID");
    // 坏 tx 文件。
    const badPath = join(root, "bad.json");
    writeFileSync(badPath, "{not json");
    const bad = await runMaintain(root, { changeOrTask: ANCHOR, opsFile: badPath });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(journalEvents()).toEqual([]); // 一切失败零写状态
  });

  it("ghost owner → kernel GHOST_AUTHORITY_OWNER 原码透传且零残留（判卷不在 CLI）", async () => {
    await seedStore();
    const ghostTx = {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            ...UPSERT_TX.ops[0]!.envelope,
            authority: { owner: "GHOST", delegates: [] },
          },
        },
      ],
    };
    const ghostPath = writeTx("ghost.json", ghostTx);
    const before = snapshot();
    const outcome = await runMaintain(root, { changeOrTask: ANCHOR, opsFile: ghostPath });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("GHOST_AUTHORITY_OWNER"); // kernel 原码（非 CLI 发明）
    expect(snapshot()).toEqual(before); // staged 回滚零残留
  });

  it("store 未初始化 → NOT_INITIALIZED", async () => {
    mkdirSync(root, { recursive: true });
    const outcome = await runMaintain(root, { changeOrTask: ANCHOR, opsFile: "tx.json" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });
});

// ============================================================
// pre-dev 链模式（A3：triage → permit issue → context compile）
// ============================================================

describe("maintain --phase pre-dev（八拍①②③薄编排）", () => {
  const chainInput = {
    changeOrTask: ANCHOR,
    phase: "pre-dev" as const,
    request: "跨域 contract 字段调整",
    subjects: [CAP_ID],
    actor: "agent:claude",
    role: "frontend",
  };

  it("happy path：triage STANDARD → permit 签发 → 投影 MUST 命中 scope 对象（链闭合）", async () => {
    await seedStore();
    await seedCapability();
    const outcome = await runMaintain(root, chainInput);
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result as MaintainPreDevResult;
    expect(result.mode).toBe("pre_dev_chain");
    expect(result.phase).toBe("pre-dev");
    expect(result.failed_at_step).toBeNull();

    // ① triage（contract 关键词 → STANDARD 升档；缺席信号照列）。
    expect(result.triage?.profile).toBe("STANDARD");
    expect(result.triage?.matched_rule).toBe("E_CONTRACT_KEYWORD");
    expect(result.triage?.absent_signals.length).toBeGreaterThan(0);

    // ② permit（kernel 五件套台账签发）。
    expect(result.permit?.permit_ref).toMatch(/^PERMIT\./);
    expect(result.permit?.scope?.subject_ids).toEqual([CAP_ID]);

    // ③ 投影经 taskRef 许可通道命中 scope 对象进 MUST（链闭合性；CLI 不加工范围）。
    expect(result.projection?.must_entries.map((entry) => entry.ref)).toContain(CAP_ID);
    const subjectEntry = result.projection?.must_entries.find((entry) => entry.ref === CAP_ID);
    expect(subjectEntry?.reason).toContain("permit");

    // 人读输出三步全呈现。
    const human = outcome.human.join("\n");
    expect(human).toContain("triage STANDARD");
    expect(human).toContain("PERMIT.");
    expect(human).toContain(`MUST ${CAP_ID}`);
  });

  it("零分支政策：triage MINIMAL 也不跳过 permit（编排永远三步全走，档位只呈现）", async () => {
    await seedStore();
    await seedCapability();
    const outcome = await runMaintain(root, { ...chainInput, request: "纯文案微调" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as MaintainPreDevResult;
    expect(result.triage?.profile).toBe("MINIMAL");
    expect(result.permit?.permit_ref).toMatch(/^PERMIT\./); // 没有 MINIMAL 短路
  });

  it("链写通道只有 permit issue：台账与 journal 留痕（triage/投影零写）", async () => {
    await seedStore();
    await seedCapability(); // seed 自身会留一条 TX_APPLIED（fixture 基线）
    const txAppliedBefore = journalEvents().filter((event) => event.type === "TX_APPLIED").length;
    await runMaintain(root, chainInput);
    const ledger = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "permits.json"), "utf8"),
    ) as { permits: { permit_ref: string; change_ref: string | null }[] };
    expect(ledger.permits).toHaveLength(1);
    expect(ledger.permits[0]?.change_ref).toBe(ANCHOR);
    const issued = journalEvents().find((event) => event.type === "PERMIT_ISSUED");
    expect(issued?.permit_ref).toBe(ledger.permits[0]?.permit_ref);
    // 链不推进 store 事务：TX_APPLIED 计数与链前持平（triage/投影纯读，permit 走台账非事务）。
    expect(journalEvents().filter((event) => event.type === "TX_APPLIED")).toHaveLength(txAppliedBefore);
  });

  it("fail-closed：--phase 词表外值显式拒绝（in-dev 不静默当 pre-dev）", async () => {
    await seedStore();
    const outcome = await runMaintain(root, { ...chainInput, phase: "in-dev" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("in-dev");
    expect(journalEvents()).toEqual([]);
  });

  it("fail-closed：缺 --subject → SCHEMA_INVALID（编排入参缺席显式）", async () => {
    await seedStore();
    const outcome = await runMaintain(root, {
      changeOrTask: ANCHOR,
      phase: "pre-dev",
      request: "跨域 contract 调整",
      actor: "agent:claude",
      role: "frontend",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("--subject");
  });

  it("fail-closed：subject 词形非法 → failed_at_step=permit issue + FATAL_UNKNOWN_PREFIX 透传", async () => {
    await seedStore();
    await seedCapability();
    const outcome = await runMaintain(root, { ...chainInput, subjects: ["BOGUS.X"] });
    expect(outcome.ok).toBe(false);
    const result = outcome.result as MaintainPreDevResult;
    expect(result.failed_at_step).toBe("permit issue");
    expect(outcome.errors[0]?.code).toBe("FATAL_UNKNOWN_PREFIX"); // kernel/子命令原码，非 CLI 发明
    expect(result.permit).toBeNull();
  });

  it("store 未初始化 → NOT_INITIALIZED（链入口缺席显式）", async () => {
    mkdirSync(root, { recursive: true });
    const outcome = await runMaintain(root, chainInput);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });
});

// ============================================================
// CLI 装配层（commander 命令面）
// ============================================================

describe("maintain CLI 命令面", () => {
  it("--json：缺模式 → exit 1 信封 errors[0].code=SCHEMA_INVALID", async () => {
    await seedStore();
    const lines: string[] = [];
    const code = await runCli(["--dir", root, "maintain", ANCHOR, "--json"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<MaintainApplyResult>;
    expect(envelope.command).toBe("maintain");
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("apply happy path 经 runCli 全链：exit 0 + 信封 ok=true", async () => {
    await seedStore();
    const txPath = writeTx("tx.json", UPSERT_TX);
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "maintain", ANCHOR, "--ops", txPath, "--json"],
      { stdout: (line) => lines.push(line), stderr: () => undefined },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<MaintainApplyResult>;
    expect(envelope.ok).toBe(true);
    expect(envelope.result.mode).toBe("apply");
    expect(envelope.result.change).toBe("APPLIED");
  });

  it("pre-dev 链缺 --request（runCli 全链）→ exit 1 显式 SCHEMA_INVALID（不静默跳步）", async () => {
    await seedStore();
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "maintain", ANCHOR, "--phase", "pre-dev", "--subject", CAP_ID, "--actor", "agent:claude", "--role", "frontend", "--json"],
      { stdout: (line) => lines.push(line), stderr: () => undefined },
    );
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<MaintainPreDevResult>;
    expect(envelope.ok).toBe(false);
    expect(envelope.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(envelope.errors[0]?.message).toContain("--request");
  });
});

// ============================================================
// 事务级 execution 盖章（P21-Enforcement；P20 收口义务——maintain 通路
// §25.4「哪个 Agent……做了哪次变化」审计问题的兑现位；P20 §3 裁定 5 归 P21）
// ============================================================

describe("maintain 事务级 execution 盖章（--execution-id → TX_APPLIED）", () => {
  it("携带已登记 AGX → APPLIED + 结果回读 execution_id + journal TX_APPLIED 盖章", async () => {
    await seedStore();
    const store = await createStore(root);
    const record = await beginExecution(store, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
      startedAt: "2026-08-30T00:00:00.000Z",
    });
    const txPath = writeTx("tx.json", UPSERT_TX);
    const outcome = await runMaintain(root, {
      changeOrTask: ANCHOR,
      opsFile: txPath,
      executionId: record.execution_id,
    });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as MaintainApplyResult;
    expect(result.change).toBe("APPLIED");
    expect(result.execution_id).toBe(record.execution_id);
    const applied = journalEvents()
      .filter((event) => event.type === "TX_APPLIED")
      .at(-1);
    expect(applied?.execution_id).toBe(record.execution_id);
  });

  it("未登记 AGX（自造身份）→ EXECUTION_NOT_FOUND exit 1（S1 禁自造身份；零残留）", async () => {
    await seedStore();
    const txPath = writeTx("tx.json", UPSERT_TX);
    const outcome = await runMaintain(root, {
      changeOrTask: ANCHOR,
      opsFile: txPath,
      executionId: "AGX-2026-09999",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    // staged 回滚：对象未入账。
    const index = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    ) as { objects: { id: string }[] };
    expect(index.objects.map((row) => row.id)).not.toContain("PAGE.DASHBOARD");
  });

  it("缺席 --execution-id → 结果 execution_id=null（显式——不冒充已盖章）", async () => {
    await seedStore();
    const txPath = writeTx("tx.json", UPSERT_TX);
    const outcome = await runMaintain(root, { changeOrTask: ANCHOR, opsFile: txPath });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as MaintainApplyResult;
    expect(result.execution_id).toBe(null);
    const applied = journalEvents()
      .filter((event) => event.type === "TX_APPLIED")
      .at(-1);
    expect(applied?.execution_id).toBe(null);
  });
});
