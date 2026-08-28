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
 * - canonical 化是有损规范化：超集字段（tool_snapshot / 内嵌 tool / metric_dialect / items）
 *   被 kernel GateResult v0 契约剥离——首收入账必须标 canonicalized 而非静默覆写（设计坑 3）；
 * - claims 平面三分支（设计坑 4）：已带独立判定（VERIFIED/PARTIALLY_VERIFIED/REJECTED）的
 *   文件 → skipped_adjudicated，record_claim 通道无权覆写判定（D20：声称方不可自填
 *   VERIFIED），绝不把判定打回 UNVERIFIED 造成数据倒退；
 * - 畸形证据 fail-closed 显式呈现：落 malformed 并镜像信封 warnings，不静默跳过（compact
 *   不阻断本轮合法 truth 更新）；record 单条路径同一判据 → exit 1。
 */
import { readdirSync, readFileSync } from "node:fs";
import {
  type Actor,
  type ClaimRecordInput,
  type GateResult,
  type GateRunContext,
  type TransactionOp,
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
 * ingested.action 词形（CLI 呈现层局部词 → TODO(vocab-pr)，设计 §4.3 逐字）：
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
  /** 载荷内嵌 tool/tool_version（GateResult v0 不承载、落盘剥离，但可作归一上下文）。 */
  readonly innerTool: string | null;
  readonly innerToolVersion: string | null;
  /** trust.asserted 自报是否在场（C5 孪生；在场时必须可归因）。 */
  readonly assertedPresent: boolean;
  /** trust.asserted.declared_by（自报归因主体；snake/camel 双拼兼容）。 */
  readonly assertedDeclaredBy: unknown;
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
    innerTool: typeof rawValue.tool === "string" ? rawValue.tool : null,
    innerToolVersion: typeof rawValue.tool_version === "string" ? rawValue.tool_version : null,
    assertedPresent: asserted !== undefined,
    assertedDeclaredBy: asserted === undefined ? undefined : pick(asserted, "declared_by", "declaredBy"),
  };
}

/** tool_version 的 semver 词形（镜像 kernel assertRunContext 的校验，防上下文分叉）。 */
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$/;

export interface RunContextSource {
  /** 显式覆盖（record --trigger / --tool / --tool-version；compact 无覆盖）。 */
  readonly overrideTrigger?: string;
  readonly overrideTool?: string;
  readonly overrideToolVersion?: string;
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
 * - tool/toolVersion：显式覆盖 > tool_snapshot > 载荷内嵌 > 缺省 pomaster-cli/CLI_VERSION。
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

  return {
    context: { ranAtSeq, trigger, tool, toolVersion },
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
 * record_type / grn / ran_at_seq / trigger / gate_result{mode, result}；形态由 kernel 决定）。
 */
export function canonicalRunBytes(
  grn: string,
  trigger: RunTriggerValue,
  result: GateResult,
): string {
  const record: UnknownRecord = {
    record_type: "run",
    grn,
    ran_at_seq: result.ranAtSeq,
    trigger: { type: trigger },
    gate_result: { mode: "inline", result: gateResultToSnake(result) },
  };
  return serializeKernel(record);
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
  const canonical = canonicalRunBytes(grn, resolved.context.trigger, result);
  if (canonical === bytes) {
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
        run: { grn, trigger: resolved.context.trigger, result },
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
}): string | null {
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
    if (canonicalRunBytes(grn, resolved.context.trigger, result) === bytes) return grn;
  }
  return null;
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
    ...(notesRaw !== undefined ? { notesMd: notesRaw as string | null } : {}),
  };
}

/**
 * canonical claim 组装（与 kernel store.applyRecordClaim 逐键同构，含键序；
 * rev 由重放方给定：与既有文件比对时用文件自身 rev，APPLIED 时由 kernel 事务分配）。
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
    return { plan: { clm, relPath, action: "already_canonical" } };
  }
  return {
    plan: {
      clm,
      relPath,
      action: "recorded",
      op: { op: "record_claim", claim: extracted },
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
