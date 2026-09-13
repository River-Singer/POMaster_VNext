/**
 * diagnose.spec.ts —— W3-S3 切片：通用 Diagnose 失败域判定核（纯函数；09-12 W3 R3-4）。
 *
 * 源 PRD 锚：C §53-56（Diagnose 管线六拍 + 输出聚合「Likely Failure Domain +
 * Evidence」）+ §H Case H（save 按钮无响应 → 关联浏览器/网络/API/日志证据 → 输出
 * 失败域）。c99-gap-declaration 表 A 项 10/11/12：失败域词位本切片前零落地。
 *
 * 红线断言（对齐任务 AC 反例）：
 * - AC-a 核半：申报 product_assertion + run 面 BUILD/failed 信号 → evidence_chain 佐证；
 * - AC-b 核半：申报 dependency_external 零证据 → 域可给但 declaration_only（不虚构关联）；
 * - fail-closed：词形外域/词形外证据 ref/重复 ref/词表外 verdict 全部 SCHEMA_INVALID；
 * - 冲突呈报非改判；零申报确定性派生；零申报零信号 → unknown_insufficient_evidence；
 * - next_actions 复用 plan-compiler 能力词位（REQUIRED + 证据义务原文——禁第二套工具池词）；
 * - 纯函数纪律：同输入 → 同输出字节稳定 + inputs_fingerprint（sha256OfCanonical 整个输入）。
 *
 * 词形闭包：六失败域 + 两置信基 + run gate→域信号最小映射 = kernel 局部词
 * TODO(vocab-pr)；SP 提案待追认。与 production 三分诊断轴（DIAGNOSIS_KIND_VALUES）
 * 正交零词形串扰（§95.3 三分是修复动作分类轴，失败域是证据归因轴）。
 */
import { describe, expect, it } from "vitest";
import {
  CAPABILITY_EVIDENCE_REQUIREMENT,
  DIAGNOSIS_KIND_VALUES,
  ENVREC_ID_PATTERN,
  EXECUTION_ID_PATTERN,
  FAILURE_DOMAIN_CAPABILITY_PRIORITY,
  FAILURE_DOMAIN_CONFIDENCE_BASES,
  FAILURE_DOMAIN_VALUES,
  OBS_ID_PATTERN,
  PLAN_CAPABILITY_WORDS,
  RUN_GATE_DOMAIN_SIGNALS,
  judgeFailureDomain,
  type DiagnoseEvidenceFace,
  type FailureDomain,
  type FailureDomainJudgmentInput,
} from "@pomaster/kernel";
import { VERDICT_VALUES } from "@pomaster/schemas";

// ============================================================
// fixture（词形合法的最小面构造器）
// ============================================================

function runFace(
  ref: string,
  overrides: Partial<DiagnoseEvidenceFace> = {},
): DiagnoseEvidenceFace {
  return {
    ref,
    kind: "run",
    gate: "BUILD",
    verdict: "failed",
    surface: null,
    observation_result: null,
    ...overrides,
  };
}

function observationFace(
  ref: string,
  overrides: Partial<DiagnoseEvidenceFace> = {},
): DiagnoseEvidenceFace {
  return {
    ref,
    kind: "observation",
    gate: null,
    verdict: null,
    surface: "USER_SURFACE",
    observation_result: "OBSERVED",
    ...overrides,
  };
}

function judgmentInput(
  overrides: Partial<FailureDomainJudgmentInput> = {},
): FailureDomainJudgmentInput {
  return {
    symptom: "保存按钮点击无响应",
    declared_domain: null,
    faces: [],
    ...overrides,
  };
}

// ============================================================
// 词形闭包
// ============================================================

describe("失败域词形闭包（W3-S3；kernel 局部词 TODO(vocab-pr)——SP 提案待追认）", () => {
  it("六失败域闭包逐值锁定（Case H 归因轴的词位起点）", () => {
    expect([...FAILURE_DOMAIN_VALUES]).toEqual([
      "tool_environment",
      "product_assertion",
      "fixture_data",
      "environment_instance",
      "dependency_external",
      "unknown_insufficient_evidence",
    ]);
  });

  it("置信基两词形闭包：evidence_chain | declaration_only（零百分比置信——§21 守护栏禁『置信度=92%』）", () => {
    expect([...FAILURE_DOMAIN_CONFIDENCE_BASES]).toEqual(["evidence_chain", "declaration_only"]);
  });

  it("与 production 三分诊断轴正交零词形串扰（§95.3 两轴分工：修复动作分类 ≠ 证据归因）", () => {
    const overlap = FAILURE_DOMAIN_VALUES.filter((domain) =>
      (DIAGNOSIS_KIND_VALUES as readonly string[]).includes(domain),
    );
    expect(overlap).toEqual([]);
  });

  it("run gate→域信号最小映射只产闭包内域值（BUILD/TYPECHECK→product_assertion；SP 扩映射待追认）", () => {
    expect(Object.keys(RUN_GATE_DOMAIN_SIGNALS).sort()).toEqual(["BUILD", "TYPECHECK"]);
    for (const domain of Object.values(RUN_GATE_DOMAIN_SIGNALS)) {
      expect(FAILURE_DOMAIN_VALUES).toContain(domain);
    }
  });

  it("失败域 → 诊断能力优先级覆盖全部六域（键完备）且能力词全在 plan-compiler 十三词闭包内", () => {
    expect([...FAILURE_DOMAIN_VALUES].sort()).toEqual(
      Object.keys(FAILURE_DOMAIN_CAPABILITY_PRIORITY).sort(),
    );
    for (const [domain, capabilities] of Object.entries(FAILURE_DOMAIN_CAPABILITY_PRIORITY)) {
      expect(capabilities.length, `${domain} 的能力优先级禁空`).toBeGreaterThan(0);
      for (const capability of capabilities) {
        expect(
          (PLAN_CAPABILITY_WORDS as readonly string[]).includes(capability),
          `${domain} → ${capability} 须是 plan-compiler 能力词（复用禁第二套词）`,
        ).toBe(true);
      }
    }
  });
});

// ============================================================
// fail-closed 输入校验
// ============================================================

describe("fail-closed 输入校验（SCHEMA_INVALID；禁畸形输入静默放行）", () => {
  it("symptom 空串/空白 → SCHEMA_INVALID（症状申报是判定输入的事实面，禁空转）", () => {
    expect(() => judgeFailureDomain(judgmentInput({ symptom: "" }))).toThrow(/SCHEMA_INVALID/);
    expect(() => judgeFailureDomain(judgmentInput({ symptom: "   " }))).toThrow(/SCHEMA_INVALID/);
  });

  it("declared_domain 词形外 → SCHEMA_INVALID（六词闭包 hint）", () => {
    expect(() =>
      judgeFailureDomain(judgmentInput({ declared_domain: "network_layer" as FailureDomain })),
    ).toThrow(/SCHEMA_INVALID/);
  });

  it("face kind 词形外（claim 不在本切片闭包）→ SCHEMA_INVALID", () => {
    expect(() =>
      judgeFailureDomain(
        judgmentInput({
          faces: [{ ref: "GRN-0001", kind: "claim" } as unknown as DiagnoseEvidenceFace],
        }),
      ),
    ).toThrow(/SCHEMA_INVALID/);
  });

  it("run 面 ref 非 GRN 词形 → SCHEMA_INVALID；observation 面 ref 非 OBS 词形 → SCHEMA_INVALID", () => {
    expect(() =>
      judgeFailureDomain(judgmentInput({ faces: [runFace("OBS-0001")] })),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      judgeFailureDomain(judgmentInput({ faces: [observationFace("GRN-0001")] })),
    ).toThrow(/SCHEMA_INVALID/);
  });

  it("ENVREC ref 不在本切片证据闭包（GRN/OBS/AGX 三词形）→ SCHEMA_INVALID", () => {
    expect(ENVREC_ID_PATTERN.test("ENVREC-0001")).toBe(true); // 词形本身合法——只是不进本切片分母
    expect(() =>
      judgeFailureDomain(
        judgmentInput({
          faces: [
            {
              ref: "ENVREC-0001",
              kind: "observation",
              gate: null,
              verdict: null,
              surface: "USER_SURFACE",
              observation_result: "OBSERVED",
            },
          ],
        }),
      ),
    ).toThrow(/SCHEMA_INVALID/);
  });

  it("重复 ref → SCHEMA_INVALID（批内唯一——evidence-qualification 批量纪律同款）", () => {
    expect(() =>
      judgeFailureDomain(
        judgmentInput({ faces: [runFace("GRN-0001"), runFace("GRN-0001")] }),
      ),
    ).toThrow(/SCHEMA_INVALID/);
  });

  it("verdict 词表外（03 七态闭包；大小写敏感）→ SCHEMA_INVALID", () => {
    expect(() =>
      judgeFailureDomain(
        judgmentInput({ faces: [runFace("GRN-0001", { verdict: "PASSED" })] }),
      ),
    ).toThrow(/SCHEMA_INVALID/);
    // 七态内全部合法（warning/blocked 等合法但零信号——后文专测）。
    for (const verdict of VERDICT_VALUES) {
      expect(() =>
        judgeFailureDomain(judgmentInput({ faces: [runFace("GRN-0001", { verdict })] }) ),
      ).not.toThrow();
    }
  });

  it("observation 面 surface/result 词形外 → SCHEMA_INVALID（§6.4 八值 + OBSERVED+七负值闭包）", () => {
    expect(() =>
      judgeFailureDomain(
        judgmentInput({
          faces: [observationFace("OBS-0001", { surface: "UI" })],
        }),
      ),
    ).toThrow(/SCHEMA_INVALID/);
    expect(() =>
      judgeFailureDomain(
        judgmentInput({
          faces: [observationFace("OBS-0001", { observation_result: "SAW_IT" })],
        }),
      ),
    ).toThrow(/SCHEMA_INVALID/);
  });

  it("execution 面 ref 须 AGX 词形（EXECUTION_ID_PATTERN 单一镜像）", () => {
    expect(() =>
      judgeFailureDomain(
        judgmentInput({
          faces: [
            {
              ref: "AGX-bad",
              kind: "execution",
              gate: null,
              verdict: null,
              surface: null,
              observation_result: null,
            },
          ],
        }),
      ),
    ).toThrow(/SCHEMA_INVALID/);
    expect(EXECUTION_ID_PATTERN.test("AGX-2026-00001")).toBe(true);
    expect(() =>
      judgeFailureDomain(
        judgmentInput({
          faces: [
            {
              ref: "AGX-2026-00001",
              kind: "execution",
              gate: null,
              verdict: null,
              surface: null,
              observation_result: null,
            },
          ],
        }),
      ),
    ).not.toThrow();
  });
});

// ============================================================
// 判定语义（AC 反例的核半）
// ============================================================

describe("失败域判定语义（W3-S3 判定核）", () => {
  it("AC-a：申报 product_assertion + 在座 run 面同域信号（BUILD/failed）→ evidence_chain 佐证链", () => {
    const judgment = judgeFailureDomain(
      judgmentInput({
        declared_domain: "product_assertion",
        faces: [runFace("GRN-0001"), observationFace("OBS-0001")],
      }),
    );
    expect(judgment.failure_domain).toBe("product_assertion");
    expect(judgment.confidence_basis).toBe("evidence_chain");
    expect(judgment.corroborating_refs).toEqual(["GRN-0001"]);
    expect(judgment.conflicting_refs).toEqual([]);
    expect(judgment.basis).toContain("GRN-0001");
    expect(judgment.basis).toContain("BUILD");
  });

  it("AC-b：申报 dependency_external 零证据 → 域可给但 declaration_only（不虚构关联）", () => {
    const judgment = judgeFailureDomain(
      judgmentInput({ declared_domain: "dependency_external" }),
    );
    expect(judgment.failure_domain).toBe("dependency_external");
    expect(judgment.confidence_basis).toBe("declaration_only");
    expect(judgment.corroborating_refs).toEqual([]);
    expect(judgment.conflicting_refs).toEqual([]);
    expect(judgment.next_actions[0]).toBe(
      `dependency_check REQUIRED — ${CAPABILITY_EVIDENCE_REQUIREMENT.dependency_check}`,
    );
  });

  it("申报 + 在座证据零同域信号（含 OBS/AGX 面零信号位）→ declaration_only 不冒充佐证", () => {
    const judgment = judgeFailureDomain(
      judgmentInput({
        declared_domain: "product_assertion",
        faces: [
          observationFace("OBS-0001"),
          {
            ref: "AGX-2026-00001",
            kind: "execution",
            gate: null,
            verdict: null,
            surface: null,
            observation_result: null,
          },
        ],
      }),
    );
    expect(judgment.failure_domain).toBe("product_assertion");
    expect(judgment.confidence_basis).toBe("declaration_only");
    expect(judgment.corroborating_refs).toEqual([]);
  });

  it("七态内非 failed verdict（passed/warning/blocked/not_run）零信号——只有 failed 产归因信号", () => {
    for (const verdict of ["passed", "warning", "blocked", "not_run"] as const) {
      const judgment = judgeFailureDomain(
        judgmentInput({ declared_domain: "product_assertion", faces: [runFace("GRN-0001", { verdict })] }),
      );
      expect(judgment.confidence_basis, `verdict=${verdict} 零信号`).toBe("declaration_only");
      expect(judgment.corroborating_refs).toEqual([]);
    }
  });

  it("冲突呈报非改判：申报 dependency_external + BUILD/failed 信号（product_assertion）→ 域不改 + conflicting_refs 呈报 + declaration_only", () => {
    const judgment = judgeFailureDomain(
      judgmentInput({
        declared_domain: "dependency_external",
        faces: [runFace("GRN-0001")],
      }),
    );
    expect(judgment.failure_domain).toBe("dependency_external");
    expect(judgment.confidence_basis).toBe("declaration_only");
    expect(judgment.corroborating_refs).toEqual([]);
    expect(judgment.conflicting_refs).toEqual(["GRN-0001"]);
  });

  it("零申报 + 失败信号在座 → 确定性派生信号域 + evidence_chain（信号引用链在 basis 留痕）", () => {
    const judgment = judgeFailureDomain(
      judgmentInput({
        faces: [runFace("GRN-0002"), runFace("GRN-0001", { gate: "TYPECHECK" })],
      }),
    );
    expect(judgment.failure_domain).toBe("product_assertion");
    expect(judgment.confidence_basis).toBe("evidence_chain");
    expect(judgment.corroborating_refs).toEqual(["GRN-0002", "GRN-0001"]);
    expect(judgment.basis).toContain("GRN-0002");
    expect(judgment.basis).toContain("TYPECHECK");
  });

  it("零申报 + 零信号（passed / 纯 OBS 面 / 零证据）→ unknown_insufficient_evidence + declaration_only", () => {
    const passedOnly = judgeFailureDomain(
      judgmentInput({ faces: [runFace("GRN-0001", { verdict: "passed" })] }),
    );
    expect(passedOnly.failure_domain).toBe("unknown_insufficient_evidence");
    expect(passedOnly.confidence_basis).toBe("declaration_only");

    const obsOnly = judgeFailureDomain(
      judgmentInput({ faces: [observationFace("OBS-0001")] }),
    );
    expect(obsOnly.failure_domain).toBe("unknown_insufficient_evidence");

    const zero = judgeFailureDomain(judgmentInput());
    expect(zero.failure_domain).toBe("unknown_insufficient_evidence");
    expect(zero.confidence_basis).toBe("declaration_only");
  });
});

// ============================================================
// next_actions：诊断计划建议复用 plan-compiler 能力词位（禁第二套工具池词）
// ============================================================

describe("next_actions 诊断计划建议（复用 plan-compiler 能力词位）", () => {
  it("每域 next_actions = 能力 REQUIRED + 证据义务原文（单一映射源：CAPABILITY_EVIDENCE_REQUIREMENT）", () => {
    for (const domain of FAILURE_DOMAIN_VALUES) {
      const judgment = judgeFailureDomain(judgmentInput({ declared_domain: domain }));
      const priorities = FAILURE_DOMAIN_CAPABILITY_PRIORITY[domain];
      expect(judgment.next_actions).toEqual(
        priorities.map(
          (capability) => `${capability} REQUIRED — ${CAPABILITY_EVIDENCE_REQUIREMENT[capability]}`,
        ),
      );
    }
  });

  it("unknown_insufficient_evidence 域的建议含静态分析先行（§54 安全/只读/高信号优先序）", () => {
    const judgment = judgeFailureDomain(judgmentInput());
    expect(judgment.next_actions[0]).toContain("static_analysis REQUIRED");
  });
});

// ============================================================
// 纯函数纪律：字节稳定 + fingerprint
// ============================================================

describe("纯函数纪律（零 fs/零 store/零墙钟）", () => {
  it("同输入 → 同输出字节稳定（JSON 逐字节相等），含 inputs_fingerprint", () => {
    const input = judgmentInput({
      declared_domain: "product_assertion",
      faces: [runFace("GRN-0001"), observationFace("OBS-0001")],
    });
    const first = judgeFailureDomain(input);
    const second = judgeFailureDomain(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.inputs_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("输入任一键变化 → fingerprint 变化（symptom/declared_domain/faces 均入指纹分母）", () => {
    const base = judgeFailureDomain(
      judgmentInput({ declared_domain: "product_assertion", faces: [runFace("GRN-0001")] }),
    );
    const otherSymptom = judgeFailureDomain(
      judgmentInput({
        symptom: "另一个症状",
        declared_domain: "product_assertion",
        faces: [runFace("GRN-0001")],
      }),
    );
    const otherFaces = judgeFailureDomain(
      judgmentInput({ declared_domain: "product_assertion", faces: [runFace("GRN-0002")] }),
    );
    expect(otherSymptom.inputs_fingerprint).not.toBe(base.inputs_fingerprint);
    expect(otherFaces.inputs_fingerprint).not.toBe(base.inputs_fingerprint);
  });

  it("OBS ref 词形镜像单一事实源（perception OBS_ID_PATTERN 本地复验——禁第二套词形）", () => {
    expect(OBS_ID_PATTERN.test("OBS-0001")).toBe(true);
    expect(OBS_ID_PATTERN.test("OBS-1")).toBe(true);
    expect(OBS_ID_PATTERN.test("GRN-0001")).toBe(false);
  });
});
