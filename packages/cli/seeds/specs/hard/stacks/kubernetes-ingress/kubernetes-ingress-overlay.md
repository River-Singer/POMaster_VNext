---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/kubernetes-ingress/kubernetes-ingress-overlay.md
seed_source_sha256: 4369b51a677453c24b5ec4d4b97001c91932918fc779c55562012ebc6b312bf5
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:kubernetes-ingress
capability: cluster-ingress
requires: []
conflicts: []
coexistence: explicit-entry-chain
stages: [prepare, implement, check, release]
---

# Kubernetes Ingress Overlay

## Scope

本 Overlay 具体化集群入口、Service 路由、TLS、annotation 与健康检查边界。

## Rules

- 必须记录实际 Ingress Controller、入口类和可信代理链。
- annotation 与超时不得依赖未审计的集群默认值。
- 与 Nginx 并存时必须记录完整入口链路与各自责任。

## Checklist

- [ ] manifest、路由、证书和回滚路径可复核。
- [ ] 控制器特有行为已在项目技术基线中声明。

