/**
 * id.spec —— parseGovernedId（A5 closed-world）与 resolveAlias（A6 rename-on-ingest）正反例。
 * 对抗锚点：ADV-PFX-01/02/03、GOLDEN-AX-04、GOLDEN-L1-SCHEMA-ENFORCED。
 */
import { describe, expect, it } from "vitest";
import {
  GovernedIdParseError,
  parseGovernedId,
  resolveAlias,
} from "@pomaster/kernel";
import { normalizedKey } from "../src/id.js";

describe("parseGovernedId（closed-world 文法）", () => {
  it("PAGE.BIND_CARLINE：前缀 + 单段", () => {
    expect(parseGovernedId("PAGE.BIND_CARLINE")).toEqual({
      prefix: "PAGE",
      segments: ["BIND_CARLINE"],
      seq: null,
    });
  });

  it("API_REQ.BIND.CARLINE.1：多段 + 末段 SEQ", () => {
    expect(parseGovernedId("API_REQ.BIND.CARLINE.1")).toEqual({
      prefix: "API_REQ",
      segments: ["BIND", "CARLINE"],
      seq: 1,
    });
  });

  it("TASK.T0087：数字段收编后的合法 canonical（SEGMENT 字母开头）", () => {
    expect(parseGovernedId("TASK.T0087")).toEqual({
      prefix: "TASK",
      segments: ["T0087"],
      seq: null,
    });
  });

  it("TEST.FIXTURE.CAPABILITY.SAMPLE：fixture 专用域身份合法（Q3/ADV-PFX-01）", () => {
    expect(parseGovernedId("TEST.FIXTURE.CAPABILITY.SAMPLE").prefix).toBe("TEST");
  });

  it("DENOMINATOR.PAGE.V1_SURFACE：控制面前缀合法", () => {
    expect(parseGovernedId("DENOMINATOR.PAGE.V1_SURFACE").prefix).toBe("DENOMINATOR");
  });

  it("32 字段长为合法上界", () => {
    const segment = "A".repeat(32);
    expect(parseGovernedId(`PAGE.${segment}`).segments).toEqual([segment]);
  });

  it("33 字段长 → grammar FATAL", () => {
    const segment = "A".repeat(33);
    expect(() => parseGovernedId(`PAGE.${segment}`)).toThrow(GovernedIdParseError);
    try {
      parseGovernedId(`PAGE.${segment}`);
    } catch (error) {
      expect((error as GovernedIdParseError).reason).toBe("grammar");
    }
  });

  it("FOO.BAR_THING：未登记前缀 → unknown_prefix FATAL（A5/ADV-PFX-03）", () => {
    expect(() => parseGovernedId("FOO.BAR_THING")).toThrow(GovernedIdParseError);
    try {
      parseGovernedId("FOO.BAR_THING");
    } catch (error) {
      expect((error as GovernedIdParseError).reason).toBe("unknown_prefix");
      expect((error as GovernedIdParseError).id).toBe("FOO.BAR_THING");
    }
  });

  it("GRID.EDITABLE_GRID：GRID 仅是 alias legacy 前缀，作 canonical 解析即 FATAL", () => {
    expect(() => parseGovernedId("GRID.EDITABLE_GRID")).toThrow(GovernedIdParseError);
  });

  it("小写词形 → grammar FATAL（SCREAMING_SNAKE；注册前缀的小写书写是大小写违规而非未知前缀）", () => {
    try {
      parseGovernedId("page.bind_carline");
      expect.unreachable("must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(GovernedIdParseError);
      expect((error as GovernedIdParseError).reason).toBe("grammar");
    }
  });

  it("裸前缀无段 → grammar FATAL", () => {
    expect(() => parseGovernedId("PAGE")).toThrow(GovernedIdParseError);
    expect(() => parseGovernedId("PAGE.")).toThrow(GovernedIdParseError);
  });

  it("SEQ 后再跟段 → grammar FATAL（SEQ 仅可为末段）", () => {
    expect(() => parseGovernedId("PAGE.FOO.1.BAR")).toThrow(GovernedIdParseError);
  });

  it("数字开头段 → grammar FATAL（SEGMENT 不允许数字开头，02b 文法注记）", () => {
    expect(() => parseGovernedId("TASK.0087")).toThrow(GovernedIdParseError);
  });

  it("段内连字符 → grammar FATAL", () => {
    expect(() => parseGovernedId("PAGE.bind-carline")).toThrow(GovernedIdParseError);
  });

  it("PAGE.1：纯数字段不是合法 SEGMENT（须先有字母段）", () => {
    expect(() => parseGovernedId("PAGE.1")).toThrow(GovernedIdParseError);
  });

  it("空串 → grammar FATAL", () => {
    expect(() => parseGovernedId("")).toThrow(GovernedIdParseError);
  });

  it("错误对象携带 id 与 reason（机器可判读）", () => {
    try {
      parseGovernedId("CONTRACT.API_REQ.BIND.CARLINE.1");
      expect.unreachable("must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(GovernedIdParseError);
      expect((error as GovernedIdParseError).reason).toBe("unknown_prefix");
      expect((error as GovernedIdParseError).name).toBe("GovernedIdParseError");
    }
  });
});

describe("resolveAlias（A6 双向链）", () => {
  it("TASK-0087 → TASK.T0087（数字段加字母前缀，02b 文法注记）", () => {
    const resolution = resolveAlias("TASK-0087");
    expect(resolution.canonical).toBe("TASK.T0087");
    expect(resolution.matchedRuleLegacy).toBe("TASK-*");
    expect(resolution.legacyForms).toEqual(["TASK-0087"]);
    expect(resolution.note).toContain("TASK-0087→TASK.T0087");
  });

  it("CHANGE-0104 → CHANGE.C0104", () => {
    const resolution = resolveAlias("CHANGE-0104");
    expect(resolution.canonical).toBe("CHANGE.C0104");
    expect(resolution.matchedRuleLegacy).toBe("CHANGE-*");
  });

  it("GRID.EDITABLE_GRID → CAPABILITY.GRID.EDITABLE_GRID（GOLDEN-AX-04）", () => {
    const resolution = resolveAlias("GRID.EDITABLE_GRID");
    expect(resolution.canonical).toBe("CAPABILITY.GRID.EDITABLE_GRID");
    expect(resolution.matchedRuleLegacy).toBe("GRID.*");
    expect(resolution.legacyForms).toEqual(["GRID.EDITABLE_GRID"]);
  });

  it("PAGE-TASK-STEP-BIND-CARLINE：家族命中但 canonical=null（token 重排属数据面，kernel 不臆造；裁决#2）", () => {
    const resolution = resolveAlias("PAGE-TASK-STEP-BIND-CARLINE");
    expect(resolution.canonical).toBeNull();
    expect(resolution.matchedRuleLegacy).toBe("PAGE-TASK-STEP-*");
    expect(resolution.note).toContain("token 重排收编");
  });

  it("KB-dash 形 → KNOWLEDGE.*（KB-* 规则）", () => {
    const resolution = resolveAlias("KB-CSV_NAIVE_SPLIT");
    expect(resolution.canonical).toBe("KNOWLEDGE.CSV_NAIVE_SPLIT");
    expect(resolution.matchedRuleLegacy).toBe("KB-*");
  });

  it("KB 点分历史词形：家族命中（KB-*）但 canonical=null（段重排属数据面，kernel 不臆造）", () => {
    const resolution = resolveAlias("KB.FAILURE_PATTERN.CSV_NAIVE_SPLIT");
    expect(resolution.canonical).toBeNull();
    expect(resolution.matchedRuleLegacy).toBe("KB-*");
    expect(resolution.note).toContain("数据面");
  });

  it("canonical 输入 → 自身 + 机械逆向 legacy（考古方向；mechanical 族）", () => {
    const resolution = resolveAlias("CAPABILITY.GRID.EDITABLE_GRID");
    expect(resolution.canonical).toBe("CAPABILITY.GRID.EDITABLE_GRID");
    expect(resolution.matchedRuleLegacy).toBeNull();
    expect(resolution.legacyForms).toEqual(["GRID.EDITABLE_GRID"]);
  });

  it("PAGE.* 逆向不臆造（正向 token 重排属数据面）→ legacyForms 空", () => {
    const resolution = resolveAlias("PAGE.BIND_CARLINE");
    expect(resolution.canonical).toBe("PAGE.BIND_CARLINE");
    expect(resolution.legacyForms).toEqual([]);
  });

  it("canonical TASK.T0087 逆向 → TASK-0087（T 前缀剥离）", () => {
    expect(resolveAlias("TASK.T0087").legacyForms).toEqual(["TASK-0087"]);
  });

  it("canonical CHANGE.C0104 逆向 → CHANGE-0104", () => {
    expect(resolveAlias("CHANGE.C0104").legacyForms).toEqual(["CHANGE-0104"]);
  });

  it("canonical KNOWLEDGE.X 逆向 → KB-X", () => {
    expect(resolveAlias("KNOWLEDGE.CSV_NAIVE_SPLIT").legacyForms).toEqual([
      "KB-CSV-NAIVE-SPLIT",
    ]);
  });

  it("非 canonical 非 legacy 词形 → canonical=null（显式无法收编）", () => {
    const resolution = resolveAlias("totally-bogus");
    expect(resolution.canonical).toBeNull();
    expect(resolution.matchedRuleLegacy).toBeNull();
    expect(resolution.note).not.toBeNull();
  });

  it("空串 → canonical=null", () => {
    expect(resolveAlias("").canonical).toBeNull();
  });

  it("PAGE-APP-DASHBOARD 不在 aliases_v0 五族 → 无法机械收编（历史形态归数据层）", () => {
    const resolution = resolveAlias("PAGE-APP-DASHBOARD");
    expect(resolution.canonical).toBeNull();
    expect(resolution.matchedRuleLegacy).toBeNull();
  });

  it("收编结果过 parseGovernedId（主链路组合律；mechanical=true 族）", () => {
    for (const legacy of ["TASK-0087", "CHANGE-0104", "GRID.EDITABLE_GRID"]) {
      const canonical = resolveAlias(legacy).canonical;
      expect(canonical).not.toBeNull();
      expect(() => parseGovernedId(canonical as string)).not.toThrow();
    }
  });

  it("normalizedKey：NFKC→大写→连续 [-_.\\s] 折叠为 '.'（KB_ALIAS_003 查重键）", () => {
    expect(normalizedKey("PAGE.bind_carline")).toBe("PAGE.BIND.CARLINE");
    expect(normalizedKey("PAGE--BIND__CARLINE")).toBe("PAGE.BIND.CARLINE");
    expect(normalizedKey("PAGE.BIND_CARLINE")).toBe("PAGE.BIND.CARLINE");
  });

  it("resolveAlias 是纯函数：同输入两次结果深度相等", () => {
    expect(resolveAlias("TASK-0087")).toEqual(resolveAlias("TASK-0087"));
  });
});
