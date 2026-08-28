/**
 * record.spec.ts —— 证据入账通路显式单条路径（G6）：`record gate-run` / `record claim`。
 *
 * 判据：docs/eight-beat-carriers-design.md §4.4/§4.6/§4.7 测试要点：
 * - 入账通路正例：record 后 evidence/runs 出现 GRN 记录且 status generation_seq 推进
 *   （GRN-0001.ran_at_seq=3 而 generation_seq=0 裂缝的通路侧闭合）；
 * - ran_at_seq 自报沿用不改写（C5）；未携带才采样 store 当前 seq（恒 ran_at_seq < applied）；
 * - record 幂等：同文件二次 record → SKIPPED_CANONICAL exit 0 零写入；--grn 同号重放
 *   等价→跳过 / 有变→canonical 化（非盲覆写）；
 * - canonical 化有损：超集字段（tool_snapshot / 内嵌 tool / metric_dialect / items）剥离；
 * - trust.asserted/recomputed 孪生随行入账（C5）：归因落盘 / 失配自动降级 warning +
 *   verdict_cap_reason / declared_by 缺失 fail-closed；
 * - record claim：APPLIED（UNVERIFIED 恒置）/ SKIPPED_CANONICAL / SKIPPED_ADJUDICATED
 *   （VERIFIED 夹具零写入）/ OBJECT_NOT_FOUND / 畸形输入 EVIDENCE_MALFORMED；
 * - fail-closed 码位：verdict 词表外 VOCAB_INVALID_VALUE / counts 缺 notApplicable
 *   GATE_COUNTS_INVALID / --grn 词形 GRN_INVALID / --trigger 词表外 VOCAB_INVALID_VALUE /
 *   未初始化 NOT_INITIALIZED。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import {
  runRecordClaim,
  runRecordGateRun,
  runStatus,
  type CliEnvelope,
} from "@pomaster/cli";
import { runCli } from "@pomaster/cli";

let root: string;
let fileSeq = 0;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-record-"));
  fileSeq = 0;
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

async function seedCapability(id = "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS"): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id,
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

/** harness 提交的新鲜 gate 输出（无 grn / 无 ran_at_seq——由通路注入/采样）。 */
function gatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gate: "BUILD",
    gate_def: "POLICY.GATE.BUILD@0.1.0",
    verdict: "passed",
    subject_id: null,
    denominator_refs: [],
    counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
    trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
    duration_ms: { self: 1, external: 0 },
    ...overrides,
  };
}

/** tiny-tool 式 07 信封夹具（tool_snapshot 超集 + 自报 ran_at_seq）。 */
function runEnvelopePayload(result: Record<string, unknown>, trigger = "post_edit"): Record<string, unknown> {
  return {
    gate_result: { mode: "inline", result },
    trigger: { type: trigger },
    tool_snapshot: { tool: "tiny-csv-tool:roundtrip_probe", tool_version: "0.1.0", metric_dialect: "csv:quoted_cell_roundtrip" },
  };
}

function writeInput(value: unknown): string {
  fileSeq += 1;
  const path = join(root, `input-${fileSeq}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function readRun(grn: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "evidence", "runs", `${grn}.json`), "utf8"),
  ) as Record<string, unknown>;
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

function journalOps(): string[] {
  const text = readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => (JSON.parse(line) as { ops?: string[] }).ops?.join(",") ?? "");
}

// ============================================================
// record gate-run：入账通路正例
// ============================================================

describe("record gate-run 入账通路正例", () => {
  it("APPLIED：evidence/runs 出现 canonical GRN 记录且 status generation_seq 推进", async () => {
    await seedStore();
    const outcome = await runRecordGateRun(root, { from: writeInput(gatePayload()) });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.change).toBe("APPLIED");
    expect(outcome.result.grn).toBe("GRN-0001"); // 缺省分配 = 最大序号 +1（4 位零填充）
    expect(outcome.result.applied_seq).toBe(1);
    expect(outcome.result.ran_at_seq).toBe(0); // 未携带 → 采样 store 当前 seq
    expect(outcome.result.ran_at_seq_ahead).toBe(false); // 恒 ran_at_seq < appliedSeq
    expect(outcome.result.verdict).toBe("passed");
    expect(outcome.result.gate).toBe("BUILD");

    const run = readRun("GRN-0001");
    expect(run.record_type).toBe("run");
    expect(run.grn).toBe("GRN-0001");
    expect(run.ran_at_seq).toBe(0);
    expect(run.trigger).toEqual({ type: "on_demand" });
    const inline = (run.gate_result as Record<string, unknown>).result as Record<string, unknown>;
    expect(inline.verdict).toBe("passed");
    expect(inline.counts).toEqual({
      scanned: 2,
      applicable_scanned: 2,
      violations: 0,
      not_applicable: 0,
    });
    // trust 孪生随行入账（asserted=null 诚实缺席）
    expect(inline.trust).toEqual({ asserted: null, recomputed: { violations: 0, matches_asserted: true } });

    const status = await runStatus(root);
    expect(status.ok).toBe(true);
    expect(status.result.generation_seq).toBe(1);

    expect(journalOps()).toContain("record_gate_run"); // TX_APPLIED 留痕
  });

  it("ran_at_seq 自报沿用不改写：文件携带 3 → 入账保留 3 且 ran_at_seq_ahead=true（存量倒挂显式披露）", async () => {
    await seedStore();
    const payload = gatePayload({ ran_at_seq: 3 });
    const outcome = await runRecordGateRun(root, { from: writeInput(payload) });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.ran_at_seq).toBe(3); // 把 3 改成 1 = 伪造采样点（C5）；沿用
    expect(outcome.result.applied_seq).toBe(1);
    expect(outcome.result.ran_at_seq_ahead).toBe(true);
    expect(readRun("GRN-0001").ran_at_seq).toBe(3);
  });

  it("trigger 沿用文件信封：post_edit 夹具 → canonical 信封保留 post_edit（运行事实不改写）", async () => {
    await seedStore();
    const payload = runEnvelopePayload(
      gatePayload({ grn: "GRN-0001", ran_at_seq: 0, tool: "tiny-csv-tool:roundtrip_probe", tool_version: "0.1.0" }),
    );
    const outcome = await runRecordGateRun(root, { from: writeInput(payload) });
    expect(outcome.ok).toBe(true);
    expect(readRun("GRN-0001").trigger).toEqual({ type: "post_edit" });
  });

  it("canonical 化有损：tool_snapshot / 内嵌 tool / metric_dialect / items 被剥离（kernel v0 契约诚实缺席）", async () => {
    await seedStore();
    const payload = runEnvelopePayload(
      gatePayload({
        grn: "GRN-0001",
        ran_at_seq: 0,
        tool: "tiny-csv-tool:roundtrip_probe",
        tool_version: "0.1.0",
        metric_dialect: "csv:quoted_cell_roundtrip",
        items: [],
      }),
      "on_demand",
    );
    const outcome = await runRecordGateRun(root, { from: writeInput(payload) });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("APPLIED"); // 首收入账必须标 canonicalized（compact 呈现），record 以 APPLIED 表达落账
    const run = readRun("GRN-0001");
    expect(run.tool_snapshot).toBeUndefined();
    const inline = (run.gate_result as Record<string, unknown>).result as Record<string, unknown>;
    expect(inline.tool).toBeUndefined();
    expect(inline.tool_version).toBeUndefined();
    expect(inline.metric_dialect).toBeUndefined();
    expect(inline.items).toBeUndefined();
  });
});

// ============================================================
// record gate-run：幂等（CLI 层 pending 字节预比较补齐 kernel 无 per-op 幂等的缺口）
// ============================================================

describe("record gate-run 幂等", () => {
  it("同文件二次 record → SKIPPED_CANONICAL exit 0 零写入", async () => {
    await seedStore();
    const path = writeInput(gatePayload());
    const first = await runRecordGateRun(root, { from: path });
    expect(first.result.change).toBe("APPLIED");
    const before = snapshot();
    const second = await runRecordGateRun(root, { from: path });
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("SKIPPED_CANONICAL");
    expect(second.result.applied_seq).toBe(1); // seq 不空转
    expect(snapshot()).toEqual(before); // 零写入
  });

  it("--grn 同号重放：等价内容 → SKIPPED_CANONICAL；内容有变 → APPLIED canonical 化（判定可复核非盲覆写）", async () => {
    await seedStore();
    await runRecordGateRun(root, { from: writeInput(gatePayload()) });
    const replay = await runRecordGateRun(root, {
      from: writeInput(gatePayload()),
      grn: "GRN-0001",
    });
    expect(replay.ok).toBe(true);
    expect(replay.result.change).toBe("SKIPPED_CANONICAL");

    const changed = await runRecordGateRun(root, {
      from: writeInput(gatePayload({ verdict: "failed", counts: { scanned: 2, applicable_scanned: 2, violations: 1, not_applicable: 0 } })),
      grn: "GRN-0001",
    });
    expect(changed.ok).toBe(true);
    expect(changed.result.change).toBe("APPLIED");
    expect(changed.result.applied_seq).toBe(2);
    const inline = (readRun("GRN-0001").gate_result as Record<string, unknown>).result as Record<string, unknown>;
    expect(inline.verdict).toBe("failed");
  });
});

// ============================================================
// record gate-run：trust 孪生随行入账（C5）
// ============================================================

describe("record gate-run trust 孪生", () => {
  it("asserted 带 declared_by → 归因落盘；asserted 与 recomputed 失配 → passed 自动降级 warning + verdict_cap_reason", async () => {
    await seedStore();
    const mismatch = await runRecordGateRun(root, {
      from: writeInput(
        gatePayload({
          trust: {
            asserted: { violations: 0, declared_by: { actor_type: "tool", actor: "tiny-tool", self_attested: true } },
            recomputed: { violations: 1, matches_asserted: false },
          },
        }),
      ),
    });
    expect(mismatch.ok).toBe(true);
    expect(mismatch.result.verdict).toBe("warning"); // C1：passed 不得踩在失配的自报结论上
    const inline = (readRun("GRN-0001").gate_result as Record<string, unknown>).result as Record<string, unknown>;
    expect(inline.verdict_cap_reason).toBe("declare_recompute_mismatch");
    expect(inline.trust).toMatchObject({
      asserted: { violations: 0, declared_by: { actor_type: "tool", actor: "tiny-tool", self_attested: true } },
      recomputed: { violations: 1, matches_asserted: false },
      mismatch: { detected: true, action: "recomputed_wins_recorded" },
    });
  });

  it("asserted 在场但缺 declared_by → EVIDENCE_MALFORMED（自报必须可归因，fail-closed）", async () => {
    await seedStore();
    const outcome = await runRecordGateRun(root, {
      from: writeInput(gatePayload({ trust: { asserted: { violations: 0 }, recomputed: { violations: 0, matches_asserted: true } } })),
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("EVIDENCE_MALFORMED");
    expect(outcome.errors[0]?.message).toContain("declared_by");
  });
});

// ============================================================
// record gate-run：fail-closed 码位矩阵
// ============================================================

describe("record gate-run fail-closed", () => {
  it("verdict 词表外 → VOCAB_INVALID_VALUE；counts 缺 notApplicable → GATE_COUNTS_INVALID（kernel 原码透传）", async () => {
    await seedStore();
    const badVerdict = await runRecordGateRun(root, {
      from: writeInput(gatePayload({ verdict: "GREEN" })),
    });
    expect(badVerdict.ok).toBe(false);
    expect(badVerdict.errors[0]?.code).toBe("VOCAB_INVALID_VALUE");

    const missingNA = await runRecordGateRun(root, {
      from: writeInput(gatePayload({ counts: { scanned: 2, applicable_scanned: 2, violations: 0 } })),
    });
    expect(missingNA.ok).toBe(false);
    expect(missingNA.errors[0]?.code).toBe("GATE_COUNTS_INVALID");
  });

  it("--trigger 词表外 → VOCAB_INVALID_VALUE；--grn 词形非法 → GRN_INVALID", async () => {
    await seedStore();
    const badTrigger = await runRecordGateRun(root, {
      from: writeInput(gatePayload()),
      trigger: "whenever",
    });
    expect(badTrigger.ok).toBe(false);
    expect(badTrigger.errors[0]?.code).toBe("VOCAB_INVALID_VALUE");

    const badGrn = await runRecordGateRun(root, {
      from: writeInput(gatePayload()),
      grn: "RUN-1",
    });
    expect(badGrn.ok).toBe(false);
    expect(badGrn.errors[0]?.code).toBe("GRN_INVALID");
  });

  it("文件缺失 / 坏 JSON / 非 JSON 对象 → EVIDENCE_MALFORMED（单条路径畸形即是失败）", async () => {
    await seedStore();
    const missing = await runRecordGateRun(root, { from: join(root, "no-such.json") });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("EVIDENCE_MALFORMED");

    fileSeq += 1;
    const badPath = join(root, `input-${fileSeq}.json`);
    writeFileSync(badPath, "{not json");
    const bad = await runRecordGateRun(root, { from: badPath });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]?.code).toBe("EVIDENCE_MALFORMED");
  });

  it("store 未初始化 → NOT_INITIALIZED（缺席显式，不静默建账）", async () => {
    mkdirSync(root, { recursive: true });
    const path = writeInput(gatePayload());
    const outcome = await runRecordGateRun(root, { from: path });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("NOT_INITIALIZED");
  });
});

// ============================================================
// record claim
// ============================================================

describe("record claim", () => {
  function claimPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      subject_id: "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS",
      assertion: "CSV_ROUNDTRIP_ROUNDTRIP_STABLE：含引号单元格往返逐字节还原",
      asserted_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
      evidence_refs: ["GRN-0001"],
      ...overrides,
    };
  }

  it("APPLIED：canonical UNVERIFIED 落账、evidence_refs 分型、status 推进；二次 record → SKIPPED_CANONICAL", async () => {
    await seedStore();
    await seedCapability();
    const path = writeInput(claimPayload());
    const first = await runRecordClaim(root, { from: path });
    expect(first.ok).toBe(true);
    expect(first.result.change).toBe("APPLIED");
    expect(first.result.clm).toBe("CLM-0001");
    expect(first.result.applied_seq).toBe(2); // upsert(seq1) → record_claim(seq2)
    expect(first.result.verification).toBe("UNVERIFIED"); // D20：声称方不可自填 VERIFIED

    const claim = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-0001.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(claim.record_type).toBe("claim");
    expect(claim.is_fixture).toBe(false);
    expect(claim.evidence_refs).toEqual([{ ref_type: "gate_result", grn: "GRN-0001" }]);
    expect(claim.verification).toEqual({
      verdict: "UNVERIFIED",
      recomputed_by: { actor_type: "kernel", actor: "pomaster-kernel", self_attested: false },
    });

    const before = snapshot();
    const second = await runRecordClaim(root, { from: path });
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("SKIPPED_CANONICAL");
    expect(snapshot()).toEqual(before);
  });

  it("已带 VERIFIED 独立判定的夹具 → SKIPPED_ADJUDICATED 零写入 exit 0（无权打回 UNVERIFIED）", async () => {
    await seedStore();
    const path = writeInput({
      subject: { object_id: "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS" },
      assertion: "已由独立验证流判定",
      asserted_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
      evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
      verification: {
        verdict: "VERIFIED",
        method: "recompute",
        recomputed_by: { actor_type: "tool", actor: "probe@0.1.0", self_attested: false },
      },
      rev: 1,
    });
    const before = snapshot();
    const outcome = await runRecordClaim(root, { from: path });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("SKIPPED_ADJUDICATED");
    expect(outcome.result.verification).toBe("VERIFIED");
    expect(snapshot()).toEqual(before);
  });

  it("subject 对象不存在 → OBJECT_NOT_FOUND exit 1（kernel 原码透传）", async () => {
    await seedStore();
    const outcome = await runRecordClaim(root, { from: writeInput(claimPayload()) });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("OBJECT_NOT_FOUND");
  });

  it("缺 asserted_by / assertion 空 / verification 词表外 → EVIDENCE_MALFORMED；--clm 词形 → SCHEMA_INVALID", async () => {
    await seedStore();
    await seedCapability();
    const noActor = await runRecordClaim(root, {
      from: writeInput(claimPayload({ asserted_by: undefined })),
    });
    expect(noActor.ok).toBe(false);
    expect(noActor.errors[0]?.code).toBe("EVIDENCE_MALFORMED");

    const emptyAssertion = await runRecordClaim(root, {
      from: writeInput(claimPayload({ assertion: "" })),
    });
    expect(emptyAssertion.ok).toBe(false);
    expect(emptyAssertion.errors[0]?.code).toBe("EVIDENCE_MALFORMED");

    const badVerdict = await runRecordClaim(root, {
      from: writeInput(claimPayload({ verification: { verdict: "SURE" } })),
    });
    expect(badVerdict.ok).toBe(false);
    expect(badVerdict.errors[0]?.code).toBe("EVIDENCE_MALFORMED");

    const badClm = await runRecordClaim(root, {
      from: writeInput(claimPayload()),
      clm: "CLAIM-9",
    });
    expect(badClm.ok).toBe(false);
    expect(badClm.errors[0]?.code).toBe("SCHEMA_INVALID");
  });
});

// ============================================================
// 命令面（commander 注册与退出码）
// ============================================================

describe("record 命令面", () => {
  it("runCli: record gate-run --json 正例 exit 0 且信封 command 为多词全名", async () => {
    await seedStore();
    const path = writeInput(gatePayload());
    const lines: string[] = [];
    const code = await runCli(["--dir", root, "record", "gate-run", "--from", path, "--json"], {
      stdout: (line) => lines.push(line),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.command).toBe("record gate-run");
    expect(envelope.ok).toBe(true);
    expect((envelope.result as Record<string, unknown>).change).toBe("APPLIED");
  });

  it("runCli: 畸形输入 → exit 1", async () => {
    await seedStore();
    const code = await runCli(["--dir", root, "record", "gate-run", "--from", join(root, "missing.json"), "--json"], {
      stdout: () => undefined,
      stderr: () => undefined,
    });
    expect(code).toBe(1);
  });
});
