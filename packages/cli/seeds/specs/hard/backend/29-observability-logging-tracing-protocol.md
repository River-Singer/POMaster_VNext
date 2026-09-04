---
seed_source: pomaster/components/backend-hard-spec/assets/universal/29-observability-logging-tracing-protocol.md
seed_source_sha256: e871f5d7d1e9fe68956881877baba94f376a5539753441853f8cfa12939f5ebd
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:observability-logging-tracing-protocol
criticality: standard
injection_mode: triggered
stages: [implement, check, release]
triggers: [observability, logging, tracing]
requires: []
---

# 可观测性、日志与追踪协议

## Scope

规范日志、指标、TraceId、审计、告警和事故诊断证据。

## Non-Scope

不替代错误码、隐私、安全或具体监控平台配置。

## Terms

可观测信号包括结构化日志、指标、trace、审计和健康状态。

## MUST

- 关键操作必须可关联版本、环境、主体、操作结果与 TraceId。

## MUST NOT

- 不得记录 token、密码、secret、完整敏感 payload 或无界高基数值。

## SHOULD

- 应为关键失败、延迟、容量和依赖建立可行动的指标与告警。

## Contract

信号设计必须定义 schema、级别、采样、保留、脱敏、Owner 与排障用途。

## Checklist

- [ ] 成功、失败、重试、降级和恢复均能通过信号关联。

## Examples

- 外部调用 trace 记录供应方、结果类和延迟，不记录认证凭据。

## Anti-patterns

- 只打印自由文本异常，无法按请求、版本或业务操作聚合。

## Ownership

服务维护者拥有诊断信号，运行角色维护告警与事故流程。

## Change Policy

信号 schema、采样或保留变化必须评估仪表盘、告警和隐私影响。

