import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Label } from "../components/ui/label";
import { TreeSelect } from "../components/ui/tree-select";
import { DEPOTS } from "./_data";
import { Column, describe } from "./frame";

const meta: Meta<typeof TreeSelect> = {
  title: "Geist 组件/数据录入/TreeSelect 树选择",
  component: TreeSelect,
  parameters: describe("从树形数据里选一个节点（组织、车队）：触发器 + 弹层里的 Tree（方向键展开收起、回车选择）。Geist 没有 Tree Select，按 antd TreeSelect 的能力用本项目的 Tree 与弹层做。源码 src/components/ui/tree-select.tsx。", "tree_select"),
};
export default meta;
type Story = StoryObj<typeof TreeSelect>;

function Demo() {
  const [value, setValue] = React.useState<string | null>("sh-pd-1");
  return (
    <Column className="w-72">
      <Label htmlFor="ts-team">所属车队</Label>
      <TreeSelect id="ts-team" nodes={DEPOTS} value={value} onValueChange={setValue} defaultExpanded={["east", "sh-pd"]} />
    </Column>
  );
}

export const Default: Story = { name: "选择车队", render: () => <Demo /> };
