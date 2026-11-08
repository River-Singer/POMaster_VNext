import type { Meta, StoryObj } from "@storybook/vue3";
import { PmRelativeTime } from "../components/relative-time";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/RelativeTime 相对时间",
  parameters: describe("「3 分钟前」式的相对时间：<time datetime> 带机器可读时间，悬停或聚焦时 antdv Tooltip 显示带时区的绝对时间；每分钟刷新；超过 7 天直接显示日期。ant-design-vue 没有这个组件（Geist 有 Relative Time Card）。源码 src/components/relative-time.ts。", "relative_time"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmRelativeTime },
    setup() {
      const ago = (ms: number) => new Date(Date.now() - ms);
      return { DEMO_STYLE, rows: [["签收", ago(20_000)], ["发车", ago(3 * 60_000)], ["派单", ago(5 * 3_600_000)], ["上次保养", ago(3 * 86_400_000)], ["入队", ago(40 * 86_400_000)]] };
    },
    template: `<div :style="DEMO_STYLE + ';flex-direction:column'"><span v-for="[label, date] in rows" :key="label">{{ label }}：<PmRelativeTime :date="date" /></span></div>`,
  }),
};
