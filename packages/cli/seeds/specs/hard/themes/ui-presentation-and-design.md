---
seed_source: packages/cli/seeds/aggregation-manifest.json
seed_source_sha256: 039b637ccffacdfe3ce30d85e193f4b38928fcdfb16efdc4eb255e35e05af91f
seed_version: B7-THEME
lane: [frontend]
status: CURRENT
authority_scope: mixed_required_and_advisory
applies_to: [frontend]
related_evidence_specs: []
related_tools: []
legacy_id: theme:ui-presentation-and-design
criticality: standard # 聚合注记：来源无 criticality 字段，取中性默认；info 性注记非执行语义
injection_mode: mixed # 聚合注记：来源无 injection_mode 字段（默认基线 + 任务命中激活模型）；info 性注记非执行语义
stages: [] # 聚合注记：来源无 stages 字段；info 性注记非执行语义
triggers: [] # 聚合注记：来源无 triggers 字段；info 性注记非执行语义
requires: [] # 聚合注记：来源 requires 并集（全空）
x-aggregation: # 聚合来源（D6）：逐源 vendor pin（sha256 与卡 vendor_pin 同值）
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/21-design-system-protocol.md
    sha256: 317d4086949eb7d26ea2465adc6521ba6ebb611dca0d2f32aec2c57a985be4f3
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/22-theme-protocol.md
    sha256: b93ed272a0def5abc689fe66d939b87cacf6f38cce5d6278cfd5c94d1754b3ec
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/23-accessibility-protocol.md
    sha256: 10557bf1221d1cf2748e29149820890e4523789701a35f7336e3f661fed82bfb
    seed_version: B6B-1
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/24-component-protocol.md
    sha256: 5ed49550278ae263d7b4f3914c20c31a3005dc101d45bbd48c025a444f7441c4
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/26-style-layout-protocol.md
    sha256: a66b216ca119c7296431233fb2bb6db9affd1f71ba011e5394aaaafdab9e8240
    seed_version: B6B-2
  - seed_source: pomaster/components/frontend-hard-spec/assets/universal/30-data-grid-protocol.md
    sha256: c702a9956fd5e7aac40e1eefebcdd7a3518b95bd1a750bfcb31cbaddb80f41ff
    seed_version: B6B-2
x-language-sections: # 语言节同步源（R-J 资产层唯一权威；注入面为同步副本）
  - overlay: pomaster/components/frontend-hard-spec/assets/stacks/vue3/vue3-framework-overlay.md
    sha256: 15e7fd3808760bb330933f4a0479e4e95e3e07d0e24485d1b9b860019a708935
    attach: primary
  - overlay: pomaster/components/frontend-hard-spec/assets/stacks/antdesign/antdesign-ui-overlay.md
    sha256: e70a6dad3fedbf8c4a182d92af9c9229e13cc368f880b3ccd96fe11ccdbdd7be
    attach: primary
  - overlay: pomaster/components/frontend-hard-spec/assets/stacks/geist/geist-design-system-overlay.md
    sha256: a9edc3d23708ccef6aeade6669dd638117f341052c47e0145347a5b51e085680
    attach: primary
  - overlay: pomaster/components/frontend-hard-spec/assets/stacks/css/css-system-overlay.md
    sha256: 4167e2a2d4c457f594db95336470dca4f0778e76df006e815207c0761667692a
    attach: primary
---

# UI 呈现与设计

> **聚合纪律**：本文档 12 节正文规则行逐字取自 frontmatter x-aggregation 所列来源协议（节内按「端 → 源编号升序」以加粗来源行分块，源内标题与层级原样保留），零新增、零改写、零删除；新增文本仅限文档标题、本注记与逐节来源行。
文末「语言与栈节」为 stacks overlay 资产 Scope/Rules/Checklist 的逐字节同步副本（标题降 2 级，正文零改动）——资产层为唯一权威，改规则只改 overlay、本区随同步。

## Scope

**源：FE 21 设计系统协议（pomaster/components/frontend-hard-spec/assets/universal/21-design-system-protocol.md）**

P1。定义合法 UI 的 token、组件、视觉状态、栅格、密度和动效来源。

**源：FE 22 主题协议（pomaster/components/frontend-hard-spec/assets/universal/22-theme-protocol.md）**

P1。定义亮暗、品牌、紧凑、大字体等主题及 token 覆盖、切换和持久化。

**源：FE 23 可访问性协议（pomaster/components/frontend-hard-spec/assets/universal/23-accessibility-protocol.md）**

P1。定义项目级可访问性治理：以 WCAG 2.2 AA 为默认目标，覆盖语义化 HTML、键盘导航、焦点管理、ARIA 使用、屏幕阅读器支持、颜色与对比度、表单与错误、动态内容/通知、响应式/缩放/触控目标、媒体与动画、时间限制/会话、可读性与认知负荷，以及第三方/自造组件 a11y 矩阵。具体组件的 props/role/keyboard map/focus 行为由 component-registry 的 vendor_api_ref 或自造组件 a11y 字段落地；本协议定义项目级检查点、工具链、例外流程和跨目录层级责任。

**源：FE 24 组件协议（pomaster/components/frontend-hard-spec/assets/universal/24-component-protocol.md）**

P1。定义组件分层、复用门槛、目录、Props、Events、Slots、状态和公共 API。

**源：FE 26 样式与布局协议（pomaster/components/frontend-hard-spec/assets/universal/26-style-layout-protocol.md）**

P1。定义 CSS 组织、尺寸职责、溢出、层级、响应式、第三方覆盖和布局稳定。

**源：FE 30 数据表格协议（pomaster/components/frontend-hard-spec/assets/universal/30-data-grid-protocol.md）**

P1。定义表格壳、列 schema、列宽、固定列、分页、排序筛选、虚拟滚动、列配置和导出。

## Non-Scope

**源：FE 21 设计系统协议**

不决定具体品牌主题，不替代页面结构、可访问性和设计交付协议。

**源：FE 22 主题协议**

不定义基础 token 语义，不允许主题改变业务含义。

**源：FE 23 可访问性协议**

- 不替代 WCAG 2.2、WAI-ARIA 1.2、WAI-ARIA APG 等官方标准；本协议是项目治理层对它们的应用与检查点映射。
- 不替代具体组件业务规则，也不以自动化扫描通过作为可访问性验收的唯一证据。
- 不在组件协议 24 中重复定义组件级 a11y API；组件协议 24 的 Checklist 引用本协议，组件实现细节落到 component-registry / vendor_api_ref。
- 不定义消费项目的视觉稿或品牌色；项目阈值和选型下沉到 a11y-requirements.yaml，universal 只规定必须存在的决策与证据。

**源：FE 24 组件协议**

不定义页面整体结构，不允许组件隐式承担接口、路由和全局状态职责。

**源：FE 26 样式与布局协议**

不定义品牌色值、页面业务结构或组件 API。

**源：FE 30 数据表格协议**

不定义业务字段口径，不允许表格库决定页面权限和数据契约。

## Terms

**源：FE 21 设计系统协议**

- Design Token：可复用的设计决策变量。
- Semantic Token：按用途而非具体值命名的 token。
- Component Token：组件级语义变量。

**源：FE 22 主题协议**

- Theme：一组完整 token 值。
- Theme Mode：light/dark 或其他可选模式。
- Theme Adapter：同步第三方组件、图表和 portal 的适配层。

**源：FE 23 可访问性协议**

- **Accessible Name**：辅助技术识别控件时朗读的名称，可来自可见文本、aria-label、aria-labelledby 或原生标签。
- **Focus Indicator**：键盘焦点在控件上可见的指示器，可以是浏览器默认轮廓或同等级可见替代。
- **Landmark**：HTML 语义区域（main、nav、aside、header、footer、section 等），辅助技术可快速跳转。
- **Live Region**：不抢夺焦点即可向屏幕阅读器宣布动态内容的区域（aria-live polite/assertive）。
- **Roving Tabindex**：组合组件（tabs、listbox、grid）中仅在活动项上放置 tabindex="0"、其余为 -1 的键盘模式。
- **Skip Link**：跳到主内容（main）的隐藏/可见链接，使键盘用户绕过重复导航块（WCAG 2.4.1）。
- **WCAG SC**：Web Content Accessibility Guidelines 成功准则（Success Criterion），例如 1.4.3、2.1.1。

**源：FE 24 组件协议**

- Base Component：无业务语义的基础控件。
- Domain Component：具有稳定领域语义的组件。
- Page-local Component：只服务单页的内部组件。
- Public Component：跨所有者复用并有稳定 contract 的组件。

**源：FE 26 样式与布局协议**

- Layout Owner：负责外层尺寸和区域关系的容器。
- Content Owner：负责内部内容排布的组件。
- Stable Dimension：动态状态下不引发布局跳动的尺寸约束。

**源：FE 30 数据表格协议**

- Grid Type：可编辑宽表、只读表、报表、主数据表等类型。
- Column Schema：列 key、类型、宽度、权限和行为契约。
- Saved View：用户保存的列、筛选和排序配置。

## MUST

**源：FE 21 设计系统协议 · §MUST**

- 定义颜色、字体、间距、圆角、阴影、层级、断点、状态和动效 token。
- UI 只能从 token 和批准组件取得视觉规则。
- hover、active、focus、disabled、loading、empty、error 状态完整。
- token 到代码和设计工具的映射有唯一来源。
- 新视觉规则有复用语义和 Owner。

**源：FE 22 主题协议 · §MUST**

- 明确支持的主题列表和默认主题。
- 所有主题覆盖完整语义 token，而非只换背景。
- 表格、图表、弹层、焦点和状态随主题同步。
- 切换、持久化、系统偏好和失败回退有策略。
- 每个主题满足可访问性和视觉回归。

**源：FE 23 可访问性协议 · §MUST**

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

> 注（结构事实，非规则）：上文「分层责任」H3 为 FE 23 源内 §MUST 的自有子结构，原样保留于本源块；其对 09-module-boundary-protocol 的引用在重组后指向 T00 主题文档（跨主题引用随迁；重组后指向 T00 架构与模块边界主题文档）。

**源：FE 24 组件协议 · §MUST**

- 新建前搜索现有组件并记录不能复用的原因。
- 组件归属、Owner、目的和非目标明确。
- Public Component 有类型化 Props、Events、Slots、状态、文档、测试和公开入口。
- 状态至少考虑 loading、empty、error、disabled、readonly 和 focus。
- 第二个消费者出现时重新评估提升层级。

**源：FE 26 样式与布局协议 · §MUST**

- 明确全局、组件、主题和第三方样式边界。
- 外层负责布局与 overflow，内层不得反向撑爆。
- 固定格式控件定义稳定尺寸、min/max 或比例。
- 文本换行、截断、tooltip 和横向滚动有统一规则。
- z-index 只能来自层级 token。
- 响应式断点和密度切换有验收矩阵。

**源：FE 30 数据表格协议 · §MUST**

- 表格通过统一壳和 typed Column Schema 渲染。
- 每列有稳定 key、标题、值类型、宽度策略、权限和导出规则。
- 大数据使用服务端分页/筛选/排序及虚拟化。
- 列配置按页面、表格、用户和 schema 版本隔离。
- 列宽修复先判断单页、同类型、领域 preset、表格壳或全局 token。
- 公共壳变更验证全部 Grid Type。
- 表格的交互状态（行 click / double-click / select / drag-select / 列头排序 click / 单元格 focus 等）MUST 在 `interaction-contract-registry` 中逐项声明，每项绑定触发的 `action_id` 与调用的 `api_requirement_ids`；表格不得存在未声明的交互。并非每个表格都要支持所有交互，但所支持的交互子集 MUST 显式界定并说明触发后果。排斥键盘的交互（drag / drag-select / hover-only）MUST 声明键盘等价路径（协议 23）。

## MUST NOT

**源：FE 21 设计系统协议 · §MUST NOT**

- MUST NOT 写孤立色值、魔法间距和临时阴影。
- MUST NOT 用“看起来差不多”代替 token。
- MUST NOT 在业务页面创建第二套视觉语言。
- MUST NOT 用设计稿临时样式覆盖 Design Token。

**源：FE 22 主题协议 · §MUST NOT**

- MUST NOT 在业务组件写死应由主题控制的颜色。
- MUST NOT 让局部页面自行换肤。
- MUST NOT 只处理页面背景而遗漏 portal/图表。
- MUST NOT 用主题切换表达权限或业务状态。

**源：FE 23 可访问性协议 · §MUST NOT**

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

**源：FE 24 组件协议 · §MUST NOT**

- MUST NOT 为减少几行代码创建无职责组件。
- MUST NOT 传整个 DTO 或万能配置对象。
- MUST NOT 让展示组件偷偷请求接口、改路由或全局状态。
- MUST NOT 从其他页面内部目录引用组件。

**源：FE 26 样式与布局协议 · §MUST NOT**

- MUST NOT 为单页问题修改全局 CSS。
- MUST NOT 依赖特定父 DOM 才能正常显示。
- MUST NOT 使用孤立 magic number、无来源 z-index 和随意 `!important`。
- MUST NOT 通过缩小字体掩盖溢出。

**源：FE 30 数据表格协议 · §MUST NOT**

- MUST NOT template 手写列或跨页面复制列数组。
- MUST NOT 为单页列宽修改全局 CSS。
- MUST NOT 不同类型表格共享污染配置 key。
- MUST NOT 前端加载全量数据假分页。

## SHOULD

**源：FE 21 设计系统协议 · §SHOULD**

- SHOULD 使用语义 token 分离品牌值与组件用途。
- SHOULD 自动校验 token 使用和弃用。

**源：FE 22 主题协议 · §SHOULD**

- SHOULD 使用 CSS variables 或等价运行时 token。
- SHOULD 避免主题切换闪烁和布局变化。

**源：FE 23 可访问性协议 · §SHOULD**

- SHOULD 以 WCAG 2.2 AA 为默认目标，并在关键公开路径追求 AAA 增强项。
- SHOULD 自动扫描（axe-core / Lighthouse）加人工键盘遍历、屏幕阅读器抽查和触控测试。
- SHOULD 为复杂组合组件使用 ARIA APG 设计模式（tabs、dialog、menu、treegrid）。
- SHOULD 提供统一、设计系统级别的 focus indicator token（颜色、宽度、offset、:focus-visible）。
- SHOULD 支持 prefers-reduced-motion 并关闭/降级动画、滚动、过渡。
- SHOULD 为长表单、多步骤流程提供进度保存与恢复机制。
- SHOULD 为复杂图表、媒体提供数据表格、长描述或音频描述。
- SHOULD 对第三方组件进行 spot check（键盘 + 屏幕阅读器 + axe-core）并记录到组件注册表。

**源：FE 24 组件协议 · §SHOULD**

- SHOULD 使用受控输入和语义事件。
- SHOULD 提供可运行示例和弃用策略。

**源：FE 26 样式与布局协议 · §SHOULD**

- SHOULD 优先使用标准 layout primitives。
- SHOULD 集中第三方样式适配。

**源：FE 30 数据表格协议 · §SHOULD**

- SHOULD 固定关键标识/操作列并限制冻结总宽。
- SHOULD 支持键盘、复制粘贴、冲突和保存视图的明确契约。

## Contract

**源：FE 21 设计系统协议 · §Contract**

```text
TokenName, Layer, SemanticMeaning, ValueByTheme,
AllowedConsumers, Deprecated?, Owner
```

**源：FE 22 主题协议 · §Contract**

```text
ThemeId, TokenSet, Default, Persistence,
SystemPreference, ThirdPartyAdapters[], Fallback
```

**源：FE 23 可访问性协议 · §Contract**

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

**源：FE 24 组件协议 · §Contract**

```text
Purpose, Owner, Props, Events, Slots, PublicMethods,
States, Permissions, Accessibility, Tokens, ReuseRules, ForbiddenChanges
```

**源：FE 26 样式与布局协议 · §Contract**

```text
Container, SizeOwner, OverflowPolicy, MinMax,
BreakpointBehavior, ZIndexToken, TextPolicy
```

**源：FE 30 数据表格协议 · §Contract**

```text
GridType, RowKey, ColumnSchema[], ServerOperations,
Virtualization, SavedViewKey, ExportScope, Permissions,
InteractionContracts[]
```

## Checklist

**源：FE 21 设计系统协议 · §Checklist**

- [ ] 所有视觉值来自 token。
- [ ] 状态与断点完整。
- [ ] 设计和代码来源一致。
- [ ] 新 token 有复用语义。

**源：FE 22 主题协议 · §Checklist**

- [ ] 支持范围和默认值明确。
- [ ] token 覆盖完整。
- [ ] 第三方与 portal 同步。
- [ ] 对比度和回退通过。

**源：FE 23 可访问性协议 · §Checklist**

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

**源：FE 24 组件协议 · §Checklist**

- [ ] 复用搜索完成。
- [ ] 分层和公开入口正确。
- [ ] 接口与状态完整。
- [ ] 测试、示例和 a11y 齐全。

**源：FE 26 样式与布局协议 · §Checklist**

- [ ] 尺寸责任明确。
- [ ] 长文本和小屏不破坏布局。
- [ ] 层级和第三方覆盖集中。
- [ ] 动态状态无跳动。

**源：FE 30 数据表格协议 · §Checklist**

- [ ] 表格由 schema 驱动。
- [ ] 列宽影响层级正确。
- [ ] 大数据和配置隔离安全。
- [ ] 导出与当前视图一致。
- [ ] 每个支持的交互（行点击/双击/拖选/排序/聚焦）在 interaction-contract-registry 声明并绑定 action + API。

## Examples

**源：FE 21 设计系统协议 · §Examples**

### 内容示例，可删除

组件使用 `color.action.primary`，而不是直接写品牌蓝十六进制值。

**源：FE 22 主题协议 · §Examples**

### 内容示例，可删除

主题切换统一更新页面、弹窗、表格和图表 palette。

**源：FE 23 可访问性协议 · §Examples**

### 真实示例（推荐）

- 筛选抽屉打开时，焦点进入抽屉内第一个可聚焦元素（如标题或首个字段）；关闭时焦点返回到触发按钮，并 polite 宣布“筛选条件已应用，N 个结果”。
- 表单提交失败时，页面顶部出现错误摘要，并自动聚焦到第一个错误字段；每个错误字段使用 aria-describedby 关联具体错误文本。
- 数据表格使用 APG 的 grid 模式：方向键在单元格间移动，Enter 进入编辑，Escape 退出编辑，焦点始终停留在表格内，不会泄漏到背景。
- 页面 html lang="zh-CN"；当用户切换到英文内容块时，该块使用 lang="en"，屏幕阅读器切换语音。
- 图表组件同时提供数据表格视图入口和 aria-label 摘要，使屏幕阅读器用户能访问数值和趋势。
- 认证页面允许粘贴密码，会话超时前弹出 20 秒警告，提供“延长会话”按钮，并自动保存表单草稿以便恢复。

**源：FE 24 组件协议 · §Examples**

### 内容示例，可删除

业务状态标签放领域层，基础 Tag 只负责通用视觉和语义。

**源：FE 26 样式与布局协议 · §Examples**

### 内容示例，可删除

页面容器管理横向滚动，表格声明最小内容宽度，单元格不硬编码页面宽度。

**源：FE 30 数据表格协议 · §Examples**

### 内容示例，可删除

同类型报表共享 column preset；单页例外写在 page contract，不改可编辑宽表。

## Anti-patterns

**源：FE 21 设计系统协议 · §Anti-patterns**

页面根据设计截图手写近似颜色和 13px/17px 等孤立间距。

**源：FE 22 主题协议 · §Anti-patterns**

仅给 body 加 dark class，而下拉、弹窗和图表仍使用亮色。

**源：FE 23 可访问性协议 · §Anti-patterns**

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

**源：FE 24 组件协议 · §Anti-patterns**

创建 `CommonTable2`，接收任意对象并在内部请求多个业务 API。

**源：FE 26 样式与布局协议 · §Anti-patterns**

为修复一个弹窗把全局 z-index 提到极大值，随后所有 dropdown 层级失控。

**源：FE 30 数据表格协议 · §Anti-patterns**

为某报表加全局 `.table td { width }`，导致所有列表和宽表一起变化。

## Ownership

**源：FE 21 设计系统协议 · §Ownership**

Design System Owner 与前端 Owner 共同维护，组件 Owner 消费但不私自改值。

**源：FE 22 主题协议 · §Ownership**

Design System Owner 维护主题 token，平台 Owner 维护切换，组件 Owner 负责兼容。

**源：FE 23 可访问性协议 · §Ownership**

- 前端 A11y Owner 维护 WCAG 目标、检查点、vendor_a11y_matrix 和扫描工具链。
- 设计 Owner 负责颜色对比度、focus indicator、触控目标、reduced-motion 视觉策略。
- 组件 Owner 负责实现组件级 a11y spec（role、keyboard map、focus entry/return、live announcement）。
- QA / Accessibility Owner 负责键盘遍历、屏幕阅读器抽查、axe-core 扫描和例外审批。
- 后端 Owner 配合认证/会话/错误 message 的可读性与超时策略。

**源：FE 24 组件协议 · §Ownership**

组件 Owner 维护 contract，调用方遵守公开 API，Design System Owner 维护基础组件视觉。

**源：FE 26 样式与布局协议 · §Ownership**

Design System Owner 维护 token，Layout Owner 维护区域，组件 Owner 维护内部样式。

**源：FE 30 数据表格协议 · §Ownership**

表格平台 Owner 维护壳，领域 Owner 维护列 schema，页面 Owner 维护例外。

## Change Policy

**源：FE 21 设计系统协议 · §Change Policy**

Token 改名/删除先 deprecated；值变化评估所有组件并执行视觉与对比度回归。

**源：FE 22 主题协议 · §Change Policy**

新增主题必须完整覆盖和验收；删除主题需迁移用户偏好并提供回退。

**源：FE 23 可访问性协议 · §Change Policy**

- 可访问性例外必须记录阻塞原因、适用 WCAG SC、影响、替代路径、Owner 和修复期限。
- 新增第三方组件或升级第三方组件前，必须对比 vendor_a11y_matrix，评估破坏性 a11y 变更。
- 新增自造组件必须同步提交组件级 a11y spec，未经 review 不得进入公共组件目录。
- 页面级 WCAG 目标收紧（如从 AA 到 AAA）或放宽（如特定页面降级）必须走变更治理，并更新 a11y-requirements.yaml。

**源：FE 24 组件协议 · §Change Policy**

公共 API 变化遵循影响评估、兼容、deprecated、迁移和删除周期。

**源：FE 26 样式与布局协议 · §Change Policy**

全局布局和层级变化必须评估全部页面类型并执行视觉回归。

**源：FE 30 数据表格协议 · §Change Policy**

列 schema 和保存视图结构必须版本化；公共行为变化遵循影响评估和视觉回归。

## 语言与栈节（overlay 资产同步区）

> 本区各小节 = stacks/ overlay 资产 Scope/Rules/Checklist 的**逐字节同步副本**（标题降 2 级，正文零改动）。资产层为唯一权威；改规则只改 overlay、本区随同步。x-research-anchors（vue3 2026-09-05 实抓 13 锚 / antdesign 2026-09-05 实抓 2 锚 / geist 2026-09-02 实抓 2 锚）留在 overlay 资产 frontmatter，不复制进本主题文档（防双锚漂移）。

### vue3（源：stacks/vue3/vue3-framework-overlay.md · F01 主挂点）

#### Scope

本 Overlay 具体化 Vue 3 组件模型、SFC、响应式系统与官方配套（状态 / 路由 / TypeScript 工具链）的选型与版本边界。

#### Rules

- 必须固定并记录 Vue 3、Pinia、vue-router 与 TypeScript 工具链（vue-tsc / @vue/tsconfig）的版本位与来源；版本位经实抓核实，不得沿用旧主版本记忆（现行线为 pinia 4.x / vue-router 5.x）。
- 状态与路由必须选官方方案：新应用状态管理选 Pinia（Vue 核心团队维护；Vuex 已是维护模式），SPA 路由选官方 Vue Router——两者是官方口径，不自造替代。
- 组件、SFC 与响应式写法以官方文档与风格指南优先级（A/B/C 三档）为基准；响应式必须声明 ref / reactive 选型边界（reactive 的 proxy 局限官方有专门小节）。
- 组合式函数必须遵守官方约定（命名、入参、返回值、副作用、使用限制），生命周期钩子按官方注册时机使用。
- 不得由 Vue 3 选型推断 UI 组件库、CSS 体系、grid 或构建工具选型；Vue 2 已 EOL，其心智不得带入新项目基线。

#### Checklist

- [ ] 版本位（vue / pinia / vue-router / typescript）经实抓核实并记录在项目技术基线。
- [ ] 状态、路由与 TS 类型检查工具链为官方词形（Pinia / Vue Router / vue-tsc）且带实抓日期锚。

### antdesign（源：stacks/antdesign/antdesign-ui-overlay.md · F01 主挂点）

#### Scope

本 Overlay 具体化 Ant Design Vue 组件库的引入、按需加载、主题（CSS-in-JS Design Token）与 React 版 antd 的对照边界。

#### Rules

- 必须固定组件库词形与版本位：Vue 栈为 ant-design-vue 4.x 线；React 版 Ant Design 仅作跨栈对照，其组件 API 与主题机制不得混用。
- 引入与按需加载必须走官方口径：全局重置用 `import 'ant-design-vue/dist/reset.css'`；按需加载用 unplugin-vue-components + AntDesignVueResolver（官方示例 importStyle: false 旁注 css in js）。
- 主题定制主通路为 v4 CSS-in-JS：ConfigProvider 的 theme prop（Design Token 三层派生 Seed → Map → Alias、default / dark / compact 三算法、组件级 Component Token），运行时消费用 useToken；v3 less 变量只作构建期静态消费兼容通道（theme.defaultAlgorithm(defaultSeed) + less-loader modifyVars），两条通路不得未声明混装。
- 不得由组件库选型推断 CSS 作用域体系、预处理器或 utility 方案（css 键独立选型）；组件库主题 token 不替代项目 design token 分层协议。

#### Checklist

- [ ] 版本位经 npm registry 实抓（4.2.6 双源一致）并记录在项目技术基线。
- [ ] 主题通路（运行时 CSS-in-JS / 构建期 less 兼容）已显式声明且与实际接线一致。

### geist（源：stacks/geist/geist-design-system-overlay.md · F01 主挂点）

#### Scope

本 Overlay 具体化以 Vercel Geist 为设计体系参照的 foundations 词形、组件词表与使用规则引用边界。

#### Rules

- Foundations 词形（colors / typography / materials）必须以实抓现状为准；Geist 现状无 spacing foundation——缺席诚实记录，禁杜撰 foundation 词形。
- 组件清单与 variant / state 词表以 Geist 组件页为词形锚；项目侧组件命名与变体词形引用时必须与锚一致或在册声明差异。
- 引用 Best Practices 要点（如 icon-only validator 抛错 = fail-closed 先例）必须带实抓时点；页面内容随后可能变动，过期引用须重新核实。
- Geist 为设计体系参照而非实现依赖——不得由 geist 参照推断框架、UI 组件库或 CSS 方案选型；与 UI 组件库 overlay 并存时各守各轴。

#### Checklist

- [ ] 引用的 foundations / 组件词表 / 使用规则带 verified 时点（2026-09-02）且未过期或已重新核实。
- [ ] 参照边界在册：geist 参照不绑定实现依赖，token 消费与主题协议的衔接已显式声明。
### css（源：stacks/css/css-system-overlay.md · F01 主挂点）

#### Scope

本 Overlay 具体化项目 CSS 体系选型（裁定 D8 组合词形 scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css）的官方词形与版本边界：SFC scoped 作用域机制、Ant Design Vue CSS-in-JS 主题 token 消费与官方全局重置。

#### Rules

- 必须固定并记录 CSS 体系组合词形与版本位：scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css（vue 3.5.42 / ant-design-vue 4.2.6，npm registry 实抓双源一致）；组合之外的作用域/utility 方案属 css 键改型，不得未声明引入。
- scoped 作用域以 SFC `<style scoped>` 为项目主机制（编译为 data-v-hash 属性选择器）；穿透与例外必须用官方逃逸词形 `:deep()`（子组件穿透）、`:slotted()`（slot 内容）、`:global()`（全局例外）；子组件根元素同时受父 scoped 影响为官方口径。
- antdv 主题 token 消费走 v4 CSS-in-JS 官方通路：ConfigProvider 的 theme prop（Design Token 三层派生 Seed → Map → Alias、default / dark / compact 三算法、组件级 Component Token），运行时消费用 useToken；组件库主题 token 不替代项目 design token 分层协议。
- 全局重置以官方单一来源承载：`import 'ant-design-vue/dist/reset.css'`；不得未声明引入与之竞争的第二套全局重置。

#### Checklist

- [ ] css 键组合词形与版本位（vue / ant-design-vue）经 npm registry 实抓并记录在项目技术基线。
- [ ] scoped 逃逸词形（:deep() / :slotted() / :global()）、antdv 主题通路（ConfigProvider theme + useToken）与全局重置（reset.css import）与实际接线一致。

> **缺席诚实**：react 无 overlay 资产（无研究锚），不落语言节；css 体系 overlay 已建并入本区（D8 组合词形 scoped-sfc+antdv-cssinjs-tokens+antdv-reset-css）。
