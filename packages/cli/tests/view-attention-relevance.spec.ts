/**
 * view-attention-relevance.spec.ts —— Attention Task relevance 投影（W3 FR-12/AC-14）。
 *
 * 判据锚（PRD W3 / research dependency-authority-and-routing.md §1 FR-12 行）：
 * - project/relevant/needs-human 三计数 + 依据可见；计数与来源明细可对账
 *   （project = total）；范围计算共享 collectAffectedIds（不另造第二套任务范围规则）；
 * - 保留全项目可见性（groups/total 不过滤——relevant 只加不减）；
 * - 不把 Conflict/Drift 天然全局 Block（本投影零阻断语义不变）；
 * - 无关 PROD unknown 不阻 UI 小改（范围外保守 project 保留呈现）；
 *   相关语义 unknown 不被过滤（AC-14——范围求交只标 relevant 不删条目）；
 * - 纯读零写入（§91.1；.pomaster 字节快照测试锚）。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, buildDecisionGraph, createStore } from "@pomaster/kernel";
import { runLedgerRecord, runViewAttention } from "@pomaster/cli";

let root: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-attention-relevance-"));
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
// fixture（全部为既有平面合法产物）
// ============================================================

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

async function seedObject(
  envelope: Record<string, unknown>,
): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: envelope as never }] } as never);
}

/** 任务 + CHANGE（affected_objects 拉PAGE.DASHBOARD 入范围）+ 范围内/外 PAGE。 */
async function seedTaskScope(): Promise<void> {
  await seedObject({
    id: "TASK.UI.FIX",
    kind: "task_object",
    axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "UI 小改任务",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: {
      intent: "修按钮颜色",
      implements_change: "CHANGE.UI.FIX",
      class_scan_result: { scope: "src/pages/dashboard/**", hits: 1, fixed_count: 1, regression_case_ref: "GRN-1" },
    },
  });
  await seedObject({
    id: "CHANGE.UI.FIX",
    kind: "change_object",
    axisProfile: "change_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "UI 小改变更",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: {
      affected_objects: ["PAGE.DASHBOARD"],
      class_scan_result: { scope: "src/pages/dashboard/**", hits: 1, fixed_count: 1, regression_case_ref: "GRN-1" },
    },
  });
  await seedObject({
    id: "PAGE.DASHBOARD",
    kind: "page_surface",
    axisProfile: "page_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "仪表盘",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: {},
  });
  await seedObject({
    id: "PAGE.UNRELATED",
    kind: "page_surface",
    axisProfile: "page_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "无关页",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: {},
  });
}

function seedRun(grn: string, subjectId: string, verdict: string): void {
  const runsDir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(runsDir, `${grn}.json`),
    `${JSON.stringify({ subject_id: subjectId, gate: "FAST", verdict }, null, 2)}\n`,
    "utf8",
  );
}

function seedChallenge(capabilityRef: string): void {
  const challengesDir = join(root, ".pomaster", "production", "challenges");
  mkdirSync(challengesDir, { recursive: true });
  writeFileSync(
    join(challengesDir, "PCH-000000000001.json"),
    `${JSON.stringify({
      id: "PCH-000000000001",
      band_id: "BAND.P95_LATENCY",
      breach_ref: "PBR-000000000001",
      capability_ref: capabilityRef,
      from_change: "STABLE",
      to_change: "CHALLENGED",
      reason_short: "P95 延迟击穿健康带",
      authority_ref: "PBR-000000000001",
      applied_seq: 7,
      note: null,
    }, null, 2)}\n`,
    "utf8",
  );
}

function writeDecisionGraphSidecar(padId: string, graph: unknown): void {
  const padDir = join(root, ".pomaster", "discovery", "scratchpads", padId);
  mkdirSync(padDir, { recursive: true });
  writeFileSync(join(padDir, "decision-graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

/** 相关语义 unknown：decision affects 范围内对象（AC-14——不被过滤）。 */
async function seedRelevantConflictDecision(): Promise<void> {
  const outcome = buildDecisionGraph([
    {
      decision_id: "DECISION.D100",
      class: "SCOPE",
      prompt: "仪表盘改色是否影响既有视觉规范绑定？",
      depends_on: [] as string[],
      affects: ["PAGE.DASHBOARD"],
      grounding: {
        intent_refs: ["DISCOVERY.INTENT.001"],
        truth_refs: ["PAGE.DASHBOARD"],
        contract_refs: [],
        architecture_refs: [],
        implementation_refs: [],
        evidence_refs: [],
        knowledge_refs: [],
        research_finding_refs: [],
        conflicts: [
          { statement: "规范要求主色 A、设计稿主色 B", refs: ["SPEC.COLOR", "DESIGN.COLOR"] },
        ],
        missing_facts: [],
      },
      options: ["KEEP_BINDING", "REVIEW_BINDING"],
      recommendation: {
        option: "REVIEW_BINDING",
        basis_refs: ["PAGE.DASHBOARD"],
        rationale: "色值变更可能破坏绑定。",
        tradeoff: "多一轮人工确认。",
        uncertainty: "绑定解析未定。",
        source: "PROJECT_GROUNDED",
      },
      authority: { owner: "BUSINESS_OWNER" },
    },
  ]);
  if (!outcome.ok) throw new Error(`fixture build 失败：${outcome.reason}`);
  writeDecisionGraphSidecar("pad-relevant", outcome.graph);
}

// ============================================================
// task relevance 三计数（AC-14）
// ============================================================

describe("view attention --task（W3 Task relevance 三计数；AC-14）", () => {
  it("三计数 + 依据可见：project=total（可对账）；relevant 按锚命中；needs-human 只计 Human 裁决位", async () => {
    await seedTaskScope();
    seedRun("GRN-1", "PAGE.DASHBOARD", "blocked"); // 范围内 gate blocked → relevant（非 needs-human）
    seedRun("GRN-2", "PAGE.UNRELATED", "blocked"); // 范围外 → project
    seedChallenge("CAPABILITY.GRID"); // 无关 PROD unknown → project（不阻 UI 小改）
    await seedRelevantConflictDecision(); // 相关语义 unknown → relevant + needs-human（不被过滤）
    await runLedgerRecord(root, {
      classification: "HARD_BLOCKER",
      statement: "仪表盘数据源契约不存在",
      actor: "agent:claude/session-93",
      objectRef: "PAGE.DASHBOARD",
    });
    const outcome = await runViewAttention(root, { task: "TASK.UI.FIX" });
    expect(outcome.ok).toBe(true);
    const relevance = outcome.result.task_relevance;
    expect(relevance).not.toBeNull();
    expect(relevance?.task).toBe("TASK.UI.FIX");
    // project = total（计数与来源明细可对账；全项目可见性保留）。
    expect(relevance?.project).toBe(outcome.result.total);
    // relevant：GRN-1（subject 锚）+ DECISION.D100（affects 锚）+ EXC（object_ref 锚）= 3。
    expect(relevance?.relevant).toBe(3);
    // needs-human：ledger + conflict review（gate blocked 是 agent 重跑可消，不计入）。
    expect(relevance?.needs_human).toBe(2);
    // 依据可见：逐条 ref + 命中锚。
    const basisRefs = relevance?.basis.map((entry) => entry.ref).sort() ?? [];
    expect(basisRefs).toEqual(["DECISION.D100@pad-relevant", "EXC-1", "GRN-1"]);
    const grnBasis = relevance?.basis.find((entry) => entry.ref === "GRN-1");
    expect(grnBasis?.via_anchor).toBe("PAGE.DASHBOARD");
    // 范围外计数 = project - relevant。
    expect(relevance?.out_of_scope).toBe((relevance?.project ?? 0) - (relevance?.relevant ?? 0));
  });

  it("无关 PROD unknown 不阻 UI 小改：范围外条目保留呈现（不删不滤）；本投影零阻断（ok 恒真）", async () => {
    await seedTaskScope();
    seedChallenge("CAPABILITY.GRID");
    seedRun("GRN-2", "PAGE.UNRELATED", "blocked");
    const outcome = await runViewAttention(root, { task: "TASK.UI.FIX" });
    expect(outcome.ok).toBe(true);
    const relevance = outcome.result.task_relevance;
    // 范围外条目在 groups 里原样保留（不因任务过滤丢投影）。
    const challengeGroup = outcome.result.groups.find((g) => g.kind === "PRODUCTION_CHALLENGE");
    expect(challengeGroup?.items).toHaveLength(1);
    expect(outcome.result.markdown).toContain("PCH-000000000001");
    expect(outcome.result.markdown).toContain("（project——范围外保留可见）");
    expect(relevance?.relevant).toBe(0);
    expect(relevance?.out_of_scope).toBe(2);
  });

  it("相关语义 unknown 不被过滤：范围求交只加 relevant 不删组条目（AC-14 反例腿）", async () => {
    await seedTaskScope();
    await seedRelevantConflictDecision();
    const outcome = await runViewAttention(root, { task: "TASK.UI.FIX" });
    const relevance = outcome.result.task_relevance;
    const group = outcome.result.groups.find((g) => g.kind === "ASK_HUMAN_CONFLICT_REVIEW");
    expect(group?.items).toHaveLength(1); // 组条目仍在（不过滤）
    expect(relevance?.relevant).toBe(1);
    expect(outcome.result.markdown).toContain("（relevant）");
    expect(outcome.result.markdown).toContain("Task relevance 依据");
  });

  it("任务行缺席保守合同：按任务自身 id 匹配（不猜测扩大范围；无依赖证明≠证明无影响）", async () => {
    await seedTaskScope();
    seedRun("GRN-1", "PAGE.DASHBOARD", "blocked");
    const outcome = await runViewAttention(root, { task: "TASK.GHOST" });
    expect(outcome.ok).toBe(true);
    const relevance = outcome.result.task_relevance;
    expect(relevance?.relevant).toBe(0); // GHOST 无范围申报——保守不匹配任何锚
    expect(relevance?.project).toBe(outcome.result.total);
  });

  it("--task 缺席 → task_relevance=null 显式（不冒充已判）；markdown 零 relevance 行", async () => {
    await seedTaskScope();
    const outcome = await runViewAttention(root);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.task_relevance).toBeNull();
    expect(outcome.result.markdown).not.toContain("task relevance");
  });

  it("纯读零写入：--task 投影执行前后 .pomaster 字节不变（§91.1 测试锚）", async () => {
    await seedTaskScope();
    seedRun("GRN-1", "PAGE.DASHBOARD", "blocked");
    await seedRelevantConflictDecision();
    await runLedgerRecord(root, {
      classification: "CONFLICT",
      statement: "色值规范冲突",
      actor: "human:owner",
      objectRef: "PAGE.DASHBOARD",
    });
    const before = snapshot();
    const outcome = await runViewAttention(root, { task: "TASK.UI.FIX" });
    expect(outcome.ok).toBe(true);
    expect(snapshot()).toEqual(before);
  });
});
