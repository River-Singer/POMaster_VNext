import type { Meta, StoryObj } from "@storybook/react";
import { Separator } from "../components/ui/separator";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Separator> = {
  title: "Geist 组件/Separator 分隔线",
  component: Separator,
  parameters: describe("Radix Separator：默认是装饰（读屏忽略）；真正分隔两组内容时设 decorative={false}。规则见「规范/组件/通用/分割线」。源码 src/components/ui/separator.tsx。"),
};
export default meta;
type Story = StoryObj<typeof Separator>;

export const Orientation: Story = {
  name: "横向与纵向",
  render: () => (
    <Frame className="flex-col items-stretch">
      <div className="w-96">
        <p className="text-label-14">车辆台账</p>
        <p className="text-copy-13 text-ds-gray-900">登记、调度、保养、报废</p>
        <Separator className="my-3" />
        <div className="flex h-5 items-center gap-3 text-copy-14">
          <span>在用 1,180</span>
          <Separator orientation="vertical" />
          <span>维修中 52</span>
          <Separator orientation="vertical" />
          <span>待报废 16</span>
        </div>
      </div>
    </Frame>
  ),
};
