/**
 * vocab.ts —— FROZEN 词表的代码唯一镜像点。
 *
 * 词表纪律（违者=返工）：
 * - 本文件一切枚举/前缀/转移矩阵只能镜像 `assets/vocab-lock.draft.yaml`
 *   （pomaster.vocab/v0.8-resolved；v0.1-resolved 2026-08-27 FROZEN，2026-08-29 PR-0001
 *   append-only 纯增量增补（v0.1 词值零删改），2026-09-01 PR-0004 增补
 *   production_band_vocab 段 + id_namespace.state_plane_refs 五通路编号词形注记，
 *   2026-09-01 PR-0005 增补 catalog_layer_vocab 段 change_classes/governance_profiles
 *   两词轴 + applicability_fields 字段面注记——Owner 裁决 8 ② 2026-09-01，
 *   2026-09-02 PR-0006 增补 software_graph_vocab 段六词轴 + catalog_layer_vocab
 *   catalog_kind 词轴 + id_namespace.state_plane_refs EDGE-<12hex> 通路词形注记
 *   ——Owner 四决议 D-1~D-4 2026-09-02（PRD v0.6/v0.6.1 融合批次 0 Model Constitution），
 *   2026-09-03 PR-0007 增补 source_types 轴 owner_directive 词形（Owner 有意词形收编
 *   ——knowledge.web.browser.mcp_eyes 物料 sources[].type 实录，append-only 纯增量），
 *   2026-09-04 PR-0008 增补 GOVERNED_ID_PREFIXES SPEC. 前缀（vNext Batch 2 R1 / D6），
 *   2026-09-05 PR-0009 增补裁定批 B 全量在用新词形收编（Owner 裁定 D4=(a) 2026-09-05
 *   ——十一新段 + catalog/presentation 两段扩轴 + Discovery 平面 state_plane_refs 注记；
 *   本文件原「待词汇表 PR 收编」各段就地转正为 vocab-lock 镜像段，词值零改动，
 *   v0.1~v0.7 词值零删改），逐值相等，禁止发明词表外值；
 * - 需要新值 → 走词汇表 PR（append-only），禁止就地添加；
 * - 每个数组都带 x-vocab-source 行，改 vocab-lock 时同 commit 同步本文件。
 */

/** IR 方言标识（x-vocab-source: vocab-lock 顶层 ir_schema 字段，逐字冻结）。 */
export const IR_SCHEMA_DIALECT = "pomaster.truth-index/v1-draft" as const;

// ============================================================
// state_axes（x-vocab-source: vocab-lock state_axes，FROZEN）
// ============================================================

/** lifecycle 轴（A2 六值超集）。 */
export const LIFECYCLE_VALUES = [
  "PROPOSED",
  "CURRENT",
  "SUPERSEDED",
  "DEPRECATED",
  "RETIRED",
  "REJECTED",
] as const;
export type LifecycleValue = (typeof LIFECYCLE_VALUES)[number];

/** confidence 轴（PRD §18.2 四值不动）。 */
export const CONFIDENCE_VALUES = [
  "UNRESOLVED",
  "EXPERIMENTAL",
  "PROVISIONAL",
  "LOCKED",
] as const;
export type ConfidenceValue = (typeof CONFIDENCE_VALUES)[number];

/** evidence 轴（PRD 三值；realization 正交不入本轴，A3）。 */
export const EVIDENCE_VALUES = ["PLANNED", "IMPLEMENTED", "VERIFIED"] as const;
export type EvidenceValue = (typeof EVIDENCE_VALUES)[number];

/** change 轴。 */
export const CHANGE_VALUES = ["STABLE", "CHALLENGED", "MIGRATING"] as const;
export type ChangeValue = (typeof CHANGE_VALUES)[number];

/**
 * lifecycle 合法迁移矩阵（拓扑部分）。
 * x-vocab-source: vocab-lock state_axes.lifecycle.transitions。
 * 迁移前置条件的执行归 Kernel Transition 引擎（validateTransition/applyTransaction）：
 * - PROPOSED→CURRENT requires: authority_approval；
 * - CURRENT→SUPERSEDED|DEPRECATED requires: transition_record；
 * - SUPERSEDED 终态且 successor_ref 必填；RETIRED/REJECTED 终态；
 * - DEPRECATED→RETIRED 附加 grace_policy: config（宽限期策略键词形已随 PR-0009 在
 *   vocab-lock transitions 块转正登记——kernel GRACE_POLICY_CONFIG_EDGES 边集承载）。
 */
export const LIFECYCLE_TRANSITIONS = {
  PROPOSED: ["CURRENT", "REJECTED"],
  CURRENT: ["SUPERSEDED", "DEPRECATED"],
  SUPERSEDED: [],
  DEPRECATED: ["RETIRED"],
  RETIRED: [],
  REJECTED: [],
} as const satisfies Readonly<Record<LifecycleValue, readonly LifecycleValue[]>>;

// ============================================================
// orthogonal_fields（A3；x-vocab-source: vocab-lock orthogonal_fields）
// ============================================================

/** realization 正交三值（applies_to: contract_operation, capability；derivation: machine_preferred，D21）。 */
export const REALIZATION_VALUES = ["stub", "mock", "wired"] as const;
export type RealizationValue = (typeof REALIZATION_VALUES)[number];

// ============================================================
// source_types（x-vocab-source: vocab-lock source_types，2026-08-27 收编 02 信封；
// 2026-09-03 PR-0007 增值 owner_directive——Owner 明令（区别于 human_directive 泛化
// 人类指令），knowledge.web.browser.mcp_eyes 物料 sources[].type 实录收编，append-only）
// ============================================================

/** 来源全集（allowed ∪ forbidden = 10 值；PR-0007 起含 owner_directive）。 */
export const SOURCE_TYPE_ALL_VALUES = [
  "bp_blueprint",
  "design_seed",
  "human_directive",
  "owner_directive",
  "code_refactor",
  "prototype_walkthrough",
  "prototype_html_scrape",
  "research_evidence",
  "openapi_contract",
  "ai_invention",
] as const;
export type SourceTypeAllValue = (typeof SOURCE_TYPE_ALL_VALUES)[number];

/** 合法来源（8 值；PR-0007 增值 owner_directive）。 */
export const SOURCE_TYPE_ALLOWED_VALUES = [
  "bp_blueprint",
  "design_seed",
  "human_directive",
  "owner_directive",
  "code_refactor",
  "prototype_walkthrough",
  "research_evidence",
  "openapi_contract",
] as const;
export type SourceTypeAllowedValue = (typeof SOURCE_TYPE_ALLOWED_VALUES)[number];

/** forbidden 两值：schema 只保证可判别、不硬拦；Transition/Gate 层判 FATAL 并留痕。 */
export const SOURCE_TYPE_FORBIDDEN_VALUES = [
  "prototype_html_scrape",
  "ai_invention",
] as const;
export type SourceTypeForbiddenValue = (typeof SOURCE_TYPE_FORBIDDEN_VALUES)[number];

/** 供字段约束使用的全集类型。 */
export type SourceTypeValue = SourceTypeAllValue;

// ============================================================
// keybinding_axes（x-vocab-source: vocab-lock keybinding_axes，D15/A7）
// ============================================================

/** 绑定类（A7 三类最小集；类-前缀耦合见 04-keybinding allOf）。 */
export const BINDING_CLASS_VALUES = [
  "page_to_dir",
  "contract_operation_to_operationId",
  "capability_to_file",
] as const;
export type BindingClassValue = (typeof BINDING_CLASS_VALUES)[number];

/** 绑定可信度三态。 */
export const BINDING_STATUS_VALUES = ["confirmed", "derived", "stale"] as const;
export type BindingStatusValue = (typeof BINDING_STATUS_VALUES)[number];

/** 探针结论四值（gate 判卷必须重扫，永不采信自报 result，C5）。 */
export const PROBE_RESULT_VALUES = [
  "matched",
  "mismatched",
  "unreachable",
  "not_probed",
] as const;
export type ProbeResultValue = (typeof PROBE_RESULT_VALUES)[number];

// ============================================================
// id_namespace（x-vocab-source: vocab-lock id_namespace，A5 closed-world）
// ============================================================

/**
 * 前缀闭包 v0（16 前缀——PR-0008（2026-09-04，vNext Batch 2 R1）append-only 增补 SPEC.；
 * 未登记前缀=解析即 FATAL；扩展走词汇表 PR）。
 * PR-0001 注记（vocab-lock id_namespace.state_plane_refs）：`PERMIT.<BASE>.<SEQ>` 是状态面
 * 台账键词形（state/permits.json 内部台账；A8 同族不入 truth-index），**不是 governed 前缀**
 * ——不入本闭包、不过 parseGovernedId，解析归台账存在性 + 显式四态 outcome（kernel permits.ts
 * 模板字面量承载，此处登记的是事实不是新约束）。
 */
export const GOVERNED_ID_PREFIXES = [
  "PAGE",
  "CAPABILITY",
  "COMPONENT",
  "API_REQ",
  "ERR",
  "FIELD",
  "KNOWLEDGE",
  "CHANGE",
  "TASK",
  "DENOMINATOR",
  "KEYBINDING",
  "POLICY",
  "PROFILE",
  "AUTHORITY",
  "TEST",
  // vocab-pr-0008 增补（append-only；vNext Batch 2 R1 / Owner 裁定 D6 2026-09-04）：
  // SPEC. = Evidence Spec 一等对象（要求面——「需要什么证明」，PRD vNext §9.2 四概念）。
  // 裁定留痕（prd R1「入闭包或新前缀，留痕理由」）：15 前缀无语义适配位（TASK. 是工作
  // 单元非要求面；POLICY. 是强约束载体非证明要求；KNOWLEDGE. 恒 ADVISORY——Spec 是
  // AUTHORITATIVE 要求面），故增前缀入闭包（词表管辖「留痕或入锁」纪律的入锁形态：
  // 三镜像同步 = 本文件 + vocab-lock.draft.yaml prefixes_v0 + 07 id_prefix/object_id
  // pattern + kernel family.ts PREFIX_FAMILY_MAP 同批补映射 SPEC→EVIDENCE）。
  "SPEC",
] as const;
export type GovernedIdPrefix = (typeof GOVERNED_ID_PREFIXES)[number];

/**
 * 别名双向链 v0（A6 rename-on-ingest；v0.1 五族「只减不增」，v0.2 起 PR-0001 增补为
 * 八族 append-only——不可删改语义）。note 字段留 yaml 侧逐字镜像（vocab-lock aliases_v0 注记）；
 * 数字段收编加字母前缀规则（TASK-0087→TASK.T0087、CHANGE-0104→CHANGE.C0104，
 * SEGMENT 不允许数字开头）由 Kernel resolveAlias/rename-on-ingest 映射器内置（02b 文法注记）。
 * PR-0001 三新族（MIG-B1 源侧跟踪 id 收编）的机械映射归 kernel id.ts：
 * ISSUE.* 登记前缀点段剥离不带入 canonical + 段内连字符→下划线 greedy 打包（32 字符
 * SEGMENT 上限，段界可为打包伪迹）+ 末尾纯数字段→SEQ；FTA-* / FB-* 标记词并入首段；
 * 机械映射权威=corpus/master/batch-1/tools/ingest_change_governance.py pack_segments。
 */
export const ALIASES_V0 = [
  { legacy: "KB-*", canonical: "KNOWLEDGE.*" },
  { legacy: "GRID.*", canonical: "CAPABILITY.GRID.*" },
  { legacy: "PAGE-TASK-STEP-*", canonical: "PAGE.*" },
  { legacy: "TASK-*", canonical: "TASK.*" },
  { legacy: "CHANGE-*", canonical: "CHANGE.*" },
  { legacy: "ISSUE.*", canonical: "CHANGE.*" },
  { legacy: "FTA-*", canonical: "CHANGE.FTA_*" },
  { legacy: "FB-*", canonical: "CHANGE.FB_*" },
] as const;

// ============================================================
// kinds_registry（x-vocab-source: vocab-lock kinds_registry）
// ============================================================

/** truth 正文 kind 十类（信封层 kind 字段闭包）。 */
export const TRUTH_BODY_KINDS = [
  "capability",
  "component",
  "contract_operation",
  "error_term",
  "field_definition",
  "page_surface",
  "knowledge_entry",
  "business_rule",
  "change_object",
  "task_object",
] as const;
export type TruthBodyKind = (typeof TRUTH_BODY_KINDS)[number];

/**
 * 控制面内联对象（住 truth-index.json 内部，不产生正文文件）：
 * denominators[]（版本化数组，successor_of 链）、producers[]（注册+活性快照）。
 * forbidden_in_index（A8）：gate_results → evidence/runs/、claims → evidence/claims/。
 * PR-0001 catalog_note（V1/V2 落法 b 裁决）：catalog/ 条目（catalog-lock 管辖面）不是 02
 * 信封实例，其 kind 字段（policy / gate_recipe 等）是目录分类标签，不受 truth_bodies 闭包
 * 管辖，词形登记于 vocab-lock catalog_layer_vocab 段；truth 正文规范性条款按 MIG-B1 §3
 * 先例走 business_rule，门禁定义锚词形归 03 schema gate_def。
 */

// ============================================================
// catalog_layer_vocab（x-vocab-source: vocab-lock catalog_layer_vocab，PR-0001 收编）
// catalog/ 目录条目词轴：catalog-lock 管辖面，非 truth 信封枚举；扩值走词汇表 PR。
// ============================================================

/** 条目强制力三值（V5；60 条物化条目全携带）。 */
export const CATALOG_ENFORCEMENT_VALUES = [
  "required_when_applicable",
  "advisory",
  "deterministic_where_possible",
] as const;
export type CatalogEnforcementValue = (typeof CATALOG_ENFORCEMENT_VALUES)[number];

/** §93.4 十二分类（V6 甄选结论词表；DEPRECATED/DUPLICATE/REJECTED 与 lifecycle 轴正交，禁混用）。 */
export const CATALOG_CLASSIFICATION_VALUES = [
  "CONSTITUTION",
  "UNIVERSAL_POLICY",
  "LANE_POLICY",
  "TECHNOLOGY_PROFILE",
  "PROJECT_BASELINE_TEMPLATE",
  "CONTRACT_TEMPLATE",
  "GATE_RECIPE",
  "KNOWLEDGE_PATTERN",
  "FAILURE_PATTERN",
  "DEPRECATED",
  "DUPLICATE",
  "REJECTED",
] as const;
export type CatalogClassificationValue = (typeof CATALOG_CLASSIFICATION_VALUES)[number];

/** applies_when.lane 最小闭包（V7；architect/designer/documenter 未成 catalog 词形，有条目采用时扩值走词汇表 PR）。 */
export const CATALOG_LANE_VALUES = ["any", "frontend", "backend"] as const;
export type CatalogLaneValue = (typeof CATALOG_LANE_VALUES)[number];

/**
 * applies_when.change_classes 词轴（x-vocab-source: vocab-lock catalog_layer_vocab.change_classes，
 * PR-0005 收编；Owner 裁决 8 ② 2026-09-01「首批 3-5 值最小闭包，逐例对 corpus 实测词面」；
 * PRD v0.5.2 §5.2 Structured Applicability 示例词形 API_EVOLUTION 逐字）。与 CATALOG_LANE_VALUES
 * 正交：lane 管角色域，change_classes 管变更类目（PRD §5.3 确定性包含管线的第三层输入）。
 */
export const CATALOG_CHANGE_CLASS_VALUES = [
  "API_EVOLUTION",
  "PUBLIC_CONTRACT_CHANGE",
  "DEPENDENCY_CHANGE",
  "PRESENTATION_CHANGE",
] as const;
export type CatalogChangeClassValue = (typeof CATALOG_CHANGE_CLASS_VALUES)[number];

/**
 * applies_when.governance_profiles 词轴（x-vocab-source: vocab-lock
 * catalog_layer_vocab.governance_profiles，PR-0005 收编；Owner 裁决 8 ② 2026-09-01
 * 「对齐 TRIAGE_PROFILES+STRICT，消 STANDARD 两义」）。前三值与 CLI triage
 * TRIAGE_PROFILES（packages/cli/src/triage.ts）同词形同义；STRICT 对位 constitutional 档
 * （catalog-profile-anchor 词形先例）；PRD §5.2 示例值 CRITICAL 不入（另立第二套 profile
 * 词表 = 变相第二套轴，违四克制——R4 消解裁定）。
 */
export const CATALOG_GOVERNANCE_PROFILE_VALUES = [
  "MINIMAL",
  "LIGHT",
  "STANDARD",
  "STRICT",
] as const;
export type CatalogGovernanceProfileValue =
  (typeof CATALOG_GOVERNANCE_PROFILE_VALUES)[number];

// ============================================================
// presentation_axes（x-vocab-source: vocab-lock presentation_axes，PR-0001 收编）
// kernel/CLI 报告局部词：非治理事实枚举，不进七态 verdict 闭包；扩值走词汇表 PR。
// ============================================================

/**
 * reconcile changed_objects[].kind 四值（⑥拍）。
 * content_drift 一词二用（登记即为此歧义的成文收编）：kind 词=「四轴未变而有 delta 的行」；
 * 同行 content_drift 字段=三态判定（true/false/null，null=显式未知不冒充无漂移）。
 * 机器按字段位判别；axes_change 定义要求四轴任一 from≠to，content_drift 行不得冒用 axes_change。
 */
export const RECONCILE_DELTA_KINDS = [
  "axes_change",
  "materialized",
  "vanished",
  "content_drift",
] as const;

/**
 * reconcile exceptions[] 判别词（⑥拍）：row 级正文探测失配（只读只报不拦写，D24）；
 * 证据条目（runs/claims）无 kind 字段，本词形是例外段唯一判别词形。
 */
export const RECONCILE_EXCEPTION_KINDS = ["content_tamper"] as const;

// ============================================================
// 运行语义词轴（x-vocab-source: vocab-lock runtime_semantics_axes，PR-0009 收编；
// 原「词表外局部枚举」待收编段就此转正——词形已在 schema 01/02/03/05/06/07 的
// x-vocab-extra / definitions 冻结，PR-0009 统一入锁，本文件逐值镜像）。
// 扩值必须走词汇表 PR，禁止就地添加。
// ============================================================

/** gate verdict 七态超集（x-vocab-source: 03-gate-result definitions.verdict 候选冻结来源；C1 四态必答位=前四者）。 */
export const VERDICT_VALUES = [
  "passed",
  "failed",
  "warning",
  "blocked",
  "not_run",
  "not_configured",
  "skipped_blindspot",
] as const;
export type VerdictValue = (typeof VERDICT_VALUES)[number];

/** 对象来源（x-vocab-source: 01/02 x-vocab-extra.origin；human_curated→natural、migrated→ingested 收编映射）。 */
export const ORIGIN_VALUES = ["natural", "derived", "ingested"] as const;
export type OriginValue = (typeof ORIGIN_VALUES)[number];

/** 写策略（x-vocab-source: 02 WritePolicyValue，thread-A §3.4）。 */
export const WRITE_POLICY_VALUES = [
  "NONE",
  "AGENT_WITH_PERMIT",
  "CORRECTION_ONLY",
  "EVOLUTION_CHANNEL",
] as const;
export type WritePolicyValue = (typeof WRITE_POLICY_VALUES)[number];

/** 匹配规则（x-vocab-source: 02 MatchRuleValue，thread-A §3.2；manual_confirmed 占比=机器键债务指标）。 */
export const MATCH_RULE_VALUES = ["mechanical", "manual_confirmed"] as const;
export type MatchRuleValue = (typeof MATCH_RULE_VALUES)[number];

/** claim/verification 判卷四值（x-vocab-source: 02/07 verification_verdict，thread-A §5）。 */
export const VERIFICATION_VERDICT_VALUES = [
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNVERIFIED",
  "REJECTED",
] as const;
export type VerificationVerdictValue = (typeof VERIFICATION_VERDICT_VALUES)[number];

/** producer 活性三态（x-vocab-source: 06 liveness.status；suspect_stale→stale、dead_view→dead 已收敛）。 */
export const LIVENESS_STATUS_VALUES = ["active", "stale", "dead"] as const;
export type LivenessStatusValue = (typeof LIVENESS_STATUS_VALUES)[number];

/** producer 来源（x-vocab-source: 06 producer_kind）。 */
export const PRODUCER_KIND_VALUES = ["builtin", "project"] as const;
export type ProducerKindValue = (typeof PRODUCER_KIND_VALUES)[number];

/** 行为主体类型（structural，x-vocab-source: 03/07 actor.actor_type，非 vocab-lock 管辖）。 */
export const ACTOR_TYPE_VALUES = ["agent", "human", "tool", "kernel"] as const;
export type ActorTypeValue = (typeof ACTOR_TYPE_VALUES)[number];

/** gate 运行触发方式（structural，x-vocab-source: 03/07 run_trigger.type；扩值须同步 Kernel GateRunner）。 */
export const RUN_TRIGGER_VALUES = [
  "pre_closeout",
  "pre_commit",
  "post_edit",
  "on_demand",
  "scheduled",
] as const;
export type RunTriggerValue = (typeof RUN_TRIGGER_VALUES)[number];

/** 分母生命周期（x-vocab-source: 05 denominator_status，vocab lifecycle 的 kind 级收窄子集，只禁不扩；封死 DEPRECATED/RETIRED/REJECTED）。 */
export const DENOMINATOR_STATUS_VALUES = [
  "PROPOSED",
  "CURRENT",
  "SUPERSEDED",
] as const;
export type DenominatorStatusValue = (typeof DENOMINATOR_STATUS_VALUES)[number];

// ============================================================
// P18 Discovery 词轴（x-vocab-source: vocab-lock discovery_vocab，PR-0009 收编；
// 08/09/10 schema definitions 冻结来源；PRD v0.4 §80.3/§81/§82 原文词形，逐字）。
// Discovery 状态链是**新状态面**（Discovery 讨论生命周期），不混入既有对象轴
// state_axes.lifecycle（该轴 FROZEN 且值域不相交）；PR-0009 入锁后以 vocab-lock
// 为准逐值镜像，扩值走词汇表 PR。
// ============================================================

/**
 * Discovery 状态链（PRD §80.3 原文词形逐字：IDEA → DISCOVERY → READY_TO_PROMOTE
 * → CHANGE/TASK）。x-vocab-source: 08-discovery-state-chain definitions.discovery_state。
 */
export const DISCOVERY_CHAIN_VALUES = [
  "IDEA",
  "DISCOVERY",
  "READY_TO_PROMOTE",
  "CHANGE",
  "TASK",
] as const;
export type DiscoveryChainValue = (typeof DISCOVERY_CHAIN_VALUES)[number];

/**
 * Discovery 状态链合法迁移矩阵（拓扑部分；与 08 x-pomaster-transition-matrix 逐值同源）。
 * 执行面住 kernel discovery-chain（validateDiscoveryTransition）：矩阵外转移一律显式拒绝
 * （fail-closed，跳步/倒退均不在矩阵）；提升（READY_TO_PROMOTE→CHANGE/TASK）前置条件
 * promotion_basis 见 DISCOVERY_PROMOTION_BASIS_VALUES，写入走 P11 maintain 面。
 * x-vocab-source: 08-discovery-state-chain x-pomaster-transition-matrix。
 */
export const DISCOVERY_CHAIN_TRANSITIONS = {
  IDEA: ["DISCOVERY"],
  DISCOVERY: ["READY_TO_PROMOTE"],
  READY_TO_PROMOTE: ["CHANGE", "TASK"],
  CHANGE: [],
  TASK: [],
} as const satisfies Readonly<
  Record<DiscoveryChainValue, readonly DiscoveryChainValue[]>
>;

/**
 * Discovery 晋升依据（PRD §80.3 四条晋升条件的词形化，任一满足即合法晋升）：
 * user_explicit_request=用户明确要求推进开发 / msd_reached=Goal/Scope/Acceptance 已达
 * Minimum Sufficient Definition（判据面 09 msd_assessment）/ needs_formal_resources=
 * 需要正式 Research/Architecture/Governance 资源 / needs_cross_session_tracking=
 * 需要跨 Session 持续追踪。
 * x-vocab-source: 08-discovery-state-chain definitions.promotion_basis。
 */
export const DISCOVERY_PROMOTION_BASIS_VALUES = [
  "user_explicit_request",
  "msd_reached",
  "needs_formal_resources",
  "needs_cross_session_tracking",
] as const;
export type DiscoveryPromotionBasisValue =
  (typeof DISCOVERY_PROMOTION_BASIS_VALUES)[number];

/**
 * Unknown 分类十分类（PRD §82.2 逐字；禁止统一使用 UNRESOLVED/BLOCKER——裸词形
 * UNRESOLVED/BLOCKER 不在枚举。与 state_axes.confidence 的 UNRESOLVED 正交：
 * confidence 轴管治理对象置信度，本轴管 Discovery 未决项分类）。
 * x-vocab-source: 09-msd-uncertainty definitions.unknown_classification。
 */
export const MSD_UNKNOWN_CLASSIFICATION_VALUES = [
  "BLOCKER_CANDIDATE",
  "HARD_BLOCKER",
  "SOFT_UNCERTAINTY",
  "ASSUMPTION",
  "DEFERRED_DECISION",
  "DISCOVERY_REQUIRED",
  "SUSPECTED_ISSUE",
  "NON_BLOCKING_GAP",
  "FUTURE_CONSIDERATION",
  "OUT_OF_SCOPE",
] as const;
export type MsdUnknownClassificationValue =
  (typeof MSD_UNKNOWN_CLASSIFICATION_VALUES)[number];

/** 假设风险三级（PRD §82.4 逐字；HIGH 默认需要 Authority）。x-vocab-source: 09 assumptions_risk。 */
export const MSD_ASSUMPTION_RISK_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;
export type MsdAssumptionRiskValue = (typeof MSD_ASSUMPTION_RISK_VALUES)[number];

/** Blueprint Acceptance Envelope 四态（PRD §82.5 逐字；CONDITIONALLY_ACCEPTED 是合法状态，要求 HARD_BLOCKER=0）。x-vocab-source: 09 blueprint_envelope_status。 */
export const BLUEPRINT_ENVELOPE_STATUS_VALUES = [
  "ACCEPTED",
  "CONDITIONALLY_ACCEPTED",
  "BLOCKED",
  "REJECTED",
] as const;
export type BlueprintEnvelopeStatusValue =
  (typeof BLUEPRINT_ENVELOPE_STATUS_VALUES)[number];

/** Research Finding 置信三级（PRD §81.4 finding 逐键；与 state_axes.confidence 正交，不入对象轴）。x-vocab-source: 10 confidence。 */
export const RESEARCH_FINDING_CONFIDENCE_VALUES = [
  "HIGH",
  "MEDIUM",
  "LOW",
] as const;
export type ResearchFindingConfidenceValue =
  (typeof RESEARCH_FINDING_CONFIDENCE_VALUES)[number];

/** Evidence 五级（PRD §81.4 逐字；IMPLEMENTATION 证明「存在」不自动证明「正确」，§81.5）。x-vocab-source: 10 evidence_level。 */
export const RESEARCH_EVIDENCE_LEVEL_VALUES = [
  "AUTHORITATIVE",
  "PRIMARY",
  "IMPLEMENTATION",
  "SECONDARY",
  "INFERENCE",
] as const;
export type ResearchEvidenceLevelValue =
  (typeof RESEARCH_EVIDENCE_LEVEL_VALUES)[number];

/** authority_effect 三值（PRD §81.4 finding 逐键；CONFLICTS 是发现不是裁决——上报走正式治理面）。x-vocab-source: 10 authority_effect。 */
export const RESEARCH_AUTHORITY_EFFECT_VALUES = [
  "NONE",
  "SUPPORTS",
  "CONFLICTS",
] as const;
export type ResearchAuthorityEffectValue =
  (typeof RESEARCH_AUTHORITY_EFFECT_VALUES)[number];

/**
 * Research 六模式全量镜像（PRD §81.2 逐字；本版 Research Artifact 层无 mode 字段消费，
 * 保留为后续命令面消费位——对齐 05 lifecycle_full_mirror「全量镜像」模式）。
 * x-vocab-source: 10-research-artifact definitions.research_mode_full。
 */
export const RESEARCH_MODE_VALUES = [
  "INTERNAL",
  "EXTERNAL",
  "MIXED",
  "COMPARATIVE",
  "IMPACT",
  "FORENSIC",
] as const;
export type ResearchModeValue = (typeof RESEARCH_MODE_VALUES)[number];

/**
 * Exception Ledger 分类五值（PRD §49.2「至少分类」逐字语义，词形大写化对齐
 * §91.3 原文词形：ASSUMPTION / OPEN_QUESTION / DEFERRED / CONFLICT / HARD_BLOCKER；
 * 「Deferred Decision」取 §82.2 DEFERRED_DECISION 同词形先例）。与 §82.2 Discovery
 * Unknown 十分类正交（那是 Discovery 未决项分类面；本轴管 Exception Ledger 登记面，
 * P19 投影视图按 §91.3 消费：CONFLICT/HARD_BLOCKER = 高显著度异常区块，其余三类
 * 聚合到对应章节）。x-vocab-source: PRD v0.4 §49.2/§91.3；schema 落点
 * 11-exception-ledger definitions.exception_classification；
 * vocab-lock discovery_vocab.exception_classification（PR-0009 收编）。
 */
export const EXCEPTION_CLASSIFICATION_VALUES = [
  "ASSUMPTION",
  "OPEN_QUESTION",
  "DEFERRED_DECISION",
  "CONFLICT",
  "HARD_BLOCKER",
] as const;
export type ExceptionClassificationValue =
  (typeof EXCEPTION_CLASSIFICATION_VALUES)[number];

// ============================================================
// P28 Knowledge 词轴（x-vocab-source: vocab-lock knowledge_vocab，PR-0009 收编；
// PRD v0.4 §83 原文词形，逐字）。Knowledge 是 §83 独立平面（ADVISORY 策展源，
// 永不进 gate 判卷输入——§83.2 铁律 / GOLDEN-L8-3 锚）。schema 落点
// 12-knowledge-entry definitions（x-pomaster-transition-matrix/-requirements 与本段
// KNOWLEDGE_TRANSITIONS 逐值同源）。扩值走词汇表 PR。
// ============================================================

/**
 * Knowledge 四类型（PRD §83.3 原文词形逐字）。案例身份锚：§83.5 组件边框被遮挡 =
 * DIAGNOSTIC_PLAYBOOK；§83.6 CSV naïve split = FAILURE_PATTERN；§83.7
 * 文字/图标/文字+图标按钮 = DECISION_HEURISTIC。
 * x-vocab-source: 12-knowledge-entry definitions.knowledge_kind。
 */
export const KNOWLEDGE_KIND_VALUES = [
  "ENGINEERING_PATTERN",
  "FAILURE_PATTERN",
  "DIAGNOSTIC_PLAYBOOK",
  "DECISION_HEURISTIC",
] as const;
export type KnowledgeKindValue = (typeof KNOWLEDGE_KIND_VALUES)[number];

/**
 * Knowledge 生命周期（PRD §83.9 原文词形逐字五状态）。登记起点恒 CANDIDATE
 * （§25.3 Knowledge Curator「生成 Knowledge Candidate」）；DEPRECATED/REJECTED 终态。
 * x-vocab-source: 12-knowledge-entry definitions.knowledge_status。
 */
export const KNOWLEDGE_STATUS_VALUES = [
  "CANDIDATE",
  "VALIDATED",
  "PROMOTED",
  "DEPRECATED",
  "REJECTED",
] as const;
export type KnowledgeStatusValue = (typeof KNOWLEDGE_STATUS_VALUES)[number];

/**
 * Knowledge 生命周期合法迁移矩阵（拓扑部分；与 12 x-pomaster-transition-matrix
 * 逐值同源）。执行面住 kernel knowledge（validateKnowledgeTransition）：矩阵外
 * 转移一律显式拒绝（fail-closed）；唯一权威边 VALIDATED→PROMOTED requires
 * ["promotion_authority"]（§25.3「晋升必须经过 Maintain / Authority / Gatekeeper」+
 * §83.10「只有 Promotion 完成后，才可成为强约束」），唯一通路 promoteKnowledge；
 * PROMOTED→DEPRECATED = §83.11 去僵化（被推翻的提升经验显式淘汰，禁静默滞留）。
 * x-vocab-source: 12-knowledge-entry definitions.knowledge_status
 * x-pomaster-transition-matrix。
 */
export const KNOWLEDGE_TRANSITIONS = {
  CANDIDATE: ["VALIDATED", "REJECTED"],
  VALIDATED: ["PROMOTED", "DEPRECATED"],
  PROMOTED: ["DEPRECATED"],
  DEPRECATED: [],
  REJECTED: [],
} as const satisfies Readonly<
  Record<KnowledgeStatusValue, readonly KnowledgeStatusValue[]>
>;

/**
 * Knowledge 提升权威位（PRD §25.3/§83.10 原文角色词形大写化：Maintain /
 * Authority / Gatekeeper——§91.3 词形大写化先例）。§25.3 Knowledge Curator 逐字：
 * 「不得直接把经验升级为 Spec/Truth；晋升必须经过 Maintain / Authority / Gatekeeper」；
 * §25.5 ⑦「Knowledge Curator 把一次偶发修复直接晋升为 MUST」= 禁止模式（Curator
 * 词形不在本闭包，promote 词形闸显式拒绝）。kernel 不判申报真（C5 自报），词形闸 +
 * authorityRef 审批引用留痕；真伪归 journal 留痕 + Authority 裁决审计。
 * x-vocab-source: PRD v0.4 §25.3/§83.10。
 */
export const KNOWLEDGE_PROMOTION_AUTHORITY_VALUES = [
  "MAINTAIN",
  "AUTHORITY",
  "GATEKEEPER",
] as const;
export type KnowledgePromotionAuthorityValue =
  (typeof KNOWLEDGE_PROMOTION_AUTHORITY_VALUES)[number];

/**
 * Context 分区词形（PRD §83.8 原文 [AUTHORITATIVE]/[ADVISORY] 逐字；knowledge
 * 条目恒 ADVISORY——§83.2 Authority 隔离表权威性 NO，schema authority 字段 const
 * 封闭，AUTHORITATIVE 分区只承载 Current Truth / Architecture / Contract / Policy）。
 * 与 RESEARCH_EVIDENCE_LEVEL_VALUES（§81.4 evidence level 轴，值域部分重叠）和
 * CATALOG_ENFORCEMENT_VALUES（catalog 强制力轴，小写 advisory）轴正交、值域不相交混用。
 * x-vocab-source: 12-knowledge-entry definitions.knowledge_entry.properties.authority。
 */
export const CONTEXT_AUTHORITY_PARTITION_VALUES = [
  "AUTHORITATIVE",
  "ADVISORY",
] as const;
export type ContextAuthorityPartitionValue =
  (typeof CONTEXT_AUTHORITY_PARTITION_VALUES)[number];

/**
 * Knowledge 置信三级（§83.4 例文 confidence: HIGH；全集取 §81.4 Research Finding
 * 置信三级同词形——知识候选上游是 Research 产物 P18，词形复用不发明新值）。
 * 与 state_axes.confidence（UNRESOLVED/EXPERIMENTAL/PROVISIONAL/LOCKED）值域不相交。
 * x-vocab-source: 12-knowledge-entry definitions.knowledge_confidence。
 */
export const KNOWLEDGE_CONFIDENCE_VALUES = [
  "HIGH",
  "MEDIUM",
  "LOW",
] as const;
export type KnowledgeConfidenceValue = (typeof KNOWLEDGE_CONFIDENCE_VALUES)[number];

// ============================================================
// P20 D 线地基词轴（x-vocab-source: vocab-lock execution_identity_vocab，PR-0009 收编；
// PRD v0.4 §25.4 Agent Execution Identity + research/design-thread-D-solo-form.md
// §1.2/§1.3/§2.1/§3.3.1/§4 原文词形）。Execution Identity / session / lock 是 D 线
// 自有 P0 状态面（wave3-plan.md P20 范围锚「D 线 §7 ①②」），与既有对象轴
// state_axes 正交、值域不相交。AGX-n 执行编号与 session_key / lock_id 同 GRN-n/
// CLM-n/EXC-n 先例：状态/证据面通路编号词形，非 governed 前缀，不入
// id_namespace 闭包。扩值走词汇表 PR。
// ============================================================

/**
 * 执行载体（D 线 §2.1 必填枚举 逐字：`claude-code` / `codex` / `script`——区分执行
 * 载体；后台脚本在 audit 中单列）。PRD §25.4 例文 runtime: claude-code 同源。
 */
export const EXECUTION_RUNTIME_VALUES = [
  "claude-code",
  "codex",
  "script",
] as const;
export type ExecutionRuntimeValue = (typeof EXECUTION_RUNTIME_VALUES)[number];

/**
 * 身份种类（D 线 §2.1 新增必填 逐字：`interactive` / `subagent` / `script`——
 * 后台脚本文凭上是二等公民，audit 里要能单独过滤）。
 */
export const EXECUTION_IDENTITY_KIND_VALUES = [
  "interactive",
  "subagent",
  "script",
] as const;
export type ExecutionIdentityKindValue =
  (typeof EXECUTION_IDENTITY_KIND_VALUES)[number];

/**
 * P0 执行角色标签六值（D 线 §4 roles_vocabulary_p0 逐字；配置可扩展，非内置人格）：
 * research 是唯一内置 sub-role（read-only contract）；PRD §25.3 十二角色（SUPervisor/
 * IMPLEMENTER…大写词形）属 P1 Capability Pool 词汇层（wave3-plan.md P21 范围锚），
 * 与本轴分层不相交。PRD §25.4 例文 role: IMPLEMENTER 为 yaml 示意，词形以 D 线
 * 词汇表为准。
 */
export const EXECUTION_ROLE_VALUES = [
  "owner",
  "orchestrator",
  "research",
  "implementer",
  "qa",
  "script",
] as const;
export type ExecutionRoleValue = (typeof EXECUTION_ROLE_VALUES)[number];

/**
 * 锁三粒度（D 线 §3.3.1「锁的三粒度」表 逐字：change 锁=单驱动者强排他 /
 * task 锁=多读单写意图登记 / unit 锁=Governed Code Unit 写写互斥读写共享；
 * 锁文件名词形 `change-<CHG-ID>.lock` / `task-<TASK-ID>.lock` / `unit-<key-hash>.lock`）。
 * D 线 §3.3.1 例文 lock_type: "unit_write" 为 unit 锁的原文类型词形（change/task
 * 锁该字段原文未给词形，留 null 不发明）。
 */
export const LOCK_KIND_VALUES = ["change", "task", "unit"] as const;
export type LockKindValue = (typeof LOCK_KIND_VALUES)[number];

// ============================================================
// P21 Capability Pool 词轴（x-vocab-source: vocab-lock execution_identity_vocab，
// PR-0009 收编；PRD v0.4 §25.3 十二角色标题词形 + §25.2 池选图短词形 + §24 Handoff
// 例文 from: IMPLEMENTER / to: CLEANER + §25.4 role: IMPLEMENTER yaml 词形）。
// Capability Pool 是 P1 capability 面（wave3-plan.md P21 范围锚；R2 重分类裁定
// 「P0=地基，P1=池」——docs/wave3-p20-r2-reclassification.md）。与 P0 六值
// EXECUTION_ROLE_VALUES 分层不相交（该轴注记同源预告）：P0 轴是执行身份档案的
// 小写角色标签（配置可扩展、非内置人格），本轴是 §25.3 池角色的机器词形。
// solo 默认运行形态不变（§25.2 MINIMAL→主 Harness 直接执行 = D 线 §1.1 SOLO-DIRECT
// 的 PRD 内生依据）：本词轴是 capability 面，不触发池时零消费。
// ============================================================

/**
 * §25.3 十二角色机器词形（SCREAMING_SNAKE）。词形裁定（decisions，P21-Contract，
 * 落档 docs/wave3-p20-sec79-backfill-44-8.md P21 注记）：不走 §25.3 标题的盲目
 * 机械映射，逐值取 PRD 已给出的词形锚——
 * - IMPLEMENTER / CLEANER：§24 Handoff 例文 `from: IMPLEMENTER` / `to: CLEANER`
 *   与 §25.4 `role: IMPLEMENTER` yaml 大写词形逐字（§25.2 Implementer/Cleaner 同形）；
 * - BRAINSTORM / RESEARCH / ARCHITECT / GATEKEEPER / STRENGTHENER / QA：
 *   §25.2 池选图短词形大写化（「Brainstorm/Research（按需）」「Architect +
 *   Implementer + Cleaner + Strengthener + QA」「Gatekeeper/QA」；D 线 §5
 *   DEF-GATEKEEPER 同款短词形）；
 * - SUPERVISOR / GOVERNANCE_WRITER / RECONCILIATION / KNOWLEDGE_CURATOR：
 *   §25.3 标题机械映射（PRD 无更短词形锚，不发明缩写）。
 * §25.3 标题词形（Brainstorm Agent / Implementation Agent / Governance Gatekeeper
 * 等十二标题）另行逐字镜像于 AGENT_ROLE_POOL_PRD_HEADINGS——一词二形成文收编
 * （content_drift 先例：登记歧义而非消歧；IMPLEMENTER 标题词形为 Implementation
 * Agent、GATEKEEPER 标题词形为 Governance Gatekeeper，机器词形与标题词形按各自
 * 锚各自成立）。
 */
export const AGENT_ROLE_POOL_VALUES = [
  "SUPERVISOR",
  "BRAINSTORM",
  "RESEARCH",
  "ARCHITECT",
  "GOVERNANCE_WRITER",
  "GATEKEEPER",
  "IMPLEMENTER",
  "CLEANER",
  "STRENGTHENER",
  "QA",
  "RECONCILIATION",
  "KNOWLEDGE_CURATOR",
] as const;
export type AgentRolePoolValue = (typeof AGENT_ROLE_POOL_VALUES)[number];

/** §25.3 十二标题词形逐字镜像（键=机器词形，值=PRD §25.3 标题原文）。 */
export const AGENT_ROLE_POOL_PRD_HEADINGS = {
  SUPERVISOR: "Supervisor",
  BRAINSTORM: "Brainstorm Agent",
  RESEARCH: "Research Agent",
  ARCHITECT: "Architect Agent",
  GOVERNANCE_WRITER: "Governance Writer",
  GATEKEEPER: "Governance Gatekeeper",
  IMPLEMENTER: "Implementation Agent",
  CLEANER: "Cleaner Agent",
  STRENGTHENER: "Strengthener Agent",
  QA: "QA Agent",
  RECONCILIATION: "Reconciliation Agent",
  KNOWLEDGE_CURATOR: "Knowledge Curator Agent",
} as const satisfies Readonly<Record<AgentRolePoolValue, string>>;

/**
 * 角色执行形态三值（§58 四条降级规则与 §25.2 solo 内生形态的机器词形）：
 * - direct：主 Harness 直接执行（§25.2 MINIMAL「甚至可由当前 Harness 主 Agent
 *   直接执行」逐字语义 + D 线 §1.1 SOLO-DIRECT）——不经池、零开销、零降级报告；
 * - sequential：§58「降级为 sequential roles」逐字（每角色先重编译上下文再执行）；
 * - parallel：§58 supportsParallel 探针成立时的真并发（禁伪装并发封条的唯一放行形）。
 */
export const RUNTIME_EXECUTION_MODE_VALUES = [
  "direct",
  "sequential",
  "parallel",
] as const;
export type RuntimeExecutionModeValue =
  (typeof RUNTIME_EXECUTION_MODE_VALUES)[number];

/**
 * §58 三探针的机器词形（supportsParallel / supportsToolPermissions /
 * supportsContextIsolation 方法名的 snake_case 机械映射；降级报告 rows 的
 * capability 判别词）。
 */
export const RUNTIME_CAPABILITY_VALUES = [
  "parallel",
  "tool_permissions",
  "context_isolation",
] as const;
export type RuntimeCapabilityValue = (typeof RUNTIME_CAPABILITY_VALUES)[number];

/**
 * §58 四条降级规则 id（四条 bullet 的 mechanical mirror，逐条一一对应）：
 * - sequential_fallback =「降级为 sequential roles」；
 * - context_recompile_per_role =「每一 Role 重新编译 Context」；
 * - no_concurrency_masquerade =「禁止伪装成真正并发」（契约层恒封死）；
 * - capability_degradation_report =「报告 Capability Degradation」。
 */
export const RUNTIME_DEGRADATION_RULE_IDS = [
  "sequential_fallback",
  "context_recompile_per_role",
  "no_concurrency_masquerade",
  "capability_degradation_report",
] as const;
export type RuntimeDegradationRuleId =
  (typeof RUNTIME_DEGRADATION_RULE_IDS)[number];

// ============================================================
// P31 跨域联结词形轴（x-vocab-source: vocab-lock equivalence_vocab，PR-0009 收编；
// docs/wave3-research-gaps.md §3 GRN-4402 产品需求转译原文词形，A13 / OPEN-M6-12）。
// schema 落点 13-equivalence-registry definitions（word_form_domain /
// equivalence_status 与本段逐值同源）。扩值走词汇表 PR。
// ============================================================

/**
 * 词形语言域标记六值（gaps §3 line 105「中文↔拼音↔缩写/压缩记法」逐字转译 +
 * 结构性必需位）：
 * - zh-formal：中文正式词形（gaps §3 L101「公式侧中文（密度/单价/夹紧力）」）；
 * - pinyin：拼音词形（gaps §3 L101「源 id 侧拼音（FIELD.MATERIAL-DB.MIDU）」）；
 * - abbrev：缩写记法（line 105「缩写」）；
 * - compressed：压缩记法（line 105「压缩记法」，如 数量(#5) / KPI#5 [RMB/pc.]——L102 页域散文词形）；
 * - canonical：governed id 词形（A6 canonical 既有词形 + L101「源 id 侧」结构性必需位；
 *   active 组的联结产物位，文本须过 governed id 文法）；
 * - unknown：机械入册不判域（禁启发式判域——判域即启发式；显式未知非猜测，
 *   域标记由 Authority 声明时补登）。
 * 与 MATCH_RULE_VALUES（02 匹配规则轴）/ CATALOG_CLASSIFICATION_VALUES（catalog 分类轴）
 * 正交、值域不相交混用。
 * x-vocab-source: 13-equivalence-registry definitions.word_form_domain。
 */
export const WORD_FORM_DOMAIN_VALUES = [
  "zh-formal",
  "pinyin",
  "abbrev",
  "compressed",
  "canonical",
  "unknown",
] as const;
export type WordFormDomainValue = (typeof WORD_FORM_DOMAIN_VALUES)[number];

/**
 * 等价组状态两值（gaps §3 line 103「只登记不裁决」+ line 105「未登记词形 pending 桶」
 * 词形）：active=已获显式声明（declared_by + declaration_ref + declared_at_seq 齐备，
 * 解析面唯一可命中状态）；pending=未获声明的候选组（机械入册等裁决，解析面永不命中——
 * 禁假绿）。两值封闭，无第三态（裁决走声明登记 + 重叠 pending 处置）。
 * x-vocab-source: 13-equivalence-registry definitions.equivalence_status。
 */
export const EQUIVALENCE_STATUS_VALUES = ["active", "pending"] as const;
export type EquivalenceStatusValue = (typeof EQUIVALENCE_STATUS_VALUES)[number];

// ============================================================
// P32 Portability Kernel 词形轴（x-vocab-source: vocab-lock portability_vocab，
// PR-0009 收编；PRD §85.2/§85.3/§84.6 逐字 + kernel fail-closed 纪律补位词）。
// §85.2/§85.3 的词形是 PRD 逐字承载（非本仓发明）；FAIL/NOT_RUN 两态是
// 「缺项=FAIL 或 NOT_RUN 显式，绝不静默绿」fail-closed 纪律的补位词
// （PRD §85.2 逐字只给 PASS），随本轴一并登记（原 TODO 呈报位就此闭合）。
// ============================================================

/**
 * §85.2 八项检查结果三态：PASS（§85.2 逐字）= 可机判通过；FAIL = 应存在而缺席/
 * 损坏/判违（缺项按语义应存在而缺席）；NOT_RUN = 环境性缺席（上游条件不成立无法
 * 执行检查本身）。三态显式呈现，禁止静默绿（fail-closed 纪律）。
 */
export const PORTABILITY_CHECK_STATUS_VALUES = ["PASS", "FAIL", "NOT_RUN"] as const;
export type PortabilityCheckStatusValue =
  (typeof PORTABILITY_CHECK_STATUS_VALUES)[number];

/** §85.3 required_canonical_sets 五族闭集（PRD 逐字；manifest 读侧校验 ⊇ 五族）。 */
export const PORTABILITY_CANONICAL_SET_VALUES = [
  "truth",
  "architecture",
  "decisions",
  "knowledge",
  "evidence",
] as const;
export type PortabilityCanonicalSetValue =
  (typeof PORTABILITY_CANONICAL_SET_VALUES)[number];

/** §85.3 required_runtime_rebuild 两项（PRD 逐字：可重建运行面闭集）。 */
export const PORTABILITY_RUNTIME_REBUILD_VALUES = [
  "contexts",
  "harness-bootstrap",
] as const;
export type PortabilityRuntimeRebuildValue =
  (typeof PORTABILITY_RUNTIME_REBUILD_VALUES)[number];

/** §85.3 forbidden_dependencies 两项（PRD 逐字：禁依赖闭集；命中检测 fail-closed）。 */
export const PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES = [
  "user-home-project-memory",
  "untracked-local-spec",
] as const;
export type PortabilityForbiddenDependencyValue =
  (typeof PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES)[number];

/** §84.6 Hidden Memory Drift 判定词形（PRD 逐字输出）。 */
export const MEMORY_DRIFT = "MEMORY_DRIFT" as const;

// ============================================================
// P33 Memory Harvest 台账管线词形轴（x-vocab-source: vocab-lock memory_harvest_vocab，
// PR-0009 收编；PRD §48.2/§48.4/§44.10 逐字 + thread-B §4 迁移设计词形
// （research/design-thread-B-migration.md）+ kernel fail-closed 纪律补位词）。
// schema 落点 14-memory-harvest definitions（与本段逐值同源）。扩值走词汇表 PR。
// ============================================================

/**
 * Memory Harvest 分桶（thread-B §4.1 四桶初筛表 + 两条特殊出口，词形逐字）：
 * - TRUTH：陈述现状基线值/规模/栈/权威指针；
 * - KNOWLEDGE：失败模式/诊断法/教训，不随 M6 失效；
 * - EPISODE：事件史/时间线/翻案过程；
 * - PREFERENCE：个人工作偏好；
 * - AUTHORITY_POLICY（特殊出口①）：type=feedback 且属用户明令——从
 *   PREFERENCE/TRUTH 中升格（升格须显式声明，kernel 侧 AUTHORITY_REQUIRED 闸）；
 * - INVALID_EXPIRED（特殊出口②）：被后续事实推翻（thread-B 表「INVALID/EXPIRED」
 *   的机器键 snake_case 词形）；
 * - UNCLASSIFIED_PENDING：机械判不了的第 refusal 位（禁模糊猜测——判不了显式
 *   unknown 落待分拣，confidence 恒 LOW；equivalence unknown 词形同源纪律）。
 * 与 MEMORY_CLASS_VALUES（PRD §48.2 七类长期记忆分类）分轴正交：桶是 harvest
 * 工作台初筛位，类是 promote 后的长期记忆归属位（映射表 MEMORY_CLASS_OF_BUCKET）。
 * x-vocab-source: thread-B §4.1 表逐字 + kernel UNCLASSIFIED_PENDING 补位词。
 */
export const HARVEST_BUCKET_VALUES = [
  "TRUTH",
  "KNOWLEDGE",
  "EPISODE",
  "PREFERENCE",
  "AUTHORITY_POLICY",
  "INVALID_EXPIRED",
  "UNCLASSIFIED_PENDING",
] as const;
export type HarvestBucketValue = (typeof HARVEST_BUCKET_VALUES)[number];

/** 四桶初筛位（thread-B §4.1 逐字四词形；特殊出口不在其列——出口是升格/淘汰位）。 */
export const HARVEST_PRIMARY_BUCKETS = [
  "TRUTH",
  "KNOWLEDGE",
  "EPISODE",
  "PREFERENCE",
] as const;
export type HarvestPrimaryBucket = (typeof HARVEST_PRIMARY_BUCKETS)[number];

/** 两条特殊出口（thread-B §4.1 表 ↑AUTHORITY_POLICY 与 INVALID/EXPIRED 行）。 */
export const HARVEST_SPECIAL_EXIT_VALUES = [
  "AUTHORITY_POLICY",
  "INVALID_EXPIRED",
] as const;
export type HarvestSpecialExitValue = (typeof HARVEST_SPECIAL_EXIT_VALUES)[number];

/**
 * PRD §48.2 七类长期记忆分类（七类闭集，§48.2 标题词形大写化——§91.3 词形
 * 大写化先例）：Truth / Experience Memory(Knowledge) / Episode / Decision /
 * Evidence / User / Harness Runtime。桶→类映射见 MEMORY_CLASS_OF_BUCKET。
 * x-vocab-source: PRD v0.4 §48.2 L3236-3242 逐字。
 */
export const MEMORY_CLASS_VALUES = [
  "TRUTH",
  "KNOWLEDGE",
  "EPISODE",
  "DECISION",
  "EVIDENCE",
  "USER",
  "HARNESS_RUNTIME",
] as const;
export type MemoryClassValue = (typeof MEMORY_CLASS_VALUES)[number];

/**
 * inbox 条目 review 三态（P33a fail-closed 纪律补位词；§48.4「Review/Promotion
 * 决定是否进入长期存储」的显式状态承载）。默认 PENDING（新建条目唯一合法起点
 * ——kernel buildInboxEntry 结构性只写 PENDING）；PROMOTED/REJECTED 只能由
 * decideInboxEntry 评审动作显式写入；已决条目再决 fail-closed 拒绝。
 * x-vocab-source: PRD §48.4「Review/Promotion」+ thread-B §4.2 review_state
 * 例文词形 PENDING。
 */
export const REVIEW_STATE_VALUES = ["PENDING", "PROMOTED", "REJECTED"] as const;
export type ReviewStateValue = (typeof REVIEW_STATE_VALUES)[number];

/**
 * inbox 条目来源三值（P33a 通路词形）：user_capture = 用户显式「记住」请求
 * （STRICT 模式统一入口，§48.5）；memory_harvest = harness memory 目录批量
 * 收割（COMPATIBILITY 模式，§48.5）；memory_drift_audit = memory audit 的
 * MEMORY_DRIFT 探测产物自动入 inbox（Case N「进入 inbox」半边——不得自动
 * 成为 Truth，§84.6）。
 * x-vocab-source: PRD §44.10/§48.4/§48.5 + Case N L5526-5530。
 */
export const HARVEST_SOURCE_VALUES = [
  "user_capture",
  "memory_harvest",
  "memory_drift_audit",
] as const;
export type HarvestSourceValue = (typeof HARVEST_SOURCE_VALUES)[number];

/**
 * 分类提案置信三级（thread-B §4.2「逐条打分类提案+置信度」；词形复用 §81.4
 * Research Finding / §83.4 Knowledge 置信三级同词形 HIGH/MEDIUM/LOW——词形
 * 复用不发明新值先例；判不了的 UNCLASSIFIED_PENDING 恒 LOW）。与
 * state_axes.confidence（UNRESOLVED/EXPERIMENTAL/PROVISIONAL/LOCKED）值域
 * 不相交。
 * x-vocab-source: thread-B §4.2 + §81.4/§83.4 三级同词形复用裁定。
 */
export const HARVEST_CONFIDENCE_VALUES = ["HIGH", "MEDIUM", "LOW"] as const;
export type HarvestConfidenceValue = (typeof HARVEST_CONFIDENCE_VALUES)[number];

// ============================================================
// P33b Memory CLI 命令面词形（§44.10 六命令错误面 + 呈报位）。
// x-vocab-source: vocab-lock memory_harvest_vocab.cli_error_codes / owner_escalation
// （PR-0009 收编）。P33b 任务定案自创补位词在本段登记（原「词汇表 PR 收编前禁进
// vocab-lock 主表」注记就此闭合）；扩值走词汇表 PR。
// ============================================================

/**
 * memory CLI 错误词形族（P33b-Commands 补位词；kernel GovernanceError 码位之上
 * 的命令面呈现码——映射关系确定性一一对应，禁子串/模糊猜测映射）：
 * - MEMORY_ENTRY_NOT_FOUND：inbox 条目不在册（kernel OBJECT_NOT_FOUND 的命令面
 *   词形；inspect/review --decide/promote 共用）；
 * - MEMORY_ALREADY_REVIEWED：已决条目再决（kernel TRANSITION_ILLEGAL 的
 *   review --decide 面 / REJECTED 条目 promote 面词形——review 三态封闭）；
 * - MEMORY_REVIEW_REQUIRED：PENDING 条目直接 promote（batch review 是唯一
 *   人工闸——thread-B §4.2 的命令面词形）；
 * - MEMORY_ALREADY_PROMOTED：已晋升条目重复 promote（晋升一次性）；
 * - MEMORY_PROMOTE_OWNER_REQUIRED：AUTHORITY_POLICY 升格未申报（kernel
 *   AUTHORITY_REQUIRED 的命令面词形——用户明令升格不可机器默认代行）；
 * - MEMORY_CAPTURE_DUPLICATE：同文重复捕获（内容寻址 id 撞册）；
 * - MEMORY_HARVEST_NOT_RUN：harness 目录缺席/零 md（kernel NOT_RUN 三态的
 *   命令面 fail-closed 词形——显式非绿，绝不伪造空跑成功）。
 */
export const MEMORY_CLI_ERROR_VALUES = [
  "MEMORY_ENTRY_NOT_FOUND",
  "MEMORY_ALREADY_REVIEWED",
  "MEMORY_REVIEW_REQUIRED",
  "MEMORY_ALREADY_PROMOTED",
  "MEMORY_PROMOTE_OWNER_REQUIRED",
  "MEMORY_CAPTURE_DUPLICATE",
  "MEMORY_HARVEST_NOT_RUN",
] as const;
export type MemoryCliErrorValue = (typeof MEMORY_CLI_ERROR_VALUES)[number];

/**
 * memory promote 呈报词形（P33b 任务定案：TRUTH/DECISION/EVIDENCE 桶晋升路由
 * escalate_owner 时 envelope warnings 携带本词形 + result.owner_escalation 非空
 * ——exit 0 不冒充失败也不冒充普通成功，呈报语义显式；Case N「不得自动成为
 * Truth」的命令面正向镜像）。
 * x-vocab-source: P33b 任务定案（wave3-plan P33 呈报位；PRD Case N L5526-5530
 * + §84.6 铁律）。
 */
export const OWNER_ESCALATION_REQUIRED = "OWNER_ESCALATION_REQUIRED" as const;

// ============================================================
// P34 Production Feedback / Control Band 词形轴（x-vocab-source: vocab-lock
// production_band_vocab，PR-0004 收编；Owner 决议 2026-09-01 批准——呈报件
// docs/production-feedback-p34-report.md §2.2/§2.4/§2.6 裁定落档；出处锚 PRD v0.4
// §30 L2554-2612 四态时间轴 / §95 L6099-6156 全节 / §55.1 L3579-3597 八能力表 /
// §90.4 L5682-5696 八信号，逐字 + 机器词形映射）。
// 本段原 absent_in_vocab_lock__pending_vocab_pr，2026-09-01 vocab-pr-0004 正式收编
// （主表登记，append-only 纯增量）；收编后以 vocab-lock 为准逐值镜像，扩值走词汇表 PR。
// schema 冻结锚 15-production-band definitions（与本段逐值同源）。
// 词形大小写裁定（呈报项已裁）：DIAGNOSIS_KIND 取 SCREAMING_SNAKE（§31 challenge
// classification 先例词形 ARCHITECTURE_EVOLUTION 同源），Owner 2026-09-01 照准；
// 信号源五词形取 §95.2 L6126「metric / log / error budget / SLO / control band」
// 空格词形转 snake_case（error budget→error_budget、control band→control_band、
// SLO→slo），映射注记 Owner 2026-09-01 照准。
// CHALLENGED 不在本段重复登记——§95.3 CURRENT→CHALLENGED 复用既有
// CHANGE_VALUES（STABLE/CHALLENGED/MIGRATING）词形，零新增。
// ============================================================

/**
 * §30 开发时间轴四态（PRD L2554-2563 逐字 PRE_DEV / IN_DEV / POST_DEV /
 * IN_PRODUCTION）。与 state_axes.lifecycle（PROPOSED/CURRENT/... 对象生命周期轴）
 * 正交、值域不相交：本轴管开发生命阶段（§95.1 生命周期扩展
 * PRE_DEV→IN_DEV→POST_DEV→IN_PRODUCTION→new Evidence/Incident/Opportunity→Change ↺
 * 的状态承载位），band 定义 phase 字段恒 IN_PRODUCTION（§95 生产反馈带）。
 * x-vocab-source: vocab-lock production_band_vocab.phase_timeline（PRD v0.4 §30
 * L2554-2563 逐字）。
 */
export const PHASE_TIMELINE_VALUES = [
  "PRE_DEV",
  "IN_DEV",
  "POST_DEV",
  "IN_PRODUCTION",
] as const;
export type PhaseTimelineValue = (typeof PHASE_TIMELINE_VALUES)[number];

/**
 * §95.2 生产信号源五词形（PRD L6126「metric / log / error budget / SLO /
 * control band」逐字；空格词形转 snake_case：error budget→error_budget、
 * control band→control_band、SLO→slo——映射注记 Owner 2026-09-01 照准）。
 * x-vocab-source: vocab-lock production_band_vocab.production_signal_source
 * （PRD v0.4 §95.2 L6126）。
 */
export const PRODUCTION_SIGNAL_SOURCE_VALUES = [
  "metric",
  "log",
  "error_budget",
  "slo",
  "control_band",
] as const;
export type ProductionSignalSourceValue =
  (typeof PRODUCTION_SIGNAL_SOURCE_VALUES)[number];

/**
 * §95.3 诊断三分（PRD L6153「Implementation Issue / Config Issue /
 * Architecture Evolution」逐字语义；词形 SCREAMING_SNAKE 化——§31 challenge
 * classification 词形 ARCHITECTURE_EVOLUTION 同源先例，大小写裁定 Owner
 * 2026-09-01 照准）。ARCHITECTURE_EVOLUTION 与 §31 分类词表同形复用
 * 不发明新值。
 * x-vocab-source: vocab-lock production_band_vocab.diagnosis_kind
 * （PRD v0.4 §95.3 L6153 + §31 L2630）。
 */
export const DIAGNOSIS_KIND_VALUES = [
  "IMPLEMENTATION_ISSUE",
  "CONFIG_ISSUE",
  "ARCHITECTURE_EVOLUTION",
] as const;
export type DiagnosisKindValue = (typeof DIAGNOSIS_KIND_VALUES)[number];

/**
 * Control band 谓词算子五值（P34 任务定案机器词形；谓词 machine-evaluable——
 * §95.2「不得把是否异常完全交给 LLM 主观判断」的类型面落点：判定通路只接受
 * 显式算子+数值阈值，禁自由文本判据字段）。between 须 threshold+threshold_max
 * 成对（闭区间健康带，带外即 BREACHED）。
 * x-vocab-source: vocab-lock production_band_vocab.band_predicate_operator
 * （P34 任务定案；非 PRD 逐字）。
 */
export const BAND_PREDICATE_OPERATOR_VALUES = [
  "gt",
  "lt",
  "gte",
  "lte",
  "between",
] as const;
export type BandPredicateOperatorValue =
  (typeof BAND_PREDICATE_OPERATOR_VALUES)[number];

/**
 * Control band 判定三态（P34 fail-closed 纪律词形，P32 PASS/FAIL/NOT_RUN
 * 三态显式同源）：OK=带内；BREACHED=击穿（产 Evidence，detected_by=tool_signal）；
 * NOT_EVALUABLE=不可判（观测指标名不匹配/值非有限数值/谓词损坏——显式缺席，
 * 绝不静默折算 OK）。与 03 VERDICT_VALUES 七态正交（band 判定是 §95.2
 * Deterministic Detection 面，不是 gate 判卷面）。缺席归因呈现码
 * METRIC_NAME_MISMATCH / VALUE_NOT_FINITE_NUMBER / PREDICATE_CORRUPT 同段收编
 * （not_evaluable_detail_reasons——detail 自由文本字段的结构化前缀呈现码）。
 * x-vocab-source: vocab-lock production_band_vocab.control_band_evaluation_status
 * （P34 任务定案 fail-closed 三态纪律；§95.2 Deterministic Detection 词形锚）。
 */
export const CONTROL_BAND_EVALUATION_STATUS_VALUES = [
  "OK",
  "BREACHED",
  "NOT_EVALUABLE",
] as const;
export type ControlBandEvaluationStatusValue =
  (typeof CONTROL_BAND_EVALUATION_STATUS_VALUES)[number];

/**
 * §55.1 Capability Outcome Metrics 机算状态两值（P34 任务定案）：MEASURED=
 * 从既有 gate/evidence 台账机算成立（附 value+basis 口径披露）；
 * NOT_MEASURABLE_YET=不可机算显式缺席（附理由——绝不冒充数值，§55.1
 * 「Metrics 用于风险提示」fail-closed 半边）。
 * x-vocab-source: vocab-lock production_band_vocab.capability_outcome_metric_status
 * （P34 任务定案；wave3-plan P34 出口判据「挂钩既有 gate/evidence 数据」的可算分账词形）。
 */
export const CAPABILITY_OUTCOME_METRIC_STATUS_VALUES = [
  "MEASURED",
  "NOT_MEASURABLE_YET",
] as const;
export type CapabilityOutcomeMetricStatusValue =
  (typeof CAPABILITY_OUTCOME_METRIC_STATUS_VALUES)[number];

/**
 * §55.1 十六指标机器键（八能力 × Leading/Lagging，snake_case 机械映射；
 * 人读呈现列以 CAPABILITY_OUTCOME_METRICS 常量逐字承载，本轴是机器消费键）。
 * x-vocab-source: vocab-lock production_band_vocab.capability_outcome_metric_key
 * （PRD v0.4 §55.1 L3583-3592 逐字表列的机械映射；vocab-pr-0004 收编）。
 */
export const CAPABILITY_OUTCOME_METRIC_KEY_VALUES = [
  "brainstorm_change_convergence_time",
  "in_dev_requirement_rework_rate",
  "research_high_risk_unknown_reduction_rate",
  "research_tech_choice_rework_rate",
  "context_hit_or_redundancy_rate",
  "agent_boundary_violation_rate",
  "profile_first_hit_rate",
  "governance_overhead",
  "arch_gate_predev_interceptions",
  "architecture_rework_rollback_rate",
  "relevant_knowledge_hit_rate",
  "same_class_bug_recurrence_rate",
  "gauntlet_first_pass_pass_rate",
  "production_change_failure_rate",
  "drift_detection_rate",
  "cross_session_state_error_rate",
] as const;
export type CapabilityOutcomeMetricKey =
  (typeof CAPABILITY_OUTCOME_METRIC_KEY_VALUES)[number];

/**
 * §90.4 自改进八信号（PRD L5686-5693 八条 bullet 逐字语义，snake_case 机器
 * 词形；人读原文列以 SELF_IMPROVEMENT_SIGNAL_PRD_LABELS 逐字承载）。登记产物
 * 恒 POMASTER_SELF_IMPROVEMENT_CANDIDATE 呈报态——「不得自动应用」（L5695
 * 逐字）由 kernel production.ts 结构封条承载（模块导出面无任何 Router/Profile/
 * Gate 配置修改函数）。
 * x-vocab-source: vocab-lock production_band_vocab.self_improvement_signal
 * （PRD v0.4 §90.4 L5686-5693）。
 */
export const SELF_IMPROVEMENT_SIGNAL_VALUES = [
  "governance_overhead_ratio_anomaly",
  "gate_high_frequency_false_positive",
  "role_without_independent_evidence",
  "registry_empty_or_duplicate_view",
  "context_oversized_low_utilization",
  "repeated_architecture_challenge",
  "profile_frequent_manual_deescalation",
  "profile_frequent_inflight_escalation",
] as const;
export type SelfImprovementSignalValue =
  (typeof SELF_IMPROVEMENT_SIGNAL_VALUES)[number];

/** §90.4 八信号人读原文逐字镜像（键=机器词形，值=PRD bullet 原文）。x-vocab-source: vocab-lock production_band_vocab.self_improvement_signal_prd_labels。 */
export const SELF_IMPROVEMENT_SIGNAL_PRD_LABELS = {
  governance_overhead_ratio_anomaly: "Governance Overhead Ratio 长期异常",
  gate_high_frequency_false_positive: "某 Gate 高频产生误报",
  role_without_independent_evidence: "某 Agent Role 几乎从不带来独立 Evidence",
  registry_empty_or_duplicate_view: "某 Registry 长期为空或重复另一 Object View",
  context_oversized_low_utilization: "Context 长期过大但实际使用率低",
  repeated_architecture_challenge: "相同 Architecture Challenge 重复出现",
  profile_frequent_manual_deescalation:
    "Profile 经常被人工降级，说明 Router 过度保守",
  profile_frequent_inflight_escalation:
    "Profile 经常在开发中升级，说明 Triage 过度乐观",
} as const satisfies Readonly<Record<SelfImprovementSignalValue, string>>;

/**
 * §90.4 逐字产物词形（PRD L5695「这些建议进入
 * `POMASTER_SELF_IMPROVEMENT_CANDIDATE`，不得自动应用」）。P34 登记产物 kind
 * 字段恒携带本词形（呈报位非应用位；MEMORY_DRIFT 单词常量同款承载先例）。
 * x-vocab-source: vocab-lock production_band_vocab.product_word_forms。
 */
export const POMASTER_SELF_IMPROVEMENT_CANDIDATE =
  "POMASTER_SELF_IMPROVEMENT_CANDIDATE" as const;

/**
 * §95.2 Deterministic Detection 判定主体词形（P34 任务定案：breach Evidence
 * detected_by 字段恒 tool_signal——C5「判定来自工具信号非 LLM 自报」的承载位；
 * 词形 snake_case）。
 * x-vocab-source: vocab-lock production_band_vocab.product_word_forms
 * （P34 任务定案；§95.2 Tool Detects 链序的机械词形锚）。
 */
export const DETECTED_BY_TOOL_SIGNAL = "tool_signal" as const;

/**
 * production CLI 错误词形族（P34b-Commands 补位词；kernel GovernanceError 码位之上
 * 的命令面呈现码——映射关系确定性一一对应（按命令面 + kernel 码位查表），禁子串/
 * 模糊猜测映射）。六词形经 vocab-pr-0004 收编（Owner 决议 2026-09-01；呈报件
 * docs/production-feedback-p34-report.md §2.4 裁定落档）；命令组词形 production +
 * 六子命令名（band/evaluate/challenge/diagnose/metrics/self-improvement）同批经
 * Owner 认可（呈报件 §2.1——命令名非词表管辖面，落档 docs/kernel-api.md production
 * 命令段；memory CLI 六命令 P33b 同款先例：词表只收错误词形族不收命令名）：
 * - BAND_SCHEMA_INVALID：band 定义面词形/谓词/重复登记（kernel SCHEMA_INVALID·
 *   VOCAB_INVALID_VALUE 在 band define 面的命令面词形——band 面只有 schema 族错误）；
 * - BAND_NOT_FOUND：band 定义不在册（kernel OBJECT_NOT_FOUND 在 band 读取面的
 *   命令面词形）；
 * - OBSERVATION_NOT_EVALUABLE：观测缺席/不可判（evaluate 无 --value 且无
 *   --observations-file、观测文件不可读/形态非法、观测值非有限数、判定三态
 *   NOT_EVALUABLE 的命令面 fail-closed 词形——显式缺席绝不静默绿）；
 * - CHALLENGE_REJECTED：challenge 被拒（非 CURRENT/已 CHALLENGED/MIGRATING/
 *   band↔breach 不符/申报对象≠band 挂载对象/目标对象不在册——kernel
 *   TRANSITION_ILLEGAL·OBJECT_NOT_FOUND·SCHEMA_INVALID 在 challenge 面的命令面词形）；
 * - EVIDENCE_NOT_FOUND：breach evidence 引用词形非法或不在册（kernel
 *   SCHEMA_INVALID·OBJECT_NOT_FOUND 在 breach 读取面的命令面词形）；
 * - DIAGNOSIS_WITHOUT_BREACH_EVIDENCE：无既有 BREACHED band evidence 的 diagnosis
 *   （§95.2 链序封条词形——kernel 同名 GovernanceErrorCode 的命令面透传复用，
 *   唯一与 kernel 码位同名的族员，零二次造词）。
 * x-vocab-source: vocab-lock production_band_vocab.cli_error_codes（P34b 任务定案；
 * vocab-pr-0004 收编）。
 */
export const PRODUCTION_CLI_ERROR_VALUES = [
  "BAND_SCHEMA_INVALID",
  "BAND_NOT_FOUND",
  "OBSERVATION_NOT_EVALUABLE",
  "CHALLENGE_REJECTED",
  "EVIDENCE_NOT_FOUND",
  "DIAGNOSIS_WITHOUT_BREACH_EVIDENCE",
] as const;
export type ProductionCliErrorValue =
  (typeof PRODUCTION_CLI_ERROR_VALUES)[number];

// ============================================================
// software_graph_vocab（x-vocab-source: vocab-lock software_graph_vocab，PR-0006 收编）
// P-v06 Software Graph / Engineering Substrate 词轴（PRD v0.6 §6-8/§111/§148-149/
// §162-163 + PRD v0.6.1 §2/§69/§73/§75 逐字 + Owner 四决议 D-1~D-4 2026-09-02）。
// schema 冻结锚 19-relations definitions；kernel 消费面 relations.ts /
// resolver.ts / analyzer-contract.ts；扩值走词汇表 PR。
// ============================================================

/**
 * Typed Relation 词表首批 8 值（PRD v0.6 §7 Relation Model 逐字词形 + D-2 裁定补位
 * INSTANCE_OF；「只收真实消费」纪律——PRD §7 其余词形待真实消费者落地逐批 append-only
 * 增补，禁一次性登记空词）。MAPS_TO_SOURCE 语义由既有 key_bindings 承载（D15）；
 * SUPERSEDES 语义由信封 supersedes/successor_ref 承载零新增——既有机制已有承载位的
 * PRD 词形不重复登记。
 * x-vocab-source: vocab-lock software_graph_vocab.relation_type（PR-0006）。
 */
export const RELATION_TYPE_VALUES = [
  "INSTANCE_OF",
  "IMPLEMENTS",
  "CONTAINS",
  "CALLS",
  "READS",
  "WRITES",
  "VERIFIED_BY",
  "DERIVED_FROM",
] as const;
export type RelationTypeValue = (typeof RELATION_TYPE_VALUES)[number];

/**
 * 边来源三值（PRD v0.6 §8 Graph Provenance source_type 语义的边侧承载）。与
 * SOURCE_TYPE_ALL_VALUES（02 信封对象侧十值来源词表，PR-0007 起）正交、值域不相交混用。
 * x-vocab-source: vocab-lock software_graph_vocab.relation_origin（PR-0006）。
 */
export const RELATION_ORIGIN_VALUES = [
  "static_analysis",
  "runtime_trace",
  "human_declared",
] as const;
export type RelationOriginValue = (typeof RELATION_ORIGIN_VALUES)[number];

/**
 * 边端点域两值（D-2 裁定：边端点可指 governed id（truth 面）或 catalog 条目 id
 * （catalog 面）；INSTANCE_OF 典型=truth→catalog）。
 * x-vocab-source: vocab-lock software_graph_vocab.relation_endpoint_domain（PR-0006）。
 */
export const RELATION_ENDPOINT_DOMAIN_VALUES = ["truth", "catalog"] as const;
export type RelationEndpointDomainValue =
  (typeof RELATION_ENDPOINT_DOMAIN_VALUES)[number];

/**
 * 边置信三级（PRD v0.6 §8 Graph Provenance confidence.deterministic 语义的三级化 +
 * §148 Analyzer Output Contract confidence 位）。与 state_axes.confidence
 * （UNRESOLVED/EXPERIMENTAL/PROVISIONAL/LOCKED 对象治理轴）正交、值域不相交。
 * x-vocab-source: vocab-lock software_graph_vocab.relation_confidence（PR-0006）。
 */
export const RELATION_CONFIDENCE_VALUES = [
  "deterministic",
  "probable",
  "declared",
] as const;
export type RelationConfidenceValue = (typeof RELATION_CONFIDENCE_VALUES)[number];

/**
 * Engineering Substrate 七层（PRD v0.6.1 §2 分层逐字：Foundation→Primitive→Pattern
 * →Archetype→Reference Solution→Project Baseline→Business Delta；SCREAMING_SNAKE
 * 词形化——§91.3 词形大写化先例，空格词形转下划线）。archetype 物料必填分层位
 * （catalog_kind=archetype 的物料级轴）：逐层稳定度递减、复用面递增方向即 §2 箭头序。
 * x-vocab-source: vocab-lock software_graph_vocab.substrate_layer（PR-0006）。
 */
export const SUBSTRATE_LAYER_VALUES = [
  "FOUNDATION",
  "PRIMITIVE",
  "PATTERN",
  "ARCHETYPE",
  "REFERENCE_SOLUTION",
  "PROJECT_BASELINE",
  "BUSINESS_DELTA",
] as const;
export type SubstrateLayerValue = (typeof SUBSTRATE_LAYER_VALUES)[number];

/**
 * Resolver 匹配分类六值（PRD v0.6.1 §69 Requirement Resolution SOP 分类清单逐字）。
 * 只有 NO_MATCH 才允许进入 Design Synthesis（§69）；New Entity Gate 判卷消费本轴（§75）。
 * Resolver MVP 确定性派生覆盖 EXACT/CONFIGURABLE/EXTENSIBLE/NO_MATCH 四值；
 * COMPOSABLE/REFERENCE 为批次 2+ 组合分析预留位（登记全闭包、派生覆盖子集——缺席显式）。
 * Anti-Hallucination（§87）：advisory 面（knowledge/policy）命中不改变 match_class。
 * x-vocab-source: vocab-lock software_graph_vocab.resolution_match_class（PR-0006）。
 */
export const RESOLUTION_MATCH_CLASS_VALUES = [
  "EXACT_MATCH",
  "CONFIGURABLE_MATCH",
  "COMPOSABLE_MATCH",
  "EXTENSIBLE_MATCH",
  "REFERENCE_MATCH",
  "NO_MATCH",
] as const;
export type ResolutionMatchClassValue =
  (typeof RESOLUTION_MATCH_CLASS_VALUES)[number];

/**
 * 十二 Object Family（PRD v0.6 §6.1 Object Family 十二族逐字）。**family=派生视图**
 * （PRD §1.2 Derived Facts Must Be Derived：由前缀映射机器派生，零信封改动——映射表
 * PREFIX_FAMILY_MAP 见 kernel family.ts；RUNTIME/RESOURCE/RELIABILITY/SECURITY/DELIVERY
 * 五族暂无前缀映射，派生 null 显式缺席禁猜测）。PRD §163 Phase C：新 family 待真实对象
 * 出现走词汇表 PR 增前缀，本轴不扩值。
 * x-vocab-source: vocab-lock software_graph_vocab.object_family（PR-0006）。
 */
export const OBJECT_FAMILY_VALUES = [
  "PRODUCT",
  "UI",
  "INTERFACE",
  "CODE",
  "DATA",
  "RUNTIME",
  "RESOURCE",
  "RELIABILITY",
  "SECURITY",
  "DELIVERY",
  "GOVERNANCE",
  "EVIDENCE",
] as const;
export type ObjectFamilyValue = (typeof OBJECT_FAMILY_VALUES)[number];

/**
 * catalog 物料 kind 词轴（PR-0006 收编：兑现 kinds_registry.catalog_note「catalog 条目
 * kind 词形住 catalog_layer_vocab 段」的登记位）。前四值=既有物料实测词形登记
 * （policy/gate_recipe/sensor_capability/knowledge_entry）；archetype=D-2 裁定新增
 * （Engineering Substrate 标准件物料，PRD v0.6.1 §2-§4：定义住 catalog 面、实例采用走
 * relation sidecar INSTANCE_OF 边——「Catalog 不是第二套 Project Truth」§92.2）。
 * x-vocab-source: vocab-lock catalog_layer_vocab.catalog_kind（PR-0006）。
 */
export const CATALOG_KIND_VALUES = [
  "policy",
  "gate_recipe",
  "sensor_capability",
  "knowledge_entry",
  "archetype",
] as const;
export type CatalogKindValue = (typeof CATALOG_KIND_VALUES)[number];
