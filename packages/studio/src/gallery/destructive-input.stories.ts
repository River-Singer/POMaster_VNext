import type { Meta, StoryObj } from "@storybook/vue3";
import { ref } from "vue";
import { Button } from "ant-design-vue";
import { PmDestructiveInput } from "../components/destructive-input";
import { DEMO_STYLE, describe } from "./_demo";

const meta: Meta = {
  title: "AntDV 组件/自建/DestructiveInput 破坏性确认输入",
  parameters: describe("不可逆的大操作前要求输入对象名称：提示里写出原文，输入一致后危险按钮才可用；不禁止粘贴。ant-design-vue 没有这个组件（Geist 的删除确认形态），用 antdv 的 Input 与 Tag 拼。源码 src/components/destructive-input.ts。", "destructive_input"),
};
export default meta;

export const Default: StoryObj = {
  render: () => ({
    components: { PmDestructiveInput, AButton: Button },
    setup: () => ({ DEMO_STYLE, matched: ref(false) }),
    template: `<div :style="DEMO_STYLE + ';flex-direction:column;width:360px'"><PmDestructiveInput expected="浦东车队" @match="(v) => (matched = v)" /><a-button danger type="primary" :disabled="!matched">解散车队</a-button></div>`,
  }),
};
