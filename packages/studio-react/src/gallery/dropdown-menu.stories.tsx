import type { Meta, StoryObj } from "@storybook/react";
import { EllipsisIcon } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Frame, describe } from "./frame";

const meta: Meta<typeof DropdownMenu> = {
  title: "Geist 组件/导航/DropdownMenu 下拉菜单",
  component: DropdownMenu,
  parameters: describe("Radix DropdownMenu：方向键移动、输入首字跳转、Esc 关闭并把焦点还给触发按钮。危险项用 destructive 变体并用分隔线隔开放最后。规则见「规范/组件/导航/下拉菜单」。源码 src/components/ui/dropdown-menu.tsx。", "dropdown"),
};
export default meta;
type Story = StoryObj<typeof DropdownMenu>;

export const RowActions: Story = {
  name: "行内更多操作",
  render: () => (
    <Frame>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="small" variant="tertiary" svgOnly aria-label="沪A12345 的更多操作">
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-44" align="start">
          <DropdownMenuLabel>沪A12345</DropdownMenuLabel>
          <DropdownMenuItem>编辑</DropdownMenuItem>
          <DropdownMenuItem>复制为新车辆</DropdownMenuItem>
          <DropdownMenuItem disabled>转移车队（在途中）</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">删除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Frame>
  ),
};
