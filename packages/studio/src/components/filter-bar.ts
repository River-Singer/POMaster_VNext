// 筛选条（Geist Filter 的类型，antd 没有成品）：已生效的筛选是可关闭的 Tag（「状态：在途」），「添加筛选」是 antdv Dropdown，
// 「清除全部」一键复位；关闭按钮有可读名称。
import { computed, defineComponent, type PropType } from "vue";
import { Button, Dropdown, Tag } from "ant-design-vue";
import { PlusOutlined } from "@ant-design/icons-vue";

export interface PmFilter {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export const PmFilterBar = defineComponent({
  name: "PmFilterBar",
  components: { AButton: Button, ADropdown: Dropdown, ATag: Tag, PlusOutlined },
  props: {
    filters: { type: Array as PropType<readonly PmFilter[]>, required: true },
    available: { type: Array as PropType<readonly { key: string; label: string }[]>, required: true },
  },
  emits: ["remove", "clear", "add"],
  setup(props, { emit }) {
    const menu = computed(() => ({
      items: props.available.filter((item) => !props.filters.some((filter) => filter.key === item.key)).map((item) => ({ key: item.key, label: item.label })),
      onClick: ({ key }: { key: string }) => emit("add", key),
    }));
    return { menu, emit };
  },
  template: `
    <div data-slot="filter-bar" role="group" aria-label="筛选条件" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
      <a-tag v-for="filter in filters" :key="filter.key" closable style="margin:0" @close.prevent="emit('remove', filter.key)">
        {{ filter.label }}：{{ filter.value }}
      </a-tag>
      <a-dropdown :menu="menu" :trigger="['click']">
        <a-button size="small" type="dashed"><template #icon><PlusOutlined /></template>添加筛选</a-button>
      </a-dropdown>
      <a-button v-if="filters.length > 0" size="small" type="link" @click="emit('clear')">清除全部</a-button>
    </div>`,
});
