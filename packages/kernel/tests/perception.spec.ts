/**
 * perception.spec.ts —— Perception 契约 + Environment Doctor + 负观察判定
 * （P0.5-4a · PRD v0.5.2 §6.2/6.3/6.4/6.7/6.13/6.14/6.15/6.16；W1-D1 线 T1）。
 *
 * 覆盖纪律：词轴逐字冻结（§6.4 八值 / §6.15 四级 / §6.14 七负值行序）；四锚
 * 逐项缺失即拒（WHAT/WHERE/HOW/WITH WHAT 一正四反 + 聚合报全）；doctor 九项
 * 比对矩阵（confirmed/missing/mismatch/exempt 四态 + Case H revision 比对位 +
 * P0.5-4 验收句「未确认 base URL 不得 READY」）；负观察判定矩阵（Case K：四前提
 * 齐才许 OBSERVED_ABSENT，否则 INCONCLUSIVE；申报链序确定性）。纯函数零 IO——
 * 本文件无任何 fixture 目录（铁律 3 的 mkdtemp 前提不存在）。
 */
import { describe, expect, it } from "vitest";
import { RUNTIME_DEGRADATION_RULE_IDS } from "@pomaster/schemas";
import {
  CAPABILITY_DEGRADED,
  DOCTOR_CONFIRM_FIELDS,
  DOCTOR_REQUIRED_EXPECTATION_FIELDS,
  ENVIRONMENT_DOCTOR_VERDICT_VALUES,
  ENVREC_ID_PATTERN,
  NEGATIVE_OBSERVATION_VALUES,
  OBSERVATION_RESULT_VALUES,
  OBSERVATION_SURFACE_VALUES,
  OBS_ID_PATTERN,
  PROBE_SIDE_EFFECT_RULES,
  SIDE_EFFECT_CLASS_VALUES,
  buildEnvironmentReceipt,
  judgeNegativeObservation,
  runEnvironmentDoctor,
  validateObservationRequest,
  type EnvironmentExpectation,
  type EnvironmentObserved,
  type NegativeObservationInput,
  type ObservationRequest,
} from "../src/perception.js";
import { GovernanceError } from "../src/errors.js";

// ============================================================
// fixtures（值尽量取 PRD §6.3/§6.7 例文逐字）
// ============================================================

/** §6.3 最小形态映射（surface/side_effect 归一 §6.4/§6.15 词轴闭包——yaml 的
 * USER_UI/REVERSIBLE 是 PRD 散文简写，机器可判闭包以词轴定义面为准）。 */
function validRequest(): ObservationRequest {
  return {
    intent: "REPRODUCE",
    question: "点击进入成本分析后，Grid 是否成功出现？",
    operation: "打开 route 并真实点击进入成本分析",
    // §6.16 观察能力词形（sensor 能力要求位；SENSOR.* 登记词形归 P1-5 簇）
    sensor_capability: "browser_interactive",
    target: {
      capability_ref: "CAPABILITY.COST_ANALYSIS",
      environment_ref: "ENV.LOCAL.DEV",
      instance_ref: null,
    },
    surface: "USER_SURFACE",
    expected_observation: ["grid_visible", "no_console_error"],
    side_effect: "INTERACTIVE_REVERSIBLE",
  };
}

/** §6.7 yaml 例文逐字值 + build_identity（清单项 3，yaml 最小形不载）。 */
function readyExpectation(): EnvironmentExpectation {
  return {
    repository_ref: "POMASTER_PROJECT",
    revision_ref: "d6afca3",
    build_identity: "build-d6afca3",
    runtime_instance: "app-local-4173",
    base_url: "http://127.0.0.1:4173",
    environment_ref: "ENV.LOCAL.DEV",
    dataset_ref: "FIXTURE.COST_ANALYSIS.SMOKE",
    auth_role: "TEST_USER",
    feature_flags: ["cost-analysis-v2"],
  };
}

/** 与 readyExpectation 全等的实测面（READY 基线）。 */
function readyObserved(): EnvironmentObserved {
  return { ...readyExpectation() };
}

/** 四前提全真的负观察输入基线。 */
function fourPreconditionsHold(): NegativeObservationInput {
  return {
    declared: [],
    captureEmpty: true,
    correctPage: true,
    correctInstance: true,
    sensorWorked: true,
    captureWindowCoveredOperation: true,
  };
}

/** 捕获 GovernanceError 并返回（断言 code/details 用）。 */
function caught(err: unknown): GovernanceError {
  expect(err).toBeInstanceOf(GovernanceError);
  return err as GovernanceError;
}

// ============================================================
// 词轴逐字冻结
// ============================================================

describe("词轴常量（TODO(vocab-pr-0005)：三镜像登记归主控批次）", () => {
  it("Observation Surface 八值 §6.4 逐字 + 原文行序", () => {
    expect(OBSERVATION_SURFACE_VALUES).toEqual([
      "USER_SURFACE",
      "INTERACTION_STATE",
      "BOUNDARY_IO",
      "RUNTIME_SIGNAL",
      "DATA_STATE",
      "RESOURCE_BEHAVIOR",
      "STRUCTURAL_REALITY",
      "PRODUCTION_REALITY",
    ]);
  });

  it("Probe Side-effect 四级 §6.15 逐字 + 副作用从轻到重行序", () => {
    expect(SIDE_EFFECT_CLASS_VALUES).toEqual([
      "READ_ONLY",
      "INTERACTIVE_REVERSIBLE",
      "MUTATING_REVERSIBLE",
      "IRREVERSIBLE_OR_EXTERNAL",
    ]);
  });

  it("PROBE_SIDE_EFFECT_RULES 四行与词轴对齐且 §6.15 授权要求逐字", () => {
    expect(PROBE_SIDE_EFFECT_RULES.map((r) => r.cls)).toEqual([...SIDE_EFFECT_CLASS_VALUES]);
    expect(PROBE_SIDE_EFFECT_RULES.map((r) => r.requires)).toEqual([
      "可在 Runtime/Tool Scope 内执行",
      "需 Environment / Cleanup Contract",
      "必须落 Permit / Sandbox Scope",
      "Human Approval / explicit Authority",
    ]);
  });

  it("负观察七词形 §6.14 逐字 + 原文行序", () => {
    expect(NEGATIVE_OBSERVATION_VALUES).toEqual([
      "OBSERVED_ABSENT",
      "NOT_OBSERVABLE",
      "SENSOR_UNAVAILABLE",
      "PERMISSION_DENIED",
      "ENVIRONMENT_INVALID",
      "PROBE_FAILED",
      "INCONCLUSIVE",
    ]);
  });

  it("result 全轴 = OBSERVED（§6.13）+ 七负值；doctor verdict 二值（W1-D1 定案）", () => {
    expect(OBSERVATION_RESULT_VALUES).toEqual(["OBSERVED", ...NEGATIVE_OBSERVATION_VALUES]);
    expect(ENVIRONMENT_DOCTOR_VERDICT_VALUES).toEqual([
      "READY",
      "WRONG_OR_UNVERIFIED_INSTANCE",
    ]);
  });

  it("CAPABILITY_DEGRADED 与 §58 capability_degradation_report 两轴正交（Owner 裁决 8）", () => {
    expect(CAPABILITY_DEGRADED).toBe("CAPABILITY_DEGRADED");
    // 撞族消歧的机器可判面：agent 池规则 id 在库、感知域呈现词不在其列；
    // 感知域 result 闭包也不收 CAPABILITY_DEGRADED（NOT_OBSERVABLE 为主词形）。
    expect(RUNTIME_DEGRADATION_RULE_IDS).toContain("capability_degradation_report");
    expect(RUNTIME_DEGRADATION_RULE_IDS).not.toContain(CAPABILITY_DEGRADED);
    expect(OBSERVATION_RESULT_VALUES).not.toContain(CAPABILITY_DEGRADED);
  });

  it("OBS-/ENVREC- 通路编号词形（非 governed 前缀，不入 id_namespace 闭包）", () => {
    expect(OBS_ID_PATTERN.test("OBS-1")).toBe(true);
    expect(OBS_ID_PATTERN.test("OBS-00182")).toBe(true);
    expect(OBS_ID_PATTERN.test("OBS.NETWORK.17")).toBe(false); // §6.11 点形是引用记法非通路编号
    expect(OBS_ID_PATTERN.test("OBS-")).toBe(false);
    expect(OBS_ID_PATTERN.test("OBS-alpha")).toBe(false);
    expect(ENVREC_ID_PATTERN.test("ENVREC-7")).toBe(true);
    expect(ENVREC_ID_PATTERN.test("OBS-7")).toBe(false);
    expect(ENVREC_ID_PATTERN.test("ENVREC-x")).toBe(false);
  });

  it("doctor 确认项九项 §6.7 清单全集 + 实例身份核五项是其子集", () => {
    expect(DOCTOR_CONFIRM_FIELDS).toEqual([
      "repository_ref",
      "revision_ref",
      "build_identity",
      "runtime_instance",
      "base_url",
      "environment_ref",
      "dataset_ref",
      "auth_role",
      "feature_flags",
    ]);
    for (const field of DOCTOR_REQUIRED_EXPECTATION_FIELDS) {
      expect(DOCTOR_CONFIRM_FIELDS).toContain(field);
    }
  });
});

// ============================================================
// 四锚校验（§6.2 缺一不可 + §6.3 机器可判）
// ============================================================

describe("validateObservationRequest 四锚", () => {
  it("§6.3 最小形态合法请求通过（instance_ref=null 与 intent=null 显式缺席合法）", () => {
    expect(() => validateObservationRequest(validRequest())).not.toThrow();
  });

  it("WHAT 反：question 空 → SCHEMA_INVALID 且锚名入明细", () => {
    const err = caught(
      (() => {
        try {
          validateObservationRequest({ ...validRequest(), question: "  " });
        } catch (e) {
          return e;
        }
      })(),
    );
    expect(err.code).toBe("SCHEMA_INVALID");
    expect(JSON.stringify(err.details.missing_anchors)).toContain("WHAT");
  });

  it("WHAT 反：expected_observation 空数组 / 含空白项 → 均拒", () => {
    for (const expected of [[], ["grid_visible", "  "]] as const) {
      expect(() =>
        validateObservationRequest({ ...validRequest(), expected_observation: [...expected] }),
      ).toThrow(GovernanceError);
    }
  });

  it("WHERE 反：surface 词轴外 → invalid_values 明细（非 missing 桶）", () => {
    const err = caught(
      (() => {
        try {
          validateObservationRequest({
            ...validRequest(),
            surface: "USER_UI" as never, // §6.3 yaml 散文简写不是 §6.4 词轴值
          });
        } catch (e) {
          return e;
        }
      })(),
    );
    expect(err.code).toBe("SCHEMA_INVALID");
    const invalid = err.details.invalid_values as { field: string }[];
    expect(invalid.map((v) => v.field)).toEqual(["surface"]);
  });

  it("WHERE 反：target.capability_ref / target.environment_ref 空 → 各拒", () => {
    expect(() =>
      validateObservationRequest({
        ...validRequest(),
        target: { capability_ref: "", environment_ref: "ENV.LOCAL.DEV", instance_ref: null },
      }),
    ).toThrow(GovernanceError);
    expect(() =>
      validateObservationRequest({
        ...validRequest(),
        target: { capability_ref: "CAPABILITY.COST_ANALYSIS", environment_ref: "", instance_ref: null },
      }),
    ).toThrow(GovernanceError);
  });

  it("HOW 反：operation 空 → 拒（只报工具名不报动作 = §6.2 逐字违例）", () => {
    const err = caught(
      (() => {
        try {
          validateObservationRequest({ ...validRequest(), operation: "" });
        } catch (e) {
          return e;
        }
      })(),
    );
    expect(JSON.stringify(err.details.missing_anchors)).toContain("HOW");
  });

  it("WITH WHAT 反：sensor_capability 空 → 拒", () => {
    const err = caught(
      (() => {
        try {
          validateObservationRequest({ ...validRequest(), sensor_capability: "" });
        } catch (e) {
          return e;
        }
      })(),
    );
    expect(JSON.stringify(err.details.missing_anchors)).toContain("WITH WHAT");
  });

  it("四锚齐缺 → 明细聚合报全（不首错即抛——escalation 纪律一轮修完）", () => {
    const err = caught(
      (() => {
        try {
          validateObservationRequest({
            intent: null,
            question: "",
            operation: "",
            sensor_capability: "",
            target: { capability_ref: "", environment_ref: "", instance_ref: null },
            surface: "NOT_A_SURFACE" as never,
            expected_observation: [],
            side_effect: "REVERSIBLE" as never, // §6.3 yaml 简写不是 §6.15 词轴值
          });
        } catch (e) {
          return e;
        }
      })(),
    );
    const anchors = JSON.stringify(err.details.missing_anchors);
    expect(anchors).toContain("WHAT");
    expect(anchors).toContain("WHERE");
    expect(anchors).toContain("HOW");
    expect(anchors).toContain("WITH WHAT");
    const invalid = err.details.invalid_values as { field: string }[];
    expect(invalid.map((v) => v.field).sort()).toEqual(["side_effect", "surface"]);
  });

  it("side_effect 词轴外 → SCHEMA_INVALID（§6.15 四级闭包）", () => {
    expect(() =>
      validateObservationRequest({ ...validRequest(), side_effect: "REVERSIBLE" as never }),
    ).toThrow(GovernanceError);
  });

  it("intent 空白串非法、null 合法（显式缺席纪律）", () => {
    expect(() => validateObservationRequest({ ...validRequest(), intent: " " })).toThrow(
      GovernanceError,
    );
    expect(() => validateObservationRequest({ ...validRequest(), intent: null })).not.toThrow();
  });
});

// ============================================================
// Environment Doctor（§6.7 + Case H + P0.5-4 验收句）
// ============================================================

describe("runEnvironmentDoctor 九项比对", () => {
  it("全字段确认 → READY + 九行全 confirmed", () => {
    const outcome = runEnvironmentDoctor(readyExpectation(), readyObserved());
    expect(outcome.verdict).toBe("READY");
    expect(outcome.ok).toBe(true);
    expect(outcome.rows).toHaveLength(9);
    expect(outcome.rows.every((r) => r.status === "confirmed")).toBe(true);
    expect(outcome.missing).toEqual([]);
    expect(outcome.mismatch).toEqual([]);
  });

  it("Case H：expected revision ≠ 实测 revision → WRONG_OR_UNVERIFIED_INSTANCE + mismatch 明细", () => {
    const observed = { ...readyObserved(), revision_ref: "abc1234" };
    const outcome = runEnvironmentDoctor(readyExpectation(), observed);
    expect(outcome.verdict).toBe("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(outcome.ok).toBe(false);
    expect(outcome.mismatch).toEqual(["revision_ref"]);
    expect(outcome.note).toContain("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(outcome.note).toContain("禁 PASS");
  });

  it("P0.5-4 验收句：observed.base_url=null（未确认）→ missing → 不得 READY", () => {
    const observed = { ...readyObserved(), base_url: null };
    const outcome = runEnvironmentDoctor(readyExpectation(), observed);
    expect(outcome.verdict).toBe("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(outcome.missing).toEqual(["base_url"]);
    const row = outcome.rows.find((r) => r.field === "base_url");
    expect(row?.status).toBe("missing");
  });

  it("expected 五项身份核任一缺报 → SCHEMA_INVALID（无判卷分母 fail-closed）", () => {
    for (const field of DOCTOR_REQUIRED_EXPECTATION_FIELDS) {
      const expectation = { ...readyExpectation(), [field]: field === "feature_flags" ? null : "" };
      const err = caught(
        (() => {
          try {
            runEnvironmentDoctor(expectation, readyObserved());
          } catch (e) {
            return e;
          }
        })(),
      );
      expect(err.code).toBe("SCHEMA_INVALID");
      expect(JSON.stringify(err.details.undeclared_fields)).toContain(field);
    }
  });

  it("expected.dataset_ref=null → exempt 行显式呈现且不影响 READY（申报豁免非静默跳过）", () => {
    const expectation = { ...readyExpectation(), dataset_ref: null };
    const observed = { ...readyObserved(), dataset_ref: null };
    const outcome = runEnvironmentDoctor(expectation, observed);
    expect(outcome.verdict).toBe("READY");
    expect(outcome.rows.find((r) => r.field === "dataset_ref")?.status).toBe("exempt");
  });

  it("expected 申报豁免的字段不看实测（observed 非空也 exempt——分母由 expected 决定）", () => {
    const expectation = { ...readyExpectation(), auth_role: null };
    const observed = { ...readyObserved(), auth_role: "SOMEONE_ELSE" };
    const outcome = runEnvironmentDoctor(expectation, observed);
    expect(outcome.verdict).toBe("READY");
    expect(outcome.rows.find((r) => r.field === "auth_role")?.status).toBe("exempt");
  });

  it("checklist 项 3：build_identity mismatch → WRONG（yaml 最小形不载但九项比对全集在场）", () => {
    const observed = { ...readyObserved(), build_identity: "build-other" };
    const outcome = runEnvironmentDoctor(readyExpectation(), observed);
    expect(outcome.verdict).toBe("WRONG_OR_UNVERIFIED_INSTANCE");
    expect(outcome.mismatch).toEqual(["build_identity"]);
  });

  it("feature_flags 多重集合相等（申报序无语义）→ confirmed；实测缺 → missing", () => {
    const reordered = runEnvironmentDoctor(
      readyExpectation(),
      { ...readyObserved(), feature_flags: ["cost-analysis-v2"] },
    );
    expect(reordered.rows.find((r) => r.field === "feature_flags")?.status).toBe("confirmed");

    const swapped = runEnvironmentDoctor(readyExpectation(), {
      ...readyObserved(),
      feature_flags: ["other-flag"],
    });
    expect(swapped.mismatch).toEqual(["feature_flags"]);

    const unconfirmed = runEnvironmentDoctor(readyExpectation(), {
      ...readyObserved(),
      feature_flags: null,
    });
    expect(unconfirmed.missing).toEqual(["feature_flags"]);
    expect(unconfirmed.verdict).toBe("WRONG_OR_UNVERIFIED_INSTANCE");
  });

  it("多缺陷聚合：missing 与 mismatch 同场并列呈现", () => {
    const outcome = runEnvironmentDoctor(readyExpectation(), {
      ...readyObserved(),
      base_url: null,
      runtime_instance: "app-other-9999",
    });
    expect(outcome.missing).toEqual(["base_url"]);
    expect(outcome.mismatch).toEqual(["runtime_instance"]);
    expect(outcome.verdict).toBe("WRONG_OR_UNVERIFIED_INSTANCE");
  });

  it("九行 status 枚举封闭（confirmed/missing/mismatch/exempt 四值）", () => {
    const expectation = { ...readyExpectation(), dataset_ref: null };
    const outcome = runEnvironmentDoctor(expectation, {
      ...readyObserved(),
      base_url: null,
      revision_ref: "abc1234",
      dataset_ref: null,
    });
    const statuses = outcome.rows.map((r) => r.status);
    for (const status of statuses) {
      expect(["confirmed", "missing", "mismatch", "exempt"]).toContain(status);
    }
    expect(new Set(statuses)).toEqual(new Set(["confirmed", "missing", "mismatch", "exempt"]));
  });
});

// ============================================================
// EnvironmentReceipt（§6.7 yaml 形态 + §6.13 sidecar 纪律）
// ============================================================

describe("buildEnvironmentReceipt", () => {
  it("yaml 八键 + doctor_verdict 逐键在位且键序对齐 §6.7 例文", () => {
    const receipt = buildEnvironmentReceipt(readyObserved(), "AGX-2026-00182", "READY");
    expect(Object.keys(receipt)).toEqual([
      "environment_ref",
      "execution_id",
      "repository_ref",
      "revision_ref",
      "runtime_instance",
      "base_url",
      "dataset_ref",
      "auth_role",
      "doctor_verdict",
    ]);
    expect(receipt.doctor_verdict).toBe("READY");
    expect(receipt.base_url).toBe("http://127.0.0.1:4173");
  });

  it("WRONG 回执诚实落盘（实测 null 原样保留——Case H blocked 证据链消费位）", () => {
    const observed = { ...readyObserved(), base_url: null };
    const receipt = buildEnvironmentReceipt(
      observed,
      "AGX-2026-00182",
      "WRONG_OR_UNVERIFIED_INSTANCE",
    );
    expect(receipt.base_url).toBeNull();
    expect(receipt.doctor_verdict).toBe("WRONG_OR_UNVERIFIED_INSTANCE");
  });

  it("execution_id 缺席 → SCHEMA_INVALID（§6.13 证明义务的通路锚前提）", () => {
    for (const executionId of ["", "  "] as const) {
      const err = caught(
        (() => {
          try {
            buildEnvironmentReceipt(readyObserved(), executionId, "READY");
          } catch (e) {
            return e;
          }
        })(),
      );
      expect(err.code).toBe("SCHEMA_INVALID");
      expect(err.hint).toContain("execution.ts");
    }
  });
});

// ============================================================
// 负观察判定矩阵（§6.14 + Case K）
// ============================================================

describe("judgeNegativeObservation", () => {
  it("四前提全真 + 捕获空 → OBSERVED_ABSENT（缺席是事实）", () => {
    const outcome = judgeNegativeObservation(fourPreconditionsHold());
    expect(outcome.result).toBe("OBSERVED_ABSENT");
    expect(outcome.preconditions).toEqual({
      correctPage: true,
      correctInstance: true,
      sensorWorked: true,
      captureWindowCoveredOperation: true,
    });
  });

  it("四前提逐项不满足 → 各判 INCONCLUSIVE（Case K：观察条件不成立→INCONCLUSIVE）", () => {
    const keys = ["correctPage", "correctInstance", "sensorWorked", "captureWindowCoveredOperation"] as const;
    for (const key of keys) {
      const input = { ...fourPreconditionsHold(), [key]: false };
      const outcome = judgeNegativeObservation(input);
      expect(outcome.result).toBe("INCONCLUSIVE");
      expect(outcome.reason).toContain("四前提不齐");
      expect(outcome.hint).toContain("不得把缺席当作不存在");
    }
  });

  it("五个可申报词形各直判（结构性失败不需要四前提背书）", () => {
    const cases: { declared: NegativeObservationInput["declared"][number]; hintPart: string }[] = [
      { declared: "ENVIRONMENT_INVALID", hintPart: "环境身份" },
      { declared: "PERMISSION_DENIED", hintPart: "授权" },
      { declared: "SENSOR_UNAVAILABLE", hintPart: "NOT_OBSERVABLE" },
      { declared: "NOT_OBSERVABLE", hintPart: "payload" },
      { declared: "PROBE_FAILED", hintPart: "最小副作用" },
    ];
    for (const c of cases) {
      const outcome = judgeNegativeObservation({
        ...fourPreconditionsHold(),
        declared: [c.declared],
      });
      expect(outcome.result).toBe(c.declared);
      expect(outcome.hint).toContain(c.hintPart);
    }
  });

  it("多申报按观察管线链序取最前且与数组序无关（判定确定性）", () => {
    const a = judgeNegativeObservation({
      ...fourPreconditionsHold(),
      declared: ["SENSOR_UNAVAILABLE", "ENVIRONMENT_INVALID"],
    });
    const b = judgeNegativeObservation({
      ...fourPreconditionsHold(),
      declared: ["ENVIRONMENT_INVALID", "SENSOR_UNAVAILABLE"],
    });
    expect(a.result).toBe("ENVIRONMENT_INVALID");
    expect(b.result).toBe("ENVIRONMENT_INVALID");

    const c = judgeNegativeObservation({
      ...fourPreconditionsHold(),
      declared: ["PROBE_FAILED", "NOT_OBSERVABLE"],
    });
    expect(c.result).toBe("NOT_OBSERVABLE");
  });

  it("无申报且捕获非空 → SCHEMA_INVALID（本判定器结构性不发 OBSERVED——成功观察归 §6.13 通路）", () => {
    const err = caught(
      (() => {
        try {
          judgeNegativeObservation({ ...fourPreconditionsHold(), captureEmpty: false });
        } catch (e) {
          return e;
        }
      })(),
    );
    expect(err.code).toBe("SCHEMA_INVALID");
    expect(err.message).toContain("正常观察");
  });

  it("判定矩阵全量输出恒落七负值闭包（OBSERVED 永不由本判定器产出）", () => {
    const inputs: NegativeObservationInput[] = [
      fourPreconditionsHold(),
      { ...fourPreconditionsHold(), correctPage: false },
      { ...fourPreconditionsHold(), declared: ["SENSOR_UNAVAILABLE"] },
      { ...fourPreconditionsHold(), declared: ["NOT_OBSERVABLE", "PROBE_FAILED"] },
    ];
    for (const input of inputs) {
      expect(NEGATIVE_OBSERVATION_VALUES).toContain(judgeNegativeObservation(input).result);
    }
  });
});
