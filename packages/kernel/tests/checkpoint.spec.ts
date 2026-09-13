/**
 * checkpoint.spec.ts —— Checkpoint 载体（W4-S2 · 09-10 PRD §6-1 + 战役 W4 R4-1）。
 *
 * 需求锚：
 * - §6-1「Checkpoint 关联 Task、Expected 依据、Transition、约束、Pending Tool、
 *   Evidence、Notes、Unknown、Steering 与仓库状态；**优先复用现有记录，不按清单
 *   创建新库**」；
 * - W0 evidence-invalidation-map §6-1：无 checkpoint 专用载体；最近似=trace seal +
 *   session attach；§5-7/§5-8：接线而非新建；
 * - 语义裁决（本切片核心设计决策）：checkpoint = 对「恢复所需世界状态引用集」的
 *   显式快照——每项都是**引用**（既有实体），本体只是可重建的引用清单文件，
 *   零新 canonical kind、零 TransactionOp、零 journal 事件（P34 新分区 +
 *   trace seal 分区档案先例）；
 * - 幂等纪律（store 同款）：显式同号重放同内容 → 零写入幂等短路；异内容 →
 *   CHECKPOINT_ALREADY_EXISTS 显式冲突（EVIDENCE_ALREADY_EXISTS 同族语义）；
 * - 诚实纪律：引用逐项存在性校验（OBJECT_NOT_FOUND / PERMIT_NOT_FOUND /
 *   EXECUTION_NOT_FOUND 同款透传）；workspace 锚 = 采集时点快照（锚定诚实——
 *   无锚显式申报 absent，非伪造）；新鲜度判定不在本面（归 session attach
 *   --reconcile——W4-S1 分层）。
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendTaskNegativeEntry,
  applyTransaction,
  beginExecution,
  buildObservationReceipt,
  buildStorePaths,
  GovernanceError,
  issuePermit,
  persistObservationRecord,
  readCheckpoint,
  recordException,
  saveCheckpoint,
  sealExecutionTrace,
  type Store,
} from "@pomaster/kernel";
import { AGENT, gid, makeStore, readIndex } from "./helpers.js";

/** R4 必备的同类扫描记录（task_object 信封强制；negative-history.spec 同款）。 */
const CLASS_SCAN = {
  scope: "tasks/**",
  hits: 0,
  fixed_count: 0,
  regression_case_ref: "GRN-W4-S2",
};

/** task_object 信封基线（negative-history.spec taskEnvelope 同款轴形态）。 */
function taskEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: gid("TASK.W4CHECKPOINT"),
    kind: "task_object",
    axisProfile: "task_default",
    axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
    titleZh: "checkpoint 承载任务",
    authority: { owner: "BUSINESS_OWNER", delegates: [] },
    origin: "natural",
    payload: { intent: "验证 checkpoint 引用快照", class_scan_result: CLASS_SCAN },
    ...overrides,
  };
}

async function seedTask(store: Store, overrides: Record<string, unknown> = {}): Promise<void> {
  await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope: taskEnvelope(overrides) as never }],
  });
}

function checkpointDir(root: string): string {
  return join(root, ".pomaster", "state", "checkpoints");
}

function checkpointPath(root: string, id: string): string {
  return join(checkpointDir(root), `${id}.json`);
}

function journalText(root: string): string {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
}

/** 保存前后的 .pomaster 文件集合差（落盘面纪律断言的输入）。 */
function pomasterFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (absolute: string, rel: string): void => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(join(absolute, entry.name), childRel);
      else found.push(childRel);
    }
  };
  walk(join(root, ".pomaster"), "");
  return found.sort();
}

async function expectGovernanceError(
  run: () => Promise<unknown>,
  code: string,
): Promise<GovernanceError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof GovernanceError && error.code === code) return error;
    throw error;
  }
  throw new Error(`expected GovernanceError ${code}`);
}

/** 最小合法 GateResult（session-resume-reconcile.spec fixture 骨架同源）。 */
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
  await applyTransaction(currentStore, {
    ops: [{
      op: "record_gate_run",
      run: { grn, trigger: "on_demand", executionId, result: gateResultFixture(grn, verdict) } as never,
    }],
  });
}

// —— 模块级当前 fixture（recordRun 简写用；每 it 重挂） ——
let currentStore: Store;

async function makeCheckpointStore(): Promise<{ store: Store; root: string }> {
  const made = await makeStore();
  currentStore = made.store;
  return made;
}

// ============================================================
// save：闭形态 / 缺省分配 / 零 journal 事件 / 落盘面纪律
// ============================================================

describe("saveCheckpoint：引用集快照闭形态（W4-S2）", () => {
  it("最小引用集（task 单锚）：CKPT-00001 缺省分配 + 闭形态全键显式 + captured_at_seq 采样 + 零 journal 事件", async () => {
    const { store, root } = await makeCheckpointStore();
    await seedTask(store, {
      payload: {
        intent: "验证 checkpoint 引用快照",
        class_scan_result: CLASS_SCAN,
        acceptance: [{ criterion: "构建绿", claim: null }],
      },
    });
    const journalBefore = journalText(root);
    const filesBefore = pomasterFiles(root);

    const result = await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" });

    expect(result.replayed).toBe(false);
    expect(result.record.checkpoint_id).toBe("CKPT-00001");
    expect(result.record.schema).toBe("pomaster.checkpoint/v1");
    expect(result.record.task_ref).toBe("TASK.W4CHECKPOINT");
    expect(result.record.permit_ref).toBeNull();
    expect(result.record.execution).toBeNull();
    expect(result.record.task_surface).toEqual({
      acceptance_ref: "TASK.W4CHECKPOINT#acceptance",
      acceptance_count: 1,
      negative_history_ref: "TASK.W4CHECKPOINT#negative_history",
      negative_history_count: 0,
    });
    expect(result.record.unknowns_refs).toEqual([]);
    expect(result.record.trace_ref).toBeNull();
    expect(result.record.workspace_anchor).toEqual({
      anchor_status: "absent",
      git_head: null,
      dirty_summary: null,
      note: expect.stringContaining("保存时点快照"),
    });
    expect(result.record.note).toBeNull();
    const index = readIndex(root);
    expect(result.record.captured_at_seq).toBe(
      ((index.generation as Record<string, unknown>).seq) as number,
    );
    // 落盘 + JSON 可解析往返一致。
    expect(existsSync(checkpointPath(root, "CKPT-00001"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(result.path, "utf8")) as Record<string, unknown>;
    expect(onDisk).toEqual(result.record as unknown);
    // 零 journal 事件（P34 新分区 + trace seal 先例——分区档案面非治理事实变更）。
    expect(journalText(root)).toBe(journalBefore);
    // 零新 canonical kind：truth-index objects 计数不变；新增文件 ⊆ state/checkpoints/。
    const added = pomasterFiles(root).filter((f) => !filesBefore.includes(f));
    expect(added).toEqual(["state/checkpoints/CKPT-00001.json"]);
    expect(readIndex(root).objects).toHaveLength(1);
  });

  it("分配序：两次 save → CKPT-00001、CKPT-00002（现有最大序号 +1，5 位零填充）", async () => {
    const { store } = await makeCheckpointStore();
    await seedTask(store);
    const first = await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" });
    const second = await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" });
    expect(first.record.checkpoint_id).toBe("CKPT-00001");
    expect(second.record.checkpoint_id).toBe("CKPT-00002");
  });
});

// ============================================================
// save：引用逐项存在性校验（诚实纪律——fail-closed 零落盘）
// ============================================================

describe("saveCheckpoint：引用存在性校验（fail-closed 零落盘）", () => {
  it("task 不在册 → OBJECT_NOT_FOUND 零落盘", async () => {
    const { store, root } = await makeCheckpointStore();
    const error = await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "TASK.NOPE.9" }),
      "OBJECT_NOT_FOUND",
    );
    expect(error.message).toContain("TASK.NOPE.9");
    expect(existsSync(checkpointDir(root))).toBe(false);
  });

  it("task 词形非法 → FATAL_UNKNOWN_PREFIX（未登记前缀）/ FATAL_ID_GRAMMAR（文法违规）；非 TASK 前缀 → FATAL_UNKNOWN_PREFIX", async () => {
    const { store } = await makeCheckpointStore();
    await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "not-a-governed-id" }),
      "FATAL_UNKNOWN_PREFIX",
    );
    await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "TASK.0087" }),
      "FATAL_ID_GRAMMAR",
    );
    await seedTask(store);
    await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "PAGE.DASHBOARD" }),
      "FATAL_UNKNOWN_PREFIX",
    );
  });

  it("非 task_object kind → SCHEMA_INVALID（禁跨 kind 借位；kind 闸经索引行 kind 手改摆盘——TASK 前缀合法入册对象恒 task_object，跨前缀目标已被前缀闸先行拦截）", async () => {
    const { store, root } = await makeCheckpointStore();
    await seedTask(store);
    // 手改索引行 kind（模拟漂移——负例摆盘法同 negative-history.spec「手改载荷」）。
    const indexPath = join(root, ".pomaster", "state", "truth-index.json");
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      objects: { id: string; kind: string }[];
    };
    const row = index.objects.find((candidate) => candidate.id === "TASK.W4CHECKPOINT");
    if (row === undefined) throw new Error("test fixture bug: task row missing");
    row.kind = "page_surface";
    writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}
`);
    await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" }),
      "SCHEMA_INVALID",
    );
  });

  it("permit 引用：在册 → 回显；未知 → PERMIT_NOT_FOUND 零落盘", async () => {
    const { store, root } = await makeCheckpointStore();
    await seedTask(store);
    await issuePermit(store, {
      subjectIds: [gid("TASK.W4CHECKPOINT")],
      requestedBy: AGENT,
      changeRef: "CHANGE.W4",
    });
    const permits = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "permits.json"), "utf8"),
    ) as { permits: { permit_ref: string }[] };
    const permitRef = permits.permits[0]?.permit_ref ?? "";
    expect(permitRef).toContain("PERMIT.");

    const saved = await saveCheckpoint(store, {
      taskRef: "TASK.W4CHECKPOINT",
      permitRef,
    });
    expect(saved.record.permit_ref).toBe(permitRef);

    await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT", permitRef: "PERMIT.NOPE.9" }),
      "PERMIT_NOT_FOUND",
    );
  });

  it("execution 引用：已登记 + 在途 GRN/OBS → inflight_receipts {recorded, N}（countExecutionInflightReceipts 组合）；未登记 → EXECUTION_NOT_FOUND；零产物 → {none, 0}", async () => {
    const { store, root } = await makeCheckpointStore();
    await seedTask(store);
    const live = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "interactive",
    });
    await recordRun("GRN-0001", live.execution_id);
    const receipt = buildObservationReceipt({
      observationId: "OBS-0001",
      executionId: live.execution_id,
      sensorCapability: "probe.sandbox",
      adapter: "sandbox",
      operation: "probe",
      surface: "RUNTIME_SIGNAL",
      result: "NOT_OBSERVABLE",
      capturedAtSeq: 0,
    });
    persistObservationRecord(join(root, ".pomaster", "evidence"), {
      record_type: "observation_receipt",
      ...receipt,
    });

    const saved = await saveCheckpoint(store, {
      taskRef: "TASK.W4CHECKPOINT",
      executionId: live.execution_id,
    });
    expect(saved.record.execution).toEqual({
      execution_id: live.execution_id,
      inflight_receipts: { state: "recorded", receipt_count: 2 },
    });

    // 零产物 → 显式 none（回执未存 ≠ 未发生——W4-S1 同轴复用）。
    const bare = await beginExecution(store, {
      role: "research",
      runtime: "codex",
      identityKind: "subagent",
    });
    const bareSaved = await saveCheckpoint(store, {
      taskRef: "TASK.W4CHECKPOINT",
      executionId: bare.execution_id,
    });
    expect(bareSaved.record.execution).toEqual({
      execution_id: bare.execution_id,
      inflight_receipts: { state: "none", receipt_count: 0 },
    });

    // 未登记 → EXECUTION_NOT_FOUND（S1 禁自造身份；EXECUTION_NOT_FOUND 同款）。
    await expectGovernanceError(
      () => saveCheckpoint(store, {
        taskRef: "TASK.W4CHECKPOINT",
        executionId: "AGX-2026-99999",
      }),
      "EXECUTION_NOT_FOUND",
    );
  });
});

// ============================================================
// save：task payload 引用面（negative_history/unknowns）+ trace_ref
// ============================================================

describe("saveCheckpoint：task payload 引用面与 trace_ref", () => {
  it("negative_history 计数走 readTaskNegativeHistory 同一装载面；acceptance_count 取 payload 数组", async () => {
    const { store } = await makeCheckpointStore();
    await seedTask(store, {
      payload: {
        intent: "验证 checkpoint 引用快照",
        class_scan_result: CLASS_SCAN,
        acceptance: [
          { criterion: "构建绿", claim: null },
          { criterion: "对账净", claim: null },
        ],
      },
    });
    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.W4CHECKPOINT",
      approach: "方案甲",
      reason: "缺依据",
      recordedBy: AGENT,
    });
    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.W4CHECKPOINT",
      approach: "方案乙",
      reason: "越界",
      recordedBy: AGENT,
    });
    const saved = await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" });
    expect(saved.record.task_surface.acceptance_count).toBe(2);
    expect(saved.record.task_surface.negative_history_count).toBe(2);
  });

  it("unknowns_refs：OPEN_QUESTION 锚定本任务 → EXC 引用；其他分类/其他对象不入", async () => {
    const { store } = await makeCheckpointStore();
    await seedTask(store);
    await recordException(store, {
      classification: "OPEN_QUESTION",
      statement: "该列 checkbox 语义是否含表头全选？",
      objectRef: "TASK.W4CHECKPOINT",
      recordedBy: AGENT,
    });
    await recordException(store, {
      classification: "OPEN_QUESTION",
      statement: "别的任务的悬问",
      objectRef: "TASK.OTHER",
      recordedBy: AGENT,
    });
    await recordException(store, {
      classification: "HARD_BLOCKER",
      statement: "高显著度异常不是 unknown 引用",
      objectRef: "TASK.W4CHECKPOINT",
      recordedBy: AGENT,
    });
    const saved = await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" });
    expect(saved.record.unknowns_refs).toEqual(["EXC-1"]);
  });

  it("trace_ref：durable 封存 → {plane durable}；EPHEMERAL → {plane ephemeral}；无封存 → null", async () => {
    const { store } = await makeCheckpointStore();
    await seedTask(store);
    const live = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "interactive",
    });
    const bare = await beginExecution(store, {
      role: "research",
      runtime: "codex",
      identityKind: "subagent",
    });
    sealExecutionTrace(store, live.execution_id, { retention: "TASK_RETENTION" });
    sealExecutionTrace(store, bare.execution_id, { retention: "EPHEMERAL" });

    const sealedDurable = await saveCheckpoint(store, {
      taskRef: "TASK.W4CHECKPOINT",
      executionId: live.execution_id,
    });
    expect(sealedDurable.record.trace_ref).toEqual({
      path: `.pomaster/traces/${live.execution_id}.json`,
      plane: "durable",
    });
    const sealedEphemeral = await saveCheckpoint(store, {
      taskRef: "TASK.W4CHECKPOINT",
      executionId: bare.execution_id,
    });
    expect(sealedEphemeral.record.trace_ref).toEqual({
      path: `.pomaster/runtime/traces/${bare.execution_id}.json`,
      plane: "ephemeral",
    });
    // 无 execution → trace_ref 显式 null。
    const none = await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" });
    expect(none.record.trace_ref).toBeNull();
  });
});

// ============================================================
// save：幂等纪律（同内容幂等 / 异内容冲突显式）+ workspace 锚
// ============================================================

describe("saveCheckpoint：幂等纪律与 workspace 锚", () => {
  it("显式同号重放：同内容 → replayed=true 零写入（字节不变）；异内容 → CHECKPOINT_ALREADY_EXISTS", async () => {
    const { store, root } = await makeCheckpointStore();
    await seedTask(store);
    const first = await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT", ckptId: "CKPT-00001" });
    expect(first.replayed).toBe(false);
    const bytes = readFileSync(checkpointPath(root, "CKPT-00001"), "utf8");

    const replay = await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT", ckptId: "CKPT-00001" });
    expect(replay.replayed).toBe(true);
    expect(readFileSync(checkpointPath(root, "CKPT-00001"), "utf8")).toBe(bytes);

    // 世界演进（追加一条 negative history）→ 同号重放异内容显式冲突。
    await appendTaskNegativeEntry(store, {
      taskRef: "TASK.W4CHECKPOINT",
      approach: "方案丙",
      reason: "新否定",
      recordedBy: AGENT,
    });
    await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT", ckptId: "CKPT-00001" }),
      "CHECKPOINT_ALREADY_EXISTS",
    );
    // 冲突后旧文件字节不动。
    expect(readFileSync(checkpointPath(root, "CKPT-00001"), "utf8")).toBe(bytes);
  });

  it("显式 id 词形非法 → SCHEMA_INVALID", async () => {
    const { store } = await makeCheckpointStore();
    await seedTask(store);
    await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT", ckptId: "CKPT-1X" }),
      "SCHEMA_INVALID",
    );
    await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT", ckptId: "checkpoint-1" }),
      "SCHEMA_INVALID",
    );
  });

  it("workspace 锚：collected 如实记录 git_head + dirty 摘要；半给（缺 counts）→ SCHEMA_INVALID；absent 显式申报", async () => {
    const { store } = await makeCheckpointStore();
    await seedTask(store);
    const collected = await saveCheckpoint(store, {
      taskRef: "TASK.W4CHECKPOINT",
      workspaceAnchor: { gitHead: "abc123def4567890", dirtyTrackedChanged: 2, dirtyUntracked: 1 },
    });
    expect(collected.record.workspace_anchor).toEqual({
      anchor_status: "collected",
      git_head: "abc123def4567890",
      dirty_summary: { tracked_changed: 2, untracked: 1 },
      note: expect.stringContaining("保存时点快照"),
    });
    await expectGovernanceError(
      () => saveCheckpoint(store, {
        taskRef: "TASK.W4CHECKPOINT",
        workspaceAnchor: { gitHead: "abc123" },
      }),
      "SCHEMA_INVALID",
    );
    const absent = await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" });
    expect(absent.record.workspace_anchor.anchor_status).toBe("absent");
    expect(absent.record.workspace_anchor.git_head).toBeNull();
  });
});

// ============================================================
// readCheckpoint：fail-closed 装载
// ============================================================

describe("readCheckpoint：fail-closed 装载", () => {
  it("缺席 → null；损坏 → SCHEMA_INVALID；checkpoint_id 与文件名不一致 → SCHEMA_INVALID", async () => {
    const { store, root } = await makeCheckpointStore();
    await seedTask(store);
    await saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" });
    const paths = buildStorePaths(root);

    expect(readCheckpoint(paths, "CKPT-00042")).toBeNull();
    expect(readCheckpoint(paths, "CKPT-00001")?.task_ref).toBe("TASK.W4CHECKPOINT");

    const corruptPath = checkpointPath(root, "CKPT-00001");
    const good = readFileSync(corruptPath, "utf8");
    const record = JSON.parse(good) as Record<string, unknown>;
    const readCorrupt = async (): Promise<unknown> => readCheckpoint(paths, "CKPT-00001");
    writeBroken(corruptPath, "{ not json");
    await expectGovernanceError(readCorrupt, "SCHEMA_INVALID");
    writeBroken(corruptPath, `${JSON.stringify({ ...record, checkpoint_id: "CKPT-99999" }, null, 2)}\n`);
    await expectGovernanceError(readCorrupt, "SCHEMA_INVALID");
    writeBroken(corruptPath, `${JSON.stringify({ ...record, schema: "pomaster.checkpoint/v2" }, null, 2)}\n`);
    await expectGovernanceError(readCorrupt, "SCHEMA_INVALID");
    writeBroken(corruptPath, good);
    expect(readCheckpoint(paths, "CKPT-00001")).not.toBeNull();
  });
});

/** 破坏性改写（readCheckpoint fail-closed 用例的摆盘 helper；用例尾恢复原字节）。 */
function writeBroken(path: string, content: string): void {
  writeFileSync(path, content, "utf8");
}

// ============================================================
// 未初始化
// ============================================================

describe("saveCheckpoint：未初始化", () => {
  it("truth-index 缺席（readCurrentSeq null）→ NOT_CONFIGURED（kernel 原码透传先例）", async () => {
    const { store, root } = await makeCheckpointStore();
    rmSync(join(root, ".pomaster", "state", "truth-index.json"));
    await expectGovernanceError(
      () => saveCheckpoint(store, { taskRef: "TASK.W4CHECKPOINT" }),
      "NOT_CONFIGURED",
    );
  });
});
