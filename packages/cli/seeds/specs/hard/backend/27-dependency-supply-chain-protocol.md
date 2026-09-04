---
seed_source: pomaster/components/backend-hard-spec/assets/universal/27-dependency-supply-chain-protocol.md
seed_source_sha256: 7e0817507039ab5f633ff4cb7eb3590d8755a547b8db91867f92bc702a64ddfe
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:dependency-supply-chain-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check, release]
triggers: [dependency, supply-chain]
requires: []
---

# 依赖与供应链协议

## Scope

规范依赖准入、版本、漏洞、许可证、来源、锁文件和构建供应链。

## Non-Scope

不规定具体语言的包管理器命令。

## Terms

直接依赖由项目显式声明，传递依赖由解析图间接引入。

## MUST

- 新增或升级依赖必须验证必要性、来源、版本、许可证、漏洞和维护状态。

## MUST NOT

- 不得从不可信源下载执行代码或忽略锁文件与校验差异。

## SHOULD

- 应减少重复能力、限制依赖范围并生成可追溯物料清单。

## Contract

依赖变更必须记录原因、影响图、风险、测试、生成差异和回退。

## Checklist

- [ ] 直接与传递依赖、插件、镜像和构建脚本均已审计。

## Examples

- 安全升级同时验证 API 兼容、配置变化和运行回归。

## Anti-patterns

- 为一个简单函数引入高权限且维护不明的大型依赖。

## Ownership

依赖引入者负责评审，安全与平台角色维护阻断策略。

## Change Policy

紧急漏洞例外必须限时、可追踪并安排后续完整验证。

