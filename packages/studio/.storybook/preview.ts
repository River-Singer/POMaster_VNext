// Storybook preview 配置（Vue3 渲染器全局面）。
//
// antdv 接入（research §3 官方要点）：
// - 全局注册走框架包导出的 setup(app => ...) 钩子（vue3-vite 框架页原文示例形态）；
// - 样式 = CSS-in-JS（cssinjs）运行时，唯一全局样式要求是官方 reset.css；
// - 画廊 story 另做局部组件注册（components: {...}）——与全局注册双保险。
import { setup } from "@storybook/vue3-vite";
import Antd from "ant-design-vue";
import "./preview.css";

setup((app) => {
  app.use(Antd);
});
