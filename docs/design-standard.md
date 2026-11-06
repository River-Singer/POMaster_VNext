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

**架构锁定以后**：项目定下前端架构、规范落地到 `.pomaster/baseline/frontend/design-standard.yaml` 后，总 Storybook 只留对应的抽屉。编排脚本 `scripts/studio.mjs` 读 `POMASTER_STUDIO_PROJECT` 指向的项目里那份规范的 `meta.design_system`；也可以用 `POMASTER_STUDIO_SYSTEM=antd|geist` 直接指定（规则见 `packages/studio/scripts/lib/drawers.mjs`）。

## 怎么改

人和 AI 走同一条路，页面和孪生都不手改：

1. 编辑规范源：改条文、改数值、补演示与示例。要加领域或条目，先改骨架，再分别补两份预设；
2. `pomaster design validate [--system geist]`：所有问题一次报全；
3. 按上表重新生成：Storybook 页面与 AI 孪生一起更新。

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

定值不能写 UNKNOWN，没定的写成决策位。条文用自己的话写成可执行条款；官方文档只取数值与规则要点，不搬原文。规范指纹 = 规范源 +（引用了 token 时）token 表 + 统一骨架。

### 锚点：成文规则只有一个来源

`anchors` 把规则挂到主题硬规范（`specs/hard/themes/*.md`）的原文条款上，`quote` 必须逐字摘自原文。校验时逐条核对原文仍在，原文改了而锚点没改会报 `DESIGN_ANCHOR_MISSING`。

### 执行方式

- `gate`：机器门禁，违反即拦截。`check` 必须在检查词表内（`packages/cli/src/design-standard.ts` 的 `DESIGN_CHECKS`）；检查还没接入门禁时，规则先按评审执行，页面和孪生都会标出来。
- `review`：机器查不出来的规则，评审时逐条核对。

### 展示块

规则可以带 `showcase`，页面上放在条文之后、「这样做 / 别这样做」之前：

| `kind` | 呈现 | 写法 |
|---|---|---|
| `demo` | 演示卡片：舞台 + 「显示代码」 | `title_zh`、可选 `description_zh`，实时内容 `template` 或 `jsx` |
| `specimen` | 对照表：示例｜名称（类名 / token）｜用途 | `rows: [{ name, usage_zh, template / jsx / sample_zh }]`；`sample_zh` 是简写：用 `name` 作类名渲染这段文字（如 Geist 的排版类） |
| `palette` | 色板：每个色阶一行色块，附色值表 | `scales: [{ name, label_zh, swatches: [{ name, value / token / pending_zh, usage_zh }] }]`；有定值时写 `source` |
| `lab` | 实验：可操作的小实验 + 状态检查器 | `lab` 取实验词表 `DESIGN_LABS`：`state.url-filters`（筛选进 URL）、`state.query-cache`（查询缓存与失效）、`state.race`（迟到的响应不写回） |

实验在两个画廊共用一份实现（`packages/studio/src/standard/labs.ts`：小状态机 + 返回节点树的视图），假服务端用内存数据与定时器；缓存实验的缓存是演示用的简化实现，行为对齐 TanStack Query。新实验要先在 `DESIGN_LABS` 登记，再在 `labs.ts` 实现，两个画廊的测试对账。

### 实时内容

示例、演示、对照表的行都可以是实时内容：

- `template`：Vue 模板，Vue 画廊里用 antdv 实时渲染（Ant Design 体系），包在 `.antd-live` 里（antd 的字体、字色与行高）。模板里 `p` 是本条规则的参数，`t` 是 token 表（如 `t['spacing.lg']`）；只能引用已定的值，不能有 `<script>` / `<style>`。
- `jsx`：JSX 片段，React 画廊里实时渲染（Geist 体系），包在 `.geist-root` 里。同样用 `p` / `t` 取值；只能用 `packages/studio-react/src/components/ui/` 里登记的组件（Button、ButtonLink、Badge、Card、Input、Label、Alert、Separator、Switch、Skeleton）和 lucide-react 图标（`XxxIcon` 命名），用了没登记的组件生成就失败；不能写 `import` / `export`。Geist 色阶在 Tailwind 里是 `ds-` 前缀的颜色类（`bg-ds-gray-100`、`text-ds-gray-900`）。
- `code` + `lang`：只展示的代码片段（`vue` / `ts` / `tsx` / `css` / `html`）。

一个体系只收自己的实时内容形态：Ant Design 预设写 `template`，Geist 预设写 `jsx`。示例的 `kind` 只有 `do`（这样做）和 `dont`（别这样做）。

## 当前预设（Ant Design · Vue）

32 个领域、150 条规则：

- **基础**（9 篇）：色彩、字体、标题层级、图标、材质、布局、栅格、间距、动效；
- **组件 · 通用**：按钮（何时用、变体、危险操作、尺寸、形状、搭配图标、纯图标按钮、加载、禁用、链接按钮、宽度、表单提交、文案；带实验场与状态矩阵）；
- **设计模式 · 全局规则**（8 篇）：反馈、导航、数据录入、数据展示、数据格式、文案、按钮、数据列表；
- **设计模式 · 原则**（10 篇）：亲密性、对齐、对比、重复、直截了当、足不出户、简化交互、提供邀请、巧用过渡、即时反应；
- **设计模式 · 模板文档**（2 篇）：数据可视化页、详情页；
- **工程规范**（2 篇）：状态管理（属主、服务端数据用 @tanstack/vue-query、全局 store 用 Pinia、URL 状态、请求入口、缓存 key 与失效、清理与竞态、表单模型、浏览器存储；三个实验）、性能。

数值取自 Ant Design 设计规范与 ant-design-vue 主题源码（色板由 @ant-design/colors 的算法从种子色派生）；官方没给数值的是项目决策位。其余 96 个骨架领域（主要是组件）待补。

## 当前预设（Vercel Geist · React）

11 个领域、71 条规则：

- **基础**（9 篇）：色彩（Geist 色阶与每档用途）、字体（四组排版类）、标题层级、图标（含尺寸）、材质、布局、栅格、间距、动效；
- **组件 · 通用**：按钮（与 Ant Design 一侧同样 13 条；变体 default / secondary / tertiary / error / warning，尺寸 tiny / small / medium / large；带实验场与状态矩阵）；
- **工程规范**：状态管理（服务端数据用 @tanstack/react-query、全局 store 用 Zustand，其余同 Ant Design 一侧；三个实验）。

- 组件：项目内的组件源码（`packages/studio-react/src/components/ui/`，shadcn/ui 起步，按 Geist 重新配色与定尺寸）+ Tailwind CSS 4；Vercel 的官方 Geist 组件包 `@vercel/geistcn` 在公开 npm 上装不到，能装后再评估替换。
- 颜色：Geist 色阶取自 `vercel.com/geist/vercel-brand.css`（浅色主题）；官方样式表只公开了彩色色阶的 100 / 400 / 700 / 900 / 1000 档，其余档位与青、紫、粉色阶在色板上标「未公开」。
- 排版：`text-heading-*`、`text-button-*`、`text-label-*`、`text-copy-*`（类名里的数字就是字号，见 `src/styles/geist.css`）；字体 Geist / Geist Mono 经 Google Fonts 加载（两个抽屉的外框也用它）。
- 图标：lucide-react。

官方没公开的（排版类的行高与字重、阴影值、内容区宽度、层级、列间距、表单库）是项目决策位；按钮的像素高度是 pomaster 的预设取值。其余 117 个骨架领域待补。

Geist 示例和 antd 组件页在同一个 React Storybook 里：Tailwind 不加全局 preflight，preflight 只作用在 `.geist-root` 里；两个画廊都把 antd 的 reset.css 放进最低的 CSS 层（`antd-reset`），规范页外框在它上面的 `std` 层，外框只用类选择器，不漏进实时示例。

后续：组件按类分批补齐（两边同步），Geist 的设计模式与性能篇，规范门禁接入。

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

警告：`DESIGN_DECISION_PENDING`（待定参数清单）、`DESIGN_CHECK_PENDING`（检查待接入的门禁规则）、`DESIGN_AREA_UNCOVERED` / `DESIGN_TOPIC_UNCOVERED`（骨架里还没写的领域 / 条目）、`DESIGN_AREA_EXTRA` / `DESIGN_TOPIC_EXTRA`（骨架外的领域 / 条目）、`DESIGN_SKELETON_UNAVAILABLE`、`DESIGN_TOKENS_UNAVAILABLE`、`DESIGN_SPECS_UNAVAILABLE`。
