---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/41-design-handoff-protocol.md
seed_source_sha256: 335df4991a29eb77222b0596de5db7fcc0bd5d9019ecf9bf882a08cea74c1937
seed_version: B6B-2
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 41 设计交付协议

## Scope

P2。定义设计到代码的组件来源、token、状态、响应式、可访问性和验收交付。

## Non-Scope

不允许设计稿覆盖正式组件 API、安全、业务规则和工程边界。

## Terms

- Design Handoff：可供实现和验收的完整设计交付。
- State Matrix：默认、加载、空、错误、权限、禁用、长文本和小屏等状态。
- Design Source：设计系统组件和 token 的唯一来源。

## MUST

- 交付页面类型、组件来源、token、关键视口和交互流程。
- 提供完整 State Matrix，不只理想态。
- 标注响应式、长文本、缩放、键盘和焦点要求。
- 表格/报表交付列宽、固定列、大数据和导出状态。
- 设计变更有版本、原因、影响范围和通知。
- 设计验收同时检查可用性、可访问性和契约。

## MUST NOT

- MUST NOT 未标注来源就要求新建相似组件。
- MUST NOT 用设计稿临时值覆盖 token。
- MUST NOT 只交付桌面理想成功态。
- MUST NOT 通过页面局部 CSS 修补系统问题。

## SHOULD

- SHOULD 使用设计系统组件实例和 token 变量。
- SHOULD 将高风险交互做可点击原型和键盘说明。

## Contract

```text
PageOrComponent, DesignVersion, SourceComponents[],
Tokens[], States[], Viewports[], Interaction, Accessibility, Owner
```

## Checklist

- [ ] 组件和 token 来源明确。
- [ ] 状态与视口完整。
- [ ] 表格/长文本/a11y 已覆盖。
- [ ] 版本和影响可追踪。

## Examples

### 内容示例，可删除

设计交付同时包含正常、无权限、错误、长文本、125% 缩放和键盘焦点状态。

## Anti-patterns

只有一张理想截图，未说明组件来源、错误状态和小屏行为，开发只能猜测。

## Ownership

Design Owner 负责交付完整性，Frontend Owner 负责可实现性，QA/Accessibility Owner 负责验收。

## Change Policy

开发开始后的设计变化必须更新版本和影响范围；公共组件变化走变更治理。
