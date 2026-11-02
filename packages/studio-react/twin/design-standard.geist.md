# 前端设计规范（Vercel Geist，shadcn/ui + Tailwind CSS 4）

> Storybook「规范」分区的 AI 可读孪生，由 packages/studio-react/scripts/lib/standard.mjs 生成，与页面同源。不要手改。
> 规范指纹 `sha256:d40e3d160661f7868c03739fe3ac45cc57124eca2759e99b6c19e48a91e6f2df`；状态 origin=preset。
> 修改规范：编辑 `packages/cli/seeds/design-standards/geist.yaml` → `pomaster design validate --system geist` → `node packages/studio-react/run.mjs generate`。
> 机器门禁规则违反即拦截（检查未接入时按评审执行）；人工评审规则在评审时逐条核对。

## 基础 / 字体（TYPE）

Geist Sans 与 Geist Mono 两套字体；字号只用 Geist 的四组排版类（标题、按钮、标签、正文），不自造字号和字重。

页面：?path=/story/standard-foundations-typography--overview

### TYPE.FAMILY 两套字体各管各的

正文、标题、标签、控件、表格、图表都用 Geist Sans；Geist Mono 只用于代码、命令、路径、原始 token、时间戳和短标识。字体从 Google Fonts 加载 Geist 与 Geist Mono，字重 400 到 600。字体族只经 font-sans / font-mono（或带 -mono 的排版类）取，不写内联 font-family：主题里的字体栈带系统字体兜底，中文字形由系统无衬线字体补上。

- 执行：机器门禁 `style.font-family-token`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：无衬线 `p.sans` = Geist（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：等宽 `p.mono` = Geist Mono（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：字重范围 `p.weights` = 400 / 600（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 示例（这样做）：正文用 Sans，标识用 Mono
- 示例（别这样做）：内联写字体名——只写一个字体名没有兜底，中文会落到浏览器默认字体（常是衬线体）。
- 页面：?path=/story/standard-foundations-typography--type-family

### TYPE.ROLES 按角色选排版类

字号只用 Geist 的四组排版类，类名里的数字就是字号：标题 text-heading-72 到 text-heading-14，用来开启页面或区块；按钮 text-button-16 / 14 / 12，只在按钮组件里用，14 是默认，12 只用于输入框里的小按钮；标签 text-label-20 到 text-label-12，用于单行文字，14 最常用；正文 text-copy-24 到 text-copy-13，用于多行文字，14 最常用。不自造字号，也不写数字字重。

- 执行：机器门禁 `style.font-size-scale`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：标题 `p.heading` = 72px / 64px / 56px / 48px / 40px / 32px / 24px / 20px / 16px / 14px（Geist · Typography）
- 参数：按钮 `p.button` = 16px / 14px / 12px（Geist · Typography）
- 参数：标签 `p.label` = 20px / 18px / 16px / 14px / 13px / 12px（Geist · Typography）
- 参数：正文 `p.copy` = 24px / 20px / 18px / 16px / 14px / 13px（Geist · Typography）
- 参数：行高 / 字重 / 字距 `p.line_heights`：待项目决定——各排版类的行高、字重、字距取多少？（Geist 官方数值在 Figma 里，接入设计稿后回填）
- 示例（这样做）：标题、标签、正文
- 示例（别这样做）：自造的 15px 与 font-weight 650
- 页面：?path=/story/standard-foundations-typography--type-roles

### TYPE.LABEL_VS_COPY 单行用标签，多行用正文

单行文字（菜单项、表单标签、与图标并排的文字）用标签类，行高留得足；多行文字用正文类。标签旁的次要信息用 text-label-13，数字用等宽数字；忙碌视图里的第三层信息用 text-label-12；正文里提到代码用 text-copy-13-mono。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：次要单行 `p.secondary` = text-label-13（Geist · Typography）
- 参数：第三层单行 `p.tertiary` = text-label-12（Geist · Typography）
- 参数：正文中的代码 `p.inline_code` = text-copy-13-mono（Geist · Typography）
- 示例（这样做）：标签 + 次要信息
- 页面：?path=/story/standard-foundations-typography--type-label-vs-copy

### TYPE.READING 长文行宽 60 到 68 个字符

长段落控制在每行 60 到 68 个字符；需要上下对比的数字用等宽数字（tabular-nums）。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：长文行宽 `p.line_length` = 60 字 / 68 字（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 页面：?path=/story/standard-foundations-typography--type-reading

## 基础 / 色彩（COLOR）

默认单色；颜色只经主题变量取得；状态色只表达状态，且不只靠颜色；不用装饰性渐变、发光、毛玻璃。

页面：?path=/story/standard-foundations-color--overview

### COLOR.MONOCHROME 默认单色，颜色只走主题变量

界面默认单色（黑、白、灰），颜色只经主题变量（background / foreground、primary、muted、border 等成对的变量）取得，不在组件里写死色值。主题变量当前取 shadcn/ui neutral 主题作为近似，拿到 Geist 官方色板后替换。

- 执行：机器门禁 `style.no-raw-color`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：主题变量近似来源 `p.theme` = shadcn/ui neutral（shadcn/ui · Theming（neutral 主题 CSS 变量））
- 参数：shadcn 默认 --radius `p.radius` = 0.625rem（shadcn/ui · Theming（neutral 主题 CSS 变量））
- 示例（这样做）：成对变量：表面与其上的文字
- 页面：?path=/story/standard-foundations-color--color-monochrome

### COLOR.STATUS 状态色只表达状态

蓝、绿、黄、红只用来表达信息、成功、警告、错误四种状态，并且同时给出文字或图标，不能只靠颜色。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：状态 `p.statuses` = info / success / warning / error（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源」
- 示例（这样做）：颜色 + 文字
- 页面：?path=/story/standard-foundations-color--color-status

### COLOR.NO_DECORATION 不用装饰性效果

不用装饰性渐变、渐变文字、发光、色块、条纹、纹理、网格背景、毛玻璃，也不用装饰性或伪立体阴影。渐变只在表示连续数据刻度时使用，并且要标注。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：渐变文字 + 发光
- 页面：?path=/story/standard-foundations-color--color-no-decoration

## 基础 / 材质（MATERIAL）

页面内表面与浮层各有固定圆角；只有提示气泡带指向三角；阴影只表达层级，不作装饰。

页面：?path=/story/standard-foundations-materials--overview

### MATERIAL.SURFACES 页面内表面的圆角

页面内的表面按抬升程度取圆角：base 与 small 用 6px，medium 与 large 用 12px。同一层级的表面圆角一致。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：material-base `p.base` = 6px（Geist · Materials）
- 参数：material-small `p.small` = 6px（Geist · Materials）
- 参数：material-medium `p.medium` = 12px（Geist · Materials）
- 参数：material-large `p.large` = 12px（Geist · Materials）
- 示例（这样做）：6px 与 12px 两档
- 页面：?path=/story/standard-foundations-materials--material-surfaces

### MATERIAL.FLOATING 浮层的圆角与层级

浮在页面之上的元素按层级取圆角：提示气泡 6px（阴影最轻，也是唯一带指向三角的浮层）；菜单 12px；对话框 12px（比菜单抬得更高）；全屏层 16px。阴影只表达层级，具体阴影值待项目决定。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：material-tooltip `p.tooltip` = 6px（Geist · Materials）
- 参数：material-menu `p.menu` = 12px（Geist · Materials）
- 参数：material-modal `p.modal` = 12px（Geist · Materials）
- 参数：material-fullscreen `p.fullscreen` = 16px（Geist · Materials）
- 参数：阴影 `p.shadows`：待项目决定——各层级的阴影取什么值？（Geist 官网正文未给出）
- 页面：?path=/story/standard-foundations-materials--material-floating

## 基础 / 栅格（GRID）

桌面 12 列、平板 6 列、手机 4 列；长文占 6 到 7 列；带参考线的二维布局才用 Geist Grid 的画法。

页面：?path=/story/standard-foundations-grid--overview

### GRID.COLUMNS 12 / 6 / 4 列

外层栅格桌面 12 列、平板 6 列、手机 4 列；长文内容占 6 到 7 列，表格、图表、计算器和主要对比可以占满 12 列。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：桌面 `p.desktop` = 12 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：平板 `p.tablet` = 6 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：手机 `p.mobile` = 4 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：长文占列 `p.prose_span` = 6 个 / 7 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 示例（这样做）：12 列里长文占 7 列
- 页面：?path=/story/standard-foundations-grid--grid-columns

### GRID.GUIDES 参考线只在二维布局里用

参考线和格子边框本身是设计的一部分时，才用带参考线的网格（Geist Grid 的画法）；普通的响应式内容用 Tailwind 的 grid 工具类。网格最多嵌套一层；参考线是装饰，标 aria-hidden；可点的格子有自己的焦点环，Tab 顺序按阅读顺序；参考线对比度不低于 3:1。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：参考线最低对比度 `p.guide_contrast` = 3:1（Geist · Grid）
- 参数：最多嵌套层数 `p.max_nesting` = 1 个（Geist · Grid）
- 页面：?path=/story/standard-foundations-grid--grid-guides

## 基础 / 间距（SPACING）

间距只取间距阶梯；组内、组间、区块、章节各用一段阶梯。

页面：?path=/story/standard-foundations-spacing--overview

### SPACING.SCALE 间距只取阶梯，按关系选档

间距只用间距阶梯（Tailwind 的 --spacing 基数 0.25rem 的整数倍），不写任意值。组内元素用第 2 到 4 档，组与组之间用第 6 到 8 档，大区块转折用第 8 到 12 档；第 16 档只用于真正的章节分隔，不作为页面默认间距。

- 执行：机器门禁 `style.spacing-scale`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：间距基数 --spacing `p.base` = 0.25rem（Tailwind CSS · 间距（--spacing 基数））
- 参数：组内档位 `p.within_group` = 2 个 / 4 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：组间档位 `p.between_groups` = 6 个 / 8 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：区块档位 `p.sections` = 8 个 / 12 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：章节档位 `p.chapter` = 16 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 示例（这样做）：组内 gap-2，组间 gap-6
- 示例（别这样做）：任意值
- 页面：?path=/story/standard-foundations-spacing--spacing-scale

## 基础 / 图标（ICON）

只用一套图标库；图标只在能让操作更快被认出时使用；纯图标按钮要有名字。

页面：?path=/story/standard-foundations-icons--overview

### ICON.LIBRARY 只用 lucide-react

图标统一用 lucide-react（shadcn/ui 的默认图标库），不混用第二套。Geist 官方图标包 @vercel/geistcn-assets 未公开发布，公开后再评估替换。图标只在一个约定俗成的图标能让操作更快被认出时才用。

- 执行：机器门禁 `icon.single-library`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：图标库 `p.library` = lucide-react（pomaster 预设约定（Geist 体系））
- 参数：Geist 官方图标包 `p.official` = @vercel/geistcn-assets（未公开）（Geist · Icons（图标包 @vercel/geistcn-assets））
- 示例（这样做）：图标与文字并排
- 页面：?path=/story/standard-foundations-icons--icon-library

### ICON.BUTTON_LABEL 纯图标按钮要有名字

只有图标的按钮必须带 aria-label，悬停时用提示显示同样的文字。

- 执行：机器门禁 `markup.icon-button-label`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 图标按钮缺少 aria-label 或等效可访问名称。」
- 示例（这样做）：带 aria-label
- 页面：?path=/story/standard-foundations-icons--icon-button-label

## 基础 / 动效（MOTION）

默认静止；动效只用来解释状态变化、保持连续、确认操作；尊重减少动效设置。

页面：?path=/story/standard-foundations-motion--overview

### MOTION.PURPOSE 默认静止，动效要有理由

界面默认静止。动效只用于三件事：解释状态变化、保持视觉连续、确认一个操作。不用跑马灯、打字光标、脉冲指示、弹跳、视差和滚动出现效果；用户开启「减少动效」时关闭或降级。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级」
- 页面：?path=/story/standard-foundations-motion--motion-purpose

## 基础 / 布局与可访问性（LAYOUT）

一个 h1、标题有序；先换行再缩小；网格与弹性子项设 min-width 0；不藏溢出；源码顺序即阅读顺序。

页面：?path=/story/standard-foundations-layout--overview

### LAYOUT.HEADINGS 一个 h1，标题有序

每个页面一个 h1，标题逐级下降；用地标元素、跳转到主内容的链接、原生控件、语义化表格和可见的焦点环，满足 WCAG AA。

- 执行：机器门禁 `markup.heading-order`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「标题层级 h1–h6 与视觉层级一致，不跳过层级」
- 页面：?path=/story/standard-foundations-layout--layout-headings

### LAYOUT.REFLOW 先换行，再缩小

空间不够时先重新排布（换行、换列），不先缩小字号；网格和弹性布局的子项设 min-width 0，避免被长内容撑破；不用 overflow 隐藏把内容藏起来；源码顺序就是阅读顺序。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：子项 min-w-0，长文本截断
- 页面：?path=/story/standard-foundations-layout--layout-reflow

## 出处

- `SRC.GEIST.HOME` Vercel Geist 设计体系：https://vercel.com/geist（核实 2026-11-02）
- `SRC.GEIST.TYPOGRAPHY` Geist · Typography：https://vercel.com/geist/typography（核实 2026-11-02）
- `SRC.GEIST.MATERIALS` Geist · Materials：https://vercel.com/geist/materials（核实 2026-11-02）
- `SRC.GEIST.GRID` Geist · Grid：https://vercel.com/geist/grid（核实 2026-11-02）
- `SRC.GEIST.ICONS` Geist · Icons（图标包 @vercel/geistcn-assets）：https://vercel.com/geist/icons（核实 2026-11-02）
- `SRC.VERCEL.DESIGN_MD` Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性）：https://vercel.com/design.md（核实 2026-11-02）
- `SRC.SHADCN.THEMING` shadcn/ui · Theming（neutral 主题 CSS 变量）：https://ui.shadcn.com/docs/theming（核实 2026-11-02）
- `SRC.TAILWIND.SPACING` Tailwind CSS · 间距（--spacing 基数）：https://tailWindcss.com/docs/customizing-spacing（核实 2026-11-02）
- `SRC.POMASTER.UI_SPEC` pomaster 主题硬规范 · UI 呈现与设计：repo:packages/cli/seeds/specs/hard/themes/ui-presentation-and-design.md（核实 2026-11-02）
- `SRC.POMASTER.PRESET` pomaster 预设约定（Geist 体系）：repo:packages/cli/seeds/design-standards/geist.yaml（核实 2026-11-02）
