---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/20-testing-protocol.md
seed_source_sha256: 477dc049d1e1ec72898a07615655ee374924c7796a0210741e8c97474644a4d6
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 20 测试协议

## Scope

P1。定义类型、单元、组件、集成、E2E、视觉、可访问性和性能测试边界。

## Non-Scope

不替代验收门禁、业务 UAT 或生产监控。

## Terms

- Risk-based Testing：按变更风险和影响面选择测试。
- Contract Test：验证跨层 schema 和行为一致性。
- Regression Set：受公共变更影响的代表性场景集合。

## MUST

- 公共函数/组件、复杂表单、关键流程、权限和错误态必须测试。
- 页面覆盖 loading、empty、error、permission、normal 和大数据。
- 公共变更扩大到全部受影响调用方。
- 接口变化同步 contract、adapter、Mock 和页面测试。
- 测试必须稳定、可重复并断言用户可观察行为。
- 跨进程或跨信任边界的 API、存储、消息、配置和第三方 SDK 数据必须包含运行时 schema 失败用例。
- 测试必须隔离并在结束时清理 cookie、浏览器存储、服务端测试数据、Mock、订阅和未完成异步任务。
- 时间、时区、locale、随机数、网络延迟和失败模式必须可控制；并发与取消场景必须覆盖迟到结果不会污染新状态。

## MUST NOT

- MUST NOT 只测试成功场景。
- MUST NOT 只靠人工点页面验收公共变更。
- MUST NOT 为通过测试删除用例、降低断言或跳过风险状态。
- MUST NOT 让测试依赖随机时间和不稳定外部数据。
- MUST NOT 用固定 sleep 等待异步完成；应等待可观察状态、事件或受控时钟。
- MUST NOT 用实现细节选择器作为 E2E 主定位方式；优先使用角色、可访问名称和稳定的用户语义。
- MUST NOT 用自动重试掩盖 flakiness；重试后的通过仍必须可追踪并治理根因。

## SHOULD

- SHOULD 使用测试金字塔并保留少量高价值 E2E。
- SHOULD 自动生成受影响测试清单。
- SHOULD 在 CI 中固定时区、locale、依赖与浏览器版本，并对关键组合做显式矩阵验证。

## Contract

```text
ChangeType, Unit[], Component[], Contract[], E2E[],
Visual[], Accessibility[], Performance[], Evidence
```

## Checklist

- [ ] 风险状态覆盖。
- [ ] 公共调用方回归。
- [ ] 契约与 Mock 同步。
- [ ] 测试稳定可重复。
- [ ] 外部状态已隔离和清理，异步任务无泄漏。
- [ ] 时钟、时区、随机与网络条件可控制。

## Examples

### 内容示例，可删除

表格壳变更同时测试列配置、固定列、横向滚动和不同表格类型。

## Anti-patterns

只测 API 200 和当前页面截图，忽略 403、409、空态和大数据。

## Ownership

实现者维护近层测试，QA 维护关键流程，公共能力 Owner 维护回归集。

## Change Policy

删除测试必须证明行为已删除或由等价测试覆盖；门禁测试降级需批准。
