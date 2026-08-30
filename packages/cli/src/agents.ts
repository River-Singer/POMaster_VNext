/**
 * agents.ts —— §44.8 Agent 命令面：`agents status` 兑现 + `run` / `handoff` 显式
 * deferred（P20-Commands 建面；P21-Contract 兑现注记 + DEF-SUP 观测位接入）。
 *
 * §44.8 裁定（decisions 落档 docs/wave3-p20-sec79-backfill-44-8.md；§79 回填记录
 * MECHANISM_GAP 类同批落档——PRD 正文不改，任务 prd R3；P21 收口义务见同文件 §5）：
 * - `agents status` **本阶段兑现**：solo 形态下「agents 状态」的可兑现对位 = D 线
 *   地基三原语的运行时观测面（sessions liveness / locks liveness / executions 档案
 *   清单）+ DEF-GATEKEEPER 分身漂移信号（P20）+ DEF-SUP 触发制观测位（P21-Contract：
 *   D 线 §5 三触发条件——同 SOP 链重复 / 第二贡献者 / headless-CI；后两者为显式
 *   申报入参 --second-contributor / --headless-ci，source=declared 如实呈现）。
 * - `run <task> [--role <role>]` / `handoff <task> --to <role>` **显式 deferred**：
 *   P21-Contract 已落 AgentRuntime 契约（kernel runtime-adapter.ts——能力探测 +
 *   §58 四条降级规则 + 伪装并发封条），但托管编排（supervisor daemon / run 托管
 *   执行）按 DEF-SUP 触发制门槛 defer——**不建 daemon**（PRD grep "daemon" 0 命中；
 *   Supervisor 是 §25.3 角色不是进程），触发条件不成立不立项（Minimum Sufficient
 *   Governance）。命令注册但执行恒 fail-closed：COMMAND_DEFERRED 错误 + 指路
 *   hint（「不静默缺席」；P21 词形复核裁定：COMMAND_DEFERRED 码位不退役——命令
 *   仍 deferred，reason 由 AGENT_RUNTIME_NOT_LANDED 更新为 DEF_SUP_NOT_TRIGGERED，
 *   deferred_to 更新为 DEF-SUP）。
 *
 * 观测纪律：
 * - 纯读零写入：本命令不落任何事件（agents status 是观测不是治理动作）；
 * - 触发 = warning 呈现 + ok 恒 true：观测面不施断——DEF-GATEKEEPER / DEF-SUP 的
 *   处置都是触发制升级信号，呈报 Owner 裁定，非本命令职权（对齐 status 命令
 *   「词表外观测值 warning 不改 ok 语义」先例）；
 * - 词形纪律：本命令局部词（GATEKEEPER_DRIFT_OBSERVED / SUPERVISOR_TRIGGER_OBSERVED /
 *   COMMAND_DEFERRED / execution 呈现两态）均带 TODO(vocab-pr) 注记。
 */
import {
  createStore,
  detectGatekeeperDrift,
  detectSupervisorTrigger,
  GovernanceError,
  listExecutionRecords,
  listLocks,
  listSessionRecords,
  type SupervisorTriggerSource,
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
  /** DEF-SUP 触发制观测（P21-Contract；D 线 §5 三触发条件；观测不施断）。 */
  readonly supervisor_trigger: {
    readonly chain_threshold: number;
    readonly chain_min_length: number;
    readonly window: "full_journal";
    readonly journal_events_scanned: number;
    readonly condition_sop_chain_repeat: {
      readonly source: SupervisorTriggerSource;
      readonly triggered: boolean;
      readonly chains: readonly {
        readonly chain: readonly string[];
        readonly count: number;
      }[];
    };
    readonly condition_second_contributor: {
      readonly source: SupervisorTriggerSource;
      readonly triggered: boolean;
    };
    readonly condition_headless_ci: {
      readonly source: SupervisorTriggerSource;
      readonly triggered: boolean;
    };
    readonly triggered: boolean;
  };
}

/** GATEKEEPER_DRIFT_OBSERVED（CLI 局部词 TODO(vocab-pr)）：观测信号 warning 位。 */
export const GATEKEEPER_DRIFT_OBSERVED = "GATEKEEPER_DRIFT_OBSERVED";

/** SUPERVISOR_TRIGGER_OBSERVED（CLI 局部词 TODO(vocab-pr)）：DEF-SUP 触发信号 warning 位。 */
export const SUPERVISOR_TRIGGER_OBSERVED = "SUPERVISOR_TRIGGER_OBSERVED";

/** agents status 观测输入（DEF-SUP 申报位；缺省 = 未申报）。 */
export interface AgentsStatusInput {
  /** D 线 §5 (b) 第二贡献者加入（操作者显式申报；source=declared 如实呈现）。 */
  readonly secondContributor?: boolean;
  /** D 线 §5 (c) 需要 headless/CI 无人值守跑 change（同上）。 */
  readonly headlessCi?: boolean;
}

/**
 * `agents status`：solo 形态的 agents 运行时观测面（sessions/locks/executions +
 * DEF-GATEKEEPER 漂移信号 + DEF-SUP 触发制观测）。纯读零写；未初始化
 * NOT_INITIALIZED；观测触发不改 ok。
 */
export async function runAgentsStatus(
  rootDir: string,
  input: AgentsStatusInput = {},
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
    const supervisor = detectSupervisorTrigger(store, {
      ...(input.secondContributor !== undefined ? { secondContributor: input.secondContributor } : {}),
      ...(input.headlessCi !== undefined ? { headlessCi: input.headlessCi } : {}),
    });

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
      supervisor_trigger: {
        chain_threshold: supervisor.chain_threshold,
        chain_min_length: supervisor.chain_min_length,
        window: supervisor.window,
        journal_events_scanned: supervisor.journal_events_scanned,
        condition_sop_chain_repeat: {
          source: supervisor.condition_sop_chain_repeat.source,
          triggered: supervisor.condition_sop_chain_repeat.triggered,
          chains: supervisor.condition_sop_chain_repeat.chains.map((match) => ({
            chain: match.chain,
            count: match.count,
          })),
        },
        condition_second_contributor: {
          source: supervisor.condition_second_contributor.source,
          triggered: supervisor.condition_second_contributor.triggered,
        },
        condition_headless_ci: {
          source: supervisor.condition_headless_ci.source,
          triggered: supervisor.condition_headless_ci.triggered,
        },
        triggered: supervisor.triggered,
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
    if (supervisor.triggered) {
      const fired: string[] = [];
      if (supervisor.condition_sop_chain_repeat.triggered) fired.push("sop_chain_repeat（journal 实测）");
      if (supervisor.condition_second_contributor.triggered) fired.push("second_contributor（申报）");
      if (supervisor.condition_headless_ci.triggered) fired.push("headless_ci（申报）");
      warnings.push({
        code: SUPERVISOR_TRIGGER_OBSERVED,
        message: `DEF-SUP 触发制观测成立（${fired.join("；")}）——supervisor 托管编排立项评估信号`,
        hint: "D 线 §5 DEF-SUP（满足其一即立项评估）：常驻 supervisor daemon / pomaster run 托管编排。处置呈报 Owner（观测面不施断）；触发成立前 run/handoff 保持显式 deferred（不建 daemon：PRD 无 daemon 载体，Supervisor 是 §25.3 角色）。",
      });
    }

    const human = [
      `agents status → sessions=${result.sessions.length} locks=${result.locks.length} executions=${result.executions.length}（solo 运行时观测面；§44.8 兑现=D 线地基聚合 + P21 Runtime Adapter 契约面）`,
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
      `  supervisor: chain_threshold=${supervisor.chain_threshold}/chain_min_length=${supervisor.chain_min_length}/window=${supervisor.window}(${supervisor.journal_events_scanned} events) triggered=${supervisor.triggered ? "YES（见 warnings）" : "no"}`,
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
    supervisor_trigger: {
      chain_threshold: 0,
      chain_min_length: 0,
      window: "full_journal",
      journal_events_scanned: 0,
      condition_sop_chain_repeat: { source: "measured", triggered: false, chains: [] },
      condition_second_contributor: { source: "declared", triggered: false },
      condition_headless_ci: { source: "declared", triggered: false },
      triggered: false,
    },
  };
}

// ============================================================
// run / handoff（§44.8 显式 deferred：P21 AgentRuntime 面）
// ============================================================

/** COMMAND_DEFERRED（CLI 局部码 TODO(vocab-pr)）：命令已注册但实现显式 deferred。 */
export const COMMAND_DEFERRED = "COMMAND_DEFERRED";

/**
 * §44.8 deferred 指路（run/handoff 共用；P21-Contract 词形复核后的裁定文本——
 * 复核结论：COMMAND_DEFERRED 码位不退役（命令仍 deferred），deferred 对象由
 * 阶段位（P21）更正为触发制（DEF-SUP）——契约已落、托管编排受触发门槛）。
 */
const DEFERRED_HINT =
  "AgentRuntime 契约已落地（P21-Contract：kernel runtime-adapter.ts——能力探测 + §58 四条降级规则 + 伪装并发封条 + Capability Pool 十二角色词汇），但 run/handoff 的托管编排按 DEF-SUP 触发制门槛 defer（D 线 §5：每周 ≥3 次同 SOP 链人肉重复 / 第二贡献者 / headless-CI 需求，满足其一才立项评估；观测位 = agents status 的 supervisor_trigger 段）。触发成立前不建 daemon（Minimum Sufficient Governance；Supervisor 是 PRD §25.3 角色不是进程）。P0/P21 solo 直连形态由当前 Harness 主 Agent 直接执行（PRD §25.2 MINIMAL 内生依据，D 线 §1.1 SOLO-DIRECT）。§79 回填记录（MECHANISM_GAP 类）见仓库 docs/wave3-p20-sec79-backfill-44-8.md（Owner 本地档）。";

export interface DeferredCommandResult {
  readonly command: string;
  /** deferred 对象（P21 复核裁定：由阶段位 P21 更正为触发制 DEF-SUP——契约已落）。 */
  readonly deferred_to: "DEF-SUP";
  readonly reason: "DEF_SUP_NOT_TRIGGERED";
}

/**
 * `run <task> [--role <role>]`：§44.8 托管编排——显式 deferred（COMMAND_DEFERRED
 * exit 1；注册命令面 + 显式提示，「不静默缺席」兑现；P21-Contract 后 deferred
 * 语义 = DEF-SUP 触发制门槛未成立，非 AgentRuntime 契约缺席）。
 */
export function runRun(rootDir: string, task: string, role?: string): CommandOutcome<DeferredCommandResult> {
  void rootDir;
  return failOutcome<DeferredCommandResult>(
    "run",
    { command: "run", deferred_to: "DEF-SUP", reason: "DEF_SUP_NOT_TRIGGERED" },
    [
      {
        code: COMMAND_DEFERRED,
        message: `pomaster run <task> 显式 deferred（DEF-SUP 触发制门槛未成立；task=${task}${role !== undefined ? `, role=${role}` : ""}）`,
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
 * `handoff <task> --to <role>`：§44.8 会话交接——显式 deferred（同 run；§24
 * Handoff Packet 词形已随 Capability Pool 词汇层入档，执行面仍受触发制门槛）。
 */
export function runHandoff(
  rootDir: string,
  task: string,
  to: string,
): CommandOutcome<DeferredCommandResult> {
  void rootDir;
  return failOutcome<DeferredCommandResult>(
    "handoff",
    { command: "handoff", deferred_to: "DEF-SUP", reason: "DEF_SUP_NOT_TRIGGERED" },
    [
      {
        code: COMMAND_DEFERRED,
        message: `pomaster handoff <task> --to <role> 显式 deferred（DEF-SUP 触发制门槛未成立；task=${task}, to=${to}）`,
        hint: DEFERRED_HINT,
      },
    ],
    [
      `handoff: DEFERRED — COMMAND_DEFERRED（显式 deferred 提示，非静默缺席）`,
      `  ${DEFERRED_HINT}`,
    ],
  );
}
