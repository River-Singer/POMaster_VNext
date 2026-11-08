// 地址输入（Geist Address Input 的类型，antd 没有成品）：一组地址字段（fieldset）——省市区用 antdv Cascader，详细地址与邮编
// 用 Input，各自带标签与 autocomplete 提示。
import { defineComponent, type PropType } from "vue";
import { Cascader, Form, FormItem, Input } from "ant-design-vue";

export interface PmAddress {
  readonly region: string[];
  readonly detail: string;
  readonly postcode?: string;
}

export const PmAddressInput = defineComponent({
  name: "PmAddressInput",
  components: { ACascader: Cascader, AForm: Form, AFormItem: FormItem, AInput: Input },
  props: {
    value: { type: Object as PropType<PmAddress>, required: true },
    regions: { type: Array as PropType<unknown[]>, required: true },
    legend: { type: String, default: "地址" },
    withPostcode: { type: Boolean, default: false },
  },
  emits: ["update:value"],
  setup(props, { emit }) {
    const patch = (part: Partial<PmAddress>) => emit("update:value", { ...props.value, ...part });
    return { patch };
  },
  template: `
    <fieldset data-slot="address-input" style="border:0;padding:0;margin:0">
      <legend style="font-weight:600;margin-bottom:8px">{{ legend }}</legend>
      <a-form layout="vertical">
        <a-form-item label="省 / 市 / 区"><a-cascader :value="value.region" :options="regions" placeholder="请选择" @change="(v) => patch({ region: v })" /></a-form-item>
        <a-form-item label="详细地址"><a-input :value="value.detail" autocomplete="street-address" placeholder="街道、门牌号" @update:value="(v) => patch({ detail: v })" /></a-form-item>
        <a-form-item v-if="withPostcode" label="邮政编码"><a-input :value="value.postcode" autocomplete="postal-code" inputmode="numeric" maxlength="6" style="width:160px" @update:value="(v) => patch({ postcode: v })" /></a-form-item>
      </a-form>
    </fieldset>`,
});
