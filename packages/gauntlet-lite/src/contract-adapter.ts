/**
 * contract-adapter.ts —— CONTRACT 门禁 adapter（G5 谱系扩展；config 驱动最小实现）。
 *
 * 职责（§59 四段，全部走既有 GateAdapter 契约，产出过 03 schema）：
 * - detect：读项目根 contract-gate.json（声明 openapi 文件路径 + 待验 operation_id 清单，
 *   清单来自 Project Baseline/config）——声明齐备 → READY；未声明/不可解析/形态非法 →
 *   NOT_INSTALLED（缺席理由 + 落位指引，禁静默）。
 * - prepare：纯数据执行计划；未声明 → plan.declared=false（缺席沿管线走到 normalize，
 *   以 verdict=not_configured 显式落账——诚实缺席，非 passed，也非 not_run：
 *   03 七态语义「not_configured = 检查前提缺失，是终局性诚实结论而非通过」）。
 * - run：解析 openapi 文本，逐行提取 operationId 集合（宽容 YAML/JSON 两种词形的
 *   行级扫描；零第三方 YAML 依赖，D13）。
 * - normalize：声明的 operation_id 清单 × 文档实际集合做存在性对账——
 *   缺失 → failed（violations=缺失数 + items 明细）；全命中 → passed；
 *   空清单 → warning（zero_declared_operations_nothing_verified，报绿的机器自我怀疑）；
 *   openapi 文件不可读 → not_run（非绿非红）；未声明 → not_configured。
 *
 * D24：本文件不计算任何 sha；D13：零运行时第三方依赖；A4：机器字段一律以
 * policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import { readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  DetectionResult,
  DetectorFacts,
  GateAdapter,
  GatePolicy,
  GateResultRecord,
  GateScope,
  NormalizeContext,
} from "./adapter-types.js";
import { GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import { platformDetectorFacts } from "./detectors.js";
import {
  absenceRecord,
  assertCommonGates,
  capItems,
  type RecordPlanFields,
} from "./normalize-common.js";

// ============================================================
// 口径常量（gate 名不属 vocab-lock 管辖；新增 gate 须经 gate_def 版本化登记）
// ============================================================

export const CONTRACT_GATE_NAME = "CONTRACT";
export const CONTRACT_GATE_DEF = "POLICY.GATE.CONTRACT@0.1.0";
export const CONTRACT_TOOL_ID = "gauntlet:contract";
export const CONTRACT_METRIC_DIALECT = "contract:operation_id_existence";
export const CONTRACT_GATE_CONFIG_FILE = "contract-gate.json";

export const CONTRACT_CONFIG_HINT =
  "在项目根 contract-gate.json 声明对账输入：" +
  '{"openapi":"spec/openapi.yaml","expectedOperationIds":["getUser","createUser"]}——' +
  "未声明 openapi 是诚实缺席（not_configured），不会被记为通过";

// ============================================================
// 配置读取与探测
// ============================================================

export interface ContractGateConfig {
  /** openapi 文件的仓内相对路径。 */
  readonly openapi: string;
  /** 待验 operation_id 清单（分母；空数组合法 → normalize 判 warning 零对账）。 */
  readonly expectedOperationIds: readonly string[];
}

export type ContractConfigRead =
  | { readonly ok: true; readonly config: ContractGateConfig; readonly evidence: string }
  | { readonly ok: false; readonly reason: string; readonly installHint: string };

/** 读 contract-gate.json（facts 注入，探测矩阵零隐式 I/O）。 */
export function readContractConfig(facts: DetectorFacts): ContractConfigRead {
  const configPath = facts.joinPath(facts.projectRoot, CONTRACT_GATE_CONFIG_FILE);
  const raw = facts.readTextFile(configPath);
  if (raw === null) {
    return {
      ok: false,
      reason: `未找到 ${CONTRACT_GATE_CONFIG_FILE}（CONTRACT 门禁的对账输入未声明：openapi 路径 + 待验 operation_id 清单）`,
      installHint: `配置指引：${CONTRACT_CONFIG_HINT}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: `${CONTRACT_GATE_CONFIG_FILE} 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默`,
      installHint: `修复 JSON 语法；形态见：${CONTRACT_CONFIG_HINT}`,
    };
  }
  const loose =
    parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  const openapi = loose === null ? undefined : loose["openapi"];
  const expected = loose === null ? undefined : loose["expectedOperationIds"];
  if (typeof openapi !== "string" || openapi.trim().length === 0) {
    return {
      ok: false,
      reason: `${CONTRACT_GATE_CONFIG_FILE} 缺少非空字符串字段 openapi（openapi 文件路径）`,
      installHint: `字段形态见：${CONTRACT_CONFIG_HINT}`,
    };
  }
  if (
    !Array.isArray(expected) ||
    expected.some((id) => typeof id !== "string" || id.length === 0)
  ) {
    return {
      ok: false,
      reason: `${CONTRACT_GATE_CONFIG_FILE} 缺少 expectedOperationIds 数组（或含非字符串/空串元素）——待验清单是对账分母，必须显式（可为空数组 = 零对账的显式声明）`,
      installHint: `字段形态见：${CONTRACT_CONFIG_HINT}`,
    };
  }
  return {
    ok: true,
    config: { openapi, expectedOperationIds: expected as readonly string[] },
    evidence: `配置文件命中: ${configPath}（openapi=${openapi}，待验 ${expected.length} 个 operation_id）`,
  };
}

// ============================================================
// operationId 提取（宽容 YAML / JSON 两种词形的行级扫描）
// ============================================================

const OPERATION_ID_LINE =
  /^\s*"?operationId"?\s*:\s*"?([A-Za-z0-9_.-]+)"?\s*,?\s*(?:#.*)?$/;

/** 逐行提取 operationId（出现序保留、文档内去重由对账侧 Set 承担）。 */
export function extractOperationIds(text: string): string[] {
  const ids: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = OPERATION_ID_LINE.exec(line);
    if (m !== null && m[1] !== undefined) {
      ids.push(m[1]);
    }
  }
  return ids;
}

// ============================================================
// 计划与执行
// ============================================================

export interface ContractGatePlan extends RecordPlanFields {
  readonly projectRoot: string;
  /** false = 未声明 openapi（缺席沿管线走 normalize → not_configured，非 passed）。 */
  readonly declared: boolean;
  readonly openapiPath: string | null;
  readonly expectedOperationIds: readonly string[];
  readonly absentReason: string | null;
  /** 版本锚（policy 供给；normalize 对账 tool_version 漂移）。 */
  readonly expectedToolVersion: string | null;
  readonly trigger: RunTriggerValue;
}

export type ContractRunOutput = {
  readonly plan: ContractGatePlan;
  readonly outcome: "not_declared" | "openapi_unreadable" | "reconciled";
  /** openapi 文档中实际出现的 operationId（文档序）。 */
  readonly operationIdsFound: readonly string[];
  readonly externalMs: number;
};

/** CONTRACT 门禁 adapter（config 驱动存在性对账；无子进程，run 为进程内解析）。 */
export function createContractAdapter(): GateAdapter<
  DetectionResult,
  ContractGatePlan,
  ContractRunOutput
> {
  return {
    adapterId: "gauntlet-lite:contract",

    detect(facts: DetectorFacts): DetectionResult {
      const read = readContractConfig(facts);
      if (read.ok) {
        return {
          status: "READY",
          tool: CONTRACT_TOOL_ID,
          detectedVersion: GAUNTLET_LITE_VERSION,
          evidence: read.evidence,
        };
      }
      return {
        status: "NOT_INSTALLED",
        tool: CONTRACT_TOOL_ID,
        reason: read.reason,
        installHint: read.installHint,
      };
    },

    prepare(
      scope: GateScope,
      policy: GatePolicy,
      facts?: DetectorFacts,
    ): ContractGatePlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const read = readContractConfig(resolved);
      const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
      const common = {
        tool: CONTRACT_TOOL_ID,
        toolVersion: GAUNTLET_LITE_VERSION,
        gate: CONTRACT_GATE_NAME,
        gateDef: CONTRACT_GATE_DEF,
        metricDialect: CONTRACT_METRIC_DIALECT,
        grn: policy.grn,
        ranAtSeq: policy.ranAtSeq,
        trigger,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        projectRoot: scope.projectRoot,
        expectedToolVersion: policy.expectedToolVersion ?? null,
      };
      if (!read.ok) {
        return {
          ...common,
          declared: false,
          openapiPath: null,
          expectedOperationIds: [],
          absentReason: read.reason,
        };
      }
      return {
        ...common,
        declared: true,
        openapiPath: read.config.openapi,
        expectedOperationIds: read.config.expectedOperationIds,
        absentReason: null,
      };
    },

    run(plan: ContractGatePlan): ContractRunOutput {
      const startedAt = performance.now();
      if (!plan.declared || plan.openapiPath === null) {
        return {
          plan,
          outcome: "not_declared",
          operationIdsFound: [],
          externalMs: Math.max(0, Math.round(performance.now() - startedAt)),
        };
      }
      let text: string;
      try {
        text = readFileSync(pathJoin(plan.projectRoot, plan.openapiPath), "utf8");
      } catch {
        return {
          plan,
          outcome: "openapi_unreadable",
          operationIdsFound: [],
          externalMs: Math.max(0, Math.round(performance.now() - startedAt)),
        };
      }
      return {
        plan,
        outcome: "reconciled",
        operationIdsFound: extractOperationIds(text),
        externalMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    },

    normalize(raw: ContractRunOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;
      assertCommonGates(plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));

      if (raw.outcome === "not_declared") {
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "未声明 openapi 对账配置"}；指引：${CONTRACT_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
      }
      if (raw.outcome === "openapi_unreadable") {
        return absenceRecord(
          plan,
          "not_run",
          `声明的 openapi 文件不可读：${plan.openapiPath ?? "(null)"}——核对 contract-gate.json 的 openapi 路径后重跑（非绿非红，禁静默当通过）`,
          selfMs,
          raw.externalMs,
        );
      }

      // —— 存在性对账（C5：文档集合为重算依据；声明清单是对账分母）——
      const expected = plan.expectedOperationIds;
      const foundSet = new Set(raw.operationIdsFound);
      const missing = expected.filter((id) => !foundSet.has(id));
      const expectedSet = new Set(expected);
      const extraCount = raw.operationIdsFound.filter((id) => !expectedSet.has(id)).length;

      const caps: string[] = [];
      if (
        plan.expectedToolVersion !== null &&
        plan.toolVersion !== plan.expectedToolVersion
      ) {
        caps.push("tool_version_drifted");
      }

      let verdict: VerdictValue;
      let capReason: string | null;
      if (missing.length > 0) {
        verdict = "failed";
        capReason = null;
      } else if (expected.length === 0) {
        // 空清单 = 声明了口径但零对账——报绿的机器自我怀疑机械化（warning，非 passed）。
        verdict = "warning";
        capReason = "zero_declared_operations_nothing_verified";
      } else {
        verdict = caps.length > 0 ? "warning" : "passed";
        capReason = caps.length > 0 ? caps.join("+") : null;
      }

      const items = missing.map((id) => ({
        rule: "operation_id_missing",
        location: `${plan.openapiPath ?? "openapi"}#${id}`,
        message: `声明的 operation_id '${id}' 未在 openapi 文档中出现`,
      }));
      const cappedItems = capItems(items);

      const record: GateResult = {
        grn: plan.grn,
        gate: plan.gate,
        gateDef: plan.gateDef,
        ranAtSeq: plan.ranAtSeq,
        verdict,
        verdictCapReason: capReason,
        subjectId:
          plan.subjectId === null ? null : (plan.subjectId as GateResult["subjectId"]),
        isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
        denominatorRefs: plan.denominatorRefs.map((ref) => ({
          id: ref.id as GateResult["denominatorRefs"][number]["id"],
          versionSeen: ref.versionSeen,
        })),
        counts: {
          scanned: expected.length,
          applicableScanned: expected.length,
          violations: missing.length,
          // 显式零：声明清单即分母，清单内不存在「不适用」项（C1 的数字在场即可）。
          notApplicable: 0,
        },
        blindspot: {
          // 载体 = 声明的 operation_id；未在文档命中的即盲区逃逸（与 violations 同源口径）。
          scanned: expected.length,
          produced: expected.length - missing.length,
          escapeRatio:
            expected.length === 0 ? 0 : missing.length / expected.length,
        },
        trust: {
          asserted: null, // 无工具自报：对账纯重算（C5）。
          recomputed: { violations: missing.length, matchesAsserted: true },
        },
        durationMs: { self: selfMs, external: raw.externalMs },
      };
      return {
        ...record,
        tool: plan.tool,
        toolVersion: plan.toolVersion,
        metricDialect: plan.metricDialect,
        ...(extraCount > 0
          ? {
              scopeNote: `对账分母外另有 ${extraCount} 个未声明 operationId（不在本次对账口径内，显式留痕）`,
            }
          : {}),
        ...(cappedItems.items.length > 0 ? { items: cappedItems.items } : {}),
        ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
      };
    },
  };
}
