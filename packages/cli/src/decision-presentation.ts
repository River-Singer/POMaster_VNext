/**
 * decision-presentation.ts —— Decision Graph 呈现词形纪律（§6A Recommendation UX；
 * 09-04 vNext Batch 3 R3 / Owner 裁定 D13）。
 *
 * ADR-lite（呈现面落点选择）：候选 a（kernel decision-graph.ts 内增设 render 函数）/
 * b（CLI 独立呈现模块）中选 **b**：CLI 分层纪律「判卷权威在 kernel，本包只做编排与
 * 呈现」（resolve/renderResolve 先例）——呈现词形归命令面包，kernel decision-graph.ts
 * 判卷函数零改动（本批次红线：gate-result/decision-graph 判卷面 words-only）。
 *
 * 语义边界（§6A 逐字对位）：
 * - recommendation 必须以「推荐」身份标注，不渲染成已决——OPEN 节点禁出现「已决」
 *   词形（测试钉住）；推荐行恒带「推荐非已决」标记；
 * - policy-required / computed result（确定性 Approved Policy 的计算结果）词形与
 *   推荐词形区分：本模块呈现分母里确定性结果只有 resolution（Human 外生 answer，
 *   §13.2——系统无自动裁决通路），推荐恒为推荐；禁把模型偏好包装成 Owner 决策；
 * - 禁词 "AI recommended"（§6A 逐字）：DECISION_PRESENTATION_FORBIDDEN_WORDFORMS
 *   呈现面机器拒绝位（渲染器永不产出 + 测试负例钉住）；
 * - Decision Owner: HUMAN 显式标注（§6A/宪法 §27：authority.owner 全为 Human 治理
 *   角色——owner_registry 词形；AI_INVENTION 是 precedence 链底零权威位，不可能是
 *   owner）——呈现行同时给出具体 owner 词形（诚实）与 HUMAN 标注（§6A 逐字）；
 * - §6A 五件套逐项呈现：options / basis（basis_refs）/ tradeoffs（tradeoff）/
 *   impact（affects）/ uncertainty；字段缺席显式「（无）」——诚实缺席不伪造呈现面；
 * - INFERENCE 披露（§12.2）：source=INFERENCE 的推荐呈现面显式披露「模型经验非项目
 *   事实」（kernel notes 披露位的呈现面落法）；
 * - 纯函数零 IO 零写入：输入 = decision-graph sidecar（schema 18）解析产物（unknown
 *   容错形态），输出 = 呈现行；本模块不判卷（G1-G8 verdict、frontier 重算都不在本面
 *   ——判卷归 kernel evaluateDecisionGrounding/computeDecisionFrontier 原样）。
 */

/** §6A 禁词（呈现面负例钉住；渲染器永不产出）。 */
export const DECISION_PRESENTATION_FORBIDDEN_WORDFORMS = ["AI recommended"] as const;

/** 推荐行恒带标记（「（推荐）」不得单独成为决策呈现——推荐身份 + 非已决双注记）。 */
export const DECISION_RECOMMENDATION_MARK =
  "（推荐——推荐非已决，决议归 Decision Owner，§6A）" as const;

/** OPEN 状态行（未决节点的呈现词形——禁「已决」字样，测试钉住）。 */
export const DECISION_OPEN_STATUS_LINE =
  "- 状态: OPEN（未决议——推荐（如有）仅以推荐身份呈现，不构成已决，§6A）" as const;

/** 显式缺席标记（诚实缺席不伪造呈现面；与 view.ts NO_DATA_MARK 同纪律）。 */
const ABSENT_MARK = "（无——sidecar 未申报该键）";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** 单个 Decision 的呈现卡（结构化行 + 人读聚合；机读走结构化行，§45 双输出同源）。 */
export interface DecisionPresentationCard {
  readonly decision_id: string;
  /** OPEN = 未决议（推荐仅推荐身份）；RESOLVED = 已决（Human 外生 answer 词形呈现）。 */
  readonly status: "OPEN" | "RESOLVED";
  readonly lines: readonly string[];
}

/**
 * 单 Decision 呈现（words-only：输入容忍异形——非对象/缺键按显式缺席呈现，
 * 不 throw 不判卷；本函数对 G1-G8 不做任何重算）。
 */
export function renderDecisionCard(node: unknown): DecisionPresentationCard {
  if (!isRecord(node)) {
    return {
      decision_id: "(malformed decision node)",
      status: "OPEN",
      lines: ["- （sidecar 节点形态畸形——如实呈现，不猜测语义；修复走 Brainstorm 面/schema 18）"],
    };
  }
  const decisionId = asString(node.decision_id) ?? "(missing decision_id)";
  const lines: string[] = [];

  // —— Decision Owner: HUMAN 显式标注（§6A 逐字）+ 具体 owner 词形（诚实） ——
  const authority = isRecord(node.authority) ? node.authority : {};
  const owner = asString(authority.owner) ?? "(missing owner)";
  lines.push(
    `- Decision Owner: HUMAN（authority.owner=${owner}——决议权在人；推荐不替代 Human judgment，§6A）`,
  );

  // —— §6A 五件套之 options ——
  const options = asStringArray(node.options);
  lines.push(
    options.length > 0
      ? `- options: ${options.join(" / ")}`
      : `- options: ${ABSENT_MARK}`,
  );

  // —— resolution 状态行（外生 answer 词形；policy-required/computed 词形与推荐词形互斥） ——
  const resolution = isRecord(node.resolution) ? node.resolution : null;
  const resolved = resolution !== null;
  lines.push(
    resolved
      ? `- 状态: 已决——answer=${asString(resolution.answer) ?? "?"}（Human 外生 answer 经 resolveDecision 通路；系统无自动裁决通路，§13.2${asString(resolution.value) !== null ? `；value=${asString(resolution.value)}` : ""}）`
      : DECISION_OPEN_STATUS_LINE,
  );

  // —— §6A 五件套之 basis/tradeoffs/uncertainty（recommendation 六字段呈现位） ——
  const recommendation = isRecord(node.recommendation) ? node.recommendation : null;
  if (recommendation === null) {
    lines.push(`- 推荐: ${ABSENT_MARK}（无推荐不构成缺陷——G7 无推荐不许问人是判卷面语义，本面只如实呈现）`);
  } else {
    const option = asString(recommendation.option) ?? "(missing option)";
    lines.push(`- 推荐: ${option}${DECISION_RECOMMENDATION_MARK}`);
    const basisRefs = asStringArray(recommendation.basis_refs);
    lines.push(
      basisRefs.length > 0
        ? `  - basis（依据引用）: ${basisRefs.join("、")}`
        : `  - basis（依据引用）: ${ABSENT_MARK}`,
    );
    const rationale = asString(recommendation.rationale);
    lines.push(`  - rationale: ${rationale ?? ABSENT_MARK}`);
    const tradeoff = asString(recommendation.tradeoff);
    lines.push(
      tradeoff !== null && tradeoff.trim().length > 0
        ? `  - tradeoffs: ${tradeoff}`
        : `  - tradeoffs: ${ABSENT_MARK}`,
    );
    const uncertainty = asString(recommendation.uncertainty);
    lines.push(
      uncertainty !== null && uncertainty.trim().length > 0
        ? `  - uncertainty: ${uncertainty}`
        : `  - uncertainty: ${ABSENT_MARK}`,
    );
    // —— source 词形区分（PROJECT_GROUNDED=项目引用推断 / INFERENCE=模型经验显式披露） ——
    // 均为「推荐」词形族，与 policy-required/computed result（确定性计算）词形互斥。
    // 注记禁以任何形式写出禁词词形（引注否定也是写出——负例测试逐字扫描呈现行）。
    const source = asString(recommendation.source) ?? "(missing source)";
    lines.push(
      source === "INFERENCE"
        ? "  - source: INFERENCE（模型经验——显式披露：本推荐非项目事实，不得包装成已决，§12.2）"
        : `  - source: ${source}（依据引用推断的推荐词形——非 policy-required/computed result，非模型自荐）`,
    );
  }

  // —— §6A 五件套之 impact（affects）+ depends_on ——
  const affects = asStringArray(node.affects);
  lines.push(
    affects.length > 0 ? `- impact（affects）: ${affects.join("、")}` : `- impact（affects）: ${ABSENT_MARK}`,
  );
  const dependsOn = asStringArray(node.depends_on);
  lines.push(
    dependsOn.length > 0
      ? `- depends_on（prerequisite Decisions）: ${dependsOn.join("、")}`
      : `- depends_on（prerequisite Decisions）: ${ABSENT_MARK}`,
  );

  return { decision_id: decisionId, status: resolved ? "RESOLVED" : "OPEN", lines };
}

/**
 * Decision Graph 呈现（§6A 呈现词形入口）：逐 Decision 渲染卡片；graph 异形时
 * 显式呈现不猜测。输入 = sidecar JSON 解析产物（unknown），零判卷零重算。
 */
export function renderDecisionGraphPresentation(
  graph: unknown,
): { readonly cards: readonly DecisionPresentationCard[]; readonly lines: readonly string[] } {
  const lines: string[] = [];
  if (!isRecord(graph) || !Array.isArray(graph.decisions)) {
    lines.push("- （sidecar 非 decision-graph 形态（缺 decisions 数组）——如实呈现，不猜测语义；schema 18 为产物形态权威）");
    return { cards: [], lines };
  }
  const cards = graph.decisions.map((node) => renderDecisionCard(node));
  if (cards.length === 0) {
    lines.push("- （图内零 Decision——显式空，非空白假绿）");
    return { cards, lines };
  }
  for (const card of cards) {
    lines.push(`## ${card.decision_id}`);
    lines.push("");
    lines.push(...card.lines);
    lines.push("");
  }
  return { cards, lines };
}
