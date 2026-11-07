// 规范页实时示例可用的辅助组件（Vue · Ant Design 抽屉）。antd 没有现成组件、规范又要演示的行为放在这里，
// 写法与规范条文一致，可以直接搬进项目。React 画廊对应的组件在 studio-react/src/components/ui 下。
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType } from "vue";

type Part = { readonly key: string; readonly digit: number } | { readonly key: string; readonly char: string };

/** "¥48,240" → 从右往左编号的片段：个位始终是 d0，数位增加时左边多出新列而已有列保持身份。 */
export function splitNumberText(text: string): Part[] {
  const parts: Part[] = [];
  let digits = 0;
  let others = 0;
  for (const char of [...text].reverse()) {
    if (char >= "0" && char <= "9") parts.unshift({ key: `d${digits++}`, digit: char.charCodeAt(0) - 48 });
    else parts.unshift({ key: `s${others++}`, char });
  }
  return parts;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 数字滚动（CMOTION.VALUE_CHANGE）：只滚动变化的数位，货币符号与千分位不动，等宽数字，停在最终值；
 * 读屏读到的是完整数值；减少动效时直接显示最终值。做法参考 affectUI 的 Number Ticker（MIT），独立实现。
 */
export const StdNumberRoll = defineComponent({
  name: "StdNumberRoll",
  props: {
    value: { type: Number, required: true },
    format: { type: Object as PropType<Intl.NumberFormatOptions>, default: () => ({}) },
    locale: { type: String, default: undefined },
    duration: { type: Number, default: 600 },
  },
  setup(props) {
    const reduced = ref(prefersReducedMotion());
    let query: MediaQueryList | null = null;
    const onChange = () => {
      reduced.value = query?.matches ?? false;
    };
    onMounted(() => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
      query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener?.("change", onChange);
    });
    onBeforeUnmount(() => query?.removeEventListener?.("change", onChange));
    const text = computed(() => (Number.isFinite(props.value) ? new Intl.NumberFormat(props.locale, props.format).format(props.value) : "—"));
    const parts = computed(() => splitNumberText(text.value));
    const cell = { display: "block", height: "1.15em", lineHeight: "1.15em", textAlign: "center" } as const;
    return () =>
      h("span", { class: "std-number-roll", style: { position: "relative", display: "inline-flex", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", lineHeight: "1.15em" } }, [
        h("span", { style: { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } }, text.value),
        h(
          "span",
          { "aria-hidden": "true", style: { display: "inline-flex" } },
          parts.value.map((part) =>
            "digit" in part
              ? h("span", { key: part.key, style: { display: "inline-block", height: "1.15em", overflow: "hidden" } }, [
                  h(
                    "span",
                    {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        transform: `translateY(${-part.digit * 10}%)`,
                        transition: reduced.value ? "none" : `transform ${props.duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                      },
                    },
                    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => h("span", { key: digit, style: cell }, String(digit))),
                  ),
                ])
              : h("span", { key: part.key, style: { ...cell, whiteSpace: "pre" } }, part.char),
          ),
        ),
      ]);
  },
});

/** 实时示例里能直接用的辅助组件（模板里写 <std-number-roll>）。 */
export const LIVE_EXTRAS = { StdNumberRoll } as const;
