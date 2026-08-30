/**
 * projection-common.ts —— view/audit 三投影命令面（§44.7/§49.1）共享的纯读装配。
 *
 * 纪律（与 inspect.ts 同一条线）：
 * - 纯读零写入：不调 createStore（其 ensureSidecars 会补写缺失骨架文件）——
 *   一切读取走只读文件 IO；A1 成对纪律（索引行在而正文缺失 = fail）；
 * - 三投影数据源 = 既有 store/truth/evidence 平面（truth-index + 正文信封 +
 *   evidence/{runs,claims} + state/permits.json + state/exception-ledger.json +
 *   state/journal.jsonl），不自造第二事实面（§91.1：一个 State 多种 View——
 *   投影是纯派生视图，不产生治理事实）；
 * - Exception Ledger 缺席 = 合法空（opt-in 登记面，显式 note）；损坏 =
 *   SCHEMA_INVALID fail-closed（异常面不可信时拒绝渲染视图——禁把「异常面丢了」
 *   呈现成「没有异常」）。
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GovernedIdParseError,
  parseGovernedId,
  resolveAlias,
} from "@pomaster/kernel";
import {
  CLM_FILE_PATTERN,
  EVIDENCE_MALFORMED_CODE,
  GRN_FILE_PATTERN,
  listPlaneFiles,
} from "./evidence.js";
import { POMASTER_DIR, toPosix, truthIndexPath } from "./store-layout.js";
import type { CliError, CliWarning } from "./envelope.js";

type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** truth-index 纯读（NOT_INITIALIZED / SCHEMA_INVALID 显式；禁静默当空索引）。 */
export async function readRawIndexOrFail(
  rootDir: string,
): Promise<{ readonly index: UnknownRecord } | { readonly error: CliError }> {
  let raw: string;
  try {
    raw = await readFile(truthIndexPath(rootDir), "utf8");
  } catch {
    return {
      error: {
        code: "NOT_INITIALIZED",
        message: `no pomaster state found at ${toPosix(".pomaster/state/truth-index.json")}`,
        hint: "run: pomaster init 后再使用投影命令。",
      },
    };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new TypeError("truth-index is not an object");
    return { index: parsed };
  } catch (err) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `truth-index 无法解析：${(err as Error).message}`,
        hint: `机器事务维护的文件（${toPosix(".pomaster/state/truth-index.json")}）；从 git 恢复后重试。`,
      },
    };
  }
}

/** Exception Ledger 纯读（缺席 = 合法空 + 显式 note；损坏 = SCHEMA_INVALID）。 */
export async function readLedgerEntries(
  rootDir: string,
): Promise<
  | {
      readonly entries: readonly UnknownRecord[];
      readonly note: string;
    }
  | { readonly error: CliError }
> {
  const path = join(rootDir, POMASTER_DIR, "state", "exception-ledger.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return {
      entries: [],
      note: "exception-ledger 缺席（opt-in 登记面：尚无异常登记；不伪装成「无异常」）",
    };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
      throw new TypeError("entries is not an array");
    }
    return {
      entries: parsed.entries.filter((entry): entry is UnknownRecord => isRecord(entry)),
      note: `exception-ledger 在册 ${parsed.entries.length} 条（${toPosix(".pomaster/state/exception-ledger.json")}）`,
    };
  } catch (err) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `exception-ledger 无法解析：${(err as Error).message}`,
        hint: "台账由 pomaster ledger record（kernel recordException）维护；从 git 恢复后重试，禁手改。",
      },
    };
  }
}

/**
 * 对象行查找（A5 文法 / A6 alias 收编；kernel 权威判定，CLI 不自造映射）。
 * scope/audit/review 的 id 解析共用。
 */
export function resolveRowTargetId(
  raw: string,
): { readonly target: string; readonly viaAlias: string | null } | { readonly error: CliError } {
  try {
    parseGovernedId(raw);
    return { target: raw, viaAlias: null };
  } catch (err) {
    if (!(err instanceof GovernedIdParseError)) throw err;
    const resolution = resolveAlias(raw);
    if (resolution.canonical !== null) {
      return { target: resolution.canonical, viaAlias: raw };
    }
    return {
      error: {
        code: err.reason === "unknown_prefix" ? "FATAL_UNKNOWN_PREFIX" : "FATAL_ID_GRAMMAR",
        message: err.message,
        hint: "closed-world 前缀闭包与 SEGMENT/SEQ 文法见 vocab-lock id_namespace（A5）；legacy 拼写走 alias 收编（A6）。",
      },
    };
  }
}

/** 索引行查找（缺席显式）。 */
export function findIndexRow(
  index: UnknownRecord,
  targetId: string,
): UnknownRecord | null {
  const rows = Array.isArray(index.objects) ? index.objects : [];
  return (
    rows.find((entry) => isRecord(entry) && entry.id === targetId) ?? null
  );
}

/** 正文信封纯读（A1 成对纪律：索引行在而正文缺失 → OBJECT_BODY_MISSING）。 */
export async function readBodyEnvelope(
  rootDir: string,
  row: UnknownRecord,
): Promise<{ readonly body: UnknownRecord } | { readonly error: CliError }> {
  const bodyRef = asString(row.body_ref);
  if (bodyRef === null) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `索引行缺 body_ref（对象 ${asString(row.id) ?? "?"}）`,
        hint: "truth-index 行由 kernel 事务维护；从 git 恢复后重试。",
      },
    };
  }
  const bodyPath = join(rootDir, POMASTER_DIR, ...bodyRef.split("/"));
  let raw: string;
  try {
    raw = await readFile(bodyPath, "utf8");
  } catch {
    return {
      error: {
        code: "OBJECT_BODY_MISSING",
        message: `索引行在而正文缺失（A1 成对纪律）：${toPosix(`${POMASTER_DIR}/${bodyRef}`)}`,
        hint: "从 git 恢复，或用 maintain/compact 重新 upsert 该对象（禁手补索引行）。",
      },
    };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new TypeError("body is not an object");
    return { body: parsed };
  } catch (err) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `正文无法解析（对象 ${asString(row.id) ?? "?"}）：${(err as Error).message}`,
        hint: "正文文件由 kernel 事务维护（staged 原子写）；从 git 恢复该文件，禁手改正文。",
      },
    };
  }
}

/** permit 台账纯读（缺失/损坏与 permit list 同语义：损坏显式，不静默当空）。 */
export async function readPermitFile(
  rootDir: string,
): Promise<{ readonly permits: readonly UnknownRecord[] } | { readonly error: CliError }> {
  const path = join(rootDir, POMASTER_DIR, "state", "permits.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { permits: [] };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.permits)) {
      throw new TypeError("permits is not an array");
    }
    return {
      permits: parsed.permits.filter((entry): entry is UnknownRecord => isRecord(entry)),
    };
  } catch (err) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `state/permits.json 无法解析：${(err as Error).message}`,
        hint: "许可台账由 kernel issuePermit/stealPermit 维护；从 git 恢复后重试。",
      },
    };
  }
}

/** 证据平面纯读装配（runs + claims；损坏文件 EVIDENCE_MALFORMED warnings 不吞没）。 */
export interface ProjectionRunEntry {
  readonly grn: string;
  readonly subject_id: string;
  readonly gate: string | null;
  readonly verdict: string | null;
}

export interface ProjectionClaimEntry {
  readonly clm: string;
  readonly subject_id: string;
  readonly verdict: string | null;
  readonly assertion: string | null;
}

export async function readEvidencePlane(
  rootDir: string,
  warnings: CliWarning[],
): Promise<{ readonly runs: readonly ProjectionRunEntry[]; readonly claims: readonly ProjectionClaimEntry[] }> {
  const { readFile: read } = await import("node:fs/promises");

  const runFieldOf = (record: UnknownRecord, field: string): unknown => {
    const inline = record.gate_result;
    if (isRecord(inline) && isRecord(inline.result)) {
      const value = (inline.result as UnknownRecord)[field];
      if (value !== undefined) return value;
    }
    return record[field];
  };

  const runs: ProjectionRunEntry[] = [];
  const runsDir = join(rootDir, POMASTER_DIR, "evidence", "runs");
  for (const fileName of listPlaneFiles(runsDir)) {
    if (!GRN_FILE_PATTERN.test(fileName)) {
      warnings.push({
        code: EVIDENCE_MALFORMED_CODE,
        message: `evidence/runs/${fileName}: 文件名不符合 GRN-n.json 词形，未纳入证据分母`,
        hint: "平面分母只认 GRN-n.json / CLM-n.json（通路分配，工具不自造格式）。",
      });
      continue;
    }
    let record: UnknownRecord;
    try {
      const parsed: unknown = JSON.parse(await read(join(runsDir, fileName), "utf8"));
      if (!isRecord(parsed)) throw new TypeError("run record is not an object");
      record = parsed;
    } catch (err) {
      warnings.push({
        code: EVIDENCE_MALFORMED_CODE,
        message: `evidence/runs/${fileName}: JSON 无法解析 — ${(err as Error).message}`,
        hint: "畸形证据显式呈现不吞没；修复后走 record/compact canonical 化，或从 git 恢复。",
      });
      continue;
    }
    const subject = runFieldOf(record, "subject_id") ?? runFieldOf(record, "subjectId");
    runs.push({
      grn: fileName.slice(0, -".json".length),
      subject_id: typeof subject === "string" ? subject : "(unbound)",
      gate: asString(runFieldOf(record, "gate")),
      verdict: asString(runFieldOf(record, "verdict")),
    });
  }

  const claims: ProjectionClaimEntry[] = [];
  const claimsDir = join(rootDir, POMASTER_DIR, "evidence", "claims");
  for (const fileName of listPlaneFiles(claimsDir)) {
    if (!CLM_FILE_PATTERN.test(fileName)) {
      warnings.push({
        code: EVIDENCE_MALFORMED_CODE,
        message: `evidence/claims/${fileName}: 文件名不符合 CLM-n.json 词形，未纳入证据分母`,
        hint: "平面分母只认 GRN-n.json / CLM-n.json（通路分配，工具不自造格式）。",
      });
      continue;
    }
    let record: UnknownRecord;
    try {
      const parsed: unknown = JSON.parse(await read(join(claimsDir, fileName), "utf8"));
      if (!isRecord(parsed)) throw new TypeError("claim record is not an object");
      record = parsed;
    } catch (err) {
      warnings.push({
        code: EVIDENCE_MALFORMED_CODE,
        message: `evidence/claims/${fileName}: JSON 无法解析 — ${(err as Error).message}`,
        hint: "畸形证据显式呈现不吞没；修复后走 record/compact canonical 化，或从 git 恢复。",
      });
      continue;
    }
    const subject = isRecord(record.subject)
      ? (record.subject as UnknownRecord).object_id
      : (record.subject_id ?? record.subjectId);
    const verification = isRecord(record.verification) ? record.verification : undefined;
    claims.push({
      clm: fileName.slice(0, -".json".length),
      subject_id: typeof subject === "string" ? subject : "(unbound)",
      verdict: verification === undefined ? null : asString(verification.verdict),
      assertion: asString(record.assertion),
    });
  }
  return { runs, claims };
}

/** journal TX_APPLIED 事件流纯读（Transition History 字段源；损坏显式 fail）。 */
export async function readTransitionHistory(
  rootDir: string,
): Promise<
  | {
      readonly events: readonly {
        readonly seq: number;
        readonly authority_ref: string | null;
        readonly changed_object_ids: readonly string[];
      }[];
    }
  | { readonly error: CliError }
> {
  const path = join(rootDir, POMASTER_DIR, "state", "journal.jsonl");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { events: [] };
  }
  const events: {
    seq: number;
    authority_ref: string | null;
    changed_object_ids: string[];
  }[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!isRecord(parsed) || parsed.type !== "TX_APPLIED") continue;
      const seq = typeof parsed.seq === "number" ? parsed.seq : null;
      if (seq === null) throw new TypeError("TX_APPLIED 缺 seq");
      events.push({
        seq,
        authority_ref: asString(parsed.authority_ref),
        changed_object_ids: (Array.isArray(parsed.changed_object_ids) ? parsed.changed_object_ids : [])
          .filter((id): id is string => typeof id === "string"),
      });
    } catch (err) {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: `state/journal.jsonl 事件行无法解析：${(err as Error).message}`,
          hint: "journal 是追加流（不进 hash）；从 git 恢复该文件，禁止手改事件行。",
        },
      };
    }
  }
  return { events };
}

/**
 * 影响对象集合推导（view task / audit task 的分母；全部来自既有平面，零发明）：
 * - task 自身；
 * - task 行 permits_active 命中的许可的 scope.subject_ids（八拍②授权写入面）；
 * - implements_change 链上 change_object payload.affected_objects（变更影响面）；
 * - change_ref 匹配 task/change id 的许可的 subject_ids。
 */
export function collectAffectedIds(input: {
  readonly taskId: string;
  readonly taskRow: UnknownRecord;
  readonly taskBody: UnknownRecord;
  readonly changeBody: UnknownRecord | null;
  readonly changeRowId: string | null;
  readonly permits: readonly UnknownRecord[];
}): readonly string[] {
  const ids = new Set<string>([input.taskId]);
  const taskPermitsActive = (Array.isArray(input.taskRow.permits_active) ? input.taskRow.permits_active : []).filter(
    (id): id is string => typeof id === "string",
  );
  for (const permit of input.permits) {
    const permitRef = asString(permit.permit_ref);
    const changeRef = asString(permit.change_ref);
    const relevant =
      (permitRef !== null && taskPermitsActive.includes(permitRef)) ||
      (changeRef !== null &&
        (changeRef === input.taskId ||
          (input.changeRowId !== null && changeRef === input.changeRowId)));
    if (!relevant) continue;
    const scope = isRecord(permit.scope) ? permit.scope : undefined;
    for (const subjectId of (Array.isArray(scope?.subject_ids) ? scope?.subject_ids : []) ?? []) {
      if (typeof subjectId === "string") ids.add(subjectId);
    }
  }
  if (input.changeBody !== null) {
    // affected_objects 住 02b payload 自由区（信封层 additionalProperties true 的 payload 内）。
    const payload = isRecord(input.changeBody.payload) ? input.changeBody.payload : {};
    for (const affected of (Array.isArray(payload.affected_objects) ? payload.affected_objects : []) ?? []) {
      if (typeof affected === "string") ids.add(affected);
    }
  }
  return [...ids].sort();
}

/**
 * §91.3 投影可见性二分的 ledger 消费（词形即 §91.3 原文）：
 * - CONFLICT / HARD_BLOCKER → 高显著度异常区块；
 * - ASSUMPTION / OPEN_QUESTION / DEFERRED_DECISION → 聚合到对应章节。
 */
export const LEDGER_PROMINENT_CLASSES = ["CONFLICT", "HARD_BLOCKER"] as const;
export const LEDGER_AGGREGATED_CLASSES = [
  "ASSUMPTION",
  "OPEN_QUESTION",
  "DEFERRED_DECISION",
] as const;
