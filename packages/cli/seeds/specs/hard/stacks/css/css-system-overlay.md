---
seed_source: pomaster/components/frontend-hard-spec/assets/stacks/css/css-system-overlay.md
seed_source_sha256: 4167e2a2d4c457f594db95336470dca4f0778e76df006e815207c0761667692a
seed_version: B6G
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: frontend-stack:css
capability: css-system
requires: [frontend-stack:vue3]
conflicts: []
coexistence: independent
stages: [prepare, implement, check, release]
x-research-anchors:
  note: >-
    css 键选型 = Owner 裁定 D8（09-05-spec-thematic-reorg）：组合词形
    scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css。版本位 vue 3.5.42 /
    ant-design-vue 4.2.6（npm registry 实抓 2026-09-05；ant-design-vue 另经 antdv.com
    站点头部版本选择器双源一致；antdv.com 为 JS 渲染站点，经 chrome-devtools 实载
    取证）。scoped CSS / :deep() / :slotted() / :global() 词形与子组件根元素口径
    出自 vuejs.org SFC CSS Features 特性页（vue 3.5.42 时点滚动站）；CSS-in-JS 主题
    （ConfigProvider theme + useToken）与 reset.css 引入词形出自 antdv.com 官方文档。
  sources:
    - url: https://vuejs.org/api/sfc-css-features.html
      fetched: 2026-09-05
    - url: https://antdv.com/docs/vue/customize-theme
      fetched: 2026-09-05
    - url: https://antdv.com/docs/vue/introduce
      fetched: 2026-09-05
---

# CSS 体系 Overlay

## Scope

本 Overlay 具体化项目 CSS 体系选型（裁定 D8 组合词形 scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css）的官方词形与版本边界：SFC scoped 作用域机制、Ant Design Vue CSS-in-JS 主题 token 消费与官方全局重置。

## Rules

- 必须固定并记录 CSS 体系组合词形与版本位：scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css（vue 3.5.42 / ant-design-vue 4.2.6，npm registry 实抓双源一致）；组合之外的作用域/utility 方案属 css 键改型，不得未声明引入。
- scoped 作用域以 SFC `<style scoped>` 为项目主机制（编译为 data-v-hash 属性选择器）；穿透与例外必须用官方逃逸词形 `:deep()`（子组件穿透）、`:slotted()`（slot 内容）、`:global()`（全局例外）；子组件根元素同时受父 scoped 影响为官方口径。
- antdv 主题 token 消费走 v4 CSS-in-JS 官方通路：ConfigProvider 的 theme prop（Design Token 三层派生 Seed → Map → Alias、default / dark / compact 三算法、组件级 Component Token），运行时消费用 useToken；组件库主题 token 不替代项目 design token 分层协议。
- 全局重置以官方单一来源承载：`import 'ant-design-vue/dist/reset.css'`；不得未声明引入与之竞争的第二套全局重置。

## Checklist

- [ ] css 键组合词形与版本位（vue / ant-design-vue）经 npm registry 实抓并记录在项目技术基线。
- [ ] scoped 逃逸词形（:deep() / :slotted() / :global()）、antdv 主题通路（ConfigProvider theme + useToken）与全局重置（reset.css import）与实际接线一致。

