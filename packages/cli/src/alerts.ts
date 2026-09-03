/**
 * alerts.ts —— `pomaster alerts`：可行动项过滤器（重入口 UserPromptSubmit 轻提醒源）。
 *
 * hook 输出契约（research/claude-hooks-reference.md 逐条核实，优先级高于通用命令纪律）：
 * - 恒 exit 0：非零退出 + stdout 会被 harness 呈现为 hook 错误通知；exit 2 会阻断
 *   prompt 处理——本命令永不失败（降级走 warnings 留痕于 --json 信封，人读通道静默）；
 * - 干净=空输出：无可行动项时零字节 stdout（exit 0 + 空 stdout = 合法静默，零 token 噪声）；
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
 * triage TTL 过期暂无派生源：triage 是纯函数（规则桶判定，结果不落账）——
 * 无持久化分母即无从判定过期，登记于 unsourced_categories 显式缺席（不臆造
 * 数据源），待 triage 结果获得持久化记录后接入。
 */

import { readFile } from "node:fs/promises";
import { CHANGE_VALUES } from "@pomaster/schemas";
import {
  PERMITS_RELATIVE,
  TRUTH_INDEX_RELATIVE,
  permitsFilePath,
  toPosix,
  truthIndexPath,
} from "./store-layout.js";
import type { CliWarning, CommandOutcome } from "./envelope.js";
import { okOutcome } from "./envelope.js";

/** 可行动项种类词表（CLI 局部词闭包 TODO(vocab-pr)）。 */
export const ALERT_KINDS = ["PERMIT_EXPIRED", "OBJECT_CHALLENGED"] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];

/**
 * 显式缺席的告警类目（有语义、无派生源）：triage 结果不落账 → TTL 过期无从判定。
 * 分母披露纪律：缺什么数据源在此逐字登记，不冒充「检查过且干净」。
 */
export const ALERT_UNSOURCED_CATEGORIES = ["triage_ttl"] as const;

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
      hint: "该侧车由 kernel 维护；缺席按显式空呈现（alerts 是纯读面，绝不重建）。",
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
      hint: `修复 ${toPosix(PERMITS_RELATIVE)}（kernel 写通道维护）；alerts 不静默跳过也不猜测。`,
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
      hint: `修复 ${toPosix(TRUTH_INDEX_RELATIVE)}（机器事务维护）；alerts 降级为空输出不失败。`,
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

/** 人读渲染：干净=零行（零字节 stdout）；有项=短头 + 每项事实行 + next 路标行。 */
function renderAlertsHuman(alerts: readonly AlertItem[]): readonly string[] {
  if (alerts.length === 0) return [];
  const lines: string[] = [`POMaster alerts（${alerts.length} 项可行动；干净=空输出）:`];
  for (const alert of alerts) {
    const changeRef = alert.change_ref === null ? "" : `（change_ref=${alert.change_ref}）`;
    lines.push(`- [${alert.kind}] ${alert.ref}${changeRef} — ${alert.detail}`);
    lines.push(`  next: ${alert.next}`);
  }
  const capped = capPlainOutput(lines, ALERTS_OUTPUT_HARD_CAP);
  return capped.text.split("\n");
}

/**
 * `pomaster alerts`：恒 ok=true（hook 契约——退出码由 runCli 依 ok 判定，恒 0）；
 * 干净=空输出；降级走 warnings 不走 errors。
 */
export async function runAlerts(rootDir: string): Promise<CommandOutcome<AlertsResult>> {
  const derivation = await deriveAlerts(rootDir);
  const result: AlertsResult = {
    initialized: derivation.initialized,
    current_seq: derivation.current_seq,
    permits_active: derivation.permits_active,
    alerts: derivation.alerts,
    unsourced_categories: [...ALERT_UNSOURCED_CATEGORIES],
  };
  return okOutcome("alerts", result, renderAlertsHuman(derivation.alerts), derivation.warnings);
}
