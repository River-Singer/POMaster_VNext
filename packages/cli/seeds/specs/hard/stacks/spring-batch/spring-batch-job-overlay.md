---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/spring-batch/spring-batch-job-overlay.md
seed_source_sha256: 58f710fcfeeaeafcaa19fd4ef27bce22c3c34d8d1ef7992f95f65a3e1bd9cd78
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:spring-batch
capability: batch-processing
requires: [backend-stack:java, backend-stack:spring-boot]
conflicts: []
coexistence: explicit-job
stages: [prepare, implement, check, release]
---

# Spring Batch 作业 Overlay

## Scope

本 Overlay 具体化 Job、Step、重启、分片、元数据和批处理事务边界。

## Rules

- 作业参数、实例身份、重启语义和幂等边界必须稳定。
- 分片、重试、跳过和失败恢复必须有数据一致性证据。
- 调度系统与 Spring Batch 的职责必须分开记录。

## Checklist

- [ ] Java 与 Spring Boot 依赖已显式选择。
- [ ] 重跑、取消、并发和结果保留策略已验证。

