---
seed_source: pomaster/components/backend-hard-spec/assets/universal/21-concurrency-locking-protocol.md
seed_source_sha256: 6141612e1135cc67ccd9d47553ea5fa7b9c00e05b6e50706f8e117c80d3b8d95
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:concurrency-locking-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [concurrency, locking]
requires: []
---

# 并发与锁协议

## Scope

规范乐观锁、悲观锁、唯一约束、分布式锁和冲突响应。

## Non-Scope

不替代事务边界或业务状态规则。

## Terms

竞争窗口是多个执行者可基于同一旧状态作出冲突决策的时间范围。

## MUST

- 并发写必须明确竞争对象、原子条件、冲突结果、重试与最终一致性。

## MUST NOT

- 不得把进程内锁用于跨实例互斥或忽略锁超时与所有权。

## SHOULD

- 应优先使用数据库约束或带版本条件的原子更新保护不变量。

## Contract

锁设计必须记录粒度、顺序、超时、续租、释放、失败和可观测性。

## Checklist

- [ ] 重复请求、乱序、死锁、超时、崩溃和多实例场景已测试。

## Examples

- 以版本号条件更新并将零行更新映射为稳定冲突错误。

## Anti-patterns

- 先查询再无条件更新，并假设请求不会并发。

## Ownership

业务用例 Owner 定义冲突语义，持久化维护者验证原子性。

## Change Policy

锁策略变化必须重新评估事务、性能、恢复和兼容行为。

