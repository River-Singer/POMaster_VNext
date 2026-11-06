# 前端设计规范（Ant Design，ant-design-vue@4.2.6）

> Storybook「规范」分区的 AI 可读孪生，由 packages/studio/scripts/lib/standard.mjs 生成，与页面同源。不要手改。
> 规范指纹 `sha256:8d76a174810fd0e92daaf15f67d262e48c280172b02c893838a409f3d7d908ff`；状态 origin=preset。
> 修改规范：编辑 `packages/cli/seeds/design-standards/antd.yaml` → `pomaster design validate` → `node packages/studio/run.mjs generate`；目录（领域与条目）由骨架 `packages/cli/seeds/design-standards/skeleton.yaml` 统一。
> 机器门禁规则违反即拦截（检查未接入时按评审执行）；人工评审规则在评审时逐条核对。标「待补」的是骨架里有、本体系还没写的：开发时参照另一套体系的同名页，并在评审时说明。

## 基础 / 色彩（COLOR）

品牌色取蓝色板第 6 档；功能色只表达状态；中性色按透明度分出文字、边框、背景三层。色彩用得克制，颜色只经 token 取。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-color--overview

### COLOR.PALETTE 色板

基础色板共 12 种主色，每种 10 档，由色板算法从主色派生，不手调；主色固定在第 6 档。界面只从这些色板和中性色里取色。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：每种色板的档数 `p.steps` = 10 个（Ant Design 设计规范 · 色彩）
- 参数：主色所在档 `p.primary_step` = 6 个（Ant Design 设计规范 · 色彩）
- 色板「品牌色与功能色」：
  - 品牌（primary）：primary-1 #e6f4ff；primary-2 #bae0ff；primary-3 #91caff；primary-4 #69b1ff；primary-5 #4096ff；primary-6 #1677ff 主色；primary-7 #0958d9；primary-8 #003eb3；primary-9 #002c8c；primary-10 #001d66
  - 成功（success）：success-1 #f6ffed；success-2 #d9f7be；success-3 #b7eb8f；success-4 #95de64；success-5 #73d13d；success-6 #52c41a 主色；success-7 #389e0d；success-8 #237804；success-9 #135200；success-10 #092b00
  - 警告（warning）：warning-1 #fffbe6；warning-2 #fff1b8；warning-3 #ffe58f；warning-4 #ffd666；warning-5 #ffc53d；warning-6 #faad14 主色；warning-7 #d48806；warning-8 #ad6800；warning-9 #874d00；warning-10 #613400
  - 错误（error）：error-1 #fff2f0；error-2 #fff1f0；error-3 #ffccc7；error-4 #ffa39e；error-5 #ff7875；error-6 #ff4d4f 主色；error-7 #d9363e；error-8 #b32430；error-9 #8c1523；error-10 #660e1b
- 色板「基础色板」：
  - 薄暮红（red）：red-1 #fff1f0；red-2 #ffccc7；red-3 #ffa39e；red-4 #ff7875；red-5 #ff4d4f；red-6 #f5222d 主色；red-7 #cf1322；red-8 #a8071a；red-9 #820014；red-10 #5c0011
  - 火山（volcano）：volcano-1 #fff2e8；volcano-2 #ffd8bf；volcano-3 #ffbb96；volcano-4 #ff9c6e；volcano-5 #ff7a45；volcano-6 #fa541c 主色；volcano-7 #d4380d；volcano-8 #ad2102；volcano-9 #871400；volcano-10 #610b00
  - 日暮（orange）：orange-1 #fff7e6；orange-2 #ffe7ba；orange-3 #ffd591；orange-4 #ffc069；orange-5 #ffa940；orange-6 #fa8c16 主色；orange-7 #d46b08；orange-8 #ad4e00；orange-9 #873800；orange-10 #612500
  - 金盏花（gold）：gold-1 #fffbe6；gold-2 #fff1b8；gold-3 #ffe58f；gold-4 #ffd666；gold-5 #ffc53d；gold-6 #faad14 主色；gold-7 #d48806；gold-8 #ad6800；gold-9 #874d00；gold-10 #613400
  - 日出（yellow）：yellow-1 #feffe6；yellow-2 #ffffb8；yellow-3 #fffb8f；yellow-4 #fff566；yellow-5 #ffec3d；yellow-6 #fadb14 主色；yellow-7 #d4b106；yellow-8 #ad8b00；yellow-9 #876800；yellow-10 #614700
  - 青柠（lime）：lime-1 #fcffe6；lime-2 #f4ffb8；lime-3 #eaff8f；lime-4 #d3f261；lime-5 #bae637；lime-6 #a0d911 主色；lime-7 #7cb305；lime-8 #5b8c00；lime-9 #3f6600；lime-10 #254000
  - 极光绿（green）：green-1 #f6ffed；green-2 #d9f7be；green-3 #b7eb8f；green-4 #95de64；green-5 #73d13d；green-6 #52c41a 主色；green-7 #389e0d；green-8 #237804；green-9 #135200；green-10 #092b00
  - 明青（cyan）：cyan-1 #e6fffb；cyan-2 #b5f5ec；cyan-3 #87e8de；cyan-4 #5cdbd3；cyan-5 #36cfc9；cyan-6 #13c2c2 主色；cyan-7 #08979c；cyan-8 #006d75；cyan-9 #00474f；cyan-10 #002329
  - 极客蓝（geekblue）：geekblue-1 #f0f5ff；geekblue-2 #d6e4ff；geekblue-3 #adc6ff；geekblue-4 #85a5ff；geekblue-5 #597ef7；geekblue-6 #2f54eb 主色；geekblue-7 #1d39c4；geekblue-8 #10239e；geekblue-9 #061178；geekblue-10 #030852
  - 酱紫（purple）：purple-1 #f9f0ff；purple-2 #efdbff；purple-3 #d3adf7；purple-4 #b37feb；purple-5 #9254de；purple-6 #722ed1 主色；purple-7 #531dab；purple-8 #391085；purple-9 #22075e；purple-10 #120338
  - 法式洋红（magenta）：magenta-1 #fff0f6；magenta-2 #ffd6e7；magenta-3 #ffadd2；magenta-4 #ff85c0；magenta-5 #f759ab；magenta-6 #eb2f96 主色；magenta-7 #c41d7f；magenta-8 #9e1068；magenta-9 #780650；magenta-10 #520339
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-color--color-palette

### COLOR.TOKENS_ONLY 颜色只经 token 取

组件和页面里的颜色只从主题 token 取（品牌色、文字色、边框色这类），不写十六进制或 rgb 字面量；换主题、换暗色时颜色才能一起变。

- 执行：机器门禁 `style.no-raw-color`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 在业务页面创建第二套视觉语言。」
- 示例（这样做）：颜色从 token 取
- 示例（别这样做）：写死色值
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-color--color-tokens-only

### COLOR.NEUTRAL_LAYERS 中性色分层

中性色按用途分三层：文字四档（主要、次要、辅助、禁用），边框两档（控件边框、分割线），背景三档（页面底色、容器、浮层）。中性色用透明度实现，深浅背景上都保持同样的主次关系。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：页面底色 `p.page` = #f5f5f5（token `color.surface.page`）
- 参数：容器 `p.container` = #ffffff（token `color.surface.container`）
- 参数：控件边框 `p.border` = #d9d9d9（token `color.border.default`）
- 参数：分割线 `p.split` = #f0f0f0（token `color.border.subtle`）
- 色板「中性色」：
  - 文字（text）：colorText rgba(0, 0, 0, 0.88) 主要；colorTextSecondary rgba(0, 0, 0, 0.65) 次要；colorTextTertiary rgba(0, 0, 0, 0.45) 辅助；colorTextQuaternary rgba(0, 0, 0, 0.25) 禁用
  - 边框（border）：colorBorder #d9d9d9 控件边框；colorBorderSecondary #f0f0f0 分割线
  - 背景（surface）：colorBgLayout #f5f5f5 页面底色；colorBgContainer #ffffff 容器；colorBgElevated #ffffff 浮层
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-color--color-neutral-layers

### COLOR.BRAND 品牌色

品牌色只用在关键行动点、选中与操作状态、重要信息高亮和图形化上；不用作大面积背景或装饰。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：品牌色 `p.primary` = #1677ff（token `color.brand.primary`）
- 示例（这样做）：品牌色落在主按钮与链接上
- 示例（别这样做）：品牌色铺满整块区域——大面积品牌色会抢走主按钮的注意力，页面里就没有「最重要的那个动作」了。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-color--color-brand

### COLOR.STATUS 状态色

成功、警告、错误、信息四种功能色只表达状态，同一产品里含义固定、不自定义；状态色总与文字或图标一起出现，不单靠颜色传达。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：成功 `p.success` = #52c41a（token `color.semantic.success`）
- 参数：警告 `p.warning` = #faad14（token `color.semantic.warning`）
- 参数：错误 `p.error` = #ff4d4f（token `color.semantic.error`）
- 参数：信息 `p.info` = #1677ff（token `color.semantic.info`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源；文本对比度至少 4.5:1」
- 示例（这样做）：颜色配文字
- 示例（别这样做）：只有一个色点
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-color--color-status

### COLOR.BORDERS 边框

控件（输入框、按钮）用控件边框色；区块之间、列表行之间用分割线色。容器里的分割线画在边框里面，相邻容器不叠两条边框。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：控件边框 `p.border` = #d9d9d9（token `color.border.default`）
- 参数：分割线 `p.split` = #f0f0f0（token `color.border.subtle`）
- 示例（这样做）：分割线在卡片边框里面
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-color--color-borders

### COLOR.NO_DECORATION 不用装饰性效果

色彩用得克制，只为传递信息、引导操作和反馈交互服务；业务界面不用渐变、发光、彩色阴影这类装饰。插画和展示型页面可以例外。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：渐变按钮加发光
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-color--color-no-decoration

## 基础 / 字体（TYPE）

字体族、字阶、字重、文字颜色、等宽数字、富文本排版和文字溢出处理。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--overview

### TYPE.FAMILY 字体族

界面文字用规范无衬线字体族，代码和需要等宽的数字用规范等宽字体族；不引入第三种字体，也不在单个组件里另外指定字体。

- 执行：机器门禁 `style.font-family-token`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：无衬线字体族 `p.sans` = -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'（token `typography.family.sans`）
- 参数：等宽字体族 `p.mono` = 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace（token `typography.family.mono`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 在业务页面创建第二套视觉语言。」
- 示例（这样做）：正文与代码
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-family

### TYPE.SCALE 字阶

字号只取字阶 12、14、16、20、24、30、38（46、56、68 只用于展示型页面），每级行高是字号加 8。正文 14 号、行高 22。一个系统里常用的字号控制在 5 种以内。

- 执行：机器门禁 `style.font-size-scale`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：字阶 `p.scale` = 12px / 14px / 16px / 20px / 24px / 30px / 38px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：对应行高 `p.line_heights` = 20px / 22px / 24px / 28px / 32px / 38px / 46px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：展示型字阶 `p.display_scale` = 46px / 56px / 68px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：正文字号 `p.body` = 14px（token `typography.size.body`）
- 参数：正文行高 `p.body_line_height` = 22px（Ant Design 设计规范 · 字体）
- 参数：常用字号种数上限 `p.max_sizes` = 5 个（Ant Design 设计规范 · 字体）
- 对照表「字阶」（字号 / 行高 → 用途）：
  - `38 / 46`：一级标题（内容型页面）
  - `30 / 38`：二级标题（内容型页面）
  - `24 / 32`：页面标题
  - `20 / 28`：区块标题
  - `16 / 24`：卡片标题、大号正文
  - `14 / 22`：正文，最常用
  - `12 / 20`：辅助说明、标签、表格里的次要信息
- 示例（别这样做）：字阶以外的 13px、17px
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-scale

### TYPE.WEIGHT 字重

正文用常规 400，需要强调的短文字用 500；600 只用于标题和英文加粗。强调时选一种手段，不要加粗、换色、放大同时叠加。

- 执行：机器门禁 `style.font-weight-allowed`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：常规 `p.regular` = 400（Ant Design 设计规范 · 字体）
- 参数：中粗 `p.medium` = 500（Ant Design 设计规范 · 字体）
- 参数：标题 `p.semibold` = 600（token `typography.weight.semibold`）
- 示例（这样做）：三种字重
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-weight

### TYPE.LINE_ROLES 单行与多行

单行文字（按钮、标签、表格单元、菜单项）放在控件高度里垂直居中，不另加行距；多行正文用字阶对应的行高（14 号配 22），段与段之间空一行的高度。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：控件高度 `p.control_height` = 32px（token `density.control_height`）
- 参数：正文行高 `p.body_line_height` = 22px（Ant Design 设计规范 · 字体）
- 示例（这样做）：单行在控件里居中，多行用正文行高
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-line-roles

### TYPE.COLOR 文字颜色

文字颜色只用四档文本 token：主要、次要、辅助、禁用。正文、标题与背景的对比度以 7:1 为目标，最低不得低于 4.5:1；颜色不能是传达信息的唯一手段。

- 执行：机器门禁 `style.no-raw-color`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：主要 `p.primary` = rgba(0, 0, 0, 0.88)（token `color.text.primary`）
- 参数：次要 `p.secondary` = rgba(0, 0, 0, 0.65)（token `color.text.secondary`）
- 参数：辅助 `p.tertiary` = rgba(0, 0, 0, 0.45)（token `color.text.tertiary`）
- 参数：禁用 `p.disabled` = rgba(0, 0, 0, 0.25)（token `color.text.disabled`）
- 参数：对比度目标 `p.contrast_target` = 7:1（Ant Design 设计规范 · 字体）
- 参数：对比度下限 `p.contrast_min` = 4.5:1（pomaster 主题硬规范 · UI 呈现与设计）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源；文本对比度至少 4.5:1」
- 示例（这样做）：四档文本色
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-color

### TYPE.TABULAR_NUMS 等宽数字

需要上下对比的数字（金额、数量、时间列）用等宽数字（font-variant-numeric 取 tabular-nums），并右对齐。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：font-variant-numeric `p.numeric` = tabular-nums（Ant Design 设计规范 · 字体）
- 示例（这样做）：等宽数字、右对齐
- 示例（别这样做）：比例数字、左对齐，位数对不齐
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-tabular-nums

### TYPE.READING 长文行宽

说明、帮助文档这类长段落限制每行宽度，不随窗口无限拉宽；表格、表单这类结构化内容不受此限。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：每行字数上限 `p.max_chars`：待项目决定——中文长段落每行最多多少个字？（候选 35 字 / 40 字 / 45 字）
- 示例（别这样做）：长段落铺满宽屏
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-reading

### TYPE.RICH_TEXT 富文本

公告、帮助、说明等富文本统一放进 a-typography 里渲染，用组件自带的排版：段落之间隔一倍字高，列表每级缩进 20px 再加 4px，引用左侧 4px 竖线，行内代码字号 85%。业务页面不另写一套富文本样式。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：段落间距 `p.paragraph_gap` = 1em（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 参数：列表缩进（外边距 + 内边距） `p.list_indent` = 20px / 4px（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 参数：引用竖线宽度 `p.quote_border` = 4px（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 参数：行内代码字号 `p.code_size` = 85%（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 在业务页面创建第二套视觉语言。」
- 示例（这样做）：标题、段落、列表、引用、代码、按键、标记
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-rich-text

### TYPE.OVERFLOW 文字溢出

文字放不下时换行，或者单行省略、悬停显示全文；不得缩小字号硬塞进去。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「文本换行、截断、tooltip 和横向滚动有统一规则。」
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 通过缩小字体掩盖溢出。」
- 示例（这样做）：单行省略，悬停看全文
- 示例（别这样做）：缩小字号硬塞
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-overflow

## 基础 / 标题层级（HEADING）

应用界面最多三级标题；内容型页面用 1–5 级排版标题；语义层级与视觉层级一致、不跳级。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-headings--overview

### HEADING.APP_LEVELS 应用界面的标题级数

列表、表单、详情等工作页最多用三级标题：h1 是页面标题，20px；h2 是卡片或区块标题，16px；h3 是区块里的分组标题，14px；三级都用 600 字重。更细的层次用间距和分组表达，不再加标题级。

- 执行：机器门禁 `markup.heading-level-max`（待接入，暂按评审执行）；适用：管理侧
- 参数：h1 页面标题 `p.h1_size` = 20px（ant-design-vue PageHeader 样式（页面标题取 fontSizeHeading4、字重 600））
- 参数：h2 卡片 / 区块标题 `p.h2_size` = 16px（ant-design-vue Card 样式（卡片标题取 fontSizeLG 与 fontWeightStrong；内嵌小卡片标题取 fontSize））
- 参数：h3 分组标题 `p.h3_size` = 14px（ant-design-vue Card 样式（卡片标题取 fontSizeLG 与 fontWeightStrong；内嵌小卡片标题取 fontSize））
- 参数：标题字重 `p.weight` = 600（token `typography.weight.semibold`）
- 示例（这样做）：页面、区块、分组三级——a-card 的 title 不是标题元素；卡片标题要进页面大纲时，在 title 插槽里放 h2。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-headings--heading-app-levels

### HEADING.SINGLE_H1 每个视图一个 h1

每个页面视图（一个路由页面，或一个全屏抽屉、模态）只有一个一级标题，内容就是这个页面叫什么；路由切换后同步更新浏览器标签页标题。

- 执行：机器门禁 `markup.single-h1`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「路由/页面切换后必须更新 document.title 并宣布页面变化」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-headings--heading-single-h1

### HEADING.ORDER 标题不跳级

标题的语义层级与视觉层级一致，逐级下降：h1 下面是 h2，h2 下面是 h3，不能从 h1 直接跳到 h3。

- 执行：机器门禁 `markup.heading-order`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「标题层级 h1–h6 与视觉层级一致，不跳过层级」
- 示例（这样做）：h1 → h2 → h3
- 示例（别这样做）：h1 直接跳到 h3
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-headings--heading-order

### HEADING.CONTENT_LEVELS 内容型页面的标题

帮助、公告、文章这类内容型页面用 a-typography-title 的 1–5 级：字号 38、30、24、20、16，行高 46、38、32、28、24，字重 600；标题前留 1.2 倍字高，标题后留 0.5 倍字高。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：1–5 级字号 `p.sizes` = 38px / 30px / 24px / 20px / 16px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：1–5 级行高 `p.line_heights` = 46px / 38px / 32px / 28px / 24px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：标题前间距 `p.margin_top` = 1.2em（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 参数：标题后间距 `p.margin_bottom` = 0.5em（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 示例（这样做）：五级排版标题
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-headings--heading-content-levels

### HEADING.REAL_ELEMENT 用真正的标题元素

标题必须是 h1–h6 或 a-typography-title，不能用加粗的 div、span 冒充；反过来，只是想把文字放大加粗时也不要用标题元素。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「使用原生 HTML 语义可承载时优先使用原生元素」
- 示例（别这样做）：加粗的 div 冒充标题
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-headings--heading-real-element

## 基础 / 图标（ICON）

一套图标库、一种系统图标风格；图标跟随文字的大小和颜色；同一动作同一图标；纯图标按钮有可访问名称。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-icons--overview

### ICON.LIBRARY 图标库

管理侧系统图标只用 @ant-design/icons-vue 的图标组件；不混用第二套图标库，也不用切图或内联 SVG 充当系统图标。用户侧（H5）的图标库待项目决定。

- 执行：机器门禁 `icon.single-library`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：管理侧图标库 `p.admin_library` = @ant-design/icons-vue（ant-design-vue 图标示例（图标来自 @ant-design/icons-vue））
- 参数：用户侧图标库 `p.public_library`：待项目决定——用户侧（H5）的图标库用哪一套？（候选 Vant Icon）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-icons--icon-library

### ICON.STYLE 图标风格

同一界面的系统图标统一用线框风格（Outlined）；实心风格（Filled）只用于表达状态（成功、警告、错误、信息）；双色风格（TwoTone）只用于业务图标。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：系统图标风格 `p.system_style` = Outlined（pomaster 预设约定）
- 参数：双色风格的使用范围 `p.two_tone_scope` = 业务图标（Ant Design 设计规范 · 图标）
- 示例（这样做）：操作用线框，状态用实心
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-icons--icon-style

### ICON.SIZE 图标尺寸

系统图标与相邻文字同字号：14 号正文配 14px 图标，16 号配 16px；控件里的指示图标（下拉箭头、清除）用 12px。业务图标只用 32、48、64 三档。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：配正文 `p.with_body` = 14px（token `typography.size.body`）
- 参数：配大号文字 `p.with_large` = 16px（token `typography.size.body_large`）
- 参数：控件指示图标 `p.indicator` = 12px（ant-design-vue 4.2.6 主题种子与派生（seed、genControlHeight、genRadius、genCommonMapToken））
- 参数：业务图标尺寸 `p.business_sizes` = 32px / 48px / 64px（Ant Design 设计规范 · 图标）
- 对照表「尺寸」（尺寸 → 用途）：
  - `12px`：控件里的指示图标（下拉箭头、清除）
  - `14px`：配 14 号正文，最常用
  - `16px`：配 16 号文字（大号按钮、卡片标题）
  - `32 / 48 / 64px`：业务图标（空状态、结果页、功能入口）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-icons--icon-size

### ICON.SPACING 图标与文字的间距

图标和文字之间留 8px；按钮里的图标间距由组件给出，不手动加空格或外边距。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：图标与文字间距 `p.text_gap` = 8px（Ant Design 设计规范 · 图标）
- 示例（这样做）：14px 文字配 14px 图标，间隔 8
- 示例（别这样做）：用空格隔开
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-icons--icon-spacing

### ICON.COLOR 图标颜色

系统图标跟随相邻文字的颜色；只有表达状态时才用语义色 token（成功、警告、错误、信息），并且同时配文字，不能只靠图标颜色传达状态。

- 执行：机器门禁 `style.no-raw-color`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：success `p.success` = #52c41a（token `color.semantic.success`）
- 参数：warning `p.warning` = #faad14（token `color.semantic.warning`）
- 参数：error `p.error` = #ff4d4f（token `color.semantic.error`）
- 参数：info `p.info` = #1677ff（token `color.semantic.info`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 仅通过颜色、hover 或 tooltip 传递关键信息。」
- 示例（这样做）：语义色图标 + 状态文字
- 示例（别这样做）：只有颜色点，没有文字
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-icons--icon-color

### ICON.SEMANTICS 同一动作同一图标

同一个动作在全系统用同一个图标，按下表取用；表里没有的动作，先补进表再用。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：动作 → 图标 `p.map` = 新建 → PlusOutlined，编辑 → EditOutlined，删除 → DeleteOutlined，搜索 → SearchOutlined，刷新 → ReloadOutlined，导出 → DownloadOutlined，导入 → UploadOutlined，筛选 → FilterOutlined，设置 → SettingOutlined，更多 → MoreOutlined，查看 → EyeOutlined，复制 → CopyOutlined（pomaster 预设约定）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 同一路径使用不同文案或图标表示同一功能」
- 示例（这样做）：动作图标对照
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-icons--icon-semantics

### ICON.BUTTON_LABEL 纯图标按钮的名称

只有图标、没有文字的按钮必须带可访问名称（aria-label），悬停时用 tooltip 显示同样的文字。

- 执行：机器门禁 `markup.icon-button-label`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 图标按钮缺少 aria-label 或等效可访问名称。」
- 示例（这样做）：aria-label 与 tooltip 同名
- 示例（别这样做）：读屏只能读出「按钮」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-icons--icon-button-label

## 基础 / 材质（MATERIAL）

圆角三档、背景三层、阴影四个层级：第 0 层贴着页面没有阴影，第 1 层是被悬停的卡片，第 2 层是下拉面板，第 3 层是对话框。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-materials--overview

### MATERIAL.RADIUS 圆角

圆角只取三档：小尺寸控件 4，按钮、输入框等基础控件 6，卡片、对话框、下拉面板等大容器 8。同一层级的元素圆角一致，嵌套时内层不大于外层。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：小尺寸控件 `p.sm` = 4px（token `radius.sm`）
- 参数：基础控件 `p.md` = 6px（token `radius.md`）
- 参数：大容器 `p.lg` = 8px（token `radius.lg`）
- 对照表「圆角」（token → 用途）：
  - `borderRadiusSM · 4`：小尺寸按钮、输入框
  - `borderRadius · 6`：按钮、输入框、选择器
  - `borderRadiusLG · 8`：卡片、对话框、下拉面板
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-materials--material-radius

### MATERIAL.SURFACES 页面内的表面

页面底色用布局背景，内容放在白色容器里；容器贴在页面上、没有阴影（第 0 层）。不在容器里再叠一层带底色的容器来区分层级，改用间距和分割线。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：页面底色 `p.page` = #f5f5f5（token `color.surface.page`）
- 参数：容器 `p.container` = #ffffff（token `color.surface.container`）
- 演示：页面底色上的容器
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-materials--material-surfaces

### MATERIAL.FLOATING 浮层

浮在页面上的元素按层级取阴影：第 1 层是被悬停的卡片；第 2 层是下拉、气泡这类跟随触发元素的面板；第 3 层是对话框这类独立的层。浮层背景用浮层色。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：第 1 层 `p.card` = 0 1px 2px -2px rgba(0,0,0,0.16), 0 3px 6px 0 rgba(0,0,0,0.12), 0 5px 12px 4px rgba(0,0,0,0.09)（token `elevation.card`）
- 参数：第 2 层 `p.popover` = 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)（token `elevation.popover`）
- 参数：第 3 层 `p.modal` = 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)（token `elevation.modal`）
- 对照表「阴影层级」（token → 用途）：
  - `boxShadowCard · 第 1 层`：被悬停的卡片
  - `boxShadow · 第 2 层`：下拉菜单、气泡卡片、选择器面板
  - `boxShadow · 第 3 层`：对话框、全局提示
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-materials--material-floating

### MATERIAL.SHADOWS 阴影

阴影只表达高度，不做装饰：离页面越远阴影越淡、越大。方向随位置：一般向下；底部工具栏向上；右侧抽屉与固定列向左，左侧导航与抽屉向右。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：层级数（含第 0 层） `p.layers` = 4 个（Ant Design 设计规范 · 阴影）
- 示例（别这样做）：卡片常驻一圈深色阴影——平放的卡片在第 0 层，只有被悬停时才浮到第 1 层。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-materials--material-shadows

## 基础 / 布局（LAYOUT）

页面骨架、适配基准与内容区尺寸。管理侧是「顶栏 + 左侧导航 + 内容区」，用户侧是移动端单列。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-layout--overview

### LAYOUT.ADMIN_SHELL 管理侧页面骨架

管理侧应用统一用「顶栏 + 左侧导航 + 内容区」骨架。顶栏放产品标识和全局操作，左侧放多级菜单，内容区承载页面本身；侧栏可以收起，收起后只留图标；内容区两侧不留白，随窗口伸缩。

- 执行：人工评审；适用：管理侧
- 参数：顶栏高度 `p.header_height` = 64px（token `layout.header_height`）
- 参数：侧栏宽度 `p.sider_width` = 200px（Ant Design 组件 · Layout 布局（Sider 默认宽度与收起宽度））
- 参数：侧栏收起宽度 `p.sider_collapsed_width` = 80px（Ant Design 组件 · Layout 布局（Sider 默认宽度与收起宽度））
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「每类页面定义标题、面包屑、筛选、工具栏、主体、分页和详情位置。」
- 示例（这样做）：顶栏 + 左侧导航 + 内容区
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-layout--layout-admin-shell

### LAYOUT.PUBLIC_SHELL 用户侧页面骨架

用户侧页面按移动端单列排布，宽度铺满视口；在 320 CSS px 宽度下内容仍能纵向阅读、不出现横向滚动；不得禁止缩放或锁定视口。

- 执行：人工评审；适用：用户侧
- 参数：最窄验收视口 `p.min_viewport` = 320px（pomaster 主题硬规范 · UI 呈现与设计）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「内容在 320 CSS px 宽度下可纵向阅读，不出现横向滚动；不得禁用浏览器缩放或固定视口」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-layout--layout-public-shell

### LAYOUT.ADAPTIVE 适配基准与验收宽度

设计稿按 1440 宽的画板出；交付前在 1920、1440、1366、1280 四个宽度下逐一验收。左右布局时侧栏固定、内容区伸缩；内容区变窄时内容换行、折叠或出现横向滚动，不缩小字号。

- 执行：人工评审；适用：管理侧
- 参数：设计画板宽度 `p.artboard` = 1440px（Ant Design 设计规范 · 布局）
- 参数：验收宽度 `p.acceptance_widths` = 1920px / 1440px / 1366px / 1280px（Ant Design 设计规范 · 布局）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「响应式断点和密度切换有验收矩阵。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「MUST NOT 用缩小字体解决小屏。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-layout--layout-adaptive

### LAYOUT.CONTENT_REGION 内容区边距与宽度

内容区内边距、相邻区块之间的间距、内容最大宽度全站各用一个值，都取规范 token，不在单个页面里另定。

- 执行：机器门禁 `style.spacing-scale`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：内容区内边距 `p.page_padding`：待定（token `layout.page_padding` 仍为 UNKNOWN）
- 参数：区块间距 `p.section_gap`：待定（token `spacing.section_gap` 仍为 UNKNOWN）
- 参数：内容最大宽度 `p.content_max_width`：待定（token `layout.content_max_width` 仍为 UNKNOWN）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-layout--layout-content-region

### LAYOUT.REFLOW 先换行再缩小

宽度不够时，先让一行里的元素换行（按钮组、标签、筛选项），再考虑收进「更多」；不靠缩小字号或压缩间距硬塞进一行。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：按钮组允许换行
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-layout--layout-reflow

### LAYOUT.OVERFLOW 尺寸与滚动的归属

尺寸和滚动由外层容器负责，内层组件不得把外层撑破；固定格式的控件（日期、金额、状态标签）给出稳定宽度或最小、最大宽度。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「外层负责布局与 overflow，内层不得反向撑爆。」
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「固定格式控件定义稳定尺寸、min/max 或比例。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-layout--layout-overflow

### LAYOUT.Z_INDEX 层级

z-index 只能取层级 token（下拉、气泡、消息、抽屉、模态各一档），不写死数字。

- 执行：机器门禁 `style.no-raw-z-index`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：layers `p.layers`：待项目决定——层级 token 怎么分档？下拉、气泡、消息、抽屉、模态各取多少 z-index（现有 token 合同还没有层级分组）？
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「z-index 只能来自层级 token。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-layout--layout-z-index

## 基础 / 栅格（GRID）

24 列栅格；列间距固定、列宽伸缩；响应式只用规范断点。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-grid--overview

### GRID.COLUMNS 栅格列数

页面区块按 24 列栅格切分，每个区块从某一列开始、到某一列结束；不用小数跨度或百分比宽度拼区块。

- 执行：机器门禁 `grid.span-range`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：列数 `p.columns` = 24 个（Ant Design 设计规范 · 布局）
- 示例（这样做）：三个等宽区块各占 8 列
- 示例（别这样做）：用百分比宽度拼区块——百分比宽度不对齐栅格，和页面其他区块的列线错位。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-grid--grid-columns

### GRID.GUTTER 列间距

列间距（gutter）是固定值，不随窗口缩放，只取 16 或 24；窗口变化时变的是列宽，不是间距。

- 执行：机器门禁 `grid.gutter-allowed`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：允许的列间距 `p.gutter` = 16px / 24px（Ant Design 设计基础简版（官方 Wiki））
- 示例（这样做）：gutter 取 16
- 示例（别这样做）：gutter 取 10
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-grid--grid-gutter

### GRID.ROW_SUM 一行的列数之和

同一行里各列跨度之和不超过 24。需要换行就拆成两行，不靠超出后自动折行。

- 执行：机器门禁 `grid.row-sum`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：一行列数上限 `p.columns` = 24 个（Ant Design 设计规范 · 布局）
- 示例（这样做）：拆成两行
- 示例（别这样做）：12 + 12 + 8 = 32，第三列被挤到下一行
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-grid--grid-row-sum

### GRID.BREAKPOINTS 断点

响应式只用规范断点（sm 576、md 768、lg 992、xl 1200），在 a-col 上用 xs / sm / md / lg / xl 声明各断点的跨度；样式里不自定义媒体查询断点。

- 执行：机器门禁 `style.breakpoint-allowed`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：sm `p.sm` = 576px（token `breakpoints.sm`）
- 参数：md `p.md` = 768px（token `breakpoints.md`）
- 参数：lg `p.lg` = 992px（token `breakpoints.lg`）
- 参数：xl `p.xl` = 1200px（token `breakpoints.xl`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「响应式断点和密度切换有验收矩阵。」
- 示例（这样做）：小屏一列、中屏两列、大屏四列
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-grid--grid-breakpoints

### GRID.GUIDES 参考线

栅格参考线只在设计稿和调试时使用，业务界面不把栅格线画出来；需要表达二维结构时用卡片和分割线。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：把栅格线画进业务界面
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-grid--grid-guides

## 基础 / 间距（SPACING）

间距只取间距阶梯；用小、中、大三档间距表达元素之间关系的远近。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-spacing--overview

### SPACING.SCALE 间距阶梯

间距只取间距阶梯 4、8、12、16、24、32。基础单位是 8，4 和 12 只用于组件内部的紧凑间距。margin、padding、gap 不写阶梯以外的数值，比如 10px、13px、15px。

- 执行：机器门禁 `style.spacing-scale`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：基础单位 `p.base_unit` = 8px（Ant Design 设计规范 · 布局）
- 参数：xs `p.xs` = 4px（token `spacing.xs`）
- 参数：sm `p.sm` = 8px（token `spacing.sm`）
- 参数：md `p.md` = 12px（token `spacing.md`）
- 参数：lg `p.lg` = 16px（token `spacing.lg`）
- 参数：xl `p.xl` = 24px（token `spacing.xl`）
- 参数：xxl `p.xxl` = 32px（token `spacing.xxl`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 示例（这样做）：间距阶梯
- 示例（别这样做）：照着截图量出来的 13px、15px
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-spacing--spacing-scale

### SPACING.TIERS 间距分档

用三档纵向间距表达关系远近：同一组里的元素用小间距 8，组与组之间用中间距 16，区块与区块之间用大间距 24。关系越近，间距越小；不要整页只用一个间距。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：组内 `p.small` = 8px（token `spacing.sm`）
- 参数：组间 `p.middle` = 16px（token `spacing.lg`）
- 参数：区块间 `p.large` = 24px（token `spacing.xl`）
- 示例（这样做）：组内 8、组间 16、区块间 24
- 示例（别这样做）：所有元素一个间距，看不出分组
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-spacing--spacing-tiers

## 基础 / 动效（MOTION）

动效遵循自然、高效、克制：只为反馈、说明层级和变化服务；时长取三档 token；系统要求减少动效时只保留淡入淡出。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-motion--overview

### MOTION.PURPOSE 动效要有理由

每个动效都要说得出目的：给操作反馈、说明元素之间的层级与空间关系、或解释界面发生了什么变化。没有目的的动效不加；出场比进场更快、更简单，不排队依次出场。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：列表每行依次飞入
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-motion--motion-purpose

### MOTION.DURATION 时长与缓动

时长只取三档：小元素（按钮、开关、勾选）快速，中等元素（下拉、提示）中速，大元素（抽屉、对话框）慢速。缓动用主题预设曲线，不自定义。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：快速 `p.fast` = 0.1s（token `motion.fast`）
- 参数：中速 `p.normal` = 0.2s（token `motion.normal`）
- 参数：慢速 `p.slow` = 0.3s（token `motion.slow`）
- 参数：进出缓动 `p.ease_in_out` = cubic-bezier(0.645, 0.045, 0.355, 1)（ant-design-vue 4.2.6 主题种子与派生（seed、genControlHeight、genRadius、genCommonMapToken））
- 参数：进场缓动 `p.ease_out` = cubic-bezier(0.215, 0.61, 0.355, 1)（ant-design-vue 4.2.6 主题种子与派生（seed、genControlHeight、genRadius、genCommonMapToken））
- 对照表「时长」（token → 用途）：
  - `motionDurationFast · 0.1s`：按钮、开关、勾选
  - `motionDurationMid · 0.2s`：下拉、提示、展开收起
  - `motionDurationSlow · 0.3s`：抽屉、对话框
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-motion--motion-duration

### MOTION.REDUCED 减少动效

系统开启「减少动态效果」时，去掉位移、缩放、弹跳类动效，只保留淡入淡出或直接切换；加载指示保留，但不另加动画。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级」
- 示例（这样做）：全局降级
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-motion--motion-reduced

## 组件/通用 / 按钮（CMP.BUTTON）

在当前页面触发一个即时操作。五种类型（主按钮、默认、虚线、文本、链接）配合危险、幽灵、禁用、加载四种状态使用。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--overview
对应组件：antd Button；geist Button、ButtonLink
实验场：`a-button`，属性 type=primary|default|dashed|text|link，size=large|middle|small，shape=default|round，danger=布尔，ghost=布尔，loading=布尔，disabled=布尔，block=布尔（https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--playground）

### CMP.BUTTON.USAGE 何时用

按钮在当前页面触发一个操作（提交、保存、删除、打开对话框）；跳到另一个地址用链接按钮。按钮组合时用 1 个主操作加若干次要操作，超过 3 个操作就把其余的收进「更多」下拉。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：平铺按钮上限 `p.max_visible` = 3 个（Ant Design 组件 · Button 按钮）
- 示例（这样做）：一个主操作，其余收进「更多」
- 示例（别这样做）：五个按钮平铺
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-usage

### CMP.BUTTON.VARIANTS 变体

主按钮用于主行动点，一个操作区最多一个；默认按钮用于没有主次之分的一组操作；虚线按钮用于「添加」；文本按钮用于最次级的操作；链接按钮用于跳转。

- 执行：机器门禁 `markup.single-primary-button`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：type 取值 `p.types` = primary / default / dashed / text / link（ant-design-vue · Button 按钮）
- 对照表「五种类型」（type → 用途）：
  - `primary`：主行动点，一个操作区最多一个
  - `default`：没有主次之分的一组操作
  - `dashed`：添加一项（表格行、表单项）
  - `text`：最次级的操作
  - `link`：跳转到别的地址
- 示例（这样做）：一个主按钮
- 示例（别这样做）：两个主按钮
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-variants

### CMP.BUTTON.DANGER 危险操作

删除、移动、修改权限这类危险操作用危险按钮（danger 是属性，可以配任何类型），并且要二次确认；文案写清对象，如「删除车型」。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：危险属性配四种类型
- 示例（这样做）：危险操作先确认
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-danger

### CMP.BUTTON.SIZES 尺寸

三种尺寸：大 40、中 32（默认）、小 24。同一个操作区里按钮尺寸一致；小号只用在表格行、卡片角落这类紧凑位置。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：大 `p.large` = 40px（ant-design-vue 4.2.6 主题种子与派生（seed、genControlHeight、genRadius、genCommonMapToken））
- 参数：中（默认） `p.middle` = 32px（token `density.control_height`）
- 参数：小 `p.small` = 24px（token `density.compact_control_height`）
- 对照表「三种尺寸」（size · 高度 → 用途）：
  - `large · 40`：移动端主操作、登录这类单列页面
  - `middle · 32`：默认
  - `small · 24`：表格行、卡片角落
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-sizes

### CMP.BUTTON.SHAPES 形状

默认是圆角矩形；圆形只用于纯图标按钮；胶囊形（round）只用于展示型页面。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：三种形状
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-shapes

### CMP.BUTTON.ICONS 搭配图标

图标放在文字前面，表达动作本身（新建、搜索、下载）；图标与文字的间距由组件给出（8px）。同一个按钮区要么都带图标，要么都不带。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：图标与文字间距 `p.icon_gap` = 8px（Ant Design 组件 · Button 按钮）
- 演示：图标在文字前
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-icons

### CMP.BUTTON.ICON_ONLY 纯图标按钮

只有图标的按钮必须有可访问名称（aria-label），并配文字提示显示同样的文字；名称写动作和对象，如「刷新车型列表」，不写图标名。

- 执行：机器门禁 `markup.icon-button-label`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 图标按钮缺少 aria-label 或等效可访问名称。」
- 示例（这样做）：有名称，悬停有提示
- 示例（别这样做）：读屏只能读出「按钮」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-icon-only

### CMP.BUTTON.LOADING 加载

异步操作提交后用按钮自身的加载状态，既给出反馈也防止重复提交；不要把按钮换成单独的加载图标。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：加载状态
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-loading

### CMP.BUTTON.DISABLED 禁用

只有操作此刻做不了（缺必填项、没有权限）时才禁用，并就近说明原因；能做但不推荐的操作不要禁用。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：禁用并说明原因
- 示例（别这样做）：灰掉但不说为什么
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-disabled

### CMP.BUTTON.LINK 链接按钮

跳转到另一个地址的操作用链接按钮（带 href），行为和链接一致，能在新标签页打开；不用按钮的点击事件去改地址。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：带 href 的链接按钮
- 示例（别这样做）：点击事件里跳转
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-link

### CMP.BUTTON.WIDTH 宽度

按钮宽度由文字决定；只在移动端表单底部、登录这类单列场景用通栏按钮（block）。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：单列表单的通栏按钮
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-width

### CMP.BUTTON.SUBMIT 表单提交

表单的提交按钮设 html-type="submit"，回车即可提交；一个表单只有一个提交按钮，放在表单末尾。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：提交按钮走表单的提交
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-submit

### CMP.BUTTON.LABEL 文案

文案以动词开头，说清操作的结果和对象：「新建车型」「导出报表」；不用「确定」「提交」这类泛泛的词。两个汉字的按钮，组件会自动在字间加空格，不要手动加。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：动词加对象
- 示例（别这样做）：泛泛的「确定」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-button--cmp-button-label

## 设计模式/全局规则 / 反馈（FEEDBACK）

按反馈的重要程度和用户是否需要处理来选提示方式；失败要给恢复动作；加载、空状态、部分成功各有固定做法。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-feedback--overview

### FEEDBACK.CHOOSE 按重要程度选提示方式

操作结果轻、用户不必等待时用全局提示（顶部居中，约 3 秒自动消失）；重要且必须处理的才用对话框；系统主动推送的消息用通知提醒框（右上角）；需要在页面上常驻的说明用警告提示（不自动消失）；操作前的二次确认用贴着按钮的气泡确认框。能立刻看到结果的简单操作可以不提示，不要过度反馈。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：场景 → 提示方式 `p.channels` = 轻量结果 → message 全局提示，必须处理 → modal 对话框，系统推送 → notification 通知提醒框，页面常驻说明 → alert 警告提示，操作前确认 → popconfirm 气泡确认框（Ant Design 设计规范 · 反馈）
- 参数：全局提示停留时长 `p.message_duration` = 3000ms（Ant Design 设计规范 · 反馈）
- 示例（这样做）：页面常驻说明用警告提示
- 示例（这样做）：轻量结果用全局提示
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-feedback--feedback-choose

### FEEDBACK.FAILURE 失败的处理

重要的失败不用会自动消失的全局提示，用警告提示或对话框，写清发生了什么，并给出恢复动作（重试、下载错误明细、联系管理员）；权限不足、离线也一样要给恢复动作。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 错误通知自动消失且不可恢复（除非用户可重新查看）。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「error、permission 和 offline 提供恢复动作。」
- 示例（这样做）：警告提示 + 恢复动作
- 示例（别这样做）：3 秒后消失、没有下一步
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-feedback--feedback-failure

### FEEDBACK.LOADING 加载反馈

预计超过约 2 秒的操作立即给出加载反馈：短的用加载态（按钮 loading、局部 Spin），长的用进度条并允许取消；首屏加载用骨架屏，骨架保持主要布局尺寸，加载完成后页面不跳动。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：需要加载反馈的耗时 `p.threshold` = 2000ms（Ant Design 设计规范 · 反馈）
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「首屏骨架保持主要布局尺寸。」
- 示例（这样做）：按钮加载态、进度条、骨架屏
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-feedback--feedback-loading

### FEEDBACK.FIELD_ERROR 字段错误

校验错误显示在对应字段下方，用文字说明怎么改，用户修改前不消失；提交失败时页面顶部给出错误摘要并聚焦到第一个错误字段；不能只靠颜色、图标或全局提示表达字段错误；提交失败不清空已填内容。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「错误必须与字段关联，并以文本描述提供纠错建议；提交时提供错误摘要并聚焦第一个错误字段」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「MUST NOT 提交失败清空输入。」
- 示例（这样做）：错误文字贴着字段
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-feedback--feedback-field-error

### FEEDBACK.EMPTY 空状态

还没有任何数据时，空状态引导第一步操作（如「新建车型」）；筛选或搜索没有结果时，说明没找到并提供「清除筛选」。两种情况文案和动作不同。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「empty 区分无数据与筛选无结果。」
- 示例（这样做）：还没有数据：引导第一步
- 示例（这样做）：筛选无结果：提供清除筛选
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-feedback--feedback-empty

### FEEDBACK.PARTIAL 部分成功

批量操作部分成功时，结果里写明成功、失败、跳过各多少条，并提供失败明细；不能只说「操作成功」或「操作失败」。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「partial success 提供成功/失败/跳过数量和明细。」
- 示例（这样做）：结果页写清三个数
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-feedback--feedback-partial

### FEEDBACK.BADGE 徽标

与用户强相关的重要信息（待审批数）用数字徽标，次要提醒用红点；有图标时放在图标右上角，没有图标时放在标题后。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：信息类型 → 徽标形式 `p.rule` = 重要且与用户相关 → 数字，次要提醒 → 红点（Ant Design 设计规范 · 反馈）
- 示例（这样做）：数字与红点
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-feedback--feedback-badge

## 设计模式/全局规则 / 导航（NAV）

管理侧用左侧菜单；顶部导航只在一级入口少时用；面包屑、标签页、步骤条、分页各有数量与字数上限。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-navigation--overview

### NAV.ADMIN_SIDE 管理侧主导航

管理侧主导航用左侧菜单，适合多级、操作密集的工作台。菜单项按业务域分组，多了可以滚动；当前页面在菜单里高亮。菜单高亮按路由的稳定标识匹配，不按标题文字或截取 URL 判断。

- 执行：人工评审；适用：管理侧
- 参数：菜单宽度 `p.sider_width` = 200px（Ant Design 组件 · Layout 布局（Sider 默认宽度与收起宽度））
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「MUST NOT 用标题字符串或 URL 截取判断菜单。」
- 示例（这样做）：按业务域分组的多级菜单
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-navigation--nav-admin-side

### NAV.TOP 顶部导航

顶部导航只在一级入口为 2 到 7 个时使用，常见于用户侧门户；每个导航项名称不超过 14 个字。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：一级入口下限 `p.min_items` = 2 个（Ant Design 设计规范 · 导航）
- 参数：一级入口上限 `p.max_items` = 7 个（Ant Design 设计规范 · 导航）
- 参数：导航项字数上限 `p.label_max` = 14 字（Ant Design 设计规范 · 导航）
- 示例（这样做）：五个一级入口
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-navigation--nav-top

### NAV.BREADCRUMB 面包屑

面包屑显示当前页在层级里的位置，建议不超过 3 级、最多 5 级；页面自身的导航已经能说明位置时不加面包屑。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：建议层级上限 `p.recommended_max` = 3 个（Ant Design 设计规范 · 导航）
- 参数：层级上限 `p.max` = 5 个（Ant Design 设计规范 · 导航）
- 示例（这样做）：三级面包屑
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-navigation--nav-breadcrumb

### NAV.TABS 标签页

标签页名称不超过 14 个字。切换整页核心功能用基础标签页；切换页面局部内容用卡片式标签页；卡片里的小范围切换用分段控件；选项很多时改用竖向标签页。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：标签名字数上限 `p.label_max` = 14 字（Ant Design 设计规范 · 导航）
- 示例（这样做）：页面级标签页 + 卡片内分段控件
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-navigation--nav-tabs

### NAV.STEPS 步骤条

有固定流程的任务用步骤条。横向步骤条放 3 到 4 步，每步标题不超过 11 个字；步骤更多或数量会变时，用固定在页面左侧的竖向步骤条。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：横向步数下限 `p.horizontal_min` = 3 个（Ant Design 设计规范 · 导航）
- 参数：横向步数上限 `p.horizontal_max` = 4 个（Ant Design 设计规范 · 导航）
- 参数：步骤标题字数上限 `p.title_max` = 11 字（Ant Design 设计规范 · 导航）
- 示例（这样做）：三步流程
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-navigation--nav-steps

### NAV.PAGINATION 分页

管理侧列表用页码分页：默认每页 20 条，每页最多 200 条；超过 5 页时提供快速跳转，数据多时允许改每页条数；卡片或浮层里用迷你分页。用户侧列表用「加载更多」的游标分页，与接口的 KEYSET 分页一致，每次最多 50 条，不显示总页数。不得前端拉全量再假分页。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：管理侧默认每页条数 `p.admin_page_size` = 20 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：管理侧每页上限 `p.admin_max_page_size` = 200 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：超过多少页加快速跳转 `p.quick_jumper_after` = 5 个（Ant Design 设计规范 · 导航）
- 参数：用户侧每次加载上限 `p.public_max_page_size` = 50 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 前端加载全量数据假分页。」
- 示例（这样做）：管理侧页码分页
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-navigation--nav-pagination

## 设计模式/全局规则 / 数据录入（ENTRY）

标签常驻可见、位置全系统一致；选择控件按选项数选；提示放对位置；校验分前后端；提交防重复且失败不丢输入。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-entry--overview

### ENTRY.LABEL 输入标签

每个输入都有常驻可见的标签，必填项有标记。管理侧表单默认标签在输入左侧、右对齐、带冒号；标签很长或界面是英文时放到输入上方；同一个系统只用一种。占位文字只是补充提示，不能代替标签。

- 执行：人工评审；适用：管理侧
- 参数：标签位置 `p.label_position` = 左侧，右对齐，带冒号（Ant Design 设计原则 · 对齐）
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「每个输入必须有持久可见且程序化关联的标签、格式说明和必要性提示；placeholder 不得替代标签。」
- 示例（这样做）：标签在左、右对齐、带冒号
- 示例（别这样做）：只有占位文字，填了之后就不知道是什么
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-entry--entry-label

### ENTRY.CHOICE_CONTROL 选择控件

二选一、改了立即生效的用开关；选项多于 2 个、少于 5 个用单选按钮全部摆出来；多于 5 个用下拉选择；多选少量用复选框组，多了用多选下拉；需要精确数值时不用滑块，用数字输入。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：单选按钮的选项数 `p.radio_range` = 3 个 / 4 个（Ant Design 设计规范 · 数据录入）
- 参数：多于这个数用下拉 `p.select_above` = 5 个（Ant Design 设计规范 · 数据录入）
- 示例（这样做）：3 个选项用单选，选项多用下拉，即时生效用开关
- 示例（别这样做）：两个选项用下拉，多点一次还看不到全部
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-entry--entry-choice-control

### ENTRY.SWITCH_IMMEDIATE 开关即时生效

开关拨动即生效，旁边不放「保存」按钮，开关两侧文字写清当前状态（启用、停用）；需要和其他字段一起提交才生效的，用复选框。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：状态文字示例 `p.labels` = 启用 / 停用（Ant Design 设计规范 · 数据录入）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-entry--entry-switch-immediate

### ENTRY.HINTS 提示

短提示放在字段下方，不超过一句话；长说明收进字段旁的信息图标，悬停显示；收集身份证号、手机号等敏感信息时，写明为什么需要；能给合理默认值就给。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：字段下方一句话提示
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-entry--entry-hints

### ENTRY.VALIDATION 校验

前端先校验格式（必填、长度、格式），后端返回的字段错误定位到对应字段并聚焦；提交中按钮进入加载态防止重复提交；提交失败保留已填内容。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「前端先做格式校验，后端字段错误定位并聚焦字段。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「提交防重复并保留失败输入。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-entry--entry-validation

### ENTRY.UPLOAD 上传

单个文件、不需要预览，用点击上传；图片用缩略图上传，达到数量上限后隐藏上传按钮；拖拽上传区写明允许的文件格式和大小，上传中显示进度。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：写明格式与大小
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-entry--entry-upload

## 设计模式/全局规则 / 数据展示（DISPLAY）

表格列有稳定的类型、宽度与对齐；卡片一行最多 4 张；折叠、时间轴、轮播各有用法；每种展示都要设计超长与空数据。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-display--overview

### DISPLAY.TABLE_COLUMNS 表格列

每列有稳定的 key、标题、值类型和宽度策略；时间、状态、操作列不换行；金额、数量右对齐，同列小数位一致，单位写在表头；空单元格显示「-」；长文本单行省略、悬停看全文。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：空值占位 `p.empty` = -（Ant Design 设计规范 · 数据展示）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「每列有稳定 key、标题、值类型、宽度策略、权限和导出规则。」
- 示例（这样做）：金额右对齐、单位在表头、空值用「-」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-display--display-table-columns

### DISPLAY.CARD_GRID 卡片排布

卡片用来把相关信息收拢成一块，按栅格排列，一行最多 4 张；卡片里的长文本截断，卡片之间间距一致。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：一行最多卡片数 `p.per_row_max` = 4 个（Ant Design 设计规范 · 数据展示）
- 示例（这样做）：一行 4 张
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-display--display-card-grid

### DISPLAY.COLLAPSE 折叠

长而不规则的内容用折叠面板逐步展开；各面板之间关系松散时用手风琴，一次只展开一个。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：手风琴
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-display--display-collapse

### DISPLAY.TIMELINE 时间轴

按时间记录的事件、任务用竖向时间轴，最新的在最上面。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：新的在上
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-display--display-timeline

### DISPLAY.CAROUSEL 轮播

轮播只放同级内容（图片、卡片），3 到 5 张，让用户看得出一共几张、往哪个方向切。管理侧工作页不用轮播。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：张数范围 `p.slides` = 3 个 / 5 个（Ant Design 设计规范 · 数据展示）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-display--display-carousel

### DISPLAY.EDGE_CASES 超长与空数据

每个展示组件都要设计两种边界情况：内容超长（截断、换行或展开）和没有数据（空状态）。按重要程度、使用频率和关联程度排列信息。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-display--display-edge-cases

## 设计模式/全局规则 / 数据格式（FORMAT）

数字、金额、日期时间、相对时间、脱敏各有固定格式，全部经格式化注册表输出，页面里不手拼。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-format--overview

### FORMAT.NUMBER 数字

数字默认带千分位；单位小写、紧跟数字（123,220kg）；比例用百分比（12.32%），进度用分数（12/30）；很大的数可以用「万」「亿」，不用「千」作单位；表格里的单位写在表头，不写在每个单元格。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：写法示例 `p.examples` = 123,220kg / 12.32% / 12/30（Ant Design 设计规范 · 数据格式）
- 参数：可用的大数单位 `p.large_units` = 万 / 亿（Ant Design 设计规范 · 数据格式）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-format--format-number

### FORMAT.AMOUNT 金额

金额写成货币代码加数字（CNY 1,280.00），保留到分（两位小数），列表里右对齐并用等宽数字；货币代码用 ISO 4217，不在代码里写死 ¥、$ 符号；经格式化注册表输出。

- 执行：机器门禁 `format.no-local-pattern`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：人民币代码 `p.code` = CNY（Ant Design 设计规范 · 数据格式）
- 参数：小数位 `p.decimals` = 2 个（pomaster 预设约定）
- 硬规范依据：specs/hard/themes/internationalization-and-copywriting.md「货币代码使用 ISO 4217（`CNY`、`USD`、`EUR`）；禁止用 `$`、`￥` 符号硬编码。」
- 示例（这样做）：经格式化注册表输出
- 示例（别这样做）：页面里拼符号和小数
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-format--format-amount

### FORMAT.DATETIME 日期时间

日期 YYYY-MM-DD，时间 24 小时制 HH:mm:ss，日期与时间之间一个空格；日期区间用「～」，两侧各一个空格；存储用 ISO 8601（UTC），显示按用户时区转换；全部经格式化注册表输出，页面里不手拼格式串。

- 执行：机器门禁 `format.no-local-pattern`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：日期 `p.date` = YYYY-MM-DD（Ant Design 设计规范 · 数据格式）
- 参数：时间 `p.time` = HH:mm:ss（Ant Design 设计规范 · 数据格式）
- 参数：日期时间 `p.datetime` = YYYY-MM-DD HH:mm:ss（Ant Design 设计规范 · 数据格式）
- 参数：区间分隔 `p.range_separator` =  ～ （Ant Design 设计规范 · 数据格式）
- 硬规范依据：specs/hard/themes/internationalization-and-copywriting.md「日期、时间、相对时间通过 Formatter Registry 统一输出；禁止页面本地拼接 `YYYY-MM-DD` 或写死 "2 天前"。」
- 硬规范依据：specs/hard/themes/internationalization-and-copywriting.md「存储时间使用 ISO 8601 / UTC；显示时间按用户 locale + 显式时区转换。」
- 示例（这样做）：注册表输出
- 示例（别这样做）：页面里手拼格式串
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-format--format-datetime

### FORMAT.RELATIVE_TIME 相对时间

消息、通知里的时间用相对时间：1 分钟内写「刚刚」，1 小时内写「N 分钟前」，24 小时内写「N 小时前」，超过 24 小时写「MM-DD HH:mm」，超过一年写「YYYY-MM-DD HH:mm」。同样经格式化注册表输出。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：时间差 → 写法 `p.tiers` = 1 分钟内 → 刚刚，1 小时内 → N 分钟前，24 小时内 → N 小时前，超过 24 小时 → MM-DD HH:mm，超过一年 → YYYY-MM-DD HH:mm（Ant Design 设计规范 · 数据格式）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-format--format-relative-time

### FORMAT.MASKING 脱敏

管理侧展示个人信息（领域规格里分级为 pii / sensitive_pii 的字段）时脱敏：用 * 替换并保持位数；金额、时间等高度敏感的值整体隐藏为 ***。各类信息保留的位数按下表，业务更严格时可以收紧。

- 执行：人工评审；适用：管理侧
- 参数：信息类型 → 保留位数 `p.rules` = 姓名 → 两个字留首字，三个字及以上留首尾，手机号 → 留前 3 后 4，证件号 → 高留首尾各 1，中留前 3 后 3，低留前 6 后 4，银行卡 → 高留后 4，中留前 6 后 4，低留前 4 后 6，邮箱 → 留域名和账号前 3 位，地址 → 留到省市区（Ant Design 设计规范 · 数据格式）
- 示例（这样做）：保持位数的部分脱敏
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-format--format-masking

## 设计模式/全局规则 / 文案（COPY）

界面文字走文案字典；从用户视角、简洁一致地写；语气平和；报错说清怎么办；标点与用词统一。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-copywriting--overview

### COPY.NO_LITERAL 文案字典

模板、组件、脚本里不写死界面文字，统一经文案字典的 key 取用（用户数据除外）；key 用稳定的点分标识，如 vehicleModel.form.code，不用文案本身作 key；插值用命名占位符 {name}。

- 执行：机器门禁 `text.no-literal-copy`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/internationalization-and-copywriting.md「禁止在模板/组件/脚本中硬编码任何自然语言文本（用户数据除外）。」
- 硬规范依据：specs/hard/themes/internationalization-and-copywriting.md「key 使用稳定标识，禁止用中文/英文文案本身作为 key。」
- 示例（这样做）：经 key 取文案
- 示例（别这样做）：模板里写死中文
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-copywriting--copy-no-literal

### COPY.USER_VIEW 用户视角

写用户能做什么、会得到什么，不写系统怎么实现；去掉用户已经知道的话；用常见、具体的词；同一事物全系统一个叫法，操作名称和它打开的页面标题一致；最重要的信息放在最前面。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：说结果
- 示例（别这样做）：说实现
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-copywriting--copy-user-view

### COPY.TONE 语气

称呼用「你」，同一句里不混用「你」「我」；多给建议，少用「不能」「不要」「请勿」这类命令；出了问题聚焦怎么解决，不指责用户；「抱歉」只用在系统造成的问题上；不用「绝不」这类绝对化说法。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-copywriting--copy-tone

### COPY.ERROR_MESSAGE 报错文案

报错写清两件事：发生了什么（客观描述，不只给错误码），用户下一步怎么做。错误码可以附在后面供排查。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：原因 + 下一步
- 示例（别这样做）：只有错误码
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-copywriting--copy-error-message

### COPY.PUNCTUATION 标点与空格

中文与数字、英文之间加一个空格（2 个、5 MB）；按钮、标题、输入提示、表格里的短句不加句号；感叹号只用于问候和祝贺；省略号用「…」；连接号用半角「-」；隐私遮挡用「*」。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-copywriting--copy-punctuation

### COPY.TERMS 用词

规范用词：写「其他」不写「其它」，写「登录」不写「登陆」，指代时「此」比「该」更明确；统计数字用阿拉伯数字。禁用词表随项目补充。

- 执行：机器门禁 `text.banned-terms`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：禁用词 → 规范词 `p.banned` = 其它 → 其他，登陆 → 登录（Ant Design 设计规范 · 文案）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-copywriting--copy-terms

## 设计模式/全局规则 / 按钮（BUTTON）

按用途选按钮类型；一个按钮区一个主按钮；推荐操作在前、风险操作在后、「更多」在最右；文案用动词。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-buttons--overview

### BUTTON.TYPES 按钮类型

主按钮用于完成、推荐类操作；拿不准时用次按钮；表格操作列等大量重复的地方用文字按钮；引导「在这里添加」用虚线按钮；删除等有风险的操作用危险按钮；空间小、按钮多时用图标按钮，必须配文字提示；一个按钮里不放两个图标。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：用途 → 类型 `p.map` = 完成与推荐 → 主按钮，其余操作 → 次按钮，表格操作列 → 文字按钮，引导添加 → 虚线按钮，有风险 → 危险按钮，空间小 → 图标按钮（配文字提示）（Ant Design 设计规范 · 按钮）
- 示例（这样做）：各类型的用途
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-buttons--button-types

### BUTTON.SINGLE_PRIMARY 主按钮

同一个按钮区（工具栏、弹窗底部、表单底部）最多一个主按钮，其余用次按钮或文字按钮。

- 执行：机器门禁 `markup.single-primary-button`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：每个按钮区主按钮上限 `p.max_primary` = 1 个（Ant Design 设计规范 · 按钮）
- 示例（这样做）：一个主按钮
- 示例（别这样做）：三个主按钮，看不出该点哪个
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-buttons--button-single-primary

### BUTTON.ORDER 按钮顺序

推荐的操作放在阅读起点，有风险的操作放最后，折叠起来的「更多」永远在最右；有返回含义的按钮放最左。工具栏按「推进业务（新建、保存、发布）→ 视图控制 → 其他（刷新、设置）→ 更多」排列。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「主次操作、批量操作和状态信息位置一致。」
- 示例（这样做）：工具栏顺序
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-buttons--button-order

### BUTTON.PLACEMENT 按钮位置

按钮放在它作用的内容旁边；工具栏的按钮靠右；页面底部的按钮区只用于两种情况：详情页推进流程（审批通过、驳回）和拆成多张卡片的复杂表单。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-buttons--button-placement

### BUTTON.COPY 按钮文案

按钮文案用动词（下拉按钮除外），简短、说清点了会发生什么，如「发布」「保存车型」，少用「确定」「提交」这类泛词；主要操作本身是否定动作时点明后果，如「删除车型」。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：说清结果
- 示例（别这样做）：泛词，看不出后果
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-buttons--button-copy

### BUTTON.GROUPING 按钮分组

按钮之间用间距分组，确有需要才加分割线；不要把普通按钮拼接成一组，容易被当成切换按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-buttons--button-grouping

## 设计模式/全局规则 / 数据列表（LIST）

按数据选列表形态与查询方式；分页并记住位置；详情打开方式有选择规则；批量、新建、删除各有固定做法。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-list--overview

### LIST.FORM 列表形态

多字段、需要比较的数据用表格；空间小（侧栏、下拉、小弹窗）时用竖向列表；展示型内容用卡片网格。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-list--list-form

### LIST.QUERY 查询方式

多个条件组合后一起提交用查询表单；改条件立刻刷新结果用筛选；一个关键词跨多个字段找用搜索框。常用的查询放在列表工具栏里，复杂查询单独放一个区域。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：工具栏里的搜索与筛选
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-list--list-query

### LIST.PAGING 分页与位置

列表默认分页加载，只有一页时隐藏分页；从详情返回列表时恢复原来的页码、筛选和滚动位置，并标记看过的条目；信息流、消息类列表用同页加载更多。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「大数据使用服务端分页/筛选/排序及虚拟化。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-list--list-paging

### LIST.DETAIL_ENTRY 详情入口

点标题进入详情。内容一屏放得下就在行内展开；信息较多用抽屉；需要分享链接或沉浸处理用独立页面；需要在多条之间快速切换用左右两栏。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「抽屉、弹窗和路由跳转有选择规则。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-list--list-detail-entry

### LIST.BATCH 批量操作

勾选行之后，工具栏位置出现批量操作栏，写明已选几项，并提供批量操作和取消选择；批量操作的位置全系统一致。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「主次操作、批量操作和状态信息位置一致。」
- 示例（这样做）：已选数量 + 批量操作
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-list--list-batch

### LIST.CREATE 新建入口

右上角「新建」按钮打开弹窗、抽屉或新页面，新建成功后新条目排在列表第一并短暂高亮；在列表里就地添加时，用虚线「添加」按钮放在列表首或尾，新条目出现在按钮的位置。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-list--list-create

### LIST.DELETE 删除

能撤销的删除直接执行，并在约 1 分钟内提供撤销；不能撤销的删除用贴着按钮的气泡确认框确认，不弹模态框；破坏性很大的操作（批量删除、清空）要再做一次验证，如输入名称确认。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：撤销保留时长 `p.undo_window` = 60000ms（Ant Design 设计原则 · 足不出户）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「高风险操作必须提供确认、复核、撤销或等效防错机制」
- 示例（这样做）：气泡确认框贴着按钮
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-list--list-delete

## 设计模式/原则 / 亲密性（PROXIMITY）

有关系的靠近，没关系的拉开；用间距的远近表达结构与层级。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-proximity--overview

### PROXIMITY.GROUPING 分组

关系紧密的元素靠在一起，读作一个整体；没关系的拉开距离。纵向间距按 8 的倍数取（8 + 8n），常用小 8、中 16、大 24 三档（见「间距」领域 SPACING.TIERS）；需要再拉开层次时加减一个基础单位，或加分割线。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：纵向间距公式 `p.formula` = 8 + 8n（n ≥ 0）（Ant Design 设计规范 · 亲密性）
- 参数：小 `p.small` = 8px（token `spacing.sm`）
- 参数：中 `p.middle` = 16px（token `spacing.lg`）
- 参数：大 `p.large` = 24px（token `spacing.xl`）
- 示例（这样做）：标签和值靠近，组与组拉开
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-proximity--proximity-grouping

## 设计模式/原则 / 对齐（ALIGN）

文字左对齐共用起始边；横排表单标签右对齐带冒号；数字右对齐、小数位一致。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-alignment--overview

### ALIGN.TEXT 文字对齐

标题和正文左对齐，共用同一条起始边；短段落、行距较松的内容尤其要对齐起点。只有在刻意强调标题与正文的区别时才打破这条线。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-alignment--align-text

### ALIGN.FORM_LABEL 表单标签对齐

标签在输入左侧的表单，标签右对齐并带冒号，冒号连成一条竖线，引导视线从上到下填写。

- 执行：人工评审；适用：管理侧
- 示例（这样做）：冒号连成一条线
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-alignment--align-form-label

### ALIGN.NUMBERS 数字对齐

同一列的数字右对齐，小数位保持一致，方便上下比较（配合 TYPE.TABULAR_NUMS 的等宽数字）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-alignment--align-numbers

## 设计模式/原则 / 对比（CONTRAST）

主次分明；需要慎重的选择保持中立；状态靠颜色加形状或文字区分；对比要足够强。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-contrast--overview

### CONTRAST.PRIMARY_ACTION 主次对比

更重要、更常用的操作要突出，也可以靠弱化其他操作来突出它。需要用户慎重判断的选择（同意或拒绝一份申请）两个按钮用同样的样式，不引导用户选某一个。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：审批时两个选择同等对待
- 示例（别这样做）：把「通过」做成主按钮，暗示用户选它
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-contrast--contrast-primary-action

### CONTRAST.STATUS 状态区分

不同状态用不同颜色，同时配图标或文字，不能只靠颜色区分；交互状态（悬停、选中）的变化要明显。整页的标题与正文用字号、字重拉开层级，对比要足够强。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源」
- 示例（这样做）：颜色 + 文字
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-contrast--contrast-status

## 设计模式/原则 / 重复（REPEAT）

同类东西全系统长得一样、放在一样的位置，降低学习成本。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-repetition--overview

### REPEAT.CONSISTENCY 一致性

同一类元素（分割线、颜色、形状、信息格式、间距）在全系统用同一种做法；同类页面用同样的结构，共性问题在共享结构里改，不在单个页面里改。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「同类页面共性问题在共享结构层修复。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-repetition--repeat-consistency

## 设计模式/原则 / 直截了当（DIRECT）

在哪里看到就在哪里改；拖拽只沿一个方向，并提供不用拖拽的替代方式。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-direct--overview

### DIRECT.INLINE_EDIT 就地编辑

能就地编辑的不跳到另一页。偶尔改、以阅读为主的单个字段用点击编辑（悬停高亮，点开带确认和取消）；经常要改的用旁边的编辑图标或链接；多个字段一起改时进入行内编辑，切换前后表格列宽不跳动。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：单字段点击编辑
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-direct--direct-inline-edit

### DIRECT.DRAG 拖拽

可拖拽的条目悬停时出现拖拽手柄、指针变成手形，可放置的位置有明显外框；只沿一个方向拖（纵向或横向）；同时提供不用拖拽的替代方式（上移、下移按钮或序号输入）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「依赖拖拽的操作必须提供无需拖拽的等价路径」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-direct--direct-drag

## 设计模式/原则 / 足不出户（STAY）

能在当前页完成的不跳页：确认用气泡确认框或撤销，补充信息用浮层或抽屉，流程尽量在一页内展开。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-stay--overview

### STAY.ON_PAGE 不跳页

能撤销的操作直接做并提供撤销，不能撤销的用贴着按钮的气泡确认框；补充信息用浮层或抽屉，悬停触发的浮层约 0.5 秒后出现、移开立即关闭；小的文字修改用就地浮层，点击外部即保存并关闭；多步任务尽量在一页内逐步展开，只有步骤必须依次完成时才用分步弹窗，不把每一步拆成独立页面。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：悬停浮层出现延迟 `p.hover_delay` = 500ms（Ant Design 设计原则 · 足不出户）
- 参数：撤销保留时长 `p.undo_window` = 60000ms（Ant Design 设计原则 · 足不出户）
- 示例（这样做）：悬停看详情，不跳页
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-stay--stay-on-page

## 设计模式/原则 / 简化交互（LIGHT）

关键操作常驻可见；上下文操作悬停出现；非主流程工具进入编辑模式才出现；可点区域做大，工具靠近内容。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-lightweight--overview

### LIGHT.TOOLS 工具常驻

关键操作始终可见，有清晰的可点区域和悬停、点击状态；只和某一行或某个对象相关的操作，悬停时才出现；不属于主流程的工具，进入编辑模式后才出现。关键操作不能藏在悬停或模式切换后面。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-lightweight--light-tools

### LIGHT.HOTSPOT 可点区域

优先放大可点区域，而不是放大按钮本身（比如整个单元格都能点）；工具放在它作用的内容旁边。触控目标至少 24×24 CSS px。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：最小触控目标边长 `p.min_target` = 24px（pomaster 主题硬规范 · UI 呈现与设计）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「触控目标尺寸至少 24×24 CSS px」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-lightweight--light-hotspot

## 设计模式/原则 / 提供邀请（INVITE）

拖拽、就地编辑这类不容易发现的交互，要主动给出提示。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-invitation--overview

### INVITE.DISCOVERABILITY 交互邀请

拖拽、就地编辑、上下文工具这类不容易发现的交互要给出提示：空状态引导第一步、悬停时提示可点或可编辑、未完成的任务提示继续。新功能引导只放几步，可跳过、可重看；不能拿引导来弥补交互本身的问题。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：未完成任务提示继续
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-invitation--invite-discoverability

## 设计模式/原则 / 巧用过渡（TRANSITION）

用过渡说明刚刚发生了什么；新增、修改、删除各有提示；不动没变化的东西；尊重减少动效设置。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-transition--overview

### TRANSITION.EXPLAIN 用过渡说明变化

切换视图时用滑动、展开等过渡保留上下文；新增的条目短暂高亮，修改过的单元格短暂着色后恢复，删除的元素平滑移除，高亮在几秒内淡出；不给没变化的元素加动画；用户系统开启「减少动效」时关闭或降级过渡。时长取动效 token。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：短 `p.fast` = 0.1s（token `motion.fast`）
- 参数：中 `p.normal` = 0.2s（token `motion.normal`）
- 参数：长 `p.slow` = 0.3s（token `motion.slow`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-transition--transition-explain

## 设计模式/原则 / 即时反应（REACT）

输入时即时给出联想、校验与结果；加载样式随操作的频率与重要程度选；新内容到达时提示或短暂高亮。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-reaction--overview

### REACT.IMMEDIATE 即时反应

输入时给出联想、实时校验（如密码强度）、实时搜索结果，并做防抖、取消旧请求、丢弃过期响应；加载样式按操作的频率和重要程度选（按钮、表格、整页），不要所有操作都用同一种；有新内容时提示刷新，或在几秒内高亮新到的条目；提示逐步给，不要一次全摆出来。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「搜索防抖、旧请求取消、过期响应丢弃。」
- 示例（这样做）：输入联想
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-principles-reaction--react-immediate

## 设计模式/模板文档 / 数据可视化页（VIZ）

概览、分析、明细三类；最重要的指标放左上；一屏 5 到 9 个模块；高度概括的数据用指标卡；一张卡片一个主题。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-templates-visualization-page--overview

### VIZ.TYPES 页面类型

数据可视化页分三类：概览（指标大盘、监控）、分析（多维分析）、明细（数据明细）。先定类型，再选模块。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-templates-visualization-page--viz-types

### VIZ.LAYOUT 版面布局

最重要的指标和视图放在页面顶部或左上；一屏控制在 5 到 9 个模块；高度概括的数据优先用指标卡（数值），而不是图表；一张卡片一个主题，相关度高的数据合并到一张卡片，用通栏分割线分开。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：一屏模块数 `p.modules` = 5 个 / 9 个（Ant Design 模板文档 · 数据可视化页）
- 示例（这样做）：顶部一排指标卡
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-templates-visualization-page--viz-layout

### VIZ.CHART 图表与口径

按要表达的关系选图表类型（趋势用折线，构成用堆叠，比较用柱状），必要时说明指标口径；用筛选让用户既能看全局，也能下钻到细节；页面之间用交互串联。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-templates-visualization-page--viz-chart

## 设计模式/模板文档 / 详情页（DETAIL）

按信息复杂度选布局；信息平铺直给；用分割线、卡片、标签页分出层级；单据类流程操作放页脚。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-templates-detail-page--overview

### DETAIL.LAYOUT 布局

内容简单时放在一张卡片里，用非通栏分割线分组；有多个复杂模块时每个模块一张卡片（审批单据类）；内容多到一页放不下时用标签页做导航；按阶段推进的内容用步骤组织。默认用最简单的那种。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：一张卡片，非通栏分割线分组
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-templates-detail-page--detail-layout

### DETAIL.FLAT 信息平铺

信息平铺直给，没有必要不折叠、不隐藏；强相关的内容靠近，弱相关的拉开；同类详情页用同样的结构和模块。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-templates-detail-page--detail-flat

### DETAIL.SEPARATORS 分隔方式

组内用非通栏分割线，大段之间用通栏分割线，一个主题一张卡片，最高一级用标签页（按版本、意图或阶段）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-templates-detail-page--detail-separators

### DETAIL.ACTIONS 流程操作

审批单据类详情页的流程操作（通过、驳回、转交、加签、挂起、撤回）放在页面底部按钮区；通过与驳回同等样式（见 CONTRAST.PRIMARY_ACTION）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-templates-detail-page--detail-actions

## 工程规范 / 状态管理（STATE）

每份状态有属主；服务端数据进查询缓存，不复制进全局 store；全局 store 只放稳定的跨页状态；可分享的状态进 URL；组件不直接发请求；身份切换与卸载时清理。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--overview

### STATE.OWNERSHIP 状态放哪

每份状态都说清楚：谁拥有、谁能改、放在哪（组件内、页面、全局 store、查询缓存、URL、浏览器存储）、活多久、什么时候清理。组件自己的状态留在组件里，不放进全局 store。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「每个状态声明 owner、更新者、存储位置、生命周期和清理策略。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 将组件状态放入全局 store。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--state-ownership

### STATE.SERVER_STATE 服务端数据

从接口来的数据由查询缓存层管理（缓存 key、过期、重新获取、失效都在这一层），页面直接从查询缓存读；不把服务端数据复制进全局 store 再手动同步，也不在全局 store 里存大量业务数据。查询缓存用 @tanstack/vue-query。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：查询缓存库 `p.query_library` = @tanstack/vue-query（项目选型决策（Owner 2026-11-06：服务端数据用 TanStack Query，全局 store Vue 用 Pinia、React 用 Zustand））
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「server state 由查询缓存层管理。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 复制 server state 到全局 store 手动同步。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 在全局状态库存储大量业务数据（server state 须走 Query Cache）。」
- 示例（这样做）：页面从查询缓存读
- 示例（别这样做）：拉回来塞进全局 store 再同步
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--state-server-state

### STATE.GLOBAL_STORE 全局 store

全局状态库用 Pinia（Vuex 已是维护模式，不再使用）；全局 store 只放跨页面且稳定的状态，比如当前用户、权限、偏好设置；每个 store 一个文件，放在约定目录，文件头写明属主。

- 执行：机器门禁 `state.store-library`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：全局状态库 `p.library` = Pinia（pomaster 技术栈规范 · Vue 3（状态与路由选官方方案））
- 硬规范依据：specs/hard/stacks/vue3/vue3-framework-overlay.md「新应用状态管理选 Pinia」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「全局 store 只保存稳定跨页面状态。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--state-global-store

### STATE.URL URL 状态

列表的筛选条件、页码、排序、当前标签页这类可分享、刷新后要恢复的状态放进 URL；敏感信息和没提交的表单不进 URL。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.url-filters`：实验：筛选条件进 URL——改筛选和页码，地址栏跟着变；点「刷新页面」，视图从 URL 原样恢复。
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可分享和可恢复状态进入 URL。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 将敏感或未提交表单写入 URL。」
- 示例（这样做）：筛选与页码在 URL 里
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--state-url

### STATE.REQUESTS 请求入口

组件不直接调用 fetch、axios，一律经生成的接口客户端（类型与 OpenAPI 同源）和查询缓存；展示组件不请求接口、不改路由、不改全局状态，数据从参数传入。

- 执行：机器门禁 `state.no-direct-request`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 让展示组件偷偷请求接口、改路由或全局状态。」
- 示例（别这样做）：组件里直接 fetch
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--state-requests

### STATE.CACHE_KEYS 缓存 key 与失效

查询缓存的 key 包含所有影响结果的筛选条件和上下文（用户、租户、数据范围）；每个写操作声明它会让哪些查询失效，成功后刷新依赖数据；切换用户、角色、组织或数据范围时清掉可能越权的缓存。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.query-cache`：实验：查询缓存与失效——切换筛选看缓存命中；点「新建一条」后，对应的 key 失效并重新拉取。
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「Query Key 包含所有影响结果的筛选和上下文。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「写操作定义依赖失效矩阵。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「用户、权限或范围切换时清除越权风险状态。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--state-cache-keys

### STATE.CLEANUP 清理与竞态

状态持有的监听器、计时器、订阅、请求在组件卸载、身份切换时清理；已取消的请求、旧订阅、旧身份下的迟到结果不得写入当前状态。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.race`：实验：迟到的响应不写回——快速输入会发出多个请求，响应乱序到达；只有最新一次的结果写进列表。打开「错误做法」看旧结果覆盖新结果。
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 让已取消请求、旧订阅或旧身份上下文的迟到结果继续写入当前状态。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--state-cleanup

### STATE.FORM_MODEL 表单模型

表单用独立的表单模型和类型化的校验 schema，不直接绑定接口返回的 DTO；区分初始值、当前值、是否改过、错误和提交中。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「使用独立 FormModel 和 typed schema。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「MUST NOT 直接绑定 DTO。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--state-form-model

### STATE.BROWSER_STORAGE 浏览器存储

存进浏览器（localStorage、IndexedDB 等）的每一项都登记用途、隔离 key（按用户、租户）、版本、大小、过期时间和清理时机；读回来先校验版本和身份；脚本可读的存储里不放会话标识、刷新令牌等凭据。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「每个持久化项必须声明用途、Storage Class、Isolation Key、schema 版本、大小预算、过期时间、迁移/重置策略、清理触发器和 Owner。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可被脚本读取的存储不得持久化 session identifier、refresh token、secret 或等价凭据」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-state--state-browser-storage

## 工程规范 / 性能（PERF）

先定预算；路由与重组件按需加载；大列表分页、宽表虚拟化；输入防抖并丢弃过期响应；初始化请求并行；度量分清实验室与真实用户数据。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--overview

### PERF.BUDGET 性能预算

上线前定好预算：真实用户第 75 百分位 LCP ≤ 2.5 s、INP ≤ 200 ms、CLS ≤ 0.1（用户侧必须达到，管理侧作为参考目标，项目可以凭证据收紧）；首屏脚本体积和单个路由分包体积由项目定上限。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：LCP（p75） `p.lcp` = 2500ms（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 参数：INP（p75） `p.inp` = 200ms（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 参数：CLS（p75） `p.cls` = 0.1（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 参数：首屏脚本体积 `p.initial_js`：待项目决定——首屏脚本（压缩后）体积上限是多少 KB？
- 参数：路由分包体积 `p.route_chunk`：待项目决定——单个路由分包（压缩后）体积上限是多少 KB？
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「定义首屏、包体、交互和核心页面预算。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「默认参考目标为 p75 的 LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-budget

### PERF.LAZY_LOAD 按需加载

路由一律懒加载；图表、富文本编辑器、大表格等重组件在用到的页面里按需加载；应用入口（main.ts）不同步引入这些重型依赖；页面先加载核心内容，非核心的延后。

- 执行：机器门禁 `perf.lazy-load`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「路由、图表和重组件按需加载。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 在应用入口同步 import 重型编辑器、图表库或大表组件（首屏重依赖）。」
- 示例（这样做）：路由懒加载
- 示例（别这样做）：入口同步引入图表库
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-lazy-load

### PERF.ON_DEMAND_LIBRARY 组件库按需引入

组件库按需引入，不整包注册：管理侧按组件引入 ant-design-vue；用户侧 Vant 用官方的自动按需引入插件，不与全量引入混用。

- 执行：机器门禁 `perf.no-full-library-import`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/stacks/h5/h5-mobile-overlay.md「Vant 引入必须走官方口径」
- 示例（别这样做）：整包注册
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-on-demand-library

### PERF.LARGE_LISTS 大列表

大列表走服务端分页、筛选、排序（管理侧每页最多 200 条，用户侧每次最多 50 条，与接口分页档一致）；行数多或列很多的表格用虚拟滚动；不用 v-for 一次渲染全量数据。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：管理侧每页上限 `p.admin_max_page_size` = 200 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：用户侧每次上限 `p.public_max_page_size` = 50 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：虚拟滚动阈值 `p.virtual_threshold`：待项目决定——表格多少行以上启用虚拟滚动？
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「大列表服务端分页，宽表虚拟化。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 大列表用普通 `v-for` 渲染全量数据（须虚拟滚动或分页）。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-large-lists

### PERF.INPUT 输入与过期响应

搜索、联想等随输入触发的请求做防抖；新请求发出时取消旧请求；过期的响应不覆盖新状态。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：防抖间隔 `p.debounce`：待项目决定——输入防抖间隔取多少毫秒？（候选 300ms）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「搜索防抖、旧请求取消、过期响应丢弃。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-input

### PERF.PARALLEL_INIT 并行初始化

页面初始化需要的多个请求并行发出，或由后端聚合成一个；不串行等待彼此无关的请求。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 串行发起可并行的页面初始化请求（须并行或后端聚合）。」
- 示例（这样做）：并行
- 示例（别这样做）：串行等待
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-parallel-init

### PERF.COMPUTE 渲染计算

渲染函数和模板里不做复杂计算，派生值用 computed；对大数据全集的计算放到后端或 Web Worker，前端只做即时的轻计算。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 在 render 中执行复杂计算。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-compute

### PERF.MEASURE 度量口径

性能结论分清实验室数据和真实用户数据，记录设备、网络、浏览器、样本量和统计口径，放行看第 75 百分位；同一数据量下对比前后结果，不拿平均值或单次本地耗时下结论。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「性能预算必须区分实验室数据与真实用户数据」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-measure

## 待补的领域（96 个）

- 组件/通用 / 分裂按钮（`split_button`，前缀 CMP.SPLIT_BUTTON）：一个默认动作加一组相近的动作。；对应组件 antd Dropdown.Button，geist Split Button
- 组件/通用 / 复制按钮（`copy_button`，前缀 CMP.COPY_BUTTON）：把一段文字复制到剪贴板并给出反馈。；对应组件 antd Typography.copyable，geist Copy Button、Text With Copy Button
- 组件/通用 / 悬浮按钮（`float_button`，前缀 CMP.FLOAT_BUTTON）：悬浮在页面上的全局功能入口。；对应组件 antd FloatButton，geist （无）
- 组件/通用 / 排版文本（`typography_text`，前缀 CMP.TEXT）：标题、正文、强调、删除线、可复制与可编辑文本。；对应组件 antd Typography，geist Text、Label
- 组件/通用 / 代码块（`code_block`，前缀 CMP.CODE_BLOCK）：多行、带高亮的源代码。；对应组件 antd （无），geist Code Block、Code
- 组件/通用 / 命令片段（`snippet`，前缀 CMP.SNIPPET）：可一键复制的命令行。；对应组件 antd （无），geist Snippet
- 组件/通用 / 键盘按键（`kbd`，前缀 CMP.KBD）：展示触发动作的快捷键。；对应组件 antd Typography.keyboard，geist Keyboard Input
- 组件/布局 / 分割线（`divider`，前缀 CMP.DIVIDER）：把内容分成不同区块。；对应组件 antd Divider，geist Separator
- 组件/布局 / 弹性布局（`flex`，前缀 CMP.FLEX）：一维排布与对齐。；对应组件 antd Flex，geist （无）
- 组件/布局 / 间距组合（`space`，前缀 CMP.SPACE）：统一相邻元素的间距。；对应组件 antd Space，geist （无）
- 组件/布局 / 栅格组件（`grid_component`，前缀 CMP.GRID）：按栅格排布内容。；对应组件 antd Row、Col，geist Grid
- 组件/布局 / 页面布局（`page_layout`，前缀 CMP.LAYOUT）：顶栏、侧栏、内容区与页脚组成的页面框架。；对应组件 antd Layout，geist （无）
- 组件/布局 / 滚动区（`scroller`，前缀 CMP.SCROLLER）：沿一个方向滚动的一组同类条目。；对应组件 antd （无），geist Scroller
- 组件/导航 / 锚点（`anchor`，前缀 CMP.ANCHOR）：在长页面内跳到指定区块。；对应组件 antd Anchor，geist （无）
- 组件/导航 / 面包屑（`breadcrumb`，前缀 CMP.BREADCRUMB）：显示当前页面在层级中的位置。；对应组件 antd Breadcrumb，geist Breadcrumbs
- 组件/导航 / 下拉菜单（`dropdown`，前缀 CMP.DROPDOWN）：从一个按钮展开一组动作。；对应组件 antd Dropdown，geist Menu、Dots Menu
- 组件/导航 / 右键菜单（`context_menu`，前缀 CMP.CONTEXT_MENU）：右击或长按时出现的上下文动作。；对应组件 antd Dropdown.contextMenu，geist Context Menu
- 组件/导航 / 命令面板（`command_menu`，前缀 CMP.COMMAND_MENU）：全局的键盘优先命令入口。；对应组件 antd （无），geist Command Menu
- 组件/导航 / 导航菜单（`nav_menu`，前缀 CMP.NAV_MENU）：页面的主导航与子导航。；对应组件 antd Menu，geist （无）
- 组件/导航 / 分页（`pagination`，前缀 CMP.PAGINATION）：在分页数据或相邻页面之间切换。；对应组件 antd Pagination，geist Pagination
- 组件/导航 / 加载更多（`load_more`，前缀 CMP.LOAD_MORE）：在列表末尾追加下一批数据，或展开收起的内容。；对应组件 antd List.loadMore，geist Load More Button、Show More
- 组件/导航 / 步骤条（`steps`，前缀 CMP.STEPS）：显示多步流程的进度。；对应组件 antd Steps，geist （无）
- 组件/导航 / 标签页（`tabs`，前缀 CMP.TABS）：在同一页面内切换平级视图。；对应组件 antd Tabs，geist Tabs
- 组件/数据录入 / 自动完成（`auto_complete`，前缀 CMP.AUTO_COMPLETE）：输入时给出补全建议。；对应组件 antd AutoComplete，geist （无）
- 组件/数据录入 / 可搜索选择（`combobox`，前缀 CMP.COMBOBOX）：输入关键字过滤一个已知列表并选中一项。；对应组件 antd Select.showSearch，geist Combobox
- 组件/数据录入 / 级联选择（`cascader`，前缀 CMP.CASCADER）：从有层级的选项里逐级选择。；对应组件 antd Cascader，geist （无）
- 组件/数据录入 / 多选框（`checkbox`，前缀 CMP.CHECKBOX）：在一组选项里选多个，或确认一句声明。；对应组件 antd Checkbox，geist Checkbox
- 组件/数据录入 / 选择卡片（`choicebox`，前缀 CMP.CHOICEBOX）：带说明的大号单选或多选。；对应组件 antd （无），geist Choicebox
- 组件/数据录入 / 日期选择（`date_picker`，前缀 CMP.DATE_PICKER）：选择日期或日期范围。；对应组件 antd DatePicker，geist Calendar
- 组件/数据录入 / 时间选择（`time_picker`，前缀 CMP.TIME_PICKER）：选择时间。；对应组件 antd TimePicker，geist （无）
- 组件/数据录入 / 表单（`form`，前缀 CMP.FORM）：字段的标签、分组、校验与提交。；对应组件 antd Form，geist Fieldset、Label
- 组件/数据录入 / 输入框（`input`，前缀 CMP.INPUT）：单行文字输入。；对应组件 antd Input，geist Input、Clearable Input
- 组件/数据录入 / 搜索框（`search_input`，前缀 CMP.SEARCH_INPUT）：带搜索图标与清除按钮的输入框。；对应组件 antd Input.Search，geist Search Input
- 组件/数据录入 / 多行输入（`textarea`，前缀 CMP.TEXTAREA）：多行文字输入。；对应组件 antd Input.TextArea，geist Textarea
- 组件/数据录入 / 数字输入（`input_number`，前缀 CMP.INPUT_NUMBER）：输入有范围的数字。；对应组件 antd InputNumber，geist （无）
- 组件/数据录入 / 提及（`mentions`，前缀 CMP.MENTIONS）：在输入中提及某人或某物。；对应组件 antd Mentions，geist （无）
- 组件/数据录入 / 单选框（`radio`，前缀 CMP.RADIO）：在几个互斥的选项里选一个。；对应组件 antd Radio，geist Radio
- 组件/数据录入 / 评分（`rate`，前缀 CMP.RATE）：打分。；对应组件 antd Rate，geist （无）
- 组件/数据录入 / 选择器（`select`，前缀 CMP.SELECT）：从下拉列表里选一项。；对应组件 antd Select，geist Select
- 组件/数据录入 / 多选选择器（`multi_select`，前缀 CMP.MULTI_SELECT）：从下拉列表里选多项。；对应组件 antd Select.multiple，geist Multi Select
- 组件/数据录入 / 滑块（`slider`，前缀 CMP.SLIDER）：在一个范围内拖动取值。；对应组件 antd Slider，geist Slider
- 组件/数据录入 / 开关（`switch`，前缀 CMP.SWITCH）：切换一个即时生效的布尔设置。；对应组件 antd Switch，geist Toggle
- 组件/数据录入 / 分段控制器（`segmented`，前缀 CMP.SEGMENTED）：在两三个互斥视图之间切换。；对应组件 antd Segmented，geist Switch
- 组件/数据录入 / 穿梭框（`transfer`，前缀 CMP.TRANSFER）：在两个列表之间移动条目。；对应组件 antd Transfer，geist （无）
- 组件/数据录入 / 树选择（`tree_select`，前缀 CMP.TREE_SELECT）：从树形结构里选择。；对应组件 antd TreeSelect，geist （无）
- 组件/数据录入 / 上传（`upload`，前缀 CMP.UPLOAD）：选择并上传文件。；对应组件 antd Upload，geist （无）
- 组件/数据录入 / 地址输入（`address_input`，前缀 CMP.ADDRESS_INPUT）：搜索地址或按国家填写地址字段。；对应组件 antd （无），geist Address Input
- 组件/数据录入 / 破坏性确认输入（`destructive_input`，前缀 CMP.DESTRUCTIVE_INPUT）：输入资源名确认破坏性操作。；对应组件 antd （无），geist Destructive Confirmation Input
- 组件/数据录入 / 筛选条（`filter_bar`，前缀 CMP.FILTER_BAR）：与 URL 同步的筛选条件栏。；对应组件 antd （无），geist Filter Params
- 组件/数据录入 / 反馈收集（`feedback_widget`，前缀 CMP.FEEDBACK_WIDGET）：收集带情绪的文字反馈。；对应组件 antd （无），geist Feedback
- 组件/数据录入 / 主题切换（`theme_switcher`，前缀 CMP.THEME_SWITCHER）：在浅色、跟随系统、深色之间切换。；对应组件 antd （无），geist Theme Switcher
- 组件/数据展示 / 头像（`avatar`，前缀 CMP.AVATAR）：代表一个人、团队或组织。；对应组件 antd Avatar，geist Avatar
- 组件/数据展示 / 徽标数（`badge`，前缀 CMP.BADGE）：角标上的数字或红点。；对应组件 antd Badge，geist （无）
- 组件/数据展示 / 标签（`tag`，前缀 CMP.TAG）：状态、分类等短的元数据标签。；对应组件 antd Tag，geist Badge、Pill
- 组件/数据展示 / 状态点（`status_dot`，前缀 CMP.STATUS_DOT）：用一个点表示对象的状态。；对应组件 antd Badge.status，geist Status Dot
- 组件/数据展示 / 日历（`calendar`，前缀 CMP.CALENDAR）：按日历展示日期相关的数据。；对应组件 antd Calendar，geist （无）
- 组件/数据展示 / 卡片（`card`，前缀 CMP.CARD）：承载一组相关信息的容器。；对应组件 antd Card，geist （无）
- 组件/数据展示 / 走马灯（`carousel`，前缀 CMP.CAROUSEL）：轮流展示一组平级内容。；对应组件 antd Carousel，geist （无）
- 组件/数据展示 / 折叠面板（`collapse`，前缀 CMP.COLLAPSE）：可展开收起的内容区块。；对应组件 antd Collapse，geist Collapse
- 组件/数据展示 / 描述列表（`descriptions`，前缀 CMP.DESCRIPTIONS）：成组的键值信息。；对应组件 antd Descriptions，geist Description
- 组件/数据展示 / 空状态（`empty`，前缀 CMP.EMPTY）：没有内容时的占位与引导。；对应组件 antd Empty，geist Empty State
- 组件/数据展示 / 图片（`image`，前缀 CMP.IMAGE）：可预览的图片。；对应组件 antd Image，geist （无）
- 组件/数据展示 / 视频（`video`，前缀 CMP.VIDEO）：带播放控制与懒加载的视频。；对应组件 antd （无），geist Video
- 组件/数据展示 / 列表（`list`，前缀 CMP.LIST）：一组结构相同的条目。；对应组件 antd List，geist Entity
- 组件/数据展示 / 气泡卡片（`popover`，前缀 CMP.POPOVER）：悬停或聚焦时出现的富内容浮层。；对应组件 antd Popover，geist Context Card
- 组件/数据展示 / 相对时间（`relative_time`，前缀 CMP.RELATIVE_TIME）：以相对时间显示，悬停看本地与 UTC 时间。；对应组件 antd （无），geist Relative Time Card
- 组件/数据展示 / 二维码（`qrcode`，前缀 CMP.QRCODE）：把链接或文字生成二维码。；对应组件 antd QRCode，geist （无）
- 组件/数据展示 / 统计数值（`statistic`，前缀 CMP.STATISTIC）：突出显示一个统计数字。；对应组件 antd Statistic，geist （无）
- 组件/数据展示 / 仪表（`gauge`，前缀 CMP.GAUGE）：用圆环表示占比。；对应组件 antd Progress.dashboard，geist Gauge、Pie Gauge
- 组件/数据展示 / 表格（`table`，前缀 CMP.TABLE）：结构相同、需要横向比较的多行数据。；对应组件 antd Table，geist Table
- 组件/数据展示 / 时间轴（`timeline`，前缀 CMP.TIMELINE）：按时间先后排列的事件。；对应组件 antd Timeline，geist （无）
- 组件/数据展示 / 文字提示（`tooltip`，前缀 CMP.TOOLTIP）：悬停或聚焦时补充一句说明。；对应组件 antd Tooltip，geist Tooltip
- 组件/数据展示 / 漫游引导（`tour`，前缀 CMP.TOUR）：分步介绍界面功能。；对应组件 antd Tour，geist （无）
- 组件/数据展示 / 树形控件（`tree`，前缀 CMP.TREE）：可展开的层级结构。；对应组件 antd Tree，geist File Tree
- 组件/数据展示 / JSON 查看器（`json_view`，前缀 CMP.JSON_VIEW）：以可折叠的树展示 JSON。；对应组件 antd （无），geist JSON View
- 组件/数据展示 / 中间省略（`middle_truncate`，前缀 CMP.MIDDLE_TRUNCATE）：保留首尾、省略中间的长字符串。；对应组件 antd Typography.ellipsis，geist MiddleTruncate
- 组件/数据展示 / 设备外框（`device_frame`，前缀 CMP.DEVICE_FRAME）：把截图放进浏览器或手机外框里展示。；对应组件 antd （无），geist Browser、Phone
- 组件/数据展示 / 书封（`book`，前缀 CMP.BOOK）：营销页里用书本外形展示一组内容。；对应组件 antd （无），geist Book
- 组件/数据展示 / 评论（`comment`，前缀 CMP.COMMENT）：带作者与时间的评论条目。；对应组件 antd Comment，geist （无）
- 组件/数据展示 / 页头（`page_header`，前缀 CMP.PAGE_HEADER）：页面标题、返回、操作区。；对应组件 antd PageHeader，geist （无）
- 组件/反馈 / 警告提示（`alert`，前缀 CMP.ALERT）：贴着相关内容的提示信息。；对应组件 antd Alert，geist Note
- 组件/反馈 / 横幅（`banner`，前缀 CMP.BANNER）：页面或项目级、需要处理的通知。；对应组件 antd Alert.banner，geist Banner、Project Banner
- 组件/反馈 / 侧边抽屉（`drawer`，前缀 CMP.DRAWER）：从侧边滑出的详情或操作面板。；对应组件 antd Drawer，geist Sheet
- 组件/反馈 / 底部抽屉（`bottom_sheet`，前缀 CMP.BOTTOM_SHEET）：小屏上从底部弹出的面板。；对应组件 antd Drawer.bottom，geist Drawer
- 组件/反馈 / 全局提示（`message`，前缀 CMP.MESSAGE）：操作后的轻量反馈，自动消失。；对应组件 antd message，geist Toast
- 组件/反馈 / 通知提醒框（`notification`，前缀 CMP.NOTIFICATION）：带标题与操作的通知。；对应组件 antd notification，geist Toast.action
- 组件/反馈 / 对话框（`modal`，前缀 CMP.MODAL）：需要用户先做决定的弹窗。；对应组件 antd Modal，geist Modal
- 组件/反馈 / 危险操作确认（`destructive_modal`，前缀 CMP.DESTRUCTIVE_MODAL）：删除、吊销等操作的确认弹窗。；对应组件 antd Modal.confirm，geist Destructive Action Modal
- 组件/反馈 / 气泡确认（`popconfirm`，前缀 CMP.POPCONFIRM）：就地确认一个轻量操作。；对应组件 antd Popconfirm，geist （无）
- 组件/反馈 / 进度条（`progress`，前缀 CMP.PROGRESS）：已知总量的任务进度。；对应组件 antd Progress，geist Progress
- 组件/反馈 / 结果与错误（`result`，前缀 CMP.RESULT）：操作结果页，以及区块加载失败时的错误信息。；对应组件 antd Result，geist Error、Error Card
- 组件/反馈 / 骨架屏（`skeleton`，前缀 CMP.SKELETON）：数据加载时按最终布局占位。；对应组件 antd Skeleton，geist Skeleton
- 组件/反馈 / 加载中（`spin`，前缀 CMP.SPIN）：不确定时长的等待。；对应组件 antd Spin，geist Spinner、Loading Dots
- 组件/反馈 / 水印（`watermark`，前缀 CMP.WATERMARK）：给页面加文字或图片水印。；对应组件 antd Watermark，geist （无）
- 组件/其他 / 固钉（`affix`，前缀 CMP.AFFIX）：滚动时把元素固定在视口内。；对应组件 antd Affix，geist （无）
- 组件/其他 / 全局配置（`config_provider`，前缀 CMP.CONFIG_PROVIDER）：主题、语言与组件默认值的统一配置。；对应组件 antd ConfigProvider、App、LocaleProvider，geist GeistProvider

## 出处

- `SRC.ANTD.SPEC.FONT` Ant Design 设计规范 · 字体：https://ant.design/docs/spec/font-cn（核实 2026-11-02）
- `SRC.ANTD.SPEC.LAYOUT` Ant Design 设计规范 · 布局：https://ant.design/docs/spec/layout-cn（核实 2026-11-02）
- `SRC.ANTD.SPEC.BASICS` Ant Design 设计基础简版（官方 Wiki）：https://www.github.com/ant-design/ant-design/wiki/Ant-Design-%E8%AE%BE%E8%AE%A1%E5%9F%BA%E7%A1%80%E7%AE%80%E7%89%88（核实 2026-11-02）
- `SRC.ANTD.SPEC.PROXIMITY` Ant Design 设计规范 · 亲密性：https://ant.design/docs/spec/proximity-cn（核实 2026-11-02）
- `SRC.ANTD.SPEC.ICON` Ant Design 设计规范 · 图标：https://ant.design/docs/spec/icon-cn（核实 2026-11-02）
- `SRC.ANTD.SPEC.NAVIGATION` Ant Design 设计规范 · 导航：https://ant.design/docs/spec/navigation（核实 2026-11-02）
- `SRC.ANTD.COMP.LAYOUT` Ant Design 组件 · Layout 布局（Sider 默认宽度与收起宽度）：https://ant.design/components/layout-cn（核实 2026-11-02）
- `SRC.ANTD.THEME.FONT_SIZES` Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken）：https://app.unpkg.com/antd-v5@5.14.1/files/lib/theme/themes/shared/genFontSizes.js（核实 2026-11-02）
- `SRC.ANTDV.TYPOGRAPHY` ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距）：https://app.unpkg.com/ant-design-vue@4.1.0/files/es/typography/style/index.js（核实 2026-11-02）
- `SRC.ANTDV.PAGE_HEADER` ant-design-vue PageHeader 样式（页面标题取 fontSizeHeading4、字重 600）：https://app.unpkg.com/ant-design-vue@4.1.0/files/lib/page-header/style/index.js（核实 2026-11-02）
- `SRC.ANTDV.CARD` ant-design-vue Card 样式（卡片标题取 fontSizeLG 与 fontWeightStrong；内嵌小卡片标题取 fontSize）：https://app.unpkg.com/ant-design-vue@4.2.0/files/es/card/style/index.js（核实 2026-11-02）
- `SRC.ANTDV.ICON` ant-design-vue 图标示例（图标来自 @ant-design/icons-vue）：https://github.com/vueComponent/ant-design-vue/blob/b3ed6ddd9cff24d4f122f50e19c00b6eb2c9e668/components/icon/demo/index.vue（核实 2026-11-02）
- `SRC.POMASTER.UI_SPEC` pomaster 主题硬规范 · UI 呈现与设计：repo:packages/cli/seeds/specs/hard/themes/ui-presentation-and-design.md（核实 2026-11-02）
- `SRC.POMASTER.SURFACES` pomaster 脚手架部署面默认档（分页默认值与页长上限）：repo:packages/cli/src/scaffold-surfaces.ts（核实 2026-11-02）
- `SRC.POMASTER.PRESET` pomaster 预设约定：repo:packages/cli/seeds/design-standards/antd.yaml（核实 2026-11-02）
- `SRC.ANTD.SPEC.FEEDBACK` Ant Design 设计规范 · 反馈：https://ant.design/docs/spec/feedback-cn.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.DATA_ENTRY` Ant Design 设计规范 · 数据录入：https://ant.design/docs/spec/data-entry.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.DATA_DISPLAY` Ant Design 设计规范 · 数据展示：https://ant.design/docs/spec/data-display-cn.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.DATA_FORMAT` Ant Design 设计规范 · 数据格式：https://ant.design/docs/spec/data-format-cn.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.COPYWRITING` Ant Design 设计规范 · 文案：https://ant.design/docs/spec/copywriting-cn.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.BUTTONS` Ant Design 设计规范 · 按钮：https://ant.design/docs/spec/buttons-cn.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.DATA_LIST` Ant Design 设计规范 · 数据列表：https://ant.design/docs/spec/data-list-cn.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.ALIGNMENT` Ant Design 设计原则 · 对齐：https://ant.design/docs/spec/alignment（核实 2026-11-02）
- `SRC.ANTD.SPEC.CONTRAST` Ant Design 设计原则 · 对比：https://ant.design/docs/spec/contrast.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.REPETITION` Ant Design 设计原则 · 重复：https://ant.design/docs/spec/repetition（核实 2026-11-02）
- `SRC.ANTD.SPEC.DIRECT` Ant Design 设计原则 · 直截了当：https://ant.design/docs/spec/direct.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.STAY` Ant Design 设计原则 · 足不出户：https://ant.design/docs/spec/stay.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.LIGHTWEIGHT` Ant Design 设计原则 · 简化交互：https://ant.design/docs/spec/lightweight（核实 2026-11-02）
- `SRC.ANTD.SPEC.INVITATION` Ant Design 设计原则 · 提供邀请：https://ant.design/docs/spec/invitation（核实 2026-11-02）
- `SRC.ANTD.SPEC.TRANSITION` Ant Design 设计原则 · 巧用过渡：https://ant.design/docs/spec/transition.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.REACTION` Ant Design 设计原则 · 即时反应：https://ant.design/docs/spec/reaction（核实 2026-11-02）
- `SRC.ANTD.SPEC.DETAIL_PAGE` Ant Design 模板文档 · 详情页：https://ant.design/docs/spec/detail-page-cn.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.VISUALIZATION` Ant Design 模板文档 · 数据可视化页：https://ant.design/docs/spec/visualization-page-cn（核实 2026-11-02）
- `SRC.POMASTER.PERF_SPEC` pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标）：repo:packages/cli/seeds/specs/hard/themes/performance-and-capacity.md（核实 2026-11-02）
- `SRC.POMASTER.VUE3_SPEC` pomaster 技术栈规范 · Vue 3（状态与路由选官方方案）：repo:packages/cli/seeds/specs/hard/stacks/vue3/vue3-framework-overlay.md（核实 2026-11-02）
- `SRC.ANTD.SPEC.COLORS` Ant Design 设计规范 · 色彩：https://ant.design/docs/spec/colors-cn（核实 2026-11-06）
- `SRC.ANTD.SPEC.SHADOW` Ant Design 设计规范 · 阴影：https://ant.design/docs/spec/shadow-cn（核实 2026-11-06）
- `SRC.ANTD.SPEC.MOTION` Ant Design 设计规范 · 动效：https://ant.design/docs/spec/motion-cn（核实 2026-11-06）
- `SRC.ANTD.COLORS_GENERATE` @ant-design/colors 6.0.0 色板算法（ant-design-vue 4.2.6 的依赖）：https://unpkg.com/@ant-design/colors@6.0.0/dist/index.esm.js（核实 2026-11-06）
- `SRC.ANTDV.THEME_SEED` ant-design-vue 4.2.6 主题种子与派生（seed、genControlHeight、genRadius、genCommonMapToken）：https://unpkg.com/ant-design-vue@4.2.6/es/theme/themes/seed.js（核实 2026-11-06）
- `SRC.ANTD.COMP.BUTTON` Ant Design 组件 · Button 按钮：https://ant.design/components/button-cn（核实 2026-11-06）
- `SRC.ANTDV.BUTTON` ant-design-vue · Button 按钮：https://antdv.com/components/button-cn（核实 2026-11-06）
- `SRC.POMASTER.STACK_DECISION` 项目选型决策（Owner 2026-11-06：服务端数据用 TanStack Query，全局 store Vue 用 Pinia、React 用 Zustand）：repo:docs/design-standard.md（核实 2026-11-06）
