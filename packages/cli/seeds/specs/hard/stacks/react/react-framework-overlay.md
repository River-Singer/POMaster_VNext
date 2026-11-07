---
seed_source: POMaster_VNext/packages/cli/seeds/specs/hard/stacks/react/react-framework-overlay.md
seed_source_sha256: a00e34d269cf70610dca4073c87a5e97f0606497078f7c672359f32952a8f95e
seed_version: B8-VNEXT
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: frontend-stack:react
capability: application-framework
requires: []
conflicts: []
coexistence: independent
stages: [prepare, implement, check, release]
x-research-anchors:
  note: >-
    VNext 自有 overlay（vendor 无对应件，2026-11-07 新著）：与 frontend-stack:vue3 并列的 React 框架能力，
    条文是对 react.dev 官方指南（hooks 规则、渲染纯度、effect 只做外部同步、懒加载与 Suspense、StrictMode）
    与 React Router 路由对象（lazy / handle / loader / 错误边界）的自行转述。React Router 路由对象页与
    TanStack Query 默认行为页实抓核对；react.dev 各页经检索结果核对在册。npm registry 在实抓环境不可达，
    版本位本 overlay 不写死，由项目按「Rules」实抓后记录。
  sources:
    - url: https://react.dev/reference/rules/rules-of-hooks
      fetched: 2026-11-07
    - url: https://react.dev/learn/you-might-not-need-an-effect
      fetched: 2026-11-07
    - url: https://react.dev/learn/keeping-components-pure
      fetched: 2026-11-07
    - url: https://react.dev/learn/synchronizing-with-effects
      fetched: 2026-11-07
    - url: https://react.dev/reference/react/lazy
      fetched: 2026-11-07
    - url: https://react.dev/reference/react/StrictMode
      fetched: 2026-11-07
    - url: https://reactrouter.com/start/data/route-object
      fetched: 2026-11-07
    - url: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
      fetched: 2026-11-07
---

# React 框架 Overlay

## Scope

本 Overlay 具体化 React 的组件模型（函数组件 + hooks）、渲染纯度与副作用、服务端数据、路由与 TypeScript 工具链的选型与版本边界。

## Rules

- 必须固定并记录 react、react-dom、路由库（React Router 或 TanStack Router，二选一）、服务端状态库（@tanstack/react-query）与 TypeScript 工具链的版本位与来源；版本位经实抓核实，不得沿用旧主版本记忆。
- 组件写成函数组件 + hooks；class 组件、mixin、旧式 context、字符串 ref 等旧心智不带入新项目。
- 渲染必须是纯的：同样的 props 与 state 得到同样的输出，渲染过程中不改外部变量、不发请求、不写浏览器存储；副作用放进事件处理器或 effect。
- hooks 只在组件或自定义 hook 的顶层调用，不放进条件、循环和回调；依赖数组写全，由 eslint-plugin-react-hooks 的规则检查，不关闭规则来掩盖问题。
- effect 只用来与 React 之外的系统同步（订阅、计时器、浏览器 API、非 React 组件）：能在渲染时算出的值直接算（昂贵的用 useMemo），要随 props 重置的状态用 key 重新挂载，用户操作触发的逻辑写在事件处理器里；每个 effect 返回清理函数，StrictMode 在开发环境的重复执行不当作缺陷绕开。
- 服务端数据由查询缓存层管理；组件里不手写「useEffect + fetch + setState」取数（竞态、缓存、取消都要自己补）；列表 key 用稳定的业务 id，不用数组下标。
- 路由组件懒加载（React.lazy 或路由库的 lazy），Suspense 的 fallback 用与内容同几何的骨架，错误边界（或路由的错误元素）承接渲染与加载失败。
- 不得由 React 选型推断 UI 组件库、CSS 体系、grid 或构建工具选型；是否引入服务端渲染框架（Next.js 等）是单独的基线决策，管理端单页应用默认不引入服务端组件。

## Checklist

- [ ] 版本位（react / react-dom / 路由库 / @tanstack/react-query / typescript）经实抓核实并记录在项目技术基线。
- [ ] eslint-plugin-react-hooks 的规则开启且未被关闭；开发环境开启 StrictMode。
- [ ] 组件里没有手写的取数 effect；每个 effect 都有清理；列表 key 稳定。
- [ ] 路由懒加载，有 Suspense fallback 与错误边界。
