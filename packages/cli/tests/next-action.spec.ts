/**
 * next-action.spec.ts —— Next-Action 确定性路由（裁定批 E P2；09-05 提案 §2 P2）。
 *
 * 钉版面：路由表行 id 词表闭合（表驱动分母）；每行 = (条件, 建议) 首中即停的
 * 表驱动 fixtures；诚实降级（permits 台账不可读 → 许可两行跳过不乱指 +
 * NEXT_ACTION_SNAPSHOT_INCOMPLETE 留痕；store 不可读 → R_UNDETERMINED 显式缺席）；
 * status 集成（next_action 字段 + human next 行 + 失败路径诚实缺席）；
 * R-H 单一解析（09-05 审计 F1 修复）：任务绑定唯一源 = permits 台账 change_ref——
 * 对象索引 permits_active 手填不再满足路由退出条件；建议命令补 --change-ref 后
 * 公开命令正向链（status → permit issue → status → context compile → status）推进闭合。
 * 审计 N5（0.5.0 审计批 2）：manifest 在座时消费同源新鲜度（judgeTaskContextFreshness
 * ——context compile --check 同判卷），stale → R_MANIFEST_STALE 重编译路由行而非
 * R_VERIFY_ENTRY（审计复现链反转测试）；unjudgeable 诚实降级 stale 行跳过不乱指。
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import {
  BASELINE_MANIFEST_RELATIVE,
  collectNextActionSnapshot,
  evaluateNextAction,
  NEXT_ACTION_ROUTE_IDS,
  NEXT_ACTION_ROUTE_TABLE,
  NEXT_ACTION_SNAPSHOT_INCOMPLETE,
  renderBreadcrumb,
  runBaselineConfirm,
  runBaselineSet,
  runContextCompile,
  runExecutionBegin,
  runInit,
  runPermitIssue,
  runStatus,
  type NextActionRouteId,
  type NextActionSnapshot,
} from "@pomaster/cli";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pomaster-cli-next-action-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeLedger(ledger: unknown): void {
  mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "truth-index.json"),
    `${JSON.stringify(ledger, null, 2)}\n`,
    "utf8",
  );
}

function baseLedger(seq: number): Record<string, unknown> {
  return {
    ir_schema: "pomaster.truth-index/v1-draft",
    content_digest: "sha256:" + "0".repeat(64),
    generation: {
      tool: "pomaster-cli@0.0.0",
      seq,
      inputs_fingerprint: "sha256:" + "1".repeat(64),
    },
    vocab_lock: {
      state_axes: "sha256:" + "2".repeat(64),
      kinds: "sha256:" + "3".repeat(64),
      prefixes: "sha256:" + "4".repeat(64),
    },
    denominators: [],
    objects: [],
    producers: [],
    health: {
      dead_producers: [],
      orphaned_objects: [],
      worst_blindspot: null,
      alias_conflicts: [],
    },
    integrity_ruleset: "REF_INTEGRITY@v1",
  };
}

function taskRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "TASK.T1",
    kind: "task_object",
    axes: {
      lifecycle: "PROPOSED",
      confidence: "PROVISIONAL",
      evidence: "PLANNED",
      change: "STABLE",
    },
    title_zh: "任务一",
    body_ref: "truth/objects/task-object/task.t1.json",
    permits_active: [],
    ...overrides,
  };
}

// 注（R-H）：fixture 的 permits_active 只是索引行合法字段——绑定断言一律走台账
// change_ref；手填该字段的负向控制在「双源消除」用例里显式证明其不再参与绑定。

function writeTaskBody(payload: Record<string, unknown>): void {
  mkdirSync(join(dir, ".pomaster", "truth", "objects", "task-object"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "truth", "objects", "task-object", "task.t1.json"),
    `${JSON.stringify({ id: "TASK.T1", rev: 1, payload }, null, 2)}\n`,
    "utf8",
  );
}

function writePermits(permits: unknown[]): void {
  mkdirSync(join(dir, ".pomaster", "state"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "permits.json"),
    `${JSON.stringify({ version: 1, permits }, null, 2)}\n`,
    "utf8",
  );
}

function permitRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    permit_ref: "PERMIT.TASK_T1.1",
    issued_at_seq: 1,
    expires_at_seq: 99,
    scope: { subject_ids: ["TASK.T1"], write_policy: "AGENT_WITH_PERMIT" },
    requested_by: { actor_type: "human", actor: "owner", self_attested: true },
    change_ref: "TASK.T1",
    stolen_at_seq: null,
    stolen_by: null,
    stolen_reason: null,
    ...overrides,
  };
}

/**
 * 任务级 context manifest fixture（N5 起须为工具真实词形全字段：判卷入口按
 * role/task_ref 恢复原编译输入——缺 role/inputs_fingerprint 的残形会被判
 * stale_grounding，fixture 语义 =「manifest 在座且形态完整」）。
 * 注：指纹为占位异值——本 spec 的 fixture ledger 非 kernel 事务产物（object 行缺
 * rev/body_sha256 等 schema 必填），kernel 装载 SCHEMA_INVALID → 判卷诚实
 * unjudgeable（见 DoD 用例断言）；fixture 语义仍是「在座、形态完整、未判 fresh」。
 */
function writeContextManifest(taskId: string): void {
  mkdirSync(join(dir, ".pomaster", "state", "contexts"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "contexts", `${taskId}.context.json`),
    `${JSON.stringify(
      {
        schema: "pomaster.context-manifest/1",
        task_ref: taskId,
        role: "frontend",
        generated_at_seq: 3,
        compiler: { tool: "pomaster-cli@test", kernel: "pomaster-kernel@0.0.0" },
        inputs_fingerprint: "sha256:" + "a".repeat(64),
        applicability: { change: taskId, capabilities: [], change_class: null },
        partitions: {
          authoritative_project_state: [],
          required_policy: [],
          advisory_knowledge: [],
          reuse_catalog: [],
          verification: [],
        },
        catalog_source: { status: "absent", root: null, note: "fixture" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function writeClaim(ref: string, verdict: string | null): void {
  mkdirSync(join(dir, ".pomaster", "evidence", "claims"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "evidence", "claims", `${ref}.json`),
    `${JSON.stringify(
      { subject: { object_id: "TASK.T1" }, assertion: "a", verification: { verdict } },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

// ============================================================
// 表驱动：路由行 id 词表闭合 + 每行 fixtures 首中
// ============================================================

/** 空快照基座（路由表纯函数 fixtures 用；无磁盘依赖）。 */
function snap(overrides: Partial<NextActionSnapshot>): NextActionSnapshot {
  return {
    initialized: true,
    active_tasks: [],
    permit_ledger_ok: true,
    expired_bound_refs: [],
    active_bound_refs: [],
    bound_refs: [],
    task_manifest_present: false,
    task_manifest_freshness: "absent",
    task_manifest_role: null,
    evidence_present: false,
    runs_present: false,
    dod_ready_task_id: null,
    dod_judgeable: true,
    task_scope_subjects: [],
    task_execution_active: false,
    baseline_gate_codes: [],
    baseline_unknowns_remaining: null,
    baseline_blocking_remaining: null,
    baseline_pending_change_ref: null,
    ...overrides,
  };
}

const TASK = { id: "TASK.T1", lifecycle: "PROPOSED", evidence: "PLANNED" };

/** 每路由行一枚 fixtures（R_UNDETERMINED 为全表未中兜底——纯函数层用畸构快照触发）。 */
const ROUTE_FIXTURES: readonly { readonly route: NextActionRouteId; readonly snapshot: NextActionSnapshot }[] = [
  { route: "R_NOT_INITIALIZED", snapshot: snap({ initialized: false }) },
  { route: "R_NO_ACTIVE_TASK", snapshot: snap({}) },
  {
    route: "R_BASELINE_NOT_READY",
    snapshot: snap({
      active_tasks: [TASK],
      baseline_gate_codes: ["BASELINE_NOT_CONFIRMED"],
      baseline_unknowns_remaining: 0,
      baseline_blocking_remaining: 0,
    }),
  },
  {
    route: "R_CLOSEOUT_READY",
    snapshot: snap({
      active_tasks: [TASK],
      dod_ready_task_id: "TASK.T1",
    }),
  },
  {
    route: "R_PERMIT_EXPIRED",
    snapshot: snap({
      active_tasks: [TASK],
      bound_refs: ["PERMIT.T1.1"],
      expired_bound_refs: ["PERMIT.T1.1"],
    }),
  },
  {
    route: "R_PERMIT_MISSING",
    snapshot: snap({ active_tasks: [TASK] }),
  },
  {
    route: "R_MANIFEST_MISSING",
    snapshot: snap({
      active_tasks: [TASK],
      bound_refs: ["PERMIT.T1.1"],
      active_bound_refs: ["PERMIT.T1.1"],
    }),
  },
  {
    route: "R_MANIFEST_STALE",
    snapshot: snap({
      active_tasks: [TASK],
      bound_refs: ["PERMIT.T1.1"],
      active_bound_refs: ["PERMIT.T1.1"],
      task_manifest_present: true,
      task_manifest_freshness: "stale_grounding",
      task_manifest_role: "frontend",
    }),
  },
  {
    route: "R_EXECUTE_ENTRY",
    snapshot: snap({
      active_tasks: [TASK],
      bound_refs: ["PERMIT.T1.1"],
      active_bound_refs: ["PERMIT.T1.1"],
      task_manifest_present: true,
      task_manifest_freshness: "fresh",
      task_execution_active: false,
    }),
  },
  {
    route: "R_VERIFY_ENTRY",
    snapshot: snap({
      active_tasks: [TASK],
      bound_refs: ["PERMIT.T1.1"],
      active_bound_refs: ["PERMIT.T1.1"],
      task_manifest_present: true,
      task_manifest_freshness: "fresh",
      task_execution_active: true,
    }),
  },
  {
    route: "R_RECONCILE",
    snapshot: snap({
      active_tasks: [TASK],
      bound_refs: ["PERMIT.T1.1"],
      active_bound_refs: ["PERMIT.T1.1"],
      task_manifest_present: true,
      task_manifest_freshness: "fresh",
      evidence_present: true,
      runs_present: true,
    }),
  },
];

describe("next-action 路由表（P2 表驱动：每行 = 条件 + 建议）", () => {
  it("路由表行 id 词表闭合：NEXT_ACTION_ROUTE_TABLE 前 11 行 == NEXT_ACTION_ROUTE_IDS 前 11 行（末位 R_UNDETERMINED 为兜底缺省）", () => {
    expect(NEXT_ACTION_ROUTE_TABLE.map((row) => row.id)).toEqual(
      NEXT_ACTION_ROUTE_IDS.filter((id) => id !== "R_UNDETERMINED"),
    );
    expect(NEXT_ACTION_ROUTE_IDS[NEXT_ACTION_ROUTE_IDS.length - 1]).toBe("R_UNDETERMINED");
  });

  for (const fixture of ROUTE_FIXTURES) {
    it(`路由行 ${fixture.route} 首中（命令在座且事实措辞 reason）`, () => {
      const nextAction = evaluateNextAction(fixture.snapshot);
      expect(nextAction.route_id).toBe(fixture.route);
      expect(nextAction.command).not.toBeNull();
      expect(nextAction.beat).not.toBeNull();
      expect(nextAction.reason.length).toBeGreaterThan(0);
    });
  }

  it("R_UNDETERMINED 兜底缺省：command=null 的诚实缺席形态（fixtures 全表可判故不触发）", () => {
    for (const fixture of ROUTE_FIXTURES) {
      expect(evaluateNextAction(fixture.snapshot).route_id).not.toBe("R_UNDETERMINED");
    }
  });

  it("建议命令锚词形：init/brainstorm/baseline/closeout/steal/issue/compile/execution begin/check/reconcile 各路由逐字（D-5 裁决 18：八拍①=brainstorm start）", () => {
    const byRoute = new Map(
      ROUTE_FIXTURES.map((fixture) => [fixture.route, evaluateNextAction(fixture.snapshot).command ?? ""]),
    );
    expect(byRoute.get("R_NOT_INITIALIZED")).toContain("pomaster init");
    expect(byRoute.get("R_NO_ACTIVE_TASK")).toContain("pomaster brainstorm start");
    expect(byRoute.get("R_BASELINE_NOT_READY")).toBe("pomaster baseline confirm");
    expect(byRoute.get("R_CLOSEOUT_READY")).toContain("pomaster closeout TASK.T1");
    expect(byRoute.get("R_PERMIT_EXPIRED")).toContain("pomaster permit steal --permit PERMIT.T1.1");
    expect(byRoute.get("R_PERMIT_MISSING")).toBe(
      "pomaster permit issue --subject TASK.T1 --actor <type>:<name> --change-ref TASK.T1",
    );
    expect(byRoute.get("R_MANIFEST_MISSING")).toContain("pomaster context compile --role <role> --change TASK.T1");
    expect(byRoute.get("R_MANIFEST_STALE")).toBe(
      "pomaster context compile --role frontend --change TASK.T1",
    );
    expect(byRoute.get("R_EXECUTE_ENTRY")).toBe(
      "pomaster execution begin --role <role> --runtime <runtime> --identity-kind <kind> --task-id TASK.T1",
    );
    expect(byRoute.get("R_VERIFY_ENTRY")).toContain("pomaster check --fast");
    expect(byRoute.get("R_RECONCILE")).toContain("pomaster reconcile --permit PERMIT.T1.1");
  });

  it("R_BASELINE_NOT_READY 子态渲染：pending-change 携 ref / drifted 三通道 / 阻塞在册不路由 / 豁免工作区照常路由（T2 R5 + P-C1 T13）", () => {
    // pending-change：终结变更批命令携同 ref。
    const pending = evaluateNextAction(
      snap({
        active_tasks: [TASK],
        baseline_gate_codes: ["BASELINE_NOT_CONFIRMED"],
        baseline_unknowns_remaining: 0,
        baseline_blocking_remaining: 0,
        baseline_pending_change_ref: "CHANGE.C1",
      }),
    );
    expect(pending.route_id).toBe("R_BASELINE_NOT_READY");
    expect(pending.command).toBe("pomaster baseline confirm --change CHANGE.C1");
    // drifted：重确认三通道提示。
    const drifted = evaluateNextAction(
      snap({
        active_tasks: [TASK],
        baseline_gate_codes: ["BASELINE_DRIFT"],
        baseline_unknowns_remaining: 0,
        baseline_blocking_remaining: 0,
      }),
    );
    expect(drifted.route_id).toBe("R_BASELINE_NOT_READY");
    expect(drifted.command).toContain("baseline confirm");
    expect(drifted.command).toContain("--ack-drifted");
    // 阻塞键在册 → 不路由（诚实缺席——指 confirm 只会被 confirm 自身闸拒）。
    const blockingRemain = evaluateNextAction(
      snap({
        active_tasks: [TASK],
        baseline_gate_codes: ["BASELINE_NOT_CONFIRMED"],
        baseline_unknowns_remaining: 6,
        baseline_blocking_remaining: 6,
      }),
    );
    expect(blockingRemain.route_id).toBe("R_PERMIT_MISSING");
    // P-C1 豁免工作区：blocking_remaining=0 而 unknowns 总口径>0（豁免行在册）→ 照常路由。
    const exempted = evaluateNextAction(
      snap({
        active_tasks: [TASK],
        baseline_gate_codes: ["BASELINE_NOT_CONFIRMED"],
        baseline_unknowns_remaining: 1,
        baseline_blocking_remaining: 0,
      }),
    );
    expect(exempted.route_id).toBe("R_BASELINE_NOT_READY");
    expect(exempted.command).toBe("pomaster baseline confirm");
    // 阻塞集不可判（null——stack/台账平面损坏降级）→ fail-closed 不路由。
    const unjudgeable = evaluateNextAction(
      snap({
        active_tasks: [TASK],
        baseline_gate_codes: ["BASELINE_NOT_CONFIRMED"],
        baseline_unknowns_remaining: 0,
        baseline_blocking_remaining: null,
      }),
    );
    expect(unjudgeable.route_id).toBe("R_PERMIT_MISSING");
    // manifest 缺席（两口径 null + codes 空）→ 不路由。
    const manifestAbsent = evaluateNextAction(snap({ active_tasks: [TASK] }));
    expect(manifestAbsent.route_id).toBe("R_PERMIT_MISSING");
  });

  it("R_EXECUTE_ENTRY/R_VERIFY_ENTRY 执行感知分叉（T2 R3）：无留痕无在途→④；在途→⑤；留痕在座→⑥；不可判→两行诚实跳过", () => {
    const base = {
      active_tasks: [TASK],
      bound_refs: ["PERMIT.T1.1"],
      active_bound_refs: ["PERMIT.T1.1"],
      task_manifest_present: true,
      task_manifest_freshness: "fresh" as const,
    };
    // runs 留痕空 + 无在途执行 → ④（R1 起 promote 自动 claim 不算执行证据——分母锚 runs）。
    expect(
      evaluateNextAction(snap({ ...base, task_execution_active: false })).route_id,
    ).toBe("R_EXECUTE_ENTRY");
    // 在途执行 → ⑤（拍序：执行期间自检先于对账）。
    expect(
      evaluateNextAction(snap({ ...base, task_execution_active: true })).route_id,
    ).toBe("R_VERIFY_ENTRY");
    // runs 留痕在座 + 无在途执行 → ⑥（GRN 在座 = 验证活动已开始）。
    expect(
      evaluateNextAction(
        snap({ ...base, task_execution_active: false, runs_present: true, evidence_present: true }),
      ).route_id,
    ).toBe("R_RECONCILE");
    // 不可判（档案平面坏形）→ ④⑤ 均跳过 → 落 R_UNDETERMINED（诚实缺席，不乱指）。
    const undetermined = evaluateNextAction(snap({ ...base, task_execution_active: null }));
    expect(undetermined.route_id).toBe("R_UNDETERMINED");
    expect(undetermined.command).toBeNull();
    expect(undetermined.reason).toContain("R_EXECUTE_ENTRY");
  });

  it("首中即停：closeout 就绪优先于许可/投影行（⑧ 优先级高于 ②③）", () => {
    const nextAction = evaluateNextAction(
      snap({
        active_tasks: [TASK],
        dod_ready_task_id: "TASK.T1",
        task_manifest_present: false,
      }),
    );
    expect(nextAction.route_id).toBe("R_CLOSEOUT_READY");
  });

  it("renderBreadcrumb：有任务=单行拍位 + 命令；无任务=null（调用方静默）", () => {
    const manifestFixture = ROUTE_FIXTURES.find((f) => f.route === "R_MANIFEST_MISSING")!;
    const nextAction = evaluateNextAction(manifestFixture.snapshot);
    const line = renderBreadcrumb(nextAction, manifestFixture.snapshot);
    expect(line).toMatch(/^POMaster breadcrumb: TASK\.T1（八拍③）→ /);
    expect(line?.split("\n").length).toBe(1);
    expect(renderBreadcrumb(evaluateNextAction(snap({})), snap({}))).toBeNull();
  });
});

// ============================================================
// 集成：快照装配 + status next_action 字段
// ============================================================

describe("next-action 快照装配（既有只读面）", () => {
  it("未初始化 → initialized=false + R_NOT_INITIALIZED（NOT_INITIALIZED 告警留痕）", async () => {
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const snapshot = await collectNextActionSnapshot(dir, warnings);
    expect(snapshot.initialized).toBe(false);
    expect(evaluateNextAction(snapshot).command).toContain("pomaster init");
    expect(warnings.map((w) => w.code)).toContain("NOT_INITIALIZED");
  });

  it("活跃任务判定：PROPOSED/CURRENT 且 evidence≠VERIFIED；VERIFIED/终态/非 TASK 前缀不活跃", async () => {
    writeLedger(
      baseLedger(7),
    );
    const ledger = baseLedger(7);
    ledger.objects = [
      taskRow({ id: "TASK.T1" }),
      taskRow({ id: "TASK.T2", axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "VERIFIED", change: "STABLE" } }),
      taskRow({ id: "TASK.T3", axes: { lifecycle: "SUPERSEDED", confidence: "PROVISIONAL", evidence: "PLANNED", change: "STABLE" } }),
      taskRow({ id: "PAGE.NOT_A_TASK" }),
    ];
    writeLedger(ledger);
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const snapshot = await collectNextActionSnapshot(dir, warnings);
    expect(snapshot.active_tasks.map((task) => task.id)).toEqual(["TASK.T1"]);
  });

  it("绑定与过期分类（R-H 台账单一解析）：change_ref 命中活跃任务 id 才算绑定；seq 判过期；stolen 与他任务许可不入两列", async () => {
    const ledger = baseLedger(10);
    ledger.objects = [taskRow({})];
    writeLedger(ledger);
    writePermits([
      permitRow({ permit_ref: "PERMIT.A.1", expires_at_seq: 5 }),
      permitRow({ permit_ref: "PERMIT.B.1", expires_at_seq: 99 }),
      permitRow({ permit_ref: "PERMIT.C.1", expires_at_seq: 5, stolen_at_seq: 6 }),
      permitRow({ permit_ref: "PERMIT.D.1", expires_at_seq: 5, change_ref: "CHANGE.OTHER" }),
    ]);
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const snapshot = await collectNextActionSnapshot(dir, warnings);
    expect(snapshot.expired_bound_refs).toEqual(["PERMIT.A.1"]);
    expect(snapshot.active_bound_refs).toEqual(["PERMIT.B.1"]);
    expect(snapshot.bound_refs).toEqual(["PERMIT.A.1", "PERMIT.B.1"]);
    expect(evaluateNextAction(snapshot).route_id).toBe("R_PERMIT_EXPIRED");
  });

  it("双源消除（R-H 回归）：对象索引 permits_active 手填不再是绑定依据——台账无 change_ref 绑定仍 R_PERMIT_MISSING；台账 change_ref 绑定（对象零手填）即跳出该行", async () => {
    // 负向控制：对象行手填 permits_active 但台账该许可 change_ref=null（不绑任务）→ 死循环退出条件不被假满足。
    const ledger = baseLedger(10);
    ledger.objects = [taskRow({ permits_active: ["PERMIT.GHOST.1"] })];
    writeLedger(ledger);
    writePermits([permitRow({ permit_ref: "PERMIT.GHOST.1", change_ref: null })]);
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const handFilled = await collectNextActionSnapshot(dir, warnings);
    expect(handFilled.bound_refs).toEqual([]);
    expect(evaluateNextAction(handFilled).route_id).toBe("R_PERMIT_MISSING");

    // 正向：台账 change_ref=TASK.T1（permitRow 缺省）即绑定；对象行零手填。
    const cleanLedger = baseLedger(10);
    cleanLedger.objects = [taskRow({})];
    writeLedger(cleanLedger);
    writePermits([permitRow({})]);
    const ledgerBound = await collectNextActionSnapshot(dir, warnings);
    expect(ledgerBound.bound_refs).toEqual(["PERMIT.TASK_T1.1"]);
    expect(evaluateNextAction(ledgerBound).route_id).toBe("R_MANIFEST_MISSING");
  });

  it("诚实降级：permits 台账不可读 → 许可两行跳过（不乱指）+ 落到可判行 + 告警留痕", async () => {
    const ledger = baseLedger(10);
    ledger.objects = [taskRow({})];
    writeLedger(ledger);
    writePermits([]);
    writeFileSync(join(dir, ".pomaster", "state", "permits.json"), "{nope", "utf8");
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const snapshot = await collectNextActionSnapshot(dir, warnings);
    expect(snapshot.permit_ledger_ok).toBe(false);
    expect(snapshot.expired_bound_refs).toEqual([]);
    expect(snapshot.bound_refs).toEqual([]);
    const nextAction = evaluateNextAction(snapshot);
    expect(nextAction.route_id).not.toBe("R_PERMIT_EXPIRED");
    expect(nextAction.route_id).not.toBe("R_PERMIT_MISSING");
    expect(warnings.map((w) => w.code)).toContain(NEXT_ACTION_SNAPSHOT_INCOMPLETE);
  });

  it("DoD claims 侧预览：acceptance 全映射 VERIFIED → dod_ready；读取失败 → dod_judgeable=false 行跳过", async () => {
    const ledger = baseLedger(5);
    ledger.objects = [
      taskRow({ body_ref: "truth/objects/task-object/task.t1.json" }),
    ];
    writeLedger(ledger);
    writePermits([permitRow({})]);
    writeContextManifest("TASK.T1");
    writeClaim("CLM-1", "VERIFIED");
    writeTaskBody({
      intent: "做一件事",
      acceptance: [{ criterion: "验收一", claim: "CLM-1" }],
    });
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const ready = await collectNextActionSnapshot(dir, warnings);
    expect(ready.dod_ready_task_id).toBe("TASK.T1");
    expect(evaluateNextAction(ready).route_id).toBe("R_CLOSEOUT_READY");

    // N5 新鲜度诚实降级钉：fixture ledger 非 kernel 事务产物（object 行缺 schema
    // 必填字段）→ 判卷入口装载 SCHEMA_INVALID → unjudgeable（不冒充 fresh 也不乱指
    // stale；stale 路由行跳过 + NEXT_ACTION_SNAPSHOT_INCOMPLETE 留痕）。
    expect(ready.task_manifest_freshness).toBe("unjudgeable");
    expect(ready.task_manifest_role).toBe("frontend");
    expect(warnings.map((w) => w.code)).toContain(NEXT_ACTION_SNAPSHOT_INCOMPLETE);

    // claims 未达 VERIFIED → 未就绪（dod_ready 落空）；无 runs 留痕且无在途执行档案
    // → ④ EXECUTE 感知入口（T2 R3：执行感知分母锚 runs 留痕——claims 在座不算验证
    // 已发生；unjudgeable 不改变该降级路径——manifest 两行均不命中）。
    writeClaim("CLM-1", "UNVERIFIED");
    const notReady = await collectNextActionSnapshot(dir, warnings);
    expect(notReady.dod_ready_task_id).toBeNull();
    expect(evaluateNextAction(notReady).route_id).toBe("R_EXECUTE_ENTRY");

    // 正文缺失（A1）→ closeout 行跳过（不乱指），落到 judgeable 后续行。
    const brokenLedger = baseLedger(5);
    brokenLedger.objects = [
      taskRow({ body_ref: "truth/objects/task-object/absent.json" }),
    ];
    writeLedger(brokenLedger);
    const broken = await collectNextActionSnapshot(dir, warnings);
    expect(broken.dod_judgeable).toBe(false);
    expect(evaluateNextAction(broken).route_id).not.toBe("R_CLOSEOUT_READY");
  });
});

describe("status next_action 字段（P2 集成）", () => {
  it("无活跃任务 → route=R_NO_ACTIVE_TASK；human 尾行带 next 路标", async () => {
    writeLedger(baseLedger(3));
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(true);
    expect(outcome.result.next_action.route_id).toBe("R_NO_ACTIVE_TASK");
    expect(outcome.result.next_action.command).toContain("pomaster brainstorm start");
    expect(outcome.human.join("\n")).toContain("next: pomaster brainstorm start");
  });

  it("活跃任务无许可 → R_PERMIT_MISSING + 命令携带 --subject 与 --change-ref（R-H：不带 change_ref 的签发无法通过台账解析满足本行退出条件）", async () => {
    const ledger = baseLedger(3);
    ledger.objects = [taskRow({})];
    writeLedger(ledger);
    const outcome = await runStatus(dir);
    expect(outcome.result.next_action.route_id).toBe("R_PERMIT_MISSING");
    expect(outcome.result.next_action.beat).toBe("②");
    expect(outcome.result.next_action.command).toBe(
      "pomaster permit issue --subject TASK.T1 --actor <type>:<name> --change-ref TASK.T1",
    );
    expect(outcome.human.join("\n")).toContain("pomaster permit issue --subject TASK.T1");
  });

  it("未初始化 → ok=false；result.next_action 诚实缺席（R_UNDETERMINED / store 不可读）", async () => {
    const outcome = await runStatus(dir);
    expect(outcome.ok).toBe(false);
    expect(outcome.result.next_action.route_id).toBe("R_UNDETERMINED");
    expect(outcome.result.next_action.command).toBeNull();
  });
});

// ============================================================
// R-H 单一解析正向链（09-05 审计 F1 验收：公开命令回归，禁手填状态）
// ============================================================

describe("R-H 正向链（公开命令：status 提示 → 照做 → 合理推进）", () => {
  /** 合法 TASK 入库（kernel 事务登记；authority owner 沿 closeout.spec 先例补登记）。 */
  async function seedTaskViaKernel(): Promise<void> {
    await createStore(dir);
    const authPath = join(dir, ".pomaster", "state", "authority.json");
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
      authorities: Record<string, unknown>;
    };
    auth.authorities["BUSINESS_OWNER"] = {};
    writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
    const store = await createStore(dir);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "TASK.T1",
            kind: "task_object",
            axisProfile: "task_default",
            axes: {
              lifecycle: "CURRENT",
              confidence: "PROVISIONAL",
              evidence: "IMPLEMENTED",
              change: "STABLE",
            },
            titleZh: "正向链回归任务",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              intent: "审计 F1 正向链回归",
              acceptance: [],
              class_scan_result: {
                scope: "src/**",
                hits: 0,
                fixed_count: 0,
                regression_case_ref: "GRN-0001",
              },
            },
          } as never,
        },
      ],
    });
  }

  it("status 建议 permit issue（含 --change-ref）→ 照做签发 → 下一步 status 不再 R_PERMIT_MISSING；context compile must_entries 包含该任务；再下一步推进到 ⑤", async () => {
    await seedTaskViaKernel();

    // ① status → R_PERMIT_MISSING；建议命令补齐 --change-ref（审计 F1 第二层病灶修复锚）。
    const before = await runStatus(dir);
    expect(before.ok).toBe(true);
    expect(before.result.next_action.route_id).toBe("R_PERMIT_MISSING");
    expect(before.result.next_action.command).toBe(
      "pomaster permit issue --subject TASK.T1 --actor <type>:<name> --change-ref TASK.T1",
    );

    // ② 照做（建议命令参数 ↔ runPermitIssue 输入逐参对应；签发只写台账——R-H 下
    //    台账即唯一绑定解析源，无需任何对象索引回写）。
    const issued = await runPermitIssue(dir, {
      subjects: ["TASK.T1"],
      actor: "human:owner",
      changeRef: "TASK.T1",
    });
    expect(issued.ok).toBe(true);
    expect(issued.result.change_ref).toBe("TASK.T1");

    // ③ 下一步 status：退出条件由台账满足 → 不再 R_PERMIT_MISSING，推进到 ③ PROJECTION。
    const after = await runStatus(dir);
    expect(after.result.next_action.route_id).toBe("R_MANIFEST_MISSING");

    // ④ 照做 context compile（--change TASK.T1）→ 投影许可通道按 changeRef 命中台账 →
    //    must_entries 包含该任务（审计 F1 验收「must_entries 包含该任务」）。
    const compiled = await runContextCompile(dir, "frontend", undefined, { change: "TASK.T1" });
    expect(compiled.ok).toBe(true);
    const taskEntry = compiled.result.manifest.must_entries.find((entry) => entry.ref === "TASK.T1");
    expect(taskEntry).toBeDefined();
    expect(taskEntry?.reason).toContain("permit");

    // ⑤ 再下一步 status：manifest 已在座、无在途执行档案 → 推进到 ④ EXECUTE（T2 R3
    //    执行感知：先登记执行身份再进 VERIFY，而不是直接跳 ⑤）。
    const afterCompile = await runStatus(dir);
    expect(afterCompile.result.next_action.route_id).toBe("R_EXECUTE_ENTRY");
    expect(afterCompile.result.next_action.beat).toBe("④");
    expect(afterCompile.result.next_action.command).toContain("pomaster execution begin");
    expect(afterCompile.result.next_action.command).toContain("--task-id TASK.T1");

    // ⑥ 照做 execution begin（建议命令逐参对应）→ 在途执行档案在座 → 推进到 ⑤ VERIFY
    //    （正问链每一步都发生合理推进）。
    const began = await runExecutionBegin(dir, {
      role: "implementer",
      runtime: "script",
      identityKind: "script",
      taskId: "TASK.T1",
    });
    expect(began.ok).toBe(true);
    expect(began.result.execution_id).toMatch(/^AGX-[0-9]{4}-[0-9]+$/);
    const afterBegin = await runStatus(dir);
    expect(afterBegin.result.next_action.route_id).toBe("R_VERIFY_ENTRY");
    expect(afterBegin.result.next_action.command).toContain("pomaster check --fast");
  });
});

// ============================================================
// 审计 N5 复现链反转（0.5.0 审计批 2）：manifest 在座但指纹漂移 → 导航给重编译
// 入口（R_MANIFEST_STALE）而非执行/验证入口；重编译后回到 ④ EXECUTE 感知入口
// （T2 R3：无在途执行档案时 fresh 终态 = R_EXECUTE_ENTRY）。
// 判据锚（audit-report.md N5 + cli/src/context.ts judgeTaskContextFreshness 契约注记）。
// ============================================================

describe("审计 N5 复现链反转：stale → R_MANIFEST_STALE 重编译入口", () => {
  const N5_PAYLOAD_BASE = {
    class_scan_result: {
      scope: "src/shared/**",
      hits: 0,
      fixed_count: 0,
      regression_case_ref: "GRN-N5",
    },
  };

  /** 合法 TASK 入库（kernel 事务；等价 pre-dev ①②后的任务在册形态）。 */
  async function seedTaskIntent(intent: string): Promise<void> {
    await createStore(dir);
    const authPath = join(dir, ".pomaster", "state", "authority.json");
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
      authorities: Record<string, unknown>;
    };
    auth.authorities["BUSINESS_OWNER"] = {};
    writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
    const store = await createStore(dir);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "TASK.T1",
            kind: "task_object",
            axisProfile: "task_default",
            axes: {
              lifecycle: "CURRENT",
              confidence: "PROVISIONAL",
              evidence: "IMPLEMENTED",
              change: "STABLE",
            },
            titleZh: "审计 N5 复现任务",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: { intent, ...N5_PAYLOAD_BASE },
          } as never,
        },
      ],
    });
  }

  it(
    "pre-dev 落 manifest → maintain 改 task intent → status 给 stale 路由行（含重编译命令）而非 R_EXECUTE_ENTRY → 重编译后回到 R_EXECUTE_ENTRY",
    { timeout: 60_000 },
    async () => {
      await seedTaskIntent("审计 N5 复现初始意图");
      // pre-dev ②：签发带任务归属的许可（change_ref=TASK.T1——许可通道激活前提）。
      const issued = await runPermitIssue(dir, {
        subjects: ["TASK.T1"],
        actor: "human:owner",
        changeRef: "TASK.T1",
      });
      expect(issued.ok).toBe(true);
      // pre-dev ③：runContextCompile 完整编排——manifest 真实落盘。
      const compiled = await runContextCompile(dir, "frontend", undefined, { change: "TASK.T1" });
      expect(compiled.ok).toBe(true);
      expect(compiled.result.persisted).toBe(true);

      // fresh 基线：路由 = R_EXECUTE_ENTRY（T2 R3：fresh manifest + 证据分母空 + 无在途
      // 执行档案 → 先登记执行身份——④ EXECUTE 感知新增语义）。
      const freshStatus = await runStatus(dir);
      expect(freshStatus.result.next_action.route_id).toBe("R_EXECUTE_ENTRY");
      expect(freshStatus.result.next_action.command).toContain("pomaster execution begin");

      // maintain 修改同一任务 intent（审计复现步骤：正文 rev 递增 + body_sha256 变
      // ——F2 scopeContent 绑定命中，重编译指纹必变）。
      await seedTaskIntent("审计 N5 复现：maintain 改 intent 后的意图");

      // 审计缺陷反转：stale 不再放行 ④⑤，而是 ③ PROJECTION 重编译入口
      // （role 取现盘 manifest 记录值渲染具体命令——可直接照做）。
      const staleStatus = await runStatus(dir);
      expect(staleStatus.result.next_action.route_id).toBe("R_MANIFEST_STALE");
      expect(staleStatus.result.next_action.beat).toBe("③");
      expect(staleStatus.result.next_action.command).toBe(
        "pomaster context compile --role frontend --change TASK.T1",
      );
      expect(staleStatus.human.join("\n")).toContain(
        "pomaster context compile --role frontend --change TASK.T1",
      );

      // 快照机读面同判（status/session/alerts 三通道共享同一 collectNextActionSnapshot
      // 装配——单一分母，禁两套路由口径）。
      const snapshotWarnings: { code: string; message: string; hint?: string }[] = [];
      const staleSnapshot = await collectNextActionSnapshot(dir, snapshotWarnings);
      expect(staleSnapshot.task_manifest_freshness).toBe("stale_grounding");
      expect(staleSnapshot.task_manifest_role).toBe("frontend");
      expect(evaluateNextAction(staleSnapshot).route_id).toBe("R_MANIFEST_STALE");
      expect(snapshotWarnings.map((w) => w.code)).not.toContain(NEXT_ACTION_SNAPSHOT_INCOMPLETE);

      // 照做重编译（覆盖写同 id 文件）→ fresh → 回到 R_EXECUTE_ENTRY（stale 闭环；
      // ④ EXECUTE 感知后的 fresh 终态——执行身份登记优先于 VERIFY 入口）。
      const recompiled = await runContextCompile(dir, "frontend", undefined, { change: "TASK.T1" });
      expect(recompiled.ok).toBe(true);
      expect(recompiled.result.stale_check.state).toBe("stale_grounding");
      const recoveredStatus = await runStatus(dir);
      expect(recoveredStatus.result.next_action.route_id).toBe("R_EXECUTE_ENTRY");
    },
  );
});

// ============================================================
// T2 R2：scope 派生（affected_objects → permit --subject 派生建议）
// ============================================================

describe("scope 派生建议（T2 R2：affected_objects → R_PERMIT_MISSING 渲染）", () => {
  it("任务 affected_objects 的 PAGE/CAPABILITY/COMPONENT/API_REQ 成员派生为 --subject 建议（字典序去重）；无派生成员回退 TASK 自身占位", async () => {
    const ledger = baseLedger(3);
    ledger.objects = [taskRow({})];
    writeLedger(ledger);
    writeTaskBody({
      intent: "派生建议源",
      acceptance: [],
      // 乱序 + 重复 + 非 scope 前缀混入——装配层排序去重过滤。
      affected_objects: ["PAGE.DASHBOARD", "TASK.T1", "CAPABILITY.GRID", "PAGE.DASHBOARD", "CHANGE.OTHER"],
    });
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const snapshot = await collectNextActionSnapshot(dir, warnings);
    expect(snapshot.task_scope_subjects).toEqual(["CAPABILITY.GRID", "PAGE.DASHBOARD"]);
    const nextAction = evaluateNextAction(snapshot);
    expect(nextAction.route_id).toBe("R_PERMIT_MISSING");
    expect(nextAction.command).toBe(
      "pomaster permit issue --subject CAPABILITY.GRID --subject PAGE.DASHBOARD --actor <type>:<name> --change-ref TASK.T1",
    );
    expect(nextAction.reason).toContain("派生建议");
  });

  it("正文缺失 → task_scope_subjects 空（回退占位词形，字节级兼容既有呈现）", async () => {
    const ledger = baseLedger(3);
    ledger.objects = [taskRow({ body_ref: "truth/objects/task-object/absent.json" })];
    writeLedger(ledger);
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const snapshot = await collectNextActionSnapshot(dir, warnings);
    expect(snapshot.task_scope_subjects).toEqual([]);
    expect(evaluateNextAction(snapshot).command).toBe(
      "pomaster permit issue --subject TASK.T1 --actor <type>:<name> --change-ref TASK.T1",
    );
  });
});

// ============================================================
// T2 R3：④ EXECUTE 感知（executions 档案平面在场性）
// ============================================================

describe("④ EXECUTE 感知（T2 R3：executions 档案平面扫描）", () => {
  function writeExecution(fileName: string, record: Record<string, unknown>): void {
    mkdirSync(join(dir, ".pomaster", "executions"), { recursive: true });
    writeFileSync(
      join(dir, ".pomaster", "executions", fileName),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8",
    );
  }

  it("在途档案（task_id 命中 + ended_at=null）→ task_execution_active=true；已封口/他任务/平面缺席 → false", async () => {
    const ledger = baseLedger(3);
    ledger.objects = [taskRow({})];
    writeLedger(ledger);
    const warnings: { code: string; message: string; hint?: string }[] = [];
    // 平面缺席 → false（诚实无在途）。
    expect((await collectNextActionSnapshot(dir, warnings)).task_execution_active).toBe(false);
    // 他任务在途 → false。
    writeExecution("AGX-2026-00001.json", { execution_id: "AGX-2026-00001", task_id: "TASK.OTHER", ended_at: null });
    expect((await collectNextActionSnapshot(dir, warnings)).task_execution_active).toBe(false);
    // 本任务已封口 → false。
    writeExecution("AGX-2026-00002.json", { execution_id: "AGX-2026-00002", task_id: "TASK.T1", ended_at: "2026-01-01T00:00:00.000Z" });
    expect((await collectNextActionSnapshot(dir, warnings)).task_execution_active).toBe(false);
    // 本任务在途 → true。
    writeExecution("AGX-2026-00003.json", { execution_id: "AGX-2026-00003", task_id: "TASK.T1", ended_at: null });
    expect((await collectNextActionSnapshot(dir, warnings)).task_execution_active).toBe(true);
  });

  it("档案坏形（JSON 不可解析/字段形态坏）→ task_execution_active=null 诚实不可判 + 告警留痕", async () => {
    const ledger = baseLedger(3);
    ledger.objects = [taskRow({})];
    writeLedger(ledger);
    mkdirSync(join(dir, ".pomaster", "executions"), { recursive: true });
    writeFileSync(join(dir, ".pomaster", "executions", "AGX-2026-00001.json"), "{nope", "utf8");
    const warnings: { code: string; message: string; hint?: string }[] = [];
    const snapshot = await collectNextActionSnapshot(dir, warnings);
    expect(snapshot.task_execution_active).toBeNull();
    expect(warnings.map((w) => w.code)).toContain(NEXT_ACTION_SNAPSHOT_INCOMPLETE);
  });
});

// ============================================================
// T2 R5：R_BASELINE_NOT_READY 集成（真实 baseline 面）
// ============================================================

/**
 * 合法 TASK 入库（init 已建 store；kernel 事务登记，authority owner 补登记）。
 * （P-C1 T13 与 T2 R5 集成两 describe 共用——提升到模块级。）
 */
async function seedTaskInInitedStore(): Promise<void> {
  const authPath = join(dir, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
  const store = await createStore(dir);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.T1",
          kind: "task_object",
          axisProfile: "task_default",
          axes: {
            lifecycle: "CURRENT",
            confidence: "PROVISIONAL",
            evidence: "IMPLEMENTED",
            change: "STABLE",
          },
          titleZh: "baseline 路由集成任务",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "R5 集成",
            acceptance: [],
            class_scan_result: {
              scope: "src/**",
              hits: 0,
              fixed_count: 0,
              regression_case_ref: "GRN-R5",
            },
          },
        } as never,
      },
    ],
  });
}

describe("R_BASELINE_NOT_READY 集成（T2 R5：真实 init/baseline 面）", () => {
  it(
    "unknowns 未销账 + 活跃任务 → 不路由 baseline（落 R_PERMIT_MISSING）；14 键销账后未确认 → R_BASELINE_NOT_READY（baseline confirm）；确认后回落 R_PERMIT_MISSING",
    { timeout: 60_000 },
    async () => {
      await runInit(dir);
      await seedTaskInInitedStore();
      // unknowns 14 未销账 → R_BASELINE_NOT_READY 不路由（指 confirm 只会被 confirm 闸拒）。
      const beforeSettle = await runStatus(dir);
      expect(beforeSettle.result.next_action.route_id).toBe("R_PERMIT_MISSING");
      // 14 键全销账（fixture-discovery-chain 同式；grid/cache 收 none 词形）。
      const lanes = [
        { lane: "frontend", keys: ["framework", "language", "build", "router", "state", "grid", "ui", "css", "testing"] },
        { lane: "backend", keys: ["language", "framework", "persistence", "database", "cache"] },
      ] as const;
      for (const { lane, keys } of lanes) {
        for (const key of keys) {
          const setOutcome = await runBaselineSet(dir, {
            lane,
            key,
            value: key === "grid" || key === "cache" ? "none" : `${lane}-${key}-value`,
          });
          expect(setOutcome.ok, `${lane}.${key}`).toBe(true);
        }
      }
      // 全销账未确认 → R_BASELINE_NOT_READY（命令 = 裸 confirm；unknowns 0 呈现）。
      const unconfirmed = await runStatus(dir);
      expect(unconfirmed.result.next_action.route_id).toBe("R_BASELINE_NOT_READY");
      expect(unconfirmed.result.next_action.beat).toBe("0");
      expect(unconfirmed.result.next_action.command).toBe("pomaster baseline confirm");
      // 确认 → gate 转绿 → 回落 R_PERMIT_MISSING（确认是收口前账，还账后继续任务链）。
      const confirmed = await runBaselineConfirm(dir, {});
      expect(confirmed.ok).toBe(true);
      const afterConfirm = await runStatus(dir);
      expect(afterConfirm.result.next_action.route_id).toBe("R_PERMIT_MISSING");
    },
  );
});

// ============================================================
// P-C1 T13：R_BASELINE_NOT_READY 路由判据改用 blocking_remaining（豁免工作区适配）
// ============================================================

describe("P-C1 阻塞集路由适配（T13：豁免工作区照常给 confirm 指引）", () => {
  it(
    "对照：grid flat 行在册（缺省 BLOCKING）→ blocking_remaining=1 不路由；豁免登记（DEFERRED 结构化行）→ blocking=0 照常路由 confirm，unknowns 总口径呈现不删",
    { timeout: 60_000 },
    async () => {
      await runInit(dir);
      await seedTaskInInitedStore();
      // 13 键销账，grid 留台账（先 flat 后豁免——Owner 手编登记的两态对照）。
      const lanes = [
        { lane: "frontend", keys: ["framework", "language", "build", "router", "state", "ui", "css", "testing"] },
        { lane: "backend", keys: ["language", "framework", "persistence", "database", "cache"] },
      ] as const;
      for (const { lane, keys } of lanes) {
        for (const key of keys) {
          const setOutcome = await runBaselineSet(dir, {
            lane,
            key,
            value: key === "cache" ? "none" : `${lane}-${key}-value`,
          });
          expect(setOutcome.ok, `${lane}.${key}`).toBe(true);
        }
      }
      // 对照组：grid flat 行在册（缺省 BLOCKING）→ 阻塞在册不路由（诚实缺席）。
      const control = await runStatus(dir);
      expect(control.result.next_action.route_id).toBe("R_PERMIT_MISSING");
      expect(control.result.baseline_confirmation?.blocking_remaining).toBe(1);
      expect(control.result.baseline_confirmation?.unknowns_remaining).toBe(1);
      // 实验组：Owner 手编把 grid 行改写为 DEFERRED 结构化豁免行 → 阻塞集清零。
      const manifestPath = join(dir, BASELINE_MANIFEST_RELATIVE);
      const manifestText = readFileSync(manifestPath, "utf8");
      const lines = manifestText.split("\n");
      const gridRowIndex = lines.findIndex((line) => line.trim() === "- baseline/frontend/stack.yaml:grid");
      expect(gridRowIndex).toBeGreaterThanOrEqual(0);
      const exempted = [
        ...lines.slice(0, gridRowIndex),
        "  - key: baseline/frontend/stack.yaml:grid",
        "    applicability: DEFERRED",
        "    statement: Grid 选型显式延后（Q7 判定不阻塞当前增量）",
        "    classification: DEFERRED_DECISION",
        ...lines.slice(gridRowIndex + 1),
      ].join("\n");
      writeFileSync(manifestPath, exempted, "utf8");
      const routed = await runStatus(dir);
      expect(routed.result.next_action.route_id).toBe("R_BASELINE_NOT_READY");
      expect(routed.result.next_action.beat).toBe("0");
      expect(routed.result.next_action.command).toBe("pomaster baseline confirm");
      // 总口径呈现不删：unknowns_remaining = 1（豁免行在册）而阻塞集 = 0。
      expect(routed.result.baseline_confirmation?.blocking_remaining).toBe(0);
      expect(routed.result.baseline_confirmation?.unknowns_remaining).toBe(1);
    },
  );
});
