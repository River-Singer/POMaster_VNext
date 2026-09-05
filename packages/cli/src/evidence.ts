/**
 * evidence.ts —— 证据平面（evidence/runs + evidence/claims）收编共享件（G4+G6）。
 *
 * 设计契约：docs/eight-beat-carriers-design.md §4.4（pending 判定与 canonical 重放）。
 * 同一判据同时服务 compact 批量扫描与 record 显式单条路径（「同一函数，不两套」）。
 *
 * 纪律落点：
 * - 「pending ⇔ 磁盘字节 ≠ kernel canonical 重放字节」：canonical 形态完全由 kernel 决定
 *   （复用 kernel gateResultToSnake 输出结构 + kernel 落盘序列化器 JSON.stringify(…,null,2)
 *   + "\n"，与 store.applyRecordGateRun / applyRecordClaim 的组装逐键同构），本包不二次发明；
 * - ran_at_seq 是 gate 运行时采样的 CLAIMED 事实：入账沿用不改写（把 3 改成当前 seq =
 *   伪造采样点，违反 C5）；文件未携带时才由本通路采样 store 当前 seq（设计 §4.2 定义 2，
 *   恒 ran_at_seq < appliedSeq，倒挂不再新增）；存量倒挂如实保留 + ahead 显式披露；
 * - grn/clm 由调用方（GateRunner/record 通路）分配：注入覆盖，永不信任文件自报（C5 同一线）；
 * - tool/tool_version/metric_dialect 三件套随 kernel GateResult 契约承载（P12a）：canonical
 *   形态内嵌保留（03 required + 07 inline $ref 03），不再剥离；pre-canonical 超集
 *   tool_snapshot 块折叠入内嵌三字段（值经优先级链解析后落地 inline，不另存第二套格式）；
 *   metric_dialect 无任何诚实缺省——override > tool_snapshot > 内嵌，三源皆缺席即 fail-closed
 *   malformed（强制上报 + 不伪造口径）；items[] 违规明细随 kernel GateResult 契约承载
 *   （scopeNote/items/itemsTruncated 同批，见 P12 MAJOR 修复）：canonical 形态落盘保留，
 *   畸形载荷 FATAL SCHEMA_INVALID（禁静默丢留痕位）；
 * - claims 平面三分支（设计坑 4）：已带独立判定（VERIFIED/PARTIALLY_VERIFIED/REJECTED）的
 *   文件 → skipped_adjudicated，record_claim 通道无权覆写判定（D20：声称方不可自填
 *   VERIFIED），绝不把判定打回 UNVERIFIED 造成数据倒退；
 * - 畸形证据 fail-closed 显式呈现：落 malformed 并镜像信封 warnings，不静默跳过（compact
 *   不阻断本轮合法 truth 更新）；record 单条路径同一判据 → exit 1。
 * - subject 绑定机复核（N5）：入账层显式归属声明逐条过闭世界文法 + store 存在性，
 *   拒者不入账只留痕、通过者随事务注记落 journal（resolveSubjectBindings）。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  type Actor,
  type ClaimRecordInput,
  type EvidenceArtifactRefInput,
  type GateResult,
  type GateRunContext,
  type TransactionOp,
  artifactRefsToSnake,
  gateResultToSnake,
  normalizeGateResult,
  parseGovernedId,
  sha256OfCanonical,
} from "@pomaster/kernel";
import {
  ACTOR_TYPE_VALUES,
  RUN_TRIGGER_VALUES,
  type RunTriggerValue,
} from "@pomaster/schemas";
import { CLI_VERSION } from "./cli-info.js";

type UnknownRecord = Record<string, unknown>;

// ============================================================
// 词形与常量
// ============================================================

/** evidence 平面文件名词形（平面分母只认 GRN-n.json / CLM-n.json）。 */
export const GRN_FILE_PATTERN = /^GRN-[0-9]+\.json$/;
export const CLM_FILE_PATTERN = /^CLM-[0-9]+\.json$/;
const GRN_REF_PATTERN = /^GRN-[0-9]+$/;

/** 畸形证据的统一信封码位（compact 镜像为 warnings；record 单条 = exit 1）。 */
export const EVIDENCE_MALFORMED_CODE = "EVIDENCE_MALFORMED";

/**
 * ingested.action 词形（x-vocab-source: vocab-lock presentation_axes.ingest_actions——PR-0009 收编；设计 §4.3 逐字）：
 * runs：canonicalized（入账并覆写为 canonical 形态）/ already_canonical（字节已等价，跳过）；
 * claims：recorded / already_canonical / skipped_adjudicated（已带独立判定，无权覆写）。
 */
export const RUN_INGEST_ACTIONS = ["canonicalized", "already_canonical"] as const;
export type RunIngestAction = (typeof RUN_INGEST_ACTIONS)[number];
export const CLAIM_INGEST_ACTIONS = [
  "recorded",
  "already_canonical",
  "skipped_adjudicated",
] as const;
export type ClaimIngestAction = (typeof CLAIM_INGEST_ACTIONS)[number];

/** verification 判定四值中的「已独立判定」子集（record_claim 通道无权覆写）。 */
const ADJUDICATED_VERIFICATION_VERDICTS = [
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "REJECTED",
] as const;

/** tool/tool_version 缺省值（自报如实：运行主体就是 CLI 本进程）。 */
export const DEFAULT_INGEST_TOOL = "pomaster-cli" as const;
export const DEFAULT_INGEST_TOOL_VERSION = CLI_VERSION;

/** kernel 落盘序列化器（store 各处统一：两空格缩进 + 结尾换行）。 */
export function serializeKernel(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** 畸形证据条目（compact 的 ingested.malformed 成员；镜像为信封 warnings）。 */
export interface EvidenceMalformed {
  readonly path: string;
  readonly code: typeof EVIDENCE_MALFORMED_CODE;
  readonly detail: string;
}

function malformedOf(relPath: string, detail: string): EvidenceMalformed {
  return { path: relPath, code: EVIDENCE_MALFORMED_CODE, detail };
}

/** GovernanceError → 畸形 detail（保留码位便于人读定位；剥离装饰前后缀）。 */
function kernelDetail(err: unknown): string {
  if (err instanceof Error && err.name === "GovernanceError") {
    const governance = err as GovernanceLike;
    let message = err.message;
    const prefix = `[${governance.code}] `;
    if (typeof governance.code === "string" && message.startsWith(prefix)) {
      message = message.slice(prefix.length);
    }
    return `${String(governance.code)}: ${message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

interface GovernanceLike {
  readonly code?: unknown;
}

// ============================================================
// 平面扫描（确定性：文件名字典序；目录缺席 = 零记录的合法空平面）
// ============================================================

export function listPlaneFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

/**
 * GRN/CLM 缺省分配：现有最大序号 +1，4 位零填充（GRN-0002；>9999 自然位数——
 * padStart 不截断）。设计 §4.4。
 */
export function allocateEvidenceRef(dir: string, prefix: "GRN" | "CLM"): string {
  let max = 0;
  for (const name of listPlaneFiles(dir)) {
    const match = new RegExp(`^${prefix}-([0-9]+)\\.json$`).exec(name);
    if (match !== null) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > max) max = value;
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

// ============================================================
// runs 平面：解析 + 归一上下文解析 + canonical 字节重放
// ============================================================

export interface ParsedRunFile {
  /**
   * normalizeGateResult 消费的 CLAIMED 值：gate_result.result 内嵌（kernel canonical 07
   * 形态）或整个文件（pre-canonical 夹具 GateResult 直落顶层）——与 reconcile 的读取
   * 规则同一条线（设计 §4.4）。
   */
  readonly rawValue: UnknownRecord;
  /** 外层信封 trigger 是否在场（canonical 07 才有 trigger 块）。 */
  readonly envelopeTriggerPresent: boolean;
  /** 外层信封 trigger.type 原始值（未解析；词表校验在 resolveRunContext）。 */
  readonly envelopeTriggerType: unknown;
  /** 自报 ran_at_seq 原始值（CLAIMED 采样事实；undefined/null = 未携带 → 通路采样）。 */
  readonly ranAtSeqRaw: unknown;
  /** 外层 tool_snapshot 字段（超集快照；优先于载荷内嵌 tool）。 */
  readonly snapshotTool: string | null;
  readonly snapshotToolVersion: string | null;
  readonly snapshotMetricDialect: string | null;
  /** 载荷内嵌 tool/tool_version/metric_dialect（三件套，canonical 形态原位保留）。 */
  readonly innerTool: string | null;
  readonly innerToolVersion: string | null;
  readonly innerMetricDialect: string | null;
  /** trust.asserted 自报是否在场（C5 孪生；在场时必须可归因）。 */
  readonly assertedPresent: boolean;
  /** trust.asserted.declared_by（自报归因主体；snake/camel 双拼兼容）。 */
  readonly assertedDeclaredBy: unknown;
  /** 外层信封 execution_id 原始值（P20 执行身份贯穿；undefined/null = 未携带 → 键缺席）。 */
  readonly executionIdRaw: unknown;
  /**
   * 外层信封 artifact_refs 原始值（P0.5-2 存在性绑定；undefined/null = 未携带 → 键缺席，
   * 存量 GRN 字节兼容）。词形解析在 resolveArtifactRefs。
   */
  readonly artifactRefsRaw: unknown;
}

export type ParseFailure = { readonly error: string };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(value: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    const hit = value[key];
    if (hit !== undefined && hit !== null) return hit;
  }
  return undefined;
}

export function parseRunFile(bytes: string): ParsedRunFile | ParseFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch (err) {
    return { error: `JSON 无法解析：${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isRecord(parsed)) return { error: "run 记录不是 JSON 对象" };
  const inline = parsed.gate_result;
  const hasInline = isRecord(inline) && isRecord((inline as UnknownRecord).result);
  const rawValue = hasInline ? ((inline as UnknownRecord).result as UnknownRecord) : parsed;

  const triggerRaw = parsed.trigger;
  const snapshot = isRecord(parsed.tool_snapshot) ? (parsed.tool_snapshot as UnknownRecord) : undefined;
  const trust = isRecord(rawValue.trust) ? (rawValue.trust as UnknownRecord) : undefined;
  const asserted = isRecord(trust?.asserted) ? (trust?.asserted as UnknownRecord) : undefined;

  return {
    rawValue,
    envelopeTriggerPresent: triggerRaw !== undefined && triggerRaw !== null,
    envelopeTriggerType: isRecord(triggerRaw) ? (triggerRaw as UnknownRecord).type : undefined,
    ranAtSeqRaw: pick(rawValue, "ran_at_seq", "ranAtSeq") ?? pick(parsed, "ran_at_seq"),
    snapshotTool: typeof snapshot?.tool === "string" ? snapshot.tool : null,
    snapshotToolVersion: typeof snapshot?.tool_version === "string" ? snapshot.tool_version : null,
    snapshotMetricDialect: typeof snapshot?.metric_dialect === "string" ? snapshot.metric_dialect : null,
    innerTool: typeof rawValue.tool === "string" ? rawValue.tool : null,
    innerToolVersion: typeof rawValue.tool_version === "string" ? rawValue.tool_version : null,
    innerMetricDialect: typeof rawValue.metric_dialect === "string" ? rawValue.metric_dialect : null,
    assertedPresent: asserted !== undefined,
    assertedDeclaredBy: asserted === undefined ? undefined : pick(asserted, "declared_by", "declaredBy"),
    executionIdRaw: pick(parsed, "execution_id", "executionId"),
    artifactRefsRaw: parsed["artifact_refs"],
  };
}

/** tool_version 的 semver 词形（镜像 kernel assertRunContext 的校验，防上下文分叉）。 */
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$/;

export interface RunContextSource {
  /** 显式覆盖（record --trigger / --tool / --tool-version / --metric-dialect；compact 无覆盖）。 */
  readonly overrideTrigger?: string;
  readonly overrideTool?: string;
  readonly overrideToolVersion?: string;
  readonly overrideMetricDialect?: string;
  /** 文件未携带 ran_at_seq 时的采样点（store 当前 seq；设计 §4.2 定义 2）。 */
  readonly sampledRanAtSeq: number;
}

export type RunContextResolution =
  | {
      readonly context: GateRunContext;
      readonly ranAtSeq: number;
      /** true = ran_at_seq 沿用文件自报（CLAIMED 事实）；false = 本通路采样。 */
      readonly ranAtSeqClaimed: boolean;
    }
  | { readonly failCode: string; readonly detail: string };

/**
 * 归一上下文解析（resolve 一次，normalize 与 canonical 重放共用）：
 * - ran_at_seq：文件自报沿用（沿用不改写，C5）；未携带 → sampledRanAtSeq；
 * - trigger：显式覆盖 > 信封 trigger.type（词表内沿用 / 词表外 fail-closed）> 缺省 on_demand；
 * - tool/toolVersion：显式覆盖 > tool_snapshot > 载荷内嵌 > 缺省 pomaster-cli/CLI_VERSION
 *   （CLI 即入账工具，缺省是诚实归属，非伪造）；
 * - metric_dialect：显式覆盖 > tool_snapshot > 载荷内嵌 > **fail-closed 拒收**——度量口径
 *   是原始测量属性，CLI 未参与测量无诚实缺省可填（强制上报 + 不伪造，03 schema minLength 1）。
 */
export function resolveRunContext(
  parsed: ParsedRunFile,
  source: RunContextSource,
): RunContextResolution {
  let ranAtSeq: number;
  let ranAtSeqClaimed: boolean;
  if (parsed.ranAtSeqRaw !== undefined) {
    const value = parsed.ranAtSeqRaw;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return {
        failCode: "SCHEMA_INVALID",
        detail: `自报 ran_at_seq 非法（须 ≥0 整数）：${String(value)}——CLAIMED 采样事实沿用不改写（C5）；修复文件或删除该字段改由通路采样`,
      };
    }
    ranAtSeq = value;
    ranAtSeqClaimed = true;
  } else {
    ranAtSeq = source.sampledRanAtSeq;
    ranAtSeqClaimed = false;
  }

  let trigger: RunTriggerValue;
  if (source.overrideTrigger !== undefined) {
    if (!(RUN_TRIGGER_VALUES as readonly string[]).includes(source.overrideTrigger)) {
      return {
        failCode: "VOCAB_INVALID_VALUE",
        detail: `trigger "${source.overrideTrigger}" 是词表外值（run_trigger 五值闭包：${RUN_TRIGGER_VALUES.join(" / ")}；扩值走词汇表 PR）`,
      };
    }
    trigger = source.overrideTrigger as RunTriggerValue;
  } else if (parsed.envelopeTriggerPresent) {
    const value = parsed.envelopeTriggerType;
    if (typeof value !== "string" || !(RUN_TRIGGER_VALUES as readonly string[]).includes(value)) {
      return {
        failCode: "VOCAB_INVALID_VALUE",
        detail: `信封 trigger.type "${String(value)}" 是词表外值（run_trigger 五值闭包：${RUN_TRIGGER_VALUES.join(" / ")}）`,
      };
    }
    trigger = value as RunTriggerValue;
  } else {
    trigger = "on_demand";
  }

  const tool = source.overrideTool ?? parsed.snapshotTool ?? parsed.innerTool ?? DEFAULT_INGEST_TOOL;
  if (tool.length === 0) {
    return { failCode: EVIDENCE_MALFORMED_CODE, detail: "tool 解析为空字符串（执行工具标识必填）" };
  }
  const toolVersion =
    source.overrideToolVersion ?? parsed.snapshotToolVersion ?? parsed.innerToolVersion ?? DEFAULT_INGEST_TOOL_VERSION;
  if (!SEMVER_PATTERN.test(toolVersion)) {
    return {
      failCode: "SCHEMA_INVALID",
      detail: `tool_version 须为 semver：${toolVersion}（工具版本钉死口径，C6 Overhead 双轨归因依赖版本可辨识）`,
    };
  }

  const metricDialect =
    source.overrideMetricDialect ?? parsed.snapshotMetricDialect ?? parsed.innerMetricDialect;
  if (
    typeof metricDialect !== "string" ||
    metricDialect.length === 0 ||
    metricDialect.length > 128
  ) {
    return {
      failCode: EVIDENCE_MALFORMED_CODE,
      detail:
        `metric_dialect 缺失（度量口径必带——「强制上报工具名+版本+度量口径」，03 schema required；` +
        `CLI 不伪造口径）。请在 --from 文件内嵌 metric_dialect / tool_snapshot.metric_dialect，或以 --metric-dialect 显式声明（如 coverage:lines / ui_text:carrier_file_count）`,
    };
  }

  return {
    context: { ranAtSeq, trigger, tool, toolVersion, metricDialect },
    ranAtSeq,
    ranAtSeqClaimed,
  };
}

/**
 * trust.asserted 自报的归因主体解析（C5：自报孪生必须可归因——declared_by 缺失 =
 * 畸形，不冒充已归因）。asserted 不在场时返回 undefined（占位 claimedBy 不进输出）。
 */
export function resolveAssertedClaimedBy(
  parsed: ParsedRunFile,
): { readonly claimedBy: Actor | undefined } | { readonly detail: string } {
  if (!parsed.assertedPresent) return { claimedBy: undefined };
  const raw = parsed.assertedDeclaredBy;
  if (!isRecord(raw)) {
    return {
      detail:
        "trust.asserted 自报在场但缺 declared_by（自报孪生必须可归因，C5）——补 declared_by{actor_type, actor, self_attested} 后重试",
    };
  }
  const actorType = pick(raw, "actor_type", "actorType");
  const actor = pick(raw, "actor");
  const selfAttested = pick(raw, "self_attested", "selfAttested");
  if (
    typeof actorType !== "string" ||
    !(ACTOR_TYPE_VALUES as readonly string[]).includes(actorType) ||
    typeof actor !== "string" ||
    actor.length === 0
  ) {
    return {
      detail: `trust.asserted.declared_by 形状非法（actor_type ∈ ${ACTOR_TYPE_VALUES.join("/")}，actor 非空）`,
    };
  }
  return {
    claimedBy: {
      actorType: actorType as Actor["actorType"],
      actor,
      selfAttested: selfAttested === undefined ? true : selfAttested === true,
    },
  };
}

/** asserted 不在场时的 claimedBy 占位（normalize 契约要求 Actor；绝不进输出——asserted=null 时 claimedBy 不落盘）。 */
const UNATTRIBUTED_PLACEHOLDER: Actor = {
  actorType: "tool",
  actor: "(unattributed)",
  selfAttested: true,
};

/**
 * 注入 grn 后过 kernel normalizeGateResult（永不信任文件自报：verdict 词表外 /
 * counts 缺失 / notApplicable 缺席 / Q3 违例 → throw，调用方按路径落 malformed 或 exit 1）。
 */
export function normalizeIngestedRun(
  parsed: ParsedRunFile,
  grn: string,
  context: GateRunContext,
  claimedBy: Actor | undefined,
): GateResult {
  const value: UnknownRecord = { ...parsed.rawValue, grn };
  return normalizeGateResult(
    { value, claimedBy: claimedBy ?? UNATTRIBUTED_PLACEHOLDER },
    context,
  );
}

/**
 * canonical 07 run_record 组装（与 kernel store.applyRecordGateRun 逐键同构——
 * record_type / grn / ran_at_seq / trigger / [execution_id] / [artifact_refs] /
 * gate_result{mode, result}；形态由 kernel 决定）。execution_id 仅在携带时落键
 * （P20：缺席=键缺席存量兼容）；artifact_refs 仅在非空时落键（P0.5-2：缺席=键缺席，
 * 存量 GRN 字节兼容），键位在 execution_id 之后、gate_result 之前——与 kernel
 * store.applyRecordGateRun 同位（R1 双写点纪律，映射单源 artifactRefsToSnake）。
 */
export function canonicalRunBytes(
  grn: string,
  trigger: RunTriggerValue,
  result: GateResult,
  executionId?: string | null,
  artifactRefs?: readonly EvidenceArtifactRefInput[],
): string {
  const record: UnknownRecord = {
    record_type: "run",
    grn,
    ran_at_seq: result.ranAtSeq,
    trigger: { type: trigger },
    ...(executionId ? { execution_id: executionId } : {}),
    ...(artifactRefs !== undefined && artifactRefs.length > 0
      ? { artifact_refs: artifactRefsToSnake(artifactRefs) }
      : {}),
    gate_result: { mode: "inline", result: gateResultToSnake(result) },
  };
  return serializeKernel(record);
}

/** AGX 词形（PRD §25.4 例文 AGX-2026-00182；与 kernel EXECUTION_ID_PATTERN 逐字同源）。 */
const EXECUTION_ID_WORDFORM = /^AGX-[0-9]{4}-[0-9]+$/;

/**
 * already_canonical 快路径的执行档案存在性校验（P20 红队发现 2）：快路径零 op 不触发
 * kernel record 校验，手写 canonical 形态文件携带未登记 AGX 曾可绕过（record 通路会
 * 拒、compact 快路径放行——双通路判卷不一致）。现 compact/record 同判卷：文件携带
 * execution_id 键即校验 executions/ 档案在场，缺失 → malformed（fail-closed 显式呈现，
 * 不静默当已收编）。
 */
function missingExecutionArchive(executionsDir: string, executionId: string | null): string | null {
  if (executionId === null) return null;
  if (existsSync(`${executionsDir}/${executionId}.json`)) return null;
  return `EXECUTION_NOT_FOUND: execution_id 未登记（executions/ 档案缺失）：${executionId}（already_canonical 快路径与 record 通路同判卷——身份由 beginExecution 落档，禁自造身份 S1）`;
}

export type ExecutionIdResolution =
  | { readonly executionId: string | null }
  | { readonly fail: string };

/**
 * execution_id 解析（显式覆盖 > 文件自报 > 缺席 null；词形 fail-closed）。
 * 档案存在性校验：record 通路归 kernel record op；already_canonical 快路径在本层
 * 以 missingExecutionArchive 同判卷（P20 红队发现 2——双通路同纪律，禁静默绕过）。
 */
export function resolveExecutionId(
  override: string | undefined,
  raw: unknown,
): ExecutionIdResolution {
  const value = override !== undefined ? override : raw;
  if (value === undefined || value === null) return { executionId: null };
  if (typeof value !== "string" || !EXECUTION_ID_WORDFORM.test(value)) {
    return {
      fail: `execution_id 词形非法（须 AGX-<4位年份>-<序号>，PRD §25.4 例文 AGX-2026-00182）：${String(value)}`,
    };
  }
  return { executionId: value };
}

/**
 * artifact_refs 解析（P0.5-2；外层信封原始值 → kernel 输入形态）。缺席 → 空数组
 * （canonical 重放不落键，存量字节兼容）；在场即逐条严格反解——非 blob 分支
 * （D3=A 收窄：gate_result/truth_object 不收）/ 字段畸形 → fail-closed malformed
 * （kernel record 侧 assertArtifactRefs 会再判，本层先检与 execution_id 同线）。
 */
export function resolveArtifactRefs(
  raw: unknown,
): { readonly refs: readonly EvidenceArtifactRefInput[] } | { readonly fail: string } {
  if (raw === undefined || raw === null) return { refs: [] };
  if (!Array.isArray(raw) || raw.length === 0) {
    return { fail: `artifact_refs 须为非空数组（或整个键缺席）：${JSON.stringify(raw)?.slice(0, 120)}` };
  }
  const refs: EvidenceArtifactRefInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { fail: `artifact_refs 条目形状非法：${JSON.stringify(entry)?.slice(0, 120)}` };
    }
    const record = entry as UnknownRecord;
    if (record["ref_type"] !== "blob") {
      return {
        fail: `artifact_refs 条目非 blob 分支（D3=A 收窄，ref_type 须 "blob"）：${JSON.stringify(record).slice(0, 120)}`,
      };
    }
    const blob = record["blob"];
    if (typeof blob !== "object" || blob === null || Array.isArray(blob)) {
      return { fail: `artifact_refs[].blob 须为对象：${JSON.stringify(record).slice(0, 120)}` };
    }
    const blobRef = blob as UnknownRecord;
    const sha256 = blobRef["sha256"];
    const media = blobRef["media"];
    const byteSize = blobRef["byte_size"];
    const storagePath = blobRef["storage_path"];
    if (typeof sha256 !== "string" || typeof media !== "string" || typeof storagePath !== "string") {
      return { fail: `artifact_refs[].blob 缺 sha256/media/storage_path：${JSON.stringify(blobRef).slice(0, 160)}` };
    }
    if (byteSize !== undefined && (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize < 1)) {
      return { fail: `artifact_refs[].blob.byte_size 须为 ≥1 整数：${String(byteSize)}` };
    }
    refs.push({
      sha256,
      media,
      ...(byteSize !== undefined ? { byteSize } : {}),
      storagePath,
    });
  }
  return { refs };
}

// ============================================================
// runs 平面 pending 判定（compact 批量 + record 单条共用）
// ============================================================

export interface PlannedRun {
  readonly grn: string;
  readonly relPath: string;
  readonly action: RunIngestAction;
  readonly ran_at_seq: number;
  /** action = canonicalized 时携带待入账 op（record_gate_run）。 */
  readonly op?: TransactionOp;
}

/**
 * 单个 run 文件的 pending 判定 + canonical 化计划。任何一步 fail-closed（解析失败 /
 * 词表外 / counts 缺失）→ malformed，不落账。
 */
export function planRunFile(input: {
  readonly fileName: string;
  readonly runsDir: string;
  /** executions/ 档案目录（already_canonical 快路径的执行档案存在性校验——P20 红队发现 2）。 */
  readonly executionsDir: string;
  readonly sampledRanAtSeq: number;
}): { readonly plan: PlannedRun } | { readonly malformed: EvidenceMalformed } {
  const relPath = `evidence/runs/${input.fileName}`;
  if (!GRN_FILE_PATTERN.test(input.fileName)) {
    return {
      malformed: malformedOf(
        relPath,
        "文件名不符合 GRN-n.json 词形，未纳入收编分母（缺席显式；GRN 由通路分配，工具不自造格式）",
      ),
    };
  }
  const grn = input.fileName.slice(0, -".json".length);
  let bytes: string;
  try {
    bytes = readFileSync(`${input.runsDir}/${input.fileName}`, "utf8");
  } catch (err) {
    return { malformed: malformedOf(relPath, `文件不可读：${err instanceof Error ? err.message : String(err)}`) };
  }
  const parsed = parseRunFile(bytes);
  if ("error" in parsed) return { malformed: malformedOf(relPath, parsed.error) };
  const claimedBy = resolveAssertedClaimedBy(parsed);
  if ("detail" in claimedBy) return { malformed: malformedOf(relPath, claimedBy.detail) };
  const resolved = resolveRunContext(parsed, { sampledRanAtSeq: input.sampledRanAtSeq });
  if ("failCode" in resolved) {
    return { malformed: malformedOf(relPath, `${resolved.failCode}: ${resolved.detail}`) };
  }
  let result: GateResult;
  try {
    result = normalizeIngestedRun(parsed, grn, resolved.context, claimedBy.claimedBy);
  } catch (err) {
    return { malformed: malformedOf(relPath, kernelDetail(err)) };
  }
  // execution_id 贯穿（P20）：文件自报词形在本层先检（already_canonical 快路径
  // 不触发 kernel record 校验——禁静默持久损坏词形）；档案存在性归 kernel record op。
  const executionIdResolution = resolveExecutionId(undefined, parsed.executionIdRaw);
  if ("fail" in executionIdResolution) {
    return { malformed: malformedOf(relPath, executionIdResolution.fail) };
  }
  const executionId = executionIdResolution.executionId;
  // artifact_refs 贯穿（P0.5-2）：文件自报在本层先反解（blob 分支收窄，畸形
  // fail-closed）；canonical 重放携带同键——带 refs 的存量 canonical 文件不因
  // 重放丢 refs（重入账不得静默剥掉绑定字段）。
  const artifactRefsResolution = resolveArtifactRefs(parsed.artifactRefsRaw);
  if ("fail" in artifactRefsResolution) {
    return { malformed: malformedOf(relPath, artifactRefsResolution.fail) };
  }
  const artifactRefs = artifactRefsResolution.refs;
  const canonical = canonicalRunBytes(grn, resolved.context.trigger, result, executionId, artifactRefs);
  if (canonical === bytes) {
    // 快路径判卷补位（P20 红队发现 2）：携带身份键即校验档案在场（与 record 同判卷），
    // 手写 canonical 形态 + 未登记 AGX 不再借零 op 通路绕过 S1。
    const missingArchive = missingExecutionArchive(input.executionsDir, executionId);
    if (missingArchive !== null) {
      return { malformed: malformedOf(relPath, missingArchive) };
    }
    return {
      plan: { grn, relPath, action: "already_canonical", ran_at_seq: result.ranAtSeq },
    };
  }
  return {
    plan: {
      grn,
      relPath,
      action: "canonicalized",
      ran_at_seq: result.ranAtSeq,
      op: {
        op: "record_gate_run",
        // A3 显式 canonical 化覆写凭据：本分支语义就是「既有同号文件在场且内容有变，
        // 判定可复核的 canonical 化重录」——向 kernel 申报覆写凭据（journal ops 记
        // record_gate_run_canonicalize 留痕）。already_canonical 快路径不触发写，不传。
        canonicalizeOverwrite: true,
        run: {
          grn,
          trigger: resolved.context.trigger,
          result,
          ...(executionId ? { executionId } : {}),
          ...(artifactRefs.length > 0 ? { artifactRefs } : {}),
        },
      },
    },
  };
}

/**
 * record 单条路径的幂等扫描：在 runs 平面里找「与 --from 内容 canonical 等价」的既有
 * 文件（逐候选以其自报 ran_at_seq 兜底重放——未携带 ran_at_seq 的重复提交才不会因
 * 采样点前移而误判 pending）。命中 → SKIPPED_CANONICAL 零写入（设计 §4.7 record 幂等）。
 */
export function findCanonicalRunMatch(input: {
  readonly runsDir: string;
  readonly parsed: ParsedRunFile;
  readonly sampledRanAtSeq: number;
  readonly overrideTrigger?: string;
  readonly overrideTool?: string;
  readonly overrideToolVersion?: string;
  readonly overrideMetricDialect?: string;
  /** 显式执行身份覆盖（record --execution-id；参与 canonical 等价判定）。 */
  readonly overrideExecutionId?: string;
}): string | null {
  const overrideResolution = resolveExecutionId(input.overrideExecutionId, input.parsed.executionIdRaw);
  if ("fail" in overrideResolution) return null;
  const executionId = overrideResolution.executionId;
  // artifact_refs（P0.5-2）：--from 自报随 canonical 重放参与等价判定（缺席 → 空数组
  // 不落键，存量等价判定不变）。
  const artifactRefsResolution = resolveArtifactRefs(input.parsed.artifactRefsRaw);
  if ("fail" in artifactRefsResolution) return null;
  const artifactRefs = artifactRefsResolution.refs;
  for (const fileName of listPlaneFiles(input.runsDir)) {
    if (!GRN_FILE_PATTERN.test(fileName)) continue;
    const grn = fileName.slice(0, -".json".length);
    let bytes: string;
    try {
      bytes = readFileSync(`${input.runsDir}/${fileName}`, "utf8");
    } catch {
      continue;
    }
    const candidate = parseRunFile(bytes);
    if ("error" in candidate) continue;
    const resolved = resolveRunContext(input.parsed, {
      sampledRanAtSeq:
        (typeof input.parsed.ranAtSeqRaw === "number"
          ? input.parsed.ranAtSeqRaw
          : typeof candidate.ranAtSeqRaw === "number"
            ? candidate.ranAtSeqRaw
            : input.sampledRanAtSeq),
      overrideTrigger: input.overrideTrigger,
      overrideTool: input.overrideTool,
      overrideToolVersion: input.overrideToolVersion,
      overrideMetricDialect: input.overrideMetricDialect,
    });
    if ("failCode" in resolved) continue;
    const claimedBy = resolveAssertedClaimedBy(input.parsed);
    if ("detail" in claimedBy) continue;
    let result: GateResult;
    try {
      result = normalizeIngestedRun(input.parsed, grn, resolved.context, claimedBy.claimedBy);
    } catch {
      continue;
    }
    if (canonicalRunBytes(grn, resolved.context.trigger, result, executionId, artifactRefs) === bytes) return grn;
  }
  return null;
}

// ============================================================
// subject 绑定机复核（N5：theme-demos-report——harness 口说的 subject 归属 → 入账时机器验证）
// ============================================================

/** 绑定复核拒收的稳定码位：SCHEMA_INVALID=闭世界文法拒 / UNKNOWN_SUBJECT=store 无此对象。 */
export type SubjectBindingRejectionCode = "SCHEMA_INVALID" | "UNKNOWN_SUBJECT";

export interface SubjectBindingRejection {
  readonly subject: string;
  readonly code: SubjectBindingRejectionCode;
  readonly message: string;
}

export interface SubjectBindingResolution {
  /** 机器复核通过（文法 + 存在性）的绑定（去重 + 字典序）；APPLIED 路径随事务注记落 journal。 */
  readonly accepted: readonly string[];
  /** 复核拒收的绑定（不入账；由调用方镜像为信封 warnings 留痕）。 */
  readonly rejected: readonly SubjectBindingRejection[];
}

/**
 * 入账层 subject 绑定机复核（N5 核心判定）。对每个显式声明的绑定：
 * a) parseGovernedId 过闭世界文法（畸形 → SCHEMA_INVALID）；b) store objects[] 存在，
 * 或为 DENOMINATOR.*（与 gate denominator_refs 同宽：分母免存在性查）（否则
 * UNKNOWN_SUBJECT）。失配 → 拒该绑定（fail-closed：绑定不入账），gate-run 本体照常
 * 入账、拒因走信封 warnings 留痕——「subject 归属」由此从 harness 口说组装决策变成
 * 机器可验证事实（篡改归属过不了入账门）。
 */
export function resolveSubjectBindings(
  subjects: readonly string[],
  registeredObjectIds: ReadonlySet<string>,
): SubjectBindingResolution {
  const accepted: string[] = [];
  const rejected: SubjectBindingRejection[] = [];
  const seen = new Set<string>();
  for (const subject of subjects) {
    if (seen.has(subject)) continue; // 重复声明去重（幂等语义，非敌意输入）
    seen.add(subject);
    try {
      parseGovernedId(subject);
    } catch (err) {
      rejected.push({
        subject,
        code: "SCHEMA_INVALID",
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!registeredObjectIds.has(subject) && !subject.startsWith("DENOMINATOR.")) {
      rejected.push({
        subject,
        code: "UNKNOWN_SUBJECT",
        message: `绑定对象不在 store objects[]（DENOMINATOR.* 除外）：${subject}`,
      });
      continue;
    }
    accepted.push(subject);
  }
  return { accepted: [...accepted].sort(), rejected };
}

/**
 * 已验证绑定的入账注记（tx.note → kernel journal TX_APPLIED 行持久化）。canonical 07
 * run 记录形态 FROZEN（additionalProperties:false）不承载额外键——绑定住入账层事务
 * 注记，不进 run 记录本体。确定性：去重字典序、无墙钟；空集 → null（tx 不带 note，
 * 与现状逐字节一致）。
 */
export function subjectBindingsNote(accepted: readonly string[]): string | null {
  if (accepted.length === 0) return null;
  return `subject_bindings=${[...accepted].sort().join(",")}`;
}

// ============================================================
// claims 平面：解析 + 三分支判定 + canonical 字节重放
// ============================================================

export interface ParsedClaimFile {
  readonly record: UnknownRecord;
  /** verification.verdict 原始值（判定态裁决的依据；缺失/词表外 = 畸形）。 */
  readonly verificationVerdict: unknown;
}

export function parseClaimFile(bytes: string): ParsedClaimFile | ParseFailure {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch (err) {
    return { error: `JSON 无法解析：${err instanceof Error ? err.message : String(err)}` };
  }
  if (!isRecord(parsed)) return { error: "claim 记录不是 JSON 对象" };
  const verification = isRecord(parsed.verification) ? (parsed.verification as UnknownRecord) : undefined;
  return {
    record: parsed,
    verificationVerdict: verification === undefined ? undefined : verification.verdict,
  };
}

export type ClaimExtractFailure = { readonly detail: string };

/**
 * 从 claim 文件抽取 kernel ClaimRecordInput（record_claim 通道的输入形态；kernel 会
 * 自行派生 is_fixture / verification / evidence_refs 分型，rev 由事务分配）。
 * 必填输入缺失（subject 非法 / assertion 空 / asserted_by 缺）→ fail-closed——
 * 设计 §4.4 规则 2 的「手写缺字段」指缺 kernel 派生字段（record_type 等），不是缺必填输入。
 */
export function extractClaimInput(
  record: UnknownRecord,
  clm: string,
): ClaimRecordInput | ClaimExtractFailure {
  const subjectRaw = pick(record, "subject_id", "subjectId");
  const subjectBoxed = isRecord(record.subject) ? (record.subject as UnknownRecord) : undefined;
  const subjectId =
    typeof subjectRaw === "string" ? subjectRaw : typeof subjectBoxed?.object_id === "string" ? subjectBoxed.object_id : undefined;
  if (typeof subjectId !== "string" || subjectId.length === 0) {
    return { detail: "subject_id 缺失（subject_id 或 subject.object_id）" };
  }
  try {
    parseGovernedId(subjectId);
  } catch (err) {
    return {
      detail: `subject_id 文法违规：${subjectId}（${err instanceof Error ? err.message : String(err)}）`,
    };
  }
  const assertion = record.assertion;
  if (typeof assertion !== "string" || assertion.length === 0) {
    return { detail: "assertion 缺失（声称正文；允许先立后证，但空断言不是声称）" };
  }
  const assertedRaw = pick(record, "asserted_by", "assertedBy", "claimed_by", "claimedBy");
  if (!isRecord(assertedRaw)) {
    return { detail: "asserted_by 缺失（声称主体；argv/文件自报恒 self_attested=true 起步）" };
  }
  const actorType = pick(assertedRaw, "actor_type", "actorType");
  const actor = pick(assertedRaw, "actor");
  const selfAttested = pick(assertedRaw, "self_attested", "selfAttested");
  if (
    typeof actorType !== "string" ||
    !(ACTOR_TYPE_VALUES as readonly string[]).includes(actorType) ||
    typeof actor !== "string" ||
    actor.length === 0
  ) {
    return {
      detail: `asserted_by 形状非法（actor_type ∈ ${ACTOR_TYPE_VALUES.join("/")}，actor 非空）`,
    };
  }
  const evidenceRaw = record.evidence_refs ?? record.evidenceRefs;
  if (evidenceRaw !== undefined && !Array.isArray(evidenceRaw)) {
    return { detail: "evidence_refs 须为数组（GRN-* / 治理对象 / blob 三型或裸字符串）" };
  }
  const evidenceRefs: string[] = [];
  for (const entry of (evidenceRaw as readonly unknown[] | undefined) ?? []) {
    if (typeof entry === "string") {
      evidenceRefs.push(entry);
      continue;
    }
    // 已分型条目反解为裸引用（kernel record_claim 会重新分型；blob 反解有损——
    // sha256 无法还原原字符串，重放以 sha 串为 ref 生成新 blob 引用，确定性保持）。
    if (!isRecord(entry)) return { detail: `evidence_refs 条目形状非法：${JSON.stringify(entry)}` };
    const refType = entry.ref_type;
    if (refType === "gate_result" && typeof entry.grn === "string") {
      evidenceRefs.push(entry.grn);
    } else if (refType === "truth_object" && typeof entry.object_id === "string") {
      evidenceRefs.push(entry.object_id);
    } else if (
      refType === "blob" &&
      isRecord(entry.blob) &&
      typeof (entry.blob as UnknownRecord).sha256 === "string"
    ) {
      evidenceRefs.push(String((entry.blob as UnknownRecord).sha256));
    } else {
      return { detail: `evidence_refs 条目形状非法：${JSON.stringify(entry)}` };
    }
  }
  const notesRaw = record.notes_md ?? record.notesMd;
  // execution_id 贯穿（P20）：compact/record 双通路从既有记录原样回捞（词形校验在
  // planClaimFile 与 kernel record op 两道闸）——重入账不得静默剥掉身份字段。
  const executionIdRaw = pick(record, "execution_id", "executionId");
  const executionIdResolution = resolveExecutionId(undefined, executionIdRaw);
  if ("fail" in executionIdResolution) {
    return { detail: executionIdResolution.fail };
  }
  const executionId = executionIdResolution.executionId;
  return {
    clm,
    subjectId: subjectId as ClaimRecordInput["subjectId"],
    assertion,
    assertedBy: {
      actorType: actorType as Actor["actorType"],
      actor,
      selfAttested: selfAttested === undefined ? true : selfAttested === true,
    },
    evidenceRefs,
    ...(executionId !== null ? { executionId } : {}),
    ...(notesRaw !== undefined ? { notesMd: notesRaw as string | null } : {}),
  };
}

/**
 * canonical claim 组装（与 kernel store.applyRecordClaim 逐键同构，含键序；
 * rev 由重放方给定：与既有文件比对时用文件自身 rev，APPLIED 时由 kernel 事务分配）。
 * execution_id 仅在携带时落键（P20：缺席=键缺席，存量字节兼容）。
 */
export function canonicalClaimBytes(claim: ClaimRecordInput, rev: number): string {
  const subjectId = claim.subjectId;
  const typedRefs = claim.evidenceRefs.map((ref) => {
    if (GRN_REF_PATTERN.test(ref)) {
      return { ref_type: "gate_result", grn: ref } as UnknownRecord;
    }
    let isGoverned = true;
    try {
      parseGovernedId(ref);
    } catch {
      isGoverned = false;
    }
    if (isGoverned) {
      return { ref_type: "truth_object", object_id: ref } as UnknownRecord;
    }
    return {
      ref_type: "blob",
      blob: { sha256: sha256OfCanonical({ ref }), media: "text" },
    } as UnknownRecord;
  });
  const record: UnknownRecord = {
    record_type: "claim",
    clm: claim.clm,
    ...(claim.executionId ? { execution_id: claim.executionId } : {}),
    subject: { object_id: subjectId },
    is_fixture: subjectId.startsWith("TEST."),
    assertion: claim.assertion,
    asserted_by: {
      actor_type: claim.assertedBy.actorType,
      actor: claim.assertedBy.actor,
      self_attested: claim.assertedBy.selfAttested,
    },
    // D20：声称方不可自填 VERIFIED——record_claim 通道恒登记 UNVERIFIED 初始态，
    // recomputed_by 是 kernel（非自报）；已带独立判定的文件走 skipped_adjudicated。
    verification: {
      verdict: "UNVERIFIED",
      recomputed_by: { actor_type: "kernel", actor: "pomaster-kernel", self_attested: false },
    },
    evidence_refs: typedRefs,
    rev,
    ...(claim.notesMd !== undefined ? { notes_md: claim.notesMd } : {}),
  };
  return serializeKernel(record);
}

export interface PlannedClaim {
  readonly clm: string;
  readonly relPath: string;
  readonly action: ClaimIngestAction;
  /** action = recorded 时携带待入账 op（record_claim；verification 由 kernel 恒置 UNVERIFIED）。 */
  readonly op?: TransactionOp;
}

/** 既有 claim 文件的 rev 兜底（比对用：kernel 形态的 rev = 入账事务 seq，重放须逐字节还原）。 */
function claimRevOf(record: UnknownRecord, fallback: number): number {
  const rev = record.rev;
  return typeof rev === "number" && Number.isInteger(rev) && rev >= 0 ? rev : fallback;
}

/**
 * 单个 claim 文件的三分支判定（设计 §4.4 规则 1/2/3）+ canonical 化计划：
 * 1) 磁盘字节 = record_claim 重放（UNVERIFIED 初始形态）→ already_canonical；
 * 2) verification.verdict = UNVERIFIED 且非 kernel 形态 → recorded（重以 canonical 入账）；
 * 3) verdict ∈ {VERIFIED, PARTIALLY_VERIFIED, REJECTED} → skipped_adjudicated
 *    （已独立判定，record_claim 通道无权覆写；入账会打回 UNVERIFIED = 数据倒退）。
 * 判定块缺失 / verdict 词表外 / 必填输入缺失 → malformed。
 */
export function planClaimFile(input: {
  readonly fileName: string;
  readonly claimsDir: string;
  /** executions/ 档案目录（already_canonical 快路径的执行档案存在性校验——P20 红队发现 2）。 */
  readonly executionsDir: string;
  /** APPLIED 重放的 rev 兜底（= 本事务将分配的 seq，即当前 seq + 1）。 */
  readonly nextSeq: number;
}): { readonly plan: PlannedClaim } | { readonly malformed: EvidenceMalformed } {
  const relPath = `evidence/claims/${input.fileName}`;
  if (!CLM_FILE_PATTERN.test(input.fileName)) {
    return {
      malformed: malformedOf(
        relPath,
        "文件名不符合 CLM-n.json 词形，未纳入收编分母（缺席显式；CLM 由通路分配）",
      ),
    };
  }
  const clm = input.fileName.slice(0, -".json".length);
  let bytes: string;
  try {
    bytes = readFileSync(`${input.claimsDir}/${input.fileName}`, "utf8");
  } catch (err) {
    return { malformed: malformedOf(relPath, `文件不可读：${err instanceof Error ? err.message : String(err)}`) };
  }
  const parsed = parseClaimFile(bytes);
  if ("error" in parsed) return { malformed: malformedOf(relPath, parsed.error) };
  const verdict = parsed.verificationVerdict;
  if (typeof verdict !== "string" || verdict.length === 0) {
    return {
      malformed: malformedOf(
        relPath,
        "缺 verification.verdict（非 claim canonical 形态；判定块必读——禁静默跳过损坏证据）",
      ),
    };
  }
  if ((ADJUDICATED_VERIFICATION_VERDICTS as readonly string[]).includes(verdict)) {
    // 规则 3：已独立判定——显式跳过并披露，绝不覆写。
    return { plan: { clm, relPath, action: "skipped_adjudicated" } };
  }
  if (verdict !== "UNVERIFIED") {
    return {
      malformed: malformedOf(
        relPath,
        `verification.verdict "${verdict}" 是词表外值（四值闭包：VERIFIED / PARTIALLY_VERIFIED / UNVERIFIED / REJECTED）`,
      ),
    };
  }
  // 规则 1/2：UNVERIFIED —— canonical 重放比对。
  const extracted = extractClaimInput(parsed.record, clm);
  if ("detail" in extracted) return { malformed: malformedOf(relPath, extracted.detail) };
  const replayRev = claimRevOf(parsed.record, input.nextSeq);
  const canonical = canonicalClaimBytes(extracted, replayRev);
  if (canonical === bytes) {
    // 快路径判卷补位（P20 红队发现 2）：携带身份键即校验档案在场（与 record 同判卷）。
    const missingArchive = missingExecutionArchive(input.executionsDir, extracted.executionId ?? null);
    if (missingArchive !== null) {
      return { malformed: malformedOf(relPath, missingArchive) };
    }
    return { plan: { clm, relPath, action: "already_canonical" } };
  }
  return {
    plan: {
      clm,
      relPath,
      action: "recorded",
      // A3 显式 canonical 化覆写凭据：规则 2 分支语义就是「既有同号 UNVERIFIED 文件
      // 在场且 canonical 字节有变，判定可复核的 canonical 化重录」——规则 3（已判定）
      // 已在上方先返；kernel 侧对既有 verdict 的复核是二道防线（journal ops 记
      // record_claim_canonicalize 留痕）。
      op: { op: "record_claim", canonicalizeOverwrite: true, claim: extracted },
    },
  };
}

/**
 * record claim 单条路径的幂等扫描（与 findCanonicalRunMatch 同法）：找与 --from 内容
 * canonical 等价的既有 CLM 文件；命中 → SKIPPED_CANONICAL 零写入。
 */
export function findCanonicalClaimMatch(input: {
  readonly claimsDir: string;
  readonly record: UnknownRecord;
  readonly nextSeq: number;
}): string | null {
  for (const fileName of listPlaneFiles(input.claimsDir)) {
    if (!CLM_FILE_PATTERN.test(fileName)) continue;
    const clm = fileName.slice(0, -".json".length);
    let bytes: string;
    try {
      bytes = readFileSync(`${input.claimsDir}/${fileName}`, "utf8");
    } catch {
      continue;
    }
    const candidate = parseClaimFile(bytes);
    if ("error" in candidate) continue;
    if (candidate.verificationVerdict !== "UNVERIFIED") continue;
    const extracted = extractClaimInput(input.record, clm);
    if ("detail" in extracted) continue;
    const replayRev = claimRevOf(candidate.record, input.nextSeq);
    if (canonicalClaimBytes(extracted, replayRev) === bytes) return clm;
  }
  return null;
}
