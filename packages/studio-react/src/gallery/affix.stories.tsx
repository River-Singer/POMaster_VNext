import type { Meta, StoryObj } from "@storybook/react";
import { Affix } from "../components/ui/affix";
import { Button } from "../components/ui/button";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Affix> = {
  title: "Geist 组件/其他/Affix 固钉",
  component: Affix,
  parameters: describe("滚动时把工具栏、批量操作条钉在视口（或滚动容器）顶部或底部：CSS sticky 实现，钉住后加边线与投影；钉住的条不能遮住焦点所在元素（页面设 scroll-padding）。在下面的框里滚动看效果。Geist 没有 Affix，按 antd Affix 的能力用 sticky 做。源码 src/components/ui/affix.tsx。", "affix"),
};
export default meta;
type Story = StoryObj<typeof Affix>;

export const Default: Story = {
  name: "钉住的操作条",
  render: () => (
    <Frame>
      <div className="h-64 w-96 overflow-y-auto rounded-lg border border-ds-gray-400">
        <p className="p-4 text-copy-14 text-ds-gray-900">已选 3 辆车。向下滚动，操作条会钉在顶部。</p>
        <Affix className="flex items-center gap-2 px-4 py-2">
          <Button size="small">批量派单</Button>
          <Button size="small" variant="secondary">导出</Button>
        </Affix>
        <ul className="flex flex-col p-4">
          {Array.from({ length: 30 }, (_, i) => (
            <li key={i} className="border-b border-ds-gray-400 py-2 text-copy-14 last:border-0">
              沪A·D{2300 + i}
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  ),
};
