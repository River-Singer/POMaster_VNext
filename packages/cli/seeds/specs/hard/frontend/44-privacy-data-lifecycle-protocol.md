---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/44-privacy-data-lifecycle-protocol.md
seed_source_sha256: 5b3472bba296c1bb437c3ce41e1c937b636605e39b78cf06747d1010e46ba08e
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 44 隐私与客户端数据生命周期协议

## Scope

P0。约束个人、敏感和可关联数据在前端的收集、访问、传输、存储、复制、第三方共享、保留、撤回与清理。

## Non-Scope

不替代适用法律、组织隐私政策、后端数据治理或安全控制；安全负责防止未授权访问，隐私还负责数据是否必要以及应保留多久。

## Terms

- Data Purpose：收集或处理数据的明确用户/业务目的。
- Data Minimization：仅处理实现已批准目的所需的最少数据。
- User Control：同意、拒绝、撤回、删除或选择数据范围的有效机制。
- Privacy Boundary：数据进入浏览器、第三方 SDK、剪贴板、通知、下载或监控系统的边界。

## MUST

- 每类受保护数据必须声明分类、目的、来源、接收方、客户端存储、保留期、删除触发器、用户控制和 Owner。
- 请求、缓存、日志、埋点和第三方共享必须限制为已批准目的所需的最小字段和最小精度。
- 浏览器存储、草稿、下载、剪贴板和通知必须遵守身份、租户、权限、过期和清理策略。
- 注销、切换账号/租户、权限降低、目的撤回或数据过期时，必须停止相关处理并清理无权继续保留的数据与运行时资源。
- 在政策要求同意或选择时，数据采集和第三方 SDK 必须在有效选择之后启用；撤回必须阻止后续采集且不得暗中回退。
- 调用摄像头、麦克风、位置、剪贴板等敏感能力必须由可理解的用户动作触发，并提供拒绝后的安全路径。
- 第三方脚本和数据目的必须有清单、字段白名单、目标域、保留策略、禁用方式和负责人。
- 客户端持久化内容读取时必须视为不可信输入，并执行 schema、身份、权限和版本校验。

## MUST NOT

- MUST NOT 为“以后可能有用”收集、传输或长期保留额外数据。
- MUST NOT 将敏感原值、搜索原文、文件内容或可识别信息放入 URL、日志、trace、埋点或未批准第三方载荷。
- MUST NOT 将去标识化、哈希或内部 ID 自动视为匿名且无隐私风险。
- MUST NOT 用客户端存储内容证明身份、权限或用户已同意。
- MUST NOT 通过默认勾选、阻碍撤回或与目的无关的强制授权获取选择。

## SHOULD

- SHOULD 对新增浏览器权限、稳定标识符、第三方 SDK、跨域传输和持久化数据进行隐私评审。
- SHOULD 为数据访问、导出、删除、撤回和过期清理建立可测试路径。
- SHOULD 优先在本地或边界处聚合、截断或脱敏，避免传输不必要原值。

## Contract

```text
DataClass, Purpose, MinimumFields, Source, Recipients[],
ClientStorage, Retention, DeletionTriggers[], UserControl,
ThirdPartyPolicy, Redaction, Owner, Evidence
```

## Checklist

- [ ] 每类数据有明确目的和最小字段。
- [ ] 存储、保留、撤回和清理可执行。
- [ ] 第三方和遥测载荷已白名单化。
- [ ] 身份、租户和权限变化不会遗留数据。
- [ ] 敏感权限有拒绝和撤回路径。

## Examples

### 内容示例，可删除

分析事件只发送批准的事件 key、粗粒度结果和随机 operation id；搜索原文、用户输入和业务数据不进入事件载荷，撤回后停止初始化 SDK。

## Anti-patterns

为了未来分析把完整表单、查询词和页面文本发送给第三方 SDK，并在用户退出后继续保留在本地缓存。

## Ownership

隐私/安全 Owner 定义政策，产品 Owner 证明目的与必要性，前端 Owner 实施边界、用户控制和清理，数据 Owner 审核接收与保留。

## Change Policy

新增目的、字段、接收方、持久化或保留期必须重新评审并更新用户控制；不得用功能发布记录替代隐私批准。同步检查 `universal:security-protocol`、`universal:analytics-protocol` 与 `universal:browser-storage-protocol`。
