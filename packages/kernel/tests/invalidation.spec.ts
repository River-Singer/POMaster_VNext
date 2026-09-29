/**
 * invalidation.spec.ts —— 失效后果分类 + projection freshness 单点判卷 +
 * Authority 冲突呈现 + 稳定引用解析（W3 切片 FR-06/07/08/12；Case A/B/G 判据面）。
 *
 * 判据锚（PRD W3 / research dependency-authority-and-routing.md §4-§5）：
 * - 后果五分类闭包（recompile/REBIND/requalify/review/no-current-task-impact）+
 *   why 理由链（上游指纹变化点 + 命中边）；自动失效 ≠ 自动决策——不改 Human
 *   Decision 字节、不自动 REBIND 到猜测答案（本面零写入零裁决输出）；
 * - freshness 单点判卷（复用 Context inputs_fingerprint/STALE_GROUNDING 模式——
 *   禁第二指纹算法）；旧 generated 未重建 stale 拒当 current authority；历史产物
 *   无指纹记录 unjudgeable（禁事后补当前指纹冒充历史基线）；
 * - Authority 同 scope/dimension 双 canonical → Conflict + provenance；supersession
 *   显式声明才消歧；不按 mtime/文件名/自称 canonical 静默选胜者（H 审计建议不采纳）；
 *   冲突呈现与 Human 裁决通路分离；
 * - 稳定引用：semantic ID 承载机器关系；path/span/line 只导航；line-only/无法解析
 *   显式 unknown 不猜测升级（AC-09；与 W4 PROTOCOL.* 约定对齐）。
 */
import { describe, expect, it } from "vitest";
import {
  FRESHNESS_ADAPTED_PRODUCERS,
  FRESHNESS_UNADAPTED_PRODUCERS,
  INVALIDATION_CONSEQUENCE_VALUES,
  PROJECTION_FRESHNESS_STATES,
  STABLE_REFERENCE_KINDS,
  classifyConsequence,
  deriveAuthorityConflicts,
  deriveInvalidationRows,
  deriveImpactClosure,
  judgeProjectionFreshness,
  resolveStableReference,
  type AuthorityClaimInput,
  type DeriveImpactInput,
} from "@pomaster/kernel";

// ============================================================
// fixture
// ============================================================

function bpChangeInput(): DeriveImpactInput {
  return {
    relations: [],
    sources: [{ source_id: "bp-carline", version: "v1" }],
    objects: [
      {
        id: "PAGE.CARLINE",
        rev: 3,
        body_sha256: "sha256:" + "a".repeat(64),
        payload_source_refs: ["bp-carline"],
        denominator_refs: [],
        implements_change: null,
      },
      {
        id: "SPEC.CARLINE.COVERAGE",
        rev: 1,
        body_sha256: null,
        payload_source_refs: ["bp-carline"],
        denominator_refs: [],
        implements_change: null,
      },
    ],
    decisionGraphs: [
      {
        discovery_id: "pad-carline",
        decisions: [
          { decision_id: "DECISION.D1", depends_on: [], affects: ["PAGE.CARLINE"] },
        ],
      },
    ],
    generated: [
      { generated_id: "PAGE.CARLINE.context.json", input_refs: ["PAGE.CARLINE"] },
    ],
  };
}

const BP_CHANGE = {
  root: { plane: "source" as const, id: "bp-carline" },
  revision_before: "v1",
  revision_after: "v2",
};

// ============================================================
// 后果分类（五分类闭包 + why 理由链；自动失效≠自动决策）
// ============================================================

describe("后果分类（INVALIDATION_CONSEQUENCE_VALUES 五闭包）", () => {
  it("五分类词形闭包（PRD W3 逐字：recompile/REBIND/requalify/review/no-current-task-impact）", () => {
    expect([...INVALIDATION_CONSEQUENCE_VALUES]).toEqual([
      "recompile",
      "REBIND",
      "requalify",
      "review",
      "no-current-task-impact",
    ]);
  });

  it("generated 平面 → recompile；discovery 平面 → review；SPEC.* → requalify；其余 → REBIND", () => {
    expect(classifyConsequence({ plane: "generated", id: "PAGE.CARLINE.context.json" }).consequence).toBe("recompile");
    expect(classifyConsequence({ plane: "discovery", id: "DECISION.D1" }).consequence).toBe("review");
    expect(classifyConsequence({ plane: "truth", id: "SPEC.CARLINE.COVERAGE" }).consequence).toBe("requalify");
    expect(classifyConsequence({ plane: "truth", id: "PAGE.CARLINE" }).consequence).toBe("REBIND");
    expect(classifyConsequence({ plane: "source", id: "bp-other" }).consequence).toBe("REBIND");
  });

  it("taskScope 在场且行不在范围 → no-current-task-impact（保守合同：无依赖证明≠证明无影响——行仍在闭包呈现）", () => {
    expect(
      classifyConsequence(
        { plane: "truth", id: "PAGE.OTHER" },
        { taskScope: ["PAGE.CARLINE"] },
      ).consequence,
    ).toBe("no-current-task-impact");
    expect(
      classifyConsequence({ plane: "truth", id: "PAGE.CARLINE" }, { taskScope: ["PAGE.CARLINE"] })
        .consequence,
    ).toBe("REBIND");
  });

  it("taskScope 缺席 → 全部按受影响呈现（不做任务二分——无申报不猜测）", () => {
    expect(classifyConsequence({ plane: "truth", id: "PAGE.ANY" }).consequence).toBe("REBIND");
  });
});

describe("deriveInvalidationRows（闭包 × 后果分类整合；why 理由链）", () => {
  it("rows 覆盖四平面下游 + 每行携带 why（上游变化点 revision before/after + 命中边）", () => {
    const result = deriveInvalidationRows(bpChangeInput(), BP_CHANGE);
    const ids = result.rows.map((row) => row.id);
    expect(ids).toContain("PAGE.CARLINE");
    expect(ids).toContain("SPEC.CARLINE.COVERAGE");
    expect(ids).toContain("DECISION.D1");
    expect(ids).toContain("PAGE.CARLINE.context.json");
    const page = result.rows.find((row) => row.id === "PAGE.CARLINE");
    expect(page?.why.upstream_change).toEqual({
      root: { plane: "source", id: "bp-carline" },
      revision_before: "v1",
      revision_after: "v2",
    });
    expect(page?.why.hit_edge.kind).toBe("PAYLOAD_SOURCE_REF");
    expect(page?.why.hit_edge.depth).toBe(1);
    expect(page?.consequence).toBe("REBIND");
  });

  it("后果分类逐行正确：generated=recompile / SPEC=requalify / DECISION=review / PAGE=REBIND", () => {
    const result = deriveInvalidationRows(bpChangeInput(), BP_CHANGE);
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    expect(byId.get("PAGE.CARLINE.context.json")?.consequence).toBe("recompile");
    expect(byId.get("SPEC.CARLINE.COVERAGE")?.consequence).toBe("requalify");
    expect(byId.get("DECISION.D1")?.consequence).toBe("review");
    expect(byId.get("PAGE.CARLINE")?.consequence).toBe("REBIND");
  });

  it("自动失效≠自动决策：review 行 requires_human=true 且零写入零裁决输出（不改 Human Decision 字节）", () => {
    const result = deriveInvalidationRows(bpChangeInput(), BP_CHANGE);
    const decision = result.rows.find((row) => row.id === "DECISION.D1");
    expect(decision?.requires_human).toBe(true);
    expect(decision?.disposition_note).toContain("不自动改");
    // REBIND 行同样不自动执行——失效只声明「旧结论不能直接再用」。
    const page = result.rows.find((row) => row.id === "PAGE.CARLINE");
    expect(page?.requires_human).toBe(false);
    expect(page?.disposition_note).toContain("不自动");
  });

  it("taskScope 传入 → 无关行 no-current-task-impact（行保留呈现不过滤）；范围行正常分类", () => {
    const result = deriveInvalidationRows(bpChangeInput(), BP_CHANGE, {
      taskScope: ["PAGE.CARLINE"],
    });
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    expect(byId.get("PAGE.CARLINE")?.consequence).toBe("REBIND");
    expect(byId.get("SPEC.CARLINE.COVERAGE")?.consequence).toBe("no-current-task-impact");
    // 相关语义的 unknown/review 不被过滤：范围外 review 行仍呈现（保留可见性）。
    expect(byId.get("DECISION.D1")?.consequence).toBe("no-current-task-impact");
    expect(byId.has("DECISION.D1")).toBe(true);
  });
});

// ============================================================
// projection freshness（单点判卷；Context STALE_GROUNDING 模式复用）
// ============================================================

describe("judgeProjectionFreshness（四态；旧 generated 未重建拒当 current authority）", () => {
  it("四态词形闭包（fresh/stale_grounding/absent/unjudgeable——Context 三态 + unjudgeable）", () => {
    expect([...PROJECTION_FRESHNESS_STATES]).toEqual([
      "fresh",
      "stale_grounding",
      "absent",
      "unjudgeable",
    ]);
  });

  it("同指纹 → fresh（eligible）；漂移 → stale_grounding（eligible=false——STALE_GROUNDING 词形）", () => {
    const fresh = judgeProjectionFreshness({
      artifact_present: true,
      recorded_inputs_fingerprint: "sha256:" + "1".repeat(64),
      recomputed_inputs_fingerprint: "sha256:" + "1".repeat(64),
    });
    expect(fresh.state).toBe("fresh");
    expect(fresh.current_authority_eligible).toBe(true);
    const stale = judgeProjectionFreshness({
      artifact_present: true,
      recorded_inputs_fingerprint: "sha256:" + "1".repeat(64),
      recomputed_inputs_fingerprint: "sha256:" + "2".repeat(64),
    });
    expect(stale.state).toBe("stale_grounding");
    expect(stale.current_authority_eligible).toBe(false);
    expect(stale.detail).toContain("STALE_GROUNDING");
  });

  it("产物缺席 → absent；历史产物无指纹记录 → unjudgeable（禁事后补指纹冒充历史基线）", () => {
    const absent = judgeProjectionFreshness({
      artifact_present: false,
      recorded_inputs_fingerprint: null,
      recomputed_inputs_fingerprint: null,
    });
    expect(absent.state).toBe("absent");
    expect(absent.current_authority_eligible).toBe(false);
    const unjudgeable = judgeProjectionFreshness({
      artifact_present: true,
      recorded_inputs_fingerprint: null,
      recomputed_inputs_fingerprint: "sha256:" + "3".repeat(64),
    });
    expect(unjudgeable.state).toBe("unjudgeable");
    expect(unjudgeable.current_authority_eligible).toBe(false);
    expect(unjudgeable.detail).toContain("历史");
  });

  it("消费端无法重算（recomputed=null）→ unjudgeable（非绿不假绿）", () => {
    const result = judgeProjectionFreshness({
      artifact_present: true,
      recorded_inputs_fingerprint: "sha256:" + "1".repeat(64),
      recomputed_inputs_fingerprint: null,
    });
    expect(result.state).toBe("unjudgeable");
    expect(result.current_authority_eligible).toBe(false);
  });

  it("producer 接入清单：adapted 非空、unadapted 显式登记（readiness/handoff/reconciliation 诚实清单）", () => {
    expect(FRESHNESS_ADAPTED_PRODUCERS.length).toBeGreaterThanOrEqual(1);
    expect(FRESHNESS_ADAPTED_PRODUCERS.join(" ")).toContain("context manifest");
    expect(FRESHNESS_UNADAPTED_PRODUCERS.length).toBeGreaterThanOrEqual(3);
    const joined = FRESHNESS_UNADAPTED_PRODUCERS.join(" ");
    expect(joined).toContain("readiness");
    expect(joined).toContain("handoff");
    expect(joined).toContain("reconciliation");
  });
});

// ============================================================
// Authority 冲突（同 scope/dimension 双 canonical；呈现与裁决分离）
// ============================================================

function claim(overrides: Partial<AuthorityClaimInput>): AuthorityClaimInput {
  return {
    source_id: overrides.source_id ?? "bp-a",
    type: "bp_prototype",
    location: "prototypes/a/index.html",
    version: null,
    authoritative_for: ["business_information"],
    superseded_by: null,
    owner_evidence: null,
    ...overrides,
  };
}

describe("deriveAuthorityConflicts（Case G；不按 mtime/文件名/自称 canonical 选胜者）", () => {
  it("同维度双 claim 无 supersession → conflicted + 双 claimant provenance 全显式 + 裁决通路（呈现与裁决分离）", () => {
    const result = deriveAuthorityConflicts([
      claim({ source_id: "bp-handbook-one", location: "docs/handbook-one.md", version: "2026-06" }),
      claim({ source_id: "bp-handbook-two", location: "docs/handbook-two.md", version: "2026-08" }),
    ]);
    expect(result.conflicts).toHaveLength(1);
    const conflict = result.conflicts[0];
    expect(conflict?.dimension).toBe("business_information");
    expect(conflict?.status).toBe("conflicted");
    expect(conflict?.claimants.map((c) => c.source_id).sort()).toEqual([
      "bp-handbook-one",
      "bp-handbook-two",
    ]);
    for (const claimant of conflict?.claimants ?? []) {
      expect(claimant.location.length).toBeGreaterThan(0);
      expect(claimant.version !== undefined).toBe(true);
    }
    expect(conflict?.adjudication_route).toContain("Owner");
    // 无 mtime、无文件名比较、无自称 canonical 判卷输入——胜者零猜测。
    expect(result.note).toContain("mtime");
    expect(result.note).toContain("不");
  });

  it("显式 supersession 声明指向对方 → superseded 消歧呈现（不报 conflict；取代者凭声明非猜测）", () => {
    const result = deriveAuthorityConflicts([
      claim({ source_id: "bp-v1", version: "v1", superseded_by: "bp-v2" }),
      claim({ source_id: "bp-v2", version: "v2" }),
    ]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.status).toBe("superseded");
    expect(result.conflicts[0]?.claimants.map((c) => c.source_id)).toContain("bp-v1");
  });

  it("双向互指 supersession = 矛盾声明 → conflicted（禁静默任选）", () => {
    const result = deriveAuthorityConflicts([
      claim({ source_id: "bp-x", superseded_by: "bp-y" }),
      claim({ source_id: "bp-y", superseded_by: "bp-x" }),
    ]);
    expect(result.conflicts[0]?.status).toBe("conflicted");
  });

  it("不同维度并存 → 合法共存零 conflict（不误报）；coexisting 计数在位", () => {
    const result = deriveAuthorityConflicts([
      claim({ source_id: "bp-biz", authoritative_for: ["business_information"] }),
      claim({ source_id: "css-baseline", type: "baseline", authoritative_for: ["css", "grid_library"] }),
    ]);
    expect(result.conflicts).toHaveLength(0);
    expect(result.coexisting).toBe(2);
  });

  it("单来源零冲突；三来源同维度 → 一条 conflict 含全部 claimant", () => {
    expect(deriveAuthorityConflicts([claim({})]).conflicts).toHaveLength(0);
    const triple = deriveAuthorityConflicts([
      claim({ source_id: "a" }),
      claim({ source_id: "b" }),
      claim({ source_id: "c" }),
    ]);
    expect(triple.conflicts).toHaveLength(1);
    expect(triple.conflicts[0]?.claimants).toHaveLength(3);
  });
});

// ============================================================
// 稳定引用（semantic ID 承载机器关系；path/span/line 只导航；AC-09）
// ============================================================

describe("resolveStableReference（semantic ID vs 导航位；line-only 显式 unknown）", () => {
  it("四类词形闭包（semantic_id/navigation_only/unresolvable）", () => {
    expect([...STABLE_REFERENCE_KINDS]).toEqual(["semantic_id", "navigation_only", "unresolvable"]);
  });

  it("governed id / PROTOCOL.*（W4 对齐）/ DECISION.* / 来源 id → semantic_id 且机器关系可用", () => {
    for (const ref of [
      "PAGE.CARLINE",
      "PROTOCOL.AG_GRID.EDIT_SAVE",
      "DECISION.D1",
      "bp-carline",
    ]) {
      const resolved = resolveStableReference(ref);
      expect(resolved.kind).toBe("semantic_id");
      expect(resolved.semantic_id).toBe(ref);
      expect(resolved.machine_relation_eligible).toBe(true);
      expect(resolved.unknown_reason).toBeNull();
    }
  });

  it("line-only / path-only 引用 → navigation_only + unknown 显式（不猜测升级为机器关系）", () => {
    const lineOnly = resolveStableReference("src/pages/carline/index.vue:42");
    expect(lineOnly.kind).toBe("navigation_only");
    expect(lineOnly.machine_relation_eligible).toBe(false);
    expect(lineOnly.unknown_reason).toContain("unknown");
    const pathOnly = resolveStableReference("docs/bp-handbook.md");
    expect(pathOnly.kind).toBe("navigation_only");
    expect(pathOnly.machine_relation_eligible).toBe(false);
    expect(pathOnly.unknown_reason).toContain("unknown");
  });

  it("空引用 → unresolvable（显式非静默）", () => {
    const resolved = resolveStableReference("");
    expect(resolved.kind).toBe("unresolvable");
    expect(resolved.machine_relation_eligible).toBe(false);
  });

  it("AC-09：插入行后 semantic ID 关系保持——闭包边身份不含 line/locator（同三元组同 DXE id）", () => {
    const before: DeriveImpactInput = {
      relations: [],
      sources: [{ source_id: "bp", version: "v1" }],
      objects: [
        {
          id: "PAGE.X",
          rev: 1,
          body_sha256: null,
          payload_source_refs: ["bp"],
          denominator_refs: [],
          implements_change: null,
        },
      ],
      decisionGraphs: [],
      generated: [],
    };
    const closureBefore = deriveImpactClosure(before, { plane: "source", id: "bp" });
    // 模拟插入行后重扫：同一引用关系不变（对象行仍引用 bp），仅 rev 前移（导航位变化）。
    const after: DeriveImpactInput = {
      ...before,
      objects: [
        {
          id: "PAGE.X",
          rev: 2,
          body_sha256: "sha256:" + "b".repeat(64),
          payload_source_refs: ["bp"],
          denominator_refs: [],
          implements_change: null,
        },
      ],
    };
    const closureAfter = deriveImpactClosure(after, { plane: "source", id: "bp" });
    expect(closureAfter.rows[0]?.via_edge_id).toBe(closureBefore.rows[0]?.via_edge_id);
    // 导航位更新（rev 变化）不破坏机器关系；line-only 历史引用不被静默升级。
    expect(resolveStableReference("src/pages/carline/index.vue:42").machine_relation_eligible).toBe(false);
  });
});
