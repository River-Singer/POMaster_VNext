// 规范页运行时（Vue · Ant Design 抽屉）。
//
// 页面结构不在这里：src/standard/page.ts 构建与框架无关的节点树（两个抽屉共用），本模块只做两件事——
//   1. 把节点树渲染成 Vue 元素（toVNode）；
//   2. 把实时位换成 antd 组件：规范源里的 Vue 模板按需编译（`p` 是本条规则已定的参数，`t` 是 token 表，
//      `s` 是这个示例自己的一份可写状态，演示展开收起、切换状态这类交互用），
//      实验（labs.ts）由一个小宿主组件订阅刷新，状态矩阵的每一格渲染实验场组件。
// 样式见 standard.css（外框，两个抽屉共用）与 .storybook/preview.css（实时位里的 antd 语境 .antd-live）。
import { defineComponent, h, onBeforeUnmount, onErrorCaptured, reactive, ref, shallowRef, type Component, type VNode, type VNodeChild } from "vue";
import { LIVE_EXTRAS } from "./live-extras";
import { createLab } from "./labs";
import {
  areaPage as buildAreaPage,
  isElement,
  isLive,
  liveSource,
  matrixPage as buildMatrixPage,
  overviewPage as buildOverviewPage,
  paramValues,
  parseLiveKey,
  rulePage as buildRulePage,
  type StdArea,
  type StdContext,
  type StdNode,
  type StdOverviewArea,
  type StdPlayground,
  type StdRule,
} from "./page";

export type {
  StdArea,
  StdContext,
  StdExample,
  StdOverviewArea,
  StdParam,
  StdPlayground,
  StdRule,
  StdShowcase,
  StdSource,
  StdTopic,
} from "./page";
export { formatParamValue, paramValues } from "./page";

type Icons = Readonly<Record<string, Component>>;
type LiveResolver = (key: string) => VNodeChild;

/** 节点树 → Vue 元素。onInput 处理器收到的是输入框的值。 */
export function toVNode(node: StdNode, live: LiveResolver): VNodeChild {
  if (node === null || node === undefined || node === false) return null;
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isLive(node)) return live(node.live);
  if (!isElement(node)) return null;
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node.attrs)) {
    if (value === undefined || value === false) continue;
    if (key === "onInput" && typeof value === "function") {
      const handler = value as (input: string) => void;
      props["onInput"] = (event: Event) => handler((event.target as HTMLInputElement).value);
    } else {
      props[key] = value;
    }
  }
  return h(node.tag, props, node.children.map((child) => toVNode(child, live)));
}

/** 实时内容的错误边界：一处示例渲染失败只在那一处报错，不拖垮整页。 */
const LiveBoundary = defineComponent({
  name: "StdLiveBoundary",
  setup(_props, { slots }) {
    const failure = ref<string | null>(null);
    onErrorCaptured((error) => {
      failure.value = error instanceof Error ? error.message : String(error);
      return false;
    });
    return () => (failure.value === null ? slots.default?.() : h("div", { class: "std-example-error", role: "alert" }, `示例渲染失败：${failure.value}`));
  },
});

/** 实验宿主：实验状态变了就重绘。 */
export function labComponent(id: string): Component {
  return defineComponent({
    name: "StdLab",
    setup() {
      const lab = createLab(id);
      const version = shallowRef(0);
      const off = lab.subscribe(() => {
        version.value += 1;
      });
      onBeforeUnmount(() => {
        off();
        lab.dispose();
      });
      return () => {
        void version.value;
        return toVNode(lab.view(), () => null);
      };
    },
  });
}

function compiled(template: string, rule: StdRule, ctx: StdContext, icons: Icons): Component {
  const p = paramValues(rule);
  return defineComponent({
    name: "StdLive",
    components: { ...LIVE_EXTRAS, ...icons },
    setup() {
      return { p, t: ctx.tokens, s: reactive<Record<string, unknown>>({}) };
    },
    template,
  });
}

/** 实验场组件的缺省属性（状态矩阵里其余属性取这些值）。 */
export function playgroundDefaults(playground: StdPlayground): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const prop of playground.props) out[prop.key] = prop.default;
  return out;
}

function playgroundComponent(playground: StdPlayground): Component {
  return defineComponent({
    name: "StdPlaygroundItem",
    props: { values: { type: Object, required: true } },
    setup() {
      return { text: playground.text_zh ?? "" };
    },
    template: `<${playground.component} v-bind="values">{{ text }}</${playground.component}>`,
  });
}

function resolver(area: StdArea | null, ctx: StdContext, icons: Icons): LiveResolver {
  const cache = new Map<string, Component>();
  let cell: Component | null = null;
  return (key) => {
    const parsed = parseLiveKey(key);
    let component = cache.get(key);
    if (parsed.kind === "lab" && parsed.lab !== null) {
      component ??= labComponent(parsed.lab);
      cache.set(key, component);
      return h(LiveBoundary, null, { default: () => h(component as Component) });
    }
    if (parsed.kind === "cell" && parsed.cell !== null && area !== null && area.playground !== null) {
      const playground = area.playground;
      cell ??= playgroundComponent(playground);
      const matrix = playground.matrix;
      const values = { ...playgroundDefaults(playground), ...(matrix === null ? {} : { [matrix.rows]: parsed.cell.row, [matrix.columns]: parsed.cell.column }) };
      return h("div", { class: "antd-live" }, [h(LiveBoundary, null, { default: () => h(cell as Component, { values }) })]);
    }
    if (area === null) return null;
    if (component === undefined) {
      const source = liveSource(area, key);
      if (source === null || source.template === null) return h("div", { class: "std-example-error", role: "alert" }, `示例缺少 Vue 模板：${key}`);
      component = compiled(source.template, source.rule, ctx, icons);
      cache.set(key, component);
    }
    return h("div", { class: "antd-live" }, [h(LiveBoundary, null, { default: () => h(component as Component) })]);
  };
}

function page(name: string, build: () => StdNode, area: StdArea | null, ctx: StdContext, icons: Icons): Component {
  return defineComponent({
    name,
    setup() {
      const live = resolver(area, ctx, icons);
      const tree = build();
      return () => toVNode(tree, live) as VNode;
    },
  });
}

/** 领域页：页头、全部变体、按骨架顺序的每一条（已写 / 待补）、页脚、本页目录。 */
export function areaPage(area: StdArea, ctx: StdContext, icons: Icons = {}): Component {
  return page("StdAreaPage", () => buildAreaPage(area, ctx), area, ctx, icons);
}

/** 单条规则页（深链用）。 */
export function rulePage(rule: StdRule, area: StdArea, ctx: StdContext, icons: Icons = {}): Component {
  return page("StdRulePage", () => buildRulePage(rule, area, ctx), area, ctx, icons);
}

/** 状态矩阵页。 */
export function matrixPage(area: StdArea, ctx: StdContext): Component {
  return page("StdMatrixPage", () => buildMatrixPage(area, ctx), area, ctx, {});
}

/** 总览页。 */
export function overviewPage(ctx: StdContext, areas: readonly StdOverviewArea[]): Component {
  return page("StdOverviewPage", () => buildOverviewPage(ctx, areas), null, ctx, {});
}

/** 实验场 story 的渲染：组件 + 控件面板里的属性（取值只列规范允许的）。 */
export function playgroundRender(area: StdArea): (args: Record<string, unknown>) => Component {
  const playground = area.playground;
  if (playground === null) throw new Error(`领域 ${area.key} 没有实验场`);
  const item = playgroundComponent(playground);
  return (args) =>
    defineComponent({
      name: "StdPlayground",
      setup() {
        return () => h("div", { class: "std-playground", "data-playground": area.key }, [h("div", { class: "antd-live" }, [h(item, { values: args })])]);
      },
    });
}

/** 实验场 story 的 args 与 argTypes（Storybook 控件面板）。 */
export function playgroundControls(playground: StdPlayground): {
  args: Record<string, string | boolean>;
  argTypes: Record<string, { control: string; options?: readonly string[]; description: string }>;
} {
  const argTypes: Record<string, { control: string; options?: readonly string[]; description: string }> = {};
  for (const prop of playground.props) {
    argTypes[prop.key] =
      prop.kind === "options"
        ? { control: prop.options.length <= 4 ? "inline-radio" : "select", options: prop.options, description: `规范允许：${prop.options.join(" / ")}` }
        : { control: "boolean", description: "规范允许：开 / 关" };
  }
  return { args: playgroundDefaults(playground), argTypes };
}
