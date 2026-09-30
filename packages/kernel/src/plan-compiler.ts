/**
 * plan-compiler.ts —— Verification Plan Compiler（证据计划编译器；W1 R1-3 切片；
 * 09-10 PRD REQ-04「完整 Acceptance → Evidence Requirement → Capability → Tool 链」
 * + AC-03 / AC-13 + test-planning-and-reporting.md §2 九步算法）。
 *
 * 职责：逐 Acceptance 编译 Verification Plan——每条验收 × 能力闭包产出 plan item
 * （义务/工具/靶/环境/applicability/依据全字段落盘），无法判断的影响面保留 unknown，
 * 禁默认 NOT_APPLICABLE。纯函数核：零 fs、零 store、零墙钟（A4），同输入 → 同输出
 * 字节稳定（inputs_fingerprint = sha256OfCanonical 整个输入）。
 *
 * ═══ 判定语义（§2 九步算法的本仓落点）═══
 * - 能力闭包 U = ∪(faces 派生能力, acceptance.requires ∪ exclusions)——不从现有工具
 *   能力反向改写正确答案（PRD §18 第 1 条）；
 * - applicability 三值：REQUIRED（验收申报义务）/ NOT_REQUIRED（验收显式排除——能力
 *   相关但本验收不要求）/ NOT_APPLICABLE（变更面声明该 face 不在座——N/A 有据，
 *   引用变更面 basis；三值中 NOT_APPLICABLE 复用 baseline 既有词形
 *   BASELINE_UNKNOWN_APPLICABILITY_VALUES，REQUIRED/NOT_REQUIRED 轴为新词形）；
 * - 排除（NOT_REQUIRED）优先于申报（REQUIRED）；二者同现 = 输入矛盾 SCHEMA_INVALID；
 * - requires 义务命中 absent face = 输入自相矛盾，SCHEMA_INVALID fail-closed；
 * - 未申报 face kind → undeclared_face unknown；face 在座但无人认领能力 →
 *   unclaimed_face_capability unknown；逐验收未判定能力 → unjudged_capability
 *   unknown（回 Expect 判定，绝不静默丢弃也绝不默认降级）；
 * - 缺工具 ≠ N/A：REQUIRED 保持 + resolved_tool=null + tool_gap 缺口原因（无工具
 *   不降级义务；执行态归 NOT_RUN/BLOCKED 域）。
 *
 * ═══ A1 裁定边界（projection.ts:220 先例）═══
 * informational（complexity / governance_profile / note）只原样呈现，零参与
 * applicability 判定——复杂度/档位不能决定测试集合（AC-13）。词表管辖=kernel 局部
 * 词 TODO(vocab-pr)（question-gate 六值同款先例），SP 提案待追认。
 *
 * ═══ R1-4 接缝 ═══
 * PlanToolBinding 是 R1-4 ToolBinding 统一面前的过渡输入形态（本仓现状=
 * gauntlet-lite gateAdapters(5)/toolDetectors(15) 只读探测 + browser-gate.json/
 * .mcp.json 在位性）；R1-4 落地后本输入段换统一绑定面，判定核不动。
 *
 * ═══ R1-5 接缝（证据复用重判——test-planning §2 算法第 8 步）═══
 * 「用当前 revision/env/config 对已有证据重判适用性」的机器可比对子集已由
 * evidence-qualification.ts 判定核落地（seq/gate_def/oracle/permit/subject 五轴纯函
 * 数，要求面=baseline 确认 at_seq + journal 失效事件 + CURRENT_GATE_DEFS 注册面）；
 * 本切片消费接线归 closeout / record verification 两命令面，plan 重编译时的逐 item
 * 证据复用重判（预期证据 ↔ 既有 GRN 对账后调 qualifyEvidence）留接口给后续切片，
 * 本编译器行为零改动。
 *
 * ═══ W1-FR04 场景契约（MASTer 经验驱动优化战役 Wave 2）═══
 * Acceptance 级可选场景集合（PlanAcceptanceItem.scenarios，research
 * evidence-scenarios-and-boundaries.md §3/§8 方案 A）：场景要进入证据分母，而非只加
 * 说明文字。挂 Acceptance 级的理由：场景是验收的观察细化；inputs_fingerprint 对整个
 * acceptance 输入段做 canonical 摘要——场景挂此层即自动参与指纹（场景定义变化 →
 * plan fingerprint 变化 → 旧证据重新判资格）。fail-closed 校验：duplicate scenario_ref
 * / 空 expected_observation / 空 precondition/interaction / 非布尔
 * runtime_confirmation_required / marker 保留字一律 SCHEMA_INVALID（显式缺口不吞
 * 分母）。legacy 矩阵：无 scenarios 的旧任务语义字节不变（无矩阵义务——不存在
 * 「空分母判绿」问题；带场景的新任务分母=场景×gate，禁默认空分母判绿）。
 * REQUIRED 条目按场景展开（scenario_ref 进 item/reason/expected_evidence）与
 * run/复用/终验 cohort 键接线见 VerificationPlanItem.scenario_ref（本切片同批）。
 *
 * ═══ W5-FR09/FR10 oracle + seam 词形（MASTer 经验驱动优化战役 Wave 5）═══
 * 场景合同加性承载两类机器可判义务（契约 w5-probe-contract §1/§4；可加细不放宽）：
 * - expected_observation_oracle（业务 oracle 闭合词形）：「保存后何处可见」的
 *   visible_via/filter_context/mapping_fields 三键闭包——三类观察不可折叠（HTTP
 *   成功 ≠ 持久化成功 ≠ 用户可见），词形闭包 fail-closed（额外键 SCHEMA_INVALID）；
 *   缺席 = legacy 无 oracle 义务（零破坏）。展开条目经 VerificationPlanItem.
 *   scenario_oracle 下传执行面（v1 报告不得满足带 visible_via 义务的场景）。
 * - mock_real_seam（seam 义务声明）：同一 operation/contract/scenario 身份下双腿
 *   （seam_role=mock/real 的 CONTROL_DATA_FLOW_RUNTIME binding）各自独立展开为
 *   resolved_bindings（每腿独立 GRN/artifact）；缺任一腿=seam 义务未满足（编译期
 *   tool_gap 点名缺席腿，执行期 fail-closed 非绿）。非 seam 场景 binding 选择行为
 *   字节不变（compiler remains the only binding-selection authority）。
 *
 * ═══ 旧档位迁移清单指针（兼容期 legacy 登记——W1 Out of Scope）═══
 * 旧 GateTier/triage 档位消费者迁移接缝表住
 * .trellis/tasks/09-10-brainstorm-long-horizon-control-loop/research/
 * test-planning-and-reporting.md §2；消费者坐标（W1 不改其行为，本编译器为并存
 * 面直至迁移轮）：adapter-types.ts:80-85/136-156/190-199 + detectors.ts
 * requiredByProfile 分支、coverage-adapter.ts:434/486/722 + coverage-leg.ts:143-164、
 * crap.ts:333-381、mutation-adapter.ts:365-375、security-adapter.ts:385-398 +
 * performance-adapter.ts:196-207、playwright-adapter.ts:15-18/164-168（不按档位
 * 豁免）、view.ts:653-670/788-793（gate report 汇编）。
 */
import { GovernanceError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";

// ============================================================
// 词形闭包（kernel 局部词 TODO(vocab-pr)；NOT_APPLICABLE 复用 baseline 词形）
// ============================================================

export const PLAN_APPLICABILITY_VALUES = ["REQUIRED", "NOT_REQUIRED", "NOT_APPLICABLE"] as const;
export type PlanApplicability = (typeof PLAN_APPLICABILITY_VALUES)[number];

/** 变更面词类（十类；闭包=SP 提案待追认）。 */
export const PLAN_CHANGE_FACE_KINDS = [
  "behavior",
  "ui",
  "api",
  "data_read_write",
  "migration",
  "permission",
  "dependency",
  "concurrency",
  "performance",
  "deployment_config",
] as const;
export type PlanChangeFaceKind = (typeof PLAN_CHANGE_FACE_KINDS)[number];

/**
 * 能力词形（十四词；static_analysis 为 TS 族 tsc/ESLint 绑定面，control_data_flow
 * 为 Vue/React 控件结构链独立绑定面，
 * 同批修订 = schema 23 capability_word enum。visual_diff、static_analysis 与
 * control_data_flow 均不从任何 face 派生——只经 acceptance requires/exclusions 进闭包）。
 */
export const PLAN_CAPABILITY_WORDS = [
  "unit_behavior",
  "ui_render",
  "ui_interaction",
  "api_contract",
  "data_integration",
  "migration_drill",
  "permission_observation",
  "dependency_check",
  "concurrency_reproduction",
  "load_test",
  "deployment_config_check",
  "visual_diff",
  "static_analysis",
  "control_data_flow",
] as const;
export type PlanCapabilityWord = (typeof PLAN_CAPABILITY_WORDS)[number];

/**
 * Explicit capability-to-gate projection consumed by closeout. A missing key
 * is intentionally treated conservatively by consumers; this table is not a
 * claim that every capability has a machine gate in the current registry.
 */
export const PLAN_CAPABILITY_GATE_NAMES: Readonly<Record<PlanCapabilityWord, readonly string[]>> = {
  unit_behavior: ["BUILD"],
  ui_render: ["BROWSER"],
  ui_interaction: ["BROWSER"],
  api_contract: ["CONTRACT"],
  data_integration: ["BUILD"],
  migration_drill: ["BUILD"],
  permission_observation: ["SECURITY"],
  dependency_check: ["ARCHITECTURE"],
  concurrency_reproduction: ["BUILD"],
  load_test: ["PERFORMANCE"],
  deployment_config_check: ["ARCHITECTURE"],
  visual_diff: ["BROWSER"],
  static_analysis: ["TYPECHECK", "LINT"],
  control_data_flow: ["CONTROL_DATA_FLOW", "CONTROL_DATA_FLOW_RUNTIME"],
};

/** face kind → 派生能力（轴序固定词形；face 闭包是能力的唯一 face 来源）。 */
const FACE_CAPABILITIES: Readonly<Record<PlanChangeFaceKind, readonly PlanCapabilityWord[]>> = {
  behavior: ["unit_behavior"],
  ui: ["ui_render", "ui_interaction"],
  api: ["api_contract"],
  data_read_write: ["data_integration"],
  migration: ["migration_drill"],
  permission: ["permission_observation"],
  dependency: ["dependency_check"],
  concurrency: ["concurrency_reproduction"],
  performance: ["load_test"],
  deployment_config: ["deployment_config_check"],
};

/** capability → 承载 face kind（visual_diff 无 face 承载）。 */
const CAPABILITY_FACE: Readonly<Partial<Record<PlanCapabilityWord, PlanChangeFaceKind>>> = (() => {
  const map: Partial<Record<PlanCapabilityWord, PlanChangeFaceKind>> = {};
  for (const kind of PLAN_CHANGE_FACE_KINDS) {
    for (const cap of FACE_CAPABILITIES[kind]) map[cap] = kind;
  }
  return map;
})();

const CAPABILITY_METHOD: Readonly<Record<PlanCapabilityWord, string>> = {
  unit_behavior: "test",
  ui_render: "test",
  ui_interaction: "observation",
  api_contract: "test",
  data_integration: "test",
  migration_drill: "test",
  permission_observation: "observation",
  dependency_check: "analysis",
  concurrency_reproduction: "test",
  load_test: "test",
  deployment_config_check: "inspection",
  visual_diff: "observation",
  static_analysis: "analysis",
  control_data_flow: "analysis",
};

/**
 * capability → 证据义务原文（计划 item evidence_requirement 单一映射源）。
 * W3-S3 起导出（加性——零行为变化）：diagnose.ts 失败域判定核的 next_actions 消费
 * 同一张表（诊断计划建议复用 plan-compiler 能力词位——禁第二套工具池词/义务文本）。
 */
export const CAPABILITY_EVIDENCE_REQUIREMENT: Readonly<Record<PlanCapabilityWord, string>> = {
  unit_behavior: "vitest 单测钉测（行为断言在座，禁空转断言）",
  ui_render: "组件渲染钉测（挂载断言关键节点/计数分母）",
  ui_interaction: "浏览器交互观察回执（Playwright 断言 ∥ chrome-devtools 实时对账双通道至少其一）",
  api_contract: "API 契约比对回执（请求/响应形状逐字段对账）",
  data_integration: "数据读写集成证据（真实存储路径往返，禁 mock 同引用假绿）",
  migration_drill: "迁移演练回执（升级/回滚双向）",
  permission_observation: "权限行为观察回执（越权路径实测拒绝）",
  dependency_check: "依赖闭包分析回执（新增/移除边清单）",
  concurrency_reproduction: "并发复现用例（竞态窗口显式构造）",
  load_test: "负载实测回执（预算阈值在座）",
  deployment_config_check: "部署配置检视回执（环境差异逐键对账）",
  visual_diff: "视觉差异回执（基线快照比对）",
  static_analysis:
    "类型/静态分析工具真实执行回执（tsc --noEmit 文本诊断逐条重算 ∥ ESLint JSON finding 逐条重算；编译转译成功不当 typecheck，空根 tsconfig 零分母禁默认 PASS）",
  control_data_flow:
    "控件数据流双证据回执（静态 control→event→handler/action→state/transform→effect→readback→rendered feedback + 独立 runtime trace artifact；动态边保持 unknown，静态 passed 不代表运行时用户旅程成功）",
};

// ============================================================
// 输入合同（camelCase 输入世界——CLI 生产类型化事实，kernel 纯消费）
// ============================================================

/** 输入段包装：事实 + 来源 + 版本 + 自报 unknown（来源可重放 = 计划可重编译的前提）。 */
export interface PlanInputSegment<T> {
  readonly value: T;
  readonly source_ref: string;
  readonly version: string | null;
  readonly unknowns?: readonly string[];
}

export interface PlanAcceptanceItem {
  readonly ref: string;
  readonly statement: string;
  readonly oracle_ref: string | null;
  readonly requires: readonly PlanCapabilityWord[];
  readonly exclusions: readonly {
    readonly capability: PlanCapabilityWord;
    readonly basis: string;
  }[];
  /**
   * W1-FR04 场景义务（加性可选）：本验收的场景化观察分母——场景要进入证据分母，
   * 而非只加说明文字。缺省/undefined = legacy 无矩阵义务（语义字节不变）；空数组 =
   * 显式「场景义务为零」申报（行为面同无字段，空申报本身是输入事实、参与指纹）。
   * 场景挂在 Acceptance 级：inputs_fingerprint 对整个 acceptance 输入段做 canonical
   * 摘要——场景定义变化即改变 plan fingerprint → 旧证据按新义务重新判资格；
   * 不新增 canonical TestCase entity，局部 scenario_ref 是 task 内稳定局部键。
   */
  readonly scenarios?: readonly PlanAcceptanceScenario[];
}

/**
 * Acceptance 场景义务（W1-FR04；research evidence-scenarios-and-boundaries §3 最小
 * 结构）：task 内稳定局部键 + 观察四要素 + 运行时确认声明位。
 * runtime_confirmation_required=true 表示本场景观察须运行时确认（消费归
 * control_data_flow 等运行时证明类型链）——本编译器只承载声明、不裁决运行时义务。
 * scenario_ref 禁携带 GRN note marker 保留字（；/换行）——场景身份以
 * `scenario_ref=<局部键>` 形态进 GRN scope note（run/复用/终验 cohort 键的共用锚）。
 * W5 起加性可选：expected_observation_oracle（业务 oracle 闭合词形）与
 * mock_real_seam（seam 义务声明）——词形见下方接口注；缺席=legacy 零破坏。
 */
export interface PlanAcceptanceScenario {
  readonly scenario_ref: string;
  readonly precondition: string;
  readonly interaction: string;
  readonly state_dimensions: readonly string[];
  readonly expected_observation: string;
  readonly runtime_confirmation_required: boolean;
  readonly expected_observation_oracle?: BusinessObservationOracle;
  readonly mock_real_seam?: ScenarioSeamObligation;
}

/**
 * 业务 oracle 观察通道词形（W5-FR10 契约 §1；x-vocab-source: vocab-lock
 * master_campaign_vocab.observation_channel（PR-0011 收编，Owner 裁定 1=A 2026-09-30
 * 词汇表批扫）——原 TODO(vocab-pr) 待追认标记就此转正）：
 * observation_channel 轴。三类观察不可折叠：HTTP 成功（请求被接受）≠ 持久化成功
 * （re-read 到位）≠ 用户可见（声明通道+过滤上下文下确实出现）。
 */
export const OBSERVATION_CHANNEL_VALUES = ["api_list", "api_detail", "ui_surface"] as const;
export type ObservationChannelValue = (typeof OBSERVATION_CHANNEL_VALUES)[number];

/**
 * 业务 oracle 闭合词形（W5-FR10 契约 §1）：
 * - visible_via：声明在哪条观察通道可见（词表三值闭包）；
 * - filter_context：声明过滤上下文（如 project/actor/scope——Case F 的 project_id
 *   过滤发生在这一层）；键值均须非空字符串；
 * - mapping_fields：重读后必须出现的字段集（detail-only 缺值不容忍；空数组=显式
 *   「无字段映射义务」申报）。
 * 闭合：三键之外不承认任何键（fail-closed——词形闭包校验 SCHEMA_INVALID）。
 */
export interface BusinessObservationOracle {
  readonly visible_via: ObservationChannelValue;
  readonly filter_context?: Readonly<Record<string, string>>;
  readonly mapping_fields: readonly string[];
}

/**
 * mock/real seam 义务声明（W5-FR09 契约 §4）：同一 operation/contract/scenario
 * 身份下双腿（mock 腿/real 腿）各自产生独立 GRN/artifact；缺任一腿=seam 义务未
 * 满足（各自真实结果保留，整体非绿）。闭合：operation_id/contract_ref 之外不承认
 * 键；contract_ref=null 显式申报无契约锚（不可缺省猜测）。
 */
export interface ScenarioSeamObligation {
  readonly operation_id: string;
  readonly contract_ref: string | null;
}

/** seam 腿角色词形（binding.seam_role；两值闭包——冒领即 seam 对账失效）。 */
export const SEAM_ROLE_VALUES = ["mock", "real"] as const;
export type SeamRoleValue = (typeof SEAM_ROLE_VALUES)[number];

export interface PlanChangeFace {
  readonly kind: PlanChangeFaceKind;
  readonly present: boolean;
  readonly basis: string;
}

export interface PlanChangeSurface {
  readonly changed_paths: readonly string[];
  readonly affected_consumers: readonly string[];
  readonly faces: readonly PlanChangeFace[];
}

export interface PlanEnvironmentFacts {
  readonly ref: string;
  readonly grounded: boolean;
  readonly notes: readonly string[];
}

/** R1-4 ToolBinding 统一面前的过渡形态（探测面产出；见头注接缝节）。 */
export interface PlanToolBinding {
  /** Unified registry identity. Legacy detector projections omit these three fields. */
  readonly binding_id?: string;
  readonly tool_id: string;
  readonly gate?: string;
  readonly gate_def?: string;
  readonly capabilities: readonly PlanCapabilityWord[];
  /** seam 腿角色（W5-FR09 加性可选：mock/real 双腿 binding 的身份标记；legacy 缺席）。 */
  readonly seam_role?: SeamRoleValue;
  readonly source_ref: string;
  readonly version: string | null;
  readonly available: boolean;
  readonly availability_reason: string;
}

export interface VerificationPlanResolvedBinding {
  readonly binding_id: string;
  readonly tool: string;
  readonly gate: string;
  readonly gate_def: string;
  /** seam 腿标记（W5-FR09：seam 场景双腿展开的 leg 身份；非 seam 条目无此键）。 */
  readonly seam_role?: SeamRoleValue;
}

export interface PlanPermitFacts {
  readonly permit_ref: string | null;
  readonly scope_subject_ids: readonly string[];
}

/** 信息性输入——零参与 applicability（A1 裁定）；只原样呈现。 */
export interface PlanInformationalFacts {
  readonly complexity?: string | null;
  readonly governance_profile?: string | null;
  readonly note?: string | null;
}

export interface PlanReviewedScope {
  readonly task_ref: string;
  readonly review_ref: string;
  readonly observation_ref: string;
  readonly report_sha256: string;
  readonly source_sha: string;
  readonly freshness: "fresh";
  readonly declared_roots: readonly string[];
  readonly accepted_paths: readonly string[];
  readonly excluded_paths: readonly string[];
  readonly unknown_paths: readonly string[];
  readonly unresolved_imports: readonly { readonly source: string; readonly specifier: string; readonly reason: string }[];
  readonly truncated: boolean;
  readonly authority: "reviewed_input_only";
}

export interface VerificationPlanInput {
  readonly acceptance: PlanInputSegment<readonly PlanAcceptanceItem[]>;
  readonly changeSurface: PlanInputSegment<PlanChangeSurface>;
  readonly environment: PlanInputSegment<PlanEnvironmentFacts | null>;
  readonly toolBindings: PlanInputSegment<readonly PlanToolBinding[]>;
  readonly permit: PlanInputSegment<PlanPermitFacts | null>;
  readonly reviewedScope?: PlanInputSegment<PlanReviewedScope>;
  readonly informational?: PlanInformationalFacts;
}

// ============================================================
// 输出合同（snake_case 文件世界——test-planning-and-reporting §2 建议字段逐字）
// ============================================================

export interface VerificationPlanItem {
  readonly acceptance_ref: string;
  /**
   * W1-FR04 场景身份（加性可选）：acceptance 声明场景时 REQUIRED 条目按场景展开
   * （acceptance×capability×scenario——每场景独立义务条目，run/复用/终验 cohort
   * 以 scenario_ref 进 GRN note marker）。无场景条目无此键（legacy 零破坏）。
   */
  readonly scenario_ref?: string;
  /**
   * W5-FR10 业务 oracle（加性可选）：场景声明 expected_observation_oracle 时随
   * 条目下传执行面（plan-runner 义务判定消费——v1 报告不得满足带 visible_via
   * 义务的场景；seam 比较器按 oracle 归一）。无 oracle 条目无此键。
   */
  readonly scenario_oracle?: BusinessObservationOracle;
  /**
   * W5-FR09 seam 义务（加性可选）：场景声明 mock_real_seam 时随条目下传——
   * resolved_bindings 按 seam_role 双腿展开；缺任一腿=seam 义务未满足。
   */
  readonly seam_obligation?: ScenarioSeamObligation;
  readonly evidence_requirement: string;
  readonly capability: PlanCapabilityWord;
  readonly method: string;
  readonly resolved_tool: string | null;
  /** Deterministic, execution-ready obligations selected from the unified registry. */
  readonly resolved_bindings: readonly VerificationPlanResolvedBinding[];
  readonly tool_gap: string | null;
  readonly target: readonly string[];
  readonly environment: string | null;
  readonly applicability: PlanApplicability;
  readonly reason: string;
  readonly prerequisite: readonly string[];
  readonly expected_evidence: string;
  /** 本切片不裁安全义务——显式 null（非缺省；安全面归后续切片）。 */
  readonly safety_requirement: null;
  readonly execution_dependency: readonly string[];
}

export type PlanUnknownKind =
  | "undeclared_face"
  | "unjudged_capability"
  | "unclaimed_face_capability"
  | "input_unknown";

export interface PlanUnknownItem {
  readonly kind: PlanUnknownKind;
  readonly ref: string;
  readonly detail: string;
  readonly source_ref: string;
}

export interface VerificationPlan {
  readonly items: readonly VerificationPlanItem[];
  readonly unknowns: readonly PlanUnknownItem[];
  readonly informational: PlanInformationalFacts | null;
  readonly reviewed_scope?: PlanReviewedScope;
  readonly inputs_fingerprint: string;
}

function validateReviewedScope(scope: PlanReviewedScope): void {
  requireNonEmptyString(scope.task_ref, "reviewedScope.task_ref");
  requireNonEmptyString(scope.review_ref, "reviewedScope.review_ref");
  requireNonEmptyString(scope.observation_ref, "reviewedScope.observation_ref");
  requireNonEmptyString(scope.report_sha256, "reviewedScope.report_sha256");
  requireNonEmptyString(scope.source_sha, "reviewedScope.source_sha");
  if (scope.freshness !== "fresh" || scope.authority !== "reviewed_input_only") {
    throw schemaInvalid("reviewedScope 只接受 freshness=fresh 且 authority=reviewed_input_only", "过期或不可判输入不得进入验证计划");
  }
  const canonical = (values: readonly string[], path: string): string[] => {
    const checked = requireStringArray(values, path);
    if (new Set(checked).size !== checked.length || checked.some((value, index) => index > 0 && checked[index - 1]! > value)) {
      throw schemaInvalid(`${path} 必须去重并按码点序稳定排序`, "reviewed scope 生产方须输出 canonical arrays");
    }
    return checked;
  };
  canonical(scope.declared_roots, "reviewedScope.declared_roots");
  const groups = [scope.accepted_paths, scope.excluded_paths, scope.unknown_paths];
  const all = groups.flatMap((group, index) => canonical(group, `reviewedScope.decisions[${index}]`));
  if (new Set(all).size !== all.length) throw schemaInvalid("reviewedScope decision 路径跨状态重复", "accepted/excluded/unknown 必须互斥");
  if (!Array.isArray(scope.unresolved_imports) || typeof scope.truncated !== "boolean") throw schemaInvalid("reviewedScope unresolved/truncated 词形非法", "重新采纳 scope review");
  scope.unresolved_imports.forEach((row, index) => {
    requireNonEmptyString(row?.source, `reviewedScope.unresolved_imports[${index}].source`);
    requireNonEmptyString(row?.specifier, `reviewedScope.unresolved_imports[${index}].specifier`);
    requireNonEmptyString(row?.reason, `reviewedScope.unresolved_imports[${index}].reason`);
  });
}

// ============================================================
// fail-closed 校验（SCHEMA_INVALID；禁静默当空表/禁矛盾输入放行）
// ============================================================

function schemaInvalid(message: string, hint: string): GovernanceError {
  return new GovernanceError("SCHEMA_INVALID", message, hint);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw schemaInvalid(`${path} 须为非空字符串（fail-closed——禁静默当空表）`, `plan-compiler 输入合同校验失败于 ${path}`);
  }
  return value;
}

function requireStringOrNull(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw schemaInvalid(`${path} 须为 string 或 null`, `plan-compiler 输入合同校验失败于 ${path}`);
  }
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw schemaInvalid(`${path} 须为 string[]`, `plan-compiler 输入合同校验失败于 ${path}`);
  }
  return value.map((entry, index) => requireNonEmptyString(entry, `${path}[${index}]`));
}

function requireCapabilityWord(value: unknown, path: string): PlanCapabilityWord {
  if (typeof value !== "string" || !(PLAN_CAPABILITY_WORDS as readonly string[]).includes(value)) {
    throw schemaInvalid(
      `${path} = ${String(value)} 不在 capability 词形闭包（${PLAN_CAPABILITY_WORDS.join("/")}）`,
      "plan-compiler capability 词形闭包=kernel 局部词 TODO(vocab-pr)（SP 提案待追认）",
    );
  }
  return value as PlanCapabilityWord;
}

function validateSegment<T>(
  segment: PlanInputSegment<T> | undefined,
  name: string,
): { value: T; sourceRef: string; unknowns: readonly string[] } {
  if (segment === undefined || segment === null || typeof segment !== "object") {
    throw schemaInvalid(`输入段 ${name} 缺席（须为 {value, source_ref, version, unknowns} 包装）`, `plan-compiler 输入合同：${name} 段缺失`);
  }
  if (segment.value === undefined) {
    throw schemaInvalid(`输入段 ${name}.value 缺席（null 合法、undefined 非法——缺席必须显式）`, `plan-compiler 输入合同：${name}.value`);
  }
  const sourceRef = requireNonEmptyString(segment.source_ref, `${name}.source_ref`);
  requireStringOrNull(segment.version, `${name}.version`);
  const unknowns = segment.unknowns === undefined ? [] : requireStringArray(segment.unknowns, `${name}.unknowns`);
  return { value: segment.value, sourceRef, unknowns };
}

function validateAcceptance(items: readonly PlanAcceptanceItem[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw schemaInvalid(
      "acceptance 须为非空数组（零验收不构成计划——禁空计划假绿）",
      "plan compile 的验收义务来源：--task（store payload.acceptance）或 --input 契约文件",
    );
  }
  const seenRefs = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as PlanAcceptanceItem;
    const path = `acceptance[${index}]`;
    if (item === null || typeof item !== "object") {
      throw schemaInvalid(`${path} 须为对象`, "plan-compiler 输入合同校验失败");
    }
    const ref = requireNonEmptyString(item.ref, `${path}.ref`);
    if (seenRefs.has(ref)) {
      throw schemaInvalid(`${path}.ref 重复：${ref}（acceptance ref 须唯一）`, "plan-compiler 输入合同校验失败");
    }
    seenRefs.add(ref);
    requireNonEmptyString(item.statement, `${path}.statement`);
    requireStringOrNull(item.oracle_ref, `${path}.oracle_ref`);
    if (!Array.isArray(item.requires)) {
      throw schemaInvalid(`${path}.requires 须为数组`, "plan-compiler 输入合同校验失败");
    }
    const requires = item.requires.map((cap, capIndex) => requireCapabilityWord(cap, `${path}.requires[${capIndex}]`));
    if (new Set(requires).size !== requires.length) {
      throw schemaInvalid(`${path}.requires 含重复 capability`, "plan-compiler 输入合同校验失败");
    }
    if (!Array.isArray(item.exclusions)) {
      throw schemaInvalid(`${path}.exclusions 须为数组`, "plan-compiler 输入合同校验失败");
    }
    const excludedCaps: PlanCapabilityWord[] = [];
    for (let exIndex = 0; exIndex < item.exclusions.length; exIndex += 1) {
      const exclusion = item.exclusions[exIndex] as { capability?: unknown; basis?: unknown };
      const exPath = `${path}.exclusions[${exIndex}]`;
      const cap = requireCapabilityWord(exclusion.capability, `${exPath}.capability`);
      requireNonEmptyString(exclusion.basis, `${exPath}.basis`);
      excludedCaps.push(cap);
    }
    if (new Set(excludedCaps).size !== excludedCaps.length) {
      throw schemaInvalid(`${path}.exclusions 含重复 capability（排除一次足矣——重复=判定矛盾）`, "plan-compiler 输入合同校验失败");
    }
    const conflict = requires.filter((cap) => excludedCaps.includes(cap));
    if (conflict.length > 0) {
      throw schemaInvalid(
        `${path} requires∩exclusions 冲突：${conflict.join("/")}（同一能力同一条验收不得既申报又排除）`,
        "plan-compiler 判定语义：排除优先于申报；二者同现=输入矛盾，fail-closed",
      );
    }
    validateAcceptanceScenarios(item, path);
  }
}

/** scenario_ref 禁携带 GRN note marker 保留字（；/换行）——marker 语法卫生 fail-closed。 */
const SCENARIO_REF_FORBIDDEN = /[；\r\n]/;

function validateAcceptanceScenarios(item: PlanAcceptanceItem, path: string): void {
  if (item.scenarios === undefined) return;
  if (!Array.isArray(item.scenarios)) {
    throw schemaInvalid(
      `${path}.scenarios 须为数组（空数组=显式「场景义务为零」申报；缺席=legacy 无矩阵义务）`,
      "plan-compiler 场景契约（W1-FR04）：scenarios 挂 Acceptance 级，局部 scenario_ref + 观察四要素 + 运行时确认声明位",
    );
  }
  const seenRefs = new Set<string>();
  for (let index = 0; index < item.scenarios.length; index += 1) {
    const scenario = item.scenarios[index] as PlanAcceptanceScenario;
    const scPath = `${path}.scenarios[${index}]`;
    if (scenario === null || typeof scenario !== "object") {
      throw schemaInvalid(`${scPath} 须为对象`, "plan-compiler 场景契约（W1-FR04）校验失败");
    }
    const scenarioRef = requireNonEmptyString(scenario.scenario_ref, `${scPath}.scenario_ref`);
    if (SCENARIO_REF_FORBIDDEN.test(scenarioRef)) {
      throw schemaInvalid(
        `${scPath}.scenario_ref 携带保留字（；/换行）——场景身份以 scenario_ref=<局部键> 进 GRN note marker，保留字会破坏 marker 解析`,
        "plan-compiler 场景契约（W1-FR04）：scenario_ref 是 task 内稳定局部键（marker 语法卫生）",
      );
    }
    if (seenRefs.has(scenarioRef)) {
      throw schemaInvalid(
        `${scPath}.scenario_ref 重复：${scenarioRef}（重复项不吞分母——fail-closed 禁缩分母）`,
        "plan-compiler 场景契约（W1-FR04）：同条验收内 scenario_ref 须唯一；显式缺口不静默合并",
      );
    }
    seenRefs.add(scenarioRef);
    requireNonEmptyString(scenario.precondition, `${scPath}.precondition`);
    requireNonEmptyString(scenario.interaction, `${scPath}.interaction`);
    requireStringArray(scenario.state_dimensions ?? null, `${scPath}.state_dimensions`);
    requireNonEmptyString(scenario.expected_observation, `${scPath}.expected_observation`);
    if (typeof scenario.runtime_confirmation_required !== "boolean") {
      throw schemaInvalid(
        `${scPath}.runtime_confirmation_required 须为 boolean（声明位须显式——禁缺省猜测）`,
        "plan-compiler 场景契约（W1-FR04）：true=本场景观察须运行时确认（消费归运行时证明类型链）",
      );
    }
    validateScenarioOracle(scenario.expected_observation_oracle, `${scPath}.expected_observation_oracle`);
    validateScenarioSeam(scenario.mock_real_seam, `${scPath}.mock_real_seam`);
  }
}

/** oracle 闭合词形校验（W5-FR10 契约 §1）：三键闭包、词表、键值词形，额外键拒绝。 */
const ORACLE_CLOSURE_KEYS = ["visible_via", "filter_context", "mapping_fields"] as const;

function validateScenarioOracle(value: unknown, path: string): void {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw schemaInvalid(
      `${path} 须为对象（{visible_via, filter_context?, mapping_fields} 闭合词形）`,
      "plan-compiler 场景契约（W5-FR10）：业务 oracle=「保存后何处可见」的机器可判声明（三类观察不可折叠）",
    );
  }
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!(ORACLE_CLOSURE_KEYS as readonly string[]).includes(key)) {
      throw schemaInvalid(
        `${path}.${key} 不在 oracle 闭合词形（${ORACLE_CLOSURE_KEYS.join("/")}——额外键拒绝，fail-closed）`,
        "plan-compiler 场景契约（W5-FR10）：oracle 词形闭包校验（可加细不得放宽——新义务键走契约修订）",
      );
    }
  }
  if (typeof row["visible_via"] !== "string" || !(OBSERVATION_CHANNEL_VALUES as readonly string[]).includes(row["visible_via"])) {
    throw schemaInvalid(
      `${path}.visible_via = ${String(row["visible_via"])} 不在观察通道词表（${OBSERVATION_CHANNEL_VALUES.join("/")}）`,
      "plan-compiler 场景契约（W5-FR10）：可见性义务声明在哪条观察通道可见（词表三值闭包）",
    );
  }
  const filterContext = row["filter_context"];
  if (filterContext !== undefined) {
    if (filterContext === null || typeof filterContext !== "object" || Array.isArray(filterContext)) {
      throw schemaInvalid(
        `${path}.filter_context 须为对象（键值均非空字符串的过滤上下文声明）`,
        "plan-compiler 场景契约（W5-FR10）：filter_context 声明重读时的过滤上下文（project/actor/scope）",
      );
    }
    for (const [key, entry] of Object.entries(filterContext as Record<string, unknown>)) {
      if (key.trim().length === 0 || typeof entry !== "string" || entry.trim().length === 0) {
        throw schemaInvalid(
          `${path}.filter_context[${String(key)}] 键值均须非空字符串`,
          "plan-compiler 场景契约（W5-FR10）：过滤上下文键值是重读对账的身份面（空值=不可对账缺口）",
        );
      }
    }
  }
  requireStringArray(row["mapping_fields"] ?? null, `${path}.mapping_fields`);
}

/** seam 义务闭合词形校验（W5-FR09 契约 §4）：两键闭包 + operation_id 非空。 */
function validateScenarioSeam(value: unknown, path: string): void {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw schemaInvalid(
      `${path} 须为对象（{operation_id, contract_ref} 闭合词形）`,
      "plan-compiler 场景契约（W5-FR09）：seam 义务绑定同一稳定 operation/contract/scenario 身份",
    );
  }
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (key !== "operation_id" && key !== "contract_ref") {
      throw schemaInvalid(
        `${path}.${key} 不在 seam 闭合词形（operation_id/contract_ref——额外键拒绝，fail-closed）`,
        "plan-compiler 场景契约（W5-FR09）：seam 义务词形闭包校验",
      );
    }
  }
  requireNonEmptyString(row["operation_id"], `${path}.operation_id`);
  requireStringOrNull(row["contract_ref"], `${path}.contract_ref`);
}

function validateChangeSurface(surface: PlanChangeSurface): Map<PlanChangeFaceKind, PlanChangeFace> {
  requireStringArray(surface.changed_paths ?? null, "changeSurface.changed_paths");
  requireStringArray(surface.affected_consumers ?? null, "changeSurface.affected_consumers");
  if (!Array.isArray(surface.faces)) {
    throw schemaInvalid("changeSurface.faces 须为数组", "plan-compiler 输入合同校验失败");
  }
  const byKind = new Map<PlanChangeFaceKind, PlanChangeFace>();
  for (let index = 0; index < surface.faces.length; index += 1) {
    const face = surface.faces[index] as PlanChangeFace;
    const path = `changeSurface.faces[${index}]`;
    if (
      typeof face?.kind !== "string" ||
      !(PLAN_CHANGE_FACE_KINDS as readonly string[]).includes(face.kind)
    ) {
      throw schemaInvalid(
        `${path}.kind = ${String(face?.kind)} 不在 face 词形闭包（${PLAN_CHANGE_FACE_KINDS.join("/")}）`,
        "plan-compiler face 词形闭包=SP 提案待追认（TODO(vocab-pr)）",
      );
    }
    if (typeof face.present !== "boolean") {
      throw schemaInvalid(`${path}.present 须为 boolean（在座性是显式申报，非猜测）`, "plan-compiler 输入合同校验失败");
    }
    requireNonEmptyString(face.basis, `${path}.basis`);
    if (byKind.has(face.kind)) {
      throw schemaInvalid(`${path}.kind 重复：${face.kind}（每 face kind 恰一条申报）`, "plan-compiler 输入合同校验失败");
    }
    byKind.set(face.kind, face);
  }
  return byKind;
}

function validateEnvironment(value: PlanEnvironmentFacts | null): void {
  if (value === null) return;
  requireNonEmptyString(value.ref, "environment.ref");
  if (typeof value.grounded !== "boolean") {
    throw schemaInvalid("environment.grounded 须为 boolean（Ground 三态显式）", "plan-compiler 输入合同校验失败");
  }
  requireStringArray(value.notes ?? null, "environment.notes");
}

function validateToolBindings(bindings: readonly PlanToolBinding[]): void {
  if (!Array.isArray(bindings)) {
    throw schemaInvalid("toolBindings 须为数组（零绑定合法——REQUIRED 保持 + tool_gap）", "plan-compiler 输入合同校验失败");
  }
  const seen = new Set<string>();
  const seenLegacyTools = new Set<string>();
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index] as PlanToolBinding;
    const path = `toolBindings[${index}]`;
    requireNonEmptyString(binding.tool_id, `${path}.tool_id`);
    if (binding.binding_id !== undefined) {
      const bindingId = requireNonEmptyString(binding.binding_id, `${path}.binding_id`);
      if (seen.has(bindingId)) {
        throw schemaInvalid(`${path}.binding_id 重复：${bindingId}`, "plan-compiler 输入合同校验失败");
      }
      seen.add(bindingId);
      requireNonEmptyString(binding.gate, `${path}.gate`);
      requireNonEmptyString(binding.gate_def, `${path}.gate_def`);
      if (binding.seam_role !== undefined && !(SEAM_ROLE_VALUES as readonly string[]).includes(binding.seam_role)) {
        throw schemaInvalid(
          `${path}.seam_role = ${String(binding.seam_role)} 不在 seam 腿角色词表（${SEAM_ROLE_VALUES.join("/")}）`,
          "plan-compiler 场景契约（W5-FR09）：seam 双腿 binding 须显式声明 seam_role=mock/real",
        );
      }
    } else if (binding.gate !== undefined || binding.gate_def !== undefined) {
      throw schemaInvalid(`${path} gate/gate_def 必须与 binding_id 同时在场`, "plan-compiler 输入合同校验失败");
    } else {
      if (seenLegacyTools.has(binding.tool_id)) {
        throw schemaInvalid(`${path}.tool_id 重复：${binding.tool_id}`, "plan-compiler 输入合同校验失败");
      }
      seenLegacyTools.add(binding.tool_id);
    }
    if (!Array.isArray(binding.capabilities) || binding.capabilities.length === 0) {
      throw schemaInvalid(`${path}.capabilities 须为非空数组（绑定须声明覆盖能力）`, "plan-compiler 输入合同校验失败");
    }
    for (let capIndex = 0; capIndex < binding.capabilities.length; capIndex += 1) {
      requireCapabilityWord(binding.capabilities[capIndex], `${path}.capabilities[${capIndex}]`);
    }
    requireNonEmptyString(binding.source_ref, `${path}.source_ref`);
    requireStringOrNull(binding.version, `${path}.version`);
    if (typeof binding.available !== "boolean") {
      throw schemaInvalid(`${path}.available 须为 boolean（在位性是显式判定）`, "plan-compiler 输入合同校验失败");
    }
    requireNonEmptyString(binding.availability_reason, `${path}.availability_reason`);
  }
}

/**
 * CONTROL_DATA_FLOW_RUNTIME gate 词形（seam 双腿展开适用面——mutation/visibility
 * 语义比较只对运行时腿成立；静态 gate 无副作用语义不参与双腿展开）。
 */
const SEAM_EXPANSION_GATE = "CONTROL_DATA_FLOW_RUNTIME";

function resolveBindingObligations(
  capability: PlanCapabilityWord,
  bindings: readonly PlanToolBinding[],
  seam: ScenarioSeamObligation | null = null,
): VerificationPlanResolvedBinding[] {
  const selected: VerificationPlanResolvedBinding[] = [];
  for (const gate of PLAN_CAPABILITY_GATE_NAMES[capability]) {
    const covering = bindings
      .filter(
        (binding) =>
          binding.binding_id !== undefined &&
          binding.gate === gate &&
          binding.capabilities.includes(capability),
      )
      .sort((a, b) => {
        const left = a.binding_id as string;
        const right = b.binding_id as string;
        return left < right ? -1 : left > right ? 1 : 0;
      });
    // W5-FR09 seam 双腿展开：seam 场景的 runtime gate 按 seam_role 各选一腿
    // （每腿独立 obligation/GRN——缺腿=义务未满足，执行期 fail-closed；腿内选择
    // 优先 available，码点序兜底与既有单腿纪律同源）。非 runtime gate 照旧单 binding。
    if (seam !== null && gate === SEAM_EXPANSION_GATE) {
      for (const role of SEAM_ROLE_VALUES) {
        const pool = covering.filter((binding) => binding.seam_role === role);
        const chosen = pool.find((candidate) => candidate.available) ?? pool[0];
        if (chosen !== undefined) {
          selected.push({
            binding_id: chosen.binding_id as string,
            tool: chosen.tool_id,
            gate,
            gate_def: chosen.gate_def as string,
            seam_role: role,
          });
        }
      }
      continue;
    }
    const binding = covering.find((candidate) => candidate.available) ?? covering[0];
    if (binding === undefined) continue;
    selected.push({
      binding_id: binding.binding_id as string,
      tool: binding.tool_id,
      gate,
      gate_def: binding.gate_def as string,
    });
  }
  return selected;
}

/**
 * seam 双腿缺席缺口（W5-FR09：缺任一腿=seam 义务未满足——编译期 tool_gap 点名
 * 缺席腿并带登记路标，执行期 plan-runner fail-closed 非绿）。
 */
function seamLegGap(
  seam: ScenarioSeamObligation,
  resolved: readonly VerificationPlanResolvedBinding[],
): string | null {
  const legs = resolved.filter((binding) => binding.seam_role !== undefined);
  const missing = SEAM_ROLE_VALUES.filter((role) => !legs.some((leg) => leg.seam_role === role));
  if (missing.length === 0) return null;
  return `seam 义务（operation=${seam.operation_id}）${missing.join("/")} 腿绑定缺席——须在 .pomaster/tools/bindings.json 登记 seam_role=${missing.join("/")} 的 ${SEAM_EXPANSION_GATE} binding；缺腿场景执行期 seam 义务不满足（非绿）`;
}

function bindingObligationGap(
  capability: PlanCapabilityWord,
  bindings: readonly PlanToolBinding[],
  resolved: readonly VerificationPlanResolvedBinding[],
): string | null {
  // Legacy detector projections carry no binding identity; preserve their existing gap semantics.
  if (!bindings.some((binding) => binding.binding_id !== undefined)) return null;
  const issues: string[] = [];
  for (const gate of PLAN_CAPABILITY_GATE_NAMES[capability]) {
    const selected = resolved.find((binding) => binding.gate === gate);
    if (selected === undefined) {
      issues.push(`${gate}=binding 缺席`);
      continue;
    }
    const source = bindings.find((binding) => binding.binding_id === selected.binding_id);
    if (source?.available !== true) {
      issues.push(`${gate}=${selected.binding_id} 不可用（${source?.availability_reason ?? "状态缺席"}）`);
    }
  }
  return issues.length === 0
    ? null
    : `ToolBinding obligation 未就绪：${issues.join("；")}——义务保持 REQUIRED（无工具≠N/A）`;
}

function validatePermit(value: PlanPermitFacts | null): void {
  if (value === null) return;
  requireStringOrNull(value.permit_ref, "permit.permit_ref");
  requireStringArray(value.scope_subject_ids ?? null, "permit.scope_subject_ids");
}

// ============================================================
// 编译核（纯函数；零 fs 零墙钟）
// ============================================================

function sortedUnique(words: readonly PlanCapabilityWord[]): PlanCapabilityWord[] {
  return [...new Set(words)].sort();
}

function resolveTool(
  capability: PlanCapabilityWord,
  bindings: readonly PlanToolBinding[],
): { resolved: string | null; gap: string | null } {
  // 码点序（非 localeCompare——ICU collation 下标点权重随环境 locale 变化，
  // 破坏跨环境字节稳定；catalog/analyzer-import-graph 同款码点序惯例）。
  const covering = bindings
    .filter((binding) => binding.capabilities.includes(capability))
    .sort((a, b) => (a.tool_id < b.tool_id ? -1 : a.tool_id > b.tool_id ? 1 : 0));
  const available = covering.filter((binding) => binding.available);
  if (available.length > 0) {
    return { resolved: (available[0] as PlanToolBinding).tool_id, gap: null };
  }
  if (covering.length > 0) {
    const reasons = covering
      .map((binding) => `${binding.tool_id}（${binding.availability_reason}）`)
      .join("；");
    return {
      resolved: null,
      gap: `工具绑定在座但不可用：${reasons}——义务保持 REQUIRED（无工具≠N/A；执行态归 NOT_RUN/BLOCKED 域）`,
    };
  }
  return {
    resolved: null,
    gap: `无工具绑定覆盖 ${capability}（工具缺口——义务保持 REQUIRED（无工具≠N/A）；ToolBinding 统一面=R1-4 接缝）`,
  };
}

/**
 * 编译 Verification Plan（W1 R1-3 入口；纯函数——同输入→同输出字节稳定）。
 * 判定语义见头注「判定语义」节；applicability 三值 + unknown 保留 + 无工具≠N/A。
 */
export function compileVerificationPlan(input: VerificationPlanInput): VerificationPlan {
  // —— 输入段校验（fail-closed；词形闭包钉死）——
  const acceptanceSegment = validateSegment(input?.acceptance, "acceptance");
  const changeSurfaceSegment = validateSegment(input?.changeSurface, "changeSurface");
  const environmentSegment = validateSegment(input?.environment, "environment");
  const toolBindingsSegment = validateSegment(input?.toolBindings, "toolBindings");
  const permitSegment = validateSegment(input?.permit, "permit");
  const reviewedScopeSegment = input.reviewedScope === undefined ? null : validateSegment(input.reviewedScope, "reviewedScope");

  validateAcceptance(acceptanceSegment.value as readonly PlanAcceptanceItem[]);
  const faceByKind = validateChangeSurface(changeSurfaceSegment.value as PlanChangeSurface);
  validateEnvironment(environmentSegment.value as PlanEnvironmentFacts | null);
  validateToolBindings(toolBindingsSegment.value as readonly PlanToolBinding[]);
  validatePermit(permitSegment.value as PlanPermitFacts | null);
  if (reviewedScopeSegment !== null) validateReviewedScope(reviewedScopeSegment.value as PlanReviewedScope);

  const acceptance = acceptanceSegment.value as readonly PlanAcceptanceItem[];
  const surface = changeSurfaceSegment.value as PlanChangeSurface;
  const environment = environmentSegment.value as PlanEnvironmentFacts | null;
  const bindings = toolBindingsSegment.value as readonly PlanToolBinding[];
  const permit = permitSegment.value as PlanPermitFacts | null;
  const reviewedScope = reviewedScopeSegment?.value as PlanReviewedScope | undefined;

  // —— faces 派生能力轴（轴序固定）——
  const presentFaceCaps: PlanCapabilityWord[] = [];
  const absentFaceCaps: PlanCapabilityWord[] = [];
  for (const kind of PLAN_CHANGE_FACE_KINDS) {
    const face = faceByKind.get(kind);
    if (face === undefined) continue;
    (face.present ? presentFaceCaps : absentFaceCaps).push(...FACE_CAPABILITIES[kind]);
  }

  // —— 能力闭包 U = ∪(faces 派生, acceptance requires∪exclusions)——
  const universe = new Set<PlanCapabilityWord>([...presentFaceCaps, ...absentFaceCaps]);
  for (const item of acceptance) {
    for (const cap of item.requires) universe.add(cap);
    for (const exclusion of item.exclusions) universe.add(exclusion.capability);
  }

  // —— 输入矛盾前置闸：requires 命中 absent face（fail-closed）——
  for (const item of acceptance) {
    for (const cap of item.requires) {
      const faceKind = CAPABILITY_FACE[cap];
      if (faceKind !== undefined) {
        const face = faceByKind.get(faceKind);
        if (face !== undefined && !face.present) {
          throw schemaInvalid(
            `acceptance ${item.ref} requires ${cap}，但变更面显式声明 face ${faceKind} 不在座（依据：${face.basis}）——义务申报与变更面自相矛盾，fail-closed`,
            "修正 acceptance.requires 或 changeSurface.faces（present/absent 是显式申报，禁猜测调和）",
          );
        }
      }
    }
  }

  // —— unknowns 装配（确定性序：input_unknown → undeclared_face → unclaimed → unjudged）——
  const unknowns: PlanUnknownItem[] = [];
  const segmentUnknowns: readonly (readonly [string, string, { sourceRef: string; unknowns: readonly string[] }])[] = [
    ["acceptance", "acceptance", acceptanceSegment],
    ["changeSurface", "changeSurface", changeSurfaceSegment],
    ["environment", "environment", environmentSegment],
    ["toolBindings", "toolBindings", toolBindingsSegment],
    ["permit", "permit", permitSegment],
    ...(reviewedScopeSegment === null ? [] : [["reviewedScope", "reviewedScope", reviewedScopeSegment] as const]),
  ];
  for (const [, name, segment] of segmentUnknowns) {
    for (const detail of segment.unknowns) {
      unknowns.push({ kind: "input_unknown", ref: name, detail, source_ref: segment.sourceRef });
    }
  }
  for (const kind of PLAN_CHANGE_FACE_KINDS) {
    if (faceByKind.has(kind)) continue;
    const caps = FACE_CAPABILITIES[kind].join("/");
    unknowns.push({
      kind: "undeclared_face",
      ref: kind,
      detail: `变更面未声明 face ${kind}（present/absent 均未申报）——${caps} 是否有证明义务不可判定，保留 unknown（禁默认 NOT_APPLICABLE）`,
      source_ref: changeSurfaceSegment.sourceRef,
    });
  }
  const claimedCaps = new Set<PlanCapabilityWord>();
  for (const item of acceptance) {
    for (const cap of item.requires) claimedCaps.add(cap);
    for (const exclusion of item.exclusions) claimedCaps.add(exclusion.capability);
  }
  for (const cap of sortedUnique(presentFaceCaps)) {
    if (claimedCaps.has(cap)) continue;
    unknowns.push({
      kind: "unclaimed_face_capability",
      ref: cap,
      detail: `face 在座但无任何验收条目申报 ${cap} 义务——change 级缺口回 Expect 判定（不默认 REQUIRED 也不默认 N/A）`,
      source_ref: changeSurfaceSegment.sourceRef,
    });
  }

  // —— 逐 acceptance × 能力闭包 → plan items（排除优先 → 申报 → absent face → unjudged）——
  const items: VerificationPlanItem[] = [];
  for (const item of acceptance) {
    const required = new Set<PlanCapabilityWord>(item.requires);
    const excluded = new Map<PlanCapabilityWord, string>(
      item.exclusions.map((exclusion) => [exclusion.capability, exclusion.basis]),
    );
    for (const capability of sortedUnique([...universe])) {
      const exclusionBasis = excluded.get(capability);
      if (exclusionBasis !== undefined) {
        items.push({
          acceptance_ref: item.ref,
          evidence_requirement: CAPABILITY_EVIDENCE_REQUIREMENT[capability],
          capability,
          method: CAPABILITY_METHOD[capability],
          resolved_tool: null,
          resolved_bindings: [],
          tool_gap: null,
          target: [],
          environment: environment?.ref ?? null,
          applicability: "NOT_REQUIRED",
          reason: `NOT_REQUIRED：验收 ${item.ref} 显式排除 ${capability}（排除依据：${exclusionBasis}）——能力相关但本验收义务不要求；排除是义务判断，非工具缺席降级`,
          prerequisite: [],
          expected_evidence: "（无——显式排除，零义务零证据）",
          safety_requirement: null,
          execution_dependency: ["parallel"],
        });
        continue;
      }
      if (required.has(capability)) {
        const { resolved, gap } = resolveTool(capability, bindings);
        // W5-FR09：非 seam 场景复用 base 展开（行为字节不变）；seam 场景双腿展开
        // per-scenario（binding 选择权威仍在 compiler——每腿独立 obligation/GRN）。
        const baseResolvedBindings = resolveBindingObligations(capability, bindings);
        const baseObligationGap = bindingObligationGap(capability, bindings, baseResolvedBindings) ?? gap;
        const faceKind = CAPABILITY_FACE[capability];
        const face = faceKind === undefined ? undefined : faceByKind.get(faceKind);
        const faceClause =
          face !== undefined
            ? `变更面命中 face ${faceKind}（${face.basis}）`
            : "验收显式申报、变更面闭包无对应 face（义务来自验收申报，照常成立）";
        const prerequisites: string[] =
          resolved !== null && baseObligationGap === null
            ? [
                `tool ${resolved}（${bindings.find((binding) => binding.tool_id === resolved)?.version ?? "version unknown"}）可用`,
              ]
            : [`工具缺口未解：${baseObligationGap ?? ""}`, "补齐工具绑定前该义务不可执行（执行态只能 NOT_RUN/BLOCKED）"];
        if (environment === null) {
          prerequisites.push("environment 输入缺席（unknown 保留——不默认可执行）");
        } else if (environment.grounded) {
          prerequisites.push(`environment ${environment.ref} 已 Ground`);
        } else {
          prerequisites.push(`environment ${environment.ref} 待 Ground（perception 环境回执——Verify 步供给）`);
        }
        prerequisites.push(
          permit === null
            ? "permit 引用缺席（执行前置——不默认授权）"
            : `permit ${permit.permit_ref ?? "(未引用)"}（scope ${permit.scope_subject_ids.length} 主体）`,
        );
        // W1-FR04 场景展开：acceptance 声明场景时 REQUIRED 义务按场景展开为独立
        // 条目（分母=场景×gate）；无场景条目单条（scenario_ref 键缺席，legacy 零破坏）。
        // 工具解析/prerequisite 与场景正交（只算一次逐场景复用——场景改分母身份，
        // 不改工具可用性判定）。
        const scenarioRows: readonly PlanAcceptanceScenario[] = item.scenarios ?? [];
        const expansions: readonly (PlanAcceptanceScenario | undefined)[] =
          scenarioRows.length > 0 ? scenarioRows : [undefined];
        for (const scenario of expansions) {
          const seam =
            scenario === undefined ? null : scenario.mock_real_seam ?? null;
          const resolvedBindings =
            seam === null
              ? baseResolvedBindings
              : resolveBindingObligations(capability, bindings, seam);
          const seamGap = seam === null ? null : seamLegGap(seam, resolvedBindings);
          const scenarioBaseGap =
            seam === null
              ? baseObligationGap
              : (bindingObligationGap(capability, bindings, resolvedBindings) ?? gap);
          const obligationGap =
            [scenarioBaseGap, seamGap].filter((row) => row !== null).join("；") || null;
          const scenarioClause =
            scenario === undefined
              ? ""
              : `；场景义务 scenario=${scenario.scenario_ref}（precondition：${scenario.precondition}；interaction：${scenario.interaction}${scenario.runtime_confirmation_required ? "；须运行时确认" : ""}${scenario.mock_real_seam !== undefined ? `；seam 义务 operation=${scenario.mock_real_seam.operation_id}（mock/real 双腿各自独立 GRN，缺腿非绿）` : ""}）`;
          const oracleClause =
            scenario === undefined || scenario.expected_observation_oracle === undefined
              ? ""
              : `；oracle：保存后经 ${scenario.expected_observation_oracle.visible_via} 通道可见${scenario.expected_observation_oracle.mapping_fields.length > 0 ? `（须出现字段 ${scenario.expected_observation_oracle.mapping_fields.join("、")}）` : ""}`;
          const scenarioEvidence =
            scenario === undefined
              ? ""
              : `；scenario=${scenario.scenario_ref} 预期观察：「${scenario.expected_observation}」${oracleClause}`;
          items.push({
            acceptance_ref: item.ref,
            ...(scenario === undefined
              ? {}
              : {
                  scenario_ref: scenario.scenario_ref,
                  ...(scenario.expected_observation_oracle !== undefined
                    ? { scenario_oracle: scenario.expected_observation_oracle }
                    : {}),
                  ...(scenario.mock_real_seam !== undefined
                    ? { seam_obligation: scenario.mock_real_seam }
                    : {}),
                }),
            evidence_requirement: CAPABILITY_EVIDENCE_REQUIREMENT[capability],
            capability,
            method: CAPABILITY_METHOD[capability],
            resolved_tool: resolved,
            resolved_bindings: resolvedBindings,
            tool_gap: obligationGap,
            target: [...surface.changed_paths],
            environment: environment?.ref ?? null,
            applicability: "REQUIRED",
            reason: `REQUIRED：验收 ${item.ref} 义务 ${capability}（${item.statement}）——${faceClause}；工具解析见 resolved_tool/tool_gap（缺工具不降级义务）${scenarioClause}`,
            prerequisite: prerequisites,
            expected_evidence: `${CAPABILITY_EVIDENCE_REQUIREMENT[capability]}——GRN 回执入证据链，claim 绑定 ${item.ref}${scenarioEvidence}`,
            safety_requirement: null,
            execution_dependency:
              capability === "ui_interaction" ? ["after:environment_ground"] : ["parallel"],
          });
        }
        continue;
      }
      if (absentFaceCaps.includes(capability)) {
        const faceKind = CAPABILITY_FACE[capability] as PlanChangeFaceKind;
        const face = faceByKind.get(faceKind) as PlanChangeFace;
        items.push({
          acceptance_ref: item.ref,
          evidence_requirement: CAPABILITY_EVIDENCE_REQUIREMENT[capability],
          capability,
          method: CAPABILITY_METHOD[capability],
          resolved_tool: null,
          resolved_bindings: [],
          tool_gap: null,
          target: [],
          environment: environment?.ref ?? null,
          applicability: "NOT_APPLICABLE",
          reason: `NOT_APPLICABLE：变更面显式声明 face ${faceKind} 不在座（依据：${face.basis}）——验收 ${item.ref} 无 ${capability} 证明义务（N/A 有据，非工具缺席降级）`,
          prerequisite: [],
          expected_evidence: "（无——不适用，零义务零证据）",
          safety_requirement: null,
          execution_dependency: ["parallel"],
        });
        continue;
      }
      // 未判定：不默认 REQUIRED 也不默认 N/A → unknown 保留（回 Expect 判定）。
      unknowns.push({
        kind: "unjudged_capability",
        ref: item.ref,
        detail: `验收未申报 ${capability} 义务（requires/exclusions 均缺席）、其变更面也不在座——是否有义务不可判定，保留 unknown`,
        source_ref: acceptanceSegment.sourceRef,
      });
    }
  }

  // items 排序（(acceptance_ref, capability, scenario_ref) 码点序——非 localeCompare，
  // 跨环境字节稳定；canonicalJson/分母对账测试的 [...keys].sort() 同为码点序；
  // W1-FR04 起第三轴=场景身份（无场景条目 scenario_ref 键缺席按空串排首位），
  // 保证场景展开后同 (acceptance, capability) 内场景条目字节稳定。
  items.sort(
    (a, b) =>
      (a.acceptance_ref < b.acceptance_ref ? -1 : a.acceptance_ref > b.acceptance_ref ? 1 : 0) ||
      (a.capability < b.capability ? -1 : a.capability > b.capability ? 1 : 0) ||
      ((a.scenario_ref ?? "") < (b.scenario_ref ?? "") ? -1 : (a.scenario_ref ?? "") > (b.scenario_ref ?? "") ? 1 : 0),
  );

  return {
    items,
    unknowns,
    informational: input.informational ?? null,
    ...(reviewedScope === undefined ? {} : { reviewed_scope: reviewedScope }),
    inputs_fingerprint: sha256OfCanonical({
      acceptance: input.acceptance,
      changeSurface: input.changeSurface,
      environment: input.environment,
      toolBindings: input.toolBindings,
      permit: input.permit,
      informational: input.informational ?? null,
      ...(input.reviewedScope === undefined ? {} : { reviewedScope: input.reviewedScope }),
    }),
  };
}
