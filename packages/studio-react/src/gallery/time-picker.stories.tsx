import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Label } from "../components/ui/label";
import { TimePicker } from "../components/ui/time-picker";
import { Column, describe } from "./frame";

const meta: Meta<typeof TimePicker> = {
  title: "Geist 组件/数据录入/TimePicker 时间选择",
  component: TimePicker,
  parameters: describe("时、分（可选秒）各一列 listbox，分钟按步长取值；值是 HH:mm(:ss) 字符串。Geist 没有 Time Picker，按 antd TimePicker 的能力用 Geist 的弹层与色阶做。源码 src/components/ui/time-picker.tsx。", "time_picker"),
};
export default meta;
type Story = StoryObj<typeof TimePicker>;

function Demo() {
  const [value, setValue] = React.useState<string | null>("08:30");
  return (
    <Column className="w-60">
      <Label htmlFor="tp-start">发车时间</Label>
      <TimePicker id="tp-start" value={value} onValueChange={setValue} minuteStep={15} />
    </Column>
  );
}

export const Default: Story = { name: "选择时间", render: () => <Demo /> };
