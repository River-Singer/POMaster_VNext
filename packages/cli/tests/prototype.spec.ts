// 原型转换钉测：BA 交来的 HTML 原型与 spec → 去掉表现后的大纲、事实清单、冲突提问；
// 按规范重绘后的页面（antd 与 Geist 两种完全不同的 DOM）用同一个抽取器读，事实对账为零差异；
// 重绘时漏字段、改选项、调顺序、丢提示，对账逐条报出来。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  diffFacts,
  extractPrototype,
  isDataDerivedText,
  outlineMarkdown,
  parseHtml,
  questionsOf,
  specFactsOf,
  textOf,
  type PrototypeFact,
} from "../src/prototype-extract.js";
import { runPrototypeCheck, runPrototypeIngest } from "../src/prototype.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "prototype");
const read = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const ba = extractPrototype(read("ba-customer.html"), "html:ba-customer.html");
const fact = (facts: readonly PrototypeFact[], key: string) => {
  const found = facts.find((item) => item.key === key);
  if (found === undefined) throw new Error(`没有事实 ${key}`);
  return found;
};

describe("原型转换 · HTML 解析", () => {
  it("宽容解析：未闭合的标签、省略结束标签的 li / td、实体、脚本与样式原文都不出错", () => {
    const tree = parseHtml("<div><p>甲<p>乙 &amp; 丙<ul><li>一<li>二</ul><table><tr><td>A<td>B</table><script>if (a < b) {}</script><style>.x>.y{}</style>");
    expect(textOf(tree).replace(/\s+/g, "")).toBe("甲乙&丙一二AB");
  });
});

describe("原型转换 · 去掉表现读出四层", () => {
  it("字段：必填（星号）、可选值、数值控件、说明气泡、分组、条件出现的弹窗", () => {
    expect(fact(ba.facts, "field:新增客户/客户名称").attrs).toMatchObject({ control: "text", required: true, group: "基本信息", constraints: { maxlength: "50" } });
    expect(fact(ba.facts, "field:新增客户/所属区域").attrs).toMatchObject({ control: "choice", required: true, options: ["华东", "华南", "华北"] });
    expect(fact(ba.facts, "field:新增客户/信用额度（元）").attrs).toMatchObject({ control: "number", required: false, hint: "超过 100 万需财务审批" });
    expect(fact(ba.facts, "field:新增客户/联系电话").attrs).toMatchObject({ group: "联系人", required: false });
    expect(fact(ba.facts, "region:新增客户").attrs).toMatchObject({ role: "dialog", conditional: true });
  });

  it("列表：筛选字段、标签页（带计数）、表格的冻结列与数值列、可勾选、操作、提示条、导航", () => {
    expect(fact(ba.facts, "field:客户管理/区域").attrs).toMatchObject({ control: "choice", options: ["华东", "华南", "华北"] });
    expect(fact(ba.facts, "tab:客户管理/合作中").attrs).toMatchObject({ counted: true, default: true });
    expect(fact(ba.facts, "column:客户管理/客户名称").attrs).toMatchObject({ frozen: "left", numeric: false });
    expect(fact(ba.facts, "column:客户管理/信用额度（元）").attrs).toMatchObject({ numeric: true });
    expect(fact(ba.facts, "column:客户管理/操作").attrs).toMatchObject({ frozen: "right" });
    expect(fact(ba.facts, "action:客户管理/勾选行").attrs).toMatchObject({ intent: "select" });
    expect(fact(ba.facts, "action:客户管理/新增客户").attrs).toMatchObject({ intent: "create" });
    expect(fact(ba.facts, "notice:客户管理/信用额度超过 100 万的客户需要财务审批后才能生效。").attrs).toMatchObject({ tone: "info" });
    expect(ba.facts.filter((item) => item.kind === "nav").map((item) => item.label)).toEqual(["工作台", "客户管理", "回款管理"]);
  });

  it("丢掉的表现记在账上：字体、颜色、样式框架；大纲里不出现任何色值和像素", () => {
    expect(ba.outline.dropped.fonts).toContain("Fira Sans");
    expect(ba.outline.dropped.colors).toEqual(expect.arrayContaining(["#1e40af", "#dc2626"]));
    expect(ba.outline.dropped.stylesheets.some((sheet) => sheet.includes("tailwindcss"))).toBe(true);
    const md = outlineMarkdown(ba.outline);
    const body = md.slice(0, md.indexOf("## 丢掉的表现"));
    expect(body).not.toMatch(/#[0-9a-f]{3,6}\b|\d+px|font-family/i);
    expect(md).toContain("字段：所属区域 *必填（单选下拉：华东 / 华南 / 华北）");
  });
});

describe("原型转换 · spec 与冲突", () => {
  const spec = specFactsOf(read("ba-customer.spec.md"), "spec:ba-customer.spec.md");

  it("spec 的字段表、枚举与规则句", () => {
    expect(fact(spec, "spec_field:所属区域").attrs).toMatchObject({ english: "region", required: true, enum: ["华东", "华南", "华北", "西南"] });
    expect(fact(spec, "spec_field:信用额度（元）").attrs).toMatchObject({ required: false });
    expect(spec.filter((item) => item.kind === "spec_rule").map((item) => item.label)).toEqual(
      expect.arrayContaining(["客户名称在系统内必须唯一。", "已停用的客户不得新建回款单。"]),
    );
  });

  it("冲突进提问并写明默认口径：枚举不一致、必填不一致、spec 没写的字段、超过规范的每页条数", () => {
    const questions = questionsOf(ba.facts, spec, { max_page_size: 200 });
    expect(questions.map((question) => [question.classification, question.question_zh])).toEqual([
      ["BLOCKING_AUTHORITY", "「所属区域」的可选值不一致：spec 是 华东 / 华南 / 华北 / 西南，原型是 华东 / 华南 / 华北。按哪个？"],
      ["BLOCKING_AUTHORITY", "「联系电话」spec 写的是必填，原型里没标必填。按哪个？"],
      ["PREFERENCE", "原型里有字段「区域」（客户管理），spec 的字段表里没有。保留吗？"],
      ["BLOCKING_AUTHORITY", "原型每页 500 条，超过规范的上限 200 条。按哪个？"],
    ]);
    expect(questions[0]!.default_zh).toBe("按 spec 的枚举");
    expect(questions[3]!.default_zh).toContain("每页 200 条");
  });
});

describe("原型转换 · 重绘后的事实对账", () => {
  it("按 antd 重绘（ant-design-vue 渲染出来的 DOM）：阻断差异为零", () => {
    const diff = diffFacts(ba.facts, extractPrototype(read("rebuilt-antd.html"), "html:rebuilt-antd.html").facts);
    expect(diff.ok).toBe(true);
    expect(diff.differences.filter((item) => item.blocking)).toEqual([]);
  });

  it("按 Geist 重绘（shadcn/ui 的 DOM，结构完全不同）：阻断差异同样为零", () => {
    const diff = diffFacts(ba.facts, extractPrototype(read("rebuilt-geist.html"), "html:rebuilt-geist.html").facts);
    expect(diff.ok).toBe(true);
  });

  it("重绘时漏字段、改选项、调顺序、丢提示：逐条报出", () => {
    const diff = diffFacts(ba.facts, extractPrototype(read("rebuilt-broken.html"), "html:rebuilt-broken.html").facts);
    expect(diff.ok).toBe(false);
    const blocking = diff.differences.filter((item) => item.blocking).map((item) => [item.change, item.key]);
    expect(blocking).toEqual(
      expect.arrayContaining([
        ["missing", "notice:客户管理/信用额度超过 100 万的客户需要财务审批后才能生效。"],
        ["changed", "field:新增客户/所属区域"],
        ["missing", "field:新增客户/信用额度（元）"],
        ["reordered", "field:新增客户"],
      ]),
    );
    expect(blocking).toHaveLength(4);
  });
});

describe("pomaster prototype ingest / diff", () => {
  function project(): string {
    const dir = mkdtempSync(join(tmpdir(), "pvnext-proto-"));
    mkdirSync(join(dir, "ba"), { recursive: true });
    for (const name of ["ba-customer.html", "ba-customer.spec.md", "rebuilt-antd.html", "rebuilt-broken.html"]) writeFileSync(join(dir, "ba", name), read(name));
    return dir;
  }

  it("ingest 写出大纲、事实清单、冲突与 UX 中间表示草稿；diff 对账通过 / 失败", async () => {
    const dir = project();
    try {
      const ingest = await runPrototypeIngest(dir, { html: ["ba/ba-customer.html"], spec: ["ba/ba-customer.spec.md"] });
      expect(ingest.ok).toBe(true);
      expect(ingest.result?.out_dir).toBe(".pomaster/prototype/ba-customer");
      const out = join(dir, ".pomaster", "prototype", "ba-customer");
      for (const file of ["ba-customer.outline.md", "ba-customer.outline.json", "facts.json", "questions.json", "ux-ir.json", "README.md"]) expect(existsSync(join(out, file)), file).toBe(true);
      const facts = JSON.parse(readFileSync(join(out, "facts.json"), "utf8"));
      expect(facts.schema).toBe("pomaster.prototype-facts/v1");
      expect(facts.sources.map((source: { id: string }) => source.id)).toEqual(["html:ba/ba-customer.html", "spec:ba/ba-customer.spec.md"]);
      const ir = JSON.parse(readFileSync(join(out, "ux-ir.json"), "utf8"));
      expect(ir.pages[0]).toMatchObject({ type: "list", title: "客户管理" });
      expect(ir.pages[0].regions.map((region: { pattern: string }) => region.pattern)).toEqual(expect.arrayContaining(["navigation", "data_list", "form_dialog"]));
      expect(ingest.result?.questions).toHaveLength(4);

      const pass = await runPrototypeCheck(dir, { facts: ".pomaster/prototype/ba-customer", html: ["ba/rebuilt-antd.html"] });
      expect(pass.ok).toBe(true);
      const fail = await runPrototypeCheck(dir, { facts: ".pomaster/prototype/ba-customer/facts.json", html: ["ba/rebuilt-broken.html"] });
      expect(fail.ok).toBe(false);
      expect(fail.errors.map((error) => error.code)).toEqual(expect.arrayContaining(["PROTOTYPE_FACT_MISSING", "PROTOTYPE_FACT_CHANGED", "PROTOTYPE_FACT_REORDERED"]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("输入缺失显式失败：没给 HTML、文件不存在、事实清单不存在", async () => {
    const dir = project();
    try {
      expect((await runPrototypeIngest(dir, { html: [] })).errors[0]?.code).toBe("PROTOTYPE_INPUT_MISSING");
      expect((await runPrototypeIngest(dir, { html: ["ba/none.html"] })).errors[0]?.code).toBe("PROTOTYPE_INPUT_NOT_FOUND");
      expect((await runPrototypeCheck(dir, { facts: "nowhere", html: ["ba/rebuilt-antd.html"] })).errors[0]?.code).toBe("PROTOTYPE_FACTS_NOT_FOUND");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("原型转换 · 数据派生的文字不进事实的键", () => {
  it("计数卡片、行数、日期不当区域标题或页面上下文：示例数据从 18 行变 367 行，列的键不变", () => {
    const page = (count: string) => `<html><body><main><h2>${count}</h2><section class="card"><h3>${count}</h3><p>订单总数</p></section><section aria-label="订单列表"><table><thead><tr><th>订单编号</th><th>金额</th></tr></thead></table></section></main></body></html>`;
    const keys = (count: string) => extractPrototype(page(count), "html:p.html").facts.filter((fact) => fact.kind === "column").map((fact) => fact.key);
    expect(keys("18")).toEqual(["column:订单列表/订单编号", "column:订单列表/金额"]);
    expect(keys("367")).toEqual(keys("18"));
  });

  it("isDataDerivedText：纯数字、计数、百分比、日期是；有字的标题不是", () => {
    for (const text of ["367", "1,234", "12.5%", "共 18 条", "2026-08-25", "2026年8月"]) expect(isDataDerivedText(text)).toBe(true);
    for (const text of ["订单列表", "Q3 汇总", "5.1 审核规则"]) expect(isDataDerivedText(text)).toBe(false);
  });
});
