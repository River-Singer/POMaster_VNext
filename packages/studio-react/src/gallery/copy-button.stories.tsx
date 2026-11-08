import type { Meta, StoryObj } from "@storybook/react";
import { CopyButton } from "../components/ui/copy-button";
import { Frame, describe } from "./frame";

const meta: Meta<typeof CopyButton> = {
  title: "Geist 组件/通用/CopyButton 复制按钮",
  component: CopyButton,
  parameters: describe("复制一段文本：图标按钮带名称（「复制车牌号」），复制成功后图标变勾、读屏播报「已复制」，两秒后复原；剪贴板不可用时报错而不是静默失败。源码 src/components/ui/copy-button.tsx。", "copy_button"),
};
export default meta;
type Story = StoryObj<typeof CopyButton>;

export const Default: Story = {
  name: "复制",
  render: () => (
    <Frame>
      <span className="font-mono text-copy-14">沪A·D2391</span>
      <CopyButton value="沪A·D2391" label="复制车牌号" />
      <span className="font-mono text-copy-14">ORD-20261107-0042</span>
      <CopyButton value="ORD-20261107-0042" label="复制订单号" variant="secondary" />
    </Frame>
  ),
};
