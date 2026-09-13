/**
 * diagnose.ts —— 通用 Diagnose 失败域判定核（W3-S3 切片；09-12 W3 R3-4）。
 *
 * 源 PRD 锚：C §53-56（Diagnose 管线：Bug Report→Ground Scope→Diagnostic Planner→
 * Relevant Tool Bundle→Observation/Evidence→Failure Domain；输出聚合「Likely Failure
 * Domain + Evidence」）+ §91 Case H（save 按钮无响应 → 关联浏览器/网络/API/日志证据
 * → 输出失败域）。c99-gap-declaration 表 A 项 10/11/12：失败域词位本切片前零落地
 * （grep failure_domain 全库零命中）。
 *
 * ═══ 职责边界（本切片显式不裁）═══
 * - 判定核只做「症状申报（分类面）+ 证据关联面 → 失败域归因 + 置信基 + 诊断计划
 *   建议」的纯函数判定：零 fs、零 store、零墙钟（plan-compiler.ts 同款纪律），同输入
 *   → 同输出字节稳定；inputs_fingerprint = sha256OfCanonical 整个输入。
 * - 证据面由调用方（CLI 通路）从 store 证据平面实读装配——本核不读回执文件，只消费
 *   已验证词形的面事实；「证据引用不存在 → fail-closed」的判定在 CLI 通路（回执不在
 *   库 = 无证据可关联，绝不静默降级为零证据申报）。
 * - 与 production diagnose（§95.2 产线分支 recordDiagnosis）共用本判定核：production
 *   分支的 BREACHED band evidence 前置只是产线分叉的准入条件（DIAGNOSIS_WITHOUT_
 *   BREACH_EVIDENCE 结构性封条），不是本核语义——单一判定事实源，禁第二套失败域词。
 * - 诊断不裁决：本核输出是归因建议 + 下一步动作建议，不改对象状态、不自动修复、
 *   不产 governed 写入（§53 输出聚合纪律——呈现「Likely Failure Domain + Evidence」，
 *   行动经治理面显式通路）。
 *
 * ═══ 置信语义（诚实性红线）═══
 * - confidence_basis 只有两词形：evidence_chain（在座 run 回执失败信号与归因域同域，
 *   引用链在 corroborating_refs 逐条留痕）/ declaration_only（仅申报或在座证据未产出
 *   同域信号——关联不虚构）。禁止百分比置信（§21 守护栏禁「Root cause confidence =
 *   92%」词形——置信度走词形轴不走数值轴）。
 * - 只有 verdict=failed 的 run 面且 gate 在 RUN_GATE_DOMAIN_SIGNALS 映射内才产归因
 *   信号；passed/warning/blocked/not_run 与 OBS/AGX 面是零信号上下文（在座呈现，不
 *   冒充机判佐证）。未映射 gate 一律 null 信号——不冒充机判，扩映射走 SP 追认。
 * - 申报与信号冲突：失败域不改判（申报是 Owner 面），冲突信号进 conflicting_refs
 *   呈报（呈报非改判）。
 *
 * ═══ 词形闭包（kernel 局部词 TODO(vocab-pr)；SP 提案待追认）═══
 * - 六失败域：tool_environment / product_assertion / fixture_data /
 *   environment_instance / dependency_external / unknown_insufficient_evidence
 *   （unknown_insufficient_evidence 是「零申报零信号/证据不足」的诚实词位，不是第六种归因）。
 * - 两置信基：evidence_chain / declaration_only。
 * - 证据面 kind 三词形：run（GRN 回执）/ observation（OBS 感知回执）/ execution（AGX
 *   执行档案）——本切片证据引用闭包 GRN|OBS|AGX（ENVREC 不进分母）。
 * - 与 §95.3 production 三分诊断轴（DIAGNOSIS_KIND_VALUES：IMPLEMENTATION_ISSUE/
 *   CONFIG_ISSUE/ARCHITECTURE_EVOLUTION）正交零词形串扰：三分是修复动作分类轴，
 *   失败域是证据归因轴。
 *
 * ═══ next_actions（诊断计划建议——复用 plan-compiler 能力词位，禁第二套工具池词）═══
 * FAILURE_DOMAIN_CAPABILITY_PRIORITY 给出每域建议能力序（§54 诊断优先序：安全/只读/
 * 快/高信号先行——static_analysis 类只读位排首），逐项渲染为
 * 「<capability> REQUIRED — <CAPABILITY_EVIDENCE_REQUIREMENT 原文>」：能力词形与证据
 * 义务文本单一映射源都在 plan-compiler.ts（本切片仅将其模块私有表改为导出——加性
 * 导出零行为变化），计划编译与诊断建议消费同一张表。
 */
import { GovernanceError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";
import { EXECUTION_ID_PATTERN } from "./execution.js";
import { OBS_ID_PATTERN, OBSERVATION_RESULT_VALUES, OBSERVATION_SURFACE_VALUES } from "./perception.js";
import { VERDICT_VALUES } from "@pomaster/schemas";
import {
  CAPABILITY_EVIDENCE_REQUIREMENT,
  type PlanCapabilityWord,
} from "./plan-compiler.js";

// ============================================================
// 词形闭包（kernel 局部词 TODO(vocab-pr)；SP 提案待追认）
// ============================================================

/** GRN id 词形（kernel 内联先例逐字镜像：gate-result.ts:102 / store.ts:2138 同词形）。 */
const GRN_ID_PATTERN = /^GRN-[0-9]+$/;

/** 六失败域闭包（Case H 归因轴词位起点；序 = 确定性呈现序，禁 locale 排序）。 */
export const FAILURE_DOMAIN_VALUES = [
  "tool_environment",
  "product_assertion",
  "fixture_data",
  "environment_instance",
  "dependency_external",
  "unknown_insufficient_evidence",
] as const;
export type FailureDomain = (typeof FAILURE_DOMAIN_VALUES)[number];

/** 置信基两词形（零百分比置信——§21 守护栏；置信度走词形轴不走数值轴）。 */
export const FAILURE_DOMAIN_CONFIDENCE_BASES = ["evidence_chain", "declaration_only"] as const;
export type FailureDomainConfidenceBasis = (typeof FAILURE_DOMAIN_CONFIDENCE_BASES)[number];

/** 证据面 kind 三词形（本切片证据引用闭包 GRN|OBS|AGX；ENVREC 不进分母）。 */
export const DIAGNOSE_EVIDENCE_KINDS = ["run", "observation", "execution"] as const;
export type DiagnoseEvidenceKind = (typeof DIAGNOSE_EVIDENCE_KINDS)[number];

/**
 * run gate → 失败域信号最小映射（SP 提案待追认）：verdict=failed 且 gate 命中本表
 * 才产归因信号。BUILD/TYPECHECK 失败是「产品代码断言不满足」的最小可机判子集；
 * 其余 gate（CONTRACT/LINT/COVERAGE/BROWSER/…）不冒充机判——映射缺席 = null 信号，
 * 扩映射逐项走 SP 追认（禁就地添加）。
 */
export const RUN_GATE_DOMAIN_SIGNALS: Readonly<Record<string, FailureDomain>> = {
  BUILD: "product_assertion",
  TYPECHECK: "product_assertion",
};

/**
 * 失败域 → 诊断能力建议序（复用 plan-compiler 十三能力词位）：§54 诊断优先序
 * （安全/只读/快/高信号先行）——static_analysis/dependency_check 类只读位排首，
 * 行为复现位随后；unknown 域以只读静态分析开局（先收敛分母再定归因）。
 */
export const FAILURE_DOMAIN_CAPABILITY_PRIORITY: Readonly<
  Record<FailureDomain, readonly PlanCapabilityWord[]>
> = {
  tool_environment: ["static_analysis", "unit_behavior"],
  product_assertion: ["unit_behavior", "static_analysis"],
  fixture_data: ["unit_behavior", "data_integration"],
  environment_instance: ["ui_interaction", "deployment_config_check"],
  dependency_external: ["dependency_check", "static_analysis"],
  unknown_insufficient_evidence: ["static_analysis", "unit_behavior"],
};

// ============================================================
// 输入合同（snake_case——文件/事实世界词形；校验 fail-closed）
// ============================================================

/** 证据关联面（一条在库证据的判定输入；非本 kind 的字段显式 null——禁串位）。 */
export interface DiagnoseEvidenceFace {
  /** 证据 id（GRN-0001 / OBS-0001 / AGX-2026-00001；批内唯一）。 */
  readonly ref: string;
  readonly kind: DiagnoseEvidenceKind;
  /** run 面 gate 名（03 词形开放面——映射消费位）；其余 kind = null。 */
  readonly gate: string | null;
  /** run 面 verdict（03 七态闭包）；其余 kind = null。 */
  readonly verdict: string | null;
  /** observation 面 surface（§6.4 八值闭包）；其余 kind = null。 */
  readonly surface: string | null;
  /** observation 面 result（OBSERVED + 七负值闭包）；其余 kind = null。 */
  readonly observation_result: string | null;
}

/** 判定输入：症状申报（分类面）+ 证据关联面（调用方从 store 证据平面实读装配）。 */
export interface FailureDomainJudgmentInput {
  /** 症状申报文本（申报面事实；非空——空申报写不出可审计归因）。 */
  readonly symptom: string;
  /** 申报初始失败域；null = 零申报（域由在座信号确定性派生或诚实 unknown）。 */
  readonly declared_domain: FailureDomain | null;
  /** 在座证据面（顺序即判定序——同输入字节稳定；空集合法）。 */
  readonly faces: readonly DiagnoseEvidenceFace[];
}

// ============================================================
// 输出合同
// ============================================================

export interface FailureDomainJudgment {
  readonly failure_domain: FailureDomain;
  readonly confidence_basis: FailureDomainConfidenceBasis;
  /** 与归因域同域的信号引用链（evidence_chain 时非空；declaration_only 恒空）。 */
  readonly corroborating_refs: readonly string[];
  /** 与归因域异域的信号引用（呈报非改判；零申报分歧时承载全部分歧信号）。 */
  readonly conflicting_refs: readonly string[];
  /** 诊断计划建议（<capability> REQUIRED — <证据义务原文>；复用 plan-compiler 词位）。 */
  readonly next_actions: readonly string[];
  /** 一行判定依据（呈现与 --json 共用同一实现——禁第二份拼装器漂移）。 */
  readonly basis: string;
  /** sha256OfCanonical 整个输入（同输入字节稳定锚）。 */
  readonly inputs_fingerprint: string;
}

// ============================================================
// fail-closed 校验（SCHEMA_INVALID；禁畸形输入静默放行）
// ============================================================

function schemaInvalid(message: string, hint: string): GovernanceError {
  return new GovernanceError("SCHEMA_INVALID", message, hint);
}

const INPUT_HINT = "diagnose 输入合同校验失败";
const VOCAB_HINT = "失败域/置信基词形闭包=kernel 局部词 TODO(vocab-pr)——SP 提案待追认";

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw schemaInvalid(`${path} 须为非空字符串（fail-closed——禁空转申报）`, INPUT_HINT);
  }
  return value;
}

function requireStringOrNull(value: unknown, path: string): string | null {
  if (value === null) return null;
  return requireNonEmptyString(value, path);
}

function validateFace(face: DiagnoseEvidenceFace, path: string, seenRefs: Set<string>): void {
  if (face === null || typeof face !== "object") {
    throw schemaInvalid(`${path} 须为对象`, INPUT_HINT);
  }
  requireNonEmptyString(face.ref, `${path}.ref`);
  if (!(DIAGNOSE_EVIDENCE_KINDS as readonly string[]).includes(face.kind)) {
    throw schemaInvalid(
      `${path}.kind = ${String(face.kind)} 不在证据面 kind 词形闭包（${DIAGNOSE_EVIDENCE_KINDS.join("/")}）——本切片证据引用闭包 GRN|OBS|AGX（ENVREC 不进分母）`,
      VOCAB_HINT,
    );
  }
  if (seenRefs.has(face.ref)) {
    throw schemaInvalid(
      `${path}.ref = ${face.ref} 重复（批内唯一——evidence-qualification 批量纪律同款）`,
      INPUT_HINT,
    );
  }
  seenRefs.add(face.ref);
  const refPattern =
    face.kind === "run" ? GRN_ID_PATTERN : face.kind === "observation" ? OBS_ID_PATTERN : EXECUTION_ID_PATTERN;
  if (!refPattern.test(face.ref)) {
    throw schemaInvalid(
      `${path}.ref = ${face.ref} 与 kind=${face.kind} 词形不符（${refPattern.source}）`,
      `证据 id 词形单一事实源：run=GRN-[0-9]+ / observation=${OBS_ID_PATTERN.source} / execution=${EXECUTION_ID_PATTERN.source}`,
    );
  }
  if (face.kind === "run") {
    const gate = requireStringOrNull(face.gate, `${path}.gate`);
    const verdict = requireStringOrNull(face.verdict, `${path}.verdict`);
    if (face.surface !== null || face.observation_result !== null) {
      throw schemaInvalid(
        `${path} run 面不携带 surface/observation_result（非本 kind 字段显式 null——禁串位）`,
        INPUT_HINT,
      );
    }
    if (verdict !== null && !(VERDICT_VALUES as readonly string[]).includes(verdict)) {
      throw schemaInvalid(
        `${path}.verdict = ${verdict} 不在 03 七态闭包（${VERDICT_VALUES.join("/")}）`,
        "verdict 词表 = @pomaster/schemas VERDICT_VALUES（扩值走词汇表 PR，禁止就地添加）",
      );
    }
    if (gate === null && verdict !== null) {
      throw schemaInvalid(`${path}.gate 缺席时 verdict 须为 null（锚缺失显式 null——禁半挂）`, INPUT_HINT);
    }
    return;
  }
  if (face.kind === "observation") {
    if (face.gate !== null || face.verdict !== null) {
      throw schemaInvalid(
        `${path} observation 面不携带 gate/verdict（非本 kind 字段显式 null——禁串位）`,
        INPUT_HINT,
      );
    }
    const surface = requireStringOrNull(face.surface, `${path}.surface`);
    const observationResult = requireStringOrNull(face.observation_result, `${path}.observation_result`);
    if (surface !== null && !(OBSERVATION_SURFACE_VALUES as readonly string[]).includes(surface)) {
      throw schemaInvalid(
        `${path}.surface = ${surface} 不在 §6.4 八值闭包（${OBSERVATION_SURFACE_VALUES.join("/")})`,
        "surface 词表 = perception OBSERVATION_SURFACE_VALUES（vocab-lock trace_perception_vocab）",
      );
    }
    if (
      observationResult !== null &&
      !(OBSERVATION_RESULT_VALUES as readonly string[]).includes(observationResult)
    ) {
      throw schemaInvalid(
        `${path}.observation_result = ${observationResult} 不在 OBSERVED+七负值闭包（${OBSERVATION_RESULT_VALUES.join("/")})`,
        "result 词表 = perception OBSERVATION_RESULT_VALUES（§6.13/§6.14 逐字）",
      );
    }
    return;
  }
  // execution 面：AGX 执行档案是身份锚不是判卷面——四判卷字段全 null。
  if (
    face.gate !== null ||
    face.verdict !== null ||
    face.surface !== null ||
    face.observation_result !== null
  ) {
    throw schemaInvalid(
      `${path} execution 面不携带 gate/verdict/surface/observation_result（身份锚非判卷面——禁串位）`,
      INPUT_HINT,
    );
  }
}

function validateInput(input: FailureDomainJudgmentInput): void {
  if (input === null || typeof input !== "object") {
    throw schemaInvalid("input 须为对象", INPUT_HINT);
  }
  requireNonEmptyString(input.symptom, "input.symptom");
  if (input.declared_domain !== null) {
    if (!(FAILURE_DOMAIN_VALUES as readonly string[]).includes(input.declared_domain)) {
      throw schemaInvalid(
        `input.declared_domain = ${String(input.declared_domain)} 不在六失败域闭包（${FAILURE_DOMAIN_VALUES.join("/")}）`,
        VOCAB_HINT,
      );
    }
  }
  if (!Array.isArray(input.faces)) {
    throw schemaInvalid("input.faces 须为数组（空集合法——零证据申报）", INPUT_HINT);
  }
  const seenRefs = new Set<string>();
  for (let index = 0; index < input.faces.length; index += 1) {
    validateFace(input.faces[index] as DiagnoseEvidenceFace, `input.faces[${index}]`, seenRefs);
  }
}

// ============================================================
// 判定核（纯函数；确定性——申报优先，零申报走信号派生，零信号诚实 unknown）
// ============================================================

/** 一次失败信号（run 面 verdict=failed 且 gate 命中映射）。 */
interface DomainSignal {
  readonly ref: string;
  readonly gate: string;
  readonly domain: FailureDomain;
}

function signalLabel(signal: DomainSignal): string {
  return `${signal.ref}(${signal.gate}/failed→${signal.domain})`;
}

function deriveSignals(faces: readonly DiagnoseEvidenceFace[]): DomainSignal[] {
  const signals: DomainSignal[] = [];
  for (const face of faces) {
    if (face.kind !== "run" || face.verdict !== "failed" || face.gate === null) continue;
    const domain = RUN_GATE_DOMAIN_SIGNALS[face.gate];
    if (domain === undefined) continue; // 未映射 gate 零信号——不冒充机判
    signals.push({ ref: face.ref, gate: face.gate, domain });
  }
  return signals;
}

function nextActionsFor(domain: FailureDomain): string[] {
  return FAILURE_DOMAIN_CAPABILITY_PRIORITY[domain].map(
    (capability) => `${capability} REQUIRED — ${CAPABILITY_EVIDENCE_REQUIREMENT[capability]}`,
  );
}

/**
 * 失败域判定（确定性序）：
 * 1. 申报在座：域 = 申报域；同域信号 → evidence_chain（佐证链）；否则 declaration_only
 *    （含冲突信号呈报 conflicting_refs——呈报非改判）。
 * 2. 零申报 + 信号在座：信号全部同域 → 派生该域 + evidence_chain；跨域分歧 →
 *    unknown_insufficient_evidence + declaration_only（全部分歧信号进 conflicting_refs
 *    ——分歧是证据不足的一种，不冒充机判；当前映射单目标，分歧分支是扩映射 SP 后
 *    的总性保障）。
 * 3. 零申报 + 零信号 → unknown_insufficient_evidence + declaration_only。
 */
export function judgeFailureDomain(input: FailureDomainJudgmentInput): FailureDomainJudgment {
  validateInput(input);
  const signals = deriveSignals(input.faces);
  const declared = input.declared_domain;
  const fingerprint = sha256OfCanonical(input);

  if (declared !== null) {
    const corroborating = signals.filter((signal) => signal.domain === declared);
    const conflicting = signals.filter((signal) => signal.domain !== declared);
    const confidenceBasis: FailureDomainConfidenceBasis =
      corroborating.length > 0 ? "evidence_chain" : "declaration_only";
    let basis: string;
    if (corroborating.length > 0) {
      basis = `申报 ${declared}；在座 run 回执同域信号佐证：${corroborating.map(signalLabel).join("、")}`;
    } else if (conflicting.length > 0) {
      basis = `申报 ${declared}；在座证据未产出同域信号（关联不虚构）；冲突信号呈报：${conflicting.map(signalLabel).join("、")}`;
    } else {
      basis = `申报 ${declared}；在座证据未产出同域信号（关联不虚构——confidence_basis=declaration_only）`;
    }
    return {
      failure_domain: declared,
      confidence_basis: confidenceBasis,
      corroborating_refs: corroborating.map((signal) => signal.ref),
      conflicting_refs: conflicting.map((signal) => signal.ref),
      next_actions: nextActionsFor(declared),
      basis,
      inputs_fingerprint: fingerprint,
    };
  }

  if (signals.length === 0) {
    return {
      failure_domain: "unknown_insufficient_evidence",
      confidence_basis: "declaration_only",
      corroborating_refs: [],
      conflicting_refs: [],
      next_actions: nextActionsFor("unknown_insufficient_evidence"),
      basis: "零申报且在座证据零失败域信号（unknown_insufficient_evidence——不冒充机判）",
      inputs_fingerprint: fingerprint,
    };
  }

  const distinctDomains = [...new Set(signals.map((signal) => signal.domain))];
  if (distinctDomains.length > 1) {
    return {
      failure_domain: "unknown_insufficient_evidence",
      confidence_basis: "declaration_only",
      corroborating_refs: [],
      conflicting_refs: signals.map((signal) => signal.ref),
      next_actions: nextActionsFor("unknown_insufficient_evidence"),
      basis: `零申报且失败信号跨域分歧（不冒充机判）：${signals.map(signalLabel).join("、")}`,
      inputs_fingerprint: fingerprint,
    };
  }

  const derived = distinctDomains[0] as FailureDomain;
  return {
    failure_domain: derived,
    confidence_basis: "evidence_chain",
    corroborating_refs: signals.map((signal) => signal.ref),
    conflicting_refs: [],
    next_actions: nextActionsFor(derived),
    basis: `零申报；失败域由在座 run 回执失败信号确定性派生：${signals.map(signalLabel).join("、")}`,
    inputs_fingerprint: fingerprint,
  };
}
