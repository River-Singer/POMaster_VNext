import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Toaster, toast } from "../components/ui/toast";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Toaster> = {
  title: "Geist 组件/反馈/Toast 全局提示",
  component: Toaster,
  parameters: describe("操作结果的轻提示：toast() / toast.success / error / warning，顶部居中，4 秒后消失，悬停或聚焦时暂停；错误用 role=\"alert\"，其余礼貌播报；带动作的错误不自动消失。文案写结果（「已保存」），不写「操作成功」。<Toaster /> 在应用根部放一次。Geist 有 Toast（不依赖 sonner，store 自带）。源码 src/components/ui/toast.tsx。", "message"),
};
export default meta;
type Story = StoryObj<typeof Toaster>;

export const Default: Story = {
  name: "四种提示",
  render: () => (
    <Frame>
      <Button variant="secondary" onClick={() => toast.success("车辆已保存")}>保存</Button>
      <Button variant="secondary" onClick={() => toast("已复制订单号")}>复制</Button>
      <Button variant="secondary" onClick={() => toast.warning("3 辆车年检即将到期")}>提醒</Button>
      <Button variant="secondary" onClick={() => toast.error("派单失败：司机已下线", { action: { label: "改派", onClick: () => toast("已打开改派") } })}>
        失败
      </Button>
      <Toaster />
    </Frame>
  ),
};
