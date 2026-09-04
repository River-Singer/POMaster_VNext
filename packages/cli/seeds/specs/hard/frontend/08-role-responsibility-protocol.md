---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/08-role-responsibility-protocol.md
seed_source_sha256: 732ac305cd16207e4a7bd4c95a6774d1aca33fb4e45cf29991ac0f6475605d6f
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 08 角色责任协议

## Scope

P0/P1 治理协议。定义需求、设计、前端、后端、测试、平台、安全、协议和 AI 协作中的责任边界。

## Non-Scope

不规定组织架构、职级、绩效或人员姓名，不替代项目管理系统。

## Terms

- Responsible：执行者。
- Accountable：最终责任者。
- Consulted：必须征询者。
- Informed：必须通知者。
- Approver：有权放行例外者。

## MUST

- 每个协议、公共组件、接口、业务规则和发布都有 Accountable Owner。
- 跨团队变更开发前确定 Reviewer 和通知范围。
- 无 Owner 的关键决策必须阻塞并升级。
- AI 输出必须由人类 Owner Review，AI 不得成为 Approver。

## MUST NOT

- MUST NOT 用“团队共同负责”隐藏无人负责。
- MUST NOT 让前端单方面决定后端契约、公式或数据权限。
- MUST NOT 让设计稿覆盖安全、可访问性或公共 API。
- MUST NOT 让 AI 代替业务、合规或上线签字。

## SHOULD

- SHOULD 为跨层能力维护轻量 RACI。
- SHOULD 为 Owner 缺席定义代理和升级路径。

## Contract

```text
ArtifactOrDecision, Responsible, Accountable,
Consulted[], Informed[], RequiredReviewers[], EscalationPath
```

## Checklist

- [ ] 各阶段 Owner 明确。
- [ ] 跨层 Reviewer 已确定。
- [ ] 例外有批准者。
- [ ] AI 输出有人类责任人。

## Examples

### 内容示例，可删除

业务 Owner 定义金额口径，后端负责权威计算，前端负责无损展示，QA 验证边界。

## Anti-patterns

接口含义未确认时由前端和 AI 自行解释，最终无人能判断哪个结果正确。

## Ownership

项目负责人维护角色模型，各领域 Owner 维护其 RACI，治理 Owner 处理无人归属。

## Change Policy

角色或批准边界变化必须通知协作者；临时代理必须有范围和期限。
