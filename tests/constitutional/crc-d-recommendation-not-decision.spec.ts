/**
 * CRC-D —— 推荐权威幻觉（Constitutional Regression Case D；纠错清单 §31 Case 4 +
 * PRD 修订版 §9B CRC-D 行：高风险决策不得由"（推荐）"替代 Human 判断）。
 *
 * 【命名纪律声明（Batch 5 R1，全套件统一）】本套件是 vNext Constitutional Regression
 * Suite，文件一律 CRC-<X>- 前缀，与三套既有 "Case/宪法" 命名显式划界：
 * 1) PRD v0.4/0.5.2 §16 旧 Case A-H（另一套编号）；
 * 2) dot-pomaster-directory-constitution.md 目录宪法 §2/§11/§24/§34；
 * 3) benchmarks/constitutional.mjs 的 Constitutional/Architecture Change 性能基准档。
 * 三者均非本套件；本套件禁裸用 "Case A-H" 词形。
 *
 * 【规范锚】纠错 §31 Case 4 原文：「AI: Architecture B（推荐）/ Expected: 如果属于
 * Authority-bearing decision，不得用模型推荐代替 Human Decision。」PRD §9B CRC-D：
 * 高风险决策不得由"（推荐）"替代 Human 判断。
 *
 * 【联合锚设计（R2 跨面组合断言）】分立检查已有封闭测试：decision-graph.spec.ts:1041
 * （G5 冲突→CONFLICT_REVIEW 禁自行挑答案）、:993（G7 无推荐不许问人）、:615（§12.1
 * 反幻觉）、:1639（resolveDecision 必须显式 answer）、question-gate.spec.ts:225（Q7
 * BLOCKING_AUTHORITY→ASK_HUMAN）。本 CRC 补 G5+G7 串联的场景级不变式：**冲突在场 +
 * 完整可追溯推荐同场（G7 pass 行在 checks 里）→ verdict 仍必须 CONFLICT_REVIEW**；
 * 对照同节点无推荐 → INSUFFICIENT_GROUNDING（连问人的资格都没有）；resolution 面
 * 只有显式人 answer 才落账（系统无自动裁决通路）——推荐是决策输入，不是决策本身。
 *
 * 独立性：纯 kernel 进程内（L1），零网络/外部工具，确定性零墙钟，Windows 可跑。
 */
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildDecisionGraph,
  evaluateDecisionGrounding,
  resolveDecision,
  type BuildDecisionGraphOutcome,
  type DecisionGraph,
  type DecisionNodeCandidate,
  type DecisionRecommendation,
  type GroundingSurfaceValue,
} from "@pomaster/kernel";
import { makeCrcRoot } from "./crc-lib.js";

let root: string;

beforeAll(() => {
  root = makeCrcRoot("d");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

// —— fixture（decision-graph.spec §5.2 跨车型样本同源转录；Architecture B 选型形态） ——

function recBase(overrides: Partial<DecisionRecommendation> = {}): DecisionRecommendation {
  return {
    option: "ARCHITECTURE_B",
    basis_refs: ["CAPABILITY.COST_ANALYSIS", "CONTRACT.COST_COMPARE"],
    rationale: "Architecture B 在当前数据模型下改动面最小（模型推荐——是决策输入）",
    tradeoff: "B 换取交付速度，牺牲后续横向扩展弹性。",
    uncertainty: "匹配语义未定——若 Research 证明匹配键可复用，本推荐需重开。",
    source: "PROJECT_GROUNDED",
    ...overrides,
  };
}

function groundingBase(
  overrides: Partial<DecisionNodeCandidate["grounding"]> = {},
): DecisionNodeCandidate["grounding"] {
  return {
    intent_refs: ["DISCOVERY.INTENT.001"],
    truth_refs: ["CAPABILITY.COST_ANALYSIS"],
    contract_refs: [],
    architecture_refs: [],
    implementation_refs: [],
    evidence_refs: [],
    knowledge_refs: [],
    research_finding_refs: [],
    conflicts: [],
    missing_facts: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<DecisionNodeCandidate> = {}): DecisionNodeCandidate {
  return {
    decision_id: "DECISION.D017",
    class: "SCOPE",
    prompt: "当前 Increment 是否包含跨车型成本比较？（Authority-bearing：高风险 Scope 决策）",
    depends_on: [],
    affects: ["CAPABILITY.CROSS_MODEL_COMPARE", "CONTRACT.COST_COMPARE"],
    grounding: groundingBase(overrides.grounding),
    options: ["ARCHITECTURE_B", "ARCHITECTURE_A", "DEFER"],
    recommendation: overrides.recommendation !== undefined ? overrides.recommendation : recBase(),
    authority: { owner: "BOOTSTRAP_OWNER" },
  };
}

function buildOk(candidates: readonly DecisionNodeCandidate[]): DecisionGraph {
  const outcome: BuildDecisionGraphOutcome = buildDecisionGraph(candidates, {});
  if (!outcome.ok) {
    throw new Error(`fixture build 失败：${outcome.reason} ${outcome.details.join(";")}`);
  }
  return outcome.graph;
}

const RETRIEVED: readonly GroundingSurfaceValue[] = ["CURRENT_TRUTH", "REPO"];

describe("CRC-D：高风险决策不得由「（推荐）」替代 Human 判断（§9B 行 D）", () => {
  it("G5+G7 串联：冲突在场 + 完整可追溯推荐同场 → verdict 仍必须 CONFLICT_REVIEW（推荐在场不改变冲突裁决义务；G7 pass 行在 checks 并排可见）", () => {
    const graph = buildOk([
      candidate({
        grounding: groundingBase({
          conflicts: [
            {
              statement: "BP 承诺跨车型比较，Repo 仅有单车型实现。",
              refs: ["BP.CAPABILITY.CROSS_MODEL_COMPARE", "repo://master"],
            },
          ],
          missing_facts: ["FACT.CROSS_MODEL.MATCHING_SEMANTICS"],
        }),
      }),
    ]);
    const gate = evaluateDecisionGrounding({
      node: graph.decisions[0] as DecisionGraph["decisions"][number],
      graph,
      retrievedSurfaces: RETRIEVED,
      missingFactRouting: { "FACT.CROSS_MODEL.MATCHING_SEMANTICS": "RESEARCHABLE" },
    });
    // 推荐完整在场（G7 pass）——但冲突在场时 verdict 仍是 CONFLICT_REVIEW。
    expect(gate.checks.find((c) => c.check === "G7")?.passed).toBe(true);
    expect(gate.checks.find((c) => c.check === "G5")?.passed).toBe(false);
    expect(gate.verdict).toBe("CONFLICT_REVIEW");
    expect(gate.failedCheck).toBe("G5");
    expect(gate.checks.find((c) => c.check === "G5")?.detail).toContain("禁自行挑");
    expect(gate.notes.join()).toContain("治理面");
    // resolution 仍 null：CONFLICT_REVIEW 不是裁决，系统不因推荐在座而自行落 resolution。
    expect(graph.decisions[0]?.resolution).toBeNull();
  });

  it("对照（G7 反向）：同节点无推荐 → INSUFFICIENT_GROUNDING failedCheck=G7——没有 grounded 推荐连问人的资格都没有（无推荐不许问人）", () => {
    const graph = buildOk([candidate({ recommendation: null })]);
    const gate = evaluateDecisionGrounding({
      node: graph.decisions[0] as DecisionGraph["decisions"][number],
      graph,
      retrievedSurfaces: RETRIEVED,
    });
    expect(gate.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(gate.failedCheck).toBe("G7");
    expect(gate.checks.find((c) => c.check === "G7")?.detail).toContain("没有推荐就不许问人");
  });

  it("resolution 面：只有显式人 answer 才落账——ACCEPT 采纳推荐 option（人给 answer）合法；系统不存在「推荐自动变决策」的通路", () => {
    const graph = buildOk([candidate()]);
    const before = graph.decisions[0]?.resolution;
    expect(before).toBeNull();
    // 显式 Human answer（ACCEPT = 人采纳推荐 option 的决定动作）→ resolution 落账。
    const accepted = resolveDecision(graph, {
      decisionId: "DECISION.D017",
      answer: "ACCEPT",
      seq: 1,
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.graph.decisions[0]?.resolution?.answer).toBe("ACCEPT");
    }
    // 对照：推荐缺席时 ACCEPT 结构性不可达（accept_requires_recommendation——推荐
    // 是 ACCEPT 的前提输入，不是决策替代品）。
    const noRecGraph = buildOk([candidate({ recommendation: null })]);
    const rejected = resolveDecision(noRecGraph, {
      decisionId: "DECISION.D017",
      answer: "ACCEPT",
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe("accept_requires_recommendation");
  });
});
