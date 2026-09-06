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
x-aggregation: # 合并承接来源（D2；改写授权 = D2/OQ-13 导航层承接，非逐字节聚合）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/index.md
    sha256: 37fc443ce1f90eaa2584a82e12300d8281760332ec69d55a52b26cb22a2b2375
    seed_version: B6B-2
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/index.md
    sha256: b50c1fdcab5d1a3217a6e28059580195f681b6e68f465eb8e055bd8e5310c479
    seed_version: B6C
---

# 硬规范主题导航

> 本文档是 `.pomaster/specs/hard/` 主题文档集的单一导航入口（B7-THEME：原前端/后端两份 index 合并承接——Owner 裁定 D2）。它不规定具体写法，只承载主题路由、激活基线、冲突优先级与结构约定；规则本体在各主题文档，语言/栈细则在 `stacks/<slug>/<slug>-overlay.md`。

## 使用规则

- 本目录主题文档由 init 一次性播种到 `.pomaster/specs/hard/themes/`（seed-once：缺席才写、在座零触碰）；开发/验收上下文的协议激活由 `pomaster context compile --role <role>` 投影承载；不得修改 pomaster 工具、hook 或配置来实现自动加载。
- 主题文档 frontmatter 的 injection_mode/stages/triggers 为聚合注记（info 性，非执行语义）；`criticality` 只决定违规严重度，不参与默认选择。
- 优先级由「优先级定义」的 P0/P1/P2 决定；主题文档 Scope 正文首 token 的 P 值是来源协议事实，随源行保留。
- 已确认规则写成 MUST / MUST NOT / SHOULD 和具体 Contract；暂未决策项保留 `TODO_CONFIRM`，AI 不得在代码中临场发明。
- 开发结束按验收门禁提供证据，而不是只声明“已完成”。
- 项目事实和项目选型写入独立项目 overlay，不修改主题文档的来源规则行。

## 目录结构

- `.pomaster/specs/hard/themes/` 当前包含 20 份主题文档（12 跨端 + 5 前端独占 + 2 后端独占）与本导航文档（B7-THEME：原两份 index 合并承接）。
- 主题文档 12 节骨架与来源协议的对应关系由 frontmatter `x-aggregation` 承载；来源协议的语义 ID 与 vendor 路径是稳定身份，聚合顺序不重排。
- 新增、废弃、合并或拆分主题文档属于协议架构变更，必须走任务治理与验收主题文档的受控变更流程；已发布内容先废弃和迁移，不得静默删除或复用其身份。

## 通用规则准入与维护来源

规则进入 universal（vendor 通用集）前必须同时满足：

1. 适用于多个无关业务或来自正式 Web 标准/一手实现规范，而不是单个项目事故的临时补丁。
2. 不绑定产品字段、页面、接口、目录、框架、组件库、供应商或组织流程。
3. 可以通过审查、自动化、测试或明确证据验证。
4. 与现有协议完成 Scope/Non-Scope 和重复职责审计，避免同一事实多处维护。
5. 使用官方标准、官方文档或一手仓库作为规则依据；二手文章只能提供检索线索。
6. 项目阈值和选型下沉到项目 spec；universal 只规定必须存在的决策、边界和证据。

首选维护来源包括：

- 安全：[OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) 与 [W3C Web Application Security](https://www.w3.org/TR/?tag=security)。
- 可访问性：[WCAG 2.2](https://www.w3.org/TR/WCAG22/) 与 [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)。
- Web 平台与生命周期：[WHATWG HTML](https://html.spec.whatwg.org/) 与 [MDN Web Docs](https://developer.mozilla.org/)。
- 性能：[web.dev Web Vitals](https://web.dev/articles/vitals) 与 W3C Web Performance 规范。
- 隐私：[W3C Privacy Principles](https://www.w3.org/TR/privacy-principles/)。
- 时间语义：[ECMAScript Temporal](https://tc39.es/proposal-temporal/)。
- 工具和供应链：对应 runtime、包管理器、CI 平台和测试工具的官方文档或一手仓库。

## Pre-Development Checklist

- [ ] 确认 `.pomaster/specs/hard/themes/` 已安装并通过本导航的路由表校验；项目事实和项目选型写入独立项目 overlay，不修改主题文档的来源规则行。
- [ ] 读取「默认激活基线」，再按「按任务追加激活」「任务命中矩阵」选择本次命中的主题文档；多行命中取并集。
- [ ] 使用主题文档与来源协议语义 ID 记录选择理由，不用编号代替身份。
- [ ] 开发前声明本次命中的 MUST/MUST NOT、需要项目确认的阈值/选型和验证方式。
- [ ] 若通用协议与项目 overlay 冲突，按「协议冲突优先级」停止并记录裁决，不在代码中临场发明。

## Spec 生命周期

| 状态 | 含义 | 可用于开发 |
|---|---|---|
| Draft | 项目启动后的目录、模板、候选规则和未确认项 | 否 |
| Candidate | PRD、原型、技术方向、接口风格初步确认，可支撑垂直切片 | 仅限明确标注的切片或 Spike |
| Baseline | 需求、设计、接口、权限、数据模型、测试验收已确认 | 是 |
| Controlled Change | 开发开始后对 Baseline 的受控修改 | 是，但必须记录影响与批准 |
| Release Review | 上线后根据真实问题回填，形成下一版 Baseline | 否，作为下一周期输入 |

冻结含义：

- Frozen/Baseline 表示“可以作为开发依据”，不是永远不能改。
- Baseline 后修改公共组件、接口字段、权限码、错误码、Design Token、目录边界、状态模型、金额精度或验收门禁，必须走任务治理与验收主题文档的受控变更流程。
- 前端通用 spec 应在 Sprint 0、技术方案评审或首个垂直切片完成后冻结为 v1.0。
- 需求级 spec 应在需求进入开发前冻结。
- 公共组件 spec 应在首次公共复用前冻结。
- 接口 spec 应在联调前冻结。

## 开发后 Spec Update Review

- 每次开发完成后、任务关闭或收口（closeout）流程前，MUST 进行一次 Spec Update Review。
- 若本次任务产生可复用规则、约定、坑点、接口契约、组件边界、目录规则、测试门禁或 AI 误改防护，MUST 更新对应 spec。
- 若没有新知识，MUST 明确记录“本次无需更新 spec”及原因。
- Spec Update Review 的输出属于验收证据；不得把归档、收口、发布记录当成 spec review 的替代品。

## 优先级定义

| 等级 | 含义 | 执行规则 |
|---|---|---|
| P0 | 治理、安全、环境和跨层契约底座 | 默认激活；失败即阻塞开发或放行 |
| P1 | 核心架构、数据、UI 和高频工程协议 | 命中场景时强制激活；不得降级为建议 |
| P2 | 发布、运营、兼容和协作完善协议 | 命中场景时强制执行；未命中可不激活 |

P2 表示默认激活优先级较低，不表示协议中的 MUST 可以忽略。

## 单个主题文档标准结构

每个主题文档 MUST 使用以下标题和顺序：

1. `Scope`：本协议负责什么。
2. `Non-Scope`：本协议不负责什么。
3. `Terms`：关键术语及唯一含义。
4. `MUST`：可验证的强制规则。
5. `MUST NOT`：可验证的禁止规则。
6. `SHOULD`：有适用条件的推荐规则。
7. `Contract`：接口、组件、状态、字段、目录或行为契约。
8. `Checklist`：开发和验收检查项。
9. `Examples`：符合协议的推荐示例；示例正文 MUST 放在 `### 内容示例，可删除` 三级标题下。
10. `Anti-patterns`：违反协议的示例及风险。
11. `Ownership`：负责人、维护模块和裁决边界。
12. `Change Policy`：兼容、废弃、迁移、评审和通知规则。

结构约束：

- 标题名称和顺序固定，不得使用近义标题替代；语言/栈节（若在座）置于 12 节之后的独立 H2 区。
- 某节不适用时保留标题并写 `N/A` 及原因。
- MUST、MUST NOT 和 Contract 必须可由审查、自动化、测试或明确证据验证。
- Examples 与 Anti-patterns 必须共同说明正确和错误边界。
- `### 内容示例，可删除` 是模板提示，不是协议规则；项目落地时可删除、替换或改写示例，AI 不得把示例中的字段、路径、组件名或业务行为当作已确认事实。
- 新建、重写和评审主题文档时，结构完整性属于强制门禁。

## 协议冲突优先级

1. 项目特定协议 > 通用协议。
2. 前后端正式接口契约 > Mock 数据。
3. Design Token > 单页设计稿中的临时样式。
4. 公共组件 API 文档 > 页面内临时封装。
5. 安全协议 > 交互便利性。
6. 后端鉴权结果 > 前端权限显示。
7. 已发布变更公告 > 历史示例代码。

冲突裁决：

- 项目协议需要放宽通用协议时，必须记录原因、风险、负责人和有效期。
- 同优先级规则冲突时停止实现，由对应 Ownership 负责人裁决。
- 低优先级 Mock、示例、临时样式和页面封装不得反向修改高优先级契约。
- 裁决后必须更新产生歧义的协议或契约，不能只保留口头说明。

## 维护 spec：主题 → 主题文档路由表

**要给本项目补充/修改规则时，MUST 就地编辑下表命中的主题文档对应章节，MUST NOT 新建平行文件。**
把规则写进目标主题文档的 `MUST` / `MUST NOT` / `SHOULD` / `Contract` / `Checklist` 章节；技术栈特有规则进 `stacks/<slug>/<slug>-overlay.md`。

**前端关键词：**

| 你要维护的主题（关键词） | 就地编辑这个主题文档 |
|---|---|
| 开发流程、改动范围、提交前自检、验证证据 | `themes/task-governance-and-acceptance.md` |
| AI 生成代码、复用、临场发明、事实核对 | `themes/ai-generated-code.md` |
| Review、提测、上线门禁、验收标准 | `themes/task-governance-and-acceptance.md` |
| 登录鉴权、XSS/CSRF、敏感数据、文件上传下载 | `themes/security.md` |
| 环境变量、API base、Mock 开关、构建配置 | `themes/environment-and-configuration.md` |
| 公共变更、破坏性改动、废弃迁移、兼容窗口 | `themes/task-governance-and-acceptance.md` |
| 前后端契约、幂等、并发、接口版本、错误码约定 | `themes/api-contract-and-error-semantics.md` |
| Owner、RACI、评审与裁决边界 | `themes/task-governance-and-acceptance.md` |
| 目录职责、模块依赖方向、公开入口 | `themes/architecture-and-module-boundaries.md` |
| TypeScript、Lint、契约测试、CI、ADR | `themes/engineering-toolchain-and-dependencies.md` |
| 依赖包管理、锁文件、供应链审查 | `themes/engineering-toolchain-and-dependencies.md` |
| 业务规则、领域状态流转、后端兜底 | `themes/value-semantics-and-domain-data.md` |
| 金额、币种、精度、舍入、汇总（如 4c2d） | `themes/value-semantics-and-domain-data.md` |
| DTO、Adapter、Domain Model、ViewModel 分层 | `themes/value-semantics-and-domain-data.md` |
| 请求封装、HTTP client、取消、重试、错误归一化 | `themes/api-contract-and-error-semantics.md` |
| 错误分类、错误呈现、错误边界、恢复策略 | `themes/api-contract-and-error-semantics.md` |
| 菜单/页面/按钮/字段/数据范围权限 | `themes/permission-and-authorization.md` |
| 状态分层（local/page/global/server/url/form）、状态库选型 | `themes/frontend-state-and-client-data.md` |
| 缓存 key、缓存隔离、刷新与失效 | `themes/frontend-state-and-client-data.md` |
| 单元/组件/契约/E2E/视觉/性能测试 | `themes/testing-and-verification.md` |
| 设计 token、组件视觉规范、设计合法性 | `themes/ui-presentation-and-design.md` |
| 主题切换、暗色模式、token 持久化 | `themes/ui-presentation-and-design.md` |
| 键盘、焦点、语义化、读屏、对比度 | `themes/ui-presentation-and-design.md` |
| 组件分层、复用、Props/Events/Slots、组件体积 | `themes/ui-presentation-and-design.md` |
| Page Contract、页面类型、区域顺序、页面骨架 | `themes/page-composition-and-browser-environment.md` |
| CSS 方案、尺寸、溢出、层级、响应式断点 | `themes/ui-presentation-and-design.md` |
| loading/empty/error/partial/offline 渲染态 | `themes/page-composition-and-browser-environment.md` |
| 表单模型、校验、提交、草稿、冲突处理 | `themes/page-composition-and-browser-environment.md` |
| 路由、URL 状态、返回恢复、异常页面 | `themes/page-composition-and-browser-environment.md` |
| 表格/Grid、分页、排序、筛选、虚拟滚动 | `themes/ui-presentation-and-design.md` |
| 性能预算、首屏、包体积、懒加载 | `themes/performance-and-capacity.md` |
| 文件导入导出、Excel、大文件、模板 | `themes/frontend-state-and-client-data.md` |
| 发布、版本号、回滚 | `themes/release-and-feature-flags.md` |
| 前端运行监控、结构化日志、技术 telemetry、链路追踪、错误/白屏、RUM 采集、告警 | `themes/observability-and-analytics.md` |
| 业务行为事件、漏斗、埋点 schema、去重、同意/授权、分析用途 | `themes/observability-and-analytics.md` |
| LCP/INP/CLS、性能预算、RUM 统计口径、p75/p95/p99 | `themes/performance-and-capacity.md` |
| Mock 数据、契约漂移、mock 生命周期 | `themes/testing-and-verification.md` |
| Feature flag、灰度、开关清理 | `themes/release-and-feature-flags.md` |
| 浏览器/设备兼容矩阵、polyfill | `themes/page-composition-and-browser-environment.md` |
| i18n、多语言、格式化器（日期/数字/货币/空值） | `themes/internationalization-and-copywriting.md` |
| 文案、术语表、提示语口径 | `themes/internationalization-and-copywriting.md` |
| 埋点、指标定义、数据分析 | `themes/observability-and-analytics.md` |
| 设计稿交付、还原验收、切图资源 | `themes/page-composition-and-browser-environment.md` |
| 浏览器生命周期、可见性、卸载、资源释放 | `themes/page-composition-and-browser-environment.md` |
| 时间、时区、日期语义、Temporal | `themes/value-semantics-and-domain-data.md` |
| 隐私、数据最小化、留存与删除 | `themes/privacy-and-data-lifecycle.md` |
| localStorage/sessionStorage/IndexedDB/Cookie | `themes/frontend-state-and-client-data.md` |

**后端关键词：**

| 你要维护的主题（关键词） | 就地编辑这个主题文档 |
|---|---|
| 架构治理、架构决策、ADR | `themes/architecture-and-module-boundaries.md` |
| 工程结构、模块划分、包组织 | `themes/architecture-and-module-boundaries.md` |
| 目录边界、依赖方向 | `themes/architecture-and-module-boundaries.md` |
| 分层架构、Controller/Service/Repository 职责 | `themes/architecture-and-module-boundaries.md` |
| 任务流程、开发工作流 | `themes/task-governance-and-acceptance.md` |
| AI 生成代码约束 | `themes/ai-generated-code.md` |
| 证据、验收标准 | `themes/task-governance-and-acceptance.md` |
| 契约变更、破坏性改动、兼容窗口 | `themes/task-governance-and-acceptance.md` |
| Owner、角色责任 | `themes/task-governance-and-acceptance.md` |
| 认证授权、加密、注入防护、安全边界 | `themes/security.md` |
| 环境变量、配置中心、多环境 | `themes/environment-and-configuration.md` |
| API 契约、OpenAPI、REST 风格、版本 | `themes/api-contract-and-error-semantics.md` |
| 隐私、数据留存与删除、脱敏 | `themes/privacy-and-data-lifecycle.md` |
| 业务规则、领域状态机 | `themes/data-and-transactions.md` |
| 实体、DTO、领域模型、字段语义 | `themes/data-and-transactions.md` |
| 错误码、异常体系、错误响应 | `themes/api-contract-and-error-semantics.md` |
| 权限模型、RBAC、数据范围 | `themes/permission-and-authorization.md` |
| 数据库 schema、migration、Flyway/Liquibase | `themes/data-and-transactions.md` |
| SQL、索引、慢查询、查询优化 | `themes/data-and-transactions.md` |
| 事务边界、传播行为、回滚 | `themes/data-and-transactions.md` |
| 并发、锁、乐观/悲观锁、竞态 | `themes/data-and-transactions.md` |
| 幂等、重复请求、去重 | `themes/data-and-transactions.md` |
| 缓存、Redis 一致性、缓存失效 | `themes/data-and-transactions.md` |
| 外部集成、熔断、降级、重试、超时 | `themes/integration-and-async-runtime.md` |
| 异步任务、定时调度、消息消费 | `themes/integration-and-async-runtime.md` |
| 构建工具、静态检查、CI | `themes/engineering-toolchain-and-dependencies.md` |
| 依赖管理、供应链安全 | `themes/engineering-toolchain-and-dependencies.md` |
| 单元/集成/契约测试、覆盖率 | `themes/testing-and-verification.md` |
| 日志、链路追踪、可观测性、指标 | `themes/observability-and-analytics.md` |
| 性能、容量、压测、限流 | `themes/performance-and-capacity.md` |
| 运行时、部署、容器、健康检查 | `themes/integration-and-async-runtime.md` |
| 发布、版本、回滚 | `themes/release-and-feature-flags.md` |
| 语言/框架/中间件特有细则（Java、Spring、MyBatis、MySQL、Redis、Nginx…） | `stacks/<slug>/<slug>-overlay.md` |

只有当一条规则在上表与所有 overlay 里**找不到任何归属主题**时，才允许提议新增主题文档；这属于协议架构变更，必须走任务治理与验收主题文档的受控变更流程，并同步本路由表与「主题地图」，保持双向索引完整。

重跑播种（init）默认只补齐缺失文件、不覆盖已存在的文档，所以就地维护不会被覆盖。

## 主题地图

| 主题文档 | lane | 来源 | 核心职责 |
|---|---|---|---|
| `architecture-and-module-boundaries.md` | 前端+后端 | FE 09 + BE 01/02/03/04 | 架构边界与 ADR、项目结构分区、目录依赖方向、分层职责 |
| `task-governance-and-acceptance.md` | 前端+后端 | FE 01/03/06/08 + BE 05/07/08/09 | 开发动作与验证证据、验收门禁、公共变更治理、Owner 与 RACI、后端任务工作流与证据验收 |
| `ai-generated-code.md` | 前端+后端 | FE 02 + BE 06 | AI 预检、复用、边界、事实和验证 |
| `security.md` | 前端+后端 | FE 04 + BE 10 | 认证、XSS、敏感数据、文件和安全边界 |
| `environment-and-configuration.md` | 前端+后端 | FE 05 + BE 11 | 环境、变量、API base、Mock、日志和配置；secret 与配置漂移 |
| `engineering-toolchain-and-dependencies.md` | 前端+后端 | FE 10/11 + BE 26/27 | 类型、Lint、契约测试、CI、ADR；包管理、锁文件、依赖与供应链 |
| `testing-and-verification.md` | 前端+后端 | FE 20/35 + BE 28 | 单元、组件、契约、E2E、视觉和性能测试；契约 Mock；风险导向测试 |
| `observability-and-analytics.md` | 前端+后端 | FE 34/40 + BE 29 | 运行日志、技术遥测、错误/白屏、Trace、RED、RUM 采集和告警；行为事件与埋点 schema；指标与追踪 |
| `release-and-feature-flags.md` | 前端+后端 | FE 33/36 + BE 32 | 版本、灰度、发布、回滚；Feature Flag；发布与恢复 |
| `privacy-and-data-lifecycle.md` | 前端+后端 | FE 44 + BE 13 | 数据最小化、目的、用户控制、保留和清理 |
| `api-contract-and-error-semantics.md` | 前端+后端 | FE 07/15/16 + BE 12/16 | 前后端正式契约、请求封装、错误处理；API 兼容契约与错误码 |
| `permission-and-authorization.md` | 前端+后端 | FE 17 + BE 17 | 菜单/页面/按钮/字段/数据范围权限；权限模型、RBAC、租户与数据范围 |
| `performance-and-capacity.md` | 前端+后端 | FE 31 + BE 30 | 性能预算、首屏、包体积、懒加载；容量证据与压测 |
| `ui-presentation-and-design.md` | 前端 | FE 21/22/23/24/26/30 | Token、主题、可访问性、组件、样式布局、数据表格 |
| `page-composition-and-browser-environment.md` | 前端 | FE 25/27/28/29/37/41/42 | Page Contract、渲染态、表单、路由 URL、浏览器兼容、设计交付、浏览器运行时生命周期 |
| `frontend-state-and-client-data.md` | 前端 | FE 18/19/32/45 | 状态分层与状态库、缓存 key、文件导入导出、客户端存储 |
| `value-semantics-and-domain-data.md` | 前端 | FE 12/13/14/43 | 业务规则、金额精度、数据模型、时间语义 |
| `internationalization-and-copywriting.md` | 前端 | FE 38/39 | i18n、locale、格式化、翻译工作流；文案与术语表 |
| `data-and-transactions.md` | 后端 | BE 14/15/18/19/20/21/22/23 | 业务规则与状态机、边界模型、schema 迁移、SQL 与索引、事务边界、并发锁、幂等、缓存一致性 |
| `integration-and-async-runtime.md` | 后端 | BE 24/25/31 | 外部集成韧性、异步任务与调度、运行时与部署 |

## 默认激活基线

前端（P0 底座）默认激活：

```text
themes/task-governance-and-acceptance.md（FE 01/03/06/08）
themes/ai-generated-code.md（FE 02）
themes/security.md（FE 04）
themes/architecture-and-module-boundaries.md（FE 09）
themes/engineering-toolchain-and-dependencies.md（FE 10）
themes/privacy-and-data-lifecycle.md（FE 44）
```

环境、API 或运行行为相关任务追加 `themes/environment-and-configuration.md` 与 `themes/api-contract-and-error-semantics.md`。

后端默认激活面严格只有以下 5 个基线协议所在主题；实际命中按任务特征（见「任务命中矩阵」）继续收窄：

```text
themes/task-governance-and-acceptance.md（BE 05/07/08）
themes/ai-generated-code.md（BE 06）
themes/architecture-and-module-boundaries.md（BE 03）
```

| Stage | 建议纳入上下文 |
|---|---|
| prepare | task governance、AI generated code、contract change、evidence acceptance |
| implement | task governance、AI generated code、architecture（目录边界）、contract change |
| check | task governance 加全部基线协议所在主题 |
| release | task governance、contract change、evidence acceptance |

## 按任务追加激活（前端）

| 任务类型 | 建议追加的主题文档 |
|---|---|
| 新增/升级/删除依赖 | `engineering-toolchain-and-dependencies`、`testing-and-verification`、`release-and-feature-flags` |
| 业务规则、状态流转 | `value-semantics-and-domain-data`、`api-contract-and-error-semantics`、`permission-and-authorization`、`testing-and-verification` |
| 金额、比例、报表 | `value-semantics-and-domain-data`、`testing-and-verification` |
| API、联调、认证、错误 | `environment-and-configuration`、`api-contract-and-error-semantics`、`value-semantics-and-domain-data`、`permission-and-authorization`、`frontend-state-and-client-data`、`testing-and-verification`、`page-composition-and-browser-environment` |
| 新建/修改页面 | `ui-presentation-and-design`、`page-composition-and-browser-environment`、`performance-and-capacity`、`internationalization-and-copywriting` |
| 新建/修改组件 | `ui-presentation-and-design`、`page-composition-and-browser-environment`、`performance-and-capacity` |
| 宽表、报表、列宽 | `frontend-state-and-client-data`、`testing-and-verification`、`ui-presentation-and-design`、`page-composition-and-browser-environment`、`performance-and-capacity` |
| 表单和编辑流程 | `value-semantics-and-domain-data`、`api-contract-and-error-semantics`、`permission-and-authorization`、`frontend-state-and-client-data`、`ui-presentation-and-design`、`page-composition-and-browser-environment` |
| 导入导出和异步任务 | `security`、`api-contract-and-error-semantics`、`permission-and-authorization`、`frontend-state-and-client-data`、`testing-and-verification`、`performance-and-capacity`、`observability-and-analytics`、`page-composition-and-browser-environment` |
| 发布、灰度、回滚 | `task-governance-and-acceptance`、`security`、`environment-and-configuration`、`testing-and-verification`、`release-and-feature-flags`、`observability-and-analytics` |
| 埋点和用户行为 | `security`、`task-governance-and-acceptance`、`observability-and-analytics`、`privacy-and-data-lifecycle` |
| 可观测性、链路追踪、告警、埋点、RUM | `task-governance-and-acceptance`、`performance-and-capacity`、`observability-and-analytics`、`privacy-and-data-lifecycle` |
| 日期、时间、时区、日程 | `api-contract-and-error-semantics`、`value-semantics-and-domain-data`、`testing-and-verification`、`page-composition-and-browser-environment`、`internationalization-and-copywriting` |
| 定时器、监听、订阅、实时连接、Worker | `api-contract-and-error-semantics`、`frontend-state-and-client-data`、`testing-and-verification`、`performance-and-capacity`、`observability-and-analytics`、`page-composition-and-browser-environment` |
| Cookie、Web Storage、IndexedDB、离线缓存 | `security`、`frontend-state-and-client-data`、`testing-and-verification`、`privacy-and-data-lifecycle` |
| 个人信息、敏感权限、第三方 SDK | `security`、`task-governance-and-acceptance`、`testing-and-verification`、`observability-and-analytics`、`privacy-and-data-lifecycle`、`frontend-state-and-client-data` |

同一任务命中多行时取并集；主题文档名为查表词形，实际激活以主题文档全文与来源协议语义 ID 为准。

## 任务命中矩阵（后端）

| 任务特征 | 建议命中的协议特征 |
|---|---|
| 架构、技术栈或部署形态选择 | 显式展开 `architecture-and-module-boundaries.md`，并命中 `project-structure`、`layering`、`environment-configuration`、`build`、`dependency`、`performance`、`runtime`、`release` |
| 新增或修改 API | `api-contract`、`data-model`、`error-code`、`data-scope`、`idempotency`、`testing`、`observability`、`release` |
| 业务规则或状态流转 | `layering`、`business-rules`、`state-transition`、`data-model`、`error-code`、`data-scope`、`transaction`、`concurrency`、`testing` |
| 数据库结构或迁移 | `database-schema`、`migration`、`sql`、`transaction`、`concurrency`、`testing`、`observability`、`rollback` |
| 查询、分页、报表或导出 | `api-contract`、`data-model`、`data-scope`、`query`、`pagination`、`cache`、`testing`、`performance` |
| 事务写流程 | `business-rules`、`error-code`、`transaction`、`concurrency`、`idempotency`、`external-integration`、`testing`、`observability` |
| Redis 或缓存变更 | `environment-configuration`、`concurrency`、`idempotency`、`redis`、`testing`、`observability`、`capacity` |
| 外部系统集成 | `environment-configuration`、`api-contract`、`error-code`、`idempotency`、`external-integration`、`resilience`、`async-job`、`testing`、`observability` |
| 导入、导出或异步任务 | `api-contract`、`error-code`、`data-scope`、`idempotency`、`cache`、`async-job`、`scheduler`、`testing`、`observability`、`performance` |
| 认证、权限或敏感数据 | `security`、`authentication`、`sensitive-data`、`privacy`、`error-code`、`data-scope`、`testing`、`observability` |
| 运行时、部署或配置 | `environment-configuration`、`external-integration`、`deployment`、`observability`、`performance`、`release` |
| 依赖升级 | `build`、`dependency`、`supply-chain`、`testing`、`performance`、`release` |
| 发布、灰度或回滚 | `environment-configuration`、`testing`、`observability`、`performance`、`deployment`、`release`、`rollback` |

矩阵只产生候选特征；实际纳入由 `pomaster context compile --role <role>` 投影承载（Overlay 依赖与冲突按「协议冲突优先级」收窄），纳入/排除决策可经 `pomaster context explain` 逐条审计。

## 重复职责边界

前端：

- 前后端通信协议（FE 07）定义上游正式契约；请求协议（FE 15）定义契约进入前端后的实现——两源同在 `api-contract-and-error-semantics.md`。
- 业务规则协议（FE 12）定义模型上的领域判断；数据模型协议（FE 14）定义 DTO 到稳定模型的转换——两源同在 `value-semantics-and-domain-data.md`。
- 错误处理协议（FE 16）定义呈现与恢复；监控与日志协议（FE 34，`observability-and-analytics.md`）定义运行诊断的采集、关联、传输与告警。
- 权限协议（FE 17）定义界面表现；安全协议（FE 04/BE 10）和后端鉴权定义最终边界。
- FE 34（`observability-and-analytics.md`）是运行可观测性的主权威，覆盖结构化日志、技术 telemetry、Trace/Span/Breadcrumb、RED、错误/白屏、RUM 采集、告警和 SDK fail-open；FE 40 只定义业务行为事件、漏斗、事件 schema、去重、同意/授权和分析用途；FE 31（`performance-and-capacity.md`）只定义 LCP/INP/CLS 等性能预算、RUM 统计口径和分位数。
- Design System（FE 21）定义 token 语义；Theme（FE 22）定义不同主题下的 token 值——两源同在 `ui-presentation-and-design.md`。
- 页面结构（FE 25，`page-composition-and-browser-environment.md`）定义区域；样式布局（FE 26，`ui-presentation-and-design.md`）定义尺寸与溢出；组件协议（FE 24）定义局部 API。
- 测试协议（FE 20）定义怎么验证；验收门禁（FE 03，`task-governance-and-acceptance.md`）定义证据是否足以放行。
- Mock（FE 35，`testing-and-verification.md`）只能实现正式契约场景，不能反向定义契约。
- 运行时资源生命周期（FE 42，`page-composition-and-browser-environment.md`）定义资源如何取得、暂停和释放；性能协议（FE 31）定义预算，状态协议（FE 18，`frontend-state-and-client-data.md`）定义数据归属。
- 时间协议（FE 43，`value-semantics-and-domain-data.md`）定义日期、时间点和时区的机器语义；国际化协议（FE 38，`internationalization-and-copywriting.md`）定义面向用户的本地化显示。
- 隐私协议（FE 44）定义数据是否必要、用于何种目的及何时清理；安全协议定义如何防止未授权访问和攻击。
- 浏览器存储协议（FE 45）定义介质、迁移、配额和隔离；缓存协议（FE 19）定义远端数据的新鲜度和失效——两源同在 `frontend-state-and-client-data.md`。

后端：

- 安全规则优先于便利性；最终服务端授权优先于客户端展示。
- 正式 API、schema、消息和配置契约优先于 Mock、历史示例和聊天记录。
- 业务规则协议（BE 14）定义权威语义；数据模型协议（BE 15）只定义边界转换——两源同在 `data-and-transactions.md`。
- 错误码协议（BE 16，`api-contract-and-error-semantics.md`）定义调用方语义；可观测性协议（BE 29）定义内部诊断与审计信号。
- 事务协议（BE 20）定义原子边界；并发协议（BE 21）定义竞争、锁与冲突——两源同在 `data-and-transactions.md`。
- 测试协议（BE 28，`testing-and-verification.md`）选择验证方式；证据协议（BE 07，`task-governance-and-acceptance.md`）决定声明与门禁是否成立。
- Stack Overlay 只能收紧或具体化主题文档规则，不能保存项目事实或放宽底线。

## 维护规则

主题文档集合、来源协议语义 ID 与 vendor 路径、overlay 能力词形只追加不重排。新增或修改规则必须同步对应主题文档、本导航、播种清单与 catalog 锁校验；废弃规则必须提供替代 ID、兼容窗口和迁移说明。
