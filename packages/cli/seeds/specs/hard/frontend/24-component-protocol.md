---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/24-component-protocol.md
seed_source_sha256: 5ed49550278ae263d7b4f3914c20c31a3005dc101d45bbd48c025a444f7441c4
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 24 组件协议

## Scope

P1。定义组件分层、复用门槛、目录、Props、Events、Slots、状态和公共 API。

## Non-Scope

不定义页面整体结构，不允许组件隐式承担接口、路由和全局状态职责。

## Terms

- Base Component：无业务语义的基础控件。
- Domain Component：具有稳定领域语义的组件。
- Page-local Component：只服务单页的内部组件。
- Public Component：跨所有者复用并有稳定 contract 的组件。

## MUST

- 新建前搜索现有组件并记录不能复用的原因。
- 组件归属、Owner、目的和非目标明确。
- Public Component 有类型化 Props、Events、Slots、状态、文档、测试和公开入口。
- 状态至少考虑 loading、empty、error、disabled、readonly 和 focus。
- 第二个消费者出现时重新评估提升层级。

## MUST NOT

- MUST NOT 为减少几行代码创建无职责组件。
- MUST NOT 传整个 DTO 或万能配置对象。
- MUST NOT 让展示组件偷偷请求接口、改路由或全局状态。
- MUST NOT 从其他页面内部目录引用组件。

## SHOULD

- SHOULD 使用受控输入和语义事件。
- SHOULD 提供可运行示例和弃用策略。

## Contract

```text
Purpose, Owner, Props, Events, Slots, PublicMethods,
States, Permissions, Accessibility, Tokens, ReuseRules, ForbiddenChanges
```

## Checklist

- [ ] 复用搜索完成。
- [ ] 分层和公开入口正确。
- [ ] 接口与状态完整。
- [ ] 测试、示例和 a11y 齐全。

## Examples

### 内容示例，可删除

业务状态标签放领域层，基础 Tag 只负责通用视觉和语义。

## Anti-patterns

创建 `CommonTable2`，接收任意对象并在内部请求多个业务 API。

## Ownership

组件 Owner 维护 contract，调用方遵守公开 API，Design System Owner 维护基础组件视觉。

## Change Policy

公共 API 变化遵循影响评估、兼容、deprecated、迁移和删除周期。
