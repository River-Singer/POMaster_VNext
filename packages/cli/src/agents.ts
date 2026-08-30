/**
 * agents.ts —— §44.8 Agent 命令面：`agents status` 兑现 + `run` / `handoff` 显式
 * deferred（P20-Commands；PRD §44.8 三命令注记状态的兑现裁定）。
 *
 * §44.8 裁定（decisions 落档 docs/wave3-p20-sec79-backfill-44-8.md；§79 回填记录
 * MECHANISM_GAP 类同批落档——PRD 正文不改，任务 prd R3）：
 * - `agents status` **本阶段兑现**：solo 形态下「agents 状态」的可兑现对位 = D 线
 *   地基三原语的运行时观测面（sessions liveness / locks liveness / executions 档案
 *   清单）+ DEF-GATEKEEPER 分身漂移信号。PRD §44.8 未定义 status 的字段面；本命令
 *   不发明 AgentRuntime 语义（那归 P21），只聚合既有平面纯读呈现（P20 出口判据
 *   「DEF-GATEKEEPER 触发观测变为可测」的 CLI 呈现位）。
 * - `run <task> [--role <role>]` / `handoff <task> --to <role>` **显式 deferred**：
 *   二者需要 AgentRuntime 托管编排（wave3-plan.md P21 范围锚；D 线 §1.1 SOLO-DIRECT
 *   ——`pomaster run` 托管编排是 DEF-SUP 触发制的 P1 形态，P0 直连模式不需要）。
 *   命令注册但执行恒 fail-closed：COMMAND_DEFERRED 错误 + 指路 hint——「不静默缺席」
 *   （敲命令得到显式 deferred 提示，好于命令不存在或文档幽灵行；B1 缺陷史同源教训）。
 *
 * 观测纪律：
 * - 纯读零写入：本命令不落任何事件（agents status 是观测不是治理动作）；
 * - GATEKEEPER 触发 = warning 呈现 + ok 恒 true：观测面不施断——DEF-GATEKEEPER 的
 *   处置是触发制升级信号（P1-P2：分身强制/第二贡献者），呈报 Owner 裁定，非本命令
 *   职权（对齐 status 命令「词表外观测值 warning 不改 ok 语义」先例）；
 * - 词形纪律：本命令局部词（GATEKEEPER_DRIFT_OBSERVED / COMMAND_DEFERRED /
 *   execution 呈现两态）均带 TODO(vocab-pr) 注记。
 */
import {
  createStore,
  detectGatekeeperDrift,
  GovernanceError,
  listExecutionRecords,
  listLocks,
  listSessionRecords,
} from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import { runtimeStorePaths } from "./runtime.js";

// ============================================================
// agents status（§44.8 兑现：运行时观测面）
// ============================================================

export interface AgentsStatusResult {
  readonly sessions: readonly {
    readonly session_key: string;
    readonly harness: string;
    readonly liveness: "alive" | "stale";
    readonly current_task: string | null;
    readonly held_locks: readonly string[];
  }[];
  readonly locks: readonly {
    readonly lock_id: string;
    readonly lock_kind: string;
    readonly holder_session_key: string;
    readonly fence: number;
    readonly liveness: "held" | "stale";
    readonly stale_reason: string | null;
  }[];
  readonly executions: readonly {
    readonly execution_id: string;
    readonly role: string;
    readonly runtime: string;
    readonly identity_kind: string;
    readonly session_key: string | null;
    readonly status: "active" | "ended";
    readonly started_at: string;
    readonly ended_at: string | null;
  }[];
  /** DEF-GATEKEEPER 触发观测（同 execution 既提 proposal 又 ALLOW；D 线 §5）。 */
  readonly gatekeeper_drift: {
    readonly threshold: number;
    readonly window_days: number;
    readonly executions_with_identity: number;
    readonly triggered: boolean;
    readonly rows: readonly {
      readonly execution_id: string;
      readonly proposal_count: number;
      readonly allow_count: number;
      readonly execution_started_at: string | null;
      readonly in_window: boolean;
      readonly drift: boolean;
    }[];
  };
}

/** GATEKEEPER_DRIFT_OBSERVED（CLI 局部词 TODO(vocab-pr)）：观测信号 warning 位。 */
export const GATEKEEPER_DRIFT_OBSERVED = "GATEKEEPER_DRIFT_OBSERVED";

/**
 * `agents status`：solo 形态的 agents 运行时观测面（sessions/locks/executions +
 * DEF-GATEKEEPER 漂移信号）。纯读零写；未初始化 NOT_INITIALIZED；观测触发不改 ok。
 */
export async function runAgentsStatus(
  rootDir: string,
): Promise<CommandOutcome<AgentsStatusResult>> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) {
    return failOutcome("agents status", emptyAgentsStatus(), [initialized.error], [
      `agents status: FAILED — ${initialized.error.code}\n  hint: ${initialized.error.hint}`,
    ]);
  }
  try {
    const store = await createStore(rootDir);
    const paths = runtimeStorePaths(store);
    const sessionRows = listSessionRecords(paths);
    const lockRows = listLocks(paths);
    const executionRecords = listExecutionRecords(paths);
    const drift = detectGatekeeperDrift(store);

    const result: AgentsStatusResult = {
      sessions: sessionRows.map((row) => ({
        session_key: row.record.session_key,
        harness: row.record.harness,
        liveness: row.liveness,
        current_task: row.record.current_task,
        held_locks: row.record.held_locks,
      })),
      locks: lockRows.map((row) => ({
        lock_id: row.record.lock_id,
        lock_kind: row.record.lock_kind,
        holder_session_key: row.record.holder.session_key,
        fence: row.record.fence,
        liveness: row.liveness,
        stale_reason: row.stale_reason,
      })),
      executions: executionRecords.map((record) => ({
        execution_id: record.execution_id,
        role: record.role,
        runtime: record.runtime,
        identity_kind: record.identity_kind,
        session_key: record.session_key,
        status: record.ended_at === null ? "active" : "ended",
        started_at: record.started_at,
        ended_at: record.ended_at,
      })),
      gatekeeper_drift: {
        threshold: drift.threshold,
        window_days: drift.window_days,
        executions_with_identity: drift.executions_with_identity,
        triggered: drift.triggered,
        rows: drift.rows.map((row) => ({
          execution_id: row.execution_id,
          proposal_count: row.proposal_count,
          allow_count: row.allow_count,
          execution_started_at: row.execution_started_at,
          in_window: row.in_window,
          drift: row.drift,
        })),
      },
    };

    const warnings: CliWarning[] = [];
    if (drift.triggered) {
      const drifted = drift.rows
        .filter((row) => row.drift && row.in_window)
        .map((row) => row.execution_id);
      warnings.push({
        code: GATEKEEPER_DRIFT_OBSERVED,
        message: `DEF-GATEKEEPER 观测触发（同一 execution 既提 proposal 又 ALLOW ≥${drift.threshold} 次/窗）：${drifted.join(", ")}`,
        hint: "Gatekeeper 与提案者强制分身纪律的漂移信号（D 线 §5；触发处置 = P1-P2 升级裁定，呈报 Owner）——本命令只观测不施断。",
      });
    }

    const human = [
      `agents status → sessions=${result.sessions.length} locks=${result.locks.length} executions=${result.executions.length}（solo 运行时观测面；§44.8 兑现=P20 D 线地基聚合，AgentRuntime 归 P21）`,
      ...result.sessions.map(
        (row) =>
          `  session ${row.session_key} (${row.harness}) liveness=${row.liveness} locks=[${row.held_locks.join(", ")}]${row.current_task !== null ? ` task=${row.current_task}` : ""}`,
      ),
      ...result.locks.map(
        (row) =>
          `  lock ${row.lock_id} holder=${row.holder_session_key} fence=${row.fence} liveness=${row.liveness}${row.stale_reason !== null ? ` stale_reason=${row.stale_reason}` : ""}`,
      ),
      ...result.executions.map(
        (row) =>
          `  execution ${row.execution_id} (${row.role}/${row.runtime}/${row.identity_kind}) status=${row.status} session=${row.session_key ?? "null"}`,
      ),
      `  gatekeeper: threshold=${drift.threshold}/window=${drift.window_days}d identity_executions=${drift.executions_with_identity} triggered=${drift.triggered ? "YES（见 warnings）" : "no"}`,
    ];
    return okOutcome("agents status", result, human, warnings);
  } catch (err) {
    const error: CliError =
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "kernel 观测面装载失败；契约见 docs/kernel-api.md §13。",
          };
    return failOutcome("agents status", emptyAgentsStatus(), [error], [
      `agents status: FAILED — ${error.code}\n  hint: ${error.hint}`,
    ]);
  }
}

function emptyAgentsStatus(): AgentsStatusResult {
  return {
    sessions: [],
    locks: [],
    executions: [],
    gatekeeper_drift: {
      threshold: 0,
      window_days: 0,
      executions_with_identity: 0,
      triggered: false,
      rows: [],
    },
  };
}

// ============================================================
// run / handoff（§44.8 显式 deferred：P21 AgentRuntime 面）
// ============================================================

/** COMMAND_DEFERRED（CLI 局部码 TODO(vocab-pr)）：命令已注册但实现显式 deferred。 */
export const COMMAND_DEFERRED = "COMMAND_DEFERRED";

/** §44.8 deferred 指路（run/handoff 共用；P21 范围锚 + 回填记录载体）。 */
const DEFERRED_HINT =
  "run/handoff 需要 AgentRuntime 托管编排（wave3-plan.md P21：AgentRuntime 契约 + Capability Pool 词汇层）；P0 solo 直连形态由当前 Harness 主 Agent 直接执行（PRD §25.2 MINIMAL 内生依据，D 线 §1.1 SOLO-DIRECT）。§79 回填记录（MECHANISM_GAP 类）见仓库 docs/wave3-p20-sec79-backfill-44-8.md（Owner 本地档）。";

export interface DeferredCommandResult {
  readonly command: string;
  readonly deferred_to: "P21";
  readonly reason: "AGENT_RUNTIME_NOT_LANDED";
}

/**
 * `run <task> [--role <role>]`：§44.8 托管编排——显式 deferred（COMMAND_DEFERRED
 * exit 1；注册命令面 + 显式提示，「不静默缺席」兑现）。
 */
export function runRun(rootDir: string, task: string, role?: string): CommandOutcome<DeferredCommandResult> {
  void rootDir;
  return failOutcome<DeferredCommandResult>(
    "run",
    { command: "run", deferred_to: "P21", reason: "AGENT_RUNTIME_NOT_LANDED" },
    [
      {
        code: COMMAND_DEFERRED,
        message: `pomaster run <task> 显式 deferred 至 P21（task=${task}${role !== undefined ? `, role=${role}` : ""}）`,
        hint: DEFERRED_HINT,
      },
    ],
    [
      `run: DEFERRED — COMMAND_DEFERRED（显式 deferred 提示，非静默缺席）`,
      `  ${DEFERRED_HINT}`,
    ],
  );
}

/**
 * `handoff <task> --to <role>`：§44.8 会话交接——显式 deferred（同 run；Handoff
 * Protocol 的执行面归 P21 Runtime Adapter，PRD §24 契约词汇层同批）。
 */
export function runHandoff(
  rootDir: string,
  task: string,
  to: string,
): CommandOutcome<DeferredCommandResult> {
  void rootDir;
  return failOutcome<DeferredCommandResult>(
    "handoff",
    { command: "handoff", deferred_to: "P21", reason: "AGENT_RUNTIME_NOT_LANDED" },
    [
      {
        code: COMMAND_DEFERRED,
        message: `pomaster handoff <task> --to <role> 显式 deferred 至 P21（task=${task}, to=${to}）`,
        hint: DEFERRED_HINT,
      },
    ],
    [
      `handoff: DEFERRED — COMMAND_DEFERRED（显式 deferred 提示，非静默缺席）`,
      `  ${DEFERRED_HINT}`,
    ],
  );
}
