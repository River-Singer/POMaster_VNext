---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/35-mock-protocol.md
seed_source_sha256: c9288fe227cb26633d23c5d0e2e710b9cde716371f66cf3157c63b3ec8a58342
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 35 Mock 协议

## Scope

P2。定义后端未就绪或测试时的 Mock 来源、场景、契约校验和启停。

## Non-Scope

Mock 不定义正式业务规则，不替代接口契约和真实集成测试。

## Terms

- Fixture：稳定可复用的测试数据。
- Scenario：success、empty、error、timeout 等受控响应模式。
- Contract Mock：由正式 schema 生成或校验的 Mock。

## MUST

- Mock 字段符合正式接口契约。
- Mock schema 必须与正式 OpenAPI 或等价契约保持一致；漂移必须被 CI 检测并阻断。
- 覆盖 success、empty、large、slow、timeout、permission、conflict、error 和 partial success。
- Fixture 使用稳定 id、时间和有种子的生成器。
- Mock 通过统一环境开关启停，生产默认关闭。
- 临时 Mock 必须记录 contract_version、到期日（expires_at）和替换状态（active/deprecated/removed）。
- 真实接口接入后保留测试 Mock 并删除临时错误结构。

## MUST NOT

- MUST NOT 只 Mock 成功小数据。
- MUST NOT 用 Mock 推导正式字段和规则。
- MUST NOT 在业务组件写 Mock 分支。
- MUST NOT 生产默认启用 Mock。

## SHOULD

- SHOULD 由契约生成类型和基础场景。
- SHOULD 模拟幂等、409、429、断线和任务状态。
- SHOULD 在 `outputs/frontend/10_planned/mock-contract.yaml` 中维护场景清单与契约版本绑定。

## Contract

```text
Endpoint, ScenarioId, RequestMatch, ResponseSchema,
Delay, Error, FixtureSeed, ContractVersion
```

### Mock 生命周期

`outputs/frontend/10_planned/mock-contract.yaml` 记录每个 Mock 场景：

```text
Endpoint, ScenarioId, ContractVersion, Status,
ExpiresAt, ReplacementEndpoint, OpenapiDiffChecked
```

- 临时 Mock 必须有到期日；到期前必须完成真实接口替换或显式延期。
- 每个场景必须通过 OpenAPI diff 检查；漂移项必须阻塞合并。

## Checklist

- [ ] 契约一致。
- [ ] OpenAPI/契约漂移检查通过。
- [ ] 非理想态完整。
- [ ] 数据稳定可重复。
- [ ] 生产安全关闭。
- [ ] 临时 Mock 有到期日和替换状态。
- [ ] mock-contract.yaml 已维护。

## Examples

### 内容示例，可删除

同一接口提供 normal、empty、409 和 slow 场景，组件测试通过 scenario id 切换。

## Anti-patterns

页面内写死假数组，字段与后端完全不同，联调时才重写页面。

## Ownership

契约 Owner 负责 schema，前端/QA 维护场景，平台 Owner 维护启停基础设施。

## Change Policy

契约变化必须同步 Mock；删除场景前确认无测试依赖。
