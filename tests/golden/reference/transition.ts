/**
 * transition.ts —— lifecycle 转移校验「参考镜像」（数据驱动 Golden 执行器用）。
 *
 * 词表纪律：本文件不持有任何词值——一切枚举/矩阵 import 自 @pomaster/schemas/src/vocab.ts
 * （FROZEN vocab-lock@v0.2-resolved 的代码唯一镜像点）。
 * 定位：@pomaster/kernel 的 validateTransition 目前是 scaffold 占位（throw "not-implemented"）。
 * Golden 执行器先尝试委托 kernel，未实现时回落本参考镜像（report 记录 evaluator=reference）；
 * kernel 落地后 golden 自动变成 kernel 契约测试。本镜像与 kernel 契约（docs/kernel-api.md
 * TransitionOutcome 形态）逐字段对齐。
 *
 * 语义来源：vocab-lock state_axes.lifecycle.transitions ——
 * - PROPOSED→{CURRENT,REJECTED} requires: authority_approval；
 * - CURRENT→{SUPERSEDED,DEPRECATED} requires: transition_record；
 * - SUPERSEDED 终态（to:[]，successor_ref 必填）；RETIRED/REJECTED 终态；
 * - DEPRECATED→RETIRED 附加 grace_policy: config（宽限期策略键待词表登记 → TODO(vocab-pr)）。
 * 跨轴耦合断言（VERIFIED⇒wired、MIGRATING⇒ACTIVE PERMIT、LOCKED 挑战⇒决策引用）归
 * applyTransaction/REF_INTEGRITY，不进本纯函数（kernel 契约明示）。
 */
import {
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_VALUES,
  type LifecycleValue,
} from "@pomaster/schemas";

/** 与 kernel TransitionRequirement 词形一致（x-vocab-source: vocab-lock transitions.requires）。 */
export type TransitionRequirement = "authority_approval" | "transition_record";

/** 与 kernel TransitionOutcome 同构的镜像形态（不 import kernel 类型，保持测试侧零实现耦合）。 */
export interface TransitionOutcomeLike {
  readonly allowed: boolean;
  readonly requires?: readonly TransitionRequirement[];
  readonly gracePolicyConfig?: boolean;
  readonly notes?: readonly string[];
  readonly reason?: "unknown_from_state" | "unknown_to_state" | "transition_not_in_matrix";
  readonly hint?: string;
}

/** from 状态层的迁移前置（vocab-lock transitions.requires 逐块镜像）。 */
const REQUIRES_BY_FROM: Partial<Record<LifecycleValue, readonly TransitionRequirement[]>> = {
  PROPOSED: ["authority_approval"],
  CURRENT: ["transition_record"],
};

/** 终态/越矩阵时的 escalation 路标（报错必须带去哪修——escalation 纪律）。 */
const DENY_HINTS: Partial<Record<LifecycleValue, string>> = {
  SUPERSEDED:
    "SUPERSEDED 为终态（to:[]，successor_ref 必填）；撤销 supersede 已裁死（vocab-lock 开放问题#1，lock 胜出）——如需替代关系请新建对象并引用旧 id",
  RETIRED: "RETIRED 为终态（to:[]）；历史考古走 alias 双向链与键绑定表",
  REJECTED: "REJECTED 为终态（to:[]）；重新立项请新建对象",
};

function isLifecycleValue(v: string): v is LifecycleValue {
  return (LIFECYCLE_VALUES as readonly string[]).includes(v);
}

/** 参考镜像：与 LIFECYCLE_TRANSITIONS 拓扑逐条对齐的纯函数。 */
export function validateTransitionReference(
  from: string,
  to: string,
): TransitionOutcomeLike {
  if (!isLifecycleValue(from)) {
    return {
      allowed: false,
      reason: "unknown_from_state",
      hint: `from=${from} 不在 lifecycle 六值词表（vocab-lock state_axes.lifecycle.values）`,
    };
  }
  if (!isLifecycleValue(to)) {
    return {
      allowed: false,
      reason: "unknown_to_state",
      hint: `to=${to} 不在 lifecycle 六值词表（vocab-lock state_axes.lifecycle.values）`,
    };
  }
  const targets: readonly string[] = LIFECYCLE_TRANSITIONS[from];
  if (!targets.includes(to)) {
    return {
      allowed: false,
      reason: "transition_not_in_matrix",
      hint:
        DENY_HINTS[from] ??
        `lifecycle 矩阵无 ${from}→${to}（vocab-lock state_axes.lifecycle.transitions）`,
    };
  }
  if (from === "DEPRECATED" && to === "RETIRED") {
    return {
      allowed: true,
      requires: [],
      gracePolicyConfig: true,
      notes: ["grace_policy: config（宽限期策略键待词表登记 → TODO(vocab-pr)）"],
    };
  }
  const notes: string[] = [];
  if (from === "CURRENT" && to === "SUPERSEDED") {
    notes.push("SUPERSEDED 终态：successor_ref 必填（vocab-lock transitions）");
  }
  return {
    allowed: true,
    requires: REQUIRES_BY_FROM[from] ?? [],
    gracePolicyConfig: false,
    notes,
  };
}
