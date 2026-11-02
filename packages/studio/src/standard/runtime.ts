// 规范页运行时（Storybook「规范」分区）：把生成器嵌入的规范数据渲染成页面。
//
// 数据来自 scripts/lib/standard.mjs 从 design-standard.yaml 同源生成的 story 文件；
// 本模块只负责呈现：规则条文、参数表（已解析的值与出处）、执行方式、硬规范依据、
// 「这样做 / 别这样做」实时示例与源码、编辑入口。页面自身的字号与间距只取规范里的
// 字阶（12 / 14 / 20 / 30）与间距阶梯（4 / 8 / 12 / 16 / 24 / 32），样式类见
// .storybook/preview.css 的 std- 前缀。
import { defineComponent, h, onErrorCaptured, ref, type Component, type VNode } from "vue";

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
  readonly jsx?: string | null;
  readonly code: string | null;
  readonly lang: string | null;
}

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
  readonly examples: readonly StdExample[];
  readonly storybook: { readonly id: string };
}

export interface StdArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group: string;
  readonly group_title_zh: string;
  readonly prefix: string;
  readonly summary_zh: string;
  readonly rules: readonly StdRule[];
  readonly storybook: { readonly title: string; readonly id: string };
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
  readonly edit_file: string;
  readonly twin_files: readonly string[];
  readonly sources: Readonly<Record<string, StdSource>>;
  readonly tokens: Readonly<Record<string, unknown>>;
}

export interface StdOverviewArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group_title_zh: string;
  readonly summary_zh: string;
  readonly rules: number;
  readonly gate: number;
  readonly review: number;
  readonly pending: number;
  readonly storybook_id: string;
}

const SURFACE_ZH: Record<string, string> = { admin: "管理侧", public: "用户侧" };
const ORIGIN_ZH: Record<string, string> = {
  preset: "预设，项目尚未确认",
  customized: "在预设上定制",
  owner: "项目自著",
};
const UNIT_SUFFIX: Record<string, string> = {
  px: "px",
  em: "em",
  percent: "%",
  ratio: ":1",
  count: " 个",
  chars: " 字",
  ms: "ms",
  none: "",
};

function scalar(value: unknown, unit: string): string {
  if (typeof value === "number") return `${value}${UNIT_SUFFIX[unit] ?? ""}`;
  return String(value);
}

/** 参数值的展示文本（数组逐项带单位；映射由参数表单独渲染）。 */
export function formatParamValue(param: StdParam): string {
  if (Array.isArray(param.value)) return param.value.map((item) => scalar(item, param.unit)).join(" / ");
  return scalar(param.value, param.unit);
}

/** 已定参数的取值表（实时示例里的 `p`）。 */
export function paramValues(rule: StdRule): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const param of rule.params) {
    if (!param.pending) out[param.key] = param.value;
  }
  return out;
}

/** Storybook 内跳转（规范页运行在 iframe 里，链接要打到顶层窗口）。 */
function storyHref(id: string): string {
  if (typeof window === "undefined") return `?path=/story/${id}`;
  try {
    return new URL(`./?path=/story/${id}`, window.location.href).toString();
  } catch {
    return `?path=/story/${id}`;
  }
}

function badge(kind: "gate" | "review" | "pending" | "surface" | "origin", text: string): VNode {
  return h("span", { class: ["std-badge", `std-badge--${kind}`] }, text);
}

function enforcementBadges(rule: StdRule): VNode[] {
  if (rule.enforcement.kind === "review") return [badge("review", "人工评审")];
  const nodes = [
    badge("gate", "机器门禁"),
    h("code", { class: "std-check" }, rule.enforcement.check ?? ""),
  ];
  if (rule.enforcement.active !== true) {
    nodes.push(h("span", { class: "std-muted" }, "检查待接入，接入前按评审执行"));
  }
  return nodes;
}

function surfaceBadges(rule: StdRule): VNode[] {
  if (rule.surfaces.length === 2) return [badge("surface", "两个面都适用")];
  return rule.surfaces.map((surface) => badge("surface", `仅${SURFACE_ZH[surface] ?? surface}`));
}

function sourceLink(ctx: StdContext, id: string | null): VNode | string {
  if (id === null) return "";
  const source = ctx.sources[id];
  if (source === undefined) return id;
  if (source.url.startsWith("repo:")) {
    return h("span", { title: source.url.slice("repo:".length) }, source.title_zh);
  }
  return h("a", { href: source.url, target: "_blank", rel: "noreferrer" }, source.title_zh);
}

function paramValueCell(param: StdParam): VNode {
  if (param.pending) {
    const text =
      param.kind === "decision"
        ? `待项目决定：${param.decision_zh ?? ""}`
        : `待定：token ${param.token ?? ""} 仍为 UNKNOWN`;
    const candidates =
      param.candidates === null ? null : h("div", { class: "std-muted" }, `候选：${param.candidates.map((c) => scalar(c, param.unit)).join(" / ")}`);
    return h("td", { class: "std-pending-cell" }, [h("span", { class: "std-pending" }, text), candidates]);
  }
  if (typeof param.value === "object" && param.value !== null && !Array.isArray(param.value)) {
    const entries = Object.entries(param.value as Record<string, unknown>);
    return h(
      "td",
      h(
        "dl",
        { class: "std-map" },
        entries.flatMap(([key, value]) => [h("dt", key), h("dd", h("code", String(value)))]),
      ),
    );
  }
  return h("td", [h("code", { class: "std-value" }, formatParamValue(param)), param.note_zh === null ? null : h("div", { class: "std-muted" }, param.note_zh)]);
}

function paramOrigin(param: StdParam, ctx: StdContext): VNode {
  if (param.kind === "token") {
    return h("td", [h("span", { class: "std-muted" }, "token "), h("code", param.token ?? "")]);
  }
  if (param.kind === "decision") {
    return h("td", param.source === null ? h("span", { class: "std-muted" }, "项目决策位") : sourceLink(ctx, param.source));
  }
  return h("td", sourceLink(ctx, param.source));
}

function paramsTable(rule: StdRule, ctx: StdContext): VNode | null {
  if (rule.params.length === 0) return null;
  return h("table", { class: "std-table" }, [
    h("thead", h("tr", [h("th", "参数"), h("th", "值"), h("th", "来源")])),
    h(
      "tbody",
      rule.params.map((param) =>
        h("tr", { "data-param": param.key, "data-pending": param.pending ? "true" : "false" }, [
          h("td", [h("div", param.label_zh ?? param.key), h("code", { class: "std-muted" }, `p.${param.key}`)]),
          paramValueCell(param),
          paramOrigin(param, ctx),
        ]),
      ),
    ),
  ]);
}

/** 实时示例的错误边界：示例渲染失败时在示例位置显示错误，不拖垮整页。 */
const ExampleBoundary = defineComponent({
  name: "StdExampleBoundary",
  setup(_props, { slots }) {
    const failure = ref<string | null>(null);
    onErrorCaptured((error) => {
      failure.value = error instanceof Error ? error.message : String(error);
      return false;
    });
    return () =>
      failure.value === null
        ? slots.default?.()
        : h("div", { class: "std-example-error", role: "alert" }, `示例渲染失败：${failure.value}`);
  },
});

function liveExample(example: StdExample, rule: StdRule, ctx: StdContext, icons: Readonly<Record<string, Component>>): Component {
  const p = paramValues(rule);
  return defineComponent({
    name: "StdLiveExample",
    components: icons,
    setup() {
      return { p, t: ctx.tokens };
    },
    template: example.template ?? "",
  });
}

function examplePanel(example: StdExample, rule: StdRule, ctx: StdContext, icons: Readonly<Record<string, Component>>): VNode {
  const label = example.kind === "do" ? "这样做" : "别这样做";
  const body: Array<VNode | null> = [
    h("div", { class: "std-example-head" }, [
      h("span", { class: "std-example-label" }, label),
      h("span", { class: "std-example-title" }, example.title_zh),
    ]),
  ];
  if (example.template !== null) {
    body.push(
      h("div", { class: "std-stage", "data-live-example": "true" }, h(ExampleBoundary, null, { default: () => h(liveExample(example, rule, ctx, icons)) })),
    );
    body.push(
      h("details", { class: "std-source" }, [
        h("summary", "模板源码"),
        h("pre", { class: "std-code" }, h("code", example.template)),
      ]),
    );
  } else {
    body.push(h("pre", { class: "std-code std-code--static", "data-lang": example.lang ?? "" }, h("code", example.code ?? "")));
  }
  if (example.note_zh !== null) body.push(h("p", { class: "std-example-note" }, example.note_zh));
  return h("figure", { class: ["std-example", `std-example--${example.kind}`], "data-example-kind": example.kind }, body);
}

function ruleSection(
  rule: StdRule,
  ctx: StdContext,
  icons: Readonly<Record<string, Component>>,
  options: { readonly headingLevel: 1 | 2 },
): VNode {
  const titleTag = options.headingLevel === 1 ? "h1" : "h2";
  const subTag = options.headingLevel === 1 ? "h2" : "h3";
  const children: Array<VNode | null> = [
    h("div", { class: "std-rule-id" }, rule.id),
    h(titleTag, { class: options.headingLevel === 1 ? "std-title-1" : "std-title-2" }, rule.title_zh),
    h("div", { class: "std-badges" }, [...enforcementBadges(rule), ...surfaceBadges(rule)]),
    h("p", { class: "std-statement" }, rule.statement_zh),
  ];
  if (rule.rationale_zh !== null) children.push(h("p", { class: "std-muted std-prose" }, rule.rationale_zh));
  const params = paramsTable(rule, ctx);
  if (params !== null) {
    children.push(h(subTag, { class: "std-title-3" }, "参数"));
    children.push(params);
  }
  if (rule.examples.length > 0) {
    children.push(h(subTag, { class: "std-title-3" }, "示例"));
    children.push(h("div", { class: "std-examples" }, rule.examples.map((example) => examplePanel(example, rule, ctx, icons))));
  }
  if (rule.anchors.length > 0) {
    children.push(h(subTag, { class: "std-title-3" }, "硬规范依据"));
    children.push(
      h(
        "ul",
        { class: "std-anchors" },
        rule.anchors.map((anchor) =>
          h("li", [h("blockquote", anchor.quote), h("code", { class: "std-muted" }, `specs/hard/${anchor.doc}`)]),
        ),
      ),
    );
  }
  children.push(
    h("p", { class: "std-edit" }, [
      "修改这条规则：编辑 ",
      h("code", ctx.edit_file),
      ` 里 id 为 ${rule.id} 的条目，`,
      h("code", "pomaster design validate"),
      " 校验后重新生成。",
    ]),
  );
  return h("section", { class: "std-rule", id: rule.id, "data-rule": rule.id }, children);
}

function pageHeader(ctx: StdContext, crumb: string): VNode {
  return h("div", { class: "std-crumb" }, [
    h("span", crumb),
    badge("origin", `${ctx.meta.design_system_title_zh}（${ctx.meta.ui_library}）`),
    badge("origin", ORIGIN_ZH[ctx.meta.origin] ?? ctx.meta.origin),
  ]);
}

/** 领域页：领域说明 + 规则索引 + 全部规则。 */
export function areaPage(area: StdArea, ctx: StdContext, icons: Readonly<Record<string, Component>>): Component {
  return defineComponent({
    name: "StdAreaPage",
    setup() {
      return () => {
        const gate = area.rules.filter((rule) => rule.enforcement.kind === "gate").length;
        const pending = area.rules.reduce((sum, rule) => sum + rule.params.filter((param) => param.pending).length, 0);
        return h("article", { class: "std-page", "data-area": area.key }, [
          pageHeader(ctx, `规范 / ${area.group_title_zh}`),
          h("h1", { class: "std-title-1" }, area.title_zh),
          h("p", { class: "std-lead" }, area.summary_zh),
          h("div", { class: "std-badges" }, [
            badge("surface", `${area.rules.length} 条规则`),
            badge("gate", `门禁 ${gate}`),
            badge("review", `评审 ${area.rules.length - gate}`),
            pending > 0 ? badge("pending", `${pending} 个参数待定`) : null,
          ]),
          h("nav", { class: "std-index", "aria-label": "本页规则" }, [
            h("table", { class: "std-table" }, [
              h("thead", h("tr", [h("th", "编号"), h("th", "规则"), h("th", "执行")])),
              h(
                "tbody",
                area.rules.map((rule) =>
                  h("tr", [
                    h("td", h("a", { href: `#${rule.id}` }, h("code", rule.id))),
                    h("td", rule.title_zh),
                    h("td", rule.enforcement.kind === "gate" ? "机器门禁" : "人工评审"),
                  ]),
                ),
              ),
            ]),
          ]),
          ...area.rules.map((rule) => ruleSection(rule, ctx, icons, { headingLevel: 2 })),
          h("footer", { class: "std-footer" }, [
            "规范指纹 ",
            h("code", ctx.fingerprint),
            "。与 AI 孪生（",
            ...ctx.twin_files.flatMap((file, index) => [index > 0 ? "、" : "", h("code", file)]),
            "）和 ",
            h("code", "pomaster design show"),
            " 的输出同源。",
          ]),
        ]);
      };
    },
  });
}

/** 单条规则页（深链用）。 */
export function rulePage(rule: StdRule, area: StdArea, ctx: StdContext, icons: Readonly<Record<string, Component>>): Component {
  return defineComponent({
    name: "StdRulePage",
    setup() {
      return () =>
        h("article", { class: "std-page std-page--rule", "data-area": area.key }, [
          pageHeader(ctx, `规范 / ${area.group_title_zh} / ${area.title_zh}`),
          ruleSection(rule, ctx, icons, { headingLevel: 1 }),
          h("p", { class: "std-edit" }, [
            "同领域的其他规则见 ",
            h("a", { href: storyHref(area.storybook.id), target: "_top" }, `${area.title_zh}概览`),
            "。",
          ]),
        ]);
    },
  });
}

/** 总览页：规范是什么、当前状态、怎么改、各领域入口。 */
export function overviewPage(ctx: StdContext, areas: readonly StdOverviewArea[]): Component {
  return defineComponent({
    name: "StdOverviewPage",
    setup() {
      return () => {
        const groups = new Map<string, StdOverviewArea[]>();
        for (const area of areas) {
          const list = groups.get(area.group_title_zh) ?? [];
          list.push(area);
          groups.set(area.group_title_zh, list);
        }
        const total = areas.reduce((sum, area) => sum + area.rules, 0);
        const gate = areas.reduce((sum, area) => sum + area.gate, 0);
        const pending = areas.reduce((sum, area) => sum + area.pending, 0);
        return h("article", { class: "std-page", "data-overview": "true" }, [
          pageHeader(ctx, "规范"),
          h("h1", { class: "std-title-1" }, "前端设计规范"),
          h(
            "p",
            { class: "std-lead" },
            "这里的每一页都是开发必须遵守的规范，不是参考。页面、AI 孪生和 pomaster design show 从同一份规范源生成；机器能查的规则由门禁直接拦截，其余在评审时逐条核对。",
          ),
          h("div", { class: "std-badges" }, [
            badge("surface", `${areas.length} 个领域`),
            badge("surface", `${total} 条规则`),
            badge("gate", `门禁 ${gate}`),
            badge("review", `评审 ${total - gate}`),
            pending > 0 ? badge("pending", `${pending} 个参数待项目决定`) : null,
          ]),
          h("h2", { class: "std-title-2" }, "怎么改规范"),
          h("ol", { class: "std-steps" }, [
            h("li", ["编辑规范源 ", h("code", ctx.edit_file), "：改条文、改数值、补示例。定值要登记出处，没定的写成项目决策位。"]),
            h("li", ["运行 ", h("code", "pomaster design validate"), "：未知键、未登记出处、硬规范原文对不上、示例引用了待定参数，都会一次报全。"]),
            h("li", ["运行 ", h("code", "node packages/studio/run.mjs generate"), "：Storybook 页面和 AI 孪生一起更新。孪生不新鲜时 CI 会失败。"]),
          ]),
          h("h2", { class: "std-title-2" }, "怎么读标记"),
          h("dl", { class: "std-legend" }, [
            h("dt", badge("gate", "机器门禁")),
            h("dd", "门禁扫描代码，违反即拦截。检查编号写在旁边；检查还没接入时先按评审执行。"),
            h("dt", badge("review", "人工评审")),
            h("dd", "机器查不出来的规则，提交评审时逐条核对。"),
            h("dt", badge("pending", "待项目决定")),
            h("dd", "框架不替项目选的值。项目定了以后写进规范源，页面随之更新。"),
          ]),
          ...[...groups.entries()].flatMap(([groupTitle, list]) => [
            h("h2", { class: "std-title-2" }, groupTitle),
            h(
              "ul",
              { class: "std-area-list" },
              list.map((area) =>
                h("li", { "data-area-link": area.key }, [
                  h("a", { href: storyHref(area.storybook_id), target: "_top" }, area.title_zh),
                  h("span", { class: "std-muted" }, `${area.rules} 条，门禁 ${area.gate}${area.pending > 0 ? `，${area.pending} 个参数待定` : ""}`),
                  h("p", { class: "std-prose" }, area.summary_zh),
                ]),
              ),
            ),
          ]),
          h("footer", { class: "std-footer" }, [
            "规范指纹 ",
            h("code", ctx.fingerprint),
            "。AI 读 ",
            ...ctx.twin_files.flatMap((file, index) => [index > 0 ? "、" : "", h("code", file)]),
            "，或运行 ",
            h("code", "pomaster design show --json"),
            "。",
          ]),
        ]);
      };
    },
  });
}
