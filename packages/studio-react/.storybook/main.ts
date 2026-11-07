// React · Geist 抽屉的 Storybook 主配置（@storybook/react-vite 10.6，与 Vue 画廊同一 10.6 版本线；
// 版本锚定 ^10.6.0 显式 pin——11.0.0-alpha 已进 next tag，禁漂移）。
//
// stories 面：generated/standard/（「规范」分区，生成产物）+ src/gallery/（「Geist 组件」分区：项目里每个
// shadcn 组件一页，手写）+ src/pages/（手写说明页）。
// Tailwind CSS 4：经 @tailwindcss/vite 编译 preview.css（层序见 preview.css 头注）。
// 遥测：core.disableTelemetry 声明层双保险；boot 事件由 run.mjs 前置的
// STORYBOOK_DISABLE_TELEMETRY 环境变量拦截。
// docgen: false（与主实例同裁定：画廊不依赖 Controls 推断，换构建性能）。
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: { docgen: false },
  },
  stories: [
    "../src/pages/**/*.mdx",
    "../src/gallery/**/*.stories.tsx",
    "../generated/standard/**/*.stories.tsx",
  ],
  addons: ["@storybook/addon-docs"],
  core: {
    disableTelemetry: true,
  },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    // 静态发布在子路径（总 Storybook 的 react/）时由 STORYBOOK_BASE 注入 vite base，与 Vue 画廊同款。
    ...(process.env.STORYBOOK_BASE ? { base: process.env.STORYBOOK_BASE } : {}),
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
  }),
};

export default config;
