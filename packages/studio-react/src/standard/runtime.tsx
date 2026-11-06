// 规范页运行时（React · Geist 抽屉）。
//
// 页面结构不在这里：packages/studio/src/standard/page.ts 构建与框架无关的节点树（两个抽屉共用），本模块只做两件事——
//   1. 把节点树渲染成 React 元素（toReact）；
//   2. 把实时位换成 Geist 组件：规范源里的 JSX 由生成器预编译成组件（live 映射），实验（labs.ts）由一个小宿主
//      组件订阅刷新，状态矩阵的每一格由生成器给的 cell 渲染。
// 实时内容包在 .geist-root 里（Geist 主题与局部 preflight 只在这里生效）；外框样式见 standard.css（两个抽屉共用）。
import { Component, Fragment, createElement, useEffect, useMemo, useReducer, type ComponentType, type ReactNode } from "react";
import { createLab } from "../../../studio/src/standard/labs";
import {
  areaPage,
  isElement,
  isLive,
  matrixPage,
  overviewPage,
  parseLiveKey,
  rulePage,
  type StdArea,
  type StdContext,
  type StdNode,
  type StdOverviewArea,
  type StdPlayground,
  type StdRule,
} from "../../../studio/src/standard/page";

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
} from "../../../studio/src/standard/page";
export { formatParamValue, paramValues } from "../../../studio/src/standard/page";

/** 实时位键 → 生成器预编译的组件。 */
export type StdLiveMap = Readonly<Record<string, ComponentType>>;
/** 状态矩阵的一格：给定属性取值，渲染实验场组件。 */
export type StdCell = (values: Record<string, string | boolean>) => ReactNode;

type LiveResolver = (key: string) => ReactNode;

const ATTR_ALIASES: Readonly<Record<string, string>> = { class: "className", for: "htmlFor", colspan: "colSpan", rowspan: "rowSpan", tabindex: "tabIndex" };

function propName(key: string): string {
  const alias = ATTR_ALIASES[key];
  if (alias !== undefined) return alias;
  if (key.startsWith("data-") || key.startsWith("aria-") || !key.includes("-")) return key;
  return key.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/** 节点树 → React 元素。onInput 处理器收到的是输入框的值（React 里挂在 onChange 上）。 */
export function toReact(node: StdNode, live: LiveResolver, key?: number): ReactNode {
  if (node === null || node === undefined || node === false) return null;
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isLive(node)) return createElement(Fragment, { key }, live(node.live));
  if (!isElement(node)) return null;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.attrs)) {
    if (value === undefined) continue;
    if (name === "onInput" && typeof value === "function") {
      const handler = value as (input: string) => void;
      props["onChange"] = (event: { target: { value: string } }) => handler(event.target.value);
    } else {
      props[propName(name)] = value;
    }
  }
  const children = node.children.map((child, index) => toReact(child, live, index));
  return children.length === 0 ? createElement(node.tag, props) : createElement(node.tag, props, ...children);
}

/** 实时内容的错误边界：一处示例渲染失败只在那一处报错，不拖垮整页。 */
class LiveBoundary extends Component<{ readonly children: ReactNode }, { readonly failure: string | null }> {
  override state = { failure: null as string | null };

  static getDerivedStateFromError(error: unknown): { failure: string } {
    return { failure: error instanceof Error ? error.message : String(error) };
  }

  override render(): ReactNode {
    if (this.state.failure !== null) {
      return (
        <div className="std-example-error" role="alert">
          示例渲染失败：{this.state.failure}
        </div>
      );
    }
    return this.props.children;
  }
}

/** 实验宿主：实验状态变了就重绘。 */
export function LabHost({ id }: { readonly id: string }) {
  const lab = useMemo(() => createLab(id), [id]);
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    const off = lab.subscribe(refresh);
    return () => {
      off();
      lab.dispose();
    };
  }, [lab]);
  return <>{toReact(lab.view(), () => null)}</>;
}

/** 实验场组件的缺省属性（状态矩阵里其余属性取这些值）。 */
export function playgroundDefaults(playground: StdPlayground): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const prop of playground.props) out[prop.key] = prop.default;
  return out;
}

function resolver(area: StdArea | null, live: StdLiveMap, cell: StdCell | null): LiveResolver {
  return (key) => {
    const parsed = parseLiveKey(key);
    if (parsed.kind === "lab" && parsed.lab !== null) {
      return (
        <LiveBoundary>
          <LabHost id={parsed.lab} />
        </LiveBoundary>
      );
    }
    let content: ReactNode;
    if (parsed.kind === "cell" && parsed.cell !== null) {
      const playground = area?.playground ?? null;
      if (playground === null || cell === null) return null;
      const matrix = playground.matrix;
      const values = { ...playgroundDefaults(playground), ...(matrix === null ? {} : { [matrix.rows]: parsed.cell.row, [matrix.columns]: parsed.cell.column }) };
      content = cell(values);
    } else {
      const Live = live[key];
      if (Live === undefined) {
        return (
          <div className="std-example-error" role="alert">
            示例缺少 JSX：{key}
          </div>
        );
      }
      content = <Live />;
    }
    return (
      <div className="geist-root">
        <LiveBoundary>{content}</LiveBoundary>
      </div>
    );
  };
}

interface PageProps {
  readonly area: StdArea;
  readonly ctx: StdContext;
  readonly live?: StdLiveMap;
  readonly cell?: StdCell;
}

/** 领域页：页头、全部变体、按骨架顺序的每一条（已写 / 待补）、页脚、本页目录。 */
export function AreaPage({ area, ctx, live = {}, cell }: PageProps) {
  const tree = useMemo(() => areaPage(area, ctx), [area, ctx]);
  return <>{toReact(tree, resolver(area, live, cell ?? null))}</>;
}

/** 单条规则页（深链用）。 */
export function RulePage({ rule, area, ctx, live = {} }: PageProps & { readonly rule: StdRule }) {
  const tree = useMemo(() => rulePage(rule, area, ctx), [rule, area, ctx]);
  return <>{toReact(tree, resolver(area, live, null))}</>;
}

/** 状态矩阵页。 */
export function MatrixPage({ area, ctx, cell }: PageProps) {
  const tree = useMemo(() => matrixPage(area, ctx), [area, ctx]);
  return <>{toReact(tree, resolver(area, {}, cell ?? null))}</>;
}

/** 总览页。 */
export function OverviewPage({ ctx, areas }: { readonly ctx: StdContext; readonly areas: readonly StdOverviewArea[] }) {
  const tree = useMemo(() => overviewPage(ctx, areas), [ctx, areas]);
  return <>{toReact(tree, () => null)}</>;
}

/** 实验场 story 的外框。 */
export function PlaygroundFrame({ area, children }: { readonly area: StdArea; readonly children: ReactNode }) {
  return (
    <div className="std-playground" data-playground={area.key}>
      <div className="geist-root">{children}</div>
    </div>
  );
}

/** 实验场 story 的 args 与 argTypes（Storybook 控件面板；取值只列规范允许的）。 */
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
