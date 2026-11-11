/**
 * spec-update.ts —— `pomaster update spec`：把开发中冒出来的新规范写到它该在的地方。
 *
 * 一条新规范只有两个去处：
 * - 设计规范（项目落地的 design-standard.yaml）：讲界面怎么呈现的——间距、颜色、圆角、阴影、组件的样子与交互、
 *   表格和表单的呈现。写成所属领域下的一条新规则（enforcement: review），Storybook 规范页与 `design show` 随之可见；
 * - 硬规范主题文档（.pomaster/specs/hard/themes/*.md）：其余工程规则。按 themes/index.md「维护 spec」路由表
 *   找主题文档，就地写进 MUST / MUST NOT / SHOULD 章节（路由表要求不新建平行文件）。
 *
 * 识别是确定性的：路由表的关键词、设计规范各领域与条目的标题，按命中关键词的长度计分；文里有具体视觉量
 * （px、色值、圆角、阴影、hover…）时偏向设计规范。语气按措辞判：禁止 / 不得 / 不要 → MUST NOT，建议 / 尽量 → SHOULD，
 * 其余 MUST。识别结果、候选与要写的内容都会列出来；认不出就失败并要求用 --area / --theme 指定，不猜。
 * 同一句已在目标里 → 不重复写。
 *
 * 写入前按规范写入契约（spec-writing.ts）校验：七个字段（规则、级别、适用范围、理由、检查方式、正例、反例）
 * 必须齐全；条文不带引用、版本号、时间戳、记录人。不合规就失败并逐条列出，什么都不写。
 * 记录人（--by）只出现在命令结果里，不写进规范正文——谁在什么时候写的由版本库记录。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { loadDesignStandard } from "./design.js";
import { DESIGN_CHECKS, DESIGN_STANDARD_RELATIVE, type DesignArea } from "./design-standard.js";
import { yamlScalar } from "./design-adopt.js";
import { POMASTER_DIR } from "./store-layout.js";
import { findDrawer, projectDrawerDoc, renderProjectDrawerDoc, standardsSpaces } from "./standards-map.js";
import {
  SPEC_ENTRY_FIELDS,
  lintSpecContent,
  renderSpecEntryMarkdown,
  specWritingContractLines,
  validateSpecEntry,
  type SpecEntry,
  type SpecWritingIssue,
} from "./spec-writing.js";

const THEMES_INDEX = "specs/hard/themes/index.md";

export type SpecModality = "MUST" | "MUST NOT" | "SHOULD";

export interface SpecUpdateInput {
  readonly text: string;
  /** auto（缺省）/ design / spec。 */
  readonly target?: "auto" | "design" | "spec";
  /** 设计规范领域键（如 table、button）。 */
  readonly area?: string;
  /** 主题文档（如 security、themes/security.md）。 */
  readonly theme?: string;
  /** 规范抽屉（pomaster standards 里的编号，如 java、spring-boot、php、microservices）。 */
  readonly drawer?: string;
  /** 新规则编号的后半段（设计规范；缺省 PROJECT_<n>）。 */
  readonly id?: string;
  readonly title?: string;
  /** 记录人（human:<名字> / agent:<名字>）；只进命令结果，不写进规范正文。 */
  readonly by: string;
  /** 级别 MUST / MUST NOT / SHOULD（缺省按措辞判）。 */
  readonly level?: string;
  /** 适用范围。 */
  readonly scope?: string;
  /** 理由。 */
  readonly why?: string;
  /** 检查方式：门禁检查编号，或评审时看什么。 */
  readonly check?: string;
  /** 正例。 */
  readonly do?: string;
  /** 反例。 */
  readonly dont?: string;
  readonly dryRun?: boolean;
}

export interface SpecCandidate {
  readonly kind: "design" | "spec";
  /** 设计规范领域键，或主题文档路径（相对 specs/hard/）。 */
  readonly ref: string;
  readonly title_zh: string;
  readonly score: number;
  readonly hits: readonly string[];
}

export interface SpecUpdateResult {
  readonly kind: "design" | "spec";
  readonly ref: string;
  readonly modality: SpecModality;
  readonly file: string;
  /** 设计规范里新规则的编号；硬规范为 null。 */
  readonly rule_id: string | null;
  readonly written: boolean;
  readonly duplicate: boolean;
  readonly preview: string;
  readonly candidates: readonly SpecCandidate[];
  /** 记录人（命令结果里留痕，不进正文）。 */
  readonly by: string;
}

// ============================================================
// 识别
// ============================================================

export { levelOf as modalityOf } from "./spec-writing.js";

function keywordsOf(cell: string): string[] {
  return cell
    .split(/[、，,／/（）()\s：:]+/)
    .map((word) => word.trim())
    .filter((word) => (/[\u4e00-\u9fff]/.test(word) ? word.length >= 2 : word.length >= 3));
}

/** 不带领域信息的常用双字（语气词、泛称），不计分。 */
const STOP_BIGRAMS = new Set(["必须", "不得", "禁止", "不要", "不能", "应该", "应当", "建议", "尽量", "使用", "进行", "所有", "一个", "需要", "可以", "时候", "以及", "或者", "并且", "如果", "统一", "最多", "至少", "不超", "超过", "之间", "里的", "中的", "上的", "的时"]);

/** 词项：中文按双字切（不依赖分词），拉丁词取 3 个字母以上的整词。 */
export function termsOf(text: string): string[] {
  const out: string[] = [];
  for (const run of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let i = 0; i + 1 < run.length; i += 1) {
      const bigram = run.slice(i, i + 2);
      if (!STOP_BIGRAMS.has(bigram)) out.push(bigram);
    }
  }
  for (const word of text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) out.push(word);
  return out;
}

type Weighted = Map<string, number>;

function addTerms(target: Weighted, text: string, weight: number): void {
  for (const term of termsOf(text)) target.set(term, Math.max(target.get(term) ?? 0, weight));
}

interface Route {
  readonly ref: string;
  readonly keywords: readonly string[];
}

/** 读 themes/index.md 的「维护 spec」路由表：关键词 → 主题文档。 */
export function readSpecRoutes(indexText: string): Route[] {
  const byRef = new Map<string, Set<string>>();
  for (const line of indexText.split("\n")) {
    const match = /^\|\s*(.+?)\s*\|\s*`((?:themes|stacks)\/[^`]+\.md)`\s*\|\s*$/.exec(line);
    if (match === null) continue;
    const ref = match[2] ?? "";
    const set = byRef.get(ref) ?? new Set<string>();
    keywordsOf(match[1] ?? "").forEach((word) => set.add(word));
    byRef.set(ref, set);
  }
  return [...byRef.entries()].map(([ref, words]) => ({ ref, keywords: [...words] }));
}

function scoreOf(text: string, weighted: Weighted): { score: number; hits: string[] } {
  const hits = [...new Set(termsOf(text))].filter((term) => weighted.has(term));
  return { score: hits.reduce((sum, term) => sum + (weighted.get(term) ?? 0), 0), hits };
}

const VISUAL = /\d+(\.\d+)?\s*(px|rem|ms)\b|#[0-9a-fA-F]{3,8}\b|圆角|阴影|投影|间距|留白|字号|字重|颜色|色值|配色|hover|悬停|动效|动画|过渡|图标|按钮|卡片|对齐|居中|边框|描边|高亮|斑马纹|栅格|吸顶|固定列|骨架屏|加载条|空状态/i;

/**
 * 识别：每个候选是一张带权词表——路由表关键词（权 2）；设计规范领域标题（权 3）、条目标题（权 1）、领域概述（权 0.5）。
 * 规范原文与之重合的词项按权相加；原文里有具体视觉量时设计规范候选再加 3。
 */
export function recognizeSpec(text: string, routes: readonly Route[], areas: readonly DesignArea[]): SpecCandidate[] {
  const visual = VISUAL.test(text) ? 3 : 0;
  const spec = routes.map((route) => {
    const weighted: Weighted = new Map();
    route.keywords.forEach((word) => addTerms(weighted, word, 2));
    return { kind: "spec" as const, ref: route.ref, title_zh: route.ref, ...scoreOf(text, weighted) };
  });
  const design = areas.map((area) => {
    const weighted: Weighted = new Map();
    addTerms(weighted, area.summary_zh, 0.5);
    area.rules.forEach((rule) => addTerms(weighted, rule.title_zh, 1));
    addTerms(weighted, `${area.title_zh} ${area.key.replace(/_/g, "-")}`, 3);
    const scored = scoreOf(text, weighted);
    return { kind: "design" as const, ref: area.key, title_zh: `${area.group_title_zh} / ${area.title_zh}`, score: scored.score > 0 ? scored.score + visual : 0, hits: scored.hits };
  });
  return [...design, ...spec].filter((candidate) => candidate.score >= 2).sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
}

// ============================================================
// 写入
// ============================================================

function titleOf(text: string): string {
  const first = (text.split(/[，。；,;：:]/)[0] ?? text).replace(/^(MUST NOT|MUST|SHOULD)\s*/, "").trim();
  return first.length > 24 ? `${first.slice(0, 24)}…` : first;
}

function designRuleLines(ruleId: string, title: string, entry: SpecEntry, check: string | null): string[] {
  return [
    `      - id: ${ruleId}`,
    `        title_zh: ${yamlScalar(title)}`,
    `        statement_zh: ${yamlScalar(entry.statement)}`,
    `        rationale_zh: ${yamlScalar(entry.rationale)}`,
    `        level: ${yamlScalar(entry.level)}`,
    `        scope_zh: ${yamlScalar(entry.scope)}`,
    `        check_zh: ${yamlScalar(entry.check)}`,
    check === null ? "        enforcement: { kind: review }" : `        enforcement: { kind: gate, check: ${check} }`,
    "        examples:",
    `          - { kind: do, title_zh: 正例, code: ${yamlScalar(entry.do)}, lang: text }`,
    `          - { kind: dont, title_zh: 反例, code: ${yamlScalar(entry.dont)}, lang: text }`,
  ];
}

function insertDesignRule(standardText: string, area: DesignArea, ruleLines: readonly string[]): string {
  const lines = standardText.split("\n");
  const start = lines.findIndex((line) => line === `  - key: ${area.key}`);
  if (start === -1) throw new Error(`规范文件里找不到领域 ${area.key}`);
  let end = start + 1;
  while (end < lines.length && !/^  - key: /.test(lines[end] ?? "") && !/^  # /.test(lines[end] ?? "") && !/^\S/.test(lines[end] ?? "")) end += 1;
  while (end > start && (lines[end - 1] ?? "").trim() === "") end -= 1;
  lines.splice(end, 0, "", ...ruleLines);
  return lines.join("\n").replace(/^(  origin: )preset$/m, "$1customized").replace(/^(  customized: )false$/m, "$1true");
}

const SUPPLEMENT_HEADER = "**项目补充**";
/** 旧版写入口用过的块标题；仍按项目补充块识别。 */
const LEGACY_SUPPLEMENT_HEADER = "**源：项目补充（pomaster update spec）**";

function insertSpecRule(docText: string, modality: SpecModality, bullet: readonly string[]): string | null {
  const lines = docText.split("\n");
  let start = lines.findIndex((line) => line === `## ${modality}`);
  if (start === -1) {
    // 栈抽屉文档（overlay）不按语气分章节，规则都在「## Rules」里：级别作为子字段写在规则下面。
    start = lines.findIndex((line) => line === "## Rules");
    if (start === -1) return null;
    bullet = [bullet[0] ?? "", `  - 级别：${modality}`, ...bullet.slice(1)];
  }
  let end = start + 1;
  while (end < lines.length && !/^## /.test(lines[end] ?? "")) end += 1;
  const header = lines.findIndex((line, index) => index > start && index < end && (line === SUPPLEMENT_HEADER || line === LEGACY_SUPPLEMENT_HEADER));
  if (header !== -1) {
    let at = header + 1;
    while (at < end && ((lines[at] ?? "").trim() === "" || /^(- |  )/.test(lines[at] ?? ""))) at += 1;
    while (at > header && (lines[at - 1] ?? "").trim() === "") at -= 1;
    lines.splice(at, 0, ...bullet);
    return lines.join("\n");
  }
  let at = end;
  while (at > start && (lines[at - 1] ?? "").trim() === "") at -= 1;
  lines.splice(at, 0, "", SUPPLEMENT_HEADER, "", ...bullet);
  return lines.join("\n");
}

function specRef(theme: string): string {
  const bare = theme.replace(/^specs\/hard\//, "").replace(/\.md$/, "");
  return bare.includes("/") ? `${bare}.md` : `themes/${bare}.md`;
}

export function runSpecUpdate(dir: string, input: SpecUpdateInput): CommandOutcome<SpecUpdateResult | null> {
  const fail = (error: CliError, extra: string[] = []): CommandOutcome<SpecUpdateResult | null> =>
    failOutcome<SpecUpdateResult | null>("update spec", null, [error], [`update spec: FAILED — ${error.code}`, `  ${error.message}`, ...extra, `  hint: ${error.hint}`]);
  const text = input.text.replace(/\s+/g, " ").trim();
  if (text.length < 4) return fail({ code: "SPEC_UPDATE_TEXT", message: "规范原文太短", hint: "写完整的一句规则，如「表格的操作列固定在右侧，最多放三个文字按钮」" });
  if (!/^(human|agent):[\w.\-一-鿿]+$/.test(input.by)) return fail({ code: "SPEC_UPDATE_ACTOR", message: `记录人 ${input.by} 不合规`, hint: "写 --by human:<名字> 或 agent:<名字>" });
  const validated = validateSpecEntry({
    statement: text,
    ...(input.level !== undefined ? { level: input.level } : {}),
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.why !== undefined ? { rationale: input.why } : {}),
    ...(input.check !== undefined ? { check: input.check } : {}),
    ...(input.do !== undefined ? { do: input.do } : {}),
    ...(input.dont !== undefined ? { dont: input.dont } : {}),
  });
  const titleIssues: SpecWritingIssue[] = input.title === undefined ? [] : lintSpecContent(input.title, "title");
  if (validated.missing.length > 0) {
    return fail(
      {
        code: "SPEC_UPDATE_FIELDS",
        message: `规则缺字段：${validated.missing.map((field) => `${field.label_zh}（${field.flag}）`).join("、")}`,
        hint: "补齐字段后重试；规范写入契约见 Storybook「工程规范 / 写入规范」",
      },
      [...validated.missing.map((field) => `    ${field.label_zh}（${field.flag}）：${field.description_zh}`), ...specWritingContractLines().map((line) => `  ${line}`)],
    );
  }
  if (validated.entry === null || titleIssues.length > 0) {
    const issues = [...validated.issues, ...titleIssues];
    const label = (field: SpecWritingIssue["field"]): string =>
      field === "title" ? "标题" : field === "text" ? "条文" : (SPEC_ENTRY_FIELDS.find((item) => item.key === field)?.label_zh ?? field);
    return fail(
      {
        code: "SPEC_UPDATE_CONTENT",
        message: `规则内容不合写入契约（${issues.length} 处）`,
        hint: "按每一处的提示改写后重试；条文不带引用、版本号、时间戳、记录人",
      },
      issues.map((issue) => `    ${label(issue.field)}里的「${issue.match}」：${issue.label_zh}——${issue.hint_zh}`),
    );
  }
  const entry = validated.entry;
  const indexPath = join(dir, POMASTER_DIR, THEMES_INDEX);
  if (!existsSync(indexPath)) return fail({ code: "NOT_INITIALIZED", message: `找不到 ${POMASTER_DIR}/${THEMES_INDEX}`, hint: "先 pomaster init（硬规范主题文档随 init 播种）" });
  const routes = readSpecRoutes(readFileSync(indexPath, "utf8"));
  const standardPath = join(dir, POMASTER_DIR, DESIGN_STANDARD_RELATIVE);
  const adopted = existsSync(standardPath);
  const standard = adopted ? loadDesignStandard(dir, {}) : null;
  const areas = standard?.normalized?.areas ?? [];

  let candidates = recognizeSpec(text, routes, areas);
  if (input.target === "design") candidates = candidates.filter((c) => c.kind === "design");
  if (input.target === "spec") candidates = candidates.filter((c) => c.kind === "spec");
  let chosen: SpecCandidate | undefined;
  /** 预留抽屉第一次写入时要建的项目抽屉文档（相对 specs/hard/ 与初始正文）。 */
  let newDrawerDoc: { readonly ref: string; readonly text: string } | null = null;
  if (input.drawer !== undefined) {
    const drawer = findDrawer(input.drawer);
    if (drawer === undefined) {
      return fail({ code: "SPEC_UPDATE_TARGET", message: `没有规范抽屉 ${input.drawer}`, hint: "pomaster standards 列出全部抽屉编号" });
    }
    const ref = drawer.doc ?? projectDrawerDoc(drawer.id);
    if (!existsSync(join(dir, POMASTER_DIR, "specs", "hard", ref))) {
      if (drawer.doc !== null) return fail({ code: "SPEC_UPDATE_TARGET", message: `找不到抽屉文档 specs/hard/${ref}`, hint: "重新 pomaster init 播种缺失的规范文档" });
      const space = standardsSpaces().find((item) => item.key === drawer.space)!;
      newDrawerDoc = { ref, text: renderProjectDrawerDoc(drawer, space.title_zh) };
    }
    chosen = { kind: "spec", ref, title_zh: `${drawer.title_zh}（${drawer.id}）`, score: 0, hits: [] };
  } else if (input.area !== undefined) {
    const area = areas.find((item) => item.key === input.area);
    if (area === undefined) {
      return fail(
        adopted
          ? { code: "SPEC_UPDATE_TARGET", message: `设计规范里没有领域 ${input.area}`, hint: "pomaster design show 查领域键" }
          : { code: "DESIGN_NOT_ADOPTED", message: "项目还没有设计规范，写不进设计规范", hint: "先 pomaster design adopt；或写进硬规范 ui-presentation-and-design（--theme ui-presentation-and-design）" },
      );
    }
    chosen = { kind: "design", ref: area.key, title_zh: area.title_zh, score: 0, hits: [] };
  } else if (input.theme !== undefined) {
    const ref = specRef(input.theme);
    if (!existsSync(join(dir, POMASTER_DIR, "specs", "hard", ref))) return fail({ code: "SPEC_UPDATE_TARGET", message: `找不到主题文档 specs/hard/${ref}`, hint: "可选的主题文档见 .pomaster/specs/hard/themes/index.md 路由表" });
    chosen = { kind: "spec", ref, title_zh: ref, score: 0, hits: [] };
  } else {
    chosen = candidates[0];
  }
  const shown = candidates.slice(0, 5).map((c) => `    ${c.kind === "design" ? "设计规范" : "硬规范"} ${c.ref}（${c.score} 分：${c.hits.join("、")}）`);
  if (chosen === undefined) {
    return fail(
      { code: "SPEC_UPDATE_UNRECOGNIZED", message: "认不出这条规范该写到哪里（路由表关键词与设计规范领域都没命中）", hint: "用 --theme <主题文档> 或 --area <设计规范领域> 指定" },
      ["  候选：无"],
    );
  }
  const modality: SpecModality = entry.level;
  const warnings: CliWarning[] = [];
  if (chosen.kind === "design") {
    if (standard === null || !standard.ok || standard.normalized === null) {
      return fail({ code: "DESIGN_STANDARD_INVALID", message: "项目设计规范没通过校验，先修好再补条文", hint: "pomaster design validate" });
    }
    const area = standard.normalized.areas.find((item) => item.key === chosen.ref) as DesignArea;
    const original = readFileSync(standardPath, "utf8");
    if (original.includes(yamlScalar(entry.statement))) {
      return okOutcome("update spec", { kind: "design", ref: area.key, modality, file: `${POMASTER_DIR}/${DESIGN_STANDARD_RELATIVE}`, rule_id: null, written: false, duplicate: true, preview: entry.statement, candidates, by: input.by }, [`update spec: 设计规范 ${area.title_zh} 里已有这一条，没有重复写`]);
    }
    const suffix = input.id ?? `PROJECT_${area.rules.filter((rule) => rule.id.startsWith(`${area.prefix}.PROJECT_`)).length + 1}`;
    if (!/^[A-Z][A-Z0-9_]*$/.test(suffix)) return fail({ code: "SPEC_UPDATE_TARGET", message: `规则编号后半段 ${suffix} 不合规`, hint: "大写字母、数字、下划线，如 ACTION_COLUMN" });
    const ruleId = `${area.prefix}.${suffix}`;
    if (area.rules.some((rule) => rule.id === ruleId)) return fail({ code: "SPEC_UPDATE_TARGET", message: `规则 ${ruleId} 已存在`, hint: "换一个 --id，或用 pomaster design set 改它的参数" });
    const title = input.title ?? titleOf(entry.statement);
    const gateCheck = DESIGN_CHECKS.some((spec) => spec.id === entry.check) ? entry.check : null;
    const ruleLines = designRuleLines(ruleId, title, entry, gateCheck);
    const next = insertDesignRule(original, area, ruleLines);
    const preview = ruleLines.join("\n");
    const result: SpecUpdateResult = { kind: "design", ref: area.key, modality, file: `${POMASTER_DIR}/${DESIGN_STANDARD_RELATIVE}`, rule_id: ruleId, written: false, duplicate: false, preview, candidates, by: input.by };
    const lines = [
      `update spec: 识别为设计规范「${area.group_title_zh} / ${area.title_zh}」的新规则 ${ruleId}（${modality}）`,
      "  候选：",
      ...shown,
      "  写入：",
      ...preview.split("\n").map((line) => `  ${line}`),
    ];
    if (input.dryRun === true) return okOutcome("update spec", result, [...lines, "  （--dry-run：没有写）"]);
    writeFileSync(standardPath, next, "utf8");
    const after = loadDesignStandard(dir, {});
    if (!after.ok) {
      writeFileSync(standardPath, original, "utf8");
      const issue = after.issues.find((item) => item.severity === "error");
      return fail({ code: issue?.code ?? "DESIGN_SHAPE", message: `写入后规范校验不通过，已原样退回：${issue?.message ?? ""}`, hint: issue?.hint ?? "换个写法或指定 --area" });
    }
    after.issues.filter((issue) => issue.code === "DESIGN_TOPIC_EXTRA").forEach((issue) => warnings.push({ code: issue.code, message: issue.message, hint: issue.hint }));
    return okOutcome(
      "update spec",
      { ...result, written: true },
      [...lines, `  已写入 ${POMASTER_DIR}/${DESIGN_STANDARD_RELATIVE}（新指纹 ${after.fingerprint ?? ""}）；Storybook 规范页与 pomaster design show 随之可见。要机器拦截，给这条规则绑定门禁检查后再 pomaster design validate。`],
      warnings.slice(0, 1),
    );
  }

  const docPath = join(dir, POMASTER_DIR, "specs", "hard", chosen.ref);
  if (newDrawerDoc === null && !existsSync(docPath)) return fail({ code: "SPEC_UPDATE_TARGET", message: `找不到主题文档 specs/hard/${chosen.ref}`, hint: "重新 pomaster init 播种缺失的主题文档" });
  const doc = newDrawerDoc === null ? readFileSync(docPath, "utf8") : newDrawerDoc.text;
  const bullet = renderSpecEntryMarkdown(entry);
  if (doc.includes(entry.statement)) {
    return okOutcome("update spec", { kind: "spec", ref: chosen.ref, modality, file: `${POMASTER_DIR}/specs/hard/${chosen.ref}`, rule_id: null, written: false, duplicate: true, preview: bullet.join("\n"), candidates, by: input.by }, [`update spec: ${chosen.ref} 里已有这一条，没有重复写`]);
  }
  const next = insertSpecRule(doc, modality, bullet);
  const rulesSection = !doc.split("\n").includes(`## ${modality}`);
  if (next === null) return fail({ code: "SPEC_UPDATE_TARGET", message: `${chosen.ref} 没有「## ${modality}」章节，也没有「## Rules」章节`, hint: "主题文档应有 MUST / MUST NOT / SHOULD 章节，栈抽屉文档应有 Rules 章节；手工补上章节后重试" });
  const result: SpecUpdateResult = { kind: "spec", ref: chosen.ref, modality, file: `${POMASTER_DIR}/specs/hard/${chosen.ref}`, rule_id: null, written: false, duplicate: false, preview: bullet.join("\n"), candidates, by: input.by };
  const lines = [
    `update spec: 识别为硬规范 ${chosen.ref} 的 ${modality} 条目`,
    "  候选：",
    ...shown,
    `  写入「## ${rulesSection ? "Rules" : modality}」章节的「项目补充」块：`,
    ...(rulesSection ? [bullet[0] ?? "", `  - 级别：${modality}`, ...bullet.slice(1)] : bullet).map((line) => `    ${line}`),
  ];
  if (!adopted && candidates.some((c) => c.kind === "spec" && c.ref === "themes/ui-presentation-and-design.md") && VISUAL.test(entry.statement)) {
    warnings.push({ code: "DESIGN_NOT_ADOPTED", message: "这条像是界面呈现规范，但项目还没落地设计规范，先写进硬规范", hint: "pomaster design adopt 之后，同类规范会写进设计规范并出现在 Storybook" });
  }
  if (newDrawerDoc !== null) lines.push(`  预留抽屉第一次写入：新建 ${POMASTER_DIR}/specs/hard/${newDrawerDoc.ref}`);
  if (input.dryRun === true) return okOutcome("update spec", result, [...lines, "  （--dry-run：没有写）"], warnings);
  if (newDrawerDoc !== null) mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, next, "utf8");
  return okOutcome("update spec", { ...result, written: true }, [...lines, `  已写入 ${POMASTER_DIR}/specs/hard/${chosen.ref}`], warnings);
}
