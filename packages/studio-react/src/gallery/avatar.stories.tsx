import type { Meta, StoryObj } from "@storybook/react";
import { Avatar, AvatarGroup } from "../components/ui/avatar";
import { Column, describe } from "./frame";

const meta: Meta<typeof Avatar> = {
  title: "Geist 组件/数据展示/Avatar 头像",
  component: Avatar,
  parameters: describe("头像（Radix Avatar）：没有图或加载失败时显示姓名缩写（中文取最后一个字），底色按姓名稳定取色阶；旁边已有姓名时设 decorative（alt 留空）。AvatarGroup 叠放并以「+N」收尾，整组有可读名称。源码 src/components/ui/avatar.tsx。", "avatar"),
};
export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {
  name: "尺寸、形状与头像组",
  render: () => (
    <Column>
      <div className="flex items-center gap-3">
        <Avatar name="张伟" size={24} />
        <Avatar name="李娜" size={32} />
        <Avatar name="Wang Fang" size={40} />
        <Avatar name="刘洋" size={64} />
        <Avatar name="浦东车队" shape="square" size={40} />
      </div>
      <AvatarGroup names={["张伟", "李娜", "王芳", "刘洋", "陈杰", "赵敏"]} max={4} />
    </Column>
  ),
};
