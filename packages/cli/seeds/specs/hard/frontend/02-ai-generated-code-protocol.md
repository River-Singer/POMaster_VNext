---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/02-ai-generated-code-protocol.md
seed_source_sha256: a80ea1c51c9afc0b96001cfffa0675edafb1572563652840bcf88770d81203c8
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 02 AI 生成代码协议

## Scope

P0。约束 AI 分析、生成、修改、评审和验证代码时的行为。

## Non-Scope

不替代人工需求决策、代码所有权、测试、合规审批或上线责任。

## Terms

- AI Change Plan：写代码前声明的协议、事实、范围和验证计划。
- Invented Contract：无正式来源而猜测的字段、状态、权限、API 或规则。
- Unrelated Change：当前目标不需要的修改。

## MUST

- AI 写代码前读取适用协议并输出 Change Plan。
- AI 必须先搜索已有组件、抽象、契约、工具和同类实现。
- AI 必须区分事实、推断和待确认项。
- AI 必须说明为什么修改这些文件、为什么不修改其他层。
- AI 必须运行可用检查并如实报告未验证项。
- AI 必须保留与任务无关的用户现有改动。

## MUST NOT

- MUST NOT 发明正式字段、枚举、公式、权限码、接口、路由或配置。
- MUST NOT 重复创建已有能力。
- MUST NOT 删除测试、降低断言、关闭规则或用类型逃逸掩盖问题。
- MUST NOT 声称执行了实际未运行的验证。

## SHOULD

- SHOULD 把重复决策沉淀为协议、contract 或自动检查。
- SHOULD 为高风险公共变更提供迁移和回滚。

## Contract

```text
Goal, Protocols, Facts, Assumptions, TODO_CONFIRM,
ReuseSearch, FilesToChange, FilesNotToChange,
Validation, ResidualRisk
```

## Checklist

- [ ] 已读协议和正式契约。
- [ ] 已证明新建必要性。
- [ ] 未猜测业务和接口事实。
- [ ] 修改与同步范围明确。
- [ ] 验证结果真实可复核。

## Examples

### 内容示例，可删除

AI 修复报表列宽前识别列 schema 所属层级，验证相同表格类型，再修改领域 preset。

## Anti-patterns

未搜索组件库便新建相似组件，并顺手重构 store、API 和全局样式。

## Ownership

AI 仅为 Contributor；任务、代码、评审和上线分别由对应人类 Owner 负责。

## Change Policy

放宽 AI 禁止规则必须由工程治理和领域 Owner 批准；新型 AI 错误应转为协议或门禁。
