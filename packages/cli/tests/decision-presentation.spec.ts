/**
 * decision-presentation.spec.ts —— Decision Graph 呈现词形纪律（§6A；Batch 3 R3）。
 *
 * 判据锚（VC Case D：「（推荐）」呈现词形无测试 → 本 spec 钉死）：
 * - recommendation 必须以「推荐」身份标注、不渲染成已决——OPEN 节点禁「状态: 已决」
 *   词形（负例）；推荐行恒带「推荐非已决」标记（正例）；
 * - 禁词 "AI recommended"（§6A 逐字）永不出现于呈现行；
 * - Decision Owner: HUMAN 显式标注（§6A/宪法 §27）；§6A 五件套逐项呈现；
 * - INFERENCE 显式披露（§12.2——模型经验非项目事实）；
 * - resolution = Human 外生 answer 词形（系统无自动裁决通路，§13.2）——已决呈现
 *   与推荐呈现词形互斥；
 * - view decision 纯读零写入（字节锚）；sidecar 缺席/损坏 fail-closed 显式码位。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDecisionGraph, resolveDecision, createStore, type DecisionGraph } from "@pomaster/kernel";
import {
  DECISION_PRESENTATION_FORBIDDEN_WORDFORMS,
  DECISION_RECOMMENDATION_MARK,
  renderDecisionCard,
  renderDecisionGraphPresentation,
  runViewDecision,
} from "@pomaster/cli";

let root: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-decision-pres-"));
  await createStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// fixture（schema 18 十键候选；kernel buildDecisionGraph 单点构造）
// ============================================================

function openCandidate() {
  return {
    decision_id: "DECISION.D017",
    class: "SCOPE",
    prompt: "当前 Increment 是否包含跨车型成本比较？",
    depends_on: [] as string[],
    affects: ["CAPABILITY.CROSS_MODEL_COMPARE", "CONTRACT.COST_COMPARE"],
    grounding: {
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
    },
    options: ["INCLUDE_CURRENT_INCREMENT", "DEFER"],
    recommendation: {
      option: "DEFER",
      basis_refs: ["CAPABILITY.COST_ANALYSIS", "KNOWLEDGE.CROSS_MODEL.MATCHING_RISK"],
      rationale: "当前价值可由单车型交付。",
      tradeoff: "延后跨车型价值，但避免数据模型提前复杂化。",
      uncertainty: "跨车型匹配语义未定。",
      source: "PROJECT_GROUNDED",
    },
    authority: { owner: "BUSINESS_OWNER" },
  };
}

function inferenceCandidate() {
  return {
    ...openCandidate(),
    decision_id: "DECISION.D018",
    recommendation: {
      ...openCandidate().recommendation,
      source: "INFERENCE",
    },
  };
}

function buildGraphOk(candidates: readonly unknown[]): DecisionGraph {
  const outcome = buildDecisionGraph(candidates as never);
  if (!outcome.ok) throw new Error(`fixture build 失败：${outcome.reason}`);
  return outcome.graph;
}

/** .pomaster 全树字节快照（纯读零写入测试锚）。 */
function snapshot(): Map<string, number> {
  const files = new Map<string, number>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(full, readFileSync(full).length);
    }
  };
  walk(join(root, ".pomaster"));
  return files;
}

// ============================================================
// renderDecisionCard（§6A 词形正例与负例）
// ============================================================

describe("renderDecisionCard（§6A Recommendation UX 词形）", () => {
  it("OPEN + 推荐：五件套逐项 + Decision Owner: HUMAN + 推荐行恒带「非已决」标记", () => {
    const graph = buildGraphOk([openCandidate()]);
    const card = renderDecisionCard(graph.decisions[0]);
    expect(card.status).toBe("OPEN");
    const text = card.lines.join("\n");
    // Decision Owner: HUMAN 显式标注（§6A 逐字）+ 具体 owner 词形（诚实）。
    expect(text).toContain("- Decision Owner: HUMAN（authority.owner=BUSINESS_OWNER");
    // §6A 五件套：options / basis / tradeoffs / impact / uncertainty。
    expect(text).toContain("- options: INCLUDE_CURRENT_INCREMENT / DEFER");
    expect(text).toContain("- basis（依据引用）: CAPABILITY.COST_ANALYSIS、KNOWLEDGE.CROSS_MODEL.MATCHING_RISK");
    expect(text).toContain("- tradeoffs: 延后跨车型价值");
    expect(text).toContain("- uncertainty: 跨车型匹配语义未定");
    expect(text).toContain("- impact（affects）: CAPABILITY.CROSS_MODEL_COMPARE、CONTRACT.COST_COMPARE");
    // 推荐以推荐身份标注（标记常量逐字在位）。
    expect(text).toContain(`- 推荐: DEFER${DECISION_RECOMMENDATION_MARK}`);
    expect(card.lines.some((line) => line.includes("OPEN（未决议"))).toBe(true);
  });

  it("负例：OPEN 节点禁「状态: 已决」词形；禁词 AI recommended 永不出现；「（推荐）」不单独成呈现", () => {
    const graph = buildGraphOk([openCandidate()]);
    const card = renderDecisionCard(graph.decisions[0]);
    // OPEN 节点无「状态: 已决」词形（推荐不得渲染成已决）。
    expect(card.lines.some((line) => line.startsWith("- 状态: 已决"))).toBe(false);
    // 禁词表逐词扫描（§6A "AI recommended" 逐字）。
    const text = card.lines.join("\n");
    for (const forbidden of DECISION_PRESENTATION_FORBIDDEN_WORDFORMS) {
      expect(text).not.toContain(forbidden);
    }
    // 每个含「（推荐」的呈现行必须同时携带「非已决」注记——「（推荐）」不得单独成为决策呈现。
    for (const line of card.lines) {
      if (line.includes("（推荐")) {
        expect(line.includes("非已决"), `推荐行缺非已决注记: ${line}`).toBe(true);
      }
    }
  });

  it("INFERENCE source 显式披露（模型经验非项目事实，§12.2）；PROJECT_GROUNDED 与确定性词形区分", () => {
    const graph = buildGraphOk([inferenceCandidate()]);
    const text = renderDecisionCard(graph.decisions[0]).lines.join("\n");
    expect(text).toContain("source: INFERENCE（模型经验——显式披露：本推荐非项目事实");
    const grounded = buildGraphOk([openCandidate()]);
    const groundedText = renderDecisionCard(grounded.decisions[0]).lines.join("\n");
    expect(groundedText).toContain("非 policy-required/computed result");
    expect(groundedText).not.toContain("AI recommended");
  });

  it("无 recommendation：显式缺席呈现（G7 无推荐不许问人是判卷面语义，本面只如实呈现）", () => {
    const graph = buildGraphOk([openCandidate()]);
    const node = { ...graph.decisions[0], recommendation: null };
    const card = renderDecisionCard(node);
    expect(card.status).toBe("OPEN");
    expect(card.lines.join("\n")).toContain("（无——sidecar 未申报该键）");
    expect(card.lines.join("\n")).toContain("G7 无推荐不许问人");
  });

  it("RESOLVED（ACCEPT 外生 answer）：已决词形与推荐词形互斥呈现；系统无自动裁决注记", () => {
    const graph = buildGraphOk([openCandidate()]);
    const resolved = resolveDecision(graph, { decisionId: "DECISION.D017", answer: "ACCEPT" });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const card = renderDecisionCard(resolved.graph.decisions[0]);
    expect(card.status).toBe("RESOLVED");
    const text = card.lines.join("\n");
    expect(text).toContain("- 状态: 已决——answer=ACCEPT（Human 外生 answer 经 resolveDecision 通路；系统无自动裁决通路，§13.2）");
    // 已决后推荐行仍以推荐身份呈现（推荐历史不追认成已决动作）。
    expect(text).toContain(DECISION_RECOMMENDATION_MARK);
    for (const forbidden of DECISION_PRESENTATION_FORBIDDEN_WORDFORMS) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("异形节点/缺键：显式缺席呈现不 throw（words-only 容错；诚实缺席不伪造呈现面）", () => {
    const malformed = renderDecisionCard("DEFER" as never);
    expect(malformed.lines.join("\n")).toContain("形态畸形");
    const missingKeys = renderDecisionCard({ decision_id: "DECISION.X" });
    const text = missingKeys.lines.join("\n");
    expect(text).toContain("(missing owner)");
    expect(text).toContain("（无——sidecar 未申报该键）");
  });
});

// ============================================================
// renderDecisionGraphPresentation（图级呈现）
// ============================================================

describe("renderDecisionGraphPresentation（§6A 图级呈现）", () => {
  it("逐 Decision 渲染卡片；零 Decision 显式空（非空白假绿）", () => {
    const graph = buildGraphOk([openCandidate(), inferenceCandidate()]);
    const presentation = renderDecisionGraphPresentation(graph);
    expect(presentation.cards).toHaveLength(2);
    expect(presentation.cards.map((card) => card.status)).toEqual(["OPEN", "OPEN"]);
    expect(presentation.lines.join("\n")).toContain("## DECISION.D017");
    expect(presentation.lines.join("\n")).toContain("## DECISION.D018");

    const empty = renderDecisionGraphPresentation({ decisions: [] });
    expect(empty.cards).toHaveLength(0);
    expect(empty.lines.join("\n")).toContain("图内零 Decision——显式空");
  });

  it("graph 异形（缺 decisions 数组）：如实呈现不猜测语义", () => {
    const presentation = renderDecisionGraphPresentation({ nope: true });
    expect(presentation.cards).toHaveLength(0);
    expect(presentation.lines.join("\n")).toContain("非 decision-graph 形态");
  });
});

// ============================================================
// view decision（CLI 读侧：sidecar 纯读呈现 + fail-closed 码位 + 字节锚）
// ============================================================

describe("view decision（scratchpad decision-graph sidecar 呈现）", () => {
  const SIDECAR_REL = join(".pomaster", "discovery", "scratchpads");

  function writeSidecar(padId: string, graph: unknown): void {
    const padDir = join(root, SIDECAR_REL, padId);
    mkdirSync(padDir, { recursive: true });
    writeFileSync(join(padDir, "decision-graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  }

  it("id 词形非法 → SCHEMA_INVALID；scratchpad 缺席 → SCRATCHPAD_NOT_FOUND", async () => {
    const badId = await runViewDecision(root, { discoveryId: "非法 id!" });
    expect(badId.ok).toBe(false);
    expect(badId.errors[0]?.code).toBe("SCHEMA_INVALID");
    const missing = await runViewDecision(root, { discoveryId: "pad-x" });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("SCRATCHPAD_NOT_FOUND");
  });

  it("sidecar 缺席 → DECISION_GRAPH_NOT_FOUND（View not new database——不创建不补写）", async () => {
    mkdirSync(join(root, SIDECAR_REL, "pad-empty"), { recursive: true });
    const outcome = await runViewDecision(root, { discoveryId: "pad-empty" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("DECISION_GRAPH_NOT_FOUND");
    expect(outcome.errors[0]?.hint).toContain("不创建不补写");
  });

  it("sidecar 损坏 → SCHEMA_INVALID fail-closed；合法 sidecar → §6A 词形呈现 + 计数", async () => {
    mkdirSync(join(root, SIDECAR_REL, "pad-broken"), { recursive: true });
    writeFileSync(join(root, SIDECAR_REL, "pad-broken", "decision-graph.json"), "{broken", "utf8");
    const broken = await runViewDecision(root, { discoveryId: "pad-broken" });
    expect(broken.ok).toBe(false);
    expect(broken.errors[0]?.code).toBe("SCHEMA_INVALID");

    const graph = buildGraphOk([openCandidate()]);
    writeSidecar("pad-ok", graph);
    const outcome = await runViewDecision(root, { discoveryId: "pad-ok" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.decision_count).toBe(1);
    expect(outcome.result.open_count).toBe(1);
    expect(outcome.result.resolved_count).toBe(0);
    expect(outcome.result.markdown).toContain("# Decision Graph Presentation — pad-ok（§6A Recommendation UX 词形纪律）");
    expect(outcome.result.markdown).toContain("- Decision Owner: HUMAN（authority.owner=BUSINESS_OWNER");
    expect(outcome.result.markdown).toContain("OPEN（未决议");
    expect(outcome.result.markdown).not.toContain("AI recommended");
  });

  it("sidecar 自由文本携 §6A 禁词 → fail-closed（数据透传路径拦截——渲染器静态文本不产出≠素材干净）", async () => {
    const graph = buildGraphOk([openCandidate()]);
    // rationale 是自由文本透传字段——素材面词形违约（禁词注入）不得渲染成呈现面。
    const tainted = JSON.parse(
      JSON.stringify(graph).replace("当前价值可由单车型交付。", "AI recommended DEFER（模拟素材面词形违约）"),
    );
    writeSidecar("pad-forbidden", tainted);
    const outcome = await runViewDecision(root, { discoveryId: "pad-forbidden" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("禁词");
    // 诊断消息从严：fail 面不复述禁词词形（引注也算写出）。
    expect(outcome.errors[0]?.message).not.toContain("AI recommended");
    expect(outcome.result.markdown).toBe("");
  });

  it("OPEN 与已决并图：open/resolved 计数分离；纯读零写入（执行前后 .pomaster 字节不变）", async () => {
    const graph = buildGraphOk([openCandidate()]);
    const resolved = resolveDecision(graph, { decisionId: "DECISION.D017", answer: "CHANGE", value: "人给的新选项" });
    if (!resolved.ok) throw new Error(`resolve fixture 失败: ${resolved.reason}`);
    const mixed = buildGraphOk([inferenceCandidate()]);
    writeSidecar("pad-mixed", {
      ...mixed,
      decisions: [...resolved.graph.decisions, ...mixed.decisions],
    });
    const before = snapshot();
    const outcome = await runViewDecision(root, { discoveryId: "pad-mixed" });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.decision_count).toBe(2);
    expect(outcome.result.open_count).toBe(1);
    expect(outcome.result.resolved_count).toBe(1);
    expect(outcome.result.markdown).toContain("answer=CHANGE");
    expect(snapshot()).toEqual(before);
    expect(existsSync(join(root, SIDECAR_REL, "pad-mixed", "decision-graph.json"))).toBe(true);
  });
});
