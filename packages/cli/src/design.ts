/**
 * design.ts —— `pomaster design` 命令面：validate（校验规范源）与 show（给 AI 读的规范视图）。
 *
 * 规范源取用顺序：显式文件 > 项目 `.pomaster/baseline/frontend/design-standard.yaml` > 工具预设
 * （包内 `seeds/design-standards/<设计体系>.yaml`，缺省 antd）。token 表与硬规范原文就近取：显式文件同目录的 design-tokens.yaml > 项目 > 预设。
 * 两个命令都只读、不写任何文件，不要求项目已 init。
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  DESIGN_STANDARD_PRESETS_DIR,
  DESIGN_STANDARD_RELATIVE,
  DESIGN_SYSTEMS,
  DESIGN_TOKENS_RELATIVE,
  designStandardFingerprint,
  readDesignStandardFile,
  readSpecTexts,
  readTokenGroups,
  validateDesignStandard,
  type DesignArea,
  type DesignParam,
  type DesignRule,
  type DesignStandardIssue,
  type DesignSystem,
  type NormalizedDesignStandard,
} from "./design-standard.js";
import { seedsRootCandidates } from "./seed-manifest.js";
import { POMASTER_DIR } from "./store-layout.js";

export type DesignSourceMode = "file" | "project" | "preset";

export interface DesignInputs {
  readonly mode: DesignSourceMode;
  readonly standard_path: string;
  readonly tokens_path: string | null;
  readonly specs_root: string | null;
}

export interface DesignSummary {
  readonly areas: number;
  readonly rules: number;
  readonly gate_rules: number;
  readonly review_rules: number;
  readonly pending_params: number;
}

export interface DesignValidateResult extends DesignInputs {
  readonly ok: boolean;
  readonly errors: number;
  readonly warnings: number;
  readonly issues: readonly DesignStandardIssue[];
  /** 规范指纹（规范源 + token 表）；Storybook 规范页与 AI 孪生盖同一个指纹。读不到文件时为 null。 */
  readonly fingerprint: string | null;
  readonly summary: DesignSummary | null;
  readonly normalized: NormalizedDesignStandard | null;
}

export interface DesignValidateInput {
  readonly file?: string;
  /** 用哪套设计体系的工具预设（项目没有规范、也没指定文件时生效；缺省 antd）。 */
  readonly system?: DesignSystem;
  /** 包内 seeds 根覆盖位（测试注入；缺省按模块位置解析）。 */
  readonly seedsRoot?: string;
}

export interface DesignShowInput extends DesignValidateInput {
  readonly area?: string;
  readonly rule?: string;
}

export interface DesignShowResult extends DesignInputs {
  readonly fingerprint: string;
  readonly meta: NormalizedDesignStandard["meta"];
  readonly areas: readonly DesignArea[];
  readonly sources: NormalizedDesignStandard["sources"];
  readonly specs: NormalizedDesignStandard["specs"];
}

function defaultSeedsRoot(): string | null {
  for (const candidate of seedsRootCandidates(import.meta.url)) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 解析规范源、token 表与硬规范目录的位置。 */
export function resolveDesignInputs(dir: string, input: DesignValidateInput): DesignInputs {
  const seedsRoot = input.seedsRoot ?? defaultSeedsRoot();
  const projectRoot = join(dir, POMASTER_DIR);
  const projectStandard = join(projectRoot, DESIGN_STANDARD_RELATIVE);
  const projectTokens = join(projectRoot, DESIGN_TOKENS_RELATIVE);
  const projectSpecs = join(projectRoot, "specs", "hard");
  const system: DesignSystem = input.system ?? "antd";
  const presetStandard = seedsRoot === null ? null : join(seedsRoot, DESIGN_STANDARD_PRESETS_DIR, `${system}.yaml`);
  const presetTokens = seedsRoot === null ? null : join(seedsRoot, DESIGN_TOKENS_RELATIVE);
  const presetSpecs = seedsRoot === null ? null : join(seedsRoot, "specs", "hard");
  const firstExisting = (...paths: ReadonlyArray<string | null>): string | null =>
    paths.find((path): path is string => path !== null && existsSync(path)) ?? null;

  if (input.file !== undefined) {
    const standardPath = isAbsolute(input.file) ? input.file : join(dir, input.file);
    return {
      mode: "file",
      standard_path: standardPath,
      tokens_path: firstExisting(join(dirname(standardPath), "design-tokens.yaml"), projectTokens, presetTokens),
      specs_root: firstExisting(projectSpecs, presetSpecs),
    };
  }
  if (existsSync(projectStandard)) {
    return {
      mode: "project",
      standard_path: projectStandard,
      tokens_path: firstExisting(projectTokens),
      specs_root: firstExisting(projectSpecs),
    };
  }
  return {
    mode: "preset",
    standard_path: presetStandard ?? projectStandard,
    tokens_path: firstExisting(presetTokens),
    specs_root: firstExisting(presetSpecs),
  };
}

function summarize(standard: NormalizedDesignStandard): DesignSummary {
  const rules = standard.areas.flatMap((area) => area.rules);
  return {
    areas: standard.areas.length,
    rules: rules.length,
    gate_rules: rules.filter((rule) => rule.enforcement.kind === "gate").length,
    review_rules: rules.filter((rule) => rule.enforcement.kind === "review").length,
    pending_params: rules.reduce((sum, rule) => sum + rule.params.filter((param) => param.pending).length, 0),
  };
}

function issueMessage(issue: DesignStandardIssue): string {
  return issue.path.length > 0 ? `${issue.path}: ${issue.message}` : issue.message;
}

function toError(issue: DesignStandardIssue): CliError {
  return { code: issue.code, message: issueMessage(issue), hint: issue.hint };
}

function toWarning(issue: DesignStandardIssue): CliWarning {
  return { code: issue.code, message: issueMessage(issue), hint: issue.hint };
}

const MODE_ZH: Record<DesignSourceMode, string> = {
  file: "指定文件",
  project: "项目规范",
  preset: "工具预设（项目尚未落地规范）",
};

const LIVE_TOKEN_REFERENCE = /\bt\[\s*['"]/;

/** 规范里有没有引用 token：参数取 token，或实时示例里写了 t['…']（按原始结构判断，规范未通过校验时同样适用）。 */
function referencesTokens(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const areas = (raw as { areas?: unknown }).areas;
  if (!Array.isArray(areas)) return false;
  return areas.some((area) => {
    const rules = (area as { rules?: unknown } | null)?.rules;
    return (
      Array.isArray(rules) &&
      rules.some((rule) => {
        const params = (rule as { params?: unknown } | null)?.params;
        const examples = (rule as { examples?: unknown } | null)?.examples;
        const tokenParam =
          typeof params === "object" &&
          params !== null &&
          Object.values(params).some((param) => typeof param === "object" && param !== null && "token" in param);
        const tokenExample =
          Array.isArray(examples) &&
          examples.some((example) => {
            if (typeof example !== "object" || example === null) return false;
            const { template, jsx } = example as { template?: unknown; jsx?: unknown };
            return [template, jsx].some((body) => typeof body === "string" && LIVE_TOKEN_REFERENCE.test(body));
          });
        return tokenParam || tokenExample;
      })
    );
  });
}

/** 读源 + 校验（validate 与 show 共用）。 */
export function loadDesignStandard(dir: string, input: DesignValidateInput): DesignValidateResult {
  const inputs = resolveDesignInputs(dir, input);
  const base = { ...inputs, fingerprint: null, summary: null, normalized: null };
  if (input.system !== undefined && !(input.system in DESIGN_SYSTEMS)) {
    const issue: DesignStandardIssue = {
      severity: "error",
      code: "DESIGN_SYSTEM_UNKNOWN",
      path: "",
      message: `设计体系 ${String(input.system)} 不在词表内`,
      hint: `可选：${Object.keys(DESIGN_SYSTEMS).join(" / ")}`,
    };
    return { ...base, ok: false, errors: 1, warnings: 0, issues: [issue] };
  }
  if (inputs.mode === "preset" && !existsSync(inputs.standard_path)) {
    const issue: DesignStandardIssue = {
      severity: "error",
      code: "DESIGN_UNREADABLE",
      path: "",
      message: `设计体系 ${input.system ?? "antd"} 的工具预设尚未提供（${inputs.standard_path}）`,
      hint: "项目里写自己的规范（.pomaster/baseline/frontend/design-standard.yaml），或换一套已提供预设的设计体系",
    };
    return { ...base, ok: false, errors: 1, warnings: 0, issues: [issue] };
  }
  const loaded = readDesignStandardFile(inputs.standard_path);
  if (!loaded.ok) {
    return { ...base, ok: false, errors: 1, warnings: 0, issues: [loaded.issue] };
  }
  const tokens = inputs.tokens_path === null ? null : readTokenGroups(inputs.tokens_path);
  const specTexts = inputs.specs_root === null ? null : readSpecTexts(inputs.specs_root, loaded.raw);
  const validation = validateDesignStandard(loaded.raw, { tokens: tokens?.groups ?? null, specTexts });
  // token 表只在规范引用了 token 时进指纹（Geist 预设不引用 Ant Design 的 token 表）。
  const fingerprint = designStandardFingerprint([
    { path: DESIGN_STANDARD_RELATIVE, text: loaded.text },
    ...(tokens === null || !referencesTokens(loaded.raw) ? [] : [{ path: DESIGN_TOKENS_RELATIVE, text: tokens.text }]),
  ]);
  return {
    ...inputs,
    ok: validation.ok,
    errors: validation.issues.filter((issue) => issue.severity === "error").length,
    warnings: validation.issues.filter((issue) => issue.severity === "warning").length,
    issues: validation.issues,
    fingerprint,
    summary: validation.standard === null ? null : summarize(validation.standard),
    normalized: validation.standard,
  };
}

const UNIT_SUFFIX: Record<DesignParam["unit"], string> = {
  px: "px",
  em: "em",
  percent: "%",
  ratio: ":1",
  count: " 个",
  chars: " 字",
  ms: "ms",
  none: "",
};

/** 参数值的人读形态（数组用 / 连接，对象逐键列出，待定值写明待定原因）。 */
export function formatDesignParam(param: DesignParam): string {
  if (param.pending) {
    if (param.kind === "decision") {
      const candidates = param.candidates === null ? "" : `；候选 ${param.candidates.map((c) => formatScalar(c, param.unit)).join(" / ")}`;
      return `待项目决定：${param.decision_zh ?? ""}${candidates}`;
    }
    return `待定（token ${param.token ?? ""} 仍为 UNKNOWN）`;
  }
  const value = formatValue(param.value, param.unit);
  const origin = param.kind === "token" ? `token ${param.token ?? ""}` : `出处 ${param.source ?? ""}`;
  return `${value}（${origin}）`;
}

function formatScalar(value: unknown, unit: DesignParam["unit"]): string {
  if (typeof value === "number") return `${value}${UNIT_SUFFIX[unit]}`;
  return String(value);
}

function formatValue(value: unknown, unit: DesignParam["unit"]): string {
  if (Array.isArray(value)) return value.map((item) => formatValue(item, unit)).join(" / ");
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key} → ${formatValue(item, unit)}`)
      .join("；");
  }
  return formatScalar(value, unit);
}

function ruleLines(rule: DesignRule): string[] {
  const enforcement =
    rule.enforcement.kind === "gate"
      ? `门禁 ${rule.enforcement.check}${rule.enforcement.active ? "" : "（待接入，暂按评审执行）"}`
      : "人工评审";
  const surfaces = rule.surfaces.length === 2 ? "两个面" : rule.surfaces[0] === "admin" ? "管理侧" : "用户侧";
  const lines = [`  ${rule.id}  ${rule.title_zh}  [${enforcement} · ${surfaces}]`, `    ${rule.statement_zh}`];
  for (const param of rule.params) {
    lines.push(`    ${param.label_zh ?? param.key}：${formatDesignParam(param)}`);
  }
  for (const anchor of rule.anchors) {
    lines.push(`    依据：${anchor.doc}「${anchor.quote}」`);
  }
  return lines;
}

function validateLines(result: DesignValidateResult): string[] {
  const lines: string[] = [];
  lines.push(
    result.ok
      ? `设计规范通过：${result.standard_path}（${MODE_ZH[result.mode]}，${result.warnings} 条警告）`
      : `设计规范未通过：${result.standard_path}（${result.errors} 条错误，${result.warnings} 条警告）`,
  );
  for (const issue of result.issues) {
    const tag = issue.severity === "error" ? "错误" : "警告";
    lines.push(`  [${tag}] ${issue.code} ${issueMessage(issue)}`);
    lines.push(`         → ${issue.hint}`);
  }
  if (result.summary !== null) {
    const s = result.summary;
    lines.push(`${s.areas} 个领域、${s.rules} 条规则（门禁 ${s.gate_rules}、评审 ${s.review_rules}），${s.pending_params} 个参数待定`);
  }
  if (result.fingerprint !== null) lines.push(`规范指纹 ${result.fingerprint}`);
  return lines;
}

export function runDesignValidate(dir: string, input: DesignValidateInput): CommandOutcome<DesignValidateResult> {
  const result = loadDesignStandard(dir, input);
  const warnings = result.issues.filter((issue) => issue.severity === "warning").map(toWarning);
  if (!result.ok) {
    return failOutcome(
      "design validate",
      result,
      result.issues.filter((issue) => issue.severity === "error").map(toError),
      validateLines(result),
      warnings,
    );
  }
  return okOutcome("design validate", result, validateLines(result), warnings);
}

export function runDesignShow(dir: string, input: DesignShowInput): CommandOutcome<DesignShowResult | null> {
  const loaded = loadDesignStandard(dir, input);
  if (!loaded.ok || loaded.normalized === null || loaded.fingerprint === null) {
    return failOutcome(
      "design show",
      null,
      loaded.issues.filter((issue) => issue.severity === "error").map(toError),
      [...validateLines(loaded), "规范未通过校验，先修正再查看（pomaster design validate）"],
    );
  }
  const standard = loaded.normalized;
  let areas = standard.areas;
  if (input.area !== undefined) {
    areas = areas.filter((area) => area.key === input.area);
    if (areas.length === 0) {
      return failOutcome("design show", null, [
        {
          code: "DESIGN_AREA_NOT_FOUND",
          message: `没有领域 ${input.area}`,
          hint: `可选：${standard.areas.map((area) => area.key).join(" / ")}`,
        },
      ], [`没有领域 ${input.area}`]);
    }
  }
  if (input.rule !== undefined) {
    areas = areas
      .map((area) => ({ ...area, rules: area.rules.filter((rule) => rule.id === input.rule) }))
      .filter((area) => area.rules.length > 0);
    if (areas.length === 0) {
      return failOutcome("design show", null, [
        { code: "DESIGN_RULE_NOT_FOUND", message: `没有规则 ${input.rule}`, hint: "用 pomaster design show 列出全部规则编号" },
      ], [`没有规则 ${input.rule}`]);
    }
  }
  const result: DesignShowResult = {
    mode: loaded.mode,
    standard_path: loaded.standard_path,
    tokens_path: loaded.tokens_path,
    specs_root: loaded.specs_root,
    fingerprint: loaded.fingerprint,
    meta: standard.meta,
    areas,
    sources: standard.sources,
    specs: standard.specs,
  };
  const lines: string[] = [
    `设计规范（${MODE_ZH[loaded.mode]}，origin=${standard.meta.origin}，UI 库 ${standard.meta.ui_library}）`,
    `源：${loaded.standard_path}`,
    `指纹：${loaded.fingerprint}`,
  ];
  for (const area of areas) {
    lines.push("");
    lines.push(`${area.group_title_zh} / ${area.title_zh}（${area.prefix}，${area.rules.length} 条）：${area.summary_zh}`);
    for (const rule of area.rules) lines.push(...ruleLines(rule));
  }
  return okOutcome("design show", result, lines);
}
