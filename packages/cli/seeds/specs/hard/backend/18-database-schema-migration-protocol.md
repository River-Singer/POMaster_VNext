---
seed_source: pomaster/components/backend-hard-spec/assets/universal/18-database-schema-migration-protocol.md
seed_source_sha256: e7d0b660673dc1978653c39c9efcc7ad7d9b2809c4a88040a6fcf74839bc82c0
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:database-schema-migration-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check, release]
triggers: [database-schema, migration, data-repair]
requires: []
---

# 数据库 Schema 与迁移协议

## Scope

规范 table、column、type、约束、索引、migration、回滚和数据修复。

## Non-Scope

不规定具体数据库产品的语法或项目表名。

## Terms

迁移是受版本控制、顺序稳定且可验证的数据结构或数据变更。

## MUST

- 每次 schema 变化必须有前向迁移、兼容分析、验证和回退或 roll-forward 路径。

## MUST NOT

- 不得依赖 ORM 自动改表、手工生产操作或无记录脚本作为正式迁移。

## SHOULD

- 应采用 expand/migrate/contract，避免应用与数据库无法并行部署。

## Contract

迁移记录必须包含对象、影响数据、锁风险、顺序、验证、修复和恢复。

## Checklist

- [ ] 约束、索引、默认值、历史数据、备份与发布窗口已检查。

## Examples

- 先新增可空字段并双写，完成回填与读切换后再收紧约束。

## Anti-patterns

- 在同一步中删除旧字段并发布仍依赖它的应用版本。

## Ownership

数据 Owner 审批语义，Backend 维护 migration 与验证证据。

## Change Policy

已执行 migration 不得原地改写；修正必须追加新 migration。

