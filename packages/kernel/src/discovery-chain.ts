/**
 * discovery-chain.ts —— Discovery 状态链转移引擎（纯函数，P18）。
 *
 * 拓扑唯一来源：DISCOVERY_CHAIN_TRANSITIONS（@pomaster/schemas，逐值镜像
 * 08-discovery-state-chain x-pomaster-transition-matrix；PRD §80.3 状态链原文词形：
 * IDEA → DISCOVERY → READY_TO_PROMOTE → CHANGE/TASK）。
 * Discovery 状态链是**新状态面**（Discovery 讨论生命周期），与既有对象轴
 * state_axes.lifecycle（PROPOSED/CURRENT/…，FROZEN）正交，值域不相交、禁止互转互填；
 * 词轴已随 PR-0009 入锁（vocab-lock discovery_vocab.discovery_chain，镜像点 schemas/vocab.ts）。
 *
 * requires 映射逐字镜像 08 x-pomaster-transition-requirements：
 * - IDEA>DISCOVERY / DISCOVERY>READY_TO_PROMOTE 无前置；
 * - READY_TO_PROMOTE>CHANGE 与 READY_TO_PROMOTE>TASK requires: promotion_basis
 *   （PRD §80.3 四条晋升条件任一满足；依据词形见 DISCOVERY_PROMOTION_BASIS_VALUES）。
 * CHANGE/TASK 是本链终态（to: []）。
 *
 * 写入纪律：Discovery 的提升（promote）必须走 P11 maintain 面（受控写入唯一面）——
 * 本模块是纯判定原语，不落盘、不写入、不私造第二写入通道；promote 边 outcome.notes
 * 携带同一路标。非法迁移不 throw——返回 allowed:false 的显式 outcome（reason + hint
 * 路标，fail-closed：非法跳步/倒退一律显式拒绝，禁止静默放行）。
 */
import {
  DISCOVERY_CHAIN_TRANSITIONS,
  DISCOVERY_CHAIN_VALUES,
  type DiscoveryChainValue,
} from "./vocab.js";

/** 迁移前置条件词形（x-vocab-source: 08 definitions.promotion_basis；收编前词形以 08 为准）。 */
export type DiscoveryChainRequirement = "promotion_basis";

/** Discovery 状态链转移校验结果（显式四边缘：allowed/reason 与 lifecycle 引擎同构，词形集独立）。 */
export type DiscoveryChainOutcome =
  | {
      readonly allowed: true;
      readonly requires: readonly DiscoveryChainRequirement[];
      /** true = 提升边（READY_TO_PROMOTE→CHANGE/TASK）：写入必须走 P11 maintain 面。 */
      readonly promoteEdge: boolean;
      readonly notes: readonly string[];
    }
  | {
      readonly allowed: false;
      readonly reason:
        | "unknown_from_state"
        | "unknown_to_state"
        | "transition_not_in_matrix";
      /** 报错必须带的路标（escalation 纪律：不说去哪修的报错是缺陷）。 */
      readonly hint: string;
    };

/**
 * Discovery 状态链转移校验（纯函数）。
 * - 词表外 from/to → allowed:false（unknown_from_state/unknown_to_state + hint）；
 * - 矩阵外（含全部跳步/倒退/自环）→ allowed:false（transition_not_in_matrix + hint）；
 * - promote 边 → requires ["promotion_basis"]，notes 携带晋升条件与 P11 maintain 面路标。
 */
export function validateDiscoveryTransition(
  from: DiscoveryChainValue,
  to: DiscoveryChainValue,
): DiscoveryChainOutcome {
  const fromKnown = DISCOVERY_CHAIN_VALUES.includes(from);
  if (!fromKnown) {
    return {
      allowed: false,
      reason: "unknown_from_state",
      hint: `from "${String(from)}" 不在 DISCOVERY_CHAIN_VALUES（${DISCOVERY_CHAIN_VALUES.join("/")}）；Discovery 状态链词形以 08-discovery-state-chain 为准（PRD §80.3），词表外值须先走词汇表 PR`,
    };
  }
  const toKnown = DISCOVERY_CHAIN_VALUES.includes(to);
  if (!toKnown) {
    return {
      allowed: false,
      reason: "unknown_to_state",
      hint: `to "${String(to)}" 不在 DISCOVERY_CHAIN_VALUES（${DISCOVERY_CHAIN_VALUES.join("/")}）；Discovery 状态链词形以 08-discovery-state-chain 为准（PRD §80.3），词表外值须先走词汇表 PR`,
    };
  }
  const targets = DISCOVERY_CHAIN_TRANSITIONS[from] as readonly DiscoveryChainValue[];
  if (!targets.includes(to)) {
    return {
      allowed: false,
      reason: "transition_not_in_matrix",
      hint:
        targets.length === 0
          ? `${from} 为本链终态（08 x-pomaster-transition-matrix: to: []）；产物已晋升为正式载体（promoted_ref），后续状态归 CHANGE/TASK 自身的治理面管，不再经 Discovery 状态链`
          : `${from} 的合法目标仅 ${targets.join("/")}（08 x-pomaster-transition-matrix；PRD §80.3 状态链 IDEA→DISCOVERY→READY_TO_PROMOTE→CHANGE/TASK）——跳步与倒退一律不在矩阵`,
    };
  }
  const promoteEdge = from === "READY_TO_PROMOTE" && (to === "CHANGE" || to === "TASK");
  const notes: string[] = [];
  if (promoteEdge) {
    notes.push(
      "提升边：PRD §80.3 四条晋升条件（用户明确要求推进开发 / MSD 已达成 / 需要正式 Research/Architecture/Governance 资源 / 需要跨 Session 持续追踪）任一满足，promotion_basis 记录所据条件",
    );
    notes.push(
      "提升写入必须走 P11 maintain 面（受控写入唯一面）——Discovery 层不私造第二写入通道",
    );
  }
  if (from === "IDEA" && to === "DISCOVERY") {
    notes.push(
      "Ephemeral 纪律（PRD §80.3）：IDEA/DISCOVERY 是合法驻留态，普通讨论保存在 .pomaster/discovery/scratchpads/<id>/，不复制「Brainstorm Step 0 永远创建 Task」的假设",
    );
  }
  return {
    allowed: true,
    requires: promoteEdge ? ["promotion_basis"] : [],
    promoteEdge,
    notes,
  };
}
