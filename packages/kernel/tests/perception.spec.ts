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
 * W1-D2 增量（批 2 · P0.5-4b）：buildObservationReceipt 组装矩阵（§6.13 十三键 +
 * Benchmark E 封条：OBSERVED 无 artifact_refs → SCHEMA_INVALID）+ schema 17 资产
 * 正反例（ajv 局部编译 + allSchemas 全量注册解跨文件 $ref；OBSERVED 空 refs 反例 + 词形反例族）。
 */
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_DEGRADATION_RULE_IDS,
  allSchemas,
  perceptionReceiptsSchema,
} from "@pomaster/schemas";
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
  buildObservationReceipt,
  judgeNegativeObservation,
  runEnvironmentDoctor,
  validateObservationRequest,
  type EnvironmentExpectation,
  type EnvironmentObserved,
  type NegativeObservationInput,
  type ObservationReceiptInput,
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

// ============================================================
// buildObservationReceipt（W1-D2 · §6.13 十三键 + Benchmark E 封条）
// ============================================================

/** GovernanceError 捕获助手（details 断言需要拿到错误实体——toThrow 只判类型）。 */
function catchGovernance(fn: () => unknown): GovernanceError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GovernanceError);
    return err as GovernanceError;
  }
  throw new Error("预期 GovernanceError 未抛出（fail-closed 校验静默放行 = 假绿）");
}

const SCREENSHOT_BLOB = {
  sha256: "sha256:3fd9e1b7c2a4f56890bd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
  media: "screenshot",
  byteSize: 2048,
  storagePath: "blobs/sha256/3f/d9e1b7c2a4f56890bd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
} as const;

/** §6.13 yaml 例文转录（journey/ENVREC/target 置位形态）。 */
function validObservedInput(): ObservationReceiptInput {
  return {
    observationId: "OBS-182",
    executionId: "AGX-2026-00182",
    sensorCapability: "SENSOR.BROWSER.INTERACTIVE",
    adapter: "chrome-devtools-mcp",
    operation: "inspect_network",
    surface: "BOUNDARY_IO",
    journeyRef: "JOURNEY.COST_ANALYSIS.ENTER",
    environmentReceiptRef: "ENVREC-9",
    targetRef: "CAPABILITY.COST_ANALYSIS",
    artifactRefs: [SCREENSHOT_BLOB],
    normalizedFacts: ["request_status: 200", "response_items: 0"],
    result: "OBSERVED",
    capturedAtSeq: 182,
  };
}

describe("buildObservationReceipt（W1-D2 · §6.13 最小通路组装）", () => {
  it("正例：OBSERVED + blob 引用齐备 → 十三键落位（snake 落盘词形；可空位 null 显式）", () => {
    const receipt = buildObservationReceipt(validObservedInput());
    expect(receipt.observation_id).toBe("OBS-182");
    expect(receipt.execution_id).toBe("AGX-2026-00182");
    expect(receipt.journey_ref).toBe("JOURNEY.COST_ANALYSIS.ENTER");
    expect(receipt.environment_receipt_ref).toBe("ENVREC-9");
    expect(receipt.sensor_capability).toBe("SENSOR.BROWSER.INTERACTIVE");
    expect(receipt.adapter).toBe("chrome-devtools-mcp");
    expect(receipt.operation).toBe("inspect_network");
    expect(receipt.target_ref).toBe("CAPABILITY.COST_ANALYSIS");
    expect(receipt.surface).toBe("BOUNDARY_IO");
    expect(receipt.artifact_refs).toEqual([SCREENSHOT_BLOB]);
    expect(receipt.normalized_facts).toEqual(["request_status: 200", "response_items: 0"]);
    expect(receipt.result).toBe("OBSERVED");
    expect(receipt.captured_at_seq).toBe(182);
  });

  it("Benchmark E 封条：OBSERVED 无 artifact_refs → SCHEMA_INVALID（自报无凭拒收）", () => {
    const err = catchGovernance(() =>
      buildObservationReceipt({ ...validObservedInput(), artifactRefs: [] }),
    );
    expect(err.code).toBe("SCHEMA_INVALID");
    expect(err.message).toContain("Observation Receipt");
    expect(err.details).toBeDefined();
    const missing = (err.details as { missing: readonly string[] }).missing.join("\n");
    expect(missing).toContain("artifactRefs");
    expect(missing).toContain("Benchmark E");
  });

  it("负观察词形免 artifact 硬约束：NOT_OBSERVABLE 空 refs 合法（Case I：截图不能替代 payload Evidence）", () => {
    const receipt = buildObservationReceipt({
      ...validObservedInput(),
      artifactRefs: [],
      result: "NOT_OBSERVABLE",
      normalizedFacts: ["network_capture_empty: true"],
    });
    expect(receipt.result).toBe("NOT_OBSERVABLE");
    expect(receipt.artifact_refs).toEqual([]);
  });

  it("负观察词形 + refs 留痕亦合法（Case I 留痕形态：截图在场而 network 不可观察）", () => {
    const receipt = buildObservationReceipt({
      ...validObservedInput(),
      result: "NOT_OBSERVABLE",
    });
    expect(receipt.result).toBe("NOT_OBSERVABLE");
    expect(receipt.artifact_refs).toEqual([SCREENSHOT_BLOB]);
  });

  it("词形反例聚合报全：OBS 点形 / ENVREC 词形错 / AGX 空 / capturedAtSeq 负数 / surface 词轴外", () => {
    const err = catchGovernance(() =>
      buildObservationReceipt({
        ...validObservedInput(),
        observationId: "OBS.NETWORK.17",
        environmentReceiptRef: "EVR-9",
        executionId: "",
        capturedAtSeq: -1,
        surface: "USER_UI" as never,
      }),
    );
    expect(err.code).toBe("SCHEMA_INVALID");
    const invalidFields = (
      err.details as { invalid_values: readonly { field: string }[] }
    ).invalid_values.map((entry) => entry.field);
    expect(invalidFields).toContain("observationId");
    expect(invalidFields).toContain("environmentReceiptRef");
    expect(invalidFields).toContain("capturedAtSeq");
    expect(invalidFields).toContain("surface");
    const missing = (err.details as { missing: readonly string[] }).missing.join("\n");
    expect(missing).toContain("executionId");
  });

  it("缺省可空位 → null 显式缺席（journey/ENVREC/target；禁占位词冒充）", () => {
    const receipt = buildObservationReceipt({
      observationId: "OBS-7",
      executionId: "AGX-2026-00001",
      sensorCapability: "SENSOR.BROWSER.INTERACTIVE",
      adapter: "chrome-devtools-mcp",
      operation: "screenshot",
      surface: "USER_SURFACE",
      artifactRefs: [SCREENSHOT_BLOB],
      normalizedFacts: [],
      result: "OBSERVED",
      capturedAtSeq: 11,
    });
    expect(receipt.journey_ref).toBeNull();
    expect(receipt.environment_receipt_ref).toBeNull();
    expect(receipt.target_ref).toBeNull();
    expect(receipt.normalized_facts).toEqual([]);
  });

  it("纯函数确定性：同输入重放逐键全等（A4——同输入重放字节稳定）", () => {
    const a = buildObservationReceipt(validObservedInput());
    const b = buildObservationReceipt(validObservedInput());
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ============================================================
// schema 17 资产（W1-D2 · ajv 局部编译 + 全量注册解跨文件 $ref）
// ============================================================

const ajvPerception = new Ajv({ strictSchema: false, allErrors: true });
// 跨文件 $ref 为绝对 $id 形态：17 → 07（blob_ref / object_id）→ 03（gate-result 等）
// ——组合装载须全量注册（trace.spec 同款 allSchemas 遍历纪律）。
for (const schema of Object.values(allSchemas)) {
  ajvPerception.addSchema(schema as Record<string, unknown>);
}
const validateReceipts = ajvPerception.compile(perceptionReceiptsSchema as object);

/** PRD §6.7 yaml 例文逐键转录（READY 形态）。 */
const READY_ENV_RECEIPT: Record<string, unknown> = {
  record_type: "environment_receipt",
  environment_ref: "ENV.LOCAL.DEV",
  execution_id: "AGX-2026-00182",
  repository_ref: "POMASTER_PROJECT",
  revision_ref: "WORKTREE_CURRENT",
  runtime_instance: "app-local-4173",
  base_url: "http://127.0.0.1:4173",
  dataset_ref: "FIXTURE.COST_ANALYSIS.SMOKE",
  auth_role: "TEST_USER",
  doctor_verdict: "READY",
};

/** PRD §6.13 yaml 例文逐键转录（OBSERVED + blob 绑定形态）。 */
const OBSERVED_RECEIPT: Record<string, unknown> = {
  record_type: "observation_receipt",
  observation_id: "OBS-182",
  execution_id: "AGX-2026-00182",
  journey_ref: "JOURNEY.COST_ANALYSIS.ENTER",
  environment_receipt_ref: "ENVREC-9",
  sensor_capability: "SENSOR.BROWSER.INTERACTIVE",
  adapter: "chrome-devtools-mcp",
  operation: "inspect_network",
  target_ref: "CAPABILITY.COST_ANALYSIS",
  surface: "BOUNDARY_IO",
  artifact_refs: [
    {
      ref_type: "blob",
      blob: {
        sha256: SCREENSHOT_BLOB.sha256,
        media: "screenshot",
        byte_size: 2048,
        storage_path: SCREENSHOT_BLOB.storagePath,
      },
    },
  ],
  normalized_facts: ["request_status: 200", "response_items: 0"],
  result: "OBSERVED",
  captured_at_seq: 182,
};

describe("17-perception-receipts.schema.json", () => {
  it("$id 形态对齐 v1-draft 契约且已注册进 allSchemas（挂载同一性；计数锚住五 domain spec 同款断言）", () => {
    expect(perceptionReceiptsSchema.$id).toBe(
      "https://pomaster.dev/schemas/perception-receipts/v1-draft.json",
    );
    expect(allSchemas.perceptionReceipts).toBe(perceptionReceiptsSchema);
  });

  it("正例：§6.7 READY 环境回执 / §6.13 OBSERVED 观察回执（yaml 例文转录）/ Case H 实测 null 形态 / Case I NOT_OBSERVABLE 空 refs 留痕形态", () => {
    expect(validateReceipts(READY_ENV_RECEIPT)).toBe(true);
    expect(validateReceipts(OBSERVED_RECEIPT)).toBe(true);
    // Case H blocked 证据链消费位：实测未确认位 null 显式缺席 + verdict 二值第二态。
    expect(
      validateReceipts({
        ...READY_ENV_RECEIPT,
        revision_ref: null,
        base_url: null,
        doctor_verdict: "WRONG_OR_UNVERIFIED_INSTANCE",
      }),
    ).toBe(true);
    // Case I：负观察词形空 refs 合法（NOT_OBSERVABLE 不是验证主张）。
    expect(
      validateReceipts({
        ...OBSERVED_RECEIPT,
        journey_ref: null,
        environment_receipt_ref: null,
        artifact_refs: [],
        normalized_facts: ["network_capture_empty: true"],
        result: "NOT_OBSERVABLE",
      }),
    ).toBe(true);
  });

  it("Benchmark E 封条（schema 级）：OBSERVED + artifact_refs 空数组 → 校验失败（Receipt 不得冒充有效业务 Evidence）", () => {
    const fakeEvidence = { ...OBSERVED_RECEIPT, artifact_refs: [] };
    expect(validateReceipts(fakeEvidence)).toBe(false);
    // 同一形态仅改负观察词形即合法（封条只咬 OBSERVED 主张）。
    expect(
      validateReceipts({ ...fakeEvidence, result: "INCONCLUSIVE" }),
    ).toBe(true);
  });

  it("反例族：record_type 判别词表外 / OBS 点形 / EVR- 词形 / AGX 词形漂移 / surface 词轴外 / result 词轴外（含 CAPABILITY_DEGRADED 撞族）/ captured_at_seq 词形漂移 / 附加键（闭形态）", () => {
    expect(validateReceipts({ ...READY_ENV_RECEIPT, record_type: "receipt" })).toBe(false);
    expect(validateReceipts({ ...OBSERVED_RECEIPT, observation_id: "OBS.NETWORK.17" })).toBe(false);
    expect(validateReceipts({ ...OBSERVED_RECEIPT, environment_receipt_ref: "EVR-9" })).toBe(false);
    expect(validateReceipts({ ...OBSERVED_RECEIPT, execution_id: "EXEC-2026-00182" })).toBe(false);
    expect(validateReceipts({ ...OBSERVED_RECEIPT, surface: "USER_UI" })).toBe(false);
    // 撞族消歧（裁决 8）：CAPABILITY_DEGRADED 是降级呈现词非观察结果——结构性拒收。
    expect(validateReceipts({ ...OBSERVED_RECEIPT, result: "CAPABILITY_DEGRADED" })).toBe(false);
    expect(validateReceipts({ ...OBSERVED_RECEIPT, captured_at_seq: "182" })).toBe(false);
    expect(validateReceipts({ ...OBSERVED_RECEIPT, agent_note: "自由散文位不存在" })).toBe(false);
    // target_ref 词形：governed object_id 文法（CAPABILITY.* 合法 / 小写拒收）。
    expect(validateReceipts({ ...OBSERVED_RECEIPT, target_ref: "capability.lowercase" })).toBe(false);
    // journey_ref 词形：JOURNEY.* 点族（null 合法 / 裸词拒收）。
    expect(validateReceipts({ ...OBSERVED_RECEIPT, journey_ref: "cost_analysis" })).toBe(false);
  });

  it("schema 内置 examples[0..2] 全过校验、examples[3]（OBSERVED 空 refs 反例）拒收", () => {
    const examples = perceptionReceiptsSchema["examples"] as readonly unknown[];
    expect(examples.length).toBe(4);
    for (const example of examples.slice(0, 3)) {
      expect(validateReceipts(example)).toBe(true);
    }
    expect(validateReceipts(examples[3])).toBe(false);
  });
});
