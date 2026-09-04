---
seed_source: pomaster/components/backend-hard-spec/assets/universal/01-architecture-governance-protocol.md
seed_source_sha256: 726502f4e5a5dcf2e8076fafa943b33de4b7ab9bd0fc2d8551479b43385e7636
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:architecture-governance-protocol
criticality: critical
injection_mode: reference
stages: [prepare, check]
triggers: [architecture, technology-baseline, deployment-topology]
requires: []
---

# 架构治理协议

## Scope

规范系统边界、架构层级、技术决策、ADR 与演进门禁。

## Non-Scope

不规定具体项目的模块名、部署数量或技术版本。

## Terms

架构决策指影响边界、数据所有权、部署单元或公共契约的长期选择。

## MUST

- 架构选择必须记录候选、取舍、风险、ADR 坐标和复审条件。

## MUST NOT

- 不得以局部代码便利替代边界、数据所有权或部署约束分析。

## SHOULD

- 应优先选择能由现有团队、工具和运行证据持续验证的方案。

## Contract

架构记录至少输出稳定决策 ID、适用范围、被放弃方案、依赖与验证方式。

## Checklist

- [ ] 边界、依赖方向、部署单元和数据所有权已明确。

## Examples

- 将单体与服务拆分作为候选比较，并记录选择理由和复审触发条件。

## Anti-patterns

- 只画理想架构图，不绑定构建产物、部署单元或实际依赖。

## Ownership

后端技术负责人维护决策，模块维护者提供实现与运行证据。

## Change Policy

改变已采用架构必须新增或替代 ADR，不得静默改写历史结论。

