/**
 * inspect.ts —— `pomaster inspect <governed-id>`：单对象检视（正文+证据+谱系）纯读命令。
 *
 * PRD §44.1 基础命令；治理闭环「读」半边（G1 inspect hole：status 只有计数，
 * inspect 给单对象全貌——正文 + 证据 + 谱系）。纪律落点：
 * - 纯读零写入（A1 出口判据）：不调 createStore（其 ensureSidecars 会补写缺失骨架
 *   文件）——一切读取走只读文件 IO；执行前后 .pomaster 字节不变（测试锚）；
 * - A1 成对纪律：索引行在而正文文件缺失 → OBJECT_BODY_MISSING fail-closed（禁把
 *   「正文没了」呈现成「正文为空」）；正文/索引损坏 → SCHEMA_INVALID（禁静默跳过）；
 * - 证据平面损坏（JSON 不可解析）→ EVIDENCE_MALFORMED warnings 显式呈现不吞没
 *   （与 compact 同一码位同一分母纪律；检视不因旁路证据损坏而整体失败）；
 * - id 权威在 kernel：closed-world 文法归 parseGovernedId（A5）；legacy 词形
 *   （TASK-0087 等）走 resolveAlias 收编解析（A6 rename-on-ingest 的考古方向），
 *   CLI 不自造映射；resolved_via_alias 显式披露解析路径；
 * - 判卷零旁移：本命令只做读取与呈现，不做任何健康/一致性裁决（那是 reconcile /
 *   REF_INTEGRITY 的职责）；index evidence_summary 原样呈现，不与平面扫描对账判卷。
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GovernedIdParseError, parseGovernedId, resolveAlias } from "@pomaster/kernel";
import {
  CLM_FILE_PATTERN,
  EVIDENCE_MALFORMED_CODE,
  GRN_FILE_PATTERN,
  listPlaneFiles,
} from "./evidence.js";
import { parseErrorToCliError } from "./permit.js";
import { POMASTER_DIR, TRUTH_INDEX_RELATIVE, toPosix, truthIndexPath } from "./store-layout.js";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

type UnknownRecord = Record<string, unknown>;

/** `pomaster inspect` 输入（argv 已收敛为字符串）。 */
export interface InspectInput {
  readonly id: string;
}

/** run 文件呈现条目（只读投影；verdict/ran_at_seq 缺席显式为 null）。 */
export interface InspectRunEntry {
  readonly grn: string;
  readonly gate: string | null;
  readonly verdict: string | null;
  readonly ran_at_seq: number | null;
}

/** claim 文件呈现条目。 */
export interface InspectClaimEntry {
  readonly clm: string;
  readonly verdict: string | null;
  readonly assertion: string | null;
  readonly asserted_by: string | null;
}

/** 谱系块（字段只住正文信封、索引行不承载的部分——CLI 原样投影，不二次解释）。 */
export interface InspectLineage {
  readonly supersedes: Readonly<Record<string, unknown>> | null;
  readonly successor_ref: string | null;
  readonly aliases: readonly string[];
  readonly sources: readonly unknown[];
}

export interface InspectResult {
  readonly id: string;
  /** legacy 词形经 resolveAlias 收编时的 canonical 目标；输入即 canonical 时为 null。 */
  readonly resolved_via_alias: string | null;
  /** truth-index 摘要行（snake_case 原样呈现）。 */
  readonly index_row: Readonly<Record<string, unknown>> | null;
  /** 02 正文信封（原样呈现）。 */
  readonly body: Readonly<Record<string, unknown>> | null;
  readonly lineage: InspectLineage | null;
  readonly evidence: {
    readonly index_summary: Readonly<Record<string, unknown>> | null;
    readonly runs: readonly InspectRunEntry[];
    readonly claims: readonly InspectClaimEntry[];
  } | null;
}

function emptyResult(id: string): InspectResult {
  return {
    id,
    resolved_via_alias: null,
    index_row: null,
    body: null,
    lineage: null,
    evidence: null,
  };
}

function failInspect(error: CliError, id: string): CommandOutcome<InspectResult> {
  return failOutcome<InspectResult>(
    "inspect",
    emptyResult(id),
    [error],
    [`inspect: FAILED — ${error.code}\n  hint: ${error.hint}`],
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 身份解析：closed-world 文法优先，legacy 词形走 alias 收编（A5/A6；判定全在 kernel）。 */
function resolveTargetId(
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
    return { error: parseErrorToCliError(err) };
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** run 文件 subject 提取（canonical 07 内嵌 / pre-canonical 夹具双形态，与 reconcile 同一条线）。 */
function runFieldOf(record: UnknownRecord, field: string): unknown {
  const inline = record.gate_result;
  if (isRecord(inline) && isRecord(inline.result)) {
    const value = (inline.result as UnknownRecord)[field];
    if (value !== undefined) return value;
  }
  return record[field];
}

function runSubjectOf(record: UnknownRecord): unknown {
  return runFieldOf(record, "subject_id") ?? runFieldOf(record, "subjectId");
}

function claimSubjectOf(record: UnknownRecord): unknown {
  const subject = record.subject;
  if (isRecord(subject) && subject.object_id !== undefined) return subject.object_id;
  return record.subject_id ?? record.subjectId;
}

/**
 * 执行 inspect（纯读）。ok=false 仅在对象不可诚实呈现时（未初始化/身份非法/对象缺席/
 * 正文缺失或损坏）；证据平面损坏走 warnings 不失败。
 */
export async function runInspect(
  rootDir: string,
  input: InspectInput,
): Promise<CommandOutcome<InspectResult>> {
  // —— store 初始化缺席显式（绝不静默建账：本命令零写入） ——
  let indexRaw: string;
  try {
    indexRaw = await readFile(truthIndexPath(rootDir), "utf8");
  } catch {
    return failInspect(
      {
        code: "NOT_INITIALIZED",
        message: `no pomaster state found at ${toPosix(TRUTH_INDEX_RELATIVE)}`,
        hint: "run: pomaster init（在项目根创建治理骨架后重试）。",
      },
      input.id,
    );
  }
  let index: UnknownRecord;
  try {
    const parsed: unknown = JSON.parse(indexRaw);
    if (!isRecord(parsed)) throw new TypeError("truth-index is not an object");
    index = parsed;
  } catch (err) {
    return failInspect(
      {
        code: "SCHEMA_INVALID",
        message: `truth-index 无法解析：${(err as Error).message}`,
        hint: `机器事务维护的文件（${toPosix(TRUTH_INDEX_RELATIVE)}）；手改内容请走 kernel store 事务恢复。`,
      },
      input.id,
    );
  }

  // —— 身份解析（A5 文法 / A6 收编；kernel 权威） ——
  const resolved = resolveTargetId(input.id);
  if ("error" in resolved) return failInspect(resolved.error, input.id);
  const target = resolved.target;

  // —— 索引行查找 ——
  const rows = Array.isArray(index.objects) ? index.objects : [];
  const row = rows.find((entry) => isRecord(entry) && entry.id === target);
  if (row === undefined) {
    return failInspect(
      {
        code: "OBJECT_NOT_FOUND",
        message: `对象不在 truth-index：${target}${resolved.viaAlias === null ? "" : `（由 ${resolved.viaAlias} 收编解析）`}`,
        hint: "pomaster status --json 查看对象清单；id 词形见 vocab-lock id_namespace（A5），legacy 拼写见 aliases[]（A6）。",
      },
      input.id,
    );
  }
  const rowRecord = row as UnknownRecord;

  // —— 正文读取（A1 成对纪律：索引行在而正文缺失 = REF 异常形态，必 fail） ——
  const bodyRef = asString(rowRecord.body_ref);
  if (bodyRef === null) {
    return failInspect(
      {
        code: "SCHEMA_INVALID",
        message: `索引行缺 body_ref（对象 ${target}）`,
        hint: "truth-index 行由 kernel 事务维护；从 git 恢复后重试。",
      },
      input.id,
    );
  }
  const bodyPath = join(rootDir, POMASTER_DIR, ...bodyRef.split("/"));
  let bodyRaw: string;
  try {
    bodyRaw = await readFile(bodyPath, "utf8");
  } catch {
    return failInspect(
      {
        code: "OBJECT_BODY_MISSING",
        message: `索引行在而正文缺失（A1 成对纪律）：${toPosix(`${POMASTER_DIR}/${bodyRef}`)}`,
        hint: "正文文件被删或未落盘——从 git 恢复，或用 maintain/compact 重新 upsert 该对象（禁手补索引行）。",
      },
      input.id,
    );
  }
  let body: UnknownRecord;
  try {
    const parsed: unknown = JSON.parse(bodyRaw);
    if (!isRecord(parsed)) throw new TypeError("body is not an object");
    body = parsed;
  } catch (err) {
    return failInspect(
      {
        code: "SCHEMA_INVALID",
        message: `正文无法解析（对象 ${target}）：${(err as Error).message}`,
        hint: "正文文件由 kernel 事务维护（staged 原子写）；从 git 恢复该文件，禁手改正文。",
      },
      input.id,
    );
  }

  // —— 谱系（只投影正文承载的谱系字段，CLI 不二次解释） ——
  const lineage: InspectLineage = {
    supersedes: isRecord(body.supersedes) ? body.supersedes : null,
    successor_ref: asString(body.successor_ref),
    aliases: (Array.isArray(body.aliases) ? body.aliases : []).filter(
      (entry): entry is string => typeof entry === "string",
    ),
    sources: Array.isArray(body.sources) ? body.sources : [],
  };

  // —— 证据平面扫描（分母 = GRN-n.json / CLM-n.json，与 compact 同一分母纪律；
  //     损坏文件 EVIDENCE_MALFORMED warnings 显式呈现不吞没） ——
  const warnings: CliWarning[] = [];
  const runs: InspectRunEntry[] = [];
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
      const parsed: unknown = JSON.parse(await readFile(join(runsDir, fileName), "utf8"));
      if (!isRecord(parsed)) throw new TypeError("run record is not an object");
      record = parsed;
    } catch (err) {
      warnings.push({
        code: EVIDENCE_MALFORMED_CODE,
        message: `evidence/runs/${fileName}: JSON 无法解析 — ${(err as Error).message}`,
        hint: "畸形证据显式呈现不吞没；修复文件后走 record/compact canonical 化，或从 git 恢复。",
      });
      continue;
    }
    if (runSubjectOf(record) !== target) continue;
    const ranAtSeq = runFieldOf(record, "ran_at_seq");
    runs.push({
      grn: fileName.slice(0, -".json".length),
      gate: asString(runFieldOf(record, "gate")),
      verdict: asString(runFieldOf(record, "verdict")),
      ran_at_seq: typeof ranAtSeq === "number" ? ranAtSeq : null,
    });
  }

  const claims: InspectClaimEntry[] = [];
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
      const parsed: unknown = JSON.parse(await readFile(join(claimsDir, fileName), "utf8"));
      if (!isRecord(parsed)) throw new TypeError("claim record is not an object");
      record = parsed;
    } catch (err) {
      warnings.push({
        code: EVIDENCE_MALFORMED_CODE,
        message: `evidence/claims/${fileName}: JSON 无法解析 — ${(err as Error).message}`,
        hint: "畸形证据显式呈现不吞没；修复文件后走 record/compact canonical 化，或从 git 恢复。",
      });
      continue;
    }
    if (claimSubjectOf(record) !== target) continue;
    const verification = isRecord(record.verification) ? record.verification : undefined;
    const assertedBy = isRecord(record.asserted_by) ? record.asserted_by : undefined;
    const actorType = asString(assertedBy?.actor_type);
    const actor = asString(assertedBy?.actor);
    claims.push({
      clm: fileName.slice(0, -".json".length),
      verdict: verification === undefined ? null : asString(verification.verdict),
      assertion: asString(record.assertion),
      asserted_by: actorType === null && actor === null ? null : `${actorType ?? "?"}:${actor ?? "?"}`,
    });
  }

  const summary = isRecord(rowRecord.evidence_summary) ? rowRecord.evidence_summary : null;
  const result: InspectResult = {
    id: target,
    resolved_via_alias: resolved.viaAlias,
    index_row: rowRecord,
    body,
    lineage,
    evidence: {
      index_summary: summary,
      runs: runs.sort((a, b) => (a.grn < b.grn ? -1 : 1)),
      claims: claims.sort((a, b) => (a.clm < b.clm ? -1 : 1)),
    },
  };

  const axes = isRecord(rowRecord.axes) ? rowRecord.axes : {};
  const lineageBits = [
    lineage.supersedes === null ? null : `supersedes=${String(lineage.supersedes.id ?? "?")}`,
    lineage.successor_ref === null ? null : `successor=${lineage.successor_ref}`,
    lineage.aliases.length > 0 ? `aliases=${lineage.aliases.length}` : null,
    lineage.sources.length > 0 ? `sources=${lineage.sources.length}` : null,
  ].filter((bit): bit is string => bit !== null);
  const human = [
    `inspect ${target} → kind=${asString(rowRecord.kind) ?? "?"} lifecycle=${asString(axes.lifecycle) ?? "?"} rev=${String(rowRecord.rev ?? "?")}` +
      (resolved.viaAlias === null ? "" : ` (via alias ${resolved.viaAlias})`),
    `  title: ${asString(rowRecord.title_zh) ?? asString(body.title_zh) ?? "(missing)"}`,
    `  body: ${toPosix(`${POMASTER_DIR}/${bodyRef}`)}`,
    `  lineage: ${lineageBits.length > 0 ? lineageBits.join(" ") : "(none)"}`,
    `  evidence: runs=${result.evidence?.runs.length ?? 0} claims=${result.evidence?.claims.length ?? 0}` +
      (summary === null ? "" : ` | index summary: ${JSON.stringify(summary)}`),
  ];
  if (warnings.length > 0) {
    human.push(`  warnings: ${warnings.length} 条证据平面异常（显式呈现不吞没，详见 --json）`);
  }
  return okOutcome("inspect", result, human, warnings);
}
