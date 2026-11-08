// JSON 查看器（Geist 的 JSON 展示类型，antd 没有）：只读可折叠的 JSON 树——对象 / 数组的展开按钮带 aria-expanded，默认展开两层；
// 字符串保留引号，各类型配色取 antd 的语义文字色 token（只是辅助）；整段可复制。不 eval 任何内容。
import { computed, defineComponent, h, ref, type PropType, type VNode } from "vue";
import { Button, message } from "ant-design-vue";
import { CopyOutlined, RightOutlined } from "@ant-design/icons-vue";
import { copyText, useAntdToken, type AntdToken } from "./tokens";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const JsonNode = defineComponent({
  name: "PmJsonNode",
  props: {
    name: { type: String, default: undefined },
    value: { type: null as unknown as PropType<Json>, default: null },
    depth: { type: Number, required: true },
    expandDepth: { type: Number, required: true },
    token: { type: Object as PropType<AntdToken>, required: true },
  },
  setup(props) {
    const open = ref(props.depth < props.expandDepth);
    return (): VNode => {
      const t = props.token;
      const pad = { paddingLeft: `${props.depth * 16}px` };
      const key = props.name !== undefined ? h("span", { style: { color: t.colorText } }, `${JSON.stringify(props.name)}: `) : null;
      const v = props.value;
      if (v === null || typeof v !== "object") {
        const color = v === null ? t.colorTextTertiary : typeof v === "boolean" ? t.colorWarningText : typeof v === "number" ? t.colorPrimaryText : t.colorSuccessText;
        return h("div", { style: pad }, [key, h("span", { style: { color } }, v === null ? "null" : typeof v === "string" ? JSON.stringify(v) : String(v))]);
      }
      const isArray = Array.isArray(v);
      const entries: Array<[string | undefined, Json]> = isArray ? (v as Json[]).map((item) => [undefined, item]) : Object.entries(v as Record<string, Json>);
      const [openMark, closeMark] = isArray ? ["[", "]"] : ["{", "}"];
      const muted = { color: t.colorTextTertiary };
      const toggle = h(
        "button",
        {
          type: "button",
          "aria-expanded": open.value ? "true" : "false",
          "aria-label": `${open.value ? "折叠" : "展开"} ${props.name ?? (isArray ? "数组" : "对象")}`,
          style: { marginLeft: "-16px", width: "16px", border: 0, padding: 0, background: "transparent", cursor: "pointer", color: t.colorTextTertiary },
          onClick: () => (open.value = !open.value),
        },
        [h(RightOutlined, { style: { fontSize: "10px", transform: open.value ? "rotate(90deg)" : "none" } })],
      );
      const head = h("div", { style: { ...pad, display: "flex", alignItems: "center" } }, [toggle, key, h("span", { style: muted }, openMark), open.value ? null : h("span", { style: muted }, ` … ${entries.length} 项 ${closeMark}`)]);
      if (!open.value) return h("div", [head]);
      return h("div", [
        head,
        ...entries.map(([childName, child], i) => h(JsonNode, { key: childName ?? i, name: childName, value: child, depth: props.depth + 1, expandDepth: props.expandDepth, token: t })),
        h("div", { style: { ...pad, ...muted } }, closeMark),
      ]);
    };
  },
});

export const PmJsonView = defineComponent({
  name: "PmJsonView",
  components: { AButton: Button, CopyOutlined, JsonNode },
  props: {
    value: { type: null as unknown as PropType<Json>, required: true },
    label: { type: String, default: "JSON" },
    expandDepth: { type: Number, default: 2 },
  },
  setup(props) {
    const token = useAntdToken();
    const box = computed(() => ({ border: `1px solid ${token.value.colorBorderSecondary}`, borderRadius: `${token.value.borderRadiusLG}px`, background: token.value.colorFillQuaternary }));
    const head = computed(() => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${token.value.paddingXXS}px ${token.value.paddingSM}px`, borderBottom: `1px solid ${token.value.colorBorderSecondary}`, color: token.value.colorTextSecondary, fontSize: `${token.value.fontSizeSM}px` }));
    const body = computed(() => ({ padding: `${token.value.paddingSM}px ${token.value.paddingSM}px ${token.value.paddingSM}px 28px`, overflowX: "auto" as const, fontFamily: token.value.fontFamilyCode, fontSize: `${token.value.fontSizeSM}px`, lineHeight: token.value.lineHeight }));
    async function copy() {
      try {
        await copyText(JSON.stringify(props.value, null, 2));
        void message.success("已复制 JSON");
      } catch {
        void message.error("复制失败：浏览器不允许访问剪贴板");
      }
    }
    return { token, box, head, body, copy };
  },
  template: `
    <div data-slot="json-view" :style="box">
      <div :style="head"><span>{{ label }}</span><a-button type="text" size="small" aria-label="复制 JSON" @click="copy"><template #icon><CopyOutlined /></template></a-button></div>
      <div :style="body"><JsonNode :value="value" :depth="0" :expand-depth="expandDepth" :token="token" /></div>
    </div>`,
});

export type { Json };
