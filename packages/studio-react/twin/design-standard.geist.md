# 前端设计规范（Vercel Geist，shadcn/ui + Tailwind CSS 4）

> Storybook「规范」分区的 AI 可读孪生，由 packages/studio-react/scripts/lib/standard.mjs 生成，与页面同源。不要手改。
> 规范指纹 `sha256:3d66e865fb3f39a37d47a7678a9ae1e90f96e9ff0d1318e7eb855df05f070484`；状态 origin=preset。
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

## 基础 / 圆角管理（RADIUS）

圆角只取规范的档位；每类组件用哪一档有对照表；同一组件的尺寸越大圆角越大但有上限；嵌套时内层 = 外层 − 内边距；贴边与相接的那侧没有圆角；整圆只给短小的元素；媒体随容器裁切。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-radius--overview

### RADIUS.TOKENS 只用规范的圆角档

圆角值只取 MATERIAL.RADIUS 的三档（6 / 12 / 16，对应 rounded-md / rounded-xl / rounded-2xl），外加整圆 rounded-full；不写 rounded-[10px] 这类任意值，不在组件外层再套一层不同的圆角。

- 执行：机器门禁 `style.radius-token`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 示例（这样做）：用档位类
- 示例（别这样做）：任意值
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-radius--radius-tokens

### RADIUS.BY_COMPONENT 组件与圆角对照

每类组件用哪一档圆角按对照表执行，新组件先归到表里的一类再取值；同一页面上同类组件的圆角一致。

- 执行：人工评审；适用：管理侧与用户侧
- 对照表「组件用哪一档圆角」（组件 → 用途）：
  - `按钮、输入框、选择器、提示气泡（rounded-md）`：6px
  - `卡片、菜单、对话框（rounded-xl）`：12px
  - `全屏层（rounded-2xl）`：16px
  - `头像、徽标、开关、进度条（rounded-full）`：整圆
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-radius--radius-by-component

### RADIUS.SIZE_SCALE 尺寸越大圆角越大，但有上限

控件统一用 6px，不随尺寸变化；容器按层级取 12px 或 16px，不超过 16px；不按像素尺寸按比例算圆角。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-radius--radius-size-scale

### RADIUS.NESTED 嵌套时内层 = 外层 − 内边距

圆角容器里再放圆角元素时，内层圆角 = 外层圆角 − 两者之间的内边距（不小于 0），这样角落同心；内层直接贴边（没有内边距）时由外层裁切（overflow: hidden），内层不再单写圆角。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：内层减去内边距
- 示例（别这样做）：内外同样的圆角
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-radius--radius-nested

### RADIUS.FLUSH 贴边与相接的那侧没有圆角

元素贴着容器边缘时，贴边那一侧不要圆角（卡片顶部的封面图只保留上面两个角，表格贴满卡片时由卡片裁切）；按钮组、输入框与前后缀相接处圆角为 0，只保留整组外侧的圆角（first:rounded-l-md last:rounded-r-md，中间 rounded-none）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-radius--radius-flush

### RADIUS.PILL 整圆只给短小的元素

整圆（胶囊、圆形）只用于徽标、计数、标签型状态、开关、进度条和头像；按钮、输入框不做胶囊，除非整个产品在主题里统一改；圆形图标按钮宽高相等。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-radius--radius-pill

### RADIUS.MEDIA 媒体随容器裁切

图片、视频、地图、图表在圆角容器里由容器裁切，不各自再加圆角；单独出现的缩略图用控件那一档；头像用整圆；用户上传的图片不加阴影、描边之外的装饰。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-radius--radius-media

## 基础 / 投影（ELEV）

投影只表达离页面多远：四个层级各一个阴影 token；页面内的区块用边框不用阴影；不手写阴影、不做发光；悬停最多升一级；阴影层级与叠放层级同序；深色主题改用更亮的表面；吸顶与固定列的阴影只在滚动后出现。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-elevation--overview

### ELEV.LEVELS 四个层级各一个阴影

层级固定为四层：0 层贴在页面上；1 层是悬停抬起与吸顶后的元素；2 层是下拉、气泡、悬浮按钮；3 层是对话框、抽屉、通知。每层只有一个阴影 token，组件按所在层级取用（方向规则见 MATERIAL.SHADOWS）。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：层级阴影 `p.values`：待项目决定——四个层级的阴影各取什么值？（Geist 未公开，与 MATERIAL.SHADOWS 同一决策）
- 对照表「四个层级」（层级 → 用途）：
  - `第 0 层：贴在页面上（区块、表格、未悬停的卡片）`：无阴影，用边框或底色区分
  - `第 1 层：可点卡片悬停、吸顶表头滚动后`：shadow-sm（近似，值待定）
  - `第 2 层：菜单、提示气泡、悬浮按钮`：shadow-md（近似，值待定）
  - `第 3 层：对话框、抽屉、通知`：shadow-lg（近似，值待定）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-elevation--elev-levels

### ELEV.FLAT_FIRST 页面内的区块用边框不用阴影

页面里的区块、表格、表单分组用边框或底色区分，不用阴影；阴影只给浮在页面上、或者正在被拖动的东西；同一个元素不同时用粗边框和大阴影。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-elevation--elev-flat-first

### ELEV.ONE_TOKEN 不手写阴影、不做发光

阴影只取规范定下的层级类，不写 shadow-[…] 任意值；不做彩色、发光、内阴影装饰；阴影保持半透明，和底色融在一起。

- 执行：机器门禁 `style.shadow-token`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 写孤立色值、魔法间距和临时阴影。」
- 示例（别这样做）：彩色发光阴影
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-elevation--elev-one-token

### ELEV.HOVER 悬停最多升一级

可点的卡片悬停时从 0 层升到 1 层（见 HOVER.SUBTLE），不跳到 2、3 层；浮层本身悬停不再变化；拖动中的元素升到 2 层，放下后回到原层。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-elevation--elev-hover

### ELEV.Z_PAIR 阴影层级与叠放层级同序

阴影层级和叠放层级（z-index，见 LAYOUT.Z_INDEX）同序：叠放在下面的元素不能有更重的阴影；同一层的两个浮层互相覆盖时，后出现的在上面。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-elevation--elev-z-pair

### ELEV.DARK 深色主题改用更亮的表面

深色背景上阴影几乎看不见，深色主题里层级改用更亮一档的表面色加细边框表达；阴影 token 随主题切换，组件不判断当前主题。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「表格、图表、弹层、焦点和状态随主题同步。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-elevation--elev-dark

### ELEV.STICKY 吸顶与固定列的阴影只在滚动后出现

吸顶的表头、工具栏和固定列，只有在内容滚到它下面时才显示分隔阴影或边框，静止时不显示（用滚动位置或 IntersectionObserver 切换一个类）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-elevation--elev-sticky

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

## 基础 / 点击反馈（PRESS）

每个可点的元素都有默认、悬停、按下、聚焦与禁用；按下的瞬间就有反馈，颜色加深一档、不移动不变尺寸；波纹只用组件库自带的；时长取快档；触屏去掉点击延迟、目标够大；键盘触发同样的反馈；禁用与加载中不响应；减少动效时只保留颜色变化。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-press-feedback--overview

### PRESS.STATES 可点的元素都有五态

每个可点的元素都设计默认、悬停、按下、聚焦、禁用五态；按下态在按下的瞬间出现，不等请求返回；松开后回到悬停态。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：按下态——按住按钮看按下态；松开回到悬停态。
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「hover、active、focus、disabled、loading、empty、error 状态完整。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-press-feedback--press-states

### PRESS.VISUAL 按下时颜色加深一档

按下时背景比悬停再深一档（如 hover:bg-ds-gray-100 → active:bg-ds-gray-200）；不移动位置、不改尺寸、不改边框宽度；按钮是否加轻微缩小由项目统一决定。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：按下缩放 `p.scale`：待项目决定——按钮按下时是否缩小？（候选 不缩小 / scale(0.98)）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-press-feedback--press-visual

### PRESS.WAVE 波纹只用组件库自带的

Geist 不用点击波纹；按钮、列表行、卡片的按下都用背景色变化表示，不引入 ripple 一类效果。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-press-feedback--press-wave

### PRESS.TIMING 按下即时、回弹取快档

按下态即时出现（不加过渡延迟），松开回弹用快档时长；点击动画不长于 200ms，也不阻塞下一次点击。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：回弹时长 `p.release` = 150ms（Tailwind CSS · 过渡（默认时长与缓动））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-press-feedback--press-timing

### PRESS.TOUCH 触屏：无延迟、目标够大

可点元素设 touch-action: manipulation 去掉双击缩放带来的点击延迟；去掉系统的灰色点按高亮时必须提供自己的按下态；点击目标至少 24×24 CSS px（建议 44×44），相邻目标之间留出间距。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：最小点击目标 `p.target_min` = 24px（pomaster 主题硬规范 · UI 呈现与设计）
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「触控目标尺寸至少 24×24 CSS px，且目标之间提供足够间距（WCAG 2.5.8）；建议达到 44×44（AAA）。」
- 示例（这样做）：触屏点按
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-press-feedback--press-touch

### PRESS.KEYBOARD 键盘触发同样的反馈

可点元素用真正的 button / a 元素，空格与回车能触发并显示按下态；用 div 模拟按钮时要补上 role、tabindex 和键盘处理，否则不算可点。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-press-feedback--press-keyboard

### PRESS.DISABLED 禁用与加载中不响应

禁用和加载中的元素没有悬停、按下效果，点击不触发任何反馈动画；禁用的光标为 not-allowed；加载中的按钮保持宽度不变（见 CMP.BUTTON.LOADING）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-press-feedback--press-disabled

### PRESS.REDUCED 减少动效时只保留颜色变化

减少动效模式下去掉缩放与波纹，保留按下时的颜色变化；状态仍然看得出来。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-press-feedback--press-reduced

## 基础 / 焦点环（FOCUS）

焦点只在键盘聚焦时显示且永远不去掉；全站一种焦点样式；与相邻颜色有足够对比；不被裁切、不被吸顶栏遮住；焦点顺序与视觉顺序一致，弹层进出时焦点有去处；焦点环跟随元素圆角。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-focus-ring--overview

### FOCUS.VISIBLE 键盘聚焦时显示，永远不去掉

焦点样式写在 :focus-visible 上（鼠标点击不出现，键盘聚焦一定出现）；不写 outline: none 而不给同等可见的替代。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：用 Tab 键依次聚焦——点击不出焦点环，按 Tab 才出；自定义元素与组件同一种样式。
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 移除焦点轮廓而无同等级可见替代。」
- 示例（别这样做）：去掉焦点不给替代
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-focus-ring--focus-visible

### FOCUS.STYLE 全站一种焦点样式

全站一种焦点样式：2px 蓝色轮廓（ds-blue-700）、外偏移 2px（与 Button 组件一致），写成共享的类，自己写的可点元素都用它。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：轮廓宽度 `p.width` = 2px（pomaster 预设约定（Geist 体系））
- 参数：轮廓偏移 `p.offset` = 2px（pomaster 预设约定（Geist 体系））
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「SHOULD 提供统一、设计系统级别的 focus indicator token（颜色、宽度、offset、:focus-visible）。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-focus-ring--focus-style

### FOCUS.CONTRAST 与相邻颜色对比足够

焦点指示与相邻背景的对比度至少 3:1；在深色、彩色背景上换用能看清的颜色，不靠颜色变化本身表示焦点。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源；文本对比度至少 4.5:1，大文本至少 3:1，UI 组件/图标边界至少 3:1（WCAG 1.4.1 / 1.4.3 / 1.4.11）。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-focus-ring--focus-contrast

### FOCUS.NOT_OBSCURED 不被裁切、不被遮住

overflow: hidden 的容器里改用内收的轮廓（负偏移或 inset 阴影），避免焦点环被裁掉；吸顶栏、固定底栏不能盖住获得焦点的元素（给滚动容器设 scroll-padding）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「焦点必须可见，且不得被吸顶栏、浮层、sticky 元素完全遮挡（WCAG 2.4.7 / 2.4.11）。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-focus-ring--focus-not-obscured

### FOCUS.ORDER 焦点顺序与去处

Tab 顺序与视觉顺序一致，不用正数 tabindex；弹层、抽屉、对话框打开时焦点进入，关闭后回到触发它的元素；只有模态层把焦点困在里面。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「弹层、抽屉、对话框打开后必须接管焦点，关闭后返回触发元素；背景不得保持可 Tab（WCAG 2.4.3 / 2.1.2）。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-focus-ring--focus-order

### FOCUS.RADIUS 焦点环跟随元素圆角

焦点轮廓的圆角与元素一致（outline 会跟随 border-radius；用 box-shadow 画焦点时同样带圆角）；圆形按钮的焦点环也是圆的。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-foundations-focus-ring--focus-radius

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

## 设计模式/体验管理 / 界面静帧（STILL）

文档、功能卡片、空状态与引导里的产品静帧：像真产品、只给故事主角真实文字、裁切有意图、一个焦点、按展示尺寸设计、动画先定封面帧、用规范组件与图标。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-ui-stills--overview

### STILL.WHEN 什么时候用静帧

要在文档配图、功能介绍卡片、空状态或新手引导里说明「产品长什么样、这里会发生什么」时，用规范组件搭一张产品静帧，不贴真实截图：截图很快过期、带着真实数据、换主题就不对。一张静帧只讲一件事。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：组件搭出来的功能卡片
- 示例（别这样做）：贴一张产品截图
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-ui-stills--still-when

### STILL.RESTRAINT 只给故事主角真实文字

一张静帧里真实的字通常只有 3 到 7 处：标题、被操作的对象、输入的内容和结果；其余位置用占位条，占位条的宽度逐行变化。不要每行都塞真实文本和数字——细节越多越像拼凑的假图；视线落点上不放占位条。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：真实文字处数 `p.real_strings` = 3–7（Stageshow（Benji Taylor 的 agent skill，MIT））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-ui-stills--still-restraint

### STILL.FRAMING 裁切与出血

裁到故事发生的那块区域，窗口从画面的一边或两边出血；窗口保持原本的比例，不压扁、不整体缩小塞进卡片再四周留等宽空白；页面本身已有底色时不再垫一块底板；画面里不留空着的角落。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-ui-stills--still-framing

### STILL.FOCAL 一个焦点

每张静帧只有一个主角，最重的视觉（实色、字重、阴影）落在它身上；辅助对象（一张回执、一个小卡片）至多一个，压在主体边缘；不用描边光晕去「指」主角，用产品自己的选中态。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-ui-stills--still-focal

### STILL.SCALE 按展示尺寸设计

按最终显示尺寸 1:1 设计：功能卡片约 400×300，侧栏插图更小；手机宽度的版本重新排布，只留动作和可读的字，不是整体缩小——缩小后的小字没人看得清。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：功能卡片尺寸 `p.card` = 400×300（Stageshow（Benji Taylor 的 agent skill，MIT））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-ui-stills--still-scale

### STILL.POSTER 动画先定封面帧

静帧做成小动画时，先定封面帧：缩略图、截图和减少动效模式都只看到这一帧，它要能单独讲完故事——结果留在画面上，不是变化途中的一帧；动画只演一件事，回到开头时要有看得见的原因（撤销、关闭）或在被遮住时复位。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-ui-stills--still-poster

### STILL.REAL_PARTS 用规范组件与图标

静帧里的按钮、徽标、头像、输入框都用 src/components/ui 的组件，不手画；图标只用 lucide-react，同一尺寸、同一描边；不发明 logo（色块里放一个字母不是 logo）；AI 功能不用闪光、魔杖和紫色当装饰，直接展示它做了什么。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-ui-stills--still-real-parts

## 设计模式/体验管理 / 组件动效（CMOTION）

动效只说明变化：每个动作有原因；出现和离开都有过渡；动关系而不只动对象；数字与文字就地变化；成组只在首次出现时错峰；可以打断；只动 transform 与透明度；减少动效时状态变化仍看得见。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-component-motion--overview

### CMOTION.CAUSE 每个动作有原因

动效由用户操作或数据变化触发，用来说明「刚才发生了什么」；不做自动循环的吸睛动画（呼吸灯、无限脉冲）；同一屏同一时刻只有一处在动。界面反馈和真实产品一样快，只有讲故事的演示动画才放慢。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：无限脉冲吸引注意
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-component-motion--cmotion-cause

### CMOTION.ENTER_EXIT 出现与离开

会出现又消失的元素保持挂载，用状态切换显隐，让离开也有过渡；离开比出现快；面板打开时带着内容一起出现，不先出一块空白再填内容；不要「啪」地插入或消失。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：出现 `p.enter` = 200ms（pomaster 预设约定（Geist 体系））
- 参数：离开 `p.exit` = 150ms（Tailwind CSS · 过渡（默认时长与缓动））
- 参数：缓动 `p.ease` = cubic-bezier(0.4, 0, 0.2, 1)（Tailwind CSS · 过渡（默认时长与缓动））
- 演示：展开与收起：同一个按钮、内容一起出现——点按钮：面板高度与透明度一起过渡，收起比展开快；按钮文字在同一个按钮上变化。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-component-motion--cmotion-enter-exit

### CMOTION.RELATIONSHIP 动关系而不只动对象

新增一行时，下面的行一起让位（新行的高度从 0 展开），不是新行凭空出现、其余行跳位；删除时先收起占位再移除；尺寸变化的容器不拉伸里面的文字（用网格行或高度过渡，不用 scale）；列表重排用位置过渡。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：让位时长 `p.duration` = 200ms（pomaster 预设约定（Geist 体系））
- 参数：缓动 `p.ease` = cubic-bezier(0.4, 0, 0.2, 1)（Tailwind CSS · 过渡（默认时长与缓动））
- 演示：新增一行：其余行一起让位
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-component-motion--cmotion-relationship

### CMOTION.VALUE_CHANGE 数字与文字就地变化

数值变化用数字滚动：只滚变化的位，货币符号与千分位不动，用等宽数字，最终值停住；状态词变化（排队中→运行中→已通过）在同一位置滚动或淡入淡出，并按最长的词预留宽度，邻居不跳；按钮文字变化发生在同一个按钮上，不换成另一个按钮。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：数字滚动——点按钮：金额只滚动变化的数位（NumberTicker，收录自 affectUI，MIT）。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-component-motion--cmotion-value-change

### CMOTION.STAGGER 成组错峰只在首次出现

只有一组元素首次一起出现时才错峰：按阅读顺序、间隔小、总时长有上限；刷新数据、翻页、筛选时整组一次出现，不逐行飞入；栅格卡片首次进入视口时可以错峰一次。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：错峰间隔 `p.interval`：待项目决定——同组错峰间隔取多少毫秒？（候选 40ms / 60ms / 80ms）
- 参数：总时长上限 `p.total`：待项目决定——一组错峰的总时长上限取多少毫秒？（候选 300ms / 400ms）
- 示例（别这样做）：每次刷新逐行飞入
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-component-motion--cmotion-stagger

### CMOTION.INTERRUPT 可以打断

动画进行中用户再次操作，从当前状态反向或继续，不排队等上一段放完；动画期间控件保持可用；状态切换用 CSS transition（天然可打断），不用固定时长的关键帧动画表达状态。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-component-motion--cmotion-interrupt

### CMOTION.PERF 只动 transform 与透明度

过渡只作用于 transform 和 opacity，高度展开用 grid-template-rows 过渡；不过渡 width、height、top、left、margin 这类触发重排的属性；will-change 只在动画期间加在动的那个元素上，不全局铺。

- 执行：机器门禁 `motion.transform-only`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 示例（这样做）：位移与透明度
- 示例（别这样做）：过渡布局属性
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-component-motion--cmotion-perf

### CMOTION.REDUCED 减少动效时保留状态变化

减少动效模式下状态变化仍要看得见：淡入淡出或直接切换，去掉位移、缩放、视差和自动播放；数字滚动直接显示最终值；每段关键帧动画都写 prefers-reduced-motion 分支（全局降级见 MOTION.REDUCED）。

- 执行：机器门禁 `motion.reduced-motion`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「尊重 prefers-reduced-motion：动画、滚动、过渡在减少动效模式下关闭或降级」
- 示例（这样做）：关键帧动画的降级分支
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-component-motion--cmotion-reduced

## 设计模式/体验管理 / Bento 栅格（BENTO）

一组格子拼成一张图：一个主角格；格子不全是界面截图，邻格类型交替；同一套外框；跨度取栅格整数；数字格一行写完；窄屏重新排；可点的格整格可点。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-bento-grid--overview

### BENTO.WHEN 什么时候用

功能概览、首页看板入口、发布说明和特性墙用 Bento；表单、明细列表、需要逐项对比的数据不用 Bento，用表格、描述列表或卡片列表。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-bento-grid--bento-when

### BENTO.HERO 一个主角格

一格最大（跨两列或两行），放最主要的信息或画面，其余格支撑它；格子大小相同时，内容和分量要有明显差别，不排成五块一样重的卡片。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：主角格 + 数字格 + 组件格 + 一句话——主角格跨两列并整格可点；数字格一行写完；组件格只截一个控件；一句话格用正文大字。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-bento-grid--bento-hero

### BENTO.KINDS 邻格类型交替

界面格（只截一个组件或一小块界面，不放整个窗口）约占三分之一到一半，其余是大数字、一句话、对象、示意图或一组标志；相邻的格类型不同；窗口外框在一组栅格里至多出现一次；同一段真实文字不在两格里重复。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：界面格占比 `p.ui_share` = 1/3–1/2（Stageshow（Benji Taylor 的 agent skill，MIT））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-bento-grid--bento-kinds

### BENTO.FRAME 同一套外框

所有格的圆角、格间距、内边距、文案位置一致（文案都在上或都在下）；格间距等于格内边距或其整数分之一；一组栅格只选一种家族：带间距的圆角格，或无间距、用细分割线分格。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：格间距（gap-4） `p.gap` = 16px（Tailwind CSS · 间距（--spacing 基数））
- 参数：格圆角（rounded-xl） `p.radius` = 12px（Geist · Materials）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-bento-grid--bento-frame

### BENTO.SPANS 跨度取栅格整数

用 CSS grid 分格，列数取 12 列栅格的约数（常用 3 列，即每格 4/12），格子跨度是整数列（col-span-2）；行高用统一基准；不给格子手写像素宽度。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：手写像素宽度拼格子
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-bento-grid--bento-spans

### BENTO.STAT 数字格一行写完

数字格是一个大数字加一句短标签，数字和单位不换行（white-space: nowrap）；用真实数字，不用「10x」「无限」这类填充；数字紧跟标签或撑满格子，不要钉在高格底部、上面留一大片空。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-bento-grid--bento-stat

### BENTO.RESPONSIVE 窄屏重新排

每格都读得清时才保留两列；手机宽度变单列，主角格在最前；按内容决定断点，不整体等比缩小；窄格里的界面画面重新取景，而不是缩小。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-bento-grid--bento-responsive

### BENTO.CLICK 可点的格整格可点

一格对应一个去处时整格就是一个链接（a 或 button 包住整格），焦点环画在格上；格内不再放第二个去同一处的按钮；悬停反馈按卡片悬停的规则。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-bento-grid--bento-click

## 设计模式/体验管理 / 状态反馈（SFB）

每个数据视图都有完整的状态；反馈出现在动作发生的地方；确认的力度跟操作的分量走；乐观更新只用于可回滚的小操作；能撤销就不弹确认；长操作给进度；读屏能感知状态变化。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-state-feedback--overview

### SFB.STATES 每个视图都有完整状态

每个数据视图都设计并实现这些状态：加载中、空、出错、部分成功、正常，以及无权限和禁用；每种状态在 Storybook 里都能单独看到。空状态给下一步动作，出错给原因和恢复入口。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：同一个视图的五种状态——切换看每种状态：骨架保持内容的几何；空状态给动作；出错保留筛选并给重试；部分成功说清成功几条、失败的怎么办。
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「State Matrix：默认、加载、空、错误、权限、禁用、长文本和小屏等状态。」
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「hover、active、focus、disabled、loading、empty、error 状态完整。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-state-feedback--sfb-states

### SFB.IN_PLACE 反馈出现在动作发生的地方

按钮自己进入加载并在原位给出结果；字段错误挂在字段上；行内操作的结果出现在那一行；不把所有结果都弹到页面顶部，也不用一个轻提示处理所有错误。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「MUST NOT 用一个 Toast 处理所有错误。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-state-feedback--sfb-in-place

### SFB.WEIGHT 确认的力度跟操作的分量走

轻操作（收藏、切换显示）就地变化，不弹提示；普通保存用 Toast 轻提示；会影响他人或不可逆的操作用结果页或带操作的 Toast；失败比成功更显眼，并且停留到用户处理。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-state-feedback--sfb-weight

### SFB.OPTIMISTIC 乐观更新只用于可回滚的小操作

点赞、标星、拖动排序这类成功率高、可回滚、影响范围小的操作可以先改界面再发请求，失败时回滚并就地说明；金额、库存、审批、权限这类以服务端结果为准，等返回再更新。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：useMutation 的 onMutate / onError 回滚
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-state-feedback--sfb-optimistic

### SFB.UNDO 能撤销就不弹确认

可以撤销的删除、归档用「已删除 · 撤销」的提示代替二次确认；真正不可逆的操作才要确认，确认框说清后果（删掉什么、影响谁）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「删除、提交、转账等高风险动作必须提供复核、确认、撤销或等效防错」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-state-feedback--sfb-undo

### SFB.PROGRESS 长操作给进度

超过 1 秒的操作给加载反馈；预计超过 10 秒的给确定进度（百分比或步骤）和预计剩余时间，并允许离开当前页面：转为后台任务，完成后通知并能回到结果。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：需要加载反馈 `p.busy` = 1000ms（Nielsen Norman Group · Response Times: The 3 Important Limits）
- 参数：需要确定进度 `p.determinate` = 10000ms（Nielsen Norman Group · Response Times: The 3 Important Limits）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「长任务异步执行并可恢复。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-state-feedback--sfb-progress

### SFB.LIVE 读屏能感知状态变化

异步结果和进度变化写进 aria-live 区（一般用 polite，阻断性错误用 assertive），不抢焦点；颜色不是唯一的信号，状态都有文字。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「动态状态、异步结果、进度变化必须可在不抢夺焦点的前提下被辅助技术识别」
- 示例（这样做）：状态写进 live 区
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-state-feedback--sfb-live

## 设计模式/体验管理 / 上下文管理（CTX）

保住用户的位置（分页、筛选、滚动、选中）；未保存的内容有去处；就地操作与工具栏一致；当前位置始终可见；切换团队或身份时显式清理；代码里的上下文只放稳定的跨层依赖。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-context--overview

### CTX.PRESERVE 保住用户的位置

从列表进详情再返回，恢复原来的页码、筛选、排序、滚动位置和选中行（筛选与页码在 URL 里，滚动位置用路由的滚动恢复）；能在当前页完成的查看用侧边抽屉，不离开列表。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `context.restore`：实验：返回列表时恢复位置——翻到第 3 页、选中一行、打开详情再返回：正确做法回到原来的页和那一行；错误做法回到第 1 页。
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「返回恢复分页、筛选、排序和必要视图状态。」
- 示例（这样做）：路由层恢复滚动位置
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-context--ctx-preserve

### CTX.DRAFTS 未保存的内容有去处

表单有改动时离开要提示（页内跳转和关闭页签都拦）；长表单自动保存草稿，草稿按用户隔离、带版本与过期时间，提交成功后清掉；失败的提交保留用户的输入。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「dirty 离开、草稿隔离和版本冲突有策略。」
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「提交防重复并保留失败输入。」
- 示例（这样做）：离开前拦截
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-context--ctx-drafts

### CTX.INLINE_ACTIONS 就地操作与工具栏一致

行上的「更多」菜单、右键菜单里的操作与工具栏、详情页同名同图标；右键菜单只是快捷方式，不是唯一入口；批量操作出现在选中后的批量栏里，并显示选中了几条。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-context--ctx-inline-actions

### CTX.WAYFINDING 当前位置始终可见

页面标题、导航高亮、面包屑三者一致并与路由同源；每个可分享的视图有深链接，打开深链接得到同样的视图（含筛选与标签页）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「每个页面路由有稳定 name、path、page key、title、权限和布局 meta。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-context--ctx-wayfinding

### CTX.SCOPE_SWITCH 切换团队或身份时显式清理

团队、租户、环境的切换入口全局可见，当前作用域显示在顶部；切换后清掉旧作用域的查询缓存、草稿和订阅，回到新作用域下安全的页面，不把旧数据带到新作用域。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「用户、角色、组织和数据范围切换时清理风险缓存。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-context--ctx-scope-switch

### CTX.PROVIDER 代码里的上下文只放稳定的跨层依赖

React Context 只放跨多层、变化少的依赖（主题、当前团队、权限判断函数）；按关注点拆成多个 Context；Provider 的 value 用 useMemo 固定引用，避免整棵树重渲染；频繁变化的数据走 Zustand 选择器或查询缓存。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：固定 value 引用
- 示例（别这样做）：每次渲染新建 value
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-context--ctx-provider

## 设计模式/体验管理 / 侧边栏管理（SIDEBAR）

宽度取规范值；收起后只留图标并有名字；收起状态按用户记住；窄屏变抽屉；当前项与路由同源；最多两级；分组按使用频率；自己滚动、底部固定；键盘可操作。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-sidebar--overview

### SIDEBAR.WIDTH 宽度取规范值

侧边栏展开宽度 16rem、手机上的抽屉宽度 18rem（shadcn/ui Sidebar 的缺省值）；收起成图标栏的宽度由项目定；不按页面各自调宽度。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：展开宽度 `p.width` = 16rem（shadcn/ui · Sidebar）
- 参数：手机抽屉宽度 `p.mobile_width` = 18rem（shadcn/ui · Sidebar）
- 参数：收起宽度 `p.collapsed_width`：待项目决定——收起成图标栏时宽度取多少？（候选 3rem）
- 演示：收起与展开——点按钮收起：只留图标，每项有名字；当前项保持高亮。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-sidebar--sidebar-width

### SIDEBAR.COLLAPSE 收起与展开

收起后只留图标，每项有 title 或 tooltip 显示名字；收起状态按用户记住（shadcn/ui Sidebar 用 sidebar_state Cookie，项目可换成偏好存储）；手机宽度下变成抽屉，点遮罩或按 Esc 关闭。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：记住收起状态的 Cookie `p.persist` = sidebar_state（shadcn/ui · Sidebar）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-sidebar--sidebar-collapse

### SIDEBAR.ACTIVE 当前项与路由同源

高亮哪一项由当前路由决定，不另存一份「选中项」状态；刷新后保持；子页面高亮它所属的一级项，父级自动展开。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/permission-and-authorization.md「菜单、路由、按钮、字段和接口使用同一权限语义。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-sidebar--sidebar-active

### SIDEBAR.DEPTH 最多两级

侧边栏最多两级；第三级用页内的标签页或二级导航，不在侧边栏里继续嵌套；只有一个子项的分组不展开，直接放这一项。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-sidebar--sidebar-depth

### SIDEBAR.GROUPS 分组按使用频率

菜单按任务分组、按使用频率排序，最常用的在上；分组标题不可点、不当链接；无权限的菜单项不显示（不显示禁用的菜单项让人猜）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-sidebar--sidebar-groups

### SIDEBAR.SCROLL 自己滚动、底部固定

侧边栏独立滚动，不跟着内容区滚；账户、设置、帮助固定在底部；当前项在可视区外时自动滚到可见。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-sidebar--sidebar-scroll

### SIDEBAR.KEYBOARD 键盘可操作

收起/展开用 Cmd/Ctrl + B（shadcn/ui Sidebar 的缺省快捷键），按钮提示里写出；菜单可以用 Tab 进入、方向键移动；收起展开后焦点留在切换按钮上。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：收起快捷键 `p.shortcut` = Mod+B（shadcn/ui · Sidebar）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-sidebar--sidebar-keyboard

## 设计模式/体验管理 / 卡片悬停（HOVER）

悬停只表示可点；幅度克制（边框或阴影升一级，不缩放）；不引起布局移动；键盘焦点的反馈不弱于悬停；触屏不依赖悬停；悬停才出现的操作不挤开内容；时长取 token。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-card-hover--overview

### HOVER.SIGNAL 悬停只表示可点

只有可点的卡片做悬停效果；不可点的卡片悬停没有任何变化，避免让人以为能点。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：可点与不可点——把指针移到两张卡片上对比；用 Tab 键聚焦可点的那张。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-card-hover--hover-signal

### HOVER.SUBTLE 幅度克制

悬停时边框加深一档（gray-400 → gray-500）或阴影升一级；位移不超过 1px，不缩放卡片、不放大内容。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-card-hover--hover-subtle

### HOVER.NO_SHIFT 不引起布局移动

悬停不改卡片尺寸、不改边框宽度、不显示会挤开内容的元素；需要强调时用阴影、outline 或改变边框颜色，宽度不变。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：悬停加粗边框，整排卡片抖动
- 示例（这样做）：只换颜色或加阴影
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-card-hover--hover-no-shift

### HOVER.FOCUS_PARITY 焦点反馈不弱于悬停

可点的卡片能用键盘聚焦（链接或按钮包住整卡，或 tabindex=0 并响应 Enter/空格）；:focus-visible 的反馈不弱于悬停，并且不被遮挡。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 移除焦点轮廓而无同等级可见替代。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-card-hover--hover-focus-parity

### HOVER.TOUCH 触屏不依赖悬停

悬停才显示的操作，在不支持悬停的设备上常显或放进「更多」菜单（用 @media (hover: hover) 区分）；关键信息不只放在悬停提示里。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 仅通过颜色、hover 或 tooltip 传递关键信息。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-card-hover--hover-touch

### HOVER.REVEAL 悬停出现的操作不挤开内容

行或卡片上悬停才出现的操作占位预留（透明度从 0 到 1，不从无到有插入），键盘聚焦到行内时同样出现；离开后收起。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：悬停与聚焦都显示行操作——指针移到行上或用 Tab 聚焦到行内按钮，操作出现；在触屏设备上常显。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-card-hover--hover-reveal

### HOVER.TIMING 时长取 token

悬停过渡 150ms（Tailwind 缺省时长），离开同档；不额外加延迟（文字提示除外）。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：悬停过渡 `p.duration` = 150ms（Tailwind CSS · 过渡（默认时长与缓动））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-card-hover--hover-timing

## 设计模式/体验管理 / 加载条（LBAR）

选对加载形态；快的请求不显示加载条，出现后至少停留一会儿；不确定进度时缓慢推进、完成时补满；全局只有一条；有确切进度时显示百分比与剩余并能取消；读屏能感知。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-loading-bar--overview

### LBAR.KIND 选对加载形态

页面切换用顶部细加载条；区块首次加载用骨架（保持内容的几何）；按钮触发的操作用按钮自己的加载态；有确切进度的（上传、导出、导入）用确定进度条；不用整页转圈遮住已有内容。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「首屏骨架保持主要布局尺寸。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-loading-bar--lbar-kind

### LBAR.DELAY 快的不显示，出现了停一会儿

请求在延迟阈值内完成就不显示加载条，避免一闪；一旦显示，至少停留最短时长再淡出；两个值全局统一，在 HTTP 客户端或路由层实现，页面不各自写。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：出现延迟 `p.delay`：待项目决定——加载条延迟多少毫秒出现？（候选 100ms / 200ms / 300ms）
- 参数：最短停留 `p.min_visible`：待项目决定——加载条出现后至少停留多少毫秒？（候选 300ms / 400ms / 500ms）
- 实验 `loading.delay`：实验：加载条的延迟出现与最短停留——分别发一个快请求和一个慢请求：快的不出现加载条；慢的出现后至少停留一会儿再收起。打开「错误做法」看快请求让加载条一闪而过。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-loading-bar--lbar-delay

### LBAR.TRICKLE 不确定进度时缓慢推进

不知道总量时，加载条先快后慢地推进但停在 100% 之前；完成时补满并淡出；失败时也要收起，并在出错的位置给反馈。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-loading-bar--lbar-trickle

### LBAR.SINGLE 全局只有一条

页面级加载条全局只有一个，用计数管理：每个请求开始加一、结束减一，归零才收起；并发请求不各自起一条，也不互相提前收起。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「SHOULD 让 loading 来源唯一，避免重复状态。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-loading-bar--lbar-single

### LBAR.DETERMINATE 确定进度显示百分比与剩余

上传、导出、导入这类有确切进度的操作显示百分比和预计剩余时间，可以取消；超过 10 秒的转后台任务并在完成时通知（见 SFB.PROGRESS）。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：确定进度：百分比、剩余时间、可取消
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-loading-bar--lbar-determinate

### LBAR.A11Y 读屏能感知

进度条带 role=progressbar 与 aria-valuenow（不确定进度时不写 valuenow，所在区域标 aria-busy）；完成和失败写进 aria-live 区。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-experience-loading-bar--lbar-a11y

## 设计模式/数据呈现 / 数据网格（DGRID）

先分清表格与数据网格；列的对齐、冻结与宽度有规则；排序筛选在服务端并进 URL；跨页选择说清范围；大数据虚拟滚动；行内编辑可撤回；密度三档按用户记住；空与加载保持列结构。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-data-grid--overview

### DGRID.WHEN 表格还是数据网格

只读、列不多、一屏看得完的列表用普通表格；需要列配置、冻结列、行内编辑、海量数据滚动、键盘逐格移动的用数据网格；同一个产品里数据网格只用一种实现。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：数据网格实现 `p.grid_library`：待项目决定——数据网格用哪个实现？（候选 TanStack Table + TanStack Virtual / AG Grid）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-data-grid--dgrid-when

### DGRID.COLUMNS 列的对齐、冻结与宽度

文本左对齐，数字和金额右对齐并用等宽数字，日期统一格式；首列（标识列）冻结在左、操作列冻结在右；列宽有最小值，内容超出时省略并能看全文；用户调整的列宽、顺序、显示的列按用户记住。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：冻结首列与操作列，数字右对齐——横向滚动时首列与操作列保持可见；金额列右对齐、等宽数字。
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「表格、图表、弹层、焦点和状态随主题同步。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-data-grid--dgrid-columns

### DGRID.SORT_FILTER 排序与筛选在服务端并进 URL

数据量超过一页时排序和筛选由服务端完成；当前排序的列有标识、可以取消；筛选条件、排序、页码进 URL，刷新和分享后恢复；表头的列筛选与筛选条共享同一套条件。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「大列表服务端分页，宽表虚拟化。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可分享和可恢复状态进入 URL。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-data-grid--dgrid-sort-filter

### DGRID.SELECTION 跨页选择说清范围

勾选只作用于本页时写明「已选本页 N 条」；需要选中全部结果时给「选择全部 M 条」的明确入口，批量操作按筛选条件在服务端执行，不在前端拉全量；翻页、筛选变化后说清选择是否保留。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-data-grid--dgrid-selection

### DGRID.VIRTUAL 大数据虚拟滚动

行数超过阈值时启用虚拟滚动，行高固定，表头与冻结列保持；不一次渲染全部行；滚动时不做重计算。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：虚拟滚动阈值 `p.virtual_threshold`：待项目决定——多少行以上启用虚拟滚动？（候选 200 个 / 500 个）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 大列表用普通 `v-for` 渲染全量数据（须虚拟滚动或分页）。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-data-grid--dgrid-virtual

### DGRID.EDIT 行内编辑可撤回

单元格就地编辑：Enter 提交、Esc 取消、Tab 到下一格；校验错误挂在单元格上并能定位；保存失败回滚到原值并说明原因；有未保存的修改时离开要提示；批量粘贴先校验再提交。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「Field Error：可定位到字段/单元格的错误。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-data-grid--dgrid-edit

### DGRID.DENSITY 密度三档按用户记住

紧凑、默认、宽松三档（行高 32 / 40 / 48px，与按钮尺寸对齐），默认取中档，用户的选择按用户记住；同一页的多个表格用同一档。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-data-grid--dgrid-density

### DGRID.EMPTY_LOADING 空与加载保持列结构

首次加载显示与真实行同高的骨架行，表头和列宽不变；重新查询时保留旧数据并标出「更新中」，不清空闪烁；空结果在表格内给原因和下一步（清除筛选、新建）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「SHOULD 在后台刷新时保留可用旧数据并标识 stale。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-data-grid--dgrid-empty-loading

## 设计模式/数据呈现 / 图表（CHART）

图表库全项目一个；按问题选图；配色取 token、不只靠颜色区分；坐标轴与单位写清，柱状图从 0 开始；提示给精确值与口径；空、加载、出错与列表一致；提供数据表替代；大数据降采样；随容器重绘、卸载时销毁。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--overview

### CHART.LIBRARY 图表库全项目一个

全项目只用一个图表库，经一个封装层（主题、空与出错态、尺寸监听、销毁）使用；图表库按需引入，不在应用入口同步加载。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：图表库 `p.library`：待项目决定——图表用哪个库？（候选 Recharts / visx / ECharts（按需引入））
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「路由、图表和重组件按需加载。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--chart-library

### CHART.CHOOSE 按问题选图

先问图要回答什么：随时间的趋势用折线，类别之间比较用柱，构成用堆叠柱（饼图只在 5 类以内、强调占比时用），分布用直方图或箱线图，两个量的关系用散点；一张图只回答一个问题；需要精确值时直接给表格。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：饼图最多类别 `p.pie_max` = 5 个（pomaster 预设约定（Geist 体系））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--chart-choose

### CHART.COLOR 配色取 token、不只靠颜色

分类色取规范色板的顺序，系列数有上限，超出合并为「其他」；连续值用单色深浅，正负对比用发散色；状态色只表示状态；不只靠颜色区分系列（加图例、直接标注或线型），对比度满足要求。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「颜色不得作为唯一信息来源」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--chart-color

### CHART.AXES 坐标轴与单位写清

柱状图纵轴从 0 开始，折线图可以截断但要标明；单位写在轴标题或图注里；刻度 4 到 6 个，数字格式与数据格式规范一致（千分位、单位缩写）；时间轴按时间等距，不按数据点等距。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：纵轴从 0 开始、单位写在图注
- 示例（别这样做）：柱状图纵轴从 40 开始，差距被放大
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--chart-axes

### CHART.TOOLTIP 提示给精确值与口径

悬停显示该点的精确值、单位和口径说明，多系列时同一时刻的值放在一个提示里；图例可点击切换系列；触屏上点按显示提示；关键结论不只放在提示里。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--chart-tooltip

### CHART.STATES 空、加载、出错与列表一致

图表区域在加载、空、出错时保持尺寸不变：加载用骨架，空数据说明原因（时间范围内没有数据），出错给重试；不渲染一张空坐标轴冒充「没有数据」。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「MUST NOT 只处理页面背景而遗漏 portal/图表。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--chart-states

### CHART.A11Y 提供数据表替代

每张图有一句话的文字摘要（aria-label 或图注），并能切换到数据表视图或下载数据；颜色之外还有文字或图形区分。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/ui-presentation-and-design.md「SHOULD 为复杂图表、媒体提供数据表格、长描述或音频描述。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--chart-a11y

### CHART.PERF 大数据降采样

点数超过阈值时先在服务端聚合或降采样；大量点用 canvas 渲染；聚合计算不放在主线程的渲染路径里；实时图表合并更新、按帧刷新。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：单系列点数上限 `p.max_points`：待项目决定——单条折线最多渲染多少个点？（候选 1000 个 / 2000 个）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--chart-perf

### CHART.LIFECYCLE 随容器重绘、卸载时销毁

图表跟随容器尺寸重绘（ResponsiveContainer 或 ResizeObserver，加防抖）；组件卸载时销毁实例并解除监听；主题切换时重新应用主题。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「状态拥有的监听器、计时器、观察器、请求、流、连接、Worker 和对象 URL 必须声明释放时机，并在卸载、身份切换或能力关闭时清理。」
- 示例（这样做）：清理函数里销毁
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-charts--chart-lifecycle

## 设计模式/数据呈现 / 报表（REPORT）

报表结构固定（标题与口径、筛选、指标、明细）；口径与数据截至时间写清；筛选与对比期进 URL；合计与小计规则明确；数字格式统一；导出与页面同口径并受权限控制；打印有专门样式；大报表服务端聚合。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-reports--overview

### REPORT.STRUCTURE 报表结构固定

从上到下：报表名称与数据截至时间、筛选与对比、关键指标、图表、明细表；每块都能单独加载和出错；同类报表结构一致，用户换一张报表不用重新学。

- 执行：人工评审；适用：管理侧与用户侧
- 演示：标题与截至时间、筛选、指标、带合计的明细
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-reports--report-structure

### REPORT.DEFINITIONS 口径与截至时间写清

每个指标都有口径说明（悬停或「口径」入口）：计算公式、包含与排除、统计时区；页面显示数据截至时间和数据延迟；口径变化时标出变化点，不把新旧口径的数据画成一条线。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-reports--report-definitions

### REPORT.FILTERS 筛选与对比期进 URL

时间范围、维度筛选、对比期（环比、同比）进 URL，可分享可恢复；默认时间范围固定且写明；对比结果同时给绝对值和变化率。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「可分享和可恢复状态进入 URL。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-reports--report-filters

### REPORT.TOTALS 合计与小计规则明确

合计行固定在明细底部（或顶部，全项目一致）；比率类指标的合计按分子分母重新计算，不对各行百分比求和或求平均；不同单位的值不相加；分组小计与总计的口径一致。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-reports--report-totals

### REPORT.NUMBERS 数字格式统一

金额、数量、比率按数据格式规范输出：千分位、固定小数位、单位写在表头或指标名里、负数格式统一；空值显示「—」，和 0 区分开；数字右对齐、用等宽数字。

- 执行：机器门禁 `format.no-local-pattern`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-reports--report-numbers

### REPORT.EXPORT 导出与页面同口径并受权限控制

导出的数据与页面使用同一组筛选和口径，文件名带报表名与时间范围；大数据量导出走后台任务，给进度并在完成时通知；导出受权限控制并按规则脱敏，导出操作留审计。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 对复制、导出、打印功能实施权限控制与脱敏策略；高敏感字段导出需审计与额外授权。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-reports--report-export

### REPORT.PRINT 打印有专门样式

需要打印的报表提供打印样式：去掉导航与交互控件，表头在每页重复，行不被分页截断，打印页脚写明报表名、筛选条件与截至时间。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：打印样式
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-reports--report-print

### REPORT.PERF 大报表服务端聚合

聚合在服务端完成，前端只拿结果；明细分页或懒加载；同一报表的多个区块并行请求；结果可以缓存，页面显示缓存的生成时间并能手动刷新。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 串行发起可并行的页面初始化请求（须并行或后端聚合）。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-patterns-data-reports--report-perf

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

## 工程规范 / 性能（PERF）

先定预算；路由与重组件按需加载；组件与图标按需引入；大列表分页与虚拟化；输入防抖并丢弃过期响应；初始化请求并行；渲染里不做重计算；度量分清实验室与真实用户数据。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-performance--overview

### PERF.BUDGET 性能预算

上线前定好预算：真实用户第 75 百分位 LCP ≤ 2.5 s、INP ≤ 200 ms、CLS ≤ 0.1（项目可以凭证据收紧）；首屏脚本体积和单个路由分包体积由项目定上限，构建时检查。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：LCP（p75） `p.lcp` = 2500ms（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 参数：INP（p75） `p.inp` = 200ms（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 参数：CLS（p75） `p.cls` = 0.1（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 参数：首屏脚本体积 `p.initial_js`：待项目决定——首屏脚本（压缩后）体积上限是多少 KB？
- 参数：路由分包体积 `p.route_chunk`：待项目决定——单个路由分包（压缩后）体积上限是多少 KB？
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「定义首屏、包体、交互和核心页面预算。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-performance--perf-budget

### PERF.LAZY_LOAD 按需加载

路由一律懒加载（lazy 路由或 React.lazy）；图表、富文本编辑器、大表格等重组件在用到的页面里按需加载；应用入口不同步引入这些重型依赖。

- 执行：机器门禁 `perf.lazy-load`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「路由、图表和重组件按需加载。」
- 示例（这样做）：路由懒加载
- 示例（别这样做）：入口同步引入图表库
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-performance--perf-lazy-load

### PERF.ON_DEMAND_LIBRARY 组件库按需引入

组件按文件引入（shadcn/ui 的组件本来就在 src/components/ui 下按文件存在）；lucide-react 按图标名具名引入，不整包引入或用动态名字查整个图标表。

- 执行：机器门禁 `perf.no-full-library-import`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 示例（这样做）：具名引入图标
- 示例（别这样做）：整包引入图标表
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-performance--perf-on-demand-library

### PERF.LARGE_LISTS 大列表

大列表走服务端分页、筛选、排序；行数多或列很多的表格用虚拟滚动（TanStack Virtual）；不用 map 一次渲染全量数据；列表项有稳定的 key。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：虚拟滚动阈值 `p.virtual_threshold`：待项目决定——表格多少行以上启用虚拟滚动？（候选 200 个 / 500 个）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「大列表服务端分页，宽表虚拟化。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-performance--perf-large-lists

### PERF.INPUT 输入与过期响应

搜索、联想等随输入触发的请求做防抖，或用 useDeferredValue 让输入保持跟手；新请求发出时取消旧请求；过期的响应不覆盖新状态（查询 key 带上关键字时由查询缓存层处理）。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：防抖间隔 `p.debounce`：待项目决定——输入防抖间隔取多少毫秒？（候选 300ms）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「搜索防抖、旧请求取消、过期响应丢弃。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-performance--perf-input

### PERF.PARALLEL_INIT 并行初始化

页面初始化需要的多个请求并行发出（多个 useQuery 天然并行，或 useQueries），或由后端聚合成一个；不在 useEffect 里串行等待彼此无关的请求，不造成请求瀑布。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 串行发起可并行的页面初始化请求（须并行或后端聚合）。」
- 示例（别这样做）：请求瀑布
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-performance--perf-parallel-init

### PERF.COMPUTE 渲染计算

渲染里不做复杂计算：派生值在渲染时直接算（轻量的）或用 useMemo（昂贵的）；对大数据全集的计算放到后端或 Web Worker；只订阅用到的状态（Zustand 选择器），避免整树重渲染。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 在 render 中执行复杂计算。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-performance--perf-compute

### PERF.MEASURE 度量口径

性能结论分清实验室数据和真实用户数据，记录设备、网络、浏览器、样本量和统计口径，放行看第 75 百分位；同一数据量下对比前后结果，不拿平均值或单次本地耗时下结论；用 React Profiler 定位重渲染。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「性能预算必须区分实验室数据与真实用户数据」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-performance--perf-measure

## 工程规范 / 安全（SEC）

不可信内容不进危险渲染；链接与跳转走白名单；状态变更请求带 CSRF 防护；不用 eval 一类动态执行；第三方脚本登记并校验完整性；前端隐藏不是鉴权；敏感值不出现在 URL、日志、埋点和剪贴板；跨窗口消息校验来源。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-security--overview

### SEC.XSS 不可信内容不进危险渲染

不用 dangerouslySetInnerHTML 渲染用户输入或接口返回的富文本；确实要渲染富文本时，经项目唯一的净化组件（白名单 sanitizer，如 DOMPurify）输出；不拼接 HTML 字符串。

- 执行：机器门禁 `security.no-unsafe-html`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 使用 `v-html` / `innerHTML` / `dangerouslySetInnerHTML` 渲染不可信内容；富文本必须使用白名单 sanitizer。」
- 示例（别这样做）：直接渲染接口返回的 HTML
- 示例（这样做）：经净化组件
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-security--sec-xss

### SEC.LINKS 链接与跳转走白名单

用户或接口提供的链接只接受 http、https、mailto 协议（拒绝 javascript:、data:）；登录后的回跳地址只接受站内相对路径；新窗口打开外链一律带 rel="noopener noreferrer"。

- 执行：机器门禁 `security.safe-link`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 示例（这样做）：回跳地址只认站内路径
- 示例（这样做）：外链
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-security--sec-links

### SEC.CSRF 状态变更请求带 CSRF 防护

所有改变状态的请求（表单、AJAX、上传、批量操作）由 HTTP 客户端统一带上 CSRF token 和自定义请求头；token 不放 URL、不存进脚本可读的存储；业务代码不自己拼这些头。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在表单提交、AJAX/Fetch、上传、批量操作、GraphQL mutation 中携带 CSRF token。」
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 让业务请求自行决定 CSRF/token 头格式。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-security--sec-csrf

### SEC.NO_EVAL 不用动态执行

不用 eval、new Function、字符串形式的 setTimeout / setInterval，不用内联事件属性；生产环境按严格 CSP 部署（script-src 不含 'unsafe-inline' 和 'unsafe-eval'）。

- 执行：机器门禁 `security.no-eval`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 部署 CSP，默认 `default-src 'self'`；脚本/样式/img/font/connect/frame 按业务最小白名单开放。」
- 示例（别这样做）：字符串当代码执行
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-security--sec-no-eval

### SEC.THIRD_PARTY 第三方脚本登记并校验完整性

第三方脚本、iframe、SDK 先登记（负责人、来源域、权限、数据范围、版本、撤除方式）再引入；从 CDN 加载的脚本带 SRI（integrity + crossorigin）；iframe 用 sandbox 收紧能力。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 加载无 SRI/无来源清单的第三方脚本或 iframe。」
- 示例（这样做）：带完整性校验
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-security--sec-third-party

### SEC.AUTHZ_UI 前端隐藏不是鉴权

按权限隐藏或禁用按钮、菜单只是体验；每个接口由后端强制鉴权；前端不拿全量敏感数据再自己过滤或用 CSS 藏起来，按权限脱敏由后端完成。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 用前端隐藏菜单或按钮替代后端鉴权。」
- 硬规范依据：specs/hard/themes/security.md「MUST 后端返回字段按权限脱敏，前端不得获取全量敏感数据后再自行过滤或仅 CSS 隐藏。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-security--sec-authz-ui

### SEC.SENSITIVE 敏感值不外泄

token、密码、身份证号这类敏感原值不写进 console、日志、埋点、错误上报、剪贴板、URL 和下载文件名；错误提示不暴露堆栈、内部路径和内部 ID。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 将敏感原值写入浏览器 console、日志、埋点、错误监控、剪贴板、URL、localStorage、下载文件。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-security--sec-sensitive

### SEC.POSTMESSAGE 跨窗口消息校验来源

postMessage 指定目标 origin，不用 '*'；接收方先校验 event.origin 在白名单内，再按结构解析数据；收到的内容不进 eval 或 innerHTML。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST NOT 使用 `postMessage('*')` 或在跨窗口消息中直接执行 eval/innerHTML。」
- 示例（这样做）：校验来源
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-security--sec-postmessage

## 工程规范 / 会话与凭据（SESSION）

凭据放在脚本读不到的地方；Cookie 属性收紧；登录后换会话；空闲与绝对超时；敏感操作重新验证；静默刷新只试一次；登出全面清理并同步到所有标签页；非必要 Cookie 先征得同意。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-session--overview

### SESSION.STORAGE 凭据放在脚本读不到的地方

会话标识与刷新令牌放在 HttpOnly Cookie 里，由后端设置；短期访问令牌只放内存（模块变量或状态库里不持久化的字段）；不存进 localStorage、sessionStorage、IndexedDB，不放进 URL 和 URL 片段。

- 执行：机器门禁 `security.no-token-storage`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 禁止将 session identifier、refresh token、access token、secret、密码等价凭据持久化到 localStorage/sessionStorage/IndexedDB（除非经安全 Owner 批准的短期例外）。」
- 示例（别这样做）：令牌存进 localStorage
- 示例（这样做）：令牌只放内存
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-session--session-storage

### SESSION.COOKIE Cookie 属性收紧

会话类 Cookie 一律 HttpOnly、Secure、SameSite（默认 Lax，跨站场景不需要时用 Strict），优先用 __Host- 前缀（必须 Secure、Path=/、不带 Domain）；Path 与 Domain 取最小范围；Cookie 里不放业务数据和个人信息；前端代码不读写会话 Cookie。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：SameSite `p.same_site`：待项目决定——会话 Cookie 的 SameSite 取 Lax 还是 Strict？（候选 Lax / Strict）
- 参数：Cookie 名前缀 `p.prefix` = __Host-（MDN · Using HTTP cookies（Cookie 前缀与属性））
- 硬规范依据：specs/hard/themes/security.md「MUST 使用双重提交 cookie 或同步器 token；token 必须每次会话/请求不可预测且由后端验证。」
- 示例（这样做）：后端下发的会话 Cookie
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-session--session-cookie

### SESSION.ROTATE 登录后换会话

登录成功、切换租户、提升权限后由后端签发新的会话标识并作废旧的（防会话固定）；前端在这些时刻丢弃内存里的旧令牌和旧的 CSRF token，重新获取。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在登录、切换租户、敏感操作后轮换 CSRF token。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-session--session-rotate

### SESSION.TIMEOUT 空闲与绝对超时

会话同时有空闲超时和绝对超时；空闲超时到期前提示「即将退出」并允许续期；超时后保存可恢复的现场（当前路由、未提交表单的草稿），重新登录后回到原处。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：空闲超时 `p.idle`：待项目决定——空闲多久自动退出？（候选 30 分钟 / 2 小时）
- 参数：绝对超时 `p.absolute`：待项目决定——登录后最长多久必须重新登录？（候选 8 小时 / 24 小时）
- 参数：到期提醒 `p.warn_before`：待项目决定——到期前多久提示？（候选 2 分钟 / 5 分钟）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-session--session-timeout

### SESSION.STEP_UP 敏感操作重新验证

修改密码、改绑手机、导出敏感数据、批量删除、审批这类高影响操作前要求重新验证身份（输入密码或二次验证），验证结果只对这一次操作有效。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 对导出、删除、审批、批量操作等高影响动作增加二次确认或后端 challenge。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-session--session-step-up

### SESSION.REFRESH 静默刷新只试一次

请求返回 401 时，HTTP 客户端用刷新令牌静默刷新一次（并发的 401 共用同一次刷新），成功后重放原请求；刷新失败就清理会话并带回跳地址去登录；刷新逻辑只在 HTTP 客户端里写一处。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在 token 即将过期前使用 silent refresh 或显式重新认证，不得在 URL 中传递 token。」
- 示例（这样做）：并发 401 共用一次刷新
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-session--session-refresh

### SESSION.LOGOUT 登出全面清理并同步

登出时调用后端注销接口，清空内存令牌、查询缓存、状态库、按用户隔离的存储、订阅、Worker 和长连接；用 BroadcastChannel 通知其他标签页同步登出。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 实现统一登出：清除服务端会话、客户端内存 token、触发所有标签页/Worker 登出事件。」
- 示例（这样做）：多标签页同步登出
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-session--session-logout

### SESSION.CONSENT 非必要 Cookie 先征得同意

统计、广告等非必要 Cookie 和本地存储在用户同意之前不写入；同意可以撤回，撤回后停止加载对应脚本并清理它写下的数据；必要 Cookie 在隐私说明里列明用途。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在用户撤回同意或第三方 SDK 不再需要时停止加载并清理其状态/缓存。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-session--session-consent

## 工程规范 / 防篡改与防劫持（TAMPER）

前端的一切都可被篡改：价格、权限、状态以服务端为准；关键写请求防重放；传输全程 HTTPS 与 HSTS；页面不被别人嵌套（防点击劫持）；外链防反向标签页劫持；本地数据读回先校验；前端混淆不是安全措施。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-tamper--overview

### TAMPER.SERVER_TRUTH 以服务端为准

金额、价格、折扣、库存、权限、审批状态这类业务事实由服务端计算和判定；前端提交用户的意图（选了哪个商品、改成什么），不提交可被改写的结论（总价、是否有权限）；客户端校验只是体验，服务端再校验一遍。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 将客户端校验仅视为 UX 辅助，服务端校验为权威；前端仍需执行同步/异步校验以提升体验。」
- 示例（别这样做）：提交前端算的总价
- 示例（这样做）：只提交意图，总价由后端算
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-tamper--tamper-server-truth

### TAMPER.REPLAY 关键写请求防重放

支付、审批、转账这类关键写请求带一次性随机数和时间戳，由后端校验时效并拒绝重复；需要时对请求体签名（密钥不在前端代码里，由后端按会话下发短期签名凭据）；重放保护与幂等键一起使用。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：时间窗口 `p.window`：待项目决定——时间戳允许的偏差是多少？（候选 60 秒 / 300 秒）
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-tamper--tamper-replay

### TAMPER.TRANSPORT 传输全程 HTTPS

全站 HTTPS 并启用 HSTS；页面不加载任何 HTTP 资源（无混合内容）；接口地址、WebSocket 地址都用 https / wss；证书错误不提供「继续访问」的旁路。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 配置 TLS 1.2+；HTTPS 页面不得加载 HTTP 资源（混合内容）。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-tamper--tamper-transport

### TAMPER.FRAMING 页面不被别人嵌套

响应头设置 CSP frame-ancestors（或 X-Frame-Options），默认禁止被其他站点嵌入 iframe，防点击劫持；确需被嵌入的页面列出允许的来源。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 使用 `X-Frame-Options: DENY/SAMEORIGIN` 或 CSP `frame-ancestors` 防止点击劫持。」
- 示例（这样做）：禁止被嵌入
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-tamper--tamper-framing

### TAMPER.TABNABBING 外链防反向标签页劫持

target=_blank 的链接一律带 rel="noopener noreferrer"；用 window.open 打开外部页面时传 noopener；不把 window.opener 交给外部页面。

- 执行：机器门禁 `security.safe-link`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 示例（这样做）：window.open 带 noopener
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-tamper--tamper-tabnabbing

### TAMPER.LOCAL_DATA 本地数据读回先校验

从 localStorage、IndexedDB、URL 参数读回的数据当作不可信输入：校验结构、版本和所属用户，不符合就丢弃并回到默认值；不把本地数据当成权限或业务判定的依据。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「持久化状态必须区分用户/租户/环境命名空间，并在登出、权限收缩或版本不兼容时失效或迁移。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-tamper--tamper-local-data

### TAMPER.OBFUSCATION 前端混淆不是安全措施

代码混淆、禁用右键、反调试只能增加一点阅读成本，不能保护任何秘密：前端代码里不放密钥、内部接口凭据和不该给用户看到的规则；source map 不公开发布（随版本上传到错误监控并限制访问）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/observability-and-analytics.md「source map 与版本对应且受权限保护。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-tamper--tamper-obfuscation

## 工程规范 / 健壮性（ROBUST）

接口数据在边界按契约解析；渲染不怕空值与缺字段；每个请求有超时；离线和弱网有处理；非核心模块失败不影响主流程；界面承受重复与乱序；资源在卸载时清理；输入上限前端先拦。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-robustness--overview

### ROBUST.PARSE 接口数据在边界按契约解析

接口响应在 HTTP 客户端或接口层按契约 schema 解析（类型由 OpenAPI 生成，运行时用 zod 一类校验关键结构）；解析失败归为「契约错误」走错误处理，不把畸形数据交给组件去崩。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「传输成功与业务成功必须分别判断；HTTP 非成功状态、契约解析失败、取消、超时、离线和业务错误不得混为一类。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-robustness--robust-parse

### ROBUST.NULLS 渲染不怕空值与缺字段

可选字段用可选链和明确的默认显示（「—」）；列表字段为空数组、null 或缺失时都能渲染；数字字段区分 0 与空；不在模板里写多层取值链而不设防。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：明确的空值显示
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-robustness--robust-nulls

### ROBUST.TIMEOUT 每个请求有超时

HTTP 客户端给每个请求设超时（上传、导出等长请求单独设）；超时、取消、离线、服务端错误分别处理与提示；超时的请求不自动重发非幂等写操作。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：请求超时（秒） `p.timeout`：待项目决定——普通请求的超时取多少秒？（候选 10 / 15 / 30）
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「HTTP Client 统一处理 base URL、认证、超时、取消、trace 和 envelope。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-robustness--robust-timeout

### ROBUST.OFFLINE 离线和弱网有处理

监听 online / offline：离线时顶部提示并暂停轮询，已输入的内容不丢；恢复后重新校验数据新鲜度并重试读请求；页面从后台或前进后退缓存恢复时同样重新校验。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「页面必须兼容 `pagehide` / `pageshow`、可见性变化和 bfcache 恢复；恢复后重新校验连接、缓存、权限与数据新鲜度。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-robustness--robust-offline

### ROBUST.DEGRADE 非核心模块失败不影响主流程

推荐位、统计 SDK、客服挂件、图表这类非核心模块失败时只在它自己的位置降级（隐藏或显示占位），不阻塞首屏和主流程；第三方 SDK 初始化失败静默降级并上报。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/observability-and-analytics.md「MUST NOT 让 SDK 初始化、遥测缓存或发送重试阻塞首屏、用户操作或错误恢复。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-robustness--robust-degrade

### ROBUST.REPEAT_ORDER 承受重复与乱序

同一事件触发两次、响应乱序到达、组件重复挂载，界面状态都保持正确：请求结果写回前核对请求序号与上下文（见 ASYNC.LATEST），订阅与监听的数量有上限、不随重复挂载增长。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「重复进入、挂载、恢复或重试必须保持资源数量有界，并有自动化证据证明不会重复订阅或产生开放句柄。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-robustness--robust-repeat-order

### ROBUST.CLEANUP 资源在卸载时清理

定时器、事件监听、订阅、观察器、WebSocket、对象 URL 在 useEffect 的清理函数里释放；路由离开和身份切换时取消进行中的请求。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「路由离开、组件销毁、注销、切换账号/租户、权限变化和功能关闭必须清理对应资源与敏感上下文。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-robustness--robust-cleanup

### ROBUST.LIMITS 输入上限前端先拦

长度、文件大小、文件类型、数量、数值范围的上限与后端契约一致，在前端先拦截并说清限制（还能输入多少字、最大 20 MB）；后端仍是最终校验。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「上传声明 multipart 字段、类型、大小、数量、文件名、校验阶段和安全错误。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-robustness--robust-limits

## 工程规范 / 报错管理（ERRH）

错误归一成统一结构；按状态码分别处理；路由级与区块级错误边界，局部失败不白屏；全局兜底捕获并脱敏上报；文案说清发生了什么、怎么办；不吞错误；错误码到界面状态的映射只有一份。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-error-handling--overview

### ERRH.NORMALIZE 错误归一成统一结构

HTTP 客户端把所有失败归一成一个结构：类别（网络、超时、取消、契约、业务、权限……）、稳定错误码、可显示的文案、traceId、是否可重试、字段错误、建议的恢复动作；页面只消费这个结构，不解析原始响应。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「将原始错误归一化为稳定 code、trace、fieldErrors、retryable 和 recoverAction。」
- 示例（这样做）：统一的错误结构
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-error-handling--errh-normalize

### ERRH.MAPPING 按状态码分别处理

401 走静默刷新或去登录；403 显示无权限状态；404 显示资源不存在；409 给冲突解决（重新加载或比较合并）；422 把字段错误挂到字段；429 按 Retry-After 稍后重试；5xx 与网络错误显示可重试的错误；取消不提示。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「401、403、404、409、422、429、5xx 和网络错误分别处理。」
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「错误码到 UI 状态的映射必须维护在单一事实源 `outputs/frontend/10_planned/api-error-mapping.yaml`，并与契约版本同步。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-error-handling--errh-mapping

### ERRH.BOUNDARY 局部失败不白屏

路由级和区块级都有错误边界（ErrorBoundary 包住每个独立区块，路由用 errorElement）：一个区块渲染失败只替换这个区块并给重试，页面其余部分照常可用。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `error.boundary`：实验：区块级错误边界——让「回款趋势」区块出错：正确做法只有这一块显示错误并能重试；错误做法整页白屏。
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「分层设置错误边界，局部失败不得导致整页白屏。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-error-handling--errh-boundary

### ERRH.GLOBAL 全局兜底捕获并脱敏上报

注册 window.onerror 与 unhandledrejection（根组件外再包一层 ErrorBoundary），捕获到的错误先过滤敏感字段再上报，带 traceId、版本、路由；兜底只记录和提示，不吞掉错误继续假装正常。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 在前端异常捕获（Error Boundary、window.onerror、unhandledrejection）中过滤敏感字段后再上报监控。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-error-handling--errh-global

### ERRH.MESSAGE 文案说清发生了什么、怎么办

错误文案用用户的话说清发生了什么和下一步（重试、检查网络、联系管理员）；不显示堆栈、内部错误码原文和接口路径；需要反馈时给 traceId 方便复制；同一种错误全站同一句话。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/security.md「MUST 禁止在错误消息、Toast、Modal、URL、日志、监控 payload 中暴露 token、密码、PII、内部 ID。」
- 示例（别这样做）：把原始错误抛给用户
- 示例（这样做）：说清怎么办
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-error-handling--errh-message

### ERRH.NO_SWALLOW 不吞错误

catch 之后要么处理并告知用户，要么继续向上抛；不写空 catch，不只 console.log 了事；不用 try/catch 包住整段代码掩盖问题。

- 执行：机器门禁 `error.no-empty-catch`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「MUST NOT 吞掉字段错误、冲突或 TraceId。」
- 示例（别这样做）：空 catch
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-error-handling--errh-no-swallow

### ERRH.REPORT 上报可定位、不刷屏

错误上报带版本、环境、页面、操作和 traceId，按去重键合并同类错误并采样；白屏、根组件渲染失败、接口失败率有告警；上报本身失败不影响用户操作。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/observability-and-analytics.md「采集并分类运行错误、Promise rejection、资源失败、接口错误、白屏和根组件渲染失败」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-error-handling--errh-report

## 工程规范 / 保护页（GUARD）

每个路由声明访问要求；守卫集中在路由层；未登录去登录再回来；无权限与不存在有统一的页面；判定完成前不渲染受保护内容；会话过期保住现场；按钮级权限规则统一。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-route-guard--overview

### GUARD.DECLARE 每个路由声明访问要求

路由定义的 handle（或路由配置的元数据）里声明这个页面要求什么：是否登录、权限码、功能开关、布局；没有声明的路由在开发期就报错，不默认放行。

- 执行：机器门禁 `guard.route-meta`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「每个页面路由有稳定 name、path、page key、title、权限和布局 meta。」
- 示例（这样做）：路由声明访问要求
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-route-guard--guard-declare

### GUARD.CENTRAL 守卫集中在路由层

访问判定只在路由层做一次（根路由的 loader 或统一的守卫组件，读 handle 与当前会话、权限），页面组件不各自判断；直接输入地址打开的页面同样经过守卫。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `guard.route`：实验：保护页与回跳——以访客、只读成员、管理员身份打开受保护页面：访客去登录并在登录后回到原页面；只读成员看到无权限页；伪造的站外回跳地址被拒绝。
- 硬规范依据：specs/hard/themes/permission-and-authorization.md「直达 URL 仍经过页面权限守卫。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-route-guard--guard-central

### GUARD.LOGIN_REDIRECT 未登录去登录再回来

未登录访问受保护页面时跳到登录页并带上当前地址作回跳；登录成功后回到原页面；回跳地址只接受站内相对路径（见 SEC.LINKS）；登录页本身不再要求登录。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-route-guard--guard-login-redirect

### GUARD.FORBIDDEN 无权限与不存在有统一的页面

无权限显示统一的 403 页（说明缺什么权限、找谁申请），资源不存在显示统一的 404 页（给返回列表的入口）；按安全要求，对不该知道存在与否的资源统一显示 404，不泄露它是否存在。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「401、403、404、500 和资源删除有统一路由策略。」
- 硬规范依据：specs/hard/themes/security.md「MUST 对 401/403/404/409/422/429/5xx 分别处理，避免通过错误差异泄露权限/存在性信息。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-route-guard--guard-forbidden

### GUARD.NO_FLASH 判定完成前不渲染受保护内容

会话和权限还在确认时显示页面级加载，不先渲染受保护内容再跳走（避免闪现敏感信息）；权限数据随会话一次取回并缓存，路由切换时不重复拉取。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-route-guard--guard-no-flash

### GUARD.EXPIRED 会话过期保住现场

停留期间会话过期，下一次请求 401 时先静默刷新一次（见 SESSION.REFRESH）；仍失败就保存现场（路由与未提交的草稿）再去登录，登录后恢复；其他标签页同步处理。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-route-guard--guard-expired

### GUARD.BUTTON 按钮级权限规则统一

页面内的操作按同一套权限判断：没有权限的操作隐藏，或禁用并说明原因（全项目选一种并写明）；同一个操作在列表、详情、右键菜单里的权限判断一致；后端仍然校验。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：无权限操作的呈现 `p.mode`：待项目决定——无权限的操作是隐藏，还是禁用并说明原因？（候选 隐藏 / 禁用并说明原因）
- 硬规范依据：specs/hard/themes/permission-and-authorization.md「SHOULD 对禁用动作展示只读原因。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-route-guard--guard-button

## 工程规范 / 页面加载（PLOAD）

路由分包并预取；首屏骨架保持布局；先框架后数据、核心优先；异步加载的边界给全加载、出错、超时；分包加载失败能自愈；不跳布局；字体与图片有加载策略。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-page-loading--overview

### PLOAD.SPLIT 路由分包并预取

每个路由懒加载成独立分包（lazy 路由或 React.lazy）；导航链接在悬停或进入视口时预取目标路由；首屏只加载当前路由需要的代码。

- 执行：机器门禁 `perf.lazy-load`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「路由、图表和重组件按需加载。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-page-loading--pload-split

### PLOAD.SKELETON 首屏骨架保持布局

首次加载用与真实内容同几何的骨架（同样的行高、列宽、卡片尺寸），不用整页转圈；骨架只覆盖还没到的区块，已经有的内容先显示。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「首屏骨架保持主要布局尺寸。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-page-loading--pload-skeleton

### PLOAD.PROGRESSIVE 先框架后数据、核心优先

页面框架（导航、标题、工具栏）立即出现；核心数据最先请求并渲染；图表、历史、推荐等非核心区块延后加载或进入视口再加载；多个区块的请求并行。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「MUST NOT 串行发起可并行的页面初始化请求（须并行或后端聚合）。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-page-loading--pload-progressive

### PLOAD.ASYNC_BOUNDARY 异步边界给全加载、出错、超时

Suspense 的 fallback 用区块骨架，外面包 ErrorBoundary 处理加载失败；数据加载给超时与重试入口。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：Suspense 外包错误边界
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-page-loading--pload-async-boundary

### PLOAD.CHUNK_ERROR 分包加载失败能自愈

发布新版本后旧分包不存在（动态 import 失败）时，识别分包加载错误，提示「有新版本」并刷新一次到目标地址；同一会话只自动刷新一次，避免循环。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-page-loading--pload-chunk-error

### PLOAD.NO_SHIFT 不跳布局

图片、广告位、异步区块预留尺寸（宽高或 aspect-ratio）；字体加载不引起明显跳动；新内容插在用户视线下方或由用户触发；累计布局偏移守住性能预算。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：CLS（p75） `p.cls` = 0.1（pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标））
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-page-loading--pload-no-shift

### PLOAD.ASSETS 字体与图片有加载策略

字体用 font-display: swap 并只加载用到的字重；首屏大图预加载，其余图片懒加载（loading="lazy"）并给出响应式尺寸；图标走图标库的按需引入，不加载整套字体图标。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-page-loading--pload-assets

## 工程规范 / 缓存（CACHE）

分清每一层缓存的用途；每类数据定新鲜度；先显示旧数据、后台刷新；写后失效；按身份隔离；持久化只存可过期的非敏感数据；静态资源带指纹、入口页不缓存。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-caching--overview

### CACHE.LAYERS 分清每一层缓存

HTTP 缓存管静态资源；查询缓存（TanStack Query）管接口数据；持久化缓存（localStorage、IndexedDB）只管偏好和离线需要的数据；Service Worker 只在明确需要离线时启用。同一份数据不在两层各缓存一份再手动同步。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「server state 由查询缓存层管理。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-caching--cache-layers

### CACHE.FRESHNESS 每类数据定新鲜度

每类查询明确 staleTime：字典、配置这类少变的长，列表、详情短，实时数据不缓存；缓存保留时间（gcTime）默认 5 分钟，按需调整；默认失败重试 3 次（指数退避），写操作不自动重试。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：缓存保留（gcTime 缺省） `p.gc_time` = 5 分钟（TanStack Query）
- 参数：查询失败重试（缺省） `p.query_retry` = 3 个（TanStack Query）
- 参数：字典新鲜度 `p.dict_stale`：待项目决定——字典类数据的 staleTime 取多少？（候选 30 分钟 / Infinity（手动失效））
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「每个缓存声明 key、参数、身份/权限隔离、stale、保留和失效规则。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-caching--cache-freshness

### CACHE.SWR 先显示旧数据、后台刷新

有缓存时先显示旧数据并标出「更新中」，后台刷新后替换；不在刷新时清空列表造成闪烁；用户正在编辑的数据不被后台刷新覆盖。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.query-cache`：实验：查询缓存与失效——切换筛选看缓存命中；让缓存过期后先显示旧数据再后台刷新；新建一条后对应的 key 失效并重新拉取。
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「SHOULD 在后台刷新时保留可用旧数据并标识 stale。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-caching--cache-swr

### CACHE.INVALIDATE 写后失效

每个写操作声明它影响哪些查询（失效矩阵），成功后精确失效这些 key；不靠全量刷新页面；乐观更新的回滚和失效配套使用（见 STATE.CACHE_KEYS）。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「写操作定义依赖失效矩阵。」
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 成功后遗漏缓存刷新。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-caching--cache-invalidate

### CACHE.ISOLATION 按身份隔离

查询 key 与持久化 key 都带用户、租户、数据范围；登出、切换租户、权限收缩时清理对应缓存；不同身份不复用同一份缓存。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 多个用户、租户或权限范围复用未隔离的 key、数据库或缓存条目。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-caching--cache-isolation

### CACHE.PERSIST 持久化只存可过期的非敏感数据

写进浏览器的缓存登记用途、隔离 key、版本、大小和过期时间；读回先校验版本；不持久化接口的敏感数据和凭据；配额不足或写入失败时降级为只在内存里。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「MUST NOT 无限期持久化草稿、文件、接口响应或敏感偏好。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-caching--cache-persist

### CACHE.ASSETS 静态资源带指纹、入口页不缓存

构建产物文件名带内容哈希并长缓存（immutable）；index.html 不缓存或每次校验（no-cache）；Service Worker 的缓存带版本，新版本激活时清理旧缓存。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/frontend-state-and-client-data.md「Service Worker 与 Cache API 必须限定作用域、版本化缓存、验证响应来源，并在发布和退出策略中清理过期内容。」
- 示例（这样做）：入口页与静态资源的缓存头
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-caching--cache-assets

## 工程规范 / 异步处理（ASYNC）

请求可取消；只认最新一次的结果；无依赖的并行、部分失败要处理；重试只对幂等与可重试错误、指数退避；输入防抖、滚动节流；轮询会暂停会停止；每个 Promise 都有去处。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-async--overview

### ASYNC.CANCEL 请求可取消

请求接受 AbortSignal；重新输入、切换筛选、离开页面、组件卸载时取消进行中的请求；TanStack Query 会把 signal 传给 queryFn，接口层要接住它。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「查询可取消和丢弃过期响应。」
- 示例（这样做）：把 signal 传下去
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-async--async-cancel

### ASYNC.LATEST 只认最新一次的结果

同一个视图的多次请求，只有最新一次的结果写进界面；写回前核对请求序号和当时的身份、租户、参数，旧的结果丢弃；已取消的请求不提示为错误。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `state.race`：实验：迟到的响应不写回——快速输入会发出多个请求，响应乱序到达；只有最新一次的结果写进列表。打开「错误做法」看旧结果覆盖新结果。
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「请求结果提交前必须验证身份、租户、权限、参数和请求版本，防止旧上下文结果写回。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-async--async-latest

### ASYNC.PARALLEL 无依赖的并行、部分失败要处理

彼此无关的请求并行发出；需要全部结果时用 Promise.all，允许部分失败时用 Promise.allSettled 并逐项呈现失败；不在循环里逐个 await 彼此无关的请求。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（这样做）：部分失败逐项呈现
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-async--async-parallel

### ASYNC.RETRY 重试只对幂等与可重试错误

只重试读请求和声明了幂等的写请求，且只在错误可重试时（网络错误、超时、5xx、429）；指数退避加随机抖动，有次数上限，服务端给了 Retry-After 就按它等；重试过程可以取消，用户能看到「正在重试」。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：重试上限 `p.max_attempts`：待项目决定——最多重试几次？（候选 2 个 / 3 个）
- 参数：起始间隔 `p.base_delay`：待项目决定——退避的起始间隔取多少毫秒？（候选 500ms / 1000ms）
- 实验 `async.retry`：实验：重试与退避——调用一个时好时坏的接口：正确做法按指数退避重试、在上限内成功或明确失败；对不幂等的提交不自动重试。打开「错误做法」看立即重试把接口打爆。
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「重试必须服从幂等性、服务端 `Retry-After` 或受控退避，并能取消；取消或已被替代的请求不得提示为用户错误。」
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「MUST NOT 对非幂等 mutation 默认自动重试。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-async--async-retry

### ASYNC.DEBOUNCE 输入防抖、滚动节流

随输入触发的查询做防抖；滚动、窗口尺寸变化、拖动这类高频事件做节流或合到动画帧；防抖和节流的间隔全项目统一。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：防抖间隔 `p.debounce`：待项目决定——输入防抖间隔取多少毫秒？（候选 300ms）
- 参数：节流间隔 `p.throttle`：待项目决定——滚动节流间隔取多少毫秒？（候选 100ms / 16ms）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「搜索防抖、旧请求取消、过期响应丢弃。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-async--async-debounce

### ASYNC.POLLING 轮询会暂停会停止

后台任务提交后轮询状态：间隔逐步加大，页面隐藏时暂停、回到页面时立即查一次，任务结束或离开页面时停止；能用服务端推送（SSE、WebSocket）就不轮询；同一任务只有一个轮询。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「页面隐藏、冻结或进入前进后退缓存时必须暂停无必要轮询和高频工作；恢复时重新验证数据新鲜度、连接状态和权限上下文。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-async--async-polling

### ASYNC.NO_FLOATING 每个 Promise 都有去处

每个 Promise 要么被 await，要么接上 catch 并处理；异步的事件处理器内部 try/catch，失败走错误处理；不留悬空的 Promise（失败会变成未处理的 rejection）。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：悬空的 Promise
- 示例（这样做）：失败有去处
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-async--async-no-floating

## 工程规范 / 高并发（CONC）

相同的在途请求合并；批量操作有并发上限；多个小请求合成批量接口；收到限流就退避排队；写冲突用版本号；实时推送重连退避、去重保序；高频更新合帧渲染。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-concurrency--overview

### CONC.DEDUP 相同的在途请求合并

同一个查询 key 在途时，新的调用复用同一个请求，不重复发；组件各自用同一个查询，由查询缓存层负责合并（TanStack Query 天然按 key 去重）。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `concurrency.pool`：实验：在途合并与并发上限——三个组件同时要同一份数据：合并成一个请求。批量上传 10 个文件：并发池最多同时 3 个。打开「错误做法」看重复请求和同时发出 10 个请求。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-concurrency--conc-dedup

### CONC.LIMIT 批量操作有并发上限

批量上传、批量导入、批量调用接口用并发池，同时进行的数量有上限，并显示整体进度；单项失败可以单独重试；不一次性发出全部请求。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：并发上限 `p.pool`：待项目决定——批量请求的并发上限取多少？（候选 3 个 / 4 个 / 6 个）
- 硬规范依据：specs/hard/themes/performance-and-capacity.md「请求并发安全。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-concurrency--conc-limit

### CONC.BATCH 多个小请求合成批量接口

要对很多对象做同一件事时调用批量接口，或在同一帧内把多个小请求合成一次；不在循环里逐条请求。

- 执行：人工评审；适用：管理侧与用户侧
- 示例（别这样做）：循环里逐条请求
- 示例（这样做）：批量接口
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-concurrency--conc-batch

### CONC.RATE_LIMIT 收到限流就退避排队

收到 429 时读取 Retry-After，在客户端排队等待后再发，界面提示「请求过多，稍后自动重试」；不立即重发，不让多个组件同时各自重试。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「409 返回冲突实体或重新获取方式；429 返回明确退避信息；5xx 不代表所有请求均可重试。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-concurrency--conc-rate-limit

### CONC.VERSION 写冲突用版本号

可编辑的资源带版本号（version、updatedAt 或 ETag），更新时一并提交；后端返回冲突时，给用户重新加载或比较合并的选择，不静默覆盖别人的修改。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「可编辑资源返回 version、updatedAt 或 ETag，并在更新命令携带预期版本。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-concurrency--conc-version

### CONC.REALTIME 实时推送重连退避、去重保序

WebSocket / SSE 断线后指数退避重连，重连后补拉断线期间的数据；消息按 messageId 去重、按序号保序；收到的消息先合并再渲染，不逐条触发整页更新。

- 执行：人工评审；适用：管理侧与用户侧
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「必须定义鉴权、心跳、断线重连、重复、乱序、丢失、回放、完成终止和降级行为。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-concurrency--conc-realtime

### CONC.RENDER 高频更新合帧渲染

行情、日志、进度这类高频数据先进缓冲区，按动画帧（requestAnimationFrame）或固定间隔批量刷新界面；长列表虚拟化；不为每条消息触发一次状态更新。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-concurrency--conc-render

## 工程规范 / 防重复点击（CLICK）

提交中锁住并显示加载；创建类写请求带幂等键；回车与按钮共用一把锁；刷新、点赞这类按钮节流或合并；重复导航不重复入栈；锁定期间有反馈；按钮锁只是体验，后端仍要幂等。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-click-guard--overview

### CLICK.LOCK 提交中锁住并显示加载

点击提交后按钮立即进入加载（Button 的 loading）并拒绝再次触发，请求结束（成功或失败）后解锁；锁放在提交函数里（或用 mutation 的 isPending），不只靠按钮的禁用样式。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `click.guard`：实验：防重复点击——连点「提交订单」五次：正确做法只发出一个请求，并且带同一个幂等键；错误做法发出五个请求、创建五张订单。
- 硬规范依据：specs/hard/themes/page-composition-and-browser-environment.md「提交防重复并保留失败输入。」
- 示例（这样做）：用 mutation 的 isPending
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-click-guard--click-lock

### CLICK.IDEMPOTENCY 创建类写请求带幂等键

创建订单、提交审批、发起支付这类写请求在表单打开时生成一个幂等键，提交和重试都复用它，成功后换新键；按钮锁只是体验保护，重复请求由后端按幂等键识别。

- 执行：人工评审；适用：管理侧与用户侧
- 参数：幂等键请求头 `p.header` = Idempotency-Key（IETF HTTPAPI · The Idempotency-Key HTTP Header Field（草案））
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「前端按钮禁用和 loading 只是体验保护，不构成业务幂等。」
- 硬规范依据：specs/hard/themes/api-contract-and-error-semantics.md「MUST NOT 用按钮 loading 代替后端幂等。」
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-click-guard--click-idempotency

### CLICK.ONE_PATH 回车与按钮共用一把锁

表单的回车提交、按钮点击、快捷键都走同一个提交函数、共用同一把锁；不在两个地方各写一份提交逻辑。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-click-guard--click-one-path

### CLICK.THROTTLE 刷新、点赞这类按钮节流或合并

刷新、点赞、收藏、切换这类可以重复触发的操作：刷新按钮在请求进行中不再发新的；点赞收藏先乐观改状态，连续点击只发最后一次的结果（防抖合并）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-click-guard--click-throttle

### CLICK.NAVIGATION 重复导航不重复入栈

连续点击同一个导航入口不重复压入历史记录、不重复打开同一个详情抽屉或新窗口；打开新窗口的操作在窗口打开前锁住。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-click-guard--click-navigation

### CLICK.FEEDBACK 锁定期间有反馈

锁定期间按钮显示加载、文字说明正在做什么（「提交中…」），不静默吞掉点击；超过 1 秒还没结束的给出更明确的进度（见 SFB.PROGRESS）。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-click-guard--click-feedback

## 工程规范 / 原型转换（PROTO）

BA 交来的 spec 与 HTML 原型拆成四层：业务事实、信息结构、交互意图原样保留，表现全部丢掉；表现里藏着的事实翻译成语义；冲突进提问；按规范重绘后用同一个抽取器做事实对账。

页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-prototype-intake--overview

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
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-prototype-intake--proto-layers

### PROTO.EXTRACT 去表现化抽取

用 pomaster prototype ingest 读原型：JS 渲染的页面先在浏览器里渲染再读（表格行、弹窗内容常常是脚本生成的）；隐藏的弹窗、抽屉也读，标为条件区域；丢掉 class、style、纯布局的包裹层，只留标题层级、地标、区域、字段、操作、表格（表头与示例行）、标签页、提示文字和状态值；每条事实带出处（文件、节点路径、文本指纹）。

- 执行：人工评审；适用：管理侧与用户侧
- 实验 `prototype.convert`：实验：原型转换与事实对账——左边是一份样式很乱的原型片段；点「抽取」得到去掉表现后的大纲与事实清单；「对账」把按规范重绘的版本再抽一次，逐条比较。打开「错误做法」看重绘时漏掉一个字段、改掉一个选项后对账报出的差异。
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-prototype-intake--proto-extract

### PROTO.TRANSLATE 表现里藏着的事实翻译成语义

表现里带业务含义的部分翻译成语义再保留，不照抄样子：标签旁的星号 → 必填；红色或绿色的状态文字 → 状态值与它的语气（危险、成功）；删除线 → 作废或删除状态；右对齐的数字列 → 数值列与格式；初始禁用的按钮 → 启用条件（要选中行才能用）；垃圾桶图标 → 删除意图；固定在左右的列 → 冻结列。颜色值、像素、字体名一律不带进实现。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-prototype-intake--proto-translate

### PROTO.SPEC_FACTS spec 里读业务规则

spec 按结构读而不是按格式读：字段表（中文名、英文名、类型、必填、编辑权限、枚举）、SHALL / MUST / 必须 一类规则句、枚举与默认值、状态流转、交互说明表、权限与角色表；每条带章节出处。读不出结构的段落原文保留为待确认的说明，不猜。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-prototype-intake--proto-spec-facts

### PROTO.CONFLICTS 冲突进提问，不自己挑

spec 与 HTML 不一致（必填、枚举、字段有无）、原型与本规范冲突（例如原型每页 1000 条而规范上限 200 条）、原型里有 spec 没写的操作，都进 Question Gate 由人裁决；在裁决之前的默认口径：业务规则以 spec 为准，信息结构以 HTML 为准，呈现以本规范为准，并把这个默认写进提问里。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-prototype-intake--proto-conflicts

### PROTO.MAP 映射到规范，记下依据

页面类型映射到规范的页面模板（列表、详情、表单、看板、向导），区域映射到规范的模式（筛选条、数据列表、描述列表、抽屉、分步表单……），元素映射到规范组件；每个映射在 UX 中间表示里记下依据的规则编号，后来的人和 agent 能复查。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-prototype-intake--proto-map

### PROTO.REBUILD 按规范重绘

重绘时布局、间距、字号、颜色、组件全部来自本规范的 token 与组件；不复制原型的 class、内联样式、字体、颜色值、栅格列数和像素宽度；原型里的分组、顺序、主次和文案保留。原型用了另一套组件库或 CDN 引入的样式框架，实现里都不出现。

- 执行：机器门禁 `style.no-raw-color`（待接入，暂按评审执行）；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-prototype-intake--proto-rebuild

### PROTO.VERIFY 用同一个抽取器做事实对账

重绘完成后，用同一个抽取器读重绘后的页面，与事实清单逐条比较：缺失、改动、新增都为零（确需新增的事实走提问记录），同时规范门禁通过，才算转换完成；对账结果作为 verify 的证据。

- 执行：人工评审；适用：管理侧与用户侧
- 页面：https://river-singer.github.io/POMaster_VNext/react/?path=/story/standard-engineering-prototype-intake--proto-verify

## 待补的领域（116 个）

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
- `SRC.STAGESHOW` Stageshow（Benji Taylor 的 agent skill，MIT）：https://github.com/benjitaylor/skills/tree/main/stageshow（核实 2026-11-06）
- `SRC.AFFECTUI` affectUI（Florian Höller 的 React 组件库，MIT）：https://github.com/flohoeller/affectui（核实 2026-11-06）
- `SRC.NNG.RESPONSE_TIMES` Nielsen Norman Group · Response Times: The 3 Important Limits：https://www.nngroup.com/articles/response-times-3-important-limits/（核实 2026-11-06）
- `SRC.MDN.COOKIES` MDN · Using HTTP cookies（Cookie 前缀与属性）：https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies（核实 2026-11-06）
- `SRC.IETF.IDEMPOTENCY_KEY` IETF HTTPAPI · The Idempotency-Key HTTP Header Field（草案）：https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/（核实 2026-11-06）
- `SRC.SHADCN.SIDEBAR` shadcn/ui · Sidebar：https://ui.shadcn.com/docs/components/sidebar（核实 2026-11-06）
- `SRC.POMASTER.PERF_SPEC` pomaster 主题硬规范 · 性能与容量（Core Web Vitals 默认参考目标）：repo:packages/cli/seeds/specs/hard/themes/performance-and-capacity.md（核实 2026-11-06）
