---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/28-form-protocol.md
seed_source_sha256: 1359f0b753ece0f633b1aadea11e4ffd03dfc38f5b1f59e8cd869eba502e4807
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 28 表单协议

## Scope

P1。定义表单布局、模型、校验、联动、提交、回显、草稿、错误和冲突。

## Non-Scope

不定义具体业务字段和后端权威规则，不替代页面结构。

## Terms

- FormModel：独立于 DTO 的编辑模型。
- Dirty State：当前值偏离初始值。
- Field Error：绑定具体字段的错误。

## MUST

- 使用独立 FormModel 和 typed schema。
- 必填、只读、自动计算、回填和无权限字段可区分。
- 前端先做格式校验，后端字段错误定位并聚焦字段。
- 提交防重复并保留失败输入。
- 联动规则集中可测试，隐藏字段清值策略明确。
- dirty 离开、草稿隔离和版本冲突有策略。
- 每个输入必须有持久可见且程序化关联的标签、格式说明和必要性提示；placeholder 不得替代标签。
- 校验错误必须与字段程序化关联，并在可行时给出修复建议；错误摘要必须能导航到对应字段。
- 姓名、地址、联系方式、认证等常见字段必须使用语义正确的 autocomplete/inputmode 等浏览器提示，除非有明确的安全或业务理由。
- 同一流程已提供的数据必须复用或允许用户确认，避免重复录入；删除、提交、转账等高风险动作必须提供复核、确认、撤销或等效防错。

## MUST NOT

- MUST NOT 直接绑定 DTO。
- MUST NOT 在 template 临时写业务校验。
- MUST NOT 提交失败清空输入。
- MUST NOT 用大量互相触发 watcher 实现联动。
- MUST NOT 只用颜色、图标、toast 或页面顶部文案表达字段错误。
- MUST NOT 禁止密码管理器或无理由阻止粘贴。

## SHOULD

- SHOULD 大表单按业务语义分区或分步。
- SHOULD 提供错误摘要和首错导航。

## Contract

```text
FormModel, Schema, InitialValues, Validation,
SubmitCommand, DraftPolicy, DirtyPolicy, ConflictPolicy
```

## Checklist

- [ ] 模型和 schema 独立。
- [ ] 字段错误可定位。
- [ ] 防重复与冲突完整。
- [ ] 草稿和离开策略安全。
- [ ] 标签、说明、错误和字段程序化关联。
- [ ] 自动填充、重复录入和高风险动作已检查。

## Examples

### 内容示例，可删除

后端 422 字段错误映射到对应输入，保留用户数据并聚焦第一个错误。

## Anti-patterns

表单直接修改 DTO，失败后 reset，用户输入全部丢失。

## Ownership

领域 Owner 维护字段规则，前端 Owner 维护 FormModel，后端 Owner 维护权威校验。

## Change Policy

字段或联动变化必须同步 schema、adapter、草稿版本、错误映射和测试。
