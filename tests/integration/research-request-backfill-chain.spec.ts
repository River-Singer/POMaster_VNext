/**
 * research-request-backfill-chain.spec.ts —— PR-4 命令链 L2 fixture（09-06 R5）：
 * Discovery 缺口公开消解全链 × 晋升落账。
 *
 * 链（全部真实 runCli——L2 的意义是集成命令面，不绕过 CLI 直调内核，零手写治理状态；
 * 候选图/handoff 文件是命令输入件，与 --set 候选文件同纪律）：
 *   init → brainstorm start（DISCOVERY，--prompt 登记 raw prompt）→ research <topic>
 *   （四文件骨架，§81.6）→ brainstorm decide --set（候选带 missing_facts，--route
 *   RESEARCHABLE → verdict=NEEDS_RESEARCH，G6 命令链前置）→ decide --ready 负向拍
 *   （OPEN 未过 grounding → GROUNDING_NOT_READY fail-closed 状态零变更）
 *   → research request（kernel createResearchRequest：request 落档 index.yaml
 *   status=open + request_refs 同步进图——图侧对账通路打通）
 *   → research handoff（kernel applyResearchHandoff：RESOLVES_FACT 消解 missing_facts
 *   + finding 挂回节点 + index 入账 status=answered + handoff 三件非骨架）
 *   → research inspect（SKELETON 标记消失）→ decide --answer --accept（grounding
 *   复算 READY_FOR_DECISION 后放行）→ decide --ready 正向重判（§15 全绿 →
 *   READY_TO_PROMOTE，promotion_basis=msd_reached）→ brainstorm promote --apply
 *   （P11 maintain 面落库，TASK.* 进 store）。
 *
 * 出口判据：research request → 回填 → decide --ready 重判全链走通（R5 验收第 4 条）；
 * 判卷全部由 kernel 在拍内完成（零造数——不手写 decision-graph.json/state.json）；
 * fail-closed 负向拍钉死（缺口未消解时 --ready 不放行）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { envelopeOf, journalEvents, runJsonStep, type StepRecord } from "./fixture-chain-lib.js";

const ID = "idea-research";
const PAD = `.pomaster/discovery/scratchpads/${ID}/`;
const TASK_REF = "TASK.IDEA_RESEARCH";
const FACT = "FACT.RESEARCH.MATCHING_KEY";

let root: string;
interface Steps {
  init: StepRecord;
  start: StepRecord;
  scaffold: StepRecord;
  setGraph: StepRecord;
  readyBlocked: StepRecord;
  request: StepRecord;
  /** request 落档后的 index 快照（handoff 会改写 status——it() 消费此刻存档）。 */
  indexAfterRequest: { requests: { id: string; status: string }[] };
  handoff: StepRecord;
  inspectAfterHandoff: StepRecord;
  answer: StepRecord;
  ready: StepRecord;
  promote: StepRecord;
  statusFinal: StepRecord;
}
let steps: Steps;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "pvnext-research-chain-"));
  steps = {} as Steps;

  steps.init = await runJsonStep(root, ["init"]);
  steps.start = await runJsonStep(root, [
    "brainstorm",
    "start",
    "--id",
    ID,
    "--title",
    "跨车型匹配调研",
    "--prompt",
    "想讨论跨车型数据匹配要不要做进这个版本",
  ]);
  steps.scaffold = await runJsonStep(root, [
    "research",
    "跨车型匹配现状调研",
    "--host",
    PAD,
    "--mode",
    "internal",
  ]);

  // —— decide --set：候选带 missing_facts，--route RESEARCHABLE → NEEDS_RESEARCH ——
  const candidatesPath = join(root, "chain-candidates.json");
  writeFileSync(
    candidatesPath,
    `${JSON.stringify(chainCandidates(), null, 2)}\n`,
    "utf8",
  );
  steps.setGraph = await runJsonStep(root, [
    "brainstorm",
    "decide",
    ID,
    "--set",
    candidatesPath,
    "--retrieved",
    "CURRENT_TRUTH",
    "--route",
    `${FACT}=RESEARCHABLE`,
  ]);
  // 负向拍：缺口未消解 → --ready 不放行（GROUNDING_NOT_READY，状态零变更）。
  steps.readyBlocked = await runJsonStep(root, [
    "brainstorm",
    "decide",
    ID,
    "--ready",
    "--goal",
    "研究回填链收敛目标——投影 intent",
    "--scope",
    "研究回填链范围——投影 notesMd",
    "--acceptance",
    "匹配键事实经 research 消解后确认@DECISION.RESEARCH_SCOPE",
  ]);

  // —— research request：发起（index.yaml 落档 + 图侧 request_refs 同步） ——
  steps.request = await runJsonStep(root, [
    "research",
    "request",
    ID,
    "--decision",
    "DECISION.RESEARCH_SCOPE",
    "--proposition",
    "现有数据模型中是否存在可复用的统一匹配键",
    "--why",
    "DECISION.RESEARCH_SCOPE 的 Recommendation 依赖匹配复杂度事实",
    "--evidence",
    "IMPLEMENTATION",
    "--mode",
    "internal",
    "--stop-when",
    "定位到权威字段或证明不存在",
    "--forbid",
    "Research 不得决定当前 Increment 是否包含跨车型能力",
  ]);
  steps.indexAfterRequest = JSON.parse(
    readFileSync(join(root, ...`${PAD}research/index.yaml`.split("/")), "utf8"),
  ) as { requests: { id: string; status: string }[] };

  // —— research handoff：回填入账（RESOLVES_FACT 消解 missing_facts） ——
  const handoffPath = join(root, "chain-handoff.json");
  writeFileSync(handoffPath, `${JSON.stringify(chainHandoff(), null, 2)}\n`, "utf8");
  steps.handoff = await runJsonStep(root, [
    "research",
    "handoff",
    ID,
    "--file",
    handoffPath,
  ]);
  steps.inspectAfterHandoff = await runJsonStep(root, ["research", "inspect", `${PAD}research/`]);

  // —— grounding 重算后 --answer 放行 → --ready 正向重判全绿 ——
  steps.answer = await runJsonStep(root, [
    "brainstorm",
    "decide",
    ID,
    "--answer",
    "DECISION.RESEARCH_SCOPE",
    "--accept",
  ]);
  steps.ready = await runJsonStep(root, [
    "brainstorm",
    "decide",
    ID,
    "--ready",
    "--goal",
    "研究回填链收敛目标——投影 intent",
    "--scope",
    "研究回填链范围——投影 notesMd",
    "--acceptance",
    "匹配键事实经 research 消解后确认@DECISION.RESEARCH_SCOPE",
  ]);
  steps.promote = await runJsonStep(root, [
    "brainstorm",
    "promote",
    ID,
    "--to",
    "TASK",
    "--basis",
    "msd_reached",
    "--apply",
  ]);
  steps.statusFinal = await runJsonStep(root, ["brainstorm", "status"]);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 候选节点（§5.2 十键；missing_facts 显式在座——G6 路由 RESEARCHABLE 后 NEEDS_RESEARCH）。 */
function chainCandidates(): readonly Record<string, unknown>[] {
  return [
    {
      decision_id: "DECISION.RESEARCH_SCOPE",
      class: "SCOPE",
      prompt: "跨车型匹配是否纳入当前 Increment？",
      depends_on: [],
      affects: [],
      grounding: {
        intent_refs: ["DISCOVERY.INTENT.001"],
        truth_refs: ["baseline/frontend/stack.yaml"],
        contract_refs: [],
        architecture_refs: [],
        implementation_refs: [],
        evidence_refs: [],
        knowledge_refs: [],
        research_finding_refs: [],
        conflicts: [],
        missing_facts: [FACT],
      },
      options: ["INCLUDE_CURRENT_INCREMENT", "DEFER"],
      recommendation: {
        option: "INCLUDE_CURRENT_INCREMENT",
        basis_refs: ["baseline/frontend/stack.yaml"],
        rationale: "Current Truth 已登记清单页需求。",
        tradeoff: "先锁最小范围，延后项走 DEFER。",
        uncertainty: "匹配键是否存在尚无证据。",
        source: "PROJECT_GROUNDED",
      },
      authority: { owner: "BOOTSTRAP_OWNER" },
    },
  ];
}

/** §10.2 decision-aware handoff（命令输入件；RESOLVES_FACT 消解 FACT.RESEARCH.MATCHING_KEY）。 */
function chainHandoff(): Record<string, unknown> {
  return {
    artifact_ref: `${PAD}research/`,
    answered_requests: ["RESEARCH.REQ.1"],
    affected_decisions: ["DECISION.RESEARCH_SCOPE"],
    key_findings: [
      {
        finding_id: "FINDING.R1.1",
        statement: "现有数据模型已存在可复用的统一匹配键（IMPLEMENTATION 级实抓）。",
        evidence_type: "IMPLEMENTATION",
        sources: ["repo://src/db/schema.ts#customer_id"],
        caveats: ["存在不证明正确——跨系统语义对账未完成（§81.5）"],
        request_refs: ["RESEARCH.REQ.1"],
        decision_refs: ["DECISION.RESEARCH_SCOPE"],
        relation: "RESOLVES_FACT",
        resolves_missing_facts: [FACT],
      },
    ],
    unresolved_requests: [],
    one_line_summary: "统一匹配键事实已取证：IMPLEMENTATION 级确认可复用键存在",
    critical_caveat: "证据仅证明字段存在；跨系统语义一致性未对账",
  };
}

function graphOnDisk(): {
  request_refs: string[];
  graph_fingerprint: string;
  decisions: {
    resolution: unknown;
    grounding: { missing_facts: string[]; research_finding_refs: string[] };
  }[];
} {
  return JSON.parse(
    readFileSync(join(root, ...`${PAD}decision-graph.json`.split("/")), "utf8"),
  ) as {
    request_refs: string[];
    graph_fingerprint: string;
    decisions: {
      resolution: unknown;
      grounding: { missing_facts: string[]; research_finding_refs: string[] };
    }[];
  };
}

describe("research request → handoff → decide --ready 重判全链（PR-4 09-06 R5）", () => {
  it("段1 init + start + research 骨架：DISCOVERY 入链；四文件在座（§81.6）", () => {
    expect(steps.init.code).toBe(0);
    expect(steps.start.code).toBe(0);
    expect(
      (envelopeOf(steps.start).result as { state: string }).state,
    ).toBe("DISCOVERY");
    expect(steps.scaffold.code).toBe(0);
    for (const file of ["index.yaml", "current-implementation.md", "external-options.md", "risks-and-caveats.md"]) {
      expect(existsSync(join(root, ...`${PAD}research/${file}`.split("/")))).toBe(true);
    }
  });

  it("段2 --set 建图：NEEDS_RESEARCH 判定呈现（frontier 在座）→ --ready 负向拍 fail-closed（GROUNDING_NOT_READY 状态零变更）", () => {
    expect(steps.setGraph.code).toBe(0);
    const setResult = envelopeOf(steps.setGraph).result as {
      verdicts: { decision_id: string; verdict: string; answerable: boolean }[];
      frontier: string[];
    };
    expect(setResult.verdicts[0]).toMatchObject({
      decision_id: "DECISION.RESEARCH_SCOPE",
      verdict: "NEEDS_RESEARCH",
      answerable: false,
    });
    expect(setResult.frontier).toEqual(["DECISION.RESEARCH_SCOPE"]);

    expect(steps.readyBlocked.code).toBe(1);
    const blocked = envelopeOf(steps.readyBlocked);
    expect(blocked.ok).toBe(false);
    expect(blocked.errors[0]?.code).toBe("GROUNDING_NOT_READY");
    expect(blocked.errors[0]?.hint).toContain("research request");
    expect(
      (blocked.result as { state: string }).state,
    ).toBe("DISCOVERY");
  });

  it("段3 research request：RESEARCH.REQ.1 落档 index.yaml（status=open）+ 图侧 request_refs 同步", () => {
    expect(steps.request.code).toBe(0);
    const result = envelopeOf(steps.request).result as {
      request_id: string;
      mode: string;
      required_evidence: string;
      graph_sync: string;
      index_created: boolean;
    };
    expect(result).toMatchObject({
      request_id: "RESEARCH.REQ.1",
      mode: "INTERNAL",
      required_evidence: "IMPLEMENTATION",
      graph_sync: "SYNCED",
      index_created: false,
    });
    // request 落档后的 index 存档（此刻 status=open；handoff 之后改写为 answered）。
    expect(steps.indexAfterRequest.requests).toHaveLength(1);
    expect(steps.indexAfterRequest.requests[0]).toMatchObject({ id: "RESEARCH.REQ.1", status: "open" });
    expect(graphOnDisk().request_refs).toEqual(["RESEARCH.REQ.1"]);
  });

  it("段4 research handoff：missing_facts 消解（evidence 挂回节点）+ index 入账 answered + inspect SKELETON 消失", () => {
    expect(steps.handoff.code).toBe(0);
    const result = envelopeOf(steps.handoff).result as {
      graph_changed: boolean;
      request_statuses: { id: string; status: string }[];
    };
    expect(result.graph_changed).toBe(true);
    expect(result.request_statuses).toEqual([{ id: "RESEARCH.REQ.1", status: "answered" }]);
    const graph = graphOnDisk();
    expect(graph.decisions[0]?.grounding.missing_facts).toEqual([]);
    expect(graph.decisions[0]?.grounding.research_finding_refs).toEqual(["FINDING.R1.1"]);
    // 判卷输入申报同拍同步（R6 重算制）：RESOLVES_FACT 消解后路由申报清空——
    // 残留申报会被 grounding 重算判「路由越界」（申报与重算脱节假红）。
    const inputs = JSON.parse(
      readFileSync(join(root, ...`${PAD}decision-inputs.json`.split("/")), "utf8"),
    ) as { missing_fact_routing: Record<string, string> };
    expect(inputs.missing_fact_routing).toEqual({});
    // index 入账（requests 状态 + handoff 三件）。
    const index = JSON.parse(
      readFileSync(join(root, ...`${PAD}research/index.yaml`.split("/")), "utf8"),
    ) as { requests: { status: string }[]; handoff: { one_line_summary: string } };
    expect(index.requests[0]?.status).toBe("answered");
    expect(index.handoff.one_line_summary).toContain("统一匹配键");
    // inspect 联动：SKELETON 标记消失。
    expect(steps.inspectAfterHandoff.code).toBe(0);
    expect(
      (envelopeOf(steps.inspectAfterHandoff).result as { skeleton: boolean }).skeleton,
    ).toBe(false);
  });

  it("段5 grounding 重算后 --answer 放行 → --ready 正向重判全绿（READY_TO_PROMOTE，msd_reached）", () => {
    expect(steps.answer.code).toBe(0);
    expect(
      (envelopeOf(steps.answer).result as { answer_changed: boolean }).answer_changed,
    ).toBe(true);
    expect(steps.ready.code).toBe(0);
    const readyResult = envelopeOf(steps.ready).result as {
      change: string;
      state: string;
      promotion_basis: string;
    };
    expect(readyResult).toMatchObject({
      change: "PROMOTABLE",
      state: "READY_TO_PROMOTE",
      promotion_basis: "msd_reached",
    });
  });

  it("段6 promote --apply 落账：TASK.* 进 store（P11 maintain 面）+ scratchpad 终态（零手写治理状态）", () => {
    expect(steps.promote.code).toBe(0);
    const promoteResult = envelopeOf(steps.promote).result as {
      applied: boolean;
      maintain_change: string;
      promoted_ref: string;
      scratchpad_state: string;
    };
    expect(promoteResult.applied).toBe(true);
    expect(promoteResult.maintain_change).toBe("APPLIED");
    expect(promoteResult.promoted_ref).toBe(TASK_REF);
    expect(promoteResult.scratchpad_state).toBe("TASK");
    // 终态对账：status 呈现 TASK 终态；journal 留痕提升事务。
    const pads = (
      envelopeOf(steps.statusFinal).result as {
        scratchpads: { discovery_id: string; state: string; promoted_ref: string | null }[];
      }
    ).scratchpads;
    expect(pads[0]).toMatchObject({ discovery_id: ID, state: "TASK", promoted_ref: TASK_REF });
    expect(
      journalEvents(root).filter((e) => JSON.stringify(e).includes(TASK_REF)).length,
    ).toBeGreaterThanOrEqual(1);
  });
});
