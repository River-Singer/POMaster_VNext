import type { Meta, StoryObj } from "@storybook/react";
import { Flex } from "../components/ui/flex";
import { Column, describe } from "./frame";

const meta: Meta<typeof Flex> = {
  title: "Geist 组件/布局/Flex 弹性布局",
  component: Flex,
  parameters: describe("一维排布：方向、对齐、换行与间距，间距只取 4px 倍数的档位（0 / 4 / 8 / 12 / 16 / 24 / 32）。源码 src/components/ui/flex.tsx。", "flex"),
};
export default meta;
type Story = StoryObj<typeof Flex>;

const Box = ({ children }: { readonly children: string }) => <span className="rounded-md border border-ds-gray-400 bg-ds-background-200 px-3 py-2 text-label-13">{children}</span>;

export const Default: Story = {
  name: "方向与对齐",
  render: () => (
    <Column>
      <Flex gap={2}><Box>车牌</Box><Box>司机</Box><Box>状态</Box></Flex>
      <Flex justify="between" className="w-full"><Box>左对齐</Box><Box>两端</Box></Flex>
      <Flex direction="column" gap={1}><Box>纵向 1</Box><Box>纵向 2</Box></Flex>
    </Column>
  ),
};
