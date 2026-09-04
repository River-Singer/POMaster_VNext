---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/26-style-layout-protocol.md
seed_source_sha256: a66b216ca119c7296431233fb2bb6db9affd1f71ba011e5394aaaafdab9e8240
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 26 样式与布局协议

## Scope

P1。定义 CSS 组织、尺寸职责、溢出、层级、响应式、第三方覆盖和布局稳定。

## Non-Scope

不定义品牌色值、页面业务结构或组件 API。

## Terms

- Layout Owner：负责外层尺寸和区域关系的容器。
- Content Owner：负责内部内容排布的组件。
- Stable Dimension：动态状态下不引发布局跳动的尺寸约束。

## MUST

- 明确全局、组件、主题和第三方样式边界。
- 外层负责布局与 overflow，内层不得反向撑爆。
- 固定格式控件定义稳定尺寸、min/max 或比例。
- 文本换行、截断、tooltip 和横向滚动有统一规则。
- z-index 只能来自层级 token。
- 响应式断点和密度切换有验收矩阵。

## MUST NOT

- MUST NOT 为单页问题修改全局 CSS。
- MUST NOT 依赖特定父 DOM 才能正常显示。
- MUST NOT 使用孤立 magic number、无来源 z-index 和随意 `!important`。
- MUST NOT 通过缩小字体掩盖溢出。

## SHOULD

- SHOULD 优先使用标准 layout primitives。
- SHOULD 集中第三方样式适配。

## Contract

```text
Container, SizeOwner, OverflowPolicy, MinMax,
BreakpointBehavior, ZIndexToken, TextPolicy
```

## Checklist

- [ ] 尺寸责任明确。
- [ ] 长文本和小屏不破坏布局。
- [ ] 层级和第三方覆盖集中。
- [ ] 动态状态无跳动。

## Examples

### 内容示例，可删除

页面容器管理横向滚动，表格声明最小内容宽度，单元格不硬编码页面宽度。

## Anti-patterns

为修复一个弹窗把全局 z-index 提到极大值，随后所有 dropdown 层级失控。

## Ownership

Design System Owner 维护 token，Layout Owner 维护区域，组件 Owner 维护内部样式。

## Change Policy

全局布局和层级变化必须评估全部页面类型并执行视觉回归。
