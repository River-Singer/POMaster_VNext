import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Popover> = {
  title: "Geist 组件/数据展示/Popover 气泡卡片",
  component: Popover,
  parameters: describe("Radix Popover：点击打开，Esc 或点外面关闭，焦点回到触发按钮。用作轻量确认（Geist 没有 Popconfirm，按规范用 Popover 拼）或放一小段补充信息。规则见「规范/组件/反馈/气泡确认」。源码 src/components/ui/popover.tsx。", "popover"),
};
export default meta;
type Story = StoryObj<typeof Popover>;

export const Confirm: Story = {
  name: "一句话确认",
  render: () => (
    <Frame>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="small" variant="secondary">
            移除司机
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3">
          <p className="text-copy-14">移除这名司机？</p>
          <div className="mt-2 flex justify-end gap-2">
            <PopoverClose asChild>
              <Button size="small" variant="secondary">
                取消
              </Button>
            </PopoverClose>
            <Button size="small" variant="error">
              移除
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </Frame>
  ),
};
