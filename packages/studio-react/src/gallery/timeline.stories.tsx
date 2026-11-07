import type { Meta, StoryObj } from "@storybook/react";
import { Timeline } from "../components/ui/timeline";
import { Column, describe } from "./frame";

const meta: Meta<typeof Timeline> = {
  title: "Geist 组件/数据展示/Timeline 时间轴",
  component: Timeline,
  parameters: describe("按时间先后排列的事件：有序列表 ol，时间用 <time>，状态圆点只是辅助（标题里有文字）；进行中的下一步用 pending 表示。源码 src/components/ui/timeline.tsx。", "timeline"),
};
export default meta;
type Story = StoryObj<typeof Timeline>;

export const Default: Story = {
  name: "订单轨迹",
  render: () => (
    <Column>
      <Timeline
        items={[
          { key: "a", title: "订单已创建", time: { iso: "2026-11-07T08:02:00+08:00", text: "11 月 7 日 08:02" }, tone: "neutral" },
          { key: "b", title: "已派单给张伟", time: { iso: "2026-11-07T08:15:00+08:00", text: "08:15" }, description: "车辆 沪A·D2391", tone: "info" },
          { key: "c", title: "已提货", time: { iso: "2026-11-07T09:40:00+08:00", text: "09:40" }, tone: "success" },
          { key: "d", title: "途中延误", time: { iso: "2026-11-07T11:05:00+08:00", text: "11:05" }, description: "G15 沈海高速拥堵，预计晚到 30 分钟", tone: "warning" },
        ]}
        pending="等待签收"
      />
    </Column>
  ),
};
