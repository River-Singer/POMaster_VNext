import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Button } from "../components/ui/button";
import { DestructiveModal } from "../components/ui/destructive-modal";
import { Frame, describe } from "./frame";

const meta: Meta<typeof DestructiveModal> = {
  title: "Geist 组件/反馈/DestructiveModal 危险操作确认",
  component: DestructiveModal,
  parameters: describe("不可逆操作的确认（Radix AlertDialog）：点遮罩不关闭，焦点先落在「取消」；写清删什么、能否恢复、影响谁；确认按钮用 error 变体、文案是动作本身；影响大的再要求输入名称；确认中按钮忙碌、不能重复提交。源码 src/components/ui/destructive-modal.tsx。", "destructive_modal"),
};
export default meta;
type Story = StoryObj<typeof DestructiveModal>;

function Demo() {
  const [open, setOpen] = React.useState(false);
  return (
    <Frame>
      <Button variant="error" onClick={() => setOpen(true)}>解散车队</Button>
      <DestructiveModal
        open={open}
        onOpenChange={setOpen}
        title="解散浦东车队？"
        consequences={<p>车队下的 24 辆车会移到「未分组」，进行中的 3 个订单不受影响。解散后不能恢复。</p>}
        confirmLabel="解散车队"
        confirmText="浦东车队"
        onConfirm={() => new Promise((resolve) => window.setTimeout(resolve, 800))}
      />
    </Frame>
  );
}

export const Default: Story = { name: "输入名称后确认", render: () => <Demo /> };
