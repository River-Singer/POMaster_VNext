// Storybook preview 配置（Vue3 渲染器全局面）。
//
// antdv 接入（research §3 官方要点）：
// - 全局注册走框架包导出的 setup(app => ...) 钩子（vue3-vite 框架页原文示例形态）；
// - 样式 = CSS-in-JS（cssinjs）运行时，唯一全局样式要求是官方 reset.css；
// - 画廊 story 另做局部组件注册（components: {...}）——与全局注册双保险。
import { setup } from "@storybook/vue3-vite";
import Antd from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import "./preview.css";

setup((app) => {
  app.use(Antd);
});

// 侧栏顺序：「规范」打头（开发必须遵守的规范），其后是画廊参照页。规范分区内按
// 生成文件序（领域在 design-standard.yaml 里的顺序）排列。
const preview = {
  parameters: {
    options: {
      storySort: {
        order: ["规范", ["总览", "基础", "设计模式", ["全局规则", "原则", "模板文档"], "工程规范"], "画廊总览"],
      },
    },
  },
};

export default preview;
