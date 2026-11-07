import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "../components/ui/progress";
import { Column, describe } from "./frame";

const meta: Meta<typeof Progress> = {
  title: "Geist 组件/Progress 进度条",
  component: Progress,
  parameters: describe("Radix Progress：取值经 aria-valuenow 报给读屏，进度条带可读名称（aria-label）。有确切进度时旁边写数量或剩余时间。规则见「规范/组件/反馈/进度条」与「设计模式/体验管理/加载条」。源码 src/components/ui/progress.tsx。"),
  argTypes: { value: { control: { type: "range", min: 0, max: 100, step: 1 } } },
  args: { value: 26 },
};
export default meta;
type Story = StoryObj<typeof Progress>;

export const Playground: Story = {
  name: "实验场",
  render: (args) => (
    <Column className="w-96">
      <Progress {...args} aria-label="导入进度" />
      <span className="text-copy-13 text-ds-gray-900">已完成 {args.value ?? 0}%</span>
    </Column>
  ),
};

export const Values: Story = {
  name: "取值",
  render: () => (
    <Column className="w-96">
      {[0, 26, 64, 100].map((value) => (
        <div key={value} className="flex w-full items-center gap-3">
          <Progress value={value} aria-label={`示例进度 ${value}%`} />
          <span className="w-12 shrink-0 text-right text-copy-13 tabular-nums text-ds-gray-900">{value}%</span>
        </div>
      ))}
    </Column>
  ),
};
