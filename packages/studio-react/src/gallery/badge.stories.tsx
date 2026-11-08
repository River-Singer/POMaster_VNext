import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "../components/ui/badge";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Badge> = {
  title: "Geist 组件/数据展示/Badge 标签",
  component: Badge,
  parameters: describe("状态与分类标签：四种变体，颜色只取主题变量，不写自定义色值。规则见「规范/组件/数据展示/标签」。源码 src/components/ui/badge.tsx。", "tag"),
  argTypes: { variant: { control: "select", options: ["default", "secondary", "outline", "destructive"] } },
  args: { variant: "secondary", children: "在用" },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Playground: Story = { name: "实验场", render: (args) => <Frame><Badge {...args} /></Frame> };

export const Variants: Story = {
  name: "变体",
  render: () => (
    <Frame>
      <Badge>调度中</Badge>
      <Badge variant="secondary">在用</Badge>
      <Badge variant="outline">待年检</Badge>
      <Badge variant="destructive">已报废</Badge>
    </Frame>
  ),
};
