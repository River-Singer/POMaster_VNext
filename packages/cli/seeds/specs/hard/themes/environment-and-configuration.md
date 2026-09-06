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
legacy_id: theme:environment-and-configuration
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: triggered # 聚合注记：来源同值；info 性注记非执行语义
stages: [prepare, implement, check, release] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [environment-configuration, configuration, secrets, runtime] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/05-environment-configuration-protocol.md
    sha256: 3affc23c84d64d10c8911b84bd9db82a34fcb9b675f7365672d554ecf34c8fb6
    seed_version: B6B-1
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/11-environment-configuration-protocol.md
    sha256: eb9e82e9df64ce238501bc51cd359f36150f911c149904e2ed5a43d9b652b1bd
    seed_version: B6C
x-language-sections: # 语言节同步源（R-J 资产层唯一权威；注入面为同步副本）
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/spring-boot/spring-boot-application-overlay.md
    sha256: c8b2afe8de6c5af245035381a272644acee75d4e7d0efea901cac1f45d18d2a4
    attach: primary
---

# 环境与配置

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。
文末「语言与栈节」为 stacks overlay 资产 Scope/Rules/Checklist 的逐字节同步副本（标题降 2 级，正文零改动）——资产层为唯一权威，改规则只改 overlay、本区随同步。

## Scope

**源：FE 05 环境与配置协议（pomaster/components/frontend-hard-spec/assets/universal/05-environment-configuration-protocol.md）**

P0。管理环境划分、配置来源、环境变量、API 地址、Mock、日志等级和 Feature Flag 接入。

**源：BE 11 环境与配置协议（pomaster/components/backend-hard-spec/assets/universal/11-environment-configuration-protocol.md）**

规范环境、profile、secret、超时、配置来源、变更和漂移。

## Non-Scope

**源：FE 05 环境与配置协议**

不保存真实密钥，不定义后端部署，也不替代安全或 Feature Flag 业务协议。

**源：BE 11 环境与配置协议**

不规定具体环境名称、凭据或连接参数数值。

## Terms

**源：FE 05 环境与配置协议**

- Build-time Config：构建时固化的公开配置。
- Runtime Config：部署后可替换的公开配置。
- Secret：不得进入前端的敏感值。
- Environment：相互隔离的运行域。

**源：BE 11 环境与配置协议**

配置漂移是声明基线与构建、部署或运行时有效值不一致。

## MUST

**源：FE 05 环境与配置协议 · §MUST**

- 配置必须有 schema、类型、默认值、必填校验和环境矩阵。
- API、Mock、日志和环境标识从统一配置模块读取。
- 生产默认关闭 Mock、调试日志和开发工具。
- 缺少必填配置时启动失败或安全降级，不得猜值。
- 所有客户端配置均按公开信息处理。

**源：BE 11 环境与配置协议 · §MUST**

- 配置必须有类型、来源、默认行为、敏感级别、验证与变更路径。

## MUST NOT

**源：FE 05 环境与配置协议 · §MUST NOT**

- MUST NOT 在业务代码硬编码环境 URL、密钥或凭据。
- MUST NOT 让组件读取底层环境变量。
- MUST NOT 意外跨环境连接数据。
- MUST NOT 将环境文件当密钥保险箱提交。

**源：BE 11 环境与配置协议 · §MUST NOT**

- 不得把 secret 写入仓库、日志、示例、命令行历史或生成文档。

## SHOULD

**源：FE 05 环境与配置协议 · §SHOULD**

- SHOULD 提供无敏感值的配置示例和启动校验。
- SHOULD 明确标识非生产环境。

**源：BE 11 环境与配置协议 · §SHOULD**

- 应在启动时校验关键配置，并对版本与来源提供可观测证据。

## Contract

**源：FE 05 环境与配置协议 · §Contract**

```text
ConfigKey, Type, Required, Public, Default,
AllowedEnvironments, Validation, Owner
```

**源：BE 11 环境与配置协议 · §Contract**

配置变更必须说明兼容影响、部署顺序、回滚和漂移检测方式。

## Checklist

**源：FE 05 环境与配置协议 · §Checklist**

- [ ] schema 和环境矩阵完整。
- [ ] 生产安全默认值明确。
- [ ] 前端产物无秘密值。
- [ ] Mock、日志和 API 来源统一。

**源：BE 11 环境与配置协议 · §Checklist**

- [ ] 本地、CI、测试与运行环境的来源和覆盖顺序已核对。

## Examples

**源：FE 05 环境与配置协议 · §Examples**

### 内容示例，可删除

业务 API 只读取 typed config 的 `apiBaseUrl`，组件不知道原始变量名称。

**源：BE 11 环境与配置协议 · §Examples**

- 缺少必需配置时启动失败并输出不含 secret 的稳定错误。

## Anti-patterns

**源：FE 05 环境与配置协议 · §Anti-patterns**

在多个 API 文件硬编码不同测试地址，通过注释切换生产地址。

**源：BE 11 环境与配置协议 · §Anti-patterns**

- 用环境默认值掩盖未声明的生产行为。

## Ownership

**源：FE 05 环境与配置协议 · §Ownership**

平台维护环境值，前端架构维护 schema，安全 Owner 裁决敏感性。

**源：BE 11 环境与配置协议 · §Ownership**

应用维护者定义消费契约，平台维护者提供受控配置与 secret 来源。

## Change Policy

**源：FE 05 环境与配置协议 · §Change Policy**

配置增删改必须同步 schema、示例、部署矩阵和回滚；破坏性变更提供迁移期。

**源：BE 11 环境与配置协议 · §Change Policy**

配置键重命名必须提供双读或迁移窗口并验证旧值清理。

## 语言与栈节（overlay 资产同步区）

> 本区各小节 = stacks/ overlay 资产 Scope/Rules/Checklist 的**逐字节同步副本**（标题降 2 级，正文零改动）。资产层（overlay 文件，catalog 在册、research 锚、bound 语义挂点）为唯一权威；本区为注入面副本，改规则只改 overlay、本区随同步。x-research-anchors 留在 overlay 资产 frontmatter，不复制进本主题文档（防双锚漂移）。

### spring-boot（源：stacks/spring-boot/spring-boot-application-overlay.md · T04 主挂点）

#### Scope

本 Overlay 具体化 Spring Boot 的配置装配、启动、健康检查和依赖管理边界。

#### Rules

- 必须记录 Boot 版本、配置来源、自动配置例外和启动验证。
- 不得从 Spring Boot 推断 Spring MVC、WebFlux、JAR、WAR 或 Tomcat 形态。
- 配置项和 actuator 暴露必须遵守安全与环境配置协议。

#### Checklist

- [ ] Java 依赖已显式选择。
- [ ] 自动配置与运行时事实可由构建或启动证据验证。


> **缺席诚实**：php / python（后端语言）无 overlay 资产，不落语言节。
