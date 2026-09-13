/**
 * telemetry.ts —— `pomaster telemetry` 命令面（W4-S5 · 战役 W4 R4-4 + 09-10 PRD
 * REQ-11 + §9 完整发布节）。
 *
 * 命令组（单子命令；task 词形 = SP 提案待追认——命令面非词表管辖面，P33b/P34b 先例）：
 * - task <task-id>  任务级 reasoning/cost/Horizon 派生评估呈现：六指标
 *   （verified_transition_rate / rework_signal / steering_count /
 *   resume_reconcile_signals / horizon / cost_face）每指标带分母与可计算性
 *   （MEASURED / NOT_COMPUTABLE / NOT_MEASURABLE_YET）+ horizon 逐执行明细 +
 *   evidence census + 四条红线注记。判卷权威在 @pomaster/kernel（task-telemetry.ts
 *   语义入口唯一——gatherTaskTelemetryInput 装载 + deriveTaskTelemetry 判定），本模块
 *   只做 argv 收敛、在册校验与呈现。
 *
 * 命令形态选择（落盘 vs 纯呈现——设计裁决）：**纯呈现零落盘**。评估快照不落盘的
 * 理由：(1) telemetry 是纯派生聚合（同输入重放同报告字节——inputs_fingerprint 即
 * 快照等价物），落盘只引入陈旧快照与真值混淆风险（快照零 consumer、零失效语义）；
 * (2) 零新写面红线（telemetry = 对既有平面的只读派生聚合）；(3) REQ-11 学习面归
 * memory candidate 通路，不是 telemetry 职责。write_surface:"none" 结构级钉。
 *
 * 诚实红线（随报告 notes 逐次呈现）：无综合评分；不持久化私有思维链（输入面无
 * 思维链通道）；不设强制阈值不阻断任何流程（advisory 呈现面）；cost 面如实
 * NOT_MEASURABLE_YET（本仓无 token/费用计量源）；无跨 session 基线平面——不输出
 * 任何「较基线提升 X%」形态。
 *
 * 纯读零建账：不调 createStore（幂等初始化会写骨架文件）——requireInitialized +
 * buildStorePaths + kernel gather 单一装载面（steering search / view review 先例）。
 */
import {
  GovernanceError,
  deriveTaskTelemetry,
  gatherTaskTelemetryInput,
  buildStorePaths,
  type TaskTelemetryMetric,
  type TaskTelemetryReport,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { findIndexRow, readRawIndexOrFail, resolveRowTargetId } from "./projection-common.js";

/** GovernanceError → CliError 归一（governance 码位透传；非治理错误 KERNEL_ERROR）。 */
function toCliError(err: unknown): CliError {
  if (err instanceof GovernanceError) {
    return governanceErrorToCliError(err);
  }
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "查看 docs/kernel-api.md §36（task telemetry 契约）；若为环境异常请勿静默降级。",
  };
}

function fail(result: TelemetryTaskResult, command: string, error: CliError): CommandOutcome<TelemetryTaskResult> {
  return failOutcome(command, result, [error], [
    `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

/** telemetry task 机读结果（view 词形 SP 提案待追认；write_surface 结构级钉）。 */
export interface TelemetryTaskResult {
  readonly view: "task-telemetry";
  readonly task: string;
  readonly resolved_via_alias: string | null;
  /** 纯读零写声明（§91.1 投影纪律——字节快照测试钉）。 */
  readonly write_surface: "none";
  readonly report: TaskTelemetryReport;
  /** 人读 markdown（机读走结构化 report——§45 双输出，机器+人读一份）。 */
  readonly markdown: string;
}

function emptyResult(task: string): TelemetryTaskResult {
  return {
    view: "task-telemetry",
    task,
    resolved_via_alias: null,
    write_surface: "none",
    report: {
      task_ref: task,
      inputs_fingerprint: "",
      metrics: [],
      transition_events: 0,
      horizon_open: false,
      horizon_rows: [],
      evidence_census: { runs: {}, claims: {} },
      notes: [],
    },
    markdown: "",
  };
}

/** 单指标人读行（MEASURED 带分账；NOT_ 状态显式呈现缺席理由——不冒充数值）。 */
function metricLine(metric: TaskTelemetryMetric): string[] {
  const lines: string[] = [];
  if (metric.status === "MEASURED") {
    const share =
      metric.numerator !== null && metric.denominator !== null && metric.denominator > 0
        ? `（${metric.numerator}/${metric.denominator}）`
        : "";
    const breakdown =
      metric.breakdown !== null
        ? `（${Object.entries(metric.breakdown)
            .map(([key, value]) => `${key}: ${value}`)
            .join(" / ")}）`
        : "";
    lines.push(`  ${metric.key} = MEASURED ${String(metric.value)}${share}${breakdown}`);
  } else {
    lines.push(`  ${metric.key} = ${metric.status}（value=null——绝不冒充数值）`);
    if (metric.reason !== null) {
      lines.push(`    缺席理由: ${metric.reason}`);
    }
  }
  lines.push(`    口径: ${metric.basis}`);
  return lines;
}

/** 人读 markdown（§45 双输出；结构镜像 report——零第二事实面）。 */
function renderMarkdown(result: TelemetryTaskResult): string[] {
  const report = result.report;
  const lines: string[] = [
    `# Task Telemetry — ${report.task_ref}（W4-S5 派生评估；advisory 只读呈现——零阈值零阻断）`,
    result.resolved_via_alias === null
      ? `> task: ${report.task_ref}`
      : `> task: ${report.task_ref}（由 ${result.resolved_via_alias} 收编解析）`,
    `> 输入指纹: ${report.inputs_fingerprint}（同指纹 = 同报告字节——快照等价物；本命令零落盘）`,
    "",
    "## 指标（六键——每指标带口径与可计算性；无综合评分）",
    ...report.metrics.flatMap(metricLine),
    "",
    "## Horizon 明细（逐执行；journal seq 跨度——A4 禁墙钟）",
    ...(report.horizon_rows.length === 0
      ? ["  （无锚定本任务的执行身份——horizon 零分母显式）"]
      : report.horizon_rows.map((row) => {
          const ended =
            row.ended_seq === null ? "ended 缺席（open）" : `ended seq=${row.ended_seq}`;
          const begun = row.begun_seq === null ? "begun 缺席" : `begun seq=${row.begun_seq}`;
          const span = row.span === null ? "span 不可算" : `span=${row.span}`;
          return `  ${row.execution_id}  ${begun}  ${ended}  ${span}  ${row.state}  receipts: ${row.inflight_receipts.state}(${row.inflight_receipts.receipt_count})${row.state === "open" && report.horizon_open ? "——horizon_open 显式" : ""}`;
        })),
    "",
    "## 转移与证据（锚定本任务——全量 verdict 计数，聚合不吞没）",
    `  transition_events: ${report.transition_events}（journal TX_APPLIED × transition_object × 本 task）`,
    `  runs census: ${Object.entries(report.evidence_census.runs)
      .map(([verdict, count]) => `${verdict} ${count}`)
      .join(" / ") || "（无记录）"}`,
    `  claims census: ${Object.entries(report.evidence_census.claims)
      .map(([verdict, count]) => `${verdict} ${count}`)
      .join(" / ") || "（无记录）"}`,
    "",
    "## 红线注记（恒在）",
    ...report.notes.map((note) => `> 注记: ${note}`),
  ];
  return lines;
}

/**
 * `pomaster telemetry task <task-id>`（纯读零写；W4-S5 advisory 呈现面）：
 * requireInitialized → 索引装载 → id 解析（A5/A6 alias 收编）→ 在册 + kind 闸
 * （view review 同判词）→ kernel gather+derive 单一装载面 → 机器/人读双面呈现。
 * ok 语义 = 报告成功产出（NOT_COMPUTABLE / NOT_MEASURABLE_YET 不是失败——诚实缺席
 * 正是本命令的交付物之一）。
 */
export async function runTelemetryTask(
  rootDir: string,
  input: { readonly task: string },
): Promise<CommandOutcome<TelemetryTaskResult>> {
  const command = "telemetry task";
  const empty = emptyResult(input.task);
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);

  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) return fail(empty, command, raw.error);

  const resolved = resolveRowTargetId(input.task);
  if ("error" in resolved) return fail(empty, command, resolved.error);
  const taskRow = findIndexRow(raw.index, resolved.target);
  if (taskRow === null) {
    return fail(empty, command, {
      code: "OBJECT_NOT_FOUND",
      message: `任务不在 truth-index：${resolved.target}${resolved.viaAlias === null ? "" : `（由 ${resolved.viaAlias} 收编解析）`}`,
      hint: "pomaster status --json 查看对象清单；telemetry task 只服务在册 task_object 分母。",
    });
  }
  const kind = (taskRow as Record<string, unknown>).kind;
  if (kind !== "task_object") {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: `telemetry task 分母是 task_object：${resolved.target} 的 kind=${typeof kind === "string" ? kind : "?"}`,
      hint: "telemetry task 只服务任务对象；其余对象检视走 pomaster inspect <governed-id>。",
    });
  }

  try {
    const paths = buildStorePaths(rootDir);
    const telemetryInput = gatherTaskTelemetryInput(paths, resolved.target);
    const report = deriveTaskTelemetry(telemetryInput);
    const result: TelemetryTaskResult = {
      view: "task-telemetry",
      task: resolved.target,
      resolved_via_alias: resolved.viaAlias,
      write_surface: "none",
      report,
      markdown: "",
    };
    const markdown = renderMarkdown(result);
    const withMarkdown: TelemetryTaskResult = { ...result, markdown: markdown.join("\n") };
    return okOutcome(command, withMarkdown, markdown);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}
