/**
 * fixture-discovery-chain.spec.ts —— P18-Adversarial L2 fixture：Discovery 状态链全链 ×
 * P13 closeout 消费闭环。
 *
 * 链（全部真实 runCli——L2 的意义是集成命令面，不绕过 CLI 直调内核）：
 *   init → brainstorm start（IDEA→DISCOVERY，08 信封落盘）→ research 挂同一宿主
 *   （§81.6 四文件骨架 + inspect SKELETON 判读）→ brainstorm status → §80.2 授权面
 *   推进 READY_TO_PROMOTE（scratchpad 维护面直写 state.json——权限清单「维护
 *   Discovery Scratchpad」明文授权）→ brainstorm promote --apply（三闸 kernel 判卷 +
 *   经 runMaintain 同一通路落库，提升走 P11 面零旁移）→ inspect TASK.*（PROPOSED/
 *   PLANNED 提升诚实初值）→ closeout 续接四拍（与 P13 消费闭环）：
 *     ① 提升时刻诚实初值 → DOD_ACCEPTANCE_EMPTY + GATE_EVIDENCE_MISSING 双阻断零写入；
 *     ② P11 面补 acceptance（maintain --ops upsert）→ gate 绑定分母仍空 → 仍阻断；
 *     ③ 验证侧证据齐（claims VERIFIED + passed run 绑定 subject）→ 施断被 kernel
 *        CROSS_AXIS_ASSERTION 拒（PROPOSED ⇒ evidence 必为 PLANNED——proposal 态
 *        不许伪装 COMPLETED，跨轴断言在提升链上同样生效）；
 *     ④ PROPOSED→CURRENT（maintain --ops transition + authorityRef 满足
 *        authority_approval）→ closeout COMPLETED（evidence→VERIFIED 落 store）。
 *   → 终态对账：brainstorm status（state=TASK + promoted_ref）+ inspect（CURRENT/
 *   VERIFIED）+ meta 链 [IDEA,DISCOVERY,TASK] + journal 留痕。
 *
 * 出口判据（wave3-plan P18）：状态链在临时 fixture 走通；提升落账后 closeout 链可
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
  statusReady: StepRecord;
  discoveryStateFile: Record<string, unknown>;
  discoveryMetaChain: string[];
  promote: StepRecord;
  inspectPromoted: StepRecord;
  closeout1: StepRecord;
  beforeCloseout1: string[];
  afterCloseout1: string[];
  maintainAcceptance: StepRecord;
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

  // —— §80.2 授权面：scratchpad 维护推进 READY_TO_PROMOTE（promotion_basis 记录所据条件） ——
  writeFileSync(
    join(root, ...`${PAD}state.json`.split("/")),
    `${JSON.stringify(
      { state: "READY_TO_PROMOTE", scratchpad_ref: PAD, promotion_basis: BASE_BASIS },
      null,
      2,
    )}\n`,
    "utf8",
  );
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

  // —— closeout 续接②前置：P11 面补 acceptance（maintain --ops upsert） ——
  // tx 路径用绝对路径（--ops 相对路径按 cwd 解析，与 --dir 无关——真实用户在仓内
  // 相对书写时 cwd=仓根，等价；测试进程 cwd 在别处，故显式绝对）。
  const txAcceptancePath = join(root, "tx.acceptance.json");
  const body = taskBody();
  writeFileSync(
    txAcceptancePath,
    `${JSON.stringify(
      {
        ops: [
          {
            op: "upsert_object",
            envelope: {
              id: TASK_REF,
              kind: "task_object",
              axisProfile: body.axis_profile,
              axes: body.axes,
              titleZh: body.title_zh,
              authority: { owner: (body.authority as { owner: string }).owner, delegates: [] },
              origin: body.origin,
              payload: {
                ...(body.payload as Record<string, unknown>),
                acceptance: [
                  {
                    criterion: "车系导入清单页在 1280 宽下无横向滚动（独立重算通过）",
                    claim: "CLM-0001",
                  },
                ],
              },
              sources: (body.sources as Record<string, unknown>[]).map((s) => ({
                type: s.type,
                ref: s.ref,
                capturedBy: s.captured_by,
                ...(s.pin !== undefined ? { pin: s.pin } : {}),
              })),
              notesMd: (body.notes_md as string | null) ?? null,
            },
          },
        ],
        authorityRef: "CHANGE.CARLINE_IMPORT",
        note: "fixture：为提升任务登记验收条目（P11 面，acceptance→claim 硬绑前置）",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  steps.maintainAcceptance = await runJsonStep(root, [
    "maintain",
    TASK_REF,
    "--ops",
    txAcceptancePath,
  ]);
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

  it("段3 status 呈现链上位置：DISCOVERY → §80.2 授权面推进后 READY_TO_PROMOTE（promotion_basis 可见）", () => {
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
    // scratchpad 08 终态信封（ajv 独立复核）+ meta 链闭合。
    const stateFile = stateFileOnDisk();
    expect(validateChain(stateFile)).toBe(true);
    expect(stateFile.state).toBe("TASK");
    expect(stateFile.promotion_basis).toBe(BASE_BASIS);
    expect(stateFile.promoted_ref).toBe(TASK_REF);
    expect(metaFileOnDisk().chain).toEqual(["IDEA", "DISCOVERY", "TASK"]);
    // store 权威面：提升对象可检视，轴面是提升诚实初值（inspect 的 body 信封）。
    expect(steps.inspectPromoted.code).toBe(0);
    const axes = (
      envelopeOf(steps.inspectPromoted).result as { body: { axes: Record<string, string> } | null }
    ).body?.axes;
    expect(axes?.lifecycle).toBe("PROPOSED");
    expect(axes?.evidence).toBe("PLANNED");
  });

  it("段5 closeout①：诚实初值双阻断（DOD_ACCEPTANCE_EMPTY + GATE_EVIDENCE_MISSING）且零写入", () => {
    expect(steps.closeout1.code).toBe(1);
    const env = envelopeOf(steps.closeout1);
    expect(env.ok).toBe(false);
    const codes = env.errors.map((e) => e.code);
    expect(codes).toContain("DOD_ACCEPTANCE_EMPTY");
    expect(codes).toContain("GATE_EVIDENCE_MISSING");
    // 阻断零写入：closeout 前后两次全树字节快照逐字节一致（提升初值不被 closeout 污染）。
    expect(steps.afterCloseout1).toEqual(steps.beforeCloseout1);
    expect((envelopeOf(steps.closeout1).result as { blocked: boolean }).blocked).toBe(true);
  });

  it("段6 closeout②③：补 acceptance 后 gate 分母空仍阻断；证据齐后施断被 CROSS_AXIS_ASSERTION 拒（proposal 态不许伪装 COMPLETED）", () => {
    expect(steps.maintainAcceptance.code).toBe(0);
    expect(steps.closeout2.code).toBe(1);
    const codes2 = envelopeOf(steps.closeout2).errors.map((e) => e.code);
    expect(codes2).toContain("GATE_EVIDENCE_MISSING");
    expect(codes2).not.toContain("DOD_ACCEPTANCE_EMPTY");
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
