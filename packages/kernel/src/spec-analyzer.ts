/**
 * spec-analyzer.ts —— Trellis Spec Analyzer 内核（P30 · PRD §96 第 8 步「只分析，不 Apply」）。
 *
 * 设计输入（改签名前必读）：
 * - PRD §96 第 8 步「Trellis Spec Analyzer（只分析，不 Apply）」+ §70.6；wave3-plan.md P30 范围锚。
 * - §93.3 自动拆解 Pipeline：Section Parser → Semantic Candidate Extraction（八类映射表）
 *   → Duplicate / Overlap Analysis → Frontend-Backend Cross-lane Consolidation → Human
 *   Review → Catalog / Project State / Knowledge——**Analyzer 止步于 Human Review 之前**
 *   （本模块产出到 overlap/cross-lane 清单为止，裁决归 Human Review，无任何落库通路）。
 * - §93.4 Migration Classification：十二分类词形唯一来源 CATALOG_CLASSIFICATION_VALUES
 *   （@pomaster/schemas vocab.ts，vocab-lock catalog_layer_vocab V6 甄选）；「不得因为旧
 *   文件名带 hard-spec 就默认升级为 MUST」落为机器判据：文件名词形不进入分类特征集，
 *   只有正文语义证据计分（同内容异文件名 ⇒ 同分类，对照测试钉住）。
 * - §93.5 Universal 与 Project-specific 分离：识别 project choice 语句（「本项目使用 X」类）
 *   标 split_hint=PROJECT_STATE，与通用底线（Catalog 候选）分开呈现——只提示不落 Project State。
 * - §92.5 Policy Activation / §92.6 Hard Spec 名称退场：附带清单见 activationCandidates /
 *   nameExitList；CANDIDATE_KIND_MAPPING 承载 §93.3 八信号行（逐字）；§92.1 拆解表的
 *   MUST/MUST NOT 合并行之外的两行（Scope/Non-Scope→Applicability Metadata、
 *   Terms→Glossary/Schema）未入映射——范围如实声明，扩张归后续批次。〔勘正：初稿
 *   误称「十一行逐字承载」，审计 MINOR 抓出〕
 * - §93.6 Migration Validation：四词形 --analyze/--propose/--diff/--apply——本模块是
 *   --analyze 的内核形态；--propose/--diff/--apply 显式 deferred（呈现层提示归后续批次，
 *   不私接、不静默）。Apply 前置检查九项中本报告承载六项（检查器形态），其余三项
 *   （source / provenance、old ID → new ID mapping、catalog lock reproducibility）是
 *   Apply 时态检查，同样显式 deferred（见 precheckDeferred）。
 *
 * analyze-only 封条（结构性，非约定）：
 * 1. 导出面无任何写 catalog / 项目 state 的函数——签名只接受目录路径或文件内容，无
 *    Store、无写回调（类型层断言钉住，tests/spec-analyzer.spec.ts）；
 * 2. TransactionOp 联合无任何 Analyzer op——候选清单没有任何经 store 事务入 truth-index
 *    的键位（knowledge 平面同款封条先例）；
 * 3. 本模块零写 IO：只读（readdir/readFile），全树字节快照对照测试钉住零落盘；
 * 4. splitHint=PROJECT_STATE 是呈现位不是写入位——§93.5 的「拆去 Project State」由
 *    Human Review 之后的受控通路执行，Analyzer 只产出提示。
 *
 * 词形纪律：
 * - 十二分类值唯一来源 CATALOG_CLASSIFICATION_VALUES（禁私造轴值）；发射前经
 *   normalizeClassificationValue 词表闸（防篡改探测：词表外值运行时拒绝）；
 * - candidateKind 八词形 = §93.3 映射表右列逐字；signals = 左列逐字；
 * - PENDING_REVIEW 是本报告的**呈现桶**（低置信候选诚实呈现），不是 §93.4 词表新值
 *   （PENDING_REVIEW ∉ CATALOG_CLASSIFICATION_VALUES，对照测试钉住）；
 * - 候选 id（SA-nnnn）是本报告局部通路编号词形（GRN-/CLM- 同族先例），非 governed
 *   前缀，不入 id_namespace 闭包；
 * - precheck 六检 id 与 deferred 词形是 §93.6 原文条目的机械 snake_case 镜像
 *   （RUNTIME_DEGRADATION_RULE_IDS 同款先例），kernel 局部词，待词汇表 PR 裁决。
 *
 * 确定性：文件按相对 posix 路径排序、候选按扫描序编号、链接按 (a,b) 字典序、
 * 零墙钟（A4）——同输入重放报告字节稳定。
 */
import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  CATALOG_CLASSIFICATION_VALUES,
  type CatalogClassificationValue,
  type CatalogEnforcementValue,
} from "@pomaster/schemas";
import { sha256OfUtf8 } from "./catalog.js";
import { GovernanceError } from "./errors.js";
import { readText } from "./io.js";

// ============================================================
// 常量与词形
// ============================================================

/** 报告方言标识（Analyzer 局部呈现词，非治理事实枚举；待词汇表 PR 裁决）。 */
export const SPEC_ANALYZER_REPORT_DIALECT = "pomaster.spec-analyzer/v0";

/** 低置信候选呈现桶（报告呈现位，非 §93.4 词表值；禁入分类特征）。 */
export const PENDING_REVIEW_BUCKET = "PENDING_REVIEW";

/** §93.5 分离提示词形（呈现位；「只提示不落 Project State」）。 */
export const PROJECT_STATE_HINT = "PROJECT_STATE";

/** 文本级重复判定阈值（normalized 全等短路 + 相似度 ≥ 阈值）；机械判据，可调常数。 */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.9;

/** 文本相似（overlap）下限：< 阈值不建链（噪声抑制）；机械判据，可调常数。 */
export const OVERLAP_SIMILARITY_THRESHOLD = 0.6;

/** 疑似矛盾（正反极性 + 同 subject 文本相似）下限；机械判据，可调常数。 */
export const CONTRADICTION_SIMILARITY_THRESHOLD = 0.45;

/** §93.3 行 key（must 与 must_not 共享行 1「MUST / MUST NOT」）。 */
type RowKey =
  | "must"
  | "must_not"
  | "should"
  | "contract"
  | "checklist"
  | "example"
  | "anti_pattern"
  | "ownership"
  | "change_policy";

/** §93.3 右列候选词形（八类逐字；must/must_not 同属行 1 的 Policy Candidate）。 */
export type CandidateKind =
  | "Policy Candidate"
  | "Policy or Knowledge Candidate"
  | "Contract / Baseline Candidate"
  | "Gate Recipe Candidate"
  | "Pattern Candidate"
  | "Failure Pattern Candidate"
  | "Authority Candidate"
  | "Transition Candidate";

/** §93.3 八类映射表 + §92.1 拆解表（左列 signals / 右列 candidateKind 逐字承载）。 */
export interface CandidateKindMappingRow {
  /** §93.3 左列原文（逐字）。 */
  readonly signals: readonly string[];
  /** §93.3 右列原文（逐字）。 */
  readonly candidateKind: CandidateKind;
  /** §92.1 拆解表「POMaster 身份」列原文（逐字）。 */
  readonly identity: string;
  /** §92.1 拆解表「Authority / Enforcement」列原文（逐字）。 */
  readonly authorityEnforcement: string;
}

export const CANDIDATE_KIND_MAPPING: readonly CandidateKindMappingRow[] = [
  {
    signals: ["MUST / MUST NOT"],
    candidateKind: "Policy Candidate",
    identity: "Engineering Policy",
    authorityEnforcement: "required when applicable",
  },
  {
    signals: ["SHOULD"],
    candidateKind: "Policy or Knowledge Candidate",
    identity: "Knowledge / Heuristic 或 configurable Policy",
    authorityEnforcement: "advisory/default",
  },
  {
    signals: ["Contract"],
    candidateKind: "Contract / Baseline Candidate",
    identity: "Project Contract / Baseline Template",
    authorityEnforcement: "project-governed",
  },
  {
    signals: ["Checklist"],
    candidateKind: "Gate Recipe Candidate",
    identity: "Gate Recipe / Evidence Requirement",
    authorityEnforcement: "deterministic where possible",
  },
  {
    signals: ["Example"],
    candidateKind: "Pattern Candidate",
    identity: "Knowledge Pattern",
    authorityEnforcement: "advisory",
  },
  {
    signals: ["Anti-pattern"],
    candidateKind: "Failure Pattern Candidate",
    identity: "Failure Pattern",
    authorityEnforcement: "advisory / diagnostic",
  },
  {
    signals: ["Ownership"],
    candidateKind: "Authority Candidate",
    identity: "Authority Metadata",
    authorityEnforcement: "authoritative",
  },
  {
    signals: ["Change Policy"],
    candidateKind: "Transition Candidate",
    identity: "Transition Policy",
    authorityEnforcement: "governed",
  },
];

/** rowKey → 映射行（内部寻址；must/must_not 同行）。 */
const ROW_BY_KEY: Readonly<Record<RowKey, CandidateKindMappingRow>> = {
  must: CANDIDATE_KIND_MAPPING[0] as CandidateKindMappingRow,
  must_not: CANDIDATE_KIND_MAPPING[0] as CandidateKindMappingRow,
  should: CANDIDATE_KIND_MAPPING[1] as CandidateKindMappingRow,
  contract: CANDIDATE_KIND_MAPPING[2] as CandidateKindMappingRow,
  checklist: CANDIDATE_KIND_MAPPING[3] as CandidateKindMappingRow,
  example: CANDIDATE_KIND_MAPPING[4] as CandidateKindMappingRow,
  anti_pattern: CANDIDATE_KIND_MAPPING[5] as CandidateKindMappingRow,
  ownership: CANDIDATE_KIND_MAPPING[6] as CandidateKindMappingRow,
  change_policy: CANDIDATE_KIND_MAPPING[7] as CandidateKindMappingRow,
};

/** candidateKind → 映射行（八 kind 与八行一一对应；activation/authority 列承载）。 */
const ROW_BY_KIND: Readonly<Record<CandidateKind, CandidateKindMappingRow>> =
  Object.fromEntries(
    CANDIDATE_KIND_MAPPING.map((row) => [row.candidateKind, row]),
  ) as Readonly<Record<CandidateKind, CandidateKindMappingRow>>;

/**
 * 提取判据词形集（段内词形/结构特征；全部正则只作用于**剥除 frontmatter/HTML 注释后
 * 的正文**——文件名词形不进入特征集，§93.4 防升级判据的机器化）。
 */
const MARKERS = {
  /** MUST 词形（规范性强制）。 */
  must: /\bMUST\b|必须/,
  /** MUST NOT 词形（负向规范；特异性高于 must，先判）。 */
  mustNot: /MUST NOT|不得|禁止/,
  /** SHOULD 词形（advisory）。 */
  should: /\bSHOULD\b|应当|应该/,
  /** hard 规范词形（SHOULD 段内出现 = 升级嫌疑；§93.6「SHOULD 被错误升级为 hard」）。 */
  hardNormative: /\bMUST\b|必须|不得|禁止/,
  /** 契约词形。 */
  contract: /\bcontract\b|契约/i,
  /** 契约结构词形（contract 行 body 特征要求契约词 + 结构词双命中，抑制 Terms 误报）。 */
  contractStructure: /必须|定义|字段|输入|输出|版本|\bmust\b/i,
  /** 清单形态（checkbox 语法；「清单形态」结构特征）。 */
  checklistItem: /^[-*+]\s+\[[ xX]\]/,
  /** 示例词形。 */
  example: /例如|比如|示例|\bexample\b/i,
  /** 反例词形。 */
  antiPattern: /anti-?pattern|反模式|反例/i,
  /** 所有权词形。 */
  ownership: /\bownership\b|\bowner\b|负责|维护方|归属/i,
  /** 变更策略词形。 */
  changePolicy: /\bchange policy\b|变更策略|变更流程|变更协议/i,
  /** project choice 语句（§93.5「本项目使用 X」类；行级拆分）。 */
  projectChoice:
    /本项目(使用|采用|选用|选择|统一)|当前项目(使用|采用|统一)|统一使用|统一采用|this project (uses|adopts|selects|standardizes)/i,
  /** lane 词形（正文语义证据；目录/文件名词形不进特征集）。 */
  laneFrontend: /\bfrontend\b|前端/i,
  laneBackend: /\bbackend\b|后端/i,
  /** 废弃/否决词形（§93.4 DEPRECATED/REJECTED 的正文证据）。 */
  deprecated: /\bdeprecated\b|已废弃|废弃|不再维护/i,
  rejected: /\brejected?\b|已否决|否决/i,
  /** 宪法级词形（§93.4 CONSTITUTION 的正文证据；低频合法）。 */
  constitution: /\bconstitution\b|宪法|根本原则|最高原则/i,
} as const;

/** 占位正文（标题信号在场但正文无内容——低置信诚实落 PENDING_REVIEW 的典型形态）。 */
const PLACEHOLDER_BODY = /^\(to be filled[^)]*\)$|^待填$|^tbd$/i;

/** 规范标题词形（Trellis 协议结构；must_not 先于 must 匹配防吞）。 */
const HEADING_ROW: readonly (readonly [RegExp, RowKey])[] = [
  [/^must not$/i, "must_not"],
  [/^must$/i, "must"],
  [/^should$/i, "should"],
  [/^(?:contract|契约)$/i, "contract"],
  [/^(?:checklist|检查清单|清单)$/i, "checklist"],
  [/^(?:examples?|示例)$/i, "example"],
  [/^(?:anti-?patterns?|反模式|反例)$/i, "anti_pattern"],
  [/^(?:ownership|所有权|职责)$/i, "ownership"],
  [/^(?:change policy|变更策略)$/i, "change_policy"],
];

// ============================================================
// §93.6 前置检查（analyze 版；id = §93.6 原文条目的机械 snake_case 镜像）
// ============================================================

export type PreCheckId =
  | "semantic_duplicate"
  | "frontend_backend_overlap"
  | "contradictory_must"
  | "should_upgraded_to_hard"
  | "project_choice_in_global"
  | "example_as_project_truth";

export const PRECHECK_IDS: readonly PreCheckId[] = [
  "semantic_duplicate",
  "frontend_backend_overlap",
  "contradictory_must",
  "should_upgraded_to_hard",
  "project_choice_in_global",
  "example_as_project_truth",
];

const PRECHECK_PRD: Readonly<Record<PreCheckId, string>> = {
  semantic_duplicate: "§93.6「semantic duplicate」+ §93.3 Duplicate / Overlap Analysis",
  frontend_backend_overlap: "§93.6「frontend/backend overlap」+ §93.3 Cross-lane Consolidation",
  contradictory_must: "§93.6「contradictory MUST」",
  should_upgraded_to_hard: "§93.6「SHOULD 被错误升级为 hard」+ §93.4 防升级判据",
  project_choice_in_global: "§93.6「project choice 被错误放进 global catalog」+ §93.5",
  example_as_project_truth: "§93.6「example 被错误识别为 project truth」",
};

/**
 * §92.5 Policy Activation 候选清单的承载分类（具备激活形态的十二值子集）。
 * 依据 §92.1 Authority/Enforcement 列：required when applicable / deterministic where
 * possible / project-governed / authoritative 有激活或治理承载形态；KNOWLEDGE_PATTERN /
 * FAILURE_PATTERN 恒 advisory（§92.1）不激活；DEPRECATED/DUPLICATE/REJECTED 是处置态。
 * TECHNOLOGY_PROFILE 有意不在本集：§92.5 公式里它是激活**输入**（Active Project
 * Profiles），不是被激活的规则本体。
 */
export const ACTIVATION_BEARING_CLASSIFICATIONS: readonly CatalogClassificationValue[] = [
  "CONSTITUTION",
  "UNIVERSAL_POLICY",
  "LANE_POLICY",
  "PROJECT_BASELINE_TEMPLATE",
  "CONTRACT_TEMPLATE",
  "GATE_RECIPE",
];

// ============================================================
// 输入/输出形态（JSON 内联 schema：以下类型即报告结构定义）
// ============================================================

/** 分析输入：单个 Markdown 文件（relativePath 为 spec 目录内 posix 相对路径）。 */
export interface SpecFileInput {
  readonly relativePath: string;
  readonly text: string;
}

/** Section Parser 输出段（逐文件逐段记录来源：file + heading path + 行锚）。 */
export interface SpecSection {
  /** spec 目录内 posix 相对路径。 */
  readonly file: string;
  /** 祖先标题链（根在前）；序文段为空数组。 */
  readonly headingPath: readonly string[];
  /** 标题层级（1-6）；序文段为 0。 */
  readonly level: number;
  /** 起始行（1-based 含标题行/序文首行）。 */
  readonly lineStart: number;
  /** 结束行（1-based 含段末行）。 */
  readonly lineEnd: number;
  /** 段正文（剥除 frontmatter；保留代码围栏原文）。 */
  readonly body: string;
}

/** 候选出处锚（file + heading path + 行锚，逐候选必带）。 */
export interface SpecCandidateSource {
  readonly file: string;
  readonly headingPath: readonly string[];
  readonly lineStart: number;
  readonly lineEnd: number;
}

/** 单条语义候选（§93.3 提取 + §93.4 分类 + §93.5 分离提示的逐候选承载）。 */
export interface SpecCandidate {
  /** SA-nnnn（本报告局部通路编号；非 governed 前缀）。 */
  readonly id: string;
  /** §93.3 右列词形（逐字）。 */
  readonly candidateKind: CandidateKind;
  /** 出处锚（§93.3 提取行 + §92.1 身份列）。 */
  readonly prdAnchor: string;
  readonly source: SpecCandidateSource;
  /** 原文摘录（≤3 行；超出以 excerptTruncated 显式标注）。 */
  readonly evidenceExcerpt: string;
  readonly excerptTruncated: boolean;
  /** 提取理由（命中的词形/结构特征 + §93.3 映射行）。 */
  readonly extractionReason: string;
  /** §93.4 十二值之一；null = PENDING_REVIEW 呈现桶（诚实呈现，不硬分类）。 */
  readonly classification: CatalogClassificationValue | null;
  readonly classificationConfidence: "high" | "medium" | "low";
  /** 分类判据显式声明（正文语义证据计分；文件名不进特征集——§93.4）。 */
  readonly classificationBasis: string;
  /** classification=null 时的显式原因（禁静默）。 */
  readonly pendingReason: string | null;
  /** Policy Candidate 极性（MUST=affirmative / MUST NOT=negative；矛盾检查判据位）。 */
  readonly policyPolarity: "affirmative" | "negative" | null;
  /** §92.1 强制力提示（仅发射 CATALOG_ENFORCEMENT_VALUES 词形；无对应值=null 不强映射）。 */
  readonly enforcementHint: CatalogEnforcementValue | null;
  /** §93.5 分离提示（只提示不落 Project State）。 */
  readonly splitHint: typeof PROJECT_STATE_HINT | null;
  /** 命中的 project choice 原文（≤3 行摘录）。 */
  readonly splitEvidence: string | null;
}

/** 跨候选重复/重叠链接（§93.3；DUPLICATE 判定只落文本级，语义级交 Human Review）。 */
export interface SpecOverlapLink {
  readonly a: string;
  readonly b: string;
  /** 0..1（4 位小数；latin 词形 token + CJK 字符 bigram 机械特征的 Jaccard）。 */
  readonly similarity: number;
  readonly relation: "duplicate" | "overlap";
  readonly crossLane: boolean;
}

/** Frontend-Backend 跨 lane 重叠行（呈现清单；**不自动合并**——Human Review 位于其后）。 */
export interface SpecCrossLaneRow {
  readonly a: string;
  readonly b: string;
  readonly similarity: number;
  readonly laneA: "frontend" | "backend";
  readonly laneB: "frontend" | "backend";
  readonly note: string;
}

/** §93.6 前置检查行（analyze 版检查器形态：命中项呈现，不做 verdict 判卷）。 */
export interface SpecPreCheckRow {
  readonly check: PreCheckId;
  readonly prd: string;
  readonly hitCount: number;
  readonly hits: readonly SpecPreCheckHit[];
}

export interface SpecPreCheckHit {
  readonly candidates: readonly string[];
  readonly detail: string;
}

/** §93.6 Apply 时态（显式 deferred，不私接、不静默）。 */
export interface SpecPreCheckDeferred {
  readonly prd: string;
  readonly applyTimeChecks: readonly string[];
  readonly deferredForms: readonly string[];
}

/** 逐文件清单行（分母 fail-closed 的逐文件分子）。 */
export interface SpecAnalysisFileRow {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly frontmatterId: string | null;
  readonly sectionCount: number;
  readonly candidateCount: number;
}

/** 分母块（缺席/空目录=显式错误而非空清单的 fail-closed 承载）。 */
export interface SpecAnalysisDenominator {
  /** analyzeSpecFiles 纯输入时为 null（无目录语境）。 */
  readonly specDir: string | null;
  readonly scannedFileCount: number;
  readonly files: readonly SpecAnalysisFileRow[];
  /** 目录内非 .md 文件数（跳过显式计数，不静默）。 */
  readonly nonMarkdownSkipped: number;
  readonly sectionsParsed: number;
  readonly candidateCount: number;
  readonly classifiedCount: number;
  /** classification=null 的候选数（PENDING_REVIEW 呈现桶分母）。 */
  readonly unclassifiedCount: number;
}

/** §92.5 Policy Activation 候选清单行（哪些分类结果具备激活形态）。 */
export interface SpecActivationRow {
  readonly candidateId: string;
  readonly classification: CatalogClassificationValue;
  /** §92.1「Authority / Enforcement」列原文（逐字）。 */
  readonly authorityEnforcement: string;
  readonly note: string;
}

/** §92.6 Hard Spec 名称退场清单行（DEPRECATED/DUPLICATE/REJECTED 候选的旧名称应退场）。 */
export interface SpecNameExitEntry {
  readonly candidateId: string;
  /** 旧名称（来源 file + heading path 链）。 */
  readonly legacyName: string;
  readonly classification: CatalogClassificationValue;
  readonly prd: "§92.6";
}

/** 分析报告（JSON 可序列化；结构 schema 即本类型）。 */
export interface SpecAnalysisReport {
  readonly reportSchema: typeof SPEC_ANALYZER_REPORT_DIALECT;
  readonly specDir: string | null;
  readonly denominator: SpecAnalysisDenominator;
  readonly candidates: readonly SpecCandidate[];
  /** PENDING_REVIEW 呈现桶（候选 id 列表；词表外呈现位，非 §93.4 新值）。 */
  readonly pendingReview: readonly string[];
  readonly overlapLinks: readonly SpecOverlapLink[];
  readonly crossLaneConsolidation: readonly SpecCrossLaneRow[];
  readonly precheck: readonly SpecPreCheckRow[];
  readonly precheckDeferred: SpecPreCheckDeferred;
  readonly activationCandidates: readonly SpecActivationRow[];
  readonly nameExitList: readonly SpecNameExitEntry[];
  /** 诚实呈现注记（analyze-only 封条、机器判据边界等；确定性字符串）。 */
  readonly notes: readonly string[];
}

/** analyzeSpecFiles 的可选来源语境（analyzeSpecDir 透传；纯输入缺省为 null/0）。 */
export interface SpecAnalysisSource {
  readonly specDir: string | null;
  readonly nonMarkdownSkipped: number;
}

// ============================================================
// 词表闸（防篡改探测：分类值发射前对账 CATALOG_CLASSIFICATION_VALUES）
// ============================================================

/**
 * 分类词表闸（纯函数）：词表内值原样返回；词表外值（含大小写变体、私造轴值）一律
 * null——Analyzer 发射面前统一过闸，内部逻辑被改坏也不会静默产出词表外分类
 * （篡改探测契约：mock 非法分类值 → 运行时拒绝）。
 */
export function normalizeClassificationValue(value: string): CatalogClassificationValue | null {
  return (CATALOG_CLASSIFICATION_VALUES as readonly string[]).includes(value)
    ? (value as CatalogClassificationValue)
    : null;
}

// ============================================================
// Section Parser（§93.3 第一步；沿 P28 检索注入 tokenizer 先例切段）
// ============================================================

interface ParsedFrontmatter {
  readonly present: boolean;
  readonly id: string | null;
  readonly endLine: number; // 1-based（--- 结束行）；无 frontmatter 为 0
}

function parseFrontmatter(text: string): ParsedFrontmatter {
  const lines = text.split("\n");
  if ((lines[0] ?? "").trim() !== "---") {
    return { present: false, id: null, endLine: 0 };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? "").trim() === "---") {
      const block = lines.slice(1, i).join("\n");
      const idMatch = /^id:\s*(.+?)\s*$/m.exec(block);
      return { present: true, id: idMatch?.[1] ?? null, endLine: i + 1 };
    }
  }
  return { present: false, id: null, endLine: 0 };
}

/**
 * Markdown 标题分段（纯函数）：按标题行切段（#/空白/换行切段，沿 P28 检索注入
 * tokenizer 的机械切段先例——不引 markdown AST 依赖）。切段模型：任一层级标题都开启
 * 新段，段止于下一个任意层级标题（headingPath 承载祖先链）；代码围栏（```/~~~）内的
 * # 行不是标题；frontmatter 剥离不产段；首个标题前的序文为 level 0 段（空则不产段）。
 * 逐段记录来源（file + headingPath + 1-based 行锚）。
 */
export function parseSpecMarkdown(relativePath: string, text: string): readonly SpecSection[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const frontmatter = parseFrontmatter(normalized);

  interface OpenChunk {
    readonly headingPath: readonly string[];
    readonly level: number;
    readonly lineStart: number;
    readonly bodyLines: string[];
  }
  const sections: SpecSection[] = [];
  let ancestors: readonly { readonly level: number; readonly title: string }[] = [];
  let current: OpenChunk | null = null;
  let inFence = false;
  let fenceMarker = "";

  const closeCurrent = (endLineExclusive: number): void => {
    const chunk = current;
    if (chunk === null) return;
    current = null;
    const body = chunk.bodyLines.join("\n");
    // 空序文不产段（无内容的文件头空隙；标题段即便空正文也保留——标题是结构）。
    if (chunk.level === 0 && body.trim().length === 0) return;
    sections.push({
      file: relativePath,
      headingPath: chunk.headingPath,
      level: chunk.level,
      lineStart: chunk.lineStart,
      lineEnd: Math.max(chunk.lineStart, endLineExclusive - 1),
      body,
    });
  };

  // 序文段（frontmatter 之后、首个标题之前）。
  current = {
    headingPath: [],
    level: 0,
    lineStart: frontmatter.endLine + 1,
    bodyLines: [],
  };

  // 从 frontmatter 之后开始扫（0-based 起点 = 1-based endLine）——frontmatter 行
  // 不进序文正文（序文空则不产段的判据才成立）。
  for (let i = frontmatter.endLine; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const lineNumber = i + 1;
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence !== null) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1] ?? "```";
      } else if (line.trim().startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = "";
      }
      current?.bodyLines.push(line);
      continue;
    }
    const heading = inFence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? "#").length;
      const title = (heading[2] ?? "").trim();
      closeCurrent(lineNumber);
      ancestors = [
        ...ancestors.filter((entry) => entry.level < level),
        { level, title },
      ];
      current = {
        headingPath: ancestors.map((entry) => entry.title),
        level,
        lineStart: lineNumber,
        bodyLines: [],
      };
      continue;
    }
    current?.bodyLines.push(line);
  }
  closeCurrent(lines.length + 1);
  return sections;
}

// ============================================================
// 相似度特征（P28 tokenizer 先例 + CJK 字符 bigram 机械特征；非分词、无词典）
// ============================================================

/**
 * 相似度特征 token：latin 词沿 P28 knowledgeQueryTokens 同型切段（lowercase、非字母
 * 数字切分）；CJK 连续段**不做分词**（v1 禁发明中文分词），改产字符 bigram 机械
 * n-gram 特征（无词典、纯机械；整段 CJK 单 token 会让同文异抄的 Jaccard 失真）。
 * 仅用于 Duplicate/Overlap 相似度，不用于检索注入（knowledgeQueryTokens 语义不动）。
 */
export function specSimilarityTokens(text: string): readonly string[] {
  const tokens = new Set<string>();
  const runs = text.toLowerCase().match(/[a-z0-9]+|[一-鿿]+/g) ?? [];
  for (const run of runs) {
    if (/^[a-z0-9]+$/.test(run)) {
      tokens.add(run);
      continue;
    }
    if (run.length === 1) {
      tokens.add(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i += 1) {
      tokens.add(run.slice(i, i + 2));
    }
  }
  return [...tokens];
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let inter = 0;
  for (const token of a) {
    if (b.has(token)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 4 位小数（跨平台浮点稳定的输出形态）。 */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// ============================================================
// 候选提取与分类（§93.3 第二步 + §93.4）
// ============================================================

interface Unit {
  readonly text: string;
  readonly lineStart: number;
  readonly lineEnd: number;
}

function stripComments(body: string): string {
  return body.replace(/<!--[\s\S]*?-->/g, "");
}

function isPlaceholderBody(body: string): boolean {
  const stripped = stripComments(body).trim();
  return stripped.length === 0 || PLACEHOLDER_BODY.test(stripped);
}

function countMatches(text: string, marker: RegExp): number {
  return (text.match(new RegExp(marker.source, marker.flags.replace("g", "") + "g")) ?? []).length;
}

function hasMarker(text: string, marker: RegExp): boolean {
  return marker.test(text);
}

/**
 * 句级 project choice 拆分（§93.5）：命中行再按句读（。；;!！?？）切句，仅 project
 * choice 句拆出——「规则文本；本项目使用 X」混排条目得以正确拆分（整行拆分会把通用
 * 底线一并丢进 Project State 提示，违背 §93.5「把通用底线和项目当前选择拆开」）。
 */
function splitProjectChoiceSentences(body: string): {
  readonly projectSentences: readonly string[];
  readonly residual: string;
} {
  const projectSentences: string[] = [];
  const residualSentences: string[] = [];
  for (const line of stripComments(body).split("\n")) {
    if (!MARKERS.projectChoice.test(line)) {
      residualSentences.push(line);
      continue;
    }
    const pieces = line.split(/(。|；|;|!|！|\?|？)/);
    let buffer = "";
    for (let i = 0; i < pieces.length; i += 1) {
      buffer += pieces[i] ?? "";
      if (i % 2 === 1 || i === pieces.length - 1) {
        const sentence = buffer.trim();
        buffer = "";
        if (sentence.length === 0) continue;
        if (MARKERS.projectChoice.test(sentence)) {
          projectSentences.push(sentence);
        } else {
          residualSentences.push(sentence);
        }
      }
    }
  }
  return { projectSentences, residual: residualSentences.join("\n") };
}

/** 规则行（MUST/MUST NOT/SHOULD）按列表项拆 unit（§93.3「每条旧规则」粒度；pilot 先例）。 */
function ruleUnits(body: string, sectionStartLine: number): readonly Unit[] {
  const units: Unit[] = [];
  let itemLines: string[] = [];
  let itemStart = 0;
  let itemEnd = 0;
  let hasItem = false;
  let proseLines: string[] = [];
  let proseStart = 0;

  const flushItem = (): void => {
    if (hasItem) {
      units.push({ text: itemLines.join("\n").trim(), lineStart: itemStart, lineEnd: itemEnd });
      hasItem = false;
      itemLines = [];
    }
  };
  const flushProse = (): void => {
    const text = proseLines.join("\n").trim();
    if (text.length > 0) {
      units.push({ text, lineStart: proseStart, lineEnd: proseStart + proseLines.length - 1 });
    }
    proseLines = [];
  };

  const bodyLines = stripComments(body).split("\n");
  for (let i = 0; i < bodyLines.length; i += 1) {
    const raw = bodyLines[i] ?? "";
    const line = raw.trim();
    const absolute = sectionStartLine + i;
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    const content = bullet?.[1] ?? ordered?.[1] ?? null;
    if (content !== null) {
      flushProse();
      flushItem();
      hasItem = true;
      itemLines = [content.trim()];
      itemStart = absolute;
      itemEnd = absolute;
      continue;
    }
    if (line.length === 0) {
      flushProse();
      continue;
    }
    if (hasItem) {
      itemLines.push(line);
      itemEnd = absolute;
      continue;
    }
    if (proseLines.length === 0) proseStart = absolute;
    proseLines.push(line);
  }
  flushProse();
  flushItem();
  return units;
}

/** 块行（Contract/Checklist/Example/Anti-pattern/Ownership/Change Policy）整段一个 unit。 */
function blockUnits(
  body: string,
  sectionStartLine: number,
  sectionEndLine: number,
): readonly Unit[] {
  const text = stripComments(body).trim();
  if (text.length === 0) return [];
  return [{ text, lineStart: sectionStartLine, lineEnd: sectionEndLine }];
}

function excerptOf(text: string): { readonly excerpt: string; readonly truncated: boolean } {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return { excerpt: lines.slice(0, 3).join("\n"), truncated: lines.length > 3 };
}

interface ClassificationDraft {
  readonly classification: CatalogClassificationValue | null;
  readonly confidence: "high" | "medium" | "low";
  readonly basis: string;
  readonly pendingReason: string | null;
}

function laneOf(text: string): "frontend" | "backend" | null {
  const frontend = hasMarker(text, MARKERS.laneFrontend);
  const backend = hasMarker(text, MARKERS.laneBackend);
  if (frontend && !backend) return "frontend";
  if (backend && !frontend) return "backend";
  return null;
}

function laneClauseOf(lane: "frontend" | "backend" | null): string {
  return lane === null
    ? "lane 词形缺席 → Universal Engineering（§92.4 Universal Engineering）"
    : `lane 词形命中（${lane}）→ lane 专属（§92.4 Frontend-specific/Backend-specific）`;
}

/**
 * §93.4 分类（正文语义证据计分；文件名词形不进特征集）。
 * 判据层级：占位/空正文 → PENDING；project-choice-only → PENDING + split；废弃/否决
 * 声明 > 宪法级声明 > 行默认落地（lane 词形细分 UNIVERSAL/LANE）。
 */
function classifyUnit(
  rowKey: RowKey,
  unitText: string,
  detectedByHeading: boolean,
): ClassificationDraft {
  const { projectSentences, residual } = splitProjectChoiceSentences(unitText);
  const hasProjectChoice = projectSentences.length > 0;
  const residualTrimmed = residual.trim();

  // 占位/空正文：标题信号在场也无内容可判——诚实落 PENDING。
  if (isPlaceholderBody(unitText)) {
    return {
      classification: null,
      confidence: "low",
      basis: "分类判据：正文语义证据计分（§93.4）——正文为占位/空，无证据可计",
      pendingReason: "标题信号在场但正文为占位/空——无正文语义证据，不硬分类（§93.4 防升级纪律）",
    };
  }

  // project choice 拆分后无残余：候选体只是项目当前选择——§93.5 应拆去 Project State，
  // 不构成通用规则。
  if (hasProjectChoice && residualTrimmed.length === 0) {
    return {
      classification: null,
      confidence: "low",
      basis: "分类判据：正文语义证据计分（§93.4）——剥除 project choice 语句后无残余正文",
      pendingReason:
        "正文仅 project choice 语句（§93.5「本项目使用 X」类）——应拆去 Project State，非通用底线，不硬分类",
    };
  }

  const scoreText = residualTrimmed.length > 0 ? residualTrimmed : unitText;
  const mustHits = countMatches(scoreText, MARKERS.must);
  const mustNotHits = countMatches(scoreText, MARKERS.mustNot);
  const lane = laneOf(scoreText);

  // 废弃/否决声明优先（§93.4 DEPRECATED/REJECTED 的正文证据）。
  if (hasMarker(scoreText, MARKERS.deprecated)) {
    return {
      classification: "DEPRECATED",
      confidence: "high",
      basis: "正文含废弃声明词形 → DEPRECATED（§93.4；§92.6 Hard Spec 名称退场的判定源）",
      pendingReason: null,
    };
  }
  if (hasMarker(scoreText, MARKERS.rejected)) {
    return {
      classification: "REJECTED",
      confidence: "high",
      basis: "正文含否决声明词形 → REJECTED（§93.4；§92.6 Hard Spec 名称退场的判定源）",
      pendingReason: null,
    };
  }
  if (hasMarker(scoreText, MARKERS.constitution)) {
    return {
      classification: "CONSTITUTION",
      confidence: "medium",
      basis: "正文含宪法级词形（constitution/宪法/根本原则）→ CONSTITUTION（§93.4；判据为正文声明，低频合法）",
      pendingReason: null,
    };
  }

  const laneClause = laneClauseOf(lane);
  const laneClass: CatalogClassificationValue = lane === null ? "UNIVERSAL_POLICY" : "LANE_POLICY";

  switch (rowKey) {
    case "must":
    case "must_not": {
      const normativeHits = mustHits + mustNotHits;
      if (!detectedByHeading && normativeHits === 0) {
        return {
          classification: null,
          confidence: "low",
          basis: "分类判据：正文语义证据计分（§93.4）——无规范性词形（MUST/必须/不得/禁止）",
          pendingReason: "正文无规范性词形而标题亦未命中 MUST 词形——提取信号不足，不硬分类",
        };
      }
      return {
        classification: laneClass,
        confidence: "high",
        basis: `正文语义证据计分（文件名词形不进特征集，§93.4）：${detectedByHeading ? "标题词形即规范性信号，正文规范性词形" : "正文规范性词形"}×${normativeHits}；${laneClause}；MUST / MUST NOT → Engineering Policy，required when applicable（§93.3 行 1 + §92.1）`,
        pendingReason: null,
      };
    }
    case "should": {
      // SHOULD 段内出现 hard 词形 = §93.6「SHOULD 被错误升级为 hard」嫌疑——诚实落 PENDING。
      if (hasMarker(scoreText, MARKERS.hardNormative)) {
        return {
          classification: null,
          confidence: "low",
          basis:
            "分类判据：正文语义证据计分（§93.4）——SHOULD 信号与 hard 规范词形并存，advisory/required 证据冲突",
          pendingReason:
            "SHOULD 标题/词形段内含 hard 规范词形（MUST/必须/不得/禁止）——疑似被升级为 hard（§93.6），交 Human Review，不硬分类",
        };
      }
      return {
        classification: laneClass,
        confidence: "medium",
        basis: `正文语义证据计分（§93.4）：advisory 词形在场、hard 词形缺席；${laneClause}；SHOULD → Knowledge / Heuristic 或 configurable Policy（§93.3 行 2 + §92.1 双身份——落 policy 侧为 pilot-0001 先例，enforcement 恒 advisory）`,
        pendingReason: null,
      };
    }
    case "contract": {
      if (hasProjectChoice) {
        return {
          classification: "PROJECT_BASELINE_TEMPLATE",
          confidence: "medium",
          basis:
            "正文语义证据计分（§93.4）：契约段含 project choice 语句（§93.5）→ Baseline Template 侧（§92.1 Project Contract / Baseline Template，project-governed）；拆分提示见 splitHint",
          pendingReason: null,
        };
      }
      return {
        classification: "CONTRACT_TEMPLATE",
        confidence: "high",
        basis:
          "正文语义证据计分（§93.4）：Contract 信号在场、无 project choice 语句 → Contract Template（§93.3 行 3 + §92.1，project-governed）",
        pendingReason: null,
      };
    }
    case "checklist": {
      if (!hasMarker(scoreText, MARKERS.checklistItem) && !detectedByHeading) {
        return {
          classification: null,
          confidence: "low",
          basis: "分类判据：正文语义证据计分（§93.4）——无清单形态（checkbox 结构）",
          pendingReason: "无清单形态特征且标题未命中 Checklist——提取信号不足，不硬分类",
        };
      }
      return {
        classification: "GATE_RECIPE",
        confidence: "high",
        basis:
          "正文语义证据计分（§93.4）：清单形态（checkbox 结构/Checklist 标题）→ Gate Recipe / Evidence Requirement，deterministic where possible（§93.3 行 4 + §92.1）",
        pendingReason: null,
      };
    }
    case "example":
      return {
        classification: "KNOWLEDGE_PATTERN",
        confidence: "high",
        basis:
          "正文语义证据计分（§93.4）：Example 信号 → Knowledge Pattern，advisory（§93.3 行 5 + §92.1）",
        pendingReason: null,
      };
    case "anti_pattern":
      return {
        classification: "FAILURE_PATTERN",
        confidence: "high",
        basis:
          "正文语义证据计分（§93.4）：Anti-pattern 信号 → Failure Pattern，advisory / diagnostic（§93.3 行 6 + §92.1）",
        pendingReason: null,
      };
    case "ownership":
      return {
        classification: "UNIVERSAL_POLICY",
        confidence: "medium",
        basis:
          "正文语义证据计分（§93.4）：Ownership → Authority Metadata，authoritative（§93.3 行 7 + §92.1）；十二轴无独立 AUTHORITY 词值，按 pilot-0001 先例落 UNIVERSAL_POLICY（authority-map 条目），人工复核可调",
        pendingReason: null,
      };
    case "change_policy": {
      if (!hasMarker(scoreText, MARKERS.changePolicy) && !detectedByHeading) {
        return {
          classification: null,
          confidence: "low",
          basis: "分类判据：正文语义证据计分（§93.4）——无变更策略词形",
          pendingReason: "无变更策略词形且标题未命中 Change Policy——提取信号不足，不硬分类",
        };
      }
      return {
        classification: laneClass,
        confidence: "medium",
        basis: `正文语义证据计分（§93.4）：变更策略词形在场；${laneClause}；Change Policy → Transition Policy，governed（§93.3 行 8 + §92.1；Transition 词值不在十二轴，按 pilot-0001 先例落 policy 侧，人工复核可调）`,
        pendingReason: null,
      };
    }
  }
}

function enforcementHintFor(rowKey: RowKey): CatalogEnforcementValue | null {
  switch (rowKey) {
    case "must":
    case "must_not":
      return "required_when_applicable";
    case "should":
    case "example":
    case "anti_pattern":
      return "advisory";
    case "checklist":
      return "deterministic_where_possible";
    default:
      // project-governed / authoritative / governed 是 §92.1 Authority 列原文而非
      // CATALOG_ENFORCEMENT_VALUES 词形——不强映射（null），语义由 classificationBasis 承载。
      return null;
  }
}

interface ExtractedCandidate {
  readonly id: string;
  readonly candidateKind: CandidateKind;
  readonly prdAnchor: string;
  readonly source: SpecCandidateSource;
  readonly evidenceExcerpt: string;
  readonly excerptTruncated: boolean;
  readonly extractionReason: string;
  readonly classification: CatalogClassificationValue | null;
  readonly classificationConfidence: "high" | "medium" | "low";
  readonly classificationBasis: string;
  readonly pendingReason: string | null;
  readonly policyPolarity: "affirmative" | "negative" | null;
  readonly enforcementHint: CatalogEnforcementValue | null;
  readonly splitHint: typeof PROJECT_STATE_HINT | null;
  readonly splitEvidence: string | null;
}

/** 候选发射前词表闸（防篡改探测的管线内点位：内部逻辑坏掉也不会静默产出词表外值）。 */
function gateClassification(draft: ClassificationDraft): ClassificationDraft {
  if (draft.classification === null) return draft;
  const gated = normalizeClassificationValue(draft.classification);
  if (gated === draft.classification) return draft;
  return {
    classification: null,
    confidence: "low",
    basis: `${draft.basis}；【词表闸拦截】内部分类值「${String(draft.classification)}」∉ CATALOG_CLASSIFICATION_VALUES——显式落 PENDING_REVIEW，禁静默产出词表外轴值`,
    pendingReason: `内部分类值词表外（${String(draft.classification)}）——normalizeClassificationValue 拒绝，fail-closed`,
  };
}

const BODY_SIGNAL_LABEL: Readonly<Record<RowKey, string>> = {
  must: "MUST/必须",
  must_not: "MUST NOT/不得/禁止",
  should: "SHOULD/应当/应该",
  contract: "契约词形+契约结构",
  checklist: "checkbox 清单形态",
  example: "示例词形",
  anti_pattern: "反例词形",
  ownership: "所有权词形",
  change_policy: "变更策略词形",
};

function buildCandidate(
  id: string,
  rowKey: RowKey,
  section: SpecSection,
  unit: Unit,
  detectedByHeading: boolean,
  signalLabel: string,
): ExtractedCandidate {
  const row = ROW_BY_KEY[rowKey];
  const { excerpt, truncated } = excerptOf(unit.text);
  const draft = gateClassification(classifyUnit(rowKey, unit.text, detectedByHeading));
  const { projectSentences } = splitProjectChoiceSentences(unit.text);
  const polarity: "affirmative" | "negative" | null =
    rowKey === "must" ? "affirmative" : rowKey === "must_not" ? "negative" : null;
  const lastHeading = section.headingPath[section.headingPath.length - 1] ?? "";
  return {
    id,
    candidateKind: row.candidateKind,
    prdAnchor: "§93.3/§92.1",
    source: {
      file: section.file,
      headingPath: section.headingPath,
      lineStart: unit.lineStart,
      lineEnd: unit.lineEnd,
    },
    evidenceExcerpt: excerpt,
    excerptTruncated: truncated,
    extractionReason: detectedByHeading
      ? `标题词形「${lastHeading}」命中 §93.3 行「${row.signals.join(" / ")} → ${row.candidateKind}」`
      : `正文词形特征命中（${signalLabel}）§93.3 行「${row.signals.join(" / ")} → ${row.candidateKind}」（标题「${lastHeading || "(序文)"}」非规范词形）`,
    classification: draft.classification,
    classificationConfidence: draft.confidence,
    classificationBasis: draft.basis,
    pendingReason: draft.pendingReason,
    policyPolarity: polarity,
    enforcementHint: enforcementHintFor(rowKey),
    splitHint: projectSentences.length > 0 ? PROJECT_STATE_HINT : null,
    splitEvidence: projectSentences.length > 0 ? projectSentences.slice(0, 3).join("\n") : null,
  };
}

function extractFromSection(
  section: SpecSection,
  nextId: () => string,
): readonly ExtractedCandidate[] {
  // 规范标题命中（结构特征，最强信号）。
  const lastHeading = section.headingPath[section.headingPath.length - 1] ?? "";
  let rowKey: RowKey | null = null;
  if (section.level > 0) {
    for (const [pattern, key] of HEADING_ROW) {
      if (pattern.test(lastHeading)) {
        rowKey = key;
        break;
      }
    }
  }

  if (rowKey !== null) {
    const isRule = rowKey === "must" || rowKey === "must_not" || rowKey === "should";
    const units = isRule
      ? ruleUnits(section.body, section.lineStart)
      : blockUnits(section.body, section.lineStart, section.lineEnd);
    return units
      .filter((unit) => unit.text.trim().length > 0)
      .map((unit) => buildCandidate(nextId(), rowKey as RowKey, section, unit, true, ""));
  }

  // 非规范标题：正文词形特征检测。规则类信号按 **unit 自身词形**逐条解析行与极性
  // （段级信号不连坐——混合段里「必须 X」与「不得 Y」各归各行、镜像互补规则不误判
  // 成矛盾；无自身词形的条目不发射，分母以 sectionsParsed/candidateCount 差额显式
  // 呈现）。块类信号整段一个 unit。
  const bodyStripped = stripComments(section.body);
  if (bodyStripped.trim().length === 0) return [];

  const hasRuleSignal =
    MARKERS.mustNot.test(bodyStripped) ||
    MARKERS.must.test(bodyStripped) ||
    MARKERS.should.test(bodyStripped);

  if (hasRuleSignal) {
    const out: ExtractedCandidate[] = [];
    for (const unit of ruleUnits(section.body, section.lineStart)) {
      const text = stripComments(unit.text);
      let unitKey: RowKey | null = null;
      if (MARKERS.mustNot.test(text)) unitKey = "must_not";
      else if (MARKERS.must.test(text)) unitKey = "must";
      else if (MARKERS.should.test(text)) unitKey = "should";
      if (unitKey === null) continue;
      out.push(buildCandidate(nextId(), unitKey, section, unit, false, BODY_SIGNAL_LABEL[unitKey]));
    }
    return out;
  }

  const bodyKey = ((): RowKey | null => {
    if (MARKERS.contract.test(bodyStripped) && MARKERS.contractStructure.test(bodyStripped)) {
      return "contract";
    }
    if (MARKERS.checklistItem.test(bodyStripped)) return "checklist";
    if (MARKERS.example.test(bodyStripped)) return "example";
    if (MARKERS.antiPattern.test(bodyStripped)) return "anti_pattern";
    if (MARKERS.ownership.test(bodyStripped)) return "ownership";
    if (MARKERS.changePolicy.test(bodyStripped)) return "change_policy";
    return null;
  })();
  if (bodyKey === null) return [];

  const units = blockUnits(section.body, section.lineStart, section.lineEnd);
  return units
    .filter((unit) => unit.text.trim().length > 0)
    .map((unit) =>
      buildCandidate(nextId(), bodyKey as RowKey, section, unit, false, BODY_SIGNAL_LABEL[bodyKey as RowKey]),
    );
}

// ============================================================
// Duplicate / Overlap Analysis + Cross-lane Consolidation（§93.3 第三步）
// ============================================================

interface OverlapPassResult {
  readonly links: SpecOverlapLink[];
  readonly crossLane: SpecCrossLaneRow[];
  readonly duplicateOf: ReadonlyMap<string, { readonly canonical: string; readonly similarity: number }>;
}

function runOverlapPass(candidates: readonly ExtractedCandidate[]): OverlapPassResult {
  const tokenSets = candidates.map(
    (candidate) => new Set(specSimilarityTokens(stripComments(candidate.evidenceExcerpt))),
  );
  const compactTexts = candidates.map((candidate) =>
    stripComments(candidate.evidenceExcerpt).replace(/\s+/g, "").toLowerCase(),
  );
  const laneOfCandidate = candidates.map((candidate) => {
    const text = stripComments(candidate.evidenceExcerpt);
    const frontend = MARKERS.laneFrontend.test(text);
    const backend = MARKERS.laneBackend.test(text);
    if (frontend && !backend) return "frontend" as const;
    if (backend && !frontend) return "backend" as const;
    return null;
  });

  const links: SpecOverlapLink[] = [];
  const crossLane: SpecCrossLaneRow[] = [];
  const duplicateOf = new Map<string, { canonical: string; similarity: number }>();

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (a === undefined || b === undefined) continue;
      if (a.candidateKind !== b.candidateKind) continue;
      const similarity =
        compactTexts[i] === compactTexts[j]
          ? 1
          : round4(jaccard(tokenSets[i] as ReadonlySet<string>, tokenSets[j] as ReadonlySet<string>));
      if (similarity < OVERLAP_SIMILARITY_THRESHOLD) continue;
      const relation: "duplicate" | "overlap" =
        similarity >= DUPLICATE_SIMILARITY_THRESHOLD ? "duplicate" : "overlap";
      const laneA = laneOfCandidate[i] ?? null;
      const laneB = laneOfCandidate[j] ?? null;
      const isCrossLane = laneA !== null && laneB !== null && laneA !== laneB;
      links.push({
        a: a.id,
        b: b.id,
        similarity,
        relation,
        crossLane: isCrossLane,
      });
      if (relation === "duplicate" && !duplicateOf.has(b.id)) {
        duplicateOf.set(b.id, { canonical: a.id, similarity });
      }
      if (isCrossLane) {
        crossLane.push({
          a: a.id,
          b: b.id,
          similarity,
          laneA: laneA as "frontend" | "backend",
          laneB: laneB as "frontend" | "backend",
          note: "§92.4「Frontend 与 Backend 不再分别复制同义协议」候选——呈现清单，不自动合并；§93.3 pipeline 中 Human Review 位于 Analyzer 之后，裁决归 Human Review",
        });
      }
    }
  }
  links.sort((x, y) => (x.a === y.a ? (x.b < y.b ? -1 : x.b > y.b ? 1 : 0) : x.a < y.a ? -1 : 1));
  crossLane.sort((x, y) => (x.a === y.a ? (x.b < y.b ? -1 : x.b > y.b ? 1 : 0) : x.a < y.a ? -1 : 1));
  return { links, crossLane, duplicateOf };
}

// ============================================================
// §93.6 前置检查（analyze 版检查器：独立重算命中项，C5 对账精神）
// ============================================================

function runPrechecks(
  candidates: readonly SpecCandidate[],
  links: readonly SpecOverlapLink[],
  crossLane: readonly SpecCrossLaneRow[],
): SpecPreCheckRow[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const tokenById = new Map<string, ReadonlySet<string>>(
    candidates.map((candidate) => [
      candidate.id,
      new Set(specSimilarityTokens(stripComments(candidate.evidenceExcerpt))),
    ]),
  );

  // 1. semantic duplicate：文本级重复链（relation=duplicate）。
  const duplicateHits: SpecPreCheckHit[] = links
    .filter((link) => link.relation === "duplicate")
    .map((link) => {
      const a = byId.get(link.a);
      const b = byId.get(link.b);
      return {
        candidates: [link.a, link.b],
        detail: `文本级重复（相似度 ${link.similarity.toFixed(4)}）；a 分类=${a?.classification ?? PENDING_REVIEW_BUCKET} / b 分类=${b?.classification ?? PENDING_REVIEW_BUCKET}——§93.3 Duplicate Analysis 命中，处置归 Human Review`,
      };
    });

  // 2. frontend/backend overlap：跨 lane 重叠行。
  const crossLaneHits: SpecPreCheckHit[] = crossLane.map((row) => ({
    candidates: [row.a, row.b],
    detail: `跨 lane 重叠（${row.laneA} × ${row.laneB}，相似度 ${row.similarity.toFixed(4)}）——§92.4 去复制候选，不自动合并`,
  }));

  // 3. contradictory MUST：正反极性 + 同 subject 文本相似（机器近似：相似度 ≥ 阈值）。
  const contradictionHits: SpecPreCheckHit[] = [];
  const polarized = candidates.filter(
    (candidate) => candidate.policyPolarity !== null && candidate.classification !== null,
  );
  for (let i = 0; i < polarized.length; i += 1) {
    for (let j = i + 1; j < polarized.length; j += 1) {
      const a = polarized[i];
      const b = polarized[j];
      if (a === undefined || b === undefined) continue;
      if (a.policyPolarity === b.policyPolarity) continue;
      const tokensA = tokenById.get(a.id);
      const tokensB = tokenById.get(b.id);
      if (tokensA === undefined || tokensB === undefined) continue;
      const similarity = round4(jaccard(tokensA, tokensB));
      if (similarity < CONTRADICTION_SIMILARITY_THRESHOLD) continue;
      contradictionHits.push({
        candidates: [a.id, b.id],
        detail: `疑似矛盾 MUST（${a.policyPolarity} × ${b.policyPolarity}，文本相似度 ${similarity.toFixed(4)} 作同 subject 近似）——§93.6 contradictory MUST 检查命中，裁决归 Human Review`,
      });
    }
  }

  // 4. SHOULD 被升级为 hard：SHOULD 词形候选内含 hard 规范词形（独立重算，与分类互证）。
  const shouldUpgradeHits: SpecPreCheckHit[] = candidates
    .filter(
      (candidate) =>
        candidate.candidateKind === "Policy or Knowledge Candidate" &&
        MARKERS.hardNormative.test(stripComments(candidate.evidenceExcerpt)),
    )
    .map((candidate) => ({
      candidates: [candidate.id],
      detail:
        "SHOULD 候选正文含 hard 规范词形（MUST/必须/不得/禁止）——§93.6「SHOULD 被错误升级为 hard」命中；§93.4「不得因为旧文件名带 hard-spec 就默认升级为 MUST」同款纪律",
    }));

  // 5. project choice 误入 global：有 splitHint 且分类落在 global catalog 侧。
  const globalSet: ReadonlySet<string> = new Set([
    "UNIVERSAL_POLICY",
    "LANE_POLICY",
    "CONTRACT_TEMPLATE",
  ]);
  const projectChoiceHits: SpecPreCheckHit[] = candidates
    .filter(
      (candidate) =>
        candidate.splitHint === PROJECT_STATE_HINT &&
        candidate.classification !== null &&
        globalSet.has(candidate.classification),
    )
    .map((candidate) => ({
      candidates: [candidate.id],
      detail: `project choice 语句（「${(candidate.splitEvidence ?? "").replace(/\n/g, " / ")}」）与 global 分类（${String(candidate.classification)}）并存——§93.6「project choice 被错误放进 global catalog」命中，§93.5 分离须人工确认`,
    }));

  // 6. example 被误识别为 project truth：Pattern 候选含 project choice 语句。
  const exampleTruthHits: SpecPreCheckHit[] = candidates
    .filter(
      (candidate) =>
        candidate.candidateKind === "Pattern Candidate" &&
        candidate.splitHint === PROJECT_STATE_HINT,
    )
    .map((candidate) => ({
      candidates: [candidate.id],
      detail: `Example 候选含 project choice 语句（「${(candidate.splitEvidence ?? "").replace(/\n/g, " / ")}」）——§93.6「example 被错误识别为 project truth」命中`,
    }));

  const hitsByCheck: Readonly<Record<PreCheckId, readonly SpecPreCheckHit[]>> = {
    semantic_duplicate: duplicateHits,
    frontend_backend_overlap: crossLaneHits,
    contradictory_must: contradictionHits,
    should_upgraded_to_hard: shouldUpgradeHits,
    project_choice_in_global: projectChoiceHits,
    example_as_project_truth: exampleTruthHits,
  };
  return PRECHECK_IDS.map((check) => ({
    check,
    prd: PRECHECK_PRD[check],
    hitCount: (hitsByCheck[check] ?? []).length,
    hits: hitsByCheck[check] ?? [],
  }));
}

// ============================================================
// 主入口（analyze-only：零写 IO，只读目录/内容）
// ============================================================

const REPORT_NOTES: readonly string[] = [
  "analyze-only 封条（PRD §96 第 8 步「Trellis Spec Analyzer（只分析，不 Apply）」）：本报告是只读分析产物——不写 catalog/、不写项目 .pomaster/state/；结构上无 Apply 通路（导出面无写入函数、TransactionOp 无 Analyzer op、全树字节快照零落盘由对照测试钉住）",
  "§93.6 四词形 --analyze/--propose/--diff/--apply 中 --propose/--diff/--apply 显式 deferred（呈现层提示归后续批次，不私接、不静默）；Apply 前置检查九项中其余三项（source / provenance、old ID → new ID mapping、catalog lock reproducibility）同为 Apply 时态，见 precheckDeferred",
  "迁移纪律（PRD §96 第 11 步 L6178 原文词形）：不应以「一次迁完所有 Frontend/Backend Hard Spec」作为完成条件——Migration 应采用 Tracer Bullet：先挑 3~5 个代表主题打通全链路（验证 Catalog → Project State → Context Projection → Gate → Human View 完整路径），再扩大迁移；本分类清单是 Human Review 输入，不是一次迁完的施工令",
  "PENDING_REVIEW 是本报告的呈现桶（低置信候选诚实呈现，不硬分类），不是 §93.4 十二分类词表新值（PENDING_REVIEW ∉ CATALOG_CLASSIFICATION_VALUES）",
  "分类判据只用正文语义证据计分：文件名词形不进入分类特征集（§93.4「不得因为旧文件名带 hard-spec 就默认升级为 MUST」的机器判据；lane 判定同样只看正文 lane 词形）",
  "Duplicate/Overlap 机器判据是文本级相似（latin 词形 token + CJK 字符 bigram 机械特征，非分词、无词典）；语义级重复（paraphrase）机器不硬判 DUPLICATE——呈现为 overlap/跨 lane 重叠清单交 Human Review（§93.3 pipeline 中 Human Review 位于 Analyzer 之后）",
  "候选 id（SA-nnnn）是本报告局部通路编号词形（GRN-/CLM- 同族先例），非 governed 前缀，不入 id_namespace 闭包；同输入重放报告字节稳定（零墙钟，A4）",
];

function pad4(value: number): string {
  return String(value).padStart(4, "0");
}

/** 收集目录内全部 .md 文件（递归；posix 相对路径字典序；其余文件计数跳过）。 */
function walkMarkdownFiles(rootDir: string): {
  readonly markdown: readonly string[];
  readonly skipped: number;
} {
  const markdown: string[] = [];
  let skipped = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        markdown.push(relative(rootDir, full).split(sep).join("/"));
        continue;
      }
      skipped += 1;
    }
  };
  walk(rootDir);
  markdown.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return { markdown, skipped };
}

/**
 * 纯分析入口（零 IO）：输入文件内容集，输出完整报告。空输入显式报错——
 * 「空目录=显式错误非空清单」（分母 fail-closed）。
 */
export function analyzeSpecFiles(
  files: readonly SpecFileInput[],
  source?: SpecAnalysisSource,
): SpecAnalysisReport {
  if (files.length === 0) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "spec 输入为空（零个 Markdown 文件）",
      "确认 spec 目录路径或提供至少一个 .md 文件；空目录是显式错误而非空清单（分母 fail-closed，禁静默返回空报告）",
      { fileCount: 0 },
    );
  }

  const sorted = [...files].sort((x, y) =>
    x.relativePath < y.relativePath ? -1 : x.relativePath > y.relativePath ? 1 : 0,
  );

  // 逐文件：frontmatter + Section Parser + 候选提取。
  let seq = 0;
  const nextId = (): string => `SA-${pad4(++seq)}`;
  const fileRows: SpecAnalysisFileRow[] = [];
  let sectionsParsed = 0;
  const extracted: ExtractedCandidate[] = [];

  for (const file of sorted) {
    const normalized = file.text.replace(/\r\n/g, "\n");
    const parsed = parseFrontmatter(normalized);
    const parsedSections = parseSpecMarkdown(file.relativePath, normalized);
    sectionsParsed += parsedSections.length;
    const before = extracted.length;
    for (const section of parsedSections) {
      extracted.push(...extractFromSection(section, nextId));
    }
    fileRows.push({
      path: file.relativePath,
      bytes: Buffer.byteLength(file.text, "utf8"),
      sha256: sha256OfUtf8(file.text),
      frontmatterId: parsed.id,
      sectionCount: parsedSections.length,
      candidateCount: extracted.length - before,
    });
  }

  // §93.4 DUPLICATE 叠加（文本级重复：后位候选改判 DUPLICATE，先位为 canonical）。
  const overlap = runOverlapPass(extracted);
  const candidates: SpecCandidate[] = extracted.map((candidate) => {
    const duplicate = overlap.duplicateOf.get(candidate.id);
    if (
      duplicate === undefined ||
      candidate.classification === null ||
      candidate.classification === "DEPRECATED" ||
      candidate.classification === "REJECTED" ||
      candidate.classification === "DUPLICATE"
    ) {
      return candidate;
    }
    return {
      ...candidate,
      classification: "DUPLICATE",
      classificationConfidence: "high",
      classificationBasis: `正文语义证据计分（§93.4）：与 ${duplicate.canonical} 文本级重复（相似度 ${duplicate.similarity.toFixed(4)}）→ DUPLICATE；§92.4「Frontend 与 Backend 不再分别复制同义协议」的机器检出位`,
      pendingReason: null,
    };
  });

  const precheck = runPrechecks(candidates, overlap.links, overlap.crossLane);

  // §92.5 Policy Activation 候选清单（哪些分类结果具备激活形态）。
  const activationCandidates: SpecActivationRow[] = candidates
    .filter(
      (candidate): candidate is SpecCandidate & { classification: CatalogClassificationValue } =>
        candidate.classification !== null &&
        ACTIVATION_BEARING_CLASSIFICATIONS.includes(candidate.classification),
    )
    .map((candidate) => ({
      candidateId: candidate.id,
      classification: candidate.classification,
      authorityEnforcement: ROW_BY_KIND[candidate.candidateKind].authorityEnforcement,
      note: "§92.5 激活公式承载位（Catalog Lock + Active Project Profiles + Project Baseline + Change Localization + Risk/Governance Profile + Applicability Conditions + Overrides）；TECHNOLOGY_PROFILE 是激活输入非被激活规则本体（见 ACTIVATION_BEARING_CLASSIFICATIONS 注记）",
    }));

  // §92.6 Hard Spec 名称退场清单（DEPRECATED/DUPLICATE/REJECTED 的旧名称应退场）。
  const nameExitList: SpecNameExitEntry[] = candidates
    .filter(
      (candidate): candidate is SpecCandidate & { classification: CatalogClassificationValue } =>
        candidate.classification === "DEPRECATED" ||
        candidate.classification === "DUPLICATE" ||
        candidate.classification === "REJECTED",
    )
    .map((candidate) => ({
      candidateId: candidate.id,
      legacyName: `${candidate.source.file} > ${candidate.source.headingPath.join(" > ")}`,
      classification: candidate.classification,
      prd: "§92.6",
    }));

  const pendingReview = candidates
    .filter((candidate) => candidate.classification === null)
    .map((candidate) => candidate.id);
  const classifiedCount = candidates.filter((candidate) => candidate.classification !== null).length;

  return {
    reportSchema: SPEC_ANALYZER_REPORT_DIALECT,
    specDir: source?.specDir ?? null,
    denominator: {
      specDir: source?.specDir ?? null,
      scannedFileCount: sorted.length,
      files: fileRows,
      nonMarkdownSkipped: source?.nonMarkdownSkipped ?? 0,
      sectionsParsed,
      candidateCount: candidates.length,
      classifiedCount,
      unclassifiedCount: candidates.length - classifiedCount,
    },
    candidates,
    pendingReview,
    overlapLinks: overlap.links,
    crossLaneConsolidation: overlap.crossLane,
    precheck,
    precheckDeferred: {
      prd: "§93.6",
      applyTimeChecks: [
        "source / provenance",
        "old ID → new ID mapping",
        "catalog lock reproducibility",
      ],
      deferredForms: ["--propose", "--diff", "--apply"],
    },
    activationCandidates,
    nameExitList,
    notes: REPORT_NOTES,
  };
}

/**
 * 目录入口（只读 IO）：递归扫描 spec 目录内 .md 文件并走 analyzeSpecFiles。
 * 目录缺席 / 空目录（零 .md）→ NOT_CONFIGURED 显式错误（分母 fail-closed，禁静默空清单）。
 */
export function analyzeSpecDir(specDir: string): SpecAnalysisReport {
  if (!existsSync(specDir)) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      `spec 目录不存在: ${specDir}`,
      "确认 --spec-dir 路径；目录缺席是显式错误而非空清单（分母 fail-closed，禁静默返回空报告）",
      { specDir },
    );
  }
  const { markdown, skipped } = walkMarkdownFiles(specDir);
  if (markdown.length === 0) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      `spec 目录无 Markdown 文件: ${specDir}`,
      "确认目录是否为 spec 目录；空目录是显式错误而非空清单（分母 fail-closed，禁静默返回空报告）",
      { specDir, skippedNonMarkdown: skipped },
    );
  }
  const files: SpecFileInput[] = markdown.map((relativePath) => ({
    relativePath,
    text: readText(join(specDir, relativePath)) ?? "",
  }));
  return analyzeSpecFiles(files, { specDir, nonMarkdownSkipped: skipped });
}
