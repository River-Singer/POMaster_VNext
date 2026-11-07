import type { Meta, StoryObj } from "@storybook/react";
import { Breadcrumb } from "../components/ui/breadcrumb";
import { Column, describe } from "./frame";

const meta: Meta<typeof Breadcrumb> = {
  title: "Geist 组件/导航/Breadcrumb 面包屑",
  component: Breadcrumb,
  parameters: describe("当前页在层级里的位置：nav + 有序列表，最后一项是当前页（aria-current=\"page\"，不是链接）；层级超过 maxItems 时中间折叠。源码 src/components/ui/breadcrumb.tsx。", "breadcrumb"),
};
export default meta;
type Story = StoryObj<typeof Breadcrumb>;

export const Default: Story = {
  name: "层级与折叠",
  render: () => (
    <Column>
      <Breadcrumb items={[{ label: "车队", href: "#fleet" }, { label: "车辆", href: "#vehicles" }, { label: "沪A·D2391" }]} />
      <Breadcrumb maxItems={3} items={[{ label: "首页", href: "#home" }, { label: "华东区", href: "#east" }, { label: "上海", href: "#sh" }, { label: "浦东车队", href: "#pd" }, { label: "保养记录" }]} />
    </Column>
  ),
};
