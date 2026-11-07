import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import type { IsoDate } from "../components/ui/calendar";
import { DatePicker } from "../components/ui/date-picker";
import { Label } from "../components/ui/label";
import { Column, describe } from "./frame";

const meta: Meta<typeof DatePicker> = {
  title: "Geist 组件/数据录入/DatePicker 日期选择",
  component: DatePicker,
  parameters: describe("触发按钮 + 弹层日历（Calendar 网格：方向键移动、PageUp/PageDown 换月、回车选择）；值是 ISO 日期字符串（YYYY-MM-DD），显示格式由调用处决定；可清空、可限制范围。源码 src/components/ui/date-picker.tsx。", "date_picker"),
};
export default meta;
type Story = StoryObj<typeof DatePicker>;

function Demo() {
  const [value, setValue] = React.useState<IsoDate | null>("2026-11-12");
  return (
    <Column className="w-72">
      <Label htmlFor="dp-inspect">年检日期</Label>
      <DatePicker id="dp-inspect" value={value} onValueChange={setValue} today="2026-11-07" min="2026-11-01" max="2027-06-30" />
    </Column>
  );
}

export const Default: Story = { name: "选择日期", render: () => <Demo /> };
