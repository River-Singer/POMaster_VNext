---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/postgresql/postgresql-database-overlay.md
seed_source_sha256: dbe9f21a72c1124519375176efb2b2b4138b21c45becebfc66eaa2ab41def16e
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:postgresql
capability: relational-database
requires: []
conflicts: []
coexistence: explicit-data-source
stages: [prepare, implement, check, release]
---

# PostgreSQL 数据库 Overlay

## Scope

本 Overlay 具体化 PostgreSQL schema、类型、索引、事务与迁移验证边界。

## Rules

- schema、extension、类型、约束和索引必须由受控 migration 表达。
- 锁、隔离、执行计划和 vacuum 相关判断必须绑定实际版本证据。
- 与其他数据库并存时必须声明数据源与数据所有权。

## Checklist

- [ ] migration 与兼容窗口可复核。
- [ ] SQL 未依赖未声明的 search path 或环境默认值。

