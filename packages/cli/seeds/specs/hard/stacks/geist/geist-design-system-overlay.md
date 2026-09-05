---
seed_source: pomaster/components/frontend-hard-spec/assets/stacks/geist/geist-design-system-overlay.md
seed_source_sha256: a9edc3d23708ccef6aeade6669dd638117f341052c47e0145347a5b51e085680
seed_version: B6F
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: frontend-stack:geist
capability: design-system
requires: []
conflicts: []
coexistence: independent
stages: [prepare, implement, check, release]
x-research-anchors:
  note: >-
    Vercel Geist 设计体系参照（2026-09-02 实抓，external-design-references 批次——
    external-sites-index 既有在册锚）：Foundations 现状为 colors / typography /
    materials（无 spacing foundation——缺席诚实）；70 组件清单；Button variant+state
    词表；Best Practices icon-only validator 抛错 = fail-closed 先例。设计体系站点
    无 npm 包版本位，时效以 verified 时点为准，过期引用须重新核实。
  sources:
    - url: https://vercel.com/geist
      fetched: 2026-09-02
    - url: https://vercel.com/font
      fetched: 2026-09-02
---

# Geist 设计体系 Overlay

## Scope

本 Overlay 具体化以 Vercel Geist 为设计体系参照的 foundations 词形、组件词表与使用规则引用边界。

## Rules

- Foundations 词形（colors / typography / materials）必须以实抓现状为准；Geist 现状无 spacing foundation——缺席诚实记录，禁杜撰 foundation 词形。
- 组件清单与 variant / state 词表以 Geist 组件页为词形锚；项目侧组件命名与变体词形引用时必须与锚一致或在册声明差异。
- 引用 Best Practices 要点（如 icon-only validator 抛错 = fail-closed 先例）必须带实抓时点；页面内容随后可能变动，过期引用须重新核实。
- Geist 为设计体系参照而非实现依赖——不得由 geist 参照推断框架、UI 组件库或 CSS 方案选型；与 UI 组件库 overlay 并存时各守各轴。

## Checklist

- [ ] 引用的 foundations / 组件词表 / 使用规则带 verified 时点（2026-09-02）且未过期或已重新核实。
- [ ] 参照边界在册：geist 参照不绑定实现依赖，token 消费与主题协议的衔接已显式声明。

