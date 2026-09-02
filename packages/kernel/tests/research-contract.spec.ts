/**
 * research-contract.spec.ts —— Research Read-only Contract 写面判卷 + 五级 Evidence
 * 判卷语义 + Blueprint Acceptance Envelope 判卷（P18 · PRD §81.3/81.4/81.5/82.5）。
 *
 * 覆盖纪律：
 * - 写面：四文件内 artifact / research/ 内 scratch / 越写 FATAL 全谱（受治理面五前缀、
 *   盘符、绝对路径、.. 逃逸、换宿主、宿主词形）——「越写即 FATAL」对抗面。
 * - Evidence：五级词形全表 + 词表外三向 violation + CONFLICTS escalation（发现不是
 *   裁决）+ IMPLEMENTATION+SUPPORTS 未对账 warning（§81.5 Existence ≠ Correctness）
 *   + 六字段存在性（sources/caveats 缺失/空数组 violation；INFERENCE 空来源豁免对照
 *   ——P18 红队发现1「幻觉洗白」fail-closed 面）。
 * - Envelope：CONDITIONALLY_ACCEPTED 七条前提 a/b/c/d/f 机器判 + e/g 显式
 *   NOT_MACHINE_CHECKABLE + HARD_BLOCKER 聚合规则（ACCEPTED/CONDITIONALLY 双向）+
 *   msd_reached 双向派生一致 + BLOCKED/REJECTED SKIPPED 呈现。
 */
import { describe, expect, it } from "vitest";
import {
  RESEARCH_ARTIFACT_FILES,
  RESEARCH_FORBIDDEN_SURFACE_PREFIXES,
  adjudicateResearchFindings,
  checkResearchWriteContract,
  evaluateBlueprintEnvelope,
  type BlueprintEnvelopeInput,
  type ResearchFindingInput,
} from "@pomaster/kernel";

const HOST = ".pomaster/discovery/scratchpads/idea-carline-import/";

describe("checkResearchWriteContract（§81.3 写面判卷）", () => {
  it("四文件名逐字镜像（§81.6：index.yaml + 三个 md）", () => {
    expect(RESEARCH_ARTIFACT_FILES).toEqual([
      "index.yaml",
      "current-implementation.md",
      "external-options.md",
      "risks-and-caveats.md",
    ]);
  });

  it("四文件逐一判为 artifact_file（scratchpad 宿主）", () => {
    for (const f of RESEARCH_ARTIFACT_FILES) {
      const outcome = checkResearchWriteContract(HOST, `${HOST}research/${f}`);
      expect(outcome.allowed).toBe(true);
      if (outcome.allowed) {
        expect(outcome.kind).toBe("artifact_file");
        expect(outcome.relPath).toBe(`${HOST}research/${f}`);
      }
    }
  });

  it("task 宿主（tasks/TASK.T0087/）同样成立；尾斜杠缺省归一", () => {
    const outcome = checkResearchWriteContract("tasks/TASK.T0087", "tasks/TASK.T0087/research/index.yaml");
    expect(outcome.allowed).toBe(true);
  });

  it("research/ 内非四文件 = scratch（允许写但提示四文件契约）", () => {
    const outcome = checkResearchWriteContract(HOST, `${HOST}research/notes-draft.md`);
    expect(outcome.allowed).toBe(true);
    if (outcome.allowed) {
      expect(outcome.kind).toBe("scratch");
      expect(outcome.notes.join()).toContain("四文件");
    }
  });

  it("对抗：写业务代码（research/ 外）= FATAL outside_research_dir", () => {
    const outcome = checkResearchWriteContract(HOST, "src/pages/list.vue");
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) {
      expect(outcome.fatal).toBe(true);
      expect(outcome.reason).toBe("outside_research_dir");
      expect(outcome.hint).toContain("research/");
    }
  });

  it("对抗：换宿主（写别的 scratchpad）= FATAL outside_research_dir", () => {
    const outcome = checkResearchWriteContract(
      HOST,
      ".pomaster/discovery/scratchpads/idea-other/research/index.yaml",
    );
    expect(outcome.allowed).toBe(false);
    if (!outcome.allowed) expect(outcome.reason).toBe("outside_research_dir");
  });

  it("对抗：宿主词形非法（绝对盘符/根斜杠/../空）逐一 FATAL", () => {
    for (const [host, reason] of [
      ["D:\\tmp\\proj", "host_ref_invalid"],
      ["/abs/root", "host_ref_invalid"],
      ["a/../b", "host_ref_invalid"],
      ["", "empty_host_ref"],
    ] as const) {
      const outcome = checkResearchWriteContract(host, `${host}research/index.yaml`);
      expect(outcome.allowed).toBe(false);
      if (!outcome.allowed) expect(outcome.reason).toBe(reason);
    }
  });

  it("对抗：目标路径盘符/根斜杠/../逃逸 = FATAL path_not_portable", () => {
    for (const target of [
      "D:\\proj\\src\\x.vue",
      "/etc/passwd",
      `${HOST}research/../../evil.yaml`,
    ]) {
      const outcome = checkResearchWriteContract(HOST, target);
      expect(outcome.allowed).toBe(false);
      if (!outcome.allowed) expect(outcome.reason).toBe("path_not_portable");
    }
  });

  it("对抗：受治理面八前缀逐一 FATAL governed_surface（Current Truth/policies/证据/执行与运行时平面）", () => {
    expect(RESEARCH_FORBIDDEN_SURFACE_PREFIXES).toEqual([
      ".pomaster/state/",
      ".pomaster/truth/",
      ".pomaster/objects/",
      ".pomaster/policies/",
      ".pomaster/evidence/",
      ".pomaster/executions/",
      ".pomaster/runtime/",
      ".pomaster/traces/",
    ]);
    for (const prefix of RESEARCH_FORBIDDEN_SURFACE_PREFIXES) {
      const outcome = checkResearchWriteContract(HOST, `${prefix}x.json`);
      expect(outcome.allowed).toBe(false);
      if (!outcome.allowed) {
        expect(outcome.reason).toBe("governed_surface");
        expect(outcome.hint).toContain("store 事务");
      }
    }
    // evidence 面的 hint 特指 record 通路（Evidence Pack 合法入账走 store 事务）。
    const ev = checkResearchWriteContract(HOST, ".pomaster/evidence/runs/GRN-1.json");
    if (!ev.allowed) expect(ev.hint).toContain("record");

    // B1（P0）denylist 缺口补齐钉子：kernel 唯一写通道平面（executions/runtime/traces）
    // 此前不在清单——探针实锤 .pomaster/runtime/locks/change-CHG.1.lock → ALLOW 的
    // 越写放行；三面逐一 REJECT（runtime 的子目录 sessions/locks/traces 全覆盖）。
    for (const target of [
      ".pomaster/executions/AGX-1.json",
      ".pomaster/runtime/sessions/session-1.json",
      ".pomaster/runtime/locks/change-CHG.1.lock",
      ".pomaster/runtime/traces/AGX-1.json",
      ".pomaster/traces/AGX-1.json",
    ]) {
      const outcome = checkResearchWriteContract(HOST, target);
      expect(outcome.allowed, `写面 ${target} 应命中受治理面`).toBe(false);
      if (!outcome.allowed) expect(outcome.reason).toBe("governed_surface");
    }
  });
});

describe("adjudicateResearchFindings（§81.4 五级 Evidence 判卷语义）", () => {
  const base: ResearchFindingInput = {
    statement: "代码中存在 3 个 MasterGrid 使用点",
    evidence_type: "IMPLEMENTATION",
    confidence: "HIGH",
    authority_effect: "NONE",
    sources: ["src/a.vue"],
    caveats: ["使用点存在不构成官方标准结论（§81.5）"],
  };

  it("五级词形逐一合法（AUTHORITATIVE..INFERENCE，六字段齐备）", () => {
    for (const level of ["AUTHORITATIVE", "PRIMARY", "IMPLEMENTATION", "SECONDARY", "INFERENCE"]) {
      const report = adjudicateResearchFindings([{ ...base, evidence_type: level }]);
      expect(report.allOk).toBe(true);
    }
  });

  it("词表外三向 violation（evidence_type/confidence/authority_effect）fail-closed", () => {
    const report = adjudicateResearchFindings([
      { ...base, evidence_type: "社区博客文章", confidence: "很高", authority_effect: "SHOULD" },
    ]);
    expect(report.allOk).toBe(false);
    const codes = report.perFinding[0]?.violations.map((v) => v.code) ?? [];
    expect(codes).toContain("EVIDENCE_LEVEL_UNKNOWN");
    expect(codes).toContain("CONFIDENCE_UNKNOWN");
    expect(codes).toContain("AUTHORITY_EFFECT_UNKNOWN");
  });

  it("§81.5：CONFLICTS 是发现不是裁决 → escalation 上报路标，不 FAIL", () => {
    const report = adjudicateResearchFindings([
      { ...base, evidence_type: "PRIMARY", authority_effect: "CONFLICTS" },
    ]);
    expect(report.allOk).toBe(true);
    const escalations = report.perFinding[0]?.escalations ?? [];
    expect(escalations).toHaveLength(1);
    expect(escalations[0]?.code).toBe("CONFLICTS_ARE_NOT_ADJUDICATION");
    expect(escalations[0]?.hint).toContain("治理面");
  });

  it("§81.5：IMPLEMENTATION+SUPPORTS 未记录对账 → 降信 warning（Existence ≠ Correctness）", () => {
    const report = adjudicateResearchFindings([{ ...base, authority_effect: "SUPPORTS" }]);
    expect(report.perFinding[0]?.warnings).toHaveLength(1);
    expect(report.perFinding[0]?.warnings[0]?.code).toBe("IMPLEMENTATION_SUPPORTS_UNRECONCILED");
    expect(report.perFinding[0]?.warnings[0]?.hint).toContain("Architecture Truth");
  });

  it("IMPLEMENTATION+SUPPORTS 但 caveats 携带对账记录 → 无 warning（不发明阻断）", () => {
    const report = adjudicateResearchFindings([
      { ...base, authority_effect: "SUPPORTS", caveats: ["已与 Architecture Truth/ADR 对账"] },
    ]);
    expect(report.perFinding[0]?.warnings).toHaveLength(0);
  });
});

describe("adjudicateResearchFindings 六字段存在性（P18 红队发现1：幻觉洗白 fail-closed）", () => {
  const base: ResearchFindingInput = {
    statement: "官方文档确认 Single HTTP Client 架构",
    evidence_type: "AUTHORITATIVE",
    confidence: "HIGH",
    authority_effect: "NONE",
    sources: ["docs/architecture/http-client.md"],
    caveats: ["以 2026-06 版本文档为准"],
  };

  it("对抗（发现1 钉子）：AUTHORITATIVE 零 sources → SOURCES_EMPTY violation，allOk=false 不放行", () => {
    // 若防御失效：AUTHORITATIVE 级零来源 finding 经判卷全链放行（all_ok=true）——
    // 幻觉断言借最高证据级洗白，§81.4 取证契约形同虚设。
    const report = adjudicateResearchFindings([{ ...base, sources: [] }]);
    expect(report.allOk).toBe(false);
    const codes = report.perFinding[0]?.violations.map((v) => v.code) ?? [];
    expect(codes).toContain("SOURCES_EMPTY");
    expect(report.perFinding[0]?.violations.find((v) => v.code === "SOURCES_EMPTY")?.hint).toContain(
      "降为 INFERENCE",
    );
  });

  it("对抗：AUTHORITATIVE 零 caveats → CAVEATS_EMPTY violation（caveats 无空列表豁免条款）", () => {
    const report = adjudicateResearchFindings([{ ...base, caveats: [] }]);
    expect(report.allOk).toBe(false);
    const codes = report.perFinding[0]?.violations.map((v) => v.code) ?? [];
    expect(codes).toContain("CAVEATS_EMPTY");
  });

  it("对抗：sources/caveats 字段整体缺失（非数组）→ SOURCES_MISSING/CAVEATS_MISSING（§81.4 六字段 required）", () => {
    const report = adjudicateResearchFindings([
      {
        statement: "六字段缺两",
        evidence_type: "PRIMARY",
        confidence: "MEDIUM",
        authority_effect: "NONE",
      } as ResearchFindingInput,
    ]);
    expect(report.allOk).toBe(false);
    const codes = report.perFinding[0]?.violations.map((v) => v.code) ?? [];
    expect(codes).toContain("SOURCES_MISSING");
    expect(codes).toContain("CAVEATS_MISSING");
  });

  it("sources 非数组（字符串冒充）→ SOURCES_MISSING（形态即契约，不猜）", () => {
    const report = adjudicateResearchFindings([
      { ...base, sources: "docs/architecture/http-client.md" as unknown as readonly string[] },
    ]);
    const codes = report.perFinding[0]?.violations.map((v) => v.code) ?? [];
    expect(codes).toContain("SOURCES_MISSING");
  });

  it("非恒真对照：INFERENCE 空 sources 显式豁免（10-research-artifact 唯一授权）→ allOk=true", () => {
    // 对照位（防「全拒也算过对抗」假绿）：schema 明文「INFERENCE 级允许空列表——推断自
    // 既有证据组合」；判卷器必须精确放行该豁免面。
    const report = adjudicateResearchFindings([
      { ...base, evidence_type: "INFERENCE", sources: [] },
    ]);
    expect(report.allOk).toBe(true);
  });

  it("空 caveats 任何证据级都 violation（caveats 是 critical_caveat 来源面，显式缺席须陈述）", () => {
    for (const level of ["AUTHORITATIVE", "PRIMARY", "IMPLEMENTATION", "SECONDARY", "INFERENCE"]) {
      const report = adjudicateResearchFindings([{ ...base, evidence_type: level, caveats: [] }]);
      expect(report.allOk).toBe(false);
      expect(
        (report.perFinding[0]?.violations.map((v) => v.code) ?? []).includes("CAVEATS_EMPTY"),
      ).toBe(true);
    }
  });
});

describe("evaluateBlueprintEnvelope（§82.5 CONDITIONALLY_ACCEPTED 判卷）", () => {
  const goodEnvelope: BlueprintEnvelopeInput = {
    status: "CONDITIONALLY_ACCEPTED",
    assumptions: ["only one active version edited at a time"],
    unknowns: [
      { classification: "DEFERRED_DECISION" },
      { classification: "NON_BLOCKING_GAP" },
    ],
    msd_assessment: {
      goal_defined: true,
      scope_defined: true,
      acceptance_verifiable: true,
      msd_reached: true,
    },
  };

  it("合法 CONDITIONALLY_ACCEPTED：a/b/c/d/f 全 PASS + e/g 显式 NOT_MACHINE_CHECKABLE", () => {
    const result = evaluateBlueprintEnvelope(goodEnvelope);
    expect(result.ok).toBe(true);
    expect(result.hardBlockerCount).toBe(0);
    const byId = Object.fromEntries(result.checks.map((c) => [c.requirement, c.status]));
    expect(byId.a_goal_clear).toBe("PASS");
    expect(byId.b_scope_clear).toBe("PASS");
    expect(byId.c_hard_blocker_zero).toBe("PASS");
    expect(byId.d_assumptions_recorded).toBe("PASS");
    expect(byId.f_acceptance_verifiable).toBe("PASS");
    expect(byId.e_deferred_not_smuggled).toBe("NOT_MACHINE_CHECKABLE");
    expect(byId.g_reversible_or_accepted).toBe("NOT_MACHINE_CHECKABLE");
  });

  it("前提 a 反例：goal_defined=false → FAIL + hint 指路", () => {
    const result = evaluateBlueprintEnvelope({
      ...goodEnvelope,
      msd_assessment: {
        goal_defined: false,
        scope_defined: true,
        acceptance_verifiable: true,
        msd_reached: false,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.requirement === "a_goal_clear")?.status).toBe("FAIL");
    expect(result.hint).toContain("§82.5");
  });

  it("前提 b 反例：scope_defined=false → FAIL（主业务对象与主路径不够清楚）", () => {
    const result = evaluateBlueprintEnvelope({
      ...goodEnvelope,
      msd_assessment: {
        goal_defined: true,
        scope_defined: false,
        acceptance_verifiable: true,
        msd_reached: false,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.requirement === "b_scope_clear")?.status).toBe("FAIL");
  });

  it("前提 f 反例：acceptance_verifiable=false → FAIL", () => {
    const result = evaluateBlueprintEnvelope({
      ...goodEnvelope,
      msd_assessment: {
        goal_defined: true,
        scope_defined: true,
        acceptance_verifiable: false,
        msd_reached: false,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.requirement === "f_acceptance_verifiable")?.status).toBe("FAIL");
  });

  it("MSD 面缺失 → a/b/f FAIL（CONDITIONALLY_ACCEPTED 必须提供 MSD 判据）", () => {
    const result = evaluateBlueprintEnvelope({ ...goodEnvelope, msd_assessment: null });
    expect(result.ok).toBe(false);
    for (const req of ["a_goal_clear", "b_scope_clear", "f_acceptance_verifiable"]) {
      expect(result.checks.find((c) => c.requirement === req)?.status).toBe("FAIL");
    }
  });

  it("前提 c 反例：unknowns 含 HARD_BLOCKER → FAIL + 聚合 hint（CONDITIONALLY 要求 HARD_BLOCKER=0）", () => {
    const result = evaluateBlueprintEnvelope({
      ...goodEnvelope,
      unknowns: [{ classification: "HARD_BLOCKER" }],
    });
    expect(result.ok).toBe(false);
    expect(result.hardBlockerCount).toBe(1);
    expect(result.checks.find((c) => c.requirement === "c_hard_blocker_zero")?.status).toBe("FAIL");
    expect(result.hint).toContain("HARD_BLOCKER");
  });

  it("聚合规则：ACCEPTED 携带 HARD_BLOCKER 同样 FAIL（09 顶层 allOf 同源）", () => {
    const result = evaluateBlueprintEnvelope({
      status: "ACCEPTED",
      unknowns: [{ classification: "HARD_BLOCKER" }],
      msd_assessment: null,
    });
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("ACCEPTED/CONDITIONALLY_ACCEPTED");
  });

  it("前提 d 反例：assumptions 未记录（envelope 与 unknowns 均无 ASSUMPTION）→ FAIL", () => {
    const result = evaluateBlueprintEnvelope({
      ...goodEnvelope,
      assumptions: [],
      unknowns: [{ classification: "SOFT_UNCERTAINTY" }],
    });
    expect(result.ok).toBe(false);
    const d = result.checks.find((c) => c.requirement === "d_assumptions_recorded");
    expect(d?.status).toBe("FAIL");
  });

  it("前提 d 正例二形：unknowns 含 ASSUMPTION 条目（envelope.assumptions 空也算显式记录）", () => {
    const result = evaluateBlueprintEnvelope({
      ...goodEnvelope,
      assumptions: [],
      unknowns: [{ classification: "ASSUMPTION" }],
    });
    expect(result.ok).toBe(true);
  });

  it("msd_reached 与三轴派生不一致 → 整体 fail（09 allOf 双向强制的判卷侧重算）", () => {
    const result = evaluateBlueprintEnvelope({
      ...goodEnvelope,
      msd_assessment: {
        goal_defined: true,
        scope_defined: true,
        acceptance_verifiable: false,
        msd_reached: true,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("msd_reached");
  });

  it("BLOCKED/REJECTED：前提逐条 SKIPPED 显式呈现（不冒充已查），hardBlockerCount 照报", () => {
    for (const status of ["BLOCKED", "REJECTED"]) {
      const result = evaluateBlueprintEnvelope({
        status,
        unknowns: [{ classification: "HARD_BLOCKER" }],
        msd_assessment: null,
      });
      expect(result.ok).toBe(true);
      expect(result.hardBlockerCount).toBe(1);
      expect(result.checks.every((c) => c.status === "SKIPPED")).toBe(true);
    }
  });

  it("status 词表外 → fail + 四态 hint", () => {
    const result = evaluateBlueprintEnvelope({ ...goodEnvelope, status: "UNRESOLVED" });
    expect(result.ok).toBe(false);
    expect(result.statusKnown).toBe(false);
    expect(result.hint).toContain("ACCEPTED/CONDITIONALLY_ACCEPTED/BLOCKED/REJECTED");
  });
});
