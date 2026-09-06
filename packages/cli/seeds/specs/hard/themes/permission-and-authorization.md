---
seed_source: packages/cli/seeds/aggregation-manifest.json
seed_source_sha256: 039b637ccffacdfe3ce30d85e193f4b38928fcdfb16efdc4eb255e35e05af91f
seed_version: B7-THEME
lane: [frontend, backend]
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend, backend]
related_evidence_specs: []
related_tools: []
legacy_id: theme:permission-and-authorization
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: triggered # 聚合注记：来源同值；info 性注记非执行语义
stages: [prepare, implement, check] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [authorization, tenant, data-scope] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/17-permission-protocol.md
    sha256: 3f51aeb30497c07a3b552c8f21ecff22730d276c85fd504fde16e9e17b622ec0
    seed_version: B6B-1
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/17-permission-authorization-protocol.md
    sha256: d85a431b682a3a7c3dd4a6ee1f67fc375b54edb4a8e7fe98d283103b64a6b41e
    seed_version: B6C
---

# 权限与鉴权

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 17 权限协议（pomaster/components/frontend-hard-spec/assets/universal/17-permission-protocol.md）**

P1。定义菜单、页面、按钮、字段、数据范围和接口权限的前端一致表现。

**源：BE 17 权限与鉴权协议（pomaster/components/backend-hard-spec/assets/universal/17-permission-authorization-protocol.md）**

规范操作权限、数据范围、租户隔离、资源归属和字段脱敏。

## Non-Scope

**源：FE 17 权限协议**

不替代后端鉴权，不允许前端扩大或计算权威数据权限。

**源：BE 17 权限与鉴权协议**

不替代认证机制、业务状态规则或隐私保留决策。

## Terms

**源：FE 17 权限协议**

- Operation Permission：可执行某动作。
- Field Permission：字段可见、脱敏、只读或编辑。
- Data Scope：允许访问的数据集合。

**源：BE 17 权限与鉴权协议**

数据范围是主体在当前租户、角色与资源关系下可访问的记录集合。

## MUST

**源：FE 17 权限协议 · §MUST**

- 菜单、路由、按钮、字段和接口使用同一权限语义。
- 直达 URL 仍经过页面权限守卫。
- 字段权限明确可见、脱敏、只读和编辑策略。
- 数据范围由后端过滤并影响查询、详情和导出。
- 权限不足提供一致、可解释状态。

**源：BE 17 权限与鉴权协议 · §MUST**

- 每个受保护操作必须在服务端验证主体、操作、租户、数据范围和资源归属。

## MUST NOT

**源：FE 17 权限协议 · §MUST NOT**

- MUST NOT 只隐藏菜单或按钮而省略后端鉴权。
- MUST NOT 前端获取全量数据后自行过滤敏感内容。
- MUST NOT 按角色名称硬编码权限。
- MUST NOT 将 Feature Flag 当权限。

**源：BE 17 权限与鉴权协议 · §MUST NOT**

- 不得只依赖路由隐藏、按钮状态或客户端传入的租户与 owner。

## SHOULD

**源：FE 17 权限协议 · §SHOULD**

- SHOULD 使用统一 gate/hook/component。
- SHOULD 对禁用动作展示只读原因。

**源：BE 17 权限与鉴权协议 · §SHOULD**

- 应采用集中策略并测试越权、跨租户、批量与导出场景。

## Contract

**源：FE 17 权限协议 · §Contract**

```text
PermissionCode, Resource, Action, FieldPolicy?,
DataScope?, BackendEnforcement, DeniedPresentation
```

**源：BE 17 权限与鉴权协议 · §Contract**

权限契约必须定义主体、资源、动作、范围、拒绝语义和审计。

## Checklist

**源：FE 17 权限协议 · §Checklist**

- [ ] 菜单到接口一致。
- [ ] URL 无法绕过。
- [ ] 字段和数据范围安全。
- [ ] 无权限状态可解释。

**源：BE 17 权限与鉴权协议 · §Checklist**

- [ ] 单条、列表、搜索、批量、导入与导出均执行一致范围控制。

## Examples

**源：FE 17 权限协议 · §Examples**

### 内容示例，可删除

无导出权限时入口按产品策略隐藏或禁用，后端导出接口仍拒绝请求。

**源：BE 17 权限与鉴权协议 · §Examples**

- 查询在数据库条件中收紧租户与数据范围，而不是返回后再过滤。

## Anti-patterns

**源：FE 17 权限协议 · §Anti-patterns**

前端按 `role === 'admin'` 显示全部按钮，并认为无需后端校验。

**源：BE 17 权限与鉴权协议 · §Anti-patterns**

- 只检查角色名，不检查目标资源归属和字段敏感级别。

## Ownership

**源：FE 17 权限协议 · §Ownership**

业务/安全 Owner 定义权限，后端执行鉴权，前端平台维护统一呈现。

**源：BE 17 权限与鉴权协议 · §Ownership**

BP 定义业务权限语义，Backend 执行最终授权。

## Change Policy

**源：FE 17 权限协议 · §Change Policy**

权限码和数据范围变化必须同步菜单、路由、缓存、接口、测试和审计。

**源：BE 17 权限与鉴权协议 · §Change Policy**

扩大权限范围必须经过正式业务确认、安全评审和回归测试。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
