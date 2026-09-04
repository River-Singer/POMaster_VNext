---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/14-data-model-protocol.md
seed_source_sha256: 7d4e31ef04a1f57d88e982c01dabc22c421bafc850b7295a73d084ec3c6fc838
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 14 数据模型协议

## Scope

P1。定义 API DTO、Adapter、Domain Model、ViewModel、FormModel 和 RowModel 的分层。

## Non-Scope

不定义接口传输协议或具体业务公式，不允许模型层承担页面布局。

## Terms

- DTO：接口原始结构。
- Adapter：边界转换函数。
- Domain Model：稳定业务语义模型。
- ViewModel：面向展示或交互的模型。

## MUST

- 使用 `DTO -> Adapter -> Domain Model -> View/Form/Row Model` 链路。
- 明确类型命名、位置、Owner 和公开边界。
- 空值、未知枚举、日期、金额和单位在边界统一处理。
- API、浏览器存储、跨窗口消息、运行时配置和第三方 SDK 等外部数据必须在信任边界执行 schema 校验后再转换；失败时保守降级并产生安全监控。
- opaque ID、超出 JavaScript safe integer 的整数和高精度数值必须使用不会静默丢失精度的传输与模型类型。
- 后端字段变化优先只影响契约和 adapter。
- adapter 有正常、空值、未知值和边界测试。

## MUST NOT

- MUST NOT 让 DTO 穿透公共组件、模板或列定义。
- MUST NOT 在页面重复字段转换和兜底。
- MUST NOT 使用万能对象代替类型。
- MUST NOT 在模型转换中隐藏正式业务计算。
- MUST NOT 用 TypeScript 类型、类型断言或生成类型替代运行时外部数据校验。
- MUST NOT 把 opaque ID 或大整数转成可能丢失精度的 `number`。

## SHOULD

- SHOULD 使用 schema 校验外部数据。
- SHOULD 为未知枚举保留安全兜底和监控。

## Contract

```text
SourceDTO, RuntimeSchema, Adapter, DomainModel, ConsumerModel,
NullPolicy, EnumPolicy, IdentifierPolicy, PrecisionPolicy, FormatPolicy, Owner
```

## Checklist

- [ ] 模型层次明确。
- [ ] 外部数据已校验转换。
- [ ] 组件只消费稳定模型。
- [ ] adapter 测试完整。
- [ ] 外部数据校验失败和大整数/opaque ID 已覆盖。

## Examples

### 内容示例，可删除

API 的 snake_case DTO 经 adapter 转成稳定 Domain Model，再生成表格 RowModel。

## Anti-patterns

模板直接访问后端字段并在多个单元格各自处理 null 和枚举。

## Ownership

API Owner 维护 DTO，领域 Owner 维护 Domain Model，前端模块 Owner 维护 adapter/ViewModel。

## Change Policy

模型字段变化必须说明兼容、迁移和受影响消费者；公共模型不得静默改语义。
