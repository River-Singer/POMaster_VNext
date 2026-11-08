// 相对时间（Geist Relative Time 的类型，antd 没有）：显示「3 分钟前」，<time datetime> 带机器可读时间，悬停或聚焦时 antdv Tooltip
// 显示带时区的绝对时间；每分钟刷新；超过 7 天直接显示日期。
import { computed, defineComponent, onBeforeUnmount, onMounted, ref, type PropType } from "vue";
import { Tooltip } from "ant-design-vue";
import { useAntdToken } from "./tokens";

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

export function formatRelative(date: Date, now: Date = new Date(), locale = "zh-CN"): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 45_000) return diff <= 0 ? "刚刚" : "马上";
  if (abs >= 7 * 86_400_000) return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of UNITS) if (abs >= ms) return format.format(Math.round(diff / ms), unit);
  return format.format(Math.round(diff / 60_000), "minute");
}

export const PmRelativeTime = defineComponent({
  name: "PmRelativeTime",
  components: { ATooltip: Tooltip },
  props: { date: { type: [Date, String] as PropType<Date | string>, required: true } },
  setup(props) {
    const token = useAntdToken();
    const now = ref(new Date());
    let timer: number | undefined;
    onMounted(() => (timer = window.setInterval(() => (now.value = new Date()), 60_000)));
    onBeforeUnmount(() => window.clearInterval(timer));
    const value = computed(() => (typeof props.date === "string" ? new Date(props.date) : props.date));
    const text = computed(() => formatRelative(value.value, now.value));
    const absolute = computed(() => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(value.value));
    const style = computed(() => ({ color: token.value.colorTextSecondary, fontSize: `${token.value.fontSizeSM}px`, textDecoration: "underline dotted", textUnderlineOffset: "4px" }));
    return { value, text, absolute, style };
  },
  template: `<a-tooltip :title="absolute"><time data-slot="relative-time" :datetime="value.toISOString()" tabindex="0" :style="style">{{ text }}</time></a-tooltip>`,
});
