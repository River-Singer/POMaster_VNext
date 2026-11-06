# 前端设计规范（Vercel Geist，shadcn/ui + Tailwind CSS 4）

> Storybook「规范」分区的 AI 可读孪生，由 packages/studio-react/scripts/lib/standard.mjs 生成，与页面同源。不要手改。
> 规范指纹 `sha256:0ca96bd32d6cbde90807dcde8dae075addabb292ecb6ec6ab973d41933a80b83`；状态 origin=preset。
> 修改规范：编辑 `packages/cli/seeds/design-standards/geist.yaml` → `pomaster design validate --system geist` → `node packages/studio-react/run.mjs generate`；目录（领域与条目）由骨架 `packages/cli/seeds/design-standards/skeleton.yaml` 统一。
> 机器门禁规则违反即拦截（检查未接入时按评审执行）；人工评审规则在评审时逐条核对。标「待补」的是骨架里有、本体系还没写的：开发时参照另一套体系的同名页，并在评审时说明。

## 基础 / 色彩（COLOR）

默认单色；每个色阶 10 档、每档用途固定；主操作用最深的灰，彩色只表达状态；颜色只经主题变量取，不用装饰性效果。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-color--overview

### COLOR.PALETTE 色板

色彩体系共 10 个色阶：背景、灰、透明灰、蓝、红、琥珀、绿、青、紫、粉。除背景外每个色阶 10 档，100 到 1000 的用途固定：1–3 档是组件背景（默认、悬停、按下），4–6 档是边框（默认、悬停、按下），7–8 档是高对比背景，9–10 档是文字与图标。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：每个色阶的档数 `p.steps` = 10 个（Geist · Colors（色阶、档位用途、gray 与 gray-alpha 的取舍））
- 色板「背景与灰阶」：
  - 背景（background）：background-100 oklch(1 0 0) 默认背景；background-200 oklch(0.984 0 0) 次级背景（少用）
  - 灰（gray）：gray-100 oklch(0.961 0 0) 默认背景；gray-200 oklch(0.94 0 0) 悬停背景；gray-300 oklch(0.925 0 0) 按下背景；gray-400 oklch(0.937 0 0) 默认边框；gray-500 oklch(0.836 0 0) 悬停边框；gray-600 oklch(0.732 0 0) 按下边框；gray-700 oklch(0.65 0 0) 高对比背景；gray-800 oklch(0.59 0 0) 悬停高对比背景；gray-900 oklch(0.42 0 0) 次要文字与图标；gray-1000 oklch(0.205 0 0) 主要文字与图标
  - 灰（透明）（gray-alpha）：gray-alpha-100 oklch(0 0 0 / 0.05)；gray-alpha-200 oklch(0 0 0 / 0.081)；gray-alpha-300 oklch(0 0 0 / 0.1)；gray-alpha-400 oklch(0 0 0 / 0.08)；gray-alpha-500 oklch(0 0 0 / 0.21)；gray-alpha-600 oklch(0 0 0 / 0.24)；gray-alpha-700 oklch(0 0 0 / 0.44)；gray-alpha-800 oklch(0 0 0 / 0.51)；gray-alpha-900 oklch(0 0 0 / 0.7)；gray-alpha-1000 oklch(0 0 0 / 0.91)
- 色板「彩色色阶」：
  - 蓝（blue）：blue-100 oklch(97.32% 0.0141 251.56)；blue-200 （未公开）；blue-300 （未公开）；blue-400 oklch(91.58% 0.0473 245.116)；blue-500 （未公开）；blue-600 （未公开）；blue-700 oklch(57.61% 0.2508 258.23)；blue-800 （未公开）；blue-900 oklch(53.18% 0.2399 256.99)；blue-1000 oklch(26.67% 0.1099 254.34)
  - 绿（green）：green-100 oklch(97.59% 0.0289 145.42)；green-200 （未公开）；green-300 （未公开）；green-400 oklch(91.49% 0.0976 146.24)；green-500 （未公开）；green-600 （未公开）；green-700 oklch(64.58% 0.1746 147.27)；green-800 （未公开）；green-900 oklch(51.75% 0.1453 147.65)；green-1000 oklch(29.15% 0.1197 147.38)
  - 琥珀（amber）：amber-100 oklch(97.48% 0.0331 85.79)；amber-200 （未公开）；amber-300 （未公开）；amber-400 oklch(91.02% 0.1322 88.25)；amber-500 （未公开）；amber-600 （未公开）；amber-700 oklch(81.87% 0.1969 76.46)；amber-800 （未公开）；amber-900 oklch(52.79% 0.1496 54.65)；amber-1000 oklch(30.83% 0.099 45.48)
  - 红（red）：red-100 oklch(96.5% 0.0223 13.09)；red-200 （未公开）；red-300 （未公开）；red-400 oklch(91.51% 0.0471 19.8)；red-500 （未公开）；red-600 （未公开）；red-700 oklch(62.56% 0.2524 23.03)；red-800 （未公开）；red-900 oklch(54.99% 0.232 25.29)；red-1000 oklch(24.8% 0.1041 18.86)
  - 青（teal）：teal-100 （未公开）；teal-200 （未公开）；teal-300 （未公开）；teal-400 （未公开）；teal-500 （未公开）；teal-600 （未公开）；teal-700 （未公开）；teal-800 （未公开）；teal-900 （未公开）；teal-1000 （未公开）
  - 紫（purple）：purple-100 （未公开）；purple-200 （未公开）；purple-300 （未公开）；purple-400 （未公开）；purple-500 （未公开）；purple-600 （未公开）；purple-700 （未公开）；purple-800 （未公开）；purple-900 （未公开）；purple-1000 （未公开）
  - 粉（pink）：pink-100 （未公开）；pink-200 （未公开）；pink-300 （未公开）；pink-400 （未公开）；pink-500 （未公开）；pink-600 （未公开）；pink-700 （未公开）；pink-800 （未公开）；pink-900 （未公开）；pink-1000 （未公开）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-color--color-palette

### COLOR.TOKENS_ONLY 颜色只经 token 取

颜色只经主题变量取：Geist 色阶用 ds- 前缀的颜色类（bg-ds-gray-100、text-ds-gray-900），shadcn/ui 的成对变量（background / foreground、primary / primary-foreground）已映射到 Geist 色阶。不在组件里写死色值。

- 执行：机器门禁 `style.no-raw-color`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 示例（这样做）：用 Geist 色阶类
- 示例（别这样做）：写死色值
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-color--color-tokens-only

### COLOR.NEUTRAL_LAYERS 中性色分层

页面用背景 1（background-100），背景 2 只在需要轻微区分时少量使用。组件放在背景 1 上时，用灰 100 作悬停背景、灰 200 作按下背景；徽标这类小元素用灰 200 或 300 作底。默认用实色灰；只有需要透出底色时（阴影、遮罩）才用透明灰。

- 执行：人工评审；适用：管理侧与用户侧
- 对照表「档位与用途」（类名 → 用途）：
  - `bg-ds-background-100`：页面与组件的默认背景
  - `bg-ds-gray-100`：组件的悬停背景
  - `bg-ds-gray-200`：组件的按下背景；徽标底色
  - `border-ds-gray-400`：默认边框
  - `text-ds-gray-900`：次要文字与图标
  - `text-ds-gray-1000`：主要文字与图标
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-color--color-neutral-layers

### COLOR.BRAND 品牌色

Geist 默认单色，没有彩色的品牌主色：主操作用最深的灰（gray-1000）配背景色文字；蓝色只用于焦点环和信息提示，不用来装点主按钮或大面积背景。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：主操作底色 `p.primary` = gray-1000（Geist · Button）
- 参数：焦点环 `p.focus` = blue-700（Vercel 品牌样式表（派生自 GeistCN 源码，含 Geist 色阶色值））
- 示例（这样做）：主操作是黑底按钮
- 示例（别这样做）：给主按钮上彩色
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-color--color-brand

### COLOR.STATUS 状态色

彩色只表达状态，含义固定：绿表示健康或成功，红表示错误，琥珀表示警告，蓝表示信息，灰表示中性。状态总伴随文字，颜色去掉后文字仍能读懂。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：成功 `p.success` = green-900（Vercel 品牌样式表（派生自 GeistCN 源码，含 Geist 色阶色值））
- 参数：错误 `p.error` = red-700（Vercel 品牌样式表（派生自 GeistCN 源码，含 Geist 色阶色值））
- 参数：警告 `p.warning` = amber-900（Vercel 品牌样式表（派生自 GeistCN 源码，含 Geist 色阶色值））
- 参数：信息 `p.info` = blue-700（Vercel 品牌样式表（派生自 GeistCN 源码，含 Geist 色阶色值））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源」
- 示例（这样做）：颜色配文字
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-color--color-status

### COLOR.BORDERS 边框

边框默认用实色灰 400，只有边缘需要和表面融在一起时才用同档的透明灰。每条边只画一次：容器里的分割线画在边框里面，不让两条半透明边框交叠出更深的交点。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：默认边框 `p.default` = gray-400（Geist · Colors（色阶、档位用途、gray 与 gray-alpha 的取舍））
- 示例（这样做）：分割线在边框里面
- 示例（别这样做）：两条透明边框叠在一起
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-color--color-borders

### COLOR.NO_DECORATION 不用装饰性效果

不用装饰性渐变、渐变文字、发光、色块、条纹、纹理、网格背景、毛玻璃，也不用装饰性或伪立体阴影。渐变只在表示连续数据刻度时使用，并且要标注。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：渐变文字加发光
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-color--color-no-decoration

## 基础 / 字体（TYPE）

Geist Sans 与 Geist Mono；字号只用 Geist 的四组排版类（标题、按钮、标签、正文）；单行用标签，多行用正文。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--overview

### TYPE.FAMILY 字体族

正文、标题、标签、控件、表格、图表都用 Geist Sans；Geist Mono 只用于代码、命令、路径、原始 token、时间戳和短标识。字体从 Google Fonts 加载，字重 400 到 600。字体族只经 font-sans / font-mono（或带 -mono 的排版类）取，不写内联 font-family：主题里的字体栈带系统字体兜底，中文字形由系统无衬线字体补上。

- 执行：机器门禁 `style.font-family-token`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：无衬线 `p.sans` = Geist（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：等宽 `p.mono` = Geist Mono（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：字重范围 `p.weights` = 400 / 600（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 示例（这样做）：正文用 Sans，标识用 Mono
- 示例（别这样做）：内联写字体名——只写一个字体名没有兜底，中文会落到浏览器默认字体（常是衬线体）。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--type-family

### TYPE.SCALE 字阶

字号只用 Geist 的四组排版类，类名里的数字就是字号。标题类开启页面或区块；按钮类只在按钮组件里用；标签类用于单行文字；正文类用于多行文字。不自造字号。

- 执行：机器门禁 `style.font-size-scale`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：标题 `p.heading` = 72px / 64px / 56px / 48px / 40px / 32px / 24px / 20px / 16px / 14px（Geist · Typography）
- 参数：按钮 `p.button` = 16px / 14px / 12px（Geist · Typography）
- 参数：标签 `p.label` = 20px / 18px / 16px / 14px / 13px / 12px（Geist · Typography）
- 参数：正文 `p.copy` = 24px / 20px / 18px / 16px / 14px / 13px（Geist · Typography）
- 对照表「标题」（类名 → 用途）：
  - `text-heading-72`
  - `text-heading-64`
  - `text-heading-56`
  - `text-heading-48`
  - `text-heading-40`
  - `text-heading-32`
  - `text-heading-24`
  - `text-heading-20`
  - `text-heading-16`
  - `text-heading-14`
- 对照表「按钮」（类名 → 用途）：
  - `text-button-16`：最大的按钮
  - `text-button-14`：默认按钮
  - `text-button-12`：只用于放在输入框里的小按钮
- 对照表「标签」（类名 → 用途）：
  - `text-label-20`
  - `text-label-18`
  - `text-label-16`：用在标题里，与常规文字区分
  - `text-label-14`：最常用的文字样式，菜单里大量使用
  - `text-label-14-mono`：最大的等宽字号，和 14 以上的文字搭配
  - `text-label-13`：其他标签旁的次要一行；表达数字时用等宽数字
  - `text-label-13-mono`：和 Label 14 搭配的等宽字号
  - `text-label-12`：忙碌视图里的第三层文字，如评论、展开更多
  - `text-label-12-mono`
- 对照表「正文」（类名 → 用途）：
  - `text-copy-24`：营销页的首屏
  - `text-copy-20`：营销页的首屏
  - `text-copy-18`：主要用于营销页、大段引语
  - `text-copy-16`：对话框这类留白充足的视图
  - `text-copy-14`：最常用的正文样式
  - `text-copy-13`：次要文字，空间紧张的视图
  - `text-copy-13-mono`：正文里提到的代码
- 示例（别这样做）：自造的 15px 与 font-weight 650
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--type-scale

### TYPE.WEIGHT 字重

字重跟着排版类走，不单独写 font-weight。需要在一段文字里强调时，在排版类里嵌套 strong 元素（Geist 的 Strong / Subtle 修饰）。

- 执行：机器门禁 `style.font-weight-allowed`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：行高 / 字重 / 字距 `p.class_metrics`：待项目决定——各排版类的行高、字重、字距取多少？（Geist 的完整数值在设计稿里，当前排版类只实现了字号）
- 示例（这样做）：用 strong 强调
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--type-weight

### TYPE.LINE_ROLES 单行与多行

单行文字（菜单项、表单标签、与图标并排的文字）用标签类，行高留得足；多行文字用正文类。标签旁的次要信息用 text-label-13；忙碌视图里的第三层信息用 text-label-12；正文里提到代码用 text-copy-13-mono。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：次要单行 `p.secondary` = text-label-13（Geist · Typography）
- 参数：第三层单行 `p.tertiary` = text-label-12（Geist · Typography）
- 参数：正文中的代码 `p.inline_code` = text-copy-13-mono（Geist · Typography）
- 示例（这样做）：标签加次要信息
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--type-line-roles

### TYPE.COLOR 文字颜色

文字只用两档：主要文字 gray-1000，次要文字 gray-900。更弱的灰只用于禁用态，不用来写说明文字。

- 执行：机器门禁 `style.no-raw-color`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：主要文字 `p.primary` = gray-1000（Geist · Colors（色阶、档位用途、gray 与 gray-alpha 的取舍））
- 参数：次要文字 `p.secondary` = gray-900（Geist · Colors（色阶、档位用途、gray 与 gray-alpha 的取舍））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源；文本对比度至少 4.5:1」
- 示例（这样做）：两档文字色
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--type-color

### TYPE.TABULAR_NUMS 等宽数字

需要上下对比的数字（表格的数字列、计数、用量、时间）用等宽数字（tabular-nums）或 Geist Mono，让各行的数位对齐。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：工具类 `p.utility` = tabular-nums（Geist · Table）
- 示例（这样做）：数字列对齐
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--type-tabular-nums

### TYPE.READING 长文行宽

长段落控制在每行 60 到 68 个字符；表格、表单这类结构化内容不受此限。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：长文行宽 `p.line_length` = 60 字 / 68 字（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 示例（这样做）：正文限制行宽
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--type-reading

### TYPE.RICH_TEXT 富文本

长文用正文类排版；正文里提到代码、路径、环境变量用 text-copy-13-mono；快捷键用键盘按键样式；多行源码用代码块，可复制的命令用命令片段，不用一段普通文字代替。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：行内代码与快捷键
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--type-rich-text

### TYPE.OVERFLOW 文字溢出

首尾都有信息的字符串（路径、地址、部署 ID、提交哈希）从中间省略，保留开头和结尾；句子、标题从末尾省略。被省略的值要能看到全文（文字提示）或一键复制。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：句子从末尾省略，悬停看全文
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-typography--type-overflow

## 基础 / 标题层级（HEADING）

应用界面最多三级标题；每个视图一个 h1；标题逐级下降；类名决定样子，元素决定层级。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-headings--overview

### HEADING.APP_LEVELS 应用界面的标题级数

应用界面最多三级标题：页面标题 text-heading-24 或 32，区块标题 text-heading-20，子区块 text-heading-16；更大的标题类留给营销页和文档首页。

- 执行：机器门禁 `markup.heading-level-max`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：页面标题 `p.page` = 24px / 32px（pomaster 预设约定（Geist 体系））
- 参数：区块标题 `p.section` = 20px（pomaster 预设约定（Geist 体系））
- 参数：子区块 `p.subsection` = 16px（pomaster 预设约定（Geist 体系））
- 参数：最多级数 `p.max_levels` = 3 个（pomaster 预设约定（Geist 体系））
- 示例（这样做）：三级标题
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-headings--heading-app-levels

### HEADING.SINGLE_H1 每个视图一个 h1

每个页面视图只有一个 h1，就是页面标题；卡片、对话框里的标题从 h2 往下排。

- 执行：机器门禁 `markup.single-h1`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-headings--heading-single-h1

### HEADING.ORDER 标题不跳级

标题逐级下降，不从 h2 直接跳到 h4；视觉层级和标题层级一致。

- 执行：机器门禁 `markup.heading-order`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「标题层级 h1–h6 与视觉层级一致，不跳过层级」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-headings--heading-order

### HEADING.CONTENT_LEVELS 内容型页面的标题

文档、营销这类内容型页面可以用更大的标题类：首屏 text-heading-48 到 72，章节 text-heading-32，小节 text-heading-24。同一页面里每一级只用一种类。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：首屏 `p.hero` = 48px / 72px（pomaster 预设约定（Geist 体系））
- 参数：章节 `p.chapter` = 32px（pomaster 预设约定（Geist 体系））
- 参数：小节 `p.section` = 24px（pomaster 预设约定（Geist 体系））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-headings--heading-content-levels

### HEADING.REAL_ELEMENT 用真正的标题元素

标题用 h1 到 h6 元素，排版类只决定样子；不用 div 加标题类假装标题，也不为了字号挑标题元素。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：元素定层级，类定样子
- 示例（别这样做）：div 假装标题
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-headings--heading-real-element

## 基础 / 图标（ICON）

一套线框图标；尺寸与间距跟随文字；颜色跟随文字；同一动作同一图标；纯图标按钮有名字。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-icons--overview

### ICON.LIBRARY 图标库

图标统一用 lucide-react，不混用第二套。Vercel 文档里的官方图标包 @vercel/geistcn-assets 在公开 npm 上装不到，能装后再评估替换。图标只在一个约定俗成的图标能让操作更快被认出时才用。

- 执行：机器门禁 `icon.single-library`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：图标库 `p.library` = lucide-react（pomaster 预设约定（Geist 体系））
- 参数：Geist 官方图标包 `p.official` = @vercel/geistcn-assets（公开 npm 上装不到）（Vercel Geist 设计体系）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-icons--icon-library

### ICON.STYLE 图标风格

只用线框图标，描边保持默认的 2；不在同一界面混用实心和线框，也不单独改某个图标的描边粗细。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：描边 `p.stroke` = 2px（lucide-react（线框图标，默认描边 2））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-icons--icon-style

### ICON.SIZE 图标尺寸

图标尺寸跟随相邻文字：16px 配 text-label-14 和 text-button-14（默认）；14px 配 text-label-13、徽标里的小图标；12px 只用于 tiny 按钮这类最紧凑的位置；空状态这类独立出现的图标用 32px。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：默认（配 14 号文字） `p.default` = 16px（Geist · Pie Gauge（行内图标尺寸））
- 参数：紧凑（配 13 号文字） `p.compact` = 14px（pomaster 预设约定（Geist 体系））
- 参数：最小 `p.tiny` = 12px（pomaster 预设约定（Geist 体系））
- 参数：独立图标 `p.standalone` = 32px（Geist · Empty State）
- 对照表「尺寸」（尺寸 → 用途）：
  - `12px · size-3`：tiny 按钮这类最紧凑的位置
  - `14px · size-3.5`：配 text-label-13，徽标里的图标
  - `16px · size-4`：默认，配 text-label-14 与按钮
  - `32px · size-8`：空状态这类独立出现的图标
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-icons--icon-size

### ICON.SPACING 图标与文字的间距

图标和 14 号文字之间留 8px（gap-2），和 13、12 号文字之间留 6px 或 4px；按钮里的间距由组件给出，不手动加空格。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：配 14 号文字 `p.gap` = 8px（pomaster 预设约定（Geist 体系））
- 示例（这样做）：用 gap 留间距
- 示例（别这样做）：用空格隔开
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-icons--icon-spacing

### ICON.COLOR 图标颜色

图标跟随相邻文字的颜色（currentColor）：主要图标 gray-1000，次要图标 gray-900。彩色图标只用于状态，并且旁边有文字。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：次要图标跟随次要文字
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-icons--icon-color

### ICON.SEMANTICS 同一动作同一图标

同一个动作全系统用同一个图标（删除、复制、刷新、外链各一个），同一个图标不表示两种意思。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：复制一律用同一个图标
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-icons--icon-semantics

### ICON.BUTTON_LABEL 纯图标按钮的名称

只有图标的按钮必须带 aria-label，名称写动作和对象（「复制部署地址」），不写图标名（「复制」）；悬停时用文字提示显示同样的文字。按钮已经有可见文字时不要再加 aria-label。

- 执行：机器门禁 `markup.icon-button-label`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 图标按钮缺少 aria-label 或等效可访问名称。」
- 示例（这样做）：带 aria-label
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-icons--icon-button-label

## 基础 / 材质（MATERIAL）

圆角三档（6、12、16）；页面内四种表面、页面上四种浮层；只有提示气泡带指向三角；阴影半透明，只表达层级。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-materials--overview

### MATERIAL.RADIUS 圆角

圆角只取三档：日常控件、小表面、提示气泡 6px；卡片、菜单、对话框 12px；全屏层 16px。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：控件与小表面 `p.small` = 6px（Geist · Materials）
- 参数：卡片、菜单、对话框 `p.large` = 12px（Geist · Materials）
- 参数：全屏层 `p.fullscreen` = 16px（Geist · Materials）
- 对照表「圆角」（类名 · 半径 → 用途）：
  - `rounded-md · 6px`：按钮、输入框、提示气泡
  - `rounded-xl · 12px`：卡片、菜单、对话框
  - `rounded-2xl · 16px`：全屏层
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-materials--material-radius

### MATERIAL.SURFACES 页面内的表面

页面内的表面按抬升程度分四种：base（日常）与 small（略抬起）用 6px 圆角，medium 与 large（更高）用 12px。同一层级的表面圆角一致。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：material-base `p.base` = 6px（Geist · Materials）
- 参数：material-small `p.small` = 6px（Geist · Materials）
- 参数：material-medium `p.medium` = 12px（Geist · Materials）
- 参数：material-large `p.large` = 12px（Geist · Materials）
- 对照表「页面内」（材质 → 用途）：
  - `material-base`：日常使用，圆角 6px
  - `material-small`：略抬起，圆角 6px
  - `material-medium`：更高，圆角 12px
  - `material-large`：更高，圆角 12px
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-materials--material-surfaces

### MATERIAL.FLOATING 浮层

浮在页面之上的元素：提示气泡 6px（阴影最轻，也是唯一带指向三角的浮层）；菜单 12px；对话框 12px（比菜单抬得更高）；全屏层 16px（抬得最高）。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：material-tooltip `p.tooltip` = 6px（Geist · Materials）
- 参数：material-menu `p.menu` = 12px（Geist · Materials）
- 参数：material-modal `p.modal` = 12px（Geist · Materials）
- 参数：material-fullscreen `p.fullscreen` = 16px（Geist · Materials）
- 对照表「页面之上」（材质 → 用途）：
  - `material-tooltip`：阴影最轻，圆角 6px，唯一带指向三角
  - `material-menu`：从页面抬起，圆角 12px
  - `material-modal`：抬得更高，圆角 12px
  - `material-fullscreen`：抬得最高，圆角 16px
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-materials--material-floating

### MATERIAL.SHADOWS 阴影

阴影只表达层级，并且保持半透明，和底色融在一起；不用不透明的灰色阴影（会留下一圈灰晕），也不用装饰性阴影。各层级的具体阴影值待项目决定，当前示例用 Tailwind 的阴影档近似。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：阴影值 `p.values`：待项目决定——各层级的阴影取什么值？（Geist 未公开）
- 示例（别这样做）：不透明的灰色阴影
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-materials--material-shadows

## 基础 / 布局（LAYOUT）

管理侧是顶栏加页内标签页；用户侧是移动端单列；先换行再缩小；外层管尺寸和滚动；层级只取预设档位。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-layout--overview

### LAYOUT.ADMIN_SHELL 管理侧页面骨架

管理侧页面是「顶栏（团队与项目切换）+ 页内标签页导航 + 内容区」；平级视图用标签页切换，不另开侧边菜单。内容区居中，最大宽度待项目决定。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：内容区最大宽度 `p.max_width`：待项目决定——内容区最大宽度取多少？（候选 1200px / 1400px）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-layout--layout-admin-shell

### LAYOUT.PUBLIC_SHELL 用户侧页面骨架

用户侧以移动端单列为基准：一列内容、底部主操作；小屏上的筛选、单个表单这类短任务用底部抽屉，不用对话框。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-layout--layout-public-shell

### LAYOUT.ADAPTIVE 适配基准与验收宽度

断点用 Tailwind 的默认档（sm 640、md 768、lg 1024、xl 1280）；验收至少覆盖 375、768、1280 三个宽度。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：断点 `p.breakpoints` = 640px / 768px / 1024px / 1280px（Tailwind CSS · 响应式断点）
- 参数：验收宽度 `p.acceptance` = 375px / 768px / 1280px（pomaster 预设约定（Geist 体系））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-layout--layout-adaptive

### LAYOUT.CONTENT_REGION 内容区边距与宽度

内容区左右边距随宽度取间距阶梯（手机 4 档、平板及以上 6 档），区块之间用 8 到 12 档；不同页面同一位置的边距一致。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：手机边距（档） `p.mobile_padding` = 4 个（pomaster 预设约定（Geist 体系））
- 参数：平板及以上边距（档） `p.padding` = 6 个（pomaster 预设约定（Geist 体系））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-layout--layout-content-region

### LAYOUT.REFLOW 先换行再缩小

空间不够时先重新排布（换行、换列），不先缩小字号；源码顺序就是阅读顺序。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：按钮组允许换行
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-layout--layout-reflow

### LAYOUT.OVERFLOW 尺寸与滚动的归属

网格和弹性布局的子项设 min-width 0，避免被长内容撑破；需要滚动时由明确的外层容器负责，不用 overflow 隐藏把内容藏起来。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：子项 min-w-0，长文本截断
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-layout--layout-overflow

### LAYOUT.Z_INDEX 层级

层级只取预设档位，从低到高：内容、吸顶元素、下拉与提示、抽屉、对话框、全局提示；不写任意的 z-index 数字。

- 执行：机器门禁 `style.no-raw-z-index`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：层级档位 `p.layers`：待项目决定——各层级的 z-index 取多少？
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-layout--layout-z-index

## 基础 / 栅格（GRID）

桌面 12 列、平板 6 列、手机 4 列；长文占 6 到 7 列；带参考线的二维布局才画参考线。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-grid--overview

### GRID.COLUMNS 栅格列数

外层栅格桌面 12 列、平板 6 列、手机 4 列；长文内容占 6 到 7 列，表格、图表和主要对比可以占满 12 列。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：桌面 `p.desktop` = 12 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：平板 `p.tablet` = 6 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：手机 `p.mobile` = 4 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：长文占列 `p.prose_span` = 6 个 / 7 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 示例（这样做）：12 列里长文占 7 列
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-grid--grid-columns

### GRID.GUTTER 列间距

列间距取间距阶梯，同一个栅格里固定一档，不随窗口缩放。

- 执行：机器门禁 `grid.gutter-allowed`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：列间距 `p.gutter`：待项目决定——列间距取 16 还是 24？（候选 16px / 24px）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-grid--grid-gutter

### GRID.ROW_SUM 一行的列数之和

一行里各格占的列数加起来不超过栅格总列数；超过就换行，不靠缩小格子硬塞。

- 执行：机器门禁 `grid.row-sum`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-grid--grid-row-sum

### GRID.BREAKPOINTS 断点

响应式布局在 sm、md、lg 三个断点都写明列数和行数，让格子在手机、平板、桌面之间按预期重排；只用 Tailwind 的断点档，不自造断点。

- 执行：机器门禁 `style.breakpoint-allowed`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：必写的断点 `p.breakpoints` = sm / md / lg（Geist · Grid）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-grid--grid-breakpoints

### GRID.GUIDES 参考线

参考线和格子边框本身是设计的一部分时（营销页、文档首页），才画带参考线的网格；普通的响应式内容用 Tailwind 的 grid 工具类。网格最多嵌套一层；参考线是装饰，标 aria-hidden；可点的格子有自己的焦点环；参考线对比度不低于 3:1。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：参考线最低对比度 `p.guide_contrast` = 3:1（Geist · Grid）
- 参数：最多嵌套层数 `p.max_nesting` = 1 个（Geist · Grid）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-grid--grid-guides

## 基础 / 间距（SPACING）

间距只取间距阶梯（0.25rem 的整数倍）；组内、组间、区块、章节各用一段阶梯。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-spacing--overview

### SPACING.SCALE 间距阶梯

间距只用间距阶梯（Tailwind 的 --spacing 基数 0.25rem 的整数倍），不写任意值。

- 执行：机器门禁 `style.spacing-scale`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：间距基数 --spacing `p.base` = 0.25rem（Tailwind CSS · 间距（--spacing 基数））
- 对照表「常用档位」（类名 · 像素 → 用途）：
  - `gap-1 · 4px`：图标与 12 号文字
  - `gap-2 · 8px`：组内元素、图标与 14 号文字
  - `gap-4 · 16px`：组内较松的排布
  - `gap-6 · 24px`：组与组之间
  - `gap-8 · 32px`：组与组之间、区块转折
  - `gap-12 · 48px`：大区块转折
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 示例（别这样做）：任意值
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-spacing--spacing-scale

### SPACING.TIERS 间距分档

按元素之间的关系选档：组内元素用第 2 到 4 档，组与组之间用第 6 到 8 档，大区块转折用第 8 到 12 档；第 16 档只用于真正的章节分隔，不作为页面默认间距。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：组内档位 `p.within_group` = 2 个 / 4 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：组间档位 `p.between_groups` = 6 个 / 8 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：区块档位 `p.sections` = 8 个 / 12 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 参数：章节档位 `p.chapter` = 16 个（Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性））
- 示例（这样做）：组内 gap-2，组间 gap-6
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-spacing--spacing-tiers

## 基础 / 动效（MOTION）

默认静止；动效只用来解释状态变化、保持连续、确认操作；时长取过渡默认值；尊重减少动效设置。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-motion--overview

### MOTION.PURPOSE 动效要有理由

界面默认静止。动效只用于三件事：解释状态变化、保持视觉连续、确认一个操作。不用跑马灯、打字光标、脉冲指示、弹跳、视差和滚动出现效果。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-motion--motion-purpose

### MOTION.DURATION 时长与缓动

颜色、边框这类状态过渡用过渡工具类的默认时长与缓动；提示气泡、卡片浮层保留约 150ms 的出现延迟，避免鼠标扫过时闪烁。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：默认过渡时长 `p.duration` = 150ms（Tailwind CSS · 过渡（默认时长与缓动））
- 参数：默认缓动 `p.easing` = cubic-bezier(0.4, 0, 0.2, 1)（Tailwind CSS · 过渡（默认时长与缓动））
- 参数：提示出现延迟 `p.hover_delay` = 150ms（Geist · Tooltip）
- 对照表「过渡」（时长 → 用途）：
  - `150ms`：颜色、边框、背景的状态过渡
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-motion--motion-duration

### MOTION.REDUCED 减少动效

用户开启「减少动效」时，关闭或降级动画、滚动和过渡；用 Tailwind 的 motion-safe / motion-reduce 变体写动效。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级」
- 示例（这样做）：只在允许动效时转动
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-motion--motion-reduced

## 组件/通用 / 按钮（CMP.BUTTON）

触发一个会改变状态的动作（部署、保存、删除）；改地址的跳转用链接按钮；一行有多个相关动作时用菜单或分裂按钮。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--overview
对应组件：antd Button；geist Button、ButtonLink
实验场：`Button`，属性 variant=default|secondary|tertiary|error|warning，size=tiny|small|medium|large，shape=square|rounded，loading=布尔，disabled=布尔（https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--playground）

### CMP.BUTTON.USAGE 何时用

按钮用于改变状态的动作（部署、保存、删除）；改变地址的导航用链接按钮。一行里有不止一个相关动作时，换成菜单或分裂按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：一个主操作配一个次要操作
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-usage

### CMP.BUTTON.VARIANTS 变体

五种变体：default 是主操作；secondary 是辅助操作；tertiary 用于最次要的操作；error 用于破坏性的确认；warning 用于需要留意后果的操作。没有 primary、success、ghost 这类变体。

- 执行：机器门禁 `markup.single-primary-button`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：variant 取值 `p.variants` = default / secondary / tertiary / error / warning（Geist · Button）
- 对照表「五种变体」（variant → 用途）：
  - `default`：主操作，一个操作区一个
  - `secondary`：辅助操作
  - `tertiary`：最次要的操作
  - `error`：破坏性的确认
  - `warning`：需要留意后果的操作
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-variants

### CMP.BUTTON.DANGER 危险操作

破坏性的确认用 error 变体，文案是「动词 + 对象」，并且和完成后的提示一一对应：按钮「删除项目」，提示「项目已删除」。高风险操作（删除生产资源、吊销密钥）要求输入资源名确认。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：动词加对象
- 示例（别这样做）：只有一个「删除」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-danger

### CMP.BUTTON.SIZES 尺寸

四种尺寸：tiny、small、medium（默认）、large。同一个操作区尺寸一致；tiny 只用于放在输入框里的小按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：高度 `p.heights` = 24px / 32px / 40px / 48px（pomaster 预设约定（Geist 体系））
- 对照表「四种尺寸」（size → 用途）：
  - `tiny`：输入框里的小按钮
  - `small`：表格行、卡片角落
  - `medium`：默认
  - `large`：营销页、单列页面的主操作
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-sizes

### CMP.BUTTON.SHAPES 形状

默认是圆角矩形；纯图标按钮可以是方形或圆形；胶囊形（rounded）配阴影，只用于营销页。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：形状
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-shapes

### CMP.BUTTON.ICONS 搭配图标

图标通过前缀、后缀放进按钮：前缀图标表达动作本身，后缀图标表达去向（箭头、外链）。同一个按钮区要么都带图标，要么都不带。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：前缀与后缀
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-icons

### CMP.BUTTON.ICON_ONLY 纯图标按钮

纯图标按钮设 svgOnly，并且必须带 aria-label；名称写动作和对象（「复制部署地址」），不写图标名。

- 执行：机器门禁 `markup.icon-button-label`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 图标按钮缺少 aria-label 或等效可访问名称。」
- 示例（这样做）：有名称
- 示例（别这样做）：读屏只能读出「按钮」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-icon-only

### CMP.BUTTON.LOADING 加载

进行中的操作用按钮自身的 loading，按钮保持可聚焦并向读屏报告忙碌状态；不要把按钮换成一个单独的转圈图标。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：加载状态
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-loading

### CMP.BUTTON.DISABLED 禁用

只有动作此刻做不了（缺少输入、权限不够）才禁用，并配文字提示说明原因。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：禁用的五种变体
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-disabled

### CMP.BUTTON.LINK 链接按钮

改变地址的导航用链接按钮（与按钮同样的属性，渲染成链接）；不用按钮的点击事件去跳转。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：链接按钮
- 示例（别这样做）：点击事件里跳转
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-link

### CMP.BUTTON.WIDTH 宽度

按钮宽度由文字决定；需要固定宽度时设宽度，单列表单的主操作可以占满整行。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：占满整行
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-width

### CMP.BUTTON.SUBMIT 表单提交

表单的提交按钮设 type="submit"，回车即可提交；一个表单一个提交按钮。项目里的按钮用 variant 选变体（对应 Geist 文档里的 type 属性），原生 type 照常写。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：提交按钮
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-submit

### CMP.BUTTON.LABEL 文案

文案说清会发生什么：「部署项目」「邀请成员」「轮换密钥」；不用光秃秃的「提交」，也不用「确定」「好的」这类泛泛的确认。切换方式的按钮加「改用」：「改用恢复码」。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：说清会发生什么
- 示例（别这样做）：泛泛的「确定」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-components-general-button--cmp-button-label

## 工程规范 / 状态管理（STATE）

每份状态先定属主再定存放处：服务端数据进 TanStack Query，跨页稳定状态进 Zustand，可分享的视图状态进 URL，表单用表单模型。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--overview

### STATE.OWNERSHIP 状态放哪

每份状态都说清楚：谁拥有、谁能改、放在哪、活多久、什么时候清理。组件自己的状态用 useState / useReducer 留在组件里；接口数据进查询缓存；跨页稳定的状态进全局 store；可分享的视图状态进 URL；表单进表单模型。

- 执行：人工评审；适用：管理侧与用户侧
- 对照表「这份状态放哪」（状态 → 用途）：
  - `接口返回的数据`：@tanstack/react-query 查询缓存
  - `跨页、少变（当前用户、团队、偏好）`：Zustand 全局 store
  - `可分享的筛选、页码、标签页`：URL 查询参数
  - `正在编辑的表单`：表单模型
  - `组件内的临时状态（展开、悬停）`：组件局部状态
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「每个状态声明 owner、更新者、存储位置、生命周期和清理策略。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 将组件状态放入全局 store。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--state-ownership

### STATE.SERVER_STATE 服务端数据

从接口来的数据由 @tanstack/react-query 管理（缓存 key、过期、重新获取、失效都在这一层），组件直接从查询读；不把接口数据复制进全局 store 再手动同步。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：查询缓存库 `p.query_library` = @tanstack/react-query（项目选型决策（Owner 2026-11-06：服务端数据用 TanStack Query，全局 store Vue 用 Pinia、React 用 Zustand））
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「server state 由查询缓存层管理。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 复制 server state 到全局 store 手动同步。」
- 示例（这样做）：组件从查询读
- 示例（别这样做）：拉回来塞进全局 store
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--state-server-state

### STATE.GLOBAL_STORE 全局 store

全局 store 用 Zustand，只放跨页面且稳定的状态（当前用户、团队、偏好设置）；每个 store 一个文件，文件头写明属主；组件用选择器只订阅自己用到的字段。

- 执行：机器门禁 `state.store-library`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 参数：全局状态库 `p.library` = Zustand（项目选型决策（Owner 2026-11-06：服务端数据用 TanStack Query，全局 store Vue 用 Pinia、React 用 Zustand））
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「全局 store 只保存稳定跨页面状态。」
- 示例（这样做）：用选择器订阅
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--state-global-store

### STATE.URL URL 状态

列表的筛选条件、页码、排序、当前标签页这类可分享、刷新后要恢复的状态放进 URL 查询参数；敏感信息和没提交的表单不进 URL。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.url-filters`：实验：筛选条件进 URL——改筛选和页码，地址栏跟着变；点「刷新页面」，视图从 URL 原样恢复。
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可分享和可恢复状态进入 URL。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 将敏感或未提交表单写入 URL。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--state-url

### STATE.REQUESTS 请求入口

组件不直接调用 fetch，一律经生成的接口客户端（类型与 OpenAPI 同源）和查询；展示组件不请求接口、不改路由、不改全局状态，数据从属性传入。

- 执行：机器门禁 `state.no-direct-request`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 让展示组件偷偷请求接口、改路由或全局状态。」
- 示例（别这样做）：组件里直接 fetch
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--state-requests

### STATE.CACHE_KEYS 缓存 key 与失效

查询 key 包含所有影响结果的筛选条件和上下文（团队、数据范围）；每个写操作声明它会让哪些查询失效，成功后 invalidateQueries；切换团队或身份时清掉可能越权的缓存。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.query-cache`：实验：查询缓存与失效——切换筛选看缓存命中；点「新建一条」后，对应的 key 失效并重新拉取。
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「Query Key 包含所有影响结果的筛选和上下文。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「写操作定义依赖失效矩阵。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--state-cache-keys

### STATE.CLEANUP 清理与竞态

订阅、计时器、请求在组件卸载和身份切换时清理（useEffect 返回清理函数，请求带 AbortSignal）；已取消的请求和旧身份下的迟到结果不得写入当前状态。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.race`：实验：迟到的响应不写回——快速输入会发出多个请求，响应乱序到达；只有最新一次的结果写进列表。打开「错误做法」看旧结果覆盖新结果。
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 让已取消请求、旧订阅或旧身份上下文的迟到结果继续写入当前状态。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--state-cleanup

### STATE.FORM_MODEL 表单模型

表单用独立的表单模型和类型化的校验 schema，不直接绑定接口返回的 DTO；区分初始值、当前值、是否改过、错误和提交中。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：表单库 `p.form_library`：待项目决定——表单模型用哪个库？（候选 react-hook-form + zod / TanStack Form）
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「使用独立 FormModel 和 typed schema。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「MUST NOT 直接绑定 DTO。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--state-form-model

### STATE.BROWSER_STORAGE 浏览器存储

存进浏览器（localStorage、IndexedDB）的每一项都登记用途、隔离 key（按用户、团队）、版本、大小、过期时间和清理时机；读回来先校验版本和身份；脚本可读的存储里不放会话标识、刷新令牌等凭据。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可被脚本读取的存储不得持久化 session identifier、refresh token、secret 或等价凭据」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-state--state-browser-storage

## 待补的领域（117 个）

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
- 设计模式/全局规则 / 反馈（`feedback`，前缀 FEEDBACK）：按重要程度选提示方式；失败留得住、给出路；加载、字段错误、空状态、部分成功与徽标。
- 设计模式/全局规则 / 导航（`navigation`，前缀 NAV）：主导航、顶部导航、面包屑、标签页、步骤条与分页的选型和上限。
- 设计模式/全局规则 / 数据录入（`data_entry`，前缀 ENTRY）：标签常驻、按选项数选控件、开关即时生效、提示放对位置、校验分工、上传方式。
- 设计模式/全局规则 / 数据展示（`data_display`，前缀 DISPLAY）：表格列、卡片排布、折叠、时间轴、轮播，以及超长和空数据。
- 设计模式/全局规则 / 数据格式（`data_format`，前缀 FORMAT）：数字、金额、日期时间、相对时间与脱敏的固定格式。
- 设计模式/全局规则 / 文案（`copywriting`，前缀 COPY）：文案走字典；站在用户这边写；语气平和；报错说清怎么办；标点与用词统一。
- 设计模式/全局规则 / 按钮（`buttons`，前缀 BUTTON）：按用途选按钮类型；一个按钮区一个主按钮；顺序、位置、文案与分组。
- 设计模式/全局规则 / 数据列表（`data_list`，前缀 LIST）：列表形态、查询方式、分页与位置、详情入口、批量操作、新建与删除。
- 设计模式/原则 / 亲密性（`proximity`，前缀 PROXIMITY）：用间距远近表达分组。
- 设计模式/原则 / 对齐（`alignment`，前缀 ALIGN）：文字、表单标签与数字的对齐方式。
- 设计模式/原则 / 对比（`contrast`，前缀 CONTRAST）：主次分明；状态不只靠颜色。
- 设计模式/原则 / 重复（`repetition`，前缀 REPEAT）：同类元素全系统一致。
- 设计模式/原则 / 直截了当（`direct`，前缀 DIRECT）：在哪看就在哪改；拖拽有替代方式。
- 设计模式/原则 / 足不出户（`stay`，前缀 STAY）：能在当前页完成的不跳页。
- 设计模式/原则 / 简化交互（`lightweight`，前缀 LIGHT）：工具按重要程度常驻；可点区域做大。
- 设计模式/原则 / 提供邀请（`invitation`，前缀 INVITE）：不易发现的交互要有邀请。
- 设计模式/原则 / 巧用过渡（`transition`，前缀 TRANSITION）：用过渡说明发生了什么。
- 设计模式/原则 / 即时反应（`reaction`，前缀 REACT）：输入时即时反应。
- 设计模式/模板文档 / 数据可视化页（`visualization_page`，前缀 VIZ）：先定页面类型；版面布局；选对图表、讲清口径。
- 设计模式/模板文档 / 详情页（`detail_page`，前缀 DETAIL）：按复杂度选布局；信息平铺；分隔方式对应层级；流程操作放页脚。
- 工程规范 / 性能（`performance`，前缀 PERF）：先定预算；按需加载；大列表分页与虚拟化；输入防抖；并行初始化；渲染里不做重计算；度量分清口径。

## 出处

- `SRC.GEIST.HOME` Vercel Geist 设计体系：https://vercel.com/geist/introduction（核实 2026-11-06）
- `SRC.GEIST.COLORS` Geist · Colors（色阶、档位用途、gray 与 gray-alpha 的取舍）：https://vercel.com/geist/colors（核实 2026-11-06）
- `SRC.VERCEL.BRAND_CSS` Vercel 品牌样式表（派生自 GeistCN 源码，含 Geist 色阶色值）：https://vercel.com/geist/vercel-brand.css（核实 2026-11-06）
- `SRC.GEIST.TYPOGRAPHY` Geist · Typography：https://vercel.com/geist/typography（核实 2026-11-06）
- `SRC.GEIST.MATERIALS` Geist · Materials：https://vercel.com/geist/materials（核实 2026-11-06）
- `SRC.GEIST.GRID` Geist · Grid：https://vercel.com/geist/grid（核实 2026-11-06）
- `SRC.GEIST.BUTTON` Geist · Button：https://vercel.com/geist/button（核实 2026-11-06）
- `SRC.GEIST.PIE_GAUGE` Geist · Pie Gauge（行内图标尺寸）：https://vercel.com/geist/pie-gauge（核实 2026-11-06）
- `SRC.GEIST.EMPTY_STATE` Geist · Empty State：https://vercel.com/geist/empty-state（核实 2026-11-06）
- `SRC.GEIST.MIDDLE_TRUNCATE` Geist · MiddleTruncate：https://vercel.com/geist/middle-truncate（核实 2026-11-06）
- `SRC.GEIST.TABLE` Geist · Table：https://vercel.com/geist/table（核实 2026-11-06）
- `SRC.GEIST.TOOLTIP` Geist · Tooltip：https://vercel.com/geist/tooltip（核实 2026-11-06）
- `SRC.GEIST.SEPARATOR` Geist · Separator：https://vercel.com/geist/separator（核实 2026-11-06）
- `SRC.VERCEL.DESIGN_MD` Vercel design.md（官方设计技能文档：栅格、间距角色、字体、色彩、动效、可访问性）：https://vercel.com/design.md（核实 2026-11-02）
- `SRC.SHADCN.THEMING` shadcn/ui · Theming：https://ui.shadcn.com/docs/theming（核实 2026-11-02）
- `SRC.TAILWIND.SPACING` Tailwind CSS · 间距（--spacing 基数）：https://tailwindcss.com/docs/customizing-spacing（核实 2026-11-02）
- `SRC.TAILWIND.BREAKPOINTS` Tailwind CSS · 响应式断点：https://tailwindcss.com/docs/responsive-design（核实 2026-11-06）
- `SRC.TAILWIND.TRANSITIONS` Tailwind CSS · 过渡（默认时长与缓动）：https://tailwindcss.com/docs/transition-property（核实 2026-11-06）
- `SRC.LUCIDE` lucide-react（线框图标，默认描边 2）：https://lucide.dev/guide/（核实 2026-11-06）
- `SRC.TANSTACK.QUERY` TanStack Query：https://tanstack.com/query/latest（核实 2026-11-06）
- `SRC.ZUSTAND` Zustand：https://zustand.docs.pmnd.rs/（核实 2026-11-06）
- `SRC.POMASTER.STACK_DECISION` 项目选型决策（Owner 2026-11-06：服务端数据用 TanStack Query，全局 store Vue 用 Pinia、React 用 Zustand）：repo:docs/design-standard.md（核实 2026-11-06）
- `SRC.POMASTER.UI_SPEC` pomaster 主题硬规范 · UI 呈现与设计：repo:packages/cli/seeds/specs/hard/themes/ui-presentation-and-design.md（核实 2026-11-02）
- `SRC.POMASTER.PRESET` pomaster 预设约定（Geist 体系）：repo:packages/cli/seeds/design-standards/geist.yaml（核实 2026-11-06）
