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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  applyKnowledgeTransition,
  beginExecution,
  createStore,
  promoteKnowledge,
  recordKnowledge,
} from "@pomaster/kernel";
import {
  runCli,
  runContextCompile,
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

    // ③ 共享完整编排契约（审计 F4 修复）：manifest 真实落盘（不再「声称 compile 却
    // 查无 manifest」），落盘位/是否落盘/stale 三态在结果中诚实呈现（加法字段）。
    expect(result.context_manifest?.persisted).toBe(true);
    expect(result.context_manifest?.manifest_path).toBe(
      `.pomaster/state/contexts/${ANCHOR}.context.json`,
    );
    expect(result.context_manifest?.stale_state).toBe("absent");

    // 人读输出三步全呈现（含 F4 落盘行）。
    const human = outcome.human.join("\n");
    expect(human).toContain("triage STANDARD");
    expect(human).toContain("PERMIT.");
    expect(human).toContain(`MUST ${CAP_ID}`);
    expect(human).toContain("context manifest: 已落盘");
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

  it("链写通道：permit 台账/journal + context manifest 落盘（F4 后 ③ 写 manifest；store 事务零推进）", async () => {
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
    // F4 修复后 ③ 的写面：context manifest 真实在场（与显式 context compile 同一落盘位）。
    expect(readFileSync(
      join(root, ".pomaster", "state", "contexts", `${ANCHOR}.context.json`),
      "utf8",
    )).toContain('"inputs_fingerprint"');
    // 链不推进 store 事务：TX_APPLIED 计数与链前持平（triage 纯读，permit 走台账非事务，
    // manifest 落盘写 contexts/ 编译产物——均非 store 事务写通道）。
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
// 审计 F4 回归（R-G 修复批 2026-09-06）：pre-dev ③ = 共享完整编排契约
// 判据锚（cli/src/context.ts 头注「共享完整编排契约入口」+ cli/src/maintain.ts ③ 注记）：
// - 旧病灶：maintain 裸调 kernel compileProjection 绕过 manifest 落盘/stale 处理/
//   VERIFICATION 分区派生——pre-dev 成功 failed_at_step=null 却查无 manifest，
//   与显式 `pomaster context compile` 两个入口不等价；
// - 修复后：③ 走 runContextCompile 同一编排入口——pre-dev 成功即 manifest 真实落盘，
//   F2 正文绑定指纹语义在 pre-dev 链上生效。
// ============================================================

describe("maintain pre-dev context compile 共享编排契约（审计 F4 回归，R-G 批）", () => {
  const TASK_ID = "TASK.T0404";
  const f4ChainInput = {
    changeOrTask: TASK_ID,
    phase: "pre-dev" as const,
    request: "任务实现前的上下文编译",
    subjects: [TASK_ID],
    actor: "agent:claude",
    role: "frontend",
  };

  /** 登记/修改 TASK.T0404 的 intent（maintain 修改任务正文的等价事务——rev 递增、body_sha256 变）。 */
  async function seedTaskIntent(intent: string): Promise<void> {
    const store = await createStore(root);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: TASK_ID,
            kind: "task_object",
            axisProfile: "task_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "F4 回归任务",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              intent,
              class_scan_result: {
                scope: "src/shared/**",
                hits: 0,
                fixed_count: 0,
                regression_case_ref: "GRN-F4",
              },
            },
          } as never,
        },
      ],
    });
  }

  function manifestPath(): string {
    return join(root, ".pomaster", "state", "contexts", `${TASK_ID}.context.json`);
  }

  it("审计复现闭环：pre-dev 成功 → 紧接 context compile --check 为 fresh（manifest 在场且指纹含 F2 正文绑定）→ 改正文 → stale", async () => {
    await seedStore();
    await seedTaskIntent("初始意图");
    const outcome = await runMaintain(root, f4ChainInput);
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result as MaintainPreDevResult;
    expect(result.failed_at_step).toBeNull();
    // 修复判据（审计最小复现步骤 1→2 的断点）：pre-dev 成功 = manifest 真实落盘，
    // 紧接 --check 报 fresh 而非 absent（旧病灶正是此处报 absent）。
    expect(result.context_manifest?.persisted).toBe(true);
    expect(existsSync(manifestPath())).toBe(true);
    const check = await runContextCompile(root, "frontend", undefined, { change: TASK_ID }, { check: true });
    expect(check.ok).toBe(true);
    expect(check.result.stale_check.state).toBe("fresh");
    // F2 语义在 pre-dev 链上生效：--check 的指纹 = 落盘 manifest 指纹 = 含范围内正文
    // 绑定（kernel scopeContentRowsOf）的算法——正文演进必然检出（下一步验证）。
    const persisted = JSON.parse(readFileSync(manifestPath(), "utf8")) as { inputs_fingerprint: string };
    expect(persisted.inputs_fingerprint).toBe(check.result.stale_check.existing_inputs_fingerprint);
    // maintain 修改同一任务正文（rev/body_sha256 变）→ --check 判 stale（不再 fresh）。
    await seedTaskIntent("变更后意图");
    const stale = await runContextCompile(root, "frontend", undefined, { change: TASK_ID }, { check: true });
    expect(stale.result.stale_check.state).toBe("stale_grounding");
    // stale→recompile 闭环（共享入口承载）：重编译覆盖后恢复 fresh。
    await runContextCompile(root, "frontend", undefined, { change: TASK_ID });
    const refreshed = await runContextCompile(root, "frontend", undefined, { change: TASK_ID }, { check: true });
    expect(refreshed.result.stale_check.state).toBe("fresh");
  });

  it("等价性：同一 store 状态下，pre-dev 落盘 manifest 与显式 context compile 逐字节相等", async () => {
    await seedStore();
    await seedTaskIntent("等价性基线意图");
    // pre-dev 编排（triage + permit issue + 共享入口 compile+落盘）。permit issue 只写
    // 台账/journal、不推进 store seq → 显式编译的 generated_at_seq 与指纹输入完全同态。
    const predev = await runMaintain(root, f4ChainInput);
    expect(predev.ok).toBe(true);
    const viaPreDev = readFileSync(manifestPath(), "utf8");
    // 显式命令（同一编排入口、同一 store 状态：pre-dev 签发的许可仍活跃，taskRef 许可
    // 通道命中同一 MUST 范围；零墙钟零随机——A4 字节稳定）。
    const explicit = await runContextCompile(root, "frontend", undefined, { change: TASK_ID });
    expect(explicit.ok).toBe(true);
    const viaExplicit = readFileSync(manifestPath(), "utf8");
    expect(viaExplicit).toBe(viaPreDev);
    // 双入口指纹一致（等价性的直接机读判据）。
    const result = predev.result as MaintainPreDevResult;
    expect(result.projection?.inputs_fingerprint).toBe(explicit.result.inputs_fingerprint);
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

// ============================================================
// R4/D9：PROMOTED knowledge → POLICY.* 登记建议呈现（零强制零新状态轴）
// ============================================================

describe("maintain apply policy 登记建议呈现（R4/D9）", () => {
  /** 登记 PROMOTED 知识（VALIDATED→PROMOTED 唯一通路；promotedRef 指向给定引用）。 */
  async function seedPromotedKnowledge(id: string, promotedRef: string): Promise<void> {
    const s = await createStore(root);
    await recordKnowledge(s, {
      id,
      kind: "DIAGNOSTIC_PLAYBOOK",
      title: "stacking context clip",
      triggers: ["dashboard widget clipped"],
      confidence: "HIGH",
      recordedBy: { actorType: "agent", actor: "curator", selfAttested: true },
    });
    await applyKnowledgeTransition(s, {
      id,
      to: "VALIDATED",
      reasonShort: "validation",
      transitionedBy: { actorType: "human", actor: "reviewer", selfAttested: true },
    });
    await promoteKnowledge(s, {
      id,
      promotionAuthority: "MAINTAIN",
      authorityRef: "DECISION.77",
      promotedRef,
      promotedBy: "human:maintain",
    });
  }

  it("PROMOTED 未落 Policy → 建议呈现（suggested_policy_ref 机械派生；零强制）", async () => {
    await seedStore();
    await seedPromotedKnowledge("KNOWLEDGE.FE.DASH.STACK_CLIP", "DECISION.77");
    const txPath = writeTx("tx.json", UPSERT_TX);
    const outcome = await runMaintain(root, { changeOrTask: ANCHOR, opsFile: txPath });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as MaintainApplyResult;
    expect(result.change).toBe("APPLIED");
    expect(result.policy_registration_suggestions).toHaveLength(1);
    const suggestion = result.policy_registration_suggestions[0];
    expect(suggestion?.knowledge_id).toBe("KNOWLEDGE.FE.DASH.STACK_CLIP");
    expect(suggestion?.promoted_ref).toBe("DECISION.77");
    expect(suggestion?.suggested_policy_ref).toBe("POLICY.FE.DASH.STACK_CLIP");
    // 零强制：主事务结果不受建议影响（change 仍 APPLIED，零新状态轴——知识本体仍 ADVISORY 侧车）。
    expect(outcome.human.join("\n")).toContain("零强制");
  });

  it("promoted_ref 已是在册 POLICY.* 对象 → 不重复建议；无 PROMOTED 知识 → 空数组显式缺席", async () => {
    await seedStore();
    // 在册 POLICY 对象（promoted_ref 指向它 → 已落地，不再建议）。
    const s = await createStore(root);
    await applyTransaction(s, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "POLICY.FE.DASH.LANDED",
            kind: "business_rule",
            axisProfile: "rule_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "已落地策略",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: {},
          } as never,
        },
      ],
    });
    await seedPromotedKnowledge("KNOWLEDGE.FE.DASH.LANDED_CLIP", "POLICY.FE.DASH.LANDED");
    // 第二条 PROMOTED 未落地 → 仍建议。
    await seedPromotedKnowledge("KNOWLEDGE.FE.DASH.OTHER_CLIP", "DECISION.78");
    const txPath = writeTx("tx.json", UPSERT_TX);
    const outcome = await runMaintain(root, { changeOrTask: ANCHOR, opsFile: txPath });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as MaintainApplyResult;
    expect(result.policy_registration_suggestions.map((entry) => entry.knowledge_id)).toEqual([
      "KNOWLEDGE.FE.DASH.OTHER_CLIP",
    ]);
  });
});
