import type { Meta, StoryObj } from "@storybook/react";
import { Anchor } from "../components/ui/anchor";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Anchor> = {
  title: "Geist 组件/导航/Anchor 锚点",
  component: Anchor,
  parameters: describe("长页面的本页目录：nav + 链接列表，当前段落用 aria-current 标出，点击平滑滚动（减少动效时直接跳转）。源码 src/components/ui/anchor.tsx。", "anchor"),
};
export default meta;
type Story = StoryObj<typeof Anchor>;

export const Default: Story = {
  name: "本页目录",
  render: () => (
    <Frame>
      <Anchor
        defaultActive="basic"
        items={[
          { id: "basic", label: "基本信息" },
          { id: "driver", label: "司机", children: [{ id: "license", label: "驾驶证" }, { id: "contact", label: "联系方式" }] },
          { id: "maintenance", label: "保养记录" },
        ]}
      />
    </Frame>
  ),
};
