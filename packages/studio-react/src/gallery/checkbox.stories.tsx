import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Checkbox } from "../components/ui/checkbox";
import { Label } from "../components/ui/label";
import { Column, Frame, describe } from "./frame";

const meta: Meta<typeof Checkbox> = {
  title: "Geist 组件/Checkbox 多选框",
  component: Checkbox,
  parameters: describe("Radix Checkbox：支持半选态（checked=\"indeterminate\"），标签用 Label 关联后整行可点。规则见「规范/组件/数据录入/多选框」。源码 src/components/ui/checkbox.tsx。"),
};
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const States: Story = {
  name: "状态",
  render: () => (
    <Frame className="gap-6">
      <div className="flex items-center gap-2"><Checkbox id="c1" /><Label htmlFor="c1">未选</Label></div>
      <div className="flex items-center gap-2"><Checkbox id="c2" defaultChecked /><Label htmlFor="c2">已选</Label></div>
      <div className="flex items-center gap-2"><Checkbox id="c3" checked="indeterminate" /><Label htmlFor="c3">半选</Label></div>
      <div className="flex items-center gap-2"><Checkbox id="c4" disabled /><Label htmlFor="c4">禁用</Label></div>
    </Frame>
  ),
};

const ITEMS = [
  { key: "maint", label: "保养到期" },
  { key: "ins", label: "保险到期" },
  { key: "check", label: "年检到期" },
] as const;

function SelectAllDemo() {
  const [checked, setChecked] = useState<Record<string, boolean>>({ maint: true, ins: false, check: true });
  const count = ITEMS.filter((item) => checked[item.key]).length;
  const all = count === ITEMS.length ? true : count === 0 ? false : "indeterminate";
  return (
    <Column>
      <div className="flex items-center gap-2">
        <Checkbox
          id="notify-all"
          checked={all}
          onCheckedChange={(value) => setChecked(Object.fromEntries(ITEMS.map((item) => [item.key, value === true])))}
        />
        <Label htmlFor="notify-all">全部通知</Label>
      </div>
      <div className="flex flex-col gap-2 pl-6">
        {ITEMS.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <Checkbox
              id={`notify-${item.key}`}
              checked={checked[item.key]}
              onCheckedChange={(value) => setChecked((prev) => ({ ...prev, [item.key]: value === true }))}
            />
            <Label htmlFor={`notify-${item.key}`}>{item.label}</Label>
          </div>
        ))}
      </div>
    </Column>
  );
}

export const SelectAll: Story = { name: "全选与半选", render: () => <SelectAllDemo /> };
