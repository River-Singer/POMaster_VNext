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
legacy_id: theme:integration-and-async-runtime
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: triggered # 聚合注记：来源同值；info 性注记非执行语义
stages: [prepare, implement, check, release] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [external-integration, resilience, async-job, scheduler, import-export, runtime, deployment, configuration] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/24-external-integration-resilience-protocol.md
    sha256: e6b0626c9169e9126319bd08ee5d5bdbe38421cfa175509524145aee30ff539a
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/25-async-job-scheduler-protocol.md
    sha256: 36af3b4466b4e617a9c552a404d98ab74604752b7410e15756d7f132394fb980
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/31-runtime-deployment-protocol.md
    sha256: c791451de0be3aa0629fd562e2b43cc54066e4b10d786264fa7a333c561ef23a
    seed_version: B6C
x-language-sections: # 语言节同步源（R-J 资产层唯一权威；注入面为同步副本）
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/spring-webflux/spring-webflux-reactive-overlay.md
    sha256: 4d2045c5bfa66004516dffa55e965e90958270adba9599f116990ac27cc489f8
    attach: primary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/spring-batch/spring-batch-job-overlay.md
    sha256: 58f710fcfeeaeafcaa19fd4ef27bce22c3c34d8d1ef7992f95f65a3e1bd9cd78
    attach: primary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/tomcat/tomcat-runtime-overlay.md
    sha256: 133f15dbb7866e9e06cecf4e2cfcc2b2f14eeb06d9ea3d29be68c9e11cdd1e11
    attach: primary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/nginx/nginx-proxy-overlay.md
    sha256: 442da24b2bb5274003978636cf793bae02b25f24aa080fcc926c5347da39ce19
    attach: primary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/kubernetes-ingress/kubernetes-ingress-overlay.md
    sha256: 4369b51a677453c24b5ec4d4b97001c91932918fc779c55562012ebc6b312bf5
    attach: primary
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/messaging/messaging-reliability-overlay.md
    sha256: ed7f82208521675510ab4a42b229f9be269a52514cf5188c9bf83323d7590572
    attach: primary
---

# 集成与异步运行时

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。
文末「语言与栈节」为 stacks overlay 资产 Scope/Rules/Checklist 的逐字节同步副本（标题降 2 级，正文零改动）——资产层为唯一权威，改规则只改 overlay、本区随同步。

## Scope

**源：BE 24 外部集成与韧性协议（pomaster/components/backend-hard-spec/assets/universal/24-external-integration-resilience-protocol.md）**

规范外部契约、超时、重试、熔断、补偿、对账和供应方故障。

**源：BE 25 异步任务与调度协议（pomaster/components/backend-hard-spec/assets/universal/25-async-job-scheduler-protocol.md）**

规范 Job 生命周期、进度、取消、重试、调度锁、结果与保留。

**源：BE 31 运行时与部署协议（pomaster/components/backend-hard-spec/assets/universal/31-runtime-deployment-protocol.md）**

规范部署单元、实例、网络、TLS、代理头、健康检查、容器与运行时加固。

## Non-Scope

**源：BE 24 外部集成与韧性协议**

不发明供应方 SLA、字段或错误语义。

**源：BE 25 异步任务与调度协议**

不绑定具体调度器、队列或批处理框架。

**源：BE 31 运行时与部署协议**

不默认选择 Nginx、Ingress、Tomcat、容器平台或具体 JVM 参数。

## Terms

**源：BE 24 外部集成与韧性协议**

补偿用于处理无法由单一原子事务覆盖的已发生副作用。

**源：BE 25 异步任务与调度协议**

Job instance 是由稳定业务参数标识的一次可追踪执行意图。

**源：BE 31 运行时与部署协议**

部署拓扑描述入口链路、信任边界、运行单元、状态依赖与观测链路。

## MUST

**源：BE 24 外部集成与韧性协议 · §MUST**

- 每个外部调用必须定义超时、重试条件、幂等、失败映射和恢复路径。

**源：BE 25 异步任务与调度协议 · §MUST**

- 任务必须定义身份、状态、幂等、重试、取消、超时和结果访问。

**源：BE 31 运行时与部署协议 · §MUST**

- 必须记录真实打包、启动、端口、协议、实例、状态依赖和配置来源。

## MUST NOT

**源：BE 24 外部集成与韧性协议 · §MUST NOT**

- 不得无限重试、重试非幂等操作或在事务内执行无界调用。

**源：BE 25 异步任务与调度协议 · §MUST NOT**

- 不得用固定 sleep、无主线程或无状态记录的后台执行承载关键任务。

**源：BE 31 运行时与部署协议 · §MUST NOT**

- 不得把开发机拓扑、默认端口或未验证容器行为当作生产事实。

## SHOULD

**源：BE 24 外部集成与韧性协议 · §SHOULD**

- 应采用隔离、熔断、限流、降级与对账控制故障扩散。

**源：BE 25 异步任务与调度协议 · §SHOULD**

- 应支持进度、心跳、并发限制、失败恢复和过期清理。

**源：BE 31 运行时与部署协议 · §SHOULD**

- 应支持优雅启动停止、健康检查、滚动发布、最小权限和故障隔离。

## Contract

**源：BE 24 外部集成与韧性协议 · §Contract**

集成契约必须记录版本、认证、请求响应、错误、限额、追踪与所有者。

**源：BE 25 异步任务与调度协议 · §Contract**

任务契约必须包含触发源、参数、状态机、输出、错误、保留和权限。

**源：BE 31 运行时与部署协议 · §Contract**

部署设计必须包含入口、网络、信任、依赖、扩缩容、恢复和证据。

## Checklist

**源：BE 24 外部集成与韧性协议 · §Checklist**

- [ ] 超时、限流、部分失败、重复响应和供应方中断已测试。

**源：BE 25 异步任务与调度协议 · §Checklist**

- [ ] 重复触发、节点崩溃、接管、取消、重跑与过期已测试。

**源：BE 31 运行时与部署协议 · §Checklist**

- [ ] 多实例、代理链、TLS、健康、配置、日志与回滚已演练。

## Examples

**源：BE 24 外部集成与韧性协议 · §Examples**

- 写入本地意图后异步调用供应方，并通过状态机与对账收敛。

**源：BE 25 异步任务与调度协议 · §Examples**

- 导出任务返回 job ID，调用方查询状态并从受权地址下载结果。

**源：BE 31 运行时与部署协议 · §Examples**

- 明确 Ingress 到 Service 再到应用的代理头与健康检查责任。

## Anti-patterns

**源：BE 24 外部集成与韧性协议 · §Anti-patterns**

- 捕获外部异常后记录日志并返回业务成功。

**源：BE 25 异步任务与调度协议 · §Anti-patterns**

- 调度表达式重叠时并发执行同一不可重入任务。

**源：BE 31 运行时与部署协议 · §Anti-patterns**

- 应用无条件信任任意来源的 `X-Forwarded-*`。

## Ownership

**源：BE 24 外部集成与韧性协议 · §Ownership**

集成 Owner 维护供应方契约，业务 Owner 决定降级与补偿语义。

**源：BE 25 异步任务与调度协议 · §Ownership**

任务 Owner 定义生命周期，运行平台提供调度与执行证据。

**源：BE 31 运行时与部署协议 · §Ownership**

Backend 拥有应用运行契约，平台角色拥有受控部署环境。

## Change Policy

**源：BE 24 外部集成与韧性协议 · §Change Policy**

供应方版本或认证变化必须经过兼容窗口和演练。

**源：BE 25 异步任务与调度协议 · §Change Policy**

参数或状态变化必须兼容历史任务和进行中的执行。

**源：BE 31 运行时与部署协议 · §Change Policy**

拓扑或打包变化必须同步技术基线、发布方案与运行验证。

## 语言与栈节（overlay 资产同步区）

> 本区各小节 = stacks/ overlay 资产 Scope/Rules/Checklist 的**逐字节同步副本**（标题降 2 级，正文零改动）。资产层（overlay 文件，catalog 在册、research 锚、bound 语义挂点）为唯一权威；本区为注入面副本，改规则只改 overlay、本区随同步。x-research-anchors 留在 overlay 资产 frontmatter，不复制进本主题文档（防双锚漂移）。

### spring-webflux（源：stacks/spring-webflux/spring-webflux-reactive-overlay.md · B02 主挂点）

#### Scope

本 Overlay 具体化响应式请求链、背压、调度器和非阻塞边界。

#### Rules

- 必须识别并隔离阻塞 I/O，不得在事件循环中执行不可控阻塞操作。
- 必须验证取消、超时、背压和上下文传播。
- 与 Spring MVC 并存时必须记录模块、端口或应用边界。

#### Checklist

- [ ] Java 与 Spring Boot 依赖已显式选择。
- [ ] 阻塞边界与容量证据可复核。


### spring-batch（源：stacks/spring-batch/spring-batch-job-overlay.md · B02 主挂点）

#### Scope

本 Overlay 具体化 Job、Step、重启、分片、元数据和批处理事务边界。

#### Rules

- 作业参数、实例身份、重启语义和幂等边界必须稳定。
- 分片、重试、跳过和失败恢复必须有数据一致性证据。
- 调度系统与 Spring Batch 的职责必须分开记录。

#### Checklist

- [ ] Java 与 Spring Boot 依赖已显式选择。
- [ ] 重跑、取消、并发和结果保留策略已验证。


### tomcat（源：stacks/tomcat/tomcat-runtime-overlay.md · B02 主挂点）

#### Scope

本 Overlay 具体化 embedded 与 external Tomcat 的连接器、线程、部署和加固边界。

#### Rules

- 必须在技术基线中明确 embedded 或 external，以及 JAR 或 WAR。
- 连接器、代理头、线程和请求限制必须与入口及容量方案一致。
- 不得把本地启动形态当作生产运行事实。

#### Checklist

- [ ] Java 依赖已显式选择。
- [ ] 容器版本、打包、配置来源和运行证据一致。


### nginx（源：stacks/nginx/nginx-proxy-overlay.md · B02 主挂点）

#### Scope

本 Overlay 具体化 TLS 终止、代理头、超时、上传限制和入口路由边界。

#### Rules

- 必须声明可信代理链、原始客户端地址与协议头的处理方式。
- 超时、body 限制和缓冲策略必须与应用行为一致。
- 与 Kubernetes Ingress 并存时必须记录完整入口链路与各自责任。

#### Checklist

- [ ] 配置语法、路由、TLS 与健康检查有可复核证据。
- [ ] 默认页、管理面和敏感头未意外暴露。


### kubernetes-ingress（源：stacks/kubernetes-ingress/kubernetes-ingress-overlay.md · B02 主挂点）

#### Scope

本 Overlay 具体化集群入口、Service 路由、TLS、annotation 与健康检查边界。

#### Rules

- 必须记录实际 Ingress Controller、入口类和可信代理链。
- annotation 与超时不得依赖未审计的集群默认值。
- 与 Nginx 并存时必须记录完整入口链路与各自责任。

#### Checklist

- [ ] manifest、路由、证书和回滚路径可复核。
- [ ] 控制器特有行为已在项目技术基线中声明。


### messaging（源：stacks/messaging/messaging-reliability-overlay.md · B02 主挂点）

#### Scope

本 Overlay 具体化消息契约、投递、消费、重试、死信与可观测边界。

#### Rules

- topic、事件 schema、版本、顺序和重复投递语义必须明确。
- 消费者必须按契约处理幂等、毒消息、重试和死信。
- 不得把 broker 可用性等同于业务处理成功。

#### Checklist

- [ ] 生产、消费、补偿和对账证据可关联。
- [ ] 敏感数据、保留期和权限符合安全与隐私协议。

