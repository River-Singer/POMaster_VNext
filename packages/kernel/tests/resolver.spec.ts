/**
 * resolver.spec.ts —— 统一语义解析门面（P-v06 批次 0；PRD v0.6 §98 + v0.6.1
 * §69/§73/§75/§87）。
 *
 * 判据锚：
 * - 三精确腿（parseGovernedId → resolveAlias → equivalence active）+ 词形腿
 *   （knowledgeQueryTokens 同一实现，词级精确禁子串）——单一实现禁第二套；
 * - match_class 派生确定性：EXACT（精确腿）/ CONFIGURABLE（archetype 命中）/
 *   EXTENSIBLE（仅 truth 词形命中）/ NO_MATCH（两分母零命中）；
 * - §87 Anti-Hallucination：NO_MATCH 显式、分母披露（sources_examined）、
 *   advisory≠match；newEntityVerdictFromResolution：NO_MATCH → 允许 Design New，
 *   其余 → 拒绝 + denied_by（New Entity Gate 解析侧唯一判卷源）。
 * - 解析 ≠ 采用：resolveNeed 零落盘零写边（INSTANCE_OF 边归显式采用动作）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  newEntityVerdictFromResolution,
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

/** archetype 物料写入器（batch 1 物料词形的测试面最小形态）。 */
function writeArchetype(id: string, titleZh: string, summaryZh: string, requires: string[] = []): void {
  writeFileSync(
    join(catalogRoot, "archetypes", `${id.toLowerCase().replaceAll(".", "_")}.json`),
    `${JSON.stringify(
      {
        id,
        kind: "archetype",
        layer: "ARCHETYPE",
        title_zh: titleZh,
        summary_zh: summaryZh,
        composition: { requires, optional: [], incompatible: [] },
        semantic: { responsibility: null, when_to_use: null, when_not_to_use: null },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function seedPage(id: string, titleZh: string): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: pageEnvelope({ id, titleZh }) as never,
      },
    ],
  } as never);
}

describe("精确腿（EXACT_MATCH；三腿单一实现）", () => {
  it("腿①：精确 governed id 命中在册对象 → EXACT_MATCH via exact_id + family 派生", async () => {
    await seedPage("PAGE.SUPPLIER_MANAGEMENT", "供应商管理");
    const outcome = await resolveNeed(store, catalogRoot, {
      need: "PAGE.SUPPLIER_MANAGEMENT",
    });
    expect(outcome.match_class).toBe("EXACT_MATCH");
    expect(outcome.matches[0]?.via).toBe("exact_id");
    expect(outcome.matches[0]?.family).toBe("UI");
    expect(outcome.matches[0]?.kind).toBe("page_surface");
    expect(outcome.sources_examined.exact_hits).toBe(1);
  });

  it("腿②：ALIASES_V0 机械别名族（GRID.*→CAPABILITY.GRID.*）canonical 化命中 → via exact_id_via_alias", async () => {
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: pageEnvelope({
            id: "CAPABILITY.GRID.EDITABLE_GRID",
            kind: "capability",
            axisProfile: "capability_default",
            titleZh: "可编辑表格",
            aliases: ["GRID.EDITABLE_GRID"],
            payload: { canonical_realization: { component: "MasterEditableGrid" }, category: "grid" },
          }) as never,
        },
      ],
    } as never);
    const outcome = await resolveNeed(store, catalogRoot, { need: "GRID.EDITABLE_GRID" });
    expect(outcome.match_class).toBe("EXACT_MATCH");
    expect(outcome.matches[0]?.via).toBe("exact_id_via_alias");
    expect(outcome.matches[0]?.id).toBe("CAPABILITY.GRID.EDITABLE_GRID");
    expect(outcome.matches[0]?.family).toBe("PRODUCT");
  });

  it("精确词形不在册 → 不冒充命中也不猜测（降级词形腿；NO_MATCH 时分母披露在场）", async () => {
    const outcome = await resolveNeed(store, catalogRoot, {
      need: "PAGE.NOSUCH_OBJECT",
    });
    expect(outcome.match_class).toBe("NO_MATCH");
    expect(outcome.matches).toEqual([]);
    expect(outcome.sources_examined.truth_rows).toBeGreaterThanOrEqual(0);
    expect(outcome.required_gates).toContain("POLICY.GATE.NEW_ENTITY.CHECKS@0.1.0");
    expect(outcome.why).toContain("NO_MATCH");
  });

  it("空 need → SCHEMA_INVALID（空需求无从解析）", async () => {
    await expect(resolveNeed(store, catalogRoot, { need: "   " })).rejects.toThrow("空需求");
  });
});

describe("词形腿（CONFIGURABLE/EXTENSIBLE；knowledgeQueryTokens 同一实现，禁子串）", () => {
  it("archetype 命中 → CONFIGURABLE_MATCH + required_bindings 聚合（v0.6.1 §70 判例）", async () => {
    writeArchetype(
      "PAGE_ARCHETYPE.MASTER_DATA",
      "主数据管理页",
      "PageHeader→FilterBar→Toolbar→DataGrid→Pagination 组合",
      ["ARCHETYPE.BACKEND.CRUD_RESOURCE"],
    );
    const outcome = await resolveNeed(store, catalogRoot, { need: "主数据管理页 supplier master data" });
    expect(outcome.match_class).toBe("CONFIGURABLE_MATCH");
    expect(outcome.matches[0]?.domain).toBe("catalog");
    expect(outcome.matches[0]?.id).toBe("PAGE_ARCHETYPE.MASTER_DATA");
    expect(outcome.required_bindings).toEqual(["ARCHETYPE.BACKEND.CRUD_RESOURCE"]);
    expect(outcome.why).toContain("标准件");
  });

  it("仅项目对象词形命中 → EXTENSIBLE_MATCH（先扩展禁平行新建）", async () => {
    await seedPage("PAGE.SUPPLIER_MANAGEMENT", "供应商管理");
    const outcome = await resolveNeed(store, catalogRoot, { need: "供应商管理" });
    expect(outcome.match_class).toBe("EXTENSIBLE_MATCH");
    expect(outcome.matches[0]?.domain).toBe("truth");
    expect(outcome.matches[0]?.matched_tokens.length).toBeGreaterThan(0);
  });

  it("词形腿禁子串猜测（「供应」不是「供应商管理」的命中——P28/P31 同源纪律）", async () => {
    await seedPage("PAGE.SUPPLIER_MANAGEMENT", "供应商管理");
    const outcome = await resolveNeed(store, catalogRoot, { need: "供应" });
    expect(outcome.match_class).toBe("NO_MATCH");
  });

  it("两分母零命中 → NO_MATCH（分母披露：truth_rows/catalog_archetypes 在场证明真的查了）", async () => {
    writeArchetype("PAGE_ARCHETYPE.MASTER_DATA", "主数据管理页", "标准件分母");
    const outcome = await resolveNeed(store, catalogRoot, { need: "跨车型成本比较" });
    expect(outcome.match_class).toBe("NO_MATCH");
    expect(outcome.sources_examined.truth_rows).toBeGreaterThanOrEqual(0);
    expect(outcome.sources_examined.catalog_archetypes).toBe(1);
  });

  it("archetypes/ 目录缺失 → 零标准件合法状态（opt-in 禁空壳仪式）+ 分母 0 披露", async () => {
    const emptyCatalog = join(root, "no-catalog");
    const outcome = await resolveNeed(store, emptyCatalog, { need: "供应商管理" });
    expect(outcome.sources_examined.catalog_archetypes).toBe(0);
    expect(outcome.match_class).toBe("NO_MATCH");
  });
});

describe("New Entity Gate 解析侧判卷（v0.6.1 §75 五否 + §87）", () => {
  it("NO_MATCH → 允许 Design New（new_entity_allowed=true）；其余 → 拒绝 + denied_by", () => {
    expect(newEntityVerdictFromResolution("NO_MATCH")).toEqual({
      new_entity_allowed: true,
      denied_by: [],
    });
    for (const matchClass of [
      "EXACT_MATCH",
      "CONFIGURABLE_MATCH",
      "EXTENSIBLE_MATCH",
      "COMPOSABLE_MATCH",
      "REFERENCE_MATCH",
    ] as const) {
      const verdict = newEntityVerdictFromResolution(matchClass);
      expect(verdict.new_entity_allowed).toBe(false);
      expect(verdict.denied_by).toEqual([matchClass]);
    }
  });

  it("词表外 match_class → SCHEMA_INVALID（禁静默放行）", () => {
    expect(() =>
      newEntityVerdictFromResolution("MAGICAL_MATCH" as never),
    ).toThrow("词表外");
  });
});
