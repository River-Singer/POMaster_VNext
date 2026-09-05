/**
 * handoff.ts —— §24/§9A Handoff Protocol 语义落地面：Handoff Packet 形态定义 + 消费面
 * （P21-Enforcement 落地 + vNext Batch 2 R5 / Owner 裁定 D15 2026-09-04 扩键；
 * 纯函数零 IO 零墙钟，runtime-adapter.ts 同款纪律）。
 *
 * **Handoff 摘要 ≠ Truth**（vNext PRD §9A 逐字）：接收方不继承上一 Agent 的全上下文，
 * 由 Context Compiler 按 Packet 重新编译最小 Context——信包是交接的最小编译单元，
 * 是 Projection 不是 Canonical State（perception「Tool Output ≠ Truth」同族标记；
 * HANDOFF_NOT_TRUTH_NOTE 常量供呈现层消费）。
 *
 * 键位闭包（vNext Batch 2 R5，PRD §9A 字段集；PRD 授权「词形在实施批次定案」）：
 * 原 §24 九键 closed form 解除，扩为 §9A 十七键（键序 = §9A 字段集原文行序，逐字）：
 * task / from / to / expected_outcome / intent / completed_work / remaining_work /
 * changed_units / contracts_changed / authoritative_refs / required_policy_refs /
 * known_issues / known_unknowns / open_questions / evidence / write_permissions /
 * next_action。
 *
 * ADR-lite（键序与词形裁定，PRD §9A 授权本批定案）：
 * - 键序 = §9A 字段集原文行序（先身份路由两键，再意图/产出面，再引用/风险面，
 *   evidence 与 write_permissions、next_action 收尾——「下一步动作」恒为信包末键，
 *   读者最后读到的一定是动作位）；HANDOFF_PACKET_KEYS 顺序即此。
 * - 词形裁定：from/to 沿 §25.3 十二角色闭包（AGENT_ROLE_POOL_VALUES）；task 沿
 *   canonical/legacy 双读（resolveAlias 收编判定）；evidence 沿 §24 例文 fast_gate
 *   词形闭包 PASS|FAIL——evidence 键语义保持：唯 fast_gate 一键，其余证据走 evidence
 *   平面（GRN/CLM），不进信包（PRD §9A 原文）。authoritative_refs /
 *   required_policy_refs 首版只锁「非空字符串数组」词形（与 changed_units 同纪律），
 *   governed id 文法收窄不在本批私加（ref 悬空存在性对账归 Truth 对账面，与 18 号
 *   schema CONTRACT.* 示意词形放行同款取舍）。
 * - 路由键词形差异登记：PRD §9A 字段集表格词形为 from_role / to_role，实现定案为
 *   from / to（§24 例文原词形 + runtime-adapter 信封职责面既有词形零破坏；语义同一，
 *   十二角色闭包不变——PRD 授权「词形在实施批次定案」的定案留痕）。
 * - closed form 语义保留：顶层键超出十七键 = SCHEMA_INVALID——「不得直接继承完整
 *   聊天上下文」的结构封条不变（chat_transcript / thinking_trace / messages 等
 *   轨迹载体仍无键位可表达；拒绝靠形态闭合，不靠黑名单枚举）。扩展走词汇表/治理
 *   PR，不在消费面私放键位。
 * - 显式缺席纪律（C1）：全部数组键省键不合法、空数组 [] 合法（「确无条目写 []」）；
 *   字符串键（task/expected_outcome/intent/next_action）非空——预期结果与下一步
 *   动作是交接的最小义务位，缺席显式报错不静默。
 *
 * 命令面关系：`pomaster agents handoff` 仍显式 deferred（COMMAND_DEFERRED——托管编排
 * 执行面受 DEF-SUP 触发制门槛，D 线 §5；agents.ts deferred 状态零改动，转正不在
 * Batch 2）；本模块是其 deferred 下的**契约面**——词形与判定先行，执行面等触发制
 * （runtime-adapter.ts「契约与执行分层」同构）。
 *
 * 已知边界（P21 红队 MINOR，如实登记不发明新契约）：closed form 是**键位级**结构
 * 封条而非内容级——专用轨迹键被形态闭合拒绝，但 intent / known_issues 等自由文本键
 * 是无上界字符串载体，理论上可夹带大段上下文文本。PRD §9A 无尺寸条款，本模块不
 * 发明字节上限；内容级审查属接收方 Context Compiler 的职责面。
 */
import { GovernanceError } from "./errors.js";
import { resolveAlias } from "./id.js";
import { AGENT_ROLE_POOL_VALUES, type AgentRolePoolValue } from "./vocab.js";
import type { AgentContext } from "./runtime-adapter.js";

/** 「Handoff 摘要 ≠ Truth」标记常量（PRD §9A 逐字；呈现层消费——perception「Tool Output ≠ Truth」同族形态）。 */
export const HANDOFF_NOT_TRUTH_NOTE = "Handoff 摘要 ≠ Truth" as const;

/** §24 例文 `fast_gate: PASS` 词形闭包（大写逐字；FAIL 同族放行——PRD §9A「evidence：fast_gate: PASS|FAIL + 其余走 evidence 平面」）。
 * x-vocab-source: vocab-lock presentation_axes.handoff_fast_gate（PR-0009 收编——SUPERVISOR_TRIGGER_OBSERVED 同批转正先例）。 */
export const HANDOFF_FAST_GATE_VALUES = ["PASS", "FAIL"] as const;
export type HandoffFastGateValue = (typeof HANDOFF_FAST_GATE_VALUES)[number];

/**
 * §9A 字段集十七键（closed form 分母；顺序 = PRD §9A 字段集原文行序，vNext Batch 2
 * R5 / D15 扩键定案——原 §24 九键 closed form 解除，封闭纪律与键序裁定见模块头注 ADR）。
 */
export const HANDOFF_PACKET_KEYS = [
  "task",
  "from",
  "to",
  "expected_outcome",
  "intent",
  "completed_work",
  "remaining_work",
  "changed_units",
  "contracts_changed",
  "authoritative_refs",
  "required_policy_refs",
  "known_issues",
  "known_unknowns",
  "open_questions",
  "evidence",
  "write_permissions",
  "next_action",
] as const;
export type HandoffPacketKey = (typeof HANDOFF_PACKET_KEYS)[number];

/** 非空字符串键（§9A 最小义务位：意图/预期结果/下一步动作缺席显式报错，C1）。 */
export const HANDOFF_STRING_KEYS = ["task", "expected_outcome", "intent", "next_action"] as const;
type HandoffStringKey = (typeof HANDOFF_STRING_KEYS)[number];

/** 非空字符串数组键（显式缺席纪律：省键不合法、空数组合法、数组内空串不合法）。 */
export const HANDOFF_STRING_ARRAY_KEYS = [
  "completed_work",
  "remaining_work",
  "changed_units",
  "contracts_changed",
  "authoritative_refs",
  "required_policy_refs",
  "known_issues",
  "known_unknowns",
  "open_questions",
  "write_permissions",
] as const;
type HandoffStringArrayKey = (typeof HANDOFF_STRING_ARRAY_KEYS)[number];

/** evidence 子对象（closed：唯 fast_gate 一键——其余证据走 evidence 平面 GRN/CLM，不进信包）。 */
export interface HandoffPacketEvidence {
  readonly fast_gate: HandoffFastGateValue;
}

/**
 * Handoff Packet（PRD §9A 字段集的 TypeScript 形态镜像；键序一致）。不可变——
 * 信包一经验证即冻结形态，消费面不得增删键（「必须通过 Handoff Packet」的唯一性）。
 */
export interface HandoffPacket {
  /** 任务锚（§24 例文 TASK-0173 legacy 词形；canonical/legacy 双读，见头注裁定）。 */
  readonly task: string;
  readonly from: AgentRolePoolValue;
  readonly to: AgentRolePoolValue;
  /** 期望结果（§9A expected_outcome；非空——交接的最小义务位）。 */
  readonly expected_outcome: string;
  /** 单一职责的意图陈述（非空；「完成单一职责」的申报位）。 */
  readonly intent: string;
  readonly completed_work: readonly string[];
  readonly remaining_work: readonly string[];
  readonly changed_units: readonly string[];
  readonly contracts_changed: readonly string[];
  /** 权威引用（§9A authoritative_refs；首版非空字符串数组词形——头注 ADR）。 */
  readonly authoritative_refs: readonly string[];
  /** 必读策略引用（§9A required_policy_refs；同上）。 */
  readonly required_policy_refs: readonly string[];
  readonly known_issues: readonly string[];
  readonly known_unknowns: readonly string[];
  readonly open_questions: readonly string[];
  readonly evidence: HandoffPacketEvidence;
  /** 写权限（§9A write_permissions；接收方不得越权——显式申报位）。 */
  readonly write_permissions: readonly string[];
  /** 下一步（§9A next_action；非空——信包末键恒为动作位）。 */
  readonly next_action: string;
}

/** 词表闭包判定（runtime-adapter.ts planRoleExecution 同法）。 */
function assertRole(value: unknown, field: "from" | "to"): AgentRolePoolValue {
  if (typeof value !== "string") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.${field} 缺失或非字符串（§9A 字段集词形，如 from: IMPLEMENTER）`,
      `补 ${field} 键（十二角色词形）；词形闭包 ${AGENT_ROLE_POOL_VALUES.join(" | ")}`,
      { field },
    );
  }
  const matched = AGENT_ROLE_POOL_VALUES.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `Handoff Packet.${field} 角色词表外：${value}（PRD §25.3 十二角色轴——vocab-lock execution_identity_vocab.agent_role_pool，PR-0009）`,
      `合法词形：${AGENT_ROLE_POOL_VALUES.join(" | ")}；扩值走词汇表 PR`,
      { field, role: value },
    );
  }
  return matched;
}

/** 非空字符串判定（显式缺席 → SCHEMA_INVALID，不静默当空——C1）。 */
function assertNonEmptyString(value: unknown, field: HandoffStringKey): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.${field} 缺失或空（§9A 字段集最小义务位：缺席显式报错不静默）`,
      `补 ${field}（非空字符串；确无内容时写实义陈述而非空串）`,
      { field },
    );
  }
  return value;
}

/** 非空字符串数组判定（显式缺席 → SCHEMA_INVALID，不静默当空——C1）。 */
function assertStringArray(value: unknown, field: HandoffStringArrayKey): readonly string[] {
  if (!Array.isArray(value)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.${field} 缺失或非数组（§9A 字段集之一）`,
      `补 ${field} 键（字符串数组；确无条目写 []——显式缺席而非省键）`,
      { field },
    );
  }
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `Handoff Packet.${field} 含空/非字符串条目（条目须非空字符串）`,
        `逐条补实义内容；空条目删除（空数组 [] 是合法显式缺席，数组内空串不是）`,
        { field, item },
      );
    }
  }
  return Object.freeze([...value]);
}

/**
 * 验证并冻结一个 Handoff Packet（§24 MUST 的判卷点 + §9A 扩键后同一纪律）。closed
 * form：顶层键超出十七键 / evidence 内超出 fast_gate 一键 → SCHEMA_INVALID——这是
 * 「不得直接继承完整聊天上下文」的结构封条（chat_transcript 之类轨迹载体无键位可表达）。
 */
export function validateHandoffPacket(input: unknown): HandoffPacket {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "Handoff Packet 须为 JSON 对象（§9A 字段集形态）",
      `按 §9A 十七键形态构造：${HANDOFF_PACKET_KEYS.join(" / ")}`,
      {},
    );
  }
  const record = input as Record<string, unknown>;
  const extra = Object.keys(record).filter((key) => !(HANDOFF_PACKET_KEYS as readonly string[]).includes(key));
  if (extra.length > 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet 键超闭包（§24「必须通过 Handoff Packet」给出唯一形态 + §9A 字段集扩键定案；closed form 拒绝额外键位——完整聊天上下文等轨迹载体因此无键可表达）：${extra.join(", ")}`,
      `合法键闭包：${HANDOFF_PACKET_KEYS.join(" / ")}；扩展走治理 PR（不在消费面私放键位）`,
      { extra_keys: extra },
    );
  }
  const task = assertNonEmptyString(record.task, "task");
  // §24 例文是 legacy 词形：resolveAlias 收编判定（canonical 与 legacy 双读；不可收编 = 拒绝）。
  const taskResolution = resolveAlias(task);
  if (taskResolution.canonical === null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.task 不可收编为 governed id：${task}`,
      "用 canonical 词形（TASK.T0173）或 aliases_v0 legacy 词形（TASK-0173）；词法见 docs/kernel-api.md §3",
      { task, note: taskResolution.note },
    );
  }
  const from = assertRole(record.from, "from");
  const to = assertRole(record.to, "to");
  const expectedOutcome = assertNonEmptyString(record.expected_outcome, "expected_outcome");
  const intent = assertNonEmptyString(record.intent, "intent");
  const evidence = record.evidence;
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "Handoff Packet.evidence 缺失或非对象（§24 例文 evidence: {fast_gate: PASS}）",
      "补 evidence 对象（closed form：唯 fast_gate 一键，其余证据走 evidence 平面 GRN/CLM）",
      {},
    );
  }
  const evidenceRecord = evidence as Record<string, unknown>;
  const evidenceExtra = Object.keys(evidenceRecord).filter((key) => key !== "fast_gate");
  if (evidenceExtra.length > 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.evidence 键超闭包（closed form：唯 fast_gate；其余证据走 evidence 平面）：${evidenceExtra.join(", ")}`,
      "evidence 只呈现 fast_gate 位；其它证据走 evidence 平面（GRN/CLM），不进信包",
      { extra_keys: evidenceExtra },
    );
  }
  const fastGate = evidenceRecord.fast_gate;
  if (
    typeof fastGate !== "string" ||
    !(HANDOFF_FAST_GATE_VALUES as readonly string[]).includes(fastGate)
  ) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.evidence.fast_gate 词表外：${String(fastGate)}（§24 例文 fast_gate: PASS 词形）`,
      `合法词形：${HANDOFF_FAST_GATE_VALUES.join(" | ")}`,
      { fast_gate: String(fastGate) },
    );
  }
  const nextAction = assertNonEmptyString(record.next_action, "next_action");
  return Object.freeze({
    task,
    from,
    to,
    expected_outcome: expectedOutcome,
    intent,
    completed_work: assertStringArray(record.completed_work, "completed_work"),
    remaining_work: assertStringArray(record.remaining_work, "remaining_work"),
    changed_units: assertStringArray(record.changed_units, "changed_units"),
    contracts_changed: assertStringArray(record.contracts_changed, "contracts_changed"),
    authoritative_refs: assertStringArray(record.authoritative_refs, "authoritative_refs"),
    required_policy_refs: assertStringArray(record.required_policy_refs, "required_policy_refs"),
    known_issues: assertStringArray(record.known_issues, "known_issues"),
    known_unknowns: assertStringArray(record.known_unknowns, "known_unknowns"),
    open_questions: assertStringArray(record.open_questions, "open_questions"),
    evidence: Object.freeze({ fast_gate: fastGate as HandoffFastGateValue }),
    write_permissions: assertStringArray(record.write_permissions, "write_permissions"),
    next_action: nextAction,
  });
}

/**
 * 接收方的最小 Context（§24 原则「Agent 出生 → 获取最小 Context」的机器形态；
 * vNext Batch 2 R5 分母同步：内容键 = §9A 十七键剔除路由两键 from/to（归 §25.1
 * Runtime Adapter 的信封职责面）后的**十五内容键**）。closed form 保证 context 分母
 * **恰为**这十五键——不多不少：少一键 = 信包形态非法（validateHandoffPacket 先行
 * 拒绝），多一键 = 无键位可表达（extra key 拒绝）。「获取最小 Context」由此不是纪律
 * 劝告而是结构事实：接收方没有其它合法读入通道。**Handoff 摘要 ≠ Truth**：本 Context
 * 是交接投影，接收方消费前由 Context Compiler 按其重新编译（PRD §9A 逐字纪律）。
 */
export function compileHandoffContext(packet: HandoffPacket): AgentContext {
  return Object.freeze({
    task: packet.task,
    expected_outcome: packet.expected_outcome,
    intent: packet.intent,
    completed_work: packet.completed_work,
    remaining_work: packet.remaining_work,
    changed_units: packet.changed_units,
    contracts_changed: packet.contracts_changed,
    authoritative_refs: packet.authoritative_refs,
    required_policy_refs: packet.required_policy_refs,
    known_issues: packet.known_issues,
    known_unknowns: packet.known_unknowns,
    open_questions: packet.open_questions,
    evidence: packet.evidence,
    write_permissions: packet.write_permissions,
    next_action: packet.next_action,
  });
}
