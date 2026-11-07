import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Combobox } from "../components/ui/combobox";
import { Label } from "../components/ui/label";
import { DRIVERS } from "./_data";
import { Column, describe } from "./frame";

const meta: Meta<typeof Combobox> = {
  title: "Geist 组件/数据录入/Combobox 可搜索选择",
  component: Combobox,
  parameters: describe("选项多（超过 10 个）时用的可搜索单选：触发按钮 + 弹层里的搜索框与 listbox，按名称与拼音关键词筛选，无结果时提示；只能选列表里的值。Geist 有 Combobox；antd 对应 Select 的 showSearch。源码 src/components/ui/combobox.tsx。", "combobox"),
};
export default meta;
type Story = StoryObj<typeof Combobox>;

function Demo() {
  const [value, setValue] = React.useState<string | null>("li-na");
  return (
    <Column className="w-72">
      <Label htmlFor="cb-driver">指派司机</Label>
      <Combobox id="cb-driver" options={DRIVERS} value={value} onValueChange={setValue} placeholder="选择司机" searchPlaceholder="搜索姓名或拼音" />
    </Column>
  );
}

export const Default: Story = { name: "搜索并选择", render: () => <Demo /> };
