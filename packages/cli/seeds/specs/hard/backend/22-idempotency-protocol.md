---
seed_source: pomaster/components/backend-hard-spec/assets/universal/22-idempotency-protocol.md
seed_source_sha256: c97d003622b9075f0c094ec5c5bfa950a977e18b2f4ce8ffc9bc014858e27670
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:idempotency-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [idempotency, callback, replay]
requires: []
---

# 幂等协议

## Scope

规范创建、提交、审批、导入、回调和任务重放语义。

## Non-Scope

不把所有读取或天然无副作用操作强制包装为幂等流程。

## Terms

幂等键标识同一业务意图，而不是单次网络请求。

## MUST

- 可重试写操作必须定义 key 范围、请求指纹、保留期、并发和响应重放。

## MUST NOT

- 不得仅依赖客户端防抖、按钮禁用或短时进程内缓存。

## SHOULD

- 应对相同 key 不同 payload 返回稳定冲突，而非重复执行。

## Contract

幂等记录必须包含主体、操作、key、指纹、状态、结果与过期语义。

## Checklist

- [ ] 并发首请求、失败重试、超时、重放和过期边界已测试。

## Examples

- 回调以供应方事件 ID 和租户范围去重，并原子保存处理结果。

## Anti-patterns

- 用当前时间生成幂等键，使每次重试都成为新操作。

## Ownership

API 或任务 Owner 定义业务意图，存储实现维护原子去重。

## Change Policy

key 格式或保留期变化必须处理旧记录和滚动发布兼容。

