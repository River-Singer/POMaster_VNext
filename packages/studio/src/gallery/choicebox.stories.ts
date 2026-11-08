import type { Meta, StoryObj } from "@storybook/vue3";
import { ref } from "vue";
import { PmChoicebox } from "../components/choicebox";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/Choicebox 选择卡片",
  parameters: describe("带标题与说明的大号选项卡片：2–4 个需要解释差别的选项，单选用原生 radio、多选用原生 checkbox（键盘与读屏语义由浏览器提供），选中时边框 colorPrimary、底色 colorPrimaryBg。ant-design-vue 没有这个组件（Geist 有 Choicebox），按 antd 的 token 自建。源码 src/components/choicebox.ts。", "choicebox"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmChoicebox },
    setup() {
      const plan = ref("standard");
      const extras = ref(["gps"]);
      const plans = [
        { value: "standard", title: "标准配送", description: "次日送达，费用最低" },
        { value: "express", title: "加急配送", description: "当日 4 小时内送达" },
        { value: "night", title: "夜间配送", description: "22:00 后，暂未开通", disabled: true },
      ];
      const services = [
        { value: "gps", title: "实时定位", description: "收货人可查看车辆位置" },
        { value: "insure", title: "货物保险", description: "按货值 0.3% 计费" },
      ];
      return { DEMO_STYLE, plan, extras, plans, services };
    },
    template: `<div :style="DEMO_STYLE + ';flex-direction:column;max-width:560px'"><PmChoicebox v-model:value="plan" label="配送时效" :options="plans" :columns="3" /><PmChoicebox v-model:value="extras" label="附加服务" :options="services" multiple /></div>`,
  }),
};
