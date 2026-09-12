/**
 * closeout-evidence-spec.spec.ts —— vNext Batch 2 R1（D6）：closeout DoD Spec 维度
 * （Evidence Spec 一等对象消费面；挪证缝收口——资格判定非引用映射）。
 *
 * 判据锚（cli/src/closeout.ts 头注 ADR + 21-evidence-spec.schema.json）：
 * - 绑定 CURRENT Spec（direct=bound_task_ref / change=bound_change_ref 经
 *   implements_change）→ 按 requirements 资格条件判卷；条款全部成立才不阻断；
 * - 资格清单（claim_refs/gate_refs）是白名单：清单外证据不满足条款；claim 须
 *   subject 与资格归属（clause.subject_ref 缺省回退 Spec 绑定）全等 + VERIFIED +
 *   非空 evidence_refs（挪证缝收口——跨对象借证显式呈现于 detail）；
 * - 空资格清单 → DOD_SPEC_CLAUSE_UNSATISFIABLE（禁「任意 VERIFIED claim 皆可」洗白）；
 * - 无注记 claim 跨条款双消费 → 挪证通道显式呈现（与 acceptance 侧
 *   DOD_CLAIM_UNANNOTATED_SHARED 同形——既有机制保留并衔接）；
 * - 非 CURRENT 绑定 Spec → SPEC_NOT_BINDING warning 显式呈现不判卷；
 * - gate_refs 资格候选聚合（审计 F5）：候选内同 gate 多次运行按 (ran_at_seq, GRN 序)
 *   取最新判卷（与 subject 级 gate 维度同源同规则，重跑合法取代旧判）；任一 gate
 *   最新判卷 passed 即满足；候选排列置换不变 + 重跑通过覆盖旧失败回归；「候选未
 *   满足」（DOD_SPEC_GATE_NOT_PASSED，一条条款计一条分母）与「证据结构损坏」
 *   （EVIDENCE_MALFORMED / SCHEMA_INVALID / DOD_SPEC_GATE_SUBJECT_MISMATCH）分码位
 *   不混算；
 * - 无 Spec 绑定 → dod.spec === null（双轨过渡——acceptance 轨独跑，行为零变化）；
 * - Spec 持要求不持判定（21 schema 无 verdict 词位）：判定值只从 claims/runs 平面
 *   读取（D20 同线）；record_claim 强制 UNVERIFIED / A3 不可覆写 / D20 主体分离
 *   （store.ts:1594-1728）零改动。
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTransaction, createStore } from "@pomaster/kernel";
import { runCloseout, type CloseoutResult } from "@pomaster/cli";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pomaster-cli-closeout-spec-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ============================================================
// 本地 fixture（closeout.spec 同线：task + VERIFIED claim + passed run）
// ============================================================

async function initStore(): Promise<void> {
  await createStore(root);
  const authPath = join(root, ".pomaster", "state", "authority.json");
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
    authorities: Record<string, unknown>;
  };
  auth.authorities["BUSINESS_OWNER"] = {};
  writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

async function seedTask(): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: "TASK.T0001",
          kind: "task_object",
          axisProfile: "task_default",
          axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
          titleZh: "示例任务",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            intent: "验证 closeout Spec 维度",
            acceptance: [{ criterion: "行为 X 已被独立验证", claim: "CLM-0001" }],
            class_scan_result: {
              scope: "src/shared/**",
              hits: 0,
              fixed_count: 0,
              regression_case_ref: "GRN-0001",
            },
          },
        } as never,
      },
    ],
  });
}

async function seedSpec(overrides: {
  readonly id?: string;
  readonly lifecycle?: string;
  readonly boundTaskRef?: string | null;
  readonly boundChangeRef?: string | null;
  readonly clauses?: readonly Record<string, unknown>[];
} = {}): Promise<void> {
  const store = await createStore(root);
  await applyTransaction(store, {
    ops: [
      {
        op: "upsert_object",
        envelope: {
          id: overrides.id ?? "SPEC.CALC_EXPORT_EVIDENCE",
          kind: "business_rule",
          axisProfile: "rule_default",
          axes: {
            lifecycle: overrides.lifecycle ?? "CURRENT",
            confidence: "PROVISIONAL",
            evidence: overrides.lifecycle === "PROPOSED" ? "PLANNED" : "IMPLEMENTED",
            change: "STABLE",
          },
          titleZh: "计算导出证据要求",
          authority: { owner: "BUSINESS_OWNER", delegates: [] },
          origin: "natural",
          payload: {
            spec_kind: "evidence_spec",
            title: "计算导出需要什么证明（要求面）",
            bound_task_ref: overrides.boundTaskRef === undefined ? "TASK.T0001" : overrides.boundTaskRef,
            bound_change_ref: overrides.boundChangeRef ?? null,
            requirements: overrides.clauses ?? [],
          },
        } as never,
      },
    ],
  });
}

function clauseFixture(overrides: {
  readonly clauseId?: string;
  readonly claimRefs?: readonly string[];
  readonly gateRefs?: readonly string[];
  readonly subjectRef?: string | null;
}): Record<string, unknown> {
  return {
    clause_id: overrides.clauseId ?? "R1",
    proof_type: "build_gate",
    description: "导出计算经独立重算确认",
    subject_ref: overrides.subjectRef ?? null,
    claim_refs: overrides.claimRefs ?? [],
    gate_refs: overrides.gateRefs ?? [],
  };
}

/** VERIFIED 判定由独立验证流写入 claims 平面（D20 判定通路——closeout.spec 同一夹具形态）。 */
function claimFixture(overrides: {
  readonly clm?: string;
  readonly subject?: string;
  readonly verdict?: string;
  readonly acceptanceIndex?: number;
  /** true = 重算主体与断言主体同元组（自批 VERIFIED 形态——O-W1-3 条款资格拒绝目标）。 */
  readonly selfApproved?: boolean;
}): Record<string, unknown> {
  const clm = overrides.clm ?? "CLM-0001";
  const subject = overrides.subject ?? "TASK.T0001";
  const verdict = overrides.verdict ?? "VERIFIED";
  const recomputed = overrides.selfApproved === true
    ? { actor_type: "agent", actor: "demo-builder" }
    : { actor_type: "tool", actor: "verifier@0.1.0" };
  return {
    record_type: "claim",
    clm,
    subject: {
      object_id: subject,
      ...(overrides.acceptanceIndex !== undefined
        ? { acceptance_index: overrides.acceptanceIndex }
        : {}),
    },
    is_fixture: subject.startsWith("TEST."),
    assertion: "TASK_ACCEPTANCE_VERIFIED：行为 X 经独立重算确认",
    asserted_by: { actor_type: "agent", actor: "demo-builder", self_attested: true },
    evidence_refs: [{ ref_type: "gate_result", grn: "GRN-0001" }],
    verification: {
      verdict,
      ...(verdict === "VERIFIED"
        ? {
            method: "recompute",
            recomputed_by: { ...recomputed, self_attested: false },
            recomputed_value: { ok: true },
            delta_vs_asserted: null,
            at_seq: 3,
          }
        : {}),
    },
    rev: 1,
    notes_md: null,
  };
}

function seedClaim(overrides: Parameters<typeof claimFixture>[0]): void {
  const clm = overrides.clm ?? "CLM-0001";
  const dir = join(root, ".pomaster", "evidence", "claims");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${clm}.json`), `${JSON.stringify(claimFixture(overrides), null, 2)}\n`);
}

function runFixture(overrides: {
  readonly grn?: string;
  readonly subject?: string | null;
  readonly gate?: string;
  readonly verdict?: string;
  readonly ranAtSeq?: number;
} = {}): Record<string, unknown> {
  const grn = overrides.grn ?? "GRN-0001";
  const verdict = overrides.verdict ?? "passed";
  const ranAtSeq = overrides.ranAtSeq ?? 3;
  const violations = verdict === "passed" ? 0 : 2;
  return {
    record_type: "run",
    grn,
    ran_at_seq: ranAtSeq,
    trigger: { type: "pre_closeout" },
    gate_result: {
      mode: "inline",
      result: {
        grn,
        gate: overrides.gate ?? "BUILD",
        gate_def: "POLICY.GATE.BUILD@0.1.0",
        tool: "demo:build",
        tool_version: "0.1.0",
        metric_dialect: "demo:case_count",
        ran_at_seq: ranAtSeq,
        verdict,
        subject_id: overrides.subject === undefined ? "TASK.T0001" : overrides.subject,
        is_fixture: (overrides.subject ?? "TASK.T0001").startsWith("TEST."),
        denominator_refs: [],
        counts: { scanned: 2, applicable_scanned: 2, violations, not_applicable: 0 },
        blindspot: { scanned: 2, produced: 2, escape_ratio: 0 },
        trust: { asserted: null, recomputed: { violations, matches_asserted: true } },
        duration_ms: { self: 1, external: 0 },
      },
    },
  };
}

function seedRun(overrides: Parameters<typeof runFixture>[0]): void {
  const grn = overrides.grn ?? "GRN-0001";
  const dir = join(root, ".pomaster", "evidence", "runs");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${grn}.json`), `${JSON.stringify(runFixture(overrides), null, 2)}\n`);
}

/** 基线：acceptance/claim/run 三件套全绿（acceptance 轨可独立成立）。 */
async function seedHappyBaseline(): Promise<void> {
  await initStore();
  await seedTask();
  seedClaim({});
  seedRun({});
}

// ============================================================
// R1/D6：Spec 维度判卷
// ============================================================

describe("closeout DoD Spec 维度（R1/D6：资格判定非引用映射）", () => {
  it("绑定 CURRENT Spec + 条款资格成立 → COMPLETED（dod.spec 分账 satisfied；Spec 不持判定——判定值来自 claims/runs）", async () => {
    await seedHappyBaseline();
    await seedSpec({
      clauses: [clauseFixture({ claimRefs: ["CLM-0001"], gateRefs: ["GRN-0001"] })],
    });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as CloseoutResult;
    expect(result.change).toBe("COMPLETED");
    expect(result.dod?.spec).not.toBe(null);
    expect(result.dod?.spec?.bound_spec_refs).toEqual(["SPEC.CALC_EXPORT_EVIDENCE"]);
    expect(result.dod?.spec?.clauses_satisfied).toBe(1);
    expect(result.dod?.spec?.entries[0]?.ok).toBe(true);
    expect(result.dod?.spec?.entries[0]?.satisfied_by).toBe("claim CLM-0001");
  });

  it("资格清单内 claim 全不成立（悬空/subject 失配——挪证缝收口）→ DOD_SPEC_CLAUSE_UNSATISFIED 阻断零写入", async () => {
    await seedHappyBaseline();
    // CLM-0002 VERIFIED 但 subject 是别的对象：清单内引用但资格归属不成立（跨对象借证）。
    seedClaim({ clm: "CLM-0002", subject: "CAPABILITY.OTHER.THING" });
    await seedSpec({
      clauses: [clauseFixture({ claimRefs: ["CLM-0002"] })],
    });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    const codes = outcome.errors.map((e) => e.code);
    expect(codes).toContain("DOD_SPEC_CLAUSE_UNSATISFIED");
    const specError = outcome.errors.find((e) => e.code === "DOD_SPEC_CLAUSE_UNSATISFIED");
    expect(specError?.message).toContain("资格归属");
    const result = outcome.result as CloseoutResult;
    expect(result.change).toBe(null); // 零写入
    expect(result.dod?.spec?.clauses_satisfied).toBe(0);
  });

  it("空资格清单 → DOD_SPEC_CLAUSE_UNSATISFIABLE（禁「任意 VERIFIED claim 皆可」洗白）", async () => {
    await seedHappyBaseline();
    await seedSpec({
      clauses: [clauseFixture({ claimRefs: [], gateRefs: [] })],
    });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((e) => e.code)).toContain("DOD_SPEC_CLAUSE_UNSATISFIABLE");
  });

  it("自批 VERIFIED claim 不满足条款（O-W1-3 同线：资格清单不是自批洗白通道）→ DOD_SPEC_CLAUSE_UNSATISFIED 点名自批", async () => {
    await seedHappyBaseline(); // acceptance 轨的 CLM-0001 主体分离照常成立
    seedClaim({ clm: "CLM-0002", selfApproved: true }); // 条款资格清单引用自批 claim
    await seedSpec({
      clauses: [clauseFixture({ claimRefs: ["CLM-0002"] })],
    });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((e) => e.code)).toContain("DOD_SPEC_CLAUSE_UNSATISFIED");
    const unsatisfied = outcome.errors.find((e) => e.code === "DOD_SPEC_CLAUSE_UNSATISFIED");
    expect(unsatisfied?.message).toContain("CLM-0002");
    expect(unsatisfied?.message).toContain("自批");
    const result = outcome.result as CloseoutResult;
    expect(result.dod?.spec?.clauses_satisfied).toBe(0);
    expect(result.change).toBeNull(); // 零写入
  });

  it("gate 资格引用成立可满足条款（subject 全等 + passed）；gate 资格 subject 失配 → DOD_SPEC_GATE_SUBJECT_MISMATCH", async () => {
    await seedHappyBaseline();
    // 无 claim 资格；gate 资格 subject 绑定别的对象 → 条款不成立。
    seedRun({ grn: "GRN-0002", subject: "CAPABILITY.OTHER.THING", gate: "CONTRACT" });
    await seedSpec({
      clauses: [clauseFixture({ claimRefs: [], gateRefs: ["GRN-0002"] })],
    });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((e) => e.code)).toContain("DOD_SPEC_GATE_SUBJECT_MISMATCH");
  });

  it("无注记 claim 跨条款双消费 → 挪证通道显式呈现（与 acceptance 侧同形——机制衔接）", async () => {
    await seedHappyBaseline();
    seedClaim({ clm: "CLM-0002", subject: "TASK.T0001" });
    await seedSpec({
      clauses: [
        clauseFixture({ clauseId: "R1", claimRefs: ["CLM-0002"] }),
        clauseFixture({ clauseId: "R2", claimRefs: ["CLM-0002"] }),
      ],
    });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errors.map((e) => e.code)).toContain("DOD_SPEC_CLAUSE_UNSATISFIED");
    const detail = outcome.errors
      .filter((e) => e.code === "DOD_SPEC_CLAUSE_UNSATISFIED")
      .map((e) => e.message)
      .join("\n");
    expect(detail).toContain("挪证通道");
  });

  it("非 CURRENT 绑定 Spec → SPEC_NOT_BINDING warning 显式呈现不判卷（COMPLETED 仍可）", async () => {
    await seedHappyBaseline();
    await seedSpec({
      lifecycle: "DEPRECATED",
      clauses: [clauseFixture({ claimRefs: ["CLM-9999"] })],
    });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings.map((w) => w.code)).toContain("SPEC_NOT_BINDING");
    const result = outcome.result as CloseoutResult;
    expect(result.change).toBe("COMPLETED");
  });

  it("change 绑定通路：bound_change_ref 命中 task payload.implements_change → 同样进入判卷分母", async () => {
    await initStore();
    // task 携 implements_change=CHANGE.C0001（payload 自由区既有词位——02b task_object）。
    const store = await createStore(root);
    await applyTransaction(store, {
      ops: [
        {
          op: "upsert_object",
          envelope: {
            id: "TASK.T0001",
            kind: "task_object",
            axisProfile: "task_default",
            axes: { lifecycle: "CURRENT", confidence: "PROVISIONAL", evidence: "IMPLEMENTED", change: "STABLE" },
            titleZh: "示例任务",
            authority: { owner: "BUSINESS_OWNER", delegates: [] },
            origin: "natural",
            payload: {
              intent: "验证 change 绑定通路",
              implements_change: "CHANGE.C0001",
              acceptance: [{ criterion: "行为 X 已被独立验证", claim: "CLM-0001" }],
              class_scan_result: {
                scope: "src/shared/**",
                hits: 0,
                fixed_count: 0,
                regression_case_ref: "GRN-0001",
              },
            },
          } as never,
        },
      ],
    });
    seedClaim({});
    seedRun({});
    await seedSpec({
      boundTaskRef: null,
      boundChangeRef: "CHANGE.C0001",
      clauses: [clauseFixture({ claimRefs: ["CLM-0001"] })],
    });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as CloseoutResult;
    expect(result.dod?.spec?.bound_spec_refs).toEqual(["SPEC.CALC_EXPORT_EVIDENCE"]);
  });

  it("无 Spec 绑定 → dod.spec === null（双轨过渡——acceptance 轨独跑，行为与 Batch 2 前一致）", async () => {
    await seedHappyBaseline();
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(true);
    const result = outcome.result as CloseoutResult;
    expect(result.dod?.spec).toBe(null);
    expect(result.change).toBe("COMPLETED");
  });
});

// ============================================================
// 审计 F5 回归：gate 资格候选聚合（置换不变 + 重跑覆盖 + 损坏分离）
// ============================================================

/** F5 场景夹具：acceptance 轨绿（VERIFIED claim）；Spec 条款只持 gate 资格清单。 */
async function seedF5Scenario(gateRefs: readonly string[]): Promise<void> {
  await initStore();
  await seedTask();
  seedClaim({});
  await seedSpec({
    clauses: [clauseFixture({ claimRefs: [], gateRefs: [...gateRefs] })],
  });
}

describe("closeout DoD Spec gate 资格候选聚合（审计 F5：置换不变 + 重跑覆盖）", () => {
  it("审计复现回归：同 gate 旧 failed + 新 passed 候选任意排列 → 条款 1/1、无 DOD_SPEC_GATE_NOT_PASSED、重跑通过覆盖旧失败（置换不变）", async () => {
    const permutations: readonly (readonly string[])[] = [
      ["GRN-0001", "GRN-0002"],
      ["GRN-0002", "GRN-0001"],
      ["GRN-0002", "GRN-0001", "GRN-0001"],
    ];
    const observations: {
      readonly ok: boolean;
      readonly clauses_total: number | undefined;
      readonly clauses_satisfied: number | undefined;
      readonly satisfied_by: string | null | undefined;
      readonly errorCodes: readonly string[];
      readonly warningCodes: readonly string[];
    }[] = [];
    for (const gateRefs of permutations) {
      // 每个排列独立全新 store（候选集合相同，仅 gate_refs 排列不同）。
      rmSync(root, { recursive: true, force: true });
      root = mkdtempSync(join(tmpdir(), "pomaster-cli-closeout-spec-f5-"));
      await seedF5Scenario(gateRefs);
      seedRun({ grn: "GRN-0001", gate: "BUILD", verdict: "failed", ranAtSeq: 3 });
      seedRun({ grn: "GRN-0002", gate: "BUILD", verdict: "passed", ranAtSeq: 9 });
      const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
      expect(outcome.ok).toBe(true);
      const result = outcome.result as CloseoutResult;
      expect(result.dod?.spec?.clauses_total).toBe(1);
      expect(result.dod?.spec?.clauses_satisfied).toBe(1);
      expect(result.dod?.spec?.entries).toHaveLength(1);
      expect(result.dod?.spec?.entries[0]?.ok).toBe(true);
      expect(result.dod?.spec?.entries[0]?.satisfied_by).toBe("gate GRN-0002");
      expect(result.change).toBe("COMPLETED");
      observations.push({
        ok: outcome.ok,
        clauses_total: result.dod?.spec?.clauses_total,
        clauses_satisfied: result.dod?.spec?.clauses_satisfied,
        satisfied_by: result.dod?.spec?.entries[0]?.satisfied_by,
        errorCodes: outcome.errors.map((error) => error.code),
        warningCodes: outcome.warnings.map((warning) => warning.code),
      });
    }
    // 置换不变性：clauses_total / clauses_satisfied / satisfied_by / 错误集全排列一致。
    for (const observation of observations.slice(1)) {
      expect(observation).toEqual(observations[0]);
    }
  });

  it("重跑方向语义：新 failed（ran_at_seq 大）+ 旧 passed（ran_at_seq 小）→ 条款不满足（最新判卷裁决，旧通过不洗白）且分母计一条", async () => {
    await seedF5Scenario(["GRN-0001", "GRN-0002"]);
    seedRun({ grn: "GRN-0001", gate: "BUILD", verdict: "passed", ranAtSeq: 3 });
    seedRun({ grn: "GRN-0002", gate: "BUILD", verdict: "failed", ranAtSeq: 9 });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    const notPassed = outcome.errors.filter((error) => error.code === "DOD_SPEC_GATE_NOT_PASSED");
    expect(notPassed).toHaveLength(1); // 一条条款一处阻断，不逐 GRN 重复计入
    expect(notPassed[0]?.message).toContain("GRN-0002"); // 点名最新判卷
    const result = outcome.result as CloseoutResult;
    expect(result.dod?.spec?.clauses_total).toBe(1);
    expect(result.dod?.spec?.clauses_satisfied).toBe(0);
    expect(result.dod?.spec?.entries).toHaveLength(1);
    expect(result.dod?.spec?.entries[0]?.ok).toBe(false);
    expect(result.change).toBeNull();
  });

  it("多 gate 候选（不同 gate）：任一 gate 最新判卷 passed 即满足条款（资格 OR——另一 gate 最新 failed 不推翻本条款，由 subject 级 gate 维度另行阻断）", async () => {
    await seedF5Scenario(["GRN-0002", "GRN-0001"]);
    seedRun({ grn: "GRN-0001", gate: "BUILD", verdict: "passed", ranAtSeq: 3 });
    seedRun({ grn: "GRN-0002", gate: "CONTRACT", verdict: "failed", ranAtSeq: 9 });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.errors.map((error) => error.code)).toContain("GATE_FAILED"); // subject 级 gate 维度
    expect(outcome.errors.map((error) => error.code)).not.toContain("DOD_SPEC_GATE_NOT_PASSED");
    const result = outcome.result as CloseoutResult;
    expect(result.dod?.spec?.clauses_satisfied).toBe(1);
    expect(result.dod?.spec?.entries[0]?.satisfied_by).toBe("gate GRN-0001");
  });

  it("同 ran_at_seq 平局按 GRN 序取最新（与 subject 级 gate 维度同规则）", async () => {
    await seedF5Scenario(["GRN-0002", "GRN-0001"]);
    seedRun({ grn: "GRN-0001", gate: "BUILD", verdict: "passed", ranAtSeq: 3 });
    seedRun({ grn: "GRN-0002", gate: "BUILD", verdict: "failed", ranAtSeq: 3 });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.errors.map((error) => error.code)).toContain("DOD_SPEC_GATE_NOT_PASSED");
    const result = outcome.result as CloseoutResult;
    expect(result.dod?.spec?.clauses_satisfied).toBe(0);
  });

  it("证据结构损坏与候选未满足分离：引用不存在 GRN → 仅 EVIDENCE_MALFORMED，无 DOD_SPEC_GATE_NOT_PASSED / UNSATISFIED；条款分母仍计一条", async () => {
    await seedF5Scenario(["GRN-9999"]);
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    const codes = outcome.errors.map((error) => error.code);
    expect(codes).toContain("EVIDENCE_MALFORMED");
    expect(codes).not.toContain("DOD_SPEC_GATE_NOT_PASSED");
    expect(codes).not.toContain("DOD_SPEC_CLAUSE_UNSATISFIED");
    const result = outcome.result as CloseoutResult;
    expect(result.dod?.spec?.clauses_total).toBe(1);
    expect(result.dod?.spec?.clauses_satisfied).toBe(0);
    expect(result.dod?.spec?.entries).toHaveLength(1);
  });

  it("损坏候选不静默：损坏引用 + 合格 passed 候选 → 条款满足但 EVIDENCE_MALFORMED 仍独立阻断（两码位不混算不互抵）", async () => {
    await seedF5Scenario(["GRN-9999", "GRN-0002", "GRN-0001"]);
    seedRun({ grn: "GRN-0001", gate: "BUILD", verdict: "failed", ranAtSeq: 3 });
    seedRun({ grn: "GRN-0002", gate: "BUILD", verdict: "passed", ranAtSeq: 9 });
    const outcome = await runCloseout(root, { taskId: "TASK.T0001" });
    expect(outcome.ok).toBe(false);
    const codes = outcome.errors.map((error) => error.code);
    expect(codes).toContain("EVIDENCE_MALFORMED");
    expect(codes).not.toContain("DOD_SPEC_GATE_NOT_PASSED");
    const result = outcome.result as CloseoutResult;
    expect(result.dod?.spec?.clauses_total).toBe(1);
    expect(result.dod?.spec?.clauses_satisfied).toBe(1);
    expect(result.dod?.spec?.entries[0]?.satisfied_by).toBe("gate GRN-0002");
  });
});
