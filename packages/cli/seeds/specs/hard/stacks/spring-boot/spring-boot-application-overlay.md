---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/spring-boot/spring-boot-application-overlay.md
seed_source_sha256: c8b2afe8de6c5af245035381a272644acee75d4e7d0efea901cac1f45d18d2a4
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:spring-boot
capability: application-framework
requires: [backend-stack:java]
conflicts: []
coexistence: independent
stages: [prepare, implement, check, release]
---

# Spring Boot 应用 Overlay

## Scope

本 Overlay 具体化 Spring Boot 的配置装配、启动、健康检查和依赖管理边界。

## Rules

- 必须记录 Boot 版本、配置来源、自动配置例外和启动验证。
- 不得从 Spring Boot 推断 Spring MVC、WebFlux、JAR、WAR 或 Tomcat 形态。
- 配置项和 actuator 暴露必须遵守安全与环境配置协议。

## Checklist

- [ ] Java 依赖已显式选择。
- [ ] 自动配置与运行时事实可由构建或启动证据验证。

