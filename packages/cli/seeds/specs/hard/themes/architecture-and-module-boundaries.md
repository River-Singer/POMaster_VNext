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
legacy_id: theme:architecture-and-module-boundaries
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: mixed # 聚合注记：来源值混合；info 性注记非执行语义
stages: [prepare, implement, check] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [architecture, technology-baseline, deployment-topology, project-structure, module-layout, layering, module-boundary, domain-design] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/09-module-boundary-protocol.md
    sha256: f9a3c194910bbb31cd322849cb277db5d2ae0fd74773eef7df34197b8ad89c4f
    seed_version: B6B-1
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/01-architecture-governance-protocol.md
    sha256: 726502f4e5a5dcf2e8076fafa943b33de4b7ab9bd0fc2d8551479b43385e7636
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/02-project-structure-governance-protocol.md
    sha256: add6e21ffa5dd45940dda725e8d4e234c9d2a49775139c895cc7ad5f7caf7bf0
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/03-directory-boundary-protocol.md
    sha256: 95a917cfe3c929b5a0a40de5f6215b25ef4a358a4e7f1c7cb2daa08defcf6bcc
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/04-layering-architecture-protocol.md
    sha256: 4a2ab2aa695a7b78136a2fd96076a869c367bb008a417be508756c632ad4ed6e
    seed_version: B6C
---

# 架构与模块边界

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 09 模块边界协议（pomaster/components/frontend-hard-spec/assets/universal/09-module-boundary-protocol.md）**

P0。定义顶层目录职责、依赖方向、公开入口、shared 下沉和跨模块协作。

**源：BE 01 架构治理协议（pomaster/components/backend-hard-spec/assets/universal/01-architecture-governance-protocol.md）**

规范系统边界、架构层级、技术决策、ADR 与演进门禁。

**源：BE 02 项目结构治理协议（pomaster/components/backend-hard-spec/assets/universal/02-project-structure-governance-protocol.md）**

规范消费项目的后端目录分区、模块入口和结构检查。

**源：BE 03 目录边界协议（pomaster/components/backend-hard-spec/assets/universal/03-directory-boundary-protocol.md）**

约束实现阶段的模块目录、公开入口、依赖方向和越界识别。

**源：BE 04 分层架构协议（pomaster/components/backend-hard-spec/assets/universal/04-layering-architecture-protocol.md）**

规范 Controller、Application/Service、Domain、Repository 与 Infrastructure 的职责。

## Non-Scope

**源：FE 09 模块边界协议**

不规定具体框架目录名，不替代组件、状态或业务规则协议。

**源：BE 01 架构治理协议**

不规定具体项目的模块名、部署数量或技术版本。

**源：BE 02 项目结构治理协议**

不强制所有语言和框架采用同一目录树。

**源：BE 03 目录边界协议**

不规定某种框架的固定包名。

**源：BE 04 分层架构协议**

不要求简单系统机械创建所有层或使用特定框架注解。

## Terms

**源：FE 09 模块边界协议**

- Module：有明确职责、Owner 和公开入口的代码边界。
- Public API：允许其他模块依赖的最小出口。
- Internal：只允许模块内部使用的实现。
- Shared：无特定业务所有权且满足复用门槛的能力。

**源：BE 01 架构治理协议**

架构决策指影响边界、数据所有权、部署单元或公共契约的长期选择。

**源：BE 02 项目结构治理协议**

公开入口是其他模块被允许依赖的稳定包、接口或构建产物。

**源：BE 03 目录边界协议**

越界指绕过公开入口依赖其他模块内部实现。

**源：BE 04 分层架构协议**

依赖方向指高层策略不依赖低层技术细节的约束。

## MUST

**源：FE 09 模块边界协议 · §MUST**

- 顶层目录和模块职责必须文档化。
- 依赖方向和禁止方向必须可检查。
- 模块外部只能通过 Public API 引用。
- 跨模块流程进入明确的 orchestration/feature 层。
- shared 下沉必须证明稳定复用和低业务耦合。
- 循环依赖必须被工具检测并阻止。

**源：BE 01 架构治理协议 · §MUST**

- 架构选择必须记录候选、取舍、风险、ADR 坐标和复审条件。

**源：BE 02 项目结构治理协议 · §MUST**

- 新目录和模块必须有单一职责、公开入口和明确依赖方向。

**源：BE 03 目录边界协议 · §MUST**

- 修改前必须搜索现有实现，并保持依赖只指向声明的公开入口。

**源：BE 04 分层架构协议 · §MUST**

- 业务不变量、事务编排和外部适配必须位于可解释且可测试的边界。

## MUST NOT

**源：FE 09 模块边界协议 · §MUST NOT**

- MUST NOT 引用其他模块内部文件。
- MUST NOT 把页面代码作为其他模块依赖。
- MUST NOT 因方便把业务能力放进 shared。
- MUST NOT 新建无职责说明的顶层目录。

**源：BE 01 架构治理协议 · §MUST NOT**

- 不得以局部代码便利替代边界、数据所有权或部署约束分析。

**源：BE 02 项目结构治理协议 · §MUST NOT**

- 不得创建无法解释职责的顶层目录或把业务代码放入通用工具区。

**源：BE 03 目录边界协议 · §MUST NOT**

- 不得把跨域逻辑塞入共享工具或直接引用其他模块内部文件。

**源：BE 04 分层架构协议 · §MUST NOT**

- 不得在 Controller、ORM Entity 或基础设施适配器中散落权威业务规则。

## SHOULD

**源：FE 09 模块边界协议 · §SHOULD**

- SHOULD 每个模块维护 contract、owner 和 index/public exports。
- SHOULD 用依赖图和 lint 自动执行边界。

**源：BE 01 架构治理协议 · §SHOULD**

- 应优先选择能由现有团队、工具和运行证据持续验证的方案。

**源：BE 02 项目结构治理协议 · §SHOULD**

- 应沿用仓库已验证的结构模式，并在新增结构前搜索现有实现。

**源：BE 03 目录边界协议 · §SHOULD**

- 应以最小写集完成任务，并复用已有边界内能力。

**源：BE 04 分层架构协议 · §SHOULD**

- 应让层间数据转换显式并避免同一校验在多层重复实现。

## Contract

**源：FE 09 模块边界协议 · §Contract**

```text
Module, Responsibility, Owner, PublicExports[],
AllowedDependencies[], ForbiddenDependencies[], InternalPaths[]
```

**源：BE 01 架构治理协议 · §Contract**

架构记录至少输出稳定决策 ID、适用范围、被放弃方案、依赖与验证方式。

**源：BE 02 项目结构治理协议 · §Contract**

结构变更必须给出目标路径、所有者、入口、消费者和迁移计划。

**源：BE 03 目录边界协议 · §Contract**

新增依赖必须能说明提供方、消费方、稳定入口与验证方式。

**源：BE 04 分层架构协议 · §Contract**

每层必须声明输入、输出、失败语义、依赖和测试责任。

## Checklist

**源：FE 09 模块边界协议 · §Checklist**

- [ ] 新文件归属可解释。
- [ ] 只通过公开入口依赖。
- [ ] shared 满足下沉条件。
- [ ] 无循环或越层引用。

**源：BE 01 架构治理协议 · §Checklist**

- [ ] 边界、依赖方向、部署单元和数据所有权已明确。

**源：BE 02 项目结构治理协议 · §Checklist**

- [ ] 已搜索同类模块并检查构建、测试和部署发现路径。

**源：BE 03 目录边界协议 · §Checklist**

- [ ] 写集、入口、依赖方向和受影响消费者已复核。

**源：BE 04 分层架构协议 · §Checklist**

- [ ] 调用链、转换点、事务所有者和异常映射已明确。

## Examples

**源：FE 09 模块边界协议 · §Examples**

### 内容示例，可删除

两个业务域共同参与的导入流程放入 feature/orchestration 层，而不是让域 A 引用域 B 的页面。

**源：BE 01 架构治理协议 · §Examples**

- 将单体与服务拆分作为候选比较，并记录选择理由和复审触发条件。

**源：BE 02 项目结构治理协议 · §Examples**

- 为独立领域建立模块，并通过公开接口而不是内部包提供能力。

**源：BE 03 目录边界协议 · §Examples**

- 通过领域端口调用基础设施适配器，而不是从 Controller 直接访问实现类。

**源：BE 04 分层架构协议 · §Examples**

- Controller 校验传输格式，应用服务编排用例，领域对象维护不变量。

## Anti-patterns

**源：FE 09 模块边界协议 · §Anti-patterns**

把带客户、订单、成本语义的组件放入 shared，再被多个模块反向耦合。

**源：BE 01 架构治理协议 · §Anti-patterns**

- 只画理想架构图，不绑定构建产物、部署单元或实际依赖。

**源：BE 02 项目结构治理协议 · §Anti-patterns**

- 复制相似模块后仅改名，造成规则和修复长期漂移。

**源：BE 03 目录边界协议 · §Anti-patterns**

- 为绕过循环依赖建立含混的 `common` 目录。

**源：BE 04 分层架构协议 · §Anti-patterns**

- Service 仅转发，而 Controller 同时处理事务、SQL 和业务判断。

## Ownership

**源：FE 09 模块边界协议 · §Ownership**

架构 Owner 维护顶层边界，模块 Owner 维护公开入口，Reviewer 阻止越层引用。

**源：BE 01 架构治理协议 · §Ownership**

后端技术负责人维护决策，模块维护者提供实现与运行证据。

**源：BE 02 项目结构治理协议 · §Ownership**

模块所有者维护结构，评审者检查跨模块依赖和重复实现。

**源：BE 03 目录边界协议 · §Ownership**

代码作者说明边界影响，模块所有者审批公开入口变化。

**源：BE 04 分层架构协议 · §Ownership**

架构所有者维护分层约束，各层维护者提供边界测试。

## Change Policy

**源：FE 09 模块边界协议 · §Change Policy**

新增顶层模块、改变依赖方向或扩大 Public API 必须经过架构评审和迁移说明。

**源：BE 01 架构治理协议 · §Change Policy**

改变已采用架构必须新增或替代 ADR，不得静默改写历史结论。

**源：BE 02 项目结构治理协议 · §Change Policy**

目录迁移必须同步引用、构建、测试、文档和兼容入口。

**源：BE 03 目录边界协议 · §Change Policy**

公开入口变化按契约变更处理，迁移完成前保留兼容路径。

**源：BE 04 分层架构协议 · §Change Policy**

跨层迁移必须记录兼容影响并分阶段消除旧依赖。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
