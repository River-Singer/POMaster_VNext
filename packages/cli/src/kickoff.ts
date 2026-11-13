/**
 * kickoff.ts —— 启动确认单（code-spec kickoff；IN-2a / D-3 / D-4）：两个人工点里的第一个。
 *
 * 把读取阶段的草案（IN-1b）、工具链回执（INIT-C）和签名人登记（AP-0a）组织成一张确认单，Owner 签一次
 * （trust kind = kickoff），然后一次可恢复的落库把签过的内容放到位：
 * - `kickoff draft`：生成 / 刷新 `.pomaster/kickoff/<KO-…>/sheet.json`（被签的字节）+ `sheet.md`（给人读）
 *   + `preflight.json`（预检，不进签名——环境会变，不能让它把确认单弄旧）；Owner 的修改写在 `choices.yaml`，
 *   重新 draft 时保留；
 * - `kickoff status`：纯读，列出签名前还差什么；
 * - `kickoff confirm --signoff`：核验签名 → 先写 apply.json 记下签发 → 逐步落库（领域规格并确认、技术栈键、
 *   答案 / 阈值 / 自主边界）→ 最后写 current.json。只有 current.json 才表示启动确认生效；中途崩溃重跑续做。
 *
 * 不做：整体 baseline confirm、设计样式选择（IN-2b）、开工派发（AP-2）。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { load as loadYaml } from "js-yaml";
import type { CliError, CliWarning } from "./envelope.js";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { runBaselineSet, STACK_KEYS, STACK_VALUE_PATTERN } from "./baseline.js";
import { architectureAnswers, type ArchitectureId } from "./architecture-profile.js";
import { INTAKE_DRAFT_GENERATOR, INTAKE_DRAFT_SCHEMA, type IntakeDraft } from "./intake-draft.js";
import { loadIntakeLatest, runIntakeCheck } from "./intake.js";
import { requireInitialized } from "./permit.js";
import { loadCatalogArchetypes, resolveCatalogRoot } from "@pomaster/kernel";
import { assessScaffoldSpec, runScaffoldConfirm, scaffoldSemanticDigest } from "./scaffold-governance.js";
import { readDomainSpecFile, validateDomainSpec, type ArchetypeCatalogEntry } from "./scaffold-spec.js";
import { SCAFFOLD_DIR_RELATIVE, SCAFFOLD_DOMAIN_SPEC_RELATIVE } from "./store-layout.js";
import { loadToolchainReceipt, quoteForCmd } from "./toolchain.js";
import { assuranceOf, fileSha256, loadRegistry, verifySignoff, type SignoffRecord, type TrustEnv } from "./trust.js";

export const KICKOFF_DIR = ".pomaster/kickoff";
export const KICKOFF_SHEET_SCHEMA = "pomaster.kickoff-sheet/v1";
export const KICKOFF_APPLY_SCHEMA = "pomaster.kickoff-apply/v1";
export const KICKOFF_CURRENT_SCHEMA = "pomaster.kickoff-current/v1";

const DEFAULT_ALLOW = [
  "在已确认的领域模型内给类、字段、接口起名",
  "在设计规范内决定页面布局与交互细节",
  "生成与维护测试数据",
  "按已确认的技术基线选择实现方式",
] as const;
const DEFAULT_STOP = [
  "改变本轮范围（加 / 减模块或场景）",
  "破坏性的数据结构变更",
  "引入新的外部依赖、外部服务或付费资源",
  "需要任何凭据、密钥或账号",
  "确认单上阻断类问题覆盖到的决定",
] as const;
const DEFAULT_VALID_DAYS = 14;
const DEFAULT_MAX_REWORK = 3;

/** 后端脚手架模板集（scaffold-backend：Java + Spring Boot + MyBatis-Plus + MySQL）。 */
const SCAFFOLD_BACKEND = [
  { key: "language", value: "java" },
  { key: "framework", value: "spring-boot" },
  { key: "persistence", value: "mybatis-plus" },
  { key: "database", value: "mysql" },
  { key: "cache", value: "none" },
] as const;

/** 材料里技术栈文字 → 基线键（只认常见写法，认不出的整段放进 framework，不猜）。 */
const STACK_WORDS: ReadonlyArray<{ lane: "frontend" | "backend"; key: string; pattern: RegExp; value: string }> = [
  { lane: "frontend", key: "framework", pattern: /\bangular\b/i, value: "angular" },
  { lane: "frontend", key: "framework", pattern: /\bsvelte\b/i, value: "svelte" },
  { lane: "frontend", key: "framework", pattern: /\bsolid(js)?\b/i, value: "solid-js" },
  { lane: "frontend", key: "framework", pattern: /\bjquery\b/i, value: "jquery" },
  { lane: "backend", key: "language", pattern: /\bpython\b/i, value: "python" },
  { lane: "backend", key: "framework", pattern: /\bfastapi\b/i, value: "fastapi" },
  { lane: "backend", key: "framework", pattern: /\bdjango\b/i, value: "django" },
  { lane: "backend", key: "framework", pattern: /\bflask\b/i, value: "flask" },
  { lane: "backend", key: "language", pattern: /\bjava\b/i, value: "java" },
  { lane: "backend", key: "framework", pattern: /\bspring\b/i, value: "spring-boot" },
  { lane: "backend", key: "language", pattern: /\b(node(\.js)?|typescript)\b/i, value: "typescript" },
  { lane: "backend", key: "framework", pattern: /\bnest(js)?\b/i, value: "nestjs" },
  { lane: "backend", key: "framework", pattern: /\bexpress\b/i, value: "express" },
  { lane: "backend", key: "language", pattern: /\bgo(lang)?\b/i, value: "go" },
  { lane: "backend", key: "database", pattern: /\bmysql\b/i, value: "mysql" },
  { lane: "backend", key: "database", pattern: /\bpostgres(ql)?\b/i, value: "postgresql" },
  { lane: "backend", key: "database", pattern: /\b(sql ?server|mssql)\b/i, value: "sqlserver" },
  { lane: "backend", key: "database", pattern: /\boracle\b/i, value: "oracle" },
  { lane: "backend", key: "database", pattern: /\bsqlite\b/i, value: "sqlite" },
];

export interface KickoffEnv {
  readonly trust?: TrustEnv;
  /** 预检探针：跑一条命令，返回是否成功与首行输出。测试注入。 */
  readonly probe?: (command: string, args: readonly string[]) => { ok: boolean; output: string };
}

export interface KickoffChoices {
  readonly answers: Readonly<Record<string, string>>;
  /** `<lane>.<key>` → 值（覆盖推荐）。 */
  readonly stack: Readonly<Record<string, string>>;
  /** 材料要求脚手架不支持的栈时必须选：material = 按材料（后端手写）；scaffold = 改用脚手架默认栈。 */
  readonly stack_decision: Readonly<Partial<Record<"frontend" | "backend", "material" | "scaffold">>>;
  readonly thresholds: Readonly<Record<string, string>>;
  readonly exclude_modules: readonly string[];
  readonly autonomy: { readonly allow?: readonly string[]; readonly stop?: readonly string[] };
  readonly budget: { readonly valid_days?: number; readonly max_rework_rounds?: number };
}

const EMPTY_CHOICES: KickoffChoices = { answers: {}, stack: {}, stack_decision: {}, thresholds: {}, exclude_modules: [], autonomy: {}, budget: {} };

export interface SheetQuestion {
  readonly key: string;
  readonly draft_id: string;
  readonly classification: string;
  readonly topic: string;
  readonly module: string | null;
  readonly question: string;
  readonly default: string;
  readonly answer: string | null;
  readonly items: readonly string[];
}

export interface StackEntry {
  readonly key: string;
  readonly value: string;
  readonly source: string;
}

export interface StackLane {
  readonly recommended: readonly StackEntry[];
  readonly material: { readonly id: string; readonly value: string; readonly support: string; readonly reason: string } | null;
  readonly decision: "material" | "scaffold" | "required" | null;
}

export interface KickoffSheet {
  readonly schema: string;
  readonly id: string;
  readonly workspace: string;
  readonly revision: number;
  readonly business: ReadonlyArray<{
    readonly module: string;
    readonly key: string;
    readonly name: string;
    readonly purpose: readonly string[];
    readonly roles: readonly string[];
    readonly scenarios: readonly string[];
    readonly key_rules: Readonly<Record<string, ReadonlyArray<{ id: string; text: string }>>>;
  }>;
  readonly scope: { readonly in: readonly string[]; readonly out: ReadonlyArray<{ key: string; reason: string }> };
  readonly questions: readonly SheetQuestion[];
  readonly stack: { readonly architecture: ArchitectureId; readonly frontend: StackLane; readonly backend: StackLane };
  readonly domain: { readonly file: string; readonly sha256: string; readonly entities: number; readonly validated: boolean; readonly defaults: readonly string[] };
  readonly thresholds: ReadonlyArray<{ topic: string; value: string | null; source: string }>;
  readonly autonomy: { readonly allow: readonly string[]; readonly stop: readonly string[] };
  readonly budget: { readonly valid_days: number; readonly max_rework_rounds: number; readonly stop_on: readonly string[] };
  readonly signers: ReadonlyArray<{ principal: string; fingerprint: string; bootstrap: boolean }>;
  readonly provenance: { readonly draft_sha256: string; readonly choices_sha256: string };
}

export interface PreflightItem {
  readonly item: string;
  readonly status: "pass" | "fail" | "unknown";
  readonly detail: string;
  readonly who: "human" | "agent" | "host";
  readonly fix?: string;
}

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const posix = (path: string) => path.split("\\").join("/");

export function questionKey(question: { topic: string; module: string | null; items: readonly string[]; question_zh: string }): string {
  const basis = question.items.length > 0 ? [...question.items].sort().join(",") : question.question_zh;
  return `Q-${sha256(`${question.topic}|${question.module ?? ""}|${basis}`).slice(0, 8)}`;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function asStringRecord(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== null && entry !== undefined && String(entry).trim() !== "").map(([key, entry]) => [key, String(entry).trim()]));
}

export function parseChoices(text: string): { ok: true; choices: KickoffChoices } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = loadYaml(text);
  } catch (error) {
    return { ok: false, error: `choices.yaml 不是合法 YAML：${(error as Error).message}` };
  }
  if (raw === null || raw === undefined) return { ok: true, choices: EMPTY_CHOICES };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "choices.yaml 顶层应是映射" };
  const record = raw as Record<string, unknown>;
  const decision = asStringRecord(record["stack_decision"]);
  for (const [lane, value] of Object.entries(decision)) {
    if ((lane !== "frontend" && lane !== "backend") || (value !== "material" && value !== "scaffold")) return { ok: false, error: `stack_decision.${lane} 只能是 material 或 scaffold` };
  }
  const list = (value: unknown) => (Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter((entry) => entry !== "") : []);
  const autonomy = (record["autonomy"] ?? {}) as Record<string, unknown>;
  const budget = (record["budget"] ?? {}) as Record<string, unknown>;
  const number = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined);
  const validDays = number(budget["valid_days"]);
  const rework = number(budget["max_rework_rounds"]);
  return {
    ok: true,
    choices: {
      answers: asStringRecord(record["answers"]),
      stack: asStringRecord(record["stack"]),
      stack_decision: decision as KickoffChoices["stack_decision"],
      thresholds: asStringRecord(record["thresholds"]),
      exclude_modules: list(record["exclude_modules"]),
      autonomy: { ...(Array.isArray(autonomy["allow"]) ? { allow: list(autonomy["allow"]) } : {}), ...(Array.isArray(autonomy["stop"]) ? { stop: list(autonomy["stop"]) } : {}) },
      budget: { ...(validDays !== undefined ? { valid_days: validDays } : {}), ...(rework !== undefined ? { max_rework_rounds: rework } : {}) },
    },
  };
}

function choicesTemplate(questions: readonly SheetQuestion[], needDecision: readonly string[]): string {
  const lines = [
    "# 启动确认单的修改都写在这里；改完跑 pomaster kickoff draft 刷新确认单。",
    "# 这个文件不会被覆盖。确认单会把它的摘要写进签名内容，所以签之后不要再改。",
    "",
    "# 问题的答案：键是确认单上的 Q-… 编号。阻断类（BLOCKING_AUTHORITY）必须答，其他不答就按缺省处置。",
    "answers:",
    ...questions.map((question) => `  # ${question.key}（${question.classification}）${question.question.slice(0, 80).replace(/\n/g, " ")}\n  #   缺省：${question.default}\n  # ${question.key}: ""`),
    "",
    "# 材料要求的技术栈脚手架不支持时必须选一个：material = 按材料（这一层手写）；scaffold = 改用脚手架默认栈。",
    `stack_decision: {}${needDecision.length > 0 ? `   # 需要选：${needDecision.join("、")}` : ""}`,
    "",
    "# 覆盖推荐的技术栈键，写成 <lane>.<key>: <值>，例如 backend.database: postgresql",
    "stack: {}",
    "",
    "# 非功能阈值，例如 response_time: 500ms、concurrency: 200 人、capacity: 10000 条",
    "thresholds: {}",
    "",
    "# 本轮不做的模块（写模块键，例如 03-forecast）",
    "exclude_modules: []",
    "",
    "# 自主边界：不写就用确认单上的缺省；写了就整段替换",
    "autonomy: {}",
    "",
    `# 预算与有效期（缺省 valid_days: ${DEFAULT_VALID_DAYS}，max_rework_rounds: ${DEFAULT_MAX_REWORK}）`,
    "budget: {}",
    "",
  ];
  return lines.join("\n");
}

function architectureOf(hintValue: string | undefined): ArchitectureId {
  return hintValue !== undefined && /\breact\b/i.test(hintValue) ? "react" : "vue";
}

/** 框架隐含的语言（材料只写了框架名时补上语言键）。 */
const FRAMEWORK_LANGUAGE: Readonly<Record<string, string>> = { fastapi: "python", django: "python", flask: "python", "spring-boot": "java", nestjs: "typescript", express: "typescript" };

function stackFromText(lane: "frontend" | "backend", text: string): StackEntry[] {
  const out: StackEntry[] = [];
  for (const word of STACK_WORDS.filter((entry) => entry.lane === lane)) {
    if (word.pattern.test(text) && !out.some((entry) => entry.key === word.key)) out.push({ key: word.key, value: word.value, source: "material" });
  }
  const framework = out.find((entry) => entry.key === "framework")?.value;
  const implied = framework !== undefined ? FRAMEWORK_LANGUAGE[framework] : undefined;
  if (implied !== undefined && !out.some((entry) => entry.key === "language")) out.unshift({ key: "language", value: implied, source: "material" });
  return out;
}

/** Owner 在 choices.yaml 里写的栈覆盖：键必须在基线键集闭包里、值要符合 baseline set 的词形。 */
function invalidStackOverrides(choices: KickoffChoices): string[] {
  const problems: string[] = [];
  for (const [path, value] of Object.entries(choices.stack)) {
    const [lane, key, ...rest] = path.split(".");
    if ((lane !== "frontend" && lane !== "backend") || key === undefined || rest.length > 0 || !STACK_KEYS[lane].includes(key)) {
      problems.push(`choices.yaml 的 stack.${path} 不是合法的基线键（frontend：${STACK_KEYS.frontend.join(" / ")}；backend：${STACK_KEYS.backend.join(" / ")}）`);
    } else if (!STACK_VALUE_PATTERN.test(value)) {
      problems.push(`choices.yaml 的 stack.${path} 值「${value}」词形不对（英文字母或数字开头，可含空格 _ . / + # ( ) -）`);
    }
  }
  return problems;
}

function buildStack(draft: IntakeDraft, choices: KickoffChoices): { stack: KickoffSheet["stack"]; unresolved: string[] } {
  const hint = (lane: "frontend" | "backend") => draft.tech.find((entry) => entry.lane === lane && entry.support !== "n/a");
  const front = hint("frontend");
  const back = hint("backend");
  const database = draft.tech.find((entry) => entry.lane === "database");
  const architecture = architectureOf(front?.value);
  const unresolved: string[] = invalidStackOverrides(choices);
  const lane = (name: "frontend" | "backend", material: typeof front, scaffold: StackEntry[]): StackLane => {
    const unsupported = material !== undefined && material.support === "unsupported";
    const decided = choices.stack_decision[name];
    const decision: StackLane["decision"] = unsupported ? decided ?? "required" : null;
    if (decision === "required") unresolved.push(`${name === "backend" ? "后端" : "前端"}栈：材料要的是「${material?.value}」，脚手架不支持——在 choices.yaml 里写 stack_decision.${name}: material 或 scaffold`);
    let entries = scaffold;
    if (unsupported && decided === "material") {
      const fromMaterial = stackFromText(name, material?.value ?? "").map((entry) => ({ ...entry, source: `material:${material?.id}` }));
      entries = [...fromMaterial, ...scaffold.filter((entry) => !fromMaterial.some((other) => other.key === entry.key) && entry.key !== "persistence").map((entry) => ({ ...entry, value: "未定", source: "undetermined" }))];
    }
    if (name === "backend" && database !== undefined) {
      const db = stackFromText("backend", database.value).find((entry) => entry.key === "database");
      if (db !== undefined) entries = entries.map((entry) => (entry.key === "database" ? { ...db, source: `material:${database.id}` } : entry));
    }
    entries = entries.map((entry) => {
      const override = choices.stack[`${name}.${entry.key}`];
      return override !== undefined ? { key: entry.key, value: override, source: "owner" } : entry;
    });
    for (const [path, value] of Object.entries(choices.stack)) {
      const [laneName, key] = path.split(".");
      if (laneName === name && key !== undefined && STACK_KEYS[name].includes(key) && !entries.some((entry) => entry.key === key)) entries = [...entries, { key, value, source: "owner" }];
    }
    return {
      recommended: entries,
      material: material === undefined ? null : { id: material.id, value: material.value, support: material.support, reason: material.support_reason },
      decision,
    };
  };
  const frontendDefaults = architectureAnswers(architecture).filter((answer) => answer.lane === "frontend").map((answer) => ({ key: answer.key, value: answer.value, source: "scaffold-default" }));
  const backendDefaults = SCAFFOLD_BACKEND.map((entry) => ({ ...entry, source: "scaffold-default" }));
  return { stack: { architecture, frontend: lane("frontend", front, frontendDefaults), backend: lane("backend", back, backendDefaults) }, unresolved };
}

interface Context {
  readonly dir: string;
  readonly workspace: string;
  readonly wsDir: string;
  readonly revision: number;
  readonly draft: IntakeDraft;
  readonly draftBytes: Buffer;
  readonly domainPath: string;
  readonly nonGoals: ReadonlyArray<{ id: string; text: string; module: string }>;
}

type Prepared = { ok: true; ctx: Context } | { ok: false; errors: CliError[] };

/** 读取阶段是否就绪：intake check 通过、草案对应最新修订与判读。 */
function prepare(dir: string, name: string | undefined): Prepared {
  const loaded = loadIntakeLatest(dir, name);
  if (!loaded.ok) return { ok: false, errors: loaded.errors.map((error) => ({ ...error, code: error.code === "INTAKE_WORKSPACE_NOT_FOUND" ? "KICKOFF_INTAKE_MISSING" : error.code })) };
  const check = runIntakeCheck(dir, { name: loaded.workspace.name });
  if (!check.ok) {
    return { ok: false, errors: [{ code: "KICKOFF_INTAKE_NOT_READY", message: `读取还没覆盖完整：${check.errors.map((error) => error.message).join("；")}`, hint: "待判读未清空时不出确认单：pomaster intake pending → intake resolve → intake read → intake draft" }] };
  }
  const draftPath = join(loaded.workspace.dir, "draft", "draft.json");
  const draftBytes = existsSync(draftPath) ? readFileSync(draftPath) : null;
  const draft = draftBytes === null ? null : (readJson<IntakeDraft>(draftPath));
  const revision = loaded.data.files.revision;
  if (draft === null || draftBytes === null) return { ok: false, errors: [{ code: "KICKOFF_INTAKE_MISSING", message: "还没有可签草案", hint: `pomaster intake draft --name ${loaded.workspace.name}` }] };
  if (draft.schema !== INTAKE_DRAFT_SCHEMA || draft.revision !== revision || draft.resolutions_sha256 !== loaded.data.files.resolutions_sha256 || draft.generator !== INTAKE_DRAFT_GENERATOR) {
    return { ok: false, errors: [{ code: "KICKOFF_INTAKE_NOT_READY", message: `草案对应 r${draft.revision}，最新修订是 r${revision}`, hint: `pomaster intake draft --name ${loaded.workspace.name}` }] };
  }
  const nonGoals = loaded.data.items.filter((item) => item.kind === "non_goal").map((item) => ({ id: item.id, text: item.text, module: item.module_key }));
  return { ok: true, ctx: { dir, workspace: loaded.workspace.name, wsDir: loaded.workspace.dir, revision, draft, draftBytes, domainPath: join(loaded.workspace.dir, "draft", "domain-spec.draft.yaml"), nonGoals } };
}

const sheetIdOf = (workspace: string, revision: number) => `KO-${workspace}-r${revision}`;
const sheetDir = (dir: string, id: string) => join(dir, ...KICKOFF_DIR.split("/"), id);

function loadChoicesFile(path: string): { ok: true; choices: KickoffChoices; sha: string } | { ok: false; error: CliError } {
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const parsed = parseChoices(text);
  if (!parsed.ok) return { ok: false, error: { code: "KICKOFF_CHOICES_INVALID", message: parsed.error, hint: "改正 choices.yaml 后重跑 pomaster kickoff draft" } };
  return { ok: true, choices: parsed.choices, sha: sha256(text) };
}

function buildSheet(ctx: Context, choices: KickoffChoices, choicesSha: string): { sheet: KickoffSheet; unresolved: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const draft = ctx.draft;
  const known = new Set(draft.business.map((module) => module.key));
  for (const key of choices.exclude_modules) if (!known.has(key)) warnings.push(`exclude_modules 里的 ${key} 不是本次的模块，已忽略`);
  const excluded = new Set(choices.exclude_modules.filter((key) => known.has(key)));
  if (excluded.size > 0) warnings.push("排除只影响本轮范围与开工；领域草案仍含被排除模块的实体（要从模型里去掉，改材料后重新读取）");
  const business = draft.business
    .filter((module) => !excluded.has(module.key))
    .map((module) => ({
      module: module.module,
      key: module.key,
      name: module.name_zh,
      purpose: module.purpose.map((entry) => entry.text),
      roles: module.roles.map((entry) => entry.text),
      scenarios: module.scenarios.map((entry) => entry.text),
      key_rules: Object.fromEntries(Object.entries(module.key_rules).filter(([, rules]) => rules.length > 0).map(([tag, rules]) => [tag, rules.map((rule) => ({ id: rule.id, text: rule.text }))])),
    }));
  const scopeOut = [
    ...[...excluded].map((key) => ({ key, reason: "Owner 排除出本轮" })),
    ...ctx.nonGoals.map((goal) => ({ key: goal.module, reason: `非目标（${goal.id}）：${goal.text}` })),
  ];
  const questions: SheetQuestion[] = draft.questions
    .filter((question) => question.module === null || !excluded.has(draft.business.find((module) => module.module === question.module)?.key ?? ""))
    .map((question) => {
      const key = questionKey(question);
      return { key, draft_id: question.id, classification: question.classification, topic: question.topic, module: question.module, question: question.question_zh, default: question.default_zh, answer: choices.answers[key] ?? null, items: question.items };
    });
  for (const key of Object.keys(choices.answers)) if (!questions.some((question) => question.key === key)) warnings.push(`answers 里的 ${key} 在本版确认单上没有对应问题，已忽略`);
  const { stack, unresolved } = buildStack(draft, choices);
  for (const question of questions) {
    if (question.classification === "BLOCKING_AUTHORITY" && question.answer === null) unresolved.push(`阻断类问题未答：${question.key} ${question.question.slice(0, 60)}`);
  }
  if (!draft.domain.validated || !draft.domain.ok) unresolved.push("领域草案没通过脚手架校验（或 catalog 不可用未校验）：先修草案，再出确认单");
  const topics = ["performance", "concurrency", "capacity", "response_time", "availability"] as const;
  const thresholds = topics.map((topic) => {
    const owner = choices.thresholds[topic];
    if (owner !== undefined) return { topic, value: owner, source: "owner" };
    const hint = draft.nfr.hints.find((entry) => entry.topic === topic);
    return hint !== undefined ? { topic, value: hint.values.join(" / "), source: `material:${hint.id}` } : { topic, value: null, source: "undetermined" };
  });
  const registry = loadRegistry(ctx.dir);
  if (registry.state !== "ok") unresolved.push(registry.state === "absent" ? "还没有登记签名人：启动确认必须由 Owner 用 SSH 私钥签——pomaster trust enroll" : `签名人登记表不成立：${registry.reason}`);
  const stopOn = [...(choices.autonomy.stop ?? DEFAULT_STOP)];
  const sheet: KickoffSheet = {
    schema: KICKOFF_SHEET_SCHEMA,
    id: sheetIdOf(ctx.workspace, ctx.revision),
    workspace: ctx.workspace,
    revision: ctx.revision,
    business,
    scope: { in: business.map((module) => module.key), out: scopeOut },
    questions,
    stack,
    domain: { file: posix(relative(ctx.dir, ctx.domainPath)), sha256: existsSync(ctx.domainPath) ? fileSha256(ctx.domainPath) : "", entities: draft.domain.entities, validated: draft.domain.validated && draft.domain.ok, defaults: draft.domain.defaults },
    thresholds,
    autonomy: { allow: [...(choices.autonomy.allow ?? DEFAULT_ALLOW)], stop: stopOn },
    budget: { valid_days: choices.budget.valid_days ?? DEFAULT_VALID_DAYS, max_rework_rounds: choices.budget.max_rework_rounds ?? DEFAULT_MAX_REWORK, stop_on: stopOn },
    signers: registry.state === "ok" ? registry.file.signers.map((signer) => ({ principal: signer.principal, fingerprint: signer.fingerprint, bootstrap: signer.bootstrap === true })) : [],
    provenance: { draft_sha256: sha256(ctx.draftBytes), choices_sha256: choicesSha },
  };
  return { sheet, unresolved, warnings };
}

const serialize = (sheet: KickoffSheet) => `${JSON.stringify(sheet, null, 2)}\n`;

function defaultProbe(command: string, args: readonly string[]): { ok: boolean; output: string } {
  const viaShell = process.platform === "win32";
  const result = spawnSync(viaShell ? [command, ...args].map(quoteForCmd).join(" ") : command, viaShell ? [] : [...args], { encoding: "utf8", timeout: 15_000, shell: viaShell, windowsHide: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? "";
  return { ok: result.error === undefined && result.status === 0, output };
}

function preflightOf(ctx: Context, sheet: KickoffSheet, env: KickoffEnv): PreflightItem[] {
  const probe = env.probe ?? defaultProbe;
  const items: PreflightItem[] = [];
  const node = probe("node", ["-v"]);
  items.push({ item: "Node.js", status: node.ok ? "pass" : "fail", detail: node.ok ? node.output : "PATH 上没有 node", who: "human", ...(node.ok ? {} : { fix: "安装 Node.js 22 及以上" }) });
  items.push({ item: "项目已初始化", status: existsSync(join(ctx.dir, ".pomaster", "state")) ? "pass" : "fail", detail: existsSync(join(ctx.dir, ".pomaster", "state")) ? "有治理 store" : "没有 .pomaster/state", who: "agent", ...(existsSync(join(ctx.dir, ".pomaster", "state")) ? {} : { fix: "pomaster init" }) });
  const receipt = loadToolchainReceipt(ctx.dir);
  items.push(
    receipt === null
      ? { item: "全 auto 浏览器工具链", status: "unknown", detail: "还没有核验过", who: "agent", fix: "pomaster tools prepare --check（没装就按推荐执行 pomaster tools prepare）" }
      : { item: "全 auto 浏览器工具链", status: receipt.machine_ready ? "pass" : "fail", detail: receipt.machine_ready ? `lock ${receipt.lock_id} 每层实测通过` : receipt.blockers.filter((blocker) => blocker.who !== "host").map((blocker) => blocker.what).join("；") || "未就绪", who: "human", ...(receipt.machine_ready ? {} : { fix: "pomaster tools prepare（推荐命令，由人或经授权的 agent 执行）" }) },
  );
  for (const blocker of receipt?.blockers.filter((entry) => entry.who === "host") ?? []) items.push({ item: "宿主信任", status: "unknown", detail: blocker.what, who: "host", fix: blocker.fix });
  const registry = loadRegistry(ctx.dir);
  if (registry.state === "ok") {
    for (const [index, signer] of registry.file.signers.entries()) {
      const key = registry.keys[index];
      if (key === undefined) continue;
      const level = assuranceOf(signer, key, env.trust ?? {});
      items.push({ item: `签名人 ${signer.principal}`, status: level.assurance === "strong" ? "pass" : level.assurance === "weak" ? "fail" : "unknown", detail: `${signer.fingerprint}，保障 ${level.assurance}`, who: "human", ...(level.assurance === "strong" ? {} : { fix: "用带口令的私钥且不放进 ssh-agent，或用硬件密钥；登记时加 --private 让 POMaster 检查口令" }) });
    }
  }
  const backend = new Map(sheet.stack.backend.recommended.map((entry) => [entry.key, entry.value]));
  if (/spring/i.test(backend.get("framework") ?? "") || /java/i.test(backend.get("language") ?? "")) {
    const java = probe("java", ["-version"]);
    items.push({ item: "Java", status: java.ok ? "pass" : "fail", detail: java.ok ? java.output : "PATH 上没有 java", who: "human", ...(java.ok ? {} : { fix: "安装 JDK 21" }) });
    const maven = probe("mvn", ["-v"]);
    items.push({ item: "Maven", status: maven.ok ? "pass" : "fail", detail: maven.ok ? maven.output : "PATH 上没有 mvn", who: "human", ...(maven.ok ? {} : { fix: "安装 Maven 3.9+" }) });
  }
  const database = backend.get("database");
  if (database !== undefined && database !== "none" && database !== "未定") {
    const docker = probe("docker", ["version", "--format", "{{.Server.Version}}"]);
    items.push({ item: `数据库运行环境（${database}）`, status: docker.ok ? "pass" : "unknown", detail: docker.ok ? `Docker ${docker.output}` : "没有可用的 Docker：数据库需要另行提供", who: "human", ...(docker.ok ? {} : { fix: "启动 Docker，或提供可连接的数据库地址" }) });
  }
  return items;
}

function renderMarkdown(sheet: KickoffSheet, unresolved: readonly string[], preflight: readonly PreflightItem[]): string {
  const out: string[] = [`# 启动确认单 ${sheet.id}`, "", `需求读取工作区 ${sheet.workspace}，修订 r${sheet.revision}。签名对象是同目录的 sheet.json；本文件是它的阅读版。`, ""];
  out.push("## 1. 业务", "");
  for (const module of sheet.business) {
    out.push(`### ${module.name}（${module.key}）`);
    if (module.purpose.length > 0) out.push(`- 用途：${module.purpose.join("；")}`);
    if (module.roles.length > 0) out.push(`- 角色：${module.roles.join("；")}`);
    for (const scenario of module.scenarios) out.push(`- 场景：${scenario}`);
    // 一条规则可能打了几个标签：阅读版每条只列一次，标签并列
    const rules = new Map<string, { text: string; tags: string[] }>();
    for (const [tag, list] of Object.entries(module.key_rules)) for (const rule of list) rules.set(rule.id, { text: rule.text, tags: [...(rules.get(rule.id)?.tags ?? []), tag] });
    for (const [ruleId, rule] of rules) out.push(`- 规则（${rule.tags.join(" / ")}，${ruleId}）：${rule.text}`);
    out.push("");
  }
  out.push(`本轮范围：${sheet.scope.in.join("、") || "（无）"}`);
  for (const entry of sheet.scope.out) out.push(`- 不做：${entry.key}——${entry.reason}`);
  out.push("", "## 2. 问题", "");
  for (const question of sheet.questions) out.push(`- ${question.key}（${question.classification}）${question.question}\n  - ${question.answer !== null ? `答：${question.answer}` : `未答，缺省：${question.default}`}`);
  out.push("", `## 3. 技术基线（架构 ${sheet.stack.architecture}）`, "");
  for (const lane of ["frontend", "backend"] as const) {
    const entry = sheet.stack[lane];
    out.push(`### ${lane === "frontend" ? "前端" : "后端"}`);
    if (entry.material !== null) out.push(`- 材料（${entry.material.id}）：${entry.material.value}——脚手架${entry.material.support === "supported" ? "支持" : entry.material.support === "partial" ? "部分支持" : "不支持"}。${entry.material.reason}`);
    if (entry.decision !== null) out.push(`- 选择：${entry.decision === "required" ? "必须选（choices.yaml 的 stack_decision）" : entry.decision === "material" ? "按材料（这一层手写）" : "改用脚手架默认栈"}`);
    for (const key of entry.recommended) out.push(`- ${key.key}: ${key.value}（${key.source}）`);
    out.push("");
  }
  out.push("## 4. 领域", "", `- 草案 ${sheet.domain.file}（sha256 ${sheet.domain.sha256.slice(0, 12)}…），${sheet.domain.entities} 个实体，${sheet.domain.validated ? "已通过脚手架校验" : "未通过校验"}`, ...sheet.domain.defaults.map((entry) => `- 缺省：${entry}`), "");
  out.push("## 5. 非功能阈值", "", ...sheet.thresholds.map((entry) => `- ${entry.topic}：${entry.value ?? "未定"}（${entry.source}）`), "");
  out.push("## 6. 自主边界", "", ...sheet.autonomy.allow.map((entry) => `- 可以自己决定：${entry}`), ...sheet.autonomy.stop.map((entry) => `- 必须停下来问：${entry}`), "");
  out.push("## 7. 预算与有效期", "", `- 有效 ${sheet.budget.valid_days} 天；同一处返工最多 ${sheet.budget.max_rework_rounds} 轮`, "");
  out.push("## 8. 预检（不在签名范围内，签之前看一眼）", "", ...preflight.map((item) => `- ${item.status === "pass" ? "✓" : item.status === "fail" ? "✗" : "?"} ${item.item}：${item.detail}${item.fix !== undefined ? `——${item.fix}` : ""}`), "");
  out.push("## 9. 签名人", "");
  if (sheet.signers.length === 0) out.push("- （还没有登记：pomaster trust enroll --key <你的公钥.pub> --principal <名字>）", "");
  else out.push(...sheet.signers.map((signer) => `- ${signer.bootstrap ? "★ " : ""}${signer.principal} ${signer.fingerprint}`), ...(sheet.signers.some((signer) => signer.bootstrap) ? ["", "★ = 首次信任登记：请确认这就是你自己的密钥。"] : []), "");
  out.push(unresolved.length > 0 ? "## 签名前还差" : "## 可以签了", "");
  if (unresolved.length > 0) out.push(...unresolved.map((entry) => `- ${entry}`));
  else out.push(`1. pomaster trust request kickoff --subject ${KICKOFF_DIR}/${sheet.id}/sheet.json`, "2. 在你自己的终端：ssh-keygen -Y sign -f <你的私钥> -n pomaster .pomaster/trust/requests/<SO-…>.json", "3. pomaster kickoff confirm --signoff <SO-…>");
  return `${out.join("\n")}\n`;
}

export interface KickoffDraftResult {
  readonly id: string;
  readonly change: "CREATED" | "UPDATED" | "NO_CHANGE";
  readonly ready: boolean;
  readonly unresolved: readonly string[];
  readonly sheet_sha256: string;
  readonly preflight: readonly PreflightItem[];
}

/** 上一版确认单的 choices.yaml（同工作区、修订更早的里最新的一份）。 */
function previousChoices(dir: string, workspace: string, revision: number): string | null {
  const root = join(dir, ...KICKOFF_DIR.split("/"));
  if (!existsSync(root)) return null;
  const prefix = `KO-${workspace}-r`;
  const older = readdirSync(root)
    .filter((name) => name.startsWith(prefix) && Number(name.slice(prefix.length)) < revision)
    .sort((left, right) => Number(right.slice(prefix.length)) - Number(left.slice(prefix.length)));
  for (const name of older) {
    const path = join(root, name, "choices.yaml");
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return null;
}

export function runKickoffDraft(dir: string, input: { readonly name?: string }, env: KickoffEnv = {}): CommandOutcome<KickoffDraftResult | null> {
  const prepared = prepare(dir, input.name);
  if (!prepared.ok) return failOutcome("kickoff draft", null, prepared.errors, prepared.errors.map((error) => `kickoff draft: FAILED — ${error.code}：${error.message}`));
  const ctx = prepared.ctx;
  const id = sheetIdOf(ctx.workspace, ctx.revision);
  const outDir = sheetDir(dir, id);
  mkdirSync(outDir, { recursive: true });
  const choicesPath = join(outDir, "choices.yaml");
  if (!existsSync(choicesPath)) {
    const seeded = previousChoices(dir, ctx.workspace, ctx.revision);
    if (seeded !== null) writeFileSync(choicesPath, seeded, "utf8");
    else {
      const probe = buildSheet(ctx, EMPTY_CHOICES, sha256(""));
      writeFileSync(choicesPath, choicesTemplate(probe.sheet.questions, (["frontend", "backend"] as const).filter((lane) => probe.sheet.stack[lane].decision === "required")), "utf8");
    }
  }
  const choices = loadChoicesFile(choicesPath);
  if (!choices.ok) return failOutcome("kickoff draft", null, [choices.error], [`kickoff draft: FAILED — ${choices.error.code}：${choices.error.message}`]);
  const { sheet, unresolved, warnings } = buildSheet(ctx, choices.choices, choices.sha);
  const text = serialize(sheet);
  const sheetPath = join(outDir, "sheet.json");
  const before = existsSync(sheetPath) ? readFileSync(sheetPath, "utf8") : null;
  const change: KickoffDraftResult["change"] = before === null ? "CREATED" : before === text ? "NO_CHANGE" : "UPDATED";
  if (change !== "NO_CHANGE") writeFileSync(sheetPath, text, "utf8");
  const preflight = preflightOf(ctx, sheet, env);
  writeFileSync(join(outDir, "preflight.json"), `${JSON.stringify({ schema: "pomaster.kickoff-preflight/v1", sheet: id, items: preflight }, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "sheet.md"), renderMarkdown(sheet, unresolved, preflight), "utf8");
  const rel = posix(relative(dir, outDir));
  const result: KickoffDraftResult = { id, change, ready: unresolved.length === 0, unresolved, sheet_sha256: sha256(text), preflight };
  const cliWarnings: CliWarning[] = warnings.map((message) => ({ code: "KICKOFF_CHOICES_IGNORED", message }));
  return okOutcome(
    "kickoff draft",
    result,
    [
      `kickoff draft: ${change} — ${id}（${rel}/sheet.md）`,
      `  ${sheet.business.length} 个模块、${sheet.questions.length} 个问题（阻断类 ${sheet.questions.filter((question) => question.classification === "BLOCKING_AUTHORITY").length}）、架构 ${sheet.stack.architecture}`,
      `  预检：${preflight.filter((item) => item.status === "pass").length} 过、${preflight.filter((item) => item.status === "fail").length} 不过、${preflight.filter((item) => item.status === "unknown").length} 未知（不挡签名，挡全 auto 就绪）`,
      ...(unresolved.length > 0 ? ["  签名前还差：", ...unresolved.map((entry) => `    - ${entry}`), `  改 ${rel}/choices.yaml 后重跑 pomaster kickoff draft`] : ["  可以签了：", `    pomaster trust request kickoff --subject ${rel}/sheet.json`, "    （在你自己的终端用 ssh-keygen -Y sign 签名）", "    pomaster kickoff confirm --signoff <SO-…>"]),
    ],
    cliWarnings,
  );
}

interface ApplyJournal {
  readonly schema: string;
  readonly sheet: string;
  readonly sheet_sha256: string;
  readonly signoff: SignoffRecord;
  readonly steps: Record<string, "done">;
  /** 本次落库取代的未完成落库（换了修订或改了 choices 后重签）。 */
  readonly supersedes?: ReadonlyArray<{ readonly sheet: string; readonly sheet_sha256: string; readonly signoff: string | null }>;
  readonly committed?: boolean;
  readonly superseded_by?: string;
}

/**
 * 项目里已有一份字节不同的领域规格时，什么情况下可以用草案替换：
 * - 已确认的：语义相同（只差注释 / 格式）可以，语义变了要走变更通道；
 * - 没确认的：只有是之前某份启动确认单落库时写的才可以，别人手写的不覆盖。
 */
async function domainConflict(dir: string, draftPath: string): Promise<CliError | null> {
  const specPath = join(dir, ...SCAFFOLD_DOMAIN_SPEC_RELATIVE.split("/"));
  if (!existsSync(specPath)) return null;
  const existingSha = sha256(readFileSync(specPath));
  if (existingSha === sha256(readFileSync(draftPath))) return null;
  const assessment = await assessScaffoldSpec(dir);
  if (!("state" in assessment)) return assessment;
  const record = assessment.record;
  if (record !== null) {
    if (draftSemanticDigest(draftPath) === record.current.semantic_sha256) return null;
    return { code: "KICKOFF_DOMAIN_CONFLICT", message: `项目里已有确认过的另一份领域规格（${SCAFFOLD_DOMAIN_SPEC_RELATIVE}），草案的领域模型和它不同`, hint: "改已确认的规格要走变更：pomaster scaffold confirm --change <CHANGE-id>" };
  }
  const ours = readdirSync(join(dir, ...KICKOFF_DIR.split("/"))).some((name) => name.startsWith("KO-") && readJson<KickoffSheet>(join(sheetDir(dir, name), "sheet.json"))?.domain.sha256 === existingSha);
  if (ours) return null;
  return { code: "KICKOFF_DOMAIN_CONFLICT", message: `项目里已有一份没确认过的领域规格（${SCAFFOLD_DOMAIN_SPEC_RELATIVE}），不覆盖`, hint: "这份手写规格要用就把内容放进需求材料重新读取；不用就挪走它" };
}

/** 草案的语义摘要（与 scaffold confirm 判漂移同一算法）；草案不通过校验时 null。 */
function draftSemanticDigest(draftPath: string): string | null {
  const loaded = readDomainSpecFile(draftPath);
  if (!loaded.ok) return null;
  let catalog: ArchetypeCatalogEntry[];
  try {
    catalog = loadCatalogArchetypes(resolveCatalogRoot(undefined)).map((material) => ({ id: material.id, operations: material.operations }));
  } catch {
    return null;
  }
  const validation = validateDomainSpec(loaded.raw, catalog);
  return validation.ok && validation.spec !== null ? scaffoldSemanticDigest(validation.spec) : null;
}

/** 签过、开始落库、但既没提交也没被取代的确认单。 */
function pendingApplies(dir: string): Array<{ id: string; journal: ApplyJournal }> {
  const root = join(dir, ...KICKOFF_DIR.split("/"));
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.startsWith("KO-"))
    .map((name) => ({ id: name, journal: readJson<ApplyJournal>(join(root, name, "apply.json")) }))
    .filter((entry): entry is { id: string; journal: ApplyJournal } => entry.journal !== null && entry.journal.committed !== true && entry.journal.superseded_by === undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export interface KickoffStatusResult {
  readonly id: string | null;
  readonly ready: boolean;
  readonly stale: boolean;
  readonly unresolved: readonly string[];
  readonly apply_pending: readonly string[];
  readonly current: { readonly sheet: string; readonly valid_until: string } | null;
}

export function runKickoffStatus(dir: string, input: { readonly name?: string }): CommandOutcome<KickoffStatusResult | null> {
  const current = readJson<{ sheet: string; valid_until: string; schema: string }>(join(dir, ...KICKOFF_DIR.split("/"), "current.json"));
  const currentInfo = current?.schema === KICKOFF_CURRENT_SCHEMA ? { sheet: current.sheet, valid_until: current.valid_until } : null;
  const pending = pendingApplies(dir).map((entry) => entry.id);
  const prepared = prepare(dir, input.name);
  if (!prepared.ok) {
    const result: KickoffStatusResult = { id: null, ready: false, stale: false, unresolved: prepared.errors.map((error) => error.message), apply_pending: pending, current: currentInfo };
    return okOutcome("kickoff status", result, [`kickoff status: 读取未就绪——${prepared.errors.map((error) => error.message).join("；")}`, ...(currentInfo !== null ? [`  生效中的启动确认：${currentInfo.sheet}（至 ${currentInfo.valid_until}）`] : [])]);
  }
  const ctx = prepared.ctx;
  const id = sheetIdOf(ctx.workspace, ctx.revision);
  const outDir = sheetDir(dir, id);
  const choices = loadChoicesFile(join(outDir, "choices.yaml"));
  const built = choices.ok ? buildSheet(ctx, choices.choices, choices.sha) : null;
  const onDisk = existsSync(join(outDir, "sheet.json")) ? readFileSync(join(outDir, "sheet.json"), "utf8") : null;
  const stale = built === null || onDisk === null || onDisk !== serialize(built.sheet);
  const unresolved = [...(built?.unresolved ?? []), ...(choices.ok ? [] : [choices.error.message]), ...(stale ? ["确认单不是最新：跑 pomaster kickoff draft"] : [])];
  const result: KickoffStatusResult = { id, ready: unresolved.length === 0, stale, unresolved, apply_pending: pending, current: currentInfo };
  return okOutcome("kickoff status", result, [
    `kickoff status: ${id} ${result.ready ? "可以签" : "还不能签"}`,
    ...unresolved.map((entry) => `  - ${entry}`),
    ...(pending.length > 0 ? [`  落库中断未完成：${pending.join("、")}——重跑 pomaster kickoff confirm 续做（换了修订就签新确认单，它会取代旧的）`] : []),
    ...(currentInfo !== null ? [`  生效中的启动确认：${currentInfo.sheet}（至 ${currentInfo.valid_until}）`] : ["  还没有生效的启动确认"]),
  ]);
}

export interface KickoffConfirmResult {
  readonly id: string;
  readonly change: "CONFIRMED" | "RESUMED" | "NO_CHANGE";
  readonly signoff: SignoffRecord;
  readonly steps: Readonly<Record<string, "done">>;
  readonly valid_until: string;
}

export async function runKickoffConfirm(dir: string, input: { readonly name?: string; readonly signoff?: string }, env: KickoffEnv = {}): Promise<CommandOutcome<KickoffConfirmResult | null>> {
  const fail = (errors: CliError[]) => failOutcome<KickoffConfirmResult | null>("kickoff confirm", null, errors, errors.map((error) => `kickoff confirm: FAILED — ${error.code}：${error.message}${error.hint !== undefined ? `\n  hint: ${error.hint}` : ""}`));
  const prepared = prepare(dir, input.name);
  if (!prepared.ok) return fail(prepared.errors);
  const ctx = prepared.ctx;
  const id = sheetIdOf(ctx.workspace, ctx.revision);
  const outDir = sheetDir(dir, id);
  const sheetPath = join(outDir, "sheet.json");
  const choices = loadChoicesFile(join(outDir, "choices.yaml"));
  if (!choices.ok) return fail([choices.error]);
  const built = buildSheet(ctx, choices.choices, choices.sha);
  if (!existsSync(sheetPath) || readFileSync(sheetPath, "utf8") !== serialize(built.sheet)) {
    return fail([{ code: "KICKOFF_SHEET_STALE", message: `确认单 ${id} 不是最新（材料、草案或 choices.yaml 变了）`, hint: "pomaster kickoff draft 刷新后重新签" }]);
  }
  const currentPath = join(dir, ...KICKOFF_DIR.split("/"), "current.json");
  const current = readJson<{ sheet: string; sheet_sha256: string; valid_until: string }>(currentPath);
  const sheetSha = fileSha256(sheetPath);
  if (current?.sheet === id && current.sheet_sha256 === sheetSha) {
    const journal = readJson<ApplyJournal>(join(outDir, "apply.json"));
    if (journal !== null) return okOutcome("kickoff confirm", { id, change: "NO_CHANGE", signoff: journal.signoff, steps: journal.steps, valid_until: current.valid_until }, [`kickoff confirm: NO_CHANGE — ${id} 已生效（至 ${current.valid_until}）`]);
  }
  const initialized = await requireInitialized(dir);
  if ("error" in initialized) return fail([initialized.error]);
  const unseeded = (["frontend", "backend"] as const).filter((lane) => !existsSync(join(dir, ".pomaster", "baseline", lane, "stack.yaml")));
  if (unseeded.length > 0) return fail([{ code: "NOT_CONFIGURED", message: `技术基线还没播种（缺 ${unseeded.map((lane) => `.pomaster/baseline/${lane}/stack.yaml`).join("、")}）`, hint: "先运行 pomaster init（只补缺席的文件，不改已有内容）" }]);
  const earlyJournal = readJson<ApplyJournal>(join(outDir, "apply.json"));
  if (earlyJournal?.steps["domain"] !== "done") {
    const conflict = await domainConflict(dir, ctx.domainPath);
    if (conflict !== null) return fail([conflict]);
  }
  const registry = loadRegistry(dir);
  if (registry.state !== "ok") return fail([{ code: registry.state === "absent" ? "TRUST_NOT_ENROLLED" : "TRUST_REGISTRY_INVALID", message: registry.state === "absent" ? "启动确认必须由 Owner 用 SSH 私钥签名，项目还没有登记签名人" : `签名人登记表不成立：${registry.reason}`, hint: registry.state === "absent" ? "pomaster trust enroll --key <公钥.pub> --principal <名字>，然后 pomaster kickoff draft 把签名人写进确认单" : "看过 .pomaster/trust/ 的 git 历史后恢复" }]);
  if (built.unresolved.length > 0) return fail([{ code: "KICKOFF_NOT_READY", message: built.unresolved.join("；"), hint: "改 choices.yaml → pomaster kickoff draft → 重新签" }]);

  const journalPath = join(outDir, "apply.json");
  const subject = { kind: "kickoff" as const, ref: `${KICKOFF_DIR}/${id}/sheet.json`, sha256: sheetSha };
  let journal = readJson<ApplyJournal>(journalPath);
  let change: KickoffConfirmResult["change"] = "CONFIRMED";
  if (journal !== null && journal.sheet_sha256 === sheetSha) {
    // 续做：签发已在第一次消费，这里只复核签名仍成立，不再消费
    const again = verifySignoff(dir, journal.signoff.signoff ?? "", subject, { consume: false, requireConsumed: true, ...(env.trust !== undefined ? { env: env.trust } : {}) });
    if (!again.ok) return fail([again.error]);
    change = "RESUMED";
  } else {
    if (input.signoff === undefined) return fail([{ code: "TRUST_SIGNOFF_REQUIRED", message: "启动确认要 Owner 签名", hint: `pomaster trust request kickoff --subject ${subject.ref}；在你自己的终端签名后 pomaster kickoff confirm --signoff <SO-…>` }]);
    const verified = verifySignoff(dir, input.signoff, subject, { consume: true, consumedBy: "kickoff confirm", ...(env.trust !== undefined ? { env: env.trust } : {}) });
    if (!verified.ok) return fail([verified.error]);
    const superseded = pendingApplies(dir).map((entry) => ({ sheet: entry.id, sheet_sha256: entry.journal.sheet_sha256, signoff: entry.journal.signoff.signoff }));
    journal = { schema: KICKOFF_APPLY_SCHEMA, sheet: id, sheet_sha256: sheetSha, signoff: verified.record, steps: {}, ...(superseded.length > 0 ? { supersedes: superseded } : {}) };
    writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
  }
  const sheet = built.sheet;
  const steps: Record<string, "done"> = { ...journal.steps };
  const mark = (step: string) => {
    steps[step] = "done";
    writeFileSync(journalPath, `${JSON.stringify({ ...journal, steps }, null, 2)}\n`, "utf8");
  };
  const stepFail = (step: string, errors: readonly CliError[]) =>
    fail(errors.map((error) => ({ ...error, message: `落库步骤「${step}」失败：${error.message}`, hint: `${error.hint.replace(/[。；;.\s]+$/, "")}；修复后重跑 pomaster kickoff confirm（已完成的步骤不会重做）` })));

  // 1 领域规格：把签过的草案字节放到脚手架位并确认（启动确认的签发覆盖这份摘要，不再要第二次签名）
  if (steps["domain"] !== "done") {
    const specPath = join(dir, ...SCAFFOLD_DOMAIN_SPEC_RELATIVE.split("/"));
    const draftBytes = readFileSync(ctx.domainPath);
    if (sha256(draftBytes) !== sheet.domain.sha256) return stepFail("domain", [{ code: "KICKOFF_SHEET_STALE", message: "领域草案在签名之后变了", hint: "pomaster kickoff draft 刷新后重新签" }]);
    const conflict = await domainConflict(dir, ctx.domainPath);
    if (conflict !== null) return stepFail("domain", [conflict]);
    mkdirSync(join(dir, ...SCAFFOLD_DIR_RELATIVE.split("/")), { recursive: true });
    writeFileSync(specPath, draftBytes);
    const confirmed = await runScaffoldConfirm(dir, { by: `human:${journal.signoff.principal ?? "owner"}`, authorization: { kind: "kickoff", sheet: id, sha256: sheet.domain.sha256, record: journal.signoff } });
    if (!confirmed.ok) return stepFail("domain", confirmed.errors);
    mark("domain");
  }
  // 2 技术栈键（逐键写基线；值 = 确认单上的推荐或 Owner 覆盖，「未定」不写）
  if (steps["stack"] !== "done") {
    for (const lane of ["frontend", "backend"] as const) {
      for (const entry of sheet.stack[lane].recommended) {
        if (entry.value === "未定") continue;
        const set = await runBaselineSet(dir, { lane, key: entry.key, value: entry.value });
        if (!set.ok) return stepFail("stack", set.errors);
      }
    }
    mark("stack");
  }
  // 3 权威记录：答案 / 阈值 / 自主边界（PL-1、TS-2、AP-2 消费）
  if (steps["authority"] !== "done") {
    const write = (name: string, value: unknown) => writeFileSync(join(outDir, name), `${JSON.stringify({ schema: `pomaster.kickoff-${name.replace(/\.json$/, "")}/v1`, sheet: id, ...value as object }, null, 2)}\n`, "utf8");
    write("decisions.json", { answers: sheet.questions.map((question) => ({ key: question.key, classification: question.classification, question: question.question, answer: question.answer, default: question.default, disposition: question.answer !== null ? "answered" : "default" })) });
    write("thresholds.json", { thresholds: sheet.thresholds });
    write("autonomy.json", { allow: sheet.autonomy.allow, stop: sheet.autonomy.stop, budget: sheet.budget, scope: sheet.scope });
    mark("authority");
  }
  // 4 提交：current.json 最后写，是启动确认生效的唯一标志；之后再给日志记提交、给被取代的旧落库记去向
  const appliedAt = new Date();
  const validUntil = new Date(appliedAt.getTime() + sheet.budget.valid_days * 86_400_000).toISOString();
  writeFileSync(
    currentPath,
    `${JSON.stringify({ schema: KICKOFF_CURRENT_SCHEMA, sheet: id, sheet_sha256: sheetSha, signoff: journal.signoff.signoff, principal: journal.signoff.principal, assurance: journal.signoff.assurance, applied_at: appliedAt.toISOString(), valid_until: validUntil }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(journalPath, `${JSON.stringify({ ...journal, steps, committed: true }, null, 2)}\n`, "utf8");
  for (const old of journal.supersedes ?? []) {
    const oldPath = join(sheetDir(dir, old.sheet), "apply.json");
    const oldJournal = old.sheet === id ? null : readJson<ApplyJournal>(oldPath);
    if (oldJournal !== null && oldJournal.committed !== true) writeFileSync(oldPath, `${JSON.stringify({ ...oldJournal, superseded_by: id }, null, 2)}\n`, "utf8");
  }
  return okOutcome("kickoff confirm", { id, change, signoff: journal.signoff, steps, valid_until: validUntil }, [
    `kickoff confirm: ${change} — ${id} 生效至 ${validUntil}`,
    `  签名人 ${journal.signoff.principal}（${journal.signoff.fingerprint}），保障 ${journal.signoff.assurance}`,
    "  已落库：领域规格（并确认）、技术栈键、答案 / 阈值 / 自主边界",
    "  下一步：按业务场景规划（PL-1）",
  ]);
}
