/**
 * evidence-recompute.spec.ts —— P15 recompute 字段不可信自报值专项。
 *
 * 契约锚：kernel 中一切 recompute 类派生字段（evidence_summary 计数、claim
 * verification 判定）只有 kernel 重算值可信——声称方/外部自报值要么被整体
 * 丢弃（D20：声称方不可自填 VERIFIED，store.ts record 构造不含输入
 * verification），要么在任一真实写入路径被重算覆盖（store.ts:1050 upsert /
 * store.ts:1470 record_claim 的 recomputeEvidenceSummary）。
 * 每条用例对应 store.ts / reconcile.ts 中真实存在的判定行（括注行号语义）。
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  createStore,
  issuePermit,
  loadTruthIndex,
  normalizeGateResult,
  reconcilePermit,
  type Store,
  type Transaction,
} from "@pomaster/kernel";
import { AGENT, gid, HUMAN, makeStore, pageEnvelope, readIndex } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

function txOf(ops: Transaction["ops"]): Transaction {
  return { ops };
}

const upsertPage = (overrides: Record<string, unknown> = {}): Transaction["ops"] => [
  { op: "upsert_object", envelope: pageEnvelope(overrides) as never },
];

const claimOp = (clm: string, subjectId = "PAGE.DASHBOARD"): Transaction["ops"][number] => ({
  op: "record_claim",
  claim: {
    clm,
    subjectId: gid(subjectId),
    assertion: "recompute fixture claim",
    assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
    evidenceRefs: [],
  },
} as never);

/** 手写磁盘 claim（模拟独立验证流已判定 / 畸形形态；countClaim 只读 subject 与 verification.verdict）。 */
function writeClaimFile(clm: string, subjectId: string | undefined, verdict: string): void {
  const payload: Record<string, unknown> = {
    record_type: "claim",
    clm,
    ...(subjectId !== undefined ? { subject: { object_id: subjectId } } : {}),
    is_fixture: false,
    assertion: "hand-written adjudicated claim",
    asserted_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
    verification: {
      verdict,
      recomputed_by: { actor_type: "kernel", actor: "pomaster-kernel", self_attested: false },
    },
    evidence_refs: [],
    rev: 0,
  };
  writeFileSync(
    join(root, ".pomaster", "evidence", "claims", `${clm}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

/** 手改索引行 evidence_summary（模拟外部自报假计数；recompute 专项的被纠正对象）。 */
function tamperSummary(id: string, summary: Record<string, number>): void {
  const path = join(root, ".pomaster", "state", "truth-index.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    objects: Array<{ id: string; evidence_summary: Record<string, number> }>;
  };
  const row = raw.objects.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`索引行不存在：${id}`);
  row.evidence_summary = summary;
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
}

function rowSummary(id = "PAGE.DASHBOARD"): Record<string, number> {
  const raw = readIndex(root) as { objects: Array<{ id: string; evidence_summary: Record<string, number> }> };
  const row = raw.objects.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error(`索引行不存在：${id}`);
  return row.evidence_summary;
}

// ============================================================
// 1. 声称方不可自填判定（D20：verification 由 kernel 登记）
// ============================================================

describe("record_claim 判定登记：声称方自报判定整体被丢弃（D20）", () => {
  it("JS 直调塞 verification:VERIFIED → 落盘仍 UNVERIFIED（store.ts record 构造不含输入 verification）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    await applyTransaction(store, txOf([
      {
        op: "record_claim",
        claim: {
          clm: "CLM-1",
          subjectId: gid("PAGE.DASHBOARD"),
          assertion: "声称方试图自带 VERIFIED 判定",
          assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
          evidenceRefs: [],
          verification: {
            verdict: "VERIFIED",
            recomputed_by: { actor_type: "tool", actor: "self-probe@9.9.9", self_attested: true },
          },
        },
      } as never,
    ]));
    const claim = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-1.json"), "utf8"),
    ) as Record<string, unknown>;
    expect((claim.verification as Record<string, unknown>).verdict).toBe("UNVERIFIED");
  });

  it("落盘 verification.recomputed_by 恒为 kernel 归因三元组且 self_attested:false（store.ts:1459 判定行字面）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    await applyTransaction(store, txOf([claimOp("CLM-2")]));
    const claim = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-2.json"), "utf8"),
    ) as { verification: Record<string, unknown> };
    expect(claim.verification).toEqual({
      verdict: "UNVERIFIED",
      recomputed_by: { actor_type: "kernel", actor: "pomaster-kernel", self_attested: false },
    });
  });

  it("自报 VERIFIED 不计入 verified：summary.unverified=1（store.ts:1096 else 分支 + :1469 重算保持计数诚实）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    await applyTransaction(store, txOf([
      {
        op: "record_claim",
        claim: { ...claimBody(), verification: { verdict: "VERIFIED" } } as never,
      },
    ]));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.evidenceSummary).toEqual({
      claims: 1,
      verified: 0,
      unverified: 1,
      rejected: 0,
    });
  });
});

/** claimOp 的裸 body（供需要额外字段的 JS 直调用例展开）。 */
function claimBody(): Record<string, unknown> {
  return {
    clm: "CLM-3",
    subjectId: gid("PAGE.DASHBOARD"),
    assertion: "自报 VERIFIED 的声称",
    assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
    evidenceRefs: [],
  };
}

// ============================================================
// 2. evidence_summary 篡改 → 真实写入路径重算纠正
// ============================================================

describe("evidence_summary 自报假计数被重算纠正（自报值不可信）", () => {
  it("手改行 summary {claims:99} → record_claim 触发重算覆盖回真值（store.ts:1470）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    tamperSummary("PAGE.DASHBOARD", { claims: 99, verified: 99, unverified: 0, rejected: 0 });
    await applyTransaction(store, txOf([claimOp("CLM-4")]));
    expect(rowSummary()).toEqual({ claims: 1, verified: 0, unverified: 1, rejected: 0 });
  });

  it("手改行 summary → 内容变更 upsert 触发重算覆盖（store.ts:1050；无 claim 时纠正为全 0）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    tamperSummary("PAGE.DASHBOARD", { claims: 99, verified: 99, unverified: 99, rejected: 99 });
    await applyTransaction(store, txOf(upsertPage({ titleZh: "仪表盘（改）" })));
    expect(rowSummary()).toEqual({ claims: 0, verified: 0, unverified: 0, rejected: 0 });
  });

  it("手改行 summary → 同内容幂等 upsert 短路保留假值（store.ts:1024-1026 短路先于重算：零写入语义对照）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    tamperSummary("PAGE.DASHBOARD", { claims: 99, verified: 99, unverified: 0, rejected: 0 });
    const result = await applyTransaction(store, txOf(upsertPage()));
    expect(result.shortCircuited).toBe(true);
    expect(rowSummary()).toEqual({ claims: 99, verified: 99, unverified: 0, rejected: 0 });
  });

  it("record_gate_run 不动 claims 计数：runs 平面与 claims 平面分离（applyRecordGateRun 只写 runsDir）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    await applyTransaction(store, txOf([claimOp("CLM-5")]));
    const gateResult = {
      grn: "GRN-1",
      gate: "CONTENT_TRUTH",
      gateDef: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
      tool: "gauntlet:ui_text_scanner",
      toolVersion: "0.2.0",
      metricDialect: "ui_text:carrier_file_count",
      ranAtSeq: 1,
      verdict: "passed" as const,
      verdictCapReason: null,
      subjectId: gid("PAGE.DASHBOARD"),
      isFixture: false,
      denominatorRefs: [],
      counts: { scanned: 10, applicableScanned: 8, violations: 0, notApplicable: 2 },
      blindspot: { scanned: 10, produced: 8, escapeRatio: 0.2 },
      trust: { asserted: null, recomputed: { violations: 0, matchesAsserted: true } },
      durationMs: { self: 5, external: 0 },
    };
    await applyTransaction(store, txOf([
      { op: "record_gate_run", run: { grn: "GRN-1", result: gateResult, trigger: "on_demand" } } as never,
    ]));
    expect(rowSummary()).toEqual({ claims: 1, verified: 0, unverified: 1, rejected: 0 });
  });
});

// ============================================================
// 3. recomputeEvidenceSummary 四态计数与平面扫描判定行
// ============================================================

describe("recomputeEvidenceSummary 计数判定行（store.ts:1085-1118）", () => {
  it("磁盘 VERIFIED/PARTIALLY_VERIFIED/REJECTED 三 claim + 事务内 staged UNVERIFIED → {claims:4, verified:1, unverified:2, rejected:1}", async () => {
    writeClaimFile("CLM-10", "PAGE.DASHBOARD", "VERIFIED");
    writeClaimFile("CLM-11", "PAGE.DASHBOARD", "PARTIALLY_VERIFIED");
    writeClaimFile("CLM-12", "PAGE.DASHBOARD", "REJECTED");
    await applyTransaction(store, txOf([...upsertPage(), claimOp("CLM-1")]));
    const index = await loadTruthIndex(store);
    // PARTIALLY_VERIFIED 归 unverified 不归 verified（:1096 注释「均未完全验证」）。
    expect(index.objects[0]?.evidenceSummary).toEqual({
      claims: 4,
      verified: 1,
      unverified: 2,
      rejected: 1,
    });
  });

  it("subject 过滤：磁盘 claim 指向对象 B 不入对象 A 计数（:1090 object_id !== id 短路），upsert B 后 B 计入", async () => {
    writeClaimFile("CLM-20", "PAGE.SETTINGS", "VERIFIED");
    await applyTransaction(store, txOf(upsertPage()));
    expect(rowSummary("PAGE.DASHBOARD")).toEqual({ claims: 0, verified: 0, unverified: 0, rejected: 0 });
    await applyTransaction(store, txOf(upsertPage({ id: gid("PAGE.SETTINGS"), titleZh: "设置" })));
    expect(rowSummary("PAGE.SETTINGS")).toEqual({ claims: 1, verified: 1, unverified: 0, rejected: 0 });
  });

  it("无 subject 的畸形 claim 文件被扫描跳过不炸不计（:1090 subject === undefined return 防线）", async () => {
    writeClaimFile("CLM-99", undefined, "VERIFIED");
    await applyTransaction(store, txOf(upsertPage()));
    expect(rowSummary()).toEqual({ claims: 0, verified: 0, unverified: 0, rejected: 0 });
  });

  it("非 .json 文件（.md 与 .json.bak）被平面扫描忽略（:1106 endsWith('.json') 判定行）", async () => {
    writeFileSync(join(root, ".pomaster", "evidence", "claims", "notes.md"), "手记：不计入证据平面");
    writeClaimFile("CLM-77", "PAGE.DASHBOARD", "VERIFIED");
    rmSync(join(root, ".pomaster", "evidence", "claims", "CLM-77.json"));
    writeFileSync(
      join(root, ".pomaster", "evidence", "claims", "CLM-77.json.bak"),
      `${JSON.stringify({
        record_type: "claim",
        clm: "CLM-77",
        subject: { object_id: "PAGE.DASHBOARD" },
        verification: { verdict: "VERIFIED" },
      })}\n`,
    );
    await applyTransaction(store, txOf(upsertPage()));
    expect(rowSummary()).toEqual({ claims: 0, verified: 0, unverified: 0, rejected: 0 });
  });

  it("claims 目录整个缺失 → readdirSync catch 兜底 files=[]，staged 计数仍准且落盘重建目录（:1100-1104 try/catch）", async () => {
    rmSync(join(root, ".pomaster", "evidence", "claims"), { recursive: true, force: true });
    await applyTransaction(store, txOf([...upsertPage(), claimOp("CLM-1")]));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.evidenceSummary).toEqual({ claims: 1, verified: 0, unverified: 1, rejected: 0 });
    expect(existsSync(join(root, ".pomaster", "evidence", "claims", "CLM-1.json"))).toBe(true);
  });
});

// ============================================================
// 4. reconcile verdict_census：全量计数字节稳定（键字典序）
// ============================================================

describe("reconcile verdict_census 重算计数（reconcile.ts:317-327 censusOf）", () => {
  /** 最小 03 形载荷（蛇形；reconcile.spec 同型 fixture）。 */
  function gatePayload(grn: string, verdict: string): Record<string, unknown> {
    return {
      grn,
      gate: "CONTENT_TRUTH",
      gate_def: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
      verdict,
      subject_id: "PAGE.DASHBOARD",
      is_fixture: false,
      counts: {
        scanned: 4,
        applicable_scanned: 4,
        violations: verdict === "failed" ? 1 : 0,
        not_applicable: 0,
      },
      blindspot: { scanned: 4, produced: 4 },
    };
  }

  async function recordRun(grn: string, verdict: string): Promise<void> {
    const fresh = await createStore(root);
    const result = normalizeGateResult(
      { value: gatePayload(grn, verdict), claimedBy: AGENT },
      {
        ranAtSeq: fresh.currentSeq ?? 0,
        trigger: "on_demand",
        tool: "gauntlet:ui_text_scanner",
        toolVersion: "0.2.0",
        metricDialect: "ui_text:carrier_file_count",
      },
    );
    await applyTransaction(store, {
      ops: [{ op: "record_gate_run", run: { grn, result, trigger: "on_demand" } }],
    });
  }

  it("census 键序 = 字典序且同输入重放字节相等（键字典序输出 → JSON 字节稳定，:317 注释契约）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const permit = await issuePermit(store, { subjectIds: [gid("PAGE.DASHBOARD")], requestedBy: HUMAN });
    await recordRun("GRN-1", "passed");
    await recordRun("GRN-2", "failed");
    await recordRun("GRN-3", "not_run");
    await applyTransaction(store, txOf([claimOp("CLM-1")]));
    writeClaimFile("CLM-2", "PAGE.DASHBOARD", "REJECTED");

    const first = await reconcilePermit(store, permit.permitRef, {});
    // 插入序是 passed,failed,not_run / UNVERIFIED,REJECTED——输出必须是字典序。
    expect(Object.keys(first.verdict_census.runs)).toEqual(["failed", "not_run", "passed"]);
    expect(Object.keys(first.verdict_census.claims)).toEqual(["REJECTED", "UNVERIFIED"]);
    const second = await reconcilePermit(store, permit.permitRef, {});
    expect(JSON.stringify(second.verdict_census)).toBe(JSON.stringify(first.verdict_census));
  });
});
