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
legacy_id: theme:api-contract-and-error-semantics
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: triggered # 聚合注记：来源同值；info 性注记非执行语义
stages: [prepare, implement, check] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [api-contract, api-change, error-code, error-handling] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/07-frontend-backend-communication-protocol.md
    sha256: b14d2f8281198ff663e6e21e58df2e429c4683907cb77b6ebcdb6609d37f72d2
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/15-request-api-protocol.md
    sha256: b9489d69e35a19b8d5ba2442108190e7b99989ef471c8cf413d9e4e408ca2969
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/16-error-handling-protocol.md
    sha256: 0c6adc425e01a003e1f3c83fcf51f1d287767c95a4da50c15f5f639d9104f07f
    seed_version: B6B-1
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/12-api-contract-protocol.md
    sha256: 35519d81548cabff729de888e0bf9e0d5b40a0274c9fa3684641b50e75938ca0
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/16-error-code-protocol.md
    sha256: aa80ee60f7431e14859f61e563784e71b2002f35e220964170a779800fdde090
    seed_version: B6C
x-language-sections: # 语言节同步源（R-J 资产层唯一权威；注入面为同步副本）
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/spring-mvc/spring-mvc-web-overlay.md
    sha256: 19a75e281d7406d4ce38accd4aa528496e9cb666a8d123bc489c7404cb67fcb6
    attach: primary
---

# API 契约与错误语义

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。
文末「语言与栈节」为 stacks overlay 资产 Scope/Rules/Checklist 的逐字节同步副本（标题降 2 级，正文零改动）——资产层为唯一权威，改规则只改 overlay、本区随同步。

## Scope

**源：FE 07 前后端通信协议（pomaster/components/frontend-hard-spec/assets/universal/07-frontend-backend-communication-protocol.md）**

P0。定义前后端共同确认的接口、认证、错误、幂等、并发、文件、任务、实时通信和版本契约。

**源：FE 15 请求与 API 协议（pomaster/components/frontend-hard-spec/assets/universal/15-request-api-protocol.md）**

P1。定义正式契约进入前端后的请求封装、取消、重试、loading、错误归一化和 API 函数。

**源：FE 16 错误处理协议（pomaster/components/frontend-hard-spec/assets/universal/16-error-handling-protocol.md）**

P1。定义认证、权限、资源、冲突、校验、限流、服务、网络和部分失败的前端呈现与恢复。

**源：BE 12 API 契约协议（pomaster/components/backend-hard-spec/assets/universal/12-api-contract-protocol.md）**

规范请求响应、版本、字段、权限、错误、幂等、分页、兼容与 TraceId。

**源：BE 16 错误码协议（pomaster/components/backend-hard-spec/assets/universal/16-error-code-protocol.md）**

规范错误分类、稳定错误码、状态映射、字段错误、重试性与安全消息。

## Non-Scope

**源：FE 07 前后端通信协议**

不规定前端请求库实现、页面错误呈现或具体后端框架。

**源：FE 15 请求与 API 协议**

不定义后端接口本身，不负责页面错误文案和缓存业务规则。

**源：FE 16 错误处理协议**

不定义后端错误码本身，不替代监控采集和业务校验。

**源：BE 12 API 契约协议**

不替代领域规则、最终鉴权或具体 endpoint 事实。

**源：BE 16 错误码协议**

不负责日志采样、告警或业务规则本身。

## Terms

**源：FE 07 前后端通信协议**

- Formal Contract：可版本化、可校验的 OpenAPI 或等价契约。
- Idempotency：重复请求不产生重复业务结果。
- Optimistic Concurrency：通过 version/ETag 防止静默覆盖。
- TraceId：贯穿请求、任务和日志的问题定位标识。

**源：FE 15 请求与 API 协议**

- HTTP Client：统一传输基础设施。
- Domain API：面向业务语义的请求函数。
- Request Context：认证、语言、trace、幂等等上下文。

**源：FE 16 错误处理协议**

- Field Error：可定位到字段/单元格的错误。
- Recover Action：登录、刷新、重试、重载、联系管理员或解决冲突。
- Error Boundary：隔离渲染失败的边界。

**源：BE 12 API 契约协议**

正式契约是 OpenAPI 或项目明确指定的等价权威来源。

**源：BE 16 错误码协议**

稳定错误码是调用方可依赖且不暴露内部实现的机器语义。

## MUST

**源：FE 07 前后端通信协议 · §MUST**

- 每个 endpoint 定义 URL、Method、参数位置、类型、响应、错误、权限和 owner。
- 分页、筛选、排序、空值、枚举、单位和时间语义必须明确。
- 写操作定义幂等、并发版本和缓存影响。
- 文件、异步任务和实时消息使用正式 schema。
- 破坏性变更必须版本化并提供迁移期。
- 所有错误和任务链路可通过 TraceId 追踪。
- 错误码到 UI 状态的映射必须维护在单一事实源 `outputs/frontend/10_planned/api-error-mapping.yaml`，并与契约版本同步。

**源：FE 15 请求与 API 协议 · §MUST**

- 页面只调用封装的 Domain API。
- HTTP Client 统一处理 base URL、认证、超时、取消、trace 和 envelope。
- 请求函数使用稳定领域动词命名并有类型。
- 查询可取消和丢弃过期响应。
- mutation 明确幂等和重试边界。
- 错误转换为统一结构。
- 传输成功与业务成功必须分别判断；HTTP 非成功状态、契约解析失败、取消、超时、离线和业务错误不得混为一类。
- 重试必须服从幂等性、服务端 `Retry-After` 或受控退避，并能取消；取消或已被替代的请求不得提示为用户错误。
- 请求结果提交前必须验证身份、租户、权限、参数和请求版本，防止旧上下文结果写回。
- endpoint、redirect 和 base URL 只能来自受控配置或契约，不得由不可信 URL 参数直接拼接。

**源：FE 16 错误处理协议 · §MUST**

- 将原始错误归一化为稳定 code、trace、fieldErrors、retryable 和 recoverAction。
- 401、403、404、409、422、429、5xx 和网络错误分别处理。
- 字段错误定位字段，部分失败提供逐项明细。
- 分层设置错误边界，局部失败不得导致整页白屏。
- 用户知道发生什么、能否恢复和下一步。

**源：BE 12 API 契约协议 · §MUST**

- method、path、字段、状态码、错误码、权限和兼容策略必须与实现一致。

**源：BE 16 错误码协议 · §MUST**

- 失败必须映射到稳定 code、适当状态、可选字段错误、retryable 与 TraceId。

## MUST NOT

**源：FE 07 前后端通信协议 · §MUST NOT**

- MUST NOT 用口头、截图、Mock 或示例替代正式契约。
- MUST NOT 依赖 message 文本表达业务错误。
- MUST NOT 用按钮 loading 代替后端幂等。
- MUST NOT 未版本化地修改字段、枚举、分页或错误语义。

**源：FE 15 请求与 API 协议 · §MUST NOT**

- MUST NOT 在页面直接写 fetch/axios 或拼 endpoint。
- MUST NOT 多处重复 token、错误码和重试逻辑。
- MUST NOT 对非幂等 mutation 默认自动重试。
- MUST NOT 让组件解析原始响应 envelope。
- MUST NOT 把“网络在线”提示当成请求成功证明，或假设 HTTP 404/500 一定以 Promise rejection 表现。

**源：FE 16 错误处理协议 · §MUST NOT**

- MUST NOT 用一个 Toast 处理所有错误。
- MUST NOT 吞掉字段错误、冲突或 TraceId。
- MUST NOT 展示技术堆栈、敏感参数或原始 HTML。
- MUST NOT 自动重试不安全 mutation。

**源：BE 12 API 契约协议 · §MUST NOT**

- 不得把 Mock、聊天记录或调用方猜测当作正式契约。

**源：BE 16 错误码协议 · §MUST NOT**

- 不得向调用方返回堆栈、SQL、secret 或不稳定内部异常文本。

## SHOULD

**源：FE 07 前后端通信协议 · §SHOULD**

- SHOULD 以机器可读契约生成类型、Mock 和校验。
- SHOULD 对任务进度优先使用 SSE，双向场景再用 WebSocket。

**源：FE 15 请求与 API 协议 · §SHOULD**

- SHOULD 通过生成客户端或 typed adapter 对接正式契约。
- SHOULD 让 loading 来源唯一，避免重复状态。

**源：FE 16 错误处理协议 · §SHOULD**

- SHOULD 区分页面错误、字段错误、后台任务和短暂反馈。
- SHOULD 在错误恢复后刷新受影响数据。

**源：BE 12 API 契约协议 · §SHOULD**

- 应对新增字段、分页、重试和版本演进采用向后兼容默认值。

**源：BE 16 错误码协议 · §SHOULD**

- 应区分认证、鉴权、未找到、冲突、校验、限流和服务失败。

## Contract

**源：FE 07 前后端通信协议 · §Contract**

### 接口元数据

```text
Endpoint, Method, Auth, Permission, RequestSchema,
ResponseSchema, ErrorSchema, Idempotency,
Concurrency, Cache, RateLimit, Version, Owner
```

每个接口还必须记录用途、所属领域、稳定 operation id、超时、弃用状态和变更历史。口头约定、Mock、抓包结果和前端临时类型只能作为评审输入，不能成为主契约。

### URL 与 Method

- URL 使用稳定资源名和层级，不把页面动作或展示标题编码进路径。
- GET 只读且可安全重试；POST/PUT/PATCH/DELETE 的创建、替换、部分更新和删除语义必须明确。
- 提交、审批、归档、计算等非 CRUD 动作使用明确领域动作，不使用 `doAction` 等万能端点。
- Path 参数标识资源，Query 表达分页/筛选/排序，Header 表达协议上下文，Body 表达命令或资源数据。

### 请求参数

每个字段必须定义：名称、位置、类型、必填、nullable、默认值、长度/范围、格式、枚举、单位、时区、示例和未知值策略。空字符串、null、缺失字段和空数组的语义不得混用。

### 响应结构

- 成功响应必须声明 HTTP status、内容类型、数据 schema、可空性和 TraceId。
- 列表必须固定数据数组、页码或游标、pageSize、total/hasNext 的语义。
- 删除、提交、异步创建等操作必须明确同步结果、任务标识或无内容响应。
- 前端不得为同一业务同时兼容多个未版本化 envelope。

### 错误结构

```text
Error {
  httpStatus,
  code,
  safeMessage?,
  traceId,
  fieldErrors?,
  itemErrors?,
  retryable,
  retryAfter?,
  conflictVersion?
}
```

- HTTP status 表达认证、权限、资源、冲突、校验、限流和服务状态。
- 业务 code 必须稳定且可枚举，message 仅用于展示或诊断，不能驱动逻辑。
- 字段错误包含稳定 field key、错误码和参数；批量错误包含对象/行标识。
- 409 返回冲突实体或重新获取方式；429 返回明确退避信息；5xx 不代表所有请求均可重试。

### DTO、Adapter 与 ViewModel

接口契约定义 DTO。前端通过 Adapter 转成稳定 Domain Model/ViewModel；公共组件、表格列和模板不得直接依赖 DTO。字段重命名、null、枚举、日期和金额转换只能在边界完成。

### 分页、筛选与排序

- 页码起点或游标语义、pageSize 上限、total 是否精确必须固定。
- 筛选字段采用允许列表，并定义操作符、组合逻辑、空值和时间区间。
- 排序字段和方向采用允许列表；需要稳定结果时声明次排序。
- 导出必须复用列表筛选语义，并明确当前页、选中项或符合条件的全量范围。

### 权限通信

- 接口声明认证要求、操作权限和数据范围。
- 后端只返回调用方有权访问的数据；前端隐藏入口不能替代鉴权。
- 字段可见、脱敏、编辑和导出权限必须有稳定 contract。
- 权限变化后 token、缓存和已打开页面如何失效必须明确。

### 认证与 Token

必须定义 access/refresh token 生命周期、传输位置、刷新、撤销、退出、多标签同步、并发 401 合并和 CSRF 策略。Token 不得出现在 URL、日志、埋点或业务组件。

### 幂等性

- 创建、提交、审批、批量动作、导入、导出和计算等可能重复执行的命令必须声明幂等支持。
- 幂等键的生成方、作用域、有效期、重复请求响应和冲突行为必须固定。
- 前端按钮禁用和 loading 只是体验保护，不构成业务幂等。

### 并发与数据冲突

- 可编辑资源返回 version、updatedAt 或 ETag，并在更新命令携带预期版本。
- 冲突必须显式返回，不允许静默 last-write-wins。
- 契约声明刷新、放弃本地修改、重新提交和字段 diff 所需数据。

### 缓存与刷新

接口声明可缓存性、ETag/version、数据实时性和写操作影响资源。权限、BOM、成本、审批等高风险数据不得由调用方擅自延长缓存；mutation 必须提供足够信息完成准确失效。

### 文件上传与下载

- 上传声明 multipart 字段、类型、大小、数量、文件名、校验阶段和安全错误。
- 下载声明内容类型、文件名编码、权限、数据范围、有效期和断点/大文件策略。
- 文件 URL 不得成为永久越权入口，下载时必须重新授权。

### 异步任务

```text
Job {
  taskId, type, status, progress,
  message?, result?, error?, traceId,
  createdAt, updatedAt
}
```

必须定义创建、查询、取消、重试、结果、错误明细、过期和幂等。状态机至少区分 pending、running、success、failed、cancelled；新增状态需契约变更。

### 实时通信

- 服务端单向进度和通知优先 SSE；双向协作才使用 WebSocket；轮询为降级。
- 消息至少包含 messageId、type、payload、timestamp、version 和 TraceId。
- 必须定义鉴权、心跳、断线重连、重复、乱序、丢失、回放、完成终止和降级行为。

### 版本兼容

- 新增可选字段通常向后兼容；删除、改名、类型、枚举或语义变化属于破坏性变更。
- 未知枚举必须安全兜底，但不得静默赋予业务含义。
- 破坏性变化提供新版本、调用方清单、迁移期、弃用日期和回滚。
- 生成类型、Adapter、Mock、导入导出和测试必须随契约同步。

### 联调流程

正式流程为：契约提案 -> 示例/Mock -> 前后端与业务评审 -> 冻结 -> 类型生成/Adapter -> 联调 -> 非理想态验收 -> 发布。联调不能只验证 200，至少覆盖 401、403、409、422、429、5xx、超时和部分成功。

### TraceId

客户端操作、HTTP 请求、异步任务、实时消息、后端日志和用户可见错误应能关联 TraceId/OperationId。TraceId 不携带敏感信息，并在跨服务时保持或建立明确父子关系。

### 错误码到 UI 状态映射

`outputs/frontend/10_planned/api-error-mapping.yaml` 是每个项目必须维护的事实源，字段包括：

```text
ErrorCode, HttpStatus, UIState, RecoverAction, DefaultMessage, TraceIdRequired, ContractVersion
```

- 每个稳定业务 code 必须映射到唯一 UI 状态（idle/loading/error/success/retry/conflict/permission）。
- 映射必须随契约版本升级；破坏性 code 变化属于契约变更。
- UI 不得直接按 message 文本或 HTTP status 推导状态；未映射 code 必须进入兜底状态并记录。

**源：FE 15 请求与 API 协议 · §Contract**

```text
FunctionName, InputType, OutputType, ErrorType,
StatusPolicy, Cancellation, Retry, RetryAfter, Idempotency,
ContextVersion, LateResultGuard, Trace
```

**源：FE 16 错误处理协议 · §Contract**

```text
Error { status?, code, safeMessage, traceId?,
fieldErrors?, retryable, recoverAction? }
```

**源：BE 12 API 契约协议 · §Contract**

每个接口必须定义输入、输出、失败、幂等、权限、追踪与版本语义。

**源：BE 16 错误码协议 · §Contract**

错误注册项必须包含语义、状态映射、消息边界、重试性和所有者。

## Checklist

**源：FE 07 前后端通信协议 · §Checklist**

- [ ] 请求/响应和错误完整。
- [ ] 参数位置、空值、枚举、单位和时间语义明确。
- [ ] 分页、筛选、排序和导出语义一致。
- [ ] 权限、幂等、并发明确。
- [ ] 文件/任务/实时契约完整。
- [ ] 兼容和 TraceId 可验证。
- [ ] 类型、Adapter、Mock 和错误场景随契约同步。
- [ ] api-error-mapping.yaml 已维护并与契约版本一致。

**源：FE 15 请求与 API 协议 · §Checklist**

- [ ] 页面只使用 Domain API。
- [ ] 类型和错误统一。
- [ ] 取消、重试、幂等明确。
- [ ] 无重复 loading/认证逻辑。
- [ ] 状态判断、旧结果防护和 endpoint 来源明确。

**源：FE 16 错误处理协议 · §Checklist**

- [ ] 错误分类和位置正确。
- [ ] 恢复动作可执行。
- [ ] TraceId 可定位。
- [ ] 敏感信息未泄露。

**源：BE 12 API 契约协议 · §Checklist**

- [ ] 契约、实现、生成客户端、测试和 handoff 已同步。

**源：BE 16 错误码协议 · §Checklist**

- [ ] 新错误已验证客户端恢复、日志关联和兼容行为。

## Examples

**源：FE 07 前后端通信协议 · §Examples**

### 内容示例，可删除

更新实体携带预期 version；冲突返回 409、稳定错误码、服务器版本和 TraceId。批量导入返回 taskId，进度消息使用固定 Job/Realtime schema，完成后按契约刷新受影响资源。

**源：FE 15 请求与 API 协议 · §Examples**

### 内容示例，可删除

`getEntityList(query, signal)` 返回稳定分页模型，调用方不认识 endpoint 和 envelope。

**源：FE 16 错误处理协议 · §Examples**

### 内容示例，可删除

409 保留本地编辑，提示比较最新版本，而不是自动覆盖。

**源：BE 12 API 契约协议 · §Examples**

- 冲突返回稳定错误码与 TraceId，而不是泄露内部异常。

**源：BE 16 错误码协议 · §Examples**

- 乐观锁冲突返回稳定冲突 code，并明确客户端是否可重试。

## Anti-patterns

**源：FE 07 前后端通信协议 · §Anti-patterns**

前端按 Mock 猜字段，后端改名后页面同时兼容多种响应并比较错误 message；创建、导入和审批只靠按钮 loading 防重；轮询、SSE 和 WebSocket 又各自定义一套任务状态。

**源：FE 15 请求与 API 协议 · §Anti-patterns**

每个页面各自创建请求实例、刷新 token 并比较 message。

**源：FE 16 错误处理协议 · §Anti-patterns**

所有失败统一 Toast“操作失败”，字段输入被清空且无错误编号。

**源：BE 12 API 契约协议 · §Anti-patterns**

- 修改响应字段但不更新正式契约和调用方兼容测试。

**源：BE 16 错误码协议 · §Anti-patterns**

- 所有异常都返回 HTTP 200 或统一未知错误。

## Ownership

**源：FE 07 前后端通信协议 · §Ownership**

前后端 API Owner 共同负责，业务 Owner 确认语义，安全 Owner 确认认证和权限。

**源：FE 15 请求与 API 协议 · §Ownership**

平台 Owner 维护 HTTP Client，领域 Owner 维护 Domain API，契约 Owner 维护类型来源。

**源：FE 16 错误处理协议 · §Ownership**

契约 Owner 定义错误码，平台 Owner 维护归一化，页面 Owner 负责上下文呈现。

**源：BE 12 API 契约协议 · §Ownership**

Backend 维护服务端契约，消费者确认联调与兼容结果。

**源：BE 16 错误码协议 · §Ownership**

Backend 维护错误注册表，API 消费方按稳定语义处理。

## Change Policy

**源：FE 07 前后端通信协议 · §Change Policy**

契约先评审、再冻结、后实现；破坏性变化必须有版本、调用方清单、迁移和退役日期。

**源：FE 15 请求与 API 协议 · §Change Policy**

客户端公共行为变化必须评估全部请求；函数破坏性变化提供迁移和弃用期。

**源：FE 16 错误处理协议 · §Change Policy**

错误码或恢复语义变化必须同步契约、映射、文案、Mock、监控和测试。

**源：BE 12 API 契约协议 · §Change Policy**

破坏性 API 变化必须按契约变更协议执行版本与迁移。

**源：BE 16 错误码协议 · §Change Policy**

已发布错误码不得复用；废弃必须保留兼容说明。

## 语言与栈节（overlay 资产同步区）

> 本区各小节 = stacks/ overlay 资产 Scope/Rules/Checklist 的**逐字节同步副本**（标题降 2 级，正文零改动）。资产层（overlay 文件，catalog 在册、research 锚、bound 语义挂点）为唯一权威；本区为注入面副本，改规则只改 overlay、本区随同步。x-research-anchors 留在 overlay 资产 frontmatter，不复制进本主题文档（防双锚漂移）。

### spring-mvc（源：stacks/spring-mvc/spring-mvc-web-overlay.md · T10 主挂点）

#### Scope

本 Overlay 具体化 Servlet 请求链、Controller、参数绑定、异常映射和线程模型。

#### Rules

- Controller 必须保持传输层职责，业务规则进入明确的应用或领域边界。
- 阻塞调用、上传下载和异步请求必须声明超时、资源与安全约束。
- 与 WebFlux 并存时必须记录模块、端口或应用边界。

#### Checklist

- [ ] Java 与 Spring Boot 依赖已显式选择。
- [ ] API、错误码、权限和测试证据与实现一致。


> **缺席诚实**：php / python（后端语言）无 overlay 资产，不落语言节。
