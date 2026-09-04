---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/spring-webflux/spring-webflux-reactive-overlay.md
seed_source_sha256: 4d2045c5bfa66004516dffa55e965e90958270adba9599f116990ac27cc489f8
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:spring-webflux
capability: reactive-web-framework
requires: [backend-stack:java, backend-stack:spring-boot]
conflicts: []
coexistence: explicit-scope
stages: [prepare, implement, check]
---

# Spring WebFlux 响应式 Overlay

## Scope

本 Overlay 具体化响应式请求链、背压、调度器和非阻塞边界。

## Rules

- 必须识别并隔离阻塞 I/O，不得在事件循环中执行不可控阻塞操作。
- 必须验证取消、超时、背压和上下文传播。
- 与 Spring MVC 并存时必须记录模块、端口或应用边界。

## Checklist

- [ ] Java 与 Spring Boot 依赖已显式选择。
- [ ] 阻塞边界与容量证据可复核。

