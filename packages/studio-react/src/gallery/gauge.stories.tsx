import type { Meta, StoryObj } from "@storybook/react";
import { Gauge } from "../components/ui/gauge";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Gauge> = {
  title: "Geist 组件/数据展示/Gauge 仪表",
  component: Gauge,
  parameters: describe("环形仪表表示一个比例（用量、满载率、得分）：role=\"meter\" 带数值与可读文字；颜色按阈值变化（警告琥珀、危险红），中心同时写数字。Geist 有 Gauge；antd 用 Progress type=\"dashboard\"。源码 src/components/ui/gauge.tsx。", "gauge"),
  args: { value: 64, label: "车厢满载率", size: "large" },
  argTypes: { value: { control: { type: "range", min: 0, max: 100 } }, size: { control: "select", options: ["small", "medium", "large"] } },
};
export default meta;
type Story = StoryObj<typeof Gauge>;

export const Playground: Story = { name: "实验场", render: (args) => <Frame><Gauge {...args} /></Frame> };

export const Thresholds: Story = {
  name: "阈值与尺寸",
  render: () => (
    <Frame className="gap-6">
      <Gauge value={42} label="一组满载率" />
      <Gauge value={78} label="二组满载率" />
      <Gauge value={95} label="三组满载率" />
      <Gauge value={95} label="三组满载率（小）" size="small" />
    </Frame>
  ),
};
