---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/39-copywriting-protocol.md
seed_source_sha256: 5df3a2ddcd1140b2e62dd80f547cf6c0197c44a91ebbdda02ded44bcaefed351
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 39 文案协议

## Scope

P2。定义按钮、确认、成功、错误、空态、删除、导入导出和高风险操作文案。

## Non-Scope

不定义业务规则和错误码，不允许文案隐藏系统行为。

## Terms

- Actionable Copy：说明发生什么、影响什么和下一步的文案。
- Risk Copy：明确不可逆性、对象和后果的文案。

## MUST

- 按钮使用明确动作和对象。
- 错误说明发生内容、可恢复性和下一步。
- 空态区分无数据与筛选无结果。
- 高风险确认明确对象、后果和是否可恢复。
- 导入导出说明范围、进度、部分成功和结果有效期。
- 同类操作使用同一名称和语气。

## MUST NOT

- MUST NOT 直接展示后端原始 message 或技术堆栈。
- MUST NOT 高风险操作只写“确定吗”。
- MUST NOT 用颜色或感叹号代替清晰说明。
- MUST NOT 用模糊“操作”“处理”隐藏动作。

## SHOULD

- SHOULD 简洁、专业、可行动。
- SHOULD 复用文案模板和错误码映射。

## Contract

```text
Scenario, Title, Message, PrimaryAction,
SecondaryAction, Consequence, Recoverability, TraceDisplay
```

## Checklist

- [ ] 动作和对象明确。
- [ ] 风险与恢复清晰。
- [ ] 同类文案一致。
- [ ] 无原始技术信息。

## Examples

### 内容示例，可删除

“该数据已被其他人更新。请比较最新版本后重新提交。”

## Anti-patterns

系统异常只显示“失败！”，用户不知道对象、原因或下一步。

## Ownership

内容/产品 Owner 维护语气，领域 Owner 确认语义，前端负责正确映射。

## Change Policy

公共文案模板变化需评估全部场景；业务术语变化同步 i18n 和帮助内容。
