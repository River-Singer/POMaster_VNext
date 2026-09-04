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
}): Record<string, unknown> {
  const clm = overrides.clm ?? "CLM-0001";
  const subject = overrides.subject ?? "TASK.T0001";
  const verdict = overrides.verdict ?? "VERIFIED";
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
            recomputed_by: { actor_type: "tool", actor: "verifier@0.1.0", self_attested: false },
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
} = {}): Record<string, unknown> {
  const grn = overrides.grn ?? "GRN-0001";
  const verdict = overrides.verdict ?? "passed";
  const violations = verdict === "passed" ? 0 : 2;
  return {
    record_type: "run",
    grn,
    ran_at_seq: 3,
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
        ran_at_seq: 3,
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
