---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/05-environment-configuration-protocol.md
seed_source_sha256: 3affc23c84d64d10c8911b84bd9db82a34fcb9b675f7365672d554ecf34c8fb6
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 05 环境与配置协议

## Scope

P0。管理环境划分、配置来源、环境变量、API 地址、Mock、日志等级和 Feature Flag 接入。

## Non-Scope

不保存真实密钥，不定义后端部署，也不替代安全或 Feature Flag 业务协议。

## Terms

- Build-time Config：构建时固化的公开配置。
- Runtime Config：部署后可替换的公开配置。
- Secret：不得进入前端的敏感值。
- Environment：相互隔离的运行域。

## MUST

- 配置必须有 schema、类型、默认值、必填校验和环境矩阵。
- API、Mock、日志和环境标识从统一配置模块读取。
- 生产默认关闭 Mock、调试日志和开发工具。
- 缺少必填配置时启动失败或安全降级，不得猜值。
- 所有客户端配置均按公开信息处理。

## MUST NOT

- MUST NOT 在业务代码硬编码环境 URL、密钥或凭据。
- MUST NOT 让组件读取底层环境变量。
- MUST NOT 意外跨环境连接数据。
- MUST NOT 将环境文件当密钥保险箱提交。

## SHOULD

- SHOULD 提供无敏感值的配置示例和启动校验。
- SHOULD 明确标识非生产环境。

## Contract

```text
ConfigKey, Type, Required, Public, Default,
AllowedEnvironments, Validation, Owner
```

## Checklist

- [ ] schema 和环境矩阵完整。
- [ ] 生产安全默认值明确。
- [ ] 前端产物无秘密值。
- [ ] Mock、日志和 API 来源统一。

## Examples

### 内容示例，可删除

业务 API 只读取 typed config 的 `apiBaseUrl`，组件不知道原始变量名称。

## Anti-patterns

在多个 API 文件硬编码不同测试地址，通过注释切换生产地址。

## Ownership

平台维护环境值，前端架构维护 schema，安全 Owner 裁决敏感性。

## Change Policy

配置增删改必须同步 schema、示例、部署矩阵和回滚；破坏性变更提供迁移期。
