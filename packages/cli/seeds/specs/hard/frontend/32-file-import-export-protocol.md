---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/32-file-import-export-protocol.md
seed_source_sha256: 2262d7ce2e910e4d64b0c6f3ef1af0b72c3cafc31d6cb1a796a8fb8b1801cbbc
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 32 文件、导入与导出协议

## Scope

P1。定义文件上传、下载、模板、导入校验、错误明细、导出范围和后台任务。

## Non-Scope

不定义底层存储实现，不替代安全、权限和异步任务接口契约。

## Terms

- Import Template：与 schema 版本匹配的输入模板。
- Partial Success：部分行成功、失败、跳过或警告。
- Export Scope：当前页、选中行、筛选全量、保存视图或汇总。

## MUST

- 上传声明类型、大小、数量、文件名和安全校验。
- 导入流程包含模板、上传、校验、任务、进度、结果和错误明细。
- 错误明细至少包含行、列、字段、原值、错误码和修复建议。
- 导出明确范围、字段、权限和有效期。
- 大文件使用后台任务，完成后刷新依赖数据。
- 下载时重新鉴权和校验数据范围。

## MUST NOT

- MUST NOT 静默导入失败。
- MUST NOT 大文件同步阻塞页面。
- MUST NOT 页面自行拼导出字段或绕过权限。
- MUST NOT 成功后遗漏缓存刷新。

## SHOULD

- SHOULD 支持取消、重试、结果通知和来源页面跳转。
- SHOULD 让模板和错误文件可追踪 schema 版本。

## Contract

```text
FilePolicy, TemplateVersion, ImportJob,
ErrorRowSchema, ExportScope, ResultExpiry, Permissions
```

## Checklist

- [ ] 文件策略明确。
- [ ] 导入全流程和部分成功完整。
- [ ] 导出范围与权限一致。
- [ ] 大文件任务化。

## Examples

### 内容示例，可删除

导入完成显示成功、失败、跳过和警告数量，并提供字段级错误文件。

## Anti-patterns

上传后只显示“导入失败”，没有行号、原因、TraceId 或重试路径。

## Ownership

业务 Owner 定义字段，文件/任务 Owner 维护流程，安全 Owner 维护文件策略。

## Change Policy

模板、字段和错误 schema 变化必须版本化并提供兼容/迁移说明。
