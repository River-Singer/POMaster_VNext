import type { Meta, StoryObj } from "@storybook/vue3";
import { ref } from "vue";
import { PmFilterBar, type PmFilter } from "../components/filter-bar";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/FilterBar 筛选条",
  parameters: describe("列表上方的筛选条：已生效的筛选是可关闭的 Tag，「添加筛选」是 antdv Dropdown，「清除全部」一键复位；筛选写进地址。ant-design-vue 没有成品筛选条（Geist 有 Filter），用 antdv 组件拼。源码 src/components/filter-bar.ts。", "filter_bar"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmFilterBar },
    setup() {
      const available = [
        { key: "status", label: "状态" },
        { key: "team", label: "车队" },
        { key: "driver", label: "司机" },
        { key: "date", label: "发车日期" },
      ];
      const filters = ref<PmFilter[]>([
        { key: "status", label: "状态", value: "在途" },
        { key: "team", label: "车队", value: "浦东车队" },
      ]);
      const remove = (key: string) => (filters.value = filters.value.filter((item) => item.key !== key));
      const add = (key: string) => (filters.value = [...filters.value, { key, label: available.find((item) => item.key === key)!.label, value: "全部" }]);
      return { DEMO_STYLE, available, filters, remove, add };
    },
    template: `<div :style="DEMO_STYLE"><PmFilterBar :filters="filters" :available="available" @remove="remove" @add="add" @clear="filters = []" /></div>`,
  }),
};
