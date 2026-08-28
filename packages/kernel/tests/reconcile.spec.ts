/**
 * reconcile.spec —— 八拍⑥ RECONCILE（G3）：delta 三段报告 + 基线 closure + 确定性抽样。
 *
 * 判据：docs/eight-beat-carriers-design.md §3.7 测试要点：
 * - 基线捕获由 issuePermit 落台账（permits.spec 已覆盖签发侧；本文件消费侧验证）；
 * - 四种 delta：无变化 clean=true；transition 改轴 → axes_change；absent→present →
 *   materialized；手工删除正文文件模拟 vanished → 必 fail；
 * - content_drift：改 payload 不改轴 → true；基线无 sha 锚 → null（显式未知，不冒充
 *   「无漂移」）；false 态对 kernel 维护的行结构不可达（body_sha256 覆盖内嵌 rev，
 *   rev 变则 sha 必变）——以注释明示而非伪造夹具；
 * - baseline_missing（旧形态许可）→ 显式 fail 不冒充无变化；
 * - exceptions：failed/not_configured/skipped_blindspot 三态各一例 + REJECTED claim；
 *   not_run 与 scope 外条目不入例外但 verdict_census 全量可见（聚合不吞没）；
 * - 抽样确定性：N=3、total=5 的 stride 集合可手工预言；同 state 两次报告字节全同；
 * - 纯读零写 / PERMIT_NOT_FOUND / SCHEMA_INVALID（证据损坏禁静默跳过）；
 * - row 级正文探测（N1）：只手改正文、不碰索引行的篡改 → content_tamper 例外当场抓到；
 *   索引与正文一致零误报；成本边界 = 抽中样本 ∪ changed_objects（不全库扫）；
 * - N6 drift_origin：合法事务变更 → transaction（TX_APPLIED 台账可解释，不入例外）；
 *   rev 推进无事务 / rev 未动而内容变（auto-regen 行锚同步）→ unexplained + 原样升格入
 *   exceptions；同输入重放字节全同（升格条目序 = scope id 序，A4 不破）。
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  createStore,
  issuePermit,
  normalizeGateResult,
  reconcilePermit,
  stealPermit,
  type ReconcileTamperEntry,
  type Store,
} from "@pomaster/kernel";
import {
  AGENT,
  denominatorEntry,
  gid,
  HUMAN,
  makeStore,
  pageEnvelope,
  readIndex,
} from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

// ============================================================
// fixtures
// ============================================================

async function upsertObject(overrides: Record<string, unknown> = {}): Promise<void> {
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: pageEnvelope(overrides) as never }],
  });
}

async function issue(
  subjects: readonly string[],
  ttlBeats?: number,
): Promise<string> {
  const permit = await issuePermit(store, {
    subjectIds: subjects.map(gid),
    requestedBy: HUMAN,
    ...(ttlBeats !== undefined ? { ttlBeats } : {}),
  });
  return permit.permitRef;
}

/** 合法最小 03 形载荷（snake_case；skipped_blindspot 附盲区指标——四态纪律）。 */
function gatePayload(
  grn: string,
  verdict: string,
  subjectId: string | null,
): Record<string, unknown> {
  return {
    grn,
    gate: "CONTENT_TRUTH",
    gate_def: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
    verdict,
    ...(subjectId !== null ? { subject_id: subjectId, is_fixture: false } : {}),
    counts: {
      scanned: 4,
      applicable_scanned: 4,
      violations: verdict === "failed" ? 1 : 0,
      not_applicable: 0,
      ...(verdict === "skipped_blindspot" ? { unchecked_in_blindspot_estimated: 2 } : {}),
    },
    blindspot: { scanned: 4, produced: 4 },
  };
}

/** 经 kernel 真实通路落 run（normalizeGateResult + applyTransaction record_gate_run）。 */
async function recordRun(grn: string, verdict: string, subjectId: string | null): Promise<void> {
  const fresh = await createStore(root);
  const result = normalizeGateResult(
    { value: gatePayload(grn, verdict, subjectId), claimedBy: AGENT },
    {
      ranAtSeq: fresh.currentSeq ?? 0,
      trigger: "on_demand",
      tool: "gauntlet:ui_text_scanner",
      toolVersion: "0.2.0",
    },
  );
  await applyTransaction(store, {
    ops: [{ op: "record_gate_run", run: { grn, result, trigger: "on_demand" } }],
  });
}

async function recordClaim(clm: string, subjectId: string): Promise<void> {
  await applyTransaction(store, {
    ops: [{
      op: "record_claim",
      claim: {
        clm,
        subjectId: gid(subjectId),
        assertion: "reconcile fixture claim",
        assertedBy: AGENT,
        evidenceRefs: [],
      },
    }],
  });
}

/** 手写已判定 claim（kernel record_claim 恒 UNVERIFIED；REJECTED 归独立验证流，夹具模拟）。 */
function writeClaimFile(clm: string, subjectId: string, verdict: string): void {
  writeFileSync(
    join(root, ".pomaster", "evidence", "claims", `${clm}.json`),
    `${JSON.stringify({
      record_type: "claim",
      clm,
      subject: { object_id: subjectId },
      is_fixture: false,
      assertion: "hand-written adjudicated claim",
      asserted_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
      verification: {
        verdict,
        recomputed_by: { actor_type: "kernel", actor: "pomaster-kernel", self_attested: false },
      },
      evidence_refs: [],
      rev: 0,
    }, null, 2)}\n`,
  );
}

/** 抹掉台账内基线的 body_sha256 锚（模拟「基线无 sha 锚」的显式未知态）。 */
function stripBaselineSha(permitRef: string): void {
  const path = join(root, ".pomaster", "state", "permits.json");
  const file = JSON.parse(readFileSync(path, "utf8")) as {
    permits: Array<{ permit_ref: string; baseline: { subjects: Record<string, Record<string, unknown>> } | null }>;
  };
  for (const record of file.permits) {
    if (record.permit_ref !== permitRef) continue;
    const subject = record.baseline?.subjects["PAGE.DASHBOARD"];
    if (subject !== undefined) delete subject.body_sha256;
  }
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

function writeLegacyPermit(): void {
  writeFileSync(
    join(root, ".pomaster", "state", "permits.json"),
    `${JSON.stringify({
      version: 1,
      permits: [{
        permit_ref: "PERMIT.LEGACY.1",
        issued_at_seq: 0,
        expires_at_seq: 168,
        scope: { subject_ids: ["PAGE.DASHBOARD"], write_policy: "AGENT_WITH_PERMIT" },
        requested_by: { actor_type: "human", actor: "owner", self_attested: true },
        change_ref: null,
        capability_refs: [],
        acceptance_shape: null,
        baseline: null,
        stolen_at_seq: null,
        stolen_by: null,
        stolen_reason: null,
      }],
    }, null, 2)}\n`,
  );
}

function reconcile(permitRef: string, samples?: number) {
  return reconcilePermit(store, permitRef, samples === undefined ? {} : { samples });
}

/** 读索引行 body_ref（正文文件定位；探测/手改共用）。 */
function bodyRefOf(id: string): string {
  const row = (readIndex(root).objects as Array<{ id: string; body_ref: string }>).find(
    (candidate) => candidate.id === id,
  );
  if (row === undefined) throw new Error(`index 行不存在：${id}`);
  return row.body_ref;
}

/** 读索引行 body_sha256（事务自动维护的行锚；断言失配方向用）。 */
function indexShaOf(id: string): string {
  const row = (readIndex(root).objects as Array<{ id: string; body_sha256?: string }>).find(
    (candidate) => candidate.id === id,
  );
  if (row === undefined || typeof row.body_sha256 !== "string") {
    throw new Error(`索引行无 sha 锚：${id}`);
  }
  return row.body_sha256;
}

/** 手改正文文件（索引行不动——N1 场景「只手改正文、不碰索引行」的最短复现）。 */
function tamperBodyFile(bodyRef: string, mutate: (body: Record<string, unknown>) => void): void {
  const path = join(root, ".pomaster", bodyRef);
  const body = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutate(body);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
}

// ============================================================
// delta 三段
// ============================================================

describe("reconcilePermit（八拍⑥ delta 三段报告）", () => {
  it("空账本诚实空报告：clean=true 是零审阅的合法出口（不是跳过）", async () => {
    const ref = await issue(["PAGE.SETTINGS"]); // absent 基线（合法基线态）
    const report = await reconcile(ref);
    expect(report).toEqual({
      permit_ref: ref,
      baseline_at_seq: 0,
      current_seq: 0,
      clean: true,
      baseline_missing: false,
      changed_objects: [],
      exceptions: [],
      verdict_census: { runs: {}, claims: {} },
      samples_to_review: [],
      scope_summary: { subjects: 1, materialized: 0, vanished: 0 },
    });
  });

  it("axes_change：transition 改轴 → 只列变化轴 + rev 区间 + content_drift=null", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await applyTransaction(store, {
      ops: [{
        op: "transition_object",
        id: gid("PAGE.DASHBOARD"),
        patch: { confidence: "LOCKED" },
        reasonShort: "口径冻结",
      }],
    });
    const report = await reconcile(ref);
    expect(report.baseline_at_seq).toBe(1);
    expect(report.current_seq).toBe(2);
    expect(report.clean).toBe(false);
    expect(report.changed_objects).toEqual([{
      id: "PAGE.DASHBOARD",
      kind: "axes_change",
      axes: { confidence: { from: "PROVISIONAL", to: "LOCKED" } },
      content_drift: null,
      rev: { from: 1, to: 2 },
    }]);
    expect(report.scope_summary).toEqual({ subjects: 1, materialized: 0, vanished: 0 });
  });

  it("materialized：签发时 absent、现已存在（PROPOSED 新对象落地，合法但人须知道）", async () => {
    const ref = await issue(["PAGE.SETTINGS"]);
    await upsertObject({ id: gid("PAGE.SETTINGS"), titleZh: "设置" });
    const report = await reconcile(ref);
    expect(report.changed_objects).toEqual([{
      id: "PAGE.SETTINGS",
      kind: "materialized",
      axes: null,
      content_drift: null,
      rev: { from: null, to: 1 },
    }]);
    expect(report.scope_summary.materialized).toBe(1);
    expect(report.clean).toBe(false);
  });

  it("vanished：签发时存在、正文文件被删（REF 异常形态，A1 成对纪律）→ 必 fail", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    const raw = readIndex(root);
    const bodyRef = (raw.objects as Array<{ body_ref: string }>)[0]?.body_ref ?? "";
    rmSync(join(root, ".pomaster", bodyRef));
    const report = await reconcile(ref);
    expect(report.changed_objects).toEqual([{
      id: "PAGE.DASHBOARD",
      kind: "vanished",
      axes: null,
      content_drift: null,
      rev: { from: 1, to: null },
    }]);
    expect(report.scope_summary.vanished).toBe(1);
    expect(report.clean).toBe(false);
  });

  it("content_drift=true：改 payload 不改轴（静默漂移显式打捞；事务台账可解释 → transaction）", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await upsertObject({ payload: { surface: "V2" } });
    const report = await reconcile(ref);
    expect(report.changed_objects).toEqual([{
      id: "PAGE.DASHBOARD",
      kind: "content_drift",
      axes: null,
      content_drift: true,
      rev: { from: 1, to: 2 },
      drift_origin: "transaction",
    }]);
    expect(report.clean).toBe(false);
  });

  it("content_drift=null：基线无 sha 锚 → 显式未知，不冒充「无漂移」（false 态对 kernel 维护行不可达：sha 覆盖内嵌 rev）；rev 推进有事务解释 → transaction", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    stripBaselineSha(ref);
    await upsertObject({ payload: { surface: "V2" } });
    const report = await reconcile(ref);
    expect(report.changed_objects).toEqual([{
      id: "PAGE.DASHBOARD",
      kind: "content_drift",
      axes: null,
      content_drift: null,
      rev: { from: 1, to: 2 },
      drift_origin: "transaction",
    }]);
  });

  it("permit 范围外对象不计入 changed（D20 分母纪律的读侧镜像）", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await upsertObject({ id: gid("PAGE.SETTINGS"), titleZh: "设置" }); // scope 外对象落地
    const report = await reconcile(ref);
    expect(report.changed_objects).toEqual([]);
    expect(report.clean).toBe(true);
  });
});

// ============================================================
// N6 drift_origin：content_drift 双义的机判消解（transaction / unexplained）
// ============================================================

describe("reconcilePermit（N6 drift_origin：content_drift 双义机判消解）", () => {
  /** 手改索引行 rev（不碰正文与行 sha——「rev 推进但台账无解释事务」的最短复现）。 */
  function bumpIndexRev(id: string): void {
    const path = join(root, ".pomaster", "state", "truth-index.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      objects: Array<{ id: string; rev: number }>;
    };
    const row = raw.objects.find((candidate) => candidate.id === id);
    if (row === undefined) throw new Error(`index 行不存在：${id}`);
    row.rev += 1;
    writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
  }

  it("合法事务 payload 变更 → drift_origin=transaction（baseline 后 TX_APPLIED 可解释），不入 exceptions", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await upsertObject({ payload: { surface: "V2" } }); // 台账：TX_APPLIED 含该对象 rev 推进 op
    const report = await reconcile(ref);
    expect(report.changed_objects).toEqual([{
      id: "PAGE.DASHBOARD",
      kind: "content_drift",
      axes: null,
      content_drift: true,
      rev: { from: 1, to: 2 },
      drift_origin: "transaction",
    }]);
    expect(report.exceptions).toEqual([]); // transaction：合法变更走 delta 段，不进人审例外队列
  });

  it("rev 推进无事务解释 → drift_origin=unexplained + 原样升格计入 exceptions（疑似越权漂移进人审队列）", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    bumpIndexRev("PAGE.DASHBOARD"); // 手改索引行 rev：baseline 后台账无任何 TX_APPLIED 触及该对象
    const report = await reconcile(ref);
    expect(report.changed_objects).toEqual([{
      id: "PAGE.DASHBOARD",
      kind: "content_drift",
      axes: null,
      content_drift: false, // 行 sha 与基线锚相同——unexplained 判定看台账，不看 sha 三态
      rev: { from: 1, to: 2 },
      drift_origin: "unexplained",
    }]);
    // 升格 = 同一行原样入 exceptions（判别走字段位 drift_origin，不发明新例外 kind 词）。
    expect(report.exceptions).toEqual([report.changed_objects[0]]);
    expect(report.clean).toBe(false);
  });

  it("auto-regen 同步行锚（rev 未动而内容变了）→ unexplained 升格，且与 content_tamper 互补不双报；同输入重放字节全同（A4 不破）", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    tamperBodyFile(bodyRefOf("PAGE.DASHBOARD"), (body) => {
      body.title_zh = "手改标题";
    });
    // 无关事务触发 sweepDigestTampering：行 sha 自动对齐手改正文（rev 不动、
    // changed_object_ids 不含该对象）→ 台账对此漂移无解释 → unexplained。
    await upsertObject({ id: gid("PAGE.SETTINGS"), titleZh: "设置" });

    const report = await reconcile(ref);
    expect(report.changed_objects).toEqual([{
      id: "PAGE.DASHBOARD",
      kind: "content_drift",
      axes: null,
      content_drift: true,
      rev: { from: 1, to: 1 },
      drift_origin: "unexplained",
    }]);
    expect(report.exceptions).toEqual([report.changed_objects[0]]);
    // 行锚已被 auto-regen 同步 → 正文探测无失配（content_tamper 与 unexplained 互补）。
    expect(
      report.exceptions.some((entry) => "kind" in entry && entry.kind === "content_tamper"),
    ).toBe(false);

    const again = await reconcile(ref);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report)); // 纯读重放字节稳定（A4）
  });
});

// ============================================================
// exceptions 与 verdict_census
// ============================================================

describe("reconcilePermit（exceptions / verdict_census）", () => {
  it("exceptions：failed/not_configured/skipped_blindspot 三态各一例 + REJECTED claim；not_run 与 scope 外不入例外但 census 全量可见（聚合不吞没）", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await recordRun("GRN-0001", "passed", "PAGE.DASHBOARD");
    await recordRun("GRN-0002", "failed", "PAGE.DASHBOARD");
    await recordRun("GRN-0003", "not_configured", "PAGE.DASHBOARD");
    await recordRun("GRN-0004", "skipped_blindspot", "PAGE.DASHBOARD");
    await recordRun("GRN-0005", "not_run", "PAGE.DASHBOARD");
    await recordRun("GRN-0006", "failed", "PAGE.SETTINGS"); // scope 外 failed：只进 census
    await recordClaim("CLM-0001", "PAGE.DASHBOARD"); // kernel 判定恒 UNVERIFIED
    writeClaimFile("CLM-0002", "PAGE.DASHBOARD", "REJECTED");

    const report = await reconcile(ref);
    expect(report.exceptions).toEqual([
      { evidence_ref: "GRN-0002", plane: "runs", verdict: "failed", subject_id: "PAGE.DASHBOARD", gate: "CONTENT_TRUTH" },
      { evidence_ref: "GRN-0003", plane: "runs", verdict: "not_configured", subject_id: "PAGE.DASHBOARD", gate: "CONTENT_TRUTH" },
      { evidence_ref: "GRN-0004", plane: "runs", verdict: "skipped_blindspot", subject_id: "PAGE.DASHBOARD", gate: "CONTENT_TRUTH" },
      { evidence_ref: "CLM-0002", plane: "claims", verdict: "REJECTED", subject_id: "PAGE.DASHBOARD", gate: null },
    ]);
    // 全量计数：含例外条目与 scope 外条目——不进例外段 ≠ 不可见。
    expect(report.verdict_census).toEqual({
      runs: { failed: 2, not_configured: 1, not_run: 1, passed: 1, skipped_blindspot: 1 },
      claims: { REJECTED: 1, UNVERIFIED: 1 },
    });
    expect(report.clean).toBe(false);
  });

  it("证据平面损坏（坏 JSON）→ SCHEMA_INVALID（禁静默跳过损坏证据）", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    writeFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0042.json"), "{broken");
    await expect(reconcile(ref)).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

// ============================================================
// 抽样确定性（A4：禁随机禁墙钟）
// ============================================================

describe("reconcilePermit（samples_to_review 确定性抽样）", () => {
  it("N=3、total=5 的 stride 集合可手工预言（floor(i×total/N)）；同 state 两次报告字节全同", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    for (const grn of ["GRN-0001", "GRN-0002", "GRN-0003", "GRN-0004", "GRN-0005"]) {
      await recordRun(grn, "passed", "PAGE.DASHBOARD");
    }
    const report = await reconcile(ref, 3);
    expect(report.samples_to_review).toEqual([
      { evidence_ref: "GRN-0001", plane: "runs", verdict: "passed", subject_id: "PAGE.DASHBOARD", gate: "CONTENT_TRUTH", sample_reason: "deterministic stride 0/3" },
      { evidence_ref: "GRN-0002", plane: "runs", verdict: "passed", subject_id: "PAGE.DASHBOARD", gate: "CONTENT_TRUTH", sample_reason: "deterministic stride 1/3" },
      { evidence_ref: "GRN-0004", plane: "runs", verdict: "passed", subject_id: "PAGE.DASHBOARD", gate: "CONTENT_TRUTH", sample_reason: "deterministic stride 2/3" },
    ]);
    const again = await reconcile(ref, 3);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });

  it("--samples 0 = 显式放弃抽样；total ≤ N 全取（缺省 3）", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await recordRun("GRN-0001", "passed", "PAGE.DASHBOARD");
    await recordRun("GRN-0002", "passed", "PAGE.DASHBOARD");

    const zero = await reconcile(ref, 0);
    expect(zero.samples_to_review).toEqual([]);

    const all = await reconcile(ref); // 缺省 3；total=2 ≤ 3 → 全取
    expect(all.samples_to_review).toHaveLength(2);
    expect(all.samples_to_review[0]?.sample_reason).toBe("all (total 2 <= samples 3)");
  });

  it("samples 非法（负数/非整数）→ SCHEMA_INVALID", async () => {
    const ref = await issue(["PAGE.DASHBOARD"]);
    await expect(reconcile(ref, -1)).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(reconcile(ref, 1.5)).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

// ============================================================
// row 级正文探测（N1：content_drift 双锚都在索引侧的盲区收窄）
// ============================================================

describe("reconcilePermit（row 级正文探测：N1 双锚盲区收窄）", () => {
  /** 例外段中的 content_tamper 条目（union 收窄）。 */
  function tamperEntriesOf(report: Awaited<ReturnType<typeof reconcile>>): ReconcileTamperEntry[] {
    return report.exceptions.filter(
      (entry): entry is ReconcileTamperEntry => "kind" in entry && entry.kind === "content_tamper",
    );
  }

  it("纯正文手改（索引行未动）→ 抽中样本的探测当场抓到：content_tamper 入 exceptions，delta 段零感知", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await recordRun("GRN-0001", "passed", "PAGE.DASHBOARD"); // 抽样池非空 → subject 入探测分母
    tamperBodyFile(bodyRefOf("PAGE.DASHBOARD"), (body) => {
      body.title_zh = "手改标题";
    });

    const report = await reconcile(ref);
    // N1 原盲区：索引行未动 → baseline↔行双索引锚 delta 无感知（changed_objects 空）。
    expect(report.changed_objects).toEqual([]);
    const tampers = tamperEntriesOf(report);
    expect(tampers).toHaveLength(1);
    expect(tampers[0]).toEqual({
      kind: "content_tamper",
      subject_id: "PAGE.DASHBOARD",
      body_ref: bodyRefOf("PAGE.DASHBOARD"),
      index_sha256: indexShaOf("PAGE.DASHBOARD"),
      body_sha256: expect.any(String),
    });
    // 失配方向：正文重算指纹 ≠ 索引行锚（index_sha256 与未动的索引行逐字一致）。
    expect(tampers[0]?.body_sha256).not.toBe(tampers[0]?.index_sha256);
    expect(report.clean).toBe(false); // 失配计入 exceptions → dirty（人须审；探测只报不修）
  });

  it("索引与正文一致 → 探测零误报：干净出口保持 clean=true；合法 content_drift（事务成对改写两侧）也不误报", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await recordRun("GRN-0001", "passed", "PAGE.DASHBOARD");

    const cleanReport = await reconcile(ref);
    expect(cleanReport.exceptions).toEqual([]);
    expect(cleanReport.clean).toBe(true);

    await upsertObject({ payload: { surface: "V2" } }); // 合法漂移：正文+索引行由事务成对改写
    const driftReport = await reconcile(ref);
    expect(driftReport.changed_objects.map((changed) => changed.kind)).toEqual(["content_drift"]);
    expect(tamperEntriesOf(driftReport)).toEqual([]); // 行 sha 已同步新正文 → 探测无失配
  });

  it("成本边界：只探抽中样本 ∪ changed_objects——scope 内既未抽中又无 delta 的手改不探（不全库扫）", async () => {
    await upsertObject(); // PAGE.DASHBOARD：有证据 → 抽中 → 入探测分母
    await upsertObject({ id: gid("PAGE.SETTINGS"), titleZh: "设置" }); // 无证据、无 delta → 不在分母
    const ref = await issue(["PAGE.DASHBOARD", "PAGE.SETTINGS"]);
    await recordRun("GRN-0001", "passed", "PAGE.DASHBOARD");
    tamperBodyFile(bodyRefOf("PAGE.DASHBOARD"), (body) => {
      body.title_zh = "手改 A";
    });
    tamperBodyFile(bodyRefOf("PAGE.SETTINGS"), (body) => {
      body.title_zh = "手改 B";
    });

    const report = await reconcile(ref);
    const tampers = tamperEntriesOf(report);
    expect(tampers).toHaveLength(1); // 全库扫会报两条；只探分母 → 仅抽中的 DASHBOARD
    expect(tampers[0]?.subject_id).toBe("PAGE.DASHBOARD");
    expect(report.samples_to_review.map((sample) => sample.subject_id)).toEqual([
      "PAGE.DASHBOARD",
    ]);
  });

  it("changed_objects 侧同样入探测分母：零证据（从不抽中）但入 delta 的对象，手改正文同样当场抓到", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await applyTransaction(store, {
      ops: [{
        op: "transition_object",
        id: gid("PAGE.DASHBOARD"),
        patch: { confidence: "LOCKED" },
        reasonShort: "口径冻结",
      }],
    });
    tamperBodyFile(bodyRefOf("PAGE.DASHBOARD"), (body) => {
      body.title_zh = "手改标题";
    });

    const report = await reconcile(ref);
    expect(report.samples_to_review).toEqual([]); // 零证据：抽样分母为空
    expect(report.changed_objects.map((changed) => changed.kind)).toEqual(["axes_change"]);
    const tampers = tamperEntriesOf(report);
    expect(tampers).toHaveLength(1); // 探测经 changed_objects 触发，不依赖抽样
    expect(tampers[0]?.subject_id).toBe("PAGE.DASHBOARD");
    expect(report.clean).toBe(false);
  });

  it("探测遇损坏正文（无法解析）→ SCHEMA_INVALID（禁静默跳过损坏正文）", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"]);
    await recordRun("GRN-0001", "passed", "PAGE.DASHBOARD");
    writeFileSync(join(root, ".pomaster", bodyRefOf("PAGE.DASHBOARD")), "{broken");
    await expect(reconcile(ref)).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

// ============================================================
// fail-closed 与边界
// ============================================================

describe("reconcilePermit（fail-closed 与边界）", () => {
  it("baseline_missing：旧形态许可（无基线）→ 显式 fail，delta 段不可计算（not_configured ≠ passed）", async () => {
    writeLegacyPermit();
    await upsertObject(); // 有变化也报不出来——不能拿「没有基线」冒充「无变化」
    const report = await reconcile("PERMIT.LEGACY.1");
    expect(report.baseline_missing).toBe(true);
    expect(report.baseline_at_seq).toBeNull();
    expect(report.clean).toBe(false);
    expect(report.changed_objects).toEqual([]);
  });

  it("许可不存在 → PERMIT_NOT_FOUND（fail-closed，不产出空报告）", async () => {
    await expect(reconcile("PERMIT.NOPE.9")).rejects.toMatchObject({ code: "PERMIT_NOT_FOUND" });
  });

  it("stolen 许可仍可 reconcile（纯读审计；接管事件在 journal 留痕）", async () => {
    await upsertObject();
    const ref = await issue(["PAGE.DASHBOARD"], 1);
    await applyTransaction(store, {
      ops: [{ op: "append_denominator", entry: denominatorEntry() as never }],
    });
    await stealPermit(store, ref, HUMAN, "原持有人会话已死");
    const report = await reconcile(ref);
    expect(report.permit_ref).toBe(ref);
    expect(report.changed_objects).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it("store 未初始化（索引缺失）→ NOT_CONFIGURED", async () => {
    const ref = await issue(["PAGE.DASHBOARD"]);
    rmSync(join(root, ".pomaster", "state", "truth-index.json"));
    await expect(reconcile(ref)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});
