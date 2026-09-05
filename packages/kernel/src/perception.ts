/**
 * perception.ts —— Perception 契约 + Environment Doctor 纯函数面
 * （P0.5-4a · PRD v0.5.2 §6 全章；W1-D1 线 T1，研究笔记 §5.1）。
 *
 * PRD 出处（逐字锚）：
 * - §6.1：Observation ≠ Verification ≠ Diagnosis ≠ Evidence；Tool Output ≠ Truth。
 *   本模块只落「观察请求契约 + 环境身份判卷 + 负观察判定」的观察域，不造第二套
 *   Verification Runner（双腿 adapter 原样复用归 T2/批 2）、不造第二套 Human Gate
 *   （VERIFICATION_MAPPING_MISSING 的处置链就是 evaluateQuestionGate 的输入前置）。
 * - §6.2 Four Anchors：每一次「看」必须回答 WHAT（看什么）/ WHERE（从哪里看）/
 *   HOW（怎么看）/ WITH WHAT（用什么看），缺一不可——validateObservationRequest
 *   的四锚校验逐字兑现；「Tool 是实现；Observation Contract 才是治理对象」。
 * - §6.3 Perception Model 最小形态：question 可自然语言；surface / target /
 *   capability / side_effect 必须机器可判；Tool 由 Sensor Resolution 后再绑定
 *   （本契约面不写死 chrome-devtools-mcp 等工具名）。
 * - §6.4 Observation Surface 八值（「不要求立即成为新的 Closed-world Core Vocab」
 *   ——PRD 原文豁免，开放枚举已随 PR-0009 收编（vocab-lock
 *   trace_perception_vocab.observation_surface，模块常量为承载位））。
 * - §6.7 Environment & Instance Identity：观察之前必须有 Doctor，至少确认九项
 *   （Repository/Worktree、Git Revision、Build Identity、Runtime Instance、
 *   Base URL、Environment Class、Data Fixture/Dataset、Auth Role、Feature Flags）；
 *   无法确认观察实例 → WRONG_OR_UNVERIFIED_INSTANCE，Verification 不得 PASS；
 *   安全字段只记录可审计引用，不落 Secret。
 * - §6.13 Observation Receipt：观察不以 Agent 自报为凭证（OBS- 通路编号词形；
 *   进入 Trace/Evidence Sidecar，不进入 Truth Index）。
 * - §6.14 Negative Observation 也是事实：七词形；OBSERVED_ABSENT 有严格四前提
 *   （正确页面 + 正确实例 + Sensor 已工作 + 捕获窗口覆盖操作），否则只是
 *   INCONCLUSIVE——「没看到」不能直接等于「不存在」（防 Agent 幻觉）。
 * - §6.15 Probe Side-effect 四级：READ_ONLY → INTERACTIVE_REVERSIBLE →
 *   MUTATING_REVERSIBLE → IRREVERSIBLE_OR_EXTERNAL；不能因为「只是为了调试」
 *   绕开 Permit（授权消费面 authorizeProbe 归 P1-1b，本批只落词轴 + 规则注记）。
 * - §6.16 Perception Degradation：缺能力必须诚实降级，禁止「工具不可用 → 静默
 *   改成读代码判断 → 仍声称已验证」。
 *
 * 撞族消歧（Owner 已批裁决 8 · 2026-09-01 + 研究笔记 §7 位 6）：本模块
 * CAPABILITY_DEGRADED（感知域降级呈现词）与 @pomaster/schemas vocab 的
 * RUNTIME_DEGRADATION_RULE_IDS.capability_degradation_report（§58 agent 池降级
 * 规则 id）同词根不同概念、两轴正交——感知域观察结果以 NOT_OBSERVABLE 为主词形，
 * CAPABILITY_DEGRADED 只作 gate scopeNote 呈现词，结构性不进 observation
 * receipt 的 result 七负值闭包。
 *
 * 纯函数纪律（runtime-adapter.ts 同款）：全部导出零 IO、零 store 依赖、零墙钟、
 * 零 seq（同输入重放字节稳定，A4）；时间戳禁入任何字段（W1 铁律 5——身份与判定
 * 面无时间维度）。env_ref 词形 ENV.* 非 governed 前缀（16 前缀闭包无 ENV——PR-0008
 * 增补 SPEC. 后闭包 16，ENV./SENSOR. 仍均不在），
 * capability_ref 的 governed closed-world 校验归消费通路（projection/store），
 * 本模块不私设第二套 id 校验（单一镜像纪律）。
 *
 * 批 1 边界（W1-D1 简报逐字）：纯函数 + 词形常量 + 测试，零产品接线——browser
 * 腿环境判卷门（T2）归批 2 W1-B；16-perception-receipts.schema.json defer 批 2
 * （16 号本批归 W1-C，schema 编号随批 2 定）；OBS-/ENVREC- 等新词形以
 * 已随 PR-0009 收编（vocab-lock trace_perception_vocab——原批 1 文件面互斥注记转正）。
 *
 * 批 2 W1-D2 增量（P0.5-4b · PRD §6.13/§14 + Benchmark E + Case H；研究 §5.2 T2）：
 * - buildObservationReceipt（§6.13 Observation Receipt 最小通路类型面）：result=OBSERVED
 *   必须 ≥1 条 artifact 引用（基础设施证明 Artifact 存在——Benchmark E「Observation
 *   Receipt 不得冒充有效业务 Evidence」的本模块级封条）；落盘 schema 定号 **17**；
 * - 产品接线归消费方：browser 腿环境判卷门（gauntlet-lite browser-adapter/browser-legs/
 *   browser-evidence——本模块仍零 IO、零 store 依赖，接线不进本文件）。
 *
 * Batch 5 增量（09-04 vNext CRC 套件 · F 缝口收口，唯一产品判定改动）：buildObservationReceipt
 * 增设 OBSERVED 的 screenshot-only 背书闸（纠错 §31 Case F「截图不能证明 API」/ §9B
 * CRC-F；Case I 封条原只盖 NOT_OBSERVABLE 侧）——OBSERVED 且全部 artifact media 皆为
 * "screenshot" 而 operation 非 "screenshot" → SCHEMA_INVALID。ADR-lite 最小性：只封
 * 「screenshot-only 冒充」单一形态（混合 refs 辅证在场不拒；media↔operation 全量族
 * 矩阵需词表裁定，不在本闸）；词面上 "screenshot" 取 catalog/sensors 材料
 * operations/evidence_types 双侧既有词形 + 07 blob_ref media 开放词先例（
 * SCREENSHOT_MEDIA_WORD 注记），零新词轴零词表私扩；17 号 schema 维持词形冻结面
 * 不随动（media 开放词无轴可裁；absencePreconditions 四前提闸同款「组装层判定
 * 严于 schema」分层先例——schema examples[1] 转录形态只证明词形合法、组装层不再
 * 可达，已知分层差异登记不隐藏）。判定测试落 tests/constitutional/ CRC-F。
 */

import { GovernanceError } from "./errors.js";

// ============================================================
// 词轴（模块常量承载位；已随 PR-0009 入锁 vocab-lock trace_perception_vocab）
// ============================================================

/**
 * Observation Surface 八值（PRD §6.4 逐字，原文行序）。
 * PRD 明言「不要求立即成为新的 Closed-world Core Vocab」——模块局部词轴 +
 * 已随 PR-0009 收编（开放枚举登记——vocab-lock trace_perception_vocab.observation_surface）。
 */
export const OBSERVATION_SURFACE_VALUES = [
  "USER_SURFACE",
  "INTERACTION_STATE",
  "BOUNDARY_IO",
  "RUNTIME_SIGNAL",
  "DATA_STATE",
  "RESOURCE_BEHAVIOR",
  "STRUCTURAL_REALITY",
  "PRODUCTION_REALITY",
] as const;
export type ObservationSurfaceValue = (typeof OBSERVATION_SURFACE_VALUES)[number];

/**
 * Probe Side-effect 四级词形（PRD §6.15 逐字，副作用从轻到重行序）。
 * 授权消费规则（READ_ONLY→Runtime/Tool Scope；INTERACTIVE_REVERSIBLE→Environment /
 * Cleanup Contract；MUTATING_REVERSIBLE→Permit / Sandbox Scope；
 * IRREVERSIBLE_OR_EXTERNAL→Human Approval / explicit Authority）见
 * PROBE_SIDE_EFFECT_RULES；authorizeProbe（Permit 台账消费侧）归 P1-1b。
 */
export const SIDE_EFFECT_CLASS_VALUES = [
  "READ_ONLY",
  "INTERACTIVE_REVERSIBLE",
  "MUTATING_REVERSIBLE",
  "IRREVERSIBLE_OR_EXTERNAL",
] as const;
export type SideEffectClassValue = (typeof SIDE_EFFECT_CLASS_VALUES)[number];

/** 四级各自的 §6.15 原文授权要求（下标与 SIDE_EFFECT_CLASS_VALUES 对齐；逐字注记不发明词形）。 */
export const PROBE_SIDE_EFFECT_RULES: readonly {
  readonly cls: SideEffectClassValue;
  readonly requires: string;
}[] = [
  { cls: "READ_ONLY", requires: "可在 Runtime/Tool Scope 内执行" },
  { cls: "INTERACTIVE_REVERSIBLE", requires: "需 Environment / Cleanup Contract" },
  { cls: "MUTATING_REVERSIBLE", requires: "必须落 Permit / Sandbox Scope" },
  { cls: "IRREVERSIBLE_OR_EXTERNAL", requires: "Human Approval / explicit Authority" },
];

/**
 * 负观察七词形（PRD §6.14 逐字，原文行序）。
 * 「没看到」不能直接等于「不存在」——七值分岔是 Case K 的机器判据。
 */
export const NEGATIVE_OBSERVATION_VALUES = [
  "OBSERVED_ABSENT",
  "NOT_OBSERVABLE",
  "SENSOR_UNAVAILABLE",
  "PERMISSION_DENIED",
  "ENVIRONMENT_INVALID",
  "PROBE_FAILED",
  "INCONCLUSIVE",
] as const;
export type NegativeObservationValue = (typeof NEGATIVE_OBSERVATION_VALUES)[number];

/**
 * Observation receipt 的 result 全轴 = OBSERVED（§6.13 例文逐字）+ 七负值（§6.14）。
 * 单轴定案（研究 §5.1「OBSERVED + 七负值，或分轴——呈报时定」取单轴更简形态）：
 * receipt.result 一字段必须可承载正负两向观察结果，分轴会造第二判卷位。
 * OBSERVED 只能由成功观察通路产出——judgeNegativeObservation 结构性不产出
 * OBSERVED（负观察判定器永不说「看到了」）。
 */
export const OBSERVATION_RESULT_VALUES = [
  "OBSERVED",
  ...NEGATIVE_OBSERVATION_VALUES,
] as const;
export type ObservationResultValue = (typeof OBSERVATION_RESULT_VALUES)[number];

/**
 * Environment Doctor verdict 二值（PRD §6.7 逐字）。
 * 二态定案（W1-D1 简报逐字「READY|WRONG_OR_UNVERIFIED_INSTANCE 二态」）：
 * 环境连探都探不了的情形不在此轴发明第三值——观察侧如实落 §6.14 的
 * ENVIRONMENT_INVALID 负观察词形（已在 NEGATIVE_OBSERVATION_VALUES 闭包内，
 * 零发明词形）；WRONG_OR_UNVERIFIED_INSTANCE 禁 PASS 的消费门归 T2（批 2）。
 */
export const ENVIRONMENT_DOCTOR_VERDICT_VALUES = [
  "READY",
  "WRONG_OR_UNVERIFIED_INSTANCE",
] as const;
export type EnvironmentDoctorVerdict = (typeof ENVIRONMENT_DOCTOR_VERDICT_VALUES)[number];

/**
 * 感知域降级呈现词（PRD §6.16 词形）——已随 PR-0009 收编（vocab-lock trace_perception_vocab.presentation_word_forms）。
 * 撞族消歧（Owner 裁决 8）：与 RUNTIME_DEGRADATION_RULE_IDS.capability_degradation_report
 * （§58 agent 池降级规则 id）同词根不同概念——本词形是感知域 scopeNote 呈现词，
 * 不入 RUNTIME_DEGRADATION_RULE_IDS 通路；感知域观察结果以 NOT_OBSERVABLE
 * （NEGATIVE_OBSERVATION_VALUES 成员）为主词形，CAPABILITY_DEGRADED 结构性
 * 不进 OBSERVATION_RESULT_VALUES 闭包（降级不是一种观察结果，是能力面的诚实申报）。
 */
export const CAPABILITY_DEGRADED = "CAPABILITY_DEGRADED" as const;

/**
 * OBS 通路编号词形（PRD §6.13 observation_id: OBS-...；GRN-[0-9]+ 变宽先例）。
 * 状态/证据面通路编号词形，非 governed 前缀，不入 id_namespace 闭包
 * （AGX-n 头注同款注记，execution.ts §25.4 先例）——已随 PR-0009 登记（id_namespace.state_plane_refs OBS-/ENVREC- 注记）。
 * 注：PRD §6.11 hypothesis supports 例文另现 OBS.NETWORK.17 点形——那是诊断假设
 * 对观察的引用记法（P1-1b 落点），与本通路编号词形的归一随词汇表 PR 裁定，
 * 本批只登记 OBS- 通路编号形（研究 §5.1 定案）。
 */
export const OBS_ID_PATTERN = /^OBS-[0-9]+$/;

/** ENVREC 通路编号词形（PRD §6.13 environment_receipt_ref: ENVREC-...；OBS 同款先例注记）。 */
export const ENVREC_ID_PATTERN = /^ENVREC-[0-9]+$/;

/**
 * CRC-F 缝口判定的双侧既有词形（零新词轴）：media 开放词（07 definitions.blob_ref）
 * 与 §6.5 例文逐字 operation 词形在 catalog/sensors 材料的 operations/evidence_types
 * 双侧既有在册（browser-evidence 落盘 screenshot blob 恒 media:"screenshot"）。
 * 本常量只引用既有词形，不登记新轴——媒体词形维持局部不设轴（PR-0009 处置注记）。
 */
const SCREENSHOT_MEDIA_WORD = "screenshot";

// ============================================================
// §6.2/§6.3 Observation Request 契约 + 四锚校验
// ============================================================

/** 观察目标（§6.3 yaml target 三键逐键；instance_ref 观察前可空——doctor 确认后回填）。 */
export interface ObservationTarget {
  /** CAPABILITY.*（governed 前缀；closed-world 校验归消费通路，见头注）。 */
  readonly capability_ref: string;
  /** ENV.*（§6.3 例文 ENV.LOCAL.DEV；非 governed 前缀）。 */
  readonly environment_ref: string;
  readonly instance_ref: string | null;
}

/**
 * Observation Request（§6.3 最小概念形态 + §6.2 四锚逐字兑现）。
 * 字段名 snake_case（文件世界形态，与 §6.3 yaml 例文逐键对齐）。
 * - WHAT 锚 = question（自然语言合法）+ expected_observation（机器可判预期事实 ≥1）；
 * - WHERE 锚 = surface（§6.4 八值闭包）+ target（看的是谁）；
 * - HOW 锚 = operation（观察动作——「必须定义观察动作，而不能只有 Tool Name」；
 *   词形与 §6.13 receipt.operation 对齐，请求→回执链同词）；
 * - WITH WHAT 锚 = sensor_capability（sensor 能力要求；词形轴 SENSOR.* 已随 PR-0009 收编
 *   （catalog_layer_vocab.material_id_prefixes），本契约只校验在场非空——Tool 由 Sensor Resolution
 *   后再绑定，§6.3 逐字）。
 */
export interface ObservationRequest {
  /** 观察意图（§6.3 例文 REPRODUCE；PRD 仅此一词形不成轴——单值维持局部不设轴，PR-0009 处置注记；可空显式）。 */
  readonly intent: string | null;
  readonly question: string;
  readonly operation: string;
  readonly sensor_capability: string;
  readonly target: ObservationTarget;
  readonly surface: ObservationSurfaceValue;
  readonly expected_observation: readonly string[];
  readonly side_effect: SideEffectClassValue;
}

/** 非空串判定（trim 后非空；全空白按缺失处理——四锚「缺一不可」含空白申报）。 */
function isNotBlank(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Observation Request 四锚校验（纯函数；§6.2「缺一不可」+ §6.3 机器可判纪律）。
 * 违例 → GovernanceError(SCHEMA_INVALID)，details 聚合全部缺陷（不首错即抛——
 * escalation 纪律：一次报全，调用方一轮修完）。四桶：
 * - WHAT：question 空 / expected_observation 空或含空白项；
 * - WHERE：surface 词轴外 / target.capability_ref 或 target.environment_ref 空；
 * - HOW：operation 空（只报工具名不报动作 = §6.2 逐字违例）；
 * - WITH WHAT：sensor_capability 空。
 * side_effect 词轴外同 door SCHEMA_INVALID（§6.3「side_effect 必须机器可判」）。
 */
export function validateObservationRequest(request: ObservationRequest): void {
  const missingAnchors: string[] = [];
  const invalidValues: { readonly field: string; readonly value: unknown; readonly anchor: string }[] = [];

  // —— WHAT ——
  if (!isNotBlank(request.question)) {
    missingAnchors.push("WHAT: question 为空——看什么（目标事实/现象）必须申报（§6.2 WHAT；自然语言合法）");
  }
  if (
    !Array.isArray(request.expected_observation) ||
    request.expected_observation.length === 0 ||
    request.expected_observation.some((item) => !isNotBlank(item))
  ) {
    missingAnchors.push(
      "WHAT: expected_observation 为空或含空白项——机器可判预期事实至少一条（§6.3 surface/target/capability/side_effect 必须机器可判纪律）",
    );
  }

  // —— WHERE ——
  if (!OBSERVATION_SURFACE_VALUES.includes(request.surface)) {
    invalidValues.push({
      field: "surface",
      value: request.surface,
      anchor: "WHERE",
    });
  }
  if (!isNotBlank(request.target?.capability_ref)) {
    missingAnchors.push("WHERE: target.capability_ref 为空——看的是哪个 Capability 必须申报（§6.3 target）");
  }
  if (!isNotBlank(request.target?.environment_ref)) {
    missingAnchors.push("WHERE: target.environment_ref 为空——从哪个环境看必须申报（§6.3 target）");
  }

  // —— HOW ——
  if (!isNotBlank(request.operation)) {
    missingAnchors.push(
      "HOW: operation 为空——必须定义观察动作而不能只有 Tool Name（§6.2 HOW 逐字）",
    );
  }

  // —— WITH WHAT ——
  if (!isNotBlank(request.sensor_capability)) {
    missingAnchors.push(
      "WITH WHAT: sensor_capability 为空——用什么看必须申报（§6.2 WITH WHAT；工具名由 Sensor Resolution 绑定，此处是能力要求位）",
    );
  }

  // —— side_effect 词轴（§6.15 四级闭包） ——
  if (!SIDE_EFFECT_CLASS_VALUES.includes(request.side_effect)) {
    invalidValues.push({
      field: "side_effect",
      value: request.side_effect,
      anchor: "§6.15 四级词轴",
    });
  }

  // —— intent（可空字段；在场则须非空——显式缺席 null 合法，空白串非法） ——
  if (request.intent !== null && !isNotBlank(request.intent)) {
    invalidValues.push({ field: "intent", value: request.intent, anchor: "§6.3 intent" });
  }

  if (missingAnchors.length === 0 && invalidValues.length === 0) {
    return;
  }
  throw new GovernanceError(
    "SCHEMA_INVALID",
    `Observation Request 四锚校验失败（§6.2 WHAT/WHERE/HOW/WITH WHAT 缺一不可）`,
    "补齐缺失锚点与词轴内值后重报；surface ∈ OBSERVATION_SURFACE_VALUES（§6.4 八值）、side_effect ∈ SIDE_EFFECT_CLASS_VALUES（§6.15 四级）",
    { missing_anchors: missingAnchors, invalid_values: invalidValues },
  );
}

// ============================================================
// §6.7 Environment Doctor + EnvironmentReceipt
// ============================================================

/**
 * Doctor 确认项字段 id（PRD §6.7「Doctor 至少确认」清单逐项，原文行序）。
 * 比对分母全集九项；其中五项是实例身份核（无分母即无从确认——expected 侧必填）。
 */
export const DOCTOR_CONFIRM_FIELDS = [
  "repository_ref",
  "revision_ref",
  "build_identity",
  "runtime_instance",
  "base_url",
  "environment_ref",
  "dataset_ref",
  "auth_role",
  "feature_flags",
] as const;
export type DoctorConfirmField = (typeof DOCTOR_CONFIRM_FIELDS)[number];

/** 实例身份核五项（expected 侧必填——§6.7 验收句「未确认 base URL / runtime instance 不得 PASS」的分母底线）。 */
export const DOCTOR_REQUIRED_EXPECTATION_FIELDS = [
  "repository_ref",
  "revision_ref",
  "runtime_instance",
  "base_url",
  "environment_ref",
] as const;
export type DoctorRequiredExpectationField = (typeof DOCTOR_REQUIRED_EXPECTATION_FIELDS)[number];

/**
 * 环境期望面（判卷分母；来自 Project State / verification bootstrap——§6.17
 * 「项目只保存无法从 State/Catalog 推导的项目特定信息」）。
 * 五项身份核必填非空；dataset_ref / auth_role / build_identity / feature_flags
 * 可 null（显式申报豁免——「本项目无数据集/匿名页面」也是申报，不是缺席）。
 */
export interface EnvironmentExpectation {
  readonly repository_ref: string;
  readonly revision_ref: string;
  readonly build_identity: string | null;
  readonly runtime_instance: string;
  readonly base_url: string;
  readonly environment_ref: string;
  readonly dataset_ref: string | null;
  readonly auth_role: string | null;
  readonly feature_flags: readonly string[] | null;
}

/**
 * 环境实测面（观察时实际确认到的值）。未确认 = null 显式缺席（fail-closed 输入
 * 形态）——「没探到」必须以 null 进判卷，禁用空串/占位词冒充已确认。
 */
export interface EnvironmentObserved {
  readonly repository_ref: string | null;
  readonly revision_ref: string | null;
  readonly build_identity: string | null;
  readonly runtime_instance: string | null;
  readonly base_url: string | null;
  readonly environment_ref: string | null;
  readonly dataset_ref: string | null;
  readonly auth_role: string | null;
  readonly feature_flags: readonly string[] | null;
}

/** 逐项比对行（九项全集，PRD §6.7 清单行序）。 */
export interface EnvironmentDoctorRow {
  readonly field: DoctorConfirmField;
  readonly status: "confirmed" | "missing" | "mismatch" | "exempt";
  readonly expected: string | readonly string[] | null;
  readonly observed: string | readonly string[] | null;
}

export interface EnvironmentDoctorOutcome {
  readonly verdict: EnvironmentDoctorVerdict;
  /** verdict === "READY"（五项身份核全 confirmed + 零 missing/mismatch）。 */
  readonly ok: boolean;
  /** 九项全集比对明细（§6.7 清单行序）。 */
  readonly rows: readonly EnvironmentDoctorRow[];
  /** missing/mismatch 字段名明细（研究 §5.1「附 missing/mismatch 明细」逐字）。 */
  readonly missing: readonly DoctorConfirmField[];
  readonly mismatch: readonly DoctorConfirmField[];
  readonly note: string;
}

/** feature_flags 比对：多重集合相等（排序后逐元素比对——申报序无语义，判定确定性）。 */
function flagsEqual(a: readonly string[], b: readonly string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/**
 * Environment Doctor（纯函数；PRD §6.7「观察之前必须有 Doctor」逐字兑现）。
 * 比对规则（九项全集，PRD 清单行序）：
 * - expected null → exempt（申报豁免——分母外显式呈现，非静默跳过）；
 * - expected 非空而 observed null/空串 → missing（无法确认——P0.5-4 验收句的
 *   「未确认 base URL 也能判 PASS」违规形态在此被封死）；
 * - 值不等（flags 按多重集合）→ mismatch（Case H 的 revision 比对位）；
 * - 相等 → confirmed。
 * verdict：零 missing 且零 mismatch → READY；否则 WRONG_OR_UNVERIFIED_INSTANCE
 * （Verification 不得 PASS——消费门归 T2/批 2，本函数只产 verdict 与明细）。
 * expected 五项身份核缺失 → SCHEMA_INVALID（无判卷分母 = 无从确认，结构性
 * fail-closed：连「该确认什么」都未申报的环境请求不得进入观察管线）。
 */
export function runEnvironmentDoctor(
  expected: EnvironmentExpectation,
  observed: EnvironmentObserved,
): EnvironmentDoctorOutcome {
  const undeclared = DOCTOR_REQUIRED_EXPECTATION_FIELDS.filter(
    (field) => !isNotBlank(expected[field]),
  );
  if (undeclared.length > 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Environment Doctor 判卷分母缺失：${undeclared.join("/")}（实例身份核五项必须申报）`,
      "期望面来自 Project State / verification bootstrap（§6.17 不可推导事实）——先补齐期望申报再观察；连 base URL/runtime instance 都未申报的观察请求不得进入管线（P0.5-4 验收句）",
      { undeclared_fields: undeclared },
    );
  }

  const rows: EnvironmentDoctorRow[] = [];
  const missing: DoctorConfirmField[] = [];
  const mismatch: DoctorConfirmField[] = [];
  for (const field of DOCTOR_CONFIRM_FIELDS) {
    const exp = expected[field];
    const obs = observed[field];
    if (exp === null) {
      rows.push({ field, status: "exempt", expected: null, observed: obs });
      continue;
    }
    const obsMissing =
      obs === null || (typeof obs === "string" && !isNotBlank(obs));
    if (obsMissing) {
      missing.push(field);
      rows.push({ field, status: "missing", expected: exp, observed: obs });
      continue;
    }
    const equal =
      Array.isArray(exp)
        ? Array.isArray(obs) && flagsEqual(exp, obs)
        : typeof obs === "string" && obs === exp;
    if (!equal) {
      mismatch.push(field);
      rows.push({ field, status: "mismatch", expected: exp, observed: obs });
      continue;
    }
    rows.push({ field, status: "confirmed", expected: exp, observed: obs });
  }

  const verdict: EnvironmentDoctorVerdict =
    missing.length === 0 && mismatch.length === 0
      ? "READY"
      : "WRONG_OR_UNVERIFIED_INSTANCE";
  return {
    verdict,
    ok: verdict === "READY",
    rows,
    missing,
    mismatch,
    note:
      verdict === "READY"
        ? "九项确认完成（exempt 行是显式申报豁免，非静默跳过）——观察可继续"
        : `无法确认观察实例（§6.7 逐字）：missing=[${missing.join(",")}] mismatch=[${mismatch.join(",")}]——WRONG_OR_UNVERIFIED_INSTANCE 禁 PASS，Verification 阶段必须 BLOCKED`,
  };
}

/**
 * EnvironmentReceipt（PRD §6.7 yaml 形态逐键：八项确认字段 + doctor_verdict）。
 * 安全字段只记录可审计引用，不落 Secret（§6.7 逐字——本类型无任何凭据字段位，
 * auth_role 是角色类别词不是凭据）。不进 truth-index（§6.13 sidecar 纪律同族；
 * 落盘 schema 批 2 W1-D2 定号 17-perception-receipts.schema.json）。
 * execution_id 是 AGX 通路锚：词形与档案存在性校验归 execution.ts 通路
 * （EXECUTION_ID_PATTERN 单一镜像；本模块不复制正则防漂移），此处只校验在场。
 */
export interface EnvironmentReceipt {
  readonly environment_ref: string | null;
  readonly execution_id: string;
  readonly repository_ref: string | null;
  readonly revision_ref: string | null;
  readonly runtime_instance: string | null;
  readonly base_url: string | null;
  readonly dataset_ref: string | null;
  readonly auth_role: string | null;
  readonly doctor_verdict: EnvironmentDoctorVerdict;
}

/**
 * 组装 EnvironmentReceipt（纯函数）。WRONG_OR_UNVERIFIED_INSTANCE 回执必须能
 * 诚实落盘（实测 null 原样保留——Case H 的 blocked 证据链消费位），故本函数
 * 不做 READY 前置；唯一硬校验是 execution_id 在场（无通路锚的回执不可追溯，
 * §6.13「Agent 必须证明我看过」的身份前提）。
 */
export function buildEnvironmentReceipt(
  observed: EnvironmentObserved,
  executionId: string,
  verdict: EnvironmentDoctorVerdict,
): EnvironmentReceipt {
  if (!isNotBlank(executionId)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "EnvironmentReceipt 缺 execution_id——观察通路锚必须在场（§6.13 证明义务）",
      "execution_id 由 beginExecution 分配（AGX-n，execution.ts）；词形与档案存在性校验在该通路，勿在本模块私设第二套校验",
      { execution_id: executionId },
    );
  }
  return {
    environment_ref: observed.environment_ref,
    execution_id: executionId.trim(),
    repository_ref: observed.repository_ref,
    revision_ref: observed.revision_ref,
    runtime_instance: observed.runtime_instance,
    base_url: observed.base_url,
    dataset_ref: observed.dataset_ref,
    auth_role: observed.auth_role,
    doctor_verdict: verdict,
  };
}

// ============================================================
// §6.13 Observation Receipt（批 2 W1-D2 T2：最小通路类型面）
// ============================================================

/**
 * blob 引用行（07-evidence-records definitions.blob_ref 词形同源；裁决 8 ③ D1=A：
 * receipt 身份 = blob sha256 即身份，不新增 EVR- id——EVR-* 仅 PRD 概念词）。
 * 四字段与 persistEvidenceArtifact 输出（PersistedEvidenceArtifact）逐一同构：
 * 消费方把 persist 产物原样携带入 receipt（sha 由基础设施产生——D24 人禁手算；
 * 本模块不重复校验 sha/storage_path 词形，落盘与装载边界的词形防线归 17 号
 * schema 的绝对 $ref 07 definitions.blob_ref——单一事实源禁二次镜像）。
 */
export interface ObservationReceiptArtifactRef {
  readonly sha256: string;
  readonly media: string;
  readonly byteSize: number;
  readonly storagePath: string;
}

/**
 * Observation Receipt 组装输入（camel 机器形态；落盘词形走 17 号 schema 的
 * snake_case 面——与 artifactRefsToSnake 同款「落盘形态由映射决定」纪律）。
 * journey_ref / environment_receipt_ref / target_ref 显式可空：journey 投影归
 * P1-1、ENVREC 通路编号签发与 OBS receipt 落盘分区归 Owner 位呈报（研究 §7 位 5，
 * 裁决 8 未裁）——null 是诚实缺席，禁占位词冒充。
 */
export interface ObservationReceiptInput {
  /** OBS-<n>（OBS_ID_PATTERN 词形；通路编号非 governed 前缀）。 */
  readonly observationId: string;
  /** AGX 通路锚（词形与档案存在性校验归 execution.ts 通路，此处只校验在场）。 */
  readonly executionId: string;
  /** SENSOR.* 能力词形（裁决 8 D6=A；closed-world 校验归词汇表 PR 收编后）。 */
  readonly sensorCapability: string;
  /** 工具标识（§6.13 例文 chrome-devtools-mcp；开放词）。 */
  readonly adapter: string;
  /** 观察动作（§6.2 HOW 锚同词——「必须定义观察动作，而不能只有 Tool Name」）。 */
  readonly operation: string;
  /** §6.4 八值闭包。 */
  readonly surface: ObservationSurfaceValue;
  /** OBSERVED + 七负值单轴（OBSERVATION_RESULT_VALUES）。 */
  readonly result: ObservationResultValue;
  /** 捕获锚（A4 单调 seq 非墙钟；调用方供给——纯函数零 seq 纪律不变）。 */
  readonly capturedAtSeq: number;
  readonly journeyRef?: string | null;
  /** ENVREC-<n>（ENVREC_ID_PATTERN 词形；非 governed 前缀）。 */
  readonly environmentReceiptRef?: string | null;
  /** 治理对象 id（closed-world 校验归消费通路——头注同款边界）。 */
  readonly targetRef?: string | null;
  /**
   * §6.14 四前提绑定（result=OBSERVED_ABSENT 时必填且四值全 true；其余 result 携带
   * 即拒）。G2 审查封条：「缺席是事实」的正主张原可手工组装 result=OBSERVED_ABSENT
   * 绕过 judgeNegativeObservation 直接入回执——现将判定器的四前提闸上移到回执组装
   * 入口（同款全真要求），缺席绑定缺失/不全 → SCHEMA_INVALID 拒收。
   */
  readonly absencePreconditions?: NegativeObservationPreconditions;
  /** blob 引用（persist 产物原样携带；OBSERVED 时必须 ≥1——见 buildObservationReceipt）。 */
  readonly artifactRefs?: readonly ObservationReceiptArtifactRef[];
  /** 机器可判事实清单（§6.13 例文 request_status: 200 词形；禁携带证据原文）。 */
  readonly normalizedFacts?: readonly string[];
}

/**
 * Observation Receipt（PRD §6.13 yaml 十三键逐键对齐：observation_id / execution_id /
 * journey_ref / environment_receipt_ref / sensor_capability / adapter / operation /
 * target_ref / surface / artifact_refs / normalized_facts / result / captured_at_seq）。
 * 「Agent 可以写解释；基础设施负责证明工具调用与 Artifact 的存在」——receipt 是
 * 证据面通路记录（AGX/GRN/CLM 同族），进 Trace/Evidence Sidecar，不进 Truth Index
 * （§6.13 逐字；A8 同构）。零墙钟（时间锚恒 captured_at_seq）。
 */
export interface ObservationReceipt {
  readonly observation_id: string;
  readonly execution_id: string;
  readonly journey_ref: string | null;
  readonly environment_receipt_ref: string | null;
  readonly sensor_capability: string;
  readonly adapter: string;
  readonly operation: string;
  readonly target_ref: string | null;
  readonly surface: ObservationSurfaceValue;
  readonly artifact_refs: readonly ObservationReceiptArtifactRef[];
  readonly normalized_facts: readonly string[];
  readonly result: ObservationResultValue;
  readonly captured_at_seq: number;
}

/**
 * 组装 Observation Receipt（纯函数；违例 → GovernanceError(SCHEMA_INVALID)，
 * details 聚合全部缺陷——validateObservationRequest 同款不首错即抛）。
 * 关键封条（Benchmark E 的本模块级落点）：**result=OBSERVED 必须 ≥1 条
 * artifact_refs**——「看到」的主张必须由基础设施签发的 blob 身份背书（§6.13
 * 「基础设施负责证明工具调用与 Artifact 的存在」）；无 artifact 的 OBSERVED =
 * Agent 自报无凭，结构性拒收。**result=OBSERVED_ABSENT 必须绑定 §6.14 四前提且
 * 四值全真**（absencePreconditions）——「缺席是事实」的正主张与「看到」同族，
 * 必须经 judgeNegativeObservation 同款前提闸背书，禁手工组装绕过判定器（G2 审查
 * G5 封条）。负观察词形不强制空 refs（Case I 留痕形态：截图在场而 network 不可
 * 观察——result=NOT_OBSERVABLE 诚实申报，不构成验证主张）。
 */
export function buildObservationReceipt(
  input: ObservationReceiptInput,
): ObservationReceipt {
  const missing: string[] = [];
  const invalidValues: { readonly field: string; readonly value: unknown }[] = [];

  if (!OBS_ID_PATTERN.test(input.observationId)) {
    invalidValues.push({ field: "observationId", value: input.observationId });
  }
  if (!isNotBlank(input.executionId)) {
    missing.push("executionId（AGX 通路锚必须在场——§6.13 证明义务，buildEnvironmentReceipt 同款）");
  }
  if (!isNotBlank(input.sensorCapability)) {
    missing.push("sensorCapability（§6.13 sensor_capability）");
  }
  if (!isNotBlank(input.adapter)) {
    missing.push("adapter（§6.13 adapter）");
  }
  if (!isNotBlank(input.operation)) {
    missing.push("operation（§6.2 HOW 锚同词：必须定义观察动作）");
  }
  if (!OBSERVATION_SURFACE_VALUES.includes(input.surface)) {
    invalidValues.push({ field: "surface", value: input.surface });
  }
  if (!OBSERVATION_RESULT_VALUES.includes(input.result)) {
    invalidValues.push({ field: "result", value: input.result });
  }
  if (!Number.isInteger(input.capturedAtSeq) || input.capturedAtSeq < 0) {
    invalidValues.push({ field: "capturedAtSeq", value: input.capturedAtSeq });
  }
  if (input.journeyRef !== undefined && input.journeyRef !== null && !isNotBlank(input.journeyRef)) {
    invalidValues.push({ field: "journeyRef", value: input.journeyRef });
  }
  if (
    input.environmentReceiptRef !== undefined &&
    input.environmentReceiptRef !== null &&
    !ENVREC_ID_PATTERN.test(input.environmentReceiptRef)
  ) {
    invalidValues.push({ field: "environmentReceiptRef", value: input.environmentReceiptRef });
  }
  if (input.targetRef !== undefined && input.targetRef !== null && !isNotBlank(input.targetRef)) {
    invalidValues.push({ field: "targetRef", value: input.targetRef });
  }
  const artifactRefs = input.artifactRefs ?? [];
  const normalizedFacts = input.normalizedFacts ?? [];
  if (normalizedFacts.some((fact) => !isNotBlank(fact))) {
    invalidValues.push({ field: "normalizedFacts", value: "含空白项" });
  }
  if (input.result === "OBSERVED" && artifactRefs.length === 0) {
    missing.push(
      "artifactRefs（result=OBSERVED 必须 ≥1 条 blob 引用——§6.13 基础设施证明 Artifact 存在；Benchmark E：Observation Receipt 不得冒充有效业务 Evidence）",
    );
  }
  // CRC-F 缝口（09-04 vNext Batch 5 ADR-lite · 最小判定，零新词轴）：OBSERVED 的
  // screenshot-only 背书闸——result=OBSERVED 且全部 artifact_refs 的 media 皆为
  // "screenshot" 而观察动作（operation）不是 "screenshot" 时，该「看到了」的主张
  // 没有对应观察动作的证据产物背书：截图不能证明 API payload / 控制台 / 性能事实
  // （纠错 §31 Case F / PRD §9B CRC-F「截图不能证明 API」；Case I 封条原只盖
  // NOT_OBSERVABLE 侧，本闸收口 OBSERVED 侧同族缝口）。最小性论证：只封
  // 「screenshot-only 冒充」单一形态——混合 refs（screenshot 作辅证在场）与
  // media↔operation 全量族矩阵（需词表裁定新映射面）都不在本闸；词面纪律：
  // "screenshot" 是 catalog/sensors 材料 operations/evidence_types 双侧既有词形 +
  // 07 blob_ref media 开放词先例（SCREENSHOT_MEDIA_WORD 注记），零词表私扩。
  // 分层边界：17 号 schema 维持词形冻结面不裁 media 一致性（media 开放词无轴可裁；
  // absencePreconditions 四前提闸同款「组装层判定严于 schema」先例）——schema
  // examples[1] 的转录形态只证明词形合法，组装层不再可达（已知分层差异，登记不隐藏）。
  if (
    input.result === "OBSERVED" &&
    artifactRefs.length > 0 &&
    input.operation !== SCREENSHOT_MEDIA_WORD &&
    artifactRefs.every((ref) => ref.media === SCREENSHOT_MEDIA_WORD)
  ) {
    invalidValues.push({
      field: "artifactRefs.media",
      value: `全部为 "${SCREENSHOT_MEDIA_WORD}" 而观察动作 operation="${input.operation}"`,
    });
  }
  // §6.14 四前提绑定（G5）：OBSERVED_ABSENT 是「缺席是事实」的正主张，与 OBSERVED
  // 同族受闸——绑定缺失 = 绕过 judgeNegativeObservation 的手工组装，SCHEMA_INVALID；
  // 绑定在座但任一前提为 false = 判定器本应产出 INCONCLUSIVE 的形态，同拒。
  const ABSENCE_PRECONDITION_KEYS = [
    "correctPage",
    "correctInstance",
    "sensorWorked",
    "captureWindowCoveredOperation",
  ] as const;
  if (input.result === "OBSERVED_ABSENT") {
    const binding = input.absencePreconditions;
    if (binding === undefined || binding === null || typeof binding !== "object") {
      missing.push(
        "absencePreconditions（result=OBSERVED_ABSENT 必须绑定 §6.14 四前提且四值全真——缺席主张经 judgeNegativeObservation 同款闸背书，禁手工组装绕过判定器）",
      );
    } else {
      const record = binding as unknown as Record<string, unknown>;
      for (const key of ABSENCE_PRECONDITION_KEYS) {
        if (record[key] !== true) {
          invalidValues.push({
            field: `absencePreconditions.${key}`,
            value: record[key],
          });
        }
      }
    }
  } else if (input.absencePreconditions !== undefined) {
    invalidValues.push({
      field: "absencePreconditions",
      value: "仅 result=OBSERVED_ABSENT 可携带四前提绑定（与 result 轴自相矛盾）",
    });
  }

  if (missing.length === 0 && invalidValues.length === 0) {
    return {
      observation_id: input.observationId,
      execution_id: input.executionId.trim(),
      journey_ref: input.journeyRef ?? null,
      environment_receipt_ref: input.environmentReceiptRef ?? null,
      sensor_capability: input.sensorCapability,
      adapter: input.adapter,
      operation: input.operation,
      target_ref: input.targetRef ?? null,
      surface: input.surface,
      artifact_refs: artifactRefs,
      normalized_facts: normalizedFacts,
      result: input.result,
      captured_at_seq: input.capturedAtSeq,
    };
  }
  throw new GovernanceError(
    "SCHEMA_INVALID",
    `Observation Receipt 组装校验失败（§6.13 字段面 + Benchmark E 封条 + CRC-F 缝口）`,
    "observation_id 须 OBS-<n>、environment_receipt_ref 须 ENVREC-<n>、surface/result 落词轴闭包、OBSERVED 必须 ≥1 条 artifact_refs（先 persistEvidenceArtifact 再组装）；OBSERVED 的全部 artifact media 皆为 screenshot 时观察动作必须是 screenshot（CRC-F：截图不能证明 API/控制台/性能事实——payload 类事实需对应 sensor 的产物 media）",
    { missing, invalid_values: invalidValues },
  );
}

// ============================================================
// §6.14 负观察七词形判定
// ============================================================

/** 五个可直接申报的负观察词形（除 OBSERVED_ABSENT/INCONCLUSIVE——那两个是本判定器的产出）。 */
export type DeclaredNegative =
  | "NOT_OBSERVABLE"
  | "SENSOR_UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "ENVIRONMENT_INVALID"
  | "PROBE_FAILED";

/**
 * 申报失败的链序（观察管线序 = PRD 章节序）：环境身份门（§6.7 Doctor）→
 * 访问权（WITH WHAT 的权限面）→ sensor 可用（§6.16）→ 面可观察（§6.14
 * NOT_OBSERVABLE——Case I「只有 screenshot 无 network」）→ 探测执行（§6.11
 * PROBE）。多申报同时在场取链序最前——判定确定性（同输入重放同词形）。
 */
const DECLARED_PRECEDENCE: readonly DeclaredNegative[] = [
  "ENVIRONMENT_INVALID",
  "PERMISSION_DENIED",
  "SENSOR_UNAVAILABLE",
  "NOT_OBSERVABLE",
  "PROBE_FAILED",
];

/** OBSERVED_ABSENT 四前提输入（§6.14 逐字：正确页面+正确实例+Sensor 已工作+捕获窗口覆盖操作）。 */
export interface NegativeObservationInput {
  /** 上游失败申报（可空数组=无申报；多项按链序取最前）。 */
  readonly declared: readonly DeclaredNegative[];
  /** 捕获面为空（§6.14 例文「Network 面没有捕获到请求」）；declared 非空时四前提分岔不进入。 */
  readonly captureEmpty: boolean;
  readonly correctPage: boolean;
  readonly correctInstance: boolean;
  readonly sensorWorked: boolean;
  readonly captureWindowCoveredOperation: boolean;
}

export interface NegativeObservationOutcome {
  /** 七负值之一；OBSERVED 结构性不可产出（负观察判定器永不说「看到了」）。 */
  readonly result: NegativeObservationValue;
  readonly reason: string;
  /** 四前提快照（恒在场——C1 显式呈现；declared 路径下不作分岔输入，仅留痕）。 */
  readonly preconditions: NegativeObservationPreconditions;
  readonly hint: string;
}

/**
 * §6.14 四前提（正确页面 + 正确实例 + Sensor 已工作 + 捕获窗口覆盖操作）——
 * OBSERVED_ABSENT 判定与回执组装（absencePreconditions 绑定位）共用的单一形态。
 */
export interface NegativeObservationPreconditions {
  readonly correctPage: boolean;
  readonly correctInstance: boolean;
  readonly sensorWorked: boolean;
  readonly captureWindowCoveredOperation: boolean;
}

/**
 * 负观察判定（纯函数；§6.14 + Case K 机器判据）。
 * - declared 非空 → 链序最前的申报词形直接成立（结构性失败不需要四前提背书——
 *   sensor 都没工作就谈不上「捕获窗口覆盖操作」）；
 * - declared 空 且 captureEmpty → 四前提全真才 OBSERVED_ABSENT；任一假 →
 *   INCONCLUSIVE（§6.14 逐字「否则只是 INCONCLUSIVE」）；
 * - declared 空 且捕获非空 → SCHEMA_INVALID（这是正常观察，不归负观察判定器——
 *   OBSERVED 由成功观察通路产出，本判定器结构性不发 OBSERVED）。
 */
export function judgeNegativeObservation(
  input: NegativeObservationInput,
): NegativeObservationOutcome {
  const preconditions = {
    correctPage: input.correctPage,
    correctInstance: input.correctInstance,
    sensorWorked: input.sensorWorked,
    captureWindowCoveredOperation: input.captureWindowCoveredOperation,
  };
  for (const declared of DECLARED_PRECEDENCE) {
    if (input.declared.includes(declared)) {
      const hints: Record<DeclaredNegative, string> = {
        ENVIRONMENT_INVALID:
          "先修环境身份（runEnvironmentDoctor → READY）再观察——看错环境比没有眼睛更危险（§6.7）",
        PERMISSION_DENIED:
          "申请对应访问授权；不能静默降级为读代码冒充已验证（§6.16 禁令）",
        SENSOR_UNAVAILABLE:
          "换可用 sensor 或如实降级（CAPABILITY_DEGRADED 呈现词 + NOT_OBSERVABLE 主词形，§6.16）",
        NOT_OBSERVABLE:
          "该面经可用 sensor 不可观察（如只有 screenshot 无 network payload——Case I）：截图不能替代 payload Evidence",
        PROBE_FAILED:
          "修探测执行（§6.11 PROBE 最小副作用优先）；失败不是缺席的证据",
      };
      return {
        result: declared,
        reason: `上游申报链序命中：${declared}（观察管线序 环境→权限→sensor→面→探测，多申报取最前）`,
        preconditions,
        hint: hints[declared],
      };
    }
  }
  if (!input.captureEmpty) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "负观察判定输入既无失败申报且捕获非空——这是正常观察，不归负观察判定器",
      "正常观察的 result=OBSERVED 由成功观察通路产出（§6.13）；本判定器只裁「没看到」类事实（§6.14）",
      { declared: input.declared, captureEmpty: input.captureEmpty },
    );
  }
  const allHold =
    input.correctPage &&
    input.correctInstance &&
    input.sensorWorked &&
    input.captureWindowCoveredOperation;
  if (allHold) {
    return {
      result: "OBSERVED_ABSENT",
      reason: "捕获为空且四前提全真（正确页面+正确实例+Sensor 已工作+捕获窗口覆盖操作）——缺席是事实",
      preconditions,
      hint: "OBSERVED_ABSENT 可入 receipt（§6.14）；若观察的是请求面，这是「请求确实没发生」的正面证据",
    };
  }
  const failed = [
    input.correctPage ? null : "正确页面",
    input.correctInstance ? null : "正确实例",
    input.sensorWorked ? null : "Sensor 已工作",
    input.captureWindowCoveredOperation ? null : "捕获窗口覆盖操作",
  ].filter((v): v is string => v !== null);
  return {
    result: "INCONCLUSIVE",
    reason: `捕获为空但四前提不齐（缺：${failed.join("、")}）——「没看到」不能等于「不存在」（§6.14 逐字）`,
    preconditions,
    hint: "补齐前提（正确页面/正确实例/sensor 工作/捕获窗口覆盖操作）后重测；此前不得把缺席当作不存在写入任何断言（防 Agent 幻觉）",
  };
}
