// 破坏性确认输入（Geist 的删除确认形态，antd 没有）：要求输入对象名称后危险按钮才可用；提示里写出原文（Tag 标出），不禁止粘贴。
import { computed, defineComponent, ref, watch } from "vue";
import { Input, Tag } from "ant-design-vue";

let uid = 0;

export const PmDestructiveInput = defineComponent({
  name: "PmDestructiveInput",
  components: { AInput: Input, ATag: Tag },
  props: { expected: { type: String, required: true } },
  emits: ["match"],
  setup(props, { emit }) {
    const id = `pm-destructive-${++uid}`;
    const text = ref("");
    const matched = computed(() => text.value.trim() === props.expected);
    watch(matched, (value) => emit("match", value), { immediate: true });
    return { id, text, matched };
  },
  template: `
    <div data-slot="destructive-input" style="display:flex;flex-direction:column;gap:8px">
      <label :for="id">输入 <a-tag style="margin:0 4px">{{ expected }}</a-tag> 确认</label>
      <a-input :id="id" v-model:value="text" autocomplete="off" spellcheck="false" :status="text !== '' && !matched ? 'error' : ''" />
    </div>`,
});
