import type { Meta, StoryObj } from "@storybook/react";
import { RelativeTime } from "../components/ui/relative-time";
import { Column, describe } from "./frame";

const meta: Meta<typeof RelativeTime> = {
  title: "Geist 组件/数据展示/RelativeTime 相对时间",
  component: RelativeTime,
  parameters: describe("「3 分钟前」式的相对时间：<time dateTime> 带机器可读时间，悬停或键盘聚焦显示带时区的绝对时间，每分钟刷新；超过 7 天直接显示日期。Geist 有 Relative Time Card；antd 没有对应组件。源码 src/components/ui/relative-time.tsx。", "relative_time"),
};
export default meta;
type Story = StoryObj<typeof RelativeTime>;

const ago = (ms: number) => new Date(Date.now() - ms);

export const Default: Story = {
  name: "不同时间跨度",
  render: () => (
    <Column>
      <span className="text-copy-14">签收：<RelativeTime date={ago(20_000)} /></span>
      <span className="text-copy-14">发车：<RelativeTime date={ago(3 * 60_000)} /></span>
      <span className="text-copy-14">派单：<RelativeTime date={ago(5 * 3_600_000)} /></span>
      <span className="text-copy-14">上次保养：<RelativeTime date={ago(3 * 86_400_000)} /></span>
      <span className="text-copy-14">入队：<RelativeTime date={ago(40 * 86_400_000)} /></span>
    </Column>
  ),
};
