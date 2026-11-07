import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton } from "../components/ui/skeleton";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Skeleton> = {
  title: "Geist 组件/Skeleton 骨架屏",
  component: Skeleton,
  parameters: describe("占位块：与真实内容同几何（同样的行高、列宽、卡片尺寸），只覆盖还没到的区块。规则见「规范/工程规范/页面加载」与「设计模式/体验管理/状态反馈」。源码 src/components/ui/skeleton.tsx。"),
};
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const ListRow: Story = {
  name: "列表行",
  render: () => (
    <Frame className="flex-col items-stretch">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex w-[480px] items-center gap-3">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      ))}
    </Frame>
  ),
};
