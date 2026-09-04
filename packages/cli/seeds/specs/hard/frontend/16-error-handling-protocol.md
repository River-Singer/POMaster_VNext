---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/16-error-handling-protocol.md
seed_source_sha256: 0c6adc425e01a003e1f3c83fcf51f1d287767c95a4da50c15f5f639d9104f07f
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 16 错误处理协议

## Scope

P1。定义认证、权限、资源、冲突、校验、限流、服务、网络和部分失败的前端呈现与恢复。

## Non-Scope

不定义后端错误码本身，不替代监控采集和业务校验。

## Terms

- Field Error：可定位到字段/单元格的错误。
- Recover Action：登录、刷新、重试、重载、联系管理员或解决冲突。
- Error Boundary：隔离渲染失败的边界。

## MUST

- 将原始错误归一化为稳定 code、trace、fieldErrors、retryable 和 recoverAction。
- 401、403、404、409、422、429、5xx 和网络错误分别处理。
- 字段错误定位字段，部分失败提供逐项明细。
- 分层设置错误边界，局部失败不得导致整页白屏。
- 用户知道发生什么、能否恢复和下一步。

## MUST NOT

- MUST NOT 用一个 Toast 处理所有错误。
- MUST NOT 吞掉字段错误、冲突或 TraceId。
- MUST NOT 展示技术堆栈、敏感参数或原始 HTML。
- MUST NOT 自动重试不安全 mutation。

## SHOULD

- SHOULD 区分页面错误、字段错误、后台任务和短暂反馈。
- SHOULD 在错误恢复后刷新受影响数据。

## Contract

```text
Error { status?, code, safeMessage, traceId?,
fieldErrors?, retryable, recoverAction? }
```

## Checklist

- [ ] 错误分类和位置正确。
- [ ] 恢复动作可执行。
- [ ] TraceId 可定位。
- [ ] 敏感信息未泄露。

## Examples

### 内容示例，可删除

409 保留本地编辑，提示比较最新版本，而不是自动覆盖。

## Anti-patterns

所有失败统一 Toast“操作失败”，字段输入被清空且无错误编号。

## Ownership

契约 Owner 定义错误码，平台 Owner 维护归一化，页面 Owner 负责上下文呈现。

## Change Policy

错误码或恢复语义变化必须同步契约、映射、文案、Mock、监控和测试。
