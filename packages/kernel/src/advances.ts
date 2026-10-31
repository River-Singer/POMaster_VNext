/**
 * advances.ts —— 合法推进台账：ADVANCE 记录平面 + 退役台账（VNext 优化 V1-4；
 * vnext-legal-advance §2 / §3.5；台账 VX-PARITY-03）。
 *
 * 平面（kernel state 平面，不进 truth-index、不进 content_digest——steering-log /
 * exception-ledger 同款侧车）：
 * - state/advances/ADV-<n>.json  不可变：一次合法推进一份（谁、为什么、证据、新旧锚、复判结论）；
 * - state/retirements.json       append-only：显式、可归属的「这条记录不在了」决定；撤销退役
 *                                 （V2-6 `baseline unretire`）以 reinstatements 条目追加，历史不改写。
 *
 * 写入面唯一：kernel 事务 op `record_advance`（store.ts applyRecordAdvance），提交后
 * journal 追加 `ADVANCE_RECORDED`。本模块只放读 API 与 store 写路径共用的纯计算
 * （编号分配、链上前驱、条目形态），零写副作用。
 *
 * 链纪律：同一 (anchor kind, ref) 上的 ADVANCE 成链——新段的 old_anchor 必须等于该锚
 * 最近一次 ADVANCE 的 new_anchor（首段无前驱，由调用方按现状计算旧锚）。重放同一段
 * 会因旧锚对不上链尾被拒，链天然防重。
 *
 * 词形：ADV-<n> 编号、ADVANCE_RECORDED 事件、retirements 台账键 = kernel 局部词
 * TODO(vocab-pr)（随词汇表 PR-0012 收编）。
 */
import { readdirSync } from "node:fs";
import { GovernanceError } from "./errors.js";
import { readText } from "./io.js";
import type { StorePaths } from "./paths.js";
import type { AnchorKind, RetirementKind } from "./legal-advance.js";

export const ADVANCE_RECORD_TYPE = "advance" as const;
export const ADVANCE_RECORDED_EVENT = "ADVANCE_RECORDED" as const;
export const RETIREMENT_LEDGER_VERSION = 1 as const;
const ADVANCE_FILE_RE = /^ADV-([0-9]+)\.json$/;
export const ADVANCE_ID_RE = /^ADV-[0-9]{4,}$/;

export function advancesDirOf(paths: StorePaths): string {
  return `${paths.stateDir}/advances`;
}

export function retirementsPathOf(paths: StorePaths): string {
  return `${paths.stateDir}/retirements.json`;
}

export function advancePathOf(paths: StorePaths, adv: string): string {
  return `${advancesDirOf(paths)}/${adv}.json`;
}

export function formatAdvanceId(n: number): string {
  return `ADV-${String(n).padStart(4, "0")}`;
}

/** 落盘的 ADVANCE 记录（snake_case，与文件逐键同构）。 */
export interface AdvanceRecord {
  readonly record_type: typeof ADVANCE_RECORD_TYPE;
  readonly adv: string;
  readonly at_seq: number;
  readonly actor: string;
  readonly reason: string;
  /** vnext-legal-advance §3.2 的 ADVANCE 段原样（buildAdvance 产物）。 */
  readonly advance: Readonly<Record<string, unknown>>;
  readonly retirement_ids: readonly string[];
  /** 同批撤销退役的条目 id（V2-6；缺席 = 无）。 */
  readonly reinstatement_ids?: readonly string[];
}

/** 退役台账条目 = 契约条目 + 归属（由哪次 ADVANCE、在哪个 seq 记下）。 */
export interface RetirementLedgerEntry {
  readonly id: string;
  readonly kind: RetirementKind;
  readonly reason: string;
  readonly actor: string;
  readonly replacement_id: string | null;
  readonly last_anchor: Readonly<Record<string, unknown>>;
  readonly adv: string;
  readonly at_seq: number;
}

/** 撤销退役条目（V2-6）：同 (kind, id) 的退役条数 > 撤销条数 = 当前仍在退役。 */
export interface ReinstatementLedgerEntry {
  readonly id: string;
  readonly kind: RetirementKind;
  readonly reason: string;
  readonly actor: string;
  readonly adv: string;
  readonly at_seq: number;
}

export interface RetirementLedgerFile {
  readonly version: typeof RETIREMENT_LEDGER_VERSION;
  readonly entries: readonly RetirementLedgerEntry[];
  /** 撤销退役（V2-6）：append-only；缺席 = 空（存量台账零迁移）。 */
  readonly reinstatements?: readonly ReinstatementLedgerEntry[];
}

function corrupt(path: string, detail: string): GovernanceError {
  return new GovernanceError(
    "SCHEMA_INVALID",
    `合法推进台账损坏：${path}（${detail}）`,
    "ADVANCE 记录与退役台账只经 record_advance 事务写入；从 git 恢复该文件，禁手改",
    { path },
  );
}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw corrupt(path, `JSON 不可解析：${String(error)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 解析一份 ADVANCE 记录文本（store 写路径对事务内待落盘记录复用同一解析）。 */
export function parseAdvanceRecord(path: string, text: string): AdvanceRecord {
  const value = parseJson(path, text);
  if (
    !isRecord(value) ||
    value["record_type"] !== ADVANCE_RECORD_TYPE ||
    typeof value["adv"] !== "string" ||
    !ADVANCE_ID_RE.test(value["adv"]) ||
    typeof value["at_seq"] !== "number" ||
    !isRecord(value["advance"]) ||
    !Array.isArray(value["retirement_ids"])
  ) {
    throw corrupt(path, "记录形态不符 {record_type, adv, at_seq, actor, reason, advance, retirement_ids}");
  }
  return value as unknown as AdvanceRecord;
}

/** 磁盘上的 ADVANCE 文件名（按编号升序）。平面缺席 = 空集合（存量 store 零迁移）。 */
export function listAdvanceFiles(paths: StorePaths): string[] {
  let names: string[];
  try {
    names = readdirSync(advancesDirOf(paths));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((name) => ADVANCE_FILE_RE.test(name))
    .sort((a, b) => advanceNumber(a) - advanceNumber(b));
}

function advanceNumber(name: string): number {
  const match = ADVANCE_FILE_RE.exec(name) ?? /^ADV-([0-9]+)$/.exec(name);
  return match === null ? 0 : Number(match[1]);
}

/** 下一个 ADV 编号：已落盘与事务内待落盘（pendingIds）取最大号顺延。 */
export function nextAdvanceId(paths: StorePaths, pendingIds: Iterable<string> = []): string {
  let max = 0;
  for (const name of listAdvanceFiles(paths)) max = Math.max(max, advanceNumber(name));
  for (const id of pendingIds) max = Math.max(max, advanceNumber(id));
  return formatAdvanceId(max + 1);
}

export interface AdvanceFilter {
  readonly anchorKind?: AnchorKind;
  readonly ref?: string;
}

function anchorOfRecord(record: AdvanceRecord): Record<string, unknown> {
  const anchor = record.advance["new_anchor"];
  return isRecord(anchor) ? anchor : {};
}

function matchesFilter(record: AdvanceRecord, filter: AdvanceFilter): boolean {
  const anchor = anchorOfRecord(record);
  if (filter.anchorKind !== undefined && anchor["kind"] !== filter.anchorKind) return false;
  if (filter.ref !== undefined && anchor["ref"] !== filter.ref) return false;
  return true;
}

/** 全部 ADVANCE 记录（编号升序），可按锚种类 / ref 过滤。 */
export function listAdvanceRecords(paths: StorePaths, filter: AdvanceFilter = {}): AdvanceRecord[] {
  const records: AdvanceRecord[] = [];
  for (const name of listAdvanceFiles(paths)) {
    const path = `${advancesDirOf(paths)}/${name}`;
    const text = readText(path);
    if (text === null) continue;
    const record = parseAdvanceRecord(path, text);
    if (matchesFilter(record, filter)) records.push(record);
  }
  return records;
}

/** 该锚链尾（最近一次 ADVANCE）；无 → null。 */
export function latestAdvanceFor(paths: StorePaths, anchorKind: AnchorKind, ref: string): AdvanceRecord | null {
  const records = listAdvanceRecords(paths, { anchorKind, ref });
  return records.length === 0 ? null : (records[records.length - 1] ?? null);
}

/** 退役台账；文件缺席 = 空台账。 */
export function readRetirementLedger(paths: StorePaths): RetirementLedgerFile {
  const path = retirementsPathOf(paths);
  const text = readText(path);
  if (text === null) return { version: RETIREMENT_LEDGER_VERSION, entries: [] };
  return parseRetirementLedger(path, text);
}

export function parseRetirementLedger(path: string, text: string): RetirementLedgerFile {
  const value = parseJson(path, text);
  if (!isRecord(value) || value["version"] !== RETIREMENT_LEDGER_VERSION || !Array.isArray(value["entries"])) {
    throw corrupt(path, `台账形态不符 {version: ${RETIREMENT_LEDGER_VERSION}, entries: []}`);
  }
  for (const entry of value["entries"]) {
    if (!isRecord(entry) || typeof entry["id"] !== "string" || typeof entry["kind"] !== "string") {
      throw corrupt(path, "条目缺 id / kind");
    }
  }
  const reinstatements = value["reinstatements"];
  if (reinstatements !== undefined) {
    if (!Array.isArray(reinstatements)) throw corrupt(path, "reinstatements 须为数组");
    for (const entry of reinstatements) {
      if (!isRecord(entry) || typeof entry["id"] !== "string" || typeof entry["kind"] !== "string") {
        throw corrupt(path, "撤销条目缺 id / kind");
      }
    }
  }
  return value as unknown as RetirementLedgerFile;
}

export function listRetirements(paths: StorePaths, filter: { readonly kind?: RetirementKind } = {}): RetirementLedgerEntry[] {
  return readRetirementLedger(paths).entries.filter((entry) => filter.kind === undefined || entry.kind === filter.kind);
}

/**
 * 同一 (kind, id) 当前是否在退役：退役条数 > 撤销条数（V2-6：撤销以 reinstatements 追加，
 * 退役 / 撤销交替出现由写路径保证）。在退役时重复退役被拒；不在退役时撤销被拒。
 */
export function isRetired(
  ledger: Pick<RetirementLedgerFile, "entries" | "reinstatements">,
  kind: string,
  id: string,
): boolean {
  const retired = ledger.entries.filter((entry) => entry.kind === kind && entry.id === id).length;
  const reinstated = (ledger.reinstatements ?? []).filter((entry) => entry.kind === kind && entry.id === id).length;
  return retired > reinstated;
}

/** 当前在退役的条目（每个 (kind, id) 取最近一次退役条目；已撤销的不在内）。 */
export function listActiveRetirements(
  paths: StorePaths,
  filter: { readonly kind?: RetirementKind } = {},
): RetirementLedgerEntry[] {
  const ledger = readRetirementLedger(paths);
  const latest = new Map<string, RetirementLedgerEntry>();
  for (const entry of ledger.entries) {
    if (filter.kind !== undefined && entry.kind !== filter.kind) continue;
    latest.set(`${entry.kind}\u0000${entry.id}`, entry);
  }
  return [...latest.values()].filter((entry) => isRetired(ledger, entry.kind, entry.id));
}
