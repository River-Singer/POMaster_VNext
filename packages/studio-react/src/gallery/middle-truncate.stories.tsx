import type { Meta, StoryObj } from "@storybook/react";
import { MiddleTruncate } from "../components/ui/middle-truncate";
import { Column, describe } from "./frame";

const meta: Meta<typeof MiddleTruncate> = {
  title: "Geist 组件/数据展示/MiddleTruncate 中间省略",
  component: MiddleTruncate,
  parameters: describe("长路径、哈希、文件名保留开头和结尾、省略中间（结尾往往最有区分度）；全文在 title 与读屏文字里，复制时拿到全文。Geist 有 Middle Truncate；antd 的 Typography ellipsis 只能省略结尾。源码 src/components/ui/middle-truncate.tsx。", "middle_truncate"),
};
export default meta;
type Story = StoryObj<typeof MiddleTruncate>;

export const Default: Story = {
  name: "路径与哈希",
  render: () => (
    <Column>
      <MiddleTruncate className="font-mono text-copy-13" text="uploads/2026/11/07/vehicle/沪A·D2391/inspection-report-final-v3.pdf" max={36} tail={18} />
      <MiddleTruncate className="font-mono text-copy-13" text="sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" max={24} />
      <MiddleTruncate className="text-copy-14" text="短文本不省略" />
    </Column>
  ),
};
