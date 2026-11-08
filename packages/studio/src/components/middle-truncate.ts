// 中间省略（Geist Middle Truncate 的类型；antd Typography 的 ellipsis 只能省略结尾）：长路径、哈希、文件名保留开头和结尾、
// 省略中间；全文在 title 与读屏文字里，复制时拿到全文。
import { computed, defineComponent } from "vue";

export function middleTruncate(text: string, max: number, tail = Math.floor((max - 1) / 2)): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = max - 1 - tail;
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
}

export const PmMiddleTruncate = defineComponent({
  name: "PmMiddleTruncate",
  props: {
    text: { type: String, required: true },
    max: { type: Number, default: 32 },
    tail: { type: Number, default: undefined },
  },
  setup(props) {
    const shown = computed(() => middleTruncate(props.text, props.max, props.tail));
    const truncated = computed(() => shown.value !== props.text);
    function onCopy(event: ClipboardEvent) {
      event.clipboardData?.setData("text/plain", props.text);
      event.preventDefault();
    }
    return { shown, truncated, onCopy };
  },
  template: `
    <span data-slot="middle-truncate" :title="truncated ? text : undefined" style="position:relative;white-space:nowrap" @copy="onCopy">
      <span :aria-hidden="truncated ? 'true' : undefined">{{ shown }}</span>
      <span v-if="truncated" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">{{ text }}</span>
    </span>`,
});
