---
seed_source: pomaster/components/backend-hard-spec/assets/universal/09-role-responsibility-protocol.md
seed_source_sha256: 603b285faa271b77140f28e1038f850cd01b17ed1813b965898c4746233b342f
seed_version: B6C
lane: backend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [backend]
related_evidence_specs: []
related_tools: []
legacy_id: backend:role-responsibility-protocol
criticality: advisory
injection_mode: reference
stages: [prepare, check]
triggers: [ownership, handoff]
requires: []
---

# 角色与责任协议

## Scope

规范 Owner、RACI、评审责任、升级和跨角色交接。

## Non-Scope

不保存具体项目的人员名单或排班。

## Terms

Owner 指对契约、实现或证据完整性承担最终维护责任的角色。

## MUST

- 高风险决策、公共契约和运行门禁必须有可识别的责任角色。

## MUST NOT

- 不得用“团队共同负责”掩盖审批、维护或事故响应空缺。

## SHOULD

- 应在 handoff 中明确输入、输出、截止条件和拒收标准。

## Contract

责任记录至少包含决策者、执行者、评审者、被通知方和升级路径。

## Checklist

- [ ] 跨 BP、Frontend、Backend、Test 与 Ops 的边界已明确。

## Examples

- API 提供方维护契约，调用方确认兼容窗口内完成迁移。

## Anti-patterns

- 交接只发送文档链接，不说明版本、状态和待办。

## Ownership

治理维护者定义角色模型，项目自行绑定实际责任人。

## Change Policy

角色模型变化不得回写或推测消费项目的人员事实。

