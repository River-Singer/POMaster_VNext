import type { Meta, StoryObj } from "@storybook/react";
import { StatusDot } from "../components/ui/status-dot";
import { Column, describe } from "./frame";

const meta: Meta<typeof StatusDot> = {
  title: "Geist 组件/数据展示/StatusDot 状态点",
  component: StatusDot,
  parameters: describe("圆点 + 文字表示对象状态（部署、车辆、任务）：颜色只是辅助，文字必须在；进行中的状态呼吸闪烁，减少动效时静止。Geist 有 Status Dot。源码 src/components/ui/status-dot.tsx。", "status_dot"),
};
export default meta;
type Story = StoryObj<typeof StatusDot>;

export const Default: Story = {
  name: "五种状态",
  render: () => (
    <Column>
      <StatusDot state="ready" label="空闲" />
      <StatusDot state="building" label="在途" />
      <StatusDot state="error" label="故障" />
      <StatusDot state="queued" label="待派" />
      <StatusDot state="canceled" label="已停用" />
    </Column>
  ),
};
