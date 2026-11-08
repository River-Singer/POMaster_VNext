import type { Meta, StoryObj } from "@storybook/react";
import { NumberTicker } from "../components/ui/number-ticker";
import { Frame, describe } from "./frame";

const meta: Meta<typeof NumberTicker> = {
  title: "Geist 组件/数据展示/NumberTicker 数字滚动",
  component: NumberTicker,
  parameters: describe("数值变化时逐位滚动（来自 affectUI，MIT），等宽数字，减少动效时直接显示终值。只用于需要强调变化的统计数字。规则见「规范/设计模式/体验管理/组件动效」。源码 src/components/ui/number-ticker.tsx。"),
  argTypes: { value: { control: "number" } },
  args: { value: 1248 },
};
export default meta;
type Story = StoryObj<typeof NumberTicker>;

export const Playground: Story = {
  name: "实验场",
  render: (args) => (
    <Frame>
      <span className="text-heading-32">
        <NumberTicker {...args} locale="zh-CN" />
      </span>
      <span className="text-copy-14 text-ds-gray-900">辆在用车辆</span>
    </Frame>
  ),
};

export const Currency: Story = {
  name: "金额",
  render: () => (
    <Frame>
      <span className="text-heading-24">
        <NumberTicker value={12480.5} locale="zh-CN" format={{ style: "currency", currency: "CNY" }} />
      </span>
    </Frame>
  ),
};
