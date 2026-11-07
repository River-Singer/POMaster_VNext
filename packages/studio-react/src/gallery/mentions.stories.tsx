import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Label } from "../components/ui/label";
import { Mentions } from "../components/ui/mentions";
import { DRIVERS } from "./_data";
import { Column, describe } from "./frame";

const meta: Meta<typeof Mentions> = {
  title: "Geist 组件/数据录入/Mentions 提及",
  component: Mentions,
  parameters: describe("在多行输入里输入「@」弹出人员建议，上下键选择、回车插入；建议列表是 listbox。Geist 没有 Mentions，按 antd Mentions 的能力用 Geist 的输入框与弹层做。源码 src/components/ui/mentions.tsx。", "mentions"),
};
export default meta;
type Story = StoryObj<typeof Mentions>;

function Demo() {
  const [value, setValue] = React.useState("@张伟 明早 8 点前到浦东仓提货，");
  return (
    <Column className="w-96">
      <Label htmlFor="mt-note">调度备注</Label>
      <Mentions id="mt-note" value={value} onValueChange={setValue} people={DRIVERS} />
    </Column>
  );
}

export const Default: Story = { name: "@ 提及", render: () => <Demo /> };
