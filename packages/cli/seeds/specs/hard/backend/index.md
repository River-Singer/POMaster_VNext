---
seed_source: pomaster/components/backend-hard-spec/assets/universal/index.md
seed_source_sha256: b50c1fdcab5d1a3217a6e28059580195f681b6e68f465eb8e055bd8e5310c479
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:index
injection_mode: always
stages: [prepare, implement, check, release]
---

# 后端通用硬规范索引

本目录包含 32 个编号协议和本索引。语义 ID、编号和 canonical filename 是稳定地址；编号只追加，不表示 criticality 或注入优先级。协议正文只定义跨项目治理，不保存项目 endpoint、table、column、业务状态、环境阈值或责任人。

## 使用规则

注入顺序固定为：按当前 stage 过滤、加入 always 基线、加入命中 trigger 的 triggered 协议、加入显式请求的 reference 协议，最后去重并校验依赖。`criticality` 只决定违规严重度，不参与默认选择。

## 维护 spec：主题 → 协议路由表

**要给本项目补充/修改后端规则时，MUST 就地编辑下表命中的编号协议文件，MUST NOT 新建平行文件。**
把规则写进目标文件的 `MUST` / `MUST NOT` / `SHOULD` / `Contract` / `Checklist` 章节；
技术栈特有规则进 `stacks/<slug>/<slug>-overlay.md`。

| 你要维护的主题（关键词） | 就地编辑这个文件 |
|---|---|
| 架构治理、架构决策、ADR | `01-architecture-governance-protocol.md` |
| 工程结构、模块划分、包组织 | `02-project-structure-governance-protocol.md` |
| 目录边界、依赖方向 | `03-directory-boundary-protocol.md` |
| 分层架构、Controller/Service/Repository 职责 | `04-layering-architecture-protocol.md` |
| 任务流程、开发工作流 | `05-task-workflow-protocol.md` |
| AI 生成代码约束 | `06-ai-generated-code-protocol.md` |
| 证据、验收标准 | `07-evidence-acceptance-protocol.md` |
| 契约变更、破坏性改动、兼容窗口 | `08-contract-change-protocol.md` |
| Owner、角色责任 | `09-role-responsibility-protocol.md` |
| 认证授权、加密、注入防护、安全边界 | `10-security-protocol.md` |
| 环境变量、配置中心、多环境 | `11-environment-configuration-protocol.md` |
| API 契约、OpenAPI、REST 风格、版本 | `12-api-contract-protocol.md` |
| 隐私、数据留存与删除、脱敏 | `13-privacy-data-lifecycle-protocol.md` |
| 业务规则、领域状态机 | `14-business-rules-state-protocol.md` |
| 实体、DTO、领域模型、字段语义 | `15-data-model-protocol.md` |
| 错误码、异常体系、错误响应 | `16-error-code-protocol.md` |
| 权限模型、RBAC、数据范围 | `17-permission-authorization-protocol.md` |
| 数据库 schema、migration、Flyway/Liquibase | `18-database-schema-migration-protocol.md` |
| SQL、索引、慢查询、查询优化 | `19-query-index-sql-protocol.md` |
| 事务边界、传播行为、回滚 | `20-transaction-boundary-protocol.md` |
| 并发、锁、乐观/悲观锁、竞态 | `21-concurrency-locking-protocol.md` |
| 幂等、重复请求、去重 | `22-idempotency-protocol.md` |
| 缓存、Redis 一致性、缓存失效 | `23-cache-redis-consistency-protocol.md` |
| 外部集成、熔断、降级、重试、超时 | `24-external-integration-resilience-protocol.md` |
| 异步任务、定时调度、消息消费 | `25-async-job-scheduler-protocol.md` |
| 构建工具、静态检查、CI | `26-engineering-tooling-protocol.md` |
| 依赖管理、供应链安全 | `27-dependency-supply-chain-protocol.md` |
| 单元/集成/契约测试、覆盖率 | `28-testing-protocol.md` |
| 日志、链路追踪、可观测性、指标 | `29-observability-logging-tracing-protocol.md` |
| 性能、容量、压测、限流 | `30-performance-capacity-protocol.md` |
| 运行时、部署、容器、健康检查 | `31-runtime-deployment-protocol.md` |
| 发布、版本、回滚 | `32-release-versioning-rollback-protocol.md` |
| 语言/框架/中间件特有细则（Java、Spring、MyBatis、MySQL、Redis、Nginx…） | `stacks/<slug>/<slug>-overlay.md` |

只有当一条规则在上表与所有 overlay 里**找不到任何归属主题**时，才允许新增协议文件；此时必须同步
下方「协议目录」与「任务 Trigger 矩阵」，保持双向索引完整。

重跑注入默认只补齐缺失文件、不覆盖已存在的协议，所以就地维护不会被覆盖。

## 协议目录

| No | Semantic ID | Canonical filename | Criticality | Injection | Stages | Triggers | 核心职责 |
|---:|---|---|---|---|---|---|---|
| 01 | `backend:architecture-governance-protocol` | `01-architecture-governance-protocol.md` | critical | reference | prepare,check | architecture,technology-baseline,deployment-topology | 架构边界、ADR 与演进门禁 |
| 02 | `backend:project-structure-governance-protocol` | `02-project-structure-governance-protocol.md` | standard | triggered | prepare,implement,check | project-structure,module-layout | 项目目录分区与结构检查 |
| 03 | `backend:directory-boundary-protocol` | `03-directory-boundary-protocol.md` | critical | always | implement,check | - | 公开入口、依赖方向与越界识别 |
| 04 | `backend:layering-architecture-protocol` | `04-layering-architecture-protocol.md` | critical | triggered | prepare,implement,check | layering,module-boundary,domain-design | 后端分层职责与边界 |
| 05 | `backend:task-workflow-protocol` | `05-task-workflow-protocol.md` | critical | always | prepare,implement,check,release | - | Backend Ready 与阶段路由 |
| 06 | `backend:ai-generated-code-protocol` | `06-ai-generated-code-protocol.md` | critical | always | prepare,implement,check | - | Agent 事实边界与验证 |
| 07 | `backend:evidence-acceptance-protocol` | `07-evidence-acceptance-protocol.md` | critical | always | prepare,check,release | - | 证据、验收与例外门禁 |
| 08 | `backend:contract-change-protocol` | `08-contract-change-protocol.md` | critical | always | prepare,implement,check,release | - | 公共契约兼容与迁移 |
| 09 | `backend:role-responsibility-protocol` | `09-role-responsibility-protocol.md` | advisory | reference | prepare,check | ownership,handoff | Owner、RACI 与交接 |
| 10 | `backend:security-protocol` | `10-security-protocol.md` | critical | triggered | prepare,implement,check,release | security,api-input,authentication,authorization,file-processing,secrets | 服务端安全控制 |
| 11 | `backend:environment-configuration-protocol` | `11-environment-configuration-protocol.md` | critical | triggered | prepare,implement,check,release | environment-configuration,configuration,secrets,runtime | 环境、secret 与配置漂移 |
| 12 | `backend:api-contract-protocol` | `12-api-contract-protocol.md` | critical | triggered | prepare,implement,check | api-contract,api-change | API 与兼容契约 |
| 13 | `backend:privacy-data-lifecycle-protocol` | `13-privacy-data-lifecycle-protocol.md` | critical | triggered | prepare,implement,check,release | sensitive-data,privacy,data-export | 隐私与数据生命周期 |
| 14 | `backend:business-rules-state-protocol` | `14-business-rules-state-protocol.md` | critical | triggered | prepare,implement,check | business-rules,state-transition | 服务端规则与状态机 |
| 15 | `backend:data-model-protocol` | `15-data-model-protocol.md` | standard | triggered | prepare,implement,check | data-model,dto,mapping | 边界模型与映射 |
| 16 | `backend:error-code-protocol` | `16-error-code-protocol.md` | standard | triggered | prepare,implement,check | error-code,error-handling | 稳定错误语义 |
| 17 | `backend:permission-authorization-protocol` | `17-permission-authorization-protocol.md` | critical | triggered | prepare,implement,check | authorization,tenant,data-scope | 权限、租户与数据范围 |
| 18 | `backend:database-schema-migration-protocol` | `18-database-schema-migration-protocol.md` | critical | triggered | prepare,implement,check,release | database-schema,migration,data-repair | Schema、迁移与修复 |
| 19 | `backend:query-index-sql-protocol` | `19-query-index-sql-protocol.md` | standard | triggered | implement,check | sql,query,index,pagination | SQL、分页与索引证据 |
| 20 | `backend:transaction-boundary-protocol` | `20-transaction-boundary-protocol.md` | critical | triggered | prepare,implement,check | transaction | 事务边界与失败语义 |
| 21 | `backend:concurrency-locking-protocol` | `21-concurrency-locking-protocol.md` | critical | triggered | prepare,implement,check | concurrency,locking | 并发、锁与冲突 |
| 22 | `backend:idempotency-protocol` | `22-idempotency-protocol.md` | critical | triggered | prepare,implement,check | idempotency,callback,replay | 写操作幂等与重放 |
| 23 | `backend:cache-redis-consistency-protocol` | `23-cache-redis-consistency-protocol.md` | critical | triggered | prepare,implement,check,release | redis,cache | 缓存与权威源一致性 |
| 24 | `backend:external-integration-resilience-protocol` | `24-external-integration-resilience-protocol.md` | critical | triggered | prepare,implement,check,release | external-integration,resilience | 超时、重试、补偿与对账 |
| 25 | `backend:async-job-scheduler-protocol` | `25-async-job-scheduler-protocol.md` | standard | triggered | prepare,implement,check,release | async-job,scheduler,import-export | Job 生命周期与调度 |
| 26 | `backend:engineering-tooling-protocol` | `26-engineering-tooling-protocol.md` | standard | triggered | prepare,implement,check | build,tooling,ci | 构建、生成与 CI |
| 27 | `backend:dependency-supply-chain-protocol` | `27-dependency-supply-chain-protocol.md` | critical | triggered | prepare,implement,check,release | dependency,supply-chain | 依赖与供应链风险 |
| 28 | `backend:testing-protocol` | `28-testing-protocol.md` | critical | triggered | prepare,check,release | testing,acceptance | 风险导向测试 |
| 29 | `backend:observability-logging-tracing-protocol` | `29-observability-logging-tracing-protocol.md` | standard | triggered | implement,check,release | observability,logging,tracing | 日志、指标、追踪与审计 |
| 30 | `backend:performance-capacity-protocol` | `30-performance-capacity-protocol.md` | standard | triggered | prepare,check,release | performance,capacity | 性能预算与容量证据 |
| 31 | `backend:runtime-deployment-protocol` | `31-runtime-deployment-protocol.md` | critical | triggered | prepare,implement,check,release | runtime,deployment,configuration | 运行时、入口与部署拓扑 |
| 32 | `backend:release-versioning-rollback-protocol` | `32-release-versioning-rollback-protocol.md` | critical | triggered | prepare,check,release | release,rollback,versioning | 发布、版本与恢复 |

## 默认注入基线

候选基线严格只有以下 5 个短协议和索引；实际选择继续接受 stage 过滤。

```text
backend:index
backend:task-workflow-protocol
backend:ai-generated-code-protocol
backend:directory-boundary-protocol
backend:contract-change-protocol
backend:evidence-acceptance-protocol
```

| Stage | 实际默认加载 |
|---|---|
| prepare | index、task workflow、AI generated code、contract change、evidence acceptance |
| implement | index、task workflow、AI generated code、directory boundary、contract change |
| check | index 加全部 5 个 always 协议 |
| release | index、task workflow、contract change、evidence acceptance |

## 任务 Trigger 矩阵

| 任务特征 | 建议 Trigger |
|---|---|
| 架构、技术栈或部署形态选择 | 显式展开 `backend:architecture-governance-protocol`，并命中 `project-structure`、`layering`、`environment-configuration`、`build`、`dependency`、`performance`、`runtime`、`release` |
| 新增或修改 API | `api-contract`、`data-model`、`error-code`、`data-scope`、`idempotency`、`testing`、`observability`、`release` |
| 业务规则或状态流转 | `layering`、`business-rules`、`state-transition`、`data-model`、`error-code`、`data-scope`、`transaction`、`concurrency`、`testing` |
| 数据库结构或迁移 | `database-schema`、`migration`、`sql`、`transaction`、`concurrency`、`testing`、`observability`、`rollback` |
| 查询、分页、报表或导出 | `api-contract`、`data-model`、`data-scope`、`query`、`pagination`、`cache`、`testing`、`performance` |
| 事务写流程 | `business-rules`、`error-code`、`transaction`、`concurrency`、`idempotency`、`external-integration`、`testing`、`observability` |
| Redis 或缓存变更 | `environment-configuration`、`concurrency`、`idempotency`、`redis`、`testing`、`observability`、`capacity` |
| 外部系统集成 | `environment-configuration`、`api-contract`、`error-code`、`idempotency`、`external-integration`、`resilience`、`async-job`、`testing`、`observability` |
| 导入、导出或异步任务 | `api-contract`、`error-code`、`data-scope`、`idempotency`、`cache`、`async-job`、`scheduler`、`testing`、`observability`、`performance` |
| 认证、权限或敏感数据 | `security`、`authentication`、`sensitive-data`、`privacy`、`error-code`、`data-scope`、`testing`、`observability` |
| 运行时、部署或配置 | `environment-configuration`、`external-integration`、`deployment`、`observability`、`performance`、`release` |
| 依赖升级 | `build`、`dependency`、`supply-chain`、`testing`、`performance`、`release` |
| 发布、灰度或回滚 | `environment-configuration`、`testing`、`observability`、`performance`、`deployment`、`release`、`rollback` |

矩阵只产生候选 trigger；注入器必须对结果继续执行 stage、injection mode、显式 reference、Overlay 依赖与冲突校验，并在 Trellis context reason 中记录 semantic ID、stage、命中原因和 provider hash。

## 协议固定结构

所有编号协议严格使用以下顺序：

1. `Scope`
2. `Non-Scope`
3. `Terms`
4. `MUST`
5. `MUST NOT`
6. `SHOULD`
7. `Contract`
8. `Checklist`
9. `Examples`
10. `Anti-patterns`
11. `Ownership`
12. `Change Policy`

## 冲突与责任边界

- 安全规则优先于便利性；最终服务端授权优先于客户端展示。
- 正式 API、schema、消息和配置契约优先于 Mock、历史示例和聊天记录。
- 业务规则协议定义权威语义；数据模型协议只定义边界转换。
- 错误码协议定义调用方语义；可观测性协议定义内部诊断与审计信号。
- 事务协议定义原子边界；并发协议定义竞争、锁与冲突。
- 测试协议选择验证方式；证据协议决定声明与门禁是否成立。
- Stack Overlay 只能收紧或具体化本目录规则，不能保存项目事实或放宽底线。

## 维护规则

协议编号、语义 ID 与 canonical filename 只追加不重排。新增或修改规则必须同步索引、模板、注入器测试和 provider bytes/hash；废弃规则必须提供替代 ID、兼容窗口和迁移说明。
