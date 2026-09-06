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
legacy_id: theme:engineering-toolchain-and-dependencies
criticality: critical # 聚合注记：取源最高；info 性注记非执行语义
injection_mode: triggered # 聚合注记：来源同值；info 性注记非执行语义
stages: [prepare, implement, check, release] # 聚合注记：来源 stages 并集；info 性注记非执行语义
triggers: [build, tooling, ci, dependency, supply-chain] # 聚合注记：来源 triggers 并集；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/10-engineering-tooling-protocol.md
    sha256: c628d47dcae1ddd58ea3651eeae9dd84ff5157365a3892a367bd7b5bf0af2b9d
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/11-dependency-package-management-protocol.md
    sha256: a0cc135edaf0dfd1f5122d2ff7298866143ef3a273ad4d45f5e1eff763691867
    seed_version: B6B-1
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/26-engineering-tooling-protocol.md
    sha256: b0fcecee17a3acdb11f59f065ae7cac269cc292e999dd39444e5293565d38fe1
    seed_version: B6C
  - seed_source: pomaster/components/backend-hard-spec/assets/universal/27-dependency-supply-chain-protocol.md
    sha256: 7e0817507039ab5f633ff4cb7eb3590d8755a547b8db91867f92bc702a64ddfe
    seed_version: B6C
x-language-sections: # 语言节同步源（R-J 资产层唯一权威；注入面为同步副本）
  - overlay: pomaster/components/backend-hard-spec/assets/stacks/java/java-language-overlay.md
    sha256: 38b592a5beaa899abb45e871e5097cafedeea80502baee00bcfbfcfa313dab85
    attach: primary
---

# 工程工具链与依赖

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。
文末「语言与栈节」为 stacks overlay 资产 Scope/Rules/Checklist 的逐字节同步副本（标题降 2 级，正文零改动）——资产层为唯一权威，改规则只改 overlay、本区随同步。

## Scope

**源：FE 10 工程工具协议（pomaster/components/frontend-hard-spec/assets/universal/10-engineering-tooling-protocol.md）**

P0。用类型、格式、Lint、契约、测试、示例、CI 和 ADR 固化团队协议。

**源：FE 11 依赖与包管理协议（pomaster/components/frontend-hard-spec/assets/universal/11-dependency-package-management-protocol.md）**

P1。管理包管理器、锁文件、依赖引入、版本、许可证、安全、升级和删除。

**源：BE 26 工程工具协议（pomaster/components/backend-hard-spec/assets/universal/26-engineering-tooling-protocol.md）**

规范构建、静态检查、生成产物、CI、版本固定、ADR 与可复现性。

**源：BE 27 依赖与供应链协议（pomaster/components/backend-hard-spec/assets/universal/27-dependency-supply-chain-protocol.md）**

规范依赖准入、版本、漏洞、许可证、来源、锁文件和构建供应链。

## Non-Scope

**源：FE 10 工程工具协议**

不强制所有项目使用同一框架或供应商工具，不替代依赖评审。

**源：FE 11 依赖与包管理协议**

不规定具体框架选型，不替代供应链扫描和法律审查。

**源：BE 26 工程工具协议**

不规定所有项目使用同一构建工具。

**源：BE 27 依赖与供应链协议**

不规定具体语言的包管理器命令。

## Terms

**源：FE 10 工程工具协议**

- Quality Command：本地与 CI 共用的标准检查入口。
- Generated Artifact：由可重复命令生成、禁止手改的文件。
- ADR：记录重要架构决策及后果的文档。

**源：FE 11 依赖与包管理协议**

- Runtime Dependency：进入生产运行路径的依赖。
- Development Dependency：仅构建、测试或开发使用。
- Dependency Budget：包体、维护、安全和替换成本预算。

**源：BE 26 工程工具协议**

可复现构建是从受控输入得到可核对产物的过程。

**源：BE 27 依赖与供应链协议**

直接依赖由项目显式声明，传递依赖由解析图间接引入。

## MUST

**源：FE 10 工程工具协议 · §MUST**

- 项目明确 TypeScript/类型、Lint、Format、样式、测试和构建工具。
- 本地与 CI 使用相同标准命令。
- 接口契约和生成物必须可重复生成和校验。
- 公共组件必须有可运行示例。
- 重要架构和工具决策必须记录 ADR/RFC。
- 工具违规必须产生明确失败而非仅提示。
- 运行时、包管理器和关键构建工具版本必须被仓库内机器可读配置固定，并由 CI 校验。
- TypeScript 项目必须启用与代码库兼容的严格类型检查；暂不能启用的严格选项必须有范围、Owner、迁移计划和期限。
- 外部数据必须先经运行时校验再进入可信类型；类型断言和非空断言不得替代边界验证。
- 配置必须有单一有效来源，废弃配置应移除或显式失效，避免多个配置文件竞争生效。

**源：FE 11 依赖与包管理协议 · §MUST**

- 固定包管理器、锁文件和受信 registry。
- 固定 runtime 与包管理器版本；仓库只能有一种生效锁文件，CI 使用 frozen/immutable 安装并在 manifest 与锁文件漂移时失败。
- 引入前检查现有能力、维护状态、许可证、安全、包体和替代方案。
- 依赖变更必须审查直接与传递依赖、完整性/来源、安装脚本、可执行代码、发布内容和锁文件差异。
- 正确区分 runtime/dev 并保证可重复安装。
- 升级审查 breaking changes、测试和回滚。
- 删除未使用依赖及其配置、适配和文档。
- 构建插件、CI action、代码生成器和远程脚本按供应链依赖治理；可变引用必须改为不可变版本或受控版本策略。

**源：BE 26 工程工具协议 · §MUST**

- 运行时、构建工具、依赖锁定和质量命令必须在仓库或受控环境中可发现。

**源：BE 27 依赖与供应链协议 · §MUST**

- 新增或升级依赖必须验证必要性、来源、版本、许可证、漏洞和维护状态。

## MUST NOT

**源：FE 10 工程工具协议 · §MUST NOT**

- MUST NOT 只靠口头约定格式、类型、接口和组件用法。
- MUST NOT 手改生成物。
- MUST NOT 为局部问题关闭全局规则。
- MUST NOT 让 CI 与本地使用不同质量标准。
- MUST NOT 依赖开发机全局安装的工具或隐式环境状态完成构建和检查。
- MUST NOT 用项目级忽略、`any`、类型断言或关闭规则掩盖局部问题；例外必须最小化并可追踪。

**源：FE 11 依赖与包管理协议 · §MUST NOT**

- MUST NOT 为简单函数引入大型库。
- MUST NOT 并存职责重复的核心库而无批准。
- MUST NOT 手改或绕过锁文件。
- MUST NOT 忽略高危漏洞和许可证冲突。
- MUST NOT 盲目执行依赖安装脚本、远程脚本或自动修复命令而不审查将执行和变更的内容。
- MUST NOT 只审查 `package.json` 而忽略锁文件、传递依赖和 CI/构建依赖变化。

**源：BE 26 工程工具协议 · §MUST NOT**

- 不得手工修改生成产物或让本地与 CI 使用不一致的门禁。

**源：BE 27 依赖与供应链协议 · §MUST NOT**

- 不得从不可信源下载执行代码或忽略锁文件与校验差异。

## SHOULD

**源：FE 10 工程工具协议 · §SHOULD**

- SHOULD 自动检测依赖边界、契约漂移、包体、可访问性和视觉回归。
- SHOULD 提供一条命令执行常规质量门禁。

**源：FE 11 依赖与包管理协议 · §SHOULD**

- SHOULD 选择维护活跃、tree-shakable、类型完整的依赖。
- SHOULD 通过 adapter 隔离高替换成本 API。
- SHOULD 自动执行依赖差异、安全、许可证和来源审查；发布包时生成可验证 provenance/SBOM，并检查发布内容不含凭据、测试身份或私有 source map。

**源：BE 26 工程工具协议 · §SHOULD**

- 应自动校验生成代码、契约、migration、依赖和容器配置漂移。

**源：BE 27 依赖与供应链协议 · §SHOULD**

- 应减少重复能力、限制依赖范围并生成可追溯物料清单。

## Contract

**源：FE 10 工程工具协议 · §Contract**

```text
Tool, Purpose, VersionPolicy, Command,
Inputs, Outputs, FailureCondition, Owner
```

**源：FE 11 依赖与包管理协议 · §Contract**

```text
Package, Purpose, AlternativesChecked, RuntimeOrDev,
VersionPolicy, LockfileImpact, TransitiveDiff, Integrity, Provenance,
InstallScripts, BundleImpact, License, Security, Owner, RemovalPlan
```

**源：BE 26 工程工具协议 · §Contract**

工具链记录必须包含版本来源、入口命令、输入、输出和失败门禁。

**源：BE 27 依赖与供应链协议 · §Contract**

依赖变更必须记录原因、影响图、风险、测试、生成差异和回退。

## Checklist

**源：FE 10 工程工具协议 · §Checklist**

- [ ] 工具和命令明确。
- [ ] CI 可自动发现违规。
- [ ] 生成过程可重复。
- [ ] 公共组件有示例。
- [ ] 重要决策有记录。
- [ ] 运行时和工具版本可复现，未依赖全局安装。
- [ ] 类型严格度和例外有边界、Owner 与迁移计划。

**源：FE 11 依赖与包管理协议 · §Checklist**

- [ ] 新增必要性已证明。
- [ ] 安全、许可、维护、包体已评估。
- [ ] 安装可重复。
- [ ] 有升级和移除策略。
- [ ] 传递依赖、安装脚本和构建/CI 依赖已审查。

**源：BE 26 工程工具协议 · §Checklist**

- [ ] 干净环境可完成构建、测试和静态检查。

**源：BE 27 依赖与供应链协议 · §Checklist**

- [ ] 直接与传递依赖、插件、镜像和构建脚本均已审计。

## Examples

**源：FE 10 工程工具协议 · §Examples**

### 内容示例，可删除

类型、lint、单测和构建通过统一脚本运行，CI 直接调用相同脚本。

**源：FE 11 依赖与包管理协议 · §Examples**

### 内容示例，可删除

引入表格引擎前比较现有组件、许可证、虚拟滚动、可访问性和长期维护，并通过 adapter 隔离。

**源：BE 26 工程工具协议 · §Examples**

- CI 重新生成 OpenAPI 产物并拒绝未提交差异。

**源：BE 27 依赖与供应链协议 · §Examples**

- 安全升级同时验证 API 兼容、配置变化和运行回归。

## Anti-patterns

**源：FE 10 工程工具协议 · §Anti-patterns**

开发者本地忽略类型错误，CI 又没有 typecheck，问题直到上线构建才暴露。

**源：FE 11 依赖与包管理协议 · §Anti-patterns**

多个页面分别引入不同日期库，只为格式化日期，造成包体和时区行为不一致。

**源：BE 26 工程工具协议 · §Anti-patterns**

- 依赖开发机全局工具或未记录的 IDE 操作。

**源：BE 27 依赖与供应链协议 · §Anti-patterns**

- 为一个简单函数引入高权限且维护不明的大型依赖。

## Ownership

**源：FE 10 工程工具协议 · §Ownership**

工程 Owner 维护工具链，模块 Owner 修复违规，CI Owner 保证门禁可靠。

**源：FE 11 依赖与包管理协议 · §Ownership**

工程 Owner 维护策略，模块 Owner 负责新增，安全/法务裁决风险。

**源：BE 26 工程工具协议 · §Ownership**

平台维护者维护工具链，模块维护者确保项目命令持续可运行。

**源：BE 27 依赖与供应链协议 · §Ownership**

依赖引入者负责评审，安全与平台角色维护阻断策略。

## Change Policy

**源：FE 10 工程工具协议 · §Change Policy**

工具新增、替换或规则放宽必须评估迁移、性能和开发体验，并提供版本化配置。

**源：FE 11 依赖与包管理协议 · §Change Policy**

新增或主版本升级需要评审记录；紧急安全升级可加速但必须补测试。

**源：BE 26 工程工具协议 · §Change Policy**

工具升级必须验证兼容、锁文件、生成差异和回退。

**源：BE 27 依赖与供应链协议 · §Change Policy**

紧急漏洞例外必须限时、可追踪并安排后续完整验证。

## 语言与栈节（overlay 资产同步区）

> 本区各小节 = stacks/ overlay 资产 Scope/Rules/Checklist 的**逐字节同步副本**（标题降 2 级，正文零改动）。资产层（overlay 文件，catalog 在册、research 锚、bound 语义挂点）为唯一权威；本区为注入面副本，改规则只改 overlay、本区随同步。x-research-anchors 留在 overlay 资产 frontmatter，不复制进本主题文档（防双锚漂移）。

### java（源：stacks/java/java-language-overlay.md · T05 主挂点）

#### Scope

本 Overlay 具体化 Java 源码、构建、JDK 与 JVM 兼容边界。

#### Rules

- 必须固定并记录 JDK、编译目标、构建工具和依赖解析来源。
- 不得由 Java 选择推断 Spring Boot、数据库、Redis、Nginx 或 Tomcat。
- 语言升级必须验证字节码、运行时、测试与部署环境兼容性。

#### Checklist

- [ ] 版本来源、构建命令和 CI 运行时可复现。
- [ ] 项目技术基线记录实际 JDK 与打包方式。


> **缺席诚实**：php / python（后端语言）无 overlay 资产，不落语言节。
