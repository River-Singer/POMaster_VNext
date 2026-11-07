import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Toaster, notify, toast } from "../components/ui/toast";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Toaster> = {
  title: "Geist 组件/反馈/Notification 通知提醒框",
  component: Toaster,
  parameters: describe("带标题、说明和动作的通知：notify({ title, description, action })，右下角，停留 8 秒（带动作的错误不自动消失），每条有关闭按钮；用于后台任务完成、需要用户回应的事件。与 Toast 共用一个 <Toaster />。源码 src/components/ui/toast.tsx。", "notification"),
};
export default meta;
type Story = StoryObj<typeof Toaster>;

export const Default: Story = {
  name: "后台任务通知",
  render: () => (
    <Frame>
      <Button
        variant="secondary"
        onClick={() => notify({ title: "导出完成", description: "车辆列表（1,286 条）已生成 Excel。", tone: "success", action: { label: "下载", onClick: () => toast("开始下载") } })}
      >
        导出完成
      </Button>
      <Button
        variant="secondary"
        onClick={() => notify({ title: "批量派单部分失败", description: "12 单中有 2 单没有可用司机。", tone: "error", action: { label: "查看失败的订单", onClick: () => toast("已筛选失败订单") } })}
      >
        派单失败
      </Button>
      <Toaster />
    </Frame>
  ),
};
