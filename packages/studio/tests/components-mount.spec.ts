// @vitest-environment happy-dom
// 71 组件族真实挂载测试（审计 N4 核心交付）。
//
// 裁定：逐族挂载「生成的 story 的真实渲染体」（render() 产物 + antdv 全局插件，
// 与 .storybook/preview.ts 的 setup(app => app.use(Antd)) 同构），断言挂载不抛错 +
// 关键 DOM 存在（选择器与最小计数由 family-examples.mjs 配置表声明，单一事实源）。
// 「导出清单遍历」不再冒充可挂载——审计实测 Menu 裸挂 MenuItem 崩溃
//（Cannot destructure property 'prefixCls'）、Tabs 空 tablist，本测试逐族钉死。
//
// 落位取舍：挂载测试放在 studio 包内（packages/studio/tests/），由 root vitest
// 收口（根配置 include packages/**/*.spec.ts 已覆盖，per-file docblock 切换
// happy-dom 环境）。@vue/test-utils / happy-dom / vue / ant-design-vue 全部是
// studio 包 devDependencies——pnpm 隔离保持单 vue 实例（peer 解析同源），
// 根 package.json 零改动；happy-dom 经 pnpm 默认 hoist（node_modules/.pnpm/
// node_modules）对 vitest 的环境加载器可见。
import { beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { VueWrapper } from "@vue/test-utils";
import { join } from "node:path";
import Antd from "ant-design-vue";
import { generateComponentStories } from "../scripts/lib/components.mjs";
import { STUDIO_ROOT } from "../scripts/lib/common.mjs";
import { FAMILY_EXAMPLES } from "../scripts/lib/family-examples.mjs";
import type { FamilyExampleEntry } from "../scripts/lib/family-examples";

// 路径纪律：happy-dom 环境的 URL 全局是 happy-dom 实现（pathname 丢盘符）——
// 禁用 new URL(...).pathname 推导 fs 路径；从 common.mjs 的 STUDIO_ROOT（fileURLToPath
// 在 common.mjs 模块初始化时计算，双环境实证可用）派生 canonical 产物目录。
const GENERATED_COMPONENTS_DIR = join(STUDIO_ROOT, "generated", "components");

interface StoryModule {
  Default: { render: () => Record<string, unknown> };
}

/** 生成（幂等，canonical 目录即 dev/build 同源）→ 逐 story 文件动态导入 → 真实挂载。 */
async function mountFamilyStory(primary: string): Promise<VueWrapper> {
  const storyModule = (await import(
    `../generated/components/${primary}.stories.ts`
  )) as StoryModule;
  const options = storyModule.Default.render();
  return mount(options, {
    global: { plugins: [Antd] },
    attachTo: document.body,
  });
}

function keyDomHits(wrapper: VueWrapper, entry: FamilyExampleEntry): number {
  const scope: ParentNode = entry.portal ? document.body : wrapper.element;
  return scope.querySelectorAll(entry.keyDom).length;
}

// 生成一次（模块收集期；canonical 产物目录即 dev/build 同源，幂等可重放）。
const families: Array<{ primary: string; secondary: string[] }> =
  generateComponentStories(GENERATED_COMPONENTS_DIR).families;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("studio 71 组件族真实挂载（audit N4）", () => {
  it("配置表与 components.js 解析面一一对应（无缺条/多条）", () => {
    expect(families.length).toBe(71);
    const primaries = families.map((family) => family.primary);
    for (const primary of primaries) {
      expect(FAMILY_EXAMPLES.has(primary), `配置表缺 ${primary} 条目`).toBe(true);
    }
    expect(FAMILY_EXAMPLES.size).toBe(primaries.length);
    const kinds = { curated: 0, default: 0, service: 0, utility: 0 };
    for (const entry of FAMILY_EXAMPLES.values()) kinds[entry.kind] += 1;
    expect(kinds).toEqual({ curated: 56, default: 12, service: 2, utility: 1 });
  });

  for (const expected of [
    "Affix", "Anchor", "AutoComplete", "Alert", "Avatar", "Badge", "Breadcrumb", "Button",
    "Calendar", "Card", "Collapse", "Carousel", "Cascader", "Checkbox", "Col", "Comment",
    "ConfigProvider", "DatePicker", "Descriptions", "Divider", "Dropdown", "Drawer", "Empty",
    "FloatButton", "Form", "Grid", "Input", "Image", "InputNumber", "Layout", "List",
    "message", "Menu", "Mentions", "Modal", "Statistic", "notification", "PageHeader",
    "Pagination", "Popconfirm", "Popover", "Progress", "Radio", "Rate", "Result", "Row",
    "Select", "Skeleton", "Slider", "Space", "Spin", "Steps", "Switch", "Table", "Transfer",
    "Tree", "TreeSelect", "Tabs", "Tag", "TimePicker", "Timeline", "Tooltip", "Typography",
    "Upload", "LocaleProvider", "Watermark", "Segmented", "QRCode", "Tour", "App", "Flex",
  ]) {
    it(`${expected}：挂载不抛错且关键 DOM 在座`, async () => {
      const family = families.find((candidate) => candidate.primary === expected);
      expect(family, `components.js 解析面缺 ${expected}`).toBeDefined();
      const entry = FAMILY_EXAMPLES.get(expected);
      expect(entry, `family-examples.mjs 缺 ${expected} 条目`).toBeDefined();

      const wrapper = await mountFamilyStory(expected);
      try {
        await flushPromises();
        const hits = keyDomHits(wrapper, entry);
        expect(
          hits,
          `${expected} 关键 DOM（${entry.keyDom}）实际命中 ${hits}；HTML 片段：${wrapper.html().slice(0, 240)}`,
        ).toBeGreaterThanOrEqual(entry.minCount ?? 1);
      } finally {
        wrapper.unmount();
      }
    });
  }

  it("service 族触发按钮真实调用（message 渲染进 portal）", async () => {
    const wrapper = await mountFamilyStory("message");
    try {
      await flushPromises();
      const trigger = wrapper.element.querySelector(".studio-demo-trigger");
      expect(trigger).toBeTruthy();
      (trigger as HTMLElement).click();
      await flushPromises();
      expect(document.body.querySelector(".ant-message")).toBeTruthy();
    } finally {
      wrapper.unmount();
    }
  });
});

describe("审计 N4 症状钉（09-06 浏览器实测复现面）", () => {
  it("Menu：不再 prefixCls 崩溃——role=menu 下产出多个 role=menuitem 节点", async () => {
    const wrapper = await mountFamilyStory("Menu");
    try {
      await flushPromises();
      const menus = wrapper.element.querySelectorAll('[role="menu"]');
      expect(menus.length).toBeGreaterThanOrEqual(2);
      const menuitems = wrapper.element.querySelectorAll(
        '[role="menu"] [role="menuitem"]',
      );
      expect(menuitems.length).toBeGreaterThanOrEqual(4);
      // items 形态 + children 形态（MenuItem/MenuItemGroup/SubMenu/MenuDivider 父内渲染）双轨在座。
      expect(wrapper.html()).toContain('role="menuitem"');
    } finally {
      wrapper.unmount();
    }
  });

  it("Tabs：非空 tablist——role=tablist 下多个 role=tab 节点", async () => {
    const wrapper = await mountFamilyStory("Tabs");
    try {
      await flushPromises();
      const tablist = wrapper.element.querySelector('[role="tablist"]');
      expect(tablist).toBeTruthy();
      const tabs = wrapper.element.querySelectorAll('[role="tablist"] [role="tab"]');
      expect(tabs.length).toBeGreaterThanOrEqual(3);
    } finally {
      wrapper.unmount();
    }
  });
});
