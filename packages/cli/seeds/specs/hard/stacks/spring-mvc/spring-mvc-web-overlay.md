---
seed_source: pomaster/components/backend-hard-spec/assets/stacks/spring-mvc/spring-mvc-web-overlay.md
seed_source_sha256: 19a75e281d7406d4ce38accd4aa528496e9cb666a8d123bc489c7404cb67fcb6
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend-stack:spring-mvc
capability: web-framework
requires: [backend-stack:java, backend-stack:spring-boot]
conflicts: []
coexistence: explicit-scope
stages: [prepare, implement, check]
---

# Spring MVC Web Overlay

## Scope

本 Overlay 具体化 Servlet 请求链、Controller、参数绑定、异常映射和线程模型。

## Rules

- Controller 必须保持传输层职责，业务规则进入明确的应用或领域边界。
- 阻塞调用、上传下载和异步请求必须声明超时、资源与安全约束。
- 与 WebFlux 并存时必须记录模块、端口或应用边界。

## Checklist

- [ ] Java 与 Spring Boot 依赖已显式选择。
- [ ] API、错误码、权限和测试证据与实现一致。

