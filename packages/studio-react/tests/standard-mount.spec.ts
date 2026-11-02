// @vitest-environment happy-dom
// React 画廊「规范」分区真实挂载（R1 · Geist 预设）：逐个领域挂载生成的 story（与 Storybook 同一份
// 渲染体），断言整页、每条规则、每个实时示例都渲染出来，示例都包在 .geist-root 里、没有落进错误边界，
// 待定参数按待定呈现，渲染期间 React 没有报错。规范源里的 jsx 示例写错，这里就会失败。
//
// 生成：tests/vitest-react-generated-setup.mjs 在任何模块 transform 之前无条件重建 generated/standard/。
import type { ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadGeistModel } from "../scripts/lib/standard.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const model = loadGeistModel();

type StoryModule = Record<string, { render?: () => ReactElement } | unknown>;

const modules = import.meta.glob<StoryModule>("../generated/standard/*.stories.tsx", { eager: true });

function moduleOf(file: string): StoryModule {
  const module = modules[`../generated/standard/${file}.stories.tsx`];
  if (module === undefined) throw new Error(`规范 story 缺席: ${file}（先跑 node packages/studio-react/run.mjs generate）`);
  return module;
}

function areaFile(area: { key: string }, index: number): string {
  return `${String(index + 1).padStart(2, "0")}-${area.key}`;
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

function mountStory(module: StoryModule, exportName: string): HTMLElement {
  const story = module[exportName] as { render?: () => ReactElement } | undefined;
  if (typeof story?.render !== "function") throw new Error(`story 导出缺席: ${exportName}`);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(story.render!()));
  mounted.push({ root, container });
  return container;
}

describe("Geist 规范 · 领域页挂载", () => {
  it("生成的 story 文件齐全：总览 + 8 个领域", () => {
    expect(Object.keys(modules).length).toBe(model.areas.length + 1);
  });

  model.areas.forEach((area: any, index: number) => {
    it(`${area.title_zh}（${area.key}）：整页、每条规则、每个实时示例都渲染，无错误边界、无 React 报错`, () => {
      const root = mountStory(moduleOf(areaFile(area, index)), "Overview");
      expect(root.querySelector(`[data-area="${area.key}"]`)).toBeTruthy();
      expect(root.querySelectorAll("[data-rule]").length).toBe(area.rules.length);
      const liveCount = area.rules.reduce(
        (sum: number, rule: any) => sum + rule.examples.filter((example: any) => example.jsx !== null).length,
        0,
      );
      const stages = [...root.querySelectorAll("[data-live-example]")];
      expect(stages.length).toBe(liveCount);
      for (const stage of stages) {
        const scope = stage.querySelector(":scope > .geist-root");
        expect(scope).toBeTruthy();
        expect(scope!.childElementCount).toBeGreaterThan(0);
      }
      expect(root.querySelectorAll(".std-example-error").length).toBe(0);
      const pending = area.rules.reduce(
        (sum: number, rule: any) => sum + rule.params.filter((param: any) => param.pending).length,
        0,
      );
      expect(root.querySelectorAll('[data-param][data-pending="true"]').length).toBe(pending);
      expect(root.textContent).toContain(area.summary_zh);
      expect(errors).toEqual([]);
    });
  });

  it("图标示例：lucide 图标渲染成 svg，纯图标按钮带 aria-label", () => {
    const index = model.areas.findIndex((area: { key: string }) => area.key === "icons");
    const root = mountStory(moduleOf(areaFile(model.areas[index], index)), "Overview");
    const iconButton = root.querySelector('.geist-root button[aria-label="刷新"]');
    expect(iconButton).toBeTruthy();
    expect(iconButton!.querySelector("svg")).toBeTruthy();
    expect(iconButton!.textContent).toBe("");
    const labelled = [...root.querySelectorAll(".geist-root button")].filter((button) => button.textContent !== "");
    expect(labelled.map((button) => button.textContent)).toEqual(["搜索", "新建项目"]);
    for (const button of labelled) expect(button.querySelector("svg")).toBeTruthy();
  });

  it("参数进实时示例：栅格示例按 p.desktop 列、长文占 p.prose_span 的上限", () => {
    const index = model.areas.findIndex((area: { key: string }) => area.key === "grid");
    const root = mountStory(moduleOf(areaFile(model.areas[index], index)), "Overview");
    const grid = root.querySelector(".geist-root > .grid") as HTMLElement | null;
    expect(grid).toBeTruthy();
    expect(grid!.textContent).toContain("长文 · 7 列");
    expect(grid!.textContent).toContain("侧栏 · 5 列");
  });
});

describe("Geist 规范 · 单条规则深链与总览", () => {
  it("每条规则的深链 story 只渲染这一条规则", () => {
    model.areas.forEach((area: any, index: number) => {
      const module = moduleOf(areaFile(area, index));
      for (const rule of area.rules) {
        const root = mountStory(module, rule.storybook.export);
        const rules = [...root.querySelectorAll("[data-rule]")].map((node) => node.getAttribute("data-rule"));
        expect(rules).toEqual([rule.id]);
      }
    });
    expect(errors).toEqual([]);
  });

  it("总览列出全部领域，带规范指纹与 Geist 的修改步骤", () => {
    const root = mountStory(moduleOf("00-overview"), "Overview");
    expect(root.querySelectorAll("[data-area-link]").length).toBe(model.areas.length);
    expect(root.textContent).toContain(model.fingerprint);
    expect(root.textContent).toContain("pomaster design validate --system geist");
    expect(root.textContent).toContain("node packages/studio-react/run.mjs generate");
    expect(errors).toEqual([]);
  });
});
