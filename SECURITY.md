# 安全政策（SECURITY）

## 报告渠道

发现安全漏洞请**勿**直接在公开 Issue / PR 中披露。

请通过以下渠道私密报告：**allenxujianyang@outlook.com**（README 商业授权联系邮箱；本项目当前未设独立 security@ 专用渠道——如后续启用专用渠道或 GitHub Private Vulnerability Reporting，由 Owner 裁定后更新本节）。

报告时请尽量附上：受影响组件与版本、复现步骤或 PoC、影响评估、（如有）修复建议。

## 处理流程（简版）

1. 收到报告后确认接收并评估；
2. 修复开发与验证（必要时走本项目自身的八拍 Change Loop 与 gate 判卷）；
3. 发布修复版本，并在公告中致谢报告者（除非要求匿名）。

## 支持范围

- 仓库内 `packages/`（kernel / cli / schemas / gauntlet-lite）及其 npm 发布物（`pomaster` 包）；
- `packages/studio`（组件画廊）：在线版经 GitHub Pages 公开静态发布（river-singer.github.io/POMaster_VNext）——属公开发布面（攻击面：静态内容注入/供应链生成器路径）；
- `packages/studio-react`（React sidecar 对照实例）：`private: true`、不入 npm 发布面、无独立部署目标（仅仓库内 `studio:react:dev` 本地浏览）——显式声明为**非发布面 private 组件**；其中与画廊同构的生成/渲染逻辑缺陷同样欢迎随主渠道报告；
- `scripts/`、`ops/` 与 `catalog/` 策展物料中的可执行内容。

范围内的第三方依赖安全问题（如已知 CVE 影响）同样欢迎报告；依赖许可与 notice 义务见 [`legal/THIRD_PARTY_NOTICES.md`](./legal/THIRD_PARTY_NOTICES.md)。
