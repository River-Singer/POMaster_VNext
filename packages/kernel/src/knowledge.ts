/**
 * knowledge.ts —— Engineering Knowledge 内核（PRD §83；P28-Kernel）。
 *
 * PRD 语义锚（逐字）：
 * - §83.1 身份分立：Spec/Current Truth 管「这个项目现在必须相信/遵守什么」；
 *   Knowledge 管「遇到这种问题时，有什么值得想起的经验、失败模式、诊断方法与启发」。
 * - §83.2 Authority 隔离铁律：「**Knowledge 不能直接让 Gate FAIL**」——隔离表
 *   Engineering Knowledge / Pattern / Failure Pattern / Diagnostic Playbook /
 *   Heuristic 权威性 NO、不可直接阻断。结构性落法（非约定，四层）：
 *   ① 形态层：12-knowledge-entry schema authority 字段 const ADVISORY——知识对象
 *     在形态层面**不存在** AUTHORITATIVE 选项；装载面对异值 fail-closed（SCHEMA_INVALID）。
 *   ② 类型层：KnowledgeEntry["authority"] 是 "ADVISORY" 字面量类型（TS 编译期
 *     写不出 AUTHORITATIVE）。
 *   ③ 通路层：knowledge 侧车走本模块专属写通路，**TransactionOp 联合无 knowledge
 *     op**——知识条目没有任何可经 store 事务入 truth-index（gate 对象分母）的键位。
 *   ④ 消费层：检索注入只产 [ADVISORY] 分区（§83.8）；PROMOTED 只是谱系状态，
 *     knowledge 本体恒 ADVISORY——强约束载体是提升后经 P11 maintain 面落地的
 *     Current Policy/Truth 对象（§83.10「只有 Promotion 完成后，才可成为强约束」）。
 * - §83.3 四类型 / §83.9 五状态 / §83.10 提升链（maintain → Authority / Gatekeeper）/
 *   §83.11 降级去僵化：词形与转移矩阵唯一来源 @pomaster/schemas vocab.ts 待收编段
 *   （镜像 12-knowledge-entry x-pomaster-transition-matrix/-requirements）。
 * - §25.3 Knowledge Curator：「不得直接把经验升级为 Spec/Truth；晋升必须经过
 *   Maintain / Authority / Gatekeeper」；§25.5 ⑦「Curator 把偶发修复直升 MUST」=
 *   禁止模式（promote 权威位词形闸显式拒绝 KNOWLEDGE_CURATOR 等非权威位）。
 *
 * 存储与写入（模式同 ledger.ts / permits.ts 侧车先例）：
 * - state/knowledge-library.json（kernel 内部补充状态，不进 content_digest；
 *   「定期沉淀 + 按 Change Localization 检索注入」（§83.8）的可重建性由 journal
 *   KNOWLEDGE_* 事件流 + git 底座承接）；
 * - 登记非幂等（同 permit issue / recordException 先例）；写入唯一通路 = 本模块
 *   语义入口（record/apply/promote/demote/demoteSpec），每个生命周期边恰好一个
 *   语义入口：通用转移面对 promote/demote 边显式拒绝并指路（单一权威通路——
 *   Discovery promote 面「不私造第二写入通道」同款）；
 * - staged write（executeWrites + captureOriginal），失败不落半写状态；
 * - 词形校验 fail-closed：id 过 parseGovernedId 且前缀必须 KNOWLEDGE（A5；
 *   §83.4 例文 KB-* legacy 词形 hint 指路 resolveAlias 收编）；kind/status/
 *   confidence/promotionAuthority 词表外显式拒绝。
 */
import type { Actor, Store } from "./index.js";
import { GovernanceError, GovernedIdParseError } from "./errors.js";
import { governanceCodeForParseError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import { captureOriginal, executeWrites, readText } from "./io.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";
import {
  KNOWLEDGE_CONFIDENCE_VALUES,
  KNOWLEDGE_KIND_VALUES,
  KNOWLEDGE_PROMOTION_AUTHORITY_VALUES,
  KNOWLEDGE_STATUS_VALUES,
  KNOWLEDGE_TRANSITIONS,
  type KnowledgeConfidenceValue,
  type KnowledgeKindValue,
  type KnowledgePromotionAuthorityValue,
  type KnowledgeStatusValue,
} from "./vocab.js";

/** knowledge 库文件相对路径（kernel 内部补充状态；不进 content_digest）。 */
export const KNOWLEDGE_LIBRARY_RELATIVE = ".pomaster/state/knowledge-library.json";

// ============================================================
// 类型（文件世界 snake_case / 输入世界 camelCase，同 ledger 分工）
// ============================================================

/** 登记主体（C5 自报；kernel 不判其真，只登记）。 */
export interface KnowledgeEntryAudit {
  readonly actor_type: Actor["actorType"];
  readonly actor: string;
  readonly self_attested: boolean;
}

/**
 * 知识条目（state/knowledge-library.json entries[]；镜像 12-knowledge-entry）。
 * §83.4 逐键 + kernel 侧车管理字段；authority 是 "ADVISORY" 字面量类型——
 * 类型层面写不出 AUTHORITATIVE（§83.2 铁律结构性保证②）。
 */
export interface KnowledgeEntry {
  /** KNOWLEDGE.* canonical governed id（kernel 落盘保证；装载面复核）。 */
  readonly id: string;
  /** §83.3 四类型闭包。 */
  readonly kind: KnowledgeKindValue;
  readonly title: string;
  /** §83.8 检索键承载（按 Change Localization 检索注入）。 */
  readonly triggers: readonly string[];
  readonly observations: readonly string[];
  readonly diagnostic_questions: readonly string[];
  readonly recommendation: readonly string[];
  readonly counter_examples: readonly string[];
  readonly confidence: KnowledgeConfidenceValue;
  /** 恒 "ADVISORY"（§83.2 铁律；const 形态封条的类型面镜像）。 */
  readonly authority: "ADVISORY";
  /** §83.9 五状态；登记起点恒 CANDIDATE（§25.3 Knowledge Candidate）。 */
  readonly status: KnowledgeStatusValue;
  /** §83 上游 Research Evidence（P18）episode 引用；宽松词形。 */
  readonly source_episodes: readonly string[];
  /** §83.4 逐字字段名；A4 禁墙钟——值域为 store 事件拍，未验证为 null。 */
  readonly last_validated_at: number | null;
  /** §83.11 降级谱系：被降级的 Hard Rule 引用；非降级产物 null。 */
  readonly demoted_from: string | null;
  /** §83.11 Architecture/Governance Review 引用；非降级产物 null。 */
  readonly review_ref: string | null;
  /** §83.10 Governance Proposal / Policy 引用；PROMOTED 必非 null（kernel 强制）。 */
  readonly promoted_ref: string | null;
  readonly recorded_by: KnowledgeEntryAudit;
  readonly recorded_at_seq: number;
  /** 人类散文注记（P9：只登记不解析）。 */
  readonly note: string | null;
}

/** 库文件形态。 */
export interface KnowledgeLibraryFile {
  readonly version: 1;
  readonly entries: readonly KnowledgeEntry[];
}

/** recordKnowledge 输入。 */
export interface KnowledgeRecordInput {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly triggers?: readonly string[];
  readonly observations?: readonly string[];
  readonly diagnosticQuestions?: readonly string[];
  readonly recommendation?: readonly string[];
  readonly counterExamples?: readonly string[];
  readonly confidence: string;
  readonly sourceEpisodes?: readonly string[];
  /** §83.11 谱系（demoteSpecToKnowledge 专用；普通登记缺席 = null）。 */
  readonly demotedFrom?: string;
  /** §83.11 Architecture/Governance Review 引用（降级产物必填，由 demoteSpecToKnowledge 强制）。 */
  readonly reviewRef?: string;
  readonly recordedBy: Actor;
  readonly note?: string;
}

/** applyKnowledgeTransition 输入（通用转移面）。 */
export interface KnowledgeTransitionInput {
  readonly id: string;
  readonly to: string;
  /** 转移原因（transition_object op 的 reasonShort 必填先例）。 */
  readonly reasonShort: string;
  readonly transitionedBy: Actor;
  readonly note?: string;
}

/** promoteKnowledge 输入（VALIDATED→PROMOTED 唯一通路）。 */
export interface KnowledgePromotionInput {
  readonly id: string;
  /** §25.3/§83.10 权威位词形：MAINTAIN | AUTHORITY | GATEKEEPER（词形闸）。 */
  readonly promotionAuthority: string;
  /** 审批/决策引用（tx.authorityRef 先例；必填留痕——C5 自报 + 引用可追溯）。 */
  readonly authorityRef: string;
  /** §83.10 Governance Proposal / Policy 引用（提升指向；必填）。 */
  readonly promotedRef: string;
  readonly promotedBy: Actor;
  readonly note?: string;
}

/** demoteKnowledge 输入（→DEPRECATED 唯一通路；ADVISORY 面内动作）。 */
export interface KnowledgeDemotionInput {
  readonly id: string;
  /** 淘汰/降级原因（必填留痕；journal KNOWLEDGE_DEMOTED）。 */
  readonly reasonShort: string;
  readonly demotedBy: Actor;
  readonly note?: string;
}

// ============================================================
// 读取（kernel 内部跨模块复用 + CLI 纯读呈现共用语义）
// ============================================================

/**
 * 读取知识库。缺失 → 空库（opt-in 登记面，空 = 无知识沉淀的合法状态）；损坏 →
 * SCHEMA_INVALID（禁静默当空库）。Authority 隔离装载面（结构性保证①）：
 * 任何条目 authority ≠ "ADVISORY" → SCHEMA_INVALID fail-closed——手改侧车把知识
 * 伪造成 AUTHORITATIVE 在装载即被拒绝，不存在「读进来的知识带权威性」的通路。
 */
export function readKnowledgeLibrary(paths: StorePaths): KnowledgeLibraryFile {
  const text = readText(paths.knowledgeLibraryPath);
  if (text === null) {
    return { version: 1, entries: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/knowledge-library.json 无法解析（损坏或手改）",
      "恢复 git 版本；知识库由 kernel knowledge.ts 语义入口维护，禁止手改",
      { cause: String(error) },
    );
  }
  const record = parsed as KnowledgeLibraryFile;
  if (!Array.isArray(record.entries)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "state/knowledge-library.json 结构非法（entries 非数组）",
      "恢复 git 版本；知识库由 kernel knowledge.ts 语义入口维护，禁止手改",
      {},
    );
  }
  for (const entry of record.entries) {
    if (entry === null || typeof entry !== "object") {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        "state/knowledge-library.json 存在非对象条目",
        "恢复 git 版本；知识库由 kernel knowledge.ts 语义入口维护，禁止手改",
        {},
      );
    }
    // §83.2 铁律装载面：knowledge 不存在 AUTHORITATIVE 形态（const ADVISORY 封条）。
    if ((entry as KnowledgeEntry).authority !== "ADVISORY") {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `knowledge ${String((entry as KnowledgeEntry).id)} authority 非法（知识恒 ADVISORY，§83.2 铁律「Knowledge 不能直接让 Gate FAIL」）`,
        "authority 字段 const ADVISORY（12-knowledge-entry 形态封条）；该值只能由手改产生——从 git 恢复该文件",
        { id: String((entry as KnowledgeEntry).id) },
      );
    }
    if (!KNOWLEDGE_STATUS_VALUES.includes((entry as KnowledgeEntry).status)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `knowledge ${String((entry as KnowledgeEntry).id)} status 词表外（§83.9 五状态闭包）`,
        `合法词形：${KNOWLEDGE_STATUS_VALUES.join(" | ")}；状态转移走 kernel knowledge.ts 语义入口`,
        { id: String((entry as KnowledgeEntry).id) },
      );
    }
  }
  return record;
}

// ============================================================
// 生命周期转移引擎（纯函数，discovery-chain.ts 先例）
// ============================================================

/** 迁移前置条件词形（x-vocab-source: 12 x-pomaster-transition-requirements）。 */
export type KnowledgeTransitionRequirement = "promotion_authority";

/** Knowledge 生命周期转移校验结果（显式四边缘：allowed/reason 与 lifecycle/discovery 引擎同构）。 */
export type KnowledgeTransitionOutcome =
  | {
      readonly allowed: true;
      readonly requires: readonly KnowledgeTransitionRequirement[];
      /** true = 提升边（VALIDATED→PROMOTED）：唯一通路 promoteKnowledge（权威位词形闸）。 */
      readonly promoteEdge: boolean;
      /** true = 降级/淘汰边（→DEPRECATED）：唯一通路 demoteKnowledge。 */
      readonly demoteEdge: boolean;
      readonly notes: readonly string[];
    }
  | {
      readonly allowed: false;
      readonly reason:
        | "unknown_from_state"
        | "unknown_to_state"
        | "transition_not_in_matrix";
      /** 报错必须带的路标（escalation 纪律：不说去哪修的报错是缺陷）。 */
      readonly hint: string;
    };

/**
 * Knowledge 生命周期转移校验（纯函数）。词形唯一来源 KNOWLEDGE_TRANSITIONS
 * （@pomaster/schemas，镜像 12 x-pomaster-transition-matrix）：
 * - 词表外 from/to → allowed:false（unknown_from_state/unknown_to_state + hint）；
 * - 矩阵外（含全部跳步/倒退/自环）→ allowed:false（transition_not_in_matrix + hint）；
 * - 提升边（VALIDATED→PROMOTED）requires ["promotion_authority"]——§25.3/§83.10
 *   权威位（Maintain / Authority / Gatekeeper），唯一通路 promoteKnowledge；
 * - 降级/淘汰边（VALIDATED→DEPRECATED / PROMOTED→DEPRECATED）是 §83.11 去僵化
 *   出口（ADVISORY 面内动作，无需权威审批；reason 留痕走 journal）。
 * 非法迁移不 throw——返回 allowed:false 的显式 outcome（fail-closed）。
 */
export function validateKnowledgeTransition(
  from: KnowledgeStatusValue,
  to: KnowledgeStatusValue,
): KnowledgeTransitionOutcome {
  const fromKnown = KNOWLEDGE_STATUS_VALUES.includes(from);
  if (!fromKnown) {
    return {
      allowed: false,
      reason: "unknown_from_state",
      hint: `from "${String(from)}" 不在 KNOWLEDGE_STATUS_VALUES（${KNOWLEDGE_STATUS_VALUES.join("/")}）；Knowledge 生命周期词形以 12-knowledge-entry 为准（PRD §83.9），词表外值须先走词汇表 PR`,
    };
  }
  const toKnown = KNOWLEDGE_STATUS_VALUES.includes(to);
  if (!toKnown) {
    return {
      allowed: false,
      reason: "unknown_to_state",
      hint: `to "${String(to)}" 不在 KNOWLEDGE_STATUS_VALUES（${KNOWLEDGE_STATUS_VALUES.join("/")}）；Knowledge 生命周期词形以 12-knowledge-entry 为准（PRD §83.9），词表外值须先走词汇表 PR`,
    };
  }
  const targets = KNOWLEDGE_TRANSITIONS[from] as readonly KnowledgeStatusValue[];
  if (!targets.includes(to)) {
    return {
      allowed: false,
      reason: "transition_not_in_matrix",
      hint:
        targets.length === 0
          ? `${from} 为本链终态（12 x-pomaster-transition-matrix: to: []）；DEPRECATED/REJECTED 不再生效——已提升经验被推翻走 PROMOTED→DEPRECATED（§83.11 去僵化），不经 REJECTED 回退`
          : `${from} 的合法目标仅 ${targets.join("/")}（12 x-pomaster-transition-matrix；PRD §83.9/83.10/83.11 生命周期：CANDIDATE→VALIDATED|REJECTED、VALIDATED→PROMOTED|DEPRECATED、PROMOTED→DEPRECATED）——跳步与倒退一律不在矩阵`,
    };
  }
  const promoteEdge = from === "VALIDATED" && to === "PROMOTED";
  const demoteEdge = to === "DEPRECATED";
  const notes: string[] = [];
  if (promoteEdge) {
    notes.push(
      "提升边：§25.3「晋升必须经过 Maintain / Authority / Gatekeeper」+ §83.10「只有 Promotion 完成后，才可成为强约束」——唯一通路 promoteKnowledge（权威位词形闸 MAINTAIN/AUTHORITY/GATEKEEPER + authorityRef + promotedRef 必填）",
    );
    notes.push(
      "强约束载体是提升后经 P11 maintain 面落地的 Current Policy/Truth 对象；knowledge 本体恒 ADVISORY，PROMOTED 只是谱系状态（§83.2 铁律）",
    );
  }
  if (demoteEdge) {
    notes.push(
      "降级/淘汰边（§83.11 去僵化：「POMaster 必须支持『去僵化』，而不是只有规则越来越多」）——ADVISORY 面内部动作（§83.2 权威性 NO，不影响任何 gate），唯一通路 demoteKnowledge（reason 必填留痕）",
    );
  }
  if (from === "CANDIDATE" && to === "VALIDATED") {
    notes.push(
      "验证边（§83.10 提升链「Knowledge Candidate → Validation」）：转移落盘后 last_validated_at 置为本次 store 事件拍（A4 禁墙钟）",
    );
  }
  return {
    allowed: true,
    requires: promoteEdge ? ["promotion_authority"] : [],
    promoteEdge,
    demoteEdge,
    notes,
  };
}

// ============================================================
// 写通路（§83 内核写通道；语义入口在本文件，落盘点唯一）
// ============================================================

/** id 校验：KNOWLEDGE 前缀 governed id（A5 closed-world）；KB-* legacy 词形 hint 指路收编。 */
function assertKnowledgeId(id: string): void {
  let parsed;
  try {
    parsed = parseGovernedId(id);
  } catch (error) {
    if (error instanceof GovernedIdParseError) {
      throw new GovernanceError(
        governanceCodeForParseError(error),
        `knowledge id 词形非法：${error.message}`,
        id.toUpperCase().startsWith("KB-")
          ? "§83.4 例文 KB-* 是 legacy 词形——经 resolveAlias 别名双向链（KB-* → KNOWLEDGE.*，A6 rename-on-ingest）收编为 canonical 后登记"
          : "id 须为 KNOWLEDGE.* canonical governed id（A5 closed-world；12-knowledge-entry id pattern）",
        { id },
      );
    }
    throw error;
  }
  if (parsed.prefix !== "KNOWLEDGE") {
    throw new GovernanceError(
      "FATAL_UNKNOWN_PREFIX",
      `knowledge id 前缀须为 KNOWLEDGE：${id}（${parsed.prefix}.* 是其他对象面）`,
      "知识条目 id 须为 KNOWLEDGE.*（vocab-lock id_namespace 已登记前缀）；§83.4 例文 KB-* legacy 词形经 resolveAlias 收编",
      { id },
    );
  }
}

function requireVocabValue<T extends string>(
  value: string,
  values: readonly T[],
  field: string,
  source: string,
): T {
  const matched = values.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 词表外：${value}（${source}）`,
      `合法词形：${values.join(" | ")}；扩值走词汇表 PR（pending_vocab_pr）`,
      { [field]: value },
    );
  }
  return matched;
}

function normalizedStringArray(
  values: readonly string[] | undefined,
): readonly string[] {
  if (values === undefined) return [];
  // 空串在 trim 后被剔除（§83.4 数组元素 minLength 1——空串不是触发条件/问题/建议）。
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

/**
 * 提升权威位词形闸（独立于 requireVocabValue 的码位语义）：
 * 词表外 promotionAuthority = 非权威位申报 → AUTHORITY_REQUIRED（§25.3/§83.10
 * 权威位闭包 MAINTAIN|AUTHORITY|GATEKEEPER；§25.5 ⑦ Curator 直升 MUST 的拒绝码位）。
 */
function requirePromotionAuthority(value: string): KnowledgePromotionAuthorityValue {
  const matched = KNOWLEDGE_PROMOTION_AUTHORITY_VALUES.find(
    (candidate) => candidate === value,
  );
  if (matched === undefined) {
    throw new GovernanceError(
      "AUTHORITY_REQUIRED",
      `promotionAuthority 非权威位词形：${value}（§25.3「晋升必须经过 Maintain / Authority / Gatekeeper」）`,
      `权威位词形：${KNOWLEDGE_PROMOTION_AUTHORITY_VALUES.join(" | ")}（Knowledge Curator 等策展角色不在此闭包——§25.5 ⑦「Curator 把一次偶发修复直接晋升为 MUST」是禁止模式）；扩值走词汇表 PR`,
      { promotion_authority: value },
    );
  }
  return matched;
}

function auditOf(actor: Actor): KnowledgeEntryAudit {
  return {
    actor_type: actor.actorType,
    actor: actor.actor,
    self_attested: actor.selfAttested,
  };
}

/**
 * 登记知识候选（§25.3「生成 Knowledge Candidate」；status 恒 CANDIDATE 起步，
 * last_validated_at 恒 null 起步，authority 恒 ADVISORY）。id 库内唯一（重复登记
 * 同 id = SCHEMA_INVALID——知识候选是可寻址对象不是流水记录，同 id 二次登记是
 * 调用方缺陷，显式拒绝不静默覆盖）。journal KNOWLEDGE_RECORDED（A4 seq 采样）。
 */
export async function recordKnowledge(
  store: Store,
  input: KnowledgeRecordInput,
): Promise<KnowledgeEntry> {
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
  assertKnowledgeId(input.id);
  const kind = requireVocabValue(
    input.kind,
    KNOWLEDGE_KIND_VALUES,
    "kind",
    "§83.3 四类型闭包",
  );
  const confidence = requireVocabValue(
    input.confidence,
    KNOWLEDGE_CONFIDENCE_VALUES,
    "confidence",
    "§83.4 例文 HIGH + §81.4 三级同词形",
  );
  const title = input.title.trim();
  if (title.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "title 为空（§83.4 title 必填；无标题知识不可检索不可呈现）",
      "给出精确的知识标题（§83.4 例文：Semantic component vs presentation variants）",
      { id: input.id },
    );
  }
  const library = readKnowledgeLibrary(paths);
  if (library.entries.some((entry) => entry.id === input.id)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `knowledge id 已在册：${input.id}（库内 id 唯一）`,
      "同 id 二次登记是调用方缺陷——候选更新走生命周期转移面，不静默覆盖既有条目",
      { id: input.id },
    );
  }
  const demotedFrom = input.demotedFrom?.trim() ? input.demotedFrom.trim() : null;
  const reviewRef = input.reviewRef?.trim() ? input.reviewRef.trim() : null;
  if (demotedFrom !== null && reviewRef === null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${input.id} 携带 demoted_from 但缺 review_ref（§83.11：Hard Rule 降级必经 Architecture/Governance Review——降级谱系必须带评审留痕）`,
      "demoteSpecToKnowledge 通路会强制两者成对；直接调 recordKnowledge 携带降级谱系须同时给 reviewRef",
      { id: input.id, demoted_from: demotedFrom },
    );
  }
  const entry: KnowledgeEntry = {
    id: input.id,
    kind,
    title,
    triggers: normalizedStringArray(input.triggers),
    observations: normalizedStringArray(input.observations),
    diagnostic_questions: normalizedStringArray(input.diagnosticQuestions),
    recommendation: normalizedStringArray(input.recommendation),
    counter_examples: normalizedStringArray(input.counterExamples),
    confidence,
    authority: "ADVISORY",
    status: "CANDIDATE",
    source_episodes: normalizedStringArray(input.sourceEpisodes),
    last_validated_at: null,
    demoted_from: demotedFrom,
    review_ref: reviewRef,
    promoted_ref: null,
    recorded_by: auditOf(input.recordedBy),
    recorded_at_seq: currentSeq,
    note: input.note?.trim() ? input.note.trim() : null,
  };
  writeLibraryAndJournal(paths, [...library.entries, entry], {
    type: "KNOWLEDGE_RECORDED",
    seq: currentSeq,
    id: entry.id,
    kind: entry.kind,
    status: entry.status,
    confidence: entry.confidence,
    demoted_from: entry.demoted_from,
    review_ref: entry.review_ref,
    recorded_by: entry.recorded_by,
  });
  return entry;
}

/**
 * 通用转移执行器（CANDIDATE→VALIDATED 验证边与 CANDIDATE→REJECTED 评审否决边的
 * 唯一通路）。promote 边（VALIDATED→PROMOTED）与 demote 边（→DEPRECATED）在本面
 * **显式拒绝并指路** promoteKnowledge / demoteKnowledge——每个权威/语义边恰好一个
 * 通路（Discovery promote 面「不私造第二写入通道」同款；§25.3 晋升必须经权威位）。
 * CANDIDATE→VALIDATED 落盘后 last_validated_at 置为本次 store 事件拍（A4 禁墙钟）。
 * journal KNOWLEDGE_TRANSITIONED。
 */
export async function applyKnowledgeTransition(
  store: Store,
  input: KnowledgeTransitionInput,
): Promise<KnowledgeEntry> {
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
  const library = readKnowledgeLibrary(paths);
  const current = findEntry(library, input.id);
  const outcome = validateKnowledgeTransition(current.status, input.to as KnowledgeStatusValue);
  if (!outcome.allowed) {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${input.id}: ${current.status}→${String(input.to)} 不在矩阵（${outcome.reason}）`,
      outcome.hint,
      { id: input.id, from: current.status, to: input.to, reason: outcome.reason },
    );
  }
  if (outcome.promoteEdge) {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${input.id}: ${current.status}→PROMOTED 不走通用转移面（§25.3/§83.10 晋升必须经 Maintain / Authority / Gatekeeper 权威位）`,
      "走 promoteKnowledge（唯一提升通路：权威位词形闸 MAINTAIN/AUTHORITY/GATEKEEPER + authorityRef + promotedRef 必填）",
      { id: input.id, from: current.status },
    );
  }
  if (outcome.demoteEdge) {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${input.id}: ${current.status}→DEPRECATED 不走通用转移面（§83.11 降级/淘汰走专属语义通路）`,
      "走 demoteKnowledge（唯一淘汰通路：reason 必填留痕 journal KNOWLEDGE_DEMOTED）；Spec→Knowledge 降级谱系走 demoteSpecToKnowledge",
      { id: input.id, from: current.status },
    );
  }
  const reasonShort = requireReasonShort(input.reasonShort, input.id);
  const next: KnowledgeEntry = {
    ...current,
    status: input.to as KnowledgeStatusValue,
    last_validated_at:
      input.to === "VALIDATED" && current.last_validated_at === null
        ? currentSeq
        : current.last_validated_at,
    note: input.note?.trim()
      ? input.note.trim()
      : current.note,
  };
  writeLibraryAndJournal(paths, replacedEntries(library, next), {
    type: "KNOWLEDGE_TRANSITIONED",
    seq: currentSeq,
    id: next.id,
    from: current.status,
    to: next.status,
    reason_short: reasonShort,
    last_validated_at: next.last_validated_at,
    transitioned_by: auditOf(input.transitionedBy),
  });
  return next;
}

/**
 * 提升（VALIDATED→PROMOTED 唯一通路；§83.10 提升链终点动作）。
 * 权威位词形闸（§25.3 逐字「晋升必须经过 Maintain / Authority / Gatekeeper」）：
 * promotionAuthority ∈ {MAINTAIN, AUTHORITY, GATEKEEPER}，其余词形（含
 * KNOWLEDGE_CURATOR——§25.5 ⑦「Curator 把一次偶发修复直接晋升为 MUST」禁止模式）
 * 一律 AUTHORITY_REQUIRED 显式拒绝。kernel 词形闸不判申报真（C5 自报）：authorityRef
 * 审批引用必填留痕，真伪归 journal 留痕 + Authority 裁决审计。
 * promotedRef（Governance Proposal / Policy 引用）必填——强约束载体是提升后经
 * P11 maintain 面落地的 Policy/Truth 对象，knowledge 本体只留谱系不改变权威性。
 * journal KNOWLEDGE_PROMOTED。
 */
export async function promoteKnowledge(
  store: Store,
  input: KnowledgePromotionInput,
): Promise<KnowledgeEntry> {
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
  const authority = requirePromotionAuthority(input.promotionAuthority);
  const authorityRef = requireNonEmpty(input.authorityRef, "authorityRef", "审批/决策引用（authorityRef 必填——权威位申报留痕，§83.10 Governance Proposal 链）");
  const promotedRef = requireNonEmpty(input.promotedRef, "promotedRef", "Governance Proposal / Policy 引用（promotedRef 必填——§83.10「→ Current Policy/Truth」提升指向；强约束落地走 P11 maintain 面）");
  const library = readKnowledgeLibrary(paths);
  const current = findEntry(library, input.id);
  const outcome = validateKnowledgeTransition(current.status, "PROMOTED");
  if (!outcome.allowed) {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${input.id}: ${current.status}→PROMOTED 不在矩阵（${outcome.reason}）`,
      outcome.hint,
      { id: input.id, from: current.status },
    );
  }
  const reasonShort = `promoted by ${authority}（${authorityRef}）`;
  const next: KnowledgeEntry = {
    ...current,
    status: "PROMOTED",
    promoted_ref: promotedRef,
    note: input.note?.trim() ? input.note.trim() : current.note,
  };
  writeLibraryAndJournal(paths, replacedEntries(library, next), {
    type: "KNOWLEDGE_PROMOTED",
    seq: currentSeq,
    id: next.id,
    from: current.status,
    to: next.status,
    promotion_authority: authority,
    authority_ref: authorityRef,
    promoted_ref: next.promoted_ref,
    reason_short: reasonShort,
    promoted_by: auditOf(input.promotedBy),
  });
  return next;
}

/**
 * 降级/淘汰（VALIDATED→DEPRECATED 与 PROMOTED→DEPRECATED 的唯一通路；
 * §83.11 去僵化：「POMaster 必须支持『去僵化』，而不是只有规则越来越多」）。
 * ADVISORY 面内部动作（§83.2 权威性 NO——不影响任何 gate，无需权威审批），
 * 但 reason 必填留痕（journal KNOWLEDGE_DEMOTED）。已提升经验被推翻后显式转
 * DEPRECATED，禁静默滞留 PROMOTED。
 * Spec→Knowledge 降级谱系（Hard Rule → Architecture/Governance Review → Demote →
 * Recommended Pattern / Heuristic）走 demoteSpecToKnowledge（降级产物登记）。
 */
export async function demoteKnowledge(
  store: Store,
  input: KnowledgeDemotionInput,
): Promise<KnowledgeEntry> {
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
  const library = readKnowledgeLibrary(paths);
  const current = findEntry(library, input.id);
  const outcome = validateKnowledgeTransition(current.status, "DEPRECATED");
  if (!outcome.allowed) {
    throw new GovernanceError(
      "TRANSITION_ILLEGAL",
      `${input.id}: ${current.status}→DEPRECATED 不在矩阵（${outcome.reason}）`,
      outcome.hint,
      { id: input.id, from: current.status },
    );
  }
  const reasonShort = requireReasonShort(input.reasonShort, input.id);
  const next: KnowledgeEntry = {
    ...current,
    status: "DEPRECATED",
    note: input.note?.trim()
      ? input.note.trim()
      : current.note,
  };
  writeLibraryAndJournal(paths, replacedEntries(library, next), {
    type: "KNOWLEDGE_DEMOTED",
    seq: currentSeq,
    id: next.id,
    from: current.status,
    to: next.status,
    reason_short: reasonShort,
    demoted_from: next.demoted_from,
    demoted_by: auditOf(input.demotedBy),
  });
  return next;
}

/**
 * §83.11 Spec → Knowledge Demotion 主链落库（Hard Rule → Architecture/Governance
 * Review → Demote → Recommended Pattern / Heuristic）。产物 = 新知识候选
 * （status 恒 CANDIDATE——评审是降级动作的授权前提，不是知识 validation；
 * validation 走 §83.10 提升链 Validation 边），谱系成对强制：demotedFrom（被降级
 * 的 Hard Rule 引用）+ reviewRef（Architecture/Governance Review 引用）缺一即拒绝。
 * 产物 kind 限定 ENGINEERING_PATTERN | DECISION_HEURISTIC——§83.11 产物词形
 * 「Recommended Pattern / Heuristic」逐字两词形；FAILURE_PATTERN/DIAGNOSTIC_PLAYBOOK
 * 不是「Recommended Pattern/Heuristic」，降级产物拒绝。
 */
export async function demoteSpecToKnowledge(
  store: Store,
  input: KnowledgeRecordInput,
): Promise<KnowledgeEntry> {
  if (
    input.kind !== "ENGINEERING_PATTERN" &&
    input.kind !== "DECISION_HEURISTIC"
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `降级产物 kind 须为 Recommended Pattern / Heuristic（§83.11 产物词形）：${input.kind}`,
      "合法词形：ENGINEERING_PATTERN | DECISION_HEURISTIC；FAILURE_PATTERN/DIAGNOSTIC_PLAYBOOK 不是降级产物词形（走 recordKnowledge 正常登记）",
      { kind: input.kind },
    );
  }
  if (!input.demotedFrom?.trim()) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "demoteSpecToKnowledge 缺 demotedFrom（§83.11 谱系：被降级的 Hard Rule 引用必填）",
      "给出来源规则引用（宽松词形）；无来源规则的普通知识走 recordKnowledge",
      {},
    );
  }
  if (!input.reviewRef?.trim()) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "demoteSpecToKnowledge 缺 reviewRef（§83.11：Hard Rule 降级必经 Architecture/Governance Review——评审留痕必填）",
      "给出评审引用（宽松词形）；降级谱系与评审留痕成对落库",
      {},
    );
  }
  return recordKnowledge(store, input);
}

// ============================================================
// 检索（§83.8「检索而不是全量注入」——检索语义单一实现点）
// ============================================================

/**
 * 可注入状态裁定量（P28-Commands decisions；非词表——值取自既有 §83.9 五状态闭包）：
 * §83.10 提升链「Knowledge Candidate → Validation → …」——Validation 之后的经验才
 * 进检索注入分母；CANDIDATE 是 review-candidates 呈现面的等待分母（未验证候选
 * 不进上下文，防未验证经验洗白成「值得想起」）；REJECTED/DEPRECATED 是终态
 * （validateKnowledgeTransition hint 逐字「不再生效」）。PROMOTED 与 VALIDATED 同权
 * 注入——knowledge 本体恒 ADVISORY，PROMOTED 只是谱系状态（§83.2 铁律）。
 */
export const KNOWLEDGE_INJECTABLE_STATUSES: readonly KnowledgeStatusValue[] = [
  "VALIDATED",
  "PROMOTED",
];

/**
 * 检索词 token 化（词级精确匹配的最小归一形态）：lowercase 后按非字母数字/
 * 非 CJK 字符切段；CJK 连续段整段成一个 token（v1 不引分词器——细粒度中文
 * 分词无 PRD 出处，禁发明）。纯词级匹配、禁子串猜测（P31 同款纪律的检索面
 * 应用：FE 与 frontend 等未登记等价一律不猜测，等价须经词汇表 PR 登记）。
 */
export function knowledgeQueryTokens(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9一-鿿]+/)
    .filter((token) => token.length > 0);
}

/** 检索请求（§83.8「按 Change Localization 检索注入」的检索域承载）。 */
export interface KnowledgeSearchRequest {
  /** 角色域 lane 词（Change Localization 承载之一）。 */
  readonly role?: string;
  /** 变更/任务引用（Change Localization 承载之一）。 */
  readonly taskRef?: string;
  /** 范围对象 id 词形集合（投影分母通道的 id；Change Localization 承载之一）。 */
  readonly denominatorIds?: readonly string[];
  /** 显式检索词（CLI `knowledge search <query>`；投影通道不使用——禁发明投影参数）。 */
  readonly hints?: readonly string[];
}

/** 单条检索命中（matchedTokens 即 why-matched，可判卷）。 */
export interface KnowledgeSearchHit {
  readonly entry: KnowledgeEntry;
  readonly matchedTokens: readonly string[];
}

/**
 * Knowledge 检索（§83.8 单一实现点；projection 注入与 CLI search 同源同语义）。
 *
 * 检索域（Change Localization 承载）= role + taskRef + denominatorIds + hints
 * 各自 knowledgeQueryTokens 后的并集。
 * 检索键 = entry.title + entry.triggers（§83.4 字段：title 是身份必填、triggers
 * 是「什么情况下应想起这条经验」的检索键承载；observations/diagnostic_questions/
 * recommendation/counter_examples 是经验正文不是检索键——检索而非全文扫描）。
 * 命中 = 检索域 token ∩ 检索键 token ≠ ∅（词级精确；禁子串/等价猜测）。
 * 注入分母 = status ∈ KNOWLEDGE_INJECTABLE_STATUSES（decisions 裁定，见其头注）。
 * 输出确定性：命中按 id 字典序、matchedTokens 字典序——同输入重放字节稳定（D24）。
 */
export function searchKnowledge(
  library: KnowledgeLibraryFile,
  request: KnowledgeSearchRequest,
): readonly KnowledgeSearchHit[] {
  const domainTokens = new Set<string>();
  for (const piece of [
    request.role ?? "",
    request.taskRef ?? "",
    ...(request.denominatorIds ?? []),
    ...(request.hints ?? []),
  ]) {
    for (const token of knowledgeQueryTokens(piece)) domainTokens.add(token);
  }
  const hits: KnowledgeSearchHit[] = [];
  for (const entry of library.entries) {
    if (!KNOWLEDGE_INJECTABLE_STATUSES.includes(entry.status)) continue;
    const keyTokens = new Set<string>();
    for (const piece of [entry.title, ...entry.triggers]) {
      for (const token of knowledgeQueryTokens(piece)) keyTokens.add(token);
    }
    const matched = [...domainTokens].filter((token) => keyTokens.has(token)).sort();
    if (matched.length > 0) hits.push({ entry, matchedTokens: matched });
  }
  hits.sort((a, b) => (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));
  return hits;
}

// ============================================================
// 内部共享（find/replace/require helpers + 唯一落盘点）
// ============================================================

function findEntry(
  library: KnowledgeLibraryFile,
  id: string,
): KnowledgeEntry {
  const entry = library.entries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `knowledge 不在册：${id}（state/knowledge-library.json 无此 id）`,
      "先经 recordKnowledge 登记知识候选（§25.3 Knowledge Candidate）；§44.10 knowledge inspect 可查在册清单",
      { id },
    );
  }
  return entry;
}

function requireReasonShort(reasonShort: string, id: string): string {
  return requireNonEmpty(
    reasonShort,
    "reasonShort",
    `转移原因必填（${id}；transition_object op 的 reasonShort 先例——淘汰/拒绝不留原因 = 静默状态翻转）`,
  );
}

function requireNonEmpty(value: string, field: string, why: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 为空（${why}）`,
      why,
      { [field]: value },
    );
  }
  return trimmed;
}

/** 库内条目替换（按 id 定位 map 替换；保持顺序确定性）。 */
function replacedEntries(
  library: KnowledgeLibraryFile,
  next: KnowledgeEntry,
): readonly KnowledgeEntry[] {
  return library.entries.map((entry) => (entry.id === next.id ? next : entry));
}

/**
 * 唯一落盘点（library staged write + journal 追加，模式同 ledger.recordException）：
 * executeWrites 两写一事务，任一步失败回滚到事务前（captureOriginal 字节恢复），
 * 不落半写状态。
 */
function writeLibraryAndJournal(
  paths: StorePaths,
  nextEntries: readonly KnowledgeEntry[],
  event: Record<string, unknown>,
): void {
  const updatedFile: KnowledgeLibraryFile = {
    version: 1,
    entries: nextEntries,
  };
  const journalLine = `${JSON.stringify(event)}\n`;
  executeWrites([
    {
      path: paths.knowledgeLibraryPath,
      next: `${JSON.stringify(updatedFile, null, 2)}\n`,
      original: captureOriginal(paths.knowledgeLibraryPath),
    },
    {
      path: paths.journalPath,
      next: `${readText(paths.journalPath) ?? ""}${journalLine}`,
      original: captureOriginal(paths.journalPath),
    },
  ]);
}
