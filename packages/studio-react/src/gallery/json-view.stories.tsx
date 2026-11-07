import type { Meta, StoryObj } from "@storybook/react";
import { JsonView } from "../components/ui/json-view";
import { Column, describe } from "./frame";

const meta: Meta<typeof JsonView> = {
  title: "Geist 组件/数据展示/JsonView JSON 查看器",
  component: JsonView,
  parameters: describe("只读的 JSON 树：对象与数组可折叠（按钮带 aria-expanded），默认展开两层；字符串保留引号、各类型配色只是辅助；整段可复制。用于审计日志、Webhook 载荷、接口调试。Geist 有 JSON 相关展示；antd 没有对应组件。源码 src/components/ui/json-view.tsx。", "json_view"),
};
export default meta;
type Story = StoryObj<typeof JsonView>;

export const Default: Story = {
  name: "Webhook 载荷",
  render: () => (
    <Column className="w-full max-w-xl">
      <JsonView
        label="order.delivered"
        className="w-full"
        value={{
          id: "evt_8f2c",
          type: "order.delivered",
          created_at: "2026-11-07T11:42:03+08:00",
          data: { order_id: "ORD-20261107-0042", vehicle: { plate: "沪A·D2391", driver: "张伟" }, weight_kg: 1830.5, signed: true, photos: ["front.jpg", "receipt.jpg"], remark: null },
        }}
      />
    </Column>
  ),
};
