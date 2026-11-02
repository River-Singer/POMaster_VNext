# 前端设计规范（Ant Design，ant-design-vue@4.2.6）

> Storybook「规范」分区的 AI 可读孪生，由 packages/studio/scripts/lib/standard.mjs 生成，与页面同源。不要手改。
> 规范指纹 `sha256:3c20ee0b393e07d0ef234e4635da6d6336308d4659972445189c9ac0cabf8392`；状态 origin=preset。
> 修改规范：编辑 `packages/cli/seeds/design-standards/antd.yaml` → `pomaster design validate` → `node packages/studio/run.mjs generate`。
> 机器门禁规则违反即拦截（检查未接入时按评审执行）；人工评审规则在评审时逐条核对。

## 基础 / 布局（LAYOUT）

页面骨架、适配基准与内容区尺寸。管理侧是「顶栏 + 左侧导航 + 内容区」，用户侧是移动端单列。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-layout--overview

### LAYOUT.ADMIN_SHELL 管理侧页面骨架

管理侧应用统一用「顶栏 + 左侧导航 + 内容区」骨架。顶栏放产品标识和全局操作，左侧放多级菜单，内容区承载页面本身；侧栏可以收起，收起后只留图标；内容区两侧不留白，随窗口伸缩。

- 执行：人工评审；适用：管理侧
- 参数：顶栏高度 `p.header_height` = 64px（token `layout.header_height`）
- 参数：侧栏宽度 `p.sider_width` = 200px（Ant Design 组件 · Layout 布局（Sider 默认宽度与收起宽度））
- 参数：侧栏收起宽度 `p.sider_collapsed_width` = 80px（Ant Design 组件 · Layout 布局（Sider 默认宽度与收起宽度））
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「每类页面定义标题、面包屑、筛选、工具栏、主体、分页和详情位置。」
- 示例（这样做）：顶栏 + 左侧导航 + 内容区
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-layout--layout-admin-shell

### LAYOUT.ADAPTIVE 适配基准与验收宽度

设计稿按 1440 宽的画板出；交付前在 1920、1440、1366、1280 四个宽度下逐一验收。左右布局时侧栏固定、内容区伸缩；内容区变窄时内容换行、折叠或出现横向滚动，不缩小字号。

- 执行：人工评审；适用：管理侧
- 参数：设计画板宽度 `p.artboard` = 1440px（Ant Design 设计规范 · 布局）
- 参数：验收宽度 `p.acceptance_widths` = 1920px / 1440px / 1366px / 1280px（Ant Design 设计规范 · 布局）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「响应式断点和密度切换有验收矩阵。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「MUST NOT 用缩小字体解决小屏。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-layout--layout-adaptive

### LAYOUT.CONTENT_REGION 内容区边距、区块间距与最大宽度

内容区内边距、相邻区块之间的间距、内容最大宽度全站各用一个值，都取规范 token，不在单个页面里另定。

- 执行：机器门禁 `style.spacing-scale`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：内容区内边距 `p.page_padding`：待定（token `layout.page_padding` 仍为 UNKNOWN）
- 参数：区块间距 `p.section_gap`：待定（token `spacing.section_gap` 仍为 UNKNOWN）
- 参数：内容最大宽度 `p.content_max_width`：待定（token `layout.content_max_width` 仍为 UNKNOWN）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-layout--layout-content-region

### LAYOUT.OVERFLOW 外层管尺寸与滚动，内层不撑破

尺寸和滚动由外层容器负责，内层组件不得把外层撑破；固定格式的控件（日期、金额、状态标签）给出稳定宽度或最小、最大宽度。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「外层负责布局与 overflow，内层不得反向撑爆。」
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「固定格式控件定义稳定尺寸、min/max 或比例。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-layout--layout-overflow

### LAYOUT.Z_INDEX 层级只取层级 token

z-index 只能取层级 token（下拉、气泡、消息、抽屉、模态各一档），不写死数字。

- 执行：机器门禁 `style.no-raw-z-index`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：layers `p.layers`：待项目决定——层级 token 怎么分档？下拉、气泡、消息、抽屉、模态各取多少 z-index（现有 token 合同还没有层级分组）？
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「z-index 只能来自层级 token。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-layout--layout-z-index

### LAYOUT.PUBLIC_SHELL 用户侧移动端单列

用户侧页面按移动端单列排布，宽度铺满视口；在 320 CSS px 宽度下内容仍能纵向阅读、不出现横向滚动；不得禁止缩放或锁定视口。

- 执行：人工评审；适用：用户侧
- 参数：最窄验收视口 `p.min_viewport` = 320px（pomaster 主题硬规范 · UI 呈现与设计）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「内容在 320 CSS px 宽度下可纵向阅读，不出现横向滚动；不得禁用浏览器缩放或固定视口」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-layout--layout-public-shell

## 基础 / 栅格（GRID）

24 列栅格；列间距固定、列宽伸缩；响应式只用规范断点。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-grid--overview

### GRID.COLUMNS 24 列栅格

页面区块按 24 列栅格切分，每个区块从某一列开始、到某一列结束；不用小数跨度或百分比宽度拼区块。

- 执行：机器门禁 `grid.span-range`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：列数 `p.columns` = 24 个（Ant Design 设计规范 · 布局）
- 示例（这样做）：三个等宽区块各占 8 列
- 示例（别这样做）：用百分比宽度拼区块——百分比宽度不对齐栅格，和页面其他区块的列线错位。
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-grid--grid-columns

### GRID.GUTTER 列间距固定为 16 或 24

列间距（gutter）是固定值，不随窗口缩放，只取 16 或 24；窗口变化时变的是列宽，不是间距。

- 执行：机器门禁 `grid.gutter-allowed`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：允许的列间距 `p.gutter` = 16px / 24px（Ant Design 设计基础简版（官方 Wiki））
- 示例（这样做）：gutter 取 16
- 示例（别这样做）：gutter 取 10
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-grid--grid-gutter

### GRID.ROW_SUM 一行不超过 24 列

同一行里各列跨度之和不超过 24。需要换行就拆成两行，不靠超出后自动折行。

- 执行：机器门禁 `grid.row-sum`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：一行列数上限 `p.columns` = 24 个（Ant Design 设计规范 · 布局）
- 示例（这样做）：拆成两行
- 示例（别这样做）：12 + 12 + 8 = 32，第三列被挤到下一行
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-grid--grid-row-sum

### GRID.BREAKPOINTS 响应式只用规范断点

响应式只用规范断点（sm 576、md 768、lg 992、xl 1200），在 a-col 上用 xs / sm / md / lg / xl 声明各断点的跨度；样式里不自定义媒体查询断点。

- 执行：机器门禁 `style.breakpoint-allowed`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：sm `p.sm` = 576px（token `breakpoints.sm`）
- 参数：md `p.md` = 768px（token `breakpoints.md`）
- 参数：lg `p.lg` = 992px（token `breakpoints.lg`）
- 参数：xl `p.xl` = 1200px（token `breakpoints.xl`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「响应式断点和密度切换有验收矩阵。」
- 示例（这样做）：小屏一列、中屏两列、大屏四列
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-grid--grid-breakpoints

## 基础 / 间距（SPACING）

间距只取间距阶梯；用小、中、大三档间距表达元素之间关系的远近。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-spacing--overview

### SPACING.SCALE 间距只取阶梯值

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
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-spacing--spacing-scale

### SPACING.TIERS 三档间距表达远近

用三档纵向间距表达关系远近：同一组里的元素用小间距 8，组与组之间用中间距 16，区块与区块之间用大间距 24。关系越近，间距越小；不要整页只用一个间距。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：组内 `p.small` = 8px（token `spacing.sm`）
- 参数：组间 `p.middle` = 16px（token `spacing.lg`）
- 参数：区块间 `p.large` = 24px（token `spacing.xl`）
- 示例（这样做）：组内 8、组间 16、区块间 24
- 示例（别这样做）：所有元素一个间距，看不出分组
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-spacing--spacing-tiers

## 基础 / 字体与富文本（TYPE）

字体族、字阶、字重、文字颜色、等宽数字、富文本排版和文字溢出处理。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-typography--overview

### TYPE.FAMILY 只用两套字体族

界面文字用规范无衬线字体族，代码和需要等宽的数字用规范等宽字体族；不引入第三种字体，也不在单个组件里另外指定字体。

- 执行：机器门禁 `style.font-family-token`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：无衬线字体族 `p.sans` = -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'（token `typography.family.sans`）
- 参数：等宽字体族 `p.mono` = 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace（token `typography.family.mono`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 在业务页面创建第二套视觉语言。」
- 示例（这样做）：正文与代码
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-typography--type-family

### TYPE.SCALE 字号只取字阶

字号只取字阶 12、14、16、20、24、30、38（46、56、68 只用于展示型页面），每级行高是字号加 8。正文 14 号、行高 22。一个系统里常用的字号控制在 5 种以内。

- 执行：机器门禁 `style.font-size-scale`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：字阶 `p.scale` = 12px / 14px / 16px / 20px / 24px / 30px / 38px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：对应行高 `p.line_heights` = 20px / 22px / 24px / 28px / 32px / 38px / 46px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：展示型字阶 `p.display_scale` = 46px / 56px / 68px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：正文字号 `p.body` = 14px（token `typography.size.body`）
- 参数：正文行高 `p.body_line_height` = 22px（Ant Design 设计规范 · 字体）
- 参数：常用字号种数上限 `p.max_sizes` = 5 个（Ant Design 设计规范 · 字体）
- 示例（这样做）：字阶与行高
- 示例（别这样做）：字阶以外的 13px、17px
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-typography--type-scale

### TYPE.WEIGHT 字重以 400 和 500 为主

正文用常规 400，需要强调的短文字用 500；600 只用于标题和英文加粗。强调时选一种手段，不要加粗、换色、放大同时叠加。

- 执行：机器门禁 `style.font-weight-allowed`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：常规 `p.regular` = 400（Ant Design 设计规范 · 字体）
- 参数：中粗 `p.medium` = 500（Ant Design 设计规范 · 字体）
- 参数：标题 `p.semibold` = 600（token `typography.weight.semibold`）
- 示例（这样做）：三种字重
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-typography--type-weight

### TYPE.COLOR 文字颜色四档

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
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-typography--type-color

### TYPE.TABULAR_NUMS 纵向对比的数字用等宽数字

需要上下对比的数字（金额、数量、时间列）用等宽数字（font-variant-numeric 取 tabular-nums），并右对齐。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：font-variant-numeric `p.numeric` = tabular-nums（Ant Design 设计规范 · 字体）
- 示例（这样做）：等宽数字、右对齐
- 示例（别这样做）：比例数字、左对齐，位数对不齐
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-typography--type-tabular-nums

### TYPE.RICH_TEXT 富文本统一用排版组件

公告、帮助、说明等富文本统一放进 a-typography 里渲染，用组件自带的排版：段落之间隔一倍字高，列表每级缩进 20px 再加 4px，引用左侧 4px 竖线，行内代码字号 85%。业务页面不另写一套富文本样式。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：段落间距 `p.paragraph_gap` = 1em（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 参数：列表缩进（外边距 + 内边距） `p.list_indent` = 20px / 4px（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 参数：引用竖线宽度 `p.quote_border` = 4px（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 参数：行内代码字号 `p.code_size` = 85%（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 在业务页面创建第二套视觉语言。」
- 示例（这样做）：标题、段落、列表、引用、代码、按键、标记
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-typography--type-rich-text

### TYPE.OVERFLOW 文字放不下时换行或省略

文字放不下时换行，或者单行省略、悬停显示全文；不得缩小字号硬塞进去。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「文本换行、截断、tooltip 和横向滚动有统一规则。」
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 通过缩小字体掩盖溢出。」
- 示例（这样做）：单行省略，悬停看全文
- 示例（别这样做）：缩小字号硬塞
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-typography--type-overflow

## 基础 / 标题层级（HEADING）

应用界面最多三级标题；内容型页面用 1–5 级排版标题；语义层级与视觉层级一致、不跳级。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-headings--overview

### HEADING.APP_LEVELS 应用界面最多三级标题

列表、表单、详情等工作页最多用三级标题：h1 是页面标题，20px；h2 是卡片或区块标题，16px；h3 是区块里的分组标题，14px；三级都用 600 字重。更细的层次用间距和分组表达，不再加标题级。

- 执行：机器门禁 `markup.heading-level-max`（待接入，暂按评审执行）；适用：管理侧
- 参数：h1 页面标题 `p.h1_size` = 20px（ant-design-vue PageHeader 样式（页面标题取 fontSizeHeading4、字重 600））
- 参数：h2 卡片 / 区块标题 `p.h2_size` = 16px（ant-design-vue Card 样式（卡片标题取 fontSizeLG 与 fontWeightStrong；内嵌小卡片标题取 fontSize））
- 参数：h3 分组标题 `p.h3_size` = 14px（ant-design-vue Card 样式（卡片标题取 fontSizeLG 与 fontWeightStrong；内嵌小卡片标题取 fontSize））
- 参数：标题字重 `p.weight` = 600（token `typography.weight.semibold`）
- 示例（这样做）：页面、区块、分组三级——a-card 的 title 不是标题元素；卡片标题要进页面大纲时，在 title 插槽里放 h2。
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-headings--heading-app-levels

### HEADING.SINGLE_H1 每个页面视图只有一个 h1

每个页面视图（一个路由页面，或一个全屏抽屉、模态）只有一个一级标题，内容就是这个页面叫什么；路由切换后同步更新浏览器标签页标题。

- 执行：机器门禁 `markup.single-h1`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「路由/页面切换后必须更新 document.title 并宣布页面变化」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-headings--heading-single-h1

### HEADING.ORDER 标题逐级下降，不跳级

标题的语义层级与视觉层级一致，逐级下降：h1 下面是 h2，h2 下面是 h3，不能从 h1 直接跳到 h3。

- 执行：机器门禁 `markup.heading-order`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「标题层级 h1–h6 与视觉层级一致，不跳过层级」
- 示例（这样做）：h1 → h2 → h3
- 示例（别这样做）：h1 直接跳到 h3
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-headings--heading-order

### HEADING.CONTENT_LEVELS 内容型页面用 1–5 级排版标题

帮助、公告、文章这类内容型页面用 a-typography-title 的 1–5 级：字号 38、30、24、20、16，行高 46、38、32、28、24，字重 600；标题前留 1.2 倍字高，标题后留 0.5 倍字高。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：1–5 级字号 `p.sizes` = 38px / 30px / 24px / 20px / 16px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：1–5 级行高 `p.line_heights` = 46px / 38px / 32px / 28px / 24px（Ant Design v5 主题算法 · 字阶与行高（genFontSizes / genFontMapToken））
- 参数：标题前间距 `p.margin_top` = 1.2em（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 参数：标题后间距 `p.margin_bottom` = 0.5em（ant-design-vue Typography 样式（段距、列表、引用、代码、标题间距））
- 示例（这样做）：五级排版标题
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-headings--heading-content-levels

### HEADING.REAL_ELEMENT 标题用真正的标题元素

标题必须是 h1–h6 或 a-typography-title，不能用加粗的 div、span 冒充；反过来，只是想把文字放大加粗时也不要用标题元素。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「使用原生 HTML 语义可承载时优先使用原生元素」
- 示例（别这样做）：加粗的 div 冒充标题
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-headings--heading-real-element

## 基础 / 图标（ICON）

一套图标库、一种系统图标风格；图标跟随文字的大小和颜色；同一动作同一图标；纯图标按钮有可访问名称。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-icons--overview

### ICON.LIBRARY 只用一套图标库

管理侧系统图标只用 @ant-design/icons-vue 的图标组件；不混用第二套图标库，也不用切图或内联 SVG 充当系统图标。用户侧（H5）的图标库待项目决定。

- 执行：机器门禁 `icon.single-library`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：管理侧图标库 `p.admin_library` = @ant-design/icons-vue（ant-design-vue 图标示例（图标来自 @ant-design/icons-vue））
- 参数：用户侧图标库 `p.public_library`：待项目决定——用户侧（H5）的图标库用哪一套？（候选 Vant Icon）
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-icons--icon-library

### ICON.STYLE 系统图标统一线框风格

同一界面的系统图标统一用线框风格（Outlined）；实心风格（Filled）只用于表达状态（成功、警告、错误、信息）；双色风格（TwoTone）只用于业务图标。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：系统图标风格 `p.system_style` = Outlined（pomaster 预设约定）
- 参数：双色风格的使用范围 `p.two_tone_scope` = 业务图标（Ant Design 设计规范 · 图标）
- 示例（这样做）：操作用线框，状态用实心
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-icons--icon-style

### ICON.SIZE_SPACING 图标跟随文字大小，与文字间隔 8

系统图标与相邻文字同字号（14px 文字配 14px 图标），图标与文字之间留 8px；业务图标只用 32、48、64 三档尺寸。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：图标与文字间距 `p.text_gap` = 8px（Ant Design 设计规范 · 图标）
- 参数：业务图标尺寸 `p.business_sizes` = 32px / 48px / 64px（Ant Design 设计规范 · 图标）
- 示例（这样做）：14px 文字配 14px 图标，间隔 8
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-icons--icon-size-spacing

### ICON.COLOR 图标跟随文字颜色，状态才用语义色

系统图标跟随相邻文字的颜色；只有表达状态时才用语义色 token（成功、警告、错误、信息），并且同时配文字，不能只靠图标颜色传达状态。

- 执行：机器门禁 `style.no-raw-color`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：success `p.success` = #52c41a（token `color.semantic.success`）
- 参数：warning `p.warning` = #faad14（token `color.semantic.warning`）
- 参数：error `p.error` = #ff4d4f（token `color.semantic.error`）
- 参数：info `p.info` = #1677ff（token `color.semantic.info`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 仅通过颜色、hover 或 tooltip 传递关键信息。」
- 示例（这样做）：语义色图标 + 状态文字
- 示例（别这样做）：只有颜色点，没有文字
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-icons--icon-color

### ICON.SEMANTICS 同一动作同一图标

同一个动作在全系统用同一个图标，按下表取用；表里没有的动作，先补进表再用。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：动作 → 图标 `p.map` = 新建 → PlusOutlined，编辑 → EditOutlined，删除 → DeleteOutlined，搜索 → SearchOutlined，刷新 → ReloadOutlined，导出 → DownloadOutlined，导入 → UploadOutlined，筛选 → FilterOutlined，设置 → SettingOutlined，更多 → MoreOutlined，查看 → EyeOutlined，复制 → CopyOutlined（pomaster 预设约定）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 同一路径使用不同文案或图标表示同一功能」
- 示例（这样做）：动作图标对照
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-icons--icon-semantics

### ICON.BUTTON_LABEL 纯图标按钮要有名字

只有图标、没有文字的按钮必须带可访问名称（aria-label），悬停时用 tooltip 显示同样的文字。

- 执行：机器门禁 `markup.icon-button-label`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 图标按钮缺少 aria-label 或等效可访问名称。」
- 示例（这样做）：aria-label 与 tooltip 同名
- 示例（别这样做）：读屏只能读出「按钮」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-foundations-icons--icon-button-label

## 设计模式/全局规则 / 反馈（FEEDBACK）

按反馈的重要程度和用户是否需要处理来选提示方式；失败要给恢复动作；加载、空状态、部分成功各有固定做法。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-feedback--overview

### FEEDBACK.CHOOSE 按重要程度选提示方式

操作结果轻、用户不必等待时用全局提示（顶部居中，约 3 秒自动消失）；重要且必须处理的才用对话框；系统主动推送的消息用通知提醒框（右上角）；需要在页面上常驻的说明用警告提示（不自动消失）；操作前的二次确认用贴着按钮的气泡确认框。能立刻看到结果的简单操作可以不提示，不要过度反馈。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：场景 → 提示方式 `p.channels` = 轻量结果 → message 全局提示，必须处理 → modal 对话框，系统推送 → notification 通知提醒框，页面常驻说明 → alert 警告提示，操作前确认 → popconfirm 气泡确认框（Ant Design 设计规范 · 反馈）
- 参数：全局提示停留时长 `p.message_duration` = 3000ms（Ant Design 设计规范 · 反馈）
- 示例（这样做）：页面常驻说明用警告提示
- 示例（这样做）：轻量结果用全局提示
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-feedback--feedback-choose

### FEEDBACK.FAILURE 失败要留得住、给出路

重要的失败不用会自动消失的全局提示，用警告提示或对话框，写清发生了什么，并给出恢复动作（重试、下载错误明细、联系管理员）；权限不足、离线也一样要给恢复动作。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 错误通知自动消失且不可恢复（除非用户可重新查看）。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「error、permission 和 offline 提供恢复动作。」
- 示例（这样做）：警告提示 + 恢复动作
- 示例（别这样做）：3 秒后消失、没有下一步
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-feedback--feedback-failure

### FEEDBACK.LOADING 超过 2 秒的操作要有加载反馈

预计超过约 2 秒的操作立即给出加载反馈：短的用加载态（按钮 loading、局部 Spin），长的用进度条并允许取消；首屏加载用骨架屏，骨架保持主要布局尺寸，加载完成后页面不跳动。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：需要加载反馈的耗时 `p.threshold` = 2000ms（Ant Design 设计规范 · 反馈）
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「首屏骨架保持主要布局尺寸。」
- 示例（这样做）：按钮加载态、进度条、骨架屏
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-feedback--feedback-loading

### FEEDBACK.FIELD_ERROR 字段错误贴着字段、不消失

校验错误显示在对应字段下方，用文字说明怎么改，用户修改前不消失；提交失败时页面顶部给出错误摘要并聚焦到第一个错误字段；不能只靠颜色、图标或全局提示表达字段错误；提交失败不清空已填内容。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「错误必须与字段关联，并以文本描述提供纠错建议；提交时提供错误摘要并聚焦第一个错误字段」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「MUST NOT 提交失败清空输入。」
- 示例（这样做）：错误文字贴着字段
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-feedback--feedback-field-error

### FEEDBACK.EMPTY 空状态分清「没有数据」和「没有结果」

还没有任何数据时，空状态引导第一步操作（如「新建车型」）；筛选或搜索没有结果时，说明没找到并提供「清除筛选」。两种情况文案和动作不同。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「empty 区分无数据与筛选无结果。」
- 示例（这样做）：还没有数据：引导第一步
- 示例（这样做）：筛选无结果：提供清除筛选
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-feedback--feedback-empty

### FEEDBACK.PARTIAL 部分成功要报数量和明细

批量操作部分成功时，结果里写明成功、失败、跳过各多少条，并提供失败明细；不能只说「操作成功」或「操作失败」。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「partial success 提供成功/失败/跳过数量和明细。」
- 示例（这样做）：结果页写清三个数
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-feedback--feedback-partial

### FEEDBACK.BADGE 徽标：重要用数字，次要用红点

与用户强相关的重要信息（待审批数）用数字徽标，次要提醒用红点；有图标时放在图标右上角，没有图标时放在标题后。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：信息类型 → 徽标形式 `p.rule` = 重要且与用户相关 → 数字，次要提醒 → 红点（Ant Design 设计规范 · 反馈）
- 示例（这样做）：数字与红点
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-feedback--feedback-badge

## 设计模式/全局规则 / 导航（NAV）

管理侧用左侧菜单；顶部导航只在一级入口少时用；面包屑、标签页、步骤条、分页各有数量与字数上限。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-navigation--overview

### NAV.ADMIN_SIDE 管理侧主导航用左侧菜单

管理侧主导航用左侧菜单，适合多级、操作密集的工作台。菜单项按业务域分组，多了可以滚动；当前页面在菜单里高亮。菜单高亮按路由的稳定标识匹配，不按标题文字或截取 URL 判断。

- 执行：人工评审；适用：管理侧
- 参数：菜单宽度 `p.sider_width` = 200px（Ant Design 组件 · Layout 布局（Sider 默认宽度与收起宽度））
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「MUST NOT 用标题字符串或 URL 截取判断菜单。」
- 示例（这样做）：按业务域分组的多级菜单
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-navigation--nav-admin-side

### NAV.TOP 顶部导航只在一级入口少时用

顶部导航只在一级入口为 2 到 7 个时使用，常见于用户侧门户；每个导航项名称不超过 14 个字。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：一级入口下限 `p.min_items` = 2 个（Ant Design 设计规范 · 导航）
- 参数：一级入口上限 `p.max_items` = 7 个（Ant Design 设计规范 · 导航）
- 参数：导航项字数上限 `p.label_max` = 14 字（Ant Design 设计规范 · 导航）
- 示例（这样做）：五个一级入口
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-navigation--nav-top

### NAV.BREADCRUMB 面包屑建议 3 级以内，最多 5 级

面包屑显示当前页在层级里的位置，建议不超过 3 级、最多 5 级；页面自身的导航已经能说明位置时不加面包屑。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：建议层级上限 `p.recommended_max` = 3 个（Ant Design 设计规范 · 导航）
- 参数：层级上限 `p.max` = 5 个（Ant Design 设计规范 · 导航）
- 示例（这样做）：三级面包屑
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-navigation--nav-breadcrumb

### NAV.TABS 标签页按作用范围选型

标签页名称不超过 14 个字。切换整页核心功能用基础标签页；切换页面局部内容用卡片式标签页；卡片里的小范围切换用分段控件；选项很多时改用竖向标签页。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：标签名字数上限 `p.label_max` = 14 字（Ant Design 设计规范 · 导航）
- 示例（这样做）：页面级标签页 + 卡片内分段控件
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-navigation--nav-tabs

### NAV.STEPS 横向步骤条 3–4 步

有固定流程的任务用步骤条。横向步骤条放 3 到 4 步，每步标题不超过 11 个字；步骤更多或数量会变时，用固定在页面左侧的竖向步骤条。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：横向步数下限 `p.horizontal_min` = 3 个（Ant Design 设计规范 · 导航）
- 参数：横向步数上限 `p.horizontal_max` = 4 个（Ant Design 设计规范 · 导航）
- 参数：步骤标题字数上限 `p.title_max` = 11 字（Ant Design 设计规范 · 导航）
- 示例（这样做）：三步流程
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-navigation--nav-steps

### NAV.PAGINATION 分页与接口分页档一致

管理侧列表用页码分页：默认每页 20 条，每页最多 200 条；超过 5 页时提供快速跳转，数据多时允许改每页条数；卡片或浮层里用迷你分页。用户侧列表用「加载更多」的游标分页，与接口的 KEYSET 分页一致，每次最多 50 条，不显示总页数。不得前端拉全量再假分页。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：管理侧默认每页条数 `p.admin_page_size` = 20 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：管理侧每页上限 `p.admin_max_page_size` = 200 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：超过多少页加快速跳转 `p.quick_jumper_after` = 5 个（Ant Design 设计规范 · 导航）
- 参数：用户侧每次加载上限 `p.public_max_page_size` = 50 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 前端加载全量数据假分页。」
- 示例（这样做）：管理侧页码分页
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-navigation--nav-pagination

## 设计模式/全局规则 / 数据录入（ENTRY）

标签常驻可见、位置全系统一致；选择控件按选项数选；提示放对位置；校验分前后端；提交防重复且失败不丢输入。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-entry--overview

### ENTRY.LABEL 每个输入都有常驻可见的标签

每个输入都有常驻可见的标签，必填项有标记。管理侧表单默认标签在输入左侧、右对齐、带冒号；标签很长或界面是英文时放到输入上方；同一个系统只用一种。占位文字只是补充提示，不能代替标签。

- 执行：人工评审；适用：管理侧
- 参数：标签位置 `p.label_position` = 左侧，右对齐，带冒号（Ant Design 设计原则 · 对齐）
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「每个输入必须有持久可见且程序化关联的标签、格式说明和必要性提示；placeholder 不得替代标签。」
- 示例（这样做）：标签在左、右对齐、带冒号
- 示例（别这样做）：只有占位文字，填了之后就不知道是什么
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-entry--entry-label

### ENTRY.CHOICE_CONTROL 选择控件按选项数选

二选一、改了立即生效的用开关；选项多于 2 个、少于 5 个用单选按钮全部摆出来；多于 5 个用下拉选择；多选少量用复选框组，多了用多选下拉；需要精确数值时不用滑块，用数字输入。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：单选按钮的选项数 `p.radio_range` = 3 个 / 4 个（Ant Design 设计规范 · 数据录入）
- 参数：多于这个数用下拉 `p.select_above` = 5 个（Ant Design 设计规范 · 数据录入）
- 示例（这样做）：3 个选项用单选，选项多用下拉，即时生效用开关
- 示例（别这样做）：两个选项用下拉，多点一次还看不到全部
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-entry--entry-choice-control

### ENTRY.SWITCH_IMMEDIATE 开关即时生效，不配保存按钮

开关拨动即生效，旁边不放「保存」按钮，开关两侧文字写清当前状态（启用、停用）；需要和其他字段一起提交才生效的，用复选框。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：状态文字示例 `p.labels` = 启用 / 停用（Ant Design 设计规范 · 数据录入）
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-entry--entry-switch-immediate

### ENTRY.HINTS 提示放对位置

短提示放在字段下方，不超过一句话；长说明收进字段旁的信息图标，悬停显示；收集身份证号、手机号等敏感信息时，写明为什么需要；能给合理默认值就给。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：字段下方一句话提示
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-entry--entry-hints

### ENTRY.VALIDATION 前端校格式，后端错误落到字段

前端先校验格式（必填、长度、格式），后端返回的字段错误定位到对应字段并聚焦；提交中按钮进入加载态防止重复提交；提交失败保留已填内容。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「前端先做格式校验，后端字段错误定位并聚焦字段。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「提交防重复并保留失败输入。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-entry--entry-validation

### ENTRY.UPLOAD 上传方式按文件类型选

单个文件、不需要预览，用点击上传；图片用缩略图上传，达到数量上限后隐藏上传按钮；拖拽上传区写明允许的文件格式和大小，上传中显示进度。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：写明格式与大小
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-entry--entry-upload

## 设计模式/全局规则 / 数据展示（DISPLAY）

表格列有稳定的类型、宽度与对齐；卡片一行最多 4 张；折叠、时间轴、轮播各有用法；每种展示都要设计超长与空数据。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-display--overview

### DISPLAY.TABLE_COLUMNS 表格列的类型、对齐与空值

每列有稳定的 key、标题、值类型和宽度策略；时间、状态、操作列不换行；金额、数量右对齐，同列小数位一致，单位写在表头；空单元格显示「-」；长文本单行省略、悬停看全文。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：空值占位 `p.empty` = -（Ant Design 设计规范 · 数据展示）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「每列有稳定 key、标题、值类型、宽度策略、权限和导出规则。」
- 示例（这样做）：金额右对齐、单位在表头、空值用「-」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-display--display-table-columns

### DISPLAY.CARD_GRID 卡片按栅格排，一行最多 4 张

卡片用来把相关信息收拢成一块，按栅格排列，一行最多 4 张；卡片里的长文本截断，卡片之间间距一致。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：一行最多卡片数 `p.per_row_max` = 4 个（Ant Design 设计规范 · 数据展示）
- 示例（这样做）：一行 4 张
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-display--display-card-grid

### DISPLAY.COLLAPSE 长内容用折叠逐步展开

长而不规则的内容用折叠面板逐步展开；各面板之间关系松散时用手风琴，一次只展开一个。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：手风琴
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-display--display-collapse

### DISPLAY.TIMELINE 时间轴最新的在上

按时间记录的事件、任务用竖向时间轴，最新的在最上面。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：新的在上
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-display--display-timeline

### DISPLAY.CAROUSEL 轮播 3 到 5 张

轮播只放同级内容（图片、卡片），3 到 5 张，让用户看得出一共几张、往哪个方向切。管理侧工作页不用轮播。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：张数范围 `p.slides` = 3 个 / 5 个（Ant Design 设计规范 · 数据展示）
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-display--display-carousel

### DISPLAY.EDGE_CASES 每种展示都设计超长和空数据

每个展示组件都要设计两种边界情况：内容超长（截断、换行或展开）和没有数据（空状态）。按重要程度、使用频率和关联程度排列信息。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-display--display-edge-cases

## 设计模式/全局规则 / 数据格式（FORMAT）

数字、金额、日期时间、相对时间、脱敏各有固定格式，全部经格式化注册表输出，页面里不手拼。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-format--overview

### FORMAT.NUMBER 数字带千分位，单位小写

数字默认带千分位；单位小写、紧跟数字（123,220kg）；比例用百分比（12.32%），进度用分数（12/30）；很大的数可以用「万」「亿」，不用「千」作单位；表格里的单位写在表头，不写在每个单元格。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：写法示例 `p.examples` = 123,220kg / 12.32% / 12/30（Ant Design 设计规范 · 数据格式）
- 参数：可用的大数单位 `p.large_units` = 万 / 亿（Ant Design 设计规范 · 数据格式）
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-format--format-number

### FORMAT.AMOUNT 金额用货币代码、两位小数、右对齐

金额写成货币代码加数字（CNY 1,280.00），保留到分（两位小数），列表里右对齐并用等宽数字；货币代码用 ISO 4217，不在代码里写死 ¥、$ 符号；经格式化注册表输出。

- 执行：机器门禁 `format.no-local-pattern`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：人民币代码 `p.code` = CNY（Ant Design 设计规范 · 数据格式）
- 参数：小数位 `p.decimals` = 2 个（pomaster 预设约定）
- 硬规范依据：specs/hard/themes/internationalization-and-copywriting.md「货币代码使用 ISO 4217（`CNY`、`USD`、`EUR`）；禁止用 `$`、`￥` 符号硬编码。」
- 示例（这样做）：经格式化注册表输出
- 示例（别这样做）：页面里拼符号和小数
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-format--format-amount

### FORMAT.DATETIME 日期时间固定格式

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
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-format--format-datetime

### FORMAT.RELATIVE_TIME 消息里的相对时间

消息、通知里的时间用相对时间：1 分钟内写「刚刚」，1 小时内写「N 分钟前」，24 小时内写「N 小时前」，超过 24 小时写「MM-DD HH:mm」，超过一年写「YYYY-MM-DD HH:mm」。同样经格式化注册表输出。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：时间差 → 写法 `p.tiers` = 1 分钟内 → 刚刚，1 小时内 → N 分钟前，24 小时内 → N 小时前，超过 24 小时 → MM-DD HH:mm，超过一年 → YYYY-MM-DD HH:mm（Ant Design 设计规范 · 数据格式）
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-format--format-relative-time

### FORMAT.MASKING 个人信息按级别脱敏

管理侧展示个人信息（领域规格里分级为 pii / sensitive_pii 的字段）时脱敏：用 * 替换并保持位数；金额、时间等高度敏感的值整体隐藏为 ***。各类信息保留的位数按下表，业务更严格时可以收紧。

- 执行：人工评审；适用：管理侧
- 参数：信息类型 → 保留位数 `p.rules` = 姓名 → 两个字留首字，三个字及以上留首尾，手机号 → 留前 3 后 4，证件号 → 高留首尾各 1，中留前 3 后 3，低留前 6 后 4，银行卡 → 高留后 4，中留前 6 后 4，低留前 4 后 6，邮箱 → 留域名和账号前 3 位，地址 → 留到省市区（Ant Design 设计规范 · 数据格式）
- 示例（这样做）：保持位数的部分脱敏
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-format--format-masking

## 设计模式/全局规则 / 文案（COPY）

界面文字走文案字典；从用户视角、简洁一致地写；语气平和；报错说清怎么办；标点与用词统一。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-copywriting--overview

### COPY.NO_LITERAL 界面文字走文案字典

模板、组件、脚本里不写死界面文字，统一经文案字典的 key 取用（用户数据除外）；key 用稳定的点分标识，如 vehicleModel.form.code，不用文案本身作 key；插值用命名占位符 {name}。

- 执行：机器门禁 `text.no-literal-copy`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/internationalization-and-copywriting.md「禁止在模板/组件/脚本中硬编码任何自然语言文本（用户数据除外）。」
- 硬规范依据：specs/hard/themes/internationalization-and-copywriting.md「key 使用稳定标识，禁止用中文/英文文案本身作为 key。」
- 示例（这样做）：经 key 取文案
- 示例（别这样做）：模板里写死中文
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-copywriting--copy-no-literal

### COPY.USER_VIEW 站在用户这边写

写用户能做什么、会得到什么，不写系统怎么实现；去掉用户已经知道的话；用常见、具体的词；同一事物全系统一个叫法，操作名称和它打开的页面标题一致；最重要的信息放在最前面。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：说结果
- 示例（别这样做）：说实现
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-copywriting--copy-user-view

### COPY.TONE 语气平和，不命令、不指责

称呼用「你」，同一句里不混用「你」「我」；多给建议，少用「不能」「不要」「请勿」这类命令；出了问题聚焦怎么解决，不指责用户；「抱歉」只用在系统造成的问题上；不用「绝不」这类绝对化说法。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-copywriting--copy-tone

### COPY.ERROR_MESSAGE 报错说清发生了什么、怎么办

报错写清两件事：发生了什么（客观描述，不只给错误码），用户下一步怎么做。错误码可以附在后面供排查。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：原因 + 下一步
- 示例（别这样做）：只有错误码
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-copywriting--copy-error-message

### COPY.PUNCTUATION 标点与空格

中文与数字、英文之间加一个空格（2 个、5 MB）；按钮、标题、输入提示、表格里的短句不加句号；感叹号只用于问候和祝贺；省略号用「…」；连接号用半角「-」；隐私遮挡用「*」。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-copywriting--copy-punctuation

### COPY.TERMS 用词统一，禁用错别字

规范用词：写「其他」不写「其它」，写「登录」不写「登陆」，指代时「此」比「该」更明确；统计数字用阿拉伯数字。禁用词表随项目补充。

- 执行：机器门禁 `text.banned-terms`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：禁用词 → 规范词 `p.banned` = 其它 → 其他，登陆 → 登录（Ant Design 设计规范 · 文案）
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-copywriting--copy-terms

## 设计模式/全局规则 / 按钮（BUTTON）

按用途选按钮类型；一个按钮区一个主按钮；推荐操作在前、风险操作在后、「更多」在最右；文案用动词。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-buttons--overview

### BUTTON.TYPES 按用途选按钮类型

主按钮用于完成、推荐类操作；拿不准时用次按钮；表格操作列等大量重复的地方用文字按钮；引导「在这里添加」用虚线按钮；删除等有风险的操作用危险按钮；空间小、按钮多时用图标按钮，必须配文字提示；一个按钮里不放两个图标。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：用途 → 类型 `p.map` = 完成与推荐 → 主按钮，其余操作 → 次按钮，表格操作列 → 文字按钮，引导添加 → 虚线按钮，有风险 → 危险按钮，空间小 → 图标按钮（配文字提示）（Ant Design 设计规范 · 按钮）
- 示例（这样做）：各类型的用途
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-buttons--button-types

### BUTTON.SINGLE_PRIMARY 一个按钮区一个主按钮

同一个按钮区（工具栏、弹窗底部、表单底部）最多一个主按钮，其余用次按钮或文字按钮。

- 执行：机器门禁 `markup.single-primary-button`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：每个按钮区主按钮上限 `p.max_primary` = 1 个（Ant Design 设计规范 · 按钮）
- 示例（这样做）：一个主按钮
- 示例（别这样做）：三个主按钮，看不出该点哪个
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-buttons--button-single-primary

### BUTTON.ORDER 推荐在前，风险在后，「更多」最右

推荐的操作放在阅读起点，有风险的操作放最后，折叠起来的「更多」永远在最右；有返回含义的按钮放最左。工具栏按「推进业务（新建、保存、发布）→ 视图控制 → 其他（刷新、设置）→ 更多」排列。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「主次操作、批量操作和状态信息位置一致。」
- 示例（这样做）：工具栏顺序
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-buttons--button-order

### BUTTON.PLACEMENT 按钮跟着它作用的内容

按钮放在它作用的内容旁边；工具栏的按钮靠右；页面底部的按钮区只用于两种情况：详情页推进流程（审批通过、驳回）和拆成多张卡片的复杂表单。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-buttons--button-placement

### BUTTON.COPY 按钮文案用动词，说清结果

按钮文案用动词（下拉按钮除外），简短、说清点了会发生什么，如「发布」「保存车型」，少用「确定」「提交」这类泛词；主要操作本身是否定动作时点明后果，如「删除车型」。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：说清结果
- 示例（别这样做）：泛词，看不出后果
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-buttons--button-copy

### BUTTON.GROUPING 用间距分组，不连成一组

按钮之间用间距分组，确有需要才加分割线；不要把普通按钮拼接成一组，容易被当成切换按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-buttons--button-grouping

## 设计模式/全局规则 / 数据列表（LIST）

按数据选列表形态与查询方式；分页并记住位置；详情打开方式有选择规则；批量、新建、删除各有固定做法。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-list--overview

### LIST.FORM 列表形态按数据选

多字段、需要比较的数据用表格；空间小（侧栏、下拉、小弹窗）时用竖向列表；展示型内容用卡片网格。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-list--list-form

### LIST.QUERY 查询方式按使用习惯选

多个条件组合后一起提交用查询表单；改条件立刻刷新结果用筛选；一个关键词跨多个字段找用搜索框。常用的查询放在列表工具栏里，复杂查询单独放一个区域。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：工具栏里的搜索与筛选
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-list--list-query

### LIST.PAGING 分页加载并记住位置

列表默认分页加载，只有一页时隐藏分页；从详情返回列表时恢复原来的页码、筛选和滚动位置，并标记看过的条目；信息流、消息类列表用同页加载更多。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「大数据使用服务端分页/筛选/排序及虚拟化。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-list--list-paging

### LIST.DETAIL_ENTRY 详情打开方式有规则

点标题进入详情。内容一屏放得下就在行内展开；信息较多用抽屉；需要分享链接或沉浸处理用独立页面；需要在多条之间快速切换用左右两栏。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「抽屉、弹窗和路由跳转有选择规则。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-list--list-detail-entry

### LIST.BATCH 勾选后出现批量操作栏

勾选行之后，工具栏位置出现批量操作栏，写明已选几项，并提供批量操作和取消选择；批量操作的位置全系统一致。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「主次操作、批量操作和状态信息位置一致。」
- 示例（这样做）：已选数量 + 批量操作
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-list--list-batch

### LIST.CREATE 新建的两种入口

右上角「新建」按钮打开弹窗、抽屉或新页面，新建成功后新条目排在列表第一并短暂高亮；在列表里就地添加时，用虚线「添加」按钮放在列表首或尾，新条目出现在按钮的位置。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-list--list-create

### LIST.DELETE 删除：能撤销就撤销，不能撤销就就地确认

能撤销的删除直接执行，并在约 1 分钟内提供撤销；不能撤销的删除用贴着按钮的气泡确认框确认，不弹模态框；破坏性很大的操作（批量删除、清空）要再做一次验证，如输入名称确认。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：撤销保留时长 `p.undo_window` = 60000ms（Ant Design 设计原则 · 足不出户）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「高风险操作必须提供确认、复核、撤销或等效防错机制」
- 示例（这样做）：气泡确认框贴着按钮
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-global-data-list--list-delete

## 设计模式/原则 / 亲密性（PROXIMITY）

有关系的靠近，没关系的拉开；用间距的远近表达结构与层级。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-proximity--overview

### PROXIMITY.GROUPING 用间距远近表达分组

关系紧密的元素靠在一起，读作一个整体；没关系的拉开距离。纵向间距按 8 的倍数取（8 + 8n），常用小 8、中 16、大 24 三档（见「间距」领域 SPACING.TIERS）；需要再拉开层次时加减一个基础单位，或加分割线。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：纵向间距公式 `p.formula` = 8 + 8n（n ≥ 0）（Ant Design 设计规范 · 亲密性）
- 参数：小 `p.small` = 8px（token `spacing.sm`）
- 参数：中 `p.middle` = 16px（token `spacing.lg`）
- 参数：大 `p.large` = 24px（token `spacing.xl`）
- 示例（这样做）：标签和值靠近，组与组拉开
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-proximity--proximity-grouping

## 设计模式/原则 / 对齐（ALIGN）

文字左对齐共用起始边；横排表单标签右对齐带冒号；数字右对齐、小数位一致。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-alignment--overview

### ALIGN.TEXT 标题与正文左对齐

标题和正文左对齐，共用同一条起始边；短段落、行距较松的内容尤其要对齐起点。只有在刻意强调标题与正文的区别时才打破这条线。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-alignment--align-text

### ALIGN.FORM_LABEL 横排表单标签右对齐带冒号

标签在输入左侧的表单，标签右对齐并带冒号，冒号连成一条竖线，引导视线从上到下填写。

- 执行：人工评审；适用：管理侧
- 示例（这样做）：冒号连成一条线
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-alignment--align-form-label

### ALIGN.NUMBERS 数字右对齐、小数位一致

同一列的数字右对齐，小数位保持一致，方便上下比较（配合 TYPE.TABULAR_NUMS 的等宽数字）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-alignment--align-numbers

## 设计模式/原则 / 对比（CONTRAST）

主次分明；需要慎重的选择保持中立；状态靠颜色加形状或文字区分；对比要足够强。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-contrast--overview

### CONTRAST.PRIMARY_ACTION 突出主要操作，慎重的选择保持中立

更重要、更常用的操作要突出，也可以靠弱化其他操作来突出它。需要用户慎重判断的选择（同意或拒绝一份申请）两个按钮用同样的样式，不引导用户选某一个。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：审批时两个选择同等对待
- 示例（别这样做）：把「通过」做成主按钮，暗示用户选它
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-contrast--contrast-primary-action

### CONTRAST.STATUS 状态不只靠颜色

不同状态用不同颜色，同时配图标或文字，不能只靠颜色区分；交互状态（悬停、选中）的变化要明显。整页的标题与正文用字号、字重拉开层级，对比要足够强。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源」
- 示例（这样做）：颜色 + 文字
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-contrast--contrast-status

## 设计模式/原则 / 重复（REPEAT）

同类东西全系统长得一样、放在一样的位置，降低学习成本。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-repetition--overview

### REPEAT.CONSISTENCY 同类元素全系统一致

同一类元素（分割线、颜色、形状、信息格式、间距）在全系统用同一种做法；同类页面用同样的结构，共性问题在共享结构里改，不在单个页面里改。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「同类页面共性问题在共享结构层修复。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-repetition--repeat-consistency

## 设计模式/原则 / 直截了当（DIRECT）

在哪里看到就在哪里改；拖拽只沿一个方向，并提供不用拖拽的替代方式。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-direct--overview

### DIRECT.INLINE_EDIT 在哪看就在哪改

能就地编辑的不跳到另一页。偶尔改、以阅读为主的单个字段用点击编辑（悬停高亮，点开带确认和取消）；经常要改的用旁边的编辑图标或链接；多个字段一起改时进入行内编辑，切换前后表格列宽不跳动。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：单字段点击编辑
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-direct--direct-inline-edit

### DIRECT.DRAG 拖拽只沿一个方向，并有替代方式

可拖拽的条目悬停时出现拖拽手柄、指针变成手形，可放置的位置有明显外框；只沿一个方向拖（纵向或横向）；同时提供不用拖拽的替代方式（上移、下移按钮或序号输入）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「依赖拖拽的操作必须提供无需拖拽的等价路径」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-direct--direct-drag

## 设计模式/原则 / 足不出户（STAY）

能在当前页完成的不跳页：确认用气泡确认框或撤销，补充信息用浮层或抽屉，流程尽量在一页内展开。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-stay--overview

### STAY.ON_PAGE 能在当前页完成的不跳页

能撤销的操作直接做并提供撤销，不能撤销的用贴着按钮的气泡确认框；补充信息用浮层或抽屉，悬停触发的浮层约 0.5 秒后出现、移开立即关闭；小的文字修改用就地浮层，点击外部即保存并关闭；多步任务尽量在一页内逐步展开，只有步骤必须依次完成时才用分步弹窗，不把每一步拆成独立页面。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：悬停浮层出现延迟 `p.hover_delay` = 500ms（Ant Design 设计原则 · 足不出户）
- 参数：撤销保留时长 `p.undo_window` = 60000ms（Ant Design 设计原则 · 足不出户）
- 示例（这样做）：悬停看详情，不跳页
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-stay--stay-on-page

## 设计模式/原则 / 简化交互（LIGHT）

关键操作常驻可见；上下文操作悬停出现；非主流程工具进入编辑模式才出现；可点区域做大，工具靠近内容。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-lightweight--overview

### LIGHT.TOOLS 工具按重要程度决定是否常驻

关键操作始终可见，有清晰的可点区域和悬停、点击状态；只和某一行或某个对象相关的操作，悬停时才出现；不属于主流程的工具，进入编辑模式后才出现。关键操作不能藏在悬停或模式切换后面。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-lightweight--light-tools

### LIGHT.HOTSPOT 可点区域做大，工具靠近内容

优先放大可点区域，而不是放大按钮本身（比如整个单元格都能点）；工具放在它作用的内容旁边。触控目标至少 24×24 CSS px。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：最小触控目标边长 `p.min_target` = 24px（pomaster 主题硬规范 · UI 呈现与设计）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「触控目标尺寸至少 24×24 CSS px」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-lightweight--light-hotspot

## 设计模式/原则 / 提供邀请（INVITE）

拖拽、就地编辑这类不容易发现的交互，要主动给出提示。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-invitation--overview

### INVITE.DISCOVERABILITY 不易发现的交互要有邀请

拖拽、就地编辑、上下文工具这类不容易发现的交互要给出提示：空状态引导第一步、悬停时提示可点或可编辑、未完成的任务提示继续。新功能引导只放几步，可跳过、可重看；不能拿引导来弥补交互本身的问题。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：未完成任务提示继续
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-invitation--invite-discoverability

## 设计模式/原则 / 巧用过渡（TRANSITION）

用过渡说明刚刚发生了什么；新增、修改、删除各有提示；不动没变化的东西；尊重减少动效设置。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-transition--overview

### TRANSITION.EXPLAIN 用过渡说明发生了什么

切换视图时用滑动、展开等过渡保留上下文；新增的条目短暂高亮，修改过的单元格短暂着色后恢复，删除的元素平滑移除，高亮在几秒内淡出；不给没变化的元素加动画；用户系统开启「减少动效」时关闭或降级过渡。时长取动效 token。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：短 `p.fast` = 0.1s（token `motion.fast`）
- 参数：中 `p.normal` = 0.2s（token `motion.normal`）
- 参数：长 `p.slow` = 0.3s（token `motion.slow`）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-transition--transition-explain

## 设计模式/原则 / 即时反应（REACT）

输入时即时给出联想、校验与结果；加载样式随操作的频率与重要程度选；新内容到达时提示或短暂高亮。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-reaction--overview

### REACT.IMMEDIATE 输入时即时反应

输入时给出联想、实时校验（如密码强度）、实时搜索结果，并做防抖、取消旧请求、丢弃过期响应；加载样式按操作的频率和重要程度选（按钮、表格、整页），不要所有操作都用同一种；有新内容时提示刷新，或在几秒内高亮新到的条目；提示逐步给，不要一次全摆出来。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「搜索防抖、旧请求取消、过期响应丢弃。」
- 示例（这样做）：输入联想
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-principles-reaction--react-immediate

## 设计模式/模板文档 / 数据可视化页（VIZ）

概览、分析、明细三类；最重要的指标放左上；一屏 5 到 9 个模块；高度概括的数据用指标卡；一张卡片一个主题。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-templates-visualization-page--overview

### VIZ.TYPES 先定页面类型

数据可视化页分三类：概览（指标大盘、监控）、分析（多维分析）、明细（数据明细）。先定类型，再选模块。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-templates-visualization-page--viz-types

### VIZ.LAYOUT 重要的放左上，一屏 5 到 9 个模块

最重要的指标和视图放在页面顶部或左上；一屏控制在 5 到 9 个模块；高度概括的数据优先用指标卡（数值），而不是图表；一张卡片一个主题，相关度高的数据合并到一张卡片，用通栏分割线分开。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：一屏模块数 `p.modules` = 5 个 / 9 个（Ant Design 模板文档 · 数据可视化页）
- 示例（这样做）：顶部一排指标卡
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-templates-visualization-page--viz-layout

### VIZ.CHART 选对图表，讲清口径

按要表达的关系选图表类型（趋势用折线，构成用堆叠，比较用柱状），必要时说明指标口径；用筛选让用户既能看全局，也能下钻到细节；页面之间用交互串联。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-templates-visualization-page--viz-chart

## 设计模式/模板文档 / 详情页（DETAIL）

按信息复杂度选布局；信息平铺直给；用分割线、卡片、标签页分出层级；单据类流程操作放页脚。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-templates-detail-page--overview

### DETAIL.LAYOUT 按复杂度选布局

内容简单时放在一张卡片里，用非通栏分割线分组；有多个复杂模块时每个模块一张卡片（审批单据类）；内容多到一页放不下时用标签页做导航；按阶段推进的内容用步骤组织。默认用最简单的那种。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：一张卡片，非通栏分割线分组
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-templates-detail-page--detail-layout

### DETAIL.FLAT 信息平铺，强相关的靠近

信息平铺直给，没有必要不折叠、不隐藏；强相关的内容靠近，弱相关的拉开；同类详情页用同样的结构和模块。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-templates-detail-page--detail-flat

### DETAIL.SEPARATORS 分隔方式对应层级

组内用非通栏分割线，大段之间用通栏分割线，一个主题一张卡片，最高一级用标签页（按版本、意图或阶段）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-templates-detail-page--detail-separators

### DETAIL.ACTIONS 单据流程操作放页脚

审批单据类详情页的流程操作（通过、驳回、转交、加签、挂起、撤回）放在页面底部按钮区；通过与驳回同等样式（见 CONTRAST.PRIMARY_ACTION）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-patterns-templates-detail-page--detail-actions

## 工程规范 / 状态管理（STATE）

每份状态有属主；服务端数据进查询缓存，不复制进全局 store；全局 store 只放稳定的跨页状态；可分享的状态进 URL；组件不直接发请求；身份切换与卸载时清理。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--overview

### STATE.OWNERSHIP 每份状态声明属主

每份状态都说清楚：谁拥有、谁能改、放在哪（组件内、页面、全局 store、查询缓存、URL、浏览器存储）、活多久、什么时候清理。组件自己的状态留在组件里，不放进全局 store。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「每个状态声明 owner、更新者、存储位置、生命周期和清理策略。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 将组件状态放入全局 store。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--state-ownership

### STATE.SERVER_STATE 服务端数据进查询缓存，不复制进全局 store

从接口来的数据由查询缓存层管理（缓存 key、过期、重新获取、失效都在这一层），页面直接从查询缓存读；不把服务端数据复制进全局 store 再手动同步，也不在全局 store 里存大量业务数据。查询缓存用哪个库由项目定。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：查询缓存库 `p.query_library`：待项目决定——查询缓存层用哪个库？（候选 @tanstack/vue-query / Pinia Colada）
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「server state 由查询缓存层管理。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 复制 server state 到全局 store 手动同步。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 在全局状态库存储大量业务数据（server state 须走 Query Cache）。」
- 示例（这样做）：页面从查询缓存读
- 示例（别这样做）：拉回来塞进全局 store 再同步
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--state-server-state

### STATE.GLOBAL_STORE 全局 store 用 Pinia，只放稳定的跨页状态

全局状态库用 Pinia（Vuex 已是维护模式，不再使用）；全局 store 只放跨页面且稳定的状态，比如当前用户、权限、偏好设置；每个 store 一个文件，放在约定目录，文件头写明属主。

- 执行：机器门禁 `state.store-library`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：全局状态库 `p.library` = Pinia（pomaster 技术栈规范 · Vue 3（状态与路由选官方方案））
- 硬规范依据：specs/hard/stacks/vue3/vue3-framework-overlay.md「新应用状态管理选 Pinia」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「全局 store 只保存稳定跨页面状态。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--state-global-store

### STATE.URL 可分享、可恢复的状态进 URL

列表的筛选条件、页码、排序、当前标签页这类可分享、刷新后要恢复的状态放进 URL；敏感信息和没提交的表单不进 URL。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可分享和可恢复状态进入 URL。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 将敏感或未提交表单写入 URL。」
- 示例（这样做）：筛选与页码在 URL 里
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--state-url

### STATE.REQUESTS 组件不直接发请求

组件不直接调用 fetch、axios，一律经生成的接口客户端（类型与 OpenAPI 同源）和查询缓存；展示组件不请求接口、不改路由、不改全局状态，数据从参数传入。

- 执行：机器门禁 `state.no-direct-request`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 让展示组件偷偷请求接口、改路由或全局状态。」
- 示例（别这样做）：组件里直接 fetch
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--state-requests

### STATE.CACHE_KEYS 缓存 key 带全条件，写操作声明失效

查询缓存的 key 包含所有影响结果的筛选条件和上下文（用户、租户、数据范围）；每个写操作声明它会让哪些查询失效，成功后刷新依赖数据；切换用户、角色、组织或数据范围时清掉可能越权的缓存。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「Query Key 包含所有影响结果的筛选和上下文。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「写操作定义依赖失效矩阵。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「用户、权限或范围切换时清除越权风险状态。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--state-cache-keys

### STATE.CLEANUP 卸载与身份切换时清理，迟到的结果不写回

状态持有的监听器、计时器、订阅、请求在组件卸载、身份切换时清理；已取消的请求、旧订阅、旧身份下的迟到结果不得写入当前状态。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 让已取消请求、旧订阅或旧身份上下文的迟到结果继续写入当前状态。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--state-cleanup

### STATE.FORM_MODEL 表单用独立的表单模型

表单用独立的表单模型和类型化的校验 schema，不直接绑定接口返回的 DTO；区分初始值、当前值、是否改过、错误和提交中。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「使用独立 FormModel 和 typed schema。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「MUST NOT 直接绑定 DTO。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--state-form-model

### STATE.BROWSER_STORAGE 浏览器存储要登记，不存凭据

存进浏览器（localStorage、IndexedDB 等）的每一项都登记用途、隔离 key（按用户、租户）、版本、大小、过期时间和清理时机；读回来先校验版本和身份；脚本可读的存储里不放会话标识、刷新令牌等凭据。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「每个持久化项必须声明用途、Storage Class、Isolation Key、schema 版本、大小预算、过期时间、迁移/重置策略、清理触发器和 Owner。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可被脚本读取的存储不得持久化 session identifier、refresh token、secret 或等价凭据」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-state--state-browser-storage

## 工程规范 / 性能（PERF）

先定预算；路由与重组件按需加载；大列表分页、宽表虚拟化；输入防抖并丢弃过期响应；初始化请求并行；度量分清实验室与真实用户数据。

页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-performance--overview

### PERF.BUDGET 先定性能预算

上线前定好预算：真实用户第 75 百分位 LCP ≤ 2.5 s、INP ≤ 200 ms、CLS ≤ 0.1（用户侧必须达到，管理侧作为参考目标，项目可以凭证据收紧）；首屏脚本体积和单个路由分包体积由项目定上限。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：LCP（p75） `p.lcp` = 2500ms（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 参数：INP（p75） `p.inp` = 200ms（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 参数：CLS（p75） `p.cls` = 0.1（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 参数：首屏脚本体积 `p.initial_js`：待项目决定——首屏脚本（压缩后）体积上限是多少 KB？
- 参数：路由分包体积 `p.route_chunk`：待项目决定——单个路由分包（压缩后）体积上限是多少 KB？
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「定义首屏、包体、交互和核心页面预算。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「默认参考目标为 p75 的 LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-performance--perf-budget

### PERF.LAZY_LOAD 路由与重组件按需加载

路由一律懒加载；图表、富文本编辑器、大表格等重组件在用到的页面里按需加载；应用入口（main.ts）不同步引入这些重型依赖；页面先加载核心内容，非核心的延后。

- 执行：机器门禁 `perf.lazy-load`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「路由、图表和重组件按需加载。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 在应用入口同步 import 重型编辑器、图表库或大表组件（首屏重依赖）。」
- 示例（这样做）：路由懒加载
- 示例（别这样做）：入口同步引入图表库
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-performance--perf-lazy-load

### PERF.ON_DEMAND_LIBRARY 组件库按需引入

组件库按需引入，不整包注册：管理侧按组件引入 ant-design-vue；用户侧 Vant 用官方的自动按需引入插件，不与全量引入混用。

- 执行：机器门禁 `perf.no-full-library-import`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/stacks/h5/h5-mobile-overlay.md「Vant 引入必须走官方口径」
- 示例（别这样做）：整包注册
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-performance--perf-on-demand-library

### PERF.LARGE_LISTS 大列表分页，宽表虚拟化

大列表走服务端分页、筛选、排序（管理侧每页最多 200 条，用户侧每次最多 50 条，与接口分页档一致）；行数多或列很多的表格用虚拟滚动；不用 v-for 一次渲染全量数据。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：管理侧每页上限 `p.admin_max_page_size` = 200 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：用户侧每次上限 `p.public_max_page_size` = 50 个（pomaster 脚手架部署面默认档（分页默认值与页长上限））
- 参数：虚拟滚动阈值 `p.virtual_threshold`：待项目决定——表格多少行以上启用虚拟滚动？
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「大列表服务端分页，宽表虚拟化。」
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 大列表用普通 `v-for` 渲染全量数据（须虚拟滚动或分页）。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-performance--perf-large-lists

### PERF.INPUT 输入防抖，丢弃过期响应

搜索、联想等随输入触发的请求做防抖；新请求发出时取消旧请求；过期的响应不覆盖新状态。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：防抖间隔 `p.debounce`：待项目决定——输入防抖间隔取多少毫秒？（候选 300ms）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「搜索防抖、旧请求取消、过期响应丢弃。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-performance--perf-input

### PERF.PARALLEL_INIT 页面初始化请求并行

页面初始化需要的多个请求并行发出，或由后端聚合成一个；不串行等待彼此无关的请求。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 串行发起可并行的页面初始化请求（须并行或后端聚合）。」
- 示例（这样做）：并行
- 示例（别这样做）：串行等待
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-performance--perf-parallel-init

### PERF.COMPUTE 渲染里不做重计算

渲染函数和模板里不做复杂计算，派生值用 computed；对大数据全集的计算放到后端或 Web Worker，前端只做即时的轻计算。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 在 render 中执行复杂计算。」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-performance--perf-compute

### PERF.MEASURE 度量分清实验室与真实用户

性能结论分清实验室数据和真实用户数据，记录设备、网络、浏览器、样本量和统计口径，放行看第 75 百分位；同一数据量下对比前后结果，不拿平均值或单次本地耗时下结论。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「性能预算必须区分实验室数据与真实用户数据」
- 页面：https://river-singer.github.io/POMaster_VNext/?path=/story/standard-engineering-performance--perf-measure

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
