---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/40-analytics-protocol.md
seed_source_sha256: f638c8054ba32d44a15f1dd4fa42b637e1f6ad39cd73c6e1d45cd5bfd71b2c56
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 40 埋点协议

## Scope

P2。作为业务行为分析的唯一权威，定义用户行为事件、关键业务动作、漏斗、事件 schema、上报时机、去重、同意/授权和分析用途。

## Non-Scope

不替代错误监控、技术 telemetry、Trace/Span、RUM 运行诊断和后端审计；这些运行可观测性规则归 `34-monitoring-logging-protocol`。LCP/INP/CLS 等性能预算与分位数归 `31-performance-protocol`。不允许收集未批准敏感数据。

## Terms

- Event Schema：事件名和字段契约。
- Funnel：按稳定业务阶段关联的一组行为事件，用于分析到达、转化、放弃和结果。
- OperationId：关联 attempt/result 的操作标识。
- Deduplication Key：防止重复上报的键。
- Consent State：当前用户对非必要分析采集的同意、拒绝或撤回状态。

## MUST

- 事件使用稳定 key，不使用显示文案。
- 定义公共字段、业务白名单、触发时机和去重。
- 每个分析事件必须声明 event_id、schema_version、业务目的、触发条件、字段白名单、隐私分类、Owner、目的地和保留策略；页面或组件不得临时扩展 schema。
- attempt 与 result 通过 OperationId 关联。
- 核心用户旅程必须以稳定业务阶段定义漏斗，并明确进入、成功、失败、放弃和不适用口径；漏斗不得依赖显示文案、DOM 或 URL 猜测。
- 页面重渲染、自动刷新和重试不得误记为用户操作。
- 敏感字段、搜索原文和业务原值默认不上传。
- 新事件有 Owner、用途和保留策略。
- 采集必须遵循适用的同意/授权状态；用户撤回后停止非必要采集，并清理或隔离尚未发送的数据。
- 事件目的地与 payload 字段必须使用白名单；第三方分析脚本、转发规则和数据出境必须经过安全与隐私评审。
- page-view、action、attempt/result 等事件必须使用稳定 page_id/action_id/operation_id 关联；技术 trace-id 仅可作为经批准的关联字段，不得把分析事件变成运行日志副本。

## MUST NOT

- MUST NOT 同一行为多次上报或多名称。
- MUST NOT 页面自行扩展不受控公共字段。
- MUST NOT 用埋点代替审计。
- MUST NOT 上报权限外数据。
- MUST NOT 通过抓取 DOM、可见文本、URL 查询参数或用户输入来临时拼装分析数据。
- MUST NOT 在同意状态未知或撤回后继续发送非必要分析事件。
- MUST NOT 用业务分析事件替代错误、白屏、API RED、Trace/Span 或 RUM 技术遥测。
- MUST NOT 把同一业务漏斗阶段在多个页面或组件中定义为不同语义。

## SHOULD

- SHOULD 通过 typed analytics client 和 schema 校验。
- SHOULD 监控事件质量、丢失和重复率。
- SHOULD 对漏斗的迟到、乱序、重复、跨设备和 consent 变化定义明确处理策略。

## Contract

```text
EventId, SchemaVersion, Purpose, FunnelId, FunnelStage, PageId, ActionId,
Trigger, CommonFields, BusinessFields, OperationId, DedupKey, ConsentState,
PrivacyClass, Destination, Owner, Retention
```

## Checklist

- [ ] 名称和字段稳定。
- [ ] 时机与去重正确。
- [ ] 漏斗阶段、成功/失败/放弃口径和 OperationId 关联明确。
- [ ] 隐私边界通过。
- [ ] Owner 和用途明确。
- [ ] 同意、撤回、目的地白名单和待发送队列清理已验证。
- [ ] 业务事件未复制 34 的运行诊断或 31 的性能预算规则。

## Examples

### 内容示例，可删除

用户点击导出记录业务 `attempt`，后台任务完成记录 `result`，两者共享 operation id 并进入同一导出漏斗；API 耗时、错误码和 trace 诊断仍由 34 记录。

## Anti-patterns

按钮组件和页面都上报点击，导致同一行为计数两次且字段不同。

把 JS 错误、API RED 指标和 LCP 阈值塞进分析事件 schema，导致运行诊断、性能预算与业务转化口径互相污染。

## Ownership

数据/产品 Owner 定义用途，埋点平台 Owner 维护 schema，安全/隐私 Owner 审核字段。

## Change Policy

事件改名、字段语义和保留变化必须版本化并通知下游消费者。
