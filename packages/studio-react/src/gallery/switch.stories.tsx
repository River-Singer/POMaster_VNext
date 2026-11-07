import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Switch> = {
  title: "Geist 组件/数据录入/Switch 开关",
  component: Switch,
  parameters: describe("Radix Switch：只用于立即生效的设置，标签写它控制什么。需要随表单提交的选择用多选框。规则见「规范/组件/数据录入/开关」。源码 src/components/ui/switch.tsx。", "switch"),
  argTypes: { disabled: { control: "boolean" } },
  args: { disabled: false },
};
export default meta;
type Story = StoryObj<typeof Switch>;

export const Playground: Story = {
  name: "实验场",
  render: (args) => (
    <Frame>
      <div className="flex items-center gap-2">
        <Switch id="sw-play" {...args} />
        <Label htmlFor="sw-play">到期自动提醒</Label>
      </div>
    </Frame>
  ),
};

export const States: Story = {
  name: "状态",
  render: () => (
    <Frame className="gap-6">
      <div className="flex items-center gap-2"><Switch id="sw1" /><Label htmlFor="sw1">关</Label></div>
      <div className="flex items-center gap-2"><Switch id="sw2" defaultChecked /><Label htmlFor="sw2">开</Label></div>
      <div className="flex items-center gap-2"><Switch id="sw3" disabled /><Label htmlFor="sw3">禁用</Label></div>
    </Frame>
  ),
};
