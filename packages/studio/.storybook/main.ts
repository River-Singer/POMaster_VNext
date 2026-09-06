// Storybook 主配置（G-A canonical 实例 · @storybook/vue3-vite 10.6）。
//
// stories 面：generated/（生成器产物——41 archetype MDX + 71 antdv story +
// 18 overlay MDX + baseline 导航）+ src/pages/（手写边界页：总览/geist/CSS 体系）。
// 版本锚定：`^10.6.0` 显式 pin（research 警告 11.0.0-alpha 已进 next tag——禁漂移）。
// 遥测：core.disableTelemetry 是声明层双保险；boot 事件须由 run.mjs 前置的
// STORYBOOK_DISABLE_TELEMETRY 环境变量拦截（官方原文，研究 §4）。
// docgen: false（research §3：antdv 是编译后 JS + .d.ts，自动 docgen 收益有限；
// vue-docgen-api 自 10.6 起弃用——画廊不依赖 Controls 推断，换构建性能）。
import type { StorybookConfig } from "@storybook/vue3-vite";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/vue3-vite",
    options: { docgen: false },
  },
  stories: [
    "../src/pages/**/*.mdx",
    "../generated/**/*.mdx",
    "../generated/**/*.stories.ts",
  ],
  addons: ["@storybook/addon-docs"],
  core: {
    disableTelemetry: true,
  },
};

export default config;
