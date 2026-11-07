/**
 * prototype-extract.ts —— 原型转换的抽取器（纯函数，零依赖，Node 与浏览器共用）。
 *
 * BA 交来的 HTML 原型与 spec 结构、风格、样式各不相同；这里不认某一种写法，只按「四层」读：
 * 业务事实（字段、操作、状态、有业务含义的文案）、信息结构（页面、区域、分组、顺序）、交互意图
 * （隐藏的弹窗、点什么打开什么）保留；表现（class、内联样式、颜色、字体、间距、栅格、组件长相）丢掉，
 * 只把表现里带业务含义的部分翻译成语义（星号 → 必填、红绿状态字 → 语气、删除线 → 作废、右对齐 → 数值列、
 * 固定列 → 冻结列、初始禁用 → 有启用条件）。
 *
 * 同一个抽取器既读原型，也读按规范重绘后的页面（任何组件库渲染出来的 DOM，按 ARIA 与语义元素读），
 * 两边的事实清单逐条对账（diffFacts）——UI 换了，事实不能变。
 *
 * 用法：parseHtml → outlineOf → factsOf；spec（Markdown）用 specFactsOf；questionsOf 对出冲突。
 * CLI 面见 prototype.ts（`pomaster prototype ingest / diff`），Storybook 实验 prototype.convert 用同一份代码。
 */

// ============================================================
// HTML 解析（宽容：未闭合、错嵌套、自闭合都不报错）
// ============================================================

export interface HtmlElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: HtmlChild[];
}
export type HtmlChild = HtmlElement | string;

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);
/** 遇到这些开始标签时，自动闭合同名的上一个（p / li / option / tr / td 一类常省略结束标签的元素）。 */
const AUTO_CLOSE: Readonly<Record<string, readonly string[]>> = {
  li: ["li"],
  option: ["option"],
  tr: ["tr", "td", "th"],
  td: ["td", "th"],
  th: ["td", "th"],
  p: ["p"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
};

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", times: "×", hellip: "…", mdash: "—", ndash: "–", yen: "¥", copy: "©" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR_RE)) {
    const name = (match[1] ?? "").toLowerCase();
    if (name === "") continue;
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/** HTML 文本 → 元素树（根是虚拟的 #document）。 */
export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = { tag: "#document", attrs: {}, children: [] };
  const stack: HtmlElement[] = [root];
  const top = () => stack[stack.length - 1] ?? root;
  let index = 0;
  const length = html.length;
  while (index < length) {
    const lt = html.indexOf("<", index);
    if (lt < 0) {
      top().children.push(decodeEntities(html.slice(index)));
      break;
    }
    if (lt > index) top().children.push(decodeEntities(html.slice(index, lt)));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      index = end < 0 ? length : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt);
      index = end < 0 ? length : end + 1;
      continue;
    }
    const close = html[lt + 1] === "/";
    const gt = findTagEnd(html, lt + 1);
    if (gt < 0) {
      top().children.push(html.slice(lt));
      break;
    }
    const inner = html.slice(lt + (close ? 2 : 1), gt);
    const nameMatch = /^([a-zA-Z][\w:-]*)/.exec(inner);
    if (nameMatch === null) {
      top().children.push(html.slice(lt, gt + 1));
      index = gt + 1;
      continue;
    }
    const tag = (nameMatch[1] ?? "").toLowerCase();
    index = gt + 1;
    if (close) {
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth]?.tag === tag) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }
    const closes = AUTO_CLOSE[tag];
    if (closes !== undefined) {
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        const current = stack[depth]?.tag ?? "";
        if (closes.includes(current)) {
          stack.length = depth;
          break;
        }
        if (["table", "tbody", "thead", "ul", "ol", "select", "div", "dl"].includes(current)) break;
      }
    }
    const selfClosing = inner.trimEnd().endsWith("/");
    const element: HtmlElement = { tag, attrs: parseAttrs(inner.slice(tag.length).replace(/\/\s*$/, "")), children: [] };
    top().children.push(element);
    if (VOID_TAGS.has(tag) || selfClosing) continue;
    if (RAW_TEXT_TAGS.has(tag)) {
      const endTag = html.toLowerCase().indexOf(`</${tag}`, index);
      const raw = html.slice(index, endTag < 0 ? length : endTag);
      element.children.push(tag === "script" || tag === "style" ? raw : decodeEntities(raw));
      const endGt = endTag < 0 ? -1 : html.indexOf(">", endTag);
      index = endGt < 0 ? length : endGt + 1;
      continue;
    }
    stack.push(element);
  }
  return root;
}

function findTagEnd(html: string, from: number): number {
  let quote: string | null = null;
  for (let index = from; index < html.length; index += 1) {
    const char = html[index];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

// ============================================================
// 读语义的小工具
// ============================================================

function isElement(child: HtmlChild): child is HtmlElement {
  return typeof child !== "string";
}

function elements(node: HtmlElement): HtmlElement[] {
  return node.children.filter(isElement);
}

/** 可见文字（跳过 script / style / 模板与隐藏的读屏文字之外的一切表现）。 */
export function textOf(node: HtmlChild): string {
  if (typeof node === "string") return node;
  if (node.tag === "script" || node.tag === "style" || node.tag === "template") return "";
  if (node.tag === "br") return " ";
  return node.children.map(textOf).join(node.tag === "td" || node.tag === "th" ? " " : "");
}

export function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function classes(node: HtmlElement): string[] {
  return (node.attrs["class"] ?? "").split(/\s+/).filter(Boolean);
}

function classText(node: HtmlElement): string {
  return ` ${(node.attrs["class"] ?? "").toLowerCase()} `;
}

function styleOf(node: HtmlElement): string {
  return (node.attrs["style"] ?? "").toLowerCase().replace(/\s+/g, "");
}

function isHidden(node: HtmlElement): boolean {
  const style = styleOf(node);
  return (
    node.attrs["hidden"] !== undefined ||
    node.attrs["aria-hidden"] === "true" ||
    /display:none|visibility:hidden/.test(style) ||
    (/\s(hidden|d-none|is-hidden)\s/.test(classText(node)) && !/\s(sm|md|lg|xl|2xl):(block|flex|grid|inline|inline-flex|inline-block|table)\s/.test(classText(node)))
  );
}

/** 只给读屏看的文字（sr-only 一类）算文字，但不算可见区域。 */
function isScreenReaderOnly(node: HtmlElement): boolean {
  return /\s(sr-only|visually-hidden|ui-nt__sr)\s/.test(classText(node));
}

const TONE_WORDS: ReadonlyArray<readonly [RegExp, Tone]> = [
  [/(red|danger|error|destructive|fail|abolish)/, "danger"],
  [/(amber|yellow|orange|warn|expire|pending)/, "warning"],
  [/(green|success|ok|done|current|paid)/, "success"],
  [/(blue|info|primary|processing)/, "info"],
  [/(gray|grey|slate|muted|neutral|deleted|disabled)/, "neutral"],
];
export type Tone = "danger" | "warning" | "success" | "info" | "neutral";

/** 表现里藏着的语气：class 名或内联颜色里带红、黄、绿、蓝、灰 → 语义语气（只取语气，不取色值）。 */
function toneOf(node: HtmlElement): Tone | null {
  const hint = `${classText(node)} ${styleOf(node)} ${(node.attrs["data-tone"] ?? node.attrs["data-status"] ?? node.attrs["color"] ?? "").toLowerCase()}`;
  for (const [pattern, tone] of TONE_WORDS) if (pattern.test(hint)) return tone;
  const color = /(?:^|;)color:#([0-9a-f]{3,8})/.exec(styleOf(node))?.[1];
  if (color !== undefined) return hueTone(color);
  return null;
}

function hueTone(hex: string): Tone | null {
  const full = hex.length === 3 ? [...hex].map((char) => char + char).join("") : hex.slice(0, 6);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 24) return "neutral";
  if (r === max && g < 0.6 * r) return "danger";
  if (r === max) return "warning";
  if (g === max) return "success";
  return "info";
}

function struck(node: HtmlElement): boolean {
  return /line-through/.test(`${classText(node)} ${styleOf(node)}`) || node.tag === "del" || node.tag === "s";
}

const TOOLTIP_CLASS = /\s[\w-]*(tooltip|popover|tip-content|tip-text|hint-text|help-text)[\w-]*\s/;

/** 标签自己的文字：不含藏在里面的提示气泡（提示气泡是说明，另记为 hint）。 */
function labelTextOf(node: HtmlElement): { text: string; hint: string | null } {
  const hints: string[] = [];
  const walk = (current: HtmlChild): string => {
    if (typeof current === "string") return current;
    if (TOOLTIP_CLASS.test(classText(current)) || current.attrs["role"] === "tooltip") {
      hints.push(clean(textOf(current)));
      return "";
    }
    if (CONTROL_TAGS.has(current.tag)) return "";
    return current.children.map(walk).join("");
  };
  const text = walk(node);
  const hint = hints.filter(Boolean).join(" ") || node.attrs["title"] || null;
  return { text, hint: hint === null || hint === clean(text) ? null : hint };
}

/** 标签文字归一：去掉必填星号、冒号与空白（「客户名称 *：」→「客户名称」）。 */
export function normalizeLabel(text: string): string {
  return clean(text).replace(/[*＊]/g, "").replace(/[:：]\s*$/, "").trim();
}

function hasRequiredMark(node: HtmlElement): boolean {
  if (/[*＊]/.test(textOf(node))) return true;
  const walk = (current: HtmlElement): boolean => /required|req-|asterisk/.test(classText(current)) || elements(current).some(walk);
  return walk(node);
}

function iconOf(node: HtmlElement): string | null {
  const walk = (current: HtmlElement): string | null => {
    const lucide = current.attrs["data-lucide"] ?? current.attrs["data-icon"] ?? null;
    if (lucide !== null && lucide !== "") return lucide;
    const iconClass = classes(current).find((name) => /^(anticon-|icon-|fa-|lucide-|bi-|ri-)/.test(name) && !/^(fa-solid|fa-regular|fa-lg)$/.test(name));
    if (iconClass !== undefined) return iconClass.replace(/^(anticon-|icon-|fa-|lucide-|bi-|ri-)/, "");
    for (const child of elements(current)) {
      const found = walk(child);
      if (found !== null) return found;
    }
    return null;
  };
  return walk(node);
}

// ============================================================
// 大纲（去掉表现后的信息结构）
// ============================================================

export type RegionRole = "page" | "nav" | "header" | "main" | "aside" | "footer" | "section" | "dialog" | "form" | "card";

export interface OutlineRegion {
  readonly kind: "region";
  readonly role: RegionRole;
  readonly title: string | null;
  readonly hidden: boolean;
  readonly path: string;
  readonly children: OutlineNode[];
}
export interface OutlineHeading {
  readonly kind: "heading";
  readonly level: number;
  readonly text: string;
  readonly path: string;
}
export interface OutlineNotice {
  readonly kind: "notice";
  readonly text: string;
  readonly tone: Tone | null;
  readonly path: string;
}
export interface OutlineStatus {
  readonly kind: "status";
  readonly text: string;
  readonly tone: Tone | null;
  readonly struck: boolean;
  readonly path: string;
}
export type FieldControl = "text" | "number" | "date" | "time" | "select" | "multiselect" | "textarea" | "checkbox" | "radio" | "switch" | "file" | "password" | "email" | "tel" | "url" | "search" | "custom";
export interface OutlineField {
  readonly kind: "field";
  readonly label: string;
  readonly control: FieldControl;
  readonly name: string | null;
  readonly required: boolean;
  readonly readonly: boolean;
  readonly disabled: boolean;
  readonly placeholder: string | null;
  readonly options: readonly string[];
  /** 可选值在 DOM 里看得到（原生 select、展开记录过的下拉）；组件库的下拉收起时看不到。 */
  readonly options_visible: boolean;
  readonly constraints: Readonly<Record<string, string>>;
  /** 标签里的说明气泡（业务说明，保留下来交给实现放进提示）。 */
  readonly hint: string | null;
  /** 只在某些情况下出现（控件本身隐藏，如新增与编辑两种状态下的不同控件）。 */
  readonly conditional: boolean;
  readonly path: string;
}
export interface OutlineAction {
  readonly kind: "action";
  readonly label: string;
  readonly element: "button" | "link";
  readonly disabled: boolean;
  readonly icon: string | null;
  readonly intent: string | null;
  readonly path: string;
}
export interface OutlineColumn {
  readonly label: string;
  readonly numeric: boolean;
  readonly frozen: "left" | "right" | null;
}
export interface OutlineTable {
  readonly kind: "table";
  readonly title: string | null;
  readonly columns: readonly OutlineColumn[];
  readonly rows: readonly (readonly string[])[];
  readonly selectable: boolean;
  readonly path: string;
}
export interface OutlineTabs {
  readonly kind: "tabs";
  readonly items: ReadonlyArray<{ readonly label: string; readonly count: string | null; readonly selected: boolean }>;
  readonly path: string;
}
export interface OutlineList {
  readonly kind: "list";
  readonly items: readonly string[];
  readonly path: string;
}
export interface OutlineNav {
  readonly kind: "nav";
  readonly items: readonly string[];
  readonly path: string;
}
export interface OutlineCopy {
  readonly kind: "copy";
  readonly text: string;
  readonly path: string;
}
export type OutlineNode = OutlineRegion | OutlineHeading | OutlineNotice | OutlineStatus | OutlineField | OutlineAction | OutlineTable | OutlineTabs | OutlineList | OutlineNav | OutlineCopy;

export interface DroppedPresentation {
  readonly classes: number;
  readonly inline_styles: number;
  readonly style_blocks: number;
  readonly scripts: number;
  readonly layout_wrappers: number;
  readonly fonts: readonly string[];
  readonly colors: readonly string[];
  readonly stylesheets: readonly string[];
}

export interface PrototypeOutline {
  readonly title: string | null;
  readonly lang: string | null;
  readonly root: OutlineRegion;
  readonly dropped: DroppedPresentation;
}

const LANDMARKS: Readonly<Record<string, RegionRole>> = { nav: "nav", header: "header", main: "main", aside: "aside", footer: "footer", section: "section", form: "form", dialog: "dialog", fieldset: "section", article: "section" };
const ROLE_LANDMARKS: Readonly<Record<string, RegionRole>> = { navigation: "nav", banner: "header", main: "main", complementary: "aside", contentinfo: "footer", region: "section", form: "form", dialog: "dialog", alertdialog: "dialog", tabpanel: "section" };
const CONTROL_TAGS = new Set(["input", "select", "textarea"]);
const ACTION_ROLES = new Set(["button", "link", "menuitem"]);

function regionRoleOf(node: HtmlElement): RegionRole | null {
  const role = node.attrs["role"];
  if (role !== undefined && ROLE_LANDMARKS[role] !== undefined) return ROLE_LANDMARKS[role] ?? null;
  if (LANDMARKS[node.tag] !== undefined) return LANDMARKS[node.tag] ?? null;
  const hint = classText(node);
  if (/\s[\w-]*(modal|dialog|drawer|offcanvas|sheet)(?![\w-]*(header|footer|title|body|close|mask|wrap|content))[\w-]*\s/.test(hint) || node.attrs["aria-modal"] === "true") return "dialog";
  if (/\s[\w-]*(card|panel)(?![\w-]*(header|footer|title|body|extra|head))[\w-]*\s/.test(hint)) return "card";
  return null;
}

function controlOf(node: HtmlElement): FieldControl | null {
  const ariaRole = node.attrs["role"];
  if (ariaRole === "combobox") return node.attrs["aria-multiselectable"] === "true" ? "multiselect" : "select";
  if (ariaRole === "spinbutton") return "number";
  if (ariaRole === "switch") return "switch";
  if (node.tag === "select") return node.attrs["multiple"] !== undefined ? "multiselect" : "select";
  if (node.tag === "textarea") return "textarea";
  if (node.tag === "input") {
    const type = (node.attrs["type"] ?? "text").toLowerCase();
    if (["hidden", "submit", "button", "reset", "image"].includes(type)) return null;
    if (type === "datetime-local" || type === "month" || type === "week") return "date";
    const known: readonly FieldControl[] = ["text", "number", "date", "time", "checkbox", "radio", "file", "password", "email", "tel", "url", "search"];
    return known.includes(type as FieldControl) ? (type as FieldControl) : "text";
  }
  const role = node.attrs["role"];
  if (role === "combobox") return node.attrs["aria-multiselectable"] === "true" ? "multiselect" : "select";
  if (role === "switch") return "switch";
  if (role === "checkbox") return "checkbox";
  if (role === "radiogroup") return "radio";
  if (role === "spinbutton") return "number";
  if (role === "textbox") return node.attrs["aria-multiline"] === "true" ? "textarea" : "text";
  return null;
}

function isActionElement(node: HtmlElement): boolean {
  if (node.tag === "button") return true;
  if (node.tag === "a") return node.attrs["href"] !== undefined || node.attrs["onclick"] !== undefined;
  if (node.tag === "input") return ["submit", "button", "reset"].includes((node.attrs["type"] ?? "").toLowerCase());
  const role = node.attrs["role"];
  return role !== undefined && ACTION_ROLES.has(role);
}

function isTab(node: HtmlElement): boolean {
  return node.attrs["role"] === "tab" || (isActionElement(node) && /\s[\w-]*tab(?!le|ular)[\w-]*\s/.test(classText(node)));
}

interface Context {
  readonly ids: ReadonlyMap<string, HtmlElement>;
  readonly labelsFor: ReadonlyMap<string, HtmlElement>;
  readonly dropped: { classes: number; inline_styles: number; style_blocks: number; scripts: number; layout_wrappers: number; fonts: Set<string>; colors: Set<string>; stylesheets: Set<string> };
  readonly used: Set<HtmlElement>;
}

function indexDocument(root: HtmlElement): Context {
  const ids = new Map<string, HtmlElement>();
  const labelsFor = new Map<string, HtmlElement>();
  const dropped = { classes: 0, inline_styles: 0, style_blocks: 0, scripts: 0, layout_wrappers: 0, fonts: new Set<string>(), colors: new Set<string>(), stylesheets: new Set<string>() };
  const collectStyle = (css: string) => {
    for (const match of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) dropped.colors.add(match[0].toLowerCase());
    for (const match of css.matchAll(/font-family\s*:\s*([^;}"]+)/gi)) {
      const first = (match[1] ?? "").split(",")[0]?.replace(/['"]/g, "").trim();
      if (first !== undefined && first !== "") dropped.fonts.add(first);
    }
  };
  const walk = (node: HtmlElement) => {
    if (node.attrs["id"] !== undefined) ids.set(node.attrs["id"], node);
    if (node.tag === "label" && node.attrs["for"] !== undefined) labelsFor.set(node.attrs["for"], node);
    if (node.attrs["class"] !== undefined) dropped.classes += 1;
    if (node.attrs["style"] !== undefined) {
      dropped.inline_styles += 1;
      collectStyle(node.attrs["style"]);
    }
    if (node.tag === "style") {
      dropped.style_blocks += 1;
      collectStyle(node.children.filter((child): child is string => typeof child === "string").join(""));
    }
    if (node.tag === "script") {
      dropped.scripts += 1;
      const src = node.attrs["src"];
      if (src !== undefined && /tailwind|bootstrap|bulma|element|antd|vant|layui/i.test(src)) dropped.stylesheets.add(src);
      const config = node.children.filter((child): child is string => typeof child === "string").join("");
      for (const match of config.matchAll(/['"](#[0-9a-fA-F]{3,8})['"]/g)) dropped.colors.add((match[1] ?? "").toLowerCase());
      for (const match of config.matchAll(/sans:\s*\[\s*['"]([^'"]+)['"]/g)) dropped.fonts.add(match[1] ?? "");
    }
    if (node.tag === "link" && /stylesheet/i.test(node.attrs["rel"] ?? "")) {
      const href = node.attrs["href"] ?? "";
      dropped.stylesheets.add(href);
      const family = /family=([^:&]+)/.exec(href)?.[1];
      if (family !== undefined) dropped.fonts.add(decodeURIComponent(family.replace(/\+/g, " ")));
    }
    for (const child of elements(node)) walk(child);
  };
  walk(root);
  return { ids, labelsFor, dropped, used: new Set() };
}

function pathOf(parent: string, node: HtmlElement, index: number): string {
  const id = node.attrs["id"];
  return `${parent}>${node.tag}${id !== undefined ? `#${id}` : `:${index}`}`;
}

/** 字段的名字：label[for] → aria-label → aria-labelledby → 包住它的 label → 同一容器里最近的标签文字 → placeholder。 */
function labelOfControl(control: HtmlElement, ancestors: readonly HtmlElement[], ctx: Context): { label: string; required: boolean; hint?: string | null } | null {
  const id = control.attrs["id"];
  if (id !== undefined) {
    const label = ctx.labelsFor.get(id);
    if (label !== undefined) {
      ctx.used.add(label);
      const own = labelTextOf(label);
      return { label: normalizeLabel(own.text), required: hasRequiredMark(label), hint: own.hint };
    }
  }
  const aria = control.attrs["aria-label"];
  if (aria !== undefined && clean(aria) !== "") return { label: normalizeLabel(aria), required: false };
  const labelledBy = control.attrs["aria-labelledby"];
  if (labelledBy !== undefined) {
    const text = labelledBy
      .split(/\s+/)
      .map((ref) => ctx.ids.get(ref))
      .filter((node): node is HtmlElement => node !== undefined)
      .map((node) => {
        ctx.used.add(node);
        return textOf(node);
      })
      .join(" ");
    if (clean(text) !== "") return { label: normalizeLabel(text), required: /[*＊]/.test(text) };
  }
  for (let depth = ancestors.length - 1; depth >= 0 && depth >= ancestors.length - 4; depth -= 1) {
    const ancestor = ancestors[depth];
    if (ancestor === undefined) continue;
    if (ancestor.tag === "label") {
      ctx.used.add(ancestor);
      const own = labelTextOf(ancestor);
      if (clean(own.text) !== "") return { label: normalizeLabel(own.text), required: hasRequiredMark(ancestor), hint: own.hint };
    }
    const controls = countControls(ancestor);
    if (controls > 1 && depth < ancestors.length - 1) break;
    const candidate = labelCandidate(ancestor, control);
    if (candidate !== null) {
      ctx.used.add(candidate);
      const own = labelTextOf(candidate);
      return { label: normalizeLabel(own.text), required: hasRequiredMark(candidate) || (hasRequiredMark(ancestor) && /required/.test(classText(ancestor))), hint: own.hint };
    }
  }
  const placeholder = control.attrs["placeholder"];
  if (placeholder !== undefined && clean(placeholder) !== "") return { label: placeholderLabel(placeholder), required: false };
  if (control.tag === "select") {
    const first = elements(control).find((child) => child.tag === "option");
    const text = first === undefined ? "" : clean(textOf(first));
    if (first !== undefined && (first.attrs["value"] === "" || /^(请选择|全部|--)/.test(text)) && placeholderLabel(text) !== "") return { label: placeholderLabel(text), required: false };
  }
  const visiblePlaceholder = control.attrs["data-placeholder"];
  if (visiblePlaceholder !== undefined && clean(visiblePlaceholder) !== "") return { label: placeholderLabel(visiblePlaceholder), required: false };
  return null;
}

/** 占位文字当标签用时去掉「请输入 / 请选择 / 全部」与省略号。 */
function placeholderLabel(text: string): string {
  return normalizeLabel(clean(text).replace(/^(请输入|请选择|请填写|全部|所有)/, "").replace(/[.…]+$/, "").replace(/^[-—\s]+|[-—\s]+$/g, ""));
}

function countControls(node: HtmlElement): number {
  let count = controlOf(node) !== null ? 1 : 0;
  for (const child of elements(node)) count += countControls(child);
  return count;
}

/** 同一容器里、控件前面的标签：label 元素，或「label / title / name」类名的短文字元素。 */
function labelCandidate(container: HtmlElement, control: HtmlElement): HtmlElement | null {
  let found: HtmlElement | null = null;
  const walk = (node: HtmlElement): boolean => {
    if (node === control) return true;
    if (node.tag === "label" || (/label|title|name|caption/.test(classText(node)) && clean(textOf(node)).length > 0 && clean(textOf(node)).length <= 24 && countControls(node) === 0)) {
      found = node;
      return false;
    }
    for (const child of elements(node)) if (walk(child)) return true;
    return false;
  };
  walk(container);
  return found;
}

function optionsOf(control: HtmlElement, ctx: Context): string[] {
  if (control.tag === "select") {
    const out: string[] = [];
    const walk = (node: HtmlElement) => {
      for (const child of elements(node)) {
        if (child.tag === "option") {
          const text = clean(textOf(child));
          const value = child.attrs["value"];
          if (text !== "" && value !== "" && !/^(请选择|--|全部|please select)/i.test(text)) out.push(text);
        } else walk(child);
      }
    };
    walk(control);
    return out;
  }
  const recorded = control.attrs["data-pomaster-options"];
  if (recorded !== undefined) {
    try {
      const parsed = JSON.parse(recorded) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => clean(String(item))).filter(Boolean);
    } catch {
      // 记录坏了就当没有
    }
  }
  const listId = control.attrs["aria-controls"] ?? control.attrs["aria-owns"] ?? control.attrs["list"];
  const list = listId === undefined ? undefined : ctx.ids.get(listId);
  if (list === undefined) return [];
  const out: string[] = [];
  const walk = (node: HtmlElement) => {
    for (const child of elements(node)) {
      if (child.attrs["role"] === "option" || child.tag === "option") {
        const text = clean(child.attrs["label"] ?? textOf(child));
        if (text !== "") out.push(text);
      } else walk(child);
    }
  };
  walk(list);
  return out;
}

const NUMERIC_HEADER = /(价|金额|数量|单价|总价|费用|成本|率|占比|（元）|\(元\)|万元|%|count|amount|price|qty|total|rate)/i;

function tableOf(node: HtmlElement, path: string, title: string | null): OutlineTable {
  const rows: HtmlElement[] = [];
  const headerCells: HtmlElement[] = [];
  const walk = (current: HtmlElement, inHead: boolean) => {
    for (const child of elements(current)) {
      if (child.tag === "thead") walk(child, true);
      else if (child.tag === "tbody" || child.tag === "tfoot") walk(child, false);
      else if (child.tag === "tr" || child.attrs["role"] === "row") {
        const cells = elements(child).filter((cell) => ["th", "td"].includes(cell.tag) || ["columnheader", "gridcell", "cell", "rowheader"].includes(cell.attrs["role"] ?? ""));
        const isHeader = inHead || (headerCells.length === 0 && cells.length > 0 && cells.every((cell) => cell.tag === "th" || cell.attrs["role"] === "columnheader"));
        if (isHeader && headerCells.length === 0) headerCells.push(...cells);
        else if (!isHeader) rows.push(child);
      } else if (!["caption", "colgroup"].includes(child.tag)) walk(child, inHead);
    }
  };
  walk(node, false);
  const sampleRows = rows.slice(0, 5).map((tr) => elements(tr).filter((cell) => ["th", "td"].includes(cell.tag) || ["gridcell", "cell", "rowheader"].includes(cell.attrs["role"] ?? "")).map((cell) => clean(textOf(cell))));
  let selectable = false;
  const columns: OutlineColumn[] = [];
  headerCells.forEach((cell, index) => {
    const labelText = normalizeLabel(textOf(cell) || cell.attrs["aria-label"] || "");
    const hasCheckbox = containsCheckbox(cell) || (rows[0] !== undefined && elements(rows[0])[index] !== undefined && containsCheckbox(elements(rows[0])[index]!) && labelText === "");
    if (hasCheckbox && labelText === "") {
      selectable = true;
      return;
    }
    if (labelText === "" || labelText === "#") return;
    const hint = `${classText(cell)} ${styleOf(cell)}`;
    const frozen = /(sticky|frozen|fixed|freeze)[\w-]*(left|start)|left-0|cell-fix-left|pinned-left/.test(hint) ? "left" : /(sticky|frozen|fixed|freeze)[\w-]*(right|end)|right-0|cell-fix-right|pinned-right/.test(hint) ? "right" : null;
    const values = sampleRows.map((sample) => sample[index] ?? "").filter((value) => value !== "");
    const numericValues = values.length > 0 && values.every((value) => /^[-+¥$€]?\s?[\d,]+(\.\d+)?\s?(%|元|万)?$/.test(value));
    const aligned = /text-right|align:right|align-right|numeric/.test(hint);
    const numeric = values.length > 0 ? numericValues || aligned : aligned || NUMERIC_HEADER.test(labelText);
    columns.push({ label: labelText, numeric, frozen });
  });
  return { kind: "table", title, columns, rows: sampleRows, selectable, path };
}

function containsCheckbox(node: HtmlElement): boolean {
  if (node.tag === "input" && (node.attrs["type"] ?? "").toLowerCase() === "checkbox") return true;
  if (node.attrs["role"] === "checkbox") return true;
  return elements(node).some(containsCheckbox);
}

function headingLevel(node: HtmlElement): number | null {
  const match = /^h([1-6])$/.exec(node.tag);
  if (match !== null) return Number(match[1]);
  if (node.attrs["role"] === "heading") return Number(node.attrs["aria-level"] ?? 2);
  return null;
}

function isTitleish(node: HtmlElement): boolean {
  return (
    headingLevel(node) !== null ||
    node.tag === "legend" ||
    /(^|\s)[\w-]*title(?!-content|-wrapper)[\w-]*(\s|$)/.test(classText(node).trim()) ||
    /title/i.test(node.attrs["id"] ?? "") ||
    (/\s(font-semibold|font-bold)\s/.test(classText(node)) && countControls(node) === 0 && !isActionElement(node) && clean(textOf(node)).length >= 2)
  );
}

/** 找标题时不钻进这些（导航、菜单、表格、列表、嵌套的区域）。 */
function titleBarrier(node: HtmlElement): boolean {
  const role = regionRoleOf(node);
  return ["nav", "ul", "ol", "table", "menu", "form"].includes(node.tag) || ["menu", "menubar", "tablist", "navigation", "grid", "table", "dialog", "region"].includes(node.attrs["role"] ?? "") || (role !== null && role !== "header");
}

/**
 * 区域的标题：aria-label / aria-labelledby 优先；弹窗与主内容取里面第一个标题样的元素；卡片与区块只看
 * 第一个子元素里的标题（标题在顶上）；表单只认 legend；导航、侧栏、页头页脚不取标题（地标本身不是业务分组）。
 */
function regionTitle(node: HtmlElement, role: RegionRole): string | null {
  if (node.attrs["aria-label"] !== undefined && clean(node.attrs["aria-label"]) !== "") return clean(node.attrs["aria-label"]);
  const labelledBy = node.attrs["aria-labelledby"];
  if (labelledBy !== undefined) {
    const walkId = (current: HtmlElement): string | null => {
      for (const child of elements(current)) {
        if (child.attrs["id"] === labelledBy) return clean(textOf(child));
        const found = walkId(child);
        if (found !== null) return found;
      }
      return null;
    };
    const found = walkId(node);
    if (found !== null && found !== "") return found;
  }
  if (role === "nav" || role === "aside" || role === "header" || role === "footer") return null;
  if (role === "form") {
    const legend = elements(node).find((child) => child.tag === "legend");
    return legend === undefined ? null : clean(textOf(legend)) || null;
  }
  const scopes = role === "card" || role === "section" ? elements(node).slice(0, 1) : [node];
  const maxDepth = role === "card" || role === "section" ? 3 : 6;
  let found: string | null = null;
  const walk = (current: HtmlElement, depth: number, self: boolean) => {
    if (found !== null || depth > maxDepth) return;
    const candidates = self ? [current] : elements(current);
    for (const child of candidates) {
      if (found !== null) return;
      if (!self && titleBarrier(child)) continue;
      if (isTitleish(child)) {
        const text = clean(textOf(child));
        if (text !== "" && text.length <= 40) found = text;
      } else walk(child, depth + 1, false);
    }
  };
  for (const scope of scopes) walk(scope, 0, scope !== node);
  return found;
}

function isNotice(node: HtmlElement): boolean {
  const role = node.attrs["role"];
  if (role === "alert" || role === "status" || role === "note") return true;
  return /\s[\w-]*(alert|notice|banner|callout|tip|hint|info-bar|message)(?![\w-]*(icon|close|title))[\w-]*\s/.test(classText(node)) || /(^|\s)bg-(blue|amber|yellow|red|green|orange)-50(\s|$)/.test(classText(node).trim());
}

function isStatusLike(node: HtmlElement, text: string): boolean {
  if (text.length === 0 || text.length > 8) return false;
  if (/\s[\w-]*(status|badge|tag|chip|pill)[\w-]*\s/.test(classText(node))) return true;
  const tone = toneOf(node);
  return tone !== null && tone !== "neutral" && /\s(bg-|border-)|background/.test(`${classText(node)} ${styleOf(node)}`);
}

/** 字段分组的小标题：短文字、加粗或标题类的样式（只用来认出「这是分组名」，样式本身丢掉）。 */
function isGroupTitle(node: HtmlElement, text: string): boolean {
  if (text.length > 30 || node.tag === "span" || node.tag === "a" || node.tag === "label") return false;
  return /\s(font-semibold|font-bold|fw-bold|fw-semibold)\s|\s[\w-]*(section-title|group-title|subtitle|divider-inner-text|divider-with-text|legend)[\w-]*\s/.test(classText(node)) || /font-weight:(600|700|800|bold)/.test(styleOf(node)) || ["strong", "b"].includes(node.tag);
}

/** HTML → 去掉表现的大纲。 */
export function outlineOf(document: HtmlElement): PrototypeOutline {
  const ctx = indexDocument(document);
  let title: string | null = null;
  let lang: string | null = null;
  const findMeta = (node: HtmlElement) => {
    if (node.tag === "html" && node.attrs["lang"] !== undefined) lang = node.attrs["lang"];
    if (node.tag === "title" && title === null) title = clean(textOf({ ...node, tag: "span" }));
    for (const child of elements(node)) findMeta(child);
  };
  findMeta(document);
  const body = findTag(document, "body") ?? document;
  const root: OutlineRegion = { kind: "region", role: "page", title, hidden: false, path: "body", children: [] };
  prepassLabels(body, [], ctx);
  walkOutline(body, [], root, root.children, "body", false, ctx);
  const dropped: DroppedPresentation = {
    classes: ctx.dropped.classes,
    inline_styles: ctx.dropped.inline_styles,
    style_blocks: ctx.dropped.style_blocks,
    scripts: ctx.dropped.scripts,
    layout_wrappers: ctx.dropped.layout_wrappers,
    fonts: [...ctx.dropped.fonts].sort(),
    colors: [...ctx.dropped.colors].sort(),
    stylesheets: [...ctx.dropped.stylesheets].sort(),
  };
  return { title, lang, root, dropped };
}

function findTag(node: HtmlElement, tag: string): HtmlElement | null {
  if (node.tag === tag) return node;
  for (const child of elements(node)) {
    const found = findTag(child, tag);
    if (found !== null) return found;
  }
  return null;
}

/** 先把每个控件的标签找出来并标记为已用，避免标签文字在前面被当成普通文案。 */
function prepassLabels(node: HtmlElement, ancestors: HtmlElement[], ctx: Context): void {
  for (const child of elements(node)) {
    if (controlOf(child) !== null) labelOfControl(child, [...ancestors, node], ctx);
    else prepassLabels(child, [...ancestors, node], ctx);
  }
}

function walkOutline(node: HtmlElement, ancestors: HtmlElement[], parent: OutlineRegion, out: OutlineNode[], path: string, hidden: boolean, ctx: Context): void {
  elements(node).forEach((child, index) => {
    const childPath = pathOf(path, child, index);
    if (["script", "style", "template", "noscript", "head", "meta", "link", "svg", "colgroup"].includes(child.tag)) return;
    if (ctx.used.has(child)) return;
    const childHidden = hidden || isHidden(child);
    if (isScreenReaderOnly(child)) return;
    const next = [...ancestors, node];

    const role = regionRoleOf(child);
    if (role !== null) {
      const title = regionTitle(child, role);
      // 组件库的弹窗、卡片常有几层同名的包裹（遮罩、外框、内容）；同类同名的嵌套只算一个区域，
      // 没有标题的卡片、区块只是排版，不算区域。
      const sameAsParent = parent.role === role && (parent.title === title || title === null);
      const untitledLayout = title === null && (role === "card" || role === "section");
      if (sameAsParent || untitledLayout) {
        walkOutline(child, next, parent, out, childPath, childHidden, ctx);
        return;
      }
      const region: OutlineRegion = { kind: "region", role, title, hidden: childHidden, path: childPath, children: [] };
      out.push(region);
      if (role === "nav") {
        const links = collectLinks(child);
        const items = links.length > 0 ? links : collectLeafTexts(child);
        if (items.length > 0) region.children.push({ kind: "nav", items, path: childPath });
        else walkOutline(child, next, region, region.children, childPath, childHidden, ctx);
      } else {
        walkOutline(child, next, region, region.children, childPath, childHidden, ctx);
      }
      return;
    }

    const level = headingLevel(child);
    if (level !== null) {
      const text = clean(textOf(child));
      if (text !== "") out.push({ kind: "heading", level, text, path: childPath });
      return;
    }

    if (child.tag === "table" || child.attrs["role"] === "grid" || child.attrs["role"] === "table" || child.attrs["role"] === "treegrid") {
      const caption = findTag(child, "caption");
      out.push(tableOf(child, childPath, caption === null ? null : clean(textOf(caption))));
      return;
    }

    if (child.attrs["role"] === "tablist" || elements(child).filter(isTab).length >= 2) {
      const tabs = elements(child).filter((tab) => isTab(tab) || isActionElement(tab));
      if (tabs.length >= 2) {
        out.push({
          kind: "tabs",
          items: tabs.map((tab) => {
            const raw = clean(textOf(tab));
            const count = /[(（]?\s*(\d[\d,]*)\s*[)）]?\s*$/.exec(raw)?.[1] ?? null;
            return { label: normalizeLabel(count === null ? raw : raw.replace(/[(（]?\s*\d[\d,]*\s*[)）]?\s*$/, "")), count, selected: tab.attrs["aria-selected"] === "true" || /\s(active|selected|is-active|current)\s/.test(classText(tab)) };
          }),
          path: childPath,
        });
        return;
      }
    }

    const control = controlOf(child);
    if (control !== null) {
      const named = labelOfControl(child, next, ctx);
      if (named === null || named.label === "") return;
      out.push({
        kind: "field",
        label: named.label,
        control,
        name: child.attrs["name"] ?? child.attrs["id"] ?? null,
        required: named.required || child.attrs["required"] !== undefined || child.attrs["aria-required"] === "true",
        // 组件库的下拉把搜索框设成 readonly，那不是「只读字段」
        readonly: (child.attrs["readonly"] !== undefined && child.attrs["role"] !== "combobox") || child.attrs["aria-readonly"] === "true",
        disabled: child.attrs["disabled"] !== undefined || child.attrs["aria-disabled"] === "true",
        placeholder: child.attrs["placeholder"] ?? null,
        options: optionsOf(child, ctx),
        options_visible: child.tag === "select" || child.attrs["data-pomaster-options"] !== undefined || optionsOf(child, ctx).length > 0 || !["select", "multiselect"].includes(control),
        constraints: Object.fromEntries(["maxlength", "minlength", "min", "max", "step", "pattern", "accept"].filter((key) => child.attrs[key] !== undefined).map((key) => [key, child.attrs[key] ?? ""])),
        hint: named.hint ?? null,
        conditional: isHidden(child) && !hidden,
        path: childPath,
      });
      return;
    }

    // 没有原生控件的自定义输入（BA 原型里常见的手写下拉）：一个没被认领的 label，后面跟一个「请选择…」的触发器
    if (child.tag === "label" && !ctx.used.has(child)) {
      const own = labelTextOf(child);
      const raw = clean(own.text);
      if (raw !== "") {
        const note = /[（(]([^）)]*)[）)]/.exec(raw)?.[1] ?? "";
        const siblings = elements(node);
        const trigger = siblings[index + 1];
        const placeholder = trigger !== undefined && countControls(trigger) === 0 && /^(请选择|请输入|选择|输入)/.test(clean(textOf(trigger))) ? clean(textOf(trigger)) : null;
        if (trigger !== undefined && placeholder !== null) ctx.used.add(trigger);
        ctx.used.add(child);
        out.push({
          kind: "field",
          label: normalizeLabel(raw.replace(/[（(][^）)]*[）)]/g, "")),
          control: /多选/.test(`${note}${placeholder ?? ""}`) ? "multiselect" : /选择|下拉/.test(`${note}${placeholder ?? ""}`) ? "select" : "custom",
          name: null,
          required: hasRequiredMark(child),
          readonly: false,
          disabled: false,
          placeholder,
          options: [],
          options_visible: false,
          constraints: {},
          hint: note === "" ? own.hint : note,
          conditional: false,
          path: childPath,
        });
        return;
      }
    }

    if (isActionElement(child)) {
      const visible = clean(textOf(child));
      const label = (/^\d+$/.test(visible) && iconOf(child) !== null ? "" : visible) || clean(child.attrs["aria-label"] ?? child.attrs["title"] ?? child.attrs["value"] ?? "");
      if (label === "" && iconOf(child) === null) return;
      out.push({
        kind: "action",
        label: label === "" ? `（图标：${iconOf(child)}）` : label,
        element: child.tag === "a" ? "link" : "button",
        disabled: child.attrs["disabled"] !== undefined || child.attrs["aria-disabled"] === "true",
        icon: iconOf(child),
        intent: (child.attrs["onclick"] ?? child.attrs["href"] ?? null)?.replace(/^javascript:/, "") ?? null,
        path: childPath,
      });
      return;
    }

    if (isNotice(child)) {
      const text = clean(textOf(child));
      if (text !== "") out.push({ kind: "notice", text, tone: toneOf(child), path: childPath });
      return;
    }

    if ((child.tag === "ul" || child.tag === "ol" || child.tag === "dl") && elements(child).length > 0 && countControls(child) === 0 && !elements(child).some(isActionElement)) {
      const items = elements(child).map((item) => clean(textOf(item))).filter(Boolean);
      if (items.length > 0) out.push({ kind: "list", items, path: childPath });
      return;
    }

    const text = clean(textOf(child));
    const leaf = elements(child).every((grand) => ["b", "strong", "em", "i", "span", "code", "small", "br", "sup", "sub", "mark", "u", "del", "s"].includes(grand.tag) && countControls(grand) === 0 && !isActionElement(grand));
    if (leaf && text !== "") {
      if (isGroupTitle(child, text)) out.push({ kind: "heading", level: 5, text: text.replace(/[（(][^）)]*[）)]/g, "").trim(), path: childPath });
      else if (isStatusLike(child, text)) out.push({ kind: "status", text, tone: toneOf(child), struck: struck(child), path: childPath });
      else if (/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/.test(text) && !/^\d+$/.test(text) && !/^(请选择|请输入|全部|搜索)/.test(text)) out.push({ kind: "copy", text, path: childPath });
      return;
    }
    ctx.dropped.layout_wrappers += child.tag === "div" || child.tag === "span" ? 1 : 0;
    walkOutline(child, next, parent, out, childPath, childHidden, ctx);
  });
}

/** 导航项是脚本挂的点击事件（没有 a / button）时，按叶子文字读。 */
function collectLeafTexts(node: HtmlElement): string[] {
  const out: string[] = [];
  const walk = (current: HtmlElement) => {
    const kids = elements(current).filter((child) => !["svg", "i", "img", "script", "style"].includes(child.tag));
    const text = clean(textOf(current));
    if (kids.length === 0 || kids.every((child) => ["span", "b", "strong", "em"].includes(child.tag) && elements(child).length === 0)) {
      if (text !== "" && text.length <= 24) out.push(text);
      return;
    }
    for (const child of kids) walk(child);
  };
  walk(node);
  return [...new Set(out)];
}

function collectLinks(node: HtmlElement): string[] {
  const out: string[] = [];
  const walk = (current: HtmlElement) => {
    for (const child of elements(current)) {
      if (isActionElement(child)) {
        const text = clean(textOf(child)) || clean(child.attrs["aria-label"] ?? child.attrs["title"] ?? "");
        if (text !== "") out.push(text);
      } else walk(child);
    }
  };
  walk(node);
  return out;
}

// ============================================================
// 事实清单
// ============================================================

export type FactKind = "page" | "region" | "field" | "action" | "column" | "tab" | "notice" | "status" | "nav" | "copy" | "spec_field" | "spec_rule" | "spec_enum";

export interface PrototypeFact {
  /** 对账用的稳定键：种类 + 所在区域 + 名字。 */
  readonly key: string;
  readonly kind: FactKind;
  readonly context: readonly string[];
  readonly label: string;
  /** 业务属性（只放对账要比的东西，不放表现）。 */
  readonly attrs: Readonly<Record<string, unknown>>;
  /** 在同一区域里的先后（字段、列、标签页的顺序是信息结构）。 */
  readonly order: number;
  readonly source: string;
  readonly path: string;
}

/** 这些种类的差异算失败；文案类只提示（措辞可以按文案规范调整）。 */
export const BLOCKING_FACT_KINDS: ReadonlySet<FactKind> = new Set(["field", "action", "column", "tab", "notice", "status", "region"]);

const GENERIC_REGION_TITLES = new Set(["", "main", "header", "footer"]);

/** 大纲 → 事实清单。source 是出处标识（如 html:pages/user-mgmt.html）。 */
export function factsOf(outline: PrototypeOutline, source: string): PrototypeFact[] {
  const facts: PrototypeFact[] = [];
  if (outline.title !== null) facts.push({ key: `page:${outline.title}`, kind: "page", context: [], label: outline.title, attrs: {}, order: 0, source, path: "head>title" });
  const counters = new Map<string, number>();
  const nextOrder = (scope: string) => {
    const value = counters.get(scope) ?? 0;
    counters.set(scope, value + 1);
    return value;
  };
  const push = (kind: FactKind, context: readonly string[], label: string, attrs: Record<string, unknown>, path: string) => {
    const scope = `${kind}|${context.join("/")}`;
    const key = `${kind}:${[...context, label].join("/")}`;
    if (facts.some((fact) => fact.key === key)) return;
    facts.push({ key, kind, context, label, attrs, order: nextOrder(scope), source, path });
  };
  const walk = (nodes: readonly OutlineNode[], context: readonly string[]) => {
    let local = context;
    let group: string | null = null;
    for (const node of nodes) {
      switch (node.kind) {
        case "region": {
          const name = node.title ?? "";
          const meaningful = !GENERIC_REGION_TITLES.has(name.toLowerCase()) && name !== local.at(-1);
          const next = meaningful ? [...local, name] : local;
          if (meaningful && (node.role === "dialog" || node.role === "form" || node.role === "card" || node.role === "section")) {
            push("region", local, name, { role: node.role === "card" || node.role === "form" ? "section" : node.role, conditional: node.hidden }, node.path);
          }
          walk(node.children, next);
          break;
        }
        case "heading":
          // 页面或区域自己的标题成为上下文，不再单记一条文案；其余标题是分组名
          if (node.text === local.at(-1)) break;
          if (node.level <= 3 && local.length === context.length && context.length === 0) {
            local = [node.text];
            break;
          }
          if (node.level >= 2) group = node.text;
          push("copy", local, node.text, { heading: node.level }, node.path);
          break;
        case "field":
          push("field", local, node.label, {
            control: controlClass(node.control),
            required: node.required,
            editable: !node.readonly && !node.disabled,
            options: node.options,
            options_visible: node.options_visible,
            constraints: node.constraints,
            group,
            hint: node.hint,
          }, node.path);
          break;
        case "action":
          push("action", local, node.label, { disabled_initially: node.disabled, intent: intentOf(node.label, node.icon) }, node.path);
          break;
        case "table": {
          const tableContext = node.title === null ? local : [...local, node.title];
          node.columns.forEach((column) => push("column", tableContext, column.label, { numeric: column.numeric, frozen: column.frozen }, node.path));
          if (node.selectable) push("action", tableContext, "勾选行", { intent: "select", disabled_initially: false }, node.path);
          break;
        }
        case "tabs":
          node.items.forEach((item) => push("tab", local, item.label, { counted: item.count !== null, default: item.selected }, node.path));
          break;
        case "notice":
          push("notice", local, node.text, { tone: node.tone }, node.path);
          break;
        case "status":
          push("status", local, node.text, { tone: node.tone, struck: node.struck }, node.path);
          break;
        case "nav":
          node.items.forEach((item) => push("nav", [], item, {}, node.path));
          break;
        case "list":
          node.items.forEach((item) => push("copy", local, item, { list: true }, node.path));
          break;
        case "copy":
          if (node.text !== local.at(-1)) push("copy", local, node.text, {}, node.path);
          break;
      }
    }
  };
  walk(outline.root.children, []);
  return facts;
}

/** 控件按业务语义归类（自由文本 / 数值 / 日期 / 单选 / 多选 / 开关 / 文件）——下拉还是单选按钮组是表现。 */
export function controlClass(control: FieldControl): string {
  switch (control) {
    case "number":
      return "number";
    case "date":
    case "time":
      return "date";
    case "select":
    case "radio":
      return "choice";
    case "multiselect":
      return "multichoice";
    case "checkbox":
    case "switch":
      return "boolean";
    case "file":
      return "file";
    case "custom":
      return "any";
    default:
      return "text";
  }
}

const INTENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(新增|新建|添加|创建|add|create|plus|user-plus)/i, "create"],
  [/(删除|移除|作废|废除|delete|remove|trash)/i, "delete"],
  [/(编辑|修改|维护|edit|pencil|pen)/i, "edit"],
  [/(导出|下载|export|download)/i, "export"],
  [/(导入|上传|import|upload)/i, "import"],
  [/(查询|搜索|筛选|search|query|filter)/i, "query"],
  [/(保存|提交|确定|确认|save|submit|confirm|check)/i, "submit"],
  [/(取消|关闭|cancel|close|^x$)/i, "cancel"],
  [/(审批|通过|驳回|approve|reject)/i, "approve"],
  [/(查看|详情|view|eye|detail)/i, "view"],
  [/(回滚|撤销|还原|undo|rollback|restore)/i, "revert"],
];

export function intentOf(label: string, icon: string | null): string | null {
  for (const [pattern, intent] of INTENTS) if (pattern.test(label) || (icon !== null && pattern.test(icon))) return intent;
  return null;
}

// ============================================================
// spec（Markdown）里的业务规则
// ============================================================

interface MarkdownTable {
  readonly section: readonly string[];
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

function stripMarkdown(text: string): string {
  return clean(text.replace(/\*\*|__|`/g, "").replace(/<br\s*\/?>/gi, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => stripMarkdown(cell));
}

export function markdownTables(markdown: string): MarkdownTable[] {
  const lines = markdown.split(/\r?\n/);
  const tables: MarkdownTable[] = [];
  const section: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const depth = (heading[1] ?? "#").length;
      section.length = depth - 1;
      section[depth - 1] = stripMarkdown(heading[2] ?? "");
      continue;
    }
    const next = lines[index + 1] ?? "";
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(next)) {
      const header = splitRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        rows.push(splitRow(lines[index] ?? ""));
        index += 1;
      }
      index -= 1;
      tables.push({ section: section.filter(Boolean), header, rows });
    }
  }
  return tables;
}

const FIELD_NAME_HEADERS = /^(中文字段名|字段名|字段|中文名|名称|列名|字段名称|field|name)$/i;
const RULE_SENTENCE = /(SHALL|MUST|必须|不得|禁止|不允许|应当|只能|唯一)/;

/** spec → 事实：字段表的每一行（同名字段在多张表里出现时合并属性）、规则句、枚举。 */
export function specFactsOf(markdown: string, source: string): PrototypeFact[] {
  const facts: PrototypeFact[] = [];
  const seen = new Set<string>();
  const byKey = new Map<string, PrototypeFact>();
  let order = 0;
  const push = (fact: Omit<PrototypeFact, "order" | "source">) => {
    if (seen.has(fact.key)) {
      const existing = byKey.get(fact.key);
      if (existing !== undefined && fact.kind === "spec_field") {
        const merged: Record<string, unknown> = { ...existing.attrs };
        for (const [name, value] of Object.entries(fact.attrs)) {
          const empty = value === null || (Array.isArray(value) && value.length === 0);
          const current = merged[name];
          const currentEmpty = current === null || current === undefined || (Array.isArray(current) && current.length === 0);
          if (!empty && (currentEmpty || name === "required")) merged[name] = value;
        }
        const updated = { ...existing, attrs: merged };
        byKey.set(fact.key, updated);
        facts[facts.indexOf(existing)] = updated;
      }
      return;
    }
    seen.add(fact.key);
    const full = { ...fact, order: order++, source };
    byKey.set(fact.key, full);
    facts.push(full);
  };
  for (const table of markdownTables(markdown)) {
    const nameAt = table.header.findIndex((cell) => FIELD_NAME_HEADERS.test(cell));
    if (nameAt < 0) continue;
    const find = (pattern: RegExp) => table.header.findIndex((cell) => pattern.test(cell));
    const englishAt = find(/(英文|english|字段键|键|key)/i);
    const groupAt = find(/^(分组|分类|group)$/i);
    const requiredAt = find(/(必填|required)/i);
    const editAt = find(/(编辑|可编辑|editable)/i);
    const typeAt = find(/^(类型|数据类型|type)$/i);
    const controlAt = find(/(控件|组件)/);
    let group = "";
    for (const row of table.rows) {
      const label = normalizeLabel(row[nameAt] ?? "");
      if (label === "" || /^[—\-#\d]+$/.test(label)) continue;
      if (groupAt >= 0 && (row[groupAt] ?? "") !== "") group = row[groupAt] ?? group;
      const edit = editAt >= 0 ? row[editAt] ?? "" : "";
      const requiredText = requiredAt >= 0 ? row[requiredAt] ?? "" : "";
      const required = requiredAt < 0 || requiredText === "" ? null : /(否|选填|非必填|不必填|no|false|×|❌|✗|✘)/i.test(requiredText) ? false : /(必填|是|y|yes|✓|√|✅|✔|☑|true)/i.test(requiredText);
      const enumText = row.find((cell) => /枚举|可选值|取值/.test(cell)) ?? "";
      push({
        key: `spec_field:${label}`,
        kind: "spec_field",
        context: table.section,
        label,
        attrs: {
          english: englishAt >= 0 && englishAt !== nameAt ? row[englishAt] ?? null : null,
          group: group === "" ? null : group,
          type: typeAt >= 0 ? row[typeAt] ?? null : null,
          control_note: controlAt >= 0 ? row[controlAt] ?? null : null,
          required,
          required_note: requiredText === "" ? null : requiredText,
          editable: edit === "" ? null : !/(系统|自动|只读|不可)/.test(edit),
          edit_note: edit === "" ? null : edit,
          enum: enumValues(enumText),
        },
        path: `${table.section.join(" > ")}`,
      });
    }
  }
  const lines = markdown.split(/\r?\n/);
  const section: string[] = [];
  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const depth = (heading[1] ?? "#").length;
      section.length = depth - 1;
      section[depth - 1] = stripMarkdown(heading[2] ?? "");
      return;
    }
    if (line.trim().startsWith("|")) return;
    const text = stripMarkdown(line.replace(/^\s*[-*+]\s+|^\s*\d+\.\s+/, ""));
    if (text.length < 6) return;
    if (RULE_SENTENCE.test(text)) push({ key: `spec_rule:${section.filter(Boolean).join(" > ")}#${index + 1}`, kind: "spec_rule", context: section.filter(Boolean), label: text, attrs: {}, path: `L${index + 1}` });
    const enumMatch = /\*\*([^*]+)\*\*[：:][^。\n]*?枚举值[：:]([^。\n]+)/.exec(line);
    if (enumMatch !== null) {
      push({ key: `spec_enum:${normalizeLabel(enumMatch[1] ?? "")}`, kind: "spec_enum", context: section.filter(Boolean), label: normalizeLabel(enumMatch[1] ?? ""), attrs: { values: enumValues(enumMatch[2] ?? "") }, path: `L${index + 1}` });
    }
  });
  return facts;
}

function enumValues(text: string): string[] {
  const body = /(?:枚举值?|可选值|取值)[：:]?\s*(.*)$/.exec(text)?.[1] ?? "";
  if (body === "") return [];
  return body
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .split(/[、,，/|；;]/)
    .map((value) => clean(value))
    .filter((value) => value !== "" && value.length <= 12);
}

// ============================================================
// 冲突与对账
// ============================================================

export interface PrototypeQuestion {
  readonly id: string;
  /** Question Gate 申报分类：BLOCKING_AUTHORITY（业务事实冲突，人裁决）/ PREFERENCE（结构取舍）/ DERIVABLE（规范已有答案）。 */
  readonly classification: "BLOCKING_AUTHORITY" | "PREFERENCE" | "DERIVABLE";
  readonly question_zh: string;
  readonly default_zh: string;
  readonly facts: readonly string[];
}

export interface StandardLimits {
  /** 管理侧每页条数上限（规范 PERF.LARGE_LISTS 的 admin_max_page_size）。 */
  readonly max_page_size?: number;
}

/** spec 与 HTML、原型与规范之间的冲突 → 提问（默认口径写进提问里，不自己挑）。 */
export function questionsOf(htmlFacts: readonly PrototypeFact[], specFacts: readonly PrototypeFact[], limits: StandardLimits = {}): PrototypeQuestion[] {
  const questions: PrototypeQuestion[] = [];
  const htmlByLabel = new Map<string, PrototypeFact[]>();
  for (const fact of htmlFacts) {
    if (fact.kind !== "field" && fact.kind !== "column") continue;
    htmlByLabel.set(fact.label, [...(htmlByLabel.get(fact.label) ?? []), fact]);
  }
  let seq = 0;
  const ask = (classification: PrototypeQuestion["classification"], question: string, fallback: string, facts: readonly string[]) => {
    seq += 1;
    questions.push({ id: `PQ-${String(seq).padStart(3, "0")}`, classification, question_zh: question, default_zh: fallback, facts });
  };
  const specFields = specFacts.filter((fact) => fact.kind === "spec_field");
  for (const spec of specFields) {
    const matches = htmlByLabel.get(spec.label) ?? [];
    const fields = matches.filter((fact) => fact.kind === "field");
    for (const field of fields) {
      if (spec.attrs["required"] === true && field.attrs["required"] !== true) {
        ask("BLOCKING_AUTHORITY", `「${spec.label}」spec 写的是必填，原型里没标必填。按哪个？`, "按 spec：必填", [spec.key, field.key]);
      }
      if (spec.attrs["editable"] === false && field.attrs["editable"] === true) {
        ask("BLOCKING_AUTHORITY", `「${spec.label}」spec 写的是「${String(spec.attrs["edit_note"])}」，原型里是可编辑的输入框。按哪个？`, "按 spec：只读展示，不给输入框", [spec.key, field.key]);
      }
      const specEnum = (spec.attrs["enum"] as readonly string[] | undefined) ?? [];
      const options = (field.attrs["options"] as readonly string[] | undefined) ?? [];
      if (specEnum.length > 0 && options.length > 0 && !sameSet(specEnum, options)) {
        ask("BLOCKING_AUTHORITY", `「${spec.label}」的可选值不一致：spec 是 ${specEnum.join(" / ")}，原型是 ${options.join(" / ")}。按哪个？`, "按 spec 的枚举", [spec.key, field.key]);
      }
    }
  }
  for (const enumFact of specFacts.filter((fact) => fact.kind === "spec_enum")) {
    const values = (enumFact.attrs["values"] as readonly string[] | undefined) ?? [];
    for (const field of (htmlByLabel.get(enumFact.label) ?? []).filter((fact) => fact.kind === "field")) {
      const options = (field.attrs["options"] as readonly string[] | undefined) ?? [];
      if (values.length > 0 && options.length > 0 && !sameSet(values, options)) {
        ask("BLOCKING_AUTHORITY", `「${enumFact.label}」的枚举不一致：spec 是 ${values.join(" / ")}，原型是 ${options.join(" / ")}。按哪个？`, "按 spec 的枚举", [enumFact.key, field.key]);
      }
    }
  }
  if (specFields.length > 0) {
    const specLabels = new Set(specFields.map((fact) => fact.label));
    for (const field of htmlFacts.filter((fact) => fact.kind === "field" && fact.attrs["control"] !== "text" || fact.kind === "field" && fact.context.length > 0)) {
      if (!specLabels.has(field.label) && !/搜索|关键字|查询/.test(field.label)) {
        ask("PREFERENCE", `原型里有字段「${field.label}」（${field.context.join(" / ") || "页面"}），spec 的字段表里没有。保留吗？`, "保留并补进 spec，标为待确认", [field.key]);
      }
    }
  }
  const pageSize = htmlFacts
    .map((fact) => /每页\s*(\d[\d,]*)\s*条/.exec(fact.label)?.[1])
    .find((value): value is string => value !== undefined);
  if (pageSize !== undefined && limits.max_page_size !== undefined && Number(pageSize.replace(/,/g, "")) > limits.max_page_size) {
    ask("BLOCKING_AUTHORITY", `原型每页 ${pageSize} 条，超过规范的上限 ${limits.max_page_size} 条。按哪个？`, `按规范：每页 ${limits.max_page_size} 条，行数多时用虚拟滚动`, []);
  }
  return questions;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a.map(normalizeLabel));
  const right = new Set(b.map(normalizeLabel));
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export interface FactDifference {
  readonly key: string;
  readonly kind: FactKind;
  readonly change: "missing" | "changed" | "added" | "reordered";
  readonly detail_zh: string;
  readonly blocking: boolean;
}

export interface FactDiff {
  readonly ok: boolean;
  readonly compared: number;
  readonly differences: readonly FactDifference[];
}

const COMPARED_ATTRS: Readonly<Partial<Record<FactKind, readonly string[]>>> = {
  field: ["control", "required", "editable", "options", "group"],
  column: ["numeric", "frozen"],
  action: ["intent"],
  tab: ["counted"],
  status: ["tone", "struck"],
  region: ["role"],
};

/** 原型的事实（expected）与重绘后的事实（actual）逐条对账。文案类（copy、nav、page）差异只提示。 */
export function diffFacts(expected: readonly PrototypeFact[], actual: readonly PrototypeFact[]): FactDiff {
  const differences: FactDifference[] = [];
  const actualByKey = new Map(actual.map((fact) => [fact.key, fact]));
  const expectedKeys = new Set(expected.map((fact) => fact.key));
  let compared = 0;
  for (const fact of expected) {
    if (fact.kind.startsWith("spec_")) continue;
    compared += 1;
    const blocking = BLOCKING_FACT_KINDS.has(fact.kind);
    const other = actualByKey.get(fact.key);
    if (other === undefined) {
      differences.push({ key: fact.key, kind: fact.kind, change: "missing", detail_zh: `缺少：${describe(fact)}`, blocking });
      continue;
    }
    for (const attr of COMPARED_ATTRS[fact.kind] ?? []) {
      const want = fact.attrs[attr];
      const got = other.attrs[attr];
      if (attr === "control" && (want === "any" || got === "any")) continue;
      if (attr === "options" && Array.isArray(want) && want.length === 0) continue;
      if (attr === "options" && other.attrs["options_visible"] === false && Array.isArray(got) && got.length === 0) {
        differences.push({ key: fact.key, kind: fact.kind, change: "changed", detail_zh: `${describe(fact)} 的可选值在页面里看不到（下拉收起着），用 --render 渲染后展开核对：应为 ${show(want)}`, blocking: false });
        continue;
      }
      if (!sameValue(want, got)) differences.push({ key: fact.key, kind: fact.kind, change: "changed", detail_zh: `${describe(fact)} 的 ${ATTR_ZH[attr] ?? attr} 变了：${show(want)} → ${show(got)}`, blocking });
    }
  }
  for (const fact of actual) {
    if (expectedKeys.has(fact.key) || fact.kind.startsWith("spec_")) continue;
    differences.push({ key: fact.key, kind: fact.kind, change: "added", detail_zh: `多出：${describe(fact)}`, blocking: BLOCKING_FACT_KINDS.has(fact.kind) && fact.kind !== "region" });
  }
  // 同一区域里字段与列的先后是信息结构
  for (const kind of ["field", "column", "tab"] as const) {
    const groups = new Map<string, string[]>();
    for (const fact of expected.filter((item) => item.kind === kind && actualByKey.has(item.key))) groups.set(fact.context.join("/"), [...(groups.get(fact.context.join("/")) ?? []), fact.key]);
    for (const [context, keys] of groups) {
      const actualOrder = [...keys].sort((a, b) => (actualByKey.get(a)?.order ?? 0) - (actualByKey.get(b)?.order ?? 0));
      if (actualOrder.join("|") !== keys.join("|")) {
        differences.push({ key: `${kind}:${context}`, kind, change: "reordered", detail_zh: `「${context || "页面"}」里${KIND_ZH[kind]}的先后变了：${keys.map(labelOfKey).join("、")} → ${actualOrder.map(labelOfKey).join("、")}`, blocking: true });
      }
    }
  }
  return { ok: differences.every((item) => !item.blocking), compared, differences };
}

const KIND_ZH: Readonly<Record<FactKind, string>> = {
  page: "页面",
  region: "区域",
  field: "字段",
  action: "操作",
  column: "列",
  tab: "标签页",
  notice: "提示",
  status: "状态",
  nav: "导航",
  copy: "文案",
  spec_field: "spec 字段",
  spec_rule: "spec 规则",
  spec_enum: "spec 枚举",
};
const ATTR_ZH: Readonly<Record<string, string>> = { group: "所在分组", control: "控件类别", required: "必填", editable: "可编辑", options: "可选值", numeric: "数值列", frozen: "冻结", intent: "意图", counted: "计数", tone: "语气", struck: "删除线", role: "区域类别", conditional: "条件出现" };

function labelOfKey(key: string): string {
  return key.split("/").at(-1)?.replace(/^[a-z_]+:/, "") ?? key;
}

function describe(fact: PrototypeFact): string {
  return `${KIND_ZH[fact.kind]}「${[...fact.context, fact.label].join(" / ")}」`;
}

function show(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "（无）" : value.join(" / ");
  if (value === null || value === undefined) return "（无）";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const left = Array.isArray(a) ? a.map(String) : [];
    const right = Array.isArray(b) ? b.map(String) : [];
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return (a ?? null) === (b ?? null);
}

// ============================================================
// 大纲的可读形式（人和 agent 都读这个）
// ============================================================

const ROLE_ZH: Readonly<Record<RegionRole, string>> = { page: "页面", nav: "导航", header: "页头", main: "主内容", aside: "侧栏", footer: "页脚", section: "区块", dialog: "弹窗", form: "表单", card: "卡片" };
const CONTROL_ZH: Readonly<Record<FieldControl, string>> = { custom: "自定义控件", text: "文本", number: "数字", date: "日期", time: "时间", select: "单选下拉", multiselect: "多选", textarea: "多行文本", checkbox: "勾选", radio: "单选", switch: "开关", file: "文件", password: "密码", email: "邮箱", tel: "电话", url: "网址", search: "搜索" };

export function outlineMarkdown(outline: PrototypeOutline): string {
  const lines: string[] = [`# 原型大纲：${outline.title ?? "（无标题）"}`, ""];
  const walk = (nodes: readonly OutlineNode[], depth: number) => {
    const pad = "  ".repeat(depth);
    for (const node of nodes) {
      switch (node.kind) {
        case "region":
          lines.push(`${pad}- ${ROLE_ZH[node.role]}${node.title === null ? "" : `「${node.title}」`}${node.hidden ? "（条件出现）" : ""}`);
          walk(node.children, depth + 1);
          break;
        case "heading":
          lines.push(`${pad}- 标题 h${node.level}：${node.text}`);
          break;
        case "field":
          lines.push(`${pad}- 字段：${node.label}${node.required ? " *必填" : ""}（${CONTROL_ZH[node.control]}${node.options.length > 0 ? `：${node.options.join(" / ")}` : ""}${node.readonly || node.disabled ? "，只读" : ""}${node.conditional ? "，条件出现" : ""}）${node.hint === null ? "" : ` —— 说明：${node.hint}`}`);
          break;
        case "action":
          lines.push(`${pad}- 操作：${node.label}${node.disabled ? "（初始禁用，有启用条件）" : ""}`);
          break;
        case "table":
          lines.push(`${pad}- 表格${node.title === null ? "" : `「${node.title}」`}${node.selectable ? "（可勾选）" : ""}：${node.columns.map((column) => `${column.label}${column.numeric ? "#" : ""}${column.frozen === null ? "" : `[冻结${column.frozen === "left" ? "左" : "右"}]`}`).join(" | ")}`);
          break;
        case "tabs":
          lines.push(`${pad}- 标签页：${node.items.map((item) => `${item.label}${item.count === null ? "" : "（带计数）"}${item.selected ? "·默认" : ""}`).join(" | ")}`);
          break;
        case "notice":
          lines.push(`${pad}- 提示${node.tone === null ? "" : `（${node.tone}）`}：${node.text}`);
          break;
        case "status":
          lines.push(`${pad}- 状态：${node.text}${node.tone === null ? "" : `（${node.tone}）`}${node.struck ? "（删除线）" : ""}`);
          break;
        case "nav":
          lines.push(`${pad}- 导航：${node.items.join(" / ")}`);
          break;
        case "list":
          lines.push(`${pad}- 列表：${node.items.slice(0, 6).join(" / ")}${node.items.length > 6 ? " …" : ""}`);
          break;
        case "copy":
          lines.push(`${pad}- 文字：${node.text}`);
          break;
      }
    }
  };
  walk(outline.root.children, 0);
  const dropped = outline.dropped;
  lines.push(
    "",
    "## 丢掉的表现",
    "",
    `- class ${dropped.classes} 处、内联样式 ${dropped.inline_styles} 处、样式块 ${dropped.style_blocks} 个、脚本 ${dropped.scripts} 个、纯布局包裹层 ${dropped.layout_wrappers} 个`,
    `- 字体：${dropped.fonts.join("、") || "（无）"}`,
    `- 颜色：${dropped.colors.slice(0, 12).join("、") || "（无）"}${dropped.colors.length > 12 ? ` 等 ${dropped.colors.length} 个` : ""}`,
    `- 样式框架与样式表：${dropped.stylesheets.join("、") || "（无）"}`,
  );
  return `${lines.join("\n")}\n`;
}

/** 一步到位：HTML 文本 → 大纲 + 事实。 */
export function extractPrototype(html: string, source: string): { readonly outline: PrototypeOutline; readonly facts: PrototypeFact[] } {
  const outline = outlineOf(parseHtml(html));
  return { outline, facts: factsOf(outline, source) };
}
