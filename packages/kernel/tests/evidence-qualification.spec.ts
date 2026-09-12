/**
 * evidence-qualification.spec.ts —— 证据绑定资格链判定核（W1 R1-5 切片；09-10 PRD
 * REQ-06 + AC-04 三反例；evidence-invalidation-map §5-1/§5-4/§5-5）。
 *
 * 验收主体 = 纯函数核逐轴钉测：
 * - QUALIFIED 正例 + 轴边界（seq 相等合格 / 锚缺席不适用 / gate 不在册不适用）；
 * - STALE_SEQ（证据锚早于 baseline 确认 at_seq）；PERMIT_INVALIDATED（execution_id
 *   直配 + permit_ref ∈ executions/ permit_ids 双通道）；ORACLE_SUPERSEDED（gate_def
 *   版本取代 + oracle_ref 不一致）；SUBJECT_MISMATCH；
 * - 判定优先级序（verdict 取首中否决轴；全部否决轴进 reason）；
 * - 输入合同 fail-closed（SCHEMA_INVALID：surface/事件词形闭包外、负 seq、AGX 词形
 *   外执行身份、批内 ref 重复）；
 * - 字节稳定（同输入 → 同 finding / 同 fingerprint；异输入 → 异 fingerprint）。
 */
import { describe, expect, it } from "vitest";
import {
  EVIDENCE_INVALIDATION_EVENT_TYPES,
  EVIDENCE_QUALIFICATION_SURFACES,
  EVIDENCE_QUALIFICATION_VERDICTS,
  qualifyEvidence,
  qualifyEvidenceBatch,
  type EvidenceInvalidationEvent,
  type EvidenceQualificationEvidence,
  type EvidenceQualificationRequirement,
} from "@pomaster/kernel";

// ============================================================
// fixture 构造器（全 null 默认 = 各轴显式不适用；逐测试开轴）
// ============================================================

function evidenceFixture(overrides: Partial<EvidenceQualificationEvidence> = {}): EvidenceQualificationEvidence {
  return {
    ref: "GRN-0001",
    surface: "run",
    captured_at_seq: null,
    gate: null,
    gate_def: null,
    oracle_ref: null,
    execution_id: null,
    subject: null,
    ...overrides,
  };
}

function requirementFixture(overrides: Partial<EvidenceQualificationRequirement> = {}): EvidenceQualificationRequirement {
  return {
    baseline_at_seq: null,
    invalidated_events: [],
    execution_permits: {},
    current_gate_defs: {},
    current_oracle_ref: null,
    subject: null,
    ...overrides,
  };
}

function eventFixture(overrides: Partial<EvidenceInvalidationEvent> = {}): EvidenceInvalidationEvent {
  return {
    type: "PERMIT_EXPIRED_OBSERVED",
    seq: 7,
    execution_id: null,
    permit_ref: null,
    ...overrides,
  };
}

// ============================================================
// 词形闭包
// ============================================================

describe("evidence-qualification 词形闭包", () => {
  it("verdict 五词形闭包：QUALIFIED 唯一合格词形 + 四否决词形（词族收编先例）", () => {
    expect(EVIDENCE_QUALIFICATION_VERDICTS).toEqual([
      "QUALIFIED",
      "STALE_SEQ",
      "PERMIT_INVALIDATED",
      "ORACLE_SUPERSEDED",
      "SUBJECT_MISMATCH",
    ]);
  });

  it("承载面三词形 + 失效事件三词形（producer 既有词：只消费零新增）", () => {
    expect(EVIDENCE_QUALIFICATION_SURFACES).toEqual(["run", "observation", "claim"]);
    expect(EVIDENCE_INVALIDATION_EVENT_TYPES).toEqual([
      "PERMIT_EXPIRED_OBSERVED",
      "PERMIT_STOLEN",
      "EXECUTION_INTERRUPTED",
    ]);
  });
});

// ============================================================
// 逐轴判定
// ============================================================

describe("evidence-qualification 逐轴判定", () => {
  it("QUALIFIED 正例：全轴对齐 → qualified=true 且 reason 为对齐摘要", () => {
    const finding = qualifyEvidence(
      evidenceFixture({ captured_at_seq: 5, gate: "BUILD", gate_def: "POLICY.GATE.BUILD@0.1.0" }),
      requirementFixture({
        baseline_at_seq: 5, // boundary 相等合格（§5-1：早于才否决）
        current_gate_defs: { BUILD: "POLICY.GATE.BUILD@0.1.0" },
      }),
    );
    expect(finding.qualified).toBe(true);
    expect(finding.verdict).toBe("QUALIFIED");
    expect(finding.reason).toContain("对齐");
  });

  it("STALE_SEQ：证据锚早于 baseline 确认 at_seq → 否决（§5-1 seq 比对）", () => {
    const finding = qualifyEvidence(
      evidenceFixture({ captured_at_seq: 3 }),
      requirementFixture({ baseline_at_seq: 5 }),
    );
    expect(finding.qualified).toBe(false);
    expect(finding.verdict).toBe("STALE_SEQ");
    expect(finding.reason).toContain("seq=3");
    expect(finding.reason).toContain("at_seq=5");
  });

  it("seq 轴诚实不适用：任一侧锚 null = 不判（零新字段纪律——锚缺席显式）", () => {
    const noBaseline = qualifyEvidence(
      evidenceFixture({ captured_at_seq: 3 }),
      requirementFixture({ baseline_at_seq: null }),
    );
    const noAnchor = qualifyEvidence(
      evidenceFixture({ captured_at_seq: null }),
      requirementFixture({ baseline_at_seq: 5 }),
    );
    expect(noBaseline.verdict).toBe("QUALIFIED");
    expect(noAnchor.verdict).toBe("QUALIFIED");
  });

  it("PERMIT_INVALIDATED 双通道：事件 execution_id 直配；事件 permit_ref ∈ 执行 permit_ids 绑定", () => {
    const direct = qualifyEvidence(
      evidenceFixture({ execution_id: "AGX-2026-00001" }),
      requirementFixture({
        invalidated_events: [
          eventFixture({ type: "EXECUTION_INTERRUPTED", seq: 9, execution_id: "AGX-2026-00001", permit_ref: null }),
        ],
      }),
    );
    expect(direct.verdict).toBe("PERMIT_INVALIDATED");
    expect(direct.reason).toContain("EXECUTION_INTERRUPTED");
    expect(direct.reason).toContain("AGX-2026-00001");

    const viaPermit = qualifyEvidence(
      evidenceFixture({ execution_id: "AGX-2026-00001" }),
      requirementFixture({
        invalidated_events: [eventFixture({ permit_ref: "PERMIT.X.1" })],
        execution_permits: { "AGX-2026-00001": ["PERMIT.X.1"] },
      }),
    );
    expect(viaPermit.verdict).toBe("PERMIT_INVALIDATED");
    expect(viaPermit.reason).toContain("PERMIT.X.1");
    expect(viaPermit.reason).toContain("permit_ids");
  });

  it("permit 轴不适用/不误伤：无挂载执行 / 事件 permit_ref 不在该执行绑定内 → 合格", () => {
    const noExecution = qualifyEvidence(
      evidenceFixture({}),
      requirementFixture({ invalidated_events: [eventFixture({ permit_ref: "PERMIT.X.1" })] }),
    );
    const unboundPermit = qualifyEvidence(
      evidenceFixture({ execution_id: "AGX-2026-00001" }),
      requirementFixture({
        invalidated_events: [eventFixture({ permit_ref: "PERMIT.X.9" })],
        execution_permits: { "AGX-2026-00001": ["PERMIT.X.1"] },
      }),
    );
    expect(noExecution.verdict).toBe("QUALIFIED");
    expect(unboundPermit.verdict).toBe("QUALIFIED");
  });

  it("ORACLE_SUPERSEDED 双通道：gate_def 被当前版本取代；oracle_ref 与当前要求不一致", () => {
    const gateDef = qualifyEvidence(
      evidenceFixture({ gate: "BUILD", gate_def: "POLICY.GATE.BUILD@0.0.9" }),
      requirementFixture({ current_gate_defs: { BUILD: "POLICY.GATE.BUILD@0.1.0" } }),
    );
    expect(gateDef.verdict).toBe("ORACLE_SUPERSEDED");
    expect(gateDef.reason).toContain("POLICY.GATE.BUILD@0.0.9");
    expect(gateDef.reason).toContain("POLICY.GATE.BUILD@0.1.0");

    const oracle = qualifyEvidence(
      evidenceFixture({ surface: "claim", ref: "CLM-0001", oracle_ref: "ORACLE.OLD@0.1.0" }),
      requirementFixture({ current_oracle_ref: "ORACLE.NEW@0.2.0" }),
    );
    expect(oracle.verdict).toBe("ORACLE_SUPERSEDED");
    expect(oracle.reason).toContain("ORACLE.OLD@0.1.0");
  });

  it("gate_def 轴诚实不适用：gate 不在注册面（自定义 gate 不冒充被取代）/ gate_def 缺席 → 合格", () => {
    const unregistered = qualifyEvidence(
      evidenceFixture({ gate: "ROUNDTRIP", gate_def: "POLICY.GATE.ROUNDTRIP@0.1.0" }),
      requirementFixture({ current_gate_defs: { BUILD: "POLICY.GATE.BUILD@0.1.0" } }),
    );
    const noGateDef = qualifyEvidence(
      evidenceFixture({ gate: "BUILD", gate_def: null }),
      requirementFixture({ current_gate_defs: { BUILD: "POLICY.GATE.BUILD@0.1.0" } }),
    );
    expect(unregistered.verdict).toBe("QUALIFIED");
    expect(noGateDef.verdict).toBe("QUALIFIED");
  });

  it("SUBJECT_MISMATCH：证据 subject 与要求 subject 不一致 → 否决（双侧在场才可比）", () => {
    const mismatch = qualifyEvidence(
      evidenceFixture({ subject: "TASK.T9999" }),
      requirementFixture({ subject: "TASK.T0001" }),
    );
    const axisOff = qualifyEvidence(
      evidenceFixture({ subject: "TASK.T9999" }),
      requirementFixture({ subject: null }),
    );
    expect(mismatch.verdict).toBe("SUBJECT_MISMATCH");
    expect(mismatch.reason).toContain("TASK.T9999");
    expect(axisOff.verdict).toBe("QUALIFIED");
  });

  it("判定优先级序：subject 首中 → verdict=SUBJECT_MISMATCH；全部否决轴进 reason 不降级遗漏", () => {
    const finding = qualifyEvidence(
      evidenceFixture({ subject: "TASK.T9999", captured_at_seq: 1, gate: "BUILD", gate_def: "POLICY.GATE.BUILD@0.0.1" }),
      requirementFixture({
        subject: "TASK.T0001",
        baseline_at_seq: 5,
        current_gate_defs: { BUILD: "POLICY.GATE.BUILD@0.1.0" },
      }),
    );
    expect(finding.verdict).toBe("SUBJECT_MISMATCH"); // 首中优先级
    expect(finding.reason).toContain("seq 轴"); // stale 轴细节在 reason
    expect(finding.reason).toContain("gate_def 轴"); // oracle 轴细节在 reason
  });
});

// ============================================================
// 输入合同 fail-closed + 批量入口
// ============================================================

describe("evidence-qualification fail-closed 与批量", () => {
  it("SCHEMA_INVALID：surface/事件词形闭包外、负 seq、AGX 词形外执行身份、批内 ref 重复", () => {
    expect(() =>
      qualifyEvidence(evidenceFixture({ surface: "screenshot" as never }), requirementFixture()),
    ).toThrowError(/承载面词形闭包/);
    expect(() =>
      qualifyEvidence(evidenceFixture({ execution_id: "EXEC-1" }), requirementFixture()),
    ).toThrowError(/AGX 词形/);
    expect(() =>
      qualifyEvidence(evidenceFixture({ captured_at_seq: -1 }), requirementFixture()),
    ).toThrowError(/非负整数/);
    expect(() =>
      qualifyEvidence(evidenceFixture(), requirementFixture({
        invalidated_events: [eventFixture({ type: "GATE_FAILED" as never })],
      })),
    ).toThrowError(/失效事件词形闭包/);
    expect(() =>
      qualifyEvidenceBatch(
        [evidenceFixture(), evidenceFixture()],
        requirementFixture(),
      ),
    ).toThrowError(/ref 重复/);
  });

  it("批量：findings 逐面输出 + qualified 聚合 + 空批合格（分母空置归调用方防线）", () => {
    const outcome = qualifyEvidenceBatch(
      [
        evidenceFixture({ ref: "GRN-0001", captured_at_seq: 3 }),
        evidenceFixture({ ref: "CLM-0001", surface: "claim", captured_at_seq: 5 }),
      ],
      requirementFixture({ baseline_at_seq: 5 }),
    );
    expect(outcome.qualified).toBe(false);
    expect(outcome.findings).toHaveLength(2);
    expect(outcome.findings[0]?.verdict).toBe("STALE_SEQ");
    expect(outcome.findings[1]?.verdict).toBe("QUALIFIED");

    const empty = qualifyEvidenceBatch([], requirementFixture({ baseline_at_seq: 5 }));
    expect(empty.qualified).toBe(true);
    expect(empty.findings).toEqual([]);
  });

  it("字节稳定：同输入 → 同 finding/同 fingerprint；异输入 → 异 fingerprint（A4 可重判前提）", () => {
    const requirement = requirementFixture({ baseline_at_seq: 5 });
    const a = qualifyEvidenceBatch([evidenceFixture({ captured_at_seq: 3 })], requirement);
    const b = qualifyEvidenceBatch([evidenceFixture({ captured_at_seq: 3 })], requirement);
    const c = qualifyEvidenceBatch([evidenceFixture({ captured_at_seq: 4 })], requirement);
    expect(a.inputs_fingerprint).toBe(b.inputs_fingerprint);
    expect(a.findings).toEqual(b.findings);
    expect(a.inputs_fingerprint).not.toBe(c.inputs_fingerprint);
  });
});
