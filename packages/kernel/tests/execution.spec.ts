/**
 * execution.spec.ts —— Agent Execution Identity 原语（PRD §25.4；P20 D 线地基）。
 *
 * 判据锚：
 * - AGX-n 词形（PRD §25.4 例文 AGX-2026-00182：年段 4 位 + 序号；变宽接受 GRN-[0-9]+
 *   同款先例）与缺省分配「现有最大序号 +1（5 位零填充）」；
 * - 词表闭包：role ∈ D 线 §4 roles_vocabulary_p0 六值 / runtime ∈ D 线 §2.1 三值 /
 *   identity_kind ∈ D 线 §2.1 三值——词表外 fail-closed（不发明）；
 * - executions/AGX-*.json 档案闭形态（一切键在场，缺席 = null 显式——C1）+ schema
 *   词形 pomaster.execution/v1（D 线 §2.1 例文逐字）；
 * - begin 同号唯一（EXECUTION_ALREADY_EXISTS）/ end 重复封口显式拒绝
 *   （EXECUTION_ALREADY_ENDED）/ session_key 在场须已 attach（SESSION_NOT_FOUND）；
 * - journal 事件 EXECUTION_BEGUN / EXECUTION_ENDED（A4：seq 采样，无墙钟）；
 * - assertExecutionAttachable：record 通路挂载校验——词形非法 SCHEMA_INVALID /
 *   未登记 EXECUTION_NOT_FOUND / 已封口执行允许事后补录（不伪造时间围栏）；
 * - 兼容裁定（decisions）：evidence 记录 execution_id 可选（存量零迁移）+ record 通路
 *   携带即强制校验（store.applyRecordClaim / applyRecordGateRun 联测）——缺席不伪造。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyTransaction,
  assertExecutionAttachable,
  beginExecution,
  endExecution,
  EXECUTIONS_RELATIVE,
  EXECUTION_ID_PATTERN,
  allocateExecutionId,
  attachSession,
  listExecutionRecords,
  readExecutionRecordById,
  type ExecutionRecord,
  type Store,
} from "@pomaster/kernel";
import { pathsOf } from "../src/paths.js";
import { AGENT, makeStore } from "./helpers.js";

let root: string;
let store: Store;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
});

function executionPath(id: string): string {
  return join(root, ".pomaster", "executions", `${id}.json`);
}

function journalEvents(): Array<Record<string, unknown>> {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

const BASE = {
  role: "orchestrator",
  runtime: "claude-code",
  identityKind: "interactive",
} as const;

describe("beginExecution（§25.4 登记）", () => {
  it("缺省分配 = 现有最大序号 +1（5 位零填充，PRD 例文 AGX-2026-00182 词形）；档案闭形态键显式在场", async () => {
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    expect(record.execution_id).toMatch(EXECUTION_ID_PATTERN);
    expect(record.execution_id).toMatch(/^AGX-[0-9]{4}-00001$/);
    // 闭形态：一切键在场（C1 显式缺席，不省键）。
    expect(Object.keys(record).sort()).toEqual(
      [
        "change_id", "context_manifest_id", "ended_at", "execution_id", "harness",
        "identity_kind", "model", "notes", "permit_ids", "policy_lock", "role",
        "runtime", "schema", "session_key", "started_at", "task_id",
      ].sort(),
    );
    expect(record.schema).toBe("pomaster.execution/v1");
    expect(record.ended_at).toBeNull();
    expect(record.permit_ids).toEqual([]);
    // 档案落盘 executions/（D 线 §1.3 进 Git 平面）。
    const onDisk = JSON.parse(readFileSync(executionPath(record.execution_id), "utf8")) as ExecutionRecord;
    expect(onDisk.execution_id).toBe(record.execution_id);
  });

  it("递增分配跨条目单调；显式指定同号 → EXECUTION_ALREADY_EXISTS（AGX 主键唯一）", async () => {
    const first = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const second = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:01:00.000Z" });
    expect(second.execution_id.endsWith("00002")).toBe(true);
    expect(
      Number(second.execution_id.split("-")[2]) - Number(first.execution_id.split("-")[2]),
    ).toBe(1);
    await expect(
      beginExecution(store, { ...BASE, executionId: first.execution_id }),
    ).rejects.toMatchObject({ code: "EXECUTION_ALREADY_EXISTS" });
  });

  it("词形非法显式指定 → SCHEMA_INVALID；词表外 role/runtime/identity_kind → VOCAB_INVALID_VALUE（不发明）", async () => {
    await expect(
      beginExecution(store, { ...BASE, executionId: "AGX-26-001", startedAt: "2026-08-30T00:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      beginExecution(store, { ...BASE, executionId: "EXEC-2026-00001", startedAt: "2026-08-30T00:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    await expect(
      beginExecution(store, { ...BASE, role: "SUPERVISOR", startedAt: "2026-08-30T00:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "VOCAB_INVALID_VALUE" });
    await expect(
      beginExecution(store, { ...BASE, runtime: "claude", startedAt: "2026-08-30T00:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "VOCAB_INVALID_VALUE" });
    await expect(
      beginExecution(store, { ...BASE, identityKind: "daemon", startedAt: "2026-08-30T00:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "VOCAB_INVALID_VALUE" });
  });

  it("session_key 在场须已 attach（SESSION_NOT_FOUND）；session_key + harness 成对纪律", async () => {
    await expect(
      beginExecution(store, { ...BASE, sessionKey: "claude_9f3ab2c1", startedAt: "2026-08-30T00:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    await attachSession(store, {
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      now: Date.parse("2026-08-30T00:00:00.000Z"),
    });
    const record = await beginExecution(store, {
      ...BASE,
      sessionKey: "claude_9f3ab2c1",
      harness: "claude-code",
      startedAt: "2026-08-30T00:05:00.000Z",
    });
    expect(record.session_key).toBe("claude_9f3ab2c1");
    expect(record.harness).toBe("claude-code");
  });

  it("journal 事件 EXECUTION_BEGUN（A4 seq 采样，无墙钟键）；EXECUTIONS_RELATIVE 词形（D 线 §1.3 逐字）", async () => {
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    expect(journalEvents().some((event) => event.type === "EXECUTION_BEGUN")).toBe(true);
    expect(EXECUTIONS_RELATIVE).toBe(".pomaster/executions");
    const begun = journalEvents().find((event) => event.type === "EXECUTION_BEGUN");
    expect(begun?.execution_id).toBe(record.execution_id);
    expect(begun?.seq).toBe(0);
    expect(Object.keys(begun ?? {}).some((key) => key.endsWith("_at"))).toBe(false);
  });
});

describe("endExecution（封口）", () => {
  it("封口置 ended_at + journal EXECUTION_ENDED；重复封口 → EXECUTION_ALREADY_ENDED（显式拒绝）", async () => {
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const closed = await endExecution(store, record.execution_id, { endedAt: "2026-08-30T01:00:00.000Z" });
    expect(closed.ended_at).toBe("2026-08-30T01:00:00.000Z");
    expect(journalEvents().some((event) => event.type === "EXECUTION_ENDED")).toBe(true);
    await expect(
      endExecution(store, record.execution_id, { endedAt: "2026-08-30T02:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "EXECUTION_ALREADY_ENDED" });
  });

  it("未登记身份封口 → EXECUTION_NOT_FOUND", async () => {
    await expect(endExecution(store, "AGX-2026-09999")).rejects.toMatchObject({
      code: "EXECUTION_NOT_FOUND",
    });
  });
});

describe("assertExecutionAttachable（record 通路挂载校验；S1 禁自造身份）", () => {
  it("未登记 → EXECUTION_NOT_FOUND；词形非法 → SCHEMA_INVALID", () => {
    const paths = pathsOf(store);
    expect(() => assertExecutionAttachable(paths, "AGX-2026-09999")).toThrow(
      expect.objectContaining({ code: "EXECUTION_NOT_FOUND" }),
    );
    expect(() => assertExecutionAttachable(paths, "claude_9f3ab2c1")).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });

  it("登记后可挂载；已封口执行允许事后补录（ended_at 在场不拒）；损坏档案 → SCHEMA_INVALID", async () => {
    const paths = pathsOf(store);
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    expect(() => assertExecutionAttachable(paths, record.execution_id)).not.toThrow();
    await endExecution(store, record.execution_id, { endedAt: "2026-08-30T01:00:00.000Z" });
    expect(() => assertExecutionAttachable(paths, record.execution_id)).not.toThrow();
    writeFileSync(executionPath(record.execution_id), "{broken", "utf8");
    expect(() => assertExecutionAttachable(paths, record.execution_id)).toThrow(
      expect.objectContaining({ code: "SCHEMA_INVALID" }),
    );
  });
});

describe("读取与分配（listExecutionRecords / allocateExecutionId / readExecutionRecordById）", () => {
  it("清单按字典序返回全部档案；allocateExecutionId 跨年扫描全局 max（确定性，无随机）", async () => {
    const first = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    const second = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:01:00.000Z" });
    const paths = pathsOf(store);
    const listed = listExecutionRecords(paths);
    expect(listed.map((record) => record.execution_id)).toEqual([first.execution_id, second.execution_id]);
    const next = allocateExecutionId(paths, new Date(Date.parse("2027-01-01T00:00:00.000Z")));
    expect(next).toBe("AGX-2027-00003");
    const byId = readExecutionRecordById(paths, first.execution_id);
    expect(byId?.started_at).toBe("2026-08-30T00:00:00.000Z");
    expect(readExecutionRecordById(paths, "AGX-2026-09999")).toBeNull();
  });
});

// —— 兼容裁定联测：store 事务携带 executionId → 档案存在性闸门 ——

describe("record op 透传（执行身份贯穿证据链 kernel 闸门）", () => {
  it("record_gate_run 携带未登记 execution_id → EXECUTION_NOT_FOUND 且 evidence/runs 零落盘", async () => {
    await expect(
      applyTransaction(store, {
        ops: [{
          op: "record_gate_run",
          run: {
            grn: "GRN-0001",
            trigger: "on_demand",
            executionId: "AGX-2026-09999",
            result: gateResultFixture("GRN-0001"),
          },
        }],
      }),
    ).rejects.toMatchObject({ code: "EXECUTION_NOT_FOUND" });
    expect(readdirSync(join(root, ".pomaster", "evidence", "runs"))).toHaveLength(0);
  });

  it("record_claim 携带已登记 execution_id → 落盘 claim 带 execution_id 键（canonical 键序位：clm 之后）", async () => {
    await seedObject();
    const record = await beginExecution(store, { ...BASE, startedAt: "2026-08-30T00:00:00.000Z" });
    await applyTransaction(store, {
      ops: [{
        op: "record_claim",
        claim: {
          clm: "CLM-0001",
          subjectId: "PAGE.DASHBOARD" as never,
          assertion: "页面已按蓝图渲染",
          assertedBy: AGENT,
          evidenceRefs: [],
          executionId: record.execution_id,
        },
      }],
    });
    const claim = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-0001.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(claim.execution_id).toBe(record.execution_id);
    expect(Object.keys(claim).indexOf("execution_id")).toBe(2);
  });

  it("record_claim 缺席 execution_id → 键缺席（存量字节兼容；不伪造 null 占位）", async () => {
    await seedObject();
    await applyTransaction(store, {
      ops: [{
        op: "record_claim",
        claim: {
          clm: "CLM-0002",
          subjectId: "PAGE.DASHBOARD" as never,
          assertion: "缺席身份的存量形态",
          assertedBy: AGENT,
          evidenceRefs: [],
        },
      }],
    });
    const legacy = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-0002.json"), "utf8"),
    ) as Record<string, unknown>;
    expect("execution_id" in legacy).toBe(false);
  });
});

// ============================================================
// 局部 fixture（避免跨模块依赖 CLI 包）
// ============================================================

async function seedObject(): Promise<void> {
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "PAGE.DASHBOARD",
          kind: "page_surface",
          axisProfile: "page_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "仪表盘",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: { surface: "V1" },
        } as never,
      },
    ],
  });
}

/** 最小合法 GateResult（camelCase 输入形态；同 cli/record.spec fixture 骨架）。 */
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
