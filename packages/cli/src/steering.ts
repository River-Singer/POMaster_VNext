/**
 * steering.ts —— `pomaster steering` 命令面（W4-S3 · 09-10 PRD REQ-08/AC-07）。
 *
 * 命令组（两子命令；negative-history 命令面同构）：
 * - record <task-id>       Steering 约束登记（REQ-08「有来源事件」——--constraint/
 *                          --source-ref 必填 + --scope 可重复 + --note 可选；写入走
 *                          kernel recordSteering 唯一通路 → state/steering-log.json
 *                          append-only 台账 + journal STEERING_RECORDED 词形 SP 留痕；
 *                          零 TransactionOp/零 canonical kind——A6 缺口沿 journal 事件
 *                          词形常量集扩展闭合）；
 * - search <task-id> [query] 词级精确检索（kernel searchTaskSteeringConstraints——
 *                          knowledgeQueryTokens 同源，禁子串/等价猜测）；query 缺席
 *                          = 列全部登记；未命中显式「无记录/无命中」不虚构（REQ-03
 *                          同款语义）。
 *
 * 分层纪律：判卷/落盘权威在 @pomaster/kernel（steering.ts 语义入口唯一），本模块只做
 * argv 收敛与呈现。诚实红线：constraint/affected_scope 是**申报面**——本命令组不宣称
 * 机器已判定约束被遵守（human 呈现恒带 declared 词形；遵守判定归 exec-guard/audit）。
 * 投影/重编译落位：context compile 对本任务的 [ADVISORY] 分区呈现（[STEERING] 词形
 * 区分，kernel consumeSteering → advisoryEntries）；plan compile --task 把约束申报
 * 呈现为 changeSurface unknown（不阻断 applicability）。
 *
 * 纯读零建账：search 不调 createStore（幂等初始化会写骨架文件）——路径派生走
 * kernel buildStorePaths 纯函数 + readTaskSteeringConstraints 同一装载面（view/audit/
 * negative-history search「纯读零写入」先例）。
 */
import {
  buildStorePaths,
  GovernanceError,
  readTaskSteeringConstraints,
  recordSteering,
  searchTaskSteeringConstraints,
} from "@pomaster/kernel";
import type { Store, SteeringRecord } from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseActorArgv, requireInitialized } from "./permit.js";

/** kernel 所需最小面（结构化类型；缺省 = @pomaster/kernel 真实导出）。 */
export interface SteeringKernelDeps {
  createStore: (rootDir: string) => Promise<Store>;
  recordSteering: typeof recordSteering;
  readTaskSteeringConstraints: typeof readTaskSteeringConstraints;
  searchTaskSteeringConstraints: typeof searchTaskSteeringConstraints;
}

function defaultKernel(): SteeringKernelDeps {
  return {
    createStore: (root: string) => {
      // 动态 import 保持与既有命令模块同构（延迟装载 @pomaster/kernel）。
      return import("@pomaster/kernel").then((mod) => mod.createStore(root));
    },
    recordSteering,
    readTaskSteeringConstraints,
    searchTaskSteeringConstraints,
  };
}

/** GovernanceError → CliError 归一（governance 码位透传；非治理错误 KERNEL_ERROR）。 */
function toCliError(err: unknown): CliError {
  if (err instanceof GovernanceError) {
    return governanceErrorToCliError(err);
  }
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "查看 docs/kernel-api.md §34（steering 事件契约）；若为环境异常请勿静默降级。",
  };
}

function fail<T>(result: T, command: string, error: CliError): CommandOutcome<T> {
  return failOutcome(command, result, [error], [
    `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

/** affected_scope 呈现词形（[] = 全 task 显式申报——缺席语义显式化非猜测）。 */
function scopeWordform(affectedScope: readonly string[]): string {
  return affectedScope.length > 0 ? affectedScope.join("/") : "（全 task——未申报对象/能力词形）";
}

/** 条目呈现视图（snake_case 机读面）。 */
export interface SteeringRecordView {
  readonly steering_ref: string;
  readonly task_ref: string;
  readonly constraint: string;
  readonly source_ref: string;
  readonly affected_scope: readonly string[];
  readonly declared_by: SteeringRecord["declared_by"];
  readonly recorded_at_seq: number;
  readonly note: string | null;
  readonly matched_tokens: readonly string[];
}

function recordView(
  entry: SteeringRecord,
  matchedTokens: readonly string[] = [],
): SteeringRecordView {
  return {
    steering_ref: entry.steering_ref,
    task_ref: entry.task_ref,
    constraint: entry.constraint,
    source_ref: entry.source_ref,
    affected_scope: [...entry.affected_scope],
    declared_by: entry.declared_by,
    recorded_at_seq: entry.recorded_at_seq,
    note: entry.note,
    matched_tokens: [...matchedTokens],
  };
}

// ============================================================
// steering record（登记面；唯一写通路 = kernel recordSteering）
// ============================================================

export interface SteeringRecordCliInput {
  readonly taskRef: string;
  readonly constraint?: string;
  readonly sourceRef?: string;
  readonly scope?: readonly string[];
  readonly note?: string;
  readonly actor: string;
}

export interface SteeringRecordResult {
  readonly steering_ref: string;
  readonly task_ref: string;
  readonly constraint: string;
  readonly source_ref: string;
  readonly affected_scope: readonly string[];
  readonly recorded_at_seq: number;
  readonly total_for_task: number;
}

export async function runSteeringRecord(
  rootDir: string,
  input: SteeringRecordCliInput,
  deps?: Partial<SteeringKernelDeps>,
): Promise<CommandOutcome<SteeringRecordResult>> {
  const command = "steering record";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: SteeringRecordResult = {
    steering_ref: "",
    task_ref: input.taskRef,
    constraint: input.constraint?.trim() ?? "",
    source_ref: input.sourceRef?.trim() ?? "",
    affected_scope: [...(input.scope ?? [])],
    recorded_at_seq: 0,
    total_for_task: 0,
  };
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  const actor = parseActorArgv(input.actor);
  if ("error" in actor) return fail(empty, command, actor.error);
  if (input.constraint === undefined || input.constraint.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--constraint 必填（约束文本——申报面载体，空约束 = 静默纠偏，禁）",
      hint: "示例：pomaster steering record TASK.T0087 --constraint \"不要修改后端 API\" --source-ref \"session:owner#turn-42\" --actor human:owner",
    });
  }
  if (input.sourceRef === undefined || input.sourceRef.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--source-ref 必填（Owner 指示出处——REQ-08「有来源事件」：无来源的纠偏不构成 Steering 事件）",
      hint: "给出会话/ledger/decide 引用（如 session:owner#turn-42、ledger:EXC-7、decide:DECISION.X）。",
    });
  }
  try {
    const store = await kernel.createStore(rootDir);
    const result = await kernel.recordSteering(store, {
      taskRef: input.taskRef,
      constraint: input.constraint,
      sourceRef: input.sourceRef,
      affectedScope: input.scope,
      declaredBy: actor.actor,
      note: input.note,
    });
    const view: SteeringRecordResult = {
      steering_ref: result.record.steering_ref,
      task_ref: result.record.task_ref,
      constraint: result.record.constraint,
      source_ref: result.record.source_ref,
      affected_scope: [...result.record.affected_scope],
      recorded_at_seq: result.record.recorded_at_seq,
      total_for_task: result.totalForTask,
    };
    const human = [
      `steering record → ${view.steering_ref}（${view.task_ref}；本任务共 ${view.total_for_task} 条——事件流水每次登记一条）`,
      `  constraint: ${view.constraint}`,
      `  source_ref: ${view.source_ref}`,
      `  affected_scope: ${scopeWordform(view.affected_scope)}（declared 申报面——机器不验证遵守）`,
      `  落位: state/steering-log.json（append-only 台账——零 TransactionOp/零 canonical kind；journal STEERING_RECORDED 词形 SP 留痕）`,
      "  REQ-08 最小形态: 受影响工作下次编译在输入面可见（context compile [ADVISORY] 分区 [STEERING] 词形 / plan compile changeSurface unknown）——不阻断；遵守判定归 exec-guard/audit",
    ];
    return okOutcome(command, view, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}

// ============================================================
// steering search（检索面；纯读零建账；未命中显式「无记录」）
// ============================================================

export interface SteeringSearchResult {
  readonly task_ref: string;
  readonly query: string;
  readonly total_for_task: number;
  readonly hits: readonly SteeringRecordView[];
}

export async function runSteeringSearch(
  rootDir: string,
  input: { readonly taskRef: string; readonly query?: string },
  deps?: Partial<SteeringKernelDeps>,
): Promise<CommandOutcome<SteeringSearchResult>> {
  const command = "steering search";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: SteeringSearchResult = {
    task_ref: input.taskRef,
    query: input.query ?? "",
    total_for_task: 0,
    hits: [],
  };
  // 纯读零建账：requireInitialized（NOT_INITIALIZED）→ buildStorePaths 纯函数 +
  // kernel readTaskSteeringConstraints 同一装载面（禁 createStore——幂等初始化会写骨架）。
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  try {
    const paths = buildStorePaths(rootDir);
    const entries = kernel.readTaskSteeringConstraints(paths, input.taskRef);
    const query = input.query ?? "";
    const hits = kernel.searchTaskSteeringConstraints(entries, query);
    const view: SteeringSearchResult = {
      task_ref: input.taskRef,
      query,
      total_for_task: entries.length,
      hits: hits.map((hit) => recordView(hit.entry, hit.matchedTokens)),
    };
    const human = [
      `steering search → ${view.hits.length} 命中（本任务共登记 ${view.total_for_task} 条 Steering 约束；词级精确 token 交集，禁子串/等价猜测）`,
      ...view.hits.map(
        (hit) =>
          `  [STEERING] ${hit.steering_ref} ${hit.constraint}\n      source_ref: ${hit.source_ref}\n      affected_scope: ${scopeWordform(hit.affected_scope)}（declared 申报面——机器不验证遵守）` +
          `（recorded @ seq=${hit.recorded_at_seq} by ${hit.declared_by.actor_type}:${hit.declared_by.actor}` +
          `${hit.matched_tokens.length > 0 ? `；命中 token: ${hit.matched_tokens.join("/")}` : ""}）`,
      ),
      ...(view.total_for_task === 0
        ? [`  （无记录——本任务无 Steering 约束登记；REQ-03「未命中保持未知」，不虚构）`]
        : view.hits.length === 0
          ? [`  （无命中——检索而非全量：登记在座但查询词未命中，显式空）`]
          : []),
      ...(view.hits.length > 0
        ? ["  REQ-08 最小形态: 受影响工作下次编译在输入面可见（context compile [ADVISORY] 分区 / plan compile changeSurface unknown）——不阻断；遵守判定归 exec-guard/audit"]
        : []),
    ];
    return okOutcome(command, view, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}
