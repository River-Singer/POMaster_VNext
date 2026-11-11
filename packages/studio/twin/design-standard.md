# 前端设计规范（Ant Design，ant-design-vue@4.2.6）

> Storybook「规范」分区的 AI 可读孪生，由 packages/studio/scripts/lib/standard.mjs 生成，与页面同源。不要手改。
> 规范指纹 `sha256:292c4dfae3707408313085a0db145f5b82ed060c4531b40cfcab8411a760eae4`；状态 origin=preset。
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

- 执行：机器门禁 `style.no-raw-color`；适用：管理侧与用户侧
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

- 执行：机器门禁 `style.font-family-token`；适用：管理侧与用户侧
- 参数：无衬线字体族 `p.sans` = -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'（token `typography.family.sans`）
- 参数：等宽字体族 `p.mono` = 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace（token `typography.family.mono`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 在业务页面创建第二套视觉语言。」
- 示例（这样做）：正文与代码
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-typography--type-family

### TYPE.SCALE 字阶

字号只取字阶 12、14、16、20、24、30、38（46、56、68 只用于展示型页面），每级行高是字号加 8。正文 14 号、行高 22。一个系统里常用的字号控制在 5 种以内。

- 执行：机器门禁 `style.font-size-scale`；适用：管理侧与用户侧
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

- 执行：机器门禁 `style.font-weight-allowed`；适用：管理侧与用户侧
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

- 执行：机器门禁 `style.no-raw-color`；适用：管理侧与用户侧
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
- 参数：每行字数上限 `p.max_chars` = 40 字（pomaster 推荐默认（数值类决策位的缺省取值））
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

- 执行：机器门禁 `markup.heading-level-max`；适用：管理侧
- 参数：h1 页面标题 `p.h1_size` = 20px（ant-design-vue PageHeader 样式（页面标题取 fontSizeHeading4、字重 600））
- 参数：h2 卡片 / 区块标题 `p.h2_size` = 16px（ant-design-vue Card 样式（卡片标题取 fontSizeLG 与 fontWeightStrong；内嵌小卡片标题取 fontSize））
- 参数：h3 分组标题 `p.h3_size` = 14px（ant-design-vue Card 样式（卡片标题取 fontSizeLG 与 fontWeightStrong；内嵌小卡片标题取 fontSize））
- 参数：标题字重 `p.weight` = 600（token `typography.weight.semibold`）
- 示例（这样做）：页面、区块、分组三级——a-card 的 title 不是标题元素；卡片标题要进页面大纲时，在 title 插槽里放 h2。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-headings--heading-app-levels

### HEADING.SINGLE_H1 每个视图一个 h1

每个页面视图（一个路由页面，或一个全屏抽屉、模态）只有一个一级标题，内容就是这个页面叫什么；路由切换后同步更新浏览器标签页标题。

- 执行：机器门禁 `markup.single-h1`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「路由/页面切换后必须更新 document.title 并宣布页面变化」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-headings--heading-single-h1

### HEADING.ORDER 标题不跳级

标题的语义层级与视觉层级一致，逐级下降：h1 下面是 h2，h2 下面是 h3，不能从 h1 直接跳到 h3。

- 执行：机器门禁 `markup.heading-order`；适用：管理侧与用户侧
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

- 执行：机器门禁 `icon.single-library`；适用：管理侧与用户侧
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

- 执行：机器门禁 `style.no-raw-color`；适用：管理侧与用户侧
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

- 执行：机器门禁 `markup.icon-button-label`；适用：管理侧与用户侧
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

## 基础 / 圆角管理（RADIUS）

圆角只取规范的档位；每类组件用哪一档有对照表；同一组件的尺寸越大圆角越大但有上限；嵌套时内层 = 外层 − 内边距；贴边与相接的那侧没有圆角；整圆只给短小的元素；媒体随容器裁切。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-radius--overview

### RADIUS.TOKENS 只用规范的圆角档

圆角值只取 MATERIAL.RADIUS 的三档（radius.sm / md / lg = 4 / 6 / 8），写成 token；组件库的圆角经主题 token（borderRadius、borderRadiusSM、borderRadiusLG）统一调，不在页面里逐个覆盖；不写 3px、5px、10px 这类档位外的值。

- 执行：机器门禁 `style.radius-token`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 示例（这样做）：用 token
- 示例（别这样做）：档位外的值
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-radius--radius-tokens

### RADIUS.BY_COMPONENT 组件与圆角对照

每类组件用哪一档圆角按对照表执行，新组件先归到表里的一类再取值；同一页面上同类组件的圆角一致。

- 执行：人工评审；适用：管理侧与用户侧
- 对照表「组件用哪一档圆角」（组件 → 用途）：
  - `小尺寸按钮、标签、复选框（borderRadiusSM）`：4px
  - `按钮、输入框、选择器、提示气泡（borderRadius）`：6px
  - `大尺寸控件、卡片、对话框、下拉面板（borderRadiusLG）`：8px
  - `头像、徽标计数、开关、进度条`：整圆
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-radius--radius-by-component

### RADIUS.SIZE_SCALE 尺寸越大圆角越大，但有上限

同一组件的小、中、大三种尺寸分别用 sm / md / lg 档（按钮、输入框、选择器一致）；容器越大圆角可以越大，但不超过 lg 档；不按像素尺寸按比例算圆角。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-radius--radius-size-scale

### RADIUS.NESTED 嵌套时内层 = 外层 − 内边距

圆角容器里再放圆角元素时，内层圆角 = 外层圆角 − 两者之间的内边距（不小于 0），这样角落同心；内层直接贴边（没有内边距）时由外层裁切（overflow: hidden），内层不再单写圆角。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：内层减去内边距
- 示例（别这样做）：内外同样的圆角
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-radius--radius-nested

### RADIUS.FLUSH 贴边与相接的那侧没有圆角

元素贴着容器边缘时，贴边那一侧不要圆角（卡片顶部的封面图只保留上面两个角，表格贴满卡片时由卡片裁切）；按钮组、输入框与前后缀相接处圆角为 0，只保留整组外侧的圆角（用 a-space-compact、addonBefore / addonAfter，不手拼）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-radius--radius-flush

### RADIUS.PILL 整圆只给短小的元素

整圆（胶囊、圆形）只用于徽标、计数、标签型状态、开关、进度条和头像；按钮、输入框不做胶囊，除非整个产品在主题里统一改；圆形图标按钮宽高相等。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-radius--radius-pill

### RADIUS.MEDIA 媒体随容器裁切

图片、视频、地图、图表在圆角容器里由容器裁切，不各自再加圆角；单独出现的缩略图用控件那一档；头像用整圆；用户上传的图片不加阴影、描边之外的装饰。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-radius--radius-media

## 基础 / 投影（ELEV）

投影只表达离页面多远：四个层级各一个阴影 token；页面内的区块用边框不用阴影；不手写阴影、不做发光；悬停最多升一级；阴影层级与叠放层级同序；深色主题改用更亮的表面；吸顶与固定列的阴影只在滚动后出现。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-elevation--overview

### ELEV.LEVELS 四个层级各一个阴影

层级固定为四层：0 层贴在页面上；1 层是悬停抬起与吸顶后的元素；2 层是下拉、气泡、悬浮按钮；3 层是对话框、抽屉、通知。每层只有一个阴影 token，组件按所在层级取用（方向规则见 MATERIAL.SHADOWS）。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：第 1 层 `p.level_1` = 0 1px 2px -2px rgba(0,0,0,0.16), 0 3px 6px 0 rgba(0,0,0,0.12), 0 5px 12px 4px rgba(0,0,0,0.09)（token `elevation.card`）
- 参数：第 2 层 `p.level_2` = 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)（token `elevation.popover`）
- 参数：第 3 层 `p.level_3` = 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)（token `elevation.modal`）
- 对照表「四个层级」（层级 → 用途）：
  - `第 0 层：贴在页面上（区块、表格、未悬停的卡片）`：无阴影，用边框或底色区分
  - `第 1 层：可点卡片悬停、吸顶表头滚动后`：elevation.card
  - `第 2 层：下拉、气泡卡片、悬浮按钮`：elevation.popover
  - `第 3 层：对话框、抽屉、通知`：elevation.modal（默认主题与第 2 层同值）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-elevation--elev-levels

### ELEV.FLAT_FIRST 页面内的区块用边框不用阴影

页面里的区块、表格、表单分组用边框或底色区分，不用阴影；阴影只给浮在页面上、或者正在被拖动的东西；同一个元素不同时用粗边框和大阴影。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-elevation--elev-flat-first

### ELEV.ONE_TOKEN 不手写阴影、不做发光

阴影只取 elevation token（或组件库的 boxShadow 一类主题 token），不手写 box-shadow；不做彩色、发光、内阴影装饰；光从上方来，阴影向下（特殊位置按 MATERIAL.SHADOWS）。

- 执行：机器门禁 `style.shadow-token`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 示例（别这样做）：彩色发光阴影
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-elevation--elev-one-token

### ELEV.HOVER 悬停最多升一级

可点的卡片悬停时从 0 层升到 1 层（见 HOVER.SUBTLE），不跳到 2、3 层；浮层本身悬停不再变化；拖动中的元素升到 2 层，放下后回到原层。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-elevation--elev-hover

### ELEV.Z_PAIR 阴影层级与叠放层级同序

阴影层级和叠放层级（z-index，见 LAYOUT.Z_INDEX）同序：叠放在下面的元素不能有更重的阴影；同一层的两个浮层互相覆盖时，后出现的在上面。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-elevation--elev-z-pair

### ELEV.DARK 深色主题改用更亮的表面

深色背景上阴影几乎看不见，深色主题里层级改用更亮一档的表面色加细边框表达；阴影 token 随主题切换，组件不判断当前主题。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「表格、图表、弹层、焦点和状态随主题同步。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-elevation--elev-dark

### ELEV.STICKY 吸顶与固定列的阴影只在滚动后出现

吸顶的表头、工具栏和固定列，只有在内容滚到它下面时才显示分隔阴影（a-table 的固定列与 sticky 表头就是这样），静止时不显示。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-elevation--elev-sticky

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

- 执行：机器门禁 `style.spacing-scale`；适用：管理侧与用户侧
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

- 执行：机器门禁 `style.no-raw-z-index`；适用：管理侧与用户侧
- 参数：layers `p.layers` = base → 0，sticky → 10，header → 100，popup_base → 1000（Ant Design · 定制主题（Seed Token：zIndexBase 0、zIndexPopupBase 1000））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「z-index 只能来自层级 token。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-layout--layout-z-index

## 基础 / 栅格（GRID）

24 列栅格；列间距固定、列宽伸缩；响应式只用规范断点。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-grid--overview

### GRID.COLUMNS 栅格列数

页面区块按 24 列栅格切分，每个区块从某一列开始、到某一列结束；不用小数跨度或百分比宽度拼区块。

- 执行：机器门禁 `grid.span-range`；适用：管理侧与用户侧
- 参数：列数 `p.columns` = 24 个（Ant Design 设计规范 · 布局）
- 示例（这样做）：三个等宽区块各占 8 列
- 示例（别这样做）：用百分比宽度拼区块——百分比宽度不对齐栅格，和页面其他区块的列线错位。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-grid--grid-columns

### GRID.GUTTER 列间距

列间距（gutter）是固定值，不随窗口缩放，只取 16 或 24；窗口变化时变的是列宽，不是间距。

- 执行：机器门禁 `grid.gutter-allowed`；适用：管理侧与用户侧
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

- 执行：机器门禁 `style.breakpoint-allowed`；适用：管理侧与用户侧
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

- 执行：机器门禁 `style.spacing-scale`；适用：管理侧与用户侧
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

## 基础 / 点击反馈（PRESS）

每个可点的元素都有默认、悬停、按下、聚焦与禁用；按下的瞬间就有反馈，颜色加深一档、不移动不变尺寸；波纹只用组件库自带的；时长取快档；触屏去掉点击延迟、目标够大；键盘触发同样的反馈；禁用与加载中不响应；减少动效时只保留颜色变化。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-press-feedback--overview

### PRESS.STATES 可点的元素都有五态

每个可点的元素都设计默认、悬停、按下、聚焦、禁用五态；按下态在按下的瞬间出现，不等请求返回；松开后回到悬停态。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：按下态——按住按钮看按下态；松开回到悬停态。
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「hover、active、focus、disabled、loading、empty、error 状态完整。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-press-feedback--press-states

### PRESS.VISUAL 按下时颜色加深一档

按下时颜色比悬停再深一档（主题的 colorPrimaryActive 一类 token，组件已内置）；不移动位置、不改尺寸、不改边框宽度；antd 组件不另加缩放。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-press-feedback--press-visual

### PRESS.WAVE 波纹只用组件库自带的

按钮、开关、复选框自带点击波纹（Wave），保持开启、不另写 ripple；列表行、表格行、卡片不加波纹，按下用背景色变化表示。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-press-feedback--press-wave

### PRESS.TIMING 按下即时、回弹取快档

按下态即时出现（不加过渡延迟），松开回弹用快档时长；点击动画不长于 200ms，也不阻塞下一次点击。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：回弹时长 `p.release` = 0.1s（token `motion.fast`）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-press-feedback--press-timing

### PRESS.TOUCH 触屏：无延迟、目标够大

可点元素设 touch-action: manipulation 去掉双击缩放带来的点击延迟；去掉系统的灰色点按高亮时必须提供自己的按下态；点击目标至少 24×24 CSS px（建议 44×44），相邻目标之间留出间距。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：最小点击目标 `p.target_min` = 24px（pomaster 主题硬规范 · UI 呈现与设计）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「触控目标尺寸至少 24×24 CSS px，且目标之间提供足够间距（WCAG 2.5.8）；建议达到 44×44（AAA）。」
- 示例（这样做）：触屏点按
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-press-feedback--press-touch

### PRESS.KEYBOARD 键盘触发同样的反馈

可点元素用真正的 button / a 元素，空格与回车能触发并显示按下态；用 div 模拟按钮时要补上 role、tabindex 和键盘处理，否则不算可点。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-press-feedback--press-keyboard

### PRESS.DISABLED 禁用与加载中不响应

禁用和加载中的元素没有悬停、按下效果，点击不触发任何反馈动画；禁用的光标为 not-allowed；加载中的按钮保持宽度不变（见 CMP.BUTTON.LOADING）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-press-feedback--press-disabled

### PRESS.REDUCED 减少动效时只保留颜色变化

减少动效模式下去掉缩放与波纹，保留按下时的颜色变化；状态仍然看得出来。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-press-feedback--press-reduced

## 基础 / 焦点环（FOCUS）

焦点只在键盘聚焦时显示且永远不去掉；全站一种焦点样式；与相邻颜色有足够对比；不被裁切、不被吸顶栏遮住；焦点顺序与视觉顺序一致，弹层进出时焦点有去处；焦点环跟随元素圆角。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-focus-ring--overview

### FOCUS.VISIBLE 键盘聚焦时显示，永远不去掉

焦点样式写在 :focus-visible 上（鼠标点击不出现，键盘聚焦一定出现）；不写 outline: none 而不给同等可见的替代。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：用 Tab 键依次聚焦——点击不出焦点环，按 Tab 才出；自定义元素与组件同一种样式。
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 移除焦点轮廓而无同等级可见替代。」
- 示例（别这样做）：去掉焦点不给替代
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-focus-ring--focus-visible

### FOCUS.STYLE 全站一种焦点样式

组件自带的焦点样式（主题的 controlOutline 外发光与主色描边）不覆盖；自己写的可点元素用同一种：2px 主色轮廓、外偏移 2px，写成一个共享的类，不各写一份。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：轮廓宽度 `p.width` = 2px（pomaster 预设约定）
- 参数：轮廓偏移 `p.offset` = 2px（pomaster 预设约定）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「SHOULD 提供统一、设计系统级别的 focus indicator token（颜色、宽度、offset、:focus-visible）。」
- 示例（这样做）：共享的焦点类
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-focus-ring--focus-style

### FOCUS.CONTRAST 与相邻颜色对比足够

焦点指示与相邻背景的对比度至少 3:1；在深色、彩色背景上换用能看清的颜色，不靠颜色变化本身表示焦点。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源；文本对比度至少 4.5:1，大文本至少 3:1，UI 组件/图标边界至少 3:1（WCAG 1.4.1 / 1.4.3 / 1.4.11）。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-focus-ring--focus-contrast

### FOCUS.NOT_OBSCURED 不被裁切、不被遮住

overflow: hidden 的容器里改用内收的轮廓（负偏移或 inset 阴影），避免焦点环被裁掉；吸顶栏、固定底栏不能盖住获得焦点的元素（给滚动容器设 scroll-padding）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「焦点必须可见，且不得被吸顶栏、浮层、sticky 元素完全遮挡（WCAG 2.4.7 / 2.4.11）。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-focus-ring--focus-not-obscured

### FOCUS.ORDER 焦点顺序与去处

Tab 顺序与视觉顺序一致，不用正数 tabindex；弹层、抽屉、对话框打开时焦点进入，关闭后回到触发它的元素；只有模态层把焦点困在里面。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「弹层、抽屉、对话框打开后必须接管焦点，关闭后返回触发元素；背景不得保持可 Tab（WCAG 2.4.3 / 2.1.2）。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-focus-ring--focus-order

### FOCUS.RADIUS 焦点环跟随元素圆角

焦点轮廓的圆角与元素一致（outline 会跟随 border-radius；用 box-shadow 画焦点时同样带圆角）；圆形按钮的焦点环也是圆的。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-foundations-focus-ring--focus-radius

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

- 执行：机器门禁 `markup.icon-button-label`；适用：管理侧与用户侧
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

## 组件/通用 / 分裂按钮（CMP.SPLIT_BUTTON）

主操作 + 一组相关操作：左边直接执行最常用的那个，右边箭头展开其余选项；箭头按钮有自己的名称。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-split-button--overview
对应组件：antd Dropdown.Button；geist Split Button
实验场：`a-dropdown-button`，属性 type=default|primary，size=small|middle|large，disabled=布尔（https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-split-button--playground）

### CMP.SPLIT_BUTTON.WHEN 什么时候用分裂按钮

一个主操作有几种变体（立即派单 / 定时派单 / 批量派单、导出 Excel / CSV / PDF），而其中一种最常用时，用分裂按钮：左边执行最常用的，右边展开其余；几个操作同等重要时平铺成按钮，不藏进菜单。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：最常用的在左边
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-split-button--cmp-split-button-when

### CMP.SPLIT_BUTTON.MENU_LABEL 箭头按钮要有名称

右边的箭头是独立的按钮，要有可读名称（「更多派单方式」），键盘能单独聚焦、回车展开；菜单项的文字是完整的动作，不只写名词。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-split-button--cmp-split-button-menu-label

### CMP.SPLIT_BUTTON.LIMIT 菜单项克制

菜单里放 2 到 7 项；危险操作放最后并用分隔线隔开；不在菜单里再套子菜单；左边的主操作不能是危险操作。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-split-button--cmp-split-button-limit

## 组件/通用 / 复制按钮（CMP.COPY_BUTTON）

复制一段文本（编号、命令、链接、密钥）：结果即时可见、读屏可知，失败给出替代办法。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-copy-button--overview
对应组件：antd Typography.copyable；geist Copy Button、Text With Copy Button

### CMP.COPY_BUTTON.WHEN 什么时候给复制按钮

用户要把一段文本带去别处（订单号、车牌号、命令、邀请链接、API 密钥）时，在文本旁边放复制按钮；可复制的文本本身也保持可选中，复制按钮只是快捷方式。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：文本旁放复制按钮
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-copy-button--cmp-copy-button-when

### CMP.COPY_BUTTON.FEEDBACK 复制成功即时反馈

点了之后图标立即变成对勾、约 2 秒后复原，同时用礼貌的 aria-live 播报「已复制」；不额外弹 Toast（一次复制不值得打断）。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：对勾停留 `p.reset` = 2000ms（pomaster 预设约定）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-copy-button--cmp-copy-button-feedback

### CMP.COPY_BUTTON.FAILURE 剪贴板不可用时

浏览器不给剪贴板权限（非安全上下文、被策略禁止）时说明原因，并把文本选中方便用户手动复制；不静默失败。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-copy-button--cmp-copy-button-failure

### CMP.COPY_BUTTON.LABEL 纯图标按钮带名称

复制按钮通常只有图标，必须带写明对象的名称（「复制订单号」，不是「复制」）；同一行有多个可复制内容时，名称能区分它们。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-copy-button--cmp-copy-button-label

## 组件/通用 / 悬浮按钮（CMP.FLOAT_BUTTON）

悬浮在页面角落的全局入口（联系客服、反馈、回到顶部）：一页最多一组，不遮挡内容，带名称。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-float-button--overview
对应组件：antd FloatButton；geist （无）

### CMP.FLOAT_BUTTON.WHEN 只放全局辅助入口

悬浮按钮只放和当前页面内容无关、随时可能用到的入口：联系客服、提交反馈、回到顶部；页面的主操作放在页头或工具栏，不做成悬浮按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：全局辅助入口
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-float-button--cmp-float-button-when

### CMP.FLOAT_BUTTON.PLACEMENT 位置与避让

固定在右下角，距边缘 24px 起；不遮挡页脚、分页和表格最后一行（页面底部留出等高的内边距）；移动端避开安全区与底部导航。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：距边缘 `p.offset` = 24px（pomaster 预设约定）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-float-button--cmp-float-button-placement

### CMP.FLOAT_BUTTON.LIMIT 一页最多一组

一页最多一个悬浮按钮，或一组（展开后不超过 3 个）；组里的每一项都带名称与文字提示。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-float-button--cmp-float-button-limit

### CMP.FLOAT_BUTTON.BACK_TOP 回到顶部

「回到顶部」在页面滚动超过一屏后才出现；点了之后平滑滚回顶部（减少动效时直接跳转），并把焦点交给页面标题。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-float-button--cmp-float-button-back-top

## 组件/通用 / 排版文本（CMP.TEXT）

文字只取排版档位与语义色调；省略要能看到全文；行内代码、标记、键盘各用对应语义。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-typography-text--overview
对应组件：antd Typography；geist Text、Label
实验场：`a-typography-text`，属性 type=secondary|success|warning|danger，strong=布尔，code=布尔（https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-typography-text--playground）

### CMP.TEXT.SCALE 只用排版档位

文字的字号、字重、行高只取排版 token（正文 14、小号 12、标题档位），用 a-typography 的标题与文本组件，不在页面里写 font-size。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：标题、正文、次要文字
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-typography-text--cmp-text-scale

### CMP.TEXT.TONE 语义色调

文字颜色只用语义色调：默认、次要、成功、警告、危险；危险色只用于错误与危险操作的说明，不用来强调普通内容；状态不只靠颜色，文字本身要说清。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-typography-text--cmp-text-tone

### CMP.TEXT.ELLIPSIS 省略要能看到全文

单行省略、多行省略都要让用户看到全文（悬停提示、展开按钮或 title）；路径、编号这类结尾有区分度的内容用中间省略。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-typography-text--cmp-text-ellipsis

### CMP.TEXT.SEMANTICS 行内语义

行内代码用 code，键盘按键用 keyboard，删除线、下划线、标记各用对应属性（delete / underline / mark），不只改样式；可复制、可编辑用 copyable / editable。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-typography-text--cmp-text-semantics

## 组件/通用 / 代码块（CMP.CODE_BLOCK）

多行代码与配置：文件名标题栏 + 复制；不折行、横向滚动；等宽字体；高亮只用于讲解。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-code-block--overview
对应组件：antd （无）；geist Code Block、Code

### CMP.CODE_BLOCK.WHEN 什么时候用代码块

多行代码、配置文件、接口返回示例用代码块；一两个词的代码写在行内（code）；要在终端执行的命令用命令片段（snippet），不用代码块。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：文件名 + 复制 + 等宽
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-code-block--cmp-code-block-when

### CMP.CODE_BLOCK.HEADER 标题栏

标题栏写文件名或语言，右侧是带名称的复制按钮（「复制代码」）；复制的是代码原文，不带行号。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-code-block--cmp-code-block-header

### CMP.CODE_BLOCK.WRAP 不折行，横向滚动

代码不自动折行（折行会改变缩进的含义），超宽时代码区横向滚动，滚动区可用键盘聚焦；字体取等宽字体 token，字号比正文小一档。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-code-block--cmp-code-block-wrap

### CMP.CODE_BLOCK.HIGHLIGHT 高亮只用于讲解

需要指出某几行时用行高亮加文字说明，不只靠颜色；语法着色可选，颜色取主题 token，不引入整套高亮主题色。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-code-block--cmp-code-block-highlight

## 组件/通用 / 命令片段（CMP.SNIPPET）

要复制到终端执行的命令：行首提示符不进剪贴板；一行一个命令；整段可复制。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-snippet--overview
对应组件：antd （无）；geist Snippet

### CMP.SNIPPET.WHEN 什么时候用命令片段

让用户在终端里执行的命令（安装、启动、迁移）用命令片段；配置文件、多行脚本用代码块。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：提示符不进剪贴板
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-snippet--cmp-snippet-when

### CMP.SNIPPET.PROMPT 提示符与输出

行首的「$」提示符只是标识，不选中、不进剪贴板；命令的输出不放在同一个片段里，需要展示输出时另起一个代码块。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-snippet--cmp-snippet-prompt

### CMP.SNIPPET.MULTI_LINE 一行一个命令

多个命令分行写，每行一个，按执行顺序排列；不用 && 把不相关的命令串成一行；需要逐条执行时每条单独可复制。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-snippet--cmp-snippet-multi-line

### CMP.SNIPPET.PLACEHOLDER 占位写法

命令里需要用户替换的部分用大写占位（YOUR_API_TOKEN、<项目目录>）并在片段下方说明；不放真实密钥。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-snippet--cmp-snippet-placeholder

## 组件/通用 / 键盘按键（CMP.KBD）

快捷键提示：用键盘按键的语义标注；按平台显示 ⌘ 或 Ctrl；快捷键只是加速，不是唯一入口。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-kbd--overview
对应组件：antd Typography.keyboard；geist Keyboard Input

### CMP.KBD.WHEN 什么时候显示快捷键

常用操作的快捷键显示在菜单项右侧、按钮的文字提示里或帮助面板中；不在页面正文里大量罗列。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：菜单项右侧显示快捷键
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-kbd--cmp-kbd-when

### CMP.KBD.PLATFORM 按平台显示

macOS 显示 ⌘ ⌥ ⇧，Windows / Linux 显示 Ctrl Alt Shift；按用户平台判断，不两套都写；非 QWERTY 键盘布局下按实际键位提示。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-kbd--cmp-kbd-platform

### CMP.KBD.COMBO 组合键的写法

组合键每个键单独一个按键标注，键与键之间用不换行空格或「+」连接，整组不被折行拆开。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-kbd--cmp-kbd-combo

### CMP.KBD.NOT_ONLY 不是唯一入口

每个快捷键对应的操作在界面上都有可点击的入口；快捷键不和浏览器、读屏软件的常用快捷键冲突。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-general-kbd--cmp-kbd-not-only

## 组件/布局 / 分割线（CMP.DIVIDER）

分隔两块内容：优先用间距分组，分隔线只在间距不够时用；带文字的分隔线用于长表单分段。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-divider--overview
对应组件：antd Divider；geist Separator

### CMP.DIVIDER.SPACING_FIRST 先用间距，再用线

相关内容用间距分组（PROXIMITY），只有间距不足以区分时才加分隔线；卡片之间、列表项之间不同时用间距和线。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：线只在需要时
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-divider--cmp-divider-spacing-first

### CMP.DIVIDER.TEXT 带文字的分隔线用于分段

长表单或长详情里，带文字的分隔线可以作为轻量的分段标题；文字左对齐，不居中。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-divider--cmp-divider-text

### CMP.DIVIDER.VERTICAL 竖线分隔行内元素

竖向分隔线用于分隔同一行的文字链接或元信息（「编辑 | 复制」），高度与文字一致。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-divider--cmp-divider-vertical

## 组件/布局 / 弹性布局（CMP.FLEX）

一维排布：方向、对齐、换行与间距；间距只取档位，不用外边距拼。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-flex--overview
对应组件：antd Flex；geist （无）

### CMP.FLEX.USE 一维排布用弹性布局

一行或一列里的元素排布用 a-flex（vertical、justify、align、gap、wrap），二维排布用栅格；不靠 float 或 inline-block 加外边距。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：方向、对齐与间距
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-flex--cmp-flex-use

### CMP.FLEX.GAP 间距只取档位

元素之间的间距用 gap，取间距阶梯（小 8、中 16、大 24）；不在子元素上各自写外边距。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-flex--cmp-flex-gap

### CMP.FLEX.WRAP 换行

可能放不下的行允许换行，换行后行间距与列间距一致；不让内容溢出产生横向滚动。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-flex--cmp-flex-wrap

## 组件/布局 / 间距组合（CMP.SPACE）

行内元素之间的统一间距：按钮组、标签组、表单行内控件用间距组件而不是各自写外边距。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-space--overview
对应组件：antd Space；geist （无）

### CMP.SPACE.USE 用间距组件，不手写外边距

一组并排的按钮、标签、行内控件用 a-space 统一间距（size 取 small / middle / large 或间距阶梯的值），不在每个元素上写 margin；需要相接（按钮组、输入框加按钮）用 a-space-compact。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：统一间距
- 示例（别这样做）：各自写外边距
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-space--cmp-space-use

### CMP.SPACE.WRAP 放不下就换行

间距组可能放不下时允许换行（wrap），换行后的行间距与列间距一致；不出现横向滚动。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-space--cmp-space-wrap

### CMP.SPACE.ALIGN 对齐基线

不同高度的元素并排时按中线对齐（align=center），文字与输入框并排时按基线对齐。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-space--cmp-space-align

## 组件/布局 / 栅格组件（CMP.GRID）

二维排布：按栏数切分、栏间距取档位、随断点变化；内容区不靠固定像素宽度。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-grid-component--overview
对应组件：antd Row、Col；geist Grid

### CMP.GRID.COLUMNS 栏数

用 a-row / a-col 的 24 栏栅格，span 之和每行不超过 24；常用切分 24、12+12、8+8+8、6×4。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：按栏数切分
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-grid-component--cmp-grid-columns

### CMP.GRID.GUTTER 栏间距

栏间距只取规范的档位（16 / 24），同一页面统一；横向与纵向间距一致时用同一个值。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-grid-component--cmp-grid-gutter

### CMP.GRID.RESPONSIVE 随断点变化

窄屏下多栏改为少栏或单栏（按断点 token 切换 span），不缩小字号硬塞；栅格只负责版面，组件内部的排布用弹性布局。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-grid-component--cmp-grid-responsive

## 组件/布局 / 页面布局（CMP.LAYOUT）

后台页面骨架：顶栏 + 可收起的侧栏 + 内容区；侧栏状态记住；固定的顶栏不遮挡焦点。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-page-layout--overview
对应组件：antd Layout；geist （无）

### CMP.LAYOUT.SHELL 页面骨架

管理侧页面用 a-layout：顶栏（品牌、全局搜索、用户菜单）+ 左侧 a-layout-sider（主导航）+ 内容区；内容区内边距取间距 token，背景用页面底色、内容卡片用容器底色。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：顶栏 + 侧栏 + 内容
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-page-layout--cmp-layout-shell

### CMP.LAYOUT.SIDER 侧栏收起与记忆

侧栏可以收起为只有图标的窄栏（收起按钮带名称与 aria-expanded），收起状态按用户记住；窄屏下侧栏变成抽屉。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-page-layout--cmp-layout-sider

### CMP.LAYOUT.STICKY 固定的顶栏不遮挡焦点

顶栏固定时，页面设置与顶栏等高的 scroll-padding-top，锚点跳转与键盘聚焦的元素不被顶栏盖住。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-page-layout--cmp-layout-sticky

### CMP.LAYOUT.CONTENT 内容区宽度

表单与详情类页面的内容区设最大宽度，避免超宽屏上一行过长；列表与看板类页面铺满可用宽度。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-page-layout--cmp-layout-content

## 组件/布局 / 滚动区（CMP.SCROLLER）

局部滚动区：只在必要时用；能用键盘滚动、有名称；不嵌套滚动；滚动条可见。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-scroller--overview
对应组件：antd （无）；geist Scroller

### CMP.SCROLLER.WHEN 只在必要时局部滚动

固定高度的面板（侧栏列表、下拉、对话框正文、日志）才用局部滚动；页面主体随页面滚动，不把整页内容塞进一个固定高度的滚动框。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：固定高度的列表
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-scroller--cmp-scroller-when

### CMP.SCROLLER.KEYBOARD 键盘可滚、有名称

滚动区可以被键盘聚焦（tabindex=0）并有可读名称（role=region + aria-label），方向键与翻页键能滚动；聚焦时有焦点环。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-scroller--cmp-scroller-keyboard

### CMP.SCROLLER.NESTING 不嵌套滚动

避免滚动区里再套滚动区；对话框、抽屉里的滚动设 overscroll-behavior: contain，滚到头不带动底下的页面。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-scroller--cmp-scroller-nesting

### CMP.SCROLLER.SCROLLBAR 滚动条可见

有可滚动内容时保留可见的滚动条（可以变细），不隐藏滚动条只留拖拽手势；内容不足时不出现多余的滚动条。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-layout-scroller--cmp-scroller-scrollbar

## 组件/导航 / 锚点（CMP.ANCHOR）

长页面的本页目录：链接到页内标题，当前段落高亮；不用它做跨页导航。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-anchor--overview
对应组件：antd Anchor；geist （无）

### CMP.ANCHOR.WHEN 什么时候用锚点

超过三屏、分成多个段落的长页面（规范页、详情页、设置页）在右侧放本页目录；目录只链接本页的标题，跨页导航用侧栏或标签页。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：右侧本页目录
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-anchor--cmp-anchor-when

### CMP.ANCHOR.ACTIVE 当前段落高亮

滚动时高亮当前所在的段落（aria-current），点击后平滑滚动到标题（减少动效时直接跳转），并把焦点交给标题；标题设 scroll-margin-top，不被固定的顶栏盖住。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-anchor--cmp-anchor-active

### CMP.ANCHOR.DEPTH 层级

目录最多两级；标题文字与页面里的标题一致；段落少于 3 个时不放目录。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-anchor--cmp-anchor-depth

## 组件/导航 / 面包屑（CMP.BREADCRUMB）

显示当前页面在层级中的位置：从一级菜单开始、最后一项是当前页且不可点；层级超过 4 级时折叠中间。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-breadcrumb--overview
对应组件：antd Breadcrumb；geist Breadcrumbs

### CMP.BREADCRUMB.PATH 从一级开始、最后一项不可点

面包屑从一级菜单开始（不从「首页」开始，除非首页是真实的一级入口），最后一项是当前页标题且不可点；中间项可点并回到对应列表时恢复其筛选（CONTEXT）。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：层级路径
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-breadcrumb--cmp-breadcrumb-path

### CMP.BREADCRUMB.COLLAPSE 太深就折叠

超过 4 级时折叠中间层级为「…」并可展开；单层页面不显示面包屑。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-breadcrumb--cmp-breadcrumb-collapse

### CMP.BREADCRUMB.NAMES 名称与菜单一致

面包屑里的名称与菜单、页面标题一致；详情页用对象名称（车牌号、单号），不用「详情」。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-breadcrumb--cmp-breadcrumb-names

## 组件/导航 / 下拉菜单（CMP.DROPDOWN）

收起一组次要操作或选项：触发器说清会展开什么；菜单项是动作、按频率排序、危险项最后并分隔。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-dropdown--overview
对应组件：antd Dropdown；geist Menu、Dots Menu

### CMP.DROPDOWN.TRIGGER 触发器说清会展开什么

触发器写「更多」或带向下箭头的动作名（「导出 ▾」）；悬停触发只用于导航菜单，操作菜单用点击触发；键盘可打开、上下键移动、Esc 关闭。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-dropdown--cmp-dropdown-trigger

### CMP.DROPDOWN.ITEMS 动作排序、危险最后

菜单项是动作（动词开头），按使用频率排序；危险操作放最后，用分隔线隔开并用危险色；不可用的项置灰并说明原因。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：危险项分隔在最后
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-dropdown--cmp-dropdown-items

### CMP.DROPDOWN.SIZE 菜单不宜过长

菜单项不超过 10 个，超过分组（带组标题）或改为对话框选择；嵌套子菜单最多一层。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-dropdown--cmp-dropdown-size

## 组件/导航 / 右键菜单（CMP.CONTEXT_MENU）

右键菜单只是快捷方式：里面的每个操作在界面别处也找得到；键盘能打开。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-context-menu--overview
对应组件：antd Dropdown.contextMenu；geist Context Menu

### CMP.CONTEXT_MENU.SHORTCUT_ONLY 只是快捷方式

右键菜单里的操作（查看、复制、停用）都要在界面别处有入口（行内按钮、「更多」菜单）；不把某个操作只放在右键菜单里，很多人不知道可以右键。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：右键打开
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-context-menu--cmp-context-menu-shortcut-only

### CMP.CONTEXT_MENU.KEYBOARD 键盘能打开

聚焦的元素上按菜单键或 Shift+F10 也能打开右键菜单；菜单里上下键移动、回车执行、Esc 关闭并把焦点还回去。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-context-menu--cmp-context-menu-keyboard

### CMP.CONTEXT_MENU.CONTENT 内容克制

右键菜单放与被点对象直接相关的 3 到 8 项，按「查看 → 编辑 → 复制 → 危险操作」排列，危险操作在最后并用分隔线隔开。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-context-menu--cmp-context-menu-content

## 组件/导航 / 命令面板（CMP.COMMAND_MENU）

⌘K 打开的全局命令面板：输入即筛选，键盘为主；命令名与界面上的叫法一致。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-command-menu--overview
对应组件：antd （无）；geist Command Menu

### CMP.COMMAND_MENU.WHEN 什么时候提供命令面板

功能多、熟练用户多的工作台提供命令面板（⌘K / Ctrl+K），集中「跳转到某页」「执行某个操作」；它是加速，不替代导航与按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：按分组列出命令
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-command-menu--cmp-command-menu-when

### CMP.COMMAND_MENU.KEYBOARD 键盘为主

打开后焦点在输入框，输入即筛选（名称与拼音、英文关键词都能搜），上下键移动、回车执行、Esc 关闭并把焦点还回去；结果列表是 listbox，当前项由 aria-activedescendant 指出。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-command-menu--cmp-command-menu-keyboard

### CMP.COMMAND_MENU.NAMING 命令的叫法

命令名与界面上的按钮、菜单、页面标题一致（「新建订单」，不是「订单创建」）；有快捷键的在右侧显示；没有结果时说明并给出下一步（换个关键词、去帮助中心）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-command-menu--cmp-command-menu-naming

## 组件/导航 / 导航菜单（CMP.NAV_MENU）

应用的主导航：层级不超过两级、当前位置高亮；菜单项按权限出现；折叠后图标可辨认。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-nav-menu--overview
对应组件：antd Menu；geist （无）

### CMP.NAV_MENU.DEPTH 不超过两级

侧边主导航最多两级（分组 + 页面）；第三层放到页面内的标签页或筛选里；菜单名与页面标题一致。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-nav-menu--cmp-nav-menu-depth

### CMP.NAV_MENU.ACTIVE 当前位置高亮

当前页面对应的菜单项高亮，进入详情页时其所属列表的菜单项仍高亮；展开状态记住（SIDEBAR）。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：当前项高亮
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-nav-menu--cmp-nav-menu-active

### CMP.NAV_MENU.PERMISSION 按权限出现

没有权限的菜单项不显示（不是置灰）；整组都没有权限时整组不显示；菜单权限与路由守卫用同一份权限码（GUARD）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-nav-menu--cmp-nav-menu-permission

## 组件/导航 / 分页（CMP.PAGINATION）

分页：显示总数与当前范围，每页条数可选；页码进 URL；数据量不确定时用「加载更多」。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-pagination--overview
对应组件：antd Pagination；geist Pagination

### CMP.PAGINATION.TOTAL 显示总数与范围

显示总条数（「共 1,248 条」），每页条数可选 10 / 20 / 50 / 100；总页数多时显示快速跳转；只有一页时不显示分页。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：总数与每页条数
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-pagination--cmp-pagination-total

### CMP.PAGINATION.URL 页码进 URL

页码与每页条数写进 URL（STATE.URL）；筛选条件变化时回到第 1 页；删除当前页最后一条后回到上一页。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-pagination--cmp-pagination-url

### CMP.PAGINATION.POSITION 位置固定

表格分页放在表格右下方，与表格右边对齐；列表很长时可以在顶部也放一个简洁版。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-pagination--cmp-pagination-position

## 组件/导航 / 加载更多（CMP.LOAD_MORE）

追加式列表的「加载更多」：按钮而不是无限滚动；读屏知道加载了多少；到底了说清楚。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-load-more--overview
对应组件：antd List.loadMore；geist Load More Button、Show More

### CMP.LOAD_MORE.WHEN 按钮加载，不用无限滚动

动态、评论、消息这类追加式列表用「加载更多」按钮（与接口的游标分页一致），不用滚到底自动加载：页脚要能到达、位置要能保持、键盘用户能控制节奏。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：加载更多按钮
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-load-more--cmp-load-more-when

### CMP.LOAD_MORE.STATE 加载中与读屏

加载中按钮保留文字并显示转圈、不能重复点；加载完成后用礼貌的 aria-live 播报「已加载 30 条」，焦点留在按钮上，新内容出现在按钮前面。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-load-more--cmp-load-more-state

### CMP.LOAD_MORE.END 到底了

没有更多时按钮换成「没有更多了」的说明（不是禁用的按钮）；加载失败时就地显示原因与「重试」。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-load-more--cmp-load-more-end

## 组件/导航 / 步骤条（CMP.STEPS）

多步流程的进度：步骤 3–5 个、名称是名词；当前步骤、已完成、出错分明；可回到已完成的步骤修改。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-steps--overview
对应组件：antd Steps；geist （无）

### CMP.STEPS.COUNT 3–5 步

步骤控制在 3–5 个，每步名称是名词或短动宾（「填写车辆」「上传证件」「确认提交」）；超过 5 步合并或拆成多个流程。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：当前与出错
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-steps--cmp-steps-count

### CMP.STEPS.STATUS 状态分明

已完成、当前、未开始、出错四种状态样式分明，出错的步骤写原因；已完成的步骤可点回去修改，未开始的不可跳过。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-steps--cmp-steps-status

### CMP.STEPS.SAVE 跨步保存

每步完成时保存草稿（FORM 草稿），中途离开再回来停在原步骤；最后一步汇总全部信息再提交。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-steps--cmp-steps-save

## 组件/导航 / 标签页（CMP.TABS）

同一页面内平级视图的切换：标签名短、数量少；当前标签进 URL；不把流程步骤做成标签页。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-tabs--overview
对应组件：antd Tabs；geist Tabs

### CMP.TABS.WHEN 平级视图才用标签页

标签页切换同一对象的平级视图（基本信息 / 维修记录 / 费用）；有先后顺序的流程用步骤条；标签多于 7 个时考虑拆页或用侧栏导航。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：平级视图
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-tabs--cmp-tabs-when

### CMP.TABS.URL 当前标签进 URL

当前标签写进 URL（查询参数或子路由），刷新与分享后停在同一标签；切换标签不丢失其他标签里未保存的内容（或切换前提示）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-tabs--cmp-tabs-url

### CMP.TABS.LABEL 标签名短，可带计数

标签名 2–6 个字，可以带计数（「维修记录（3）」）；不在标签名里放图标以外的装饰；禁用的标签说明原因。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-navigation-tabs--cmp-tabs-label

## 组件/数据录入 / 自动完成（CMP.AUTO_COMPLETE）

自由输入 + 建议：可以输入建议之外的值；建议随输入更新；键盘可选。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-auto-complete--overview
对应组件：antd AutoComplete；geist （无）

### CMP.AUTO_COMPLETE.WHEN 和可搜索选择的区别

允许输入任意值、建议只是帮忙（地址、搜索词、邮箱后缀）时用自动完成；只能从给定选项里选时用可搜索选择（combobox）。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：输入时给建议
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-auto-complete--cmp-auto-complete-when

### CMP.AUTO_COMPLETE.SUGGEST 建议怎么给

输入时防抖后请求建议（约 300ms），取消过期请求；匹配的部分加粗；最多显示 8 条，没有建议时不弹空列表。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：防抖 `p.debounce` = 300ms（pomaster 预设约定）
- 参数：最多条数 `p.max` = 8（pomaster 预设约定）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-auto-complete--cmp-auto-complete-suggest

### CMP.AUTO_COMPLETE.KEYBOARD 键盘可选

建议列表是 listbox，上下键移动（aria-activedescendant 指向当前项）、回车采用、Esc 收起并保留已输入的文字；采用建议不自动提交。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-auto-complete--cmp-auto-complete-keyboard

## 组件/数据录入 / 可搜索选择（CMP.COMBOBOX）

选项多时的可搜索单选：只能选列表里的值；按名称与拼音搜；无结果时说明。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-combobox--overview
对应组件：antd Select.showSearch；geist Combobox

### CMP.COMBOBOX.WHEN 什么时候用可搜索选择

选项超过 10 个的单选用 a-select 加 show-search（按 label 过滤），选项少时用普通选择器；允许输入列表外的值时改用自动完成。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：搜索并选择
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-combobox--cmp-combobox-when

### CMP.COMBOBOX.SEARCH 怎么搜

按显示名称、拼音全拼与首字母、编号搜；匹配不区分大小写；选项来自接口时远程搜索并防抖，加载中在列表里显示加载态。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-combobox--cmp-combobox-search

### CMP.COMBOBOX.EMPTY 无结果

没有匹配时在列表里说明「没有找到」并给出下一步（换个关键词，或新建一个）；不显示空白弹层。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-combobox--cmp-combobox-empty

## 组件/数据录入 / 级联选择（CMP.CASCADER）

层级数据逐级选择（省市区、类目）：每级一列，选到叶子才算完；触发器显示完整路径。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-cascader--overview
对应组件：antd Cascader；geist （无）

### CMP.CASCADER.WHEN 什么时候用级联选择

有明确层级、每级选项不多的数据（省 / 市 / 区、商品类目）用级联选择；层级不固定或需要看到整棵树时用树选择。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：逐级选择
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-cascader--cmp-cascader-when

### CMP.CASCADER.PATH 显示完整路径

选完后触发器显示完整路径（上海市 / 浦东新区 / 张江镇），路径太长时中间省略并能看到全文；只能选叶子节点时，中间级点击只展开不选中。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-cascader--cmp-cascader-path

### CMP.CASCADER.SEARCH 层级深时可搜

超过三级或选项多时提供搜索，结果按完整路径显示；每一级都能用键盘左右键进出、上下键移动。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-cascader--cmp-cascader-search

## 组件/数据录入 / 多选框（CMP.CHECKBOX）

在一组选项里选多个，或确认一句声明：选项竖排、标签可点；全选给出半选态；单个多选框不代替开关。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-checkbox--overview
对应组件：antd Checkbox；geist Checkbox

### CMP.CHECKBOX.LAYOUT 竖排、标签可点

多于 3 个选项竖排，每项的标签文字也能点中；组有标题说明选什么；选项多于 10 个改带搜索的多选或穿梭框。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：竖排与全选
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-checkbox--cmp-checkbox-layout

### CMP.CHECKBOX.INDETERMINATE 全选有半选态

有「全选」时，部分选中显示半选态（indeterminate），点击半选态变为全选；全选只作用于当前可见、可操作的选项，并说清范围。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-checkbox--cmp-checkbox-indeterminate

### CMP.CHECKBOX.NOT_SWITCH 立即生效用开关，提交生效用多选框

改了立即生效的设置用开关；需要随表单一起提交的选择用多选框；单个多选框只用于确认一句声明（「我已阅读并同意…」），并且声明文字完整可读。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-checkbox--cmp-checkbox-not-switch

## 组件/数据录入 / 选择卡片（CMP.CHOICEBOX）

带标题与说明的选项卡片：少量需要解释差别的选项；整张卡片可点；单选多选语义正确。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-choicebox--overview
对应组件：antd （无）；geist Choicebox

### CMP.CHOICEBOX.WHEN 什么时候用选择卡片

2 到 4 个选项、每个都需要一句话解释差别（配送时效、套餐、部署区域）时用选择卡片；不需要解释的用单选或多选。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：单选卡片
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-choicebox--cmp-choicebox-when

### CMP.CHOICEBOX.SEMANTICS 语义与点击区

单选是一组 radio、多选是一组 checkbox（读屏与键盘行为随之而来），整张卡片都是点击区；选中态除了边框颜色还有勾选标记，不只靠颜色。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-choicebox--cmp-choicebox-semantics

### CMP.CHOICEBOX.CONTENT 卡片内容

标题一行，说明一句话；卡片等宽、等高排成一行或两列；不可用的选项说明原因（「暂未开通」）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-choicebox--cmp-choicebox-content

## 组件/数据录入 / 日期选择（CMP.DATE_PICKER）

选择日期或日期范围：显示格式统一、可键盘输入；范围选择给常用快捷项并限制跨度；不可选的日期置灰并说明。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-date-picker--overview
对应组件：antd DatePicker；geist Calendar

### CMP.DATE_PICKER.FORMAT 显示格式统一

日期显示统一为 YYYY-MM-DD，日期时间为 YYYY-MM-DD HH:mm:ss（见 FORMAT.DATETIME）；存储与传输用 ISO 8601；允许用户直接键入日期，键入后按同一格式回显。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-date-picker--cmp-date-picker-format

### CMP.DATE_PICKER.RANGE 范围选择有快捷项与上限

日期范围给常用快捷项（今天、最近 7 天、本月、上月）；查询类范围限制最大跨度（如 366 天）并在超出时提示；开始和结束一起选，不拆成两个独立控件。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：范围与快捷项
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-date-picker--cmp-date-picker-range

### CMP.DATE_PICKER.DISABLED 不可选的日期置灰

不可选的日期（过去、节假日、超出业务范围）置灰并在面板里说明原因；不在选完后才报错。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-date-picker--cmp-date-picker-disabled

## 组件/数据录入 / 时间选择（CMP.TIME_PICKER）

选时间：时、分（可选秒）分列选择；分钟按步长；值是 24 小时制字符串。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-time-picker--overview
对应组件：antd TimePicker；geist （无）

### CMP.TIME_PICKER.STEP 按业务给步长

预约、排班类的时间按业务步长给分钟（5 / 15 / 30），不给用户 60 个分钟选项；需要精确到秒的才显示秒列。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：15 分钟步长
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-time-picker--cmp-time-picker-step

### CMP.TIME_PICKER.FORMAT 24 小时制

显示与取值都用 24 小时制 HH:mm（需要时 HH:mm:ss），跨天的时间段写明「次日」；值的格式由格式化注册表统一。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-time-picker--cmp-time-picker-format

### CMP.TIME_PICKER.RANGE 时间段

选时间段时开始与结束分两个字段并校验先后；常用的时间段（上午、下午、全天）给快捷选项。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-time-picker--cmp-time-picker-range

## 组件/数据录入 / 表单（CMP.FORM）

字段的标签、分组、校验与提交：标签在上、按业务分组；必填只标星号不重复说明；提交时整体校验并定位到第一个错误；提交中锁定。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-form--overview
对应组件：antd Form；geist Fieldset、Label

### CMP.FORM.LAYOUT 标签在上，按业务分组

新建、编辑表单用垂直布局（layout="vertical"），标签在输入框上方；字段按业务分组，每组有标题；一行最多两列，相关字段（起止日期、省市区）放同一行；查询表单用行内或栅格布局。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：分组、必填与操作区
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-form--cmp-form-layout

### CMP.FORM.REQUIRED 必填只标星号

必填字段在标签前标星号，必填字段多于可选字段时改为只标「（选填）」；说明文字写在字段下方，不写在占位符里。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-form--cmp-form-required

### CMP.FORM.SUBMIT 提交整体校验并定位

提交时校验全部字段，滚动并聚焦到第一个错误字段；提交中锁定按钮与表单（CLICK.LOCK），成功后给出结果并决定去向（返回列表或停留继续编辑），失败保留已填内容。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-form--cmp-form-submit

### CMP.FORM.ACTIONS 操作区固定位置

表单操作区在表单末尾左对齐（与字段左边对齐），主按钮在前；长表单把操作区吸底（a-affix 或页脚工具栏），保证随时可提交。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-form--cmp-form-actions

## 组件/数据录入 / 输入框（CMP.INPUT）

单行文字输入：标签在上、占位符只给格式示例；必填、长度、格式在提交前就地提示；前后缀放单位与固定内容，不放说明。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input--overview
对应组件：antd Input；geist Input、Clearable Input
实验场：`a-input`，属性 size=large|middle|small，disabled=布尔，allowClear=布尔（https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input--playground）

### CMP.INPUT.LABEL 标签在外，占位符只放示例

每个输入框都有可见标签（表单里用表单项的 label，不用占位符代替标签）；占位符只写格式示例（如「例：沪A12345」），不写「请输入」之类的废话；聚焦后占位符消失不影响理解。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：标签、示例占位符与错误态
- 示例（这样做）：标签 + 示例占位符
- 示例（别这样做）：用占位符当标签
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input--cmp-input-label

### CMP.INPUT.VALIDATION 就地校验，失败说清怎么改

格式与长度在失焦时校验，错误显示在输入框下方并把边框标为错误态（status=error / aria-invalid）；提示写清规则与改法（「车牌号为 7–8 位，如沪A12345」），不写「格式错误」；用户改动后立即撤掉错误。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input--cmp-input-validation

### CMP.INPUT.AFFIX 前后缀只放单位与固定内容

单位、货币代码、固定前缀（https://）放在前后缀里，不让用户输入；图标前缀只用于搜索、账号这类约定俗成的场景；清除按钮（allowClear）给可选字段，必填字段不清空为空串。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input--cmp-input-affix

### CMP.INPUT.WIDTH 宽度跟内容长度走

输入框宽度按预期内容长度选（短码、数量、手机号用窄档，名称、地址用宽档），同一表单里同类字段等宽；不要所有输入框都拉满整行。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input--cmp-input-width

## 组件/数据录入 / 搜索框（CMP.SEARCH_INPUT）

搜索框：放大镜 + 清空；防抖后搜索、回车立即搜索；在 role=search 区域里；结果数可读。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-search-input--overview
对应组件：antd Input.Search；geist Search Input

### CMP.SEARCH_INPUT.BEHAVIOR 什么时候搜

输入时防抖约 300ms 自动搜索，回车立即搜索；取消过期请求、丢弃过期响应；清空后恢复全部结果。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：防抖 `p.debounce` = 300ms（pomaster 预设约定）
- 示例（这样做）：防抖搜索
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-search-input--cmp-search-input-behavior

### CMP.SEARCH_INPUT.SEMANTICS 语义

搜索框是 type="search"，放在 role="search" 的区域里，有可读名称；不触发密码管理器（autocomplete="off" 或具体的 token）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-search-input--cmp-search-input-semantics

### CMP.SEARCH_INPUT.RESULT 结果可读

搜索后用礼貌的 aria-live 播报结果数（「找到 12 辆车」）；没有结果时显示空状态与「清除搜索」。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-search-input--cmp-search-input-result

## 组件/数据录入 / 多行输入（CMP.TEXTAREA）

多行文字输入：给出行数与字数上限，自动增高有上限；长文本才用它，短备注用单行。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-textarea--overview
对应组件：antd Input.TextArea；geist Textarea

### CMP.TEXTAREA.ROWS 初始行数与自动增高

初始 3–4 行；内容变多时自动增高（autoSize / field-sizing），最多 8 行后出现滚动条；不允许用户把它拖得比容器还宽。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-textarea--cmp-textarea-rows

### CMP.TEXTAREA.COUNT 有上限就显示计数

后端有长度上限的字段显示字数计数（showCount + maxlength），接近上限时计数变为警示色；超限不截断用户已输入的内容，而是阻止提交并提示。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：计数
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-textarea--cmp-textarea-count

### CMP.TEXTAREA.WHEN 长文本才用多行

备注、描述、原因这类可能超过一行的内容用多行输入；名称、编号、短备注用单行输入，不为了「看起来宽敞」用多行。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-textarea--cmp-textarea-when

## 组件/数据录入 / 数字输入（CMP.INPUT_NUMBER）

输入有范围的数字：写明单位、范围与精度，步进按钮可选；金额和数量右对齐。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input-number--overview
对应组件：antd InputNumber；geist （无）

### CMP.INPUT_NUMBER.RANGE 范围、精度、单位写清

设置 min / max / precision，与后端校验一致；单位放在后缀或标签里（「整备质量（kg）」），不让用户输入单位；超出范围时就地提示允许的范围，不静默改成边界值。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：范围与单位
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input-number--cmp-input-number-range

### CMP.INPUT_NUMBER.ALIGN 数字右对齐、等宽

金额、数量、重量这类可比较的数字在输入框和列表里都右对齐并用等宽数字（tabular-nums），方便按位比较。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input-number--cmp-input-number-align

### CMP.INPUT_NUMBER.STEP 步进按钮只给小范围

步进按钮适合 0–20 这类小范围的调整（数量、优先级）；金额、长编号不显示步进按钮，避免误点改值；滚轮不改值。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-input-number--cmp-input-number-step

## 组件/数据录入 / 提及（CMP.MENTIONS）

在多行输入里 @ 提及成员：弹出建议、键盘选择；提及的人会收到通知要说清。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-mentions--overview
对应组件：antd Mentions；geist （无）

### CMP.MENTIONS.TRIGGER 触发与建议

输入「@」后弹出成员建议，按姓名与拼音筛选，上下键移动、回车插入、Esc 关闭；插入后光标停在提及之后。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：@ 提及
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-mentions--cmp-mentions-trigger

### CMP.MENTIONS.NOTIFY 说清通知

被提及的人会收到通知时，在输入框下方写明「被 @ 的人会收到通知」；提交后提及显示为可点的人名。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-mentions--cmp-mentions-notify

### CMP.MENTIONS.SCOPE 只提及有权限的人

建议列表只列出能看到这条内容的成员；没有权限的人不出现在建议里。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-mentions--cmp-mentions-scope

## 组件/数据录入 / 单选框（CMP.RADIO）

在几个互斥的选项里选一个：2–5 个选项且要一眼看全时用；有默认值；选项多了改选择器。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-radio--overview
对应组件：antd Radio；geist Radio

### CMP.RADIO.WHEN 选项少且要看全才用单选

2–5 个互斥选项且用户需要对比时用单选组；超过 5 个改选择器；只有「是 / 否」且立即生效时用开关。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：表单里的单选与切换视图的按钮样式
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-radio--cmp-radio-when

### CMP.RADIO.DEFAULT 给安全的默认值

单选组默认选中最常用或最安全的一项（如「仅本人可见」）；确实要用户主动选择的（无安全默认），不预选并在提交时校验必选。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-radio--cmp-radio-default

### CMP.RADIO.BUTTON_STYLE 按钮样式只用于切换视图

按钮样式的单选（a-radio-group 的 button 样式）或分段控制只用于切换视图、筛选范围这类立即生效的选择；表单里的取值用普通单选，竖排或横排保持一致。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-radio--cmp-radio-button-style

## 组件/数据录入 / 评分（CMP.RATE）

星级评分：一组 radio、每颗星有名称；能清空；只读时同时显示数字。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-rate--overview
对应组件：antd Rate；geist （无）

### CMP.RATE.SEMANTICS 语义与键盘

评分是一组单选（radiogroup），左右键改分，每颗星有可读名称（「4 星：满意」）；再点当前分可以清空。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：带说明的评分
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-rate--cmp-rate-semantics

### CMP.RATE.LABELS 每一档有文字

每个分值有对应的文字说明，选中后显示在星的旁边；默认 5 档，不用半星做输入。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-rate--cmp-rate-labels

### CMP.RATE.READONLY 只读展示

只读展示平均分时同时显示数字与评价人数（4.6 · 128 人评价），星只是辅助。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-rate--cmp-rate-readonly

## 组件/数据录入 / 选择器（CMP.SELECT）

从下拉列表里选一项：选项多于 7 个可搜索、多于 50 个改远程搜索；选项文案短、互斥、有序；空态与加载态都要有。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-select--overview
对应组件：antd Select；geist Select
实验场：`a-select`，属性 size=large|middle|small，disabled=布尔，loading=布尔（https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-select--playground）

### CMP.SELECT.WHEN 选项数量决定控件

2–5 个互斥选项且需要一眼看全时用单选组或分段控制；6 个以上用选择器；超过 7 个打开搜索（showSearch）；超过 50 个或来自接口时改远程搜索，并防抖、显示加载态。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：可搜索的选择器与停用项
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-select--cmp-select-when

### CMP.SELECT.OPTIONS 选项短、互斥、有序

选项文案短（不超过 12 个字）、互斥、按使用频率或自然顺序排列（状态按流程顺序，地区按行政顺序），「其他」放最后；禁用的选项说明原因（tooltip），不直接隐藏。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-select--cmp-select-options

### CMP.SELECT.EMPTY 空与加载有反馈

远程搜索时显示加载态；没有匹配项时显示「无匹配的车型」并给出新建入口（有新建权限时）；不把空列表留成一片白。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-select--cmp-select-empty

### CMP.SELECT.VALUE 值与显示分开

选项的值用稳定的编码（code / id），显示用名称；回显时用值匹配，名称改了不影响已存数据；值不在选项里时显示原值并提示「已停用」，不显示成空。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-select--cmp-select-value

## 组件/数据录入 / 多选选择器（CMP.MULTI_SELECT）

多选选择器：选中项显示为可移除的标签，超过上限折叠；弹层里可搜、可勾选。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-multi-select--overview
对应组件：antd Select.multiple；geist Multi Select

### CMP.MULTI_SELECT.TAGS 选中项显示为标签

选中的项在触发器里显示为标签，每个标签可单独移除（移除按钮带名称）；超过 3 个时折叠成「+N」，悬停或展开能看到全部。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：折叠前最多显示 `p.max_tags` = 3（pomaster 预设约定）
- 示例（这样做）：多选与折叠
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-multi-select--cmp-multi-select-tags

### CMP.MULTI_SELECT.WHEN 多选选择器还是复选框

选项少（5 个以内）且都要看见时用复选框组；选项多、选中的少时用多选选择器。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-multi-select--cmp-multi-select-when

### CMP.MULTI_SELECT.LIMIT 数量限制

有选择上限时在标签旁写明「最多选 5 个」，达到上限后其余选项不可选并说明原因。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-multi-select--cmp-multi-select-limit

## 组件/数据录入 / 滑块（CMP.SLIDER）

滑块：连续值或区间的大致调节；需要精确值时旁边配数字输入；每个滑块有名称。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-slider--overview
对应组件：antd Slider；geist Slider

### CMP.SLIDER.WHEN 什么时候用滑块

大致调节一个范围内的值（音量、半径、价格区间）用滑块；需要精确输入的数值用数字输入，或在滑块旁边并排一个数字输入。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：区间滑块
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-slider--cmp-slider-when

### CMP.SLIDER.KEYBOARD 键盘与名称

每个滑块手柄有可读名称（区间的两端分别是「最低运价」「最高运价」），方向键按步长调节、PageUp / PageDown 大步调节，当前值随时可读。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-slider--cmp-slider-keyboard

### CMP.SLIDER.MARKS 刻度与当前值

关键的值用刻度标出并写数字；拖动时显示当前值；不用滑块表示只有两三个离散选项的设置（用分段控制器）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-slider--cmp-slider-marks

## 组件/数据录入 / 开关（CMP.SWITCH）

两个状态之间切换、并且立即生效：标签写它控制什么；有副作用的切换先确认；切换中显示加载并防重复。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-switch--overview
对应组件：antd Switch；geist Toggle
实验场：`a-switch`，属性 size=default|small，checked=布尔，disabled=布尔，loading=布尔（https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-switch--playground）

### CMP.SWITCH.IMMEDIATE 开关立即生效

开关只用于立即生效的设置；需要点「保存」才生效的选项用多选框或单选；切换后给出结果反馈（状态变化本身或一条轻提示），失败时回到原状态并提示原因。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：标签写控制什么
- 示例（别这样做）：用开关做表单项再点保存
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-switch--cmp-switch-immediate

### CMP.SWITCH.LOADING 切换中加载、防重复

切换要请求接口时显示加载态（loading）并在返回前禁用，防止连点；接口失败回滚开关状态。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-switch--cmp-switch-loading

### CMP.SWITCH.CONFIRM 有副作用先确认

关闭后会影响他人或不可撤回的开关（停用账号、关闭对外接口）先弹确认，说清后果；普通偏好不确认。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-switch--cmp-switch-confirm

## 组件/数据录入 / 分段控制器（CMP.SEGMENTED）

2 到 5 个互斥选项的即时切换：切换同一份内容的展示方式；切换不同内容区用标签页。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-segmented--overview
对应组件：antd Segmented；geist Switch

### CMP.SEGMENTED.WHEN 分段控制器还是标签页

切换同一份内容的展示方式或范围（列表 / 地图、今日 / 本周 / 本月）用分段控制器；切换不同的内容区用标签页。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：切换统计范围
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-segmented--cmp-segmented-when

### CMP.SEGMENTED.COUNT 选项数量

放 2 到 5 个选项，每项文字不超过 4 个字；图标段要有可读名称。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：最少选项 `p.min` = 2（pomaster 预设约定）
- 参数：最多选项 `p.max` = 5（pomaster 预设约定）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-segmented--cmp-segmented-count

### CMP.SEGMENTED.IMMEDIATE 即时生效

切换立即生效、不需要确认；当前选择写进地址，刷新后保持。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-segmented--cmp-segmented-immediate

## 组件/数据录入 / 穿梭框（CMP.TRANSFER）

两栏之间移动条目（分配权限、编排线路）：可搜索、可全选；按钮写清方向；数量可见。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-transfer--overview
对应组件：antd Transfer；geist （无）

### CMP.TRANSFER.WHEN 什么时候用穿梭框

从一批条目里挑一部分出来、并且要同时看到「已选」与「待选」两边时用穿梭框（分配车辆到线路、给角色分配权限）；只需要选、不关心另一边时用多选选择器。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：分配车辆
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-transfer--cmp-transfer-when

### CMP.TRANSFER.CONTROLS 搜索、全选与方向

每一栏可搜索、可全选，栏头显示「已选 n / 共 m」；中间的按钮写清方向（「移到右侧」「移回左侧」），没有勾选时不可用。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-transfer--cmp-transfer-controls

### CMP.TRANSFER.LARGE 条目很多时

条目超过几百条时分页或虚拟滚动，搜索走服务端；不一次把全部条目渲染出来。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-transfer--cmp-transfer-large

## 组件/数据录入 / 树选择（CMP.TREE_SELECT）

从树形数据里选节点（组织、车队）：弹层里是树；可搜索；显示路径。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-tree-select--overview
对应组件：antd TreeSelect；geist （无）

### CMP.TREE_SELECT.WHEN 什么时候用树选择

层级不固定、需要看到树形结构才能选的数据（组织架构、车队分组）用树选择；层级固定且浅的用级联选择。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：选择车队
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-tree-select--cmp-tree-select-when

### CMP.TREE_SELECT.KEYBOARD 键盘

弹层里的树用方向键移动、左右键收起展开、回车选择；选中后弹层收起、焦点回到触发器。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-tree-select--cmp-tree-select-keyboard

### CMP.TREE_SELECT.SEARCH 搜索与路径

节点多时提供搜索，匹配的节点连同祖先一起显示；触发器上显示选中节点的名称，悬停可看完整路径。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-tree-select--cmp-tree-select-search

## 组件/数据录入 / 上传（CMP.UPLOAD）

上传文件：说清格式、大小与数量；上传中显示进度、可取消；失败可重试；上传与提交分开。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-upload--overview
对应组件：antd Upload；geist （无）

### CMP.UPLOAD.LIMITS 格式、大小、数量写在前面

上传区域旁写明允许的格式、单个大小与数量上限（「PDF、JPG，单个不超过 10 MB，最多 5 个」）；选择文件时就校验，不等上传完才拒绝；校验以服务端为准。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-upload--cmp-upload-limits

### CMP.UPLOAD.PROGRESS 进度、取消、重试

每个文件显示进度，可取消；失败的文件保留在列表里标红、写清原因并可重试；全部完成前不允许提交依赖这些文件的表单。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：文件列表
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-upload--cmp-upload-progress

### CMP.UPLOAD.SEPARATE 上传与提交分开

文件先上传得到文件标识，表单提交只带标识；大文件分片上传、可断点续传；上传的文件名、类型在服务端重新校验与改名（SEC 规范）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-upload--cmp-upload-separate

## 组件/数据录入 / 地址输入（CMP.ADDRESS_INPUT）

一组地址字段：省市区 + 详细地址 + 邮编；各自有标签与自动填充提示。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-address-input--overview
对应组件：antd （无）；geist Address Input

### CMP.ADDRESS_INPUT.STRUCTURE 按地址结构拆字段

地址按国内结构拆成省市区（级联选择）、详细地址、可选的邮编，外面包一个 fieldset 写明是什么地址（「提货地址」）；不让用户在一个输入框里自由写整段地址再由程序拆分。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：省市区 + 详细地址
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-address-input--cmp-address-input-structure

### CMP.ADDRESS_INPUT.AUTOFILL 自动填充

每个字段设置对应的 autocomplete（address-level1/2/3、street-address、postal-code）与 inputmode，让浏览器与密码管理器能自动填写。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-address-input--cmp-address-input-autofill

### CMP.ADDRESS_INPUT.VALIDATION 校验

省市区必须选到最后一级；详细地址校验长度；邮编 6 位数字；错误贴着对应字段，不在整组顶部笼统报错。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-address-input--cmp-address-input-validation

## 组件/数据录入 / 破坏性确认输入（CMP.DESTRUCTIVE_INPUT）

不可逆的大操作前输入对象名称确认：写出原文；输入一致后才能确认；不禁止粘贴。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-destructive-input--overview
对应组件：antd （无）；geist Destructive Confirmation Input

### CMP.DESTRUCTIVE_INPUT.WHEN 什么时候要输入名称

删除项目、解散车队、清空数据这类影响大且不可逆的操作，要求输入对象名称再确认；普通删除用气泡确认或撤销。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：输入名称确认
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-destructive-input--cmp-destructive-input-when

### CMP.DESTRUCTIVE_INPUT.PROMPT 写出原文

提示里写出要输入的原文（「输入 浦东车队 确认」），原文用等宽或标签样式突出；比较时去掉首尾空格、区分大小写。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-destructive-input--cmp-destructive-input-prompt

### CMP.DESTRUCTIVE_INPUT.PASTE 不禁止粘贴

允许粘贴（禁止粘贴只会为难密码管理器与读屏用户）；输入一致前危险按钮不可用，一致后可用。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-destructive-input--cmp-destructive-input-paste

## 组件/数据录入 / 筛选条（CMP.FILTER_BAR）

列表上方的筛选条：已生效的筛选是可移除的标签；添加筛选用下拉；一键清除；筛选写进地址。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-filter-bar--overview
对应组件：antd （无）；geist Filter Params

### CMP.FILTER_BAR.CHIPS 已生效的筛选看得见

每个已生效的筛选显示为「名称：值」的标签，可单独移除（移除按钮带名称）；没有筛选时只显示「添加筛选」。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：增删筛选
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-filter-bar--cmp-filter-bar-chips

### CMP.FILTER_BAR.URL 筛选写进地址

筛选条件写进地址的查询参数，刷新、分享、浏览器后退都能恢复；改筛选后页码回到第一页。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-filter-bar--cmp-filter-bar-url

### CMP.FILTER_BAR.CLEAR 一键清除

有两个以上筛选时提供「清除全部」；清除后结果恢复为全部，并播报结果数。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-filter-bar--cmp-filter-bar-clear

## 组件/数据录入 / 反馈收集（CMP.FEEDBACK_WIDGET）

页面上的「反馈」入口：选感受 + 写几句；提交后就地确认；不强制留联系方式。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-feedback-widget--overview
对应组件：antd （无）；geist Feedback

### CMP.FEEDBACK_WIDGET.FORM 简短的反馈表单

反馈入口打开一个小弹层：一组感受选项（表情或评分，每项有名称）+ 一个可选的文字框；感受与文字至少填一项才能提交。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：反馈入口
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-feedback-widget--cmp-feedback-widget-form

### CMP.FEEDBACK_WIDGET.CONFIRM 就地确认

提交中按钮忙碌；成功后在弹层里显示「已收到」，不跳转、不弹新的对话框；失败时保留已填内容并给出重试。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-feedback-widget--cmp-feedback-widget-confirm

### CMP.FEEDBACK_WIDGET.PRIVACY 隐私

不强制填写联系方式；随反馈一起提交的页面地址、浏览器信息要在表单里写明。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-feedback-widget--cmp-feedback-widget-privacy

## 组件/数据录入 / 主题切换（CMP.THEME_SWITCHER）

跟随系统 / 浅色 / 深色三段切换：默认跟随系统；切换即时生效；偏好要记住。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-theme-switcher--overview
对应组件：antd （无）；geist Theme Switcher

### CMP.THEME_SWITCHER.OPTIONS 三个选项

提供「跟随系统」「浅色」「深色」三个选项，默认跟随系统；用分段控制器，图标段要有可读名称。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：三段切换
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-theme-switcher--cmp-theme-switcher-options

### CMP.THEME_SWITCHER.APPLY {'antd': '怎么生效', 'geist': '怎么生效'}

切换即时生效：交给 a-config-provider 的 theme.algorithm（defaultAlgorithm / darkAlgorithm），同时设置页面的 color-scheme；不刷新页面。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-theme-switcher--cmp-theme-switcher-apply

### CMP.THEME_SWITCHER.PERSIST 记住偏好

偏好存在用户设置里（登录后跨设备）或本地，下次打开在首屏渲染前就应用，避免先闪一下浅色。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-entry-theme-switcher--cmp-theme-switcher-persist

## 组件/数据展示 / 头像（CMP.AVATAR）

代表人或团队的头像：没有图时显示姓名缩写；旁边已有姓名时作为装饰；多人叠放以「+N」收尾。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-avatar--overview
对应组件：antd Avatar；geist Avatar

### CMP.AVATAR.FALLBACK 没有图时显示缩写

没有头像或图片加载失败时显示姓名缩写（中文取最后一个字、英文取首字母），底色按姓名稳定取色；不显示破图标或统一的灰色人形。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：缩写与叠放
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-avatar--cmp-avatar-fallback

### CMP.AVATAR.ALT 替代文字

头像旁边已经写了姓名时，头像是装饰（alt 留空）；单独出现的头像（只有头像的成员列表）要有姓名作为可读名称。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-avatar--cmp-avatar-alt

### CMP.AVATAR.GROUP 多人叠放

多人头像叠放时最多显示 3 到 5 个，其余折叠成「+N」，整组有可读名称（「5 人：张伟、李娜……」）；尺寸取 24 / 32 / 40 / 64 四档。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-avatar--cmp-avatar-group

## 组件/数据展示 / 徽标数（CMP.BADGE）

在图标或头像右上角显示计数或状态点：只提示有新东西，数字封顶；状态点配文字。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-badge--overview
对应组件：antd Badge；geist （无）

### CMP.BADGE.COUNT 计数封顶

计数超过 99 显示「99+」；为 0 时不显示；计数表示「有待处理的东西」，点进去处理后清零或减少。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：封顶与状态点
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-badge--cmp-badge-count

### CMP.BADGE.DOT 状态点配文字

状态点（在线、同步中、异常）旁边写文字，不单独用颜色表达状态；动画状态点只用于正在进行的过程。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-badge--cmp-badge-dot

### CMP.BADGE.RESTRAINT 克制使用

徽标只用于需要用户注意的新消息、待办；不给每个菜单都加数字；同一屏不超过 3 个红点。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-badge--cmp-badge-restraint

## 组件/数据展示 / 标签（CMP.TAG）

给对象打上分类或状态的短标签：颜色有固定语义、文字不超过 6 个字；可关闭的标签用于筛选条件；不当按钮用。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tag--overview
对应组件：antd Tag；geist Badge、Pill
实验场：`a-tag`，属性 color=default|success|processing|warning|error，bordered=布尔（https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tag--playground）

### CMP.TAG.SEMANTIC 颜色有固定语义

状态标签的颜色按语义固定（成功 / 进行中 / 警告 / 失败 / 中性），同一状态全站同色；分类标签用中性色或预设色板，不自定义色值；颜色之外还有文字，不只靠颜色区分。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：语义色
- 示例（别这样做）：自定义色值
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tag--cmp-tag-semantic

### CMP.TAG.SHORT 文字短

标签文字不超过 6 个字，不换行；一行标签超过 3 个时折叠为「+N」，悬停显示全部。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tag--cmp-tag-short

### CMP.TAG.CLOSABLE 可关闭的标签只用于条件

可关闭标签用于展示已选的筛选条件或已添加的关键词，关闭即移除该条件；标签不当按钮或链接用，需要点击跳转的用链接。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tag--cmp-tag-closable

## 组件/数据展示 / 状态点（CMP.STATUS_DOT）

对象状态的圆点 + 文字：颜色按语义；文字必须在；进行中可以呼吸闪烁。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-status-dot--overview
对应组件：antd Badge.status；geist Status Dot

### CMP.STATUS_DOT.TEXT 圆点加文字

对象的状态（在途、空闲、故障）用 a-badge 的 status + text：圆点颜色按语义（success / processing / warning / error / default），文字写清状态；不只放一个彩色圆点。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：五种状态
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-status-dot--cmp-status-dot-text

### CMP.STATUS_DOT.MAPPING 状态与颜色对应

同一个状态在全系统用同一种颜色与文字（领域规格里的状态枚举对应固定的语义色）；颜色只有五种语义，不按状态各配一种颜色。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-status-dot--cmp-status-dot-mapping

### CMP.STATUS_DOT.MOTION 进行中的闪烁

只有进行中的状态（处理中、部署中）用呼吸闪烁；用户开启减少动效时静止。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-status-dot--cmp-status-dot-motion

## 组件/数据展示 / 日历（CMP.CALENDAR）

月历网格：选日期或在格子里看当天的数据；键盘按天、周、月移动；今天与选中日区分清楚。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-calendar--overview
对应组件：antd Calendar；geist （无）

### CMP.CALENDAR.WHEN 什么时候用日历

需要按月看每天数据（排班、订单量、预约）时用日历面板，格子里放当天的摘要；只是选一个日期用日期选择器。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：卡片式日历
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-calendar--cmp-calendar-when

### CMP.CALENDAR.KEYBOARD 键盘

日历是网格（role=grid），方向键按天、上下按周移动，PageUp / PageDown 换月，Home / End 到周首尾；每个日期格有完整的可读名称（年、月、日与星期都读得出来）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-calendar--cmp-calendar-keyboard

### CMP.CALENDAR.MARKS 今天、选中与不可选

今天、选中日、不可选的日期用不同的样式区分（不只靠颜色）；格子里的数据摘要简短，详细内容点开再看。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-calendar--cmp-calendar-marks

## 组件/数据展示 / 卡片（CMP.CARD）

把一组相关信息装进一个容器：标题说清是什么，操作在右上；卡片之间等距；可点的整张卡片有悬停反馈（见卡片悬停）。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-card--overview
对应组件：antd Card；geist （无）

### CMP.CARD.STRUCTURE 标题、内容、操作

卡片标题说清内容是什么（「本月保养」而不是「列表」），操作（更多、刷新、查看全部）放在标题行右侧（extra），最多 2 个；内容区内边距用规范的卡片内边距；底部操作栏只放与卡片内容相关的动作。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：标题、操作与内容
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-card--cmp-card-structure

### CMP.CARD.SPACING 等距与等高

同一行卡片等高、间距一致（取栅格 gutter）；卡片里不再套带边框的卡片，二级分组用分隔线或小标题。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-card--cmp-card-spacing

### CMP.CARD.CLICKABLE 整卡可点要说清

整张卡片可点时，整卡是一个链接或按钮（键盘可聚焦），悬停有反馈；卡片里同时还有其他按钮时，不把整卡做成可点，避免误触。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-card--cmp-card-clickable

## 组件/数据展示 / 走马灯（CMP.CAROUSEL）

轮播：同级内容 3 到 5 张；看得出总数与方向；不自动播放；管理侧工作页不用。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-carousel--overview
对应组件：antd Carousel；geist （无）

### CMP.CAROUSEL.WHEN 什么时候用轮播

用户侧的图片、公告等同级内容才用轮播，3 到 5 张；管理侧的工作页面不用轮播（信息藏在后面的页里，很少有人去翻）。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：带指示与翻页
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-carousel--cmp-carousel-when

### CMP.CAROUSEL.CONTROLS 看得出总数与方向

有上一张 / 下一张按钮与页码指示（每个指示点是带名称的按钮），左右键翻页；读屏知道这是轮播（aria-roledescription）以及当前第几张。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-carousel--cmp-carousel-controls

### CMP.CAROUSEL.AUTOPLAY 不自动播放

默认不自动播放；确需自动播放时提供暂停按钮，鼠标悬停与键盘聚焦时暂停，减少动效时不自动播放。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-carousel--cmp-carousel-autoplay

## 组件/数据展示 / 折叠面板（CMP.COLLAPSE）

折叠面板：长而不规则的内容逐段展开；标题是按钮、报告展开状态；默认展开最常用的一段。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-collapse--overview
对应组件：antd Collapse；geist Collapse

### CMP.COLLAPSE.WHEN 什么时候折叠

内容长、各段相对独立、用户通常只看其中一两段时用折叠面板（常见问题、详情页的次要信息）；需要对比各段时平铺，不折叠。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：手风琴
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-collapse--cmp-collapse-when

### CMP.COLLAPSE.SEMANTICS 标题是按钮

每段标题是按钮，用 aria-expanded 报告展开状态、aria-controls 指向内容；上下键在标题之间移动；展开箭头的方向与状态一致。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-collapse--cmp-collapse-semantics

### CMP.COLLAPSE.MODE 一次一段还是多段

各段之间互不相关、篇幅长时一次只展开一段（手风琴）；用户可能同时对照几段时允许多段展开；默认展开最常用的那一段。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-collapse--cmp-collapse-mode

## 组件/数据展示 / 描述列表（CMP.DESCRIPTIONS）

详情页里成组展示字段：标签与值对齐、分组有标题；空值显示占位；长文本独占一行。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-descriptions--overview
对应组件：antd Descriptions；geist Description

### CMP.DESCRIPTIONS.LAYOUT 标签与值成对对齐

字段按业务分组，每组有标题；桌面端每行 3 列、窄屏 1 列；标签右侧或上方对齐保持全页一致；值可复制的（编号、单号）提供复制按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：分组详情
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-descriptions--cmp-descriptions-layout

### CMP.DESCRIPTIONS.EMPTY 空值显示占位

没有值的字段显示「—」，不留空白也不隐藏字段（隐藏会让用户以为没有这个信息）；值为 0 显示 0。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-descriptions--cmp-descriptions-empty

### CMP.DESCRIPTIONS.LONG 长文本独占一行

备注、地址这类长文本独占一整行（span 全部列），超过 3 行折叠并可展开。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-descriptions--cmp-descriptions-long

## 组件/数据展示 / 空状态（CMP.EMPTY）

没有数据时：说清为什么空、下一步做什么；首次使用、筛选无结果、无权限、出错各用各的文案。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-empty--overview
对应组件：antd Empty；geist Empty State

### CMP.EMPTY.REASON 说清为什么空

空状态写清原因：首次使用（「还没有车辆」）、筛选无结果（「没有符合条件的车辆」）、无权限（「你没有查看车辆的权限」）；出错不用空状态，用错误状态（ERRH）。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：原因 + 下一步
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-empty--cmp-empty-reason

### CMP.EMPTY.NEXT 给出下一步

空状态带一个主要动作（新建、导入、清除筛选、申请权限），有权限才显示新建；不写「暂无数据」就结束。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-empty--cmp-empty-next

### CMP.EMPTY.QUIET 插图克制

表格、卡片里的空状态用简洁的小插图或不用插图；整页空状态可以用插图，但不喧宾夺主。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-empty--cmp-empty-quiet

## 组件/数据展示 / 图片（CMP.IMAGE）

图片：固定宽高比占位不跳布局；懒加载；失败有说明；有替代文字；需要时可看大图。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-image--overview
对应组件：antd Image；geist （无）

### CMP.IMAGE.RATIO 固定宽高比

图片容器先按宽高比占位（4:3、16:9、1:1），加载前后不跳布局；裁切用 cover，需要看全图的（证件、票据）用 contain。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：占位、懒加载、替代文字
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-image--cmp-image-ratio

### CMP.IMAGE.ALT 替代文字

每张图都有替代文字：内容图写图里有什么（「行驶证正面」），装饰图写空串；不写「图片」这类无信息的词。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-image--cmp-image-alt

### CMP.IMAGE.LOADING 懒加载与失败

首屏以外的图片懒加载；加载失败显示占位与说明，不显示破图标；需要看细节的图片提供「查看大图」，大图在对话框里打开，可用 Esc 关闭。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-image--cmp-image-loading

## 组件/数据展示 / 视频（CMP.VIDEO）

视频：原生控件；只预载元数据；有对白要有字幕；只有装饰视频能静音自动播放。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-video--overview
对应组件：antd （无）；geist Video

### CMP.VIDEO.CONTROLS 用原生控件

视频用浏览器原生的 video 控件（键盘、全屏、倍速、画中画都有），外面套固定宽高比的框；不自己画一套播放控件。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：原生控件 + 字幕
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-video--cmp-video-controls

### CMP.VIDEO.CAPTIONS 字幕

有对白或讲解的视频必须带字幕轨（captions），重要内容同时提供文字稿；只有画面的演示视频写明「无对白」。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-video--cmp-video-captions

### CMP.VIDEO.AUTOPLAY 自动播放

只有静音、循环的装饰视频可以自动播放，并且在用户开启减少动效时不播放；只预载元数据（preload=metadata），不在首屏下载整段视频。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-video--cmp-video-autoplay

## 组件/数据展示 / 列表（CMP.LIST）

列表：一行一个对象；标题是链接；元信息与操作对齐；空间小时代替表格。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-list--overview
对应组件：antd List；geist Entity

### CMP.LIST.STRUCTURE 一行一个对象

每行是一个对象：图标或头像 + 标题 + 一行描述 + 元信息 + 操作；行的结构全列表一致；需要按列比较、排序时用表格。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：司机列表
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-list--cmp-list-structure

### CMP.LIST.LINK 标题是链接

整行可点时只有标题是链接，点击区扩展到整行；行内的操作按钮仍可单独聚焦，不把整行包成一个按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-list--cmp-list-link

### CMP.LIST.STATES 加载、空与更多

首次加载用骨架、没有数据用空状态、追加式列表用「加载更多」；列表项超过一屏时考虑分页。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-list--cmp-list-states

## 组件/数据展示 / 气泡卡片（CMP.POPOVER）

气泡卡片：点击打开、可交互的小浮层；焦点进出有序；不放必须完成的长流程。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-popover--overview
对应组件：antd Popover；geist Context Card

### CMP.POPOVER.WHEN 气泡卡片还是文字提示

浮层里有可交互的内容（按钮、链接、表单）或内容较多时用气泡卡片，点击打开；只有一句说明、不可交互的用文字提示。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：点击打开、可交互
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-popover--cmp-popover-when

### CMP.POPOVER.FOCUS 焦点与关闭

打开后焦点进入浮层（或停在触发按钮、Tab 进入浮层），Esc 或点外面关闭并把焦点还给触发按钮；浮层不遮住触发按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-popover--cmp-popover-focus

### CMP.POPOVER.SCOPE 内容克制

气泡卡片放补充信息与简短操作；必须完成的多步流程用对话框或抽屉，不放进气泡卡片。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-popover--cmp-popover-scope

## 组件/数据展示 / 相对时间（CMP.RELATIVE_TIME）

相对时间：「3 分钟前」；带机器可读时间；悬停看绝对时间与时区；自动刷新。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-relative-time--overview
对应组件：antd （无）；geist Relative Time Card

### CMP.RELATIVE_TIME.FORMAT 分档

1 分钟内「刚刚」，1 小时内「N 分钟前」，24 小时内「N 小时前」，7 天内「N 天前」，更早显示日期（见 FORMAT.RELATIVE_TIME）；经格式化注册表输出。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：相对时间 + 绝对时间
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-relative-time--cmp-relative-time-format

### CMP.RELATIVE_TIME.ABSOLUTE 绝对时间可见

用 time 元素并带 datetime 属性；悬停或键盘聚焦时显示带时区的绝对时间；需要审计的场景（日志、审批）直接显示绝对时间。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-relative-time--cmp-relative-time-absolute

### CMP.RELATIVE_TIME.REFRESH 自动刷新

相对时间每分钟刷新一次，不让「刚刚」停留一小时；页面不可见时暂停刷新。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-relative-time--cmp-relative-time-refresh

## 组件/数据展示 / 二维码（CMP.QRCODE）

二维码：留足静区、对比度够；附上原文；内容过长换短链；过期的码要说明。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-qrcode--overview
对应组件：antd QRCode；geist （无）

### CMP.QRCODE.SCAN 能扫

二维码四周留出至少 4 个模块的静区，深色在浅色底上，尺寸不小于 120px；纠错等级默认 M，码上叠图标时用 H。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：最小尺寸 `p.min_size` = 120px（pomaster 预设约定）
- 示例（这样做）：附原文的二维码
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-qrcode--cmp-qrcode-scan

### CMP.QRCODE.TEXT 附上原文

二维码下方附上原文或「复制链接」，扫不了的人（读屏用户、桌面用户）也拿得到内容；二维码本身有可读名称。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-qrcode--cmp-qrcode-text

### CMP.QRCODE.STATUS 过期与刷新

有时效的码（登录码、提货码）显示有效期，过期后盖上「已过期」并提供刷新；内容过长时换成短链，不生成密到扫不出的码。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-qrcode--cmp-qrcode-status

## 组件/数据展示 / 统计数值（CMP.STATISTIC）

指标数值：标签 + 等宽数字 + 单位；趋势用箭头加文字；涨跌好坏按指标定义。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-statistic--overview
对应组件：antd Statistic；geist （无）

### CMP.STATISTIC.FORMAT 数字格式

数值用千分位、等宽数字，单位小一号写在数字后；精度按指标固定（金额 2 位、比例 1 位），经格式化注册表输出。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：指标与趋势
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-statistic--cmp-statistic-format

### CMP.STATISTIC.TREND 趋势

趋势用箭头加文字（「较上周 +12.4%」），写清比较的周期；涨是好是坏按指标定义（等待时长下降是好事），颜色只是辅助。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-statistic--cmp-statistic-trend

### CMP.STATISTIC.ANIMATION 数字变化

数值更新时可以用数字滚动强调变化，只滚动变化的数位，停在最终值；减少动效时直接显示最终值。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-statistic--cmp-statistic-animation

## 组件/数据展示 / 仪表（CMP.GAUGE）

仪表：表示一个比例（用量、满载率、得分）；阈值变色；中心写数字；不用来表示没有上限的值。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-gauge--overview
对应组件：antd Progress.dashboard；geist Gauge、Pie Gauge

### CMP.GAUGE.WHEN 什么时候用仪表

表示一个 0 到 100% 的比例（存储用量、车厢满载率、健康得分）用环形仪表；没有上限的数值用统计数值，进度用进度条。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：阈值变色
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-gauge--cmp-gauge-when

### CMP.GAUGE.THRESHOLD 阈值

按业务阈值变色（例如 ≥70% 警告、≥90% 危险），阈值写在规格里而不是写死在组件里；中心同时写数字，颜色只是辅助。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：警告阈值（%） `p.warning` = 70（pomaster 预设约定）
- 参数：危险阈值（%） `p.danger` = 90（pomaster 预设约定）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-gauge--cmp-gauge-threshold

### CMP.GAUGE.SEMANTICS 可读

仪表有 role=meter 与 aria-valuenow / valuemin / valuemax，以及写明含义的名称（「三组满载率 95%」）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-gauge--cmp-gauge-semantics

## 组件/数据展示 / 表格（CMP.TABLE）

成行成列的数据：表头清楚、数字右对齐、操作列在最右；空、加载、错误三态保持表头；分页或虚拟滚动二选一。大数据与复杂交互见「数据网格」。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-table--overview
对应组件：antd Table；geist Table

### CMP.TABLE.COLUMNS 列的顺序与对齐

第一列放识别对象的名称或编号（可点进详情）；文字左对齐，数字、金额右对齐并用等宽数字，状态、操作居中或左对齐但同表一致；列宽给最小值，超长文本省略并悬停显示全文。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：对齐与操作列
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-table--cmp-table-columns

### CMP.TABLE.ACTIONS 操作列在最右，最多三个

行操作放最右列，最多直接露出 3 个文字按钮，其余收进「更多」下拉；危险操作放最后并二次确认；操作列在横向滚动时固定在右侧。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-table--cmp-table-actions

### CMP.TABLE.STATES 空、加载、错误保持表头

加载时保留表头并在表体显示骨架或加载态；没有数据时表体显示空状态（说明为什么空、能做什么）；出错时表体显示错误与重试，不把整张表换成一句话。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-table--cmp-table-states

### CMP.TABLE.PAGING 分页规则

默认每页 10 或 20 条，可选 10 / 20 / 50 / 100；页码、每页条数与排序写进 URL（STATE.URL）；翻页后回到表格顶部；数据量很大时用服务端分页，不在前端一次拉全量。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-table--cmp-table-paging

## 组件/数据展示 / 时间轴（CMP.TIMELINE）

时间轴：按时间排列事件；最新的在上；状态圆点加文字；进行中的下一步用待定项。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-timeline--overview
对应组件：antd Timeline；geist （无）

### CMP.TIMELINE.ORDER 顺序

记录类的时间轴（操作日志、物流轨迹）最新的在最上面；计划类的（里程碑）按时间先后从上往下；同一页保持一种顺序。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：物流轨迹
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-timeline--cmp-timeline-order

### CMP.TIMELINE.SEMANTICS 语义

时间轴是有序列表；每项的时间用 time 元素；状态圆点只是辅助，标题里写清发生了什么。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-timeline--cmp-timeline-semantics

### CMP.TIMELINE.LENGTH 条目多时

条目超过 20 条时默认只显示最近的若干条，提供「查看全部」；不同类型的事件可以用图标区分，同样配文字。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-timeline--cmp-timeline-length

## 组件/数据展示 / 文字提示（CMP.TOOLTIP）

悬停或聚焦时显示的简短说明：只补充、不承载必需信息；键盘可触达；不放可点内容。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tooltip--overview
对应组件：antd Tooltip；geist Tooltip

### CMP.TOOLTIP.SUPPLEMENT 只补充，不承载必需信息

提示只放补充说明（图标按钮的名称、被截断的全文、禁用原因）；完成任务必需的信息直接写在界面上；提示文字一两句，超过就改用气泡卡片或帮助链接。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：禁用原因
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tooltip--cmp-tooltip-supplement

### CMP.TOOLTIP.A11Y 键盘与读屏可达

触发元素可聚焦，聚焦时也显示提示；提示内容通过 aria-describedby 关联；移动端没有悬停，关键说明不要只放在提示里。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tooltip--cmp-tooltip-a11y

### CMP.TOOLTIP.NO_ACTIONS 提示里不放可点内容

提示里不放按钮、链接；需要交互的用气泡卡片（Popover）；延迟出现（约 100ms）避免划过时闪烁。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tooltip--cmp-tooltip-no-actions

## 组件/数据展示 / 漫游引导（CMP.TOUR）

新功能的分步引导：几步就够；可跳过、可重看；锚定到真实元素；只出现一次。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tour--overview
对应组件：antd Tour；geist （无）

### CMP.TOUR.WHEN 什么时候引导

只为新功能或改动较大的界面做引导，每次 3 到 5 步；引导不能弥补设计本身的问题，能靠界面说清的不靠引导。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：最多步数 `p.max_steps` = 5（pomaster 预设约定）
- 示例（这样做）：锚定到真实元素
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tour--cmp-tour-when

### CMP.TOUR.CONTROL 可跳过、可重看

每一步都有「跳过」「上一步」「下一步」，显示「2 / 4」；Esc 随时退出；帮助菜单里可以重新打开引导。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tour--cmp-tour-control

### CMP.TOUR.ONCE 只出现一次

引导完成或跳过后记住，不在每次进入时都弹；引导期间目标元素高亮，不挡住用户正常操作。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tour--cmp-tour-once

## 组件/数据展示 / 树形控件（CMP.TREE）

树：层级数据的浏览与选择；键盘按 WAI-ARIA 树模式；可勾选时父子联动显示半选。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tree--overview
对应组件：antd Tree；geist File Tree

### CMP.TREE.KEYBOARD 键盘

树是 role=tree，节点是 treeitem；上下键移动、右键展开或进入子节点、左键收起或回到父节点、回车选择；当前节点用 aria-selected 标出。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：组织树
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tree--cmp-tree-keyboard

### CMP.TREE.CHECK 勾选联动

可勾选的树中，勾选父节点等于勾选全部子节点，部分子节点勾选时父节点显示半选（aria-checked=mixed）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tree--cmp-tree-check

### CMP.TREE.LARGE 节点多时

节点多时子节点按需加载（展开时请求），提供搜索并展开匹配节点的祖先；层级超过 4 级时考虑改用别的组织方式。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-tree--cmp-tree-large

## 组件/数据展示 / JSON 查看器（CMP.JSON_VIEW）

只读的 JSON 树：可折叠、默认展开两层；保留字面形式；整段可复制；不执行任何内容。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-json-view--overview
对应组件：antd （无）；geist JSON View

### CMP.JSON_VIEW.WHEN 什么时候用 JSON 查看器

审计日志、Webhook 载荷、接口调试这类结构化数据用 JSON 查看器；给普通用户看的信息整理成描述列表，不直接给 JSON。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：Webhook 载荷
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-json-view--cmp-json-view-when

### CMP.JSON_VIEW.COLLAPSE 折叠

对象与数组可以折叠（按钮带 aria-expanded），折叠后显示项数；默认展开两层，很大的数据默认更浅。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-json-view--cmp-json-view-collapse

### CMP.JSON_VIEW.LITERAL 字面形式与安全

字符串保留引号、null 与布尔值照原样显示，类型配色只是辅助；只读展示，不 eval、不把值当 HTML 渲染；整段可复制。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-json-view--cmp-json-view-literal

## 组件/数据展示 / 中间省略（CMP.MIDDLE_TRUNCATE）

中间省略：长路径、哈希、文件名保留首尾；全文可见可复制。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-middle-truncate--overview
对应组件：antd Typography.ellipsis；geist MiddleTruncate

### CMP.MIDDLE_TRUNCATE.WHEN 什么时候中间省略

结尾最有区分度的长文本（文件路径、哈希、带版本号的文件名、长编号）用中间省略；普通句子用结尾省略。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：保留首尾
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-middle-truncate--cmp-middle-truncate-when

### CMP.MIDDLE_TRUNCATE.FULL_TEXT 全文可见

全文放在 title 与读屏文字里，悬停能看到、读屏读得到；复制时拿到全文而不是带省略号的文本。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-middle-truncate--cmp-middle-truncate-full-text

### CMP.MIDDLE_TRUNCATE.KEEP 保留多少

结尾至少保留扩展名或版本号所在的部分（约一半），开头保留能识别出类别的部分。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-middle-truncate--cmp-middle-truncate-keep

## 组件/数据展示 / 设备外框（CMP.DEVICE_FRAME）

设备外框：说明截图或演示出现在哪个环境；外框是装饰；地址栏只是文字。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-device-frame--overview
对应组件：antd （无）；geist Browser、Phone

### CMP.DEVICE_FRAME.WHEN 什么时候套外框

文档、发布说明、引导页里的截图或演示，需要说明它出现在浏览器还是手机上时套外框；产品界面本身不套外框。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：浏览器外框
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-device-frame--cmp-device-frame-when

### CMP.DEVICE_FRAME.DECORATIVE 外框是装饰

外框对读屏隐藏（aria-hidden），地址栏只是文字、不是可点的链接；框里的截图要有替代文字。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-device-frame--cmp-device-frame-decorative

### CMP.DEVICE_FRAME.SCALE 比例

手机外框按真实设备的宽高比，内容按实际尺寸缩放，不把桌面截图塞进手机框。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-device-frame--cmp-device-frame-scale

## 组件/数据展示 / 书封（CMP.BOOK）

书封：文档、手册的封面卡片；整张是链接；颜色取品牌与功能色；悬停轻微翻开。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-book--overview
对应组件：antd （无）；geist Book

### CMP.BOOK.WHEN 什么时候用书封

帮助中心、知识库首页展示几本手册或指南时用书封卡片，一行 3 到 5 本；普通的链接列表不用书封。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：手册书架
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-book--cmp-book-when

### CMP.BOOK.LINK 整张是链接

整张书封是指向那份文档的链接，可读名称就是书名；不在书封里再放其他按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-book--cmp-book-link

### CMP.BOOK.MOTION 悬停效果

悬停与键盘聚焦时轻微翻开，用户开启减少动效时不动；书名过长时换行，最多三行。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-book--cmp-book-motion

## 组件/数据展示 / 评论（CMP.COMMENT）

评论与回复：作者、时间、正文、操作；回复缩进嵌套最多两层；点赞报告状态。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-comment--overview
对应组件：antd Comment；geist （无）

### CMP.COMMENT.STRUCTURE 结构

每条评论是一个 article：头像 + 作者 + 相对时间 + 正文 + 操作（回复、点赞）；回复缩进嵌套，最多两层，更深的平铺并 @ 被回复的人。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：评论与回复
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-comment--cmp-comment-structure

### CMP.COMMENT.ACTIONS 操作

点赞按钮报告状态（aria-pressed）与计数；回复在原处展开输入框，不跳页；自己的评论提供编辑与删除，删除后保留「该评论已删除」的占位以维持对话结构。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-comment--cmp-comment-actions

### CMP.COMMENT.TIME 时间

时间用相对时间，悬停显示绝对时间；编辑过的评论标出「已编辑」。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-comment--cmp-comment-time

## 组件/数据展示 / 页头（CMP.PAGE_HEADER）

页头：面包屑 + 返回 + 页面唯一的 h1 + 描述 + 主操作；同类页面结构一致。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-page-header--overview
对应组件：antd PageHeader；geist （无）

### CMP.PAGE_HEADER.STRUCTURE 结构

页头从上到下：面包屑（可选）、返回 + 标题（页面唯一的 h1）、一句描述或元信息、右侧的主操作；同类页面的页头结构一致。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：详情页页头
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-page-header--cmp-page-header-structure

### CMP.PAGE_HEADER.ACTIONS 主操作

页头右侧最多一个主按钮，其余用次按钮，超过 3 个收进「更多」；操作针对整个页面的对象，行内对象的操作放在行内。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-page-header--cmp-page-header-actions

### CMP.PAGE_HEADER.TITLE 标题

标题写当前对象或页面名称，与浏览器标签页的 title 对应；返回按钮带名称（「返回车辆列表」）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-display-page-header--cmp-page-header-title

## 组件/反馈 / 警告提示（CMP.ALERT）

页面内常驻的提示条：按语义选类型，写清影响与怎么办；可关闭的只放可以忽略的信息。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-alert--overview
对应组件：antd Alert；geist Note
实验场：`a-alert`，属性 type=info|success|warning|error，message=车辆数据每天 02:00 同步，showIcon=布尔，closable=布尔（https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-alert--playground）

### CMP.ALERT.TYPE 按语义选类型

信息（info）、成功（success）、警告（warning）、错误（error）四类按语义选，不按颜色喜好选；标题一句话说清发生了什么，描述写影响与怎么办。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：写清影响与怎么办
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-alert--cmp-alert-type

### CMP.ALERT.PLACEMENT 放在受影响内容的上方

与整页有关的提示放页面顶部（页头下方），与某个区块有关的放在该区块上方；同一位置最多一条，多条合并或按严重程度只显示最高的。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-alert--cmp-alert-placement

### CMP.ALERT.DISMISS 只有可忽略的才能关

错误和必须处理的警告不可关闭，问题解决后自动消失；可关闭的提示关闭后记住（按用户），不每次刷新都出现。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-alert--cmp-alert-dismiss

## 组件/反馈 / 横幅（CMP.BANNER）

贴着顶部导航的整宽系统消息：一次一条；要处理的给动作；区块内的提示用警告提示。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-banner--overview
对应组件：antd Alert.banner；geist Banner、Project Banner

### CMP.BANNER.WHEN 什么时候用横幅

影响整个系统的消息（计划维护、试用到期、服务降级）用横幅，贴在顶部导航下方、整宽；只和某个区块有关的提示用警告提示，放在区块里。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：整宽系统消息
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-banner--cmp-banner-when

### CMP.BANNER.ONE_AT_A_TIME 一次一条

同一时间只显示一条横幅，按严重程度排队（出错 > 警告 > 信息）；关闭后不在本次会话里再出现，严重的问题解决前不允许关闭。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-banner--cmp-banner-one-at-a-time

### CMP.BANNER.ACTION 要处理的给动作

需要用户处理的横幅（续费、补充资料）带一个动作链接，文案写清不处理的后果与期限；纯通知类不放动作。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-banner--cmp-banner-action

## 组件/反馈 / 侧边抽屉（CMP.DRAWER）

从侧边滑出的面板：用于需要对照页面内容的录入与详情；宽度取档位；有未保存内容时关闭先确认。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-drawer--overview
对应组件：antd Drawer；geist Sheet

### CMP.DRAWER.WHEN 对照页面内容时用抽屉

查看或编辑一条记录、同时需要看着列表或页面时用抽屉；录入超过 5 个字段用抽屉而不是对话框；抽屉里不再打开抽屉（最多两层，第二层更窄）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-drawer--cmp-drawer-when

### CMP.DRAWER.SIZE 宽度取档位

宽度取两档：普通 378px、宽 736px（size="default" / "large"），不随内容随意设宽；窄屏全宽。标题写对象名（「编辑 沪A12345」）。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：操作在底部
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-drawer--cmp-drawer-size

### CMP.DRAWER.CLOSE 未保存先确认

有未保存的修改时，点关闭、遮罩或 Esc 先确认是否放弃；保存成功后关闭抽屉并刷新受影响的列表行，不整页刷新。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-drawer--cmp-drawer-close

## 组件/反馈 / 底部抽屉（CMP.BOTTOM_SHEET）

移动端的底部抽屉：操作菜单与短表单；有把手、可下滑关闭、最高 85% 视口。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-bottom-sheet--overview
对应组件：antd Drawer.bottom；geist Drawer

### CMP.BOTTOM_SHEET.WHEN 什么时候用底部抽屉

移动端的操作菜单（对一个对象的几种操作）和短表单用底部抽屉，拇指够得到；桌面端同样的内容用下拉菜单或侧边抽屉。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：操作菜单
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-bottom-sheet--cmp-bottom-sheet-when

### CMP.BOTTOM_SHEET.HEIGHT 高度与滚动

高度随内容，最高 85% 视口，内容更多时抽屉内部滚动（滚到头不带动底下的页面）；顶部有拖拽把手，下滑或点遮罩关闭，同时保留可点的关闭按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：最大高度 `p.max_height` = 85vh（pomaster 预设约定）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-bottom-sheet--cmp-bottom-sheet-height

### CMP.BOTTOM_SHEET.FOCUS 焦点与安全区

打开后焦点进入抽屉、关闭后回到触发按钮；底部留出设备安全区，按钮不贴着屏幕边缘。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-bottom-sheet--cmp-bottom-sheet-focus

## 组件/反馈 / 全局提示（CMP.MESSAGE）

操作后的轻量全局反馈：一句话、自动消失、不打断；失败与需要处理的不用它。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-message--overview
对应组件：antd message；geist Toast

### CMP.MESSAGE.WHEN 只给轻量的结果

保存、复制、删除成功这类结果用全局提示，一句话说清结果（「已保存」「已复制车牌号」），2–3 秒自动消失；错误需要用户处理时用就地错误或通知，不用一闪而过的提示。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：结果一句话
- 示例（别这样做）：错误一闪而过
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-message--cmp-message-when

### CMP.MESSAGE.ONE 同一时间一条

同类提示合并（连续保存只提示一次），同一时间最多 3 条；页面跳转后上一页的提示不延续。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-message--cmp-message-one

### CMP.MESSAGE.WORDING 措辞用结果

写结果而不是过程（「已删除 3 辆车」，不写「操作成功」）；与按钮名对应（按钮「发布」→ 提示「已发布」）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-message--cmp-message-wording

## 组件/反馈 / 通知提醒框（CMP.NOTIFICATION）

系统级、需要用户知道但不必立刻处理的消息：右上角、停留更久、可关闭、可带一个动作。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-notification--overview
对应组件：antd notification；geist Toast.action

### CMP.NOTIFICATION.WHEN 系统级消息用通知

后台任务完成（导出就绪、导入结束）、他人操作影响到当前用户、连接断开与恢复用通知；当前操作的直接结果用全局提示或就地反馈。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-notification--cmp-notification-when

### CMP.NOTIFICATION.CONTENT 标题、描述、一个动作

标题说清是什么，描述说清影响；最多一个动作（「下载」「查看」）；停留 4–5 秒，带动作或错误类的不自动关闭。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：带动作的通知
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-notification--cmp-notification-content

### CMP.NOTIFICATION.STACK 堆叠有上限

同时最多 3 条，更早的折叠；同一任务的进度与结果更新同一条通知，不新弹一条。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-notification--cmp-notification-stack

## 组件/反馈 / 对话框（CMP.MODAL）

需要用户先做决定的弹窗：只用于短流程与确认；标题是问题或动作，按钮写动作名；可键盘操作与关闭；长表单改抽屉或新页面。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-modal--overview
对应组件：antd Modal；geist Modal

### CMP.MODAL.WHEN 只用于短流程

对话框用于确认、简短的录入（不超过 5 个字段）与需要打断当前流程的决定；字段多、需要对照页面内容的录入用抽屉；更复杂的流程用新页面；不在对话框里再弹对话框。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-modal--cmp-modal-when

### CMP.MODAL.CONTENT 标题与按钮写动作

标题写动作或问题（「删除 3 辆车？」），正文写后果；按钮写具体动作（「删除」「取消」），主按钮在右；危险动作的主按钮用危险样式，默认焦点在取消上。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：动作化的标题与按钮
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-modal--cmp-modal-content

### CMP.MODAL.KEYBOARD 键盘与焦点

打开时焦点进入对话框、在内部循环；Esc 关闭（有未保存内容时先确认）；关闭后焦点回到触发它的元素；遮罩点击是否关闭与 Esc 一致。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-modal--cmp-modal-keyboard

### CMP.MODAL.ASYNC 确认中锁定

点主按钮后按钮进入加载态并锁定，请求完成再关闭；失败时保持打开并显示错误，不丢失用户输入。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-modal--cmp-modal-async

## 组件/反馈 / 危险操作确认（CMP.DESTRUCTIVE_MODAL）

不可逆操作的确认：写清后果；焦点先在取消；确认按钮写动作本身；影响大的要输入名称。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-destructive-modal--overview
对应组件：antd Modal.confirm；geist Destructive Action Modal

### CMP.DESTRUCTIVE_MODAL.CONSEQUENCE 写清后果

标题是问句（「解散浦东车队？」），正文写清删什么、能否恢复、影响谁（「24 辆车会移到未分组，进行中的 3 个订单不受影响，解散后不能恢复」）；不写「确定要执行此操作吗」。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：后果 + 动作本身
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-destructive-modal--cmp-destructive-modal-consequence

### CMP.DESTRUCTIVE_MODAL.FOCUS 焦点与关闭

打开后焦点在「取消」上，回车不会误删；点遮罩不关闭（必须明确选择），Esc 等同取消；确认进行中按钮忙碌、不能重复提交。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-destructive-modal--cmp-destructive-modal-focus

### CMP.DESTRUCTIVE_MODAL.TYPE_TO_CONFIRM 影响大的输入名称

批量删除、清空、解散这类影响大且不可逆的操作，要求输入对象名称后确认按钮才可用；能撤销的删除不用确认，直接做并提供撤销。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-destructive-modal--cmp-destructive-modal-type-to-confirm

## 组件/反馈 / 气泡确认（CMP.POPCONFIRM）

就地的轻量确认：只问一句、可撤回的操作才用；不可撤回或影响大的用对话框。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-popconfirm--overview
对应组件：antd Popconfirm；geist （无）

### CMP.POPCONFIRM.WHEN 轻量确认就地问

删除一条记录、移除一个成员这类影响小、可恢复的操作用气泡确认；批量、不可撤回、影响他人的操作用对话框写清后果。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：一句话确认
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-popconfirm--cmp-popconfirm-when

### CMP.POPCONFIRM.WORDING 问句 + 动作按钮

标题是一句问句，确认按钮写动作名（「移除」「删除」），不写「确定」；危险动作的确认按钮用危险样式。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-popconfirm--cmp-popconfirm-wording

### CMP.POPCONFIRM.ASYNC 确认中加载

确认后按钮显示加载，请求完成再关闭；失败时提示原因并保持原状态。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-popconfirm--cmp-popconfirm-async

## 组件/反馈 / 进度条（CMP.PROGRESS）

长任务的进度：可估计的显示百分比与剩余量，不可估计的显示阶段；超过 10 秒的任务可离开页面后台进行。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-progress--overview
对应组件：antd Progress；geist Progress

### CMP.PROGRESS.DETERMINATE 能估计就显示百分比

能估计进度的任务（导入、导出、上传）显示百分比与已完成数量（「已导入 320 / 1,248 条」）；失败时进度条转为错误态并写原因。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：百分比与数量
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-progress--cmp-progress-determinate

### CMP.PROGRESS.INDETERMINATE 不能估计就显示阶段

无法估计的过程显示当前阶段（「校验中」「写入中」），不用假的百分比；1 秒以内的过程不显示进度（见加载条与延迟出现）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-progress--cmp-progress-indeterminate

### CMP.PROGRESS.BACKGROUND 长任务转后台

超过 10 秒的任务允许离开页面继续，完成后用通知告知；任务可取消时提供取消。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-progress--cmp-progress-background

## 组件/反馈 / 结果与错误（CMP.RESULT）

操作结束或整页不可用的结果页：说清发生了什么、下一步做什么；错误页给可报告的编号。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-result--overview
对应组件：antd Result；geist Error、Error Card

### CMP.RESULT.WHEN 什么时候用结果页

流程的终点（提交成功、处理失败）和整页不可用（403 无权限、404 不存在、500 出错）用结果页；局部的失败用警告提示，不跳结果页。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：无权限
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-result--cmp-result-when

### CMP.RESULT.NEXT_STEP 下一步

每个结果页都有下一步：成功页给「返回列表」「继续添加」，失败页给「重试」「返回修改」，无权限页给「申请权限」或联系人；不让用户停在死胡同。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-result--cmp-result-next-step

### CMP.RESULT.ERROR_DETAIL 错误页的细节

500 这类错误页不暴露堆栈与内部信息，给出可报告的请求编号（可选中复制）；404 说明可能的原因（已删除、链接有误）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-result--cmp-result-error-detail

## 组件/反馈 / 骨架屏（CMP.SKELETON）

首次加载的占位：几何与最终内容一致；延迟出现；只用于首屏，局部刷新用加载态。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-skeleton--overview
对应组件：antd Skeleton；geist Skeleton

### CMP.SKELETON.SHAPE 几何与内容一致

骨架的行数、宽度、头像与图片位置与最终内容一致，加载完成后页面不跳动；宽度逐行变化，不铺满一样长的灰条。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：和内容同形
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-skeleton--cmp-skeleton-shape

### CMP.SKELETON.WHEN 只用于首屏

骨架只用于页面或区块的首次加载；已有内容时的刷新、翻页用局部加载态，保留旧内容直到新内容到达。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-skeleton--cmp-skeleton-when

### CMP.SKELETON.TIMING 延迟出现

加载很快（约 300ms 内）时不显示骨架，避免一闪；出现后至少停留约 300–500ms；骨架的微光动画在减少动效时停止。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：延迟出现 `p.delay` = 300ms（pomaster 预设约定）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-skeleton--cmp-skeleton-timing

## 组件/反馈 / 加载中（CMP.SPIN）

局部加载：只盖住正在加载的区域，延迟出现避免闪烁；整页加载用骨架或加载条。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-spin--overview
对应组件：antd Spin；geist Spinner、Loading Dots

### CMP.SPIN.SCOPE 只盖住正在加载的区域

局部刷新时只在该区域显示加载（spinning 包裹区域），保留原内容的占位，不清空；整页首屏用骨架屏，路由切换用顶部加载条。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：区域加载
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-spin--cmp-spin-scope

### CMP.SPIN.DELAY 延迟出现

加载指示延迟约 200ms 出现，出现后至少显示约 400ms（LOADING.DELAY），避免快速请求时闪一下。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-spin--cmp-spin-delay

### CMP.SPIN.TEXT 久了要说话

超过 2 秒的加载在指示旁写在做什么（「正在汇总 3 个月的数据」）；超过 10 秒提供取消或转后台。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-spin--cmp-spin-text

## 组件/反馈 / 水印（CMP.WATERMARK）

敏感页面的截图追溯：倾斜重复的姓名与工号；是威慑不是安全措施；不挡操作、不影响阅读。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-watermark--overview
对应组件：antd Watermark；geist （无）

### CMP.WATERMARK.WHEN 什么时候加水印

展示个人信息、财务数据的管理侧页面加水印，内容写当前用户的姓名、工号与日期，用于截图追溯；水印是威慑，敏感数据仍靠权限与脱敏保护。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：姓名 + 工号 + 日期
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-watermark--cmp-watermark-when

### CMP.WATERMARK.READABILITY 不影响阅读与操作

水印颜色取半透明的中性色，正文对比度不受影响；水印层不拦截点击与选中，读屏忽略它（aria-hidden）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-watermark--cmp-watermark-readability

### CMP.WATERMARK.CONTENT 水印内容

水印内容来自当前登录用户（服务端下发），不让用户自己填写；不写手机号、证件号这类本身就敏感的信息。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-feedback-watermark--cmp-watermark-content

## 组件/其他 / 固钉（CMP.AFFIX）

滚动时钉住的工具栏与操作条：CSS sticky；钉住后加边线与投影；不遮挡焦点。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-other-affix--overview
对应组件：antd Affix；geist （无）

### CMP.AFFIX.WHEN 钉住什么

长列表的批量操作条、长表单的提交栏、详情页的标签栏在滚动时钉在顶部或底部；一页最多钉一条，不把整块内容钉住。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：钉住的操作条
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-other-affix--cmp-affix-when

### CMP.AFFIX.STICKY 用 sticky，不用滚动监听

钉住用 position: sticky（相对最近的滚动容器），不监听滚动事件去改 top；钉住后加底边线与投影，表示它浮在内容上面。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-other-affix--cmp-affix-sticky

### CMP.AFFIX.FOCUS 不遮挡焦点

钉在顶部时页面设置等高的 scroll-padding-top，钉在底部时设置 scroll-padding-bottom，键盘聚焦的元素不被钉住的条盖住。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-other-affix--cmp-affix-focus

## 组件/其他 / 全局配置（CMP.CONFIG_PROVIDER）

应用根部的全局配置：语言地区、主题、组件默认尺寸；只放一次，组件从这里读。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-other-config-provider--overview
对应组件：antd ConfigProvider、App、LocaleProvider；geist GeistProvider

### CMP.CONFIG_PROVIDER.ROOT_ONCE 只在根部放一次

a-config-provider 放在应用根组件，统一设置 locale（zh_CN）、theme（token 与 algorithm）、componentSize；页面里不再各自包一层改主题，局部例外用嵌套的 ConfigProvider 并写明原因。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：根部统一配置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-other-config-provider--cmp-config-provider-root-once

### CMP.CONFIG_PROVIDER.LOCALE 语言与地区

日期、数字、货币的格式化读这里的地区设置（经格式化注册表），组件内置文案（「确定」「上一页」）跟随语言；语言从用户设置或浏览器语言判断，不按 IP。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-other-config-provider--cmp-config-provider-locale

### CMP.CONFIG_PROVIDER.THEME 主题

主题只通过 ConfigProvider 的 theme 设置（token 覆盖与 darkAlgorithm），不覆盖组件的类名样式；深色模式切换 algorithm，并设置页面的 color-scheme。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-components-other-config-provider--cmp-config-provider-theme

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

- 执行：机器门禁 `format.no-local-pattern`；适用：管理侧与用户侧
- 参数：人民币代码 `p.code` = CNY（Ant Design 设计规范 · 数据格式）
- 参数：小数位 `p.decimals` = 2 个（pomaster 预设约定）
- 硬规范依据：specs/hard/themes/internationalization-and-copywriting.md「货币代码使用 ISO 4217（`CNY`、`USD`、`EUR`）；禁止用 `$`、`￥` 符号硬编码。」
- 示例（这样做）：经格式化注册表输出
- 示例（别这样做）：页面里拼符号和小数
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-global-data-format--format-amount

### FORMAT.DATETIME 日期时间

日期 YYYY-MM-DD，时间 24 小时制 HH:mm:ss，日期与时间之间一个空格；日期区间用「～」，两侧各一个空格；存储用 ISO 8601（UTC），显示按用户时区转换；全部经格式化注册表输出，页面里不手拼格式串。

- 执行：机器门禁 `format.no-local-pattern`；适用：管理侧与用户侧
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

- 执行：机器门禁 `text.no-literal-copy`；适用：管理侧与用户侧
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

- 执行：机器门禁 `text.banned-terms`；适用：管理侧与用户侧
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

## 设计模式/体验管理 / 界面静帧（STILL）

文档、功能卡片、空状态与引导里的产品静帧：像真产品、只给故事主角真实文字、裁切有意图、一个焦点、按展示尺寸设计、动画先定封面帧、用规范组件与图标。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-ui-stills--overview

### STILL.WHEN 什么时候用静帧

要在文档配图、功能介绍卡片、空状态或新手引导里说明「产品长什么样、这里会发生什么」时，用规范组件搭一张产品静帧，不贴真实截图：截图很快过期、带着真实数据、换主题就不对。一张静帧只讲一件事。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：组件搭出来的功能卡片
- 示例（别这样做）：贴一张产品截图
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-ui-stills--still-when

### STILL.RESTRAINT 只给故事主角真实文字

一张静帧里真实的字通常只有 3 到 7 处：标题、被操作的对象、输入的内容和结果；其余位置用占位条，占位条的宽度逐行变化。不要每行都塞真实文本和数字——细节越多越像拼凑的假图；视线落点上不放占位条。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：真实文字处数 `p.real_strings` = 3–7（Stageshow（Benji Taylor 的 agent skill，MIT））
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-ui-stills--still-restraint

### STILL.FRAMING 裁切与出血

裁到故事发生的那块区域，窗口从画面的一边或两边出血；窗口保持原本的比例，不压扁、不整体缩小塞进卡片再四周留等宽空白；页面本身已有底色时不再垫一块底板；画面里不留空着的角落。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-ui-stills--still-framing

### STILL.FOCAL 一个焦点

每张静帧只有一个主角，最重的视觉（实色、字重、阴影）落在它身上；辅助对象（一张回执、一个小卡片）至多一个，压在主体边缘；不用描边光晕去「指」主角，用产品自己的选中态。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-ui-stills--still-focal

### STILL.SCALE 按展示尺寸设计

按最终显示尺寸 1:1 设计：功能卡片约 400×300，侧栏插图更小；手机宽度的版本重新排布，只留动作和可读的字，不是整体缩小——缩小后的小字没人看得清。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：功能卡片尺寸 `p.card` = 400×300（Stageshow（Benji Taylor 的 agent skill，MIT））
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-ui-stills--still-scale

### STILL.POSTER 动画先定封面帧

静帧做成小动画时，先定封面帧：缩略图、截图和减少动效模式都只看到这一帧，它要能单独讲完故事——结果留在画面上，不是变化途中的一帧；动画只演一件事，回到开头时要有看得见的原因（撤销、关闭）或在被遮住时复位。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-ui-stills--still-poster

### STILL.REAL_PARTS 用规范组件与图标

静帧里的按钮、标签、头像、输入框都用 ant-design-vue 组件，不手画；图标只用 @ant-design/icons-vue，同一尺寸；不发明 logo（色块里放一个字母不是 logo）；AI 功能不用闪光、魔杖和紫色当装饰，直接展示它做了什么。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-ui-stills--still-real-parts

## 设计模式/体验管理 / 组件动效（CMOTION）

动效只说明变化：每个动作有原因；出现和离开都有过渡；动关系而不只动对象；数字与文字就地变化；成组只在首次出现时错峰；可以打断；只动 transform 与透明度；减少动效时状态变化仍看得见。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-component-motion--overview

### CMOTION.CAUSE 每个动作有原因

动效由用户操作或数据变化触发，用来说明「刚才发生了什么」；不做自动循环的吸睛动画（呼吸灯、无限脉冲）；同一屏同一时刻只有一处在动。界面反馈和真实产品一样快，只有讲故事的演示动画才放慢。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：无限脉冲吸引注意
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-component-motion--cmotion-cause

### CMOTION.ENTER_EXIT 出现与离开

会出现又消失的元素保持挂载，用状态切换显隐，让离开也有过渡；离开比出现快；面板打开时带着内容一起出现，不先出一块空白再填内容；不要「啪」地插入或消失。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：出现 `p.enter` = 0.2s（token `motion.normal`）
- 参数：离开 `p.exit` = 0.1s（token `motion.fast`）
- 参数：缓动 `p.ease` = cubic-bezier(0.215, 0.61, 0.355, 1)（ant-design-vue 4.2.6 主题种子与派生（seed、genControlHeight、genRadius、genCommonMapToken））
- 演示：展开与收起：同一个按钮、内容一起出现——点按钮：面板高度与透明度一起过渡，收起比展开快；按钮文字在同一个按钮上变化。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-component-motion--cmotion-enter-exit

### CMOTION.RELATIONSHIP 动关系而不只动对象

新增一行时，下面的行一起让位（新行的高度从 0 展开），不是新行凭空出现、其余行跳位；删除时先收起占位再移除；尺寸变化的容器不拉伸里面的文字（用网格行或高度过渡，不用 scale）；列表重排用位置过渡。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：让位时长 `p.duration` = 0.2s（token `motion.normal`）
- 参数：缓动 `p.ease` = cubic-bezier(0.645, 0.045, 0.355, 1)（ant-design-vue 4.2.6 主题种子与派生（seed、genControlHeight、genRadius、genCommonMapToken））
- 演示：新增一行：其余行一起让位
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-component-motion--cmotion-relationship

### CMOTION.VALUE_CHANGE 数字与文字就地变化

数值变化用数字滚动：只滚变化的位，货币符号与千分位不动，用等宽数字，最终值停住；状态词变化（排队中→运行中→已通过）在同一位置滚动或淡入淡出，并按最长的词预留宽度，邻居不跳；按钮文字变化发生在同一个按钮上，不换成另一个按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：数字滚动——点按钮：金额只滚动变化的数位（StdNumberRoll，按 affectUI Number Ticker 的做法实现）。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-component-motion--cmotion-value-change

### CMOTION.STAGGER 成组错峰只在首次出现

只有一组元素首次一起出现时才错峰：按阅读顺序、间隔小、总时长有上限；刷新数据、翻页、筛选时整组一次出现，不逐行飞入；栅格卡片首次进入视口时可以错峰一次。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：错峰间隔 `p.interval` = 60ms（Stageshow（Benji Taylor 的 agent skill，MIT））
- 参数：总时长上限 `p.total` = 400ms（pomaster 推荐默认（数值类决策位的缺省取值））
- 示例（别这样做）：每次刷新逐行飞入
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-component-motion--cmotion-stagger

### CMOTION.INTERRUPT 可以打断

动画进行中用户再次操作，从当前状态反向或继续，不排队等上一段放完；动画期间控件保持可用；状态切换用 CSS transition（天然可打断），不用固定时长的关键帧动画表达状态。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-component-motion--cmotion-interrupt

### CMOTION.PERF 只动 transform 与透明度

过渡只作用于 transform 和 opacity，高度展开用 grid-template-rows 过渡；不过渡 width、height、top、left、margin 这类触发重排的属性；will-change 只在动画期间加在动的那个元素上，不全局铺。

- 执行：机器门禁 `motion.transform-only`；适用：管理侧与用户侧
- 示例（这样做）：位移与透明度
- 示例（别这样做）：过渡布局属性
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-component-motion--cmotion-perf

### CMOTION.REDUCED 减少动效时保留状态变化

减少动效模式下状态变化仍要看得见：淡入淡出或直接切换，去掉位移、缩放、视差和自动播放；数字滚动直接显示最终值；每段关键帧动画都写 prefers-reduced-motion 分支（全局降级见 MOTION.REDUCED）。

- 执行：机器门禁 `motion.reduced-motion`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级」
- 示例（这样做）：关键帧动画的降级分支
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-component-motion--cmotion-reduced

## 设计模式/体验管理 / Bento 栅格（BENTO）

一组格子拼成一张图：一个主角格；格子不全是界面截图，邻格类型交替；同一套外框；跨度取栅格整数；数字格一行写完；窄屏重新排；可点的格整格可点。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-bento-grid--overview

### BENTO.WHEN 什么时候用

功能概览、首页看板入口、发布说明和特性墙用 Bento；表单、明细列表、需要逐项对比的数据不用 Bento，用表格、描述列表或卡片列表。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-bento-grid--bento-when

### BENTO.HERO 一个主角格

一格最大（跨两列或两行），放最主要的信息或画面，其余格支撑它；格子大小相同时，内容和分量要有明显差别，不排成五块一样重的卡片。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：主角格 + 数字格 + 组件格 + 一句话——主角格跨两列并整格可点；数字格一行写完；组件格只截一个控件；一句话格用正文大字。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-bento-grid--bento-hero

### BENTO.KINDS 邻格类型交替

界面格（只截一个组件或一小块界面，不放整个窗口）约占三分之一到一半，其余是大数字、一句话、对象、示意图或一组标志；相邻的格类型不同；窗口外框在一组栅格里至多出现一次；同一段真实文字不在两格里重复。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：界面格占比 `p.ui_share` = 1/3–1/2（Stageshow（Benji Taylor 的 agent skill，MIT））
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-bento-grid--bento-kinds

### BENTO.FRAME 同一套外框

所有格的圆角、格间距、内边距、文案位置一致（文案都在上或都在下）；格间距等于格内边距或其整数分之一；一组栅格只选一种家族：带间距的圆角格，或无间距、用细分割线分格。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：格间距 `p.gap` = 16（token `spacing.lg`）
- 参数：格圆角 `p.radius` = 8（token `radius.lg`）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-bento-grid--bento-frame

### BENTO.SPANS 跨度取栅格整数

用 CSS grid 分格，列数取 24 列栅格的约数（常用 3 列，即每格 8/24），格子跨度是整数列；行高用统一基准；不给格子手写像素宽度。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：手写像素宽度拼格子
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-bento-grid--bento-spans

### BENTO.STAT 数字格一行写完

数字格是一个大数字加一句短标签，数字和单位不换行（white-space: nowrap）；用真实数字，不用「10x」「无限」这类填充；数字紧跟标签或撑满格子，不要钉在高格底部、上面留一大片空。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-bento-grid--bento-stat

### BENTO.RESPONSIVE 窄屏重新排

每格都读得清时才保留两列；手机宽度变单列，主角格在最前；按内容决定断点，不整体等比缩小；窄格里的界面画面重新取景，而不是缩小。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-bento-grid--bento-responsive

### BENTO.CLICK 可点的格整格可点

一格对应一个去处时整格就是一个链接（a 或 button 包住整格），焦点环画在格上；格内不再放第二个去同一处的按钮；悬停反馈按卡片悬停的规则。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-bento-grid--bento-click

## 设计模式/体验管理 / 状态反馈（SFB）

每个数据视图都有完整的状态；反馈出现在动作发生的地方；确认的力度跟操作的分量走；乐观更新只用于可回滚的小操作；能撤销就不弹确认；长操作给进度；读屏能感知状态变化。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-state-feedback--overview

### SFB.STATES 每个视图都有完整状态

每个数据视图都设计并实现这些状态：加载中、空、出错、部分成功、正常，以及无权限和禁用；每种状态在 Storybook 里都能单独看到。空状态给下一步动作，出错给原因和恢复入口。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：同一个视图的五种状态——切换看每种状态：骨架保持内容的几何；空状态给动作；出错保留筛选并给重试；部分成功说清成功几条、失败的怎么办。
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「State Matrix：默认、加载、空、错误、权限、禁用、长文本和小屏等状态。」
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「hover、active、focus、disabled、loading、empty、error 状态完整。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-state-feedback--sfb-states

### SFB.IN_PLACE 反馈出现在动作发生的地方

按钮自己进入加载并在原位给出结果；字段错误挂在字段上；行内操作的结果出现在那一行；不把所有结果都弹到页面顶部，也不用一个轻提示处理所有错误。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「MUST NOT 用一个 Toast 处理所有错误。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-state-feedback--sfb-in-place

### SFB.WEIGHT 确认的力度跟操作的分量走

轻操作（收藏、切换显示）就地变化，不弹提示；普通保存用 message 轻提示；会影响他人或不可逆的操作用结果页或 notification；失败比成功更显眼，并且停留到用户处理。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-state-feedback--sfb-weight

### SFB.OPTIMISTIC 乐观更新只用于可回滚的小操作

点赞、标星、拖动排序这类成功率高、可回滚、影响范围小的操作可以先改界面再发请求，失败时回滚并就地说明；金额、库存、审批、权限这类以服务端结果为准，等返回再更新。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：先改界面，失败回滚
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-state-feedback--sfb-optimistic

### SFB.UNDO 能撤销就不弹确认

可以撤销的删除、归档用「已删除 · 撤销」的提示代替二次确认；真正不可逆的操作才要确认，确认框说清后果（删掉什么、影响谁）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「删除、提交、转账等高风险动作必须提供复核、确认、撤销或等效防错」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-state-feedback--sfb-undo

### SFB.PROGRESS 长操作给进度

超过 1 秒的操作给加载反馈；预计超过 10 秒的给确定进度（百分比或步骤）和预计剩余时间，并允许离开当前页面：转为后台任务，完成后通知并能回到结果。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：需要加载反馈 `p.busy` = 1000ms（Nielsen Norman Group · Response Times: The 3 Important Limits）
- 参数：需要确定进度 `p.determinate` = 10000ms（Nielsen Norman Group · Response Times: The 3 Important Limits）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「长任务异步执行并可恢复。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-state-feedback--sfb-progress

### SFB.LIVE 读屏能感知状态变化

异步结果和进度变化写进 aria-live 区（一般用 polite，阻断性错误用 assertive），不抢焦点；颜色不是唯一的信号，状态都有文字。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「动态状态、异步结果、进度变化必须可在不抢夺焦点的前提下被辅助技术识别」
- 示例（这样做）：状态写进 live 区
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-state-feedback--sfb-live

## 设计模式/体验管理 / 上下文管理（CTX）

保住用户的位置（分页、筛选、滚动、选中）；未保存的内容有去处；就地操作与工具栏一致；当前位置始终可见；切换团队或身份时显式清理；代码里的上下文只放稳定的跨层依赖。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-context--overview

### CTX.PRESERVE 保住用户的位置

从列表进详情再返回，恢复原来的页码、筛选、排序、滚动位置和选中行（筛选与页码在 URL 里，滚动位置用 vue-router 的 scrollBehavior 返回 savedPosition）；能在当前页完成的查看用抽屉，不离开列表。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `context.restore`：实验：返回列表时恢复位置——翻到第 3 页、选中一行、打开详情再返回：正确做法回到原来的页和那一行；错误做法回到第 1 页。
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「返回恢复分页、筛选、排序和必要视图状态。」
- 示例（这样做）：返回时恢复滚动位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-context--ctx-preserve

### CTX.DRAFTS 未保存的内容有去处

表单有改动时离开要提示（页内跳转和关闭页签都拦）；长表单自动保存草稿，草稿按用户隔离、带版本与过期时间，提交成功后清掉；失败的提交保留用户的输入。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「dirty 离开、草稿隔离和版本冲突有策略。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「提交防重复并保留失败输入。」
- 示例（这样做）：离开前拦截
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-context--ctx-drafts

### CTX.INLINE_ACTIONS 就地操作与工具栏一致

行上的「更多」菜单、右键菜单里的操作与工具栏、详情页同名同图标；右键菜单只是快捷方式，不是唯一入口；批量操作出现在选中后的批量栏里，并显示选中了几条。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-context--ctx-inline-actions

### CTX.WAYFINDING 当前位置始终可见

页面标题、导航高亮、面包屑三者一致并与路由同源；每个可分享的视图有深链接，打开深链接得到同样的视图（含筛选与标签页）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「每个页面路由有稳定 name、path、page key、title、权限和布局 meta。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-context--ctx-wayfinding

### CTX.SCOPE_SWITCH 切换团队或身份时显式清理

团队、租户、环境的切换入口全局可见，当前作用域显示在顶部；切换后清掉旧作用域的查询缓存、草稿和订阅，回到新作用域下安全的页面，不把旧数据带到新作用域。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「用户、角色、组织和数据范围切换时清理风险缓存。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-context--ctx-scope-switch

### CTX.PROVIDER 代码里的上下文只放稳定的跨层依赖

provide / inject 只放跨多层、变化少的依赖（主题、当前团队、权限判断函数）；按关注点拆成多个注入键，不放一个大对象；频繁变化的数据走 Pinia 或查询缓存，不经 provide 往下灌。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：按关注点拆分注入键
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-context--ctx-provider

## 设计模式/体验管理 / 侧边栏管理（SIDEBAR）

宽度取规范值；收起后只留图标并有名字；收起状态按用户记住；窄屏变抽屉；当前项与路由同源；最多两级；分组按使用频率；自己滚动、底部固定；键盘可操作。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-sidebar--overview

### SIDEBAR.WIDTH 宽度取规范值

侧边栏展开宽度 200px、收起宽度 80px（a-layout-sider 的缺省值），不按页面各自调；内容放不下时调整菜单文字，不加宽侧边栏。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：展开宽度 `p.width` = 200px（Ant Design 组件 · Layout 布局（Sider 默认宽度与收起宽度））
- 参数：收起宽度 `p.collapsed_width` = 80px（Ant Design 组件 · Layout 布局（Sider 默认宽度与收起宽度））
- 演示：收起与展开——点按钮收起：菜单只留图标，悬停有名字；当前项保持高亮。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-sidebar--sidebar-width

### SIDEBAR.COLLAPSE 收起与展开

收起后只留图标，每项悬停显示名字（a-menu 收起时自带 tooltip）；收起状态按用户记住（偏好存储，按用户隔离）；屏幕宽度低于断点时自动收起成抽屉，点遮罩关闭。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-sidebar--sidebar-collapse

### SIDEBAR.ACTIVE 当前项与路由同源

高亮哪一项由当前路由决定，不另存一份「选中项」状态；刷新后保持；子页面高亮它所属的一级项，父级自动展开。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/permission-and-authorization.md「菜单、路由、按钮、字段和接口使用同一权限语义。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-sidebar--sidebar-active

### SIDEBAR.DEPTH 最多两级

侧边栏最多两级；第三级用页内的标签页或二级导航，不在侧边栏里继续嵌套；只有一个子项的分组不展开，直接放这一项。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-sidebar--sidebar-depth

### SIDEBAR.GROUPS 分组按使用频率

菜单按任务分组、按使用频率排序，最常用的在上；分组标题不可点、不当链接；无权限的菜单项不显示（不显示禁用的菜单项让人猜）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-sidebar--sidebar-groups

### SIDEBAR.SCROLL 自己滚动、底部固定

侧边栏独立滚动，不跟着内容区滚；账户、设置、帮助固定在底部；当前项在可视区外时自动滚到可见。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-sidebar--sidebar-scroll

### SIDEBAR.KEYBOARD 键盘可操作

收起/展开有快捷键并在按钮的提示里写出；菜单可以用 Tab 进入、方向键移动；收起展开后焦点留在切换按钮上。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-sidebar--sidebar-keyboard

## 设计模式/体验管理 / 卡片悬停（HOVER）

悬停只表示可点；幅度克制（边框或阴影升一级，不缩放）；不引起布局移动；键盘焦点的反馈不弱于悬停；触屏不依赖悬停；悬停才出现的操作不挤开内容；时长取 token。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-card-hover--overview

### HOVER.SIGNAL 悬停只表示可点

只有可点的卡片做悬停效果（a-card 的 hoverable）；不可点的卡片悬停没有任何变化，避免让人以为能点。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：可点与不可点——把指针移到两张卡片上对比；用 Tab 键聚焦可点的那张。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-card-hover--hover-signal

### HOVER.SUBTLE 幅度克制

悬停时阴影升一级（hoverable 的缺省效果），边框和背景最多变一档；不缩放卡片、不放大内容、不换颜色主题。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-card-hover--hover-subtle

### HOVER.NO_SHIFT 不引起布局移动

悬停不改卡片尺寸、不改边框宽度、不显示会挤开内容的元素；需要强调时用阴影、outline 或改变边框颜色，宽度不变。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：悬停加粗边框，整排卡片抖动
- 示例（这样做）：只换颜色或加阴影
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-card-hover--hover-no-shift

### HOVER.FOCUS_PARITY 焦点反馈不弱于悬停

可点的卡片能用键盘聚焦（链接或按钮包住整卡，或 tabindex=0 并响应 Enter/空格）；:focus-visible 的反馈不弱于悬停，并且不被遮挡。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 移除焦点轮廓而无同等级可见替代。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-card-hover--hover-focus-parity

### HOVER.TOUCH 触屏不依赖悬停

悬停才显示的操作，在不支持悬停的设备上常显或放进「更多」菜单（用 @media (hover: hover) 区分）；关键信息不只放在悬停提示里。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 仅通过颜色、hover 或 tooltip 传递关键信息。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-card-hover--hover-touch

### HOVER.REVEAL 悬停出现的操作不挤开内容

行或卡片上悬停才出现的操作占位预留（透明度从 0 到 1，不从无到有插入），键盘聚焦到行内时同样出现；离开后收起。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：悬停与聚焦都显示行操作——指针移到行上或用 Tab 聚焦到行内按钮，操作出现；在触屏设备上常显。
- 示例（这样做）：行操作的样式
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-card-hover--hover-reveal

### HOVER.TIMING 时长取 token

悬停进入用快速档（motionDurationFast），离开可以同档；不额外加延迟（提示类除外）。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：悬停过渡 `p.duration` = 0.1s（token `motion.fast`）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-card-hover--hover-timing

## 设计模式/体验管理 / 加载条（LBAR）

选对加载形态；快的请求不显示加载条，出现后至少停留一会儿；不确定进度时缓慢推进、完成时补满；全局只有一条；有确切进度时显示百分比与剩余并能取消；读屏能感知。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-loading-bar--overview

### LBAR.KIND 选对加载形态

页面切换用顶部细加载条；区块首次加载用骨架（保持内容的几何）；按钮触发的操作用按钮自己的加载态；有确切进度的（上传、导出、导入）用确定进度条；不用整页转圈遮住已有内容。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「首屏骨架保持主要布局尺寸。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-loading-bar--lbar-kind

### LBAR.DELAY 快的不显示，出现了停一会儿

请求在延迟阈值内完成就不显示加载条，避免一闪；一旦显示，至少停留最短时长再淡出；两个值全局统一，在 HTTP 客户端或路由层实现，页面不各自写。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：出现延迟 `p.delay` = 200ms（Nielsen Norman Group · Response Times: The 3 Important Limits）
- 参数：最短停留 `p.min_visible` = 400ms（pomaster 推荐默认（数值类决策位的缺省取值））
- 实验 `loading.delay`：实验：加载条的延迟出现与最短停留——分别发一个快请求和一个慢请求：快的不出现加载条；慢的出现后至少停留一会儿再收起。打开「错误做法」看快请求让加载条一闪而过。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-loading-bar--lbar-delay

### LBAR.TRICKLE 不确定进度时缓慢推进

不知道总量时，加载条先快后慢地推进但停在 100% 之前；完成时补满并淡出；失败时也要收起，并在出错的位置给反馈。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-loading-bar--lbar-trickle

### LBAR.SINGLE 全局只有一条

页面级加载条全局只有一个，用计数管理：每个请求开始加一、结束减一，归零才收起；并发请求不各自起一条，也不互相提前收起。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「SHOULD 让 loading 来源唯一，避免重复状态。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-loading-bar--lbar-single

### LBAR.DETERMINATE 确定进度显示百分比与剩余

上传、导出、导入这类有确切进度的操作显示百分比和预计剩余时间，可以取消；超过 10 秒的转后台任务并在完成时通知（见 SFB.PROGRESS）。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：确定进度：百分比、剩余时间、可取消
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-loading-bar--lbar-determinate

### LBAR.A11Y 读屏能感知

进度条带 role=progressbar 与 aria-valuenow（不确定进度时不写 valuenow，所在区域标 aria-busy）；完成和失败写进 aria-live 区。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-experience-loading-bar--lbar-a11y

## 设计模式/数据呈现 / 数据网格（DGRID）

先分清表格与数据网格；列的对齐、冻结与宽度有规则；排序筛选在服务端并进 URL；跨页选择说清范围；大数据虚拟滚动；行内编辑可撤回；密度三档按用户记住；空与加载保持列结构。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-data-grid--overview

### DGRID.WHEN 表格还是数据网格

只读、列不多、一屏看得完的列表用普通表格；需要列配置、冻结列、行内编辑、海量数据滚动、键盘逐格移动的用数据网格；同一个产品里数据网格只用一种实现。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：数据网格实现 `p.grid_library`：待项目决定——数据网格用哪个实现？（候选 ant-design-vue Table + 虚拟滚动 / vxe-table / AG Grid）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-data-grid--dgrid-when

### DGRID.COLUMNS 列的对齐、冻结与宽度

文本左对齐，数字和金额右对齐并用等宽数字，日期统一格式；首列（标识列）冻结在左、操作列冻结在右；列宽有最小值，内容超出时省略并能看全文；用户调整的列宽、顺序、显示的列按用户记住。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：冻结首列与操作列，数字右对齐——横向滚动时首列与操作列保持可见；金额列右对齐、等宽数字。
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「表格、图表、弹层、焦点和状态随主题同步。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-data-grid--dgrid-columns

### DGRID.SORT_FILTER 排序与筛选在服务端并进 URL

数据量超过一页时排序和筛选由服务端完成；当前排序的列有标识、可以取消；筛选条件、排序、页码进 URL，刷新和分享后恢复；表头的列筛选与筛选条共享同一套条件。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「大列表服务端分页，宽表虚拟化。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可分享和可恢复状态进入 URL。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-data-grid--dgrid-sort-filter

### DGRID.SELECTION 跨页选择说清范围

勾选只作用于本页时写明「已选本页 N 条」；需要选中全部结果时给「选择全部 M 条」的明确入口，批量操作按筛选条件在服务端执行，不在前端拉全量；翻页、筛选变化后说清选择是否保留。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-data-grid--dgrid-selection

### DGRID.VIRTUAL 大数据虚拟滚动

行数超过阈值时启用虚拟滚动，行高固定，表头与冻结列保持；不一次渲染全部行；滚动时不做重计算。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：虚拟滚动阈值 `p.virtual_threshold` = 500 个（pomaster 推荐默认（数值类决策位的缺省取值））
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 大列表用普通 `v-for` 渲染全量数据（须虚拟滚动或分页）。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-data-grid--dgrid-virtual

### DGRID.EDIT 行内编辑可撤回

单元格就地编辑：Enter 提交、Esc 取消、Tab 到下一格；校验错误挂在单元格上并能定位；保存失败回滚到原值并说明原因；有未保存的修改时离开要提示；批量粘贴先校验再提交。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「Field Error：可定位到字段/单元格的错误。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-data-grid--dgrid-edit

### DGRID.DENSITY 密度三档按用户记住

紧凑、默认、宽松三档（a-table 的 size: small / middle / large），默认取中档，用户的选择按用户记住；同一页的多个表格用同一档。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-data-grid--dgrid-density

### DGRID.EMPTY_LOADING 空与加载保持列结构

首次加载显示与真实行同高的骨架行，表头和列宽不变；重新查询时保留旧数据并标出「更新中」，不清空闪烁；空结果在表格内给原因和下一步（清除筛选、新建）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「SHOULD 在后台刷新时保留可用旧数据并标识 stale。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-data-grid--dgrid-empty-loading

## 设计模式/数据呈现 / 图表（CHART）

图表库全项目一个；按问题选图；配色取 token、不只靠颜色区分；坐标轴与单位写清，柱状图从 0 开始；提示给精确值与口径；空、加载、出错与列表一致；提供数据表替代；大数据降采样；随容器重绘、卸载时销毁。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--overview

### CHART.LIBRARY 图表库全项目一个

全项目只用一个图表库，经一个封装层（主题、空与出错态、尺寸监听、销毁）使用；图表库按需引入，不在应用入口同步加载。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：图表库 `p.library`：待项目决定——图表用哪个库？（候选 ECharts（按需引入） / @antv/g2）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「路由、图表和重组件按需加载。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--chart-library

### CHART.CHOOSE 按问题选图

先问图要回答什么：随时间的趋势用折线，类别之间比较用柱，构成用堆叠柱（饼图只在 5 类以内、强调占比时用），分布用直方图或箱线图，两个量的关系用散点；一张图只回答一个问题；需要精确值时直接给表格。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：饼图最多类别 `p.pie_max` = 5 个（pomaster 预设约定）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--chart-choose

### CHART.COLOR 配色取 token、不只靠颜色

分类色取规范色板的顺序，系列数有上限，超出合并为「其他」；连续值用单色深浅，正负对比用发散色；状态色只表示状态；不只靠颜色区分系列（加图例、直接标注或线型），对比度满足要求。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--chart-color

### CHART.AXES 坐标轴与单位写清

柱状图纵轴从 0 开始，折线图可以截断但要标明；单位写在轴标题或图注里；刻度 4 到 6 个，数字格式与数据格式规范一致（千分位、单位缩写）；时间轴按时间等距，不按数据点等距。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：纵轴从 0 开始、单位写在图注
- 示例（别这样做）：柱状图纵轴从 40 开始，差距被放大
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--chart-axes

### CHART.TOOLTIP 提示给精确值与口径

悬停显示该点的精确值、单位和口径说明，多系列时同一时刻的值放在一个提示里；图例可点击切换系列；触屏上点按显示提示；关键结论不只放在提示里。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--chart-tooltip

### CHART.STATES 空、加载、出错与列表一致

图表区域在加载、空、出错时保持尺寸不变：加载用骨架，空数据说明原因（时间范围内没有数据），出错给重试；不渲染一张空坐标轴冒充「没有数据」。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 只处理页面背景而遗漏 portal/图表。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--chart-states

### CHART.A11Y 提供数据表替代

每张图有一句话的文字摘要（aria-label 或图注），并能切换到数据表视图或下载数据；颜色之外还有文字或图形区分。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「SHOULD 为复杂图表、媒体提供数据表格、长描述或音频描述。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--chart-a11y

### CHART.PERF 大数据降采样

点数超过阈值时先在服务端聚合或降采样；大量点用 canvas 渲染；聚合计算不放在主线程的渲染路径里；实时图表合并更新、按帧刷新。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：单系列点数上限 `p.max_points` = 2000 个（pomaster 推荐默认（数值类决策位的缺省取值））
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--chart-perf

### CHART.LIFECYCLE 随容器重绘、卸载时销毁

图表跟随容器尺寸重绘（ResizeObserver，加防抖）；组件卸载时 dispose 图表实例并解除监听；主题切换时重新应用主题。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「状态拥有的监听器、计时器、观察器、请求、流、连接、Worker 和对象 URL 必须声明释放时机，并在卸载、身份切换或能力关闭时清理。」
- 示例（这样做）：卸载时销毁
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-charts--chart-lifecycle

## 设计模式/数据呈现 / 报表（REPORT）

报表结构固定（标题与口径、筛选、指标、明细）；口径与数据截至时间写清；筛选与对比期进 URL；合计与小计规则明确；数字格式统一；导出与页面同口径并受权限控制；打印有专门样式；大报表服务端聚合。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-reports--overview

### REPORT.STRUCTURE 报表结构固定

从上到下：报表名称与数据截至时间、筛选与对比、关键指标、图表、明细表；每块都能单独加载和出错；同类报表结构一致，用户换一张报表不用重新学。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：标题与截至时间、筛选、指标、带合计的明细
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-reports--report-structure

### REPORT.DEFINITIONS 口径与截至时间写清

每个指标都有口径说明（悬停或「口径」入口）：计算公式、包含与排除、统计时区；页面显示数据截至时间和数据延迟；口径变化时标出变化点，不把新旧口径的数据画成一条线。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-reports--report-definitions

### REPORT.FILTERS 筛选与对比期进 URL

时间范围、维度筛选、对比期（环比、同比）进 URL，可分享可恢复；默认时间范围固定且写明；对比结果同时给绝对值和变化率。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可分享和可恢复状态进入 URL。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-reports--report-filters

### REPORT.TOTALS 合计与小计规则明确

合计行固定在明细底部（或顶部，全项目一致）；比率类指标的合计按分子分母重新计算，不对各行百分比求和或求平均；不同单位的值不相加；分组小计与总计的口径一致。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-reports--report-totals

### REPORT.NUMBERS 数字格式统一

金额、数量、比率按数据格式规范输出：千分位、固定小数位、单位写在表头或指标名里、负数格式统一；空值显示「—」，和 0 区分开；数字右对齐、用等宽数字。

- 执行：机器门禁 `format.no-local-pattern`；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-reports--report-numbers

### REPORT.EXPORT 导出与页面同口径并受权限控制

导出的数据与页面使用同一组筛选和口径，文件名带报表名与时间范围；大数据量导出走后台任务，给进度并在完成时通知；导出受权限控制并按规则脱敏，导出操作留审计。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 对复制、导出、打印功能实施权限控制与脱敏策略；高敏感字段导出需审计与额外授权。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-reports--report-export

### REPORT.PRINT 打印有专门样式

需要打印的报表提供打印样式：去掉导航与交互控件，表头在每页重复，行不被分页截断，打印页脚写明报表名、筛选条件与截至时间。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：打印样式
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-reports--report-print

### REPORT.PERF 大报表服务端聚合

聚合在服务端完成，前端只拿结果；明细分页或懒加载；同一报表的多个区块并行请求；结果可以缓存，页面显示缓存的生成时间并能手动刷新。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 串行发起可并行的页面初始化请求（须并行或后端聚合）。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-patterns-data-reports--report-perf

## 工程规范 / 前端架构（ARCH）

技术栈以项目基线为准：Vue 3 + TypeScript + Vite、ant-design-vue、vue-router、Pinia、TanStack Query；目录按职责分层，模块只经公开入口互相引用；单文件组件 + 组合式函数；接口客户端由 OpenAPI 生成；表单、路由、类型与测试各有固定做法。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--overview

### ARCH.STACK 技术栈以基线为准，同类库只用一套

框架与配套以项目技术基线（.pomaster/baseline/frontend/stack.yaml）为准：Vue 3 + TypeScript + Vite，组件库 ant-design-vue 4，路由 vue-router，全局状态 Pinia，接口数据 @tanstack/vue-query，单元测试 Vitest。状态与路由用官方方案，不自造替代；基线没登记的库不引入，同一类能力（请求、日期、表单校验、图表）全项目只用一套。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/stacks/vue3/vue3-framework-overlay.md「状态与路由必须选官方方案：新应用状态管理选 Pinia（Vue 核心团队维护；Vuex 已是维护模式），SPA 路由选官方 Vue Router——两者是官方口径，不自造替代。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-stack

### ARCH.LAYOUT 目录按职责分层

src 下按职责分目录：api/（由 OpenAPI 生成的接口客户端与查询）、pages/<模块>/（路由页面）、components/（跨模块、与业务无关的组件）、composables/（组合式函数）、stores/（Pinia，一个 store 一个文件）、router/、locales/、styles/、utils/。每个顶层目录在 README 里写清职责；不新建没有说明的顶层目录。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/architecture-and-module-boundaries.md「顶层目录和模块职责必须文档化。」
- 硬规范依据：specs/hard/themes/architecture-and-module-boundaries.md「MUST NOT 新建无职责说明的顶层目录。」
- 示例（这样做）：目录
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-layout

### ARCH.BOUNDARY 模块只经公开入口互相引用

业务模块之间只经模块的公开入口（index.ts 导出）引用，不引用别的模块内部的文件，页面之间不互相 import；几个模块共同参与的流程放到单独的编排模块；带业务语义的组件不下沉到通用 components/；循环依赖由 lint 检查并阻止。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/architecture-and-module-boundaries.md「模块外部只能通过 Public API 引用。」
- 硬规范依据：specs/hard/themes/architecture-and-module-boundaries.md「MUST NOT 因方便把业务能力放进 shared。」
- 硬规范依据：specs/hard/themes/architecture-and-module-boundaries.md「循环依赖必须被工具检测并阻止。」
- 示例（别这样做）：引用别的模块内部文件
- 示例（这样做）：经公开入口
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-boundary

### ARCH.COMPONENT 组件写法

组件写成单文件组件，用 <script setup lang="ts">；props 与 emits 用 defineProps / defineEmits 的类型声明；可复用的有状态逻辑抽成组合式函数（useXxx，放 composables/），不用 mixin；页面组件负责取数据和路由，展示组件只收 props、发事件。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/stacks/vue3/vue3-framework-overlay.md「组合式函数必须遵守官方约定（命名、入参、返回值、副作用、使用限制），生命周期钩子按官方注册时机使用。」
- 示例（这样做）：类型化的 props 与事件
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-component

### ARCH.UI_LIBRARY 组件库怎么用、怎么改

ant-design-vue 按组件引入（见 PERF.ON_DEMAND_LIBRARY）；主题只经 ConfigProvider 的 theme token 统一定制（见基础篇的色彩与圆角），不在页面里覆盖组件内部类名（.ant-*）或写 !important；需要组件库没有的组件时先在 components/ 里按规范组合，不另装第二套组件库。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/architecture-and-module-boundaries.md「MUST NOT 因方便把业务能力放进 shared。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-ui-library

### ARCH.DATA_LAYER 接口请求层

接口客户端由 OpenAPI 生成（类型同源）；每个资源一组查询与变更的组合式函数（useVehicleList、useUpdateVehicle，基于 @tanstack/vue-query），页面只调这些函数，不直接调 HTTP 客户端；鉴权、CSRF、超时、错误归一在 HTTP 客户端统一处理（见 SEC.CSRF、ROBUST.TIMEOUT、ERRH.NORMALIZE）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「server state 由查询缓存层管理。」
- 示例（这样做）：资源的查询函数
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-data-layer

### ARCH.FORMS 表单

表单用 a-form 绑定独立的表单模型（reactive 对象，不直接绑接口返回的 DTO），校验规则从与接口同源的 schema 生成；提交返回 422 时把字段错误挂回对应字段；初始值、是否改过、提交中留在表单里，不进全局 store。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「表单区分 initial、current、dirty、errors、submitting 和 conflict。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-forms

### ARCH.ROUTING 路由组织

路由表集中在 router/，按模块分组；每个路由懒加载页面组件，在 meta 里声明访问要求与布局（见 GUARD.DECLARE）；路由有稳定的 name，跳转用 name 不拼字符串路径；列表的筛选与分页进 query（见 STATE.URL）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「每个页面路由有稳定 name、path、page key、title、权限和布局 meta。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-routing

### ARCH.TYPES 类型严格、接口类型生成

TypeScript 开 strict，类型检查用 vue-tsc --noEmit 进 CI；接口类型从 OpenAPI 生成，不手写重复的 DTO 类型；不用 any 逃逸，确实不知道类型时用 unknown 再收窄。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/engineering-toolchain-and-dependencies.md「TypeScript 项目必须启用与代码库兼容的严格类型检查；暂不能启用的严格选项必须有范围、Owner、迁移计划和期限。」
- 硬规范依据：specs/hard/themes/engineering-toolchain-and-dependencies.md「MUST NOT 用项目级忽略、`any`、类型断言或关闭规则掩盖局部问题；例外必须最小化并可追踪。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-types

### ARCH.TESTING 测试分层

组合式函数、store 和关键组件用 Vitest + @vue/test-utils 测；关键业务流程用 Playwright 端到端测；接口用 MSW 按 OpenAPI 模拟加载、空、出错、部分成功、正常五种状态。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/testing-and-verification.md「Contract Mock：由正式 schema 生成或校验的 Mock。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-architecture--arch-testing

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

- 执行：机器门禁 `state.store-library`；适用：管理侧与用户侧
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

- 执行：机器门禁 `state.no-direct-request`；适用：管理侧与用户侧
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
- 参数：首屏脚本体积（KB，压缩后） `p.initial_js` = 170（pomaster 推荐默认（数值类决策位的缺省取值））
- 参数：路由分包体积（KB，压缩后） `p.route_chunk` = 100（pomaster 推荐默认（数值类决策位的缺省取值））
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「定义首屏、包体、交互和核心页面预算。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「默认参考目标为 p75 的 LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-budget

### PERF.LAZY_LOAD 按需加载

路由一律懒加载；图表、富文本编辑器、大表格等重组件在用到的页面里按需加载；应用入口（main.ts）不同步引入这些重型依赖；页面先加载核心内容，非核心的延后。

- 执行：机器门禁 `perf.lazy-load`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「路由、图表和重组件按需加载。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 在应用入口同步 import 重型编辑器、图表库或大表组件（首屏重依赖）。」
- 示例（这样做）：路由懒加载
- 示例（别这样做）：入口同步引入图表库
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-lazy-load

### PERF.ON_DEMAND_LIBRARY 组件库按需引入

组件库按需引入，不整包注册：管理侧按组件引入 ant-design-vue；用户侧 Vant 用官方的自动按需引入插件，不与全量引入混用。

- 执行：机器门禁 `perf.no-full-library-import`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/stacks/h5/h5-mobile-overlay.md「Vant 引入必须走官方口径」
- 示例（别这样做）：整包注册
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-on-demand-library

### PERF.LARGE_LISTS 大列表

大列表走服务端分页、筛选、排序（管理侧每页最多 200 条，用户侧每次最多 50 条，与接口分页档一致）；行数多或列很多的表格用虚拟滚动；不用 v-for 一次渲染全量数据。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：管理侧每页上限 `p.admin_max_page_size` = 200 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：用户侧每次上限 `p.public_max_page_size` = 50 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：虚拟滚动阈值 `p.virtual_threshold` = 500 个（pomaster 推荐默认（数值类决策位的缺省取值））
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「大列表服务端分页，宽表虚拟化。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 大列表用普通 `v-for` 渲染全量数据（须虚拟滚动或分页）。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-performance--perf-large-lists

### PERF.INPUT 输入与过期响应

搜索、联想等随输入触发的请求做防抖；新请求发出时取消旧请求；过期的响应不覆盖新状态。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：防抖间隔 `p.debounce` = 300ms（pomaster 推荐默认（数值类决策位的缺省取值））
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

## 工程规范 / 安全（SEC）

不可信内容不进危险渲染；链接与跳转走白名单；状态变更请求带 CSRF 防护；不用 eval 一类动态执行；第三方脚本登记并校验完整性；前端隐藏不是鉴权；敏感值不出现在 URL、日志、埋点和剪贴板；跨窗口消息校验来源。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-security--overview

### SEC.XSS 不可信内容不进危险渲染

不用 v-html 渲染用户输入或接口返回的富文本；确实要渲染富文本时，经项目唯一的净化组件（白名单 sanitizer，如 DOMPurify）输出；不拼接 HTML 字符串。

- 执行：机器门禁 `security.no-unsafe-html`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 使用 `v-html` / `innerHTML` / `dangerouslySetInnerHTML` 渲染不可信内容；富文本必须使用白名单 sanitizer。」
- 示例（别这样做）：直接渲染接口返回的 HTML
- 示例（这样做）：经净化组件
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-security--sec-xss

### SEC.LINKS 链接与跳转走白名单

用户或接口提供的链接只接受 http、https、mailto 协议（拒绝 javascript:、data:）；登录后的回跳地址只接受站内相对路径；新窗口打开外链一律带 rel="noopener noreferrer"。

- 执行：机器门禁 `security.safe-link`；适用：管理侧与用户侧
- 示例（这样做）：回跳地址只认站内路径
- 示例（这样做）：外链
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-security--sec-links

### SEC.CSRF 状态变更请求带 CSRF 防护

所有改变状态的请求（表单、AJAX、上传、批量操作）由 HTTP 客户端统一带上 CSRF token 和自定义请求头；token 不放 URL、不存进脚本可读的存储；业务代码不自己拼这些头。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在表单提交、AJAX/Fetch、上传、批量操作、GraphQL mutation 中携带 CSRF token。」
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 让业务请求自行决定 CSRF/token 头格式。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-security--sec-csrf

### SEC.NO_EVAL 不用动态执行

不用 eval、new Function、字符串形式的 setTimeout / setInterval，不用内联事件属性；生产环境按严格 CSP 部署（script-src 不含 'unsafe-inline' 和 'unsafe-eval'）。

- 执行：机器门禁 `security.no-eval`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 部署 CSP，默认 `default-src 'self'`；脚本/样式/img/font/connect/frame 按业务最小白名单开放。」
- 示例（别这样做）：字符串当代码执行
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-security--sec-no-eval

### SEC.THIRD_PARTY 第三方脚本登记并校验完整性

第三方脚本、iframe、SDK 先登记（负责人、来源域、权限、数据范围、版本、撤除方式）再引入；从 CDN 加载的脚本带 SRI（integrity + crossorigin）；iframe 用 sandbox 收紧能力。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 加载无 SRI/无来源清单的第三方脚本或 iframe。」
- 示例（这样做）：带完整性校验
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-security--sec-third-party

### SEC.AUTHZ_UI 前端隐藏不是鉴权

按权限隐藏或禁用按钮、菜单只是体验；每个接口由后端强制鉴权；前端不拿全量敏感数据再自己过滤或用 CSS 藏起来，按权限脱敏由后端完成。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 用前端隐藏菜单或按钮替代后端鉴权。」
- 硬规范依据：specs/hard/themes/security.md「MUST 后端返回字段按权限脱敏，前端不得获取全量敏感数据后再自行过滤或仅 CSS 隐藏。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-security--sec-authz-ui

### SEC.SENSITIVE 敏感值不外泄

token、密码、身份证号这类敏感原值不写进 console、日志、埋点、错误上报、剪贴板、URL 和下载文件名；错误提示不暴露堆栈、内部路径和内部 ID。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 将敏感原值写入浏览器 console、日志、埋点、错误监控、剪贴板、URL、localStorage、下载文件。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-security--sec-sensitive

### SEC.POSTMESSAGE 跨窗口消息校验来源

postMessage 指定目标 origin，不用 '*'；接收方先校验 event.origin 在白名单内，再按结构解析数据；收到的内容不进 eval 或 innerHTML。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 使用 `postMessage('*')` 或在跨窗口消息中直接执行 eval/innerHTML。」
- 示例（这样做）：校验来源
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-security--sec-postmessage

## 工程规范 / 会话与凭据（SESSION）

凭据放在脚本读不到的地方；Cookie 属性收紧；登录后换会话；空闲与绝对超时；敏感操作重新验证；静默刷新只试一次；登出全面清理并同步到所有标签页；非必要 Cookie 先征得同意。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-session--overview

### SESSION.STORAGE 凭据放在脚本读不到的地方

会话标识与刷新令牌放在 HttpOnly Cookie 里，由后端设置；短期访问令牌只放内存（模块变量或状态库里不持久化的字段）；不存进 localStorage、sessionStorage、IndexedDB，不放进 URL 和 URL 片段。

- 执行：机器门禁 `security.no-token-storage`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 禁止将 session identifier、refresh token、access token、secret、密码等价凭据持久化到 localStorage/sessionStorage/IndexedDB（除非经安全 Owner 批准的短期例外）。」
- 示例（别这样做）：令牌存进 localStorage
- 示例（这样做）：令牌只放内存
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-session--session-storage

### SESSION.COOKIE Cookie 属性收紧

会话类 Cookie 一律 HttpOnly、Secure、SameSite（默认 Lax，跨站场景不需要时用 Strict），优先用 __Host- 前缀（必须 Secure、Path=/、不带 Domain）；Path 与 Domain 取最小范围；Cookie 里不放业务数据和个人信息；前端代码不读写会话 Cookie。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：SameSite `p.same_site`：待项目决定——会话 Cookie 的 SameSite 取 Lax 还是 Strict？（候选 Lax / Strict）
- 参数：Cookie 名前缀 `p.prefix` = __Host-（MDN · Using HTTP cookies（Cookie 前缀与属性））
- 硬规范依据：specs/hard/themes/security.md「MUST 使用双重提交 cookie 或同步器 token；token 必须每次会话/请求不可预测且由后端验证。」
- 示例（这样做）：后端下发的会话 Cookie
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-session--session-cookie

### SESSION.ROTATE 登录后换会话

登录成功、切换租户、提升权限后由后端签发新的会话标识并作废旧的（防会话固定）；前端在这些时刻丢弃内存里的旧令牌和旧的 CSRF token，重新获取。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在登录、切换租户、敏感操作后轮换 CSRF token。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-session--session-rotate

### SESSION.TIMEOUT 空闲与绝对超时

会话同时有空闲超时和绝对超时；空闲超时到期前提示「即将退出」并允许续期；超时后保存可恢复的现场（当前路由、未提交表单的草稿），重新登录后回到原处。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：空闲超时 `p.idle`：待项目决定——空闲多久自动退出？（候选 30 分钟 / 2 小时）
- 参数：绝对超时 `p.absolute`：待项目决定——登录后最长多久必须重新登录？（候选 8 小时 / 24 小时）
- 参数：到期提醒 `p.warn_before`：待项目决定——到期前多久提示？（候选 2 分钟 / 5 分钟）
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-session--session-timeout

### SESSION.STEP_UP 敏感操作重新验证

修改密码、改绑手机、导出敏感数据、批量删除、审批这类高影响操作前要求重新验证身份（输入密码或二次验证），验证结果只对这一次操作有效。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 对导出、删除、审批、批量操作等高影响动作增加二次确认或后端 challenge。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-session--session-step-up

### SESSION.REFRESH 静默刷新只试一次

请求返回 401 时，HTTP 客户端用刷新令牌静默刷新一次（并发的 401 共用同一次刷新），成功后重放原请求；刷新失败就清理会话并带回跳地址去登录；刷新逻辑只在 HTTP 客户端里写一处。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在 token 即将过期前使用 silent refresh 或显式重新认证，不得在 URL 中传递 token。」
- 示例（这样做）：并发 401 共用一次刷新
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-session--session-refresh

### SESSION.LOGOUT 登出全面清理并同步

登出时调用后端注销接口，清空内存令牌、查询缓存、状态库、按用户隔离的存储、订阅、Worker 和长连接；用 BroadcastChannel 通知其他标签页同步登出。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 实现统一登出：清除服务端会话、客户端内存 token、触发所有标签页/Worker 登出事件。」
- 示例（这样做）：多标签页同步登出
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-session--session-logout

### SESSION.CONSENT 非必要 Cookie 先征得同意

统计、广告等非必要 Cookie 和本地存储在用户同意之前不写入；同意可以撤回，撤回后停止加载对应脚本并清理它写下的数据；必要 Cookie 在隐私说明里列明用途。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在用户撤回同意或第三方 SDK 不再需要时停止加载并清理其状态/缓存。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-session--session-consent

## 工程规范 / 防篡改与防劫持（TAMPER）

前端的一切都可被篡改：价格、权限、状态以服务端为准；关键写请求防重放；传输全程 HTTPS 与 HSTS；页面不被别人嵌套（防点击劫持）；外链防反向标签页劫持；本地数据读回先校验；前端混淆不是安全措施。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-tamper--overview

### TAMPER.SERVER_TRUTH 以服务端为准

金额、价格、折扣、库存、权限、审批状态这类业务事实由服务端计算和判定；前端提交用户的意图（选了哪个商品、改成什么），不提交可被改写的结论（总价、是否有权限）；客户端校验只是体验，服务端再校验一遍。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 将客户端校验仅视为 UX 辅助，服务端校验为权威；前端仍需执行同步/异步校验以提升体验。」
- 示例（别这样做）：提交前端算的总价
- 示例（这样做）：只提交意图，总价由后端算
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-tamper--tamper-server-truth

### TAMPER.REPLAY 关键写请求防重放

支付、审批、转账这类关键写请求带一次性随机数和时间戳，由后端校验时效并拒绝重复；需要时对请求体签名（密钥不在前端代码里，由后端按会话下发短期签名凭据）；重放保护与幂等键一起使用。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：时间窗口（秒） `p.window` = 300（pomaster 推荐默认（数值类决策位的缺省取值））
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-tamper--tamper-replay

### TAMPER.TRANSPORT 传输全程 HTTPS

全站 HTTPS 并启用 HSTS；页面不加载任何 HTTP 资源（无混合内容）；接口地址、WebSocket 地址都用 https / wss；证书错误不提供「继续访问」的旁路。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 配置 TLS 1.2+；HTTPS 页面不得加载 HTTP 资源（混合内容）。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-tamper--tamper-transport

### TAMPER.FRAMING 页面不被别人嵌套

响应头设置 CSP frame-ancestors（或 X-Frame-Options），默认禁止被其他站点嵌入 iframe，防点击劫持；确需被嵌入的页面列出允许的来源。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 使用 `X-Frame-Options: DENY/SAMEORIGIN` 或 CSP `frame-ancestors` 防止点击劫持。」
- 示例（这样做）：禁止被嵌入
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-tamper--tamper-framing

### TAMPER.TABNABBING 外链防反向标签页劫持

target=_blank 的链接一律带 rel="noopener noreferrer"；用 window.open 打开外部页面时传 noopener；不把 window.opener 交给外部页面。

- 执行：机器门禁 `security.safe-link`；适用：管理侧与用户侧
- 示例（这样做）：window.open 带 noopener
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-tamper--tamper-tabnabbing

### TAMPER.LOCAL_DATA 本地数据读回先校验

从 localStorage、IndexedDB、URL 参数读回的数据当作不可信输入：校验结构、版本和所属用户，不符合就丢弃并回到默认值；不把本地数据当成权限或业务判定的依据。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「持久化状态必须区分用户/租户/环境命名空间，并在登出、权限收缩或版本不兼容时失效或迁移。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-tamper--tamper-local-data

### TAMPER.OBFUSCATION 前端混淆不是安全措施

代码混淆、禁用右键、反调试只能增加一点阅读成本，不能保护任何秘密：前端代码里不放密钥、内部接口凭据和不该给用户看到的规则；source map 不公开发布（随版本上传到错误监控并限制访问）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/observability-and-analytics.md「source map 与版本对应且受权限保护。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-tamper--tamper-obfuscation

## 工程规范 / 健壮性（ROBUST）

接口数据在边界按契约解析；渲染不怕空值与缺字段；每个请求有超时；离线和弱网有处理；非核心模块失败不影响主流程；界面承受重复与乱序；资源在卸载时清理；输入上限前端先拦。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-robustness--overview

### ROBUST.PARSE 接口数据在边界按契约解析

接口响应在 HTTP 客户端或接口层按契约 schema 解析（类型由 OpenAPI 生成，运行时用 zod 一类校验关键结构）；解析失败归为「契约错误」走错误处理，不把畸形数据交给组件去崩。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「传输成功与业务成功必须分别判断；HTTP 非成功状态、契约解析失败、取消、超时、离线和业务错误不得混为一类。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-robustness--robust-parse

### ROBUST.NULLS 渲染不怕空值与缺字段

可选字段用可选链和明确的默认显示（「—」）；列表字段为空数组、null 或缺失时都能渲染；数字字段区分 0 与空；不在模板里写多层取值链而不设防。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：明确的空值显示
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-robustness--robust-nulls

### ROBUST.TIMEOUT 每个请求有超时

HTTP 客户端给每个请求设超时（上传、导出等长请求单独设）；超时、取消、离线、服务端错误分别处理与提示；超时的请求不自动重发非幂等写操作。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：请求超时（秒） `p.timeout` = 15（pomaster 推荐默认（数值类决策位的缺省取值））
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「HTTP Client 统一处理 base URL、认证、超时、取消、trace 和 envelope。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-robustness--robust-timeout

### ROBUST.OFFLINE 离线和弱网有处理

监听 online / offline：离线时顶部提示并暂停轮询，已输入的内容不丢；恢复后重新校验数据新鲜度并重试读请求；页面从后台或前进后退缓存恢复时同样重新校验。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「页面必须兼容 `pagehide` / `pageshow`、可见性变化和 bfcache 恢复；恢复后重新校验连接、缓存、权限与数据新鲜度。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-robustness--robust-offline

### ROBUST.DEGRADE 非核心模块失败不影响主流程

推荐位、统计 SDK、客服挂件、图表这类非核心模块失败时只在它自己的位置降级（隐藏或显示占位），不阻塞首屏和主流程；第三方 SDK 初始化失败静默降级并上报。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/observability-and-analytics.md「MUST NOT 让 SDK 初始化、遥测缓存或发送重试阻塞首屏、用户操作或错误恢复。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-robustness--robust-degrade

### ROBUST.REPEAT_ORDER 承受重复与乱序

同一事件触发两次、响应乱序到达、组件重复挂载，界面状态都保持正确：请求结果写回前核对请求序号与上下文（见 ASYNC.LATEST），订阅与监听的数量有上限、不随重复挂载增长。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「重复进入、挂载、恢复或重试必须保持资源数量有界，并有自动化证据证明不会重复订阅或产生开放句柄。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-robustness--robust-repeat-order

### ROBUST.CLEANUP 资源在卸载时清理

定时器、事件监听、订阅、观察器、WebSocket、对象 URL 在 onBeforeUnmount（或 effectScope 结束）时释放；路由离开和身份切换时取消进行中的请求。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「路由离开、组件销毁、注销、切换账号/租户、权限变化和功能关闭必须清理对应资源与敏感上下文。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-robustness--robust-cleanup

### ROBUST.LIMITS 输入上限前端先拦

长度、文件大小、文件类型、数量、数值范围的上限与后端契约一致，在前端先拦截并说清限制（还能输入多少字、最大 20 MB）；后端仍是最终校验。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「上传声明 multipart 字段、类型、大小、数量、文件名、校验阶段和安全错误。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-robustness--robust-limits

## 工程规范 / 报错管理（ERRH）

错误归一成统一结构；按状态码分别处理；路由级与区块级错误边界，局部失败不白屏；全局兜底捕获并脱敏上报；文案说清发生了什么、怎么办；不吞错误；错误码到界面状态的映射只有一份。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-error-handling--overview

### ERRH.NORMALIZE 错误归一成统一结构

HTTP 客户端把所有失败归一成一个结构：类别（网络、超时、取消、契约、业务、权限……）、稳定错误码、可显示的文案、traceId、是否可重试、字段错误、建议的恢复动作；页面只消费这个结构，不解析原始响应。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「将原始错误归一化为稳定 code、trace、fieldErrors、retryable 和 recoverAction。」
- 示例（这样做）：统一的错误结构
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-error-handling--errh-normalize

### ERRH.MAPPING 按状态码分别处理

401 走静默刷新或去登录；403 显示无权限状态；404 显示资源不存在；409 给冲突解决（重新加载或比较合并）；422 把字段错误挂到字段；429 按 Retry-After 稍后重试；5xx 与网络错误显示可重试的错误；取消不提示。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「401、403、404、409、422、429、5xx 和网络错误分别处理。」
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「错误码到 UI 状态的映射必须维护在单一事实源 `outputs/frontend/10_planned/api-error-mapping.yaml`，并与契约版本同步。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-error-handling--errh-mapping

### ERRH.BOUNDARY 局部失败不白屏

路由级和区块级都有错误边界（onErrorCaptured 组件包住每个独立区块）：一个区块渲染失败只替换这个区块并给重试，页面其余部分照常可用；路由级边界兜住整页。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `error.boundary`：实验：区块级错误边界——让「回款趋势」区块出错：正确做法只有这一块显示错误并能重试；错误做法整页白屏。
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「分层设置错误边界，局部失败不得导致整页白屏。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-error-handling--errh-boundary

### ERRH.GLOBAL 全局兜底捕获并脱敏上报

注册 app.config.errorHandler、window.onerror 与 unhandledrejection，捕获到的错误先过滤敏感字段再上报，带 traceId、版本、路由；兜底只记录和提示，不吞掉错误继续假装正常。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在前端异常捕获（Error Boundary、window.onerror、unhandledrejection）中过滤敏感字段后再上报监控。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-error-handling--errh-global

### ERRH.MESSAGE 文案说清发生了什么、怎么办

错误文案用用户的话说清发生了什么和下一步（重试、检查网络、联系管理员）；不显示堆栈、内部错误码原文和接口路径；需要反馈时给 traceId 方便复制；同一种错误全站同一句话。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 禁止在错误消息、Toast、Modal、URL、日志、监控 payload 中暴露 token、密码、PII、内部 ID。」
- 示例（别这样做）：把原始错误抛给用户
- 示例（这样做）：说清怎么办
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-error-handling--errh-message

### ERRH.NO_SWALLOW 不吞错误

catch 之后要么处理并告知用户，要么继续向上抛；不写空 catch，不只 console.log 了事；不用 try/catch 包住整段代码掩盖问题。

- 执行：机器门禁 `error.no-empty-catch`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「MUST NOT 吞掉字段错误、冲突或 TraceId。」
- 示例（别这样做）：空 catch
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-error-handling--errh-no-swallow

### ERRH.REPORT 上报可定位、不刷屏

错误上报带版本、环境、页面、操作和 traceId，按去重键合并同类错误并采样；白屏、根组件渲染失败、接口失败率有告警；上报本身失败不影响用户操作。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/observability-and-analytics.md「采集并分类运行错误、Promise rejection、资源失败、接口错误、白屏和根组件渲染失败」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-error-handling--errh-report

## 工程规范 / 保护页（GUARD）

每个路由声明访问要求；守卫集中在路由层；未登录去登录再回来；无权限与不存在有统一的页面；判定完成前不渲染受保护内容；会话过期保住现场；按钮级权限规则统一。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-route-guard--overview

### GUARD.DECLARE 每个路由声明访问要求

路由表的 meta 里声明这个页面要求什么：是否登录、权限码、功能开关、布局；没有声明的路由在开发期就报错，不默认放行。

- 执行：机器门禁 `guard.route-meta`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「每个页面路由有稳定 name、path、page key、title、权限和布局 meta。」
- 示例（这样做）：路由声明访问要求
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-route-guard--guard-declare

### GUARD.CENTRAL 守卫集中在路由层

访问判定只在全局的 router.beforeEach 里做一次（读 meta 与当前会话、权限），页面组件不各自判断；直接输入地址打开的页面同样经过守卫。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `guard.route`：实验：保护页与回跳——以访客、只读成员、管理员身份打开受保护页面：访客去登录并在登录后回到原页面；只读成员看到无权限页；伪造的站外回跳地址被拒绝。
- 硬规范依据：specs/hard/themes/permission-and-authorization.md「直达 URL 仍经过页面权限守卫。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-route-guard--guard-central

### GUARD.LOGIN_REDIRECT 未登录去登录再回来

未登录访问受保护页面时跳到登录页并带上当前地址作回跳；登录成功后回到原页面；回跳地址只接受站内相对路径（见 SEC.LINKS）；登录页本身不再要求登录。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-route-guard--guard-login-redirect

### GUARD.FORBIDDEN 无权限与不存在有统一的页面

无权限显示统一的 403 页（说明缺什么权限、找谁申请），资源不存在显示统一的 404 页（给返回列表的入口）；按安全要求，对不该知道存在与否的资源统一显示 404，不泄露它是否存在。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「401、403、404、500 和资源删除有统一路由策略。」
- 硬规范依据：specs/hard/themes/security.md「MUST 对 401/403/404/409/422/429/5xx 分别处理，避免通过错误差异泄露权限/存在性信息。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-route-guard--guard-forbidden

### GUARD.NO_FLASH 判定完成前不渲染受保护内容

会话和权限还在确认时显示页面级加载，不先渲染受保护内容再跳走（避免闪现敏感信息）；权限数据随会话一次取回并缓存，路由切换时不重复拉取。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-route-guard--guard-no-flash

### GUARD.EXPIRED 会话过期保住现场

停留期间会话过期，下一次请求 401 时先静默刷新一次（见 SESSION.REFRESH）；仍失败就保存现场（路由与未提交的草稿）再去登录，登录后恢复；其他标签页同步处理。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-route-guard--guard-expired

### GUARD.BUTTON 按钮级权限规则统一

页面内的操作按同一套权限判断：没有权限的操作隐藏，或禁用并说明原因（全项目选一种并写明）；同一个操作在列表、详情、右键菜单里的权限判断一致；后端仍然校验。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：无权限操作的呈现 `p.mode`：待项目决定——无权限的操作是隐藏，还是禁用并说明原因？（候选 隐藏 / 禁用并说明原因）
- 硬规范依据：specs/hard/themes/permission-and-authorization.md「SHOULD 对禁用动作展示只读原因。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-route-guard--guard-button

## 工程规范 / 页面加载（PLOAD）

路由分包并预取；首屏骨架保持布局；先框架后数据、核心优先；异步加载的边界给全加载、出错、超时；分包加载失败能自愈；不跳布局；字体与图片有加载策略。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-page-loading--overview

### PLOAD.SPLIT 路由分包并预取

每个路由懒加载成独立分包；导航链接在悬停或进入视口时预取目标路由的分包；首屏只加载当前路由需要的代码。

- 执行：机器门禁 `perf.lazy-load`；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「路由、图表和重组件按需加载。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-page-loading--pload-split

### PLOAD.SKELETON 首屏骨架保持布局

首次加载用与真实内容同几何的骨架（同样的行高、列宽、卡片尺寸），不用整页转圈；骨架只覆盖还没到的区块，已经有的内容先显示。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「首屏骨架保持主要布局尺寸。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-page-loading--pload-skeleton

### PLOAD.PROGRESSIVE 先框架后数据、核心优先

页面框架（导航、标题、工具栏）立即出现；核心数据最先请求并渲染；图表、历史、推荐等非核心区块延后加载或进入视口再加载；多个区块的请求并行。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 串行发起可并行的页面初始化请求（须并行或后端聚合）。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-page-loading--pload-progressive

### PLOAD.ASYNC_BOUNDARY 异步边界给全加载、出错、超时

defineAsyncComponent 一律给 loadingComponent、errorComponent、delay 和 timeout；Suspense 的 fallback 用区块骨架。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：异步组件写全
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-page-loading--pload-async-boundary

### PLOAD.CHUNK_ERROR 分包加载失败能自愈

发布新版本后旧分包不存在（动态 import 失败）时，在 router.onError 里识别分包加载错误，提示「有新版本」并刷新一次到目标地址；同一会话只自动刷新一次，避免循环。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：分包失败刷新一次
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-page-loading--pload-chunk-error

### PLOAD.NO_SHIFT 不跳布局

图片、广告位、异步区块预留尺寸（宽高或 aspect-ratio）；字体加载不引起明显跳动；新内容插在用户视线下方或由用户触发；累计布局偏移守住性能预算。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：CLS（p75） `p.cls` = 0.1（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-page-loading--pload-no-shift

### PLOAD.ASSETS 字体与图片有加载策略

字体用 font-display: swap 并只加载用到的字重；首屏大图预加载，其余图片懒加载（loading="lazy"）并给出响应式尺寸；图标走图标库的按需引入，不加载整套字体图标。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-page-loading--pload-assets

## 工程规范 / 缓存（CACHE）

分清每一层缓存的用途；每类数据定新鲜度；先显示旧数据、后台刷新；写后失效；按身份隔离；持久化只存可过期的非敏感数据；静态资源带指纹、入口页不缓存。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-caching--overview

### CACHE.LAYERS 分清每一层缓存

HTTP 缓存管静态资源；查询缓存（TanStack Query）管接口数据；持久化缓存（localStorage、IndexedDB）只管偏好和离线需要的数据；Service Worker 只在明确需要离线时启用。同一份数据不在两层各缓存一份再手动同步。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「server state 由查询缓存层管理。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-caching--cache-layers

### CACHE.FRESHNESS 每类数据定新鲜度

每类查询明确 staleTime：字典、配置这类少变的长，列表、详情短，实时数据不缓存；缓存保留时间（gcTime）默认 5 分钟，按需调整；默认失败重试 3 次（指数退避），写操作不自动重试。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：缓存保留（gcTime 缺省） `p.gc_time` = 5 分钟（TanStack Query（Vue）· Important Defaults）
- 参数：查询失败重试（缺省） `p.query_retry` = 3 个（TanStack Query（Vue）· Important Defaults）
- 参数：字典新鲜度 `p.dict_stale` = 1800000ms（pomaster 推荐默认（数值类决策位的缺省取值））
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「每个缓存声明 key、参数、身份/权限隔离、stale、保留和失效规则。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-caching--cache-freshness

### CACHE.SWR 先显示旧数据、后台刷新

有缓存时先显示旧数据并标出「更新中」，后台刷新后替换；不在刷新时清空列表造成闪烁；用户正在编辑的数据不被后台刷新覆盖。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.query-cache`：实验：查询缓存与失效——切换筛选看缓存命中；让缓存过期后先显示旧数据再后台刷新；新建一条后对应的 key 失效并重新拉取。
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「SHOULD 在后台刷新时保留可用旧数据并标识 stale。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-caching--cache-swr

### CACHE.INVALIDATE 写后失效

每个写操作声明它影响哪些查询（失效矩阵），成功后精确失效这些 key；不靠全量刷新页面；乐观更新的回滚和失效配套使用（见 STATE.CACHE_KEYS）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「写操作定义依赖失效矩阵。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 成功后遗漏缓存刷新。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-caching--cache-invalidate

### CACHE.ISOLATION 按身份隔离

查询 key 与持久化 key 都带用户、租户、数据范围；登出、切换租户、权限收缩时清理对应缓存；不同身份不复用同一份缓存。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 多个用户、租户或权限范围复用未隔离的 key、数据库或缓存条目。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-caching--cache-isolation

### CACHE.PERSIST 持久化只存可过期的非敏感数据

写进浏览器的缓存登记用途、隔离 key、版本、大小和过期时间；读回先校验版本；不持久化接口的敏感数据和凭据；配额不足或写入失败时降级为只在内存里。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 无限期持久化草稿、文件、接口响应或敏感偏好。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-caching--cache-persist

### CACHE.ASSETS 静态资源带指纹、入口页不缓存

构建产物文件名带内容哈希并长缓存（immutable）；index.html 不缓存或每次校验（no-cache）；Service Worker 的缓存带版本，新版本激活时清理旧缓存。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「Service Worker 与 Cache API 必须限定作用域、版本化缓存、验证响应来源，并在发布和退出策略中清理过期内容。」
- 示例（这样做）：入口页与静态资源的缓存头
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-caching--cache-assets

## 工程规范 / 异步处理（ASYNC）

请求可取消；只认最新一次的结果；无依赖的并行、部分失败要处理；重试只对幂等与可重试错误、指数退避；输入防抖、滚动节流；轮询会暂停会停止；每个 Promise 都有去处。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-async--overview

### ASYNC.CANCEL 请求可取消

请求接受 AbortSignal；重新输入、切换筛选、离开页面、组件卸载时取消进行中的请求；vue-query 会把 signal 传给 queryFn，接口层要接住它。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「查询可取消和丢弃过期响应。」
- 示例（这样做）：把 signal 传下去
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-async--async-cancel

### ASYNC.LATEST 只认最新一次的结果

同一个视图的多次请求，只有最新一次的结果写进界面；写回前核对请求序号和当时的身份、租户、参数，旧的结果丢弃；已取消的请求不提示为错误。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.race`：实验：迟到的响应不写回——快速输入会发出多个请求，响应乱序到达；只有最新一次的结果写进列表。打开「错误做法」看旧结果覆盖新结果。
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「请求结果提交前必须验证身份、租户、权限、参数和请求版本，防止旧上下文结果写回。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-async--async-latest

### ASYNC.PARALLEL 无依赖的并行、部分失败要处理

彼此无关的请求并行发出；需要全部结果时用 Promise.all，允许部分失败时用 Promise.allSettled 并逐项呈现失败；不在循环里逐个 await 彼此无关的请求。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：部分失败逐项呈现
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-async--async-parallel

### ASYNC.RETRY 重试只对幂等与可重试错误

只重试读请求和声明了幂等的写请求，且只在错误可重试时（网络错误、超时、5xx、429）；指数退避加随机抖动，有次数上限，服务端给了 Retry-After 就按它等；重试过程可以取消，用户能看到「正在重试」。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：重试上限 `p.max_attempts` = 3 个（TanStack Query（Vue）· Important Defaults）
- 参数：起始间隔 `p.base_delay` = 1000ms（TanStack Query（Vue）· Important Defaults）
- 实验 `async.retry`：实验：重试与退避——调用一个时好时坏的接口：正确做法按指数退避重试、在上限内成功或明确失败；对不幂等的提交不自动重试。打开「错误做法」看立即重试把接口打爆。
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「重试必须服从幂等性、服务端 `Retry-After` 或受控退避，并能取消；取消或已被替代的请求不得提示为用户错误。」
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「MUST NOT 对非幂等 mutation 默认自动重试。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-async--async-retry

### ASYNC.DEBOUNCE 输入防抖、滚动节流

随输入触发的查询做防抖；滚动、窗口尺寸变化、拖动这类高频事件做节流或合到动画帧；防抖和节流的间隔全项目统一。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：防抖间隔 `p.debounce` = 300ms（pomaster 推荐默认（数值类决策位的缺省取值））
- 参数：节流间隔 `p.throttle` = 100ms（pomaster 推荐默认（数值类决策位的缺省取值））
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「搜索防抖、旧请求取消、过期响应丢弃。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-async--async-debounce

### ASYNC.POLLING 轮询会暂停会停止

后台任务提交后轮询状态：间隔逐步加大，页面隐藏时暂停、回到页面时立即查一次，任务结束或离开页面时停止；能用服务端推送（SSE、WebSocket）就不轮询；同一任务只有一个轮询。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「页面隐藏、冻结或进入前进后退缓存时必须暂停无必要轮询和高频工作；恢复时重新验证数据新鲜度、连接状态和权限上下文。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-async--async-polling

### ASYNC.NO_FLOATING 每个 Promise 都有去处

每个 Promise 要么被 await，要么接上 catch 并处理；异步的事件处理器内部 try/catch，失败走错误处理；不留悬空的 Promise（失败会变成未处理的 rejection）。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：悬空的 Promise
- 示例（这样做）：失败有去处
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-async--async-no-floating

## 工程规范 / 高并发（CONC）

相同的在途请求合并；批量操作有并发上限；多个小请求合成批量接口；收到限流就退避排队；写冲突用版本号；实时推送重连退避、去重保序；高频更新合帧渲染。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-concurrency--overview

### CONC.DEDUP 相同的在途请求合并

同一个查询 key 在途时，新的调用复用同一个请求，不重复发；组件各自用同一个查询，由查询缓存层负责合并（TanStack Query 天然按 key 去重）。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `concurrency.pool`：实验：在途合并与并发上限——三个组件同时要同一份数据：合并成一个请求。批量上传 10 个文件：并发池最多同时 3 个。打开「错误做法」看重复请求和同时发出 10 个请求。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-concurrency--conc-dedup

### CONC.LIMIT 批量操作有并发上限

批量上传、批量导入、批量调用接口用并发池，同时进行的数量有上限，并显示整体进度；单项失败可以单独重试；不一次性发出全部请求。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：并发上限 `p.pool` = 4 个（pomaster 推荐默认（数值类决策位的缺省取值））
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「请求并发安全。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-concurrency--conc-limit

### CONC.BATCH 多个小请求合成批量接口

要对很多对象做同一件事时调用批量接口，或在同一帧内把多个小请求合成一次；不在循环里逐条请求。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：循环里逐条请求
- 示例（这样做）：批量接口
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-concurrency--conc-batch

### CONC.RATE_LIMIT 收到限流就退避排队

收到 429 时读取 Retry-After，在客户端排队等待后再发，界面提示「请求过多，稍后自动重试」；不立即重发，不让多个组件同时各自重试。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「409 返回冲突实体或重新获取方式；429 返回明确退避信息；5xx 不代表所有请求均可重试。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-concurrency--conc-rate-limit

### CONC.VERSION 写冲突用版本号

可编辑的资源带版本号（version、updatedAt 或 ETag），更新时一并提交；后端返回冲突时，给用户重新加载或比较合并的选择，不静默覆盖别人的修改。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「可编辑资源返回 version、updatedAt 或 ETag，并在更新命令携带预期版本。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-concurrency--conc-version

### CONC.REALTIME 实时推送重连退避、去重保序

WebSocket / SSE 断线后指数退避重连，重连后补拉断线期间的数据；消息按 messageId 去重、按序号保序；收到的消息先合并再渲染，不逐条触发整页更新。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「必须定义鉴权、心跳、断线重连、重复、乱序、丢失、回放、完成终止和降级行为。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-concurrency--conc-realtime

### CONC.RENDER 高频更新合帧渲染

行情、日志、进度这类高频数据先进缓冲区，按动画帧（requestAnimationFrame）或固定间隔批量刷新界面；长列表虚拟化；不为每条消息触发一次状态更新。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-concurrency--conc-render

## 工程规范 / 防重复点击（CLICK）

提交中锁住并显示加载；创建类写请求带幂等键；回车与按钮共用一把锁；刷新、点赞这类按钮节流或合并；重复导航不重复入栈；锁定期间有反馈；按钮锁只是体验，后端仍要幂等。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-click-guard--overview

### CLICK.LOCK 提交中锁住并显示加载

点击提交后按钮立即进入 loading（a-button 的 loading 属性）并拒绝再次触发，请求结束（成功或失败）后解锁；锁放在提交函数里，不只靠按钮的禁用样式。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `click.guard`：实验：防重复点击——连点「提交订单」五次：正确做法只发出一个请求，并且带同一个幂等键；错误做法发出五个请求、创建五张订单。
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「提交防重复并保留失败输入。」
- 示例（这样做）：锁在提交函数里
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-click-guard--click-lock

### CLICK.IDEMPOTENCY 创建类写请求带幂等键

创建订单、提交审批、发起支付这类写请求在表单打开时生成一个幂等键，提交和重试都复用它，成功后换新键；按钮锁只是体验保护，重复请求由后端按幂等键识别。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：幂等键请求头 `p.header` = Idempotency-Key（IETF HTTPAPI · The Idempotency-Key HTTP Header Field（草案））
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「前端按钮禁用和 loading 只是体验保护，不构成业务幂等。」
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「MUST NOT 用按钮 loading 代替后端幂等。」
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-click-guard--click-idempotency

### CLICK.ONE_PATH 回车与按钮共用一把锁

表单的回车提交、按钮点击、快捷键都走同一个提交函数、共用同一把锁；不在两个地方各写一份提交逻辑。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-click-guard--click-one-path

### CLICK.THROTTLE 刷新、点赞这类按钮节流或合并

刷新、点赞、收藏、切换这类可以重复触发的操作：刷新按钮在请求进行中不再发新的；点赞收藏先乐观改状态，连续点击只发最后一次的结果（防抖合并）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-click-guard--click-throttle

### CLICK.NAVIGATION 重复导航不重复入栈

连续点击同一个导航入口不重复压入历史记录、不重复打开同一个详情抽屉或新窗口；打开新窗口的操作在窗口打开前锁住。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-click-guard--click-navigation

### CLICK.FEEDBACK 锁定期间有反馈

锁定期间按钮显示加载、文字说明正在做什么（「提交中…」），不静默吞掉点击；超过 1 秒还没结束的给出更明确的进度（见 SFB.PROGRESS）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-click-guard--click-feedback

## 工程规范 / 原型转换（PROTO）

BA 交来的 spec 与 HTML 原型拆成四层：业务事实、信息结构、交互意图原样保留，表现全部丢掉；表现里藏着的事实翻译成语义；冲突进提问；按规范重绘后用同一个抽取器做事实对账。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-prototype-intake--overview

### PROTO.LAYERS 拆成四层，只丢表现

原型按四层读：业务事实（字段、操作、状态、有业务含义的文案）原样保留；信息结构（页面、区域、分组、顺序、主次）保留关系；交互意图（点什么打开什么、提交前校验、删除要确认）保留意图；表现（样式、栅格、间距、字体、组件长相）全部丢掉，由规范重新给出。不同 BA 写的原型结构与风格各不相同，读的是这四层，不是某一种写法。

- 执行：人工评审；适用：管理侧与用户侧
- 对照表「哪些保留、哪些丢掉」（原型里的内容 → 用途）：
  - `字段：标签、类型、必填、枚举值、校验、默认值、格式、能否编辑`：业务事实 · 原样保留
  - `操作：按钮与链接的文字、要求的权限、前置条件、是否二次确认`：业务事实 · 原样保留
  - `状态值与流转、有业务含义的文案（提示条、错误、空状态说明）`：业务事实 · 原样保留
  - `页面清单与页面类型、区域、字段分组与先后顺序、主次`：信息结构 · 保留关系
  - `页面之间与区域之间的跳转：点行开详情、新增开弹窗、返回`：交互意图 · 保留意图
  - `class、内联样式、颜色、字体、字号、间距、圆角、阴影`：表现 · 全部丢掉，改用规范 token
  - `栅格列数、像素宽度、组件库与组件长相、图标库`：表现 · 全部丢掉，改用规范组件
  - `红字表示逾期、星号表示必填、删除线表示作废、右对齐表示金额`：表现里藏着的事实 · 翻译成语义再保留
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-prototype-intake--proto-layers

### PROTO.EXTRACT 去表现化抽取

用 pomaster prototype ingest 读原型：JS 渲染的页面先在浏览器里渲染再读（表格行、弹窗内容常常是脚本生成的）；隐藏的弹窗、抽屉也读，标为条件区域；丢掉 class、style、纯布局的包裹层，只留标题层级、地标、区域、字段、操作、表格（表头与示例行）、标签页、提示文字和状态值；每条事实带出处（文件、节点路径、文本指纹）。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `prototype.convert`：实验：原型转换与事实对账——左边是一份样式很乱的原型片段；点「抽取」得到去掉表现后的大纲与事实清单；「对账」把按规范重绘的版本再抽一次，逐条比较。打开「错误做法」看重绘时漏掉一个字段、改掉一个选项后对账报出的差异。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-prototype-intake--proto-extract

### PROTO.TRANSLATE 表现里藏着的事实翻译成语义

表现里带业务含义的部分翻译成语义再保留，不照抄样子：标签旁的星号 → 必填；红色或绿色的状态文字 → 状态值与它的语气（危险、成功）；删除线 → 作废或删除状态；右对齐的数字列 → 数值列与格式；初始禁用的按钮 → 启用条件（要选中行才能用）；垃圾桶图标 → 删除意图；固定在左右的列 → 冻结列。颜色值、像素、字体名一律不带进实现。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-prototype-intake--proto-translate

### PROTO.SPEC_FACTS spec 里读业务规则

spec 按结构读而不是按格式读：字段表（中文名、英文名、类型、必填、编辑权限、枚举）、SHALL / MUST / 必须 一类规则句、枚举与默认值、状态流转、交互说明表、权限与角色表；每条带章节出处。读不出结构的段落原文保留为待确认的说明，不猜。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-prototype-intake--proto-spec-facts

### PROTO.CONFLICTS 冲突进提问，不自己挑

spec 与 HTML 不一致（必填、枚举、字段有无）、原型与本规范冲突（例如原型每页 1000 条而规范上限 200 条）、原型里有 spec 没写的操作，都进 Question Gate 由人裁决；在裁决之前的默认口径：业务规则以 spec 为准，信息结构以 HTML 为准，呈现以本规范为准，并把这个默认写进提问里。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-prototype-intake--proto-conflicts

### PROTO.MAP 映射到规范，记下依据

页面类型映射到规范的页面模板（列表、详情、表单、看板、向导），区域映射到规范的模式（筛选条、数据列表、描述列表、抽屉、分步表单……），元素映射到规范组件；每个映射在 UX 中间表示里记下依据的规则编号，后来的人和 agent 能复查。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-prototype-intake--proto-map

### PROTO.REBUILD 按规范重绘

重绘时布局、间距、字号、颜色、组件全部来自本规范的 token 与组件；不复制原型的 class、内联样式、字体、颜色值、栅格列数和像素宽度；原型里的分组、顺序、主次和文案保留。原型用了另一套组件库或 CDN 引入的样式框架，实现里都不出现。

- 执行：机器门禁 `style.no-raw-color`；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-prototype-intake--proto-rebuild

### PROTO.VERIFY 用同一个抽取器做事实对账

重绘完成后，用同一个抽取器读重绘后的页面，与事实清单逐条比较：缺失、改动、新增都为零（确需新增的事实走提问记录），同时规范门禁通过，才算转换完成；对账结果作为 verify 的证据。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-prototype-intake--proto-verify

## 工程规范 / 写入规范（SPECW）

规范条文怎么写进项目：每条规则七个字段齐全；条文自足、长期成立——不带引用、版本号、时间戳、记录人；只经 pomaster update spec 写入，写前校验，不合规直接拒绝；pomaster spec-lint 复核已有条文。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-spec-writing--overview

### SPECW.FIELDS 每条规则七个字段齐全

写进项目的每条规则都带齐七个字段：规则、级别、适用范围、理由、检查方式、正例、反例。缺任何一个，写入口直接拒绝并说出缺了哪个。

- 执行：人工评审；适用：管理侧与用户侧
- 级别：MUST
- 适用范围：所有空间的规范条文：前端、前端服务器、后端、数据库、缓存、消息与异步、平台与运维、安全、测试
- 检查方式：pomaster update spec 写前校验（缺字段报 SPEC_UPDATE_FIELDS）
- 理由：只有一句话的规则，读的人不知道管到哪里、为什么、怎么判定；七个字段齐了，人和 AI 才能据此写代码、做评审、接门禁。
- 对照表「七个字段」（字段 → 用途）：
  - `规则（规范原文）`：一句话写清做什么或不做什么，读完就能判断一段代码或一个界面是否合规
  - `级别（--level）`：MUST / MUST NOT / SHOULD；不写时按措辞判
  - `适用范围（--scope）`：哪个空间、哪类对象或哪些路径
  - `理由（--why）`：为什么要这样，违反的后果是什么
  - `检查方式（--check-by）`：门禁检查编号，或评审时具体看什么
  - `正例（--do）`：一个合规的具体写法
  - `反例（--dont）`：一个违规的具体写法
- 示例（这样做）：字段齐全
- 示例（别这样做）：只有一句话：pomaster update spec "列表接口要分页" --by agent:implementer
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-spec-writing--specw-fields

### SPECW.STATEMENT 一条只说一件事，读完能判定

规则正文是一句可判定的话：说清对象和要求，读完就能判断合规与否；两件事拆成两条，形容词换成可检查的条件。

- 执行：人工评审；适用：管理侧与用户侧
- 级别：MUST
- 适用范围：所有规范条文的规则正文
- 检查方式：评审：正文能否直接判定一个具体写法合规与否
- 理由：一条里塞几件事，评审时只要有一件没做到就说不清是哪条没过；「合理」「适当」这类词没法判定。
- 示例（这样做）：可判定：表格的操作列固定在右侧，最多放三个文字按钮，更多操作收进「更多」下拉。
- 示例（别这样做）：没法判定：表格操作要合理布局，按钮数量适当，同时注意性能和权限。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-spec-writing--specw-statement

### SPECW.SELF_CONTAINED 条文自足，不带引用

条文里不放链接、把读者引到别处的措辞、文档路径、章节编号和变更编号；外部材料里的要求直接写成规则本身。

- 执行：人工评审；适用：管理侧与用户侧
- 级别：MUST NOT
- 适用范围：规则、理由、适用范围、检查方式、正例、反例各字段，以及规范文档的正文
- 检查方式：pomaster update spec 写前校验（SPEC_UPDATE_CONTENT）；pomaster spec-lint 复核已有条文
- 理由：引用会过期、会失效，也逼着读的人和 AI 再去找一份文档；写进项目的规范要能单独成立。
- 示例（这样做）：要求写在条文里：所有交互元素都能用键盘到达并操作，Tab 顺序与视觉顺序一致。
- 示例（别这样做）：把读者引到别处：键盘可达性要求详见 docs/a11y.md 第 3 节，另见 PR
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-spec-writing--specw-self-contained

### SPECW.NO_VERSION 不写版本号

条文里不写版本号——带点的版本串、包名加版本、主版本线都不写；用到的库和工具的版本只记在项目技术基线里，条文写成不随版本变的规则。

- 执行：人工评审；适用：管理侧与用户侧
- 级别：MUST NOT
- 适用范围：所有规范条文；版本记录在技术基线（pomaster baseline）
- 检查方式：pomaster update spec 写前校验；pomaster spec-lint 复核已有条文
- 理由：版本一升级，带版本号的条文就过期了，还会和技术基线的记录打架；版本有唯一的记录处，条文只说规则。
- 示例（这样做）：规则不随版本变：组件库按需引入，不整包注册；用到的组件在入口逐个登记。
- 示例（别这样做）：条文里钉版本：使用 ant-design-vue 4.2.6，按需引入组件。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-spec-writing--specw-no-version

### SPECW.TIMELESS 不写时间戳与一次性措辞

条文里不写日期、时刻，也不写只在某一段时间成立的话（指某一轮工作、某个截止点、待办标记）；规则写下就长期成立，什么时候写的由版本库记录。

- 执行：人工评审；适用：管理侧与用户侧
- 级别：MUST NOT
- 适用范围：所有规范条文
- 检查方式：pomaster update spec 写前校验；pomaster spec-lint 复核已有条文
- 理由：带日期的条文让人分不清规则还算不算数；临时的说法写进规范，就会被当成长期规则执行。
- 示例（这样做）：长期成立：金额列右对齐，统一保留两位小数，千分位分隔。
- 示例（别这样做）：带时间：金额列暂时先左对齐，本轮结束后再统一（2026-11-11 定）。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-spec-writing--specw-timeless

### SPECW.NO_PROVENANCE 不写记录人与会话标记

条文里不写是谁写的、在哪次会话或提交里定的（human:<名字>、agent:<名字>、提交哈希、会话编号）；写入口只把记录人放进命令结果。

- 执行：人工评审；适用：管理侧与用户侧
- 级别：MUST NOT
- 适用范围：所有规范条文
- 检查方式：pomaster update spec 写前校验；pomaster spec-lint 复核已有条文
- 理由：规则的效力不取决于谁写的；记录人写进正文只会变成噪音，追溯交给版本库。
- 示例（这样做）：只有规则：删除操作必须二次确认，确认框写明删除对象的名称。
- 示例（别这样做）：带记录人：删除操作必须二次确认（agent:implementer 提议，human:owner 同意）。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-spec-writing--specw-no-provenance

### SPECW.WRITE_PATH 只经写入口写，写后复核

新规范一律用 pomaster update spec 写：它按领域与主题找到该写的位置，写前做字段与内容校验；改动已有条文后跑 pomaster spec-lint，零问题才算写完。

- 执行：人工评审；适用：管理侧与用户侧
- 级别：MUST
- 适用范围：往项目规范里加、改条文的所有操作（人和 AI 都一样）
- 检查方式：pomaster spec-lint 退出码为 0
- 理由：手写容易写错位置、漏字段、夹带引用；走同一个写入口，规范的形态和位置才一致，Storybook 与 AI 读到的才是同一份。
- 示例（这样做）：走写入口并复核
- 示例（别这样做）：直接改文件：打开 .pomaster/specs/hard/themes/security.md，在末尾随手加一行「注意 XSS」。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-engineering-spec-writing--specw-write-path

## 规范空间 / 前端（SPACE.FRONTEND）

浏览器里运行的部分：界面呈现、页面组成、状态与数据、文案与国际化；界面怎么呈现以项目设计规范为准。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-frontend--overview

### SPACE.FRONTEND.SCOPE 管什么

浏览器里运行的部分：界面呈现、页面组成、状态与数据、文案与国际化；界面怎么呈现以项目设计规范为准。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：前端这一层的全部代码与配置
- 检查方式：pomaster standards frontend 看本空间的通用规范与抽屉
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-frontend--space-frontend-scope

### SPACE.FRONTEND.GENERIC 通用规范

这一层的通用规范对所有项目生效，不分语言、框架与架构形态：UI 呈现与设计、页面构成与浏览器环境、前端状态与客户端数据、国际化与文案。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：前端这一层的全部代码与配置
- 检查方式：评审时逐份对照；pomaster standards 列出每份文档在项目里的位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-frontend--space-frontend-generic

### SPACE.FRONTEND.DRAWERS 抽屉

只对某种技术成立的规则放进抽屉：框架与运行时——Vue、React、H5 / 移动端、小程序、Angular、Svelte；产品——Ant Design、Geist、CSS 体系、Tailwind CSS。项目用到哪个抽屉由技术基线的选型与仓库信号判定；预留抽屉第一次写入时建项目抽屉文档。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：前端这一层用到的语言、框架、架构形态与产品
- 检查方式：pomaster standards 标 [生效] 的抽屉；写入用 pomaster update spec --drawer <编号>
- 对照表「抽屉一览」（抽屉 → 用途）：
  - `Vue（vue3）`：框架与运行时：组合式写法、响应式、路由与状态库的用法。
  - `React（react）`：框架与运行时：Hooks 规则、纯渲染、副作用与懒加载。
  - `H5 / 移动端（h5）`：框架与运行时：移动端视口、触控目标、弱网与安全区。
  - `小程序（mini-program）`：框架与运行时：小程序与跨端框架的生命周期、包体与审核约束。
  - `Angular（angular）`：框架与运行时：模块、依赖注入与变更检测。
  - `Svelte（svelte）`：框架与运行时：组件与响应式声明。
  - `Ant Design（antdesign）`：产品：组件库的按需引入、主题 token 与组件用法。
  - `Geist（geist）`：产品：Geist 设计体系的组件与变体词表。
  - `CSS 体系（css）`：产品：样式作用域、token 与重置。
  - `Tailwind CSS（tailwind）`：产品：工具类、主题配置与设计 token 对齐。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-frontend--space-frontend-drawers

## 规范空间 / 前端服务器（SPACE.FRONTEND_SERVER）

浏览器与后端之间的一层：托管静态资源、反向代理与路由转发、HTTPS 与安全响应头、压缩与缓存头、单页应用的路由回退、BFF 与服务端渲染、CDN。前端项目上线都会经过它，规范要显式写出来，不靠默认配置。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-frontend-server--overview

### SPACE.FRONTEND_SERVER.SCOPE 管什么

浏览器与后端之间的一层：托管静态资源、反向代理与路由转发、HTTPS 与安全响应头、压缩与缓存头、单页应用的路由回退、BFF 与服务端渲染、CDN。前端项目上线都会经过它，规范要显式写出来，不靠默认配置。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：前端服务器这一层的全部代码与配置
- 检查方式：pomaster standards frontend_server 看本空间的通用规范与抽屉
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-frontend-server--space-frontend-server-scope

### SPACE.FRONTEND_SERVER.GENERIC 通用规范

这一层的通用规范对所有项目生效，不分语言、框架与架构形态：安全、性能与容量、环境与配置。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：前端服务器这一层的全部代码与配置
- 检查方式：评审时逐份对照；pomaster standards 列出每份文档在项目里的位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-frontend-server--space-frontend-server-generic

### SPACE.FRONTEND_SERVER.DRAWERS 抽屉

只对某种技术成立的规则放进抽屉：产品——Nginx、Kubernetes Ingress、CDN、Apache HTTP Server、Caddy；架构形态——BFF（面向前端的后端）；框架与运行时——服务端渲染。项目用到哪个抽屉由技术基线的选型与仓库信号判定；预留抽屉第一次写入时建项目抽屉文档。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：前端服务器这一层用到的语言、框架、架构形态与产品
- 检查方式：pomaster standards 标 [生效] 的抽屉；写入用 pomaster update spec --drawer <编号>
- 对照表「抽屉一览」（抽屉 → 用途）：
  - `Nginx（nginx）`：产品：反向代理、静态托管、安全头、缓存头与超时。
  - `Kubernetes Ingress（kubernetes-ingress）`：产品：入口路由、TLS 终止与注解约定。
  - `BFF（面向前端的后端）（bff）`：架构形态：聚合接口、裁剪字段、转发鉴权的那一层服务。
  - `服务端渲染（ssr）`：框架与运行时：Nuxt / Next 这类服务端渲染：渲染边界、数据预取、缓存与水合。
  - `CDN（cdn）`：产品：静态资源上 CDN：缓存键、回源、版本化文件名与失效。
  - `Apache HTTP Server（apache-httpd）`：产品：虚拟主机、重写规则与安全头。
  - `Caddy（caddy）`：产品：自动 HTTPS、反向代理与静态托管。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-frontend-server--space-frontend-server-drawers

## 规范空间 / 后端（SPACE.BACKEND）

服务端的业务与接口。通用规范对任何语言、任何架构都成立：接口契约与错误语义、分层与模块边界、鉴权、领域数据、集成与异步、可观测、环境与配置；语言、框架与架构形态的差异放进抽屉。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-backend--overview

### SPACE.BACKEND.SCOPE 管什么

服务端的业务与接口。通用规范对任何语言、任何架构都成立：接口契约与错误语义、分层与模块边界、鉴权、领域数据、集成与异步、可观测、环境与配置；语言、框架与架构形态的差异放进抽屉。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：后端这一层的全部代码与配置
- 检查方式：pomaster standards backend 看本空间的通用规范与抽屉
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-backend--space-backend-scope

### SPACE.BACKEND.GENERIC 通用规范

这一层的通用规范对所有项目生效，不分语言、框架与架构形态：API 契约与错误语义、架构与模块边界、权限与鉴权、值语义与领域数据、集成与异步运行时、可观测性与埋点、环境与配置。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：后端这一层的全部代码与配置
- 检查方式：评审时逐份对照；pomaster standards 列出每份文档在项目里的位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-backend--space-backend-generic

### SPACE.BACKEND.DRAWERS 抽屉

只对某种技术成立的规则放进抽屉：架构形态——模块化单体、微服务、Serverless；语言——Java、Kotlin、PHP、Python、Go、Node.js、C#；框架与运行时——Spring Boot、Spring MVC、Spring WebFlux、Spring Batch、Spring Cloud、Tomcat、Laravel、Symfony、Django、FastAPI、Flask、Gin、NestJS、Express、ASP.NET Core；持久层——MyBatis、JPA / Hibernate、其他 ORM。项目用到哪个抽屉由技术基线的选型与仓库信号判定；预留抽屉第一次写入时建项目抽屉文档。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：后端这一层用到的语言、框架、架构形态与产品
- 检查方式：pomaster standards 标 [生效] 的抽屉；写入用 pomaster update spec --drawer <编号>
- 对照表「抽屉一览」（抽屉 → 用途）：
  - `模块化单体（modular-monolith）`：架构形态：一个部署单元里按业务模块划边界：模块只经公开接口互相调用，数据按模块归属。
  - `微服务（microservices）`：架构形态：按业务能力拆服务：服务边界、服务间契约、分布式事务、服务发现、熔断与限流、链路追踪。
  - `Serverless（serverless）`：架构形态：函数粒度、冷启动、无状态与事件触发。
  - `Java（java）`：语言：语言习惯、空值、异常、并发与集合。
  - `Kotlin（kotlin）`：语言：空安全、协程与数据类。
  - `PHP（php）`：语言：类型声明、依赖管理与请求生命周期。
  - `Python（python）`：语言：类型标注、依赖与虚拟环境、异步。
  - `Go（go）`：语言：错误处理、并发与 context 传递。
  - `Node.js（nodejs）`：语言：事件循环、异步错误、依赖与进程管理。
  - `C#（csharp）`：语言：异步、空引用与依赖注入。
  - `Spring Boot（spring-boot）`：框架与运行时：自动配置、配置绑定、启动与健康检查。
  - `Spring MVC（spring-mvc）`：框架与运行时：控制器、校验、异常映射与过滤器。
  - `Spring WebFlux（spring-webflux）`：框架与运行时：响应式链路、背压与阻塞隔离。
  - `Spring Batch（spring-batch）`：框架与运行时：作业、步骤、重启与幂等。
  - `Spring Cloud（spring-cloud）`：框架与运行时：配置中心、注册发现、网关与熔断。
  - `Tomcat（tomcat）`：框架与运行时：Servlet 容器的线程、连接与超时配置。
  - `Laravel（laravel）`：框架与运行时：路由、Eloquent、队列与中间件。
  - `Symfony（symfony）`：框架与运行时：Bundle、依赖注入与 Doctrine。
  - `Django（django）`：框架与运行时：应用划分、ORM、迁移与中间件。
  - `FastAPI（fastapi）`：框架与运行时：路由、依赖注入、模型校验与异步。
  - `Flask（flask）`：框架与运行时：蓝图、请求上下文与扩展。
  - `Gin（gin）`：框架与运行时：路由组、中间件与绑定校验。
  - `NestJS（nestjs）`：框架与运行时：模块、提供者、守卫与管道。
  - `Express（express）`：框架与运行时：路由、中间件顺序与错误中间件。
  - `ASP.NET Core（aspnet-core）`：框架与运行时：中间件管线、依赖注入与配置。
  - `MyBatis（mybatis）`：持久层：Mapper、动态 SQL、分页与批量。
  - `JPA / Hibernate（jpa）`：持久层：实体映射、懒加载、N+1 与事务边界。
  - `其他 ORM（orm-other）`：持久层：Eloquent、Django ORM、SQLAlchemy、Prisma、GORM 一类 ORM 的查询与迁移约定。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-backend--space-backend-drawers

## 规范空间 / 数据库（SPACE.DATABASE）

持久化数据：模型、迁移、索引与查询、事务与并发、数据生命周期与隐私。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-database--overview

### SPACE.DATABASE.SCOPE 管什么

持久化数据：模型、迁移、索引与查询、事务与并发、数据生命周期与隐私。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：数据库这一层的全部代码与配置
- 检查方式：pomaster standards database 看本空间的通用规范与抽屉
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-database--space-database-scope

### SPACE.DATABASE.GENERIC 通用规范

这一层的通用规范对所有项目生效，不分语言、框架与架构形态：数据与事务、隐私与数据生命周期。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：数据库这一层的全部代码与配置
- 检查方式：评审时逐份对照；pomaster standards 列出每份文档在项目里的位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-database--space-database-generic

### SPACE.DATABASE.DRAWERS 抽屉

只对某种技术成立的规则放进抽屉：产品——MySQL、PostgreSQL、Oracle、SQL Server、MongoDB、SQLite、搜索引擎。项目用到哪个抽屉由技术基线的选型与仓库信号判定；预留抽屉第一次写入时建项目抽屉文档。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：数据库这一层用到的语言、框架、架构形态与产品
- 检查方式：pomaster standards 标 [生效] 的抽屉；写入用 pomaster update spec --drawer <编号>
- 对照表「抽屉一览」（抽屉 → 用途）：
  - `MySQL（mysql）`：产品：字符集、索引、锁与迁移账号。
  - `PostgreSQL（postgresql）`：产品：类型、索引、锁与扩展。
  - `Oracle（oracle）`：产品：序列、分区与 PL/SQL 边界。
  - `SQL Server（sqlserver）`：产品：排序规则、隔离级别与索引。
  - `MongoDB（mongodb）`：产品：文档建模、索引与一致性级别。
  - `SQLite（sqlite）`：产品：单文件库的并发与迁移。
  - `搜索引擎（search-engine）`：产品：Elasticsearch / OpenSearch 的索引设计、同步与查询。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-database--space-database-drawers

## 规范空间 / 缓存（SPACE.CACHE）

为了快而存的副本：缓存什么、放哪一层、键怎么设计、何时失效、穿透击穿雪崩怎么防、与数据库如何保持一致。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-cache--overview

### SPACE.CACHE.SCOPE 管什么

为了快而存的副本：缓存什么、放哪一层、键怎么设计、何时失效、穿透击穿雪崩怎么防、与数据库如何保持一致。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：缓存这一层的全部代码与配置
- 检查方式：pomaster standards cache 看本空间的通用规范与抽屉
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-cache--space-cache-scope

### SPACE.CACHE.GENERIC 通用规范

这一层的通用规范对所有项目生效，不分语言、框架与架构形态：性能与容量、数据与事务。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：缓存这一层的全部代码与配置
- 检查方式：评审时逐份对照；pomaster standards 列出每份文档在项目里的位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-cache--space-cache-generic

### SPACE.CACHE.DRAWERS 抽屉

只对某种技术成立的规则放进抽屉：产品——Redis、本地缓存、Memcached。项目用到哪个抽屉由技术基线的选型与仓库信号判定；预留抽屉第一次写入时建项目抽屉文档。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：缓存这一层用到的语言、框架、架构形态与产品
- 检查方式：pomaster standards 标 [生效] 的抽屉；写入用 pomaster update spec --drawer <编号>
- 对照表「抽屉一览」（抽屉 → 用途）：
  - `Redis（redis）`：产品：键设计、过期、序列化与一致性。
  - `本地缓存（local-cache）`：产品：进程内缓存（Caffeine 一类）的容量、过期与多实例一致。
  - `Memcached（memcached）`：产品：键空间、过期与分片。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-cache--space-cache-drawers

## 规范空间 / 消息与异步（SPACE.MESSAGING）

不在请求里同步完成的工作：消息投递、重试与幂等、顺序、死信、定时任务与后台作业。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-messaging--overview

### SPACE.MESSAGING.SCOPE 管什么

不在请求里同步完成的工作：消息投递、重试与幂等、顺序、死信、定时任务与后台作业。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：消息与异步这一层的全部代码与配置
- 检查方式：pomaster standards messaging 看本空间的通用规范与抽屉
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-messaging--space-messaging-scope

### SPACE.MESSAGING.GENERIC 通用规范

这一层的通用规范对所有项目生效，不分语言、框架与架构形态：集成与异步运行时。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：消息与异步这一层的全部代码与配置
- 检查方式：评审时逐份对照；pomaster standards 列出每份文档在项目里的位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-messaging--space-messaging-generic

### SPACE.MESSAGING.DRAWERS 抽屉

只对某种技术成立的规则放进抽屉：产品——可靠投递（通用）、Kafka、RabbitMQ、RocketMQ。项目用到哪个抽屉由技术基线的选型与仓库信号判定；预留抽屉第一次写入时建项目抽屉文档。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：消息与异步这一层用到的语言、框架、架构形态与产品
- 检查方式：pomaster standards 标 [生效] 的抽屉；写入用 pomaster update spec --drawer <编号>
- 对照表「抽屉一览」（抽屉 → 用途）：
  - `可靠投递（通用）（messaging）`：产品：至少一次投递下的幂等消费、重试、死信与顺序。
  - `Kafka（kafka）`：产品：分区、消费组、位点提交与重平衡。
  - `RabbitMQ（rabbitmq）`：产品：交换机、确认、预取与死信。
  - `RocketMQ（rocketmq）`：产品：事务消息、顺序消息与重试。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-messaging--space-messaging-drawers

## 规范空间 / 平台与运维（SPACE.PLATFORM）

让代码变成在线服务的一切：环境与配置、构建与发布、特性开关、可观测、工具链与依赖、AI 生成代码的约束。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-platform--overview

### SPACE.PLATFORM.SCOPE 管什么

让代码变成在线服务的一切：环境与配置、构建与发布、特性开关、可观测、工具链与依赖、AI 生成代码的约束。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：平台与运维这一层的全部代码与配置
- 检查方式：pomaster standards platform 看本空间的通用规范与抽屉
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-platform--space-platform-scope

### SPACE.PLATFORM.GENERIC 通用规范

这一层的通用规范对所有项目生效，不分语言、框架与架构形态：发布与开关、环境与配置、可观测性与埋点、工程工具链与依赖、AI 生成代码。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：平台与运维这一层的全部代码与配置
- 检查方式：评审时逐份对照；pomaster standards 列出每份文档在项目里的位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-platform--space-platform-generic

### SPACE.PLATFORM.DRAWERS 抽屉

只对某种技术成立的规则放进抽屉：产品——Docker、Kubernetes、GitHub Actions、GitLab CI。项目用到哪个抽屉由技术基线的选型与仓库信号判定；预留抽屉第一次写入时建项目抽屉文档。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：平台与运维这一层用到的语言、框架、架构形态与产品
- 检查方式：pomaster standards 标 [生效] 的抽屉；写入用 pomaster update spec --drawer <编号>
- 对照表「抽屉一览」（抽屉 → 用途）：
  - `Docker（docker）`：产品：镜像分层、非 root、健康检查与体积。
  - `Kubernetes（kubernetes）`：产品：资源配额、探针、滚动发布与配置挂载。
  - `GitHub Actions（github-actions）`：产品：工作流权限、缓存、矩阵与密钥。
  - `GitLab CI（gitlab-ci）`：产品：流水线阶段、缓存与变量保护。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-platform--space-platform-drawers

## 规范空间 / 安全（SPACE.SECURITY）

横贯每一层的防线：输入与输出、认证与会话、授权、敏感数据、依赖与供应链。主动找漏洞的渗透测试放在测试空间。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-security--overview

### SPACE.SECURITY.SCOPE 管什么

横贯每一层的防线：输入与输出、认证与会话、授权、敏感数据、依赖与供应链。主动找漏洞的渗透测试放在测试空间。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：安全这一层的全部代码与配置
- 检查方式：pomaster standards security 看本空间的通用规范与抽屉
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-security--space-security-scope

### SPACE.SECURITY.GENERIC 通用规范

这一层的通用规范对所有项目生效，不分语言、框架与架构形态：安全、权限与鉴权、隐私与数据生命周期。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：安全这一层的全部代码与配置
- 检查方式：评审时逐份对照；pomaster standards 列出每份文档在项目里的位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-security--space-security-generic

## 规范空间 / 测试（SPACE.TESTING）

证明代码做对了的方法。每一类测试对应证据规范：冒烟、单元与集成、回归、白盒、黑盒、渗透与安全、性能、发布与数据迁移；结果按证据入账，没跑的记 NOT_RUN。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-testing--overview

### SPACE.TESTING.SCOPE 管什么

证明代码做对了的方法。每一类测试对应证据规范：冒烟、单元与集成、回归、白盒、黑盒、渗透与安全、性能、发布与数据迁移；结果按证据入账，没跑的记 NOT_RUN。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：测试这一层的全部代码与配置
- 检查方式：pomaster standards testing 看本空间的通用规范与抽屉
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-testing--space-testing-scope

### SPACE.TESTING.GENERIC 通用规范

这一层的通用规范对所有项目生效，不分语言、框架与架构形态：测试与验证、任务治理与验收。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：测试这一层的全部代码与配置
- 检查方式：评审时逐份对照；pomaster standards 列出每份文档在项目里的位置
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-testing--space-testing-generic

### SPACE.TESTING.TYPES 测试类型

测试按要证明的事情分类：冒烟测试、单元 / 组件 / 集成测试、回归测试、白盒测试、黑盒测试、渗透与安全测试、性能与容量测试、发布与数据迁移验证；每一类对应证据规范，结果按证据入账。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的验证工作
- 检查方式：pomaster plan run 与 record gate-run 的结果；没跑的记 NOT_RUN
- 对照表「测试类型与证据」（测试类型 → 用途）：
  - `冒烟测试`：构建通过、应用能起来、主路径走得通——更深的测试之前先过这一关。
  - `单元 / 组件 / 集成测试`：单个函数、组件与模块组合按约定工作。
  - `回归测试`：改动之后，原有行为与界面没有被改坏。
  - `白盒测试`：看着代码测：覆盖率、复杂度（CRAP）、变异测试、死代码与重复、类型与静态检查、架构约定。
  - `黑盒测试`：只看外部行为：端到端、接口契约、业务验收、视觉、可访问性。
  - `渗透与安全测试`：主动找漏洞：注入、越权、敏感信息暴露、依赖漏洞与供应链风险。
  - `性能与容量测试`：在约定的负载下响应时间、吞吐与资源占用达标。
  - `发布与数据迁移验证`：迁移可执行可回退、发布可观测可回滚。
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-standards-space-testing--space-testing-types

## 测试 / 冒烟测试（TEST.SMOKE）

构建通过、应用能起来、主路径走得通——更深的测试之前先过这一关。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-smoke--overview

### TEST.SMOKE.PROVES 证明什么

构建通过、应用能起来、主路径走得通——更深的测试之前先过这一关。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的代码与配置
- 检查方式：verify 时对照验收条目判读
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-smoke--test-smoke-proves

### TEST.SMOKE.EVIDENCE 证据怎么入账

结果按证据规范入账：构建成功、浏览器端到端。真实运行的结果用 pomaster record gate-run 记录；没跑的记 NOT_RUN，不算通过；阈值是项目决策，记在项目质量基线里。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的验证工作
- 检查方式：pomaster plan run 与 record gate-run 的入账结果
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-smoke--test-smoke-evidence

## 测试 / 单元 / 组件 / 集成测试（TEST.UNIT_INTEGRATION）

单个函数、组件与模块组合按约定工作。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-unit-integration--overview

### TEST.UNIT_INTEGRATION.PROVES 证明什么

单个函数、组件与模块组合按约定工作。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的代码与配置
- 检查方式：verify 时对照验收条目判读
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-unit-integration--test-unit-integration-proves

### TEST.UNIT_INTEGRATION.EVIDENCE 证据怎么入账

结果按证据规范入账：单元/组件/集成测试。真实运行的结果用 pomaster record gate-run 记录；没跑的记 NOT_RUN，不算通过；阈值是项目决策，记在项目质量基线里。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的验证工作
- 检查方式：pomaster plan run 与 record gate-run 的入账结果
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-unit-integration--test-unit-integration-evidence

## 测试 / 回归测试（TEST.REGRESSION）

改动之后，原有行为与界面没有被改坏。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-regression--overview

### TEST.REGRESSION.PROVES 证明什么

改动之后，原有行为与界面没有被改坏。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的代码与配置
- 检查方式：verify 时对照验收条目判读
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-regression--test-regression-proves

### TEST.REGRESSION.EVIDENCE 证据怎么入账

结果按证据规范入账：单元/组件/集成测试、浏览器端到端、视觉回归。真实运行的结果用 pomaster record gate-run 记录；没跑的记 NOT_RUN，不算通过；阈值是项目决策，记在项目质量基线里。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的验证工作
- 检查方式：pomaster plan run 与 record gate-run 的入账结果
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-regression--test-regression-evidence

## 测试 / 白盒测试（TEST.WHITE_BOX）

看着代码测：覆盖率、复杂度（CRAP）、变异测试、死代码与重复、类型与静态检查、架构约定。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-white-box--overview

### TEST.WHITE_BOX.PROVES 证明什么

看着代码测：覆盖率、复杂度（CRAP）、变异测试、死代码与重复、类型与静态检查、架构约定。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的代码与配置
- 检查方式：verify 时对照验收条目判读
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-white-box--test-white-box-proves

### TEST.WHITE_BOX.EVIDENCE 证据怎么入账

结果按证据规范入账：测试覆盖率、复杂度风险(CRAP)、变异测试、死代码与重复代码、类型检查与静态检查、架构核查。真实运行的结果用 pomaster record gate-run 记录；没跑的记 NOT_RUN，不算通过；阈值是项目决策，记在项目质量基线里。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的验证工作
- 检查方式：pomaster plan run 与 record gate-run 的入账结果
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-white-box--test-white-box-evidence

### TEST.WHITE_BOX.DISCIPLINE 写测试的纪律

改代码前先写一个会失败的测试，看它因预期的原因失败，再做让它通过的最小改动；测试按使用者的方式调用、检查使用者看得到的结果——所有函数都返回空时仍能通过的测试要删掉；单个函数的 CRAP 超过项目质量基线里的阈值就拆分或补测；变异测试里存活的变异用新测试杀掉，覆盖不到的死代码删掉。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的代码与测试
- 检查方式：评审时看测试是否先于实现失败过；CRAP 与变异结果按证据规范入账，没跑的记 NOT_RUN
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-white-box--test-white-box-discipline

## 测试 / 黑盒测试（TEST.BLACK_BOX）

只看外部行为：端到端、接口契约、业务验收、视觉、可访问性。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-black-box--overview

### TEST.BLACK_BOX.PROVES 证明什么

只看外部行为：端到端、接口契约、业务验收、视觉、可访问性。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的代码与配置
- 检查方式：verify 时对照验收条目判读
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-black-box--test-black-box-proves

### TEST.BLACK_BOX.EVIDENCE 证据怎么入账

结果按证据规范入账：浏览器端到端、API 契约兼容、业务验收、视觉回归、可访问性。真实运行的结果用 pomaster record gate-run 记录；没跑的记 NOT_RUN，不算通过；阈值是项目决策，记在项目质量基线里。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的验证工作
- 检查方式：pomaster plan run 与 record gate-run 的入账结果
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-black-box--test-black-box-evidence

## 测试 / 渗透与安全测试（TEST.PENETRATION）

主动找漏洞：注入、越权、敏感信息暴露、依赖漏洞与供应链风险。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-penetration--overview

### TEST.PENETRATION.PROVES 证明什么

主动找漏洞：注入、越权、敏感信息暴露、依赖漏洞与供应链风险。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的代码与配置
- 检查方式：verify 时对照验收条目判读
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-penetration--test-penetration-proves

### TEST.PENETRATION.EVIDENCE 证据怎么入账

结果按证据规范入账：安全核查、依赖与供应链。真实运行的结果用 pomaster record gate-run 记录；没跑的记 NOT_RUN，不算通过；阈值是项目决策，记在项目质量基线里。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的验证工作
- 检查方式：pomaster plan run 与 record gate-run 的入账结果
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-penetration--test-penetration-evidence

## 测试 / 性能与容量测试（TEST.PERFORMANCE）

在约定的负载下响应时间、吞吐与资源占用达标。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-performance--overview

### TEST.PERFORMANCE.PROVES 证明什么

在约定的负载下响应时间、吞吐与资源占用达标。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的代码与配置
- 检查方式：verify 时对照验收条目判读
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-performance--test-performance-proves

### TEST.PERFORMANCE.EVIDENCE 证据怎么入账

结果按证据规范入账：性能。真实运行的结果用 pomaster record gate-run 记录；没跑的记 NOT_RUN，不算通过；阈值是项目决策，记在项目质量基线里。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的验证工作
- 检查方式：pomaster plan run 与 record gate-run 的入账结果
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-performance--test-performance-evidence

## 测试 / 发布与数据迁移验证（TEST.RELEASE）

迁移可执行可回退、发布可观测可回滚。

页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-release--overview

### TEST.RELEASE.PROVES 证明什么

迁移可执行可回退、发布可观测可回滚。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的代码与配置
- 检查方式：verify 时对照验收条目判读
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-release--test-release-proves

### TEST.RELEASE.EVIDENCE 证据怎么入账

结果按证据规范入账：数据迁移、发布、运行时可观测。真实运行的结果用 pomaster record gate-run 记录；没跑的记 NOT_RUN，不算通过；阈值是项目决策，记在项目质量基线里。

- 执行：人工评审；适用：管理侧与用户侧
- 适用范围：所有空间的验证工作
- 检查方式：pomaster plan run 与 record gate-run 的入账结果
- 页面：https://river-singer.github.io/POMaster_VNext/vue/?path=/story/standard-testing-test-release--test-release-evidence

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
- `SRC.STAGESHOW` Stageshow（Benji Taylor 的 agent skill，MIT）：https://github.com/benjitaylor/skills/tree/main/stageshow（核实 2026-11-06）
- `SRC.AFFECTUI` affectUI（Florian Höller 的 React 组件库，MIT）：https://github.com/flohoeller/affectui（核实 2026-11-06）
- `SRC.NNG.RESPONSE_TIMES` Nielsen Norman Group · Response Times: The 3 Important Limits：https://www.nngroup.com/articles/response-times-3-important-limits/（核实 2026-11-06）
- `SRC.MDN.COOKIES` MDN · Using HTTP cookies（Cookie 前缀与属性）：https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies（核实 2026-11-06）
- `SRC.IETF.IDEMPOTENCY_KEY` IETF HTTPAPI · The Idempotency-Key HTTP Header Field（草案）：https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/（核实 2026-11-06）
- `SRC.TANSTACK.VUE_QUERY` TanStack Query（Vue）· Important Defaults：https://tanstack.com/query/latest/docs/framework/vue/guides/important-defaults（核实 2026-11-06）
- `SRC.POMASTER.DEFAULTS` pomaster 推荐默认（数值类决策位的缺省取值）：repo:docs/design-standard.md（核实 2026-11-07）
- `SRC.ANTD.THEME.Z_INDEX` Ant Design · 定制主题（Seed Token：zIndexBase 0、zIndexPopupBase 1000）：https://ant.design/docs/react/customize-theme-cn（核实 2026-11-07）
