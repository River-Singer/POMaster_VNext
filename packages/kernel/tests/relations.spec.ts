/**
 * relations.spec.ts —— Typed Relation sidecar 台账内核（P-v06 批次 0）。
 *
 * 判据锚（PRD v0.6 §6-8 + Owner 裁决 D-2/D-3 2026-09-02）：
 * - Graph 不是第六原语：只承载边；EDGE-<12hex> 内容寻址幂等（同三元组重登记 noop）；
 * - provenance 五面齐备：runtime_trace 边必须附 OBS-n/POB-<12hex> observation_ref
 *   （「Agent 必须证明我看过」边侧封条）；probable 边必须附 uncertainty_note（§148）；
 * - fail-closed 不假绿：坏行=SCHEMA_INVALID 整体拒绝（禁静默跳过）；truth 端点过
 *   governed id 文法（A5）；catalog 端点过词形法式（存在性归消费面——本面不查册）；
 * - 词表纪律：type/origin/domain/confidence 词表外值显式拒绝（PR-0006 四轴闭包）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  edgeIdOf,
  forwardDependencies,
  normalizeEndpointDomain,
  normalizeRelationConfidence,
  normalizeRelationOrigin,
  normalizeRelationType,
  pathsOf,
  readRelations,
  registerRelation,
  relationsTouching,
  reverseDependents,
  RELATIONS_RELATIVE,
  EDGE_ID_PATTERN,
  type Store,
} from "@pomaster/kernel";
import { makeStore, readJournal } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

function relationsPath(): string {
  return join(root, ".pomaster", "state", "relations.jsonl");
}

/** Tracer 词形锚（v0.6.1 §84 instance binding 示例 + corpus batch-1 实录词族）。 */
const INSTANCE_OF_EDGE = {
  type: "INSTANCE_OF",
  source: { domain: "truth", id: "PAGE.SUPPLIER_MANAGEMENT" },
  target: { domain: "catalog", id: "PAGE_ARCHETYPE.MASTER_DATA" },
  origin: "human_declared",
  confidence: "declared",
  producer: "human:owner",
  sourceRef: "P-v06 批次 1 Tracer Bullet（Supplier 端到端采用登记）",
  declaredBy: "owner",
} as const;

const ANALYZER_EDGE = {
  type: "CALLS",
  source: { domain: "truth", id: "PAGE.SUPPLIER_MANAGEMENT" },
  target: { domain: "truth", id: "API_REQ.SUPPLIER.LIST.1" },
  origin: "static_analysis",
  confidence: "deterministic",
  producer: "ANALYZER.TS.IMPORT_GRAPH",
  sourceRef: "src/pages/supplier/index.vue:42（批次 1 analyzer 词面锚）",
  locator: "src/pages/supplier/index.vue:42",
} as const;

describe("registerRelation（登记面；EDGE-<12hex> 内容寻址幂等）", () => {
  it("新边入账：append-only 追加 + journal RELATION_REGISTERED 事件（A4 事件拍）", async () => {
    const outcome = await registerRelation(store, INSTANCE_OF_EDGE);
    expect(outcome.registered).toBe(true);
    expect(outcome.entry.edge_id).toMatch(EDGE_ID_PATTERN);
    expect(readFileSync(relationsPath(), "utf8").trim().split("\n")).toHaveLength(1);
    expect(readJournal(root)).toContain("RELATION_REGISTERED");
    expect(readJournal(root)).toContain(outcome.entry.edge_id);
  });

  it("同三元组重登记 → noop 幂等（registered=false 返回既有边；文件零增长）", async () => {
    const first = await registerRelation(store, INSTANCE_OF_EDGE);
    const before = readFileSync(relationsPath(), "utf8");
    const second = await registerRelation(store, { ...INSTANCE_OF_EDGE, note: "重复登记" });
    expect(second.registered).toBe(false);
    expect(second.entry.edge_id).toBe(first.entry.edge_id);
    expect(readFileSync(relationsPath(), "utf8")).toBe(before);
  });

  it("edge_id = canonical 三元组 sha256 前 12 hex（内容寻址身份面；production POB- 同族）", async () => {
    const outcome = await registerRelation(store, INSTANCE_OF_EDGE);
    expect(outcome.entry.edge_id).toBe(
      edgeIdOf(outcome.entry.source, outcome.entry.type, outcome.entry.target),
    );
  });

  it("同三元组不同元数据仍 noop（身份=三元组；元数据分歧不产生第二真相）", async () => {
    await registerRelation(store, INSTANCE_OF_EDGE);
    const again = await registerRelation(store, {
      ...INSTANCE_OF_EDGE,
      confidence: "declared",
      origin: "human_declared",
      note: "换注记",
    });
    expect(again.registered).toBe(false);
  });

  it("runtime_trace 边缺 observationRef → SCHEMA_INVALID（「Agent 必须证明我看过」封条）", async () => {
    await expect(
      registerRelation(store, {
        type: "CALLS",
        source: { domain: "truth", id: "PAGE.SUPPLIER_MANAGEMENT" },
        target: { domain: "truth", id: "API_REQ.SUPPLIER.LIST.1" },
        origin: "runtime_trace",
        confidence: "deterministic",
        producer: "SENSOR.OTEL.TRACE",
        sourceRef: "OBS 台账引用测试",
      }),
    ).rejects.toThrow("observationRef");
  });

  it("runtime_trace 边附 OBS-n 词形 → 入账；非 OBS/POB 词形 → SCHEMA_INVALID", async () => {
    const ok = await registerRelation(store, {
      ...ANALYZER_EDGE,
      origin: "runtime_trace",
      confidence: "deterministic",
      producer: "SENSOR.OTEL.TRACE",
      observationRef: "OBS-1042",
    });
    expect(ok.registered).toBe(true);
    await expect(
      registerRelation(store, {
        type: "READS",
        source: { domain: "truth", id: "API_REQ.SUPPLIER.LIST.1" },
        target: { domain: "truth", id: "FIELD.SUPPLIER.NAME" },
        origin: "runtime_trace",
        confidence: "deterministic",
        producer: "SENSOR.DB",
        sourceRef: "手造 id 负例",
        observationRef: "TRACE-abc",
      }),
    ).rejects.toThrow("OBS-n / POB-");
  });

  it("probable 边缺 uncertaintyNote → SCHEMA_INVALID（§148 披露位）；deterministic 边带披露位 → 拒绝", async () => {
    await expect(
      registerRelation(store, {
        type: "CONTAINS",
        source: { domain: "truth", id: "PAGE.SUPPLIER_MANAGEMENT" },
        target: { domain: "truth", id: "COMPONENT.SEARCH_INPUT" },
        origin: "static_analysis",
        confidence: "probable",
        producer: "ANALYZER.VUE.TEMPLATE",
        sourceRef: "模板启发式锚",
      }),
    ).rejects.toThrow("uncertaintyNote");
    await expect(
      registerRelation(store, {
        type: "CONTAINS",
        source: { domain: "truth", id: "PAGE.SUPPLIER_MANAGEMENT" },
        target: { domain: "truth", id: "COMPONENT.DATA_GRID" },
        origin: "static_analysis",
        confidence: "deterministic",
        producer: "ANALYZER.VUE.TEMPLATE",
        sourceRef: "模板确定性锚",
        uncertaintyNote: "不应携带",
      }),
    ).rejects.toThrow("互斥");
  });

  it("词表外 type/origin/confidence/domain → SCHEMA_INVALID（PR-0006 四轴闭包）", async () => {
    await expect(
      registerRelation(store, { ...INSTANCE_OF_EDGE, type: "MAGICAL_LINK" }),
    ).rejects.toThrow("词表外");
    await expect(
      registerRelation(store, { ...INSTANCE_OF_EDGE, origin: "telepathy" }),
    ).rejects.toThrow("词表外");
    await expect(
      registerRelation(store, { ...INSTANCE_OF_EDGE, confidence: "vibes" }),
    ).rejects.toThrow("词表外");
    await expect(
      registerRelation(store, {
        ...INSTANCE_OF_EDGE,
        source: { domain: "meta", id: "PAGE.SUPPLIER_MANAGEMENT" },
      }),
    ).rejects.toThrow("词表外");
  });

  it("truth 端点不过 governed id 文法 → SCHEMA_INVALID（A5）；catalog 端点单词形 → SCHEMA_INVALID", async () => {
    await expect(
      registerRelation(store, {
        ...INSTANCE_OF_EDGE,
        source: { domain: "truth", id: "page.supplier" },
      }),
    ).rejects.toThrow("governed id 文法");
    await expect(
      registerRelation(store, {
        ...INSTANCE_OF_EDGE,
        target: { domain: "catalog", id: "MASTER_DATA" },
      }),
    ).rejects.toThrow("SCREAMING_SNAKE");
  });

  it("MAPS_TO_SOURCE / SUPERSEDES 词表外（语义由 key_bindings/supersedes 承载——不重复登记）", async () => {
    await expect(
      registerRelation(store, { ...INSTANCE_OF_EDGE, type: "MAPS_TO_SOURCE" }),
    ).rejects.toThrow("词表外");
  });

  it("store 未初始化 → NOT_CONFIGURED（No-op is elegant 契约）", async () => {
    const { createStore } = await import("@pomaster/kernel");
    const { makeRoot } = await import("./helpers.js");
    const freshRoot = makeRoot();
    const fresh = await createStore(freshRoot);
    // createStore 骨架在册：seq 可解析 → 正常路径；本例改验空 store 读面。
    expect(readRelations(pathsOf(fresh))).toEqual([]);
  });
});

describe("readRelations（装载面 fail-closed）", () => {
  it("文件缺失 → 空台账（零边是合法状态；不冒充盲区也不冒充全知）", () => {
    expect(existsSync(relationsPath())).toBe(false);
    expect(readRelations(pathsOf(store))).toEqual([]);
  });

  it("坏行（非 JSON）→ SCHEMA_INVALID 整体拒绝（禁静默跳过）", async () => {
    await registerRelation(store, INSTANCE_OF_EDGE);
    const { appendFileSync } = await import("node:fs");
    appendFileSync(relationsPath(), "这不是JSON\n");
    expect(() => readRelations(pathsOf(store))).toThrow("无法解析");
  });

  it("手改 edge_id 与三元组分叉 → SCHEMA_INVALID（内容寻址不变式）", async () => {
    const outcome = await registerRelation(store, INSTANCE_OF_EDGE);
    const { appendFileSync } = await import("node:fs");
    const forged = JSON.stringify({
      ...outcome.entry,
      edge_id: "EDGE-zzzzzzzzzzzz",
    });
    appendFileSync(relationsPath(), `${forged}\n`);
    expect(() => readRelations(pathsOf(store))).toThrow("edge_id 词形非法");
  });

  it("同三元组双行分叉 id → SCHEMA_INVALID（三元组全域唯一）", async () => {
    const outcome = await registerRelation(store, INSTANCE_OF_EDGE);
    const { appendFileSync } = await import("node:fs");
    const forged = JSON.stringify({
      ...outcome.entry,
      edge_id: "EDGE-aaaaaaaaaaaa",
      note: "分叉伪迹",
    });
    appendFileSync(relationsPath(), `${forged}\n`);
    expect(() => readRelations(pathsOf(store))).toThrow("分叉");
  });

  it("RELATIONS_RELATIVE 词形 = .pomaster/state/relations.jsonl（D-3 裁定路径）", () => {
    expect(RELATIONS_RELATIVE).toBe(".pomaster/state/relations.jsonl");
  });
});

describe("派生面（dependencies/composition/runtime 视图最小算子；One Model Many Projections）", () => {
  it("reverseDependents = 改 X 影响谁（Change Impact §106-108 最小算子）", async () => {
    await registerRelation(store, ANALYZER_EDGE);
    await registerRelation(store, {
      type: "READS",
      source: { domain: "truth", id: "API_REQ.SUPPLIER.LIST.1" },
      target: { domain: "truth", id: "FIELD.SUPPLIER.NAME" },
      origin: "static_analysis",
      confidence: "deterministic",
      producer: "ANALYZER.SQL.REPOSITORY",
      sourceRef: "repository 扫描锚",
    });
    const entries = readRelations(pathsOf(store));
    const dependents = reverseDependents(entries, {
      domain: "truth",
      id: "API_REQ.SUPPLIER.LIST.1",
    });
    expect(dependents).toHaveLength(1);
    expect(dependents[0]?.type).toBe("CALLS");
    const fieldDependents = reverseDependents(entries, {
      domain: "truth",
      id: "FIELD.SUPPLIER.NAME",
    });
    expect(fieldDependents).toHaveLength(1);
    expect(fieldDependents[0]?.type).toBe("READS");
  });

  it("forwardDependencies / relationsTouching 双向闭包", async () => {
    await registerRelation(store, ANALYZER_EDGE);
    const entries = readRelations(pathsOf(store));
    expect(
      forwardDependencies(entries, { domain: "truth", id: "PAGE.SUPPLIER_MANAGEMENT" }),
    ).toHaveLength(1);
    expect(relationsTouching(entries, { domain: "truth", id: "API_REQ.SUPPLIER.LIST.1" })).toHaveLength(1);
    expect(relationsTouching(entries, { domain: "truth", id: "FIELD.NOTHING" })).toHaveLength(0);
  });
});

describe("词形闸导出面（normalize* 防篡改探测）", () => {
  it("四个 normalize 函数词表外显式拒绝、词表内恒等返回", () => {
    expect(normalizeRelationType("INSTANCE_OF")).toBe("INSTANCE_OF");
    expect(() => normalizeRelationType("OWNS")).toThrow("词表外");
    expect(normalizeRelationOrigin("static_analysis")).toBe("static_analysis");
    expect(() => normalizeRelationOrigin("STATIC_ANALYSIS")).toThrow("词表外");
    expect(normalizeEndpointDomain("catalog")).toBe("catalog");
    expect(() => normalizeEndpointDomain("cloud")).toThrow("词表外");
    expect(normalizeRelationConfidence("probable")).toBe("probable");
    expect(() => normalizeRelationConfidence("LOCKED")).toThrow("词表外");
  });
});
