/**
 * sources.spec.ts —— Sources Authority Registry 装载/校验/投影消费（09-04 vNext
 * Batch 1 R3；Owner 裁定 D2——PRD §3A Source Artifact Authority 正交权威轴）。
 *
 * 覆盖锚点：
 * - loadSourcesRegistry：缺席 → null（opt-in 平面显式缺席）；合法 YAML 装载；
 *   fail-closed（YAML 损坏 / schema 词形 / authority 块缺失 / 两轴相交 / id 重复
 *   → SCHEMA_INVALID——坏 registry ≠ 无 registry）；
 * - 投影 AUTHORITATIVE 区消费：被 Change 引用的 source 带 authoritative_for /
 *   non_authoritative_for 注记；引用悬空显式「不在册」；
 * - **MasterGrid 双层最小锚（§9B CRC-B 语义，完整 CRC 套件归 Batch 5）**：
 *   第一层负封条 = prototype_html_scrape 来源注册生产对象 → SOURCE_TYPE_FORBIDDEN
 *   FATAL（零改动既有码）；第二层正轴 = sources/index.yaml 双轴申报后投影呈现
 *   「原型对 grid_library/css 无发言权」的正交权威注记。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GovernanceError,
  applyTransaction,
  buildStorePaths,
  compileProjection,
  loadSourcesRegistry,
} from "@pomaster/kernel";
import { makeStore, pageEnvelope } from "./helpers.js";

function sourcesIndexPathOf(root: string): string {
  return join(root, ".pomaster", "sources", "index.yaml");
}

function writeSourcesYaml(root: string, text: string): void {
  // kernel createStore 不预铺 sources/（init 面）；测试自建目录（宪法 §2 预铺纪律的项目侧形态）。
  mkdirSync(join(root, ".pomaster", "sources"), { recursive: true });
  writeFileSync(sourcesIndexPathOf(root), text, "utf8");
}

/** §3A 典型 BP Prototype 逐字段例（维度词形 = 原文例逐字子集）。 */
const BP_CARLINE_YAML = `sources:
  - id: bp-carline
    type: bp_prototype
    location: prototypes/carline/index.html
    version: rev-2026-09-01
    authority:
      authoritative_for:
        - business_information
        - information_architecture
        - interaction_intent
        - business_flow
      non_authoritative_for:
        - css
        - class_name
        - dom_implementation
        - grid_library
        - component_implementation
        - framework
`;

async function registerChangeWithSourceRefs(
  root: string,
  store: Parameters<typeof applyTransaction>[0],
  sourceRefs: readonly string[],
): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: pageEnvelope({
          id: "CHANGE.CARLINE_GRID",
          kind: "change_object",
          axisProfile: "change_default",
          titleZh: "换网格引擎落地",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          payload: {
            motivation: "BP 原型说 MasterGrid、Baseline 说 AG Grid——grid 实现权威归 Baseline",
            affected_objects: [],
            reopen_count: 0,
            class_scan_result: {
              scope: "test-fixture：sources 投影消费用例（无同类代码修改）",
              hits: 0,
              fixed_count: 0,
              regression_case_ref: "sources.spec:CRC-B-anchor",
            },
            source_refs: [...sourceRefs],
          },
        }) as never,
      },
    ],
  });
  void root;
}

// ============================================================
// 装载与校验（fail-closed）
// ============================================================

describe("loadSourcesRegistry（§3A 正交权威轴装载）", () => {
  it("文件缺席 → null（opt-in 平面显式缺席，非空表冒充）", async () => {
    const { root } = await makeStore();
    expect(loadSourcesRegistry(buildStorePaths(root))).toBeNull();
  });

  it("合法 BP Prototype registry → 逐字段装载（双轴维度保序）", async () => {
    const { root } = await makeStore();
    writeSourcesYaml(root, BP_CARLINE_YAML);
    const registry = loadSourcesRegistry(buildStorePaths(root));
    expect(registry).not.toBeNull();
    expect(registry?.sources).toHaveLength(1);
    const source = registry?.sources[0];
    expect(source?.id).toBe("bp-carline");
    expect(source?.type).toBe("bp_prototype");
    expect(source?.location).toBe("prototypes/carline/index.html");
    expect(source?.version).toBe("rev-2026-09-01");
    expect(source?.authoritative_for).toEqual([
      "business_information",
      "information_architecture",
      "interaction_intent",
      "business_flow",
    ]);
    expect(source?.non_authoritative_for).toEqual([
      "css",
      "class_name",
      "dom_implementation",
      "grid_library",
      "component_implementation",
      "framework",
    ]);
  });

  it("YAML 损坏 → SCHEMA_INVALID（禁静默当空表）", async () => {
    const { root } = await makeStore();
    writeSourcesYaml(root, "sources: [ {id: broken");
    expect(() => loadSourcesRegistry(buildStorePaths(root))).toThrow(GovernanceError);
  });

  it("authority 块缺失/双轴任一缺席 → SCHEMA_INVALID（轴结构闭包——authority 必填）", async () => {
    const { root } = await makeStore();
    writeSourcesYaml(
      root,
      "sources:\n  - id: bp-x\n    type: bp_prototype\n    location: prototypes/x.html\n",
    );
    expect(() => loadSourcesRegistry(buildStorePaths(root))).toThrow(/schema/i);

    const { root: root2 } = await makeStore();
    writeSourcesYaml(
      root2,
      "sources:\n  - id: bp-x\n    type: bp_prototype\n    location: prototypes/x.html\n    authority:\n      authoritative_for: []\n      non_authoritative_for: []\n",
    );
    // 双轴并集至少一维度非空（anyOf minItems 1）。
    expect(() => loadSourcesRegistry(buildStorePaths(root2))).toThrow(/schema/i);
  });

  it("两轴相交 → SCHEMA_INVALID（draft-07 表达不了的结构判卷——D2 fail-closed）", async () => {
    const { root } = await makeStore();
    writeSourcesYaml(
      root,
      "sources:\n  - id: bp-x\n    type: bp_prototype\n    location: prototypes/x.html\n    authority:\n      authoritative_for: [css]\n      non_authoritative_for: [css]\n",
    );
    try {
      loadSourcesRegistry(buildStorePaths(root));
      expect.unreachable("两轴相交必须 fail-closed");
    } catch (err) {
      expect(err).toBeInstanceOf(GovernanceError);
      expect((err as GovernanceError).message).toContain("两轴相交");
    }
  });

  it("id 重复 → SCHEMA_INVALID（投影呈现/引用对账的稳定锚）", async () => {
    const { root } = await makeStore();
    writeSourcesYaml(
      root,
      "sources:\n  - id: dup\n    type: doc\n    location: docs/a.md\n    authority:\n      authoritative_for: [business_flow]\n      non_authoritative_for: []\n  - id: dup\n    type: doc\n    location: docs/b.md\n    authority:\n      authoritative_for: []\n      non_authoritative_for: [css]\n",
    );
    try {
      loadSourcesRegistry(buildStorePaths(root));
      expect.unreachable("id 重复必须 fail-closed");
    } catch (err) {
      expect(err).toBeInstanceOf(GovernanceError);
      expect((err as GovernanceError).message).toContain("id 重复");
    }
  });
});

// ============================================================
// 投影 AUTHORITATIVE 区消费（被 Change 引用的 source）
// ============================================================

describe("投影消费（sources/index.yaml → AUTHORITATIVE 区注记）", () => {
  it("被 Change payload source_refs 引用的 source → MUST 区带 authoritative_for / non_authoritative_for 注记", async () => {
    const { root, store } = await makeStore();
    writeSourcesYaml(root, BP_CARLINE_YAML);
    await registerChangeWithSourceRefs(root, store, ["bp-carline"]);
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "CHANGE.CARLINE_GRID",
    });
    const entry = projection.manifest.mustEntries.find((candidate) => candidate.ref === "bp-carline");
    expect(entry, "引用的 source 必须进 MUST 区").toBeDefined();
    expect(entry?.reason).toContain("AUTHORITATIVE: source bp-carline");
    expect(entry?.reason).toContain("authoritative_for=[business_information");
    expect(entry?.reason).toContain("non_authoritative_for=[css");
    expect(entry?.reason).toContain("grid_library");
  });

  it("引用悬空（source_refs 指向不在册 id）→ MUST 区显式「不在册」注记（缺席显式非静默丢弃）", async () => {
    const { root, store } = await makeStore();
    writeSourcesYaml(root, BP_CARLINE_YAML);
    await registerChangeWithSourceRefs(root, store, ["bp-ghost"]);
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "CHANGE.CARLINE_GRID",
    });
    const entry = projection.manifest.mustEntries.find((candidate) => candidate.ref === "bp-ghost");
    expect(entry).toBeDefined();
    expect(entry?.reason).toContain("不在册");
  });

  it("无引用（无 source_refs）→ sources 平面不进 MUST；registry 损坏 → compileProjection SCHEMA_INVALID", async () => {
    const { root, store } = await makeStore();
    writeSourcesYaml(root, BP_CARLINE_YAML);
    await registerChangeWithSourceRefs(root, store, []);
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "CHANGE.CARLINE_GRID",
    });
    expect(
      projection.manifest.mustEntries.some((entry) => entry.ref.startsWith("bp-")),
    ).toBe(false);

    const { root: root2, store: store2 } = await makeStore();
    writeSourcesYaml(root2, "sources: [ {id: broken");
    await expect(
      compileProjection(store2, { role: "frontend" }),
    ).rejects.toThrow(GovernanceError);
  });
});

// ============================================================
// MasterGrid 双层最小锚（§9B CRC-B 语义；完整 CRC 套件归 Batch 5）
// ============================================================

describe("CRC-B 最小锚：MasterGrid 污染双层（负封条 FATAL + 正轴维度判卷）", () => {
  it("第一层·负封条：prototype_html_scrape 来源注册生产对象 → SOURCE_TYPE_FORBIDDEN FATAL（零改动既有码）", async () => {
    const { store } = await makeStore();
    const bad = await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: pageEnvelope({
            id: "COMPONENT.CAR_GRID",
            kind: "component",
            axisProfile: "component_default",
            titleZh: "车型网格（原型实现继承）",
            payload: {},
            sources: [
              {
                type: "prototype_html_scrape",
                ref: "prototypes/carline/index.html",
                capturedBy: "agent:scraper",
                pin: { baseline: "prototypes@head" },
              },
            ],
          }) as never,
        },
      ],
    }).catch((err: unknown) => err);
    expect(bad).toBeInstanceOf(GovernanceError);
    expect((bad as GovernanceError).code).toBe("SOURCE_TYPE_FORBIDDEN");
    expect((bad as GovernanceError).hint).toContain("Walkthrough");
  });

  it("第二层·正轴：BP 原型双轴申报 → 投影呈现「无发言权维度不得充当实现权威」（grid 实现权威归 Baseline）", async () => {
    const { root, store } = await makeStore();
    writeSourcesYaml(root, BP_CARLINE_YAML);
    await registerChangeWithSourceRefs(root, store, ["bp-carline"]);
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "CHANGE.CARLINE_GRID",
    });
    const entry = projection.manifest.mustEntries.find((candidate) => candidate.ref === "bp-carline");
    expect(entry).toBeDefined();
    expect(entry?.reason).toContain("non_authoritative_for=");
    expect(entry?.reason).toContain("grid_library");
    expect(entry?.reason).toContain("framework");
    expect(entry?.reason).toContain("不得充当实现/设计权威");
    // 正轴不越权：business_information 仍在 authoritative 轴（原型对这些维度有发言权）。
    expect(entry?.reason).toContain("authoritative_for=[business_information");
  });
});
