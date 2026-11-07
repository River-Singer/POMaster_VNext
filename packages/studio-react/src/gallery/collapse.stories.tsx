import type { Meta, StoryObj } from "@storybook/react";
import { Collapse, CollapseContent, CollapseItem, CollapseTrigger } from "../components/ui/collapse";
import { Column, describe } from "./frame";

const meta: Meta<typeof Collapse> = {
  title: "Geist 组件/数据展示/Collapse 折叠面板",
  component: Collapse,
  parameters: describe("折叠面板（Radix Accordion）：标题是按钮，aria-expanded 与上下键导航由 Radix 负责；single 一次只开一个，multiple 可同时展开。Geist 有 Collapse。源码 src/components/ui/collapse.tsx。", "collapse"),
};
export default meta;
type Story = StoryObj<typeof Collapse>;

export const Default: Story = {
  name: "手风琴",
  render: () => (
    <Column className="w-full max-w-lg">
      <Collapse type="single" collapsible defaultValue="insurance" className="w-full">
        <CollapseItem value="license">
          <CollapseTrigger>行驶证</CollapseTrigger>
          <CollapseContent>有效期至 2028 年 3 月 14 日。</CollapseContent>
        </CollapseItem>
        <CollapseItem value="insurance">
          <CollapseTrigger>保险</CollapseTrigger>
          <CollapseContent>交强险与商业险均在保，商业险 2027 年 1 月到期。</CollapseContent>
        </CollapseItem>
        <CollapseItem value="inspection">
          <CollapseTrigger>年检</CollapseTrigger>
          <CollapseContent>下次年检 2026 年 11 月 12 日。</CollapseContent>
        </CollapseItem>
      </Collapse>
    </Column>
  ),
};
