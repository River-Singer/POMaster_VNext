/**
 * new-entity.ts —— New Entity Gate（kernel 侧判卷面；P-v06 批次 1；
 * PRD v0.6.1 §75 五否证明 / §97 流程 / §87 Anti-Hallucination + Owner 决议 D-2/D-4）。
 *
 * 出处锚：
 * - v0.6.1 §75：新建前必须证明 No exact existing match / No valid configuration /
 *   No valid composition / No valid extension / No valid adapter（五否）——只有
 *   全部成立才允许 Design New。适用面逐字：Component / Page Archetype / Module /
 *   Layer / API / Database Table / Event / Cache / Dependency。
 * - v0.6.1 §87：Agent 不允许 invent catalog id / component / api archetype /
 *   database pattern；Catalog miss 必须显式 NO_MATCH。
 * - 批次裁定：机判核心住 kernel（ref-integrity 同族 kernel 侧 gate——解析侧唯一
 *   判卷源 newEntityVerdictFromResolution「同一函数，不两套」）；catalog/gates/
 *   gate.new-entity.checks.json 是判卷定义锚（recipe 在 runner 派发表显式
 *   unbound——缺席诚实，tool-adapter 绑定归批次 2 architecture 腿）。
 *
 * 判卷矩阵（七态真判政策，ref-integrity L268 同款）：
 * - 零候选 → not_run（零分母禁当满分）；
 * - 任一候选 denied（词形已在册 / match_class ≠ NO_MATCH）→ failed
 *   （真违规不被盲区洗白）；
 * - 全部 allowed 但任一 NO_MATCH 的分母为空（truth_rows=0 且 catalog_archetypes=0）
 *   → skipped_blindspot（空分母的 NO_MATCH 不可信——「没查」≠「查了没有」，
 *   §87 Anti-Hallucination 的判卷面镜像）；
 * - 其余 → passed。
 *
 * 纯读零写入（解析≠采用——INSTANCE_OF 边归显式采用动作经 relations.registerRelation）。
 */
import { loadCatalogArchetypes } from "./catalog.js";
import { GovernanceError, GovernedIdParseError } from "./errors.js";
import { parseGovernedId, resolveAlias } from "./id.js";
import { pathsOf, readCurrentSeq } from "./paths.js";
import { readRelations } from "./relations.js";
import {
  newEntityVerdictFromResolution,
  resolveNeed,
  type ResolverMatch,
} from "./resolver.js";
import { loadTruthIndex } from "./store.js";
import type { VerdictValue } from "./vocab.js";

/** gate 名（GRN 入账呈现位；gate_def 词形 NEW_ENTITY_GATE_DEF 在 resolver.ts 镜像）。 */
export const NEW_ENTITY_GATE = "NEW_ENTITY" as const;

/** 逐候选判卷（真判两态 + 盲区一态；非七态 verdict——verdict 是聚合位）。 */
export type NewEntityDisposition = "allowed" | "denied" | "blindspot";

/** 单候选判卷行（证据链完整呈现：为什么拒/为什么允许/分母状态）。 */
export interface NewEntityJudgement {
  /** 拟新建实体词形（调用方自报；词形文法在本行内机判）。 */
  readonly word_form: string;
  /** 判卷需求词形（= resolver 的 need；缺省取 word_form 原文）。 */
  readonly need: string;
  readonly disposition: NewEntityDisposition;
  /** denied 时的结构性理由（match_class 或 word_form_exists）。 */
  readonly denied_by: readonly string[];
  /** resolver 分类（词形文法不过 → null——grammar 行不受 match_class 判卷）。 */
  readonly match_class: string | null;
  readonly matches: readonly ResolverMatch[];
  /** 分母披露（禁「没查就说没有」——空分母 NO_MATCH → blindspot 的依据位）。 */
  readonly sources_examined: {
    readonly truth_rows: number;
    readonly catalog_archetypes: number;
  };
  /** 机器可辨理由（ref-integrity rationale 同款）。 */
  readonly rationale: string;
}

/** verdict 判卷决策（七态 + 机器可辨理由）。 */
export interface NewEntityVerdictDecision {
  readonly verdict: VerdictValue;
  readonly rationale: string;
}

/** runNewEntityGate 运行报告。 */
export interface NewEntityGateRun {
  readonly gate: string;
  readonly gate_def: string;
  readonly ran_at_seq: number;
  readonly judgements: readonly NewEntityJudgement[];
  readonly counts: {
    readonly total: number;
    readonly denied: number;
    readonly allowed: number;
    readonly blindspot: number;
    readonly notApplicable: number;
  };
  readonly result: NewEntityVerdictDecision;
}

/** 候选输入。 */
export interface NewEntityCandidateInput {
  /** 拟新建实体词形（truth 面 governed id 文法预检；catalog 词形走 grammar 位）。 */
  readonly wordForm: string;
  /** 判卷需求词形（该实体「为了什么」——resolver 检索语义；缺省 = wordForm）。 */
  readonly need?: string;
}

export interface NewEntityGateInput {
  readonly candidates: readonly NewEntityCandidateInput[];
}

/**
 * New Entity Gate 主入口（纯读零写盘）。逐候选四步：
 * ①词形文法（truth 面 parseGovernedId；不过 = blocked 候选——文法外词形不可判卷）
 * ②在册撞名（wordForm / alias canonical 在 truth-index 全等命中 → denied[word_form_exists]）
 * ③resolver 需求匹配（resolveNeed → newEntityVerdictFromResolution 单一实现）
 * ④空分母防护（NO_MATCH 且 truth_rows+archetypes=0 → blindspot）。
 * 聚合矩阵见模块头。
 */
export async function runNewEntityGate(
  store: Parameters<typeof loadTruthIndex>[0],
  catalogRoot: string,
  input: NewEntityGateInput,
): Promise<NewEntityGateRun> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir: store.rootDir },
    );
  }
  if (!Array.isArray(input.candidates)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "candidates 缺失（判卷分母必答——空数组是合法值，缺位不是）",
      "给候选清单（可为空；空数组 → not_run 零分母显式）",
      {},
    );
  }

  const truthIndex = await loadTruthIndex(store);
  // Set<string> 显式标注：本集合的消费形态是「未验证候选词形/别名 canonical 的成员测试」
  // （词形文法归①grammar 位单独判卷，alias canonical 不保证过文法——id.ts resolveAlias
  // 注记），非已验证 governed id 分母；显式 string 元素类型使判卷面类型为真
  // （严格 tsc 清零——运行时同一 Set，零行为变更）。
  const knownIds = new Set<string>(truthIndex.objects.map((object) => object.id));
  const archetypes = loadCatalogArchetypes(catalogRoot);

  const judgements: NewEntityJudgement[] = [];
  for (const candidate of input.candidates) {
    // wordForm/need 显式 string 标注：上方 Array.isArray 守卫词形是 `arg is any[]`
    // （TS 内建不可泛型化），对 readonly 候选数组做交叠窄化会把循环变量刷成 any、
    // 放逐本段全部字段检查——本地显式标注收回类型面（运行时零变更）。
    const wordForm: string = (candidate?.wordForm ?? "").trim();
    const need: string = (candidate?.need ?? "").trim() || wordForm;
    if (wordForm.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "候选 wordForm 为空（空词形无从判卷）",
        "给出拟新建实体的非空词形",
        {},
      );
    }
    // ①词形文法（truth 面过 governed id 文法；alias 收编也算文法内既有词形）。
    let grammarOk = true;
    try {
      parseGovernedId(wordForm);
    } catch (error) {
      if (!(error instanceof GovernedIdParseError)) throw error;
      grammarOk = false;
    }
    if (!grammarOk) {
      judgements.push({
        word_form: wordForm,
        need,
        disposition: "blindspot",
        denied_by: ["grammar_invalid"],
        match_class: null,
        matches: [],
        sources_examined: {
          truth_rows: truthIndex.objects.length,
          catalog_archetypes: archetypes.length,
        },
        rationale:
          "拟用词形不过 governed id 文法（A5 closed-world）——文法外词形不可判卷（盲区显式：修复词形后重跑，禁猜测放行）",
      });
      continue;
    }
    // ②在册撞名（精确 + A6 别名族 canonical 化双查）。
    if (knownIds.has(wordForm)) {
      judgements.push({
        word_form: wordForm,
        need,
        disposition: "denied",
        denied_by: ["word_form_exists"],
        match_class: "EXACT_MATCH",
        matches: [],
        sources_examined: {
          truth_rows: truthIndex.objects.length,
          catalog_archetypes: archetypes.length,
        },
        rationale: `词形 ${wordForm} 已在册（同 id 重复登记=调用方缺陷）`,
      });
      continue;
    }
    const alias = resolveAlias(wordForm);
    if (
      alias.canonical !== null &&
      alias.canonical !== wordForm &&
      knownIds.has(alias.canonical)
    ) {
      judgements.push({
        word_form: wordForm,
        need,
        disposition: "denied",
        denied_by: ["word_form_exists_via_alias"],
        match_class: "EXACT_MATCH",
        matches: [{ domain: "truth", id: alias.canonical, kind: "existing", title_zh: alias.canonical, via: "exact_id_via_alias", matched_tokens: [], family: null }],
        sources_examined: {
          truth_rows: truthIndex.objects.length,
          catalog_archetypes: archetypes.length,
        },
        rationale: `词形经 A6 别名族收编命中在册对象 ${alias.canonical}（rule=${alias.matchedRuleLegacy}）——复用既有对象`,
      });
      continue;
    }
    // ③resolver 需求匹配（解析侧唯一判卷源）。
    const resolution = await resolveNeed(store, catalogRoot, { need });
    const verdict = newEntityVerdictFromResolution(resolution.match_class);
    if (verdict.new_entity_allowed) {
      // ④空分母防护（§87 判卷面镜像）。
      const emptyDenominator =
        resolution.sources_examined.truth_rows === 0 &&
        resolution.sources_examined.catalog_archetypes === 0;
      if (emptyDenominator) {
        judgements.push({
          word_form: wordForm,
          need,
          disposition: "blindspot",
          denied_by: ["empty_denominator"],
          match_class: resolution.match_class,
          matches: resolution.matches,
          sources_examined: {
            truth_rows: resolution.sources_examined.truth_rows,
            catalog_archetypes: resolution.sources_examined.catalog_archetypes,
          },
          rationale:
            "NO_MATCH 的两分母均为空（truth_rows=0 且 catalog_archetypes=0）——「没查」≠「查了没有」（skipped_blindspot：分母在场后重跑）",
        });
        continue;
      }
      judgements.push({
        word_form: wordForm,
        need,
        disposition: "allowed",
        denied_by: [],
        match_class: resolution.match_class,
        matches: resolution.matches,
        sources_examined: {
          truth_rows: resolution.sources_examined.truth_rows,
          catalog_archetypes: resolution.sources_examined.catalog_archetypes,
        },
        rationale:
          "五否证明成立（NO_MATCH：exact/configuration/composition/extension/adapter 五否全由 match_class 机判闭合——批次 2 起六分类派生面并拢）；允许进入 Design Synthesis，采用动作须登记 INSTANCE_OF 边 + key_bindings",
      });
      continue;
    }
    judgements.push({
      word_form: wordForm,
      need,
      disposition: "denied",
      denied_by: verdict.denied_by,
      match_class: resolution.match_class,
      matches: resolution.matches,
      sources_examined: {
        truth_rows: resolution.sources_examined.truth_rows,
        catalog_archetypes: resolution.sources_examined.catalog_archetypes,
      },
      rationale: `需求词形命中既有面（match_class=${resolution.match_class}；denied_by=${verdict.denied_by.join("/")}）——复用/配置/扩展既有实体，禁平行新建`,
    });
  }

  const denied = judgements.filter((j) => j.disposition === "denied").length;
  const blindspot = judgements.filter((j) => j.disposition === "blindspot").length;
  const allowed = judgements.filter((j) => j.disposition === "allowed").length;
  const total = judgements.length;

  let decision: NewEntityVerdictDecision;
  if (total === 0) {
    decision = {
      verdict: "not_run",
      rationale: "零分母禁当满分（P26 同款）：候选集为空，本 run 无可判卷对象——显式 not_run 而非 passed",
    };
  } else if (denied > 0) {
    decision = {
      verdict: "failed",
      rationale: `${denied}/${total} 候选被拒（在册撞名/需求命中既有面——真违规不被盲区洗白）；明细见 judgements.denied_by`,
    };
  } else if (blindspot > 0) {
    decision = {
      verdict: "skipped_blindspot",
      rationale: `${blindspot}/${total} 候选不可判卷（文法外词形/空分母 NO_MATCH——盲区显式计数，非假绿非假红；修复后重跑）`,
    };
  } else {
    decision = {
      verdict: "passed",
      rationale: `${allowed}/${total} 候选五否证明成立（NO_MATCH 分母在场）；Design Synthesis 放行`,
    };
  }

  return {
    gate: NEW_ENTITY_GATE,
    gate_def: "POLICY.GATE.NEW_ENTITY.CHECKS@0.1.0",
    ran_at_seq: currentSeq,
    judgements,
    counts: { total, denied, allowed, blindspot, notApplicable: 0 },
    result: decision,
  };
}

/**
 * 关系面辅助判卷位（§97 流程「Binding」步）：候选实体命中标准件后，其 INSTANCE_OF
 * 边是否已显式登记（解析≠采用的采用侧对账；readRelations 只读）。
 */
export function instanceOfEdgesPresent(
  entries: ReturnType<typeof readRelations>,
  sourceId: string,
): readonly string[] {
  return entries
    .filter(
      (entry) =>
        entry.type === "INSTANCE_OF" &&
        entry.source.domain === "truth" &&
        entry.source.id === sourceId,
    )
    .map((entry) => entry.target.id);
}
