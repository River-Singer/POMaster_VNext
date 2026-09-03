/**
 * resolver-composable.spec.ts —— match_class 批次 2 派生（COMPOSABLE/REFERENCE 两新类
 * + 词形腿双 token 集；P-v06 批次 2 Frontend 模型 kernel 逻辑半场；PRD v0.6.1 §69
 * 六分类派生面并拢 + §87 Anti-Hallucination）。
 *
 * 判据锚：
 * - 派生优先级固定序：EXACT > COMPOSABLE > CONFIGURABLE > EXTENSIBLE > REFERENCE >
 *   NO_MATCH（resolver.ts 模块头纪律②规则本体）；
 * - 组合链=core 命中集上的无向图（requires/optional 双向邻接），连通分量 ≥2 即链，
 *   matches=参与链 archetype（matched_tokens 数降序、id 升序）——零 LLM 零主观；
 * - referenceTokens=knowledgeQueryTokens(x-research-anchors.note + urls) 且剔除与
 *   coreTokens 重叠的 token；命中 token 全 ∈ referenceTokens（core 零命中）→ refOnly；
 * - newEntityVerdictFromResolution 五否机判闭合：两新类 denied（组合否/参照否不成立）、
 *   词表外拒绝保持（§87 禁静默放行）。
 * - 真实 repo catalog 只读断言（resolveCatalogRoot 注入；"master data" 命中
 *   PAGE_ARCHETYPE.MASTER_DATA + COMPONENT_ARCHETYPE.DATA_GRID 的 requires 组合链）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  loadCatalogArchetypes,
  newEntityVerdictFromResolution,
  resolveCatalogRoot,
  resolveNeed,
  type Store,
} from "@pomaster/kernel";
import { makeStore, pageEnvelope } from "./helpers.js";

let root: string;
let store: Store;
let catalogRoot: string;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
  catalogRoot = join(root, "catalog");
  mkdirSync(join(catalogRoot, "archetypes"), { recursive: true });
});

/** archetype 物料 fixture（批次 1 writeArchetype 手法 + 批次 2 optional/semantic/锚位）。 */
interface ArchetypeFixture {
  readonly id: string;
  readonly titleZh: string;
  readonly summaryZh: string;
  readonly requires?: readonly string[];
  readonly optional?: readonly string[];
  readonly responsibility?: string;
  readonly anchors?: { readonly note?: string; readonly urls?: readonly string[] };
}

function writeArchetype(fixture: ArchetypeFixture): void {
  const body: Record<string, unknown> = {
    id: fixture.id,
    kind: "archetype",
    layer: "ARCHETYPE",
    title_zh: fixture.titleZh,
    summary_zh: fixture.summaryZh,
    composition: {
      requires: fixture.requires ?? [],
      optional: fixture.optional ?? [],
      incompatible: [],
    },
    semantic: {
      responsibility: fixture.responsibility ?? null,
      when_to_use: null,
      when_not_to_use: null,
    },
  };
  if (fixture.anchors !== undefined) {
    body["x-research-anchors"] = {
      ...(fixture.anchors.note !== undefined ? { note: fixture.anchors.note } : {}),
      sources: (fixture.anchors.urls ?? []).map((url) => ({ url, fetched: "2026-09-03" })),
    };
  }
  writeFileSync(
    join(catalogRoot, "archetypes", `${fixture.id.toLowerCase().replaceAll(".", "_")}.json`),
    `${JSON.stringify(body, null, 2)}\n`,
    "utf8",
  );
}

describe("COMPOSABLE_MATCH（组合链派生；requires/optional 双向邻接）", () => {
  it("≥2 链上 archetype（requires 链）→ COMPOSABLE 且 matches 含两者 + composable_links 计数", async () => {
    writeArchetype({
      id: "PAGE_ARCHETYPE.TEST_MASTER",
      titleZh: "报表维护页",
      summaryZh: "网格与过滤的标准组合",
      requires: ["COMPONENT_ARCHETYPE.TEST_GRID"],
    });
    writeArchetype({ id: "COMPONENT_ARCHETYPE.TEST_GRID", titleZh: "网格", summaryZh: "结构化数据呈现" });
    const outcome = await resolveNeed(store, catalogRoot, { need: "报表维护页 网格" });
    expect(outcome.match_class).toBe("COMPOSABLE_MATCH");
    expect(outcome.matches.map((match) => match.id)).toEqual([
      "COMPONENT_ARCHETYPE.TEST_GRID",
      "PAGE_ARCHETYPE.TEST_MASTER",
    ]);
    expect(outcome.sources_examined.composable_links).toBe(1);
    // required_bindings 聚合参与链 archetype 的 composition.requires。
    expect(outcome.required_bindings).toEqual(["COMPONENT_ARCHETYPE.TEST_GRID"]);
    expect(outcome.why).toContain("多标准件组合可满足");
  });

  it("optional 链同样构成组合链（任一端 optional 含另一端 id）", async () => {
    writeArchetype({
      id: "PAGE_ARCHETYPE.OPT_PAGE",
      titleZh: "选项页",
      summaryZh: "可选组合页",
      optional: ["COMPONENT_ARCHETYPE.OPT_GRID"],
    });
    writeArchetype({ id: "COMPONENT_ARCHETYPE.OPT_GRID", titleZh: "可选网格", summaryZh: "独立部件" });
    const outcome = await resolveNeed(store, catalogRoot, { need: "选项页 可选网格" });
    expect(outcome.match_class).toBe("COMPOSABLE_MATCH");
    expect(outcome.matches.map((match) => match.id)).toContain("PAGE_ARCHETYPE.OPT_PAGE");
    expect(outcome.matches.map((match) => match.id)).toContain("COMPONENT_ARCHETYPE.OPT_GRID");
  });
});

describe("CONFIGURABLE_MATCH 不被新派生回退（批次 0 结论保持）", () => {
  it("单 core 命中 → CONFIGURABLE（不冒充 COMPOSABLE）", async () => {
    writeArchetype({
      id: "PAGE_ARCHETYPE.TEST_MASTER",
      titleZh: "报表维护页",
      summaryZh: "网格与过滤的标准组合",
      requires: ["COMPONENT_ARCHETYPE.TEST_GRID"],
    });
    writeArchetype({ id: "COMPONENT_ARCHETYPE.TEST_GRID", titleZh: "网格", summaryZh: "结构化数据呈现" });
    const outcome = await resolveNeed(store, catalogRoot, { need: "报表维护页" });
    expect(outcome.match_class).toBe("CONFIGURABLE_MATCH");
    expect(outcome.matches.map((match) => match.id)).toEqual(["PAGE_ARCHETYPE.TEST_MASTER"]);
    expect(outcome.sources_examined.composable_links).toBe(0);
  });

  it("≥2 core 命中但无组合链 → CONFIGURABLE（matches 含两者，零链计数）", async () => {
    writeArchetype({ id: "COMPONENT_ARCHETYPE.COLOR_PICKER", titleZh: "颜色选择器 color picker", summaryZh: "拾色部件" });
    writeArchetype({ id: "COMPONENT_ARCHETYPE.COLOR_PANEL", titleZh: "颜色面板 color panel", summaryZh: "面板部件" });
    const outcome = await resolveNeed(store, catalogRoot, { need: "color" });
    expect(outcome.match_class).toBe("CONFIGURABLE_MATCH");
    expect(outcome.matches.map((match) => match.id)).toEqual([
      "COMPONENT_ARCHETYPE.COLOR_PANEL",
      "COMPONENT_ARCHETYPE.COLOR_PICKER",
    ]);
    expect(outcome.sources_examined.composable_links).toBe(0);
  });
});

describe("REFERENCE_MATCH（refOnly 派生；x-research-anchors 词形来源）", () => {
  it("命中 token 全 ∈ referenceTokens（core 零命中）→ REFERENCE + reference_hits 计数", async () => {
    writeArchetype({
      id: "COMPONENT_ARCHETYPE.REF_TABLE",
      titleZh: "外部参照表",
      summaryZh: "标准参照说明",
      anchors: {
        note: "实抓参照 antd table 锚点",
        urls: ["https://ant.design/components/table"],
      },
    });
    const outcome = await resolveNeed(store, catalogRoot, { need: "antd" });
    expect(outcome.match_class).toBe("REFERENCE_MATCH");
    expect(outcome.matches.map((match) => match.id)).toEqual(["COMPONENT_ARCHETYPE.REF_TABLE"]);
    expect(outcome.sources_examined.reference_hits).toBe(1);
    expect(outcome.why).toContain("外部参照体系命中");
  });

  it("REFERENCE 优先级低于 EXTENSIBLE：truth 词形命中 + refOnly 并存 → EXTENSIBLE", async () => {
    await applySeedPage();
    writeArchetype({
      id: "COMPONENT_ARCHETYPE.REF_TABLE",
      titleZh: "外部参照表",
      summaryZh: "标准参照说明",
      anchors: { note: "实抓参照 antd 锚点", urls: [] },
    });
    const outcome = await resolveNeed(store, catalogRoot, { need: "供应商管理 antd" });
    expect(outcome.match_class).toBe("EXTENSIBLE_MATCH");
    expect(outcome.matches[0]?.domain).toBe("truth");
    // refOnly 候选降位披露（alternatives 候选披露位——不改变 match_class）。
    expect(outcome.alternatives.map((match) => match.id)).toContain(
      "COMPONENT_ARCHETYPE.REF_TABLE",
    );
  });

  it("REFERENCE 优先级低于 CONFIGURABLE：core 命中 + refOnly 并存 → CONFIGURABLE（ref token 降位披露）", async () => {
    writeArchetype({
      id: "COMPONENT_ARCHETYPE.DUAL",
      titleZh: "网格面板",
      summaryZh: "组合说明",
      anchors: { note: "antd 实抓", urls: [] },
    });
    const outcome = await resolveNeed(store, catalogRoot, { need: "网格面板 antd" });
    expect(outcome.match_class).toBe("CONFIGURABLE_MATCH");
    expect(outcome.matches.map((match) => match.id)).toEqual(["COMPONENT_ARCHETYPE.DUAL"]);
    // reference_hits 计数口径 = refOnly 候选数（命中 token 全 ∈ referenceTokens 的
    // archetype 数）；DUAL 同时有 core 命中，属 core 命中物非 refOnly 候选——参照
    // token 经 matched_tokens 披露而非本计数位。
    expect(outcome.sources_examined.reference_hits).toBe(0);
    expect(outcome.matches[0]?.matched_tokens).toContain("antd");
  });

  it("referenceTokens 剔除与 coreTokens 重叠的 token（重叠词形是 core 命中非参照命中）", async () => {
    writeArchetype({
      id: "COMPONENT_ARCHETYPE.OVERLAP",
      titleZh: "表格",
      summaryZh: "表格部件",
      anchors: { note: "表格 实抓锚点", urls: [] },
    });
    const outcome = await resolveNeed(store, catalogRoot, { need: "表格" });
    expect(outcome.match_class).toBe("CONFIGURABLE_MATCH");
    expect(outcome.sources_examined.reference_hits).toBe(0);
  });
});

describe("New Entity Gate 五否机判闭合（v0.6.1 §75 批次 2 并拢）", () => {
  it("两新类 denied（组合否/参照否不成立）+ NO_MATCH 允许 + 词表外拒绝保持", () => {
    expect(newEntityVerdictFromResolution("COMPOSABLE_MATCH")).toEqual({
      new_entity_allowed: false,
      denied_by: ["COMPOSABLE_MATCH"],
    });
    expect(newEntityVerdictFromResolution("REFERENCE_MATCH")).toEqual({
      new_entity_allowed: false,
      denied_by: ["REFERENCE_MATCH"],
    });
    expect(newEntityVerdictFromResolution("NO_MATCH")).toEqual({
      new_entity_allowed: true,
      denied_by: [],
    });
    expect(() => newEntityVerdictFromResolution("MAGICAL_MATCH" as never)).toThrow("词表外");
  });
});

describe("真实 repo catalog 只读断言（resolveCatalogRoot 注入；零物料改动）", () => {
  it("「master data」命中 MASTER_DATA+DATA_GRID requires 组合链 → COMPOSABLE（链外 core 命中降位 alternatives）", async () => {
    const outcome = await resolveNeed(store, resolveCatalogRoot(), { need: "master data" });
    expect(outcome.match_class).toBe("COMPOSABLE_MATCH");
    // ANALYSIS 的 when_not_to_use 含「page_archetype_master_data」词形——semantic 三槽
    // 入 coreTokens 后以 master+data 双 token 命中，且其 requires 含 DATA_GRID 构成链；
    // 三者同链（ANALYSIS–GRID–PAGE_MASTER），matched_tokens 数降序、id 升序。
    expect(outcome.matches.map((match) => match.id)).toEqual([
      "PAGE_ARCHETYPE.ANALYSIS",
      "PAGE_ARCHETYPE.MASTER_DATA",
      "COMPONENT_ARCHETYPE.DATA_GRID",
    ]);
    expect(outcome.sources_examined.composable_links).toBe(2);
    expect(outcome.required_bindings).toEqual([
      "COMPONENT_ARCHETYPE.BUTTON",
      "COMPONENT_ARCHETYPE.DATA_GRID",
      "COMPONENT_ARCHETYPE.SEARCH_INPUT",
    ]);
    // 链外 core 命中（DATA_ARCHETYPE.MASTER_DATA 无组合边）不冒充参与链——降位披露。
    expect(outcome.alternatives.map((match) => match.id)).toContain(
      "DATA_ARCHETYPE.MASTER_DATA",
    );
  });

  it("批次 1 验收词形「供应商管理页 主数据」保持 CONFIGURABLE（单 core 命中不回退）", async () => {
    const outcome = await resolveNeed(store, resolveCatalogRoot(), {
      need: "供应商管理页 主数据",
    });
    expect(outcome.match_class).toBe("CONFIGURABLE_MATCH");
    expect(outcome.matches.map((match) => match.id)).toEqual([
      "COMPONENT_ARCHETYPE.DATA_GRID",
    ]);
    expect(outcome.sources_examined.composable_links).toBe(0);
  });

  it("referenceAnchors 装载：x-research-anchors 进物料形态（note/urls 消费位；缺席=null/[]）", () => {
    const archetypes = loadCatalogArchetypes(resolveCatalogRoot());
    const grid = archetypes.find((entry) => entry.id === "COMPONENT_ARCHETYPE.DATA_GRID");
    expect(grid?.referenceAnchors.urls).toContain("https://ant.design/components/table");
    expect(grid?.referenceAnchors.note).toContain("AntD Table demo");
    const crud = archetypes.find((entry) => entry.id === "ARCHETYPE.BACKEND.CRUD_RESOURCE");
    expect(crud?.referenceAnchors.note).toBeNull();
    expect(crud?.referenceAnchors.urls.length).toBeGreaterThan(0);
  });
});

/** truth 面 seed（EXTENSIBLE 对照腿用）。 */
async function applySeedPage(): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: pageEnvelope({ id: "PAGE.SUPPLIER_MANAGEMENT", titleZh: "供应商管理" }) as never,
      },
    ],
  } as never);
}
