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
 * - 纯读零写入：本命令不落任何事件（agents status 是观测不是治理动作）；装载走
 *   kernel loadStoreReadOnly（零写副作用，审查 H3）——不经 createStore（其
 *   ensureSidecars 会在侧车缺失的存量 store 上静默重建空账，丢失信号被吞），
 *   侧车缺失按「显式空/缺席」呈现（0 计数 + journal_events_scanned=0）；
 * - 触发 = warning 呈现 + ok 恒 true：观测面不施断——DEF-GATEKEEPER / DEF-SUP 的
 *   处置都是触发制升级信号，呈报 Owner 裁定，非本命令职权（对齐 status 命令
 *   「词表外观测值 warning 不改 ok 语义」先例）；
 * - 词形纪律：本命令局部词（GATEKEEPER_DRIFT_OBSERVED / SUPERVISOR_TRIGGER_OBSERVED /
 *   COMMAND_DEFERRED / execution 呈现两态）已随 PR-0009 入锁（vocab-lock presentation_axes 观测信号码位/CLI 呈现码位/execution_presentation_status 各轴）。
 */
import {
  detectGatekeeperDrift,
  detectSupervisorTrigger,
  GovernanceError,
  listExecutionRecords,
  listLocks,
  listSessionRecords,
  loadStoreReadOnly,
  type SupervisorTriggerSource,
} from "@pomaster/kernel";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";
import {
  asString,
  findIndexRow,
  isRecord,
  readBodyEnvelope,
  readRawIndexOrFail,
  resolveRowTargetId,
} from "./projection-common.js";
import { contextsDirPath, toPosix } from "./store-layout.js";
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

/** GATEKEEPER_DRIFT_OBSERVED（x-vocab-source: vocab-lock presentation_axes.observation_signal_codes——PR-0009）：观测信号 warning 位。 */
export const GATEKEEPER_DRIFT_OBSERVED = "GATEKEEPER_DRIFT_OBSERVED";

/** SUPERVISOR_TRIGGER_OBSERVED（x-vocab-source: vocab-lock presentation_axes.observation_signal_codes——PR-0009）：DEF-SUP 触发信号 warning 位。 */
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
    const store = loadStoreReadOnly(rootDir);
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
// agents dispatch-pack（裁定批 E P4：子代理派发包——09-05 提案 §2 P4）
// ============================================================

/**
 * 派发包分段标题（cli 局部词——批 D 先例；x-vocab-source 待词汇表批扫收编）。
 * 三段 = 提案 §2 P4 组成：任务 prd 摘要 + 关联 mapping/manifest 引用 + 红线摘要。
 */
export const DISPATCH_PACK_SECTION_TITLES = ["任务 PRD 摘要", "关联引用", "红线摘要"] as const;

/**
 * 预算（ADR 沿 Trellis PreToolUse 物化先例 32KB/文件·128KB 总预算折算 vNext 值）：
 * 单段 8192 字符（与 session 单段预算同量级）/ 总 32768 字符（32KB 先例逐字）；
 * 超限降级指针行（「详情跑 pomaster X」），禁静默切尾。
 */
export const DISPATCH_PACK_SECTION_BUDGET = 8_192;
export const DISPATCH_PACK_TOTAL_BUDGET = 32_768;

/** --out 落盘失败码位（cli 局部词；显式失败非静默降级为纯 stdout——context compile 先例）。 */
export const DISPATCH_PACK_WRITE_FAILED = "IO_WRITE_FAILED";

/** 派发包逐段自检行。 */
export interface DispatchPackSectionView {
  readonly title: string;
  readonly characters: number;
  readonly truncated: boolean;
}

export interface DispatchPackResult {
  /** argv 原词形。 */
  readonly task: string;
  readonly resolved_id: string | null;
  readonly resolved_via_alias: string | null;
  readonly sections: readonly DispatchPackSectionView[];
  readonly total_characters: number;
  readonly truncated: boolean;
  /** --out 落盘路径（posix 词形）；缺省 stdout 形态 = null（零写入）。 */
  readonly out_file: string | null;
}

/** 单段装配产物（内部形态）。 */
interface DispatchPackSection {
  readonly title: (typeof DISPATCH_PACK_SECTION_TITLES)[number];
  readonly lines: readonly string[];
  readonly pointer: string;
}

/** 关联引用段：context manifest 精确词形（context.ts taskRef 规则镜像）+ 绑定许可 + 检视路标。 */
async function referenceSection(
  rootDir: string,
  taskId: string,
  warnings: CliWarning[],
): Promise<DispatchPackSection> {
  const lines: string[] = [];
  const manifestPath = `${contextsDirPath(rootDir)}/${taskId}.context.json`;
  if (existsSync(manifestPath)) {
    let generatedAtSeq: number | null = null;
    try {
      const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
      const seq = isRecord(parsed) ? parsed.generated_at_seq : undefined;
      if (typeof seq === "number") generatedAtSeq = seq;
    } catch {
      generatedAtSeq = null;
    }
    lines.push(
      `- context manifest: ${toPosix(`.pomaster/state/contexts/${taskId}.context.json`)}` +
        `（generated_at_seq=${generatedAtSeq ?? "缺席"}；stale 比对: pomaster context compile --check --role <role> --change ${taskId}）`,
    );
  } else {
    lines.push(
      `- context manifest: 缺席（显式——编译: pomaster context compile --role <role> --change ${taskId}）`,
    );
  }
  const index = await readRawIndexOrFail(rootDir);
  if (!("error" in index)) {
    const row = findIndexRow(index.index, taskId);
    const permitsActive =
      row !== null && Array.isArray(row.permits_active)
        ? row.permits_active.map((ref) => asString(ref)).filter((ref): ref is string => ref !== null)
        : [];
    lines.push(
      permitsActive.length > 0
        ? `- 绑定许可: ${permitsActive.join(", ")}（活性判定: pomaster permit check；台账: pomaster permit list）`
        : "- 绑定许可: 缺席（显式——写路径开工前签发: pomaster permit issue --subject " +
            `${taskId} --actor <type>:<name>）`,
    );
  } else {
    warnings.push({
      code: index.error.code,
      message: `绑定许可引用读取失败（truth-index 不可读）：${index.error.message}`,
      hint: index.error.hint,
    });
  }
  lines.push(`- 对象检视: pomaster inspect ${taskId}；任务审查视图: pomaster view task ${taskId}`);
  return { title: "关联引用", lines, pointer: "详情跑 pomaster inspect " + taskId };
}

/** 红线摘要段（既有治理语义的静态呈现行 + 绑定事实透传——零新词形语义，每行附命令指针）。 */
function redlineSection(taskId: string): DispatchPackSection {
  return {
    title: "红线摘要",
    lines: [
      "- 受控变更唯一通路: pomaster maintain <change-or-task> --ops <tx>（kernel applyTransaction 唯一写入路径）——禁绕过治理面直写 .pomaster。",
      "- 写尝试判卷: pomaster exec-guard --attempt <file|->（严格判卷器非写入器；非 allow 一律拒绝）。",
      "- 证据入账: pomaster record gate-run/claim（record claim 恒 UNVERIFIED——VERIFIED 归独立验证流，D20：声称方不可自填判定）。",
      "- 完成判定: pomaster closeout " + taskId + "（DoD 判卷：acceptance→VERIFIED claim 硬绑；证据缺失伪装完成硬阻断）。",
      "- 执行身份: --execution-id <AGX-n> 盖章（S1 禁自造身份；登记: pomaster execution begin）。",
      "- 禁 git commit / git push / git merge（实现代理交付边界；提交动作归上游裁决）。",
    ],
    pointer: "红线词形权威: 治理命令卡（pomaster --help）",
  };
}

/** prd 摘要段（task payload 机器可汇编子集；缺席显式）。 */
function prdSection(
  taskId: string,
  rowTitle: string | null,
  row: Record<string, unknown>,
  payload: Record<string, unknown>,
): DispatchPackSection {
  const axes = isRecord(row.axes) ? row.axes : {};
  const lines: string[] = [
    `- id: ${taskId}`,
    `- title: ${rowTitle ?? "(missing title)"}`,
    `- axes: lifecycle=${asString(axes.lifecycle) ?? "?"} evidence=${asString(axes.evidence) ?? "?"} change=${asString(axes.change) ?? "?"}`,
  ];
  const intent = asString(payload.intent);
  lines.push(`- intent: ${intent ?? "（无——payload 未申报 intent）"}`);
  const expectedOutcome = asString(payload.expected_outcome);
  lines.push(`- expected_outcome: ${expectedOutcome ?? "（无——payload 未申报 expected_outcome）"}`);
  const implementsChange = asString(payload.implements_change);
  lines.push(`- implements_change: ${implementsChange ?? "（无——未申报实现锚）"}`);
  const acceptance = Array.isArray(payload.acceptance) ? payload.acceptance : [];
  if (acceptance.length === 0) {
    lines.push("- acceptance: （无——payload 未登记 acceptance 条目）");
  } else {
    acceptance.forEach((entry, i) => {
      const criterion = isRecord(entry) ? asString(entry.criterion) : null;
      const claim = isRecord(entry) ? asString(entry.claim) : null;
      lines.push(
        `- acceptance[${i}]: ${criterion ?? "(missing criterion)"}（claim: ${claim ?? "未映射——收口前须补证"}）`,
      );
    });
  }
  return { title: "任务 PRD 摘要", lines, pointer: "详情跑 pomaster inspect " + taskId };
}

/** 逐段预算截断（贪心保留 + 指针行——降级可见，禁静默切尾）。 */
function renderPackSections(
  sections: readonly DispatchPackSection[],
): { readonly lines: string[]; readonly views: DispatchPackSectionView[] } {
  const lines: string[] = [];
  const views: DispatchPackSectionView[] = [];
  for (const section of sections) {
    const contentLength = section.lines.join("\n").length;
    let kept: readonly string[] = section.lines;
    let truncated = false;
    if (contentLength > DISPATCH_PACK_SECTION_BUDGET) {
      const keep: string[] = [];
      let used = 0;
      for (const line of section.lines) {
        if (used + line.length + 1 > DISPATCH_PACK_SECTION_BUDGET) break;
        keep.push(line);
        used += line.length + 1;
      }
      kept = keep;
      truncated = true;
    }
    views.push({ title: section.title, characters: contentLength, truncated });
    lines.push(`## ${section.title}`);
    lines.push(...kept);
    if (truncated) {
      lines.push(`- …（超单段预算 ${DISPATCH_PACK_SECTION_BUDGET} 字符已截断；${section.pointer}）`);
    }
  }
  return { lines, views };
}

/**
 * `agents dispatch-pack <task>`（裁定批 E P4）：子代理派发包——任务 prd 摘要 +
 * 关联 mapping/manifest 引用 + 红线摘要，预算截断（单段 8KB/总 32KB，沿 Trellis
 * PreToolUse 物化 32KB/文件先例折算）；缺省 stdout 零写入，--out <path> 落盘。
 * 纯组装既有读取面零新治理语义（View not new database 同线：本包是投影非事实源，
 * 判卷权威在 kernel/治理命令面）。
 */
export async function runAgentsDispatchPack(
  rootDir: string,
  input: { readonly task: string; readonly out?: string },
): Promise<CommandOutcome<DispatchPackResult>> {
  const command = "agents dispatch-pack";
  const emptyResult: DispatchPackResult = {
    task: input.task,
    resolved_id: null,
    resolved_via_alias: null,
    sections: [],
    total_characters: 0,
    truncated: false,
    out_file: null,
  };
  const failPack = (error: CliError): CommandOutcome<DispatchPackResult> =>
    failOutcome(command, emptyResult, [error], [
      `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
    ]);

  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return failPack(initialized.error);

  const resolved = resolveRowTargetId(input.task);
  if ("error" in resolved) return failPack(resolved.error);

  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) return failPack(raw.error);
  const row = findIndexRow(raw.index, resolved.target);
  if (row === null) {
    return failPack({
      code: "OBJECT_NOT_FOUND",
      message: `任务不在 truth-index：${resolved.target}${resolved.viaAlias === null ? "" : `（由 ${resolved.viaAlias} 收编解析）`}`,
      hint: "pomaster status --json 查看对象清单；dispatch-pack 只服务 TASK.* 任务对象。",
    });
  }

  const warnings: CliWarning[] = [];
  const bodyResult = await readBodyEnvelope(rootDir, row);
  if ("error" in bodyResult) return failPack(bodyResult.error);
  const payload = isRecord(bodyResult.body.payload) ? bodyResult.body.payload : {};

  const sections: DispatchPackSection[] = [
    prdSection(resolved.target, asString(row.title_zh), row, payload),
    await referenceSection(rootDir, resolved.target, warnings),
    redlineSection(resolved.target),
  ];
  const rendered = renderPackSections(sections);
  const header = [
    `POMaster 子代理派发包 — ${resolved.target}（裁定批 E P4；纯组装既有读取面零新治理语义）`,
    `> 预算：单段 ≤${DISPATCH_PACK_SECTION_BUDGET} 字符 / 总 ≤${DISPATCH_PACK_TOTAL_BUDGET} 字符（超限降级指针行）；本包是投影非事实源——判卷权威在 kernel/治理命令面。`,
    `> task: ${resolved.target}${resolved.viaAlias === null ? "" : `（由 ${resolved.viaAlias} 收编解析）`}`,
    "",
  ];
  let packLines: readonly string[] = [...header, ...rendered.lines];
  let truncated = rendered.views.some((view) => view.truncated);
  if (packLines.join("\n").length > DISPATCH_PACK_TOTAL_BUDGET) {
    const capped = capPlainPack(packLines, DISPATCH_PACK_TOTAL_BUDGET);
    packLines = capped;
    truncated = true;
  }

  let outFile: string | null = null;
  if (input.out !== undefined) {
    try {
      writeFileSync(input.out, `${packLines.join("\n")}\n`, "utf8");
      outFile = toPosix(input.out);
    } catch (err) {
      return failOutcome(command, { ...emptyResult, sections: rendered.views }, [
        {
          code: DISPATCH_PACK_WRITE_FAILED,
          message: `--out 落盘失败：${err instanceof Error ? err.message : String(err)}`,
          hint: "核查路径可写性后重试；失败不静默降级为纯 stdout（context compile R2/D7 先例）。",
        },
      ], [`${command}: FAILED — ${DISPATCH_PACK_WRITE_FAILED}`]);
    }
  }

  const result: DispatchPackResult = {
    task: input.task,
    resolved_id: resolved.target,
    resolved_via_alias: resolved.viaAlias,
    sections: rendered.views,
    total_characters: packLines.join("\n").length,
    truncated,
    out_file: outFile,
  };
  return okOutcome(command, result, packLines, warnings);
}

/** 总预算截断（capPlainOutput 同式语义——本模块自带实现避免 alerts 依赖倒挂）。 */
function capPlainPack(lines: readonly string[], cap: number): readonly string[] {
  const text = lines.join("\n");
  if (text.length <= cap) return lines;
  const marker = `…[POMaster] 派发包超过 ${cap} 字符总预算，已截断（明细: pomaster inspect <task-id>）`;
  const keep = Math.max(0, cap - marker.length);
  return `${text.slice(0, keep)}${marker}`.split("\n");
}

// ============================================================
// run / handoff（§44.8 显式 deferred：P21 AgentRuntime 面）
// ============================================================

/** COMMAND_DEFERRED（x-vocab-source: vocab-lock presentation_axes.cli_presentation_codes——PR-0009）：命令已注册但实现显式 deferred。 */
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
