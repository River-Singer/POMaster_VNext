import type { Meta, StoryObj } from "@storybook/react";
import { Snippet } from "../components/ui/snippet";
import { Column, describe } from "./frame";

const meta: Meta<typeof Snippet> = {
  title: "Geist 组件/通用/Snippet 命令片段",
  component: Snippet,
  parameters: describe("一行或几行要复制去终端执行的命令：行首「$」提示符不进剪贴板，右侧复制按钮。Geist 有 Snippet；antd 没有对应组件。源码 src/components/ui/snippet.tsx。", "snippet"),
};
export default meta;
type Story = StoryObj<typeof Snippet>;

export const Default: Story = {
  name: "单行与多行",
  render: () => (
    <Column>
      <Snippet text="corepack pnpm studio:react:dev" />
      <Snippet text={["pomaster design validate --system geist", "node packages/studio-react/run.mjs generate"]} />
      <Snippet text="pomaster doctor --json" dark />
    </Column>
  ),
};
