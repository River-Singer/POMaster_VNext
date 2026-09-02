/**
 * trace.spec.ts —— Execution Trace Manifest Lite（W1-C · PRD v0.5.2 §8/§14 P0.5-3/
 * §15 Benchmark C/§16 Case A；裁决 8 ② 2026-09-01「trace 独立 traces/ 分区 + 投影 +
 * 可选 --seal / retention 四档逐字仅记录不 GC」）。
 *
 * 判据锚：
 * - 派生正确性（零新采集器）：journal TX_APPLIED.changed_object_ids → writes.governed_refs
 *   （并集去重排序）、ops 计数 → transition_proposals、GRN/CLM 文件自报 execution_id →
 *   tool_receipts/evidence_refs；缺席身份不伪造（P20 裁定）；
 * - manifest 闭形态 12 键（C1 一切键显式；键序镜像 PRD §8.2 例文）+ 零墙钟键（A4）；
 * - Case A：execution_id 复用 assertExecutionAttachable 严格通道——未登记
 *   EXECUTION_NOT_FOUND / EXEC-* 词形 SCHEMA_INVALID（禁自造第二种身份）；
 * - Benchmark C 四断言：Identity unchanged（纯读档案字节恒等）/ Trace separately
 *   retained（traces/ 与 executions/ 物理分离）/ Evidence links back（双向对账）/
 *   raw 可丢弃（EPHEMERAL 落 runtime/traces，删后投影可重建）；
 * - retention 四档逐字词形（EPHEMERAL/TASK_RETENTION/INCIDENT_RETENTION/AUDIT_RETENTION）
 *   仅记录不 GC（裁决 8 ②）；词表外 VOCAB_INVALID_VALUE fail-closed；
 * - seal：derived_from_seq 锚 + 零 journal 事件（P34 新分区先例）+ 重复封存
 *   TRACE_ALREADY_SEALED（跨双平面）；stale = canonical 重放对账显式呈现。
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  beginExecution,
  compileExecutionTrace,
  EXECUTION_TRACE_SCHEMA,
  EXECUTION_TRACE_VERSION,
  executionTraceDerivedView,
  listSealedExecutionTraces,
  readSealedExecutionTrace,
  sealExecutionTrace,
  TRACE_RETENTION_VALUES,
  TRACES_RELATIVE,
  type ExecutionRecord,
  type ExecutionTraceManifest,
  type Store,
} from "@pomaster/kernel";
import { allSchemas, executionTraceSchema } from "@pomaster/schemas";
import { pathsOf } from "../src/paths.js";
import { AGENT, gid, makeStore, pageEnvelope } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

const BASE = {
  role: "orchestrator",
  runtime: "claude-code",
  identityKind: "interactive",
} as const;

// kernel 平面路径是正斜杠模板串（store 布局唯一登记处 paths.ts 形态）——断言用同形
// 模板串拼装（join 的反斜杠形态会使 startsWith 失配）。
function tracesDir(): string {
  return `${root}/.pomaster/traces`;
}
function rawTracesDir(): string {
  return `${root}/.pomaster/runtime/traces`;
}
function executionPath(id: string): string {
  return join(root, ".pomaster", "executions", `${id}.json`);
}
function journalEvents(): Array<Record<string, unknown>> {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** 递归收集全部对象键（零墙钟断言用：任何键不得以 _at/_utc 结尾——A4）。 */
function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      out.push(key);
      collectKeys(child, out);
    }
  }
  return out;
}

/** 最小合法 GateResult（camelCase 输入形态；同 execution.spec.ts fixture 骨架）。 */
function gateResultFixture(grn: string): Record<string, unknown> {
  return {
    grn,
    gate: "BUILD",
    gateDef: "POLICY.GATE.BUILD@0.1.0",
    tool: "tiny-csv-tool:probe",
    toolVersion: "0.1.0",
    metricDialect: "build:exit_code",
    ranAtSeq: 0,
    verdict: "passed",
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

async function seedObject(): Promise<void> {
  await applyTransaction(store, { ops: [{ op: "upsert_object", envelope: pageEnvelope() as never }] });
}

async function seedProposed(): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: pageEnvelope({
          axes: { lifecycle: "PROPOSED", confidence: "UNRESOLVED", evidence: "PLANNED", change: "STABLE" },
        }) as never,
      },
    ],
  });
}

// ============================================================
// compileExecutionTrace（投影派生；纯读零写）
// ============================================================

describe("compileExecutionTrace（投影派生）", () => {
  it("空执行 → manifest 闭形态 12 键显式在场 + Lite 边界全空显式（reads/agent_spawns 恒空数组、raw_trace_ref/retention/derived_from_seq null）", async () => {
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const manifest = compileExecutionTrace(pathsOf(store), record.execution_id);
    // 闭形态键集断言（C1；镜像 execution.spec.ts Object.keys 全等断言法）。
    expect(Object.keys(manifest).sort()).toEqual(
      [
        "agent_spawns", "derived_from_seq", "evidence_refs", "execution_id",
        "raw_trace_ref", "reads", "retention", "schema", "tool_receipts",
        "trace_version", "transition_proposals", "writes",
      ].sort(),
    );
    expect(manifest.schema).toBe("pomaster.execution_trace/v1" satisfies typeof EXECUTION_TRACE_SCHEMA);
    expect(manifest.trace_version).toBe(1 satisfies typeof EXECUTION_TRACE_VERSION);
    expect(manifest.retention).toBeNull();
    expect(manifest.derived_from_seq).toBeNull();
    expect(manifest.reads).toEqual({ governed_refs: [], source_areas: [] });
    expect(manifest.writes).toEqual({ governed_refs: [], source_areas: [] });
    expect(manifest.tool_receipts).toEqual([]);
    expect(manifest.agent_spawns).toEqual([]);
    expect(manifest.transition_proposals).toEqual([]);
    expect(manifest.evidence_refs).toEqual([]);
    expect(manifest.raw_trace_ref).toBeNull();
  });

  it("writes 派生：TX_APPLIED.changed_object_ids 跨事件并集去重排序；无关 execution 的事件不混入", async () => {
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const other = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:01:00.000Z" });
    await applyTransaction(store, {
      ops: [
        { op: "upsert_object", envelope: pageEnvelope() as never },
        { op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.OTHER") }) as never },
      ],
      executionId: record.execution_id,
    });
    // 同对象再变更（内容变化 → rev 递增产生第二条事件）：并集去重后仍单条。
    await applyTransaction(store, {
      ops: [
        { op: "upsert_object", envelope: pageEnvelope({ titleZh: "仪表盘 V2" }) as never },
      ],
      executionId: record.execution_id,
    });
    await applyTransaction(store, {
      ops: [
        { op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.THIRD") }) as never },
      ],
      executionId: other.execution_id, // 无关执行——不进本 manifest
    });
    const manifest = compileExecutionTrace(pathsOf(store), record.execution_id);
    expect(manifest.writes.governed_refs).toEqual(["PAGE.DASHBOARD", "PAGE.OTHER"]);
    const otherManifest = compileExecutionTrace(pathsOf(store), other.execution_id);
    expect(otherManifest.writes.governed_refs).toEqual(["PAGE.THIRD"]);
  });

  it("transition_proposals 派生：transition_object op 计数行（seq 事件锚 + transition_ops=1）；零转移事务不产生行", async () => {
    await seedProposed();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.OTHER") }) as never }],
      executionId: record.execution_id, // 零转移事务 → 无行
    });
    const applied = await applyTransaction(store, {
      ops: [
        {
          op: "transition_object",
          id: gid("PAGE.DASHBOARD"),
          patch: { lifecycle: "CURRENT", confidence: "PROVISIONAL" },
          reasonShort: "owner 审批通过",
        },
      ],
      authorityRef: "PERMIT.X.1",
      executionId: record.execution_id,
    });
    const manifest = compileExecutionTrace(pathsOf(store), record.execution_id);
    expect(manifest.transition_proposals).toEqual([
      { seq: applied.appliedSeq, transition_ops: 1 },
    ]);
  });

  it("tool_receipts 派生：GRN 自报 execution_id → 收据行 8 键（三件套 + 七态 verdict + seq 锚）；evidence_refs 含 GRN-n", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    await applyTransaction(store, {
      ops: [{
        op: "record_gate_run",
        run: {
          grn: "GRN-0007",
          trigger: "on_demand",
          executionId: record.execution_id,
          result: gateResultFixture("GRN-0007"),
        },
      }],
    });
    const manifest = compileExecutionTrace(pathsOf(store), record.execution_id);
    expect(manifest.tool_receipts).toEqual([
      {
        grn: "GRN-0007",
        gate: "BUILD",
        gate_def: "POLICY.GATE.BUILD@0.1.0",
        tool: "tiny-csv-tool:probe",
        tool_version: "0.1.0",
        metric_dialect: "build:exit_code",
        verdict: "passed",
        ran_at_seq: 0,
      },
    ]);
    expect(Object.keys(manifest.tool_receipts[0] ?? {}).length).toBe(8);
    expect(manifest.evidence_refs).toEqual(["GRN-0007"]);
  });

  it("CLM 自报 → evidence_refs 含 CLM-n（不产 tool_receipts 行）；GRN+CLM 混排字典序", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    await applyTransaction(store, {
      ops: [
        {
          op: "record_gate_run",
          run: { grn: "GRN-0002", trigger: "on_demand", executionId: record.execution_id, result: gateResultFixture("GRN-0002") },
        },
        {
          op: "record_claim",
          claim: {
            clm: "CLM-0010",
            subjectId: gid("PAGE.DASHBOARD"),
            assertion: "页面已按蓝图渲染",
            assertedBy: AGENT,
            evidenceRefs: [],
            executionId: record.execution_id,
          },
        },
      ],
    });
    const manifest = compileExecutionTrace(pathsOf(store), record.execution_id);
    expect(manifest.evidence_refs).toEqual(["CLM-0010", "GRN-0002"]);
    expect(manifest.tool_receipts.map((row) => row.grn)).toEqual(["GRN-0002"]);
  });

  it("缺席 execution_id 的 GRN/CLM 不进分母（缺席不伪造——P20 裁定）；证据面 execution_id 词形漂移 → SCHEMA_INVALID fail-closed", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    await applyTransaction(store, {
      ops: [
        {
          op: "record_claim",
          claim: {
            clm: "CLM-0099",
            subjectId: gid("PAGE.DASHBOARD"),
            assertion: "存量形态无身份键",
            assertedBy: AGENT,
            evidenceRefs: [],
          },
        },
      ],
    });
    const paths = pathsOf(store);
    expect(compileExecutionTrace(paths, record.execution_id).evidence_refs).toEqual([]);
    // 词形漂移 = 手改痕迹，显性暴露（gatekeeper.ts 同款纪律）。
    const claimPath = join(root, ".pomaster", "evidence", "claims", "CLM-0099.json");
    const tampered = JSON.parse(readFileSync(claimPath, "utf8")) as Record<string, unknown>;
    tampered.execution_id = "claude_9f3ab2c1";
    writeFileSync(claimPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
    expect(() => compileExecutionTrace(paths, record.execution_id)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("Case A（§16）：未登记身份 → EXECUTION_NOT_FOUND；EXEC-* 第二词形 → SCHEMA_INVALID（禁自造身份）", async () => {
    const paths = pathsOf(store);
    expect(() => compileExecutionTrace(paths, "AGX-2026-09999")).toThrow(
      expect.objectContaining({ code: "EXECUTION_NOT_FOUND" }),
    );
    expect(() => compileExecutionTrace(paths, "EXEC-2026-00001")).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("纯读 + 确定性 + 零墙钟：compile 不落盘不建 traces/ 目录；双次编译字节相等；全键无 *_at/*_utc 墙钟位", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const paths = pathsOf(store);
    const before = readFileSync(executionPath(record.execution_id), "utf8");
    const first = compileExecutionTrace(paths, record.execution_id);
    const second = compileExecutionTrace(paths, record.execution_id);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(readFileSync(executionPath(record.execution_id), "utf8")).toBe(before);
    expect(existsSync(tracesDir())).toBe(false); // 投影零落盘（封存走显式 --seal）
    const sealed = sealExecutionTrace(store, record.execution_id, { retention: "TASK_RETENTION" });
    expect(collectKeys(sealed.manifest).every((key) => !key.endsWith("_at") && !key.endsWith("_utc"))).toBe(true);
    expect(collectKeys(first).every((key) => !key.endsWith("_at") && !key.endsWith("_utc"))).toBe(true);
  });
});

// ============================================================
// sealExecutionTrace（显式 --seal 物化；裁决 8 ②）
// ============================================================

describe("sealExecutionTrace（显式物化）", () => {
  it("happy path：retention=TASK_RETENTION → traces/AGX-*.json 落盘（durable）+ derived_from_seq=当前 seq + retention 写入 + 零 journal 事件（P34 新分区先例）", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.OTHER") }) as never }],
      executionId: record.execution_id,
    });
    const journalBefore = journalEvents().length;
    const result = sealExecutionTrace(store, record.execution_id, { retention: "TASK_RETENTION" });
    expect(result.plane).toBe("durable");
    expect(result.path.startsWith(tracesDir())).toBe(true);
    expect(journalEvents().length).toBe(journalBefore); // 零 journal 事件
    const onDisk = JSON.parse(readFileSync(result.path, "utf8")) as ExecutionTraceManifest;
    expect(onDisk.retention).toBe("TASK_RETENTION");
    const index = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    ) as { generation: { seq: number } };
    expect(onDisk.derived_from_seq).toBe(index.generation.seq); // 封存时刻 store seq 锚
    // 落盘字节与 seal 返回 manifest 同构（回读 round-trip 的字节前提）。
    expect(onDisk).toEqual(result.manifest);
  });

  it("retention 四档逐字词形分层（OD-1=B + OD-3）：EPHEMERAL → runtime/traces（易变平面）；TASK/INCIDENT/AUDIT → traces（durable 进 Git）", async () => {
    const retentions = ["EPHEMERAL", "TASK_RETENTION", "INCIDENT_RETENTION", "AUDIT_RETENTION"] as const;
    const ids: string[] = [];
    for (let index = 0; index < retentions.length; index += 1) {
      const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
      ids.push(record.execution_id);
    }
    for (let index = 0; index < retentions.length; index += 1) {
      const result = sealExecutionTrace(store, ids[index] as string, { retention: retentions[index] });
      const expectedDir = retentions[index] === "EPHEMERAL" ? rawTracesDir() : tracesDir();
      expect(result.path.startsWith(expectedDir)).toBe(true);
      expect(existsSync(result.path)).toBe(true);
    }
    expect(readdirSync(rawTracesDir())).toEqual([`${ids[0]}.json`]);
    expect(readdirSync(tracesDir())).toEqual([ids[1], ids[2], ids[3]].map((id) => `${id}.json`));
  });

  it("retention 词表外 → VOCAB_INVALID_VALUE（fail-closed 不发明；扩值走词汇表 PR）", async () => {
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    expect(() =>
      sealExecutionTrace(store, record.execution_id, { retention: "FOREVER" as never }),
    ).toThrow(expect.objectContaining({ code: "VOCAB_INVALID_VALUE" }));
    expect(TRACE_RETENTION_VALUES).toEqual(["EPHEMERAL", "TASK_RETENTION", "INCIDENT_RETENTION", "AUDIT_RETENTION"]);
  });

  it("重复封存 → TRACE_ALREADY_SEALED（同档再封 + 跨平面 EPHEMERAL 补封均拒——审计快照禁静默覆盖）；未登记身份 → EXECUTION_NOT_FOUND", async () => {
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    sealExecutionTrace(store, record.execution_id, { retention: "TASK_RETENTION" });
    expect(() =>
      sealExecutionTrace(store, record.execution_id, { retention: "TASK_RETENTION" }),
    ).toThrow(expect.objectContaining({ code: "TRACE_ALREADY_SEALED" }));
    expect(() =>
      sealExecutionTrace(store, record.execution_id, { retention: "EPHEMERAL" }),
    ).toThrow(expect.objectContaining({ code: "TRACE_ALREADY_SEALED" }));
    expect(() =>
      sealExecutionTrace(store, "AGX-2026-09999", { retention: "AUDIT_RETENTION" }),
    ).toThrow(expect.objectContaining({ code: "EXECUTION_NOT_FOUND" }));
  });

  it("readSealedExecutionTrace round-trip：落盘字节同构回读 + stale=false（无漂移）+ plane 呈现；双平面均缺席 → null", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.OTHER") }) as never }],
      executionId: record.execution_id,
    });
    const sealed = sealExecutionTrace(store, record.execution_id, { retention: "INCIDENT_RETENTION" });
    const read = readSealedExecutionTrace(pathsOf(store), record.execution_id);
    expect(read).not.toBeNull();
    expect(read?.plane).toBe("durable");
    expect(read?.path).toBe(sealed.path);
    expect(read?.manifest).toEqual(sealed.manifest);
    expect(read?.stale).toBe(false);
    expect(readSealedExecutionTrace(pathsOf(store), "AGX-2026-09999")).toBeNull();
  });
});

// ============================================================
// stale（canonical 重放对账——evidence compact 快路径同构）
// ============================================================

describe("stale 对账（canonical 重放纪律）", () => {
  it("封存后 post-hoc 补录（CLM 挂同一执行）→ stale=true 显式呈现 + live 投影已含新证据（快照不冒充新鲜）", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    sealExecutionTrace(store, record.execution_id, { retention: "AUDIT_RETENTION" });
    expect(readSealedExecutionTrace(pathsOf(store), record.execution_id)?.stale).toBe(false);
    // post-hoc 补录是合法通路（已封口/封存不拒）——封存快照由此漂移。
    await applyTransaction(store, {
      ops: [{
        op: "record_claim",
        claim: {
          clm: "CLM-0020",
          subjectId: gid("PAGE.DASHBOARD"),
          assertion: "封存后补录的事后验证",
          assertedBy: AGENT,
          evidenceRefs: [],
          executionId: record.execution_id,
        },
      }],
    });
    const read = readSealedExecutionTrace(pathsOf(store), record.execution_id);
    expect(read?.stale).toBe(true);
    expect(read?.manifest.evidence_refs).toEqual([]); // 封存快照保持封存时刻事实
    expect(compileExecutionTrace(pathsOf(store), record.execution_id).evidence_refs).toEqual(["CLM-0020"]);
  });

  it("executionTraceDerivedView：派生视图剥 retention/derived_from_seq（封存承诺不参与对账面）——同派生面不同 retention 视图字节相等", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const projection = compileExecutionTrace(pathsOf(store), record.execution_id);
    const view = executionTraceDerivedView(projection);
    expect(Object.keys(view).sort()).toEqual(
      ["agent_spawns", "evidence_refs", "execution_id", "raw_trace_ref", "reads", "schema", "tool_receipts", "trace_version", "transition_proposals", "writes"].sort(),
    );
    const sealedA = { ...projection, retention: "AUDIT_RETENTION" as const, derived_from_seq: 5 };
    const sealedB = { ...projection, retention: "EPHEMERAL" as const, derived_from_seq: 9 };
    expect(JSON.stringify(executionTraceDerivedView(sealedA))).toBe(JSON.stringify(view));
    expect(JSON.stringify(executionTraceDerivedView(sealedB))).toBe(JSON.stringify(view));
  });
});

// ============================================================
// Benchmark C（§15 Trace/Identity 分离四断言）
// ============================================================

describe("Benchmark C（Trace/Identity 分离）", () => {
  it("Identity unchanged：compile 与 seal 前后 ExecutionRecord 档案字节恒等（trace 是纯读侧车）", async () => {
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const before = readFileSync(executionPath(record.execution_id), "utf8");
    compileExecutionTrace(pathsOf(store), record.execution_id);
    expect(readFileSync(executionPath(record.execution_id), "utf8")).toBe(before);
    sealExecutionTrace(store, record.execution_id, { retention: "AUDIT_RETENTION" });
    expect(readFileSync(executionPath(record.execution_id), "utf8")).toBe(before);
    const after = JSON.parse(readFileSync(executionPath(record.execution_id), "utf8")) as ExecutionRecord;
    expect(after.execution_id).toBe(record.execution_id);
    expect(after.ended_at).toBeNull();
  });

  it("Trace separately retained：sealed 文件落独立 traces/ 分区（不混 executions/ 档案平面；TRACES_RELATIVE 词形 .pomaster/traces）", async () => {
    expect(TRACES_RELATIVE).toBe(".pomaster/traces");
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    sealExecutionTrace(store, record.execution_id, { retention: "TASK_RETENTION" });
    expect(readdirSync(tracesDir())).toEqual([`${record.execution_id}.json`]);
    const executionFiles = readdirSync(join(root, ".pomaster", "executions"));
    expect(executionFiles).toEqual([`${record.execution_id}.json`]); // 档案平面无 trace 文件混入
    expect(executionFiles[0]).toMatch(/^AGX-[0-9]{4}-[0-9]+\.json$/);
  });

  it("Evidence links back（双向对账）：manifest.evidence_refs 每项源文件自报 execution_id；自报匹配的全部 GRN/CLM 都在 refs 内", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const other = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:01:00.000Z" });
    await applyTransaction(store, {
      ops: [
        { op: "record_gate_run", run: { grn: "GRN-0001", trigger: "on_demand", executionId: record.execution_id, result: gateResultFixture("GRN-0001") } },
        {
          op: "record_claim",
          claim: { clm: "CLM-0001", subjectId: gid("PAGE.DASHBOARD"), assertion: "本执行声称", assertedBy: AGENT, evidenceRefs: [], executionId: record.execution_id },
        },
        { op: "record_gate_run", run: { grn: "GRN-0002", trigger: "on_demand", executionId: other.execution_id, result: gateResultFixture("GRN-0002") } },
      ],
    });
    const manifest = compileExecutionTrace(pathsOf(store), record.execution_id);
    expect(manifest.evidence_refs).toEqual(["CLM-0001", "GRN-0001"]); // 他执行 GRN-0002 不混入
    // 正向：refs → 源文件自报回连 execution_id（§25.4 audit 回连的 trace 面兑现）。
    for (const ref of manifest.evidence_refs) {
      const isRun = ref.startsWith("GRN-");
      const path = join(root, ".pomaster", "evidence", isRun ? "runs" : "claims", `${ref}.json`);
      const source = JSON.parse(readFileSync(path, "utf8")) as { execution_id?: string };
      expect(source.execution_id).toBe(record.execution_id);
    }
    // 反向：证据平面自报匹配的文件全集 ⊆ manifest.evidence_refs（零遗漏）。
    for (const dir of ["runs", "claims"] as const) {
      for (const name of readdirSync(join(root, ".pomaster", "evidence", dir))) {
        const source = JSON.parse(readFileSync(join(root, ".pomaster", "evidence", dir, name), "utf8")) as { execution_id?: string; grn?: string; clm?: string };
        if (source.execution_id !== record.execution_id) continue;
        const ref = (source.grn ?? source.clm) as string;
        expect(manifest.evidence_refs).toContain(ref);
      }
    }
  });

  it("raw 可丢弃（§15 第四断言）：删 runtime/traces 后投影字节不变 + EPHEMERAL 封存读取显式 null（runtime/ 判据豁免语义）", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    await applyTransaction(store, {
      ops: [{ op: "upsert_object", envelope: pageEnvelope({ id: gid("PAGE.OTHER") }) as never }],
      executionId: record.execution_id,
    });
    const before = JSON.stringify(compileExecutionTrace(pathsOf(store), record.execution_id));
    sealExecutionTrace(store, record.execution_id, { retention: "EPHEMERAL" });
    expect(readSealedExecutionTrace(pathsOf(store), record.execution_id)?.plane).toBe("ephemeral");
    rmSync(rawTracesDir(), { recursive: true, force: true });
    // 删除可丢弃 raw trace 后：核心投影可完整重建（字节不变）+ 封存读取显式缺席。
    expect(JSON.stringify(compileExecutionTrace(pathsOf(store), record.execution_id))).toBe(before);
    expect(readSealedExecutionTrace(pathsOf(store), record.execution_id)).toBeNull();
  });
});

// ============================================================
// 清单与装载（fail-closed）
// ============================================================

describe("listSealedExecutionTraces / 装载面", () => {
  it("清单：durable + ephemeral 双平面并呈（同号 durable 优先单行）、execution_id 字典序、retention/derived_from_seq 随行", async () => {
    const first = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const second = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:01:00.000Z" });
    sealExecutionTrace(store, second.execution_id, { retention: "EPHEMERAL" });
    sealExecutionTrace(store, first.execution_id, { retention: "AUDIT_RETENTION" });
    const rows = listSealedExecutionTraces(pathsOf(store));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      execution_id: first.execution_id,
      retention: "AUDIT_RETENTION",
      plane: "durable",
    });
    expect(rows[1]).toMatchObject({
      execution_id: second.execution_id,
      retention: "EPHEMERAL",
      plane: "ephemeral",
    });
    expect(typeof rows[0]?.derived_from_seq).toBe("number");
  });

  it("装载面 fail-closed：损坏 JSON / execution_id 与文件名不一致 / retention 词表外 → SCHEMA_INVALID", async () => {
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const sealed = sealExecutionTrace(store, record.execution_id, { retention: "TASK_RETENTION" });
    const paths = pathsOf(store);
    // 损坏。
    writeFileSync(sealed.path, "{broken", "utf8");
    expect(() => readSealedExecutionTrace(paths, record.execution_id)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
    // execution_id 键漂移（与文件名不一致）——从封存 manifest 克隆改键后重写。
    const drifted: Record<string, unknown> = { ...sealed.manifest, execution_id: "AGX-2026-99999" };
    writeFileSync(sealed.path, `${JSON.stringify(drifted, null, 2)}\n`, "utf8");
    expect(() => readSealedExecutionTrace(paths, record.execution_id)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
    // retention 词表外（手改痕迹）。
    const badRetention: Record<string, unknown> = { ...sealed.manifest, retention: "FOREVER" };
    writeFileSync(sealed.path, `${JSON.stringify(badRetention, null, 2)}\n`, "utf8");
    expect(() => readSealedExecutionTrace(paths, record.execution_id)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
    expect(() => listSealedExecutionTraces(paths)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });
});

// ============================================================
// 16-execution-trace.schema.json（schema 资产入库正反例；ajv draft-07）
// ============================================================

const ajv = new Ajv({ strictSchema: false, allErrors: true });
for (const schema of Object.values(allSchemas)) {
  ajv.addSchema(schema as Record<string, unknown>);
}
const validateTrace = ajv.compile(executionTraceSchema as object);

/** 合法封存 manifest 基线（覆盖即得非法变体）。 */
const sealedManifestBase: Record<string, unknown> = {
  execution_id: "AGX-2026-00182",
  schema: "pomaster.execution_trace/v1",
  trace_version: 1,
  retention: "TASK_RETENTION",
  reads: { governed_refs: [], source_areas: [] },
  writes: { governed_refs: ["PAGE.DASHBOARD"], source_areas: [] },
  tool_receipts: [
    {
      grn: "GRN-0007",
      gate: "BUILD",
      gate_def: "POLICY.GATE.BUILD@0.1.0",
      tool: "tiny-csv-tool:probe",
      tool_version: "0.1.0",
      metric_dialect: "build:exit_code",
      verdict: "passed",
      ran_at_seq: 3,
    },
  ],
  agent_spawns: [],
  transition_proposals: [{ seq: 2, transition_ops: 1 }],
  evidence_refs: ["CLM-0003", "GRN-0007"],
  raw_trace_ref: null,
  derived_from_seq: 12,
};

describe("16-execution-trace.schema.json", () => {
  it("$id 形态对齐 v1-draft 契约且已注册进 allSchemas（18 份聚合，W1-C 增量 15→16；VB-PR1 增量 16→17；W1-D2 增量 17→18）", () => {
    expect(executionTraceSchema.$id).toBe(
      "https://pomaster.dev/schemas/execution-trace/v1-draft.json",
    );
    expect(allSchemas.executionTrace).toBe(executionTraceSchema);
    expect(Object.keys(allSchemas).length).toBe(18);
  });

  it("正例：封存形态（retention 四档词形）与投影形态（retention null）均过 ajv 校验", () => {
    expect(validateTrace(sealedManifestBase)).toBe(true);
    expect(validateTrace({ ...sealedManifestBase, retention: null, derived_from_seq: null })).toBe(true);
    expect(validateTrace({ ...sealedManifestBase, retention: "EPHEMERAL" })).toBe(true);
    expect(validateTrace({ ...sealedManifestBase, retention: "AUDIT_RETENTION" })).toBe(true);
  });

  it("反例：additionalProperties 封条（自由文本载荷键位结构性不存在——§8.4 隐私封条）/ retention 词表外 / trace_version 漂移 / EXEC-* 词形 / verdict 词表外（03 七态 $ref 复用）", () => {
    expect(validateTrace({ ...sealedManifestBase, chain_of_thought: "…" })).toBe(false);
    expect(validateTrace({ ...sealedManifestBase, retention: "FOREVER" })).toBe(false);
    expect(validateTrace({ ...sealedManifestBase, trace_version: 2 })).toBe(false);
    expect(validateTrace({ ...sealedManifestBase, execution_id: "EXEC-2026-00001" })).toBe(false);
    expect(
      validateTrace({
        ...sealedManifestBase,
        tool_receipts: [{ ...(sealedManifestBase.tool_receipts as Record<string, unknown>[])[0], verdict: "GREEN" }],
      }),
    ).toBe(false);
    expect(validateTrace({ ...sealedManifestBase, derived_from_seq: "12" })).toBe(false);
  });
});
