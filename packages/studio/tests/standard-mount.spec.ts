// @vitest-environment happy-dom
// Vue · Ant Design 抽屉「规范」分区真实挂载：逐个领域挂载生成的 story（与 Storybook 同一份渲染体 + antdv 全局插件），
// 断言整页按骨架排出每一条（已写 / 待补）、每个实时位（示例、演示、对照表的行、实验、状态矩阵的格）都渲染出来，
// 实时内容都包在 .antd-live 里、没有落进错误边界，模板里的组件（含图标）全部解析成功，待定参数按待定呈现。
// 实验可以点：筛选进 URL 后刷新能恢复。规范源里的模板写错，这里就会失败。
//
// 生成：tests/vitest-global-setup.mjs 在任何模块 transform 之前无条件重建 generated/standard/。
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { loadStandardModel } from "../scripts/lib/standard.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
const model = loadStandardModel();

interface Story {
  render?: (args: Record<string, unknown>) => Record<string, unknown>;
  args?: Record<string, unknown>;
}
type StoryModule = Record<string, Story | unknown>;

function areaFile(area: { key: string }, index: number): string {
  return `${String(index + 1).padStart(3, "0")}-${area.key}`;
}

async function loadStory(file: string): Promise<StoryModule> {
  return (await import(`../generated/standard/${file}.stories.ts`)) as StoryModule;
}

async function areaModule(key: string): Promise<{ area: any; module: StoryModule }> {
  const index = model.areas.findIndex((area: { key: string }) => area.key === key);
  return { area: model.areas[index], module: await loadStory(areaFile(model.areas[index], index)) };
}

function mountStory(module: StoryModule, exportName: string, warnings: string[], args: Record<string, unknown> = {}) {
  const story = module[exportName] as Story | undefined;
  if (typeof story?.render !== "function") throw new Error(`story 导出缺席: ${exportName}`);
  return mount(story.render({ ...(story.args ?? {}), ...args }), {
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

/** 挂载容器（页面根元素自身带 data-area，从容器往下查——querySelector 不含自身）。 */
function rootOf(wrapper: { element: Element }): HTMLElement {
  return (wrapper.element.parentElement ?? wrapper.element) as HTMLElement;
}

function expected(area: any) {
  let examples = 0;
  let showcases = 0;
  let labs = 0;
  for (const rule of area.rules) {
    examples += rule.examples.filter((example: any) => example.template !== null).length;
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

describe("规范分区 · 领域页挂载", () => {
  model.areas.forEach((area: any, index: number) => {
    it(`${area.title_zh}（${area.key}）：按骨架排出每一条，每个实时位都渲染，无错误边界、无未解析组件`, async () => {
      const module = await loadStory(areaFile(area, index));
      const warnings: string[] = [];
      const wrapper = mountStory(module, "Overview", warnings);
      try {
        const root = rootOf(wrapper);
        expect(root.querySelector(`[data-area="${area.key}"]`)).toBeTruthy();
        expect(root.querySelectorAll("[data-rule]").length).toBe(area.rules.length);
        expect(root.querySelectorAll("[data-rule-todo]").length).toBe(area.covered ? area.topics.filter((topic: any) => !topic.covered).length : 0);
        if (!area.covered) expect(root.querySelector("[data-area-todo]")).toBeTruthy();
        const want = expected(area);
        for (const selector of ["[data-live-example]", "[data-live-showcase]"]) {
          for (const stage of root.querySelectorAll(selector)) {
            const scope = stage.querySelector(":scope > .antd-live");
            expect(scope, selector).toBeTruthy();
            expect(scope!.childElementCount).toBeGreaterThan(0);
          }
        }
        expect(root.querySelectorAll("[data-live-example]").length).toBe(want.examples);
        expect(root.querySelectorAll("[data-live-showcase]").length).toBe(want.showcases);
        expect(root.querySelectorAll("[data-lab-view]").length).toBe(want.labs);
        expect(root.querySelectorAll("[data-matrix-cell] .antd-live").length).toBe(want.cells);
        expect(root.querySelectorAll(".std-example-error").length).toBe(0);
        expect(root.querySelectorAll('[data-param][data-pending="true"]').length).toBe(want.pending);
        expect(wrapper.text()).toContain(area.summary_zh);
        expect(wrapper.text()).not.toContain("NON-AUTHORITATIVE");
        expect(blocking(warnings)).toEqual([]);
      } finally {
        wrapper.unmount();
      }
    });
  });
});

describe("规范分区 · 组件页：实验场与状态矩阵", () => {
  it("状态矩阵：type × size 每一格一个 antd 按钮，文字取实验场的文字", async () => {
    const { area, module } = await areaModule("button");
    const warnings: string[] = [];
    const wrapper = mountStory(module, "Matrix", warnings);
    try {
      const cells = [...rootOf(wrapper).querySelectorAll("[data-matrix-cell]")];
      expect(cells.length).toBe(15);
      for (const cell of cells) {
        const button = cell.querySelector("button.ant-btn");
        expect(button).toBeTruthy();
        expect(button!.textContent!.replace(/\s/g, "")).toBe(area.playground.text_zh);
      }
      expect(blocking(warnings)).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });

  it("实验场：缺省属性来自规范，控件取值只列规范允许的；改取值组件随之变化", async () => {
    const { module } = await areaModule("button");
    const story = module["Playground"] as { args: Record<string, unknown>; argTypes: Record<string, { options?: string[] }> };
    expect(story.args).toEqual({ type: "primary", size: "middle", shape: "default", danger: false, ghost: false, loading: false, disabled: false, block: false });
    expect(story.argTypes["type"]!.options).toEqual(["primary", "default", "dashed", "text", "link"]);
    const warnings: string[] = [];
    const wrapper = mountStory(module, "Playground", warnings, { danger: true, size: "small" });
    try {
      const button = rootOf(wrapper).querySelector(".std-playground button.ant-btn")!;
      expect(button.className).toContain("ant-btn-dangerous");
      expect(button.className).toContain("ant-btn-sm");
      expect(blocking(warnings)).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });
});

describe("规范分区 · 实验可以点", () => {
  it("筛选进 URL：改筛选与页码后地址栏同步，「刷新页面」后从 URL 恢复", async () => {
    const { module } = await areaModule("state");
    const warnings: string[] = [];
    const wrapper = mountStory(module, "Overview", warnings);
    try {
      const lab = () => wrapper.find('[data-lab-view="state.url-filters"]');
      const press = async (text: string, scope?: string) => {
        const container = scope === undefined ? lab() : lab().find(`[aria-label="${scope}"]`);
        const button = container.findAll("button").find((item) => item.text() === text);
        if (button === undefined) throw new Error(`找不到按钮「${text}」`);
        await button.trigger("click");
      };
      await press("待处理", "状态筛选");
      await press("下一页");
      expect(lab().find("[data-lab-address]").text()).toContain("/tasks?status=todo&page=2");
      await press("刷新页面");
      const state = lab().find(".std-lab-state").text();
      expect(state).toContain('"status": "todo"');
      expect(state).toContain('"page": 2');
      expect(blocking(warnings)).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });
});

describe("规范分区 · 单条规则深链与总览", () => {
  it("每条规则的深链 story 只渲染这一条规则", async () => {
    for (const [index, area] of model.areas.entries()) {
      if (!area.covered) continue;
      const module = await loadStory(areaFile(area, index));
      for (const rule of area.rules) {
        const warnings: string[] = [];
        const wrapper = mountStory(module, rule.storybook.export, warnings);
        try {
          const rules = [...rootOf(wrapper).querySelectorAll("[data-rule]")].map((node) => node.getAttribute("data-rule"));
          expect(rules).toEqual([rule.id]);
          expect(blocking(warnings)).toEqual([]);
        } finally {
          wrapper.unmount();
        }
      }
    }
  });

  it("总览列出骨架里的全部领域（含待补），带规范指纹与修改步骤", async () => {
    const module = await loadStory("000-overview");
    const warnings: string[] = [];
    const wrapper = mountStory(module, "Overview", warnings);
    try {
      const root = rootOf(wrapper);
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
