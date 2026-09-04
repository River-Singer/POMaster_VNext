---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/09-module-boundary-protocol.md
seed_source_sha256: f9a3c194910bbb31cd322849cb277db5d2ae0fd74773eef7df34197b8ad89c4f
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 09 模块边界协议

## Scope

P0。定义顶层目录职责、依赖方向、公开入口、shared 下沉和跨模块协作。

## Non-Scope

不规定具体框架目录名，不替代组件、状态或业务规则协议。

## Terms

- Module：有明确职责、Owner 和公开入口的代码边界。
- Public API：允许其他模块依赖的最小出口。
- Internal：只允许模块内部使用的实现。
- Shared：无特定业务所有权且满足复用门槛的能力。

## MUST

- 顶层目录和模块职责必须文档化。
- 依赖方向和禁止方向必须可检查。
- 模块外部只能通过 Public API 引用。
- 跨模块流程进入明确的 orchestration/feature 层。
- shared 下沉必须证明稳定复用和低业务耦合。
- 循环依赖必须被工具检测并阻止。

## MUST NOT

- MUST NOT 引用其他模块内部文件。
- MUST NOT 把页面代码作为其他模块依赖。
- MUST NOT 因方便把业务能力放进 shared。
- MUST NOT 新建无职责说明的顶层目录。

## SHOULD

- SHOULD 每个模块维护 contract、owner 和 index/public exports。
- SHOULD 用依赖图和 lint 自动执行边界。

## Contract

```text
Module, Responsibility, Owner, PublicExports[],
AllowedDependencies[], ForbiddenDependencies[], InternalPaths[]
```

## Checklist

- [ ] 新文件归属可解释。
- [ ] 只通过公开入口依赖。
- [ ] shared 满足下沉条件。
- [ ] 无循环或越层引用。

## Examples

### 内容示例，可删除

两个业务域共同参与的导入流程放入 feature/orchestration 层，而不是让域 A 引用域 B 的页面。

## Anti-patterns

把带客户、订单、成本语义的组件放入 shared，再被多个模块反向耦合。

## Ownership

架构 Owner 维护顶层边界，模块 Owner 维护公开入口，Reviewer 阻止越层引用。

## Change Policy

新增顶层模块、改变依赖方向或扩大 Public API 必须经过架构评审和迁移说明。
