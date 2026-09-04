---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/45-browser-storage-protocol.md
seed_source_sha256: 01d0d3cb618519c94c939658526a97ad1df851a8f820a22a9b4595bef03cc2cb
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 45 浏览器存储协议

## Scope

P1。定义 Cookie、Web Storage、IndexedDB、Cache API 和其他客户端持久化的选择、隔离、校验、配额、迁移、一致性与清理。

## Non-Scope

不定义服务端数据库或 HTTP/CDN 缓存，不允许客户端存储替代后端权威状态、认证或鉴权。

## Terms

- Storage Class：存储介质及其可见范围、持久性和安全属性。
- Isolation Key：用户、租户、组织、权限范围和数据版本等隔离维度。
- Storage Schema：持久化数据的版本化结构。
- Eviction：浏览器因策略、配额或用户操作删除数据。

## MUST

- 每个持久化项必须声明用途、Storage Class、Isolation Key、schema 版本、大小预算、过期时间、迁移/重置策略、清理触发器和 Owner。
- 从浏览器存储读取的数据必须执行 schema、版本、身份、租户和权限校验；失败时保守重置，不得直接信任。
- 必须处理不可用、隐私模式、配额不足、写入失败、被驱逐和数据损坏，并为关键流程提供非持久化降级路径。
- 注销、切换账号/租户、权限变化和数据目的撤回必须清除或重新隔离相关数据。
- 跨标签页共享的数据必须定义冲突、通知、版本和最终一致性策略；不得假设内存状态会自动同步。
- IndexedDB 等版本化数据库必须处理升级阻塞、连接关闭、迁移失败和回滚/重置路径。
- Service Worker 与 Cache API 必须限定作用域、版本化缓存、验证响应来源，并在发布和退出策略中清理过期内容。
- 凭据类数据必须遵守 `universal:security-protocol`；可被脚本读取的存储不得持久化 session identifier、refresh token、secret 或等价凭据，除非存在经批准且有期限的安全例外。

## MUST NOT

- MUST NOT 使用客户端存储值证明身份、权限、价格、审批或其他权威业务事实。
- MUST NOT 多个用户、租户或权限范围复用未隔离的 key、数据库或缓存条目。
- MUST NOT 无限期持久化草稿、文件、接口响应或敏感偏好。
- MUST NOT 在 schema 变化后静默读取旧结构并猜测字段语义。
- MUST NOT 假设客户端存储可靠、保密、不会被修改或永不被驱逐。

## SHOULD

- SHOULD 只在明确需要跨刷新或跨会话时持久化，短生命周期状态优先留在内存。
- SHOULD 提供存储占用、迁移失败和清理结果的安全诊断信息。
- SHOULD 对大型或敏感持久化建立容量、性能和隐私测试。

## Contract

```text
StorageId, Purpose, StorageClass, IsolationKeys[], SchemaVersion,
SizeBudget, Expiry, Migration, ResetPolicy, EvictionFallback,
CrossTabPolicy, CleanupTriggers[], Owner
```

## Checklist

- [ ] 存储必要性和介质选择合理。
- [ ] schema、身份、租户和权限均被校验。
- [ ] 配额、驱逐、损坏和不可用有降级路径。
- [ ] 跨标签页和版本迁移行为明确。
- [ ] 注销和权限变化会安全清理。

## Examples

### 内容示例，可删除

用户列偏好按用户、租户和 schema 版本隔离；读取失败或版本不兼容时恢复默认值，不影响核心查询和编辑流程。

## Anti-patterns

把 token、完整权限矩阵和接口响应长期写入 localStorage，所有账号共享同一 key，并把读取结果直接当作可信状态。

## Ownership

平台 Owner 维护存储适配和迁移机制，领域 Owner 定义数据必要性与隔离键，安全/隐私 Owner 审核敏感持久化。

## Change Policy

改变介质、key、schema、隔离或保留策略必须提供迁移、重置、回滚和受影响用户说明，并同步 `universal:state-management-protocol`、`universal:cache-protocol` 与 `universal:privacy-data-lifecycle-protocol`。
