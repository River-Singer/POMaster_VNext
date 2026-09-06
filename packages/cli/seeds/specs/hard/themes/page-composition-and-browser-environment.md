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
legacy_id: theme:page-composition-and-browser-environment
criticality: standard # 聚合注记：来源无 criticality 字段，取中性默认；info 性注记非执行语义
injection_mode: mixed # 聚合注记：来源无 injection_mode 字段（默认基线 + 任务命中激活模型）；info 性注记非执行语义
stages: [] # 聚合注记：来源无 stages 字段；info 性注记非执行语义
triggers: [] # 聚合注记：来源无 triggers 字段；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/25-page-structure-protocol.md
    sha256: 5fb926a798842262d7f87555e3e63e104c868a401eb27f3c1f899e677fdf5f4f
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/27-rendering-state-protocol.md
    sha256: a640bacd811e05a35075d96ffb99ba51b8b6e11cc2a5443e3bbca0eb124738e4
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/28-form-protocol.md
    sha256: 1359f0b753ece0f633b1aadea11e4ffd03dfc38f5b1f59e8cd869eba502e4807
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/29-routing-url-protocol.md
    sha256: 3066c383489e1cb72271fe48d4a716860c58381d90e46ee1b2f114c61010949e
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/37-browser-device-compatibility-protocol.md
    sha256: 81c0d4bf8996f6cf6b38d1c8514385065785728011222b524d73d8135703a3b3
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/41-design-handoff-protocol.md
    sha256: 335df4991a29eb77222b0596de5db7fcc0bd5d9019ecf9bf882a08cea74c1937
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/42-browser-runtime-lifecycle-protocol.md
    sha256: b328c8b3bab2006254587143c634e17ff554d2f0103056d07edba5ffaba29fe1
    seed_version: B6B-2
---

# 页面构成与浏览器环境

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 25 页面结构协议（pomaster/components/frontend-hard-spec/assets/universal/25-page-structure-protocol.md）**

P1。定义列表、详情、报表、工作台等页面类型的固定区域、顺序和交互容器。

**源：FE 27 渲染状态协议（pomaster/components/frontend-hard-spec/assets/universal/27-rendering-state-protocol.md）**

P1。定义 loading、refreshing、empty、error、permission、partial、offline、stale 和大数据状态。

**源：FE 28 表单协议（pomaster/components/frontend-hard-spec/assets/universal/28-form-protocol.md）**

P1。定义表单布局、模型、校验、联动、提交、回显、草稿、错误和冲突。

**源：FE 29 路由与 URL 协议（pomaster/components/frontend-hard-spec/assets/universal/29-routing-url-protocol.md）**

P1。定义路由命名、参数、URL 状态、返回恢复、守卫和异常页面。

**源：FE 37 浏览器与设备兼容协议（pomaster/components/frontend-hard-spec/assets/universal/37-browser-device-compatibility-protocol.md）**

P2。定义支持浏览器、设备、分辨率、缩放、输入方式和不支持环境提示。

**源：FE 41 设计交付协议（pomaster/components/frontend-hard-spec/assets/universal/41-design-handoff-protocol.md）**

P2。定义设计到代码的组件来源、token、状态、响应式、可访问性和验收交付。

**源：FE 42 浏览器运行时资源生命周期协议（pomaster/components/frontend-hard-spec/assets/universal/42-browser-runtime-lifecycle-protocol.md）**

P1。定义事件监听、计时器、动画帧、Observer、请求、流、长连接、Worker、对象 URL 和页面生命周期资源的所有权、暂停、恢复与释放。

## Non-Scope

**源：FE 25 页面结构协议**

不定义组件内部 API、具体视觉 token 或业务字段。

**源：FE 27 渲染状态协议**

不定义后端错误码、业务状态机和具体文案风格。

**源：FE 28 表单协议**

不定义具体业务字段和后端权威规则，不替代页面结构。

**源：FE 29 路由与 URL 协议**

不定义页面内部布局、权限来源和全局状态库。

**源：FE 37 浏览器与设备兼容协议**

不要求所有项目支持移动端或旧浏览器，不替代响应式布局协议。

**源：FE 41 设计交付协议**

不允许设计稿覆盖正式组件 API、安全、业务规则和工程边界。

**源：FE 42 浏览器运行时资源生命周期协议**

不规定具体框架的生命周期 API，不替代请求重试、缓存新鲜度或后端连接治理。

## Terms

**源：FE 25 页面结构协议**

- Page Type：有稳定目标和结构的页面类别。
- Page Contract：页面 key、结构、权限、状态和导航契约。
- Region：Header、Context、Search、Toolbar、Main、SidePanel、Footer 等区域。

**源：FE 27 渲染状态协议**

- Initial Loading：首次无可用内容加载。
- Background Refresh：保留已有内容的刷新。
- Partial Success：部分对象成功、部分失败。
- Stale Data：仍可展示但可能过期的数据。

**源：FE 28 表单协议**

- FormModel：独立于 DTO 的编辑模型。
- Dirty State：当前值偏离初始值。
- Field Error：绑定具体字段的错误。

**源：FE 29 路由与 URL 协议**

- Route Contract：name、path、meta 和页面 key 的稳定定义。
- Shareable State：刷新、分享、返回后应恢复的状态。
- Ephemeral State：弹窗、hover、未提交输入等临时状态。

**源：FE 37 浏览器与设备兼容协议**

- Support Matrix：正式支持并测试的环境组合。
- Graceful Degradation：能力不足时的安全降级。
- Unsupported Environment：明确不提供质量承诺的环境。

**源：FE 41 设计交付协议**

- Design Handoff：可供实现和验收的完整设计交付。
- State Matrix：默认、加载、空、错误、权限、禁用、长文本和小屏等状态。
- Design Source：设计系统组件和 token 的唯一来源。

**源：FE 42 浏览器运行时资源生命周期协议**

- Runtime Resource：必须显式取得并释放的浏览器资源或异步工作。
- Resource Owner：唯一负责创建、暂停、恢复和销毁资源的作用域。
- Obsolete Work：页面、参数、身份或权限上下文变化后已不再有效的异步工作。
- Page Lifecycle：页面可见、隐藏、冻结、恢复、前进后退缓存和销毁等状态。

## MUST

**源：FE 25 页面结构协议 · §MUST**

- 新页面先选择 Page Type 和 Page Contract。
- 每类页面定义标题、面包屑、筛选、工具栏、主体、分页和详情位置。
- 主次操作、批量操作和状态信息位置一致。
- 抽屉、弹窗和路由跳转有选择规则。
- 同类页面共性问题在共享结构层修复。

**源：FE 27 渲染状态协议 · §MUST**

- 页面覆盖非理想状态并定义优先级。
- 首屏骨架保持主要布局尺寸。
- empty 区分无数据与筛选无结果。
- error、permission 和 offline 提供恢复动作。
- partial success 提供成功/失败/跳过数量和明细。
- 弹层声明销毁、保留、dirty 和关闭策略。

**源：FE 28 表单协议 · §MUST**

- 使用独立 FormModel 和 typed schema。
- 必填、只读、自动计算、回填和无权限字段可区分。
- 前端先做格式校验，后端字段错误定位并聚焦字段。
- 提交防重复并保留失败输入。
- 联动规则集中可测试，隐藏字段清值策略明确。
- dirty 离开、草稿隔离和版本冲突有策略。
- 每个输入必须有持久可见且程序化关联的标签、格式说明和必要性提示；placeholder 不得替代标签。
- 校验错误必须与字段程序化关联，并在可行时给出修复建议；错误摘要必须能导航到对应字段。
- 姓名、地址、联系方式、认证等常见字段必须使用语义正确的 autocomplete/inputmode 等浏览器提示，除非有明确的安全或业务理由。
- 同一流程已提供的数据必须复用或允许用户确认，避免重复录入；删除、提交、转账等高风险动作必须提供复核、确认、撤销或等效防错。

**源：FE 29 路由与 URL 协议 · §MUST**

- 每个页面路由有稳定 name、path、page key、title、权限和布局 meta。
- 分页、筛选、排序、tab 等 Shareable State 进入 URL。
- Query 有 schema、默认值、解析失败兜底和版本策略。
- 返回恢复分页、筛选、排序和必要视图状态。
- 401、403、404、500 和资源删除有统一路由策略。

**源：FE 37 浏览器与设备兼容协议 · §MUST**

- 明确浏览器及最低版本、操作系统、设备和输入方式。
- 明确关键分辨率和 100%/125%/150% 等缩放矩阵。
- 关键流程在所有支持组合验证。
- 不支持环境提供可操作说明或安全降级。
- 使用能力检测而非脆弱 user-agent 业务判断。
- 支持矩阵必须覆盖关键 Web API 能力与约束，包括存储、权限、Worker、文件/媒体能力和长连接；能力缺失或被策略禁用时提供可测试降级。
- 页面必须兼容 `pagehide` / `pageshow`、可见性变化和 bfcache 恢复；恢复后重新校验连接、缓存、权限与数据新鲜度。

**源：FE 41 设计交付协议 · §MUST**

- 交付页面类型、组件来源、token、关键视口和交互流程。
- 提供完整 State Matrix，不只理想态。
- 标注响应式、长文本、缩放、键盘和焦点要求。
- 表格/报表交付列宽、固定列、大数据和导出状态。
- 设计变更有版本、原因、影响范围和通知。
- 设计验收同时检查可用性、可访问性和契约。

**源：FE 42 浏览器运行时资源生命周期协议 · §MUST**

- 每个 Runtime Resource 必须声明 Owner、创建条件、释放动作、暂停/恢复策略和失效触发器。
- `addEventListener`、计时器、动画帧、Observer、订阅、流、WebSocket、EventSource、BroadcastChannel、Worker 和对象 URL 必须有成对的移除、清除、断开、关闭、终止或撤销动作。
- 请求、异步计算和回调在作用域结束或上下文变化时必须取消；无法取消时必须在提交结果前验证当前请求、身份、权限和参数版本。
- 路由离开、组件销毁、注销、切换账号/租户、权限变化和功能关闭必须清理对应资源与敏感上下文。
- 页面隐藏、冻结或进入前进后退缓存时必须暂停无必要轮询和高频工作；恢复时重新验证数据新鲜度、连接状态和权限上下文。
- `beforeunload` 只能在确有未保存数据时动态注册，并在风险解除后移除。
- 重复进入、挂载、恢复或重试必须保持资源数量有界，并有自动化证据证明不会重复订阅或产生开放句柄。

## MUST NOT

**源：FE 25 页面结构协议 · §MUST NOT**

- MUST NOT 新页面临场创造区域顺序。
- MUST NOT 把筛选、操作、表格和分页揉成不可复用单体。
- MUST NOT 让不同页面类型共享含糊结构。
- MUST NOT 绕过 Page Contract 创建路由页面。

**源：FE 27 渲染状态协议 · §MUST NOT**

- MUST NOT 只实现成功有数据状态。
- MUST NOT 后台刷新时清空已有内容。
- MUST NOT 用 Toast 代替页面或字段状态。
- MUST NOT 错误后不给恢复入口。

**源：FE 28 表单协议 · §MUST NOT**

- MUST NOT 直接绑定 DTO。
- MUST NOT 在 template 临时写业务校验。
- MUST NOT 提交失败清空输入。
- MUST NOT 用大量互相触发 watcher 实现联动。
- MUST NOT 只用颜色、图标、toast 或页面顶部文案表达字段错误。
- MUST NOT 禁止密码管理器或无理由阻止粘贴。

**源：FE 29 路由与 URL 协议 · §MUST NOT**

- MUST NOT 把 token、敏感信息、大对象和未提交表单放入 URL。
- MUST NOT 用标题字符串或 URL 截取判断菜单。
- MUST NOT 在页面直接修改全局路由表。
- MUST NOT 改 path/name 而不更新调用方。

**源：FE 37 浏览器与设备兼容协议 · §MUST NOT**

- MUST NOT 只在开发者默认环境验收。
- MUST NOT 未测试就宣称支持。
- MUST NOT 用缩小字体解决小屏。
- MUST NOT 为旧环境引入无人维护的大型 polyfill。
- MUST NOT 使用 `unload` 作为保存或清理的可靠信号；`beforeunload` 仅在存在未保存用户输入时按需注册并及时移除。

**源：FE 41 设计交付协议 · §MUST NOT**

- MUST NOT 未标注来源就要求新建相似组件。
- MUST NOT 用设计稿临时值覆盖 token。
- MUST NOT 只交付桌面理想成功态。
- MUST NOT 通过页面局部 CSS 修补系统问题。

**源：FE 42 浏览器运行时资源生命周期协议 · §MUST NOT**

- MUST NOT 依赖 `unload` 完成保存、上报、释放或业务提交。
- MUST NOT 让过期请求、Worker 或订阅结果覆盖新状态。
- MUST NOT 在隐藏或冻结页面持续无必要轮询、动画或重计算。
- MUST NOT 创建没有 Owner 和释放路径的全局监听、计时器、Observer、长连接或第三方实例。
- MUST NOT 在作用域销毁后继续写入 UI、缓存或用户状态。

## SHOULD

**源：FE 25 页面结构协议 · §SHOULD**

- SHOULD 使用标准 PageShell 和区域组件。
- SHOULD 让上下文、状态和恢复路径可见。

**源：FE 27 渲染状态协议 · §SHOULD**

- SHOULD 使用统一状态组件并允许领域化内容。
- SHOULD 对 stale 和离线数据标识更新时间。

**源：FE 28 表单协议 · §SHOULD**

- SHOULD 大表单按业务语义分区或分步。
- SHOULD 提供错误摘要和首错导航。

**源：FE 29 路由与 URL 协议 · §SHOULD**

- SHOULD 由 Page Contract 生成路由、菜单和埋点关联。
- SHOULD 使用 typed query parser。

**源：FE 37 浏览器与设备兼容协议 · §SHOULD**

- SHOULD 优先支持组织真实使用环境。
- SHOULD 自动运行代表性兼容测试。

**源：FE 41 设计交付协议 · §SHOULD**

- SHOULD 使用设计系统组件实例和 token 变量。
- SHOULD 将高风险交互做可点击原型和键盘说明。

**源：FE 42 浏览器运行时资源生命周期协议 · §SHOULD**

- SHOULD 使用 `AbortSignal` 或等价的统一取消机制聚合作用域内资源。
- SHOULD 为复杂页面提供资源注册表或诊断计数，便于测试重复挂载、导航和恢复。
- SHOULD 优先使用 `pagehide`、`pageshow`、`visibilitychange` 等可恢复的页面生命周期信号。

## Contract

**源：FE 25 页面结构协议 · §Contract**

```text
PageKey, PageType, Regions[], PrimaryActions[],
Permissions[], States[], Navigation, Owner
```

**源：FE 27 渲染状态协议 · §Contract**

```text
State, Priority, Presentation, RecoverAction,
LayoutReservation, AccessibilityAnnouncement
```

**源：FE 28 表单协议 · §Contract**

```text
FormModel, Schema, InitialValues, Validation,
SubmitCommand, DraftPolicy, DirtyPolicy, ConflictPolicy
```

**源：FE 29 路由与 URL 协议 · §Contract**

```text
RouteName, Path, PageKey, Meta, ParamsSchema,
QuerySchema, RestorePolicy, ErrorRoutes
```

**源：FE 37 浏览器与设备兼容协议 · §Contract**

```text
Browser, MinVersion, OS, Device, Viewport,
Zoom, Input, SupportLevel, TestEvidence
```

**源：FE 41 设计交付协议 · §Contract**

```text
PageOrComponent, DesignVersion, SourceComponents[],
Tokens[], States[], Viewports[], Interaction, Accessibility, Owner
```

**源：FE 42 浏览器运行时资源生命周期协议 · §Contract**

```text
ResourceId, ResourceType, OwnerScope, AcquireCondition,
PauseTrigger, ResumeTrigger, DisposeAction, InvalidationTriggers[],
LateResultGuard, DiagnosticEvidence
```

## Checklist

**源：FE 25 页面结构协议 · §Checklist**

- [ ] 页面已归类。
- [ ] 区域顺序正确。
- [ ] 操作、状态和导航完整。
- [ ] 同类页面使用共享结构。

**源：FE 27 渲染状态协议 · §Checklist**

- [ ] 状态矩阵完整。
- [ ] 优先级无冲突。
- [ ] 恢复动作可用。
- [ ] 布局和焦点稳定。

**源：FE 28 表单协议 · §Checklist**

- [ ] 模型和 schema 独立。
- [ ] 字段错误可定位。
- [ ] 防重复与冲突完整。
- [ ] 草稿和离开策略安全。
- [ ] 标签、说明、错误和字段程序化关联。
- [ ] 自动填充、重复录入和高风险动作已检查。

**源：FE 29 路由与 URL 协议 · §Checklist**

- [ ] 路由和页面 key 一致。
- [ ] URL 状态可分享恢复。
- [ ] 临时/敏感状态未进入 URL。
- [ ] 异常路由完整。

**源：FE 37 浏览器与设备兼容协议 · §Checklist**

- [ ] 支持矩阵明确。
- [ ] 关键视口与缩放通过。
- [ ] 不支持提示可用。
- [ ] polyfill 风险已评估。
- [ ] 生命周期/bfcache 恢复通过，关键能力降级可验证。

**源：FE 41 设计交付协议 · §Checklist**

- [ ] 组件和 token 来源明确。
- [ ] 状态与视口完整。
- [ ] 表格/长文本/a11y 已覆盖。
- [ ] 版本和影响可追踪。

**源：FE 42 浏览器运行时资源生命周期协议 · §Checklist**

- [ ] 每个资源有唯一 Owner 和成对释放动作。
- [ ] 路由、身份、权限和参数变化会取消旧工作。
- [ ] 隐藏、冻结和恢复行为已验证。
- [ ] 重复挂载不会增加订阅或开放句柄。
- [ ] 不依赖 unload 完成关键行为。

## Examples

**源：FE 25 页面结构协议 · §Examples**

### 内容示例，可删除

标准列表页按 Header、Search、Toolbar、Table、Pagination、Drawer 排列。

**源：FE 27 渲染状态协议 · §Examples**

### 内容示例，可删除

后台刷新保留表格行，只在工具栏显示轻量进度；失败后仍可查看旧数据。

**源：FE 28 表单协议 · §Examples**

### 内容示例，可删除

后端 422 字段错误映射到对应输入，保留用户数据并聚焦第一个错误。

**源：FE 29 路由与 URL 协议 · §Examples**

### 内容示例，可删除

列表分页筛选写入 query，返回列表时按 URL 恢复，不依赖全局临时 store。

**源：FE 37 浏览器与设备兼容协议 · §Examples**

### 内容示例，可删除

企业桌面项目明确支持受管 Chrome/Edge 版本和关键办公分辨率，不含手机 Safari。

**源：FE 41 设计交付协议 · §Examples**

### 内容示例，可删除

设计交付同时包含正常、无权限、错误、长文本、125% 缩放和键盘焦点状态。

**源：FE 42 浏览器运行时资源生命周期协议 · §Examples**

### 内容示例，可删除

页面作用域通过同一个取消信号管理请求和事件监听；离开页面时关闭订阅、终止 Worker、撤销对象 URL，并拒绝晚到结果写回。

## Anti-patterns

**源：FE 25 页面结构协议 · §Anti-patterns**

每个 CRUD 页面复制一套不同筛选和按钮顺序，逐渐产生不一致。

**源：FE 27 渲染状态协议 · §Anti-patterns**

每次翻页都整页白屏，错误后只弹一次 Toast 且无法重试。

**源：FE 28 表单协议 · §Anti-patterns**

表单直接修改 DTO，失败后 reset，用户输入全部丢失。

**源：FE 29 路由与 URL 协议 · §Anti-patterns**

用中文标题匹配当前菜单，将所有页面筛选永久存入全局状态。

**源：FE 37 浏览器与设备兼容协议 · §Anti-patterns**

只在 1920×1080@100% 测试，1366 笔记本上按钮和表格互相遮挡。

**源：FE 41 设计交付协议 · §Anti-patterns**

只有一张理想截图，未说明组件来源、错误状态和小屏行为，开发只能猜测。

**源：FE 42 浏览器运行时资源生命周期协议 · §Anti-patterns**

每次进入页面都新增轮询和全局监听，离开时不清理；返回页面后同一消息被处理多次，旧请求还覆盖了新筛选结果。

## Ownership

**源：FE 25 页面结构协议 · §Ownership**

UX/前端架构 Owner 维护 Page Type，领域 Owner 维护具体 Page Contract。

**源：FE 27 渲染状态协议 · §Ownership**

页面 Owner 维护状态矩阵，Design System Owner 维护状态组件，API Owner 提供必要信息。

**源：FE 28 表单协议 · §Ownership**

领域 Owner 维护字段规则，前端 Owner 维护 FormModel，后端 Owner 维护权威校验。

**源：FE 29 路由与 URL 协议 · §Ownership**

平台路由 Owner 维护机制，页面 Owner 维护 Route Contract，权限 Owner 维护守卫语义。

**源：FE 37 浏览器与设备兼容协议 · §Ownership**

产品 Owner 定义范围，前端/QA 维护矩阵，平台 Owner 维护构建目标。

**源：FE 41 设计交付协议 · §Ownership**

Design Owner 负责交付完整性，Frontend Owner 负责可实现性，QA/Accessibility Owner 负责验收。

**源：FE 42 浏览器运行时资源生命周期协议 · §Ownership**

平台 Owner 维护资源基础设施，页面/组件 Owner 声明资源边界，测试 Owner 验证释放和恢复行为。

## Change Policy

**源：FE 25 页面结构协议 · §Change Policy**

新增 Page Type 需证明现有类型不能覆盖，并评估所有同类页面和迁移。

**源：FE 27 渲染状态协议 · §Change Policy**

新增状态必须更新页面 contract、组件、文案、可访问性和测试。

**源：FE 28 表单协议 · §Change Policy**

字段或联动变化必须同步 schema、adapter、草稿版本、错误映射和测试。

**源：FE 29 路由与 URL 协议 · §Change Policy**

路由破坏性变化必须提供重定向、链接迁移和监控观察期。

**源：FE 37 浏览器与设备兼容协议 · §Change Policy**

增加或停止支持环境必须公告、更新构建与测试，并提供升级路径。

**源：FE 41 设计交付协议 · §Change Policy**

开发开始后的设计变化必须更新版本和影响范围；公共组件变化走变更治理。

**源：FE 42 浏览器运行时资源生命周期协议 · §Change Policy**

新增资源类型或改变生命周期时必须同步 Owner、释放、恢复、身份失效和测试证据，并检查 `universal:performance-protocol`、`universal:state-management-protocol` 与 `universal:security-protocol`。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
