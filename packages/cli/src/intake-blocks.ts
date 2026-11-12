/**
 * intake-blocks.ts —— 结构无关的切块与确定性判读（code-spec：requirement-intake §3.2/§3.3）。
 *
 * 不赌格式：Markdown 按标题树、表格、列表、代码块、场景、复选框、引用、段落切块；块的角色由最近的标题
 * （同义词表）加内容特征判定。认得出的块直接落成需求条目；认不出的块标 pending，交给 agent 判读——
 * 每块都有去向，读取器漏读的段落不会无声消失。
 */

import { anchorText, normalizeText, NORMATIVE, sha256Hex, slugKey, stripDownloadSuffix } from "./intake-text.js";

export type BlockKind = "heading" | "label" | "paragraph" | "list_item" | "checkbox" | "table" | "code" | "scenario" | "quote";

export interface MarkdownBlock {
  readonly kind: BlockKind;
  readonly heading_path: readonly string[];
  readonly text: string;
  readonly lines: readonly [number, number];
  readonly level?: number;
  readonly header?: readonly string[];
  readonly rows?: readonly (readonly string[])[];
  readonly checked?: boolean;
  readonly steps?: readonly string[];
  /** 只对 scenario：场景名。 */
  readonly name?: string;
}

export type BlockRole =
  | "purpose"
  | "data_source"
  | "fields"
  | "layout"
  | "rules"
  | "operations"
  | "open_questions"
  | "scenarios"
  | "non_goals"
  | "tech"
  | "roles"
  | "none";

export const MARKDOWN_ITEM_KINDS = [
  "module",
  "field",
  "rule",
  "scenario",
  "enum",
  "operation",
  "dependency",
  "description",
  "open_question",
  "non_goal",
  "tech_hint",
  "role",
  "seed_data",
  "change_proposal",
  "gap",
] as const;
export type MarkdownItemKind = (typeof MARKDOWN_ITEM_KINDS)[number];

/** 读取器产出的候选条目（还没有编号；编号由 intake-identity 对齐后分配）。 */
export interface CandidateItem {
  readonly kind: string;
  readonly module: string;
  readonly label: string;
  readonly text: string;
  readonly attrs: Readonly<Record<string, unknown>>;
  /** 对齐锚：材料自带标识或归一正文。 */
  readonly anchor: string;
  readonly origin: { readonly file: string; readonly block: string | null; readonly locator: string };
  readonly basis: "extracted" | "resolved";
  /** 来源键：同一份材料跨版的身份（需求文档 = doc:<模块键>，页面 = page:<页面键>……），不依赖路径。 */
  readonly source: string;
}

export type BlockDestination =
  | { readonly type: "items"; readonly items: readonly number[] }
  | { readonly type: "structure" | "presentation" | "lineage" | "proposal" | "design" }
  | { readonly type: "skip"; readonly reason: string }
  | { readonly type: "pending" };

export interface JudgedBlock {
  readonly id: string;
  readonly file: string;
  readonly module: string;
  readonly kind: BlockKind;
  readonly role: BlockRole;
  readonly heading_path: readonly string[];
  readonly excerpt: string;
  readonly lines: readonly [number, number];
  /** items 里的序号指向本文件产出的 candidates 数组。 */
  readonly destination: BlockDestination;
}

const ROLE_PATTERNS: ReadonlyArray<readonly [BlockRole, RegExp]> = [
  ["non_goals", /(非目标|不做|范围外|不在范围|out of scope|non-?goals?)/i],
  ["open_questions", /(待确认|待定|待澄清|开放问题|疑问|open questions?|todo)/i],
  ["scenarios", /^(scenario|场景|用例|验收场景|acceptance)/i],
  ["fields", /(字段|数据字典|数据项|属性列表|fields?\b|schema)/i],
  ["data_source", /(数据来源|上游|下游|依赖|数据流|联动|data sources?|dependenc)/i],
  ["layout", /(页面布局|布局|界面结构|页面结构|线框|layout|wireframe)/i],
  ["rules", /(业务规则|规则|校验|约束|rules?\b|validation|constraints?)/i],
  ["operations", /(操作说明|操作|交互|按钮|operations?|actions?|interactions?)/i],
  ["tech", /(技术栈|技术选型|tech ?stack|stack|运行环境)/i],
  ["roles", /(角色|职责分离|权限矩阵|roles?\b|permissions?)/i],
  ["purpose", /(功能说明|功能描述|概述|简介|目的|目标|背景|purpose|overview|summary|why|说明)/i],
];

/** 标题去编号（「#### 5.1 新增/编辑规则」→「新增/编辑规则」）。 */
function bareHeading(text: string): string {
  return normalizeText(text).replace(/^(第[一二三四五六七八九十\d]+[章节部分]\s*)|^[\d.]+\s*[、.)）]?\s*/, "").trim();
}

/** 章节编号的惯例（同一批文档里「5.」多半是业务规则）：文档省了章标题时按编号补判角色。 */
export type ChapterRoles = ReadonlyMap<string, BlockRole>;

function topNumber(text: string): string | null {
  return /^(\d+)(?:\.\d+)*(?:[.、)）]|\s)/.exec(normalizeText(text))?.[1] ?? null;
}

export function roleOf(headingPath: readonly string[], chapters: ChapterRoles = new Map()): BlockRole {
  const direct = directRole(headingPath);
  if (direct !== "none") return direct;
  for (const heading of headingPath) {
    const number = topNumber(heading);
    const learned = number === null ? undefined : chapters.get(number);
    if (learned !== undefined) return learned;
  }
  return "none";
}

/** 从一批文档的「N. 章名」标题里学章节编号 → 角色：至少 3 份文档、七成一致才采信。 */
export function learnChapterRoles(markdowns: readonly string[]): Map<string, BlockRole> {
  const votes = new Map<string, Map<BlockRole, number>>();
  for (const markdown of markdowns) {
    const seen = new Set<string>();
    for (const line of markdown.split(/\r?\n/)) {
      const heading = /^#{1,6}\s+(.*)$/.exec(line)?.[1];
      if (heading === undefined) continue;
      const match = /^(\d+)[.、)）]?\s+\S/.exec(normalizeText(heading));
      if (match === null || /^\d+\.\d/.test(normalizeText(heading))) continue;
      const number = match[1] ?? "";
      const role = directRole([heading]);
      if (role === "none" || seen.has(number)) continue;
      seen.add(number);
      const tally = votes.get(number) ?? new Map<BlockRole, number>();
      tally.set(role, (tally.get(role) ?? 0) + 1);
      votes.set(number, tally);
    }
  }
  const learned = new Map<string, BlockRole>();
  for (const [number, tally] of votes) {
    const total = [...tally.values()].reduce((sum, count) => sum + count, 0);
    const [role, count] = [...tally.entries()].sort((left, right) => right[1] - left[1])[0] ?? ["none", 0];
    if (total >= 3 && count / total >= 0.7) learned.set(number, role);
  }
  return learned;
}

function directRole(headingPath: readonly string[]): BlockRole {
  for (let index = headingPath.length - 1; index >= 0; index -= 1) {
    const heading = bareHeading(headingPath[index] ?? "");
    // 「Requirement: X」正下方的引言是模块描述；更深的段落继续往外找
    if (/^requirement[:：]/i.test(heading)) {
      if (index === headingPath.length - 1) return "purpose";
      continue;
    }
    for (const [role, pattern] of ROLE_PATTERNS) if (pattern.test(heading)) return role;
  }
  return "none";
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => normalizeText(cell));
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
/** 「交互规则：」这类以冒号结尾的短段落是小标题：后面的列表、表格归它管。 */
const LABEL_PARAGRAPH = /^[^。.!?！？；;]{1,30}[:：]$/;
const CHECKBOX = /^\[([ xX])\]\s*(.*)$/;
const SCENARIO_HEADING = /^(scenario|场景|用例)\s*[:：]?\s*/i;

/** Markdown → 块。行号只作定位，不进身份。 */
export function segmentMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  // 编号小节常和父节写成同级标题（#### 6. 操作说明 / #### 6.1 新增车型）：按编号补回父节，角色才判得对
  const numbered = new Map<string, string>();
  const numberOf = (text: string) => /^(\d+(?:\.\d+)*)(?:[.、)）]|\s)/.exec(normalizeText(text))?.[1] ?? null;
  const expand = (headings: readonly string[]): string[] => {
    const out: string[] = [];
    for (const heading of headings) {
      const number = numberOf(heading);
      if (number !== null) {
        const parts = number.split(".");
        for (let depth = 1; depth < parts.length; depth += 1) {
          const parent = numbered.get(parts.slice(0, depth).join("."));
          if (parent !== undefined && !out.includes(parent) && !headings.includes(parent)) out.push(parent);
        }
      }
      out.push(heading);
    }
    return out;
  };
  const blocks: MarkdownBlock[] = [];
  const path: string[] = [];
  let lead: string | null = null;
  let scenario: { name: string; level: number; start: number; steps: string[]; path: string[] } | null = null;
  const flushScenario = (end: number) => {
    if (scenario === null) return;
    blocks.push({ kind: "scenario", heading_path: scenario.path, text: normalizeText(`${scenario.name} ${scenario.steps.join(" ")}`), lines: [scenario.start, end], steps: scenario.steps, level: scenario.level, name: scenario.name });
    scenario = null;
  };
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const lineNo = index + 1;
    if (line.trim() === "" || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? "#").length;
      const text = normalizeText(heading[2] ?? "");
      if (scenario !== null && level <= scenario.level) flushScenario(lineNo - 1);
      lead = null;
      if (level <= 2 || /^requirement[:：]/i.test(text)) numbered.clear();
      const number = numberOf(text);
      if (number !== null) numbered.set(number, text);
      path.length = level - 1;
      path[level - 1] = text;
      const headingPath = expand(path.filter((part) => part !== undefined && part !== ""));
      if (SCENARIO_HEADING.test(bareHeading(text))) {
        flushScenario(lineNo - 1);
        scenario = { name: bareHeading(text).replace(SCENARIO_HEADING, ""), level, start: lineNo, steps: [], path: headingPath.slice(0, -1) };
      } else {
        blocks.push({ kind: "heading", heading_path: headingPath.slice(0, -1), text, lines: [lineNo, lineNo], level });
      }
      index += 1;
      continue;
    }
    const basePath = expand(path.filter((part) => part !== undefined && part !== ""));
    const currentPath = lead === null ? basePath : [...basePath, lead];
    if (scenario !== null) {
      const item = LIST_ITEM.exec(line);
      scenario.steps.push(normalizeText(item?.[3] ?? line));
      index += 1;
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      const fence = /^\s*(```|~~~)/.exec(line)?.[1] ?? "```";
      const start = lineNo;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith(fence)) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ kind: "code", heading_path: currentPath, text: body.join("\n"), lines: [start, Math.min(index + 1, lines.length)] });
      index += 1;
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1] ?? "")) {
      const start = lineNo;
      const header = splitRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        rows.push(splitRow(lines[index] ?? ""));
        index += 1;
      }
      blocks.push({ kind: "table", heading_path: currentPath, text: [header.join(" | "), ...rows.map((row) => row.join(" | "))].join("\n"), lines: [start, index], header, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const start = lineNo;
      const body: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index] ?? "")) {
        body.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", heading_path: currentPath, text: normalizeText(body.join(" ")), lines: [start, index] });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item !== null) {
      const start = lineNo;
      const indent = (item[1] ?? "").length;
      const parts = [item[3] ?? ""];
      index += 1;
      while (index < lines.length) {
        const next = lines[index] ?? "";
        if (next.trim() === "" || LIST_ITEM.test(next) || /^#{1,6}\s/.test(next) || next.trim().startsWith("|") || /^\s*(```|~~~)/.test(next)) break;
        if ((/^(\s*)/.exec(next)?.[1] ?? "").length <= indent) break;
        parts.push(next.trim());
        index += 1;
      }
      const body = normalizeText(parts.join(" "));
      const box = CHECKBOX.exec(body);
      if (box !== null) blocks.push({ kind: "checkbox", heading_path: currentPath, text: normalizeText(box[2] ?? ""), lines: [start, index], checked: (box[1] ?? " ").toLowerCase() === "x" });
      else blocks.push({ kind: "list_item", heading_path: currentPath, text: body, lines: [start, index] });
      continue;
    }
    const start = lineNo;
    const body: string[] = [];
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (next.trim() === "" || /^#{1,6}\s/.test(next) || LIST_ITEM.test(next) || next.trim().startsWith("|") || /^\s*(```|~~~|>)/.test(next)) break;
      body.push(next.trim());
      index += 1;
    }
    const paragraph = normalizeText(body.join(" "));
    if (LABEL_PARAGRAPH.test(paragraph) && !NORMATIVE.test(paragraph)) {
      blocks.push({ kind: "label", heading_path: basePath, text: paragraph, lines: [start, index] });
      lead = paragraph.replace(/[:：]$/, "").replace(/\*\*/g, "").trim();
    } else {
      blocks.push({ kind: "paragraph", heading_path: basePath, text: paragraph, lines: [start, index] });
      lead = null;
    }
  }
  flushScenario(lines.length);
  return blocks;
}

export function blockId(module: string, block: MarkdownBlock): string {
  return `B-${sha256Hex(`${module}\u0000${block.kind}\u0000${block.heading_path.map(anchorText).join("/")}\u0000${anchorText(block.text)}`).slice(0, 12)}`;
}

const GENERIC_DOC_NAMES = /^(spec|specs|readme|index|prd|requirements?|需求|需求说明)$/i;

/** 模块键：通用文件名（spec.md）取所在目录名；否则取一级标题；再否则取文件名。 */
export function moduleKeyOf(rel: string, markdown: string): { key: string; title: string } {
  const parts = rel.split("/");
  const file = stripDownloadSuffix(parts.at(-1) ?? rel).replace(/\.[^.]+$/, "");
  const h1 = /^#\s+(.+)$/m.exec(markdown)?.[1];
  const title = h1 === undefined ? file : normalizeText(h1).replace(/\s+(specification|spec|规格说明?|需求说明)$/i, "");
  if (GENERIC_DOC_NAMES.test(file) && parts.length >= 2) {
    const folder = stripDownloadSuffix(parts.at(-2) ?? file);
    return { key: slugKey(folder), title };
  }
  if (h1 !== undefined && slugKey(title) !== "") return { key: slugKey(title), title };
  return { key: slugKey(file), title };
}

const FIELD_NAME_HEADERS = /^(中文字段名|字段名|字段|中文名|名称|列名|列|字段名称|属性名|参数|field|name|column)$/i;
/** 表头第一格就说明了这张表是什么（按钮表、角色表、规则表……），比所在标题更可靠。 */
const TABLE_HEADER_KIND: ReadonlyArray<readonly [RegExp, MarkdownItemKind]> = [
  [/^(按钮|操作|动作|action|button)/i, "operation"],
  [/^(角色|role|用户类型|用户角色)/i, "role"],
  [/^(规则|校验|约束|rule|校验项)/i, "rule"],
  [/^(能力|职责|功能|capability|capabilities)/i, "description"],
  [/^(上游|下游|来源|依赖|数据源|source)/i, "dependency"],
  [/^(场景|scenario)/i, "scenario"],
  [/^(问题|疑问|question)/i, "open_question"],
];
const TECH_KEY = /^(前端|后端|数据库|db|数据层|测试|接口|api|部署|构建|语言|框架|frontend|backend|database|orm|缓存|消息|ui ?库|组件库|表格|状态管理|路由|包管理)/i;
const PLACEHOLDER = /^(tbd\b|todo\b|待补充|待完善|占位|placeholder)/i;
const BOX_DRAWING = /[┌┐└┘├┤┬┴┼─│═║╔╗╚╝╠╣╦╩╬]/;
const ENUM_LINE = /\*\*([^*]+)\*\*\s*[：:][^。\n]*?(?:枚举值?|可选值|取值)[：:]\s*([^。\n]+)/;

function enumValues(text: string): string[] {
  return text
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .split(/[、,，/|；;]/)
    .map((value) => normalizeText(value))
    .filter((value) => value !== "" && value.length <= 20);
}

function cellLabel(text: string): string {
  return normalizeText(text).replace(/[*＊]/g, "").replace(/[:：]\s*$/, "").trim();
}

export interface DocReading {
  readonly module: { readonly key: string; readonly title: string };
  readonly blocks: readonly JudgedBlock[];
  readonly items: readonly CandidateItem[];
}

/** 需求文档 / 项目文档：逐块判读。认不出的块 pending。 */
export function readMarkdownDoc(rel: string, markdown: string, options: { readonly module?: string; readonly source?: string; readonly chapters?: ChapterRoles } = {}): DocReading {
  const module = options.module === undefined ? moduleKeyOf(rel, markdown) : { key: options.module, title: options.module };
  const source = options.source ?? `doc:${module.key}`;
  const blocks = segmentMarkdown(markdown);
  const items: CandidateItem[] = [];
  const judged: JudgedBlock[] = [];
  const add = (kind: MarkdownItemKind, label: string, text: string, attrs: Record<string, unknown>, block: MarkdownBlock, id: string, anchor?: string): number => {
    items.push({
      kind,
      module: module.key,
      label: normalizeText(label),
      text: normalizeText(text),
      attrs,
      anchor: anchor ?? anchorText(kind === "field" || kind === "tech_hint" || kind === "operation" || kind === "enum" || kind === "scenario" ? label : text),
      origin: { file: rel, block: id, locator: `${block.heading_path.join(" > ") || "（文首）"} · L${block.lines[0]}` },
      basis: "extracted",
      source,
    });
    return items.length - 1;
  };
  for (const block of blocks) {
    const id = blockId(module.key, block);
    const role = block.kind === "scenario" ? "scenarios" : roleOf(block.heading_path, options.chapters);
    const nearest = bareHeading(block.heading_path.at(-1) ?? "");
    const judge = (destination: BlockDestination) =>
      judged.push({ id, file: rel, module: module.key, kind: block.kind, role, heading_path: block.heading_path, excerpt: block.text.slice(0, 200), lines: block.lines, destination });
    if (block.kind === "heading" || block.kind === "label") {
      judge({ type: "structure" });
      continue;
    }
    if (PLACEHOLDER.test(block.text)) {
      judge({ type: "skip", reason: "占位文字" });
      continue;
    }
    if (block.kind === "scenario") {
      const label = normalizeText(block.name ?? "") || block.text.slice(0, 40);
      judge({ type: "items", items: [add("scenario", label, block.text, { steps: block.steps ?? [] }, block, id, anchorText(label))] });
      continue;
    }
    // 「示例」只是举例说明；「初始数据 / 预设」是系统要带的参考数据
    if (/(初始数据|预设|种子数据|默认数据|内置数据)/.test(nearest) && block.kind === "table" && (block.rows ?? []).length > 0) {
      judge({ type: "items", items: (block.rows ?? []).map((row) => add("seed_data", cellLabel(row[0] ?? ""), row.join(" | "), { cells: Object.fromEntries((block.header ?? []).map((cell, at) => [cell || `col${at}`, row[at] ?? ""])) }, block, id, anchorText(row.join(" | ")))) });
      continue;
    }
    if (/(示例|样例|举例|example)/i.test(nearest) && (block.kind === "table" || block.kind === "code")) {
      judge({ type: "presentation" });
      continue;
    }
    if (block.kind === "code") {
      if (BOX_DRAWING.test(block.text) || role === "layout") judge({ type: "presentation" });
      else if ((role === "rules" || role === "data_source" || role === "operations" || role === "fields") && /→|->|=|⇒/.test(block.text)) judge({ type: "items", items: [add("rule", block.text.split("\n")[0] ?? "", block.text, { form: "code" }, block, id)] });
      else judge({ type: "pending" });
      continue;
    }
    if (block.kind === "table") {
      const header = block.header ?? [];
      const rows = block.rows ?? [];
      const nameAt = header.findIndex((cell) => FIELD_NAME_HEADERS.test(cell));
      const headerKind = TABLE_HEADER_KIND.find(([pattern]) => pattern.test(cellLabel(header[0] ?? "")))?.[1];
      if (headerKind !== undefined && nameAt !== 0 && rows.length > 0) {
        judge({ type: "items", items: rows.map((row) => add(headerKind, cellLabel(row[0] ?? ""), row.join(" | "), { cells: Object.fromEntries(header.map((cell, at) => [cell || `col${at}`, row[at] ?? ""])) }, block, id, headerKind === "description" || headerKind === "rule" ? anchorText(row.join(" | ")) : undefined)) });
        continue;
      }
      const techRows = rows.filter((row) => TECH_KEY.test(cellLabel(row[0] ?? "")));
      if (nameAt >= 0 && role !== "tech") {
        const made = rows
          .map((row) => ({ row, label: cellLabel(row[nameAt] ?? "") }))
          .filter(({ label }) => label !== "" && !/^[—\-#\d]+$/.test(label))
          .map(({ row, label }) => add("field", label, row.join(" | "), { cells: Object.fromEntries(header.map((cell, at) => [cell || `col${at}`, row[at] ?? ""])) }, block, id));
        judge(made.length > 0 ? { type: "items", items: made } : { type: "pending" });
        continue;
      }
      if (techRows.length >= 1 && (role === "tech" || techRows.length >= Math.max(2, rows.length / 2))) {
        judge({ type: "items", items: techRows.map((row) => add("tech_hint", cellLabel(row[0] ?? ""), row.slice(1).join(" | "), { value: row.slice(1).join(" | ") }, block, id)) });
        continue;
      }
      const perRow: Partial<Record<BlockRole, MarkdownItemKind>> = { operations: "operation", rules: "rule", data_source: "dependency", open_questions: "open_question", non_goals: "non_goal", roles: "role", purpose: "description" };
      const kind = perRow[role];
      if (kind !== undefined && rows.length > 0) {
        judge({ type: "items", items: rows.map((row) => add(kind, cellLabel(row[0] ?? ""), row.join(" | "), { cells: Object.fromEntries(header.map((cell, at) => [cell || `col${at}`, row[at] ?? ""])) }, block, id)) });
        continue;
      }
      if (role === "fields" && rows.length > 0) {
        const labelAt = header.findIndex((cell) => !/^(#|序号|no\.?|编号)$/i.test(cell));
        if (labelAt >= 0) {
          judge({ type: "items", items: rows.filter((row) => cellLabel(row[labelAt] ?? "") !== "").map((row) => add("field", cellLabel(row[labelAt] ?? ""), row.join(" | "), { cells: Object.fromEntries(header.map((cell, at) => [cell || `col${at}`, row[at] ?? ""])) }, block, id)) });
          continue;
        }
      }
      judge(role === "layout" ? { type: "presentation" } : { type: "pending" });
      continue;
    }
    if (block.kind === "checkbox") {
      judge({ type: "items", items: [add("open_question", block.text, block.text, { resolved: block.checked === true }, block, id)] });
      continue;
    }
    const enumMatch = ENUM_LINE.exec(block.text);
    if (enumMatch !== null) {
      judge({ type: "items", items: [add("enum", cellLabel(enumMatch[1] ?? ""), block.text, { values: enumValues(enumMatch[2] ?? "") }, block, id)] });
      continue;
    }
    const byRole: Partial<Record<BlockRole, MarkdownItemKind>> = {
      rules: "rule",
      non_goals: "non_goal",
      data_source: "dependency",
      operations: "operation",
      purpose: "description",
      open_questions: "open_question",
      tech: "tech_hint",
      roles: "role",
      fields: "rule",
      scenarios: "scenario",
    };
    if (role === "layout") {
      judge({ type: "presentation" });
      continue;
    }
    const techLine = /^\*{0,2}([^:：*]{1,20})\*{0,2}\s*[:：]\s*(.+)$/.exec(block.text);
    if (techLine !== null && TECH_KEY.test(cellLabel(techLine[1] ?? ""))) {
      judge({ type: "items", items: [add("tech_hint", cellLabel(techLine[1] ?? ""), techLine[2] ?? "", { value: normalizeText(techLine[2] ?? "") }, block, id)] });
      continue;
    }
    const kind = byRole[role];
    if (kind !== undefined) {
      const label = kind === "operation" || kind === "dependency" ? (/^\*{0,2}([^:：*]{1,30})\*{0,2}\s*[:：]/.exec(block.text)?.[1] ?? block.text.slice(0, 30)) : block.text.slice(0, 60);
      judge({ type: "items", items: [add(kind, label, block.text, kind === "open_question" ? { resolved: false } : role === "fields" ? { scope: "field" } : {}, block, id, kind === "operation" || kind === "dependency" || kind === "role" || kind === "scenario" ? anchorText(block.text) : undefined)] });
      continue;
    }
    if (NORMATIVE.test(block.text) && block.text.length >= 6) {
      judge({ type: "items", items: [add("rule", block.text.slice(0, 60), block.text, {}, block, id)] });
      continue;
    }
    judge({ type: "pending" });
  }
  return { module, blocks: judged, items };
}

/** YAML 项目约定：逐行读出技术线索与规则句；其余行 pending。 */
export function readYamlProjectDoc(rel: string, text: string): DocReading {
  const markdown = text
    .split(/\r?\n/)
    .map((line) => {
      const key = /^(\s*)([^\s:#-][^:#]*?)\s*:\s*[|>]?\s*$/.exec(line);
      if (key !== null) return `${"#".repeat(Math.min(6, 2 + Math.floor((key[1] ?? "").length / 2)))} ${key[2] ?? ""}`;
      const pair = /^\s*-?\s*([^:：#]{1,20})\s*[:：]\s*(.+)$/.exec(line);
      if (pair !== null && TECH_KEY.test(pair[1]?.trim() ?? "")) return `- ${pair[1]?.trim() ?? ""}: ${pair[2] ?? ""}`;
      const item = /^\s*-\s+(.*)$/.exec(line);
      if (item !== null) return `- ${item[1] ?? ""}`;
      return line.trim() === "" || line.trim().startsWith("#") ? "" : line.trim();
    })
    .join("\n\n");
  return readMarkdownDoc(rel, `# project\n${markdown}`, { module: "project", source: `project:${slugKey((rel.split("/").at(-1) ?? rel).replace(/\.[^.]+$/, ""))}` });
}

export interface ChangeEvidence {
  readonly type: "rename" | "removal";
  /** 句中出现的模块键候选（含路径段里的键）。 */
  readonly keys: readonly string[];
  readonly file: string;
  readonly line: number;
  readonly excerpt: string;
  readonly change_id: string;
}

const RENAME_WORDS = /(重命名|改名|更名|改为.*文件夹|renam(e|ed|ing))/i;
const REMOVAL_WORDS = /(删除|移除|下线|废弃|彻底删除|remov(e|ed|al)|delet(e|ed))/i;
const KEY_TOKEN = /`([^`]+)`|\b(\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*)\b/gi;

function keysIn(line: string): string[] {
  const keys = new Set<string>();
  for (const match of line.matchAll(KEY_TOKEN)) {
    const raw = match[1] ?? match[2] ?? "";
    for (const segment of raw.split("/")) {
      const key = slugKey(segment.replace(/\.(md|html?)$/i, ""));
      if (key !== "" && key.length <= 60 && !/^(spec|specs|openspec|changes|archive|design-system|master|mockups|html|pages|docs)$/.test(key)) keys.add(key);
    }
  }
  return [...keys];
}

/** 变更文档：抽出改名与删除的旁证（只在模块消失时被采信）。 */
export function changeEvidenceOf(rel: string, markdown: string, changeId: string): ChangeEvidence[] {
  const evidence: ChangeEvidence[] = [];
  const lines = markdown.split(/\r?\n/);
  let removedSection = false;
  lines.forEach((line, index) => {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading !== null) {
      removedSection = /(removed|删除|移除)/i.test(heading[1] ?? "");
      return;
    }
    const keys = keysIn(line);
    if (keys.length === 0) return;
    const excerpt = normalizeText(line).slice(0, 200);
    if (RENAME_WORDS.test(line)) evidence.push({ type: "rename", keys, file: rel, line: index + 1, excerpt, change_id: changeId });
    else if (REMOVAL_WORDS.test(line) || (removedSection && /^\s*[-*]\s+`/.test(line))) evidence.push({ type: "removal", keys, file: rel, line: index + 1, excerpt, change_id: changeId });
  });
  return evidence;
}

/** 变更文档的编号：所在目录名（proposal.md / design.md / tasks.md 一类通用名时），否则文件名。 */
export function changeIdOf(rel: string): string {
  const parts = rel.split("/");
  const file = (parts.at(-1) ?? rel).replace(/\.[^.]+$/, "");
  if (/^(proposal|design|tasks|spec|readme|\.?openspec)$/i.test(file) && parts.length >= 2) {
    const specsAt = parts.lastIndexOf("specs");
    const folder = specsAt > 0 ? parts[specsAt - 1] : parts.at(-2);
    return slugKey(folder ?? file);
  }
  return slugKey(file);
}

/** 变更文档的一句话摘要：Why / 背景 段的第一段。 */
export function changeSummaryOf(markdown: string): string {
  const blocks = segmentMarkdown(markdown);
  const first = blocks.find((block) => block.kind === "paragraph" && /^(why|背景|变更说明|context)/i.test(bareHeading(block.heading_path.at(-1) ?? ""))) ?? blocks.find((block) => block.kind === "paragraph");
  return (first?.text ?? "").slice(0, 240);
}
