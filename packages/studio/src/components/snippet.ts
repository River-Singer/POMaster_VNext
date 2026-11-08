// 命令片段（Geist Snippet 的类型，antd 没有）：一行或几行终端命令，行首「$」不进剪贴板，右侧复制按钮；dark 为深色底。
import { computed, defineComponent, ref } from "vue";
import { Button, message } from "ant-design-vue";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons-vue";
import { copyText, useAntdToken } from "./tokens";

export const PmSnippet = defineComponent({
  name: "PmSnippet",
  components: { AButton: Button, CheckOutlined, CopyOutlined },
  props: {
    text: { type: [String, Array] as unknown as () => string | string[], required: true },
    prompt: { type: Boolean, default: true },
    dark: { type: Boolean, default: false },
  },
  setup(props) {
    const token = useAntdToken();
    const copied = ref(false);
    const lines = computed(() => (Array.isArray(props.text) ? props.text : [props.text]));
    const box = computed(() => ({
      display: "inline-flex",
      alignItems: "flex-start",
      gap: `${token.value.marginSM}px`,
      padding: `${token.value.paddingXS}px ${token.value.paddingXS}px ${token.value.paddingXS}px ${token.value.paddingSM}px`,
      borderRadius: `${token.value.borderRadius}px`,
      border: `1px solid ${props.dark ? token.value.colorText : token.value.colorBorderSecondary}`,
      background: props.dark ? token.value.colorText : token.value.colorFillQuaternary,
      color: props.dark ? token.value.colorBgContainer : token.value.colorText,
      fontFamily: token.value.fontFamilyCode,
      fontSize: `${token.value.fontSizeSM}px`,
      lineHeight: `${token.value.controlHeightSM}px`,
    }));
    const promptStyle = computed(() => ({ color: props.dark ? token.value.colorTextQuaternary : token.value.colorTextTertiary, userSelect: "none" as const, marginRight: `${token.value.marginXS}px` }));
    async function copy() {
      try {
        await copyText(lines.value.join("\n"));
        copied.value = true;
        window.setTimeout(() => (copied.value = false), 2000);
      } catch {
        void message.error("复制失败：浏览器不允许访问剪贴板");
      }
    }
    return { box, promptStyle, lines, copied, copy };
  },
  template: `
    <div data-slot="snippet" :style="box">
      <pre style="margin:0;font:inherit"><span v-for="(line, i) in lines" :key="i" style="display:block"><span v-if="prompt" aria-hidden="true" :style="promptStyle">$</span>{{ line }}</span></pre>
      <a-button type="text" size="small" :style="dark ? 'color:inherit' : ''" :aria-label="copied ? '已复制' : '复制命令'" @click="copy">
        <template #icon><CheckOutlined v-if="copied" /><CopyOutlined v-else /></template>
      </a-button>
    </div>`,
});
