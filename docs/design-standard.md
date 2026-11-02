# 前端设计规范 `pomaster.design-standard/v1`

前端设计规范是开发必须遵守的标准，不是参考。它只有一份结构化源，从这份源同时生成三样东西，三样都盖同一个规范指纹：

| 给谁 | 是什么 | 在哪里 |
|---|---|---|
| 人 | Storybook「规范」分区：每条规则的条文、数值与出处、执行方式、实时渲染的「这样做 / 别这样做」 | 侧栏最上方「规范」；在线版见 README「组件画廊」 |
| AI | 孪生：结构化 JSON + 一条规则一节的 Markdown 摘要 | `packages/studio/twin/design-standard.json`、`design-standard.md` |
| AI / 脚本 | 命令行视图，按领域或规则过滤 | `pomaster design show [--area <key>] [--rule <id>] [--json]` |

规范源：工具预设按设计体系各一份，在 `packages/cli/seeds/design-standards/<体系>.yaml`（当前有 `antd.yaml`；预设不直接播种）；项目自己的规范在 `.pomaster/baseline/frontend/design-standard.yaml`。命令优先用项目规范，项目没有时用预设（`--system antd|geist` 选体系，缺省 antd）。

## 怎么改

人和 AI 走同一条路，页面和孪生都不手改：

1. 编辑规范源：改条文、改数值、补示例；
2. `pomaster design validate`：所有问题一次报全；
3. `node packages/studio/run.mjs generate`：Storybook 页面与 AI 孪生一起重新生成。

孪生没重新生成时，`packages/studio/tests/standard.spec.ts` 让 CI 失败；规范源或 CLI 种子改动合入 main 后，Storybook 自动重新发布。

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
  - key: grid               # 领域键
    title_zh: 栅格
    group: foundations      # foundations / patterns.global / patterns.principles / patterns.templates / engineering
    prefix: GRID            # 规则编号前缀
    summary_zh: 24 列栅格……
    rules:
      - id: GRID.GUTTER
        title_zh: 列间距固定为 16 或 24
        statement_zh: 列间距是固定值，不随窗口缩放，只取 16 或 24……
        surfaces: [admin]   # 可选；缺省两个面都适用
        params:
          gutter: { value: [16, 24], unit: px, source: SRC.ANTD.SPEC.BASICS, label_zh: 允许的列间距 }
          gap: { token: spacing.lg }                     # 引用 design-tokens
          padding: { decision: 内容区内边距取多少？ }      # 项目决策位
        anchors:
          - { spec: ui, quote: 响应式断点和密度切换有验收矩阵。 }
        enforcement: { kind: gate, check: grid.gutter-allowed }   # 或 { kind: review }
        examples:
          - { kind: do, title_zh: gutter 取 16, template: '<a-row :gutter="p.gutter[0]">…</a-row>' }
          - { kind: dont, title_zh: 照截图量出来的 13px, code: '.card { padding: 13px; }', lang: css }
```

未知键一律报错（闭世界）。

### 数值：三种来源选一种

| 写法 | 含义 |
|---|---|
| `token: <点分路径>` | 取 `design-tokens.yaml` 的值；token 还是 UNKNOWN 时这个参数待定 |
| `value: … + source: SRC.*` | 带出处的定值；出处必须在 `sources` 登记（标题、链接、核实日期）。仓库内出处写 `repo:<路径>` |
| `decision: <问题>` | 项目决策位：框架不替项目选，可附 `candidates` 供参考 |

定值不能写 UNKNOWN，没定的写成决策位。条文用自己的话写成可执行条款；官方文档只取数值与规则要点，不搬原文。

### 锚点：成文规则只有一个来源

`anchors` 把规则挂到主题硬规范（`specs/hard/themes/*.md`）的原文条款上，`quote` 必须逐字摘自原文。校验时逐条核对原文仍在，原文改了而锚点没改会报 `DESIGN_ANCHOR_MISSING`。

### 执行方式

- `gate`：机器门禁，违反即拦截。`check` 必须在检查词表内（`packages/cli/src/design-standard.ts` 的 `DESIGN_CHECKS`）；检查还没接入门禁时，规则先按评审执行，页面和孪生都会标出来。
- `review`：机器查不出来的规则，评审时逐条核对。

### 示例

- `template`：Vue 模板，Storybook 里用 antdv 实时渲染（Ant Design 体系）。模板里 `p` 是本条规则的参数，`t` 是 token 表（如 `t['spacing.lg']`）；只能引用已定的值，不能有 `<script>` / `<style>`。
- `jsx`：JSX 片段，React 侧实时渲染（Geist 体系）。
- `code` + `lang`：只展示的代码片段（`vue` / `ts` / `css` / `html`）。

`kind` 只有 `do`（这样做）和 `dont`（别这样做）。

## 当前预设（Ant Design · Vue）

28 个领域、118 条规则，设计部分的目录与 Ant Design 设计规范一致：

- **基础**（6 篇）：布局、栅格、间距、字体与富文本、标题层级、图标；
- **设计模式 · 全局规则**（8 篇）：反馈、导航、数据录入、数据展示、数据格式、文案、按钮、数据列表；
- **设计模式 · 原则**（10 篇）：亲密性、对齐、对比、重复、直截了当、足不出户、简化交互、提供邀请、巧用过渡、即时反应；
- **设计模式 · 模板文档**（2 篇）：数据可视化页、详情页；
- **工程规范**（2 篇）：状态管理（属主、查询缓存、Pinia、URL 状态、接口客户端、清理、表单模型、浏览器存储）、性能（预算、按需加载、大列表、输入防抖、并行初始化、渲染计算、度量口径）。

数值取自 Ant Design 设计规范与 ant-design-vue 主题源码，条文用自己的话写成可执行条款；官方没给数值的（内容区内边距、区块间距、内容最大宽度、层级 token、用户侧图标库、查询缓存库、首屏与分包体积、虚拟滚动阈值、防抖间隔）是项目决策位。26 条规则由机器门禁执行（检查接入前按评审执行），其余在评审时核对。

后续：React / Geist 预设、规范门禁接入。

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
| `DESIGN_EXAMPLE` | 示例形态不对，或实时示例引用了不存在 / 待定的参数与 token |

警告：`DESIGN_DECISION_PENDING`（待定参数清单）、`DESIGN_CHECK_PENDING`（检查待接入的门禁规则）、`DESIGN_TOKENS_UNAVAILABLE`、`DESIGN_SPECS_UNAVAILABLE`。
