import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { SearchInput } from "../components/ui/search-input";
import { Column, describe } from "./frame";

const meta: Meta<typeof SearchInput> = {
  title: "Geist 组件/数据录入/SearchInput 搜索框",
  component: SearchInput,
  parameters: describe("type=\"search\" 的输入框 + 放大镜 + 清空按钮；输入防抖后触发搜索（默认 300ms），回车立即搜索；在 role=\"search\" 的区域里。源码 src/components/ui/search-input.tsx。", "search_input"),
};
export default meta;
type Story = StoryObj<typeof SearchInput>;

function Demo() {
  const [query, setQuery] = React.useState("");
  return (
    <Column className="w-80">
      <SearchInput aria-label="搜索车辆" placeholder="车牌号、司机或订单号" onSearch={setQuery} />
      <span className="text-copy-13 text-ds-gray-900">{query === "" ? "输入后自动搜索" : `正在搜索「${query}」`}</span>
    </Column>
  );
}

export const Default: Story = { name: "防抖搜索", render: () => <Demo /> };
