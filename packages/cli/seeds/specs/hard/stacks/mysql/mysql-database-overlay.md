---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/mysql/mysql-database-overlay.md
seed_source_sha256: a47d8c61959c120707bb907275e74ce13b4b36b03fa493bc09cc7d47fcc949d7
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:mysql
capability: relational-database
requires: []
conflicts: []
coexistence: explicit-data-source
stages: [prepare, implement, check, release]
---

# MySQL 数据库 Overlay

## Scope

本 Overlay 具体化 MySQL schema、InnoDB、索引、事务与迁移验证边界。

## Rules

- 字符集、排序规则、类型、约束和索引必须由 migration 明确表达。
- 隔离级别、锁行为和执行计划必须以实际版本证据为准。
- 与其他数据库并存时必须声明数据源与数据所有权。

## Checklist

- [ ] migration、rollback 或 roll-forward 路径可验证。
- [ ] 生产兼容性不依赖本地默认值。

