/**
 * record-execution-threading.spec.ts —— execution_id 贯穿 GRN/CLM 证据链
 * （P20 · PRD §25.4 audit 问句「哪个 Agent 在什么 Policy/Permit 下做了哪次变化」）。
 *
 * 判据锚（兼容裁定 decisions 的通路侧落点）：
 * - record gate-run/claim 携带 --execution-id：词形（AGX-n）+ executions/ 档案存在性
 *   双检 fail-closed（EXECUTION_NOT_FOUND——S1 禁自造身份）；APPLIED 后 GRN/CLM 文件
 *   承载 execution_id 键（07 schema 可选字段）+ 信封 execution_id 回读；
 * - 缺省沿文件自报（compact 收编同款）；皆无 = 键缺席——同内容二次 record 仍
 *   SKIPPED_CANONICAL 零写入（存量字节兼容，不伪造 null）；
 * - 已带 execution_id 的文件二次 compact 收编 → already_canonical（canonical 重放
 *   携带身份键，字节相等——收编不剥字段）；已带身份文件重 record 同号亦零写入；
 * - compact 批量通路：文件自报身份随 op 入账（收编即贯穿）；
 * - 显式覆盖优先于文件自报（--execution-id > 文件 execution_id）；
 * - 已封口执行允许事后补录（ended_at 在场不拒——post-hoc record 合法通路）；
 * - 快路径判卷补位（P20 红队发现 2）：手写 canonical 形态文件携带未登记 AGX 曾借
 *   already_canonical 零 op 通路绕过 kernel 校验（record 拒 / compact 放的双通路
 *   判卷分叉）——现 compact 快路径同判卷（executions/ 档案存在性）：compact 出
 *   malformed（EXECUTION_NOT_FOUND detail）、record --grn 重放 exit 1；登记该 AGX
 *   后同一文件才回绿（fail-closed 方向正确、合法通路不破）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginExecution, endExecution, type Store } from "@pomaster/kernel";
import { runCompact, runRecordClaim, runRecordGateRun, type CliEnvelope } from "@pomaster/cli";
import { AGENT, gid, makeStore } from "../../../packages/kernel/tests/helpers.js";

let root: string;
let store: Store;
let fileSeq = 0;

beforeEach(async () => {
  const made = await makeStore();
  root = made.root;
  store = made.store;
  fileSeq = 0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function gatePayload(): Record<string, unknown> {
  return {
    gate: "BUILD",
    gate_def: "POLICY.GATE.BUILD@0.1.0",
    verdict: "passed",
    metric_dialect: "build:exit_code",
    subject_id: null,
    denominator_refs: [],
    counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
    trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
    duration_ms: { self: 1, external: 0 },
  };
}

function claimPayload(): Record<string, unknown> {
  return {
    subject_id: gid("PAGE.DASHBOARD"),
    assertion: "页面已按蓝图渲染",
    asserted_by: { actor_type: AGENT.actorType, actor: AGENT.actor, self_attested: true },
    evidence_refs: [],
  };
}

async function seedObject(): Promise<void> {
  const { applyTransaction } = await import("@pomaster/kernel");
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: gid("PAGE.DASHBOARD"),
          kind: "page_surface",
          axisProfile: "page_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "仪表盘",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: { surface: "V1" },
        },
      },
    ],
  });
}

function writeInput(value: unknown): string {
  fileSeq += 1;
  const path = join(root, `input-${fileSeq}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function runFile(grn: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "evidence", "runs", `${grn}.json`), "utf8"),
  ) as Record<string, unknown>;
}

function claimFile(clm: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "evidence", "claims", `${clm}.json`), "utf8"),
  ) as Record<string, unknown>;
}

function envelopeOf(outcome: CliEnvelope<Record<string, unknown>>): Record<string, unknown> {
  return outcome.result as Record<string, unknown>;
}

describe("record gate-run --execution-id（GRN 侧贯穿）", () => {
  it("APPLIED：GRN 文件承载 execution_id 键 + 信封回读；journal 落 EXECUTION_BEGUN 先行", async () => {
    await seedObject();
    const execution = await beginExecution(store, {
      role: "orchestrator",
      runtime: "claude-code",
      identityKind: "interactive",
      startedAt: "2026-08-30T00:00:00.000Z",
    });
    const outcome = await runRecordGateRun(root, {
      from: writeInput(gatePayload()),
      executionId: execution.execution_id,
    });
    expect(outcome.ok).toBe(true);
    const data = envelopeOf(outcome as CliEnvelope<Record<string, unknown>>);
    expect(data.execution_id).toBe(execution.execution_id);
    expect(data.change).toBe("APPLIED");
    const run = runFile("GRN-0001");
    expect(run.execution_id).toBe(execution.execution_id);
    // 键序 canonical 位：trigger 之后、gate_result 之前。
    const keys = Object.keys(run);
    expect(keys.indexOf("execution_id")).toBe(keys.indexOf("trigger") + 1);
    expect(keys.indexOf("execution_id")).toBe(keys.indexOf("gate_result") - 1);
  });

  it("未登记身份 fail-closed EXECUTION_NOT_FOUND（S1 禁自造身份）零落盘；词形非法 SCHEMA_INVALID", async () => {
    const missing = await runRecordGateRun(root, {
      from: writeInput(gatePayload()),
      executionId: "AGX-2026-09999",
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    const malformed = await runRecordGateRun(root, {
      from: writeInput(gatePayload()),
      executionId: "claude_9f3ab2c1",
    });
    expect(malformed.ok).toBe(false);
    expect(malformed.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(readdirSync(join(root, ".pomaster", "evidence", "runs"))).toHaveLength(0);
  });

  it("缺省（文件/选项皆无）= 键缺席：GRN 文件零 execution_id 键且二次 record 零写入（存量字节兼容）", async () => {
    const from = writeInput(gatePayload());
    const first = await runRecordGateRun(root, { from });
    expect(first.ok).toBe(true);
    expect("execution_id" in runFile("GRN-0001")).toBe(false);
    expect(envelopeOf(first as CliEnvelope<Record<string, unknown>>).execution_id).toBeNull();
    const second = await runRecordGateRun(root, { from });
    expect(envelopeOf(second as CliEnvelope<Record<string, unknown>>).change).toBe("SKIPPED_CANONICAL");
  });

  it("文件自报 execution_id 沿用入账；已封口执行允许事后补录（ended_at 在场不拒）", async () => {
    const execution = await beginExecution(store, {
      role: "research",
      runtime: "script",
      identityKind: "script",
      startedAt: "2026-08-30T00:00:00.000Z",
    });
    await endExecution(store, execution.execution_id, { endedAt: "2026-08-30T00:10:00.000Z" });
    const from = writeInput({ ...gatePayload(), execution_id: execution.execution_id });
    const outcome = await runRecordGateRun(root, { from });
    expect(outcome.ok).toBe(true);
    expect(runFile("GRN-0001").execution_id).toBe(execution.execution_id);
    expect(envelopeOf(outcome as CliEnvelope<Record<string, unknown>>).execution_id).toBe(
      execution.execution_id,
    );
  });

  it("显式覆盖优先于文件自报（--execution-id > 文件 execution_id）", async () => {
    const fileExecution = await beginExecution(store, {
      role: "research", runtime: "script", identityKind: "script", startedAt: "2026-08-30T00:00:00.000Z",
    });
    const overrideExecution = await beginExecution(store, {
      role: "orchestrator", runtime: "claude-code", identityKind: "interactive",
      startedAt: "2026-08-30T00:01:00.000Z",
    });
    const from = writeInput({ ...gatePayload(), execution_id: fileExecution.execution_id });
    const outcome = await runRecordGateRun(root, {
      from,
      executionId: overrideExecution.execution_id,
    });
    expect(outcome.ok).toBe(true);
    expect(runFile("GRN-0001").execution_id).toBe(overrideExecution.execution_id);
  });
});

describe("record claim --execution-id（CLM 侧贯穿）", () => {
  it("APPLIED：CLM 文件承载 execution_id + 信封回读；缺席 = 键缺席存量兼容", async () => {
    await seedObject();
    const execution = await beginExecution(store, {
      role: "implementer",
      runtime: "claude-code",
      identityKind: "subagent",
      startedAt: "2026-08-30T00:00:00.000Z",
    });
    const outcome = await runRecordClaim(root, {
      from: writeInput(claimPayload()),
      executionId: execution.execution_id,
    });
    expect(outcome.ok).toBe(true);
    expect(envelopeOf(outcome as CliEnvelope<Record<string, unknown>>).execution_id).toBe(
      execution.execution_id,
    );
    expect(claimFile("CLM-0001").execution_id).toBe(execution.execution_id);

    const legacy = await runRecordClaim(root, { from: writeInput(claimPayload()) });
    expect(legacy.ok).toBe(true);
    expect("execution_id" in claimFile("CLM-0002")).toBe(false);
  });

  it("未登记身份 fail-closed EXECUTION_NOT_FOUND；词形非法 SCHEMA_INVALID（双通路同纪律）", async () => {
    await seedObject();
    const missing = await runRecordClaim(root, {
      from: writeInput(claimPayload()),
      executionId: "AGX-2026-09999",
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");
    const malformed = await runRecordClaim(root, {
      from: writeInput(claimPayload()),
      executionId: "AGX-26-1",
    });
    expect(malformed.ok).toBe(false);
    expect(malformed.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

describe("compact 批量收编（身份键往返保全）", () => {
  it("已带 execution_id 的 GRN 文件 compact → already_canonical（canonical 重放携带身份键，不剥字段）", async () => {
    const execution = await beginExecution(store, {
      role: "orchestrator", runtime: "claude-code", identityKind: "interactive",
      startedAt: "2026-08-30T00:00:00.000Z",
    });
    const outcome = await runRecordGateRun(root, {
      from: writeInput(gatePayload()),
      executionId: execution.execution_id,
    });
    expect(outcome.ok).toBe(true);
    const bytesBefore = readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"), "utf8");
    const compact = await runCompact(root, { noIngest: false });
    expect(compact.ok).toBe(true);
    expect(readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"), "utf8")).toBe(bytesBefore);
    const compact2 = await runCompact(root, { noIngest: false });
    expect(compact2.ok).toBe(true);
    expect(readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"), "utf8")).toBe(bytesBefore);
  });

  it("runs 平面散置文件（带身份键）经 compact 收编入账且身份随 op 贯穿（canonical 化不剥键）", async () => {
    await seedObject();
    const execution = await beginExecution(store, {
      role: "research", runtime: "codex", identityKind: "interactive",
      startedAt: "2026-08-30T00:00:00.000Z",
    });
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(runsDir, { recursive: true });
    const raw = {
      record_type: "run",
      grn: "GRN-0007",
      ran_at_seq: 1,
      execution_id: execution.execution_id,
      trigger: { type: "on_demand" },
      gate_result: { mode: "inline", result: { ...gatePayload(), grn: "GRN-0007" } },
    };
    writeFileSync(join(runsDir, "GRN-0007.json"), `${JSON.stringify(raw, null, 2)}\n`);
    const compact = await runCompact(root, { noIngest: false });
    expect(compact.ok).toBe(true);
    expect(existsSync(join(runsDir, "GRN-0007.json"))).toBe(true);
    expect(runFile("GRN-0007").execution_id).toBe(execution.execution_id);
  });

  it("手写 canonical 形态 + 未登记 AGX 不再借 already_canonical 快路径绕过（P20 红队发现 2）：compact malformed / record --grn 重放拒；登记后同文件回绿", async () => {
    await seedObject();
    // 真实 canonical 基线：登记执行 + record APPLIED，取 GRN/CLM 双平面 canonical 字节。
    const execution = await beginExecution(store, {
      role: "orchestrator", runtime: "claude-code", identityKind: "interactive",
      startedAt: "2026-08-30T00:00:00.000Z",
    });
    const runOutcome = await runRecordGateRun(root, {
      from: writeInput(gatePayload()),
      executionId: execution.execution_id,
    });
    expect(runOutcome.ok).toBe(true);
    const claimOutcome = await runRecordClaim(root, {
      from: writeInput(claimPayload()),
      executionId: execution.execution_id,
    });
    expect(claimOutcome.ok).toBe(true);

    // 手写伪造：换号到未登记的 AGX-2099-9999（canonical 字节自洽——plan 重放恒等价）。
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    const claimsDir = join(root, ".pomaster", "evidence", "claims");
    const forgedRun = readFileSync(join(runsDir, "GRN-0001.json"), "utf8")
      .split("GRN-0001").join("GRN-7777")
      .split(execution.execution_id).join("AGX-2099-9999");
    writeFileSync(join(runsDir, "GRN-7777.json"), forgedRun);
    const forgedClaim = readFileSync(join(claimsDir, "CLM-0001.json"), "utf8")
      .split("CLM-0001").join("CLM-9000")
      .split(execution.execution_id).join("AGX-2099-9999");
    writeFileSync(join(claimsDir, "CLM-9000.json"), forgedClaim);

    // compact：快路径同判卷——未登记 AGX 出 malformed（EXECUTION_NOT_FOUND），不再
    // 静默记 already_canonical。
    const compact = await runCompact(root, { noIngest: false });
    expect(compact.ok).toBe(true);
    const data = envelopeOf(compact as CliEnvelope<Record<string, unknown>>);
    const ingested = data.ingested as {
      runs: { grn: string; action: string }[];
      claims: { clm: string; action: string }[];
      malformed: { path: string; detail: string }[];
    };
    expect(ingested.runs.map((entry) => entry.grn)).not.toContain("GRN-7777");
    expect(ingested.claims.map((entry) => entry.clm)).not.toContain("CLM-9000");
    const malformedPaths = ingested.malformed.map((entry) => entry.path);
    expect(malformedPaths).toContain("evidence/runs/GRN-7777.json");
    expect(malformedPaths).toContain("evidence/claims/CLM-9000.json");
    for (const entry of ingested.malformed) {
      if (entry.path.endsWith("GRN-7777.json") || entry.path.endsWith("CLM-9000.json")) {
        expect(entry.detail).toContain("EXECUTION_NOT_FOUND");
        expect(entry.detail).toContain("AGX-2099-9999");
      }
    }

    // record 通路对同一伪造文件同样拒（--grn 重放 = skippedCanonical 曾在的旁路位）。
    const forgedInput = writeInput(JSON.parse(forgedRun) as Record<string, unknown>);
    const replayOutcome = await runRecordGateRun(root, { from: forgedInput, grn: "GRN-7777" });
    expect(replayOutcome.ok).toBe(false);
    expect(replayOutcome.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");

    // 登记该 AGX 后同一文件回绿（判卷只看档案在场——合法通路不破）。
    await beginExecution(store, {
      executionId: "AGX-2099-9999",
      role: "research", runtime: "script", identityKind: "script",
      startedAt: "2026-08-30T00:00:00.000Z",
    });
    const compactAfter = await runCompact(root, { noIngest: false });
    expect(compactAfter.ok).toBe(true);
    const dataAfter = envelopeOf(compactAfter as CliEnvelope<Record<string, unknown>>);
    const ingestedAfter = dataAfter.ingested as {
      runs: { grn: string; action: string }[];
      claims: { clm: string; action: string }[];
      malformed: { path: string }[];
    };
    expect(ingestedAfter.runs.find((entry) => entry.grn === "GRN-7777")?.action).toBe("already_canonical");
    expect(ingestedAfter.claims.find((entry) => entry.clm === "CLM-9000")?.action).toBe("already_canonical");
    expect(ingestedAfter.malformed).toHaveLength(0);
  });
});
