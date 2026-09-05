/**
 * record-verification.spec.ts —— `record verification`（W2 生产入口）：独立验证流的判定回写。
 *
 * 判据（审计 W2 修复批验收；D20 判定通路 + A3 禁覆写已判定）：
 * - 公开正向链零造数：claim 一律经 runRecordClaim（公开命令）入账（UNVERIFIED），判定只经
 *   本命令回写——本文件零 claimFixture / 零手写 VERIFIED fixture；
 * - APPLIED：verification 块替换为 VERIFIED（recomputed_by / method / at_seq）+ 追加证据
 *   引用分型 + rev 推进 + subject evidence_summary 即时 verified=1；
 * - A3 守恒（NO_CHANGE 钉死）：对已判定 claim 重复验证 → NO_CHANGE exit 0 零写入回显既有
 *   判定（不静默改判）；record claim --clm 复入已判定件 → EVIDENCE_ALREADY_EXISTS（既有
 *   守卫不回归；SKIPPED_ADJUDICATED 由 record.spec.ts 既有用例钉死）；
 * - fail-closed 码位：CLAIM_NOT_FOUND / EVIDENCE_MALFORMED / SCHEMA_INVALID（--clm、
 *   --verifier 词形、引用重复）/ VERIFICATION_EVIDENCE_EMPTY（07：空证据引用不得 VERIFIED）/
 *   VOCAB_INVALID_VALUE（method 词表外）/ EXECUTION_NOT_FOUND / NOT_INITIALIZED；
 * - D20 同主体自批 → CLAIM_SELF_APPROVAL warning 不阻断（不验真主体，B3 边界；检出权威
 *   = doctor 探针）；
 * - 命令面：runCli `record verification --json` 信封 command 全名 + exit 码。
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import {
  runRecordClaim,
  runRecordGateRun,
  runRecordVerification,
  runStatus,
  type CliEnvelope,
} from "@pomaster/cli";
import { runCli } from "@pomaster/cli";

let root: string;
let fileSeq = 0;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-record-verification-"));
  fileSeq = 0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture（仅 setup：authority 骨架 / 对象 upsert / 公开命令入账证据）
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

function gatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gate: "ROUNDTRIP",
    gate_def: "POLICY.GATE.ROUNDTRIP@0.1.0",
    verdict: "passed",
    metric_dialect: "csv:quoted_cell_roundtrip",
    subject_id: null,
    denominator_refs: [],
    counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
    trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
    duration_ms: { self: 1, external: 0 },
    ...overrides,
  };
}

function writeInput(value: unknown): string {
  fileSeq += 1;
  const path = join(root, `input-${fileSeq}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

/** 公开命令入账一条 claim（record claim；UNVERIFIED 初始态）——本文件 claim 的唯一来源。 */
async function seedClaimViaRecord(options: {
  readonly evidenceRefs?: readonly string[];
  readonly assertedBy?: Record<string, unknown>;
} = {}): Promise<string> {
  const outcome = await runRecordClaim(root, {
    from: writeInput({
      subject_id: "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS",
      assertion: "CSV_ROUNDTRIP_ROUNDTRIP_STABLE：含引号单元格往返逐字节还原",
      asserted_by: options.assertedBy ?? { actor_type: "agent", actor: "claude/session-93", self_attested: true },
      evidence_refs: options.evidenceRefs ?? [],
    }),
  });
  expect(outcome.ok).toBe(true);
  expect(outcome.result.clm).toBe("CLM-0001");
  return outcome.result.clm as string;
}

async function seedGateRun(grn = "GRN-0001"): Promise<string> {
  const outcome = await runRecordGateRun(root, { from: writeInput(gatePayload()) });
  expect(outcome.ok).toBe(true);
  return grn;
}

function readClaim(clm: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, ".pomaster", "evidence", "claims", `${clm}.json`), "utf8"),
  ) as Record<string, unknown>;
}

/** .pomaster 文件树快照（相对路径:内容 字节级；零写入断言用）。 */
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
// APPLIED 正向回写
// ============================================================

describe("record verification APPLIED", () => {
  it("UNVERIFIED → VERIFIED：判定块替换 + 追加引用分型 + rev 推进 + evidence_summary 即时 verified=1", async () => {
    await seedStore();
    await seedCapability();
    await seedGateRun();
    const clm = await seedClaimViaRecord();
    const before = readClaim(clm);
    expect((before.verification as Record<string, unknown>).verdict).toBe("UNVERIFIED");

    const outcome = await runRecordVerification(root, {
      clm,
      verifier: "tool:verifier@0.1.0",
      method: "recompute",
      evidence: ["GRN-0001"],
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.result.change).toBe("APPLIED");
    expect(outcome.result.verification).toBe("VERIFIED");
    expect(outcome.result.evidence_refs_added).toEqual(["GRN-0001"]);
    expect(outcome.result.applied_seq).toBeGreaterThan(0);

    const after = readClaim(clm);
    // 判定块：07 schema 键序（verdict / method / recomputed_by / at_seq）
    expect(after.verification).toEqual({
      verdict: "VERIFIED",
      method: "recompute",
      recomputed_by: { actor_type: "tool", actor: "verifier@0.1.0", self_attested: true },
      at_seq: outcome.result.applied_seq,
    });
    // 其余字段逐字节保留（record claim 的断言/主体/判定历史不重建）
    expect(after.assertion).toBe(before.assertion);
    expect(after.asserted_by).toEqual(before.asserted_by);
    expect(after.subject).toEqual(before.subject);
    expect(after.evidence_refs).toEqual([{ ref_type: "gate_result", grn: "GRN-0001" }]);
    expect(after.rev).toBe(outcome.result.applied_seq);

    // subject evidence_summary 即时重算（status/inspect 消费面）
    const status = await runStatus(root);
    expect(status.ok).toBe(true);
    const raw = JSON.parse(
      readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8"),
    ) as { objects: Array<{ evidence_summary: Record<string, number> }> };
    expect(raw.objects[0]?.evidence_summary).toEqual({
      claims: 1,
      verified: 1,
      unverified: 0,
      rejected: 0,
    });
  });

  it("既有 evidence_refs 保留 + 追加合并；缺省 --method = 键缺席（07 canonical 兼容）", async () => {
    await seedStore();
    await seedCapability();
    await seedGateRun();
    await runRecordGateRun(root, {
      from: writeInput(gatePayload({ gate: "LINT", gate_def: "POLICY.GATE.LINT@0.1.0" })),
    }); // GRN-0002
    const clm = await seedClaimViaRecord({ evidenceRefs: ["GRN-0001"] });
    const outcome = await runRecordVerification(root, {
      clm,
      verifier: "human:reviewer-7",
      evidence: ["GRN-0002"],
    });
    expect(outcome.ok).toBe(true);
    const after = readClaim(clm);
    expect(after.evidence_refs).toEqual([
      { ref_type: "gate_result", grn: "GRN-0001" },
      { ref_type: "gate_result", grn: "GRN-0002" },
    ]);
    const verification = after.verification as Record<string, unknown>;
    expect(verification.verdict).toBe("VERIFIED");
    expect(verification.method).toBeUndefined(); // 缺席 = 键缺席
    expect(verification.recomputed_by).toEqual({
      actor_type: "human",
      actor: "reviewer-7",
      self_attested: true,
    });
  });
});

// ============================================================
// A3 守恒：NO_CHANGE（已判定 → 零写入不静默改判）
// ============================================================

describe("record verification A3 守恒（NO_CHANGE）", () => {
  it("对已 VERIFIED claim 重复验证 → NO_CHANGE exit 0 零写入回显既有判定；record claim --clm 复入 → EVIDENCE_ALREADY_EXISTS（既有 A3 守卫不回归）", async () => {
    await seedStore();
    await seedCapability();
    await seedGateRun();
    const claimInput = writeInput({
      subject_id: "CAPABILITY.CSV_TOOL.SERIALIZE_ROWS",
      assertion: "CSV_ROUNDTRIP_ROUNDTRIP_STABLE：含引号单元格往返逐字节还原",
      asserted_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
      evidence_refs: [],
    });
    await runRecordClaim(root, { from: claimInput });
    const first = await runRecordVerification(root, {
      clm: "CLM-0001",
      verifier: "tool:verifier@0.1.0",
      evidence: ["GRN-0001"],
    });
    expect(first.ok).toBe(true);
    expect(first.result.change).toBe("APPLIED");

    // 重复验证（不同验证主体 + 不同证据申报）→ NO_CHANGE 零写入
    const before = snapshot();
    const second = await runRecordVerification(root, {
      clm: "CLM-0001",
      verifier: "human:another-verifier",
      evidence: ["GRN-0001"],
    });
    expect(second.ok).toBe(true);
    expect(second.result.change).toBe("NO_CHANGE");
    expect(second.result.verification).toBe("VERIFIED"); // 既有判定如实回显
    expect(second.result.evidence_refs_added).toEqual([]);
    expect(snapshot()).toEqual(before); // 零写入

    // record claim --clm 复入同一已判定件（同内容重录）→ kernel EVIDENCE_ALREADY_EXISTS
    // （已判定记录不可 canonical 化——A3 既有守卫不回归；不带 --clm 的复入属新 claim，
    // 先立后证语义合法分配新 id，不在本断言射程）
    const reRecord = await runRecordClaim(root, { from: claimInput, clm: "CLM-0001" });
    expect(reRecord.ok).toBe(false);
    expect(reRecord.errors[0]?.code).toBe("EVIDENCE_ALREADY_EXISTS");
    expect(snapshot()).toEqual(before);
  });
});

// ============================================================
// fail-closed 码位矩阵
// ============================================================

describe("record verification fail-closed", () => {
  it("目标缺席 → CLAIM_NOT_FOUND；--clm / --verifier 词形 → SCHEMA_INVALID", async () => {
    await seedStore();
    await seedCapability();

    const missing = await runRecordVerification(root, {
      clm: "CLM-0099",
      verifier: "tool:verifier@0.1.0",
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]?.code).toBe("CLAIM_NOT_FOUND");

    const badClm = await runRecordVerification(root, {
      clm: "CLAIM-9",
      verifier: "tool:verifier@0.1.0",
    });
    expect(badClm.ok).toBe(false);
    expect(badClm.errors[0]?.code).toBe("SCHEMA_INVALID");

    const badVerifier = await runRecordVerification(root, {
      clm: "CLM-0001",
      verifier: "verifier-without-type",
    });
    expect(badVerifier.ok).toBe(false);
    expect(badVerifier.errors[0]?.code).toBe("SCHEMA_INVALID");
  });

  it("合并证据空集 → VERIFICATION_EVIDENCE_EMPTY（07 执行层规则；先立后证 claim 缺 --evidence 拒判）", async () => {
    await seedStore();
    await seedCapability();
    const clm = await seedClaimViaRecord();
    const outcome = await runRecordVerification(root, {
      clm,
      verifier: "tool:verifier@0.1.0",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors[0]?.code).toBe("VERIFICATION_EVIDENCE_EMPTY");
    expect((readClaim(clm).verification as Record<string, unknown>).verdict).toBe("UNVERIFIED"); // 零写入
  });

  it("引用重复 → SCHEMA_INVALID；method 词表外 → VOCAB_INVALID_VALUE（kernel 原码透传）", async () => {
    await seedStore();
    await seedCapability();
    await seedGateRun();
    const clm = await seedClaimViaRecord({ evidenceRefs: ["GRN-0001"] });

    const dup = await runRecordVerification(root, {
      clm,
      verifier: "tool:verifier@0.1.0",
      evidence: ["GRN-0001"],
    });
    expect(dup.ok).toBe(false);
    expect(dup.errors[0]?.code).toBe("SCHEMA_INVALID");

    const badMethod = await runRecordVerification(root, {
      clm,
      verifier: "tool:verifier@0.1.0",
      evidence: ["GRN-0001"],
      method: "vibes",
    });
    expect(badMethod.ok).toBe(false);
    expect(badMethod.errors[0]?.code).toBe("VOCAB_INVALID_VALUE");
  });

  it("未登记执行身份 → EXECUTION_NOT_FOUND；store 未初始化 → NOT_INITIALIZED", async () => {
    await seedStore();
    await seedCapability();
    const clm = await seedClaimViaRecord({ evidenceRefs: ["GRN-0001"] });
    const badExecution = await runRecordVerification(root, {
      clm,
      verifier: "tool:verifier@0.1.0",
      evidence: ["GRN-0001"],
      executionId: "AGX-2026-99999",
    });
    expect(badExecution.ok).toBe(false);
    expect(badExecution.errors[0]?.code).toBe("EXECUTION_NOT_FOUND");

    const bare = mkdtempSync(join(tmpdir(), "pomaster-cli-verify-bare-"));
    try {
      const uninitialized = await runRecordVerification(bare, {
        clm: "CLM-0001",
        verifier: "tool:verifier@0.1.0",
      });
      expect(uninitialized.ok).toBe(false);
      expect(uninitialized.errors[0]?.code).toBe("NOT_INITIALIZED");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

// ============================================================
// D20 同主体自批（warning-only，不验真主体——B3 边界）
// ============================================================

describe("record verification D20 自批披露", () => {
  it("verifier 与 asserted_by 同主体 → CLAIM_SELF_APPROVAL warning，APPLIED 不阻断", async () => {
    await seedStore();
    await seedCapability();
    await seedGateRun();
    const clm = await seedClaimViaRecord({
      evidenceRefs: [],
      assertedBy: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
    });
    const outcome = await runRecordVerification(root, {
      clm,
      verifier: "agent:claude/session-93", // 与 asserted_by 主体全等
      evidence: ["GRN-0001"],
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.result.change).toBe("APPLIED");
    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]?.code).toBe("CLAIM_SELF_APPROVAL");
    expect(outcome.warnings[0]?.hint).toContain("claim_self_approval_clean");
  });
});

// ============================================================
// 命令面（commander 注册与退出码）
// ============================================================

describe("record verification 命令面", () => {
  it("runCli: record verification --json 正例 exit 0 且信封 command 为多词全名", async () => {
    await seedStore();
    await seedCapability();
    await seedGateRun();
    const clm = await seedClaimViaRecord({ evidenceRefs: ["GRN-0001"] });
    const lines: string[] = [];
    const code = await runCli(
      [
        "--dir", root,
        "record", "verification",
        "--clm", clm,
        "--verifier", "tool:verifier@0.1.0",
        "--method", "recompute",
        "--json",
      ],
      { stdout: (line) => lines.push(line), stderr: () => undefined },
    );
    expect(code).toBe(0);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.command).toBe("record verification");
    expect(envelope.ok).toBe(true);
    expect((envelope.result as Record<string, unknown>).change).toBe("APPLIED");
  });

  it("runCli: 缺必填 --verifier → exit 1；目标缺席 → exit 1（信封 errors 显式码位）", async () => {
    await seedStore();
    await seedCapability();
    const lines: string[] = [];
    const code = await runCli(
      ["--dir", root, "record", "verification", "--clm", "CLM-0001", "--json"],
      { stdout: (line) => lines.push(line), stderr: () => undefined },
    );
    expect(code).toBe(1);
    const envelope = JSON.parse(lines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(envelope.ok).toBe(false);

    const errLines: string[] = [];
    const missingCode = await runCli(
      [
        "--dir", root,
        "record", "verification",
        "--clm", "CLM-0001",
        "--verifier", "tool:verifier@0.1.0",
        "--json",
      ],
      { stdout: (line) => errLines.push(line), stderr: () => undefined },
    );
    expect(missingCode).toBe(1);
    const missingEnvelope = JSON.parse(errLines.join("\n")) as CliEnvelope<Record<string, unknown>>;
    expect(missingEnvelope.errors[0]?.code).toBe("CLAIM_NOT_FOUND");
  });
});
