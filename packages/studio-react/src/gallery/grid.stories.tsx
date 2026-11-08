import type { Meta, StoryObj } from "@storybook/react";
import { Grid, GridCell } from "../components/ui/grid";
import { Column, describe } from "./frame";

const meta: Meta<typeof Grid> = {
  title: "Geist 组件/布局/Grid 栅格组件",
  component: Grid,
  parameters: describe("12 栏栅格：栏间距 16 / 24，单元格按栏数跨列；guides 显示栏线（Geist Grid 的辅助线），用于对齐检查，上线时关掉。源码 src/components/ui/grid.tsx。", "grid_component"),
};
export default meta;
type Story = StoryObj<typeof Grid>;

const Cell = ({ span, children }: { readonly span: 1 | 2 | 3 | 4 | 6 | 8 | 9 | 12; readonly children: string }) => (
  <GridCell span={span} className="rounded-md border border-ds-gray-400 bg-ds-background-200 p-3 text-label-13">{children}</GridCell>
);

export const Default: Story = {
  name: "跨列",
  render: () => (
    <Column className="w-full">
      <Grid className="w-full">
        <Cell span={8}>订单列表 · 8 栏</Cell>
        <Cell span={4}>筛选 · 4 栏</Cell>
        <Cell span={3}>3 栏</Cell>
        <Cell span={3}>3 栏</Cell>
        <Cell span={6}>6 栏</Cell>
      </Grid>
      <Grid columns={4} gutter={16} guides className="w-full">
        <Cell span={1}>1</Cell>
        <Cell span={2}>2</Cell>
        <Cell span={1}>1</Cell>
      </Grid>
    </Column>
  ),
};
