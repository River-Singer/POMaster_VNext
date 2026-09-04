/**
 * CRC-B —— MasterGrid 污染（Constitutional Regression Case B；纠错清单 §31 Case 2 +
 * PRD 修订版 §9B CRC-B 行：原型实现无 Authority 决定生产实现——负封条 + 正轴双层，§3A）。
 *
 * 【命名纪律声明（Batch 5 R1，全套件统一）】本套件是 vNext Constitutional Regression
 * Suite，文件一律 CRC-<X>- 前缀，与三套既有 "Case/宪法" 命名显式划界：
 * 1) PRD v0.4/0.5.2 §16 旧 Case A-H（其中 §16 Case B=Catalog Applicability，与本
 *    CRC-B 重名不同义——catalog-applicability-case-b.spec.ts 属 §16 旧编号）；
 * 2) dot-pomaster-directory-constitution.md 目录宪法 §2/§11/§24/§34；
 * 3) benchmarks/constitutional.mjs 的 Constitutional/Architecture Change 性能基准档。
 * 三者均非本套件；本套件禁裸用 "Case A-H" 词形。
 *
 * 【规范锚】纠错 §31 Case 2 原文：「BP prototype: MasterGrid + CSS classes / Project
 * baseline: AG Grid + canonical components / Expected: 只继承 BP 的 business/IA/
 * interaction intent。」PRD §9B CRC-B：负封条 + 正轴双层（§3A）。
 *
 * 【联合锚设计（R2，B1 sources.spec 锚的套件级镜像）】分立检查已有封闭测试：
 * golden.spec.ts:166（SOURCE_TYPE_FORBIDDEN FATAL）、vocab.spec.ts:91（source_types
 * 十值闭包）、sources.spec.ts:189（双轴注记投影）。本 CRC 补跨面组合断言：
 * 同一 MasterGrid 场景下负封条（对象注册面 FATAL + 零写入）与正轴（sources/index.yaml
 * 双轴申报 → 投影「原型对 grid_library 无发言权」正交权威注记）**同场并存**——
 * 正轴在册不放松负封条，负封条不吞正轴呈现。
 *
 * 独立性：纯 kernel 进程内（L1），零网络/外部工具，确定性零墙钟，Windows 可跑。
 */
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyTransaction,
  compileProjection,
  GovernanceError,
  loadTruthIndex,
  type Store,
  type Transaction,
} from "@pomaster/kernel";
import { cid, makeCrcRoot, makeCrcStore, proposalEnvelope, txOf, writeSourcesYaml } from "./crc-lib.js";

/** §3A 典型 BP Prototype 逐字段例（维度词形 = 原文例逐字子集；sources.spec 同源转录）。 */
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

/** MasterGrid 场景 CHANGE（BP 说 MasterGrid、Baseline 说 AG Grid——grid 实现权威归 Baseline）。 */
async function registerChangeWithSourceRefs(
  store: Store,
  sourceRefs: readonly string[],
): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: proposalEnvelope({
          id: cid("CHANGE.CARLINE_GRID"),
          kind: "change_object",
          axisProfile: "change_default",
          titleZh: "换网格引擎落地",
          payload: {
            motivation: "BP 原型说 MasterGrid、Baseline 说 AG Grid——grid 实现权威归 Baseline",
            affected_objects: [],
            reopen_count: 0,
            class_scan_result: {
              scope: "crc-b fixture：MasterGrid 双层锚（无同类代码修改）",
              hits: 0,
              fixed_count: 0,
              regression_case_ref: "crc-b-mastergrid-source-authority.spec",
            },
            source_refs: [...sourceRefs],
          },
        }),
      },
    ],
  } as never);
}

const scrapeRegistrationTx = (): Transaction =>
  txOf([
    {
      op: "upsert_object",
      envelope: proposalEnvelope({
        id: cid("CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"),
        kind: "capability",
        axisProfile: "capability_default",
        titleZh: "原型抓取的表格序列化组件（MasterGrid 实现继承）",
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
  ]);

let root: string;
let store: Store;

beforeAll(async () => {
  root = makeCrcRoot("b");
  store = await makeCrcStore(root);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("CRC-B：MasterGrid 污染——负封条与正轴同场双层（§9B 行 B）", () => {
  it("正轴层：BP 原型双轴申报在册 → 投影 AUTHORITATIVE 区并排呈现 authoritative_for 与「对 grid_library/css 无发言权」注记", async () => {
    writeSourcesYaml(root, BP_CARLINE_YAML);
    await registerChangeWithSourceRefs(store, ["bp-carline"]);
    const projection = await compileProjection(store, {
      role: "frontend",
      taskRef: "CHANGE.CARLINE_GRID",
    });
    const entry = projection.manifest.mustEntries.find((c) => c.ref === "bp-carline");
    expect(entry, "引用的 source 必须进 AUTHORITATIVE 判卷输入区").toBeDefined();
    expect(entry?.reason).toContain("authoritative_for=[business_information");
    expect(entry?.reason).toContain("non_authoritative_for=[css");
    expect(entry?.reason).toContain("grid_library");
  });

  it("负封条层（同场）：正轴 registry 在册不放松禁入条款——prototype_html_scrape 注册生产对象仍 SOURCE_TYPE_FORBIDDEN FATAL 且零写入", async () => {
    const before = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const bad = await applyTransaction(store, scrapeRegistrationTx()).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(GovernanceError);
    expect((bad as GovernanceError).code).toBe("SOURCE_TYPE_FORBIDDEN");
    expect((bad as GovernanceError).hint).toContain("Live Walkthrough");
    // 封条零写入：真值索引字节不变（MasterGrid 实现继承没有进生产对象注册面）。
    const after = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    expect(after).toBe(before);
    const index = JSON.parse(after) as { objects: { id: string }[] };
    expect(index.objects.some((o) => o.id === "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS")).toBe(false);
  });

  it("串联：同 store 双层结论同场可复算——正轴注记在场 + 负封条后 store 仅含 CHANGE（正轴载体）与零抓取注册对象", async () => {
    const index = await loadTruthIndex(store);
    const ids = index.objects.map((o) => o.id);
    expect(ids).toContain("CHANGE.CARLINE_GRID");
    expect(ids).not.toContain("CAPABILITY.CSV_TOOL.SERIALIZE_ROWS");
  });
});
