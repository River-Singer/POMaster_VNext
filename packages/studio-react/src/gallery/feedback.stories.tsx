import type { Meta, StoryObj } from "@storybook/react";
import { Feedback } from "../components/ui/feedback";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Feedback> = {
  title: "Geist 组件/数据录入/Feedback 反馈收集",
  component: Feedback,
  parameters: describe("页面上的「反馈」入口：弹层里选一个表情（radiogroup）+ 写几句话，提交中按钮忙碌，成功后在原处显示「已收到」；不强制填写联系方式。Geist 有 Feedback；antd 没有对应组件。源码 src/components/ui/feedback.tsx。", "feedback_widget"),
};
export default meta;
type Story = StoryObj<typeof Feedback>;

export const Default: Story = {
  name: "反馈入口",
  render: () => (
    <Frame>
      <span className="text-copy-14 text-ds-gray-900">这个页面好用吗？</span>
      <Feedback onSubmit={() => new Promise((resolve) => window.setTimeout(resolve, 600))} />
    </Frame>
  ),
};
