// React sidecar preview 配置（React 渲染器全局面；与 Vue 主实例 preview.ts 同构）。
//
// 样式只有一个入口 preview.css：antd 官方 reset.css（放进最低的层）+ Geist 主题与 Tailwind
// 工具类 + 规范页框样式。antd 的 cssinjs 运行时随组件注入；画廊 story 另做局部组件 import
// （生成器产出的 import 语句）。字体（Geist / Geist Mono）经 preview-head.html 从 Google Fonts 加载。
import "./preview.css";

// 侧栏顺序：「规范」打头（React 栈开发必须遵守的规范），其后是对照画廊。规范分区内按
// 生成文件序（领域在 geist.yaml 里的顺序）排列。
const preview = {
  parameters: {
    options: {
      storySort: {
        order: ["规范", ["总览", "基础", "设计模式", "工程规范"], "React Sidecar 总览"],
      },
    },
  },
};

export default preview;
