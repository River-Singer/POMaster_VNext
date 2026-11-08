import type { Meta, StoryObj } from "@storybook/vue3";
import { PmScroller } from "../components/scroller";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/Scroller 滚动区",
  parameters: describe("固定高度的局部滚动容器：保留原生滚动与键盘滚动（容器可聚焦、有名称），细滚动条取 colorFillSecondary。ant-design-vue 没有独立的滚动区组件（Geist 有 Scroller），按 antd 的 token 自建。源码 src/components/scroller.ts。", "scroller"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmScroller },
    setup: () => ({ DEMO_STYLE, plates: Array.from({ length: 24 }, (_, i) => `沪A·D${2300 + i}`) }),
    template: `<div :style="DEMO_STYLE"><PmScroller label="车辆列表" style="width:240px"><ul style="list-style:none;margin:0;padding:8px 12px"><li v-for="plate in plates" :key="plate" style="padding:6px 0">{{ plate }}</li></ul></PmScroller></div>`,
  }),
};
