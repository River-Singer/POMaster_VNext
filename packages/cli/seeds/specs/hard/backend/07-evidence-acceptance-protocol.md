---
seed_source: pomaster/components/backend-hard-spec/assets/universal/07-evidence-acceptance-protocol.md
seed_source_sha256: fb86312eaadaec81d21e20abfb979e0127138002731ddc4fb1ead9ec90cd10bb
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:evidence-acceptance-protocol
criticality: critical
injection_mode: always
stages: [prepare, check, release]
triggers: []
requires: []
---

# 证据与验收协议

## Scope

定义计划证据、实现证据、检查证据、发布证据和例外门禁。

## Non-Scope

不替代各领域协议规定的具体测试方法。

## Terms

证据是可由他人复核的代码坐标、hash、测试、报告或运行结果。

## MUST

- 验收结论必须绑定当前任务、review range、版本和可复核证据。

## MUST NOT

- 不得以口头完成声明、过期报告或无来源截图通过门禁。

## SHOULD

- 应记录失败检查、未覆盖风险和经批准例外的到期条件。

## Contract

验收记录至少包含检查项、命令或来源、结果、时间范围与责任方。

## Checklist

- [ ] 计划、实现、测试、运行和发布证据处于同一变更范围。

## Examples

- 用 migration 测试与 schema hash 证明数据库变更已验证。

## Anti-patterns

- 只列“测试通过”，不提供测试范围与结果来源。

## Ownership

实现者提供证据，评审与发布责任人决定门禁是否满足。

## Change Policy

降低证据要求必须作为受控例外记录，不得静默删除门禁。

