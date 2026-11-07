import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Column, describe } from "./frame";

const meta: Meta<typeof Textarea> = {
  title: "Geist 组件/数据录入/Textarea 多行输入",
  component: Textarea,
  parameters: describe("多行文本：可随内容长高（不超过 maxRows），showCount 显示字数与上限，计数随输入礼貌播报。源码 src/components/ui/textarea.tsx。", "textarea"),
};
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  name: "自动长高与计数",
  render: () => (
    <Column className="w-96">
      <Label htmlFor="ta-note">交接说明</Label>
      <Textarea id="ta-note" autoResize maxRows={6} showCount maxLength={200} placeholder="写清楚货物情况与注意事项" />
      <Textarea aria-label="已停用的说明" disabled defaultValue="订单已签收，不能再修改说明。" />
    </Column>
  ),
};
