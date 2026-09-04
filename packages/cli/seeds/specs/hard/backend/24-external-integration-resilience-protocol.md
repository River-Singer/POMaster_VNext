---
seed_source: pomaster/components/backend-hard-spec/assets/universal/24-external-integration-resilience-protocol.md
seed_source_sha256: e6b0626c9169e9126319bd08ee5d5bdbe38421cfa175509524145aee30ff539a
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:external-integration-resilience-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check, release]
triggers: [external-integration, resilience]
requires: []
---

# 外部集成与韧性协议

## Scope

规范外部契约、超时、重试、熔断、补偿、对账和供应方故障。

## Non-Scope

不发明供应方 SLA、字段或错误语义。

## Terms

补偿用于处理无法由单一原子事务覆盖的已发生副作用。

## MUST

- 每个外部调用必须定义超时、重试条件、幂等、失败映射和恢复路径。

## MUST NOT

- 不得无限重试、重试非幂等操作或在事务内执行无界调用。

## SHOULD

- 应采用隔离、熔断、限流、降级与对账控制故障扩散。

## Contract

集成契约必须记录版本、认证、请求响应、错误、限额、追踪与所有者。

## Checklist

- [ ] 超时、限流、部分失败、重复响应和供应方中断已测试。

## Examples

- 写入本地意图后异步调用供应方，并通过状态机与对账收敛。

## Anti-patterns

- 捕获外部异常后记录日志并返回业务成功。

## Ownership

集成 Owner 维护供应方契约，业务 Owner 决定降级与补偿语义。

## Change Policy

供应方版本或认证变化必须经过兼容窗口和演练。

