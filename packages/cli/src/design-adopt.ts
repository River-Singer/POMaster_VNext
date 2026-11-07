/**
 * design-adopt.ts —— 设计规范落到项目里，并在开发中改它：
 *
 * - `pomaster design adopt`：把一套工具预设（antd / geist）拷进项目
 *   `.pomaster/baseline/frontend/design-standard.yaml`，从此项目规范就是这一份——`design show` 给 AI 读、
 *   Storybook 的规范页从它生成（POMASTER_STUDIO_PROJECT）、`design check` / closeout / check --gates 按它判卷。
 *   老代码可以顺手 `--baseline` 把现有违规记成存量，只拦新增。
 * - `pomaster design set <规则>.<参数> <值> --by human:<名字>`：定下决策位，或改一个已有取值。
 *   只改那一行参数（文本级替换，保留其余格式与注释），出处记为项目决策源 SRC.PROJECT.DECISIONS，
 *   谁、哪天、为什么写进参数的 note_zh；改完立刻校验，不通过就原样退回。
 *
 * 两个命令都只动项目规范文件；不改工具预设。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { load as loadYaml } from "js-yaml";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { assessDesignStandard } from "./design-check.js";
import { loadDesignStandard, resolveDesignInputs } from "./design.js";
import { DESIGN_STANDARD_RELATIVE, DESIGN_SYSTEMS, DESIGN_TOKENS_RELATIVE, type DesignSystem } from "./design-standard.js";
import { POMASTER_DIR } from "./store-layout.js";

const STANDARD_TARGET = `${POMASTER_DIR}/${DESIGN_STANDARD_RELATIVE}`;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// adopt
// ============================================================

export interface DesignAdoptInput {
  readonly system?: DesignSystem;
  /** 项目已有规范时覆盖。 */
  readonly force?: boolean;
  /** 采用后把现有违规记成存量基线。 */
  readonly baseline?: boolean;
  readonly roots?: readonly string[];
  readonly seedsRoot?: string;
}

export interface DesignAdoptResult {
  readonly system: DesignSystem;
  /** 怎么定的体系：显式指定 / 从依赖推断 / 缺省。 */
  readonly system_reason_zh: string;
  readonly standard_path: string;
  readonly tokens_copied: boolean;
  readonly fingerprint: string | null;
  /** 还没定的决策位（规则.参数 → 要回答的问题）。 */
  readonly pending: ReadonlyArray<{ readonly param: string; readonly question_zh: string }>;
  readonly baseline: { readonly recorded: number; readonly path: string | null } | null;
}

function packageJsonsOf(dir: string): string[] {
  const out: string[] = [];
  for (const base of ["", "frontend", "web", "client", "ui", "app"]) {
    const path = join(dir, base, "package.json");
    if (existsSync(path)) out.push(path);
  }
  const apps = join(dir, "apps");
  if (existsSync(apps)) {
    for (const name of readdirSync(apps).sort()) {
      const path = join(apps, name, "package.json");
      if (existsSync(path)) out.push(path);
    }
  }
  return out;
}

/** 从项目依赖推断设计体系：用了 vue / ant-design-vue → antd；用了 react / next → geist；两种都有或都没有 → null。 */
export function detectDesignSystem(dir: string): { system: DesignSystem; evidence: string } | null {
  const found = new Map<DesignSystem, string>();
  for (const path of packageJsonsOf(dir)) {
    let deps: Record<string, unknown> = {};
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      deps = { ...(raw["dependencies"] as object | undefined), ...(raw["devDependencies"] as object | undefined) };
    } catch {
      continue;
    }
    const rel = path.slice(dir.length + 1).split("\\").join("/");
    if ("vue" in deps || "ant-design-vue" in deps) found.set("antd", `${rel} 依赖 vue`);
    if ("react" in deps || "next" in deps) found.set("geist", `${rel} 依赖 react`);
  }
  if (found.size !== 1) return null;
  const [entry] = [...found.entries()];
  return entry === undefined ? null : { system: entry[0], evidence: entry[1] };
}

export function runDesignAdopt(dir: string, input: DesignAdoptInput = {}): CommandOutcome<DesignAdoptResult | null> {
  const fail = (error: CliError): CommandOutcome<DesignAdoptResult | null> =>
    failOutcome<DesignAdoptResult | null>("design adopt", null, [error], [`design adopt: FAILED — ${error.code}`, `  ${error.message}`, `  hint: ${error.hint}`]);
  if (!existsSync(join(dir, POMASTER_DIR))) {
    return fail({ code: "NOT_INITIALIZED", message: "项目还没 init（找不到 .pomaster/）", hint: "先 pomaster init，再采用设计规范" });
  }
  if (input.system !== undefined && !(input.system in DESIGN_SYSTEMS)) {
    return fail({ code: "DESIGN_SYSTEM_UNKNOWN", message: `设计体系 ${String(input.system)} 不在词表内`, hint: `可选：${Object.keys(DESIGN_SYSTEMS).join(" / ")}` });
  }
  const target = join(dir, STANDARD_TARGET);
  if (existsSync(target) && input.force !== true) {
    return fail({
      code: "DESIGN_ALREADY_ADOPTED",
      message: `项目已经有设计规范（${STANDARD_TARGET}）`,
      hint: "改参数用 pomaster design set；补条文用 pomaster update spec；确实要换成预设原样再加 --force（会丢掉项目里的改动）",
    });
  }
  const detected = input.system === undefined ? detectDesignSystem(dir) : null;
  const system: DesignSystem = input.system ?? detected?.system ?? "antd";
  const reason = input.system !== undefined ? "显式指定（--system）" : detected !== null ? `从依赖推断：${detected.evidence}` : "缺省（没从依赖里认出前端框架）";
  const inputs = resolveDesignInputs(join(dir, "__pomaster_preset_only__"), { system, ...(input.seedsRoot !== undefined ? { seedsRoot: input.seedsRoot } : {}) });
  if (inputs.mode !== "preset" || !existsSync(inputs.standard_path)) {
    return fail({ code: "DESIGN_UNREADABLE", message: `找不到 ${system} 的工具预设`, hint: "检查 pomaster 安装是否完整（seeds/design-standards/）" });
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(inputs.standard_path, target);
  const tokensTarget = join(dir, POMASTER_DIR, DESIGN_TOKENS_RELATIVE);
  let tokensCopied = false;
  if (!existsSync(tokensTarget) && inputs.tokens_path !== null) {
    copyFileSync(inputs.tokens_path, tokensTarget);
    tokensCopied = true;
  }
  const loaded = loadDesignStandard(dir, {});
  const pending = (loaded.normalized?.areas ?? []).flatMap((area) =>
    area.rules.flatMap((rule) =>
      rule.params.filter((param) => param.kind === "decision").map((param) => ({ param: `${rule.id}.${param.key}`, question_zh: param.decision_zh ?? "" })),
    ),
  );
  const warnings: CliWarning[] = [];
  let baseline: DesignAdoptResult["baseline"] = null;
  if (input.baseline === true) {
    const report = assessDesignStandard(dir, { writeBaseline: true, ...(input.roots !== undefined ? { roots: input.roots } : {}) });
    if (!("checks" in report)) warnings.push({ code: report.code, message: report.message, hint: report.hint });
    else baseline = { recorded: report.baselined, path: report.baseline_path };
  }
  const result: DesignAdoptResult = {
    system,
    system_reason_zh: reason,
    standard_path: STANDARD_TARGET,
    tokens_copied: tokensCopied,
    fingerprint: loaded.fingerprint,
    pending,
    baseline,
  };
  const lines = [
    `design adopt: 已采用 ${DESIGN_SYSTEMS[system].title_zh} 规范（${reason}）→ ${STANDARD_TARGET}`,
    ...(tokensCopied ? [`  token 表也拷进来了：${POMASTER_DIR}/${DESIGN_TOKENS_RELATIVE}`] : []),
    `  指纹：${loaded.fingerprint ?? "（规范没通过校验）"}`,
    `  待定决策位 ${pending.length} 个${pending.length > 0 ? "（pomaster design set <规则>.<参数> <值> --by human:<名字>）：" : ""}`,
    ...pending.slice(0, 12).map((item) => `    - ${item.param}：${item.question_zh}`),
    ...(pending.length > 12 ? [`    …另 ${pending.length - 12} 个（pomaster design validate 列全）`] : []),
    ...(baseline !== null ? [`  现有违规 ${baseline.recorded} 处已记为存量（${baseline.path ?? ""}），之后只拦新增`] : ["  老代码要先记存量：pomaster design check --write-baseline"]),
    "  之后：AI 读 pomaster design show（--json 全量）；Storybook 规范页设 POMASTER_STUDIO_PROJECT=<项目目录> 后从这份规范生成；pomaster design check / closeout / check --gates 按它判卷。",
  ];
  if (!loaded.ok) {
    return failOutcome("design adopt", result, loaded.issues.filter((issue) => issue.severity === "error").map((issue) => ({ code: issue.code, message: issue.message, hint: issue.hint })), lines, warnings);
  }
  return okOutcome("design adopt", result, lines, warnings);
}

// ============================================================
// set
// ============================================================

export const PROJECT_DECISION_SOURCE = "SRC.PROJECT.DECISIONS";

export interface DesignSetInput {
  /** `RULE.ID.param`（参数键是最后一段）。 */
  readonly target: string;
  readonly value: string;
  /** 决定人（human:<名字>）。 */
  readonly by: string;
  readonly note?: string;
}

export interface DesignSetResult {
  readonly rule: string;
  readonly param: string;
  readonly previous: unknown;
  readonly value: unknown;
  readonly fingerprint: string | null;
}

const PLAIN_BAD_START = new Set([..."-?:,[]{}#&*!|>'\"%@`"]);

/** 单个 YAML 流式标量（与 seeds 的写法一致：能裸写就裸写，否则 JSON 字符串）。 */
export function yamlScalar(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(yamlScalar).join(", ")}]`;
  const text = String(value);
  const plain =
    text.length > 0 &&
    !text.includes("\n") &&
    !PLAIN_BAD_START.has(text[0] ?? "") &&
    text.trim() === text &&
    !/^(true|false|null|yes|no|on|off|~)$/i.test(text) &&
    !/^[-+]?(\d[\d_]*)?(\.\d+)?([eE][-+]?\d+)?$/.test(text) &&
    !/: | #|:$/.test(text) &&
    !/[,[\]{}]/.test(text);
  return plain ? text : JSON.stringify(text);
}

function flowMap(entries: ReadonlyArray<[string, unknown]>): string {
  return `{ ${entries.filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => `${key}: ${yamlScalar(value)}`).join(", ")} }`;
}

function parseValue(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function ensureDecisionSource(text: string): string {
  if (new RegExp(`^  ${PROJECT_DECISION_SOURCE.replace(/\./g, "\\.")}:`, "m").test(text)) return text;
  const lines = text.split("\n");
  let at = lines.findIndex((line) => line === "specs:");
  if (at === -1) at = lines.findIndex((line) => line === "areas:");
  if (at === -1) return text;
  while (at > 0 && (lines[at - 1] ?? "").trim() === "") at -= 1;
  lines.splice(
    at,
    0,
    `  ${PROJECT_DECISION_SOURCE}:`,
    "    title_zh: 项目决策（pomaster design set 记录）",
    `    url: ${yamlScalar(`repo:${STANDARD_TARGET}`)}`,
    `    retrieved: ${today()}`,
    "    note_zh: 项目在开发中定下或改过的取值；每条的决定人、日期与理由写在该参数的 note_zh",
  );
  return lines.join("\n");
}

function markCustomized(text: string): string {
  return text.replace(/^(  origin: )preset$/m, "$1customized").replace(/^(  customized: )false$/m, "$1true");
}

export function runDesignSet(dir: string, input: DesignSetInput): CommandOutcome<DesignSetResult | null> {
  const fail = (error: CliError): CommandOutcome<DesignSetResult | null> =>
    failOutcome<DesignSetResult | null>("design set", null, [error], [`design set: FAILED — ${error.code}`, `  ${error.message}`, `  hint: ${error.hint}`]);
  const path = join(dir, STANDARD_TARGET);
  if (!existsSync(path)) {
    return fail({ code: "DESIGN_NOT_ADOPTED", message: "项目还没有设计规范", hint: "先 pomaster design adopt（--system antd|geist）" });
  }
  if (!/^human:[\w.\-\u4e00-\u9fff]+$/.test(input.by)) {
    return fail({ code: "DESIGN_SET_ACTOR", message: `决定人 ${input.by} 不合规`, hint: "写 --by human:<名字>：规范取值是项目决策，记下是谁定的" });
  }
  const cut = input.target.lastIndexOf(".");
  const ruleId = cut === -1 ? "" : input.target.slice(0, cut);
  const key = cut === -1 ? "" : input.target.slice(cut + 1);
  if (ruleId.length === 0 || !/^[a-z][a-z0-9_]*$/.test(key)) {
    return fail({ code: "DESIGN_SET_TARGET", message: `目标 ${input.target} 不是「规则编号.参数键」`, hint: "如 GRID.GUTTER.gutter、LAYOUT.Z_INDEX.layers" });
  }
  const original = readFileSync(path, "utf8");
  const lines = original.split("\n");
  const ruleAt = lines.findIndex((line) => line === `      - id: ${ruleId}`);
  if (ruleAt === -1) return fail({ code: "DESIGN_SET_TARGET", message: `规范里没有规则 ${ruleId}`, hint: "pomaster design show 查规则编号" });
  let end = ruleAt + 1;
  while (end < lines.length && !/^      - id: /.test(lines[end] ?? "") && !/^  - key: /.test(lines[end] ?? "") && !/^\S/.test(lines[end] ?? "")) end += 1;
  const paramAt = lines.findIndex((line, index) => index > ruleAt && index < end && new RegExp(`^          ${key}: (\\{.*\\})\\s*$`).test(line));
  if (paramAt === -1) return fail({ code: "DESIGN_SET_TARGET", message: `规则 ${ruleId} 没有参数 ${key}`, hint: `pomaster design show --rule ${ruleId} 查参数` });
  const current = loadYaml((lines[paramAt] ?? "").replace(new RegExp(`^          ${key}: `), "")) as Record<string, unknown>;
  const previous = "decision" in current ? null : "token" in current ? { token: current["token"] } : current["value"];
  const value = parseValue(input.value);
  const what = "decision" in current ? `回答「${String(current["decision"])}」` : `原为 ${JSON.stringify(previous)}`;
  const note = `${input.by} 于 ${today()} 定（${what}）${input.note !== undefined && input.note.length > 0 ? `：${input.note}` : ""}`;
  lines[paramAt] = `          ${key}: ${flowMap([
    ["value", value],
    ["unit", current["unit"]],
    ["source", PROJECT_DECISION_SOURCE],
    ["label_zh", current["label_zh"]],
    ["note_zh", note],
  ])}`;
  const next = markCustomized(ensureDecisionSource(lines.join("\n")));
  writeFileSync(path, next, "utf8");
  const loaded = loadDesignStandard(dir, {});
  if (!loaded.ok) {
    writeFileSync(path, original, "utf8");
    const issue = loaded.issues.find((item) => item.severity === "error");
    return fail({
      code: issue?.code ?? "DESIGN_SHAPE",
      message: `改完规范校验不通过，已原样退回：${issue === undefined ? "" : `${issue.path} ${issue.message}`}`,
      hint: issue?.hint ?? "检查取值类型（数字、数组写 JSON，如 16、[16, 24]）",
    });
  }
  const result: DesignSetResult = { rule: ruleId, param: key, previous, value, fingerprint: loaded.fingerprint };
  return okOutcome("design set", result, [
    `design set: ${ruleId}.${key} = ${JSON.stringify(value)}（${what}；出处 ${PROJECT_DECISION_SOURCE}）`,
    `  新指纹：${loaded.fingerprint ?? ""}`,
    "  Storybook 规范页与 pomaster design show 随之更新；按这条参数判卷的检查（design check）下次就用新值。",
  ]);
}
