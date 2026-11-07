import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Tree } from "../components/ui/tree";
import { DEPOTS } from "./_data";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Tree> = {
  title: "Geist 组件/数据展示/Tree 树形控件",
  component: Tree,
  parameters: describe("树（role=\"tree\" / treeitem）：上下键移动、左右键收起展开、回车选择；checkable 时父节点按子节点显示半选。Geist 的 File Tree 是文件树形态，这里同时覆盖 antd Tree 的勾选能力。源码 src/components/ui/tree.tsx。", "tree"),
};
export default meta;
type Story = StoryObj<typeof Tree>;

function Demo() {
  const [selected, setSelected] = React.useState<string | null>("sh-pd-1");
  const [checked, setChecked] = React.useState<string[]>(["sh-pd-1"]);
  return (
    <Frame className="items-start gap-12">
      <Tree aria-label="车队组织" nodes={DEPOTS} selected={selected} onSelect={setSelected} defaultExpanded={["east", "sh-pd"]} icons="file" />
      <Tree aria-label="可见车队" nodes={DEPOTS} checkable checked={checked} onCheckedChange={setChecked} defaultExpanded={["east", "sh-pd", "south"]} />
    </Frame>
  );
}

export const Default: Story = { name: "选择与勾选", render: () => <Demo /> };
