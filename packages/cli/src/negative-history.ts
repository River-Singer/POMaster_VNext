/**
 * negative-history.ts —— `pomaster negative-history` 命令面（W1-R1-7 切片；
 * 09-10 PRD REQ-03「Context 含已否定方案/失败原因/约束；未命中保持未知」+
 * AC-02「已否定方案经 Context rollover 可重新获得；重试旧方案须新依据」）。
 *
 * 命令组（两子命令）：
 * - record <task-id>         已否定方案登记（绑定 TASK.*；--approach/--reason 必填 +
 *                            --evidence-ref 可选；写入走 kernel appendTaskNegativeEntry
 *                            → applyTransaction upsert 既有 op——数据住 task payload
 *                            .negative_history 自由区字段面，不建第二库、零新 op）；
 * - search <task-id> [query] 词级精确检索（kernel searchTaskNegativeHistory——
 *                            knowledgeQueryTokens 同源，禁子串/等价猜测）；query 缺席
 *                            = 列全部登记；未命中显式「无记录」不虚构（REQ-03）。
 *
 * 分层纪律：判卷/落盘权威在 @pomaster/kernel（negative-history.ts 语义入口唯一），
 * 本模块只做 argv 收敛与呈现。AC-02 语义边界：登记/呈现不禁止任何后续尝试——
 * 「曾否定+原因」是可见性事实，重试是否被允许由流程纪律裁决（投影 reason 词形显式
 * 携带提示），本命令组不新增阻断。投影落位：context compile 对本任务的
 * [ADVISORY KNOWLEDGE] 分区呈现（kernel consumeNegativeHistory → advisoryEntries）。
 *
 * 纯读零建账：search 不调 createStore（幂等初始化会写骨架文件）——路径派生走
 * kernel buildStorePaths 纯函数 + readTaskNegativeHistory 同一装载面（view/audit/
 * knowledge search「纯读零写入」先例）。
 */
import {
  buildStorePaths,
  appendTaskNegativeEntry,
  GovernanceError,
  readTaskNegativeHistory,
  searchTaskNegativeHistory,
  TASK_NEGATIVE_HISTORY_FIELD,
} from "@pomaster/kernel";
import type { Store, TaskNegativeEntry } from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseActorArgv, requireInitialized } from "./permit.js";

/** kernel 所需最小面（结构化类型；缺省 = @pomaster/kernel 真实导出）。 */
export interface NegativeHistoryKernelDeps {
  createStore: (rootDir: string) => Promise<Store>;
  appendTaskNegativeEntry: typeof appendTaskNegativeEntry;
  readTaskNegativeHistory: typeof readTaskNegativeHistory;
  searchTaskNegativeHistory: typeof searchTaskNegativeHistory;
}

function defaultKernel(): NegativeHistoryKernelDeps {
  return {
    createStore: (root: string) => {
      // 动态 import 保持与既有命令模块同构（延迟装载 @pomaster/kernel）。
      return import("@pomaster/kernel").then((mod) => mod.createStore(root));
    },
    appendTaskNegativeEntry,
    readTaskNegativeHistory,
    searchTaskNegativeHistory,
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
    hint: "查看 docs/kernel-api.md §32（negative history 契约）；若为环境异常请勿静默降级。",
  };
}

function fail<T>(result: T, command: string, error: CliError): CommandOutcome<T> {
  return failOutcome(command, result, [error], [
    `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

/** 条目呈现视图（snake_case 机读面）。 */
export interface NegativeHistoryEntryView {
  readonly entry_index: number;
  readonly approach: string;
  readonly reason: string;
  readonly evidence_ref: string | null;
  readonly status: string;
  readonly recorded_by: TaskNegativeEntry["recorded_by"];
  readonly recorded_at_seq: number;
  readonly matched_tokens: readonly string[];
}

function entryView(entry: TaskNegativeEntry, entryIndex: number, matchedTokens: readonly string[]): NegativeHistoryEntryView {
  return {
    entry_index: entryIndex,
    approach: entry.approach,
    reason: entry.reason,
    evidence_ref: entry.evidence_ref,
    status: entry.status,
    recorded_by: entry.recorded_by,
    recorded_at_seq: entry.recorded_at_seq,
    matched_tokens: [...matchedTokens],
  };
}

// ============================================================
// negative-history record（登记面；唯一写通路 = kernel appendTaskNegativeEntry）
// ============================================================

export interface NegativeHistoryRecordInput {
  readonly taskRef: string;
  readonly approach?: string;
  readonly reason?: string;
  readonly evidenceRef?: string;
  readonly actor: string;
}

export interface NegativeHistoryRecordResult {
  readonly task_ref: string;
  readonly entry_index: number | null;
  readonly total_entries: number;
  readonly approach: string;
  readonly reason: string;
  readonly evidence_ref: string | null;
  readonly status: string;
  readonly applied_seq: number;
}

export async function runNegativeHistoryRecord(
  rootDir: string,
  input: NegativeHistoryRecordInput,
  deps?: Partial<NegativeHistoryKernelDeps>,
): Promise<CommandOutcome<NegativeHistoryRecordResult>> {
  const command = "negative-history record";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: NegativeHistoryRecordResult = {
    task_ref: input.taskRef,
    entry_index: null,
    total_entries: 0,
    approach: input.approach?.trim() ?? "",
    reason: input.reason?.trim() ?? "",
    evidence_ref: input.evidenceRef?.trim() ?? null,
    status: "REJECTED",
    applied_seq: 0,
  };
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  const actor = parseActorArgv(input.actor);
  if ("error" in actor) return fail(empty, command, actor.error);
  if (input.approach === undefined || input.approach.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--approach 必填（曾尝试的方案——检索键承载，REQ-03 检索判据）",
      hint: "给出被否定的方案/路径描述；示例：pomaster negative-history record TASK.T0087 --approach \"...\" --reason \"...\" --actor agent:claude",
    });
  }
  if (input.reason === undefined || input.reason.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--reason 必填（失败/否定原因——不留原因的否定 = 静默，禁）",
      hint: "给出失败/否定原因（检索键承载之一）；重试是否被允许由流程纪律裁决，本登记只做可见性（AC-02）。",
    });
  }
  try {
    const store = await kernel.createStore(rootDir);
    const result = await kernel.appendTaskNegativeEntry(store, {
      taskRef: input.taskRef,
      approach: input.approach,
      reason: input.reason,
      evidenceRef: input.evidenceRef,
      recordedBy: actor.actor,
    });
    const view: NegativeHistoryRecordResult = {
      task_ref: result.taskRef,
      entry_index: result.entryIndex,
      total_entries: result.totalEntries,
      approach: result.entry.approach,
      reason: result.entry.reason,
      evidence_ref: result.entry.evidence_ref,
      status: result.entry.status,
      applied_seq: result.appliedSeq,
    };
    const human = [
      `negative-history record → ${view.task_ref}（#${view.entry_index}，共 ${view.total_entries} 条；status=${view.status} 恒 REJECTED——否定事件流水）`,
      `  approach: ${view.approach}`,
      `  reason: ${view.reason}`,
      view.evidence_ref === null ? "  evidence_ref: (无——缺席诚实)" : `  evidence_ref: ${view.evidence_ref}`,
      `  落位: task payload.${TASK_NEGATIVE_HISTORY_FIELD}（truth 正文层——不建第二库；journal TX_APPLIED 留痕）`,
      "  AC-02: 重试不被机器禁止，但须新依据（流程纪律）；context compile 对本任务经 [ADVISORY KNOWLEDGE] 分区可见（不进 gate 判卷输入）",
    ];
    return okOutcome(command, view, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}

// ============================================================
// negative-history search（检索面；纯读零建账；未命中显式「无记录」）
// ============================================================

export interface NegativeHistorySearchResult {
  readonly task_ref: string;
  readonly query: string;
  readonly total_entries: number;
  readonly hits: readonly NegativeHistoryEntryView[];
}

export async function runNegativeHistorySearch(
  rootDir: string,
  input: { readonly taskRef: string; readonly query?: string },
  deps?: Partial<NegativeHistoryKernelDeps>,
): Promise<CommandOutcome<NegativeHistorySearchResult>> {
  const command = "negative-history search";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: NegativeHistorySearchResult = {
    task_ref: input.taskRef,
    query: input.query ?? "",
    total_entries: 0,
    hits: [],
  };
  // 纯读零建账：requireInitialized（NOT_INITIALIZED）→ buildStorePaths 纯函数 +
  // kernel readTaskNegativeHistory 同一装载面（禁 createStore——幂等初始化会写骨架）。
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  try {
    const paths = buildStorePaths(rootDir);
    const entries = kernel.readTaskNegativeHistory(paths, input.taskRef);
    const query = input.query ?? "";
    const hits = kernel.searchTaskNegativeHistory(entries, query);
    const view: NegativeHistorySearchResult = {
      task_ref: input.taskRef,
      query,
      total_entries: entries.length,
      hits: hits.map((hit) => entryView(hit.entry, hit.entryIndex, hit.matchedTokens)),
    };
    const human = [
      `negative-history search → ${view.hits.length} 命中（本任务共登记 ${view.total_entries} 条已否定方案；词级精确 token 交集，禁子串/等价猜测）`,
      ...view.hits.map(
        (hit) =>
          `  #${hit.entry_index} [${hit.status}] ${hit.approach}\n      reason: ${hit.reason}` +
          `${hit.evidence_ref === null ? "" : `\n      evidence_ref: ${hit.evidence_ref}`}` +
          `（recorded @ seq=${hit.recorded_at_seq} by ${hit.recorded_by.actor_type}:${hit.recorded_by.actor}` +
          `${hit.matched_tokens.length > 0 ? `；命中 token: ${hit.matched_tokens.join("/")}` : ""}）`,
      ),
      ...(view.total_entries === 0
        ? [`  （无记录——本任务无已否定方案登记；REQ-03「未命中保持未知」，不虚构）`]
        : view.hits.length === 0
          ? [`  （无命中——检索而非全量：登记在座但查询词未命中，显式空）`]
          : []),
      ...(view.hits.length > 0
        ? ["  AC-02: 重试不被机器禁止，但须新依据（流程纪律）；投影经 [ADVISORY KNOWLEDGE] 分区可见（不进 gate 判卷输入）"]
        : []),
    ];
    return okOutcome(command, view, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}
