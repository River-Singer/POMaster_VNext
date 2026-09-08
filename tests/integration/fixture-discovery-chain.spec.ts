/**
 * fixture-discovery-chain.spec.ts —— P18-Adversarial L2 fixture：Discovery 状态链全链 ×
 * P13 closeout 消费闭环。
 *
 * 链（全部真实 runCli——L2 的意义是集成命令面，不绕过 CLI 直调内核）：
 *   init → brainstorm start（IDEA→DISCOVERY，08 信封落盘）→ research 挂同一宿主
 *   （§81.6 四文件骨架 + inspect SKELETON 判读）→ **brainstorm decide 公开推进链**
 *   （审计 F3 修复：--ready 判定不足 fail-closed 状态零变更 → --set 建图 → --answer
 *   逐节点决议 → --ready §15 全绿写 READY_TO_PROMOTE（promotion_basis=msd_reached，
 *   schema 18 机器判据面）——全程零手写 state.json，不再走「§80.2 授权面直写」旧路）
 *   → brainstorm promote --apply（三闸 kernel 判卷 +
 *   经 runMaintain 同一通路落库，提升走 P11 面零旁移；T2 R1：promote 编译 Task
 *   Contract 投影——intent←goal/acceptance 挂锚+自动 record claim（CLM 绑入）/
 *   notesMd←scope+四桶残留/titleZh←discovery title）→ inspect TASK.*（PROPOSED/
 *   PLANNED 提升诚实初值）→ closeout 续接四拍（与 P13 消费闭环）：
 *     ① 提升时刻诚实初值（acceptance 挂 CLM 未验证）→ DOD_CLAIM_NOT_VERIFIED +
 *        GATE_EVIDENCE_MISSING 双阻断零写入；
 *     ② baseline confirm 后 baseline 阻断减员（DoD claim 仍未验证 → 双码共存）；
 *     ③ 验证侧证据齐（claims VERIFIED + passed run 绑定 subject）→ 施断被 kernel
 *        CROSS_AXIS_ASSERTION 拒（PROPOSED ⇒ evidence 必为 PLANNED——proposal 态
 *        不许伪装 COMPLETED，跨轴断言在提升链上同样生效）；
 *     ④ PROPOSED→CURRENT（maintain --ops transition + authorityRef 满足
 *        authority_approval）→ closeout COMPLETED（evidence→VERIFIED 落 store）。
 *   → 终态对账：brainstorm status（state=TASK + promoted_ref）+ inspect（CURRENT/
 *   VERIFIED）+ meta 链 [IDEA,DISCOVERY,READY_TO_PROMOTE,TASK] + journal 留痕。
 *
 * 出口判据（wave3-plan P18）：状态链在临时 fixture 走通；DISCOVERY→READY 推进只经
 * 公开命令（判定不足 fail-closed 有负向拍钉死）；提升落账后 closeout 链可
 * 续接（P18×P13 闭环）；全程轴语义（跨轴断言/晋升条件词形）不被绕过。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Ajv from "ajv";
import { allSchemas, discoveryStateChainSchema } from "@pomaster/schemas";
import { envelopeOf, journalEvents, runJsonStep, type StepRecord } from "./fixture-chain-lib.js";

const ID = "idea-carline";
const PAD = `.pomaster/discovery/scratchpads/${ID}/`;
const TASK_REF = "TASK.IDEA_CARLINE";
const BASE_BASIS = "msd_reached";

let root: string;
interface Steps {
  init: StepRecord;
  start: StepRecord;
  research: StepRecord;
  statusDiscovery: StepRecord;
  readyBlocked: StepRecord;
  statusAfterBlocked: StepRecord;
  setGraph: StepRecord;
  answerGrid: StepRecord;
  answerScope: StepRecord;
  ready: StepRecord;
  statusReady: StepRecord;
  discoveryStateFile: Record<string, unknown>;
  discoveryMetaChain: string[];
  promote: StepRecord;
  inspectPromoted: StepRecord;
  closeout1: StepRecord;
  beforeCloseout1: string[];
  afterCloseout1: string[];
  baselineSet: StepRecord[];
  baselineConfirm: StepRecord;
  closeout2: StepRecord;
  closeout3: StepRecord;
  axesAfterCloseout3: Record<string, unknown>;
  maintainCurrent: StepRecord;
  closeout4: StepRecord;
  statusFinal: StepRecord;
  inspectFinal: StepRecord;
}
let steps: Steps;

const ajv = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajv.addSchema(schema as Record<string, unknown>);
}
const validateChain = ajv.compile(discoveryStateChainSchema as object);

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "pvnext-fixture-discovery-"));
  steps = {} as Steps;

  // —— 链首：init + brainstorm start（IDEA→DISCOVERY） ——
  steps.init = await runJsonStep(root, ["init"]);
  steps.start = await runJsonStep(root, [
    "brainstorm",
    "start",
    "--id",
    ID,
    "--title",
    "车系导入",
    "--ephemeral",
  ]);
  steps.research = await runJsonStep(root, [
    "research",
    "车系导入 grid 方案选型",
    "--host",
    PAD,
    "--mode",
    "mixed",
  ]);
  steps.statusDiscovery = await runJsonStep(root, ["brainstorm", "status"]);
  // DISCOVERY 态磁盘快照（promote 会推进 state.json——后续 it 消费的是此刻存档）。
  steps.discoveryStateFile = stateFileOnDisk();
  steps.discoveryMetaChain = metaFileOnDisk().chain;

  // —— brainstorm decide 公开推进链（审计 F3 修复：DISCOVERY→READY 只经公开命令） ——
  // 拍序：--set 建图 → 判定不足 fail-closed（OPEN 在场，状态零变更）→ --answer 逐节点
  // 决议 → --ready §15 全绿写 READY_TO_PROMOTE。零手写 state.json。
  writeFileSync(
    join(root, "decide-candidates.json"),
    `${JSON.stringify(decideCandidates(), null, 2)}\n`,
    "utf8",
  );
  steps.setGraph = await runJsonStep(root, [
    "brainstorm",
    "decide",
    ID,
    "--set",
    join(root, "decide-candidates.json"),
    "--retrieved",
    "CURRENT_TRUTH",
    "--retrieved",
    "REPO",
  ]);
  steps.readyBlocked = await runJsonStep(root, [
    "brainstorm",
    "decide",
    ID,
    "--ready",
    "--goal",
    "车系导入收敛目标——投影进 TASK intent",
    "--scope",
    "车系导入清单页范围——投影进 notesMd",
    "--acceptance",
    "车系清单网格策略经独立重算确认@DECISION.CARLINE_GRID",
  ]);
  steps.statusAfterBlocked = await runJsonStep(root, ["brainstorm", "status"]);
  steps.answerGrid = await runJsonStep(root, [
    "brainstorm",
    "decide",
    ID,
    "--answer",
    "DECISION.CARLINE_GRID",
    "--accept",
  ]);
  steps.answerScope = await runJsonStep(root, [
    "brainstorm",
    "decide",
    ID,
    "--answer",
    "DECISION.CARLINE_SCOPE",
    "--value",
    "SCOPE_LIST_PAGE_ONLY",
  ]);
  steps.ready = await runJsonStep(root, [
    "brainstorm",
    "decide",
    ID,
    "--ready",
    "--goal",
    "车系导入收敛目标——投影进 TASK intent",
    "--scope",
    "车系导入清单页范围——投影进 notesMd",
    "--acceptance",
    "车系清单网格策略经独立重算确认@DECISION.CARLINE_GRID",
  ]);
  steps.statusReady = await runJsonStep(root, ["brainstorm", "status"]);

  // —— 提升落账（P11 maintain 面） ——
  steps.promote = await runJsonStep(root, [
    "brainstorm",
    "promote",
    ID,
    "--to",
    "TASK",
    "--basis",
    BASE_BASIS,
    "--apply",
  ]);
  steps.inspectPromoted = await runJsonStep(root, ["inspect", TASK_REF]);

  // —— closeout 续接①：诚实初值双阻断（零写入基线：前后两次全树快照） ——
  steps.beforeCloseout1 = snapshotPomaster();
  steps.closeout1 = await runJsonStep(root, ["closeout", TASK_REF]);
  steps.afterCloseout1 = snapshotPomaster();

  // —— closeout 续接②前置（R-L baseline gate 接线新增）：closeout① 的阻断集里
  // 含 BASELINE_NOT_CONFIRMED（init 工作区 baseline 恒在场——确认 gate 适用域，
  // 检出判卷式零写入）。此处走非交互后补销账通路把 14 unknowns 清零并 confirm
  // （digest 快照），后续 closeout 判卷在基线已确认前提下续接；漂移检出与
  // 重确认闭环归单元面（baseline.spec / closeout.spec）。 ——
  const baselineKeyPlan: readonly (readonly [lane: string, key: string])[] = [
    ...(["framework", "language", "build", "router", "state", "grid", "ui", "css", "testing"] as const).map(
      (key) => ["frontend", key] as const,
    ),
    ...(["language", "framework", "persistence", "database", "cache"] as const).map(
      (key) => ["backend", key] as const,
    ),
  ];
  steps.baselineSet = [];
  for (const [lane, key] of baselineKeyPlan) {
    steps.baselineSet.push(
      await runJsonStep(root, [
        "baseline",
        "set",
        "--lane",
        lane,
        "--key",
        key,
        "--value",
        key === "grid" || key === "cache" ? "none" : `${lane}-${key}-value`,
      ]),
    );
  }
  steps.baselineConfirm = await runJsonStep(root, ["baseline", "confirm"]);

  // —— closeout 续接②：baseline confirm 已过（T2 R1 起 promote 自动 record claim——
  // acceptance 初值非空，旧「P11 面补 acceptance」步骤随 R1 语义删除；DoD 的
  // CLM-0001 仍 UNVERIFIED → 阻断集减员为 DOD_CLAIM_NOT_VERIFIED + GATE_EVIDENCE_MISSING） ——
  steps.closeout2 = await runJsonStep(root, ["closeout", TASK_REF]);

  // —— closeout 续接③前置：验证侧证据（D20 判定通路——独立验证流写 VERIFIED claim） ——
  seedVerificationEvidence();

  steps.closeout3 = await runJsonStep(root, ["closeout", TASK_REF]);
  steps.axesAfterCloseout3 = taskBody().axes as Record<string, unknown>;

  // —— closeout 续接④前置：PROPOSED→CURRENT（authority_approval） ——
  const txCurrentPath = join(root, "tx.current.json");
  writeFileSync(
    txCurrentPath,
    `${JSON.stringify(
      {
        ops: [
          {
            op: "transition_object",
            id: TASK_REF,
            patch: { lifecycle: "CURRENT" },
            reasonShort: "fixture：提升任务进入实现态（authority_approval：CHANGE.CARLINE_IMPORT）",
          },
        ],
        authorityRef: "CHANGE.CARLINE_IMPORT",
        note: "fixture：PROPOSED→CURRENT（requires authority_approval，tx 携 authorityRef）",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  steps.maintainCurrent = await runJsonStep(root, [
    "maintain",
    TASK_REF,
    "--ops",
    txCurrentPath,
  ]);
  steps.closeout4 = await runJsonStep(root, ["closeout", TASK_REF]);

  steps.statusFinal = await runJsonStep(root, ["brainstorm", "status"]);
  steps.inspectFinal = await runJsonStep(root, ["inspect", TASK_REF]);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// fixture 助手
// ============================================================

/**
 * 候选图（§5.1 Grill 产物 → §5.2 buildDecisionGraph 输入；schema 18 正例词形）：
 * 两节点 DAG（GRID → SCOPE），grounding 十键全显式、missing_facts 显式空——
 * G-Gate 全过（配合 --retrieved 申报）后节点可被 --answer 决议。
 */
function decideCandidates(): readonly Record<string, unknown>[] {
  const grounding = {
    intent_refs: ["DISCOVERY.INTENT.001"],
    truth_refs: ["baseline/frontend/stack.yaml"],
    contract_refs: [],
    architecture_refs: [],
    implementation_refs: [],
    evidence_refs: [],
    knowledge_refs: [],
    research_finding_refs: [],
    conflicts: [],
    missing_facts: [],
  };
  const recommendation = {
    option: "INCLUDE_CURRENT_INCREMENT",
    basis_refs: ["baseline/frontend/stack.yaml"],
    rationale: "Current Truth 已登记清单页需求。",
    tradeoff: "先锁最小范围，延后项走 DEFER。",
    uncertainty: "范围若在实现期失效需重开本决策。",
    source: "PROJECT_GROUNDED",
  };
  const scopeRecommendation = {
    ...recommendation,
    option: "SCOPE_LIST_PAGE_ONLY",
  };
  return [
    {
      decision_id: "DECISION.CARLINE_GRID",
      class: "SCOPE",
      prompt: "车系导入清单页的 grid 方案是否纳入当前 Increment？",
      depends_on: [],
      affects: [],
      grounding,
      options: ["INCLUDE_CURRENT_INCREMENT", "DEFER"],
      recommendation,
      authority: { owner: "BOOTSTRAP_OWNER" },
    },
    {
      decision_id: "DECISION.CARLINE_SCOPE",
      class: "SCOPE",
      prompt: "车系导入的范围是否收敛到清单页？",
      depends_on: ["DECISION.CARLINE_GRID"],
      affects: [],
      grounding,
      options: ["SCOPE_LIST_PAGE_ONLY", "DEFER"],
      recommendation: scopeRecommendation,
      authority: { owner: "BOOTSTRAP_OWNER" },
    },
  ];
}

/** .pomaster 全树字节快照（「closeout 阻断零写入」的字节级对比基线）。 */
function snapshotPomaster(): string[] {
  const base = join(root, ".pomaster");
  const entries: string[] = [];
  const walk = (current: string, rel: string): void => {
    let items: ReturnType<typeof readdirSync>;
    try {
      items = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const child = join(current, item.name);
      const childRel = rel === "" ? item.name : `${rel}/${item.name}`;
      if (item.isDirectory()) walk(child, childRel);
      else entries.push(`${childRel}:${readFileSync(child, "utf8")}`);
    }
  };
  walk(base, "");
  return entries.sort();
}

/** 提升对象的正文（.pomaster/truth/objects 下含 TASK.IDEA_CARLINE 的唯一文件）。 */
function taskBody(): Record<string, unknown> {
  const objectsDir = join(root, ".pomaster", "truth", "objects");
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, item.name);
      if (item.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk(objectsDir);
  const hit = found.find((file) => readFileSync(file, "utf8").includes(TASK_REF));
  if (hit === undefined) throw new Error("task body not found");
  return JSON.parse(readFileSync(hit, "utf8")) as Record<string, unknown>;
}

/** 验证侧证据（模拟独立验证流主体：VERIFIED claim + 绑定 subject 的 passed run）。 */
function seedVerificationEvidence(): void {
  const claimsDir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(claimsDir, { recursive: true });
  writeFileSync(
    join(claimsDir, "CLM-0001.json"),
    `${JSON.stringify(
      {
        record_type: "claim",
        clm: "CLM-0001",
        subject: { object_id: TASK_REF },
        is_fixture: false,
        assertion: "TASK_ACCEPTANCE_VERIFIED：车系导入清单页布局经独立重算确认",
        asserted_by: { actor_type: "agent", actor: "demo-builder", self_attested: true },
        evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
        verification: {
          verdict: "VERIFIED",
          method: "recompute",
          recomputed_by: { actor_type: "tool", actor: "verifier@0.1.0", self_attested: false },
          recomputed_value: { ok: true },
          delta_vs_asserted: null,
          at_seq: 4,
        },
        rev: 1,
        notes_md: null,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const runsDir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(runsDir, "GRN-0001.json"),
    `${JSON.stringify(
      {
        record_type: "run",
        grn: "GRN-0001",
        ran_at_seq: 4,
        trigger: { type: "pre_closeout" },
        gate_result: {
          mode: "inline",
          result: {
            grn: "GRN-0001",
            gate: "BUILD",
            gate_def: "POLICY.GATE.BUILD@0.1.0",
            tool: "demo:build",
            tool_version: "0.1.0",
            metric_dialect: "demo:case_count",
            ran_at_seq: 4,
            verdict: "passed",
            subject_id: TASK_REF,
            is_fixture: false,
            denominator_refs: [],
            counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
            blindspot: { scanned: 2, produced: 2, escape_ratio: 0 },
            trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
            duration_ms: { self: 1, external: 0 },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function stateFileOnDisk(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, ...`${PAD}state.json`.split("/")), "utf8"),
  ) as Record<string, unknown>;
}

function metaFileOnDisk(): { chain: string[]; ephemeral: boolean } {
  return JSON.parse(
    readFileSync(join(root, ...`${PAD}meta.json`.split("/")), "utf8"),
  ) as { chain: string[]; ephemeral: boolean };
}

// ============================================================
// 逐拍消费（真实存档上的断言）
// ============================================================

describe("Discovery 状态链 × closeout 全链（P18×P13 闭环）", () => {
  it("段1 init + brainstorm start：IDEA→DISCOVERY 入链，state.json 满足 08 schema（ajv），meta 链 [IDEA,DISCOVERY]", () => {
    expect(steps.init.code).toBe(0);
    expect(steps.start.code).toBe(0);
    const startResult = envelopeOf(steps.start).result as {
      state: string;
      change: string;
      scratchpad_ref: string;
      ephemeral: boolean;
    };
    expect(startResult.state).toBe("DISCOVERY");
    expect(startResult.change).toBe("CREATED");
    expect(startResult.scratchpad_ref).toBe(PAD);
    expect(startResult.ephemeral).toBe(true);
    // DISCOVERY 态 08 信封（beforeAll 存档——promote 后磁盘已推进为终态）。
    expect(validateChain(steps.discoveryStateFile)).toBe(true);
    expect(steps.discoveryStateFile.state).toBe("DISCOVERY");
    expect(steps.discoveryStateFile.scratchpad_ref).toBe(PAD);
    expect(steps.discoveryMetaChain).toEqual(["IDEA", "DISCOVERY"]);
  });

  it("段2 research 挂同一宿主：四文件骨架落盘 + inspect SKELETON 判读（§81.6/§81.4）", async () => {
    expect(steps.research.code).toBe(0);
    for (const file of ["index.yaml", "current-implementation.md", "external-options.md", "risks-and-caveats.md"]) {
      expect(existsSync(join(root, ...`${PAD}research/${file}`.split("/")))).toBe(true);
    }
    const inspect = await runJsonStep(root, ["research", "inspect", `${PAD}research/`]);
    expect(inspect.code).toBe(0);
    const result = envelopeOf(inspect).result as {
      findings_total: number;
      skeleton: boolean;
      files: { present: boolean }[];
    };
    expect(result.skeleton).toBe(true);
    expect(result.findings_total).toBe(0);
    expect(result.files.every((f) => f.present)).toBe(true);
  });

  it("段3 brainstorm decide 公开推进链（F3）：判定不足 fail-closed（状态零变更）→ --set 建图 → --answer 逐节点决议 → --ready 全绿", () => {
    // 负向拍：OPEN 在场时 --ready 被拒（§15 sufficiency 缺口可读 + fail-closed 状态零变更）。
    expect(steps.readyBlocked.code).toBe(1);
    const blocked = envelopeOf(steps.readyBlocked);
    expect(blocked.ok).toBe(false);
    expect(blocked.errors[0]?.code).toBe("DECISION_SUFFICIENCY_BLOCKED");
    const blockedResult = blocked.result as { state: string; sufficient: boolean; blocking: { decision_id: string | null; detail: string }[] };
    expect(blockedResult.sufficient).toBe(false);
    expect(blockedResult.state).toBe("DISCOVERY");
    expect(blockedResult.blocking.length).toBeGreaterThan(0);
    // 判定不足不推进：紧随其后的 status 仍是 DISCOVERY（真实存档，非推断）。
    const afterBlocked = envelopeOf(steps.statusAfterBlocked).result as {
      scratchpads: { discovery_id: string; state: string }[];
    };
    expect(afterBlocked.scratchpads[0]?.state).toBe("DISCOVERY");

    // 正向拍：--set 建图（build + grounding 判定呈现）→ 两节点全 READY_FOR_DECISION。
    expect(steps.setGraph.code).toBe(0);
    const setResult = envelopeOf(steps.setGraph).result as {
      change: string;
      decisions_total: number;
      verdicts: { decision_id: string; verdict: string; answerable: boolean }[];
      frontier: string[];
    };
    expect(setResult.change).toBe("CREATED");
    expect(setResult.decisions_total).toBe(2);
    expect(setResult.verdicts.every((v) => v.verdict === "READY_FOR_DECISION" && v.answerable)).toBe(true);
    expect(setResult.frontier).toEqual(["DECISION.CARLINE_GRID"]);

    // --answer：上游 ACCEPT + 下游 CHANGE（人工新 option）。
    expect(steps.answerGrid.code).toBe(0);
    expect((envelopeOf(steps.answerGrid).result as { answer_changed: boolean }).answer_changed).toBe(true);
    expect(steps.answerScope.code).toBe(0);
    expect((envelopeOf(steps.answerScope).result as { answer_changed: boolean }).answer_changed).toBe(true);

    // --ready 全绿：DISCOVERY→READY_TO_PROMOTE（promotion_basis=msd_reached 机器判据面）。
    expect(steps.ready.code).toBe(0);
    const readyResult = envelopeOf(steps.ready).result as { change: string; state: string; promotion_basis: string };
    expect(readyResult.change).toBe("PROMOTABLE");
    expect(readyResult.state).toBe("READY_TO_PROMOTE");
    expect(readyResult.promotion_basis).toBe("msd_reached");
  });

  it("段3b status 呈现链上位置：DISCOVERY → 公开推进链后 READY_TO_PROMOTE（promotion_basis 可见）", () => {
    const discovery = envelopeOf(steps.statusDiscovery).result as {
      scratchpads: { discovery_id: string; state: string }[];
    };
    expect(discovery.scratchpads[0]?.state).toBe("DISCOVERY");
    const ready = envelopeOf(steps.statusReady).result as {
      scratchpads: { discovery_id: string; state: string; promotion_basis: string | null }[];
    };
    expect(ready.scratchpads[0]?.state).toBe("READY_TO_PROMOTE");
    expect(ready.scratchpads[0]?.promotion_basis).toBe(BASE_BASIS);
  });

  it("段4 promote --apply 落账：store 出现 TASK 对象（PROPOSED/PLANNED 提升初值）+ scratchpad 08 终态 + meta 链闭合", async () => {
    const promoteResult = envelopeOf(steps.promote).result as {
      applied: boolean;
      maintain_change: string;
      applied_seq: number | null;
      promoted_ref: string;
      from_state: string;
      scratchpad_state: string;
    };
    expect(promoteResult.applied).toBe(true);
    expect(promoteResult.maintain_change).toBe("APPLIED");
    expect(promoteResult.applied_seq).not.toBeNull();
    expect(promoteResult.from_state).toBe("READY_TO_PROMOTE");
    expect(promoteResult.promoted_ref).toBe(TASK_REF);
    expect(promoteResult.scratchpad_state).toBe("TASK");
    // T2 R1：promote 自动 record claim（claims_generated=1 与 CLM-0001 证据文件双验）。
    expect(promoteResult.claims_generated).toBe(1);
    expect(existsSync(join(root, ".pomaster", "evidence", "claims", "CLM-0001.json"))).toBe(true);
    // scratchpad 08 终态信封（ajv 独立复核）+ meta 链闭合。
    const stateFile = stateFileOnDisk();
    expect(validateChain(stateFile)).toBe(true);
    expect(stateFile.state).toBe("TASK");
    expect(stateFile.promotion_basis).toBe(BASE_BASIS);
    expect(stateFile.promoted_ref).toBe(TASK_REF);
    expect(metaFileOnDisk().chain).toEqual(["IDEA", "DISCOVERY", "READY_TO_PROMOTE", "TASK"]);
    // store 权威面：提升对象可检视，轴面是提升诚实初值（inspect 的 body 信封）。
    expect(steps.inspectPromoted.code).toBe(0);
    const axes = (
      envelopeOf(steps.inspectPromoted).result as { body: { axes: Record<string, string> } | null }
    ).body?.axes;
    expect(axes?.lifecycle).toBe("PROPOSED");
    expect(axes?.evidence).toBe("PLANNED");
  });

  it("段5 closeout①：提升诚实初值双阻断（DOD_CLAIM_NOT_VERIFIED + GATE_EVIDENCE_MISSING）且零写入", () => {
    expect(steps.closeout1.code).toBe(1);
    const env = envelopeOf(steps.closeout1);
    expect(env.ok).toBe(false);
    const codes = env.errors.map((e) => e.code);
    // T2 R1：promote 的 acceptance 初值非空（挂锚 + 自动 claim）——空验收阻断位
    // 换型为「claim 未验证」诚实阻断（「空 acceptance 任务永不命中 R_CLOSEOUT_READY」
    // 缺陷在本链源头消灭）。
    expect(codes).toContain("DOD_CLAIM_NOT_VERIFIED");
    expect(codes).not.toContain("DOD_ACCEPTANCE_EMPTY");
    expect(codes).toContain("GATE_EVIDENCE_MISSING");
    // R-L baseline gate（init 工作区适用域）：未确认基线与 DoD/gate 阻断共存呈现。
    expect(codes).toContain("BASELINE_NOT_CONFIRMED");
    // 阻断零写入：closeout 前后两次全树字节快照逐字节一致（提升初值不被 closeout 污染）。
    expect(steps.afterCloseout1).toEqual(steps.beforeCloseout1);
    expect((envelopeOf(steps.closeout1).result as { blocked: boolean }).blocked).toBe(true);
  });

  it("段6 closeout②③：baseline confirm 后阻断减员；证据齐后施断被 CROSS_AXIS_ASSERTION 拒（proposal 态不许伪装 COMPLETED）", () => {
    // 基线确认前提（R-L 接线）：14 unknowns 非交互销账全过 + confirm digest 快照落盘。
    expect(steps.baselineSet).toHaveLength(14);
    expect(steps.baselineSet.every((step) => step.code === 0)).toBe(true);
    expect(steps.baselineConfirm.code).toBe(0);
    expect(
      envelopeOf(steps.baselineConfirm).result as { change: string; digests: unknown[] },
    ).toMatchObject({ change: "CONFIRMED" });
    expect(
      (envelopeOf(steps.baselineConfirm).result as { digests: unknown[] }).digests,
    ).toHaveLength(24); // N1：确认分母 = 24 文件单一资产清单（2 stack.yaml + 22 md）
    expect(steps.closeout2.code).toBe(1);
    const codes2 = envelopeOf(steps.closeout2).errors.map((e) => e.code);
    expect(codes2).toContain("GATE_EVIDENCE_MISSING");
    expect(codes2).not.toContain("DOD_ACCEPTANCE_EMPTY");
    // baseline 阻断减员（confirm 后消失），DoD claim 仍未验证（诚实双码共存）。
    expect(codes2).not.toContain("BASELINE_NOT_CONFIRMED");
    expect(codes2).toContain("DOD_CLAIM_NOT_VERIFIED");
    // 验证侧证据齐 → DoD + gate 判卷全过，但施断被 kernel 跨轴断言拒：
    // PROPOSED ⇒ evidence 必为 PLANNED——「先转 CURRENT 再抬 evidence」在提升链上同样生效。
    expect(steps.closeout3.code).toBe(1);
    const env3 = envelopeOf(steps.closeout3);
    expect(env3.errors[0]?.code).toBe("CROSS_AXIS_ASSERTION");
    expect(env3.errors[0]?.message).toContain("PLANNED");
    // 施断拒绝零写入：轴面仍是 PROPOSED/PLANNED（proposal 态没被悄悄推进）。
    expect(steps.axesAfterCloseout3).toMatchObject({ lifecycle: "PROPOSED", evidence: "PLANNED" });
  });

  it("段7 PROPOSED→CURRENT（authority_approval）→ closeout COMPLETED：evidence→VERIFIED 落 store", async () => {
    expect(steps.maintainCurrent.code).toBe(0);
    expect(steps.closeout4.code).toBe(0);
    const closeout = envelopeOf(steps.closeout4).result as {
      change: string;
      blocked: boolean;
      applied_seq: number | null;
      dod: { acceptance_total: number; verified: number };
      gates: { bound_runs: number; gates_passed: number };
    };
    expect(closeout.change).toBe("COMPLETED");
    expect(closeout.blocked).toBe(false);
    expect(closeout.applied_seq).not.toBeNull();
    expect(closeout.dod).toMatchObject({ acceptance_total: 1, verified: 1 });
    expect(closeout.gates).toMatchObject({ bound_runs: 1, gates_passed: 1 });
    // store 权威面：轴面推进到 CURRENT/VERIFIED（COMPLETED 的词表合法承载）。
    const axes = (
      envelopeOf(steps.inspectFinal).result as { body: { axes: Record<string, string> } | null }
    ).body?.axes;
    expect(axes).toMatchObject({ lifecycle: "CURRENT", evidence: "VERIFIED" });
  });

  it("段8 终态对账：brainstorm status TASK + promoted_ref；journal 留痕提升与施断事务", () => {
    expect(steps.statusFinal.code).toBe(0);
    const pads = (envelopeOf(steps.statusFinal).result as {
      scratchpads: { discovery_id: string; state: string; promoted_ref: string | null; ephemeral: boolean }[];
    }).scratchpads;
    expect(pads[0]?.discovery_id).toBe(ID);
    expect(pads[0]?.state).toBe("TASK");
    expect(pads[0]?.promoted_ref).toBe(TASK_REF);
    // journal 追加留痕：提升落账 + CURRENT 迁移 + closeout 施断至少三次事务提及本对象。
    const events = journalEvents(root);
    expect(
      events.filter((e) => JSON.stringify(e).includes(TASK_REF)).length,
    ).toBeGreaterThanOrEqual(3);
  });
});
