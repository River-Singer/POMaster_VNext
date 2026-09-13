/**
 * execution-inflight-receipts.spec.ts —— 在途执行的已入账回执计数（W4-S1 §6-3 半边；
 * countExecutionInflightReceipts kernel 判读面）。
 *
 * 判据锚（evidence-invalidation-map.md §3 B11 / §5-8；gatekeeper.ts 同型纪律）：
 * - 计数语义：runs（GRN）+ observations（OBS/ENVREC）两平面中 execution_id 锚定本
 *   执行的记录总数——end 缺失 ≠ 零发生（回执未存 ≠ 未发生），呈现面据此区分
 *   「在途（有已入账产物 N 件）/在途（零产物）」；
 * - 分母纪律：只收词形匹配文件；execution_id 键缺席不计数（缺席不伪造，P20 裁定）；
 * - fail-closed：JSON 损坏 / record_type 与文件族不符 / execution_id 词形漂移 →
 *   SCHEMA_INVALID（判读面静默损坏 = 假绿计数）；
 * - 纯读零写：journal 字节不变（判读不是治理动作）。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  beginExecution,
  buildObservationReceipt,
  countExecutionInflightReceipts,
  pathsOf,
  persistObservationRecord,
  type Store,
} from "@pomaster/kernel";
import { makeStore } from "./helpers.js";

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

const BASE = {
  role: "orchestrator",
  runtime: "claude-code",
  identityKind: "interactive",
} as const;

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

function writeObservationRaw(observationId: string, body: Record<string, unknown>): void {
  const dir = join(root, ".pomaster", "evidence", "observations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${observationId}.json`), `${JSON.stringify(body, null, 2)}\n`);
}

async function recordObs(executionId: string): Promise<void> {
  const receipt = buildObservationReceipt({
    observationId: "OBS-0001",
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

function journalBytes(): string {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
}

describe("countExecutionInflightReceipts", () => {
  it("空 store（evidence 平面缺席/空）→ 0（显式空，不建目录不报错）", async () => {
    const record = await beginExecution(store, BASE);
    expect(countExecutionInflightReceipts(pathsOf(store), record.execution_id)).toBe(0);
  });

  it("GRN+OBS 合计锚定本执行的回执数；跨执行锚不串；无身份键的存量记录不计数", async () => {
    const live = await beginExecution(store, BASE);
    const other = await beginExecution(store, BASE);
    await recordRun("GRN-0001", live.execution_id);
    await recordRun("GRN-0002", live.execution_id, "failed");
    await recordRun("GRN-0003", other.execution_id);
    await recordObs(live.execution_id);
    // 存量形态：GRN 文件无 execution_id 键（P20 裁定：缺席不伪造，零迁移）。
    writeObservationRaw("OBS-9999", {
      record_type: "observation_receipt",
      observation_id: "OBS-9999",
      result: "NOT_OBSERVABLE",
    });

    expect(countExecutionInflightReceipts(pathsOf(store), live.execution_id)).toBe(3);
    expect(countExecutionInflightReceipts(pathsOf(store), other.execution_id)).toBe(1);
  });

  it("词形外文件不进分母（note.json 之类被忽略）", async () => {
    const live = await beginExecution(store, BASE);
    await recordRun("GRN-0001", live.execution_id);
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    writeFileSync(join(runsDir, "note.json"), `${JSON.stringify({ execution_id: live.execution_id })}\n`);
    expect(countExecutionInflightReceipts(pathsOf(store), live.execution_id)).toBe(1);
  });

  it("fail-closed：JSON 损坏 → SCHEMA_INVALID（判读面静默损坏 = 假绿计数）", async () => {
    const live = await beginExecution(store, BASE);
    await recordRun("GRN-0001", live.execution_id);
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    writeFileSync(join(runsDir, "GRN-0002.json"), "{broken");
    expect(() => countExecutionInflightReceipts(pathsOf(store), live.execution_id)).toThrowError(
      /SCHEMA_INVALID|无法解析/,
    );
  });

  it("fail-closed：record_type 与文件族不符 → SCHEMA_INVALID", async () => {
    const live = await beginExecution(store, BASE);
    writeObservationRaw("OBS-0002", {
      record_type: "run",
      observation_id: "OBS-0002",
      execution_id: live.execution_id,
    });
    expect(() => countExecutionInflightReceipts(pathsOf(store), live.execution_id)).toThrowError(
      /SCHEMA_INVALID|record_type/,
    );
  });

  it("fail-closed：execution_id 词形漂移 → SCHEMA_INVALID（手改痕迹显性暴露）", async () => {
    const live = await beginExecution(store, BASE);
    writeObservationRaw("OBS-0003", {
      record_type: "observation_receipt",
      observation_id: "OBS-0003",
      execution_id: "EX-1",
    });
    expect(() => countExecutionInflightReceipts(pathsOf(store), live.execution_id)).toThrowError(
      /SCHEMA_INVALID|词形/,
    );
  });

  it("入参词形预检：非 AGX 引用 → SCHEMA_INVALID（IO 前 fail-closed）", () => {
    expect(() => countExecutionInflightReceipts(pathsOf(store), "EX-1")).toThrowError(
      /SCHEMA_INVALID|词形/,
    );
  });

  it("纯读零写：判读前后 journal 字节不变", async () => {
    const live = await beginExecution(store, BASE);
    await recordRun("GRN-0001", live.execution_id);
    await recordObs(live.execution_id);
    const before = journalBytes();
    expect(countExecutionInflightReceipts(pathsOf(store), live.execution_id)).toBe(2);
    expect(journalBytes()).toBe(before);
  });
});
