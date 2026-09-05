---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/index.md
seed_source_sha256: 37fc443ce1f90eaa2584a82e12300d8281760332ec69d55a52b26cb22a2b2375
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 通用前端工程协作协议总入口

> 本目录是框架无关的前端 hard spec。它不规定 Vue、React 或 Svelte 的写法，只规定前端开发必须具备的治理、契约、工程、体验和交付规则。

## 目录结构硬约束

- 本目录当前包含 `01`–`45` 共 45 个编号协议，另有一个不计入协议数的 `index.md`。
- 优先级由协议地图中的 P0/P1/P2 决定，不由编号推断。已发布编号与文件名 append-only；新增协议追加新编号，不重排既有文件。
- 文档 ID 是稳定身份。内部引用 MUST 使用 `universal:<semantic-id>`，不得只引用数字。
- 新增、废弃、合并或拆分属于协议架构变更，必须更新索引、注入矩阵、职责边界和目录验证；已发布文件先废弃和迁移，不得静默删除或复用其 ID。

## 通用规则准入与维护来源

规则进入 universal 前必须同时满足：

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

## 使用方式

使用本目录时：

1. 默认注入 P0 基线和任务命中的专项协议。
2. 已确认规则写成 MUST / MUST NOT / SHOULD 和具体 Contract。
3. 暂未决策项保留 `TODO_CONFIRM`，AI 不得在代码中临场发明。
4. 开发结束按验收门禁提供证据，而不是只声明“已完成”。

## Pre-Development Checklist

- [ ] 确认 `.pomaster/specs/hard/frontend/` 已安装并通过本目录的双向索引校验；项目事实和项目选型写入独立项目 overlay，不修改 universal 文件。
- [ ] 读取「默认注入基线」，再按「按任务追加注入」选择本次命中的协议；多行命中取并集。
- [ ] 使用 semantic ID 记录选择理由，不用编号代替协议身份。
- [ ] 所选协议（semantic ID 形态）以 vNext 上下文投影承载：`pomaster context compile --role <role>` 按 role/capability applicability 检索激活；不得修改 pomaster 工具、hook 或配置来实现自动加载。
- [ ] 开发前声明本次命中的 MUST/MUST NOT、需要项目确认的阈值/选型和验证方式。
- [ ] 若 universal 与项目 overlay 冲突，按「协议冲突优先级」停止并记录裁决，不在代码中临场发明。

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
- Baseline 后修改公共组件、接口字段、权限码、错误码、Design Token、目录边界、状态模型、金额精度或验收门禁，必须走 `universal:change-governance-protocol` 的受控变更流程。
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
| P0 | 治理、安全、环境和跨层契约底座 | 默认注入；失败即阻塞开发或放行 |
| P1 | 核心架构、数据、UI 和高频工程协议 | 命中场景时强制注入；不得降级为建议 |
| P2 | 发布、运营、兼容和协作完善协议 | 命中场景时强制执行；未命中可不注入 |

P2 表示默认注入优先级较低，不表示协议中的 MUST 可以忽略。

## 单个协议文件标准结构

每个协议文件 MUST 使用以下标题和顺序：

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

- 标题名称和顺序固定，不得使用近义标题替代。
- 某节不适用时保留标题并写 `N/A` 及原因。
- MUST、MUST NOT 和 Contract 必须可由审查、自动化、测试或明确证据验证。
- Examples 与 Anti-patterns 必须共同说明正确和错误边界。
- `### 内容示例，可删除` 是模板提示，不是协议规则；项目落地时可删除、替换或改写示例，AI 不得把示例中的字段、路径、组件名或业务行为当作已确认事实。
- 新建、重写和评审协议时，结构完整性属于强制门禁。

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

## 维护 spec：主题 → 协议路由表

**要给本项目补充/修改前端规则时，MUST 就地编辑下表命中的编号协议文件，MUST NOT 新建平行文件。**
把规则写进目标文件的 `MUST` / `MUST NOT` / `SHOULD` / `Contract` / `Checklist` 章节。

| 你要维护的主题（关键词） | 就地编辑这个文件 |
|---|---|
| 开发流程、改动范围、提交前自检、验证证据 | `01-development-checklist-protocol.md` |
| AI 生成代码、复用、临场发明、事实核对 | `02-ai-generated-code-protocol.md` |
| Review、提测、上线门禁、验收标准 | `03-acceptance-gate-protocol.md` |
| 登录鉴权、XSS/CSRF、敏感数据、文件上传下载 | `04-security-protocol.md` |
| 环境变量、API base、Mock 开关、构建配置 | `05-environment-configuration-protocol.md` |
| 公共变更、破坏性改动、废弃迁移、兼容窗口 | `06-change-governance-protocol.md` |
| 前后端契约、幂等、并发、接口版本、错误码约定 | `07-frontend-backend-communication-protocol.md` |
| Owner、RACI、评审与裁决边界 | `08-role-responsibility-protocol.md` |
| 目录职责、模块依赖方向、公开入口 | `09-module-boundary-protocol.md` |
| TypeScript、Lint、契约测试、CI、ADR | `10-engineering-tooling-protocol.md` |
| 依赖包管理、锁文件、供应链审查 | `11-dependency-package-management-protocol.md` |
| 业务规则、领域状态流转、后端兜底 | `12-business-rules-protocol.md` |
| 金额、币种、精度、舍入、汇总（如 4c2d） | `13-monetary-precision-protocol.md` |
| DTO、Adapter、Domain Model、ViewModel 分层 | `14-data-model-protocol.md` |
| 请求封装、HTTP client、取消、重试、错误归一化 | `15-request-api-protocol.md` |
| 错误分类、错误呈现、错误边界、恢复策略 | `16-error-handling-protocol.md` |
| 菜单/页面/按钮/字段/数据范围权限 | `17-permission-protocol.md` |
| 状态分层（local/page/global/server/url/form）、状态库选型 | `18-state-management-protocol.md` |
| 缓存 key、缓存隔离、刷新与失效 | `19-cache-protocol.md` |
| 单元/组件/契约/E2E/视觉/性能测试 | `20-testing-protocol.md` |
| 设计 token、组件视觉规范、设计合法性 | `21-design-system-protocol.md` |
| 主题切换、暗色模式、token 持久化 | `22-theme-protocol.md` |
| 键盘、焦点、语义化、读屏、对比度 | `23-accessibility-protocol.md` |
| 组件分层、复用、Props/Events/Slots、组件体积 | `24-component-protocol.md` |
| Page Contract、页面类型、区域顺序、页面骨架 | `25-page-structure-protocol.md` |
| CSS 方案、尺寸、溢出、层级、响应式断点 | `26-style-layout-protocol.md` |
| loading/empty/error/partial/offline 渲染态 | `27-rendering-state-protocol.md` |
| 表单模型、校验、提交、草稿、冲突处理 | `28-form-protocol.md` |
| 路由、URL 状态、返回恢复、异常页面 | `29-routing-url-protocol.md` |
| 表格/Grid、分页、排序、筛选、虚拟滚动 | `30-data-grid-protocol.md` |
| 性能预算、首屏、包体积、懒加载 | `31-performance-protocol.md` |
| 文件导入导出、Excel、大文件、模板 | `32-file-import-export-protocol.md` |
| 发布、版本号、回滚 | `33-release-versioning-protocol.md` |
| 前端运行监控、结构化日志、技术 telemetry、链路追踪、错误/白屏、RUM 采集、告警 | `34-monitoring-logging-protocol.md` |
| 业务行为事件、漏斗、埋点 schema、去重、同意/授权、分析用途 | `40-analytics-protocol.md` |
| LCP/INP/CLS、性能预算、RUM 统计口径、p75/p95/p99 | `31-performance-protocol.md` |
| Mock 数据、契约漂移、mock 生命周期 | `35-mock-protocol.md` |
| Feature flag、灰度、开关清理 | `36-feature-flag-protocol.md` |
| 浏览器/设备兼容矩阵、polyfill | `37-browser-device-compatibility-protocol.md` |
| i18n、多语言、格式化器（日期/数字/货币/空值） | `38-internationalization-protocol.md` |
| 文案、术语表、提示语口径 | `39-copywriting-protocol.md` |
| 埋点、指标定义、数据分析 | `40-analytics-protocol.md` |
| 设计稿交付、还原验收、切图资源 | `41-design-handoff-protocol.md` |
| 浏览器生命周期、可见性、卸载、资源释放 | `42-browser-runtime-lifecycle-protocol.md` |
| 时间、时区、日期语义、Temporal | `43-time-temporal-protocol.md` |
| 隐私、数据最小化、留存与删除 | `44-privacy-data-lifecycle-protocol.md` |
| localStorage/sessionStorage/IndexedDB/Cookie | `45-browser-storage-protocol.md` |

只有当一条规则在上表里**找不到任何归属主题**时，才允许新增协议文件；此时必须同步下方「协议地图」
与任务注入矩阵，保持双向索引完整。

重跑注入默认只补齐缺失文件、不覆盖已存在的协议，所以就地维护不会被覆盖。

## 协议地图

| 编号 | 优先级 | 文档 id | 固定文件名 | 核心职责 |
|---:|:---:|---|---|---|
| 01 | P0 | `universal:development-checklist-protocol` | `01-development-checklist-protocol.md` | 开发动作、范围、同步和验证证据 |
| 02 | P0 | `universal:ai-generated-code-protocol` | `02-ai-generated-code-protocol.md` | AI 预检、复用、边界、事实和验证 |
| 03 | P0 | `universal:acceptance-gate-protocol` | `03-acceptance-gate-protocol.md` | Review、提测、上线门禁 |
| 04 | P0 | `universal:security-protocol` | `04-security-protocol.md` | 认证、XSS、敏感数据、文件和安全边界 |
| 05 | P0 | `universal:environment-configuration-protocol` | `05-environment-configuration-protocol.md` | 环境、变量、API、Mock、日志和配置 |
| 06 | P0 | `universal:change-governance-protocol` | `06-change-governance-protocol.md` | 公共变更、影响、兼容、废弃和迁移 |
| 07 | P0 | `universal:frontend-backend-communication-protocol` | `07-frontend-backend-communication-protocol.md` | 前后端正式契约、幂等、并发和版本 |
| 08 | P0 | `universal:role-responsibility-protocol` | `08-role-responsibility-protocol.md` | Owner、RACI、评审和裁决边界 |
| 09 | P0 | `universal:module-boundary-protocol` | `09-module-boundary-protocol.md` | 目录职责、依赖方向和公开入口 |
| 10 | P0 | `universal:engineering-tooling-protocol` | `10-engineering-tooling-protocol.md` | 类型、Lint、契约、测试、CI 和 ADR |
| 11 | P1 | `universal:dependency-package-management-protocol` | `11-dependency-package-management-protocol.md` | 包管理、锁文件、依赖评审和供应链 |
| 12 | P1 | `universal:business-rules-protocol` | `12-business-rules-protocol.md` | 领域规则、状态流转和后端兜底 |
| 13 | P1 | `universal:monetary-precision-protocol` | `13-monetary-precision-protocol.md` | 金额、币种、精度、舍入和汇总 |
| 14 | P1 | `universal:data-model-protocol` | `14-data-model-protocol.md` | DTO、Adapter、Domain Model、ViewModel |
| 15 | P1 | `universal:request-api-protocol` | `15-request-api-protocol.md` | 前端请求封装、取消、重试和错误归一化 |
| 16 | P1 | `universal:error-handling-protocol` | `16-error-handling-protocol.md` | 错误分类、呈现、边界和恢复 |
| 17 | P1 | `universal:permission-protocol` | `17-permission-protocol.md` | 菜单、页面、按钮、字段和数据范围 |
| 18 | P1 | `universal:state-management-protocol` | `18-state-management-protocol.md` | local/page/global/server/url/form 状态 |
| 19 | P1 | `universal:cache-protocol` | `19-cache-protocol.md` | 缓存 key、隔离、刷新和失效 |
| 20 | P1 | `universal:testing-protocol` | `20-testing-protocol.md` | 单元、组件、契约、E2E、视觉和性能测试 |
| 21 | P1 | `universal:design-system-protocol` | `21-design-system-protocol.md` | Token、组件视觉、状态和设计合法性 |
| 22 | P1 | `universal:theme-protocol` | `22-theme-protocol.md` | 主题 token、切换、持久化和第三方同步 |
| 23 | P1 | `universal:accessibility-protocol` | `23-accessibility-protocol.md` | 键盘、焦点、语义、读屏和对比度 |
| 24 | P1 | `universal:component-protocol` | `24-component-protocol.md` | 组件分层、复用、Props、Events、Slots |
| 25 | P1 | `universal:page-structure-protocol` | `25-page-structure-protocol.md` | Page Contract、页面类型和区域顺序 |
| 26 | P1 | `universal:style-layout-protocol` | `26-style-layout-protocol.md` | CSS、尺寸、溢出、层级和响应式 |
| 27 | P1 | `universal:rendering-state-protocol` | `27-rendering-state-protocol.md` | loading、empty、error、partial、offline |
| 28 | P1 | `universal:form-protocol` | `28-form-protocol.md` | 表单模型、校验、提交、草稿和冲突 |
| 29 | P1 | `universal:routing-url-protocol` | `29-routing-url-protocol.md` | 路由、URL 状态、返回恢复和异常页面 |
| 30 | P1 | `universal:data-grid-protocol` | `30-data-grid-protocol.md` | 表格壳、列宽、虚拟化、列配置和导出 |
| 31 | P1 | `universal:performance-protocol` | `31-performance-protocol.md` | 预算、分包、分页、虚拟化和并发 |
| 32 | P1 | `universal:file-import-export-protocol` | `32-file-import-export-protocol.md` | 文件、模板、导入、导出和任务结果 |
| 33 | P2 | `universal:release-versioning-protocol` | `33-release-versioning-protocol.md` | 版本、灰度、发布、回滚和 breaking change |
| 34 | P1 | `universal:monitoring-logging-protocol` | `34-monitoring-logging-protocol.md` | 运行日志、技术遥测、错误/白屏、Trace/Span、RED、RUM 采集和告警 |
| 35 | P2 | `universal:mock-protocol` | `35-mock-protocol.md` | 契约 Mock、异常、大数据和启停 |
| 36 | P2 | `universal:feature-flag-protocol` | `36-feature-flag-protocol.md` | 功能开关、灰度、关闭态和清理 |
| 37 | P2 | `universal:browser-device-compatibility-protocol` | `37-browser-device-compatibility-protocol.md` | 浏览器、设备、分辨率和缩放矩阵 |
| 38 | P2 | `universal:internationalization-protocol` | `38-internationalization-protocol.md` | i18n、locale、RTL、格式化、文案外置、ICU、翻译工作流、SSR hydration、第三方 SDK 本地化 |
| 39 | P2 | `universal:copywriting-protocol` | `39-copywriting-protocol.md` | 按钮、确认、错误、空态和风险文案 |
| 40 | P2 | `universal:analytics-protocol` | `40-analytics-protocol.md` | 行为事件、字段、时机、去重和隐私 |
| 41 | P2 | `universal:design-handoff-protocol` | `41-design-handoff-protocol.md` | 设计状态、组件来源、视口和验收交付 |
| 42 | P1 | `universal:browser-runtime-lifecycle-protocol` | `42-browser-runtime-lifecycle-protocol.md` | 监听、请求、Worker、长连接和页面生命周期资源释放 |
| 43 | P1 | `universal:time-temporal-protocol` | `43-time-temporal-protocol.md` | 时间点、日期、时区、持续时长和 Clock 语义 |
| 44 | P0 | `universal:privacy-data-lifecycle-protocol` | `44-privacy-data-lifecycle-protocol.md` | 数据最小化、目的、用户控制、保留和清理 |
| 45 | P1 | `universal:browser-storage-protocol` | `45-browser-storage-protocol.md` | 客户端存储选择、隔离、迁移、配额和清理 |

## 默认注入基线

使用本规范时默认注入：

```text
universal:index
universal:development-checklist-protocol
universal:ai-generated-code-protocol
universal:acceptance-gate-protocol
universal:security-protocol
universal:change-governance-protocol
universal:role-responsibility-protocol
universal:module-boundary-protocol
universal:engineering-tooling-protocol
universal:privacy-data-lifecycle-protocol
```

环境、API 或运行行为相关任务追加 `universal:environment-configuration-protocol` 和 `universal:frontend-backend-communication-protocol`。

## 按任务追加注入

| 任务类型 | 必须追加的协议 |
|---|---|
| 新增/升级/删除依赖 | 11、20、33 |
| 业务规则、状态流转 | 12、14、16、17、20 |
| 金额、比例、报表 | 12、13、14、20、43 |
| API、联调、认证、错误 | 05、07、14–19、35、42 |
| 新建/修改页面 | 21–29、31、37–39、41、42 |
| 新建/修改组件 | 21–24、26–28、31、41、42 |
| 宽表、报表、列宽 | 19、20、23、26、27、30、31 |
| 表单和编辑流程 | 12–19、23、28 |
| 导入导出和异步任务 | 04、07、16、17、19、20、31、32、34、35、42、45 |
| 发布、灰度、回滚 | 03–06、20、33、34、36 |
| 埋点和用户行为 | 04、08、34、40、44 |
| 可观测性、链路追踪、告警、埋点、RUM | 08、31、34、40、44 |
| 日期、时间、时区、日程 | 07、14、20、28、38、43 |
| 定时器、监听、订阅、实时连接、Worker | 15、18、20、31、34、42 |
| Cookie、Web Storage、IndexedDB、离线缓存 | 04、18、19、20、44、45 |
| 个人信息、敏感权限、第三方 SDK | 04、08、20、34、40、44、45 |

同一任务命中多行时取并集；数字用于查表，实际注入必须使用文档 ID。

## 重复职责边界

- 前后端通信协议定义上游正式契约；请求协议定义契约进入前端后的实现。
- 数据模型协议定义 DTO 到稳定模型的转换；业务规则协议定义模型上的领域判断。
- 错误处理协议定义呈现与恢复；监控与日志协议（34）定义运行诊断的采集、关联、传输与告警。
- 权限协议定义界面表现；安全协议和后端鉴权定义最终边界。
- `34-monitoring-logging-protocol` 是运行可观测性的主权威，覆盖结构化日志、技术 telemetry、Trace/Span/Breadcrumb、RED、错误/白屏、RUM 采集、告警和 SDK fail-open；`40-analytics-protocol` 只定义业务行为事件、漏斗、事件 schema、去重、同意/授权和分析用途；`31-performance-protocol` 只定义 LCP/INP/CLS 等性能预算、RUM 统计口径和分位数。
- Design System 定义 token 语义；Theme 定义不同主题下的 token 值。
- 页面结构定义区域；样式布局定义尺寸与溢出；组件协议定义局部 API。
- 测试协议定义怎么验证；验收门禁定义证据是否足以放行。
- Mock 只能实现正式契约场景，不能反向定义契约。
- 运行时资源生命周期定义资源如何取得、暂停和释放；性能协议定义预算，状态协议定义数据归属。
- 时间协议定义日期、时间点和时区的机器语义；国际化协议定义面向用户的本地化显示。
- 隐私协议定义数据是否必要、用于何种目的及何时清理；安全协议定义如何防止未授权访问和攻击。
- 浏览器存储协议定义介质、迁移、配额和隔离；缓存协议定义远端数据的新鲜度和失效。
