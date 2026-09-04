---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/30-data-grid-protocol.md
seed_source_sha256: c702a9956fd5e7aac40e1eefebcdd7a3518b95bd1a750bfcb31cbaddb80f41ff
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 30 数据表格协议

## Scope

P1。定义表格壳、列 schema、列宽、固定列、分页、排序筛选、虚拟滚动、列配置和导出。

## Non-Scope

不定义业务字段口径，不允许表格库决定页面权限和数据契约。

## Terms

- Grid Type：可编辑宽表、只读表、报表、主数据表等类型。
- Column Schema：列 key、类型、宽度、权限和行为契约。
- Saved View：用户保存的列、筛选和排序配置。

## MUST

- 表格通过统一壳和 typed Column Schema 渲染。
- 每列有稳定 key、标题、值类型、宽度策略、权限和导出规则。
- 大数据使用服务端分页/筛选/排序及虚拟化。
- 列配置按页面、表格、用户和 schema 版本隔离。
- 列宽修复先判断单页、同类型、领域 preset、表格壳或全局 token。
- 公共壳变更验证全部 Grid Type。
- 表格的交互状态（行 click / double-click / select / drag-select / 列头排序 click / 单元格 focus 等）MUST 在 `interaction-contract-registry` 中逐项声明，每项绑定触发的 `action_id` 与调用的 `api_requirement_ids`；表格不得存在未声明的交互。并非每个表格都要支持所有交互，但所支持的交互子集 MUST 显式界定并说明触发后果。排斥键盘的交互（drag / drag-select / hover-only）MUST 声明键盘等价路径（协议 23）。

## MUST NOT

- MUST NOT template 手写列或跨页面复制列数组。
- MUST NOT 为单页列宽修改全局 CSS。
- MUST NOT 不同类型表格共享污染配置 key。
- MUST NOT 前端加载全量数据假分页。

## SHOULD

- SHOULD 固定关键标识/操作列并限制冻结总宽。
- SHOULD 支持键盘、复制粘贴、冲突和保存视图的明确契约。

## Contract

```text
GridType, RowKey, ColumnSchema[], ServerOperations,
Virtualization, SavedViewKey, ExportScope, Permissions,
InteractionContracts[]
```

## Checklist

- [ ] 表格由 schema 驱动。
- [ ] 列宽影响层级正确。
- [ ] 大数据和配置隔离安全。
- [ ] 导出与当前视图一致。
- [ ] 每个支持的交互（行点击/双击/拖选/排序/聚焦）在 interaction-contract-registry 声明并绑定 action + API。

## Examples

### 内容示例，可删除

同类型报表共享 column preset；单页例外写在 page contract，不改可编辑宽表。

## Anti-patterns

为某报表加全局 `.table td { width }`，导致所有列表和宽表一起变化。

## Ownership

表格平台 Owner 维护壳，领域 Owner 维护列 schema，页面 Owner 维护例外。

## Change Policy

列 schema 和保存视图结构必须版本化；公共行为变化遵循影响评估和视觉回归。
