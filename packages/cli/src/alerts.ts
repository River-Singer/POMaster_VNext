/**
 * alerts.ts —— `pomaster alerts`：可行动项过滤器（重入口 UserPromptSubmit 轻提醒源）。
 *
 * hook 输出契约（research/claude-hooks-reference.md 逐条核实，优先级高于通用命令纪律）：
 * - 恒 exit 0：非零退出 + stdout 会被 harness 呈现为 hook 错误通知；exit 2 会阻断
 *   prompt 处理——本命令永不失败（降级走 warnings 留痕于 --json 信封，人读通道静默）；
 * - 干净=非空但极简（R3 2026-09-06 工作流路由注入；此前「干净=空输出」的提醒器形态
 *   已升级为工作流路由器）：初始化后输出恒带 ≤3 行 workflow 路由段——无活跃 TASK →
 *   「八拍① brainstorm start」单入口（D-5 2026-09-08，owner-adjudications.md#裁决18：
 *   双入口收敛为 brainstorm 单入口，「只有一条公开通路」成真；讨论驻留与新变更同走
 *   brainstorm）；
 *   有活跃 TASK → 八拍当前位置 + 下一拍命令 + 对应分段卡名；有告警时告警块在前、
 *   路由段收尾。未初始化仍零输出（init 引导归 SessionStart 速览专属，告警通道自我
 *   克制）；
 * - 纯文本不以 `{` 开头：exit 0 + `{`…`}` 包裹的 stdout 会被尝试按 JSON 解析——
 *   本命令人读输出恒以 `POMaster` 词形开头；
 * - 亚秒级：只读 truth-index / permits 台账两个小文件，零现场扫描、零写副作用；
 * - 10,000 字符硬上限：hook 注入输出超限会被转存文件+预览——本命令自行截断并加
 *   显式标记（禁静默切尾）。
 *
 * 可行动项派生（从 truth-index / permits 现有只读面派生，零第二事实源；过期判定
 * 语义与 `permit list` 逐字同源：stolen 优先，其次 current_seq >= expires_at_seq）：
 * - PERMIT_EXPIRED：台账内未被盗取且已过期的许可；
 * - OBJECT_CHALLENGED：change 轴处于 CHALLENGED 的治理对象。
 * 原 triage TTL 显式缺席类目随 D-1/D-5（裁决 18，2026-09-08）一并退役：triage 判档
 * 结果不落账的 TTL 过期语义随之消亡，unsourced_categories 收敛为空（显式空数组——
 * 零类目在场，非缺席隐藏）。
 */

import { readFile } from "node:fs/promises";
import { CHANGE_VALUES } from "@pomaster/schemas";
import {
  EIGHT_BEAT_ENFORCEMENT_LINES,
  collectNextActionSnapshot,
  evaluateNextAction,
  renderBreadcrumb,
  type NextAction,
  type NextActionSnapshot,
} from "./next-action.js";
import {
  PERMITS_RELATIVE,
  TRUTH_INDEX_RELATIVE,
  permitsFilePath,
  toPosix,
  truthIndexPath,
} from "./store-layout.js";
import type { CliWarning, CommandOutcome } from "./envelope.js";
import { okOutcome } from "./envelope.js";

/** 可行动项种类词表（x-vocab-source: vocab-lock presentation_axes.alert_kinds——PR-0009 收编）。 */
export const ALERT_KINDS = ["PERMIT_EXPIRED", "OBJECT_CHALLENGED"] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];

/**
 * 显式缺席的告警类目（有语义、无派生源）：分母披露纪律——缺什么数据源在此逐字
 * 登记，不冒充「检查过且干净」。零类目 = 空数组（显式空，非缺席隐藏）。
 * 历史：triage_ttl 类目随 D-1/D-5 triage 退役一并消亡（裁决 18，2026-09-08）。
 */
export const ALERT_UNSOURCED_CATEGORIES = [] as const;

/** alerts 人读输出硬上限（UserPromptSubmit 注入同受 10,000 字符 hook 上限约束）。 */
export const ALERTS_OUTPUT_HARD_CAP = 10_000;

/** 单条可行动项。 */
export interface AlertItem {
  readonly kind: AlertKind;
  /** 对象 id / 许可引用。 */
  readonly ref: string;
  /** 许可的契约引用（PERMIT_EXPIRED 专属；其余 null——缺席显式）。 */
  readonly change_ref: string | null;
  /** 事实陈述（事实措辞，避免指令式祈使句——防 prompt-injection 防御误拦）。 */
  readonly detail: string;
  /** 行动路标（escalation 纪律：报什么就带去哪修）。 */
  readonly next: string;
}

export interface AlertsResult {
  readonly initialized: boolean;
  readonly current_seq: number | null;
  /** 台账内未盗取且未过期（current_seq < expires_at_seq）的许可数（活性速览）。 */
  readonly permits_active: number;
  readonly alerts: readonly AlertItem[];
  /** 有语义但暂无持久化派生源的类目（显式缺席，禁冒充已检查）。 */
  readonly unsourced_categories: readonly string[];
  /**
   * 面包屑行（裁定批 E P3——有活跃 TASK 时单行「拍位 + 下一命令」；无任务/未初始（历史裁定，锚缺失——裁定批 E，2026-09-05 执行轮；未入 corpus 台账，T3-R3 如实标注）
   * 化 = null 调用方静默；路由与 status/session 同表共享，P2 next-action.ts）。
   * R3 起人读通道由 workflow_routing 承载（信息超集），本字段保留为机读面。
   */
  readonly breadcrumb: string | null;
  /** P3 面包屑的结构化同源（command=null = 诚实无法判定；未初始化 = null 缺席显式）。 */
  readonly next_action: NextAction | null;
  /**
   * 工作流路由段（R3 2026-09-06；hook 人读注入的恒在段——未初始化 = 空数组静默）：
   * 无活跃 TASK → 判档/讨论双入口；有 → 八拍位置 + 下一拍命令 + 分段卡名。≤3 行。
   */
  readonly workflow_routing: readonly string[];
}

/** 派生内部形态（warnings 一并携带——hook 契约恒 exit 0，降级只留痕不失败）。 */
export interface AlertsDerivation {
  readonly initialized: boolean;
  readonly current_seq: number | null;
  /** 台账内未盗取且未过期（current_seq < expires_at_seq）的许可数。 */
  readonly permits_active: number;
  readonly alerts: readonly AlertItem[];
  readonly warnings: readonly CliWarning[];
}

/** hook 纯文本输出硬上限（共享实现：session 与 alerts 同一截断语义，禁两套口径）。 */
export function capPlainOutput(
  lines: readonly string[],
  cap: number,
): { readonly text: string; readonly truncated: boolean } {
  const text = lines.join("\n");
  if (text.length <= cap) return { text, truncated: false };
  const marker = `\n…[POMaster] 输出超过 ${cap} 字符上限，已截断（完整状态：pomaster status --json）`;
  const keep = Math.max(0, cap - marker.length);
  return { text: `${text.slice(0, keep)}${marker}`, truncated: true };
}

/**
 * 八拍拍位 → 分段命令卡名（R3 工作流路由段的「对应分段卡」；卡名词形与
 * SKILL_MANIFEST 注册表同源——heavy-entry 命令卡库，tests 钉住双向闭合，禁第二套
 * 卡名声明）。D-5（裁决 18，2026-09-08）：① 卡名 = pomaster-discovery（triage 卡
 * 随命令退役删除）；beat "0"（R_NOT_INITIALIZED/R_BASELINE_NOT_READY 路由拍位，
 * T2 check 裁定项④收编）→ pomaster-bootstrap（0 BOOTSTRAP 拍）。
 */
export const BEAT_CARD_NAMES: Readonly<Record<string, string>> = {
  "0": "pomaster-bootstrap",
  "①": "pomaster-discovery",
  "②": "pomaster-permit",
  "③": "pomaster-context",
  "④": "pomaster-execute",
  "⑤": "pomaster-verify",
  "⑥": "pomaster-reconcile",
  "⑦": "pomaster-compact",
  "⑧": "pomaster-closeout",
};

/**
 * 工作流路由段渲染（R3；与 breadcrumb 同一 evaluateNextAction 路由表——禁两套路由
 * 口径漂移）。≤3 行：无活跃 TASK → 八拍① Brainstorm 单入口；有 → 拍位/拍名行 +
 * 下一拍命令行 + 分段卡行；UNDETERMINED → 诚实原因单行。
 */
export function renderWorkflowRouting(
  nextAction: NextAction,
  snapshot: NextActionSnapshot,
): readonly string[] {
  const task = snapshot.active_tasks[0];
  if (task === undefined) {
    if (nextAction.route_id === "R_NO_ACTIVE_TASK") {
      return [
        "POMaster workflow: 无活跃 TASK——建议: 八拍① Brainstorm（需求收敛走 pomaster-discovery 卡，promote 即建任务）",
        "  入口: pomaster brainstorm start（--prompt 登记 raw prompt 原文）",
      ];
    }
    return [`POMaster workflow: ${nextAction.reason}`];
  }
  const beatName =
    EIGHT_BEAT_ENFORCEMENT_LINES.find((row) => row.beat === nextAction.beat)?.name ?? null;
  const card = nextAction.beat !== null ? BEAT_CARD_NAMES[nextAction.beat] : undefined;
  const head = `POMaster workflow: ${task.id} 当前八拍${nextAction.beat ?? "?"}${beatName !== null ? ` ${beatName}` : ""}`;
  if (nextAction.command === null) {
    return [`${head}（${nextAction.reason}）`];
  }
  return [
    `${head} → 下一拍: ${nextAction.command}`,
    `  分段卡: ${card ?? "（路由表无拍位卡名——见 pomaster 路由卡）"}（.agents/skills/ 与 .claude/skills/ 双镜像命令卡）`,
  ];
}

interface PermitLedgerRecord {
  permit_ref: string;
  issued_at_seq: number;
  expires_at_seq: number;
  change_ref: string | null;
  stolen_at_seq: number | null;
}

/** 台账读取（与 permit list 同源口径：缺失=显式空 + 告警；坏形=显式告警不臆造）。 */
async function readPermitRecords(
  rootDir: string,
  warnings: CliWarning[],
): Promise<readonly PermitLedgerRecord[]> {
  let raw: string;
  try {
    raw = await readFile(permitsFilePath(rootDir), "utf8");
  } catch {
    warnings.push({
      code: "ALERTS_PERMIT_LEDGER_MISSING",
      message: `permit ledger not found at ${toPosix(PERMITS_RELATIVE)}; permit alerts skipped`,
      hint: "该侧车由 kernel 维护（pomaster permit issue 签发即建台账）；缺席按显式空呈现（alerts 是纯读面，绝不重建）。",
    });
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as { permits?: unknown };
    const permits = parsed?.permits;
    if (!Array.isArray(permits)) throw new TypeError("permits is not an array");
    return permits.filter(
      (row): row is PermitLedgerRecord =>
        row !== null &&
        typeof row === "object" &&
        typeof (row as Record<string, unknown>).permit_ref === "string" &&
        typeof (row as Record<string, unknown>).expires_at_seq === "number",
    );
  } catch (err) {
    warnings.push({
      code: "ALERTS_PERMIT_LEDGER_UNREADABLE",
      message: `permit ledger is not readable: ${(err as Error).message}`,
      hint: `从 git 恢复 ${toPosix(PERMITS_RELATIVE)}（kernel 写通道维护）后重跑 pomaster alerts；alerts 不静默跳过也不猜测。`,
    });
    return [];
  }
}

/**
 * 可行动项派生（纯读；缺席/坏形降级为 warnings + 显式空——hook 恒 exit 0 契约）。
 * 判定语义与既有只读面逐字同源：seq 取 truth-index generation.seq（A4 禁墙钟）；
 * 过期判定 = 未盗取 且 current_seq >= expires_at_seq（permit list 同式）。
 */
export async function deriveAlerts(rootDir: string): Promise<AlertsDerivation> {
  const warnings: CliWarning[] = [];
  let raw: string | null = null;
  try {
    raw = await readFile(truthIndexPath(rootDir), "utf8");
  } catch {
    raw = null;
  }
  if (raw === null) {
    warnings.push({
      code: "NOT_INITIALIZED",
      message: `no pomaster state found at ${toPosix(TRUTH_INDEX_RELATIVE)}`,
      hint: "run: pomaster init 后 alerts 才有派生分母；未初始化按显式空输出（不打扰）。",
    });
    return { initialized: false, current_seq: null, permits_active: 0, alerts: [], warnings };
  }
  let index: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("not an object");
    }
    index = parsed as Record<string, unknown>;
  } catch (err) {
    warnings.push({
      code: "INVALID_STATE",
      message: `truth-index is not valid JSON object: ${(err as Error).message}`,
      hint: `从 git 恢复 ${toPosix(TRUTH_INDEX_RELATIVE)}（机器事务维护）后重跑 pomaster alerts；alerts 降级为空输出不失败。`,
    });
    return { initialized: false, current_seq: null, permits_active: 0, alerts: [], warnings };
  }

  const generation = index.generation;
  const generationRecord =
    generation !== null && typeof generation === "object"
      ? (generation as Record<string, unknown>)
      : undefined;
  const currentSeq = typeof generationRecord?.seq === "number" ? generationRecord.seq : 0;

  const alerts: AlertItem[] = [];

  // ① CHALLENGED 对象（change 轴词形闭包内核对，词表外观测值按同词形照实呈现——读侧不判卷）。
  const objects = Array.isArray(index.objects) ? index.objects : [];
  const challenged: string[] = [];
  for (const row of objects) {
    if (row === null || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const axes = record.axes;
    const change =
      axes !== null && typeof axes === "object" ? (axes as Record<string, unknown>).change : undefined;
    if (typeof change === "string" && !(CHANGE_VALUES as readonly string[]).includes(change)) {
      warnings.push({
        code: "UNKNOWN_VOCAB_VALUE",
        message: `out-of-vocab change value observed on ${String(record.id ?? "(missing id)")}: ${change}`,
        hint: "词表唯一来源 vocab-lock；读路径照实呈现不判卷。",
      });
    }
    if (change === "CHALLENGED" && typeof record.id === "string") {
      challenged.push(record.id);
    }
  }
  for (const id of [...challenged].sort()) {
    alerts.push({
      kind: "OBJECT_CHALLENGED",
      ref: id,
      change_ref: null,
      detail: `change 轴处于 CHALLENGED（State Challenge 待对账）`,
      next: `pomaster inspect ${id} 检视对象；经 production challenge 链对账后回归 STABLE`,
    });
  }

  // ② 过期许可（台账派生；与 permit list 的 status 派生同式）。
  const permits = await readPermitRecords(rootDir, warnings);
  let permitsActive = 0;
  for (const record of permits) {
    if (record.stolen_at_seq !== null) continue;
    if (currentSeq >= record.expires_at_seq) {
      alerts.push({
        kind: "PERMIT_EXPIRED",
        ref: record.permit_ref,
        change_ref: record.change_ref ?? null,
        detail: `expires_at_seq=${record.expires_at_seq} ≤ current_seq=${currentSeq}（写判卷已不放行）`,
        next: `pomaster permit steal --permit ${record.permit_ref} --actor <type>:<name> --reason <text> 显式接管，或按八拍②重新签发`,
      });
      continue;
    }
    permitsActive += 1;
  }

  // 确定性排序（kind 字典序 → ref 字典序；同 state 重跑输出字节稳定，A4）。
  alerts.sort((a, b) => (a.kind === b.kind ? (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0) : a.kind < b.kind ? -1 : 1));

  return { initialized: true, current_seq: currentSeq, permits_active: permitsActive, alerts, warnings };
}

/** 人读渲染：告警块在前、workflow 路由段收尾（R3 起初始化后恒非空——「干净=非空但极简」）；未初始化=零行（init 引导归 SessionStart 速览专属）。 */
function renderAlertsHuman(
  alerts: readonly AlertItem[],
  routing: readonly string[],
): readonly string[] {
  if (alerts.length === 0 && routing.length === 0) return [];
  const lines: string[] = [];
  if (alerts.length > 0) {
    lines.push(`POMaster alerts（${alerts.length} 项可行动）:`);
    for (const alert of alerts) {
      const changeRef = alert.change_ref === null ? "" : `（change_ref=${alert.change_ref}）`;
      lines.push(`- [${alert.kind}] ${alert.ref}${changeRef} — ${alert.detail}`);
      lines.push(`  next: ${alert.next}`);
    }
  }
  lines.push(...routing);
  const capped = capPlainOutput(lines, ALERTS_OUTPUT_HARD_CAP);
  return capped.text.split("\n");
}

/**
 * `pomaster alerts`：恒 ok=true（hook 契约——退出码由 runCli 依 ok 判定，恒 0）；
 * 初始化后恒输出 workflow 路由段（≤3 行，R3：干净=非空但极简——无活跃 TASK 给
 * 判档/讨论双入口，有活跃 TASK 给八拍位置 + 下一拍命令 + 分段卡；UNDETERMINED 诚实
 * 原因单行）；未初始化 = 零输出 + NOT_INITIALIZED 告警留痕；降级走 warnings 不走 errors。
 * P3 breadcrumb 保留为机读字段（workflow_routing 是它的人读超集——同一路由表渲染）。
 */
export async function runAlerts(rootDir: string): Promise<CommandOutcome<AlertsResult>> {
  const derivation = await deriveAlerts(rootDir);
  // —— P3 breadcrumb + R3 workflow 路由段（快照装配降级走 warnings，hook 契约恒
  // exit 0）。未初始化跳过快照装配：deriveAlerts 已留痕缺席告警（重复告警禁入信封），
  // 且无任务时 breadcrumb 反正为 null——next_action=null 与 session 未初始化缺席形态
  // 一致，路由段 = 空数组（零输出静默）。 ——
  let breadcrumb: string | null = null;
  let nextAction: NextAction | null = null;
  let routing: readonly string[] = [];
  const breadcrumbWarnings: CliWarning[] = [];
  if (derivation.initialized) {
    const snapshot = await collectNextActionSnapshot(rootDir, breadcrumbWarnings);
    nextAction = evaluateNextAction(snapshot);
    breadcrumb = renderBreadcrumb(nextAction, snapshot);
    routing = renderWorkflowRouting(nextAction, snapshot);
  }
  const result: AlertsResult = {
    initialized: derivation.initialized,
    current_seq: derivation.current_seq,
    permits_active: derivation.permits_active,
    alerts: derivation.alerts,
    unsourced_categories: [...ALERT_UNSOURCED_CATEGORIES],
    breadcrumb,
    next_action: nextAction,
    workflow_routing: routing,
  };
  const warnings: CliWarning[] = [...derivation.warnings, ...breadcrumbWarnings];
  return okOutcome("alerts", result, renderAlertsHuman(derivation.alerts, routing), warnings);
}
