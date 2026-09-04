---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/15-request-api-protocol.md
seed_source_sha256: b9489d69e35a19b8d5ba2442108190e7b99989ef471c8cf413d9e4e408ca2969
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 15 请求与 API 协议

## Scope

P1。定义正式契约进入前端后的请求封装、取消、重试、loading、错误归一化和 API 函数。

## Non-Scope

不定义后端接口本身，不负责页面错误文案和缓存业务规则。

## Terms

- HTTP Client：统一传输基础设施。
- Domain API：面向业务语义的请求函数。
- Request Context：认证、语言、trace、幂等等上下文。

## MUST

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

## MUST NOT

- MUST NOT 在页面直接写 fetch/axios 或拼 endpoint。
- MUST NOT 多处重复 token、错误码和重试逻辑。
- MUST NOT 对非幂等 mutation 默认自动重试。
- MUST NOT 让组件解析原始响应 envelope。
- MUST NOT 把“网络在线”提示当成请求成功证明，或假设 HTTP 404/500 一定以 Promise rejection 表现。

## SHOULD

- SHOULD 通过生成客户端或 typed adapter 对接正式契约。
- SHOULD 让 loading 来源唯一，避免重复状态。

## Contract

```text
FunctionName, InputType, OutputType, ErrorType,
StatusPolicy, Cancellation, Retry, RetryAfter, Idempotency,
ContextVersion, LateResultGuard, Trace
```

## Checklist

- [ ] 页面只使用 Domain API。
- [ ] 类型和错误统一。
- [ ] 取消、重试、幂等明确。
- [ ] 无重复 loading/认证逻辑。
- [ ] 状态判断、旧结果防护和 endpoint 来源明确。

## Examples

### 内容示例，可删除

`getEntityList(query, signal)` 返回稳定分页模型，调用方不认识 endpoint 和 envelope。

## Anti-patterns

每个页面各自创建请求实例、刷新 token 并比较 message。

## Ownership

平台 Owner 维护 HTTP Client，领域 Owner 维护 Domain API，契约 Owner 维护类型来源。

## Change Policy

客户端公共行为变化必须评估全部请求；函数破坏性变化提供迁移和弃用期。
