/**
 * closeout-evidence-qualification.spec.ts —— 证据绑定资格链（W1 R1-5；evidence-invalidation-map
 * §5-1/§5-4/§5-5 最小增量）。
 *
 * 判据（09-10 PRD REQ-06「错 revision/实例证据不能满足当前要求」+ AC-04 三反例 + W1 PRD
 * R1-5「错 seq / 失效 Permit / 旧 gate_def 证据不满足当前要求」）：
 * - AC-04-a 错 seq：GRN.ran_at_seq < baseline 确认态 at_seq（证据早于确认基线）→
 *   DOD_CLAIM_EVIDENCE_UNQUALIFIED / STALE_SEQ 阻断且零写入（§5-1 seq 比对，零新字段）；
 * - AC-04-b 失效 Permit：journal 含 PERMIT_EXPIRED_OBSERVED（经 executions/AGX-*.json
 *   permit_ids 关联到证据挂载执行）→ PERMIT_INVALIDATED 阻断（§5-4 失效事件消费；
 *   PERMIT_EXPIRED_OBSERVED/PERMIT_STOLEN 无 execution_id 键——事件 ↔ 执行关联走
 *   executions/ 档案 permit_ids，producer 词形零改动）；
 * - AC-04-c 旧 gate_def：证据 gate_def 版本 ≠ 当前注册面（gauntlet-lite gate_def
 *   版本化先例，browser-evidence.ts「判卷语义变更走 gate_def 版本化」）→
 *   ORACLE_SUPERSEDED 阻断（§5-5，不新增 canonical kind）；
 * - claim 判定面同链：verification.at_seq 早于确认基线 → STALE_SEQ（判定时点也是
 *   证据面——VERIFIED 判定早于基线确认 = 判定依据过期）；
 * - 正例锚：seq/gate_def/permit 全对齐 → COMPLETED（资格链不误伤既有通过面；
 *   fixture 最小 store 无 baseline → seq 轴诚实不适用，既有行为零改动）；
 * - subject 失配防线不重造：DOD_CLAIM_SUBJECT_MISMATCH 已由 closeout.spec.ts 钉住
 *   （本切片资格核 subject 轴输入显式 null——防线归既有消费者，叠加非替换）；
 * - 阻断零写入（staged 写从未发起；snapshot 字节级核验）。
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  beginExecution,
  checkPermit,
  createStore,
  issuePermit,
} from "@pomaster/kernel";
import { runCloseout, type CloseoutResult } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-closeout-qual-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture（沿 closeout.spec.ts 同款夹具；仅资格轴相关字段可注入）
// ============================================================

async function initStore(): Promise<void> {
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

async function seedTask(): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.T0001",
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "示例任务",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证证据资格链",
            acceptance: [{ criterion: "行为 X 已被独立验证", claim: "CLM-0001" }],
            class_scan_result: { scope: "src/shared/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" },
          },
        } as never,
      },
    ],
  });
}

function claimFixture(overrides: {
  readonly atSeq?: number;
  readonly executionId?: string;
}): Record<string, unknown> {
  const atSeq = overrides.atSeq ?? 3;
  return {
    record_type: "claim",
    clm: "CLM-0001",
    subject: { object_id: "TASK.T0001" },
    is_fixture: false,
    assertion: "TASK_ACCEPTANCE_VERIFIED：行为 X 经独立重算确认",
    asserted_by: { actor_type: "agent", actor: "demo-builder", self_attested: true },
    evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
    ...(overrides.executionId !== undefined ? { execution_id: overrides.executionId } : {}),
    verification: {
      verdict: "VERIFIED",
      method: "recompute",
      recomputed_by: { actor_type: "tool", actor: "verifier@0.1.0", self_attested: false },
      recomputed_value: { ok: true },
      delta_vs_asserted: null,
      at_seq: atSeq,
    },
    rev: 1,
    notes_md: null,
  };
}

function seedClaim(overrides: Parameters<typeof claimFixture>[0] = {}): void {
  const dir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "CLM-0001.json"), `${JSON.stringify(claimFixture(overrides), null, 2)}\n`);
}

function runFixture(overrides: {
  readonly ranAtSeq?: number;
  readonly gateDef?: string;
  readonly executionId?: string;
}): Record<string, unknown> {
  const ranAtSeq = overrides.ranAtSeq ?? 3;
  const grn = "GRN-0001";
  return {
    record_type: "run",
    grn,
    ran_at_seq: ranAtSeq,
    trigger: { type: "pre_closeout" },
    ...(overrides.executionId !== undefined ? { execution_id: overrides.executionId } : {}),
    gate_result: {
      mode: "inline",
      result: {
        grn,
        gate: "BUILD",
        gate_def: overrides.gateDef ?? "POLICY.GATE.BUILD@0.1.0",
        tool: "demo:build",
        tool_version: "0.1.0",
        metric_dialect: "demo:case_count",
        ran_at_seq: ranAtSeq,
        verdict: "passed",
        subject_id: "TASK.T0001",
        is_fixture: false,
        denominator_refs: [],
        counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
        blindspot: { scanned: 2, produced: 2, escape_ratio: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
        duration_ms: { self: 1, external: 0 },
      },
    },
  };
}

function seedRun(overrides: Parameters<typeof runFixture>[0] = {}): void {
  const dir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "GRN-0001.json"), `${JSON.stringify(runFixture(overrides), null, 2)}\n`);
}

/** 有效 Human ACCEPT 回执（W1 R1-1 施断前闸；反例与其同场——资格链阻断先于回执闸呈报）。 */
function seedAcceptReceipt(): void {
  const dir = join(root, ".pomaster", "discovery", "scratchpads", "idea-accept");
  mkdirSync(dir, { recursive: true });
  const graph = {
    graph_fingerprint: `sha256:${"0".repeat(64)}`,
    decisions: [
      {
        decision_id: "DECISION.ACCEPT_SCOPE",
        resolution: { answer: "ACCEPT", outcome_binding: { task_ref: "TASK.T0001" } },
      },
    ],
  };
  writeFileSync(join(dir, "decision-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
}

/** .pomaster 文件树快照（相对路径:内容 字节级；阻断零写入断言用）。 */
function snapshot(): string[] {
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

function baselineFileContents(): Map<string, string> {
  const md = (name: string): [string, string] => [`.pomaster/baseline/${name}`, `# ${name}\n`];
  return new Map([
    [".pomaster/baseline/frontend/stack.yaml", "framework: vue3\nlanguage: typescript\n"],
    [".pomaster/baseline/backend/stack.yaml", "language: java\nframework: spring\n"],
    [".pomaster/baseline/frontend/design-tokens.yaml", "meta:\n  origin: preset\n  customized: false\n"],
    ...[
      "frontend/architecture.md",
      "frontend/directory-structure.md",
      "frontend/design-system.md",
      "frontend/state-and-data.md",
      "frontend/api-and-error.md",
      "frontend/quality.md",
      "backend/architecture.md",
      "backend/directory-structure.md",
      "backend/api-contract.md",
      "backend/data-access.md",
      "backend/transaction-concurrency.md",
      "backend/integration-runtime.md",
      "backend/quality.md",
      "data/model.md",
      "data/precision-units.md",
      "data/migration.md",
      "data/lineage.md",
      "data/quality.md",
      "platform/security.md",
      "platform/environment.md",
      "platform/observability.md",
      "platform/delivery.md",
    ].map(md),
  ]);
}

/** 播种 baseline 子树 + confirmed 块（25 件真实 digest；at_seq 可注入——资格轴 seq 锚）。 */
function seedBaseline(confirmed: boolean, atSeq = 2): void {
  const contents = baselineFileContents();
  for (const [relative, content] of contents) {
    const target = join(root, ...relative.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  if (!confirmed) {
    writeFileSync(
      join(root, ".pomaster", "baseline", "manifest.yaml"),
      "id: BASELINE.PROJECT\nschema_version: 1\nstatus: CURRENT\nunknowns: []\n",
    );
    return;
  }
  const digestLines = [...contents.entries()]
    .map(([relative, content]) => {
      const digest = `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
      return `    ${relative.replace(".pomaster/", "")}: ${digest}`;
    })
    .join("\n");
  writeFileSync(
    join(root, ".pomaster", "baseline", "manifest.yaml"),
    `id: BASELINE.PROJECT\nschema_version: 1\nstatus: CURRENT\nunknowns: []\nconfirmed:\n  at_seq: ${atSeq}\n  digests:\n${digestLines}\n`,
  );
}

// ============================================================
// AC-04 反例 × 正例锚
// ============================================================

describe("closeout 证据绑定资格链（W1 R1-5）", () => {
  it("AC-04-a 反例：GRN ran_at_seq 早于 baseline 确认 at_seq → DOD_CLAIM_EVIDENCE_UNQUALIFIED / STALE_SEQ 阻断且零写入", async () => {
    await initStore();
    await seedTask();
    seedBaseline(true, 5); // 确认基线 at_seq=5
    seedClaim({ atSeq: 5 }); // claim 判定面已对齐（隔离 GRN 轴）
    seedRun({ ranAtSeq: 3 }); // 证据产生于确认基线之前
    seedAcceptReceipt();
    const before = snapshot();

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    // RED 留证（实现前现状）：证据照样通过 → ok=true COMPLETED；
    // GREEN（实现后）：逐证据否决词形显式阻断，零写入。
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["DOD_CLAIM_EVIDENCE_UNQUALIFIED"]);
    const error = outcome.errors[0];
    expect(error?.message).toContain("GRN-0001");
    expect(error?.message).toContain("STALE_SEQ");
    expect((outcome.result as CloseoutResult).blocked).toBe(true);
    expect(snapshot()).toEqual(before);
  });

  it("反例扩展：claim 判定面 verification.at_seq 早于确认基线 → STALE_SEQ（判定时点也是证据面）", async () => {
    await initStore();
    await seedTask();
    seedBaseline(true, 5);
    seedClaim({ atSeq: 3 }); // 判定早于基线确认
    seedRun({ ranAtSeq: 5 }); // 证据本身新鲜（隔离 claim 面）
    seedAcceptReceipt();

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["DOD_CLAIM_EVIDENCE_UNQUALIFIED"]);
    expect(outcome.errors[0]?.message).toContain("CLM-0001");
    expect(outcome.errors[0]?.message).toContain("STALE_SEQ");
  });

  it("AC-04-b 反例：证据挂载执行的许可已失效（PERMIT_EXPIRED_OBSERVED）→ PERMIT_INVALIDATED 阻断", async () => {
    await initStore();
    const store = await createStore(root);
    const permit = await issuePermit(store, {
      subjectIds: ["TASK.T0001"],
      requestedBy: { actorType: "agent", actor: "demo-planner" },
      ttlBeats: 1, // seedTask 事务后即过期（currentSeq >= expires_at_seq）
    });
    await seedTask(); // tx → seq 1 = expires_at_seq
    const check = await checkPermit(store, permit.permitRef, { op: "upsert_object", id: "TASK.T0001" });
    expect(check.outcome).toBe("expired"); // producer 事实：PERMIT_EXPIRED_OBSERVED 已入 journal
    const execution = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "interactive",
      permitIds: [permit.permitRef], // 事件 ↔ 执行关联锚（executions/ permit_ids）
    });
    seedRun({ executionId: execution.execution_id });
    seedClaim({});
    seedAcceptReceipt();

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    // RED 留证（实现前现状）：失效执行产出的证据照样通过；
    // GREEN：PERMIT_INVALIDATED 逐证据显式（词形沿 lifecycle/permit 事件词族）。
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["DOD_CLAIM_EVIDENCE_UNQUALIFIED"]);
    const error = outcome.errors[0];
    expect(error?.message).toContain("GRN-0001");
    expect(error?.message).toContain("PERMIT_INVALIDATED");
    expect(error?.message).toContain(execution.execution_id);
    expect(error?.message).toContain(permit.permitRef);
  });

  it("AC-04-c 反例：证据 gate_def 版本已被当前版本取代 → ORACLE_SUPERSEDED 阻断", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    seedRun({ gateDef: "POLICY.GATE.BUILD@0.0.9" }); // 旧判卷口径（当前注册面 @0.1.0）
    seedAcceptReceipt();

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    // RED 留证（实现前现状）：旧 gate_def 下的 passed 照样通过；
    // GREEN：ORACLE_SUPERSEDED 逐证据显式（词形沿 lifecycle SUPERSEDED 词族）。
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((error) => error.code)).toEqual(["DOD_CLAIM_EVIDENCE_UNQUALIFIED"]);
    const error = outcome.errors[0];
    expect(error?.message).toContain("GRN-0001");
    expect(error?.message).toContain("ORACLE_SUPERSEDED");
    expect(error?.message).toContain("POLICY.GATE.BUILD@0.0.9");
  });

  it("正例锚：seq / gate_def / permit 全对齐 → COMPLETED（资格链不误伤既有通过面）", async () => {
    await initStore();
    await seedTask();
    seedBaseline(true, 2); // 确认 at_seq=2 ≤ 证据锚 3
    seedClaim({}); // at_seq 3
    seedRun({}); // ran_at_seq 3 / BUILD @0.1.0（当前版本）/ 无失效事件
    seedAcceptReceipt();

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect((outcome.result as CloseoutResult).change).toBe("COMPLETED");
  });

  it("轴诚实边界：fixture 最小 store 无 baseline、无失效事件、gate 不在注册面 → 三轴全不适用照常放行（既有行为零改动）", async () => {
    await initStore();
    await seedTask();
    seedClaim({});
    seedRun({}); // BUILD @0.1.0 在册比对相等；无 baseline → seq 轴不适用
    seedAcceptReceipt();

    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect((outcome.result as CloseoutResult).change).toBe("COMPLETED");
  });
});
