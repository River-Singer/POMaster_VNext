---
seed_source: pomaster/components/backend-hard-spec/assets/universal/25-async-job-scheduler-protocol.md
seed_source_sha256: 36af3b4466b4e617a9c552a404d98ab74604752b7410e15756d7f132394fb980
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:async-job-scheduler-protocol
criticality: standard
injection_mode: triggered
stages: [prepare, implement, check, release]
triggers: [async-job, scheduler, import-export]
requires: []
---

# 异步任务与调度协议

## Scope

规范 Job 生命周期、进度、取消、重试、调度锁、结果与保留。

## Non-Scope

不绑定具体调度器、队列或批处理框架。

## Terms

Job instance 是由稳定业务参数标识的一次可追踪执行意图。

## MUST

- 任务必须定义身份、状态、幂等、重试、取消、超时和结果访问。

## MUST NOT

- 不得用固定 sleep、无主线程或无状态记录的后台执行承载关键任务。

## SHOULD

- 应支持进度、心跳、并发限制、失败恢复和过期清理。

## Contract

任务契约必须包含触发源、参数、状态机、输出、错误、保留和权限。

## Checklist

- [ ] 重复触发、节点崩溃、接管、取消、重跑与过期已测试。

## Examples

- 导出任务返回 job ID，调用方查询状态并从受权地址下载结果。

## Anti-patterns

- 调度表达式重叠时并发执行同一不可重入任务。

## Ownership

任务 Owner 定义生命周期，运行平台提供调度与执行证据。

## Change Policy

参数或状态变化必须兼容历史任务和进行中的执行。

