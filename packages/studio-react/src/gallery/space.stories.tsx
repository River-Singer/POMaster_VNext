import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Space } from "../components/ui/flex";
import { Separator } from "../components/ui/separator";
import { Column, describe } from "./frame";

const meta: Meta<typeof Space> = {
  title: "Geist 组件/布局/Space 间距组合",
  component: Space,
  parameters: describe("一组同级元素之间放统一间距（按钮组、行内链接），可插入分隔元素；只管间距，不管对齐与换行（那是 Flex）。Geist 没有 Space，按 antd Space 的职责用 Flex 的间距档位做。源码 src/components/ui/flex.tsx。", "space"),
};
export default meta;
type Story = StoryObj<typeof Space>;

export const Default: Story = {
  name: "间距与分隔",
  render: () => (
    <Column>
      <Space size={2}>
        <Button variant="secondary" size="small">编辑</Button>
        <Button variant="secondary" size="small">复制</Button>
        <Button variant="error" size="small">删除</Button>
      </Space>
      <Space size={3} split={<Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />}>
        <a href="#detail" className="text-copy-14 underline-offset-4 hover:underline">详情</a>
        <a href="#track" className="text-copy-14 underline-offset-4 hover:underline">轨迹</a>
        <a href="#log" className="text-copy-14 underline-offset-4 hover:underline">日志</a>
      </Space>
      <Space direction="vertical" size={1}>
        <span className="text-copy-14">纵向第一行</span>
        <span className="text-copy-14">纵向第二行</span>
      </Space>
    </Column>
  ),
};
