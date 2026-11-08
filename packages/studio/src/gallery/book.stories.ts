import type { Meta, StoryObj } from "@storybook/vue3";
import { BookOutlined, CarOutlined, SafetyCertificateOutlined } from "@ant-design/icons-vue";
import { PmBook } from "../components/book";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/Book 书封",
  parameters: describe("文档、指南、手册的封面卡片：整张是指向那份文档的链接，书脊阴影 + 标题 + 图标，悬停轻微翻开（减少动效时不动）；底色取品牌色 / 功能色 token。ant-design-vue 没有这个组件（Geist 有 Book）。源码 src/components/book.ts。", "book"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmBook, BookOutlined, CarOutlined, SafetyCertificateOutlined },
    setup: () => ({ DEMO_STYLE }),
    template: `
      <div :style="DEMO_STYLE + ';gap:24px'">
        <PmBook title="司机上岗手册" href="#driver-handbook"><template #icon><CarOutlined /></template></PmBook>
        <PmBook title="冷链运输规范" href="#cold-chain" tone="primary"><template #icon><SafetyCertificateOutlined /></template></PmBook>
        <PmBook title="调度员入门" href="#dispatcher" tone="success" :width="128"><template #icon><BookOutlined /></template></PmBook>
      </div>`,
  }),
};
