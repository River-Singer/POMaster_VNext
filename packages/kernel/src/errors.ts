/**
 * errors.ts —— kernel 治理错误体系。
 *
 * 两族错误：
 * - GovernedIdParseError：契约类（docs/kernel-api.md §3，与 packages/kernel/src/index.ts 1:1）。
 *   parseGovernedId 的唯一失败通道（A5 closed-world：解析即 FATAL，无 WARNING 档）。
 * - GovernanceError：kernel 其余 FATAL 分支的统一错误通道。每条错误必带 `hint`
 *   （escalation 纪律：报错不说去哪修 = 缺陷，GOLDEN-L3-ERROR-ACTIONABLE）与
 *   `code`（机器可判读的 reason_code，供 CLI/编排层翻译为退出码或 verdict）。
 *
 * 与显式 outcome 通道的关系（docs/kernel-api.md §8）：
 * - Permit 的 expired / unknown_permit / denied 是 PermitCheckResult 的显式 outcome，
 *   对应码位 PERMIT_EXPIRED / PERMIT_NOT_FOUND / PERMIT_SCOPE_DENIED 作为需要
 *   throw 语义的上层（CLI）转换目标保留；
 * - DENOMINATOR 的删除拒绝在 checkPermit 显式 denied（delete_forbidden_supersede_only），
 *   码位 DENOMINATOR_DELETE_FORBIDDEN 为上层转换目标保留；
 * - FATAL_UNKNOWN_PREFIX / FATAL_ID_GRAMMAR 是 GovernedIdParseError.reason 的
 *   GovernanceError 同义码位（store 写入层统一包装时使用）。
 */

/** parseGovernedId 失败（A5：解析即 FATAL，无 WARNING 档）。契约类，逐字保持签名。 */
export class GovernedIdParseError extends Error {
  readonly id: string;
  /** unknown_prefix = 未登记前缀（A5 closed-world）；grammar = SEGMENT/SEQ 文法违规。 */
  readonly reason: "unknown_prefix" | "grammar";

  constructor(id: string, reason: "unknown_prefix" | "grammar", detail: string) {
    super(`governed id parse failed (${reason}): ${id} — ${detail}`);
    this.name = "GovernedIdParseError";
    this.id = id;
    this.reason = reason;
  }
}

/**
 * GovernanceError 机器码位表。
 * 命名纪律：FATAL_/词表类大写下划线（gate_def 级 reason_code 词形，GOLDEN-L3-CASE-C
 * 确立的「reason_code 走 snake_case/独立维度、不扩 verdict 词表」精神）。
 */
export type GovernanceErrorCode =
  /** 未登记前缀（A5）。store 写入层包装 GovernedIdParseError(reason=unknown_prefix) 时使用。 */
  | "FATAL_UNKNOWN_PREFIX"
  /** SEGMENT/SEQ 文法违规。store 写入层包装 GovernedIdParseError(reason=grammar) 时使用。 */
  | "FATAL_ID_GRAMMAR"
  /** 词表外值（vocab-lock FROZEN 之外；扩值必须走词汇表 PR）。 */
  | "VOCAB_INVALID_VALUE"
  /** 检查前提缺失（store 未初始化 / authority map 缺失等）。终局性诚实报告，非静默。 */
  | "NOT_CONFIGURED"
  /** 01/02/05/06/07 schema 校验失败（含 C3 条件必填、R4 之外的形状问题）。 */
  | "SCHEMA_INVALID"
  /** vocab_lock 三指纹对账失败（枚举多头拷贝事故的结构免疫；D24 read_only_service 的 identity 抽验）。 */
  | "VOCAB_MISMATCH"
  /** 幽灵 owner：authority_owner 无法在 authority.json 解析（FATAL 而非 WARNING，维护死锁教训）。 */
  | "GHOST_AUTHORITY_OWNER"
  /** sources[].type ∈ forbidden 两值（prototype_html_scrape / ai_invention）——Transition 层 FATAL 并留痕。 */
  | "SOURCE_TYPE_FORBIDDEN"
  /** sources[] 条目缺 pin（baseline/version/digest 三选一必填，基线漂移免疫）。 */
  | "SOURCE_PIN_MISSING"
  /** R4：change_object / task_object 缺 payload.class_scan_result（修一处漏一类的封堵）。 */
  | "CLASS_SCAN_REQUIRED"
  /** 跨轴耦合断言失败（MIGRATING⇒permits、PROPOSED/REJECTED⇒PLANNED）。 */
  | "CROSS_AXIS_ASSERTION"
  /** lifecycle=SUPERSEDED 但 successor_ref 缺失（vocab-lock transitions）。 */
  | "SUCCESSOR_REQUIRED"
  /** 非法迁移（转移矩阵外的 lifecycle 迁移，如 SUPERSEDED→CURRENT 撤销 supersede）。 */
  | "TRANSITION_ILLEGAL"
  /** 迁移前置缺失：authority_approval / transition_record / LOCKED 挑战所需的决策引用未提供（进化通道）。 */
  | "EVOLUTION_REQUIRED"
  /** 引用的治理对象不存在。 */
  | "OBJECT_NOT_FOUND"
  /** DENOMINATOR 删除请求（码位保留：checkPermit 以显式 outcome denied 表达）。 */
  | "DENOMINATOR_DELETE_FORBIDDEN"
  /** REF_INTEGRITY 基础项违规（canonical 重复 / C3 悬空 producer / 分母悬空 successor 等）。 */
  | "REF_INTEGRITY_VIOLATION"
  /** 许可过期（码位保留：checkPermit 以显式 outcome expired + journal 事件表达）。 */
  | "PERMIT_EXPIRED"
  /** 引用的许可不存在（stealPermit 未知许可 → throw）。 */
  | "PERMIT_NOT_FOUND"
  /** 许可范围外写入（码位保留：checkPermit 以显式 outcome denied 表达；scope expansion 禁静默放行，D20）。 */
  | "PERMIT_SCOPE_DENIED"
  /** GRN id 缺失或词形非法（evidence/runs/ 身份字段，调用方/运行层必须提供）。 */
  | "GRN_INVALID"
  /** gate 计数块非法（notApplicable 缺席/NaN、produced>scanned 自相矛盾等，C1）。 */
  | "GATE_COUNTS_INVALID"
  /** Q3 fixture 隔离违规：subjectId 前缀 TEST.* ⇔ isFixture=true 双向强校验失败。 */
  | "FIXTURE_ISOLATION_VIOLATION"
  /** 引用的会话未 attach（runtime/sessions/<session_key>.json 缺失；锁/执行身份的会话锚）。 */
  | "SESSION_NOT_FOUND"
  /** attach 既有活会话且 harness 不同（会话载体顶替）但未显式 force——顶替不可无声（P20 红队发现 3）。 */
  | "SESSION_REPLACE_REQUIRED"
  /** 引用的锁不存在（runtime/locks/<lock_id>；锁状态显式可见非隐式）。 */
  | "LOCK_NOT_FOUND"
  /** 锁操作主体非当前持有人（释放/心跳非持有人 = 显式拒绝，禁静默）。 */
  | "LOCK_NOT_HELD"
  /** 引用的执行身份未登记（executions/AGX-*.json 缺失——S1：身份是基础设施印的，
   *  证据挂载到未登记身份 = 自造身份，fail-closed）。 */
  | "EXECUTION_NOT_FOUND"
  /** beginExecution 重复登记同号执行身份（AGX-n 主键唯一）。 */
  | "EXECUTION_ALREADY_EXISTS"
  /** endExecution 目标已封口（ended_at 在场；重复封口 = 调用方缺陷，显式拒绝）。 */
  | "EXECUTION_ALREADY_ENDED"
  /** 单机本地盘假设破裂（目录不可创建 / 原子替换失败 / runtime 侧车不可读），禁静默。 */
  | "ENVIRONMENT_ERROR"
  /** 非权威位动作被拒（§83.10/§25.3：Knowledge 晋升必须 Maintain / Authority /
   *  Gatekeeper 位；词形闸拒绝并指路权威位，§25.5 ⑦ Curator 直升 MUST 的机器化）。 */
  | "AUTHORITY_REQUIRED"
  /** 伪装并发（PRD §58「禁止伪装成真正并发」——MAJOR 级语义违例，契约层封死）：
   *  申报 concurrent 而执行计划经能力探测派生为 sequential/direct。 */
  | "RUNTIME_CONCURRENCY_MASQUERADE";

/** GovernanceError 判读上下文（错误详情结构化，机器可判读）。 */
export interface GovernanceErrorDetails {
  readonly [key: string]: unknown;
}

/** kernel 其余 FATAL 分支的统一错误通道。每条必带 hint（报错必须带路标）。 */
export class GovernanceError extends Error {
  readonly code: GovernanceErrorCode;
  /** 修复路标（escalation 纪律）：说清去哪修/找谁，禁止只报状态不说动作。 */
  readonly hint: string;
  readonly details: GovernanceErrorDetails;

  constructor(
    code: GovernanceErrorCode,
    message: string,
    hint: string,
    details?: GovernanceErrorDetails,
  ) {
    super(`[${code}] ${message} — hint: ${hint}`);
    this.name = "GovernanceError";
    this.code = code;
    this.hint = hint;
    this.details = details ?? {};
  }
}

/** 把 GovernedIdParseError 映射为 store 写入层统一的 GovernanceError 码位（cause 保留原文）。 */
export function governanceCodeForParseError(
  err: GovernedIdParseError,
): GovernanceErrorCode {
  return err.reason === "unknown_prefix"
    ? "FATAL_UNKNOWN_PREFIX"
    : "FATAL_ID_GRAMMAR";
}
