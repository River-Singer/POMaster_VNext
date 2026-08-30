/**
 * contract-adapter.ts —— CONTRACT 门禁 adapter（G5 谱系扩展；P22 双口径：存在性对账 +
 * oasdiff breaking-change diff 执行腿）。
 *
 * 职责（§59 四段，全部走既有 GateAdapter 契约，产出过 03 schema）：
 * - detect：读项目根 contract-gate.json——两种机判口径（一份配置声明一个口径，互斥）：
 *   · operation_ids 口径：声明 openapi 文件路径 + 待验 operation_id 清单（清单来自
 *   Project Baseline/config）——声明齐备 → READY；
 *   · breaking_diff 口径（P22 / gaps A6 / D18 P0 点名）：声明 breakingDiff.base +
 *   openapi（受检方 current），并要求 PATH 上 oasdiff 在位（detectOasdiff）——工具缺席
 *   → NOT_INSTALLED（缺席理由 + 安装指引，禁静默）；
 *   未声明/不可解析/形态非法/两口径混声明 → NOT_INSTALLED（缺席理由 + 落位指引，禁静默）。
 * - prepare：纯数据执行计划；未声明 → plan.declared=false + absenceKind（config_absent
 *   沿管线走到 normalize 落 verdict=not_configured；tool_absent 落 not_run——诚实缺席，
 *   非 passed：03 七态语义「缺席是终局性诚实结论而非通过」）。breaking_diff 腿强制
 *   policy.expectedToolVersion 版本锚（oasdiff 版本无法从配置文件可靠探测——pytest 腿
 *   同款纪律，run 期 `oasdiff --version` 实测对账，禁伪造 semver）。
 * - run：
 *   · operation_ids：解析 openapi 文本，逐行提取 operationId 集合（宽容 YAML/JSON 两种
 *   词形的行级扫描；零第三方 YAML 依赖，D13）；
 *   · breaking_diff：runOasdiffLeg（版本探测 + `oasdiff breaking --format json` 真执行，
 *   见 oasdiff-leg.ts）。
 * - normalize：
 *   · operation_ids：声明的 operation_id 清单 × 文档实际集合做存在性对账——缺失 →
 *   failed（violations=缺失数 + items 明细）；全命中 → passed；空清单 → warning
 *   （zero_declared_operations_nothing_verified，报绿的机器自我怀疑）；openapi 文件不可读
 *   → not_run（非绿非红）；未声明 → not_configured。
 *   · breaking_diff：normalizeOasdiffLeg（violations=breaking changes 重算计数 + 明细
 *   items；oasdiff 缺席/执行错误 → not_run 非绿非红）。
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
  SpawnFn,
} from "./adapter-types.js";
import { GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import { GateAdapterError } from "./adapter-types.js";
import { detectOasdiff, platformDetectorFacts } from "./detectors.js";
import {
  DEFAULT_LEG_TIMEOUT_MS,
  OASDIFF_METRIC_DIALECT,
  OASDIFF_RUN_COMMAND_PREFIX,
  OASDIFF_TOOL_ID,
  OASDIFF_VERSION_PROBE_COMMAND,
  normalizeOasdiffLeg,
  oasdiffSpawn,
  runOasdiffLeg,
  type OasdiffLegOutput,
  type OasdiffLegPlan,
} from "./oasdiff-leg.js";
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
  "在项目根 contract-gate.json 声明对账输入，两种机判口径二选一（互斥，一份配置一个口径）：" +
  '存在性对账 {"openapi":"spec/openapi.yaml","expectedOperationIds":["getUser","createUser"]}；' +
  'breaking-change diff（P22/D18）{"openapi":"spec/openapi.yaml","breakingDiff":{"base":"spec/openapi.base.yaml"}}（需 PATH 上有 oasdiff）——' +
  "未声明是诚实缺席（not_configured），不会被记为通过";

// ============================================================
// 配置读取与探测
// ============================================================

/**
 * contract-gate.json 判别联合：一份配置声明一个机判口径（横切纪律 2——
 * 一条 GateResult 只携带一个 metric_dialect，两口径混声明即形态非法）。
 */
export type ContractGateConfig =
  | {
      readonly mode: "operation_ids";
      /** openapi 文件的仓内相对路径。 */
      readonly openapi: string;
      /** 待验 operation_id 清单（分母；空数组合法 → normalize 判 warning 零对账）。 */
      readonly expectedOperationIds: readonly string[];
    }
  | {
      readonly mode: "breaking_diff";
      /** 受检方（新版本）openapi 文件的仓内相对路径。 */
      readonly openapi: string;
      /** 对比基线（旧版本）openapi 文件的仓内相对路径（breakingDiff.base）。 */
      readonly breakingBase: string;
    };

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
      reason: `未找到 ${CONTRACT_GATE_CONFIG_FILE}（CONTRACT 门禁的对账输入未声明：operation_ids 口径或 breakingDiff 口径）`,
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
  const breakingDiff = loose === null ? undefined : loose["breakingDiff"];
  if (typeof openapi !== "string" || openapi.trim().length === 0) {
    return {
      ok: false,
      reason: `${CONTRACT_GATE_CONFIG_FILE} 缺少非空字符串字段 openapi（openapi 文件路径）`,
      installHint: `字段形态见：${CONTRACT_CONFIG_HINT}`,
    };
  }
  // —— breaking_diff 口径（P22）：breakingDiff.base 声明 + 与 expectedOperationIds 互斥 ——
  if (breakingDiff !== undefined) {
    const diffLoose =
      breakingDiff !== null && typeof breakingDiff === "object"
        ? (breakingDiff as Record<string, unknown>)
        : null;
    const base = diffLoose === null ? undefined : diffLoose["base"];
    if (
      diffLoose === null ||
      typeof base !== "string" ||
      base.trim().length === 0
    ) {
      return {
        ok: false,
        reason: `${CONTRACT_GATE_CONFIG_FILE} 的 breakingDiff 缺少非空字符串字段 base（对比基线 openapi 路径）`,
        installHint: `字段形态见：${CONTRACT_CONFIG_HINT}`,
      };
    }
    if (expected !== undefined) {
      return {
        ok: false,
        reason: `${CONTRACT_GATE_CONFIG_FILE} 同时声明 breakingDiff 与 expectedOperationIds——两种机判口径互斥（一条 GateResult 只携带一个 metric_dialect，混声明即口径漂移）；分两次判卷，各自声明一份配置`,
        installHint: `口径形态见：${CONTRACT_CONFIG_HINT}`,
      };
    }
    return {
      ok: true,
      config: { mode: "breaking_diff", openapi, breakingBase: base },
      evidence: `配置文件命中: ${configPath}（breaking_diff 口径：base=${base}，current=${openapi}）`,
    };
  }
  // —— operation_ids 口径（既有）——
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
    config: {
      mode: "operation_ids",
      openapi,
      expectedOperationIds: expected as readonly string[],
    },
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

/**
 * 缺席种类（normalize 判卷分流）：config_absent = 对账配置未声明/坏形 → not_configured；
 * tool_absent = 配置就绪但 breaking_diff 腿的 oasdiff 不在位 → not_run（非绿非红）。
 */
export type ContractAbsenceKind = "config_absent" | "tool_absent";

export interface ContractGatePlan extends RecordPlanFields {
  readonly projectRoot: string;
  /** 机判口径（P22 双口径：operation_ids 既有对账 / breaking_diff oasdiff 执行腿）。 */
  readonly mode: "operation_ids" | "breaking_diff";
  /** false = 缺席（absenceKind 分流到 normalize 的 not_configured / not_run）。 */
  readonly declared: boolean;
  readonly absenceKind: ContractAbsenceKind | null;
  readonly openapiPath: string | null;
  readonly expectedOperationIds: readonly string[];
  /** breaking_diff 口径的对比基线（旧版本）仓内相对路径；其余口径 null。 */
  readonly breakingBasePath: string | null;
  readonly absentReason: string | null;
  readonly installHint: string | null;
  /** breaking_diff 腿执行计划；其余口径 null（prepare 组装，run 直接消费）。 */
  readonly oasdiffPlan: OasdiffLegPlan | null;
  /** 版本锚（policy 供给；normalize 对账 tool_version 漂移）。 */
  readonly expectedToolVersion: string | null;
  readonly trigger: RunTriggerValue;
}

export type ContractRunOutput =
  | {
      readonly plan: ContractGatePlan;
      readonly outcome: "not_declared";
      readonly externalMs: number;
    }
  | {
      readonly plan: ContractGatePlan;
      readonly outcome: "openapi_unreadable" | "reconciled";
      /** openapi 文档中实际出现的 operationId（文档序；仅 operation_ids 口径）。 */
      readonly operationIdsFound: readonly string[];
      readonly externalMs: number;
    }
  | {
      readonly plan: ContractGatePlan;
      readonly outcome: "breaking_diff";
      readonly leg: OasdiffLegOutput;
      readonly externalMs: number;
    };

/**
 * CONTRACT 门禁 adapter（P22 双口径：config 驱动存在性对账 + oasdiff breaking-change
 * diff 执行腿）。breaking_diff 腿经注入的 spawnFn 执行（§59 run 第二参；缺省
 * oasdiffSpawn = PATH 消毒 + shell:true，Windows .cmd shim 可解析）。
 */
export function createContractAdapter(
  options: {
    /** 注入 oasdiff 腿 spawn（测试 fake / 显式装配）；缺省 oasdiffSpawn。 */
    readonly oasdiffSpawnFn?: SpawnFn;
  } = {},
): GateAdapter<
  DetectionResult,
  ContractGatePlan,
  ContractRunOutput
> {
  const oasdiffSpawnFn = options.oasdiffSpawnFn ?? oasdiffSpawn;
  return {
    adapterId: "gauntlet-lite:contract",

    detect(facts: DetectorFacts): DetectionResult {
      const read = readContractConfig(facts);
      if (!read.ok) {
        return {
          status: "NOT_INSTALLED",
          tool: CONTRACT_TOOL_ID,
          reason: read.reason,
          installHint: read.installHint,
        };
      }
      if (read.config.mode === "operation_ids") {
        return {
          status: "READY",
          tool: CONTRACT_TOOL_ID,
          detectedVersion: GAUNTLET_LITE_VERSION,
          evidence: read.evidence,
        };
      }
      // breaking_diff 口径：配置就绪还不够，PATH 上必须有 oasdiff（D18 执行腿前提）。
      const tool = detectOasdiff(facts);
      if (tool.status === "READY") {
        return {
          status: "READY",
          tool: OASDIFF_TOOL_ID,
          detectedVersion: null,
          evidence: `${read.evidence}；${tool.evidence}`,
        };
      }
      return {
        status: "NOT_INSTALLED",
        tool: OASDIFF_TOOL_ID,
        reason:
          tool.status === "NOT_INSTALLED"
            ? `breaking_diff 口径声明就绪但 ${tool.reason}`
            : `breaking_diff 口径声明就绪但 oasdiff 探测态异常：${tool.status}`,
        installHint:
          tool.status === "NOT_INSTALLED" ? tool.installHint : CONTRACT_CONFIG_HINT,
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
          mode: "operation_ids",
          declared: false,
          absenceKind: "config_absent",
          openapiPath: null,
          expectedOperationIds: [],
          breakingBasePath: null,
          absentReason: read.reason,
          installHint: read.installHint,
          oasdiffPlan: null,
        };
      }
      if (read.config.mode === "operation_ids") {
        return {
          ...common,
          mode: "operation_ids",
          declared: true,
          absenceKind: null,
          openapiPath: read.config.openapi,
          expectedOperationIds: read.config.expectedOperationIds,
          breakingBasePath: null,
          absentReason: null,
          installHint: null,
          oasdiffPlan: null,
        };
      }

      // —— breaking_diff 口径：oasdiff 在位性 + 版本锚强制（pytest 腿同款纪律）——
      const detection = detectOasdiff(resolved);
      if (detection.status !== "READY") {
        const absentReason =
          detection.status === "NOT_INSTALLED"
            ? detection.reason
            : `oasdiff 探测态异常：${detection.status}`;
        return {
          ...common,
          mode: "breaking_diff",
          declared: false,
          absenceKind: "tool_absent",
          openapiPath: read.config.openapi,
          expectedOperationIds: [],
          breakingBasePath: read.config.breakingBase,
          absentReason,
          installHint:
            detection.status === "NOT_INSTALLED" ? detection.installHint : null,
          oasdiffPlan: null,
        };
      }
      if (
        policy.expectedToolVersion === null ||
        policy.expectedToolVersion === undefined
      ) {
        throw new GateAdapterError(
          "runner_not_ready",
          "breaking_diff 腿就绪但 policy.expectedToolVersion 缺失（oasdiff 版本无法从配置文件可靠探测）",
          "由编排层从 catalog/profile 锁供给 oasdiff 版本锚（如 \"2.2.0\"）；run 期以 oasdiff --version 实测对账，失配降级 warning",
        );
      }
      const basePath = pathJoin(scope.projectRoot, read.config.breakingBase);
      const currentPath = pathJoin(scope.projectRoot, read.config.openapi);
      const oasdiffPlan: OasdiffLegPlan = {
        tool: OASDIFF_TOOL_ID,
        toolVersion: policy.expectedToolVersion,
        gate: CONTRACT_GATE_NAME,
        gateDef: CONTRACT_GATE_DEF,
        metricDialect: OASDIFF_METRIC_DIALECT,
        grn: policy.grn,
        ranAtSeq: policy.ranAtSeq,
        trigger,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        projectRoot: scope.projectRoot,
        command: `${OASDIFF_RUN_COMMAND_PREFIX} "${basePath}" "${currentPath}"`,
        versionProbeCommand: OASDIFF_VERSION_PROBE_COMMAND,
        timeoutMs: policy.timeoutMs ?? DEFAULT_LEG_TIMEOUT_MS,
        basePath: read.config.breakingBase,
        currentPath: read.config.openapi,
        expectedToolVersion: policy.expectedToolVersion,
      };
      return {
        ...common,
        mode: "breaking_diff",
        declared: true,
        absenceKind: null,
        openapiPath: read.config.openapi,
        expectedOperationIds: [],
        breakingBasePath: read.config.breakingBase,
        absentReason: null,
        installHint: null,
        oasdiffPlan,
      };
    },

    run(plan: ContractGatePlan, spawnFn: SpawnFn = oasdiffSpawnFn): ContractRunOutput {
      const startedAt = performance.now();
      const elapsed = () => Math.max(0, Math.round(performance.now() - startedAt));
      if (!plan.declared) {
        return {
          plan,
          outcome: "not_declared",
          externalMs: elapsed(),
        };
      }
      if (plan.mode === "breaking_diff") {
        if (plan.oasdiffPlan === null) {
          // 不可达形态（declared=true 的 breaking_diff 必带 oasdiffPlan）——防御性显式拒绝。
          throw new GateAdapterError(
            "runner_not_implemented",
            "breaking_diff 计划缺 oasdiffPlan（prepare 契约破坏）",
            "plan.oasdiffPlan 与 plan.mode 必须同源（contract-adapter.prepare 组装）",
          );
        }
        const leg = runOasdiffLeg(plan.oasdiffPlan, spawnFn);
        return {
          plan,
          outcome: "breaking_diff",
          leg,
          externalMs: leg.externalMs,
        };
      }
      let text: string;
      try {
        text = readFileSync(pathJoin(plan.projectRoot, plan.openapiPath ?? ""), "utf8");
      } catch {
        return {
          plan,
          outcome: "openapi_unreadable",
          operationIdsFound: [],
          externalMs: elapsed(),
        };
      }
      return {
        plan,
        outcome: "reconciled",
        operationIdsFound: extractOperationIds(text),
        externalMs: elapsed(),
      };
    },

    normalize(raw: ContractRunOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;
      assertCommonGates(plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));

      if (raw.outcome === "not_declared") {
        if (plan.absenceKind === "tool_absent") {
          // 工具缺席（非配置缺席）：not_run 非绿非红 + 安装路标（诚实缺席禁静默当通过）。
          return absenceRecord(
            plan,
            "not_run",
            `${plan.absentReason ?? "oasdiff 不在位"}；${plan.installHint ?? ""}（not_run，非绿非红）`,
            selfMs,
            raw.externalMs,
          );
        }
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "未声明 openapi 对账配置"}；指引：${plan.installHint ?? CONTRACT_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
      }
      if (raw.outcome === "breaking_diff") {
        // oasdiff 腿判卷（violations=breaking changes 重算计数 + 明细 items；退出码锚）。
        return normalizeOasdiffLeg(raw.leg, selfMs);
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

      const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
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
