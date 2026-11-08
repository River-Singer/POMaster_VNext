// 代码块（Geist Code Block 的类型，antd 没有）：文件名标题栏 + 复制按钮 + 可选行号；横向滚动不折行，等宽字体取 fontFamilyCode。
import { computed, defineComponent, ref } from "vue";
import { Button, message } from "ant-design-vue";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons-vue";
import { copyText, useAntdToken } from "./tokens";

export const PmCodeBlock = defineComponent({
  name: "PmCodeBlock",
  components: { AButton: Button, CheckOutlined, CopyOutlined },
  props: {
    code: { type: String, required: true },
    filename: { type: String, default: undefined },
    lineNumbers: { type: Boolean, default: false },
  },
  setup(props) {
    const token = useAntdToken();
    const copied = ref(false);
    const lines = computed(() => props.code.split("\n"));
    const box = computed(() => ({ border: `1px solid ${token.value.colorBorderSecondary}`, borderRadius: `${token.value.borderRadiusLG}px`, background: token.value.colorFillQuaternary, overflow: "hidden", margin: 0, position: "relative" as const }));
    const head = computed(() => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${token.value.paddingXXS}px ${token.value.paddingSM}px`, borderBottom: `1px solid ${token.value.colorBorderSecondary}`, fontFamily: token.value.fontFamilyCode, fontSize: `${token.value.fontSizeSM}px`, color: token.value.colorTextSecondary }));
    const pre = computed(() => ({ margin: 0, padding: `${token.value.paddingSM}px ${token.value.padding}px`, overflowX: "auto" as const, fontFamily: token.value.fontFamilyCode, fontSize: `${token.value.fontSizeSM}px`, lineHeight: token.value.lineHeight, color: token.value.colorText }));
    const gutter = computed(() => ({ display: "inline-block", width: "2em", marginRight: `${token.value.marginSM}px`, textAlign: "right" as const, color: token.value.colorTextQuaternary, userSelect: "none" as const }));
    async function copy() {
      try {
        await copyText(props.code);
        copied.value = true;
        window.setTimeout(() => (copied.value = false), 2000);
      } catch {
        void message.error("复制失败：浏览器不允许访问剪贴板");
      }
    }
    return { box, head, pre, gutter, lines, copied, copy };
  },
  template: `
    <figure data-slot="code-block" :style="box">
      <figcaption :style="head">
        <span>{{ filename ?? "代码" }}</span>
        <a-button type="text" size="small" :aria-label="copied ? '已复制' : '复制代码'" @click="copy">
          <template #icon><CheckOutlined v-if="copied" /><CopyOutlined v-else /></template>
        </a-button>
      </figcaption>
      <pre :style="pre"><code><span v-for="(line, i) in lines" :key="i" style="display:block"><span v-if="lineNumbers" aria-hidden="true" :style="gutter">{{ i + 1 }}</span>{{ line }}</span></code></pre>
      <span aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">{{ copied ? "已复制" : "" }}</span>
    </figure>`,
});
