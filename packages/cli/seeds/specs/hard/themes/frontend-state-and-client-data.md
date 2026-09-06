---
seed_source: packages/cli/seeds/aggregation-manifest.json
seed_source_sha256: 039b637ccffacdfe3ce30d85e193f4b38928fcdfb16efdc4eb255e35e05af91f
seed_version: B7-THEME
lane: [frontend]
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: theme:frontend-state-and-client-data
criticality: standard # 聚合注记：来源无 criticality 字段，取中性默认；info 性注记非执行语义
injection_mode: mixed # 聚合注记：来源无 injection_mode 字段（默认基线 + 任务命中激活模型）；info 性注记非执行语义
stages: [] # 聚合注记：来源无 stages 字段；info 性注记非执行语义
triggers: [] # 聚合注记：来源无 triggers 字段；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/18-state-management-protocol.md
    sha256: 72445fcd0ac7e21ebea38a5f72849543f936c7a96eee54eb99330226acaaf400
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/19-cache-protocol.md
    sha256: 893d5651016233eec36333775441a935746fe1202c8924dc2edf753d61523daf
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/32-file-import-export-protocol.md
    sha256: 2262d7ce2e910e4d64b0c6f3ef1af0b72c3cafc31d6cb1a796a8fb8b1801cbbc
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/45-browser-storage-protocol.md
    sha256: 01d0d3cb618519c94c939658526a97ad1df851a8f820a22a9b4595bef03cc2cb
    seed_version: B6B-2
---

# 前端状态与客户端数据

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 18 状态管理协议（pomaster/components/frontend-hard-spec/assets/universal/18-state-management-protocol.md）**

P1。定义 local、page、URL、global、server、form 和 persisted state 的归属与生命周期。

**源：FE 19 缓存协议（pomaster/components/frontend-hard-spec/assets/universal/19-cache-protocol.md）**

P1。定义字典、用户、权限、列表、详情、任务和偏好的缓存、隔离与失效。

**源：FE 32 文件、导入与导出协议（pomaster/components/frontend-hard-spec/assets/universal/32-file-import-export-protocol.md）**

P1。定义文件上传、下载、模板、导入校验、错误明细、导出范围和后台任务。

**源：FE 45 浏览器存储协议（pomaster/components/frontend-hard-spec/assets/universal/45-browser-storage-protocol.md）**

P1。定义 Cookie、Web Storage、IndexedDB、Cache API 和其他客户端持久化的选择、隔离、校验、配额、迁移、一致性与清理。

## Non-Scope

**源：FE 18 状态管理协议**

不指定状态库品牌，不替代缓存和路由协议。

**源：FE 19 缓存协议**

不定义 HTTP/CDN 服务端缓存，不替代状态管理和接口契约。

**源：FE 32 文件、导入与导出协议**

不定义底层存储实现，不替代安全、权限和异步任务接口契约。

**源：FE 45 浏览器存储协议**

不定义服务端数据库或 HTTP/CDN 缓存，不允许客户端存储替代后端权威状态、认证或鉴权。

## Terms

**源：FE 18 状态管理协议**

- Local State：单组件短生命周期状态。
- Server State：远端权威数据及请求生命周期。
- URL State：需分享、刷新或返回恢复的状态。
- Persisted Preference：跨会话用户偏好。

**源：FE 19 缓存协议**

- Query Key：唯一描述结果集合的结构化键。
- Stale Time：数据可视为新鲜的时间。
- Invalidation：写操作后使依赖缓存失效。

**源：FE 32 文件、导入与导出协议**

- Import Template：与 schema 版本匹配的输入模板。
- Partial Success：部分行成功、失败、跳过或警告。
- Export Scope：当前页、选中行、筛选全量、保存视图或汇总。

**源：FE 45 浏览器存储协议**

- Storage Class：存储介质及其可见范围、持久性和安全属性。
- Isolation Key：用户、租户、组织、权限范围和数据版本等隔离维度。
- Storage Schema：持久化数据的版本化结构。
- Eviction：浏览器因策略、配额或用户操作删除数据。

## MUST

**源：FE 18 状态管理协议 · §MUST**

- 每个状态声明 owner、更新者、存储位置、生命周期和清理策略。
- server state 由查询缓存层管理。
- 可分享和可恢复状态进入 URL。
- 全局 store 只保存稳定跨页面状态。
- 用户、权限或范围切换时清除越权风险状态。
- 表单区分 initial、current、dirty、errors、submitting 和 conflict。
- 状态拥有的监听器、计时器、观察器、请求、流、连接、Worker 和对象 URL 必须声明释放时机，并在卸载、身份切换或能力关闭时清理。
- 第三方 SDK 实例、DOM 节点、连接句柄等不可序列化资源必须保持为不透明运行时引用，不进入持久化、URL 或可序列化全局状态。
- 持久化状态必须区分用户/租户/环境命名空间，并在登出、权限收缩或版本不兼容时失效或迁移。

**源：FE 19 缓存协议 · §MUST**

- 每个缓存声明 key、参数、身份/权限隔离、stale、保留和失效规则。
- Query Key 包含所有影响结果的筛选和上下文。
- 写操作定义依赖失效矩阵。
- 用户、角色、组织和数据范围切换时清理风险缓存。
- schema 变化时迁移或重置持久化偏好。

**源：FE 32 文件、导入与导出协议 · §MUST**

- 上传声明类型、大小、数量、文件名和安全校验。
- 导入流程包含模板、上传、校验、任务、进度、结果和错误明细。
- 错误明细至少包含行、列、字段、原值、错误码和修复建议。
- 导出明确范围、字段、权限和有效期。
- 大文件使用后台任务，完成后刷新依赖数据。
- 下载时重新鉴权和校验数据范围。

**源：FE 45 浏览器存储协议 · §MUST**

- 每个持久化项必须声明用途、Storage Class、Isolation Key、schema 版本、大小预算、过期时间、迁移/重置策略、清理触发器和 Owner。
- 从浏览器存储读取的数据必须执行 schema、版本、身份、租户和权限校验；失败时保守重置，不得直接信任。
- 必须处理不可用、隐私模式、配额不足、写入失败、被驱逐和数据损坏，并为关键流程提供非持久化降级路径。
- 注销、切换账号/租户、权限变化和数据目的撤回必须清除或重新隔离相关数据。
- 跨标签页共享的数据必须定义冲突、通知、版本和最终一致性策略；不得假设内存状态会自动同步。
- IndexedDB 等版本化数据库必须处理升级阻塞、连接关闭、迁移失败和回滚/重置路径。
- Service Worker 与 Cache API 必须限定作用域、版本化缓存、验证响应来源，并在发布和退出策略中清理过期内容。
- 凭据类数据必须遵守 `universal:security-protocol`；可被脚本读取的存储不得持久化 session identifier、refresh token、secret 或等价凭据，除非存在经批准且有期限的安全例外。

## MUST NOT

**源：FE 18 状态管理协议 · §MUST NOT**

- MUST NOT 将组件状态放入全局 store。
- MUST NOT 复制 server state 到全局 store 手动同步。
- MUST NOT 将敏感或未提交表单写入 URL。
- MUST NOT 共享未隔离的页面状态。
- MUST NOT 把认证凭据、敏感表单原值或第三方资源句柄写入通用持久化状态。
- MUST NOT 让已取消请求、旧订阅或旧身份上下文的迟到结果继续写入当前状态。

**源：FE 19 缓存协议 · §MUST NOT**

- MUST NOT 用同一 key 表示不同筛选或权限范围。
- MUST NOT mutation 后只改视觉而不刷新依赖。
- MUST NOT 长缓存实时敏感数据而无批准。
- MUST NOT 将 server cache 再复制进全局 store。

**源：FE 32 文件、导入与导出协议 · §MUST NOT**

- MUST NOT 静默导入失败。
- MUST NOT 大文件同步阻塞页面。
- MUST NOT 页面自行拼导出字段或绕过权限。
- MUST NOT 成功后遗漏缓存刷新。

**源：FE 45 浏览器存储协议 · §MUST NOT**

- MUST NOT 使用客户端存储值证明身份、权限、价格、审批或其他权威业务事实。
- MUST NOT 多个用户、租户或权限范围复用未隔离的 key、数据库或缓存条目。
- MUST NOT 无限期持久化草稿、文件、接口响应或敏感偏好。
- MUST NOT 在 schema 变化后静默读取旧结构并猜测字段语义。
- MUST NOT 假设客户端存储可靠、保密、不会被修改或永不被驱逐。

## SHOULD

**源：FE 18 状态管理协议 · §SHOULD**

- SHOULD 让状态更新来源唯一且可追踪。
- SHOULD 使用 schema/version 管理持久化状态。

**源：FE 19 缓存协议 · §SHOULD**

- SHOULD 使用结构化 key factory 和集中失效策略。
- SHOULD 在后台刷新时保留可用旧数据并标识 stale。

**源：FE 32 文件、导入与导出协议 · §SHOULD**

- SHOULD 支持取消、重试、结果通知和来源页面跳转。
- SHOULD 让模板和错误文件可追踪 schema 版本。

**源：FE 45 浏览器存储协议 · §SHOULD**

- SHOULD 只在明确需要跨刷新或跨会话时持久化，短生命周期状态优先留在内存。
- SHOULD 提供存储占用、迁移失败和清理结果的安全诊断信息。
- SHOULD 对大型或敏感持久化建立容量、性能和隐私测试。

## Contract

**源：FE 18 状态管理协议 · §Contract**

```text
StateId, Category, Owner, Writer, Storage,
Persistence, IsolationKey, CleanupTrigger
```

**源：FE 19 缓存协议 · §Contract**

```text
Resource, QueryKey, IsolationKeys[], StaleTime,
Retention, RefetchTriggers[], MutationInvalidations[]
```

**源：FE 32 文件、导入与导出协议 · §Contract**

```text
FilePolicy, TemplateVersion, ImportJob,
ErrorRowSchema, ExportScope, ResultExpiry, Permissions
```

**源：FE 45 浏览器存储协议 · §Contract**

```text
StorageId, Purpose, StorageClass, IsolationKeys[], SchemaVersion,
SizeBudget, Expiry, Migration, ResetPolicy, EvictionFallback,
CrossTabPolicy, CleanupTriggers[], Owner
```

## Checklist

**源：FE 18 状态管理协议 · §Checklist**

- [ ] 状态分类正确。
- [ ] writer 和生命周期明确。
- [ ] URL/global 白名单遵守。
- [ ] 切换身份可安全清理。
- [ ] 运行时资源有释放时机，迟到结果不会污染新上下文。
- [ ] 持久化命名空间、版本迁移和失效策略明确。

**源：FE 19 缓存协议 · §Checklist**

- [ ] key 覆盖所有结果参数。
- [ ] 身份与权限隔离安全。
- [ ] mutation 失效完整。
- [ ] schema 迁移明确。

**源：FE 32 文件、导入与导出协议 · §Checklist**

- [ ] 文件策略明确。
- [ ] 导入全流程和部分成功完整。
- [ ] 导出范围与权限一致。
- [ ] 大文件任务化。

**源：FE 45 浏览器存储协议 · §Checklist**

- [ ] 存储必要性和介质选择合理。
- [ ] schema、身份、租户和权限均被校验。
- [ ] 配额、驱逐、损坏和不可用有降级路径。
- [ ] 跨标签页和版本迁移行为明确。
- [ ] 注销和权限变化会安全清理。

## Examples

**源：FE 18 状态管理协议 · §Examples**

### 内容示例，可删除

分页筛选进入 URL，列表数据留在 server cache，抽屉开关留在页面状态。

**源：FE 19 缓存协议 · §Examples**

### 内容示例，可删除

列表 key 同时包含用户数据范围、分页、筛选和排序；权限变化后整体清除。

**源：FE 32 文件、导入与导出协议 · §Examples**

### 内容示例，可删除

导入完成显示成功、失败、跳过和警告数量，并提供字段级错误文件。

**源：FE 45 浏览器存储协议 · §Examples**

### 内容示例，可删除

用户列偏好按用户、租户和 schema 版本隔离；读取失败或版本不兼容时恢复默认值，不影响核心查询和编辑流程。

## Anti-patterns

**源：FE 18 状态管理协议 · §Anti-patterns**

把所有列表、筛选、弹窗和表单都塞进一个全局 store。

**源：FE 19 缓存协议 · §Anti-patterns**

所有用户共用 `['entity-list']`，导致筛选串扰甚至越权复用。

**源：FE 32 文件、导入与导出协议 · §Anti-patterns**

上传后只显示“导入失败”，没有行号、原因、TraceId 或重试路径。

**源：FE 45 浏览器存储协议 · §Anti-patterns**

把 token、完整权限矩阵和接口响应长期写入 localStorage，所有账号共享同一 key，并把读取结果直接当作可信状态。

## Ownership

**源：FE 18 状态管理协议 · §Ownership**

平台 Owner 维护状态基础设施，页面/领域 Owner 负责具体状态归属。

**源：FE 19 缓存协议 · §Ownership**

平台 Owner 维护缓存工具，领域 Owner 定义数据依赖和实时性。

**源：FE 32 文件、导入与导出协议 · §Ownership**

业务 Owner 定义字段，文件/任务 Owner 维护流程，安全 Owner 维护文件策略。

**源：FE 45 浏览器存储协议 · §Ownership**

平台 Owner 维护存储适配和迁移机制，领域 Owner 定义数据必要性与隔离键，安全/隐私 Owner 审核敏感持久化。

## Change Policy

**源：FE 18 状态管理协议 · §Change Policy**

状态位置或持久化变化必须提供迁移、清理和兼容策略，尤其是用户隔离数据。

**源：FE 19 缓存协议 · §Change Policy**

Key 结构或持久化 schema 改变必须版本化并提供迁移/清理。

**源：FE 32 文件、导入与导出协议 · §Change Policy**

模板、字段和错误 schema 变化必须版本化并提供兼容/迁移说明。

**源：FE 45 浏览器存储协议 · §Change Policy**

改变介质、key、schema、隔离或保留策略必须提供迁移、重置、回滚和受影响用户说明，并同步 `universal:state-management-protocol`、`universal:cache-protocol` 与 `universal:privacy-data-lifecycle-protocol`。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
