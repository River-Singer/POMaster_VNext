---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/07-frontend-backend-communication-protocol.md
seed_source_sha256: b14d2f8281198ff663e6e21e58df2e429c4683907cb77b6ebcdb6609d37f72d2
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 07 前后端通信协议

## Scope

P0。定义前后端共同确认的接口、认证、错误、幂等、并发、文件、任务、实时通信和版本契约。

## Non-Scope

不规定前端请求库实现、页面错误呈现或具体后端框架。

## Terms

- Formal Contract：可版本化、可校验的 OpenAPI 或等价契约。
- Idempotency：重复请求不产生重复业务结果。
- Optimistic Concurrency：通过 version/ETag 防止静默覆盖。
- TraceId：贯穿请求、任务和日志的问题定位标识。

## MUST

- 每个 endpoint 定义 URL、Method、参数位置、类型、响应、错误、权限和 owner。
- 分页、筛选、排序、空值、枚举、单位和时间语义必须明确。
- 写操作定义幂等、并发版本和缓存影响。
- 文件、异步任务和实时消息使用正式 schema。
- 破坏性变更必须版本化并提供迁移期。
- 所有错误和任务链路可通过 TraceId 追踪。
- 错误码到 UI 状态的映射必须维护在单一事实源 `outputs/frontend/10_planned/api-error-mapping.yaml`，并与契约版本同步。

## MUST NOT

- MUST NOT 用口头、截图、Mock 或示例替代正式契约。
- MUST NOT 依赖 message 文本表达业务错误。
- MUST NOT 用按钮 loading 代替后端幂等。
- MUST NOT 未版本化地修改字段、枚举、分页或错误语义。

## SHOULD

- SHOULD 以机器可读契约生成类型、Mock 和校验。
- SHOULD 对任务进度优先使用 SSE，双向场景再用 WebSocket。

## Contract

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

## Checklist

- [ ] 请求/响应和错误完整。
- [ ] 参数位置、空值、枚举、单位和时间语义明确。
- [ ] 分页、筛选、排序和导出语义一致。
- [ ] 权限、幂等、并发明确。
- [ ] 文件/任务/实时契约完整。
- [ ] 兼容和 TraceId 可验证。
- [ ] 类型、Adapter、Mock 和错误场景随契约同步。
- [ ] api-error-mapping.yaml 已维护并与契约版本一致。

## Examples

### 内容示例，可删除

更新实体携带预期 version；冲突返回 409、稳定错误码、服务器版本和 TraceId。批量导入返回 taskId，进度消息使用固定 Job/Realtime schema，完成后按契约刷新受影响资源。

## Anti-patterns

前端按 Mock 猜字段，后端改名后页面同时兼容多种响应并比较错误 message；创建、导入和审批只靠按钮 loading 防重；轮询、SSE 和 WebSocket 又各自定义一套任务状态。

## Ownership

前后端 API Owner 共同负责，业务 Owner 确认语义，安全 Owner 确认认证和权限。

## Change Policy

契约先评审、再冻结、后实现；破坏性变化必须有版本、调用方清单、迁移和退役日期。
