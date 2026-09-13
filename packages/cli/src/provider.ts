/**
 * provider.ts —— `pomaster provider` 命令面（W4-S4 · 战役 W4 R4-3 + 09-10 PRD
 * REQ-11「不支持的 Provider 档位可解释」/ R §5.2 Provider-neutral）。
 *
 * 命令组（单子命令；capabilities 词形 = SP 提案待追认——命令面非词表管辖面，
 * P33b/P34b 先例）：
 * - capabilities --runtime <名>  Provider 能力声明式报告：原生 async/steering/取消/
 *                          工具发现四维度 × 三值词形（native|absent|unknown——
 *                          探针结果驱动，零 Provider 型号断言）× absent/unknown
 *                          逐维声明式降级语义（reference-patterns 降级词形）。
 *                          --runtime 过 EXECUTION_RUNTIME_VALUES 闭包（D 线 §2.1
 *                          必填枚举；扩值走词汇表 PR）。
 *
 * 分层纪律：判卷/探测权威在 @pomaster/kernel（provider-capabilities.ts 语义入口
 * 唯一——probeProviderCapabilities），本模块只做 argv 收敛与呈现。诚实红线：
 * - CLI 无真实 Provider SDK（R P5 红线：不引入真实适配器）——缺省注入探针 =
 *   null，呈现**声明式报告**（全部 unknown + 「诚实缺省」注记，report_source=
 *   declarative_default 显式标注）；嵌入方经 deps.resolveProbe 注入真实探针后
 *   report_source=injected_probe——报告来源如实区分，不冒充实测；
 * - 报告恒带「不把某 Provider API 叙述当跨 Provider 保证」注记（R4-3 红线）。
 *
 * 纯报告零 store 依赖：不 createStore、不 requireInitialized、零读写 .pomaster
 * （仓库状态与本报告正交——初始化与否不改变能力词形）。
 */
import { EXECUTION_RUNTIME_VALUES, type ExecutionRuntimeValue } from "@pomaster/schemas";
import {
  GovernanceError,
  PROVIDER_CAPABILITY_ALL_UNKNOWN_NOTE,
  PROVIDER_CAPABILITY_DEGRADATIONS,
  PROVIDER_CAPABILITY_NO_CROSS_PROVIDER_GUARANTEE_NOTE,
  probeProviderCapabilities,
  type ProviderCapabilitiesReport,
  type ProviderCapabilityProbe,
  type ProviderCapabilityRow,
} from "@pomaster/kernel";
import { failOutcome, okOutcome, type CommandOutcome } from "./envelope.js";
import { governanceErrorToCliError } from "./permit.js";

/** kernel 所需最小面（结构化类型；缺省 = 声明式报告——零真实探针）。 */
export interface ProviderCapabilitiesDeps {
  /**
   * 真实 Provider 探针注入位（嵌入方/测试面；DEF-RUNTIME-ADAPTER 落地前的
   * 接缝）。缺省返回 null = 未接入真实 Provider（全 unknown 诚实缺省）。
   */
  readonly resolveProbe?: (runtime: ExecutionRuntimeValue) => ProviderCapabilityProbe | null;
}

/** 支持度词形的人读注解（unknown 显式「禁猜」——呈现层不洗词形）。 */
const SUPPORT_WORDFORM_NOTES: Readonly<Record<string, string>> = {
  native: "探针确证支持",
  absent: "探针确证不支持",
  unknown: "探针缺席/报错（禁猜）",
};

/** 单维度行视图（snake_case 机读面；降级语义 id+行为+锚随行——机器+人读一份）。 */
export interface ProviderCapabilityRowView {
  readonly dimension: string;
  readonly support: string;
  readonly basis: string;
  readonly probe_error: string | null;
  readonly degradation: string | null;
  readonly degradation_behavior: string | null;
  readonly degradation_anchor: string | null;
}

/** provider capabilities 机读结果（report_source = 报告来源诚实标注位）。 */
export interface ProviderCapabilitiesResult {
  readonly runtime: string;
  readonly report_source: "injected_probe" | "declarative_default";
  readonly degraded: boolean;
  readonly all_unknown: boolean;
  readonly native_count: number;
  readonly rows: readonly ProviderCapabilityRowView[];
  readonly notes: readonly string[];
}

function rowView(row: ProviderCapabilityRow): ProviderCapabilityRowView {
  if (row.degradation === null) {
    return {
      dimension: row.dimension,
      support: row.support,
      basis: row.basis,
      probe_error: row.probe_error,
      degradation: null,
      degradation_behavior: null,
      degradation_anchor: null,
    };
  }
  const semantics = PROVIDER_CAPABILITY_DEGRADATIONS[row.dimension];
  return {
    dimension: row.dimension,
    support: row.support,
    basis: row.basis,
    probe_error: row.probe_error,
    degradation: row.degradation,
    degradation_behavior: semantics.behavior,
    degradation_anchor: semantics.anchor,
  };
}

function reportView(
  runtime: string,
  reportSource: ProviderCapabilitiesResult["report_source"],
  report: ProviderCapabilitiesReport,
): ProviderCapabilitiesResult {
  const notes: string[] = [PROVIDER_CAPABILITY_NO_CROSS_PROVIDER_GUARANTEE_NOTE];
  if (report.all_unknown) {
    notes.unshift(PROVIDER_CAPABILITY_ALL_UNKNOWN_NOTE);
  }
  return {
    runtime,
    report_source: reportSource,
    degraded: report.degraded,
    all_unknown: report.all_unknown,
    native_count: report.native_count,
    rows: report.rows.map(rowView),
    notes,
  };
}

function renderHuman(result: ProviderCapabilitiesResult): string[] {
  const sourceWordform =
    result.report_source === "injected_probe"
      ? "injected_probe：注入探针实测"
      : "declarative_default：声明式报告（未注入探针）";
  const lines = [
    `provider capabilities → runtime=${result.runtime}（${sourceWordform}；四维能力支持度如实报告——探针结果驱动，零 Provider 型号断言）`,
    ...result.rows.map((row) => {
      const base = `  ${row.dimension.padEnd(16)}${row.support.padEnd(9)}${row.basis.padEnd(13)}${SUPPORT_WORDFORM_NOTES[row.support] ?? row.support}`;
      if (row.degradation === null) {
        return `${base}  降级: 无（native 不伪造降级）`;
      }
      const errorSuffix = row.probe_error !== null ? `；probe_error: ${row.probe_error}` : "";
      return `${base}\n      降级: ${row.degradation}（${row.degradation_behavior}）\n        锚: ${row.degradation_anchor}${errorSuffix}`;
    }),
    `  聚合: native ${result.native_count}/4${result.degraded ? "；degraded=true（缺席/未确证已显式）" : ""}`,
    ...result.notes.map((note) => `  注记: ${note}`),
  ];
  return lines;
}

/** GovernanceError → CliError 归一（governance 码位透传；非治理错误 KERNEL_ERROR）。 */
function toCliError(err: unknown): { code: string; message: string; hint: string } {
  if (err instanceof GovernanceError) {
    return governanceErrorToCliError(err);
  }
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "查看 docs/kernel-api.md §35（Provider 能力映射契约）；若为环境异常请勿静默降级。",
  };
}

/**
 * `pomaster provider capabilities`（纯报告零 store 依赖；同步函数——零 IO 零
 * await，能力报告面不引入 IO 通路的诚实形态）：--runtime 词形闭包闸 → 探针解析
 * （注入位或缺省 null）→ kernel probeProviderCapabilities 判定 → 机器/人读双面
 * 呈现。ok 语义 = 报告成功产出（degraded 不是失败——如实报告正是本命令的交付物；
 * REQ-11「档位可解释」可演示形态）。
 */
export function runProviderCapabilities(
  input: { readonly runtime: string },
  deps: ProviderCapabilitiesDeps = {},
): CommandOutcome<ProviderCapabilitiesResult> {
  const command = "provider capabilities";
  const empty: ProviderCapabilitiesResult = {
    runtime: input.runtime,
    report_source: "declarative_default",
    degraded: false,
    all_unknown: false,
    native_count: 0,
    rows: [],
    notes: [],
  };
  const matched = EXECUTION_RUNTIME_VALUES.find((value) => value === input.runtime);
  if (matched === undefined) {
    return failOutcome(command, empty, [
      {
        code: "VOCAB_INVALID_VALUE",
        message: `runtime 词表外：${input.runtime}（EXECUTION_RUNTIME_VALUES——D 线 §2.1 必填枚举）`,
        hint: `合法词形：${EXECUTION_RUNTIME_VALUES.join(" | ")}；扩值走词汇表 PR。`,
      },
    ], [`${command}: FAILED — VOCAB_INVALID_VALUE\n  hint: 合法词形 ${EXECUTION_RUNTIME_VALUES.join(" | ")}（扩值走词汇表 PR）。`]);
  }
  try {
    const probe = deps.resolveProbe?.(matched) ?? null;
    const report = probeProviderCapabilities(probe ?? {});
    const result = reportView(matched, probe === null ? "declarative_default" : "injected_probe", report);
    return okOutcome(command, result, renderHuman(result));
  } catch (err) {
    const error = toCliError(err);
    return failOutcome(command, empty, [error], [
      `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
    ]);
  }
}
