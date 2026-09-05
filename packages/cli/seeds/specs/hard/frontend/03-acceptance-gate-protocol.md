---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/03-acceptance-gate-protocol.md
seed_source_sha256: 646dcbd7035d43d84ca592218a356c08a4baca36619109797322d90ba3d99b73
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 03 验收门禁协议

## Scope

P0。定义变更何时可以进入 Review、提测和上线，以及各阶段的必备证据。

## Non-Scope

不指定测试框架，不替代业务验收、发布平台操作或人工批准责任。

## Terms

- Ready for Review：实现和自检完成。
- Ready for Test：评审阻塞关闭，构建可测试。
- Ready for Release：质量、安全、监控和回滚可用。
- Ready for Development：相关项目级和需求级 spec 已达到 Baseline 或批准的 Candidate。
- Blocker：不满足即禁止进入下一阶段的问题。

## MUST

- 每个阶段输出 pass、fail 或有期限的 exception，并附证据。
- P0 门禁失败时禁止进入下一阶段。
- 契约、权限、安全、数据迁移和回滚风险必须确认。
- 公共能力变更必须验证全部受影响调用方。
- 例外必须记录负责人、风险、补偿措施和期限。
- 开发前必须确认命中的项目级、需求级、组件级和接口级 spec 状态。
- Review、提测、上线或任务关闭前必须确认 Spec Update Review 已完成。

## MUST NOT

- MUST NOT 以时间紧、人工点过或本地正常绕过 P0。
- MUST NOT 在测试失败、契约未冻结或回滚不可用时放行。
- MUST NOT 将未知风险标记为通过。
- MUST NOT 在 spec 仍为 Draft 且无批准 Candidate 的情况下进入正式开发。
- MUST NOT 将收口（closeout）、归档、发布记录当作 Spec Update Review 的替代品。

## SHOULD

- SHOULD 自动采集 lint、类型、测试、构建、安全和包体证据。
- SHOULD 按风险设置附加门禁。

## Contract

```text
Gate, SpecStatus, Result, Evidence[], Blockers[], Risks[],
Approver, ExceptionExpiry?, RollbackVerified?, SpecUpdateReviewed?
```

## Checklist

- [ ] Review 前范围、契约、自检齐全。
- [ ] 提测前评审关闭、构建成功、环境明确。
- [ ] 上线前回归、安全、监控、灰度、回滚通过。
- [ ] 例外有负责人和到期时间。
- [ ] 开发前 Ready for Development 已通过。
- [ ] 收尾前 Spec Update Review 已完成。

## Examples

### 内容示例，可删除

公共表格变更在组件测试、代表页面 E2E 和视觉回归通过后才可提测。

## Anti-patterns

仅凭“改动很小”跳过构建和调用方验证，直接交付测试或发布。

## Ownership

实现者提供 Review 证据，Reviewer/QA 确认提测，发布和风险 Owner 确认上线。

## Change Policy

门禁降级或删除必须有书面风险评估、批准人和恢复计划。
