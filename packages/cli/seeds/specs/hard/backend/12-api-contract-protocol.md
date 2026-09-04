---
seed_source: pomaster/components/backend-hard-spec/assets/universal/12-api-contract-protocol.md
seed_source_sha256: 35519d81548cabff729de888e0bf9e0d5b40a0274c9fa3684641b50e75938ca0
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:api-contract-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [api-contract, api-change]
requires: []
---

# API 契约协议

## Scope

规范请求响应、版本、字段、权限、错误、幂等、分页、兼容与 TraceId。

## Non-Scope

不替代领域规则、最终鉴权或具体 endpoint 事实。

## Terms

正式契约是 OpenAPI 或项目明确指定的等价权威来源。

## MUST

- method、path、字段、状态码、错误码、权限和兼容策略必须与实现一致。

## MUST NOT

- 不得把 Mock、聊天记录或调用方猜测当作正式契约。

## SHOULD

- 应对新增字段、分页、重试和版本演进采用向后兼容默认值。

## Contract

每个接口必须定义输入、输出、失败、幂等、权限、追踪与版本语义。

## Checklist

- [ ] 契约、实现、生成客户端、测试和 handoff 已同步。

## Examples

- 冲突返回稳定错误码与 TraceId，而不是泄露内部异常。

## Anti-patterns

- 修改响应字段但不更新正式契约和调用方兼容测试。

## Ownership

Backend 维护服务端契约，消费者确认联调与兼容结果。

## Change Policy

破坏性 API 变化必须按契约变更协议执行版本与迁移。

