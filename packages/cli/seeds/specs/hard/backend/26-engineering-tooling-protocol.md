---
seed_source: pomaster/components/backend-hard-spec/assets/universal/26-engineering-tooling-protocol.md
seed_source_sha256: b0fcecee17a3acdb11f59f065ae7cac269cc292e999dd39444e5293565d38fe1
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:engineering-tooling-protocol
criticality: standard
injection_mode: triggered
stages: [prepare, implement, check]
triggers: [build, tooling, ci]
requires: []
---

# 工程工具协议

## Scope

规范构建、静态检查、生成产物、CI、版本固定、ADR 与可复现性。

## Non-Scope

不规定所有项目使用同一构建工具。

## Terms

可复现构建是从受控输入得到可核对产物的过程。

## MUST

- 运行时、构建工具、依赖锁定和质量命令必须在仓库或受控环境中可发现。

## MUST NOT

- 不得手工修改生成产物或让本地与 CI 使用不一致的门禁。

## SHOULD

- 应自动校验生成代码、契约、migration、依赖和容器配置漂移。

## Contract

工具链记录必须包含版本来源、入口命令、输入、输出和失败门禁。

## Checklist

- [ ] 干净环境可完成构建、测试和静态检查。

## Examples

- CI 重新生成 OpenAPI 产物并拒绝未提交差异。

## Anti-patterns

- 依赖开发机全局工具或未记录的 IDE 操作。

## Ownership

平台维护者维护工具链，模块维护者确保项目命令持续可运行。

## Change Policy

工具升级必须验证兼容、锁文件、生成差异和回退。

