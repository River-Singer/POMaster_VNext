/**
 * @pomaster/kernel —— POMaster vNext 内核公共 API 契约。
 *
 * 【已实现（kernel 建造者落地）】本文件是公共契约面：全部类型/签名与 docs/kernel-api.md
 * 1:1 对应；函数实现按模块拆分（store/transitions/discovery-chain/id/permits/projection/
 * gate-result/doctor/errors），本文件以 re-export 保持签名逐字不变。改签名必须先改
 * docs/kernel-api.md 并同 commit 同步。
 *
 * 设计输入（改签名前必读）：
 * - packages/schemas/assets/vocab-lock.draft.yaml（FROZEN 词表；枚举唯一来源，
 *   代码镜像点 @pomaster/schemas/src/vocab.ts）
 * - packages/schemas/assets/01..10（形态契约）
 * - research/design-synthesis-decisions.md（裁定表 A1-A8/B/C/D）与 vnext-lifecycle-and-loop.md（八拍）
 *
 * 全局纪律锚（每个签名的设计前提，实现时不得违背）：
 * - D24 哈希伦理（x-digest-ethics: write_blocking=false / side=read_only_service /
 *   human_touch=forbidden / violation=WARN+auto-regen hint）：
 *   digest/sha 字段仅读侧服务（identity / 短路重跑 / 防篡改抽验），永不阻断写入；
 *   人类永不计算哈希——一切 body_sha256 / content_digest / inputs_fingerprint 由 store 事务自动维护。
 * - 门禁七态 + notApplicable 必填：passed/failed/warning/blocked/not_run/not_configured/
 *   skipped_blindspot（VERDICT_VALUES）——缺席必须显式表达，禁止静默跳过当通过（C1）。
 * - 幂等（A4）：受 digest 管辖字段禁墙钟时间；新鲜度用单调 seq/rev；
 *   同输入重放 = 零写入（字节稳定），由 inputs_fingerprint 相等短路。
 * - CLAIMED 纪律（C5）：会话/工具陈述一律 CLAIMED（Claimed<T>）；落库必经 applyTransaction
 *   store 事务；永不信任自报值，判卷以重算为准（asserted/recomputed 孪生）。
 */
import type {
  ActorTypeValue,
  ChangeValue,
  ConfidenceValue,
  DenominatorStatusValue,
  EvidenceValue,
  GovernedIdPrefix,
  LifecycleValue,
  LivenessStatusValue,
  OriginValue,
  ProducerKindValue,
  RunTriggerValue,
  SourceTypeValue,
  TruthBodyKind,
  VerdictValue,
  WritePolicyValue,
} from "@pomaster/schemas";

// ============================================================
// 基础标识
// ============================================================

declare const governedIdBrand: unique symbol;

/**
 * 受治理对象 canonical id（closed-world，A5）。
 * 文法：PREFIX . SEGMENT ( . SEGMENT )* [ . SEQ]；PREFIX ∈ GOVERNED_ID_PREFIXES（15 前缀）；
 * SEGMENT=[A-Z][A-Z0-9_]{0,31}（不允许数字开头）；SEQ 纯数字仅可为末段。
 * 未知前缀 = 解析即 FATAL（A5）。legacy 拼写（KB-*、GRID.*、PAGE-TASK-STEP-*、TASK-*、
 * CHANGE-*、ISSUE.*、FTA-*、FB-*）
 * 只入 alias 双向链，不得作为本类型值（A6）。
 */
export type GovernedId = string & { readonly [governedIdBrand]: "GovernedId" };

/** parseGovernedId 的结构化结果。 */
export interface ParsedGovernedId {
  readonly prefix: GovernedIdPrefix;
  /** SEGMENT 段序列（不含前缀与末段 SEQ）。 */
  readonly segments: readonly string[];
  /** 末段 SEQ（纯数字）；无 SEQ 时为 null。 */
  readonly seq: number | null;
}

/**
 * parseGovernedId 失败（A5：解析即 FATAL，无 WARNING 档）。
 * 实现住 src/errors.ts（与 GovernanceError 同源）；此处 re-export 保持契约面 1:1。
 */
export { GovernedIdParseError } from "./errors.js";

/**
 * GovernanceError 体系（kernel 其余 FATAL 分支的统一错误通道）。
 * 码位含 FATAL_UNKNOWN_PREFIX / NOT_CONFIGURED / EVOLUTION_REQUIRED / PERMIT_EXPIRED 等
 * 全集（见 errors.ts GovernanceErrorCode）；每条错误必带 hint 路标（escalation 纪律）。
 */
export { GovernanceError, governanceCodeForParseError } from "./errors.js";
export type { GovernanceErrorCode, GovernanceErrorDetails } from "./errors.js";

/** 行为主体（谁声称 / 谁重算）。x-vocab-source: 03/07 actor（structural）。 */
export interface Actor {
  readonly actorType: ActorTypeValue;
  readonly actor: string;
  /** true = 自报值；自报永不单独作为判卷依据（C5）。 */
  readonly selfAttested: boolean;
}

/**
 * CLAIMED 包装：会话/工具陈述的落点。陈述本身不是治理事实——
 * 落库必经 applyTransaction store 事务，判卷以重算为准（C5 / 跨线共识 1）。
 */
export interface Claimed<T> {
  readonly value: T;
  readonly claimedBy: Actor;
}

// ============================================================
// 状态轴与对象形态（镜像 01/02，字段名 camelCase；词值见 @pomaster/schemas）
// ============================================================

/** 四轴状态块（A2）。跨轴耦合断言（如 PROPOSED/REJECTED⇒evidence=PLANNED）归 Transition/REF_INTEGRITY。 */
export interface AxesBlock {
  readonly lifecycle: LifecycleValue;
  readonly confidence: ConfidenceValue;
  readonly evidence: EvidenceValue;
  readonly change: ChangeValue;
}

/** 轴状态补丁（transition_object op 用；只许词表内值）。 */
export type AxesPatch = Partial<AxesBlock>;

/** 分母引用（C2：钉 (id, version_seen) 二元组，防分母漂移）。 */
export interface DenominatorRefRow {
  readonly id: GovernedId;
  readonly versionSeen: number;
}

/** 绑定摘要（D15：binding 是期望声明不是豁免证书；not_configured=终局性诚实报告）。
 * 词形镜像 01-truth-index binding_summary.probe_status —— TODO(vocab-pr)：待收编。 */
export interface BindingSummary {
  readonly declared: number;
  readonly probeStatus: "all_verified" | "has_unverified" | "not_configured";
}

/** 证据摘要（C5：claim 全文住 evidence/claims/，对象身上只有计数）。 */
export interface EvidenceSummary {
  readonly claims: number;
  readonly verified: number;
  readonly unverified: number;
  readonly rejected: number;
}

/** 对象信封行（镜像 01-truth-index definitions.object_row；A1 一字段不多不少，正文在 body_ref）。 */
export interface ObjectRow {
  readonly id: GovernedId;
  readonly kind: TruthBodyKind;
  readonly axes: AxesBlock;
  readonly titleZh: string;
  /** 必须能在 authority.json 解析；解析失败=FATAL 而非 WARNING（幽灵 owner 教训）。 */
  readonly authorityOwner: string;
  readonly origin: OriginValue;
  /** origin=derived 时必填（C3 死 factsource 免疫）；pattern prod.[a-z][a-z0-9_]{1,63}。 */
  readonly producerId?: string;
  /** 单调修订序号（A4：取代一切墙钟时间戳，DEF-POM-002 教训）；由 applyTransaction 分配。 */
  readonly rev: number;
  /** truth/objects/<kind-slug>/<normalized-local-name>.json（机械映射，禁止语义化改名）。 */
  readonly bodyRef: string;
  /** 正文内容摘要——D24：事务自动维护，只读服务，永不阻断写入，人不可计算/传递。 */
  readonly bodySha256?: string;
  readonly denominatorRefs: readonly DenominatorRefRow[];
  readonly bindingSummary: BindingSummary;
  readonly evidenceSummary: EvidenceSummary;
  /** change=MIGRATING 必须非空（跨轴断言，归 Transition/REF_INTEGRITY）。 */
  readonly permitsActive: readonly string[];
}

/** producer 活性快照（判定结果，非心跳原文；心跳原文住 runtime/producers/heartbeat.jsonl，不进 hash）。 */
export interface LivenessSnapshot {
  readonly status: LivenessStatusValue;
  readonly runsSinceLastOutput: number;
  readonly lastOutputSeq: number;
}

/** producer 注册与活性（镜像 06-producer producer_record）。 */
export interface ProducerRecord {
  /** prod.[a-z][a-z0-9_]{1,63}（单一事实源 06）。 */
  readonly producerId: string;
  readonly kind: ProducerKindValue;
  /** package:// 相对引用（x-path-ethics：绝对盘符路径结构性禁止）。 */
  readonly entrypoint: string;
  /** 自报孪生：kernel 重算 objects[] 实际计数，不一致=一级对账信号（C5）。 */
  readonly objectsClaimed: number;
  readonly viewsMaintained: readonly string[];
  readonly liveness: LivenessSnapshot;
}

/** 分母条目（镜像 05-denominator denominator_entry；一等公民，只许 supersede 不许删除）。 */
export interface DenominatorEntry {
  readonly id: GovernedId;
  /** 同 id 每次成员口径变化 version+1，只增不减、旧 version 不复用。 */
  readonly version: number;
  readonly membersCount: number;
  /** 成员选择器（机械派生；手抄成员清单无位置——防分母漂移）。 */
  readonly memberSelector: {
    readonly viaBindingTable?: string;
    readonly filter?: Readonly<Record<string, string | number | boolean>>;
  };
  readonly successorOf: readonly GovernedId[];
  readonly authority: { readonly owner: string };
  /** kind 级收窄子集（DENOMINATOR_STATUS_VALUES；SUPERSEDED ⇒ successorRef 必填）。 */
  readonly status: DenominatorStatusValue;
  readonly successorRef?: GovernedId;
}

/** 健康快照（R8 式滚动汇总；不参与 content_digest，判定确定性可重放）。 */
export interface HealthBlock {
  readonly deadProducers: readonly string[];
  readonly orphanedObjects: readonly GovernedId[];
  readonly worstBlindspot:
    | { readonly gate: string; readonly escapeRatio: number }
    | null;
  readonly aliasConflicts: readonly {
    readonly normalizedKey: string;
    readonly conflictingIds: readonly string[];
  }[];
}

/** truth-index 信封（镜像 01-truth-index 顶层；A8：gate_results/claims 被顶层结构封死不入索引）。 */
export interface TruthIndex {
  readonly irSchema: "pomaster.truth-index/v1-draft";
  /** 信封内容摘要——D24：只读服务（identity/防篡改抽验），非身份判卷输入，事务自动维护。 */
  readonly contentDigest: string;
  readonly generation: {
    /** tool@semver（如 pomaster-kernel@0.1.0）。 */
    readonly tool: string;
    /** 全局单调事件序号（A4）。 */
    readonly seq: number;
    /** 源输入集指纹——重跑无变化时短路依据（D24：事务自动维护）。 */
    readonly inputsFingerprint: string;
  };
  /** 词表指纹三元组：与 vocab-lock@v0.2-resolved 内容摘要对账，不一致即 FATAL（枚举多头拷贝免疫）。 */
  readonly vocabLock: {
    readonly stateAxes: string;
    readonly kinds: string;
    readonly prefixes: string;
  };
  readonly denominators: readonly DenominatorEntry[];
  readonly objects: readonly ObjectRow[];
  readonly producers: readonly ProducerRecord[];
  readonly health: HealthBlock;
  /** REF_INTEGRITY@vN（PRD §50 十三项检查所执行规则集的版本锚）。 */
  readonly integrityRuleset: string;
}

// ============================================================
// Store 与事务
// ============================================================

export interface CreateStoreOptions {
  /** 打开已存在 store 时是否执行 schema 校验与 vocab 指纹对账（默认 true）。 */
  readonly validateOnOpen?: boolean;
}

/**
 * Store 句柄。约定路径布局：<rootDir>/.pomaster/
 * - state/truth-index.json（信封层，01）
 * - truth/objects/<kind-slug>/*.json（正文层，02；一对象一文件，A1）
 * - evidence/{runs,claims,blobs}/（运行产物平面，A8；blobs 内容寻址）
 * - runtime/producers/heartbeat.jsonl（心跳侧车，不进 hash）
 * - runtime/sessions|locks + executions/（P20 D 线地基：会话/锁/执行身份，§13）
 * kernel 内部补充状态（实现 detail）：state/authority.json、state/permits.json、
 * state/journal.jsonl（事件 journal，不进 hash）。
 */
export interface Store {
  readonly rootDir: string;
  /** 已装载 truth-index 的 generation.seq；尚未装载为 null。 */
  readonly currentSeq: number | null;
}

/**
 * 打开（或幂等初始化）store。No-op is elegant：重复 open/init 零变化（字节稳定）。
 * 初始化仅写骨架文件，不产生任何治理事实变更。
 */
export { createStore } from "./store.js";

/**
 * 装载并校验 truth-index：01 schema 校验 + vocab_lock 三指纹对账（不一致=FATAL，
 * 属 D24 read_only_service 的 identity 抽验，非写阻断）+ REF_INTEGRITY 基础项。
 */
export { loadTruthIndex } from "./store.js";

// —— 事务操作集（op 判别联合） ——

/** 02 对象正文信封（写入输入形态；rev/bodySha256 不由人给——事务分配/维护，D24+A4）。 */
export interface ObjectEnvelopeInput {
  readonly id: GovernedId;
  readonly kind: TruthBodyKind;
  /** 轴收窄 profile 名（如 capability_default；本体是 SYS 词表对象）。 */
  readonly axisProfile: string;
  readonly axes: AxesBlock;
  readonly titleZh: string;
  readonly authority: {
    readonly owner: string;
    readonly delegates: readonly {
      readonly role: string;
      readonly requiredFor?: readonly string[];
    }[];
    readonly writePolicy?: WritePolicyValue;
    readonly escalationHint?: string;
  };
  readonly origin: OriginValue;
  /** origin=derived 时必填且不得为 null（C3；02 信封条件式 1）。 */
  readonly producer?: {
    readonly producerId: string;
    readonly viewsMaintained: readonly string[];
  } | null;
  /** kind 特有正文自由区（形状契约见 assets/02b-kind-payloads.md）。 */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly aliases?: readonly string[];
  readonly supersedes?:
    | { readonly id: GovernedId; readonly reasonShort: string }
    | null;
  /** lifecycle=SUPERSEDED 时必填（vocab-lock transitions）。 */
  readonly successorRef?: GovernedId;
  readonly denominatorRefs?: readonly DenominatorRefRow[];
  readonly permitsActive?: readonly string[];
  readonly sources?: readonly {
    readonly type: SourceTypeValue;
    /** package:// 或仓内相对路径；禁开发机绝对盘符路径。 */
    readonly ref: string;
    readonly capturedBy: string;
    readonly pin?:
      | { readonly baseline: string }
      | { readonly version: string }
      | { readonly digest: string };
    readonly locator?: Readonly<Record<string, unknown>>;
  }[];
  /** 人类散文唯一合法入口；机器不得解析其内容做判卷（P9 教训）。 */
  readonly notesMd?: string | null;
}

/** evidence/claims/CLM-* 写入输入。assertedBy 是 CLAIMED——kernel 不判其真，只登记。 */
export interface ClaimRecordInput {
  readonly clm: string; // CLM-[0-9]+
  readonly subjectId: GovernedId;
  readonly assertion: string;
  readonly assertedBy: Actor;
  /** blob / GRN-* / 治理对象 引用。允许先立后证：空数组合法，但 verification 不得为 VERIFIED。 */
  readonly evidenceRefs: readonly string[];
  /**
   * 执行身份透传（P20 §25.4；可选——缺席 = 记录无 execution_id 键，存量字节兼容；
   * 携带即 kernel 侧强制校验：AGX 词形 + executions/ 档案存在性）。
   */
  readonly executionId?: string;
  readonly notesMd?: string | null;
}

/** evidence/runs/GRN-* 写入输入（run 信封 + 已归一 GateResult；A8：不入 truth-index）。 */
export interface GateRunRecordInput {
  readonly grn: string; // GRN-[0-9]+
  readonly result: GateResult;
  readonly trigger: RunTriggerValue;
  /** 执行身份透传（P20 §25.4；可选——校验语义同 ClaimRecordInput.executionId）。 */
  readonly executionId?: string;
}

export type TransactionOp =
  | { readonly op: "upsert_object"; readonly envelope: ObjectEnvelopeInput }
  | {
      readonly op: "transition_object";
      readonly id: GovernedId;
      readonly patch: AxesPatch;
      readonly reasonShort: string;
    }
  | { readonly op: "register_producer"; readonly record: ProducerRecord }
  | {
      /** 追加 runtime/producers/heartbeat.jsonl 侧车（不进 hash，A4/C5）。 */
      readonly op: "heartbeat";
      readonly producerId: string;
      readonly wroteObjectIds: readonly GovernedId[];
    }
  | { readonly op: "append_denominator"; readonly entry: DenominatorEntry }
  | { readonly op: "record_claim"; readonly claim: ClaimRecordInput }
  | { readonly op: "record_gate_run"; readonly run: GateRunRecordInput };

export interface Transaction {
  readonly ops: readonly TransactionOp[];
  /** 审批/决策引用（DECISION.* / CHANGE.* / PERMIT.*，general_id 宽松词形）。 */
  readonly authorityRef?: string;
  readonly note?: string;
}

export interface TransactionResult {
  /** 本事务分配的全局事件序号；幂等重放短路时 = 原 seq 不变。 */
  readonly appliedSeq: number;
  /** inputs_fingerprint 相等 → 零写入短路（幂等；字节稳定，rev 不空转递增）。 */
  readonly shortCircuited: boolean;
  readonly changedObjectIds: readonly GovernedId[];
  /** D24 WARN 通道：digest 失配/手改等处置=WARN + auto-regen hint，永不阻断（violation_treatment）。 */
  readonly digestWarnings: readonly string[];
}

/**
 * 唯一写入路径（一切落库必经 store 事务，CLAIMED 纪律）。
 * 事务内自动维护：seq/rev 分配（A4 单调，禁墙钟）、body_sha256/content_digest 重算（D24）；
 * 同 inputs 重放 → 零写入短路；DENOMINATOR 删除请求 → FATAL 并引导 supersede（只许 supersede 不许删除）。
 */
export { applyTransaction } from "./store.js";

// ============================================================
// 转移引擎
// ============================================================

/** 迁移前置条件词形（x-vocab-source: vocab-lock state_axes.lifecycle.transitions.requires）。 */
export type TransitionRequirement = "authority_approval" | "transition_record";

export type TransitionOutcome =
  | {
      readonly allowed: true;
      readonly requires: readonly TransitionRequirement[];
      /** DEPRECATED→RETIRED 附加宽限期策略（vocab-lock grace_policy: config）→ true。 */
      readonly gracePolicyConfig: boolean;
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
 * 状态轴转移校验（纯函数）。vocab-lock v0.1 仅有 lifecycle 轴转移矩阵（LIFECYCLE_TRANSITIONS），
 * 其余轴（confidence/evidence/change）无矩阵——扩轴走词汇表 PR 后再扩本签名 → TODO(vocab-pr)。
 * 跨轴耦合断言（lifecycle∈{PROPOSED,REJECTED}⇒evidence=PLANNED、evidence=VERIFIED⇒realization=wired、
 * change=MIGRATING 必持 ACTIVE PERMIT、LOCKED+STABLE→CHALLENGED 必持 DECISION/CHANGE 引用）
 * 归 applyTransaction/REF_INTEGRITY，不在本纯函数内。
 */
export { validateTransition } from "./transitions.js";

// ============================================================
// Discovery 状态链（P18 · PRD §80.3 Ephemeral Discovery）
// ============================================================

/**
 * Discovery 状态链转移校验（纯函数）。
 * 状态链（PRD §80.3 原文词形）：IDEA → DISCOVERY → READY_TO_PROMOTE → CHANGE/TASK；
 * 拓扑唯一来源 DISCOVERY_CHAIN_TRANSITIONS（@pomaster/schemas，镜像 08-discovery-state-chain
 * x-pomaster-transition-matrix）。Discovery 状态链是新状态面（Discovery 讨论生命周期），
 * 与 state_axes.lifecycle 正交、值域不相交；词轴待词汇表 PR 收编（TODO(vocab-pr)）。
 * 非法迁移（跳步/倒退/自环/词表外值）不 throw——返回 allowed:false 显式拒绝（fail-closed）；
 * 提升边（READY_TO_PROMOTE→CHANGE/TASK）requires ["promotion_basis"]（§80.3 四条晋升条件
 * 任一满足），且提升写入必须走 P11 maintain 面（受控写入唯一面，Discovery 层不私造第二
 * 写入通道）——本原语只判定，不落盘、不写入。
 */
export { validateDiscoveryTransition } from "./discovery-chain.js";
export type {
  DiscoveryChainRequirement,
  DiscoveryChainOutcome,
} from "./discovery-chain.js";

// ============================================================
// Question Gate / One-question-at-a-time / Diverge→Converge（P18 · PRD §80.4/80.5/80.7）
// ============================================================

/**
 * Question Gate Q1-Q7 判卷（纯函数，§80.4）：Brainstorm 提问前依次检查七关（不跳关），
 * 只有最后仍为「需要人类裁决」且申报分类 ∈ ASKABLE（BLOCKING_AUTHORITY/PREFERENCE）
 * 才 ASK_HUMAN；Q1-Q5 命中 → DERIVABLE、Q6 → RESEARCHABLE（Research-first §80.6）、
 * Q7 不阻塞 → DEFERABLE；七关全过但分类非可问类 → ASK_REJECTED（矛盾显式拒绝）。
 * declaredConsistent 是申报分类与七关重算的对账信号——判卷以七关重算为准（C5）。
 */
export { evaluateQuestionGate } from "./question-gate.js";
export type {
  QuestionGateCategory,
  AskableCategory,
  QuestionGateId,
  QuestionGateAnswerable,
  QuestionGateInput,
  QuestionVerdict,
  QuestionGateOutcome,
} from "./question-gate.js";
export {
  QUESTION_GATE_CATEGORIES,
  ASKABLE_CATEGORIES,
  QUESTION_GATES,
  QUESTION_PRIORITY_DESCRIPTIONS,
  CONVERGENCE_ZONE_KEYS,
} from "./question-gate.js";
export type {
  QuestionPriority,
  PrioritizedQuestion,
  OneQuestionOutcome,
  ConvergenceZoneKey,
  ConvergencePartition,
  ConvergenceOutcome,
} from "./question-gate.js";
/**
 * One-question-at-a-time 选择器（纯函数，§80.5）：一次只返回价值最高的一个问题
 * （priority 1-5 机械序号，同优先级稳定排序，零墙钟）；队列混入未过闸问题显式拒绝。
 * Diverge→Converge 分区判卷（纯函数，§80.7）：三区显式存在（缺席 fail）+ 分区互斥
 * （跨区重复 = future 偷渡当前范围的违例形态，逐条列出）。
 */
export { selectNextQuestion, evaluateConvergencePartition } from "./question-gate.js";

// ============================================================
// Research Read-only Contract / 五级 Evidence / Blueprint Envelope（P18 · PRD §81.3/81.4/82.5）
// ============================================================

/**
 * Research 写面契约判卷（纯函数，§81.3）：申报路径必须落在 <host>/research/** 内；
 * 受治理面（state/truth/objects/policies/evidence——Current Truth 与证据平面）文件
 * 直写一律 fatal:governed_surface（Evidence Pack 合法入账走 record 通路）；盘符/绝对/
 * .. 逃逸 fatal:path_not_portable；越出 research/ 面 fatal:outside_research_dir——
 * 越写即 FATAL（wave3-plan P18 出口判据），CLI 层据此 exit 1。
 */
export { checkResearchWriteContract } from "./research-contract.js";
export type { ResearchWriteContractOutcome } from "./research-contract.js";
export { RESEARCH_ARTIFACT_FILES, RESEARCH_FORBIDDEN_SURFACE_PREFIXES } from "./research-contract.js";
export type { ResearchArtifactFile } from "./research-contract.js";
/**
 * 五级 Evidence 判卷语义（纯函数，§81.4/§81.5）：词形独立重算（五级/三级/三值词表外
 * violation）；CONFLICTS → escalation（发现不是裁决，上报正式治理面）；IMPLEMENTATION
 * +SUPPORTS 未记录对账 → 降信 warning（§81.5 Existence ≠ Correctness ≠ Authority）。
 */
export { adjudicateResearchFindings } from "./research-contract.js";
export type {
  ResearchFindingInput,
  ResearchFindingViolationCode,
  ResearchFindingSignalCode,
  ResearchFindingAdjudication,
  FindingsAdjudicationReport,
} from "./research-contract.js";
/**
 * Blueprint Acceptance Envelope 判卷（纯函数，§82.5）：HARD_BLOCKER>0 ⇒ 不得
 * ACCEPTED/CONDITIONALLY_ACCEPTED（09 allOf 同源重算）；CONDITIONALLY_ACCEPTED 七条
 * 前提 a/b/c/d/f 机器判 PASS/FAIL，e/g 显式 NOT_MACHINE_CHECKABLE 不冒充已查（C1）；
 * msd_reached 与三轴派生不一致整体 fail（09 allOf 双向强制）。
 */
export { evaluateBlueprintEnvelope } from "./research-contract.js";
export type {
  BlueprintEnvelopeInput,
  EnvelopeCheckStatus,
  EnvelopeRequirementId,
  BlueprintEnvelopeAdjudication,
} from "./research-contract.js";

// ============================================================
// ID 解析与别名收编（A5 / A6）
// ============================================================

/**
 * 解析 canonical governed id（closed-world，A5）。未登记前缀/文法违规 →
 * throw GovernedIdParseError（FATAL，无 WARNING 档）。纯函数。
 */
export { parseGovernedId } from "./id.js";

export interface AliasResolution {
  readonly input: string;
  /** legacy→canonical 收编结果；输入已是 canonical 或无法收编时 = null 之外的 canonical 自身。 */
  readonly canonical: string | null;
  /** canonical→全部 legacy 历史形态（双向链考古方向）。 */
  readonly legacyForms: readonly string[];
  /** 命中的 aliases_v0 规则 legacy 词形（如 "TASK-*"）；未命中为 null。 */
  readonly matchedRuleLegacy: string | null;
  readonly note: string | null;
}

/**
 * 别名双向链解析（A6 rename-on-ingest）。镜像 ALIASES_V0 八族（PR-0001 收编
 * ISSUE.* / FTA-* / FB-* 三族，机械映射=greedy 打包 pack_segments 移植）；
 * 数字段收编加字母前缀规则内置：TASK-0087→TASK.T0087、CHANGE-0104→CHANGE.C0104
 * （SEGMENT 不允许数字开头，02b 文法注记）；PAGE-TASK-STEP-* 走 token 重排收编；
 * ISSUE.* 登记前缀点段剥离+末尾纯数字段→SEQ；FTA-* / FB-* 标记词并入首段。
 * 纯函数。canonical 化结果仍须过 parseGovernedId 验证（本函数不替代 closed-world 校验）。
 */
export { resolveAlias } from "./id.js";

// ============================================================
// Permit（Transition/写授权；八拍②五件套之 Permit 范围）
// ============================================================

export interface PermitRequest {
  /** 允许写的对象集（Permit 范围；scope expansion 拒绝静默放行→路由重审升级，D20）。 */
  readonly subjectIds: readonly GovernedId[];
  readonly requestedBy: Actor;
  /** CHANGE.* / TASK.* 引用（general_id 宽松词形）。 */
  readonly changeRef?: string;
  /** TTL 按事件拍（rebuild 轮/事务序）计，禁墙钟（A4/D2）。 */
  readonly ttlBeats?: number;
  /** 验收形状（八拍②五件套；§47 DoD 硬绑 VERIFIED claim 映射）。 */
  readonly acceptanceShape?: Readonly<Record<string, unknown>>;
  /**
   * Capability 清单（八拍②五件套之二；过 parseGovernedId closed-world 校验）。
   * 与 acceptanceShape 同批落 state/permits.json 台账（capability_refs /
   * acceptance_shape / baseline——内部状态文件扩展，不动本公共契约类型 Permit）。
   */
  readonly capabilityIds?: readonly GovernedId[];
}

export interface Permit {
  /** PERMIT.* 引用——状态面台账键词形，词形登记于 vocab-lock id_namespace.state_plane_refs
   * （PR-0001 文档化收编；非 governed 前缀，不入 prefixes_v0、不过 parseGovernedId，
   * 解析归台账存在性 + 显式四态 outcome；维持 general_id 宽松词形）。 */
  readonly permitRef: string;
  readonly expiresAtSeq: number;
  readonly scope: {
    readonly subjectIds: readonly GovernedId[];
    readonly writePolicy: WritePolicyValue;
  };
}

export interface WriteAttempt {
  readonly id: GovernedId;
  readonly op: "upsert_object" | "transition_object" | "delete";
}

/** 显式四态结果：缺席/过期/未知必须显式表达，禁止静默放行或静默拒绝。 */
export type PermitCheckResult =
  | { readonly outcome: "allowed" }
  | {
      readonly outcome: "denied";
      readonly reason:
        | "outside_scope"
        | "policy_forbidden"
        | "delete_forbidden_supersede_only";
      readonly hint: string;
    }
  | { readonly outcome: "expired"; readonly expiredAtSeq: number }
  | { readonly outcome: "unknown_permit" };

/** 签发许可（记入 store；D3 Adjudication Ledger 的事件流输入）。 */
export { issuePermit } from "./permits.js";

/**
 * 校验写尝试是否在许可范围内。delete 对 DENOMINATOR 一律 denied
 * （delete_forbidden_supersede_only，C2/GAP-POM-001 免疫）。
 */
export { checkPermit } from "./permits.js";

export type StealResult =
  | { readonly outcome: "stolen"; readonly eventSeq: number }
  | {
      readonly outcome: "rejected_not_expired";
      readonly expiresAtSeq: number;
      readonly currentSeq: number;
    };

/**
 * 手动显式接管过期许可（D2：TTL 过期仅允许手动 --steal；自动抢占被禁止——
 * 自动抢占掩盖协调问题）。接管必须记事件（eventSeq 落 journal）。
 * 未过期 → rejected_not_expired（显式拒绝，不静默）。
 */
export { stealPermit } from "./permits.js";

// ============================================================
// 投影（八拍③ PROJECTION：最小充分上下文）
// ============================================================

export interface ProjectionRequest {
  /** 角色域（frontend/backend/architect/designer/documenter 等 lane 词，由 CLI 层治理）。 */
  readonly role: string;
  readonly taskRef?: string;
  readonly denominatorRefs?: readonly DenominatorRefRow[];
}

export interface ProjectionEntry {
  /** 治理对象/条目引用（如 POLICY.* / KNOWLEDGE.* / capability 正文）。 */
  readonly ref: string;
  /** 注入理由（可判卷；无理由注入=噪声，GOLDEN-L8-3 判据）。 */
  readonly reason: string;
}

/**
 * catalog 消费出处呈现（P14；§92.2 Catalog 不是第二套 Project Truth）。
 * 不进 inputsFingerprint：root 是环境信息，同输入重放的字节稳定以内容为准。
 */
export interface CatalogProjectionSource {
  /** catalog = 已消费；absent = catalog 目录缺席（显式缺席，非静默空）。 */
  readonly status: "catalog" | "absent";
  readonly root: string | null;
  /** 消费注记：lock 校验结果（ok / 漂移 WARN 摘要）或缺席原因。 */
  readonly note: string;
}

export interface Projection {
  readonly manifest: {
    /** MUST 区：进 gate 判卷输入。 */
    readonly mustEntries: readonly ProjectionEntry[];
    /** ADVISORY 区：按触发条件注入的经验；不进 gate 判卷输入（GOLDEN-L8-3）。 */
    readonly advisoryEntries: readonly ProjectionEntry[];
    /**
     * catalog 策展注入分区（P14；§92.2）：出处 catalog/ 的检索式策展源，
     * reason 逐条标明 catalog 出处；绝不混入 mustEntries 判卷输入——catalog
     * 变更只影响本分区与 inputsFingerprint，store state 零变更。
     */
    readonly catalogEntries: readonly ProjectionEntry[];
    /** 懒加载工具清单（tool 按需物化；P14 起消费 catalog/tools/ 实存目录）。 */
    readonly lazyTools: readonly string[];
  };
  /** catalog 消费出处与 lock 校验呈现（P14）。 */
  readonly catalogSource: CatalogProjectionSource;
  /** 投影输入指纹——同输入重放字节稳定（D24：事务/store 自动维护，短路重跑依据）。 */
  readonly inputsFingerprint: string;
}

/**
 * 编译最小充分上下文投影。契约不变量（GOLDEN-L8-3 判据）：
 * manifest 与 task 无关的 POLICY. 条目 = 0；MUST/ADVISORY 分层可见；
 * catalogEntries 独立分区（§92.2，出处 catalog 非project state）。
 * 纯派生视图：投影不产生治理事实，不写 store。
 * 可选 options.catalogRoot 注入 catalog 根（测试/嵌入方；缺省仓库 catalog/）。
 */
export { compileProjection } from "./projection.js";
export type { ProjectionCatalogOptions } from "./projection.js";

// ============================================================
// Exception Ledger（§49.2 异常状态登记面；P19 三投影的异常事实源）
// ============================================================
// 语义边界：Ledger 是「当前世界边界之外仍需处理的异常状态」的机器登记面——
// 正文（Stable Core）不逐句贴标签（§49.2 反模式禁令），异常集中登记于此；
// view/audit 投影命令面（CLI，纯读）按 §91.3 二分消费。写通道唯一在
// recordException（模式同 issuePermit：台账侧车 + journal 事件流 + staged write）。
export {
  recordException,
  readExceptionLedgerFile,
  isExceptionLedgerRef,
  EXCEPTION_LEDGER_RELATIVE,
} from "./ledger.js";
export type {
  ExceptionLedgerEntry,
  ExceptionLedgerFile,
  ExceptionRecordInput,
} from "./ledger.js";

// ============================================================
// D 线地基：Sessions / Locks / Execution Identity（P20 · PRD §25.3/§25.4 + D 线 §1/§2/§3.3）
// ============================================================
// 语义边界（docs/kernel-api.md §13）：三原语是 D 线自身 P0 清单①②的 Task 层并发
// 地基（R2 重分类：P0=地基，P1=池——DEF-SUP 严格留 P1）。会话/锁住 runtime 侧车
// （易变态，墙钟合法位，liveness 判定显式可见非隐式）；执行身份住 executions/ 正式
// 档案（进 Git）。事件留痕统一走 state/journal.jsonl（A4 seq 采样，无墙钟）。
export {
  attachSession,
  refreshSession,
  readSessionRecord,
  listSessionRecords,
  judgeSessionLiveness,
  sessionRecordPath,
} from "./session.js";
export {
  SESSIONS_RELATIVE,
  SESSION_KEY_PATTERN,
  SESSION_DEFAULT_TTL_SECONDS,
} from "./session.js";
export type {
  SessionRecord,
  SessionAttachInput,
  SessionAttachOutcome,
  SessionLivenessRow,
} from "./session.js";
export {
  acquireLock,
  heartbeatLock,
  releaseLock,
  stealLock,
  readLockRecord,
  listLocks,
  checkLockFence,
  judgeLockStaleness,
  lockRecordPath,
} from "./locks.js";
export {
  LOCKS_RELATIVE,
  LOCK_DEFAULT_TTL_SECONDS,
  UNIT_LOCK_TYPE,
} from "./locks.js";
export type {
  LockRecord,
  LockHolder,
  LockAcquireInput,
  LockAcquireOutcome,
  LockStaleReason,
  LockLivenessRow,
  LockStealInput,
} from "./locks.js";
export type { LockKindValue } from "@pomaster/schemas";
export {
  beginExecution,
  endExecution,
  readExecutionRecordById,
  listExecutionRecords,
  allocateExecutionId,
  assertExecutionAttachable,
  isExecutionRef,
  executionRecordPath,
} from "./execution.js";
export {
  EXECUTIONS_RELATIVE,
  EXECUTION_ID_PATTERN,
  EXECUTION_SCHEMA,
} from "./execution.js";
export type {
  ExecutionRecord,
  ExecutionBeginInput,
  ExecutionEndInput,
} from "./execution.js";

// DEF-GATEKEEPER 触发观测器（P20-Commands；D 线 §5「同一 execution 既提 proposal
// 又 ALLOW ≥N 次/周」变为可测——对位裁定与窗锚语义见 gatekeeper.ts 头注）。
export { detectGatekeeperDrift } from "./gatekeeper.js";
export {
  GATEKEEPER_THRESHOLD_DEFAULT,
  GATEKEEPER_WINDOW_DAYS_DEFAULT,
} from "./gatekeeper.js";
export type {
  GatekeeperDriftInput,
  GatekeeperDriftReport,
  GatekeeperDriftRow,
} from "./gatekeeper.js";

// pathsOf / StorePaths 公共化（P20-Commands）：清单函数（listSessionRecords /
// listLocks / listExecutionRecords / detectGatekeeperDrift）以 StorePaths 为参，
// 嵌入方与 CLI 需要从 Store 句柄取得路径集（此前仅 kernel 内部与测试相对路径可达）。
export { pathsOf } from "./paths.js";
export type { StorePaths } from "./paths.js";

// ============================================================
// Engineering Catalog 读取器（P14：catalog→运行时联结的唯一读取面）
// ============================================================
// 只读消费 catalog/ 物料与 catalog-lock（§92.2：策展源非第二真相；D24 哈希伦理
// write_blocking=false——lock 漂移 WARN 呈现，永不阻断）。消费方：projection 通道
// （context compile 的 catalog 分区）与 CLI catalog status/explain（§44.10）。
export {
  loadCatalogPolicies,
  loadCatalogProjectionPresets,
  loadCatalogTools,
  readCatalogLock,
  resolveCatalogRoot,
  sha256OfUtf8,
  verifyCatalogLock,
} from "./catalog.js";
export type {
  CatalogLockDocument,
  CatalogLockDrift,
  CatalogLockDriftKind,
  CatalogLockEntry,
  CatalogLockVerification,
  CatalogPolicyMaterial,
  CatalogProjectionPresetMaterial,
  CatalogToolMaterial,
} from "./catalog.js";

// ============================================================
// Gate 归一（八拍⑤ VERIFY；C1 七态判卷）
// ============================================================

export interface GateRunContext {
  readonly ranAtSeq: number;
  readonly trigger: RunTriggerValue;
  readonly tool: string;
  readonly toolVersion: string;
  /** 度量口径声明（如 coverage:lines / ui_text:carrier_file_count）——强制上报，缺/非法 FATAL。 */
  readonly metricDialect: string;
}

/** 计数块：notApplicable 必填（C1：「多少对象与本规则无关」必须是数字而不是沉默）。 */
export interface GateCounts {
  readonly scanned: number;
  readonly applicableScanned: number;
  readonly violations: number;
  readonly notApplicable: number;
  readonly suppressedByLedger?: number;
  readonly uncheckedInBlindspotEstimated?: number;
  readonly declarationsFailedRecompute?: number;
}

/**
 * 03 items[] 违规明细条目（rule+location 必填，message 可选；不携带 excerpt_hash——
 * D24 哈希伦理：digest 只住读侧，判卷侧不设任何算 sha 路径）。
 */
export interface GateResultItem {
  /** 违规规则码（gate_def 内定义）。 */
  readonly rule: string;
  /** 仓内相对路径[:line 或 #fragment]；禁止绝对盘符（provenance 可移植纪律）。 */
  readonly location: string;
  readonly message?: string;
}

/** 门禁运行结果（镜像 03-gate-result；A8：只住 evidence/runs/，永不入 truth-index）。 */
export interface GateResult {
  readonly grn: string; // GRN-[0-9]+
  readonly gate: string; // SCREAMING_SNAKE；新增 gate 须经 gate_def 版本化登记
  readonly gateDef: string; // 定义 id@semver（如 POLICY.GATE.CONTENT_TRUTH@1.4.0），防口径静默漂移
  /** 执行工具标识（如 gauntlet:ui_text_scanner）——强制上报三件套之一（P12a）。 */
  readonly tool: string;
  /** 工具版本（semver）——钉死口径，C6 Overhead 双轨归因依赖版本可辨识。 */
  readonly toolVersion: string;
  /** 度量口径声明（coverage 行/分支、ui_text 载体文件数等）；同 gate 跨 dialect 结果不可直接比较。 */
  readonly metricDialect: string;
  readonly ranAtSeq: number;
  readonly verdict: VerdictValue;
  /** passed 被自动降级为 warning 时的原因码（binding_unverified_for_required_class 等，C1）。 */
  readonly verdictCapReason: string | null;
  readonly subjectId: GovernedId | null;
  /** Q3 fixture 隔离：subjectId 前缀 TEST.* ⇔ isFixture=true（双向强耦合）。 */
  readonly isFixture: boolean;
  readonly denominatorRefs: readonly DenominatorRefRow[];
  readonly counts: GateCounts;
  readonly blindspot: {
    readonly scanned: number;
    readonly produced: number;
    readonly escapeRatio: number;
  };
  /** asserted=自报（CLAIMED，永不单独判卷）/ recomputed=重算（判卷唯一依据）；失配=一级信号。 */
  readonly trust: {
    readonly asserted: Claimed<{ readonly violations: number }> | null;
    readonly recomputed: {
      readonly violations: number;
      readonly matchesAsserted: boolean;
    };
    readonly mismatch?: {
      readonly detected: boolean;
      readonly action: "recomputed_wins_recorded" | "escalate_to_authority";
    };
  };
  /** duration_ms 拆 self/external（C6 Overhead 双轨 primary/机器实测）；墙钟/耗时字段不进 digest。 */
  readonly durationMs: { readonly self: number; readonly external: number };
  /**
   * 03 scope.note 可选扩展位（P12 红队修复起落盘贯通）：缺席理由 / 安装指引 / 对账口径
   * 注记的诚实留痕位。缺席显式（C1）的「为何没查、去哪补」必须随 GRN 落盘——evidence
   * 是真相源，remediation 路标属证据记录该有的内容；CLI 呈现与账本同源，不再分叉。
   */
  readonly scopeNote?: string;
  /** 03 items[] 违规明细（判卷侧重算产物；x-budget 截断前明细）。 */
  readonly items?: readonly GateResultItem[];
  /** items 超 x-budget 截断留痕（03 items_truncated，仅在真截断时为 true）。 */
  readonly itemsTruncated?: boolean;
}

/**
 * 把工具/Agent 的 CLAIMED 输出归一为 03-gate-result 形态。语义：
 * - verdict 词表外值 → FATAL（词表纪律；七态见 VERDICT_VALUES）；
 * - notApplicable 缺失/NaN → FATAL（缺席必须显式表达，禁止静默跳过当通过）；
 * - subjectId 前缀 TEST.* 与 isFixture 双向强校验（Q3）；
 * - 本函数只做归一与显式化，永不阻断写入（gate 阻断语义由 closeout 编排层按 verdict 施加）。
 */
export { normalizeGateResult } from "./gate-result.js";

/**
 * GateResult → 03-gate-result 的 snake_case 形态（inline 内嵌进 07 run_record 的落盘结构）。
 * G4/G6 证据收编通路（CLI compact/record）复用本函数做 canonical 字节重放——落盘形态
 * 由 kernel 决定，CLI 不二次实现（docs/eight-beat-carriers-design.md §4.5「同一函数，
 * 不两套」）。纯函数，与 store.applyRecordGateRun 的落盘组装逐键同构。
 */
export { gateResultToSnake } from "./gate-result.js";

/**
 * canonical JSON 的 sha256 摘要（`sha256:<64 位小写十六进制>`）。
 * D24 哈希伦理：只读服务（identity/短路重跑/防篡改抽验），人永不计算哈希——本导出仅供
 * 机器通路复用（G6 claim blob 引用的 canonical 重放需要与 store.record_claim 同源同型，
 * 形态由 kernel 决定）。纯函数。
 */
export { sha256OfCanonical } from "./digest.js";

// ============================================================
// Reconcile（八拍⑥ RECONCILE；delta/例外/抽样三段报告）
// ============================================================

/**
 * 八拍⑥ RECONCILE（docs/kernel-api.md §10）：按 permit 签发基线出 delta 三段报告
 * （changed_objects / exceptions / samples_to_review；D20/D21 只审 delta，人不再逐行看全文）。
 * 纯读零写：同 store state + 同参数重放输出字节稳定（A4：stride 抽样确定、零墙钟、seq 锚定）。
 * 基线 closure：基线在 issue 瞬间存入 permit 台账（journal 无 axes 历史，事后不可重建）；
 * baseline_missing=true 显式 fail（not_configured ≠ passed 的 ⑥ 拍镜像）；
 * clean=true 是零审阅负担的合法出口。判卷逻辑住 kernel，CLI 只渲染。
 */
export {
  reconcilePermit,
  DEFAULT_RECONCILE_SAMPLES,
  RECONCILE_EXCEPTION_RUN_VERDICTS,
  RECONCILE_DELTA_KINDS,
} from "./reconcile.js";
export type {
  ReconcileOptions,
  ReconcileReport,
  ReconcileChangedObject,
  ReconcileDeltaKind,
  ReconcileEvidenceEntry,
  ReconcileException,
  ReconcileTamperEntry,
  ReconcileSample,
} from "./reconcile.js";

// ============================================================
// Doctor（D7 Portability 必检最小集四检；fail-closed）
// ============================================================

/** 探针三态：环境异常禁静默（D 线风险备忘：单机本地盘假设破裂必须报 environment_error）。 */
export type ProbeStatus = "pass" | "defect" | "environment_error";

export type DoctorProbeName =
  | "vocab_lock_consistency"
  | "dead_producers_empty"
  | "alias_conflicts_empty"
  | "local_binding_probe_replayable";

export interface DoctorReport {
  readonly probes: readonly {
    readonly probe: DoctorProbeName;
    readonly status: ProbeStatus;
    readonly detail: string;
  }[];
  /** 全部 probe=pass 才 true；任一 defect/environment_error → false（fail-closed）。 */
  readonly ok: boolean;
}

/**
 * doctor 必检最小集四检（x-vocab-source: 06 x-pomaster-doctor-coupling / thread-A §7）：
 * 1) vocab_lock 一致（三指纹对账）；2) dead_producers 空（liveness=dead ⇒ DEFECT，fail-closed）；
 * 3) alias_conflicts 空（三重查重冲突非空即 FATAL 级 DEFECT）；4) LOCAL binding probe 可重放。
 * 只读：doctor 永不修改 store 状态。
 */
export { doctorProbes } from "./doctor.js";

// ============================================================
// 辅助导出（契约四检之外的超集，签名见 doctor.ts；CLI `pomaster doctor` 工具探测消费）
// ============================================================
export {
  probeToolEnvironment,
} from "./doctor.js";
export type {
  CommandRunner,
  EnvironmentToolCheck,
  EnvironmentToolName,
  McpChromeDevtoolsCheck,
  TestPrefixLeak,
  TestPrefixScanCheck,
  ToolEnvironmentReport,
} from "./doctor.js";
