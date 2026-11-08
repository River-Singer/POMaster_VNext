import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { AutoComplete } from "../components/ui/auto-complete";
import { Label } from "../components/ui/label";
import { Column, describe } from "./frame";

const meta: Meta<typeof AutoComplete> = {
  title: "Geist 组件/数据录入/AutoComplete 自动完成",
  component: AutoComplete,
  parameters: describe("自由输入 + 建议：可以输入建议之外的值（与 Combobox「只能从选项里选」相反）；建议列表是 listbox，上下键移动、回车采用、Esc 收起，aria-activedescendant 指向当前项。源码 src/components/ui/auto-complete.tsx。", "auto_complete"),
};
export default meta;
type Story = StoryObj<typeof AutoComplete>;

function Demo() {
  const [value, setValue] = React.useState("");
  const suggestions = ["浦东机场 T1", "浦东机场 T2", "虹桥火车站", "虹桥机场 T2"].map((label) => ({ value: label, label }));
  return (
    <Column className="w-80">
      <Label htmlFor="ac-dest">目的地</Label>
      <AutoComplete id="ac-dest" value={value} onValueChange={setValue} suggestions={suggestions} placeholder="输入地点" />
    </Column>
  );
}

export const Default: Story = { name: "输入与建议", render: () => <Demo /> };
