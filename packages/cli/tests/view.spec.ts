/**
 * view.spec.ts —— 三投影命令面 + Exception Ledger 命令（P19；§44.7/§49/§53/§91.3）。
 *
 * 判据锚：
 * - §44.7 命令词形：view blueprint [<scope>] / view task <task> / audit blueprint /
 *   audit task / ledger record|list（README 命令面 B1 双向同步）；
 * - §49.1 三类投影：Narrative（Stable Core 正文 + Uncertainty Envelope）/ Review
 *   （§53 十二步审查顺序）/ Audit（七字段完整呈现）；
 * - §91.1 一个 State 多种 View：投影纯读零写入（执行前后 .pomaster 字节不变，
 *   测试锚）；数据源 = 既有 store/truth/evidence 平面 + Exception Ledger；
 * - §53 十二步顺序逐字（不发明步骤）；File Diff 从主要审查对象降级为证据层；
 * - §91.3 可见性二分：CONFLICT/HARD_BLOCKER 高显著度区块；其余三类聚合分区；
 * - §49.2 入账：EXC-n 确定性递增；词表外 fail-closed；list 缺席显式空。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, type Store } from "@pomaster/kernel";
import {
  runAuditBlueprint,
  runAuditTask,
  runLedgerList,
  runLedgerRecord,
  runViewBlueprint,
  runViewTask,
  REVIEW_STEPS,
  AUDIT_FIELDS,
} from "@pomaster/cli";

let root: string;
let store: Store;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-view-"));
  store = await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// fixture（kernel 判卷输入的合法最小面；不发明词表外值）
// ============================================================

function pageEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "PAGE.DASHBOARD",
    kind: "page_surface",
    axisProfile: "page_default",
    axes: {
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change: "STABLE",
    },
    titleZh: "仪表盘",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { surface: "V1" },
    ...overrides,
  };
}

async function seedWorld(): Promise<void> {
  await applyTransaction(store, {
    ops: [
      { op: "upsert_object", envelope: pageEnvelope() },
      {
        op: "upsert_object",
        envelope: pageEnvelope({
          id: "PAGE.REPORT",
          titleZh: "报表页（提议中）",
          axes: {
            lifecycle: "PROPOSED",
            confidence: "UNRESOLVED",
            evidence: "PLANNED",
            change: "STABLE",
          },
        }),
      },
      {
        op: "upsert_object",
        envelope: pageEnvelope({
          id: "CHANGE.C0001",
          kind: "change_object",
          axisProfile: "change_default",
          titleZh: "仪表盘卡片重构",
          payload: {
            motivation: "卡片布局过时",
            affected_objects: ["PAGE.DASHBOARD", "API_REQ.DASHBOARD.CARDS"],
            class_scan_result: {
              scope: "src/**",
              hits: 3,
              fixed_count: 3,
              regression_case_ref: "GRN-1",
            },
          },
        }),
      },
      {
        op: "upsert_object",
        envelope: pageEnvelope({
          id: "TASK.T0001",
          kind: "task_object",
          axisProfile: "task_default",
          titleZh: "重构仪表盘卡片",
          payload: {
            intent: "重构仪表盘卡片布局为响应式栅格",
            implements_change: "CHANGE.C0001",
            acceptance: [{ criterion: "栅格断点齐备", claim: null }],
            class_scan_result: {
              scope: "src/**",
              hits: 1,
              fixed_count: 1,
              regression_case_ref: "GRN-1",
            },
          },
        }),
      },
    ],
    authorityRef: "TEST_SEED",
  });
  const permit = await import("@pomaster/cli").then((m) => m.runPermitIssue(root, {
    subjects: ["PAGE.DASHBOARD"],
    actor: "human:owner",
    changeRef: "CHANGE.C0001",
  }));
  if (!permit.ok) throw new Error(`seed permit failed: ${permit.errors[0]?.message}`);
}

async function seedLedger(): Promise<void> {
  const seeded = await import("@pomaster/cli").then((m) => m.runLedgerRecord(root, {
    classification: "ASSUMPTION",
    statement: "卡片布局按 12 列栅格假设推进（断点方案未定案）",
    objectRef: "PAGE.DASHBOARD",
    changeRef: "CHANGE.C0001",
    actor: "human:owner",
  }));
  if (!seeded.ok) throw new Error(`seed ledger failed: ${seeded.errors[0]?.message}`);
  const blocker = await import("@pomaster/cli").then((m) => m.runLedgerRecord(root, {
    classification: "HARD_BLOCKER",
    statement: "报表数据源契约不存在，映射无法定案",
    changeRef: "CHANGE.C0001",
    actor: "agent:claude/session-93",
  }));
  if (!blocker.ok) throw new Error(`seed ledger blocker failed: ${blocker.errors[0]?.message}`);
}

/** .pomaster 全树字节快照（纯读零写入测试锚）。 */
function snapshot(): Map<string, number> {
  const files = new Map<string, number>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(full, readFileSync(full).length);
    }
  };
  walk(join(root, ".pomaster"));
  return files;
}

// ============================================================
// view blueprint（§49.1 Narrative）
// ============================================================

describe("view blueprint（Narrative View §49.1/§91.2/§91.3）", () => {
  it("未初始化 → NOT_INITIALIZED（禁静默投影）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-view-bare-"));
    try {
      const outcome = await runViewBlueprint(bare, {});
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("Stable Core 无标签正文 + Uncertainty Envelope 轴异常聚合（§91.3 第一行/§91.2）", async () => {
    await seedWorld();
    const outcome = await runViewBlueprint(root, {});
    expect(outcome.ok).toBe(true);
    const md = outcome.result.markdown;
    expect(md).toContain("# Blueprint Narrative View（§49.1 Narrative）");
    expect(md).toContain("## Stable Core（§49.2：正文 = 当前可成立的完整世界）");
    // 正常状态不贴标签：直接进正文（§91.3）。
    expect(md).toContain("- 仪表盘（`PAGE.DASHBOARD`）");
    // 轴异常对象（PROPOSED/UNRESOLVED/PLANNED）不进 Stable Core。
    expect(md.indexOf("PAGE.DASHBOARD")).toBeLessThan(md.indexOf("## Uncertainty Envelope"));
    expect(md).toContain("## Uncertainty Envelope（§91.2：对象轴异常如实聚合）");
    expect(md).toContain("`PAGE.REPORT`");
    expect(md).toContain("lifecycle=PROPOSED confidence=UNRESOLVED evidence=PLANNED");
    expect(outcome.result.stable_core_count).toBe(3);
    expect(outcome.result.envelope_object_count).toBe(1);
  });

  it("Exception Ledger §91.3 二分：CONFLICT/HARD_BLOCKER 高显著度区块；ASSUMPTION/OPEN_QUESTION/DEFERRED 聚合分区（§49.2）", async () => {
    await seedWorld();
    await seedLedger();
    const openQuestion = await runLedgerRecord(root, {
      classification: "OPEN_QUESTION",
      statement: "空态文案是否需要国际化",
      actor: "human:owner",
    });
    expect(openQuestion.ok).toBe(true);
    const outcome = await runViewBlueprint(root, {});
    const md = outcome.result.markdown;
    expect(md).toContain(
      "## Assumptions / Open Questions / Deferred（§91.3：聚合到对应章节——Exception Ledger）",
    );
    expect(md).toContain("- [ASSUMPTION] `EXC-1` — 卡片布局按 12 列栅格假设推进");
    expect(md).toContain("- [OPEN_QUESTION] `EXC-3` — 空态文案是否需要国际化");
    expect(md).toContain("## ⚠ CONFLICT / HARD_BLOCKER（§91.3：高显著度异常区块）");
    expect(md).toContain("- [HARD_BLOCKER] `EXC-2` — 报表数据源契约不存在");
    // 高显著度条目不得混入聚合分区（二分物理分离）。
    const aggregateZone = md.slice(
      md.indexOf("## Assumptions"),
      md.indexOf("## ⚠ CONFLICT"),
    );
    expect(aggregateZone).not.toContain("HARD_BLOCKER");
  });

  it("scope 前缀过滤：命中收窄；零命中显式空（不伪装全库）", async () => {
    await seedWorld();
    const scoped = await runViewBlueprint(root, { scope: "PAGE." });
    expect(scoped.ok).toBe(true);
    expect(scoped.result.scope).toBe("PAGE.");
    expect(scoped.result.markdown).toContain("`PAGE.DASHBOARD`");
    expect(scoped.result.markdown).not.toContain("`CHANGE.C0001`");
    const empty = await runViewBlueprint(root, { scope: "ZZZ." });
    expect(empty.ok).toBe(true);
    expect(empty.result.markdown).toContain("_（空——scope 内无 lifecycle=CURRENT 且 change=STABLE 的对象）_");
  });

  it("纯读零写入：view blueprint 执行前后 .pomaster 字节不变（§91.1 投影纪律测试锚）", async () => {
    await seedWorld();
    await seedLedger();
    const before = snapshot();
    const outcome = await runViewBlueprint(root, {});
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("exception-ledger 损坏 → SCHEMA_INVALID fail-closed（异常面不可信即拒绝渲染，不冒充无异常）", async () => {
    await seedWorld();
    writeFileSync(
      join(root, ".pomaster", "state", "exception-ledger.json"),
      "{broken",
      "utf8",
    );
    const outcome = await runViewBlueprint(root, {});
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// view task（Review View §53 十二步）
// ============================================================

describe("view task（Review View §49.1 + §53）", () => {
  it("§53 十二步审查顺序逐字渲染（顺序即结构；不发明步骤）", async () => {
    await seedWorld();
    const outcome = await runViewTask(root, { task: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.steps).toHaveLength(12);
    REVIEW_STEPS.forEach((title, index) => {
      expect(outcome.result.steps[index]?.title).toBe(title);
      expect(outcome.result.markdown).toContain(`## ${index + 1}. ${title}`);
    });
    expect(REVIEW_STEPS[11]).toBe("必要时再查看 File Diff");
  });

  it("Business Intent 步挂 task payload；File Diff 降级为证据层（§53，只给 inspect 指路）", async () => {
    await seedWorld();
    const outcome = await runViewTask(root, { task: "TASK.T0001" });
    const md = outcome.result.markdown;
    expect(md).toContain("- intent: 重构仪表盘卡片布局为响应式栅格");
    expect(md).toContain("- implements_change: CHANGE.C0001");
    const step12 = md.slice(md.indexOf("## 12. 必要时再查看 File Diff"));
    expect(step12).toContain("File Diff 从主要审查对象降级为证据层（§53）");
    expect(step12).toContain("pomaster inspect <governed-id>");
  });

  it("影响面分母 = permit subjects ∪ change.affected_objects ∪ task（申报未落库对象如实呈现）", async () => {
    await seedWorld();
    const outcome = await runViewTask(root, { task: "TASK.T0001" });
    // change 锚（CHANGE.C0001）是元数据链，不是受影响对象——不进分母。
    expect(outcome.result.affected_ids).toEqual([
      "API_REQ.DASHBOARD.CARDS",
      "PAGE.DASHBOARD",
      "TASK.T0001",
    ]);
    expect(outcome.result.markdown).toContain(
      "- `API_REQ.DASHBOARD.CARDS`（不在 truth-index——由 permit/变更申报引入）",
    );
  });

  it("数据缺席步显式「（无）」（诚实缺席，不伪造审查面）", async () => {
    await seedWorld();
    const outcome = await runViewTask(root, { task: "TASK.T0001" });
    const gateStep = outcome.result.steps.find((step) => step.title === "Gate Results");
    expect(gateStep?.lines).toEqual(["（无——该步暂无机器可汇编数据）"]);
  });

  it("task 缺席 → OBJECT_NOT_FOUND；legacy 词形走 alias 收编（A6）", async () => {
    await seedWorld();
    const missing = await runViewTask(root, { task: "TASK.NOPE" });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
    const legacy = await runViewTask(root, { task: "TASK-T0001" });
    expect(legacy.ok).toBe(true);
    expect(legacy.result.resolved_via_alias).toBe("TASK-T0001");
    expect(legacy.result.task).toBe("TASK.T0001");
  });

  it("纯读零写入：view task 执行前后 .pomaster 字节不变", async () => {
    await seedWorld();
    await seedLedger();
    const before = snapshot();
    const outcome = await runViewTask(root, { task: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });
});

// ============================================================
// audit blueprint / audit task（Audit View §49.1 七字段）
// ============================================================

describe("audit（Audit View §49.1/§91.3）", () => {
  it("七字段逐字呈现（Object ID/State Axes/Authority/Source/Evidence/Policy/Transition History）", async () => {
    await seedWorld();
    const outcome = await runAuditBlueprint(root, { scope: "PAGE.DASHBOARD" });
    expect(outcome.ok).toBe(true);
    AUDIT_FIELDS.forEach((field) => {
      expect(outcome.result.markdown).toContain(`- ${field}:`);
    });
    const report = outcome.result.reports[0];
    expect(report?.object_id).toBe("PAGE.DASHBOARD");
    expect(report?.state_axes).toMatchObject({
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change: "STABLE",
    });
    expect(report?.authority.owner).toBe("BUSINESS_OWNER");
    expect(report?.source.origin).toBe("natural");
    expect(report?.transition_history[0]?.authority_ref).toBe("TEST_SEED");
    expect(outcome.result.markdown).toContain(
      "Audit View 才逐项显示完整 State Axes（§91.3）",
    );
  });

  it("audit task 分母 = 影响对象集合；申报未落库对象显式 warning（不静默吞）", async () => {
    await seedWorld();
    const outcome = await runAuditTask(root, { task: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.object_ids).toEqual(["PAGE.DASHBOARD", "TASK.T0001"]);
    expect(
      outcome.warnings.some((warning) =>
        warning.message.includes("API_REQ.DASHBOARD.CARDS"),
      ),
    ).toBe(true);
  });

  it("task 缺席 → OBJECT_NOT_FOUND；纯读零写入（audit task 前后字节不变）", async () => {
    await seedWorld();
    const missing = await runAuditTask(root, { task: "TASK.NOPE" });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
    await seedLedger();
    const before = snapshot();
    const outcome = await runAuditTask(root, { task: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("implements_change 链正文不可读 → 显式 warning + 分母降级（审查 H2，禁静默）", async () => {
    await seedWorld();
    // change 正文被删：affected_objects（含 API_REQ.DASHBOARD.CARDS）推导不动，
    // 此前 audit 零告警静默降级（view.ts 同路径有 warning）——现在必须显式可见。
    rmSync(join(root, ".pomaster", "truth", "objects", "change-object", "change.c0001.json"));
    const outcome = await runAuditTask(root, { task: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    const warning = outcome.warnings.find((w) => w.message.includes("CHANGE.C0001"));
    expect(warning).toBeDefined();
    expect(warning?.code).toBe("OBJECT_BODY_MISSING");
    expect(warning?.message).toContain("implements_change 链对象正文不可读");
    expect(warning?.hint).toContain("task/permit 分母");
    // 分母缺失可呈现：CHANGE.C0001 的影响对象只剩 task/permit 分母，不在 object_ids。
    expect(outcome.result.object_ids).not.toContain("API_REQ.DASHBOARD.CARDS");
  });

  it("implements_change 引用不在 truth-index → REF_INTEGRITY 显式 warning（审查 H2，对齐 view 先例）", async () => {
    await seedWorld();
    // 把 implements_change 指向不存在的对象（直接改 task 正文——测试注入残态）。
    const taskBodyPath = join(root, ".pomaster", "truth", "objects", "task-object", "task.t0001.json");
    const taskBody = JSON.parse(readFileSync(taskBodyPath, "utf8")) as {
      payload: Record<string, unknown>;
    };
    taskBody.payload.implements_change = "CHANGE.NOPE";
    writeFileSync(taskBodyPath, `${JSON.stringify(taskBody, null, 2)}\n`);
    const outcome = await runAuditTask(root, { task: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    const warning = outcome.warnings.find((w) => w.message.includes("CHANGE.NOPE"));
    expect(warning).toBeDefined();
    expect(warning?.code).toBe("REF_INTEGRITY");
  });
});

// ============================================================
// ledger record / list（§49.2 命令面）
// ============================================================

describe("ledger 命令面（§49.2）", () => {
  it("record：EXC-n 入账 + journal 留痕；--json 信封（§45）", async () => {
    await seedWorld();
    const outcome = await runLedgerRecord(root, {
      classification: "DEFERRED_DECISION",
      statement: "批量导入恢复交互延后决策",
      actor: "human:owner",
      note: "下个 Change 再议",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.ledger_ref).toBe("EXC-1");
    expect(outcome.human[0]).toContain("EXC-1 (DEFERRED_DECISION");
    const ledgerOnDisk = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "exception-ledger.json"), "utf8"),
    ) as { entries: Array<{ classification: string; note: string | null }> };
    expect(ledgerOnDisk.entries[0]?.classification).toBe("DEFERRED_DECISION");
    expect(ledgerOnDisk.entries[0]?.note).toBe("下个 Change 再议");
    expect(readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")).toContain(
      "EXCEPTION_RECORDED",
    );
  });

  it("record 词表外 classification → SCHEMA_INVALID（kernel 二次判卷兜底，零落盘）", async () => {
    await seedWorld();
    const outcome = await runLedgerRecord(root, {
      classification: "MAYBE",
      statement: "词表外",
      actor: "human:owner",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.hint).toContain("ASSUMPTION | OPEN_QUESTION");
  });

  it("record 空 statement / 未初始化目录 → fail-closed", async () => {
    await seedWorld();
    const empty = await runLedgerRecord(root, {
      classification: "ASSUMPTION",
      statement: "   ",
      actor: "human:owner",
    });
    expect(empty.ok).toBe(false);
    expect(empty.errors[0]?.code).toBe("SCHEMA_INVALID");
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-ledger-bare-"));
    try {
      const uninit = await runLedgerRecord(bare, {
        classification: "ASSUMPTION",
        statement: "x",
        actor: "human:owner",
      });
      expect(uninit.ok).toBe(false);
      expect(uninit.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("list：缺席显式空（不伪装成无异常）；过滤与全量；损坏 SCHEMA_INVALID", async () => {
    const empty = await runLedgerList(root, {});
    expect(empty.ok).toBe(true);
    expect(empty.result.total).toBe(0);
    expect(empty.human[0]).toContain("0 entries");
    expect(empty.human[0]).toContain("显式空");

    await seedWorld();
    await seedLedger();
    const all = await runLedgerList(root, {});
    expect(all.result.total).toBe(2);
    const filtered = await runLedgerList(root, { classification: "HARD_BLOCKER" });
    expect(filtered.result.filtered).toBe(1);
    expect(filtered.result.entries[0]?.ledger_ref).toBe("EXC-2");
    const unknown = await runLedgerList(root, { classification: "MAYBE" });
    expect(unknown.ok).toBe(true);
    expect(unknown.warnings[0]?.code).toBe("SCHEMA_INVALID");

    writeFileSync(
      join(root, ".pomaster", "state", "exception-ledger.json"),
      "{broken",
      "utf8",
    );
    const broken = await runLedgerList(root, {});
    expect(broken.ok).toBe(false);
    expect(broken.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// runCli 集成（程序级：命令注册 + §45 双输出 + 退出码）
// ============================================================

describe("runCli 集成（view/audit/ledger 程序面）", () => {
  const cliEntry = fileURLToPath(
    new URL("../dist/bin.js", import.meta.url),
  );

  function run(argv: readonly string[], cwd: string): { code: number; out: string } {
    try {
      const out = execFileSync(process.execPath, [cliEntry, ...argv], {
        cwd,
        encoding: "utf8",
      });
      return { code: 0, out };
    } catch (error) {
      const err = error as { status?: number; stdout?: string };
      return { code: err.status ?? 1, out: err.stdout ?? "" };
    }
  }

  it("runCli --json：ledger record ok 信封；词表外分类 exit 1 fail-closed", async () => {
    await seedWorld();
    const ok = run(
      ["ledger", "record", "--classification", "CONFLICT", "--statement", "两份契约冲突", "--actor", "human:owner", "--json"],
      root,
    );
    expect(ok.code).toBe(0);
    const envelope = JSON.parse(ok.out) as { command: string; ok: boolean; result: { ledger_ref: string } };
    expect(envelope.command).toBe("ledger record");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.ledger_ref).toBe("EXC-1");

    const bad = run(
      ["ledger", "record", "--classification", "NOPE", "--statement", "x", "--actor", "human:owner", "--json"],
      root,
    );
    expect(bad.code).toBe(1);
    const badEnvelope = JSON.parse(bad.out) as { ok: boolean; errors: Array<{ code: string }> };
    expect(badEnvelope.ok).toBe(false);
    expect(badEnvelope.errors[0]?.code).toBe("SCHEMA_INVALID");
  }, 30000);

  it("runCli：view blueprint / view task / audit blueprint / audit task 可执行且 exit 0", async () => {
    await seedWorld();
    for (const argv of [
      ["view", "blueprint"],
      ["view", "blueprint", "PAGE."],
      ["view", "task", "TASK.T0001"],
      ["audit", "blueprint"],
      ["audit", "blueprint", "PAGE."],
      ["audit", "task", "TASK.T0001"],
    ]) {
      const res = run(argv, root);
      expect(res.code, `pomaster ${argv.join(" ")} 应 exit 0`).toBe(0);
    }
  }, 30000);

  it("runCli：view task 缺席任务 exit 1（fail-closed 退出码语义）", async () => {
    await seedWorld();
    const res = run(["view", "task", "TASK.NOPE"], root);
    expect(res.code).toBe(1);
  }, 30000);
});
