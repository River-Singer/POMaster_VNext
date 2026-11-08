import type { Meta, StoryObj } from "@storybook/vue3";
import { PmMiddleTruncate } from "../components/middle-truncate";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/MiddleTruncate 中间省略",
  parameters: describe("长路径、哈希、文件名保留开头和结尾、省略中间；全文在 title 与读屏文字里，复制时拿到全文。antdv Typography 的 ellipsis 只能省略结尾（Geist 有 Middle Truncate）。源码 src/components/middle-truncate.ts。", "middle_truncate"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmMiddleTruncate },
    setup: () => ({ DEMO_STYLE }),
    template: `<div :style="DEMO_STYLE + ';flex-direction:column;font-family:monospace'"><PmMiddleTruncate text="uploads/2026/11/07/vehicle/沪A·D2391/inspection-report-final-v3.pdf" :max="36" :tail="18" /><PmMiddleTruncate text="sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" :max="24" /><PmMiddleTruncate text="短文本不省略" /></div>`,
  }),
};
