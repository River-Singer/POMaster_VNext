/**
 * permit.ts —— `pomaster permit issue / check / steal / list`：八拍② FRAMEWORK LOCK 命令面。
 *
 * 设计契约：docs/eight-beat-carriers-design.md §1（实施前已定稿）。判卷权威在
 * @pomaster/kernel（issuePermit / checkPermit / stealPermit / parseGovernedId），
 * 本文件只做编排与呈现：
 * - issue / steal = 事件写（kernel 唯一写通道；issue 无 NO_CHANGE 出口——重复签发
 *   就是 PERMIT.<BASE>.n 递增的两条台账记录，诚实语义不是缺陷，--help 明示）；
 * - check = 判卷读，但对过期许可有 PERMIT_EXPIRED_OBSERVED journal 写副作用
 *   （kernel 契约行为「过期→事件，不静默」；人读输出固定披露，除该事件外零写入）；
 * - list = 纯读（直读 state/permits.json + state/journal.jsonl 仅限读呈现，§0 分层裁定；
 *   事件链按类型折叠为 {count, first_seq, last_seq}——声明式聚合，计数保留不吞没）。
 *
 * 纪律落点：
 * - A4 确定性：TTL 只呈现 ttl_beats / expires_at_seq / beats_remaining（seq 锚定，
 *   ≤0 即过期），绝不换算墙钟；同 state 重跑 --json 输出字节稳定；
 * - self_attested 恒为 true：凡经本进程 argv 传入的主体身份都是调用方自报（C5
 *   自报值永不单独判卷），不提供 --attested 假开关；
 * - 词表纪律：op 三值 / actor 四型取既有词表闭包，零新词值；list 的 status 三值
 *   （active/expired/stolen）是 CLI 呈现层局部词 → TODO(vocab-pr)；
 * - fail-closed：一切失败 ok=false（runCli 据此 exit 1），错误码复用 kernel
 *   GovernanceError 同义码位约定（docs/kernel-api.md §9），每错必带 hint 路标。
 */

import { readFile } from "node:fs/promises";
import { ACTOR_TYPE_VALUES, type ActorTypeValue } from "@pomaster/schemas";
import {
  type Actor,
  type GovernedId,
  GovernanceError,
  GovernedIdParseError,
} from "@pomaster/kernel";
import { checkPermit, createStore, issuePermit, parseGovernedId, stealPermit } from "@pomaster/kernel";
import type { PermitCheckResult, StealResult, WriteAttempt } from "@pomaster/kernel";
import {
  JOURNAL_RELATIVE,
  PERMITS_RELATIVE,
  TRUTH_INDEX_RELATIVE,
  journalFilePath,
  permitsFilePath,
  toPosix,
  truthIndexPath,
} from "./store-layout.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

/** kernel WriteAttempt 三值闭包（词表外值绝不发明第四种 op）。 */
export const PERMIT_WRITE_OPS = [
  "upsert_object",
  "transition_object",
  "delete",
] as const;

export type PermitWriteOp = (typeof PERMIT_WRITE_OPS)[number];

/**
 * list 呈现态三值（由 stolen 标记 + current_seq vs expires_at_seq 机械派生）。
 * CLI 呈现层局部词 → TODO(vocab-pr)（待词汇表 PR 收编）。
 */
export const PERMIT_LIST_STATES = ["active", "expired", "stolen"] as const;

export type PermitListStatus = (typeof PERMIT_LIST_STATES)[number];

/** 事件类型折叠的呈现顺序锚（journal 内首现顺序即此序：issue 恒最先）。 */
const EVENT_TYPE_ORDER = ["PERMIT_ISSUED", "PERMIT_EXPIRED_OBSERVED", "PERMIT_STOLEN"] as const;

// ============================================================
// 结果形态（snake_case 对齐现有 CLI result；失败路径逐字段 null——缺席显式）
// ============================================================

export interface PermitActorView {
  readonly actor_type: string;
  readonly actor: string;
  readonly self_attested: boolean;
}

export interface PermitScopeView {
  readonly subject_ids: readonly string[];
  readonly write_policy: string;
}

/** permit issue 结果（字段级契约见设计 §1.2；baseline_captured 为 kernel 台账回读）。 */
export interface PermitIssueResult {
  readonly permit_ref: string | null;
  readonly issued_at_seq: number | null;
  readonly expires_at_seq: number | null;
  readonly ttl_beats: number | null;
  readonly change_ref: string | null;
  readonly requested_by: PermitActorView | null;
  readonly capability_refs: readonly string[];
  readonly acceptance_shape: Readonly<Record<string, unknown>> | null;
  readonly scope: PermitScopeView | null;
  readonly baseline_captured: Readonly<Record<string, unknown>> | null;
  readonly baseline_note: string | null;
}

/** permit check 结果（outcome/reason 逐字来自 kernel PermitCheckResult 四态三因）。 */
export interface PermitCheckResultView {
  readonly permit_ref: string;
  readonly attempt: { readonly id: string; readonly op: string };
  readonly outcome: "allowed" | "denied" | "expired" | "unknown_permit" | null;
  readonly reason: string | null;
  readonly expired_at_seq: number | null;
  readonly current_seq: number | null;
  readonly hint: string | null;
}

/** permit steal 结果（rejected_not_expired → ok=false 但 errors 为空，result 表达语义）。 */
export interface PermitStealResult {
  readonly permit_ref: string;
  readonly outcome: "stolen" | "rejected_not_expired" | null;
  readonly event_seq: number | null;
  readonly expires_at_seq: number | null;
  readonly current_seq: number | null;
  readonly hint: string | null;
}

/** 事件链条目：单条 → {type, seq, count}；多条同型折叠 → {type, count, first_seq, last_seq}。 */
export type PermitListEvent =
  | { readonly type: string; readonly seq: number; readonly count: number }
  | {
      readonly type: string;
      readonly count: number;
      readonly first_seq: number;
      readonly last_seq: number;
    };

export interface PermitListEntry {
  readonly permit_ref: string;
  readonly change_ref: string | null;
  readonly requested_by: PermitActorView | null;
  readonly capability_refs: readonly string[];
  readonly acceptance_shape: Readonly<Record<string, unknown>> | null;
  readonly scope: PermitScopeView | null;
  readonly issued_at_seq: number;
  readonly expires_at_seq: number;
  readonly beats_remaining: number;
  readonly status: PermitListStatus;
  readonly stolen: {
    readonly at_seq: number | null;
    readonly by: { readonly actor_type: string; readonly actor: string } | null;
    readonly reason: string | null;
  };
  readonly events: readonly PermitListEvent[];
}

export interface PermitListResult {
  readonly current_seq: number | null;
  readonly permits: readonly PermitListEntry[];
}

/** issue 时签发瞬间基线的注记（固定文案，设计 §1.2 逐字）。 */
export const BASELINE_NOTE =
  "baseline_captured[subject]=null 表示签发时该对象尚不存在（PROPOSED 新对象的合法基线态）";

/** check 过期写副作用的固定披露（设计 §1.5：除该事件外零写入）。 */
export const EXPIRED_OBSERVED_NOTE =
  "note: check 对过期许可会追加 PERMIT_EXPIRED_OBSERVED journal 事件（kernel 契约行为）";

// ============================================================
// 共享助手：错误翻译 / argv 形状解析 / 只读文件装载
// ============================================================

/** GovernanceError → CliError（剥离构造时的 [CODE] 前缀与 — hint: 尾缀，信封字段单独承载）。 */
export function governanceErrorToCliError(err: GovernanceError): CliError {
  let message = err.message;
  const prefix = `[${err.code}] `;
  if (message.startsWith(prefix)) message = message.slice(prefix.length);
  if (err.hint.length > 0 && message.endsWith(err.hint)) {
    message = message.slice(0, message.length - err.hint.length);
    if (message.endsWith(" — hint: ")) message = message.slice(0, -" — hint: ".length);
  }
  return { code: err.code, message, hint: err.hint };
}

/** GovernedIdParseError → CliError（A5 同义码位：unknown_prefix/grammar → FATAL_*）。 */
function parseErrorToCliError(err: GovernedIdParseError): CliError {
  return {
    code: err.reason === "unknown_prefix" ? "FATAL_UNKNOWN_PREFIX" : "FATAL_ID_GRAMMAR",
    message: err.message,
    hint: "closed-world 前缀闭包与 SEGMENT/SEQ 文法见 vocab-lock id_namespace（A5）；新前缀走词汇表 PR，legacy 拼写走 resolveAlias 收编（A6）",
  };
}

/** kernel 异常的统一信封翻译（GovernedIdParseError / GovernanceError / 其他）。 */
function kernelFail<TResult>(command: string, err: unknown, human: readonly string[]): CommandOutcome<TResult> {
  let error: CliError;
  if (err instanceof GovernedIdParseError) {
    error = parseErrorToCliError(err);
  } else if (err instanceof GovernanceError) {
    error = governanceErrorToCliError(err);
  } else {
    error = {
      code: "KERNEL_ERROR",
      message: err instanceof Error ? err.message : String(err),
      hint: "查看 docs/kernel-api.md 对应契约；若为环境异常请勿静默降级。",
    };
  }
  return failOutcome<TResult>(
    command,
    emptyResult() as unknown as TResult,
    [error],
    [...human, `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

/**
 * 失败路径的空结果（逐字段 null/空集——缺席显式，不伪造事实）。
 * 各命令结果接口的并集骨架；调用点以具体结果类型收窄。
 */
function emptyResult(): Record<string, unknown> {
  return {
    permit_ref: null,
    issued_at_seq: null,
    expires_at_seq: null,
    ttl_beats: null,
    change_ref: null,
    requested_by: null,
    capability_refs: [],
    acceptance_shape: null,
    scope: null,
    baseline_captured: null,
    baseline_note: null,
    attempt: null,
    outcome: null,
    reason: null,
    expired_at_seq: null,
    current_seq: null,
    hint: null,
    event_seq: null,
    checked_at_seq: null,
    context_echo: null,
    permits: [],
  };
}

/**
 * denied reason → 信封错误码（设计 §1.2 翻译表；码位复用 kernel GovernanceError
 * 同义码位约定，PERMIT_POLICY_FORBIDDEN 为 CLI 本地码）。
 */
export function deniedReasonToCode(reason: string): string {
  switch (reason) {
    case "outside_scope":
      return "PERMIT_SCOPE_DENIED";
    case "delete_forbidden_supersede_only":
      return "DENOMINATOR_DELETE_FORBIDDEN";
    case "policy_forbidden":
      return "PERMIT_POLICY_FORBIDDEN";
    default:
      // kernel 只有三因；未知 reason 兜底 fail-closed（绝不静默当允许）。
      return "PERMIT_POLICY_FORBIDDEN";
  }
}

/**
 * argv 形状解析：--actor <type>:<name>。type ∈ ACTOR_TYPE_VALUES（词表闭包）；
 * self_attested 恒为 true（argv 自报；C5：自报值永不单独判卷）。
 */
export function parseActorArgv(
  raw: string,
): { readonly actor: Actor } | { readonly error: CliError } {
  const sep = raw.indexOf(":");
  const type = sep === -1 ? "" : raw.slice(0, sep);
  const name = sep === -1 ? "" : raw.slice(sep + 1);
  if (!(ACTOR_TYPE_VALUES as readonly string[]).includes(type) || name.length === 0) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--actor 词形非法：${raw}`,
        hint: `须为 <type>:<name>；type ∈ ACTOR_TYPE_VALUES（${ACTOR_TYPE_VALUES.join(" / ")}）。`,
      },
    };
  }
  return { actor: { actorType: type as ActorTypeValue, actor: name, selfAttested: true } };
}

/** argv 形状解析：governed id（closed-world；解析失败 → FATAL_* 信封码）。 */
export function parseIdArgv(
  raw: string,
): { readonly id: GovernedId } | { readonly error: CliError } {
  try {
    parseGovernedId(raw);
    return { id: raw as GovernedId };
  } catch (err) {
    if (err instanceof GovernedIdParseError) return { error: parseErrorToCliError(err) };
    throw err;
  }
}

/**
 * argv 形状解析：--acceptance-shape <inline-json | @file>。须为 JSON 对象
 * （数组/标量 = SCHEMA_INVALID）；@file 读文件（缺失/不可读 = SCHEMA_INVALID 带路标）。
 */
export async function parseAcceptanceShapeArgv(
  raw: string,
): Promise<{ readonly shape: Record<string, unknown> } | { readonly error: CliError }> {
  let text = raw;
  if (raw.startsWith("@")) {
    try {
      text = await readFile(raw.slice(1), "utf8");
    } catch (err) {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: `--acceptance-shape @file 不可读：${raw.slice(1)} — ${(err as Error).message}`,
          hint: "@file 形态读取文件内容作为 JSON；确认路径存在后重试。",
        },
      };
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--acceptance-shape 不是合法 JSON：${(err as Error).message}`,
        hint: "验收形状须为 JSON 对象（inline 或 @file）；形状契约见五件套之五。",
      },
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--acceptance-shape 须为 JSON 对象（现 ${Array.isArray(parsed) ? "array" : typeof parsed}）`,
        hint: "验收形状是键值结构（如 {dod: [...]}）；数组/标量不是形状。",
      },
    };
  }
  return { shape: parsed as Record<string, unknown> };
}

/** --ttl-beats 解析：正整数（事件拍；禁墙钟）。 */
export function parseTtlBeatsArgv(
  raw: string | undefined,
): { readonly ttlBeats: number | undefined } | { readonly error: CliError } {
  if (raw === undefined) return { ttlBeats: undefined };
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--ttl-beats 须为正整数（事件拍，禁墙钟）：${raw}`,
        hint: "TTL 以 rebuild 拍计（A4/D2）；缺省 168 拍 ≈ C9 的 168h 标称节奏。",
      },
    };
  }
  return { ttlBeats: value };
}

/**
 * store 初始化缺席显式（NOT_INITIALIZED）。createStore 会幂等初始化骨架——
 * 若直接调它，未初始化目录会被静默建账；故所有 permit/exec-guard 命令先显式判缺席。
 */
export async function requireInitialized(
  rootDir: string,
): Promise<{ readonly seq: number } | { readonly error: CliError }> {
  let raw: string;
  try {
    raw = await readFile(truthIndexPath(rootDir), "utf8");
  } catch {
    return {
      error: {
        code: "NOT_INITIALIZED",
        message: `no pomaster state found at ${toPosix(TRUTH_INDEX_RELATIVE)}`,
        hint: "run: pomaster init / createStore 后重试（缺席显式，不静默建账）。",
      },
    };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const generation = parsed.generation as Record<string, unknown> | undefined;
    if (generation !== null && typeof generation === "object" && typeof generation.seq === "number") {
      return { seq: generation.seq };
    }
    throw new TypeError("generation.seq missing");
  } catch {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `truth-index 无法解析出 generation.seq：${toPosix(TRUTH_INDEX_RELATIVE)}`,
        hint: "机器事务维护的文件；手改内容请走 kernel store 事务恢复。",
      },
    };
  }
}

// —— 台账 / journal 只读装载（list 与 issue 回读；结构损坏 → SCHEMA_INVALID） ——

interface PermitLedgerRecord {
  permit_ref: string;
  issued_at_seq: number;
  expires_at_seq: number;
  scope: { subject_ids: string[]; write_policy: string };
  requested_by: { actor_type: string; actor: string; self_attested: boolean };
  change_ref: string | null;
  capability_refs?: string[];
  acceptance_shape?: Record<string, unknown> | null;
  baseline?: { at_seq: number; subjects: Record<string, unknown> } | null;
  stolen_at_seq: number | null;
  stolen_by: { actor_type: string; actor: string } | null;
  stolen_reason: string | null;
}

async function readPermitLedger(
  rootDir: string,
): Promise<{ readonly permits: readonly PermitLedgerRecord[] } | { readonly error: CliError }> {
  let raw: string;
  try {
    raw = await readFile(permitsFilePath(rootDir), "utf8");
  } catch {
    return { permits: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `state/permits.json 无法解析（损坏或手改）：${(err as Error).message}`,
        hint: `许可台账由 kernel 事务维护（${toPosix(PERMITS_RELATIVE)}）；从 git 恢复后重试。`,
      },
    };
  }
  const record = parsed as { permits?: unknown };
  if (record === null || typeof record !== "object" || !Array.isArray(record.permits)) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: "state/permits.json 结构非法（permits 非数组）",
        hint: `许可台账由 kernel 事务维护（${toPosix(PERMITS_RELATIVE)}）；从 git 恢复后重试。`,
      },
    };
  }
  for (const entry of record.permits as unknown[]) {
    const candidate = entry as Partial<PermitLedgerRecord> | null;
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      typeof candidate.permit_ref !== "string" ||
      candidate.permit_ref.length === 0 ||
      typeof candidate.issued_at_seq !== "number" ||
      typeof candidate.expires_at_seq !== "number"
    ) {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: "state/permits.json 台账条目缺 permit_ref/issued_at_seq/expires_at_seq（台账损坏）",
          hint: `许可台账由 kernel 事务维护（${toPosix(PERMITS_RELATIVE)}）；从 git 恢复后重试。`,
        },
      };
    }
  }
  return { permits: record.permits as PermitLedgerRecord[] };
}

async function readJournalEvents(
  rootDir: string,
): Promise<{ readonly events: readonly Record<string, unknown>[] } | { readonly error: CliError }> {
  let raw: string;
  try {
    raw = await readFile(journalFilePath(rootDir), "utf8");
  } catch {
    return { events: [] };
  }
  const events: Record<string, unknown>[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        events.push(parsed as Record<string, unknown>);
      }
    } catch {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: "state/journal.jsonl 存在无法解析的事件行（损坏或手改）",
          hint: `journal 是追加流（${toPosix(JOURNAL_RELATIVE)}）；从 git 恢复该文件，禁止手改事件行。`,
        },
      };
    }
  }
  return { events };
}

/** 事件链折叠（设计 §1.2/§7-坑9）：同型多行折叠为 {count, first_seq, last_seq}——计数保留，不吞没。 */
function foldEvents(events: readonly Record<string, unknown>[]): PermitListEvent[] {
  const seqsByType = new Map<string, number[]>();
  for (const event of events) {
    if (typeof event.type !== "string" || typeof event.seq !== "number") continue;
    const bucket = seqsByType.get(event.type);
    if (bucket === undefined) seqsByType.set(event.type, [event.seq]);
    else bucket.push(event.seq);
  }
  const ordered: string[] = EVENT_TYPE_ORDER.filter((type) => seqsByType.has(type)) as string[];
  // 词表外事件类型（未来 kernel 新事件）也照实呈现——聚合不吞没，顺序按首现。
  for (const type of seqsByType.keys()) {
    if (!(EVENT_TYPE_ORDER as readonly string[]).includes(type)) ordered.push(type);
  }
  return ordered.map((type) => {
    const seqs = seqsByType.get(type) ?? [];
    if (seqs.length === 1) {
      return { type, seq: seqs[0] as number, count: 1 };
    }
    return {
      type,
      count: seqs.length,
      first_seq: Math.min(...seqs),
      last_seq: Math.max(...seqs),
    };
  });
}

// ============================================================
// permit issue
// ============================================================

export interface PermitIssueInput {
  readonly subjects: readonly string[];
  readonly actor: string;
  readonly changeRef?: string;
  readonly capabilities?: readonly string[];
  readonly acceptanceShape?: string;
  readonly ttlBeats?: string;
}

/**
 * 签发许可（事件写）。重复签发同一基底 → PERMIT.<BASE>.n 递增——没有 NO_CHANGE
 * 出口，这不是幂等命令（--help 明示，防误用）。结果字段从 kernel 台账回读呈现
 * （baseline_captured 是 kernel 派生值，CLI 不重算）。
 */
export async function runPermitIssue(
  rootDir: string,
  input: PermitIssueInput,
): Promise<CommandOutcome<PermitIssueResult>> {
  const fail = (error: CliError): CommandOutcome<PermitIssueResult> =>
    failOutcome<PermitIssueResult>(
      "permit issue",
      emptyResult() as unknown as PermitIssueResult,
      [error],
      [`permit issue: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );

  if (input.subjects.length === 0) {
    return fail({
      code: "SCHEMA_INVALID",
      message: "--subject 至少一个（无范围的许可=无意义的授权）",
      hint: "八拍②逐对象圈定 Permit 范围；全域授权请显式列举对象或走 EVOLUTION_CHANNEL。",
    });
  }
  const subjectIds: GovernedId[] = [];
  for (const raw of input.subjects) {
    const parsed = parseIdArgv(raw);
    if ("error" in parsed) return fail(parsed.error);
    subjectIds.push(parsed.id);
  }
  const capabilityIds: GovernedId[] = [];
  for (const raw of input.capabilities ?? []) {
    const parsed = parseIdArgv(raw);
    if ("error" in parsed) return fail(parsed.error);
    capabilityIds.push(parsed.id);
  }
  const actor = parseActorArgv(input.actor);
  if ("error" in actor) return fail(actor.error);
  const ttl = parseTtlBeatsArgv(input.ttlBeats);
  if ("error" in ttl) return fail(ttl.error);
  let acceptanceShape: Record<string, unknown> | undefined;
  if (input.acceptanceShape !== undefined) {
    const shape = await parseAcceptanceShapeArgv(input.acceptanceShape);
    if ("error" in shape) return fail(shape.error);
    acceptanceShape = shape.shape;
  }
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(initialized.error);

  try {
    const store = await createStore(rootDir);
    await issuePermit(store, {
      subjectIds,
      requestedBy: actor.actor,
      ...(input.changeRef !== undefined ? { changeRef: input.changeRef } : {}),
      ...(ttl.ttlBeats !== undefined ? { ttlBeats: ttl.ttlBeats } : {}),
      ...(acceptanceShape !== undefined ? { acceptanceShape } : {}),
      ...(capabilityIds.length > 0 ? { capabilityIds } : {}),
    });
  } catch (err) {
    return kernelFail<PermitIssueResult>("permit issue", err, ["permit issue: FAILED"]);
  }

  // 台账回读：五件套落台账的事实呈现（含 baseline_captured——kernel 派生，CLI 不重算）。
  const ledger = await readPermitLedger(rootDir);
  if ("error" in ledger) return fail(ledger.error);
  const issued = ledger.permits[ledger.permits.length - 1] ?? null;
  if (issued === null) {
    return fail({
      code: "SCHEMA_INVALID",
      message: "签发后台账回读失败（state/permits.json 为空）",
      hint: "issuePermit 已成功但台账不可读——检查磁盘/杀毒软件对 .pomaster 的干扰。",
    });
  }
  const result: PermitIssueResult = {
    permit_ref: issued.permit_ref,
    issued_at_seq: issued.issued_at_seq,
    expires_at_seq: issued.expires_at_seq,
    ttl_beats: issued.expires_at_seq - issued.issued_at_seq,
    change_ref: issued.change_ref,
    requested_by: {
      actor_type: issued.requested_by.actor_type,
      actor: issued.requested_by.actor,
      self_attested: issued.requested_by.self_attested,
    },
    capability_refs: issued.capability_refs ?? [],
    acceptance_shape: issued.acceptance_shape ?? null,
    scope: {
      subject_ids: issued.scope.subject_ids,
      write_policy: issued.scope.write_policy,
    },
    baseline_captured: issued.baseline?.subjects ?? null,
    baseline_note: BASELINE_NOTE,
  };
  const baselineSummary = Object.entries(result.baseline_captured ?? {})
    .map(([id, snapshot]) => (snapshot === null ? `${id}=absent` : `${id}@rev${(snapshot as { rev: number }).rev}`))
    .join(", ");
  return okOutcome(
    "permit issue",
    result,
    [
      `permit issue → ${result.permit_ref} (issued_at_seq=${result.issued_at_seq}, expires_at_seq=${result.expires_at_seq}, ttl=${result.ttl_beats} beats)`,
      `  scope: ${result.scope?.subject_ids.join(", ")}`,
      `  baseline: ${baselineSummary || "(none)"}`,
    ],
  );
}

// ============================================================
// permit check
// ============================================================

export interface PermitCheckInput {
  readonly permit: string;
  readonly subject: string;
  readonly op: string;
}

/**
 * 判卷读（ok = outcome==="allowed"）。四态显式逐字来自 kernel；对过期许可追加
 * PERMIT_EXPIRED_OBSERVED journal 事件（kernel 契约行为，人读输出固定披露）。
 */
export async function runPermitCheck(
  rootDir: string,
  input: PermitCheckInput,
): Promise<CommandOutcome<PermitCheckResultView>> {
  const fail = (error: CliError): CommandOutcome<PermitCheckResultView> =>
    failOutcome<PermitCheckResultView>(
      "permit check",
      emptyResult() as unknown as PermitCheckResultView,
      [error],
      [`permit check: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );

  if (!(PERMIT_WRITE_OPS as readonly string[]).includes(input.op)) {
    return fail({
      code: "SCHEMA_INVALID",
      message: `--op 词表外值：${input.op}`,
      hint: `op 三值闭包：${PERMIT_WRITE_OPS.join(" | ")}（kernel WriteAttempt；绝不发明第四种 op）。`,
    });
  }
  const parsedId = parseIdArgv(input.subject);
  if ("error" in parsedId) return fail(parsedId.error);
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(initialized.error);

  let verdict: PermitCheckResult;
  try {
    const store = await createStore(rootDir);
    verdict = await checkPermit(store, input.permit, {
      id: parsedId.id,
      op: input.op as WriteAttempt["op"],
    });
    const currentSeq = store.currentSeq ?? 0;
    return checkOutcome(input, verdict, currentSeq);
  } catch (err) {
    return kernelFail<PermitCheckResultView>("permit check", err, ["permit check: FAILED"]);
  }
}

function checkOutcome(
  input: PermitCheckInput,
  verdict: PermitCheckResult,
  currentSeq: number,
): CommandOutcome<PermitCheckResultView> {
  const attempt = { id: input.subject, op: input.op };
  if (verdict.outcome === "allowed") {
    const result: PermitCheckResultView = {
      permit_ref: input.permit,
      attempt,
      outcome: "allowed",
      reason: null,
      expired_at_seq: null,
      current_seq: currentSeq,
      hint: null,
    };
    return okOutcome("permit check", result, [
      `permit check ${input.permit} id=${attempt.id} op=${attempt.op} → allowed`,
      EXPIRED_OBSERVED_NOTE,
    ]);
  }
  let code: string;
  let hint: string;
  let reason: string | null = null;
  let expiredAtSeq: number | null = null;
  if (verdict.outcome === "denied") {
    code = deniedReasonToCode(verdict.reason);
    reason = verdict.reason;
    hint = verdict.hint;
  } else if (verdict.outcome === "expired") {
    code = "PERMIT_EXPIRED";
    expiredAtSeq = verdict.expiredAtSeq;
    hint = "TTL 已到期（seq 锚定）；显式接管走 permit steal --reason（D2），或回 FRAMEWORK LOCK 重新签发。";
  } else {
    code = "PERMIT_UNKNOWN";
    hint = "用 permit list --json 查看该引用的事件链：stolen 与从未签发都呈现为 unknown_permit（物理存在不构成放行）。";
  }
  const result: PermitCheckResultView = {
    permit_ref: input.permit,
    attempt,
    outcome: verdict.outcome,
    reason,
    expired_at_seq: expiredAtSeq,
    current_seq: currentSeq,
    hint,
  };
  return failOutcome<PermitCheckResultView>(
    "permit check",
    result,
    [
      {
        code,
        message: `permit check ${input.permit} id=${attempt.id} op=${attempt.op} → ${verdict.outcome}${reason === null ? "" : ` (${reason})`}`,
        hint,
      },
    ],
    [
      `permit check ${input.permit} id=${attempt.id} op=${attempt.op} → ${verdict.outcome}${reason === null ? "" : ` (${reason})`}`,
      EXPIRED_OBSERVED_NOTE,
    ],
  );
}

// ============================================================
// permit steal
// ============================================================

export interface PermitStealInput {
  readonly permit: string;
  readonly actor: string;
  readonly reason: string;
}

/** 显式接管（D2：仅许过期许可 + reason 留痕；rejected_not_expired = 显式拒绝非异常）。 */
export async function runPermitSteal(
  rootDir: string,
  input: PermitStealInput,
): Promise<CommandOutcome<PermitStealResult>> {
  const fail = (error: CliError): CommandOutcome<PermitStealResult> =>
    failOutcome<PermitStealResult>(
      "permit steal",
      emptyResult() as unknown as PermitStealResult,
      [error],
      [`permit steal: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );

  const actor = parseActorArgv(input.actor);
  if ("error" in actor) return fail(actor.error);
  if (typeof input.reason !== "string" || input.reason.trim().length === 0) {
    return fail({
      code: "SCHEMA_INVALID",
      message: "steal 必须带非空 --reason（接管留痕是 D2 的硬性要求）",
      hint: "显式接管 = 把协调问题摆上台面：写清为何原持有人未续期。",
    });
  }
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(initialized.error);

  let result: StealResult;
  try {
    const store = await createStore(rootDir);
    result = await stealPermit(store, input.permit, actor.actor, input.reason);
  } catch (err) {
    return kernelFail<PermitStealResult>("permit steal", err, ["permit steal: FAILED"]);
  }

  if (result.outcome === "stolen") {
    // 台账回读取 expires_at_seq（kernel StealResult.stolen 只带 eventSeq；
    // kernel 以当前 seq 锚定 eventSeq，故 current_seq 即 event_seq）。
    const ledger = await readPermitLedger(rootDir);
    if ("error" in ledger) return fail(ledger.error);
    const record = ledger.permits.find((candidate) => candidate.permit_ref === input.permit);
    if (record === undefined) {
      return fail({
        code: "SCHEMA_INVALID",
        message: `接管后台账回读失败（${input.permit} 不在 state/permits.json）`,
        hint: "stealPermit 已成功但台账不可读——检查磁盘/杀毒软件对 .pomaster 的干扰。",
      });
    }
    const stolenView: PermitStealResult = {
      permit_ref: input.permit,
      outcome: "stolen",
      event_seq: result.eventSeq,
      expires_at_seq: record.expires_at_seq,
      current_seq: result.eventSeq,
      hint: null,
    };
    return okOutcome(
      "permit steal",
      stolenView,
      [
        `permit steal ${input.permit} → stolen (event_seq=${stolenView.event_seq}, expires_at_seq=${stolenView.expires_at_seq})`,
      ],
    );
  }
  // rejected_not_expired：显式拒绝（errors 为空，result 表达语义；hint 进 result 不重复）。
  const rejectedView: PermitStealResult = {
    permit_ref: input.permit,
    outcome: "rejected_not_expired",
    event_seq: null,
    expires_at_seq: result.expiresAtSeq,
    current_seq: result.currentSeq,
    hint: "TTL 未到期（seq 锚定）；D2：接管仅许过期许可，自动抢占被禁止（自动抢占掩盖协调问题）。",
  };
  return failOutcome<PermitStealResult>(
    "permit steal",
    rejectedView,
    [],
    [
      `permit steal ${input.permit} → rejected_not_expired (expires_at_seq=${rejectedView.expires_at_seq}, current_seq=${rejectedView.current_seq})`,
    ],
  );
}

// ============================================================
// permit list
// ============================================================

export interface PermitListInput {
  readonly changeRef?: string;
  readonly state?: string;
}

/**
 * 台账纯读呈现（--json 同 state 重跑字节稳定）。--change-ref / --state 过滤缺省
 * = 全部（不做静默过滤）；status 由 stolen 标记 + seq 机械派生（CLI 局部词 TODO(vocab-pr)）。
 */
export async function runPermitList(
  rootDir: string,
  input: PermitListInput,
): Promise<CommandOutcome<PermitListResult>> {
  const fail = (error: CliError): CommandOutcome<PermitListResult> =>
    failOutcome<PermitListResult>(
      "permit list",
      emptyResult() as unknown as PermitListResult,
      [error],
      [`permit list: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );

  if (input.state !== undefined && !(PERMIT_LIST_STATES as readonly string[]).includes(input.state)) {
    return fail({
      code: "SCHEMA_INVALID",
      message: `--state 词表外值：${input.state}`,
      hint: `呈现态三值（CLI 局部词 TODO(vocab-pr)）：${PERMIT_LIST_STATES.join(" | ")}；缺省=全部。`,
    });
  }
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(initialized.error);
  const currentSeq = initialized.seq;
  const ledger = await readPermitLedger(rootDir);
  if ("error" in ledger) return fail(ledger.error);
  const journal = await readJournalEvents(rootDir);
  if ("error" in journal) return fail(journal.error);

  const entries: PermitListEntry[] = [];
  for (const record of ledger.permits) {
    const status: PermitListStatus =
      record.stolen_at_seq !== null
        ? "stolen"
        : currentSeq >= record.expires_at_seq
          ? "expired"
          : "active";
    const changeRef = record.change_ref;
    if (input.changeRef !== undefined && changeRef !== input.changeRef) continue;
    if (input.state !== undefined && status !== input.state) continue;
    const permitEvents = journal.events.filter((event) => event.permit_ref === record.permit_ref);
    entries.push({
      permit_ref: record.permit_ref,
      change_ref: changeRef,
      requested_by: {
        actor_type: record.requested_by.actor_type,
        actor: record.requested_by.actor,
        self_attested: record.requested_by.self_attested,
      },
      capability_refs: record.capability_refs ?? [],
      acceptance_shape: record.acceptance_shape ?? null,
      scope: {
        subject_ids: record.scope.subject_ids,
        write_policy: record.scope.write_policy,
      },
      issued_at_seq: record.issued_at_seq,
      expires_at_seq: record.expires_at_seq,
      beats_remaining: record.expires_at_seq - currentSeq,
      status,
      stolen: {
        at_seq: record.stolen_at_seq,
        by:
          record.stolen_by === null
            ? null
            : {
                actor_type: record.stolen_by.actor_type,
                actor: record.stolen_by.actor,
              },
        reason: record.stolen_reason,
      },
      events: foldEvents(permitEvents),
    });
  }
  const result: PermitListResult = { current_seq: currentSeq, permits: entries };
  return okOutcome(
    "permit list",
    result,
    [
      `permit list: ${result.permits.length} permit(s) at seq=${currentSeq}` +
        `（TTL 标称：1 拍 ≈ 1 rebuild 拍，即 C9 的 168h 标称节奏；禁墙钟）`,
      ...result.permits.map(
        (entry) =>
          `  ${entry.permit_ref} [${entry.status}] beats_remaining=${entry.beats_remaining}` +
          ` change_ref=${entry.change_ref ?? "(none)"}`,
      ),
    ],
  );
}
