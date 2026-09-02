/**
 * decision-graph.spec.ts —— Grounded Decision Graph 纯函数面全对（v0.5.3 P0.5 · VB-PR1）。
 *
 * 覆盖纪律（研究口径 L1 合理份额）：
 * - schema 18 资产正反例（ajv **局部编译**——不经 allSchemas：三个挂载点
 *   packages/schemas/src/index.ts / packages/kernel/src/index.ts / docs/kernel-api.md 让位
 *   Wave 1，主控收口时统一挂载）；research_request/research_handoff/finding_link 以
 *   $ref 子模式编译（Owner 裁决9③：形态住 schema 18，10 号零改动）；
 * - buildDecisionGraph：合法图谱 / 环与悬空 depends_on 拒绝 / 词表外 class / 禁词
 *   GRILLING/GRILLED/GRILL_CONFIRMED / §12.1 缺失事实不得冒充推荐前提 / 指纹自动维护重放稳定；
 * - computeDecisionFrontier：§7.3 三步示例逐字复刻 + DEFERRED/UNKNOWN 上游保守排除 +
 *   零持久化（纯派生，重放深度相等）；
 * - evaluateDecisionGrounding：G1-G8 逐检查正反 + 五值 verdict 判定矩阵（优先序）+
 *   反幻觉三规则 fail-closed（无 Ref premise / 无 basis 推荐 / INFERENCE 披露）；
 * - createResearchRequest：§9.1 九键 / §9.3 mode 路由（零缺省——不默认 MIXED）/
 *   词表外值 fail-closed；
 * - applyResearchHandoff：RESOLVES_FACT 消解 / CONTRADICTS_PREMISE → CONFLICT_REVIEW /
 *   §12.4 INFERENCE 洗白防御 / 幂等重放 NO_CHANGE；
 * - resolveDecision：四变体矩阵 + UNKNOWN 六问重分类（复用 09 blocker_triage 语义）；
 * - evaluateDiscoverySufficiency：八维显著改变 + 残留合法分类 + 09 msd 三轴派生。
 *
 * 纯函数判卷风格对齐 discovery-chain.spec/question-gate.spec：逐检查一正一反、fail-closed
 * 显式拒绝、同输入重放深度相等；本 spec 零 fixture 目录（纯函数 + 只读 schema 资产），
 * 不触碰真实 home（时间戳零出现——零墙钟 A4）。
 */
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/digest.js";
import {
  DECISION_CLASS_VALUES,
  DECISION_GRAPH_FORBIDDEN_WORDFORMS,
  DECISION_RELATION_VALUES,
  GROUNDING_SURFACE_VALUES,
  GROUNDING_VERDICT_VALUES,
  MISSING_FACT_ROUTE_VALUES,
  RECOMMENDATION_SOURCE_VALUES,
  RESEARCH_MODE_ROUTE_HINTS,
  RESEARCH_REQUEST_ID_PATTERN,
  SUFFICIENCY_DIMENSIONS,
  SUFFICIENCY_RESIDUAL_CLASSIFICATIONS,
  UNKNOWN_DISPOSITION_VALUES,
  applyResearchHandoff,
  buildDecisionGraph,
  classifyUnknownTriage,
  computeDecisionFrontier,
  createResearchRequest,
  evaluateDecisionGrounding,
  evaluateDiscoverySufficiency,
  resolveDecision,
  type DecisionGraph,
  type DecisionGrounding,
  type DecisionNodeCandidate,
  type DecisionRecommendation,
  type GroundingSurfaceValue,
  type HandoffFinding,
  type MissingFactRouteValue,
  type ResearchHandoffInput,
  type UnknownTriage,
} from "../src/decision-graph.js";

// ============================================================
// 装载：schema 18 资产（局部 ajv——不经 allSchemas，挂载让位 Wave 1）
// ============================================================

const SCHEMA_18_URL = new URL("../../schemas/assets/18-decision-graph.schema.json", import.meta.url);
const schema18 = JSON.parse(readFileSync(SCHEMA_18_URL, "utf8")) as Record<string, unknown>;

const ajv = new Ajv({ strictSchema: false, allErrors: true });
// compile(schema) 已按 $id 隐式注册——后续 $ref 子模式直接解析到同一份文档。
const validateGraph = ajv.compile(schema18 as object);
const SCHEMA_18_ID = "https://pomaster.dev/schemas/decision-graph/v1-draft.json";
const validateRequest = ajv.compile({ $ref: `${SCHEMA_18_ID}#/definitions/research_request` });
const validateHandoff = ajv.compile({ $ref: `${SCHEMA_18_ID}#/definitions/research_handoff` });
const validateFindingLink = ajv.compile({ $ref: `${SCHEMA_18_ID}#/definitions/finding_link` });

function graphErrors(): string {
  return (validateGraph.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join(" | ");
}

// ============================================================
// 夹具构造器（纯内存；零墙钟——序号用 seq 不用 Date）
// ============================================================

const FP = `sha256:${"0123456789abcdef".repeat(4)}`;

function groundingBase(overrides: Partial<DecisionGrounding> = {}): DecisionGrounding {
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

function recBase(
  overrides: Partial<DecisionRecommendation> = {},
): DecisionRecommendation {
  return {
    option: "DEFER",
    basis_refs: ["CAPABILITY.COST_ANALYSIS", "KNOWLEDGE.CROSS_MODEL.MATCHING_RISK"],
    rationale: "当前价值可以通过单车型成本分析交付；跨车型比较会引入新的匹配语义。",
    tradeoff: "延后跨车型价值，但避免当前数据模型提前复杂化。",
    uncertainty: "跨车型匹配语义未定——若 Research 证明匹配键可复用，本推荐需重开。",
    source: "PROJECT_GROUNDED",
    ...overrides,
  };
}

/** §5.2 跨车型 D017 样本转录（schema 正例同源）。 */
function candidateD017(
  overrides: Partial<DecisionNodeCandidate> = {},
): DecisionNodeCandidate {
  return {
    decision_id: "DECISION.D017",
    class: "SCOPE",
    prompt: "当前 Increment 是否包含跨车型成本比较？",
    depends_on: [],
    affects: ["CAPABILITY.CROSS_MODEL_COMPARE", "CONTRACT.COST_COMPARE"],
    grounding: groundingBase({
      knowledge_refs: ["KNOWLEDGE.CROSS_MODEL.MATCHING_RISK"],
      missing_facts: ["FACT.CROSS_MODEL.MATCHING_SEMANTICS"],
    }),
    options: ["INCLUDE_CURRENT_INCREMENT", "DEFER"],
    recommendation: recBase(),
    authority: { owner: "BOOTSTRAP_OWNER" },
    ...overrides,
  };
}

/** 链式节点最小夹具（frontier 矩阵用）。 */
function chainCand(
  decision_id: string,
  depends_on: readonly string[],
  overrides: Partial<DecisionNodeCandidate> = {},
): DecisionNodeCandidate {
  return {
    decision_id,
    class: "SCOPE",
    prompt: `${decision_id} 的决策问题？`,
    depends_on: [...depends_on],
    affects: [],
    grounding: groundingBase(),
    options: ["GO", "NO_GO"],
    recommendation: recBase({
      option: "GO",
      basis_refs: ["CAPABILITY.COST_ANALYSIS"],
      rationale: "链式夹具理由。",
      tradeoff: "链式夹具取舍。",
      uncertainty: "链式夹具不确定性。",
    }),
    authority: { owner: "BOOTSTRAP_OWNER" },
    ...overrides,
  };
}

function buildOk(candidates: readonly DecisionNodeCandidate[], requestRefs?: readonly string[]): DecisionGraph {
  const outcome = buildDecisionGraph(candidates, requestRefs === undefined ? {} : { requestRefs });
  if (!outcome.ok) throw new Error(`fixture build 失败：${outcome.reason} ${outcome.details.join(";")}`);
  return outcome.graph;
}

const RETRIEVED: readonly GroundingSurfaceValue[] = ["CURRENT_TRUTH", "REPO"];

function gateReadyNode(graph: DecisionGraph) {
  const node = graph.decisions[0];
  if (node === undefined) throw new Error("fixture graph 无节点");
  return node;
}

// ============================================================
// A. schema 18 资产（ajv 局部编译）
// ============================================================

describe("18-decision-graph.schema.json（$id 与挂载前形态）", () => {
  it("$id 形态对齐 v1-draft 契约（SCHEMA_VERSION=v1-draft；挂载前先锁资产）", () => {
    expect(schema18.$id).toBe(SCHEMA_18_ID);
    expect(String(schema18.$id).endsWith("/v1-draft.json")).toBe(true);
  });

  it("正例：PRD §5.2 跨车型 D017 样本转录通过 ajv", () => {
    const positive = (schema18.examples as readonly unknown[])[0];
    expect(validateGraph(positive)).toBe(true);
  });

  it("反例 examples[1]：词表外 class / 缺 basis_refs / 缺 authority 三重违规被拒", () => {
    const negative = (schema18.examples as readonly unknown[])[1];
    expect(validateGraph(negative)).toBe(false);
    const text = JSON.stringify(validateGraph.errors);
    expect(text).toContain("decision_class");
    expect(text).toContain("basis_refs");
    expect(text).toContain("authority");
  });

  it("顶层 additionalProperties:false——多余键显式拒绝（O-9 全锁）", () => {
    const clone = JSON.parse(JSON.stringify((schema18.examples as readonly unknown[])[0])) as Record<string, unknown>;
    clone["frontier"] = ["DECISION.D017"];
    expect(validateGraph(clone)).toBe(false);
  });

  it("§5.2 十键一次锁全：grounding 缺任一槽（conflicts）即拒（空数组合法，缺席非法）", () => {
    const clone = JSON.parse(JSON.stringify((schema18.examples as readonly unknown[])[0])) as {
      decisions: Record<string, unknown>[];
    };
    const grounding = clone.decisions[1]?.grounding as Record<string, unknown>;
    delete grounding["conflicts"];
    expect(validateGraph(clone)).toBe(false);
    expect(graphErrors()).toContain("conflicts");
  });

  it("decisions minItems 1：空图非法（Decision Graph 不是空 Question List）", () => {
    const clone = JSON.parse(JSON.stringify((schema18.examples as readonly unknown[])[0])) as Record<string, unknown>;
    clone["decisions"] = [];
    expect(validateGraph(clone)).toBe(false);
  });

  it("graph_fingerprint / projection_fingerprint 词形 sha256:<64hex>，坏值拒绝", () => {
    const clone = JSON.parse(JSON.stringify((schema18.examples as readonly unknown[])[0])) as Record<string, unknown>;
    clone["graph_fingerprint"] = "deadbeef";
    expect(validateGraph(clone)).toBe(false);
    const clone2 = JSON.parse(JSON.stringify((schema18.examples as readonly unknown[])[0])) as Record<string, unknown>;
    clone2["projection_fingerprint"] = "sha256:zzzz";
    expect(validateGraph(clone2)).toBe(false);
  });

  it("x-digest-ethics 注记在场且 write_blocking:false（D24：kernel 自动维护，human_touch forbidden）", () => {
    const fp = (schema18.properties as Record<string, Record<string, unknown>>).graph_fingerprint;
    const ethics = fp["x-digest-ethics"] as Record<string, unknown>;
    expect(ethics["write_blocking"]).toBe(false);
    expect(ethics["human_touch"]).toBe("forbidden");
    const proj = (schema18.properties as Record<string, Record<string, unknown>>).projection_fingerprint;
    expect((proj["x-digest-ethics"] as Record<string, unknown>)["write_blocking"]).toBe(false);
  });

  it("禁词负例注记在场：GRILLING/GRILLED/GRILL_CONFIRMED（09 号 forbidden_wordforms 先例）", () => {
    const defs = schema18.definitions as Record<string, Record<string, unknown>>;
    const decisionClass = defs["decision_class"]["x-pomaster-vocab"] as Record<string, unknown>;
    expect(decisionClass["forbidden_wordforms"]).toEqual(["GRILLING", "GRILLED", "GRILL_CONFIRMED"]);
    const decisionId = defs["decision_id"]["x-pomaster-vocab"] as Record<string, unknown>;
    expect(decisionId["forbidden_wordforms"]).toContain("GRILLED");
  });

  it("decision class 闭包 = SCOPE 单值（裁决9②）；CONTRACT.* 示意词形经 loose_ref 放行", () => {
    const defs = schema18.definitions as Record<string, Record<string, unknown>>;
    expect((defs["decision_class"]["enum"] as readonly string[])).toEqual(["SCOPE"]);
    // 正例 D017 的 affects 含 CONTRACT.COST_COMPARE（词表无此前缀——示意词形放行）。
    const positive = (schema18.examples as readonly unknown[])[0] as {
      decisions: { affects: string[] }[];
    };
    expect(positive.decisions[1]?.affects).toContain("CONTRACT.COST_COMPARE");
    expect(validateGraph(positive)).toBe(true);
  });

  it("resolution 条件式：CHANGE⇒value 必填；UNKNOWN⇒classified 必填；ACCEPT/DEFER 禁 value；classified 反向锁 UNKNOWN", () => {
    const clone = JSON.parse(JSON.stringify((schema18.examples as readonly unknown[])[0])) as {
      decisions: Record<string, unknown>[];
    };
    const d003 = clone.decisions[0] as { resolution: Record<string, unknown> };
    d003.resolution = { answer: "CHANGE" };
    expect(validateGraph(clone)).toBe(false);
    expect(graphErrors()).toContain("value");

    d003.resolution = { answer: "UNKNOWN" };
    expect(validateGraph(clone)).toBe(false);
    expect(graphErrors()).toContain("classified");

    d003.resolution = { answer: "ACCEPT", value: "SOMETHING" };
    expect(validateGraph(clone)).toBe(false);

    d003.resolution = { answer: "ACCEPT", classified: "DERIVABLE" };
    expect(validateGraph(clone)).toBe(false);
    expect(graphErrors()).toContain("answer");

    d003.resolution = { answer: "DEFER", seq: 3 };
    expect(validateGraph(clone)).toBe(true);
  });

  it("resolution.seq ≥1 整数；0/负数拒绝（零墙钟 A4：事件序靠 seq）", () => {
    const clone = JSON.parse(JSON.stringify((schema18.examples as readonly unknown[])[0])) as {
      decisions: Record<string, unknown>[];
    };
    const d003 = clone.decisions[0] as { resolution: Record<string, unknown> };
    d003.resolution = { answer: "ACCEPT", seq: 0 };
    expect(validateGraph(clone)).toBe(false);
    d003.resolution = { answer: "ACCEPT", seq: 1 };
    expect(validateGraph(clone)).toBe(true);
  });

  it("request_refs 词形 RESEARCH.REQ.<n>；词表外 id 拒绝", () => {
    const clone = JSON.parse(JSON.stringify((schema18.examples as readonly unknown[])[0])) as Record<string, unknown>;
    clone["request_refs"] = ["REQ-17"];
    expect(validateGraph(clone)).toBe(false);
  });

  it("conflict_entry：refs minItems 2（矛盾至少两方，单引用构不成冲突）", () => {
    const defs = schema18.definitions as Record<string, unknown>;
    const ajvOne = new Ajv({ strictSchema: false, allErrors: true });
    ajvOne.addSchema(schema18);
    const validateConflict = ajvOne.compile({
      $ref: `${SCHEMA_18_ID}#/definitions/conflict_entry`,
    });
    expect(validateConflict({ statement: "BP 与 Repo 冲突", refs: ["a"] })).toBe(false);
    expect(
      validateConflict({ statement: "BP 与 Repo 冲突", refs: ["BP.PAGE.X", "repo://master"] }),
    ).toBe(true);
    void defs;
  });

  it("$ref 子模式：research_request 九键形态（§9.1 转录）通过", () => {
    const request = {
      id: "RESEARCH.REQ.017",
      origin_decision_refs: ["DECISION.D017", "DECISION.D021"],
      proposition: "现有 MASTer 数据与代码中是否存在可复用的跨车型零件匹配键？",
      why_needed: "DECISION.D017 的 Recommendation 依赖跨车型匹配复杂度判断。",
      known_context_refs: ["CAPABILITY.COST_ANALYSIS", "CONTRACT.PART.IDENTITY"],
      mode: "INTERNAL",
      required_evidence: "IMPLEMENTATION",
      disconfirming_evidence_required: true,
      stop_when: [
        "已定位权威字段或明确证明不存在统一匹配键",
        "发现互相冲突的实现并形成 caveat",
      ],
      forbidden_conclusion: "Research 不得决定当前 Increment 是否包含跨车型能力。",
    };
    expect(validateRequest(request)).toBe(true);
    const missing = { ...request } as Record<string, unknown>;
    delete missing["forbidden_conclusion"];
    expect(validateRequest(missing)).toBe(false);
  });

  it("$ref 子模式：finding_link——INFERENCE 空 sources 豁免 / 非 INFERENCE 空 sources 拒 / INFERENCE×RESOLVES_FACT 互斥", () => {
    const base = {
      finding_id: "FINDING.R017.1",
      statement: "当前实现不存在统一跨车型匹配键，已有两个局部匹配策略。",
      evidence_type: "IMPLEMENTATION",
      sources: ["repo://master/data/parts"],
      caveats: ["两个策略均未被 Architecture Truth 定义为正式标准。"],
      request_refs: ["RESEARCH.REQ.017"],
      decision_refs: ["DECISION.D017"],
      relation: "RESOLVES_FACT",
      resolves_missing_facts: ["FACT.CROSS_MODEL.MATCHING_SEMANTICS"],
    };
    expect(validateFindingLink(base)).toBe(true);

    const inferenceOk = {
      ...base,
      evidence_type: "INFERENCE",
      sources: [],
      relation: "SUPPORTS_OPTION",
      resolves_missing_facts: undefined,
    };
    expect(validateFindingLink(inferenceOk)).toBe(true);

    const laundering = { ...base, evidence_type: "PRIMARY", sources: [] };
    expect(validateFindingLink(laundering)).toBe(false);

    const inferenceResolves = { ...base, evidence_type: "INFERENCE", sources: [] };
    expect(validateFindingLink(inferenceResolves)).toBe(false);

    const noDecisionRefs = {
      ...base,
      relation: "CONTRADICTS_PREMISE",
      decision_refs: [],
      resolves_missing_facts: undefined,
    };
    expect(validateFindingLink(noDecisionRefs)).toBe(false);

    // C1 封条补强：键整体缺席同样拒（then 须 required decision_refs——只写 minItems 时
    // 缺键可绕过封条，laundering_guard「CONTRADICTS_PREMISE 必须指向 ≥1 个 Decision」空转）。
    const contradictsNoKey = { ...noDecisionRefs } as Record<string, unknown>;
    delete contradictsNoKey["decision_refs"];
    expect(validateFindingLink(contradictsNoKey)).toBe(false);
    const baseNoKey = { ...base } as Record<string, unknown>;
    delete baseNoKey["decision_refs"];
    expect(validateFindingLink(baseNoKey)).toBe(false);
    // 正例对照：≥1 个 decision_refs 照常通过（封条只封空与缺席，不封合法引用；
    // 顺带剥 resolves_missing_facts——反向锁定要求其仅在 RESOLVES_FACT 时在场）。
    expect(
      validateFindingLink({
        ...base,
        relation: "CONTRADICTS_PREMISE",
        resolves_missing_facts: undefined,
      }),
    ).toBe(true);
  });

  it("$ref 子模式：research_handoff（§10.2 逐键）——缺 critical_caveat 拒", () => {
    const handoff = {
      artifact_ref: ".pomaster/discovery/scratchpads/idea-cross-model/research/",
      answered_requests: ["RESEARCH.REQ.017"],
      affected_decisions: ["DECISION.D017"],
      key_findings: [
        {
          finding_id: "FINDING.R017.1",
          statement: "当前实现不存在统一跨车型匹配键。",
          evidence_type: "IMPLEMENTATION",
          sources: ["repo://master/data/parts"],
          caveats: ["两个策略均未被 Architecture Truth 定义为正式标准。"],
          request_refs: ["RESEARCH.REQ.017"],
          decision_refs: ["DECISION.D017"],
          relation: "RESOLVES_FACT",
          resolves_missing_facts: ["FACT.CROSS_MODEL.MATCHING_SEMANTICS"],
        },
      ],
      unresolved_requests: [],
      one_line_summary: "当前实现不存在统一跨车型匹配键，已有两个局部匹配策略。",
      critical_caveat: "两个策略均未被 Architecture Truth 定义为正式标准。",
    };
    expect(validateHandoff(handoff)).toBe(true);
    const missing = JSON.parse(JSON.stringify(handoff)) as Record<string, unknown>;
    delete missing["critical_caveat"];
    expect(validateHandoff(missing)).toBe(false);
  });
});

// ============================================================
// B. buildDecisionGraph（§5.2 + fail-closed）
// ============================================================

describe("buildDecisionGraph（合法图谱与指纹自动维护）", () => {
  it("合法图谱：D017 构图成功，resolution 全 OPEN，fingerprint 为 sha256 词形", () => {
    const outcome = buildDecisionGraph([candidateD017()]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.graph.decisions).toHaveLength(1);
      expect(outcome.graph.decisions[0]?.resolution).toBeNull();
      expect(outcome.graph.graph_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(outcome.notes.join()).toContain("frontier");
      expect(outcome.notes.join()).toContain("State Axis");
    }
  });

  it("纯函数：同输入重放深度相等（graph_fingerprint 字节稳定）", () => {
    const a = buildDecisionGraph([candidateD017()]);
    const b = buildDecisionGraph([candidateD017()]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(canonicalJson(a.graph)).toBe(canonicalJson(b.graph));
    }
  });

  it("指纹内容敏感：prompt 变化 → fingerprint 变化（同投影指纹下）", () => {
    const a = buildDecisionGraph([candidateD017()]);
    const b = buildDecisionGraph([
      candidateD017({ prompt: "当前 Increment 是否包含跨车型成本比较？（改）" }),
    ]);
    if (a.ok && b.ok) {
      expect(a.graph.graph_fingerprint).not.toBe(b.graph.graph_fingerprint);
    }
  });

  it("projectionFingerprint 存入 graph 且参与指纹（§4.3 P0.5 只存）；坏词形显式拒绝", () => {
    const withFp = buildDecisionGraph([candidateD017()], { projectionFingerprint: FP });
    const withoutFp = buildDecisionGraph([candidateD017()]);
    expect(withFp.ok && withoutFp.ok).toBe(true);
    if (withFp.ok && withoutFp.ok) {
      expect(withFp.graph.projection_fingerprint).toBe(FP);
      expect(withFp.graph.graph_fingerprint).not.toBe(withoutFp.graph.graph_fingerprint);
    }
    const bad = buildDecisionGraph([candidateD017()], { projectionFingerprint: "sha256:xyz" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("fingerprint_invalid");
  });

  it("空候选 → empty_candidates（图至少一个 Decision）", () => {
    const outcome = buildDecisionGraph([]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("empty_candidates");
  });
});

describe("buildDecisionGraph（词形与词表 fail-closed）", () => {
  it("重复 decision_id → duplicate_decision_id", () => {
    const outcome = buildDecisionGraph([candidateD017(), candidateD017()]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("duplicate_decision_id");
  });

  it("decision_id 词形非法（小写前缀 / 缺前缀）→ decision_id_invalid", () => {
    for (const id of ["decision.D017", "D017", "DECISION.D017X ", "DECISION.d017"]) {
      const outcome = buildDecisionGraph([candidateD017({ decision_id: id })]);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason).toBe("decision_id_invalid");
    }
  });

  it("禁词负例：DECISION.GRILLED / class GRILLING / option GRILL_CONFIRMED → forbidden_wordform（§1.1）", () => {
    const idBad = buildDecisionGraph([candidateD017({ decision_id: "DECISION.GRILLED" })]);
    expect(idBad.ok).toBe(false);
    if (!idBad.ok) expect(idBad.reason).toBe("forbidden_wordform");

    const classBad = buildDecisionGraph([candidateD017({ class: "GRILLING" })]);
    expect(classBad.ok).toBe(false);
    if (!classBad.ok) expect(classBad.reason).toBe("forbidden_wordform");

    const optionBad = buildDecisionGraph([
      candidateD017({ options: ["INCLUDE_CURRENT_INCREMENT", "GRILL_CONFIRMED"] }),
    ]);
    expect(optionBad.ok).toBe(false);
    if (!optionBad.ok) {
      expect(optionBad.reason).toBe("forbidden_wordform");
      expect(optionBad.details.join()).toContain("GRILL_CONFIRMED");
    }
  });

  it("class 词表外（BEHAVIOR）→ class_unknown（裁决9②：SCOPE 单值起步，禁止私扩）", () => {
    const outcome = buildDecisionGraph([candidateD017({ class: "BEHAVIOR" })]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("class_unknown");
      expect(outcome.details.join()).toContain("词汇表 PR");
    }
    expect(DECISION_CLASS_VALUES).toEqual(["SCOPE"]);
  });

  it("自环与双节点环 → dependency_cycle；悬空 depends_on → depends_on_dangling", () => {
    const selfLoop = buildDecisionGraph([candidateD017({ depends_on: ["DECISION.D017"] })]);
    expect(selfLoop.ok).toBe(false);
    if (!selfLoop.ok) expect(selfLoop.reason).toBe("dependency_cycle");

    const twoCycle = buildDecisionGraph([
      candidateD017({ decision_id: "DECISION.D001", depends_on: ["DECISION.D002"] }),
      candidateD017({ decision_id: "DECISION.D002", depends_on: ["DECISION.D001"] }),
    ]);
    expect(twoCycle.ok).toBe(false);
    if (!twoCycle.ok) expect(twoCycle.reason).toBe("dependency_cycle");

    const dangling = buildDecisionGraph([candidateD017({ depends_on: ["DECISION.D999"] })]);
    expect(dangling.ok).toBe(false);
    if (!dangling.ok) {
      expect(dangling.reason).toBe("depends_on_dangling");
      expect(dangling.details.join()).toContain("DECISION.D999");
    }
  });

  it("prompt 空 / options 空 / option 重复 → 显式拒绝", () => {
    const noPrompt = buildDecisionGraph([candidateD017({ prompt: "   " })]);
    expect(noPrompt.ok).toBe(false);
    if (!noPrompt.ok) expect(noPrompt.reason).toBe("prompt_empty");

    const noOptions = buildDecisionGraph([candidateD017({ options: [] })]);
    expect(noOptions.ok).toBe(false);
    if (!noOptions.ok) expect(noOptions.reason).toBe("options_invalid");

    const dupOptions = buildDecisionGraph([
      candidateD017({ options: ["DEFER", "DEFER"] }),
    ]);
    expect(dupOptions.ok).toBe(false);
    if (!dupOptions.ok) expect(dupOptions.reason).toBe("options_invalid");
  });
});

describe("buildDecisionGraph（反幻觉形态 + grounding 词形）", () => {
  it("§12.1：recommendation.option 不在 options / basis_refs 空 / basis 引用缺失事实 → recommendation_invalid", () => {
    const badOption = buildDecisionGraph([
      candidateD017({ recommendation: recBase({ option: "NOT_AN_OPTION" }) }),
    ]);
    expect(badOption.ok).toBe(false);
    if (!badOption.ok) expect(badOption.reason).toBe("recommendation_invalid");

    const noBasis = buildDecisionGraph([
      candidateD017({ recommendation: recBase({ basis_refs: [] }) }),
    ]);
    expect(noBasis.ok).toBe(false);
    if (!noBasis.ok) {
      expect(noBasis.reason).toBe("recommendation_invalid");
      expect(noBasis.details.join()).toContain("basis_refs");
    }

    const launderedBasis = buildDecisionGraph([
      candidateD017({
        recommendation: recBase({ basis_refs: ["FACT.CROSS_MODEL.MATCHING_SEMANTICS"] }),
      }),
    ]);
    expect(launderedBasis.ok).toBe(false);
    if (!launderedBasis.ok) {
      expect(launderedBasis.reason).toBe("recommendation_invalid");
      expect(launderedBasis.details.join()).toContain("缺失事实");
    }
  });

  it("§12.2：tradeoff / uncertainty / rationale 空，source 词表外 → recommendation_invalid", () => {
    const noTradeoff = buildDecisionGraph([
      candidateD017({ recommendation: recBase({ tradeoff: " " }) }),
    ]);
    expect(noTradeoff.ok).toBe(false);
    if (!noTradeoff.ok) expect(noTradeoff.reason).toBe("recommendation_invalid");

    const noUncertainty = buildDecisionGraph([
      candidateD017({ recommendation: recBase({ uncertainty: "" }) }),
    ]);
    expect(noUncertainty.ok).toBe(false);

    const badSource = buildDecisionGraph([
      candidateD017({
        recommendation: recBase({ source: "GUT_FEELING" as "INFERENCE" }),
      }),
    ]);
    expect(badSource.ok).toBe(false);
    if (!badSource.ok) expect(badSource.details.join()).toContain("INFERENCE");
    expect(RECOMMENDATION_SOURCE_VALUES).toEqual(["PROJECT_GROUNDED", "INFERENCE"]);
  });

  it("authority.owner 词形（SCREAMING_SNAKE 对齐 owner_registry）：空/小写 → authority_invalid", () => {
    const empty = buildDecisionGraph([candidateD017({ authority: { owner: "" } })]);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe("authority_invalid");
    const lower = buildDecisionGraph([candidateD017({ authority: { owner: "product_owner" } })]);
    expect(lower.ok).toBe(false);
    if (!lower.ok) expect(lower.reason).toBe("authority_invalid");
  });

  it("grounding 词形：missing_facts 非 FACT.* / intent_refs 非 DISCOVERY.INTENT.* / conflicts 单方引用 → grounding_invalid", () => {
    const badFact = buildDecisionGraph([
      candidateD017({
        grounding: groundingBase({ missing_facts: ["MISSING-THING"] }),
      }),
    ]);
    expect(badFact.ok).toBe(false);
    if (!badFact.ok) expect(badFact.reason).toBe("grounding_invalid");

    const badIntent = buildDecisionGraph([
      candidateD017({ grounding: groundingBase({ intent_refs: ["INTENT.1"] }) }),
    ]);
    expect(badIntent.ok).toBe(false);
    if (!badIntent.ok) expect(badIntent.reason).toBe("grounding_invalid");

    const loneConflict = buildDecisionGraph([
      candidateD017({
        grounding: groundingBase({
          conflicts: [{ statement: "BP 与 Repo 冲突", refs: ["BP.PAGE.X"] }],
        }),
      }),
    ]);
    expect(loneConflict.ok).toBe(false);
    if (!loneConflict.ok) {
      expect(loneConflict.reason).toBe("grounding_invalid");
      expect(loneConflict.details.join()).toContain("§12.3");
    }
  });

  it("候选携带 resolution → resolution_not_allowed_at_build（build 产物全 OPEN）", () => {
    const smuggled = candidateD017() as DecisionNodeCandidate & { resolution: unknown };
    smuggled.resolution = { answer: "ACCEPT" };
    const outcome = buildDecisionGraph([smuggled]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("resolution_not_allowed_at_build");
  });

  it("request_refs 同步标记：合法 RESEARCH.REQ.* 放行；词表外 → request_ref_invalid", () => {
    const ok = buildDecisionGraph([candidateD017()], { requestRefs: ["RESEARCH.REQ.017"] });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.graph.request_refs).toEqual(["RESEARCH.REQ.017"]);
      expect(RESEARCH_REQUEST_ID_PATTERN.test("RESEARCH.REQ.017")).toBe(true);
    }
    const bad = buildDecisionGraph([candidateD017()], { requestRefs: ["REQ.017"] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("request_ref_invalid");
  });
});

// ============================================================
// C. computeDecisionFrontier（§7.3 三步示例 + 保守排除）
// ============================================================

describe("computeDecisionFrontier（§7.3：动态计算零持久化）", () => {
  /** PRD §7.3 示例逐字：D1 → {D2,D3}；D2 → {D4,D5}。 */
  function chainGraph(): DecisionGraph {
    return buildOk([
      chainCand("DECISION.D1", []),
      chainCand("DECISION.D2", ["DECISION.D1"]),
      chainCand("DECISION.D3", ["DECISION.D1"]),
      chainCand("DECISION.D4", ["DECISION.D2"]),
      chainCand("DECISION.D5", ["DECISION.D2"]),
    ]);
  }

  it("初始：Frontier = [D1]（其余 waiting）", () => {
    const outcome = computeDecisionFrontier(chainGraph());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.report.frontier).toEqual(["DECISION.D1"]);
      expect(outcome.report.waiting).toEqual([
        "DECISION.D2",
        "DECISION.D3",
        "DECISION.D4",
        "DECISION.D5",
      ]);
      expect(outcome.report.waitingReasons["DECISION.D2"]).toEqual(["DECISION.D1"]);
    }
  });

  it("D1 解决后：Frontier = [D2, D3]（PRD §7.3 第二拍逐字）", () => {
    const graph = chainGraph();
    const resolved = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "ACCEPT",
      seq: 1,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const outcome = computeDecisionFrontier(resolved.graph);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.report.frontier).toEqual(["DECISION.D2", "DECISION.D3"]);
      expect(outcome.report.resolved).toEqual(["DECISION.D1"]);
    }
  });

  it("D2 解决后：Frontier = [D3, D4, D5]（PRD §7.3 第三拍逐字）；CHANGE 同样满足 prerequisites", () => {
    let graph = chainGraph();
    const r1 = resolveDecision(graph, { decisionId: "DECISION.D1", answer: "ACCEPT", seq: 1 });
    if (!r1.ok) throw new Error("fixture resolve D1 失败");
    graph = r1.graph;
    const r2 = resolveDecision(graph, {
      decisionId: "DECISION.D2",
      answer: "CHANGE",
      value: "GO_WITH_RETRY",
      seq: 2,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const outcome = computeDecisionFrontier(r2.graph);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.report.frontier).toEqual(["DECISION.D3", "DECISION.D4", "DECISION.D5"]);
    }
  });

  it("上游 DEFER/UNKNOWN → 下游保守排除出 frontier（waitingReasons 指明未满足依赖）", () => {
    const graph = chainGraph();
    const defer = resolveDecision(graph, { decisionId: "DECISION.D1", answer: "DEFER" });
    if (!defer.ok) throw new Error("fixture defer 失败");
    const afterDefer = computeDecisionFrontier(defer.graph);
    expect(afterDefer.ok).toBe(true);
    if (afterDefer.ok) {
      expect(afterDefer.report.frontier).toEqual([]);
      expect(afterDefer.report.deferred).toEqual(["DECISION.D1"]);
      expect(afterDefer.report.waiting).toEqual(["DECISION.D2", "DECISION.D3", "DECISION.D4", "DECISION.D5"]);
    }
    const rebuilt = chainGraph();
    const unknown = resolveDecision(rebuilt, {
      decisionId: "DECISION.D1",
      answer: "UNKNOWN",
      unknownTriage: {
        can_derive: false,
        can_research: false,
        can_safely_assume: false,
        can_defer: false,
        can_prototype_observe: false,
        blocks_current_increment: true,
      },
    });
    if (!unknown.ok) throw new Error("fixture unknown 失败");
    const afterUnknown = computeDecisionFrontier(unknown.graph);
    if (afterUnknown.ok) {
      expect(afterUnknown.report.frontier).toEqual([]);
      expect(afterUnknown.report.unknown).toEqual(["DECISION.D1"]);
    }
  });

  it("空图（手搓）→ frontier []；悬空/环手搓图显式拒绝（防御非 build 产物）", () => {
    const empty: DecisionGraph = { graph_fingerprint: FP, decisions: [], request_refs: [] };
    const emptyOutcome = computeDecisionFrontier(empty);
    expect(emptyOutcome.ok).toBe(true);
    if (emptyOutcome.ok) expect(emptyOutcome.report.frontier).toEqual([]);

    const dangling: DecisionGraph = {
      graph_fingerprint: FP,
      decisions: [
        {
          ...chainCand("DECISION.D1", ["DECISION.GHOST"]),
          class: "SCOPE",
          resolution: null,
        },
      ],
      request_refs: [],
    };
    const danglingOutcome = computeDecisionFrontier(dangling);
    expect(danglingOutcome.ok).toBe(false);
    if (!danglingOutcome.ok) expect(danglingOutcome.reason).toBe("dangling_dependency");

    const cycled: DecisionGraph = {
      graph_fingerprint: FP,
      decisions: [
        { ...chainCand("DECISION.D1", ["DECISION.D2"]), class: "SCOPE", resolution: null },
        { ...chainCand("DECISION.D2", ["DECISION.D1"]), class: "SCOPE", resolution: null },
      ],
      request_refs: [],
    };
    const cycledOutcome = computeDecisionFrontier(cycled);
    expect(cycledOutcome.ok).toBe(false);
    if (!cycledOutcome.ok) expect(cycledOutcome.reason).toBe("dependency_cycle");
  });

  it("纯函数：frontier 报告重放深度相等（零持久化——无文件副产物可断言）", () => {
    const a = computeDecisionFrontier(chainGraph());
    const b = computeDecisionFrontier(chainGraph());
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(canonicalJson(a.report)).toBe(canonicalJson(b.report));
    }
  });
});

// ============================================================
// D. evaluateDecisionGrounding（G1-G8 + 五值 verdict + 反幻觉三规则）
// ============================================================

describe("evaluateDecisionGrounding（五值判定矩阵）", () => {
  it("全过基线：READY_FOR_DECISION + G1-G8 全绿 + failedCheck=null（无缺失事实的已消化的节点）", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const outcome = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: RETRIEVED,
    });
    expect(outcome.verdict).toBe("READY_FOR_DECISION");
    expect(outcome.failedCheck).toBeNull();
    expect(outcome.checks).toHaveLength(8);
    expect(outcome.checks.every((c) => c.passed)).toBe(true);
  });

  it("G1 Intent Anchor：intent_refs 空 → INSUFFICIENT_GROUNDING failedCheck=G1", () => {
    const outcome = buildDecisionGraph([
      candidateD017({ grounding: groundingBase({ intent_refs: [] }) }),
    ]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const gate = evaluateDecisionGrounding({
      node: gateReadyNode(outcome.graph),
      graph: outcome.graph,
      retrievedSurfaces: RETRIEVED,
    });
    expect(gate.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(gate.failedCheck).toBe("G1");
  });

  it("G2 Existing Reality：未检索任何现实面 → INSUFFICIENT（G2）；Knowledge 不算检索面（§83.2 ADVISORY 永不进 gate）", () => {
    const graph = buildOk([candidateD017()]);
    const none = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: [],
    });
    expect(none.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(none.failedCheck).toBe("G2");

    const knowledgeOnly = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: ["KNOWLEDGE" as GroundingSurfaceValue],
    });
    expect(knowledgeOnly.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(knowledgeOnly.failedCheck).toBe("G2");
    expect(GROUNDING_SURFACE_VALUES).toEqual(["CURRENT_TRUTH", "DOCS", "REPO", "EVIDENCE"]);
  });

  it("G3 Dependency Integrity：节点不在图内 / 悬空依赖 / 环 → G3 fail；OPEN 前置是合法显式状态（G3 pass）", () => {
    const graph = buildOk([candidateD017()]);
    const orphan = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph: { ...graph, decisions: [] },
      retrievedSurfaces: RETRIEVED,
    });
    expect(orphan.failedCheck).toBe("G3");

    const danglingGraph: DecisionGraph = {
      ...graph,
      decisions: [{ ...gateReadyNode(graph), depends_on: ["DECISION.GHOST"] }],
    };
    const dangling = evaluateDecisionGrounding({
      node: danglingGraph.decisions[0] as DecisionGraph["decisions"][number],
      graph: danglingGraph,
      retrievedSurfaces: RETRIEVED,
    });
    expect(dangling.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(dangling.failedCheck).toBe("G3");

    const chain = buildOk([
      chainCand("DECISION.D1", []),
      chainCand("DECISION.D2", ["DECISION.D1"]),
    ]);
    const openDep = evaluateDecisionGrounding({
      node: chain.decisions[1] as DecisionGraph["decisions"][number],
      graph: chain,
      retrievedSurfaces: RETRIEVED,
    });
    const g3 = openDep.checks.find((c) => c.check === "G3");
    expect(g3?.passed).toBe(true);
    expect(g3?.detail).toContain("OPEN");
  });

  it("G4 Factual Premise Integrity（纵深防御）：手搓节点 basis_refs 空 / 引用缺失事实 → INSUFFICIENT（G4）", () => {
    const graph = buildOk([candidateD017()]);
    const noBasis: DecisionGraph = {
      ...graph,
      decisions: [
        {
          ...gateReadyNode(graph),
          recommendation: recBase({ basis_refs: [] }),
        },
      ],
    };
    const gate = evaluateDecisionGrounding({
      node: noBasis.decisions[0] as DecisionGraph["decisions"][number],
      graph: noBasis,
      retrievedSurfaces: RETRIEVED,
    });
    expect(gate.failedCheck).toBe("G4");

    const laundered: DecisionGraph = {
      ...graph,
      decisions: [
        {
          ...gateReadyNode(graph),
          recommendation: recBase({ basis_refs: ["FACT.CROSS_MODEL.MATCHING_SEMANTICS"] }),
        },
      ],
    };
    const gate2 = evaluateDecisionGrounding({
      node: laundered.decisions[0] as DecisionGraph["decisions"][number],
      graph: laundered,
      retrievedSurfaces: RETRIEVED,
    });
    expect(gate2.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(gate2.failedCheck).toBe("G4");
    expect(gate2.checks.find((c) => c.check === "G4")?.detail).toContain("缺失事实");
  });

  it("G7 Recommendation Traceability：无推荐 / tradeoff 或 uncertainty 空 → INSUFFICIENT（无推荐不许问人）", () => {
    const graph = buildOk([candidateD017()]);
    const noRec: DecisionGraph = {
      ...graph,
      decisions: [{ ...gateReadyNode(graph), recommendation: null }],
    };
    const gate = evaluateDecisionGrounding({
      node: noRec.decisions[0] as DecisionGraph["decisions"][number],
      graph: noRec,
      retrievedSurfaces: RETRIEVED,
    });
    expect(gate.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(gate.failedCheck).toBe("G7");

    const noTradeoff: DecisionGraph = {
      ...graph,
      decisions: [{ ...gateReadyNode(graph), recommendation: recBase({ tradeoff: "" }) }],
    };
    const gate2 = evaluateDecisionGrounding({
      node: noTradeoff.decisions[0] as DecisionGraph["decisions"][number],
      graph: noTradeoff,
      retrievedSurfaces: RETRIEVED,
    });
    expect(gate2.failedCheck).toBe("G7");
    expect(gate2.checks.find((c) => c.check === "G7")?.detail).toContain("tradeoff");
  });

  it("§12.2 INFERENCE 披露位：source=INFERENCE 可 READY，但 notes 必须显式披露（不冒充项目事实）", () => {
    const outcome = buildDecisionGraph([
      chainCand("DECISION.D1", [], {
        recommendation: recBase({
          option: "GO",
          source: "INFERENCE",
          basis_refs: ["CAPABILITY.COST_ANALYSIS"],
        }),
      }),
    ]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const gate = evaluateDecisionGrounding({
      node: gateReadyNode(outcome.graph),
      graph: outcome.graph,
      retrievedSurfaces: RETRIEVED,
    });
    expect(gate.verdict).toBe("READY_FOR_DECISION");
    expect(gate.notes.join()).toContain("INFERENCE");
  });

  it("G5 Conflict Visibility：conflicts 非空 → CONFLICT_REVIEW（禁自行挑答案 + 治理面路标）；优先于 G6 路由", () => {
    const graph = buildOk([
      candidateD017({
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
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: RETRIEVED,
      missingFactRouting: { "FACT.CROSS_MODEL.MATCHING_SEMANTICS": "RESEARCHABLE" },
    });
    expect(gate.verdict).toBe("CONFLICT_REVIEW");
    expect(gate.failedCheck).toBe("G5");
    expect(gate.notes.join()).toContain("治理面");
  });

  it("verdict 优先序：G1 失败压过 G5（grounding 太薄时冲突审查无从谈起）", () => {
    const graph = buildOk([
      candidateD017({
        grounding: groundingBase({
          intent_refs: [],
          conflicts: [
            { statement: "BP 与 Repo 冲突", refs: ["BP.PAGE.X", "repo://master"] },
          ],
        }),
      }),
    ]);
    const gate = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: RETRIEVED,
    });
    expect(gate.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(gate.failedCheck).toBe("G1");
  });

  it("G6 Missing Fact Routing：未路由 / 路由越界 / 非法路由词形 → INSUFFICIENT（G6）", () => {
    const graph = buildOk([candidateD017()]);
    const unrouted = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: RETRIEVED,
    });
    expect(unrouted.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(unrouted.failedCheck).toBe("G6");
    expect(unrouted.checks.find((c) => c.check === "G6")?.detail).toContain("未路由");

    const overreach = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: RETRIEVED,
      missingFactRouting: {
        "FACT.CROSS_MODEL.MATCHING_SEMANTICS": "DERIVABLE",
        "FACT.NOT.REGISTERED": "RESEARCHABLE",
      },
    });
    expect(overreach.failedCheck).toBe("G6");
    expect(overreach.checks.find((c) => c.check === "G6")?.detail).toContain("越界");

    const badWordform = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: RETRIEVED,
      missingFactRouting: {
        "FACT.CROSS_MODEL.MATCHING_SEMANTICS": "ASK_HUMAN" as unknown as MissingFactRouteValue,
      },
    });
    expect(badWordform.failedCheck).toBe("G6");
    expect(badWordform.checks.find((c) => c.check === "G6")?.detail).toContain(
      "DERIVABLE/RESEARCHABLE",
    );
    expect(MISSING_FACT_ROUTE_VALUES).toEqual(["DERIVABLE", "RESEARCHABLE"]);
  });

  it("G6 路由 → NEEDS_DERIVATION（全 DERIVABLE）/ NEEDS_RESEARCH（任一 RESEARCHABLE + 路标）/ 混合 → NEEDS_RESEARCH", () => {
    const graph = buildOk([candidateD017()]);
    const derivable = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: RETRIEVED,
      missingFactRouting: { "FACT.CROSS_MODEL.MATCHING_SEMANTICS": "DERIVABLE" },
    });
    expect(derivable.verdict).toBe("NEEDS_DERIVATION");

    const researchable = evaluateDecisionGrounding({
      node: gateReadyNode(graph),
      graph,
      retrievedSurfaces: RETRIEVED,
      missingFactRouting: { "FACT.CROSS_MODEL.MATCHING_SEMANTICS": "RESEARCHABLE" },
    });
    expect(researchable.verdict).toBe("NEEDS_RESEARCH");
    expect(researchable.notes.join()).toContain("createResearchRequest");

    // 混合路由需要节点确实登记两个缺失事实（路由越界会被 G6 拒——对账纪律）。
    const twoFacts = buildOk([
      candidateD017({
        grounding: groundingBase({
          missing_facts: ["FACT.CROSS_MODEL.MATCHING_SEMANTICS", "FACT.SECOND.GAP"],
        }),
      }),
    ]);
    const mixed = evaluateDecisionGrounding({
      node: gateReadyNode(twoFacts),
      graph: twoFacts,
      retrievedSurfaces: RETRIEVED,
      missingFactRouting: {
        "FACT.CROSS_MODEL.MATCHING_SEMANTICS": "RESEARCHABLE",
        "FACT.SECOND.GAP": "DERIVABLE",
      },
    });
    expect(mixed.verdict).toBe("NEEDS_RESEARCH");
  });

  it("G8 Authority Resolution：owner 缺失 → INSUFFICIENT（G8）；checks 恒为 8 条（全量可审计）", () => {
    // build 已拒空 owner——G8 的 gate 级防御用手搓节点覆盖（纵深防御第二层）。
    const handcrafted: DecisionGraph = {
      graph_fingerprint: FP,
      decisions: [
        {
          ...candidateD017(),
          class: "SCOPE",
          grounding: groundingBase(),
          authority: { owner: "" },
          resolution: null,
        },
      ],
      request_refs: [],
    };
    const gate = evaluateDecisionGrounding({
      node: handcrafted.decisions[0] as DecisionGraph["decisions"][number],
      graph: handcrafted,
      retrievedSurfaces: RETRIEVED,
    });
    expect(gate.verdict).toBe("INSUFFICIENT_GROUNDING");
    expect(gate.failedCheck).toBe("G8");
    expect(gate.checks).toHaveLength(8);
  });

  it("词表冻结：verdict 五值闭包（§6.2 逐字）", () => {
    expect(GROUNDING_VERDICT_VALUES).toEqual([
      "READY_FOR_DECISION",
      "NEEDS_DERIVATION",
      "NEEDS_RESEARCH",
      "CONFLICT_REVIEW",
      "INSUFFICIENT_GROUNDING",
    ]);
  });
});

// ============================================================
// E. createResearchRequest（§9.1 / §9.3 / §9.4）
// ============================================================

describe("createResearchRequest（精确请求 + mode 零缺省）", () => {
  const draft = {
    origin_decision_refs: ["DECISION.D017"],
    proposition: "现有 MASTer 数据与代码中是否存在可复用的跨车型零件匹配键？",
    why_needed: "DECISION.D017 的 Recommendation 依赖跨车型匹配复杂度判断。",
    known_context_refs: ["CAPABILITY.COST_ANALYSIS"],
    mode: "INTERNAL" as const,
    required_evidence: "IMPLEMENTATION" as const,
    disconfirming_evidence_required: true,
    stop_when: [
      "已定位权威字段或明确证明不存在统一匹配键",
      "发现互相冲突的实现并形成 caveat",
    ],
    forbidden_conclusion: "Research 不得决定当前 Increment 是否包含跨车型能力。",
  };

  it("§9.1 转录 + id 派生：nextSeq=17 → RESEARCH.REQ.17；notes 携带证伪纪律与 Gate 前两条", () => {
    const outcome = createResearchRequest({ request: draft, nextSeq: 17 });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.request.id).toBe("RESEARCH.REQ.17");
      expect(outcome.request.mode).toBe("INTERNAL");
      expect(outcome.notes.join()).toContain("证伪");
      expect(outcome.notes.join()).toContain("NEEDS_RESEARCH");
    }
  });

  it("mode：显式 mode 优先；§9.3 路由表六向（gap → mode）；两者皆缺 → mode_unresolvable（不默认 MIXED）", () => {
    const explicit = createResearchRequest({
      request: { ...draft, mode: "FORENSIC" },
      nextSeq: 1,
      gapKind: "CURRENT_REALITY",
    });
    expect(explicit.ok).toBe(true);
    if (explicit.ok) expect(explicit.request.mode).toBe("FORENSIC");

    for (const [gap, mode] of Object.entries(RESEARCH_MODE_ROUTE_HINTS)) {
      const routed = createResearchRequest({
        request: { ...draft, mode: undefined },
        nextSeq: 1,
        gapKind: gap as keyof typeof RESEARCH_MODE_ROUTE_HINTS,
      });
      expect(routed.ok).toBe(true);
      if (routed.ok) expect(routed.request.mode).toBe(mode);
    }

    const unresolvable = createResearchRequest({ request: { ...draft, mode: undefined }, nextSeq: 1 });
    expect(unresolvable.ok).toBe(false);
    if (!unresolvable.ok) {
      expect(unresolvable.reason).toBe("mode_unresolvable");
      expect(unresolvable.details.join()).toContain("MIXED");
    }
  });

  it("词表外 fail-closed：mode / required_evidence 词表外显式拒绝（复用既有轴）", () => {
    const badMode = createResearchRequest({
      request: { ...draft, mode: "OMNISCIENT" as "INTERNAL" },
      nextSeq: 1,
    });
    expect(badMode.ok).toBe(false);
    if (!badMode.ok) expect(badMode.reason).toBe("mode_unknown");

    const badEvidence = createResearchRequest({
      request: { ...draft, required_evidence: "VIBES" as "IMPLEMENTATION" },
      nextSeq: 1,
    });
    expect(badEvidence.ok).toBe(false);
    if (!badEvidence.ok) expect(badEvidence.reason).toBe("required_evidence_unknown");
  });

  it("锚定纪律：origin_decision_refs 空 / 词形坏 / 重复 → origin_decision_ref_invalid", () => {
    const empty = createResearchRequest({
      request: { ...draft, origin_decision_refs: [] },
      nextSeq: 1,
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe("origin_decision_ref_invalid");

    const badShape = createResearchRequest({
      request: { ...draft, origin_decision_refs: ["D017"] },
      nextSeq: 1,
    });
    expect(badShape.ok).toBe(false);
    if (!badShape.ok) expect(badShape.reason).toBe("origin_decision_ref_invalid");

    const duplicated = createResearchRequest({
      request: { ...draft, origin_decision_refs: ["DECISION.D017", "DECISION.D017"] },
      nextSeq: 1,
    });
    expect(duplicated.ok).toBe(false);
  });

  it("形态必填：proposition / why_needed / stop_when / forbidden_conclusion 缺失或空 → 显式拒绝；显式 id 词形坏 → id_invalid；seq 非法 → seq_invalid", () => {
    const noProp = createResearchRequest({ request: { ...draft, proposition: " " }, nextSeq: 1 });
    expect(noProp.ok).toBe(false);
    if (!noProp.ok) expect(noProp.reason).toBe("proposition_empty");

    const noWhy = createResearchRequest({ request: { ...draft, why_needed: "" }, nextSeq: 1 });
    expect(noWhy.ok).toBe(false);
    if (!noWhy.ok) expect(noWhy.reason).toBe("why_needed_empty");

    const noStop = createResearchRequest({ request: { ...draft, stop_when: [] }, nextSeq: 1 });
    expect(noStop.ok).toBe(false);
    if (!noStop.ok) expect(noStop.reason).toBe("stop_when_empty");

    const noForbidden = createResearchRequest({
      request: { ...draft, forbidden_conclusion: "" },
      nextSeq: 1,
    });
    expect(noForbidden.ok).toBe(false);
    if (!noForbidden.ok) expect(noForbidden.reason).toBe("forbidden_conclusion_empty");

    const badId = createResearchRequest({
      request: { ...draft, id: "REQ-017" },
      nextSeq: 1,
    });
    expect(badId.ok).toBe(false);
    if (!badId.ok) expect(badId.reason).toBe("id_invalid");

    const badSeq = createResearchRequest({ request: draft, nextSeq: 0 });
    expect(badSeq.ok).toBe(false);
    if (!badSeq.ok) expect(badSeq.reason).toBe("seq_invalid");
  });

  it("disconfirming_evidence_required=false 合法但 notes 显式提示（§9.2 证伪纪律）", () => {
    const outcome = createResearchRequest({
      request: { ...draft, disconfirming_evidence_required: false },
      nextSeq: 3,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.request.id).toBe("RESEARCH.REQ.3");
      expect(outcome.notes.join()).toContain("false");
    }
  });
});

// ============================================================
// F. applyResearchHandoff（§10.2 回填 + §12.4 防洗白 + 幂等）
// ============================================================

describe("applyResearchHandoff（回填矩阵 + 幂等重放）", () => {
  const FACT = "FACT.CROSS_MODEL.MATCHING_SEMANTICS";

  function graphWithRequest(): DecisionGraph {
    return buildOk(
      [
        chainCand("DECISION.D003", []),
        candidateD017({ depends_on: ["DECISION.D003"] }),
      ],
      ["RESEARCH.REQ.017"],
    );
  }

  function handoffBase(findings: readonly HandoffFinding[]): ResearchHandoffInput {
    return {
      artifact_ref: ".pomaster/discovery/scratchpads/idea-cross-model/research/",
      answered_requests: ["RESEARCH.REQ.017"],
      affected_decisions: ["DECISION.D017"],
      key_findings: [...findings],
      unresolved_requests: [],
      one_line_summary: "当前实现不存在统一跨车型匹配键，已有两个局部匹配策略。",
      critical_caveat: "两个策略均未被 Architecture Truth 定义为正式标准。",
    };
  }

  const resolvesFinding: HandoffFinding = {
    finding_id: "FINDING.R017.1",
    statement: "当前实现不存在统一跨车型匹配键，已有两个局部匹配策略。",
    evidence_type: "IMPLEMENTATION",
    sources: ["repo://master/data/parts"],
    caveats: ["两个策略均未被 Architecture Truth 定义为正式标准。"],
    request_refs: ["RESEARCH.REQ.017"],
    decision_refs: ["DECISION.D017"],
    relation: "RESOLVES_FACT",
    resolves_missing_facts: [FACT],
  };

  it("RESOLVES_FACT 回填：missing_facts 消解 + research_finding_refs 增量 + changed=true", () => {
    const graph = graphWithRequest();
    const outcome = applyResearchHandoff(graph, handoffBase([resolvesFinding]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.changed).toBe(true);
    const d017 = outcome.graph.decisions.find((n) => n.decision_id === "DECISION.D017");
    expect(d017?.grounding.missing_facts).toEqual([]);
    expect(d017?.grounding.research_finding_refs).toContain("FINDING.R017.1");
    expect(outcome.notes.join()).toContain(FACT);
  });

  it("幂等：同 handoff 重放 → changed=false 且图深度一致（NO_CHANGE，对齐 brainstorm 纪律）", () => {
    const graph = graphWithRequest();
    const first = applyResearchHandoff(graph, handoffBase([resolvesFinding]));
    expect(first.ok && first.changed).toBe(true);
    if (!first.ok) return;
    const replay = applyResearchHandoff(first.graph, handoffBase([resolvesFinding]));
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.changed).toBe(false);
      expect(canonicalJson(replay.graph)).toBe(canonicalJson(first.graph));
    }
  });

  it("CONTRADICTS_PREMISE → conflicts 追加 → 下一轮 G-Gate 判 CONFLICT_REVIEW（§12.3 跨函数闭环）", () => {
    const graph = graphWithRequest();
    const finding: HandoffFinding = {
      finding_id: "FINDING.R017.2",
      statement: "Repo 中存在第三种匹配策略，与 BP 宣称的两种不符。",
      evidence_type: "IMPLEMENTATION",
      sources: ["repo://master/matching/legacy"],
      caveats: ["legacy 策略无文档。"],
      request_refs: ["RESEARCH.REQ.017"],
      decision_refs: ["DECISION.D017"],
      relation: "CONTRADICTS_PREMISE",
    };
    const outcome = applyResearchHandoff(graph, handoffBase([finding]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const d017 = outcome.graph.decisions.find((n) => n.decision_id === "DECISION.D017");
    expect(d017?.grounding.conflicts).toHaveLength(1);
    const gate = evaluateDecisionGrounding({
      node: d017 as NonNullable<typeof d017>,
      graph: outcome.graph,
      retrievedSurfaces: RETRIEVED,
      missingFactRouting: { [FACT]: "RESEARCHABLE" },
    });
    expect(gate.verdict).toBe("CONFLICT_REVIEW");
  });

  it("INSUFFICIENT_EVIDENCE：finding ref 留痕 + notes 携带 caveat + 节点保持 NEEDS_RESEARCH（缺事实未消解）", () => {
    const graph = graphWithRequest();
    const finding: HandoffFinding = {
      finding_id: "FINDING.R017.3",
      statement: "匹配键证据不足，无法证实亦无法证伪。",
      evidence_type: "SECONDARY",
      sources: ["https://forum.example/thread/1"],
      caveats: ["仅有社区讨论，无权威来源。"],
      request_refs: ["RESEARCH.REQ.017"],
      decision_refs: ["DECISION.D017"],
      relation: "INSUFFICIENT_EVIDENCE",
    };
    const outcome = applyResearchHandoff(graph, handoffBase([finding]));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const d017 = outcome.graph.decisions.find((n) => n.decision_id === "DECISION.D017");
    expect(d017?.grounding.missing_facts).toEqual([FACT]);
    const gate = evaluateDecisionGrounding({
      node: d017 as NonNullable<typeof d017>,
      graph: outcome.graph,
      retrievedSurfaces: RETRIEVED,
      missingFactRouting: { [FACT]: "RESEARCHABLE" },
    });
    expect(gate.verdict).toBe("NEEDS_RESEARCH");
    expect(outcome.notes.join()).toContain("caveat");
  });

  it("NO_DECISION_EFFECT（空 decision_refs）→ NO_CHANGE 显式 no-op", () => {
    const graph = graphWithRequest();
    const finding: HandoffFinding = {
      finding_id: "FINDING.R017.4",
      statement: "厂商文档与本项目决策无关。",
      evidence_type: "SECONDARY",
      sources: ["https://vendor.example/docs"],
      caveats: ["无关发现仅留痕。"],
      request_refs: ["RESEARCH.REQ.017"],
      decision_refs: [],
      relation: "NO_DECISION_EFFECT",
    };
    const outcome = applyResearchHandoff(graph, handoffBase([finding]));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.changed).toBe(false);
      expect(outcome.notes.join()).toContain("NO_DECISION_EFFECT");
    }
  });

  it("对账 fail-closed：悬空 request / answered∩unresolved 矛盾 / finding 引用未回答 request / 悬空 decision", () => {
    const graph = graphWithRequest();
    const ghostRequest = applyResearchHandoff(
      graph,
      handoffBase([resolvesFinding]),
    );
    void ghostRequest;
    const badAnswered = applyResearchHandoff(graph, {
      ...handoffBase([resolvesFinding]),
      answered_requests: ["RESEARCH.REQ.999"],
    });
    expect(badAnswered.ok).toBe(false);
    if (!badAnswered.ok) expect(badAnswered.reason).toBe("unknown_request_ref");

    const contradictory = applyResearchHandoff(graph, {
      ...handoffBase([resolvesFinding]),
      unresolved_requests: ["RESEARCH.REQ.017"],
    });
    expect(contradictory.ok).toBe(false);
    if (!contradictory.ok) expect(contradictory.reason).toBe("answered_unresolved_conflict");

    const findingWrongRequest: HandoffFinding = {
      ...resolvesFinding,
      request_refs: ["RESEARCH.REQ.999"],
    };
    const wrongRequest = applyResearchHandoff(graph, handoffBase([findingWrongRequest]));
    expect(wrongRequest.ok).toBe(false);
    if (!wrongRequest.ok) expect(wrongRequest.reason).toBe("finding_request_unknown");

    const ghostDecision: HandoffFinding = {
      ...resolvesFinding,
      decision_refs: ["DECISION.D999"],
    };
    const badDecision = applyResearchHandoff(graph, {
      ...handoffBase([ghostDecision]),
      affected_decisions: ["DECISION.D017", "DECISION.D999"],
    });
    expect(badDecision.ok).toBe(false);
    if (!badDecision.ok) expect(badDecision.reason).toBe("unknown_decision_ref");
  });

  it("§12.4 反洗白：INFERENCE×RESOLVES_FACT 拒 / 非 INFERENCE 零 sources 拒 / 矛盾零来源拒 / 消解未登记事实拒", () => {
    const graph = graphWithRequest();

    const inferenceResolves: HandoffFinding = {
      ...resolvesFinding,
      evidence_type: "INFERENCE",
      sources: [],
    };
    const laundered = applyResearchHandoff(graph, handoffBase([inferenceResolves]));
    expect(laundered.ok).toBe(false);
    if (!laundered.ok) expect(laundered.reason).toBe("inference_cannot_resolve_fact");

    const unsourced: HandoffFinding = {
      ...resolvesFinding,
      evidence_type: "PRIMARY",
      sources: [],
      relation: "SUPPORTS_OPTION",
      resolves_missing_facts: undefined,
    };
    const emptySources = applyResearchHandoff(graph, handoffBase([unsourced]));
    expect(emptySources.ok).toBe(false);
    if (!emptySources.ok) {
      expect(emptySources.reason).toBe("finding_invalid");
      expect(emptySources.details.join()).toContain("零来源");
    }

    const unsourcedContradiction: HandoffFinding = {
      finding_id: "FINDING.R017.5",
      statement: "凭印象认为 Repo 与 BP 冲突。",
      evidence_type: "INFERENCE",
      sources: [],
      caveats: ["无来源矛盾示例。"],
      request_refs: ["RESEARCH.REQ.017"],
      decision_refs: ["DECISION.D017"],
      relation: "CONTRADICTS_PREMISE",
    };
    const contradiction = applyResearchHandoff(graph, handoffBase([unsourcedContradiction]));
    expect(contradiction.ok).toBe(false);
    if (!contradiction.ok) expect(contradiction.reason).toBe("contradiction_without_source");

    const unregistered: HandoffFinding = {
      ...resolvesFinding,
      resolves_missing_facts: ["FACT.NOT.REGISTERED"],
    };
    const unregisteredOutcome = applyResearchHandoff(graph, handoffBase([unregistered]));
    expect(unregisteredOutcome.ok).toBe(false);
    if (!unregisteredOutcome.ok) expect(unregisteredOutcome.reason).toBe("resolves_unregistered_fact");
  });

  it("relation 词形与联结条件：词表外 / RESOLVES_FACT 缺 resolves / 反向携带 resolves / 证据性 relation 空 decision_refs → 拒", () => {
    const graph = graphWithRequest();

    const badRelation: HandoffFinding = {
      ...resolvesFinding,
      relation: "MAYBE" as "RESOLVES_FACT",
    };
    const badRelationOutcome = applyResearchHandoff(graph, handoffBase([badRelation]));
    expect(badRelationOutcome.ok).toBe(false);
    if (!badRelationOutcome.ok) {
      expect(badRelationOutcome.reason).toBe("finding_invalid");
      expect(badRelationOutcome.details.join()).toContain(DECISION_RELATION_VALUES[2]);
    }

    const noResolves: HandoffFinding = { ...resolvesFinding, resolves_missing_facts: undefined };
    const noResolvesOutcome = applyResearchHandoff(graph, handoffBase([noResolves]));
    expect(noResolvesOutcome.ok).toBe(false);
    if (!noResolvesOutcome.ok) expect(noResolvesOutcome.reason).toBe("finding_invalid");

    const strayResolves: HandoffFinding = {
      ...resolvesFinding,
      relation: "SUPPORTS_OPTION",
    };
    const strayOutcome = applyResearchHandoff(graph, handoffBase([strayResolves]));
    expect(strayOutcome.ok).toBe(false);

    const noDecisionRefs: HandoffFinding = {
      ...resolvesFinding,
      decision_refs: [],
    };
    const noRefsOutcome = applyResearchHandoff(graph, handoffBase([noDecisionRefs]));
    expect(noRefsOutcome.ok).toBe(false);
  });

  it("finding_id 词形坏 / 重复 → finding_invalid；SUPPORTS_OPTION 正常回填（missing 不变）", () => {
    const graph = graphWithRequest();

    const badId: HandoffFinding = { ...resolvesFinding, finding_id: "R017.1" };
    const badIdOutcome = applyResearchHandoff(graph, handoffBase([badId]));
    expect(badIdOutcome.ok).toBe(false);
    if (!badIdOutcome.ok) expect(badIdOutcome.reason).toBe("finding_invalid");

    const supports: HandoffFinding = {
      finding_id: "FINDING.R017.6",
      statement: "单车型成本分析覆盖当前价值主张。",
      evidence_type: "IMPLEMENTATION",
      sources: ["repo://master/cost"],
      caveats: ["覆盖面判断限于已检索仓库范围。"],
      request_refs: ["RESEARCH.REQ.017"],
      decision_refs: ["DECISION.D017"],
      relation: "SUPPORTS_OPTION",
    };
    const outcome = applyResearchHandoff(graph, handoffBase([supports, supports]));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("finding_invalid");

    const single = applyResearchHandoff(graph, handoffBase([supports]));
    expect(single.ok).toBe(true);
    if (single.ok) {
      const d017 = single.graph.decisions.find((n) => n.decision_id === "DECISION.D017");
      expect(d017?.grounding.missing_facts).toEqual([FACT]);
      expect(d017?.grounding.research_finding_refs).toContain("FINDING.R017.6");
    }
  });
});

// ============================================================
// G. resolveDecision（§13.2 四变体 + §14 UNKNOWN 六问）
// ============================================================

describe("resolveDecision（四变体矩阵 + UNKNOWN 六问重分类）", () => {
  it("ACCEPT 采纳 recommendation.option 并推进 frontier（D1 accept → [D2,D3]）", () => {
    const graph = buildOk([
      chainCand("DECISION.D1", []),
      chainCand("DECISION.D2", ["DECISION.D1"]),
      chainCand("DECISION.D3", ["DECISION.D1"]),
    ]);
    const outcome = resolveDecision(graph, { decisionId: "DECISION.D1", answer: "ACCEPT", seq: 1 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const d1 = outcome.graph.decisions.find((n) => n.decision_id === "DECISION.D1");
    expect(d1?.resolution).toEqual({ answer: "ACCEPT", seq: 1 });
    expect(outcome.notes.join()).toContain("GO");
    const frontier = computeDecisionFrontier(outcome.graph);
    if (frontier.ok) expect(frontier.report.frontier).toEqual(["DECISION.D2", "DECISION.D3"]);
  });

  it("ACCEPT 无推荐 → accept_requires_recommendation；ACCEPT 带 value → accept_conflicts_with_value", () => {
    const noRecGraph = buildOk([chainCand("DECISION.D1", [], { recommendation: null })]);
    const noRec = resolveDecision(noRecGraph, { decisionId: "DECISION.D1", answer: "ACCEPT" });
    expect(noRec.ok).toBe(false);
    if (!noRec.ok) expect(noRec.reason).toBe("accept_requires_recommendation");

    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const withValue = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "ACCEPT",
      value: "OTHER",
    });
    expect(withValue.ok).toBe(false);
    if (!withValue.ok) expect(withValue.reason).toBe("accept_conflicts_with_value");
  });

  it("CHANGE 必带 value；携带 value 时原样留档 + notes 携带 re-ground 路标；空 CHANGE 拒", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const noValue = resolveDecision(graph, { decisionId: "DECISION.D1", answer: "CHANGE" });
    expect(noValue.ok).toBe(false);
    if (!noValue.ok) expect(noValue.reason).toBe("change_requires_value");

    const changed = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "CHANGE",
      value: "GO_WITH_RETRY",
      seq: 2,
    });
    expect(changed.ok).toBe(true);
    if (changed.ok) {
      const d1 = changed.graph.decisions.find((n) => n.decision_id === "DECISION.D1");
      expect(d1?.resolution).toEqual({ answer: "CHANGE", value: "GO_WITH_RETRY", seq: 2 });
      expect(changed.notes.join()).toContain("re-ground");
    }
  });

  it("UNKNOWN 无 triage → unknown_requires_triage；六问矩阵按行序取第一个 yes 派生处置", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const noTriage = resolveDecision(graph, { decisionId: "DECISION.D1", answer: "UNKNOWN" });
    expect(noTriage.ok).toBe(false);
    if (!noTriage.ok) expect(noTriage.reason).toBe("unknown_requires_triage");

    const allNo: UnknownTriage = {
      can_derive: false,
      can_research: false,
      can_safely_assume: false,
      can_defer: false,
      can_prototype_observe: false,
      blocks_current_increment: true,
    };
    expect(classifyUnknownTriage(allNo)).toBe("BLOCKER_CANDIDATE");
    expect(classifyUnknownTriage({ ...allNo, can_prototype_observe: true })).toBe("DISCOVERY_REQUIRED");
    expect(classifyUnknownTriage({ ...allNo, can_defer: true })).toBe("DEFERRED_DECISION");
    expect(classifyUnknownTriage({ ...allNo, can_safely_assume: true })).toBe("ASSUMPTION");
    expect(classifyUnknownTriage({ ...allNo, can_research: true })).toBe("RESEARCHABLE");
    expect(classifyUnknownTriage({ ...allNo, can_derive: true })).toBe("DERIVABLE");
    expect(UNKNOWN_DISPOSITION_VALUES).toHaveLength(6);
  });

  it("UNKNOWN→BLOCKER_CANDIDATE：09 升级通走路标（永不直产 HARD_BLOCKER）；→ASSUMPTION：分级路标", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const blocker = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "UNKNOWN",
      unknownTriage: {
        can_derive: false,
        can_research: false,
        can_safely_assume: false,
        can_defer: false,
        can_prototype_observe: false,
        blocks_current_increment: true,
      },
    });
    expect(blocker.ok).toBe(true);
    if (blocker.ok) {
      const d1 = blocker.graph.decisions.find((n) => n.decision_id === "DECISION.D1");
      expect(d1?.resolution?.classified).toBe("BLOCKER_CANDIDATE");
      expect(blocker.notes.join()).toContain("八问");
    }

    const assume = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "UNKNOWN",
      unknownTriage: {
        can_derive: false,
        can_research: false,
        can_safely_assume: true,
        can_defer: false,
        can_prototype_observe: false,
        blocks_current_increment: false,
      },
    });
    expect(assume.ok).toBe(true);
    if (assume.ok) expect(assume.notes.join()).toContain("assumption_risk");
  });

  it("六问全 no 且不阻塞 → unknown_triage_contradictory（不知处置又不阻塞 = 申报失真）", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const outcome = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "UNKNOWN",
      unknownTriage: {
        can_derive: false,
        can_research: false,
        can_safely_assume: false,
        can_defer: false,
        can_prototype_observe: false,
        blocks_current_increment: false,
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("unknown_triage_contradictory");
  });

  it("DEFER：显式延后留档；DEFER 带 value → defer_conflicts_with_value", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const deferred = resolveDecision(graph, { decisionId: "DECISION.D1", answer: "DEFER" });
    expect(deferred.ok).toBe(true);
    if (deferred.ok) {
      const d1 = deferred.graph.decisions.find((n) => n.decision_id === "DECISION.D1");
      expect(d1?.resolution).toEqual({ answer: "DEFER" });
      expect(deferred.notes.join()).toContain("§15");
    }
    const withValue = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "DEFER",
      value: "LATER",
    });
    expect(withValue.ok).toBe(false);
    if (!withValue.ok) expect(withValue.reason).toBe("defer_conflicts_with_value");
  });

  it("对账：悬空 decision / answer 词表外 / seq 非法 → 显式拒绝（零墙钟）", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const ghost = resolveDecision(graph, { decisionId: "DECISION.D999", answer: "ACCEPT" });
    expect(ghost.ok).toBe(false);
    if (!ghost.ok) expect(ghost.reason).toBe("unknown_decision_ref");

    const badAnswer = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "MAYBE" as "ACCEPT",
    });
    expect(badAnswer.ok).toBe(false);
    if (!badAnswer.ok) expect(badAnswer.reason).toBe("answer_unknown");

    const badSeq = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "ACCEPT",
      seq: 0,
    });
    expect(badSeq.ok).toBe(false);
    if (!badSeq.ok) expect(badSeq.reason).toBe("seq_invalid");
  });

  it("幂等：同决议重放 → changed=false NO_CHANGE；重开（不同答案）→ changed=true + 覆盖留痕", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const first = resolveDecision(graph, { decisionId: "DECISION.D1", answer: "ACCEPT", seq: 1 });
    expect(first.ok && first.changed).toBe(true);
    if (!first.ok) return;
    const replay = resolveDecision(first.graph, {
      decisionId: "DECISION.D1",
      answer: "ACCEPT",
      seq: 1,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.changed).toBe(false);
      expect(canonicalJson(replay.graph)).toBe(canonicalJson(first.graph));
    }
    const reopen = resolveDecision(first.graph, {
      decisionId: "DECISION.D1",
      answer: "CHANGE",
      value: "NO_GO",
      seq: 2,
    });
    expect(reopen.ok).toBe(true);
    if (reopen.ok) {
      expect(reopen.changed).toBe(true);
      expect(reopen.notes.join()).toContain("重开");
    }
  });
});

// ============================================================
// H. evaluateDiscoverySufficiency（§15 八维 + 残留合法分类 + 09 msd 三轴）
// ============================================================

describe("evaluateDiscoverySufficiency（§15 停止条件）", () => {
  const msdAllGreen = { goal_defined: true, scope_defined: true, acceptance_verifiable: true };

  it("全 resolved + 残留合法 + MSD 三轴全绿 → sufficient=true（promotion_basis=msd_reached 判据面）", () => {
    let graph = buildOk([chainCand("DECISION.D1", []), chainCand("DECISION.D2", ["DECISION.D1"])]);
    const r1 = resolveDecision(graph, { decisionId: "DECISION.D1", answer: "ACCEPT" });
    if (!r1.ok) throw new Error("fixture r1 失败");
    graph = r1.graph;
    const r2 = resolveDecision(graph, { decisionId: "DECISION.D2", answer: "CHANGE", value: "NO_GO" });
    if (!r2.ok) throw new Error("fixture r2 失败");
    const outcome = evaluateDiscoverySufficiency({
      graph: r2.graph,
      residuals: [
        { statement: "批量导入恢复交互延后", classification: "DEFERRED_DECISION" },
        { statement: "默认排序按创建时间倒序", classification: "ASSUMPTION" },
      ],
      msd: msdAllGreen,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.report.sufficient).toBe(true);
      expect(outcome.report.msd_reached).toBe(true);
      expect(outcome.report.blocking).toEqual([]);
      expect(outcome.report.deferred.join()).toContain("批量导入");
    }
  });

  it("任一 OPEN SCOPE decision → blocking（class → Scope 维显著改变）", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const outcome = evaluateDiscoverySufficiency({
      graph,
      residuals: [],
      msd: msdAllGreen,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.report.sufficient).toBe(false);
      expect(outcome.report.blocking[0]?.decision_id).toBe("DECISION.D1");
      expect(outcome.report.blocking[0]?.detail).toContain("SCOPE");
    }
  });

  it("UNKNOWN 重分类分流：BLOCKER_CANDIDATE/DERIVABLE 阻塞；DEFERRED_DECISION/ASSUMPTION 合法停靠", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const blocker = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "UNKNOWN",
      unknownTriage: {
        can_derive: false,
        can_research: false,
        can_safely_assume: false,
        can_defer: false,
        can_prototype_observe: false,
        blocks_current_increment: true,
      },
    });
    if (!blocker.ok) throw new Error("fixture blocker 失败");
    const blockerReport = evaluateDiscoverySufficiency({
      graph: blocker.graph,
      residuals: [],
      msd: msdAllGreen,
    });
    expect(blockerReport.ok).toBe(true);
    if (blockerReport.ok) expect(blockerReport.report.sufficient).toBe(false);

    const parked = resolveDecision(graph, {
      decisionId: "DECISION.D1",
      answer: "UNKNOWN",
      unknownTriage: {
        can_derive: false,
        can_research: false,
        can_safely_assume: false,
        can_defer: true,
        can_prototype_observe: false,
        blocks_current_increment: false,
      },
    });
    if (!parked.ok) throw new Error("fixture parked 失败");
    const parkedReport = evaluateDiscoverySufficiency({
      graph: parked.graph,
      residuals: [],
      msd: msdAllGreen,
    });
    expect(parkedReport.ok).toBe(true);
    if (parkedReport.ok) {
      expect(parkedReport.report.sufficient).toBe(true);
      expect(parkedReport.report.deferred.join()).toContain("DECISION.D1");
    }
  });

  it("残留四桶分装 + 分类词表外 fail-closed（输入级拒绝而非 insufficient）", () => {
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const resolved = resolveDecision(graph, { decisionId: "DECISION.D1", answer: "ACCEPT" });
    if (!resolved.ok) throw new Error("fixture resolve 失败");
    const buckets = evaluateDiscoverySufficiency({
      graph: resolved.graph,
      residuals: [
        { statement: "a 假设", classification: "ASSUMPTION" },
        { statement: "b 已知未知", classification: "SOFT_UNCERTAINTY" },
        { statement: "c 未来考量", classification: "FUTURE_CONSIDERATION" },
        { statement: "d 延后决策", classification: "DEFERRED_DECISION" },
      ],
      msd: msdAllGreen,
    });
    expect(buckets.ok).toBe(true);
    if (buckets.ok) {
      expect(buckets.report.assumptions).toHaveLength(1);
      expect(buckets.report.unknowns).toHaveLength(1);
      expect(buckets.report.future_considerations).toHaveLength(1);
      expect(buckets.report.deferred).toHaveLength(1);
      expect(SUFFICIENCY_RESIDUAL_CLASSIFICATIONS).toEqual([
        "ASSUMPTION",
        "DEFERRED_DECISION",
        "FUTURE_CONSIDERATION",
        "SOFT_UNCERTAINTY",
      ]);
    }

    const illegal = evaluateDiscoverySufficiency({
      graph: resolved.graph,
      residuals: [{ statement: "未分类残留", classification: "UNRESOLVED" as "ASSUMPTION" }],
      msd: msdAllGreen,
    });
    expect(illegal.ok).toBe(false);
    if (!illegal.ok) expect(illegal.reason).toBe("residual_classification_unknown");
  });

  it("MSD 三轴派生（09 同款）：任一 false → msd_reached=false + blocking；带冲突决议 → §12.3 blocking", () => {
    const msdFail = evaluateDiscoverySufficiency({
      graph: buildOk([chainCand("DECISION.D9", [])]),
      residuals: [],
      msd: { goal_defined: true, scope_defined: true, acceptance_verifiable: false },
    });
    expect(msdFail.ok).toBe(true);
    if (msdFail.ok) {
      expect(msdFail.report.msd_reached).toBe(false);
      expect(msdFail.report.sufficient).toBe(false);
      expect(msdFail.report.blocking.map((b) => b.detail).join()).toContain("acceptance_verifiable");
    }

    const conflictGraph = buildOk([
      chainCand("DECISION.D1", [], {
        grounding: {
          intent_refs: ["DISCOVERY.INTENT.001"],
          truth_refs: [],
          contract_refs: [],
          architecture_refs: [],
          implementation_refs: [],
          evidence_refs: [],
          knowledge_refs: [],
          research_finding_refs: [],
          conflicts: [
            { statement: "BP 与 Repo 冲突", refs: ["BP.PAGE.X", "repo://master"] },
          ],
          missing_facts: [],
        },
      }),
    ]);
    const accepted = resolveDecision(conflictGraph, {
      decisionId: "DECISION.D1",
      answer: "ACCEPT",
    });
    if (!accepted.ok) throw new Error("fixture accept 失败");
    const withConflict = evaluateDiscoverySufficiency({
      graph: accepted.graph,
      residuals: [],
      msd: msdAllGreen,
    });
    expect(withConflict.ok).toBe(true);
    if (withConflict.ok) {
      expect(withConflict.report.sufficient).toBe(false);
      expect(withConflict.report.blocking.map((b) => b.detail).join()).toContain("冲突");
    }
  });

  it("词表冻结：八维显著改变维度（任务口径）+ 禁词负例 + 诚实注记（PRD 第九维待词表批）", () => {
    expect(SUFFICIENCY_DIMENSIONS).toEqual([
      "GOAL",
      "SCOPE",
      "BEHAVIOR",
      "AUTHORITY",
      "ACCEPTANCE",
      "CRITICAL_CONTRACT",
      "ARCHITECTURE_BOUNDARY",
      "IRREVERSIBLE",
    ]);
    expect(DECISION_GRAPH_FORBIDDEN_WORDFORMS).toEqual([
      "GRILLING",
      "GRILLED",
      "GRILL_CONFIRMED",
    ]);
    const graph = buildOk([chainCand("DECISION.D1", [])]);
    const report = evaluateDiscoverySufficiency({ graph, residuals: [], msd: { goal_defined: false, scope_defined: false, acceptance_verifiable: false } });
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.report.notes.join()).toContain("Critical Failure Behavior");
      expect(report.report.notes.join()).toContain("maintain");
    }
  });
});
