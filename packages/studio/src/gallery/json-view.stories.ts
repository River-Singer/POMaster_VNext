import type { Meta, StoryObj } from "@storybook/vue3";
import { PmJsonView } from "../components/json-view";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/JsonView JSON 查看器",
  parameters: describe("只读可折叠的 JSON 树：展开按钮带 aria-expanded，默认展开两层，字符串保留引号，类型配色取 antd 的语义文字色（只是辅助），整段可复制。用于审计日志、Webhook 载荷、接口调试。ant-design-vue 没有这个组件。源码 src/components/json-view.ts。", "json_view"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmJsonView },
    setup: () => ({
      DEMO_STYLE,
      payload: { id: "evt_8f2c", type: "order.delivered", created_at: "2026-11-07T11:42:03+08:00", data: { order_id: "ORD-20261107-0042", vehicle: { plate: "沪A·D2391", driver: "张伟" }, weight_kg: 1830.5, signed: true, photos: ["front.jpg", "receipt.jpg"], remark: null } },
    }),
    template: `<div :style="DEMO_STYLE"><PmJsonView label="order.delivered" :value="payload" style="width:560px" /></div>`,
  }),
};
