import type { Meta, StoryObj } from "@storybook/vue3";
import { ref } from "vue";
import { Button, message } from "ant-design-vue";
import { PmCommandMenu } from "../components/command-menu";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/CommandMenu 命令面板",
  parameters: describe("⌘K 打开的全局命令面板：建在 antdv Modal 上（焦点困在面板里、Esc 关闭），输入即筛选，上下键移动、回车执行，按分组列出，无结果时给出下一步。ant-design-vue 没有这个组件（Geist 有 Command Menu），按 antd 的 token 自建。源码 src/components/command-menu.ts。", "command_menu"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmCommandMenu, AButton: Button },
    setup() {
      const open = ref(false);
      const items = [
        { id: "new-order", label: "新建订单", group: "操作", shortcut: "N" },
        { id: "dispatch", label: "批量派单", group: "操作" },
        { id: "vehicles", label: "前往车辆列表", group: "跳转", keywords: ["车", "vehicle"] },
        { id: "drivers", label: "前往司机列表", group: "跳转", keywords: ["司机", "driver"] },
      ];
      const run = (item: { label: string }) => void message.info(`执行：${item.label}`);
      return { DEMO_STYLE, open, items, run };
    },
    template: `<div :style="DEMO_STYLE"><a-button @click="open = true">搜索命令 ⌘K</a-button><PmCommandMenu v-model:open="open" :items="items" @run="run" /></div>`,
  }),
};
