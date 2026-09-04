/**
 * CRC-E —— Analyzer 观察失败（Constitutional Regression Case E；纠错清单 §31 Case 5 +
 * PRD 修订版 §9B CRC-E 行：FAILED_TO_OBSERVE ≠ NO_MATCH ≠ PASS）。
 *
 * 【命名纪律声明（Batch 5 R1，全套件统一）】本套件是 vNext Constitutional Regression
 * Suite，文件一律 CRC-<X>- 前缀，与三套既有 "Case/宪法" 命名显式划界：
 * 1) PRD v0.4/0.5.2 §16 旧 Case A-H（另一套编号）；
 * 2) dot-pomaster-directory-constitution.md 目录宪法 §2/§11/§24/§34；
 * 3) benchmarks/constitutional.mjs 的 Constitutional/Architecture Change 性能基准档。
 * 三者均非本套件；本套件禁裸用 "Case A-H" 词形。
 *
 * 【规范锚】纠错 §31 Case 5 原文：「parser failed / Expected: FAILED_TO_OBSERVE ≠
 * NO_MATCH ≠ PASS。」PRD §9B CRC-E：三词形互不等价，均非 PASS。
 *
 * 【联合锚设计（R2 跨面组合断言）】分立检查已有封闭测试：family-analyzer.spec.ts:155
 * （FAILED_TO_OBSERVE 恒盲区不折算 absence）、:112（parse_failures 禁 deterministic）、
 * resolver.spec.ts:106/:152（NO_MATCH 显式 + 分母披露）、resolve.spec.ts:83（「没查」
 * ≠「查了没有」）。本 CRC 补 verify 报告点名的缺口——**三态同场联合对照**（同一用例
 * 并排）：观察失败腿（FAILED_TO_OBSERVE→blindspot，绝不折算 absence）、解析零命中腿
 * （NO_MATCH=显式合法输出，分母披露在场、不冒充命中也不抛错）、非 PASS 腿
 * （parse_failures 在场 ⇒ confidence 禁 deterministic；NO_MATCH 亦非任何命中词形）。
 * 词面注记：VNext analyzer 输出无 PASS 词形，「≠ PASS」由 confidence=deterministic
 * 封禁与负观察词形闭包承担（verify 报告 Case E 缺口注记同源）。
 *
 * 独立性：纯 kernel 进程内（L1），零网络/外部工具，确定性零墙钟，Windows 可跑。
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  NEGATIVE_OBSERVATION_VALUES,
  normalizeAnalyzerReport,
  partitionBlindSpotAttempts,
  resolveNeed,
  type AnalyzerReportInput,
  type Store,
} from "@pomaster/kernel";
import { makeCrcRoot, makeCrcStore } from "./crc-lib.js";

let root: string;
let store: Store;
let catalogRoot: string;

const BASE_REPORT: AnalyzerReportInput = {
  analyzer: "ANALYZER.TS.IMPORT_GRAPH",
  scannedScope: "src/pages/**/*.vue",
  objectsResolved: 12,
  relationsResolved: 30,
  confidence: "deterministic",
  sourceSha: `sha256:${"a".repeat(64)}`,
};

beforeAll(async () => {
  root = makeCrcRoot("e");
  store = await makeCrcStore(root);
  catalogRoot = join(root, "catalog");
  mkdirSync(join(catalogRoot, "archetypes"), { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("CRC-E：FAILED_TO_OBSERVE ≠ NO_MATCH ≠ PASS——三态同场联合对照（§9B 行 E）", () => {
  it("同场对照（观察失败腿 × 解析零命中腿并排）：FAILED_TO_OBSERVE 落盲区绝不折算 absence；NO_MATCH 是显式合法输出不冒充命中也不抛错——两态互不等价", async () => {
    // —— 观察失败腿：analyzer 盲区四态映射（FAILED_TO_OBSERVE 与 SUPPORTED_NOT_FOUND
    //     同场进分母，落桶互异——观察机器坏了 ≠ 事实不存在）。
    const partition = partitionBlindSpotAttempts([
      { input: "a", prd_state: "SUPPORTED_AND_OBSERVED" },
      { input: "b", prd_state: "SUPPORTED_NOT_FOUND" },
      { input: "c", prd_state: "FAILED_TO_OBSERVE" },
      { input: "d", prd_state: "FAILED_TO_OBSERVE" },
    ]);
    expect(partition.blindspot).toBe(2);
    expect(partition.absent).toBe(1);
    expect(partition.observed).toBe(1);
    expect(partition.blindspot + partition.absent + partition.observed + partition.unsupported).toBe(
      partition.total,
    );
    expect(partition.coverage_ratio).toBeCloseTo(0.25);
    // FAILED_TO_OBSERVE 的 canonical 词形属负观察闭包，结构性不含 OBSERVED 之外的
    // 正向词形——观察失败永不折算成「看到了」或「确认不存在」。
    expect(NEGATIVE_OBSERVATION_VALUES).toContain("NOT_OBSERVABLE");

    // —— 解析零命中腿（同用例并排）：精确词形不在册 → NO_MATCH 显式输出（exit 0 语义面），
    //     matches 空、分母披露在场（真的查了），且不抛错（抛错是「没查」，不是「查了没有」）。
    const outcome = await resolveNeed(store, catalogRoot, { need: "PAGE.NOSUCH_OBJECT" });
    expect(outcome.match_class).toBe("NO_MATCH");
    expect(outcome.matches).toEqual([]);
    expect(outcome.why).toContain("NO_MATCH");
    expect(outcome.sources_examined.truth_rows).toBeGreaterThanOrEqual(0);
    expect(outcome.sources_examined.catalog_archetypes).toBe(0);
  });

  it("≠ PASS 腿：parse_failures 在场 ⇒ confidence 禁 deterministic（假绿洗白封死）——观察失败同场压制确定性宣称", () => {
    expect(() =>
      normalizeAnalyzerReport({ ...BASE_REPORT, parseFailures: ["a.vue: 解析失败"] }),
    ).toThrow("假绿洗白");
    expect(() =>
      normalizeAnalyzerReport({ ...BASE_REPORT, unresolvedConstructs: ["动态 import"] }),
    ).toThrow("假绿洗白");
    // 降级 probable 后同输入合法（§148 披露纪律）——报告仍不冒充确定性。
    const degraded = normalizeAnalyzerReport({
      ...BASE_REPORT,
      parseFailures: ["a.vue: 解析失败"],
      confidence: "probable",
    });
    expect(degraded.confidence).toBe("probable");
  });

  it("缺席 ≠ NO_MATCH：空 need（没查）→ SCHEMA_INVALID fail-closed——「没查」与「查了没有」同场判异", async () => {
    await expect(resolveNeed(store, catalogRoot, { need: "   " })).rejects.toThrow("空需求");
  });
});
