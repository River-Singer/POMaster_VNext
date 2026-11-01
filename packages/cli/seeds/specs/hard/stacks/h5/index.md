---
seed_source: pomaster/components/frontend-hard-spec/assets/stacks/h5/index.md
seed_source_sha256: 6f8d516cc1fb4ef71761ce3636e405dfd3d6e6f2d9d08e95218754b4954bd08c
seed_version: B6H
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# H5 / 移动端 Overlay 索引

本目录只描述 H5（移动端浏览器 / WebView）适配：视口与单位换算、组件库按需引入、路由组织、安全区与触控、移动端性能。它不推断 Vue 版本、CSS 作用域体系或 B 端组件库选型；C 端组件以 component-registry 中的 `H5.*` 能力（`MasterH5*` 封装层）为准。

| ID | 文件 | 能力 |
|---|---|---|
| `frontend-stack:h5` | `h5-mobile-overlay.md` | `mobile-web-adaptation` |
