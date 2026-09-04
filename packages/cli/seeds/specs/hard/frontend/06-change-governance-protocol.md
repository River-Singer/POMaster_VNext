---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/06-change-governance-protocol.md
seed_source_sha256: 2f19b46e451153cab35e9fb511d9da0f072f86424e7d3f7a6b307cd17a9d1b32
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 06 变更治理协议

## Scope

P0。管理公共组件、公共 API、样式、状态、schema 和平台能力的影响评估、兼容、废弃和迁移。

## Non-Scope

不定义单个组件的业务功能，不替代版本发布和代码评审。

## Terms

- Public Contract：被多个调用方依赖的稳定接口或默认行为。
- Breaking Change：要求调用方修改才能继续工作的变更。
- Deprecated：仍可用但已声明迁移目标和删除期限的能力。
- Spec Status：Draft、Candidate、Baseline、Controlled Change 或 Release Review。
- Baseline：可作为开发依据的冻结版本。
- Controlled Change：Baseline 后带影响、Owner、迁移和验证证据的受控修改。

## MUST

- 公共变更前列出直接/间接调用方和受影响场景。
- 保持兼容或提供迁移方案、版本范围和回滚。
- 更新 contract、示例、测试、文档和通知。
- 删除前必须先 deprecated 并确认无使用方。
- 局部问题与公共问题必须按根因选择修改层级。
- 项目级 spec、需求级 spec、公共组件 spec 和接口 spec 必须记录状态、版本、Owner、更新时间和生效范围。
- Baseline 后修改公共组件 API、接口字段、权限码、错误码、Design Token、目录边界、状态模型、金额精度或验收门禁，必须走 Controlled Change。
- 每次开发后的 Spec Update Review 必须把新规则归类为：需求级记录、长期 spec、通用规范候选或无需更新。

## MUST NOT

- MUST NOT 随意改变公共默认行为。
- MUST NOT 为单页临时需求修改公共 API。
- MUST NOT 只修一个页面来掩盖公共问题。
- MUST NOT 无迁移地删除 props、事件、字段或状态。
- MUST NOT 把 Draft 或示例内容当作 Baseline 执行。
- MUST NOT 把 Draft 或示例内容当作 Baseline 执行。

## SHOULD

- SHOULD 使用影响模板、自动调用图和 deprecated 提示。
- SHOULD 将公共变更拆成兼容引入、迁移、删除阶段。

## Contract

```text
Change, SpecStatus, Version, Owner, AffectedConsumers[],
Compatibility, Migration, DeprecationDate?, RemovalDate?,
Tests, Rollback, SpecUpdateDecision
```

## Checklist

- [ ] 根因层级明确。
- [ ] 调用方清单完整。
- [ ] 兼容、迁移和回滚可执行。
- [ ] 测试、示例和通知已更新。
- [ ] Spec 状态、版本、Owner 和生效范围已记录。
- [ ] 开发后规则回填已归类并执行。

## Examples

### 内容示例，可删除

新增 props 保留旧默认值，发布迁移说明，调用方完成迁移后再删除旧 props。

## Anti-patterns

为一个页面修改公共组件默认 padding，导致所有页面布局变化且没有视觉回归。

## Ownership

公共能力 Owner 对兼容负责，调用方 Owner 对迁移负责，架构 Owner 裁决跨模块影响。

## Change Policy

Breaking Change 必须版本化；紧急修复仍需事后补齐影响、通知和迁移记录。
