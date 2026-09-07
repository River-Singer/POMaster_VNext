// React sidecar preview 配置（React 渲染器全局面；与 Vue 主实例 preview.ts 同构）。
//
// antd 接入：样式 = 官方 reset.css 单一来源（cssinjs 运行时随组件注入）；
// 画廊 story 另做局部组件 import（生成器产出的 import 语句）——双保险不依赖全局注册。
import "antd/dist/reset.css";
import "./preview.css";

// React 渲染器无需框架级 setup 钩子（组件在 story 文件内自行 import）——
// 本文件只承载全局样式。
export {};
