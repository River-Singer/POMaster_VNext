// Storybook React sidecar 主配置（S2 · @storybook/react-vite 10.6，与 Vue 主实例
// 同一 10.6 版本线；版本锚定 ^10.6.0 显式 pin——11.0.0-alpha 已进 next tag，禁漂移）。
//
// stories 面：generated/（对齐族 story 生成产物）+ src/pages/（手写页：总览 +
// geist 诚实说明页）。
// 遥测：core.disableTelemetry 声明层双保险；boot 事件由 run.mjs 前置的
// STORYBOOK_DISABLE_TELEMETRY 环境变量拦截。
// docgen: false（与主实例同裁定：画廊不依赖 Controls 推断，换构建性能）。
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: { docgen: false },
  },
  stories: [
    "../src/pages/**/*.mdx",
    "../generated/**/*.stories.tsx",
  ],
  addons: ["@storybook/addon-docs"],
  core: {
    disableTelemetry: true,
  },
};

export default config;
