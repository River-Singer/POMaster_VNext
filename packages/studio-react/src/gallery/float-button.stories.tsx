import type { Meta, StoryObj } from "@storybook/react";
import { HeadsetIcon, PlusIcon } from "lucide-react";
import { FloatButton } from "../components/ui/float-button";
import { Frame, describe } from "./frame";

const meta: Meta<typeof FloatButton> = {
  title: "Geist 组件/通用/FloatButton 悬浮按钮",
  component: FloatButton,
  parameters: describe("悬浮在页面角落的圆形按钮（联系客服、新建）：一页最多一个，带名称与可选计数；不遮挡底部内容（页面要留出相应的下内边距）。Geist 没有这个组件，按 antd FloatButton 的能力用 Geist 的按钮与投影做。演示里 position=\"static\" 放在框内。源码 src/components/ui/float-button.tsx。", "float_button"),
};
export default meta;
type Story = StoryObj<typeof FloatButton>;

export const Default: Story = {
  name: "悬浮按钮",
  render: () => (
    <Frame>
      <FloatButton position="static" label="联系调度员" badge={3}>
        <HeadsetIcon />
      </FloatButton>
      <FloatButton position="static" label="新建订单" variant="default">
        <PlusIcon />
      </FloatButton>
    </Frame>
  ),
};
