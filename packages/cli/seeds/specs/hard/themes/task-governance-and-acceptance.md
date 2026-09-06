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
legacy_id: theme:task-governance-and-acceptance
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: mixed # 聚合注记：来源值混合；info 性注记非执行语义
stages: [prepare, implement, check, release] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [ownership, handoff] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/01-development-checklist-protocol.md
    sha256: fa8914b29dbf7af25c8128aa1b8936fd658e37854e0a4f457175e2e3c82c3a03
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/03-acceptance-gate-protocol.md
    sha256: 646dcbd7035d43d84ca592218a356c08a4baca36619109797322d90ba3d99b73
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/06-change-governance-protocol.md
    sha256: 2f19b46e451153cab35e9fb511d9da0f072f86424e7d3f7a6b307cd17a9d1b32
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/08-role-responsibility-protocol.md
    sha256: 732ac305cd16207e4a7bd4c95a6774d1aca33fb4e45cf29991ac0f6475605d6f
    seed_version: B6B-1
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/05-task-workflow-protocol.md
    sha256: b0d176f1f2d19cd14739ff4de39d77659036516ab1377b83c261ecc53a2de2dd
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/07-evidence-acceptance-protocol.md
    sha256: fb86312eaadaec81d21e20abfb979e0127138002731ddc4fb1ead9ec90cd10bb
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/08-contract-change-protocol.md
    sha256: 805c146b31c70d08f876631bc19273076eb242d78fcb3b3a3bd33437e28a6953
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/09-role-responsibility-protocol.md
    sha256: 603b285faa271b77140f28e1038f850cd01b17ed1813b965898c4746233b342f
    seed_version: B6C
---

# 任务治理与验收

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 01 开发检查项协议（pomaster/components/frontend-hard-spec/assets/universal/01-development-checklist-protocol.md）**

P0。把规范转成每次开发前、开发中、开发后的强制动作，适用于功能、修复、重构、配置和文档驱动变更。

**源：FE 03 验收门禁协议（pomaster/components/frontend-hard-spec/assets/universal/03-acceptance-gate-protocol.md）**

P0。定义变更何时可以进入 Review、提测和上线，以及各阶段的必备证据。

**源：FE 06 变更治理协议（pomaster/components/frontend-hard-spec/assets/universal/06-change-governance-protocol.md）**

P0。管理公共组件、公共 API、样式、状态、schema 和平台能力的影响评估、兼容、废弃和迁移。

**源：FE 08 角色责任协议（pomaster/components/frontend-hard-spec/assets/universal/08-role-responsibility-protocol.md）**

P0/P1 治理协议。定义需求、设计、前端、后端、测试、平台、安全、协议和 AI 协作中的责任边界。

**源：BE 05 后端任务工作流协议（pomaster/components/backend-hard-spec/assets/universal/05-task-workflow-protocol.md）**

定义 Backend Ready、阶段选择、影响识别和执行路由。

**源：BE 07 证据与验收协议（pomaster/components/backend-hard-spec/assets/universal/07-evidence-acceptance-protocol.md）**

定义计划证据、实现证据、检查证据、发布证据和例外门禁。

**源：BE 08 契约变更协议（pomaster/components/backend-hard-spec/assets/universal/08-contract-change-protocol.md）**

识别 API、错误码、schema、消息、配置与运行行为的兼容影响。

**源：BE 09 角色与责任协议（pomaster/components/backend-hard-spec/assets/universal/09-role-responsibility-protocol.md）**

规范 Owner、RACI、评审责任、升级和跨角色交接。

## Non-Scope

**源：FE 01 开发检查项协议**

不定义技术栈命令，不替代测试协议、验收门禁和发布审批。

**源：FE 03 验收门禁协议**

不指定测试框架，不替代业务验收、发布平台操作或人工批准责任。

**源：FE 06 变更治理协议**

不定义单个组件的业务功能，不替代版本发布和代码评审。

**源：FE 08 角色责任协议**

不规定组织架构、职级、绩效或人员姓名，不替代项目管理系统。

**源：BE 05 后端任务工作流协议**

不替代 BP 业务事实或项目级实施方案。

**源：BE 07 证据与验收协议**

不替代各领域协议规定的具体测试方法。

**源：BE 08 契约变更协议**

不定义具体业务契约内容。

**源：BE 09 角色与责任协议**

不保存具体项目的人员名单或排班。

## Terms

**源：FE 01 开发检查项协议**

- Change Classification：局部、同类模式、公共能力、契约、平台或工程变更。
- Impact Set：必须修改、需要同步、明确禁止修改的范围。
- Evidence：搜索、测试、截图、构建、契约差异等可复核证据。
- Spec Update Review：开发完成后判断是否需要补充 spec 的强制复核。

**源：FE 03 验收门禁协议**

- Ready for Review：实现和自检完成。
- Ready for Test：评审阻塞关闭，构建可测试。
- Ready for Release：质量、安全、监控和回滚可用。
- Ready for Development：相关项目级和需求级 spec 已达到 Baseline 或批准的 Candidate。
- Blocker：不满足即禁止进入下一阶段的问题。

**源：FE 06 变更治理协议**

- Public Contract：被多个调用方依赖的稳定接口或默认行为。
- Breaking Change：要求调用方修改才能继续工作的变更。
- Deprecated：仍可用但已声明迁移目标和删除期限的能力。
- Spec Status：Draft、Candidate、Baseline、Controlled Change 或 Release Review。
- Baseline：可作为开发依据的冻结版本。
- Controlled Change：Baseline 后带影响、Owner、迁移和验证证据的受控修改。

**源：FE 08 角色责任协议**

- Responsible：执行者。
- Accountable：最终责任者。
- Consulted：必须征询者。
- Informed：必须通知者。
- Approver：有权放行例外者。

**源：BE 05 后端任务工作流协议**

stage 为 `prepare`、`implement`、`check` 或 `release`。

**源：BE 07 证据与验收协议**

证据是可由他人复核的代码坐标、hash、测试、报告或运行结果。

**源：BE 08 契约变更协议**

公共契约是已有调用方、持久化数据或运行依赖所观察的稳定行为。

**源：BE 09 角色与责任协议**

Owner 指对契约、实现或证据完整性承担最终维护责任的角色。

## MUST

**源：FE 01 开发检查项协议 · §MUST**

- 开发前完成变更分类、协议选择、复用搜索和影响范围。
- 写代码前列出 Must Change、Must Sync、Must Not Change。
- 缺少正式字段、状态、权限、接口或业务规则时先补契约或阻塞确认。
- 开发中发现范围扩大时重新分类并更新计划。
- 开发后提供检查结果、影响说明和残余风险。
- 开发后、任务关闭或收口（closeout）流程前必须完成 Spec Update Review。
- 发现新规则、重复坑点、接口/组件/目录/测试约定时必须更新对应 spec；无更新时必须记录原因。

**源：FE 03 验收门禁协议 · §MUST**

- 每个阶段输出 pass、fail 或有期限的 exception，并附证据。
- P0 门禁失败时禁止进入下一阶段。
- 契约、权限、安全、数据迁移和回滚风险必须确认。
- 公共能力变更必须验证全部受影响调用方。
- 例外必须记录负责人、风险、补偿措施和期限。
- 开发前必须确认命中的项目级、需求级、组件级和接口级 spec 状态。
- Review、提测、上线或任务关闭前必须确认 Spec Update Review 已完成。

**源：FE 06 变更治理协议 · §MUST**

- 公共变更前列出直接/间接调用方和受影响场景。
- 保持兼容或提供迁移方案、版本范围和回滚。
- 更新 contract、示例、测试、文档和通知。
- 删除前必须先 deprecated 并确认无使用方。
- 局部问题与公共问题必须按根因选择修改层级。
- 项目级 spec、需求级 spec、公共组件 spec 和接口 spec 必须记录状态、版本、Owner、更新时间和生效范围。
- Baseline 后修改公共组件 API、接口字段、权限码、错误码、Design Token、目录边界、状态模型、金额精度或验收门禁，必须走 Controlled Change。
- 每次开发后的 Spec Update Review 必须把新规则归类为：需求级记录、长期 spec、通用规范候选或无需更新。

**源：FE 08 角色责任协议 · §MUST**

- 每个协议、公共组件、接口、业务规则和发布都有 Accountable Owner。
- 跨团队变更开发前确定 Reviewer 和通知范围。
- 无 Owner 的关键决策必须阻塞并升级。
- AI 输出必须由人类 Owner Review，AI 不得成为 Approver。

**源：BE 05 后端任务工作流协议 · §MUST**

- 必须确认任务事实、stage、写集、契约影响、风险和验证计划。

**源：BE 07 证据与验收协议 · §MUST**

- 验收结论必须绑定当前任务、review range、版本和可复核证据。

**源：BE 08 契约变更协议 · §MUST**

- 变更前必须识别消费者、兼容窗口、迁移、回滚和版本策略。

**源：BE 09 角色与责任协议 · §MUST**

- 高风险决策、公共契约和运行门禁必须有可识别的责任角色。

## MUST NOT

**源：FE 01 开发检查项协议 · §MUST NOT**

- MUST NOT 先实现后补范围。
- MUST NOT 用“应该没问题”代替证据。
- MUST NOT 混入无关清理、升级或重构。
- MUST NOT 跳过 Spec Update Review 后直接归档、收口或发布。
- MUST NOT 将一次性实现细节写入长期 spec。

**源：FE 03 验收门禁协议 · §MUST NOT**

- MUST NOT 以时间紧、人工点过或本地正常绕过 P0。
- MUST NOT 在测试失败、契约未冻结或回滚不可用时放行。
- MUST NOT 将未知风险标记为通过。
- MUST NOT 在 spec 仍为 Draft 且无批准 Candidate 的情况下进入正式开发。
- MUST NOT 将收口（closeout）、归档、发布记录当作 Spec Update Review 的替代品。

**源：FE 06 变更治理协议 · §MUST NOT**

- MUST NOT 随意改变公共默认行为。
- MUST NOT 为单页临时需求修改公共 API。
- MUST NOT 只修一个页面来掩盖公共问题。
- MUST NOT 无迁移地删除 props、事件、字段或状态。
- MUST NOT 把 Draft 或示例内容当作 Baseline 执行。
- MUST NOT 把 Draft 或示例内容当作 Baseline 执行。

**源：FE 08 角色责任协议 · §MUST NOT**

- MUST NOT 用“团队共同负责”隐藏无人负责。
- MUST NOT 让前端单方面决定后端契约、公式或数据权限。
- MUST NOT 让设计稿覆盖安全、可访问性或公共 API。
- MUST NOT 让 AI 代替业务、合规或上线签字。

**源：BE 05 后端任务工作流协议 · §MUST NOT**

- 不得把 planned、推测或未运行检查描述为 verified。

**源：BE 07 证据与验收协议 · §MUST NOT**

- 不得以口头完成声明、过期报告或无来源截图通过门禁。

**源：BE 08 契约变更协议 · §MUST NOT**

- 不得在没有迁移说明时删除、重命名或改变已发布语义。

**源：BE 09 角色与责任协议 · §MUST NOT**

- 不得用“团队共同负责”掩盖审批、维护或事故响应空缺。

## SHOULD

**源：FE 01 开发检查项协议 · §SHOULD**

- SHOULD 将检查项集成任务模板、PR 模板和自动化门禁。
- SHOULD 按风险扩大检查，而非机械执行无关项目。

**源：FE 03 验收门禁协议 · §SHOULD**

- SHOULD 自动采集 lint、类型、测试、构建、安全和包体证据。
- SHOULD 按风险设置附加门禁。

**源：FE 06 变更治理协议 · §SHOULD**

- SHOULD 使用影响模板、自动调用图和 deprecated 提示。
- SHOULD 将公共变更拆成兼容引入、迁移、删除阶段。

**源：FE 08 角色责任协议 · §SHOULD**

- SHOULD 为跨层能力维护轻量 RACI。
- SHOULD 为 Owner 缺席定义代理和升级路径。

**源：BE 05 后端任务工作流协议 · §SHOULD**

- 应在发现跨角色缺口时生成明确问题或 blocker。

**源：BE 07 证据与验收协议 · §SHOULD**

- 应记录失败检查、未覆盖风险和经批准例外的到期条件。

**源：BE 08 契约变更协议 · §SHOULD**

- 应优先采用可并行部署、可观测并可撤回的演进方式。

**源：BE 09 角色与责任协议 · §SHOULD**

- 应在 handoff 中明确输入、输出、截止条件和拒收标准。

## Contract

**源：FE 01 开发检查项协议 · §Contract**

```text
Goal, Classification, ProtocolsLoaded, SpecStatus, ReuseSearch,
MustChange, MustSync, MustNotChange, ContractsAffected,
ValidationRequired, Evidence, SpecUpdateDecision, ResidualRisk
```

**源：FE 03 验收门禁协议 · §Contract**

```text
Gate, SpecStatus, Result, Evidence[], Blockers[], Risks[],
Approver, ExceptionExpiry?, RollbackVerified?, SpecUpdateReviewed?
```

**源：FE 06 变更治理协议 · §Contract**

```text
Change, SpecStatus, Version, Owner, AffectedConsumers[],
Compatibility, Migration, DeprecationDate?, RemovalDate?,
Tests, Rollback, SpecUpdateDecision
```

**源：FE 08 角色责任协议 · §Contract**

```text
ArtifactOrDecision, Responsible, Accountable,
Consulted[], Informed[], RequiredReviewers[], EscalationPath
```

**源：BE 05 后端任务工作流协议 · §Contract**

每次执行必须输出范围、选中规范、变更结果、检查证据和剩余风险。

**源：BE 07 证据与验收协议 · §Contract**

验收记录至少包含检查项、命令或来源、结果、时间范围与责任方。

**源：BE 08 契约变更协议 · §Contract**

变更记录必须包含旧行为、新行为、影响面、兼容判断和验证证据。

**源：BE 09 角色与责任协议 · §Contract**

责任记录至少包含决策者、执行者、评审者、被通知方和升级路径。

## Checklist

**源：FE 01 开发检查项协议 · §Checklist**

- [ ] 已分类并加载协议。
- [ ] 已搜索已有能力。
- [ ] 已声明影响与禁止范围。
- [ ] 已确认契约、安全和数据边界。
- [ ] 已提供验证证据。
- [ ] 已完成 Spec Update Review，并记录更新或不更新的原因。

**源：FE 03 验收门禁协议 · §Checklist**

- [ ] Review 前范围、契约、自检齐全。
- [ ] 提测前评审关闭、构建成功、环境明确。
- [ ] 上线前回归、安全、监控、灰度、回滚通过。
- [ ] 例外有负责人和到期时间。
- [ ] 开发前 Ready for Development 已通过。
- [ ] 收尾前 Spec Update Review 已完成。

**源：FE 06 变更治理协议 · §Checklist**

- [ ] 根因层级明确。
- [ ] 调用方清单完整。
- [ ] 兼容、迁移和回滚可执行。
- [ ] 测试、示例和通知已更新。
- [ ] Spec 状态、版本、Owner 和生效范围已记录。
- [ ] 开发后规则回填已归类并执行。

**源：FE 08 角色责任协议 · §Checklist**

- [ ] 各阶段 Owner 明确。
- [ ] 跨层 Reviewer 已确定。
- [ ] 例外有批准者。
- [ ] AI 输出有人类责任人。

**源：BE 05 后端任务工作流协议 · §Checklist**

- [ ] 当前 stage 与任务目标一致。

**源：BE 07 证据与验收协议 · §Checklist**

- [ ] 计划、实现、测试、运行和发布证据处于同一变更范围。

**源：BE 08 契约变更协议 · §Checklist**

- [ ] API、数据、消息、配置和运行消费者均已检查。

**源：BE 09 角色与责任协议 · §Checklist**

- [ ] 跨 BP、Frontend、Backend、Test 与 Ops 的边界已明确。

## Examples

**源：FE 01 开发检查项协议 · §Examples**

### 内容示例，可删除

修复单页列宽时，先证明根因属于页面 schema，只修改该 schema 和页面测试，并明确禁止修改全局样式。

**源：FE 03 验收门禁协议 · §Examples**

### 内容示例，可删除

公共表格变更在组件测试、代表页面 E2E 和视觉回归通过后才可提测。

**源：FE 06 变更治理协议 · §Examples**

### 内容示例，可删除

新增 props 保留旧默认值，发布迁移说明，调用方完成迁移后再删除旧 props。

**源：FE 08 角色责任协议 · §Examples**

### 内容示例，可删除

业务 Owner 定义金额口径，后端负责权威计算，前端负责无损展示，QA 验证边界。

**源：BE 05 后端任务工作流协议 · §Examples**

- 简单内部 Mapper 修复只加载当前 stage 的 always 基线。

**源：BE 07 证据与验收协议 · §Examples**

- 用 migration 测试与 schema hash 证明数据库变更已验证。

**源：BE 08 契约变更协议 · §Examples**

- 新字段先以兼容方式发布，消费者迁移后再结束旧版本窗口。

**源：BE 09 角色与责任协议 · §Examples**

- API 提供方维护契约，调用方确认兼容窗口内完成迁移。

## Anti-patterns

**源：FE 01 开发检查项协议 · §Anti-patterns**

直接修改公共组件，既不搜索调用方，也不验证同类页面，把局部问题扩散成全局回归。

**源：FE 03 验收门禁协议 · §Anti-patterns**

仅凭“改动很小”跳过构建和调用方验证，直接交付测试或发布。

**源：FE 06 变更治理协议 · §Anti-patterns**

为一个页面修改公共组件默认 padding，导致所有页面布局变化且没有视觉回归。

**源：FE 08 角色责任协议 · §Anti-patterns**

接口含义未确认时由前端和 AI 自行解释，最终无人能判断哪个结果正确。

**源：BE 05 后端任务工作流协议 · §Anti-patterns**

- 因协议 critical 就无条件加载其完整正文。

**源：BE 07 证据与验收协议 · §Anti-patterns**

- 只列“测试通过”，不提供测试范围与结果来源。

**源：BE 08 契约变更协议 · §Anti-patterns**

- 只修改实现而不更新 OpenAPI、migration、事件 schema 或变更记录。

**源：BE 09 角色与责任协议 · §Anti-patterns**

- 交接只发送文档链接，不说明版本、状态和待办。

## Ownership

**源：FE 01 开发检查项协议 · §Ownership**

实现者负责填写，Reviewer 核验范围与证据，协议 Owner 裁决歧义。

**源：FE 03 验收门禁协议 · §Ownership**

实现者提供 Review 证据，Reviewer/QA 确认提测，发布和风险 Owner 确认上线。

**源：FE 06 变更治理协议 · §Ownership**

公共能力 Owner 对兼容负责，调用方 Owner 对迁移负责，架构 Owner 裁决跨模块影响。

**源：FE 08 角色责任协议 · §Ownership**

项目负责人维护角色模型，各领域 Owner 维护其 RACI，治理 Owner 处理无人归属。

**源：BE 05 后端任务工作流协议 · §Ownership**

执行者维护任务状态，评审者核对证据与声明一致性。

**源：BE 07 证据与验收协议 · §Ownership**

实现者提供证据，评审与发布责任人决定门禁是否满足。

**源：BE 08 契约变更协议 · §Ownership**

契约提供方维护兼容方案，消费者确认迁移完成。

**源：BE 09 角色与责任协议 · §Ownership**

治理维护者定义角色模型，项目自行绑定实际责任人。

## Change Policy

**源：FE 01 开发检查项协议 · §Change Policy**

新增检查项必须定义触发、验证和失败动作；降级 P0 检查项必须批准并记录期限。

**源：FE 03 验收门禁协议 · §Change Policy**

门禁降级或删除必须有书面风险评估、批准人和恢复计划。

**源：FE 06 变更治理协议 · §Change Policy**

Breaking Change 必须版本化；紧急修复仍需事后补齐影响、通知和迁移记录。

**源：FE 08 角色责任协议 · §Change Policy**

角色或批准边界变化必须通知协作者；临时代理必须有范围和期限。

**源：BE 05 后端任务工作流协议 · §Change Policy**

阶段语义变化必须同步注入器、索引和生命周期消费者。

**源：BE 07 证据与验收协议 · §Change Policy**

降低证据要求必须作为受控例外记录，不得静默删除门禁。

**源：BE 08 契约变更协议 · §Change Policy**

破坏性变更必须经过显式审批、版本升级和可执行回退方案。

**源：BE 09 角色与责任协议 · §Change Policy**

角色模型变化不得回写或推测消费项目的人员事实。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
