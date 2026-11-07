import type { Meta, StoryObj } from "@storybook/react";
import { PlusIcon, SearchXIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Frame, describe } from "./frame";

const meta: Meta<typeof EmptyState> = {
  title: "Geist 组件/数据展示/EmptyState 空状态",
  component: EmptyState,
  parameters: describe("空状态：说清为什么是空的、下一步做什么。区分「还没有数据」（给创建入口）和「筛选后没有结果」（给清除筛选）。Geist 有 Empty State。源码 src/components/ui/empty-state.tsx。", "empty"),
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  name: "无数据与无结果",
  render: () => (
    <Frame className="items-start">
      <div className="w-80 rounded-lg border border-ds-gray-400">
        <EmptyState title="还没有车辆" description="添加第一辆车后就能派单了。" action={<Button size="small" prefix={<PlusIcon />}>添加车辆</Button>} />
      </div>
      <div className="w-80 rounded-lg border border-ds-gray-400">
        <EmptyState size="small" icon={<SearchXIcon />} title="没有符合条件的车辆" description="试试放宽筛选条件。" action={<Button size="small" variant="secondary">清除筛选</Button>} />
      </div>
    </Frame>
  ),
};
