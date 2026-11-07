import type { Meta, StoryObj } from "@storybook/react";
import { Text } from "../components/ui/text";
import { Column, describe } from "./frame";

const meta: Meta<typeof Text> = {
  title: "Geist 组件/通用/Text 排版文本",
  component: Text,
  parameters: describe("文字只经 Geist 的排版类取字号（heading / label / copy），颜色只取语义色调；标题用 asChild 套在 h1–h4 上保持层级；ellipsis 单行省略并把全文放进 title。源码 src/components/ui/text.tsx。", "typography_text"),
  args: { variant: "copy-14", tone: "default", children: "车辆年检将在 7 天后到期" },
  argTypes: {
    variant: { control: "select", options: ["heading-32", "heading-24", "heading-20", "heading-16", "label-14", "label-13", "label-12", "copy-16", "copy-14", "copy-13", "copy-13-mono"] },
    tone: { control: "select", options: ["default", "secondary", "success", "warning", "error"] },
    weight: { control: "select", options: ["regular", "medium", "semibold"] },
  },
};
export default meta;
type Story = StoryObj<typeof Text>;

export const Playground: Story = { name: "实验场", render: (args) => <Column><Text {...args} /></Column> };

export const Scale: Story = {
  name: "字阶与色调",
  render: () => (
    <Column>
      <Text variant="heading-32" asChild><h1>车队概览</h1></Text>
      <Text variant="heading-20" asChild><h2>本周派单</h2></Text>
      <Text variant="label-14">在途车辆</Text>
      <Text variant="copy-14" tone="secondary">数据每 5 分钟刷新一次。</Text>
      <Text variant="copy-13-mono">ORD-20261107-0042</Text>
      <Text tone="success">已完成 128 单</Text>
      <Text tone="error">3 单超时未签收</Text>
      <span className="w-48"><Text ellipsis>上海市浦东新区张江高科技园区碧波路 690 号</Text></span>
    </Column>
  ),
};
