---
seed_source: packages/cli/seeds/aggregation-manifest.json
seed_source_sha256: 039b637ccffacdfe3ce30d85e193f4b38928fcdfb16efdc4eb255e35e05af91f
seed_version: B7-THEME
lane: [frontend, backend]
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend, backend]
related_evidence_specs: []
related_tools: []
legacy_id: theme:testing-and-verification
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: triggered # 聚合注记：来源同值；info 性注记非执行语义
stages: [prepare, check, release] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [testing, acceptance] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/20-testing-protocol.md
    sha256: 477dc049d1e1ec72898a07615655ee374924c7796a0210741e8c97474644a4d6
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/35-mock-protocol.md
    sha256: c9288fe227cb26633d23c5d0e2e710b9cde716371f66cf3157c63b3ec8a58342
    seed_version: B6B-2
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/28-testing-protocol.md
    sha256: f5df73dd7bec4ccf4132c3d7a9918a6f1cb0dd9682aa17956cb24446aa406ad7
    seed_version: B6C
---

# 测试与验证

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。

## Scope

**源：FE 20 测试协议（pomaster/components/frontend-hard-spec/assets/universal/20-testing-protocol.md）**

P1。定义类型、单元、组件、集成、E2E、视觉、可访问性和性能测试边界。

**源：FE 35 Mock 协议（pomaster/components/frontend-hard-spec/assets/universal/35-mock-protocol.md）**

P2。定义后端未就绪或测试时的 Mock 来源、场景、契约校验和启停。

**源：BE 28 测试协议（pomaster/components/backend-hard-spec/assets/universal/28-testing-protocol.md）**

规范单元、API、集成、契约、迁移、并发、安全、性能与故障测试。

## Non-Scope

**源：FE 20 测试协议**

不替代验收门禁、业务 UAT 或生产监控。

**源：FE 35 Mock 协议**

Mock 不定义正式业务规则，不替代接口契约和真实集成测试。

**源：BE 28 测试协议**

不规定统一覆盖率阈值或替代验收证据协议。

## Terms

**源：FE 20 测试协议**

- Risk-based Testing：按变更风险和影响面选择测试。
- Contract Test：验证跨层 schema 和行为一致性。
- Regression Set：受公共变更影响的代表性场景集合。

**源：FE 35 Mock 协议**

- Fixture：稳定可复用的测试数据。
- Scenario：success、empty、error、timeout 等受控响应模式。
- Contract Mock：由正式 schema 生成或校验的 Mock。

**源：BE 28 测试协议**

测试层级按需要隔离的边界与要证明的风险划分。

## MUST

**源：FE 20 测试协议 · §MUST**

- 公共函数/组件、复杂表单、关键流程、权限和错误态必须测试。
- 页面覆盖 loading、empty、error、permission、normal 和大数据。
- 公共变更扩大到全部受影响调用方。
- 接口变化同步 contract、adapter、Mock 和页面测试。
- 测试必须稳定、可重复并断言用户可观察行为。
- 跨进程或跨信任边界的 API、存储、消息、配置和第三方 SDK 数据必须包含运行时 schema 失败用例。
- 测试必须隔离并在结束时清理 cookie、浏览器存储、服务端测试数据、Mock、订阅和未完成异步任务。
- 时间、时区、locale、随机数、网络延迟和失败模式必须可控制；并发与取消场景必须覆盖迟到结果不会污染新状态。

**源：FE 35 Mock 协议 · §MUST**

- Mock 字段符合正式接口契约。
- Mock schema 必须与正式 OpenAPI 或等价契约保持一致；漂移必须被 CI 检测并阻断。
- 覆盖 success、empty、large、slow、timeout、permission、conflict、error 和 partial success。
- Fixture 使用稳定 id、时间和有种子的生成器。
- Mock 通过统一环境开关启停，生产默认关闭。
- 临时 Mock 必须记录 contract_version、到期日（expires_at）和替换状态（active/deprecated/removed）。
- 真实接口接入后保留测试 Mock 并删除临时错误结构。

**源：BE 28 测试协议 · §MUST**

- 测试计划必须覆盖变更行为、边界、失败、兼容和高风险交互。

## MUST NOT

**源：FE 20 测试协议 · §MUST NOT**

- MUST NOT 只测试成功场景。
- MUST NOT 只靠人工点页面验收公共变更。
- MUST NOT 为通过测试删除用例、降低断言或跳过风险状态。
- MUST NOT 让测试依赖随机时间和不稳定外部数据。
- MUST NOT 用固定 sleep 等待异步完成；应等待可观察状态、事件或受控时钟。
- MUST NOT 用实现细节选择器作为 E2E 主定位方式；优先使用角色、可访问名称和稳定的用户语义。
- MUST NOT 用自动重试掩盖 flakiness；重试后的通过仍必须可追踪并治理根因。

**源：FE 35 Mock 协议 · §MUST NOT**

- MUST NOT 只 Mock 成功小数据。
- MUST NOT 用 Mock 推导正式字段和规则。
- MUST NOT 在业务组件写 Mock 分支。
- MUST NOT 生产默认启用 Mock。

**源：BE 28 测试协议 · §MUST NOT**

- 不得用固定 sleep、共享脏数据或只测成功路径获得虚假稳定性。

## SHOULD

**源：FE 20 测试协议 · §SHOULD**

- SHOULD 使用测试金字塔并保留少量高价值 E2E。
- SHOULD 自动生成受影响测试清单。
- SHOULD 在 CI 中固定时区、locale、依赖与浏览器版本，并对关键组合做显式矩阵验证。

**源：FE 35 Mock 协议 · §SHOULD**

- SHOULD 由契约生成类型和基础场景。
- SHOULD 模拟幂等、409、429、断线和任务状态。
- SHOULD 在 `outputs/frontend/10_planned/mock-contract.yaml` 中维护场景清单与契约版本绑定。

**源：BE 28 测试协议 · §SHOULD**

- 应控制时间、随机、网络和外部依赖，并保留失败诊断信息。

## Contract

**源：FE 20 测试协议 · §Contract**

```text
ChangeType, Unit[], Component[], Contract[], E2E[],
Visual[], Accessibility[], Performance[], Evidence
```

**源：FE 35 Mock 协议 · §Contract**

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

**源：BE 28 测试协议 · §Contract**

测试证据必须包含范围、环境、命令、结果、失败和未覆盖风险。

## Checklist

**源：FE 20 测试协议 · §Checklist**

- [ ] 风险状态覆盖。
- [ ] 公共调用方回归。
- [ ] 契约与 Mock 同步。
- [ ] 测试稳定可重复。
- [ ] 外部状态已隔离和清理，异步任务无泄漏。
- [ ] 时钟、时区、随机与网络条件可控制。

**源：FE 35 Mock 协议 · §Checklist**

- [ ] 契约一致。
- [ ] OpenAPI/契约漂移检查通过。
- [ ] 非理想态完整。
- [ ] 数据稳定可重复。
- [ ] 生产安全关闭。
- [ ] 临时 Mock 有到期日和替换状态。
- [ ] mock-contract.yaml 已维护。

**源：BE 28 测试协议 · §Checklist**

- [ ] API、DB、事务、并发、幂等、缓存、安全和回滚按影响选择。

## Examples

**源：FE 20 测试协议 · §Examples**

### 内容示例，可删除

表格壳变更同时测试列配置、固定列、横向滚动和不同表格类型。

**源：FE 35 Mock 协议 · §Examples**

### 内容示例，可删除

同一接口提供 normal、empty、409 和 slow 场景，组件测试通过 scenario id 切换。

**源：BE 28 测试协议 · §Examples**

- migration 在真实数据库版本上验证前向、兼容与恢复。

> 注（结构事实，非规则）：FE 源的 Examples 带「### 内容示例，可删除」模板提示、BE 源为平列表——两族源本文即存在此差异，本样板原样保留、不做归一化（置换不变优先；是否归一化属内容演进，不属重组）。

## Anti-patterns

**源：FE 20 测试协议 · §Anti-patterns**

只测 API 200 和当前页面截图，忽略 403、409、空态和大数据。

**源：FE 35 Mock 协议 · §Anti-patterns**

页面内写死假数组，字段与后端完全不同，联调时才重写页面。

**源：BE 28 测试协议 · §Anti-patterns**

- Mock 掉所有边界后声称集成行为已验证。

## Ownership

**源：FE 20 测试协议 · §Ownership**

实现者维护近层测试，QA 维护关键流程，公共能力 Owner 维护回归集。

**源：FE 35 Mock 协议 · §Ownership**

契约 Owner 负责 schema，前端/QA 维护场景，平台 Owner 维护启停基础设施。

**源：BE 28 测试协议 · §Ownership**

实现者维护变更测试，测试与评审角色检查风险覆盖。

## Change Policy

**源：FE 20 测试协议 · §Change Policy**

删除测试必须证明行为已删除或由等价测试覆盖；门禁测试降级需批准。

**源：FE 35 Mock 协议 · §Change Policy**

契约变化必须同步 Mock；删除场景前确认无测试依赖。

**源：BE 28 测试协议 · §Change Policy**

删除或放宽测试必须说明替代证据和风险审批。

> **语言节**：本主题无语言节挂点（缺席诚实）；规则本体即上文通用节。
