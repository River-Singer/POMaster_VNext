---
seed_source: pomaster/components/backend-hard-spec/assets/universal/06-ai-generated-code-protocol.md
seed_source_sha256: a88614806137f33161b741d2a9fbc6ee310fa4f0cbf6acd222de07c14aee3d75
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:ai-generated-code-protocol
criticality: critical
injection_mode: always
stages: [prepare, implement, check]
triggers: []
requires: []
---

# AI 生成代码协议

## Scope

约束 Agent 的前置检查、事实边界、复用搜索、实现与验证声明。

## Non-Scope

不授权 Agent 自行决定业务事实或扩大写集。

## Terms

权威事实包括已确认的 PRD、契约、schema、配置来源和仓库证据。

## MUST

- 写入前必须读取规范、搜索复用点，并按风险运行可复核检查。

## MUST NOT

- 不得发明字段、接口、错误码、迁移、锁、Redis key、topic、secret 或环境阈值。

## SHOULD

- 应显式标记假设、未知项和需要升级确认的决策。

## Contract

生成内容必须绑定输入来源、目标写集和验证结果。

## Checklist

- [ ] 已检查既有实现、镜像路径、未提交改动和任务边界。

## Examples

- 缺少隔离级别事实时记录待确认项，而不是选择一个默认值。

## Anti-patterns

- 用聊天记忆替代仓库、契约、测试或运行证据。

## Ownership

Agent 对变更与声明负责，用户拥有超出既定范围的决策权。

## Change Policy

新增高频误改模式时应追加明确禁止项和回归测试。

