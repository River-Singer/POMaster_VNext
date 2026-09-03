/**
 * v06-batch2-materials.spec.ts —— P-v06 批次 2 catalog 物料半场验收
 * （v0.6.1 §16 STATE_ARCHETYPE 八态 / §17 State Ownership 判定表落位 /
 *   §18 FRONTEND_ARCHETYPE 三型 + §21 前端错误九分型；研究锚纪律）。
 *
 * 判据锚：
 * - §16 八 id 词形逐字闭包 + layer=PATTERN（loadCatalogArchetypes 实读 repo catalog——
 *   词形闸/词表闸经 kernel 单一读取面生效，坏物料本调用即爆）；
 * - §17 ownership 判定行逐条落进各态 semantic（远端资源/URL/FORM/LOCAL_UI）；
 * - defaults/链序词形锚定研究报告（TanStack v5 双轴三词形/乐观链序五步/refetch 三触发/
 *   XState v5 六概念）；Illegal Transition 差异注记（研究差异表 #7）在
 *   x-research-anchors.note 在场（待 Owner 裁定）；
 * - SPA_LAYERED×MODULAR incompatible 双向对称（incompatible 槽首个真实用例）；
 *   三型 composition.requires=[]（架构选择不由其他标准件组成）；
 * - §21 九分型逐字闭包 + 每型四列绑定（presentation_pattern/retry_behavior/
 *   telemetry/user_message）+ 待裁定两项（差异表 #8）在 note 在场；
 * - 每个 STATE_ARCHETYPE 物料 x-research-anchors.sources 非空且带 2026-09-03 日期锚
 *   （防「无锚物料」回潮——批次 1 物料全部带锚的纪律延续）。
 * 深层字段（defaults/categories/sources[].fetched）经原样 JSON 直读（tracer spec ③④
 * 同法：物料非治理事实，读文件即可判卷）；id/layer/composition/semantic/referenceAnchors
 * 经 kernel loadCatalogArchetypes 消费面（单一读取面纪律）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";

const CATALOG = resolveCatalogRoot();
const materials = loadCatalogArchetypes(CATALOG);
const byId = new Map(materials.map((entry) => [entry.id, entry]));

/** 原样 JSON 直读（深层字段判卷面；loader 只暴露 §4 Catalog Object 最小判卷面）。 */
function rawMaterial(id: string): Record<string, unknown> {
  const entry = byId.get(id);
  expect(entry, `物料在册: ${id}`).toBeDefined();
  return JSON.parse(readFileSync(join(CATALOG, entry!.file), "utf8")) as Record<string, unknown>;
}

const STATE_IDS = [
  "STATE_ARCHETYPE.SERVER_QUERY",
  "STATE_ARCHETYPE.URL_FILTER",
  "STATE_ARCHETYPE.FORM_EDIT",
  "STATE_ARCHETYPE.SELECTION",
  "STATE_ARCHETYPE.ASYNC_COMMAND",
  "STATE_ARCHETYPE.WIZARD",
  "STATE_ARCHETYPE.OPTIMISTIC_MUTATION",
  "STATE_ARCHETYPE.BACKGROUND_REFRESH",
] as const;

const FRONTEND_IDS = [
  "FRONTEND_ARCHETYPE.SPA_LAYERED",
  "FRONTEND_ARCHETYPE.FEATURE_ORIENTED",
  "FRONTEND_ARCHETYPE.MODULAR",
  "FRONTEND_ARCHETYPE.ERROR_TAXONOMY",
] as const;

describe("§16 STATE_ARCHETYPE 八态族（逐字闭包 + §17 ownership 判定行落位）", () => {
  it("八 id 齐且词形逐字，layer=PATTERN + kind=archetype（§16 逐字八值）", () => {
    for (const id of STATE_IDS) {
      const entry = byId.get(id);
      expect(entry, `八态在册: ${id}`).toBeDefined();
      expect(entry!.kind).toBe("archetype");
      expect(entry!.layer).toBe("PATTERN");
      // §17 判定行落位：每态 when_to_use/when_not_to_use 双槽语义在填
      //（判定表对应行逐条进 semantic 的实质承载，空槽即未落位）。
      expect(entry!.semantic.whenToUse, `${id} when_to_use 落位`).toBeTruthy();
      expect(entry!.semantic.whenNotToUse, `${id} when_not_to_use 落位`).toBeTruthy();
    }
  });

  it("§17 四条判定行逐字落位：远端资源→SERVER_QUERY / 可分享筛选→URL / 未保存草稿→FORM / 临时展开选中→LOCAL_UI", () => {
    expect(byId.get("STATE_ARCHETYPE.SERVER_QUERY")?.semantic.whenToUse).toContain("远端资源");
    expect(byId.get("STATE_ARCHETYPE.URL_FILTER")?.semantic.whenToUse).toContain("可分享");
    expect(byId.get("STATE_ARCHETYPE.FORM_EDIT")?.semantic.whenToUse).toContain("未保存表单草稿");
    const selection = byId.get("STATE_ARCHETYPE.SELECTION")!;
    expect(selection.semantic.whenToUse).toContain("临时展开/选中");
    expect(selection.semantic.whenToUse).toContain("LOCAL_UI");
    // §17 收尾禁令在边界态在场。
    expect(selection.semantic.whenNotToUse).toContain("全局 Store");
  });

  it("SERVER_QUERY defaults：isPending/isFetching/isLoading 三词形区分 + staleTime 0 / gcTime 5min / retry 3（TanStack v5 实抓）", () => {
    const body = rawMaterial("STATE_ARCHETYPE.SERVER_QUERY") as {
      defaults: {
        word_form_distinction: Record<string, string>;
        status_axis: string[];
        fetch_status_axis: string[];
        staleTime: number;
        gcTime: string;
        retry: number;
      };
    };
    expect(Object.keys(body.defaults.word_form_distinction).sort()).toEqual([
      "isFetching",
      "isLoading",
      "isPending",
    ]);
    expect(body.defaults.word_form_distinction.isLoading).toContain("isPending && isFetching");
    expect(body.defaults.status_axis).toEqual(["pending", "error", "success"]);
    expect(body.defaults.fetch_status_axis).toEqual(["fetching", "paused", "idle"]);
    expect(body.defaults.staleTime).toBe(0);
    expect(body.defaults.gcTime).toBe("5min");
    expect(body.defaults.retry).toBe(3);
  });

  it("URL_FILTER defaults：URL is the source of truth + Next.js searchParams 双端形态注记（nuqs 2.10.1）", () => {
    const body = rawMaterial("STATE_ARCHETYPE.URL_FILTER") as {
      defaults: { source_of_truth: string; dual_surface_note: string };
    };
    expect(body.defaults.source_of_truth).toContain("URL is the source of truth");
    expect(body.defaults.dual_surface_note).toContain("Promise");
    expect(body.defaults.dual_surface_note).toContain("Suspense");
  });

  it("FORM_EDIT defaults：validateStatus 四值闭包 success/warning/error/validating", () => {
    const body = rawMaterial("STATE_ARCHETYPE.FORM_EDIT") as {
      defaults: { validation_status_words: string[] };
    };
    expect(body.defaults.validation_status_words).toEqual([
      "success",
      "warning",
      "error",
      "validating",
    ]);
  });

  it("ASYNC_COMMAND：XState 六概念词形齐 + Illegal Transition 差异注记在 x-research-anchors.note（差异表 #7，待 Owner 裁定）", () => {
    const body = rawMaterial("STATE_ARCHETYPE.ASYNC_COMMAND") as {
      defaults: { vocabulary: string[] };
    };
    expect(body.defaults.vocabulary).toEqual([
      "state",
      "event",
      "transition",
      "guard",
      "actor",
      "input",
      "output",
    ]);
    const entry = byId.get("STATE_ARCHETYPE.ASYNC_COMMAND")!;
    expect(entry.referenceAnchors.note).toContain("待 Owner 裁定");
    expect(entry.referenceAnchors.note).toContain("Illegal Transition");
    // 差异注记落「PRD 语义意图 + 实现绑定注记」两半：transition contract 声明 +
    // can() 守卫位，且明记 v5 现实（静默忽略）非运行时报错。
    expect(entry.referenceAnchors.note).toContain("transition contract");
    expect(entry.referenceAnchors.note).toContain("state.can()");
    expect(body.defaults.vocabulary).not.toContain("illegal_transition");
  });

  it("OPTIMISTIC_MUTATION：官方五步链序逐字 + onSettled 无条件 invalidate（TanStack v5 链序实抓）", () => {
    const body = rawMaterial("STATE_ARCHETYPE.OPTIMISTIC_MUTATION") as {
      defaults: {
        sequence: string[];
        invalidate_on_settled: boolean;
        await_invalidation: boolean;
      };
      forbidden: string[];
    };
    expect(body.defaults.sequence).toEqual([
      "cancel_inflight_refetch",
      "snapshot",
      "optimistic_write",
      "on_error_rollback",
      "on_settled_invalidate",
    ]);
    expect(body.defaults.invalidate_on_settled).toBe(true);
    expect(body.defaults.await_invalidation).toBe(true);
    expect(body.forbidden.join("\n")).toContain("cancelQueries");
    expect(body.forbidden.join("\n")).toContain("onSettled");
  });

  it("BACKGROUND_REFRESH：refetchOnWindowFocus 在场 + 与 SERVER_QUERY composition.optional 互链（组合链边）", () => {
    const body = rawMaterial("STATE_ARCHETYPE.BACKGROUND_REFRESH") as {
      defaults: { refetch_on: string[]; refetch_on_window_focus: boolean };
    };
    expect(body.defaults.refetch_on_window_focus).toBe(true);
    expect(body.defaults.refetch_on).toEqual(["mount", "window_focus", "reconnect"]);
    const entry = byId.get("STATE_ARCHETYPE.BACKGROUND_REFRESH")!;
    expect(entry.composition.optional).toContain("STATE_ARCHETYPE.SERVER_QUERY");
    expect(entry.composition.requires).toEqual([]);
  });
});

describe("§18 FRONTEND_ARCHETYPE 三型 + ERROR_TAXONOMY（layer=ARCHETYPE/PATTERN）", () => {
  it("三型 id 齐 + composition.requires 全空（架构选择不由其他标准件组成）", () => {
    for (const id of FRONTEND_IDS) {
      const entry = byId.get(id);
      expect(entry, `在册: ${id}`).toBeDefined();
      expect(entry!.composition.requires).toEqual([]);
    }
    expect(byId.get("FRONTEND_ARCHETYPE.SPA_LAYERED")!.layer).toBe("ARCHETYPE");
    expect(byId.get("FRONTEND_ARCHETYPE.FEATURE_ORIENTED")!.layer).toBe("ARCHETYPE");
    expect(byId.get("FRONTEND_ARCHETYPE.MODULAR")!.layer).toBe("ARCHETYPE");
    expect(byId.get("FRONTEND_ARCHETYPE.ERROR_TAXONOMY")!.layer).toBe("PATTERN");
  });

  it("SPA_LAYERED：五层共同稳定语义逐字（Page/Feature/Domain/API/Shared）+「项目不一定需要所有层」注记", () => {
    const body = rawMaterial("FRONTEND_ARCHETYPE.SPA_LAYERED") as {
      defaults: { layers_prd: string[]; layers_optional_note: string };
    };
    expect(body.defaults.layers_prd).toEqual(["Page", "Feature", "Domain", "API", "Shared"]);
    expect(body.defaults.layers_optional_note).toContain("项目不一定需要所有层");
    const entry = byId.get("FRONTEND_ARCHETYPE.SPA_LAYERED")!;
    expect(entry.referenceAnchors.note).toContain("项目不一定需要所有层");
  });

  it("SPA_LAYERED×MODULAR incompatible 双向对称登记（incompatible 槽首个真实用例）", () => {
    const spa = byId.get("FRONTEND_ARCHETYPE.SPA_LAYERED")!;
    const modular = byId.get("FRONTEND_ARCHETYPE.MODULAR")!;
    expect(spa.composition.incompatible).toContain("FRONTEND_ARCHETYPE.MODULAR");
    expect(modular.composition.incompatible).toContain("FRONTEND_ARCHETYPE.SPA_LAYERED");
  });

  it("FEATURE_ORIENTED：FSD 六有效层 + Processes deprecated + 无独立 API 层差异声明（差异表 #4）", () => {
    const body = rawMaterial("FRONTEND_ARCHETYPE.FEATURE_ORIENTED") as {
      defaults: {
        fsd_effective_layers: string[];
        deprecated_layers: string[];
        prd_semantic_mapping: Record<string, string>;
        api_layer_note: string;
        import_rule: string;
      };
    };
    expect(body.defaults.fsd_effective_layers).toEqual([
      "App",
      "Pages",
      "Widgets",
      "Features",
      "Entities",
      "Shared",
    ]);
    expect(body.defaults.deprecated_layers).toEqual(["Processes"]);
    expect(body.defaults.prd_semantic_mapping).toEqual({
      Page: "Pages",
      Feature: "Features",
      Domain: "Entities",
      Shared: "Shared",
    });
    expect(body.defaults.api_layer_note).toContain("segment");
    // FSD import rule 严格向下 + 差异注记在锚位 note 在场。
    expect(body.defaults.import_rule).toContain("严格下层");
    const entry = byId.get("FRONTEND_ARCHETYPE.FEATURE_ORIENTED")!;
    expect(entry.referenceAnchors.note).toContain("差异表 #4");
  });

  it("§21 ERROR_TAXONOMY：九分型逐字闭包 + 每型四列绑定（presentation/retry/telemetry/user_message）", () => {
    const body = rawMaterial("FRONTEND_ARCHETYPE.ERROR_TAXONOMY") as {
      categories: Record<string, Record<string, string>>;
    };
    // §21 逐字九分型：key 集全等（多一型少一型都算闭包破坏——待裁定两项不私扩）。
    expect(Object.keys(body.categories).sort()).toEqual(
      [
        "TRANSPORT",
        "AUTHENTICATION",
        "AUTHORIZATION",
        "VALIDATION",
        "BUSINESS",
        "CONFLICT",
        "TIMEOUT",
        "OFFLINE",
        "UNKNOWN",
      ].sort(),
    );
    const fourSlots = ["presentation_pattern", "retry_behavior", "telemetry", "user_message"];
    for (const [category, binding] of Object.entries(body.categories)) {
      expect(Object.keys(binding), `${category} 四列齐`).toEqual(
        expect.arrayContaining(fourSlots),
      );
      for (const slot of fourSlots) {
        expect(typeof binding[slot], `${category}.${slot} 非空`).toBe("string");
        expect((binding[slot] as string).length).toBeGreaterThan(0);
      }
    }
    // 401/403 分开（AUTHENTICATION≠AUTHORIZATION）在 retry 词形上可判别。
    expect(body.categories["AUTHENTICATION"]!.retry_behavior).not.toBe(
      body.categories["AUTHORIZATION"]!.retry_behavior,
    );
  });

  it("§21 待裁定两项在 ERROR_TAXONOMY x-research-anchors.note 在场（CANCELED 第十分型 / 429 归属），本物料保持九分型不扩", () => {
    const entry = byId.get("FRONTEND_ARCHETYPE.ERROR_TAXONOMY")!;
    expect(entry.referenceAnchors.note).toContain("待 Owner 裁定");
    expect(entry.referenceAnchors.note).toContain("CANCELED");
    expect(entry.referenceAnchors.note).toContain("429");
    const body = rawMaterial("FRONTEND_ARCHETYPE.ERROR_TAXONOMY") as {
      categories: Record<string, unknown>;
    };
    expect(Object.keys(body.categories)).not.toContain("CANCELED");
  });
});

describe("研究锚纪律（防「无锚物料」回潮）", () => {
  it("每个 STATE_ARCHETYPE 物料 x-research-anchors.sources 非空且带 2026-09-03 日期锚", () => {
    for (const id of STATE_IDS) {
      const body = rawMaterial(id) as {
        "x-research-anchors": { sources: { url: string; fetched: string }[] };
      };
      const anchors = body["x-research-anchors"];
      expect(anchors, `${id} 锚位在场`).toBeDefined();
      expect(anchors.sources.length, `${id} sources 非空`).toBeGreaterThan(0);
      expect(
        anchors.sources.some((source) => source.fetched === "2026-09-03"),
        `${id} 带 2026-09-03 日期锚`,
      ).toBe(true);
      for (const source of anchors.sources) {
        expect(source.url.length, `${id} source url 非空`).toBeGreaterThan(0);
      }
    }
  });

  it("12 份批次 2 新物料全部经 kernel 读取面在册（repo 分母现 41：批次 1 十 + 批次 2 十二 + 批次 3 十七 + 批次 4 二）", () => {
    const batch2Ids = [...STATE_IDS, ...FRONTEND_IDS];
    expect(batch2Ids.length).toBe(12);
    for (const id of batch2Ids) {
      expect(byId.has(id), `${id} 在册`).toBe(true);
    }
    expect(materials.length).toBe(41);
  });
});
