import type { Meta, StoryObj } from "@storybook/react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from "../components/ui/context-menu";
import { Frame, describe } from "./frame";

const meta: Meta<typeof ContextMenu> = {
  title: "Geist 组件/导航/ContextMenu 右键菜单",
  component: ContextMenu,
  parameters: describe("右键（或键盘的菜单键 / Shift+F10）打开的就地菜单（Radix ContextMenu）。右键菜单只是快捷方式：里面的每个操作都要在界面别处（行内按钮、更多菜单）也能找到。源码 src/components/ui/context-menu.tsx。", "context_menu"),
};
export default meta;
type Story = StoryObj<typeof ContextMenu>;

export const Default: Story = {
  name: "右键打开",
  render: () => (
    <Frame>
      <ContextMenu>
        <ContextMenuTrigger className="flex h-32 w-72 items-center justify-center rounded-lg border border-dashed border-ds-gray-500 text-copy-14 text-ds-gray-900">
          在这里点右键
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>查看详情</ContextMenuItem>
          <ContextMenuItem>
            复制车牌号<ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive">停用车辆</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </Frame>
  ),
};
