// 滚动区（Geist Scroller 的类型，antd 没有独立组件）：固定高度的局部滚动容器，保留原生滚动与键盘滚动（容器可聚焦、
// 有名称），滚动条细、颜色取 antd 的填充色 token。
import { computed, defineComponent } from "vue";
import { useAntdToken } from "./tokens";

export const PmScroller = defineComponent({
  name: "PmScroller",
  props: {
    label: { type: String, required: true },
    height: { type: Number, default: 192 },
  },
  setup(props) {
    const token = useAntdToken();
    const box = computed(() => ({
      height: `${props.height}px`,
      overflowY: "auto" as const,
      border: `1px solid ${token.value.colorBorderSecondary}`,
      borderRadius: `${token.value.borderRadiusLG}px`,
      scrollbarWidth: "thin" as const,
      scrollbarColor: `${token.value.colorFillSecondary} transparent`,
      outlineColor: token.value.colorPrimary,
    }));
    return { box };
  },
  template: `<div data-slot="scroller" role="region" :aria-label="label" tabindex="0" :style="box"><slot /></div>`,
});
