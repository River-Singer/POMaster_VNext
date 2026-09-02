/**
 * resolver.ts —— 统一语义解析门面（P-v06 批次 0 Model Constitution；
 * PRD v0.6 §98 Resolver + v0.6.1 §69 Requirement Resolution SOP / §73 Resolver
 * Contract / §87 Anti-Hallucination + Owner 裁决 D-2 2026-09-02）。
 *
 * 出处锚：
 * - PRD v0.6 §98：`pomaster resolve "searchable select"` → MATCH COMPONENT.SEARCH_SELECT
 *   + implementation + state_profile——「Resolver 可扩展到 API、Service、Field、Event、
 *   Pattern、Policy」（本面 batch 0 覆盖 truth 对象 + catalog archetype；state_profile
 *   等扩展位归批次 2+）。
 * - PRD v0.6.1 §69 六分类（EXACT/CONFIGURABLE/COMPOSABLE/EXTENSIBLE/REFERENCE/NO_MATCH
 *   逐字；「只有 NO_MATCH 才允许进入 Design Synthesis」）；§73 输出契约（match /
 *   confidence / why / alternatives / required_bindings / required_gates）。
 * - PRD v0.6.1 §87 Anti-Hallucination：Agent 不允许 invent catalog id；Catalog miss
 *   必须显式 NO_MATCH；Resolver 必须说明 why match / what bindings——**advisory 面
 *   （knowledge/policy）命中不改变 match_class**（advisory ≠ match，本面 batch 0
 *   根本不检 advisory 面——防洗白的最强形态，代码注记即契约）。
 *
 * 三条现行纪律（本模块的结构性落法）：
 * ① 单一实现禁第二套：解析腿复用既有三腿链原语——精确 id（parseGovernedId，A5）→
 *    A6 机械别名（resolveAlias 本体零改动）→ 等价表 active 精确（resolveWordForm）；
 *    词形化复用 knowledgeQueryTokens（词级精确、CJK 整段、禁子串/模糊猜测——P28/
 *    P31 同源纪律）。本面只做门面组合与 match_class 派生，零发明第二套解析。
 * ② match_class 派生确定性（禁 LLM 主观判档——C5 判定来自工具信号同源纪律）：
 *    EXACT_MATCH=精确腿命中（id/alias/equivalence）；CONFIGURABLE_MATCH=archetype
 *    命中（标准件需实例化配置——v0.6.1 §70 用户管理判例）；EXTENSIBLE_MATCH=仅项目
 *    对象词形命中（现有对象可扩展承载）；NO_MATCH=两分母（truth 行 + archetype 条目）
 *    零命中。COMPOSABLE_MATCH / REFERENCE_MATCH 为批次 2+ 组合分析预留位（词表登记
 *    全闭包、派生覆盖子集——缺席显式不伪造）。
 * ③ 分母披露（禁「没查就说没有」）：sources_examined 披露 truth_rows /
 *    catalog_archetypes / equivalence_groups 三分母——NO_MATCH 的可信度来自分母
 *    在场（空 store 的 NO_MATCH 与 2000 行 store 的 NO_MATCH 语义不同，必须可判别）。
 *
 * 存储纪律：纯读零写入（loadTruthIndex 只读 + readEquivalenceRegistry 只读 +
 * loadCatalogArchetypes 只读）；解析不落盘、不产边（INSTANCE_OF 边由显式采用动作
 * 经 relations.registerRelation 登记——解析 ≠ 采用，equivalence「登记≠裁决」同族）。
 */
import {
  loadCatalogArchetypes,
} from "./catalog.js";
import { GovernanceError } from "./errors.js";
import { GovernedIdParseError } from "./errors.js";
import { parseGovernedId, resolveAlias } from "./id.js";
import { knowledgeQueryTokens } from "./knowledge.js";
import { readEquivalenceRegistry } from "./equivalence.js";
import { pathsOf } from "./paths.js";
import { loadTruthIndex } from "./store.js";
import { familyOfId } from "./family.js";
import type { ObjectFamilyValue, ResolutionMatchClassValue } from "./vocab.js";

/** New Entity Gate 门禁定义锚词形（解析产物的「若走 Design New 必过之门」披露位；批次 1 落 recipe）。 */
export const NEW_ENTITY_GATE_DEF = "POLICY.GATE.NEW_ENTITY.CHECKS@0.1.0" as const;

// ============================================================
// 输入 / 输出契约（PRD v0.6.1 §73 Resolver Contract）
// ============================================================

/** resolveNeed 输入。 */
export interface ResolverRequestInput {
  /** 需求词形（自然语言/意图原文；词形化归 knowledgeQueryTokens 同一实现）。 */
  readonly need: string;
  /** 补充检索词（同 searchKnowledge hints 语义；禁子串猜测）。 */
  readonly hints?: readonly string[];
}

/** 单条解析命中。 */
export interface ResolverMatch {
  readonly domain: "truth" | "catalog";
  readonly id: string;
  /** truth kind 十类或 "archetype"（catalog 面）。 */
  readonly kind: string;
  readonly title_zh: string;
  /** 命中腿（§73 why 的结构化位）。 */
  readonly via: "exact_id" | "exact_id_via_alias" | "equivalence_active" | "token_match";
  /** 命中词形（token_match 时的 why-matched 披露；精确腿为 null）。 */
  readonly matched_tokens: readonly string[];
  /** family 派生视图（truth 面；catalog 恒 null——标准件不属项目对象族）。 */
  readonly family: ObjectFamilyValue | null;
}

/** resolveNeed 输出（§73 契约 + 分母披露）。 */
export interface ResolverOutcome {
  readonly input: {
    readonly need: string;
    readonly hints: readonly string[];
  };
  /** 匹配分类（§69 六分类；派生规则见模块头纪律②）。 */
  readonly match_class: ResolutionMatchClassValue;
  /** 主命中集（精确腿独占或词形命中全集）。 */
  readonly matches: readonly ResolverMatch[];
  /** 候选披露位（精确腿命中时其词形命中候选；不改变 match_class——§73 alternatives）。 */
  readonly alternatives: readonly ResolverMatch[];
  /** 命中 archetype 的 composition.requires 聚合（去重字典序；§73 required_bindings）。 */
  readonly required_bindings: readonly string[];
  /**
   * 走 Design New 必过之门（NEW_ENTITY_GATE_DEF 披露位；恒含——无论 match_class，
   * 新实体门禁对任何新对象生效，v0.6.1 §75）。
   */
  readonly required_gates: readonly string[];
  /** 人读 why（「为什么 match / 为什么 NO_MATCH」——§87 必答位）。 */
  readonly why: string;
  /** 分母披露（禁「没查就说没有」——纪律③）。 */
  readonly sources_examined: {
    readonly truth_rows: number;
    readonly catalog_archetypes: number;
    readonly equivalence_groups: number;
    readonly exact_hits: number;
    readonly token_match_hits: number;
  };
}

// ============================================================
// 解析面（纯读；两分母 + 三精确腿 + 词形腿）
// ============================================================

/**
 * 统一语义解析（唯一入口）。判卷顺序即 match_class 派生（纪律②）；
 * 零落盘零写边（解析 ≠ 采用）。need 空 = SCHEMA_INVALID（空需求无从解析）。
 */
export async function resolveNeed(
  store: Parameters<typeof loadTruthIndex>[0],
  catalogRoot: string,
  input: ResolverRequestInput,
): Promise<ResolverOutcome> {
  const need = (input.need ?? "").trim();
  if (need.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "need 为空（空需求无从解析）",
      "给出需求词形原文（pomaster resolve \"<need>\"）；空槽位是上游产出缺陷",
      {},
    );
  }
  const hints = (input.hints ?? [])
    .map((hint) => hint.trim())
    .filter((hint) => hint.length > 0);

  const truthIndex = await loadTruthIndex(store);
  const registry = readEquivalenceRegistry(pathsOf(store));
  const archetypes = loadCatalogArchetypes(catalogRoot);

  const queryTokens = new Set<string>();
  for (const piece of [need, ...hints]) {
    for (const token of knowledgeQueryTokens(piece)) queryTokens.add(token);
  }

  const exactHits: ResolverMatch[] = [];
  let exactVia: ResolverMatch["via"] | null = null;
  // 腿①：精确 governed id（词形即 id，A5 closed-world）。
  const candidate = need;
  let candidateId = candidate;
  let via: ResolverMatch["via"] | null = null;
  try {
    parseGovernedId(candidate);
    via = "exact_id";
  } catch (error) {
    if (!(error instanceof GovernedIdParseError)) throw error;
    // 腿②：A6 机械别名 canonical 化（canonical 仍过文法验证；resolveAlias 本体零改动）。
    const alias = resolveAlias(candidate);
    if (
      alias.matchedRuleLegacy !== null &&
      alias.canonical !== null &&
      alias.canonical !== candidate
    ) {
      try {
        parseGovernedId(alias.canonical);
        candidateId = alias.canonical;
        via = "exact_id_via_alias";
      } catch (aliasError) {
        if (!(aliasError instanceof GovernedIdParseError)) throw aliasError;
      }
    }
  }
  if (via === null) {
    // 腿③：等价表 active 登记精确匹配（resolveWordForm 同源）。
    const resolved = readEquivalenceRegistryForResolve(registry, candidate);
    if (resolved !== null) {
      candidateId = resolved;
      via = "equivalence_active";
    }
  }
  if (via !== null) {
    const row = truthIndex.objects.find((object) => object.id === candidateId);
    if (row !== undefined) {
      exactVia = via;
      exactHits.push({
        domain: "truth",
        id: row.id,
        kind: row.kind,
        title_zh: row.titleZh,
        via,
        matched_tokens: [],
        family: familyOfId(row.id),
      });
    }
    // 精确腿文法命中但不在册：不是命中也不是盲区——分母披露里 truth_rows 会说话，
    // why 显式记「文法命中但不在册」（禁猜测降级为词形命中）。
  }

  // 腿④：词形命中（truth 行 + catalog archetype 两分母；词级精确禁子串）。
  const truthTokenHits: ResolverMatch[] = [];
  for (const row of truthIndex.objects) {
    if (exactHits.some((hit) => hit.id === row.id)) continue;
    const keyTokens = new Set<string>(
      knowledgeQueryTokens(`${row.titleZh} ${row.id}`),
    );
    const matched = [...queryTokens].filter((token) => keyTokens.has(token)).sort();
    if (matched.length > 0) {
      truthTokenHits.push({
        domain: "truth",
        id: row.id,
        kind: row.kind,
        title_zh: row.titleZh,
        via: "token_match",
        matched_tokens: matched,
        family: familyOfId(row.id),
      });
    }
  }
  truthTokenHits.sort(
    (a, b) =>
      b.matched_tokens.length - a.matched_tokens.length ||
      (a.id < b.id ? -1 : 1),
  );

  const archetypeHits: ResolverMatch[] = [];
  for (const archetype of archetypes) {
    const keyTokens = new Set<string>(
      knowledgeQueryTokens(`${archetype.titleZh} ${archetype.id} ${archetype.summaryZh}`),
    );
    const matched = [...queryTokens].filter((token) => keyTokens.has(token)).sort();
    if (matched.length > 0) {
      archetypeHits.push({
        domain: "catalog",
        id: archetype.id,
        kind: archetype.kind,
        title_zh: archetype.titleZh,
        via: "token_match",
        matched_tokens: matched,
        family: null,
      });
    }
  }
  archetypeHits.sort(
    (a, b) =>
      b.matched_tokens.length - a.matched_tokens.length ||
      (a.id < b.id ? -1 : 1),
  );

  // match_class 派生（纪律②；确定性、零主观判档）。
  let matchClass: ResolutionMatchClassValue;
  let matches: readonly ResolverMatch[];
  let alternatives: readonly ResolverMatch[];
  if (exactHits.length > 0) {
    matchClass = "EXACT_MATCH";
    matches = exactHits;
    alternatives = [...archetypeHits, ...truthTokenHits];
  } else if (archetypeHits.length > 0) {
    matchClass = "CONFIGURABLE_MATCH";
    matches = archetypeHits;
    alternatives = truthTokenHits;
  } else if (truthTokenHits.length > 0) {
    matchClass = "EXTENSIBLE_MATCH";
    matches = truthTokenHits;
    alternatives = [];
  } else {
    matchClass = "NO_MATCH";
    matches = [];
    alternatives = [];
  }

  // required_bindings：命中 archetype 的 composition.requires 聚合（去重字典序）。
  const requiredBindings = new Set<string>();
  for (const hit of matches) {
    if (hit.domain !== "catalog") continue;
    const archetype = archetypes.find((candidate) => candidate.id === hit.id);
    for (const require of archetype?.composition.requires ?? []) {
      requiredBindings.add(require);
    }
  }

  return {
    input: { need, hints },
    match_class: matchClass,
    matches,
    alternatives,
    required_bindings: [...requiredBindings].sort(),
    required_gates: [NEW_ENTITY_GATE_DEF],
    why: whyOf(matchClass, exactVia, exactHits.length > 0, need),
    sources_examined: {
      truth_rows: truthIndex.objects.length,
      catalog_archetypes: archetypes.length,
      equivalence_groups: registry.entries.filter((entry) => entry.status === "active").length,
      exact_hits: exactHits.length,
      token_match_hits: truthTokenHits.length + archetypeHits.length,
    },
  };
}

// ============================================================
// New Entity Gate 判卷半边（v0.6.1 §75 五否证明的解析侧；§87 Anti-Hallucination）
// ============================================================

/**
 * New Entity Gate 的 resolver 判卷输入（gate recipe batch 1 落 catalog/gates/，
 * 本函数是解析侧唯一判卷源——「同一函数，不两套」纪律）。
 * 规则（§75 五否 → 本面 MVP 覆盖三否：exact/configuration/extension 三否由
 * match_class 结构性承载；composition/adapter 两否归批次 2+ 组合分析，缺席显式）：
 * - NO_MATCH → 五否成立 → 允许 Design New（new_entity_allowed=true）；
 * - 其余 match_class → 必须复用/配置/扩展既有实体 → new_entity_allowed=false +
 *    denied_by 命中集（gate FAIL 的证据链位）。
 * COMPOSABLE/REFERENCE_MATCH 派生缺席（批次 2+）在 MVP 下不可能出现在输入——
 * 词表外值显式拒绝（禁静默放行）。
 */
export function newEntityVerdictFromResolution(
  matchClass: ResolutionMatchClassValue,
): { readonly new_entity_allowed: boolean; readonly denied_by: readonly string[] } {
  switch (matchClass) {
    case "NO_MATCH":
      return { new_entity_allowed: true, denied_by: [] };
    case "EXACT_MATCH":
    case "CONFIGURABLE_MATCH":
    case "EXTENSIBLE_MATCH":
    case "COMPOSABLE_MATCH":
    case "REFERENCE_MATCH":
      return { new_entity_allowed: false, denied_by: [matchClass] };
    default:
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `match_class 词表外：${String(matchClass)}（resolution_match_class 六值闭包，PR-0006）`,
        `合法词形：EXACT_MATCH | CONFIGURABLE_MATCH | COMPOSABLE_MATCH | EXTENSIBLE_MATCH | REFERENCE_MATCH | NO_MATCH`,
        { match_class: String(matchClass) },
      );
  }
}

// ============================================================
// 内部共享
// ============================================================

function readEquivalenceRegistryForResolve(
  registry: ReturnType<typeof readEquivalenceRegistry>,
  text: string,
): string | null {
  for (const entry of registry.entries) {
    if (entry.status !== "active") continue;
    if (entry.word_forms.some((form) => form.text === text)) {
      const canonical = entry.word_forms.find((form) => form.domain === "canonical");
      return canonical?.text ?? null;
    }
  }
  return null;
}

function whyOf(
  matchClass: ResolutionMatchClassValue,
  exactVia: ResolverMatch["via"] | null,
  exactInStore: boolean,
  need: string,
): string {
  switch (matchClass) {
    case "EXACT_MATCH":
      return `精确腿命中（via=${exactVia ?? "unknown"}）——需求词形指向在册项目对象「${need}」（EXACT_MATCH：复用既有对象，禁再建等价新实体）`;
    case "CONFIGURABLE_MATCH":
      return "Engineering Substrate 标准件命中（CONFIGURABLE_MATCH：archetype 定义住 catalog 面，实例化时由业务决定字段/变体/权限——v0.6.1 §70 判例；实例采用走 INSTANCE_OF 边显式登记，解析≠采用）";
    case "EXTENSIBLE_MATCH":
      return "项目对象词形命中（EXTENSIBLE_MATCH：现有对象可扩展承载需求——先查扩展位，禁平行新建）";
    case "NO_MATCH":
      return "两分母（truth 对象 + catalog 标准件）零命中（NO_MATCH：显式缺席——允许进入 Design Synthesis，但新实体必过 New Entity Gate 五否证明；分母计数见 sources_examined，advisory 面命中不改变本判定——advisory ≠ match，§87）";
    default:
      return `match_class=${matchClass}（批次 2+ 组合分析预留位——MVP 派生不产出，显式缺席不伪造）`;
  }
}
