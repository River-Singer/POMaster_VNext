/**
 * design-standard.ts —— 前端设计规范 `pomaster.design-standard/v1`：结构、校验、归一化、指纹。
 *
 * 规范是 Storybook「规范」分区与 AI 孪生的单一结构化源（D-S7：AI 改的是这份源，页面与孪生同源
 * 重新生成，页面不手改）。一份规范 = 若干领域（布局、栅格、间距、字体与富文本、标题层级、图标、
 * 导航……），每个领域若干条规则；每条规则：
 *
 * - 条文用自己的话写，可执行、可检查；
 * - 数值三种来源，必选其一：引用 design-tokens（`token`）、带出处的定值（`value` + `source`）、
 *   项目决策位（`decision`，框架不替项目选）；
 * - 可锚定到主题硬规范里的原文条款（`anchors`：文档 + 原文片段）——成文规则只有一个来源，
 *   校验时逐条确认片段确实存在，防止两边漂移；
 * - 执行方式二选一：机器门禁（`gate` + 检查编号，D-S8：机器可查的规则直接拦）或人工评审（`review`）；
 * - 正反示例：`template` 是 Vue 模板、`jsx` 是 JSX 片段（Storybook 实时渲染，里面 `p` 是本条规则的
 *   参数、`t` 是 token 表），`code` 是只展示的代码片段；
 * - 展示块（`showcase`）：演示卡片、「示例｜名称｜用途」对照表、色板，规范页把它们放在条文之后。
 *
 * 领域与条目按统一骨架（seeds/design-standards/skeleton.yaml）组织：两套设计体系的规范页目录一致，
 * 某套体系还没写的领域或条目显示为「待补」，项目锁定前端架构后只留一套。
 *
 * 本模块只读、零写入；未知键一律报错（闭世界），所有问题一次报全。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";

export const DESIGN_STANDARD_SCHEMA = "pomaster.design-standard/v1";

/** 项目规范源在 `.pomaster/` 下的相对位置（也是指纹用的逻辑路径）。 */
export const DESIGN_STANDARD_RELATIVE = "baseline/frontend/design-standard.yaml";
/** 工具预设目录（包内 seeds 下）：每套设计体系一份 `<design_system>.yaml`，不直接播种。 */
export const DESIGN_STANDARD_PRESETS_DIR = "design-standards";
/** 同目录的 token 合同（规则参数 `token` 引用的值来源）。 */
export const DESIGN_TOKENS_RELATIVE = "baseline/frontend/design-tokens.yaml";

/** Storybook 分区（与 Ant Design 设计规范的目录对应，另加工程规范）。 */
export const DESIGN_AREA_GROUPS = {
  foundations: "基础",
  "components.general": "组件/通用",
  "components.layout": "组件/布局",
  "components.navigation": "组件/导航",
  "components.entry": "组件/数据录入",
  "components.display": "组件/数据展示",
  "components.feedback": "组件/反馈",
  "components.other": "组件/其他",
  "patterns.global": "设计模式/全局规则",
  "patterns.principles": "设计模式/原则",
  "patterns.templates": "设计模式/模板文档",
  "patterns.experience": "设计模式/体验管理",
  "patterns.data": "设计模式/数据呈现",
  engineering: "工程规范",
} as const;
export type DesignAreaGroup = keyof typeof DESIGN_AREA_GROUPS;

/** 统一骨架文件（工具 seeds 下的相对位置）：两套设计体系规范目录的并集。 */
export const DESIGN_SKELETON_RELATIVE = "design-standards/skeleton.yaml";
export const DESIGN_SKELETON_SCHEMA = "pomaster.design-skeleton/v1";

export interface DesignSkeletonTopic {
  readonly id: string;
  readonly title_zh: string;
}

export interface DesignSkeletonArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group: DesignAreaGroup;
  readonly prefix: string;
  readonly summary_zh: string;
  /** 组件领域：两套体系各自对应的现成组件（空表 = 该体系没有，需要自行设计）；非组件领域为 null。 */
  readonly counterparts: Readonly<Record<DesignSystem, readonly string[]>> | null;
  readonly topics: readonly DesignSkeletonTopic[];
}

/**
 * 统一骨架：两套设计体系（Ant Design / Vercel Geist）规范目录的并集——领域、领域下的条目、组件清单。
 * 领域键、标题、分区、规则前缀、条目编号与标题、先后顺序在两套规范里一致，Storybook 里两个抽屉的目录
 * 因此完全相同；某套体系没写的领域或条目显示「待补」。
 */
export interface DesignSkeleton {
  readonly areas: readonly DesignSkeletonArea[];
}

/**
 * 设计体系：antd = Ant Design（Vue 栈，ant-design-vue 实现，示例为 Vue 模板）；
 * geist = Vercel Geist（React 栈，shadcn/ui + Tailwind 实现，示例为 JSX）。
 */
export const DESIGN_SYSTEMS = {
  antd: { title_zh: "Ant Design", framework: "vue", example_field: "template" },
  geist: { title_zh: "Vercel Geist", framework: "react", example_field: "jsx" },
} as const;
export type DesignSystem = keyof typeof DESIGN_SYSTEMS;

export const DESIGN_SURFACES = ["admin", "public"] as const;
export type DesignSurface = (typeof DESIGN_SURFACES)[number];

export const DESIGN_PARAM_UNITS = ["px", "em", "percent", "ratio", "count", "chars", "ms", "none"] as const;
export type DesignParamUnit = (typeof DESIGN_PARAM_UNITS)[number];

export const DESIGN_EXAMPLE_LANGS = ["vue", "ts", "tsx", "css", "html"] as const;
export type DesignExampleLang = (typeof DESIGN_EXAMPLE_LANGS)[number];

/** 机器门禁检查词表。`active` = 门禁已实现并接入；未接入的检查在规范页标「待接入」。 */
export interface DesignCheckSpec {
  readonly id: string;
  readonly title_zh: string;
  readonly description_zh: string;
  readonly active: boolean;
}

export const DESIGN_CHECKS: readonly DesignCheckSpec[] = [
  { id: "style.no-raw-color", title_zh: "不写裸色值", description_zh: "样式与内联 style 里不得出现 #hex / rgb() / hsl() 色值，颜色只经 token 取得", active: true },
  { id: "style.spacing-scale", title_zh: "间距在阶梯内", description_zh: "margin / padding / gap 的 px 值必须是间距阶梯里的值", active: true },
  { id: "style.font-size-scale", title_zh: "字号在字阶内", description_zh: "font-size 必须是字阶里的值", active: true },
  { id: "style.font-weight-allowed", title_zh: "字重在允许集内", description_zh: "font-weight 只能取规范允许的字重", active: true },
  { id: "style.font-family-token", title_zh: "字体族取 token", description_zh: "font-family 只能引用规范字体族，不得引入其他字体", active: true },
  { id: "style.breakpoint-allowed", title_zh: "断点取规范值", description_zh: "媒体查询断点只能取断点 token", active: true },
  { id: "style.no-raw-z-index", title_zh: "z-index 取层级 token", description_zh: "z-index 不得写死数值", active: true },
  { id: "markup.single-h1", title_zh: "每个页面视图一个 h1", description_zh: "页面视图内一级标题至多一个", active: true },
  { id: "markup.heading-order", title_zh: "标题不跳级", description_zh: "标题层级逐级下降，不得从 h1 直接到 h3", active: true },
  { id: "markup.heading-level-max", title_zh: "应用界面标题不超过三级", description_zh: "应用界面（非内容页）标题层级不超过 h3", active: true },
  { id: "markup.icon-button-label", title_zh: "纯图标按钮有可访问名称", description_zh: "只有图标的按钮必须带 aria-label 或等效名称", active: true },
  { id: "grid.span-range", title_zh: "栅格跨度合法", description_zh: "栅格的跨度与偏移必须是 0 到栅格总列数之间的整数（antd 的 a-col 是 24 列，Geist 是 12 列）", active: true },
  { id: "grid.row-sum", title_zh: "一行不超过栅格总列数", description_zh: "同一行里静态跨度之和不超过栅格总列数（antd 24、Geist 12）", active: false },
  { id: "grid.gutter-allowed", title_zh: "gutter 取规范值", description_zh: "栅格的列间距只能取规范允许的值", active: true },
  { id: "icon.single-library", title_zh: "只用一套图标库", description_zh: "图标只能从规范指定的图标库引入", active: true },
  { id: "markup.single-primary-button", title_zh: "一个按钮区一个主按钮", description_zh: "同一个按钮区（同一父容器内的按钮组）里主按钮至多一个（antd 是 type=primary，Geist 是 variant=default）", active: false },
  { id: "text.no-literal-copy", title_zh: "界面文字走文案字典", description_zh: "模板、组件、脚本里不写死自然语言文本，统一经 i18n key 取文案", active: true },
  { id: "text.banned-terms", title_zh: "不用禁用词", description_zh: "文案字典与模板里不出现规范列出的错别字和弃用词（如「其它」「登陆」）", active: true },
  { id: "state.store-library", title_zh: "全局状态库只用规定的一个", description_zh: "Vue 只用 Pinia、React 只用 Zustand，不引入其他全局状态库", active: true },
  { id: "state.no-direct-request", title_zh: "组件不直接发请求", description_zh: "组件与页面里不直接调用 fetch / axios，经生成的接口客户端", active: true },
  { id: "perf.lazy-load", title_zh: "路由与重组件按需加载", description_zh: "路由组件用动态 import；应用入口不同步引入重型依赖", active: true },
  { id: "perf.no-full-library-import", title_zh: "组件库按需引入", description_zh: "不整包注册或引入组件库（如 app.use(Antd)、全量引入 Vant、整包引入图标库）", active: true },
  { id: "format.no-local-pattern", title_zh: "日期数字走格式化注册表", description_zh: "页面里不手拼日期格式串、不硬编码货币符号，统一经格式化注册表输出", active: true },
  { id: "style.radius-token", title_zh: "圆角取规范档位", description_zh: "border-radius 只用圆角 token 或规范的圆角类，不写档位外的值", active: true },
  { id: "style.shadow-token", title_zh: "阴影取规范层级", description_zh: "box-shadow 只用层级阴影 token 或规范的阴影类，不手写阴影", active: true },
  { id: "motion.transform-only", title_zh: "过渡只动 transform 与透明度", description_zh: "transition / animation 不作用于 width、height、top、left、margin 等触发重排的属性", active: true },
  { id: "motion.reduced-motion", title_zh: "关键帧动画有减少动效分支", description_zh: "定义了 @keyframes 的样式文件同时写 prefers-reduced-motion 分支", active: true },
  { id: "security.no-unsafe-html", title_zh: "不进危险渲染", description_zh: "不用 v-html / innerHTML / dangerouslySetInnerHTML，富文本只经登记的净化组件输出", active: true },
  { id: "security.safe-link", title_zh: "外链与跳转安全", description_zh: "target=_blank 的链接带 rel=noopener noreferrer；window.open 带 noopener；不出现 javascript: 链接", active: true },
  { id: "security.no-eval", title_zh: "不用动态执行", description_zh: "不用 eval、new Function、字符串形式的 setTimeout / setInterval", active: true },
  { id: "security.no-token-storage", title_zh: "凭据不进浏览器存储", description_zh: "localStorage / sessionStorage / IndexedDB 不写入 token、session、refresh 一类凭据键", active: true },
  { id: "error.no-empty-catch", title_zh: "不吞错误", description_zh: "不写空 catch，catch 里不能只有 console 输出", active: true },
  { id: "guard.route-meta", title_zh: "路由声明访问要求", description_zh: "路由表的每一项都声明访问要求（meta / handle 里的 auth、permission）", active: true },
];

const CHECK_IDS = new Set(DESIGN_CHECKS.map((check) => check.id));

/**
 * 实验词表：规范页里可以嵌入的可操作小实验（带状态检查器，演示看不见的工程规则）。两个画廊
 * （Vue / React）都要实现每一个实验，对账测试钉住。
 */
export interface DesignLabSpec {
  readonly id: string;
  readonly title_zh: string;
  readonly description_zh: string;
}

export const DESIGN_LABS: readonly DesignLabSpec[] = [
  { id: "state.url-filters", title_zh: "筛选条件进 URL", description_zh: "改筛选与页码时 URL 同步更新；「刷新页面」后从 URL 恢复出同样的视图" },
  { id: "state.query-cache", title_zh: "查询缓存与失效", description_zh: "同样条件命中缓存、过期后后台刷新；新建一条后让对应 key 失效并重新拉取" },
  { id: "state.race", title_zh: "迟到的响应不写回", description_zh: "连续输入发出多个请求，响应乱序到达；只有最新一次的结果写进界面" },
  { id: "context.restore", title_zh: "返回列表时恢复位置", description_zh: "从列表进详情再返回，页码、筛选与选中行原样恢复" },
  { id: "loading.delay", title_zh: "加载条的延迟出现与最短停留", description_zh: "快请求不出现加载条，慢请求的加载条出现后至少停留一段时间" },
  { id: "error.boundary", title_zh: "区块级错误边界", description_zh: "一个区块出错只替换这一块并能重试，页面其余部分照常可用" },
  { id: "guard.route", title_zh: "保护页与回跳", description_zh: "访客去登录后回到原页面，无权限看到 403，站外回跳地址被拒绝" },
  { id: "async.retry", title_zh: "重试与退避", description_zh: "可重试的错误按指数退避重试并有上限；不幂等的提交不自动重试" },
  { id: "concurrency.pool", title_zh: "在途合并与并发上限", description_zh: "同一份数据的并发请求合并为一个；批量任务经并发池，同时进行的数量有上限" },
  { id: "click.guard", title_zh: "防重复点击", description_zh: "连点提交只发出一个请求，并复用同一个幂等键" },
  { id: "prototype.convert", title_zh: "原型转换与事实对账", description_zh: "BA 原型去掉表现后抽出事实；按规范重绘的页面用同一个抽取器对账，缺失、改动、调序逐条报出" },
];

const LAB_IDS = new Set(DESIGN_LABS.map((lab) => lab.id));

export type DesignIssueSeverity = "error" | "warning";

export interface DesignStandardIssue {
  readonly severity: DesignIssueSeverity;
  readonly code: string;
  /** 规范内路径（如 `areas[2].rules[0].params.gutter`）；文件级问题为空串。 */
  readonly path: string;
  readonly message: string;
  readonly hint: string;
}

export interface DesignSource {
  readonly id: string;
  readonly title_zh: string;
  readonly url: string;
  readonly retrieved: string;
  readonly note_zh: string | null;
}

export interface DesignParam {
  readonly key: string;
  readonly label_zh: string | null;
  readonly kind: "token" | "value" | "decision";
  /** token 引用路径（kind=token）。 */
  readonly token: string | null;
  /** 解析后的值：token 取 token 表的值；value 取定值；决策位或 token 仍为 UNKNOWN 时为 null。 */
  readonly value: unknown;
  readonly unit: DesignParamUnit;
  readonly source: string | null;
  /** 决策位要回答的问题（kind=decision）。 */
  readonly decision_zh: string | null;
  /** 决策位的候选值（只供参考，不是缺省答案）。 */
  readonly candidates: readonly unknown[] | null;
  readonly note_zh: string | null;
  /** 值还没定（决策位，或引用的 token 仍是 UNKNOWN）。 */
  readonly pending: boolean;
}

export interface DesignAnchor {
  readonly spec: string;
  /** 硬规范文档相对 `specs/hard/` 的路径。 */
  readonly doc: string;
  readonly quote: string;
}

export type DesignEnforcement =
  | { readonly kind: "review" }
  | { readonly kind: "gate"; readonly check: string; readonly active: boolean };

export interface DesignExample {
  readonly kind: "do" | "dont";
  readonly title_zh: string;
  readonly note_zh: string | null;
  /** Vue 模板（antd 体系，Storybook 实时渲染）。template / jsx / code 三选一。 */
  readonly template: string | null;
  /** JSX 片段（geist 体系，Storybook 实时渲染）。 */
  readonly jsx: string | null;
  /** 只展示的代码片段（配 lang）。 */
  readonly code: string | null;
  readonly lang: DesignExampleLang | null;
}

/** 演示卡片：一块实时渲染的演示（如按钮的全部变体），底部可展开代码。 */
export interface DesignShowcaseDemo {
  readonly kind: "demo";
  readonly title_zh: string;
  readonly description_zh: string | null;
  readonly template: string | null;
  readonly jsx: string | null;
}

/** 对照表的一行：实时示例 + 名称（类名或 token）+ 用途。sample_zh 是简写：用 name 作类名渲染这段文字。 */
export interface DesignSpecimenRow {
  readonly name: string;
  readonly usage_zh: string | null;
  readonly sample_zh: string | null;
  readonly template: string | null;
  readonly jsx: string | null;
}

/** 「示例｜名称｜用途」对照表（如字阶、材质）。 */
export interface DesignShowcaseSpecimen {
  readonly kind: "specimen";
  readonly title_zh: string | null;
  readonly description_zh: string | null;
  /** 名称列的表头（缺省「名称」；类名体系写「类名」，token 体系写「token」）。 */
  readonly name_label_zh: string | null;
  readonly rows: readonly DesignSpecimenRow[];
}

/** 色板里的一格：定值（带色板的出处）、token、或未公开（写明原因）。 */
export interface DesignSwatch {
  readonly name: string;
  readonly kind: "value" | "token" | "pending";
  readonly token: string | null;
  /** 解析后的颜色；未公开或 token 仍为 UNKNOWN 时为 null。 */
  readonly value: string | null;
  readonly pending_zh: string | null;
  readonly usage_zh: string | null;
}

export interface DesignPaletteScale {
  readonly name: string;
  readonly label_zh: string | null;
  readonly swatches: readonly DesignSwatch[];
}

/** 色板：若干色阶，每阶一行色块。 */
export interface DesignShowcasePalette {
  readonly kind: "palette";
  readonly title_zh: string | null;
  readonly description_zh: string | null;
  /** 定值色块的出处（有定值时必填）。 */
  readonly source: string | null;
  readonly scales: readonly DesignPaletteScale[];
}

/** 实验：嵌入一个可操作的小实验（实验编号取自 DESIGN_LABS）。 */
export interface DesignShowcaseLab {
  readonly kind: "lab";
  readonly lab: string;
  readonly title_zh: string;
  readonly description_zh: string | null;
}

export type DesignShowcaseBlock = DesignShowcaseDemo | DesignShowcaseSpecimen | DesignShowcasePalette | DesignShowcaseLab;

/** 组件实验场里的一个属性：枚举（下拉）或布尔（开关）；取值只列规范允许的。 */
export type DesignPlaygroundProp =
  | { readonly key: string; readonly kind: "options"; readonly options: readonly string[]; readonly default: string }
  | { readonly key: string; readonly kind: "boolean"; readonly default: boolean };

/** 组件领域的实验场与状态矩阵（Storybook 控件面板 + 变体网格）。 */
export interface DesignPlayground {
  /** 组件：Vue 画廊写 antdv 标签（如 a-button），React 画廊写登记过的组件名（如 Button）。 */
  readonly component: string;
  /** 组件里的文字。 */
  readonly text_zh: string | null;
  readonly props: readonly DesignPlaygroundProp[];
  /** 状态矩阵：行、列各取一个枚举属性。 */
  readonly matrix: { readonly rows: string; readonly columns: string } | null;
}

export interface DesignRule {
  readonly id: string;
  readonly title_zh: string;
  readonly statement_zh: string;
  readonly rationale_zh: string | null;
  readonly surfaces: readonly DesignSurface[];
  readonly params: readonly DesignParam[];
  readonly anchors: readonly DesignAnchor[];
  readonly enforcement: DesignEnforcement;
  /** 展示块（演示卡片 / 对照表 / 色板），页面上放在条文之后、正反示例之前。 */
  readonly showcase: readonly DesignShowcaseBlock[];
  readonly examples: readonly DesignExample[];
}

export interface DesignArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group: DesignAreaGroup;
  readonly group_title_zh: string;
  readonly prefix: string;
  readonly summary_zh: string;
  /** 组件领域的实验场与状态矩阵；其他领域为 null。 */
  readonly playground: DesignPlayground | null;
  readonly rules: readonly DesignRule[];
}

export interface NormalizedDesignStandard {
  readonly schema: typeof DESIGN_STANDARD_SCHEMA;
  readonly meta: {
    readonly origin: "preset" | "customized" | "owner";
    readonly customized: boolean;
    readonly design_system: DesignSystem;
    readonly ui_library: string;
  };
  readonly sources: readonly DesignSource[];
  readonly specs: Readonly<Record<string, string>>;
  readonly areas: readonly DesignArea[];
}

/** 校验上下文：token 表（meta 之外的分组）与硬规范原文（规格键 → 全文）。缺席时跳过对应核对并给警告。 */
export interface DesignStandardContext {
  readonly tokens: Readonly<Record<string, unknown>> | null;
  readonly specTexts: ReadonlyMap<string, string> | null;
  /** 统一骨架：不传则不做目录核对；传 null 表示骨架文件找不到，跳过核对并给警告。 */
  readonly skeleton?: DesignSkeleton | null;
}

export interface DesignStandardValidation {
  readonly ok: boolean;
  readonly issues: readonly DesignStandardIssue[];
  readonly standard: NormalizedDesignStandard | null;
}

// ── 形状工具 ────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const AREA_KEY = /^[a-z][a-z0-9_]*$/;
const PREFIX = /^[A-Z][A-Z0-9]*(\.[A-Z][A-Z0-9_]*)*$/;
const RULE_ID = /^[A-Z][A-Z0-9]*(\.[A-Z][A-Z0-9_]*)+$/;
const SOURCE_ID = /^SRC(\.[A-Z0-9_]+)+$/;
const SPEC_KEY = /^[a-z][a-z0-9_]*$/;
const PARAM_KEY = /^[a-z][a-z0-9_]*$/;
const TOKEN_PATH = /^[a-z][a-z_]*(\.[a-z][a-z0-9_]*)+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const TOP_KEYS = ["schema", "meta", "sources", "specs", "areas"];
const META_KEYS = ["origin", "customized", "design_system", "ui_library"];
const SOURCE_KEYS = ["title_zh", "url", "retrieved", "note_zh"];
const AREA_KEYS = ["key", "title_zh", "group", "prefix", "summary_zh", "playground", "rules"];
const PLAYGROUND_KEYS = ["component", "text_zh", "props", "matrix"];
const PLAYGROUND_PROP_KEYS = ["options", "boolean", "default"];
const LAB_KEYS = ["kind", "lab", "title_zh", "description_zh"];
const RULE_KEYS = ["id", "title_zh", "statement_zh", "rationale_zh", "surfaces", "params", "anchors", "enforcement", "showcase", "examples"];
const PARAM_KEYS = ["token", "value", "decision", "candidates", "unit", "source", "label_zh", "note_zh"];
const ANCHOR_KEYS = ["spec", "quote"];
const ENFORCEMENT_KEYS = ["kind", "check"];
const EXAMPLE_KEYS = ["kind", "title_zh", "note_zh", "template", "jsx", "code", "lang"];
const DEMO_KEYS = ["kind", "title_zh", "description_zh", "template", "jsx"];
const SPECIMEN_KEYS = ["kind", "title_zh", "description_zh", "name_label_zh", "rows"];
const SPECIMEN_ROW_KEYS = ["name", "usage_zh", "sample_zh", "template", "jsx"];
const PALETTE_KEYS = ["kind", "title_zh", "description_zh", "source", "scales"];
const SCALE_KEYS = ["name", "label_zh", "swatches"];
const SWATCH_KEYS = ["name", "value", "token", "pending_zh", "usage_zh"];
const SWATCH_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

class IssueSink {
  readonly issues: DesignStandardIssue[] = [];

  error(code: string, path: string, message: string, hint: string): void {
    this.issues.push({ severity: "error", code, path, message, hint });
  }

  warn(code: string, path: string, message: string, hint: string): void {
    this.issues.push({ severity: "warning", code, path, message, hint });
  }

  unknownKeys(raw: Raw, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(raw)) {
      if (!allowed.includes(key)) {
        this.error(
          "DESIGN_UNKNOWN_KEY",
          path.length > 0 ? `${path}.${key}` : key,
          `未知键 ${key}`,
          `允许的键：${allowed.join(" / ")}`,
        );
      }
    }
  }

  requireString(raw: Raw, key: string, path: string): string | null {
    const value = raw[key];
    if (nonEmptyString(value)) return value.trim();
    this.error("DESIGN_SHAPE", `${path}.${key}`, `${key} 必填且须为非空字符串`, `补上 ${key}`);
    return null;
  }

  optionalString(raw: Raw, key: string, path: string): string | null {
    const value = raw[key];
    if (value === undefined) return null;
    if (nonEmptyString(value)) return value.trim();
    this.error("DESIGN_SHAPE", `${path}.${key}`, `${key} 须为非空字符串`, `删掉 ${key} 或写上内容`);
    return null;
  }
}

/** token 表按点径取叶值；路径不存在或指向分组时返回 undefined。 */
export function lookupToken(tokens: Readonly<Record<string, unknown>>, path: string): unknown {
  let cursor: unknown = tokens;
  for (const segment of path.split(".")) {
    if (!isRecord(cursor) || !(segment in cursor)) return undefined;
    cursor = cursor[segment];
  }
  return isRecord(cursor) || Array.isArray(cursor) ? undefined : cursor;
}

function isUnknownValue(value: unknown): boolean {
  return value === "UNKNOWN";
}

// ── 各段校验 ────────────────────────────────────────────────────────────────

function validateSources(sink: IssueSink, raw: unknown): Map<string, DesignSource> {
  const out = new Map<string, DesignSource>();
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", "sources", "sources 必填且须为映射（出处编号 → 出处）", "每个定值都要能溯源到一条出处");
    return out;
  }
  for (const [id, entry] of Object.entries(raw)) {
    const path = `sources.${id}`;
    if (!SOURCE_ID.test(id)) {
      sink.error("DESIGN_IDENTIFIER", path, `出处编号 ${id} 不合规`, "形如 SRC.ANTD.SPEC.FONT（SRC 开头，大写点分）");
      continue;
    }
    if (!isRecord(entry)) {
      sink.error("DESIGN_SHAPE", path, "出处须为映射", "写 title_zh / url / retrieved");
      continue;
    }
    sink.unknownKeys(entry, SOURCE_KEYS, path);
    const title = sink.requireString(entry, "title_zh", path);
    const url = sink.requireString(entry, "url", path);
    // YAML 把不带引号的 2026-11-02 解析成日期对象：两种写法都收，统一成 YYYY-MM-DD。
    const retrievedRaw = entry["retrieved"];
    const retrieved =
      retrievedRaw instanceof Date && !Number.isNaN(retrievedRaw.getTime())
        ? retrievedRaw.toISOString().slice(0, 10)
        : sink.requireString(entry, "retrieved", path);
    const note = sink.optionalString(entry, "note_zh", path);
    if (url !== null && !/^https:\/\/\S+$/.test(url) && !/^repo:\S+$/.test(url)) {
      sink.error("DESIGN_SHAPE", `${path}.url`, `出处地址 ${url} 不是 https 链接或 repo: 仓库内路径`, "外部出处写 https 链接；仓库内出处写 repo:<相对路径>");
    }
    if (retrieved !== null && !DATE.test(retrieved)) {
      sink.error("DESIGN_SHAPE", `${path}.retrieved`, `核实日期 ${retrieved} 不是 YYYY-MM-DD`, "写实际核实出处的日期");
    }
    if (title !== null && url !== null && retrieved !== null) {
      out.set(id, { id, title_zh: title, url, retrieved, note_zh: note });
    }
  }
  return out;
}

function validateSpecs(sink: IssueSink, raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (raw === undefined) return out;
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", "specs", "specs 须为映射（规格键 → 硬规范文档相对路径）", "例如 ui: themes/ui-presentation-and-design.md");
    return out;
  }
  for (const [key, doc] of Object.entries(raw)) {
    const path = `specs.${key}`;
    if (!SPEC_KEY.test(key)) {
      sink.error("DESIGN_IDENTIFIER", path, `规格键 ${key} 不合规`, "小写 snake_case");
      continue;
    }
    if (!nonEmptyString(doc) || !doc.endsWith(".md") || doc.split("/").includes("..") || doc.startsWith("/")) {
      sink.error("DESIGN_SHAPE", path, "须为 specs/hard/ 下的 .md 相对路径", "例如 themes/ui-presentation-and-design.md");
      continue;
    }
    out.set(key, doc);
  }
  return out;
}

function validateParam(
  sink: IssueSink,
  key: string,
  raw: unknown,
  path: string,
  sources: Map<string, DesignSource>,
  ctx: DesignStandardContext,
): DesignParam | null {
  if (!PARAM_KEY.test(key)) {
    sink.error("DESIGN_IDENTIFIER", path, `参数键 ${key} 不合规`, "小写 snake_case");
    return null;
  }
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", path, "参数须为映射：{ token } / { value, source } / { decision }", "三种来源选一种");
    return null;
  }
  sink.unknownKeys(raw, PARAM_KEYS, path);
  const forms = ["token", "value", "decision"].filter((form) => raw[form] !== undefined);
  if (forms.length !== 1) {
    sink.error(
      "DESIGN_PARAM_SOURCE",
      path,
      forms.length === 0 ? "参数没有取值来源" : `参数同时写了 ${forms.join(" 和 ")}`,
      "token（引用 design-tokens）、value + source（带出处的定值）、decision（项目决策位）三选一",
    );
    return null;
  }
  const unitRaw = raw["unit"];
  let unit: DesignParamUnit = "none";
  if (unitRaw !== undefined) {
    if (typeof unitRaw === "string" && (DESIGN_PARAM_UNITS as readonly string[]).includes(unitRaw)) {
      unit = unitRaw as DesignParamUnit;
    } else {
      sink.error("DESIGN_SHAPE", `${path}.unit`, `单位 ${String(unitRaw)} 不在词表内`, `可选：${DESIGN_PARAM_UNITS.join(" / ")}`);
    }
  }
  const labelZh = sink.optionalString(raw, "label_zh", path);
  const noteZh = sink.optionalString(raw, "note_zh", path);
  const sourceRaw = raw["source"];
  let source: string | null = null;
  if (sourceRaw !== undefined) {
    if (typeof sourceRaw === "string" && sources.has(sourceRaw)) {
      source = sourceRaw;
    } else {
      sink.error("DESIGN_SOURCE_UNKNOWN", `${path}.source`, `出处 ${String(sourceRaw)} 未在 sources 登记`, "先在 sources 里登记出处（标题、链接、核实日期）");
    }
  }
  const candidatesRaw = raw["candidates"];
  let candidates: unknown[] | null = null;
  if (candidatesRaw !== undefined) {
    if (Array.isArray(candidatesRaw) && candidatesRaw.length > 0) {
      candidates = candidatesRaw;
    } else {
      sink.error("DESIGN_SHAPE", `${path}.candidates`, "候选值须为非空数组", "删掉 candidates 或列出候选");
    }
  }

  const form = forms[0];
  if (form === "token") {
    const token = raw["token"];
    if (typeof token !== "string" || !TOKEN_PATH.test(token)) {
      sink.error("DESIGN_SHAPE", `${path}.token`, `token 路径 ${String(token)} 不合规`, "写 design-tokens 里的点分路径，如 spacing.lg");
      return null;
    }
    if (candidates !== null) {
      sink.error("DESIGN_SHAPE", `${path}.candidates`, "candidates 只用于决策位", "删掉 candidates");
    }
    let value: unknown = null;
    let pending = false;
    if (ctx.tokens !== null) {
      const resolved = lookupToken(ctx.tokens, token);
      if (resolved === undefined) {
        sink.error("DESIGN_TOKEN_UNKNOWN", `${path}.token`, `design-tokens 里没有 ${token}`, "引用已有的 token 叶键，或先在 design-tokens.yaml 里补上");
        return null;
      }
      pending = isUnknownValue(resolved);
      value = pending ? null : resolved;
    }
    return { key, label_zh: labelZh, kind: "token", token, value, unit, source, decision_zh: null, candidates: null, note_zh: noteZh, pending };
  }
  if (form === "value") {
    const value = raw["value"];
    if (value === null || isUnknownValue(value)) {
      sink.error("DESIGN_SHAPE", `${path}.value`, "定值不能为空或 UNKNOWN", "还没定的值写成 decision（项目决策位）");
      return null;
    }
    if (source === null && sourceRaw === undefined) {
      sink.error("DESIGN_PARAM_SOURCE", `${path}.source`, "定值必须带出处", "在 sources 登记出处后写 source: SRC.*");
    }
    if (candidates !== null) {
      sink.error("DESIGN_SHAPE", `${path}.candidates`, "candidates 只用于决策位", "删掉 candidates");
    }
    return { key, label_zh: labelZh, kind: "value", token: null, value, unit, source, decision_zh: null, candidates: null, note_zh: noteZh, pending: false };
  }
  const decision = raw["decision"];
  if (!nonEmptyString(decision)) {
    sink.error("DESIGN_SHAPE", `${path}.decision`, "决策位须写明要回答的问题", "例如：内容区左右内边距取多少？");
    return null;
  }
  return { key, label_zh: labelZh, kind: "decision", token: null, value: null, unit, source, decision_zh: decision.trim(), candidates, note_zh: noteZh, pending: true };
}

function validateAnchor(
  sink: IssueSink,
  raw: unknown,
  path: string,
  specs: Map<string, string>,
  ctx: DesignStandardContext,
): DesignAnchor | null {
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", path, "锚点须为映射 { spec, quote }", "spec 是 specs 里的规格键，quote 是硬规范原文片段");
    return null;
  }
  sink.unknownKeys(raw, ANCHOR_KEYS, path);
  const spec = sink.requireString(raw, "spec", path);
  const quote = sink.requireString(raw, "quote", path);
  if (spec === null || quote === null) return null;
  const doc = specs.get(spec);
  if (doc === undefined) {
    sink.error("DESIGN_SPEC_UNKNOWN", `${path}.spec`, `规格键 ${spec} 未在 specs 登记`, "先在 specs 里登记硬规范文档路径");
    return null;
  }
  const text = ctx.specTexts?.get(spec);
  if (ctx.specTexts !== null && text === undefined) {
    sink.error("DESIGN_ANCHOR_MISSING", `${path}.spec`, `硬规范文档 ${doc} 不存在`, "核对 specs 里的路径");
    return null;
  }
  if (text !== undefined && !text.includes(quote)) {
    sink.error(
      "DESIGN_ANCHOR_MISSING",
      `${path}.quote`,
      `硬规范 ${doc} 里找不到原文「${quote}」`,
      "锚点要逐字摘自硬规范原文；原文改了就同步改锚点，或改写规则",
    );
    return null;
  }
  return { spec, doc, quote };
}

/** 实时示例里 `p.<参数>` 与 `t['<token>']` 的引用都要能解析到已定的值（否则 Storybook 渲染出错或误导）。 */
function checkLiveReferences(
  sink: IssueSink,
  source: string,
  path: string,
  params: readonly DesignParam[],
  ctx: DesignStandardContext,
): void {
  const byKey = new Map(params.map((param) => [param.key, param]));
  for (const match of source.matchAll(/\bp\.([a-z][a-z0-9_]*)/g)) {
    const key = match[1] as string;
    const param = byKey.get(key);
    if (param === undefined) {
      sink.error("DESIGN_EXAMPLE", path, `示例引用了本条规则没有的参数 p.${key}`, "示例只能引用本条规则 params 里的参数");
    } else if (param.pending) {
      sink.error("DESIGN_EXAMPLE", path, `示例引用的参数 p.${key} 还没定值`, "待定参数不能进实时示例；先定值，或示例改用已定的 token");
    }
  }
  for (const match of source.matchAll(/\bt\[\s*['"]([a-z0-9_.]+)['"]\s*\]/g)) {
    const tokenPath = match[1] as string;
    if (ctx.tokens === null) continue;
    const value = lookupToken(ctx.tokens, tokenPath);
    if (value === undefined) {
      sink.error("DESIGN_EXAMPLE", path, `示例引用的 token ${tokenPath} 不存在`, "核对 design-tokens.yaml 的点分路径");
    } else if (isUnknownValue(value)) {
      sink.error("DESIGN_EXAMPLE", path, `示例引用的 token ${tokenPath} 仍为 UNKNOWN`, "先回填 token，或示例改用已定的 token");
    }
  }
}

function validateExample(
  sink: IssueSink,
  raw: unknown,
  path: string,
  system: DesignSystem | null,
  params: readonly DesignParam[],
  ctx: DesignStandardContext,
): DesignExample | null {
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", path, "示例须为映射", "写 kind / title_zh 和 template、jsx 或 code");
    return null;
  }
  sink.unknownKeys(raw, EXAMPLE_KEYS, path);
  const kind = raw["kind"];
  if (kind !== "do" && kind !== "dont") {
    sink.error("DESIGN_SHAPE", `${path}.kind`, "kind 须为 do 或 dont", "do = 这样做，dont = 别这样做");
  }
  const title = sink.requireString(raw, "title_zh", path);
  const note = sink.optionalString(raw, "note_zh", path);
  const forms = (["template", "jsx", "code"] as const).filter((form) => raw[form] !== undefined);
  const lang = raw["lang"];
  if (forms.length !== 1) {
    sink.error(
      "DESIGN_EXAMPLE",
      path,
      forms.length === 0 ? "示例没有内容" : `示例同时写了 ${forms.join(" 和 ")}`,
      "template（Vue 模板，实时渲染）/ jsx（JSX，实时渲染）/ code（只展示，配 lang）三选一",
    );
    return null;
  }
  const form = forms[0] as "template" | "jsx" | "code";
  const body = raw[form];
  if (!nonEmptyString(body)) {
    sink.error("DESIGN_EXAMPLE", `${path}.${form}`, `${form} 须为非空字符串`, "写示例内容");
    return null;
  }
  if (form === "code") {
    if (typeof lang !== "string" || !(DESIGN_EXAMPLE_LANGS as readonly string[]).includes(lang)) {
      sink.error("DESIGN_EXAMPLE", `${path}.lang`, `lang ${String(lang)} 不在词表内`, `可选：${DESIGN_EXAMPLE_LANGS.join(" / ")}`);
      return null;
    }
  } else {
    if (system !== null && DESIGN_SYSTEMS[system].example_field !== form) {
      sink.error(
        "DESIGN_EXAMPLE",
        `${path}.${form}`,
        `${DESIGN_SYSTEMS[system].title_zh} 体系的实时示例要写 ${DESIGN_SYSTEMS[system].example_field}，不是 ${form}`,
        `${DESIGN_SYSTEMS[system].framework === "vue" ? "Vue 栈写 template" : "React 栈写 jsx"}`,
      );
      return null;
    }
    if (/<\s*(script|style)\b/i.test(body)) {
      sink.error("DESIGN_EXAMPLE", `${path}.${form}`, "实时示例里不能有 <script> 或 <style>", "样式写进内联 style，数值从 p / t 取");
      return null;
    }
    if (lang !== undefined) {
      sink.error("DESIGN_EXAMPLE", `${path}.lang`, "lang 只配 code 使用", "删掉 lang");
    }
    checkLiveReferences(sink, body, `${path}.${form}`, params, ctx);
  }
  if (kind !== "do" && kind !== "dont") return null;
  if (title === null) return null;
  return {
    kind,
    title_zh: title,
    note_zh: note,
    template: form === "template" ? body : null,
    jsx: form === "jsx" ? body : null,
    code: form === "code" ? body : null,
    lang: form === "code" ? (lang as DesignExampleLang) : null,
  };
}

/** 展示块里的实时内容：template（Vue）或 jsx（React）二选一，须与设计体系一致；返回 null 表示有错。 */
function validateLiveBody(
  sink: IssueSink,
  raw: Raw,
  path: string,
  system: DesignSystem | null,
  params: readonly DesignParam[],
  ctx: DesignStandardContext,
  required: boolean,
): { readonly template: string | null; readonly jsx: string | null } | null {
  const forms = (["template", "jsx"] as const).filter((form) => raw[form] !== undefined);
  if (forms.length === 0) {
    if (!required) return { template: null, jsx: null };
    sink.error("DESIGN_EXAMPLE", path, "缺少实时内容", system === null ? "写 template 或 jsx" : `${DESIGN_SYSTEMS[system].title_zh} 体系写 ${DESIGN_SYSTEMS[system].example_field}`);
    return null;
  }
  if (forms.length > 1) {
    sink.error("DESIGN_EXAMPLE", path, "template 和 jsx 只能写一个", "按设计体系二选一");
    return null;
  }
  const form = forms[0] as "template" | "jsx";
  const body = raw[form];
  if (!nonEmptyString(body)) {
    sink.error("DESIGN_EXAMPLE", `${path}.${form}`, `${form} 须为非空字符串`, "写实时内容");
    return null;
  }
  if (system !== null && DESIGN_SYSTEMS[system].example_field !== form) {
    sink.error(
      "DESIGN_EXAMPLE",
      `${path}.${form}`,
      `${DESIGN_SYSTEMS[system].title_zh} 体系的实时内容要写 ${DESIGN_SYSTEMS[system].example_field}，不是 ${form}`,
      DESIGN_SYSTEMS[system].framework === "vue" ? "Vue 栈写 template" : "React 栈写 jsx",
    );
    return null;
  }
  if (/<\s*(script|style)\b/i.test(body)) {
    sink.error("DESIGN_EXAMPLE", `${path}.${form}`, "实时内容里不能有 <script> 或 <style>", "样式写进内联 style，数值从 p / t 取");
    return null;
  }
  checkLiveReferences(sink, body, `${path}.${form}`, params, ctx);
  return { template: form === "template" ? body : null, jsx: form === "jsx" ? body : null };
}

function validateSwatch(sink: IssueSink, raw: unknown, path: string, ctx: DesignStandardContext): DesignSwatch | null {
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", path, "色块须为映射", "写 name 和 value / token / pending_zh 之一");
    return null;
  }
  sink.unknownKeys(raw, SWATCH_KEYS, path);
  const name = sink.requireString(raw, "name", path);
  if (name !== null && !SWATCH_NAME.test(name)) {
    sink.error("DESIGN_IDENTIFIER", `${path}.name`, `色块名称 ${name} 不合规`, "字母数字开头，可含 . _ -，如 gray-100");
  }
  const usage = sink.optionalString(raw, "usage_zh", path);
  const forms = (["value", "token", "pending_zh"] as const).filter((form) => raw[form] !== undefined);
  if (forms.length !== 1) {
    sink.error("DESIGN_SHAPE", path, forms.length === 0 ? "色块没有取值" : `色块同时写了 ${forms.join(" 和 ")}`, "value（颜色定值）/ token（引用 token）/ pending_zh（未公开的原因）三选一");
    return null;
  }
  const form = forms[0] as "value" | "token" | "pending_zh";
  if (form === "value") {
    const value = raw["value"];
    if (!nonEmptyString(value) || isUnknownValue(value)) {
      sink.error("DESIGN_SHAPE", `${path}.value`, "颜色定值须为非空字符串，且不能是 UNKNOWN", "没公开的写 pending_zh");
      return null;
    }
    return name === null ? null : { name, kind: "value", token: null, value: value.trim(), pending_zh: null, usage_zh: usage };
  }
  if (form === "token") {
    const token = raw["token"];
    if (typeof token !== "string" || !TOKEN_PATH.test(token)) {
      sink.error("DESIGN_IDENTIFIER", `${path}.token`, `token 路径 ${String(token)} 不合规`, "点分小写，如 color.brand.primary");
      return null;
    }
    let value: string | null = null;
    if (ctx.tokens !== null) {
      const resolved = lookupToken(ctx.tokens, token);
      if (resolved === undefined) {
        sink.error("DESIGN_TOKEN_UNKNOWN", `${path}.token`, `token ${token} 在 design-tokens.yaml 里不存在`, "核对点分路径");
        return null;
      }
      value = isUnknownValue(resolved) ? null : String(resolved);
    }
    return name === null ? null : { name, kind: "token", token, value, pending_zh: value === null && ctx.tokens !== null ? `token ${token} 仍为 UNKNOWN` : null, usage_zh: usage };
  }
  const pending = sink.optionalString(raw, "pending_zh", path);
  return name === null || pending === null ? null : { name, kind: "pending", token: null, value: null, pending_zh: pending, usage_zh: usage };
}

function validateShowcaseBlock(
  sink: IssueSink,
  raw: unknown,
  path: string,
  system: DesignSystem | null,
  params: readonly DesignParam[],
  sources: Map<string, DesignSource>,
  ctx: DesignStandardContext,
): DesignShowcaseBlock | null {
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", path, "展示块须为映射", "kind 取 demo（演示卡片）/ specimen（对照表）/ palette（色板）");
    return null;
  }
  const kind = raw["kind"];
  if (kind === "demo") {
    sink.unknownKeys(raw, DEMO_KEYS, path);
    const title = sink.requireString(raw, "title_zh", path);
    const description = sink.optionalString(raw, "description_zh", path);
    const body = validateLiveBody(sink, raw, path, system, params, ctx, true);
    if (title === null || body === null) return null;
    return { kind: "demo", title_zh: title, description_zh: description, template: body.template, jsx: body.jsx };
  }
  if (kind === "specimen") {
    sink.unknownKeys(raw, SPECIMEN_KEYS, path);
    const title = sink.optionalString(raw, "title_zh", path);
    const description = sink.optionalString(raw, "description_zh", path);
    const nameLabel = sink.optionalString(raw, "name_label_zh", path);
    const rowsRaw = raw["rows"];
    if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
      sink.error("DESIGN_SHAPE", `${path}.rows`, "rows 必填且非空", "每行 { name, usage_zh, sample_zh | template | jsx }");
      return null;
    }
    const rows: DesignSpecimenRow[] = [];
    let ok = true;
    rowsRaw.forEach((rowRaw, index) => {
      const rowPath = `${path}.rows[${index}]`;
      if (!isRecord(rowRaw)) {
        sink.error("DESIGN_SHAPE", rowPath, "对照表的行须为映射", "写 name 和 sample_zh / template / jsx");
        ok = false;
        return;
      }
      sink.unknownKeys(rowRaw, SPECIMEN_ROW_KEYS, rowPath);
      const name = sink.requireString(rowRaw, "name", rowPath);
      const usage = sink.optionalString(rowRaw, "usage_zh", rowPath);
      const sample = sink.optionalString(rowRaw, "sample_zh", rowPath);
      const body = validateLiveBody(sink, rowRaw, rowPath, system, params, ctx, sample === null);
      if (sample !== null && body !== null && (body.template !== null || body.jsx !== null)) {
        sink.error("DESIGN_EXAMPLE", rowPath, "sample_zh 和实时内容只能写一个", "sample_zh 是简写：用 name 作类名渲染这段文字");
        ok = false;
        return;
      }
      if (name === null || body === null) {
        ok = false;
        return;
      }
      rows.push({ name, usage_zh: usage, sample_zh: sample, template: body.template, jsx: body.jsx });
    });
    if (!ok) return null;
    return { kind: "specimen", title_zh: title, description_zh: description, name_label_zh: nameLabel, rows };
  }
  if (kind === "palette") {
    sink.unknownKeys(raw, PALETTE_KEYS, path);
    const title = sink.optionalString(raw, "title_zh", path);
    const description = sink.optionalString(raw, "description_zh", path);
    const sourceRaw = raw["source"];
    let source: string | null = null;
    if (sourceRaw !== undefined) {
      if (typeof sourceRaw !== "string" || !sources.has(sourceRaw)) {
        sink.error("DESIGN_SOURCE_UNKNOWN", `${path}.source`, `出处 ${String(sourceRaw)} 没有在 sources 登记`, "先在 sources 里登记");
      } else {
        source = sourceRaw;
      }
    }
    const scalesRaw = raw["scales"];
    if (!Array.isArray(scalesRaw) || scalesRaw.length === 0) {
      sink.error("DESIGN_SHAPE", `${path}.scales`, "scales 必填且非空", "每个色阶 { name, label_zh, swatches }");
      return null;
    }
    const scales: DesignPaletteScale[] = [];
    let ok = true;
    scalesRaw.forEach((scaleRaw, index) => {
      const scalePath = `${path}.scales[${index}]`;
      if (!isRecord(scaleRaw)) {
        sink.error("DESIGN_SHAPE", scalePath, "色阶须为映射", "写 name / label_zh / swatches");
        ok = false;
        return;
      }
      sink.unknownKeys(scaleRaw, SCALE_KEYS, scalePath);
      const name = sink.requireString(scaleRaw, "name", scalePath);
      const label = sink.optionalString(scaleRaw, "label_zh", scalePath);
      const swatchesRaw = scaleRaw["swatches"];
      if (!Array.isArray(swatchesRaw) || swatchesRaw.length === 0) {
        sink.error("DESIGN_SHAPE", `${scalePath}.swatches`, "swatches 必填且非空", "每格 { name, value | token | pending_zh }");
        ok = false;
        return;
      }
      const swatches: DesignSwatch[] = [];
      swatchesRaw.forEach((swatchRaw, swatchIndex) => {
        const swatch = validateSwatch(sink, swatchRaw, `${scalePath}.swatches[${swatchIndex}]`, ctx);
        if (swatch === null) ok = false;
        else swatches.push(swatch);
      });
      if (name === null) ok = false;
      else scales.push({ name, label_zh: label, swatches });
    });
    const hasValues = scales.some((scale) => scale.swatches.some((swatch) => swatch.kind === "value"));
    if (hasValues && source === null && sourceRaw === undefined) {
      sink.error("DESIGN_PARAM_SOURCE", `${path}.source`, "色板里有颜色定值，但没写出处", "写 source: SRC.*（在 sources 登记）");
      ok = false;
    }
    if (!ok) return null;
    return { kind: "palette", title_zh: title, description_zh: description, source, scales };
  }
  if (kind === "lab") {
    sink.unknownKeys(raw, LAB_KEYS, path);
    const title = sink.requireString(raw, "title_zh", path);
    const description = sink.optionalString(raw, "description_zh", path);
    const lab = raw["lab"];
    if (typeof lab !== "string" || !LAB_IDS.has(lab)) {
      sink.error("DESIGN_LAB_UNKNOWN", `${path}.lab`, `实验 ${String(lab)} 不在实验词表内`, `可选：${DESIGN_LABS.map((item) => item.id).join(" / ")}；新实验要先在 DESIGN_LABS 登记，并在两个画廊里实现`);
      return null;
    }
    if (title === null) return null;
    return { kind: "lab", lab, title_zh: title, description_zh: description };
  }
  sink.error("DESIGN_SHAPE", `${path}.kind`, `展示块类型 ${String(kind)} 不在词表内`, "demo（演示卡片）/ specimen（对照表）/ palette（色板）/ lab（实验）");
  return null;
}

function validatePlayground(sink: IssueSink, raw: unknown, path: string): DesignPlayground | null {
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", path, "playground 须为映射", "写 component / props / matrix");
    return null;
  }
  sink.unknownKeys(raw, PLAYGROUND_KEYS, path);
  const component = sink.requireString(raw, "component", path);
  const text = sink.optionalString(raw, "text_zh", path);
  const propsRaw = raw["props"];
  const props: DesignPlaygroundProp[] = [];
  let ok = component !== null;
  if (!isRecord(propsRaw) || Object.keys(propsRaw).length === 0) {
    sink.error("DESIGN_SHAPE", `${path}.props`, "props 必填且非空", "每个属性写 { options: [...], default } 或 { boolean: true, default }");
    return null;
  }
  for (const [key, value] of Object.entries(propsRaw)) {
    const propPath = `${path}.props.${key}`;
    if (!/^[a-z][a-zA-Z0-9-]*$/.test(key)) {
      sink.error("DESIGN_IDENTIFIER", propPath, `属性名 ${key} 不合规`, "小写开头的组件属性名");
      ok = false;
      continue;
    }
    if (!isRecord(value)) {
      sink.error("DESIGN_SHAPE", propPath, "属性须为映射", "{ options: [...], default } 或 { boolean: true, default }");
      ok = false;
      continue;
    }
    sink.unknownKeys(value, PLAYGROUND_PROP_KEYS, propPath);
    const options = value["options"];
    if (options !== undefined) {
      if (!Array.isArray(options) || options.length === 0 || !options.every(nonEmptyString) || new Set(options).size !== options.length) {
        sink.error("DESIGN_SHAPE", `${propPath}.options`, "options 须为不重复的非空字符串数组", "列出规范允许的取值");
        ok = false;
        continue;
      }
      const fallback = value["default"];
      if (typeof fallback !== "string" || !options.includes(fallback)) {
        sink.error("DESIGN_SHAPE", `${propPath}.default`, "default 须是 options 里的一项", "写缺省取值");
        ok = false;
        continue;
      }
      props.push({ key, kind: "options", options: options.map((item) => String(item)), default: fallback });
    } else if (value["boolean"] === true) {
      const fallback = value["default"];
      if (typeof fallback !== "boolean") {
        sink.error("DESIGN_SHAPE", `${propPath}.default`, "布尔属性的 default 须为 true / false", "写缺省取值");
        ok = false;
        continue;
      }
      props.push({ key, kind: "boolean", default: fallback });
    } else {
      sink.error("DESIGN_SHAPE", propPath, "属性要写 options（枚举）或 boolean: true（布尔）", "例如 size: { options: [small, medium, large], default: medium }");
      ok = false;
    }
  }
  let matrix: DesignPlayground["matrix"] = null;
  const matrixRaw = raw["matrix"];
  if (matrixRaw !== undefined) {
    if (!isRecord(matrixRaw)) {
      sink.error("DESIGN_SHAPE", `${path}.matrix`, "matrix 须为 { rows, columns }", "行、列各取一个枚举属性");
      ok = false;
    } else {
      sink.unknownKeys(matrixRaw, ["rows", "columns"], `${path}.matrix`);
      const rows = matrixRaw["rows"];
      const columns = matrixRaw["columns"];
      const enumKeys = new Set(props.filter((prop) => prop.kind === "options").map((prop) => prop.key));
      if (typeof rows !== "string" || typeof columns !== "string" || !enumKeys.has(rows) || !enumKeys.has(columns) || rows === columns) {
        sink.error("DESIGN_SHAPE", `${path}.matrix`, "matrix 的 rows 和 columns 须是两个不同的枚举属性", `可选：${[...enumKeys].join(" / ")}`);
        ok = false;
      } else {
        matrix = { rows, columns };
      }
    }
  }
  if (!ok || component === null) return null;
  return { component, text_zh: text, props, matrix };
}

function validateRule(
  sink: IssueSink,
  raw: unknown,
  path: string,
  prefix: string | null,
  seenIds: Set<string>,
  sources: Map<string, DesignSource>,
  specs: Map<string, string>,
  system: DesignSystem | null,
  ctx: DesignStandardContext,
): DesignRule | null {
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", path, "规则须为映射", "写 id / title_zh / statement_zh / enforcement");
    return null;
  }
  sink.unknownKeys(raw, RULE_KEYS, path);
  const id = sink.requireString(raw, "id", path);
  if (id !== null) {
    if (!RULE_ID.test(id)) {
      sink.error("DESIGN_IDENTIFIER", `${path}.id`, `规则编号 ${id} 不合规`, "大写点分，如 GRID.GUTTER");
    } else if (prefix !== null && !id.startsWith(`${prefix}.`)) {
      sink.error("DESIGN_IDENTIFIER", `${path}.id`, `规则编号 ${id} 不以领域前缀 ${prefix}. 开头`, `改成 ${prefix}.<名称>`);
    }
    if (seenIds.has(id)) {
      sink.error("DESIGN_DUPLICATE", `${path}.id`, `规则编号 ${id} 重复`, "规则编号全文件唯一");
    }
    seenIds.add(id);
  }
  const title = sink.requireString(raw, "title_zh", path);
  const statement = sink.requireString(raw, "statement_zh", path);
  const rationale = sink.optionalString(raw, "rationale_zh", path);

  let surfaces: DesignSurface[] = [...DESIGN_SURFACES];
  const surfacesRaw = raw["surfaces"];
  if (surfacesRaw !== undefined) {
    if (
      Array.isArray(surfacesRaw) &&
      surfacesRaw.length > 0 &&
      surfacesRaw.every((s) => (DESIGN_SURFACES as readonly unknown[]).includes(s)) &&
      new Set(surfacesRaw).size === surfacesRaw.length
    ) {
      surfaces = DESIGN_SURFACES.filter((s) => surfacesRaw.includes(s));
    } else {
      sink.error("DESIGN_SHAPE", `${path}.surfaces`, "surfaces 须为 admin / public 的非空不重复子集", "缺省 = 两个面都适用");
    }
  }

  const params: DesignParam[] = [];
  const paramsRaw = raw["params"];
  if (paramsRaw !== undefined) {
    if (!isRecord(paramsRaw)) {
      sink.error("DESIGN_SHAPE", `${path}.params`, "params 须为映射（参数键 → 取值）", "例如 gutter: { value: [16, 24], unit: px, source: SRC.* }");
    } else {
      for (const [key, value] of Object.entries(paramsRaw)) {
        const param = validateParam(sink, key, value, `${path}.params.${key}`, sources, ctx);
        if (param !== null) params.push(param);
      }
    }
  }

  const anchors: DesignAnchor[] = [];
  const anchorsRaw = raw["anchors"];
  if (anchorsRaw !== undefined) {
    if (!Array.isArray(anchorsRaw)) {
      sink.error("DESIGN_SHAPE", `${path}.anchors`, "anchors 须为数组", "每项 { spec, quote }");
    } else {
      anchorsRaw.forEach((entry, index) => {
        const anchor = validateAnchor(sink, entry, `${path}.anchors[${index}]`, specs, ctx);
        if (anchor !== null) anchors.push(anchor);
      });
    }
  }

  let enforcement: DesignEnforcement | null = null;
  const enforcementRaw = raw["enforcement"];
  if (!isRecord(enforcementRaw)) {
    sink.error("DESIGN_SHAPE", `${path}.enforcement`, "enforcement 必填：{ kind: gate, check } 或 { kind: review }", "机器可查的规则写 gate，其余写 review");
  } else {
    sink.unknownKeys(enforcementRaw, ENFORCEMENT_KEYS, `${path}.enforcement`);
    const kind = enforcementRaw["kind"];
    const check = enforcementRaw["check"];
    if (kind === "review") {
      if (check !== undefined) {
        sink.error("DESIGN_SHAPE", `${path}.enforcement.check`, "人工评审的规则不写 check", "删掉 check，或把 kind 改成 gate");
      } else {
        enforcement = { kind: "review" };
      }
    } else if (kind === "gate") {
      if (typeof check !== "string" || !CHECK_IDS.has(check)) {
        sink.error(
          "DESIGN_CHECK_UNKNOWN",
          `${path}.enforcement.check`,
          `检查 ${String(check)} 不在门禁检查词表内`,
          `可选：${DESIGN_CHECKS.map((c) => c.id).join(" / ")}；新检查要先在 design-standard.ts 的 DESIGN_CHECKS 登记并实现`,
        );
      } else {
        enforcement = { kind: "gate", check, active: DESIGN_CHECKS.find((c) => c.id === check)?.active ?? false };
      }
    } else {
      sink.error("DESIGN_SHAPE", `${path}.enforcement.kind`, `执行方式 ${String(kind)} 不在词表内`, "gate（机器门禁）或 review（人工评审）");
    }
  }

  const showcase: DesignShowcaseBlock[] = [];
  const showcaseRaw = raw["showcase"];
  if (showcaseRaw !== undefined) {
    if (!Array.isArray(showcaseRaw)) {
      sink.error("DESIGN_SHAPE", `${path}.showcase`, "showcase 须为数组", "每项 { kind: demo | specimen | palette, … }");
    } else {
      showcaseRaw.forEach((entry, index) => {
        const block = validateShowcaseBlock(sink, entry, `${path}.showcase[${index}]`, system, params, sources, ctx);
        if (block !== null) showcase.push(block);
      });
    }
  }

  const examples: DesignExample[] = [];
  const examplesRaw = raw["examples"];
  if (examplesRaw !== undefined) {
    if (!Array.isArray(examplesRaw)) {
      sink.error("DESIGN_SHAPE", `${path}.examples`, "examples 须为数组", "每项 { kind, title_zh, template | jsx | code }");
    } else {
      examplesRaw.forEach((entry, index) => {
        const example = validateExample(sink, entry, `${path}.examples[${index}]`, system, params, ctx);
        if (example !== null) examples.push(example);
      });
    }
  }

  if (id === null || title === null || statement === null || enforcement === null) return null;
  return { id, title_zh: title, statement_zh: statement, rationale_zh: rationale, surfaces, params, anchors, enforcement, showcase, examples };
}

function validateMeta(sink: IssueSink, raw: unknown): NormalizedDesignStandard["meta"] | null {
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", "meta", "meta 必填", "写 origin / customized / design_system / ui_library");
    return null;
  }
  sink.unknownKeys(raw, META_KEYS, "meta");
  const origin = raw["origin"];
  const customized = raw["customized"];
  const system = raw["design_system"];
  const uiLibrary = sink.requireString(raw, "ui_library", "meta");
  let ok = true;
  if (typeof system !== "string" || !(system in DESIGN_SYSTEMS)) {
    sink.error("DESIGN_SHAPE", "meta.design_system", `设计体系 ${String(system)} 不在词表内`, `可选：${Object.keys(DESIGN_SYSTEMS).join(" / ")}`);
    ok = false;
  }
  if (origin !== "preset" && origin !== "customized" && origin !== "owner") {
    sink.error("DESIGN_SHAPE", "meta.origin", `origin ${String(origin)} 不在词表内`, "preset（预设）/ customized（在预设上定制）/ owner（项目自著）");
    ok = false;
  }
  if (typeof customized !== "boolean") {
    sink.error("DESIGN_SHAPE", "meta.customized", "customized 须为布尔", "未改动预设时为 false");
    ok = false;
  }
  if (!ok || uiLibrary === null) return null;
  return {
    origin: origin as "preset" | "customized" | "owner",
    customized: customized as boolean,
    design_system: system as DesignSystem,
    ui_library: uiLibrary,
  };
}

/** 校验并归一化（所有问题一次报全；有任何 error 时 standard 为 null）。 */
export function validateDesignStandard(raw: unknown, ctx: DesignStandardContext): DesignStandardValidation {
  const sink = new IssueSink();
  if (!isRecord(raw)) {
    sink.error("DESIGN_SHAPE", "", "规范根须为映射", `以 schema: ${DESIGN_STANDARD_SCHEMA} 开头`);
    return { ok: false, issues: sink.issues, standard: null };
  }
  if (raw["schema"] !== DESIGN_STANDARD_SCHEMA) {
    sink.error("DESIGN_SCHEMA_UNSUPPORTED", "schema", `schema 须为 ${DESIGN_STANDARD_SCHEMA}`, `首行写 schema: ${DESIGN_STANDARD_SCHEMA}`);
  }
  sink.unknownKeys(raw, TOP_KEYS, "");
  const meta = validateMeta(sink, raw["meta"]);
  const sources = validateSources(sink, raw["sources"]);
  const specs = validateSpecs(sink, raw["specs"]);
  if (ctx.tokens === null) {
    sink.warn("DESIGN_TOKENS_UNAVAILABLE", "", "没有找到 design-tokens.yaml，token 引用未核对", "在项目里 pomaster init，或把 design-tokens.yaml 放在规范同目录");
  }
  if (ctx.specTexts === null && specs.size > 0) {
    sink.warn("DESIGN_SPECS_UNAVAILABLE", "specs", "没有找到硬规范目录，锚点原文未核对", "在项目里 pomaster init 后再校验");
  }

  const areas: DesignArea[] = [];
  const areasRaw = raw["areas"];
  const seenAreaKeys = new Set<string>();
  const seenPrefixes = new Set<string>();
  const seenRuleIds = new Set<string>();
  let lastSkeletonIndex = -1;
  const skeleton = ctx.skeleton ?? null;
  const coveredTopics = new Set<string>();
  // 没传骨架（undefined）：调用方不做目录核对（如单测里的最小规范），不提示；传了 null：骨架文件找不到，给警告。
  if (ctx.skeleton === null) {
    sink.warn("DESIGN_SKELETON_UNAVAILABLE", "", "没有找到统一骨架，领域与条目没有和另一套设计体系对齐核对", `骨架在工具 seeds 的 ${DESIGN_SKELETON_RELATIVE}`);
  }
  if (!Array.isArray(areasRaw) || areasRaw.length === 0) {
    sink.error("DESIGN_SHAPE", "areas", "areas 必填且非空", "至少写一个领域");
  } else {
    areasRaw.forEach((areaRaw, areaIndex) => {
      const path = `areas[${areaIndex}]`;
      if (!isRecord(areaRaw)) {
        sink.error("DESIGN_SHAPE", path, "领域须为映射", "写 key / title_zh / group / prefix / summary_zh / rules");
        return;
      }
      sink.unknownKeys(areaRaw, AREA_KEYS, path);
      const key = sink.requireString(areaRaw, "key", path);
      if (key !== null) {
        if (!AREA_KEY.test(key)) sink.error("DESIGN_IDENTIFIER", `${path}.key`, `领域键 ${key} 不合规`, "小写 snake_case");
        if (seenAreaKeys.has(key)) sink.error("DESIGN_DUPLICATE", `${path}.key`, `领域键 ${key} 重复`, "领域键唯一");
        seenAreaKeys.add(key);
      }
      const title = sink.requireString(areaRaw, "title_zh", path);
      const summary = sink.requireString(areaRaw, "summary_zh", path);
      const group = areaRaw["group"];
      const groupOk = typeof group === "string" && group in DESIGN_AREA_GROUPS;
      if (!groupOk) {
        sink.error("DESIGN_SHAPE", `${path}.group`, `分区 ${String(group)} 不在词表内`, `可选：${Object.keys(DESIGN_AREA_GROUPS).join(" / ")}`);
      }
      const prefixRaw = areaRaw["prefix"];
      let prefix: string | null = null;
      if (typeof prefixRaw === "string" && PREFIX.test(prefixRaw)) {
        prefix = prefixRaw;
        if (seenPrefixes.has(prefix)) sink.error("DESIGN_DUPLICATE", `${path}.prefix`, `领域前缀 ${prefix} 重复`, "前缀唯一");
        seenPrefixes.add(prefix);
      } else {
        sink.error("DESIGN_IDENTIFIER", `${path}.prefix`, `领域前缀 ${String(prefixRaw)} 不合规`, "大写字母开头，如 GRID");
      }
      let playground: DesignPlayground | null = null;
      if (areaRaw["playground"] !== undefined) {
        if (typeof group === "string" && !group.startsWith("components.")) {
          sink.error("DESIGN_SHAPE", `${path}.playground`, "只有组件领域写 playground", "删掉 playground");
        } else {
          playground = validatePlayground(sink, areaRaw["playground"], `${path}.playground`);
        }
      }
      const rules: DesignRule[] = [];
      const rulesRaw = areaRaw["rules"];
      if (!Array.isArray(rulesRaw) || rulesRaw.length === 0) {
        sink.error("DESIGN_SHAPE", `${path}.rules`, "rules 必填且非空", "至少写一条规则");
      } else {
        rulesRaw.forEach((ruleRaw, ruleIndex) => {
          const rule = validateRule(sink, ruleRaw, `${path}.rules[${ruleIndex}]`, prefix, seenRuleIds, sources, specs, meta?.design_system ?? null, ctx);
          if (rule !== null) rules.push(rule);
        });
      }
      // 统一骨架：骨架里的领域，标题、分区、前缀与先后顺序都要和骨架一致；领域下的规则编号、标题、
      // 顺序与骨架条目一致。骨架外的领域与条目只给警告。
      if (key !== null && skeleton !== null) {
        const skeletonIndex = skeleton.areas.findIndex((entry) => entry.key === key);
        const entry = skeleton.areas[skeletonIndex];
        if (entry === undefined) {
          sink.warn(
            "DESIGN_AREA_EXTRA",
            `${path}.key`,
            `领域 ${key} 不在统一骨架里，另一套设计体系没有对应的页`,
            `能归入骨架里的领域就并进去；确需新增的领域先加进 ${DESIGN_SKELETON_RELATIVE}`,
          );
        } else {
          const mismatched = [
            title !== null && title !== entry.title_zh ? `标题应为「${entry.title_zh}」` : null,
            groupOk && group !== entry.group ? `分区应为 ${entry.group}` : null,
            prefix !== null && prefix !== entry.prefix ? `前缀应为 ${entry.prefix}` : null,
          ].filter((item): item is string => item !== null);
          if (mismatched.length > 0) {
            sink.error("DESIGN_AREA_SKELETON", path, `领域 ${key} 与统一骨架不一致：${mismatched.join("，")}`, "两套设计体系的目录要一致，按骨架改");
          }
          if (skeletonIndex < lastSkeletonIndex) {
            sink.error("DESIGN_AREA_SKELETON", path, `领域 ${key} 的位置与统一骨架的顺序不一致`, `按 ${DESIGN_SKELETON_RELATIVE} 的顺序排列领域`);
          }
          lastSkeletonIndex = Math.max(lastSkeletonIndex, skeletonIndex);
          let lastTopicIndex = -1;
          rules.forEach((rule, ruleIndex) => {
            const topicIndex = entry.topics.findIndex((topic) => topic.id === rule.id);
            const topic = entry.topics[topicIndex];
            const rulePath = `${path}.rules[${ruleIndex}]`;
            if (topic === undefined) {
              sink.warn(
                "DESIGN_TOPIC_EXTRA",
                `${rulePath}.id`,
                `规则 ${rule.id} 不在骨架领域 ${key} 的条目里，另一套设计体系没有对应条目`,
                `能并进已有条目就并进去；确需新增的条目先加进 ${DESIGN_SKELETON_RELATIVE}`,
              );
              return;
            }
            if (rule.title_zh !== topic.title_zh) {
              sink.error("DESIGN_AREA_SKELETON", `${rulePath}.title_zh`, `规则 ${rule.id} 的标题应为「${topic.title_zh}」（与骨架一致）`, "具体做法写进条文和参数，标题与另一套体系保持一致");
            }
            if (topicIndex < lastTopicIndex) {
              sink.error("DESIGN_AREA_SKELETON", rulePath, `规则 ${rule.id} 的位置与骨架条目顺序不一致`, `按骨架顺序排列：${entry.topics.map((item) => item.id).join(" → ")}`);
            }
            lastTopicIndex = Math.max(lastTopicIndex, topicIndex);
            coveredTopics.add(rule.id);
          });
        }
      }
      if (key !== null && title !== null && summary !== null && groupOk && prefix !== null) {
        const groupKey = group as DesignAreaGroup;
        areas.push({ key, title_zh: title, group: groupKey, group_title_zh: DESIGN_AREA_GROUPS[groupKey], prefix, summary_zh: summary, playground, rules });
      }
    });
  }

  // 汇总警告：待定的值与待接入的门禁（各一条，逐项列出，避免刷屏）。
  const pending: string[] = [];
  const pendingChecks: string[] = [];
  for (const area of areas) {
    for (const rule of area.rules) {
      for (const param of rule.params) {
        if (param.pending) pending.push(`${rule.id}.${param.key}`);
      }
      if (rule.enforcement.kind === "gate" && !rule.enforcement.active) pendingChecks.push(`${rule.id}（${rule.enforcement.check}）`);
    }
  }
  if (pending.length > 0) {
    sink.warn(
      "DESIGN_DECISION_PENDING",
      "",
      `${pending.length} 个参数待项目决定：${pending.join("、")}`,
      "定了就把 decision 改成 value + source，或在 design-tokens.yaml 回填对应 token；未定的值在规范页显示为待定",
    );
  }
  if (skeleton !== null && Array.isArray(areasRaw) && areasRaw.length > 0) {
    const uncovered = skeleton.areas.filter((entry) => !seenAreaKeys.has(entry.key));
    if (uncovered.length > 0) {
      sink.warn(
        "DESIGN_AREA_UNCOVERED",
        "areas",
        `${uncovered.length} 个骨架领域还没写，规范页显示为「待补」：${uncovered.map((entry) => `${entry.title_zh}（${entry.key}）`).join("、")}`,
        "按骨架补上这些领域；补之前开发时参照另一套体系的同名页，并在评审时说明",
      );
    }
    const uncoveredTopics = skeleton.areas
      .filter((entry) => seenAreaKeys.has(entry.key))
      .flatMap((entry) => entry.topics.filter((topic) => !coveredTopics.has(topic.id)));
    if (uncoveredTopics.length > 0) {
      sink.warn(
        "DESIGN_TOPIC_UNCOVERED",
        "areas",
        `${uncoveredTopics.length} 个骨架条目还没写，规范页显示为「待补」：${uncoveredTopics.map((topic) => topic.id).join("、")}`,
        "按骨架补上这些条目",
      );
    }
  }
  if (pendingChecks.length > 0) {
    sink.warn(
      "DESIGN_CHECK_PENDING",
      "",
      `${pendingChecks.length} 条门禁规则的检查尚未接入：${pendingChecks.join("、")}`,
      "检查接入前这些规则按人工评审执行",
    );
  }

  const ok = !sink.issues.some((issue) => issue.severity === "error");
  if (!ok || meta === null) return { ok: false, issues: sink.issues, standard: null };
  return {
    ok: true,
    issues: sink.issues,
    standard: {
      schema: DESIGN_STANDARD_SCHEMA,
      meta,
      sources: [...sources.values()],
      specs: Object.fromEntries(specs),
      areas,
    },
  };
}

// ── 统一骨架 ────────────────────────────────────────────────────────────────

const SKELETON_TOP_KEYS = ["schema", "areas"];
const SKELETON_AREA_KEYS = ["key", "title_zh", "group", "prefix", "summary_zh", "counterparts", "topics"];
const SKELETON_TOPIC_KEYS = ["id", "title_zh"];

export interface DesignSkeletonValidation {
  readonly ok: boolean;
  readonly issues: readonly DesignStandardIssue[];
  readonly skeleton: DesignSkeleton | null;
}

/** 校验统一骨架（闭世界）：领域键 / 前缀 / 条目编号唯一，条目带领域前缀，组件领域写明两套体系的对应组件。 */
export function validateDesignSkeleton(raw: unknown): DesignSkeletonValidation {
  const sink = new IssueSink();
  if (!isRecord(raw)) {
    sink.error("DESIGN_SKELETON_SHAPE", "", "骨架根须为映射", `以 schema: ${DESIGN_SKELETON_SCHEMA} 开头`);
    return { ok: false, issues: sink.issues, skeleton: null };
  }
  if (raw["schema"] !== DESIGN_SKELETON_SCHEMA) {
    sink.error("DESIGN_SKELETON_SHAPE", "schema", `schema 须为 ${DESIGN_SKELETON_SCHEMA}`, `首行写 schema: ${DESIGN_SKELETON_SCHEMA}`);
  }
  sink.unknownKeys(raw, SKELETON_TOP_KEYS, "");
  const areasRaw = raw["areas"];
  const areas: DesignSkeletonArea[] = [];
  const keys = new Set<string>();
  const prefixes = new Set<string>();
  const topicIds = new Set<string>();
  if (!Array.isArray(areasRaw) || areasRaw.length === 0) {
    sink.error("DESIGN_SKELETON_SHAPE", "areas", "areas 必填且非空", "列出全部领域");
    return { ok: false, issues: sink.issues, skeleton: null };
  }
  areasRaw.forEach((areaRaw, index) => {
    const path = `areas[${index}]`;
    if (!isRecord(areaRaw)) {
      sink.error("DESIGN_SKELETON_SHAPE", path, "领域须为映射", "写 key / title_zh / group / prefix / summary_zh / topics");
      return;
    }
    sink.unknownKeys(areaRaw, SKELETON_AREA_KEYS, path);
    const key = sink.requireString(areaRaw, "key", path);
    const title = sink.requireString(areaRaw, "title_zh", path);
    const summary = sink.requireString(areaRaw, "summary_zh", path);
    const group = areaRaw["group"];
    const prefix = areaRaw["prefix"];
    let ok = key !== null && title !== null && summary !== null;
    if (key !== null) {
      if (!AREA_KEY.test(key)) sink.error("DESIGN_IDENTIFIER", `${path}.key`, `领域键 ${key} 不合规`, "小写 snake_case");
      if (keys.has(key)) sink.error("DESIGN_DUPLICATE", `${path}.key`, `领域键 ${key} 重复`, "领域键唯一");
      keys.add(key);
    }
    if (typeof group !== "string" || !(group in DESIGN_AREA_GROUPS)) {
      sink.error("DESIGN_SKELETON_SHAPE", `${path}.group`, `分区 ${String(group)} 不在词表内`, `可选：${Object.keys(DESIGN_AREA_GROUPS).join(" / ")}`);
      ok = false;
    }
    if (typeof prefix !== "string" || !PREFIX.test(prefix)) {
      sink.error("DESIGN_IDENTIFIER", `${path}.prefix`, `领域前缀 ${String(prefix)} 不合规`, "大写点分，如 GRID 或 CMP.BUTTON");
      ok = false;
    } else {
      if (prefixes.has(prefix)) sink.error("DESIGN_DUPLICATE", `${path}.prefix`, `领域前缀 ${prefix} 重复`, "前缀唯一");
      prefixes.add(prefix);
    }
    const isComponent = typeof group === "string" && group.startsWith("components.");
    let counterparts: Record<DesignSystem, readonly string[]> | null = null;
    const counterpartsRaw = areaRaw["counterparts"];
    if (isComponent) {
      if (!isRecord(counterpartsRaw)) {
        sink.error("DESIGN_SKELETON_SHAPE", `${path}.counterparts`, "组件领域要写 counterparts（两套体系各自对应的现成组件，没有就写空表）", "如 { antd: [Button], geist: [Button] }");
        ok = false;
      } else {
        sink.unknownKeys(counterpartsRaw, Object.keys(DESIGN_SYSTEMS), `${path}.counterparts`);
        const out: Partial<Record<DesignSystem, readonly string[]>> = {};
        for (const system of Object.keys(DESIGN_SYSTEMS) as DesignSystem[]) {
          const list = counterpartsRaw[system];
          if (!Array.isArray(list) || !list.every(nonEmptyString)) {
            sink.error("DESIGN_SKELETON_SHAPE", `${path}.counterparts.${system}`, `${system} 的对应组件须为字符串数组（没有就写 []）`, "写组件名");
            ok = false;
          } else {
            out[system] = list.map((item) => item.trim());
          }
        }
        counterparts = out as Record<DesignSystem, readonly string[]>;
      }
    } else if (counterpartsRaw !== undefined) {
      sink.error("DESIGN_SKELETON_SHAPE", `${path}.counterparts`, "只有组件领域写 counterparts", "删掉 counterparts");
    }
    const topicsRaw = areaRaw["topics"];
    const topics: DesignSkeletonTopic[] = [];
    if (!Array.isArray(topicsRaw)) {
      sink.error("DESIGN_SKELETON_SHAPE", `${path}.topics`, "topics 须为数组（组件还没展开时写 []）", "每项 { id, title_zh }");
      ok = false;
    } else {
      if (topicsRaw.length === 0 && !isComponent) {
        sink.error("DESIGN_SKELETON_SHAPE", `${path}.topics`, "非组件领域至少要有一个条目", "列出条目");
      }
      topicsRaw.forEach((topicRaw, topicIndex) => {
        const topicPath = `${path}.topics[${topicIndex}]`;
        if (!isRecord(topicRaw)) {
          sink.error("DESIGN_SKELETON_SHAPE", topicPath, "条目须为映射", "写 id / title_zh");
          ok = false;
          return;
        }
        sink.unknownKeys(topicRaw, SKELETON_TOPIC_KEYS, topicPath);
        const id = sink.requireString(topicRaw, "id", topicPath);
        const topicTitle = sink.requireString(topicRaw, "title_zh", topicPath);
        if (id === null || topicTitle === null) {
          ok = false;
          return;
        }
        if (!RULE_ID.test(id)) sink.error("DESIGN_IDENTIFIER", `${topicPath}.id`, `条目编号 ${id} 不合规`, "大写点分，如 GRID.GUTTER");
        else if (typeof prefix === "string" && !id.startsWith(`${prefix}.`)) {
          sink.error("DESIGN_IDENTIFIER", `${topicPath}.id`, `条目编号 ${id} 不以领域前缀 ${prefix}. 开头`, `改成 ${prefix}.<名称>`);
        }
        if (topicIds.has(id)) sink.error("DESIGN_DUPLICATE", `${topicPath}.id`, `条目编号 ${id} 重复`, "条目编号全骨架唯一");
        topicIds.add(id);
        topics.push({ id, title_zh: topicTitle });
      });
    }
    if (ok && key !== null && title !== null && summary !== null) {
      areas.push({
        key,
        title_zh: title,
        group: group as DesignAreaGroup,
        prefix: prefix as string,
        summary_zh: summary,
        counterparts,
        topics,
      });
    }
  });
  const ok = !sink.issues.some((issue) => issue.severity === "error");
  return { ok, issues: sink.issues, skeleton: ok ? { areas } : null };
}

/** 读统一骨架；文件缺席返回 null，内容不合规返回校验问题。 */
export function readDesignSkeleton(path: string): { readonly skeleton: DesignSkeleton | null; readonly issues: readonly DesignStandardIssue[] } | null {
  if (!existsSync(path)) return null;
  const read = readDesignStandardFile(path);
  if (!read.ok) return { skeleton: null, issues: [read.issue] };
  const validation = validateDesignSkeleton(read.raw);
  return { skeleton: validation.skeleton, issues: validation.issues };
}

// ── 指纹与装载 ──────────────────────────────────────────────────────────────

/** 文本规范化（去 BOM、CRLF → LF）：换行形态变化不改变指纹。 */
export function normalizeDesignText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/**
 * 规范指纹：对（逻辑路径，规范化文本 sha256）逐行排序后取 sha256。Storybook 规范页、AI 孪生与
 * `pomaster design show` 都盖这个指纹——三处一致即同源。
 */
export function designStandardFingerprint(inputs: ReadonlyArray<{ readonly path: string; readonly text: string }>): string {
  const lines = inputs
    .map((input) => `${input.path}\0${createHash("sha256").update(normalizeDesignText(input.text), "utf8").digest("hex")}`)
    .sort();
  return `sha256:${createHash("sha256").update(lines.join("\n"), "utf8").digest("hex")}`;
}

export type DesignFileRead =
  | { readonly ok: true; readonly text: string; readonly raw: unknown }
  | { readonly ok: false; readonly issue: DesignStandardIssue };

export function readDesignStandardFile(path: string): DesignFileRead {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return {
      ok: false,
      issue: {
        severity: "error",
        code: "DESIGN_UNREADABLE",
        path: "",
        message: `读不到规范文件 ${path}：${error instanceof Error ? error.message : String(error)}`,
        hint: "核对路径；项目里规范在 .pomaster/baseline/frontend/design-standard.yaml",
      },
    };
  }
  try {
    return { ok: true, text, raw: loadYaml(text) };
  } catch (error) {
    return {
      ok: false,
      issue: {
        severity: "error",
        code: "DESIGN_UNREADABLE",
        path: "",
        message: `规范文件不是合法 YAML：${error instanceof Error ? error.message : String(error)}`,
        hint: "修正 YAML 语法后重跑",
      },
    };
  }
}

/** 读 design-tokens.yaml 的分组（meta 之外）；文件缺席或不可解析时返回 null。 */
export function readTokenGroups(path: string): { readonly text: string; readonly groups: Record<string, unknown> } | null {
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, "utf8");
    const parsed = loadYaml(text);
    if (!isRecord(parsed)) return null;
    const groups: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key !== "meta") groups[key] = value;
    }
    return { text, groups };
  } catch {
    return null;
  }
}

/** 按 specs 登记表读硬规范原文；目录缺席返回 null（跳过锚点核对）。 */
export function readSpecTexts(specsRoot: string, raw: unknown): Map<string, string> | null {
  if (!existsSync(specsRoot)) return null;
  const out = new Map<string, string>();
  if (!isRecord(raw) || !isRecord(raw["specs"])) return out;
  for (const [key, doc] of Object.entries(raw["specs"])) {
    if (typeof doc !== "string") continue;
    const path = join(specsRoot, doc);
    if (existsSync(path)) out.set(key, readFileSync(path, "utf8"));
  }
  return out;
}
