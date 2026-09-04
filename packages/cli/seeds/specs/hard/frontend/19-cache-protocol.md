---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/19-cache-protocol.md
seed_source_sha256: 893d5651016233eec36333775441a935746fe1202c8924dc2edf753d61523daf
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 19 缓存协议

## Scope

P1。定义字典、用户、权限、列表、详情、任务和偏好的缓存、隔离与失效。

## Non-Scope

不定义 HTTP/CDN 服务端缓存，不替代状态管理和接口契约。

## Terms

- Query Key：唯一描述结果集合的结构化键。
- Stale Time：数据可视为新鲜的时间。
- Invalidation：写操作后使依赖缓存失效。

## MUST

- 每个缓存声明 key、参数、身份/权限隔离、stale、保留和失效规则。
- Query Key 包含所有影响结果的筛选和上下文。
- 写操作定义依赖失效矩阵。
- 用户、角色、组织和数据范围切换时清理风险缓存。
- schema 变化时迁移或重置持久化偏好。

## MUST NOT

- MUST NOT 用同一 key 表示不同筛选或权限范围。
- MUST NOT mutation 后只改视觉而不刷新依赖。
- MUST NOT 长缓存实时敏感数据而无批准。
- MUST NOT 将 server cache 再复制进全局 store。

## SHOULD

- SHOULD 使用结构化 key factory 和集中失效策略。
- SHOULD 在后台刷新时保留可用旧数据并标识 stale。

## Contract

```text
Resource, QueryKey, IsolationKeys[], StaleTime,
Retention, RefetchTriggers[], MutationInvalidations[]
```

## Checklist

- [ ] key 覆盖所有结果参数。
- [ ] 身份与权限隔离安全。
- [ ] mutation 失效完整。
- [ ] schema 迁移明确。

## Examples

### 内容示例，可删除

列表 key 同时包含用户数据范围、分页、筛选和排序；权限变化后整体清除。

## Anti-patterns

所有用户共用 `['entity-list']`，导致筛选串扰甚至越权复用。

## Ownership

平台 Owner 维护缓存工具，领域 Owner 定义数据依赖和实时性。

## Change Policy

Key 结构或持久化 schema 改变必须版本化并提供迁移/清理。
