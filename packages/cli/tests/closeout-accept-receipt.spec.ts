/**
 * closeout-accept-receipt.spec.ts —— W1 R1-1（O-W1-1 / W0 C-4）：closeout 有效 ACCEPT
 * 回执消费闸。
 *
 * 核心语义（writeback-boundary-proposal §3 C-4 / §4）：机器验证通过 ≠ 成果已接受。
 * closeout 施断（evidence 轴 → VERIFIED，呈现词 COMPLETED）前必须存在**有效 Human
 * ACCEPT 回执**——判定式（方案 a，复用决策图 resolution，零新 canonical kind）：
 *   存在 Decision resolution answer=ACCEPT 且 outcome_binding 覆盖本 closeout 对象
 *   （task_ref 直绑 task id，或 change_ref 绑 task payload.implements_change）；
 *   绑定键缺失的 ACCEPT 不构成有效回执（B-3：Oracle 轮 ACCEPT 与成果 ACCEPT 是
 *   两次不同语义——靠绑定区分）；绑定携带 revision_fingerprint 时须与对象行
 *   body_sha256（store 事务自动维护的 canonical 内容摘要，D24）全等——内容漂移后
 *   旧 ACCEPT 失效（防「内容变了旧 ACCEPT 仍生效」）。
 *
 * 判据：
 * - a. 零回执（无决策图）→ CLOSEOUT_ACCEPT_MISSING 阻断且零写入；
 * - b. ACCEPT 无绑定键 → 拒（无效回执——Oracle 轮 ACCEPT 不冒充成果 ACCEPT）；
 * - c. 绑定 task_ref 不匹配 → 拒；
 * - d. 绑定 revision_fingerprint 与当前对象内容不符 → CLOSEOUT_ACCEPT_STALE（旧 ACCEPT 失效）；
 * - e. 绑定匹配 → 放行施断（正例；result.accept_receipt 呈现回执来源）；
 * - f. CHANGE resolution 带 task 绑定在场且无 ACCEPT → 拒（REQ-10：非 ACCEPT 决议
 *      不构成接受回执；REWORK/REJECT 场景天然无回执即阻断）；
 * - change_ref 覆盖通路（implements_change 间绑）→ 放行；
 * - 决策图损坏（JSON 不可解析）→ CLOSEOUT_ACCEPT_DAMAGED 硬阻断（损坏文件可能正是
 *   被藏起来的 ACCEPT——判卷分母内禁静默跳过，closeout 既有诚实纪律同线）。
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, sha256OfCanonical } from "@pomaster/kernel";
import { runCloseout, type CloseoutResult } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-closeout-accept-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture（closeout.spec 同线：task + VERIFIED claim + passed run 全绿证据）
// ============================================================

async function initStore(): Promise<void> {
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

async function seedTask(overrides: { readonly implementsChange?: string } = {}): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.T0001",
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "示例任务",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证 closeout ACCEPT 回执闸",
            ...(overrides.implementsChange !== undefined ? { implements_change: overrides.implementsChange } : {}),
            acceptance: [{ criterion: "行为 X 已被独立验证", claim: "CLM-0001" }],
            class_scan_result: {
              scope: "src/shared/**",
              hits: 0,
              fixed_count: 0,
              regression_case_ref: "GRN-0001",
            },
          },
        } as never,
      },
    ],
  });
}

function claimFixture(): Record<string, unknown> {
  return {
    record_type: "claim",
    clm: "CLM-0001",
    subject: { object_id: "TASK.T0001" },
    is_fixture: false,
    assertion: "TASK_ACCEPTANCE_VERIFIED：行为 X 经独立重算确认",
    asserted_by: { actor_type: "agent", actor: "demo-builder", self_attested: true },
    evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
    verification: {
      verdict: "VERIFIED",
      method: "recompute",
      recomputed_by: { actor_type: "tool", actor: "verifier@0.1.0", self_attested: false },
      recomputed_value: { ok: true },
      delta_vs_asserted: null,
      at_seq: 3,
    },
    rev: 1,
    notes_md: null,
  };
}

function seedClaim(): void {
  const dir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "CLM-0001.json"), `${JSON.stringify(claimFixture(), null, 2)}\n`);
}

function runFixture(): Record<string, unknown> {
  return {
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
        tool: "demo:build",
        tool_version: "0.1.0",
        metric_dialect: "demo:case_count",
        ran_at_seq: 3,
        verdict: "passed",
        subject_id: "TASK.T0001",
        is_fixture: false,
        denominator_refs: [],
        counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
        blindspot: { scanned: 2, produced: 2, escape_ratio: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
        duration_ms: { self: 1, external: 0 },
      },
    },
  };
}

function seedRun(): void {
  const dir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "GRN-0001.json"), `${JSON.stringify(runFixture(), null, 2)}\n`);
}

/** 满分机器证据（DoD/gate 双绿——回执闸是施断前最后一道人工接受关）。 */
async function seedHappyEvidence(): Promise<void> {
  seedClaim();
  seedRun();
}

/** 决策图 sidecar 写入（.pomaster/discovery/scratchpads/<id>/decision-graph.json）。 */
function seedDecisionGraph(
  padId: string,
  resolutions: readonly {
    readonly decisionId: string;
    readonly answer: string;
    readonly outcomeBinding?: Record<string, unknown>;
  }[],
): void {
  const dir = join(root, ".pomaster", "discovery", "scratchpads", padId);
  mkdirSync(dir, { recursive: true });
  const graph = {
    graph_fingerprint: `sha256:${"0".repeat(64)}`,
    decisions: resolutions.map((entry) => ({
      decision_id: entry.decisionId,
      resolution: {
        answer: entry.answer,
        ...(entry.outcomeBinding !== undefined ? { outcome_binding: entry.outcomeBinding } : {}),
      },
    })),
  };
  writeFileSync(join(dir, "decision-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
}

/** 对象行 body_sha256 同口径指纹（store 事务自动维护位的测试侧复算——sha256OfCanonical(body)）。 */
function taskBodyFingerprint(): string {
  const objectsDir = join(root, ".pomaster", "truth", "objects");
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, item.name);
      if (item.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk(objectsDir);
  const hit = found.find((file) => readFileSync(file, "utf8").includes("TASK.T0001"));
  if (hit === undefined) throw new Error("task body not found");
  return sha256OfCanonical(JSON.parse(readFileSync(hit, "utf8")) as unknown);
}

function taskEvidenceAxis(): unknown {
  const objectsDir = join(root, ".pomaster", "truth", "objects");
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, item.name);
      if (item.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk(objectsDir);
  const hit = found.find((file) => readFileSync(file, "utf8").includes("TASK.T0001"));
  if (hit === undefined) throw new Error("task body not found");
  const body = JSON.parse(readFileSync(hit, "utf8")) as { axes?: Record<string, unknown> };
  return body.axes?.evidence;
}

/** .pomaster 全树字节快照（阻断零写入的对比基线）。 */
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
// 有效 ACCEPT 回执闸（W1 R1-1 / O-W1-1 / C-4）
// ============================================================

describe("closeout 有效 ACCEPT 回执闸（W1 R1-1：机器验证通过 ≠ 成果已接受）", () => {
  it("a. 全绿机器证据但零回执（无决策图）→ CLOSEOUT_ACCEPT_MISSING 阻断且零写入", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();

    const before = snapshot();
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["CLOSEOUT_ACCEPT_MISSING"]);
    // hint 带确切可用命令词形（C3 纪律）。
    expect(outcome.errors[0]?.hint).toContain("pomaster brainstorm decide");
    expect(outcome.errors[0]?.hint).toContain("--outcome-task TASK.T0001");
    const result = outcome.result as CloseoutResult;
    expect(result.blocked).toBe(true);
    expect(result.change).toBeNull();
    // 零写入：轴未被推进（evidence 仍 IMPLEMENTED）且全树字节不变。
    expect(snapshot()).toEqual(before);
    expect(taskEvidenceAxis()).toBe("IMPLEMENTED");
  });

  it("b. ACCEPT 在场但无绑定键 → 拒（Oracle 轮 ACCEPT 不冒充成果 ACCEPT——B-3 两次语义靠绑定区分）", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();
    seedDecisionGraph("idea-oracle", [
      { decisionId: "DECISION.ORACLE_SCOPE", answer: "ACCEPT" },
    ]);

    const before = snapshot();
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["CLOSEOUT_ACCEPT_MISSING"]);
    expect(snapshot()).toEqual(before);
  });

  it("c. 绑定 task_ref 不匹配（覆盖别的任务）→ 拒", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();
    seedDecisionGraph("idea-other", [
      {
        decisionId: "DECISION.OTHER_SCOPE",
        answer: "ACCEPT",
        outcomeBinding: { task_ref: "TASK.T9999" },
      },
    ]);

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["CLOSEOUT_ACCEPT_MISSING"]);
  });

  it("d. 绑定 revision_fingerprint 与当前对象内容不符 → CLOSEOUT_ACCEPT_STALE（内容漂移后旧 ACCEPT 失效）", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();
    seedDecisionGraph("idea-drift", [
      {
        decisionId: "DECISION.DRIFT_SCOPE",
        answer: "ACCEPT",
        outcomeBinding: { task_ref: "TASK.T0001", revision_fingerprint: `sha256:${"f".repeat(64)}` },
      },
    ]);

    const before = snapshot();
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["CLOSEOUT_ACCEPT_STALE"]);
    expect(outcome.errors[0]?.message).toContain("DECISION.DRIFT_SCOPE");
    expect(snapshot()).toEqual(before);
  });

  it("e. 绑定匹配（task_ref 直绑）→ 施断放行：COMPLETED + accept_receipt 呈现回执来源", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();
    seedDecisionGraph("idea-ok", [
      {
        decisionId: "DECISION.OK_SCOPE",
        answer: "ACCEPT",
        outcomeBinding: { task_ref: "TASK.T0001" },
      },
    ]);

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result as CloseoutResult;
    expect(result.blocked).toBe(false);
    expect(result.change).toBe("COMPLETED");
    expect(result.accept_receipt).toEqual({ decision_id: "DECISION.OK_SCOPE", graph: "discovery/scratchpads/idea-ok/decision-graph.json" });
    expect(taskEvidenceAxis()).toBe("VERIFIED");
  });

  it("e2. 绑定携带 revision_fingerprint 且与对象行 body_sha256 全等 → 放行（指纹口径 = store 事务自动维护位，零第二套哈希）", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();
    seedDecisionGraph("idea-fp", [
      {
        decisionId: "DECISION.FP_SCOPE",
        answer: "ACCEPT",
        outcomeBinding: { task_ref: "TASK.T0001", revision_fingerprint: taskBodyFingerprint() },
      },
    ]);

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as CloseoutResult).change).toBe("COMPLETED");
  });

  it("f. CHANGE resolution 带 task 绑定在场且无 ACCEPT → 拒（REQ-10：非 ACCEPT 决议不构成接受回执）", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();
    seedDecisionGraph("idea-rework", [
      {
        decisionId: "DECISION.REWORK_SCOPE",
        answer: "CHANGE",
        outcomeBinding: { task_ref: "TASK.T0001" },
      },
    ]);

    const before = snapshot();
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["CLOSEOUT_ACCEPT_MISSING"]);
    expect(snapshot()).toEqual(before);
  });

  it("change_ref 覆盖通路：绑定 change_ref 命中 task payload.implements_change → 放行（间绑覆盖）", async () => {
    await initStore();
    await seedTask({ implementsChange: "CHANGE.C0001" });
    await seedHappyEvidence();
    seedDecisionGraph("idea-change", [
      {
        decisionId: "DECISION.CHANGE_SCOPE",
        answer: "ACCEPT",
        outcomeBinding: { change_ref: "CHANGE.C0001" },
      },
    ]);

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as CloseoutResult).change).toBe("COMPLETED");
  });

  it("多 scratchpad 并存：非覆盖 ACCEPT 与覆盖 ACCEPT 各自判定，覆盖者放行", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();
    seedDecisionGraph("idea-a", [
      { decisionId: "DECISION.A_SCOPE", answer: "ACCEPT", outcomeBinding: { task_ref: "TASK.T9999" } },
    ]);
    seedDecisionGraph("idea-b", [
      { decisionId: "DECISION.B_SCOPE", answer: "ACCEPT", outcomeBinding: { task_ref: "TASK.T0001" } },
    ]);

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect((outcome.result as CloseoutResult).accept_receipt?.decision_id).toBe("DECISION.B_SCOPE");
  });

  it("决策图损坏（JSON 不可解析）→ CLOSEOUT_ACCEPT_DAMAGED 硬阻断（判卷分母内禁静默跳过）", async () => {
    await initStore();
    await seedTask();
    await seedHappyEvidence();
    const dir = join(root, ".pomaster", "discovery", "scratchpads", "idea-broken");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "decision-graph.json"), "{ not json");

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toContain("CLOSEOUT_ACCEPT_DAMAGED");
  });

  it("未初始化 store → NOT_INITIALIZED 先行（回执闸不越位）", async () => {
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });
});
