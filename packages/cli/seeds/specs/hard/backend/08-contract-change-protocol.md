---
seed_source: pomaster/components/backend-hard-spec/assets/universal/08-contract-change-protocol.md
seed_source_sha256: 805c146b31c70d08f876631bc19273076eb242d78fcb3b3a3bd33437e28a6953
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:contract-change-protocol
criticality: critical
injection_mode: always
stages: [prepare, implement, check, release]
triggers: []
requires: []
---

# 契约变更协议

## Scope

识别 API、错误码、schema、消息、配置与运行行为的兼容影响。

## Non-Scope

不定义具体业务契约内容。

## Terms

公共契约是已有调用方、持久化数据或运行依赖所观察的稳定行为。

## MUST

- 变更前必须识别消费者、兼容窗口、迁移、回滚和版本策略。

## MUST NOT

- 不得在没有迁移说明时删除、重命名或改变已发布语义。

## SHOULD

- 应优先采用可并行部署、可观测并可撤回的演进方式。

## Contract

变更记录必须包含旧行为、新行为、影响面、兼容判断和验证证据。

## Checklist

- [ ] API、数据、消息、配置和运行消费者均已检查。

## Examples

- 新字段先以兼容方式发布，消费者迁移后再结束旧版本窗口。

## Anti-patterns

- 只修改实现而不更新 OpenAPI、migration、事件 schema 或变更记录。

## Ownership

契约提供方维护兼容方案，消费者确认迁移完成。

## Change Policy

破坏性变更必须经过显式审批、版本升级和可执行回退方案。

