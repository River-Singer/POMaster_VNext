/**
 * transitions.ts —— lifecycle 转移引擎（纯函数）。
 *
 * 拓扑唯一来源：LIFECYCLE_TRANSITIONS（@pomaster/schemas，逐值镜像
 * vocab-lock@v0.1-resolved state_axes.lifecycle.transitions，FROZEN）。
 * requires/grace_policy 映射同样逐字镜像该块：
 * - PROPOSED→{CURRENT, REJECTED} requires: authority_approval
 * - CURRENT→{SUPERSEDED, DEPRECATED} requires: transition_record
 * - SUPERSEDED/RETIRED/REJECTED 终态（SUPERSEDED ⇒ successor_ref 必填，归 store 层强制）
 * - DEPRECATED→RETIRED 附加 grace_policy: config（宽限期策略键待词表登记 → TODO(vocab-pr)）
 *
 * 跨轴耦合断言（lifecycle∈{PROPOSED,REJECTED}⇒evidence=PLANNED、evidence=VERIFIED⇒
 * realization=wired、change=MIGRATING 必持 ACTIVE PERMIT、LOCKED+STABLE→CHALLENGED
 * 必持 DECISION/CHANGE 引用）归 applyTransaction/REF_INTEGRITY，不在本纯函数内。
 * 其余轴（confidence/evidence/change）v0.1 无矩阵——扩轴走词汇表 PR 后再扩签名
 * → TODO(vocab-pr)。
 */
import { GovernanceError } from "./errors.js";
import type { TransitionOutcome, TransitionRequirement } from "./index.js";
import { LIFECYCLE_TRANSITIONS, LIFECYCLE_VALUES, type LifecycleValue } from "./vocab.js";

/** 迁移前置条件映射（key = "FROM>TO"；逐字镜像 vocab-lock transitions.requires）。 */
const REQUIREMENTS: Readonly<Record<string, readonly TransitionRequirement[]>> = {
  "PROPOSED>CURRENT": ["authority_approval"],
  "PROPOSED>REJECTED": ["authority_approval"],
  "CURRENT>SUPERSEDED": ["transition_record"],
  "CURRENT>DEPRECATED": ["transition_record"],
  "DEPRECATED>RETIRED": [],
};

/** grace_policy: config 的边（vocab-lock：DEPRECATED→RETIRED；宽限期策略键 → TODO(vocab-pr)）。 */
const GRACE_POLICY_CONFIG_EDGES: ReadonlySet<string> = new Set([
  "DEPRECATED>RETIRED",
]);

/**
 * 状态轴转移校验（纯函数）。非法迁移不 throw——返回 allowed:false 的显式 outcome
 * （reason + hint 路标）；词表外 axis → FATAL（词表纪律）。
 */
export function validateTransition(
  axis: "lifecycle",
  from: LifecycleValue,
  to: LifecycleValue,
): TransitionOutcome {
  if (axis !== "lifecycle") {
    // 签名当前仅收 lifecycle；其余轴 v0.1 无矩阵（TODO(vocab-pr) 后扩签名）。
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `transition axis "${String(axis)}" 无转移矩阵`,
      "vocab-lock v0.1 仅有 lifecycle 轴转移矩阵；confidence/evidence/change 扩轴须走词汇表 PR 后再扩本签名",
      { axis },
    );
  }
  const fromKnown = LIFECYCLE_VALUES.includes(from);
  if (!fromKnown) {
    return {
      allowed: false,
      reason: "unknown_from_state",
      hint: `from "${String(from)}" 不在 LIFECYCLE_VALUES（${LIFECYCLE_VALUES.join("/")}）；词表外值须先走词汇表 PR`,
    };
  }
  const toKnown = LIFECYCLE_VALUES.includes(to);
  if (!toKnown) {
    return {
      allowed: false,
      reason: "unknown_to_state",
      hint: `to "${String(to)}" 不在 LIFECYCLE_VALUES（${LIFECYCLE_VALUES.join("/")}）；词表外值须先走词汇表 PR`,
    };
  }
  const targets = LIFECYCLE_TRANSITIONS[from] as readonly LifecycleValue[];
  if (!targets.includes(to)) {
    return {
      allowed: false,
      reason: "transition_not_in_matrix",
      hint:
        targets.length === 0
          ? `${from} 为终态（vocab-lock transitions: to: []）；SUPERSEDED 的唯一再生方式是新建对象并引用旧 id（开放问题#2 裁定，撤销 supersede 支线已封死）`
          : `${from} 的合法目标仅 ${targets.join("/")}（vocab-lock transitions FROZEN）`,
    };
  }
  const edge = `${from}>${to}`;
  const notes: string[] = [];
  if (to === "SUPERSEDED") {
    notes.push("SUPERSEDED 为终态且 successor_ref 必填（vocab-lock transitions 注记）");
  }
  if (to === "DEPRECATED") {
    notes.push("DEPRECATED=无后继不再推荐，可过渡 RETIRED（与 SUPERSEDED 的边界=有无 successor_ref，机器可自动归类）");
  }
  if (to === "RETIRED" || to === "REJECTED") {
    notes.push("终态：vocab-lock transitions to: []");
  }
  return {
    allowed: true,
    requires: REQUIREMENTS[edge] ?? [],
    gracePolicyConfig: GRACE_POLICY_CONFIG_EDGES.has(edge),
    notes,
  };
}
