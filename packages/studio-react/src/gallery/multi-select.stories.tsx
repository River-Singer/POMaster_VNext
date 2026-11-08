import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Label } from "../components/ui/label";
import { MultiSelect } from "../components/ui/multi-select";
import { DRIVERS } from "./_data";
import { Column, describe } from "./frame";

const meta: Meta<typeof MultiSelect> = {
  title: "Geist 组件/数据录入/MultiSelect 多选选择器",
  component: MultiSelect,
  parameters: describe("多选下拉：选中项在触发器上显示为可单独移除的标签（超过 maxTags 折叠成「+N」），弹层里可搜索、勾选（listbox aria-multiselectable）。Geist 有 Multi Select；antd 对应 Select mode=\"multiple\"。源码 src/components/ui/multi-select.tsx。", "multi_select"),
};
export default meta;
type Story = StoryObj<typeof MultiSelect>;

function Demo() {
  const [value, setValue] = React.useState<string[]>(["zhang-wei", "li-na", "wang-fang", "liu-yang"]);
  return (
    <Column className="w-96">
      <Label htmlFor="ms-crew">随车人员</Label>
      <MultiSelect id="ms-crew" options={DRIVERS} value={value} onValueChange={setValue} maxTags={2} />
    </Column>
  );
}

export const Default: Story = { name: "多选与折叠", render: () => <Demo /> };
