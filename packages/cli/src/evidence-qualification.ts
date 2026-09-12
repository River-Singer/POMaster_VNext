/**
 * evidence-qualification.ts —— 证据绑定资格链 CLI 装配面（W1 R1-5 消费者共享单点）。
 *
 * 职责两半：
 * - 要求面装配（readEvidenceQualificationRequirement）：baseline 确认态 at_seq
 *   （readBaselineConfirmation 单源——R4 四消费面同源纪律，本面是第五消费者）+
 *   journal 三词形失效事件（PERMIT_EXPIRED_OBSERVED / PERMIT_STOLEN /
 *   EXECUTION_INTERRUPTED——producer 既有词，只读零写入）+ executions/AGX-*.json
 *   permit_ids 绑定映射（事件 ↔ 执行关联锚：两 permit 词形事件无 execution_id 键，
 *   关联必须经档案 permit_ids）+ gauntlet-lite CURRENT_GATE_DEFS 当前注册面。
 *   oracle/subject 轴显式关闭（null）——oracle 注册面本切片无消费源；subject 防线
 *   归既有消费者（DOD_CLAIM_SUBJECT_MISMATCH 等），叠加非替换。
 * - 证据面装配（readRunQualificationView / normalizeGrnEvidenceRefs）：GRN run 记录
 *   的资格字段读取（内嵌 gate_result.result 优先、信封回退——与 closeout/inspect/
 *   reconcile 的读取规则同一条线）与 claim evidence_refs 的 GRN 引用归一
 *   （字符串词形 + 07 typed gate_result 分型；blob/truth_object 分支不携带 seq/
 *   gate_def 锚，不进资格分母——缺席诚实，非静默放行）。
 *
 * 消费者：closeout.ts（主：DOD_CLAIM_EVIDENCE_UNQUALIFIED 读侧判卷）+
 * record.ts（次：VERIFICATION_EVIDENCE_UNQUALIFIED 写侧前置）。journal 损坏 =
 * SCHEMA_INVALID fail-closed（journal 由 kernel 事务追加维护，损坏可能正是被藏起来
 * 的失效事件，禁静默跳过）。
 */
import { readFile } from "node:fs/promises";
import type { EvidenceInvalidationEvent, EvidenceQualificationRequirement } from "@pomaster/kernel";
import {
  EVIDENCE_INVALIDATION_EVENT_TYPES,
  GovernanceError,
  buildStorePaths,
  listExecutionRecords,
} from "@pomaster/kernel";
import { CURRENT_GATE_DEFS } from "@pomaster/gauntlet-lite";
import { GRN_FILE_PATTERN } from "./evidence.js";
import { readBaselineConfirmation } from "./baseline.js";
import { journalFilePath, toPosix } from "./store-layout.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ============================================================
// 要求面装配（当前要求 = baseline 确认锚 + 失效事件 + 执行许可绑定 + 当前注册面）
// ============================================================

/** journal 三词形失效事件解析（其他事件词形非本轴分母，过滤非跳判；损坏行 fail-closed）。 */
async function readInvalidationEvents(rootDir: string): Promise<EvidenceInvalidationEvent[]> {
  let text: string;
  try {
    text = await readFile(journalFilePath(rootDir), "utf8");
  } catch {
    return []; // journal 缺席 = 零失效事件（fixture 最小 store 正面构造）
  }
  const events: EvidenceInvalidationEvent[] = [];
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `journal 第 ${index + 1} 行无法解析（损坏或手改）：${toPosix(".pomaster/state/journal.jsonl")}`,
        "journal 由 kernel 事务追加维护——损坏可能正是被藏起来的失效事件（禁静默跳过）；从 git 恢复该文件，禁止手改。",
        { cause: err instanceof Error ? err.message : String(err), line: index + 1 },
      );
    }
    if (!isRecord(parsed)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `journal 第 ${index + 1} 行不是 JSON 对象：${toPosix(".pomaster/state/journal.jsonl")}`,
        "journal 由 kernel 事务追加维护；从 git 恢复该文件，禁止手改。",
        { line: index + 1 },
      );
    }
    const type = parsed.type;
    if (typeof type !== "string" || !(EVIDENCE_INVALIDATION_EVENT_TYPES as readonly string[]).includes(type)) {
      continue; // 非失效事件词形（TX_APPLIED/PERMIT_ISSUED/…）——过滤，非静默跳判
    }
    const seq = parsed.seq;
    if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `journal 第 ${index + 1} 行 ${type} 事件 seq 缺失或非法（须非负整数）`,
        "失效事件由 kernel producer 追加（seq 采样，A4）；形态异常请从 git 恢复 journal，禁止手改。",
        { line: index + 1, type },
      );
    }
    events.push({
      type: type as EvidenceInvalidationEvent["type"],
      seq,
      execution_id: asStringOrNull(parsed.execution_id),
      permit_ref: asStringOrNull(parsed.permit_ref),
    });
  }
  return events;
}

/**
 * 当前要求面装配（判定核输入；每次判卷前新鲜装配——baseline 确认/失效事件/档案
 * 都是随时间推进的事实源，禁缓存跨判卷复用）。
 */
export async function readEvidenceQualificationRequirement(
  rootDir: string,
): Promise<EvidenceQualificationRequirement> {
  const paths = buildStorePaths(rootDir);
  const confirmation = await readBaselineConfirmation(rootDir);
  const baselineAtSeq =
    confirmation.kind === "record-valid" && typeof confirmation.record.at_seq === "number"
      ? confirmation.record.at_seq
      : null; // manifest 缺席/不可读/记录损坏 → seq 轴诚实不适用（确认门自身判卷归 baseline gate）
  const invalidatedEvents = await readInvalidationEvents(rootDir);
  const executionPermits: Record<string, readonly string[]> = {};
  for (const record of listExecutionRecords(paths)) {
    executionPermits[record.execution_id] = record.permit_ids;
  }
  return {
    baseline_at_seq: baselineAtSeq,
    invalidated_events: invalidatedEvents,
    execution_permits: executionPermits,
    current_gate_defs: CURRENT_GATE_DEFS,
    // 诚实边界（本切片）：oracle 注册面无消费源、subject 防线归既有消费者——两轴显式关闭。
    current_oracle_ref: null,
    subject: null,
  };
}

// ============================================================
// 证据面装配（GRN run 资格字段 + claim evidence_refs GRN 引用归一）
// ============================================================

/** GRN run 记录的资格字段视图（readRunQualificationView 成功形态）。 */
export interface RunQualificationView {
  readonly grn: string;
  readonly subject: string | null;
  readonly gate: string | null;
  readonly gateDef: string | null;
  readonly ranAtSeq: number | null;
  readonly executionId: string | null;
}

function qualificationFieldOf(record: UnknownRecord, field: string): unknown {
  const inline = record.gate_result;
  if (isRecord(inline) && isRecord(inline.result)) {
    const value = (inline.result as UnknownRecord)[field];
    if (value !== undefined) return value;
  }
  return record[field];
}

/**
 * 读单条 GRN run 记录的资格字段（captured_at_seq/gate/gate_def/execution_id/subject）。
 * 内嵌 gate_result.result 优先、信封回退（与 closeout readRunRecord/inspect/reconcile
 * 同一条线；本视图只取资格轴字段——tool 三件套等判卷位归既有消费者）。文件缺失 →
 * null（悬空引用由调用方既有防线负责，如 DOD_CLAIM_NOT_FOUND 同形的引用位语义）；
 * 存在但损坏 → damage（判卷分母内证据损坏禁静默跳过）。
 */
export async function readRunQualificationView(
  runsDir: string,
  grn: string,
): Promise<RunQualificationView | { readonly damage: string } | null> {
  let text: string;
  try {
    text = await readFile(`${runsDir}/${grn}.json`, "utf8");
  } catch {
    return null; // 文件缺席——悬空引用语义，归调用方既有引用位防线
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      damage: `evidence/runs/${grn}.json: JSON 无法解析 — ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!isRecord(parsed)) {
    return { damage: `evidence/runs/${grn}.json: run 记录不是 JSON 对象` };
  }
  const ranAtSeq = qualificationFieldOf(parsed, "ran_at_seq");
  const subject = qualificationFieldOf(parsed, "subject_id") ?? qualificationFieldOf(parsed, "subjectId");
  return {
    grn,
    subject: asStringOrNull(subject),
    gate: asStringOrNull(qualificationFieldOf(parsed, "gate")),
    gateDef: asStringOrNull(qualificationFieldOf(parsed, "gate_def")),
    ranAtSeq: typeof ranAtSeq === "number" && Number.isInteger(ranAtSeq) && ranAtSeq >= 0 ? ranAtSeq : null,
    executionId: asStringOrNull(parsed.execution_id),
  };
}

/**
 * claim evidence_refs 的 GRN 引用归一（保序去重）：字符串词形 "GRN-0001" + 07 typed
 * 分型 {ref_type:"gate_result", grn:"GRN-0001"}。blob / truth_object 分支与词形外
 * 引用不携带 seq/gate_def 锚，不进资格分母（缺席诚实——资格链是叠加轴，引用位
 * 完整性归既有消费者防线）。
 */
export function normalizeGrnEvidenceRefs(evidenceRefs: unknown): string[] {
  if (!Array.isArray(evidenceRefs)) return [];
  const refs: string[] = [];
  for (const entry of evidenceRefs) {
    let grn: string | null = null;
    if (typeof entry === "string") {
      grn = GRN_FILE_PATTERN.test(`${entry}.json`) ? entry : null;
    } else if (isRecord(entry)) {
      const typed = entry.ref_type === "gate_result" ? asStringOrNull(entry.grn) : null;
      grn = typed !== null && GRN_FILE_PATTERN.test(`${typed}.json`) ? typed : null;
    }
    if (grn !== null && !refs.includes(grn)) refs.push(grn);
  }
  return refs;
}
