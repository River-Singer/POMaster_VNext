---
seed_source: POMaster_VNext/packages/cli/seeds/specs/hard/stacks/tailwind/tailwind-css-overlay.md
seed_source_sha256: c5c814411ad55a7543d448a42fe87d2e5670a0cbb317cc8d62ee4215b0c6006d
seed_version: B8-VNEXT
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: frontend-stack:tailwind
capability: css-system
requires: []
conflicts: []
coexistence: independent
stages: [prepare, implement, check, release]
x-research-anchors:
  note: >-
    VNext 自有 overlay（vendor 无对应件，2026-11-07 新著）：css 键选 tailwind 时的 CSS 体系能力，与
    frontend-stack:css（scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css）互斥。条文是对 Tailwind CSS 官方文档
    （v4.3：CSS 优先配置、@theme 主题变量、纯文本类名检测与 @source、Preflight）的自行转述；类名检测页实抓核对，
    其余页经检索结果核对在册。版本位本 overlay 不写死，由项目按「Rules」实抓后记录。
  sources:
    - url: https://tailwindcss.com/docs/detecting-classes-in-source-files
      fetched: 2026-11-07
    - url: https://tailwindcss.com/docs/theme
      fetched: 2026-11-07
    - url: https://tailwindcss.com/docs/preflight
      fetched: 2026-11-07
    - url: https://tailwindcss.com/blog/tailwindcss-v4
      fetched: 2026-11-07
---

# Tailwind CSS 体系 Overlay

## Scope

本 Overlay 具体化 css 键选 Tailwind CSS 4 时的引入方式、主题变量、类名检测、组件变体与全局重置的官方词形与版本边界。

## Rules

- 必须固定并记录 tailwindcss 与构建插件（@tailwindcss/vite 或 @tailwindcss/postcss）的版本位与来源；v4 起配置写在 CSS 里（`@import "tailwindcss"`，主题变量用 `@theme` 声明），不沿用 v3 的 tailwind.config.js 心智。
- 设计 token 只经主题变量进入（颜色、字号、圆角、阴影、间距、断点），页面里不用任意值（`bg-[#f50]`、`text-[13px]`）绕开 token；确需任意值时登记理由与范围。
- 类名必须完整出现在源码里：Tailwind 按纯文本扫描源码，不识别拼接出来的类名（`text-${color}-600`）；按 props 映射到写全的类名表；不在扫描范围内的来源用 `@source` 登记。
- 组件变体用变体表（如 class-variance-authority）加类名合并函数（如 tailwind-merge）表达；调用处只追加布局类，不整套覆盖组件自身的类。
- Preflight 是全局重置；与另一套全局重置并存时必须用 `@layer` 声明层序，不得两套重置互相覆盖。
- 不得由 Tailwind 选型推断组件库或设计体系选型（Geist / shadcn/ui 归 ui 键）。

## Checklist

- [ ] 版本位（tailwindcss / 构建插件）经实抓核实并记录在项目技术基线。
- [ ] 主题变量集中在一份入口 CSS 的 `@theme` 里；页面没有绕开 token 的任意值。
- [ ] 源码里没有拼接出来的类名；扫描范围外的来源已用 `@source` 登记。
- [ ] 只有一套全局重置，或层序已声明。
