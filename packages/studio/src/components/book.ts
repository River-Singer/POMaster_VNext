// 书封（Geist Book 的类型，antd 没有）：文档、指南、手册的封面卡片，整张是指向那份文档的链接；书脊阴影 + 标题 + 可选图标；
// 悬停轻微翻开（减少动效时不动）；底色取 antd 的品牌色 / 功能色 token。
import { computed, defineComponent, ref, type PropType } from "vue";
import { useAntdToken } from "./tokens";

export const PmBook = defineComponent({
  name: "PmBook",
  props: {
    title: { type: String, required: true },
    href: { type: String, required: true },
    tone: { type: String as PropType<"neutral" | "primary" | "success" | "warning">, default: "neutral" },
    width: { type: Number, default: 160 },
  },
  setup(props) {
    const token = useAntdToken();
    const hover = ref(false);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const bg = computed(() => ({ neutral: token.value.colorText, primary: token.value.colorPrimary, success: token.value.colorSuccess, warning: token.value.colorWarning })[props.tone]);
    const link = computed(() => ({ display: "inline-block", width: `${props.width}px`, perspective: "900px", color: token.value.colorTextLightSolid, textDecoration: "none", borderRadius: `${token.value.borderRadius}px` }));
    const cover = computed(() => ({
      position: "relative" as const,
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "space-between",
      aspectRatio: "49 / 60",
      padding: `${token.value.padding}px ${token.value.padding}px ${token.value.padding}px ${token.value.paddingLG}px`,
      borderRadius: `${token.value.borderRadiusSM}px ${token.value.borderRadius}px ${token.value.borderRadius}px ${token.value.borderRadiusSM}px`,
      background: bg.value,
      boxShadow: token.value.boxShadowSecondary,
      transformOrigin: "left",
      transition: reduce ? "none" : `transform ${token.value.motionDurationSlow}`,
      transform: hover.value && !reduce ? "rotateY(-18deg)" : "none",
      fontSize: `${token.value.fontSizeLG}px`,
      fontWeight: token.value.fontWeightStrong,
    }));
    const spine = computed(() => ({ position: "absolute" as const, top: 0, bottom: 0, left: 0, width: "8px", background: token.value.colorFillSecondary }));
    return { hover, link, cover, spine };
  },
  template: `
    <a data-slot="book" :href="href" :style="link" @mouseenter="hover = true" @mouseleave="hover = false" @focus="hover = true" @blur="hover = false">
      <span :style="cover"><span aria-hidden="true" :style="spine" /><span>{{ title }}</span><span aria-hidden="true"><slot name="icon" /></span></span>
    </a>`,
});
