/**
 * permits.spec —— Permit 签发/校验/显式接管（D2/D20/C9）+ Authority Map 加载。
 * 判据：GOLDEN-L2-CONCURRENT-LOCK（TTL 过期仅手动 --steal 并记事件）、
 * ADV-D20-03（stale permit 重放拒绝）、GOLDEN-L8-2（scope expansion 拒绝静默放行）、
 * GOLDEN-L1-DENOM-NO-DELETE（DENOMINATOR 删除一律 denied）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  checkPermit,
  issuePermit,
  renewPermit,
  stealPermit,
  widenPermit,
  type Store,
} from "@pomaster/kernel";
import { AGENT, denominatorEntry, gid, HUMAN, makeStore, pageEnvelope } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

function permitsFile(): { permits: Array<Record<string, unknown>> } {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "state", "permits.json"), "utf8"),
  ) as { permits: Array<Record<string, unknown>> };
}

function journal(): string {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
}

describe("issuePermit（签发）", () => {
  it("permitRef 为 general_id 词形 PERMIT.<BASE>.<n>；TTL 缺省 168 拍（C9 映射，禁墙钟）", async () => {
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
      changeRef: "CHANGE.MIGRATION_001",
    });
    expect(permit.permitRef).toBe("PERMIT.CHANGE_MIGRATION_001.1");
    expect(permit.expiresAtSeq).toBe(168);
    expect(permit.scope).toEqual({
      subjectIds: [gid("PAGE.DASHBOARD")],
      writePolicy: "AGENT_WITH_PERMIT",
    });
  });

  it("自定义 ttlBeats：expiresAtSeq = currentSeq + ttlBeats（事件拍，A4）", async () => {
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
      ttlBeats: 5,
    });
    expect(permit.expiresAtSeq).toBe(5);
  });

  it("许可持久化到 state/permits.json + journal 记 PERMIT_ISSUED 事件（D3 事件流）", async () => {
    await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
      changeRef: "CHANGE.MIGRATION_001",
    });
    expect(permitsFile().permits).toHaveLength(1);
    expect(permitsFile().permits[0]).toMatchObject({ permit_ref: "PERMIT.CHANGE_MIGRATION_001.1", expires_at_seq: 168 });
    expect(journal()).toContain("PERMIT_ISSUED");
  });

  it("同基底再次签发 → 序号递增（确定性分配，无随机无墙钟）", async () => {
    const first = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
      changeRef: "CHANGE.MIGRATION_001",
    });
    const second = await issuePermit(store, {
      subjectIds: [gid("PAGE.SETTINGS")],
      requestedBy: HUMAN,
      changeRef: "CHANGE.MIGRATION_001",
    });
    expect(first.permitRef).toBe("PERMIT.CHANGE_MIGRATION_001.1");
    expect(second.permitRef).toBe("PERMIT.CHANGE_MIGRATION_001.2");
  });

  it("空 subjectIds / 非法 ttlBeats → SCHEMA_INVALID（无范围的许可=无意义授权）", async () => {
    await expect(
      issuePermit(store, { subjectIds: [], requestedBy: AGENT }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      issuePermit(store, { subjectIds: [gid("PAGE.DASHBOARD")], requestedBy: AGENT, ttlBeats: 0 }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

describe("checkPermit（显式四态，禁止静默）", () => {
  async function seedPermit(ttlBeats = 168): Promise<string> {
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
      ttlBeats,
    });
    return permit.permitRef;
  }

  it("范围内写 → allowed", async () => {
    const ref = await seedPermit();
    expect(await checkPermit(store, ref, { id: gid("PAGE.DASHBOARD"), op: "upsert_object" })).toEqual({ outcome: "allowed" });
  });

  it("范围外写 → denied outside_scope + hint（D20 scope expansion 拒绝静默放行）", async () => {
    const ref = await seedPermit();
    const result = await checkPermit(store, ref, { id: gid("PAGE.SETTINGS"), op: "upsert_object" });
    expect(result).toMatchObject({ outcome: "denied", reason: "outside_scope" });
    if (result.outcome === "denied") expect(result.hint).toContain("重审升级");
  });

  it("DENOMINATOR 的 delete 一律 denied delete_forbidden_supersede_only（C2/GAP-POM-001 免疫）", async () => {
    const ref = await seedPermit();
    const result = await checkPermit(store, ref, { id: gid("DENOMINATOR.PAGE.V1_SURFACE"), op: "delete" });
    expect(result).toMatchObject({ outcome: "denied", reason: "delete_forbidden_supersede_only" });
    if (result.outcome === "denied") expect(result.hint).toContain("supersede");
  });

  it("非 DENOMINATOR 的 delete → denied policy_forbidden（kernel v0 无删除通道，走 supersede）", async () => {
    const ref = await seedPermit();
    const result = await checkPermit(store, ref, { id: gid("PAGE.DASHBOARD"), op: "delete" });
    expect(result).toMatchObject({ outcome: "denied", reason: "policy_forbidden" });
  });

  it("未知许可 → unknown_permit（显式缺席，非放行）", async () => {
    expect(await checkPermit(store, "PERMIT.NOPE.9", { id: gid("PAGE.DASHBOARD"), op: "upsert_object" })).toEqual({
      outcome: "unknown_permit",
    });
  });

  it("过期（currentSeq >= expiresAtSeq）→ outcome expired + PERMIT_EXPIRED_OBSERVED 事件留痕（不静默）", async () => {
    const ref = await seedPermit(2);
    // 推进 2 拍：追加两个分母版本（合法 tx，每次 seq+1）。
    await applyTransaction(store, { ops: [{ op: "append_denominator", entry: { ...denominatorEntry(), version: 1 } as never }] });
    await applyTransaction(store, { ops: [{ op: "append_denominator", entry: { ...denominatorEntry(), version: 2 } as never }] });
    const result = await checkPermit(store, ref, { id: gid("PAGE.DASHBOARD"), op: "upsert_object" });
    expect(result).toEqual({ outcome: "expired", expiredAtSeq: 2 });
    expect(journal()).toContain("PERMIT_EXPIRED_OBSERVED");
  });

  it("V2-1 去重：同一过期许可反复判卷只记一条 PERMIT_EXPIRED_OBSERVED；判卷不改台账", async () => {
    const ref = await seedPermit(2);
    await applyTransaction(store, { ops: [{ op: "append_denominator", entry: { ...denominatorEntry(), version: 1 } as never }] });
    await applyTransaction(store, { ops: [{ op: "append_denominator", entry: { ...denominatorEntry(), version: 2 } as never }] });
    const ledgerBefore = JSON.stringify(permitsFile());
    for (let i = 0; i < 5; i += 1) {
      expect(await checkPermit(store, ref, { id: gid("PAGE.DASHBOARD"), op: "upsert_object" })).toEqual({
        outcome: "expired",
        expiredAtSeq: 2,
      });
    }
    const observed = journal()
      .split("\n")
      .filter((line) => line.includes("\"PERMIT_EXPIRED_OBSERVED\""));
    expect(observed).toHaveLength(1);
    expect(JSON.parse(observed[0] as string)).toMatchObject({ permit_ref: ref, expired_at_seq: 2, seq: 2 });
    expect(JSON.stringify(permitsFile())).toBe(ledgerBefore);
  });

  it("边界拍：currentSeq == expiresAtSeq-1 仍 allowed（边界拍前有效）", async () => {
    const ref = await seedPermit(1);
    expect(await checkPermit(store, ref, { id: gid("PAGE.DASHBOARD"), op: "transition_object" })).toEqual({
      outcome: "allowed",
    });
  });

  it("stolen 许可 → unknown_permit（permit 文件物理存在不构成放行依据，ADV-D20-03）", async () => {
    const ref = await seedPermit(1);
    await applyTransaction(store, { ops: [{ op: "append_denominator", entry: { ...denominatorEntry(), version: 1 } as never }] });
    await applyTransaction(store, { ops: [{ op: "append_denominator", entry: { ...denominatorEntry(), version: 2 } as never }] });
    await stealPermit(store, ref, HUMAN, "原持有人会话已死（16 僵尸实证）");
    expect(await checkPermit(store, ref, { id: gid("PAGE.DASHBOARD"), op: "upsert_object" })).toEqual({
      outcome: "unknown_permit",
    });
  });
});

describe("stealPermit（D2 显式接管）", () => {
  it("未过期 → rejected_not_expired（显式拒绝，自动抢占被禁止）", async () => {
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: AGENT,
      ttlBeats: 168,
    });
    const result = await stealPermit(store, permit.permitRef, HUMAN, "想提前接管");
    expect(result).toEqual({
      outcome: "rejected_not_expired",
      expiresAtSeq: 168,
      currentSeq: 0,
    });
    expect(journal()).not.toContain("PERMIT_STOLEN");
  });

  it("过期后 → stolen + PERMIT_STOLEN journal 事件（actor/reason 留痕）+ 台账 stolen 标记", async () => {
    const permit = await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: AGENT,
      ttlBeats: 1,
    });
    await applyTransaction(store, { ops: [{ op: "append_denominator", entry: { ...denominatorEntry(), version: 1 } as never }] });
    const result = await stealPermit(store, permit.permitRef, HUMAN, "僵尸会话清理");
    expect(result).toEqual({ outcome: "stolen", eventSeq: 1 });
    expect(journal()).toContain("PERMIT_STOLEN");
    expect(journal()).toContain("僵尸会话清理");
    expect(permitsFile().permits[0]).toMatchObject({
      stolen_at_seq: 1,
      stolen_by: { actor_type: "human", actor: "owner" },
    });
  });

  it("未知许可 → PERMIT_NOT_FOUND（FATAL）", async () => {
    await expect(stealPermit(store, "PERMIT.NOPE.1", HUMAN, "x")).rejects.toMatchObject({
      code: "PERMIT_NOT_FOUND",
    });
  });

  it("缺 reason → SCHEMA_INVALID（接管留痕是硬性要求）", async () => {
    const permit = await issuePermit(store, { subjectIds: [gid("PAGE.DASHBOARD")], requestedBy: AGENT, ttlBeats: 1 });
    await expect(stealPermit(store, permit.permitRef, HUMAN, "  ")).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
  });
});

describe("issuePermit 台账扩展（capability_refs / acceptance_shape / baseline；八拍设计 §1.3/§3.3）", () => {
  it("capabilityIds + acceptanceShape 落台账；journal 事件带 capability_ids（坑5：验收形状不再静默丢失）", async () => {
    await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD")],
      requestedBy: HUMAN,
      changeRef: "CHANGE.MIGRATION_001",
      capabilityIds: [gid("CAPABILITY.CSV_TOOL.SERIALIZE_ROWS")],
      acceptanceShape: { dod: ["CSV_ROUNDTRIP passed"] },
    });
    expect(permitsFile().permits[0]).toMatchObject({
      capability_refs: ["CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"],
      acceptance_shape: { dod: ["CSV_ROUNDTRIP passed"] },
    });
    const issuedLine = journal().split("\n").find((line) => line.includes("PERMIT_ISSUED"));
    expect(JSON.parse(issuedLine as string)).toMatchObject({
      capability_ids: ["CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"],
    });
  });

  it("baseline：issue 瞬间捕获（closure）；存在对象记 axes/rev/body_sha256，absent 记 null（合法基线态）", async () => {
    // 先落一个对象再签发：PAGE.DASHBOARD 有基线、PAGE.SETTINGS absent（PROPOSED 新对象）。
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }] });
    await issuePermit(store, {
      subjectIds: [gid("PAGE.DASHBOARD"), gid("PAGE.SETTINGS")],
      requestedBy: HUMAN,
    });
    const record = permitsFile().permits[0] as {
      baseline: { at_seq: number; subjects: Record<string, unknown> };
    };
    expect(record.baseline.at_seq).toBe(1);
    const dashboard = record.baseline.subjects["PAGE.DASHBOARD"] as Record<string, unknown>;
    expect(dashboard.rev).toBe(1);
    expect(dashboard.axes).toEqual({
      lifecycle: "CURRENT",
      confidence: "PROVISIONAL",
      evidence: "IMPLEMENTED",
      change: "STABLE",
    });
    expect(dashboard.body_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(record.baseline.subjects["PAGE.SETTINGS"]).toBeNull();
  });

  it("subject / capability 过 parseGovernedId closed-world 校验 → FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR（A5）", async () => {
    await expect(
      issuePermit(store, { subjectIds: ["FOO.BAR" as never], requestedBy: HUMAN }),
    ).rejects.toMatchObject({ code: "FATAL_UNKNOWN_PREFIX" });
    await expect(
      issuePermit(store, { subjectIds: ["PAGE.dashboard" as never], requestedBy: HUMAN }),
    ).rejects.toMatchObject({ code: "FATAL_ID_GRAMMAR" });
    await expect(
      issuePermit(store, {
        subjectIds: [gid("PAGE.DASHBOARD")],
        requestedBy: HUMAN,
        capabilityIds: ["NOT_A_PREFIX.X" as never],
      }),
    ).rejects.toMatchObject({ code: "FATAL_UNKNOWN_PREFIX" });
  });
});

describe("renewPermit / widenPermit（V2-2；VX-WRITE-03 / VX-WRITE-07）", () => {
  async function seed(ttlBeats = 3, subjects: readonly string[] = ["PAGE.DASHBOARD"]): Promise<string> {
    const permit = await issuePermit(store, { subjectIds: subjects.map((id) => gid(id)), requestedBy: HUMAN, ttlBeats });
    return permit.permitRef;
  }
  let version = 0;
  async function tick(times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      version += 1;
      await applyTransaction(store, { ops: [{ op: "append_denominator", entry: { ...denominatorEntry(), version } as never }] });
    }
  }
  function events(type: string): Record<string, unknown>[] {
    return journal()
      .split("\n")
      .filter((line) => line.includes(`"${type}"`))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  it("续期：expires_at_seq += beats，原本会到期的写尝试续期后 allowed；journal PERMIT_RENEWED 带 by / reason", async () => {
    const ref = await seed(3);
    await tick(2);
    const renewed = await renewPermit(store, ref, HUMAN, "长任务未完成，延长 10 拍", 10);
    expect(renewed).toEqual({ permitRef: ref, previousExpiresAtSeq: 3, expiresAtSeq: 13, eventSeq: 2 });
    await tick(2);
    expect(await checkPermit(store, ref, { id: gid("PAGE.DASHBOARD"), op: "upsert_object" })).toEqual({ outcome: "allowed" });
    expect(permitsFile().permits[0]).toMatchObject({ expires_at_seq: 13 });
    expect(events("PERMIT_RENEWED")).toEqual([
      {
        type: "PERMIT_RENEWED",
        seq: 2,
        permit_ref: ref,
        previous_expires_at_seq: 3,
        expires_at_seq: 13,
        beats: 10,
        by: { actor_type: "human", actor: "owner" },
        reason: "长任务未完成，延长 10 拍",
      },
    ]);
  });

  it("续期缺省 168 拍；beats 非正整数 / reason 空 → SCHEMA_INVALID", async () => {
    const ref = await seed(3);
    expect((await renewPermit(store, ref, HUMAN, "缺省续期")).expiresAtSeq).toBe(171);
    await expect(renewPermit(store, ref, HUMAN, "x", 0)).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(renewPermit(store, ref, HUMAN, "  ", 5)).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("到期后续期 / 扩权拒绝（PERMIT_EXPIRED + reason_code），提示走 steal；台账不变", async () => {
    const ref = await seed(1);
    await tick(1);
    const before = JSON.stringify(permitsFile());
    await expect(renewPermit(store, ref, HUMAN, "补续期", 5)).rejects.toMatchObject({
      code: "PERMIT_EXPIRED",
      details: { reason_code: "PERMIT_RENEW_EXPIRED", expires_at_seq: 1, current_seq: 1 },
    });
    await expect(widenPermit(store, ref, [gid("PAGE.SETTINGS")], HUMAN, "补扩权")).rejects.toMatchObject({
      code: "PERMIT_EXPIRED",
      details: { reason_code: "PERMIT_WIDEN_EXPIRED" },
    });
    expect(JSON.stringify(permitsFile())).toBe(before);
    expect(events("PERMIT_RENEWED")).toEqual([]);
  });

  it("已接管 / 不存在的许可 → PERMIT_NOT_FOUND", async () => {
    const ref = await seed(1);
    await tick(1);
    await stealPermit(store, ref, HUMAN, "原持有人会话已死");
    await expect(renewPermit(store, ref, HUMAN, "续期", 5)).rejects.toMatchObject({ code: "PERMIT_NOT_FOUND" });
    await expect(renewPermit(store, "PERMIT.NOPE.1", HUMAN, "续期", 5)).rejects.toMatchObject({ code: "PERMIT_NOT_FOUND" });
  });

  it("扩权：scope 只追加；新对象 allowed、旧对象照旧；新对象在扩权拍捕获基线（subject_at_seq）", async () => {
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }] });
    const ref = await seed(10, ["PAGE.SETTINGS"]);
    await tick(1);
    const result = await widenPermit(store, ref, [gid("PAGE.DASHBOARD"), gid("PAGE.SETTINGS")], HUMAN, "导出按钮落在仪表盘页");
    expect(result).toEqual({
      permitRef: ref,
      addedSubjectIds: ["PAGE.DASHBOARD"],
      subjectIds: ["PAGE.SETTINGS", "PAGE.DASHBOARD"],
      eventSeq: 2,
    });
    expect(await checkPermit(store, ref, { id: gid("PAGE.DASHBOARD"), op: "upsert_object" })).toEqual({ outcome: "allowed" });
    expect(await checkPermit(store, ref, { id: gid("PAGE.SETTINGS"), op: "upsert_object" })).toEqual({ outcome: "allowed" });
    const record = permitsFile().permits[0] as {
      scope: { subject_ids: string[] };
      baseline: { at_seq: number; subjects: Record<string, unknown>; subject_at_seq: Record<string, number> };
    };
    expect(record.scope.subject_ids).toEqual(["PAGE.SETTINGS", "PAGE.DASHBOARD"]);
    expect(record.baseline.at_seq).toBe(1);
    expect(record.baseline.subject_at_seq).toEqual({ "PAGE.DASHBOARD": 2 });
    expect((record.baseline.subjects["PAGE.DASHBOARD"] as Record<string, unknown>).rev).toBe(1);
    expect(record.baseline.subjects["PAGE.SETTINGS"]).toBeNull();
    expect(events("PERMIT_WIDENED")).toEqual([
      {
        type: "PERMIT_WIDENED",
        seq: 2,
        permit_ref: ref,
        added_subject_ids: ["PAGE.DASHBOARD"],
        by: { actor_type: "human", actor: "owner" },
        reason: "导出按钮落在仪表盘页",
      },
    ]);
  });

  it("扩权：对象已全部在范围内 → 零变化零事件；空列表 / 非法 id → 拒绝", async () => {
    const ref = await seed(10);
    const before = JSON.stringify(permitsFile());
    expect(await widenPermit(store, ref, [gid("PAGE.DASHBOARD")], HUMAN, "重复扩权")).toMatchObject({ addedSubjectIds: [], eventSeq: null });
    expect(JSON.stringify(permitsFile())).toBe(before);
    expect(events("PERMIT_WIDENED")).toEqual([]);
    await expect(widenPermit(store, ref, [], HUMAN, "空")).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(widenPermit(store, ref, ["FOO.BAR"], HUMAN, "坏前缀")).rejects.toMatchObject({ code: "FATAL_UNKNOWN_PREFIX" });
  });
});
