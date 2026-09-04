---
seed_source: pomaster/components/backend-hard-spec/assets/universal/19-query-index-sql-protocol.md
seed_source_sha256: 60a660730a82a4f911bc6c18d5f6808a320f722df27d397a4e4b13835111610d
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:query-index-sql-protocol
criticality: standard
injection_mode: triggered
stages: [implement, check]
triggers: [sql, query, index, pagination]
requires: []
---

# 查询、索引与 SQL 协议

## Scope

规范参数化 SQL、查询形态、分页、N+1、索引和执行计划证据。

## Non-Scope

不规定具体数据库的固定索引或性能阈值。

## Terms

查询形态包括过滤、连接、排序、分页、聚合与预期数据规模。

## MUST

- SQL 必须参数化，并以真实查询形态验证结果、边界和执行计划。

## MUST NOT

- 不得用字符串拼接构造不可信 SQL 或无界读取大结果集。

## SHOULD

- 应让索引服务于已知查询，并记录写放大与存储取舍。

## Contract

关键查询必须记录输入、排序稳定性、分页语义、索引和验证数据规模。

## Checklist

- [ ] 空结果、重复排序键、深分页、N+1 与慢查询已检查。

## Examples

- 游标分页包含稳定唯一排序键并验证并发写入下的行为。

## Anti-patterns

- 仅凭列名添加索引，不检查选择性和实际执行计划。

## Ownership

查询维护者提供计划证据，数据 Owner 评审容量与一致性影响。

## Change Policy

索引删除或查询重写必须先验证所有已知消费者和回滚路径。

