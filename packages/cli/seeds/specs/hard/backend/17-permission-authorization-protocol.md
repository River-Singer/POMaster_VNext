---
seed_source: pomaster/components/backend-hard-spec/assets/universal/17-permission-authorization-protocol.md
seed_source_sha256: d85a431b682a3a7c3dd4a6ee1f67fc375b54edb4a8e7fe98d283103b64a6b41e
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:permission-authorization-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [authorization, tenant, data-scope]
requires: []
---

# 权限与鉴权协议

## Scope

规范操作权限、数据范围、租户隔离、资源归属和字段脱敏。

## Non-Scope

不替代认证机制、业务状态规则或隐私保留决策。

## Terms

数据范围是主体在当前租户、角色与资源关系下可访问的记录集合。

## MUST

- 每个受保护操作必须在服务端验证主体、操作、租户、数据范围和资源归属。

## MUST NOT

- 不得只依赖路由隐藏、按钮状态或客户端传入的租户与 owner。

## SHOULD

- 应采用集中策略并测试越权、跨租户、批量与导出场景。

## Contract

权限契约必须定义主体、资源、动作、范围、拒绝语义和审计。

## Checklist

- [ ] 单条、列表、搜索、批量、导入与导出均执行一致范围控制。

## Examples

- 查询在数据库条件中收紧租户与数据范围，而不是返回后再过滤。

## Anti-patterns

- 只检查角色名，不检查目标资源归属和字段敏感级别。

## Ownership

BP 定义业务权限语义，Backend 执行最终授权。

## Change Policy

扩大权限范围必须经过正式业务确认、安全评审和回归测试。

