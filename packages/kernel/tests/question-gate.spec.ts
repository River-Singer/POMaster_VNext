/**
 * question-gate.spec.ts —— Question Gate Q1-Q7 判卷 + One-question-at-a-time +
 * Diverge→Converge 分区判卷（P18 · PRD §80.4/80.5/80.7）。
 *
 * 覆盖纪律：Q1-Q7 每问至少一正（命中时正确挡下并给对应处置）一反（不命中时判卷
 * 继续走下一关，不被错误挡下）；ASK_HUMAN 双闸（七关全过 + 可问分类）；分类矛盾
 * 显式拒绝；one-question 单问题返回 + 未过闸队列拒绝 + 空队列显式 NONE；
 * converge 缺区/跨区重复 fail-closed。
 */
import { describe, expect, it } from "vitest";
import {
  ASKABLE_CATEGORIES,
  CONVERGENCE_ZONE_KEYS,
  QUESTION_GATE_CATEGORIES,
  QUESTION_GATES,
  QUESTION_PRIORITY_DESCRIPTIONS,
  evaluateConvergencePartition,
  evaluateQuestionGate,
  selectNextQuestion,
  type PrioritizedQuestion,
  type QuestionGateAnswerable,
} from "@pomaster/kernel";

/** 基线：七关全不命中（Q1-Q6 全 false）+ Q7 阻塞（true）→ BLOCKING_AUTHORITY 应 ASK_HUMAN。 */
const NONE_ANSWERABLE: QuestionGateAnswerable = {
  q1_current_truth: false,
  q2_existing_docs: false,
  q3_repo_code: false,
  q4_existing_evidence: false,
  q5_knowledge_default: false,
  q6_research: false,
  q7_blocking_increment: true,
};

/** 第 n 关（1-6）命中 = 对应键 true；其余保持基线。 */
function withGateHit(n: number): QuestionGateAnswerable {
  const keys = [
    "q1_current_truth",
    "q2_existing_docs",
    "q3_repo_code",
    "q4_existing_evidence",
    "q5_knowledge_default",
    "q6_research",
  ] as const;
  return { ...NONE_ANSWERABLE, [keys[n - 1]]: true };
}

describe("QUESTION_GATES（§80.4 原文锚）", () => {
  it("七关问句与行序逐字冻结（Q1..Q7）", () => {
    expect(QUESTION_GATES.map((g) => g.gate)).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      "Q5",
      "Q6",
      "Q7",
    ]);
    expect(QUESTION_GATES[0]?.prd).toContain("Current Truth");
    expect(QUESTION_GATES[5]?.prd).toContain("Research");
    expect(QUESTION_GATES[6]?.prd).toContain("阻塞当前 Increment");
  });

  it("分类五词形 + 可问两类逐字（只能主动问 BLOCKING_AUTHORITY/PREFERENCE）", () => {
    expect(QUESTION_GATE_CATEGORIES).toEqual([
      "BLOCKING_AUTHORITY",
      "PREFERENCE",
      "DERIVABLE",
      "RESEARCHABLE",
      "DEFERABLE",
    ]);
    expect(ASKABLE_CATEGORIES).toEqual(["BLOCKING_AUTHORITY", "PREFERENCE"]);
  });
});

describe("Q1-Q7 逐关：每问一正一反", () => {
  it("Q1 正：Current Truth 能答 → DERIVABLE，stoppedAtGate=Q1，禁 ASK", () => {
    const outcome = evaluateQuestionGate({
      category: "BLOCKING_AUTHORITY",
      answerable: withGateHit(1),
    });
    expect(outcome.mayAskHuman).toBe(false);
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.verdict).toBe("DERIVABLE");
      expect(outcome.stoppedAtGate).toBe("Q1");
      expect(outcome.declaredConsistent).toBe(false);
    }
  });

  it("Q1 反：Current Truth 不答 → 判卷继续（不被 Q1 挡下；下一关命中才停）", () => {
    const outcome = evaluateQuestionGate({
      category: "PREFERENCE",
      answerable: withGateHit(2),
    });
    expect(outcome.mayAskHuman).toBe(false);
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.stoppedAtGate).toBe("Q2");
    }
  });

  it("Q2 正：Docs/BP/Prototype 能答 → DERIVABLE@Q2", () => {
    const outcome = evaluateQuestionGate({
      category: "DERIVABLE",
      answerable: withGateHit(2),
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.verdict).toBe("DERIVABLE");
      expect(outcome.stoppedAtGate).toBe("Q2");
      expect(outcome.declaredConsistent).toBe(true);
    } else {
      expect.unreachable("Q2 命中必须挡下");
    }
  });

  it("Q2 反：Docs 不答 → 不停 Q2（六关全不命中时到 Q7 面前）", () => {
    const outcome = evaluateQuestionGate({
      category: "BLOCKING_AUTHORITY",
      answerable: { ...withGateHit(2), q2_existing_docs: false },
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.stoppedAtGate).not.toBe("Q2");
    }
    expect(outcome.mayAskHuman).toBe(true);
  });

  it("Q3 正：Repo/Code/OpenAPI 能答 → DERIVABLE@Q3", () => {
    const outcome = evaluateQuestionGate({
      category: "BLOCKING_AUTHORITY",
      answerable: withGateHit(3),
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.verdict).toBe("DERIVABLE");
      expect(outcome.stoppedAtGate).toBe("Q3");
    } else {
      expect.unreachable("Q3 命中必须挡下");
    }
  });

  it("Q3 反：Repo 不答 → 判卷越过 Q3", () => {
    const outcome = evaluateQuestionGate({
      category: "BLOCKING_AUTHORITY",
      answerable: withGateHit(4),
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.stoppedAtGate).toBe("Q4");
    }
  });

  it("Q4 正：Existing Evidence 能答 → DERIVABLE@Q4", () => {
    const outcome = evaluateQuestionGate({
      category: "DERIVABLE",
      answerable: withGateHit(4),
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.stoppedAtGate).toBe("Q4");
      expect(outcome.declaredConsistent).toBe(true);
    } else {
      expect.unreachable("Q4 命中必须挡下");
    }
  });

  it("Q4 反：Evidence 不答 → 判卷越过 Q4", () => {
    const outcome = evaluateQuestionGate({
      category: "BLOCKING_AUTHORITY",
      answerable: withGateHit(5),
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.stoppedAtGate).toBe("Q5");
    }
  });

  it("Q5 正：Knowledge 低风险默认可给 → DERIVABLE@Q5（低风险默认也是可推导处置）", () => {
    const outcome = evaluateQuestionGate({
      category: "DERIVABLE",
      answerable: withGateHit(5),
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.verdict).toBe("DERIVABLE");
      expect(outcome.stoppedAtGate).toBe("Q5");
    } else {
      expect.unreachable("Q5 命中必须挡下");
    }
  });

  it("Q5 反：Knowledge 不答 → 判卷越过 Q5", () => {
    const outcome = evaluateQuestionGate({
      category: "BLOCKING_AUTHORITY",
      answerable: withGateHit(6),
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.stoppedAtGate).toBe("Q6");
    }
  });

  it("Q6 正：Research 能答 → RESEARCHABLE@Q6（Research-first §80.6：不要求业务凭空回答）", () => {
    const outcome = evaluateQuestionGate({
      category: "RESEARCHABLE",
      answerable: withGateHit(6),
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.verdict).toBe("RESEARCHABLE");
      expect(outcome.stoppedAtGate).toBe("Q6");
      expect(outcome.declaredConsistent).toBe(true);
      expect(outcome.hint).toContain("Research");
    } else {
      expect.unreachable("Q6 命中必须挡下");
    }
  });

  it("Q6 反：Research 不能答 → 判卷到 Q7（不阻塞 → DEFERABLE）", () => {
    const outcome = evaluateQuestionGate({
      category: "DEFERABLE",
      answerable: { ...NONE_ANSWERABLE, q7_blocking_increment: false },
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.verdict).toBe("DEFERABLE");
      expect(outcome.stoppedAtGate).toBe("Q7");
      expect(outcome.declaredConsistent).toBe(true);
      expect(outcome.reason).toContain("不完整");
    } else {
      expect.unreachable("Q7 不阻塞必须 DEFERABLE");
    }
  });

  it("Q7 正：不回答真的阻塞（七关全过）+ 可问分类 → ASK_HUMAN", () => {
    const outcome = evaluateQuestionGate({
      category: "BLOCKING_AUTHORITY",
      answerable: NONE_ANSWERABLE,
    });
    expect(outcome.mayAskHuman).toBe(true);
    if (outcome.mayAskHuman) {
      expect(outcome.stoppedAtGate).toBeNull();
      expect(outcome.notes.join()).toContain("One-question-at-a-time");
    }
  });

  it("Q7 反：不回答不阻塞 → DEFERABLE（不完整是合法状态，§82.1）——即使六关全不命中也不许 ASK", () => {
    const outcome = evaluateQuestionGate({
      category: "BLOCKING_AUTHORITY",
      answerable: { ...NONE_ANSWERABLE, q7_blocking_increment: false },
    });
    expect(outcome.mayAskHuman).toBe(false);
  });
});

describe("ASK_HUMAN 双闸与分类矛盾（§80.4 只能主动问两类）", () => {
  it("PREFERENCE 分类七关全过 → ASK_HUMAN", () => {
    const outcome = evaluateQuestionGate({
      category: "PREFERENCE",
      answerable: NONE_ANSWERABLE,
    });
    expect(outcome.mayAskHuman).toBe(true);
  });

  it("DERIVABLE 申报撞上七关全过 → ASK_REJECTED（矛盾显式拒绝，不静默归一）", () => {
    const outcome = evaluateQuestionGate({
      category: "DERIVABLE",
      answerable: NONE_ANSWERABLE,
    });
    expect(outcome.mayAskHuman).toBe(false);
    if (!outcome.mayAskHuman && outcome.verdict === "ASK_REJECTED") {
      expect(outcome.reason).toBe("category_not_askable");
      expect(outcome.hint).toContain("BLOCKING_AUTHORITY/PREFERENCE");
    } else {
      expect.unreachable("矛盾申报必须 ASK_REJECTED");
    }
  });

  it("RESEARCHABLE 申报撞上七关全过 → ASK_REJECTED", () => {
    const outcome = evaluateQuestionGate({
      category: "RESEARCHABLE",
      answerable: NONE_ANSWERABLE,
    });
    expect(outcome.mayAskHuman).toBe(false);
  });

  it("DEFERABLE 申报撞上七关全过 → ASK_REJECTED", () => {
    const outcome = evaluateQuestionGate({
      category: "DEFERABLE",
      answerable: NONE_ANSWERABLE,
    });
    expect(outcome.mayAskHuman).toBe(false);
  });

  it("对账信号：申报 DERIVABLE 而重算 RESEARCHABLE → declaredConsistent=false 但 verdict 以重算为准（C5）", () => {
    const outcome = evaluateQuestionGate({
      category: "DERIVABLE",
      answerable: withGateHit(6),
    });
    if (!outcome.mayAskHuman && outcome.verdict !== "ASK_REJECTED") {
      expect(outcome.verdict).toBe("RESEARCHABLE");
      expect(outcome.declaredConsistent).toBe(false);
    }
  });
});

describe("One-question-at-a-time（§80.5）", () => {
  it("优先级描述五条原文逐字（机械序号 1-5 对位）", () => {
    expect(QUESTION_PRIORITY_DESCRIPTIONS).toEqual([
      "当前 Scope 边界",
      "不可逆/高风险 Business Authority",
      "Multiple-valid-options 的偏好",
      "当前 Increment 必须定义的失败行为",
      "Acceptance Evidence",
    ]);
  });

  it("多问题队列只返回一个（价值最高优先），剩余数显式", () => {
    const queue: PrioritizedQuestion[] = [
      { questionId: "Q-ACCEPT", priority: 5, gateVerdict: "ASK_HUMAN" },
      { questionId: "Q-SCOPE", priority: 1, gateVerdict: "ASK_HUMAN" },
      { questionId: "Q-AUTH", priority: 2, gateVerdict: "ASK_HUMAN" },
    ];
    const outcome = selectNextQuestion(queue);
    expect(outcome.ok).toBe(true);
    if (outcome.ok && outcome.next !== null) {
      expect(outcome.next.questionId).toBe("Q-SCOPE");
      expect(outcome.next.priority).toBe(1);
      expect(outcome.remaining).toBe(2);
      expect(outcome.rationale).toContain("Scope 边界");
    }
  });

  it("同优先级稳定（输入顺序保持——零墙钟 A4 确定性）", () => {
    const queue: PrioritizedQuestion[] = [
      { questionId: "FIRST", priority: 3, gateVerdict: "ASK_HUMAN" },
      { questionId: "SECOND", priority: 3, gateVerdict: "ASK_HUMAN" },
    ];
    const outcome = selectNextQuestion(queue);
    if (outcome.ok && outcome.next !== null) {
      expect(outcome.next.questionId).toBe("FIRST");
      expect(outcome.remaining).toBe(1);
    }
  });

  it("空队列 → next=null 显式 NONE（不是静默）", () => {
    const outcome = selectNextQuestion([]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.next).toBeNull();
      expect(outcome.remaining).toBe(0);
      expect(outcome.rationale).toContain("显式 NONE");
    }
  });

  it("fail-closed：队列混入未过闸问题 → 整批显式拒绝（不静默吞问题）", () => {
    const queue = [
      { questionId: "OK", priority: 2, gateVerdict: "ASK_HUMAN" },
      { questionId: "BAD", priority: 1, gateVerdict: "DERIVABLE" },
    ] as const;
    const outcome = selectNextQuestion(queue as unknown as PrioritizedQuestion[]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("queue_contains_not_askable");
      expect(outcome.offenderId).toBe("BAD");
    }
  });

  it("fail-closed：优先级词形外（0/6）→ 显式拒绝", () => {
    for (const bad of [0, 6]) {
      const outcome = selectNextQuestion([
        { questionId: "X", priority: bad as 1, gateVerdict: "ASK_HUMAN" },
      ]);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason).toBe("priority_out_of_range");
    }
  });
});

describe("Diverge → Converge（§80.7）", () => {
  it("三区键原文逐字（yaml 三键）", () => {
    expect(CONVERGENCE_ZONE_KEYS).toEqual([
      "current_increment",
      "future_considerations",
      "out_of_scope",
    ]);
  });

  it("合法分区：三区显式（空数组合法）+ future 非空时携带 §80.7 路标", () => {
    const outcome = evaluateConvergencePartition({
      current_increment: ["编辑主流程"],
      future_considerations: ["批量导入"],
      out_of_scope: ["移动端"],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.notes.join()).toContain("不得自动进入当前实现范围");
    }
  });

  it("缺区 fail-closed：undefined 区显式列出（空数组合法，缺席非法）", () => {
    const outcome = evaluateConvergencePartition({
      current_increment: ["x"],
      future_considerations: [],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("missing_zone");
      expect(outcome.details.join()).toContain("out_of_scope");
    }
  });

  it("跨区重复 fail-closed：future_considerations 偷进 current_increment 被逐条点名", () => {
    const outcome = evaluateConvergencePartition({
      current_increment: ["批量导入", "编辑主流程"],
      future_considerations: ["批量导入"],
      out_of_scope: [],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("cross_zone_duplicate");
      expect(outcome.details[0]).toContain("批量导入");
      expect(outcome.details[0]).toContain("current_increment");
      expect(outcome.hint).toContain("偷渡");
    }
  });
});
