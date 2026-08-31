/**
 * performance-budget-schema.spec.ts —— P27/B3-3 schema 承载钉住（L1；PRD §29.1
 * performance_budget 六字段入 02 信封 $definitions.PerformanceBudget）。
 *
 * 覆盖面（出口判据 1 的 schema 半边）：
 * - $definitions.PerformanceBudget 字段集 = §29.1 原文六字段逐字（禁发明字段）；
 * - 封闭性：additionalProperties:false（字段集外即 schema 违规）+ minProperties:1
 *   （空预算无判卷语义——§29.1「不同页面允许不同预算」的子集语义）；
 * - 数值约束：type:number + minimum:0（预算上限非负）；
 * - 运行时消费锚零漂移：PERFORMANCE_BUDGET_FIELDS 从 schema 定义派生（非手抄镜像
 *   ——schema 改字段集即同步），ajv 全链路正反例（合法预算过 / 发明字段拒 / 空对象
 *   拒 / 负数拒 / 非数值拒）；
 * - 词表纪律：本批零新词形入 vocab-lock 主表（六字段是 schema 字段非词表枚举值）。
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_BUDGET_FIELDS,
  allSchemas,
  performanceBudgetDefinition,
} from "@pomaster/schemas";

const ajv = new Ajv({ strictSchema: false });
addFormats(ajv);

/** 组合装载全部 schema（跨文件 $ref 绝对 $id 形态——02 信封消费的标准装载面）。 */
for (const schema of Object.values(allSchemas)) {
  ajv.addSchema(schema as unknown as Parameters<typeof ajv.compile>[0]);
}

const SECTION_29_1_FIELDS = [
  "initial_js_gzip_kb",
  "inp_ms",
  "lcp_ms",
  "long_task_ms",
  "max_chunk_kb",
  "max_memory_mb",
] as const;

describe("P27/B3-3：$definitions.PerformanceBudget schema 承载（PRD §29.1 六字段逐字）", () => {
  it("定义在场于 02 信封 $definitions；properties 字段集 = §29.1 六字段逐字（序无关集合相等）", () => {
    expect(Object.keys(performanceBudgetDefinition["properties"] as Record<string, unknown>).sort()).toEqual(
      [...SECTION_29_1_FIELDS],
    );
  });

  it("PERFORMANCE_BUDGET_FIELDS 运行时锚 = schema properties 派生（非手抄镜像，零漂移）", () => {
    expect([...PERFORMANCE_BUDGET_FIELDS]).toEqual([...SECTION_29_1_FIELDS]);
  });

  it("封闭性：additionalProperties:false + minProperties:1（禁发明字段；空预算无判卷语义）", () => {
    expect(performanceBudgetDefinition["additionalProperties"]).toBe(false);
    expect(performanceBudgetDefinition["minProperties"]).toBe(1);
  });

  it("数值约束：六字段全部 type:number + minimum:0（预算上限非负）", () => {
    const properties = performanceBudgetDefinition["properties"] as Record<
      string,
      Record<string, unknown>
    >;
    for (const field of SECTION_29_1_FIELDS) {
      expect(properties[field]?.["type"], field).toBe("number");
      expect(properties[field]?.["minimum"], field).toBe(0);
    }
  });

  it("出处锚：定义携带 x-vocab-source（PRD §29.1 + B3-3 对账来源注记）", () => {
    const source = performanceBudgetDefinition["x-vocab-source"];
    expect(typeof source).toBe("string");
    expect(source as string).toContain("PRD §29.1");
    expect(source as string).toContain("B3-3");
  });

  it("ajv 全链路（定义面独立判卷）：合法预算（子集 ≥1 字段）过校验", () => {
    // 分层注记：02 信封 payload 是自由区（additionalProperties:true，收窄归 03-*
    // kind profile——02b 蓝本「硬性条件式仅 3 条」的既定分层）；$definitions.
    // PerformanceBudget 是具名可复用定义（对象承载），本处按定义面直接判卷。
    const validate = ajv.compile(performanceBudgetDefinition as unknown as Parameters<typeof ajv.compile>[0]);
    expect(validate({ lcp_ms: 2500, inp_ms: 200 })).toBe(true);
    expect(validate({ initial_js_gzip_kb: 500 })).toBe(true);
    expect(validate({ max_chunk_kb: 800, long_task_ms: 200, max_memory_mb: 800 })).toBe(true);
  });

  it("ajv 反例（定义面独立判卷）：发明字段（bundle_kb）→ 拒（§29.1 无出处禁发明）", () => {
    const validate = ajv.compile(performanceBudgetDefinition as unknown as Parameters<typeof ajv.compile>[0]);
    expect(validate({ lcp_ms: 2500, bundle_kb: 300 })).toBe(false);
  });

  it("ajv 反例（定义面独立判卷）：空预算对象 / 负数值 / 字符串值 → 拒", () => {
    const validate = ajv.compile(performanceBudgetDefinition as unknown as Parameters<typeof ajv.compile>[0]);
    expect(validate({}), "空对象（minProperties:1）").toBe(false);
    expect(validate({ lcp_ms: -1 }), "负数（minimum:0）").toBe(false);
    expect(validate({ lcp_ms: "2500" }), "字符串值（type:number）").toBe(false);
  });
});
