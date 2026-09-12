/**
 * negative-history.ts —— 任务内 Context negative history（W1-R1-7 切片；
 * 09-10 PRD REQ-03「Context 含已否定方案/失败原因/约束；未命中保持未知」+
 * AC-02「已否定方案经 Context rollover 可重新获得；重试旧方案须新依据」）。
 *
 * 扩展点裁决（W0 reuse-map REQ-03 行——「沿 task notes 扩展不建第二库」）：
 * - 数据落 task_object payload 自由区字段 `negative_history`（02 信封 payload 层
 *   additionalProperties true——`source_refs` 同款自由区词位：不新增 schema 字段、
 *   不新增 canonical kind、不建第二真值库；「禁止 payload 塞散文」不违——本字段是
 *   结构化条目面非人类叙事，叙事仍走信封 notes_md）；
 * - 写通路 = appendTaskNegativeEntry → applyTransaction(upsert_object) 全信封回程
 *   （TransactionOp 联合零新 op——knowledge 通路层封条「无 knowledge op」同款纪律；
 *   lifecycle/axes 逐字节保留 → 不触发转移矩阵）。每次调用 = 一次否定事件（非幂等
 *   覆盖——ledger.recordException 先例）；数据在 truth 正文层 → 进 content_digest、
 *   被 rev/body_sha256 与投影指纹双重绑定 → rollover/重编译天然可检索（AC-02）；
 * - 投影 = projection.consumeNegativeHistory 读本模块读取面 → advisoryEntries
 *   （[ADVISORY] 分区，永不进 gate 判卷输入，§83.2 铁律 / GOLDEN-L8-3 消费层防线）；
 * - 检索 = searchTaskNegativeHistory（knowledgeQueryTokens 同一实现——词级精确
 *   token 交集，禁子串/等价猜测，P31 纪律）；未命中显式空不虚构。
 *
 * AC-02 语义边界：只做可见性（「曾否定+原因」在投影可见），不做阻断——重复尝试
 * 不被禁止，reason 词形显式携带「重试不被机器禁止，但须新依据（流程纪律）」。
 *
 * 损坏处置（字段面归属）：payload.negative_history 键在场但畸形 = 手改痕迹
 * （本模块是唯一写通路）→ SCHEMA_INVALID fail-closed（readKnowledgeLibrary/
 * readPermitLedger 装载面同款）；键缺席/对象不在册/正文缺失 = 诚实缺席 → []
 * （referencedSourceIds「不猜测」同款——存在性归 01/02 信封层判，本字段面不越权）。
 */
import { GovernanceError, governanceCodeForParseError, GovernedIdParseError } from "./errors.js";
import { readText } from "./io.js";
import { parseGovernedId } from "./id.js";
import { pathsOf, readCurrentSeq, readRawIndex, type StorePaths } from "./paths.js";
import { applyTransaction } from "./store.js";
import { knowledgeQueryTokens } from "./knowledge.js";
import type { Actor, GovernedId, ObjectEnvelopeInput, Store } from "./index.js";

type UnknownRecord = Record<string, unknown>;

/** payload 自由区字段面（02 信封 additionalProperties 词位；source_refs 同例）。 */
export const TASK_NEGATIVE_HISTORY_FIELD = "negative_history" as const;

// ============================================================
// 类型（文件世界 snake_case / 输入世界 camelCase，同 knowledge/ledger 分工）
// ============================================================

/** 登记主体（C5 自报；kernel 不判其真，只登记）。 */
export interface TaskNegativeEntryAudit {
  readonly actor_type: Actor["actorType"];
  readonly actor: string;
  readonly self_attested: boolean;
}

/**
 * 单条已否定方案记录（task payload.negative_history[] 条目）。
 * status 恒 "REJECTED" 字面量类型——类型层面写不出其他生命周期值
 * （本台账是否定事件流水，不存在「未否定的否定记录」形态）。
 */
export interface TaskNegativeEntry {
  /** 曾尝试的方案/路径（检索键承载之一；词级精确 token 化）。 */
  readonly approach: string;
  /** 失败/否定原因（必填——不留原因的否定 = 静默，禁；检索键承载之一）。 */
  readonly reason: string;
  /** 证据引用（宽松词形：TEST.* 或 GRN-* 或 evidence 相对路径；缺席 = null 诚实缺席）。 */
  readonly evidence_ref: string | null;
  /** 恒 "REJECTED"（REJECTED 在 LIFECYCLE/KNOWLEDGE/REVIEW 词表均既有——复用不发明）。 */
  readonly status: "REJECTED";
  readonly recorded_by: TaskNegativeEntryAudit;
  /** store 事件拍采样（A4 禁墙钟；登记时点 readCurrentSeq）。 */
  readonly recorded_at_seq: number;
}

/** appendTaskNegativeEntry 输入。 */
export interface NegativeHistoryAppendInput {
  /** 目标任务（须为 TASK.* canonical governed id 且在册 kind=task_object）。 */
  readonly taskRef: string;
  readonly approach: string;
  readonly reason: string;
  readonly evidenceRef?: string;
  readonly recordedBy: Actor;
}

/** appendTaskNegativeEntry 结果（entry_index/total = 追加位次与登记总量）。 */
export interface NegativeHistoryAppendResult {
  readonly taskRef: string;
  readonly entry: TaskNegativeEntry;
  readonly entryIndex: number;
  readonly totalEntries: number;
  readonly appliedSeq: number;
}

/** 单条检索命中（matched_tokens 即 why-matched，可判卷）。 */
export interface TaskNegativeHistoryHit {
  readonly entry: TaskNegativeEntry;
  /** 条目在 negative_history[] 中的位次（投影 ref 词形 `${taskRef}#negative_history[${i}]` 的 i）。 */
  readonly entryIndex: number;
  readonly matchedTokens: readonly string[];
}

// ============================================================
// 读取（纯读；CLI search 与 projection 消费共用语义）
// ============================================================

/**
 * 读取任务内已否定方案清单（纯读零写入）。
 * - 索引缺席 / 对象不在册 / 非 task_object / 正文缺失或不可解析 / 字段缺席 → []
 *   （诚实缺席不猜测——referencedSourceIds 同款：对象存在性归信封层判）；
 * - 字段在场但畸形 → SCHEMA_INVALID fail-closed（手改痕迹显性暴露——本模块是唯一
 *   写通路，畸形只可能来自手改；readKnowledgeLibrary 装载面同款纪律）。
 */
export function readTaskNegativeHistory(
  paths: StorePaths,
  taskRef: string,
): readonly TaskNegativeEntry[] {
  const raw = readRawIndex(paths);
  if (raw === null) return [];
  const objects = raw.objects;
  if (!Array.isArray(objects)) return [];
  const row = objects.find(
    (candidate): candidate is UnknownRecord =>
      typeof candidate === "object" && candidate !== null &&
      (candidate as UnknownRecord).id === taskRef,
  );
  if (row === undefined) return [];
  if (row.kind !== "task_object") return [];
  const bodyRef = row.body_ref;
  if (typeof bodyRef !== "string" || bodyRef.length === 0) return [];
  const text = readText(`${paths.pomasterDir}/${bodyRef}`);
  if (text === null) return [];
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return [];
  const payload = (body as UnknownRecord).payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return [];
  const field = (payload as UnknownRecord)[TASK_NEGATIVE_HISTORY_FIELD];
  if (field === undefined) return [];
  return validateEntries(field, taskRef);
}

/** 字段面整批校验（非数组 → 畸形；逐条目 validateEntry）。 */
function validateEntries(field: unknown, taskRef: string): readonly TaskNegativeEntry[] {
  if (!Array.isArray(field)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `任务 ${taskRef} 的 payload.${TASK_NEGATIVE_HISTORY_FIELD} 畸形（在场但非数组——手改痕迹，禁静默当无记录）`,
      `从 git 恢复该正文；登记走 kernel appendTaskNegativeEntry（唯一写通路），禁止手改 payload 字段`,
      { taskRef, field: TASK_NEGATIVE_HISTORY_FIELD },
    );
  }
  return field.map((entry, index) => validateEntry(entry, taskRef, index));
}

/** 单条目校验（六字段逐键；任一畸形 SCHEMA_INVALID 且带位次路标）。 */
function validateEntry(candidate: unknown, taskRef: string, index: number): TaskNegativeEntry {
  const label = `${taskRef} payload.${TASK_NEGATIVE_HISTORY_FIELD}[${index}]`;
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw schemaInvalid(`${label} 畸形（条目须为对象）`, { taskRef, index });
  }
  const record = candidate as UnknownRecord;
  const approach = record.approach;
  const reason = record.reason;
  const evidenceRef = record.evidence_ref;
  const status = record.status;
  const recordedBy = record.recorded_by;
  const recordedAtSeq = record.recorded_at_seq;
  if (typeof approach !== "string" || approach.trim().length === 0) {
    throw schemaInvalid(`${label}.approach 缺失或为空（曾尝试的方案必填——检索键承载）`, { taskRef, index });
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw schemaInvalid(`${label}.reason 缺失或为空（失败原因必填——不留原因的否定 = 静默）`, { taskRef, index });
  }
  if (evidenceRef !== null && (typeof evidenceRef !== "string" || evidenceRef.trim().length === 0)) {
    throw schemaInvalid(`${label}.evidence_ref 须为非空字符串或 null（缺席 = null 诚实缺席）`, { taskRef, index });
  }
  if (status !== "REJECTED") {
    throw schemaInvalid(`${label}.status 非法（negative history 是否定事件流水，恒 REJECTED）`, { taskRef, index });
  }
  if (typeof recordedBy !== "object" || recordedBy === null || Array.isArray(recordedBy)) {
    throw schemaInvalid(`${label}.recorded_by 缺失（C5 主体留痕必填）`, { taskRef, index });
  }
  const audit = recordedBy as UnknownRecord;
  if (
    typeof audit.actor_type !== "string" ||
    typeof audit.actor !== "string" ||
    audit.actor.length === 0 ||
    typeof audit.self_attested !== "boolean"
  ) {
    throw schemaInvalid(`${label}.recorded_by 畸形（actor_type/actor/self_attested 三键契约）`, { taskRef, index });
  }
  if (typeof recordedAtSeq !== "number" || !Number.isInteger(recordedAtSeq) || recordedAtSeq < 0) {
    throw schemaInvalid(`${label}.recorded_at_seq 须为 ≥0 整数（A4 store 事件拍采样）`, { taskRef, index });
  }
  return {
    approach,
    reason,
    evidence_ref: evidenceRef as string | null,
    status: "REJECTED",
    recorded_by: {
      actor_type: audit.actor_type as Actor["actorType"],
      actor: audit.actor as string,
      self_attested: audit.self_attested as boolean,
    },
    recorded_at_seq: recordedAtSeq,
  };
}

function schemaInvalid(message: string, details: UnknownRecord): GovernanceError {
  return new GovernanceError(
    "SCHEMA_INVALID",
    message,
    "从 git 恢复该正文；登记走 kernel appendTaskNegativeEntry（唯一写通路），禁止手改 payload 字段",
    details,
  );
}

// ============================================================
// 录入（唯一写通路：applyTransaction upsert_object 全信封回程）
// ============================================================

/**
 * 登记一条已否定方案（唯一写通路；每次调用 = 一次否定事件，非幂等覆盖）。
 *
 * 流程：NOT_CONFIGURED 守卫 → taskRef 词形闸（TASK.* 前缀）→ 在册检查（OBJECT_NOT_FOUND）
 * → kind 闸（非 task_object SCHEMA_INVALID）→ 读正文 + 校验既有字段面 → 合并条目
 * → 信封重建（snake→camel 逐字段映射，除 payload 外逐字段原样保留）→
 * applyTransaction(upsert_object)（lifecycle/axes 不变——不触发转移矩阵，无需
 * authorityRef）。journal TX_APPLIED 留痕（changedObjectIds 含目标 task）。
 *
 * 语义边界（AC-02）：本通路不禁止任何后续尝试——否定是「曾否定+原因」的事实登记，
 * 重试是否被允许由流程纪律裁决（投影 reason 词形显式携带该提示），kernel 不新增阻断。
 */
export async function appendTaskNegativeEntry(
  store: Store,
  input: NegativeHistoryAppendInput,
): Promise<NegativeHistoryAppendResult> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir: store.rootDir },
    );
  }
  assertTaskRef(input.taskRef);

  const raw = readRawIndex(paths);
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: store.rootDir },
    );
  }
  const objects = raw.objects;
  const row = Array.isArray(objects)
    ? objects.find(
        (candidate): candidate is UnknownRecord =>
          typeof candidate === "object" && candidate !== null &&
          (candidate as UnknownRecord).id === input.taskRef,
      )
    : undefined;
  if (row === undefined) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `任务不在册：${input.taskRef}（truth-index 无此 id——negative history 绑定在册 task_object）`,
      "先经 create/change 通路落 TASK.* 对象（或核对 id 词形）；pomaster inspect <task-id> 查在册对象",
      { taskRef: input.taskRef },
    );
  }
  if (row.kind !== "task_object") {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${input.taskRef} kind=${String(row.kind)} 非 task_object（negative history 是任务内台账，只承载 task payload）`,
      "核对目标 id；change_object 等其他 kind 的否定语义不在本字段面（禁跨 kind 借位）",
      { taskRef: input.taskRef, kind: row.kind },
    );
  }
  const bodyRef = row.body_ref;
  if (typeof bodyRef !== "string" || bodyRef.length === 0) {
    throw schemaInvalid(`${input.taskRef} 索引行缺 body_ref（索引/正文失配——从 git 恢复）`, {
      taskRef: input.taskRef,
    });
  }
  const bodyText = readText(`${paths.pomasterDir}/${bodyRef}`);
  if (bodyText === null) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `${input.taskRef} 正文缺失：truth/objects/${bodyRef}（索引在册而正文不在——D24 漂移）`,
      "从 git 恢复正文文件；写入路径禁对缺失正文静默重建（会伪造 rev 谱系）",
      { taskRef: input.taskRef, body_ref: bodyRef },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${input.taskRef} 正文不可解析（损坏或手改）`,
      "从 git 恢复该正文；写通路需全信封回程，损坏正文不可静默当空壳",
      { taskRef: input.taskRef, cause: String(error) },
    );
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw schemaInvalid(`${input.taskRef} 正文根须为对象`, { taskRef: input.taskRef });
  }
  const bodyRecord = body as UnknownRecord;
  const payload = bodyRecord.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw schemaInvalid(`${input.taskRef} payload 缺失或非对象（02 信封 payload 必填）`, {
      taskRef: input.taskRef,
    });
  }
  const payloadRecord = payload as UnknownRecord;
  const existingField = payloadRecord[TASK_NEGATIVE_HISTORY_FIELD];
  const existing =
    existingField === undefined ? [] : validateEntries(existingField, input.taskRef);

  const approach = requireNonEmpty(input.approach, "approach", input.taskRef);
  const reason = requireNonEmpty(input.reason, "reason", input.taskRef);
  const evidenceRef =
    input.evidenceRef === undefined || input.evidenceRef.trim().length === 0
      ? null
      : input.evidenceRef.trim();
  const entry: TaskNegativeEntry = {
    approach,
    reason,
    evidence_ref: evidenceRef,
    status: "REJECTED",
    recorded_by: {
      actor_type: input.recordedBy.actorType,
      actor: input.recordedBy.actor,
      self_attested: input.recordedBy.selfAttested,
    },
    recorded_at_seq: currentSeq,
  };
  const nextHistory = [...existing, entry];
  const envelope = envelopeFromBody(
    bodyRecord,
    { ...payloadRecord, [TASK_NEGATIVE_HISTORY_FIELD]: nextHistory },
    input.taskRef,
  );
  const result = await applyTransaction(store, {
    ops: [{ op: "upsert_object", envelope }],
  });
  return {
    taskRef: input.taskRef,
    entry,
    entryIndex: nextHistory.length - 1,
    totalEntries: nextHistory.length,
    appliedSeq: result.appliedSeq,
  };
}

/** taskRef 词形闸（assertKnowledgeId 同款：parse 失败映射码位；前缀须 TASK）。 */
function assertTaskRef(taskRef: string): void {
  let parsed;
  try {
    parsed = parseGovernedId(taskRef);
  } catch (error) {
    if (error instanceof GovernedIdParseError) {
      throw new GovernanceError(
        governanceCodeForParseError(error),
        `taskRef 词形非法：${error.message}`,
        "id 须为 TASK.* canonical governed id（A5 closed-world）；TASK-0087 等 legacy 词形经 resolveAlias 收编（TASK-0087→TASK.T0087）",
        { taskRef },
      );
    }
    throw error;
  }
  if (parsed.prefix !== "TASK") {
    throw new GovernanceError(
      "FATAL_UNKNOWN_PREFIX",
      `taskRef 前缀须为 TASK：${taskRef}（${parsed.prefix}.* 是其他对象面）`,
      "negative history 绑定任务内台账（task payload 自由区字段面）；非 TASK.* 目标不在本通路射程",
      { taskRef, prefix: parsed.prefix },
    );
  }
}

function requireNonEmpty(value: string, field: string, taskRef: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 为空（${taskRef}：不留原因的否定 = 静默状态，禁）`,
      "给出曾尝试的方案（approach）与失败/否定原因（reason）——两者是检索键承载（REQ-03 检索判据）",
      { taskRef, field },
    );
  }
  return trimmed;
}

// ============================================================
// 信封重建（snake 正文 → camel ObjectEnvelopeInput；除 payload 外逐字段原样保留）
// ============================================================

/**
 * 02 正文（snake_case）→ upsert 输入信封（camelCase）逐字段回程映射。要求键位
 * 逐一对应 applyUpsertObject 的落盘组装（store.ts body 组装段的镜像）——既有字段
 * 全部原样保留（rev 由事务重排），唯一变更 = payload（negative_history 合并后）。
 * 必填键缺失/畸形 = 手改痕迹 → SCHEMA_INVALID（写通路 fail-closed，不静默重建）。
 */
function envelopeFromBody(
  body: UnknownRecord,
  nextPayload: UnknownRecord,
  taskRef: string,
): ObjectEnvelopeInput {
  const missing = (field: string): GovernanceError =>
    schemaInvalid(`${taskRef} 正文缺 ${field}（02 信封必填键——手改痕迹，从 git 恢复）`, {
      taskRef,
      field,
    });
  const id = body.id;
  const kind = body.kind;
  const axisProfile = body.axis_profile;
  const titleZh = body.title_zh;
  const origin = body.origin;
  if (typeof id !== "string") throw missing("id");
  if (typeof kind !== "string") throw missing("kind");
  if (typeof axisProfile !== "string") throw missing("axis_profile");
  if (typeof titleZh !== "string") throw missing("title_zh");
  if (typeof origin !== "string") throw missing("origin");
  const axesRaw = body.axes;
  if (typeof axesRaw !== "object" || axesRaw === null || Array.isArray(axesRaw)) throw missing("axes");
  const axes = axesRaw as UnknownRecord;
  for (const axis of ["lifecycle", "confidence", "evidence", "change"] as const) {
    if (typeof axes[axis] !== "string") throw missing(`axes.${axis}`);
  }
  const authorityRaw = body.authority;
  if (typeof authorityRaw !== "object" || authorityRaw === null || Array.isArray(authorityRaw)) {
    throw missing("authority");
  }
  const authority = authorityRaw as UnknownRecord;
  if (typeof authority.owner !== "string") throw missing("authority.owner");
  const delegatesRaw = Array.isArray(authority.delegates) ? authority.delegates : [];
  const authorityBlock: ObjectEnvelopeInput["authority"] = {
    owner: authority.owner as string,
    delegates: delegatesRaw.map((delegate) => {
      const row = delegate as UnknownRecord;
      return {
        role: String(row.role ?? ""),
        ...(Array.isArray(row.required_for) ? { requiredFor: row.required_for as readonly string[] } : {}),
      };
    }),
    ...(typeof authority.write_policy === "string" ? { writePolicy: authority.write_policy as never } : {}),
    ...(typeof authority.escalation_hint === "string" ? { escalationHint: authority.escalation_hint } : {}),
  };
  const producerRaw = body.producer;
  const producerBlock =
    typeof producerRaw === "object" && producerRaw !== null && !Array.isArray(producerRaw)
      ? {
          producerId: String((producerRaw as UnknownRecord).producer_id ?? ""),
          viewsMaintained: Array.isArray((producerRaw as UnknownRecord).views_maintained)
            ? (((producerRaw as UnknownRecord).views_maintained as readonly string[]) ?? [])
            : [],
        }
      : undefined;
  const supersedesRaw = body.supersedes;
  const supersedesBlock =
    typeof supersedesRaw === "object" && supersedesRaw !== null && !Array.isArray(supersedesRaw)
      ? {
          id: (supersedesRaw as UnknownRecord).id as GovernedId,
          reasonShort: String((supersedesRaw as UnknownRecord).reason_short ?? ""),
        }
      : null;
  const sourcesRaw = Array.isArray(body.sources) ? body.sources : undefined;
  return {
    id: id as GovernedId,
    kind: kind as ObjectEnvelopeInput["kind"],
    axisProfile: axisProfile as string,
    axes: {
      lifecycle: axes.lifecycle as never,
      confidence: axes.confidence as never,
      evidence: axes.evidence as never,
      change: axes.change as never,
    },
    titleZh: titleZh as string,
    authority: authorityBlock,
    origin: origin as never,
    ...(producerBlock !== undefined ? { producer: producerBlock } : {}),
    payload: nextPayload,
    ...(Array.isArray(body.aliases) ? { aliases: body.aliases as readonly string[] } : {}),
    ...(supersedesBlock !== null ? { supersedes: supersedesBlock } : {}),
    ...(typeof body.successor_ref === "string" ? { successorRef: body.successor_ref as GovernedId } : {}),
    ...(Array.isArray(body.denominator_refs)
      ? {
          denominatorRefs: (body.denominator_refs as UnknownRecord[]).map((ref) => ({
            id: String(ref.id ?? "") as GovernedId,
            versionSeen: Number(ref.version_seen ?? 0),
          })),
        }
      : {}),
    ...(Array.isArray(body.permits_active) ? { permitsActive: body.permits_active as readonly string[] } : {}),
    ...(sourcesRaw !== undefined
      ? {
          sources: sourcesRaw.map((source) => {
            const row = source as UnknownRecord;
            return {
              type: row.type as never,
              ref: String(row.ref ?? ""),
              capturedBy: String(row.captured_by ?? ""),
              ...(row.locator !== undefined ? { locator: row.locator as UnknownRecord } : {}),
              ...(row.pin !== undefined ? { pin: row.pin as never } : {}),
            };
          }),
        }
      : {}),
    ...(body.notes_md !== undefined ? { notesMd: body.notes_md as string | null } : {}),
  };
}

// ============================================================
// 检索（§83.8「检索而不是全量注入」同款纪律的 negative history 面）
// ============================================================

/**
 * 已否定方案检索（词级精确 token 交集，禁子串/等价猜测——knowledgeQueryTokens/
 * searchKnowledge 同一实现同一语义，P31 纪律）。检索键 = entry.approach + entry.reason
 * （否定记录的「方案」与「为何失败」是重新评估时的两问）。空 query（token 化后为空）
 * = 列全部（清单语义——CLI search 无 query 时呈现全部登记）；命中按 entryIndex 升序
 * （登记顺序 = 时间谱序，确定性可重放 D24）；matchedTokens 字典序。
 */
export function searchTaskNegativeHistory(
  entries: readonly TaskNegativeEntry[],
  query: string,
): readonly TaskNegativeHistoryHit[] {
  const queryTokens = new Set<string>(knowledgeQueryTokens(query));
  const listAll = queryTokens.size === 0;
  const hits: TaskNegativeHistoryHit[] = [];
  entries.forEach((entry, entryIndex) => {
    const keyTokens = new Set<string>();
    for (const piece of [entry.approach, entry.reason]) {
      for (const token of knowledgeQueryTokens(piece)) keyTokens.add(token);
    }
    const matched = listAll ? [] : [...queryTokens].filter((token) => keyTokens.has(token)).sort();
    if (listAll || matched.length > 0) {
      hits.push({ entry, entryIndex, matchedTokens: matched });
    }
  });
  return hits;
}
