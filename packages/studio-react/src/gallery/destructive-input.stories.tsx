import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Button } from "../components/ui/button";
import { DestructiveInput } from "../components/ui/destructive-input";
import { Column, describe } from "./frame";

const meta: Meta<typeof DestructiveInput> = {
  title: "Geist 组件/数据录入/DestructiveInput 破坏性确认输入",
  component: DestructiveInput,
  parameters: describe("不可逆的大操作前，要求输入对象名称确认：提示里写出要输入的原文，输入一致后危险按钮才可用；不禁止粘贴（禁止粘贴只会为难密码管理器与读屏用户）。Geist 用于删除项目的确认；antd 没有对应组件。源码 src/components/ui/destructive-input.tsx。", "destructive_input"),
};
export default meta;
type Story = StoryObj<typeof DestructiveInput>;

function Demo() {
  const [matched, setMatched] = React.useState(false);
  return (
    <Column className="w-96">
      <DestructiveInput expected="浦东车队" onMatchChange={setMatched} />
      <Button variant="error" disabled={!matched}>
        解散车队
      </Button>
    </Column>
  );
}

export const Default: Story = { name: "输入名称确认", render: () => <Demo /> };
