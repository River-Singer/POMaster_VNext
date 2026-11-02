# 前端设计规范（Ant Design，ant-design-vue@4.2.6）

> Storybook「规范」分区的 AI 可读孪生，由 packages/studio/scripts/lib/standard.mjs 生成，与页面同源。不要手改。
> 规范指纹 `sha256:816305082efcd895096ffd27fff31ca2e5577138a24801ca9aaef0083ec4be9b`；状态 origin=preset。
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
