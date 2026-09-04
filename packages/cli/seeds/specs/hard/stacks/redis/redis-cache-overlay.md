---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/redis/redis-cache-overlay.md
seed_source_sha256: 6ae4d18ce2658a77d34bb3cf2a2c38745b646a730eb3c270c2a4c2a0a24497c7
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:redis
capability: cache-store
requires: []
conflicts: []
coexistence: explicit-purpose
stages: [prepare, implement, check, release]
---

# Redis 缓存 Overlay

## Scope

本 Overlay 具体化 Redis key、value schema、TTL、原子操作与故障降级边界。

## Rules

- key namespace、租户范围、序列化版本和 TTL 必须显式定义。
- Redis 不得成为未声明的数据权威来源。
- 分布式锁、缓存失效和降级必须有失败语义与测试证据。

## Checklist

- [ ] 一致性、容量、淘汰和恢复路径已记录。
- [ ] 敏感数据与日志处理满足安全和隐私协议。

