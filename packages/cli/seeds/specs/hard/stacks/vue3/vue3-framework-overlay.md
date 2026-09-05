---
seed_source: pomaster/components/frontend-hard-spec/assets/stacks/vue3/vue3-framework-overlay.md
seed_source_sha256: 15e7fd3808760bb330933f4a0479e4e95e3e07d0e24485d1b9b860019a708935
seed_version: B6F
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: frontend-stack:vue3
capability: application-framework
requires: []
conflicts: []
coexistence: independent
stages: [prepare, implement, check, release]
x-research-anchors:
  note: >-
    Vue 3.5.42（npm registry latest + GitHub vuejs/core tag v3.5.42 双源一致，2026-09-05 实抓）；
    vuejs.org 为无版本号滚动站点，版本位以实抓日 + 同日包版本实抓为准。pinia 4.0.3（npm 单源）
    与 vue-router 5.3.1（npm + GitHub 双源）为现行主版本线——不得沿用 pinia 2/3、
    vue-router 3/4 旧主版本记忆。TypeScript 7.0.2（npm latest 实抓）与 vue-tsc /
    @vue/tsconfig 的兼容矩阵未逐条核实（研究 Caveats 在册），写死 TS 版本约束前须补核实。
  sources:
    - url: https://vuejs.org/guide/essentials/component-basics.html
      fetched: 2026-09-05
    - url: https://vuejs.org/guide/scaling-up/sfc.html
      fetched: 2026-09-05
    - url: https://vuejs.org/api/sfc-spec.html
      fetched: 2026-09-05
    - url: https://vuejs.org/guide/essentials/reactivity-fundamentals.html
      fetched: 2026-09-05
    - url: https://vuejs.org/guide/reusability/composables.html
      fetched: 2026-09-05
    - url: https://vuejs.org/guide/essentials/lifecycle.html
      fetched: 2026-09-05
    - url: https://vuejs.org/guide/scaling-up/state-management.html
      fetched: 2026-09-05
    - url: https://pinia.vuejs.org/
      fetched: 2026-09-05
    - url: https://vuejs.org/guide/scaling-up/routing.html
      fetched: 2026-09-05
    - url: https://router.vuejs.org/
      fetched: 2026-09-05
    - url: https://vuejs.org/guide/typescript/overview.html
      fetched: 2026-09-05
    - url: https://vuejs.org/style-guide/
      fetched: 2026-09-05
    - url: https://v2.vuejs.org/lts/
      fetched: 2026-09-05
---

# Vue 3 框架 Overlay

## Scope

本 Overlay 具体化 Vue 3 组件模型、SFC、响应式系统与官方配套（状态 / 路由 / TypeScript 工具链）的选型与版本边界。

## Rules

- 必须固定并记录 Vue 3、Pinia、vue-router 与 TypeScript 工具链（vue-tsc / @vue/tsconfig）的版本位与来源；版本位经实抓核实，不得沿用旧主版本记忆（现行线为 pinia 4.x / vue-router 5.x）。
- 状态与路由必须选官方方案：新应用状态管理选 Pinia（Vue 核心团队维护；Vuex 已是维护模式），SPA 路由选官方 Vue Router——两者是官方口径，不自造替代。
- 组件、SFC 与响应式写法以官方文档与风格指南优先级（A/B/C 三档）为基准；响应式必须声明 ref / reactive 选型边界（reactive 的 proxy 局限官方有专门小节）。
- 组合式函数必须遵守官方约定（命名、入参、返回值、副作用、使用限制），生命周期钩子按官方注册时机使用。
- 不得由 Vue 3 选型推断 UI 组件库、CSS 体系、grid 或构建工具选型；Vue 2 已 EOL，其心智不得带入新项目基线。

## Checklist

- [ ] 版本位（vue / pinia / vue-router / typescript）经实抓核实并记录在项目技术基线。
- [ ] 状态、路由与 TS 类型检查工具链为官方词形（Pinia / Vue Router / vue-tsc）且带实抓日期锚。

