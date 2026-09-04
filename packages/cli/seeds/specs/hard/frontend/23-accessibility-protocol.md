---
seed_source: pomaster/components/frontend-hard-spec/assets/universal/23-accessibility-protocol.md
seed_source_sha256: 10557bf1221d1cf2748e29149820890e4523789701a35f7336e3f661fed82bfb
seed_version: B6B-1
lane: frontend
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
---

# 23 可访问性协议

## Scope

P1。定义项目级可访问性治理：以 WCAG 2.2 AA 为默认目标，覆盖语义化 HTML、键盘导航、焦点管理、ARIA 使用、屏幕阅读器支持、颜色与对比度、表单与错误、动态内容/通知、响应式/缩放/触控目标、媒体与动画、时间限制/会话、可读性与认知负荷，以及第三方/自造组件 a11y 矩阵。具体组件的 props/role/keyboard map/focus 行为由 component-registry 的 vendor_api_ref 或自造组件 a11y 字段落地；本协议定义项目级检查点、工具链、例外流程和跨目录层级责任。

## Non-Scope

- 不替代 WCAG 2.2、WAI-ARIA 1.2、WAI-ARIA APG 等官方标准；本协议是项目治理层对它们的应用与检查点映射。
- 不替代具体组件业务规则，也不以自动化扫描通过作为可访问性验收的唯一证据。
- 不在组件协议 24 中重复定义组件级 a11y API；组件协议 24 的 Checklist 引用本协议，组件实现细节落到 component-registry / vendor_api_ref。
- 不定义消费项目的视觉稿或品牌色；项目阈值和选型下沉到 a11y-requirements.yaml，universal 只规定必须存在的决策与证据。

## Terms

- **Accessible Name**：辅助技术识别控件时朗读的名称，可来自可见文本、aria-label、aria-labelledby 或原生标签。
- **Focus Indicator**：键盘焦点在控件上可见的指示器，可以是浏览器默认轮廓或同等级可见替代。
- **Landmark**：HTML 语义区域（main、nav、aside、header、footer、section 等），辅助技术可快速跳转。
- **Live Region**：不抢夺焦点即可向屏幕阅读器宣布动态内容的区域（aria-live polite/assertive）。
- **Roving Tabindex**：组合组件（tabs、listbox、grid）中仅在活动项上放置 tabindex="0"、其余为 -1 的键盘模式。
- **Skip Link**：跳到主内容（main）的隐藏/可见链接，使键盘用户绕过重复导航块（WCAG 2.4.1）。
- **WCAG SC**：Web Content Accessibility Guidelines 成功准则（Success Criterion），例如 1.4.3、2.1.1。

## MUST

- 默认目标必须达到 WCAG 2.2 AA；未满足项必须记录适用成功准则、影响、替代路径、Owner 和修复期限。
- 所有交互元素必须可通过键盘到达并操作；Tab 顺序与视觉顺序一致（WCAG 2.1.1 / 2.4.3）。
- 页面使用 header、nav、main、aside、footer、section、article 等语义元素；存在唯一的 main 地标（WCAG 2.4.1 / 1.3.1）。
- 主导航和重复块必须可被跳过（skip link 或地标跳转）；标题层级 h1–h6 与视觉层级一致，不跳过层级（WCAG 2.4.6）。
- 使用原生 HTML 语义可承载时优先使用原生元素；不得用无语义 div/span 模拟按钮、链接、表单控件（WCAG 4.1.2）。
- 弹层、抽屉、对话框打开后必须接管焦点，关闭后返回触发元素；背景不得保持可 Tab（WCAG 2.4.3 / 2.1.2）。
- 焦点必须可见，且不得被吸顶栏、浮层、sticky 元素完全遮挡（WCAG 2.4.7 / 2.4.11）。
- 所有非装饰图像必须提供等效 alt 文本；复杂图像提供 longer description 或 aria-describedby（WCAG 1.1.1）。
- 表单控件必须通过 label、aria-label 或 aria-labelledby 提供可见/可访问名称；placeholder 不得作为唯一标签（WCAG 3.3.2 / 1.3.1）。
- 错误必须与字段关联，并以文本描述提供纠错建议；提交时提供错误摘要并聚焦第一个错误字段（WCAG 3.3.1 / 3.3.3）。
- 颜色不得作为唯一信息来源；文本对比度至少 4.5:1，大文本至少 3:1，UI 组件/图标边界至少 3:1（WCAG 1.4.1 / 1.4.3 / 1.4.11）。
- 内容在 320 CSS px 宽度下可纵向阅读，不出现横向滚动；不得禁用浏览器缩放或固定视口（WCAG 1.4.10 / 1.4.4）。
- 触控目标尺寸至少 24×24 CSS px，且目标之间提供足够间距（WCAG 2.5.8）；建议达到 44×44（AAA）。
- 依赖拖拽的操作必须提供无需拖拽的等价路径（WCAG 2.5.7）。
- 动态状态、异步结果、进度变化必须可在不抢夺焦点的前提下被辅助技术识别；使用 aria-live 区域并区分 polite/assertive（WCAG 4.1.3）。
- 路由/页面切换后必须更新 document.title 并宣布页面变化（如聚焦到 h1 或 live region）。
- 自动播放音频超过 3 秒必须提供暂停/停止/音量控制；自动播放视频必须可被控制且不得禁用 reduced-motion（WCAG 1.4.2 / 2.3.3）。
- 尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级；闪烁内容不超过每秒 3 次（WCAG 2.3.1 / 2.3.3）。
- 登录、认证、会话超时流程必须兼容密码管理器和粘贴；超时前至少提供 20 秒警告并允许延长（WCAG 2.2.1 / 2.2.6 / 3.3.8）。
- 同一流程已输入的信息不得无理由要求重复录入；高风险操作必须提供确认、复核、撤销或等效防错机制（WCAG 3.3.4 / 3.3.7）。
- 页面 html 必须声明主语言 lang；内容中局部语言变化使用 lang 属性（WCAG 3.1.1 / 3.1.2）。
- 必须建立并维护 vendor_a11y_matrix：每个第三方组件（Ant Design、Vant、图表库、编辑器、地图等）记录已知 a11y 能力、缺陷、版本限制与替代策略；升级前进行破坏性变更评估。
- 自造组件或无 vendor 可引用时，必须写完整 a11y spec：role、keyboard map、focus entry/return、live announcement、contrast、target size、reduced-motion（WCAG 2.2 AA）。

### 分层责任（按目录层级）

可访问性是架构期约束，按目录层级分担责任；每层有明确的检查点与禁止行为。层级划分与 09-module-boundary-protocol 一致。

- **app 层 — 应用级可访问性骨架**：提供唯一的 main 地标、skip link、lang 声明、document.title 更新策略、全局 reduced-motion 开关和 focus indicator token。MUST NOT 在 body 或顶层容器使用 aria-hidden="true"；MUST NOT 禁用浏览器缩放或锁定视口。
- **platform 层 — 状态/会话可访问性**：认证/会话超时状态必须通过文本或 live region 宣布；全局错误/通知必须使用统一的 live region 策略。MUST NOT 在超时或认证失败后无警告地丢失已输入数据；MUST NOT 要求用户仅靠记忆、转录或解谜完成认证。
- **api 层 — 后端契约与错误可读性**：API 错误 message 必须可映射到可读文本和修复建议；auth/session 接口必须支持密码管理器、粘贴和超时延长。MUST NOT 返回仅依赖颜色或错误码的内部错误文本。
- **domain 层 — 领域语义与 a11y 映射**：领域实体状态（如审核结果、风险等级）不得仅用颜色/图标表达；必须提供文本标签和 aria 等价描述。MUST NOT 把业务语义隐藏在无标签的图标或图表元素中。
- **feature 层 — 页面级可访问性**：每个页面必须声明 WCAG 目标、skip link、焦点策略、live region 策略和错误聚焦行为；页面内组合组件（tabs、grid、listbox）必须实现 ARIA APG 键盘模式。MUST NOT 页面内存在无法通过键盘到达的交互；MUST NOT 路由切换无标题更新/读屏宣布。
- **shared 层 — 公共组件可访问性**：Table / Tree / Select / Form / Modal / Virtual List / Tabs / Grid 等公共组件必须有文档化的 role、keyboard map、focus entry/return、live announcement 和 contrast 要求；第三方组件必须引用 vendor_a11y_ref。MUST NOT 使用无 a11y spec 的自造组件；MUST NOT 用自定义 ARIA 覆盖破坏 vendor 默认键盘/焦点行为。

## MUST NOT

- MUST NOT 用无语义 div/span 模拟按钮、链接或表单控件。
- MUST NOT 移除焦点轮廓而无同等级可见替代。
- MUST NOT 仅通过颜色、hover 或 tooltip 传递关键信息。
- MUST NOT 弹层/抽屉焦点泄漏到背景。
- MUST NOT 在 aria-hidden="true" 下包裹仍可聚焦元素或包含可聚焦子元素。
- MUST NOT 使用已废弃的 ARIA role（如 directory）或拼写错误的 role。
- MUST NOT 在 body 上使用 aria-hidden="true"。
- MUST NOT 禁用浏览器缩放（user-scalable=no / maximum-scale=1.0）或锁定设备方向。
- MUST NOT 以自动化扫描通过作为可访问性验收的唯一证据。
- MUST NOT 图标按钮缺少 aria-label 或等效可访问名称。
- MUST NOT 错误提示仅通过颜色或 tooltip 呈现；不得在输入时无提示提交错误数据。
- MUST NOT 错误通知自动消失且不可恢复（除非用户可重新查看）。
- MUST NOT 非关键消息使用 assertive live region；MUST NOT 关键状态不宣布。
- MUST NOT 装饰图像使用非空 alt；MUST NOT 信息图像缺少 alt。
- MUST NOT 自动播放带声音的视频且无控制；MUST NOT 使用 blink / marquee 等已废弃元素。
- MUST NOT 超时/会话在无警告下失效；MUST NOT 认证流程禁用粘贴或仅依赖认知测试。
- MUST NOT 第三方组件假设开箱即用即符合项目 WCAG 目标；MUST NOT 用自定义 ARIA 覆盖破坏 vendor 默认键盘/焦点行为。
- MUST NOT 同一路径使用不同文案或图标表示同一功能；MUST NOT 导航/标签在页面内不一致。

## SHOULD

- SHOULD 以 WCAG 2.2 AA 为默认目标，并在关键公开路径追求 AAA 增强项。
- SHOULD 自动扫描（axe-core / Lighthouse）加人工键盘遍历、屏幕阅读器抽查和触控测试。
- SHOULD 为复杂组合组件使用 ARIA APG 设计模式（tabs、dialog、menu、treegrid）。
- SHOULD 提供统一、设计系统级别的 focus indicator token（颜色、宽度、offset、:focus-visible）。
- SHOULD 支持 prefers-reduced-motion 并关闭/降级动画、滚动、过渡。
- SHOULD 为长表单、多步骤流程提供进度保存与恢复机制。
- SHOULD 为复杂图表、媒体提供数据表格、长描述或音频描述。
- SHOULD 对第三方组件进行 spot check（键盘 + 屏幕阅读器 + axe-core）并记录到组件注册表。

## Contract

组件级 a11y 契约（保留原有字段，用于 component-registry / vendor_api_ref）：

```text
Component, Role, AccessibleName, KeyboardMap,
FocusEntry, FocusReturn, LiveAnnouncements, ContrastRequirement
```

项目级可访问性治理契约（按目录层级）：

```text
Layer, AccessibilityRequirement, WcagTarget, AssistiveTechMatrix,
KeyboardPolicy, FocusPolicy, TargetSizePolicy, ReducedMotionPolicy, VendorA11yRef
```

分层责任契约表（按目录层级，与 09-module-boundary-protocol 一致）：

```text
app, 应用级骨架（地标/skip/lang/缩放/focus token）, 2.4.1/2.4.6/1.3.1/1.4.4/2.4.7, 屏幕阅读器/键盘, skip link, focus indicator, 24/44px, prefers-reduced-motion, N/A
platform, 会话/状态/通知可读性, 2.2.1/2.2.6/3.3.8/4.1.3, 屏幕阅读器, 超时延长, 全局 live region, N/A, N/A, N/A
api, 后端错误可读性/认证支持, 3.3.1/3.3.2/3.3.8, 屏幕阅读器, 粘贴/密码管理器, 错误关联, N/A, N/A, N/A
domain, 领域语义/状态文本化, 1.4.1/1.3.1, 屏幕阅读器/色觉, N/A, 图标/图表标签, N/A, N/A, N/A
feature, 页面级键盘/焦点/路由/表单, 2.1.1/2.4.3/2.4.7/2.4.11/3.3.1/3.3.3, 键盘/屏幕阅读器, roving tabindex, 弹层焦点管理, 24/44px, 动画降级, vendor_a11y_ref
shared, 公共组件 a11y spec/矩阵, 4.1.2/1.1.1/2.4.7/2.5.8, 键盘/屏幕阅读器/放大, APG 键盘图, focus entry/return, 24/44px, reduced-motion, vendor_a11y_ref
```

## Checklist

- [ ] 默认 WCAG 2.2 AA 目标及例外记录完成。
- [ ] 语义 HTML 与地标（main/nav/header/footer/skip link）正确。
- [ ] 标题层级与视觉层级一致，无跳过层级。
- [ ] 键盘路径完整，Tab 顺序与视觉顺序一致，焦点可见且不被遮挡。
- [ ] 弹层/抽屉焦点管理正确（进入、困住、返回、背景屏蔽）。
- [ ] ARIA 使用有效，无冗余、无废弃 role、无 aria-hidden 包裹可聚焦元素。
- [ ] 屏幕阅读器标签、alt 文本、表单 label、错误关联正确。
- [ ] 对比度、颜色依赖、focus indicator、320px reflow、缩放策略通过。
- [ ] 表单错误聚焦、摘要、纠正建议、required 标识通过。
- [ ] 动态内容/通知使用合适的 live region，路由/页面切换有标题更新和宣布。
- [ ] 触控目标 >=24px、间距合理，响应式/缩放/方向策略合规。
- [ ] 媒体/动画有控制、字幕/音频描述、reduced-motion、闪烁安全。
- [ ] 时间限制/会话超时/认证流程支持延长、粘贴、密码管理器、数据保留。
- [ ] 可读性：lang 声明、局部语言、导航一致性、错误文本可读、缩写解释。
- [ ] 第三方/自造组件 a11y 矩阵和 spot check 完成；vendor_a11y_ref 正确引用。
- [ ] 分层责任按 app/platform/api/domain/feature/shared 确认，每层检查点与禁止行为已落地。

## Examples

### 真实示例（推荐）

- 筛选抽屉打开时，焦点进入抽屉内第一个可聚焦元素（如标题或首个字段）；关闭时焦点返回到触发按钮，并 polite 宣布“筛选条件已应用，N 个结果”。
- 表单提交失败时，页面顶部出现错误摘要，并自动聚焦到第一个错误字段；每个错误字段使用 aria-describedby 关联具体错误文本。
- 数据表格使用 APG 的 grid 模式：方向键在单元格间移动，Enter 进入编辑，Escape 退出编辑，焦点始终停留在表格内，不会泄漏到背景。
- 页面 html lang="zh-CN"；当用户切换到英文内容块时，该块使用 lang="en"，屏幕阅读器切换语音。
- 图表组件同时提供数据表格视图入口和 aria-label 摘要，使屏幕阅读器用户能访问数值和趋势。
- 认证页面允许粘贴密码，会话超时前弹出 20 秒警告，提供“延长会话”按钮，并自动保存表单草稿以便恢复。

## Anti-patterns

- 可点击 div 只支持鼠标，键盘和屏幕阅读器无法触发。
- 状态仅用红绿颜色区分（如“成功/失败”），未提供文本或图标标签。
- 移除所有按钮的 outline 而未提供替代 focus indicator，导致键盘用户无法看到焦点。
- 弹层打开后背景仍可 Tab，或关闭后焦点丢失到 body 而不是触发按钮。
- 信息图像使用 alt="" 或被 CSS 背景隐藏，屏幕阅读器无法识别。
- 图标按钮缺少 aria-label，屏幕阅读器只朗读“按钮”或“未标记”。
- 错误提示仅显示红色边框或 tooltip，未与字段关联，也未提供纠正建议。
- 禁用缩放导致低视力用户无法放大到 200%。
- 自动播放的宣传视频无暂停控制，且未响应 prefers-reduced-motion。
- 超时后立即登出并清空表单，未警告也未保存草稿。
- 第三方图表库假设开箱即用，未记录其 a11y 缺陷和规避策略。

## Ownership

- 前端 A11y Owner 维护 WCAG 目标、检查点、vendor_a11y_matrix 和扫描工具链。
- 设计 Owner 负责颜色对比度、focus indicator、触控目标、reduced-motion 视觉策略。
- 组件 Owner 负责实现组件级 a11y spec（role、keyboard map、focus entry/return、live announcement）。
- QA / Accessibility Owner 负责键盘遍历、屏幕阅读器抽查、axe-core 扫描和例外审批。
- 后端 Owner 配合认证/会话/错误 message 的可读性与超时策略。

## Change Policy

- 可访问性例外必须记录阻塞原因、适用 WCAG SC、影响、替代路径、Owner 和修复期限。
- 新增第三方组件或升级第三方组件前，必须对比 vendor_a11y_matrix，评估破坏性 a11y 变更。
- 新增自造组件必须同步提交组件级 a11y spec，未经 review 不得进入公共组件目录。
- 页面级 WCAG 目标收紧（如从 AA 到 AAA）或放宽（如特定页面降级）必须走变更治理，并更新 a11y-requirements.yaml。
