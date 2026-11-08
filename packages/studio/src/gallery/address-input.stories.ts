import type { Meta, StoryObj } from "@storybook/vue3";
import { ref } from "vue";
import { PmAddressInput } from "../components/address-input";
import { DEMO_STYLE, REGIONS, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/AddressInput 地址输入",
  parameters: describe("一组地址字段：省市区用 antdv Cascader，详细地址与邮编用 Input，各自带标签与 autocomplete 提示。ant-design-vue 没有成品地址组件（Geist 有 Address Input，按国外地址格式），这里按国内地址结构用 antdv 组件拼。源码 src/components/address-input.ts。", "address_input"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmAddressInput },
    setup: () => ({ DEMO_STYLE, regions: REGIONS, address: ref({ region: ["sh", "pd", "zj"], detail: "碧波路 690 号 3 号门" }) }),
    template: `<div :style="DEMO_STYLE"><PmAddressInput v-model:value="address" legend="提货地址" :regions="regions" with-postcode style="width:420px" /></div>`,
  }),
};
