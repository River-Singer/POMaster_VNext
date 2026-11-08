import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Cascader } from "../components/ui/cascader";
import { Label } from "../components/ui/label";
import { REGIONS } from "./_data";
import { Column, describe } from "./frame";

const meta: Meta<typeof Cascader> = {
  title: "Geist 组件/数据录入/Cascader 级联选择",
  component: Cascader,
  parameters: describe("层级数据（省 / 市 / 区）逐级选择：每一级是一列，右键头进入下一级，选到叶子才算选完；触发器上显示完整路径。Geist 没有 Cascader，按 antd Cascader 的能力用 Geist 的弹层与色阶做。源码 src/components/ui/cascader.tsx。", "cascader"),
};
export default meta;
type Story = StoryObj<typeof Cascader>;

function Demo() {
  const [value, setValue] = React.useState<string[]>(["sh", "pd", "zj"]);
  return (
    <Column className="w-80">
      <Label htmlFor="cas-area">服务区域</Label>
      <Cascader id="cas-area" options={REGIONS} value={value} onValueChange={setValue} />
    </Column>
  );
}

export const Default: Story = { name: "逐级选择", render: () => <Demo /> };
