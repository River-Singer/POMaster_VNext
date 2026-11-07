import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Select> = {
  title: "Geist 组件/Select 选择器",
  component: Select,
  parameters: describe("Radix Select：键盘上下选择、输入首字跳转，弹层在 Portal 里。选项值用稳定编码，停用的选项禁用而不隐藏。规则见「规范/组件/数据录入/选择器」。源码 src/components/ui/select.tsx。"),
};
export default meta;
type Story = StoryObj<typeof Select>;

export const Basic: Story = {
  name: "标签、占位与停用项",
  render: () => (
    <Frame>
      <div className="flex w-72 flex-col gap-1.5">
        <Label htmlFor="model">车型</Label>
        <Select>
          <SelectTrigger id="model" className="w-full">
            <SelectValue placeholder="选择车型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="M01">轻型厢式货车</SelectItem>
            <SelectItem value="M02">中型栏板货车</SelectItem>
            <SelectItem value="M03">冷藏车</SelectItem>
            <SelectItem value="M09" disabled>
              重型牵引车（已停用）
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Frame>
  ),
};

export const WithValue: Story = {
  name: "已有取值",
  render: () => (
    <Frame>
      <Select defaultValue="M02">
        <SelectTrigger className="w-72" aria-label="车型">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="M01">轻型厢式货车</SelectItem>
          <SelectItem value="M02">中型栏板货车</SelectItem>
        </SelectContent>
      </Select>
    </Frame>
  ),
};
