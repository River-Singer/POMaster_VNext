import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Column, describe } from "./frame";

const meta: Meta<typeof Input> = {
  title: "Geist 组件/Input 输入框",
  component: Input,
  parameters: describe("单行输入：标签在上（Label 用 htmlFor 关联），占位符只给格式示例；校验失败时标 aria-invalid 并在下方写明规则。规则见「规范/组件/数据录入/输入框」。源码 src/components/ui/input.tsx、label.tsx。"),
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Labeled: Story = {
  name: "标签与占位符",
  render: () => (
    <Column className="w-80">
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="plate">车牌号</Label>
        <Input id="plate" placeholder="例：沪A12345" />
      </div>
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="mileage">里程（km）</Label>
        <Input id="mileage" type="number" min={0} placeholder="0" className="text-right" />
      </div>
    </Column>
  ),
};

export const States: Story = {
  name: "出错与禁用",
  render: () => (
    <Column className="w-80">
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="plate-bad">车牌号</Label>
        <Input id="plate-bad" defaultValue="沪A1" aria-invalid="true" aria-describedby="plate-bad-hint" />
        <span id="plate-bad-hint" className="text-copy-13 text-ds-red-900">
          车牌号为 7–8 位，如沪A12345
        </span>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="vin">车架号</Label>
        <Input id="vin" defaultValue="LSVAM4187C2184321" disabled />
      </div>
    </Column>
  ),
};
