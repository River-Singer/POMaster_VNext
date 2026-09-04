---
seed_source: pomaster/components/backend-hard-spec/assets/universal/10-security-protocol.md
seed_source_sha256: 56387f03edd35df50a5a701f4daab174b744d490663393f43331cf5401149f67
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:security-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check, release]
triggers: [security, api-input, authentication, authorization, file-processing, secrets]
requires: []
---

# 安全协议

## Scope

规范认证、鉴权、输入与文件校验、注入防护、密钥和安全默认值。

## Non-Scope

不替代隐私保留规则或具体基础设施加固 Overlay。

## Terms

信任边界是数据或调用从较低信任域进入较高权限域的位置。

## MUST

- 所有信任边界必须执行服务端校验、最小权限、失败关闭和安全审计。

## MUST NOT

- 不得信任前端隐藏、客户端校验、代理头或用户提供的资源归属。

## SHOULD

- 应采用参数化接口、集中密钥管理和可轮换凭据。

## Contract

安全设计必须列出资产、威胁、控制、失败语义、日志限制和验证证据。

## Checklist

- [ ] 认证、鉴权、输入、输出、文件、secret 与审计路径已检查。

## Examples

- 下载接口同时验证操作权限、数据范围和资源归属。

## Anti-patterns

- 把 token、密码或敏感 payload 写入日志与异常。

## Ownership

服务端拥有最终安全判断，安全评审者维护阻断门禁。

## Change Policy

放宽安全控制必须经过显式风险审批、范围限制和到期复审。

