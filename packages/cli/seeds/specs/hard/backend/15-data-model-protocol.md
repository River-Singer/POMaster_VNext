---
seed_source: pomaster/components/backend-hard-spec/assets/universal/15-data-model-protocol.md
seed_source_sha256: 21cdd88fac93c9dc834a51d62978b51453ca02eca68f223859aeca0ada99c3f2
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:data-model-protocol
criticality: standard
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [data-model, dto, mapping]
requires: []
---

# 数据模型协议

## Scope

规范 Command、DTO、Domain Model、Entity 与持久化模型的边界和映射。

## Non-Scope

不定义具体项目字段、表或业务枚举。

## Terms

边界模型是在特定层或契约中表达数据的稳定结构。

## MUST

- 每次转换必须明确字段来源、空值、默认值、精度、时间和枚举语义。

## MUST NOT

- 不得让 API DTO、ORM Entity 与领域模型无条件共用同一类型。

## SHOULD

- 应只在边界转换一次，并通过契约或 round-trip 测试验证。

## Contract

映射必须声明源、目标、必填性、丢失规则和失败行为。

## Checklist

- [ ] 新增字段已追踪到所有生产、转换、存储与消费边界。

## Examples

- API 字符串枚举在入口转换为受控领域值，未知值返回稳定错误。

## Anti-patterns

- 使用反射复制掩盖字段语义、精度或空值差异。

## Ownership

各边界 Owner 维护模型契约，映射实现者负责 round-trip 证据。

## Change Policy

模型变化必须评估 API、数据、消息和历史数据兼容性。

