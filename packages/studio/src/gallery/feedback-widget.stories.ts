import type { Meta, StoryObj } from "@storybook/vue3";
import { PmFeedbackWidget } from "../components/feedback-widget";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/FeedbackWidget 反馈收集",
  parameters: describe("页面上的「反馈」入口：antdv Popover 里选一个表情（Radio 按钮组）+ 写几句话，提交中按钮忙碌，成功后在原处显示「已收到」；不强制填写联系方式。ant-design-vue 没有这个组件（Geist 有 Feedback），用 antdv 组件拼。源码 src/components/feedback-widget.ts。", "feedback_widget"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmFeedbackWidget },
    setup: () => ({ DEMO_STYLE, submit: () => new Promise<void>((resolve) => window.setTimeout(resolve, 600)) }),
    template: `<div :style="DEMO_STYLE + ';align-items:center'"><span>这个页面好用吗？</span><PmFeedbackWidget :on-submit="submit" /></div>`,
  }),
};
