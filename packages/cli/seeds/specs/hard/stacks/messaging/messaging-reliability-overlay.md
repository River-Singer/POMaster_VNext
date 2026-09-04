---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/messaging/messaging-reliability-overlay.md
seed_source_sha256: ed7f82208521675510ab4a42b229f9be269a52514cf5188c9bf83323d7590572
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:messaging
capability: asynchronous-messaging
requires: []
conflicts: []
coexistence: explicit-channel
stages: [prepare, implement, check, release]
---

# 消息可靠性 Overlay

## Scope

本 Overlay 具体化消息契约、投递、消费、重试、死信与可观测边界。

## Rules

- topic、事件 schema、版本、顺序和重复投递语义必须明确。
- 消费者必须按契约处理幂等、毒消息、重试和死信。
- 不得把 broker 可用性等同于业务处理成功。

## Checklist

- [ ] 生产、消费、补偿和对账证据可关联。
- [ ] 敏感数据、保留期和权限符合安全与隐私协议。

