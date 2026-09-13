/**
 * provider-capabilities.ts —— Provider 能力映射（W4-S4 · 战役 W4 R4-3 +
 * 09-10 PRD REQ-11「不支持的 Provider 档位可解释」+ R §5.2 Provider-neutral）。
 *
 * 需求锚（W4 PRD R4-3 逐字）：
 * - 「Provider 能力映射：原生 async/steering/取消有无如实报告；无则按声明安全
 *   边界降级」；
 * - 「不把某 Provider API 叙述当跨 Provider 保证」（09-10 PRD §13 Out of Scope
 *   同源；本模块零硬编码 Provider 型号断言——报告由探针结果唯一决定）；
 * - R §5.2 Provider-neutral：可在无原生 async/steering 的环境验证治理契约，再由
 *   Adapter 报告支持程度；
 * - reference-patterns 候选降级词形（研究 §4 逐字）：「Provider 无工具发现时预先
 *   编译较小工具集；无原生 async 时采用有持久记录的同步步骤/轮询；无原生
 *   steering 时在下一派发边界应用新约束；无法立即取消时明确状态并隔离冲突结果
 *   ——这些是产品可验证的降级语义，不是假定已有的 API」。
 *
 * 与 §58 三探针的关系（平行扩展，零破坏）：runtime-adapter.ts 的三探针
 * （supportsParallel/ToolPermissions/ContextIsolation）服务「多 Agent 性」判定
 * （§58 四条降级规则）；本模块服务**长时运行四维能力**的如实报告与降级声明
 * （R4-3）。AgentRuntime/RuntimeCapabilities 契约面零改动——真实 Provider 适配
 * （DEF-RUNTIME-ADAPTER）是后续切片，本片只落**能力探测与报告面**。
 *
 * 三值词形纪律（SP 提案待追认——扩值走词形 PR）：
 * - native  = 探针确证支持（方法在场且返回 true）；
 * - absent  = 探针确证不支持（方法在场且返回 false）；
 * - unknown = 探针缺席或报错——**禁猜**（缺探针 ≠ 不支持；报错 ≠ 支持；两者都
 *   不许洗成任一确定词形）。方法在场返回非布尔 → SCHEMA_INVALID（§58 三探针
 *   同款纪律：静默真值化会把「探测不出」洗成「支持」）。
 *
 * 降级语义（absent/unknown 同映射——未确证的能力不使用，安全边界；词形区分
 * 留在 support 位给消费面）。降级是**声明式**的：本模块只声明「能力缺席时按
 * 哪条已就位的载体边界运行」，不实现该边界本身（各锚见
 * PROVIDER_CAPABILITY_DEGRADATIONS.anchor——降级语义引用既有载体，非假定 API）。
 *
 * 纯函数纪律：本模块全部导出零 IO、零 store 依赖、零墙钟（同输入重放字节稳定，
 * A4）；探测 = 每维探针恰调用一次（不缓存、不重试、不推断——§58 探测纪律同构）。
 */
import { GovernanceError } from "./errors.js";

// ============================================================
// 词形常量（SP 提案待追认——沿 W4-S2/S3 先例：通路局部词形常量集 + 提案留痕，
// 不动 vocab-lock 主表）
// ============================================================

/** 能力维度轴（R4-3 四维度词形——原生 async/steering/取消 + 运行时工具发现）。 */
export const PROVIDER_CAPABILITY_DIMENSIONS = [
  "native_async",
  "native_steering",
  "cancellable",
  "tool_discovery",
] as const;
export type ProviderCapabilityDimension = (typeof PROVIDER_CAPABILITY_DIMENSIONS)[number];

/** 支持度三值词形（native=探针确证支持 / absent=探针确证不支持 / unknown=探针缺席或报错——禁猜）。 */
export const PROVIDER_CAPABILITY_SUPPORT_VALUES = [
  "native",
  "absent",
  "unknown",
] as const;
export type ProviderCapabilitySupport = (typeof PROVIDER_CAPABILITY_SUPPORT_VALUES)[number];

/** 判词依据轴（每行 support 的证据来源——unknown 有据非猜测：缺席/报错分词形留痕）。 */
export const PROVIDER_CAPABILITY_BASIS_VALUES = [
  "probe_true",
  "probe_false",
  "probe_absent",
  "probe_threw",
] as const;
export type ProviderCapabilityBasis = (typeof PROVIDER_CAPABILITY_BASIS_VALUES)[number];

/** 探针方法名轴（与维度轴逐位机械映射——§58 三探针 snake_case 同法）。 */
export type ProviderCapabilityProbeMethod =
  | "supportsNativeAsync"
  | "supportsNativeSteering"
  | "supportsCancellable"
  | "supportsToolDiscovery";

export const PROVIDER_CAPABILITY_PROBE_METHODS: Readonly<
  Record<ProviderCapabilityDimension, ProviderCapabilityProbeMethod>
> = {
  native_async: "supportsNativeAsync",
  native_steering: "supportsNativeSteering",
  cancellable: "supportsCancellable",
  tool_discovery: "supportsToolDiscovery",
};

// ============================================================
// 探针契约（可选方法；真实 Provider 适配器按需实现——缺席即 unknown，禁猜）
// ============================================================

/**
 * Provider 能力探针契约（R4-3 四维度；**可选方法**——未实现的维度即探针缺席，
 * 报告 unknown，不强迫适配器谎报）。与 §58 三探针同形：方法 → boolean，探测即
 * 调用一次；返回非布尔 = 探针契约违例（SCHEMA_INVALID）。
 */
export interface ProviderCapabilityProbe {
  /** 能否提交异步任务并稍后取回（原生 async）。 */
  supportsNativeAsync?(): boolean;
  /** 能否在运行中注入新约束（原生 steering）。 */
  supportsNativeSteering?(): boolean;
  /** 能否取消在途执行。 */
  supportsCancellable?(): boolean;
  /** 运行时是否具备工具发现（相对「预编译固定工具集」）。 */
  supportsToolDiscovery?(): boolean;
}

// ============================================================
// 降级语义声明面（reference-patterns 候选降级词形——产品可验证的降级语义）
// ============================================================

/** 降级语义 id 词形（SP 提案待追认；与四维度一一对应——absent/unknown 同映射）。 */
export type ProviderDegradationId =
  | "sync_steps_with_persistent_record"
  | "constraint_at_next_dispatch_boundary"
  | "explicit_status_and_conflict_isolation"
  | "precompiled_smaller_toolset";

/** 单维度降级语义（id + 人读行为 + 既有载体锚——降级语义引用已就位的面，非假定 API）。 */
export interface ProviderDegradationSemantics {
  readonly id: ProviderDegradationId;
  /** 人读降级行为（reference-patterns 词形；消费面原样呈现，机器不解析）。 */
  readonly behavior: string;
  /** 既有载体锚（降级边界在当前仓内的已就位实现位）。 */
  readonly anchor: string;
}

/**
 * 逐维降级语义映射（维度轴同键同序；absent/unknown 共用——未确证的能力不使用，
 * 安全边界）。锚定纪律：每条 anchor 指向仓内**已存在**的载体（W4-S1/S2/S3 面），
 * 不是对 Provider API 的假定。
 */
export const PROVIDER_CAPABILITY_DEGRADATIONS: Readonly<
  Record<ProviderCapabilityDimension, ProviderDegradationSemantics>
> = {
  native_async: {
    id: "sync_steps_with_persistent_record",
    behavior:
      "无原生 async：采用有持久记录的同步步骤/轮询（每步留执行台账，无记录的后台派发不做）",
    anchor: "AGX-n 执行台账 + journal 事件流（kernel execution.ts）——同步步骤的持久记录位",
  },
  native_steering: {
    id: "constraint_at_next_dispatch_boundary",
    behavior: "无原生 steering：新约束在下一派发边界应用（不臆测运行中注入）",
    anchor:
      "W4-S3 Steering 事件面（recordSteering → state/steering-log.json + context/plan 编译消费）",
  },
  cancellable: {
    id: "explicit_status_and_conflict_isolation",
    behavior: "无法立即取消：在途状态明确呈现，并隔离迟到的冲突结果（不盲重放）",
    anchor:
      "W4-S1 execution 在途诚实分态（recorded|none——回执未存≠未发生）+ REQ-07 无法判定保持 unknown 不盲重放",
  },
  tool_discovery: {
    id: "precompiled_smaller_toolset",
    behavior: "无运行时工具发现：预先编译较小工具集",
    anchor:
      "catalog/ToolBinding 预编译工具面（pomaster tools list/validate + plan compile 工具探测）",
  },
};

// ============================================================
// 报告形态（机器+人读共用；snake_case——文件世界词形纪律）
// ============================================================

/** 单维度能力观测行（support 与判词依据并排——触发与未触发全部显式呈现，C1）。 */
export interface ProviderCapabilityRow {
  readonly dimension: ProviderCapabilityDimension;
  readonly support: ProviderCapabilitySupport;
  /** 判词依据（unknown 的缺席/报错分词形留痕——禁猜的证据位）。 */
  readonly basis: ProviderCapabilityBasis;
  /** basis=probe_threw 时的错误摘要（unknown 有据）；其余恒 null。 */
  readonly probe_error: string | null;
  /** absent/unknown → 对应降级语义 id；native → null（无降级不伪造）。 */
  readonly degradation: ProviderDegradationId | null;
}

/** Provider 能力报告（四维度逐行 + 聚合位；rows 顺序 = 维度轴顺序，字节稳定）。 */
export interface ProviderCapabilitiesReport {
  /** 任一维度非 native 即 true（缺席/未确证显式，C1）。 */
  readonly degraded: boolean;
  /** 全部维度 unknown（未接入真实 Provider 的诚实缺省形态——CLI 呈现注记位）。 */
  readonly all_unknown: boolean;
  readonly native_count: number;
  readonly rows: readonly ProviderCapabilityRow[];
}

/** 全 unknown 诚实缺省注记（CLI 声明式报告呈现位；REQ-11「档位可解释」）。 */
export const PROVIDER_CAPABILITY_ALL_UNKNOWN_NOTE =
  "探针未接入真实 Provider：全部维度 unknown 是诚实缺省——缺探针 ≠ 不支持，禁猜；接入真实 Runtime Adapter（DEF-RUNTIME-ADAPTER）后由探针结果重写" as const;

/** 跨 Provider 红线注记（R4-3 约束词形；报告呈现恒带）。 */
export const PROVIDER_CAPABILITY_NO_CROSS_PROVIDER_GUARANTEE_NOTE =
  "本报告是单次探针结果的结构化呈现，不把某 Provider API 叙述当跨 Provider 保证；能力随 Provider 演进，消费前须重新探测" as const;

// ============================================================
// 探测（纯函数；每维恰一次调用；三值词形 + 降级映射一次产出）
// ============================================================

/**
 * Provider 能力探测（R4-3 如实报告面）：对四维度逐位探测——
 * - 方法缺席 → unknown（probe_absent）+ 降级 id；
 * - 方法报错 → unknown（probe_threw，错误摘要入 probe_error）+ 降级 id；
 * - 返回 true → native（probe_true）、degradation=null；
 * - 返回 false → absent（probe_false）+ 降级 id；
 * - 返回非布尔 → SCHEMA_INVALID（探针契约违例显性暴露——静默真值化会把
 *   「探测不出」洗成「支持」，§58 同款）。
 */
export function probeProviderCapabilities(
  runtime: ProviderCapabilityProbe,
): ProviderCapabilitiesReport {
  const record = runtime as Record<string, unknown>;
  const rows: ProviderCapabilityRow[] = PROVIDER_CAPABILITY_DIMENSIONS.map((dimension) => {
    const method = PROVIDER_CAPABILITY_PROBE_METHODS[dimension];
    const degradation = PROVIDER_CAPABILITY_DEGRADATIONS[dimension].id;
    const probe = record[method];
    if (typeof probe !== "function") {
      // 方法缺席 = 探针缺席——unknown（缺探针 ≠ 不支持，禁猜）。
      return { dimension, support: "unknown", basis: "probe_absent", probe_error: null, degradation };
    }
    let returned: unknown;
    try {
      returned = (probe as () => unknown).call(runtime);
    } catch (error) {
      // 探针报错 = 未确证——unknown（报错 ≠ 支持，禁猜；错误摘要留痕）。
      const message = error instanceof Error ? error.message : String(error);
      return { dimension, support: "unknown", basis: "probe_threw", probe_error: message, degradation };
    }
    if (typeof returned !== "boolean") {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `能力探针 ${method} 返回非布尔（探针契约违例）：${String(returned)}`,
        "探针必须返回 boolean；修复 Runtime Adapter 的能力探针实现（缺席应删方法而非返回非布尔）",
        { probe: method, returned: String(returned) },
      );
    }
    return returned
      ? { dimension, support: "native", basis: "probe_true", probe_error: null, degradation: null }
      : { dimension, support: "absent", basis: "probe_false", probe_error: null, degradation };
  });
  const nativeCount = rows.filter((row) => row.support === "native").length;
  return {
    degraded: rows.some((row) => row.support !== "native"),
    all_unknown: rows.every((row) => row.support === "unknown"),
    native_count: nativeCount,
    rows,
  };
}
