---
seed_source: pomaster/components/backend-hard-spec/assets/universal/02-project-structure-governance-protocol.md
seed_source_sha256: add6e21ffa5dd45940dda725e8d4e234c9d2a49775139c895cc7ad5f7caf7bf0
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:project-structure-governance-protocol
criticality: standard
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [project-structure, module-layout]
requires: []
---

# 项目结构治理协议

## Scope

规范消费项目的后端目录分区、模块入口和结构检查。

## Non-Scope

不强制所有语言和框架采用同一目录树。

## Terms

公开入口是其他模块被允许依赖的稳定包、接口或构建产物。

## MUST

- 新目录和模块必须有单一职责、公开入口和明确依赖方向。

## MUST NOT

- 不得创建无法解释职责的顶层目录或把业务代码放入通用工具区。

## SHOULD

- 应沿用仓库已验证的结构模式，并在新增结构前搜索现有实现。

## Contract

结构变更必须给出目标路径、所有者、入口、消费者和迁移计划。

## Checklist

- [ ] 已搜索同类模块并检查构建、测试和部署发现路径。

## Examples

- 为独立领域建立模块，并通过公开接口而不是内部包提供能力。

## Anti-patterns

- 复制相似模块后仅改名，造成规则和修复长期漂移。

## Ownership

模块所有者维护结构，评审者检查跨模块依赖和重复实现。

## Change Policy

目录迁移必须同步引用、构建、测试、文档和兼容入口。

