/**
 * prototype.ts —— `pomaster prototype ingest / diff`：BA 交来的 spec + HTML 原型 → 业务事实与信息结构 →
 * （agent 按设计规范重绘）→ 事实对账。抽取逻辑在 prototype-extract.ts（纯函数，Storybook 实验共用）。
 *
 * ingest 产物（缺省写到 .pomaster/prototype/<名字>/，--out 可改）：
 *   - <页面>.outline.md / .outline.json：去掉表现后的大纲（人和 agent 都读 md）
 *   - facts.json：事实清单（pomaster.prototype-facts/v1），每条带出处
 *   - questions.json：spec 与原型、原型与规范之间的冲突（Question Gate 申报分类 + 默认口径）
 *   - ux-ir.json：UX 中间表示草稿（pomaster.ux-ir/v1）：页面类型、区域 → 规范模式与规则编号的初步映射
 *   - README.md：接下来怎么做
 * diff：同一个抽取器读重绘后的页面，与 facts.json 逐条对账；有阻断差异时 ok=false（exit 1）。
 *
 * --render：用 Playwright（如已安装）渲染后再读，拿到脚本生成的表格行、导航与弹窗内容；默认断网渲染，
 * 常见 CDN 全局（tailwind / lucide / feather）打桩，避免离线时初始化脚本中断。没装 Playwright 时如实报出，
 * 静态读取照常可用（也可以把浏览器里「另存为」的渲染后 HTML 交给 ingest）。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { loadDesignStandard } from "./design.js";
import {
  diffFacts,
  extractPrototype,
  outlineMarkdown,
  questionsOf,
  specFactsOf,
  type FactDiff,
  type OutlineNode,
  type OutlineRegion,
  type PrototypeFact,
  type PrototypeOutline,
  type PrototypeQuestion,
} from "./prototype-extract.js";

export const PROTOTYPE_FACTS_SCHEMA = "pomaster.prototype-facts/v1";
export const UX_IR_SCHEMA = "pomaster.ux-ir/v1";
export const PROTOTYPE_DIR = "prototype";

export interface PrototypeSource {
  readonly id: string;
  readonly kind: "html" | "spec";
  readonly path: string;
  readonly sha256: string;
  readonly rendered: boolean;
}

export interface PrototypeFactsFile {
  readonly schema: typeof PROTOTYPE_FACTS_SCHEMA;
  readonly sources: readonly PrototypeSource[];
  readonly facts: readonly PrototypeFact[];
  readonly dropped: Readonly<Record<string, PrototypeOutline["dropped"]>>;
}

export interface UxIrRegion {
  readonly key: string;
  readonly title: string | null;
  readonly role: string;
  readonly conditional: boolean;
  /** 规范里的模式（agent 复核后可改）。 */
  readonly pattern: string;
  /** 映射依据的规范规则编号。 */
  readonly rule_refs: readonly string[];
  readonly facts: readonly string[];
}

export interface UxIrPage {
  readonly key: string;
  readonly title: string | null;
  readonly source: string;
  readonly type: "list" | "master-detail" | "form" | "detail" | "dashboard" | "login" | "unknown";
  readonly regions: readonly UxIrRegion[];
}

export interface UxIr {
  readonly schema: typeof UX_IR_SCHEMA;
  readonly status: "draft";
  readonly design_system: string | null;
  readonly pages: readonly UxIrPage[];
  readonly questions: readonly string[];
  readonly notes_zh: readonly string[];
}

export interface PrototypeIngestInput {
  readonly html: readonly string[];
  readonly spec?: readonly string[];
  readonly name?: string;
  readonly out?: string;
  readonly render?: boolean;
  readonly allowNetwork?: boolean;
}

export interface PrototypeIngestResult {
  readonly out_dir: string;
  readonly pages: ReadonlyArray<{ readonly source: string; readonly title: string | null; readonly facts: number; readonly rendered: boolean }>;
  readonly facts: number;
  readonly spec_facts: number;
  readonly questions: readonly PrototypeQuestion[];
  readonly files: readonly string[];
}

function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function slug(text: string): string {
  return text.replace(/\.[a-z]+$/i, "").replace(/[^\w一-龥-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "prototype";
}

const CDN_STUBS = `
(() => {
  const noop = () => {};
  if (!("tailwind" in window)) window.tailwind = { config: {} };
  if (!("lucide" in window)) window.lucide = { createIcons: noop, icons: {} };
  if (!("feather" in window)) window.feather = { replace: noop };
})();
`;

/** 浏览器里的元素（CLI 的 tsconfig 不带 DOM 类型，这里只声明用到的几个成员）。 */
interface DomElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  readonly textContent: string | null;
}

/** 用 Playwright 渲染后取 DOM（没装就返回 null 与原因）。 */
async function renderHtml(file: string, allowNetwork: boolean): Promise<{ html: string | null; reason: string | null; errors: string[] }> {
  type PlaywrightModule = { chromium: { launch: () => Promise<unknown> } };
  let playwright: PlaywrightModule | null = null;
  for (const name of ["playwright", "playwright-core"]) {
    try {
      playwright = (await import(name)) as PlaywrightModule;
      break;
    } catch {
      // 继续试下一个
    }
  }
  if (playwright === null) return { html: null, reason: "没有找到 playwright（npm i -D playwright 后再用 --render，或把浏览器里渲染后的 HTML 另存后交给 ingest）", errors: [] };
  type Page = {
    on: (event: string, handler: (error: Error) => void) => void;
    route: (pattern: RegExp, handler: (route: { abort: () => Promise<void> }) => Promise<void>) => Promise<void>;
    addInitScript: (script: string) => Promise<void>;
    goto: (url: string, options: Record<string, unknown>) => Promise<unknown>;
    waitForTimeout: (ms: number) => Promise<void>;
    content: () => Promise<string>;
    $$: (selector: string) => Promise<unknown[]>;
    $$eval: (selector: string, fn: (nodes: DomElement[]) => unknown) => Promise<unknown>;
    keyboard: { press: (key: string) => Promise<void> };
  };
  type Browser = { newPage: () => Promise<Page>; close: () => Promise<void> };
  const browser = (await playwright.chromium.launch()) as Browser;
  const errors: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    if (!allowNetwork) await page.route(/^https?:\/\//, (route) => route.abort());
    await page.addInitScript(CDN_STUBS);
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    await page.waitForTimeout(500);
    // 组件库的下拉收起时 DOM 里没有选项：逐个展开，把看到的选项记到 data-pomaster-options 上再收起
    const comboboxes = (await page.$$('[role="combobox"]')) as ReadonlyArray<{ click: () => Promise<void>; evaluate: (fn: (el: DomElement, options: string[]) => void, arg: string[]) => Promise<void> }>;
    for (const combobox of comboboxes) {
      try {
        await combobox.click();
        await page.waitForTimeout(150);
        const options = (await page.$$eval('[role="option"]', (nodes: DomElement[]) => nodes.map((node) => (node.getAttribute("label") ?? node.textContent ?? "").trim()).filter(Boolean))) as string[];
        await combobox.evaluate((el, values) => el.setAttribute("data-pomaster-options", JSON.stringify(values)), options);
        await page.keyboard.press("Escape");
      } catch {
        // 展开不了的下拉保持原样
      }
    }
    return { html: await page.content(), reason: null, errors };
  } finally {
    await browser.close();
  }
}

const PATTERN_RULES: Readonly<Record<string, readonly string[]>> = {
  data_list: ["LIST.FORM", "LIST.PAGING", "DGRID.COLUMNS", "DGRID.SORT_FILTER"],
  filter_bar: ["LIST.QUERY", "STATE.URL"],
  form_dialog: ["LIST.CREATE", "STATE.FORM_MODEL", "CLICK.LOCK"],
  form: ["STATE.FORM_MODEL", "CLICK.LOCK"],
  tabs: ["STATE.URL"],
  alert: ["FEEDBACK.CHOOSE"],
  navigation: ["SIDEBAR.ACTIVE", "SIDEBAR.DEPTH"],
  section: [],
  login: ["SESSION.STORAGE", "GUARD.LOGIN_REDIRECT"],
};

function regionPattern(region: OutlineRegion): string {
  const kinds = new Set(region.children.map((node) => node.kind));
  const has = (kind: OutlineNode["kind"]) => kinds.has(kind) || region.children.some((node) => node.kind === "region" && node.children.some((child) => child.kind === kind));
  if (region.role === "nav" || region.role === "aside") return "navigation";
  if (region.children.some((node) => node.kind === "field" && node.control === "password")) return "login";
  if (region.role === "dialog" && has("field")) return "form_dialog";
  if (has("table")) return "data_list";
  if (has("tabs")) return "tabs";
  if (has("field")) return region.children.some((node) => node.kind === "action" && /查询|搜索|筛选/.test(node.label)) ? "filter_bar" : "form";
  if (has("notice")) return "alert";
  return "section";
}

function pageType(outline: PrototypeOutline): UxIrPage["type"] {
  const all: OutlineNode[] = [];
  const walk = (nodes: readonly OutlineNode[]) => {
    for (const node of nodes) {
      all.push(node);
      if (node.kind === "region") walk(node.children);
    }
  };
  walk(outline.root.children);
  const tables = all.filter((node) => node.kind === "table").length;
  if (all.some((node) => node.kind === "field" && node.control === "password") && tables === 0) return "login";
  if (tables >= 2) return "master-detail";
  if (tables === 1) return "list";
  if (all.some((node) => node.kind === "field")) return "form";
  return "unknown";
}

function uxIrPage(outline: PrototypeOutline, facts: readonly PrototypeFact[], source: string): UxIrPage {
  const regions: UxIrRegion[] = [];
  let seq = 0;
  const visit = (nodes: readonly OutlineNode[], context: readonly string[]) => {
    for (const node of nodes) {
      if (node.kind !== "region") continue;
      seq += 1;
      const pattern = regionPattern(node);
      const title = node.title;
      const next = title === null ? context : [...context, title];
      const factKeys = facts.filter((fact) => fact.path.startsWith(node.path) && fact.kind !== "copy").map((fact) => fact.key);
      regions.push({ key: `R${seq}`, title, role: node.role, conditional: node.hidden, pattern, rule_refs: PATTERN_RULES[pattern] ?? [], facts: [...new Set(factKeys)] });
      visit(node.children, next);
    }
  };
  visit(outline.root.children, []);
  return { key: slug(basename(source)), title: outline.title, source, type: pageType(outline), regions };
}

function readmeText(result: { readonly out: string; readonly questions: readonly PrototypeQuestion[]; readonly pages: readonly string[] }): string {
  return [
    "# 原型转换工作区",
    "",
    "由 `pomaster prototype ingest` 生成。规则见设计规范「工程规范 / 原型转换」（`pomaster design show --area prototype_intake`）。",
    "",
    "## 接下来",
    "",
    "1. 读 `*.outline.md`：去掉表现后的页面大纲；`facts.json` 是要原样保留的事实清单（字段、操作、列、状态、提示）。",
    `2. 处理 \`questions.json\` 里的 ${result.questions.length} 个冲突（交给 Question Gate；裁决前按每条的默认口径）。`,
    "3. 复核 `ux-ir.json`：页面类型与区域到规范模式的映射，补上 rule_refs 依据。",
    "4. 按设计规范重绘（布局、间距、字号、组件全部取规范；原型的 class、样式、字体、颜色不进实现）。",
    "5. 对账：`pomaster prototype diff <本目录>/facts.json <重绘后的页面.html> [--render]`，缺失 / 改动 / 新增都为零才算完成，结果作为 verify 证据。",
    "",
    "## 页面",
    "",
    ...result.pages.map((page) => `- ${page}`),
    "",
  ].join("\n");
}

export async function runPrototypeIngest(dir: string, input: PrototypeIngestInput): Promise<CommandOutcome<PrototypeIngestResult | null>> {
  const warnings: CliWarning[] = [];
  if (input.html.length === 0) {
    return failOutcome("prototype ingest", null, [{ code: "PROTOTYPE_INPUT_MISSING", message: "没有给 HTML 原型", hint: "pomaster prototype ingest <page.html...> [--spec <spec.md...>]" }], ["没有给 HTML 原型"]);
  }
  const missing = [...input.html, ...(input.spec ?? [])].filter((file) => !existsSync(resolve(dir, file)));
  if (missing.length > 0) {
    return failOutcome("prototype ingest", null, missing.map((file) => ({ code: "PROTOTYPE_INPUT_NOT_FOUND", message: `找不到文件 ${file}`, hint: "路径相对于项目根目录（--dir）" })), missing.map((file) => `找不到文件 ${file}`));
  }
  const name = input.name ?? slug(basename(input.html[0] ?? "prototype"));
  const outDir = resolve(dir, input.out ?? join(".pomaster", PROTOTYPE_DIR, name));
  mkdirSync(outDir, { recursive: true });
  const sources: PrototypeSource[] = [];
  const allFacts: PrototypeFact[] = [];
  const dropped: Record<string, PrototypeOutline["dropped"]> = {};
  const pages: Array<{ source: string; title: string | null; facts: number; rendered: boolean }> = [];
  const irPages: UxIrPage[] = [];
  const files: string[] = [];
  for (const file of input.html) {
    const absolute = resolve(dir, file);
    const raw = readFileSync(absolute, "utf8");
    let html = raw;
    let rendered = false;
    if (input.render === true) {
      const outcome = await renderHtml(absolute, input.allowNetwork === true);
      if (outcome.html === null) warnings.push({ code: "PROTOTYPE_RENDER_UNAVAILABLE", message: outcome.reason ?? "渲染不可用", hint: "已按静态 HTML 读取；脚本生成的内容（表格行、导航）不在结果里" });
      else {
        html = outcome.html;
        rendered = true;
        if (outcome.errors.length > 0) warnings.push({ code: "PROTOTYPE_RENDER_SCRIPT_ERROR", message: `${file} 渲染时脚本报错：${outcome.errors.slice(0, 3).join("；")}`, hint: "离线渲染时 CDN 脚本加载不到属正常；结构缺失时加 --allow-network 重试" });
      }
    }
    const id = `html:${relative(dir, absolute).replace(/\\/g, "/")}`;
    const { outline, facts } = extractPrototype(html, id);
    sources.push({ id, kind: "html", path: relative(dir, absolute).replace(/\\/g, "/"), sha256: sha256(raw), rendered });
    allFacts.push(...facts);
    dropped[id] = outline.dropped;
    pages.push({ source: id, title: outline.title, facts: facts.length, rendered });
    irPages.push(uxIrPage(outline, facts, id));
    const base = slug(basename(file));
    writeFileSync(join(outDir, `${base}.outline.md`), outlineMarkdown(outline), "utf8");
    writeFileSync(join(outDir, `${base}.outline.json`), `${JSON.stringify(outline, null, 2)}\n`, "utf8");
    files.push(`${base}.outline.md`, `${base}.outline.json`);
  }
  const specFacts: PrototypeFact[] = [];
  for (const file of input.spec ?? []) {
    const absolute = resolve(dir, file);
    const text = readFileSync(absolute, "utf8");
    const id = `spec:${relative(dir, absolute).replace(/\\/g, "/")}`;
    sources.push({ id, kind: "spec", path: relative(dir, absolute).replace(/\\/g, "/"), sha256: sha256(text), rendered: false });
    specFacts.push(...specFactsOf(text, id));
  }
  const standard = loadDesignStandard(dir, {});
  const pageSizeRule = standard.normalized?.areas.flatMap((area) => area.rules).find((rule) => rule.id === "PERF.LARGE_LISTS");
  const maxPageSize = pageSizeRule?.params.find((param) => param.key === "admin_max_page_size")?.value;
  const questions = questionsOf(allFacts, specFacts, typeof maxPageSize === "number" ? { max_page_size: maxPageSize } : { max_page_size: 200 });
  const factsFile: PrototypeFactsFile = { schema: PROTOTYPE_FACTS_SCHEMA, sources, facts: [...allFacts, ...specFacts], dropped };
  const ir: UxIr = {
    schema: UX_IR_SCHEMA,
    status: "draft",
    design_system: standard.normalized?.meta.design_system ?? null,
    pages: irPages,
    questions: questions.map((question) => question.id),
    notes_zh: ["pattern 与 rule_refs 是按结构推出的初步映射，agent 按设计规范复核后再重绘", "facts 里列的事实在重绘后必须一条不少（pomaster prototype diff 对账）"],
  };
  writeFileSync(join(outDir, "facts.json"), `${JSON.stringify(factsFile, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "questions.json"), `${JSON.stringify({ schema: "pomaster.prototype-questions/v1", questions }, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "ux-ir.json"), `${JSON.stringify(ir, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "README.md"), readmeText({ out: outDir, questions, pages: pages.map((page) => `${page.title ?? page.source}（${page.facts} 条事实${page.rendered ? "，已渲染" : ""}）`) }), "utf8");
  files.push("facts.json", "questions.json", "ux-ir.json", "README.md");
  const result: PrototypeIngestResult = { out_dir: relative(dir, outDir).replace(/\\/g, "/") || ".", pages, facts: allFacts.length, spec_facts: specFacts.length, questions, files };
  const human = [
    `原型已抽取到 ${result.out_dir}：${pages.length} 个页面、${allFacts.length} 条原型事实、${specFacts.length} 条 spec 事实、${questions.length} 个待裁决的冲突`,
    ...pages.map((page) => `  - ${page.title ?? page.source}：${page.facts} 条事实${page.rendered ? "（已渲染）" : ""}`),
    ...questions.slice(0, 10).map((question) => `  [${question.classification}] ${question.question_zh}（默认：${question.default_zh}）`),
    "下一步：读 *.outline.md 与 facts.json，按设计规范重绘，再用 pomaster prototype diff 对账",
  ];
  return okOutcome("prototype ingest", result, human, warnings);
}

export interface PrototypeDiffInput {
  readonly facts: string;
  readonly html: readonly string[];
  readonly render?: boolean;
  readonly allowNetwork?: boolean;
}

export interface PrototypeDiffResult extends FactDiff {
  readonly facts_file: string;
  readonly against: readonly string[];
}

export async function runPrototypeDiff(dir: string, input: PrototypeDiffInput): Promise<CommandOutcome<PrototypeDiffResult | null>> {
  const factsPath = resolve(dir, input.facts.endsWith(".json") ? input.facts : join(input.facts, "facts.json"));
  if (!existsSync(factsPath)) {
    return failOutcome("prototype diff", null, [{ code: "PROTOTYPE_FACTS_NOT_FOUND", message: `找不到事实清单 ${input.facts}`, hint: "先跑 pomaster prototype ingest 生成 facts.json" }], [`找不到事实清单 ${input.facts}`]);
  }
  let file: PrototypeFactsFile;
  try {
    file = JSON.parse(readFileSync(factsPath, "utf8")) as PrototypeFactsFile;
  } catch (error) {
    return failOutcome("prototype diff", null, [{ code: "PROTOTYPE_FACTS_UNREADABLE", message: `facts.json 读不出来：${(error as Error).message}`, hint: "重新跑 pomaster prototype ingest" }], ["facts.json 读不出来"]);
  }
  if (file.schema !== PROTOTYPE_FACTS_SCHEMA) {
    return failOutcome("prototype diff", null, [{ code: "PROTOTYPE_FACTS_SCHEMA", message: `facts.json 的 schema 不是 ${PROTOTYPE_FACTS_SCHEMA}`, hint: "用当前版本的 pomaster prototype ingest 重新生成" }], ["facts.json 版本不对"]);
  }
  const warnings: CliWarning[] = [];
  const actual: PrototypeFact[] = [];
  for (const page of input.html) {
    const absolute = resolve(dir, page);
    if (!existsSync(absolute)) {
      return failOutcome("prototype diff", null, [{ code: "PROTOTYPE_INPUT_NOT_FOUND", message: `找不到文件 ${page}`, hint: "给出重绘后页面的 HTML（Storybook 或浏览器里另存的渲染结果），或加 --render 读源页面" }], [`找不到文件 ${page}`]);
    }
    let html = readFileSync(absolute, "utf8");
    if (input.render === true) {
      const outcome = await renderHtml(absolute, input.allowNetwork === true);
      if (outcome.html === null) warnings.push({ code: "PROTOTYPE_RENDER_UNAVAILABLE", message: outcome.reason ?? "渲染不可用", hint: "按静态 HTML 对账" });
      else html = outcome.html;
    }
    actual.push(...extractPrototype(html, `html:${relative(dir, absolute).replace(/\\/g, "/")}`).facts);
  }
  const expected = file.facts.filter((fact) => !fact.kind.startsWith("spec_"));
  const diff = diffFacts(expected, actual);
  const result: PrototypeDiffResult = { ...diff, facts_file: relative(dir, factsPath).replace(/\\/g, "/"), against: input.html };
  const blocking = diff.differences.filter((item) => item.blocking);
  const human = [
    diff.ok ? `事实对账通过：比较了 ${diff.compared} 条，阻断差异 0 条（提示 ${diff.differences.length} 条）` : `事实对账未通过：${blocking.length} 条阻断差异`,
    ...diff.differences.slice(0, 40).map((item) => `  ${item.blocking ? "✗" : "·"} ${item.detail_zh}`),
  ];
  if (!diff.ok) {
    const errors: CliError[] = blocking.slice(0, 20).map((item) => ({ code: `PROTOTYPE_FACT_${item.change.toUpperCase()}`, message: item.detail_zh, hint: "重绘只能换表现，业务事实要一条不少；确需改动的事实先走提问记录裁决" }));
    return failOutcome("prototype diff", result, errors, human, warnings);
  }
  return okOutcome("prototype diff", result, human, warnings);
}
