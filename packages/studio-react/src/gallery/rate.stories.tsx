import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Rate } from "../components/ui/rate";
import { Column, describe } from "./frame";

const meta: Meta<typeof Rate> = {
  title: "Geist 组件/数据录入/Rate 评分",
  component: Rate,
  parameters: describe("星级评分：一组 radio（左右键改分），每颗星有可读名称（「4 星：满意」），再点当前分可清空；只读时显示为图形 + 文字分数。Geist 没有 Rate，按 antd Rate 的能力用 Geist 色阶做。源码 src/components/ui/rate.tsx。", "rate"),
};
export default meta;
type Story = StoryObj<typeof Rate>;

function Demo() {
  const [value, setValue] = React.useState(4);
  return (
    <Column>
      <Rate aria-label="司机服务评分" value={value} onValueChange={setValue} labels={["很差", "较差", "一般", "满意", "非常满意"]} />
      <Rate aria-label="平均评分" value={3} readOnly />
    </Column>
  );
}

export const Default: Story = { name: "评分与只读", render: () => <Demo /> };
