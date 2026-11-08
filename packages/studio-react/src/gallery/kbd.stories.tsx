import type { Meta, StoryObj } from "@storybook/react";
import { Kbd, KbdGroup } from "../components/ui/kbd";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Kbd> = {
  title: "Geist 组件/通用/Kbd 键盘按键",
  component: Kbd,
  parameters: describe("快捷键提示：用 <kbd>，组合键用 KbdGroup 连起来；按平台写 ⌘ 或 Ctrl。源码 src/components/ui/kbd.tsx。", "kbd"),
};
export default meta;
type Story = StoryObj<typeof Kbd>;

export const Default: Story = {
  name: "单键与组合键",
  render: () => (
    <Frame>
      <span className="text-copy-14">打开命令面板</span>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
      <span className="text-copy-14">关闭</span>
      <Kbd>Esc</Kbd>
    </Frame>
  ),
};
