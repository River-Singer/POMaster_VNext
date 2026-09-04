---
seed_source: pomaster/components/backend-hard-spec/assets/universal/14-business-rules-state-protocol.md
seed_source_sha256: fb255dd2331ac35e73a1ad222e4de4ec2f5fb3a09e675de0e1919d80022ac291
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:business-rules-state-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [business-rules, state-transition]
requires: []
---

# 业务规则与状态协议

## Scope

规范服务端权威不变量、状态机、计算、校验和失败语义。

## Non-Scope

不发明 BP 未确认的业务规则、阈值或状态。

## Terms

不变量是在任何成功事务后都必须成立的业务条件。

## MUST

- 状态转移必须定义前置条件、权限、效果、失败码和并发行为。

## MUST NOT

- 不得只依赖前端禁用按钮或流程顺序维护业务不变量。

## SHOULD

- 应集中表达同一权威规则并覆盖边界与非法转移测试。

## Contract

规则设计必须绑定 BP 来源、输入、状态、输出、失败和证据。

## Checklist

- [ ] 不变量、状态、权限、事务与并发边界已对齐。

## Examples

- 审批操作在服务端校验当前状态与操作权限后原子更新。

## Anti-patterns

- 在多个 Controller 和 SQL 中复制略有差异的状态判断。

## Ownership

BP 拥有业务语义，Backend 拥有服务端一致实现。

## Change Policy

业务语义变化必须来自正式 delta，并同步状态迁移与兼容计划。

