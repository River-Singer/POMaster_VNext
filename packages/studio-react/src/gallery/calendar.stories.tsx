import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Calendar, type IsoDate } from "../components/ui/calendar";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Calendar> = {
  title: "Geist 组件/数据展示/Calendar 日历",
  component: Calendar,
  parameters: describe("月历网格（role=\"grid\"）：方向键按天 / 周移动、PageUp/PageDown 换月、Home/End 到周首尾，今天与选中日有不同标记；renderCell 可以在格子里放当天的数据（排班、订单数）。日期选择器的弹层就是它。源码 src/components/ui/calendar.tsx。", "calendar"),
};
export default meta;
type Story = StoryObj<typeof Calendar>;

const SHIFTS: Record<string, number> = { "2026-11-03": 12, "2026-11-05": 8, "2026-11-07": 15, "2026-11-12": 4 };

function Demo() {
  const [selected, setSelected] = React.useState<IsoDate | null>("2026-11-07");
  return (
    <Frame className="items-start">
      <Calendar selected={selected} onSelect={setSelected} today="2026-11-07" defaultMonth="2026-11-01" />
      <Calendar
        selected={selected}
        onSelect={setSelected}
        today="2026-11-07"
        defaultMonth="2026-11-01"
        cellClassName="h-14"
        renderCell={(day) => (SHIFTS[day] !== undefined ? <span className="text-label-12 text-ds-blue-900">{SHIFTS[day]} 单</span> : null)}
      />
    </Frame>
  );
}

export const Default: Story = { name: "选择与单元格内容", render: () => <Demo /> };
