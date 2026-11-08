// @vitest-environment happy-dom
// 「AntDV 组件/自建」页真实挂载：逐页渲染（antdv 全局插件，与 preview.ts 同构），断言有内容、没有 Vue 警告；
// 几个交互（命令面板筛选、选择卡片单选、JSON 折叠、破坏性确认输入）点一遍。
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Story = { render: () => Record<string, unknown> };
const modules = import.meta.glob<Record<string, Story | { title: string }>>("../src/gallery/*.stories.ts", { eager: true });

let warnings: string[] = [];
const mounted: VueWrapper[] = [];

beforeEach(() => {
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(" ");
    if (text.includes("[Vue warn]")) warnings.push(text);
  });
});

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function mountStory(file: string, name = "Default"): VueWrapper {
  const module = modules[file];
  if (module === undefined) throw new Error(`组件页缺席：${file}`);
  const story = module[name] as Story;
  const wrapper = mount(story.render(), { global: { plugins: [Antd] }, attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
}

describe("AntDV 组件/自建 · 挂载", () => {
  it("16 个自建页齐全", () => {
    expect(Object.keys(modules).length).toBe(16);
  });

  for (const file of Object.keys(modules)) {
    it(`${file}：渲染出内容，没有 Vue 警告`, async () => {
      const wrapper = mountStory(file);
      await flushPromises();
      expect(wrapper.element.childElementCount).toBeGreaterThan(0);
      expect(warnings).toEqual([]);
    });
  }

  it("选择卡片：单选组点「加急配送」后它被选中，原选项取消", async () => {
    const wrapper = mountStory("../src/gallery/choicebox.stories.ts");
    const radios = wrapper.findAll('input[type="radio"]');
    expect((radios[0]!.element as HTMLInputElement).checked).toBe(true);
    await radios[1]!.setValue(true);
    expect((wrapper.findAll('input[type="radio"]')[1]!.element as HTMLInputElement).checked).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("JSON 查看器：折叠 data 后显示项数，按钮报告 aria-expanded", async () => {
    const wrapper = mountStory("../src/gallery/json-view.stories.ts");
    const toggle = wrapper.find('button[aria-label="折叠 data"]');
    expect(toggle.attributes("aria-expanded")).toBe("true");
    await toggle.trigger("click");
    expect(wrapper.find('button[aria-label="展开 data"]').attributes("aria-expanded")).toBe("false");
    expect(wrapper.text()).toContain("6 项");
  });

  it("破坏性确认输入：输入对象名称后危险按钮才可用", async () => {
    const wrapper = mountStory("../src/gallery/destructive-input.stories.ts");
    const button = () => wrapper.find("button");
    expect(button().attributes("disabled")).toBeDefined();
    await wrapper.find("input").setValue("浦东车队");
    await flushPromises();
    expect(button().attributes("disabled")).toBeUndefined();
  });

  it("中间省略：长路径保留首尾、全文在 title 里", () => {
    const wrapper = mountStory("../src/gallery/middle-truncate.stories.ts");
    const first = wrapper.find('[data-slot="middle-truncate"]');
    expect(first.attributes("title")).toBe("uploads/2026/11/07/vehicle/沪A·D2391/inspection-report-final-v3.pdf");
    expect(first.text()).toContain("…");
  });
});
