import type { Meta, StoryObj } from "@storybook/react";
import { Statistic } from "../components/ui/statistic";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Statistic> = {
  title: "Geist 组件/数据展示/Statistic 统计数值",
  component: Statistic,
  parameters: describe("指标数值：标签 + 等宽数字（千分位）+ 小一号的单位 + 趋势（箭头 + 文字「较上周 +12%」，goodWhen 决定涨是好是坏）。需要数字滚动动画时配 NumberTicker（见同组「NumberTicker 数字滚动」）。源码 src/components/ui/statistic.tsx。", "statistic"),
};
export default meta;
type Story = StoryObj<typeof Statistic>;

export const Default: Story = {
  name: "指标与趋势",
  render: () => (
    <Frame className="gap-12">
      <Statistic label="本周订单" value={12846} unit="单" trend={{ delta: 12.4, period: "较上周" }} />
      <Statistic label="准点率" value={98.2} precision={1} unit="%" trend={{ delta: 1.4, period: "较上周" }} />
      <Statistic label="平均等待" value={7.5} precision={1} unit="分钟" trend={{ delta: -8, period: "较上周", goodWhen: "down" }} />
      <Statistic label="故障车辆" value={3} unit="辆" trend={{ delta: 50, period: "较上周", goodWhen: "down" }} />
    </Frame>
  ),
};
