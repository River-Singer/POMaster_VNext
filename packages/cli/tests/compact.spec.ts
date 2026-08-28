/**
 * compact.spec.ts —— 八拍⑦ COMPACT 编排砖（G4）：episode 折叠 + 证据批量收编。
 *
 * 判据：docs/eight-beat-carriers-design.md §4.3/§4.6/§4.7/§4.8 测试要点：
 * - 收编夹具（tool_snapshot 超集）：canonical 化 + 超集剥离 + ahead 披露；status generation_seq ≥ 1；
 * - 裂缝闭合（compact 侧）：GRN-0001.ran_at_seq=3 而 generation_seq=0 → compact 后推进；
 * - 二次 compact → NO_CHANGE 且 .pomaster 全树字节不变；输出 byte-stable（A4）；
 * - claims 三分支：UNVERIFIED 手写残缺 → recorded；canonical → already_canonical；
 *   VERIFIED 夹具 → skipped_adjudicated（文件字节不变）；
 * - 畸形证据（counts 缺 notApplicable / verdict 词表外 / 非 GRN 词形）→ EVIDENCE_MALFORMED
 *   warnings，不阻断同轮其余收编（exit 0）；
 * - compact --ops upsert → APPLIED；同 ops 二次 → NO_CHANGE；非法 op → kernel 原码且零残留
 *   （staged 回滚）；--no-ingest 显式关闭收编。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import { runCli, runCompact, runStatus, type CompactResult, type CliEnvelope } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-compact-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture
// ============================================================

async function seedStore(): Promise<void> {
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

async function seedCapability(): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS",
          kind: "capability",
          axisProfile: "capability_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "CSV 序列化",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {},
        } as never,
      },
    ],
  });
}

/**
 * tiny-tool GRN-0001 夹具逐字副本（examples/tiny-tool 提交态；tool_snapshot 超集 +
 * ran_at_seq=3 自报——裂缝形态：证据平面存在而账本 seq 停在 0）。
 */
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

/** VERIFIED claim 夹具（tiny-tool CLM-0001 形态；独立判定 → skipped_adjudicated）。 */
const CLM_0001_FIXTURE = {
  record_type: "claim",
  clm: "CLM-0001",
  subject: { object_id: "TEST.CSV.QUOTED_CELL" },
  is_fixture: true,
  assertion: "CSV_ROUNDTRIP_ROUNDTRIP_STABLE：含引号/分隔符/换行的单元格经 serializeRows→parseCsv 往返后逐字节还原",
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

function seedRunFixture(): void {
  const dir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "GRN-0001.json"), `${JSON.stringify(GRN_0001_FIXTURE, null, 2)}\n`);
}

function seedClaimFixture(): void {
  const dir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "CLM-0001.json"), `${JSON.stringify(CLM_0001_FIXTURE, null, 2)}\n`);
}

/** .pomaster 文件树快照（相对路径:内容 字节级）。 */
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

function readRun(grn: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "evidence", "runs", `${grn}.json`), "utf8"),
  ) as Record<string, unknown>;
}

// ============================================================
// 收编正例与裂缝闭合（compact 侧）
// ============================================================

describe("compact 证据批量收编", () => {
  it("夹具 GRN-0001（超集）→ canonicalized + ahead 披露；status generation_seq 0→1（裂缝闭合）", async () => {
    await seedStore();
    seedRunFixture();
    // 裂缝形态复现：证据平面存在 ran_at_seq=3 的 GateResult，账本零入账。
    const before = await runStatus(root);
    expect(before.result.generation_seq).toBe(0);

    const outcome = await runCompact(root, {});
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    const result = outcome.result as CompactResult;
    expect(result.change).toBe("APPLIED");
    expect(result.applied_seq).toBe(1);
    expect(result.ops_counts).toEqual({ record_gate_run: 1 });
    expect(result.ingested.runs).toEqual([
      { grn: "GRN-0001", action: "canonicalized", ran_at_seq: 3, ran_at_seq_ahead: true },
    ]);
    expect(result.ingested.malformed).toEqual([]);
    expect(result.changed_object_ids).toEqual([]);
    expect(result.ledger_seq_view).toEqual({
      generation_seq: 1,
      ahead_evidence: [{ grn: "GRN-0001", ran_at_seq: 3 }],
    });

    // 落盘为 kernel canonical 形态：超集剥离、平面分叉闭合。
    const run = readRun("GRN-0001");
    expect(run.tool_snapshot).toBeUndefined();
    expect(run.digest_excluded_fields).toBeUndefined();
    const inline = (run.gate_result as Record<string, unknown>).result as Record<string, unknown>;
    expect(inline.tool).toBeUndefined();
    expect(inline.metric_dialect).toBeUndefined();
    expect(inline.items).toBeUndefined();
    expect(inline.verdict).toBe("passed");
    expect(run.ran_at_seq).toBe(3); // 自报采样点沿用不改写（C5）

    const after = await runStatus(root);
    expect(after.result.generation_seq).toBe(1);
  });

  it("二次 compact → NO_CHANGE 且 .pomaster 全树字节不变；三次输出与二次 byte-stable", async () => {
    await seedStore();
    seedRunFixture();
    seedClaimFixture();
    await runCompact(root, {});
    const afterFirst = snapshot();

    const second = await runCompact(root, {});
    expect(second.ok).toBe(true);
    const secondResult = second.result as CompactResult;
    expect(secondResult.change).toBe("NO_CHANGE");
    expect(secondResult.applied_seq).toBe(1);
    expect(secondResult.ingested.runs[0]?.action).toBe("already_canonical");
    expect(secondResult.ingested.claims[0]?.action).toBe("skipped_adjudicated");
    expect(secondResult.ledger_seq_view.ahead_evidence).toEqual([
      { grn: "GRN-0001", ran_at_seq: 3 },
    ]); // 存量倒挂永远显式
    expect(snapshot()).toEqual(afterFirst); // 全树字节不变（NO_CHANGE 零写入）

    // 输出 byte-stable：同 state 重放 --json 信封逐字节相等。
    const lines2: string[] = [];
    await runCli(["--dir", root, "compact", "--json"], {
      stdout: (line) => lines2.push(line),
      stderr: () => undefined,
    });
    const lines3: string[] = [];
    await runCli(["--dir", root, "compact", "--json"], {
      stdout: (line) => lines3.push(line),
      stderr: () => undefined,
    });
    expect(lines3.join("\n")).toBe(lines2.join("\n"));
    const envelope = JSON.parse(lines2.join("\n")) as CliEnvelope<CompactResult>;
    expect(envelope.command).toBe("compact");
    expect(envelope.result.change).toBe("NO_CHANGE");
  });

  it("claims 三分支：UNVERIFIED 残缺 → recorded；VERIFIED 夹具 → skipped_adjudicated 文件字节不变", async () => {
    await seedStore();
    await seedCapability(); // claim 的 subject 必须在账本（C5：计数挂对象信封行）
    seedClaimFixture();
    const claimsDir = join(root, ".pomaster", "evidence", "claims");
    // 手写 UNVERIFIED（非 kernel 形态：缺 record_type / recomputed_by 派生块）。
    writeFileSync(
      join(claimsDir, "CLM-0002.json"),
      `${JSON.stringify({
        subject_id: "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS",
        assertion: "先立后证：序列化往返稳定",
        asserted_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
        evidence_refs: [],
        verification: { verdict: "UNVERIFIED" },
      }, null, 2)}\n`,
    );
    const fixtureBytes = readFileSync(join(claimsDir, "CLM-0001.json"), "utf8");

    const outcome = await runCompact(root, {});
    expect(outcome.ok).toBe(true);
    const result = outcome.result as CompactResult;
    expect(result.change).toBe("APPLIED");
    expect(result.ingested.claims).toEqual([
      { clm: "CLM-0001", action: "skipped_adjudicated" }, // 已带独立判定，无权覆写（D20）
      { clm: "CLM-0002", action: "recorded" }, // UNVERIFIED → 重以 canonical 入账
    ]);

    // VERIFIED 夹具字节不变（不打回 UNVERIFIED）。
    expect(readFileSync(join(claimsDir, "CLM-0001.json"), "utf8")).toBe(fixtureBytes);
    // CLM-0002 重写为 kernel canonical 形态。
    const recorded = JSON.parse(readFileSync(join(claimsDir, "CLM-0002.json"), "utf8")) as Record<string, unknown>;
    expect(recorded.record_type).toBe("claim");
    expect(recorded.verification).toMatchObject({ verdict: "UNVERIFIED" });
    expect(recorded.evidence_summary === undefined).toBe(true);

    // 二次 compact：CLM-0002 已 canonical → already_canonical（NO_CHANGE）。
    const second = await runCompact(root, {});
    const secondResult = second.result as CompactResult;
    expect(secondResult.change).toBe("NO_CHANGE");
    expect(secondResult.ingested.claims).toEqual([
      { clm: "CLM-0001", action: "skipped_adjudicated" },
      { clm: "CLM-0002", action: "already_canonical" },
    ]);
  });

  it("--no-ingest：证据平面零扫描零收编（NO_CHANGE；runs 文件不动）", async () => {
    await seedStore();
    seedRunFixture();
    const before = snapshot();
    const outcome = await runCompact(root, { noIngest: true });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as CompactResult;
    expect(result.change).toBe("NO_CHANGE");
    expect(result.ingested.runs).toEqual([]);
    expect(result.ledger_seq_view.generation_seq).toBe(0);
    expect(snapshot()).toEqual(before);
  });
});

// ============================================================
// 畸形证据（显式呈现不吞没，不阻断本轮合法 truth 更新）
// ============================================================

describe("compact 畸形证据 fail-closed 显式呈现", () => {
  it("verdict 词表外 / counts 缺 notApplicable / 非 GRN 词形 → EVIDENCE_MALFORMED warnings，其余照常入账 exit 0", async () => {
    await seedStore();
    const runsDir = join(root, ".pomaster", "evidence", "runs");
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "GRN-0001.json"), `${JSON.stringify(GRN_0001_FIXTURE, null, 2)}\n`);
    const badVerdict = {
      gate: "BUILD",
      gate_def: "POLICY.GATE.BUILD@0.1.0",
      verdict: "GREEN", // 词表外
      counts: { scanned: 1, applicable_scanned: 1, violations: 0, not_applicable: 0 },
      trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
      duration_ms: { self: 0, external: 0 },
    };
    writeFileSync(join(runsDir, "GRN-0002.json"), `${JSON.stringify(badVerdict, null, 2)}\n`);
    const missingNA = {
      gate: "BUILD",
      gate_def: "POLICY.GATE.BUILD@0.1.0",
      verdict: "passed",
      counts: { scanned: 1, applicable_scanned: 1, violations: 0 }, // 缺 not_applicable（C1 硬性）
      trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
      duration_ms: { self: 0, external: 0 },
    };
    writeFileSync(join(runsDir, "GRN-0003.json"), `${JSON.stringify(missingNA, null, 2)}\n`);
    writeFileSync(join(runsDir, "README.json"), "{}\n"); // 非 GRN 词形

    const badBytes = [
      readFileSync(join(runsDir, "GRN-0002.json"), "utf8"),
      readFileSync(join(runsDir, "GRN-0003.json"), "utf8"),
    ];
    const outcome = await runCompact(root, {});
    expect(outcome.ok).toBe(true); // 畸形证据不 fail 整个命令
    expect(outcome.errors).toEqual([]);
    const result = outcome.result as CompactResult;
    expect(result.change).toBe("APPLIED");
    expect(result.ingested.runs).toEqual([
      { grn: "GRN-0001", action: "canonicalized", ran_at_seq: 3, ran_at_seq_ahead: true },
    ]);
    expect(result.ingested.malformed.map((entry) => entry.path)).toEqual([
      "evidence/runs/GRN-0002.json",
      "evidence/runs/GRN-0003.json",
      "evidence/runs/README.json",
    ]);
    expect(result.ingested.malformed.every((entry) => entry.code === "EVIDENCE_MALFORMED")).toBe(true);
    // warnings 镜像（显式呈现不吞没）。
    expect(outcome.warnings.map((warning) => warning.code)).toEqual([
      "EVIDENCE_MALFORMED",
      "EVIDENCE_MALFORMED",
      "EVIDENCE_MALFORMED",
    ]);
    // 畸形文件原样保留（不能自动修，也不静默改写）。
    expect(readFileSync(join(runsDir, "GRN-0002.json"), "utf8")).toBe(badBytes[0]);
    expect(readFileSync(join(runsDir, "GRN-0003.json"), "utf8")).toBe(badBytes[1]);
  });
});

// ============================================================
// --ops 显式事务（episode 折叠：收编 op → 显式 op，单次事务）
// ============================================================

describe("compact --ops 显式事务", () => {
  const upsertTx = {
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
        },
      },
    ],
    note: "V1 面板入账",
  };

  it("upsert → APPLIED（ops_counts/changed_object_ids/note 留痕）；同 ops 二次 → NO_CHANGE", async () => {
    await seedStore();
    const txPath = join(root, "tx.json");
    writeFileSync(txPath, `${JSON.stringify(upsertTx, null, 2)}\n`);

    const first = await runCompact(root, { opsFile: txPath, note: "覆盖注记" });
    expect(first.ok).toBe(true);
    const firstResult = first.result as CompactResult;
    expect(firstResult.change).toBe("APPLIED");
    expect(firstResult.applied_seq).toBe(1);
    expect(firstResult.ops_counts).toEqual({ upsert_object: 1 });
    expect(firstResult.changed_object_ids).toEqual(["PAGE.DASHBOARD"]);
    const journal = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    expect(journal).toContain('"note":"覆盖注记"'); // --note 覆盖 tx-file 内同名字段（journal 行为紧凑 JSON）

    const indexBefore = readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8");
    const journalBefore = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
    const second = await runCompact(root, { opsFile: txPath, note: "覆盖注记" });
    expect(second.ok).toBe(true);
    const secondResult = second.result as CompactResult;
    expect(secondResult.change).toBe("NO_CHANGE"); // kernel 内容比较幂等（同内容重写零变化）
    expect(secondResult.applied_seq).toBe(1); // seq 不空转
    expect(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")).toBe(indexBefore);
    expect(readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")).toBe(journalBefore);
  });

  it("episode 折叠：收编 op 与显式 op 单次事务（一次 seq 推进）", async () => {
    await seedStore();
    seedRunFixture();
    const txPath = join(root, "tx.json");
    writeFileSync(txPath, `${JSON.stringify(upsertTx, null, 2)}\n`);
    const outcome = await runCompact(root, { opsFile: txPath });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as CompactResult;
    expect(result.change).toBe("APPLIED");
    expect(result.applied_seq).toBe(1); // 单次事务一次推进（不是 2）
    expect(result.ops_counts).toEqual({ record_gate_run: 1, upsert_object: 1 });
    expect(result.ingested.runs).toHaveLength(1);
    expect(result.changed_object_ids).toEqual(["PAGE.DASHBOARD"]);
  });

  it("非法 ops 文件 → SCHEMA_INVALID exit 1；applyTransaction throw（幽灵 owner）→ 原码透传且零残留", async () => {
    await seedStore();
    const badPath = join(root, "bad.json");
    writeFileSync(badPath, "{not json");
    const bad = await runCompact(root, { opsFile: badPath });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]?.code).toBe("SCHEMA_INVALID");

    const ghostPath = join(root, "ghost.json");
    writeFileSync(
      ghostPath,
      `${JSON.stringify({ ops: [{ ...upsertTx.ops[0], envelope: { ...upsertTx.ops[0].envelope, authority: { owner: "GHOST", delegates: [] } } }] }, null, 2)}\n`,
    );
    const before = snapshot();
    const ghost = await runCompact(root, { opsFile: ghostPath });
    expect(ghost.ok).toBe(false);
    expect(ghost.errors[0]?.code).toBe("GHOST_AUTHORITY_OWNER"); // kernel 原码透传
    expect(snapshot()).toEqual(before); // staged 回滚零残留
  });

  it("store 未初始化 → NOT_INITIALIZED", async () => {
    mkdirSync(root, { recursive: true });
    const outcome = await runCompact(root, {});
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });
});
