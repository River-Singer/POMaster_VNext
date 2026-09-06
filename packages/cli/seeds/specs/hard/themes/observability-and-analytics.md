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
legacy_id: theme:observability-and-analytics
criticality: standard # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: triggered # 聚合注记：来源同值；info 性注记非执行语义
stages: [implement, check, release] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [observability, logging, tracing] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/34-monitoring-logging-protocol.md
    sha256: 3c37c1c3aa3ade8d43532a1fcc7561e95aef42a19e46b6eb53d864054a2da013
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/40-analytics-protocol.md
    sha256: f638c8054ba32d44a15f1dd4fa42b637e1f6ad39cd73c6e1d45cd5bfd71b2c56
    seed_version: B6B-2
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/29-observability-logging-tracing-protocol.md
    sha256: e871f5d7d1e9fe68956881877baba94f376a5539753441853f8cfa12939f5ebd
    seed_version: B6C
---

# 可观测性与埋点

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 34 监控与日志协议（pomaster/components/frontend-hard-spec/assets/universal/34-monitoring-logging-protocol.md）**

P1。作为前端运行可观测性的主权威，定义结构化日志、技术遥测、错误与白屏、Trace/Span/Breadcrumb、RED 指标、RUM 采集、告警和遥测传输韧性。

**源：FE 40 埋点协议（pomaster/components/frontend-hard-spec/assets/universal/40-analytics-protocol.md）**

P2。作为业务行为分析的唯一权威，定义用户行为事件、关键业务动作、漏斗、事件 schema、上报时机、去重、同意/授权和分析用途。

**源：BE 29 可观测性、日志与追踪协议（pomaster/components/backend-hard-spec/assets/universal/29-observability-logging-tracing-protocol.md）**

规范日志、指标、TraceId、审计、告警和事故诊断证据。

## Non-Scope

**源：FE 34 监控与日志协议**

不替代后端审计、基础设施容量监控和具体 APM 厂商选型；业务行为事件、漏斗和分析用途归 `40-analytics-protocol`，LCP/INP/CLS 等性能预算、RUM 统计口径和分位数归 `31-performance-protocol`。不允许监控收集权限外数据。

**源：FE 40 埋点协议**

不替代错误监控、技术 telemetry、Trace/Span、RUM 运行诊断和后端审计；这些运行可观测性规则归 `34-monitoring-logging-protocol`。LCP/INP/CLS 等性能预算与分位数归 `31-performance-protocol`。不允许收集未批准敏感数据。

**源：BE 29 可观测性、日志与追踪协议**

不替代错误码、隐私、安全或具体监控平台配置。

## Terms

**源：FE 34 监控与日志协议**

- Error Event：可定位的运行失败记录。
- Trace：一次端到端请求的因果链，由 trace-id 贯穿。
- Span：Trace 内的单个操作单元，记录开始/结束时间、父关系和受控元数据。
- Breadcrumb：错误前的受控操作路径。
- RED 指标：Rate（请求率）、Errors（错误率）、Duration（耗时）。
- RUM：Real User Monitoring，采集真实用户设备、网络、性能和交互指标的运行监测方式。
- Source Map：映射压缩代码到源代码的受控文件。

**源：FE 40 埋点协议**

- Event Schema：事件名和字段契约。
- Funnel：按稳定业务阶段关联的一组行为事件，用于分析到达、转化、放弃和结果。
- OperationId：关联 attempt/result 的操作标识。
- Deduplication Key：防止重复上报的键。
- Consent State：当前用户对非必要分析采集的同意、拒绝或撤回状态。

**源：BE 29 可观测性、日志与追踪协议**

可观测信号包括结构化日志、指标、trace、审计和健康状态。

## MUST

**源：FE 34 监控与日志协议 · §MUST**

- 每个应用、页面和关键 API 面必须声明运行可观测性 Owner，负责日志字段、技术指标、追踪、告警和恢复证据。
- 采集并分类运行错误、Promise rejection、资源失败、接口错误、白屏和根组件渲染失败；每类必须关联 `16-error-handling-protocol` 定义的 UI 状态与恢复策略。
- 结构化日志包含时间、级别、稳定 message_id、版本、环境、页面、组件/操作、trace-id、浏览器和安全上下文摘要。
- 关键 API 调用必须生成或传播 trace-id；请求、响应、错误日志与 breadcrumb 必须保持同一关联标识，Span 必须记录父子关系、耗时、结果和受控元数据。
- HTTP client 与关键异步任务必须聚合 RED 指标；指标名称、单位、维度和版本必须稳定，完整 URL、DOM 文本、用户输入或其他高基数字段不得作为维度。
- 启用 RUM 时必须采集真实用户运行信号，并携带页面类别、设备类别、网络类别、应用版本和指标版本；性能预算、统计窗口与分位数引用 `31-performance-protocol`，不得在本协议重复定义阈值。
- source map 与版本对应且受权限保护。
- 日志字段脱敏并限制请求/响应摘要。
- 关键错误率、API 失败率、白屏率和运行退化信号必须有告警阈值、升级策略、负责人、静默窗口和运行手册。
- 监控事件 schema、版本、采样率、批大小、缓存上限、刷新时机、重试退避、用途、保留期限和删除策略必须明确；页面隐藏、卸载或网络恢复时必须按受控策略尽力刷新待发送遥测。
- 监控 SDK 初始化失败、遥测序列化失败或发送失败必须 fail-open，不得阻断应用主流程；失败本身必须产生可恢复的安全诊断信号，且缓存必须有容量与过期边界。

### 分层运行可观测性责任（按目录层级）

运行可观测性是架构期横切能力，层级划分与 `09-module-boundary-protocol` 一致。

- **app 层 — 启动与全局运行观测**：初始化日志、指标、追踪和 RUM SDK，注册全局错误处理器与白屏检测，声明全局 trace 传播策略；不得用入口 console 输出替代生产遥测或吞错不上报。
- **platform 层 — 状态与网络观测**：统一记录全局状态操作的受控 span，在 HTTP client 注入请求/响应拦截、RED 指标与 trace-id；不得记录完整状态对象或让业务请求自定义 trace 头格式。
- **api 层 — 请求链路观测**：记录请求分类、耗时、错误码、重试次数和 trace 传播；不得记录 token，也不得以完整 URL 或 DOM 文本制造高基数维度。
- **domain 层 — 计算与转换观测**：记录复杂计算/转换耗时、输入量级、异常分支和异步任务状态；不得把 UI Toast/Alert 当作唯一诊断手段。
- **feature 层 — 页面运行观测**：声明页面运行状态转换、错误边界、关键 API 技术信号和性能预算对比；业务 page-view/action 漏斗与事件去重归 `40-analytics-protocol`。
- **shared 层 — 组件与工具观测**：公共组件暴露受控 telemetry hook，工具函数记录异常边界；不得把内部调试日志当正式遥测或硬编码业务分析 schema。

**源：FE 40 埋点协议 · §MUST**

- 事件使用稳定 key，不使用显示文案。
- 定义公共字段、业务白名单、触发时机和去重。
- 每个分析事件必须声明 event_id、schema_version、业务目的、触发条件、字段白名单、隐私分类、Owner、目的地和保留策略；页面或组件不得临时扩展 schema。
- attempt 与 result 通过 OperationId 关联。
- 核心用户旅程必须以稳定业务阶段定义漏斗，并明确进入、成功、失败、放弃和不适用口径；漏斗不得依赖显示文案、DOM 或 URL 猜测。
- 页面重渲染、自动刷新和重试不得误记为用户操作。
- 敏感字段、搜索原文和业务原值默认不上传。
- 新事件有 Owner、用途和保留策略。
- 采集必须遵循适用的同意/授权状态；用户撤回后停止非必要采集，并清理或隔离尚未发送的数据。
- 事件目的地与 payload 字段必须使用白名单；第三方分析脚本、转发规则和数据出境必须经过安全与隐私评审。
- page-view、action、attempt/result 等事件必须使用稳定 page_id/action_id/operation_id 关联；技术 trace-id 仅可作为经批准的关联字段，不得把分析事件变成运行日志副本。

**源：BE 29 可观测性、日志与追踪协议 · §MUST**

- 关键操作必须可关联版本、环境、主体、操作结果与 TraceId。

## MUST NOT

**源：FE 34 监控与日志协议 · §MUST NOT**

- MUST NOT 记录 token、密码、敏感原值或完整文件。
- MUST NOT 仅用 console 作为生产监控。
- MUST NOT 捕获后静默吞错。
- MUST NOT 公开部署 source map。
- MUST NOT 把用户标识、PII、认证信息或业务原值放入 Trace Context、breadcrumb 或高基数字段。
- MUST NOT 在没有 trace-id 的情况下发起关键 API 请求。
- MUST NOT 让页面、组件或请求层各自发明不兼容的日志、指标或追踪字段。
- MUST NOT 让 SDK 初始化、遥测缓存或发送重试阻塞首屏、用户操作或错误恢复。
- MUST NOT 把业务行为漏斗、转化口径或分析用途定义在运行诊断 schema 中。

**源：FE 40 埋点协议 · §MUST NOT**

- MUST NOT 同一行为多次上报或多名称。
- MUST NOT 页面自行扩展不受控公共字段。
- MUST NOT 用埋点代替审计。
- MUST NOT 上报权限外数据。
- MUST NOT 通过抓取 DOM、可见文本、URL 查询参数或用户输入来临时拼装分析数据。
- MUST NOT 在同意状态未知或撤回后继续发送非必要分析事件。
- MUST NOT 用业务分析事件替代错误、白屏、API RED、Trace/Span 或 RUM 技术遥测。
- MUST NOT 把同一业务漏斗阶段在多个页面或组件中定义为不同语义。

**源：BE 29 可观测性、日志与追踪协议 · §MUST NOT**

- 不得记录 token、密码、secret、完整敏感 payload 或无界高基数值。

## SHOULD

**源：FE 34 监控与日志协议 · §SHOULD**

- SHOULD 关联用户操作、请求和异步任务 TraceId。
- SHOULD 控制采样并防止告警风暴。
- SHOULD 在启用分布式追踪时遵循 W3C Trace Context，并验证跨来源边界的头部传播和信任策略。
- SHOULD 对告警关联运行手册、最近变更和可回滚版本。
- SHOULD 对遥测批处理、缓存、退避和丢弃量建立自监控，但不得形成无限递归上报。

**源：FE 40 埋点协议 · §SHOULD**

- SHOULD 通过 typed analytics client 和 schema 校验。
- SHOULD 监控事件质量、丢失和重复率。
- SHOULD 对漏斗的迟到、乱序、重复、跨设备和 consent 变化定义明确处理策略。

**源：BE 29 可观测性、日志与追踪协议 · §SHOULD**

- 应为关键失败、延迟、容量和依赖建立可行动的指标与告警。

## Contract

**源：FE 34 监控与日志协议 · §Contract**

```text
SignalType, SchemaVersion, AppVersion, Environment, Page, ComponentOrOperation,
TraceId, SpanId, ParentSpanId, MessageId, ErrorCode, Duration, SafeDimensions,
SamplingPolicy, Retention, Timestamp, Owner
```

分层运行可观测性责任契约（与 `09-module-boundary-protocol` 层级一致）：

```text
Layer, Responsibility, CheckPoint, Forbidden
app, SDK/全局错误/白屏/trace 策略, 初始化降级 + 全局处理器 + 版本绑定, console 替代遥测 / 吞错
platform, 状态与网络技术遥测, store span + HTTP RED + trace 注入, 完整状态对象 / 自定义 trace 格式
api, 请求链路, 分类 + 耗时 + 错误码 + 重试 + trace, token / 高基数 URL 或 DOM
domain, 计算与异步任务, 耗时 + 数据量级 + 异常分支 + 任务状态, UI 提示作为唯一诊断
feature, 页面运行状态, 错误边界 + 技术信号 + 性能预算引用, 重复定义业务分析漏斗
shared, 公共 telemetry hook, 组件/工具异常边界, 调试日志当正式遥测 / 业务 schema 硬编码
```

**源：FE 40 埋点协议 · §Contract**

```text
EventId, SchemaVersion, Purpose, FunnelId, FunnelStage, PageId, ActionId,
Trigger, CommonFields, BusinessFields, OperationId, DedupKey, ConsentState,
PrivacyClass, Destination, Owner, Retention
```

**源：BE 29 可观测性、日志与追踪协议 · §Contract**

信号设计必须定义 schema、级别、采样、保留、脱敏、Owner 与排障用途。

## Checklist

**源：FE 34 监控与日志协议 · §Checklist**

- [ ] 错误和白屏可定位。
- [ ] 版本与 source map 对应。
- [ ] 日志无敏感信息。
- [ ] 告警和 Owner 明确。
- [ ] Trace/Span/Breadcrumb 与关键 API、错误和异步任务可关联。
- [ ] RED 与 RUM 技术信号有稳定名称、单位、维度和指标版本；预算与分位数口径引用 31。
- [ ] schema、版本、采样、批处理、缓存、重试、保留和删除策略明确。
- [ ] 遥测故障不影响主流程，Trace Context 不携带敏感数据。
- [ ] 分层责任已按 app/platform/api/domain/feature/shared 分担并引用 09。

**源：FE 40 埋点协议 · §Checklist**

- [ ] 名称和字段稳定。
- [ ] 时机与去重正确。
- [ ] 漏斗阶段、成功/失败/放弃口径和 OperationId 关联明确。
- [ ] 隐私边界通过。
- [ ] Owner 和用途明确。
- [ ] 同意、撤回、目的地白名单和待发送队列清理已验证。
- [ ] 业务事件未复制 34 的运行诊断或 31 的性能预算规则。

**源：BE 29 可观测性、日志与追踪协议 · §Checklist**

- [ ] 成功、失败、重试、降级和恢复均能通过信号关联。

## Examples

**源：FE 34 监控与日志协议 · §Examples**

### 内容示例，可删除

系统错误展示 TraceId；HTTP client、错误日志和 breadcrumb 记录同一 TraceId 与版本。遥测按受控批次发送，SDK 故障时主流程继续并记录安全降级信号，不记录输入原值。

**源：FE 40 埋点协议 · §Examples**

### 内容示例，可删除

用户点击导出记录业务 `attempt`，后台任务完成记录 `result`，两者共享 operation id 并进入同一导出漏斗；API 耗时、错误码和 trace 诊断仍由 34 记录。

**源：BE 29 可观测性、日志与追踪协议 · §Examples**

- 外部调用 trace 记录供应方、结果类和延迟，不记录认证凭据。

## Anti-patterns

**源：FE 34 监控与日志协议 · §Anti-patterns**

生产只打印 console.error，用户截图是唯一定位依据。

每个页面自行初始化 SDK、定义 trace 头和日志字段，导致链路无法关联；发送失败时无限重试并阻塞页面卸载。

**源：FE 40 埋点协议 · §Anti-patterns**

按钮组件和页面都上报点击，导致同一行为计数两次且字段不同。

把 JS 错误、API RED 指标和 LCP 阈值塞进分析事件 schema，导致运行诊断、性能预算与业务转化口径互相污染。

**源：BE 29 可观测性、日志与追踪协议 · §Anti-patterns**

- 只打印自由文本异常，无法按请求、版本或业务操作聚合。

## Ownership

**源：FE 34 监控与日志协议 · §Ownership**

Observability/平台 Owner 维护运行遥测 schema、SDK、trace 传播和告警；模块 Owner 维护安全上下文与恢复映射；性能 Owner 维护 31 的预算与统计口径；数据/产品 Owner 维护 40 的业务分析事件；安全/隐私 Owner 审核字段、采样、保留和删除策略。

**源：FE 40 埋点协议 · §Ownership**

数据/产品 Owner 定义用途，埋点平台 Owner 维护 schema，安全/隐私 Owner 审核字段。

**源：BE 29 可观测性、日志与追踪协议 · §Ownership**

服务维护者拥有诊断信号，运行角色维护告警与事故流程。

## Change Policy

**源：FE 34 监控与日志协议 · §Change Policy**

运行遥测 schema、日志字段、技术指标、trace 传播、采样、批处理、缓存、重试、保留、告警和 source map 策略变化必须评审隐私、性能、成本、兼容性和可诊断性；不得把 31/40 的权威规则复制回本协议。

**源：FE 40 埋点协议 · §Change Policy**

事件改名、字段语义和保留变化必须版本化并通知下游消费者。

**源：BE 29 可观测性、日志与追踪协议 · §Change Policy**

信号 schema、采样或保留变化必须评估仪表盘、告警和隐私影响。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
