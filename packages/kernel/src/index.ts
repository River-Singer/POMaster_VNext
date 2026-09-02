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
import type { EvidenceArtifactRefInput } from "./evidence-artifacts.js";

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
  /** 词表指纹三元组：与 vocab-lock@v0.3-resolved 内容摘要对账，不一致即 FATAL（枚举多头拷贝免疫）。 */
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
 * 纯读装载（零写副作用）：与 createStore 同源（01 校验同闸），但不补侧车、不建目录
 * ——自述「纯读零写」的命令经本入口装载，存量 store 侧车缺失按「缺席」呈现，
 * 禁静默重建空账（审查 H3；契约面见 store.ts 头注）。
 */
export { loadStoreReadOnly } from "./store.js";

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
  /**
   * 证据存在性绑定引用（P0.5-2 / PRD §7；裁决8③ D2/D3=A：07 run_record 信封 optional
   * artifact_refs，blob 分支收窄）。可选——缺席 = 键缺席，存量 GRN 字节兼容；携带即
   * kernel 侧强制校验（词形 + 路径⇔身份派生一致 + blob 文件在场——先 persist 再 record）。
   * 绑定的门内判卷（POLICY.GATE.BROWSER@0.2.0 条款）归 gate 侧，kernel 保持 gate 无关。
   */
  readonly artifactRefs?: readonly EvidenceArtifactRefInput[];
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
  | {
      readonly op: "record_claim";
      readonly claim: ClaimRecordInput;
      /**
       * A3 显式 canonical 化覆写凭据（契约位收口，D20 边界注释）：缺席（默认）=
       * record 通道无权覆写既有同 id 证据（canonical 等价→幂等短路；异内容→
       * EVIDENCE_ALREADY_EXISTS）。置 true = 调用方声明「既有同 id 记录在场已知悉，
       * 本次是判定可复核的 canonical 化重录」（仅 cli record --grn 重放与 evidence
       * ingest 收编两条 sanctioned 通路传入）。kernel 保留二道防线：既有 claim 已处
       * 判定态（verification.verdict ∈ VERIFIED/PARTIALLY_VERIFIED/REJECTED）时
       * canonicalize 亦拒——已判定记录不可 canonical 化，须走新 id。
       */
      readonly canonicalizeOverwrite?: boolean;
    }
  | {
      readonly op: "record_gate_run";
      readonly run: GateRunRecordInput;
      /** 同 record_claim.canonicalizeOverwrite；run 无判定态概念（verdict 是 run 本身内容），重放翻转属 sanctioned 再判卷。 */
      readonly canonicalizeOverwrite?: boolean;
    };

export interface Transaction {
  readonly ops: readonly TransactionOp[];
  /** 审批/决策引用（DECISION.* / CHANGE.* / PERMIT.*，general_id 宽松词形）。 */
  readonly authorityRef?: string;
  readonly note?: string;
  /**
   * 事务级执行身份盖章（P21-Enforcement；PRD §25.4「哪个 Agent……做了哪次变化」
   * 的审计问题在 maintain 事务通路的兑现位）：携带即校验（词形 SCHEMA_INVALID /
   * 档案缺失 EXECUTION_NOT_FOUND——S1 禁自造身份，record op 同法）并盖章进
   * TX_APPLIED journal 事件（execution_id 键）；缺席 = null 显式呈现（C1）。
   * 盖章**不进** inputs_fingerprint（身份是 provenance 不是变更输入——同 ops 重放
   * 携带不同身份仍幂等短路，字节稳定纪律不破）。
   */
  readonly executionId?: string;
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
// Grounded Decision Graph 纯函数面（VB-PR1 · PRD v0.5.3 §5/§6/§7/§9/§10/§13/§14/§15/§16）
// ============================================================
// 语义边界（decision-graph.ts 头注为准；docs/kernel-api.md §24）：Grill 的核心产物是
// Decision Graph 而不是一串独立问题（§5.1）。全部纯函数零 IO 不 throw——非法输入一律
// 显式 outcome 拒绝（fail-closed）；零墙钟（事件序靠调用方供给 seq，A4）；**零写入通道**
// ——decision-graph.json 的读写归 CLI 命令面（PR-2 起），提升仍走 promote→maintain
// （§21 禁绕过）。graph_fingerprint 由本模块自动维护（sha256OfCanonical，D24：
// human_touch forbidden / write_blocking:false）；Grounding Verdict 五值与 §7.3 frontier
// 均为**派生判定不落盘**（§6.2 不进 Canonical Object State Axis / §16 禁 frontier.json）。
// 词形纪律（Owner 裁决 9②③，2026-09-01）：DECISION./RESEARCH.REQ./FINDING./
// DISCOVERY.INTENT./FACT. 是 Discovery 平面局部词形（state_plane_refs 先例）——不入
// GOVERNED_ID_PREFIXES、不过 parseGovernedId，校验=本模块词形正则 + 图内存在性；
// GRILLING/GRILLED/GRILL_CONFIRMED 禁词负例（§1.1 不新增 State Axis，09 号
// forbidden_wordforms 先例）；TODO(vocab-pr) 词形三镜像收编归独立词汇表批。
// schema 载体 18-decision-graph.schema.json（research_request/research_handoff/
// finding_link 三平面 definitions 同住决策图 schema，10 号零改动——Owner 裁决 9③）。
export {
  // —— 词形常量（Discovery 平面局部词形 + 派生词轴；TODO(vocab-pr)） ——
  DECISION_GRAPH_FORBIDDEN_WORDFORMS,
  DECISION_ID_PATTERN,
  RESEARCH_REQUEST_ID_PATTERN,
  FINDING_ID_PATTERN,
  DISCOVERY_INTENT_REF_PATTERN,
  MISSING_FACT_REF_PATTERN,
  DECISION_CLASS_VALUES,
  DECISION_CLASS_TO_DIMENSIONS,
  GROUNDING_VERDICT_VALUES,
  DECISION_RELATION_VALUES,
  DECISION_ANSWER_VALUES,
  RECOMMENDATION_SOURCE_VALUES,
  GROUNDING_SURFACE_VALUES,
  MISSING_FACT_ROUTE_VALUES,
  UNKNOWN_DISPOSITION_VALUES,
  SUFFICIENCY_DIMENSIONS,
  SUFFICIENCY_RESIDUAL_CLASSIFICATIONS,
  RESEARCH_MODE_ROUTE_HINTS,
  // —— 七函数公共面（§5.2 build / §7.3 frontier / §6.1-6.2 grounding gate /
  //    §9.1-9.4 research request / §10.1-10.2 handoff / §13.2-§14 resolve+六问重分类 /
  //    §15 discovery sufficiency） ——
  buildDecisionGraph,
  computeDecisionFrontier,
  evaluateDecisionGrounding,
  createResearchRequest,
  applyResearchHandoff,
  resolveDecision,
  classifyUnknownTriage,
  evaluateDiscoverySufficiency,
} from "./decision-graph.js";
export type {
  DecisionClassValue,
  GroundingVerdict,
  DecisionRelationValue,
  DecisionAnswer,
  RecommendationSourceValue,
  GroundingSurfaceValue,
  MissingFactRouteValue,
  UnknownDisposition,
  SufficiencyDimension,
  SufficiencyResidualClassification,
  ResearchModeRouteHint,
  DecisionConflictEntry,
  DecisionGrounding,
  DecisionRecommendation,
  DecisionAuthority,
  DecisionResolution,
  DecisionNode,
  DecisionGraph,
  DecisionNodeCandidate,
  BuildDecisionGraphOptions,
  BuildDecisionGraphRejectReason,
  BuildDecisionGraphOutcome,
  DecisionFrontierReport,
  DecisionFrontierOutcome,
  GroundingCheckId,
  GroundingCheckResult,
  DecisionGroundingInput,
  DecisionGroundingOutcome,
  ResearchRequestDraft,
  CreateResearchRequestInput,
  ResearchRequest,
  CreateResearchRequestOutcome,
  HandoffFinding,
  ResearchHandoffInput,
  ApplyResearchHandoffOutcome,
  UnknownTriage,
  ResolveDecisionInput,
  ResolveDecisionOutcome,
  SufficiencyResidual,
  DiscoverySufficiencyInput,
  SufficiencyBlockingItem,
  DiscoverySufficiencyReport,
  EvaluateDiscoverySufficiencyOutcome,
} from "./decision-graph.js";

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
// 跨域联结词形等价登记（P31 · GRN-4402 转译 / A13 · OPEN-M6-12）
// ============================================================
// 语义边界（docs/kernel-api.md §18）：把「跨域引用联结键」升为一等治理对象的词形轴
// ——等价登记表（declared-equivalence-only：无 declared_by 显式声明的等价对落
// pending 桶而非 active，登记≠裁决）+ 解析面（active 登记全等精确匹配，禁子串/
// 启发式/模糊猜测，未命中=显式 unresolved）+ pending 桶机械入册（encounter 自动
// 入册+dedupe，供 Authority 裁决队列）+ 联结覆盖率盲区指标（分母封闭
// resolved+pending+unresolved=total，unchecked_in_blindspot_estimated 同型）。
// 三条现行纪律（gaps §3 L103）结构性保住。D15/A6 挂接：resolveLinkageWordForm
// 三腿链（精确 id → A6 机械别名 canonical 化 → active 等价登记 → pending 桶），
// resolveAlias 本体零改动。侧车 state/equivalence-registry.json（staged write +
// 损坏 fail-closed + journal EQUIVALENCE_* 事件流；不进 content_digest）。
// 词形轴 pending_vocab_pr（WORD_FORM_DOMAIN_VALUES / EQUIVALENCE_STATUS_VALUES，
// 13-equivalence-registry definitions 镜像）。
export {
  EQUIVALENCE_REGISTRY_RELATIVE,
  EQUIVALENCE_GROUP_PATTERN,
  readEquivalenceRegistry,
  registerEquivalence,
  recordPendingEquivalence,
  resolveWordForm,
  wordFormsFor,
  resolveLinkageWordForm,
  computeLinkageCoverage,
  normalizeWordFormDomain,
} from "./equivalence.js";
export type {
  EquivalenceWordForm,
  EquivalenceDeclarationAudit,
  EquivalenceProvenance,
  EquivalenceEntry,
  EquivalenceRegistryFile,
  EquivalenceWordFormInput,
  EquivalenceRegistrationInput,
  PendingRecordInput,
  PendingRecordOutcome,
  WordFormResolution,
  LinkageVia,
  LinkageResolution,
  LinkageResolveInput,
  LinkageAttempt,
  LinkageAttemptOutcome,
  LinkageCoverage,
  EquivalenceReverseLookup,
} from "./equivalence.js";
export type {
  WordFormDomainValue,
  EquivalenceStatusValue,
} from "@pomaster/schemas";

// ============================================================
// 跨对象引用完整性 gate（P31 第二件 · gaps §3 GRN-4402 转译 · REF 消费面）
// ============================================================
// 语义边界（docs/kernel-api.md §19）：对对象集的跨对象引用（公式→字段 / 页段→对象 /
// 任意 ref 轴）逐条走 P31a 三腿链解析（resolveLinkageReadOnly 单一实现）+ 存在性全等
// 查册——命中 active 等价/精确 id → 真判（present/dangling）；未命中 → pending 桶机械
// 入册 + skipped_blindspot 证据链显式盲区计数（unchecked_in_blindspot_estimated）。
// 产出真实七态 verdict（verdict 矩阵：零分母 not_run / 真悬空 failed / 有盲区
// skipped_blindspot / 全判净 passed）+ 联结覆盖率指标（分母封闭三查两侧机器断言）。
// 盲区指标走既有 03 证据链（record_gate_run → evidence/runs/GRN-*.json，A8）+ store
// 侧车 state/linkage-coverage.json + journal LINKAGE_COVERAGE_RECORDED（truth-index
// health 闭表无现成挂点的取舍注记见 §19，呈报 Owner）。
export {
  LINKAGE_COVERAGE_RELATIVE,
  REF_INTEGRITY_GATE,
  REF_INTEGRITY_GATE_DEF,
  REF_DANGLING_RULE,
  resolveRefBatch,
  refIntegrityVerdict,
  attemptsOfRefJudgements,
  runRefIntegrityGate,
  readLinkageCoverage,
} from "./ref-integrity.js";
export type {
  RefEmission,
  RefDisposition,
  RefJudgement,
  RefIntegrityGateInput,
  PendingRegistrationRow,
  RefIntegrityVerdictDecision,
  RefIntegrityGateRun,
  LinkageCoverageRecord,
  LinkageCoverageFile,
} from "./ref-integrity.js";
// P31a 纯读半边（三腿链腿①②③单一实现；ref-integrity gate 同源消费，禁第二套）。
export { resolveLinkageReadOnly } from "./equivalence.js";

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
  /**
   * 变更类目（P0.5-1；∈ CATALOG_CHANGE_CLASS_VALUES，vocab-pr-0005 词轴；裁决 8 ②）。
   * 落 PermitRecord.change_class（capability_refs 内部状态文件扩展先例）——
   * Project Change / Permit 侧 applicability 输入承载位（PRD §14 P0.5-1 最小实现二）。
   */
  readonly changeClass?: string;
  /** 治理档位（P0.5-1；∈ CATALOG_GOVERNANCE_PROFILE_VALUES，O2 对齐 TRIAGE_PROFILES+STRICT）。 */
  readonly governanceProfile?: string;
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
  /**
   * P0.5-1 结构化 applicability 输入（PRD §5.2/§5.3；vocab-pr-0005；裁决 8 ② 2026-09-01）。
   * 全部 optional → 既有调用零破坏；词形 fail-closed 校验（capabilities=CAPABILITY.*
   * governed id / changeClass ∈ CATALOG_CHANGE_CLASS_VALUES / governanceProfile ∈
   * CATALOG_GOVERNANCE_PROFILE_VALUES）。未提供时，声明了对应机器字段的 catalog 条目
   * 按「不可判定即不注入」确定性排除（缺席显式，禁假绿——PRD §5.3 确定性排除优先）。
   */
  readonly capabilities?: readonly string[];
  readonly changeClass?: string;
  readonly governanceProfile?: string;
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
    /**
     * knowledge 检索注入分区（P28-Commands；§83.8「检索而不是全量注入」）：
     * knowledge 侧车（state/knowledge-library.json）的 [ADVISORY] 检索命中注入，
     * reason 逐条标明出处与命中 token（why-matched 可判卷）；绝不混入 mustEntries
     * 判卷输入——§83.2 铁律「Knowledge 不能直接让 Gate FAIL」+ GOLDEN-L8-3
     * （knowledge 平面与 gate 对象分母无通路，分区边界由对抗测试钉住）。
     */
    readonly knowledgeEntries: readonly ProjectionEntry[];
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
export { compileProjection, explainCatalogProjection } from "./projection.js";
export type {
  CatalogEntryDecision,
  CatalogDecisionWord,
  CatalogProjectionExplanation,
  ProjectionCatalogOptions,
} from "./projection.js";

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
// Engineering Knowledge 内核（P28 · PRD §83 Knowledge / Engineering Experience Kernel）
// ============================================================
// 语义边界：Knowledge 是 [ADVISORY] 检索注入的策展源（§83.8「定期沉淀 + 按 Change
// Localization 检索注入」），永不进 gate 判卷输入——§83.2 铁律「Knowledge 不能直接
// 让 Gate FAIL」的结构性保证四层（形态层 12 schema authority const ADVISORY / 类型层
// KnowledgeEntry["authority"]="ADVISORY" 字面量 / 通路层 TransactionOp 无 knowledge op /
// 消费层检索只产 ADVISORY 分区，见 knowledge.ts 头注）。写通道唯一在本模块语义入口
// （模式同 recordException：侧车 state/knowledge-library.json + journal KNOWLEDGE_*
// 事件流 + staged write）；每个生命周期边恰好一个语义入口——通用转移面对 promote/
// demote 边显式拒绝并指路（§25.3「晋升必须经过 Maintain / Authority / Gatekeeper」，
// §25.5 ⑦ Curator 直升 MUST = 禁止模式的机器化）。
export {
  validateKnowledgeTransition,
  readKnowledgeLibrary,
  recordKnowledge,
  applyKnowledgeTransition,
  promoteKnowledge,
  demoteKnowledge,
  demoteSpecToKnowledge,
  searchKnowledge,
  knowledgeQueryTokens,
  KNOWLEDGE_LIBRARY_RELATIVE,
  KNOWLEDGE_INJECTABLE_STATUSES,
} from "./knowledge.js";
export type {
  KnowledgeEntry,
  KnowledgeLibraryFile,
  KnowledgeEntryAudit,
  KnowledgeRecordInput,
  KnowledgeTransitionInput,
  KnowledgePromotionInput,
  KnowledgeDemotionInput,
  KnowledgeTransitionRequirement,
  KnowledgeTransitionOutcome,
  KnowledgeSearchRequest,
  KnowledgeSearchHit,
} from "./knowledge.js";
export type {
  KnowledgeKindValue,
  KnowledgeStatusValue,
  KnowledgePromotionAuthorityValue,
  KnowledgeConfidenceValue,
} from "@pomaster/schemas";

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

// ============================================================
// Runtime Adapter 契约与 Capability Pool（P21-Contract · PRD §25.1/§25.2/§58 + §24）
// ============================================================
// 语义边界（docs/kernel-api.md §14）：本节是**契约与判定面**——不实现任何真实
// runtime、不建 daemon（PRD grep "daemon" 0 命中；托管编排归 DEF-SUP 触发制，
// D 线 §5）。§58 AgentRuntime interface 是外部 Runtime Adapter 的实现契约；
// kernel 只消费三探针做能力探测与降级判定。全部纯函数零 IO 零墙钟。
export {
  probeRuntimeCapabilities,
  isMultiAgentCapable,
  evaluateCapabilityDegradation,
  planRoleExecution,
  assertHonestConcurrency,
  RUNTIME_CONCURRENCY_MASQUERADE,
} from "./runtime-adapter.js";
export type {
  AgentContext,
  AgentPacket,
  AgentPermissions,
  AgentHandle,
  AgentResult,
  AgentRuntime,
  RuntimeCapabilityProbe,
  RuntimeCapabilities,
  CapabilityDegradationRow,
  CapabilityDegradationReport,
  RoleExecutionPlanInput,
  RoleExecutionStep,
  RoleExecutionPlan,
} from "./runtime-adapter.js";

// Handoff Protocol 语义落地面（P21-Enforcement · PRD §24）：Handoff Packet 形态
// （§24 yaml 九键 closed form——「必须通过 Handoff Packet」的唯一形态；extra 键
// SCHEMA_INVALID 即「不得直接继承完整聊天上下文」的结构封条）+ 消费面
// （compileHandoffContext =「Agent 出生 → 获取最小 Context」的机器形态）。
// 纯函数零 IO；`pomaster handoff` 命令仍显式 deferred（DEF-SUP 触发制门槛）——
// 本节是其 deferred 下的契约面（runtime-adapter「契约与执行分层」同构）。
export {
  HANDOFF_FAST_GATE_VALUES,
  HANDOFF_PACKET_KEYS,
  validateHandoffPacket,
  compileHandoffContext,
} from "./handoff.js";
export type {
  HandoffFastGateValue,
  HandoffPacketKey,
  HandoffPacketEvidence,
  HandoffPacket,
} from "./handoff.js";

// DEF-SUP 触发制观测器（P21-Contract；D 线 §5 DEF-SUP 行三触发条件——
// (a) 同 SOP 链重复 ≥3 次（journal 事件型链实测）/ (b) 第二贡献者（申报）/
// (c) headless-CI（申报）；观测不施断，处置呈报 Owner。见 supervisor-trigger.ts 头注）。
export { detectSupervisorTrigger } from "./supervisor-trigger.js";
export {
  SUPERVISOR_CHAIN_THRESHOLD_DEFAULT,
  SUPERVISOR_CHAIN_MIN_LENGTH_DEFAULT,
  SUPERVISOR_MAX_CHAIN_LENGTH_DEFAULT,
  SUPERVISOR_TRIGGER_CONDITIONS,
} from "./supervisor-trigger.js";
export type {
  SupervisorTriggerCondition,
  SupervisorTriggerSource,
  SupervisorChainMatch,
  SupervisorTriggerConditionRow,
  SupervisorTriggerReport,
  SupervisorTriggerInput,
} from "./supervisor-trigger.js";

// pathsOf / StorePaths 公共化（P20-Commands）：清单函数（listSessionRecords /
// listLocks / listExecutionRecords / detectGatekeeperDrift）以 StorePaths 为参，
// 嵌入方与 CLI 需要从 Store 句柄取得路径集（此前仅 kernel 内部与测试相对路径可达）。
// buildStorePaths 公共化（P28-Commands）：knowledge 纯读命令（search/inspect/
// review-candidates）不建账读侧车——路径派生与 createStore 同源（buildStorePaths
// 是纯函数，不写任何文件），装载面防线（authority/status 词形 fail-closed）与
// kernel 写通路共享同一 readKnowledgeLibrary 实现。
export { pathsOf, buildStorePaths } from "./paths.js";
export type { StorePaths } from "./paths.js";

// ============================================================
// Engineering Catalog 读取器（P14：catalog→运行时联结的唯一读取面）
// ============================================================
// 只读消费 catalog/ 物料与 catalog-lock（§92.2：策展源非第二真相；D24 哈希伦理
// write_blocking=false——lock 漂移 WARN 呈现，永不阻断）。消费方：projection 通道
// （context compile 的 catalog 分区）与 CLI catalog status/explain（§44.10）。
export {
  catalogRootCandidates,
  loadCatalogPolicies,
  loadCatalogProjectionPresets,
  loadCatalogSensors,
  loadCatalogTools,
  readCatalogLock,
  resolveCatalogRoot,
  sha256OfUtf8,
  verifyCatalogLock,
  OBSERVATION_SURFACE_VALUES,
  SENSOR_ID_PATTERN,
  SENSOR_SIDE_EFFECT_CLASS_VALUES,
  SENSOR_AVAILABILITY_SURFACE_VALUES,
  SENSOR_KERNEL_SURFACE_KEYS,
} from "./catalog.js";
export type {
  CatalogLockDocument,
  CatalogLockDrift,
  CatalogLockDriftKind,
  CatalogLockEntry,
  CatalogLockVerification,
  CatalogPolicyMaterial,
  CatalogProjectionPresetMaterial,
  CatalogSensorMaterial,
  CatalogToolMaterial,
  ObservationSurfaceValue,
  SensorAvailabilityProbe,
  SensorAvailabilitySurfaceValue,
  SensorSideEffectClassValue,
} from "./catalog.js";

// ============================================================
// Trellis Spec Analyzer（P30 · PRD §96 第 8 步「只分析，不 Apply」+ §93.3/93.4/93.5/93.6）
// ============================================================
// 语义边界：纯分析引擎——输入 spec 目录（或文件内容集），输出迁移分类清单
// （八类候选提取 + 十二分类 + PENDING_REVIEW 诚实桶 + overlap/cross-lane 清单 +
// §93.6 六项前置检查的 analyze 版 + §92.5/92.6 附带清单 + 分母 fail-closed 块）。
// analyze-only 结构封条：导出面无任何写 catalog/项目 state 的函数（签名只收路径/
// 内容，无 Store）；TransactionOp 无 Analyzer op；本模块零写 IO（对照测试钉）。
// --propose/--diff/--apply 显式 deferred（PRD §93.6 四词形；呈现层提示归后续批次）。
export {
  analyzeSpecDir,
  analyzeSpecFiles,
  parseSpecMarkdown,
  normalizeClassificationValue,
  specSimilarityTokens,
  CANDIDATE_KIND_MAPPING,
  PRECHECK_IDS,
  ACTIVATION_BEARING_CLASSIFICATIONS,
  PENDING_REVIEW_BUCKET,
  PROJECT_STATE_HINT,
  SPEC_ANALYZER_REPORT_DIALECT,
  DUPLICATE_SIMILARITY_THRESHOLD,
  OVERLAP_SIMILARITY_THRESHOLD,
  CONTRADICTION_SIMILARITY_THRESHOLD,
} from "./spec-analyzer.js";
export type {
  SpecFileInput,
  SpecSection,
  SpecCandidateSource,
  SpecCandidate,
  SpecOverlapLink,
  SpecCrossLaneRow,
  SpecPreCheckRow,
  SpecPreCheckHit,
  SpecPreCheckDeferred,
  SpecAnalysisFileRow,
  SpecAnalysisDenominator,
  SpecActivationRow,
  SpecNameExitEntry,
  SpecAnalysisReport,
  SpecAnalysisSource,
  CandidateKind,
  CandidateKindMappingRow,
  PreCheckId,
} from "./spec-analyzer.js";

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
    /**
     * 盲区回归 fixture 证据引用（03 blindspot.fixture_regression 同名位；C3 封条）：
     * verdict=skipped_blindspot 必附（03 allOf 封条——无证据的盲区跳过不过 schema）。
     * 值是证据锚引用（如 pytest 全 skipped 腿指向 unchecked_in_blindspot_estimated
     * 计数词形），禁虚构不存在的回归 fixture 名。
     */
    readonly fixtureRegression?: string;
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
// Evidence Artifact Binding（P0.5-2；PRD §7/§14 + 裁决8③④）
// ============================================================

/**
 * 原始字节 sha256 摘要（artifact 内容寻址；PRD §7.3「content_identity 只能由基础设施
 * 产生」）。与 sha256OfCanonical 是两种不同哈希对象（raw 字节 ≠ canonical-JSON），
 * 禁止互替。纯函数。
 */
export { sha256OfBytes } from "./digest.js";
export {
  EVIDENCE_BINDING_INCOMPLETE,
  EVIDENCE_BINDING_INCOMPLETE_REASONS,
  artifactRefsToSnake,
  assertArtifactBlobsExist,
  assertArtifactRefs,
  persistEvidenceArtifact,
  storagePathOfSha256,
  verifyEvidenceBinding,
} from "./evidence-artifacts.js";
export type {
  EvidenceArtifactRefInput,
  EvidenceBindingIncompleteReason,
  EvidenceBindingOutcome,
  PersistEvidenceArtifactInput,
  PersistedEvidenceArtifact,
} from "./evidence-artifacts.js";

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
// Portability Kernel（P32 · PRD §85 全节 + §84.6 Hidden Memory Drift）
// ============================================================
// 语义边界（docs/kernel-api.md §20）：§85.2 MEMORY_PORTABILITY_GATE 八项检查
// （PASS/FAIL/NOT_RUN 三态显式，缺项=FAIL 或 NOT_RUN 禁静默绿）+ §85.3
// Portability Manifest 读写（JSON 形态 .pomaster/portability-manifest.json，
// 五键逐字；读侧校验五族闭集 + 禁依赖命中检测）+ §85.4 可删除测试执行器
// （rm -rf .pomaster/runtime → bootstrap → state equivalent；只接受含临时标记段
// 的 fixture root——防误删真实 store 的结构性防线）+ §84.6 MEMORY_DRIFT 检测
// （harness-local 记忆位仅探测存在性，内容不读取不入库；禁自动写入 Canonical
// State，必须 classification/review）。bootstrap 只重建 runtime 面（缺失才写，
// 零治理事实零 journal 事件——重建非变更，A4；§85.4 state equivalent 的
// 字节可判定性前提）。词形轴 pending_vocab_pr（PORTABILITY_* / MEMORY_DRIFT，
// PRD §85/§84.6 逐字 + FAIL/NOT_RUN fail-closed 补位词）。
export {
  PORTABILITY_MANIFEST_RELATIVE,
  PORTABILITY_CHECK_IDS,
  PORTABILITY_CHECK_LABELS,
  EVIDENCE_SAMPLE_CAP,
  DELETABILITY_FIXTURE_MARKERS,
  canonicalPortabilityManifest,
  readPortabilityManifest,
  validatePortabilityManifest,
  writePortabilityManifestIfMissing,
  runPortabilityChecks,
  portabilityCheck,
  portabilityBootstrap,
  probePortabilityRuntimeRebuild,
  defaultHarnessMemoryRoots,
  assertDeletabilityFixtureRoot,
  runDeletabilityTest,
} from "./portability.js";
export type {
  PortabilityCanonicalSetValue,
  PortabilityRuntimeRebuildValue,
  PortabilityForbiddenDependencyValue,
  PortabilityCheckStatusValue,
} from "./vocab.js";
export type {
  PortabilityCheckId,
  PortabilityCheckRow,
  PortabilityCheckOptions,
  PortabilityManifest,
  ForbiddenDependencyHit,
  PortabilityManifestReconciliation,
  PortabilityReport,
  PortabilityBootstrapResult,
  PortabilityRuntimeRebuildProbe,
  DeletabilityTestReport,
} from "./portability.js";
// §85/§84.6 词形轴唯一镜像在 @pomaster/schemas vocab.ts 待收编段（P32 段）；
// 本契约面照 kernel 各模块惯例转发（kernel vocab.ts re-export 同源）。
export {
  PORTABILITY_CANONICAL_SET_VALUES,
  PORTABILITY_RUNTIME_REBUILD_VALUES,
  PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES,
  MEMORY_DRIFT,
} from "./vocab.js";

// ============================================================
// Memory Harvest 台账管线内核（P33a · PRD §48.2/§48.4/§48.5/§44.10 memory 命令组
// + Case N；thread-B §4 四桶+inbox 设计的产品半边）
// ============================================================
// 语义边界（docs/kernel-api.md §21）：四桶初筛（TRUTH/KNOWLEDGE/EPISODE/PREFERENCE，
// thread-B §4.1 逐字）+ 两条特殊出口（AUTHORITY_POLICY 升格须显式 authorityUpgrade
// 声明默认拒绝 / INVALID_EXPIRED 淘汰）+ UNCLASSIFIED_PENDING 机械拒绝位（禁模糊
// 猜测——判不了显式 LOW）+ 半自动 inbox 管线（机器提案→batch review 只改分类标签
// 不改写内容原文——decideInboxEntry 签名无 text 键位的结构封条→promote 分桶路由）。
// KNOWLEDGE 桶晋升走 P28 recordKnowledge 通路（恒 CANDIDATE 起步 + authority 恒
// ADVISORY，不旁路生命周期）；TRUTH/DECISION/EVIDENCE 晋升不写 Canonical State 返回
// escalate_owner（呈报位——Case N「不得自动成为 Truth」正向镜像）；USER/PREFERENCE
// 落 user-scope 台账（§48.2 第 6 类不入项目 Git；默认 ~/.pomaster/user 可注入）。
// auditMemory 消费 P32 MEMORY_DRIFT 探测（词形复用），drift 项自动进 inbox。数据
// 落点全部在 .pomaster/memory/ 子树（绝不触碰 .pomaster/state/truth；零 journal）；
// id=HM-<12hex> 内容寻址（同文同 id 重复显式检出，A4 无墙钟无随机）；词形轴
// pending_vocab_pr（HARVEST_*/MEMORY_CLASS/REVIEW_STATE，schemas vocab.ts P33 段）。
export {
  MEMORY_INBOX_RELATIVE,
  USER_MEMORY_LEDGER_FILENAME,
  defaultUserMemoryRoot,
  inboxEntryIdOf,
  buildInboxEntry,
  captureMemory,
  harvestHarness,
  classifyForHarvest,
  parseFrontmatterMeta,
  HARVEST_RULES,
  OBSOLETE_MARKERS,
  reviewInbox,
  readInboxEntries,
  readInboxEntry,
  decideInboxEntry,
  promoteMemory,
  auditMemory,
  readUserMemoryLedger,
  INBOX_SCOPE_VALUES,
  MEMORY_CLASS_PRD_LABELS,
  MEMORY_CLASS_OF_BUCKET,
} from "./memory-harvest.js";
export type {
  InboxEntry,
  InboxProposal,
  InboxReviewedBy,
  InboxPromotedRoute,
  InboxEntryBuildInput,
  InboxScopeValue,
  HarvestRule,
  HarvestClassification,
  CaptureMemoryOptions,
  HarvestHarnessOptions,
  HarvestHarnessReport,
  InboxReviewFilters,
  InboxReviewReport,
  InboxReclassify,
  InboxDecisionInput,
  PromoteKnowledgeInput,
  MemoryPromoteOptions,
  MemoryPromoteOutcome,
  MemoryPromoteResult,
  UserMemoryLedgerEntry,
  UserMemoryLedgerFile,
  MemoryAuditOptions,
  MemoryAuditReport,
} from "./memory-harvest.js";
// P33 词形轴唯一镜像在 @pomaster/schemas vocab.ts P33 段（kernel vocab.ts re-export
// 同源转发，P32 段同款惯例）。
export {
  HARVEST_BUCKET_VALUES,
  HARVEST_PRIMARY_BUCKETS,
  HARVEST_SPECIAL_EXIT_VALUES,
  MEMORY_CLASS_VALUES,
  REVIEW_STATE_VALUES,
  HARVEST_SOURCE_VALUES,
  HARVEST_CONFIDENCE_VALUES,
  // P33b CLI 命令面词形（错误词形族 + 呈报词形；同段 pending_vocab_pr）。
  MEMORY_CLI_ERROR_VALUES,
  OWNER_ESCALATION_REQUIRED,
} from "./vocab.js";
export type {
  HarvestBucketValue,
  HarvestPrimaryBucket,
  HarvestSpecialExitValue,
  MemoryClassValue,
  ReviewStateValue,
  HarvestSourceValue,
  HarvestConfidenceValue,
  MemoryCliErrorValue,
} from "./vocab.js";

// ============================================================
// Production Feedback / Control Band v1（P34a · PRD §95 全节 + §30 第四态 +
// §55.1 + §90.4）
// ============================================================
// 语义边界（production.ts 头注为准）：§95.2「Tool Detects, Agent Diagnoses」链 v1
// ——异常判定只走显式谓词+数值 observation（evaluateControlBand 三态纯函数，禁自由
// 文本判据入判定通路）；BREACHED 产 Evidence 恒 detected_by=tool_signal；
// §95.3 CURRENT→CHALLENGED 走 applyTransaction 零旁路（authorityRef 承载 breach
// evidence 引用满足 store LOCKED+STABLE→CHALLENGED 既有前置）；Agent Diagnosis
// 必持既有 BREACHED band evidence（DIAGNOSIS_WITHOUT_BREACH_EVIDENCE 封条）；
// §55.1 八能力 Leading/Lagging 指标挂钩既有 gate 台账（不可机算显式
// NOT_MEASURABLE_YET + METRICS_CAVEAT 逐字注记）；§90.4 八信号登记恒
// POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态，无任何自动应用通路（结构封条）。
// 数据落点 .pomaster/production/ 子树（新分区呈报项；零 journal 事件——唯一治理
// 事实变更经 applyTransaction 由事务自身记 TX_APPLIED）。
export {
  PRODUCTION_RELATIVE,
  PRODUCTION_BANDS_RELATIVE,
  PRODUCTION_OBSERVATIONS_RELATIVE,
  PRODUCTION_BREACHES_RELATIVE,
  PRODUCTION_CHALLENGES_RELATIVE,
  PRODUCTION_DIAGNOSES_RELATIVE,
  PRODUCTION_SELF_IMPROVEMENT_RELATIVE,
  CAPABILITY_OUTCOME_METRICS,
  METRICS_CAVEAT,
  registerControlBand,
  readControlBand,
  listControlBands,
  evaluateControlBand,
  recordObservation,
  listObservations,
  readBreach,
  listBreaches,
  challengeFromBreach,
  listChallenges,
  recordDiagnosis,
  listDiagnoses,
  computeCapabilityOutcomeMetrics,
  registerSelfImprovementCandidate,
  listSelfImprovementCandidates,
} from "./production.js";
export type {
  BandPredicate,
  ControlBand,
  BandObservation,
  BreachEvidenceRecord,
  BandEvaluation,
  ObservationRecord,
  ChallengeRecord,
  DiagnosisRecord,
  SelfImprovementCandidateRecord,
  ControlBandInput,
  ChallengeFromBreachOptions,
  ChallengeFromBreachResult,
  DiagnosisInput,
  SelfImprovementSignalInput,
  CapabilityOutcomeMetricRow,
  CapabilityOutcomeMetricValue,
  CapabilityOutcomeReport,
} from "./production.js";
// P34 词形轴唯一镜像在 @pomaster/schemas vocab.ts P34 段（kernel vocab.ts re-export
// 同源转发，P32/P33 段同款惯例；CHALLENGED 复用 CHANGE_VALUES 不重复登记）。
export {
  PHASE_TIMELINE_VALUES,
  PRODUCTION_SIGNAL_SOURCE_VALUES,
  DIAGNOSIS_KIND_VALUES,
  BAND_PREDICATE_OPERATOR_VALUES,
  CONTROL_BAND_EVALUATION_STATUS_VALUES,
  CAPABILITY_OUTCOME_METRIC_STATUS_VALUES,
  CAPABILITY_OUTCOME_METRIC_KEY_VALUES,
  SELF_IMPROVEMENT_SIGNAL_VALUES,
  SELF_IMPROVEMENT_SIGNAL_PRD_LABELS,
  POMASTER_SELF_IMPROVEMENT_CANDIDATE,
  DETECTED_BY_TOOL_SIGNAL,
  // P34b CLI 命令面词形（错误词形族；vocab-pr-0004 已收编，Owner 决议 2026-09-01）。
  PRODUCTION_CLI_ERROR_VALUES,
} from "./vocab.js";
export type {
  PhaseTimelineValue,
  ProductionSignalSourceValue,
  DiagnosisKindValue,
  BandPredicateOperatorValue,
  ControlBandEvaluationStatusValue,
  CapabilityOutcomeMetricStatusValue,
  CapabilityOutcomeMetricKey,
  SelfImprovementSignalValue,
  ProductionCliErrorValue,
} from "./vocab.js";

// ============================================================
// Doctor（D7 Portability 必检最小集五检；fail-closed）
// ============================================================

/** 探针三态：环境异常禁静默（D 线风险备忘：单机本地盘假设破裂必须报 environment_error）。 */
export type ProbeStatus = "pass" | "defect" | "environment_error";

export type DoctorProbeName =
  | "vocab_lock_consistency"
  | "dead_producers_empty"
  | "alias_conflicts_empty"
  | "local_binding_probe_replayable"
  | "claim_self_approval_clean";

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
 * doctor 必检最小集五检（x-vocab-source: 06 x-pomaster-doctor-coupling / thread-A §7）：
 * 1) vocab_lock 一致（三指纹对账）；2) dead_producers 空（liveness=dead ⇒ DEFECT，fail-closed）；
 * 3) alias_conflicts 空（三重查重冲突非空即 FATAL 级 DEFECT）；4) LOCAL binding probe 可重放；
 * 5) claim_self_approval_clean（D20 反自批：同主体自填 VERIFIED 检出）。
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

// ============================================================
// Execution Trace Manifest Lite（W1-C · PRD v0.5.2 §8 + §14 P0.5-3 + §15 Benchmark C + §16 Case A）
// ============================================================
// 语义边界（trace.ts 头注为准）：Trace 是 Identity 的**派生投影/侧车**（A19 Identity
// Is Not Trace——不新增第二套身份；四克制：零新 State Axis/Gate/Runner）。纯函数
// 编译器从既有平面派生（零新采集器）：journal TX_APPLIED.changed_object_ids → writes、
// ops 计数 → transition_proposals、GRN/CLM 文件自报 execution_id → tool_receipts/
// evidence_refs；reads/agent_spawns 恒空数组显式（§14 P0.5-3「不先采集完整 read
// trace」的 Lite 边界）。execution_id 复用 assertExecutionAttachable 严格通道（§16
// Case A 禁自造第二种 EXEC-* 身份，SCHEMA_INVALID/EXECUTION_NOT_FOUND 直接继承）。
// 落盘双平面（裁决 8 ②「trace 独立 traces/ 分区」；P34 新分区先例——不进 content_digest、
// 零 journal 事件）：traces/（durable 进 Git）+ runtime/traces/（EPHEMERAL 可丢弃，
// §85.4 runtime/ 判据豁免）。显式 --seal 物化带 derived_from_seq 锚，读侧 canonical
// 重放对账 stale 显式（evidence compact 快路径同构）；retention 四档逐字仅记录不 GC
// （§8.3 + 裁决 8 ②）。词形轴 pending vocab-pr-0005（TRACE_RETENTION_VALUES /
// pomaster.execution_trace/v1——批 1 文件面互斥，词表三镜像登记归主控批次）。
export {
  TRACES_RELATIVE,
  RAW_TRACES_RELATIVE,
  EXECUTION_TRACE_SCHEMA,
  EXECUTION_TRACE_VERSION,
  TRACE_RETENTION_VALUES,
  compileExecutionTrace,
  executionTraceDerivedView,
  sealExecutionTrace,
  readSealedExecutionTrace,
  listSealedExecutionTraces,
} from "./trace.js";
export type {
  TraceRetentionValue,
  TraceStoragePlane,
  TraceRefFootprint,
  TraceToolReceipt,
  TraceTransitionProposal,
  ExecutionTraceManifest,
  ExecutionTraceSealInput,
  ExecutionTraceSealResult,
  SealedExecutionTrace,
  SealedTraceListRow,
} from "./trace.js";

// ============================================================
// Perception 契约 + Environment Doctor + Observation Receipt（W1-D1 P0.5-4a 纯函数面 + W1-D2 P0.5-4b 接线）
// ============================================================
// 语义边界（perception.ts 头注为准；PRD v0.5.2 §6 全章 + §14 P0.5-4 + Benchmark E +
// Case H）：Observation ≠ Verification ≠ Diagnosis ≠ Evidence；Tool Output ≠ Truth。
// 纯函数零 IO 零 store 依赖零墙钟（同输入重放字节稳定，A4）；产品接线住消费方
// （gauntlet-lite browser-adapter/browser-legs/browser-evidence——POLICY.GATE.BROWSER
// @0.2.0 之上增 §6.7 环境身份前置门，verdict 七态零扩张：WRONG_OR_UNVERIFIED_INSTANCE
// → blocked）。词形纪律：OBS-/ENVREC-/ENV./SENSOR./JOURNEY. 为感知平面通路/局部词形，
// 非 governed 前缀不入 id_namespace 闭包（AGX-n 头注同款注记）；observation surface/
// side-effect/负观察/doctor verdict 等词轴 TODO(vocab-pr-0005)——词表三镜像登记归
// 主控批次（批 2 文件面互斥）；CAPABILITY_DEGRADED 与 §58 capability_degradation_report
// 同词根不同概念（裁决 8 撞族消歧）。schema 载体 17-perception-receipts.schema.json。
// barrel 撞名注记（W1-D2）：OBSERVATION_SURFACE_VALUES / ObservationSurfaceValue 已由
// catalog.js（批 1 P1-5 sensor catalog 线）经本 barrel 导出——同一 PRD §6.4 八值字面
// 同源（逐字全等）；perception.ts 模块常量是感知模块内部消费位（perception.spec 直连
// 钉住），barrel 单一出口纪律下本块不重复导出（撞名 = esbuild Multiple exports 硬错）。
export {
  // —— 词形常量与词轴（TODO(vocab-pr-0005)） ——
  SIDE_EFFECT_CLASS_VALUES,
  PROBE_SIDE_EFFECT_RULES,
  NEGATIVE_OBSERVATION_VALUES,
  OBSERVATION_RESULT_VALUES,
  ENVIRONMENT_DOCTOR_VERDICT_VALUES,
  CAPABILITY_DEGRADED,
  OBS_ID_PATTERN,
  ENVREC_ID_PATTERN,
  DOCTOR_CONFIRM_FIELDS,
  DOCTOR_REQUIRED_EXPECTATION_FIELDS,
  // —— §6.2/§6.3 四锚契约 ——
  validateObservationRequest,
  // —— §6.7 Environment Doctor + EnvironmentReceipt ——
  runEnvironmentDoctor,
  buildEnvironmentReceipt,
  // —— §6.13 Observation Receipt（W1-D2：OBSERVED 必须 ≥1 条 artifact_refs 封条） ——
  buildObservationReceipt,
  // —— §6.14 负观察判定 ——
  judgeNegativeObservation,
} from "./perception.js";
export type {
  SideEffectClassValue,
  NegativeObservationValue,
  ObservationResultValue,
  EnvironmentDoctorVerdict,
  DoctorConfirmField,
  DoctorRequiredExpectationField,
  EnvironmentExpectation,
  EnvironmentObserved,
  EnvironmentDoctorRow,
  EnvironmentDoctorOutcome,
  EnvironmentReceipt,
  ObservationTarget,
  ObservationRequest,
  ObservationReceiptArtifactRef,
  ObservationReceiptInput,
  ObservationReceipt,
  DeclaredNegative,
  NegativeObservationInput,
  NegativeObservationOutcome,
  NegativeObservationPreconditions,
} from "./perception.js";

// ============================================================
// Software Graph relation sidecar + Object Family 派生视图 + Analyzer Output
// Contract + Resolver（P-v06 批次 0 Model Constitution · Owner 四决议 D-1~D-4
// 2026-09-02 · PRD v0.6 §6-8/§98/§148-149 + v0.6.1 §2/§69/§73/§75/§87）
// ============================================================
// 语义边界：Graph 不是第六原语（PRD v0.6 §6 逐字）——relations.ts 只承载边
// （Typed Relation sidecar：state/relations.jsonl 追加流，EDGE-<12hex> 内容寻址
// 幂等；不建图库、不改 01、不进 content_digest；端点存在性归消费面）；family.ts
// 是 Derived Facts 派生视图（前缀→family 全总映射，零信封改动——PRD §1.2/§163
// Phase A）；analyzer-contract.ts 是 §148 八字段必答判卷 + §149 盲区四态映射
// （不新增词——规范位归既有 perception 词面；FAILED_TO_OBSERVE 恒盲区位绝不折算
// absence）；resolver.ts 是统一语义解析门面（§98/§69/§73：三精确腿 + 词形腿，
// match_class 确定性派生、NO_MATCH 显式、分母披露、advisory≠match §87；解析≠采用
// ——INSTANCE_OF 边由显式采用动作经 registerRelation 登记）。词形轴
// RELATION_*/SUBSTRATE_LAYER/RESOLUTION_MATCH_CLASS/OBJECT_FAMILY/CATALOG_KIND
// 已随 vocab-pr-0006 收编 vocab-lock@v0.5-resolved 主表 software_graph_vocab 段
// （schema 载体 19-software-graph-relations.schema.json）。
export {
  RELATIONS_RELATIVE,
  EDGE_ID_PATTERN,
  CATALOG_ENDPOINT_ID_PATTERN,
  OBSERVATION_REF_PATTERN,
  normalizeRelationType,
  normalizeRelationOrigin,
  normalizeEndpointDomain,
  normalizeRelationConfidence,
  readRelations,
  registerRelation,
  edgeIdOf,
  relationsTouching,
  reverseDependents,
  forwardDependencies,
} from "./relations.js";
export type {
  RelationEndpoint,
  RelationProvenance,
  RelationEntry,
  RelationEndpointInput,
  RelationRegistrationInput,
  RelationRegistrationOutcome,
} from "./relations.js";
export {
  PREFIX_FAMILY_MAP,
  FAMILIES_WITHOUT_PREFIX,
  deriveFamily,
  familyOfId,
} from "./family.js";
export {
  ANALYZER_ID_PATTERN,
  SOURCE_SHA_PATTERN,
  PRD_BLINDSPOT_STATES,
  PRD_BLINDSPOT_STATE_MAPPING,
  BLINDSPOT_CANONICAL_OBSERVED,
  normalizeAnalyzerReport,
  partitionBlindSpotAttempts,
} from "./analyzer-contract.js";
export type {
  AnalyzerReportInput,
  AnalyzerReport,
  PrdBlindSpotState,
  BlindSpotAttempt,
  BlindSpotPartition,
} from "./analyzer-contract.js";
export {
  NEW_ENTITY_GATE_DEF,
  resolveNeed,
  newEntityVerdictFromResolution,
} from "./resolver.js";
export type {
  ResolverRequestInput,
  ResolverMatch,
  ResolverOutcome,
} from "./resolver.js";
export { loadCatalogArchetypes } from "./catalog.js";
export type { CatalogArchetypeMaterial } from "./catalog.js";
// —— P-v06 词值常量再导出（软件图词轴；vocab-pr-0006 收编，唯一镜像 @pomaster/schemas） ——
export {
  RELATION_TYPE_VALUES,
  RELATION_ORIGIN_VALUES,
  RELATION_ENDPOINT_DOMAIN_VALUES,
  RELATION_CONFIDENCE_VALUES,
  SUBSTRATE_LAYER_VALUES,
  RESOLUTION_MATCH_CLASS_VALUES,
  OBJECT_FAMILY_VALUES,
  CATALOG_KIND_VALUES,
} from "@pomaster/schemas";
export type {
  RelationTypeValue,
  RelationOriginValue,
  RelationEndpointDomainValue,
  RelationConfidenceValue,
  ResolutionMatchClassValue,
  ObjectFamilyValue,
  SubstrateLayerValue,
  CatalogKindValue,
} from "@pomaster/schemas";
