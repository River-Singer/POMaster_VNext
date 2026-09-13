/**
 * view-review.spec.ts —— W3-S6 切片：AC-16 终审包命令面（`pomaster view review <task-id>`）。
 *
 * 需求锚：.trellis/tasks/09-12-w3-core-loop（S6）——AC-16（Human 摘要/终审包同源、
 * 可下钻、无综合分数）+ 表 A 项 18（统一命令面）；源 PRD §9 Human Review Packet 语义。
 * 与 W2 evidence/review-packet.md 的关系：人工组织版 → 本命令是其机器化（七分区同构：
 * Expected / Actual / Oracle 摘要 / Gate 记录 / ACCEPT 回执状态 / Known Unknown /
 * 三分支路标），数据源全为既有 store 平面，不自造第二事实面。
 *
 * fixture（W2 C8 同构：TASK + CLM + GRN + ACCEPT 决策图）：
 * - TASK.PACKET（task_object；payload: intent / expected_outcome / acceptance×2——
 *   一条映射 VERIFIED claim、一条未映射诚实缺口）；
 * - CLM-0001（subject=TASK，VERIFIED，evidence_refs=[GRN-0001]，独立 verifier 重算）+
 *   CLM-0002（subject=TASK，UNVERIFIED——known unknown 分母）；
 * - GRN-0001（gate BUILD，verdict passed，subject=TASK——subject 绑定 GRN 分母）；
 * - 决策图 sidecar（resolution.answer=ACCEPT + outcome_binding.task_ref=TASK——有效回执）。
 *
 * 红线断言：
 * - 纯读零写入：执行前后 .pomaster 逐文件 sha256 不变（§91.1 投影纪律测试锚）；
 * - 无 ACCEPT → accept_receipt 分支显式 missing（不冒充已接受）；
 * - 未初始化 NOT_INITIALIZED / 任务缺席 OBJECT_NOT_FOUND / 非 task_object 拒绝；
 * - 零综合分数：packet 全部为词形判定与计数，无 overall_score / confidence 百分比
 *   （§21 守护栏）；
 * - 词形（view review / review packet 分区名 / 分支词形）= SP 提案待追认。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, type Store } from "@pomaster/kernel";
import {
  runCli,
  runNegativeHistoryRecord,
  runViewReview,
  type CliEnvelope,
  type ViewReviewResult,
} from "@pomaster/cli";

let root: string;
let store: Store;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-view-review-"));
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
// fixture（W2 C8 同构：TASK + CLM×2 + GRN + ACCEPT 决策图 + negative-history）
// ============================================================

const TASK_ID = "TASK.PACKET";

async function seedTask(): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: TASK_ID,
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "组筛选切片承载任务（终审包 fixture）",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "design-tokens 页新增组筛选呈现（fixture：W2 C1 同构语义）",
            expected_outcome: "组筛选只显示所选组真值叶；UNKNOWN 占位叶只进『只看 UNKNOWN』视图",
            class_scan_result: { scope: "packages/studio/**", hits: 1, fixed_count: 1, regression_case_ref: "GRN-0001" },
            acceptance: [
              {
                criterion: "组筛选行为有回归钉测兜底（内部重构分支）",
                claim: "CLM-0001",
                requires: ["unit_behavior"],
              },
              {
                criterion: "浏览器四状态真实验证留证（显式待接线——诚实缺口）",
                claim: null,
                requires: ["ui_interaction"],
                exclusions: [{ capability: "visual_diff", basis: "W0 排除有据（无像素比对义务）" }],
              },
            ],
          },
        } as never,
      },
    ],
  });
}

function claimFixture(clm: string, verdict: string): Record<string, unknown> {
  return {
    record_type: "claim",
    clm,
    subject: { object_id: TASK_ID },
    is_fixture: false,
    assertion: `TASK_ACCEPTANCE_VERIFIED：${clm} 断言（fixture）`,
    asserted_by: { actor_type: "agent", actor: "fixture-builder", self_attested: true },
    evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
    verification: {
      verdict,
      method: "recompute",
      recomputed_by:
        verdict === "VERIFIED"
          ? { actor_type: "tool", actor: "verifier@0.1.0", self_attested: false }
          : { actor_type: "agent", actor: "fixture-builder", self_attested: true },
      recomputed_value: { ok: verdict === "VERIFIED" },
      delta_vs_asserted: null,
      at_seq: 3,
    },
    rev: 1,
    notes_md: null,
  };
}

function seedClaim(clm: string, verdict: string): void {
  const dir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${clm}.json`), `${JSON.stringify(claimFixture(clm, verdict), null, 2)}\n`);
}

function seedRun(): void {
  const dir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  const run = {
    record_type: "run",
    grn: "GRN-0001",
    ran_at_seq: 3,
    trigger: { type: "pre_closeout" },
    gate_result: {
      mode: "inline",
      result: {
        grn: "GRN-0001",
        gate: "BUILD",
        gate_def: "POLICY.GATE.BUILD@0.1.0",
        tool: "gauntlet:vitest",
        tool_version: "2.1.8",
        metric_dialect: "test:assertion_count",
        ran_at_seq: 3,
        verdict: "passed",
        subject_id: TASK_ID,
        is_fixture: false,
        denominator_refs: [],
        counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
        blindspot: { scanned: 2, produced: 2, escape_ratio: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
        duration_ms: { self: 1, external: 0 },
      },
    },
  };
  writeFileSync(join(dir, "GRN-0001.json"), `${JSON.stringify(run, null, 2)}\n`);
}

/** 决策图 sidecar（closeout-accept-receipt.spec 同款词形——resolution + outcome_binding）。 */
function seedDecisionGraph(): void {
  const dir = join(root, ".pomaster", "discovery", "scratchpads", "packet-accept");
  mkdirSync(dir, { recursive: true });
  const graph = {
    graph_fingerprint: `sha256:${"0".repeat(64)}`,
    decisions: [
      {
        decision_id: "DECISION.PACKET.ACCEPT",
        resolution: {
          answer: "ACCEPT",
          outcome_binding: { task_ref: TASK_ID },
        },
      },
    ],
  };
  writeFileSync(join(dir, "decision-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
}

/** negative-history 登记（经真实 CLI 通路——W2 S5 拍同源）。 */
async function seedNegativeHistory(): Promise<void> {
  const outcome = await runNegativeHistoryRecord(root, {
    taskRef: TASK_ID,
    approach: "在 seed 层过滤 UNKNOWN 叶",
    reason: "seed 语义值与公共分母逻辑零触碰（Steering 约束）——改走纯渲染层",
    actor: "agent:fixture",
  });
  expect(outcome.ok, `negative-history record 须成功：${JSON.stringify(outcome.errors)}`).toBe(true);
}

/** 非 task_object 在册对象（kind 闸负例——review packet 分母只服务 task_object）。 */
async function seedChangeObject(): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "CHANGE.PACKET",
          kind: "change_object",
          axisProfile: "change_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "非 task_object 负例（终审包 fixture）",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            motivation: "kind 闸负例",
            class_scan_result: { scope: "packages/studio/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" },
          },
        } as never,
      },
    ],
  });
}

/** W2 C8 同构全量摆盘（测试 1/3/5 用）。 */
async function seedFullPacketWorld(): Promise<void> {
  await seedTask();
  seedClaim("CLM-0001", "VERIFIED");
  seedClaim("CLM-0002", "UNVERIFIED");
  seedRun();
  seedDecisionGraph();
  await seedNegativeHistory();
}

/** .pomaster 全树逐文件 sha256 快照（纯读零写测试锚——diagnose-commands.spec 同款）。 */
function storeSnapshot(): Map<string, string> {
  const base = join(root, ".pomaster");
  const snapshot = new Map<string, string>();
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        snapshot.set(
          path.slice(base.length + 1),
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        );
      }
    }
  };
  if (existsSync(base)) walk(base);
  return snapshot;
}

// ============================================================
// 七分区 packet（W2 C8 同构 fixture 逐区断言）
// ============================================================

describe("view review（AC-16 终审包命令面）", () => {
  it("W2 C8 同构全量 packet：七分区逐区断言（Expected/Actual/Oracle/Gate/ACCEPT 回执/Known Unknown/三分支）", async () => {
    await seedFullPacketWorld();
    const outcome = await runViewReview(root, { task: TASK_ID });
    expect(outcome.ok, `view review 须成功：${JSON.stringify(outcome.errors)}`).toBe(true);
    const packet = outcome.result as ViewReviewResult;

    // —— 信封面 ——
    expect(packet.view).toBe("review-packet");
    expect(packet.task).toBe(TASK_ID);
    expect(packet.write_surface).toBe("none");

    // —— 1. Expected（任务验收面）——
    expect(packet.expected.intent).toBe("design-tokens 页新增组筛选呈现（fixture：W2 C1 同构语义）");
    expect(packet.expected.expected_outcome).toContain("UNKNOWN 占位叶");
    expect(packet.expected.acceptance).toHaveLength(2);
    expect(packet.expected.acceptance[0]).toMatchObject({
      index: 0,
      criterion: "组筛选行为有回归钉测兜底（内部重构分支）",
      claim: "CLM-0001",
      claim_verdict: "VERIFIED",
      satisfied: true,
    });
    expect(packet.expected.acceptance[1]).toMatchObject({
      index: 1,
      claim: null,
      claim_verdict: null,
      satisfied: null,
    });

    // —— 2. Actual（claims + verification）——
    expect(packet.actual.claims).toHaveLength(2);
    const clm1 = packet.actual.claims.find((row) => row.clm === "CLM-0001");
    expect(clm1).toMatchObject({ subject_id: TASK_ID, verdict: "VERIFIED" });
    expect(clm1?.assertion).toContain("TASK_ACCEPTANCE_VERIFIED");
    expect(packet.actual.claims_total).toBe(2);
    expect(packet.actual.verified).toBe(1);
    expect(packet.actual.unverified).toBe(1);

    // —— 3. Oracle 摘要（acceptance 资格面逐条透传）——
    expect(packet.oracle.entries).toHaveLength(2);
    expect(packet.oracle.entries[0]).toMatchObject({
      index: 0,
      criterion: "组筛选行为有回归钉测兜底（内部重构分支）",
      requires: ["unit_behavior"],
      claim: "CLM-0001",
      claim_verdict: "VERIFIED",
    });
    expect(packet.oracle.entries[0]?.exclusions).toEqual([]);
    expect(packet.oracle.entries[1]?.requires).toEqual(["ui_interaction"]);
    expect(packet.oracle.entries[1]?.exclusions).toEqual([
      { capability: "visual_diff", basis: "W0 排除有据（无像素比对义务）" },
    ]);

    // —— 4. Gate 记录（subject 绑定 GRN）——
    expect(packet.gate_records.bound_runs).toBe(1);
    expect(packet.gate_records.passed).toBe(1);
    expect(packet.gate_records.runs[0]).toMatchObject({
      grn: "GRN-0001",
      gate: "BUILD",
      verdict: "passed",
      subject_id: TASK_ID,
    });

    // —— 5. ACCEPT 回执状态（有效回执在座）——
    expect(packet.accept_receipt.status).toBe("present");
    expect(packet.accept_receipt).toMatchObject({
      decision_id: "DECISION.PACKET.ACCEPT",
      graph: "discovery/scratchpads/packet-accept/decision-graph.json",
    });

    // —— 6. Known Unknown（negative-history + unknowns）——
    expect(packet.known_unknown.negative_history).toHaveLength(1);
    expect(packet.known_unknown.negative_history[0]).toMatchObject({
      entry_index: 0,
      approach: "在 seed 层过滤 UNKNOWN 叶",
      status: "REJECTED",
    });
    expect(packet.known_unknown.negative_history[0]?.reason).toContain("Steering");
    expect(packet.known_unknown.unverified_claims).toEqual(["CLM-0002"]);
    expect(packet.known_unknown.open_questions).toEqual([]);

    // —— 7. 三分支路标（词形沿 OUTCOME_REVIEW_OPERATIONS；route 逐字透传）——
    expect(packet.branches.map((branch) => branch.branch)).toEqual(["ACCEPT", "REWORK", "REJECT"]);
    expect(packet.branches[0]?.operation).toBe("符合我的期望");
    expect(packet.branches[0]?.route).toContain("pomaster closeout");
    expect(packet.branches[1]?.route).toContain("pomaster ledger record");
    expect(packet.branches[2]?.machine_face).toContain("REQ-10");

    // —— markdown 七分区齐备（人读面同构）——
    const md = packet.markdown;
    expect(md).toContain("# Human Review Packet");
    expect(md).toContain("## 1. Expected");
    expect(md).toContain("## 2. Actual");
    expect(md).toContain("## 3. Oracle");
    expect(md).toContain("## 4. Gate");
    expect(md).toContain("## 5. ACCEPT");
    expect(md).toContain("## 6. Known Unknown");
    expect(md).toContain("## 7.");
    expect(md).toContain("review-packet.md");

    // —— §21 守护栏：零综合分数零百分比置信 ——
    expect(md).not.toMatch(/overall_score|confidence_percent|quality_score/);
    expect(JSON.stringify(packet)).not.toMatch(/overall_score|confidence_percent|quality_score/);
  });

  it("无 ACCEPT 决策图 → accept_receipt 分支显式 missing（不冒充已接受；机器绿 ≠ 已接受）", async () => {
    await seedTask();
    seedClaim("CLM-0001", "VERIFIED");
    seedRun();
    const outcome = await runViewReview(root, { task: TASK_ID });
    expect(outcome.ok).toBe(true);
    const packet = outcome.result as ViewReviewResult;
    expect(packet.accept_receipt.status).toBe("missing");
    expect(packet.accept_receipt.decision_id).toBeUndefined();
    const md = packet.markdown;
    expect(md).toContain("missing");
    expect(md).toContain("CLOSEOUT_ACCEPT_MISSING");
  });

  it("纯读零写入：执行前后 .pomaster 逐文件 sha256 不变（§91.1 投影纪律测试锚）", async () => {
    await seedFullPacketWorld();
    const before = storeSnapshot();
    expect(before.size).toBeGreaterThan(0);
    const first = await runViewReview(root, { task: TASK_ID });
    expect(first.ok).toBe(true);
    const second = await runViewReview(root, { task: TASK_ID });
    expect(second.ok).toBe(true);
    expect(storeSnapshot()).toEqual(before);
  });

  it("fail-closed：未初始化 NOT_INITIALIZED / 任务缺席 OBJECT_NOT_FOUND / 非 task_object 拒绝（零写）", async () => {
    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-view-review-bare-"));
    try {
      const bareOutcome = await runViewReview(bare, { task: TASK_ID });
      expect(bareOutcome.ok).toBe(false);
      expect(bareOutcome.errors[0]?.code).toBe("NOT_INITIALIZED");
      expect(existsSync(join(bare, ".pomaster"))).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }

    await seedTask();
    const missing = await runViewReview(root, { task: "TASK.ABSENT" });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("OBJECT_NOT_FOUND");

    await seedChangeObject();
    const notTask = await runViewReview(root, { task: "CHANGE.PACKET" });
    expect(notTask.ok).toBe(false);
    expect(notTask.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(notTask.errors[0]?.message).toContain("task_object");
  });

  it("runCli 程序面：view review <task> --json 信封回读（命令注册 + §45 双输出）", async () => {
    await seedFullPacketWorld();
    const lines: string[] = [];
    const code = await runCli(["--dir", root, "view", "review", TASK_ID, "--json"], {
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.command).toBe("view review");
    expect(envelope.ok).toBe(true);
    expect(envelope.result.view).toBe("review-packet");
    expect((envelope.result as { task: string }).task).toBe(TASK_ID);
    expect((envelope.result as { accept_receipt: { status: string } }).accept_receipt.status).toBe("present");
  });
});
