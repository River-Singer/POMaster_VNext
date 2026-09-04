---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/10-engineering-tooling-protocol.md
seed_source_sha256: c628d47dcae1ddd58ea3651eeae9dd84ff5157365a3892a367bd7b5bf0af2b9d
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 10 工程工具协议

## Scope

P0。用类型、格式、Lint、契约、测试、示例、CI 和 ADR 固化团队协议。

## Non-Scope

不强制所有项目使用同一框架或供应商工具，不替代依赖评审。

## Terms

- Quality Command：本地与 CI 共用的标准检查入口。
- Generated Artifact：由可重复命令生成、禁止手改的文件。
- ADR：记录重要架构决策及后果的文档。

## MUST

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

## MUST NOT

- MUST NOT 只靠口头约定格式、类型、接口和组件用法。
- MUST NOT 手改生成物。
- MUST NOT 为局部问题关闭全局规则。
- MUST NOT 让 CI 与本地使用不同质量标准。
- MUST NOT 依赖开发机全局安装的工具或隐式环境状态完成构建和检查。
- MUST NOT 用项目级忽略、`any`、类型断言或关闭规则掩盖局部问题；例外必须最小化并可追踪。

## SHOULD

- SHOULD 自动检测依赖边界、契约漂移、包体、可访问性和视觉回归。
- SHOULD 提供一条命令执行常规质量门禁。

## Contract

```text
Tool, Purpose, VersionPolicy, Command,
Inputs, Outputs, FailureCondition, Owner
```

## Checklist

- [ ] 工具和命令明确。
- [ ] CI 可自动发现违规。
- [ ] 生成过程可重复。
- [ ] 公共组件有示例。
- [ ] 重要决策有记录。
- [ ] 运行时和工具版本可复现，未依赖全局安装。
- [ ] 类型严格度和例外有边界、Owner 与迁移计划。

## Examples

### 内容示例，可删除

类型、lint、单测和构建通过统一脚本运行，CI 直接调用相同脚本。

## Anti-patterns

开发者本地忽略类型错误，CI 又没有 typecheck，问题直到上线构建才暴露。

## Ownership

工程 Owner 维护工具链，模块 Owner 修复违规，CI Owner 保证门禁可靠。

## Change Policy

工具新增、替换或规则放宽必须评估迁移、性能和开发体验，并提供版本化配置。
