import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Button } from "../components/ui/button";
import { CommandMenu } from "../components/ui/command-menu";
import { Kbd, KbdGroup } from "../components/ui/kbd";
import { Frame, describe } from "./frame";

const meta: Meta<typeof CommandMenu> = {
  title: "Geist 组件/导航/CommandMenu 命令面板",
  component: CommandMenu,
  parameters: describe("⌘K 打开的全局命令面板：输入即筛选，上下键移动、回车执行，按分组列出，无结果时说明怎么办；建在 Radix Dialog 上（焦点困在面板里，Esc 关闭）。Geist 有 Command Menu；antd 没有对应组件。源码 src/components/ui/command-menu.tsx。", "command_menu"),
};
export default meta;
type Story = StoryObj<typeof CommandMenu>;

function Demo() {
  const [open, setOpen] = React.useState(false);
  return (
    <Frame>
      <Button variant="secondary" onClick={() => setOpen(true)} suffix={<KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>}>
        搜索命令
      </Button>
      <CommandMenu
        open={open}
        onOpenChange={setOpen}
        items={[
          { id: "new-order", label: "新建订单", group: "操作", shortcut: "N" },
          { id: "dispatch", label: "批量派单", group: "操作" },
          { id: "vehicles", label: "前往车辆列表", group: "跳转", keywords: ["车", "vehicle"] },
          { id: "drivers", label: "前往司机列表", group: "跳转", keywords: ["司机", "driver"] },
        ]}
      />
    </Frame>
  );
}

export const Default: Story = { name: "打开命令面板", render: () => <Demo /> };
