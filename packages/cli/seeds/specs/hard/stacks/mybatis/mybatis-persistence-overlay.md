---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/mybatis/mybatis-persistence-overlay.md
seed_source_sha256: 968bfa7df9b4c675161427809fd3d4e9e5b62b2b53a880420f36af00d2c60e57
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:mybatis
capability: persistence-framework
requires: [backend-stack:java]
conflicts: []
coexistence: explicit-scope
stages: [prepare, implement, check]
---

# MyBatis 持久化 Overlay

## Scope

本 Overlay 具体化 Mapper、SQL 映射、结果映射和动态 SQL 边界。

## Rules

- SQL 必须参数化并绑定可复核的 Mapper 与测试坐标。
- 动态条件、分页、批处理和结果映射必须覆盖空值与类型边界。
- 与 JPA 并存时必须声明模块或数据源范围。

## Checklist

- [ ] Java 依赖已显式选择。
- [ ] SQL、索引、事务和迁移证据相互一致。

