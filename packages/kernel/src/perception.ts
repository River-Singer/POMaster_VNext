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
 *   ——PRD 原文豁免，词轴先住模块常量 TODO(vocab-pr-0005)，词表三镜像登记归
 *   词汇表 PR 批次）。
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
 * 面无时间维度）。env_ref 词形 ENV.* 非 governed 前缀（15 前缀闭包无 ENV），
 * capability_ref 的 governed closed-world 校验归消费通路（projection/store），
 * 本模块不私设第二套 id 校验（单一镜像纪律）。
 *
 * 批 1 边界（W1-D1 简报逐字）：纯函数 + 词形常量 + 测试，零产品接线——browser
 * 腿环境判卷门（T2）归批 2 W1-B；16-perception-receipts.schema.json defer 批 2
 * （16 号本批归 W1-C，schema 编号随批 2 定）；OBS-/ENVREC- 等新词形以
 * TODO(vocab-pr-0005) 注记承载，词表三镜像登记归主控批次（批 1 文件面互斥）。
 */

import { GovernanceError } from "./errors.js";

// ============================================================
// 词轴（模块常量；TODO(vocab-pr-0005) 词表三镜像登记归主控批次）
// ============================================================

/**
 * Observation Surface 八值（PRD §6.4 逐字，原文行序）。
 * PRD 明言「不要求立即成为新的 Closed-world Core Vocab」——模块局部词轴 +
 * TODO(vocab-pr-0005)，词汇表 PR 批准前禁入 vocab-lock 主表（词表冻结纪律）。
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
 * 感知域降级呈现词（PRD §6.16 词形）。TODO(vocab-pr-0005)。
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
 * （AGX-n 头注同款注记，execution.ts §25.4 先例）。TODO(vocab-pr-0005)。
 * 注：PRD §6.11 hypothesis supports 例文另现 OBS.NETWORK.17 点形——那是诊断假设
 * 对观察的引用记法（P1-1b 落点），与本通路编号词形的归一随词汇表 PR 裁定，
 * 本批只登记 OBS- 通路编号形（研究 §5.1 定案）。
 */
export const OBS_ID_PATTERN = /^OBS-[0-9]+$/;

/** ENVREC 通路编号词形（PRD §6.13 environment_receipt_ref: ENVREC-...；OBS 同款先例注记）。 */
export const ENVREC_ID_PATTERN = /^ENVREC-[0-9]+$/;

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
 * - WITH WHAT 锚 = sensor_capability（sensor 能力要求；词形轴 SENSOR.* 登记归
 *   P1-5 簇 TODO(vocab-pr-0005)，本契约只校验在场非空——Tool 由 Sensor Resolution
 *   后再绑定，§6.3 逐字）。
 */
export interface ObservationRequest {
  /** 观察意图（§6.3 例文 REPRODUCE；PRD 仅此一词形不成轴，扩值走词汇表 PR TODO(vocab-pr-0005)；可空显式）。 */
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
 * 落盘 schema 归批 2 定 16/17 号）。
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
  readonly preconditions: {
    readonly correctPage: boolean;
    readonly correctInstance: boolean;
    readonly sensorWorked: boolean;
    readonly captureWindowCoveredOperation: boolean;
  };
  readonly hint: string;
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
