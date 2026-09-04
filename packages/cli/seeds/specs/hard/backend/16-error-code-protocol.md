---
seed_source: pomaster/components/backend-hard-spec/assets/universal/16-error-code-protocol.md
seed_source_sha256: aa80ee60f7431e14859f61e563784e71b2002f35e220964170a779800fdde090
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:error-code-protocol
criticality: standard
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [error-code, error-handling]
requires: []
---

# 错误码协议

## Scope

规范错误分类、稳定错误码、状态映射、字段错误、重试性与安全消息。

## Non-Scope

不负责日志采样、告警或业务规则本身。

## Terms

稳定错误码是调用方可依赖且不暴露内部实现的机器语义。

## MUST

- 失败必须映射到稳定 code、适当状态、可选字段错误、retryable 与 TraceId。

## MUST NOT

- 不得向调用方返回堆栈、SQL、secret 或不稳定内部异常文本。

## SHOULD

- 应区分认证、鉴权、未找到、冲突、校验、限流和服务失败。

## Contract

错误注册项必须包含语义、状态映射、消息边界、重试性和所有者。

## Checklist

- [ ] 新错误已验证客户端恢复、日志关联和兼容行为。

## Examples

- 乐观锁冲突返回稳定冲突 code，并明确客户端是否可重试。

## Anti-patterns

- 所有异常都返回 HTTP 200 或统一未知错误。

## Ownership

Backend 维护错误注册表，API 消费方按稳定语义处理。

## Change Policy

已发布错误码不得复用；废弃必须保留兼容说明。

