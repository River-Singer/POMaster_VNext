---
seed_source: packages/cli/seeds/aggregation-manifest.json
seed_source_sha256: 039b637ccffacdfe3ce30d85e193f4b38928fcdfb16efdc4eb255e35e05af91f
seed_version: B7-THEME
lane: [frontend, backend]
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend, backend]
related_evidence_specs: []
related_tools: []
legacy_id: theme:release-and-feature-flags
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: triggered # 聚合注记：来源同值；info 性注记非执行语义
stages: [prepare, check, release] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [release, rollback, versioning] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/33-release-versioning-protocol.md
    sha256: aae0557f4935bac24d04e37ebde5638471b709ff568fea0d13de35bd5dd404af
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/36-feature-flag-protocol.md
    sha256: ba6cf2d5607ba54d9864cd6c07899d2e13a8d33ea248fbd7469b92c23474f474
    seed_version: B6B-2
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/32-release-versioning-rollback-protocol.md
    sha256: 26a6a23928fc24338f69fb34199ecdea5f654e21534a76ac53a7c0b78030b3c8
    seed_version: B6C
---

# 发布与开关

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 33 版本与发布协议（pomaster/components/frontend-hard-spec/assets/universal/33-release-versioning-protocol.md）**

P2。定义版本标识、分支/提交、灰度、回滚、公共 API 兼容和发布证据。

**源：FE 36 Feature Flag 协议（pomaster/components/frontend-hard-spec/assets/universal/36-feature-flag-protocol.md）**

P2。定义功能开关来源、命名、灰度范围、关闭表现、默认值和生命周期。

**源：BE 32 发布、版本与回滚协议（pomaster/components/backend-hard-spec/assets/universal/32-release-versioning-rollback-protocol.md）**

规范版本、灰度、开关、发布记录、兼容窗口、回滚和数据库演进。

## Non-Scope

**源：FE 33 版本与发布协议**

不替代验收门禁、组织发布平台和基础设施部署流程。

**源：FE 36 Feature Flag 协议**

不替代权限、业务状态和环境配置。

**源：BE 32 发布、版本与回滚协议**

不替代具体平台操作手册或证据验收协议。

## Terms

**源：FE 33 版本与发布协议**

- App Version：可关联提交、构建、环境和 source map 的版本。
- Gray Release：受控用户/环境范围内逐步发布。
- Rollback：恢复到已验证版本和兼容状态。

**源：FE 36 Feature Flag 协议**

- Flag Key：稳定唯一的开关键。
- Targeting：按环境、用户、角色或组织控制命中。
- Kill Switch：紧急关闭新能力的开关。

**源：BE 32 发布、版本与回滚协议**

可回退包括代码回滚、配置恢复、流量撤回和数据 roll-forward 的组合能力。

## MUST

**源：FE 33 版本与发布协议 · §MUST**

- 每个构建有可观测版本和来源。
- 发布前契约、测试、安全、配置、监控和回滚满足门禁。
- 高风险变更定义灰度和停止条件。
- 回滚同时考虑前端资源、接口、缓存、任务和数据兼容。
- 公共 breaking change 先 deprecated 并提供迁移期。

**源：FE 36 Feature Flag 协议 · §MUST**

- 每个 flag 有 owner、目的、默认值、目标范围、期限和清理日期。
- 入口、路由和后台请求在关闭时一致停用。
- 获取失败使用保守默认值。
- Flag 与权限同时通过才允许操作。
- 全量稳定后删除临时判断和旧路径。

**源：BE 32 发布、版本与回滚协议 · §MUST**

- 发布前必须确认版本、依赖顺序、兼容、观测、停止条件和恢复路径。

## MUST NOT

**源：FE 33 版本与发布协议 · §MUST NOT**

- MUST NOT 无版本标识发布。
- MUST NOT 无回滚上线破坏性变化。
- MUST NOT 直接删除公共 API。
- MUST NOT 发布后才补监控和 source map。

**源：FE 36 Feature Flag 协议 · §MUST NOT**

- MUST NOT 在多个页面手写同一判断。
- MUST NOT 将 flag 当权限或业务状态。
- MUST NOT 使用无 owner、无期限的永久临时 flag。
- MUST NOT 关闭 UI 却继续触发后台请求。

**源：BE 32 发布、版本与回滚协议 · §MUST NOT**

- 不得在无法恢复数据或无监控信号时进行不可逆全量发布。

## SHOULD

**源：FE 33 版本与发布协议 · §SHOULD**

- SHOULD 自动生成变更摘要和发布证据。
- SHOULD 使用 Feature Flag 降低高风险上线范围。

**源：FE 36 Feature Flag 协议 · §SHOULD**

- SHOULD 支持灰度、回滚、监控和实验审计。
- SHOULD 对关键写操作提供 kill switch。

**源：BE 32 发布、版本与回滚协议 · §SHOULD**

- 应采用小批量灰度、可撤回开关和前后版本并行兼容。

## Contract

**源：FE 33 版本与发布协议 · §Contract**

```text
Version, Commit, BuildTime, Environment, Changes,
Flags, Migration, Monitoring, Rollback, Owner
```

**源：FE 36 Feature Flag 协议 · §Contract**

```text
FlagKey, Owner, Default, Targeting, Fallback,
StartAt, EndAt, CleanupAt, Metrics
```

**源：BE 32 发布、版本与回滚协议 · §Contract**

发布记录必须包含变更范围、产物 hash、步骤、门禁、指标、Owner 与结果。

## Checklist

**源：FE 33 版本与发布协议 · §Checklist**

- [ ] 版本可追踪。
- [ ] 门禁和契约通过。
- [ ] 灰度与回滚可执行。
- [ ] deprecated/迁移完整。

**源：FE 36 Feature Flag 协议 · §Checklist**

- [ ] 默认和失败行为安全。
- [ ] UI/路由/请求一致。
- [ ] 不绕过权限。
- [ ] 有清理日期。

**源：BE 32 发布、版本与回滚协议 · §Checklist**

- [ ] 应用、数据库、配置、消息、缓存与消费者版本已对齐。

## Examples

**源：FE 33 版本与发布协议 · §Examples**

### 内容示例，可删除

公共组件新 API 与旧 API 并存一个迁移周期，再在版本公告后删除旧 API。

**源：FE 36 Feature Flag 协议 · §Examples**

### 内容示例，可删除

新编辑器 flag 关闭后回到旧编辑器，相关新 API 不再调用。

**源：BE 32 发布、版本与回滚协议 · §Examples**

- 先发布兼容读写版本，完成数据迁移后再清理旧契约。

## Anti-patterns

**源：FE 33 版本与发布协议 · §Anti-patterns**

静态资源已回滚，但新缓存 schema 和后台任务仍不兼容旧页面。

**源：FE 36 Feature Flag 协议 · §Anti-patterns**

组件中散落环境判断，开关关闭后深链接仍能访问新功能。

**源：BE 32 发布、版本与回滚协议 · §Anti-patterns**

- 把数据库回滚等同于逆向执行破坏性 migration。

## Ownership

**源：FE 33 版本与发布协议 · §Ownership**

发布 Owner 负责流程，模块 Owner 负责兼容，平台 Owner 负责回滚和监控。

**源：FE 36 Feature Flag 协议 · §Ownership**

功能 Owner 维护业务生命周期，平台 Owner 维护系统，安全/权限 Owner 审查边界。

**源：BE 32 发布、版本与回滚协议 · §Ownership**

发布责任人执行门禁，Backend 提供兼容与恢复证据。

## Change Policy

**源：FE 33 版本与发布协议 · §Change Policy**

版本和发布策略变化必须同步 CI/CD、门禁、文档和责任人。

**源：FE 36 Feature Flag 协议 · §Change Policy**

Flag 语义和目标规则变化必须记录；转长期配置时迁移到正式配置系统。

**源：BE 32 发布、版本与回滚协议 · §Change Policy**

发布流程和阻断门禁变化必须通过演练与审计后生效。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
