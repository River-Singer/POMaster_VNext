---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/36-feature-flag-protocol.md
seed_source_sha256: ba6cf2d5607ba54d9864cd6c07899d2e13a8d33ea248fbd7469b92c23474f474
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 36 Feature Flag 协议

## Scope

P2。定义功能开关来源、命名、灰度范围、关闭表现、默认值和生命周期。

## Non-Scope

不替代权限、业务状态和环境配置。

## Terms

- Flag Key：稳定唯一的开关键。
- Targeting：按环境、用户、角色或组织控制命中。
- Kill Switch：紧急关闭新能力的开关。

## MUST

- 每个 flag 有 owner、目的、默认值、目标范围、期限和清理日期。
- 入口、路由和后台请求在关闭时一致停用。
- 获取失败使用保守默认值。
- Flag 与权限同时通过才允许操作。
- 全量稳定后删除临时判断和旧路径。

## MUST NOT

- MUST NOT 在多个页面手写同一判断。
- MUST NOT 将 flag 当权限或业务状态。
- MUST NOT 使用无 owner、无期限的永久临时 flag。
- MUST NOT 关闭 UI 却继续触发后台请求。

## SHOULD

- SHOULD 支持灰度、回滚、监控和实验审计。
- SHOULD 对关键写操作提供 kill switch。

## Contract

```text
FlagKey, Owner, Default, Targeting, Fallback,
StartAt, EndAt, CleanupAt, Metrics
```

## Checklist

- [ ] 默认和失败行为安全。
- [ ] UI/路由/请求一致。
- [ ] 不绕过权限。
- [ ] 有清理日期。

## Examples

### 内容示例，可删除

新编辑器 flag 关闭后回到旧编辑器，相关新 API 不再调用。

## Anti-patterns

组件中散落环境判断，开关关闭后深链接仍能访问新功能。

## Ownership

功能 Owner 维护业务生命周期，平台 Owner 维护系统，安全/权限 Owner 审查边界。

## Change Policy

Flag 语义和目标规则变化必须记录；转长期配置时迁移到正式配置系统。
