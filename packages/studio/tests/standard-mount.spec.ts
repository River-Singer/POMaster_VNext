// @vitest-environment happy-dom
// 规范分区真实挂载（D1a）：逐个领域挂载生成的 story（与 Storybook 同一份渲染体 + antdv 全局插件），
// 断言整页、每条规则、每个实时示例都渲染出来，示例没有落进错误边界，模板里的组件（含图标）
// 全部解析成功，待定参数按待定呈现。规范源里的示例模板写错，这里就会失败。
//
// 生成：tests/vitest-global-setup.mjs 在任何模块 transform 之前无条件重建 generated/standard/。
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { loadStandardModel } from "../scripts/lib/standard.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const model = loadStandardModel();

interface StoryModule {
  [storyExport: string]: { render?: () => Record<string, unknown> } | unknown;
}

function areaFile(area: { key: string }, index: number): string {
  return `${String(index + 1).padStart(2, "0")}-${area.key}`;
}

async function loadStory(file: string): Promise<StoryModule> {
  return (await import(`../generated/standard/${file}.stories.ts`)) as StoryModule;
}

function mountStory(module: StoryModule, exportName: string, warnings: string[]) {
  const story = module[exportName] as { render: () => Record<string, unknown> };
  if (typeof story?.render !== "function") throw new Error(`story 导出缺席: ${exportName}`);
  return mount(story.render(), {
    global: {
      plugins: [Antd],
      config: {
        warnHandler: (message: string) => {
          warnings.push(message);
        },
      },
    },
    attachTo: document.body,
  });
}

/** 只关心规范页自己会犯的错：模板编译失败、组件（含图标）没解析到。antdv 自身的提示不计。 */
function blocking(warnings: readonly string[]): string[] {
  return warnings.filter((message) => /Template compilation error|Failed to resolve component|Unhandled error/.test(message));
}

describe("规范分区 · 领域页挂载", () => {
  model.areas.forEach((area: any, index: number) => {
    it(`${area.title_zh}（${area.key}）：整页、每条规则、每个实时示例都渲染，无错误边界、无未解析组件`, async () => {
      const module = await loadStory(areaFile(area, index));
      const warnings: string[] = [];
      const wrapper = mountStory(module, "Overview", warnings);
      try {
        // 页面根元素自身带 data-area，从挂载容器往下查（querySelector 不含自身）。
        const root = (wrapper.element as HTMLElement).parentElement ?? (wrapper.element as HTMLElement);
        expect(root.querySelector(`[data-area="${area.key}"]`)).toBeTruthy();
        expect(root.querySelectorAll("[data-rule]").length).toBe(area.rules.length);
        const liveCount = area.rules.reduce(
          (sum: number, rule: any) => sum + rule.examples.filter((example: any) => example.template !== null).length,
          0,
        );
        expect(root.querySelectorAll("[data-live-example]").length).toBe(liveCount);
        expect(root.querySelectorAll(".std-example-error").length).toBe(0);
        const pending = area.rules.reduce(
          (sum: number, rule: any) => sum + rule.params.filter((param: any) => param.pending).length,
          0,
        );
        expect(root.querySelectorAll('[data-param][data-pending="true"]').length).toBe(pending);
        expect(wrapper.text()).toContain(area.summary_zh);
        expect(wrapper.text()).not.toContain("NON-AUTHORITATIVE");
        expect(blocking(warnings)).toEqual([]);
      } finally {
        wrapper.unmount();
      }
    });
  });
});

describe("规范分区 · 单条规则深链与总览", () => {
  it("每条规则的深链 story 只渲染这一条规则", async () => {
    for (const [index, area] of model.areas.entries()) {
      const module = await loadStory(areaFile(area, index));
      for (const rule of area.rules) {
        const warnings: string[] = [];
        const wrapper = mountStory(module, rule.storybook.export, warnings);
        try {
          const rules = [...(wrapper.element as HTMLElement).querySelectorAll("[data-rule]")].map((node) => node.getAttribute("data-rule"));
          expect(rules).toEqual([rule.id]);
          expect(blocking(warnings)).toEqual([]);
        } finally {
          wrapper.unmount();
        }
      }
    }
  });

  it("总览列出全部领域，带规范指纹与修改步骤", async () => {
    const module = await loadStory("00-overview");
    const warnings: string[] = [];
    const wrapper = mountStory(module, "Overview", warnings);
    try {
      const root = wrapper.element as HTMLElement;
      expect(root.querySelectorAll("[data-area-link]").length).toBe(model.areas.length);
      expect(wrapper.text()).toContain(model.fingerprint);
      expect(wrapper.text()).toContain("pomaster design validate");
      expect(wrapper.text()).toContain("node packages/studio/run.mjs generate");
      expect(blocking(warnings)).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });
});
