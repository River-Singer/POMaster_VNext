import type { Meta, StoryObj } from "@storybook/react";
import { CopyIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Tooltip> = {
  title: "Geist 组件/数据展示/Tooltip 文字提示",
  component: Tooltip,
  parameters: describe("Radix Tooltip：悬停和聚焦都会出现，内容经 aria-describedby 关联触发元素。关键说明不要只放在提示里（移动端没有悬停）。禁用的按钮收不到事件，外面包一层可聚焦的 span。规则见「规范/组件/数据展示/文字提示」。源码 src/components/ui/tooltip.tsx。", "tooltip"),
};
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Basic: Story = {
  name: "图标按钮与禁用原因",
  render: () => (
    <Frame className="gap-6">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="secondary" svgOnly aria-label="复制车牌号">
            <CopyIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>复制车牌号</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-block">
            <Button variant="secondary" disabled>
              删除
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>已有在途工单，不能删除</TooltipContent>
      </Tooltip>
    </Frame>
  ),
};
