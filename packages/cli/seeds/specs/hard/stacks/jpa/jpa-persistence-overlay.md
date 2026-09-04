---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/jpa/jpa-persistence-overlay.md
seed_source_sha256: e43479fd8659b89863cf47dee9fee3c52727cc2978ffd1b854ea17c777b1e9e6
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:jpa
capability: persistence-framework
requires: [backend-stack:java]
conflicts: []
coexistence: explicit-scope
stages: [prepare, implement, check]
---

# JPA 持久化 Overlay

## Scope

本 Overlay 具体化实体生命周期、关联加载、查询与持久化上下文边界。

## Rules

- Entity 不得直接替代 API DTO 或领域契约。
- 必须验证关联加载、N+1、脏检查、批处理和事务边界。
- 与 MyBatis 并存时必须声明模块或数据源范围。

## Checklist

- [ ] Java 依赖已显式选择。
- [ ] schema、迁移和实体映射不存在未经解释的漂移。

