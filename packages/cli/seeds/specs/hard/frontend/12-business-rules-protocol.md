---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/12-business-rules-protocol.md
seed_source_sha256: dda683a7c907989032c82a2c1c3e552b51226e0e0cd5bdf3b6068cc7f649c525
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 12 业务规则协议

## Scope

P1。定义领域校验、操作许可、状态流转、时间范围、金额规则入口和后端兜底关系。

## Non-Scope

不定义视觉呈现，不允许前端规则替代后端权威规则。

## Terms

- Domain Rule：不依赖具体页面的业务判断。
- State Machine：合法状态及转换集合。
- Authoritative Validation：决定业务结果的后端校验。

## MUST

- 规则集中存放、命名、测试并有 Owner。
- 页面和组件调用规则函数，不复制表达式。
- 状态转换声明来源、目标、条件、权限和失败码。
- 金额、比例、日期区间和操作限制有明确契约。
- 后端执行最终一致性和权威校验。

## MUST NOT

- MUST NOT 将同一规则散落在组件、文案和 API 回调。
- MUST NOT 以按钮禁用代替后端校验。
- MUST NOT 在无正式来源时发明状态或公式。
- MUST NOT 用展示文案作为规则返回值。

## SHOULD

- SHOULD 使用纯函数、schema 和状态机表达可测试规则。
- SHOULD 返回稳定原因码供 UI 映射文案。

## Contract

```text
RuleId, Inputs, Preconditions, Result,
ReasonCodes[], BackendEnforcement, Owner, Version
```

## Checklist

- [ ] 规则来源和 Owner 明确。
- [ ] 页面未复制规则。
- [ ] 状态与错误码完整。
- [ ] 后端有权威兜底。

## Examples

### 内容示例，可删除

`canApprove(entity, actor)` 返回允许状态和原因码，页面仅决定如何展示。

## Anti-patterns

三个页面分别用不同 if 判断“审批中不可编辑”，导致规则漂移。

## Ownership

业务/领域 Owner 定义语义，后端 Owner 保证权威执行，前端负责一致呈现。

## Change Policy

规则或状态变化必须版本化并同步 API、权限、审计、文案和测试。
