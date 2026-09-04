---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/29-routing-url-protocol.md
seed_source_sha256: 3066c383489e1cb72271fe48d4a716860c58381d90e46ee1b2f114c61010949e
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 29 路由与 URL 协议

## Scope

P1。定义路由命名、参数、URL 状态、返回恢复、守卫和异常页面。

## Non-Scope

不定义页面内部布局、权限来源和全局状态库。

## Terms

- Route Contract：name、path、meta 和页面 key 的稳定定义。
- Shareable State：刷新、分享、返回后应恢复的状态。
- Ephemeral State：弹窗、hover、未提交输入等临时状态。

## MUST

- 每个页面路由有稳定 name、path、page key、title、权限和布局 meta。
- 分页、筛选、排序、tab 等 Shareable State 进入 URL。
- Query 有 schema、默认值、解析失败兜底和版本策略。
- 返回恢复分页、筛选、排序和必要视图状态。
- 401、403、404、500 和资源删除有统一路由策略。

## MUST NOT

- MUST NOT 把 token、敏感信息、大对象和未提交表单放入 URL。
- MUST NOT 用标题字符串或 URL 截取判断菜单。
- MUST NOT 在页面直接修改全局路由表。
- MUST NOT 改 path/name 而不更新调用方。

## SHOULD

- SHOULD 由 Page Contract 生成路由、菜单和埋点关联。
- SHOULD 使用 typed query parser。

## Contract

```text
RouteName, Path, PageKey, Meta, ParamsSchema,
QuerySchema, RestorePolicy, ErrorRoutes
```

## Checklist

- [ ] 路由和页面 key 一致。
- [ ] URL 状态可分享恢复。
- [ ] 临时/敏感状态未进入 URL。
- [ ] 异常路由完整。

## Examples

### 内容示例，可删除

列表分页筛选写入 query，返回列表时按 URL 恢复，不依赖全局临时 store。

## Anti-patterns

用中文标题匹配当前菜单，将所有页面筛选永久存入全局状态。

## Ownership

平台路由 Owner 维护机制，页面 Owner 维护 Route Contract，权限 Owner 维护守卫语义。

## Change Policy

路由破坏性变化必须提供重定向、链接迁移和监控观察期。
