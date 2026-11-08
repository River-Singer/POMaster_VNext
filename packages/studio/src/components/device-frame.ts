// 设备外框（Geist Browser / Phone 的类型，antd 没有）：给截图或演示套上浏览器窗口或手机外框；外框是装饰（aria-hidden），
// 地址栏只是文字；颜色、圆角、投影取 antd token（三个圆点取 colorError / colorWarning / colorSuccess）。
import { computed, defineComponent } from "vue";
import { useAntdToken } from "./tokens";

export const PmBrowserFrame = defineComponent({
  name: "PmBrowserFrame",
  props: { address: { type: String, default: undefined } },
  setup() {
    const token = useAntdToken();
    const box = computed(() => ({ overflow: "hidden", border: `1px solid ${token.value.colorBorderSecondary}`, borderRadius: `${token.value.borderRadiusLG}px`, background: token.value.colorBgContainer, boxShadow: token.value.boxShadowSecondary }));
    const bar = computed(() => ({ display: "flex", alignItems: "center", gap: `${token.value.marginSM}px`, padding: `${token.value.paddingXS}px ${token.value.paddingSM}px`, borderBottom: `1px solid ${token.value.colorBorderSecondary}`, background: token.value.colorFillQuaternary }));
    const dot = (color: string) => ({ width: "12px", height: "12px", borderRadius: "50%", background: color, display: "inline-block" });
    const address = computed(() => ({ flex: 1, minWidth: 0, textAlign: "center" as const, padding: `0 ${token.value.paddingXS}px`, borderRadius: `${token.value.borderRadiusSM}px`, background: token.value.colorBgContainer, color: token.value.colorTextSecondary, fontSize: `${token.value.fontSizeSM}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }));
    return { token, box, bar, dot, address };
  },
  template: `
    <div data-slot="browser-frame" :style="box">
      <div aria-hidden="true" :style="bar">
        <span style="display:flex;gap:8px"><span :style="dot(token.colorError)" /><span :style="dot(token.colorWarning)" /><span :style="dot(token.colorSuccess)" /></span>
        <span v-if="address" :style="address">{{ address }}</span>
      </div>
      <div><slot /></div>
    </div>`,
});

export const PmPhoneFrame = defineComponent({
  name: "PmPhoneFrame",
  props: { width: { type: Number, default: 220 } },
  setup(props) {
    const token = useAntdToken();
    const shell = computed(() => ({ position: "relative" as const, width: `${props.width}px`, border: `8px solid ${token.value.colorText}`, borderRadius: "36px", background: token.value.colorText, boxShadow: token.value.boxShadow }));
    const screen = computed(() => ({ aspectRatio: "9 / 19.5", overflow: "hidden", borderRadius: "28px", background: token.value.colorBgContainer }));
    const notch = computed(() => ({ position: "absolute" as const, top: "8px", left: "50%", transform: "translateX(-50%)", width: "72px", height: "18px", borderRadius: "9px", background: token.value.colorText, zIndex: 1 }));
    return { shell, screen, notch };
  },
  template: `<div data-slot="phone-frame" :style="shell"><span aria-hidden="true" :style="notch" /><div :style="screen"><slot /></div></div>`,
});
