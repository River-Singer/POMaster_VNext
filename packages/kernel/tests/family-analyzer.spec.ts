/**
 * family.spec.ts / analyzer-contract.spec.ts 合并 —— P-v06 批次 0 Model Constitution。
 *
 * family（PRD v0.6 §6.1 + §1.2 Derived Facts + §163 Phase A/C）：
 * - family=派生视图：PREFIX_FAMILY_MAP 对 16 前缀全总（装载期自检已封死漏前缀；
 *   PR-0008 增补 SPEC.→EVIDENCE 同批映射）；
 * - 五族显式缺席（RUNTIME/RESOURCE/RELIABILITY/SECURITY/DELIVERY）——禁猜测派生；
 * - 零信封改动：family 不入 01/02（01 additionalProperties:false 封条不动）。
 *
 * analyzer-contract（PRD v0.6 §148-149）：
 * - §148 八字段必答（「只返回成功项」结构性写不出合法报告）；
 * - 确定性宣称杀手：parse_failures/unresolved 非空 ⇒ 禁 deterministic；
 * - §149 四态映射零新词：canonical ⊆ OBSERVED ∪ NEGATIVE_OBSERVATION_VALUES；
 *   FAILED_TO_OBSERVE 恒盲区位绝不折算 absence（分母封闭三查）。
 */
import { describe, expect, it } from "vitest";
import { GOVERNED_ID_PREFIXES } from "@pomaster/schemas";
import {
  deriveFamily,
  familyOfId,
  FAMILIES_WITHOUT_PREFIX,
  normalizeAnalyzerReport,
  OBJECT_FAMILY_VALUES,
  partitionBlindSpotAttempts,
  PREFIX_FAMILY_MAP,
  PRD_BLINDSPOT_STATE_MAPPING,
  PRD_BLINDSPOT_STATES,
  NEGATIVE_OBSERVATION_VALUES,
  GovernedIdParseError,
  type AnalyzerReportInput,
  type GovernedIdPrefix,
} from "@pomaster/kernel";

describe("family 派生视图（Derived Facts Must Be Derived）", () => {
  it("PREFIX_FAMILY_MAP 对 16 前缀全总（装载期自检同源；PR-0008 SPEC.→EVIDENCE 同批映射）", () => {
    for (const prefix of GOVERNED_ID_PREFIXES) {
      expect(PREFIX_FAMILY_MAP[prefix], `漏前缀 ${prefix}`).toBeDefined();
      expect(OBJECT_FAMILY_VALUES).toContain(PREFIX_FAMILY_MAP[prefix]);
    }
  });

  it("familyOfId：既有词族派生（PAGE/COMPONENT→UI、CAPABILITY→PRODUCT、API_REQ/ERR→INTERFACE、FIELD→DATA、TEST/SPEC→EVIDENCE）", () => {
    expect(familyOfId("PAGE.SUPPLIER_MANAGEMENT")).toBe("UI");
    expect(familyOfId("COMPONENT.SEARCH_INPUT")).toBe("UI");
    expect(familyOfId("CAPABILITY.GRID.EDITABLE_GRID")).toBe("PRODUCT");
    expect(familyOfId("API_REQ.SUPPLIER.LIST.1")).toBe("INTERFACE");
    expect(familyOfId("ERR.PERMISSION.FORBIDDEN")).toBe("INTERFACE");
    expect(familyOfId("FIELD.SUPPLIER.NAME")).toBe("DATA");
    expect(familyOfId("TEST.FIXTURE.SUPPLIER")).toBe("EVIDENCE");
    expect(familyOfId("SPEC.CALC_EXPORT_EVIDENCE.1")).toBe("EVIDENCE");
    expect(familyOfId("POLICY.WEB.API.SINGLE_HTTP_CLIENT")).toBe("GOVERNANCE");
  });

  it("deriveFamily：非法前缀 FATAL（A5 closed-world 同契约，不猜测 family）", () => {
    expect(() => familyOfId("ARCHETYPE.MASTER_DATA")).toThrow(GovernedIdParseError);
    expect(() => deriveFamily("TABLE" as GovernedIdPrefix)).toThrowError(/漏前缀/);
  });

  it("五族显式缺席（RUNTIME/RESOURCE/RELIABILITY/SECURITY/DELIVERY——§163 Phase C 逐批落）", () => {
    expect(FAMILIES_WITHOUT_PREFIX).toEqual([
      "RUNTIME",
      "RESOURCE",
      "RELIABILITY",
      "SECURITY",
      "DELIVERY",
    ]);
  });

  it("映射值域 ⊆ OBJECT_FAMILY_VALUES 十二族（PRD §6.1 逐字闭包）", () => {
    expect(OBJECT_FAMILY_VALUES).toHaveLength(12);
    expect(new Set(Object.values(PREFIX_FAMILY_MAP)).size).toBeLessThanOrEqual(12);
  });
});

// ============================================================
// analyzer-contract（§148-149）
// ============================================================

const BASE_REPORT: AnalyzerReportInput = {
  analyzer: "ANALYZER.TS.IMPORT_GRAPH",
  scannedScope: "src/pages/**/*.vue",
  objectsResolved: 12,
  relationsResolved: 30,
  confidence: "deterministic",
  sourceSha: `sha256:${"a".repeat(64)}`,
};

describe("normalizeAnalyzerReport（§148 八字段必答 + 反假绿不变式）", () => {
  it("全字段合法报告 → 归一冻结形态（零写 IO——analyze-only 封条）", () => {
    const report = normalizeAnalyzerReport(BASE_REPORT);
    expect(report.analyzer).toBe("ANALYZER.TS.IMPORT_GRAPH");
    expect(report.scanned_scope).toBe("src/pages/**/*.vue");
    expect(report.confidence).toBe("deterministic");
    expect(report.unsupported_constructs).toEqual([]);
  });

  it("缺席任一必答位 → SCHEMA_INVALID（「只返回成功项」结构性写不出合法报告）", () => {
    expect(() =>
      normalizeAnalyzerReport({ ...BASE_REPORT, scannedScope: " " }),
    ).toThrow("scannedScope");
    expect(() =>
      normalizeAnalyzerReport({ ...BASE_REPORT, objectsResolved: -1 }),
    ).toThrow("非负整数");
    expect(() =>
      normalizeAnalyzerReport({ ...BASE_REPORT, sourceSha: "abc123" }),
    ).toThrow("sha256");
    expect(() =>
      normalizeAnalyzerReport({ ...BASE_REPORT, analyzer: "import-graph 扫描器" }),
    ).toThrow("ANALYZER.");
  });

  it("确定性宣称杀手：parse_failures/unresolved 非空 ⇒ 禁 deterministic（假绿洗白封死）", () => {
    expect(() =>
      normalizeAnalyzerReport({ ...BASE_REPORT, parseFailures: ["a.vue: 解析失败"] }),
    ).toThrow("假绿洗白");
    expect(() =>
      normalizeAnalyzerReport({ ...BASE_REPORT, unresolvedConstructs: ["动态 import"] }),
    ).toThrow("假绿洗白");
    // 降级 probable 后同输入合法（§148 披露纪律）。
    const degraded = normalizeAnalyzerReport({
      ...BASE_REPORT,
      parseFailures: ["a.vue: 解析失败"],
      confidence: "probable",
    });
    expect(degraded.confidence).toBe("probable");
    // unsupported_constructs 是声明面缺席（§149 UNSUPPORTED 侧）——不禁 deterministic。
    expect(() =>
      normalizeAnalyzerReport({
        ...BASE_REPORT,
        unsupportedConstructs: ["vue:directive 动态注册"],
      }),
    ).not.toThrow();
  });

  it("词表外 confidence 显式拒绝（relation_confidence 三值闭包复用——零二次造词）", () => {
    expect(() => normalizeAnalyzerReport({ ...BASE_REPORT, confidence: "high" })).toThrow(
      "词表外",
    );
  });
});

describe("盲区四态映射（§149；零新词——canonical ⊆ OBSERVED ∪ NEGATIVE_OBSERVATION_VALUES）", () => {
  it("四态 canonical 全部落在既有 perception 词面（不发明词值）", () => {
    for (const state of PRD_BLINDSPOT_STATES) {
      for (const canonical of PRD_BLINDSPOT_STATE_MAPPING[state]) {
        if (canonical === "OBSERVED") continue;
        expect(
          NEGATIVE_OBSERVATION_VALUES,
          `${state}→${canonical} 不在既有负观察词表`,
        ).toContain(canonical);
      }
    }
  });

  it("FAILED_TO_OBSERVE 恒盲区位——分母封闭下绝不折算 absence（§149 逐字禁令）", () => {
    const partition = partitionBlindSpotAttempts([
      { input: "a", prd_state: "SUPPORTED_AND_OBSERVED" },
      { input: "b", prd_state: "SUPPORTED_NOT_FOUND" },
      { input: "c", prd_state: "UNSUPPORTED" },
      { input: "d", prd_state: "FAILED_TO_OBSERVE" },
      { input: "e", prd_state: "FAILED_TO_OBSERVE" },
    ]);
    expect(partition.total).toBe(5);
    expect(partition.observed).toBe(1);
    expect(partition.absent).toBe(1);
    expect(partition.unsupported).toBe(1);
    expect(partition.blindspot).toBe(2);
    expect(partition.observed + partition.absent + partition.unsupported + partition.blindspot).toBe(
      partition.total,
    );
    expect(partition.unchecked_in_blindspot_estimated).toBe(2);
    expect(partition.coverage_ratio).toBeCloseTo(0.2);
    expect(partition.zero_denominator).toBe(false);
  });

  it("零分母 → 禁当满分（zero_denominator=true + coverage 0）", () => {
    const partition = partitionBlindSpotAttempts([]);
    expect(partition.zero_denominator).toBe(true);
    expect(partition.coverage_ratio).toBe(0);
  });

  it("词表外四态词形 → SCHEMA_INVALID（禁静默归桶）", () => {
    expect(() =>
      partitionBlindSpotAttempts([{ input: "x", prd_state: "OBSERVED_PROBABLY" }]),
    ).toThrow("词形非法");
  });
});
