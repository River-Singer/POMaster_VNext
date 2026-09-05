---
seed_source: pomaster/components/frontend-hard-spec/assets/stacks/antdesign/antdesign-ui-overlay.md
seed_source_sha256: e70a6dad3fedbf8c4a182d92af9c9229e13cc368f880b3ccd96fe11ccdbdd7be
seed_version: B6F
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: frontend-stack:antdesign
capability: ui-component-library
requires: [frontend-stack:vue3]
conflicts: []
coexistence: independent
stages: [prepare, implement, check, release]
x-research-anchors:
  note: >-
    Ant Design Vue 4.2.6（npm registry + antdv.com 站点头部版本选择器双源一致，2026-09-05
    实抓；antdv.com 为 JS 渲染站点，经 chrome-devtools 实载取证）。v4 主题 = CSS-in-JS
    为官方口径（v3 的 less / CSS 变量降级为构建期静态消费兼容通道）。React 版 Ant Design
    （ant.design，v6.6.2 实抓，external-sites-index 既有锚）仅作跨栈对照注明，组件 API
    与主题机制不混用于 Vue 栈。
  sources:
    - url: https://antdv.com/docs/vue/introduce
      fetched: 2026-09-05
    - url: https://antdv.com/docs/vue/customize-theme
      fetched: 2026-09-05
---

# Ant Design Vue 组件库 Overlay

## Scope

本 Overlay 具体化 Ant Design Vue 组件库的引入、按需加载、主题（CSS-in-JS Design Token）与 React 版 antd 的对照边界。

## Rules

- 必须固定组件库词形与版本位：Vue 栈为 ant-design-vue 4.x 线；React 版 Ant Design 仅作跨栈对照，其组件 API 与主题机制不得混用。
- 引入与按需加载必须走官方口径：全局重置用 `import 'ant-design-vue/dist/reset.css'`；按需加载用 unplugin-vue-components + AntDesignVueResolver（官方示例 importStyle: false 旁注 css in js）。
- 主题定制主通路为 v4 CSS-in-JS：ConfigProvider 的 theme prop（Design Token 三层派生 Seed → Map → Alias、default / dark / compact 三算法、组件级 Component Token），运行时消费用 useToken；v3 less 变量只作构建期静态消费兼容通道（theme.defaultAlgorithm(defaultSeed) + less-loader modifyVars），两条通路不得未声明混装。
- 不得由组件库选型推断 CSS 作用域体系、预处理器或 utility 方案（css 键独立选型）；组件库主题 token 不替代项目 design token 分层协议。

## Checklist

- [ ] 版本位经 npm registry 实抓（4.2.6 双源一致）并记录在项目技术基线。
- [ ] 主题通路（运行时 CSS-in-JS / 构建期 less 兼容）已显式声明且与实际接线一致。

