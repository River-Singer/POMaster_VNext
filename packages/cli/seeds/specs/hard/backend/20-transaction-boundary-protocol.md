---
seed_source: pomaster/components/backend-hard-spec/assets/universal/20-transaction-boundary-protocol.md
seed_source_sha256: 4c4634b71f1e07e9cae074f9790fa50b3425f0af71300ab2ac12e644b521eff4
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:transaction-boundary-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [transaction]
requires: []
---

# 事务边界协议

## Scope

规范事务所有者、边界、隔离、传播、重试、补偿与外部调用。

## Non-Scope

不替代业务不变量、锁选择或数据库产品细节。

## Terms

事务边界是需要原子提交或一致失败的一组本地持久化操作。

## MUST

- 写流程必须明确事务入口、隔离、传播、失败、重试和提交后动作。

## MUST NOT

- 不得在长事务中执行无界网络调用、用户等待或不可控批处理。

## SHOULD

- 应缩短锁持有时间，并将外部副作用设计为可重试或可补偿。

## Contract

事务设计必须列出读写集合、锁、唯一约束、外部调用和一致性证据。

## Checklist

- [ ] 异常、超时、重试、部分失败和提交后发布均已测试。

## Examples

- 本地事务写入 outbox，提交后由可靠发布器发送外部消息。

## Anti-patterns

- 通过扩大事务范围掩盖跨系统一致性设计缺失。

## Ownership

应用服务拥有事务编排，Repository 提供明确持久化语义。

## Change Policy

边界或隔离变化必须复核并发、锁、性能和失败恢复。

