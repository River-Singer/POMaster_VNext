/**
 * design-check.ts —— 设计规范的机器门禁（`pomaster design check`；check --gates 的 GATE.DESIGN.STANDARD）。
 *
 * 判卷依据是项目的设计规范本身：只跑规范里 enforcement=gate、且检查已实现的条文；阈值（间距阶梯、字阶、
 * 字重、栅格列数、允许的列间距、圆角档位、断点、禁用词、全局状态库……）从条文参数读。参数还是决策位时
 * 这条检查记「待定」，不替项目猜默认值。
 *
 * 扫描是静态、逐文件的：.vue 拆成 template / script / style 三段；.tsx / .jsx / .ts / .js 整体当脚本（JSX 也在里面）；
 * .css / .scss / .less 当样式。先把注释抹成空白（行列不变），再按每条检查各自的写法模式匹配。它找的是源码写法上的
 * 违规，不跑页面——渲染层面的问题（对比度、溢出、真实交互）归 verify 的浏览器检查与原型事实对账。
 *
 * 豁免：在违规行或它的上一行写注释 `pomaster-design-ignore <检查编号>[, …]: 理由`。没写理由的豁免不生效并给警告，
 * 所以每个例外都留下了为什么。
 *
 * 存量基线：老项目采用规范时，已有的违规按「检查 × 文件」记一个数（.pomaster/baseline/frontend/design-check-baseline.json，
 * `pomaster design check --write-baseline` 写）。之后只拦超出存量的部分；某个文件的违规少于存量时提示收紧。
 * 新文件没有存量，第一处违规就拦。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative } from "node:path";
import { absenceRecord, type GateResultRecord } from "@pomaster/gauntlet-lite";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { loadDesignStandard, type DesignSourceMode, type DesignValidateInput } from "./design.js";
import {
  DESIGN_CHECKS,
  DESIGN_STANDARD_RELATIVE,
  readTokenGroups,
  type DesignParam,
  type DesignRule,
  type DesignSystem,
  type NormalizedDesignStandard,
} from "./design-standard.js";
import { POMASTER_DIR } from "./store-layout.js";

// ============================================================
// 源码模型
// ============================================================

const SOURCE_EXTS = new Set([".vue", ".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs", ".css", ".scss", ".less"]);
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "out", "coverage", ".git", ".pomaster", "storybook-static", ".storybook", ".next",
  ".nuxt", ".output", ".turbo", ".vite", ".cache", "public", "vendor", "__tests__", "__mocks__", "tests", "test", "e2e",
  "cypress", "playwright",
]);
const SKIP_FILE =
  /(\.d\.ts|\.(spec|test|stories)\.[cm]?[jt]sx?|\.stories\.vue|\.min\.(js|css))$|(^|\/)[^/]+\.config\.[cm]?[jt]s$/;
/** shadcn 一类「按文件落进项目」的组件库层：等同依赖，不按业务代码判。 */
const LIBRARY_LAYER = /(^|\/)components\/ui\//;
/** 脚手架生成的管理侧 / 用户侧前端在 frontend/<面>/src。 */
const DEFAULT_ROOT_CANDIDATES = ["frontend/admin/src", "frontend/public/src", "frontend/src", "web/src", "client/src", "ui/src", "app/src"];
const MAX_FILES = 5000;
const MAX_FILE_BYTES = 512 * 1024;
const FINDINGS_PER_FILE_CHECK = 10;

interface Segment {
  readonly kind: "code" | "style";
  /** 段在文件里的起始偏移。 */
  readonly start: number;
  /** 注释已抹成空白的段文本（与原文等长）。 */
  readonly text: string;
  readonly lang: string;
  /** 段里可能有标签（Vue 模板、JSX）。 */
  readonly markup: boolean;
}

interface FileRole {
  readonly page: boolean;
  readonly router: boolean;
  readonly entry: boolean;
  readonly locale: boolean;
  readonly formatRegistry: boolean;
  readonly apiLayer: boolean;
  readonly component: boolean;
  readonly tokens: boolean;
  readonly content: boolean;
}

export interface SourceUnit {
  /** 相对项目根的路径（正斜杠）。 */
  readonly path: string;
  readonly raw: string;
  readonly segments: readonly Segment[];
  readonly role: FileRole;
  readonly lineStarts: readonly number[];
}

function blank(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

function blankHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, blank);
}

function blankStyleComments(text: string, lang: string): string {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (lang === "scss" || lang === "less") {
    out = out.replace(/(^|[\s;{}])(\/\/[^\n]*)/g, (_m, lead: string, comment: string) => lead + blank(comment));
  }
  return out;
}

/** 抹掉脚本注释，字符串原样保留（模板字符串里的 `${}` 不再细分）。 */
export function blankScriptComments(text: string): string {
  const out = text.split("");
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      for (let k = i; k < stop; k += 1) out[k] = " ";
      i = stop;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      for (let k = i; k < stop; k += 1) if (text[k] !== "\n") out[k] = " ";
      i = stop;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      let k = i + 1;
      while (k < text.length) {
        const ch = text[k];
        if (ch === "\\") {
          k += 2;
          continue;
        }
        if (ch === c) break;
        if (ch === "\n" && c !== "`") break;
        k += 1;
      }
      i = k + 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

function langOf(attrs: string, fallback: string): string {
  const match = /\blang\s*=\s*["']([\w-]+)["']/.exec(attrs);
  return match?.[1]?.toLowerCase() ?? fallback;
}

function vueSegments(raw: string): Segment[] {
  const segments: Segment[] = [];
  const open = /^<(template|script|style)(\b[^>]*)>/gm;
  let match: RegExpExecArray | null;
  while ((match = open.exec(raw)) !== null) {
    const tag = match[1] as "template" | "script" | "style";
    const attrs = match[2] ?? "";
    const start = match.index + match[0].length;
    const close = new RegExp(`^</${tag}>`, "gm");
    close.lastIndex = start;
    const end = close.exec(raw);
    const stop = end === null ? raw.length : end.index;
    const body = raw.slice(start, stop);
    if (tag === "template") {
      segments.push({ kind: "code", start, text: blankHtmlComments(body), lang: "html", markup: true });
    } else if (tag === "script") {
      const lang = langOf(attrs, "js");
      segments.push({ kind: "code", start, text: blankScriptComments(body), lang, markup: lang === "tsx" || lang === "jsx" });
    } else {
      const lang = langOf(attrs, "css");
      segments.push({ kind: "style", start, text: blankStyleComments(body, lang), lang, markup: false });
    }
    open.lastIndex = stop;
  }
  return segments;
}

function roleOf(path: string): FileRole {
  const p = `/${path.toLowerCase()}`;
  const base = basename(p);
  const locale = /\/(locales?|i18n|lang|langs|messages)\//.test(p) || /^(zh|en|ja|ko|fr|de)([-_][a-z]{2,4})?\.(json|[cm]?[jt]s)$/.test(base);
  return {
    page: /\/(views|pages|routes)\//.test(p) || /^(page|layout)\.[jt]sx$/.test(base) || /(page|view)\.vue$/.test(base),
    router: /\/router\//.test(p) || /^(router|routes)\.[cm]?[jt]sx?$/.test(base),
    entry: /^(main|index|app)\.[cm]?[jt]sx?$/.test(base) && !/\/(views|pages|routes|components|router|api|stores?)\//.test(p),
    locale,
    formatRegistry: locale || /\/(format|formats|formatters?)(\/|\.)/.test(p) || /\/utils?\/(date|time|number|money|currency|format)/.test(p),
    apiLayer: /\/(api|apis|services?|clients?|http|requests?|queries|query|generated)(\/|\.)/.test(p) || /\/lib\/(api|http|fetch)/.test(p),
    component: /\/(components|views|pages|layouts|features|widgets|app|routes)\//.test(p) || base.endsWith(".vue"),
    tokens: /\/(tokens?|themes?|design-tokens)(\/|\.[a-z]+$)/.test(p) || /^(tokens?|themes?|variables|vars|design-tokens)\.(css|scss|less|[cm]?[jt]s)$/.test(base),
    content: /\/(content|docs|articles|blog|posts)\//.test(p),
  };
}

export function parseSourceUnit(path: string, raw: string): SourceUnit {
  const ext = extname(path).toLowerCase();
  let segments: Segment[];
  if (ext === ".vue") segments = vueSegments(raw);
  else if (ext === ".css" || ext === ".scss" || ext === ".less") {
    segments = [{ kind: "style", start: 0, text: blankStyleComments(raw, ext.slice(1)), lang: ext.slice(1), markup: false }];
  } else {
    segments = [{ kind: "code", start: 0, text: blankScriptComments(raw), lang: ext.slice(1), markup: ext === ".tsx" || ext === ".jsx" }];
  }
  const lineStarts = [0];
  for (let i = 0; i < raw.length; i += 1) if (raw[i] === "\n") lineStarts.push(i + 1);
  return { path, raw, segments, role: roleOf(path), lineStarts };
}

function position(unit: SourceUnit, offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = unit.lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((unit.lineStarts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - (unit.lineStarts[lo] ?? 0) + 1 };
}

function lineText(unit: SourceUnit, line: number): string {
  const start = unit.lineStarts[line - 1] ?? 0;
  const end = unit.lineStarts[line] ?? unit.raw.length + 1;
  return unit.raw.slice(start, end - 1);
}

// ============================================================
// 样式声明、对象样式、Tailwind 类
// ============================================================

interface Decl {
  readonly prop: string;
  readonly value: string;
  readonly at: number;
  readonly custom: boolean;
}

const DECL = /(^|[;{\s])(--)?([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;{}\n]*?)\s*(?=;|\}|\n|$)/g;
const FONT_FACE = /@font-face\s*\{[^}]*\}/g;

function* declsIn(text: string, base: number): Generator<Decl> {
  DECL.lastIndex = 0;
  const re = new RegExp(DECL.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = match[4] ?? "";
    if (value.length === 0) continue;
    const prop = (match[3] ?? "").toLowerCase();
    const valueAt = match.index + match[0].lastIndexOf(value);
    yield { prop, value, at: base + valueAt, custom: match[2] === "--" };
  }
}

const UNITLESS = new Set(["z-index", "font-weight", "opacity", "line-height", "flex", "flex-grow", "flex-shrink", "order", "zoom"]);

function kebab(key: string): string {
  return key.replace(/^['"]|['"]$/g, "").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** 对象样式里的字面量键值对：Vue `:style="{…}"` 与 JSX `style={{…}}`。数字按 React 规则补 px。 */
function* objectDecls(text: string, base: number): Generator<Decl> {
  const re = /([a-zA-Z]+|'[a-zA-Z-]+'|"[a-zA-Z-]+")\s*:\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\\n$]*)`|(-?\d+(?:\.\d+)?)(?![\w.]))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const prop = kebab(match[1] ?? "");
    const literal = match[2] ?? match[3] ?? match[4];
    const number = match[5];
    let value: string;
    if (literal !== undefined) value = literal;
    else if (number !== undefined) value = number === "0" || UNITLESS.has(prop) ? number : `${number}px`;
    else continue;
    const at = base + match.index + match[0].length - (literal !== undefined ? literal.length + 1 : (number ?? "").length);
    yield { prop, value, at, custom: false };
  }
}

function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === "{" || c === "(" || c === "[") depth += 1;
    else if (c === "}" || c === ")" || c === "]") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

/** 一个文件里全部样式声明：样式段 + 模板里的静态 style 与对象样式。 */
function* allDecls(unit: SourceUnit): Generator<Decl> {
  for (const seg of unit.segments) {
    if (seg.kind === "style") {
      yield* declsIn(seg.text.replace(FONT_FACE, blank), seg.start);
      continue;
    }
    if (!seg.markup) continue;
    const staticStyle = /(?<![:\w.-])style\s*=\s*(["'])([^"'{}]*)\1/g;
    let match: RegExpExecArray | null;
    while ((match = staticStyle.exec(seg.text)) !== null) {
      const inner = match[2] ?? "";
      yield* declsIn(inner, seg.start + match.index + match[0].indexOf(inner));
    }
    const vueObject = /(?::|v-bind:)style\s*=\s*"([^"]*)"/g;
    while ((match = vueObject.exec(seg.text)) !== null) {
      const inner = match[1] ?? "";
      yield* objectDecls(inner, seg.start + match.index + match[0].indexOf(inner));
    }
    const jsxObject = /\bstyle\s*=\s*\{\s*\{/g;
    while ((match = jsxObject.exec(seg.text)) !== null) {
      const open = seg.text.indexOf("{", match.index + match[0].length - 1);
      const close = matchBrace(seg.text, open);
      yield* objectDecls(seg.text.slice(open, close + 1), seg.start + open);
    }
  }
}

interface Utility {
  /** 去掉变体前缀后的类名（如 `p-[13px]`、`rounded-md`）。 */
  readonly name: string;
  readonly variants: readonly string[];
  /** 任意值（方括号里的内容）；具名类为 null。 */
  readonly arbitrary: string | null;
  /** 方括号前的工具名（任意值类）。 */
  readonly base: string;
  readonly at: number;
  /** 同一个类串里的其他类（用于「同一元素」判断）。 */
  readonly siblings: readonly string[];
}

const UTILITYISH = /^!?-?[a-z][a-z0-9]*(-[a-z0-9.[\]#%(),/_:!-]+)*(\/[\w.[\]]+)?$/;
const SINGLE_WORD_UTILITIES = new Set(["flex", "grid", "block", "hidden", "inline", "rounded", "border", "shadow", "transition", "truncate", "italic", "underline", "relative", "absolute", "fixed", "sticky", "contents", "container", "grow", "shrink", "uppercase", "lowercase", "capitalize"]);

function splitVariants(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const c of token) {
    if (c === "[") depth += 1;
    if (c === "]") depth -= 1;
    if (c === ":" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts;
}

function* classTokens(text: string, base: number): Generator<{ token: string; at: number }> {
  const re = /[^\s'"`{}(),;<>]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const token = (match[0] ?? "").replace(/:$/, "");
    if (token.length > 0) yield { token, at: base + match.index };
  }
}

function classLike(tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  let hits = 0;
  for (const token of tokens) {
    const utility = splitVariants(token).pop() ?? "";
    if (SINGLE_WORD_UTILITIES.has(utility.replace(/^!/, "")) || (UTILITYISH.test(utility) && /-/.test(utility))) hits += 1;
  }
  return hits * 2 >= tokens.length;
}

/** Tailwind 一类的工具类：只在「像类名串」的字符串里找（文案里的 rounded 一词不算）。 */
function* utilities(unit: SourceUnit): Generator<Utility> {
  for (const seg of unit.segments) {
    const chunks: Array<{ text: string; at: number }> = [];
    if (seg.kind === "code") {
      const literal = /(["'`])((?:\\.|(?!\1)[^\\\n])*?)\1|`((?:\\.|[^\\`])*)`/g;
      let match: RegExpExecArray | null;
      while ((match = literal.exec(seg.text)) !== null) {
        const inner = match[2] ?? match[3] ?? "";
        chunks.push({ text: inner, at: seg.start + match.index + 1 });
      }
    } else {
      const apply = /@apply\s+([^;}\n]+)/g;
      let match: RegExpExecArray | null;
      while ((match = apply.exec(seg.text)) !== null) {
        const inner = match[1] ?? "";
        chunks.push({ text: inner, at: seg.start + match.index + match[0].indexOf(inner) });
      }
    }
    for (const chunk of chunks) {
      const tokens = [...classTokens(chunk.text, chunk.at)];
      if (!classLike(tokens.map((t) => t.token))) continue;
      const names = tokens.map((t) => splitVariants(t.token).pop() ?? "");
      for (const { token, at } of tokens) {
        const parts = splitVariants(token);
        const name = (parts.pop() ?? "").replace(/^!/, "");
        const arbitrary = /^(-?[a-z][a-z0-9-]*?)-\[(.+)\]$/.exec(name);
        yield {
          name,
          variants: parts,
          arbitrary: arbitrary?.[2] ?? null,
          base: arbitrary?.[1] ?? name,
          at,
          siblings: names,
        };
      }
    }
  }
}

// ============================================================
// 值的解析
// ============================================================

function stripVar(value: string): string {
  let out = value;
  for (let guard = 0; guard < 10; guard += 1) {
    const at = out.search(/var\(/);
    if (at === -1) break;
    const close = matchBrace(out, at + 3);
    out = `${out.slice(0, at)}${out.slice(close + 1)}`;
  }
  return out;
}

const RAW_COLOR = /(^|[^\w&-])(#[0-9a-fA-F]{3,8}(?![\w-])|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(\s*-?[\d.])/;
const NAMED_COLORS = new Set([
  "red", "green", "blue", "white", "black", "gray", "grey", "orange", "yellow", "purple", "pink", "brown", "cyan", "magenta",
  "navy", "teal", "silver", "gold", "maroon", "olive", "lime", "aqua", "fuchsia", "indigo", "violet", "crimson", "tomato",
  "coral", "salmon", "skyblue", "steelblue", "lightgray", "lightgrey", "darkgray", "darkgrey", "whitesmoke", "gainsboro",
]);
const COLOR_PROPS = /(color|^background|^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^outline$|^fill$|^stroke$|^text-shadow$|^column-rule$|^text-decoration$)/;

function rawColorIn(prop: string, value: string): string | null {
  const stripped = stripVar(value).replace(/url\([^)]*\)/g, "");
  const match = RAW_COLOR.exec(stripped);
  if (match !== null) {
    const at = match.index + (match[1] ?? "").length;
    const close = stripped.indexOf(")", at);
    return /^#/.test(match[2] ?? "") || close === -1 ? (match[2] ?? "") : stripped.slice(at, close + 1);
  }
  if (COLOR_PROPS.test(prop)) {
    for (const word of stripped.toLowerCase().split(/[\s,/()]+/)) if (NAMED_COLORS.has(word)) return word;
  }
  return null;
}

/** 长度 → px（rem 按 16）；不是绝对长度（%、em、vh、calc…）时为 null。 */
function toPx(token: string): number | null {
  const match = /^(-?\d*\.?\d+)(px|rem)?$/.exec(token.trim());
  if (match === null) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  if (match[2] === undefined) return n === 0 ? 0 : null;
  return match[2] === "rem" ? n * 16 : n;
}

function lengthTokens(value: string): string[] {
  const stripped = stripVar(value).replace(/!important/g, "");
  if (/calc\(|min\(|max\(|clamp\(/.test(stripped)) return [];
  return stripped.split(/[\s,/]+/).filter((token) => token.length > 0);
}

const LAYOUT_PROPS = /^(all|width|height|top|left|right|bottom|inset(-.*)?|margin(-.*)?|padding(-.*)?|(max|min)-(width|height)|flex-basis|grid-template-.*|font-size|line-height|border-width)$/;
const TIME = /^-?\d*\.?\d+m?s$/;
const EASING_OR_KEYWORD = /^(ease(-in)?(-out)?|linear|step-start|step-end|steps\(.*|cubic-bezier\(.*|initial|inherit|unset|none|normal|allow-discrete)$/;

/** transition 简写里动的属性；只写了时长 = all。 */
function transitionProps(value: string): string[] {
  const out: string[] = [];
  for (const part of stripVar(value).split(",")) {
    const words = part.trim().split(/\s+/).filter((word) => word.length > 0);
    const prop = words.find((word) => !TIME.test(word) && !EASING_OR_KEYWORD.test(word));
    // 只写了时长（`transition: .2s`）= all；`transition: none` 之类的关键字不动任何属性
    out.push(prop ?? (words.some((word) => TIME.test(word)) ? "all" : ""));
  }
  return out.filter((prop) => prop.length > 0);
}

// ============================================================
// 标签
// ============================================================

interface Tag {
  readonly name: string;
  readonly at: number;
  readonly end: number;
  readonly head: string;
  readonly selfClosing: boolean;
}

function* tags(text: string, names: RegExp): Generator<Tag> {
  const re = new RegExp(`<(${names.source})(?=[\\s>/])`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const at = match.index;
    let quote: string | null = null;
    let brace = 0;
    let i = at + 1;
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (quote !== null) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") brace += 1;
      else if (c === "}") brace -= 1;
      else if (c === ">" && brace <= 0) break;
    }
    const head = text.slice(at, i + 1);
    yield { name: match[1] ?? "", at, end: i + 1, head, selfClosing: /\/\s*>$/.test(head) };
  }
}

function attr(head: string, name: string): { raw: string; bound: boolean } | null {
  const re = new RegExp(`(?<![\\w-])(:|v-bind:)?${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\})`);
  const match = re.exec(head);
  if (match === null) return null;
  const raw = match[2] ?? match[3] ?? match[4] ?? "";
  return { raw, bound: match[1] !== undefined || match[4] !== undefined };
}

function hasAttr(head: string, name: string): boolean {
  return new RegExp(`(?<![\\w-])(:|v-bind:)?${name}(?=[\\s=/>])`).test(head);
}

function innerOf(text: string, tag: Tag): string {
  if (tag.selfClosing) return "";
  const close = text.indexOf(`</${tag.name}>`, tag.end);
  return close === -1 ? "" : text.slice(tag.end, close);
}

/** 属性里的字面整数（"12"、:span="12"、{12}）；表达式返回 null。 */
function literalInts(raw: string): number[] | null {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, "");
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return [Number(trimmed)];
  if (/^\[[\d\s,.-]+\]$/.test(trimmed)) return trimmed.slice(1, -1).split(",").map((s) => Number(s.trim()));
  if (/^\{[\w\s:,.-]+\}$/.test(trimmed)) {
    return [...trimmed.matchAll(/:\s*(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  }
  return null;
}

// ============================================================
// 导入
// ============================================================

interface ImportRef {
  readonly source: string;
  readonly defaultName: string | null;
  readonly namespace: string | null;
  readonly named: readonly string[];
  readonly at: number;
}

function* imports(unit: SourceUnit): Generator<ImportRef> {
  for (const seg of unit.segments) {
    if (seg.kind !== "code" || seg.lang === "html") continue;
    const re = /\bimport\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\*\s*as\s+([\w$]+)\s*)?(?:\{([^}]*)\}\s*)?from\s*(['"])([^'"\n]+)\4|\bimport\s*(['"])([^'"\n]+)\6|\b(?:require|import)\s*\(\s*(['"])([^'"\n]+)\8\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(seg.text)) !== null) {
      const typeOnly = /^import\s+type\b/.test(match[0]);
      const defaultName = typeOnly ? null : (match[1] ?? null);
      yield {
        source: match[5] ?? match[7] ?? match[9] ?? "",
        defaultName,
        namespace: typeOnly ? null : (match[2] ?? null),
        named: (match[3] ?? "").split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0] ?? "").filter((s) => s.length > 0),
        at: seg.start + match.index,
      };
    }
  }
}

// ============================================================
// 检查实现
// ============================================================

type Emit = (offset: number, message: string) => void;

interface CheckEnv {
  readonly system: DesignSystem;
  /** 绑定到这条检查的条文。 */
  readonly rules: readonly DesignRule[];
  readonly param: (ruleId: string, key: string) => DesignParam | undefined;
  readonly tokens: Readonly<Record<string, unknown>> | null;
}

interface ProjectFacts {
  /** 项目里有全局的减少动效兜底（`*` 选择器把动画关掉）。 */
  readonly globalReducedMotion: boolean;
}

type Prepared = { readonly pending: string } | { readonly config: unknown };

interface CheckImpl {
  readonly prepare?: (env: CheckEnv) => Prepared;
  readonly scan: (unit: SourceUnit, config: never, emit: Emit, project: ProjectFacts) => void;
}

function numbersOf(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(numbersOf);
  return [];
}

function paramNumbers(rules: readonly DesignRule[], skip: RegExp = /$^/): { values: number[]; pending: string[] } {
  const values: number[] = [];
  const pending: string[] = [];
  for (const rule of rules) {
    for (const param of rule.params) {
      if (skip.test(param.key)) continue;
      if (param.pending) {
        pending.push(`${rule.id}.${param.key}`);
        continue;
      }
      values.push(...numbersOf(param.value));
    }
  }
  return { values: [...new Set(values)].sort((a, b) => a - b), pending };
}

function codeSegments(unit: SourceUnit): Segment[] {
  return unit.segments.filter((seg) => seg.kind === "code");
}

function markupSegments(unit: SourceUnit): Segment[] {
  return unit.segments.filter((seg) => seg.markup);
}

function regexEach(unit: SourceUnit, segments: readonly Segment[], re: RegExp, onMatch: (m: RegExpExecArray, seg: Segment) => void): void {
  for (const seg of segments) {
    const scoped = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = scoped.exec(seg.text)) !== null) {
      onMatch(match, seg);
      if (match[0].length === 0) scoped.lastIndex += 1;
    }
  }
}

const fmt = (values: readonly number[]): string => values.join(" / ");
const styleExempt = (unit: SourceUnit): boolean => unit.role.tokens;

// Tailwind v4 默认档（圆角、断点），具名类换算成 px 后与规范阈值比。
const TW_RADIUS: Readonly<Record<string, number>> = { none: 0, xs: 2, sm: 4, "": 4, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24, "4xl": 32, full: Number.POSITIVE_INFINITY };
const TW_BREAKPOINTS: Readonly<Record<string, number>> = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };
const TW_WEIGHTS: Readonly<Record<string, number>> = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const TW_COLOR_UTIL = "bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow";
const TW_PALETTE = new RegExp(`^(?:${TW_COLOR_UTIL})-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)(\\/.+)?$`);
const TW_COLOR_BASE = new RegExp(`^(?:${TW_COLOR_UTIL})$`);
const TW_SPACING = /^-?(p[xytrblse]?|m[xytrblse]?|gap(-[xy])?|space-[xy])$/;
const TW_RADIUS_NAMED = /^rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?(?:-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?$/;

function radiusAllowed(px: number, allowed: readonly number[]): boolean {
  return px === 0 || px >= 999 || allowed.includes(px);
}

const CHECKS: Readonly<Record<string, CheckImpl>> = {
  // ── 颜色 ────────────────────────────────────────────────
  "style.no-raw-color": {
    scan(unit, _config: null, emit) {
      if (styleExempt(unit)) return;
      for (const decl of allDecls(unit)) {
        if (decl.custom || decl.prop === "box-shadow") continue;
        const raw = rawColorIn(decl.prop, decl.value);
        if (raw !== null) emit(decl.at, `${decl.prop} 写了裸色值 ${raw}，颜色只经 token 取`);
      }
      for (const u of utilities(unit)) {
        if (u.arbitrary !== null && TW_COLOR_BASE.test(u.base) && RAW_COLOR.test(` ${u.arbitrary.replace(/_/g, " ")}`)) {
          emit(u.at, `${u.name} 用任意值写了裸色值，改用色彩 token 类`);
        } else if (TW_PALETTE.test(u.name)) {
          emit(u.at, `${u.name} 取的是 Tailwind 默认色板，不是规范色彩 token`);
        }
      }
      regexEach(unit, markupSegments(unit), /(?<![\w-])(?::|v-bind:)?(color|fill|stroke|background|bg-color|stop-color|flood-color)\s*=\s*\{?\s*["'`]\s*'?(#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\(\s*[\d.])/, (m, seg) => {
        emit(seg.start + m.index, `属性 ${m[1]} 写了裸色值 ${m[2]}，改用 token`);
      });
      regexEach(unit, codeSegments(unit).filter((seg) => !seg.markup || seg.lang !== "html"), /(?<![\w$])([a-zA-Z]*(?:[cC]olor|[bB]ackground|[fF]ill|[sS]troke))\s*:\s*(["'`])(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\(\s*[\d.][^"'`]*)\2/, (m, seg) => {
        emit(seg.start + m.index, `${m[1]} 写了裸色值 ${m[3]}，改用 token`);
      });
    },
  },
  // ── 字体 ────────────────────────────────────────────────
  "style.font-family-token": {
    prepare(env) {
      const families = env.rules.flatMap((rule) => rule.params.filter((p) => !p.pending && typeof p.value === "string").map((p) => String(p.value).toLowerCase()));
      return { config: families };
    },
    scan(unit, families: readonly string[], emit) {
      if (styleExempt(unit)) return;
      for (const decl of allDecls(unit)) {
        if (decl.custom || decl.prop !== "font-family") continue;
        const value = decl.value.trim();
        if (/^var\(/.test(value) || /^(inherit|initial|unset|revert)$/.test(value)) continue;
        const first = (value.split(",")[0] ?? "").trim().replace(/^['"]|['"]$/g, "").toLowerCase();
        if (families.includes(first)) continue;
        emit(decl.at, `font-family 写死了 ${value}，字体族只经规范 token 取`);
      }
      for (const u of utilities(unit)) {
        if (u.base === "font" && u.arbitrary !== null && !/^\d+$/.test(u.arbitrary) && !/^var\(/.test(u.arbitrary)) {
          emit(u.at, `${u.name} 用任意值指定字体族，改用 font-sans / font-mono`);
        }
      }
    },
  },
  "style.font-size-scale": {
    prepare(env) {
      const { values, pending } = paramNumbers(env.rules, /line|max|weight|level/);
      return values.length > 0 ? { config: values } : { pending: `字阶参数未定（${pending.join("、") || "条文没有字阶参数"}）` };
    },
    scan(unit, scale: readonly number[], emit) {
      if (styleExempt(unit)) return;
      const check = (token: string, at: number, label: string): void => {
        const px = toPx(token);
        if (px !== null && px !== 0 && !scale.includes(px)) emit(at, `${label} ${token} 不在字阶内（${fmt(scale)}）`);
      };
      for (const decl of allDecls(unit)) {
        if (decl.custom || decl.prop !== "font-size") continue;
        for (const token of lengthTokens(decl.value)) check(token, decl.at, "font-size");
      }
      for (const u of utilities(unit)) {
        if (u.base === "text" && u.arbitrary !== null && toPx(u.arbitrary) !== null) check(u.arbitrary, u.at, u.name);
      }
    },
  },
  "style.font-weight-allowed": {
    prepare(env) {
      const allowed = new Set(paramNumbers(env.rules).values);
      const range = env.param("TYPE.FAMILY", "weights");
      const bounds = range !== undefined && !range.pending ? numbersOf(range.value) : [];
      if (bounds.length === 2) for (let w = Math.min(...bounds); w <= Math.max(...bounds); w += 100) allowed.add(w);
      else bounds.forEach((w) => allowed.add(w));
      return allowed.size > 0 ? { config: [...allowed].sort((a, b) => a - b) } : { pending: "允许的字重未定" };
    },
    scan(unit, allowed: readonly number[], emit) {
      if (styleExempt(unit)) return;
      const named: Record<string, number> = { normal: 400, bold: 700 };
      for (const decl of allDecls(unit)) {
        if (decl.custom || decl.prop !== "font-weight") continue;
        const value = decl.value.trim().toLowerCase();
        const weight = /^\d+$/.test(value) ? Number(value) : named[value];
        if (weight !== undefined && !allowed.includes(weight)) emit(decl.at, `font-weight ${value} 不在允许的字重内（${fmt(allowed)}）`);
      }
      for (const u of utilities(unit)) {
        const weight = u.base === "font" && u.arbitrary !== null && /^\d+$/.test(u.arbitrary) ? Number(u.arbitrary) : TW_WEIGHTS[u.name.replace(/^font-/, "")];
        if (weight !== undefined && /^font-/.test(u.name) && !allowed.includes(weight)) emit(u.at, `${u.name}（${weight}）不在允许的字重内（${fmt(allowed)}）`);
      }
    },
  },
  // ── 标题 ────────────────────────────────────────────────
  "markup.single-h1": {
    scan(unit, _config: null, emit) {
      if (!unit.role.page) return;
      let count = 0;
      regexEach(unit, markupSegments(unit), /<h1(?=[\s>/])/, (m, seg) => {
        count += 1;
        if (count === 2) emit(seg.start + m.index, "页面视图里出现第二个 h1：一个页面只有一个一级标题");
      });
    },
  },
  "markup.heading-order": {
    scan(unit, _config: null, emit) {
      let previous = 0;
      for (const seg of markupSegments(unit)) {
        for (const tag of tags(seg.text, /h[1-6]|a-typography-title|ATypographyTitle|Typography\.Title/)) {
          const level = /^h[1-6]$/.test(tag.name) ? Number(tag.name.slice(1)) : Number((literalInts(attr(tag.head, "level")?.raw ?? "1") ?? [1])[0]);
          if (previous > 0 && level > previous + 1) emit(seg.start + tag.at, `标题从 h${previous} 跳到 h${level}，层级要逐级下降`);
          previous = level;
        }
      }
    },
  },
  "markup.heading-level-max": {
    scan(unit, _config: null, emit) {
      if (unit.role.content) return;
      for (const seg of markupSegments(unit)) {
        for (const tag of tags(seg.text, /h[4-6]|a-typography-title|ATypographyTitle|Typography\.Title/)) {
          const level = /^h[4-6]$/.test(tag.name) ? Number(tag.name.slice(1)) : Number((literalInts(attr(tag.head, "level")?.raw ?? "1") ?? [1])[0]);
          if (level > 3) emit(seg.start + tag.at, `应用界面用到了 h${level}：标题不超过三级`);
        }
      }
    },
  },
  // ── 图标 ────────────────────────────────────────────────
  "icon.single-library": {
    prepare(env) {
      const allowed = env.rules.flatMap((rule) =>
        rule.params.filter((p) => !p.pending && typeof p.value === "string" && /^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9.-]*$/.test(String(p.value))).map((p) => String(p.value)),
      );
      return allowed.length > 0 ? { config: allowed } : { pending: "规范没定图标库" };
    },
    scan(unit, allowed: readonly string[], emit) {
      const ICON_LIBS = /^(@ant-design\/icons(-vue)?|lucide-react|lucide-vue-next|lucide|@heroicons\/.+|react-icons(\/.*)?|@fortawesome\/.+|@mdi\/.+|@iconify\/.+|@tabler\/icons.*|@phosphor-icons\/.+|phosphor-react|@radix-ui\/react-icons|@element-plus\/icons-vue|@vicons\/.+|@geist-ui\/icons|@vercel\/geistcn-assets|@remixicon\/.+|@icon-park\/.+|@carbon\/icons.*|feather-icons|react-feather|@primer\/octicons.*)$/;
      for (const ref of imports(unit)) {
        if (!ICON_LIBS.test(ref.source)) continue;
        if (allowed.some((lib) => ref.source === lib || ref.source.startsWith(`${lib}/`))) continue;
        emit(ref.at, `引入了图标库 ${ref.source}，规范只用 ${allowed.join(" / ")}`);
      }
    },
  },
  "markup.icon-button-label": {
    scan(unit, _config: null, emit) {
      for (const seg of markupSegments(unit)) {
        for (const tag of tags(seg.text, /a-button|AButton|Button|button/)) {
          if (hasAttr(tag.head, "aria-label") || hasAttr(tag.head, "aria-labelledby") || hasAttr(tag.head, "ariaLabel")) continue;
          const inner = innerOf(seg.text, tag)
            .replace(/<template\s+(#icon|v-slot:icon)[\s\S]*?<\/template>/g, "")
            .replace(/<([A-Z][\w.]*|[a-z]+-[\w-]*(outlined|filled|two-tone)|svg)\b[^>]*\/>/g, "")
            .replace(/<svg[\s\S]*?<\/svg>/g, "")
            .replace(/<([A-Z][\w.]*)\b[^>]*>\s*<\/\1>/g, "")
            .trim();
          const declaredIconOnly = hasAttr(tag.head, "icon") || /\bsize\s*=\s*\{?\s*["'`]icon/.test(tag.head) || hasAttr(tag.head, "svgOnly");
          const childrenOnlyIcon = !tag.selfClosing && inner.length === 0 && innerOf(seg.text, tag).trim().length > 0;
          if ((declaredIconOnly && inner.length === 0) || childrenOnlyIcon) {
            emit(seg.start + tag.at, "只有图标的按钮没有 aria-label：写动作和对象（如「刷新车型列表」）");
          }
        }
      }
    },
  },
  // ── 圆角与阴影 ──────────────────────────────────────────
  "style.radius-token": {
    prepare(env) {
      const fromParams = paramNumbers(env.rules).values;
      if (fromParams.length > 0) return { config: fromParams };
      if (env.system === "geist") return { config: [6, 12, 16] };
      const group = env.tokens?.["radius"];
      const values = group !== null && typeof group === "object" ? Object.values(group).flatMap(numbersOf) : [];
      return values.length > 0 ? { config: values.sort((a, b) => a - b) } : { pending: "圆角档位未定（token 表没有 radius 分组）" };
    },
    scan(unit, allowed: readonly number[], emit) {
      if (styleExempt(unit)) return;
      for (const decl of allDecls(unit)) {
        if (decl.custom || !/^border(-[a-z]+)*-radius$/.test(decl.prop)) continue;
        for (const token of lengthTokens(decl.value)) {
          if (/%$/.test(token)) continue;
          const px = toPx(token);
          if (px !== null && !radiusAllowed(px, allowed)) emit(decl.at, `${decl.prop} ${token} 不在圆角档位内（${fmt(allowed)}）`);
        }
      }
      for (const u of utilities(unit)) {
        const named = TW_RADIUS_NAMED.exec(u.name);
        if (named !== null) {
          const px = TW_RADIUS[named[1] ?? ""] ?? 0;
          if (!radiusAllowed(px, allowed)) emit(u.at, `${u.name}（${px}px）不在圆角档位内（${fmt(allowed)}）`);
        } else if (/^rounded(-[a-z]+)?$/.test(u.base) && u.arbitrary !== null && !/^var\(/.test(u.arbitrary)) {
          emit(u.at, `${u.name} 用任意值写圆角，只取规范档位`);
        }
      }
    },
  },
  "style.shadow-token": {
    scan(unit, _config: null, emit) {
      if (styleExempt(unit)) return;
      for (const decl of allDecls(unit)) {
        if (decl.custom || decl.prop !== "box-shadow") continue;
        const rest = stripVar(decl.value).replace(/[\s,]|!important/g, "");
        if (rest.length === 0 || /^(none|inherit|initial|unset|revert)$/.test(rest)) continue;
        emit(decl.at, `手写了 box-shadow（${decl.value.slice(0, 60)}），阴影只取层级 token`);
      }
      for (const u of utilities(unit)) {
        if ((u.base === "shadow" || u.base === "drop-shadow") && u.arbitrary !== null && !/^var\(/.test(u.arbitrary) && !RAW_COLOR.test(` ${u.arbitrary}`)) {
          emit(u.at, `${u.name} 用任意值写阴影，只取规范的阴影类`);
        }
      }
    },
  },
  // ── 布局 ────────────────────────────────────────────────
  "style.no-raw-z-index": {
    scan(unit, _config: null, emit) {
      if (styleExempt(unit)) return;
      const ok = (value: string): boolean => /^(auto|inherit|initial|unset|-?[01])$/.test(value.trim()) || /^var\(/.test(value.trim());
      for (const decl of allDecls(unit)) {
        if (!decl.custom && decl.prop === "z-index" && !ok(decl.value)) emit(decl.at, `z-index 写死了 ${decl.value}，取层级 token`);
      }
      for (const u of utilities(unit)) {
        if (u.base === "z" && u.arbitrary !== null && !ok(u.arbitrary)) emit(u.at, `${u.name} 写死了层级，取层级档位`);
      }
      regexEach(unit, markupSegments(unit), /(?<![\w-])(?::z-index|zIndex)\s*=\s*["{]\s*(\d{2,})\s*["}]/, (m, seg) => {
        emit(seg.start + m.index, `组件层级写死了 ${m[1]}，取层级 token`);
      });
    },
  },
  "style.spacing-scale": {
    prepare(env) {
      for (const rule of env.rules) {
        const base = rule.params.find((p) => p.key === "base" && !p.pending && typeof p.value === "string");
        const px = base === undefined ? null : toPx(String(base.value));
        if (px !== null && px > 0) return { config: { modulo: px, values: [] as number[] } };
      }
      const { values, pending } = paramNumbers(env.rules, /width|height|max|min/);
      return values.length > 0 ? { config: { modulo: null, values } } : { pending: `间距阶梯未定（${pending.join("、")}）` };
    },
    scan(unit, config: { modulo: number | null; values: readonly number[] }, emit) {
      if (styleExempt(unit)) return;
      const allowed = (px: number): boolean => {
        const magnitude = Math.abs(px);
        if (magnitude === 0 || magnitude === 1) return true;
        return config.modulo !== null ? Math.abs(magnitude / config.modulo - Math.round(magnitude / config.modulo)) < 1e-6 : config.values.includes(magnitude);
      };
      const scaleText = config.modulo !== null ? `${config.modulo}px 的整数倍` : fmt(config.values);
      for (const decl of allDecls(unit)) {
        if (decl.custom || !/^(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(row-|column-)?gap$/.test(decl.prop)) continue;
        for (const token of lengthTokens(decl.value)) {
          const px = toPx(token);
          if (px !== null && !allowed(px)) emit(decl.at, `${decl.prop} ${token} 不在间距阶梯内（${scaleText}）`);
        }
      }
      for (const u of utilities(unit)) {
        if (!TW_SPACING.test(u.base) && !TW_SPACING.test(u.name.replace(/-[\d.]+$/, ""))) continue;
        if (u.arbitrary !== null) {
          const px = toPx(u.arbitrary);
          if (px !== null && !allowed(px)) emit(u.at, `${u.name} 不在间距阶梯内（${scaleText}）`);
          continue;
        }
        const step = /-(\d+(?:\.\d+)?)$/.exec(u.name);
        if (step !== null && TW_SPACING.test(u.name.slice(0, u.name.length - step[0].length))) {
          const px = Number(step[1]) * 4;
          if (!allowed(px)) emit(u.at, `${u.name}（${px}px）不在间距阶梯内（${scaleText}）`);
        }
      }
      regexEach(unit, markupSegments(unit), /<(?:a-space|ASpace|Space)\b[^>]*?(?::size|size)\s*=\s*["{]\s*(\[?[\d\s,]+\]?)\s*["}]/, (m, seg) => {
        for (const px of literalInts(m[1] ?? "") ?? []) if (!allowed(px)) emit(seg.start + m.index, `a-space 的间距 ${px} 不在间距阶梯内（${scaleText}）`);
      });
    },
  },
  "grid.span-range": {
    prepare(env) {
      const columns = paramNumbers(env.rules).values[0] ?? (env.system === "antd" ? 24 : 12);
      return { config: columns };
    },
    scan(unit, columns: number, emit) {
      for (const seg of markupSegments(unit)) {
        for (const tag of tags(seg.text, /a-col|ACol|Col/)) {
          for (const name of ["span", "offset", "push", "pull", "xs", "sm", "md", "lg", "xl", "xxl"]) {
            const value = attr(tag.head, name);
            if (value === null) continue;
            for (const n of literalInts(value.raw) ?? []) {
              if (!Number.isInteger(n) || n < 0 || n > columns) emit(seg.start + tag.at, `${name}=${n} 不是 0 到 ${columns} 之间的整数`);
            }
          }
        }
      }
      for (const u of utilities(unit)) {
        const match = /^(col-span|col-start|col-end|grid-cols)-(\d+)$/.exec(u.name);
        if (match !== null && Number(match[2]) > columns + (match[1] === "col-end" ? 1 : 0)) emit(u.at, `${u.name} 超出 ${columns} 列栅格`);
      }
    },
  },
  "grid.gutter-allowed": {
    prepare(env) {
      const { values, pending } = paramNumbers(env.rules);
      return values.length > 0 ? { config: values } : { pending: `允许的列间距未定（${pending.join("、") || "条文没有 gutter 参数"}）` };
    },
    scan(unit, allowed: readonly number[], emit) {
      for (const seg of markupSegments(unit)) {
        for (const tag of tags(seg.text, /a-row|ARow|Row/)) {
          const value = attr(tag.head, "gutter");
          if (value === null) continue;
          for (const n of literalInts(value.raw) ?? []) {
            if (n !== 0 && !allowed.includes(n)) emit(seg.start + tag.at, `gutter ${n} 不在允许的列间距内（${fmt(allowed)}）`);
          }
        }
      }
      const seen = new Set<number>();
      for (const u of utilities(unit)) {
        if (!u.siblings.some((name) => /^grid-cols-/.test(name)) || seen.has(u.at)) continue;
        const match = /^gap(?:-x)?-(\d+(?:\.\d+)?)$/.exec(u.name);
        const px = match !== null ? Number(match[1]) * 4 : /^gap(-x)?$/.test(u.base) && u.arbitrary !== null ? toPx(u.arbitrary) : null;
        if (px !== null && px !== 0 && !allowed.includes(px)) {
          seen.add(u.at);
          emit(u.at, `栅格列间距 ${u.name}（${px}px）不在允许值内（${fmt(allowed)}）`);
        }
      }
    },
  },
  "style.breakpoint-allowed": {
    prepare(env) {
      const values = paramNumbers(env.rules).values;
      const names = env.rules.flatMap((rule) => rule.params.flatMap((p) => (Array.isArray(p.value) ? p.value.filter((v): v is string => typeof v === "string") : [])));
      const fromNames = names.map((name) => TW_BREAKPOINTS[name]).filter((v): v is number => v !== undefined);
      const all = values.length > 0 ? values : env.system === "geist" ? Object.values(TW_BREAKPOINTS) : fromNames;
      return all.length > 0 ? { config: all } : { pending: "断点未定" };
    },
    scan(unit, allowed: readonly number[], emit) {
      if (styleExempt(unit)) return;
      const ok = (px: number): boolean => allowed.some((bp) => Math.abs(px - bp) < 1e-6 || (bp - px > 0 && bp - px <= 1));
      for (const seg of unit.segments) {
        if (seg.kind !== "style") continue;
        regexEach(unit, [seg], /@media[^{]*/, (m) => {
          for (const width of m[0].matchAll(/(?:min|max)-width\s*:\s*([\d.]+(?:px|rem|em))/g)) {
            const token = (width[1] ?? "").replace(/em$/, "rem").replace(/rrem$/, "rem");
            const px = toPx(token);
            if (px !== null && !ok(px)) emit(seg.start + m.index, `媒体查询断点 ${width[1]} 不是规范断点（${fmt(allowed)}）`);
          }
        });
      }
      for (const u of utilities(unit)) {
        for (const variant of u.variants) {
          if (/^(min|max)-\[/.test(variant)) emit(u.at, `${variant}: 自造了断点，只用规范断点档`);
        }
      }
    },
  },
  // ── 文案与格式 ──────────────────────────────────────────
  "text.banned-terms": {
    prepare(env) {
      const map: Record<string, string> = {};
      for (const rule of env.rules) {
        for (const param of rule.params) {
          if (!param.pending && param.value !== null && typeof param.value === "object" && !Array.isArray(param.value)) {
            for (const [bad, good] of Object.entries(param.value as Record<string, unknown>)) map[bad] = String(good);
          }
        }
      }
      return Object.keys(map).length > 0 ? { config: map } : { pending: "规范没有列出禁用词" };
    },
    scan(unit, banned: Readonly<Record<string, string>>, emit) {
      for (const seg of codeSegments(unit)) {
        for (const [bad, good] of Object.entries(banned)) {
          let at = seg.text.indexOf(bad);
          while (at !== -1) {
            emit(seg.start + at, `「${bad}」应写作「${good}」`);
            at = seg.text.indexOf(bad, at + bad.length);
          }
        }
      }
    },
  },
  "text.no-literal-copy": {
    scan(unit, _config: null, emit) {
      if (unit.role.locale) return;
      const lines = new Set<number>();
      regexEach(unit, codeSegments(unit), /[\u3400-\u9fff\uf900-\ufaff]+/, (m, seg) => {
        const before = seg.text.slice(Math.max(0, m.index - 40), m.index);
        if (/console\.\w+\([^)]*$/.test(before)) return;
        const offset = seg.start + m.index;
        const { line } = position(unit, offset);
        if (lines.has(line)) return;
        lines.add(line);
        emit(offset, `写死了界面文字「${m[0].slice(0, 20)}」，改用文案字典的 key`);
      });
    },
  },
  "format.no-local-pattern": {
    scan(unit, _config: null, emit) {
      if (unit.role.formatRegistry) return;
      const patterns: ReadonlyArray<[RegExp, string]> = [
        [/['"`][^'"`\n]*?(?:YYYY|yyyy)[-/.年 ]?M{1,2}[^'"`\n]*['"`]/, "手拼了日期格式串"],
        [/['"`][^'"`\n]*?HH:mm[^'"`\n]*['"`]/, "手拼了时间格式串"],
        [/['"`][¥￥€£]|[¥￥€£]\s*\{\{|(?<![\w$])\$\s*\{\{|(['"])\$\1/, "写死了货币符号"],
        [/\bnew\s+Intl\.(?:NumberFormat|DateTimeFormat)\b|\.toLocale(?:Date|Time)?String\s*\(/, "在页面里直接本地化格式"],
      ];
      for (const [re, label] of patterns) {
        regexEach(unit, codeSegments(unit), re, (m, seg) => emit(seg.start + m.index, `${label}（${m[0].slice(0, 40)}），经格式化注册表输出`));
      }
    },
  },
  // ── 状态与请求 ──────────────────────────────────────────
  "state.store-library": {
    prepare(env) {
      const library = env.rules.flatMap((rule) => rule.params.filter((p) => p.key === "library" && !p.pending).map((p) => String(p.value).toLowerCase()))[0];
      return library !== undefined ? { config: library } : { pending: "规范没定全局状态库" };
    },
    scan(unit, library: string, emit) {
      const STORES = /^(vuex|pinia|redux|@reduxjs\/toolkit|react-redux|mobx|mobx-react(-lite)?|mobx-state-tree|zustand|jotai|recoil|valtio|effector|@ngrx\/store)(\/.*)?$/;
      for (const ref of imports(unit)) {
        const match = STORES.exec(ref.source);
        if (match === null) continue;
        const name = match[1] ?? "";
        if (name === library || name.startsWith(`${library}-`)) continue;
        emit(ref.at, `引入了全局状态库 ${ref.source}，规范只用 ${library}`);
      }
    },
  },
  "state.no-direct-request": {
    scan(unit, _config: null, emit) {
      if (unit.role.apiLayer || !unit.role.component) return;
      regexEach(unit, codeSegments(unit), /(?<![.\w$])fetch\s*\(|\baxios\s*[.(]|\bnew\s+XMLHttpRequest\b/, (m, seg) => {
        emit(seg.start + m.index, `组件里直接发请求（${m[0].trim()}），经生成的接口客户端与查询缓存`);
      });
      for (const ref of imports(unit)) {
        if (/^(axios|ky|ofetch|superagent|got)$/.test(ref.source)) emit(ref.at, `组件里引入了请求库 ${ref.source}，经生成的接口客户端`);
      }
    },
  },
  // ── 性能 ────────────────────────────────────────────────
  "perf.lazy-load": {
    scan(unit, _config: null, emit) {
      if (unit.role.router) {
        for (const ref of imports(unit)) {
          if (ref.defaultName === null && ref.named.length === 0) continue;
          if (/(^|\/)(views|pages)\//.test(ref.source) || /\.vue$/.test(ref.source)) {
            emit(ref.at, `路由表同步引入页面 ${ref.source}，路由组件用动态 import()`);
          }
        }
      }
      if (unit.role.entry) {
        for (const ref of imports(unit)) {
          if (/^(echarts|xlsx|exceljs|monaco-editor|pdfjs-dist|@antv\/[\w-]+|three|mapbox-gl|leaflet|@tiptap\/[\w-]+|quill|codemirror|@codemirror\/[\w-]+|tinymce)(\/.*)?$/.test(ref.source) && !/^import\s*\(/.test(unit.raw.slice(ref.at, ref.at + 8))) {
            emit(ref.at, `应用入口同步引入了重型依赖 ${ref.source}，放到用到它的路由里按需加载`);
          }
        }
      }
    },
  },
  "perf.no-full-library-import": {
    scan(unit, _config: null, emit) {
      for (const ref of imports(unit)) {
        if (/^(ant-design-vue|antd|vant|element-plus|element-ui|naive-ui|@arco-design\/web-vue|tdesign-vue-next)$/.test(ref.source) && ref.defaultName !== null) {
          emit(ref.at, `整包引入了组件库 ${ref.source}（默认导入 ${ref.defaultName}），按组件引入`);
        }
        if (/^(@ant-design\/icons(-vue)?|lucide-react|lucide-vue-next|@element-plus\/icons-vue)$/.test(ref.source) && (ref.namespace !== null || ref.named.includes("icons"))) {
          emit(ref.at, `整包引入了图标库 ${ref.source}，按图标名具名引入`);
        }
        if (/^(ant-design-vue\/dist\/antd(\.min)?\.(css|less)|antd\/dist\/antd(\.min)?\.(css|less)|element-plus\/dist\/index\.css)$/.test(ref.source)) {
          emit(ref.at, `引入了组件库的全量样式 ${ref.source}`);
        }
      }
    },
  },
  // ── 动效 ────────────────────────────────────────────────
  "motion.transform-only": {
    scan(unit, _config: null, emit) {
      for (const decl of allDecls(unit)) {
        if (decl.custom || (decl.prop !== "transition" && decl.prop !== "transition-property")) continue;
        const bad = transitionProps(decl.value).filter((prop) => LAYOUT_PROPS.test(prop));
        if (bad.length > 0) emit(decl.at, `过渡作用于 ${bad.join("、")}（触发重排或范围过大），只动 transform 与 opacity`);
      }
      for (const seg of unit.segments) {
        if (seg.kind !== "style") continue;
        regexEach(unit, [seg], /@keyframes\s+[\w-]+\s*\{/, (m) => {
          const open = m.index + m[0].length - 1;
          const body = seg.text.slice(open, matchBrace(seg.text, open) + 1);
          for (const decl of declsIn(body, seg.start + open)) {
            if (/^(width|height|top|left|right|bottom|margin(-.*)?|padding(-.*)?)$/.test(decl.prop)) {
              emit(decl.at, `关键帧动画改变 ${decl.prop}（触发重排），改用 transform`);
            }
          }
        });
      }
      for (const u of utilities(unit)) {
        if (u.name === "transition-all") emit(u.at, "transition-all 会过渡布局属性，改成 transition-transform / transition-opacity");
        else if (u.base === "transition" && u.arbitrary !== null && u.arbitrary.split(",").some((prop) => LAYOUT_PROPS.test(prop))) {
          emit(u.at, `${u.name} 过渡了布局属性，只动 transform 与 opacity`);
        }
      }
    },
  },
  "motion.reduced-motion": {
    scan(unit, _config: null, emit, project) {
      if (project.globalReducedMotion) return;
      const styleText = unit.segments.filter((seg) => seg.kind === "style").map((seg) => seg.text).join("\n");
      if (/prefers-reduced-motion/.test(styleText)) return;
      for (const seg of unit.segments) {
        if (seg.kind !== "style") continue;
        const at = seg.text.search(/@keyframes\b/);
        if (at !== -1) {
          emit(seg.start + at, "定义了关键帧动画却没有 prefers-reduced-motion 分支");
          return;
        }
      }
    },
  },
  // ── 安全 ────────────────────────────────────────────────
  "security.no-unsafe-html": {
    scan(unit, _config: null, emit) {
      regexEach(unit, codeSegments(unit), /(?<![\w-])v-html\s*=|\.(?:inner|outer)HTML\s*=(?!=)|\binsertAdjacentHTML\s*\(|\bdangerouslySetInnerHTML\b|\bdocument\.write(?:ln)?\s*\(/, (m, seg) => {
        emit(seg.start + m.index, `危险渲染 ${m[0].replace(/\s*[=(]$/, "")}：富文本只经登记的净化组件输出`);
      });
    },
  },
  "security.safe-link": {
    scan(unit, _config: null, emit) {
      for (const seg of markupSegments(unit)) {
        for (const tag of tags(seg.text, /[a-zA-Z][\w.-]*/)) {
          const target = attr(tag.head, "target");
          if (target === null || !/_blank/.test(target.raw)) continue;
          const rel = attr(tag.head, "rel");
          if (rel === null || !/noopener|noreferrer/.test(rel.raw)) emit(seg.start + tag.at, `target=_blank 没带 rel="noopener noreferrer"`);
        }
      }
      regexEach(unit, codeSegments(unit), /\bwindow\.open\s*\(/, (m, seg) => {
        const open = m.index + m[0].length - 1;
        const args = seg.text.slice(open, matchBrace(seg.text, open) + 1);
        if (!/noopener|noreferrer/.test(args)) emit(seg.start + m.index, "window.open 没带 noopener（第三个参数写 'noopener,noreferrer'）");
      });
      regexEach(unit, codeSegments(unit), /(["'`])\s*javascript:/i, (m, seg) => emit(seg.start + m.index, "出现 javascript: 链接"));
    },
  },
  "security.no-eval": {
    scan(unit, _config: null, emit) {
      regexEach(unit, codeSegments(unit), /(?<![.\w$])eval\s*\(|\bnew\s+Function\s*\(|\bset(?:Timeout|Interval)\s*\(\s*["'`]/, (m, seg) => {
        emit(seg.start + m.index, `动态执行代码：${m[0].replace(/\s*\($/, "")}`);
      });
    },
  },
  "security.no-token-storage": {
    scan(unit, _config: null, emit) {
      const SECRET = /token|session|refresh|jwt|auth|credential|passw|secret/i;
      regexEach(unit, codeSegments(unit), /\b(localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*([^,)]+)/, (m, seg) => {
        if (SECRET.test(m[2] ?? "")) emit(seg.start + m.index, `把凭据键 ${(m[2] ?? "").trim()} 写进了 ${m[1]}`);
      });
      regexEach(unit, codeSegments(unit), /\b(localStorage|sessionStorage)\s*(?:\.\s*([\w$]+)|\[\s*(["'`])([^"'`]+)\3\s*\])\s*=(?!=)/, (m, seg) => {
        const key = m[2] ?? m[4] ?? "";
        if (SECRET.test(key)) emit(seg.start + m.index, `把凭据键 ${key} 写进了 ${m[1]}`);
      });
      regexEach(unit, codeSegments(unit), /\bdocument\.cookie\s*=(?!=)([^;\n]*)/, (m, seg) => {
        if (SECRET.test(m[1] ?? "")) emit(seg.start + m.index, "前端脚本写会话凭据 Cookie：凭据 Cookie 由服务端以 HttpOnly 下发");
      });
    },
  },
  // ── 报错与路由守卫 ──────────────────────────────────────
  "error.no-empty-catch": {
    scan(unit, _config: null, emit) {
      const swallowed = (body: string): boolean => /^\s*(console\.\w+\([^;]*\)\s*;?\s*)*$/.test(body);
      for (const seg of codeSegments(unit)) {
        if (seg.lang === "html") continue;
        regexEach(unit, [seg], /\bcatch\s*(\([^)]*\))?\s*\{/, (m) => {
          const open = m.index + m[0].length - 1;
          const body = seg.text.slice(open + 1, matchBrace(seg.text, open));
          if (swallowed(body)) emit(seg.start + m.index, "catch 吞掉了错误（空的，或只打日志）：分类处理、上报或继续抛出");
        });
        regexEach(unit, [seg], /\.catch\s*\(\s*(?:\(\s*[\w$]*\s*\)|[\w$]+)\s*=>\s*(\{|null\b|undefined\b|void\s+0\b|console\.)/, (m) => {
          const tail = m[1] ?? "";
          if (tail === "{") {
            const open = m.index + m[0].length - 1;
            if (!swallowed(seg.text.slice(open + 1, matchBrace(seg.text, open)))) return;
          }
          emit(seg.start + m.index, ".catch 吞掉了错误：分类处理、上报或继续抛出");
        });
      }
    },
  },
  "guard.route-meta": {
    scan(unit, _config: null, emit) {
      if (!unit.role.router) return;
      for (const seg of codeSegments(unit)) {
        regexEach(unit, [seg], /(?<![\w$])path\s*:/, (m) => {
          let depth = 0;
          let open = -1;
          for (let i = m.index; i >= 0; i -= 1) {
            const c = seg.text[i];
            if (c === "}") depth += 1;
            else if (c === "{") {
              if (depth === 0) {
                open = i;
                break;
              }
              depth -= 1;
            }
          }
          if (open === -1) return;
          const body = seg.text.slice(open + 1, matchBrace(seg.text, open));
          let level = 0;
          const keys = new Set<string>();
          const keyRe = /([\w$]+)\s*:|[{}[\]()]/g;
          let key: RegExpExecArray | null;
          while ((key = keyRe.exec(body)) !== null) {
            const token = key[0];
            if (token === "{" || token === "[" || token === "(") level += 1;
            else if (token === "}" || token === "]" || token === ")") level -= 1;
            else if (level === 0 && key[1] !== undefined) keys.add(key[1]);
          }
          if (keys.has("redirect") || keys.has("meta") || keys.has("handle")) return;
          if (!keys.has("component") && !keys.has("components") && !keys.has("element") && !keys.has("Component") && !keys.has("lazy") && !keys.has("children")) return;
          emit(seg.start + m.index, "路由没有声明访问要求（meta / handle 里的登录、权限码、布局）");
        });
        if (!seg.markup) continue;
        for (const tag of tags(seg.text, /Route/)) {
          if (hasAttr(tag.head, "path") && !hasAttr(tag.head, "handle")) emit(seg.start + tag.at, "<Route> 没有声明访问要求（handle）");
        }
      }
    },
  },
};

/** 已实现的检查编号（与 design-standard.ts 的 DESIGN_CHECKS.active 对账；规范页「待接入」据此显示）。 */
export const IMPLEMENTED_DESIGN_CHECKS: readonly string[] = Object.keys(CHECKS).sort();

// ============================================================
// 豁免
// ============================================================

interface Suppressions {
  readonly lines: ReadonlyMap<number, ReadonlySet<string>>;
  readonly unreasoned: ReadonlyArray<{ line: number; ids: string }>;
}

const SUPPRESS = /pomaster-design-ignore\s+([a-z][\w.-]*(?:\s*,\s*[a-z][\w.-]*)*)(?:\s*(?:--|:|：)\s*([^\n]*?))?\s*(?:\*\/|-->|\}\s*$|$)/;

function suppressionsOf(unit: SourceUnit): Suppressions {
  const lines = new Map<number, Set<string>>();
  const unreasoned: Array<{ line: number; ids: string }> = [];
  const rows = unit.raw.split("\n");
  rows.forEach((text, index) => {
    const match = SUPPRESS.exec(text);
    if (match === null) return;
    const ids = (match[1] ?? "").split(",").map((id) => id.trim());
    const reason = (match[2] ?? "").replace(/\*\/|-->|\}/g, "").trim();
    if (reason.length === 0) {
      unreasoned.push({ line: index + 1, ids: ids.join(", ") });
      return;
    }
    for (const line of [index + 1, index + 2]) {
      const set = lines.get(line) ?? new Set<string>();
      ids.forEach((id) => set.add(id));
      lines.set(line, set);
    }
  });
  return { lines, unreasoned };
}

// ============================================================
// 判卷
// ============================================================

export type DesignCheckStatus = "passed" | "failed" | "pending";

export interface DesignCheckRow {
  readonly id: string;
  readonly title_zh: string;
  readonly rules: readonly string[];
  readonly status: DesignCheckStatus;
  readonly violations: number;
  /** 待定原因（参数还是决策位）。 */
  readonly pending_zh: string | null;
}

export interface DesignFinding {
  readonly check: string;
  readonly rules: readonly string[];
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly excerpt: string;
}

export const DESIGN_CHECK_BASELINE_RELATIVE = "baseline/frontend/design-check-baseline.json";
export const DESIGN_CHECK_BASELINE_SCHEMA = "pomaster.design-check-baseline/v1";

export interface DesignCheckBaseline {
  readonly schema: typeof DESIGN_CHECK_BASELINE_SCHEMA;
  /** 「检查编号 文件路径」→ 采用时已有的违规数。 */
  readonly counts: Readonly<Record<string, number>>;
}

export interface DesignCheckReport {
  readonly applicable: boolean;
  /** 门不适用的原因。 */
  readonly reason_zh: string | null;
  readonly mode: DesignSourceMode | null;
  readonly design_system: DesignSystem | null;
  readonly standard_path: string | null;
  readonly fingerprint: string | null;
  readonly roots: readonly string[];
  readonly files: number;
  readonly checks: readonly DesignCheckRow[];
  /** 规范绑定了、但还没实现的检查（规范页标「待接入」）。 */
  readonly not_implemented: readonly string[];
  readonly findings: readonly DesignFinding[];
  /** 违规总数（扣掉存量基线后的；findings 每个文件每条检查最多列 10 条，这里是全量）。 */
  readonly violations: number;
  /** 落在存量基线内、不阻断的违规数。 */
  readonly baselined: number;
  /** 用到的存量基线文件（相对项目根）；没有基线为 null。 */
  readonly baseline_path: string | null;
  readonly suppressed: number;
  readonly warnings: readonly CliWarning[];
}

export interface DesignCheckInput extends DesignValidateInput {
  /** 扫描的源码目录（相对项目根）；缺省按常见前端目录探测。 */
  readonly roots?: readonly string[];
  /** 只跑这几条检查。 */
  readonly only?: readonly string[];
  /** 只在项目已落地规范时适用（check --gates / closeout）；命令面可用预设试跑。 */
  readonly requireProjectStandard?: boolean;
  /** 不读存量基线（看全量违规）。 */
  readonly ignoreBaseline?: boolean;
  /** 把这次扫到的全部违规写成存量基线。 */
  readonly writeBaseline?: boolean;
}

const baselineKey = (check: string, file: string): string => `${check} ${file}`;

function readBaseline(dir: string): { counts: ReadonlyMap<string, number> } | { error: CliError } | null {
  const path = join(dir, POMASTER_DIR, DESIGN_CHECK_BASELINE_RELATIVE);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<DesignCheckBaseline>;
    if (raw.schema !== DESIGN_CHECK_BASELINE_SCHEMA || raw.counts === null || typeof raw.counts !== "object") throw new Error(`schema 不是 ${DESIGN_CHECK_BASELINE_SCHEMA}`);
    const counts = new Map<string, number>();
    for (const [key, value] of Object.entries(raw.counts)) if (typeof value === "number" && value > 0) counts.set(key, Math.floor(value));
    return { counts };
  } catch (error) {
    return {
      error: {
        code: "DESIGN_BASELINE_UNREADABLE",
        message: `违规存量基线读不了：${(error as Error).message}`,
        hint: "重新生成：pomaster design check --write-baseline（会把当前全部违规记为存量）",
      },
    };
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 常见前端源码目录；找到具体的前端目录就不再收根下的 src。 */
export function discoverDesignRoots(dir: string): string[] {
  const found = DEFAULT_ROOT_CANDIDATES.filter((candidate) => isDir(join(dir, candidate)));
  const apps = join(dir, "apps");
  if (isDir(apps)) {
    for (const name of readdirSync(apps).sort()) if (isDir(join(apps, name, "src"))) found.push(`apps/${name}/src`);
  }
  if (found.length === 0 && isDir(join(dir, "src"))) found.push("src");
  return found;
}

function collectFiles(dir: string, roots: readonly string[]): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  let truncated = false;
  const walk = (abs: string): void => {
    if (files.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    let entries: string[];
    try {
      entries = readdirSync(abs).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      const path = join(abs, name);
      if (isDir(path)) {
        if (!SKIP_DIRS.has(name) && !name.startsWith(".")) walk(path);
        continue;
      }
      const rel = relative(dir, path).split("\\").join("/");
      if (!SOURCE_EXTS.has(extname(name).toLowerCase()) || SKIP_FILE.test(rel) || LIBRARY_LAYER.test(rel)) continue;
      files.push(rel);
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
    }
  };
  for (const root of roots) walk(isAbsolute(root) ? root : join(dir, root));
  return { files: [...new Set(files)], truncated };
}

function notApplicable(reason: string, extra: Partial<DesignCheckReport> = {}): DesignCheckReport {
  return {
    applicable: false,
    reason_zh: reason,
    mode: null,
    design_system: null,
    standard_path: null,
    fingerprint: null,
    roots: [],
    files: 0,
    checks: [],
    not_implemented: [],
    findings: [],
    violations: 0,
    baselined: 0,
    baseline_path: null,
    suppressed: 0,
    warnings: [],
    ...extra,
  };
}

/** 判卷：载入规范 → 绑定检查 → 扫描源码 → 汇总。规范不通过校验时返回错误（判卷器无法工作）。 */
export function assessDesignStandard(dir: string, input: DesignCheckInput = {}): DesignCheckReport | CliError {
  if (input.requireProjectStandard === true && input.file === undefined && !existsSync(join(dir, POMASTER_DIR, DESIGN_STANDARD_RELATIVE))) {
    return notApplicable(`项目还没落地设计规范（${POMASTER_DIR}/${DESIGN_STANDARD_RELATIVE}），设计门禁不适用`);
  }
  const loaded = loadDesignStandard(dir, input);
  if (!loaded.ok || loaded.normalized === null) {
    const first = loaded.issues.find((issue) => issue.severity === "error");
    return {
      code: "DESIGN_STANDARD_INVALID",
      message: `设计规范没通过校验，无法据此判卷${first === undefined ? "" : `：${first.path} ${first.message}`}`,
      hint: "先修好规范：pomaster design validate",
    };
  }
  const standard: NormalizedDesignStandard = loaded.normalized;
  const tokens = loaded.tokens_path === null ? null : (readTokenGroups(loaded.tokens_path)?.groups ?? null);
  const rules = standard.areas.flatMap((area) => area.rules);
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));
  const bound = new Map<string, DesignRule[]>();
  for (const rule of rules) {
    if (rule.enforcement.kind !== "gate") continue;
    const list = bound.get(rule.enforcement.check) ?? [];
    list.push(rule);
    bound.set(rule.enforcement.check, list);
  }
  const roots = input.roots !== undefined && input.roots.length > 0 ? [...input.roots] : discoverDesignRoots(dir);
  const base = {
    mode: loaded.mode,
    design_system: standard.meta.design_system,
    standard_path: loaded.standard_path,
    fingerprint: loaded.fingerprint,
    roots,
  };
  if (roots.length === 0) {
    return notApplicable("找不到前端源码目录（frontend/src、web/src、apps/*/src、src…）；用 --root 指定", base);
  }
  const missingRoots = roots.filter((root) => !isDir(isAbsolute(root) ? root : join(dir, root)));
  const warnings: CliWarning[] = missingRoots.map((root) => ({ code: "DESIGN_CHECK_ROOT_MISSING", message: `源码目录 ${root} 不存在`, hint: "检查 --root 参数" }));

  const checkIds = [...bound.keys()].filter((id) => input.only === undefined || input.only.includes(id)).sort();
  const prepared = new Map<string, { config: unknown } | { pending: string }>();
  const notImplemented: string[] = [];
  for (const id of checkIds) {
    const impl = CHECKS[id];
    if (impl === undefined) {
      notImplemented.push(id);
      continue;
    }
    const env: CheckEnv = {
      system: standard.meta.design_system,
      rules: bound.get(id) ?? [],
      param: (ruleId, key) => ruleById.get(ruleId)?.params.find((p) => p.key === key),
      tokens,
    };
    prepared.set(id, impl.prepare === undefined ? { config: null } : impl.prepare(env));
  }

  const { files, truncated } = collectFiles(dir, roots);
  if (truncated) warnings.push({ code: "DESIGN_CHECK_TRUNCATED", message: `源码文件超过 ${MAX_FILES} 个，只扫了前 ${MAX_FILES} 个`, hint: "用 --root 缩小范围分批跑" });
  const units: SourceUnit[] = [];
  for (const file of files) {
    const abs = join(dir, file);
    try {
      if (statSync(abs).size > MAX_FILE_BYTES) {
        warnings.push({ code: "DESIGN_CHECK_FILE_SKIPPED", message: `${file} 超过 ${MAX_FILE_BYTES / 1024} KB，跳过`, hint: "生成物或打包产物不该在源码目录里" });
        continue;
      }
      units.push(parseSourceUnit(file, readFileSync(abs, "utf8")));
    } catch {
      warnings.push({ code: "DESIGN_CHECK_FILE_UNREADABLE", message: `${file} 读不了，跳过`, hint: "检查文件权限与编码" });
    }
  }
  const project: ProjectFacts = {
    globalReducedMotion: units.some((unit) =>
      unit.segments.some((seg) => seg.kind === "style" && /prefers-reduced-motion[^{]*\{[^@]*\*[^{]*\{[^}]*animation/.test(seg.text)),
    ),
  };

  const listed: DesignFinding[] = [];
  /** 「检查 文件」→ 违规数（豁免之外的全量）。 */
  const pairCounts = new Map<string, number>();
  let suppressed = 0;
  for (const unit of units) {
    const suppressions = suppressionsOf(unit);
    for (const entry of suppressions.unreasoned) {
      warnings.push({
        code: "DESIGN_SUPPRESSION_REASON_MISSING",
        message: `${unit.path}:${entry.line} 的豁免（${entry.ids}）没写理由，不生效`,
        hint: "写成 pomaster-design-ignore <检查编号>: 理由",
      });
    }
    for (const id of checkIds) {
      const impl = CHECKS[id];
      const state = prepared.get(id);
      if (impl === undefined || state === undefined || !("config" in state)) continue;
      const seen = new Set<number>();
      let shown = 0;
      const ruleIds = (bound.get(id) ?? []).map((rule) => rule.id);
      const key = baselineKey(id, unit.path);
      const emit: Emit = (offset, message) => {
        if (seen.has(offset)) return;
        seen.add(offset);
        const { line, column } = position(unit, offset);
        if (suppressions.lines.get(line)?.has(id) === true) {
          suppressed += 1;
          return;
        }
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        if (shown >= FINDINGS_PER_FILE_CHECK) return;
        shown += 1;
        listed.push({ check: id, rules: ruleIds, file: unit.path, line, column, message, excerpt: lineText(unit, line).trim().slice(0, 160) });
      };
      (impl.scan as (unit: SourceUnit, config: unknown, emit: Emit, project: ProjectFacts) => void)(unit, state.config, emit, project);
    }
  }

  // 存量基线：写基线时把全量记下；读基线时只算超出存量的部分。
  const baselineRelative = `${POMASTER_DIR}/${DESIGN_CHECK_BASELINE_RELATIVE}`;
  let baselinePath: string | null = null;
  let baselineCounts: ReadonlyMap<string, number> = new Map();
  if (input.writeBaseline === true) {
    const counts = Object.fromEntries([...pairCounts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    const target = join(dir, POMASTER_DIR, DESIGN_CHECK_BASELINE_RELATIVE);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify({ schema: DESIGN_CHECK_BASELINE_SCHEMA, counts } satisfies DesignCheckBaseline, null, 2)}\n`, "utf8");
    baselinePath = baselineRelative;
    baselineCounts = pairCounts;
  } else if (input.ignoreBaseline !== true) {
    const read = readBaseline(dir);
    if (read !== null && "error" in read) return read.error;
    if (read !== null) {
      baselinePath = baselineRelative;
      baselineCounts = read.counts;
    }
  }
  const counts = new Map<string, number>();
  const excessPairs = new Set<string>();
  let baselined = 0;
  const tightenable: string[] = [];
  for (const [key, n] of pairCounts) {
    const allowed = baselineCounts.get(key) ?? 0;
    const excess = Math.max(0, n - allowed);
    baselined += n - excess;
    if (excess > 0) {
      excessPairs.add(key);
      const check = key.slice(0, key.indexOf(" "));
      counts.set(check, (counts.get(check) ?? 0) + excess);
    }
  }
  for (const [key, allowed] of baselineCounts) if ((pairCounts.get(key) ?? 0) < allowed) tightenable.push(key);
  if (baselinePath !== null && input.writeBaseline !== true && tightenable.length > 0) {
    warnings.push({
      code: "DESIGN_BASELINE_TIGHTENABLE",
      message: `${tightenable.length} 处「检查 × 文件」的违规已少于存量（如 ${tightenable[0] ?? ""}）`,
      hint: "收紧存量：pomaster design check --write-baseline（只会记下现在的数）",
    });
  }
  const findings = listed.filter((finding) => excessPairs.has(baselineKey(finding.check, finding.file)));

  const titles = new Map(DESIGN_CHECKS.map((check) => [check.id, check.title_zh]));
  const checks: DesignCheckRow[] = checkIds
    .filter((id) => CHECKS[id] !== undefined)
    .map((id) => {
      const state = prepared.get(id);
      const violations = counts.get(id) ?? 0;
      const pending = state !== undefined && "pending" in state ? state.pending : null;
      return {
        id,
        title_zh: titles.get(id) ?? id,
        rules: (bound.get(id) ?? []).map((rule) => rule.id),
        status: pending !== null ? "pending" : violations > 0 ? "failed" : "passed",
        violations,
        pending_zh: pending,
      };
    });
  return {
    applicable: true,
    reason_zh: null,
    ...base,
    files: units.length,
    checks,
    not_implemented: notImplemented,
    findings,
    violations: [...counts.values()].reduce((sum, n) => sum + n, 0),
    baselined,
    baseline_path: baselinePath,
    suppressed,
    warnings,
  };
}

// ============================================================
// 命令面
// ============================================================

const STATUS_ZH: Readonly<Record<DesignCheckStatus, string>> = { passed: "通过", failed: "违规", pending: "待定" };

export function runDesignCheck(dir: string, input: DesignCheckInput = {}): CommandOutcome<DesignCheckReport | null> {
  const report = assessDesignStandard(dir, input);
  if (!("checks" in report)) {
    return failOutcome<DesignCheckReport | null>("design check", null, [report], [`design check: FAILED — ${report.code}`, `  ${report.message}`, `  hint: ${report.hint}`]);
  }
  if (!report.applicable) {
    return okOutcome("design check", report, [`design check: 不适用 —— ${report.reason_zh ?? ""}`], report.warnings);
  }
  const failed = report.checks.filter((check) => check.status === "failed");
  const lines = [
    `design check: ${failed.length === 0 ? "通过" : `${report.violations} 处违规（${failed.length} 条检查）`} —— ${report.design_system} 规范（${report.mode}），扫描 ${report.files} 个文件（${report.roots.join("、")}）`,
  ];
  for (const check of report.checks) {
    lines.push(`  [${STATUS_ZH[check.status]}] ${check.id} ${check.title_zh}${check.violations > 0 ? `：${check.violations} 处` : ""}${check.pending_zh !== null ? `：${check.pending_zh}` : ""}`);
  }
  if (report.not_implemented.length > 0) lines.push(`  待接入（规范绑定了、门禁还没实现）：${report.not_implemented.join("、")}`);
  if (report.findings.length > 0) lines.push("", "违规：");
  for (const finding of report.findings) {
    lines.push(`  ${finding.file}:${finding.line}:${finding.column}  ${finding.check}  ${finding.message}`);
    if (finding.excerpt.length > 0) lines.push(`      ${finding.excerpt}`);
  }
  if (report.suppressed > 0) lines.push(`  已豁免 ${report.suppressed} 处（带理由的 pomaster-design-ignore）`);
  if (report.baseline_path !== null) {
    lines.push(
      input.writeBaseline === true
        ? `  已把 ${report.baselined} 处违规记为存量基线（${report.baseline_path}）：之后只拦新增`
        : `  存量基线内 ${report.baselined} 处不阻断（${report.baseline_path}）`,
    );
  }
  if (failed.length === 0) return okOutcome("design check", report, lines, report.warnings);
  const error: CliError = {
    code: "DESIGN_CHECK_VIOLATIONS",
    message: `${report.violations} 处违反设计规范（${failed.map((check) => check.id).join("、")}）`,
    hint: "按条文改代码；确属例外的，在该行或上一行写 pomaster-design-ignore <检查编号>: 理由",
  };
  return failOutcome<DesignCheckReport | null>("design check", report, [error], lines, report.warnings);
}

/** closeout 聚合点：项目落地了规范才适用；违规阻断，判卷器故障 fail-closed。 */
export function designStandardGateErrors(dir: string): CliError[] {
  const report = assessDesignStandard(dir, { requireProjectStandard: true });
  if (!("checks" in report)) return [report];
  if (!report.applicable || report.violations === 0) return [];
  return [
    {
      code: "DESIGN_CHECK_VIOLATIONS",
      message: `${report.violations} 处违反设计规范（${report.checks.filter((c) => c.status === "failed").map((c) => c.id).join("、")}）`,
      hint: "pomaster design check 看明细；改代码，或带理由豁免",
    },
  ];
}

// ============================================================
// check --gates 的 kernel-native 执行器（GATE.DESIGN.STANDARD）
// ============================================================

export const DESIGN_GATE_TOOL_ID = "cli:design_check";
export const DESIGN_GATE_METRIC_DIALECT = "cli:design_standard_checks";
export const DESIGN_GATE_TOOL_VERSION = "1.0.0";

/**
 * 报告 → GateResultRecord：项目没落地规范 / 找不到源码 → not_configured；判卷器故障 → blocked；
 * 否则 scanned = 绑定且已实现的检查数，applicable = 非待定的检查，violations = 有违规的检查数。
 */
export function designStandardToRecord(report: DesignCheckReport | CliError, input: { readonly grn: string; readonly ranAtSeq: number }): GateResultRecord {
  const plan = {
    grn: input.grn,
    gate: "DESIGN_STANDARD",
    gateDef: "GATE.DESIGN.STANDARD@0.1.0",
    ranAtSeq: input.ranAtSeq,
    subjectId: null,
    denominatorRefs: [],
    tool: DESIGN_GATE_TOOL_ID,
    toolVersion: DESIGN_GATE_TOOL_VERSION,
    metricDialect: DESIGN_GATE_METRIC_DIALECT,
  };
  if (!("checks" in report)) return absenceRecord(plan, "blocked", `设计规范判卷器故障：${report.code} ${report.message}`, 0, 0);
  if (!report.applicable) return absenceRecord(plan, "not_configured", report.reason_zh, 0, 0);
  const applicable = report.checks.filter((check) => check.status !== "pending");
  const failed = report.checks.filter((check) => check.status === "failed");
  const note = [
    ...failed.map((check) => `${check.id}: ${check.violations} 处`),
    ...report.checks.filter((check) => check.status === "pending").map((check) => `待定 ${check.id}: ${check.pending_zh ?? ""}`),
    ...(report.not_implemented.length > 0 ? [`待接入 ${report.not_implemented.join("、")}`] : []),
  ].join(" | ");
  return {
    ...absenceRecord(plan, "not_run", null, 0, 0),
    verdict: failed.length === 0 ? "passed" : "failed",
    counts: {
      scanned: report.checks.length,
      applicableScanned: applicable.length,
      violations: failed.length,
      notApplicable: report.checks.length - applicable.length,
    },
    trust: { asserted: null, recomputed: { violations: failed.length, matchesAsserted: true } },
    ...(note.length > 0 ? { scopeNote: note } : {}),
  };
}

export function designStandardKernelGateExecutor(): (input: { readonly projectRoot: string; readonly grn: string; readonly ranAtSeq: number }) => Promise<GateResultRecord> {
  return async (gateInput) =>
    designStandardToRecord(assessDesignStandard(gateInput.projectRoot, { requireProjectStandard: true }), { grn: gateInput.grn, ranAtSeq: gateInput.ranAtSeq });
}
