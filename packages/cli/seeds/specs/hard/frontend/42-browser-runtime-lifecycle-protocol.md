---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/42-browser-runtime-lifecycle-protocol.md
seed_source_sha256: b328c8b3bab2006254587143c634e17ff554d2f0103056d07edba5ffaba29fe1
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 42 浏览器运行时资源生命周期协议

## Scope

P1。定义事件监听、计时器、动画帧、Observer、请求、流、长连接、Worker、对象 URL 和页面生命周期资源的所有权、暂停、恢复与释放。

## Non-Scope

不规定具体框架的生命周期 API，不替代请求重试、缓存新鲜度或后端连接治理。

## Terms

- Runtime Resource：必须显式取得并释放的浏览器资源或异步工作。
- Resource Owner：唯一负责创建、暂停、恢复和销毁资源的作用域。
- Obsolete Work：页面、参数、身份或权限上下文变化后已不再有效的异步工作。
- Page Lifecycle：页面可见、隐藏、冻结、恢复、前进后退缓存和销毁等状态。

## MUST

- 每个 Runtime Resource 必须声明 Owner、创建条件、释放动作、暂停/恢复策略和失效触发器。
- `addEventListener`、计时器、动画帧、Observer、订阅、流、WebSocket、EventSource、BroadcastChannel、Worker 和对象 URL 必须有成对的移除、清除、断开、关闭、终止或撤销动作。
- 请求、异步计算和回调在作用域结束或上下文变化时必须取消；无法取消时必须在提交结果前验证当前请求、身份、权限和参数版本。
- 路由离开、组件销毁、注销、切换账号/租户、权限变化和功能关闭必须清理对应资源与敏感上下文。
- 页面隐藏、冻结或进入前进后退缓存时必须暂停无必要轮询和高频工作；恢复时重新验证数据新鲜度、连接状态和权限上下文。
- `beforeunload` 只能在确有未保存数据时动态注册，并在风险解除后移除。
- 重复进入、挂载、恢复或重试必须保持资源数量有界，并有自动化证据证明不会重复订阅或产生开放句柄。

## MUST NOT

- MUST NOT 依赖 `unload` 完成保存、上报、释放或业务提交。
- MUST NOT 让过期请求、Worker 或订阅结果覆盖新状态。
- MUST NOT 在隐藏或冻结页面持续无必要轮询、动画或重计算。
- MUST NOT 创建没有 Owner 和释放路径的全局监听、计时器、Observer、长连接或第三方实例。
- MUST NOT 在作用域销毁后继续写入 UI、缓存或用户状态。

## SHOULD

- SHOULD 使用 `AbortSignal` 或等价的统一取消机制聚合作用域内资源。
- SHOULD 为复杂页面提供资源注册表或诊断计数，便于测试重复挂载、导航和恢复。
- SHOULD 优先使用 `pagehide`、`pageshow`、`visibilitychange` 等可恢复的页面生命周期信号。

## Contract

```text
ResourceId, ResourceType, OwnerScope, AcquireCondition,
PauseTrigger, ResumeTrigger, DisposeAction, InvalidationTriggers[],
LateResultGuard, DiagnosticEvidence
```

## Checklist

- [ ] 每个资源有唯一 Owner 和成对释放动作。
- [ ] 路由、身份、权限和参数变化会取消旧工作。
- [ ] 隐藏、冻结和恢复行为已验证。
- [ ] 重复挂载不会增加订阅或开放句柄。
- [ ] 不依赖 unload 完成关键行为。

## Examples

### 内容示例，可删除

页面作用域通过同一个取消信号管理请求和事件监听；离开页面时关闭订阅、终止 Worker、撤销对象 URL，并拒绝晚到结果写回。

## Anti-patterns

每次进入页面都新增轮询和全局监听，离开时不清理；返回页面后同一消息被处理多次，旧请求还覆盖了新筛选结果。

## Ownership

平台 Owner 维护资源基础设施，页面/组件 Owner 声明资源边界，测试 Owner 验证释放和恢复行为。

## Change Policy

新增资源类型或改变生命周期时必须同步 Owner、释放、恢复、身份失效和测试证据，并检查 `universal:performance-protocol`、`universal:state-management-protocol` 与 `universal:security-protocol`。
