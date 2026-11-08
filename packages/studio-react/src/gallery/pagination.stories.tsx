import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Pagination } from "../components/ui/pagination";
import { Frame, describe } from "./frame";

const meta: Meta<typeof Pagination> = {
  title: "Geist 组件/导航/Pagination 分页",
  component: Pagination,
  parameters: describe("表格与列表的分页：总数、页码窗口（首尾页 + 当前页附近，其余折叠成省略号）、上一页 / 下一页、每页条数；当前页 aria-current=\"page\"；页码写进地址（见规范「列表页」）。源码 src/components/ui/pagination.tsx。", "pagination"),
};
export default meta;
type Story = StoryObj<typeof Pagination>;

function Demo() {
  const [state, setState] = React.useState({ page: 6, pageSize: 20 });
  return (
    <Frame>
      <Pagination page={state.page} pageSize={state.pageSize} total={1286} onChange={(page, pageSize) => setState({ page, pageSize })} />
    </Frame>
  );
}

export const Default: Story = { name: "页码与每页条数", render: () => <Demo /> };
