import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Transfer } from "../components/ui/transfer";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Transfer> = {
  title: "Geist 组件/数据录入/Transfer 穿梭框",
  component: Transfer,
  parameters: describe("两栏之间移动条目（分配权限、编排线路）：每栏可搜索、可全选，中间按钮把勾选项移过去，按钮名称写清方向。Geist 没有 Transfer，按 antd Transfer 的能力用 Geist 的复选框与按钮做。源码 src/components/ui/transfer.tsx。", "transfer"),
};
export default meta;
type Story = StoryObj<typeof Transfer>;

function Demo() {
  const [target, setTarget] = React.useState<string[]>(["v3"]);
  const items = Array.from({ length: 8 }, (_, i) => ({ key: `v${i + 1}`, label: `沪A·D${2390 + i}`, disabled: i === 6 }));
  return (
    <Frame>
      <Transfer items={items} targetKeys={target} onChange={setTarget} titles={["可用车辆", "本线路车辆"]} />
    </Frame>
  );
}

export const Default: Story = { name: "分配车辆", render: () => <Demo /> };
