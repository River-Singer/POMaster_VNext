import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "../components/ui/label";
import { Slider } from "../components/ui/slider";
import { Column, describe } from "./frame";

const meta: Meta<typeof Slider> = {
  title: "Geist 组件/数据录入/Slider 滑块",
  component: Slider,
  parameters: describe("连续数值或区间（Radix Slider）：方向键微调、PageUp/PageDown 大步调整，每个滑块有名称；需要精确值时旁边配数字输入。源码 src/components/ui/slider.tsx。", "slider"),
};
export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  name: "单值与区间",
  render: () => (
    <Column className="w-80">
      <Label>派单半径（公里）</Label>
      <Slider defaultValue={[15]} max={50} step={1} thumbLabels={["派单半径"]} />
      <Label>运价区间（元）</Label>
      <Slider defaultValue={[200, 800]} max={1000} step={50} thumbLabels={["最低运价", "最高运价"]} />
    </Column>
  ),
};
