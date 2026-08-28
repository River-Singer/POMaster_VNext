/**
 * evidence-ingest-crack-closure.spec.ts —— 裂缝闭合 E2E（G4+G6；tests/integration）。
 *
 * 背景（benchmarks/phaseC-demo-report.md §5 实测确立的裂缝）：证据平面存在
 * GRN-0001（ran_at_seq=3）而账本零入账——status generation_seq=0，且「ran_at_seq 与
 * generation_seq 的关系如何对账」通路未定义。本 spec 以真实 CLI 全流程钉死闭合定义
 * （docs/eight-beat-carriers-design.md §4.2/§4.8）：
 *
 * before：init → 预置 GRN-0001/CLM-0001 夹具 → status generation_seq=0（证据在、账本空）；
 * after ：compact → generation_seq=1（accounted）、runs 文件覆写为 kernel canonical 形态
 *         （平面分叉闭合）、ahead_evidence={GRN-0001@3} 显式披露存量倒挂（不静默改写）；
 * 幂等  ：二次 compact → NO_CHANGE 且 .pomaster 全树字节不变；连续 status 读 byte-stable
 *         （读侧 NO_CHANGE 语义不因写侧演进破坏）；record 通路新 run 采样 store seq
 *         （恒 ran_at_seq < appliedSeq，倒挂不再新增）。
 *
 * 夹具为 examples/tiny-tool 提交态证据平面的逐字副本（tool_snapshot 超集形态）。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, runRecordGateRun, type CliEnvelope } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pvnext-crack-closure-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// tiny-tool 提交态证据平面夹具（逐字副本）
// ============================================================

const GRN_0001_FIXTURE = {
  record_type: "run",
  grn: "GRN-0001",
  ran_at_seq: 3,
  trigger: { type: "post_edit" },
  tool_snapshot: {
    tool: "tiny-csv-tool:roundtrip_probe",
    tool_version: "0.1.0",
    metric_dialect: "csv:quoted_cell_roundtrip",
  },
  gate_result: {
    mode: "inline",
    result: {
      grn: "GRN-0001",
      gate: "CSV_ROUNDTRIP",
      gate_def: "POLICY.GATE.CSV_ROUNDTRIP@0.1.0",
      tool: "tiny-csv-tool:roundtrip_probe",
      tool_version: "0.1.0",
      metric_dialect: "csv:quoted_cell_roundtrip",
      ran_at_seq: 3,
      verdict: "passed",
      subject_id: "TEST.CSV.QUOTED_CELL",
      is_fixture: true,
      denominator_refs: [],
      counts: { scanned: 3, applicable_scanned: 3, violations: 0, not_applicable: 0 },
      blindspot: { scanned: 3, produced: 3, escape_ratio: 0 },
      items: [],
      trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
      duration_ms: { self: 2, external: 0 },
    },
  },
  digest_excluded_fields: ["gate_result.result.duration_ms"],
};

const CLM_0001_FIXTURE = {
  record_type: "claim",
  clm: "CLM-0001",
  subject: { object_id: "TEST.CSV.QUOTED_CELL" },
  is_fixture: true,
  assertion:
    "CSV_ROUNDTRIP_ROUNDTRIP_STABLE：含引号/分隔符/换行的单元格经 serializeRows→parseCsv 往返后逐字节还原",
  asserted_by: { actor_type: "agent", actor: "tiny-csv-tool/demo", self_attested: true },
  evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
  verification: {
    verdict: "VERIFIED",
    method: "recompute",
    recomputed_by: { actor_type: "tool", actor: "tiny-csv-tool:roundtrip_probe@0.1.0", self_attested: false },
    recomputed_value: { roundtripStable: true },
    delta_vs_asserted: null,
    at_seq: 3,
  },
  rev: 1,
  notes_md: null,
};

function seedEvidencePlane(): void {
  const runsDir = join(root, ".pomaster", "evidence", "runs");
  const claimsDir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(runsDir, { recursive: true });
  mkdirSync(claimsDir, { recursive: true });
  writeFileSync(join(runsDir, "GRN-0001.json"), `${JSON.stringify(GRN_0001_FIXTURE, null, 2)}\n`);
  writeFileSync(join(claimsDir, "CLM-0001.json"), `${JSON.stringify(CLM_0001_FIXTURE, null, 2)}\n`);
}

// ============================================================
// 命令面 helper（真实 CLI stdout → 机读信封）
// ============================================================

async function runJson(args: readonly string[]): Promise<{ code: number; envelope: CliEnvelope<Record<string, unknown>> }> {
  const lines: string[] = [];
  const code = await runCli(["--dir", root, ...args, "--json"], {
    stdout: (line) => lines.push(line),
    stderr: () => undefined,
  });
  return { code, envelope: JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>> };
}

function statusSeq(): Promise<number> {
  return runJson(["status"]).then(({ envelope }) => envelope.result.generation_seq as number);
}

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

// ============================================================
// 裂缝闭合 E2E
// ============================================================

describe("GRN-0001.ran_at_seq=3 而 status generation_seq=0 —— 裂缝闭合", () => {
  it("before：证据在、账本空（裂缝形态复现；status 连续读 byte-stable）", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    seedEvidencePlane();

    const first = await runJson(["status"]);
    expect(first.code).toBe(0);
    expect((first.envelope.result.generation_seq as number)).toBe(0); // 账本零入账

    const second = await runJson(["status"]);
    expect(JSON.stringify(second.envelope)).toBe(JSON.stringify(first.envelope)); // 读侧幂等

    // 证据平面确实带着自报 ran_at_seq=3 的 GateResult（裂缝的两造同时在场）。
    const fixture = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"), "utf8"),
    ) as { ran_at_seq: number };
    expect(fixture.ran_at_seq).toBe(3);
    expect((await statusSeq())).toBe(0); // ran_at_seq=3 而 generation_seq=0
  });

  it("after：compact → generation_seq 推进、runs 文件 canonical 化、ahead_evidence 显式披露", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    seedEvidencePlane();
    expect(await statusSeq()).toBe(0);

    const compact = await runJson(["compact"]);
    expect(compact.code).toBe(0);
    expect(compact.envelope.ok).toBe(true);
    expect(compact.envelope.result.change).toBe("APPLIED");
    expect(compact.envelope.result.applied_seq).toBe(1);
    expect(compact.envelope.result.ingested).toMatchObject({
      runs: [{ grn: "GRN-0001", action: "canonicalized", ran_at_seq: 3, ran_at_seq_ahead: true }],
      claims: [{ clm: "CLM-0001", action: "skipped_adjudicated" }], // VERIFIED 独立判定无权覆写（D20）
    });
    expect(compact.envelope.result.ledger_seq_view).toEqual({
      generation_seq: 1,
      ahead_evidence: [{ grn: "GRN-0001", ran_at_seq: 3 }], // 存量倒挂永远显式，不静默改写
    });

    // 裂缝闭合主断言：账本推进（generation_seq 0 → 1）。
    expect(await statusSeq()).toBe(1);
    const statusAfter = await runJson(["status"]);
    const statusAgain = await runJson(["status"]);
    expect(JSON.stringify(statusAgain.envelope)).toBe(JSON.stringify(statusAfter.envelope)); // 读侧幂等不破坏

    // 平面分叉闭合：runs 文件覆写为 kernel canonical 形态（超集剥离）。
    const run = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "runs", "GRN-0001.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(run.record_type).toBe("run");
    expect(run.ran_at_seq).toBe(3); // 自报采样点沿用不改写（C5）
    expect(run.tool_snapshot).toBeUndefined();
    const inline = ((run.gate_result as Record<string, unknown>).result ?? {}) as Record<string, unknown>;
    expect(inline.verdict).toBe("passed");
    expect(inline.metric_dialect).toBeUndefined();
    expect(inline.items).toBeUndefined();
  });

  it("幂等：二次 compact → NO_CHANGE 全树字节不变；三次输出与二次 byte-stable", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    seedEvidencePlane();
    await runJson(["compact"]);
    const afterFirst = snapshot();

    const second = await runJson(["compact"]);
    expect(second.code).toBe(0);
    expect(second.envelope.result.change).toBe("NO_CHANGE");
    expect(snapshot()).toEqual(afterFirst);

    const third = await runJson(["compact"]);
    const fourth = await runJson(["compact"]);
    expect(JSON.stringify(fourth.envelope)).toBe(JSON.stringify(third.envelope));
    expect(snapshot()).toEqual(afterFirst);
  });

  it("record 通路新 run：采样 store seq（恒 ran_at_seq < appliedSeq，倒挂不再新增）且 status 推进", async () => {
    expect((await runJson(["init"])).code).toBe(0);
    seedEvidencePlane();
    await runJson(["compact"]); // seq → 1

    const before = snapshot();
    const freshGate = {
      gate: "BUILD",
      gate_def: "POLICY.GATE.BUILD@0.1.0",
      verdict: "passed",
      subject_id: null,
      denominator_refs: [],
      counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
      trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
      duration_ms: { self: 1, external: 0 },
    };
    const fromPath = join(root, "fresh-gate.json");
    writeFileSync(fromPath, `${JSON.stringify(freshGate, null, 2)}\n`);
    const recorded = await runRecordGateRun(root, { from: fromPath });
    expect(recorded.ok).toBe(true);
    expect(recorded.result.change).toBe("APPLIED");
    expect(recorded.result.grn).toBe("GRN-0002"); // 缺省分配 = 最大序号 +1
    expect(recorded.result.ran_at_seq).toBe(1); // 采样自 store 当前 seq
    expect(recorded.result.applied_seq).toBe(2);
    expect(recorded.result.ran_at_seq_ahead).toBe(false); // ran_at_seq < appliedSeq 恒成立

    expect(await statusSeq()).toBe(2);
    expect(snapshot()).not.toEqual(before);
  });
});
