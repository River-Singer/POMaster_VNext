import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { FilterBar, type ActiveFilter } from "../components/ui/filter-bar";
import { Column, describe } from "./frame";

const meta: Meta<typeof FilterBar> = {
  title: "Geist 组件/数据录入/FilterBar 筛选条",
  component: FilterBar,
  parameters: describe("列表上方的筛选条：已生效的筛选显示为可移除的标签（「状态：在途 ×」），「添加筛选」下拉追加条件，「清除全部」一键复位；筛选写进地址。Geist 的 Filter 组件；antd 没有对应组件。源码 src/components/ui/filter-bar.tsx。", "filter_bar"),
};
export default meta;
type Story = StoryObj<typeof FilterBar>;

function Demo() {
  const [filters, setFilters] = React.useState<ActiveFilter[]>([
    { key: "status", label: "状态", value: "在途" },
    { key: "team", label: "车队", value: "浦东车队" },
  ]);
  const available = [
    { key: "status", label: "状态" },
    { key: "team", label: "车队" },
    { key: "driver", label: "司机" },
    { key: "date", label: "发车日期" },
  ];
  return (
    <Column className="w-full">
      <FilterBar
        filters={filters}
        available={available}
        onRemove={(key) => setFilters((list) => list.filter((item) => item.key !== key))}
        onClear={() => setFilters([])}
        onAdd={(key) => setFilters((list) => [...list, { key, label: available.find((item) => item.key === key)!.label, value: "全部" }])}
      />
    </Column>
  );
}

export const Default: Story = { name: "增删筛选", render: () => <Demo /> };
