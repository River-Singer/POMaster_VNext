// 命令面板（Geist Command Menu 的类型，antd 没有）：⌘K 打开的全局命令面板，建在 antdv Modal 上（焦点困在面板里、Esc 关闭、
// 关闭后焦点回到触发处）；输入即筛选，上下键移动、回车执行，按分组列出（listbox + aria-activedescendant），无结果时给出下一步。
import { computed, defineComponent, nextTick, ref, watch, type PropType } from "vue";
import { Input, Modal } from "ant-design-vue";
import { SearchOutlined } from "@ant-design/icons-vue";
import { useAntdToken } from "./tokens";

export interface PmCommand {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly keywords?: readonly string[];
  readonly shortcut?: string;
}

export const PmCommandMenu = defineComponent({
  name: "PmCommandMenu",
  components: { AModal: Modal, AInput: Input, SearchOutlined },
  props: {
    open: { type: Boolean, required: true },
    items: { type: Array as PropType<readonly PmCommand[]>, required: true },
    placeholder: { type: String, default: "输入命令或搜索" },
  },
  emits: ["update:open", "run"],
  setup(props, { emit }) {
    const token = useAntdToken();
    const query = ref("");
    const active = ref(0);
    const input = ref<{ focus?: () => void } | null>(null);
    const filtered = computed(() => {
      const q = query.value.trim().toLowerCase();
      return props.items.filter((item) => q === "" || [item.label, ...(item.keywords ?? [])].some((word) => word.toLowerCase().includes(q)));
    });
    const groups = computed(() => {
      const map = new Map<string, PmCommand[]>();
      for (const item of filtered.value) map.set(item.group, [...(map.get(item.group) ?? []), item]);
      return [...map.entries()];
    });
    watch(query, () => (active.value = 0));
    watch(
      () => props.open,
      (open) => {
        if (!open) return;
        query.value = "";
        void nextTick(() => input.value?.focus?.());
      },
    );
    function run(item: PmCommand) {
      emit("run", item);
      emit("update:open", false);
    }
    function onKey(event: KeyboardEvent) {
      const count = filtered.value.length;
      if (event.key === "ArrowDown" && count > 0) { event.preventDefault(); active.value = (active.value + 1) % count; }
      if (event.key === "ArrowUp" && count > 0) { event.preventDefault(); active.value = (active.value - 1 + count) % count; }
      if (event.key === "Enter" && filtered.value[active.value] !== undefined) { event.preventDefault(); run(filtered.value[active.value]!); }
    }
    const optionStyle = (selected: boolean) => ({
      display: "flex",
      justifyContent: "space-between",
      padding: `${token.value.paddingXS}px ${token.value.paddingSM}px`,
      borderRadius: `${token.value.borderRadiusSM}px`,
      cursor: "pointer",
      background: selected ? token.value.controlItemBgActive : "transparent",
      color: token.value.colorText,
    });
    const groupStyle = computed(() => ({ padding: `${token.value.paddingXS}px ${token.value.paddingSM}px 0`, fontSize: `${token.value.fontSizeSM}px`, color: token.value.colorTextTertiary }));
    const kbdStyle = computed(() => ({ fontFamily: token.value.fontFamilyCode, fontSize: `${token.value.fontSizeSM}px`, color: token.value.colorTextTertiary }));
    const indexOf = (item: PmCommand) => filtered.value.indexOf(item);
    return { query, active, input, filtered, groups, run, onKey, optionStyle, groupStyle, kbdStyle, indexOf, emit };
  },
  template: `
    <a-modal :open="open" :footer="null" :closable="false" :width="560" title="命令面板" @update:open="(v) => emit('update:open', v)">
      <a-input ref="input" v-model:value="query" :placeholder="placeholder" role="combobox" aria-expanded="true" aria-controls="pm-command-list" :aria-activedescendant="filtered[active] ? 'pm-command-' + filtered[active].id : undefined" @keydown="onKey">
        <template #prefix><SearchOutlined aria-hidden="true" /></template>
      </a-input>
      <div id="pm-command-list" role="listbox" aria-label="命令" style="max-height:320px;overflow-y:auto;margin-top:8px">
        <div v-for="[group, list] in groups" :key="group" role="group" :aria-label="group">
          <div :style="groupStyle" aria-hidden="true">{{ group }}</div>
          <div v-for="item in list" :id="'pm-command-' + item.id" :key="item.id" role="option" :aria-selected="indexOf(item) === active" :style="optionStyle(indexOf(item) === active)" @mouseenter="active = indexOf(item)" @click="run(item)">
            <span>{{ item.label }}</span><kbd v-if="item.shortcut" :style="kbdStyle">{{ item.shortcut }}</kbd>
          </div>
        </div>
        <p v-if="filtered.length === 0" style="padding:24px;text-align:center;margin:0">没有匹配的命令，换个关键词试试</p>
      </div>
    </a-modal>`,
});
