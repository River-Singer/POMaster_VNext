import type { Meta, StoryObj } from "@storybook/react";
import { SplitButton } from "../components/ui/split-button";
import { Frame, describe } from "./frame";

const meta: Meta<typeof SplitButton> = {
  title: "Geist 组件/通用/SplitButton 分裂按钮",
  component: SplitButton,
  parameters: describe("主操作 + 下拉的相关操作：左边按钮直接执行最常用的那个，右边箭头打开菜单（Radix DropdownMenu），箭头按钮有自己的名称。Geist 有 Split Button；变体与尺寸沿用 Button。源码 src/components/ui/split-button.tsx。", "split_button"),
};
export default meta;
type Story = StoryObj<typeof SplitButton>;

export const Default: Story = {
  name: "主操作与更多",
  render: () => (
    <Frame>
      <SplitButton menuLabel="更多派单方式" actions={[{ key: "batch", label: "批量派单" }, { key: "schedule", label: "定时派单" }, { key: "draft", label: "存为草稿", disabled: true }]}>
        立即派单
      </SplitButton>
      <SplitButton variant="secondary" size="small" menuLabel="更多导出格式" actions={[{ key: "csv", label: "导出 CSV" }, { key: "pdf", label: "导出 PDF" }]}>
        导出 Excel
      </SplitButton>
      <SplitButton disabled menuLabel="更多操作" actions={[{ key: "a", label: "复制" }]}>
        发布
      </SplitButton>
    </Frame>
  ),
};
