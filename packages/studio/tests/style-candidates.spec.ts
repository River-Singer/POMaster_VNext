// @vitest-environment happy-dom
// 样式候选（IN-2b）画廊测试：两套候选 × 三张代表页面真实挂载（antdv 全局插件，与 preview.ts 同构），
// 并与 CLI 的候选目录（单一事实源，纯数据零依赖）跨包对账——id、顺序、覆盖键一致，画廊不自造候选。
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import Antd from "ant-design-vue";
import { afterEach, describe, expect, it } from "vitest";
import { COMPACT_PROFILE, STANDARD_PROFILE, STYLE_THEME_PROFILES } from "../src/gallery/style-candidates/profiles";
import { detailPage, formPage, listPage } from "../src/gallery/style-candidates/representative-pages";
import * as stories from "../src/gallery/style-candidates/style-candidates.stories";
// CLI 侧候选目录（packages/cli/src/style-candidates.ts 零依赖纯数据；vitest 经 .js → .ts 解析直连源码）
import { styleCatalogFor } from "../../cli/src/style-candidates.js";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

async function mountStory(name: string): Promise<VueWrapper> {
  const story = (stories as unknown as Record<string, { render?: () => Record<string, unknown> }>)[name];
  if (typeof story?.render !== "function") throw new Error(`story 导出缺席: ${name}`);
  const wrapper = mount(story.render(), { global: { plugins: [Antd] }, attachTo: document.body });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe("样式候选 · 候选目录与 CLI 对账", () => {
  it("画廊两档与 CLI 目录同 id 同序；三张代表页面一致；compact 的覆盖键与 CLI delta 同值", () => {
    const catalog = styleCatalogFor("antd");
    expect(catalog.candidates.map((candidate) => candidate.id)).toEqual(["standard", "compact"]);
    expect(STYLE_THEME_PROFILES.map((profile) => profile.id)).toEqual(catalog.candidates.map((candidate) => candidate.id));
    expect(catalog.representative_pages.map((page) => page.key)).toEqual(["list", "form", "detail"]);
    expect(STANDARD_PROFILE.theme).toEqual({});
    const theme = COMPACT_PROFILE.theme as { algorithm?: unknown; token?: Record<string, unknown> };
    expect(theme.algorithm).toBeDefined();
    const delta = catalog.candidates.find((candidate) => candidate.id === "compact")?.token_deltas.find((entry) => entry.path === "density.control_height");
    expect(delta?.value).toBe("24");
    expect(theme.token?.controlHeight).toBe(24);
  });
});

describe("样式候选 · 代表页面挂载（两套候选同一组页面）", () => {
  for (const name of ["StandardList", "CompactList"] as const) {
    it(`${name}：筛选 + 表格（≥5 行）+ 行操作 + 状态标签`, async () => {
      const wrapper = await mountStory(name);
      expect(wrapper.element.querySelector('[data-page="style-candidates-list"]')).toBeTruthy();
      expect(wrapper.element.querySelectorAll(".ant-table-row").length).toBeGreaterThanOrEqual(5);
      expect(wrapper.element.querySelectorAll(".ant-tag").length).toBeGreaterThanOrEqual(1);
      expect(wrapper.element.querySelectorAll("button").length).toBeGreaterThanOrEqual(3);
    });
  }

  for (const name of ["StandardForm", "CompactForm"] as const) {
    it(`${name}：分组表单（≥8 个字段行）+ 数字 / 日期 / 级联控件 + 操作区`, async () => {
      const wrapper = await mountStory(name);
      expect(wrapper.element.querySelector('[data-page="style-candidates-form"]')).toBeTruthy();
      expect(wrapper.element.querySelectorAll(".ant-form-item").length).toBeGreaterThanOrEqual(8);
      expect(wrapper.element.querySelectorAll(".ant-input-number").length).toBeGreaterThanOrEqual(1);
      expect(wrapper.element.querySelectorAll(".ant-picker").length).toBeGreaterThanOrEqual(2);
      expect(wrapper.element.querySelectorAll(".ant-cascader").length).toBeGreaterThanOrEqual(1);
      expect(wrapper.element.querySelectorAll(".ant-radio").length).toBeGreaterThanOrEqual(3);
    });
  }

  for (const name of ["StandardDetail", "CompactDetail"] as const) {
    it(`${name}：描述表 + 标签页 + 时间线 + 概况统计`, async () => {
      const wrapper = await mountStory(name);
      expect(wrapper.element.querySelector('[data-page="style-candidates-detail"]')).toBeTruthy();
      expect(wrapper.element.querySelectorAll(".ant-descriptions-item-label").length).toBeGreaterThanOrEqual(5);
      expect(wrapper.element.querySelectorAll(".ant-tabs-tab").length).toBeGreaterThanOrEqual(2);
      expect(wrapper.element.querySelectorAll(".ant-timeline-item").length).toBeGreaterThanOrEqual(2);
      expect(wrapper.element.querySelectorAll(".ant-statistic").length).toBeGreaterThanOrEqual(1);
    });
  }

  it("总览：两套候选各渲染一组控件", async () => {
    const wrapper = await mountStory("Overview");
    expect(wrapper.element.querySelectorAll("h3").length).toBe(2);
    expect(wrapper.element.querySelectorAll(".ant-btn").length).toBeGreaterThanOrEqual(4);
  });
});

describe("样式候选 · 页面工厂（直接挂载，覆盖非 Storybook 消费路径）", () => {
  for (const [label, page] of [["list", listPage], ["form", formPage], ["detail", detailPage]] as const) {
    it(`${label} 页 setup 提供模板所需的全部绑定`, async () => {
      const wrapper = mount(page(), { global: { plugins: [Antd] }, attachTo: document.body });
      mounted.push(wrapper);
      await flushPromises();
      expect(wrapper.element.childElementCount).toBeGreaterThan(0);
      // data-page 可能落在根元素自身（直挂无 ConfigProvider 包裹层），querySelector 只找后代
      const pageEl = wrapper.element.matches("[data-page]") ? wrapper.element : wrapper.element.querySelector("[data-page]");
      expect(pageEl).toBeTruthy();
    });
  }
});
