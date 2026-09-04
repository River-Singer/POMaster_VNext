---
seed_source: pomaster/components/backend-hard-spec/assets/universal/13-privacy-data-lifecycle-protocol.md
seed_source_sha256: df20ccb85008f8744ea16db3ea64e54bdf9fd19d7aa3098c45dc44fff94c3d8d
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:privacy-data-lifecycle-protocol
criticality: critical
injection_mode: triggered
stages: [prepare, implement, check, release]
triggers: [sensitive-data, privacy, data-export]
requires: []
---

# 隐私与数据生命周期协议

## Scope

规范数据最小化、分类、脱敏、保留、删除、导出、接收方与审计。

## Non-Scope

不替代一般安全控制或业务合法性确认。

## Terms

生命周期覆盖收集、传输、存储、使用、共享、导出、保留与删除。

## MUST

- 敏感数据必须有目的、来源、接收方、保留期、删除触发与访问控制。

## MUST NOT

- 不得因“以后可能有用”收集或无限期保留数据。

## SHOULD

- 应在非必要场景使用最小字段、脱敏值或不可逆标识。

## Contract

数据设计必须记录分类、处理目的、存储位置、流向、保留与删除证据。

## Checklist

- [ ] URL、日志、trace、缓存、导出和备份均已检查敏感数据。

## Examples

- 审计记录保存必要标识与操作事实，不复制完整敏感 payload。

## Anti-patterns

- 在测试样例、日志或分析事件中使用真实敏感数据。

## Ownership

数据 Owner 决定用途与保留，Backend 实施并证明技术控制。

## Change Policy

扩大处理范围或接收方必须重新评审目的、权限与保留规则。

