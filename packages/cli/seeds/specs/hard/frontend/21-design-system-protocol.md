---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/21-design-system-protocol.md
seed_source_sha256: 317d4086949eb7d26ea2465adc6521ba6ebb611dca0d2f32aec2c57a985be4f3
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 21 设计系统协议

## Scope

P1。定义合法 UI 的 token、组件、视觉状态、栅格、密度和动效来源。

## Non-Scope

不决定具体品牌主题，不替代页面结构、可访问性和设计交付协议。

## Terms

- Design Token：可复用的设计决策变量。
- Semantic Token：按用途而非具体值命名的 token。
- Component Token：组件级语义变量。

## MUST

- 定义颜色、字体、间距、圆角、阴影、层级、断点、状态和动效 token。
- UI 只能从 token 和批准组件取得视觉规则。
- hover、active、focus、disabled、loading、empty、error 状态完整。
- token 到代码和设计工具的映射有唯一来源。
- 新视觉规则有复用语义和 Owner。

## MUST NOT

- MUST NOT 写孤立色值、魔法间距和临时阴影。
- MUST NOT 用“看起来差不多”代替 token。
- MUST NOT 在业务页面创建第二套视觉语言。
- MUST NOT 用设计稿临时样式覆盖 Design Token。

## SHOULD

- SHOULD 使用语义 token 分离品牌值与组件用途。
- SHOULD 自动校验 token 使用和弃用。

## Contract

```text
TokenName, Layer, SemanticMeaning, ValueByTheme,
AllowedConsumers, Deprecated?, Owner
```

## Checklist

- [ ] 所有视觉值来自 token。
- [ ] 状态与断点完整。
- [ ] 设计和代码来源一致。
- [ ] 新 token 有复用语义。

## Examples

### 内容示例，可删除

组件使用 `color.action.primary`，而不是直接写品牌蓝十六进制值。

## Anti-patterns

页面根据设计截图手写近似颜色和 13px/17px 等孤立间距。

## Ownership

Design System Owner 与前端 Owner 共同维护，组件 Owner 消费但不私自改值。

## Change Policy

Token 改名/删除先 deprecated；值变化评估所有组件并执行视觉与对比度回归。
