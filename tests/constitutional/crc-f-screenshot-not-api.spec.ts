/**
 * CRC-F —— 截图不能证明 API（Constitutional Regression Case F；纠错清单 §31 Case 6 +
 * PRD 修订版 §9B CRC-F 行：Sensor capability 失配 → NOT_OBSERVABLE/NOT_RUN，非 PASS）。
 *
 * 【命名纪律声明（Batch 5 R1，全套件统一）】本套件是 vNext Constitutional Regression
 * Suite，文件一律 CRC-<X>- 前缀，与三套既有 "Case/宪法" 命名显式划界：
 * 1) PRD v0.4/0.5.2 §16 旧 Case A-H（另一套编号；§16 Case H=环境回执 revision 失配，
 *    perception.spec.ts:351 测试题已按 Batch 5 处置加注消解，与本 CRC-F 无关）；
 * 2) dot-pomaster-directory-constitution.md 目录宪法 §2/§11/§24/§34；
 * 3) benchmarks/constitutional.mjs 的 Constitutional/Architecture Change 性能基准档。
 * 三者均非本套件；本套件禁裸用 "Case A-H" 词形。
 *
 * 【规范锚】纠错 §31 Case 6 原文：「Browser UI correct / Network sensor missing /
 * Expected: UI may pass. API payload = NOT_OBSERVABLE / NOT_RUN。」PRD §9B CRC-F：
 * Sensor capability 失配 → NOT_OBSERVABLE/NOT_RUN，非 PASS。
 *
 * 【联合锚设计（R3 端到端补齐）】分立检查已有封闭测试：perception.spec.ts:670（Case I
 * 截图≠payload，NOT_OBSERVABLE 侧）、browser-adapter.spec.ts:247（缺件→not_run）、
 * :416（假证据三件全拒）。本 CRC 补 verify 报告 Case F 两缺口：
 * ① **sensor 失配显式判卷**——申报 sensor X、实际由 sensor Y 执行（capability 失配）
 *   的诚实申报词形走负观察判定器 declared 通路（SENSOR_UNAVAILABLE/NOT_OBSERVABLE），
 *   产出恒落七负值闭包、结构性不产出 OBSERVED（≠ PASS/deterministic）；
 * ② **OBSERVED 侧 media 交叉校验缝收口**（Batch 5 唯一产品判定改动，perception.ts
 *   buildObservationReceipt 的最小闸）——OBSERVED 且全部 artifact media 皆为
 *   "screenshot" 而 operation 非 "screenshot" → SCHEMA_INVALID（截图不能证明 API）；
 *   正对照三形态（对应 sensor 产物 media / 身份一致 / 混合辅证在场）不受闸。
 *   ADR-lite 最小性论证见 perception.ts 头注 Batch 5 增量段：零新词轴（"screenshot"
 *   取 catalog/sensors 材料 operations/evidence_types 双侧既有词形 + 07 blob_ref media
 *   开放词先例）、只封 screenshot-only 冒充单一形态、17 号 schema 维持词形冻结面
 *   （absencePreconditions 四前提闸同款「组装层判定严于 schema」分层先例）。
 *
 * 独立性：纯 kernel 进程内（L1），零网络/外部工具（sensor 腿=fixture/注入形态），
 * 确定性零墙钟，Windows 可跑。
 */
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GovernanceError,
  buildObservationReceipt,
  judgeNegativeObservation,
  OBSERVATION_RESULT_VALUES,
  type ObservationReceiptInput,
} from "@pomaster/kernel";
import { makeCrcRoot } from "./crc-lib.js";

let root: string;

beforeAll(() => {
  root = makeCrcRoot("f");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** blob fixture（media 词形取 catalog/sensors 材料 evidence_types 既有词形；词面零新增）。 */
const SCREENSHOT_BLOB = {
  sha256: `sha256:${"3f".repeat(32)}`,
  media: "screenshot",
  byteSize: 2048,
  storagePath: `blobs/sha256/3f/${"3f".repeat(31)}`,
} as const;
const NETWORK_BLOB = {
  sha256: `sha256:${"c2".repeat(32)}`,
  media: "network_observation",
  byteSize: 4096,
  storagePath: `blobs/sha256/c2/${"c2".repeat(31)}`,
} as const;

/** 申报 sensor X（INTERACTIVE 具备 inspect_network 能力）、实际由 sensor Y（DETERMINISTIC）执行的失配回执输入基线。 */
function mismatchedInput(overrides: Partial<ObservationReceiptInput> = {}): ObservationReceiptInput {
  return {
    observationId: "OBS-201",
    executionId: "AGX-2026-00201",
    sensorCapability: "SENSOR.BROWSER.DETERMINISTIC", // 实际执行 sensor Y（无 inspect_network 能力）
    adapter: "playwright",
    operation: "inspect_network", // 申报的观察动作需要 sensor X
    surface: "BOUNDARY_IO",
    artifactRefs: [],
    normalizedFacts: [],
    result: "NOT_OBSERVABLE",
    capturedAtSeq: 201,
    ...overrides,
  };
}

describe("CRC-F：截图不能证明 API——sensor 失配显式判卷 + OBSERVED 侧 media 交叉校验缝（§9B 行 F）", () => {
  it("sensor 失配显式判卷：实际执行 sensor 无该面观察能力 → 负观察判定器 declared 通路产出 NOT_OBSERVABLE（≠ OBSERVED，恒落七负值闭包）", () => {
    // 失配的诚实申报：capability 失配 = 该面不可观察（declared 通路词形）。
    const judged = judgeNegativeObservation({
      declared: ["NOT_OBSERVABLE"],
      captureEmpty: true,
      correctPage: true,
      correctInstance: true,
      sensorWorked: false, // 申报的 sensor 未实际工作（实际跑的是另一个 sensor）
      captureWindowCoveredOperation: false,
    });
    expect(judged.result).toBe("NOT_OBSERVABLE");
    expect(OBSERVATION_RESULT_VALUES).toContain(judged.result);
    // 判定器结构性不说「看到了」：七负值闭包是负观察判定的全部产出空间。
    expect(judged.result).not.toBe("OBSERVED");
    // 同场对照：sensor 不可用申报 → SENSOR_UNAVAILABLE（≠ NOT_OBSERVABLE——两词形互不等价，各表其因）。
    const unavailable = judgeNegativeObservation({
      declared: ["SENSOR_UNAVAILABLE"],
      captureEmpty: true,
      correctPage: true,
      correctInstance: true,
      sensorWorked: false,
      captureWindowCoveredOperation: false,
    });
    expect(unavailable.result).toBe("SENSOR_UNAVAILABLE");
    expect(unavailable.result).not.toBe(judged.result);
  });

  it("失配回执组装：NOT_OBSERVABLE 携 screenshot 留痕合法（Case I 形态）——留痕不是验证主张，result 非绿向词形", () => {
    const receipt = buildObservationReceipt(
      mismatchedInput({ artifactRefs: [SCREENSHOT_BLOB], normalizedFacts: ["screenshot_persisted: true"] }),
    );
    expect(receipt.result).toBe("NOT_OBSERVABLE");
    expect(receipt.artifact_refs).toEqual([SCREENSHOT_BLOB]);
    expect(receipt.sensor_capability).toBe("SENSOR.BROWSER.DETERMINISTIC");
  });

  it("缝口收口（Batch 5 产品判定）：OBSERVED + inspect_network + screenshot-only refs → SCHEMA_INVALID（截图不能证明 API）", () => {
    const errInput = mismatchedInput({
      sensorCapability: "SENSOR.BROWSER.INTERACTIVE",
      result: "OBSERVED",
      artifactRefs: [SCREENSHOT_BLOB], // 唯一「证据」是截图
      normalizedFacts: ["request_status: 200"],
    });
    let err: unknown;
    try {
      buildObservationReceipt(errInput);
    } catch (e: unknown) {
      err = e;
    }
    expect(err).toBeInstanceOf(GovernanceError);
    const governanceErr = err as GovernanceError;
    expect(governanceErr.code).toBe("SCHEMA_INVALID");
    const invalidFields = (
      governanceErr.details as { invalid_values: readonly { field: string }[] }
    ).invalid_values.map((entry) => entry.field);
    expect(invalidFields).toContain("artifactRefs.media");
    expect(governanceErr.hint).toContain("截图不能证明");
  });

  it("正对照三形态（最小判定边界）：对应 sensor 产物 media 合法 / screenshot 操作身份一致合法 / 混合 refs（截图作辅证）合法", () => {
    // ① payload 类事实由对应 sensor 产物背书 → 合法。
    const grounded = buildObservationReceipt(
      mismatchedInput({
        sensorCapability: "SENSOR.BROWSER.INTERACTIVE",
        result: "OBSERVED",
        artifactRefs: [NETWORK_BLOB],
        normalizedFacts: ["request_status: 200"],
      }),
    );
    expect(grounded.result).toBe("OBSERVED");
    // ② screenshot 操作 + screenshot 产物（身份一致）→ 合法。
    const identity = buildObservationReceipt(
      mismatchedInput({
        sensorCapability: "SENSOR.BROWSER.INTERACTIVE",
        operation: "screenshot",
        surface: "USER_SURFACE",
        result: "OBSERVED",
        artifactRefs: [SCREENSHOT_BLOB],
        normalizedFacts: ["screenshot_persisted: true"],
      }),
    );
    expect(identity.result).toBe("OBSERVED");
    // ③ 混合 refs：screenshot 作辅证在场、payload 主证在座 → 合法（辅证在场不拒——最小侵入）。
    const mixed = buildObservationReceipt(
      mismatchedInput({
        sensorCapability: "SENSOR.BROWSER.INTERACTIVE",
        result: "OBSERVED",
        artifactRefs: [SCREENSHOT_BLOB, NETWORK_BLOB],
        normalizedFacts: ["request_status: 200"],
      }),
    );
    expect(mixed.result).toBe("OBSERVED");
    expect(mixed.artifact_refs).toHaveLength(2);
  });
});
