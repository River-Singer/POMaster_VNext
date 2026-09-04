---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/java/java-language-overlay.md
seed_source_sha256: 38b592a5beaa899abb45e871e5097cafedeea80502baee00bcfbfcfa313dab85
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:java
capability: language-runtime
requires: []
conflicts: []
coexistence: independent
stages: [prepare, implement, check, release]
---

# Java 语言 Overlay

## Scope

本 Overlay 具体化 Java 源码、构建、JDK 与 JVM 兼容边界。

## Rules

- 必须固定并记录 JDK、编译目标、构建工具和依赖解析来源。
- 不得由 Java 选择推断 Spring Boot、数据库、Redis、Nginx 或 Tomcat。
- 语言升级必须验证字节码、运行时、测试与部署环境兼容性。

## Checklist

- [ ] 版本来源、构建命令和 CI 运行时可复现。
- [ ] 项目技术基线记录实际 JDK 与打包方式。

