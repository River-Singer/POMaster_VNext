/**
 * spec-writing.ts —— 规范写入契约：一条规范写进项目之前必须满足的形态。
 *
 * 一条规则必含七个字段：规则、级别、适用范围、理由、检查方式、正例、反例。
 * 条文必须自足、不随时间与版本变：
 * - 不带引用：链接、「参见 / 详见 / 出处」类措辞、文档路径、PR / issue / 任务编号——要点直接写进规则本身；
 * - 不带版本号：v1.2、0.12.0、react@19、3.x——版本只记在项目技术基线里，条文写成不随版本变的规则；
 * - 不带时间戳：日期、时刻、「本轮 / 截至目前」类一次性措辞——什么时候写的由版本库记录；
 * - 不带记录人与会话标记：human:<名字>、agent:<名字>、提交哈希——谁写的同样由版本库记录。
 *
 * 写入口 `pomaster update spec` 写前按此校验，不合规拒绝并逐条指出；`pomaster spec-lint` 复核已有规范。
 * 结构化的溯源元数据（设计规范的 sources 出处表与参数的 source 编号、硬规范文档 frontmatter 的调研锚）
 * 不是条文，不在检查范围内；它们也不得渗进条文正文。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";
import type { CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

export const SPEC_ENTRY_FIELD_KEYS = ["statement", "level", "scope", "rationale", "check", "do", "dont"] as const;
export type SpecEntryFieldKey = (typeof SPEC_ENTRY_FIELD_KEYS)[number];

export interface SpecEntryField {
  readonly key: SpecEntryFieldKey;
  readonly label_zh: string;
  /** `pomaster update spec` 上对应的参数。 */
  readonly flag: string;
  readonly description_zh: string;
}

export const SPEC_ENTRY_FIELDS: readonly SpecEntryField[] = [
  { key: "statement", label_zh: "规则", flag: "<text>", description_zh: "一句话写清做什么或不做什么，读完就能判断一段代码或一个界面是否合规" },
  { key: "level", label_zh: "级别", flag: "--level", description_zh: "MUST / MUST NOT / SHOULD；不写时按措辞判（禁止 / 不得 → MUST NOT，建议 / 尽量 → SHOULD，其余 MUST）" },
  { key: "scope", label_zh: "适用范围", flag: "--scope", description_zh: "规则管到哪里：哪个空间（前端、前端服务器、后端、数据库、缓存……）、哪类对象或哪些路径" },
  { key: "rationale", label_zh: "理由", flag: "--why", description_zh: "为什么要这样，一句话说清违反的后果" },
  { key: "check", label_zh: "检查方式", flag: "--check-by", description_zh: "怎么判定合规：门禁检查编号，或评审时具体看什么" },
  { key: "do", label_zh: "正例", flag: "--do", description_zh: "一个合规的具体写法" },
  { key: "dont", label_zh: "反例", flag: "--dont", description_zh: "一个违规的具体写法" },
];

export type SpecLevel = "MUST" | "MUST NOT" | "SHOULD";
export const SPEC_LEVELS: readonly SpecLevel[] = ["MUST", "MUST NOT", "SHOULD"];

export interface SpecContentRule {
  readonly code: string;
  readonly label_zh: string;
  readonly pattern: RegExp;
  readonly hint_zh: string;
}

/** 条文禁止出现的内容。每条都是全局正则，命中即报。 */
export const SPEC_FORBIDDEN_CONTENT: readonly SpecContentRule[] = [
  {
    code: "SPEC_REFERENCE",
    label_zh: "引用（链接）",
    pattern: /https?:\/\/[^\s）)」"'`]+|\[[^\]\n]+\]\([^)\n]+\)/g,
    hint_zh: "条文要自足：把链接指向的要点直接写进规则，删掉链接",
  },
  {
    code: "SPEC_REFERENCE",
    label_zh: "引用（措辞）",
    pattern: /参见|详见|参考(?:文档|资料|链接|材料)|见(?:上文|下文|附录|原文)|引自|引用自|出处[:：]|来源[:：]|(?<!执行)锚[:：]|\bsee also\b|\bcf\./gi,
    hint_zh: "条文要自足：不要把读者引到别处，把要求本身写出来",
  },
  {
    code: "SPEC_REFERENCE",
    label_zh: "引用（文档路径）",
    pattern: /[\w./-]*\.(?:md|mdx|pdf|docx?)(?![\w/])|\.trellis\/[\w./-]*|corpus\/[\w./-]*/gi,
    hint_zh: "条文要自足：不指向文档文件，把文档里的要求写成这条规则",
  },
  {
    code: "SPEC_REFERENCE",
    label_zh: "引用（章节编号）",
    pattern: /\bPRD\s*§\s*[\d.]*|§\s*\d+(?:\.\d+)*/g,
    hint_zh: "条文要自足：不指向某份文档的某一节，把那一节的要求写成这条规则",
  },
  {
    code: "SPEC_REFERENCE",
    label_zh: "引用（PR / issue / 任务编号）",
    pattern: /\b(?:PR|MR|issue)\s*#?\d+|\bAGX-\d+\b|\b(?:TASK|CHANGE)[-.][A-Z0-9][A-Z0-9_.-]*/gi,
    hint_zh: "规则不随某个变更存在：删掉编号，只留规则本身",
  },
  {
    code: "SPEC_VERSION",
    label_zh: "版本号",
    pattern: /\bv\d+(?:\.\d+)+\b|(?<![\d.])\d+\.\d+\.\d+(?:-[\w.]+)?(?![\d.])|[\w-]@[\^~]?\d[\w.]*|\b\d+\.x\b|版本号?\s*[:：]?\s*\d|\bversion\s+\d/gi,
    hint_zh: "版本只记在项目技术基线里（pomaster baseline）；条文写成不随版本变的规则",
  },
  {
    code: "SPEC_TIMESTAMP",
    label_zh: "时间戳",
    pattern: /\b\d{4}-\d{1,2}-\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?\b|\b\d{4}\/\d{1,2}\/\d{1,2}\b|\d{4}\s*年(?:\s*\d{1,2}\s*月)?|\d{1,2}\s*月\s*\d{1,2}\s*日|\b\d{1,2}:\d{2}:\d{2}\b/g,
    hint_zh: "规则不带日期和时刻；什么时候写的由版本库记录",
  },
  {
    code: "SPEC_TIMESTAMP",
    label_zh: "一次性措辞",
    pattern: /本轮|这轮|目前为止|截至目前|暂时先|先这样|\bTODO\b|\bFIXME\b/g,
    hint_zh: "规则要长期成立：删掉只对某一轮工作成立的说法",
  },
  {
    code: "SPEC_PROVENANCE",
    label_zh: "记录人 / 会话标记",
    pattern: /\b(?:human|agent):[\w.\-一-鿿]+|Co-Authored-By|Claude-Session|\bsession_[A-Za-z0-9]{8,}|\b[0-9a-f]{12,40}\b/g,
    hint_zh: "谁写的由版本库记录；条文里只留规则",
  },
];

export interface SpecWritingIssue {
  readonly code: string;
  readonly field: SpecEntryFieldKey | "title" | "text";
  readonly label_zh: string;
  readonly match: string;
  readonly hint_zh: string;
  /** spec-lint 扫文件时的行号（1 起）。 */
  readonly line?: number;
  readonly file?: string;
}

/** 一段条文里的禁止内容（每个命中一条）。 */
export function lintSpecContent(text: string, field: SpecWritingIssue["field"] = "text"): SpecWritingIssue[] {
  const issues: SpecWritingIssue[] = [];
  for (const rule of SPEC_FORBIDDEN_CONTENT) {
    for (const match of text.matchAll(rule.pattern)) {
      issues.push({ code: rule.code, field, label_zh: rule.label_zh, match: match[0], hint_zh: rule.hint_zh });
    }
  }
  return issues;
}

export const SPEC_STATEMENT_MAX = 200;
export const SPEC_FIELD_MAX = 300;

export type SpecEntryInput = Partial<Record<SpecEntryFieldKey, string>>;

export interface SpecEntry {
  readonly statement: string;
  readonly level: SpecLevel;
  readonly scope: string;
  readonly rationale: string;
  readonly check: string;
  readonly do: string;
  readonly dont: string;
}

export function levelOf(text: string): SpecLevel {
  if (/MUST NOT|禁止|不得|不能|不要|严禁|不允许|不准|避免|勿/.test(text)) return "MUST NOT";
  if (/SHOULD|建议|尽量|推荐|最好|宜/.test(text)) return "SHOULD";
  return "MUST";
}

function normalize(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * 校验一条待写入的规则：七个字段齐全、单行、长度在限内，且没有禁止内容。
 * 级别缺省时按规则措辞判；显式给出时必须是 MUST / MUST NOT / SHOULD。
 */
export function validateSpecEntry(input: SpecEntryInput): { readonly entry: SpecEntry | null; readonly missing: readonly SpecEntryField[]; readonly issues: readonly SpecWritingIssue[] } {
  const values = new Map<SpecEntryFieldKey, string>();
  for (const key of SPEC_ENTRY_FIELD_KEYS) values.set(key, normalize(input[key]));
  const statement = (values.get("statement") ?? "").replace(/^(MUST NOT|MUST|SHOULD)\s*[:：]?\s*/, "");
  values.set("statement", statement);
  const rawLevel = (values.get("level") ?? "").toUpperCase();
  const issues: SpecWritingIssue[] = [];
  let level: SpecLevel = levelOf(normalize(input.statement));
  if (rawLevel !== "") {
    const matched = SPEC_LEVELS.find((candidate) => candidate === rawLevel);
    if (matched === undefined) {
      issues.push({ code: "SPEC_FIELD_LEVEL", field: "level", label_zh: "级别", match: rawLevel, hint_zh: "级别写 MUST、MUST NOT 或 SHOULD" });
    } else {
      level = matched;
    }
  }
  values.set("level", level);
  const missing = SPEC_ENTRY_FIELDS.filter((field) => (values.get(field.key) ?? "") === "");
  for (const field of SPEC_ENTRY_FIELDS) {
    const value = values.get(field.key) ?? "";
    if (value === "") continue;
    const max = field.key === "statement" ? SPEC_STATEMENT_MAX : SPEC_FIELD_MAX;
    if (value.length > max) {
      issues.push({ code: "SPEC_FIELD_LENGTH", field: field.key, label_zh: field.label_zh, match: `${value.length} 字`, hint_zh: `${field.label_zh}最多 ${max} 字；一条规则只说一件事，拆成多条` });
    }
    if (field.key !== "level") issues.push(...lintSpecContent(value, field.key));
  }
  if (statement !== "" && statement.length < 6) {
    issues.push({ code: "SPEC_FIELD_LENGTH", field: "statement", label_zh: "规则", match: statement, hint_zh: "写完整的一句规则，如「表格的操作列固定在右侧，最多放三个文字按钮」" });
  }
  const ok = missing.length === 0 && issues.length === 0;
  return {
    entry: ok
      ? {
          statement,
          level,
          scope: values.get("scope") ?? "",
          rationale: values.get("rationale") ?? "",
          check: values.get("check") ?? "",
          do: values.get("do") ?? "",
          dont: values.get("dont") ?? "",
        }
      : null,
    missing,
    issues,
  };
}

/** 硬规范主题文档里的一条规则：主条目是规则，下挂五个字段（级别由所在章节表达）。 */
export function renderSpecEntryMarkdown(entry: SpecEntry): string[] {
  return [
    `- ${entry.statement}`,
    `  - 适用范围：${entry.scope}`,
    `  - 理由：${entry.rationale}`,
    `  - 检查方式：${entry.check}`,
    `  - 正例：${entry.do}`,
    `  - 反例：${entry.dont}`,
  ];
}

/** 写入契约的人读说明（CLI 失败提示、skill 卡片共用）。 */
export function specWritingContractLines(): string[] {
  return [
    "每条规则必含：" + SPEC_ENTRY_FIELDS.map((field) => `${field.label_zh}（${field.flag}）`).join("、"),
    "条文不带：引用（链接、参见 / 详见、文档路径、PR / issue / 任务编号）、版本号（版本只记在技术基线）、时间戳与一次性措辞、记录人与会话标记",
  ];
}

// ============================================================
// spec-lint：复核已有规范的条文
// ============================================================

/**
 * 从 Markdown 规范文档里取条文行：跳过 frontmatter（溯源元数据）、代码块、HTML 注释与标题行；
 * 其余正文行都算条文。返回 [行号, 文本]。
 */
export function markdownRuleLines(text: string): Array<[number, string]> {
  const lines = text.split("\n");
  const out: Array<[number, string]> = [];
  let index = 0;
  if ((lines[0] ?? "").trim() === "---") {
    index = 1;
    while (index < lines.length && (lines[index] ?? "").trim() !== "---") index += 1;
    index += 1;
  }
  let fence = false;
  let comment = false;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (comment) {
      if (trimmed.includes("-->")) comment = false;
      continue;
    }
    if (trimmed.startsWith("<!--")) {
      if (!trimmed.includes("-->")) comment = true;
      continue;
    }
    if (trimmed === "" || /^#{1,6}\s/.test(trimmed)) continue;
    out.push([index + 1, line]);
  }
  return out;
}

/** 设计规范 YAML 里属于条文的字段（标题、概述、规则、理由、示例说明）。 */
export const DESIGN_TEXT_KEYS = ["title_zh", "summary_zh", "statement_zh", "rationale_zh", "scope_zh", "check_zh", "note_zh", "description_zh", "usage_zh", "decision"] as const;

/**
 * 从设计规范 YAML 里取条文（只看条文字段；sources 出处表与示例代码不算条文）。
 * 行号取条文首段在文件里第一次出现的行；解析失败时返回空（形态问题归 design validate）。
 */
export function designStandardRuleLines(text: string): Array<[number, string]> {
  let parsed: unknown;
  try {
    parsed = loadYaml(text);
  } catch {
    return [];
  }
  const lines = text.split("\n");
  const out: Array<[number, string]> = [];
  const textKeys = new Set<string>(DESIGN_TEXT_KEYS);
  const lineOf = (value: string): number => {
    const probe = value.slice(0, 24);
    const index = lines.findIndex((line) => line.includes(probe));
    return index === -1 ? 0 : index + 1;
  };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "sources") continue;
      if (textKeys.has(key) && typeof value === "string") out.push([lineOf(value), value]);
      else walk(value);
    }
  };
  walk(parsed);
  return out;
}

export function lintRuleLines(file: string, lines: ReadonlyArray<[number, string]>): SpecWritingIssue[] {
  return lines.flatMap(([line, text]) => lintSpecContent(text).map((issue) => ({ ...issue, file, line })));
}

// ============================================================
// pomaster spec-lint：复核项目里已有规范的条文
// ============================================================

export interface SpecLintResult {
  readonly files: number;
  readonly issues: readonly SpecWritingIssue[];
}

function listMarkdown(root: string, base: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const name of readdirSync(root).sort()) {
    const absolute = join(root, name);
    const relative = `${base}/${name}`;
    if (statSync(absolute).isDirectory()) out.push(...listMarkdown(absolute, relative));
    else if (name.endsWith(".md")) out.push(relative);
  }
  return out;
}

/** 扫项目的规范文档（specs/ 下的硬规范与证据规范 .md）与设计规范（baseline/frontend/design-standard.yaml）的条文。 */
export function lintProjectSpecs(dir: string): SpecLintResult {
  const pomaster = join(dir, ".pomaster");
  const issues: SpecWritingIssue[] = [];
  // index.md 是目录页（路由表按路径组织），不算条文。
  const docs = listMarkdown(join(pomaster, "specs"), ".pomaster/specs").filter((file) => !file.endsWith("/index.md"));
  for (const relative of docs) {
    const text = readFileSync(join(dir, relative), "utf8");
    issues.push(...lintRuleLines(relative, markdownRuleLines(text)));
  }
  let files = docs.length;
  const standardRelative = ".pomaster/baseline/frontend/design-standard.yaml";
  if (existsSync(join(dir, standardRelative))) {
    files += 1;
    issues.push(...lintRuleLines(standardRelative, designStandardRuleLines(readFileSync(join(dir, standardRelative), "utf8"))));
  }
  return { files, issues };
}

export function runSpecLint(dir: string): CommandOutcome<SpecLintResult | null> {
  if (!existsSync(join(dir, ".pomaster", "specs"))) {
    return failOutcome("spec-lint", null, [{ code: "NOT_INITIALIZED", message: "找不到 .pomaster/specs", hint: "先 pomaster init（硬规范主题文档随 init 播种）" }], ["spec-lint: FAILED — NOT_INITIALIZED"]);
  }
  const result = lintProjectSpecs(dir);
  const lines = result.issues.map((issue) => `  ${issue.file}:${issue.line} 「${issue.match}」${issue.label_zh}——${issue.hint_zh}`);
  if (result.issues.length === 0) {
    return okOutcome("spec-lint", result, [`spec-lint: ${result.files} 份规范，条文全部合写入契约`]);
  }
  return failOutcome(
    "spec-lint",
    result,
    [{ code: "SPEC_LINT_ISSUES", message: `${result.files} 份规范里有 ${result.issues.length} 处不合写入契约`, hint: "逐处改写：条文不带引用、版本号、时间戳、记录人；版本只记在技术基线" }],
    [`spec-lint: ${result.issues.length} 处不合写入契约（${result.files} 份规范）`, ...lines],
  );
}
