---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/11-dependency-package-management-protocol.md
seed_source_sha256: a0cc135edaf0dfd1f5122d2ff7298866143ef3a273ad4d45f5e1eff763691867
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 11 依赖与包管理协议

## Scope

P1。管理包管理器、锁文件、依赖引入、版本、许可证、安全、升级和删除。

## Non-Scope

不规定具体框架选型，不替代供应链扫描和法律审查。

## Terms

- Runtime Dependency：进入生产运行路径的依赖。
- Development Dependency：仅构建、测试或开发使用。
- Dependency Budget：包体、维护、安全和替换成本预算。

## MUST

- 固定包管理器、锁文件和受信 registry。
- 固定 runtime 与包管理器版本；仓库只能有一种生效锁文件，CI 使用 frozen/immutable 安装并在 manifest 与锁文件漂移时失败。
- 引入前检查现有能力、维护状态、许可证、安全、包体和替代方案。
- 依赖变更必须审查直接与传递依赖、完整性/来源、安装脚本、可执行代码、发布内容和锁文件差异。
- 正确区分 runtime/dev 并保证可重复安装。
- 升级审查 breaking changes、测试和回滚。
- 删除未使用依赖及其配置、适配和文档。
- 构建插件、CI action、代码生成器和远程脚本按供应链依赖治理；可变引用必须改为不可变版本或受控版本策略。

## MUST NOT

- MUST NOT 为简单函数引入大型库。
- MUST NOT 并存职责重复的核心库而无批准。
- MUST NOT 手改或绕过锁文件。
- MUST NOT 忽略高危漏洞和许可证冲突。
- MUST NOT 盲目执行依赖安装脚本、远程脚本或自动修复命令而不审查将执行和变更的内容。
- MUST NOT 只审查 `package.json` 而忽略锁文件、传递依赖和 CI/构建依赖变化。

## SHOULD

- SHOULD 选择维护活跃、tree-shakable、类型完整的依赖。
- SHOULD 通过 adapter 隔离高替换成本 API。
- SHOULD 自动执行依赖差异、安全、许可证和来源审查；发布包时生成可验证 provenance/SBOM，并检查发布内容不含凭据、测试身份或私有 source map。

## Contract

```text
Package, Purpose, AlternativesChecked, RuntimeOrDev,
VersionPolicy, LockfileImpact, TransitiveDiff, Integrity, Provenance,
InstallScripts, BundleImpact, License, Security, Owner, RemovalPlan
```

## Checklist

- [ ] 新增必要性已证明。
- [ ] 安全、许可、维护、包体已评估。
- [ ] 安装可重复。
- [ ] 有升级和移除策略。
- [ ] 传递依赖、安装脚本和构建/CI 依赖已审查。

## Examples

### 内容示例，可删除

引入表格引擎前比较现有组件、许可证、虚拟滚动、可访问性和长期维护，并通过 adapter 隔离。

## Anti-patterns

多个页面分别引入不同日期库，只为格式化日期，造成包体和时区行为不一致。

## Ownership

工程 Owner 维护策略，模块 Owner 负责新增，安全/法务裁决风险。

## Change Policy

新增或主版本升级需要评审记录；紧急安全升级可加速但必须补测试。
