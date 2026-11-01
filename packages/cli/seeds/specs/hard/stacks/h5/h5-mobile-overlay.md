---
seed_source: pomaster/components/frontend-hard-spec/assets/stacks/h5/h5-mobile-overlay.md
seed_source_sha256: 56934cea13389d038d0afc54738268c2bf1ca5b748e9e97b3a42c0fed809a0d6
seed_version: B6H
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: frontend-stack:h5
capability: mobile-web-adaptation
requires: [frontend-stack:vue3]
conflicts: []
coexistence: independent
stages: [prepare, implement, check, release]
x-research-anchors:
  note: >-
    2026-10-25 实抓。Vant 官方文档（GitHub 源 markdown）：浏览器适配推荐 postcss-mobile-forever
    （viewportWidth 可为按文件返回的函数，Vant 自身 375 设计稿）或 rem 方案 postcss-pxtorem
    （rootValue 37.5）；桌面调试用 @vant/touch-emulator；按需引入用 unplugin-vue-components +
    @vant/auto-import-resolver（函数式 API 再加 unplugin-auto-import，自动带样式），全量与按需不得同时使用；
    新项目推荐 Rsbuild / Vite / Nuxt。npm registry 在实抓环境不可达，vant 等包的版本位本 overlay 不写死，
    由项目按「Rules」实抓后记录。viewport-fit / env(safe-area-inset-*) 取 MDN；INP 阈值取 web.dev；
    触控目标尺寸取 WCAG 2.2 SC 2.5.8。seed 出处：vue-h5-template（本地参考，不入 pomaster），
    NutUI / Varlet 未吸收（见 default-h5-component-library.yaml provenance）。
  sources:
    - url: https://github.com/youzan/vant/blob/main/packages/vant/docs/markdown/advanced-usage.en-US.md
      fetched: 2026-10-25
    - url: https://github.com/youzan/vant/blob/main/packages/vant/docs/markdown/quickstart.en-US.md
      fetched: 2026-10-25
    - url: https://github.com/wswmsword/postcss-mobile-forever
      fetched: 2026-10-25
    - url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
      fetched: 2026-10-25
    - url: https://developer.mozilla.org/en-US/docs/Web/CSS/env
      fetched: 2026-10-25
    - url: https://web.dev/articles/inp
      fetched: 2026-10-25
    - url: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
      fetched: 2026-10-25
---

# H5 / 移动端适配 Overlay

## Scope

本 Overlay 具体化 C 端 H5 项目的视口与单位换算、Vant 组件按需引入、路由组织、安全区与触控、移动端性能与可访问性边界。规则分两级：**必须（MUST）**进入验收，**应当（SHOULD）**偏离时须在项目技术基线写明理由。

## Rules

必须（MUST）：

- 视口 meta 必须声明 `width=device-width, initial-scale=1`，不得用 `user-scalable=no` 关闭缩放（WCAG 至少要求 2× 缩放）。需要贴边绘制（沉浸式底栏、全屏页）时用 `viewport-fit=cover`，并且固定在顶部 / 底部的元素必须用 `env(safe-area-inset-*)` 留出安全区（带回退值），不得被刘海或 Home 指示条遮挡。
- px 换算必须在构建期统一完成，并在项目技术基线声明设计稿宽度与方案：vw 方案用 postcss-mobile-forever（Vant 375 设计稿与业务 750 设计稿并存时，`viewportWidth` 用按文件返回的函数），rem 方案用 postcss-pxtorem（`rootValue` 37.5 对应 375 设计稿）；两种方案不得混用，换算范围用 include / exclude 显式声明。
- Vant 引入必须走官方口径：按需引入用 unplugin-vue-components + `@vant/auto-import-resolver` 的 `VantResolver()`，函数式 API（showToast 等）再加 unplugin-auto-import 以自动带样式；全量引入（`import 'vant/lib/index.css'` + `app.use(Vant)`）与按需引入不得同时使用。
- 业务页面只能使用 component-registry 中已登记的 `H5.*` 能力（`MasterH5*` 封装层）；不得在业务页直接散用 vendor 组件，缺少能力时先走新实体登记。
- vant、换算插件、resolver 的版本位必须经实抓核实，连同实抓日期记录到项目技术基线；不得沿用 Vant 2（Vue 2）的心智与 API。

应当（SHOULD）：

- 桌面浏览器调试应引入 `@vant/touch-emulator`（把鼠标事件转为触摸事件），并且只在开发环境加载。
- 宽屏与横屏应限制最大显示宽度并居中（postcss-mobile-forever 的 `maxDisplayWidth` / `appSelector`），fixed 定位元素随之留在中间视区。
- 路由组织应二选一并在 route-registry 显式登记：约定式文件路由或集中路由表；不得由文件路由插件隐式生成未登记路由。
- 交互性能应以现场数据第 75 百分位计：INP ≤ 200 ms 为 good，200–500 ms 需改进；首屏资源按路由拆分，图片按设备像素比提供。
- 触控目标应不小于 24 × 24 CSS px（WCAG 2.2 SC 2.5.8，AA）；软键盘弹出遮挡输入框、收起后滚动位置恢复应进入验收清单。

## Checklist

- [ ] 视口 meta、`viewport-fit` 与安全区处理已声明；固定底栏 / 顶栏在带刘海设备上不被遮挡。
- [ ] 设计稿宽度、换算方案（vw / rem 二选一）与 include / exclude 已写入项目技术基线。
- [ ] Vant 按需引入经 `VantResolver` 接线，未与全量引入混用；版本位带实抓日期。
- [ ] 业务页只引用已登记的 `H5.*` 能力；路由在 route-registry 中登记。
- [ ] `@vant/touch-emulator` 只在开发环境加载；INP 与触控目标尺寸进入验收。
