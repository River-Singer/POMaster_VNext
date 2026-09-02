/**
 * denominator-schema.spec.ts —— 05-denominator schema 资产封条正反例
 * （ajv draft-07；discovery/knowledge/equivalence-schema.spec 先例）。
 *
 * 当前聚焦 C4 修复回归：keybinding_table_ref 与 04-keybinding keybinding_id 同文法——
 * 第二段必需（KEYBINDING.PAGE 一段式曾因复制丢必需段锚漏过 pattern，与 208 行
 * description「至少 DOMAIN.NAME 两段」自相矛盾；修复后 description/examples 与
 * pattern 三者一致）。
 */
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { denominatorSchema } from "@pomaster/schemas";

const ajv = new Ajv({ strictSchema: false, allErrors: true });
// compile(root) 已按 $id 隐式注册——后续 $ref 子模式直接解析到同一份文档
// （decision-graph.spec 同款装载形态）。
ajv.compile(denominatorSchema as object);
const DENOMINATOR_ID = "https://pomaster.dev/schemas/denominator/v1-draft.json";
const validateTableRef = ajv.compile({
  $ref: `${DENOMINATOR_ID}#/definitions/keybinding_table_ref`,
});

describe("05-denominator keybinding_table_ref（C4：第二段必需）", () => {
  it("KEYBINDING.PAGE（一段式，曾漏过）→ invalid；KEYBINDING.PAGE.V1 → valid；三/四段合法", () => {
    expect(validateTableRef("KEYBINDING.PAGE")).toBe(false);
    expect(validateTableRef("KEYBINDING.PAGE.V1")).toBe(true);
    expect(validateTableRef("KEYBINDING.PAGE.V1.EXTRA")).toBe(true);
  });

  it("词形纪律不放松：小写/空段/前缀漂移仍拒绝（05 与 04 keybinding_id 同串）", () => {
    expect(validateTableRef("KEYBINDING.page.V1")).toBe(false);
    expect(validateTableRef("KEYBINDING.PAGE.")).toBe(false);
    expect(validateTableRef("BINDING.PAGE.V1")).toBe(false);
    expect(validateTableRef("KEYBINDING.PAGE.V1.extra")).toBe(false);
    expect(validateTableRef("KEYBINDING.PAGE..V1")).toBe(false);
  });
});
