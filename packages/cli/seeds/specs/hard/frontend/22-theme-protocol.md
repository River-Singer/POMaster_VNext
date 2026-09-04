---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/22-theme-protocol.md
seed_source_sha256: b93ed272a0def5abc689fe66d939b87cacf6f38cce5d6278cfd5c94d1754b3ec
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 22 主题协议

## Scope

P1。定义亮暗、品牌、紧凑、大字体等主题及 token 覆盖、切换和持久化。

## Non-Scope

不定义基础 token 语义，不允许主题改变业务含义。

## Terms

- Theme：一组完整 token 值。
- Theme Mode：light/dark 或其他可选模式。
- Theme Adapter：同步第三方组件、图表和 portal 的适配层。

## MUST

- 明确支持的主题列表和默认主题。
- 所有主题覆盖完整语义 token，而非只换背景。
- 表格、图表、弹层、焦点和状态随主题同步。
- 切换、持久化、系统偏好和失败回退有策略。
- 每个主题满足可访问性和视觉回归。

## MUST NOT

- MUST NOT 在业务组件写死应由主题控制的颜色。
- MUST NOT 让局部页面自行换肤。
- MUST NOT 只处理页面背景而遗漏 portal/图表。
- MUST NOT 用主题切换表达权限或业务状态。

## SHOULD

- SHOULD 使用 CSS variables 或等价运行时 token。
- SHOULD 避免主题切换闪烁和布局变化。

## Contract

```text
ThemeId, TokenSet, Default, Persistence,
SystemPreference, ThirdPartyAdapters[], Fallback
```

## Checklist

- [ ] 支持范围和默认值明确。
- [ ] token 覆盖完整。
- [ ] 第三方与 portal 同步。
- [ ] 对比度和回退通过。

## Examples

### 内容示例，可删除

主题切换统一更新页面、弹窗、表格和图表 palette。

## Anti-patterns

仅给 body 加 dark class，而下拉、弹窗和图表仍使用亮色。

## Ownership

Design System Owner 维护主题 token，平台 Owner 维护切换，组件 Owner 负责兼容。

## Change Policy

新增主题必须完整覆盖和验收；删除主题需迁移用户偏好并提供回退。
