import type { Meta, StoryObj } from "@storybook/vue3";
import { PmCodeBlock } from "../components/code-block";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/CodeBlock 代码块",
  parameters: describe("多行代码：文件名标题栏 + 复制按钮 + 可选行号，横向滚动不折行。ant-design-vue 没有代码块组件（Geist 有 Code Block），按 antd 的 token 自建：底色 colorFillQuaternary、边框 colorBorderSecondary、圆角 borderRadiusLG、字体 fontFamilyCode。源码 src/components/code-block.ts。", "code_block"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmCodeBlock },
    setup: () => ({ DEMO_STYLE, code: 'export function useVehicleList(filters) {\n  return useQuery({\n    queryKey: ["vehicle", "list", filters],\n    queryFn: () => vehicleApi.list(filters),\n  });\n}' }),
    template: `<div :style="DEMO_STYLE"><PmCodeBlock style="width:560px" filename="src/api/vehicle.ts" :code="code" line-numbers /></div>`,
  }),
};
