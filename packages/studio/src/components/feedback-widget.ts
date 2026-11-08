// 反馈收集（Geist Feedback 的类型，antd 没有）：「反馈」按钮打开 antdv Popover——选一个表情（Radio 按钮组）+ 写几句话，
// 提交中按钮忙碌，成功后在原处显示「已收到」；不强制填写联系方式。
import { defineComponent, ref, type PropType } from "vue";
import { Button, Popover, RadioButton, RadioGroup, Textarea } from "ant-design-vue";

const MOODS = [
  { value: 1, label: "😞", name: "不好用" },
  { value: 2, label: "😐", name: "一般" },
  { value: 3, label: "🙂", name: "还行" },
  { value: 4, label: "😄", name: "很好用" },
];

export const PmFeedbackWidget = defineComponent({
  name: "PmFeedbackWidget",
  components: { AButton: Button, ATextarea: Textarea, APopover: Popover, ARadioGroup: RadioGroup, ARadioButton: RadioButton },
  props: {
    onSubmit: { type: Function as PropType<(feedback: { mood: number | null; text: string }) => Promise<void>>, required: true },
    triggerLabel: { type: String, default: "反馈" },
  },
  setup(props) {
    const open = ref(false);
    const mood = ref<number | null>(null);
    const text = ref("");
    const busy = ref(false);
    const done = ref(false);
    async function submit() {
      busy.value = true;
      try {
        await props.onSubmit({ mood: mood.value, text: text.value });
        done.value = true;
      } finally {
        busy.value = false;
      }
    }
    function onOpen(value: boolean) {
      open.value = value;
      if (value) { done.value = false; mood.value = null; text.value = ""; }
    }
    return { MOODS, open, mood, text, busy, done, submit, onOpen };
  },
  template: `
    <a-popover :open="open" trigger="click" placement="bottomLeft" @update:open="onOpen">
      <template #content>
        <div style="width:280px;display:flex;flex-direction:column;gap:12px" role="form" aria-label="反馈">
          <p v-if="done" role="status" style="margin:0">已收到，谢谢你的反馈。</p>
          <template v-else>
            <a-radio-group v-model:value="mood" aria-label="使用感受" button-style="solid">
              <a-radio-button v-for="m in MOODS" :key="m.value" :value="m.value" :aria-label="m.name">{{ m.label }}</a-radio-button>
            </a-radio-group>
            <a-textarea v-model:value="text" :rows="3" aria-label="反馈内容" placeholder="哪里好用、哪里不好用？" />
            <a-button type="primary" :loading="busy" :disabled="mood === null && text.trim() === ''" @click="submit">提交反馈</a-button>
          </template>
        </div>
      </template>
      <a-button>{{ triggerLabel }}</a-button>
    </a-popover>`,
});
