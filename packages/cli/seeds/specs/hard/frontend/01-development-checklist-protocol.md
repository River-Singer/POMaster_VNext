---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/01-development-checklist-protocol.md
seed_source_sha256: fa8914b29dbf7af25c8128aa1b8936fd658e37854e0a4f457175e2e3c82c3a03
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 01 开发检查项协议

## Scope

P0。把规范转成每次开发前、开发中、开发后的强制动作，适用于功能、修复、重构、配置和文档驱动变更。

## Non-Scope

不定义技术栈命令，不替代测试协议、验收门禁和发布审批。

## Terms

- Change Classification：局部、同类模式、公共能力、契约、平台或工程变更。
- Impact Set：必须修改、需要同步、明确禁止修改的范围。
- Evidence：搜索、测试、截图、构建、契约差异等可复核证据。
- Spec Update Review：开发完成后判断是否需要补充 spec 的强制复核。

## MUST

- 开发前完成变更分类、协议选择、复用搜索和影响范围。
- 写代码前列出 Must Change、Must Sync、Must Not Change。
- 缺少正式字段、状态、权限、接口或业务规则时先补契约或阻塞确认。
- 开发中发现范围扩大时重新分类并更新计划。
- 开发后提供检查结果、影响说明和残余风险。
- 开发后、任务关闭或收口（closeout）流程前必须完成 Spec Update Review。
- 发现新规则、重复坑点、接口/组件/目录/测试约定时必须更新对应 spec；无更新时必须记录原因。

## MUST NOT

- MUST NOT 先实现后补范围。
- MUST NOT 用“应该没问题”代替证据。
- MUST NOT 混入无关清理、升级或重构。
- MUST NOT 跳过 Spec Update Review 后直接归档、收口或发布。
- MUST NOT 将一次性实现细节写入长期 spec。

## SHOULD

- SHOULD 将检查项集成任务模板、PR 模板和自动化门禁。
- SHOULD 按风险扩大检查，而非机械执行无关项目。

## Contract

```text
Goal, Classification, ProtocolsLoaded, SpecStatus, ReuseSearch,
MustChange, MustSync, MustNotChange, ContractsAffected,
ValidationRequired, Evidence, SpecUpdateDecision, ResidualRisk
```

## Checklist

- [ ] 已分类并加载协议。
- [ ] 已搜索已有能力。
- [ ] 已声明影响与禁止范围。
- [ ] 已确认契约、安全和数据边界。
- [ ] 已提供验证证据。
- [ ] 已完成 Spec Update Review，并记录更新或不更新的原因。

## Examples

### 内容示例，可删除

修复单页列宽时，先证明根因属于页面 schema，只修改该 schema 和页面测试，并明确禁止修改全局样式。

## Anti-patterns

直接修改公共组件，既不搜索调用方，也不验证同类页面，把局部问题扩散成全局回归。

## Ownership

实现者负责填写，Reviewer 核验范围与证据，协议 Owner 裁决歧义。

## Change Policy

新增检查项必须定义触发、验证和失败动作；降级 P0 检查项必须批准并记录期限。
