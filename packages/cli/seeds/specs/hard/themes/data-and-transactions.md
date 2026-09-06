---
seed_source: packages/cli/seeds/aggregation-manifest.json
seed_source_sha256: 039b637ccffacdfe3ce30d85e193f4b38928fcdfb16efdc4eb255e35e05af91f
seed_version: B7-THEME
lane: [backend]
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: theme:data-and-transactions
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: triggered # 聚合注记：来源同值；info 性注记非执行语义
stages: [prepare, implement, check, release] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [business-rules, state-transition, data-model, dto, mapping, database-schema, migration, data-repair, sql, query, index, pagination, transaction, concurrency, locking, idempotency, callback, replay, redis, cache] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/14-business-rules-state-protocol.md
    sha256: fb255dd2331ac35e73a1ad222e4de4ec2f5fb3a09e675de0e1919d80022ac291
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/15-data-model-protocol.md
    sha256: 21cdd88fac93c9dc834a51d62978b51453ca02eca68f223859aeca0ada99c3f2
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/18-database-schema-migration-protocol.md
    sha256: e7d0b660673dc1978653c39c9efcc7ad7d9b2809c4a88040a6fcf74839bc82c0
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/19-query-index-sql-protocol.md
    sha256: 60a660730a82a4f911bc6c18d5f6808a320f722df27d397a4e4b13835111610d
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/20-transaction-boundary-protocol.md
    sha256: 4c4634b71f1e07e9cae074f9790fa50b3425f0af71300ab2ac12e644b521eff4
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/21-concurrency-locking-protocol.md
    sha256: 6141612e1135cc67ccd9d47553ea5fa7b9c00e05b6e50706f8e117c80d3b8d95
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/22-idempotency-protocol.md
    sha256: c97d003622b9075f0c094ec5c5bfa950a977e18b2f4ce8ffc9bc014858e27670
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/23-cache-redis-consistency-protocol.md
    sha256: 073da5821658adfc0580798873fde95c49dc9d993a63949b3b1543a9c0e18a11
    seed_version: B6C
x-language-sections: # 语言节同步源（R-J 资产层唯一权威；注入面为同步副本）
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/java/java-language-overlay.md
    sha256: 38b592a5beaa899abb45e871e5097cafedeea80502baee00bcfbfcfa313dab85
    attach: secondary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/jpa/jpa-persistence-overlay.md
    sha256: e43479fd8659b89863cf47dee9fee3c52727cc2978ffd1b854ea17c777b1e9e6
    attach: primary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/mybatis/mybatis-persistence-overlay.md
    sha256: 968bfa7df9b4c675161427809fd3d4e9e5b62b2b53a880420f36af00d2c60e57
    attach: primary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/mysql/mysql-database-overlay.md
    sha256: a47d8c61959c120707bb907275e74ce13b4b36b03fa493bc09cc7d47fcc949d7
    attach: primary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/postgresql/postgresql-database-overlay.md
    sha256: dbe9f21a72c1124519375176efb2b2b4138b21c45becebfc66eaa2ab41def16e
    attach: primary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/redis/redis-cache-overlay.md
    sha256: 6ae4d18ce2658a77d34bb3cf2a2c38745b646a730eb3c270c2a4c2a0a24497c7
    attach: primary
---

# 数据与事务

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。
文末「语言与栈节」为 stacks overlay 资产 Scope/Rules/Checklist 的逐字节同步副本（标题降 2 级，正文零改动）——资产层为唯一权威，改规则只改 overlay、本区随同步。

## Scope

**源：BE 14 业务规则与状态协议（pomaster/components/backend-hard-spec/assets/universal/14-business-rules-state-protocol.md）**

规范服务端权威不变量、状态机、计算、校验和失败语义。

**源：BE 15 数据模型协议（pomaster/components/backend-hard-spec/assets/universal/15-data-model-protocol.md）**

规范 Command、DTO、Domain Model、Entity 与持久化模型的边界和映射。

**源：BE 18 数据库 Schema 与迁移协议（pomaster/components/backend-hard-spec/assets/universal/18-database-schema-migration-protocol.md）**

规范 table、column、type、约束、索引、migration、回滚和数据修复。

**源：BE 19 查询、索引与 SQL 协议（pomaster/components/backend-hard-spec/assets/universal/19-query-index-sql-protocol.md）**

规范参数化 SQL、查询形态、分页、N+1、索引和执行计划证据。

**源：BE 20 事务边界协议（pomaster/components/backend-hard-spec/assets/universal/20-transaction-boundary-protocol.md）**

规范事务所有者、边界、隔离、传播、重试、补偿与外部调用。

**源：BE 21 并发与锁协议（pomaster/components/backend-hard-spec/assets/universal/21-concurrency-locking-protocol.md）**

规范乐观锁、悲观锁、唯一约束、分布式锁和冲突响应。

**源：BE 22 幂等协议（pomaster/components/backend-hard-spec/assets/universal/22-idempotency-protocol.md）**

规范创建、提交、审批、导入、回调和任务重放语义。

**源：BE 23 缓存与 Redis 一致性协议（pomaster/components/backend-hard-spec/assets/universal/23-cache-redis-consistency-protocol.md）**

规范 key、value schema、TTL、序列化、失效、一致性、防击穿与降级。

## Non-Scope

**源：BE 14 业务规则与状态协议**

不发明 BP 未确认的业务规则、阈值或状态。

**源：BE 15 数据模型协议**

不定义具体项目字段、表或业务枚举。

**源：BE 18 数据库 Schema 与迁移协议**

不规定具体数据库产品的语法或项目表名。

**源：BE 19 查询、索引与 SQL 协议**

不规定具体数据库的固定索引或性能阈值。

**源：BE 20 事务边界协议**

不替代业务不变量、锁选择或数据库产品细节。

**源：BE 21 并发与锁协议**

不替代事务边界或业务状态规则。

**源：BE 22 幂等协议**

不把所有读取或天然无副作用操作强制包装为幂等流程。

**源：BE 23 缓存与 Redis 一致性协议**

不默认指定 Redis，也不规定项目 key 与 TTL 数值。

## Terms

**源：BE 14 业务规则与状态协议**

不变量是在任何成功事务后都必须成立的业务条件。

**源：BE 15 数据模型协议**

边界模型是在特定层或契约中表达数据的稳定结构。

**源：BE 18 数据库 Schema 与迁移协议**

迁移是受版本控制、顺序稳定且可验证的数据结构或数据变更。

**源：BE 19 查询、索引与 SQL 协议**

查询形态包括过滤、连接、排序、分页、聚合与预期数据规模。

**源：BE 20 事务边界协议**

事务边界是需要原子提交或一致失败的一组本地持久化操作。

**源：BE 21 并发与锁协议**

竞争窗口是多个执行者可基于同一旧状态作出冲突决策的时间范围。

**源：BE 22 幂等协议**

幂等键标识同一业务意图，而不是单次网络请求。

**源：BE 23 缓存与 Redis 一致性协议**

权威数据源是在冲突时决定业务事实的持久来源。

## MUST

**源：BE 14 业务规则与状态协议 · §MUST**

- 状态转移必须定义前置条件、权限、效果、失败码和并发行为。

**源：BE 15 数据模型协议 · §MUST**

- 每次转换必须明确字段来源、空值、默认值、精度、时间和枚举语义。

**源：BE 18 数据库 Schema 与迁移协议 · §MUST**

- 每次 schema 变化必须有前向迁移、兼容分析、验证和回退或 roll-forward 路径。

**源：BE 19 查询、索引与 SQL 协议 · §MUST**

- SQL 必须参数化，并以真实查询形态验证结果、边界和执行计划。

**源：BE 20 事务边界协议 · §MUST**

- 写流程必须明确事务入口、隔离、传播、失败、重试和提交后动作。

**源：BE 21 并发与锁协议 · §MUST**

- 并发写必须明确竞争对象、原子条件、冲突结果、重试与最终一致性。

**源：BE 22 幂等协议 · §MUST**

- 可重试写操作必须定义 key 范围、请求指纹、保留期、并发和响应重放。

**源：BE 23 缓存与 Redis 一致性协议 · §MUST**

- 缓存必须定义 key 维度、权限隔离、TTL、更新失效、故障和恢复行为。

## MUST NOT

**源：BE 14 业务规则与状态协议 · §MUST NOT**

- 不得只依赖前端禁用按钮或流程顺序维护业务不变量。

**源：BE 15 数据模型协议 · §MUST NOT**

- 不得让 API DTO、ORM Entity 与领域模型无条件共用同一类型。

**源：BE 18 数据库 Schema 与迁移协议 · §MUST NOT**

- 不得依赖 ORM 自动改表、手工生产操作或无记录脚本作为正式迁移。

**源：BE 19 查询、索引与 SQL 协议 · §MUST NOT**

- 不得用字符串拼接构造不可信 SQL 或无界读取大结果集。

**源：BE 20 事务边界协议 · §MUST NOT**

- 不得在长事务中执行无界网络调用、用户等待或不可控批处理。

**源：BE 21 并发与锁协议 · §MUST NOT**

- 不得把进程内锁用于跨实例互斥或忽略锁超时与所有权。

**源：BE 22 幂等协议 · §MUST NOT**

- 不得仅依赖客户端防抖、按钮禁用或短时进程内缓存。

**源：BE 23 缓存与 Redis 一致性协议 · §MUST NOT**

- 不得让不同租户、权限、过滤或版本的数据共享含混 key。

## SHOULD

**源：BE 14 业务规则与状态协议 · §SHOULD**

- 应集中表达同一权威规则并覆盖边界与非法转移测试。

**源：BE 15 数据模型协议 · §SHOULD**

- 应只在边界转换一次，并通过契约或 round-trip 测试验证。

**源：BE 18 数据库 Schema 与迁移协议 · §SHOULD**

- 应采用 expand/migrate/contract，避免应用与数据库无法并行部署。

**源：BE 19 查询、索引与 SQL 协议 · §SHOULD**

- 应让索引服务于已知查询，并记录写放大与存储取舍。

**源：BE 20 事务边界协议 · §SHOULD**

- 应缩短锁持有时间，并将外部副作用设计为可重试或可补偿。

**源：BE 21 并发与锁协议 · §SHOULD**

- 应优先使用数据库约束或带版本条件的原子更新保护不变量。

**源：BE 22 幂等协议 · §SHOULD**

- 应对相同 key 不同 payload 返回稳定冲突，而非重复执行。

**源：BE 23 缓存与 Redis 一致性协议 · §SHOULD**

- 应设计缓存穿透、击穿、雪崩和热 key 的限制与观测。

## Contract

**源：BE 14 业务规则与状态协议 · §Contract**

规则设计必须绑定 BP 来源、输入、状态、输出、失败和证据。

**源：BE 15 数据模型协议 · §Contract**

映射必须声明源、目标、必填性、丢失规则和失败行为。

**源：BE 18 数据库 Schema 与迁移协议 · §Contract**

迁移记录必须包含对象、影响数据、锁风险、顺序、验证、修复和恢复。

**源：BE 19 查询、索引与 SQL 协议 · §Contract**

关键查询必须记录输入、排序稳定性、分页语义、索引和验证数据规模。

**源：BE 20 事务边界协议 · §Contract**

事务设计必须列出读写集合、锁、唯一约束、外部调用和一致性证据。

**源：BE 21 并发与锁协议 · §Contract**

锁设计必须记录粒度、顺序、超时、续租、释放、失败和可观测性。

**源：BE 22 幂等协议 · §Contract**

幂等记录必须包含主体、操作、key、指纹、状态、结果与过期语义。

**源：BE 23 缓存与 Redis 一致性协议 · §Contract**

缓存契约必须包含权威源、schema 版本、读写顺序、陈旧容忍和降级。

## Checklist

**源：BE 14 业务规则与状态协议 · §Checklist**

- [ ] 不变量、状态、权限、事务与并发边界已对齐。

**源：BE 15 数据模型协议 · §Checklist**

- [ ] 新增字段已追踪到所有生产、转换、存储与消费边界。

**源：BE 18 数据库 Schema 与迁移协议 · §Checklist**

- [ ] 约束、索引、默认值、历史数据、备份与发布窗口已检查。

**源：BE 19 查询、索引与 SQL 协议 · §Checklist**

- [ ] 空结果、重复排序键、深分页、N+1 与慢查询已检查。

**源：BE 20 事务边界协议 · §Checklist**

- [ ] 异常、超时、重试、部分失败和提交后发布均已测试。

**源：BE 21 并发与锁协议 · §Checklist**

- [ ] 重复请求、乱序、死锁、超时、崩溃和多实例场景已测试。

**源：BE 22 幂等协议 · §Checklist**

- [ ] 并发首请求、失败重试、超时、重放和过期边界已测试。

**源：BE 23 缓存与 Redis 一致性协议 · §Checklist**

- [ ] DB 提交、缓存失败、并发更新、淘汰和重建已测试。

## Examples

**源：BE 14 业务规则与状态协议 · §Examples**

- 审批操作在服务端校验当前状态与操作权限后原子更新。

**源：BE 15 数据模型协议 · §Examples**

- API 字符串枚举在入口转换为受控领域值，未知值返回稳定错误。

**源：BE 18 数据库 Schema 与迁移协议 · §Examples**

- 先新增可空字段并双写，完成回填与读切换后再收紧约束。

**源：BE 19 查询、索引与 SQL 协议 · §Examples**

- 游标分页包含稳定唯一排序键并验证并发写入下的行为。

**源：BE 20 事务边界协议 · §Examples**

- 本地事务写入 outbox，提交后由可靠发布器发送外部消息。

**源：BE 21 并发与锁协议 · §Examples**

- 以版本号条件更新并将零行更新映射为稳定冲突错误。

**源：BE 22 幂等协议 · §Examples**

- 回调以供应方事件 ID 和租户范围去重，并原子保存处理结果。

**源：BE 23 缓存与 Redis 一致性协议 · §Examples**

- 写库提交后删除版本化缓存，读路径在 miss 时受控回源。

## Anti-patterns

**源：BE 14 业务规则与状态协议 · §Anti-patterns**

- 在多个 Controller 和 SQL 中复制略有差异的状态判断。

**源：BE 15 数据模型协议 · §Anti-patterns**

- 使用反射复制掩盖字段语义、精度或空值差异。

**源：BE 18 数据库 Schema 与迁移协议 · §Anti-patterns**

- 在同一步中删除旧字段并发布仍依赖它的应用版本。

**源：BE 19 查询、索引与 SQL 协议 · §Anti-patterns**

- 仅凭列名添加索引，不检查选择性和实际执行计划。

**源：BE 20 事务边界协议 · §Anti-patterns**

- 通过扩大事务范围掩盖跨系统一致性设计缺失。

**源：BE 21 并发与锁协议 · §Anti-patterns**

- 先查询再无条件更新，并假设请求不会并发。

**源：BE 22 幂等协议 · §Anti-patterns**

- 用当前时间生成幂等键，使每次重试都成为新操作。

**源：BE 23 缓存与 Redis 一致性协议 · §Anti-patterns**

- 先写缓存再写数据库且没有补偿或一致性说明。

## Ownership

**源：BE 14 业务规则与状态协议 · §Ownership**

BP 拥有业务语义，Backend 拥有服务端一致实现。

**源：BE 15 数据模型协议 · §Ownership**

各边界 Owner 维护模型契约，映射实现者负责 round-trip 证据。

**源：BE 18 数据库 Schema 与迁移协议 · §Ownership**

数据 Owner 审批语义，Backend 维护 migration 与验证证据。

**源：BE 19 查询、索引与 SQL 协议 · §Ownership**

查询维护者提供计划证据，数据 Owner 评审容量与一致性影响。

**源：BE 20 事务边界协议 · §Ownership**

应用服务拥有事务编排，Repository 提供明确持久化语义。

**源：BE 21 并发与锁协议 · §Ownership**

业务用例 Owner 定义冲突语义，持久化维护者验证原子性。

**源：BE 22 幂等协议 · §Ownership**

API 或任务 Owner 定义业务意图，存储实现维护原子去重。

**源：BE 23 缓存与 Redis 一致性协议 · §Ownership**

数据 Owner 定义一致性，缓存维护者提供失效与恢复证据。

## Change Policy

**源：BE 14 业务规则与状态协议 · §Change Policy**

业务语义变化必须来自正式 delta，并同步状态迁移与兼容计划。

**源：BE 15 数据模型协议 · §Change Policy**

模型变化必须评估 API、数据、消息和历史数据兼容性。

**源：BE 18 数据库 Schema 与迁移协议 · §Change Policy**

已执行 migration 不得原地改写；修正必须追加新 migration。

**源：BE 19 查询、索引与 SQL 协议 · §Change Policy**

索引删除或查询重写必须先验证所有已知消费者和回滚路径。

**源：BE 20 事务边界协议 · §Change Policy**

边界或隔离变化必须复核并发、锁、性能和失败恢复。

**源：BE 21 并发与锁协议 · §Change Policy**

锁策略变化必须重新评估事务、性能、恢复和兼容行为。

**源：BE 22 幂等协议 · §Change Policy**

key 格式或保留期变化必须处理旧记录和滚动发布兼容。

**源：BE 23 缓存与 Redis 一致性协议 · §Change Policy**

value schema 或 key 变化必须版本化并规划旧数据清理。

## 语言与栈节（overlay 资产同步区）

> 本区各小节 = stacks/ overlay 资产 Scope/Rules/Checklist 的**逐字节同步副本**（标题降 2 级，正文零改动）。资产层（overlay 文件，catalog 在册、research 锚、bound 语义挂点）为唯一权威；本区为注入面副本，改规则只改 overlay、本区随同步。x-research-anchors 留在 overlay 资产 frontmatter，不复制进本主题文档（防双锚漂移）。

### java（源：stacks/java/java-language-overlay.md · B01 次挂点，主挂点 T05）

#### Scope

本 Overlay 具体化 Java 源码、构建、JDK 与 JVM 兼容边界。

#### Rules

- 必须固定并记录 JDK、编译目标、构建工具和依赖解析来源。
- 不得由 Java 选择推断 Spring Boot、数据库、Redis、Nginx 或 Tomcat。
- 语言升级必须验证字节码、运行时、测试与部署环境兼容性。

#### Checklist

- [ ] 版本来源、构建命令和 CI 运行时可复现。
- [ ] 项目技术基线记录实际 JDK 与打包方式。

### jpa（源：stacks/jpa/jpa-persistence-overlay.md · B01 主挂点）

#### Scope

本 Overlay 具体化实体生命周期、关联加载、查询与持久化上下文边界。

#### Rules

- Entity 不得直接替代 API DTO 或领域契约。
- 必须验证关联加载、N+1、脏检查、批处理和事务边界。
- 与 MyBatis 并存时必须声明模块或数据源范围。

#### Checklist

- [ ] Java 依赖已显式选择。
- [ ] schema、迁移和实体映射不存在未经解释的漂移。

### mybatis（源：stacks/mybatis/mybatis-persistence-overlay.md · B01 主挂点）

#### Scope

本 Overlay 具体化 Mapper、SQL 映射、结果映射和动态 SQL 边界。

#### Rules

- SQL 必须参数化并绑定可复核的 Mapper 与测试坐标。
- 动态条件、分页、批处理和结果映射必须覆盖空值与类型边界。
- 与 JPA 并存时必须声明模块或数据源范围。

#### Checklist

- [ ] Java 依赖已显式选择。
- [ ] SQL、索引、事务和迁移证据相互一致。

### mysql（源：stacks/mysql/mysql-database-overlay.md · B01 主挂点）

#### Scope

本 Overlay 具体化 MySQL schema、InnoDB、索引、事务与迁移验证边界。

#### Rules

- 字符集、排序规则、类型、约束和索引必须由 migration 明确表达。
- 隔离级别、锁行为和执行计划必须以实际版本证据为准。
- 与其他数据库并存时必须声明数据源与数据所有权。

#### Checklist

- [ ] migration、rollback 或 roll-forward 路径可验证。
- [ ] 生产兼容性不依赖本地默认值。

### postgresql（源：stacks/postgresql/postgresql-database-overlay.md · B01 主挂点）

#### Scope

本 Overlay 具体化 PostgreSQL schema、类型、索引、事务与迁移验证边界。

#### Rules

- schema、extension、类型、约束和索引必须由受控 migration 表达。
- 锁、隔离、执行计划和 vacuum 相关判断必须绑定实际版本证据。
- 与其他数据库并存时必须声明数据源与数据所有权。

#### Checklist

- [ ] migration 与兼容窗口可复核。
- [ ] SQL 未依赖未声明的 search path 或环境默认值。

### redis（源：stacks/redis/redis-cache-overlay.md · B01 主挂点）

#### Scope

本 Overlay 具体化 Redis key、value schema、TTL、原子操作与故障降级边界。

#### Rules

- key namespace、租户范围、序列化版本和 TTL 必须显式定义。
- Redis 不得成为未声明的数据权威来源。
- 分布式锁、缓存失效和降级必须有失败语义与测试证据。

#### Checklist

- [ ] 一致性、容量、淘汰和恢复路径已记录。
- [ ] 敏感数据与日志处理满足安全和隐私协议。

> **缺席诚实**：php / python（后端语言）与 oracle / sqlserver（关系数据库）无 overlay 资产，不落语言节。
