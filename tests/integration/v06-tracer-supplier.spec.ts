/**
 * v06-tracer-supplier.spec.ts —— P-v06 批次 1 Tracer Bullet 端到端验收
 * （v0.6 §194-195 Tracer 1 验收 + v0.6.1 §90 Supplier 场景 + §91 P0 Acceptance 八条）。
 *
 * 判据锚（验收逐条 → 测试用例映射）：
 * - §91.1 AI 不需要自己设计 Button → resolve 命中 COMPONENT_ARCHETYPE.BUTTON
 * - §91.2 AI 不需要自己设计 CRUD → resolve 命中 ARCHETYPE.BACKEND.CRUD_RESOURCE
 * - §91.3 AI 不需要自己决定分页基本契约 → CRUD defaults.pagination / QUERY
 *   defaults server_side_pagination（物料默认档）
 * - §91.4 AI 不需要从零设计标准 Master Data 表结构 → DATA_ARCHETYPE.MASTER_DATA
 * - §91.5 未登记 Component 被 Gate 抓住 → runNewEntityGate failed（自造
 *   COMPONENT.VEHICLE_SEARCH_SELECT 被拒——resolver 命中 SEARCH_SELECT 标准件）
 * - §91.6 需求特有字段仍由业务决定 → 物料 enforcement_note + resolver 输出零字段决定
 * - §91.7 Catalog 人类可完整浏览 → catalog status/explain 命令面
 * - §91.8 Agent Context 只注入任务所需标准件 → matches ⊂ 分母 + required_bindings
 *   仅结构面
 * - §195 Tracer 1：Page→API→Field 建图 + INSTANCE_OF 采纳边 + FIELD 反向 impact
 *   闭包回 Page + 故意自造组件被抓
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  createStore,
  impactClosure,
  instanceOfEdgesPresent,
  loadStoreReadOnly,
  readRelations,
  pathsOf,
  registerRelation,
  resolveCatalogRoot,
  resolveNeed,
  runNewEntityGate,
} from "@pomaster/kernel";
import { runCatalogExplain, runCatalogStatus } from "@pomaster/cli";

let root: string;
let store: ReturnType<typeof loadStoreReadOnly>;
let catalogRoot: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pvnext-v06-tracer-"));
  catalogRoot = resolveCatalogRoot();
  const created = await createStore(root);
  registerOwner("BUSINESS_OWNER");
  store = loadStoreReadOnly(root);
  void created;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function registerOwner(owner: string): void {
  const path = join(root, ".pomaster", "state", "authority.json");
  const current = JSON.parse(readFileSync(path, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  current.authorities[owner] = {};
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, "utf8");
}

/** Supplier Tracer 语料种子（v0.6.1 §90 场景的最小 truth 面）。 */
async function seedSupplierObjects(): Promise<void> {
  const envelopes = [
    {
      id: "PAGE.SUPPLIER_MANAGEMENT",
      kind: "page_surface",
      axisProfile: "page_default",
      titleZh: "供应商管理",
    },
    {
      id: "COMPONENT.SEARCH_SELECT",
      kind: "component",
      axisProfile: "component_default",
      titleZh: "供应商可搜索选择器",
    },
    {
      id: "API_REQ.SUPPLIER.LIST.1",
      kind: "contract_operation",
      axisProfile: "contract_default",
      titleZh: "供应商列表查询",
    },
    {
      id: "FIELD.SUPPLIER.NAME",
      kind: "field_definition",
      axisProfile: "field_default",
      titleZh: "供应商名称",
    },
  ];
  for (const base of envelopes) {
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            ...base,
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: { surface: "V1" },
          } as never,
        },
      ],
    } as never);
  }
}

describe("v0.6.1 §91 P0 Acceptance（八条）", () => {
  it("①② 不自设计 Button/CRUD：resolve 命中标准件（Button=CONFIGURABLE_MATCH；CRUD=COMPOSABLE_MATCH 批次 2 升判 + required_bindings 结构面）", async () => {
    await seedSupplierObjects();
    const button = await resolveNeed(store, catalogRoot, { need: "按钮 button 动作触发" });
    expect(button.match_class).toBe("CONFIGURABLE_MATCH");
    expect(button.matches.map((m) => m.id)).toContain("COMPONENT_ARCHETYPE.BUTTON");

    const crud = await resolveNeed(store, catalogRoot, { need: "CRUD 资源 create update delete" });
    // 批次 2 派生升级：CRUD 与 QUERY 经 composition.optional 构成组合链（CRUD.optional
    // 含 QUERY_RESOURCE id）→ COMPOSABLE_MATCH（批次 0 无组合分析时为 CONFIGURABLE）。
    expect(crud.match_class).toBe("COMPOSABLE_MATCH");
    expect(crud.matches.map((m) => m.id)).toContain("ARCHETYPE.BACKEND.CRUD_RESOURCE");
    // required_bindings 只聚合 composition.requires（CRUD 原型 requires 为空——可选档
    // QUERY/DATA 走 optional 位，resolver 不冒充强约束）。
    expect(crud.required_bindings).toEqual([]);
  });

  it("③ 分页基本契约不由 AI 决定：CRUD defaults.pagination / QUERY server_side_pagination 物料默认档", async () => {
    const { readFileSync } = await import("node:fs");
    const crud = JSON.parse(
      readFileSync(join(catalogRoot, "archetypes", "archetype.backend.crud_resource.json"), "utf8"),
    ) as { defaults: Record<string, boolean> };
    expect(crud.defaults.pagination).toBe(true);
    expect(crud.defaults.validation).toBe(true);
    expect(crud.defaults.audit).toBe(true);
    const query = JSON.parse(
      readFileSync(join(catalogRoot, "archetypes", "archetype.backend.query_resource.json"), "utf8"),
    ) as { defaults: string[] };
    expect(query.defaults).toContain("server_side_pagination");
    expect(query.defaults).toContain("bounded_page_size");
  });

  it("④ Master Data 表结构有基线原型：recommended_fields 九字段 + 默认非强制注记", async () => {
    const { readFileSync } = await import("node:fs");
    const data = JSON.parse(
      readFileSync(join(catalogRoot, "archetypes", "archetype.data.master_data.json"), "utf8"),
    ) as { recommended_fields: string[]; enforcement_note: string };
    expect(data.recommended_fields).toContain("business_code");
    expect(data.recommended_fields).toContain("version");
    expect(data.enforcement_note).toContain("非强制");
  });

  it("⑤ 未登记 Component 被 Gate 抓住：自造 VEHICLE_SEARCH_SELECT → failed（命中 SEARCH_SELECT 标准件）", async () => {
    await seedSupplierObjects();
    const run = await runNewEntityGate(store, catalogRoot, {
      candidates: [
        {
          wordForm: "COMPONENT.VEHICLE_SEARCH_SELECT",
          need: "可搜索车型选择器 searchable select combobox",
        },
      ],
    });
    expect(run.result.verdict).toBe("failed");
    const judgement = run.judgements[0];
    expect(judgement?.disposition).toBe("denied");
    // 批次 2 派生升级：SEARCH_SELECT 与 SEARCH_INPUT 经 composition.optional 构成组合链
    // （SEARCH_INPUT.optional 含 SEARCH_SELECT id）→ COMPOSABLE_MATCH（批次 0 无组合
    // 分析时为 CONFIGURABLE）；判卷结论不变——denied / failed（组合否不成立照样拒新建）。
    expect(judgement?.match_class).toBe("COMPOSABLE_MATCH");
    expect(judgement?.denied_by).toEqual(["COMPOSABLE_MATCH"]);
    expect(judgement?.matches.map((m) => m.id)).toContain("COMPONENT_ARCHETYPE.SEARCH_SELECT");
  });

  it("⑤补 无辜新建场景区分：NO_MATCH（分母在场）→ passed；文法外词形 → skipped_blindspot", async () => {
    await seedSupplierObjects();
    const okRun = await runNewEntityGate(store, catalogRoot, {
      candidates: [
        { wordForm: "COMPONENT.COST_HEATMAP", need: "成本热力图 heatmap 成本矩阵可视化" },
      ],
    });
    expect(okRun.result.verdict).toBe("passed");
    expect(okRun.judgements[0]?.sources_examined.catalog_archetypes).toBeGreaterThan(0);

    const blindRun = await runNewEntityGate(store, catalogRoot, {
      candidates: [{ wordForm: "component.not_screaming", need: "任意需求" }],
    });
    expect(blindRun.result.verdict).toBe("skipped_blindspot");
    expect(blindRun.judgements[0]?.denied_by).toContain("grammar_invalid");
  });

  it("⑥ 需求特有字段仍由业务决定：resolver 输出零字段决定（matches 只有标准件指针非字段清单）", async () => {
    const outcome = await resolveNeed(store, catalogRoot, { need: "主数据管理页 supplier master data" });
    for (const match of outcome.matches) {
      expect(Object.keys(match)).not.toContain("fields");
      expect(Object.keys(match)).not.toContain("columns");
    }
  });

  it("⑦ Catalog 人类可完整浏览：catalog status 分母含 archetypes=39 + explain 单条目解释", async () => {
    const status = await runCatalogStatus({ catalogRoot });
    expect(status.ok).toBe(true);
    expect(status.result?.sections.archetypes).toBe(39);
    expect(status.result?.lock_verification.ok).toBe(true);

    const explain = await runCatalogExplain("PAGE_ARCHETYPE.MASTER_DATA", { catalogRoot });
    expect(explain.ok).toBe(true);
    expect(JSON.stringify(explain.result)).toContain("主数据管理页");
  });

  it("⑧ Agent Context 只注入任务所需标准件：matches ⊂ 分母且 required_bindings 仅结构面", async () => {
    await seedSupplierObjects();
    const outcome = await resolveNeed(store, catalogRoot, { need: "供应商管理页 主数据" });
    expect(outcome.sources_examined.catalog_archetypes).toBe(39);
    expect(outcome.matches.length).toBeLessThan(39);
    for (const binding of outcome.required_bindings) {
      expect(binding).toMatch(/^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]+)+$/);
    }
  });
});

describe("v0.6 §195 Tracer 1 验收（建图 + 反向 impact + 自造组件被抓）", () => {
  it("Prototype→Component→Page→API→Field 建图：INSTANCE_OF/CALLS/READS 边全登记（provenance 五面齐备）", async () => {
    await seedSupplierObjects();
    await registerRelation(store, {
      type: "INSTANCE_OF",
      source: { domain: "truth", id: "PAGE.SUPPLIER_MANAGEMENT" },
      target: { domain: "catalog", id: "PAGE_ARCHETYPE.MASTER_DATA" },
      origin: "human_declared",
      confidence: "declared",
      producer: "human:owner",
      sourceRef: "P-v06 Tracer（Supplier 页采用 MASTER_DATA 原型）",
      declaredBy: "owner",
    });
    await registerRelation(store, {
      type: "CALLS",
      source: { domain: "truth", id: "PAGE.SUPPLIER_MANAGEMENT" },
      target: { domain: "truth", id: "API_REQ.SUPPLIER.LIST.1" },
      origin: "static_analysis",
      confidence: "deterministic",
      producer: "ANALYZER.TS.IMPORT_GRAPH",
      sourceRef: "src/pages/supplier/index.vue:42（Tracer 词面锚）",
      locator: "src/pages/supplier/index.vue:42",
    });
    await registerRelation(store, {
      type: "READS",
      source: { domain: "truth", id: "API_REQ.SUPPLIER.LIST.1" },
      target: { domain: "truth", id: "FIELD.SUPPLIER.NAME" },
      origin: "static_analysis",
      confidence: "deterministic",
      producer: "ANALYZER.SQL.REPOSITORY",
      sourceRef: "repository 扫描锚（Tracer）",
    });

    const entries = readRelations(pathsOf(store));
    expect(entries.length).toBe(3);
    expect(instanceOfEdgesPresent(entries, "PAGE.SUPPLIER_MANAGEMENT")).toEqual([
      "PAGE_ARCHETYPE.MASTER_DATA",
    ]);
  });

  it("FIELD 反向 impact 闭包回 Page：改 FIELD.SUPPLIER.NAME 影响链 API_REQ→PAGE（§106-108）", async () => {
    await seedSupplierObjects();
    await registerRelation(store, {
      type: "CALLS",
      source: { domain: "truth", id: "PAGE.SUPPLIER_MANAGEMENT" },
      target: { domain: "truth", id: "API_REQ.SUPPLIER.LIST.1" },
      origin: "static_analysis",
      confidence: "deterministic",
      producer: "ANALYZER.TS.IMPORT_GRAPH",
      sourceRef: "src/pages/supplier/index.vue:42",
    });
    await registerRelation(store, {
      type: "READS",
      source: { domain: "truth", id: "API_REQ.SUPPLIER.LIST.1" },
      target: { domain: "truth", id: "FIELD.SUPPLIER.NAME" },
      origin: "static_analysis",
      confidence: "deterministic",
      producer: "ANALYZER.SQL.REPOSITORY",
      sourceRef: "repository 扫描锚",
    });
    const closure = impactClosure(readRelations(pathsOf(store)), {
      domain: "truth",
      id: "FIELD.SUPPLIER.NAME",
    });
    expect(closure.affected.map((node) => node.endpoint.id)).toEqual([
      "API_REQ.SUPPLIER.LIST.1",
      "PAGE.SUPPLIER_MANAGEMENT",
    ]);
    expect(closure.affected[0]?.depth).toBe(1);
    expect(closure.affected[1]?.depth).toBe(2);
    expect(closure.affected[1]?.via_edge_type).toBe("CALLS");
  });
});
