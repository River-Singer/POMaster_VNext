import type { Meta, StoryObj } from "@storybook/react";
import { CodeBlock } from "../components/ui/code-block";
import { Column, describe } from "./frame";

const meta: Meta<typeof CodeBlock> = {
  title: "Geist 组件/通用/CodeBlock 代码块",
  component: CodeBlock,
  parameters: describe("多行代码：文件名标题栏 + 复制按钮 + 可选行号，横向滚动不折行，等宽字体。Geist 有 Code Block；antd 没有对应组件。源码 src/components/ui/code-block.tsx。", "code_block"),
};
export default meta;
type Story = StoryObj<typeof CodeBlock>;

export const Default: Story = {
  name: "带文件名与行号",
  render: () => (
    <Column>
      <CodeBlock
        filename="src/api/vehicle.ts"
        language="ts"
        lineNumbers
        code={`export function useVehicleList(filters: VehicleFilters) {\n  return useQuery({\n    queryKey: ["vehicle", "list", filters],\n    queryFn: () => vehicleApi.list(filters),\n  });\n}`}
      />
    </Column>
  ),
};
