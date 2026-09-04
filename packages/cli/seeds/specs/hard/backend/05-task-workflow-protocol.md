---
seed_source: pomaster/components/backend-hard-spec/assets/universal/05-task-workflow-protocol.md
seed_source_sha256: b0d176f1f2d19cd14739ff4de39d77659036516ab1377b83c261ecc53a2de2dd
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:task-workflow-protocol
criticality: critical
injection_mode: always
stages: [prepare, implement, check, release]
triggers: []
requires: []
---

# 后端任务工作流协议

## Scope

定义 Backend Ready、阶段选择、影响识别和执行路由。

## Non-Scope

不替代 BP 业务事实或项目级实施方案。

## Terms

stage 为 `prepare`、`implement`、`check` 或 `release`。

## MUST

- 必须确认任务事实、stage、写集、契约影响、风险和验证计划。

## MUST NOT

- 不得把 planned、推测或未运行检查描述为 verified。

## SHOULD

- 应在发现跨角色缺口时生成明确问题或 blocker。

## Contract

每次执行必须输出范围、选中规范、变更结果、检查证据和剩余风险。

## Checklist

- [ ] 当前 stage 与任务目标一致。

## Examples

- 简单内部 Mapper 修复只加载当前 stage 的 always 基线。

## Anti-patterns

- 因协议 critical 就无条件加载其完整正文。

## Ownership

执行者维护任务状态，评审者核对证据与声明一致性。

## Change Policy

阶段语义变化必须同步注入器、索引和生命周期消费者。

