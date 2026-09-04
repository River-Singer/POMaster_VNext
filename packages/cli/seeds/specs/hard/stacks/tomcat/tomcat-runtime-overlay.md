---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/tomcat/tomcat-runtime-overlay.md
seed_source_sha256: 133f15dbb7866e9e06cecf4e2cfcc2b2f14eeb06d9ea3d29be68c9e11cdd1e11
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:tomcat
capability: servlet-container
requires: [backend-stack:java]
conflicts: []
coexistence: explicit-runtime
stages: [prepare, implement, check, release]
---

# Tomcat 运行时 Overlay

## Scope

本 Overlay 具体化 embedded 与 external Tomcat 的连接器、线程、部署和加固边界。

## Rules

- 必须在技术基线中明确 embedded 或 external，以及 JAR 或 WAR。
- 连接器、代理头、线程和请求限制必须与入口及容量方案一致。
- 不得把本地启动形态当作生产运行事实。

## Checklist

- [ ] Java 依赖已显式选择。
- [ ] 容器版本、打包、配置来源和运行证据一致。

