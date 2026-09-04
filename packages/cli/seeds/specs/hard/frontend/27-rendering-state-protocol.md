---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/27-rendering-state-protocol.md
seed_source_sha256: a640bacd811e05a35075d96ffb99ba51b8b6e11cc2a5443e3bbca0eb124738e4
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 27 渲染状态协议

## Scope

P1。定义 loading、refreshing、empty、error、permission、partial、offline、stale 和大数据状态。

## Non-Scope

不定义后端错误码、业务状态机和具体文案风格。

## Terms

- Initial Loading：首次无可用内容加载。
- Background Refresh：保留已有内容的刷新。
- Partial Success：部分对象成功、部分失败。
- Stale Data：仍可展示但可能过期的数据。

## MUST

- 页面覆盖非理想状态并定义优先级。
- 首屏骨架保持主要布局尺寸。
- empty 区分无数据与筛选无结果。
- error、permission 和 offline 提供恢复动作。
- partial success 提供成功/失败/跳过数量和明细。
- 弹层声明销毁、保留、dirty 和关闭策略。

## MUST NOT

- MUST NOT 只实现成功有数据状态。
- MUST NOT 后台刷新时清空已有内容。
- MUST NOT 用 Toast 代替页面或字段状态。
- MUST NOT 错误后不给恢复入口。

## SHOULD

- SHOULD 使用统一状态组件并允许领域化内容。
- SHOULD 对 stale 和离线数据标识更新时间。

## Contract

```text
State, Priority, Presentation, RecoverAction,
LayoutReservation, AccessibilityAnnouncement
```

## Checklist

- [ ] 状态矩阵完整。
- [ ] 优先级无冲突。
- [ ] 恢复动作可用。
- [ ] 布局和焦点稳定。

## Examples

### 内容示例，可删除

后台刷新保留表格行，只在工具栏显示轻量进度；失败后仍可查看旧数据。

## Anti-patterns

每次翻页都整页白屏，错误后只弹一次 Toast 且无法重试。

## Ownership

页面 Owner 维护状态矩阵，Design System Owner 维护状态组件，API Owner 提供必要信息。

## Change Policy

新增状态必须更新页面 contract、组件、文案、可访问性和测试。
