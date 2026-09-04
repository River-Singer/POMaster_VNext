---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/33-release-versioning-protocol.md
seed_source_sha256: aae0557f4935bac24d04e37ebde5638471b709ff568fea0d13de35bd5dd404af
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 33 版本与发布协议

## Scope

P2。定义版本标识、分支/提交、灰度、回滚、公共 API 兼容和发布证据。

## Non-Scope

不替代验收门禁、组织发布平台和基础设施部署流程。

## Terms

- App Version：可关联提交、构建、环境和 source map 的版本。
- Gray Release：受控用户/环境范围内逐步发布。
- Rollback：恢复到已验证版本和兼容状态。

## MUST

- 每个构建有可观测版本和来源。
- 发布前契约、测试、安全、配置、监控和回滚满足门禁。
- 高风险变更定义灰度和停止条件。
- 回滚同时考虑前端资源、接口、缓存、任务和数据兼容。
- 公共 breaking change 先 deprecated 并提供迁移期。

## MUST NOT

- MUST NOT 无版本标识发布。
- MUST NOT 无回滚上线破坏性变化。
- MUST NOT 直接删除公共 API。
- MUST NOT 发布后才补监控和 source map。

## SHOULD

- SHOULD 自动生成变更摘要和发布证据。
- SHOULD 使用 Feature Flag 降低高风险上线范围。

## Contract

```text
Version, Commit, BuildTime, Environment, Changes,
Flags, Migration, Monitoring, Rollback, Owner
```

## Checklist

- [ ] 版本可追踪。
- [ ] 门禁和契约通过。
- [ ] 灰度与回滚可执行。
- [ ] deprecated/迁移完整。

## Examples

### 内容示例，可删除

公共组件新 API 与旧 API 并存一个迁移周期，再在版本公告后删除旧 API。

## Anti-patterns

静态资源已回滚，但新缓存 schema 和后台任务仍不兼容旧页面。

## Ownership

发布 Owner 负责流程，模块 Owner 负责兼容，平台 Owner 负责回滚和监控。

## Change Policy

版本和发布策略变化必须同步 CI/CD、门禁、文档和责任人。
