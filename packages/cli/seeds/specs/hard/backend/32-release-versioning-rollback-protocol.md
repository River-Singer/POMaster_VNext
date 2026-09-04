---
seed_source: pomaster/components/backend-hard-spec/assets/universal/32-release-versioning-rollback-protocol.md
seed_source_sha256: 26a6a23928fc24338f69fb34199ecdea5f654e21534a76ac53a7c0b78030b3c8
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:release-versioning-rollback-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, check, release]
triggers: [release, rollback, versioning]
requires: []
---

# 发布、版本与回滚协议

## Scope

规范版本、灰度、开关、发布记录、兼容窗口、回滚和数据库演进。

## Non-Scope

不替代具体平台操作手册或证据验收协议。

## Terms

可回退包括代码回滚、配置恢复、流量撤回和数据 roll-forward 的组合能力。

## MUST

- 发布前必须确认版本、依赖顺序、兼容、观测、停止条件和恢复路径。

## MUST NOT

- 不得在无法恢复数据或无监控信号时进行不可逆全量发布。

## SHOULD

- 应采用小批量灰度、可撤回开关和前后版本并行兼容。

## Contract

发布记录必须包含变更范围、产物 hash、步骤、门禁、指标、Owner 与结果。

## Checklist

- [ ] 应用、数据库、配置、消息、缓存与消费者版本已对齐。

## Examples

- 先发布兼容读写版本，完成数据迁移后再清理旧契约。

## Anti-patterns

- 把数据库回滚等同于逆向执行破坏性 migration。

## Ownership

发布责任人执行门禁，Backend 提供兼容与恢复证据。

## Change Policy

发布流程和阻断门禁变化必须通过演练与审计后生效。

