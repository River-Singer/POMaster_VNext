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
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import {
  collectNextActionSnapshot,
  evaluateNextAction,
  NEXT_ACTION_ROUTE_IDS,
  NEXT_ACTION_ROUTE_TABLE,
  NEXT_ACTION_SNAPSHOT_INCOMPLETE,
  renderBreadcrumb,
  runContextCompile,
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

function writeContextManifest(taskId: string): void {
  mkdirSync(join(dir, ".pomaster", "state", "contexts"), { recursive: true });
  writeFileSync(
    join(dir, ".pomaster", "state", "contexts", `${taskId}.context.json`),
    `${JSON.stringify({ schema: "pomaster.context-manifest/1", generated_at_seq: 3 }, null, 2)}\n`,
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
    evidence_present: false,
    dod_ready_task_id: null,
    dod_judgeable: true,
    ...overrides,
  };
}

const TASK = { id: "TASK.T1", lifecycle: "PROPOSED", evidence: "PLANNED" };

/** 每路由行一枚 fixtures（R_UNDETERMINED 为全表未中兜底——纯函数层用畸构快照触发）。 */
const ROUTE_FIXTURES: readonly { readonly route: NextActionRouteId; readonly snapshot: NextActionSnapshot }[] = [
  { route: "R_NOT_INITIALIZED", snapshot: snap({ initialized: false }) },
  { route: "R_NO_ACTIVE_TASK", snapshot: snap({}) },
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
    route: "R_VERIFY_ENTRY",
    snapshot: snap({
      active_tasks: [TASK],
      bound_refs: ["PERMIT.T1.1"],
      active_bound_refs: ["PERMIT.T1.1"],
      task_manifest_present: true,
    }),
  },
  {
    route: "R_RECONCILE",
    snapshot: snap({
      active_tasks: [TASK],
      bound_refs: ["PERMIT.T1.1"],
      active_bound_refs: ["PERMIT.T1.1"],
      task_manifest_present: true,
      evidence_present: true,
    }),
  },
];

describe("next-action 路由表（P2 表驱动：每行 = 条件 + 建议）", () => {
  it("路由表行 id 词表闭合：NEXT_ACTION_ROUTE_TABLE 前 8 行 == NEXT_ACTION_ROUTE_IDS 前 8 行（末位 R_UNDETERMINED 为兜底缺省）", () => {
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

  it("建议命令锚词形：init/triage/closeout/steal/issue/compile/check/reconcile 各路由逐字", () => {
    const byRoute = new Map(
      ROUTE_FIXTURES.map((fixture) => [fixture.route, evaluateNextAction(fixture.snapshot).command ?? ""]),
    );
    expect(byRoute.get("R_NOT_INITIALIZED")).toContain("pomaster init");
    expect(byRoute.get("R_NO_ACTIVE_TASK")).toContain('pomaster triage "<request>"');
    expect(byRoute.get("R_CLOSEOUT_READY")).toContain("pomaster closeout TASK.T1");
    expect(byRoute.get("R_PERMIT_EXPIRED")).toContain("pomaster permit steal --permit PERMIT.T1.1");
    expect(byRoute.get("R_PERMIT_MISSING")).toBe(
      "pomaster permit issue --subject TASK.T1 --actor <type>:<name> --change-ref TASK.T1",
    );
    expect(byRoute.get("R_MANIFEST_MISSING")).toContain("pomaster context compile --role <role> --change TASK.T1");
    expect(byRoute.get("R_VERIFY_ENTRY")).toContain("pomaster check --fast");
    expect(byRoute.get("R_RECONCILE")).toContain("pomaster reconcile --permit PERMIT.T1.1");
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

    // claims 未达 VERIFIED → 未就绪（路由落回证据在座 → reconcile 行）。
    writeClaim("CLM-1", "UNVERIFIED");
    const notReady = await collectNextActionSnapshot(dir, warnings);
    expect(notReady.dod_ready_task_id).toBeNull();
    expect(evaluateNextAction(notReady).route_id).toBe("R_RECONCILE");

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
    expect(outcome.result.next_action.command).toContain('pomaster triage "<request>"');
    expect(outcome.human.join("\n")).toContain("next: pomaster triage");
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

    // ⑤ 再下一步 status：manifest 已在座 → 推进到 ⑤ VERIFY（正问链每一步都发生合理推进）。
    const afterCompile = await runStatus(dir);
    expect(afterCompile.result.next_action.route_id).toBe("R_VERIFY_ENTRY");
  });
});
