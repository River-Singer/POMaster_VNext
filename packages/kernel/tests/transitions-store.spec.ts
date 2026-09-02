/**
 * transitions-store.spec —— 状态机转移对域（P15-L1 补量第一轮）。
 *
 * 覆盖面 = kernel 内全部真实状态转移判定行：
 * 1. store 层（applyTransaction.transition_object）的合法边 requires 语义
 *    （authority_approval / transition_record / 空 requires 三类判定）；
 * 2. 全部 25 个矩阵外 (from,to) 对在 store 层逐对拒绝（reason 与纯函数一致）；
 * 3. 同值 lifecycle 补丁是轴补丁而非迁移（不进矩阵的真实判定行）；
 * 4. 跨轴耦合断言的转移面（PROPOSED/REJECTED⇒PLANNED、MIGRATING⇒ACTIVE PERMIT、
 *    LOCKED+STABLE→CHALLENGED⇒决策引用——判 nextAxes 而非 currentAxes）;
 * 5. 无矩阵轴（confidence/evidence/change）逐值补丁合法性（v0.1 仅 lifecycle 有矩阵）;
 * 6. 同事务串联转移（bodyOverlay/row.axes 实时状态）与失败零落盘;
 * 7. 转移的伴随派生不变量（body_sha256 同步、journal 留痕、evidence_summary 不动、幂等）;
 * 8. 分母状态值域（kind 级收窄子集）与 supersede 链;
 * 9. producer 活性状态机（register 词表值域 / dead⇒runs≥1 / heartbeat 复活转移）;
 * 10. upsert 直落 lifecycle 六值域 + 非 SUPERSEDED 预登记 successor_ref;
 * 11. validateTransition 纯函数与 store 层映射的一致性细节。
 * 纪律：每条用例对应 store.ts / transitions.ts 中真实存在的判定行；禁止凑数。
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GovernanceError,
  applyTransaction,
  loadTruthIndex,
  validateTransition,
  type Store,
  type Transaction,
} from "@pomaster/kernel";
import type { LifecycleValue } from "@pomaster/kernel/src/vocab.js";
import { LIFECYCLE_VALUES } from "../src/vocab.js";
import { sha256OfCanonical } from "../src/digest.js";
import { AGENT, gid, makeStore, pageEnvelope, producerRecord, readIndex, readJournal } from "./helpers.js";

type EnvelopeOverridesLike = Record<string, unknown>;

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  void root; // 临时目录留给 OS tmp 清理（同 store.spec 纪律）
});

function txOf(ops: Transaction["ops"], authorityRef?: string): Transaction {
  return { ops, ...(authorityRef !== undefined ? { authorityRef } : {}) };
}

const upsertOp = (overrides: EnvelopeOverridesLike = {}): Transaction["ops"] => [
  { op: "upsert_object", envelope: pageEnvelope(overrides) as never },
];

/** 六状态基准轴块（满足各自的跨轴约束：PROPOSED/REJECTED⇒PLANNED）。 */
const AXES: Record<LifecycleValue, Record<string, unknown>> = {
  PROPOSED: { lifecycle: "PROPOSED", confidence: "EXPERIMENTAL", evidence: "PLANNED", change: "STABLE" },
  CURRENT: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
  SUPERSEDED: { lifecycle: "SUPERSEDED", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
  DEPRECATED: { lifecycle: "DEPRECATED", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
  RETIRED: { lifecycle: "RETIRED", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
  REJECTED: { lifecycle: "REJECTED", confidence: "EXPERIMENTAL", evidence: "PLANNED", change: "STABLE" },
};

/** 把 PAGE.DASHBOARD 种子到指定 lifecycle 状态（SUPERSEDED 先建后继 PAGE.DASHBOARD_V2）。 */
async function seedAt(from: LifecycleValue): Promise<void> {
  if (from === "SUPERSEDED") {
    await applyTransaction(store, txOf(upsertOp({ id: gid("PAGE.DASHBOARD_V2"), titleZh: "V2 后继" })));
    // A4 变严：upsert 直改 lifecycle（CURRENT→SUPERSEDED）requires transition_record，
    // 种子事务补 authorityRef（免 authorityRef 直落 SUPERSEDED 已被 kernel 拒绝）。
    await applyTransaction(store, txOf(upsertOp({
      axes: AXES.SUPERSEDED,
      successorRef: gid("PAGE.DASHBOARD_V2"),
    }), "CHANGE.SEED_SUP_000"));
    return;
  }
  await applyTransaction(store, txOf(upsertOp({ axes: AXES[from] })));
}

const transitionTo = (to: LifecycleValue, authorityRef?: string): Transaction =>
  txOf(
    [{
      op: "transition_object",
      id: gid("PAGE.DASHBOARD"),
      patch: { lifecycle: to },
      reasonShort: "状态机域测试转移",
    }],
    authorityRef,
  );

async function lifecycleOf(id: string = "PAGE.DASHBOARD"): Promise<string | undefined> {
  const index = await loadTruthIndex(store);
  return index.objects.find((row) => row.id === id)?.axes.lifecycle;
}

async function revOf(id: string = "PAGE.DASHBOARD"): Promise<number | undefined> {
  const index = await loadTruthIndex(store);
  return index.objects.find((row) => row.id === id)?.rev;
}

function errorCode(error: unknown): string {
  return error instanceof GovernanceError ? error.code : `NOT_GOVERNANCE_ERROR:${String(error)}`;
}

// ============================================================
// 1. store 层合法边 × requires 语义
// ============================================================

describe("store 层合法转移边（requires 三类判定）", () => {
  it("PROPOSED→REJECTED 带 authorityRef → 合法（边 2：authority_approval 类）", async () => {
    await seedAt("PROPOSED");
    const result = await applyTransaction(store, transitionTo("REJECTED", "DECISION.REJECT_001"));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
    expect(await lifecycleOf()).toBe("REJECTED");
  });

  it("PROPOSED→REJECTED 缺 authorityRef → EVOLUTION_REQUIRED", async () => {
    await seedAt("PROPOSED");
    const bad = await applyTransaction(store, transitionTo("REJECTED")).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("EVOLUTION_REQUIRED");
  });

  it("CURRENT→DEPRECATED 带 authorityRef → 合法（边 4：transition_record 类）", async () => {
    await seedAt("CURRENT");
    const result = await applyTransaction(store, transitionTo("DEPRECATED", "CHANGE.DEP_001"));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
    expect(await lifecycleOf()).toBe("DEPRECATED");
  });

  it("CURRENT→DEPRECATED 缺 authorityRef → EVOLUTION_REQUIRED", async () => {
    await seedAt("CURRENT");
    const bad = await applyTransaction(store, transitionTo("DEPRECATED")).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("EVOLUTION_REQUIRED");
  });

  it("DEPRECATED→RETIRED 无 authorityRef → 合法（边 5：空 requires 不强制审批）", async () => {
    await seedAt("DEPRECATED");
    const result = await applyTransaction(store, transitionTo("RETIRED"));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
    expect(await lifecycleOf()).toBe("RETIRED");
  });

  it("全链 PROPOSED→CURRENT→DEPRECATED→RETIRED：每步 rev 单调 +1、终态 RETIRED、seq 连续", async () => {
    await seedAt("PROPOSED");
    const seqs: number[] = [(await applyTransaction(store, transitionTo("CURRENT", "DECISION.A_1"))).appliedSeq];
    seqs.push((await applyTransaction(store, transitionTo("DEPRECATED", "CHANGE.D_1"))).appliedSeq);
    seqs.push((await applyTransaction(store, transitionTo("RETIRED"))).appliedSeq);
    expect(seqs).toEqual([2, 3, 4]);
    expect(await lifecycleOf()).toBe("RETIRED");
    expect(await revOf()).toBe(4);
  });
});

// ============================================================
// 2. 全部矩阵外对在 store 层逐对拒绝
// ============================================================

const LEGAL_EDGES = new Set([
  "PROPOSED>CURRENT",
  "PROPOSED>REJECTED",
  "CURRENT>SUPERSEDED",
  "CURRENT>DEPRECATED",
  "DEPRECATED>RETIRED",
]);
const ILLEGAL_PAIRS = LIFECYCLE_VALUES
  .flatMap((from) => LIFECYCLE_VALUES.map((to) => ({ from, to })))
  .filter(({ from, to }) => from !== to && !LEGAL_EDGES.has(`${from}>${to}`));

describe("store 层拒绝全部矩阵外 (from,to) 对（25 对，reason 与纯函数一致）", () => {
  it.each(ILLEGAL_PAIRS)("$from→$to → TRANSITION_ILLEGAL 且 details.reason=transition_not_in_matrix", async ({ from, to }) => {
    await seedAt(from);
    const bad = await applyTransaction(store, transitionTo(to, "DECISION.AUTH")).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("TRANSITION_ILLEGAL");
    expect((bad as GovernanceError).details.reason).toBe("transition_not_in_matrix");
  });
});

// ============================================================
// 3. 同值补丁是轴补丁而非迁移 + 词表外 patch 值逐轴
// ============================================================

describe("同值 lifecycle 补丁与词表外 patch 值", () => {
  it("CURRENT 对象 patch lifecycle=CURRENT（同值）→ 轴补丁非迁移：不走矩阵、成功应用 rev+1", async () => {
    await seedAt("CURRENT");
    const result = await applyTransaction(store, transitionTo("CURRENT"));
    expect(result.shortCircuited).toBe(false);
    expect(await revOf()).toBe(2);
    expect(await lifecycleOf()).toBe("CURRENT");
  });

  it("PROPOSED 对象 patch lifecycle=PROPOSED（同值）→ 同上（self-loop 只对显式迁移判非法）", async () => {
    await seedAt("PROPOSED");
    const result = await applyTransaction(store, transitionTo("PROPOSED"));
    expect(result.shortCircuited).toBe(false);
    expect(await revOf()).toBe(2);
  });

  it("patch.lifecycle 词表外值（ACCEPTED）→ VOCAB_INVALID_VALUE（store 层词表防线先于矩阵）", async () => {
    await seedAt("CURRENT");
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "ACCEPTED" } as never, reasonShort: "x" },
    ])).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });

  it("patch.confidence 词表外值 → VOCAB_INVALID_VALUE", async () => {
    await seedAt("CURRENT");
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { confidence: "SURE_THING" } as never, reasonShort: "x" },
    ])).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });

  it("patch.evidence 词表外值 → VOCAB_INVALID_VALUE", async () => {
    await seedAt("CURRENT");
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { evidence: "PROVEN" } as never, reasonShort: "x" },
    ])).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });

  it("patch.change 词表外值 → VOCAB_INVALID_VALUE", async () => {
    await seedAt("CURRENT");
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "FROZEN" } as never, reasonShort: "x" },
    ])).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });
});

// ============================================================
// 4. requires 判定的边界与顺序
// ============================================================

describe("requires 审批判定的边界与顺序", () => {
  it("authorityRef 空串视同缺失 → EVOLUTION_REQUIRED（length===0 判定行）", async () => {
    await seedAt("CURRENT");
    const bad = await applyTransaction(store, transitionTo("DEPRECATED", "")).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("EVOLUTION_REQUIRED");
  });

  it("CURRENT→SUPERSEDED 既缺 authorityRef 又缺 successor_ref → 报 EVOLUTION_REQUIRED（requires 检查先于 successor 检查）", async () => {
    await seedAt("CURRENT");
    const bad = await applyTransaction(store, transitionTo("SUPERSEDED")).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("EVOLUTION_REQUIRED");
  });

  it("CURRENT→SUPERSEDED 已预登记 successor_ref 但缺 authorityRef → EVOLUTION_REQUIRED（顺序反面）", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, txOf(upsertOp({ successorRef: gid("PAGE.DASHBOARD_V2") })));
    const bad = await applyTransaction(store, transitionTo("SUPERSEDED")).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("EVOLUTION_REQUIRED");
  });
});

// ============================================================
// 5. 跨轴耦合断言（转移面）
// ============================================================

describe("跨轴耦合断言（transfer 面，判 nextAxes）", () => {
  it("PROPOSED 对象 patch evidence=IMPLEMENTED → CROSS_AXIS_ASSERTION", async () => {
    await seedAt("PROPOSED");
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { evidence: "IMPLEMENTED" }, reasonShort: "x" },
    ])).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("CROSS_AXIS_ASSERTION");
  });

  it("REJECTED 对象 patch evidence=VERIFIED → CROSS_AXIS_ASSERTION（REJECTED 同约束）", async () => {
    await seedAt("REJECTED");
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { evidence: "VERIFIED" }, reasonShort: "x" },
    ])).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("CROSS_AXIS_ASSERTION");
  });

  it("PROPOSED→CURRENT 同事务抬 evidence=IMPLEMENTED → 合法（断言判 nextAxes：转出 PROPOSED 即放行）", async () => {
    await seedAt("PROPOSED");
    const result = await applyTransaction(store, txOf([
      {
        op: "transition_object",
        id: gid("PAGE.DASHBOARD"),
        patch: { lifecycle: "CURRENT", evidence: "IMPLEMENTED" },
        reasonShort: "审批并落实现证据",
      },
    ], "DECISION.A_2"));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.axes).toMatchObject({ lifecycle: "CURRENT", evidence: "IMPLEMENTED" });
  });

  it("CURRENT→SUPERSEDED 同事务 patch evidence=VERIFIED → 合法（CURRENT 系无 evidence 约束）", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, txOf(upsertOp({ successorRef: gid("PAGE.DASHBOARD_V2") })));
    await applyTransaction(store, txOf(upsertOp({ id: gid("PAGE.DASHBOARD_V2"), titleZh: "V2 后继" })));
    const result = await applyTransaction(store, txOf([
      {
        op: "transition_object",
        id: gid("PAGE.DASHBOARD"),
        patch: { lifecycle: "SUPERSEDED", evidence: "VERIFIED" },
        reasonShort: "被替代且证据已验证",
      },
    ], "CHANGE.SUP_001"));
    const index = await loadTruthIndex(store);
    const row = index.objects.find((candidate) => candidate.id === "PAGE.DASHBOARD");
    expect(row?.axes).toMatchObject({ lifecycle: "SUPERSEDED", evidence: "VERIFIED" });
    void result;
  });

  it("patch change=MIGRATING 而 permits_active 为空 → CROSS_AXIS_ASSERTION（transfer 面）", async () => {
    await seedAt("CURRENT");
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "MIGRATING" }, reasonShort: "x" },
    ])).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("CROSS_AXIS_ASSERTION");
  });

  it("upsert 直接 MIGRATING + permits_active 非空 → 合法落盘（upsert 面 MIGRATING 放行分支）", async () => {
    await applyTransaction(store, txOf(upsertOp({
      axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "MIGRATING" },
      permitsActive: ["PERMIT.MIG_001"],
    })));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.axes.change).toBe("MIGRATING");
    expect(index.objects[0]?.permitsActive).toEqual(["PERMIT.MIG_001"]);
  });

  it("预置 permits_active 的对象 patch change=MIGRATING → 合法", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, txOf(upsertOp({ permitsActive: ["PERMIT.MIG_002"] })));
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "MIGRATING" }, reasonShort: "迁移中" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
  });

  it("PROVISIONAL+STABLE patch change=CHALLENGED 无 authorityRef → 合法（LOCKED 条件不触发）", async () => {
    await seedAt("CURRENT");
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "CHALLENGED" }, reasonShort: "挑战" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
  });

  it("UNRESOLVED+STABLE patch change=CHALLENGED 无 authorityRef → 合法（四 confidence 值中仅 LOCKED 设门）", async () => {
    await applyTransaction(store, txOf(upsertOp({
      axes: { lifecycle: "CURRENT", confidence: "UNRESOLVED", evidence: "IMPLEMENTED", change: "STABLE" },
    })));
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "CHALLENGED" }, reasonShort: "挑战" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
  });

  it("LOCKED+STABLE patch change=MIGRATING（带 permit、无 authorityRef）→ 合法（LOCKED 门只对 CHALLENGED）", async () => {
    await applyTransaction(store, txOf(upsertOp({
      axes: { lifecycle: "CURRENT", confidence: "LOCKED", evidence: "IMPLEMENTED", change: "STABLE" },
      permitsActive: ["PERMIT.MIG_003"],
    })));
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "MIGRATING" }, reasonShort: "锁定态迁移" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
  });

  it("MIGRATING patch 回 STABLE → 合法（撤迁移不查 permit：断言只看 nextAxes）", async () => {
    await applyTransaction(store, txOf(upsertOp({
      axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "MIGRATING" },
      permitsActive: ["PERMIT.MIG_004"],
    })));
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "STABLE" }, reasonShort: "迁移完成" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.axes.change).toBe("STABLE");
  });

  it("转移不改 evidence 轴：CURRENT→DEPRECATED 后 evidence 保持原值（轴正交性）", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, transitionTo("DEPRECATED", "CHANGE.D_2"));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.axes).toMatchObject({ lifecycle: "DEPRECATED", evidence: "IMPLEMENTED" });
  });
});

// ============================================================
// 6. 无矩阵轴补丁逐值（v0.1 仅 lifecycle 有矩阵）
// ============================================================

describe("无矩阵轴逐值补丁（confidence/evidence/change）", () => {
  it.each([
    "UNRESOLVED",
    "EXPERIMENTAL",
    "PROVISIONAL",
    "LOCKED",
  ] as const)("patch confidence=%s → 合法落盘", async (value) => {
    await seedAt("CURRENT");
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { confidence: value }, reasonShort: "x" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.axes.confidence).toBe(value);
  });

  it.each([
    "PLANNED",
    "IMPLEMENTED",
    "VERIFIED",
  ] as const)("patch evidence=%s（lifecycle=CURRENT）→ 合法落盘", async (value) => {
    await seedAt("CURRENT");
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { evidence: value }, reasonShort: "x" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.axes.evidence).toBe(value);
  });

  it("patch change=STABLE（同值）→ 合法", async () => {
    await seedAt("CURRENT");
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "STABLE" }, reasonShort: "x" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
  });

  it("patch change=CHALLENGED（PROVISIONAL）→ 合法", async () => {
    await seedAt("CURRENT");
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "CHALLENGED" }, reasonShort: "x" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
  });

  it("patch change=MIGRATING（带 permit）→ 合法", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, txOf(upsertOp({ permitsActive: ["PERMIT.MIG_005"] })));
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "MIGRATING" }, reasonShort: "x" },
    ]));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
  });
});

// ============================================================
// 7. 同事务串联转移（overlay 实时状态）
// ============================================================

describe("同事务串联转移（bodyOverlay / row.axes 实时状态）", () => {
  it("同事务 upsert(PROPOSED) + transition(→CURRENT) → 成功（overlay 读到未落盘正文）", async () => {
    const result = await applyTransaction(store, txOf([
      ...upsertOp({ axes: AXES.PROPOSED }),
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "CURRENT" }, reasonShort: "x" },
    ], "DECISION.A_3"));
    expect(result.appliedSeq).toBe(1);
    expect(await lifecycleOf()).toBe("CURRENT");
    expect(await revOf()).toBe(2);
  });

  it("同事务两步串联 PROPOSED→CURRENT→DEPRECATED → 终态 DEPRECATED、rev=3（row.axes 实时更新）", async () => {
    await applyTransaction(store, txOf([
      ...upsertOp({ axes: AXES.PROPOSED }),
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "CURRENT" }, reasonShort: "x" },
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "DEPRECATED" }, reasonShort: "x" },
    ], "CHANGE.CHAIN_001"));
    expect(await lifecycleOf()).toBe("DEPRECATED");
    expect(await revOf()).toBe(3);
  });

  it("同事务串联至 SUPERSEDED 缺 successor_ref → SUCCESSOR_REQUIRED 且整体零落盘", async () => {
    const bad = await applyTransaction(store, txOf([
      ...upsertOp({ axes: AXES.PROPOSED }),
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "CURRENT" }, reasonShort: "x" },
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "SUPERSEDED" }, reasonShort: "x" },
    ], "CHANGE.CHAIN_002")).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("SUCCESSOR_REQUIRED");
    expect(readIndex(root).objects).toEqual([]);
    expect(existsSync(join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json"))).toBe(false);
  });

  it("同事务串联撞矩阵（PROPOSED→SUPERSEDED）→ TRANSITION_ILLEGAL 且 upsert 一并回滚（零落盘）", async () => {
    const bad = await applyTransaction(store, txOf([
      ...upsertOp({ axes: AXES.PROPOSED }),
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "SUPERSEDED" }, reasonShort: "x" },
    ], "CHANGE.CHAIN_003")).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("TRANSITION_ILLEGAL");
    expect(readIndex(root).objects).toEqual([]);
    expect(readJournal(root)).toBe("");
  });

  it("同事务 transition + upsert 同对象 → rev 三跳（转移 rev2、upsert 基于行现值 rev3）", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "DEPRECATED" }, reasonShort: "x" },
      { op: "upsert_object", envelope: pageEnvelope({ axes: AXES.DEPRECATED, titleZh: "仪表盘（已废弃）" }) as never },
    ], "CHANGE.CHAIN_004"));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]).toMatchObject({ rev: 3, titleZh: "仪表盘（已废弃）" });
  });
});

// ============================================================
// 8. 转移的伴随派生不变量
// ============================================================

describe("转移的派生不变量（哈希同步 / journal / 证据计数 / 幂等）", () => {
  it("转移后行 body_sha256 == 正文 canonical 摘要（转移重写正文后行哈希同步）", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, transitionTo("DEPRECATED", "CHANGE.D_3"));
    const bodyPath = join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json");
    const actual = sha256OfCanonical(JSON.parse(readFileSync(bodyPath, "utf8")) as unknown);
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.bodySha256).toBe(actual);
  });

  it("转移事件 journal 留痕：ops 含 transition_object、changed_object_ids 含对象", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, transitionTo("DEPRECATED", "CHANGE.D_4"));
    const journal = readJournal(root);
    expect(journal).toContain('"transition_object"');
    expect(journal).toContain("PAGE.DASHBOARD");
    expect(journal).toContain("CHANGE.D_4");
  });

  it("转移不动证据计数：record_claim 后转移，evidence_summary.claims 保持 1", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, txOf([{
      op: "record_claim",
      claim: {
        clm: "CLM-9001",
        subjectId: gid("PAGE.DASHBOARD"),
        assertion: "页面存在",
        assertedBy: AGENT,
      },
    }]));
    await applyTransaction(store, transitionTo("DEPRECATED", "CHANGE.D_5"));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.evidenceSummary).toMatchObject({ claims: 1, unverified: 1 });
  });

  it("转移后同内容 upsert → 幂等短路（rev 不空转，保持 2）", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, transitionTo("DEPRECATED", "CHANGE.D_6"));
    const result = await applyTransaction(store, txOf(upsertOp({ axes: AXES.DEPRECATED })));
    expect(result.shortCircuited).toBe(true);
    expect(await revOf()).toBe(2);
  });

  it("转移后不同内容 upsert → rev 继续单调（3）", async () => {
    await seedAt("CURRENT");
    await applyTransaction(store, transitionTo("DEPRECATED", "CHANGE.D_7"));
    await applyTransaction(store, txOf(upsertOp({ axes: AXES.DEPRECATED, titleZh: "仪表盘 v2" })));
    expect(await revOf()).toBe(3);
  });

  it("转移时正文文件缺失 → REF_INTEGRITY_VIOLATION（A1 成对存在判定行）", async () => {
    await seedAt("CURRENT");
    rmSync(join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json"));
    const bad = await applyTransaction(store, transitionTo("DEPRECATED", "CHANGE.D_8")).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("REF_INTEGRITY_VIOLATION");
  });
});

// ============================================================
// 9. 分母状态值域与 supersede 链
// ============================================================

function denominatorBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: gid("DENOMINATOR.PAGE.V1_SURFACE"),
    version: 1,
    membersCount: 2,
    memberSelector: { viaBindingTable: "KEYBINDING.PAGE.V1" },
    successorOf: [],
    authority: { owner: "BUSINESS_OWNER" },
    status: "CURRENT",
    ...overrides,
  };
}
const denomOp = (entry: Record<string, unknown>): Transaction["ops"] => [
  { op: "append_denominator", entry: denominatorBase(entry) as never },
];

describe("分母状态值域（kind 级收窄子集）与 supersede 链", () => {
  it("status=DEPRECATED → VOCAB_INVALID_VALUE（收窄子集封死删除路径）", async () => {
    const bad = await applyTransaction(store, txOf(denomOp({ status: "DEPRECATED" }))).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });

  it("status=RETIRED → VOCAB_INVALID_VALUE", async () => {
    const bad = await applyTransaction(store, txOf(denomOp({ status: "RETIRED" }))).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });

  it("status=PROPOSED → 合法落盘（子集三值之一）", async () => {
    const result = await applyTransaction(store, txOf(denomOp({ status: "PROPOSED" })));
    expect(result.shortCircuited).toBe(false);
    const index = await loadTruthIndex(store);
    expect(index.denominators[0]?.status).toBe("PROPOSED");
  });

  it("status=SUPERSEDED 带 successorRef → 合法且 successor_ref 落盘", async () => {
    await applyTransaction(store, txOf(denomOp({ status: "PROPOSED" })));
    await applyTransaction(store, txOf(denomOp({ id: gid("DENOMINATOR.PAGE.V2_SURFACE"), version: 1, status: "CURRENT" })));
    await applyTransaction(store, txOf(denomOp({
      version: 2,
      status: "SUPERSEDED",
      successorRef: gid("DENOMINATOR.PAGE.V2_SURFACE"),
    })));
    const index = await loadTruthIndex(store);
    const superseded = index.denominators.find(
      (entry) => entry.id === "DENOMINATOR.PAGE.V1_SURFACE" && entry.version === 2,
    );
    expect(superseded?.status).toBe("SUPERSEDED");
    expect(superseded?.successorRef).toBe("DENOMINATOR.PAGE.V2_SURFACE");
    expect(index.denominators).toHaveLength(3);
  });

  it("successor_of 含词形合法但不存在的 id → 追加成功（文法校验 only，存在性归后续 REF_INTEGRITY 全量）", async () => {
    const result = await applyTransaction(store, txOf(denomOp({
      successorOf: [gid("DENOMINATOR.LEGACY.OLD")],
    })));
    expect(result.shortCircuited).toBe(false);
  });
});

// ============================================================
// 10. producer 活性状态机
// ============================================================

describe("producer 活性状态机（liveness 值域 / dead 约束 / heartbeat 复活）", () => {
  it("liveness.status=stale → 合法注册（三值域补测）", async () => {
    const result = await applyTransaction(store, txOf([{
      op: "register_producer",
      record: producerRecord({ liveness: { status: "stale", runsSinceLastOutput: 2, lastOutputSeq: 1 } }) as never,
    }]));
    expect(result.shortCircuited).toBe(false);
    const index = await loadTruthIndex(store);
    expect(index.producers[0]?.liveness.status).toBe("stale");
  });

  it("liveness.status=dead 且 runs=3 → 合法（dead⇒runs≥1 满足）", async () => {
    await applyTransaction(store, txOf([{
      op: "register_producer",
      record: producerRecord({ liveness: { status: "dead", runsSinceLastOutput: 3, lastOutputSeq: 1 } }) as never,
    }]));
    const index = await loadTruthIndex(store);
    expect(index.producers[0]?.liveness.status).toBe("dead");
  });

  it("dead producer → health.dead_producers 派生含其 id（finalizeHealth 派生行）", async () => {
    await applyTransaction(store, txOf([{
      op: "register_producer",
      record: producerRecord({ producerId: "prod.dead_compiler", liveness: { status: "dead", runsSinceLastOutput: 4, lastOutputSeq: 1 } }) as never,
    }]));
    const index = await loadTruthIndex(store);
    expect(index.health.deadProducers).toEqual(["prod.dead_compiler"]);
  });

  it("heartbeat 使 dead producer 复活：status→active、runs→0、lastOutputSeq=appliedSeq（活性复位转移）", async () => {
    await applyTransaction(store, txOf([{
      op: "register_producer",
      record: producerRecord({ liveness: { status: "dead", runsSinceLastOutput: 2, lastOutputSeq: 1 } }) as never,
    }]));
    const result = await applyTransaction(store, txOf([{
      op: "heartbeat",
      producerId: "prod.demo_compiler",
      wroteObjectIds: [gid("PAGE.DASHBOARD")],
    }]));
    const index = await loadTruthIndex(store);
    expect(index.producers[0]?.liveness).toMatchObject({
      status: "active",
      runsSinceLastOutput: 0,
      lastOutputSeq: result.appliedSeq,
    });
  });

  it("heartbeat 指向未注册 producer → OBJECT_NOT_FOUND（活性对账以注册表为分母）", async () => {
    const bad = await applyTransaction(store, txOf([{
      op: "heartbeat",
      producerId: "prod.ghost",
      wroteObjectIds: [],
    }])).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("OBJECT_NOT_FOUND");
  });

  it("heartbeat wroteObjectIds 含文法非法 id → GovernanceError（FATAL_* 包装）", async () => {
    await applyTransaction(store, txOf([{ op: "register_producer", record: producerRecord() as never }]));
    const bad = await applyTransaction(store, txOf([{
      op: "heartbeat",
      producerId: "prod.demo_compiler",
      wroteObjectIds: ["not-a-governed-id"],
    }])).catch((e: unknown) => e);
    expect(errorCode(bad)).toMatch(/^FATAL_/);
  });

  it("liveness 缺 status → VOCAB_INVALID_VALUE（运行时词表防线兜 JS 直调）", async () => {
    const bad = await applyTransaction(store, txOf([{
      op: "register_producer",
      record: producerRecord({ liveness: { runsSinceLastOutput: 0, lastOutputSeq: 0 } }) as never,
    }])).catch((e: unknown) => e);
    expect(errorCode(bad)).toBe("VOCAB_INVALID_VALUE");
  });
});

// ============================================================
// 11. upsert 直落 lifecycle 六值域 + successor_ref 预登记
// ============================================================

describe("upsert 直落 lifecycle 值域与 successor_ref 预登记", () => {
  it("upsert lifecycle=PROPOSED（evidence=PLANNED）→ 合法落盘", async () => {
    await applyTransaction(store, txOf(upsertOp({ axes: AXES.PROPOSED })));
    expect(await lifecycleOf()).toBe("PROPOSED");
  });

  it("upsert lifecycle=REJECTED（evidence=PLANNED）→ 合法落盘", async () => {
    await applyTransaction(store, txOf(upsertOp({ axes: AXES.REJECTED })));
    expect(await lifecycleOf()).toBe("REJECTED");
  });

  it("upsert lifecycle=DEPRECATED → 合法落盘（非 SUPERSEDED 无 successor 约束）", async () => {
    await applyTransaction(store, txOf(upsertOp({ axes: AXES.DEPRECATED })));
    expect(await lifecycleOf()).toBe("DEPRECATED");
  });

  it("upsert lifecycle=RETIRED → 合法落盘", async () => {
    await applyTransaction(store, txOf(upsertOp({ axes: AXES.RETIRED })));
    expect(await lifecycleOf()).toBe("RETIRED");
  });

  it("非 SUPERSEDED 对象带 successorRef upsert → 预登记落盘（迁移前置：先挂后继再转移）", async () => {
    await applyTransaction(store, txOf(upsertOp({ id: gid("PAGE.DASHBOARD_V2"), titleZh: "V2 后继" })));
    await applyTransaction(store, txOf(upsertOp({ successorRef: gid("PAGE.DASHBOARD_V2") })));
    const bodyPath = join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json");
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as Record<string, unknown>;
    expect(body.successor_ref).toBe("PAGE.DASHBOARD_V2");
  });
});

// ============================================================
// 12. validateTransition 纯函数与 store 层映射一致性
// ============================================================

describe("validateTransition 映射一致性（requires/grace/notes/词表精确匹配）", () => {
  it("PROPOSED→REJECTED gracePolicyConfig=false（仅边 5 附加 grace）", () => {
    const outcome = validateTransition("lifecycle", "PROPOSED", "REJECTED");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) expect(outcome.gracePolicyConfig).toBe(false);
  });

  it("CURRENT→DEPRECATED gracePolicyConfig=false", () => {
    const outcome = validateTransition("lifecycle", "CURRENT", "DEPRECATED");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) expect(outcome.gracePolicyConfig).toBe(false);
  });

  it("DEPRECATED→RETIRED notes 含终态注记", () => {
    const outcome = validateTransition("lifecycle", "DEPRECATED", "RETIRED");
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) expect(outcome.notes.join()).toContain("终态");
  });

  it("from/to 双未知 → unknown_from_state 优先（判定顺序行）", () => {
    const outcome = validateTransition("lifecycle", "AAA" as LifecycleValue, "BBB" as LifecycleValue);
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) expect(outcome.reason).toBe("unknown_from_state");
  });

  it("小写 \"proposed\" → unknown_from_state（词表大小写精确匹配，无 case 折叠）", () => {
    const outcome = validateTransition("lifecycle", "proposed" as LifecycleValue, "CURRENT");
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) expect(outcome.reason).toBe("unknown_from_state");
  });
});
