import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Segmented } from "../components/ui/segmented";
import { Column, describe } from "./frame";

const meta: Meta<typeof Segmented> = {
  title: "Geist 组件/数据录入/Segmented 分段控制器",
  component: Segmented,
  parameters: describe("2–5 个互斥选项的即时切换（视图、时间范围）：radiogroup，左右键切换；切换的是同一份内容的展示方式时用它，切换不同内容区用 Tabs。Geist 有 Toggle Group / Switch（分段）。源码 src/components/ui/segmented.tsx。", "segmented"),
};
export default meta;
type Story = StoryObj<typeof Segmented>;

function Demo() {
  const [range, setRange] = React.useState("week");
  return (
    <Column>
      <Segmented aria-label="统计范围" value={range} onValueChange={setRange} options={[{ value: "day", label: "今日" }, { value: "week", label: "本周" }, { value: "month", label: "本月" }, { value: "year", label: "全年", disabled: true }]} />
      <Segmented aria-label="视图" size="small" value="list" onValueChange={() => undefined} options={[{ value: "list", label: "列表" }, { value: "map", label: "地图" }]} />
    </Column>
  );
}

export const Default: Story = { name: "切换", render: () => <Demo /> };
