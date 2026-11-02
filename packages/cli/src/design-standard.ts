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
 * - 正反示例：`template` 是 Vue 模板（Storybook 实时渲染，模板里 `p` 是本条规则的参数、`t` 是
 *   token 表），`code` 是只展示的代码片段。
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
  "patterns.global": "设计模式/全局规则",
  "patterns.principles": "设计模式/原则",
  "patterns.templates": "设计模式/模板文档",
  engineering: "工程规范",
} as const;
export type DesignAreaGroup = keyof typeof DESIGN_AREA_GROUPS;

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

export const DESIGN_EXAMPLE_LANGS = ["vue", "ts", "css", "html"] as const;
export type DesignExampleLang = (typeof DESIGN_EXAMPLE_LANGS)[number];

/** 机器门禁检查词表。`active` = 门禁已实现并接入；未接入的检查在规范页标「待接入」。 */
export interface DesignCheckSpec {
  readonly id: string;
  readonly title_zh: string;
  readonly description_zh: string;
  readonly active: boolean;
}

export const DESIGN_CHECKS: readonly DesignCheckSpec[] = [
  { id: "style.no-raw-color", title_zh: "不写裸色值", description_zh: "样式与内联 style 里不得出现 #hex / rgb() / hsl() 色值，颜色只经 token 取得", active: false },
  { id: "style.spacing-scale", title_zh: "间距在阶梯内", description_zh: "margin / padding / gap 的 px 值必须是间距阶梯里的值", active: false },
  { id: "style.font-size-scale", title_zh: "字号在字阶内", description_zh: "font-size 必须是字阶里的值", active: false },
  { id: "style.font-weight-allowed", title_zh: "字重在允许集内", description_zh: "font-weight 只能取规范允许的字重", active: false },
  { id: "style.font-family-token", title_zh: "字体族取 token", description_zh: "font-family 只能引用规范字体族，不得引入其他字体", active: false },
  { id: "style.breakpoint-allowed", title_zh: "断点取规范值", description_zh: "媒体查询断点只能取断点 token", active: false },
  { id: "style.no-raw-z-index", title_zh: "z-index 取层级 token", description_zh: "z-index 不得写死数值", active: false },
  { id: "markup.single-h1", title_zh: "每个页面视图一个 h1", description_zh: "页面视图内一级标题至多一个", active: false },
  { id: "markup.heading-order", title_zh: "标题不跳级", description_zh: "标题层级逐级下降，不得从 h1 直接到 h3", active: false },
  { id: "markup.heading-level-max", title_zh: "应用界面标题不超过三级", description_zh: "应用界面（非内容页）标题层级不超过 h3", active: false },
  { id: "markup.icon-button-label", title_zh: "纯图标按钮有可访问名称", description_zh: "只有图标的按钮必须带 aria-label 或等效名称", active: false },
  { id: "grid.span-range", title_zh: "栅格跨度合法", description_zh: "a-col 的 span / offset / push / pull 必须是 0–24 的整数", active: false },
  { id: "grid.row-sum", title_zh: "一行不超过 24 栅格", description_zh: "同一 a-row 内静态 span 之和不超过 24", active: false },
  { id: "grid.gutter-allowed", title_zh: "gutter 取规范值", description_zh: "a-row 的 gutter 只能取规范允许的值", active: false },
  { id: "icon.single-library", title_zh: "只用一套图标库", description_zh: "图标只能从规范指定的图标库引入", active: false },
  { id: "markup.single-primary-button", title_zh: "一个按钮区一个主按钮", description_zh: "同一个按钮区（同一父容器内的按钮组）里 type=primary 的按钮至多一个", active: false },
  { id: "text.no-literal-copy", title_zh: "界面文字走文案字典", description_zh: "模板、组件、脚本里不写死自然语言文本，统一经 i18n key 取文案", active: false },
  { id: "text.banned-terms", title_zh: "不用禁用词", description_zh: "文案字典与模板里不出现规范列出的错别字和弃用词（如「其它」「登陆」）", active: false },
  { id: "state.store-library", title_zh: "全局状态库只用 Pinia", description_zh: "不引入 Vuex 等其他全局状态库", active: false },
  { id: "state.no-direct-request", title_zh: "组件不直接发请求", description_zh: "组件与页面里不直接调用 fetch / axios，经生成的接口客户端", active: false },
  { id: "perf.lazy-load", title_zh: "路由与重组件按需加载", description_zh: "路由组件用动态 import；应用入口不同步引入重型依赖", active: false },
  { id: "perf.no-full-library-import", title_zh: "组件库按需引入", description_zh: "不整包注册组件库（app.use(Antd) / 全量引入 Vant）", active: false },
  { id: "format.no-local-pattern", title_zh: "日期数字走格式化注册表", description_zh: "页面里不手拼日期格式串、不硬编码货币符号，统一经格式化注册表输出", active: false },
];

const CHECK_IDS = new Set(DESIGN_CHECKS.map((check) => check.id));

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

export interface DesignRule {
  readonly id: string;
  readonly title_zh: string;
  readonly statement_zh: string;
  readonly rationale_zh: string | null;
  readonly surfaces: readonly DesignSurface[];
  readonly params: readonly DesignParam[];
  readonly anchors: readonly DesignAnchor[];
  readonly enforcement: DesignEnforcement;
  readonly examples: readonly DesignExample[];
}

export interface DesignArea {
  readonly key: string;
  readonly title_zh: string;
  readonly group: DesignAreaGroup;
  readonly group_title_zh: string;
  readonly prefix: string;
  readonly summary_zh: string;
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
const PREFIX = /^[A-Z][A-Z0-9]*$/;
const RULE_ID = /^[A-Z][A-Z0-9]*(\.[A-Z][A-Z0-9_]*)+$/;
const SOURCE_ID = /^SRC(\.[A-Z0-9_]+)+$/;
const SPEC_KEY = /^[a-z][a-z0-9_]*$/;
const PARAM_KEY = /^[a-z][a-z0-9_]*$/;
const TOKEN_PATH = /^[a-z][a-z_]*(\.[a-z][a-z0-9_]*)+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const TOP_KEYS = ["schema", "meta", "sources", "specs", "areas"];
const META_KEYS = ["origin", "customized", "design_system", "ui_library"];
const SOURCE_KEYS = ["title_zh", "url", "retrieved", "note_zh"];
const AREA_KEYS = ["key", "title_zh", "group", "prefix", "summary_zh", "rules"];
const RULE_KEYS = ["id", "title_zh", "statement_zh", "rationale_zh", "surfaces", "params", "anchors", "enforcement", "examples"];
const PARAM_KEYS = ["token", "value", "decision", "candidates", "unit", "source", "label_zh", "note_zh"];
const ANCHOR_KEYS = ["spec", "quote"];
const ENFORCEMENT_KEYS = ["kind", "check"];
const EXAMPLE_KEYS = ["kind", "title_zh", "note_zh", "template", "jsx", "code", "lang"];

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
  return { id, title_zh: title, statement_zh: statement, rationale_zh: rationale, surfaces, params, anchors, enforcement, examples };
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
      if (key !== null && title !== null && summary !== null && groupOk && prefix !== null) {
        const groupKey = group as DesignAreaGroup;
        areas.push({ key, title_zh: title, group: groupKey, group_title_zh: DESIGN_AREA_GROUPS[groupKey], prefix, summary_zh: summary, rules });
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
