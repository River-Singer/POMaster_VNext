---
seed_source: pomaster/components/backend-hard-spec/assets/universal/31-runtime-deployment-protocol.md
seed_source_sha256: c791451de0be3aa0629fd562e2b43cc54066e4b10d786264fa7a333c561ef23a
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:runtime-deployment-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check, release]
triggers: [runtime, deployment, configuration]
requires: []
---

# 运行时与部署协议

## Scope

规范部署单元、实例、网络、TLS、代理头、健康检查、容器与运行时加固。

## Non-Scope

不默认选择 Nginx、Ingress、Tomcat、容器平台或具体 JVM 参数。

## Terms

部署拓扑描述入口链路、信任边界、运行单元、状态依赖与观测链路。

## MUST

- 必须记录真实打包、启动、端口、协议、实例、状态依赖和配置来源。

## MUST NOT

- 不得把开发机拓扑、默认端口或未验证容器行为当作生产事实。

## SHOULD

- 应支持优雅启动停止、健康检查、滚动发布、最小权限和故障隔离。

## Contract

部署设计必须包含入口、网络、信任、依赖、扩缩容、恢复和证据。

## Checklist

- [ ] 多实例、代理链、TLS、健康、配置、日志与回滚已演练。

## Examples

- 明确 Ingress 到 Service 再到应用的代理头与健康检查责任。

## Anti-patterns

- 应用无条件信任任意来源的 `X-Forwarded-*`。

## Ownership

Backend 拥有应用运行契约，平台角色拥有受控部署环境。

## Change Policy

拓扑或打包变化必须同步技术基线、发布方案与运行验证。

