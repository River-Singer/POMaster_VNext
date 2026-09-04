---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/17-permission-protocol.md
seed_source_sha256: 3f51aeb30497c07a3b552c8f21ecff22730d276c85fd504fde16e9e17b622ec0
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 17 权限协议

## Scope

P1。定义菜单、页面、按钮、字段、数据范围和接口权限的前端一致表现。

## Non-Scope

不替代后端鉴权，不允许前端扩大或计算权威数据权限。

## Terms

- Operation Permission：可执行某动作。
- Field Permission：字段可见、脱敏、只读或编辑。
- Data Scope：允许访问的数据集合。

## MUST

- 菜单、路由、按钮、字段和接口使用同一权限语义。
- 直达 URL 仍经过页面权限守卫。
- 字段权限明确可见、脱敏、只读和编辑策略。
- 数据范围由后端过滤并影响查询、详情和导出。
- 权限不足提供一致、可解释状态。

## MUST NOT

- MUST NOT 只隐藏菜单或按钮而省略后端鉴权。
- MUST NOT 前端获取全量数据后自行过滤敏感内容。
- MUST NOT 按角色名称硬编码权限。
- MUST NOT 将 Feature Flag 当权限。

## SHOULD

- SHOULD 使用统一 gate/hook/component。
- SHOULD 对禁用动作展示只读原因。

## Contract

```text
PermissionCode, Resource, Action, FieldPolicy?,
DataScope?, BackendEnforcement, DeniedPresentation
```

## Checklist

- [ ] 菜单到接口一致。
- [ ] URL 无法绕过。
- [ ] 字段和数据范围安全。
- [ ] 无权限状态可解释。

## Examples

### 内容示例，可删除

无导出权限时入口按产品策略隐藏或禁用，后端导出接口仍拒绝请求。

## Anti-patterns

前端按 `role === 'admin'` 显示全部按钮，并认为无需后端校验。

## Ownership

业务/安全 Owner 定义权限，后端执行鉴权，前端平台维护统一呈现。

## Change Policy

权限码和数据范围变化必须同步菜单、路由、缓存、接口、测试和审计。
