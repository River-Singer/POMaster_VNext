---
seed_source: pomaster/components/backend-hard-spec/assets/universal/23-cache-redis-consistency-protocol.md
seed_source_sha256: 073da5821658adfc0580798873fde95c49dc9d993a63949b3b1543a9c0e18a11
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:cache-redis-consistency-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check, release]
triggers: [redis, cache]
requires: []
---

# 缓存与 Redis 一致性协议

## Scope

规范 key、value schema、TTL、序列化、失效、一致性、防击穿与降级。

## Non-Scope

不默认指定 Redis，也不规定项目 key 与 TTL 数值。

## Terms

权威数据源是在冲突时决定业务事实的持久来源。

## MUST

- 缓存必须定义 key 维度、权限隔离、TTL、更新失效、故障和恢复行为。

## MUST NOT

- 不得让不同租户、权限、过滤或版本的数据共享含混 key。

## SHOULD

- 应设计缓存穿透、击穿、雪崩和热 key 的限制与观测。

## Contract

缓存契约必须包含权威源、schema 版本、读写顺序、陈旧容忍和降级。

## Checklist

- [ ] DB 提交、缓存失败、并发更新、淘汰和重建已测试。

## Examples

- 写库提交后删除版本化缓存，读路径在 miss 时受控回源。

## Anti-patterns

- 先写缓存再写数据库且没有补偿或一致性说明。

## Ownership

数据 Owner 定义一致性，缓存维护者提供失效与恢复证据。

## Change Policy

value schema 或 key 变化必须版本化并规划旧数据清理。

