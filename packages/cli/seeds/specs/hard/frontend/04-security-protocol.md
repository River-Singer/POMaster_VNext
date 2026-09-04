---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/04-security-protocol.md
seed_source_sha256: 4d9bb6bd34a64fcc3e362c969492bc326533e16ef4c6d2284dc01442733504e6
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 04 安全协议

## Scope

P0。从访问控制与威胁防御视角约束前端代码：XSS/CSRF/CSP、认证/token 生命周期、授权边界、输入校验、敏感数据脱敏、依赖与供应链、传输安全、第三方脚本/iframe/postMessage、客户端存储、错误信息泄露。本协议聚焦前端/客户端可治理项；后端安全、基础设施安全、隐私政策与组织安全流程不替代。

与 `universal:16-error-handling-protocol` 的边界：安全只审计错误信息泄露风险，完整错误处理策略见 16。
与 `universal:17-permission-protocol` 的边界：安全聚焦“敏感数据不下发”和“前端表现不能替代后端强制授权”，权限 UI 规则见 17。
与 `universal:40-analytics-protocol` 的边界：埋点 schema 与去重由 40 负责，安全只审计埋点/日志中不得出现敏感原值。
与 `universal:44-privacy-data-lifecycle-protocol` 的边界：数据是否该收集、保留多久由 44 负责，安全负责防止未授权访问与脱敏。
与 `universal:45-browser-storage-protocol` 的边界：存储介质选择与隔离策略由 45 负责，安全负责凭据/敏感数据不得持久化到脚本可读存储。

## Non-Scope

不替代后端鉴权、服务端校验、安全审计、基础设施安全、隐私政策和组织安全流程。

## Terms

- Threat Defense：防止常见 Web 攻击的纵深防御集合。
- Dangerous Sink：把字符串解释为 HTML、脚本、URL、CSS 或导航目标的浏览器入口。
- Sanitization：按白名单清洗不可信内容。
- Third-party Execution：在本页面 origin 或受信 iframe 中执行的外部脚本、标签或组件。
- CSP：Content-Security-Policy，默认采用严格策略。
- PII：可用于识别个人身份的数据。
- Sensitive Data：受隐私、业务或权限保护的数据。
- SRI：Subresource Integrity，外部资源完整性校验。

## MUST

- 建立项目级安全 Owner，对 12 个安全维度（SEC-01~SEC-12）建立要求、检查点和异常审批流程。
- 统一定义 token、cookie、CSRF、退出和刷新策略。
- 所有输入、URL、文件名、消息和 HTML 默认不可信。
- 不可信数据必须在进入系统时校验，并在输出到不同上下文时使用对应的编码、净化或安全类型；类型声明不能替代运行时校验。
- 字段脱敏、复制、导出和日志必须遵守数据权限。
- 上传和下载必须由服务端再次校验权限、类型和范围。
- 安全失败必须采用保守默认行为。
- Cookie 会话必须明确 `Secure`、`HttpOnly`、`SameSite`、Domain、Path 和生命周期；状态变更请求必须有正式 CSRF 防护，不能只依赖 SameSite。
- 跨窗口消息必须固定 `targetOrigin`，接收端校验 `origin`、`source` 和消息 schema；消息内容只按数据处理。
- return URL、外链、下载地址和资源 URL 必须限制为安全协议及受信来源，不得由不可信参数直接决定。
- 第三方脚本、iframe 和标签必须记录 Owner、来源、权限、数据范围、完整性/版本、CSP 与撤除方式，并遵循最小能力原则。
- 注销、切换账号/租户、权限变化或会话失效时必须清除敏感缓存、存储、订阅、Worker 和长连接。

### SEC-01 XSS / 输出编码 / 危险 sink 管控

- MUST 将用户、URL、API、存储、第三方消息来源的数据视为不可信输入。
- MUST 在输出到 HTML、JavaScript、URL、CSS、SVG、style 属性前使用对应上下文编码。
- MUST NOT 使用 `v-html` / `innerHTML` / `dangerouslySetInnerHTML` 渲染不可信内容；富文本必须使用白名单 sanitizer。
- MUST NOT 将不可信数据拼接到 `eval`、`setTimeout`、`setInterval`、`new Function`、`<script>`、内联事件处理器。
- MUST 对富文本/markdown 渲染建立白名单标签与属性清单，禁止 `<script>`、`<style>`、事件属性及未知协议。
- MUST 使用 Trusted Types 作为纵深防御。
- MUST 在组件/页面级声明是否需要渲染外部 HTML，并记录 owner 与 sanitizer 策略。

### SEC-02 CSRF / 状态变更请求防护

- MUST 所有状态变更请求（POST/PUT/PATCH/DELETE）具备 CSRF 防护，不能只依赖 SameSite Cookie。
- MUST 使用双重提交 cookie 或同步器 token；token 必须每次会话/请求不可预测且由后端验证。
- MUST 在表单提交、AJAX/Fetch、上传、批量操作、GraphQL mutation 中携带 CSRF token。
- MUST 将 Cookie 显式设置为 `SameSite=Lax` 或 `SameSite=Strict`；跨域 `SameSite=None` 必须同时设置 `Secure`。
- MUST 对 AJAX/API 请求使用自定义头，利用浏览器跨域预检限制简单请求被 CSRF 利用。
- MUST NOT 将 CSRF token 放进 URL 查询参数或持久化到可被脚本读取的存储。
- MUST 在登录、切换租户、敏感操作后轮换 CSRF token。

### SEC-03 CSP / 安全响应头

- MUST 部署 CSP，默认 `default-src 'self'`；脚本/样式/img/font/connect/frame 按业务最小白名单开放。
- MUST 禁止 `'unsafe-inline'` 与 `'unsafe-eval'`；如无法避免，必须使用 nonce 或 hash，并记录例外。
- MUST 配置 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY/SAMEORIGIN`（或 CSP `frame-ancestors`）、`Referrer-Policy: strict-origin-when-cross-origin` 或更严。
- MUST 配置 `Permissions-Policy` 限制未使用的浏览器能力。
- MUST 对 CSP 采用 report-only → enforce 渐进收紧策略，并有 owner 审批放宽。
- MUST NOT 在联调或生产中长期使用 CSP-Report-Only 作为规避手段。
- MUST 在页面级声明是否允许内嵌 iframe、是否允许加载第三方脚本，并映射到 CSP 指令。

### SEC-04 认证 / Token 生命周期

- MUST 使用 `HttpOnly`、`Secure`、`SameSite` Cookie 存储 session identifier。
- MUST 实现 refresh token 轮换与绑定机制，检测并撤销 reuse。
- MUST 在 token 即将过期前使用 silent refresh 或显式重新认证，不得在 URL 中传递 token。
- MUST 实现统一登出：清除服务端会话、客户端内存 token、触发所有标签页/Worker 登出事件。
- MUST NOT 在源码、环境变量模板、日志、错误消息、URL、LocalStorage、URL fragment 中暴露 access/refresh token / client secret。
- MUST 对密码/MFA/生物识别输入框禁用自动填充例外需经审批，并确保表单通过 HTTPS 提交。
- MUST 在切换账号/租户、权限变化、长时间无操作、检测到异常时要求重新认证。

### SEC-05 授权 / 前端能力隐藏 vs 后端强制

- MUST 明确每个页面/路由/按钮/API 所需 capability/permission，前端仅做 UI 呈现，最终授权由后端执行。
- MUST NOT 用前端隐藏菜单或按钮替代后端鉴权。
- MUST 后端返回字段按权限脱敏，前端不得获取全量敏感数据后再自行过滤或仅 CSS 隐藏。
- MUST 对“可直达 URL”执行页面级权限守卫，无权限时展示一致拒绝状态。
- MUST 在权限降低、角色变化、租户切换后刷新或降级页面状态，不能保留旧权限渲染。
- MUST 对导出、删除、审批、批量操作等高影响动作增加二次确认或后端 challenge。

### SEC-06 输入校验 / 输出净化

- MUST 将客户端校验仅视为 UX 辅助，服务端校验为权威；前端仍需执行同步/异步校验以提升体验。
- MUST 对所有输入执行白名单校验（类型、长度、范围、格式、枚举、业务规则），拒绝而非清洗恶意输入。
- MUST 对 URL、return URL、重定向目标、下载地址、iframe src 使用受信白名单。
- MUST 对文件名、扩展名、MIME 类型进行白名单校验，上传/下载需后端二次校验。
- MUST 对结构化输入（JSON、CSV、粘贴、拖放）执行 schema 校验。
- MUST NOT 在 URL 中放置敏感参数、token、内部 ID 或用户输入原文。
- MUST 对输出到 HTML/URL/CSS/JS 的内容按 SEC-01 执行上下文编码。

### SEC-07 敏感数据脱敏 / PII 处理

- MUST 在页面/组件/表格/详情中按数据分类与字段权限对敏感字段脱敏。
- MUST 对 PII 建立字段级敏感度标签。
- MUST NOT 将敏感原值写入浏览器 console、日志、埋点、错误监控、剪贴板、URL、localStorage、下载文件。
- MUST 对复制、导出、打印功能实施权限控制与脱敏策略；高敏感字段导出需审计与额外授权。
- MUST 在传输过程中使用 TLS 1.2+ 加密敏感数据。
- MUST 与 44-privacy 协议协同：安全负责防未授权访问与脱敏，privacy 负责是否该收集/保留多久。

### SEC-08 依赖与供应链

- MUST 使用 lockfile 并对依赖变更执行 diff 评审。
- MUST 在 CI 中运行 SCA 扫描，阻断存在高严重度 CVE 的依赖。
- MUST 对 CDN/外部脚本使用 SRI hash，禁止引入无完整性校验的第三方脚本。
- MUST 维护允许使用的包范围/owner 清单；禁止从个人仓库、未验证 npm 镜像或 Git URL 直接安装生产依赖。
- MUST 对关键依赖做签名/发布来源验证（npm provenance、GitHub verified commits）。
- MUST 在 package.json 中区分 dependencies / devDependencies；生产包不得包含开发/构建工具。
- MUST 对废弃、长期未维护、许可证冲突的依赖建立淘汰计划。
- MUST NOT 将生产凭据、内部 registry token 写入 package manager 配置或源码。

### SEC-09 传输安全

- MUST 所有页面、API、静态资源、WebSocket、SSE 通过 HTTPS / WSS 传输；禁止明文 HTTP 生产流量。
- MUST 配置 HSTS，包含 `includeSubDomains` 与合理 `max-age`（建议 ≥ 1 年）。
- MUST 配置 TLS 1.2+；HTTPS 页面不得加载 HTTP 资源（混合内容）。
- MUST 在开发/测试环境中不得通过关闭证书校验绕过 HTTPS（除非短期本地沙箱并有审批）。
- MUST 对敏感 API 启用 certificate transparency 监控与异常证书告警。

### SEC-10 第三方脚本 / iframe / postMessage / 点击劫持

- MUST 维护第三方脚本、iframe、widget、SDK 清单，记录 owner、来源域、权限范围、数据范围、版本、SRI、CSP 与撤除方式。
- MUST 对 iframe 使用 `sandbox` 属性，并按需限制 `allow` 权限。
- MUST 对 `postMessage` 固定 `targetOrigin`，接收端校验 `origin`、`source` 与消息 schema；不得将消息内容直接作为 HTML/代码执行。
- MUST 使用 `X-Frame-Options: DENY/SAMEORIGIN` 或 CSP `frame-ancestors` 防止点击劫持。
- MUST 对第三方脚本执行最小能力原则。
- MUST 在用户撤回同意或第三方 SDK 不再需要时停止加载并清理其状态/缓存。
- MUST NOT 使用 `postMessage('*')` 或在跨窗口消息中直接执行 eval/innerHTML。

### SEC-11 客户端存储安全

- MUST 明确每个持久化项的 StorageClass、用途、隔离键、过期时间、清理触发器（见 45-browser-storage-protocol）。
- MUST 禁止将 session identifier、refresh token、access token、secret、密码等价凭据持久化到 localStorage/sessionStorage/IndexedDB（除非经安全 Owner 批准的短期例外）。
- MUST 对从 localStorage/sessionStorage/IndexedDB 读取的数据执行 schema、身份、租户、权限校验；失败保守重置。
- MUST 在注销、切换账号/租户、权限降低、数据目的撤回时清除或重新隔离相关数据。
- MUST 对跨标签页共享数据定义冲突、通知、版本与一致性策略；不得用客户端存储证明身份或权限。
- SHOULD 短生命周期状态优先保留在内存；需要跨刷新持久化时优先选择 HttpOnly Cookie，其次才是脚本可读取存储。

### SEC-12 错误信息泄露

- MUST 将后端错误归一化为稳定 code、用户安全文案与 traceId；不得向用户展示堆栈、SQL、内部路径、配置项、敏感参数。
- MUST 禁止在错误消息、Toast、Modal、URL、日志、监控 payload 中暴露 token、密码、PII、内部 ID。
- MUST 对 401/403/404/409/422/429/5xx 分别处理，避免通过错误差异泄露权限/存在性信息。
- MUST 在前端异常捕获（Error Boundary、window.onerror、unhandledrejection）中过滤敏感字段后再上报监控。
- MUST 提供安全的用户反馈渠道（traceId / 客服入口）。
- 完整错误处理语义见 16-error-handling-protocol；security 只审计信息泄露风险。

### 分层安全责任（按目录层级）

安全是架构期横切能力，按目录层级分担责任；每层有明确的检查点与禁止行为。层级划分与 `09-module-boundary-protocol` 一致。

- **app 层 — 全局安全策略与初始化**：配置 CSP/安全响应头、全局错误处理、认证 SDK 初始化、logout/tenant-switch 广播；统一安全上下文与 traceId。MUST NOT 在应用入口无差别关闭 CSP/证书校验/CSRF 作为联调便利；MUST NOT 将全局 token 或 secret 注入应用级 provider。
- **platform 层 — 状态与网络层安全**：HTTP client 统一注入 CSRF/token/安全头；全局状态库存储划分安全等级；路由守卫集中处理权限降级。MUST NOT 在全局 store 中存放凭据或完整敏感对象；MUST NOT 让业务请求自行决定 CSRF/token 头格式。
- **api 层 — 请求安全契约**：每个 API 调用按分类携带正确的 token/CSRF/trace-id；请求/响应敏感字段脱敏；错误响应不泄露内部信息。MUST NOT 在 URL/日志中打印 token；MUST NOT 用前端隐藏替代后端鉴权。
- **domain 层 — 计算与转换安全**：复杂计算/转换对不可信输入执行白名单校验；异步任务状态机记录安全事件；数据导出/打印权限校验。MUST NOT 在 domain 层直接拼接用户输入到 URL/CSS/JS；MUST NOT 在 domain 层直接读取 localStorage 凭据。
- **feature 层 — 页面级安全**：每个页面声明 CSP/第三方执行/敏感字段/权限守卫需求；页面内 return URL、外链、iframe、postMessage 按白名单执行；错误展示使用归一化文案。MUST NOT 页面单独发明不兼容的 token 存储或错误格式；MUST NOT 页面直接 import 未经清单化的第三方脚本。
- **shared 层 — 组件与工具安全**：公共组件暴露安全属性（sanitizer_policy、mask_rule、allowed_actions）；工具函数提供上下文编码/URL 白名单/敏感字段过滤。MUST NOT 把组件内部调试日志当正式安全审计；MUST NOT 在共享库中硬编码业务 secret 或页面级 capability。

## MUST NOT

- MUST NOT 渲染未经清洗的 HTML。
- MUST NOT 将 secret、token 或生产凭据写入源码、URL、日志或公开变量。
- MUST NOT 将 session identifier、refresh token 或等价凭据持久化到可被脚本读取的存储，除非存在经安全 Owner 批准且有期限的例外。
- MUST NOT 用前端隐藏替代后端鉴权。
- MUST NOT 在监控或埋点记录敏感原值。
- MUST NOT 对敏感消息使用 `postMessage('*')`，或把跨窗口消息直接解释为 HTML/代码。
- MUST NOT 以关闭 CSP、CSRF、证书校验、输入校验或浏览器安全策略作为长期联调方案。
- MUST NOT 在状态变更请求中缺少 CSRF 防护。
- MUST NOT 将 token/secret/PII 放入 URL、console、剪贴板、下载文件或错误消息。
- MUST NOT 加载无 SRI/无来源清单的第三方脚本或 iframe。
- MUST NOT 用 localStorage/sessionStorage 证明身份、权限或同意状态。

## SHOULD

- SHOULD 使用由 report-only 逐步收紧到 enforce 的 CSP、受控 sanitizer/Trusted Types、依赖安全扫描和短期下载 URL；CSP 是纵深防御，不能替代输出编码和净化。
- SHOULD 对外部静态资源使用自托管、完整性校验或受控沙箱，并限制 iframe 能力和未使用的浏览器权限。
- SHOULD 对高风险输入、文件和权限变化建立专项测试。
- SHOULD 对关键页面/组件/API 建立安全需求登记册（security-requirements）并指派 owner。
- SHOULD 在 CI 中集成静态安全扫描（eslint-plugin-security / Semgrep）和 SCA。
- SHOULD 将 security 需求纳入 page-tech-spec §12 非功能需求与运行边界。

## Contract

```text
SecurityRequirement, Scope, Dimension, Priority, Status, Owner,
SanitizerPolicy, SinkAllowlist, CsrfMechanism, SameSitePolicy, CspMode,
CspPolicyHash, AllowedScriptSources, AllowedStyleSources, PermissionsPolicy,
SessionStorage, RefreshStrategy, BackendEnforcement, FrontendPresentation,
SensitiveFields, MaskingRule, InputSchemaId, RedirectAllowlist,
FileAllowlistExtensions, LockfileRequired, ScaTool, SriRequiredFor,
AllowedRegistries, HttpsRequired, HstsMaxAgeSeconds, MinTlsVersion,
ThirdPartyId, AllowedOrigins, IframeSandbox, PostMessageTargetOrigin,
FrameAncestorsPolicy, StorageClass, AllowedDataTypes, ForbiddenDataTypes,
CleanupTriggers, ErrorNormalization, SafeFields, ForbiddenFields,
MonitoringRedaction
```

分层安全责任契约（按目录层级，与 `09-module-boundary-protocol` 一致）：

```text
Layer, Responsibility, CheckPoint, Forbidden
app, 全局安全策略与初始化, CSP/安全头配置 + 全局错误处理 + 认证初始化 + logout广播, 入口关闭CSP/证书校验/CSRF || 注入全局token/secret
platform, 状态与网络层安全, HTTP统一安全头 + 全局store分级 + 路由权限守卫, store存凭据 || 业务请求自决CSRF/token格式
api, 请求安全契约, token/CSRF/trace-id正确携带 + 敏感字段脱敏 + 错误不泄露, URL/日志打印token || 前端隐藏替后端鉴权
domain, 计算与转换安全, 输入白名单校验 + 异步任务安全事件 + 导出权限校验, domain拼接用户输入到URL/CSS/JS || domain读localStorage凭据
feature, 页面级安全, 页面CSP/第三方/敏感字段/权限守卫 + returnURL白名单 + 归一化错误, 页面自造token存储/错误格式 || 直接import未清单第三方脚本
shared, 组件与工具安全, 组件安全属性 + 编码/白名单/过滤工具, 调试日志当安全审计 || 硬编码业务secret或capability
```

## Checklist

- [ ] 项目级安全 Owner 已指派，12 个维度（SEC-01~SEC-12）要求/检查点/异常审批已建立。
- [ ] XSS：不可信输入输出编码、危险 sink 管控、富文本 sanitizer/Trusted Types 已确认。
- [ ] CSRF：状态变更请求带 token、Cookie SameSite/Secure、token 不在 URL。
- [ ] CSP：严格策略、安全响应头、Permissions-Policy、report-only→enforce 路径已确认。
- [ ] 认证：token 存储最小化、refresh token 轮换、统一登出、异常重新认证。
- [ ] 授权：前端仅 UI 呈现，后端强制；敏感字段由后端脱敏；直达 URL 有权限守卫。
- [ ] 输入校验：白名单校验、return URL/重定向/文件名白名单、结构化输入 schema 校验。
- [ ] 敏感数据：字段级敏感度标签、脱敏规则、复制/导出/打印权限、传输加密。
- [ ] 供应链：lockfile + SCA、SRI、registry 白名单、依赖淘汰计划。
- [ ] 传输：HTTPS/WSS、HSTS、TLS 1.2+、混合内容阻断。
- [ ] 第三方执行：清单化、iframe sandbox/postMessage origin、点击劫持防护、最小能力。
- [ ] 客户端存储：凭据不持久化到脚本可读存储、读取校验、清理触发器。
- [ ] 错误泄露：错误归一化、不暴露堆栈/内部路径/token/PII、监控脱敏。
- [ ] 分层安全责任已按 app/platform/api/domain/feature/shared 分担。

## Examples

登录表单提交后服务端返回 `HttpOnly; Secure; SameSite=Strict` 的 session cookie；前端在内存中保存短期 access token，refresh token 由后端 Cookie 存储并自动轮换；登出时调用 revoke 接口并触发 BroadcastChannel 清理所有标签页状态。

搜索框输入先经前端白名单校验长度/字符集，服务端再次校验；查询参数中的关键字经 URL 编码，渲染到结果列表时经 HTML entity 编码；结果中的富文本由后端给出白名单 HTML，前端使用 DOMPurify 二次清洗并配置 Trusted Types policy。

列表页导出按钮触发下载前，前端校验用户具备 `EXPORT` capability，后端再次校验并返回一次性签名下载 URL（短期有效），文件名与 MIME 类型经白名单校验；导出审计日志记录操作人但不包含敏感明细。

第三方客服 widget 必须在第三方执行清单登记，iframe 使用 `sandbox="allow-scripts"` 并限制 `allow` 权限，postMessage 仅向 `https://trusted-cdn.example.com` 发送且接收端校验 origin；widget 停用后立即从 CSP/页面中移除。

## Anti-patterns

把 access token 放进 URL 或 localStorage，导致 XSS 可直取凭据。

前端按角色名硬编码隐藏按钮，未调用后端鉴权，用户可直接构造请求执行敏感操作。

使用 `v-html` 渲染用户输入，依赖“用户不会输入恶意代码”假设，最终被 XSS。

生产环境关闭 CSP 或将 `'unsafe-inline'`/`'unsafe-eval'` 作为默认策略。

将 CSRF token 作为 URL 参数或存入 sessionStorage，被第三方脚本读取。

从 localStorage 读取 `userRole` 并据此判断权限，未验证来源与 freshness。

错误提示直接展示后端返回的堆栈或 SQL，泄露内部实现。

HTTPS 页面加载 HTTP 图片/脚本，触发混合内容并绕过 CSP 边界。

## Ownership

安全 Owner 负责政策、12 维度基线和异常审批；平台 Owner 负责 CSP/安全头/HTTP client 安全拦截；业务与后端 Owner 负责数据权限与后端强制；前端 Owner 负责页面级安全呈现与组件安全属性；DevOps Owner 负责传输层与证书管理。

## Change Policy

任何安全放宽必须经过风险评估、批准和期限；高危问题修复优先于交互便利性。新增第三方脚本、放宽 CSP、引入新的 token 存储方式、允许敏感字段明文展示或改变默认安全失败模式，必须走 `universal:change-governance-protocol` 的受控变更流程。
