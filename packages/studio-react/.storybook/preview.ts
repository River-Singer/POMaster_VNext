// React sidecar preview 配置（React 渲染器全局面；与 Vue 主实例 preview.ts 同构）。
//
// 样式只有一个入口 preview.css：antd 官方 reset.css（放进最低的层）+ 规范页外框（与 Vue 画廊共用的
// standard.css）+ Geist 主题与 Tailwind 工具类。antd 的 cssinjs 运行时随组件注入；画廊 story 另做局部组件
// import（生成器产出的 import 语句）。字体（Geist / Geist Mono）经 preview-head.html 从 Google Fonts 加载。
import { addons } from "storybook/preview-api";
import { installStoryLinks } from "../../studio/src/standard/page";
import "./preview.css";

// 规范页里带 data-story 的链接经 selectStory 导航（单独打开与组合进总 Storybook 时都在侧栏内跳转）。
if (typeof document !== "undefined") {
  installStoryLinks(document, (storyId) => addons.getChannel().emit("selectStory", { storyId }));
}

// 侧栏顺序：「规范」打头（React 栈开发必须遵守的规范，目录与 Vue · Ant Design 抽屉相同），其后是对照画廊。
// 规范分区内按生成文件序（领域在统一骨架 skeleton.yaml 里的顺序）排列。
const preview = {
  parameters: {
    options: {
      storySort: {
        order: [
          "规范",
          ["总览", "基础", "组件", ["通用", "布局", "导航", "数据录入", "数据展示", "反馈", "其他"], "设计模式", ["全局规则", "原则", "模板文档", "体验管理", "数据呈现"], "工程规范"],
          "React Sidecar 总览",
        ],
      },
    },
  },
};

export default preview;
