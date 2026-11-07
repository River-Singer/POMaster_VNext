// Storybook preview 配置（Vue3 渲染器全局面）。
//
// antdv 接入（research §3 官方要点）：
// - 全局注册走框架包导出的 setup(app => ...) 钩子（vue3-vite 框架页原文示例形态）；
// - 样式 = CSS-in-JS（cssinjs）运行时，唯一全局样式要求是官方 reset.css——在 preview.css 里放进最低的
//   antd-reset 层（规范页外框 standard.css 在它上面，两个抽屉同一套外框）；
// - 画廊 story 另做局部组件注册（components: {...}）——与全局注册双保险。
import { setup } from "@storybook/vue3-vite";
import { addons } from "storybook/preview-api";
import Antd from "ant-design-vue";
import { installStoryLinks } from "../src/standard/page";
import "./preview.css";

setup((app) => {
  app.use(Antd);
});

// 规范页里带 data-story 的链接经 selectStory 导航（单独打开与组合进总 Storybook 时都在侧栏内跳转）。
if (typeof document !== "undefined") {
  installStoryLinks(document, (storyId) => addons.getChannel().emit("selectStory", { storyId }));
}

// 侧栏顺序：「规范」打头（开发必须遵守的规范，目录与 React · Geist 抽屉相同），其后是画廊参照页。
// 规范分区内按生成文件序（领域在统一骨架 skeleton.yaml 里的顺序）排列。
const preview = {
  parameters: {
    options: {
      storySort: {
        order: [
          "规范",
          ["总览", "基础", "组件", ["通用", "布局", "导航", "数据录入", "数据展示", "反馈", "其他"], "设计模式", ["全局规则", "原则", "模板文档", "体验管理", "数据呈现"], "工程规范"],
          "画廊总览",
        ],
      },
    },
  },
};

export default preview;
