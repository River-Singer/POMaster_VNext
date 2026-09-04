/**
 * view-attention.spec.ts —— Human Attention Queue（§6.3 + 纠错 §19；Batch 3 R1）。
 *
 * 判据锚：
 * - §6.3 首层原则：Human 审「不可外包的判断」——五类既有对象数据源接入或显式缺席；
 * - View not new database：纯读零写入（执行前后 .pomaster 字节不变，测试锚）；
 *   零新 store 对象、零新写路径（本 spec 全程只有 seed 写入，视图执行零写入）；
 * - 空队列显式「无可注意力项」（非空白假绿）；缺席组显式缺席行（不静默空组）；
 * - 每条目带下一步处置命令路标（escalation 纪律——报什么就带去哪修）；
 * - 素材面损坏 fail-closed（decision-graph sidecar / exception-ledger）：
 *   禁把「素材面不可读」呈现成「没有注意力项」。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDecisionGraph, resolveDecision, createStore } from "@pomaster/kernel";
import {
  runLedgerRecord,
  runMemoryCapture,
  runMemoryPromote,
  runMemoryReview,
  runViewAttention,
} from "@pomaster/cli";

let root: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-attention-"));
  await createStore(root);
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
// fixture（全部为既有平面合法产物；零发明词表外值）
// ============================================================

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

/** seed：escalate_owner 呈报位（memory capture → review classify TRUTH → promote）。 */
async function seedEscalateOwner(): Promise<string> {
  const captured = await runMemoryCapture(root, { text: "后端=已发布 178 opIds（attention 呈报样本）" });
  if (!captured.ok) throw new Error(`seed capture failed: ${captured.errors[0]?.message}`);
  const id = captured.result.id;
  const reviewed = await runMemoryReview(root, {
    decide: id,
    promote: true,
    note: "现状基线陈述",
    reclassifyBucket: "TRUTH",
    reclassifyMemoryClass: "TRUTH",
    actor: "human:owner",
  });
  if (!reviewed.ok) throw new Error(`seed review failed: ${JSON.stringify(reviewed.errors)}`);
  const promoted = await runMemoryPromote(root, { id, actor: "human:owner" });
  if (!promoted.ok) throw new Error(`seed promote failed: ${JSON.stringify(promoted.errors)}`);
  return id;
}

/** Conflict 素材候选（schema 18 十键；conflicts ≥2 refs——矛盾至少两方）。 */
function conflictCandidate() {
  return {
    decision_id: "DECISION.D017",
    class: "SCOPE",
    prompt: "当前 Increment 是否包含跨车型成本比较？",
    depends_on: [] as string[],
    affects: ["CAPABILITY.CROSS_MODEL_COMPARE"],
    grounding: {
      intent_refs: ["DISCOVERY.INTENT.001"],
      truth_refs: ["CAPABILITY.COST_ANALYSIS"],
      contract_refs: [],
      architecture_refs: [],
      implementation_refs: [],
      evidence_refs: [],
      knowledge_refs: [],
      research_finding_refs: [],
      conflicts: [
        { statement: "BP 要跨车型、Prototype 只验证了单车型", refs: ["BP.COST", "PROTO.COST"] },
      ],
      missing_facts: [],
    },
    options: ["INCLUDE_CURRENT_INCREMENT", "DEFER"],
    recommendation: {
      option: "DEFER",
      basis_refs: ["CAPABILITY.COST_ANALYSIS"],
      rationale: "当前价值可由单车型交付。",
      tradeoff: "延后跨车型价值。",
      uncertainty: "匹配语义未定。",
      source: "PROJECT_GROUNDED",
    },
    authority: { owner: "BUSINESS_OWNER" },
  };
}

function writeDecisionGraphSidecar(padId: string, graph: unknown): void {
  const padDir = join(root, ".pomaster", "discovery", "scratchpads", padId);
  mkdirSync(padDir, { recursive: true });
  writeFileSync(join(padDir, "decision-graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

async function seedConflictGraph(padId = "pad-conflict"): Promise<string> {
  const outcome = buildDecisionGraph([conflictCandidate()]);
  if (!outcome.ok) throw new Error(`seed graph failed: ${outcome.reason}`);
  writeDecisionGraphSidecar(padId, outcome.graph);
  return "DECISION.D017";
}

/** seed：gate blocked verdict（evidence/runs/GRN-n.json 最小合法记录）。 */
function seedBlockedRun(grn = "GRN-1"): void {
  const runsDir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(runsDir, `${grn}.json`),
    `${JSON.stringify({ subject_id: "PAGE.DASHBOARD", gate: "FAST", verdict: "blocked" }, null, 2)}\n`,
    "utf8",
  );
}

/** seed：production challenge / self-improvement 台账（PCH-/PSI- 内容寻址词形 fixture）。 */
function seedProductionEntries(): void {
  const challengesDir = join(root, ".pomaster", "production", "challenges");
  mkdirSync(challengesDir, { recursive: true });
  writeFileSync(
    join(challengesDir, "PCH-000000000001.json"),
    `${JSON.stringify({
      id: "PCH-000000000001",
      band_id: "BAND.P95_LATENCY",
      breach_ref: "PBR-000000000001",
      capability_ref: "CAPABILITY.GRID.EDITABLE_GRID",
      from_change: "STABLE",
      to_change: "CHALLENGED",
      reason_short: "P95 延迟击穿健康带",
      authority_ref: "PBR-000000000001",
      applied_seq: 7,
      note: null,
    }, null, 2)}\n`,
    "utf8",
  );
  const psiDir = join(root, ".pomaster", "production", "self-improvement");
  mkdirSync(psiDir, { recursive: true });
  writeFileSync(
    join(psiDir, "PSI-000000000001.json"),
    `${JSON.stringify({
      id: "PSI-000000000001",
      kind: "POMASTER_SELF_IMPROVEMENT_CANDIDATE",
      signal: "repeated_architecture_challenge",
      signal_label: "相同 Architecture Challenge 重复出现",
      note: "同类架构质疑反复出现——建议登记 reusable knowledge",
      evidence_refs: ["GRN-3"],
      reported_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
      reported_at_seq: 9,
    }, null, 2)}\n`,
    "utf8",
  );
}

// ============================================================
// view attention（§6.3 + 纠错 §19）
// ============================================================

describe("view attention（Human Attention Queue §6.3/纠错 §19）", () => {
  it("未初始化 → NOT_INITIALIZED（禁静默投影）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-attention-bare-"));
    try {
      const outcome = await runViewAttention(bare);
      expect(outcome.ok).toBe(false);
      expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("空队列显式「无可注意力项」+ 六组逐组显式缺席（非空白假绿、不静默空组）", async () => {
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.total).toBe(0);
    expect(outcome.result.groups).toHaveLength(6);
    expect(outcome.result.markdown).toContain("无可注意力项（五类数据源全部显式空");
    const absenceLines = outcome.result.markdown.split("\n").filter((line) =>
      line.startsWith("_（无——该数据源当前无注意力项"),
    );
    expect(absenceLines).toHaveLength(6);
    // §6.3 词形映射注记在位（Production Destructive Permit 显式缺席位）。
    expect(outcome.result.markdown).toContain("Production Destructive Permit→本批无派生数据源");
  });

  it("escalate_owner 呈报位接入：条目 + Owner 裁决路标（Case N 注记在位）", async () => {
    const id = await seedEscalateOwner();
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.total).toBe(1);
    const group = outcome.result.groups.find((g) => g.kind === "ESCALATE_OWNER_PENDING");
    expect(group?.items).toHaveLength(1);
    expect(group?.items[0]?.ref).toBe(id);
    expect(group?.items[0]?.detail).toContain("TRUTH 记忆呈报 Owner 裁决");
    expect(group?.items[0]?.detail).toContain("不自动成为 Truth");
    expect(group?.items[0]?.next).toContain("pomaster maintain");
    expect(outcome.result.markdown).toContain(`\`${id}\``);
  });

  it("decision-graph CONFLICT_REVIEW 素材接入：未决冲突条目 + 外生 answer 路标；决议后退出队列", async () => {
    await seedConflictGraph();
    const first = await runViewAttention(root);
    expect(first.ok).toBe(true);
    const group = first.result.groups.find((g) => g.kind === "ASK_HUMAN_CONFLICT_REVIEW");
    expect(group?.items).toHaveLength(1);
    expect(group?.items[0]?.ref).toBe("DECISION.D017@pad-conflict");
    expect(group?.items[0]?.detail).toContain("G5 禁自行挑答案");
    expect(group?.items[0]?.next).toContain("外生 answer");

    // 决议（外生 answer ACCEPT）后素材退出队列——Group 仍显式缺席不消失。
    const sidecarPath = join(
      root, ".pomaster", "discovery", "scratchpads", "pad-conflict", "decision-graph.json",
    );
    const graph = JSON.parse(readFileSync(sidecarPath, "utf8")) as Parameters<typeof resolveDecision>[0];
    const resolved = resolveDecision(graph, { decisionId: "DECISION.D017", answer: "ACCEPT" });
    expect(resolved.ok).toBe(true);
    writeDecisionGraphSidecar("pad-conflict", resolved.ok ? resolved.graph : graph);
    const second = await runViewAttention(root);
    const secondGroup = second.result.groups.find((g) => g.kind === "ASK_HUMAN_CONFLICT_REVIEW");
    expect(secondGroup?.items).toHaveLength(0);
    expect(second.result.markdown).toContain("_（无——该数据源当前无注意力项");
  });

  it("gate blocked verdict 接入：blocked 入队；非 blocked verdict 不入队", async () => {
    seedBlockedRun("GRN-1");
    seedBlockedRun("GRN-2");
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    writeFileSync(
      join(runsDir, "GRN-3.json"),
      `${JSON.stringify({ subject_id: "PAGE.DASHBOARD", gate: "FAST", verdict: "passed" }, null, 2)}\n`,
      "utf8",
    );
    const outcome = await runViewAttention(root);
    const group = outcome.result.groups.find((g) => g.kind === "GATE_BLOCKED");
    expect(group?.items.map((item) => item.ref)).toEqual(["GRN-1", "GRN-2"]);
    expect(group?.items[0]?.detail).toContain("前置未满足");
    expect(group?.items[0]?.next).toContain("pomaster check --gates");
  });

  it("production challenges + self-improvement 接入：呈报态候选带 Owner 显式裁决路标", async () => {
    seedProductionEntries();
    const outcome = await runViewAttention(root);
    expect(outcome.result.total).toBe(2);
    const challenge = outcome.result.groups.find((g) => g.kind === "PRODUCTION_CHALLENGE");
    expect(challenge?.items[0]?.ref).toBe("PCH-000000000001");
    expect(challenge?.items[0]?.next).toContain("pomaster production diagnose");
    const psi = outcome.result.groups.find((g) => g.kind === "SELF_IMPROVEMENT_CANDIDATE");
    expect(psi?.items[0]?.ref).toBe("PSI-000000000001");
    expect(psi?.items[0]?.next).toContain("无自动应用通路");
  });

  it("exception ledger 高显著度异常接入：HARD_BLOCKER 入队；ASSUMPTION 不入队（非不可外包判断）", async () => {
    const blocker = await runLedgerRecord(root, {
      classification: "HARD_BLOCKER",
      statement: "报表数据源契约不存在",
      actor: "agent:claude/session-93",
    });
    expect(blocker.ok).toBe(true);
    await runLedgerRecord(root, {
      classification: "ASSUMPTION",
      statement: "12 列栅格假设推进",
      actor: "human:owner",
    });
    const outcome = await runViewAttention(root);
    const group = outcome.result.groups.find((g) => g.kind === "EXCEPTION_BLOCKER");
    expect(group?.items).toHaveLength(1);
    expect(group?.items[0]?.detail).toContain("[HARD_BLOCKER]");
    expect(outcome.result.markdown).not.toContain("12 列栅格假设推进");
  });

  it("全源在场：五类数据源同屏分组 + 每条目带下一步路标", async () => {
    await seedEscalateOwner();
    await seedConflictGraph();
    seedBlockedRun();
    seedProductionEntries();
    await runLedgerRecord(root, {
      classification: "CONFLICT",
      statement: "两份契约对同一字段语义冲突",
      actor: "human:owner",
    });
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.total).toBe(6);
    for (const group of outcome.result.groups) {
      expect(group.items.length, `${group.kind} 应有条目`).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.next.length, `${item.ref} 应带处置路标`).toBeGreaterThan(0);
      }
    }
  });

  it("decision-graph sidecar 损坏 → SCHEMA_INVALID fail-closed（禁把素材面不可读呈现成无冲突）", async () => {
    const padDir = join(root, ".pomaster", "discovery", "scratchpads", "pad-broken");
    mkdirSync(padDir, { recursive: true });
    writeFileSync(join(padDir, "decision-graph.json"), "{broken", "utf8");
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("decision-graph sidecar");
  });

  it("decision-graph sidecar 节点级畸形（decisions 含非对象）→ SCHEMA_INVALID fail-closed（畸形节点不静默出队）", async () => {
    writeDecisionGraphSidecar("pad-node-broken", { decisions: [{ decision_id: "DECISION.OK" }, "DEFER"] });
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("非对象节点");
  });

  it("resolution 形态异（非对象非 null）按未决入队——与 view decision 呈现 OPEN 同源不旁断已决", async () => {
    const built = buildDecisionGraph([conflictCandidate()]);
    if (!built.ok) throw new Error(`fixture build 失败：${built.reason}`);
    const tainted = { ...built.graph, decisions: [{ ...built.graph.decisions[0], resolution: "ACCEPT" }] };
    writeDecisionGraphSidecar("pad-tainted-resolution", tainted);
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(true);
    const group = outcome.result.groups.find((g) => g.kind === "ASK_HUMAN_CONFLICT_REVIEW");
    expect(group?.items).toHaveLength(1);
    expect(group?.items[0]?.ref).toBe("DECISION.D017@pad-tainted-resolution");
  });

  it("exception-ledger 损坏 → SCHEMA_INVALID fail-closed（视图先例同语义）", async () => {
    writeFileSync(join(root, ".pomaster", "state", "exception-ledger.json"), "{broken", "utf8");
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("纯读零写入：view attention 执行前后 .pomaster 字节不变（§91.1 投影纪律测试锚）", async () => {
    await seedEscalateOwner();
    await seedConflictGraph();
    seedBlockedRun();
    seedProductionEntries();
    await runLedgerRecord(root, {
      classification: "HARD_BLOCKER",
      statement: "报表数据源契约不存在",
      actor: "agent:claude/session-93",
    });
    expect(existsSync(join(root, ".pomaster", "discovery"))).toBe(true);
    const before = snapshot();
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });
});

// ============================================================
// runCli 集成（程序面：命令注册 + §45 双输出 + 退出码）
// ============================================================

describe("runCli 集成（view attention 程序面）", () => {
  const cliEntry = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

  function run(argv: readonly string[], cwd: string): { code: number; out: string } {
    try {
      const out = execFileSync(process.execPath, [cliEntry, ...argv], { cwd, encoding: "utf8" });
      return { code: 0, out };
    } catch (error) {
      const err = error as { status?: number; stdout?: string };
      return { code: err.status ?? 1, out: err.stdout ?? "" };
    }
  }

  it("runCli --json：view attention ok 信封 + 空队列显式词形", async () => {
    const res = run(["view", "attention", "--json"], root);
    expect(res.code).toBe(0);
    const envelope = JSON.parse(res.out) as {
      command: string;
      ok: boolean;
      result: { view: string; total: number; groups: unknown[] };
    };
    expect(envelope.command).toBe("view attention");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.view).toBe("attention");
    expect(envelope.result.total).toBe(0);
    expect(envelope.result.groups).toHaveLength(6);
  }, 30000);
});
