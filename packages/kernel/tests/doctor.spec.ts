/**
 * doctor.spec —— doctorProbes 五检（fail-closed，只读）正反例。
 * 判据：GOLDEN-L2-BOOTSTRAP-RECOVERY（五检全绿=冷启动可恢复）、C5（heartbeat 重算获胜）、
 * D 线风险备忘（本地盘假设破裂 → environment_error，禁静默）、D20 反自批（探针 5：
 * 同主体自填 VERIFIED 检出——07 x-actor-discipline 的唯一消费点）。
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  doctorProbes,
  type Store,
} from "@pomaster/kernel";
import {
  denominatorEntry,
  gid,
  makeStore,
  pageEnvelope,
  producerRecord,
} from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

function probeOf(
  report: Awaited<ReturnType<typeof doctorProbes>>,
  name: string,
): { status: string; detail: string } {
  const probe = report.probes.find((candidate) => candidate.probe === name);
  if (probe === undefined) throw new Error(`probe ${name} missing`);
  return probe;
}

function claimsDir(): string {
  return join(root, ".pomaster", "evidence", "claims");
}

/** 手写 claim 记录（kernel record_claim 恒置 UNVERIFIED——VERIFIED 只能来自手改/绕过）。 */
function writeClaimFixture(
  fileName: string,
  options: {
    assertedActor: string;
    recomputedActor: string;
    assertedActorType?: string;
    recomputedActorType?: string;
    verdict?: string;
  },
): void {
  writeFileSync(
    join(claimsDir(), fileName),
    `${JSON.stringify({
      record_type: "claim",
      clm: fileName.replace(/\.json$/, ""),
      subject: { object_id: "PAGE.DASHBOARD" },
      assertion: "断言正文（fixture）",
      asserted_by: {
        actor_type: options.assertedActorType ?? "agent",
        actor: options.assertedActor,
        self_attested: true,
      },
      evidence_refs: [],
      verification: {
        verdict: options.verdict ?? "VERIFIED",
        recomputed_by: {
          actor_type: options.recomputedActorType ?? "tool",
          actor: options.recomputedActor,
          self_attested: false,
        },
      },
      rev: 1,
    }, null, 2)}\n`,
    "utf8",
  );
}

describe("doctorProbes（契约五检）", () => {
  it("探针固定顺序与命名（vocab_lock_consistency / dead_producers_empty / alias_conflicts_empty / local_binding_probe_replayable / claim_self_approval_clean）", async () => {
    const report = await doctorProbes(store);
    expect(report.probes.map((probe) => probe.probe)).toEqual([
      "vocab_lock_consistency",
      "dead_producers_empty",
      "alias_conflicts_empty",
      "local_binding_probe_replayable",
      "claim_self_approval_clean",
    ]);
  });

  it("新建 store 五检全绿 ok=true（GOLDEN-L2-BOOTSTRAP-RECOVERY 冷启动形态）", async () => {
    const report = await doctorProbes(store);
    expect(report.ok).toBe(true);
    for (const probe of report.probes) {
      expect(probe.status).toBe("pass");
    }
  });

  it("probe1：手改 vocab 指纹 → defect 且 detail 指明失配键（枚举多头拷贝免疫）", async () => {
    const path = join(root, ".pomaster", "state", "truth-index.json");
    const raw = JSON.parse(readFileSyncOf(path) as string) as Record<string, unknown>;
    const vocabLock = raw.vocab_lock as Record<string, unknown>;
    vocabLock.prefixes = `sha256:${"11".repeat(32)}`;
    writeFileSync(path, JSON.stringify(raw, null, 2));
    const report = await doctorProbes(store);
    expect(probeOf(report, "vocab_lock_consistency").status).toBe("defect");
    expect(probeOf(report, "vocab_lock_consistency").detail).toContain("prefixes");
    expect(report.ok).toBe(false);
  });

  it("probe2：无心跳且自报 runs>0 的 producer → 重算 dead → DEFECT（fail-closed，C3）", async () => {
    await applyTransaction(store, { ops: [{
      op: "register_producer",
      record: producerRecord({
        liveness: { status: "stale", runsSinceLastOutput: 9, lastOutputSeq: 0 },
      }) as never,
    }] });
    const report = await doctorProbes(store);
    expect(probeOf(report, "dead_producers_empty").status).toBe("defect");
    expect(probeOf(report, "dead_producers_empty").detail).toContain("prod.demo_compiler");
    expect(report.ok).toBe(false);
  });

  it("probe2：自报 active+lastOutputSeq>0 但心跳侧车从未出现 → 矛盾重算 dead（C5 重算获胜）", async () => {
    await applyTransaction(store, { ops: [{
      op: "register_producer",
      record: producerRecord({
        liveness: { status: "active", runsSinceLastOutput: 0, lastOutputSeq: 42 },
      }) as never,
    }] });
    const report = await doctorProbes(store);
    expect(probeOf(report, "dead_producers_empty").status).toBe("defect");
    expect(probeOf(report, "dead_producers_empty").detail).toContain("矛盾");
  });

  it("probe2：有心跳的 producer 重算 active（自报 stale 被现实推翻）→ pass", async () => {
    await applyTransaction(store, { ops: [{ op: "register_producer", record: producerRecord() as never }] });
    await applyTransaction(store, { ops: [{ op: "heartbeat", producerId: "prod.demo_compiler", wroteObjectIds: [] }] });
    const report = await doctorProbes(store);
    expect(probeOf(report, "dead_producers_empty").status).toBe("pass");
    expect(report.ok).toBe(true);
  });

  it("probe2：刚注册（runs=0,last=0,无心跳）不判死——合法初始态（06 liveness 注记）", async () => {
    await applyTransaction(store, { ops: [{ op: "register_producer", record: producerRecord() as never }] });
    const report = await doctorProbes(store);
    expect(probeOf(report, "dead_producers_empty").status).toBe("pass");
  });

  it("probe3：两对象 normalized_key/alias 冲突 → DEFECT（GOLDEN-L1-DUP-KEY 防双登记）", async () => {
    await applyTransaction(store, { ops: [
      { op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.CONTROL.DROPDOWN"), titleZh: "下拉" }) as never },
      { op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.MASTER_DROPDOWN"), titleZh: "主下拉", aliases: ["PAGE.CONTROL.DROPDOWN"] }) as never },
    ] });
    const report = await doctorProbes(store);
    expect(probeOf(report, "alias_conflicts_empty").status).toBe("defect");
    expect(probeOf(report, "alias_conflicts_empty").detail).toContain("PAGE.CONTROL.DROPDOWN");
    expect(report.ok).toBe(false);
  });

  it("probe3：alias 指向自身对象不构成冲突（双向链正常形态）", async () => {
    await applyTransaction(store, { ops: [{
      op: "upsert_object",
      envelope: pageEnvelope({
        id: gid("CAPABILITY.GRID.EDITABLE_GRID"),
        kind: "capability",
        axisProfile: "capability_default",
        titleZh: "可编辑表格",
        aliases: ["GRID.EDITABLE_GRID"],
        payload: { canonical_realization: { component: "MasterEditableGrid" }, category: "grid" },
      }) as never,
    }] });
    const report = await doctorProbes(store);
    expect(probeOf(report, "alias_conflicts_empty").status).toBe("pass");
  });

  it("probe4：心跳侧车缺失 → environment_error（本地盘假设破裂禁静默）", async () => {
    rmHeartbeat();
    const report = await doctorProbes(store);
    expect(probeOf(report, "local_binding_probe_replayable").status).toBe("environment_error");
    expect(report.ok).toBe(false);
  });

  it("probe4：心跳行不可解析 → defect（数据损坏非环境破裂）", async () => {
    writeFileSync(join(root, ".pomaster", "runtime", "producers", "heartbeat.jsonl"), "{broken json\n");
    const report = await doctorProbes(store);
    expect(probeOf(report, "local_binding_probe_replayable").status).toBe("defect");
  });

  it("probe4：合法心跳事件可解析 → pass 且报事件数（LOCAL 探针可重放）", async () => {
    await applyTransaction(store, { ops: [{ op: "register_producer", record: producerRecord() as never }] });
    await applyTransaction(store, { ops: [{ op: "heartbeat", producerId: "prod.demo_compiler", wroteObjectIds: [gid("PAGE.DASHBOARD")] }] });
    const report = await doctorProbes(store);
    const probe = probeOf(report, "local_binding_probe_replayable");
    expect(probe.status).toBe("pass");
    expect(probe.detail).toContain("1 条事件");
  });

  it("只读纪律：doctorProbes 前后索引/侧车/台账字节不变（永不修改 store 状态）", async () => {
    await applyTransaction(store, { ops: [
      { op: "append_denominator", entry: denominatorEntry() as never },
      { op: "upsert_object", envelope: pageEnvelope() as never },
    ] });
    const indexBefore = readFileSyncOf(join(root, ".pomaster", "state", "truth-index.json"));
    const heartbeatBefore = readFileSyncOf(join(root, ".pomaster", "runtime", "producers", "heartbeat.jsonl"));
    const permitsBefore = readFileSyncOf(join(root, ".pomaster", "state", "permits.json"));
    const journalBefore = readFileSyncOf(join(root, ".pomaster", "state", "journal.jsonl"));
    await doctorProbes(store);
    expect(readFileSyncOf(join(root, ".pomaster", "state", "truth-index.json"))).toBe(indexBefore);
    expect(readFileSyncOf(join(root, ".pomaster", "runtime", "producers", "heartbeat.jsonl"))).toBe(heartbeatBefore);
    expect(readFileSyncOf(join(root, ".pomaster", "state", "permits.json"))).toBe(permitsBefore);
    expect(readFileSyncOf(join(root, ".pomaster", "state", "journal.jsonl"))).toBe(journalBefore);
  });

  it("五检中任一 defect → ok=false（fail-closed 语义，不允许部分报绿）", async () => {
    await applyTransaction(store, { ops: [{
      op: "register_producer",
      record: producerRecord({
        liveness: { status: "dead", runsSinceLastOutput: 3, lastOutputSeq: 0 },
      }) as never,
    }] });
    const report = await doctorProbes(store);
    const passCount = report.probes.filter((probe) => probe.status === "pass").length;
    expect(passCount).toBe(4);
    expect(report.ok).toBe(false);
  });
});

// ============================================================
// probe5：claim_self_approval_clean（D20 反自批——07 x-actor-discipline 唯一消费点）
// ============================================================

describe("doctorProbes probe5（claim_self_approval_clean）", () => {
  it("同主体自填 VERIFIED（手改 claim：recomputed_by==asserted_by）→ defect 且明细点名（D20）", async () => {
    writeClaimFixture("CLM-9001.json", {
      assertedActor: "claude/session-93",
      recomputedActor: "claude/session-93",
      recomputedActorType: "agent",
    });
    const report = await doctorProbes(store);
    const probe = probeOf(report, "claim_self_approval_clean");
    expect(probe.status).toBe("defect");
    expect(probe.detail).toContain("CLM-9001");
    expect(probe.detail).toContain("claude/session-93");
    expect(report.ok).toBe(false);
  });

  it("重算主体与断言主体分离（合法 VERIFIED 形态）→ pass；非 VERIFIED 判定不参与自批判定", async () => {
    writeClaimFixture("CLM-9001.json", {
      assertedActor: "claude/session-93",
      recomputedActor: "gauntlet:dom_probe@0.2.0",
    });
    writeClaimFixture("CLM-9002.json", {
      assertedActor: "claude/session-93",
      recomputedActor: "claude/session-93",
      recomputedActorType: "agent",
      verdict: "UNVERIFIED",
    });
    const report = await doctorProbes(store);
    const probe = probeOf(report, "claim_self_approval_clean");
    expect(probe.status).toBe("pass");
    expect(probe.detail).toContain("2 条 claim");
    expect(report.ok).toBe(true);
  });

  it("claim 平面损坏（手改坏 JSON）→ defect（禁静默当 clean）", async () => {
    writeFileSync(join(claimsDir(), "CLM-9003.json"), "{broken", "utf8");
    const report = await doctorProbes(store);
    const probe = probeOf(report, "claim_self_approval_clean");
    expect(probe.status).toBe("defect");
    expect(probe.detail).toContain("CLM-9003");
  });

  it("零 claim 分母 → pass 且显式注明分母 0（显式缺席非通过判定）", async () => {
    const report = await doctorProbes(store);
    const probe = probeOf(report, "claim_self_approval_clean");
    expect(probe.status).toBe("pass");
    expect(probe.detail).toContain("分母 0");
  });
});

function readFileSyncOf(path: string): string {
  return readFileSync(path, "utf8");
}

function rmHeartbeat(): void {
  rmSync(join(root, ".pomaster", "runtime", "producers", "heartbeat.jsonl"));
}
