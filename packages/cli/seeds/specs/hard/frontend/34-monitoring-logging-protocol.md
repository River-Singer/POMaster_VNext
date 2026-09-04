---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/34-monitoring-logging-protocol.md
seed_source_sha256: 3c37c1c3aa3ade8d43532a1fcc7561e95aef42a19e46b6eb53d864054a2da013
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 34 监控与日志协议

## Scope

P1。作为前端运行可观测性的主权威，定义结构化日志、技术遥测、错误与白屏、Trace/Span/Breadcrumb、RED 指标、RUM 采集、告警和遥测传输韧性。

## Non-Scope

不替代后端审计、基础设施容量监控和具体 APM 厂商选型；业务行为事件、漏斗和分析用途归 `40-analytics-protocol`，LCP/INP/CLS 等性能预算、RUM 统计口径和分位数归 `31-performance-protocol`。不允许监控收集权限外数据。

## Terms

- Error Event：可定位的运行失败记录。
- Trace：一次端到端请求的因果链，由 trace-id 贯穿。
- Span：Trace 内的单个操作单元，记录开始/结束时间、父关系和受控元数据。
- Breadcrumb：错误前的受控操作路径。
- RED 指标：Rate（请求率）、Errors（错误率）、Duration（耗时）。
- RUM：Real User Monitoring，采集真实用户设备、网络、性能和交互指标的运行监测方式。
- Source Map：映射压缩代码到源代码的受控文件。

## MUST

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

## MUST NOT

- MUST NOT 记录 token、密码、敏感原值或完整文件。
- MUST NOT 仅用 console 作为生产监控。
- MUST NOT 捕获后静默吞错。
- MUST NOT 公开部署 source map。
- MUST NOT 把用户标识、PII、认证信息或业务原值放入 Trace Context、breadcrumb 或高基数字段。
- MUST NOT 在没有 trace-id 的情况下发起关键 API 请求。
- MUST NOT 让页面、组件或请求层各自发明不兼容的日志、指标或追踪字段。
- MUST NOT 让 SDK 初始化、遥测缓存或发送重试阻塞首屏、用户操作或错误恢复。
- MUST NOT 把业务行为漏斗、转化口径或分析用途定义在运行诊断 schema 中。

## SHOULD

- SHOULD 关联用户操作、请求和异步任务 TraceId。
- SHOULD 控制采样并防止告警风暴。
- SHOULD 在启用分布式追踪时遵循 W3C Trace Context，并验证跨来源边界的头部传播和信任策略。
- SHOULD 对告警关联运行手册、最近变更和可回滚版本。
- SHOULD 对遥测批处理、缓存、退避和丢弃量建立自监控，但不得形成无限递归上报。

## Contract

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

## Checklist

- [ ] 错误和白屏可定位。
- [ ] 版本与 source map 对应。
- [ ] 日志无敏感信息。
- [ ] 告警和 Owner 明确。
- [ ] Trace/Span/Breadcrumb 与关键 API、错误和异步任务可关联。
- [ ] RED 与 RUM 技术信号有稳定名称、单位、维度和指标版本；预算与分位数口径引用 31。
- [ ] schema、版本、采样、批处理、缓存、重试、保留和删除策略明确。
- [ ] 遥测故障不影响主流程，Trace Context 不携带敏感数据。
- [ ] 分层责任已按 app/platform/api/domain/feature/shared 分担并引用 09。

## Examples

### 内容示例，可删除

系统错误展示 TraceId；HTTP client、错误日志和 breadcrumb 记录同一 TraceId 与版本。遥测按受控批次发送，SDK 故障时主流程继续并记录安全降级信号，不记录输入原值。

## Anti-patterns

生产只打印 console.error，用户截图是唯一定位依据。

每个页面自行初始化 SDK、定义 trace 头和日志字段，导致链路无法关联；发送失败时无限重试并阻塞页面卸载。

## Ownership

Observability/平台 Owner 维护运行遥测 schema、SDK、trace 传播和告警；模块 Owner 维护安全上下文与恢复映射；性能 Owner 维护 31 的预算与统计口径；数据/产品 Owner 维护 40 的业务分析事件；安全/隐私 Owner 审核字段、采样、保留和删除策略。

## Change Policy

运行遥测 schema、日志字段、技术指标、trace 传播、采样、批处理、缓存、重试、保留、告警和 source map 策略变化必须评审隐私、性能、成本、兼容性和可诊断性；不得把 31/40 的权威规则复制回本协议。
