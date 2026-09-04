---
seed_source: pomaster/components/backend-hard-spec/assets/universal/03-directory-boundary-protocol.md
seed_source_sha256: 95a917cfe3c929b5a0a40de5f6215b25ef4a358a4e7f1c7cb2daa08defcf6bcc
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:directory-boundary-protocol
criticality: critical
injection_mode: always
stages: [implement, check]
triggers: []
requires: []
---

# 目录边界协议

## Scope

约束实现阶段的模块目录、公开入口、依赖方向和越界识别。

## Non-Scope

不规定某种框架的固定包名。

## Terms

越界指绕过公开入口依赖其他模块内部实现。

## MUST

- 修改前必须搜索现有实现，并保持依赖只指向声明的公开入口。

## MUST NOT

- 不得把跨域逻辑塞入共享工具或直接引用其他模块内部文件。

## SHOULD

- 应以最小写集完成任务，并复用已有边界内能力。

## Contract

新增依赖必须能说明提供方、消费方、稳定入口与验证方式。

## Checklist

- [ ] 写集、入口、依赖方向和受影响消费者已复核。

## Examples

- 通过领域端口调用基础设施适配器，而不是从 Controller 直接访问实现类。

## Anti-patterns

- 为绕过循环依赖建立含混的 `common` 目录。

## Ownership

代码作者说明边界影响，模块所有者审批公开入口变化。

## Change Policy

公开入口变化按契约变更处理，迁移完成前保留兼容路径。

