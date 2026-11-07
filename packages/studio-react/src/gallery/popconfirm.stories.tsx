import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Popconfirm } from "../components/ui/popconfirm";
import { toast, Toaster } from "../components/ui/toast";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Popconfirm> = {
  title: "Geist 组件/反馈/Popconfirm 气泡确认",
  component: Popconfirm,
  parameters: describe("轻量、可撤销操作的就地确认（Radix Popover，role=\"alertdialog\"）：焦点先落在「取消」，确认按钮写动作本身；不可逆或影响大的操作改用 DestructiveModal。Geist 没有 Popconfirm，按 antd Popconfirm 的能力用 Geist 的气泡卡片做。源码 src/components/ui/popconfirm.tsx。", "popconfirm"),
};
export default meta;
type Story = StoryObj<typeof Popconfirm>;

export const Default: Story = {
  name: "就地确认",
  render: () => (
    <Frame>
      <Popconfirm title="把张伟移出本线路？" description="可以随时再加回来。" confirmLabel="移出" onConfirm={() => toast("已移出张伟")}>
        <Button variant="secondary" size="small">移出线路</Button>
      </Popconfirm>
      <Popconfirm title="停用这辆车？" description="停用后不会再给它派单。" confirmLabel="停用" destructive onConfirm={() => toast("已停用 沪A·D2391")}>
        <Button variant="error" size="small">停用</Button>
      </Popconfirm>
      <Toaster />
    </Frame>
  ),
};
