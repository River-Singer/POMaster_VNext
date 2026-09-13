/**
 * preset-probe.ts —— 预设只读探测器三件套命令面（W5 核心切片；裁决 20⑥ 追认方案
 * 落地——corpus/master/cutover/owner-adjudications.md#裁决20-⑥）。
 *
 * 裁决边界（不得翻案）：
 * - 预设值保持 governed 原地（族 1-7 的「值/卡/表」不 binding 化）——效力来自
 *   confirm 烙印而非执行；「应用预设」留 baseline set --change + confirm 治理通路
 *   （本模块零写入零 store 事务——write_surface:"none" 结构级钉）；
 * - ToolBinding 受信 adapter 执行表零注册（不进 TRUSTED_BINDING_ADAPTERS）：三件套
 *   是纯读观察面而非执行器（零子进程零 external tool），execution 合同/可执行体
 *   探针/env_allowlist 对纯读函数面空转——research §2.2(b) 六分态自洽前提是完整
 *   tools 化路径（schema 23 + kernel 词表两处同批修订），立项归属「W2+/按需」；
 *   本切片落读面本体，若后续批次进 bindings.json 注册面再做三处同批修订；
 * - 接入形态 = 独立只读命令面（provider capabilities 声明面 / telemetry task 纯读
 *   报告同款先例）：`pomaster preset preview|drift|applicability`（词形 = SP 提案
 *   待追认）。
 *
 * 三件套输入/输出契约（research presets-as-tools.md §2.2(b) 机器化）：
 * - 预览 diff（preview）：给定预设族锚与目标盘面 → 「若应用该预设将改变什么」
 *   只读差异清单（create/fill/overwrite/none 四值动作闭包 + governed_path 治理
 *   通路预告 + 确认链效果预告）——不应用；
 * - 漂移检测（drift）：当前生效值 vs 预设基准逐项对账 → VALUE_DRIFT 漂移项清单
 *   （漂移≠违规注记）+ verdict 三值（aligned|drifted|no_comparison——空对账分母
 *   显式，红线 10 blindspot：禁「没查就报干净」）+ confirm_state 字节平面上下文
 *   （readBaselineConfirmation 单源复用，禁第二套三态机）；
 * - 适配分析（applicability）：预设 → 适用 lane/栈/对象面声明（只读匹配，不改变
 *   ADR-4 applicability 判卷与 overlay 播种行为）。
 *
 * 首版覆盖 2 族示范（wired）：design-tokens（族 4）/ baseline-framework（族 1 栈
 * 选型预设值——STACK_QUESTIONS 候选首位锚）；其余族登记扩展位（SP/后续批次）。
 * 词形纪律：family id / 命令词形 / 动作词形 / 错误码 = SP 提案待 Owner 追认；
 * 单一事实源复用（禁第二套解析器）：盘面 tokens 走 readDesignTokens（schema 22
 * 校验单点）、栈值走 loadLaneStackValues、边界匹配走 matchStackValue、确认态走
 * readBaselineConfirmation、草案 face/门判据走 PRESET_FACE_SPECS/STACK_QUESTIONS。
 */
import { existsSync, readFileSync } from "node:fs";
import { load as loadYaml } from "js-yaml";
import type { BaselineLane } from "./baseline.js";
import {
  BASELINE_CONFIRM_TARGETS,
  BASELINE_DESIGN_TOKENS_TARGET,
  BASELINE_LANES,
  STACK_QUESTIONS,
  isStackValueResolved,
  loadLaneStackValues,
  readBaselineConfirmation,
} from "./baseline.js";
import { baselineStackRelative } from "./store-layout.js";
import { matchStackValue, PRESET_FACE_SPECS } from "./baseline-preset.js";
import { readDesignTokens } from "./baseline-tokens.js";
import { seedsRootCandidates } from "./seed-manifest.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

// ============================================================
// 家族注册面（wired 2 + 扩展位 5——红线 6 封闭面：扩员走显式修订 + Owner 追认）
// ============================================================

/** wired 家族闭包（首版示范 2 族；扩员 = SP 提案 + 本闭包同批修订）。 */
export const PRESET_FAMILY_WIRED = ["design-tokens", "baseline-framework"] as const;
export type PresetFamilyWired = (typeof PRESET_FAMILY_WIRED)[number];

/** 扩展位登记（research §1.4 盘点 7 族中未接线 5 族——SP/后续批次，本面零消费）。 */
export const PRESET_FAMILY_EXTENSION_SLOTS: readonly {
  readonly family: string;
  readonly covers: string;
}[] = [
  { family: "baseline-preset-draft", covers: "族 2：baseline 主题草案（PRESET-DRAFT 22 md 面）" },
  { family: "technology-profile", covers: "族 3：TECHNOLOGY_PROFILE 组合档案（catalog/policies/profile.baseline.*）" },
  { family: "archetype-cards", covers: "族 5：archetype 语义卡（catalog/archetypes 41 张）" },
  { family: "family-examples", covers: "族 6：组件族示例配置（studio family-examples）" },
  { family: "projection-presets", covers: "族 7：投影预设（catalog/projection-presets）" },
];

const FAMILY_CLOSURE_HINT =
  `合法词形（wired）：${PRESET_FAMILY_WIRED.join(" | ")}；` +
  `扩展位（SP 待追认，未接线）：${PRESET_FAMILY_EXTENSION_SLOTS.map((slot) => slot.family).join(" | ")}` +
  "——扩员走显式闭包修订 + Owner 追认（SP 提案通道），禁运行时自造 family 词形。";

/** 探测器输入（argv 收敛后形态）。 */
export interface PresetProbeInput {
  readonly family: string;
  readonly lane?: string;
}

/** 测试/嵌入注入面（缺省 = 发行包 seeds 资产根单点解析）。 */
export interface PresetProbeDeps {
  /** 包内 seeds 资产根覆盖位（缺省 = seedsRootCandidates 解析 src/dist 双形态）。 */
  readonly seedsRoot?: string;
}

// ============================================================
// 词形（动作/漂移/匹配三值闭包——SP 提案待追认）
// ============================================================

/** 预览动作四值闭包：create=目标面缺席 / fill=当前 UNKNOWN / overwrite=异值覆写预告 / none=同值。 */
export type PresetPreviewAction = "create" | "fill" | "overwrite" | "none";

/** 漂移词形（沿既有 STALE/DRIFT 词族；当前 wired 仅 VALUE_DRIFT 一形）。 */
export type PresetDriftKind = "VALUE_DRIFT";

/** 适配匹配三值闭包（provider capabilities native|absent|unknown 三值纪律同构）。 */
export type PresetFitMatch = "native" | "mismatch" | "unresolved";

// ============================================================
// 结果形态（机读 snake_case 面——envelope --json 消费）
// ============================================================

/** 对账分母（红线 10：分母披露纪律——「无漂移/无差异」结论必须带分母证据）。 */
export interface PresetProbeDenominator {
  /** 预设锚叶键总数。 */
  readonly total: number;
  /** 双方均有值且可比的键数。 */
  readonly compared: number;
  /** 预设侧 UNKNOWN（宁缺毋假——无锚可比，不入漂移判卷分母）。 */
  readonly skipped_preset_unknown: number;
  /** 目标面缺席导致的不可对账键数（预设有值而盘面无文件）。 */
  readonly current_absent: number;
  /** 当前侧 UNKNOWN/未选型键数（预设有值而当前缺席）。 */
  readonly current_unknown: number;
}

export interface PresetPreviewEntry {
  /** 叶键词形（tokens = 组路径 color.brand.primary；framework = lane.key frontend.framework）。 */
  readonly key: string;
  readonly preset_value: string;
  /** 当前值（tokens 盘面缺席 = null；framework 恒原始字符串——UNKNOWN 即缺席词形）。 */
  readonly current_value: string | null;
  readonly action_if_applied: PresetPreviewAction;
  /** 覆写/回填的治理通路预告（非授权——探测≠写；none 条目恒 null）。 */
  readonly governed_path: string | null;
}

export interface PresetPreviewResult {
  readonly family: PresetFamilyWired;
  /** lane 过滤（缺席 = 族适用域全集——framework 双 lane；design-tokens 恒 frontend）。 */
  readonly lane: string | null;
  readonly preset_anchor: string;
  readonly target_face: string;
  /** 结构级钉：三件套恒只读（零写入零 store 事务）。 */
  readonly write_surface: "none";
  readonly denominator: PresetProbeDenominator;
  readonly entries: readonly PresetPreviewEntry[];
  /** 确认链效果预告（烙印/BASELINE_DRIFT——G-B 可见草案纪律的观察面镜像）。 */
  readonly chain_effects: readonly string[];
  readonly notes: readonly string[];
}

export interface PresetDriftItem {
  readonly key: string;
  readonly preset_value: string;
  readonly current_value: string;
  readonly drift: PresetDriftKind;
}

export interface PresetDriftResult {
  readonly family: PresetFamilyWired;
  readonly lane: string | null;
  readonly preset_anchor: string;
  readonly write_surface: "none";
  /** aligned=可比且零漂移 / drifted=有漂移项 / no_comparison=空对账分母（blindspot 显式）。 */
  readonly verdict: "aligned" | "drifted" | "no_comparison";
  readonly denominator: PresetProbeDenominator;
  readonly drift_items: readonly PresetDriftItem[];
  /** 预设侧 UNKNOWN 键逐键披露（宁缺毋假——无锚可比不判漂移）。 */
  readonly unanchored: readonly string[];
  /** 确认态字节平面上下文（digest 平面）——值平面（本对账）与字节平面两线并陈。 */
  readonly confirm_state: "absent" | "unconfirmed" | "confirmed" | "pending-change" | "drifted";
  readonly notes: readonly string[];
}

export interface PresetFitLane {
  readonly lane: string;
  readonly applicable: boolean;
  readonly basis: string;
  /** 该 lane 适用对象面数（PRESET_FACE_SPECS 门分组单源）。 */
  readonly faces: number;
}

export interface PresetFitStackRow {
  readonly lane: string;
  readonly key: string;
  /** 当前选型值（未选型/不可对账 = null——UNKNOWN 是缺席词形非值）。 */
  readonly current_value: string | null;
  readonly match: PresetFitMatch;
  readonly basis: string;
}

export interface PresetFitOverlayAsset {
  /** .pomaster 盘面词形（PRESET_FACE_SPECS 来源引用单源）。 */
  readonly path: string;
  /** 包内 seeds 资产在座性（缺席诚实——红线 11 对照基准可溯）。 */
  readonly present: boolean;
}

export interface PresetApplicabilityResult {
  readonly family: PresetFamilyWired;
  readonly lane: string | null;
  readonly preset_source: string;
  readonly write_surface: "none";
  readonly lanes: readonly PresetFitLane[];
  readonly faces: readonly string[];
  /** 栈匹配行（面分工：framework 族当前值对账归 drift 面——本面只声明适用面）。 */
  readonly stack_match: readonly PresetFitStackRow[];
  readonly overlay_assets: readonly PresetFitOverlayAsset[];
  readonly verdict: "applicable" | "partial" | "mismatch";
  readonly notes: readonly string[];
}

// ============================================================
// 词形闸与共享件
// ============================================================

const PREVIEW_COMMAND = "preset preview";
const DRIFT_COMMAND = "preset drift";
const FIT_COMMAND = "preset applicability";

/** family 闸（红线 6 封闭面：词表外 fail-closed，hint 呈全闭包）。 */
function resolveFamily(
  family: string,
): { readonly ok: true; readonly wired: PresetFamilyWired } | { readonly ok: false; readonly error: CliError } {
  const matched = PRESET_FAMILY_WIRED.find((entry) => entry === family);
  if (matched !== undefined) return { ok: true, wired: matched };
  return {
    ok: false,
    error: {
      code: "PRESET_FAMILY_UNKNOWN",
      message: `family 词形不在预设族闭包：${family}（wired ${PRESET_FAMILY_WIRED.length} 族 + 扩展位 ${PRESET_FAMILY_EXTENSION_SLOTS.length} 族——红线 6 封闭面）`,
      hint: FAMILY_CLOSURE_HINT,
    },
  };
}

/** lane 适用域闸（design-tokens 恒 frontend；framework 双 lane 可过滤）。 */
function resolveLanes(
  family: PresetFamilyWired,
  lane: string | undefined,
): { readonly ok: true; readonly lanes: readonly BaselineLane[] } | { readonly ok: false; readonly error: CliError } {
  if (family === "design-tokens") {
    if (lane === undefined || lane === "frontend") return { ok: true, lanes: ["frontend"] };
    return {
      ok: false,
      error: {
        code: "PRESET_LANE_INVALID",
        message: `design-tokens 族适用域恒 frontend（目标面 ${BASELINE_DESIGN_TOKENS_TARGET} 属 frontend 分区）：--lane ${lane} 非法`,
        hint: "省略 --lane 或 --lane frontend。",
      },
    };
  }
  if (lane === undefined) return { ok: true, lanes: [...BASELINE_LANES] };
  const matched = BASELINE_LANES.find((entry) => entry === lane);
  if (matched !== undefined) return { ok: true, lanes: [matched] };
  return {
    ok: false,
    error: {
      code: "PRESET_LANE_INVALID",
      message: `lane 词形不在 BASELINE_LANES 闭包：${lane}（合法词形：${BASELINE_LANES.join(" | ")}）`,
      hint: `示例：--lane frontend；省略 --lane = 双 lane 全域。`,
    },
  };
}

function failProbe<T>(
  command: string,
  result: T,
  error: CliError,
): CommandOutcome<T> {
  return failOutcome<T>(command, result, [error], [
    `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

/** 确认态读取 → grounding 同款五值词形（readBaselineConfirmation 单源——禁第二套三态机）。 */
async function confirmStateOf(
  rootDir: string,
): Promise<"absent" | "unconfirmed" | "confirmed" | "pending-change" | "drifted"> {
  const read = await readBaselineConfirmation(rootDir);
  if (read.kind === "manifest-absent") return "absent";
  if (read.kind === "manifest-unreadable" || read.kind === "record-invalid") return "unconfirmed";
  return read.state;
}

/** 预设栈候选锚（STACK_QUESTIONS 逐键候选首位——R-E 实战栈，候选值单一来源）。 */
function presetStackCandidates(lane: BaselineLane): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const question of STACK_QUESTIONS) {
    if (question.lane !== lane) continue;
    map.set(question.key, question.options[0] ?? "");
  }
  return map;
}

// ============================================================
// design-tokens 族（族 4）预设锚装载（包内 seed——值值有出处注记载体）
// ============================================================

/** 包内 seed 资产路径（相对 seeds 根——manifest.json 条目 asset 词形同源）。 */
const TOKENS_SEED_ASSET = "baseline/frontend/design-tokens.yaml";
const TOKENS_PRESET_ANCHOR =
  `package-seed:${TOKENS_SEED_ASSET}（origin=preset——值值有出处注记在座，逐值可溯官方默认主题具名 token 词形）`;
const UNKNOWN_WORDFORM = "UNKNOWN";

function defaultSeedsRoot(deps: PresetProbeDeps): string | null {
  if (deps.seedsRoot !== undefined) return deps.seedsRoot;
  for (const candidate of seedsRootCandidates(import.meta.url)) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 叶键展平（meta 外全组；leaf = 非纯对象值——数组按整体叶处理，键路径点连）。 */
function flattenLeafValues(
  node: Record<string, unknown>,
  out: Map<string, unknown>,
): void {
  const walk = (prefix: string, value: unknown): void => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        walk(prefix === "" ? key : `${prefix}.${key}`, child);
      }
      return;
    }
    out.set(prefix, value);
  };
  walk("", node);
}

/** 标量值 canonical 词形（数值/布尔回写差异判等——YAML 数值与字符串同值不误报）。 */
function canonicalScalar(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

type TokensSeedLoad =
  | { readonly ok: true; readonly leaves: ReadonlyMap<string, unknown> }
  | { readonly ok: false; readonly detail: string };

/**
 * design-tokens 预设锚装载（包内 seed 字节纯读）：YAML 不可解析 / 根非映射 →
 * fail-closed（包结构缺陷显式化，禁静默当空锚——空锚的「无差异」不可信）。
 * seed 字节形状由 baseline-seeds.spec 钉定（schema 22 校验归盘面装载单点
 * readDesignTokens——本面不二次跑 schema，禁双维护）。
 */
function readTokensPresetSeed(seedsRoot: string | null): TokensSeedLoad {
  if (seedsRoot === null) {
    return { ok: false, detail: "seeds 资产根不可定位（发行包结构缺陷——src/dist 双形态均未命中）" };
  }
  const absolute = `${seedsRoot}/${TOKENS_SEED_ASSET}`;
  let text: string;
  try {
    text = readFileSync(absolute, "utf8");
  } catch (error) {
    return { ok: false, detail: `包内预设锚不可读: ${error instanceof Error ? error.message : String(error)}` };
  }
  let parsed: unknown;
  try {
    parsed = loadYaml(text);
  } catch (error) {
    return { ok: false, detail: `预设锚 YAML 不可解析: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, detail: "预设锚根须为映射（meta + token 分组）" };
  }
  const leaves = new Map<string, unknown>();
  const root: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  delete root["meta"];
  flattenLeafValues(root, leaves);
  return { ok: true, leaves };
}

// ============================================================
// 命令一：preset preview（预览 diff——若应用该预设将改变什么）
// ============================================================

const TOKENS_GOVERNED_PATH =
  "design-tokens customize 通路（22 号 schema meta.customized 机器位）+ 确认链重确认——探测≠写授权，本探测器零写入";

function previewDenominator(total: number, compared: number, skipped: number, absent: number, unknown: number): PresetProbeDenominator {
  return {
    total,
    compared,
    skipped_preset_unknown: skipped,
    current_absent: absent,
    current_unknown: unknown,
  };
}

async function previewDesignTokens(
  rootDir: string,
  deps: PresetProbeDeps,
): Promise<CommandOutcome<PresetPreviewResult>> {
  const seed = readTokensPresetSeed(defaultSeedsRoot(deps));
  if (!seed.ok) {
    return failProbe(PREVIEW_COMMAND, emptyPreview("design-tokens"), {
      code: "SCHEMA_INVALID",
      message: `design-tokens 预设锚装载失败：${seed.detail}`,
      hint: "发行包 seeds/baseline/frontend/design-tokens.yaml 应在座（包结构缺陷请报告）；本面不猜测空锚。",
    });
  }
  const read = await readDesignTokens(rootDir);
  if (read.kind === "invalid") {
    return failProbe(PREVIEW_COMMAND, emptyPreview("design-tokens"), {
      code: "SCHEMA_INVALID",
      message: `盘面 design-tokens 装载失败（坏合同≠无合同，禁静默当空表）：${read.detail}`,
      hint: "修复或从 git 恢复 .pomaster/baseline/frontend/design-tokens.yaml 后重试；探测器不猜测损坏面语义。",
    });
  }
  const currentLeaves = new Map<string, unknown>();
  if (read.kind === "ok") {
    flattenLeafValues(read.doc.groups as Record<string, unknown>, currentLeaves);
  }
  const targetAbsent = read.kind === "absent";

  const entries: PresetPreviewEntry[] = [];
  let compared = 0;
  let skippedUnknown = 0;
  let currentUnknown = 0;
  let currentAbsent = 0;
  const presetEntries = [...seed.leaves.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const [key, presetRaw] of presetEntries) {
    const presetValue = canonicalScalar(presetRaw);
    if (presetValue === UNKNOWN_WORDFORM) {
      skippedUnknown += 1;
      continue;
    }
    if (targetAbsent || !currentLeaves.has(key)) {
      currentAbsent += 1;
      entries.push({
        key,
        preset_value: presetValue,
        current_value: null,
        action_if_applied: "create",
        governed_path: TOKENS_GOVERNED_PATH,
      });
      continue;
    }
    const currentValue = canonicalScalar(currentLeaves.get(key));
    if (currentValue === UNKNOWN_WORDFORM) {
      currentUnknown += 1;
      entries.push({
        key,
        preset_value: presetValue,
        current_value: currentValue,
        action_if_applied: "fill",
        governed_path: TOKENS_GOVERNED_PATH,
      });
      continue;
    }
    compared += 1;
    if (currentValue === presetValue) {
      entries.push({ key, preset_value: presetValue, current_value: currentValue, action_if_applied: "none", governed_path: null });
      continue;
    }
    entries.push({
      key,
      preset_value: presetValue,
      current_value: currentValue,
      action_if_applied: "overwrite",
      governed_path: TOKENS_GOVERNED_PATH,
    });
  }

  const confirmState = await confirmStateOf(rootDir);
  const chainEffects =
    confirmState === "confirmed" || confirmState === "pending-change" || confirmState === "drifted"
      ? [
          `确认态在座（${confirmState}）：直接改写本文件将造成确认 digest 失配 → BASELINE_DRIFT（drifted_files 指名）；授权变更走确认链通路（baseline set --change 为栈键专用；design-tokens 经 customize 后须 confirm 重确认烙印）`,
        ]
      : [
          "确认记录不在座：baseline confirm 时本文件整体 digest 快照烙印（确认链第 25 文件）；origin=preset 值 Owner 确认前不构成项目事实（advisory）",
        ];
  const result: PresetPreviewResult = {
    family: "design-tokens",
    lane: "frontend",
    preset_anchor: TOKENS_PRESET_ANCHOR,
    target_face: BASELINE_DESIGN_TOKENS_TARGET,
    write_surface: "none",
    denominator: previewDenominator(
      presetEntries.length,
      compared,
      skippedUnknown,
      currentAbsent,
      currentUnknown,
    ),
    entries,
    chain_effects: chainEffects,
    notes: [
      "origin=preset 值为 advisory（22-design-tokens.schema advisory_preset_values——Owner 确认前不构成项目事实）",
      "预览 = 只读差异清单，零应用零写入；应用通路 = customize + 确认链（G-B：可见草案非静默预填）",
    ],
  };
  return okOutcome(PREVIEW_COMMAND, result, renderPreview(result));
}

function emptyPreview(family: PresetFamilyWired): PresetPreviewResult {
  return {
    family,
    lane: null,
    preset_anchor: "",
    target_face: "",
    write_surface: "none",
    denominator: previewDenominator(0, 0, 0, 0, 0),
    entries: [],
    chain_effects: [],
    notes: [],
  };
}

function frameworkLaneFaces(lane: BaselineLane): number {
  return PRESET_FACE_SPECS.filter((face) => face.lane === lane).length;
}

async function previewBaselineFramework(
  rootDir: string,
  lanes: readonly BaselineLane[],
): Promise<CommandOutcome<PresetPreviewResult>> {
  const entries: PresetPreviewEntry[] = [];
  const chainEffects: string[] = [];
  let compared = 0;
  let total = 0;
  for (const lane of lanes) {
    const read = await loadLaneStackValues(rootDir, lane);
    if (!read.ok) {
      return failProbe(PREVIEW_COMMAND, emptyPreview("baseline-framework"), {
        code: "NOT_CONFIGURED",
        message: `${baselineStackRelative(lane)} 缺席或不可解析（未播种禁猜测）`,
        hint: "先 pomaster init 播种 baseline（seed-once）后重试；探测器不重写项目基线文件。",
      });
    }
    const preset = presetStackCandidates(lane);
    const laneTotal = STACK_QUESTIONS.filter((question) => question.lane === lane).length;
    let resolved = 0;
    for (const key of preset.keys()) {
      total += 1;
      const presetValue = preset.get(key) ?? "";
      const current = read.values.get(key) ?? UNKNOWN_WORDFORM;
      if (isStackValueResolved(current)) resolved += 1;
      if (!isStackValueResolved(current)) {
        entries.push({
          key: `${lane}.${key}`,
          preset_value: presetValue,
          current_value: current,
          action_if_applied: "fill",
          governed_path: `pomaster baseline set --lane ${lane} --key ${key} --value ${presetValue}（UNKNOWN 键后补销账通路；探测≠写授权——本探测器零写入）`,
        });
        continue;
      }
      if (current === presetValue) {
        compared += 1;
        entries.push({ key: `${lane}.${key}`, preset_value: presetValue, current_value: current, action_if_applied: "none", governed_path: null });
        continue;
      }
      compared += 1;
      entries.push({
        key: `${lane}.${key}`,
        preset_value: presetValue,
        current_value: current,
        action_if_applied: "overwrite",
        governed_path: `pomaster baseline set --lane ${lane} --key ${key} --value ${presetValue}（确认态在座须持 --change <CHANGE-id>——pending-change 治理通路；探测≠写授权）`,
      });
    }
    const faces = frameworkLaneFaces(lane);
    chainEffects.push(
      resolved === laneTotal
        ? `${lane}：栈键 resolved ${resolved}/${laneTotal}——lane 门已开：init 步骤 4.9 将为 ${faces} 面 baseline md 生成 PRESET-DRAFT 草案（G-B 可见草案非静默预填；确认态在座则整体跳过）`
        : `${lane}：栈键 resolved ${resolved}/${laneTotal}——lane 门未开（ADR-1 门粒度 = lane 全销账）；全键按预设落位后 init 步骤 4.9 将为 ${faces} 面 baseline md 生成 PRESET-DRAFT 草案（PRESET-DRAFT 非权威——Owner 确认后成为基线）`,
    );
  }
  const result: PresetPreviewResult = {
    family: "baseline-framework",
    lane: lanes.length === BASELINE_LANES.length ? null : (lanes[0] ?? null),
    preset_anchor: "STACK_QUESTIONS 逐键候选首位（R-E 实战栈——预设候选值单一来源，baseline.ts STACK_QUESTIONS）",
    target_face: [...lanes.map((lane) => baselineStackRelative(lane))].join(" + "),
    write_surface: "none",
    denominator: previewDenominator(total, compared, 0, 0, total - compared),
    entries,
    chain_effects: chainEffects,
    notes: [
      "preset 锚 = 问卷候选首位（R-E 实战栈）：改型走 baseline set --change 治理通路；漂移对账归 preset drift 面",
      "探测≠写授权：本报告零写入；lane 销账写入唯一通路 = init 问卷 / baseline set（确认链语义不旁路）",
    ],
  };
  return okOutcome(PREVIEW_COMMAND, result, renderPreview(result));
}

function renderPreview(result: PresetPreviewResult): string[] {
  const counts = new Map<string, number>();
  for (const entry of result.entries) {
    counts.set(entry.action_if_applied, (counts.get(entry.action_if_applied) ?? 0) + 1);
  }
  const actionSummary = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([action, count]) => `${action}=${count}`)
    .join(" / ");
  const lines = [
    `preset preview → family=${result.family}（预设只读探测三件套·预览 diff；write_surface=none 零写入）`,
    `  分母: total=${result.denominator.total} compared=${result.denominator.compared} skipped_preset_unknown=${result.denominator.skipped_preset_unknown}`,
    `  动作预告: ${actionSummary || "(无条目)"}`,
    ...result.chain_effects.map((effect) => `  效果: ${effect}`),
    ...result.notes.map((note) => `  注记: ${note}`),
  ];
  return lines;
}

export async function runPresetPreview(
  rootDir: string,
  input: PresetProbeInput,
  deps: PresetProbeDeps = {},
): Promise<CommandOutcome<PresetPreviewResult>> {
  const family = resolveFamily(input.family);
  if (!family.ok) return failProbe(PREVIEW_COMMAND, emptyPreview("design-tokens"), family.error);
  const lanes = resolveLanes(family.wired, input.lane);
  if (!lanes.ok) return failProbe(PREVIEW_COMMAND, emptyPreview(family.wired), lanes.error);
  if (family.wired === "design-tokens") return previewDesignTokens(rootDir, deps);
  return previewBaselineFramework(rootDir, lanes.lanes);
}

// ============================================================
// 命令二：preset drift（漂移检测——当前值 vs 预设基准逐项对账）
// ============================================================

function emptyDrift(family: PresetFamilyWired): PresetDriftResult {
  return {
    family,
    lane: null,
    preset_anchor: "",
    write_surface: "none",
    verdict: "no_comparison",
    denominator: previewDenominator(0, 0, 0, 0, 0),
    drift_items: [],
    unanchored: [],
    confirm_state: "absent",
    notes: [],
  };
}

const DRIFT_NOTES = [
  "漂移≠违规：Owner 定制/选型合法（meta.customized 机器位 + baseline set --change + confirm 烙印通路）——本报告只呈现与预设基准的逐值差异，零写入",
  "分母披露（blindspot 纪律）：「无漂移」结论以 compared 分母证据为界——空分母显式 no_comparison，禁没查就报干净",
];

async function driftDesignTokens(
  rootDir: string,
  deps: PresetProbeDeps,
): Promise<CommandOutcome<PresetDriftResult>> {
  const seed = readTokensPresetSeed(defaultSeedsRoot(deps));
  if (!seed.ok) {
    return failProbe(DRIFT_COMMAND, emptyDrift("design-tokens"), {
      code: "SCHEMA_INVALID",
      message: `design-tokens 预设锚装载失败：${seed.detail}`,
      hint: "发行包 seeds/baseline/frontend/design-tokens.yaml 应在座（包结构缺陷请报告）；本面不猜测空锚。",
    });
  }
  const read = await readDesignTokens(rootDir);
  if (read.kind === "invalid") {
    return failProbe(DRIFT_COMMAND, emptyDrift("design-tokens"), {
      code: "SCHEMA_INVALID",
      message: `盘面 design-tokens 装载失败（坏合同≠无合同，禁静默当空表）：${read.detail}`,
      hint: "修复或从 git 恢复 .pomaster/baseline/frontend/design-tokens.yaml 后重试；探测器不猜测损坏面语义。",
    });
  }
  const currentLeaves = new Map<string, unknown>();
  if (read.kind === "ok") {
    flattenLeafValues(read.doc.groups as Record<string, unknown>, currentLeaves);
  }
  const targetAbsent = read.kind === "absent";
  const driftItems: PresetDriftItem[] = [];
  const unanchored: string[] = [];
  let compared = 0;
  let currentAbsent = 0;
  let currentUnknown = 0;
  const presetEntries = [...seed.leaves.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const [key, presetRaw] of presetEntries) {
    const presetValue = canonicalScalar(presetRaw);
    if (presetValue === UNKNOWN_WORDFORM) {
      unanchored.push(key);
      continue;
    }
    if (targetAbsent || !currentLeaves.has(key)) {
      currentAbsent += 1;
      continue;
    }
    const currentValue = canonicalScalar(currentLeaves.get(key));
    if (currentValue === UNKNOWN_WORDFORM) {
      currentUnknown += 1;
      continue;
    }
    compared += 1;
    if (currentValue !== presetValue) {
      driftItems.push({ key, preset_value: presetValue, current_value: currentValue, drift: "VALUE_DRIFT" });
    }
  }
  const verdict: PresetDriftResult["verdict"] =
    compared === 0 ? "no_comparison" : driftItems.length > 0 ? "drifted" : "aligned";
  const result: PresetDriftResult = {
    family: "design-tokens",
    lane: "frontend",
    preset_anchor: TOKENS_PRESET_ANCHOR,
    write_surface: "none",
    verdict,
    denominator: previewDenominator(presetEntries.length, compared, unanchored.length, currentAbsent, currentUnknown),
    drift_items: driftItems,
    unanchored,
    confirm_state: await confirmStateOf(rootDir),
    notes: DRIFT_NOTES,
  };
  return okOutcome(DRIFT_COMMAND, result, renderDrift(result));
}

async function driftBaselineFramework(
  rootDir: string,
  lanes: readonly BaselineLane[],
): Promise<CommandOutcome<PresetDriftResult>> {
  const driftItems: PresetDriftItem[] = [];
  let compared = 0;
  let total = 0;
  let currentUnknown = 0;
  for (const lane of lanes) {
    const read = await loadLaneStackValues(rootDir, lane);
    if (!read.ok) {
      return failProbe(DRIFT_COMMAND, emptyDrift("baseline-framework"), {
        code: "NOT_CONFIGURED",
        message: `${baselineStackRelative(lane)} 缺席或不可解析（未播种禁猜测）`,
        hint: "先 pomaster init 播种 baseline（seed-once）后重试；探测器不重写项目基线文件。",
      });
    }
    const preset = presetStackCandidates(lane);
    for (const key of preset.keys()) {
      total += 1;
      const presetValue = preset.get(key) ?? "";
      const current = read.values.get(key) ?? UNKNOWN_WORDFORM;
      if (!isStackValueResolved(current)) {
        currentUnknown += 1;
        continue;
      }
      compared += 1;
      if (current !== presetValue) {
        driftItems.push({
          key: `${lane}.${key}`,
          preset_value: presetValue,
          current_value: current,
          drift: "VALUE_DRIFT",
        });
      }
    }
  }
  const verdict: PresetDriftResult["verdict"] =
    compared === 0 ? "no_comparison" : driftItems.length > 0 ? "drifted" : "aligned";
  const result: PresetDriftResult = {
    family: "baseline-framework",
    lane: lanes.length === BASELINE_LANES.length ? null : (lanes[0] ?? null),
    preset_anchor: "STACK_QUESTIONS 逐键候选首位（R-E 实战栈——预设候选值单一来源，baseline.ts STACK_QUESTIONS）",
    write_surface: "none",
    verdict,
    denominator: previewDenominator(total, compared, 0, 0, currentUnknown),
    drift_items: driftItems,
    unanchored: [],
    confirm_state: await confirmStateOf(rootDir),
    notes: DRIFT_NOTES,
  };
  return okOutcome(DRIFT_COMMAND, result, renderDrift(result));
}

function renderDrift(result: PresetDriftResult): string[] {
  const lines = [
    `preset drift → family=${result.family} verdict=${result.verdict}（预设只读探测三件套·漂移检测；write_surface=none）`,
    `  分母: total=${result.denominator.total} compared=${result.denominator.compared}` +
      ` skipped_preset_unknown=${result.denominator.skipped_preset_unknown}` +
      ` current_absent=${result.denominator.current_absent} current_unknown=${result.denominator.current_unknown}`,
    `  确认态（字节平面）: ${result.confirm_state}`,
    ...result.drift_items.map(
      (item) => `  漂移: ${item.key} ${item.drift}（预设 ${item.preset_value} ↔ 当前 ${item.current_value}）`,
    ),
    ...(result.unanchored.length > 0
      ? [`  unanchored（预设无锚可比，宁缺毋假）: ${result.unanchored.join("、")}`]
      : []),
    ...result.notes.map((note) => `  注记: ${note}`),
  ];
  return lines;
}

export async function runPresetDrift(
  rootDir: string,
  input: PresetProbeInput,
  deps: PresetProbeDeps = {},
): Promise<CommandOutcome<PresetDriftResult>> {
  const family = resolveFamily(input.family);
  if (!family.ok) return failProbe(DRIFT_COMMAND, emptyDrift("design-tokens"), family.error);
  const lanes = resolveLanes(family.wired, input.lane);
  if (!lanes.ok) return failProbe(DRIFT_COMMAND, emptyDrift(family.wired), lanes.error);
  if (family.wired === "design-tokens") return driftDesignTokens(rootDir, deps);
  return driftBaselineFramework(rootDir, lanes.lanes);
}

// ============================================================
// 命令三：preset applicability（适配分析——适用 lane/栈/对象面声明）
// ============================================================

function emptyFit(family: PresetFamilyWired): PresetApplicabilityResult {
  return {
    family,
    lane: null,
    preset_source: "",
    write_surface: "none",
    lanes: [],
    faces: [],
    stack_match: [],
    overlay_assets: [],
    verdict: "partial",
    notes: [],
  };
}

/** design-tokens 预设主源栈词（SP 提案：ui=antdesign 词形；css=cssinjs 词形——seed 出处注记同源）。 */
const TOKENS_HOME_STACK_WORDS: readonly { readonly key: string; readonly words: readonly string[]; readonly basis: string }[] = [
  {
    key: "ui",
    words: ["antdesign", "ant-design"],
    basis: "预设值主源 = Ant Design v5 cssinjs 默认主题（seed 出处注记）——ui 选型命中 antdesign 词形即 native",
  },
  {
    key: "css",
    words: ["cssinjs"],
    basis: "预设值与本仓 cssinjs 主题栈同源——css 选型命中 cssinjs 词形即 native",
  },
];

/** overlay 资产在座性（PRESET_FACE_SPECS 条件命中 → stacks/ 来源词形 → 包内 seeds 实存核验）。 */
function presetOverlayAssets(
  lanes: readonly BaselineLane[],
  seedsRoot: string | null,
): PresetFitOverlayAsset[] {
  const candidates = new Set<string>();
  for (const lane of lanes) {
    const preset = presetStackCandidates(lane);
    for (const face of PRESET_FACE_SPECS) {
      if (face.lane !== lane) continue;
      for (const entry of face.entries) {
        if (entry.when === undefined) continue;
        const presetValue = preset.get(entry.when.key) ?? "";
        if (!entry.when.words.some((word) => matchStackValue(presetValue, word))) continue;
        for (const source of entry.sources) {
          if (source.path.includes("specs/hard/stacks/")) candidates.add(source.path);
        }
      }
    }
  }
  return [...candidates].sort().map((path) => ({
    path,
    present: seedsRoot !== null && existsSync(`${seedsRoot}/${path.replace(/^\.pomaster\//, "")}`),
  }));
}

async function fitDesignTokens(
  rootDir: string,
): Promise<CommandOutcome<PresetApplicabilityResult>> {
  const stackRead = await loadLaneStackValues(rootDir, "frontend");
  const stackMatch: PresetFitStackRow[] = [];
  for (const spec of TOKENS_HOME_STACK_WORDS) {
    const current = stackRead.ok ? (stackRead.values.get(spec.key) ?? UNKNOWN_WORDFORM) : null;
    if (current === null || !isStackValueResolved(current)) {
      stackMatch.push({
        lane: "frontend",
        key: spec.key,
        current_value: null,
        match: "unresolved",
        basis: stackRead.ok
          ? `${spec.basis}（当前未选型——advisory 匹配悬置，禁猜测）`
          : `${spec.basis}（栈文件缺席/不可读——无法对账，缺席诚实）`,
      });
      continue;
    }
    const native = spec.words.some((word) => matchStackValue(current, word));
    stackMatch.push({
      lane: "frontend",
      key: spec.key,
      current_value: current,
      match: native ? "native" : "mismatch",
      basis: native
        ? spec.basis
        : `${spec.basis}（当前 ${spec.key}=${current} 与预设主源词形不匹配——预设值视为异源参照，advisory 不改判卷）`,
    });
  }
  const verdict: PresetApplicabilityResult["verdict"] =
    stackMatch.some((row) => row.match === "mismatch")
      ? "mismatch"
      : stackMatch.every((row) => row.match === "native") && stackMatch.length > 0
        ? "applicable"
        : "partial";
  const result: PresetApplicabilityResult = {
    family: "design-tokens",
    lane: "frontend",
    preset_source: "Ant Design v5 cssinjs 默认主题（seeds/baseline/frontend/design-tokens.yaml 值值有出处注记——逐值可溯官方默认主题具名 token 词形）",
    write_surface: "none",
    lanes: [
      {
        lane: "frontend",
        applicable: true,
        basis: `目标面 ${BASELINE_DESIGN_TOKENS_TARGET} 属 frontend 分区（BASELINE_DESIGN_TOKENS_TARGET——确认链第 25 文件）`,
        faces: 1,
      },
    ],
    faces: [BASELINE_DESIGN_TOKENS_TARGET],
    stack_match: stackMatch,
    overlay_assets: [],
    verdict,
    notes: [
      "origin=preset 值为 advisory（Owner 经 baseline confirm 确认前不构成项目事实）——适配分析只读匹配，不改变 ADR-4 判卷与 overlay 播种行为",
      "对照基准逐值具名可溯（红线 11）：seed 出处注记为主源锚；异源栈（mismatch）下预设值仅作参照不作判卷基线",
      "探测≠写授权：本报告零写入；overlay_assets 空 = design-tokens 族无 overlay 载体（面分工声明）",
    ],
  };
  return okOutcome(FIT_COMMAND, result, renderFit(result));
}

function fitBaselineFramework(
  lanes: readonly BaselineLane[],
  seedsRoot: string | null,
): CommandOutcome<PresetApplicabilityResult> {
  const overlayAssets = presetOverlayAssets(lanes, seedsRoot);
  const allPresent = overlayAssets.length > 0 && overlayAssets.every((asset) => asset.present);
  const verdict: PresetApplicabilityResult["verdict"] = allPresent ? "applicable" : "partial";
  const laneWordform = lanes.length === BASELINE_LANES.length ? null : (lanes[0] ?? null);
  const result: PresetApplicabilityResult = {
    family: "baseline-framework",
    lane: laneWordform,
    preset_source: "STACK_QUESTIONS 逐键候选首位（R-E 实战栈——预设候选值单一来源，baseline.ts STACK_QUESTIONS）",
    write_surface: "none",
    lanes: lanes.map((lane) => ({
      lane,
      applicable: true,
      basis: `STACK_QUESTIONS ${lane} 键集候选首位闭包在座（候选值单一来源）；ADR-1 门粒度 = lane 全销账`,
      faces: frameworkLaneFaces(lane),
    })),
    faces: BASELINE_CONFIRM_TARGETS.filter((target) => {
      if (target === BASELINE_DESIGN_TOKENS_TARGET) return false;
      const partition = target.split("/")[1] ?? "";
      if (partition === "frontend") return lanes.includes("frontend");
      if (partition === "backend" || partition === "data" || partition === "platform") {
        return lanes.includes("backend");
      }
      return false;
    }),
    stack_match: [],
    overlay_assets: overlayAssets,
    verdict,
    notes: [
      "面分工：当前栈值对账归 preset drift 面（drift=当前值 vs 预设基准；本面=预设适用 lane/栈/对象面声明，只读匹配不改 ADR-4 判卷）",
      "overlay_assets = 预设栈词（ADR-4 条件命中）的 stacks/ 资产在座性——缺席诚实（缺席栈只有主题文档条目，不发明 overlay 内容）",
      "探测≠写授权：本报告零写入；适用≠激活——栈选型写入唯一通路 = init 问卷 / baseline set --change",
    ],
  };
  return okOutcome(FIT_COMMAND, result, renderFit(result));
}

function renderFit(result: PresetApplicabilityResult): string[] {
  const lines = [
    `preset applicability → family=${result.family} verdict=${result.verdict}（预设只读探测三件套·适配分析；write_surface=none）`,
    `  预设源: ${result.preset_source}`,
    ...result.lanes.map((lane) => `  lane: ${lane.lane} applicable=${lane.applicable} faces=${lane.faces}——${lane.basis}`),
    ...result.stack_match.map(
      (row) => `  栈匹配: ${row.lane}.${row.key}=${row.current_value ?? "(未选型)"} → ${row.match}（${row.basis}）`,
    ),
    ...result.overlay_assets.map(
      (asset) => `  overlay: ${asset.path} present=${asset.present}`,
    ),
    ...result.notes.map((note) => `  注记: ${note}`),
  ];
  return lines;
}

export async function runPresetApplicability(
  rootDir: string,
  input: PresetProbeInput,
  deps: PresetProbeDeps = {},
): Promise<CommandOutcome<PresetApplicabilityResult>> {
  const family = resolveFamily(input.family);
  if (!family.ok) return failProbe(FIT_COMMAND, emptyFit("design-tokens"), family.error);
  const lanes = resolveLanes(family.wired, input.lane);
  if (!lanes.ok) return failProbe(FIT_COMMAND, emptyFit(family.wired), lanes.error);
  if (family.wired === "design-tokens") return fitDesignTokens(rootDir);
  return fitBaselineFramework(lanes.lanes, defaultSeedsRoot(deps));
}
