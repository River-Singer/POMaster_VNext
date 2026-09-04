---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/18-state-management-protocol.md
seed_source_sha256: 72445fcd0ac7e21ebea38a5f72849543f936c7a96eee54eb99330226acaaf400
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 18 状态管理协议

## Scope

P1。定义 local、page、URL、global、server、form 和 persisted state 的归属与生命周期。

## Non-Scope

不指定状态库品牌，不替代缓存和路由协议。

## Terms

- Local State：单组件短生命周期状态。
- Server State：远端权威数据及请求生命周期。
- URL State：需分享、刷新或返回恢复的状态。
- Persisted Preference：跨会话用户偏好。

## MUST

- 每个状态声明 owner、更新者、存储位置、生命周期和清理策略。
- server state 由查询缓存层管理。
- 可分享和可恢复状态进入 URL。
- 全局 store 只保存稳定跨页面状态。
- 用户、权限或范围切换时清除越权风险状态。
- 表单区分 initial、current、dirty、errors、submitting 和 conflict。
- 状态拥有的监听器、计时器、观察器、请求、流、连接、Worker 和对象 URL 必须声明释放时机，并在卸载、身份切换或能力关闭时清理。
- 第三方 SDK 实例、DOM 节点、连接句柄等不可序列化资源必须保持为不透明运行时引用，不进入持久化、URL 或可序列化全局状态。
- 持久化状态必须区分用户/租户/环境命名空间，并在登出、权限收缩或版本不兼容时失效或迁移。

## MUST NOT

- MUST NOT 将组件状态放入全局 store。
- MUST NOT 复制 server state 到全局 store 手动同步。
- MUST NOT 将敏感或未提交表单写入 URL。
- MUST NOT 共享未隔离的页面状态。
- MUST NOT 把认证凭据、敏感表单原值或第三方资源句柄写入通用持久化状态。
- MUST NOT 让已取消请求、旧订阅或旧身份上下文的迟到结果继续写入当前状态。

## SHOULD

- SHOULD 让状态更新来源唯一且可追踪。
- SHOULD 使用 schema/version 管理持久化状态。

## Contract

```text
StateId, Category, Owner, Writer, Storage,
Persistence, IsolationKey, CleanupTrigger
```

## Checklist

- [ ] 状态分类正确。
- [ ] writer 和生命周期明确。
- [ ] URL/global 白名单遵守。
- [ ] 切换身份可安全清理。
- [ ] 运行时资源有释放时机，迟到结果不会污染新上下文。
- [ ] 持久化命名空间、版本迁移和失效策略明确。

## Examples

### 内容示例，可删除

分页筛选进入 URL，列表数据留在 server cache，抽屉开关留在页面状态。

## Anti-patterns

把所有列表、筛选、弹窗和表单都塞进一个全局 store。

## Ownership

平台 Owner 维护状态基础设施，页面/领域 Owner 负责具体状态归属。

## Change Policy

状态位置或持久化变化必须提供迁移、清理和兼容策略，尤其是用户隔离数据。
