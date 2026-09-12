/**
 * evidence-qualification.ts —— 证据绑定资格链判定核（W1 R1-5 切片；09-10 PRD REQ-06
 * 「错 revision/实例证据不能满足当前要求」+ AC-04 三反例 + W1 PRD R1-5）。
 *
 * 职责：对一条既有证据（GRN run / 感知回执 / CLM 判定面）对照「当前要求面」逐轴
 * 判定其是否仍满足当前要求——错 seq / 失效 Permit / 旧 gate_def（oracle 版本比对，
 * browser-evidence.ts:13-14「判卷语义变更走 gate_def 版本化」先例）的证据不满足
 * 当前要求。纯函数核：零 fs、零 store、零墙钟（plan-compiler.ts 同款纪律），同输入
 * → 同输出字节稳定；批量入口带 inputs_fingerprint（sha256OfCanonical 整个输入）。
 *
 * ═══ 判定轴与语义（evidence-invalidation-map §5 最小增量 1/4/5）═══
 * - seq 轴（§5-1）：证据锚 captured_at_seq < baseline 确认态 at_seq → 否决（证据产生于
 *   当前确认基线之前）。双侧 seq 均在场才可比——任一侧 null = 轴诚实不适用（零新
 *   字段：锚就是既有 GRN.ran_at_seq / CLM.verification.at_seq 与 baseline confirmed
 *   at_seq）；boundary（captured == baseline）合格。
 * - permit 轴（§5-4）：证据挂载执行（execution_id）命中 journal 失效事件 → 否决。
 *   事件 ↔ 执行关联双通道：事件 execution_id 直配（EXECUTION_INTERRUPTED 携带
 *   execution_id），或事件 permit_ref ∈ 该执行的 permit_ids（PERMIT_EXPIRED_OBSERVED /
 *   PERMIT_STOLEN 无 execution_id 键——producer 词形零改动，关联经 executions/
 *   AGX-*.json 的 permit_ids 装配，由 CLI 侧供给 execution_permits 映射）。无挂载执行
 *   = 轴不适用。
 * - gate_def / oracle 轴（§5-5）：证据 gate 在当前注册面且 gate_def ≠ 当前值 → 否决；
 *   gate 不在册 = 轴诚实不适用（自定义 gate 不冒充被取代）；证据 oracle_ref 与当前
 *   要求 oracle 不一致 → 否决（current_oracle_ref = null 即轴显式关闭）。
 * - subject 轴：证据 subject 与要求 subject 不一致 → 否决（SUBJECT_MISMATCH）。防线
 *   叠加非替换——closeout 既有 DOD_CLAIM_SUBJECT_MISMATCH 仍是消费者权威，本核的
 *   subject 轴供未来统一收编（本切片消费方传 null = 轴显式关闭）。
 *
 * ═══ 判定优先级序（确定性：verdict 取首中否决轴；全部否决轴进 reason）═══
 * SUBJECT_MISMATCH → STALE_SEQ → PERMIT_INVALIDATED → ORACLE_SUPERSEDED → QUALIFIED。
 *
 * ═══ 词形闭包（kernel 局部词 TODO(vocab-pr)；SP 提案待追认）═══
 * - verdict 词形沿既有词族收编：STALE_SEQ 沿 grounding STALE_GROUNDING 词族；
 *   PERMIT_INVALIDATED 沿 permit 事件词族（PERMIT_EXPIRED_OBSERVED/PERMIT_STOLEN 的
 *   失效语义聚合）；ORACLE_SUPERSEDED 沿 lifecycle SUPERSEDED 词族；SUBJECT_MISMATCH
 *   沿 DOD_CLAIM_SUBJECT_MISMATCH 词族；QUALIFIED 为唯一合格词形。
 * - 事件词形是 producer 既有词（permits.ts/locks.ts/execution.ts journal 事件）——本核
 *   只消费零新增；surface 三词形（run/observation/claim）是承载面词类 SP 提案。
 *
 * ═══ 诚实边界（本切片显式不裁）═══
 * - 环境全维度重判不实现（REQ-06 的 revision/环境轴只落 seq/gate_def/oracle 可机器
 *   比对面；环境指纹重判归 plan 复用接缝，见 plan-compiler.ts 头注 R1-5 接缝节）；
 * - blob / truth_object 形态的 evidence_refs 不携带 seq/gate_def 锚，不在资格分母
 *   （调用方不入批——缺席诚实，非静默放行）；
 * - 消费方（closeout / record verification）负责分母完整性与既有资格检查——本核是
 *   叠加轴，不替换任何既有防线。
 */
import { GovernanceError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";
import { EXECUTION_ID_PATTERN } from "./execution.js";

// ============================================================
// 词形闭包（kernel 局部词 TODO(vocab-pr)；SP 提案待追认）
// ============================================================

/** 资格判定词形闭包（唯一合格词形 QUALIFIED + 四否决词形；首中优先级序见头注）。 */
export const EVIDENCE_QUALIFICATION_VERDICTS = [
  "QUALIFIED",
  "STALE_SEQ",
  "PERMIT_INVALIDATED",
  "ORACLE_SUPERSEDED",
  "SUBJECT_MISMATCH",
] as const;
export type EvidenceQualificationVerdict = (typeof EVIDENCE_QUALIFICATION_VERDICTS)[number];

/** 证据承载面词类（消费方映射：GRN→run、感知回执→observation、CLM 判定面→claim）。 */
export const EVIDENCE_QUALIFICATION_SURFACES = ["run", "observation", "claim"] as const;
export type EvidenceQualificationSurface = (typeof EVIDENCE_QUALIFICATION_SURFACES)[number];

/** 失效事件词形（producer 既有词：permits.ts/locks.ts/execution.ts journal 事件——只消费零新增）。 */
export const EVIDENCE_INVALIDATION_EVENT_TYPES = [
  "PERMIT_EXPIRED_OBSERVED",
  "PERMIT_STOLEN",
  "EXECUTION_INTERRUPTED",
] as const;
export type EvidenceInvalidationEventType = (typeof EVIDENCE_INVALIDATION_EVENT_TYPES)[number];

// ============================================================
// 输入合同（snake_case——文件/事实世界词形；校验 fail-closed）
// ============================================================

/** 证据面（一条既有证据的资格判定输入；锚缺失显式 null——对应轴诚实不适用）。 */
export interface EvidenceQualificationEvidence {
  /** 证据 id（GRN-0001 / CLM-0001 / OBS-*；批内唯一）。 */
  readonly ref: string;
  readonly surface: EvidenceQualificationSurface;
  /** 证据锚 seq（GRN.ran_at_seq / OBS.captured_at_seq / CLM.verification.at_seq）；null = 锚缺席。 */
  readonly captured_at_seq: number | null;
  /** gate 名（03 词形 BUILD/CONTRACT/…）；null = gate_def 轴不适用。 */
  readonly gate: string | null;
  /** gate_def 锚（'POLICY.GATE.<NAME>@semver'）；null = gate_def 轴不适用。 */
  readonly gate_def: string | null;
  /** oracle 引用（claim 判定面可携带）；null = oracle 轴不适用。 */
  readonly oracle_ref: string | null;
  /** 挂载执行身份（AGX-*；permit 失效事件消费锚）；null = permit 轴不适用。 */
  readonly execution_id: string | null;
  /** 证据归属主体（TASK.* 等）；null = subject 轴不适用。 */
  readonly subject: string | null;
}

/** journal 失效事件（producer 词形子集——本核消费的判卷位；其余键不进判定）。 */
export interface EvidenceInvalidationEvent {
  readonly type: EvidenceInvalidationEventType;
  /** 事件 seq 采样（A4；reason 引用位）。 */
  readonly seq: number;
  /** EXECUTION_INTERRUPTED 携带执行身份直配锚；permit 词形事件 = null。 */
  readonly execution_id: string | null;
  /** permit 词形事件携带许可引用（经 execution_permits 关联执行）；interrupted = null。 */
  readonly permit_ref: string | null;
}

/** 当前要求面（消费方装配：baseline 确认态 + journal 失效事件 + 执行许可绑定 + 当前注册面）。 */
export interface EvidenceQualificationRequirement {
  /** baseline 确认态 at_seq（readBaselineConfirmation 单源）；null = 无确认基线（seq 轴不适用）。 */
  readonly baseline_at_seq: number | null;
  /** journal 失效事件集（三词形 producer；空集 = permit 轴无否决输入）。 */
  readonly invalidated_events: readonly EvidenceInvalidationEvent[];
  /** execution_id → 挂载 permit refs（executions/AGX-*.json permit_ids 装配）。 */
  readonly execution_permits: Readonly<Record<string, readonly string[]>>;
  /** 当前 gate_def 注册面（gate 名 → 当前 gate_def；gate 不在册 = 该轴不适用）。 */
  readonly current_gate_defs: Readonly<Record<string, string>>;
  /** 当前要求 oracle 引用；null = oracle 轴显式关闭。 */
  readonly current_oracle_ref: string | null;
  /** 要求 subject；null = subject 轴显式关闭（防线归既有消费者）。 */
  readonly subject: string | null;
}

// ============================================================
// 输出合同
// ============================================================

export interface EvidenceQualificationFinding {
  readonly ref: string;
  readonly surface: EvidenceQualificationSurface;
  /** true = QUALIFIED；false = 四否决词形之一。 */
  readonly qualified: boolean;
  readonly verdict: EvidenceQualificationVerdict;
  /** QUALIFIED = 对齐摘要；否决 = 全部否决轴细节（verdict 是首中轴，reason 不降级遗漏）。 */
  readonly reason: string;
}

export interface EvidenceQualificationOutcome {
  readonly findings: readonly EvidenceQualificationFinding[];
  /** 全部证据 qualified = true（空批 = true——分母空置由调用方既有防线负责）。 */
  readonly qualified: boolean;
  readonly inputs_fingerprint: string;
}

// ============================================================
// fail-closed 校验（SCHEMA_INVALID；禁静默当不适用/禁畸形输入放行）
// ============================================================

function schemaInvalid(message: string, hint: string): GovernanceError {
  return new GovernanceError("SCHEMA_INVALID", message, hint);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw schemaInvalid(
      `${path} 须为非空字符串（fail-closed——禁静默当不适用）`,
      "evidence-qualification 输入合同校验失败",
    );
  }
  return value;
}

function requireSeqOrNull(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw schemaInvalid(
      `${path} 须为非负整数或 null（seq 锚缺席显式 null，禁负数/小数/词形外）`,
      "evidence-qualification 输入合同校验失败",
    );
  }
  return value;
}

function requireStringOrNull(value: unknown, path: string): string | null {
  if (value === null) return null;
  return requireNonEmptyString(value, path);
}

function validateEvidence(evidence: EvidenceQualificationEvidence): void {
  if (evidence === null || typeof evidence !== "object") {
    throw schemaInvalid("evidence 须为对象", "evidence-qualification 输入合同校验失败");
  }
  requireNonEmptyString(evidence.ref, "evidence.ref");
  if (!(EVIDENCE_QUALIFICATION_SURFACES as readonly string[]).includes(evidence.surface)) {
    throw schemaInvalid(
      `evidence.surface = ${String(evidence.surface)} 不在承载面词形闭包（${EVIDENCE_QUALIFICATION_SURFACES.join("/")}）`,
      "evidence-qualification 承载面词形闭包=SP 提案待追认（TODO(vocab-pr)）",
    );
  }
  requireSeqOrNull(evidence.captured_at_seq, "evidence.captured_at_seq");
  requireStringOrNull(evidence.gate, "evidence.gate");
  requireStringOrNull(evidence.gate_def, "evidence.gate_def");
  requireStringOrNull(evidence.oracle_ref, "evidence.oracle_ref");
  const executionId = requireStringOrNull(evidence.execution_id, "evidence.execution_id");
  if (executionId !== null && !EXECUTION_ID_PATTERN.test(executionId)) {
    throw schemaInvalid(
      `evidence.execution_id = ${executionId} 不在 AGX 词形（${EXECUTION_ID_PATTERN.source}）`,
      "执行身份词形见 kernel EXECUTION_ID_PATTERN（S1 禁自造身份）",
    );
  }
  requireStringOrNull(evidence.subject, "evidence.subject");
}

function validateRequirement(requirement: EvidenceQualificationRequirement): void {
  if (requirement === null || typeof requirement !== "object") {
    throw schemaInvalid("requirement 须为对象", "evidence-qualification 输入合同校验失败");
  }
  requireSeqOrNull(requirement.baseline_at_seq, "requirement.baseline_at_seq");
  if (!Array.isArray(requirement.invalidated_events)) {
    throw schemaInvalid(
      "requirement.invalidated_events 须为数组（空集合法——permit 轴无否决输入）",
      "evidence-qualification 输入合同校验失败",
    );
  }
  for (let index = 0; index < requirement.invalidated_events.length; index += 1) {
    const event = requirement.invalidated_events[index] as EvidenceInvalidationEvent;
    const path = `requirement.invalidated_events[${index}]`;
    if (event === null || typeof event !== "object") {
      throw schemaInvalid(`${path} 须为对象`, "evidence-qualification 输入合同校验失败");
    }
    if (!(EVIDENCE_INVALIDATION_EVENT_TYPES as readonly string[]).includes(event.type)) {
      throw schemaInvalid(
        `${path}.type = ${String(event.type)} 不在失效事件词形闭包（${EVIDENCE_INVALIDATION_EVENT_TYPES.join("/")}）——非失效事件不进资格分母，应在上游过滤`,
        "evidence-qualification 事件词形=producer 既有词（permits/locks/execution journal）；只消费零新增",
      );
    }
    requireSeqOrNull(event.seq, `${path}.seq`);
    const eventExecutionId = requireStringOrNull(event.execution_id, `${path}.execution_id`);
    if (eventExecutionId !== null && !EXECUTION_ID_PATTERN.test(eventExecutionId)) {
      throw schemaInvalid(
        `${path}.execution_id = ${eventExecutionId} 不在 AGX 词形`,
        "执行身份词形见 kernel EXECUTION_ID_PATTERN",
      );
    }
    requireStringOrNull(event.permit_ref, `${path}.permit_ref`);
  }
  if (requirement.execution_permits === null || typeof requirement.execution_permits !== "object") {
    throw schemaInvalid(
      "requirement.execution_permits 须为 Record<execution_id, permit_refs[]>",
      "evidence-qualification 输入合同校验失败",
    );
  }
  for (const [executionId, permitRefs] of Object.entries(requirement.execution_permits)) {
    if (!EXECUTION_ID_PATTERN.test(executionId)) {
      throw schemaInvalid(
        `requirement.execution_permits 键 = ${executionId} 不在 AGX 词形`,
        "evidence-qualification 输入合同校验失败",
      );
    }
    if (!Array.isArray(permitRefs)) {
      throw schemaInvalid(
        `requirement.execution_permits[${executionId}] 须为 string[]（executions/ permit_ids；空数组合法——显式无许可）`,
        "evidence-qualification 输入合同校验失败",
      );
    }
    permitRefs.forEach((permitRef, permitIndex) => {
      requireNonEmptyString(permitRef, `requirement.execution_permits[${executionId}][${permitIndex}]`);
    });
  }
  if (requirement.current_gate_defs === null || typeof requirement.current_gate_defs !== "object") {
    throw schemaInvalid(
      "requirement.current_gate_defs 须为 Record<gate, gate_def>（空面合法——gate_def 轴全不适用）",
      "evidence-qualification 输入合同校验失败",
    );
  }
  for (const [gate, gateDef] of Object.entries(requirement.current_gate_defs)) {
    requireNonEmptyString(gate, "requirement.current_gate_defs 键");
    requireNonEmptyString(gateDef, `requirement.current_gate_defs[${gate}]`);
  }
  requireStringOrNull(requirement.current_oracle_ref, "requirement.current_oracle_ref");
  requireStringOrNull(requirement.subject, "requirement.subject");
}

// ============================================================
// 判定核（优先级序见头注；verdict 首中，reason 全轴）
// ============================================================

export function qualifyEvidence(
  evidence: EvidenceQualificationEvidence,
  requirement: EvidenceQualificationRequirement,
): EvidenceQualificationFinding {
  validateEvidence(evidence);
  validateRequirement(requirement);
  return judge(evidence, requirement);
}

function judge(
  evidence: EvidenceQualificationEvidence,
  requirement: EvidenceQualificationRequirement,
): EvidenceQualificationFinding {
  const vetoes: string[] = [];
  let verdict: EvidenceQualificationVerdict = "QUALIFIED";
  const firstHit = (word: EvidenceQualificationVerdict, detail: string): void => {
    vetoes.push(detail);
    if (verdict === "QUALIFIED") verdict = word;
  };

  // —— subject 轴（防线叠加非替换；消费方显式传 null = 轴关闭） ——
  if (requirement.subject !== null && evidence.subject !== null && evidence.subject !== requirement.subject) {
    firstHit(
      "SUBJECT_MISMATCH",
      `subject 轴：证据 subject=${evidence.subject} 与要求 subject=${requirement.subject} 不一致（跨主体证据不构成本要求的验收证据）`,
    );
  }

  // —— seq 轴（§5-1：双侧锚在场才可比；boundary 相等合格） ——
  if (
    requirement.baseline_at_seq !== null &&
    evidence.captured_at_seq !== null &&
    evidence.captured_at_seq < requirement.baseline_at_seq
  ) {
    firstHit(
      "STALE_SEQ",
      `seq 轴：证据锚 seq=${evidence.captured_at_seq} 早于 baseline 确认 at_seq=${requirement.baseline_at_seq}——证据产生于当前确认基线之前（§5-1 seq 比对）`,
    );
  }

  // —— permit 轴（§5-4：事件 execution_id 直配，或事件 permit_ref ∈ 执行 permit_ids） ——
  if (evidence.execution_id !== null) {
    const boundPermits = requirement.execution_permits[evidence.execution_id];
    for (const event of requirement.invalidated_events) {
      const direct = event.execution_id !== null && event.execution_id === evidence.execution_id;
      const viaPermit =
        event.permit_ref !== null && boundPermits !== undefined && boundPermits.includes(event.permit_ref);
      if (direct || viaPermit) {
        const linkage = direct
          ? "execution_id 直配"
          : `经 executions/ permit_ids 绑定（${event.permit_ref}）`;
        firstHit(
          "PERMIT_INVALIDATED",
          `permit 轴：证据挂载执行 ${evidence.execution_id} 关联失效事件 ${event.type}@seq=${event.seq}${event.permit_ref !== null ? `（permit_ref=${event.permit_ref}，${linkage}）` : `（${linkage}）`}——失效执行产出不构成当前要求的合格证据（§5-4）`,
        );
        break; // 首个命中事件进 reason（确定性；其余事件同轴同词形）
      }
    }
  }

  // —— gate_def 轴（§5-5：gate 在册且版本不等 → 被当前版本取代；不在册 = 不适用） ——
  if (evidence.gate !== null && evidence.gate_def !== null) {
    const currentGateDef = requirement.current_gate_defs[evidence.gate];
    if (currentGateDef !== undefined && currentGateDef !== evidence.gate_def) {
      firstHit(
        "ORACLE_SUPERSEDED",
        `gate_def 轴：证据 gate=${evidence.gate} 的 gate_def=${evidence.gate_def} 已被当前版本 ${currentGateDef} 取代——旧判卷口径下的结果不满足当前要求（§5-5 oracle/gate_def 版本比对）`,
      );
    }
  }

  // —— oracle 轴（§5-5：双侧引用在场且不等 → 取代；任一侧 null = 轴关闭） ——
  if (
    evidence.oracle_ref !== null &&
    requirement.current_oracle_ref !== null &&
    evidence.oracle_ref !== requirement.current_oracle_ref
  ) {
    firstHit(
      "ORACLE_SUPERSEDED",
      `oracle 轴：证据 oracle_ref=${evidence.oracle_ref} 与当前要求 oracle=${requirement.current_oracle_ref} 不一致——旧 oracle 下的判定不满足当前要求（§5-5）`,
    );
  }

  if (verdict !== "QUALIFIED") {
    return { ref: evidence.ref, surface: evidence.surface, qualified: false, verdict, reason: vetoes.join("；") };
  }
  const seqAxis =
    requirement.baseline_at_seq === null || evidence.captured_at_seq === null
      ? "不适用"
      : `锚=${evidence.captured_at_seq} ≥ 确认=${requirement.baseline_at_seq}`;
  const permitAxis =
    evidence.execution_id === null
      ? "不适用（无挂载执行）"
      : `执行 ${evidence.execution_id} 无命中失效事件`;
  const gateDefAxis =
    evidence.gate === null || evidence.gate_def === null
      ? "不适用"
      : requirement.current_gate_defs[evidence.gate] === undefined
        ? "gate 不在册（不适用）"
        : "在册比对相等";
  const subjectAxis =
    requirement.subject === null || evidence.subject === null ? "不适用" : "在册比对相等";
  return {
    ref: evidence.ref,
    surface: evidence.surface,
    qualified: true,
    verdict: "QUALIFIED",
    reason:
      `证据与当前要求面对齐（seq 轴 ${seqAxis}；permit 轴 ${permitAxis}；` +
      `gate_def 轴 ${gateDefAxis}；subject 轴 ${subjectAxis}）`,
  };
}

// ============================================================
// 批量入口（分母级 fingerprint + ref 唯一性）
// ============================================================

export function qualifyEvidenceBatch(
  evidences: readonly EvidenceQualificationEvidence[],
  requirement: EvidenceQualificationRequirement,
): EvidenceQualificationOutcome {
  if (!Array.isArray(evidences)) {
    throw schemaInvalid(
      "evidences 须为数组（空批合法——分母空置由调用方既有防线负责）",
      "evidence-qualification 输入合同校验失败",
    );
  }
  validateRequirement(requirement);
  const seenRefs = new Set<string>();
  for (const evidence of evidences) {
    validateEvidence(evidence);
    if (seenRefs.has(evidence.ref)) {
      throw schemaInvalid(
        `evidence ref 重复：${evidence.ref}（资格分母 ref 须唯一——重复引用 = 分母自相矛盾）`,
        "evidence-qualification 输入合同校验失败",
      );
    }
    seenRefs.add(evidence.ref);
  }
  const findings = evidences.map((evidence) => judge(evidence, requirement));
  return {
    findings,
    qualified: findings.every((finding) => finding.qualified),
    inputs_fingerprint: sha256OfCanonical({ evidences, requirement }),
  };
}
