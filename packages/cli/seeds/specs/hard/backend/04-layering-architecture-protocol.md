---
seed_source: pomaster/components/backend-hard-spec/assets/universal/04-layering-architecture-protocol.md
seed_source_sha256: 4a2ab2aa695a7b78136a2fd96076a869c367bb008a417be508756c632ad4ed6e
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:layering-architecture-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [layering, module-boundary, domain-design]
requires: []
---

# 分层架构协议

## Scope

规范 Controller、Application/Service、Domain、Repository 与 Infrastructure 的职责。

## Non-Scope

不要求简单系统机械创建所有层或使用特定框架注解。

## Terms

依赖方向指高层策略不依赖低层技术细节的约束。

## MUST

- 业务不变量、事务编排和外部适配必须位于可解释且可测试的边界。

## MUST NOT

- 不得在 Controller、ORM Entity 或基础设施适配器中散落权威业务规则。

## SHOULD

- 应让层间数据转换显式并避免同一校验在多层重复实现。

## Contract

每层必须声明输入、输出、失败语义、依赖和测试责任。

## Checklist

- [ ] 调用链、转换点、事务所有者和异常映射已明确。

## Examples

- Controller 校验传输格式，应用服务编排用例，领域对象维护不变量。

## Anti-patterns

- Service 仅转发，而 Controller 同时处理事务、SQL 和业务判断。

## Ownership

架构所有者维护分层约束，各层维护者提供边界测试。

## Change Policy

跨层迁移必须记录兼容影响并分阶段消除旧依赖。

