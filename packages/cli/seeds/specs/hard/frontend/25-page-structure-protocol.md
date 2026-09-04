---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/25-page-structure-protocol.md
seed_source_sha256: 5fb926a798842262d7f87555e3e63e104c868a401eb27f3c1f899e677fdf5f4f
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 25 页面结构协议

## Scope

P1。定义列表、详情、报表、工作台等页面类型的固定区域、顺序和交互容器。

## Non-Scope

不定义组件内部 API、具体视觉 token 或业务字段。

## Terms

- Page Type：有稳定目标和结构的页面类别。
- Page Contract：页面 key、结构、权限、状态和导航契约。
- Region：Header、Context、Search、Toolbar、Main、SidePanel、Footer 等区域。

## MUST

- 新页面先选择 Page Type 和 Page Contract。
- 每类页面定义标题、面包屑、筛选、工具栏、主体、分页和详情位置。
- 主次操作、批量操作和状态信息位置一致。
- 抽屉、弹窗和路由跳转有选择规则。
- 同类页面共性问题在共享结构层修复。

## MUST NOT

- MUST NOT 新页面临场创造区域顺序。
- MUST NOT 把筛选、操作、表格和分页揉成不可复用单体。
- MUST NOT 让不同页面类型共享含糊结构。
- MUST NOT 绕过 Page Contract 创建路由页面。

## SHOULD

- SHOULD 使用标准 PageShell 和区域组件。
- SHOULD 让上下文、状态和恢复路径可见。

## Contract

```text
PageKey, PageType, Regions[], PrimaryActions[],
Permissions[], States[], Navigation, Owner
```

## Checklist

- [ ] 页面已归类。
- [ ] 区域顺序正确。
- [ ] 操作、状态和导航完整。
- [ ] 同类页面使用共享结构。

## Examples

### 内容示例，可删除

标准列表页按 Header、Search、Toolbar、Table、Pagination、Drawer 排列。

## Anti-patterns

每个 CRUD 页面复制一套不同筛选和按钮顺序，逐渐产生不一致。

## Ownership

UX/前端架构 Owner 维护 Page Type，领域 Owner 维护具体 Page Contract。

## Change Policy

新增 Page Type 需证明现有类型不能覆盖，并评估所有同类页面和迁移。
