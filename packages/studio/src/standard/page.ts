// 规范页构建器（两个画廊共用，与框架无关）。
//
// Vue · Ant Design（packages/studio）与 React · Geist（packages/studio-react）两个抽屉的规范页结构、
// 视觉完全一致：页面在这里构建成同一棵节点树（StdNode），两边的运行时只做两件事——把节点树渲染成
// Vue / React 元素，把「实时位」（StdLive）换成本体系的组件（antd 或 Geist）。样式类见同目录的
// standard.css（std- 前缀，只用类选择器）。
//
// 数据来自生成器（scripts/lib/standard.mjs）从规范源 + 统一骨架（skeleton.yaml）同源生成的 story 文件。
// 骨架里有、本体系还没写的领域与条目，在这里呈现成「待补」，两个抽屉的目录因此完全相同。

// ── 数据形状（生成器嵌入 story 文件的内容）──────────────────────────────

export interface StdParam {
  readonly key: string;
  readonly label_zh: string | null;
  readonly kind: "token" | "value" | "decision";
  readonly token: string | null;
  readonly value: unknown;
  readonly unit: string;
  readonly source: string | null;
  readonly decision_zh: string | null;
  readonly candidates: readonly unknown[] | null;
  readonly note_zh: string | null;
  readonly pending: boolean;
}

export interface StdExample {
  readonly kind: "do" | "dont";
  readonly title_zh: string;
  readonly note_zh: string | null;
  readonly template: string | null;
  readonly jsx: string | null;
  readonly code: string | null;
  readonly lang: string | null;
}

export interface StdSpecimenRow {
  readonly name: string;
  readonly usage_zh: string | null;
  readonly sample_zh: string | null;
  readonly template: string | null;
  readonly jsx: string | null;
}

export interface StdSwatch {
  readonly name: string;
  readonly kind: "value" | "token" | "pending";
  readonly token: string | null;
  readonly value: string | null;
  readonly pending_zh: string | null;
  readonly usage_zh: string | null;
}

export interface StdPaletteScale {
  readonly name: string;
  readonly label_zh: string | null;
  readonly swatches: readonly StdSwatch[];
}

export type StdShowcase =
  | { readonly kind: "demo"; readonly title_zh: string; readonly description_zh: string | null; readonly template: string | null; readonly jsx: string | null }
  | {
      readonly kind: "specimen";
      readonly title_zh: string | null;
      readonly description_zh: string | null;
      readonly name_label_zh: string | null;
      readonly rows: readonly StdSpecimenRow[];
    }
  | {
      readonly kind: "palette";
      readonly title_zh: string | null;
      readonly description_zh: string | null;
      readonly source: string | null;
      readonly scales: readonly StdPaletteScale[];
    }
  | { readonly kind: "lab"; readonly lab: string; readonly title_zh: string; readonly description_zh: string | null };

export interface StdRule {
  readonly id: string;
  readonly title_zh: string;
  readonly statement_zh: string;
  readonly rationale_zh: string | null;
  readonly surfaces: readonly string[];
  readonly params: readonly StdParam[];
  readonly anchors: ReadonlyArray<{ readonly spec: string; readonly doc: string; readonly quote: string }>;
  readonly enforcement: {
    readonly kind: "gate" | "review";
    readonly check?: string;
    readonly check_title_zh?: string;
    readonly active?: boolean;
  };
  readonly showcase: readonly StdShowcase[];
  readonly examples: readonly StdExample[];
  readonly storybook: { readonly export: string; readonly id: string };
}

export interface StdTopic {
  readonly id: string;
  readonly title_zh: string;
  readonly covered: boolean;
}

export type StdPlaygroundProp =
  | { readonly key: string; readonly kind: "options"; readonly options: readonly string[]; readonly default: string }
  | { readonly key: string; readonly kind: "boolean"; readonly default: boolean };

export interface StdPlayground {
  readonly component: string;
  readonly text_zh: string | null;
  readonly props: readonly StdPlaygroundProp[];
  readonly matrix: { readonly rows: string; readonly columns: string } | null;
}

export interface StdArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group: string;
  readonly group_title_zh: string;
  readonly prefix: string;
  readonly summary_zh: string;
  /** 本体系写了这个领域（false = 骨架里有、本体系还没写，整页「待补」）。 */
  readonly covered: boolean;
  /** 组件领域：两套体系各自的现成组件（空表 = 没有现成组件，需自行设计）；非组件领域为 null。 */
  readonly counterparts: Readonly<Record<string, readonly string[]>> | null;
  readonly playground: StdPlayground | null;
  /** 骨架条目（顺序即页面顺序）；covered=false 的条目在页面上显示「待补」。 */
  readonly topics: readonly StdTopic[];
  readonly rules: readonly StdRule[];
  readonly storybook: {
    readonly title: string;
    readonly id: string;
    readonly playground_id: string | null;
    readonly matrix_id: string | null;
  };
}

export interface StdSource {
  readonly title_zh: string;
  readonly url: string;
  readonly retrieved: string;
  readonly note_zh: string | null;
}

export interface StdContext {
  readonly fingerprint: string;
  readonly meta: {
    readonly design_system: string;
    readonly design_system_title_zh: string;
    readonly origin: string;
    readonly customized: boolean;
    readonly ui_library: string;
  };
  /** 实时内容的源码语言（「显示代码」条上的标注）。 */
  readonly code_lang: string;
  readonly edit_file: string;
  readonly twin_files: readonly string[];
  readonly commands: { readonly validate: string; readonly regenerate: string; readonly show: string };
  readonly sources: Readonly<Record<string, StdSource>>;
  readonly tokens: Readonly<Record<string, unknown>>;
}

export interface StdOverviewArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group: string;
  readonly group_title_zh: string;
  readonly summary_zh: string;
  readonly covered: boolean;
  readonly rules: number;
  readonly gate: number;
  readonly review: number;
  readonly pending: number;
  /** 骨架里有、本体系还没写的条目数。 */
  readonly todo: number;
  readonly storybook_id: string;
}

// ── 节点树 ─────────────────────────────────────────────────────────────

export type StdAttrValue = string | number | boolean | Readonly<Record<string, string | number>> | ((...args: never[]) => void) | undefined;
export type StdAttrs = Readonly<Record<string, StdAttrValue>>;

export interface StdElement {
  readonly tag: string;
  readonly attrs: StdAttrs;
  readonly children: readonly StdNode[];
}

/** 实时位：由运行时换成本体系的组件（示例、演示、对照表的一行、实验、矩阵的一格）。 */
export interface StdLive {
  readonly live: string;
}

export type StdNode = string | number | StdElement | StdLive | null | undefined | false;

export function el(tag: string, attrs: StdAttrs = {}, children: readonly StdNode[] = []): StdElement {
  return { tag, attrs, children };
}

export function isElement(node: StdNode): node is StdElement {
  return typeof node === "object" && node !== null && "tag" in node;
}

export function isLive(node: StdNode): node is StdLive {
  return typeof node === "object" && node !== null && "live" in node;
}

/** 实时位的键（两个运行时按同一套键查组件）。 */
export const liveKey = {
  example: (ruleId: string, index: number): string => `ex:${ruleId}:${index}`,
  demo: (ruleId: string, block: number): string => `demo:${ruleId}:${block}`,
  row: (ruleId: string, block: number, row: number): string => `row:${ruleId}:${block}:${row}`,
  lab: (labId: string): string => `lab:${labId}`,
  cell: (row: string, column: string): string => `cell:${row}:${column}`,
};

export interface ParsedLiveKey {
  readonly kind: "example" | "demo" | "row" | "lab" | "cell";
  readonly ruleId: string | null;
  readonly index: number;
  readonly row: number;
  readonly lab: string | null;
  readonly cell: { readonly row: string; readonly column: string } | null;
}

export function parseLiveKey(key: string): ParsedLiveKey {
  const [kind = "", ...rest] = key.split(":");
  if (kind === "ex") return { kind: "example", ruleId: rest[0] ?? "", index: Number(rest[1]), row: -1, lab: null, cell: null };
  if (kind === "demo") return { kind: "demo", ruleId: rest[0] ?? "", index: Number(rest[1]), row: -1, lab: null, cell: null };
  if (kind === "row") return { kind: "row", ruleId: rest[0] ?? "", index: Number(rest[1]), row: Number(rest[2]), lab: null, cell: null };
  if (kind === "lab") return { kind: "lab", ruleId: null, index: -1, row: -1, lab: rest.join(":"), cell: null };
  if (kind === "cell") return { kind: "cell", ruleId: null, index: -1, row: -1, lab: null, cell: { row: rest[0] ?? "", column: rest[1] ?? "" } };
  throw new Error(`未知的实时位键：${key}`);
}

/** 实时位要渲染的源（Vue 运行时据此编译模板；React 运行时用生成器预编译的组件，不需要它）。 */
export function liveSource(area: StdArea, key: string): { readonly rule: StdRule; readonly template: string | null; readonly jsx: string | null } | null {
  const parsed = parseLiveKey(key);
  if (parsed.ruleId === null) return null;
  const rule = area.rules.find((item) => item.id === parsed.ruleId);
  if (rule === undefined) return null;
  if (parsed.kind === "example") {
    const example = rule.examples[parsed.index];
    return example === undefined ? null : { rule, template: example.template, jsx: example.jsx };
  }
  const block = rule.showcase[parsed.index];
  if (block === undefined) return null;
  if (parsed.kind === "demo" && block.kind === "demo") return { rule, template: block.template, jsx: block.jsx };
  if (parsed.kind === "row" && block.kind === "specimen") {
    const row = block.rows[parsed.row];
    return row === undefined ? null : { rule, template: row.template, jsx: row.jsx };
  }
  return null;
}

/** 已定参数的取值表（实时内容里的 `p`）。 */
export function paramValues(rule: StdRule): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const param of rule.params) if (!param.pending) out[param.key] = param.value;
  return out;
}

// ── 文本 ──────────────────────────────────────────────────────────────

const SURFACE_ZH: Readonly<Record<string, string>> = { admin: "管理侧", public: "用户侧" };
const ORIGIN_ZH: Readonly<Record<string, string>> = { preset: "预设，项目尚未确认", customized: "在预设上定制", owner: "项目自著" };
const UNIT_SUFFIX: Readonly<Record<string, string>> = { px: "px", em: "em", percent: "%", ratio: ":1", count: " 个", chars: " 字", ms: "ms", none: "" };
const SYSTEM_TITLES: Readonly<Record<string, string>> = { antd: "Ant Design", geist: "Geist" };

function scalar(value: unknown, unit: string): string {
  return typeof value === "number" ? `${value}${UNIT_SUFFIX[unit] ?? ""}` : String(value);
}

/** 参数值的展示文本（数组逐项带单位；映射单独渲染）。 */
export function formatParamValue(param: StdParam): string {
  if (Array.isArray(param.value)) return param.value.map((item) => scalar(item, param.unit)).join(" / ");
  return scalar(param.value, param.unit);
}

/** Storybook 内的页面地址（规范页在 iframe 里；链接带 data-story，preview 里拦截成 selectStory 导航）。 */
export function storyHref(id: string): string {
  return `./?path=/story/${id}`;
}

function storyLink(id: string, className: string, children: readonly StdNode[]): StdElement {
  return el("a", { class: className, href: storyHref(id), target: "_top", "data-story": id }, children);
}

/** 拦截带 data-story 的链接：在 Storybook（含组合后的总 Storybook）里经 selectStory 导航，不整页跳走。 */
export function installStoryLinks(target: Document, select: (storyId: string) => void): void {
  target.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const origin = event.target as Element | null;
    const link = origin?.closest?.("a[data-story]");
    const storyId = link?.getAttribute("data-story");
    if (link === null || link === undefined || storyId === null || storyId === undefined) return;
    event.preventDefault();
    select(storyId);
  });
}

function code(text: string): StdElement {
  return el("code", { class: "std-code-inline" }, [text]);
}

function tag(kind: string, children: readonly StdNode[], attrs: StdAttrs = {}): StdElement {
  return el("span", { ...attrs, class: `std-tag std-tag--${kind}` }, children);
}

function sourceLink(ctx: StdContext, id: string | null): StdNode {
  if (id === null) return null;
  const source = ctx.sources[id];
  if (source === undefined) return id;
  if (source.url.startsWith("repo:")) return el("span", { title: source.url.slice("repo:".length) }, [source.title_zh]);
  return el("a", { class: "std-link", href: source.url, target: "_blank", rel: "noreferrer" }, [source.title_zh]);
}

function icon(kind: "do" | "dont"): StdElement {
  const path = kind === "do" ? "M4 8.5l2.5 2.5L12 5.5" : "M5 5l6 6M11 5l-6 6";
  return el("svg", { class: "std-case-icon", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" }, [
    el("circle", { cx: 8, cy: 8, r: 7, fill: kind === "do" ? "var(--std-green-700)" : "var(--std-red-700)" }),
    el("path", { d: path, stroke: "white", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }),
  ]);
}

/** 「显示代码」条：原生 details，两个运行时都不需要状态。 */
function codeToggle(source: string, lang: string): StdElement {
  return el("details", { class: "std-code-toggle" }, [
    el("summary", { class: "std-code-summary" }, [
      el("span", { class: "std-code-show" }, ["显示代码"]),
      el("span", { class: "std-code-hide" }, ["隐藏代码"]),
      el("span", { class: "std-code-lang" }, [lang]),
    ]),
    el("pre", { class: "std-code" }, [el("code", { class: "std-code-text" }, [source])]),
  ]);
}

// ── 规则的各个部分 ─────────────────────────────────────────────────────

function enforcementTags(rule: StdRule): StdNode[] {
  if (rule.enforcement.kind === "review") return [tag("review", ["人工评审"])];
  return [
    tag("gate", ["机器门禁 ", el("span", { class: "std-tag-code" }, [rule.enforcement.check ?? ""])], {
      title: rule.enforcement.check_title_zh ?? rule.enforcement.check ?? "",
    }),
    rule.enforcement.active === true ? null : el("span", { class: "std-note" }, ["检查待接入，接入前按评审执行"]),
  ];
}

function surfaceTags(rule: StdRule): StdNode[] {
  if (rule.surfaces.length === 2) return [];
  return rule.surfaces.map((surface) => tag("surface", [`仅${SURFACE_ZH[surface] ?? surface}`]));
}

interface Levels {
  readonly title: string;
  readonly block: string;
}

function demoBlock(rule: StdRule, block: Extract<StdShowcase, { kind: "demo" }>, index: number, ctx: StdContext, levels: Levels): StdElement {
  const source = block.template ?? block.jsx ?? "";
  return el("div", { class: "std-showcase", "data-showcase": "demo" }, [
    el(levels.block, { class: "std-showcase-title" }, [block.title_zh]),
    block.description_zh === null ? null : el("p", { class: "std-showcase-desc" }, [block.description_zh]),
    el("div", { class: "std-demo-card" }, [
      el("div", { class: "std-stage", "data-live-showcase": "true" }, [{ live: liveKey.demo(rule.id, index) }]),
      codeToggle(source, ctx.code_lang),
    ]),
  ]);
}

function specimenBlock(rule: StdRule, block: Extract<StdShowcase, { kind: "specimen" }>, index: number, levels: Levels): StdElement {
  return el("div", { class: "std-showcase", "data-showcase": "specimen" }, [
    block.title_zh === null ? null : el(levels.block, { class: "std-showcase-title" }, [block.title_zh]),
    block.description_zh === null ? null : el("p", { class: "std-showcase-desc" }, [block.description_zh]),
    el("table", { class: "std-specimen" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { class: "std-specimen-th", scope: "col" }, ["示例"]),
          el("th", { class: "std-specimen-th", scope: "col" }, [block.name_label_zh ?? "名称"]),
          el("th", { class: "std-specimen-th", scope: "col" }, ["用途"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        block.rows.map((row, rowIndex) =>
          el("tr", { "data-specimen-row": row.name }, [
            el("td", { class: "std-specimen-td std-specimen-sample" }, [
              row.sample_zh !== null
                ? el("span", { class: `std-specimen-text ${row.name}` }, [row.sample_zh])
                : el("div", { "data-live-showcase": "true" }, [{ live: liveKey.row(rule.id, index, rowIndex) }]),
            ]),
            el("td", { class: "std-specimen-td std-specimen-name" }, [CJK.test(row.name) ? el("span", { class: "std-specimen-label" }, [row.name]) : code(row.name)]),
            el("td", { class: "std-specimen-td std-specimen-usage" }, [row.usage_zh ?? ""]),
          ]),
        ),
      ),
    ]),
  ]);
}

/** 名称是中文描述（而不是类名、token 名）时按文字呈现，不套代码样式。 */
const CJK = /[\u3400-\u9fff]/;

function swatchStep(scale: StdPaletteScale, swatch: StdSwatch): string {
  return swatch.name.startsWith(`${scale.name}-`) ? swatch.name.slice(scale.name.length + 1) : swatch.name;
}

function paletteBlock(block: Extract<StdShowcase, { kind: "palette" }>, ctx: StdContext, levels: Levels): StdElement {
  const swatches = block.scales.flatMap((scale) => scale.swatches);
  return el("div", { class: "std-showcase", "data-showcase": "palette" }, [
    block.title_zh === null ? null : el(levels.block, { class: "std-showcase-title" }, [block.title_zh]),
    block.description_zh === null ? null : el("p", { class: "std-showcase-desc" }, [block.description_zh]),
    el(
      "div",
      { class: "std-palette" },
      block.scales.map((scale) =>
        el("div", { class: "std-scale", "data-scale": scale.name }, [
          el("div", { class: "std-scale-head" }, [
            el("span", { class: "std-scale-label" }, [scale.label_zh ?? scale.name]),
            el("span", { class: "std-scale-name" }, [scale.name]),
          ]),
          el(
            "ol",
            { class: "std-swatches" },
            scale.swatches.map((swatch) => {
              const pending = swatch.value === null;
              const shown = pending ? (swatch.pending_zh ?? "待定") : swatch.value;
              return el(
                "li",
                {
                  class: "std-swatch",
                  "data-swatch": swatch.name,
                  "data-pending": pending ? "true" : "false",
                  title: [swatch.name, swatch.token === null ? null : `token ${swatch.token}`, shown, swatch.usage_zh].filter((part) => part !== null).join(" · "),
                },
                [
                  pending
                    ? el("span", { class: "std-swatch-chip std-swatch-chip--pending" }, [swatch.pending_zh ?? "待定"])
                    : el("span", { class: "std-swatch-chip", style: { background: swatch.value ?? "" } }),
                  el("span", { class: "std-swatch-step" }, [swatchStep(scale, swatch)]),
                  swatch.usage_zh === null ? null : el("span", { class: "std-swatch-usage" }, [swatch.usage_zh]),
                ],
              );
            }),
          ),
        ]),
      ),
    ),
    el("details", { class: "std-values-toggle" }, [
      el("summary", { class: "std-values-summary" }, [`色值表（${swatches.length} 个）`]),
      el("table", { class: "std-values" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", { class: "std-values-th", scope: "col" }, ["名称"]),
            el("th", { class: "std-values-th", scope: "col" }, ["值"]),
            el("th", { class: "std-values-th", scope: "col" }, ["用途"]),
          ]),
        ]),
        el(
          "tbody",
          {},
          swatches.map((swatch) =>
            el("tr", {}, [
              el("td", { class: "std-values-td" }, [code(swatch.name)]),
              el("td", { class: "std-values-td" }, [
                swatch.value === null
                  ? el("span", { class: "std-pending" }, [swatch.pending_zh ?? "待定"])
                  : el("span", { class: "std-value" }, [el("span", { class: "std-values-chip", style: { background: swatch.value } }), swatch.value]),
                swatch.token === null ? null : el("span", { class: "std-params-key" }, [`token ${swatch.token}`]),
              ]),
              el("td", { class: "std-values-td std-values-usage" }, [swatch.usage_zh ?? ""]),
            ]),
          ),
        ),
      ]),
    ]),
    block.source === null ? null : el("p", { class: "std-showcase-source" }, ["来源：", sourceLink(ctx, block.source)]),
  ]);
}

function labBlock(block: Extract<StdShowcase, { kind: "lab" }>, levels: Levels): StdElement {
  return el("div", { class: "std-showcase", "data-showcase": "lab", "data-lab": block.lab }, [
    el(levels.block, { class: "std-showcase-title" }, [block.title_zh]),
    block.description_zh === null ? null : el("p", { class: "std-showcase-desc" }, [block.description_zh]),
    el("div", { class: "std-lab-frame" }, [{ live: liveKey.lab(block.lab) }]),
  ]);
}

function caseFigure(rule: StdRule, example: StdExample, index: number, ctx: StdContext): StdElement {
  const live = example.template ?? example.jsx;
  return el("figure", { class: `std-case std-case--${example.kind}`, "data-example-kind": example.kind }, [
    el("div", { class: "std-case-card" }, [
      live === null
        ? el("pre", { class: "std-code std-code--stage", "data-lang": example.lang ?? "" }, [el("code", { class: "std-code-text" }, [example.code ?? ""])])
        : el("div", { class: "std-stage", "data-live-example": "true" }, [{ live: liveKey.example(rule.id, index) }]),
      live === null ? null : codeToggle(live, ctx.code_lang),
    ]),
    el("figcaption", { class: "std-case-caption" }, [
      el("span", { class: `std-case-verdict std-case-verdict--${example.kind}` }, [icon(example.kind), example.kind === "do" ? "这样做" : "别这样做"]),
      el("span", { class: "std-case-title" }, [example.title_zh]),
      example.note_zh === null ? null : el("p", { class: "std-case-note" }, [example.note_zh]),
    ]),
  ]);
}

function paramValueCell(param: StdParam): StdElement {
  if (param.pending) {
    const text = param.kind === "decision" ? `待项目决定：${param.decision_zh ?? ""}` : `待定：token ${param.token ?? ""} 仍为 UNKNOWN`;
    return el("td", { class: "std-params-td" }, [
      el("span", { class: "std-pending" }, [text]),
      param.candidates === null ? null : el("span", { class: "std-params-key" }, [`候选：${param.candidates.map((c) => scalar(c, param.unit)).join(" / ")}`]),
    ]);
  }
  if (typeof param.value === "object" && param.value !== null && !Array.isArray(param.value)) {
    const entries = Object.entries(param.value as Record<string, unknown>);
    return el("td", { class: "std-params-td" }, [
      el("dl", { class: "std-map" }, entries.flatMap(([key, value]) => [el("dt", { class: "std-map-term" }, [key]), el("dd", { class: "std-map-desc" }, [String(value)])])),
    ]);
  }
  return el("td", { class: "std-params-td" }, [
    el("span", { class: "std-value" }, [formatParamValue(param)]),
    param.note_zh === null ? null : el("span", { class: "std-params-key" }, [param.note_zh]),
  ]);
}

function paramOrigin(param: StdParam, ctx: StdContext): StdElement {
  if (param.kind === "token") return el("td", { class: "std-params-td std-params-origin" }, ["token ", code(param.token ?? "")]);
  if (param.kind === "decision" && param.source === null) return el("td", { class: "std-params-td std-params-origin" }, ["项目决策位"]);
  return el("td", { class: "std-params-td std-params-origin" }, [sourceLink(ctx, param.source)]);
}

function paramsBlock(rule: StdRule, ctx: StdContext, levels: Levels): StdNode {
  if (rule.params.length === 0) return null;
  return el("div", { class: "std-showcase", "data-params": "true" }, [
    el(levels.block, { class: "std-showcase-title" }, ["数值与出处"]),
    el("table", { class: "std-params" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { class: "std-params-th", scope: "col" }, ["参数"]),
          el("th", { class: "std-params-th", scope: "col" }, ["值"]),
          el("th", { class: "std-params-th", scope: "col" }, ["来源"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        rule.params.map((param) =>
          el("tr", { "data-param": param.key, "data-pending": param.pending ? "true" : "false" }, [
            el("td", { class: "std-params-td" }, [param.label_zh ?? param.key, el("span", { class: "std-params-key" }, [`p.${param.key}`])]),
            paramValueCell(param),
            paramOrigin(param, ctx),
          ]),
        ),
      ),
    ]),
  ]);
}

function basisBlock(rule: StdRule, levels: Levels): StdNode {
  if (rule.anchors.length === 0) return null;
  return el("div", { class: "std-showcase" }, [
    el(levels.block, { class: "std-showcase-title" }, ["硬规范依据"]),
    el(
      "ul",
      { class: "std-basis" },
      rule.anchors.map((anchor) =>
        el("li", { class: "std-basis-item" }, [el("blockquote", { class: "std-basis-quote" }, [anchor.quote]), el("span", { class: "std-basis-doc" }, [`specs/hard/${anchor.doc}`])]),
      ),
    ),
  ]);
}

function showcaseBlocks(rule: StdRule, ctx: StdContext, levels: Levels): StdNode[] {
  return rule.showcase.map((block, index) => {
    if (block.kind === "demo") return demoBlock(rule, block, index, ctx, levels);
    if (block.kind === "specimen") return specimenBlock(rule, block, index, levels);
    if (block.kind === "palette") return paletteBlock(block, ctx, levels);
    return labBlock(block, levels);
  });
}

/** 一条规则一节：标题与标记 → 条文 → 演示 / 对照表 / 色板 / 实验 → 这样做 / 别这样做 → 数值与出处 → 依据 → 修改方式。 */
export function ruleSection(rule: StdRule, ctx: StdContext, page = false): StdElement {
  const levels: Levels = page ? { title: "h1", block: "h2" } : { title: "h2", block: "h3" };
  return el("section", { class: "std-rule", id: rule.id, "data-rule": rule.id }, [
    el("div", { class: "std-rule-head" }, [
      el(levels.title, { class: page ? "std-rule-title std-rule-title--page" : "std-rule-title" }, [
        rule.title_zh,
        page ? null : el("a", { class: "std-rule-anchor", href: `#${rule.id}`, "aria-label": `链接到「${rule.title_zh}」` }, ["#"]),
      ]),
      el("div", { class: "std-rule-meta" }, [el("span", { class: "std-rule-id" }, [rule.id]), ...enforcementTags(rule), ...surfaceTags(rule)]),
    ]),
    el("p", { class: "std-statement" }, [rule.statement_zh]),
    rule.rationale_zh === null ? null : el("p", { class: "std-rationale" }, [rule.rationale_zh]),
    ...showcaseBlocks(rule, ctx, levels),
    rule.examples.length === 0 ? null : el("div", { class: "std-cases" }, rule.examples.map((example, index) => caseFigure(rule, example, index, ctx))),
    paramsBlock(rule, ctx, levels),
    basisBlock(rule, levels),
    el("p", { class: "std-edit" }, ["修改这条规则：编辑 ", code(ctx.edit_file), ` 里 id 为 ${rule.id} 的条目，运行 `, code(ctx.commands.validate), " 校验后重新生成。"]),
  ]);
}

function todoSection(topic: StdTopic): StdElement {
  return el("section", { class: "std-rule std-rule--todo", id: topic.id, "data-rule-todo": topic.id }, [
    el("div", { class: "std-rule-head" }, [
      el("h2", { class: "std-rule-title" }, [topic.title_zh]),
      el("div", { class: "std-rule-meta" }, [el("span", { class: "std-rule-id" }, [topic.id]), tag("todo", ["待补"])]),
    ]),
    el("p", { class: "std-todo-text" }, ["本体系还没写这一条。补上之前，开发时参照另一套体系的同名条目，并在评审时说明。"]),
  ]);
}

// ── 页面 ──────────────────────────────────────────────────────────────

function crumb(ctx: StdContext, parts: readonly string[]): StdElement {
  return el("nav", { class: "std-crumb", "aria-label": "位置" }, [
    ...parts.flatMap((part, index) => [index > 0 ? el("span", { class: "std-crumb-sep", "aria-hidden": "true" }, ["/"]) : null, el("span", {}, [part])]),
    el("span", { class: "std-crumb-tags" }, [tag("system", [`${ctx.meta.design_system_title_zh} · ${ctx.meta.ui_library}`]), tag("origin", [ORIGIN_ZH[ctx.meta.origin] ?? ctx.meta.origin])]),
  ]);
}

function areaCrumb(area: StdArea): string[] {
  return ["规范", ...area.group_title_zh.split("/")];
}

function counts(area: StdArea): { gate: number; pending: number; todo: number } {
  return {
    gate: area.rules.filter((rule) => rule.enforcement.kind === "gate").length,
    pending: area.rules.reduce((sum, rule) => sum + rule.params.filter((param) => param.pending).length, 0),
    todo: area.topics.filter((topic) => !topic.covered).length,
  };
}

function counterpartsList(area: StdArea): StdNode {
  if (area.counterparts === null) return null;
  return el(
    "dl",
    { class: "std-counterparts" },
    Object.entries(area.counterparts).flatMap(([system, names]) => [
      el("dt", { class: "std-counterparts-term" }, [`${SYSTEM_TITLES[system] ?? system} 对应`]),
      el("dd", { class: "std-counterparts-desc" }, names.length === 0 ? [el("span", { class: "std-note" }, ["没有现成组件，需要自行设计"])] : names.map((name) => tag("surface", [name]))),
    ]),
  );
}

function areaHeader(area: StdArea, ctx: StdContext): StdElement {
  const { gate, pending, todo } = counts(area);
  const links: StdNode[] = [];
  if (area.storybook.playground_id !== null) links.push(storyLink(area.storybook.playground_id, "std-story-link", ["实验场"]));
  if (area.storybook.matrix_id !== null) links.push(storyLink(area.storybook.matrix_id, "std-story-link", ["状态矩阵"]));
  return el("header", { class: "std-header" }, [
    crumb(ctx, areaCrumb(area)),
    el("h1", { class: "std-title" }, [area.title_zh]),
    el("p", { class: "std-lead" }, [area.summary_zh]),
    el("div", { class: "std-facts" }, [
      area.covered ? tag("surface", [`${area.rules.length} 条规则`]) : tag("todo", ["待补"]),
      area.covered ? tag("gate", [`门禁 ${gate}`]) : null,
      area.covered ? tag("review", [`评审 ${area.rules.length - gate}`]) : null,
      pending > 0 ? tag("pending", [`${pending} 个参数待定`]) : null,
      area.covered && todo > 0 ? tag("todo", [`${todo} 条待补`]) : null,
    ]),
    counterpartsList(area),
    links.length === 0 ? null : el("div", { class: "std-links" }, links),
  ]);
}

function footer(ctx: StdContext): StdElement {
  return el("footer", { class: "std-footer" }, [
    el("p", { class: "std-footer-line" }, ["规范指纹 ", code(ctx.fingerprint)]),
    el("p", { class: "std-footer-line" }, [
      "AI 读 ",
      ...ctx.twin_files.flatMap((file, index) => [index > 0 ? "、" : null, code(file)]),
      "，或运行 ",
      code(ctx.commands.show),
      "；三者与本页同源。",
    ]),
    el("p", { class: "std-footer-line" }, ["修改：编辑 ", code(ctx.edit_file), " → ", code(ctx.commands.validate), " → ", code(ctx.commands.regenerate), "。"]),
  ]);
}

function toc(area: StdArea): StdNode {
  if (area.topics.length === 0) return null;
  return el("nav", { class: "std-toc", "aria-label": "本页" }, [
    el("p", { class: "std-toc-title" }, ["本页"]),
    el(
      "ol",
      { class: "std-toc-list" },
      [
        area.playground !== null && area.playground.matrix !== null ? el("li", { class: "std-toc-item" }, [el("a", { class: "std-toc-link", href: "#matrix" }, ["全部变体"])]) : null,
        ...area.topics.map((topic) =>
          el("li", { class: "std-toc-item" }, [el("a", { class: topic.covered ? "std-toc-link" : "std-toc-link std-toc-link--todo", href: `#${topic.id}` }, [topic.title_zh])]),
        ),
      ],
    ),
  ]);
}

/** 状态矩阵：行、列各取一个枚举属性，其余属性取缺省值。 */
export function matrixBlock(area: StdArea, headingTag = "h2"): StdNode {
  const playground = area.playground;
  if (playground === null || playground.matrix === null) return null;
  const rows = playground.props.find((prop) => prop.key === playground.matrix?.rows);
  const columns = playground.props.find((prop) => prop.key === playground.matrix?.columns);
  if (rows?.kind !== "options" || columns?.kind !== "options") return null;
  return el("section", { class: "std-showcase", id: "matrix", "data-matrix": "true" }, [
    el(headingTag, { class: "std-showcase-title" }, ["全部变体"]),
    el("p", { class: "std-showcase-desc" }, [`${rows.key} × ${columns.key}，其余属性取缺省值。要试别的组合，打开「实验场」。`]),
    el("div", { class: "std-matrix-wrap" }, [
      el("table", { class: "std-matrix" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", { class: "std-matrix-th std-matrix-corner", scope: "col" }, [`${rows.key} \\ ${columns.key}`]),
            ...columns.options.map((column) => el("th", { class: "std-matrix-th", scope: "col" }, [column])),
          ]),
        ]),
        el(
          "tbody",
          {},
          rows.options.map((row) =>
            el("tr", { class: "std-matrix-tr" }, [
              el("th", { class: "std-matrix-td std-matrix-row-head", scope: "row" }, [row]),
              ...columns.options.map((column) =>
                el("td", { class: "std-matrix-td", "data-matrix-cell": `${row}:${column}` }, [el("div", { class: "std-matrix-cell" }, [{ live: liveKey.cell(row, column) }])]),
              ),
            ]),
          ),
        ),
      ]),
    ]),
  ]);
}

function placeholderPage(area: StdArea, ctx: StdContext): StdElement {
  return el("article", { class: "std-page", "data-area": area.key, "data-area-todo": "true" }, [
    el("div", { class: "std-layout" }, [
      el("div", { class: "std-main" }, [
        areaHeader(area, ctx),
        el("div", { class: "std-todo-card" }, [
          el("h2", { class: "std-todo-title" }, ["这一页还没写"]),
          el("p", { class: "std-todo-text" }, [
            "两套体系的规范目录相同（统一骨架），这一页在本体系还没有内容。补上之前，开发时参照另一套体系的同名页（如果有），并在评审时说明。补的时候按骨架的领域键 ",
            code(area.key),
            "、规则前缀 ",
            code(area.prefix),
            " 写进 ",
            code(ctx.edit_file),
            "。",
          ]),
          area.topics.length === 0
            ? null
            : el("ul", { class: "std-todo-list" }, area.topics.map((topic) => el("li", { class: "std-todo-item" }, [`${topic.title_zh}（${topic.id}）`]))),
        ]),
        footer(ctx),
      ]),
    ]),
  ]);
}

/** 领域页：页头 →（组件）全部变体 → 按骨架顺序的每一条（已写的规则 / 待补）→ 页脚；宽屏右侧是本页目录。 */
export function areaPage(area: StdArea, ctx: StdContext): StdElement {
  if (!area.covered) return placeholderPage(area, ctx);
  const byId = new Map(area.rules.map((rule) => [rule.id, rule]));
  return el("article", { class: "std-page", "data-area": area.key }, [
    el("div", { class: "std-layout" }, [
      el("div", { class: "std-main" }, [
        areaHeader(area, ctx),
        matrixBlock(area),
        ...area.topics.map((topic) => {
          const rule = byId.get(topic.id);
          return rule === undefined ? todoSection(topic) : ruleSection(rule, ctx);
        }),
        footer(ctx),
      ]),
      toc(area),
    ]),
  ]);
}

/** 单条规则页（深链用）。 */
export function rulePage(rule: StdRule, area: StdArea, ctx: StdContext): StdElement {
  return el("article", { class: "std-page std-page--rule", "data-area": area.key }, [
    el("div", { class: "std-layout" }, [
      el("div", { class: "std-main" }, [
        el("header", { class: "std-header" }, [crumb(ctx, [...areaCrumb(area), area.title_zh])]),
        ruleSection(rule, ctx, true),
        el("p", { class: "std-edit" }, ["同领域的其他规则见 ", storyLink(area.storybook.id, "std-link", [`${area.title_zh}`]), "。"]),
      ]),
    ]),
  ]);
}

/** 状态矩阵页（组件领域的独立 story）。 */
export function matrixPage(area: StdArea, ctx: StdContext): StdElement {
  return el("article", { class: "std-page std-page--matrix", "data-area": area.key }, [
    el("div", { class: "std-layout" }, [
      el("div", { class: "std-main" }, [
        el("header", { class: "std-header" }, [
          crumb(ctx, [...areaCrumb(area), area.title_zh]),
          el("h1", { class: "std-title" }, [`${area.title_zh} · 状态矩阵`]),
          el("p", { class: "std-lead" }, ["一屏看完规范允许的组合。规则与用法见 ", storyLink(area.storybook.id, "std-link", [area.title_zh]), "。"]),
        ]),
        matrixBlock(area, "h2"),
      ]),
    ]),
  ]);
}

const GROUP_ORDER = [
  "foundations",
  "components.general",
  "components.layout",
  "components.navigation",
  "components.entry",
  "components.display",
  "components.feedback",
  "components.other",
  "patterns.global",
  "patterns.principles",
  "patterns.templates",
  "patterns.experience",
  "patterns.data",
  "engineering",
];

/** 总览页：规范是什么、当前进度、怎么改、怎么读标记、各领域入口（含待补）。 */
export function overviewPage(ctx: StdContext, areas: readonly StdOverviewArea[]): StdElement {
  const covered = areas.filter((area) => area.covered);
  const total = covered.reduce((sum, area) => sum + area.rules, 0);
  const gate = covered.reduce((sum, area) => sum + area.gate, 0);
  const pending = covered.reduce((sum, area) => sum + area.pending, 0);
  const groups = new Map<string, StdOverviewArea[]>();
  for (const area of areas) groups.set(area.group, [...(groups.get(area.group) ?? []), area]);
  const ordered = [...groups.entries()].sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  const stat = (value: StdNode, label: string): StdElement =>
    el("div", { class: "std-stat" }, [el("span", { class: "std-stat-value" }, [value]), el("span", { class: "std-stat-label" }, [label])]);
  return el("article", { class: "std-page std-page--overview", "data-overview": "true" }, [
    el("div", { class: "std-layout" }, [
      el("div", { class: "std-main" }, [
        el("header", { class: "std-header" }, [
          crumb(ctx, ["规范"]),
          el("h1", { class: "std-title" }, ["前端设计规范"]),
          el("p", { class: "std-lead" }, [
            `${ctx.meta.design_system_title_zh}（${ctx.meta.ui_library}）的开发规范。这里的每一页都是开发必须遵守的规范，不是参考：页面、AI 孪生和 `,
            code(ctx.commands.show),
            " 从同一份规范源生成；机器能查的规则由门禁直接拦截，其余在评审时逐条核对。两套体系的目录相同，本体系还没写的页标为「待补」。",
          ]),
        ]),
        el("div", { class: "std-stats" }, [
          stat(`${covered.length} / ${areas.length}`, "已写的领域"),
          stat(total, "条规则"),
          stat(gate, "条机器门禁"),
          stat(pending, "个参数待项目决定"),
        ]),
        el("section", { class: "std-section" }, [
          el("h2", { class: "std-section-title" }, ["怎么改规范"]),
          el("ol", { class: "std-steps" }, [
            el("li", { class: "std-step" }, ["编辑规范源 ", code(ctx.edit_file), "：改条文、改数值、补示例。定值要登记出处，没定的写成项目决策位。"]),
            el("li", { class: "std-step" }, ["运行 ", code(ctx.commands.validate), "：未知键、未登记出处、和骨架对不上、示例引用了待定参数，一次报全。"]),
            el("li", { class: "std-step" }, ["运行 ", code(ctx.commands.regenerate), "：Storybook 页面和 AI 孪生一起更新；孪生不新鲜时 CI 失败。"]),
          ]),
        ]),
        el("section", { class: "std-section" }, [
          el("h2", { class: "std-section-title" }, ["怎么读标记"]),
          el("dl", { class: "std-legend" }, [
            el("dt", { class: "std-legend-term" }, [tag("gate", ["机器门禁"])]),
            el("dd", { class: "std-legend-desc" }, ["门禁扫描代码，违反即拦截。检查编号写在旁边；检查还没接入时先按评审执行。"]),
            el("dt", { class: "std-legend-term" }, [tag("review", ["人工评审"])]),
            el("dd", { class: "std-legend-desc" }, ["机器查不出来的规则，提交评审时逐条核对。"]),
            el("dt", { class: "std-legend-term" }, [tag("pending", ["待项目决定"])]),
            el("dd", { class: "std-legend-desc" }, ["框架不替项目选的值。项目定了以后写进规范源，页面随之更新。"]),
            el("dt", { class: "std-legend-term" }, [tag("todo", ["待补"])]),
            el("dd", { class: "std-legend-desc" }, ["骨架里有、本体系还没写的页或条目。补上之前参照另一套体系的同名页，并在评审时说明。"]),
          ]),
        ]),
        ...ordered.map(([group, list]) =>
          el("section", { class: "std-section", "data-group": group }, [
            el("h2", { class: "std-section-title" }, [list[0]?.group_title_zh.replace("/", " · ") ?? group]),
            el(
              "ul",
              { class: "std-area-grid" },
              list.map((area) =>
                el("li", { class: area.covered ? "std-area-card" : "std-area-card std-area-card--todo", "data-area-link": area.key }, [
                  storyLink(area.storybook_id, "std-area-link", [area.title_zh]),
                  el("p", { class: "std-area-summary" }, [area.summary_zh]),
                  el("span", { class: "std-area-meta" }, [
                    area.covered
                      ? `${area.rules} 条 · 门禁 ${area.gate}${area.pending > 0 ? ` · ${area.pending} 个待定` : ""}${area.todo > 0 ? ` · ${area.todo} 条待补` : ""}`
                      : "待补",
                  ]),
                ]),
              ),
            ),
          ]),
        ),
        footer(ctx),
      ]),
    ]),
  ]);
}

/** 节点树里的全部实时位键（测试与生成器对账用）。 */
export function liveKeysOf(node: StdNode): string[] {
  if (isLive(node)) return [node.live];
  if (!isElement(node)) return [];
  return node.children.flatMap(liveKeysOf);
}

/** 节点树的纯文本（测试用）。 */
export function textOf(node: StdNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isElement(node)) return "";
  return node.children.map(textOf).join("");
}
