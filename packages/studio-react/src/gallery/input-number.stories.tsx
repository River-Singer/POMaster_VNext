import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { InputNumber } from "../components/ui/input-number";
import { Label } from "../components/ui/label";
import { Column, describe } from "./frame";

const meta: Meta<typeof InputNumber> = {
  title: "Geist 组件/数据录入/InputNumber 数字输入",
  component: InputNumber,
  parameters: describe("数字输入：role=\"spinbutton\"，上下键按步长增减，失焦时按精度与范围校正；单位放在框内右侧（不进值）；空值是 null 而不是 0。Geist 没有 Input Number，按 antd InputNumber 的能力用 Geist 输入框做。源码 src/components/ui/input-number.tsx。", "input_number"),
};
export default meta;
type Story = StoryObj<typeof InputNumber>;

function Demo() {
  const [load, setLoad] = React.useState<number | null>(12.5);
  return (
    <Column className="w-60">
      <Label htmlFor="in-load">核定载重</Label>
      <InputNumber id="in-load" value={load} onValueChange={setLoad} min={0.5} max={49} step={0.5} precision={1} unit="吨" />
      <span className="text-copy-13 text-ds-gray-900">当前值：{load === null ? "未填" : load}</span>
    </Column>
  );
}

export const Default: Story = { name: "步进、精度与单位", render: () => <Demo /> };
