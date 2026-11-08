import type { Meta, StoryObj } from "@storybook/vue3";
import { PmSnippet } from "../components/snippet";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/Snippet 命令片段",
  parameters: describe("要复制去终端执行的命令：行首「$」不进剪贴板，右侧复制按钮；dark 为深色底。ant-design-vue 没有这个组件（Geist 有 Snippet），按 antd 的 token 自建。源码 src/components/snippet.ts。", "snippet"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmSnippet },
    setup: () => ({ DEMO_STYLE, lines: ["pomaster design validate", "node packages/studio/run.mjs generate"] }),
    template: `<div :style="DEMO_STYLE + ';flex-direction:column'"><PmSnippet text="corepack pnpm studio:vue:dev" /><PmSnippet :text="lines" /><PmSnippet text="pomaster doctor --json" dark /></div>`,
  }),
};
