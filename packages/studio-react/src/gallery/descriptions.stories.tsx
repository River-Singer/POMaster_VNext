import type { Meta, StoryObj } from "@storybook/react";
import { Descriptions } from "../components/ui/descriptions";
import { StatusDot } from "../components/ui/status-dot";
import { Column, describe } from "./frame";

const meta: Meta<typeof Descriptions> = {
  title: "Geist 组件/数据展示/Descriptions 描述列表",
  component: Descriptions,
  parameters: describe("详情页的只读字段：dl / dt / dd，两到三列，长值跨列，空值显示「—」。Geist 用 Description 组件表达单个字段，多字段布局按 antd Descriptions 做。源码 src/components/ui/descriptions.tsx。", "descriptions"),
};
export default meta;
type Story = StoryObj<typeof Descriptions>;

const items = [
  { label: "车牌号", value: "沪A·D2391" },
  { label: "状态", value: <StatusDot state="building" label="在途" /> },
  { label: "司机", value: "张伟" },
  { label: "核定载重", value: "12.5 吨" },
  { label: "所属车队", value: "浦东车队一组" },
  { label: "GPS 设备号", value: "" },
  { label: "备注", value: "冷链车，箱温 2–8℃。", span: 3 as const },
];

export const Default: Story = {
  name: "无边框与带边框",
  render: () => (
    <Column className="w-full">
      <Descriptions title="车辆信息" items={items} className="w-full" />
      <Descriptions title="车辆信息（带边框）" items={items} bordered className="w-full" />
    </Column>
  ),
};
