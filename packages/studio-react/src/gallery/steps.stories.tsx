import type { Meta, StoryObj } from "@storybook/react";
import { Steps } from "../components/ui/steps";
import { Column, describe } from "./frame";

const meta: Meta<typeof Steps> = {
  title: "Geist 组件/导航/Steps 步骤条",
  component: Steps,
  parameters: describe("多步流程的进度：有序列表，当前步 aria-current=\"step\"，已完成 / 出错的状态有文字而不只是颜色；横向用于页头，纵向用于侧栏。源码 src/components/ui/steps.tsx。", "steps"),
};
export default meta;
type Story = StoryObj<typeof Steps>;

const items = [{ title: "填写车辆信息" }, { title: "上传证件", description: "行驶证、保险单" }, { title: "提交审核" }];

export const Default: Story = {
  name: "横向、纵向与出错",
  render: () => (
    <Column className="w-full">
      <Steps items={items} current={1} className="w-full" />
      <Steps items={items} current={1} status="error" className="w-full" />
      <Steps items={items} current={2} direction="vertical" />
    </Column>
  ),
};
