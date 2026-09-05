/**
 * runtime-adapter.ts —— Runtime Adapter 契约：能力探测 + 四条降级规则 + 伪装并发
 * 封条 + solo 零开销 direct 形态（P21-Contract；PRD §58 / §25.1 / §25.2）。
 *
 * PRD 语义锚：
 * - §58 AgentRuntime interface（spawn/send/wait/cancel + 三探针 supportsParallel /
 *   supportsToolPermissions / supportsContextIsolation——方法名逐字）；
 * - §58 四条降级规则（不支持多 Agent 时）逐条：①降级为 sequential roles；
 *   ②每一 Role 重新编译 Context；③禁止伪装成真正并发；④报告 Capability
 *   Degradation；
 * - §25.1 边界：POMaster Core 定义 Role/State/Handoff/Gate，Runtime Adapter 负责
 *   spawn/concurrency/context isolation/timeout/cancel/tool permission/实际模型
 *   调用——本模块只落契约与判定，**不实现任何真实 runtime**（不建 daemon：PRD
 *   grep "daemon" 0 命中；托管编排是 DEF-SUP 触发制的 P1+ 形态，D 线 §5）；
 * - §25.2 MINIMAL→「Implementer 甚至可由当前 Harness 主 Agent 直接执行」= solo
 *   默认运行形态不变的 PRD 内生依据（D 线 §1.1 SOLO-DIRECT 同源）：direct 形态
 *   零开销锚在本模块——不经探测消费、零 spawn 步、零降级报告；
 * - §24 Handoff Protocol「Agent 出生 → 获取最小 Context」：池形态（sequential/
 *   parallel）的每一步 contextRecompile=true 是结构性要求；sequential 下的
 *   重编译同时是降级规则②的逐条兑现。
 *
 * 伪装并发封条（§58 规则③，MAJOR 级语义，契约层封死）：
 * - 执行形态（mode）**只由三探针的探测结果派生**，永不采信调用方申报（S1
 *   「永不信任自报」同源纪律）；sequential/direct 计划上不存在任何可表达的
 *   「并发」字段位——concurrency_honest 恒 true 是结构封条不是承诺字段；
 * - assertHonestConcurrency 是消费侧检查点：申报 concurrent 而 mode 非
 *   parallel → RUNTIME_CONCURRENCY_MASQUERADE（errors.ts：MAJOR 级语义违例）。
 *
 * 「不支持多 Agent」判定（decisions 裁定，落档 docs/wave3-p20-sec79-backfill-44-8.md
 * P21 注记）：multi-agent capable = supportsParallel **且** supportsContextIsolation
 * （§58 把并发与上下文隔离并列为多 Agent 的两个能力面；tool_permissions 是
 * §25.1 的 Runtime Adapter 职责面而非「多 Agent 性」判据——缺席如实进降级报告
 * rows，但不触发 sequential 回退）。PRD 未给逐字定义，本裁定取两探针合取的最小
 * 保守读法，不发明第三条件。
 *
 * 纯函数纪律：本模块全部导出零 IO、零 store 依赖、零墙钟（同输入重放字节稳定，
 * A4）；词汇闭包走 @pomaster/schemas 十二角色轴（vocab-lock execution_identity_vocab——PR-0009 收编）。
 */
import {
  AGENT_ROLE_POOL_VALUES,
  RUNTIME_CAPABILITY_VALUES,
  RUNTIME_DEGRADATION_RULE_IDS,
  type AgentRolePoolValue,
  type RuntimeCapabilityValue,
  type RuntimeDegradationRuleId,
  type RuntimeExecutionModeValue,
} from "@pomaster/schemas";
import { GovernanceError } from "./errors.js";

/**
 * 伪装并发错误码位（GovernanceErrorCode 同名成员的常量镜像；reason_code 独立
 * 维度不入 vocab 词表——GOLDEN-L3-CASE-C 精神；码位词形已随 PR-0009 登记（vocab-lock execution_identity_vocab.concurrency_masquerade_code））。
 */
export const RUNTIME_CONCURRENCY_MASQUERADE = "RUNTIME_CONCURRENCY_MASQUERADE" as const;

// ============================================================
// §58 interface 契约（类型面；形状最小化——PRD 只给方法名不给字段面，
// 不发明富字段，扩展位留给真实 Runtime Adapter（DEF-RUNTIME-ADAPTER，P1+））
// ============================================================

/** 编译后的最小充分上下文载体（§3.7 Context Projection 消费位；形态归投影面）。 */
export type AgentContext = Readonly<Record<string, unknown>>;

/** Agent 间信包（§58 send(handle, packet)；内容形态归 Handoff Protocol 消费面）。 */
export type AgentPacket = Readonly<Record<string, unknown>>;

/** 工具许可清单（§25.1：tool permission 归 Runtime Adapter 职责；词形由适配器定）。 */
export type AgentPermissions = readonly string[];

/** Agent 句柄（§58 spawn 返回；handleId 由真实适配器铸造，本契约不约束词形）。 */
export interface AgentHandle {
  /** 适配器标识（如 "claude-code"）；契约层不枚举——词轴见 EXECUTION_RUNTIME_VALUES。 */
  readonly runtime: string;
  readonly role: AgentRolePoolValue;
  readonly handleId: string;
}

/** Agent 执行结果（§58 wait 返回；payload 不透明——判卷一律走证据平面，C5）。 */
export interface AgentResult {
  readonly handle: AgentHandle;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * §58 AgentRuntime 契约（方法名逐字；POMaster Core 不实现本接口——它是外部
 * Runtime Adapter 的实现契约。判定面只消费三探针，见 RuntimeCapabilityProbe）。
 */
export interface AgentRuntime {
  spawn(
    role: AgentRolePoolValue,
    context: AgentContext,
    permissions: AgentPermissions,
  ): Promise<AgentHandle>;
  send(handle: AgentHandle, packet: AgentPacket): Promise<void>;
  wait(handle: AgentHandle): Promise<AgentResult>;
  cancel(handle: AgentHandle): Promise<void>;
  supportsParallel(): boolean;
  supportsToolPermissions(): boolean;
  supportsContextIsolation(): boolean;
}

/** 能力探测的最小消费面（只有三探针；判定面不要求 spawn/send/wait/cancel 在场）。 */
export type RuntimeCapabilityProbe = Pick<
  AgentRuntime,
  "supportsParallel" | "supportsToolPermissions" | "supportsContextIsolation"
>;

/** 探测结果（§58 三布尔的结构化快照；探测即调用三方法各一次，零缓存）。 */
export interface RuntimeCapabilities {
  readonly supportsParallel: boolean;
  readonly supportsToolPermissions: boolean;
  readonly supportsContextIsolation: boolean;
}

/**
 * 能力探测（§58「Runtime capability」面）：对任意具备三探针的对象调用各一次，
 * 产出结构化快照。非布尔返回值 → SCHEMA_INVALID（探针契约违例显性暴露——
 * 静默真值化会把「探测不出」洗成「支持」）。
 */
export function probeRuntimeCapabilities(runtime: RuntimeCapabilityProbe): RuntimeCapabilities {
  const raw = {
    supportsParallel: runtime.supportsParallel(),
    supportsToolPermissions: runtime.supportsToolPermissions(),
    supportsContextIsolation: runtime.supportsContextIsolation(),
  };
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "boolean") {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `能力探针 ${key} 返回非布尔（§58 探针契约违例）：${String(value)}`,
        "探针必须返回 boolean；修复 Runtime Adapter 的三探针实现",
        { probe: key, returned: String(value) },
      );
    }
  }
  return raw;
}

/** 「不支持多 Agent」判定的合取面（decisions 裁定，见模块头注）：parallel 且 context isolation。 */
export function isMultiAgentCapable(capabilities: RuntimeCapabilities): boolean {
  return capabilities.supportsParallel && capabilities.supportsContextIsolation;
}

// ============================================================
// 四条降级规则（§58 逐条）与 Capability Degradation 报告
// ============================================================

/** 单能力行的降级规则映射（rule ③ 恒封死，不挂在单一能力上，不进 affected_rules）。 */
const RULES_BY_CAPABILITY: Readonly<
  Record<RuntimeCapabilityValue, readonly RuntimeDegradationRuleId[]>
> = {
  parallel: ["sequential_fallback", "context_recompile_per_role", "capability_degradation_report"],
  context_isolation: [
    "sequential_fallback",
    "context_recompile_per_role",
    "capability_degradation_report",
  ],
  // tool_permissions 是 §25.1 适配器职责面而非「多 Agent 性」判据：缺席如实报告，
  // 不触发 sequential 回退（decisions 裁定，模块头注）。
  tool_permissions: ["capability_degradation_report"],
};

/** 单能力观测行（supported 与 affected_rules 并排——触发与未触发全部显式呈现）。 */
export interface CapabilityDegradationRow {
  readonly capability: RuntimeCapabilityValue;
  readonly supported: boolean;
  readonly affected_rules: readonly RuntimeDegradationRuleId[];
}

/**
 * Capability Degradation 报告（§58 规则④的载体）：三能力逐行呈现 + 四条规则
 * 逐条 applied/not-applied（「四条降级规则逐条落地」的可测形态——规则③恒 true：
 * 契约层封死不是条件行为）。
 */
export interface CapabilityDegradationReport {
  /** 任一能力缺席即 true（缺席显式，C1）。 */
  readonly degraded: boolean;
  readonly multi_agent_capable: boolean;
  readonly capabilities: RuntimeCapabilities;
  readonly rows: readonly CapabilityDegradationRow[];
  readonly rules_applied: Readonly<Record<RuntimeDegradationRuleId, boolean>>;
}

/**
 * 降级判定（纯函数）：对三能力逐行出观测行；四条规则逐条出 applied 位——
 * ①sequential_fallback / ②context_recompile_per_role 在 !multi-agent 时成立；
 * ③no_concurrency_masquerade 恒成立（契约封条）；④capability_degradation_report
 * 在 degraded 时成立（报告本体即兑现）。
 */
export function evaluateCapabilityDegradation(
  capabilities: RuntimeCapabilities,
): CapabilityDegradationReport {
  const supportedByName: Readonly<Record<RuntimeCapabilityValue, boolean>> = {
    parallel: capabilities.supportsParallel,
    tool_permissions: capabilities.supportsToolPermissions,
    context_isolation: capabilities.supportsContextIsolation,
  };
  const rows: CapabilityDegradationRow[] = RUNTIME_CAPABILITY_VALUES.map((capability) => ({
    capability,
    supported: supportedByName[capability],
    affected_rules: supportedByName[capability] ? [] : RULES_BY_CAPABILITY[capability],
  }));
  const multiAgentCapable = isMultiAgentCapable(capabilities);
  const degraded = rows.some((row) => !row.supported);
  // 词轴完备性守卫：rules_applied 四键与 RUNTIME_DEGRADATION_RULE_IDS 逐一对齐
  // （规则集与 §58 词轴漂移 = 实现缺陷，装载期显性暴露而非静默少报）。
  const rulesApplied: Record<RuntimeDegradationRuleId, boolean> = {
    sequential_fallback: !multiAgentCapable,
    context_recompile_per_role: !multiAgentCapable,
    no_concurrency_masquerade: true,
    capability_degradation_report: degraded,
  };
  for (const ruleId of RUNTIME_DEGRADATION_RULE_IDS) {
    if (!(ruleId in rulesApplied)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `rules_applied 缺规则位（与 §58 词轴漂移）：${ruleId}`,
        "rules_applied 必须覆盖 RUNTIME_DEGRADATION_RULE_IDS 全集（四条降级规则逐条落地）",
        { missing_rule: ruleId },
      );
    }
  }
  return {
    degraded,
    multi_agent_capable: multiAgentCapable,
    capabilities,
    rows,
    rules_applied: rulesApplied,
  };
}

// ============================================================
// 角色执行计划（三形态）与伪装并发封条
// ============================================================

/** 角色执行计划输入（roles 词形过 AGENT_ROLE_POOL_VALUES 闭包校验）。 */
export interface RoleExecutionPlanInput {
  readonly capabilities: RuntimeCapabilities;
  readonly roles: readonly string[];
  /**
   * §25.2 MINIMAL solo 形态：主 Harness 直接执行（不经池、零开销）。缺省 false
   * ——走池判定面（探测派生 sequential/parallel）。
   */
  readonly directExecution?: boolean;
}

/** 计划步骤（每角色一步；spawnRequired=false = 调用方逐角色推进，不经 spawn）。 */
export interface RoleExecutionStep {
  readonly role: AgentRolePoolValue;
  /** §24 最小上下文 + §58 规则②（sequential 兑现位）；direct=false（主 Harness 已持上下文）。 */
  readonly contextRecompile: boolean;
  readonly spawnRequired: boolean;
}

/**
 * 角色执行计划。mode 是**派生值**（由探针/形态入参决定，非申报值）——这是规则③
 * 的结构封条：调用方没有任何字段位可以宣称并发。
 */
export interface RoleExecutionPlan {
  readonly mode: RuntimeExecutionModeValue;
  readonly steps: readonly RoleExecutionStep[];
  /** degraded 时必附（§58 规则④）；direct 形态恒 null（零开销——无探测消费）。 */
  readonly degradation: CapabilityDegradationReport | null;
  /** 结构封条（恒 true 字面）：mode 由派生产出，伪装并发在计划结构上不可表达。 */
  readonly concurrency_honest: true;
}

/**
 * 编排角色执行计划（纯函数）：
 * - directExecution=true → mode=direct：每角色 spawnRequired=false /
 *   contextRecompile=false / degradation=null（§25.2 solo 零开销锚——能力面不参与
 *   判定，角色词形仍过闭包校验）；
 * - multi-agent capable → mode=parallel：每角色 spawn=true + 独立上下文（§24）；
 *   degraded 时附降级报告（如仅 tool_permissions 缺席——mode 仍 parallel）；
 * - 其余（不支持多 Agent）→ mode=sequential（规则①）：每角色先重编译上下文再
 *   顺序执行（规则②）、spawnRequired=false（spawn 归 DEF-RUNTIME-ADAPTER P1+
 *   全托管形态）、降级报告必附（规则④）。
 */
export function planRoleExecution(input: RoleExecutionPlanInput): RoleExecutionPlan {
  if (!Array.isArray(input.roles) || input.roles.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "roles 为空（角色执行计划至少一个角色）",
      "从 §25.2 池选图按 Governance Profile 选最少角色集合（MINIMAL → IMPLEMENTER）",
      { roles: input.roles },
    );
  }
  const roles: AgentRolePoolValue[] = input.roles.map((role) => {
    const matched = AGENT_ROLE_POOL_VALUES.find((candidate) => candidate === role);
    if (matched === undefined) {
      throw new GovernanceError(
        "VOCAB_INVALID_VALUE",
        `角色词表外：${role}（PRD §25.3 十二角色轴——vocab-lock execution_identity_vocab.agent_role_pool，PR-0009）`,
        `合法词形：${AGENT_ROLE_POOL_VALUES.join(" | ")}；扩值走词汇表 PR`,
        { role },
      );
    }
    return matched;
  });

  if (input.directExecution === true) {
    return {
      mode: "direct",
      steps: roles.map((role) => ({ role, contextRecompile: false, spawnRequired: false })),
      degradation: null,
      concurrency_honest: true,
    };
  }

  const report = evaluateCapabilityDegradation(input.capabilities);
  if (report.multi_agent_capable) {
    return {
      mode: "parallel",
      steps: roles.map((role) => ({ role, contextRecompile: true, spawnRequired: true })),
      degradation: report.degraded ? report : null,
      concurrency_honest: true,
    };
  }
  // §58 四条降级规则落点：mode 锁 sequential（①）+ 每角色重编译上下文（②）+
  // mode 为派生值不可申报（③，封条见 assertHonestConcurrency）+ 报告必附（④）。
  return {
    mode: "sequential",
    steps: roles.map((role) => ({ role, contextRecompile: true, spawnRequired: false })),
    degradation: report,
    concurrency_honest: true,
  };
}

/**
 * 伪装并发封条（§58 规则③的检查点；消费侧在呈现/上报执行形态前必过）：
 * claimsConcurrency=true 而 plan.mode 非 parallel → RUNTIME_CONCURRENCY_MASQUERADE
 * （MAJOR 级语义违例：「报告并发实为串行」在契约层封死——silent masquerade 比
 * 慢更危险，它伪造隔离与独立 Evidence，§25.2 多 Agent 首要价值由此失真）。
 */
export function assertHonestConcurrency(
  plan: RoleExecutionPlan,
  claimsConcurrency: boolean,
): void {
  if (claimsConcurrency && plan.mode !== "parallel") {
    throw new GovernanceError(
      RUNTIME_CONCURRENCY_MASQUERADE,
      `伪装并发（MAJOR 级语义违例，PRD §58「禁止伪装成真正并发」）：申报 concurrent 但执行计划 mode=${plan.mode}`,
      "按计划 mode 如实上报执行形态（sequential/direct 不得申报 concurrent）；并发只有三探针全过（parallel + context isolation）的派生形态",
      { mode: plan.mode, claims_concurrency: claimsConcurrency },
    );
  }
}
