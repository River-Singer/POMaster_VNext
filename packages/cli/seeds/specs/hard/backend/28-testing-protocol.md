---
seed_source: pomaster/components/backend-hard-spec/assets/universal/28-testing-protocol.md
seed_source_sha256: f5df73dd7bec4ccf4132c3d7a9918a6f1cb0dd9682aa17956cb24446aa406ad7
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:testing-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, check, release]
triggers: [testing, acceptance]
requires: []
---

# 测试协议

## Scope

规范单元、API、集成、契约、迁移、并发、安全、性能与故障测试。

## Non-Scope

不规定统一覆盖率阈值或替代验收证据协议。

## Terms

测试层级按需要隔离的边界与要证明的风险划分。

## MUST

- 测试计划必须覆盖变更行为、边界、失败、兼容和高风险交互。

## MUST NOT

- 不得用固定 sleep、共享脏数据或只测成功路径获得虚假稳定性。

## SHOULD

- 应控制时间、随机、网络和外部依赖，并保留失败诊断信息。

## Contract

测试证据必须包含范围、环境、命令、结果、失败和未覆盖风险。

## Checklist

- [ ] API、DB、事务、并发、幂等、缓存、安全和回滚按影响选择。

## Examples

- migration 在真实数据库版本上验证前向、兼容与恢复。

## Anti-patterns

- Mock 掉所有边界后声称集成行为已验证。

## Ownership

实现者维护变更测试，测试与评审角色检查风险覆盖。

## Change Policy

删除或放宽测试必须说明替代证据和风险审批。

