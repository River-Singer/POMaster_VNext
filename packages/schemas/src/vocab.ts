/**
 * vocab.ts —— FROZEN 词表的代码唯一镜像点。
 *
 * 词表纪律（违者=返工）：
 * - 本文件一切枚举/前缀/转移矩阵只能镜像 `assets/vocab-lock.draft.yaml`
 *   （pomaster.vocab/v0.2-resolved；v0.1-resolved 2026-08-27 FROZEN，2026-08-29 PR-0001
 *   append-only 纯增量增补，v0.1 词值零删改），逐值相等，禁止发明词表外值；
 * - 需要新值 → 留 `TODO(vocab-pr)` 注释走词汇表 PR，禁止就地添加；
 * - 标注「待词汇表 PR 收编」的词轴：词形已在 schema（01/02/03/05/06/07）的
 *   x-vocab-extra / definitions 冻结，本文件照镜像并保留 TODO(vocab-pr)；
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
 * - DEPRECATED→RETIRED 附加 grace_policy: config（宽限期策略键待词表登记 → TODO(vocab-pr)）。
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
// source_types（x-vocab-source: vocab-lock source_types，2026-08-27 收编 02 信封）
// ============================================================

/** 来源全集（allowed ∪ forbidden = 9 值）。 */
export const SOURCE_TYPE_ALL_VALUES = [
  "bp_blueprint",
  "design_seed",
  "human_directive",
  "code_refactor",
  "prototype_walkthrough",
  "prototype_html_scrape",
  "research_evidence",
  "openapi_contract",
  "ai_invention",
] as const;
export type SourceTypeAllValue = (typeof SOURCE_TYPE_ALL_VALUES)[number];

/** 合法来源（7 值）。 */
export const SOURCE_TYPE_ALLOWED_VALUES = [
  "bp_blueprint",
  "design_seed",
  "human_directive",
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
 * 前缀闭包 v0（15 前缀；未登记前缀=解析即 FATAL；扩展走词汇表 PR）。
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
 * 机械映射权威=migration/master-batch1/tools/ingest_change_governance.py pack_segments。
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
// 以下为「词表外局部枚举」：词形已在各 schema 冻结，待词汇表 PR 收编。
// TODO(vocab-pr)：逐轴随后续词汇表 PR 收编（v0.2/PR-0001 已收编 catalog_layer_vocab 与
// presentation_axes 两段；本节词轴尚未入 vocab-lock）；扩值必须走词汇表 PR，禁止就地添加。
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
