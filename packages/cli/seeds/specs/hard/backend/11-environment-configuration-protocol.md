---
seed_source: pomaster/components/backend-hard-spec/assets/universal/11-environment-configuration-protocol.md
seed_source_sha256: eb9e82e9df64ce238501bc51cd359f36150f911c149904e2ed5a43d9b652b1bd
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:environment-configuration-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check, release]
triggers: [environment-configuration, configuration, secrets, runtime]
requires: []
---

# 环境与配置协议

## Scope

规范环境、profile、secret、超时、配置来源、变更和漂移。

## Non-Scope

不规定具体环境名称、凭据或连接参数数值。

## Terms

配置漂移是声明基线与构建、部署或运行时有效值不一致。

## MUST

- 配置必须有类型、来源、默认行为、敏感级别、验证与变更路径。

## MUST NOT

- 不得把 secret 写入仓库、日志、示例、命令行历史或生成文档。

## SHOULD

- 应在启动时校验关键配置，并对版本与来源提供可观测证据。

## Contract

配置变更必须说明兼容影响、部署顺序、回滚和漂移检测方式。

## Checklist

- [ ] 本地、CI、测试与运行环境的来源和覆盖顺序已核对。

## Examples

- 缺少必需配置时启动失败并输出不含 secret 的稳定错误。

## Anti-patterns

- 用环境默认值掩盖未声明的生产行为。

## Ownership

应用维护者定义消费契约，平台维护者提供受控配置与 secret 来源。

## Change Policy

配置键重命名必须提供双读或迁移窗口并验证旧值清理。
