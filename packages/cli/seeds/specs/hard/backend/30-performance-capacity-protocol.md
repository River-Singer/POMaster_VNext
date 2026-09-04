---
seed_source: pomaster/components/backend-hard-spec/assets/universal/30-performance-capacity-protocol.md
seed_source_sha256: b575dd07e4bb6def646acb55c3d62d086a9fd12035b2ab359ec353bf443773e5
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:performance-capacity-protocol
criticality: standard
injection_mode: triggered
stages: [prepare, check, release]
triggers: [performance, capacity]
requires: []
---

# 性能与容量协议

## Scope

规范延迟、吞吐、连接池、线程、批处理、背压、容量和压测证据。

## Non-Scope

不在 universal 中规定具体数值阈值或硬件规模。

## Terms

性能预算是由业务目标与运行环境确认的可测量约束。

## MUST

- 性能结论必须绑定负载模型、数据规模、环境、版本和统计口径。

## MUST NOT

- 不得用单次本地耗时、平均值或无代表性数据声称满足容量。

## SHOULD

- 应同时观察尾延迟、错误率、资源、排队、背压和依赖瓶颈。

## Contract

容量计划必须包含场景、预算、峰值、瓶颈、扩缩容和降级策略。

## Checklist

- [ ] 连接池、线程池、队列、批量、缓存与数据库联动已验证。

## Examples

- 在目标数据量和并发模型下报告 p95/p99、错误率与资源曲线。

## Anti-patterns

- 盲目增大池大小导致下游过载和更长排队。

## Ownership

业务 Owner 提供负载目标，Backend 与运行角色验证容量。

## Change Policy

预算或容量模型变化必须记录来源并重新运行代表性测试。

