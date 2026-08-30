/**
 * handoff.ts —— §24 Handoff Protocol 语义落地面：Handoff Packet 形态定义 + 消费面
 * （P21-Enforcement；纯函数零 IO 零墙钟，runtime-adapter.ts 同款纪律）。
 *
 * PRD §24 逐字锚：
 * - 「Agent 之间不得直接继承完整聊天上下文。必须通过 Handoff Packet：」+ yaml 例文
 *   九键（task / from / to / intent / changed_units / contracts_changed /
 *   evidence{fast_gate} / known_issues / open_questions）；
 * - 原则：「Agent 出生 → 获取最小 Context → 完成单一职责 → 输出 Artifact → 结束
 *   上下文」。
 *
 * 形态裁定（decisions，P21-Enforcement，落档 docs/wave3-p20-sec79-backfill-44-8.md）：
 * - **closed form**：§24 用「必须通过 Handoff Packet：」给出唯一 yaml 形态——顶层键
 *   闭包于九键，evidence 子对象闭包于 {fast_gate}。多出的键 = SCHEMA_INVALID。这是
 *   「不得直接继承完整聊天上下文」的结构封条：chat_transcript / thinking_trace /
 *   messages 之类的全量轨迹载体在 closed form 下**没有可表达的键位**（拒绝靠形态
 *   闭合，不靠黑名单枚举——黑名单永远漏）；扩展走词汇表/治理 PR，不在消费面私放。
 * - **fast_gate 词形**：§24 例文 `fast_gate: PASS` 大写词形逐字；FAIL 同族放行
 *   （带 FAIL 证据的交接是合法信号——known_issues 承载原因，PRD 未设禁令）。
 *   其余值（七态 GRN verdict 词形等）不发明——那是 §26 gate 判卷面不是 §24 信包面。
 * - **from/to 词形**：AGENT_ROLE_POOL_VALUES 十二角色闭包（§24 例文 from:
 *   IMPLEMENTER / to: CLEANER 即该轴词形裁定锚之一，schemas vocab.ts P21 段）。
 * - **task 词形**：§24 例文 TASK-0173 是 legacy 词形——canonical（TASK.T0173）与
 *   legacy（TASK-0173）双读，resolveAlias 收编判定（canonical=null 即拒绝）。
 *
 * 消费面（本模块两导出之外的第三拍）：compileHandoffContext 产出接收方的最小
 * Context——七内容键（路由两键 from/to 归 §25.1 Runtime Adapter 的信封职责面），
 * 无任何其它通道；「Agent 出生 → 获取最小 Context」由此成为机器可执行的契约。
 *
 * 命令面关系：`pomaster handoff` 仍显式 deferred（COMMAND_DEFERRED——托管编排执行
 * 面受 DEF-SUP 触发制门槛，D 线 §5）；本模块是其 deferred 下的**契约面**——词形与
 * 判定先行，执行面等触发制（runtime-adapter.ts「契约与执行分层」同构）。
 *
 * 已知边界（P21 红队 MINOR，如实登记不发明新契约）：closed form 是**键位级**结构
 * 封条而非内容级——chat_transcript 等专用轨迹键被形态闭合拒绝，但 intent /
 * known_issues / open_questions 等自由文本键是无上界字符串载体，理论上可夹带大段
 * 上下文文本。PRD §24 无尺寸条款，本模块不发明字节上限；内容级审查属接收方
 * Context Compiler 的职责面（与 symlink 判卷边界同款取舍：契约无出处不私加，
 * 登记待 PRD/治理侧裁定后收紧）。
 */
import { GovernanceError } from "./errors.js";
import { resolveAlias } from "./id.js";
import { AGENT_ROLE_POOL_VALUES, type AgentRolePoolValue } from "./vocab.js";
import type { AgentContext } from "./runtime-adapter.js";

/** §24 例文 `fast_gate: PASS` 词形闭包（大写逐字；FAIL 同族放行——见模块头注裁定）。
 * TODO(vocab-pr)：局部词轴 pending_vocab_pr——收编与否随词汇表 PR 裁定（SUPERVISOR_TRIGGER_OBSERVED 同批先例）。 */
export const HANDOFF_FAST_GATE_VALUES = ["PASS", "FAIL"] as const;
export type HandoffFastGateValue = (typeof HANDOFF_FAST_GATE_VALUES)[number];

/** §24 yaml 顶层九键（closed form 分母；顺序=例文键序）。 */
export const HANDOFF_PACKET_KEYS = [
  "task",
  "from",
  "to",
  "intent",
  "changed_units",
  "contracts_changed",
  "evidence",
  "known_issues",
  "open_questions",
] as const;
export type HandoffPacketKey = (typeof HANDOFF_PACKET_KEYS)[number];

/** evidence 子对象（closed：唯 fast_gate 一键）。 */
export interface HandoffPacketEvidence {
  readonly fast_gate: HandoffFastGateValue;
}

/**
 * Handoff Packet（§24 yaml 例文的 TypeScript 形态镜像；键序一致）。不可变——
 * 信包一经验证即冻结形态，消费面不得增删键（「必须通过 Handoff Packet」的唯一性）。
 */
export interface HandoffPacket {
  /** 任务锚（§24 例文 TASK-0173 legacy 词形；canonical/legacy 双读，见头注裁定）。 */
  readonly task: string;
  readonly from: AgentRolePoolValue;
  readonly to: AgentRolePoolValue;
  /** 单一职责的意图陈述（非空；「完成单一职责」的申报位）。 */
  readonly intent: string;
  readonly changed_units: readonly string[];
  readonly contracts_changed: readonly string[];
  readonly evidence: HandoffPacketEvidence;
  readonly known_issues: readonly string[];
  readonly open_questions: readonly string[];
}

/** 词表闭包判定（runtime-adapter.ts planRoleExecution 同法）。 */
function assertRole(value: unknown, field: "from" | "to"): AgentRolePoolValue {
  if (typeof value !== "string") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.${field} 缺失或非字符串（§24 yaml 例文词形，如 from: IMPLEMENTER）`,
      `补 ${field} 键（十二角色词形）；词形闭包 ${AGENT_ROLE_POOL_VALUES.join(" | ")}`,
      { field },
    );
  }
  const matched = AGENT_ROLE_POOL_VALUES.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `Handoff Packet.${field} 角色词表外：${value}（PRD §25.3 十二角色轴，pending_vocab_pr）`,
      `合法词形：${AGENT_ROLE_POOL_VALUES.join(" | ")}；扩值走词汇表 PR`,
      { field, role: value },
    );
  }
  return matched;
}

/** 非空字符串数组判定（显式缺席 → SCHEMA_INVALID，不静默当空——C1）。 */
function assertStringArray(value: unknown, field: HandoffPacketKey): readonly string[] {
  if (!Array.isArray(value)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.${field} 缺失或非数组（§24 yaml 例文九键之一）`,
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
 * 验证并冻结一个 Handoff Packet（§24 MUST 的判卷点）。closed form：顶层键超出
 * 九键 / evidence 内超出 fast_gate 一键 → SCHEMA_INVALID——这是「不得直接继承
 * 完整聊天上下文」的结构封条（chat_transcript 之类轨迹载体无键位可表达）。
 */
export function validateHandoffPacket(input: unknown): HandoffPacket {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "Handoff Packet 须为 JSON 对象（§24 yaml 例文形态）",
      "按 §24 九键形态构造：task/from/to/intent/changed_units/contracts_changed/evidence/known_issues/open_questions",
      {},
    );
  }
  const record = input as Record<string, unknown>;
  const extra = Object.keys(record).filter((key) => !(HANDOFF_PACKET_KEYS as readonly string[]).includes(key));
  if (extra.length > 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet 键超闭包（§24「必须通过 Handoff Packet」给出唯一 yaml 形态；closed form 拒绝额外键位——完整聊天上下文等轨迹载体因此无键可表达）：${extra.join(", ")}`,
      `合法键闭包：${HANDOFF_PACKET_KEYS.join(" / ")}；扩展走治理 PR（不在消费面私放键位）`,
      { extra_keys: extra },
    );
  }
  const task = record.task;
  if (typeof task !== "string" || task.trim().length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.task 缺失或非法（§24 例文 task: TASK-0173）`,
      "补 task 键（governed id：canonical TASK.T0173 或 legacy TASK-0173 双读）",
      { task },
    );
  }
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
  const intent = record.intent;
  if (typeof intent !== "string" || intent.trim().length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "Handoff Packet.intent 缺失或空（§24 例文 intent: custom_formula_validation）",
      "补 intent（本段交接的单一职责意图；「完成单一职责」的申报位）",
      {},
    );
  }
  const evidence = record.evidence;
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "Handoff Packet.evidence 缺失或非对象（§24 例文 evidence: {fast_gate: PASS}）",
      "补 evidence 对象（closed form：唯 fast_gate 一键）",
      {},
    );
  }
  const evidenceRecord = evidence as Record<string, unknown>;
  const evidenceExtra = Object.keys(evidenceRecord).filter((key) => key !== "fast_gate");
  if (evidenceExtra.length > 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `Handoff Packet.evidence 键超闭包（closed form：唯 fast_gate）：${evidenceExtra.join(", ")}`,
      "evidence 只呈现 §24 例文的 fast_gate 位；其它证据走 evidence 平面（GRN/CLM），不进信包",
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
  return Object.freeze({
    task,
    from,
    to,
    intent,
    changed_units: assertStringArray(record.changed_units, "changed_units"),
    contracts_changed: assertStringArray(record.contracts_changed, "contracts_changed"),
    evidence: Object.freeze({ fast_gate: fastGate as HandoffFastGateValue }),
    known_issues: assertStringArray(record.known_issues, "known_issues"),
    open_questions: assertStringArray(record.open_questions, "open_questions"),
  });
}

/**
 * 接收方的最小 Context（§24 原则「Agent 出生 → 获取最小 Context」的机器形态）：
 * 七内容键 = 信包剔除路由两键（from/to 归 §25.1 Runtime Adapter 的信封职责面）。
 * closed form 保证 context 分母**恰为**这七键——不多不少：少一键 = 信包形态非法
 * （validateHandoffPacket 先行拒绝），多一键 = 无键位可表达（extra key 拒绝）。
 * 「获取最小 Context」由此不是纪律劝告而是结构事实：接收方没有其它合法读入通道。
 */
export function compileHandoffContext(packet: HandoffPacket): AgentContext {
  return Object.freeze({
    task: packet.task,
    intent: packet.intent,
    changed_units: packet.changed_units,
    contracts_changed: packet.contracts_changed,
    evidence: packet.evidence,
    known_issues: packet.known_issues,
    open_questions: packet.open_questions,
  });
}
