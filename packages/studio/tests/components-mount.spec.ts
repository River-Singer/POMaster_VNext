// @vitest-environment happy-dom
// 71 组件族真实挂载测试（审计 N4 核心交付 + S1 交互态矩阵逐态断言）。
//
// 裁定：逐族逐态挂载「生成的 story 的真实渲染体」（render() 产物 + antdv 全局插件，
// 与 .storybook/preview.ts 的 setup(app => app.use(Antd)) 同构），断言挂载不抛错 +
// 关键 DOM 存在（选择器与最小计数由 family-examples.mjs 配置表声明，单一事实源；
// state 级声明缺省回落族级值）。「导出清单遍历」不再冒充可挂载——审计实测 Menu 裸挂
// MenuItem 崩溃（Cannot destructure property 'prefixCls'）、Tabs 空 tablist，本测试逐族钉死。
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
import {
  countAllStories,
  familyStates,
  generateComponentStories,
} from "../scripts/lib/components.mjs";
import { STUDIO_ROOT } from "../scripts/lib/common.mjs";
import { FAMILY_EXAMPLES } from "../scripts/lib/family-examples.mjs";
import type { FamilyExampleEntry } from "../scripts/lib/family-examples";

// 路径纪律：happy-dom 环境的 URL 全局是 happy-dom 实现（pathname 丢盘符）——
// 禁用 new URL(...).pathname 推导 fs 路径；从 common.mjs 的 STUDIO_ROOT（fileURLToPath
// 在 common.mjs 模块初始化时计算，双环境实证可用）派生 canonical 产物目录。
const GENERATED_COMPONENTS_DIR = join(STUDIO_ROOT, "generated", "components");

interface StoryModule {
  Default: { render: () => Record<string, unknown> };
  [storyExport: string]: { render?: () => Record<string, unknown> } | unknown;
}

/** 生成（幂等，canonical 目录即 dev/build 同源）→ 逐 story 文件动态导入 → 真实挂载。
 *  storyExport 缺省 "Default"；states 逐态传具名导出（S1 交互态矩阵）。 */
async function mountFamilyStory(primary: string, storyExport = "Default"): Promise<VueWrapper> {
  const storyModule = (await import(
    `../generated/components/${primary}.stories.ts`
  )) as unknown as StoryModule;
  const story = storyModule[storyExport] as { render: () => Record<string, unknown> };
  if (typeof story?.render !== "function") {
    throw new Error(`story 导出缺席: ${primary}/${storyExport}`);
  }
  const options = story.render();
  return mount(options, {
    global: { plugins: [Antd] },
    attachTo: document.body,
  });
}

interface KeyDomSpec {
  keyDom: string;
  minCount?: number;
  portal?: boolean;
}

function keyDomHits(wrapper: VueWrapper, spec: KeyDomSpec): number {
  const scope: ParentNode = spec.portal ? document.body : wrapper.element;
  return scope.querySelectorAll(spec.keyDom).length;
}

// 生成一次（模块收集期；canonical 产物目录即 dev/build 同源，幂等可重放）。
const families: Array<{ primary: string; secondary: string[] }> =
  generateComponentStories(GENERATED_COMPONENTS_DIR).families;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("studio 71 组件族真实挂载（audit N4 + S1 态矩阵）", () => {
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
    // S1 分母钉：story 总导出数（Default + 全部交互态）。
    expect(countAllStories(families)).toBe(178);
    // service 族不产 states（服务式 API 无组件交互态——缺席诚实）。
    for (const primary of ["message", "notification"]) {
      expect(FAMILY_EXAMPLES.get(primary)?.states ?? []).toEqual([]);
    }
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
        const hits = keyDomHits(wrapper, entry as FamilyExampleEntry);
        expect(
          hits,
          `${expected} 关键 DOM（${entry?.keyDom}）实际命中 ${hits}；HTML 片段：${wrapper.html().slice(0, 240)}`,
        ).toBeGreaterThanOrEqual(entry?.minCount ?? 1);
      } finally {
        wrapper.unmount();
      }
    });

    // S1 交互态矩阵：每态一个具名 story 导出，逐态挂载不抛错 + 关键 DOM 在座。
    for (const state of familyStates({ primary: expected, secondary: [] })) {
      it(`${expected}/${state.name}：态挂载不抛错且关键 DOM 在座`, async () => {
        const wrapper = await mountFamilyStory(expected, state.name);
        try {
          await flushPromises();
          const spec: KeyDomSpec = {
            keyDom: state.keyDom ?? (FAMILY_EXAMPLES.get(expected) as FamilyExampleEntry).keyDom,
            minCount: state.minCount ?? 1,
            portal: state.portal ?? (FAMILY_EXAMPLES.get(expected) as FamilyExampleEntry).portal,
          };
          const hits = keyDomHits(wrapper, spec);
          expect(
            hits,
            `${expected}/${state.name} 关键 DOM（${spec.keyDom}）实际命中 ${hits}；HTML 片段：${wrapper.html().slice(0, 240)}`,
          ).toBeGreaterThanOrEqual(spec.minCount ?? 1);
        } finally {
          wrapper.unmount();
        }
      });
    }
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
