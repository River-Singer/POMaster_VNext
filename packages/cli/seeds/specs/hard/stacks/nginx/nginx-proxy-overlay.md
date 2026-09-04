---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/nginx/nginx-proxy-overlay.md
seed_source_sha256: 442da24b2bb5274003978636cf793bae02b25f24aa080fcc926c5347da39ce19
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:nginx
capability: edge-proxy
requires: []
conflicts: []
coexistence: explicit-entry-chain
stages: [prepare, implement, check, release]
---

# Nginx 入口代理 Overlay

## Scope

本 Overlay 具体化 TLS 终止、代理头、超时、上传限制和入口路由边界。

## Rules

- 必须声明可信代理链、原始客户端地址与协议头的处理方式。
- 超时、body 限制和缓冲策略必须与应用行为一致。
- 与 Kubernetes Ingress 并存时必须记录完整入口链路与各自责任。

## Checklist

- [ ] 配置语法、路由、TLS 与健康检查有可复核证据。
- [ ] 默认页、管理面和敏感头未意外暴露。

