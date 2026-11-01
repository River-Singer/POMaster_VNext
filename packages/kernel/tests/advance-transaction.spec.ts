/**
 * advance-transaction.spec.ts —— record_advance 事务 op + 合法推进台账（VNext 优化 V1-4；
 * vnext-legal-advance §2 / §3.5；台账 VX-PARITY-03）。
 *
 * 验收：
 * - 合格 ADVANCE 落 state/advances/ADV-<n>.json，journal 依次 TX_APPLIED → ADVANCE_RECORDED（同 seq）；
 * - 坏段（默认 actor / 占位 reason / 新锚与现状不符 / 复判非 PASS）整事务零落盘，
 *   SCHEMA_INVALID + details.reason_code；
 * - 链纪律：同 (kind, ref) 的新段旧锚须等于链尾新锚；同事务内多段成链；重放旧段被拒；
 * - 退役台账 append-only：同批写入、读 API 可查、重复退役拒绝；
 * - 存量 store（无新平面）读 API = 空集合（零迁移）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GovernanceError,
  applyTransaction,
  buildAdvance,
  buildRejudge,
  digestValue,
  latestAdvanceFor,
  listAdvanceRecords,
  isRetired,
  listActiveRetirements,
  listRetirements,
  loadTruthIndex,
  pathsOf,
  readRetirementLedger,
  type Store,
  type VnextAnchor,
} from "@pomaster/kernel";
import { makeStore, pageEnvelope } from "./helpers.js";

const OWNER = "human:owner";
const REASON = "基线 Layers 取值变更后重新验证 CLM-0001";

function anchor(tag: string, overrides: Partial<VnextAnchor> = {}): VnextAnchor {
  return { kind: "claim_verification", ref: "CLM-0001", digest: digestValue(tag), version: 1, ...overrides };
}

function section(oldAnchor: VnextAnchor, newAnchor: VnextAnchor, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...buildAdvance({
      basis: "explicit-evidence",
      actor: OWNER,
      reason: REASON,
      evidenceRefs: ["test:packages/cli/tests/closeout.spec.ts"],
      evidenceSha256: digestValue("evidence"),
      oldAnchor,
      newAnchor,
      affectedIds: ["CLM-0001", "TASK.T0001"],
      rejudge: buildRejudge([{ gate: "vnext.claim.requalify" }]),
    }),
    ...overrides,
  };
}

async function record(
  store: Store,
  advance: Record<string, unknown>,
  extra: {
    actor?: string;
    reason?: string;
    currentAnchor?: VnextAnchor;
    retirements?: Record<string, unknown>[];
    reinstatements?: Record<string, unknown>[];
  } = {},
) {
  return applyTransaction(store, {
    ops: [
      {
        op: "record_advance",
        record: {
          advance,
          actor: extra.actor ?? OWNER,
          reason: extra.reason ?? REASON,
          ...(extra.currentAnchor !== undefined ? { currentAnchor: extra.currentAnchor } : {}),
          ...(extra.retirements !== undefined ? { retirements: extra.retirements } : {}),
          ...(extra.reinstatements !== undefined ? { reinstatements: extra.reinstatements } : {}),
        },
      },
    ],
  });
}

async function rejection(run: () => Promise<unknown>): Promise<GovernanceError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(GovernanceError);
    return error as GovernanceError;
  }
  throw new Error("expected record_advance to be rejected");
}

function readJournal(store: Store): Record<string, unknown>[] {
  const text = readFileSync(pathsOf(store).journalPath, "utf8");
  return text.split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as Record<string, unknown>);
}

function advanceFiles(root: string): string[] {
  const dir = join(root, ".pomaster", "state", "advances");
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

describe("record_advance：合格段落账", () => {
  it("落 ADV-0001（不可变记录）+ journal TX_APPLIED → ADVANCE_RECORDED 同 seq", async () => {
    const { store, root } = await makeStore();
    const result = await record(store, section(anchor("v1"), anchor("v2")), { currentAnchor: anchor("v2") });
    expect(result.shortCircuited).toBe(false);
    expect(advanceFiles(root)).toEqual(["ADV-0001.json"]);

    const stored = JSON.parse(readFileSync(join(root, ".pomaster", "state", "advances", "ADV-0001.json"), "utf8")) as Record<string, unknown>;
    expect(stored).toMatchObject({ record_type: "advance", adv: "ADV-0001", at_seq: result.appliedSeq, actor: OWNER, reason: REASON, retirement_ids: [] });
    expect((stored.advance as Record<string, unknown>).schema).toBe("pomaster-advance/v1");

    const journal = readJournal(store).slice(-2);
    expect(journal.map((line) => line.type)).toEqual(["TX_APPLIED", "ADVANCE_RECORDED"]);
    expect(journal[0]).toMatchObject({ seq: result.appliedSeq, ops: ["record_advance"] });
    expect(journal[1]).toEqual({
      type: "ADVANCE_RECORDED",
      seq: result.appliedSeq,
      adv: "ADV-0001",
      anchor_kind: "claim_verification",
      ref: "CLM-0001",
      affected_ids: ["CLM-0001", "TASK.T0001"],
      retirement_ids: [],
      actor: OWNER,
    });
  });

  it("读 API：listAdvanceRecords 按锚过滤；latestAdvanceFor 取链尾", async () => {
    const { store } = await makeStore();
    await record(store, section(anchor("v1"), anchor("v2")));
    await record(store, section(anchor("k1", { kind: "keybinding", ref: "KB-0001" }), anchor("k2", { kind: "keybinding", ref: "KB-0001" })));
    await record(store, section(anchor("v2"), anchor("v3")));
    const paths = pathsOf(store);
    expect(listAdvanceRecords(paths).map((item) => item.adv)).toEqual(["ADV-0001", "ADV-0002", "ADV-0003"]);
    expect(listAdvanceRecords(paths, { anchorKind: "keybinding" }).map((item) => item.adv)).toEqual(["ADV-0002"]);
    expect(latestAdvanceFor(paths, "claim_verification", "CLM-0001")?.adv).toBe("ADV-0003");
    expect(latestAdvanceFor(paths, "claim_verification", "CLM-0009")).toBeNull();
  });

  it("同 inputs 重放 = 幂等短路（零写入、零新 journal）", async () => {
    const { store, root } = await makeStore();
    const advance = section(anchor("v1"), anchor("v2"));
    await record(store, advance);
    const journalBefore = readJournal(store).length;
    const replay = await record(store, advance);
    expect(replay.shortCircuited).toBe(true);
    expect(advanceFiles(root)).toEqual(["ADV-0001.json"]);
    expect(readJournal(store)).toHaveLength(journalBefore);
  });

  it("存量 store 无新平面：读 API = 空集合（零迁移）", async () => {
    const { store, root } = await makeStore();
    expect(listAdvanceRecords(pathsOf(store))).toEqual([]);
    expect(readRetirementLedger(pathsOf(store))).toEqual({ version: 1, entries: [] });
    expect(existsSync(join(root, ".pomaster", "state", "advances"))).toBe(false);
  });
});

describe("record_advance：坏段整事务零落盘", () => {
  it.each([
    ["默认 actor", { actor: "agent" }, { actor: "agent" }, "advance.actor must be an explicit operator, not a CLI default"],
    ["占位 reason", { reason: "TODO 补理由" }, { reason: "TODO 补理由" }, "advance.reason must not be a placeholder"],
    ["段内 actor 与事件不符", { actor: "human:other" }, {}, "advance.actor must equal the event actor"],
    ["证据为空", { evidence_refs: [] }, {}, "advance.evidence_refs must be non-empty for explicit-evidence"],
  ] as const)("%s → ADVANCE_INVALID", async (_name, overrides, extra, message) => {
    const { store, root } = await makeStore();
    const seqBefore = store.currentSeq;
    const error = await rejection(() => record(store, section(anchor("v1"), anchor("v2"), overrides), extra));
    expect(error.code).toBe("SCHEMA_INVALID");
    expect(error.details).toMatchObject({ reason_code: "ADVANCE_INVALID" });
    expect((error.details as { errors: string[] }).errors).toContain(message);
    expect(advanceFiles(root)).toEqual([]);
    expect(readJournal(store).filter((line) => line.type === "ADVANCE_RECORDED")).toEqual([]);
    expect(store.currentSeq).toBe(seqBefore);
  });

  it("新锚与调用方重算的现状不符 → ADVANCE_INVALID", async () => {
    const { store, root } = await makeStore();
    const error = await rejection(() => record(store, section(anchor("v1"), anchor("v2")), { currentAnchor: anchor("v2-actual") }));
    expect((error.details as { errors: string[] }).errors).toEqual(["advance.new_anchor must equal the event anchor"]);
    expect(advanceFiles(root)).toEqual([]);
  });

  it("复判非 PASS → ADVANCE_REJUDGE_FAILED", async () => {
    const { store, root } = await makeStore();
    const rejudge = buildRejudge([{ gate: "vnext.claim.requalify", result: "DENY" }]);
    const error = await rejection(() => record(store, section(anchor("v1"), anchor("v2"), { rejudge })));
    expect(error.details).toMatchObject({ reason_code: "ADVANCE_REJUDGE_FAILED" });
    expect((error.details as { errors: string[] }).errors).toEqual([
      "advance.rejudge.verdict must be PASS for a persisted ADVANCE",
      "advance.rejudge gate vnext.claim.requalify did not pass",
    ]);
    expect(advanceFiles(root)).toEqual([]);
  });
});

describe("record_advance：链纪律", () => {
  it("旧锚须等于链尾新锚；拒绝时 details 指向链尾 ADV", async () => {
    const { store } = await makeStore();
    await record(store, section(anchor("v1"), anchor("v2")));
    const error = await rejection(() => record(store, section(anchor("v1"), anchor("v3"))));
    expect((error.details as { errors: string[] }).errors).toEqual(["advance.old_anchor must equal the previous anchor"]);
    expect(error.details).toMatchObject({ reason_code: "ADVANCE_INVALID", previous_adv: "ADV-0001" });
    await record(store, section(anchor("v2"), anchor("v3")));
    expect(latestAdvanceFor(pathsOf(store), "claim_verification", "CLM-0001")?.adv).toBe("ADV-0002");
  });

  it("重放已被后续段覆盖的旧段被拒（链天然防重）", async () => {
    const { store } = await makeStore();
    const first = section(anchor("v1"), anchor("v2"));
    await record(store, first);
    await record(store, section(anchor("v2"), anchor("v3")));
    const error = await rejection(() => record(store, first));
    expect(error.details).toMatchObject({ previous_adv: "ADV-0002" });
  });

  it("同事务内两段成链：编号顺延、第二段以第一段为前驱", async () => {
    const { store, root } = await makeStore();
    const result = await applyTransaction(store, {
      ops: [
        { op: "record_advance", record: { advance: section(anchor("v1"), anchor("v2")), actor: OWNER, reason: REASON } },
        { op: "record_advance", record: { advance: section(anchor("v2"), anchor("v3")), actor: OWNER, reason: REASON } },
      ],
    });
    expect(advanceFiles(root)).toEqual(["ADV-0001.json", "ADV-0002.json"]);
    const events = readJournal(store).filter((line) => line.type === "ADVANCE_RECORDED");
    expect(events.map((line) => [line.adv, line.seq])).toEqual([["ADV-0001", result.appliedSeq], ["ADV-0002", result.appliedSeq]]);

    const { store: other } = await makeStore();
    const error = await rejection(() =>
      applyTransaction(other, {
        ops: [
          { op: "record_advance", record: { advance: section(anchor("v1"), anchor("v2")), actor: OWNER, reason: REASON } },
          { op: "record_advance", record: { advance: section(anchor("v1"), anchor("v3")), actor: OWNER, reason: REASON } },
        ],
      }));
    expect(error.details).toMatchObject({ previous_adv: "ADV-0001" });
  });

  it("升版须显式 transition（版本过渡 §3.4）", async () => {
    const { store } = await makeStore();
    const next = anchor("v2", { version: 2 });
    const error = await rejection(() => record(store, section(anchor("v1"), next)));
    expect((error.details as { errors: string[] }).errors).toEqual(["advance.new_anchor.version moved without a transition"]);
    await record(store, section(anchor("v1"), next, { transition: { layer: "claim_verification", from: 1, to: 2, v1_matched: true } }));
    expect(latestAdvanceFor(pathsOf(store), "claim_verification", "CLM-0001")?.advance.new_anchor).toEqual(next);
  });
});

describe("record_advance：退役台账", () => {
  const superseded = {
    id: "CLM-0001",
    kind: "claim_superseded",
    reason: "基线 Layers 变更，判定由 CLM-0002 承接",
    actor: OWNER,
    replacement_id: "CLM-0002",
    last_anchor: { clm: "CLM-0001", verdict: "VERIFIED", at_seq: 3 },
  };
  const deferred = {
    id: "platform/observability.md:sla",
    kind: "baseline_key_deferred",
    reason: "SLA 指标待运维定稿",
    actor: OWNER,
    last_anchor: { target: "platform/observability.md", key: "sla" },
  };

  it("同批写入 append-only 台账，条目带 adv / at_seq 归属；ADVANCE 记录 retirement_ids", async () => {
    const { store } = await makeStore();
    const first = await record(store, section(anchor("v1"), anchor("v2")), { retirements: [superseded] });
    const second = await record(store, section(anchor("v2"), anchor("v3")), { retirements: [deferred] });
    const paths = pathsOf(store);
    expect(readRetirementLedger(paths).entries).toEqual([
      { ...superseded, adv: "ADV-0001", at_seq: first.appliedSeq },
      { ...deferred, replacement_id: null, adv: "ADV-0002", at_seq: second.appliedSeq },
    ]);
    expect(listRetirements(paths, { kind: "baseline_key_deferred" }).map((entry) => entry.id)).toEqual(["platform/observability.md:sla"]);
    expect(latestAdvanceFor(paths, "claim_verification", "CLM-0001")?.retirement_ids).toEqual(["platform/observability.md:sla"]);
    const event = readJournal(store).filter((line) => line.type === "ADVANCE_RECORDED")[0];
    expect(event?.retirement_ids).toEqual(["CLM-0001"]);
  });

  it("重复退役同一条目被拒（RETIREMENT_INVALID），整事务零落盘", async () => {
    const { store, root } = await makeStore();
    await record(store, section(anchor("v1"), anchor("v2")), { retirements: [superseded] });
    const error = await rejection(() => record(store, section(anchor("v2"), anchor("v3")), { retirements: [superseded] }));
    expect(error.details).toMatchObject({ reason_code: "RETIREMENT_INVALID" });
    expect((error.details as { errors: string[] }).errors).toEqual(["retirements[0] claim_superseded CLM-0001 is already retired"]);
    expect(advanceFiles(root)).toEqual(["ADV-0001.json"]);
    expect(readRetirementLedger(pathsOf(store)).entries).toHaveLength(1);
  });

  it("条目不合契约（actor 与事件不符、锚键缺席、Python 种类）→ RETIREMENT_INVALID", async () => {
    const { store, root } = await makeStore();
    const error = await rejection(() =>
      record(store, section(anchor("v1"), anchor("v2")), {
        retirements: [
          { ...deferred, actor: "human:other" },
          { ...deferred, id: "platform/observability.md:apm", last_anchor: { target: "platform/observability.md" } },
          { ...deferred, id: "FACT-0001", kind: "missing_retired" },
        ],
      }));
    expect((error.details as { errors: string[] }).errors).toEqual([
      "retirements[0].actor must equal the event actor",
      "retirements[1].last_anchor.key is required for baseline_key_deferred",
      "retirements[2].kind missing_retired is not allowed in the vnext lane",
      "retirements[2].last_anchor.category is required for missing_retired",
      "retirements[2].last_anchor.file_path is required for missing_retired",
      "retirements[2].last_anchor.symbol is required for missing_retired",
      "retirements[2].last_anchor.last_verified_file_sha256 is required for missing_retired",
    ]);
    expect(advanceFiles(root)).toEqual([]);
  });
});

describe("reassess_baseline_scope：任务 baseline 依赖范围重写（V2-7；VX-WRITE-02）", () => {
  const declaration = { baseline_at_seq: 0, relevant_targets: ["baseline/frontend/architecture.md"], excluded_targets: [], digests: {} };
  const taskEnvelope = {
    id: "TASK.REASSESS",
    kind: "task_object",
    axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "范围重评估",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { intent: "重评估", class_scan_result: { scope: "tasks/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" } },
  };
  async function bodyOf(store: Store): Promise<Record<string, unknown>> {
    const row = (await loadTruthIndex(store)).objects.find((candidate) => candidate.id === "TASK.REASSESS");
    return JSON.parse(readFileSync(join(pathsOf(store).pomasterDir, row?.bodyRef ?? "missing"), "utf8")) as Record<string, unknown>;
  }

  it("重写 payload.baseline_dependencies、rev 推进；同声明重放零变化；非任务 / 缺席对象被拒", async () => {
    const { store } = await makeStore();
    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: taskEnvelope as never }] });
    const before = await bodyOf(store);
    await applyTransaction(store, { ops: [{ op: "reassess_baseline_scope", task: "TASK.REASSESS" as never, declaration }] });
    const after = await bodyOf(store);
    expect((after.payload as Record<string, unknown>).baseline_dependencies).toEqual(declaration);
    expect((after.payload as Record<string, unknown>).intent).toBe("重评估");
    expect(after.rev).toBe((before.rev as number) + 1);

    const journalBefore = readJournal(store).length;
    await applyTransaction(store, { ops: [{ op: "reassess_baseline_scope", task: "TASK.REASSESS" as never, declaration }] });
    expect(readJournal(store).length).toBe(journalBefore);

    await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }] });
    await expect(applyTransaction(store, { ops: [{ op: "reassess_baseline_scope", task: "PAGE.DASHBOARD" as never, declaration }] }))
      .rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(applyTransaction(store, { ops: [{ op: "reassess_baseline_scope", task: "TASK.NOPE" as never, declaration }] }))
      .rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });
});

describe("record_advance：撤销退役（V2-6 reinstatements）", () => {
  const notApplicable = {
    id: "baseline/backend/stack.yaml",
    kind: "baseline_target_not_applicable",
    reason: "纯前端项目，后端由 BaaS 提供",
    actor: OWNER,
    last_anchor: { target: "baseline/backend/stack.yaml", authority_digest: null },
  };
  const reinstate = { id: "baseline/backend/stack.yaml", kind: "baseline_target_not_applicable" };

  it("退役 → 撤销 → 再退役交替：台账只追加，isRetired / listActiveRetirements 取当前态；记录与 journal 带 reinstatement_ids", async () => {
    const { store } = await makeStore();
    const paths = pathsOf(store);
    await record(store, section(anchor("on"), anchor("off")), { retirements: [notApplicable] });
    expect(listActiveRetirements(paths).map((entry) => entry.id)).toEqual(["baseline/backend/stack.yaml"]);

    const second = await record(store, section(anchor("off"), anchor("on2")), { reinstatements: [reinstate] });
    const ledger = readRetirementLedger(paths);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.reinstatements).toEqual([{ ...reinstate, reason: REASON, actor: OWNER, adv: "ADV-0002", at_seq: second.appliedSeq }]);
    expect(isRetired(ledger, reinstate.kind, reinstate.id)).toBe(false);
    expect(listActiveRetirements(paths)).toEqual([]);
    expect(latestAdvanceFor(paths, "claim_verification", "CLM-0001")?.reinstatement_ids).toEqual([reinstate.id]);
    const events = readJournal(store).filter((line) => line.type === "ADVANCE_RECORDED");
    expect(events[0]).not.toHaveProperty("reinstatement_ids");
    expect(events[1]?.reinstatement_ids).toEqual([reinstate.id]);

    await record(store, section(anchor("on2"), anchor("off2")), { retirements: [notApplicable] });
    expect(readRetirementLedger(paths).entries).toHaveLength(2);
    expect(listActiveRetirements(paths, { kind: "baseline_target_not_applicable" }).map((entry) => entry.adv)).toEqual(["ADV-0003"]);
  });

  it("撤销未退役条目 / 同批重复 / 词形外种类 → RETIREMENT_INVALID，整事务零落盘", async () => {
    const { store, root } = await makeStore();
    const notRetired = await rejection(() => record(store, section(anchor("v1"), anchor("v2")), { reinstatements: [reinstate] }));
    expect(notRetired.details).toMatchObject({ reason_code: "RETIREMENT_INVALID" });
    expect((notRetired.details as { errors: string[] }).errors).toEqual([
      "reinstatements[0] baseline_target_not_applicable baseline/backend/stack.yaml is not retired",
    ]);
    await record(store, section(anchor("v1"), anchor("v2")), { retirements: [notApplicable] });
    const malformed = await rejection(() =>
      record(store, section(anchor("v2"), anchor("v3")), { reinstatements: [reinstate, reinstate, { id: "x", kind: "missing_retired" }] }));
    expect((malformed.details as { errors: string[] }).errors).toEqual([
      "reinstatements[1].id is duplicated: baseline/backend/stack.yaml",
      "reinstatements[2].kind must be one of the vnext retirement kinds",
    ]);
    expect(advanceFiles(root)).toEqual(["ADV-0001.json"]);
    expect(readRetirementLedger(pathsOf(store)).reinstatements).toBeUndefined();
  });
});
