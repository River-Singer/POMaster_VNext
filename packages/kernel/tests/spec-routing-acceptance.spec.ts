/**
 * spec-routing-acceptance.spec.ts —— W4 路由验收（PRD AC-09/10；W4 PRD Acceptance
 * Criteria 逐条对账）。聚合性端到端验收：AG Grid 编辑保存样例精准命中、无关 stack
 * 反例、退役协议可解释排除、显式 reference/always 正例、必要协议超 3–8 不截断。
 *
 * MASTer 边界：AG Grid 协议条目只以 overlay fixture 存在（项目特例不进 universal
 * seed——repo catalog/spec-routing.json 恒空分母，本文件一并断言）；协议正文不进
 * 本仓（路由只引用 path 导航位）。
 */
import { describe, expect, it } from "vitest";
import {
  loadSpecRoutingManifest,
  resolveCatalogRoot,
  routeSpecs,
  type SpecRoutingInput,
  type SpecRoutingManifest,
} from "@pomaster/kernel";
import { pureManifest, sha } from "./spec-routing-fixtures.js";

const REPO_CATALOG = resolveCatalogRoot();

/** AG Grid 编辑保存任务（三态描边/dirty 标记/保存回填场景的任务侧输入词形）。 */
const AG_GRID_EDIT_SAVE: SpecRoutingInput = {
  stage: "implement",
  triggers: ["edit-save", "data-grid", "ag-grid", "save", "test"],
  stack: ["vue", "ag-grid"],
  specRefs: [],
};

const DEV_CHECKLIST = "PROTOCOL.FRONTEND.DEV_CHECKLIST";
const AI_CODE = "PROTOCOL.FRONTEND.AI_CODE";
const GATE = "PROTOCOL.FRONTEND.ACCEPTANCE_GATE";
const GRID = "PROTOCOL.FRONTEND.DATA_GRID";
const FORM = "PROTOCOL.FRONTEND.FORM";
const MODEL = "PROTOCOL.FRONTEND.DATA_MODEL";
const API = "PROTOCOL.FRONTEND.REQUEST_API";
const TESTING = "PROTOCOL.FRONTEND.TESTING";
const MOCK = "PROTOCOL.FRONTEND.MOCK";
const BE_API = "PROTOCOL.BACKEND.REQUEST_API";
const OLD = "PROTOCOL.FRONTEND.OLD_GRID";
const THEME = "PROTOCOL.FRONTEND.THEME";

function includedOf(
  manifest: SpecRoutingManifest,
  input: SpecRoutingInput,
): Map<string, { channels: readonly string[]; why: string; path: string; source_sha256: string }> {
  return new Map(
    routeSpecs(manifest, input)
      .filter((d) => d.included)
      .map((d) => [d.semantic_id, { channels: d.channels, why: d.why, path: d.path, source_sha256: d.source_sha256 }]),
  );
}

// ============================================================
// AC-1：AG Grid 编辑保存样例——命中 grid/form/data-model/API/testing/mock 及基线，
// 不全量加载（数量断言）
// ============================================================

describe("AC-1 AG Grid 编辑保存样例（精准选择，不全量加载）", () => {
  const manifest = pureManifest();

  it("命中集 = 2 基线 + grid/form/data-model/API/testing/mock 恰 8 条；全分母 12 不全量加载", () => {
    const included = includedOf(manifest, AG_GRID_EDIT_SAVE);
    expect([...included.keys()].sort()).toEqual(
      [AI_CODE, DEV_CHECKLIST, GRID, FORM, MODEL, API, TESTING, MOCK].sort(),
    );
    expect(included.size).toBe(8);
    expect(included.size).toBeLessThan(manifest.entries.length);
  });

  it("每份命中协议给理由（通道 + 依赖链）与来源身份/指纹", () => {
    const included = includedOf(manifest, AG_GRID_EDIT_SAVE);
    const grid = included.get(GRID)!;
    expect(grid.channels).toContain("trigger");
    expect(grid.why).toContain("data-grid");
    expect(grid.path).toContain("30-data-grid-protocol.md");
    expect(grid.source_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    const baseline = included.get(DEV_CHECKLIST)!;
    expect(baseline.channels).toEqual(["always"]);
    // 依赖链呈现：API 依赖 DATA_MODEL、MOCK 依赖 TESTING 均随选（候选集完整）。
    const api = included.get(API)!;
    expect(api.channels).toContain("trigger");
    const mock = included.get(MOCK)!;
    expect(mock.channels).toContain("trigger");
  });

  it("显式排除可对账：backend stack 无交集 / 退役 / 无关条目 / verify-only 未点名", () => {
    const decisions = new Map(
      routeSpecs(manifest, AG_GRID_EDIT_SAVE).map((d) => [d.semantic_id, d]),
    );
    expect(decisions.get(BE_API)!.included).toBe(false);
    expect(decisions.get(BE_API)!.why).toContain("无交集");
    expect(decisions.get(OLD)!.included).toBe(false);
    expect(decisions.get(OLD)!.why).toContain("superseded");
    expect(decisions.get(OLD)!.why).toContain(GRID);
    expect(decisions.get(THEME)!.included).toBe(false);
    expect(decisions.get(THEME)!.why).toContain("无命中通道");
    expect(decisions.get(GATE)!.included).toBe(false);
    expect(decisions.get(GATE)!.why).toContain("无命中通道");
  });

  it("同输入重放：选择与解释字节确定（AC-2 的验收位）", () => {
    const a = routeSpecs(manifest, AG_GRID_EDIT_SAVE);
    const b = routeSpecs(manifest, AG_GRID_EDIT_SAVE);
    expect(a).toEqual(b);
  });
});

// ============================================================
// AC-3 正反例对账：always / triggered / explicit / 依赖 / 冲突 / superseded /
// not_configured
// ============================================================

describe("AC-3 通道与闸正反例对账", () => {
  const manifest = pureManifest();

  it("always 正例：任意输入（含全空）恒命中且通道恰为 always", () => {
    const empty = includedOf(manifest, { stage: null, triggers: [], stack: null, specRefs: [] });
    expect(empty.get(DEV_CHECKLIST)!.channels).toEqual(["always"]);
    expect(empty.get(AI_CODE)!.channels).toEqual(["always"]);
  });

  it("trigger 正例 + 子串负例：data-grid 命中而 grid 不命中（词级精确）", () => {
    const hit = includedOf(manifest, {
      stage: null,
      triggers: ["data-grid"],
      stack: ["vue", "ag-grid"],
      specRefs: [],
    });
    expect(hit.has(GRID)).toBe(true);
    const miss = includedOf(manifest, {
      stage: null,
      triggers: ["grid"],
      stack: ["vue", "ag-grid"],
      specRefs: [],
    });
    expect(miss.has(GRID)).toBe(false);
  });

  it("explicit 正例：verify-only 协议经点名在 implement 任务入选（绕 stage 闸）", () => {
    const included = includedOf(manifest, {
      stage: "implement",
      triggers: [],
      stack: null,
      specRefs: [GATE],
    });
    expect(included.get(GATE)!.channels).toContain("explicit");
  });

  it("依赖正例：TESTING 随选时 MOCK 入选；依赖负例：TESTING 无通道时 MOCK 剔除且理由显式", () => {
    const withTesting = includedOf(manifest, {
      stage: null,
      triggers: ["edit-save", "test"],
      stack: ["vue"],
      specRefs: [],
    });
    expect(withTesting.has(MOCK)).toBe(true);
    expect(withTesting.has(TESTING)).toBe(true);
    const withoutTesting = routeSpecs(manifest, {
      stage: null,
      triggers: ["edit-save"],
      stack: ["vue"],
      specRefs: [],
    });
    const mock = withoutTesting.find((d) => d.semantic_id === MOCK)!;
    expect(mock.included).toBe(false);
    expect(mock.why).toContain(TESTING);
    expect(mock.why).toContain("依赖");
  });

  it("conflicts 正反例：互斥对按登记序保留在先者（确定性去重）", () => {
    const conflictManifest = pureManifest([
      { semantic_id: "PROTOCOL.X.PRIMARY", path: "primary.md", triggers: ["go"], conflicts: ["PROTOCOL.X.SECONDARY"], source_sha256: sha("p1") },
      { semantic_id: "PROTOCOL.X.SECONDARY", path: "secondary.md", triggers: ["go"], conflicts: ["PROTOCOL.X.PRIMARY"], source_sha256: sha("s2") },
    ]);
    const decisions = routeSpecs(conflictManifest, {
      stage: null,
      triggers: ["go"],
      stack: null,
      specRefs: [],
    });
    const primary = decisions.find((d) => d.semantic_id === "PROTOCOL.X.PRIMARY")!;
    const secondary = decisions.find((d) => d.semantic_id === "PROTOCOL.X.SECONDARY")!;
    expect(primary.included).toBe(true);
    expect(secondary.included).toBe(false);
    expect(secondary.why).toContain("PROTOCOL.X.PRIMARY");
  });

  it("not_configured 负例：任务未声明 stack → 声明 stack 的协议排除且理由明示 not_configured", () => {
    const decisions = routeSpecs(manifest, {
      stage: null,
      triggers: ["data-grid"],
      stack: null,
      specRefs: [],
    });
    const grid = decisions.find((d) => d.semantic_id === GRID)!;
    expect(grid.included).toBe(false);
    expect(grid.why).toContain("not_configured");
  });
});

// ============================================================
// AC-2/AC-4：无关 stack 双向反例 + 必要协议 > 8 不截断 + universal seed 恒空
// ============================================================

describe("AC-2 无关 backend stack 样例（双向不误选）", () => {
  const manifest = pureManifest();

  it("backend 任务（stack=fastapi）不误选 frontend 协议；frontend 任务反向不误选 backend 协议", () => {
    const backendTask = includedOf(manifest, {
      stage: "implement",
      triggers: ["save", "data-grid"],
      stack: ["fastapi"],
      specRefs: [],
    });
    expect(backendTask.has(BE_API)).toBe(true);
    expect(backendTask.has(GRID)).toBe(false);
    expect(backendTask.has(FORM)).toBe(false);
    // always 基线跨 lane 恒在（lane 无关语义——基线协议未声明 stack）。
    expect(backendTask.has(DEV_CHECKLIST)).toBe(true);
    const frontendTask = includedOf(manifest, AG_GRID_EDIT_SAVE);
    expect(frontendTask.has(BE_API)).toBe(false);
  });
});

describe("AC-4 必要协议超过 3–8 时不为凑数截断", () => {
  it("11 条全 always 基线全保留（数量断言 11/11——无 3–8 硬上限、无截断词形）", () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({
      semantic_id: `PROTOCOL.FRONTEND.BASELINE_${i + 1}`,
      path: `.trellis/spec/frontend/baseline-${i + 1}-protocol.md`,
      always: true,
      source_sha256: sha(`f${i}`),
    }));
    const decisions = routeSpecs(pureManifest(entries), {
      stage: null,
      triggers: [],
      stack: null,
      specRefs: [],
    });
    expect(decisions).toHaveLength(11);
    expect(decisions.every((d) => d.included)).toBe(true);
    for (const decision of decisions) {
      expect(decision.why).not.toContain("截断");
      expect(decision.why).not.toContain("上限");
    }
  });

  it("10 条 trigger 全命中的必要协议同样全保留（>8 目标不截断）", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      semantic_id: `PROTOCOL.FRONTEND.NEEDED_${i + 1}`,
      path: `.trellis/spec/frontend/needed-${i + 1}-protocol.md`,
      stage: ["implement"],
      triggers: ["edit-save"],
      source_sha256: sha(`e${i}`),
    }));
    const decisions = routeSpecs(pureManifest(entries), {
      stage: "implement",
      triggers: ["edit-save"],
      stack: null,
      specRefs: [],
    });
    expect(decisions.filter((d) => d.included)).toHaveLength(10);
  });
});

describe("universal seed 恒空（项目事实不自动晋升）", () => {
  it("repo catalog/spec-routing.json 零条目：任意任务输入在 universal seed 上零协议注入", () => {
    const repo = loadSpecRoutingManifest(REPO_CATALOG);
    expect(repo).not.toBeNull();
    expect(repo!.entries).toEqual([]);
    const decisions = routeSpecs(repo!, AG_GRID_EDIT_SAVE);
    expect(decisions.every((d) => !d.included)).toBe(true);
  });
});
