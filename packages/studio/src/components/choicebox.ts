// 选择卡片（Geist Choicebox 的类型，antd 没有）：2–4 个需要解释差别的选项，整张卡片可点；单选用原生 radio、多选用原生 checkbox
// （键盘与读屏语义由浏览器提供，视觉上隐藏），选中时边框取 colorPrimary、底色取 colorPrimaryBg。
import { computed, defineComponent, type PropType } from "vue";
import { useAntdToken } from "./tokens";

export interface PmChoice {
  readonly value: string;
  readonly title: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

let uid = 0;

export const PmChoicebox = defineComponent({
  name: "PmChoicebox",
  props: {
    options: { type: Array as PropType<readonly PmChoice[]>, required: true },
    value: { type: [String, Array] as PropType<string | readonly string[]>, required: true },
    multiple: { type: Boolean, default: false },
    label: { type: String, required: true },
    columns: { type: Number, default: 2 },
  },
  emits: ["update:value"],
  setup(props, { emit }) {
    const token = useAntdToken();
    const name = `pm-choice-${++uid}`;
    const isOn = (value: string) => (Array.isArray(props.value) ? props.value.includes(value) : props.value === value);
    function toggle(value: string) {
      if (!props.multiple) return emit("update:value", value);
      const list = Array.isArray(props.value) ? props.value : [];
      emit("update:value", list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
    }
    const grid = computed(() => ({ display: "grid", gridTemplateColumns: `repeat(${props.columns}, minmax(0, 1fr))`, gap: `${token.value.marginSM}px`, border: 0, padding: 0, margin: 0 }));
    const card = (option: PmChoice) => ({
      position: "relative" as const,
      display: "flex",
      flexDirection: "column" as const,
      gap: `${token.value.marginXXS}px`,
      padding: `${token.value.paddingSM}px ${token.value.padding}px`,
      border: `1px solid ${isOn(option.value) ? token.value.colorPrimary : token.value.colorBorder}`,
      borderRadius: `${token.value.borderRadiusLG}px`,
      background: isOn(option.value) ? token.value.colorPrimaryBg : token.value.colorBgContainer,
      cursor: option.disabled ? "not-allowed" : "pointer",
      opacity: option.disabled ? 0.5 : 1,
    });
    const title = computed(() => ({ fontWeight: token.value.fontWeightStrong, color: token.value.colorText }));
    const desc = computed(() => ({ fontSize: `${token.value.fontSizeSM}px`, color: token.value.colorTextSecondary }));
    return { name, isOn, toggle, grid, card, title, desc };
  },
  template: `
    <fieldset data-slot="choicebox" :style="grid">
      <legend style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">{{ label }}</legend>
      <label v-for="option in options" :key="option.value" :style="card(option)">
        <input :type="multiple ? 'checkbox' : 'radio'" :name="name" :value="option.value" :checked="isOn(option.value)" :disabled="option.disabled" style="position:absolute;inset:0;opacity:0;margin:0;cursor:inherit" @change="toggle(option.value)" />
        <span :style="title">{{ option.title }}</span>
        <span v-if="option.description" :style="desc">{{ option.description }}</span>
      </label>
    </fieldset>`,
});
