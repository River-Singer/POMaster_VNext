import type { Meta, StoryObj } from "@storybook/react";
import { ScrollArea } from "../components/ui/scroll-area";
import { Frame, describe } from "./frame";

const meta: Meta<typeof ScrollArea> = {
  title: "Geist 组件/布局/ScrollArea 滚动区",
  component: ScrollArea,
  parameters: describe("固定高度的局部滚动区（Radix ScrollArea）：保留原生滚动与键盘滚动，滚动条细而不占位；滚动区能被键盘聚焦。Geist 有 Scroller；antd 没有对应组件。源码 src/components/ui/scroll-area.tsx。", "scroller"),
};
export default meta;
type Story = StoryObj<typeof ScrollArea>;

export const Default: Story = {
  name: "纵向滚动",
  render: () => (
    <Frame>
      <ScrollArea className="h-48 w-64 rounded-lg border border-ds-gray-400">
        <ul className="flex flex-col p-3">
          {Array.from({ length: 24 }, (_, i) => (
            <li key={i} className="border-b border-ds-gray-400 py-2 text-copy-14 last:border-0">
              沪A·D{String(2300 + i)}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </Frame>
  ),
};
