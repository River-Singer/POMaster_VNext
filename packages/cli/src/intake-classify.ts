/**
 * intake-classify.ts —— 材料目录里的每个文件按内容分类（code-spec：requirement-intake §3.1）。
 *
 * 真实交付的目录名、文件名每版都在变（下载后缀、spec 根换位置），所以先看内容，路径与文件名只作弱线索，
 * 并把判据写进 reason。分不清的文本文件判 unknown，由 agent 用 `intake resolve --file` 改判。
 */

import { NORMATIVE } from "./intake-text.js";

export const FILE_CLASSES = [
  "requirement_doc",
  "change_doc",
  "prototype_page",
  "prototype_index",
  "prototype_asset",
  "sample_data",
  "design_doc",
  "api_contract",
  "contract_doc",
  "changelog",
  "project_doc",
  "tooling",
  "binary",
  "unknown",
] as const;
export type FileClass = (typeof FILE_CLASSES)[number];

export type ChangeState = "active" | "archived" | "unknown";

export interface FileClassification {
  readonly class: FileClass;
  readonly reason: string;
  /** 只对 change_doc：进行中 / 已归档 / 不明。 */
  readonly change_state?: ChangeState;
  /** 路径里有 archive 一类的段：只作谱系，不读成需求。 */
  readonly archived?: boolean;
}

const BINARY_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg|pdf|zip|gz|tgz|rar|7z|woff2?|ttf|otf|eot|mp4|mov|webm|mp3|wav|xlsx?|docx?|pptx?)$/i;
const TOOLING_EXT = /\.(py|sh|ps1|bat|cmd|rb|pl)$/i;
const TOOLING_NAMES = /^(\.gitkeep|\.gitignore|\.gitattributes|\.editorconfig|\.npmrc|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|tsconfig[\w.-]*\.json)$/i;
const ARCHIVE_SEGMENT = /^(archive|archived|old|deprecated|backup|bak|history)$/i;

const CHANGE_HEADINGS = /^(why|motivation|what changes|changes|capabilities|impact|scope|in scope|breaking changes?|context|goals(\s*\/\s*non-goals)?|decisions|risks(\s*\/\s*trade-?offs)?|trade-?offs|migration plan|adr|变更类型|背景|动机|变更范围|具体内容|变更内容|变更说明|影响范围|破坏性变更|决策)$/i;
/** 一级标题直接写明这是一次变更（「# Change: …」「# 变更：…」）。 */
const CHANGE_TITLE = /^(change|proposal|变更|提案)\s*[:：]/i;
const DELTA_HEADINGS = /^(added|modified|removed|renamed)\s+requirements$/i;
const REQUIREMENT_HEADINGS = /^(requirement[:：]|scenario[:：]|功能说明|功能描述|业务规则|字段列表|字段说明|数据字典|数据来源|操作说明|待确认问题|验收标准|用例|场景)/i;
const DESIGN_HEADINGS = /(配色|颜色|色板|字体|字号|排版|间距|圆角|阴影|组件|tokens?|令牌|typography|colou?r|spacing|elevation|页面结构|视觉|设计规范|设计系统|design system|样式|布局覆盖|空态|错误态|加载态|交互行为|页面状态|验证点|^page[:：])/i;
const PROJECT_HEADINGS = /(技术栈|技术选型|目录结构|环境|部署|交接|handoff|约定|git|仓库|启动|quick ?start|项目说明)/i;
const CONTRACT_HEADINGS = /(错误码|error codes?|共享类型|shared types?|接口|api|状态码|http)/i;
const VERSION_HEADING = /^(v?\d+\.\d+(\.\d+)?|\d{4}-\d{2}-\d{2})\b/i;
const TECH_ROW = /^(前端|后端|数据库|db|数据层|测试|接口|api|部署|构建|语言|框架|frontend|backend|database|orm|缓存|消息|ui ?库|组件库|表格)/i;

function headingsOf(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => /^#{1,6}\s+(.*)$/.exec(line)?.[1] ?? null)
    .filter((value): value is string => value !== null)
    .map((value) => value.replace(/\*\*|`/g, "").replace(/^[\d.]+\s*/, "").trim());
}

function segments(rel: string): string[] {
  return rel.split("/").filter(Boolean);
}

function changeStateOf(rel: string): ChangeState {
  const parts = segments(rel).map((part) => part.toLowerCase());
  if (parts.some((part) => ARCHIVE_SEGMENT.test(part))) return "archived";
  if (parts.includes("changes") || parts.includes("change")) return "active";
  return "unknown";
}

function markdownClass(rel: string, text: string): FileClassification {
  const headings = headingsOf(text);
  const changeHits = headings.filter((heading) => CHANGE_HEADINGS.test(heading)).length;
  const deltaHits = headings.filter((heading) => DELTA_HEADINGS.test(heading)).length;
  const listItems = text.split(/\r?\n/).filter((line) => /^\s*([-*+]|\d+\.)\s+/.test(line));
  const checkboxes = listItems.filter((line) => /^\s*([-*+]|\d+\.)\s+\[[ xX]\]/.test(line)).length;
  const requirementHits = headings.filter((heading) => REQUIREMENT_HEADINGS.test(heading)).length;
  if (CHANGE_TITLE.test(headings[0] ?? "")) return { class: "change_doc", reason: `一级标题写明是变更：${headings[0] ?? ""}`, change_state: changeStateOf(rel) };
  if (deltaHits > 0) return { class: "change_doc", reason: `有 ${deltaHits} 个 ADDED / MODIFIED / REMOVED Requirements 段（变更增量）`, change_state: changeStateOf(rel) };
  if (changeHits >= 2 && requirementHits <= changeHits) return { class: "change_doc", reason: `有 ${changeHits} 个变更说明类标题（Why / What Changes / 背景 / 变更范围……）`, change_state: changeStateOf(rel) };
  if (checkboxes >= 5 && checkboxes >= listItems.length * 0.6 && requirementHits === 0) return { class: "change_doc", reason: `${checkboxes} 个复选框占列表项 ${Math.round((checkboxes / Math.max(listItems.length, 1)) * 100)}%（任务清单）`, change_state: changeStateOf(rel) };
  const versionHeadings = headings.filter((heading) => VERSION_HEADING.test(heading)).length;
  if (versionHeadings >= 3 && versionHeadings >= headings.length * 0.5) return { class: "changelog", reason: `${versionHeadings} 个标题是版本号或日期` };
  if (/^(changelog|变更记录|更新日志|版本记录)/i.test(headings[0] ?? "") || /changelog/i.test(rel.split("/").at(-1) ?? "")) return { class: "changelog", reason: "标题或文件名是变更记录" };

  const lines = text.split(/\r?\n/);
  const normative = lines.filter((line) => !line.trim().startsWith("|") && NORMATIVE.test(line)).length;
  const scenarioLines = lines.filter((line) => /^\s*[-*]?\s*\*{0,2}(WHEN|THEN|GIVEN|AND|IF)\b/.test(line)).length;
  const tableRows = lines.filter((line) => line.trim().startsWith("|"));
  const techRows = tableRows.filter((line) => TECH_ROW.test(line.replace(/^\s*\|\s*/, "").replace(/\*\*/g, ""))).length;
  const hexColors = (text.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) ?? []).length;
  const pxValues = (text.match(/\b\d+px\b/g) ?? []).length;
  const cssVars = (text.match(/--[a-z][\w-]+/g) ?? []).length;
  const score = {
    requirement: requirementHits * 3 + Math.min(normative, 20) + Math.min(scenarioLines, 20),
    design: headings.filter((heading) => DESIGN_HEADINGS.test(heading)).length * 3 + Math.min(hexColors + pxValues + cssVars, 30) / 2 + (/(设计系统|design system|^page[:：])/i.test(headings[0] ?? "") ? 8 : 0),
    project: headings.filter((heading) => PROJECT_HEADINGS.test(heading)).length * 3 + techRows * 3,
    contract: headings.filter((heading) => CONTRACT_HEADINGS.test(heading)).length * 3 + (text.match(/\b[1-5]\d\d\b/g) ?? []).length / 4,
  };
  const ranked = (Object.entries(score) as Array<[keyof typeof score, number]>).sort((left, right) => right[1] - left[1]);
  const [best, top] = ranked[0] ?? ["requirement", 0];
  if (top <= 0) return { class: "unknown", reason: "Markdown 里没有需求、变更、设计、项目约定或接口文档的特征" };
  const detail = `需求 ${score.requirement.toFixed(0)} / 设计 ${score.design.toFixed(0)} / 项目 ${score.project.toFixed(0)} / 接口 ${score.contract.toFixed(0)}`;
  if (best === "requirement") return { class: "requirement_doc", reason: `需求特征最强（${detail}）` };
  if (best === "design") return { class: "design_doc", reason: `设计特征最强（${detail}）` };
  if (best === "project") return { class: "project_doc", reason: `项目约定特征最强（${detail}）` };
  return { class: "contract_doc", reason: `接口文档特征最强（${detail}）` };
}

function htmlClass(text: string): FileClassification {
  const localLinks = (text.match(/href\s*=\s*["'][^"':]+\.html?(#[^"']*)?["']/gi) ?? []).length;
  const controls = (text.match(/<(input|select|textarea|table)\b/gi) ?? []).length;
  if (localLinks >= 5 && controls === 0) return { class: "prototype_index", reason: `${localLinks} 个指向本地页面的链接、没有表单与表格（原型目录页）` };
  if (!/<body\b/i.test(text) && !/<(div|main|section)\b/i.test(text)) return { class: "unknown", reason: "HTML 文件没有页面主体" };
  return { class: "prototype_page", reason: /<script\b/i.test(text) ? "HTML 页面（含脚本，读取时需要渲染）" : "HTML 页面" };
}

function scriptClass(rel: string, text: string): FileClassification {
  const name = rel.split("/").at(-1) ?? rel;
  if (/\.(css|scss|sass|less)$/i.test(name)) return { class: "prototype_asset", reason: "样式表" };
  if (/(mock|fixture|seed|sample|demo[-_]?data|fake)/i.test(name)) return { class: "sample_data", reason: "文件名是示例数据（mock / sample / seed……）" };
  const functions = (text.match(/\bfunction\b|=>/g) ?? []).length;
  const literals = (text.match(/["'][^"'\n]{1,80}["']\s*[,:\]}]/g) ?? []).length;
  if (text.length > 20_000 && literals > functions * 20) return { class: "sample_data", reason: `字面量 ${literals} 处、函数 ${functions} 处（数据为主）` };
  return { class: "prototype_asset", reason: "原型脚本" };
}

function yamlClass(rel: string, text: string): FileClassification {
  const name = rel.split("/").at(-1) ?? rel;
  if (/^\s*(openapi|swagger)\s*:/m.test(text)) return { class: "api_contract", reason: "有 openapi / swagger 顶层键" };
  if (/^\.?openspec\.ya?ml$/i.test(name) || (/^\s*schema\s*:/m.test(text) && /^\s*created\s*:/m.test(text) && text.length < 2000)) return { class: "change_doc", reason: "变更元数据（schema / created）", change_state: changeStateOf(rel) };
  if (/(前端|后端|数据库|frontend|backend|database|tech\s*stack|技术栈)/i.test(text)) return { class: "project_doc", reason: "写有技术栈或项目约定" };
  return { class: "unknown", reason: "YAML 没有接口契约、变更元数据或项目约定的特征" };
}

function jsonClass(rel: string, text: string): FileClassification {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { class: "unknown", reason: "JSON 解析不了" };
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.includes("openapi") || keys.includes("swagger")) return { class: "api_contract", reason: "有 openapi / swagger 顶层键" };
    if (/token/i.test(rel) || keys.some((key) => /^(color|colors|spacing|typography|radius|shadow|font)/i.test(key))) return { class: "design_doc", reason: "设计 token" };
  }
  return { class: "unknown", reason: "JSON 没有接口契约或设计 token 的特征" };
}

/** 文件 → 类别。content 为 null 表示二进制（含 NUL 字节或二进制扩展名）。 */
export function classifyFile(rel: string, content: string | null): FileClassification {
  const name = rel.split("/").at(-1) ?? rel;
  const archived = segments(rel).slice(0, -1).some((part) => ARCHIVE_SEGMENT.test(part));
  const withArchive = (result: FileClassification): FileClassification => {
    if (!archived || result.class === "change_doc" || result.class === "binary" || result.class === "tooling") return result;
    return { ...result, archived: true, reason: `${result.reason}；路径含 archive 一类的段（弱线索，可用 intake resolve --file 改判），只作谱系不读成需求` };
  };
  if (content === null || BINARY_EXT.test(name)) return { class: "binary", reason: "二进制文件（图片、文档、压缩包、字体……）" };
  if (TOOLING_NAMES.test(name) || TOOLING_EXT.test(name)) return { class: "tooling", reason: "脚本或工程元数据" };
  if (/\.html?$/i.test(name)) return withArchive(htmlClass(content));
  if (/\.(js|mjs|cjs|css|scss|sass|less)$/i.test(name)) return withArchive(scriptClass(rel, content));
  if (/\.ya?ml$/i.test(name)) return withArchive(yamlClass(rel, content));
  if (/\.json$/i.test(name)) return withArchive(jsonClass(rel, content));
  if (/\.(md|markdown|txt)$/i.test(name)) return withArchive(markdownClass(rel, content));
  return { class: "unknown", reason: "不认得的文件类型" };
}

/** 需要逐段给出去向的类别（其余类别按类别给缺省去向）。 */
export const COVERED_CLASSES: ReadonlySet<FileClass> = new Set(["requirement_doc", "project_doc"]);
