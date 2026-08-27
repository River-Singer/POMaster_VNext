/**
 * store.spec —— createStore / loadTruthIndex / applyTransaction 全链路。
 *
 * 覆盖锚点：GOLDEN-L8-4（幂等重放零写入）、GOLDEN-L1-DERIVED-NEEDS-PRODUCER（C3）、
 * GOLDEN-L1-DUP-KEY（三重查重）、GOLDEN-L1-DENOM-NO-DELETE/SUPERSEDE（C2）、
 * GOLDEN-L1-MIGRATING-PERMIT / LOCKED-CHALLENGE（跨轴断言）、GOLDEN-L1-OWNER-GHOST、
 * ADV-D24-01/02（digest 失配/手改 → WARN + auto-regen，永不阻断）、ADV-D20-04（部分
 * 写入失败回滚）、A4（无墙钟：两实例同 ops → 同 canonical digest）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GovernanceError,
  applyTransaction,
  createStore,
  doctorProbes,
  loadTruthIndex,
  type Store,
  type Transaction,
} from "@pomaster/kernel";
import { sha256OfCanonical } from "../src/digest.js";
import {
  denominatorEntry,
  derivedEnvelope,
  gid,
  makeStore,
  pageEnvelope,
  producerRecord,
  readIndex,
  readJournal,
} from "./helpers.js";

type EnvelopeOverridesLike = Record<string, unknown>;

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  // 临时目录留给 OS tmp 清理；不做 rm（避免 Windows EBUSY 噪声）。
  void root;
});

function txOf(ops: Transaction["ops"], authorityRef?: string): Transaction {
  return { ops, ...(authorityRef !== undefined ? { authorityRef } : {}) };
}

const upsertPage = (overrides: EnvelopeOverridesLike = {}): Transaction["ops"] => [
  { op: "upsert_object", envelope: pageEnvelope(overrides) as never },
];

describe("createStore / loadTruthIndex（打开与初始化）", () => {
  it("初始化骨架：目录与状态文件全部就位", async () => {
    for (const rel of [
      ".pomaster/state/truth-index.json",
      ".pomaster/state/authority.json",
      ".pomaster/state/permits.json",
      ".pomaster/state/journal.jsonl",
      ".pomaster/runtime/producers/heartbeat.jsonl",
      ".pomaster/evidence/runs",
      ".pomaster/evidence/claims",
      ".pomaster/evidence/blobs",
      ".pomaster/truth/objects",
    ]) {
      expect(existsSync(join(root, ".pomaster", rel.replace(".pomaster/", ""))), rel).toBe(true);
    }
  });

  it("初始化产生零治理事实：seq=0、空 objects/producers/denominators", () => {
    const raw = readIndex(root);
    expect(raw.objects).toEqual([]);
    expect(raw.producers).toEqual([]);
    expect(raw.denominators).toEqual([]);
    const generation = raw.generation as Record<string, unknown>;
    expect(generation.seq).toBe(0);
    expect(raw.integrity_ruleset).toBe("REF_INTEGRITY@v1");
  });

  it("骨架索引自身满足 01 schema 且 vocab 三指纹对账通过（loadTruthIndex 不抛）", async () => {
    const index = await loadTruthIndex(store);
    expect(index.irSchema).toBe("pomaster.truth-index/v1-draft");
    expect(index.contentDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(index.generation.seq).toBe(0);
  });

  it("重复 open 零变化（字节稳定，No-op is elegant）", async () => {
    const before = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const reopened = await createStore(root);
    const after = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    expect(after).toBe(before);
    expect(reopened.currentSeq).toBe(0);
  });

  it("loadTruthIndex 输出 camelCase 契约形态（denominator/producer/health 映射）", async () => {
    await applyTransaction(store, txOf([
      { op: "append_denominator", entry: denominatorEntry() as never },
      {
        op: "register_producer",
        record: producerRecord({
          producerId: "prod.api_requirement_compiler",
          entrypoint: "package://project/api-requirement",
          viewsMaintained: ["truth-index.envelope", "gate.input.CONTRACT"],
        }) as never,
      },
      { op: "upsert_object", envelope: derivedEnvelope() as never },
    ]));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]).toMatchObject({ id: "API_REQ.BIND.CARLINE.1", origin: "derived" });
    expect(index.objects[0].denominatorRefs).toEqual([]);
    expect(index.producers[0]).toMatchObject({ producerId: "prod.api_requirement_compiler", kind: "project" });
    expect(index.producers[0].liveness).toMatchObject({ status: "active", runsSinceLastOutput: 0 });
    expect(index.denominators[0]).toMatchObject({
      id: "DENOMINATOR.PAGE.V1_SURFACE",
      memberSelector: { viaBindingTable: "KEYBINDING.PAGE.V1" },
      authority: { owner: "BUSINESS_OWNER" },
    });
    expect(index.health).toMatchObject({
      deadProducers: [],
      orphanedObjects: [],
      worstBlindspot: null,
      aliasConflicts: [],
    });
  });

  it("手改 vocab 指纹 → loadTruthIndex VOCAB_MISMATCH（枚举多头拷贝免疫）", async () => {
    const path = join(root, ".pomaster", "state", "truth-index.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const vocabLock = raw.vocab_lock as Record<string, unknown>;
    vocabLock.kinds = `sha256:${"00".repeat(32)}`;
    writeFileSync(path, JSON.stringify(raw, null, 2));
    await expect(loadTruthIndex(store)).rejects.toMatchObject({ code: "VOCAB_MISMATCH" });
  });

  it("损坏的索引 JSON → SCHEMA_INVALID（禁静默当空索引）", async () => {
    writeFileSync(join(root, ".pomaster", "state", "truth-index.json"), "{not json");
    await expect(loadTruthIndex(store)).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });
});

describe("applyTransaction：upsert_object", () => {
  it("happy path：行 + 正文落盘，body_ref 机械映射（A1）", async () => {
    const result = await applyTransaction(store, txOf(upsertPage()));
    expect(result.shortCircuited).toBe(false);
    expect(result.appliedSeq).toBe(1);
    expect([...result.changedObjectIds]).toEqual(["PAGE.DASHBOARD"]);
    const index = await loadTruthIndex(store);
    expect(index.objects).toHaveLength(1);
    expect(index.objects[0]).toMatchObject({
      id: "PAGE.DASHBOARD",
      kind: "page_surface",
      rev: 1,
      bodyRef: "truth/objects/page-surface/page.dashboard.json",
      origin: "natural",
    });
    expect(existsSync(join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json"))).toBe(true);
  });

  it("API_REQ.BIND.CARLINE.1 → contract-op slug + 段间点保留/下划线转连字符", async () => {
    await applyTransaction(store, txOf([{
      op: "register_producer",
      record: producerRecord({
        producerId: "prod.api_requirement_compiler",
        entrypoint: "package://project/api-requirement",
        viewsMaintained: ["truth-index.envelope", "gate.input.CONTRACT"],
      }) as never,
    }]));
    await applyTransaction(store, txOf([{ op: "upsert_object", envelope: derivedEnvelope() as never }]));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.bodyRef).toBe(
      "truth/objects/contract-op/api-req.bind.carline.1.json",
    );
  });

  it("正文含 id/kind/axes/rev=1；行 body_sha256 = 正文 canonical 摘要（事务自动维护）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const bodyPath = join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json");
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as Record<string, unknown>;
    expect(body).toMatchObject({ id: "PAGE.DASHBOARD", kind: "page_surface", rev: 1, title_zh: "仪表盘" });
    const raw = readIndex(root);
    const row = (raw.objects as Record<string, unknown>[])[0]!;
    expect(row.body_sha256).toBe(sha256OfCanonical(body));
    expect(String(row.body_sha256)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("二次内容变更 → rev 单调递增（1→2）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    await applyTransaction(store, txOf(upsertPage({ titleZh: "仪表盘（改）" })));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.rev).toBe(2);
    expect(index.generation.seq).toBe(2);
  });

  it("同内容重放 → 零写入短路：rev 不空转、seq 不动（GOLDEN-L8-4）", async () => {
    const first = await applyTransaction(store, txOf(upsertPage()));
    const indexBytesBefore = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const second = await applyTransaction(store, txOf(upsertPage()));
    const indexBytesAfter = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    expect(second.shortCircuited).toBe(true);
    expect(second.appliedSeq).toBe(first.appliedSeq);
    expect(indexBytesAfter).toBe(indexBytesBefore);
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.rev).toBe(1);
  });

  it("origin=derived 缺 producer 块 → SCHEMA_INVALID（C3 死 factsource 免疫）", async () => {
    await expect(
      applyTransaction(store, txOf([{ op: "upsert_object", envelope: derivedEnvelope({ producer: null }) as never }])),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("origin=derived 带 producer 块 → 行带 producer_id、正文带 producer 声明", async () => {
    await applyTransaction(store, txOf([{
      op: "register_producer",
      record: producerRecord({
        producerId: "prod.api_requirement_compiler",
        entrypoint: "package://project/api-requirement",
        viewsMaintained: ["truth-index.envelope", "gate.input.CONTRACT"],
      }) as never,
    }]));
    await applyTransaction(store, txOf([{ op: "upsert_object", envelope: derivedEnvelope() as never }]));
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.producerId).toBe("prod.api_requirement_compiler");
  });

  it("幽灵 owner → GHOST_AUTHORITY_OWNER（FATAL 而非 WARNING）", async () => {
    await expect(
      applyTransaction(store, txOf(upsertPage({ authority: { owner: "NOT_REGISTERED_OWNER", delegates: [] } }))),
    ).rejects.toMatchObject({ code: "GHOST_AUTHORITY_OWNER" });
  });

  it("未知前缀 id → GovernanceError FATAL_UNKNOWN_PREFIX（store 层包装 GovernedIdParseError）", async () => {
    const bad = await applyTransaction(store, txOf([
      { op: "upsert_object", envelope: pageEnvelope({ id: "FOO.BAR_THING" }) as never },
    ])).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(GovernanceError);
    expect((bad as GovernanceError).code).toBe("FATAL_UNKNOWN_PREFIX");
    expect((bad as GovernanceError).hint).toContain("词汇表 PR");
  });

  it("文法违规 id → FATAL_ID_GRAMMAR", async () => {
    const bad = await applyTransaction(store, txOf([
      { op: "upsert_object", envelope: pageEnvelope({ id: "PAGE.0087" }) as never },
    ])).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("FATAL_ID_GRAMMAR");
  });

  it("kind 词表外值 → VOCAB_INVALID_VALUE（gate_result 等 forbidden_in_index，A8）", async () => {
    const bad = await applyTransaction(store, txOf([
      { op: "upsert_object", envelope: pageEnvelope({ kind: "gate_result" }) as never },
    ])).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("VOCAB_INVALID_VALUE");
  });

  it("forbidden 来源 ai_invention → SOURCE_TYPE_FORBIDDEN（Transition 层 FATAL 并留痕）", async () => {
    const bad = await applyTransaction(store, txOf(upsertPage({
      sources: [{ type: "ai_invention", ref: "notes/improvised.md", capturedBy: "agent:x" }],
    }))).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("SOURCE_TYPE_FORBIDDEN");
  });

  it("来源缺 pin → SOURCE_PIN_MISSING（基线漂移免疫，GOLDEN-L1-SOURCE-PIN）", async () => {
    const bad = await applyTransaction(store, txOf(upsertPage({
      sources: [{ type: "bp_blueprint", ref: "bp/base.md", capturedBy: "human:owner" }],
    }))).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("SOURCE_PIN_MISSING");
  });

  it("来源绝对盘符路径 → SCHEMA_INVALID（provenance 可移植纪律）", async () => {
    const bad = await applyTransaction(store, txOf(upsertPage({
      sources: [{ type: "bp_blueprint", ref: "D:\\tmp\\bp.md", capturedBy: "human:owner", pin: { baseline: "20260814" } }],
    }))).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("SCHEMA_INVALID");
  });

  it("合法来源（bp_blueprint + pin）落盘正文 sources", async () => {
    await applyTransaction(store, txOf(upsertPage({
      sources: [{ type: "bp_blueprint", ref: "bp/base.md", capturedBy: "human:owner", pin: { baseline: "20260814" } }],
    })));
    const body = JSON.parse(
      readFileSync(join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json"), "utf8"),
    ) as Record<string, unknown>;
    expect((body.sources as Record<string, unknown>[])[0]).toMatchObject({
      type: "bp_blueprint",
      captured_by: "human:owner",
      pin: { baseline: "20260814" },
    });
  });

  it("change=MIGRATING 无 PERMIT → CROSS_AXIS_ASSERTION（GOLDEN-L1-MIGRATING-PERMIT）", async () => {
    const bad = await applyTransaction(store, txOf(upsertPage({
      axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "MIGRATING" },
    }))).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("CROSS_AXIS_ASSERTION");
  });

  it("PROPOSED 而 evidence≠PLANNED → CROSS_AXIS_ASSERTION（跨轴耦合断言归事务层）", async () => {
    const bad = await applyTransaction(store, txOf(upsertPage({
      axes: { lifecycle: "PROPOSED", confidence: "UNRESOLVED", evidence: "IMPLEMENTED", change: "STABLE" },
    }))).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("CROSS_AXIS_ASSERTION");
  });

  it("change_object 缺 class_scan_result → CLASS_SCAN_REQUIRED（R4）", async () => {
    const bad = await applyTransaction(store, txOf(upsertPage({
      id: gid("CHANGE.FIX_GRID"),
      kind: "change_object",
      axisProfile: "change_default",
      titleZh: "修复表格",
      payload: { motivation: "x" },
    }))).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("CLASS_SCAN_REQUIRED");
  });

  it("task_object 带完整 class_scan_result → 合法落盘（回归锚 TEST.*）", async () => {
    const result = await applyTransaction(store, txOf(upsertPage({
      id: gid("TASK.T0001"),
      kind: "task_object",
      axisProfile: "task_default",
      titleZh: "任务一",
      payload: {
        intent: "修复",
        acceptance: [{ id: 1 }],
        class_scan_result: { scope: "src/shared/grid/**", hits: 4, fixed_count: 4, regression_case_ref: "TEST.GRID.CSV_ESCAPE" },
      },
    })));
    expect(result.changedObjectIds).toContain("TASK.T0001");
  });

  it("lifecycle=SUPERSEDED 缺 successorRef → SUCCESSOR_REQUIRED", async () => {
    const bad = await applyTransaction(store, txOf(upsertPage({
      axes: { lifecycle: "SUPERSEDED", confidence: "LOCKED", evidence: "IMPLEMENTED", change: "STABLE" },
    }))).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("SUCCESSOR_REQUIRED");
  });

  it("SUPERSEDED 带 successorRef → 正文与行均落 successor_ref（机器归类 SUPERSEDED vs DEPRECATED）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    await applyTransaction(store, txOf(upsertPage({
      id: gid("PAGE.DASHBOARD_V2"),
      titleZh: "仪表盘 V2",
      supersedes: { id: gid("PAGE.DASHBOARD"), reasonShort: "信息架构重组" },
    })));
    await applyTransaction(store, txOf(upsertPage({
      axes: { lifecycle: "SUPERSEDED", confidence: "LOCKED", evidence: "IMPLEMENTED", change: "STABLE" },
      successorRef: gid("PAGE.DASHBOARD_V2"),
      supersedes: { id: gid("PAGE.DASHBOARD_V2"), reasonShort: "被 V2 替代" },
    })));
    const index = await loadTruthIndex(store);
    const oldRow = index.objects.find((row) => row.id === "PAGE.DASHBOARD");
    expect(oldRow?.axes.lifecycle).toBe("SUPERSEDED");
    const body = JSON.parse(
      readFileSync(join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(body.successor_ref).toBe("PAGE.DASHBOARD_V2");
    expect(body.supersedes).toMatchObject({ id: "PAGE.DASHBOARD_V2", reason_short: "被 V2 替代" });
  });

  it("别名双向链入正文 aliases；与既有对象 normalized_key 冲突 → health.alias_conflicts 非空（GOLDEN-L1-DUP-KEY）", async () => {
    await applyTransaction(store, txOf(upsertPage({ id: gid("PAGE.CONTROL.DROPDOWN"), titleZh: "下拉" })));
    await applyTransaction(store, txOf(upsertPage({
      id: gid("PAGE.MASTER_DROPDOWN"),
      titleZh: "主下拉",
      aliases: ["PAGE.CONTROL.DROPDOWN"],
    })));
    const index = await loadTruthIndex(store);
    expect(index.health.aliasConflicts).toHaveLength(1);
    expect(index.health.aliasConflicts[0]).toMatchObject({
      normalizedKey: "PAGE.CONTROL.DROPDOWN",
      conflictingIds: ["PAGE.CONTROL.DROPDOWN", "PAGE.MASTER_DROPDOWN"],
    });
  });

  it("op 校验失败 → 事务整体不落任何文件（fail-fast before plan execution）", async () => {
    const before = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    await expect(
      applyTransaction(store, txOf([
        { op: "upsert_object", envelope: pageEnvelope() as never },
        { op: "upsert_object", envelope: pageEnvelope({ id: "FOO.BAD" }) as never },
      ])),
    ).rejects.toThrow();
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(before);
  });
});

describe("applyTransaction：transition_object", () => {
  async function seedProposed(): Promise<void> {
    await applyTransaction(store, txOf(upsertPage({
      axes: { lifecycle: "PROPOSED", confidence: "UNRESOLVED", evidence: "PLANNED", change: "STABLE" },
      titleZh: "新页面提案",
    })));
  }

  it("PROPOSED→CURRENT 带 authorityRef → 行与正文 axes 同步更新、rev+1", async () => {
    await seedProposed();
    const result = await applyTransaction(store, txOf([
      {
        op: "transition_object",
        id: gid("PAGE.DASHBOARD"),
        patch: { lifecycle: "CURRENT", confidence: "PROVISIONAL" },
        reasonShort: "owner 审批通过",
      },
    ], "PERMIT.CHANGE_MIGRATION_001.1"));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.axes).toMatchObject({ lifecycle: "CURRENT", confidence: "PROVISIONAL" });
    expect(index.objects[0]?.rev).toBe(2);
  });

  it("PROPOSED→CURRENT 缺 authorityRef → EVOLUTION_REQUIRED（审批记录缺失）", async () => {
    await seedProposed();
    const bad = await applyTransaction(store, txOf([
      {
        op: "transition_object",
        id: gid("PAGE.DASHBOARD"),
        patch: { lifecycle: "CURRENT" },
        reasonShort: "x",
      },
    ])).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("EVOLUTION_REQUIRED");
  });

  it("SUPERSEDED→CURRENT（撤销 supersede）→ TRANSITION_ILLEGAL（vocab-lock lock 胜出）", async () => {
    await seedProposed();
    await applyTransaction(store, txOf([{ op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "CURRENT" }, reasonShort: "x" }], "PERMIT.X.1"));
    const bad = await applyTransaction(store, txOf(upsertPage({ id: gid("PAGE.DASHBOARD_V2") })))
      .then(async () => {
        await applyTransaction(store, txOf(upsertPage({
          axes: { lifecycle: "SUPERSEDED", confidence: "LOCKED", evidence: "IMPLEMENTED", change: "STABLE" },
          successorRef: gid("PAGE.DASHBOARD_V2"),
        })));
        return applyTransaction(store, txOf([
          { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "CURRENT" }, reasonShort: "撤销" },
        ], "PERMIT.X.2"));
      })
      .catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("TRANSITION_ILLEGAL");
  });

  it("转移不存在的对象 → OBJECT_NOT_FOUND（显式缺席）", async () => {
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.NOPE"), patch: { lifecycle: "CURRENT" }, reasonShort: "x" },
    ])).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("OBJECT_NOT_FOUND");
  });

  it("CURRENT→SUPERSEDED 而正文无 successor_ref → SUCCESSOR_REQUIRED", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "SUPERSEDED" }, reasonShort: "x" },
    ], "PERMIT.X.1")).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("SUCCESSOR_REQUIRED");
  });

  it("CURRENT→SUPERSEDED（已预登记 successor_ref + transition_record）→ 合法", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    await applyTransaction(store, txOf(upsertPage({ id: gid("PAGE.DASHBOARD_V2"), titleZh: "V2" })));
    await applyTransaction(store, txOf(upsertPage({ successorRef: gid("PAGE.DASHBOARD_V2") })));
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "SUPERSEDED" }, reasonShort: "被 V2 替代" },
    ], "CHANGE.MIGRATION_001"));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
    const index = await loadTruthIndex(store);
    expect(index.objects.find((row) => row.id === "PAGE.DASHBOARD")?.axes.lifecycle).toBe("SUPERSEDED");
  });

  it("LOCKED+STABLE→CHALLENGED 缺决策引用 → EVOLUTION_REQUIRED（GOLDEN-L1-LOCKED-CHALLENGE）", async () => {
    await applyTransaction(store, txOf(upsertPage({
      axes: { lifecycle: "CURRENT", confidence: "LOCKED", evidence: "IMPLEMENTED", change: "STABLE" },
    })));
    const bad = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "CHALLENGED" }, reasonShort: "x" },
    ])).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("EVOLUTION_REQUIRED");
  });

  it("LOCKED+STABLE→CHALLENGED 附 DECISION 引用 → 放行（LOCKED 不是圣旨但也不是随便挑战）", async () => {
    await applyTransaction(store, txOf(upsertPage({
      axes: { lifecycle: "CURRENT", confidence: "LOCKED", evidence: "IMPLEMENTED", change: "STABLE" },
    })));
    const result = await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { change: "CHALLENGED" }, reasonShort: "翻案挑战" },
    ], "CHANGE.ACR_001"));
    expect(result.changedObjectIds).toContain("PAGE.DASHBOARD");
  });

  it("转移后 doctor 四检仍全绿（写入不破坏一致性）", async () => {
    await seedProposed();
    await applyTransaction(store, txOf([
      { op: "transition_object", id: gid("PAGE.DASHBOARD"), patch: { lifecycle: "CURRENT" }, reasonShort: "x" },
    ], "PERMIT.X.1"));
    const report = await doctorProbes(store);
    expect(report.ok).toBe(true);
  });
});

describe("applyTransaction：register_producer / heartbeat", () => {
  it("register_producer → producers[] 注册；重复同内容注册零变化", async () => {
    const first = await applyTransaction(store, txOf([{ op: "register_producer", record: producerRecord() as never }]));
    expect(first.shortCircuited).toBe(false);
    const bytes = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const again = await applyTransaction(store, txOf([{ op: "register_producer", record: producerRecord() as never }]));
    expect(again.shortCircuited).toBe(true);
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(bytes);
  });

  it("producer_id 词形非法 / dead 而 runs=0 → SCHEMA_INVALID", async () => {
    await expect(
      applyTransaction(store, txOf([{ op: "register_producer", record: producerRecord({ producerId: "Ghost Compiler" }) as never }])),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      applyTransaction(store, txOf([{
        op: "register_producer",
        record: producerRecord({ liveness: { status: "dead", runsSinceLastOutput: 0, lastOutputSeq: 5 } }) as never,
      }])),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("heartbeat：侧车追加 + 活性快照更新（不进 hash，A4）", async () => {
    await applyTransaction(store, txOf([{ op: "register_producer", record: producerRecord() as never }]));
    const result = await applyTransaction(store, txOf([{ op: "heartbeat", producerId: "prod.demo_compiler", wroteObjectIds: [gid("PAGE.DASHBOARD")] }]));
    const heartbeat = readFileSync(join(root, ".pomaster", "runtime", "producers", "heartbeat.jsonl"), "utf8");
    expect(heartbeat).toContain("prod.demo_compiler");
    const index = await loadTruthIndex(store);
    expect(index.producers[0]?.liveness).toMatchObject({
      status: "active",
      lastOutputSeq: result.appliedSeq,
      runsSinceLastOutput: 0,
    });
    const bad = await applyTransaction(store, txOf([{ op: "heartbeat", producerId: "prod.ghost", wroteObjectIds: [] }])).catch((e: unknown) => e);
    expect((bad as GovernanceError).code).toBe("OBJECT_NOT_FOUND");
  });
});

describe("applyTransaction：append_denominator（C2 一等公民）", () => {
  it("合法追加 → denominators[] 落盘（loadTruthIndex 可回读）", async () => {
    await applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry() as never }]));
    const index = await loadTruthIndex(store);
    expect(index.denominators).toHaveLength(1);
    expect(index.denominators[0]).toMatchObject({ id: "DENOMINATOR.PAGE.V1_SURFACE", version: 1, status: "CURRENT" });
  });

  it("同一 (id, version) 重复追加（内容不同非重放）→ REF_INTEGRITY_VIOLATION（DENOM_UNIQ_001）", async () => {
    await applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry() as never }]));
    await expect(
      applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry({ membersCount: 99 }) as never }])),
    ).rejects.toMatchObject({ code: "REF_INTEGRITY_VIOLATION" });
  });

  it("完全相同的追加 tx = 幂等重放 → 零写入短路（inputs_fingerprint 短路优先于查重）", async () => {
    const tx = txOf([{ op: "append_denominator", entry: denominatorEntry() as never }]);
    await applyTransaction(store, tx);
    const replay = await applyTransaction(store, tx);
    expect(replay.shortCircuited).toBe(true);
  });

  it("SUPERSEDED 缺 successorRef → SUCCESSOR_REQUIRED；status=REJECTED → VOCAB_INVALID_VALUE（删除路径封死）", async () => {
    await expect(
      applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry({ status: "SUPERSEDED" }) as never }])),
    ).rejects.toMatchObject({ code: "SUCCESSOR_REQUIRED" });
    await expect(
      applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry({ status: "REJECTED" }) as never }])),
    ).rejects.toMatchObject({ code: "VOCAB_INVALID_VALUE" });
  });

  it("successor_of 含自身 → REF_INTEGRITY_VIOLATION（DENOM_CHAIN_002 无环）；member_selector 空 → SCHEMA_INVALID", async () => {
    await expect(
      applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry({ successorOf: [gid("DENOMINATOR.PAGE.V1_SURFACE")] }) as never }])),
    ).rejects.toMatchObject({ code: "REF_INTEGRITY_VIOLATION" });
    await expect(
      applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry({ memberSelector: {} }) as never }])),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
  });

  it("非 DENOMINATOR 前缀 → SCHEMA_INVALID；旧 version 不复用（version 2 追加合法）", async () => {
    await expect(
      applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry({ id: gid("PAGE.V1") }) as never }])),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry() as never }]));
    await applyTransaction(store, txOf([{ op: "append_denominator", entry: denominatorEntry({ version: 2, membersCount: 3 }) as never }]));
    const index = await loadTruthIndex(store);
    expect(index.denominators).toHaveLength(2);
  });
});

describe("applyTransaction：record_claim / record_gate_run（A8 evidence 平面）", () => {
  it("record_claim → claims/CLM-*.json 落盘 + 对象 evidence_summary 计数（UNVERIFIED 初始态）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    await applyTransaction(store, txOf([{
      op: "record_claim",
      claim: {
        clm: "CLM-1",
        subjectId: gid("PAGE.DASHBOARD"),
        assertion: "TITLE_COPIED：标题文案已按蓝图更新",
        assertedBy: { actorType: "agent", actor: "claude/session-93", selfAttested: true },
        evidenceRefs: [],
      },
    }]));
    const claim = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-1.json"), "utf8")) as Record<string, unknown>;
    expect(claim).toMatchObject({
      record_type: "claim",
      subject: { object_id: "PAGE.DASHBOARD" },
      is_fixture: false,
      asserted_by: { actor: "claude/session-93", self_attested: true },
    });
    expect((claim.verification as Record<string, unknown>).verdict).toBe("UNVERIFIED");
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.evidenceSummary).toEqual({ claims: 1, verified: 0, unverified: 1, rejected: 0 });
  });

  it("TEST.* subject 的 claim → is_fixture=true（Q3）；claim 指向不存在对象 → OBJECT_NOT_FOUND", async () => {
    await applyTransaction(store, txOf(upsertPage({ id: gid("TEST.FIXTURE.PAGE") })));
    await applyTransaction(store, txOf([{
      op: "record_claim",
      claim: {
        clm: "CLM-2",
        subjectId: gid("TEST.FIXTURE.PAGE"),
        assertion: "FIXTURE_ASSERTION",
        assertedBy: { actorType: "agent", actor: "a", selfAttested: true },
        evidenceRefs: [],
      },
    }]));
    const claim = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-2.json"), "utf8")) as Record<string, unknown>;
    expect(claim.is_fixture).toBe(true);
    await expect(
      applyTransaction(store, txOf([{
        op: "record_claim",
        claim: {
          clm: "CLM-3",
          subjectId: gid("PAGE.NOPE"),
          assertion: "x",
          assertedBy: { actorType: "agent", actor: "a", selfAttested: true },
          evidenceRefs: [],
        },
      }])),
    ).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });

  it("record_gate_run → evidence/runs/GRN-*.json inline 形态；truth-index 顶层无 gate_results 键（A8 结构封死）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const gateResult = {
      grn: "GRN-1",
      gate: "CONTENT_TRUTH",
      gateDef: "POLICY.GATE.CONTENT_TRUTH@1.4.0",
      ranAtSeq: 1,
      verdict: "passed" as const,
      verdictCapReason: null,
      subjectId: gid("PAGE.DASHBOARD"),
      isFixture: false,
      denominatorRefs: [],
      counts: { scanned: 10, applicableScanned: 8, violations: 0, notApplicable: 2 },
      blindspot: { scanned: 10, produced: 8, escapeRatio: 0.2 },
      trust: {
        asserted: { value: { violations: 0 }, claimedBy: { actorType: "agent" as const, actor: "a", selfAttested: true } },
        recomputed: { violations: 0, matchesAsserted: true },
      },
      durationMs: { self: 5, external: 0 },
    };
    await applyTransaction(store, txOf([{ op: "record_gate_run", run: { grn: "GRN-1", result: gateResult, trigger: "pre_closeout" } }]));
    const run = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-1.json"), "utf8")) as Record<string, unknown>;
    expect(run).toMatchObject({ record_type: "run", grn: "GRN-1", trigger: { type: "pre_closeout" } });
    const inline = (run.gate_result as Record<string, unknown>).result as Record<string, unknown>;
    expect(inline).toMatchObject({ gate_def: "POLICY.GATE.CONTENT_TRUTH@1.4.0", verdict: "passed" });
    expect((inline.counts as Record<string, unknown>).not_applicable).toBe(2);
    const raw = readIndex(root);
    expect(raw).not.toHaveProperty("gate_results");
    expect(raw).not.toHaveProperty("claims");
  });

  it("Q3 失配的 GateResult 拒绝落盘 → FIXTURE_ISOLATION_VIOLATION", async () => {
    const gateResult = {
      grn: "GRN-2",
      gate: "DOM_PROBE",
      gateDef: "POLICY.GATE.DOM_PROBE@0.3.1",
      ranAtSeq: 1,
      verdict: "passed" as const,
      verdictCapReason: null,
      subjectId: gid("TEST.FIXTURE.GRID"),
      isFixture: false,
      denominatorRefs: [],
      counts: { scanned: 1, applicableScanned: 1, violations: 0, notApplicable: 0 },
      blindspot: { scanned: 1, produced: 1, escapeRatio: 0 },
      trust: { asserted: null, recomputed: { violations: 0, matchesAsserted: true } },
      durationMs: { self: 1, external: 0 },
    };
    await expect(
      applyTransaction(store, txOf([{ op: "record_gate_run", run: { grn: "GRN-2", result: gateResult, trigger: "post_edit" } }])),
    ).rejects.toMatchObject({ code: "FIXTURE_ISOLATION_VIOLATION" });
  });
});

describe("D24 哈希伦理（ADV-D24-01/02：WARN + auto-regen，永不阻断）", () => {
  const FAKE_DIGEST = `sha256:${"ab".repeat(32)}`;

  it("手改 content_digest（合法词形假值）→ 写入成功 + digestWarnings + 自动重算覆盖", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const path = join(root, ".pomaster", "state", "truth-index.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    raw.content_digest = FAKE_DIGEST;
    writeFileSync(path, JSON.stringify(raw, null, 2));
    const result = await applyTransaction(store, txOf(upsertPage({ titleZh: "仪表盘（改）" })));
    expect(result.shortCircuited).toBe(false);
    expect(result.digestWarnings.some((warning) => warning.includes("content_digest mismatch"))).toBe(true);
    const index = await loadTruthIndex(store);
    expect(index.contentDigest).not.toBe(FAKE_DIGEST);
  });

  it("篡改正文内容 → body_sha256 失配被抽验：WARN + auto-regen，不拦写（ADV-D24-01）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const bodyPath = join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json");
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as Record<string, unknown>;
    body.payload = { surface: "V1", tampered: true };
    writeFileSync(bodyPath, `${JSON.stringify(body, null, 2)}\n`);
    const result = await applyTransaction(store, txOf(upsertPage({ id: gid("PAGE.SETTINGS"), titleZh: "设置" })));
    expect(result.digestWarnings.some((warning) => warning.includes("body_sha256 mismatch for PAGE.DASHBOARD"))).toBe(true);
    const index = await loadTruthIndex(store);
    const row = index.objects.find((candidate) => candidate.id === "PAGE.DASHBOARD");
    expect(row?.bodySha256).toBe(sha256OfCanonical(JSON.parse(readFileSync(bodyPath, "utf8")) as unknown));
  });

  it("手改行 body_sha256（合法词形假值）→ 下一事务自动重算覆盖该字段（ADV-D24-02）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const path = join(root, ".pomaster", "state", "truth-index.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const row = (raw.objects as Record<string, unknown>[])[0]!;
    row.body_sha256 = FAKE_DIGEST;
    writeFileSync(path, JSON.stringify(raw, null, 2));
    const result = await applyTransaction(store, txOf(upsertPage({ titleZh: "改" })));
    expect(result.digestWarnings.some((warning) => warning.includes("body_sha256 mismatch for PAGE.DASHBOARD"))).toBe(true);
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.bodySha256).not.toBe(FAKE_DIGEST);
  });

  it("正文文件缺失 → REF_INTEGRITY_VIOLATION（A1 成对存在；非 digest 事务不算）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const bodyPath = join(root, ".pomaster", "truth", "objects", "page-surface", "page.dashboard.json");
    rmSync(bodyPath);
    await expect(
      applyTransaction(store, txOf(upsertPage({ id: gid("PAGE.SETTINGS"), titleZh: "设置" }))),
    ).rejects.toMatchObject({ code: "REF_INTEGRITY_VIOLATION" });
  });

  it("A4 无墙钟：两个独立 store 跑同一组 ops → content_digest 逐字节相等", async () => {
    const first = await makeStore();
    const second = await makeStore();
    const ops = txOf([
      { op: "append_denominator", entry: denominatorEntry() as never },
      {
        op: "register_producer",
        record: producerRecord({
          producerId: "prod.api_requirement_compiler",
          entrypoint: "package://project/api-requirement",
          viewsMaintained: ["truth-index.envelope", "gate.input.CONTRACT"],
        }) as never,
      },
      { op: "upsert_object", envelope: derivedEnvelope() as never },
    ]);
    await applyTransaction(first.store, ops);
    await applyTransaction(second.store, ops);
    const a = await loadTruthIndex(first.store);
    const b = await loadTruthIndex(second.store);
    expect(a.contentDigest).toBe(b.contentDigest);
    expect(a.generation.seq).toBe(b.generation.seq);
  });

  it("完全相同的 tx 重放 → shortCircuited=true 且 journal 零追加（零写入含侧车）", async () => {
    const tx = txOf(upsertPage());
    await applyTransaction(store, tx);
    const journalBefore = readJournal(root);
    const indexBefore = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const replay = await applyTransaction(store, tx);
    expect(replay.shortCircuited).toBe(true);
    expect(replay.digestWarnings).toEqual([]);
    expect(readJournal(root)).toBe(journalBefore);
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(indexBefore);
  });

  it("journal 记 TX_APPLIED 事件：seq/ops/changed_object_ids 留痕", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const journal = readJournal(root);
    expect(journal).toContain("TX_APPLIED");
    expect(journal).toContain("upsert_object");
    expect(journal).toContain("PAGE.DASHBOARD");
  });
});

describe("staged 写入与回滚（ADV-D20-04 部分写入失败伪装成功免疫）", () => {
  it("落盘中途失败 → 索引/侧车回滚到事务前字节 + 无 tmp 残留（不凭 exists() 推断删除）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const indexBefore = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const journalBefore = readJournal(root);
    // 用目录占用 claims 目标路径：rename 必败（staged 计划先建 tmp 后逐个 rename）。
    const blocked = join(root, ".pomaster", "evidence", "claims", "CLM-9.json");
    mkdirSync(blocked);
    await expect(
      applyTransaction(store, txOf([
        {
          op: "record_claim",
          claim: {
            clm: "CLM-9",
            subjectId: gid("PAGE.DASHBOARD"),
            assertion: "blocked claim",
            assertedBy: { actorType: "agent", actor: "a", selfAttested: true },
            evidenceRefs: [],
          },
        },
      ])),
    ).rejects.toThrow();
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(indexBefore);
    expect(readJournal(root)).toBe(journalBefore);
    const leftovers: string[] = [];
    const collect = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "objects" || entry.name === "runs" || entry.name === "claims" || entry.name === "blobs" || entry.name === "producers" || entry.name === "state" || entry.name === "runtime" || entry.name === "truth" || entry.name === "evidence" || entry.name === ".pomaster") {
            collect(full);
          }
          continue;
        }
        if (/\.tmp-\d+/.test(entry.name)) leftovers.push(full);
      }
    };
    collect(join(root, ".pomaster"));
    expect(leftovers).toEqual([]);
  });

  it("失败回滚后重跑收敛（幂等收敛）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const blocked = join(root, ".pomaster", "evidence", "claims", "CLM-8.json");
    mkdirSync(blocked);
    await expect(
      applyTransaction(store, txOf([{
        op: "record_claim",
        claim: {
          clm: "CLM-8",
          subjectId: gid("PAGE.DASHBOARD"),
          assertion: "x",
          assertedBy: { actorType: "agent", actor: "a", selfAttested: true },
          evidenceRefs: [],
        },
      }])),
    ).rejects.toThrow();
    rmDir(blocked);
    const result = await applyTransaction(store, txOf([{
      op: "record_claim",
      claim: {
        clm: "CLM-8",
        subjectId: gid("PAGE.DASHBOARD"),
        assertion: "x",
        assertedBy: { actorType: "agent", actor: "a", selfAttested: true },
        evidenceRefs: [],
      },
    }]));
    expect(result.shortCircuited).toBe(false);
    const index = await loadTruthIndex(store);
    expect(index.objects[0]?.evidenceSummary.claims).toBe(1);
  });

  it("createStore 后 store.currentSeq 反映打开时点（事务后句柄值不漂移——重开可见新 seq）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    expect(store.currentSeq).toBe(0);
    const reopened = await createStore(root);
    expect(reopened.currentSeq).toBe(1);
  });

  it("并发语义烟囱：写入后的索引 stat 尺寸稳定（重开无隐性重写）", async () => {
    await applyTransaction(store, txOf(upsertPage()));
    const path = join(root, ".pomaster", "state", "truth-index.json");
    const sizeBefore = statSync(path).size;
    await createStore(root);
    expect(statSync(path).size).toBe(sizeBefore);
  });
});

function rmDir(dir: string): void {
  rmdirSync(dir);
}
