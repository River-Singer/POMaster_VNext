/**
 * task-reassess-baseline.spec.ts —— 任务 baseline 依赖范围重评估（VNext 优化 V2-7；台账 VX-WRITE-02）。
 *
 * 判据（plan V2-7）：
 * - 声明范围的任务在相关目标合法变更后：重评估 + requalify 受影响 CLM + 另一主体验证 → closeout
 *   COMPLETED；ACCEPT 语义回执全程有效（V2-9 指纹剥离 baseline_dependencies / acceptance[].claim）；
 * - 不相关目标变更后重评估不作废任何证据；同范围重放 NO_CHANGE 零写入；
 * - 脏状态（新相关目标漂移 / 在途批）→ BASELINE_SCOPE_REASSESS_DIRTY 零写入；排除目标上的漂移不阻断；
 * - 一个事务：范围重写与 ADVANCE（锚 task_baseline_scope）同生同死——ADVANCE 不合格（占位理由）
 *   整体零落盘；同一任务的 ADVANCE 成链。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore, digestValue, loadTruthIndex, qualifyEvidence } from "@pomaster/kernel";
import {
  BASELINE_CONFIRM_TARGETS,
  acceptRevisionFingerprint,
  baselineTargetsForLanes,
  buildBaselineDependencyDeclaration,
  readBaselineConfirmation,
  runCloseout,
  runRecordRequalify,
  runRecordVerification,
  runTaskReassessBaseline,
  type CloseoutResult,
} from "@pomaster/cli";
import { captureEvidenceBaselineInputs, readEvidenceQualificationRequirement } from "../src/evidence-qualification.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-reassess-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const TASK = "TASK.T0001";
const FRONTEND_ARCH = "baseline/frontend/architecture.md";
const PLATFORM_OBS = "baseline/platform/observability.md";

// ============================================================
// fixture（closeout-evidence-qualification.spec 同款最小夹具）
// ============================================================

async function initStore(): Promise<void> {
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as { authorities: Record<string, unknown> };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

function currentSeq(): number {
  const index = JSON.parse(readFileSync(join(root, ".pomaster", "state", "truth-index.json"), "utf8")) as { generation: { seq: number } };
  return index.generation.seq;
}

function baselineFileContents(): Map<string, string> {
  const md = (name: string): [string, string] => [`baseline/${name}`, `# ${name}\n`];
  return new Map([
    ["baseline/frontend/stack.yaml", "framework: vue3\nlanguage: typescript\n"],
    ["baseline/backend/stack.yaml", "language: java\nframework: spring\n"],
    ["baseline/frontend/design-tokens.yaml", "meta:\n  origin: preset\n  customized: false\n"],
    ...[
      "frontend/architecture.md",
      "frontend/directory-structure.md",
      "frontend/design-system.md",
      "frontend/state-and-data.md",
      "frontend/api-and-error.md",
      "frontend/quality.md",
      "backend/architecture.md",
      "backend/directory-structure.md",
      "backend/api-contract.md",
      "backend/data-access.md",
      "backend/transaction-concurrency.md",
      "backend/integration-runtime.md",
      "backend/quality.md",
      "data/model.md",
      "data/precision-units.md",
      "data/migration.md",
      "data/lineage.md",
      "data/quality.md",
      "platform/security.md",
      "platform/environment.md",
      "platform/observability.md",
      "platform/delivery.md",
    ].map(md),
  ]);
}

/** 写基线文件 + confirmed 块（at_seq / digests / target_seq / 可选 pending 段）——模拟一次治理通路确认。 */
function writeConfirmed(
  atSeq: number,
  contents: Map<string, string>,
  targetSeq: Record<string, number> = {},
  pending?: { readonly changeRef: string; readonly batch: readonly string[] },
): void {
  for (const [target, content] of contents) {
    const absolute = join(root, ".pomaster", ...target.split("/"));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  const digestLines = [...contents].map(([target, content]) => `    ${target}: sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`);
  const seqLines = [...contents.keys()].map((target) => `    ${target}: ${targetSeq[target] ?? 0}`);
  const pendingLines = pending === undefined
    ? []
    : ["  pending:", `    change_ref: ${pending.changeRef}`, "    batch:", ...pending.batch.map((entry) => `      - ${entry}`)];
  writeFileSync(
    join(root, ".pomaster", "baseline", "manifest.yaml"),
    [
      "id: BASELINE.PROJECT",
      "schema_version: 1",
      "status: CURRENT",
      "unknowns: []",
      "confirmed:",
      `  at_seq: ${atSeq}`,
      "  digests:",
      ...digestLines,
      "  target_seq:",
      ...seqLines,
      ...pendingLines,
      "",
    ].join("\n"),
  );
}

/** 改写一个基线文件但不确认（= 确认后漂移）。 */
function editWithoutConfirm(target: string, content: string): void {
  writeFileSync(join(root, ".pomaster", ...target.split("/")), content);
}

async function frontendDeclaration() {
  const confirmation = await readBaselineConfirmation(root);
  if (confirmation.kind !== "record-valid") throw new Error("expected confirmed baseline");
  const lanes = baselineTargetsForLanes(["frontend"]);
  const declaration = buildBaselineDependencyDeclaration(confirmation.record, lanes.relevant, lanes.excluded);
  if (!declaration.ok) throw new Error(declaration.details.join("; "));
  return declaration.declaration;
}

async function seedTask(baselineDependencies: unknown): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: TASK,
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "示例任务",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "导出 CSV",
            baseline_dependencies: baselineDependencies,
            acceptance: [{ criterion: "行为 X 已被独立验证", claim: "CLM-0001" }],
            class_scan_result: { scope: "src/shared/**", hits: 0, fixed_count: 0, regression_case_ref: "GRN-0001" },
          },
        } as never,
      },
    ],
  });
}

async function taskBody(): Promise<Record<string, unknown>> {
  const row = (await loadTruthIndex(await createStore(root))).objects.find((candidate) => candidate.id === TASK);
  if (row === undefined) throw new Error("task missing");
  return JSON.parse(readFileSync(join(root, ".pomaster", ...row.bodyRef.split("/")), "utf8")) as Record<string, unknown>;
}

function writeRun(grn: string, ranAtSeq: number, baselineInputs: unknown): void {
  const dir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  const run = {
    record_type: "run",
    baseline_inputs: baselineInputs,
    grn,
    ran_at_seq: ranAtSeq,
    trigger: { type: "pre_closeout" },
    gate_result: {
      mode: "inline",
      result: {
        grn,
        gate: "BUILD",
        gate_def: "POLICY.GATE.BUILD@0.1.0",
        tool: "demo:build",
        tool_version: "0.1.0",
        metric_dialect: "demo:case_count",
        ran_at_seq: ranAtSeq,
        verdict: "passed",
        subject_id: TASK,
        is_fixture: false,
        denominator_refs: [],
        counts: { scanned: 2, applicable_scanned: 2, violations: 0, not_applicable: 0 },
        blindspot: { scanned: 2, produced: 2, escape_ratio: 0 },
        trust: { asserted: null, recomputed: { violations: 0, matches_asserted: true } },
        duration_ms: { self: 1, external: 0 },
      },
    },
  };
  writeFileSync(join(dir, `${grn}.json`), `${JSON.stringify(run, null, 2)}\n`);
}

function writeVerifiedClaim(atSeq: number, baselineInputs: unknown): void {
  const dir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(dir, { recursive: true });
  const claim = {
    record_type: "claim",
    baseline_inputs: baselineInputs,
    clm: "CLM-0001",
    subject: { object_id: TASK },
    is_fixture: false,
    assertion: "TASK_ACCEPTANCE_VERIFIED：行为 X 经独立重算确认",
    asserted_by: { actor_type: "agent", actor: "demo-builder", self_attested: true },
    evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
    verification: {
      verdict: "VERIFIED",
      method: "recompute",
      recomputed_by: { actor_type: "tool", actor: "verifier@0.1.0", self_attested: false },
      recomputed_value: { ok: true },
      delta_vs_asserted: null,
      at_seq: atSeq,
    },
    rev: 1,
    notes_md: null,
  };
  writeFileSync(join(dir, "CLM-0001.json"), `${JSON.stringify(claim, null, 2)}\n`);
}

/** ACCEPT 回执（语义修订指纹 v2——V2-9）：绑定当前任务正文。 */
async function seedAcceptReceipt(): Promise<void> {
  const dir = join(root, ".pomaster", "discovery", "scratchpads", "idea-reassess");
  mkdirSync(dir, { recursive: true });
  const graph = {
    graph_fingerprint: `sha256:${"0".repeat(64)}`,
    decisions: [
      {
        decision_id: "DECISION.ACCEPT_SCOPE",
        resolution: { answer: "ACCEPT", outcome_binding: { task_ref: TASK, revision_fingerprint: acceptRevisionFingerprint(await taskBody()) } },
      },
    ],
  };
  writeFileSync(join(dir, "decision-graph.json"), `${JSON.stringify(graph, null, 2)}\n`);
}

/** 已声明 --lanes frontend 的任务 + 在确认基线上产出、已 VERIFIED 的验收证据。 */
async function seedScopedTaskWithVerifiedEvidence(): Promise<void> {
  await initStore();
  writeConfirmed(0, baselineFileContents());
  await seedTask(await frontendDeclaration());
  const captured = await captureEvidenceBaselineInputs(root);
  const seq = currentSeq();
  writeVerifiedClaim(seq, captured);
  writeRun("GRN-0001", seq, captured);
  await seedAcceptReceipt();
}

function snapshot(): string[] {
  const base = join(root, ".pomaster");
  const entries: string[] = [];
  const walk = (current: string, rel: string): void => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, item.name);
      const childRel = rel === "" ? item.name : `${rel}/${item.name}`;
      if (item.isDirectory()) walk(child, childRel);
      else entries.push(`${childRel}:${readFileSync(child, "utf8")}`);
    }
  };
  walk(base, "");
  return entries.sort();
}

function journalEvents(type: string): Record<string, unknown>[] {
  return readFileSync(join(root, ".pomaster", "state", "journal.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.type === type);
}

function advanceRecord(adv: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, ".pomaster", "state", "advances", `${adv}.json`), "utf8")) as Record<string, unknown>;
}

const reassess = (overrides: Partial<Parameters<typeof runTaskReassessBaseline>[1]> = {}) =>
  runTaskReassessBaseline(root, { task: TASK, lanes: ["frontend"], reason: "frontend Layers 取值经 CHANGE 治理变更，重评估任务范围", by: "human:owner", ...overrides });

// ============================================================

describe("task reassess-baseline：相关目标合法变更后的恢复路径（V2-7）", () => {
  it("相关目标变更 → 重评估（ADVANCE 锚 task_baseline_scope，列出受影响 CLM）→ requalify → 另一主体验证 → closeout COMPLETED；ACCEPT 回执全程有效", async () => {
    await seedScopedTaskWithVerifiedEvidence();
    const oldDeclaration = (await taskBody()).payload as Record<string, unknown>;
    const capturedBefore = await captureEvidenceBaselineInputs(root);

    // 相关目标（frontend/architecture.md）经治理通路合法变更并重确认。
    const contents = baselineFileContents();
    contents.set(FRONTEND_ARCH, "# architecture\n## Layers\n- 改为四层\n");
    const changedAt = currentSeq();
    writeConfirmed(changedAt, contents, { [FRONTEND_ARCH]: changedAt });
    const drifted = await runCloseout(root, { taskId: TASK });
    expect(drifted.errors.map((error) => error.code)).toContain("BASELINE_DRIFT");

    const outcome = await reassess();
    expect(outcome.errors).toEqual([]);
    expect(outcome.result).toMatchObject({
      task: TASK,
      change: "REASSESSED",
      advance: "ADV-0001",
      baseline_at_seq: changedAt,
      affected_claims: [{ clm: "CLM-0001", acceptance_index: 0, verdict: "VERIFIED", stale_targets: [FRONTEND_ARCH] }],
    });
    const newDeclaration = (await taskBody()).payload as { baseline_dependencies: { digests: Record<string, string>; baseline_at_seq: number } };
    const confirmation = await readBaselineConfirmation(root);
    if (confirmation.kind !== "record-valid") throw new Error("expected confirmed baseline");
    expect(newDeclaration.baseline_dependencies.digests).toEqual(confirmation.record.digests);
    expect(newDeclaration.baseline_dependencies.baseline_at_seq).toBe(changedAt);

    const record = advanceRecord("ADV-0001");
    const advance = record.advance as Record<string, unknown>;
    expect(advance.old_anchor).toEqual({ kind: "task_baseline_scope", ref: TASK, digest: digestValue(oldDeclaration.baseline_dependencies), version: 1 });
    expect(advance.new_anchor).toEqual({ kind: "task_baseline_scope", ref: TASK, digest: digestValue(newDeclaration.baseline_dependencies), version: 1 });
    expect(advance.affected_ids).toEqual(["CLM-0001", TASK]);
    expect(journalEvents("ADVANCE_RECORDED")).toEqual([
      expect.objectContaining({ adv: "ADV-0001", anchor_kind: "task_baseline_scope", ref: TASK, affected_ids: ["CLM-0001", TASK], actor: "human:owner" }),
    ]);
    expect(outcome.human.join("\n")).toContain("pomaster record requalify --clm CLM-0001");

    // 范围已对齐当前确认：要求面可装配；旧证据在新范围下照旧 STALE（不洗白），新证据合格。
    const requirement = await readEvidenceQualificationRequirement(root, newDeclaration.baseline_dependencies);
    const face = (inputs: unknown) => ({
      ref: "GRN-0001", surface: "run" as const, captured_at_seq: currentSeq(), gate: null, gate_def: null,
      oracle_ref: null, execution_id: null, subject: null, baseline_inputs: inputs as never,
    });
    expect(qualifyEvidence(face(capturedBefore), requirement).verdict).toBe("STALE_SEQ");
    expect(qualifyEvidence(face(await captureEvidenceBaselineInputs(root)), requirement).verdict).toBe("QUALIFIED");
    const stale = await runCloseout(root, { taskId: TASK });
    expect(stale.errors.map((error) => error.code)).toContain("DOD_CLAIM_EVIDENCE_UNQUALIFIED");
    expect(stale.errors.map((error) => error.code)).not.toContain("CLOSEOUT_ACCEPT_STALE");

    const requalified = await runRecordRequalify(root, { clm: "CLM-0001", by: "human:owner", reason: "frontend Layers 取值变更，原判定依据过期" });
    expect(requalified.errors).toEqual([]);
    expect(requalified.result.successor).toBe("CLM-0002");
    writeRun("GRN-0002", currentSeq(), await captureEvidenceBaselineInputs(root));
    const verified = await runRecordVerification(root, { clm: "CLM-0002", verifier: "tool:verifier@2.0.0", method: "recompute", evidence: ["GRN-0002"] });
    expect(verified.errors).toEqual([]);

    const closed = await runCloseout(root, { taskId: TASK });
    expect(closed.errors).toEqual([]);
    expect((closed.result as CloseoutResult).change).toBe("COMPLETED");
  });

  it("不相关目标（platform）变更后重评估：不作废任何证据、closeout 照常通过；同范围重放 NO_CHANGE 零写入", async () => {
    await seedScopedTaskWithVerifiedEvidence();
    const contents = baselineFileContents();
    contents.set(PLATFORM_OBS, "# observability\n- p99 告警阈值 800ms\n");
    const changedAt = currentSeq();
    writeConfirmed(changedAt, contents, { [PLATFORM_OBS]: changedAt });

    const outcome = await reassess({ reason: "platform 观测基线更新后复核任务范围" });
    expect(outcome.errors).toEqual([]);
    expect(outcome.result).toMatchObject({ change: "REASSESSED", affected_claims: [] });
    expect((advanceRecord("ADV-0001").advance as Record<string, unknown>).affected_ids).toEqual([TASK]);
    expect(outcome.human.join("\n")).toContain("全部继续有效");

    const before = snapshot();
    const replay = await reassess({ reason: "再次复核" });
    expect(replay.errors).toEqual([]);
    expect(replay.result.change).toBe("NO_CHANGE");
    expect(snapshot()).toEqual(before);

    const closed = await runCloseout(root, { taskId: TASK });
    expect(closed.errors).toEqual([]);
    expect((closed.result as CloseoutResult).change).toBe("COMPLETED");
  });

  it("扩大范围：--lanes frontend,platform 后 platform 的既有变化把证据带入再判定；第二段 ADVANCE 以第一段为前驱", async () => {
    await seedScopedTaskWithVerifiedEvidence();
    const contents = baselineFileContents();
    contents.set(PLATFORM_OBS, "# observability\n- p99 告警阈值 800ms\n");
    const changedAt = currentSeq();
    writeConfirmed(changedAt, contents, { [PLATFORM_OBS]: changedAt });
    expect((await reassess({ reason: "platform 观测基线更新后复核任务范围" })).result.affected_claims).toEqual([]);

    const widened = await reassess({ lanes: ["frontend,platform"], reason: "导出功能接入告警，platform 转为相关" });
    expect(widened.errors).toEqual([]);
    expect(widened.result).toMatchObject({
      change: "REASSESSED",
      advance: "ADV-0002",
      affected_claims: [{ clm: "CLM-0001", stale_targets: [PLATFORM_OBS] }],
    });
    expect(widened.result.relevant_targets).toContain(PLATFORM_OBS);
    const first = advanceRecord("ADV-0001").advance as Record<string, unknown>;
    const second = advanceRecord("ADV-0002").advance as Record<string, unknown>;
    expect(second.old_anchor).toEqual(first.new_anchor);
  });
});

describe("task reassess-baseline：拒绝面零写入", () => {
  it("新相关目标确认后漂移 → BASELINE_SCOPE_REASSESS_DIRTY；只有排除目标漂移 → 放行", async () => {
    await seedScopedTaskWithVerifiedEvidence();
    editWithoutConfirm(FRONTEND_ARCH, "# architecture\n## Layers\n- 未经确认的改动\n");
    const before = snapshot();
    const dirty = await reassess();
    expect(dirty.ok).toBe(false);
    expect(dirty.errors[0]?.code).toBe("BASELINE_SCOPE_REASSESS_DIRTY");
    expect(dirty.errors[0]?.message).toContain(FRONTEND_ARCH);
    expect(dirty.errors[0]?.hint).toContain("baseline confirm");
    expect(snapshot()).toEqual(before);

    writeConfirmed(0, baselineFileContents()); // 撤回相关漂移
    editWithoutConfirm(PLATFORM_OBS, "# observability\n- 未经确认的改动\n");
    const excluded = await reassess({ lanes: ["frontend,backend"], reason: "导出功能新增后端接口，backend 转为相关（platform 漂移与本任务无关）" });
    expect(excluded.errors).toEqual([]);
    expect(excluded.result.change).toBe("REASSESSED");
  });

  it("新相关目标在途变更批 → BASELINE_SCOPE_REASSESS_DIRTY，hint 指向同 ref confirm 终结", async () => {
    await initStore();
    writeConfirmed(0, baselineFileContents());
    await seedTask(await frontendDeclaration());
    writeConfirmed(0, baselineFileContents(), {}, { changeRef: "CHANGE.EXPORT_001", batch: ["baseline/frontend/stack.yaml:framework"] });
    const before = snapshot();
    const dirty = await reassess();
    expect(dirty.errors[0]?.code).toBe("BASELINE_SCOPE_REASSESS_DIRTY");
    expect(dirty.errors[0]?.hint).toContain("pomaster baseline confirm --change CHANGE.EXPORT_001");
    expect(snapshot()).toEqual(before);
  });

  it("占位理由 → ADVANCE_INVALID，范围重写随事务回滚（任务正文字节不变）", async () => {
    await seedScopedTaskWithVerifiedEvidence();
    const contents = baselineFileContents();
    contents.set(PLATFORM_OBS, "# observability\n- 新阈值\n");
    writeConfirmed(currentSeq(), contents, { [PLATFORM_OBS]: currentSeq() });
    const before = snapshot();
    const placeholder = await reassess({ reason: "TODO" });
    expect(placeholder.ok).toBe(false);
    expect(placeholder.errors[0]?.code).toBe("SCHEMA_INVALID");
    expect(placeholder.errors[0]?.message).toContain("advance.reason must not be a placeholder");
    expect(snapshot()).toEqual(before);
    expect(existsSync(join(root, ".pomaster", "state", "advances"))).toBe(false);
  });

  it("argv / 对象形态：--lanes 与逐文件互斥、lane 词表外、缺范围、缺 reason、坏 --by、非 TASK、任务缺席、范围不全", async () => {
    await initStore();
    writeConfirmed(0, baselineFileContents());
    await seedTask(await frontendDeclaration());
    const before = snapshot();
    const codeOf = async (overrides: Partial<Parameters<typeof runTaskReassessBaseline>[1]>) => (await reassess(overrides)).errors[0]?.code;
    expect(await codeOf({ baselineTargets: [FRONTEND_ARCH] })).toBe("SCHEMA_INVALID");
    expect(await codeOf({ lanes: ["mobile"] })).toBe("SCHEMA_INVALID");
    expect(await codeOf({ lanes: [] })).toBe("SCHEMA_INVALID");
    expect(await codeOf({ reason: " " })).toBe("SCHEMA_INVALID");
    expect(await codeOf({ by: "owner" })).toBe("SCHEMA_INVALID");
    expect(await codeOf({ task: "PAGE.DASHBOARD" })).toBe("SCHEMA_INVALID");
    expect(await codeOf({ task: "TASK.NOPE" })).toBe("OBJECT_NOT_FOUND");
    const partial = await runTaskReassessBaseline(root, {
      task: TASK, baselineTargets: [FRONTEND_ARCH], baselineExclusions: [PLATFORM_OBS], reason: "逐文件划分", by: "human:owner",
    });
    expect(partial.errors[0]?.code).toBe("BASELINE_SCOPE_INCOMPLETE");
    expect(snapshot()).toEqual(before);
    expect(BASELINE_CONFIRM_TARGETS).toContain(FRONTEND_ARCH);
  });
});
