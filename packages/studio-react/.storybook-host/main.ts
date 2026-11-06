// 总 Storybook 主配置：把 Vue · Ant Design 与 React · Geist 两个画廊组合成一个 Storybook（Storybook Composition），
// 侧栏里是两个结构一致的「抽屉」。架构锁定后只留对应的抽屉（规则见 packages/studio/scripts/lib/drawers.mjs）。
//
// 借用 React 画廊（本包）已装好的 Storybook 工具链，自己只有一页说明（host/start.mdx）。
// dev：两个抽屉各自在 6006 / 6007 起服务，总 Storybook 在 6008；静态构建：总 Storybook 在发布位根路径，
// 抽屉在 vue/、react/ 子路径（编排见 scripts/studio.mjs）。
import type { StorybookConfig } from "@storybook/react-vite";
import { drawerRefs } from "../../studio/scripts/lib/drawers.mjs";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  stories: ["../host/*.mdx"],
  addons: ["@storybook/addon-docs"],
  core: {
    disableTelemetry: true,
  },
  refs: (_config, { configType }) => drawerRefs(configType),
  async viteFinal(viteConfig) {
    const base = process.env.STORYBOOK_BASE;
    if (base) viteConfig.base = base;
    return viteConfig;
  },
};

export default config;
