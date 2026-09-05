/**
 * claim-verification-e2e.spec.ts —— W2 闭合链集成验收（L2 集成命令面）：
 *
 *   init → maintain --ops（task 落账，acceptance 映射 CLM-0001）→ record claim
 *   （UNVERIFIED 先立后证，空 evidence_refs）→ closeout（阻断：DOD_CLAIM_NOT_VERIFIED）
 *   → record gate-run（独立验证探针产 GRN，subject 绑定任务）→ record verification
 *   （公开判定回写 VERIFIED + 挂证据）→ closeout（绿：acceptance 1/1 VERIFIED + gate
 *   1/1 passed → 施断 COMPLETED）→ 重复 record verification（NO_CHANGE 零写入）
 *
 * 纪律：全链公开 CLI（runCli 是 L2 集成面唯一入口）；**零 writeFileSync 造数**——claims/
 * runs/truth 全部经公开命令落账，写盘仅限命令输入文件（ops/claim/gate JSON，位于项目
 * 目录内的 inputs/，不入 .pomaster）。修复审计 W2：claim → VERIFIED 的正向生产链首次
 * 全程可定位、可实跑。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { envelopeOf, journalEvents, runJsonStep, type StepRecord } from "./fixture-chain-lib.js";

let root: string;
let inputsDir: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-e2e-claim-verification-"));
  inputsDir = join(root, "inputs");
  mkdirSync(inputsDir, { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** 命令输入文件写入（项目目录内 inputs/，非 .pomaster 造数）。 */
function writeInput(name: string, value: unknown): string {
  const path = join(inputsDir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

describe("W2 正向链：record claim → record verification → closeout 全程公开命令", () => {
  let taskOps: StepRecord;
  let claimRecord: StepRecord;
  let closeoutBlocked: StepRecord;
  let gateRun: StepRecord;
  let verification: StepRecord;
  let closeoutGreen: StepRecord;
  let repeatVerification: StepRecord;

  beforeAll(async () => {
    // —— ① init（BOOTSTRAP_OWNER 骨架 authority） ——
    const init = await runJsonStep(root, ["init"]);
    expect(init.code).toBe(0);

    // —— ② task 落账（maintain --ops；acceptance 映射 CLM-0001；R4 class_scan_result 必带） ——
    const opsFile = writeInput("task-upsert-ops.json", {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "TASK.VERIF_CHAIN",
            kind: "task_object",
            axisProfile: "task_default",
            axes: {
              lifecycle: "CURRENT",
              confidence: "PROVISIONAL",
              evidence: "IMPLEMENTED",
              change: "STABLE",
            },
            titleZh: "W2 正向链验收任务",
            authority: { owner: "BOOTSTRAP_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              intent: "验证 record claim → record verification → closeout 公开正向链",
              acceptance: [
                { criterion: "往返行为经独立验证流判定 VERIFIED", claim: "CLM-0001" },
              ],
              class_scan_result: {
                scope: "src/**",
                hits: 0,
                fixed_count: 0,
                regression_case_ref: "GRN-0001",
              },
            },
          },
        },
      ],
      authorityRef: "CHANGE.VERIF_CHAIN",
      note: "W2 正向链：task 落账",
    });
    taskOps = await runJsonStep(root, ["maintain", "CHANGE.VERIF_CHAIN", "--ops", opsFile]);
    expect(taskOps.code).toBe(0);

    // —— ③ record claim（公开命令；先立后证：空 evidence_refs → UNVERIFIED） ——
    claimRecord = await runJsonStep(root, [
      "record", "claim",
      "--from", writeInput("claim-input.json", {
        subject_id: "TASK.VERIF_CHAIN",
        assertion: "TASK_ACCEPTANCE_VERIFIED：往返行为按验收口径成立",
        asserted_by: { actor_type: "agent", actor: "claude/session-93", self_attested: true },
        evidence_refs: [],
      }),
    ]);
    expect(claimRecord.code).toBe(0);

    // —— ④ closeout（判定前）：claim 维度阻断（UNVERIFIED ≠ VERIFIED）＋ R-L baseline
    // gate 阻断共存（init 工作区 baseline 恒在场——检出判卷式零写入） ——
    closeoutBlocked = await runJsonStep(root, ["closeout", "TASK.VERIF_CHAIN"]);

    // —— ④b baseline 确认前提（R-L gate 接线）：非交互后补销账 14 unknowns +
    // confirm digest 快照；未确认态与既有码共存的呈现归 closeout.spec 单元面。 ——
    const baselineKeyPlan: readonly (readonly [lane: string, keys: readonly string[]])[] = [
      ["frontend", ["framework", "language", "build", "router", "state", "grid", "ui", "css", "testing"]],
      ["backend", ["language", "framework", "persistence", "database", "cache"]],
    ];
    for (const [lane, keys] of baselineKeyPlan) {
      for (const key of keys) {
        const set = await runJsonStep(root, [
          "baseline", "set", "--lane", lane, "--key", key,
          "--value", key === "grid" || key === "cache" ? "none" : `${lane}-${key}-value`,
        ]);
        expect(set.code).toBe(0);
      }
    }
    const baselineConfirm = await runJsonStep(root, ["baseline", "confirm"]);
    expect(baselineConfirm.code).toBe(0);

    // —— ⑤ 独立验证探针产 GRN（record gate-run；subject 绑定本任务） ——
    gateRun = await runJsonStep(root, [
      "record", "gate-run",
      "--from", writeInput("gate-input.json", {
        gate: "ROUNDTRIP",
        gate_def: "POLICY.GATE.ROUNDTRIP@0.1.0",
        verdict: "passed",
        metric_dialect: "csv:quoted_cell_roundtrip",
        subject_id: "TASK.VERIF_CHAIN",
        denominator_refs: [],
        counts: { scanned: 3, applicable_scanned: 3, violations: 0, not_applicable: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
        duration_ms: { self: 2, external: 0 },
      }),
    ]);
    expect(gateRun.code).toBe(0);

    // —— ⑥ record verification（W2 公开判定回写入口） ——
    verification = await runJsonStep(root, [
      "record", "verification",
      "--clm", "CLM-0001",
      "--verifier", "tool:roundtrip-verifier@1.0.0",
      "--method", "recompute",
      "--evidence", "GRN-0001",
      "--authority-ref", "CHANGE.VERIF_CHAIN",
      "--note", "W2 正向链：独立验证判定回写",
    ]);

    // —— ⑦ closeout（判定后）：绿 ——
    closeoutGreen = await runJsonStep(root, ["closeout", "TASK.VERIF_CHAIN"]);

    // —— ⑧ 重复验证（A3：NO_CHANGE 零写入） ——
    repeatVerification = await runJsonStep(root, [
      "record", "verification",
      "--clm", "CLM-0001",
      "--verifier", "tool:another-verifier@2.0.0",
      "--method", "recompute",
      "--evidence", "GRN-0001",
    ]);
  });

  it("record claim：APPLIED 且 verification 恒 UNVERIFIED（D20：声称方不可自填）", () => {
    const envelope = envelopeOf(claimRecord);
    expect(envelope.command).toBe("record claim");
    expect((envelope.result as Record<string, unknown>).change).toBe("APPLIED");
    // 入账时刻的判定态（envelope 是当拍存档；磁盘终态由后续 verification 步骤断言）
    expect((envelope.result as Record<string, unknown>).verification).toBe("UNVERIFIED");
  });

  it("closeout（判定前）：claim 维度显式阻断 DOD_CLAIM_NOT_VERIFIED（UNVERIFIED 不可完成）", () => {
    expect(closeoutBlocked.code).toBe(1);
    const envelope = envelopeOf(closeoutBlocked);
    expect(envelope.ok).toBe(false);
    expect(envelope.errors.map((error) => error.code)).toContain("DOD_CLAIM_NOT_VERIFIED");
    // R-L baseline gate：未确认基线与 claim 阻断共存呈现（init 工作区适用域）。
    expect(envelope.errors.map((error) => error.code)).toContain("BASELINE_NOT_CONFIRMED");
    const dod = (envelope.result as Record<string, unknown>).dod as Record<string, unknown>;
    expect(dod.acceptance_total).toBe(1);
    expect(dod.verified).toBe(0);
  });

  it("record verification：APPLIED 回写 VERIFIED + 挂 GRN 证据（kernel verify_claim 通路）", () => {
    expect(verification.code).toBe(0);
    const envelope = envelopeOf(verification);
    expect(envelope.command).toBe("record verification");
    expect(envelope.ok).toBe(true);
    expect((envelope.result as Record<string, unknown>).change).toBe("APPLIED");
    expect((envelope.result as Record<string, unknown>).verification).toBe("VERIFIED");
    const claim = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-0001.json"), "utf8"),
    ) as Record<string, unknown>;
    const block = claim.verification as Record<string, unknown>;
    expect(block.verdict).toBe("VERIFIED");
    expect(block.method).toBe("recompute");
    expect(block.recomputed_by).toEqual({
      actor_type: "tool",
      actor: "roundtrip-verifier@1.0.0",
      self_attested: true,
    });
    // 证据引用合并（先立后证的空集 + 追加 GRN）
    expect(claim.evidence_refs).toEqual([{ ref_type: "gate_result", grn: "GRN-0001" }]);
  });

  it("closeout（判定后）：不再因该 claim 阻断——acceptance 1/1 VERIFIED + gate 1/1 passed → 施断绿", () => {
    expect(closeoutGreen.code).toBe(0);
    const envelope = envelopeOf(closeoutGreen);
    expect(envelope.ok).toBe(true);
    const result = envelope.result as Record<string, unknown>;
    expect(result.blocked).toBe(false);
    const dod = result.dod as Record<string, unknown>;
    expect(dod.acceptance_total).toBe(1);
    expect(dod.verified).toBe(1);
    const dodEntries = dod.entries as Array<Record<string, unknown>>;
    expect(dodEntries[0]?.ok).toBe(true);
    expect(dodEntries[0]?.verdict).toBe("VERIFIED");
    const gates = result.gates as Record<string, unknown>;
    expect(gates.bound_runs).toBe(1);
    expect(gates.gates_passed).toBe(1);
    // 施断经 kernel：journal TX_APPLIED 记 transition_object（evidence→VERIFIED）
    const transition = journalEvents(root).find(
      (event) => event.type === "TX_APPLIED"
        && Array.isArray(event.ops)
        && (event.ops as string[]).includes("transition_object"),
    );
    expect(transition).toBeDefined();
  });

  it("重复 record verification：NO_CHANGE exit 0 零写入（A3 单向一次性，不静默改判）", () => {
    expect(repeatVerification.code).toBe(0);
    const envelope = envelopeOf(repeatVerification);
    expect(envelope.ok).toBe(true);
    expect((envelope.result as Record<string, unknown>).change).toBe("NO_CHANGE");
    expect((envelope.result as Record<string, unknown>).verification).toBe("VERIFIED");
    // 判定主体未被改判（仍是首次验证者）
    const claim = JSON.parse(
      readFileSync(join(root, ".pomaster", "evidence", "claims", "CLM-0001.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(((claim.verification as Record<string, unknown>).recomputed_by as Record<string, unknown>).actor)
      .toBe("roundtrip-verifier@1.0.0");
  });
});
