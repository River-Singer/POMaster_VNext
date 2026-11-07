# 前端设计规范 `pomaster.design-standard/v1`

前端设计规范是开发必须遵守的标准，不是参考。它只有一份结构化源，从这份源同时生成三样东西，三样都盖同一个规范指纹：

| 给谁 | 是什么 | 在哪里 |
|---|---|---|
| 人 | Storybook「规范」分区：每条规则的条文、演示、对照表、色板、实验、数值与出处、执行方式、「这样做 / 别这样做」 | 总 Storybook 里的两个抽屉（见下）；在线版见 README「组件画廊」 |
| AI | 孪生：结构化 JSON + 一条规则一节的 Markdown 摘要 | 见下表 |
| AI / 脚本 | 命令行视图，按领域或规则过滤 | `pomaster design show [--system <体系>] [--area <key>] [--rule <id>] [--json]` |

规范源：工具预设按设计体系各一份，在 `packages/cli/seeds/design-standards/<体系>.yaml`（预设不直接播种）；项目自己的规范在 `.pomaster/baseline/frontend/design-standard.yaml`。命令优先用项目规范，项目没有时用预设（`--system antd|geist` 选体系，缺省 antd）。

| 体系 | 技术栈 | 预设 | 抽屉 | AI 孪生 | 重新生成 |
|---|---|---|---|---|---|
| `antd` | Vue 3 + ant-design-vue | `antd.yaml` | Vue · Ant Design（`packages/studio`） | `packages/studio/twin/design-standard.{json,md}` | `node packages/studio/run.mjs generate` |
| `geist` | React + shadcn/ui + Tailwind CSS 4 | `geist.yaml` | React · Geist（`packages/studio-react`） | `packages/studio-react/twin/design-standard.geist.{json,md}` | `node packages/studio-react/run.mjs generate` |

## 两个抽屉，一套目录

`corepack pnpm studio:dev` 起一个总 Storybook（http://localhost:6008），侧栏里是两个抽屉：**Vue · Ant Design** 与 **React · Geist**（Storybook Composition；两个画廊各自在 6006 / 6007 起服务）。只看一个用 `studio:vue:dev` / `studio:react:dev`。

两个抽屉的「规范」分区**结构完全相同**，内容各是本体系的规范：

- **目录相同**：领域、领域下的条目、组件清单取两套体系的并集，写在统一骨架 `packages/cli/seeds/design-standards/skeleton.yaml`（`pomaster.design-skeleton/v1`）。两份预设按骨架写：领域键、标题、分区、规则前缀、先后顺序，以及条目编号、标题、顺序都要和骨架一致，`pomaster design validate` 逐条核对（`DESIGN_AREA_SKELETON`）。骨架里有、本体系还没写的领域与条目照样出现在侧栏和页面上，标「待补」，并汇总成一条警告（`DESIGN_AREA_UNCOVERED` / `DESIGN_TOPIC_UNCOVERED`）。
- **样子相同**：两边的页面由同一个构建器 `packages/studio/src/standard/page.ts` 生成同一棵节点树，外框样式是同一份 `packages/studio/src/standard/standard.css`（按 Geist 文档的样子做：标题 + 一句话说明、演示卡片带「显示代码」、对照表、色板、并排的「这样做 / 别这样做」、说明在卡片下面、右侧本页目录）。两个运行时只负责把节点树渲染成 Vue / React 元素，并把实时位换成本体系的组件（antd 或 Geist）。
- **组件按并集补齐**：骨架的组件领域标出两套体系各自对应的现成组件（`counterparts`）；某套体系没有现成组件时为空表，由该体系自行设计。Ant Design 的组件类型更多，Geist 一侧按同样的数量做设计；Geist 规范了图标尺寸，Ant Design 一侧同样规范图标尺寸——依此类推。

**架构锁定以后**：项目定下前端架构、规范落地到 `.pomaster/baseline/frontend/design-standard.yaml` 后，总 Storybook 只留对应的抽屉。编排脚本 `scripts/studio.mjs` 读 `POMASTER_STUDIO_PROJECT` 指向的项目里那份规范的 `meta.design_system`；也可以用 `POMASTER_STUDIO_SYSTEM=antd|geist` 直接指定（规则见 `packages/studio/scripts/lib/drawers.mjs`）。设了 `POMASTER_STUDIO_PROJECT` 时，留下的那个抽屉的「规范」分区也从项目这份规范生成（`projectStandard()`）：项目改过的参数、定下的决策位、补的条文都在页面上。

## 怎么改

人和 AI 走同一条路，页面和孪生都不手改。

**工具预设**（本仓库）：

1. 编辑规范源：改条文、改数值、补演示与示例。要加领域或条目，先改骨架，再分别补两份预设；
2. `pomaster design validate [--system geist]`：所有问题一次报全；
3. 按上表重新生成：Storybook 页面与 AI 孪生一起更新。

**项目规范**（开发中）：

1. `pomaster design adopt [--system antd|geist] [--baseline]`：把预设拷进项目。体系缺省按依赖推断（vue → antd，react → geist）；`--baseline` 顺手把现有代码的违规记成存量（见「规范门禁」）。输出列出还没定的决策位。
2. `pomaster design set <规则>.<参数> <值> --by human:<名字> [--note 理由]`：定下决策位或改一个已有取值。只改那一行参数，出处记为项目决策源 `SRC.PROJECT.DECISIONS`（第一次用时自动登记），谁、哪天、为什么写进参数的 `note_zh`，`meta` 标为 `customized`；改完立即校验，不通过原样退回。按这条参数判卷的门禁下次就用新值，「待定」的检查随之生效。
3. `pomaster update spec "<一句规范>" --by <human|agent>:<名字>`：开发中定下的新规范落位。界面怎么呈现的（间距、颜色、圆角、组件的样子与交互……）写进项目规范所属领域的一条新规则（`<前缀>.PROJECT_<n>`，评审执行）；其余工程规则按 `.pomaster/specs/hard/themes/index.md` 的路由表写进主题文档的 `MUST` / `MUST NOT` / `SHOULD` 章节（「项目补充」块，不新建平行文件）。识别用路由表关键词与规范领域、条目标题的双字词项计分，原文带具体视觉量时偏向设计规范；语气按措辞判。`--dry-run` 只看识别结果与候选，`--area` / `--theme` 指定去处，同一句不重复写，认不出就失败。
4. 查：AI 读 `pomaster design show`（`--json` 全量）；人看 Storybook（`POMASTER_STUDIO_PROJECT=<项目目录>` 起画廊，规范页从项目规范生成）。

孪生没重新生成时，`packages/studio/tests/standard.spec.ts`（Ant Design）或 `packages/studio-react/tests/standard.spec.ts`（Geist）让 CI 失败；规范源、骨架或 CLI 种子改动合入 main 后，总 Storybook（两个抽屉）自动重新发布。

## 结构

```yaml
schema: pomaster.design-standard/v1
meta:
  origin: preset            # preset / customized / owner
  customized: false
  design_system: antd       # antd（Vue + ant-design-vue）/ geist（React + shadcn/ui + Tailwind）
  ui_library: ant-design-vue@4.2.6
sources:                    # 出处登记：每个定值都要能溯源
  SRC.ANTD.SPEC.FONT: { title_zh: Ant Design 设计规范 · 字体, url: https://ant.design/docs/spec/font-cn, retrieved: 2026-11-02 }
specs:                      # 主题硬规范（specs/hard/ 下的相对路径），供锚点引用
  ui: themes/ui-presentation-and-design.md
areas:
  - key: grid               # 领域键（与骨架一致）
    title_zh: 栅格
    group: foundations      # foundations / components.<类> / patterns.global / patterns.principles / patterns.templates / engineering
    prefix: GRID            # 规则编号前缀（组件领域是 CMP.BUTTON 这样的点分前缀）
    summary_zh: 24 列栅格……
    rules:
      - id: GRID.GUTTER     # 编号与标题和骨架条目一致
        title_zh: 列间距
        statement_zh: 列间距是固定值，不随窗口缩放，只取 16 或 24……
        surfaces: [admin]   # 可选；缺省两个面都适用
        params:
          gutter: { value: [16, 24], unit: px, source: SRC.ANTD.SPEC.BASICS, label_zh: 允许的列间距 }
          gap: { token: spacing.lg }                     # 引用 design-tokens
          padding: { decision: 内容区内边距取多少？ }      # 项目决策位
        anchors:
          - { spec: ui, quote: 响应式断点和密度切换有验收矩阵。 }
        enforcement: { kind: gate, check: grid.gutter-allowed }   # 或 { kind: review }
        showcase:           # 可选：演示 / 对照表 / 色板 / 实验，页面上放在条文之后
          - { kind: demo, title_zh: 两列布局, template: '<a-row :gutter="p.gutter[0]">…</a-row>' }
        examples:
          - { kind: do, title_zh: gutter 取 16, template: '<a-row :gutter="p.gutter[0]">…</a-row>' }
          - { kind: dont, title_zh: 照截图量出来的 13px, code: '.card { padding: 13px; }', lang: css }
  - key: button             # 组件领域可以带实验场
    group: components.general
    prefix: CMP.BUTTON
    playground:
      component: a-button   # Vue 写 antdv 标签；React 写登记过的组件名（如 Button）
      text_zh: 新建车型
      props:
        type: { options: [primary, default, dashed, text, link], default: primary }   # 只列规范允许的取值
        danger: { boolean: true, default: false }
      matrix: { rows: type, columns: size }   # 状态矩阵：行、列各取一个枚举属性
    rules: [ … ]
```

未知键一律报错（闭世界）。

### 数值：三种来源选一种

| 写法 | 含义 |
|---|---|
| `token: <点分路径>` | 取 `design-tokens.yaml` 的值；token 还是 UNKNOWN 时这个参数待定。只有引用了 token（参数、色块，或实时内容里的 `t[…]`）的规范，token 表才进规范指纹 |
| `value: … + source: SRC.*` | 带出处的定值；出处必须在 `sources` 登记（标题、链接、核实日期）。仓库内出处写 `repo:<路径>` |
| `decision: <问题>` | 项目决策位：框架不替项目选，可附 `candidates` 供参考 |

数值类的取值（动效时长、加载条延迟、虚拟滚动阈值、性能预算、超时、重试、防抖与节流、并发上限、层级档位、列间距……）预设里直接给默认值：有外部权威数值的引外部出处（如重试取 TanStack Query 的缺省），没有的出处记为 `SRC.POMASTER.DEFAULTS`（pomaster 推荐默认），理由写在 `note_zh`。库的选型、会话策略（空闲超时、绝对超时、SameSite）、无权限操作隐藏还是禁用，仍是项目决策位。项目要改任何取值都用 `pomaster design set`。


定值不能写 UNKNOWN，没定的写成决策位。条文用自己的话写成可执行条款；官方文档只取数值与规则要点，不搬原文。规范指纹 = 规范源 +（引用了 token 时）token 表 + 统一骨架。

### 锚点：成文规则只有一个来源

`anchors` 把规则挂到主题硬规范（`specs/hard/themes/*.md`）的原文条款上，`quote` 必须逐字摘自原文。校验时逐条核对原文仍在，原文改了而锚点没改会报 `DESIGN_ANCHOR_MISSING`。

### 执行方式

- `gate`：机器门禁，违反即拦截。`check` 必须在检查词表内（`packages/cli/src/design-standard.ts` 的 `DESIGN_CHECKS`）；检查还没接入门禁时，规则先按评审执行，页面和孪生都会标出来；接入的检查见下文「规范门禁」。
- `review`：机器查不出来的规则，评审时逐条核对。

### 展示块

规则可以带 `showcase`，页面上放在条文之后、「这样做 / 别这样做」之前：

| `kind` | 呈现 | 写法 |
|---|---|---|
| `demo` | 演示卡片：舞台 + 「显示代码」 | `title_zh`、可选 `description_zh`，实时内容 `template` 或 `jsx` |
| `specimen` | 对照表：示例｜名称（类名 / token）｜用途 | `rows: [{ name, usage_zh, template / jsx / sample_zh }]`；`sample_zh` 是简写：用 `name` 作类名渲染这段文字（如 Geist 的排版类） |
| `palette` | 色板：每个色阶一行色块，附色值表 | `scales: [{ name, label_zh, swatches: [{ name, value / token / pending_zh, usage_zh }] }]`；有定值时写 `source` |
| `lab` | 实验：可操作的小实验 + 状态检查器 | `lab` 取实验词表 `DESIGN_LABS`：`state.url-filters`（筛选进 URL）、`state.query-cache`（查询缓存与失效）、`state.race`（迟到的响应不写回）、`context.restore`（返回列表恢复位置）、`loading.delay`（加载条的延迟出现与最短停留）、`error.boundary`（区块级错误边界）、`guard.route`（保护页与回跳）、`async.retry`（重试与退避）、`concurrency.pool`（在途合并与并发上限）、`click.guard`（防重复点击）、`prototype.convert`（原型转换与事实对账） |

实验在两个画廊共用一份实现（`packages/studio/src/standard/labs.ts` 与 `labs-more.ts`，公共部件在 `lab-kit.ts`：小状态机 + 返回节点树的视图；每个实验都有「正确做法 / 错误做法」两种模式），假服务端用内存数据与定时器；缓存实验的缓存是演示用的简化实现，行为对齐 TanStack Query。新实验要先在 `DESIGN_LABS` 登记，再在 `labs.ts` 实现，两个画廊的测试对账。

### 实时内容

示例、演示、对照表的行都可以是实时内容：

- `template`：Vue 模板，Vue 画廊里用 antdv 实时渲染（Ant Design 体系），包在 `.antd-live` 里（antd 的字体、字色与行高）。模板里 `p` 是本条规则的参数，`t` 是 token 表（如 `t['spacing.lg']`），`s` 是这个示例自己的一份可写状态（演示展开收起、切换状态：`@click="s.open = !s.open"`）；除 antd 组件与图标外还能用 `<std-number-roll>`（数字滚动，`packages/studio/src/standard/live-extras.ts`）；只能引用已定的值，不能有 `<script>` / `<style>`。
- `jsx`：JSX 片段，React 画廊里实时渲染（Geist 体系），包在 `.geist-root` 里。同样用 `p` / `t` 取值，可写状态是 `s` 与 `set({ … })`；只能用 `packages/studio-react/src/components/ui/` 里登记的组件（Button、ButtonLink、Badge、Card、Input、Label、Alert、Separator、Switch、Skeleton、Table 一组、Checkbox、RadioGroup、Select 一组、Tabs 一组、Dialog 一组、DropdownMenu 一组、Popover 一组、Tooltip 一组、Progress，以及收录自 affectUI 的 NumberTicker——MIT，见 `THIRD_PARTY_NOTICES.md`）和 lucide-react 图标（`XxxIcon` 命名），用了没登记的组件生成就失败；不能写 `import` / `export`。Geist 色阶在 Tailwind 里是 `ds-` 前缀的颜色类（`bg-ds-gray-100`、`text-ds-gray-900`）。
- `code` + `lang`：只展示的代码片段（`vue` / `ts` / `tsx` / `css` / `html` / `text`，目录树这类纯文本用 `text`）。

一个体系只收自己的实时内容形态：Ant Design 预设写 `template`，Geist 预设写 `jsx`。示例的 `kind` 只有 `do`（这样做）和 `dont`（别这样做）。

## 当前预设（Ant Design · Vue）

93 个领域、460 条规则：

- **基础**（13 篇）：色彩、字体、标题层级、图标、材质、圆角管理、投影、布局、栅格、间距、动效、点击反馈、焦点环；
- **组件 · 通用**：按钮（何时用、变体、危险操作、尺寸、形状、搭配图标、纯图标按钮、加载、禁用、链接按钮、宽度、表单提交、文案；带实验场与状态矩阵）；
- **组件批次一**（33 篇，两套体系同步）：数据录入 10 篇（输入框、多行输入、数字输入、选择器、多选框、单选框、开关、日期选择、表单、上传）、数据展示 7 篇（表格、标签、徽标、卡片、描述列表、空状态、文字提示）、反馈 8 篇（警告提示、对话框、抽屉、全局提示、通知、气泡确认、进度条、加载中）、导航 6 篇（标签页、面包屑、下拉菜单、分页、步骤条、导航菜单）、布局 2 篇（分割线、间距）。输入框、选择器、开关、标签、警告提示带实验场；
- **设计模式 · 全局规则**（8 篇）：反馈、导航、数据录入、数据展示、数据格式、文案、按钮、数据列表；
- **设计模式 · 原则**（10 篇）：亲密性、对齐、对比、重复、直截了当、足不出户、简化交互、提供邀请、巧用过渡、即时反应；
- **设计模式 · 模板文档**（2 篇）：数据可视化页、详情页；
- **设计模式 · 体验管理**（8 篇）：界面静帧、组件动效、Bento 栅格、状态反馈、上下文管理、侧边栏管理、卡片悬停、加载条（静帧、动效、Bento 借鉴了 Stageshow 的取法，数字滚动借鉴了 affectUI，条文自行改写）；
- **设计模式 · 数据呈现**（3 篇）：数据网格、图表、报表；
- **工程规范**（15 篇）：前端架构（技术栈、目录分层、模块边界、组件写法、组件库用法、接口请求层、表单、路由、类型、测试——按 Vue 3 + ant-design-vue 写）、状态管理（三个实验）、性能、安全、会话与凭据（Cookie）、防篡改与防劫持、健壮性、报错管理、保护页、页面加载、缓存、异步处理、高并发、防重复点击、原型转换（各篇的机制配实验：返回恢复、加载条、错误边界、保护页、重试、并发、防重复点击、原型转换）。

数值取自 Ant Design 设计规范与 ant-design-vue 主题源码（色板由 @ant-design/colors 的算法从种子色派生）；官方没给数值的是项目决策位。其余 63 个骨架领域（组件）待补。

## 当前预设（Vercel Geist · React）

93 个领域、460 条规则：

- **基础**（13 篇）：色彩（Geist 色阶与每档用途）、字体（四组排版类）、标题层级、图标（含尺寸）、材质、圆角管理、投影、布局、栅格、间距、动效、点击反馈、焦点环；
- **组件 · 通用**：按钮（与 Ant Design 一侧同样 13 条；变体 default / secondary / tertiary / error / warning，尺寸 tiny / small / medium / large；带实验场与状态矩阵）；
- **组件批次一**（33 篇）：与 Ant Design 一侧同一份条文；Geist 一侧的演示用 shadcn/ui 组件（基于 Radix）：选择器、多选、单选、标签页、下拉菜单、对话框、气泡确认（Popover）、文字提示、进度条都是真组件，焦点、键盘和读屏由 Radix 负责；日期用原生输入，抽屉、分页、步骤条、面包屑这类还没有对应组件的用 Tailwind 按规范拼出结构；开关、标签（Badge）、警告提示带实验场；
- **设计模式 · 全局规则 / 原则 / 模板文档**（20 篇）：与 Ant Design 一侧同一份骨架条目，条文按 React 栈与 Geist 组件改写——提示方式换成 Toast、Note、Modal 与通知，表单标签在上、不带冒号，按钮变体用 Geist 的 default / secondary / tertiary / error；数值优先取 Vercel 的 Web Interface Guidelines（点击区至少 24px、移动端 44px，转圈与骨架延迟 150–300ms 出现并至少停留 300–500ms，提交前不禁用提交按钮，状态写进地址，只动 transform 与 opacity），Vercel 没给的是 pomaster 预设；
- **设计模式 · 体验管理 / 数据呈现**：体验管理 8 篇、数据呈现 3 篇（条文与 Ant Design 一侧相同，示例换成 React 与 Geist 组件；侧边栏尺寸与快捷键取 shadcn/ui Sidebar 的缺省值）；
- **工程规范**（15 篇）：前端架构（按 React 栈写：函数组件 + hooks、shadcn 组件源码进项目、TanStack Query、react-hook-form + zod、路由描述带 handle；路由库是项目决策位）、状态管理（服务端数据用 @tanstack/react-query、全局 store 用 Zustand）、性能（React 写法）与其余 12 篇，同 Ant Design 一侧。

- 组件：项目内的组件源码（`packages/studio-react/src/components/ui/`，shadcn/ui 起步，按 Geist 重新配色与定尺寸）+ Tailwind CSS 4；Vercel 的官方 Geist 组件包 `@vercel/geistcn` 在公开 npm 上装不到，能装后再评估替换。
- 颜色：Geist 色阶取自 `vercel.com/geist/vercel-brand.css`（浅色主题）；官方样式表只公开了彩色色阶的 100 / 400 / 700 / 900 / 1000 档，其余档位与青、紫、粉色阶在色板上标「未公开」。
- 排版：`text-heading-*`、`text-button-*`、`text-label-*`、`text-copy-*`（类名里的数字就是字号，见 `src/styles/geist.css`）；字体 Geist / Geist Mono 经 Google Fonts 加载（两个抽屉的外框也用它）。
- 图标：lucide-react。

官方没公开的（排版类的行高与字重、阴影值、内容区宽度、层级、列间距、表单库）是项目决策位；按钮的像素高度是 pomaster 的预设取值。其余 63 个骨架领域（组件）待补。

Geist 示例和 antd 组件页在同一个 React Storybook 里：Tailwind 不加全局 preflight，preflight 只作用在 `.geist-root` 里；两个画廊都把 antd 的 reset.css 放进最低的 CSS 层（`antd-reset`），规范页外框在它上面的 `std` 层，外框只用类选择器，不漏进实时示例。

## 原型转换（BA 的 spec + HTML）

BA 交来的 spec 与 HTML 原型结构、风格、样式各不相同，规则「工程规范 / 原型转换」规定读什么、怎么读，命令是 `pomaster prototype`：

1. `pomaster prototype ingest <page.html...> --spec <spec.md...> [--render]`：去掉表现读出四层——业务事实（字段、操作、状态、提示）、信息结构（页面、区域、分组、顺序）、交互意图（隐藏的弹窗、点什么打开什么）原样保留；样式、栅格、字体、组件长相丢掉；星号、红绿状态字、删除线、右对齐、固定列这类「表现里藏着的事实」翻译成语义（必填、语气、作废、数值列、冻结列）。产物在 `.pomaster/prototype/<名字>/`：大纲（`*.outline.md` 给人和 agent 读）、事实清单 `facts.json`（每条带出处）、冲突 `questions.json`（Question Gate 申报分类 + 默认口径：业务规则以 spec 为准，信息结构以 HTML 为准，呈现以规范为准）、UX 中间表示草稿 `ux-ir.json`（区域到规范模式与规则编号的初步映射）。`--render` 用 Playwright 渲染后再读（表格行、导航常是脚本生成的），并展开组件库的下拉记下选项。
2. agent 按规范重绘：布局、间距、字号、组件全部取本规范，原型的 class、样式、字体、颜色不进实现。
3. `pomaster prototype check <facts.json> <重绘后的页面.html> [--render]`：用同一个抽取器读重绘后的页面（任何组件库的 DOM 都按 ARIA 与语义元素读），与事实清单逐条对账：缺失、改动、新增、调序都为零才算完成，结果作为 verify 证据。

抽取器在 `packages/cli/src/prototype-extract.ts`（纯函数，零依赖），Storybook 的 `prototype.convert` 实验用同一份代码。

## 规范门禁（`pomaster design check`）

规范里 `enforcement: { kind: gate, check: … }` 的条文都有一条机器检查，实现在 `packages/cli/src/design-check.ts`。检查不自带阈值，阈值从条文参数读：antd 的间距阶梯是 `SPACING.SCALE` 的 4 / 8 / 12 / 16 / 24 / 32，Geist 是 `base: 0.25rem` 的整数倍；字阶、字重、栅格列数、允许的列间距、断点、禁用词、全局状态库同理。参数还是决策位时（如 Geist 的列间距），这条检查记「待定」，不按默认值判。

扫描是静态的：`.vue` 拆成模板、脚本、样式三段；`.tsx` / `.ts` 整体当脚本（JSX 在里面）；`.css` / `.scss` / `.less` 当样式；Tailwind 类只在「像类名串」的字符串里找。注释先抹掉，所以注释里的写法不算。它找的是源码写法上的违规；渲染出来的问题（对比度、溢出、真实交互）归 verify 的浏览器检查与原型事实对账。

- 扫哪里：缺省探测 `frontend/admin/src`、`frontend/public/src`（脚手架生成的位置）、`frontend/src`、`web/src`、`client/src`、`ui/src`、`app/src`、`apps/*/src`，都没有才用根下的 `src`；`--root` 指定。不扫依赖、构建产物、测试、故事文件和 `components/ui`（shadcn 一类按文件落进项目的组件库层）。
- 例外：在违规行或上一行写 `pomaster-design-ignore <检查编号>: 理由`。没写理由的豁免不生效并给警告。
- 老项目：`--write-baseline` 把现有违规按「检查 × 文件」记成存量（`.pomaster/baseline/frontend/design-check-baseline.json`），之后只拦超出存量的部分；违规减少时提示收紧，`--ignore-baseline` 看全量。
- 三处用同一个判卷：`pomaster design check`（命令面，违规退出码非 0）、`pomaster check --gates` 的 `GATE.DESIGN.STANDARD`（结果作为 GRN 入账；项目没落地规范时 `not_configured`）、closeout（项目落地了规范才适用，违规阻断）。

还没实现的两条（`markup.single-primary-button` 一个按钮区一个主按钮、`grid.row-sum` 一行跨度之和）要按元素结构判，先按评审执行，页面和孪生都标「待接入」。

后续：组件按类分批补齐（两边同步）。

## 错误码

| 码 | 含义 |
|---|---|
| `DESIGN_UNREADABLE` | 文件不存在或不是合法 YAML；所选设计体系还没有工具预设 |
| `DESIGN_SYSTEM_UNKNOWN` | `--system` 不在词表内 |
| `DESIGN_SCHEMA_UNSUPPORTED` | `schema` 不是 `pomaster.design-standard/v1` |
| `DESIGN_SHAPE` / `DESIGN_UNKNOWN_KEY` | 缺必填项、类型不对、值不在词表、未知键 |
| `DESIGN_IDENTIFIER` / `DESIGN_DUPLICATE` | 编号不合规（规则编号须带领域前缀）、键或编号重复 |
| `DESIGN_PARAM_SOURCE` | 参数没有来源、写了多种来源、定值没带出处 |
| `DESIGN_SOURCE_UNKNOWN` / `DESIGN_TOKEN_UNKNOWN` / `DESIGN_SPEC_UNKNOWN` | 出处、token、规格键没有登记或不存在 |
| `DESIGN_ANCHOR_MISSING` | 锚点原文在硬规范里找不到 |
| `DESIGN_CHECK_UNKNOWN` | 门禁检查不在词表内 |
| `DESIGN_LAB_UNKNOWN` | 实验不在实验词表内 |
| `DESIGN_EXAMPLE` | 实时内容形态不对，或引用了不存在 / 待定的参数与 token |
| `DESIGN_AREA_SKELETON` | 领域或规则与统一骨架不一致（标题、分区、前缀、顺序） |
| `DESIGN_SKELETON_SHAPE` | 骨架本身的形状不对 |
| `DESIGN_CHECK_VIOLATIONS` | `design check`：源码违反门禁条文（超出存量基线的部分） |
| `DESIGN_STANDARD_INVALID` | `design check`：规范没通过校验，无法据此判卷 |
| `DESIGN_BASELINE_UNREADABLE` | `design check`：存量基线文件坏了 |
| `DESIGN_ALREADY_ADOPTED` / `DESIGN_NOT_ADOPTED` | `design adopt`：项目已有规范（`--force` 覆盖）；`design set` / `update spec`：项目还没采用规范 |
| `DESIGN_SET_ACTOR` / `DESIGN_SET_TARGET` | `design set`：决定人不是 `human:<名字>`；规则或参数不存在 |
| `SPEC_UPDATE_TEXT` / `SPEC_UPDATE_ACTOR` / `SPEC_UPDATE_UNRECOGNIZED` / `SPEC_UPDATE_TARGET` | `update spec`：原文太短；记录人不合规；认不出去处；指定的领域 / 主题文档 / 编号不可用 |

警告：`DESIGN_DECISION_PENDING`（待定参数清单）、`DESIGN_CHECK_PENDING`（检查待接入的门禁规则）、`DESIGN_AREA_UNCOVERED` / `DESIGN_TOPIC_UNCOVERED`（骨架里还没写的领域 / 条目）、`DESIGN_AREA_EXTRA` / `DESIGN_TOPIC_EXTRA`（骨架外的领域 / 条目）、`DESIGN_SKELETON_UNAVAILABLE`、`DESIGN_TOKENS_UNAVAILABLE`、`DESIGN_SPECS_UNAVAILABLE`；`design check` 另有 `DESIGN_SUPPRESSION_REASON_MISSING`、`DESIGN_BASELINE_TIGHTENABLE`、`DESIGN_CHECK_ROOT_MISSING`、`DESIGN_CHECK_TRUNCATED`、`DESIGN_CHECK_FILE_SKIPPED`。
