/**
 * intake-draft.ts —— `pomaster intake draft`（code-spec requirement-intake §8；PRD 11-11-agent-autopilot IN-1b）。
 *
 * 从需求读取的最新修订生成可签的草案，交给启动确认单（IN-2）：
 * - 业务草案：每个模块的用途、角色、核心场景、关键规则（按权限 / 计算 / 审批 / 金额……打标）、操作、待确认问题；
 * - 领域草案：pomaster.domain-spec/v1 形状的实体与字段（类型、必填、唯一、枚举），用脚手架同一个校验器校验；
 * - 歧义清单：未定的问题、缺口、进行中的变更提议、spec 与原型对不上的地方、命名与类型待定；
 * - 非功能线索：性能、并发、容量、响应时间、可用性的原文与数值；没写的记「未定」，不猜；
 * - 技术线索：材料里写的技术栈按前端 / 后端 / 数据库……归类，并对照脚手架的支持面。
 *
 * 全是候选：只写 `.pomaster/prototype/<工作区>/draft/`，不碰领域规格、基线、决策与 truth。
 * 草案绑定 {修订号, 判读摘要}：两者都没变时 NO_CHANGE 零写入。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { dump as dumpYaml } from "js-yaml";
import { GovernanceError, loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";
import type { CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import type { IntakeItem } from "./intake-identity.js";
import { loadIntakeLatest, writeJsonAtomic } from "./intake.js";
import { anchorText, moduleCore, normalizeText } from "./intake-text.js";
import { OWNER_COLUMN, SYSTEM_COLUMNS, validateDomainSpec, type ArchetypeCatalogEntry, type DomainSpecIssue } from "./scaffold-spec.js";

export const INTAKE_DRAFT_SCHEMA = "pomaster.intake-draft/v1";
/** 草案生成逻辑的版本：逻辑一改就升，旧草案随之重生成（绑定 = 修订号 + 判读摘要 + 本版本）。 */
export const INTAKE_DRAFT_GENERATOR = 1;

export type RuleTag = "permission" | "calculation" | "approval" | "amount" | "validation" | "state" | "deletion" | "import_export" | "exception";

const RULE_TAGS: ReadonlyArray<readonly [RuleTag, RegExp]> = [
  ["permission", /(权限|角色|可见|不可见|仅.{0,10}(可|能)|负责人|授权|只能由|登录|账号)/],
  ["calculation", /(=|×|÷|合计|汇总|公式|计算|求和|sum\b|平均|占比|%|累计|推导)/i],
  ["approval", /(审批|审核|驳回|流程|会签|签核)/],
  ["amount", /(金额|价格|单价|总价|费用|成本|费率|元\b|RMB|币种)/i],
  ["validation", /(唯一|必填|校验|格式|长度|不得|不能|必须|不允许|禁止|只能)/],
  ["state", /(状态|启用|停用|冻结|生效|过期|草稿|发布)/],
  ["deletion", /(删除|级联|逻辑删除|物理删除|回收)/],
  ["import_export", /(导入|导出|excel|xlsx|csv|模板)/i],
  ["exception", /(失败|错误|异常|报错|阻止|拒绝|超时|重试|回滚)/],
];

export interface DraftEntry {
  readonly id: string;
  readonly text: string;
}

export interface BusinessModuleDraft {
  readonly module: string;
  readonly key: string;
  readonly name_zh: string;
  readonly purpose: readonly DraftEntry[];
  readonly roles: readonly DraftEntry[];
  readonly scenarios: readonly DraftEntry[];
  readonly operations: readonly DraftEntry[];
  readonly key_rules: Readonly<Record<RuleTag | "other", readonly DraftEntry[]>>;
  readonly open_questions: readonly DraftEntry[];
  readonly field_count: number;
}

export interface DraftQuestion {
  readonly id: string;
  readonly classification: "BLOCKING_AUTHORITY" | "PREFERENCE" | "SCOPE";
  readonly topic: "open_question" | "gap" | "change_proposal" | "spec_prototype" | "naming" | "type";
  readonly module: string | null;
  readonly question_zh: string;
  readonly default_zh: string;
  readonly items: readonly string[];
}

export interface NfrHint {
  readonly id: string;
  readonly topic: "performance" | "concurrency" | "capacity" | "response_time" | "availability";
  readonly text: string;
  readonly values: readonly string[];
  readonly origin: string;
}

export interface TechHint {
  readonly id: string;
  readonly lane: "frontend" | "backend" | "database" | "test" | "contract" | "other";
  readonly label: string;
  readonly value: string;
  readonly support: "supported" | "partial" | "unsupported" | "n/a";
  readonly support_reason: string;
  readonly origin: string;
  readonly carried: boolean;
}

export interface IntakeDraft {
  readonly schema: typeof INTAKE_DRAFT_SCHEMA;
  readonly workspace: string;
  readonly revision: number;
  readonly resolutions_sha256: string;
  readonly generator: number;
  readonly business: readonly BusinessModuleDraft[];
  readonly domain: {
    readonly file: string;
    readonly validated: boolean;
    readonly ok: boolean;
    readonly issues: readonly DomainSpecIssue[];
    readonly entities: number;
    readonly defaults: readonly string[];
  };
  readonly questions: readonly DraftQuestion[];
  readonly nfr: { readonly hints: readonly NfrHint[]; readonly unknown: readonly NfrHint["topic"][] };
  readonly tech: readonly TechHint[];
}

const EXCLUDED_MODULE_KEYS = new Set(["shell", "project", "changes"]);

function entries(items: readonly IntakeItem[]): DraftEntry[] {
  return items.map((item) => ({ id: item.id, text: item.text }));
}

function nameOf(items: readonly IntakeItem[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    const match = /requirement[:：]\s*([^>·]+?)\s*(?:>|·|$)/i.exec(item.origin.locator);
    const name = match?.[1]?.trim();
    if (name !== undefined && name !== "") counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
}

export function tagsOf(text: string): RuleTag[] {
  return RULE_TAGS.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function cells(item: IntakeItem): Record<string, string> {
  const value = item.attrs["cells"];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, cell]) => [normalizeText(key), normalizeText(String(cell ?? ""))]));
}

function cellBy(row: Record<string, string>, pattern: RegExp): string | null {
  for (const [key, value] of Object.entries(row)) if (pattern.test(key) && value !== "" && value !== "—" && value !== "-") return value;
  return null;
}

const ASCII_KEY = /^[A-Za-z][A-Za-z0-9_ .-]*$/;

function snake(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1");
}

type FieldType = "string" | "text" | "int" | "long" | "decimal" | "bool" | "date" | "datetime" | "enum";

function typeOf(typeCell: string | null, label: string): FieldType | null {
  const value = (typeCell ?? "").toLowerCase();
  if (value !== "") {
    if (/(枚举|enum|下拉|选择|单选)/.test(value)) return "enum";
    if (/(布尔|bool|是否)/.test(value)) return "bool";
    if (/(日期时间|时间戳|datetime|timestamp)/.test(value)) return "datetime";
    if (/(日期|date)/.test(value)) return "date";
    if (/(长文本|text|备注|富文本)/.test(value)) return "text";
    if (/(整数|int|integer)/.test(value)) return "int";
    if (/(长整|long|bigint)/.test(value)) return "long";
    if (/(数字|数值|decimal|number|float|double|金额|小数)/.test(value)) return "decimal";
    if (/(文本|字符|string|varchar|char)/.test(value)) return "string";
  }
  if (/^是否/.test(label)) return "bool";
  if (/(时间)$/.test(label)) return "datetime";
  if (/(日期)$/.test(label)) return "date";
  if (/(金额|价|费|率)$/.test(label) || /(金额|价格)/.test(label)) return "decimal";
  if (/(数量|个数|次数|件数)$/.test(label)) return "int";
  return null;
}

function requiredOf(cell: string | null): boolean | null {
  if (cell === null) return null;
  if (/(否|选填|非必填|不必填|no|false|×|✗|n\b)/i.test(cell)) return false;
  if (/(必填|是|yes|true|✓|√|y\b)/i.test(cell)) return true;
  return null;
}

function enumValuesOf(row: Record<string, string>, type: FieldType | null): string[] {
  const explicit = cellBy(row, /(可选值|枚举值?|取值|选项)/);
  const note = cellBy(row, /(说明|备注|描述)/);
  // 说明里写成「人民币 / 美元」这样的短值列表，也当枚举（类型列没写时）
  const listLike = note !== null && /^[^，。,;；]{1,10}(\s*[\/、]\s*[^，。,;；]{1,10})+$/.test(note);
  const source = explicit ?? ((type === "enum" || type === null) && listLike ? note : null);
  if (source === null) return [];
  return source
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .split(/\s*[\/、,，|；;]\s*/)
    .map((value) => normalizeText(value))
    .filter((value) => value !== "" && value.length <= 20);
}

interface BuiltDomain {
  readonly raw: Record<string, unknown>;
  readonly questions: DraftQuestion[];
  readonly entities: number;
}

function buildDomain(workspace: string, modules: ReadonlyArray<{ module: string; key: string; name_zh: string; items: readonly IntakeItem[] }>, nextQuestion: () => string): BuiltDomain {
  const questions: DraftQuestion[] = [];
  const entities: Array<Record<string, unknown>> = [];
  let entitySeq = 0;
  for (const { module, key, name_zh: nameZh, items } of modules) {
    const fields = items.filter((item) => item.kind === "field" && item.source.startsWith("doc:"));
    if (fields.length === 0) continue;
    entitySeq += 1;
    const core = moduleCore(key);
    const entityKey = ASCII_KEY.test(core) ? snake(core) : `entity_${entitySeq}`;
    if (!ASCII_KEY.test(core)) questions.push({ id: nextQuestion(), classification: "PREFERENCE", topic: "naming", module, question_zh: `模块「${nameZh}」的实体英文名待定（草案暂用 ${entityKey}）`, default_zh: `用 ${entityKey}，确认单上可改`, items: [] });
    const rules = items.filter((item) => item.kind === "rule").map((item) => item.text);
    const seen = new Set<string>();
    const draftFields: Array<Record<string, unknown>> = [];
    const unnamed: IntakeItem[] = [];
    const untyped: IntakeItem[] = [];
    const systemFields: IntakeItem[] = [];
    const usedKeys = new Set<string>();
    const reserved = new Set<string>([...SYSTEM_COLUMNS, OWNER_COLUMN]);
    let fieldSeq = 0;
    for (const field of fields) {
      const anchor = anchorText(field.label);
      if (seen.has(anchor)) continue;
      seen.add(anchor);
      fieldSeq += 1;
      const row = cells(field);
      const keyCell = cellBy(row, /(英文|字段键|^键$|^key$|english|code|字段代码|字段英文名)/i);
      const keySource = keyCell !== null && ASCII_KEY.test(keyCell) ? keyCell : ASCII_KEY.test(field.label) ? field.label : null;
      const baseKey = keySource === null ? `field_${String(fieldSeq).padStart(2, "0")}` : snake(keySource);
      // 系统列（id、created_at……）由脚手架生成，不进草案
      if (reserved.has(baseKey)) {
        systemFields.push(field);
        continue;
      }
      let fieldKey = baseKey;
      for (let suffix = 2; usedKeys.has(fieldKey); suffix += 1) fieldKey = `${baseKey}_${suffix}`;
      usedKeys.add(fieldKey);
      if (keySource === null) unnamed.push(field);
      const typeCell = cellBy(row, /^(类型|数据类型|字段类型|type)$/i);
      const inferred = typeOf(typeCell, field.label);
      const values = enumValuesOf(row, inferred);
      // 枚举但材料没列出取值：先按文本，进类型待定
      const type: FieldType = values.length > 0 && inferred !== "bool" ? "enum" : inferred === "enum" || inferred === null ? "string" : inferred;
      if ((inferred === null || inferred === "enum") && values.length === 0) untyped.push(field);
      const required = requiredOf(cellBy(row, /(必填|required|是否必填)/i));
      const unique = (type === "string" || type === "int" || type === "long") && rules.some((text) => text.includes(field.label) && /唯一/.test(text));
      draftFields.push({
        key: fieldKey,
        name_zh: field.label,
        type,
        ...(type === "string" ? { length: 255 } : {}),
        ...(type === "decimal" ? { precision: 18, scale: 2 } : {}),
        ...(type === "enum" ? { values: values.map((value, index) => ({ key: ASCII_KEY.test(value) ? snake(value).toUpperCase() : `V${index + 1}`, name_zh: value })) } : {}),
        ...(required === true ? { required: true } : {}),
        ...(unique ? { unique: true } : {}),
      });
    }
    if (unnamed.length > 0) questions.push({ id: nextQuestion(), classification: "PREFERENCE", topic: "naming", module, question_zh: `「${nameZh}」有 ${unnamed.length} 个字段英文名材料里没给：${unnamed.slice(0, 8).map((field) => field.label).join("、")}${unnamed.length > 8 ? "……" : ""}（草案暂用 field_NN）`, default_zh: "由 agent 按字段含义起英文名，确认单上可改", items: unnamed.map((field) => field.id) });
    if (systemFields.length > 0) questions.push({ id: nextQuestion(), classification: "PREFERENCE", topic: "naming", module, question_zh: `「${nameZh}」的 ${systemFields.map((field) => field.label).join("、")} 对应脚手架的系统列（id / created_at……），草案里不重复声明`, default_zh: "由脚手架生成系统列", items: systemFields.map((field) => field.id) });
    if (untyped.length > 0) questions.push({ id: nextQuestion(), classification: "PREFERENCE", topic: "type", module, question_zh: `「${nameZh}」有 ${untyped.length} 个字段类型材料里没写：${untyped.slice(0, 8).map((field) => field.label).join("、")}${untyped.length > 8 ? "……" : ""}（草案暂按文本 255）`, default_zh: "按 string(255)，确认单上可改", items: untyped.map((field) => field.id) });
    entities.push({
      key: entityKey,
      name_zh: nameZh,
      archetypes: { data: "DATA_ARCHETYPE.MASTER_DATA", backend: "ARCHETYPE.BACKEND.CRUD_RESOURCE", page: "PAGE_ARCHETYPE.MASTER_DATA" },
      fields: draftFields,
      exposure: { admin: { operations: ["create", "get", "list", "update", "delete"] } },
    });
  }
  const appKey = ASCII_KEY.test(workspace) ? snake(workspace) : "app";
  return {
    raw: { schema: "pomaster.domain-spec/v1", app: { key: appKey, name_zh: workspace, java_package: `com.example.${appKey.replace(/_/g, "")}` }, surfaces: { admin: {} }, entities },
    questions,
    entities: entities.length,
  };
}

/** spec 与原型（同一模块的字段表 vs 页面字段）对不上的地方。 */
function specPrototypeQuestions(module: string, nameZh: string, items: readonly IntakeItem[], nextQuestion: () => string): DraftQuestion[] {
  const docFields = new Map(items.filter((item) => item.kind === "field" && item.source.startsWith("doc:")).map((item) => [anchorText(item.label), item]));
  const pageFields = items.filter((item) => (item.kind === "ui_field" || item.kind === "ui_column") && item.source.startsWith("page:"));
  if (docFields.size === 0 || pageFields.length === 0) return [];
  const out: DraftQuestion[] = [];
  const asked = new Set<string>();
  for (const page of pageFields) {
    const anchor = anchorText(page.label);
    if (asked.has(anchor)) continue;
    const doc = docFields.get(anchor);
    if (doc === undefined) {
      if (page.kind === "ui_field" && !/(搜索|查询|筛选|关键字)/.test(page.label)) {
        asked.add(anchor);
        out.push({ id: nextQuestion(), classification: "PREFERENCE", topic: "spec_prototype", module, question_zh: `原型「${nameZh}」里有字段「${page.label}」，spec 的字段表里没有。保留吗？`, default_zh: "保留并补进领域草案，标为待确认", items: [page.id] });
      }
      continue;
    }
    const docRequired = requiredOf(cellBy(cells(doc), /(必填|required|是否必填)/i));
    if (page.kind === "ui_field" && docRequired === true && page.attrs["required"] === false) {
      asked.add(anchor);
      out.push({ id: nextQuestion(), classification: "BLOCKING_AUTHORITY", topic: "spec_prototype", module, question_zh: `「${nameZh} / ${page.label}」spec 写的是必填，原型里没标必填。按哪个？`, default_zh: "按 spec（必填），原型补标记", items: [doc.id, page.id] });
    }
  }
  return out;
}

const NFR_TOPICS: ReadonlyArray<readonly [NfrHint["topic"], RegExp]> = [
  ["concurrency", /(并发|同时在线|在线用户|qps|tps|吞吐|峰值)/i],
  ["response_time", /(响应时间|毫秒|ms\b|秒内|秒以内|延迟|p9[59])/i],
  ["capacity", /(数据量|万条|亿条|容量|存储空间|行数上限|上限\s*\d|最多\s*\d+\s*(条|行|个))/],
  ["availability", /(可用性|\bsla\b|宕机|99\.\d+%|容灾)/i],
  ["performance", /(性能要求|性能指标|加载时间|首屏|卡顿|大数据量|虚拟滚动|万行|流畅)/],
];
/** 这几类要带上对口单位的数值才算阈值线索（「40%」不是响应时间，「slate-700」不是 SLA）。 */
const NFR_UNITS: Partial<Record<NfrHint["topic"], RegExp>> = {
  response_time: /(ms|毫秒|秒|分钟)$/i,
  capacity: /(万|亿|条|行|gb|mb|tb|个)$/i,
  concurrency: /(人|qps|tps|个|次)$/i,
  performance: /./,
};

export function nfrHints(items: readonly IntakeItem[]): NfrHint[] {
  const out: NfrHint[] = [];
  for (const item of items) {
    if (item.kind.startsWith("ui_") || item.kind === "change_proposal") continue;
    for (const [topic, pattern] of NFR_TOPICS) {
      if (!pattern.test(item.text)) continue;
      const values = [...item.text.matchAll(/\d+(?:[.,]\d+)?\s*(?:%|ms|毫秒|秒|分钟|万|亿|条|行|人|个|次|qps|tps|gb|mb|tb)/gi)].map((match) => normalizeText(match[0]));
      const unit = NFR_UNITS[topic];
      const relevant = unit === undefined ? values : values.filter((value) => unit.test(value));
      if (unit !== undefined && relevant.length === 0) continue;
      out.push({ id: item.id, topic, text: item.text, values: relevant, origin: `${item.origin.file} · ${item.origin.locator}` });
      break;
    }
  }
  return out;
}

const SUPPORT: Readonly<Record<"frontend" | "backend", ReadonlyArray<readonly [RegExp, TechHint["support"], string]>>> = {
  backend: [
    [/spring\s*boot/i, "supported", "脚手架后端是 Spring Boot + MyBatis-Plus"],
    [/(java|kotlin)/i, "partial", "JVM 语言，脚手架只生成 Spring Boot + MyBatis-Plus"],
    [/(fastapi|django|flask|python)/i, "unsupported", "脚手架没有 Python 后端；可用的证据腿：pytest、pytest-cov、mutmut、pip-audit 类、semgrep 类"],
    [/(node|express|nest|koa|go\b|golang|php|laravel|\.net|c#|rust)/i, "unsupported", "脚手架只有 Spring Boot 后端"],
  ],
  frontend: [
    [/(vue).*(antd|ant design)|(antd|ant design).*(vue)/i, "supported", "脚手架前端支持 Vue + antdv"],
    [/react.*geist|geist.*react/i, "supported", "脚手架前端支持 React + Geist"],
    [/vue/i, "partial", "脚手架的 Vue 前端用 antdv 组件库"],
    [/react/i, "partial", "脚手架的 React 前端用 Geist 组件库"],
    [/(angular|svelte|solid|jquery)/i, "unsupported", "脚手架前端只有 Vue + antdv / React + Geist"],
  ],
};

function techHints(items: readonly IntakeItem[]): TechHint[] {
  return items
    .filter((item) => item.kind === "tech_hint")
    .map((item) => {
      const label = item.label;
      const value = normalizeText(String(item.attrs["value"] ?? item.text));
      const lane: TechHint["lane"] = /(前端|frontend|ui ?库|组件库|表格|状态管理|路由)/i.test(label)
        ? "frontend"
        : /(后端|backend|orm|缓存|消息)/i.test(label)
          ? "backend"
          : /(数据库|database|db|数据层)/i.test(label)
            ? "database"
            : /(测试|test)/i.test(label)
              ? "test"
              : /(接口|api|契约)/i.test(label)
                ? "contract"
                : "other";
      // 只有「前端 / 后端」这类技术栈选择才对照脚手架支持面；其余是约束或组件选择，按材料登记
      const stackChoice = (lane === "frontend" || lane === "backend") && /^(前端|后端|frontend|backend)(框架|技术栈|语言)?$/i.test(label);
      const table = stackChoice && (lane === "frontend" || lane === "backend") ? SUPPORT[lane] : [];
      const hit = table.find(([pattern]) => pattern.test(value));
      const support: TechHint["support"] = stackChoice ? hit?.[1] ?? "partial" : "n/a";
      const reason = hit?.[2] ?? (stackChoice ? "材料里的写法认不出，确认单上明示" : "约束或组件选择，按材料登记");
      return { id: item.id, lane, label, value, support, support_reason: reason, origin: `${item.origin.file} · ${item.origin.locator}`, carried: item.carried === true };
    });
}

function businessMarkdown(draft: IntakeDraft): string {
  const lines = [`# 业务草案（需求读取 r${draft.revision}，工作区 ${draft.workspace}）`, "", "由 `pomaster intake draft` 生成，全部是候选，经启动确认后才生效。每条带需求编号，可回查原文。", ""];
  for (const module of draft.business) {
    lines.push(`## ${module.name_zh}（${module.key}，${module.module}）`, "");
    const section = (title: string, list: readonly DraftEntry[]) => {
      if (list.length === 0) return;
      lines.push(`### ${title}`, "", ...list.slice(0, 30).map((entry) => `- ${entry.id} ${entry.text.slice(0, 160)}`), ...(list.length > 30 ? [`- ……另有 ${list.length - 30} 条`] : []), "");
    };
    section("用途", module.purpose);
    section("角色", module.roles);
    section("核心场景", module.scenarios);
    for (const [tag, title] of [["permission", "权限规则"], ["calculation", "计算规则"], ["approval", "审批规则"], ["amount", "金额规则"], ["exception", "异常处理"], ["state", "状态规则"], ["deletion", "删除规则"], ["import_export", "导入导出"], ["validation", "校验规则"], ["other", "其他规则"]] as const) section(title, module.key_rules[tag]);
    section("待确认问题", module.open_questions);
  }
  if (draft.questions.length > 0) lines.push("## 歧义清单", "", ...draft.questions.map((question) => `- ${question.id} [${question.classification}] ${question.question_zh}（缺省：${question.default_zh}）`), "");
  lines.push("## 非功能线索", "", ...(draft.nfr.hints.length > 0 ? draft.nfr.hints.map((hint) => `- ${hint.id} [${hint.topic}] ${hint.text.slice(0, 140)}${hint.values.length > 0 ? `（数值：${hint.values.join("、")}）` : ""}`) : ["- 材料里没有"]), ...draft.nfr.unknown.map((topic) => `- ${topic}：材料里没写，记「未定」`), "");
  lines.push("## 技术线索", "", ...draft.tech.map((hint) => `- ${hint.label}：${hint.value}（${hint.support}：${hint.support_reason}；出处 ${hint.origin}${hint.carried ? "，本次未随交付、沿用上一版" : ""}）`), "");
  return `${lines.join("\n")}\n`;
}

export interface IntakeDraftResult {
  readonly workspace: string;
  readonly revision: number;
  readonly no_change: boolean;
  readonly out_dir: string;
  readonly modules: number;
  readonly entities: number;
  readonly domain_ok: boolean;
  readonly questions: number;
  readonly nfr_hints: number;
  readonly tech_hints: number;
}

export function runIntakeDraft(dir: string, input: { readonly name?: string; readonly catalog?: readonly ArchetypeCatalogEntry[]; readonly catalogRoot?: string }): CommandOutcome<IntakeDraftResult | null> {
  const loaded = loadIntakeLatest(dir, input.name);
  if (!loaded.ok) return failOutcome("intake draft", null, loaded.errors, loaded.errors.map((error) => error.message));
  const { workspace, data } = loaded;
  const revision = data.files.revision;
  const outDir = join(workspace.dir, "draft");
  const draftPath = join(outDir, "draft.json");
  const resolutionsSha = data.files.resolutions_sha256;
  const outRel = relative(dir, outDir).replace(/\\/g, "/");
  if (existsSync(draftPath)) {
    try {
      const existing = JSON.parse(readFileSync(draftPath, "utf8")) as IntakeDraft;
      if (existing.schema === INTAKE_DRAFT_SCHEMA && existing.revision === revision && existing.resolutions_sha256 === resolutionsSha && existing.generator === INTAKE_DRAFT_GENERATOR) {
        return okOutcome("intake draft", summary(existing, true, outRel), [`草案已对应 r${revision}（NO_CHANGE），未写入：${outRel}`]);
      }
    } catch {
      // 坏的草案按需重写（草案是派生物，不是权威）
    }
  }
  const warnings: CliWarning[] = [];
  let seq = 0;
  const nextQuestion = () => `DQ-${String(++seq).padStart(3, "0")}`;
  const identity = workspace.identity;
  const byModule = new Map<string, IntakeItem[]>();
  for (const item of data.items) byModule.set(item.module, [...(byModule.get(item.module) ?? []), item]);
  const modules = [...byModule.entries()]
    .map(([module, items]) => ({ module, key: identity?.modules[module]?.key ?? module, items }))
    .filter((entry) => !EXCLUDED_MODULE_KEYS.has(entry.key) && entry.items.some((item) => item.source.startsWith("doc:")))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((entry) => ({ ...entry, name_zh: nameOf(entry.items, identity?.modules[entry.module]?.title ?? entry.key) }));

  const business: BusinessModuleDraft[] = modules.map(({ module, key, name_zh: nameZh, items }) => {
    const rules = items.filter((item) => item.kind === "rule" || item.kind === "seed_data");
    const keyRules = Object.fromEntries([...RULE_TAGS.map(([tag]) => tag), "other"].map((tag) => [tag, [] as DraftEntry[]])) as Record<RuleTag | "other", DraftEntry[]>;
    for (const rule of rules) {
      const tags = tagsOf(rule.text);
      for (const tag of tags.length > 0 ? tags : (["other"] as const)) keyRules[tag].push({ id: rule.id, text: rule.text });
    }
    return {
      module,
      key,
      name_zh: nameZh,
      purpose: entries(items.filter((item) => item.kind === "description")),
      roles: entries(items.filter((item) => item.kind === "role")),
      scenarios: entries(items.filter((item) => item.kind === "scenario")),
      operations: entries(items.filter((item) => item.kind === "operation")),
      key_rules: keyRules,
      open_questions: entries(items.filter((item) => item.kind === "open_question" && item.attrs["resolved"] !== true)),
      field_count: items.filter((item) => item.kind === "field").length,
    };
  });

  const questions: DraftQuestion[] = [];
  for (const { module, name_zh: nameZh, items } of modules) {
    for (const item of items.filter((entry) => entry.kind === "open_question" && entry.attrs["resolved"] !== true)) questions.push({ id: nextQuestion(), classification: "PREFERENCE", topic: "open_question", module, question_zh: `「${nameZh}」待确认：${item.text}`, default_zh: "按材料现状推进，记为假设", items: [item.id] });
    for (const item of items.filter((entry) => entry.kind === "gap")) questions.push({ id: nextQuestion(), classification: "BLOCKING_AUTHORITY", topic: "gap", module, question_zh: `「${nameZh}」缺口：${item.text}`, default_zh: "需要 Owner 补充", items: [item.id] });
    questions.push(...specPrototypeQuestions(module, nameZh, items, nextQuestion));
  }
  for (const item of data.items.filter((entry) => entry.kind === "change_proposal")) questions.push({ id: nextQuestion(), classification: "SCOPE", topic: "change_proposal", module: item.module, question_zh: `进行中的变更提议「${item.label}」${item.carried === true ? "（本次未随交付）" : ""}：纳入这次范围吗？${item.text !== "" ? `——${item.text.slice(0, 120)}` : ""}`, default_zh: "不纳入，等它归档后作为新增量处理", items: [item.id] });

  const built = buildDomain(workspace.name, modules, nextQuestion);
  questions.push(...built.questions);
  let catalog = input.catalog ?? null;
  if (catalog === null) {
    try {
      catalog = loadCatalogArchetypes(resolveCatalogRoot(input.catalogRoot)).map((material) => ({ id: material.id, operations: material.operations }));
    } catch (error) {
      if (!(error instanceof GovernanceError)) throw error;
      warnings.push({ code: "INTAKE_DRAFT_CATALOG_UNAVAILABLE", message: `catalog 不可用，领域草案未校验：${error.message}`, hint: "草案照常写出；catalog 可用后重跑 intake draft" });
    }
  }
  const validation = catalog === null ? null : validateDomainSpec(built.raw, catalog);
  const hints = nfrHints(data.items);
  const topics: NfrHint["topic"][] = ["performance", "concurrency", "capacity", "response_time", "availability"];
  const draft: IntakeDraft = {
    schema: INTAKE_DRAFT_SCHEMA,
    workspace: workspace.name,
    revision,
    resolutions_sha256: resolutionsSha,
    generator: INTAKE_DRAFT_GENERATOR,
    business,
    domain: {
      file: "domain-spec.draft.yaml",
      validated: validation !== null,
      ok: validation?.ok ?? false,
      issues: validation?.issues ?? [],
      entities: built.entities,
      defaults: ["archetypes = MASTER_DATA / CRUD_RESOURCE / MASTER_DATA", "exposure.admin = create / get / list / update / delete", "surfaces = admin", "string.length = 255", "decimal.precision / scale = 18 / 2"],
    },
    questions,
    nfr: { hints, unknown: topics.filter((topic) => !hints.some((hint) => hint.topic === topic)) },
    tech: techHints(data.items),
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "domain-spec.draft.yaml"), `# 领域草案（需求读取 r${revision} 生成，候选；archetypes / exposure 为缺省值，确认单上可改）\n${dumpYaml(built.raw, { lineWidth: 160, noRefs: true })}`, "utf8");
  writeFileSync(join(outDir, "business.md"), businessMarkdown(draft), "utf8");
  writeJsonAtomic(draftPath, draft);
  const result = summary(draft, false, outRel);
  const human = [
    `草案已生成（需求读取 r${revision} → ${outRel}）`,
    `业务模块 ${result.modules} 个；领域草案 ${result.entities} 个实体（${draft.domain.validated ? (draft.domain.ok ? "校验通过" : `校验有 ${draft.domain.issues.filter((issue) => issue.severity === "error").length} 个错误`) : "未校验"}）`,
    `歧义 ${result.questions} 条（BLOCKING_AUTHORITY ${questions.filter((question) => question.classification === "BLOCKING_AUTHORITY").length}、SCOPE ${questions.filter((question) => question.classification === "SCOPE").length}）；非功能线索 ${result.nfr_hints} 条，未定：${draft.nfr.unknown.join("、") || "无"}`,
    ...draft.tech.filter((hint) => hint.support === "unsupported" || hint.support === "partial").map((hint) => `  技术线索 ${hint.label}「${hint.value}」：${hint.support}——${hint.support_reason}`),
  ];
  return okOutcome("intake draft", result, human, warnings);
}

function summary(draft: IntakeDraft, noChange: boolean, outDir: string): IntakeDraftResult {
  return {
    workspace: draft.workspace,
    revision: draft.revision,
    no_change: noChange,
    out_dir: outDir,
    modules: draft.business.length,
    entities: draft.domain.entities,
    domain_ok: draft.domain.ok,
    questions: draft.questions.length,
    nfr_hints: draft.nfr.hints.length,
    tech_hints: draft.tech.length,
  };
}
