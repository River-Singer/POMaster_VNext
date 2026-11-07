// React · Geist 抽屉的 preview 配置（React 渲染器全局面；与 Vue 画廊 preview.ts 同构）。
//
// 样式只有一个入口 preview.css：规范页外框（与 Vue 画廊共用的 standard.css）+ Geist 主题与 Tailwind 工具类。
// 字体（Geist / Geist Mono）经 preview-head.html 从 Google Fonts 加载。
import { addons } from "storybook/preview-api";
import { installStoryLinks } from "../../studio/src/standard/page";
import "./preview.css";

// 规范页里带 data-story 的链接经 selectStory 导航（单独打开与组合进总 Storybook 时都在侧栏内跳转）。
if (typeof document !== "undefined") {
  installStoryLinks(document, (storyId) => addons.getChannel().emit("selectStory", { storyId }));
}

// 侧栏顺序：「规范」打头（React 栈开发必须遵守的规范，目录与 Vue · Ant Design 抽屉相同），其后是「Geist 组件」
// （项目里的 shadcn 组件逐个展示）、Foundations 说明页与本抽屉的说明。规范分区内按生成文件序（领域在统一骨架
// skeleton.yaml 里的顺序）排列。
const preview = {
  parameters: {
    options: {
      storySort: {
        order: [
          "规范",
          ["总览", "基础", "组件", ["通用", "布局", "导航", "数据录入", "数据展示", "反馈", "其他"], "设计模式", ["全局规则", "原则", "模板文档", "体验管理", "数据呈现"], "工程规范"],
          "Geist 组件",
          "Foundations",
          "关于本抽屉",
        ],
      },
    },
  },
};

export default preview;
