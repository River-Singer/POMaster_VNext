/**
 * question-gate.ts —— Question Gate Q1-Q7 判卷 + One-question-at-a-time +
 * Diverge→Converge 分区判卷（纯函数，P18）。
 *
 * PRD 出处（v0.4 逐字锚）：
 * - §80.4 Question Gate：Brainstorm 提问前必须依次检查七关（Q1 Current Truth 能回答？
 *   …Q7 不回答是否真的阻塞当前 Increment？）；只有最后仍为「需要人类裁决」时才能
 *   ASK HUMAN。问题分类五词形（BLOCKING_AUTHORITY/PREFERENCE/DERIVABLE/RESEARCHABLE/
 *   DEFERABLE）；只能主动问 BLOCKING_AUTHORITY / PREFERENCE。
 * - §80.5 One-question-at-a-time：一次只处理一个当前价值最高的问题（优先级五条：
 *   1 当前 Scope 边界 … 5 Acceptance Evidence）；禁止一次性抛出十几个问题。
 * - §80.7 Diverge → Converge：输出必须明确分区 current_increment/future_considerations/
 *   out_of_scope（原文 yaml 三键）；future_considerations 不得自动进入当前实现范围。
 *
 * 纪律：
 * - 七关 answerable 判定是调用方提供的上游检查结果（本模块是判卷器不是检索器）；
 *   判卷以七关重算为准（C5），申报分类只做一致性对账，不替代重算。
 * - 优先级用机械序号 1-5（PRD 原文是五条描述句非命名词形——序号化不发明词形，
 *   原文逐条挂 QUESTION_PRIORITY_DESCRIPTIONS 注记）。
 * - fail-closed：矛盾申报（七关显示可答却申报需人裁决、反之）显式拒绝不静默归一；
 *   缺区/跨区重复显式列出；空队列显式 NONE。零写入、零墙钟（A4）。
 */

// ============================================================
// §80.4 Question Gate
// ============================================================

/** 问题分类五词形（PRD §80.4 逐字；词轴待词汇表 PR 收编 TODO(vocab-pr)）。 */
export const QUESTION_GATE_CATEGORIES = [
  "BLOCKING_AUTHORITY",
  "PREFERENCE",
  "DERIVABLE",
  "RESEARCHABLE",
  "DEFERABLE",
] as const;
export type QuestionGateCategory = (typeof QUESTION_GATE_CATEGORIES)[number];

/** 只能主动问的两类（PRD §80.4「只能主动问」逐字）。 */
export const ASKABLE_CATEGORIES = ["BLOCKING_AUTHORITY", "PREFERENCE"] as const;
export type AskableCategory = Extract<
  QuestionGateCategory,
  (typeof ASKABLE_CATEGORIES)[number]
>;

/** 七关 id（原文行序 Q1..Q7）与原文问句逐字。 */
export const QUESTION_GATES = [
  { gate: "Q1", prd: "Current Truth 能回答？" },
  { gate: "Q2", prd: "Existing Docs/BP/Prototype 能回答？" },
  { gate: "Q3", prd: "Repo/Code/OpenAPI 能回答？" },
  { gate: "Q4", prd: "Existing Evidence 能回答？" },
  { gate: "Q5", prd: "Knowledge 能提供低风险默认/诊断？" },
  { gate: "Q6", prd: "Research 能回答？" },
  { gate: "Q7", prd: "不回答是否真的阻塞当前 Increment？" },
] as const;
export type QuestionGateId = (typeof QUESTION_GATES)[number]["gate"];

/** 七关的「上游来源能回答」判定输入（Q7 语义相反：true = 真的阻塞当前 Increment）。 */
export interface QuestionGateAnswerable {
  readonly q1_current_truth: boolean;
  readonly q2_existing_docs: boolean;
  readonly q3_repo_code: boolean;
  readonly q4_existing_evidence: boolean;
  readonly q5_knowledge_default: boolean;
  readonly q6_research: boolean;
  readonly q7_blocking_increment: boolean;
}

export interface QuestionGateInput {
  readonly category: QuestionGateCategory;
  readonly answerable: QuestionGateAnswerable;
}

/** 七关重算处置词形。ASK_REJECTED = 七关全过但申报分类非可问类（矛盾，禁 ASK）。 */
export type QuestionVerdict =
  | "ASK_HUMAN"
  | "ASK_REJECTED"
  | "DERIVABLE"
  | "RESEARCHABLE"
  | "DEFERABLE";

export type QuestionGateOutcome =
  | {
      readonly mayAskHuman: true;
      readonly verdict: "ASK_HUMAN";
      readonly declaredCategory: AskableCategory;
      /** 挡下问题的关卡；ASK_HUMAN = 七关全过 = null。 */
      readonly stoppedAtGate: null;
      readonly declaredConsistent: true;
      readonly notes: readonly string[];
    }
  | {
      readonly mayAskHuman: false;
      readonly verdict: "DERIVABLE" | "RESEARCHABLE" | "DEFERABLE";
      readonly declaredCategory: QuestionGateCategory;
      readonly stoppedAtGate: QuestionGateId;
      readonly declaredConsistent: boolean;
      readonly reason: string;
      readonly hint: string;
    }
  | {
      readonly mayAskHuman: false;
      readonly verdict: "ASK_REJECTED";
      readonly declaredCategory: QuestionGateCategory;
      readonly stoppedAtGate: null;
      readonly declaredConsistent: false;
      readonly reason: "category_not_askable";
      readonly hint: string;
    };

/** Q1..Q6 的 answerable 键序（判卷顺序 = PRD 原文行序，不得跳关）。 */
const GATE_ORDER: readonly {
  readonly gate: QuestionGateId;
  readonly key: keyof Omit<QuestionGateAnswerable, "q7_blocking_increment">;
  readonly verdict: "DERIVABLE" | "RESEARCHABLE";
}[] = [
  { gate: "Q1", key: "q1_current_truth", verdict: "DERIVABLE" },
  { gate: "Q2", key: "q2_existing_docs", verdict: "DERIVABLE" },
  { gate: "Q3", key: "q3_repo_code", verdict: "DERIVABLE" },
  { gate: "Q4", key: "q4_existing_evidence", verdict: "DERIVABLE" },
  { gate: "Q5", key: "q5_knowledge_default", verdict: "DERIVABLE" },
  { gate: "Q6", key: "q6_research", verdict: "RESEARCHABLE" },
];

/**
 * Question Gate 判卷（纯函数，§80.4）。
 * 依次检查 Q1→Q7（原文行序，不跳关）：首个「上游能回答」的关卡决定处置——
 * Q1-Q5 → DERIVABLE（Q5 命中即走 Knowledge 低风险默认，仍是 DERIVABLE 类处置）；
 * Q6 → RESEARCHABLE（Research-first §80.6：技术问题不要求业务人员凭空回答）；
 * Q7 不阻塞 → DEFERABLE。七关全过且申报分类 ∈ ASKABLE → ASK_HUMAN；
 * 七关全过但申报分类 ∉ ASKABLE → ASK_REJECTED（矛盾显式拒绝，绝不静默放行）。
 * declaredConsistent = 申报分类与七关重算处置一致（对账信号，不替代重算）。
 */
export function evaluateQuestionGate(input: QuestionGateInput): QuestionGateOutcome {
  for (const step of GATE_ORDER) {
    if (input.answerable[step.key]) {
      const consistent = input.category === step.verdict;
      return {
        mayAskHuman: false,
        verdict: step.verdict,
        declaredCategory: input.category,
        stoppedAtGate: step.gate,
        declaredConsistent: consistent,
        reason: `${step.gate} 命中：${QUESTION_GATES.find((g) => g.gate === step.gate)?.prd ?? ""}（上游来源已能回答，禁止 ASK HUMAN——§80.4 依次检查）`,
        hint:
          step.verdict === "RESEARCHABLE"
            ? "走 Research-first（§80.6）：pomaster research <topic> → Evidence Pack → 2~3 个有证据选项；人类只裁 Preference/Authority 部分。"
            : "先消化上游来源（Current Truth/Docs/Repo/Evidence/Knowledge 低风险默认），消化后仍无解再重跑 Question Gate。",
      };
    }
  }
  if (!input.answerable.q7_blocking_increment) {
    const consistent = input.category === "DEFERABLE";
    return {
      mayAskHuman: false,
      verdict: "DEFERABLE",
      declaredCategory: input.category,
      stoppedAtGate: "Q7",
      declaredConsistent: consistent,
      reason: "Q7 判定：不回答并不真的阻塞当前 Increment（§82.1：不完整是合法状态，不完整不等于阻塞）",
      hint: "登记为 DEFERRED_DECISION/FUTURE_CONSIDERATION（09 msd-uncertainty unknowns 十分类），不进当前 Increment。",
    };
  }
  if (input.category !== "BLOCKING_AUTHORITY" && input.category !== "PREFERENCE") {
    return {
      mayAskHuman: false,
      verdict: "ASK_REJECTED",
      declaredCategory: input.category,
      stoppedAtGate: null,
      declaredConsistent: false,
      reason: "category_not_askable",
      hint: `七关全过（确无上游来源可答且真阻塞），但申报分类 ${input.category} 不在可问类（§80.4 只能主动问 ${ASKABLE_CATEGORIES.join("/")}）——按问题真实性质改报 BLOCKING_AUTHORITY/PREFERENCE，或修正七关判定后再判`,
    };
  }
  return {
    mayAskHuman: true,
    verdict: "ASK_HUMAN",
    declaredCategory: input.category,
    stoppedAtGate: null,
    declaredConsistent: true,
    notes: [
      "七关全过：Current Truth/Docs/Repo/Evidence/Knowledge/Research 均无法回答，且不回答真的阻塞当前 Increment",
      "ASK HUMAN 前先跑 One-question-at-a-time（§80.5）：一次只问当前价值最高的一个问题，禁止一次性抛十几个问题",
    ],
  };
}

// ============================================================
// §80.5 One-question-at-a-time
// ============================================================

/** 优先级机械序号（1 最高）。PRD §80.5 原文是五条描述句——序号化不发明词形。 */
export type QuestionPriority = 1 | 2 | 3 | 4 | 5;

/** 五条优先级的 PRD 原文描述（下标 = 序号-1，逐字）。 */
export const QUESTION_PRIORITY_DESCRIPTIONS: readonly string[] = [
  "当前 Scope 边界",
  "不可逆/高风险 Business Authority",
  "Multiple-valid-options 的偏好",
  "当前 Increment 必须定义的失败行为",
  "Acceptance Evidence",
];

/** 待问问题（必须已过 Question Gate 且 verdict=ASK_HUMAN——本函数不重跑七关，分层判定）。 */
export interface PrioritizedQuestion {
  readonly questionId: string;
  readonly priority: QuestionPriority;
  /** 已过闸凭证：evaluateQuestionGate 的 ASK_HUMAN outcome（调用方随队传递，防绕闸）。 */
  readonly gateVerdict: "ASK_HUMAN";
}

export type OneQuestionOutcome =
  | { readonly ok: true; readonly next: PrioritizedQuestion; readonly remaining: number; readonly rationale: string }
  | { readonly ok: true; readonly next: null; readonly remaining: 0; readonly rationale: string }
  | { readonly ok: false; readonly reason: "queue_contains_not_askable" | "priority_out_of_range"; readonly hint: string; readonly offenderId: string };

/**
 * One-question-at-a-time 选择器（纯函数，§80.5）：一次只返回当前价值最高的一个问题。
 * 排序：priority 升序（1 最高）；同优先级保持输入顺序（稳定，零墙钟 A4）。
 * fail-closed：队列中混入未过闸问题（gateVerdict !== "ASK_HUMAN"）或优先级词形外值
 * → 显式拒绝整批（不静默丢弃——「禁止一次性抛十几个问题」包含禁止静默吞问题）。
 */
export function selectNextQuestion(
  queue: readonly PrioritizedQuestion[],
): OneQuestionOutcome {
  const legalPriorities: readonly number[] = [1, 2, 3, 4, 5];
  for (const q of queue) {
    if (q.gateVerdict !== "ASK_HUMAN") {
      return {
        ok: false,
        reason: "queue_contains_not_askable",
        hint: `问题 ${q.questionId} 未持 ASK_HUMAN 凭证——先过 Question Gate（§80.4 evaluateQuestionGate），未过闸问题不得进入提问队列`,
        offenderId: q.questionId,
      };
    }
    if (!legalPriorities.includes(q.priority)) {
      return {
        ok: false,
        reason: "priority_out_of_range",
        hint: `问题 ${q.questionId} 优先级 ${String(q.priority)} 不在 1-5（§80.5 五条优先级机械序号）`,
        offenderId: q.questionId,
      };
    }
  }
  if (queue.length === 0) {
    return {
      ok: true,
      next: null,
      remaining: 0,
      rationale: "队列为空：无待人类裁决问题（显式 NONE，非静默）",
    };
  }
  const sorted = [...queue].sort(
    (a, b) => a.priority - b.priority || queue.indexOf(a) - queue.indexOf(b),
  );
  const next = sorted[0];
  if (next === undefined) {
    // 不可达（queue.length > 0 已保证）；防御性显式分支。
    return { ok: true, next: null, remaining: 0, rationale: "排序结果为空（不可达防御分支）" };
  }
  const description = QUESTION_PRIORITY_DESCRIPTIONS[next.priority - 1] ?? "";
  return {
    ok: true,
    next,
    remaining: queue.length - 1,
    rationale: `优先级 ${next.priority}（${description}）为当前价值最高问题；其余 ${queue.length - 1} 个问题排队，禁止一次抛出（§80.5）`,
  };
}

// ============================================================
// §80.7 Diverge → Converge
// ============================================================

/** 收敛三区键（PRD §80.7 yaml 逐键）。 */
export const CONVERGENCE_ZONE_KEYS = [
  "current_increment",
  "future_considerations",
  "out_of_scope",
] as const;
export type ConvergenceZoneKey = (typeof CONVERGENCE_ZONE_KEYS)[number];

/** 发散收敛分区（§80.7 输出形态；三区必须显式存在——空数组合法，缺席非法）。 */
export type ConvergencePartition = Readonly<
  Partial<Record<ConvergenceZoneKey, readonly string[]>>
>;

export type ConvergenceOutcome =
  | {
      readonly ok: true;
      readonly zones: Readonly<Record<ConvergenceZoneKey, readonly string[]>>;
      /** future_considerations 非空时的 §80.7 路标（不自动进入当前实现范围）。 */
      readonly notes: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: "missing_zone" | "cross_zone_duplicate";
      readonly details: readonly string[];
      readonly hint: string;
    };

/**
 * Diverge→Converge 分区判卷（纯函数，§80.7）：
 * - 三区必须显式存在（undefined = 缺区 fail；空数组合法——「明确分区」的显式缺席纪律）；
 * - 分区互斥：同一 statement 出现在 ≥2 区即 fail（future_considerations ∩
 *   current_increment 是「Future 偷进当前范围」的直接违例形态，逐条列出重复项）；
 * - future_considerations 非空时 notes 携带「不得自动进入当前实现范围」原文路标。
 */
export function evaluateConvergencePartition(
  partition: ConvergencePartition,
): ConvergenceOutcome {
  const missing = CONVERGENCE_ZONE_KEYS.filter(
    (key) => !Array.isArray(partition[key]),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "missing_zone",
      details: missing.map(
        (key) => `缺区 ${key}（§80.7 输出必须明确分区；空数组合法，缺席非法）`,
      ),
      hint: "补齐三区 yaml 键：current_increment / future_considerations / out_of_scope（§80.7 逐键）",
    };
  }
  const zones: Record<ConvergenceZoneKey, readonly string[]> = {
    current_increment: [...(partition.current_increment ?? [])],
    future_considerations: [...(partition.future_considerations ?? [])],
    out_of_scope: [...(partition.out_of_scope ?? [])],
  };
  const seen = new Map<string, ConvergenceZoneKey>();
  const duplicates: string[] = [];
  for (const key of CONVERGENCE_ZONE_KEYS) {
    for (const statement of zones[key]) {
      const firstZone = seen.get(statement);
      if (firstZone !== undefined) {
        duplicates.push(`"${statement}" 同时出现在 ${firstZone} 与 ${key}`);
      } else {
        seen.set(statement, key);
      }
    }
  }
  if (duplicates.length > 0) {
    return {
      ok: false,
      reason: "cross_zone_duplicate",
      details: duplicates,
      hint: "分区互斥：一条想法只能落在一个区（§80.7——future_considerations 不得自动进入当前实现范围，跨区重复即偷渡形态）",
    };
  }
  const notes: string[] = [];
  if (zones.future_considerations.length > 0) {
    notes.push(
      "§80.7：future_considerations 不得自动进入当前实现范围——需要时走新一轮 Discovery（IDEA→DISCOVERY），不在本 Increment 偷渡实现",
    );
  }
  return { ok: true, zones, notes };
}
