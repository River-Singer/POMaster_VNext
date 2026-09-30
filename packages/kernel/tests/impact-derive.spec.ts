/**
 * impact-derive.spec.ts —— 跨平面关系适配与派生影响闭包（W3 切片 FR-06；Case A 分母）。
 *
 * 判据锚（PRD W3 / research dependency-authority-and-routing.md §3-§5）：
 * - 方案 A 按消费者接线：source_refs、Decision depends_on、generated input references、
 *   contract/baseline 四类关系由各自真实数据源只读构建派生边——不复制成第二 canonical
 *   graph、不建 ImpactGraph、不建第二依赖 store（纯函数零 IO 零落盘）；
 * - 未接入资产显式登记（不能声称全仓完整——清单是交付物）；
 * - 每条后果行携带 upstream identity/revision、命中路径（via_edge_id/kind/depth）、
 *   下游身份、unknown/truncated 显式（截断图不冒充完整图）；
 * - 环/菱形/多根/重复/悬空输入稳定输出（同输入重放 deep-equal）。
 */
import { describe, expect, it } from "vitest";
import {
  ADAPTED_RELATION_KINDS,
  DERIVED_EDGE_ID_PATTERN,
  IMPACT_PLANE_VALUES,
  UNADAPTED_ASSET_INVENTORY,
  deriveImpactClosure,
  impactClosure,
  type DeriveImpactInput,
  type RelationEntry,
} from "@pomaster/kernel";

// ============================================================
// fixture（全部为既有平面合法词形；DECISION.* 是 Discovery 局部词形非 governed）
// ============================================================

/** 台账边（EDGE- 内容寻址由测试自行构造全字段；只消费 source/target/edge_id/type）。 */
function ledgerEdge(
  type: RelationEntry["type"],
  sourceId: string,
  targetId: string,
  edgeId: string,
): RelationEntry {
  return {
    edge_id: edgeId,
    type,
    source: { domain: "truth", id: sourceId },
    target: { domain: "truth", id: targetId },
    origin: "static_analysis",
    confidence: "deterministic",
    producer: "ANALYZER.TS.IMPORT_GRAPH",
    uncertainty_note: null,
    provenance: {
      recorded_at_seq: 1,
      source_ref: "impact-derive.spec fixture",
      locator: null,
      observation_ref: null,
      declared_by: null,
    },
    note: null,
  };
}

/** 最小输入（五数据源全空——按需覆写）。 */
function emptyInput(): DeriveImpactInput {
  return { relations: [], objects: [], decisionGraphs: [], generated: [], sources: [] };
}

const SOURCE_BP = { source_id: "bp-carline", version: "v1" } as const;

/** BP v1 → PAGE（payload source_refs）→ KEYBINDING（denominator_refs 链）。 */
function chainInput(): DeriveImpactInput {
  return {
    ...emptyInput(),
    sources: [SOURCE_BP],
    objects: [
      {
        id: "PAGE.CARLINE",
        rev: 3,
        body_sha256: "sha256:" + "a".repeat(64),
        payload_source_refs: ["bp-carline"],
        denominator_refs: ["KEYBINDING.PAGE.V1"],
        implements_change: null,
      },
      {
        id: "KEYBINDING.PAGE.V1",
        rev: 1,
        body_sha256: null,
        payload_source_refs: [],
        denominator_refs: [],
        implements_change: null,
      },
    ],
  };
}

// ============================================================
// 接入清单（适配器覆盖分母显式——不能声称全仓完整）
// ============================================================

describe("接入关系类型清单（四类 adapted kinds + 未接入资产诚实清单）", () => {
  it("四类 adapted kinds 闭包：source_refs / Decision depends_on / generated input / contract-baseline", () => {
    expect([...ADAPTED_RELATION_KINDS]).toEqual([
      "PAYLOAD_SOURCE_REF",
      "DECISION_DEPENDS_ON",
      "GENERATED_INPUT_REF",
      "CONTRACT_BASELINE_REF",
    ]);
  });

  it("影响平面五值闭包（truth/catalog 台账两域 + discovery/generated/source 三派生平面的归一）", () => {
    expect([...IMPACT_PLANE_VALUES]).toEqual([
      "truth",
      "catalog",
      "discovery",
      "generated",
      "source",
    ]);
  });

  it("未接入资产显式登记：清单非空且逐条携带豁免理由（不能声称全仓完整）", () => {
    expect(UNADAPTED_ASSET_INVENTORY.length).toBeGreaterThanOrEqual(4);
    for (const entry of UNADAPTED_ASSET_INVENTORY) {
      expect(entry.length).toBeGreaterThan(0);
    }
  });

  it("派生边 id 词形 DXE-<12hex>（与台账 EDGE- 词形区分——派生边不落盘非第二真值）", () => {
    expect(DERIVED_EDGE_ID_PATTERN.test("DXE-0123456789ab")).toBe(true);
    expect(DERIVED_EDGE_ID_PATTERN.test("EDGE-0123456789ab")).toBe(false);
  });
});

// ============================================================
// 派生闭包（四类 adapted 边 + 台账边统一闭包）
// ============================================================

describe("deriveImpactClosure（纯派生查询；不落盘不建第二 store）", () => {
  it("PAYLOAD_SOURCE_REF：BP source 变化 → 引用对象入闭包（depth=1，upstream 携带来源 version）", () => {
    const result = deriveImpactClosure(chainInput(), { plane: "source", id: "bp-carline" });
    const page = result.rows.find((row) => row.id === "PAGE.CARLINE");
    expect(page).toBeDefined();
    expect(page?.plane).toBe("truth");
    expect(page?.depth).toBe(1);
    expect(page?.via_kind).toBe("PAYLOAD_SOURCE_REF");
    expect(page?.upstream).toEqual({ plane: "source", id: "bp-carline", revision: "v1" });
    expect(page?.path_edge_ids).toHaveLength(1);
    expect(DERIVED_EDGE_ID_PATTERN.test(page?.via_edge_id ?? "")).toBe(true);
  });

  it("CONTRACT_BASELINE_REF：分母变化 → 引用它的对象入闭包（denominator_refs 反向；对象行 upstream 携带 rev）", () => {
    const result = deriveImpactClosure(chainInput(), { plane: "truth", id: "KEYBINDING.PAGE.V1" });
    const page = result.rows.find((row) => row.id === "PAGE.CARLINE");
    expect(page).toBeDefined();
    expect(page?.depth).toBe(1);
    expect(page?.via_kind).toBe("CONTRACT_BASELINE_REF");
    expect(page?.upstream).toEqual({
      plane: "truth",
      id: "KEYBINDING.PAGE.V1",
      revision: "rev@1",
    });
  });

  it("CONTRACT_BASELINE_REF 链：CHANGE 分母变化 → implements_change 任务链入闭包（路径边链连续）", () => {
    const input: DeriveImpactInput = {
      ...emptyInput(),
      objects: [
        {
          id: "TASK.CARLINE.REWORK",
          rev: 2,
          body_sha256: null,
          payload_source_refs: [],
          denominator_refs: [],
          implements_change: "CHANGE.CARLINE.V2",
        },
      ],
    };
    const result = deriveImpactClosure(input, { plane: "truth", id: "CHANGE.CARLINE.V2" });
    const task = result.rows.find((row) => row.id === "TASK.CARLINE.REWORK");
    expect(task).toBeDefined();
    expect(task?.depth).toBe(1);
    expect(task?.via_kind).toBe("CONTRACT_BASELINE_REF");
    expect(task?.path_edge_ids).toHaveLength(1);
  });

  it("台账边接入：relations EDGE 边照常参与闭包（via_edge_id 保留 EDGE 词形非 DXE）", () => {
    const input: DeriveImpactInput = {
      ...chainInput(),
      relations: [ledgerEdge("CALLS", "API_REQ.CARLINE.LIST.1", "PAGE.CARLINE", "EDGE-111111111111")],
    };
    const result = deriveImpactClosure(input, { plane: "source", id: "bp-carline" });
    const api = result.rows.find((row) => row.id === "API_REQ.CARLINE.LIST.1");
    expect(api).toBeDefined();
    expect(api?.via_edge_id).toBe("EDGE-111111111111");
    expect(api?.via_kind).toBe("CALLS");
  });

  it("DECISION_DEPENDS_ON + affects 跨平面链：BP → PAGE ← DECISION.D2 ← DECISION.D1（review 面可达）", () => {
    const input: DeriveImpactInput = {
      ...chainInput(),
      decisionGraphs: [
        {
          discovery_id: "pad-carline",
          decisions: [
            { decision_id: "DECISION.D1", depends_on: ["DECISION.D2"], affects: [] },
            { decision_id: "DECISION.D2", depends_on: [], affects: ["PAGE.CARLINE"] },
          ],
        },
      ],
    };
    const result = deriveImpactClosure(input, { plane: "source", id: "bp-carline" });
    const d2 = result.rows.find((row) => row.id === "DECISION.D2");
    const d1 = result.rows.find((row) => row.id === "DECISION.D1");
    expect(d2).toBeDefined();
    expect(d2?.plane).toBe("discovery");
    expect(d2?.depth).toBe(2);
    expect(d2?.via_kind).toBe("DECISION_DEPENDS_ON");
    expect(d1).toBeDefined();
    expect(d1?.depth).toBe(3);
    // d2 的 upstream = PAGE.CARLINE（truth 平面）→ revision 携带 rev 锚。
    expect(d2?.upstream).toEqual({ plane: "truth", id: "PAGE.CARLINE", revision: "rev@3" });
    // d1 的 upstream = DECISION.D2（discovery 平面无 revision 输入面）→ null 显式（不猜测）。
    expect(d1?.upstream).toEqual({ plane: "discovery", id: "DECISION.D2", revision: null });
  });

  it("GENERATED_INPUT_REF：context manifest 声明输入 → generated 节点入闭包（governed id 与来源 id 双词形解析）", () => {
    const input: DeriveImpactInput = {
      ...chainInput(),
      generated: [
        { generated_id: "PAGE.CARLINE.context.json", input_refs: ["PAGE.CARLINE", "bp-carline"] },
      ],
    };
    const result = deriveImpactClosure(input, { plane: "source", id: "bp-carline" });
    const manifest = result.rows.find((row) => row.plane === "generated");
    expect(manifest).toBeDefined();
    expect(manifest?.id).toBe("PAGE.CARLINE.context.json");
    expect(manifest?.via_kind).toBe("GENERATED_INPUT_REF");
    expect(manifest?.depth).toBe(1);
  });

  it("affects 宽松词形非 governed → unresolved_refs 显式登记（不猜测升级为 truth 节点）", () => {
    const input: DeriveImpactInput = {
      ...emptyInput(),
      decisionGraphs: [
        {
          discovery_id: "pad-x",
          decisions: [
            { decision_id: "DECISION.D9", depends_on: [], affects: ["CONTRACT.UNPARSEABLE"] },
          ],
        },
      ],
    };
    const result = deriveImpactClosure(input, { plane: "discovery", id: "DECISION.D9" });
    expect(result.rows).toHaveLength(0);
    expect(result.unresolved_refs).toEqual([
      { from_plane: "discovery", from_id: "DECISION.D9", field: "affects", ref: "CONTRACT.UNPARSEABLE" },
    ]);
  });

  it("悬空 depends_on / 悬空 source_ref → unresolved_refs 显式（闭包不含未知节点、稳定排序）", () => {
    const input: DeriveImpactInput = {
      ...emptyInput(),
      objects: [
        {
          id: "PAGE.DANGLING",
          rev: 1,
          body_sha256: null,
          payload_source_refs: ["ghost-source"],
          denominator_refs: ["GHOST.CHANGE"],
          implements_change: null,
        },
      ],
      decisionGraphs: [
        {
          discovery_id: "pad-y",
          decisions: [
            { decision_id: "DECISION.DA", depends_on: ["DECISION.GHOST"], affects: [] },
          ],
        },
      ],
      sources: [],
    };
    const result = deriveImpactClosure(input, { plane: "truth", id: "PAGE.DANGLING" });
    expect(result.rows).toHaveLength(0);
    // 悬空登记是输入完整性面（与根选择无关——声明即可见，不因根选择而静默）。
    // 排序 = (from_plane, from_id, field, ref) 字典序。
    expect(result.unresolved_refs).toEqual([
      { from_plane: "discovery", from_id: "DECISION.DA", field: "depends_on", ref: "DECISION.GHOST" },
      { from_plane: "truth", from_id: "PAGE.DANGLING", field: "denominator_refs", ref: "GHOST.CHANGE" },
      { from_plane: "truth", from_id: "PAGE.DANGLING", field: "payload_source_refs", ref: "ghost-source" },
    ]);
  });

  it("环输入稳定：A→B→C→A 依赖环不死循环、输出确定（visited 语义镜像 impactClosure）", () => {
    const input: DeriveImpactInput = {
      ...emptyInput(),
      objects: [
        { id: "PAGE.A", rev: 1, body_sha256: null, payload_source_refs: [], denominator_refs: ["PAGE.C"], implements_change: null },
        { id: "PAGE.B", rev: 1, body_sha256: null, payload_source_refs: [], denominator_refs: ["PAGE.A"], implements_change: null },
        { id: "PAGE.C", rev: 1, body_sha256: null, payload_source_refs: [], denominator_refs: ["PAGE.B"], implements_change: null },
      ],
    };
    const result = deriveImpactClosure(input, { plane: "truth", id: "PAGE.A" });
    expect(result.rows.map((row) => row.id)).toEqual(["PAGE.B", "PAGE.C"]);
    expect(result.rows.map((row) => row.depth)).toEqual([1, 2]);
    const replay = deriveImpactClosure(input, { plane: "truth", id: "PAGE.A" });
    expect(result).toEqual(replay);
  });

  it("菱形输入：两路汇合节点只出现一次（最浅 depth 保留——首次到达即定）", () => {
    const input: DeriveImpactInput = {
      ...emptyInput(),
      sources: [{ source_id: "bp", version: "v1" }],
      objects: [
        { id: "PAGE.LEFT", rev: 1, body_sha256: null, payload_source_refs: ["bp"], denominator_refs: [], implements_change: null },
        { id: "PAGE.RIGHT", rev: 1, body_sha256: null, payload_source_refs: ["bp"], denominator_refs: [], implements_change: null },
        { id: "API_REQ.MERGE", rev: 1, body_sha256: null, payload_source_refs: [], denominator_refs: ["PAGE.LEFT", "PAGE.RIGHT"], implements_change: null },
      ],
    };
    const result = deriveImpactClosure(input, { plane: "source", id: "bp" });
    const merges = result.rows.filter((row) => row.id === "API_REQ.MERGE");
    expect(merges).toHaveLength(1);
    expect(merges[0]?.depth).toBe(2);
  });

  it("重复边输入去重：同三元组重复申报 → 单行（DXE 内容寻址幂等镜像）", () => {
    const input: DeriveImpactInput = {
      ...emptyInput(),
      sources: [{ source_id: "bp", version: null }],
      objects: [
        {
          id: "PAGE.DUP",
          rev: 1,
          body_sha256: null,
          payload_source_refs: ["bp", "bp"],
          denominator_refs: [],
          implements_change: null,
        },
      ],
    };
    const result = deriveImpactClosure(input, { plane: "source", id: "bp" });
    expect(result.rows.filter((row) => row.id === "PAGE.DUP")).toHaveLength(1);
  });

  it("多根独立：同图两次不同根调用互不污染、结果各自确定（纯函数）", () => {
    const input: DeriveImpactInput = {
      ...emptyInput(),
      sources: [
        { source_id: "bp-one", version: "v1" },
        { source_id: "bp-two", version: "v2" },
      ],
      objects: [
        { id: "PAGE.ONE", rev: 1, body_sha256: null, payload_source_refs: ["bp-one"], denominator_refs: [], implements_change: null },
        { id: "PAGE.TWO", rev: 1, body_sha256: null, payload_source_refs: ["bp-two"], denominator_refs: [], implements_change: null },
      ],
    };
    const one = deriveImpactClosure(input, { plane: "source", id: "bp-one" });
    const two = deriveImpactClosure(input, { plane: "source", id: "bp-two" });
    expect(one.rows.map((row) => row.id)).toEqual(["PAGE.ONE"]);
    expect(two.rows.map((row) => row.id)).toEqual(["PAGE.TWO"]);
  });

  it("深度截断显式：maxDepth=1 深链 → max_depth_reached=true + 截断行 truncated 标记（截断图不冒充完整图）", () => {
    const result = deriveImpactClosure(chainInput(), { plane: "source", id: "bp-carline" }, { maxDepth: 1 });
    expect(result.max_depth_reached).toBe(true);
    expect(result.rows.map((row) => row.id)).toEqual(["PAGE.CARLINE"]);
    expect(result.rows[0]?.truncated).toBe(true);
    expect(result.denominator_note).toContain("截断图不冒充完整图");
  });

  it("maxDepth 越界（0 / 17）→ SCHEMA_INVALID（防御失控 BFS——impactClosure 同闸镜像）", () => {
    expect(() =>
      deriveImpactClosure(chainInput(), { plane: "source", id: "bp-carline" }, { maxDepth: 0 }),
    ).toThrow("maxDepth");
    expect(() =>
      deriveImpactClosure(chainInput(), { plane: "source", id: "bp-carline" }, { maxDepth: 17 }),
    ).toThrow("maxDepth");
  });

  it("空输入：无任何关系 → rows/unresolved 双空 + 分母注记在场（诚实空非错误）", () => {
    const result = deriveImpactClosure(emptyInput(), { plane: "truth", id: "PAGE.NOTHING" });
    expect(result.rows).toEqual([]);
    expect(result.unresolved_refs).toEqual([]);
    expect(result.max_depth_reached).toBe(false);
    expect(result.unadapted_assets).toEqual([...UNADAPTED_ASSET_INVENTORY]);
    expect(result.denominator_note.length).toBeGreaterThan(0);
  });

  it("确定性排序：rows 按 (depth, plane, id) 字典序；同输入重放 deep-equal（字节稳定）", () => {
    const input: DeriveImpactInput = {
      ...emptyInput(),
      sources: [{ source_id: "bp", version: "v1" }],
      objects: [
        { id: "PAGE.ZETA", rev: 1, body_sha256: null, payload_source_refs: ["bp"], denominator_refs: [], implements_change: null },
        { id: "PAGE.ALPHA", rev: 2, body_sha256: null, payload_source_refs: ["bp"], denominator_refs: [], implements_change: null },
      ],
      generated: [
        { generated_id: "zz.context.json", input_refs: ["bp"] },
        { generated_id: "aa.context.json", input_refs: ["PAGE.ALPHA"] },
      ],
    };
    const first = deriveImpactClosure(input, { plane: "source", id: "bp" });
    const second = deriveImpactClosure(input, { plane: "source", id: "bp" });
    expect(first).toEqual(second);
    const depths = first.rows.map((row) => row.depth);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
    const sameDepth = first.rows.filter((row) => row.depth === first.rows[0]?.depth);
    const keys = sameDepth.map((row) => `${row.plane}:${row.id}`);
    expect([...keys].sort()).toEqual(keys);
  });
});

// ============================================================
// 闭包漂移哨兵（裁定 2a=C；Owner 2026-09-30）：impactClosure（relations.ts 台账核）
// 与 deriveImpactClosure（impact-derive.ts 同构镜像 BFS——PAYLOAD_SOURCE_REF 等四类
// 适配腿共享同一遍历核）在**同一关系图**上的可达集/深度/边链/排序/截断语义逐面对账。
// 两实现是刻意分离的（relations 合同冻结不扩端点文法——模块头注）；本哨兵锁「镜像
// 语义不漂移」：未来任一实现改 BFS 语义（visited/排序/maxDepth 闸/截断披露）先红。
// 对账形态：truth 平面 governed id 端点 fixture，台账边原样进两实现（derive 侧
// objects 等派生源置空——派生边分母=台账边，两闭包的可比子集=全部分母）。
// ============================================================

/** 对账投影：impactClosure 节点 → {domain, id, depth, via_edge_id}（判定面最小集）。 */
function impactSide(
  entries: readonly RelationEntry[],
  rootId: string,
  maxDepth?: number,
): { readonly affected: readonly { readonly key: string; readonly depth: number; readonly via: string }[]; readonly truncated: boolean } {
  const closure = impactClosure(entries, { domain: "truth", id: rootId }, maxDepth === undefined ? undefined : { maxDepth });
  return {
    affected: closure.affected.map((node) => ({
      key: `${node.endpoint.domain}:${node.endpoint.id}`,
      depth: node.depth,
      via: node.via_edge_id,
    })),
    truncated: closure.max_depth_reached,
  };
}

/** 对账投影：deriveImpactClosure 行 → 同一最小集（plane≡domain 台账两域归一）。 */
function deriveSide(
  entries: readonly RelationEntry[],
  rootId: string,
  maxDepth?: number,
): { readonly affected: readonly { readonly key: string; readonly depth: number; readonly via: string }[]; readonly truncated: boolean } {
  const result = deriveImpactClosure(
    { ...emptyInput(), relations: entries },
    { plane: "truth", id: rootId },
    maxDepth === undefined ? undefined : { maxDepth },
  );
  return {
    affected: result.rows.map((row) => ({
      key: `${row.plane}:${row.id}`,
      depth: row.depth,
      via: row.via_edge_id,
    })),
    truncated: result.max_depth_reached,
  };
}

describe("闭包漂移哨兵（裁定 2a=C：impactClosure 与 deriveImpactClosure 同图对账）", () => {
  it("可达集/深度/边链/排序逐面一致：菱形+深链混合图两实现逐位置对齐", () => {
    // 菱形两路（PAGE.ALPHA / PAGE.GAMMA 各 d1）+ 深链（COMPONENT.BETA d2 → API_REQ.DELTA d3）。
    const entries: RelationEntry[] = [
      ledgerEdge("IMPLEMENTS", "PAGE.ALPHA", "CAPABILITY.ROOT", "EDGE-000000000001"),
      ledgerEdge("IMPLEMENTS", "PAGE.GAMMA", "CAPABILITY.ROOT", "EDGE-000000000002"),
      ledgerEdge("CONTAINS", "COMPONENT.BETA", "PAGE.ALPHA", "EDGE-000000000003"),
      ledgerEdge("READS", "API_REQ.DELTA", "COMPONENT.BETA", "EDGE-000000000004"),
    ];
    const impact = impactSide(entries, "CAPABILITY.ROOT");
    const derive = deriveSide(entries, "CAPABILITY.ROOT");
    expect(impact.truncated).toBe(false);
    expect(derive.truncated).toBe(false);
    // 排序语义对账：两实现同 (depth, domain/plane, id) 键 → 逐位置相等（排序漂移即红）。
    expect(impact.affected).toEqual(derive.affected);
    // 可达集分母：d1 两行（菱形）+ d2 + d3 = 4 节点，深度语义逐面一致。
    expect(impact.affected.map((row) => row.depth)).toEqual([1, 1, 2, 3]);
  });

  it("环不死循环且两实现一致：A→B→C→A 依赖环 visited 首达即定（root 不入行）", () => {
    const entries: RelationEntry[] = [
      ledgerEdge("IMPLEMENTS", "PAGE.ALPHA", "CAPABILITY.BETA", "EDGE-000000000011"),
      ledgerEdge("CALLS", "COMPONENT.GAMMA", "PAGE.ALPHA", "EDGE-000000000012"),
      ledgerEdge("CONTAINS", "CAPABILITY.BETA", "COMPONENT.GAMMA", "EDGE-000000000013"),
    ];
    const impact = impactSide(entries, "CAPABILITY.BETA");
    const derive = deriveSide(entries, "CAPABILITY.BETA");
    expect(impact.affected).toEqual(derive.affected);
    // 环回到 root 自身被 visited 封死——root 不出现在任一侧闭包。
    expect(impact.affected.map((row) => row.key)).not.toContain("truth:CAPABILITY.BETA");
    expect(derive.affected.map((row) => row.key)).not.toContain("truth:CAPABILITY.BETA");
  });

  it("maxDepth 截断语义一致：深链 maxDepth=1 → 单行 + max_depth_reached=true 双侧同真", () => {
    const entries: RelationEntry[] = [
      ledgerEdge("IMPLEMENTS", "PAGE.ALPHA", "CAPABILITY.ROOT", "EDGE-000000000021"),
      ledgerEdge("CONTAINS", "COMPONENT.BETA", "PAGE.ALPHA", "EDGE-000000000022"),
    ];
    const impact = impactSide(entries, "CAPABILITY.ROOT", 1);
    const derive = deriveSide(entries, "CAPABILITY.ROOT", 1);
    expect(impact.truncated).toBe(true);
    expect(derive.truncated).toBe(true);
    expect(impact.affected).toEqual(derive.affected);
    expect(impact.affected).toHaveLength(1);
    expect(impact.affected[0]?.depth).toBe(1);
  });

  it("maxDepth 边界对账：maxDepth=2 的同图下第三层双侧一致缺席（截断面逐深度同构）", () => {
    const entries: RelationEntry[] = [
      ledgerEdge("IMPLEMENTS", "PAGE.ALPHA", "CAPABILITY.ROOT", "EDGE-000000000031"),
      ledgerEdge("CONTAINS", "COMPONENT.BETA", "PAGE.ALPHA", "EDGE-000000000032"),
      ledgerEdge("READS", "API_REQ.DELTA", "COMPONENT.BETA", "EDGE-000000000033"),
    ];
    const impact = impactSide(entries, "CAPABILITY.ROOT", 2);
    const derive = deriveSide(entries, "CAPABILITY.ROOT", 2);
    expect(impact.truncated).toBe(true);
    expect(derive.truncated).toBe(true);
    expect(impact.affected).toEqual(derive.affected);
    // 第三层（API_REQ.DELTA d3）双侧一致缺席——截断图不冒充完整图的同构呈现。
    expect(impact.affected.map((row) => row.key)).not.toContain("truth:API_REQ.DELTA");
  });
});
