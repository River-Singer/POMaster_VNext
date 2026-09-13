/**
 * session-resume-reconcile.spec.ts —— W4-S1：恢复对账接线（attach/resume 补 reconcile
 * 前置消费 + 在途诚实降级位）。
 *
 * 需求锚（evidence-invalidation-map.md §3 表 B B11 行 + §5-8 最小增量；09-10 PRD
 * §6-2 恢复先对账 / REQ-07 / AC-06）：
 * - B11 缺口：attach 回显 resumed_task 仅指针回显，恢复动作链未接 reconcile；
 *   §5-8：reconcile 八拍已存在，接线而非新建（提取共用消费函数 judgeReconcile，
 *   非复制——reconcile 命令出口语义零改动）；
 * - resume 对账闸形态裁定：缺省不跑（attach 是 hook 重入口，缺省跑会改写既有通路
 *   语义）；`--reconcile <permit>` 显式在座时 fail-closed——dirty/baseline 缺失阻断
 *   于一切副作用之前（会话档案未落盘、journal 零事件），`--reconcile-force` 显式
 *   越权放行（信封留痕；与顶替 --force 分轴不共用——两个授权各自显式）；
 * - 在途诚实分态（§6-3 回执未存 ≠ 未发生）：execution list 对 end 缺失的执行按
 *   evidence 平面 GRN/OBS 回执计数区分「有已入账产物 N 件 / 零产物」；
 * - 零破坏红线：不带 --reconcile 的 attach 行为零变化（result.reconcile=null 显式
 *   未跑）；reconcile 命令行为零变化；既有 status 两态词形不动（在途分态是新平行位）。
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  beginExecution,
  buildObservationReceipt,
  createStore,
  endExecution,
  persistObservationRecord,
  type Store,
} from "@pomaster/kernel";
import {
  runExecutionList,
  runPermitIssue,
  runSessionAttach,
} from "@pomaster/cli";
import { makeStore, pageEnvelope } from "../../../packages/kernel/tests/helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture（reconcile.spec.ts 同源：upsert → issue → 篡改出 delta）
// ============================================================

async function upsertDashboard(overrides: Record<string, unknown> = {}): Promise<void> {
  const fresh = await createStore(root);
  await applyTransaction(fresh, {
    ops: [{ op: "upsert_object", envelope: pageEnvelope(overrides) as never }],
  });
}

async function issueDashboard(): Promise<string> {
  const outcome = await runPermitIssue(root, {
    subjects: ["PAGE.DASHBOARD"],
    actor: "human:owner",
    changeRef: "CHANGE.MIGRATION_001",
  });
  if (!outcome.ok) throw new Error(`seed issue failed: ${outcome.errors[0]?.message}`);
  return outcome.result.permit_ref as string;
}

/** 旧形态许可（baseline: null）——RECONCILE_BASELINE_MISSING 分支夹具。 */
function writeLegacyPermit(): void {
  writeFileSync(
    join(root, ".pomaster", "state", "permits.json"),
    `${JSON.stringify({
      version: 1,
      permits: [{
        permit_ref: "PERMIT.LEGACY.1",
        issued_at_seq: 0,
        expires_at_seq: 168,
        scope: { subject_ids: ["PAGE.DASHBOARD"], write_policy: "AGENT_WITH_PERMIT" },
        requested_by: { actor_type: "human", actor: "owner", self_attested: true },
        change_ref: null,
        capability_refs: [],
        acceptance_shape: null,
        baseline: null,
        stolen_at_seq: null,
        stolen_by: null,
        stolen_reason: null,
      }],
    }, null, 2)}\n`,
  );
}

function journalText(): string {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
}

function sessionFilePath(sessionKey: string): string {
  return join(root, ".pomaster", "runtime", "sessions", `${sessionKey}.json`);
}

/** 最小合法 GateResult（gatekeeper.spec fixture 骨架同源）。 */
function gateResultFixture(grn: string, verdict: string): Record<string, unknown> {
  return {
    grn,
    gate: "BUILD",
    gateDef: "POLICY.GATE.BUILD@0.1.0",
    tool: "tiny-csv-tool:probe",
    toolVersion: "0.1.0",
    metricDialect: "build:exit_code",
    ranAtSeq: 0,
    verdict,
    verdictCapReason: null,
    subjectId: null,
    isFixture: false,
    denominatorRefs: [],
    counts: { scanned: 2, applicableScanned: 2, violations: 0, notApplicable: 0 },
    blindspot: { scanned: 0, produced: 0, escapeRatio: 0 },
    trust: { asserted: null, recomputed: { violations: 0, matchesAsserted: true } },
    durationMs: { self: 1, external: 0 },
  };
}

async function recordRun(grn: string, executionId: string, verdict = "passed"): Promise<void> {
  await applyTransaction(store, {
    ops: [{
      op: "record_gate_run",
      run: {
        grn,
        trigger: "on_demand",
        executionId,
        result: gateResultFixture(grn, verdict),
      } as never,
    }],
  });
}

async function recordObs(observationId: string, executionId: string): Promise<void> {
  const receipt = buildObservationReceipt({
    observationId,
    executionId,
    sensorCapability: "probe.sandbox",
    adapter: "sandbox",
    operation: "probe",
    surface: "RUNTIME_SIGNAL",
    result: "NOT_OBSERVABLE",
    capturedAtSeq: 0,
  });
  // 落盘 canonical 形态 = receipt 十三键 + record_type 判别键（17 schema root oneOf）。
  persistObservationRecord(join(root, ".pomaster", "evidence"), {
    record_type: "observation_receipt",
    ...receipt,
  });
}

// ============================================================
// resume 对账前置消费（session attach --reconcile）
// ============================================================

describe("session attach --reconcile（resume 对账前置消费）", () => {
  it("clean → 放行：resumed_task 回显 + reconcile 摘要行 + result.reconcile{clean:true,overridden:false}", async () => {
    await upsertDashboard();
    const ref = await issueDashboard();

    const outcome = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      task: "TASK.T0087",
      reconcile: ref,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.created).toBe(true);
    expect(outcome.result.resumed_task).toBe("TASK.T0087");
    expect(outcome.result.reconcile).toEqual({
      permit_ref: ref,
      clean: true,
      baseline_missing: false,
      overridden: false,
    });
    // reconcile 摘要行（与 reconcile 命令共用词形——单一实现）。
    expect(outcome.human.join("\n")).toContain(`reconcile ${ref} → clean`);
    expect(journalText()).toContain("SESSION_ATTACHED");
  });

  it("dirty → 阻断（fail-closed 于一切副作用之前）：RECONCILE_DIRTY + 会话档案未落盘 + journal 零 SESSION_ATTACHED", async () => {
    await upsertDashboard();
    const ref = await issueDashboard();
    await upsertDashboard({ payload: { surface: "V2" } }); // 篡改 → delta

    const outcome = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      reconcile: ref,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("RECONCILE_DIRTY");
    expect(outcome.errors[0]?.message).toContain(ref);
    expect(outcome.errors[0]?.hint).toContain("--reconcile-force");
    expect(outcome.result.reconcile).toMatchObject({
      permit_ref: ref,
      clean: false,
      overridden: false,
    });
    // 恢复先对账（§6-2）：阻断落在 attach 写路径之前——零副作用。
    expect(existsSync(sessionFilePath("claude_9f3ab2c1"))).toBe(false);
    expect(journalText()).not.toContain("SESSION_ATTACHED");
  });

  it("dirty + --reconcile-force → 显式越权放行：overridden=true 信封留痕 + attach 正常进行", async () => {
    await upsertDashboard();
    const ref = await issueDashboard();
    await upsertDashboard({ payload: { surface: "V2" } });

    const outcome = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      task: "TASK.T0087",
      reconcile: ref,
      reconcileForce: true,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.resumed_task).toBe("TASK.T0087");
    expect(outcome.result.reconcile).toEqual({
      permit_ref: ref,
      clean: false,
      baseline_missing: false,
      overridden: true,
    });
    // 越权留痕于人读面（journal 零事件——kernel attach 面零改动，留痕住信封）。
    expect(outcome.human.join("\n")).toContain("越权留痕");
    expect(journalText()).toContain("SESSION_ATTACHED");
  });

  it("旧形态许可（baseline 缺失）→ RECONCILE_BASELINE_MISSING 阻断；--reconcile-force 可越权放行", async () => {
    await upsertDashboard();
    writeLegacyPermit();

    const blocked = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      reconcile: "PERMIT.LEGACY.1",
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.errors[0]?.code).toBe("RECONCILE_BASELINE_MISSING");
    expect(existsSync(sessionFilePath("claude_9f3ab2c1"))).toBe(false);

    const forced = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      reconcile: "PERMIT.LEGACY.1",
      reconcileForce: true,
    });
    expect(forced.ok).toBe(true);
    expect(forced.result.reconcile).toMatchObject({
      permit_ref: "PERMIT.LEGACY.1",
      clean: false,
      baseline_missing: true,
      overridden: true,
    });
  });

  it("未知许可 → PERMIT_NOT_FOUND 透传且不 attach（kernel 原码透传先例）", async () => {
    const outcome = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      reconcile: "PERMIT.NOPE.9",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("PERMIT_NOT_FOUND");
    expect(existsSync(sessionFilePath("claude_9f3ab2c1"))).toBe(false);
  });

  it("--reconcile-force 孤旗（无 --reconcile）→ SCHEMA_INVALID（无效果旗标禁静默）", async () => {
    const outcome = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      reconcileForce: true,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(outcome.errors[0]?.message).toContain("--reconcile-force");
    expect(existsSync(sessionFilePath("claude_9f3ab2c1"))).toBe(false);
  });

  it("零破坏：不带 --reconcile 的 attach 行为零变化（result.reconcile=null 显式未跑）", async () => {
    const outcome = await runSessionAttach(root, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.created).toBe(true);
    expect(outcome.result.reconcile).toBeNull();
  });
});

// ============================================================
// 在途诚实降级位（execution list 三态：在途有产物 / 在途零产物 / 已封口）
// ============================================================

describe("execution list 在途诚实分态（§6-3 回执未存≠未发生）", () => {
  it("在途零产物 → {state:'none',receipt_count:0}；在途有已入账产物 N 件 → {state:'recorded'}（GRN+OBS 合计，跨执行锚不串）", async () => {
    const bare = await beginExecution(store, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
    });
    const live = await beginExecution(store, {
      role: "research",
      runtime: "codex",
      identityKind: "subagent",
    });
    const other = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "interactive",
    });
    // live：2 GRN + 1 OBS = 3 件；other：1 GRN（不串入 live 分母）。
    await recordRun("GRN-0001", live.execution_id);
    await recordRun("GRN-0002", live.execution_id, "failed");
    await recordObs("OBS-0001", live.execution_id);
    await recordRun("GRN-0003", other.execution_id);

    const listed = await runExecutionList(root);
    expect(listed.ok).toBe(true);
    const byId = new Map(listed.result.executions.map((row) => [row.execution_id, row]));

    expect(byId.get(live.execution_id)?.status).toBe("active");
    expect(byId.get(live.execution_id)?.inflight_evidence).toEqual({
      state: "recorded",
      receipt_count: 3,
    });
    expect(byId.get(other.execution_id)?.inflight_evidence).toEqual({
      state: "recorded",
      receipt_count: 1,
    });
    // bare：end 缺失 + 零回执 → 显式「在途·零产物」，不冒充已结束也不冒充有产物。
    expect(byId.get(bare.execution_id)?.inflight_evidence).toEqual({
      state: "none",
      receipt_count: 0,
    });

    // 人读行带在途分态词形。
    const human = listed.human.join("\n");
    expect(human).toContain("有已入账产物 3 件");
    expect(human).toContain("零产物");
  });

  it("已封口 → inflight_evidence=null（位不适用）；status 两态词形零变化", async () => {
    const ended = await beginExecution(store, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
    });
    await recordRun("GRN-0001", ended.execution_id);
    await endExecution(store, ended.execution_id);

    const listed = await runExecutionList(root);
    const row = listed.result.executions[0];
    expect(row?.status).toBe("ended");
    expect(row?.inflight_evidence).toBeNull();
  });
});
