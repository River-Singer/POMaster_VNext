// @vitest-environment happy-dom
// React · Geist 抽屉「规范」分区真实挂载：逐个领域挂载生成的 story（与 Storybook 同一份渲染体），断言整页按骨架
// 排出每一条（已写 / 待补）、每个实时位（示例、演示、对照表的行、实验、状态矩阵的格）都渲染出来，实时内容都包在
// .geist-root 里、没有落进错误边界，待定参数按待定呈现，渲染期间 React 没有报错。实验可以点：筛选进 URL 后
// 刷新能恢复。规范源里的 jsx 写错，这里就会失败。
//
// 生成：tests/vitest-react-generated-setup.mjs 在任何模块 transform 之前无条件重建 generated/standard/。
import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadGeistModel } from "../scripts/lib/standard.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const model = loadGeistModel();

type Story = { render?: (args: Record<string, unknown>) => ReactElement; args?: Record<string, unknown> };
type StoryModule = Record<string, Story | unknown>;

const modules = import.meta.glob<StoryModule>("../generated/standard/*.stories.tsx", { eager: true });

function moduleOf(file: string): StoryModule {
  const module = modules[`../generated/standard/${file}.stories.tsx`];
  if (module === undefined) throw new Error(`规范 story 缺席: ${file}（先跑 node packages/studio-react/run.mjs generate）`);
  return module;
}

function areaFile(area: { key: string }, index: number): string {
  return `${String(index + 1).padStart(3, "0")}-${area.key}`;
}

function areaModule(key: string): { area: any; module: StoryModule } {
  const index = model.areas.findIndex((area: { key: string }) => area.key === key);
  return { area: model.areas[index], module: moduleOf(areaFile(model.areas[index], index)) };
}

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
let errors: string[] = [];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    root.unmount();
    container.remove();
  }
  vi.restoreAllMocks();
});

function mountStory(module: StoryModule, exportName: string, args: Record<string, unknown> = {}): HTMLElement {
  const story = module[exportName] as Story | undefined;
  if (typeof story?.render !== "function") throw new Error(`story 导出缺席: ${exportName}`);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(story.render!({ ...(story.args ?? {}), ...args })));
  mounted.push({ root, container });
  return container;
}

function expected(area: any) {
  let examples = 0;
  let showcases = 0;
  let labs = 0;
  for (const rule of area.rules) {
    examples += rule.examples.filter((example: any) => example.jsx !== null).length;
    for (const block of rule.showcase) {
      if (block.kind === "demo") showcases += 1;
      if (block.kind === "specimen") showcases += block.rows.filter((row: any) => row.sample_zh === null).length;
      if (block.kind === "lab") labs += 1;
    }
  }
  const matrix = area.playground?.matrix ?? null;
  const size = (name: string) => area.playground.props.find((prop: any) => prop.key === name).options.length;
  const cells = matrix === null ? 0 : size(matrix.rows) * size(matrix.columns);
  const pending = area.rules.reduce((sum: number, rule: any) => sum + rule.params.filter((param: any) => param.pending).length, 0);
  return { examples, showcases, labs, cells, pending };
}

function click(root: HTMLElement, text: string, scope?: string): void {
  const container = scope === undefined ? root : (root.querySelector(`[aria-label="${scope}"]`) as HTMLElement);
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (button === undefined) throw new Error(`找不到按钮「${text}」`);
  flushSync(() => button.click());
}

describe("Geist 规范 · 领域页挂载", () => {
  it("生成的 story 文件齐全：总览 + 骨架里的 174 个领域", () => {
    expect(Object.keys(modules).length).toBe(model.areas.length + 1);
    expect(model.areas.length).toBe(174);
  });

  model.areas.forEach((area: any, index: number) => {
    it(`${area.title_zh}（${area.key}）：按骨架排出每一条，每个实时位都渲染，无错误边界、无 React 报错`, () => {
      const root = mountStory(moduleOf(areaFile(area, index)), "Overview");
      expect(root.querySelector(`[data-area="${area.key}"]`)).toBeTruthy();
      expect(root.querySelectorAll("[data-rule]").length).toBe(area.rules.length);
      expect(root.querySelectorAll("[data-rule-todo]").length).toBe(area.covered ? area.topics.filter((topic: any) => !topic.covered).length : 0);
      if (!area.covered) expect(root.querySelector("[data-area-todo]")).toBeTruthy();
      const want = expected(area);
      for (const selector of ["[data-live-example]", "[data-live-showcase]"]) {
        for (const stage of root.querySelectorAll(selector)) {
          const scope = stage.querySelector(":scope > .geist-root");
          expect(scope, selector).toBeTruthy();
          expect(scope!.childElementCount).toBeGreaterThan(0);
        }
      }
      expect(root.querySelectorAll("[data-live-example]").length).toBe(want.examples);
      expect(root.querySelectorAll("[data-live-showcase]").length).toBe(want.showcases);
      expect(root.querySelectorAll("[data-lab-view]").length).toBe(want.labs);
      expect(root.querySelectorAll("[data-matrix-cell] .geist-root").length).toBe(want.cells);
      expect(root.querySelectorAll(".std-example-error").length).toBe(0);
      expect(root.querySelectorAll('[data-param][data-pending="true"]').length).toBe(want.pending);
      expect(root.textContent).toContain(area.summary_zh);
      expect(errors).toEqual([]);
    });
  });

  it("图标示例：lucide 图标渲染成 svg，纯图标按钮带 aria-label、没有可见文字", () => {
    const { module } = areaModule("icons");
    const root = mountStory(module, "Overview");
    const iconButton = root.querySelector('.geist-root button[aria-label="刷新部署列表"]');
    expect(iconButton).toBeTruthy();
    expect(iconButton!.querySelector("svg")).toBeTruthy();
    expect(iconButton!.textContent).toBe("");
  });

  it("参数进实时示例：栅格示例按 p.desktop 列、长文占 p.prose_span 的上限", () => {
    const { module } = areaModule("grid");
    const root = mountStory(module, "Overview");
    const grid = root.querySelector(".geist-root > .grid") as HTMLElement | null;
    expect(grid).toBeTruthy();
    expect(grid!.textContent).toContain("长文 · 7 列");
    expect(grid!.textContent).toContain("侧栏 · 5 列");
  });
});

describe("Geist 规范 · 组件页：实验场与状态矩阵", () => {
  it("状态矩阵：variant × size 每一格一个按钮，文字取实验场的文字", () => {
    const { area, module } = areaModule("button");
    const root = mountStory(module, "Matrix");
    const cells = [...root.querySelectorAll("[data-matrix-cell]")];
    expect(cells.length).toBe(20);
    for (const cell of cells) expect(cell.querySelector("button")?.textContent).toBe(area.playground.text_zh);
    expect(errors).toEqual([]);
  });

  it("实验场：缺省属性来自规范，改控件取值组件随之变化；loading 时按钮报告忙碌", () => {
    const { module } = areaModule("button");
    const story = module["Playground"] as { args: Record<string, unknown>; argTypes: Record<string, { options?: string[] }> };
    expect(story.args).toEqual({ variant: "default", size: "medium", shape: "square", loading: false, disabled: false });
    expect(story.argTypes["variant"]!.options).toEqual(["default", "secondary", "tertiary", "error", "warning"]);
    const root = mountStory(module, "Playground", { variant: "error", loading: true });
    const button = root.querySelector(".std-playground button")!;
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.className).toContain("bg-ds-red-700");
    expect(errors).toEqual([]);
  });
});

describe("Geist 规范 · 实验可以点", () => {
  it("筛选进 URL：改筛选与页码后地址栏同步，「刷新页面」后从 URL 恢复", () => {
    const { module } = areaModule("state");
    const root = mountStory(module, "Overview");
    const lab = root.querySelector('[data-lab-view="state.url-filters"]') as HTMLElement;
    click(lab, "待处理", "状态筛选");
    click(lab, "下一页");
    expect(lab.querySelector("[data-lab-address]")!.textContent).toContain("/tasks?status=todo&page=2");
    click(lab, "刷新页面");
    const state = lab.querySelector(".std-lab-state")!.textContent!;
    expect(state).toContain('"status": "todo"');
    expect(state).toContain('"page": 2');
    expect(errors).toEqual([]);
  });
});

describe("Geist 规范 · 单条规则深链与总览", () => {
  it("每条规则的深链 story 只渲染这一条规则", () => {
    model.areas.forEach((area: any, index: number) => {
      if (!area.covered) return;
      const module = moduleOf(areaFile(area, index));
      for (const rule of area.rules) {
        const root = mountStory(module, rule.storybook.export);
        const rules = [...root.querySelectorAll("[data-rule]")].map((node) => node.getAttribute("data-rule"));
        expect(rules).toEqual([rule.id]);
      }
    });
    expect(errors).toEqual([]);
  });

  it("总览列出骨架里的全部领域（含待补），带规范指纹与 Geist 的修改步骤", () => {
    const root = mountStory(moduleOf("000-overview"), "Overview");
    expect(root.querySelectorAll("[data-area-link]").length).toBe(model.areas.length);
    expect(root.textContent).toContain(model.fingerprint);
    expect(root.textContent).toContain("pomaster design validate --system geist");
    expect(root.textContent).toContain("node packages/studio-react/run.mjs generate");
    expect(errors).toEqual([]);
  });
});
