/**
 * store.ts —— 唯一写入权威：store 事务（CLAIMED 纪律：一切落库必经 applyTransaction）。
 *
 * 全局纪律落点：
 * - D24：body_sha256 / content_digest / inputs_fingerprint / vocab 指纹全部由事务自动
 *   维护（human_touch=forbidden）；digest 失配/手改 → digestWarnings（WARN + auto-regen
 *   hint）并自动重算覆盖，**永不阻断写入**（write_blocking=false）；digest 只服务
 *   identity / 短路重跑 / 防篡改抽验。
 * - A4 幂等：seq/rev 单调分配（禁墙钟）；同 inputs 重放（inputs_fingerprint 相等）
 *   → shortCircuited=true 零写入（字节稳定）；无有效变化的同内容重写同样零写入
 *   （rev 不空转递增，GOLDEN-L8-4）。
 * - A1：一对象一文件（truth/objects/<kind-slug>/），索引只存摘要行。
 * - A8：gate_results/claims 只写 evidence/ 平面，结构性不入 truth-index。
 * - 原子性：staged 写入（tmp+rename）+ 失败回滚；回滚依据写入前捕获的原字节，
 *   不凭 exists() 推断删除原件（staged-replace 事故教训）。
 * - A1 并发防线：提交前重读 truth-index 的 generation.seq 复核世代（P20 红队发现 4
 *   同族修复，对照 locks.swapLockCas）——世代推进 → CONCURRENT_WRITE_DETECTED
 *   显式拒绝（本事务零落盘，重开 store 重放即收敛），绝不静默丢事务。
 * - A2 journal 纪律：TX_APPLIED 在 staged 批提交成功后 appendLine 原子追加
 *   （locks/execution/session 同款；RMW 覆写会把并发 appendLine 家族刚写的整行抹掉）。
 *   「index 先行、journal 缺行」= 可检出残态，比「journal 有幽灵行、index 未提交」诚实。
 * - A3 证据防线：record_claim / record_gate_run 写前查既有文件——canonical 内容等价
 *   → 幂等短路（零写入零 journal）；内容不同 → EVIDENCE_ALREADY_EXISTS 拒绝
 *   （record 通道无权覆写既有证据，D20：禁翻转 verdict / 禁打回 UNVERIFIED）。
 *   显式 canonicalizeOverwrite 凭据（op 契约位）是唯一覆写口：放行前 kernel 零成本
 *   复核既有 claim 判定态，已判定（VERIFIED 等）仍拒——须走新 id；覆写在 journal
 *   TX_APPLIED ops 记 *_canonicalize 可审计词形留痕。
 * - A4 转移不豁免：upsert 对既有对象直改 lifecycle 与 transition_object 同判
 *   （转移矩阵 + requires 的 authorityRef；SUPERSEDED→CURRENT 复活支线封死）。
 * - A5 提交前复验：事务产出先过 01 schema 再落盘——op 层漏检的非法产出在此拦截
 *   （防 store 变砖：非法索引一旦落盘，后续一切读写 SCHEMA_INVALID 只能从 git 恢复）。
 */
import { readdirSync } from "node:fs";
import * as ajvModule from "ajv";
import type { ValidateFunction } from "ajv";
import {
  CHANGE_VALUES,
  CONFIDENCE_VALUES,
  EVIDENCE_VALUES,
  IR_SCHEMA_DIALECT,
  LIFECYCLE_VALUES,
  ORIGIN_VALUES,
  PRODUCER_KIND_VALUES,
  RUN_TRIGGER_VALUES,
  SOURCE_TYPE_ALL_VALUES,
  SOURCE_TYPE_FORBIDDEN_VALUES,
  TRUTH_BODY_KINDS,
  VERDICT_VALUES,
  allSchemas,
  truthIndexSchema,
  type TruthBodyKind,
} from "./vocab.js";
import { GovernanceError, governanceCodeForParseError, GovernedIdParseError } from "./errors.js";
import {
  contentDigestOf,
  inputsFingerprintOf,
  sha256OfCanonical,
  vocabFingerprints,
  type DigestScopeInput,
} from "./digest.js";
import {
  appendLine,
  captureOriginal,
  ensureDir,
  executeWrites,
  readText,
  type FileWrite,
} from "./io.js";
import { KERNEL_TOOL, buildStorePaths, pathsOf, readCurrentSeq, readRawIndex, registerStore, type StorePaths } from "./paths.js";
import { assertArtifactBlobsExist, assertArtifactRefs, artifactRefsToSnake } from "./evidence-artifacts.js";
import { asGovernedId, normalizedKey } from "./id.js";
import { validateTransition } from "./transitions.js";
import { loadAuthorityMap } from "./permits.js";
import { assertExecutionAttachable } from "./execution.js";
import { gateResultToSnake } from "./gate-result.js";
import type {
  AxesBlock,
  CreateStoreOptions,
  DenominatorEntry,
  GovernedId,
  LivenessSnapshot,
  ObjectEnvelopeInput,
  ObjectRow,
  ProducerRecord,
  Store,
  Transaction,
  TransactionOp,
  TransactionResult,
  TruthIndex,
} from "./index.js";

type UnknownRecord = Record<string, unknown>;
type RawRow = Record<string, unknown>;

const NEW_FILE = null;

/**
 * record 类 op 的 execution_id 挂载校验（P20 执行身份贯穿证据链的 kernel 侧闸门；
 * 词形 + executions/ 档案存在性双检——S1：身份是基础设施印的，自造身份 fail-closed）。
 * 兼容裁定（decisions 落档，测试见 kernel/execution.spec.ts 与 cli/record-execution-threading）：
 * 07 证据记录的 execution_id 是**可选**字段（存量记录零迁移、canonical 幂等不破）；
 * record 通路**携带即强制校验**、不携带不伪造（缺席=键缺席）；身份盖章编排
 * （任意命令自动 begin + 自动随附）归 P21 Runtime Adapter 面。
 */
function assertExecutionIdClaimed(paths: StorePaths, executionId: string, context: string): void {
  try {
    assertExecutionAttachable(paths, executionId);
  } catch (error) {
    if (error instanceof GovernanceError) {
      throw new GovernanceError(
        error.code,
        `${context}：${error.message}`,
        error.hint,
        { ...error.details, context },
      );
    }
    throw error;
  }
}

// ajv 8 在 NodeNext 下的类型把模块解析为 CJS export= 形态；运行时 default 即构造器
// （module.exports.default = Ajv），此处显式解包（ajv 允许依赖清单内）。
interface AjvInstance {
  addSchema(schema: unknown): void;
  compile(schema: unknown): ValidateFunction;
}

function getAjvConstructor(): new (options?: Record<string, unknown>) => AjvInstance {
  const candidate = ajvModule as unknown as { default?: new (options?: Record<string, unknown>) => AjvInstance };
  if (typeof candidate.default === "function") return candidate.default;
  return ajvModule as unknown as new (options?: Record<string, unknown>) => AjvInstance;
}

// ============================================================
// 打开 / 初始化（No-op is elegant：重复 open 零变化）
// ============================================================

export async function createStore(
  rootDir: string,
  options?: CreateStoreOptions,
): Promise<Store> {
  const paths = buildStorePaths(rootDir);
  const raw = readRawIndex(paths);
  if (raw !== null) {
    if (options?.validateOnOpen !== false) {
      validateRawIndex(paths, raw);
    }
    ensureSidecars(paths);
    const store: Store = { rootDir, currentSeq: seqOfRaw(raw) };
    registerStore(store, paths);
    return store;
  }

  // 全新初始化：目录骨架 + 空白索引（零治理事实）。逐文件「缺失才写」→ 幂等。
  for (const dir of [
    paths.pomasterDir,
    paths.stateDir,
    paths.truthObjectsDir,
    paths.evidenceDir,
    paths.runsDir,
    paths.claimsDir,
    paths.blobsDir,
    paths.runtimeDir,
    paths.sessionsDir,
    paths.locksDir,
    paths.executionsDir,
  ]) {
    ensureDir(dir);
  }
  const skeleton = skeletonIndex();
  executeWrites([
    fileIfMissing(paths.authorityPath, `${JSON.stringify({ version: 1, authorities: {} }, null, 2)}\n`),
    fileIfMissing(paths.permitsPath, `${JSON.stringify({ version: 1, permits: [] }, null, 2)}\n`),
    fileIfMissing(paths.journalPath, ""),
    fileIfMissing(paths.heartbeatPath, ""),
    {
      path: paths.indexPath,
      next: `${JSON.stringify(skeleton, null, 2)}\n`,
      original: NEW_FILE,
    },
  ]);
  const store: Store = { rootDir, currentSeq: 0 };
  registerStore(store, paths);
  return store;
}

function fileIfMissing(path: string, next: string): FileWrite {
  return { path, next, original: captureOriginal(path) };
}

/**
 * 纯读装载路径（二轮审查 H3）：与 createStore 同源（buildStorePaths + readRawIndex +
 * validateRawIndex——损坏索引照样 fail-closed），但**零写副作用**——不 ensureSidecars、
 * 不建平面目录。自述「纯读零写」的命令（session/lock/execution/trace 观测面、agents
 * status）经本入口装载：存量 store 侧车缺失按「缺席」呈现（丢失信号可见），禁静默
 * 重建空账（inspect.ts 先例的 kernel 侧落点）。未初始化 → NOT_CONFIGURED。
 */
export function loadStoreReadOnly(rootDir: string): Store {
  const paths = buildStorePaths(rootDir);
  const raw = readRawIndex(paths);
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir },
    );
  }
  validateRawIndex(paths, raw);
  const store: Store = { rootDir, currentSeq: seqOfRaw(raw) };
  registerStore(store, paths);
  return store;
}

/** 已存在 store 的内部侧车补齐（仅缺失才写；不产生治理事实）。 */
function ensureSidecars(paths: StorePaths): void {
  const writes: FileWrite[] = [];
  const authority = fileIfMissing(paths.authorityPath, `${JSON.stringify({ version: 1, authorities: {} }, null, 2)}\n`);
  if (authority.original === null) writes.push(authority);
  const permits = fileIfMissing(paths.permitsPath, `${JSON.stringify({ version: 1, permits: [] }, null, 2)}\n`);
  if (permits.original === null) writes.push(permits);
  const journal = fileIfMissing(paths.journalPath, "");
  if (journal.original === null) writes.push(journal);
  const heartbeat = fileIfMissing(paths.heartbeatPath, "");
  if (heartbeat.original === null) writes.push(heartbeat);
  if (writes.length > 0) executeWrites(writes);
  // P20 D 线地基平面目录补齐（runtime/sessions、runtime/locks、executions；
  // 存量 store 升级路径——仅缺失才建，不产生治理事实）。
  ensureDir(paths.sessionsDir);
  ensureDir(paths.locksDir);
  ensureDir(paths.executionsDir);
}

function skeletonIndex(): UnknownRecord {
  const fingerprints = vocabFingerprints();
  const generation = {
    tool: KERNEL_TOOL,
    seq: 0,
    inputsFingerprint: sha256OfCanonical({ initialized: true }),
  };
  // D24：骨架摘要同样由事务侧计算逻辑自动维护（非人工填写）。
  const contentDigest = contentDigestOf({
    irSchema: IR_SCHEMA_DIALECT,
    generation,
    vocabLock: fingerprints,
    denominators: [],
    objects: [],
    producers: [],
  });
  return {
    ir_schema: IR_SCHEMA_DIALECT,
    content_digest: contentDigest,
    generation: {
      tool: generation.tool,
      seq: generation.seq,
      inputs_fingerprint: generation.inputsFingerprint,
    },
    vocab_lock: {
      state_axes: fingerprints.stateAxes,
      kinds: fingerprints.kinds,
      prefixes: fingerprints.prefixes,
    },
    denominators: [],
    objects: [],
    producers: [],
    health: {
      dead_producers: [],
      orphaned_objects: [],
      worst_blindspot: null,
      alias_conflicts: [],
    },
    integrity_ruleset: "REF_INTEGRITY@v1",
  };
}

// ============================================================
// 装载与校验
// ============================================================

let indexValidator: ValidateFunction | null = null;

function getIndexValidator(): ValidateFunction {
  if (indexValidator === null) {
    const AjvCtor = getAjvConstructor();
    // strict:false 关闭 strictSchema（x- 注记键，D24 要求 x-digest-ethics 在场）
    // 与 strictTypes（05/06 的联合类型写法）两类告警；01 消费契约见 schemas 包装载提示。
    const ajv = new AjvCtor({ strict: false, allErrors: true });
    for (const schema of Object.values(allSchemas)) {
      ajv.addSchema(schema as Record<string, unknown>);
    }
    indexValidator = ajv.compile(truthIndexSchema as Record<string, unknown>);
  }
  return indexValidator as ValidateFunction;
}

/**
 * 01 schema 校验 + vocab_lock 三指纹对账（不一致=FATAL，D24 read_only_service 的
 * identity 抽验，非写阻断）+ REF_INTEGRITY 基础项。
 */
function validateRawIndex(paths: StorePaths, raw: UnknownRecord): void {
  const validate = getIndexValidator();
  if (!validate(raw)) {
    const errors = (validate.errors ?? [])
      .map((error) => `${error.instancePath} ${error.message ?? ""}`)
      .join("; ");
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `truth-index 不满足 01-truth-index schema：${errors}`,
      "按 01 schema 修正结构（组合装载已注册 01..10 全部 $id）；或从 git 恢复索引",
      { errors: (validate.errors ?? []).length },
    );
  }
  const fingerprints = vocabFingerprints();
  const vocabLock = raw.vocab_lock as UnknownRecord;
  const stored: UnknownRecord = {
    state_axes: vocabLock.state_axes,
    kinds: vocabLock.kinds,
    prefixes: vocabLock.prefixes,
  };
  const expected: UnknownRecord = {
    state_axes: fingerprints.stateAxes,
    kinds: fingerprints.kinds,
    prefixes: fingerprints.prefixes,
  };
  for (const key of Object.keys(expected)) {
    if (stored[key] !== expected[key]) {
      throw new GovernanceError(
        "VOCAB_MISMATCH",
        `vocab_lock 指纹对账失败：${key} 存储值 ${String(stored[key])} ≠ 当前词表镜像 ${String(expected[key])}`,
        "索引由旧词表写入或词表代码镜像已变更：走词汇表 PR 流程（vocab-lock 与 @pomaster/schemas 同 commit），勿手改指纹（D24：human_touch=forbidden）",
        { key },
      );
    }
  }
  assertRefIntegrityBasics(raw);
  void paths;
}

/** REF_INTEGRITY 基础项（v0 四项；全量十三项归后续 REF_INTEGRITY 规则集）。 */
function assertRefIntegrityBasics(raw: UnknownRecord): void {
  const objects = raw.objects as readonly RawRow[];
  const producers = raw.producers as readonly RawRow[];
  const denominators = raw.denominators as readonly RawRow[];

  const producerIds = new Set(producers.map((producer) => producer.producer_id as string));
  const seenIds = new Set<string>();
  for (const row of objects) {
    const id = row.id as string;
    if (seenIds.has(id)) {
      throw new GovernanceError(
        "REF_INTEGRITY_VIOLATION",
        `canonical id 重复登记：${id}`,
        "唯一性三重查重（canonical/normalized_key/aliases）：删除重复行或合并后再登记（GOLDEN-L1-DUP-KEY）",
        { id },
      );
    }
    seenIds.add(id);
    if (
      row.origin === "derived" &&
      typeof row.producer_id === "string" &&
      !producerIds.has(row.producer_id)
    ) {
      throw new GovernanceError(
        "REF_INTEGRITY_VIOLATION",
        `origin=derived 的对象 ${id} 引用了不存在的 producer：${String(row.producer_id)}`,
        "C3：先 register_producer 再落派生对象（死 factsource 免疫）",
        { id, producerId: row.producer_id },
      );
    }
    const axes = row.axes as UnknownRecord;
    if (axes.change === "MIGRATING") {
      const permits = row.permits_active as readonly string[];
      if (!Array.isArray(permits) || permits.length === 0) {
        throw new GovernanceError(
          "REF_INTEGRITY_VIOLATION",
          `对象 ${id} change=MIGRATING 但 permits_active 为空`,
          "跨轴断言：MIGRATING 必持 ACTIVE PERMIT（issuePermit 后把 PERMIT.* 写入 permits_active）",
          { id },
        );
      }
    }
  }
  const denominatorIds = new Set(denominators.map((entry) => entry.id as string));
  for (const entry of denominators) {
    if (entry.status === "SUPERSEDED" && typeof entry.successor_ref !== "string") {
      throw new GovernanceError(
        "REF_INTEGRITY_VIOLATION",
        `分母 ${String(entry.id)} status=SUPERSEDED 但缺 successor_ref`,
        "vocab-lock：SUPERSEDED 终态后继必填；补 successor_ref 指向现行分母（只许 supersede 不许删除）",
        { id: String(entry.id) },
      );
    }
    if (
      typeof entry.successor_ref === "string" &&
      !denominatorIds.has(entry.successor_ref)
    ) {
      throw new GovernanceError(
        "REF_INTEGRITY_VIOLATION",
        `分母 ${String(entry.id)} 的 successor_ref ${String(entry.successor_ref)} 不存在`,
        "DENOM_LINK_003：后继必须解析为现存分母（分母永远不许指空）",
        { id: String(entry.id) },
      );
    }
  }
}

function seqOfRaw(raw: UnknownRecord): number {
  const generation = raw.generation as UnknownRecord;
  return generation.seq as number;
}

/** 装载并校验 truth-index（契约见 docs/kernel-api.md §1）。 */
export async function loadTruthIndex(store: Store): Promise<TruthIndex> {
  const paths = pathsOf(store);
  const raw = readRawIndex(paths);
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir: store.rootDir },
    );
  }
  validateRawIndex(paths, raw);
  return toTruthIndex(raw);
}

// ============================================================
// snake_case（schema 世界）⇆ camelCase（契约类型世界）映射
// ============================================================

function toTruthIndex(raw: UnknownRecord): TruthIndex {
  const generation = raw.generation as UnknownRecord;
  const vocabLock = raw.vocab_lock as UnknownRecord;
  const health = raw.health as UnknownRecord;
  const worst = health.worst_blindspot as UnknownRecord | null;
  return {
    irSchema: IR_SCHEMA_DIALECT,
    contentDigest: raw.content_digest as string,
    generation: {
      tool: generation.tool as string,
      seq: generation.seq as number,
      inputsFingerprint: generation.inputs_fingerprint as string,
    },
    vocabLock: {
      stateAxes: vocabLock.state_axes as string,
      kinds: vocabLock.kinds as string,
      prefixes: vocabLock.prefixes as string,
    },
    denominators: (raw.denominators as readonly RawRow[]).map(toDenominatorEntry),
    objects: (raw.objects as readonly RawRow[]).map(toObjectRow),
    producers: (raw.producers as readonly RawRow[]).map(toProducerRecord),
    health: {
      deadProducers: (health.dead_producers as readonly string[]) ?? [],
      orphanedObjects: ((health.orphaned_objects as readonly string[]) ?? []) as readonly GovernedId[],
      worstBlindspot:
        worst === null
          ? null
          : { gate: worst.gate as string, escapeRatio: worst.escape_ratio as number },
      aliasConflicts: ((health.alias_conflicts as readonly RawRow[]) ?? []).map(
        (conflict) => ({
          normalizedKey: conflict.normalized_key as string,
          conflictingIds: conflict.conflicting_ids as readonly string[],
        }),
      ),
    },
    integrityRuleset: raw.integrity_ruleset as string,
  };
}

function toObjectRow(raw: RawRow): ObjectRow {
  const axes = raw.axes as UnknownRecord;
  const binding = raw.binding_summary as UnknownRecord;
  const evidence = raw.evidence_summary as UnknownRecord;
  const row: ObjectRow = {
    id: raw.id as GovernedId,
    kind: raw.kind as TruthBodyKind,
    axes: {
      lifecycle: axes.lifecycle as AxesBlock["lifecycle"],
      confidence: axes.confidence as AxesBlock["confidence"],
      evidence: axes.evidence as AxesBlock["evidence"],
      change: axes.change as AxesBlock["change"],
    },
    titleZh: raw.title_zh as string,
    authorityOwner: raw.authority_owner as string,
    origin: raw.origin as ObjectRow["origin"],
    rev: raw.rev as number,
    bodyRef: raw.body_ref as string,
    denominatorRefs: ((raw.denominator_refs as readonly RawRow[]) ?? []).map(
      (ref) => ({ id: ref.id as GovernedId, versionSeen: ref.version_seen as number }),
    ),
    bindingSummary: {
      declared: binding.declared as number,
      probeStatus: binding.probe_status as ObjectRow["bindingSummary"]["probeStatus"],
    },
    evidenceSummary: {
      claims: evidence.claims as number,
      verified: evidence.verified as number,
      unverified: evidence.unverified as number,
      rejected: evidence.rejected as number,
    },
    permitsActive: (raw.permits_active as readonly string[]) ?? [],
    ...(typeof raw.producer_id === "string" ? { producerId: raw.producer_id } : {}),
    ...(typeof raw.body_sha256 === "string" ? { bodySha256: raw.body_sha256 } : {}),
  };
  return row;
}

function toDenominatorEntry(raw: RawRow): DenominatorEntry {
  const selector = raw.member_selector as UnknownRecord;
  const authority = raw.authority as UnknownRecord;
  return {
    id: raw.id as GovernedId,
    version: raw.version as number,
    membersCount: raw.members_count as number,
    memberSelector: {
      ...(typeof selector.via_binding_table === "string"
        ? { viaBindingTable: selector.via_binding_table }
        : {}),
      ...(typeof selector.filter === "object" && selector.filter !== null
        ? { filter: selector.filter as DenominatorEntry["memberSelector"]["filter"] }
        : {}),
    },
    successorOf: ((raw.successor_of as readonly string[]) ?? []) as readonly GovernedId[],
    authority: { owner: authority.owner as string },
    status: raw.status as DenominatorEntry["status"],
    ...(typeof raw.successor_ref === "string"
      ? { successorRef: raw.successor_ref as GovernedId }
      : {}),
  };
}

function toProducerRecord(raw: RawRow): ProducerRecord {
  const liveness = raw.liveness as UnknownRecord;
  return {
    producerId: raw.producer_id as string,
    kind: raw.kind as ProducerRecord["kind"],
    entrypoint: raw.entrypoint as string,
    objectsClaimed: raw.objects_claimed as number,
    viewsMaintained: raw.views_maintained as readonly string[],
    liveness: {
      status: liveness.status as LivenessSnapshot["status"],
      runsSinceLastOutput: liveness.runs_since_last_output as number,
      lastOutputSeq: liveness.last_output_seq as number,
    },
  };
}

// ============================================================
// 正文层机械映射（01 body_ref 注记：slug(kind) + normalize_id_local_part）
// ============================================================

const CONTRACT_OPERATION_SLUG = "contract-op"; // 01 示例锚定的唯一缩写 slug

function kindSlug(kind: TruthBodyKind): string {
  return kind === "contract_operation"
    ? CONTRACT_OPERATION_SLUG
    : kind.replaceAll("_", "-");
}

/** API_REQ.BIND.CARLINE.1 → truth/objects/contract-op/api-req.bind.carline.1.json（段间点保留、下划线转连字符、统一小写）。 */
function bodyRefFor(id: string, kind: TruthBodyKind): string {
  const local = id.toLowerCase().replaceAll("_", "-");
  return `truth/objects/${kindSlug(kind)}/${local}.json`;
}

// ============================================================
// 事务
// ============================================================

interface TxWorkspace {
  readonly paths: StorePaths;
  readonly raw: UnknownRecord;
  readonly working: UnknownRecord;
  /** 待落盘文件（index/journal 之外）：正文 / claims / runs / heartbeat。 */
  readonly files: Map<string, string>;
  readonly digestWarnings: string[];
  readonly changedObjectIds: Set<string>;
  curSeq: number;
  nextSeq: number;
  anyChange: boolean;
  /** 同事务内的正文覆盖层（upsert 后 transition 直接读改写）。 */
  readonly bodyOverlay: Map<string, UnknownRecord>;
}

function rowBodyPath(paths: StorePaths, bodyRef: string): string {
  return `${paths.pomasterDir}/${bodyRef}`;
}

function parseIdOrWrap(id: string, context: string): GovernedId {
  try {
    return asGovernedId(id);
  } catch (error) {
    if (error instanceof GovernedIdParseError) {
      throw new GovernanceError(
        governanceCodeForParseError(error),
        `${context}：${error.message}`,
        "closed-world 前缀闭包与 SEGMENT/SEQ 文法见 vocab-lock id_namespace（A5）；新前缀走词汇表 PR，legacy 拼写走 resolveAlias 收编（A6）",
        { id: error.id, reason: error.reason },
      );
    }
    throw error;
  }
}

function readBodyFor(paths: StorePaths, overlay: Map<string, UnknownRecord>, row: RawRow): UnknownRecord | null {
  const overlayHit = overlay.get(row.id as string);
  if (overlayHit !== undefined) return overlayHit;
  const text = readText(rowBodyPath(paths, row.body_ref as string));
  if (text === null) return null;
  return JSON.parse(text) as UnknownRecord;
}

/**
 * A1 提交时世代复核（P20 红队发现 4 同族修复：locks.swapLockCas 在锁面修的同类
 * 「读-算-写」丢更新窗口——两进程各读 seq=N 各算 seq=N+1，后 rename 者静默抹掉
 * 先提交者的整个事务，而先提交方已收到成功回执）。文件系统无 index 级 CAS，本防线
 * 把窗口收窄到「复核 → rename」的最小缝隙：检测到世代推进即显式拒绝（fail-closed，
 * 宁可拒绝重放、不可静默丢事务）；彻底闭环需索引级独占认领（同 swapLockCas 落法），
 * 归后续 kernel PR。
 */
function assertCommitSeqUnchanged(paths: StorePaths, openedSeq: number): void {
  const current = readCurrentSeq(paths);
  if (current !== null && current !== openedSeq) {
    throw new GovernanceError(
      "CONCURRENT_WRITE_DETECTED",
      `提交时世代复核失败：开卷 seq=${openedSeq}，落盘前 truth-index seq=${current}（另一进程/会话已先提交事务）`,
      "重开 store 后重放本事务（本事务零落盘，重放安全）；多会话并发写同一 store 请经 change/unit 锁互斥（pomaster lock acquire）",
      { opened_seq: openedSeq, current_seq: current },
    );
  }
}

/**
 * A5 提交前 01 schema 复验（通用兜底防线）：op 层漏检的非法产出（如 envelope 字段为
 * undefined 被 JSON.stringify 丢弃、行缺 required 键）在此拦截——非法索引一旦落盘，
 * 后续一切读/写 SCHEMA_INVALID（store 变砖，只能从 git 恢复）。复验失败时事务零落盘。
 */
function assertWorkingIndexSchemaValid(working: UnknownRecord): void {
  const validate = getIndexValidator();
  if (validate(working)) return;
  const errors = (validate.errors ?? [])
    .map((error) => `${error.instancePath} ${error.message ?? ""}`)
    .join("; ");
  throw new GovernanceError(
    "SCHEMA_INVALID",
    `事务产出未通过 01-truth-index schema 提交前复验（op 层漏检拦截，防 store 变砖）：${errors}`,
    "修正对应 op 的 envelope 输入后重放（本事务零落盘）；键值 undefined 会被 JSON.stringify 丢弃（如 titleZh），传 null 或合法值",
    { errors: (validate.errors ?? []).length },
  );
}

/**
 * TX_APPLIED.ops 的 journal 词形：canonical 化覆写 op 以 *_canonicalize 后缀显式留痕
 * （A3 契约位的可审计面——journal 读侧能机械区分「常规记录」与「判定可复核重录」）。
 * 消费方兼容：reconcile REV_ADVANCING_OPS 只匹配 upsert/transition（record_* 不在
 * 集合）；production loadRunLedger 锚集显式含 record_gate_run canonicalize 变体。
 */
function journalOpWordForm(op: TransactionOp): string {
  if (
    (op.op === "record_claim" || op.op === "record_gate_run") &&
    op.canonicalizeOverwrite === true
  ) {
    return `${op.op}_canonicalize`;
  }
  return op.op;
}

/**
 * 唯一写入路径。语义见 docs/kernel-api.md §1（seq/rev 单调、digest 自动维护、
 * 幂等短路、DENOMINATOR 只许 supersede 不许删除、staged+回滚）。
 */
export async function applyTransaction(
  store: Store,
  tx: Transaction,
): Promise<TransactionResult> {
  const paths = pathsOf(store);
  const raw = readRawIndex(paths);
  if (raw === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: store.rootDir },
    );
  }
  validateRawIndex(paths, raw);
  const curSeq = seqOfRaw(raw);

  // —— 事务级执行身份盖章校验（P21-Enforcement；先于幂等短路——盖章位携带即
  //    校验，重放路径同样不放行自造身份；S1 与 record op 同法同闸） ——
  if (tx.executionId !== undefined) {
    assertExecutionIdClaimed(paths, tx.executionId, "transaction.executionId");
  }

  // —— 幂等短路：同 inputs 重放 = 零写入（字节稳定，seq 不动） ——
  const fingerprint = inputsFingerprintOf(tx);
  if (fingerprint === (raw.generation as UnknownRecord).inputs_fingerprint) {
    return {
      appliedSeq: curSeq,
      shortCircuited: true,
      changedObjectIds: [],
      digestWarnings: [],
    };
  }

  const working = structuredClone(raw) as UnknownRecord;
  const workspace: TxWorkspace = {
    paths,
    raw,
    working,
    files: new Map(),
    digestWarnings: [],
    changedObjectIds: new Set<string>(),
    curSeq,
    nextSeq: curSeq + 1,
    anyChange: false,
    bodyOverlay: new Map(),
  };

  // —— D24 防篡改抽验（只读服务；失配 → WARN + auto-regen，永不阻断） ——
  sweepDigestTampering(workspace);

  // —— 顺序执行 ops（全部只改 working/计划，最后统一 staged 落盘） ——
  for (const op of tx.ops) {
    applyOp(workspace, op, tx);
  }

  finalizeHealth(workspace);

  // —— 零变化 → 零写入（同内容重写不空转 seq/rev，GOLDEN-L8-4；auto-regen 也算变化） ——
  // 判定须在 finalizeGeneration 之前：否则 seq/fingerprint 的改写本身构成「变化」。
  const indexChanged =
    JSON.stringify(working) !== JSON.stringify(raw);
  if (!indexChanged && workspace.files.size === 0) {
    return {
      appliedSeq: curSeq,
      shortCircuited: true,
      changedObjectIds: [],
      digestWarnings: workspace.digestWarnings,
    };
  }
  finalizeGeneration(workspace, fingerprint);

  // —— A5 提交前 01 schema 复验（op 层漏检在此拦截；失败时零落盘，store 不变砖） ——
  assertWorkingIndexSchemaValid(working);

  // —— staged 落盘 + journal ——
  const writes: FileWrite[] = [];
  for (const [path, next] of workspace.files) {
    writes.push({ path, next, original: captureOriginal(path) });
  }
  writes.push({
    path: paths.indexPath,
    next: `${JSON.stringify(working, null, 2)}\n`,
    original: captureOriginal(paths.indexPath),
  });
  // A1 世代复核：置于 staged 计划就绪之后、executeWrites 之前——检测到并发世代推进
  // 时本事务零落盘，重开 store 重放即收敛（P20 红队发现 4 同族修复）。
  assertCommitSeqUnchanged(paths, curSeq);
  executeWrites(writes);
  // A2：TX_APPLIED 不入 staged 批，在正文/索引提交成功后 appendLine 原子追加
  // （locks/execution/session 同款纪律——RMW 覆写落法会把并发 appendLine 家族刚追加的
  // 整行抹掉）。顺序取舍：op 失败零落盘不变量保持（正文/索引失败不追加）；崩溃窗口
  // 从「journal 有幽灵行、index 没提交」改为「index 先行、journal 缺行」——后者是
  // 可检出残态（changed_object_ids 对照磁盘可查缺），方向更诚实。
  appendLine(
    paths.journalPath,
    `${JSON.stringify({
      type: "TX_APPLIED",
      seq: workspace.nextSeq,
      authority_ref: tx.authorityRef ?? null,
      // 事务级执行身份盖章（P21-Enforcement；§25.4 审计问题的 journal 兑现位；
      // 缺席 = null 显式——C1，存量事件消费方只读既有键，向后兼容）。
      execution_id: tx.executionId ?? null,
      note: tx.note ?? null,
      ops: tx.ops.map((op) => journalOpWordForm(op)),
      changed_object_ids: [...workspace.changedObjectIds].sort(),
      digest_warnings: workspace.digestWarnings.length,
    })}\n`,
  );

  return {
    appliedSeq: workspace.nextSeq,
    shortCircuited: false,
    changedObjectIds: [...workspace.changedObjectIds].sort() as unknown as readonly GovernedId[],
    digestWarnings: workspace.digestWarnings,
  };
}

// —— D24 防篡改抽验与 auto-regen ——

function scopeOf(raw: UnknownRecord, generation?: UnknownRecord): DigestScopeInput {
  const gen = (generation ?? raw.generation) as UnknownRecord;
  const vocabLock = raw.vocab_lock as UnknownRecord;
  return {
    irSchema: raw.ir_schema as string,
    generation: {
      tool: gen.tool as string,
      seq: gen.seq as number,
      inputsFingerprint: gen.inputs_fingerprint as string,
    },
    vocabLock: {
      stateAxes: vocabLock.state_axes as string,
      kinds: vocabLock.kinds as string,
      prefixes: vocabLock.prefixes as string,
    },
    denominators: raw.denominators as readonly unknown[],
    objects: raw.objects as readonly unknown[],
    producers: (raw.producers as readonly RawRow[]).map((producer) => ({
      producerId: producer.producer_id as string,
      kind: producer.kind as string,
      entrypoint: producer.entrypoint as string,
      objectsClaimed: producer.objects_claimed as number,
      viewsMaintained: producer.views_maintained as readonly string[],
    })),
  };
}

function sweepDigestTampering(workspace: TxWorkspace): void {
  const { raw, working, paths } = workspace;
  const recomputedEntry = contentDigestOf(scopeOf(raw));
  if (raw.content_digest !== recomputedEntry) {
    workspace.digestWarnings.push(
      `content_digest mismatch (stored ${String(raw.content_digest)} ≠ recomputed ${recomputedEntry}) — auto-regen applied（D24：WARN + auto-regen hint，永不阻断写入）`,
    );
  }
  for (const row of working.objects as readonly RawRow[]) {
    const text = readText(rowBodyPath(paths, row.body_ref as string));
    if (text === null) {
      throw new GovernanceError(
        "REF_INTEGRITY_VIOLATION",
        `对象 ${String(row.id)} 的正文文件缺失：${String(row.body_ref)}`,
        "正文层与索引层必须成对存在（A1）；从 git 恢复正文或重新 upsert 该对象",
        { id: String(row.id) },
      );
    }
    const actual = sha256OfCanonical(JSON.parse(text) as unknown);
    if (actual !== row.body_sha256) {
      workspace.digestWarnings.push(
        `body_sha256 mismatch for ${String(row.id)} (stored ${String(row.body_sha256)} ≠ actual ${actual}) — auto-regen applied（D24：WARN + auto-regen hint，永不阻断写入）`,
      );
      row.body_sha256 = actual;
    }
  }
}

// —— op 分发 ——

function applyOp(workspace: TxWorkspace, op: TransactionOp, tx: Transaction): void {
  switch (op.op) {
    case "upsert_object":
      applyUpsertObject(workspace, op.envelope, tx);
      break;
    case "transition_object":
      applyTransitionObject(workspace, op, tx);
      break;
    case "register_producer":
      applyRegisterProducer(workspace, op.record);
      break;
    case "heartbeat":
      applyHeartbeat(workspace, op);
      break;
    case "append_denominator":
      applyAppendDenominator(workspace, op.entry);
      break;
    case "record_claim":
      applyRecordClaim(workspace, op);
      break;
    case "record_gate_run":
      applyRecordGateRun(workspace, op);
      break;
  }
}

// —— 断言辅助（运行时词表防线；类型侧已收窄，这里兜 JS 直调） ——

function assertVocabValue(
  value: unknown,
  allowed: readonly string[],
  axis: string,
  hint: string,
): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `${axis}="${String(value)}" 是词表外值`,
      hint,
      { axis, value, allowed: [...allowed] },
    );
  }
}

function requirePositiveInt(value: unknown, field: string, hint: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new GovernanceError("SCHEMA_INVALID", `${field} 须为 ≥1 整数：${String(value)}`, hint, { field });
  }
  return value;
}

function requireNonNegativeInt(value: unknown, field: string, hint: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new GovernanceError("SCHEMA_INVALID", `${field} 须为 ≥0 整数：${String(value)}`, hint, { field });
  }
  return value;
}

// —— upsert_object ——

function applyUpsertObject(
  workspace: TxWorkspace,
  envelope: ObjectEnvelopeInput,
  tx: Transaction,
): void {
  const { paths } = workspace;
  // 契约类型（ObjectEnvelopeInput）无索引签名；运行时词表/形状防线按动态键取值。
  const env = envelope as unknown as UnknownRecord;
  const id = parseIdOrWrap(env.id as string, "upsert_object.envelope.id");
  assertVocabValue(env.kind, TRUTH_BODY_KINDS, "kind", `truth_bodies 十类：${TRUTH_BODY_KINDS.join(" / ")}（gate_result 等运行产物 forbidden_in_index，A8）`);
  const kind = env.kind as TruthBodyKind;
  if (typeof env.axisProfile !== "string" || env.axisProfile.length === 0) {
    throw new GovernanceError("SCHEMA_INVALID", "axisProfile 缺失（轴收窄 profile 名）", "如 capability_default / task_default；profile 本体是 SYS 词表对象", {});
  }
  const axes = env.axes as UnknownRecord | undefined;
  if (typeof axes !== "object" || axes === null) {
    throw new GovernanceError("SCHEMA_INVALID", "axes 缺失（四轴状态块）", "lifecycle/confidence/evidence/change 四值必填（A2）", {});
  }
  assertVocabValue(axes.lifecycle, LIFECYCLE_VALUES, "axes.lifecycle", `A2 六值超集：${LIFECYCLE_VALUES.join(" / ")}`);
  assertVocabValue(axes.confidence, CONFIDENCE_VALUES, "axes.confidence", `PRD §18.2 四值：${CONFIDENCE_VALUES.join(" / ")}`);
  assertVocabValue(axes.evidence, EVIDENCE_VALUES, "axes.evidence", `PRD 三值：${EVIDENCE_VALUES.join(" / ")}（realization 属正交字段不入本轴，A3）`);
  assertVocabValue(axes.change, CHANGE_VALUES, "axes.change", `${CHANGE_VALUES.join(" / ")}`);
  assertVocabValue(env.origin, ORIGIN_VALUES, "origin", `natural / derived / ingested（human_curated→natural、migrated→ingested 收编映射）`);
  const origin = env.origin as string;

  // C3：origin=derived ⇒ producer 声明块必填（死 factsource 免疫）。
  const producer = env.producer;
  let producerId: string | null = null;
  if (origin === "derived") {
    if (typeof producer !== "object" || producer === null) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `origin=derived 的对象 ${id} 缺 producer 声明块`,
        "C3：声明派生对象的前提是 producer 存在——补 producer{producerId, viewsMaintained} 或改 origin（GOLDEN-L1-DERIVED-NEEDS-PRODUCER）",
        { id },
      );
    }
    const producerRecord = producer as UnknownRecord;
    producerId = producerRecord.producerId as string;
    if (typeof producerId !== "string" || !/^prod\.[a-z][a-z0-9_]{1,63}$/.test(producerId)) {
      throw new GovernanceError("SCHEMA_INVALID", `producer_id 词形非法：${String(producerId)}`, "prod. 强制前缀 + 小写蛇形（单一事实源 06-producer）", { producerId });
    }
    const views = producerRecord.viewsMaintained;
    if (!Array.isArray(views) || views.length === 0) {
      throw new GovernanceError("SCHEMA_INVALID", "producer.viewsMaintained 不能为空（零视图 producer 无存在意义，C3）", "至少声明一个投影视图（如 truth-index.envelope）", {});
    }
    // C3 resolvability：producer 必须已在 producers[] 注册表可解析（fail-fast——
    // 否则写入即产生违反 REF_INTEGRITY 的悬空派生对象）。
    const registeredProducers = workspace.working.producers as readonly RawRow[];
    const registered = registeredProducers.some(
      (candidate) => candidate.producer_id === producerId,
    );
    if (!registered) {
      throw new GovernanceError(
        "REF_INTEGRITY_VIOLATION",
        `origin=derived 的对象 ${id} 引用了未注册 producer：${producerId}`,
        "C3：先 register_producer 再落派生对象（死 factsource 免疫，GOLDEN-L1-DERIVED-NEEDS-PRODUCER）",
        { id, producerId },
      );
    }
  }

  // 幽灵 owner（FATAL 而非 WARNING）。
  const authority = env.authority as UnknownRecord | undefined;
  if (typeof authority !== "object" || authority === null || typeof authority.owner !== "string") {
    throw new GovernanceError("SCHEMA_INVALID", `对象 ${id} 缺 authority.owner`, "authority.json 可解析的 owner 必填（判卷三问：谁有权改）", { id });
  }
  const authorityMap = loadAuthorityMap(paths);
  if (!(authority.owner in authorityMap.authorities)) {
    throw new GovernanceError(
      "GHOST_AUTHORITY_OWNER",
      `authority.owner "${authority.owner}" 无法在 authority.json 解析`,
      `在 ${paths.authorityPath} 的 authorities 内登记该 owner（BOOTSTRAP 基线）；幽灵 owner=FATAL（维护死锁教训）`,
      { owner: authority.owner, id },
    );
  }

  // SUPERSEDED ⇒ successor_ref 必填（vocab-lock transitions）；其余 lifecycle 允许预登记后继
  // （迁移 CURRENT→SUPERSEDED 的前置：先挂 successor_ref 再转移）。
  let successorRef: string | null = null;
  if (typeof env.successorRef === "string") {
    successorRef = parseIdOrWrap(env.successorRef, "upsert_object.envelope.successorRef");
  }
  if (axes.lifecycle === "SUPERSEDED" && successorRef === null) {
    throw new GovernanceError(
      "SUCCESSOR_REQUIRED",
      `对象 ${id} lifecycle=SUPERSEDED 但缺 successorRef`,
      "先 upsert 后继对象，再本对象挂 successorRef 并转 SUPERSEDED（SUPERSEDED vs DEPRECATED 由有无后继链机器归类）",
      { id },
    );
  }
  if (env.supersedes !== undefined && env.supersedes !== null) {
    const supersedes = env.supersedes as UnknownRecord;
    if (typeof supersedes.id !== "string" || typeof supersedes.reasonShort !== "string" || supersedes.reasonShort.length === 0) {
      throw new GovernanceError("SCHEMA_INVALID", "supersedes 须为 {id, reasonShort}", "替代理由一句话（机器可归类，SUPERSEDED/DEPRECATED 自动判别输入）", {});
    }
    parseIdOrWrap(supersedes.id as string, "upsert_object.envelope.supersedes.id");
  }

  // sources：typed 引用 + pin 三选一必填 + forbidden 两值 FATAL（Transition 层判，留痕）。
  const sources = env.sources;
  if (sources !== undefined) {
    if (!Array.isArray(sources)) {
      throw new GovernanceError("SCHEMA_INVALID", "sources 须为数组", "typed 来源引用（02 SourceRefEntry）", {});
    }
    for (const source of sources) {
      const entry = source as UnknownRecord;
      assertVocabValue(entry.type, SOURCE_TYPE_ALL_VALUES, "sources[].type", `9 值全集：${SOURCE_TYPE_ALL_VALUES.join(" / ")}；forbidden 两值须走合法通道（如 Live Walkthrough）`);
      if (SOURCE_TYPE_FORBIDDEN_VALUES.includes(entry.type as never)) {
        throw new GovernanceError(
          "SOURCE_TYPE_FORBIDDEN",
          `sources[].type="${String(entry.type)}" 属 forbidden 来源`,
          "prototype_html_scrape→Live Walkthrough 活体走查（D23）；ai_invention→补 bp_blueprint/research_evidence 等合法来源后重提（GOLDEN-L3-SCRAPE-FATAL）",
          { type: entry.type, id },
        );
      }
      if (typeof entry.ref !== "string" || entry.ref.length === 0) {
        throw new GovernanceError("SCHEMA_INVALID", "sources[].ref 缺失", "package:// 或仓内相对路径；禁开发机绝对盘符（provenance 可移植纪律）", {});
      }
      if (/^[A-Za-z]:[\\/]/.test(entry.ref)) {
        throw new GovernanceError("SCHEMA_INVALID", `sources[].ref 为绝对盘符路径：${entry.ref}`, "provenance 一律 package:// 或仓内相对路径（check_sources 全数 dev-only 化的教训不再犯）", { ref: entry.ref });
      }
      if (typeof entry.capturedBy !== "string" || entry.capturedBy.length === 0) {
        throw new GovernanceError("SCHEMA_INVALID", "sources[].capturedBy 缺失（采集主体留痕）", "如 human:owner / agent:claude/session-93（永不信任自报值的主体留痕）", {});
      }
      const pin = entry.pin;
      if (typeof pin !== "object" || pin === null) {
        throw new GovernanceError(
          "SOURCE_PIN_MISSING",
          `sources[].pin 缺失（对象 ${id}，ref ${String(entry.ref)}）`,
          "pin 三选一：{baseline}|{version}|{digest}（基线漂移免疫，GOLDEN-L1-SOURCE-PIN）",
          { id },
        );
      }
      const pinRecord = pin as UnknownRecord;
      if (pinRecord.baseline === undefined && pinRecord.version === undefined && pinRecord.digest === undefined) {
        throw new GovernanceError("SOURCE_PIN_MISSING", `sources[].pin 为空对象（对象 ${id}）`, "pin 三选一：{baseline}|{version}|{digest}", { id });
      }
    }
  }

  // R4：change_object / task_object ⇒ payload.class_scan_result 必填。
  const payload = env.payload;
  if (typeof payload !== "object" || payload === null) {
    throw new GovernanceError("SCHEMA_INVALID", "payload 缺失（kind 特有正文自由区）", "至少为空对象；形状契约见 assets/02b-kind-payloads.md", {});
  }
  if (kind === "change_object" || kind === "task_object") {
    assertClassScanResult(payload as UnknownRecord, id);
  }

  // 跨轴耦合断言（归 applyTransaction/REF_INTEGRITY）。
  const permitsActive = (env.permitsActive as readonly string[] | undefined) ?? [];
  for (const permit of permitsActive) {
    if (typeof permit !== "string" || permit.length === 0) {
      throw new GovernanceError("SCHEMA_INVALID", "permitsActive 条目须为非空字符串（PERMIT.* general_id 词形）", "issuePermit 产出的 permitRef", {});
    }
  }
  if (axes.change === "MIGRATING" && permitsActive.length === 0) {
    throw new GovernanceError(
      "CROSS_AXIS_ASSERTION",
      `对象 ${id} change=MIGRATING 但无 ACTIVE PERMIT 引用`,
      "issuePermit 后把 PERMIT.* 写入 permits_active（GOLDEN-L1-MIGRATING-PERMIT）",
      { id },
    );
  }
  if (
    (axes.lifecycle === "PROPOSED" || axes.lifecycle === "REJECTED") &&
    axes.evidence !== "PLANNED"
  ) {
    throw new GovernanceError(
      "CROSS_AXIS_ASSERTION",
      `对象 ${id} lifecycle=${String(axes.lifecycle)} ⇒ evidence 必须为 PLANNED（现 ${String(axes.evidence)}）`,
      "跨轴断言：PROPOSED/REJECTED 尚无实现证据；实现后先转 CURRENT 再抬 evidence",
      { id },
    );
  }

  const denominatorRefs = ((env.denominatorRefs as readonly RawRow[] | undefined) ?? []).map(
    (ref) => {
      const refId = parseIdOrWrap(ref.id as string, "denominatorRefs[].id");
      if (!refId.startsWith("DENOMINATOR.")) {
        throw new GovernanceError("SCHEMA_INVALID", `denominator_refs id 须为 DENOMINATOR.*：${refId}`, "C2：分母是一等公民（05-denominator）", { id: refId });
      }
      const versionSeen = requirePositiveInt(ref.versionSeen as number, "denominatorRefs[].versionSeen", "引用时所见分母版本（分母漂移对账锚）");
      return { id: refId, version_seen: versionSeen };
    },
  );

  // —— 组装 02 正文信封（snake_case） ——
  const existingRow = (workspace.working.objects as RawRow[]).find(
    (row) => row.id === id,
  );
  // A4：upsert 不豁免转移矩阵（transitions.ts 宣称「SUPERSEDED 的唯一再生方式是新建
  // 对象并引用旧 id」，此前 upsert 通道可绕行复活）。对既有对象直改 lifecycle 与
  // transition_object 同判：矩阵裁决 + requires 的 authorityRef 要求；
  // SUPERSEDED→CURRENT 等终态出边在 upsert 通道同样 TRANSITION_ILLEGAL 封死。
  if (existingRow !== undefined) {
    const priorLifecycle = (existingRow.axes as UnknownRecord).lifecycle as string;
    if (priorLifecycle !== axes.lifecycle) {
      const outcome = validateTransition("lifecycle", priorLifecycle as never, axes.lifecycle as never);
      if (!outcome.allowed) {
        throw new GovernanceError(
          "TRANSITION_ILLEGAL",
          `${id}: upsert 直改 lifecycle ${priorLifecycle}→${String(axes.lifecycle)} 被拒（${outcome.reason}）`,
          outcome.hint,
          { id, from: priorLifecycle, to: axes.lifecycle, reason: outcome.reason },
        );
      }
      if (outcome.requires.length > 0 && (tx.authorityRef === undefined || tx.authorityRef.length === 0)) {
        throw new GovernanceError(
          "EVOLUTION_REQUIRED",
          `${id}: upsert 直改 lifecycle ${priorLifecycle}→${String(axes.lifecycle)} requires ${outcome.requires.join(" + ")}，但事务缺 authorityRef`,
          "tx.authorityRef 提供 DECISION.* / CHANGE.* / PERMIT.* 引用（审批或迁移记录）；或先落对象再走 transition_object 通道（upsert 不豁免转移纪律）",
          { id, requires: outcome.requires },
        );
      }
    }
  }
  const existingBody =
    existingRow === undefined
      ? null
      : readBodyFor(paths, workspace.bodyOverlay, existingRow);
  const rev = existingRow === undefined ? 1 : ((existingRow.rev as number) + 1);

  const body: UnknownRecord = {
    id,
    kind,
    axis_profile: env.axisProfile,
    axes: {
      lifecycle: axes.lifecycle,
      confidence: axes.confidence,
      evidence: axes.evidence,
      change: axes.change,
    },
    title_zh: env.titleZh,
    authority: {
      owner: authority.owner,
      delegates: ((authority.delegates as readonly RawRow[] | undefined) ?? []).map(
        (delegate) => ({
          role: delegate.role,
          ...(Array.isArray(delegate.requiredFor) ? { required_for: delegate.requiredFor } : {}),
        }),
      ),
      ...(typeof authority.writePolicy === "string" ? { write_policy: authority.writePolicy } : {}),
      ...(typeof authority.escalationHint === "string" ? { escalation_hint: authority.escalationHint } : {}),
    },
    origin,
    payload,
    rev,
    ...(env.aliases !== undefined && env.aliases !== null ? { aliases: env.aliases } : {}),
    ...(producerId !== null
      ? {
          producer: {
            producer_id: producerId,
            views_maintained: (env.producer as UnknownRecord).viewsMaintained,
          },
        }
      : {}),
    ...(successorRef !== null ? { successor_ref: successorRef } : {}),
    ...(env.supersedes !== undefined && env.supersedes !== null
      ? {
          supersedes: {
            id: (env.supersedes as UnknownRecord).id,
            reason_short: (env.supersedes as UnknownRecord).reasonShort,
          },
        }
      : {}),
    ...(denominatorRefs.length > 0 ? { denominator_refs: denominatorRefs } : {}),
    ...(permitsActive.length > 0 ? { permits_active: permitsActive } : {}),
    ...(sources !== undefined
      ? {
          sources: (sources as readonly RawRow[]).map((source) => ({
            type: source.type,
            ref: source.ref,
            captured_by: source.capturedBy,
            ...(source.locator !== undefined ? { locator: source.locator } : {}),
            ...(source.pin !== undefined ? { pin: source.pin } : {}),
          })),
        }
      : {}),
    ...(env.notesMd !== undefined ? { notes_md: env.notesMd } : {}),
  };

  // 幂等：正文内容（除 rev）与既有正文一致 → 本 op 零变化（rev 不空转）。
  if (existingBody !== null) {
    const { rev: _oldRev, ...oldWithoutRev } = existingBody;
    const { rev: _newRev, ...newWithoutRev } = body;
    void _oldRev;
    void _newRev;
    if (JSON.stringify(oldWithoutRev) === JSON.stringify(newWithoutRev)) {
      return;
    }
  }

  const bodyRef = bodyRefFor(id, kind);
  const bodySha256 = sha256OfCanonical(body);
  workspace.files.set(rowBodyPath(paths, bodyRef), `${JSON.stringify(body, null, 2)}\n`);
  workspace.bodyOverlay.set(id, body);

  const priorRow = existingRow;
  const row: RawRow = {
    id,
    kind,
    axes: body.axes,
    title_zh: env.titleZh,
    authority_owner: authority.owner,
    origin,
    rev,
    body_ref: bodyRef,
    body_sha256: bodySha256,
    denominator_refs: denominatorRefs,
    binding_summary:
      priorRow !== undefined
        ? priorRow.binding_summary
        : { declared: 0, probe_status: "not_configured" },
    evidence_summary: recomputeEvidenceSummary(workspace, id),
    permits_active: permitsActive,
    ...(producerId !== null ? { producer_id: producerId } : {}),
  };
  const objects = workspace.working.objects as RawRow[];
  if (priorRow === undefined) {
    objects.push(row);
  } else {
    Object.assign(priorRow, row);
  }
  workspace.changedObjectIds.add(id);
  workspace.anyChange = true;
}

function assertClassScanResult(payload: UnknownRecord, id: string): void {
  const scan = payload.class_scan_result;
  if (typeof scan !== "object" || scan === null) {
    throw new GovernanceError(
      "CLASS_SCAN_REQUIRED",
      `对象 ${id}（change_object/task_object）缺 payload.class_scan_result`,
      "R4：修一处必须扫一类——补 {scope, hits, fixed_count, regression_case_ref}（回归锚建议 TEST.* 或 GRN-*）",
      { id },
    );
  }
  const scanRecord = scan as UnknownRecord;
  if (typeof scanRecord.scope !== "string" || scanRecord.scope.length === 0) {
    throw new GovernanceError("SCHEMA_INVALID", `class_scan_result.scope 缺失（对象 ${id}）`, "记录『同类问题扫了哪里』（选择器/目录/目标集描述）", { id });
  }
  requireNonNegativeInt(scanRecord.hits as number, "class_scan_result.hits", "同类问题现存实例命中数 ≥0（csvEscape×16 类事故的计数化）");
  requireNonNegativeInt(scanRecord.fixed_count as number, "class_scan_result.fixed_count", "本轮已修复数 ≥0（fixed_count ≤ hits 归 Gate 层校验）");
  if (typeof scanRecord.regression_case_ref !== "string" || scanRecord.regression_case_ref.length === 0) {
    throw new GovernanceError("SCHEMA_INVALID", `class_scan_result.regression_case_ref 缺失（对象 ${id}）`, "回归用例引用：TEST.*（fixture 域）或 GRN-*（运行记录）", { id });
  }
}

function recomputeEvidenceSummary(workspace: TxWorkspace, id: string): UnknownRecord {
  const { paths } = workspace;
  const counts = { claims: 0, verified: 0, unverified: 0, rejected: 0 };
  const countClaim = (claim: UnknownRecord): void => {
    const subject = claim.subject as UnknownRecord | undefined;
    if (subject === undefined || subject.object_id !== id) return;
    counts.claims += 1;
    const verification = claim.verification as UnknownRecord | undefined;
    const verdict = verification?.verdict;
    if (verdict === "VERIFIED") counts.verified += 1;
    else if (verdict === "REJECTED") counts.rejected += 1;
    else counts.unverified += 1; // UNVERIFIED 与 PARTIALLY_VERIFIED 均未完全验证
  };
  // 本事务待写的 claims（staged 计划）先收集：同一 clm 以 staged（更新）为准——
  // A7：磁盘扫描与 staged 扫描若无条件双计，重录场景同一 CLM 会计成 claims=2。
  const claimsDirPrefix = `${paths.claimsDir}/`;
  const stagedClaims = new Map<string, UnknownRecord>();
  for (const [path, next] of workspace.files) {
    if (!path.startsWith(claimsDirPrefix) || !path.endsWith(".json")) continue;
    const claim = JSON.parse(next) as UnknownRecord;
    stagedClaims.set(String(claim.clm), claim);
  }
  // 已提交的 claims（磁盘）；staged 已覆盖的 clm 跳过（同一 clm 只计一次）
  let files: string[] = [];
  try {
    files = readdirSync(paths.claimsDir);
  } catch {
    files = [];
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const text = readText(`${paths.claimsDir}/${file}`);
    if (text === null) continue;
    const claim = JSON.parse(text) as UnknownRecord;
    if (stagedClaims.has(String(claim.clm))) continue;
    countClaim(claim);
  }
  for (const claim of stagedClaims.values()) {
    countClaim(claim);
  }
  return counts;
}

// —— transition_object ——

function applyTransitionObject(
  workspace: TxWorkspace,
  op: Extract<TransactionOp, { op: "transition_object" }>,
  tx: Transaction,
): void {
  const { paths } = workspace;
  const id = parseIdOrWrap(op.id as string, "transition_object.id");
  const objects = workspace.working.objects as RawRow[];
  const row = objects.find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `转移目标对象不存在：${id}`,
      "先 upsert_object 登记，再发起转移；或核对 id 拼写（resolveAlias 可查 legacy 收编链）",
      { id },
    );
  }
  const body = readBodyFor(paths, workspace.bodyOverlay, row);
  if (body === null) {
    throw new GovernanceError(
      "REF_INTEGRITY_VIOLATION",
      `对象 ${id} 的正文文件缺失：${String(row.body_ref)}`,
      "从 git 恢复正文或重新 upsert",
      { id },
    );
  }
  const currentAxes = row.axes as UnknownRecord;
  const patch = op.patch as UnknownRecord;
  const nextAxes: UnknownRecord = { ...currentAxes };
  for (const axis of ["lifecycle", "confidence", "evidence", "change"] as const) {
    if (patch[axis] !== undefined) {
      const allowed =
        axis === "lifecycle" ? LIFECYCLE_VALUES
        : axis === "confidence" ? CONFIDENCE_VALUES
        : axis === "evidence" ? EVIDENCE_VALUES
        : CHANGE_VALUES;
      assertVocabValue(patch[axis], allowed, `patch.${axis}`, `词表见 vocab-lock state_axes.${axis}（FROZEN）`);
      nextAxes[axis] = patch[axis];
    }
  }

  const from = currentAxes.lifecycle as string;
  const to = nextAxes.lifecycle as string;
  // 仅当 lifecycle 实际变更时走转移矩阵（patch 只动 confidence/evidence/change 是
  // 轴补丁而非迁移；from===to 的自环仅对「显式声明的 lifecycle 迁移」判非法）。
  const lifecycleChanged = patch.lifecycle !== undefined && patch.lifecycle !== from;
  if (lifecycleChanged) {
    const outcome = validateTransition("lifecycle", from as never, to as never);
    if (!outcome.allowed) {
      throw new GovernanceError(
        "TRANSITION_ILLEGAL",
        `${id}: ${from}→${to} 被拒（${outcome.reason}）`,
        outcome.hint,
        { id, from, to, reason: outcome.reason },
      );
    }
    if (outcome.requires.length > 0 && (tx.authorityRef === undefined || tx.authorityRef.length === 0)) {
      throw new GovernanceError(
        "EVOLUTION_REQUIRED",
        `${id}: ${from}→${to} requires ${outcome.requires.join(" + ")}，但事务缺 authorityRef`,
        "tx.authorityRef 提供 DECISION.* / CHANGE.* / PERMIT.* 引用（审批或迁移记录）；技术路线变更走 ACR/进化通道（GOLDEN-L3-CASE-C reason_code=evolution_required）",
        { id, requires: outcome.requires },
      );
    }
    if (to === "SUPERSEDED" && typeof body.successor_ref !== "string") {
      throw new GovernanceError(
        "SUCCESSOR_REQUIRED",
        `${id}: 转入 SUPERSEDED 前必须已有 successor_ref`,
        "先 upsert 后继对象并在本对象挂 successor_ref（vocab-lock：SUPERSEDED 终态 successor_ref 必填）",
        { id },
      );
    }
  }
  if (
    currentAxes.confidence === "LOCKED" &&
    currentAxes.change === "STABLE" &&
    nextAxes.change === "CHALLENGED" &&
    (tx.authorityRef === undefined || tx.authorityRef.length === 0)
  ) {
    throw new GovernanceError(
      "EVOLUTION_REQUIRED",
      `${id}: LOCKED+STABLE→CHALLENGED 必持 DECISION/CHANGE 引用`,
      "tx.authorityRef 提供决策引用（LOCKED 不是圣旨，但也不是随便挑战——GOLDEN-L1-LOCKED-CHALLENGE）",
      { id },
    );
  }
  if (nextAxes.change === "MIGRATING") {
    const permits = (row.permits_active as readonly string[] | undefined) ?? [];
    if (permits.length === 0) {
      throw new GovernanceError(
        "CROSS_AXIS_ASSERTION",
        `${id}: change=MIGRATING 但 permits_active 为空`,
        "issuePermit 后把 PERMIT.* 写入 permits_active（GOLDEN-L1-MIGRATING-PERMIT）",
        { id },
      );
    }
  }
  if (
    (nextAxes.lifecycle === "PROPOSED" || nextAxes.lifecycle === "REJECTED") &&
    nextAxes.evidence !== "PLANNED"
  ) {
    throw new GovernanceError(
      "CROSS_AXIS_ASSERTION",
      `${id}: lifecycle=${String(nextAxes.lifecycle)} ⇒ evidence 必须为 PLANNED`,
      "跨轴断言；先转 CURRENT 再抬 evidence",
      { id },
    );
  }

  body.axes = nextAxes;
  const newRev = (row.rev as number) + 1;
  body.rev = newRev;
  row.axes = nextAxes;
  row.rev = newRev;
  const bodyPath = rowBodyPath(paths, row.body_ref as string);
  workspace.files.set(bodyPath, `${JSON.stringify(body, null, 2)}\n`);
  workspace.bodyOverlay.set(id, body);
  row.body_sha256 = sha256OfCanonical(body);
  workspace.changedObjectIds.add(id);
  workspace.anyChange = true;
}

// —— register_producer ——

function applyRegisterProducer(workspace: TxWorkspace, record: ProducerRecord): void {
  const producerId = record.producerId;
  if (typeof producerId !== "string" || !/^prod\.[a-z][a-z0-9_]{1,63}$/.test(producerId)) {
    throw new GovernanceError("SCHEMA_INVALID", `producer_id 词形非法：${String(producerId)}`, "prod. 强制前缀 + 小写蛇形（06-producer 单一事实源）", { producerId });
  }
  assertVocabValue(record.kind, PRODUCER_KIND_VALUES, "producer.kind", "builtin / project（external 词形已废止）");
  if (typeof record.entrypoint !== "string" || !/^package:\/\/[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(record.entrypoint)) {
    throw new GovernanceError("SCHEMA_INVALID", `entrypoint 须为 package:// 相对引用：${String(record.entrypoint)}`, "绝对盘符路径结构性禁止（provenance 可移植性教训）", { entrypoint: record.entrypoint });
  }
  requireNonNegativeInt(record.objectsClaimed as number, "objectsClaimed", "声明产出对象数 ≥0（自报孪生，kernel 重算对账）");
  if (!Array.isArray(record.viewsMaintained) || record.viewsMaintained.length === 0) {
    throw new GovernanceError("SCHEMA_INVALID", "viewsMaintained 不能为空（minItems 1，C3）", "至少声明一个投影视图", {});
  }
  const liveness = record.liveness;
  assertVocabValue(liveness?.status, ["active", "stale", "dead"], "liveness.status", "active / stale / dead（suspect_stale→stale、dead_view→dead 已收敛）");
  requireNonNegativeInt(liveness?.runsSinceLastOutput as number, "liveness.runsSinceLastOutput", "距最近产出的 rebuild 轮数 ≥0");
  requireNonNegativeInt(liveness?.lastOutputSeq as number, "liveness.lastOutputSeq", "最近产出的事务序号 ≥0（0=从未产出，合法初始态）");
  if (liveness.status === "dead" && (liveness.runsSinceLastOutput as number) < 1) {
    throw new GovernanceError("SCHEMA_INVALID", `dead 而 runs_since_last_output=0 自相矛盾（producer ${producerId}）`, "dead ⇒ runs_since_last_output ≥ 1（06 allOf：要么从未产出要么已断供，不可能『刚产出却死了』）", { producerId });
  }

  const snake: RawRow = {
    producer_id: producerId,
    kind: record.kind,
    entrypoint: record.entrypoint,
    objects_claimed: record.objectsClaimed,
    views_maintained: [...record.viewsMaintained],
    liveness: {
      status: liveness.status,
      runs_since_last_output: liveness.runsSinceLastOutput,
      last_output_seq: liveness.lastOutputSeq,
    },
  };
  const producers = workspace.working.producers as RawRow[];
  const existingIndex = producers.findIndex((producer) => producer.producer_id === producerId);
  if (existingIndex >= 0) {
    if (JSON.stringify(producers[existingIndex]) === JSON.stringify(snake)) {
      return; // 幂等重注册：零变化
    }
    producers[existingIndex] = snake;
  } else {
    producers.push(snake);
  }
  workspace.anyChange = true;
}

// —— heartbeat ——

function applyHeartbeat(
  workspace: TxWorkspace,
  op: Extract<TransactionOp, { op: "heartbeat" }>,
): void {
  const producerId = op.producerId;
  const producers = workspace.working.producers as RawRow[];
  const producer = producers.find((candidate) => candidate.producer_id === producerId);
  if (producer === undefined) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `heartbeat 指向未注册 producer：${producerId}`,
      "先 register_producer 再发心跳（活性对账以注册表为分母，C3/C5）",
      { producerId },
    );
  }
  for (const objectId of op.wroteObjectIds) {
    parseIdOrWrap(objectId as string, "heartbeat.wroteObjectIds[]");
  }
  // 心跳原文追加 runtime 侧车（不进 hash，A4）；索引只更新活性快照。
  const line = `${JSON.stringify({
    seq: workspace.nextSeq,
    producer_id: producerId,
    wrote_object_ids: op.wroteObjectIds,
  })}\n`;
  const heartbeatPath = workspace.paths.heartbeatPath;
  // 拼接基底先取同事务既有 staged 计划（A6：第二个 heartbeat op 若读磁盘会把第一个
  // op 已计划的行整体覆盖——同事务多心跳只剩一行而索引 liveness 却逐个更新）；
  // 无 staged 计划才回读磁盘。
  const stagedBase = workspace.files.get(heartbeatPath);
  workspace.files.set(heartbeatPath, `${stagedBase ?? readText(heartbeatPath) ?? ""}${line}`);
  producer.liveness = {
    status: "active",
    runs_since_last_output: 0,
    last_output_seq: workspace.nextSeq,
  };
  workspace.anyChange = true;
}

// —— append_denominator ——

function applyAppendDenominator(workspace: TxWorkspace, entry: DenominatorEntry): void {
  const id = parseIdOrWrap(entry.id as string, "append_denominator.entry.id");
  if (!id.startsWith("DENOMINATOR.")) {
    throw new GovernanceError("SCHEMA_INVALID", `分母 id 须为 DENOMINATOR.*：${id}`, "C2：分母是一等公民（05-denominator）", { id });
  }
  requirePositiveInt(entry.version as number, "denominator.version", "版本严格从 1 起且只增不减（append-only 版本化数组）");
  requireNonNegativeInt(entry.membersCount as number, "denominator.membersCount", "成员计数 ≥0（=0 合法但高危，gate 须报缺口）");
  assertVocabValue(entry.status, ["PROPOSED", "CURRENT", "SUPERSEDED"], "denominator.status", "kind 级收窄子集（封死 DEPRECATED/RETIRED/REJECTED：删除路径与『只许 supersede』互斥）");
  if (entry.status === "SUPERSEDED" && typeof entry.successorRef !== "string") {
    throw new GovernanceError(
      "SUCCESSOR_REQUIRED",
      `分母 ${id} v${String(entry.version)} status=SUPERSEDED 但缺 successorRef`,
      "vocab-lock：SUPERSEDED 终态后继必填（旧分母终态留档永不删除）",
      { id },
    );
  }
  const successorOf = (entry.successorOf as readonly string[] | undefined) ?? [];
  if (successorOf.includes(id)) {
    throw new GovernanceError(
      "REF_INTEGRITY_VIOLATION",
      `分母 ${id} 的 successor_of 含自身 id`,
      "DENOM_CHAIN_002：successor_of / successor_ref 不得含自身 id，全链无环",
      { id },
    );
  }
  for (const predecessor of successorOf) {
    parseIdOrWrap(predecessor as string, "append_denominator.entry.successorOf[]");
  }
  if (typeof entry.authority?.owner !== "string" || entry.authority.owner.length === 0) {
    throw new GovernanceError("SCHEMA_INVALID", `分母 ${id} 缺 authority.owner`, "无主分母 = 无人能批准其 supersede（05 authority.owner 必填）", { id });
  }
  const selector = entry.memberSelector;
  const hasSelector =
    (typeof selector?.viaBindingTable === "string" && selector.viaBindingTable.length > 0) ||
    (typeof selector?.filter === "object" && selector.filter !== null);
  if (!hasSelector) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `分母 ${id} 的 member_selector 为空（至少一个派生依据）`,
      "成员集合必须可机械重算（via_binding_table / filter）；手抄成员清单无位置（防分母漂移）",
      { id },
    );
  }
  const denominators = workspace.working.denominators as RawRow[];
  const duplicate = denominators.some(
    (candidate) => candidate.id === id && candidate.version === entry.version,
  );
  if (duplicate) {
    throw new GovernanceError(
      "REF_INTEGRITY_VIOLATION",
      `(id, version)=(${id}, ${String(entry.version)}) 已存在`,
      "DENOM_UNIQ_001：同一 (id, version) 唯一；成员口径变化请 version+1 追加（旧 version 不复用）",
      { id, version: entry.version },
    );
  }
  denominators.push({
    id,
    version: entry.version,
    members_count: entry.membersCount,
    member_selector: {
      ...(typeof selector.viaBindingTable === "string" ? { via_binding_table: selector.viaBindingTable } : {}),
      ...(selector.filter !== undefined ? { filter: selector.filter } : {}),
    },
    successor_of: [...successorOf],
    authority: { owner: entry.authority.owner },
    status: entry.status,
    ...(typeof entry.successorRef === "string" ? { successor_ref: entry.successorRef } : {}),
  });
  workspace.anyChange = true;
}

// —— record_claim / record_gate_run 共用的存在性防线 ——

/**
 * 已判定态 claim verdict 词表（镜像 cli/evidence.ts 的 ADJUDICATED_VERIFICATION_VERDICTS；
 * canonicalize 二道防线用——独立验证流判过的记录，record 通道不得经 canonicalize 打回）。
 */
const ADJUDICATED_CLAIM_VERDICTS: ReadonlySet<string> = new Set([
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "REJECTED",
]);

/**
 * A3 证据记录存在性防线（D20 纪律：record 通道无权覆写既有证据——对照
 * cli/evidence.ts 的 skipped_adjudicated 守卫，CLI 层有守卫而 kernel 写权威此前裸奔：
 * 实测重录把独立验证流判的 VERIFIED 打回 UNVERIFIED、同号 GRN 静默翻转 verdict）。
 * 写前查既有文件（staged 计划优先，其次磁盘）：
 * - 不存在 → 正常写入；
 * - 存在且 canonical 内容等价（rev 剥离比对——rev 是事务自动维护字段非语义内容）→
 *   幂等短路（零写入零 journal，重复入账不空转 seq，字节稳定）；
 * - 存在但内容不同 → 默认 EVIDENCE_ALREADY_EXISTS 显式拒绝；既有文件损坏同样拒绝
 *   （禁静默覆写损毁现场）；
 * - 存在且内容不同、op 显式携 canonicalizeOverwrite 凭据 → 放行覆写（判定可复核的
 *   canonical 化重录；TX_APPLIED ops 记 *_canonicalize 可审计词形留痕）。但 kernel
 *   已能零成本读到既有记录，二道防线不留给 CLI 信任边界：既有 claim 处判定态时
 *   canonicalize 亦拒（已判定记录不可 canonical 化，须走新 id——判定改判归独立
 *   验证流通道）。run 无判定态概念，重放 verdict 翻转属 sanctioned 再判卷。
 */
function evidenceRecordDisposition(
  workspace: TxWorkspace,
  path: string,
  record: UnknownRecord,
  context: string,
  options: {
    readonly canonicalizeOverwrite: boolean;
    readonly existingAdjudicated: (existing: UnknownRecord) => boolean;
  },
): "write" | "short_circuit" {
  const existingText = workspace.files.get(path) ?? readText(path);
  if (existingText === undefined || existingText === null) return "write";
  let existing: UnknownRecord;
  try {
    existing = JSON.parse(existingText) as UnknownRecord;
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${context}：既有证据文件无法解析（损坏或手改）：${path}`,
      "从 git 恢复该证据文件，或人工核实后删除损坏文件再重录；禁静默覆写损毁现场",
      { path, cause: String(error) },
    );
  }
  const { rev: _existingRev, ...existingWithoutRev } = existing;
  const { rev: _recordRev, ...recordWithoutRev } = record;
  void _existingRev;
  void _recordRev;
  if (JSON.stringify(existingWithoutRev) === JSON.stringify(recordWithoutRev)) {
    return "short_circuit";
  }
  if (!options.canonicalizeOverwrite) {
    throw new GovernanceError(
      "EVIDENCE_ALREADY_EXISTS",
      `${context}：证据记录 id 冲突禁覆写（${path} 已存在且内容不同）`,
      "record 通道无权覆写既有证据（D20）：新证据请分配新 id（CLM-*/GRN-* 由通路顺延）；同号修订属判定改判，走独立验证流通道，不经 record 重录",
      { path },
    );
  }
  if (options.existingAdjudicated(existing)) {
    throw new GovernanceError(
      "EVIDENCE_ALREADY_EXISTS",
      `${context}：既有记录已处判定态，canonicalizeOverwrite 亦不可覆写（${path}）`,
      "已判定记录不可 canonical 化，须走新 id（CLM-*/GRN-* 由通路顺延）；判定改判归独立验证流通道，record 通道（含显式 canonicalizeOverwrite）无权代行",
      { path },
    );
  }
  return "write";
}

// —— record_claim ——

function applyRecordClaim(
  workspace: TxWorkspace,
  op: Extract<TransactionOp, { op: "record_claim" }>,
): void {
  const claim = op.claim;
  const { paths } = workspace;
  if (typeof claim.clm !== "string" || !/^CLM-[0-9]+$/.test(claim.clm)) {
    throw new GovernanceError("SCHEMA_INVALID", `clm 词形非法（须 CLM-[0-9]+）：${String(claim.clm)}`, "claim 记录 id 词形（evidence/claims/CLM-*.json）", { clm: claim.clm });
  }
  // execution_id 透传（P20：执行身份贯穿证据链；携带即校验——词形 + 档案存在性，
  // S1：身份是基础设施印的，自造身份 fail-closed。缺席 = 键缺席，与存量字节兼容）。
  if (claim.executionId !== undefined) {
    assertExecutionIdClaimed(paths, claim.executionId, "record_claim.claim.executionId");
  }
  const subjectId = parseIdOrWrap(claim.subjectId as string, "record_claim.claim.subjectId");
  const objects = workspace.working.objects as RawRow[];
  const row = objects.find((candidate) => candidate.id === subjectId);
  if (row === undefined) {
    throw new GovernanceError(
      "OBJECT_NOT_FOUND",
      `claim 的 subject 对象不存在：${subjectId}`,
      "先 upsert_object 再挂 claim（evidence_summary 计数挂在对象信封行上，C5）",
      { subjectId },
    );
  }
  if (typeof claim.assertion !== "string" || claim.assertion.length === 0) {
    throw new GovernanceError("SCHEMA_INVALID", "assertion 缺失（声称正文）", "结构化断言码 + 人类可读句；允许先立后证，但空断言不是声称", {});
  }
  const isFixture = subjectId.startsWith("TEST.");
  const evidenceRefs = (claim.evidenceRefs as readonly string[] | undefined) ?? [];
  const typedRefs = evidenceRefs.map((ref) => {
    if (/^GRN-[0-9]+$/.test(ref)) {
      return { ref_type: "gate_result", grn: ref } as UnknownRecord;
    }
    try {
      parseIdOrWrap(ref, "record_claim.claim.evidenceRefs[]");
      return { ref_type: "truth_object", object_id: ref } as UnknownRecord;
    } catch {
      return {
        ref_type: "blob",
        blob: { sha256: sha256OfCanonical({ ref }), media: "text" },
      } as UnknownRecord;
    }
  });
  const record: UnknownRecord = {
    record_type: "claim",
    clm: claim.clm,
    ...(claim.executionId !== undefined ? { execution_id: claim.executionId } : {}),
    subject: { object_id: subjectId },
    is_fixture: isFixture,
    assertion: claim.assertion,
    asserted_by: {
      actor_type: claim.assertedBy.actorType,
      actor: claim.assertedBy.actor,
      self_attested: claim.assertedBy.selfAttested,
    },
    // Q3：允许先立后证（空 evidence_refs 合法）——verification 由 kernel 登记
    // UNVERIFIED 初始态；VERIFIED 判定归独立验证流（D20：声称方不可自填 VERIFIED）。
    verification: {
      verdict: "UNVERIFIED",
      recomputed_by: { actor_type: "kernel", actor: "pomaster-kernel", self_attested: false },
    },
    evidence_refs: typedRefs,
    rev: workspace.nextSeq,
    ...(claim.notesMd !== undefined ? { notes_md: claim.notesMd } : {}),
  };
  // A3 存在性防线：同 clm 幂等短路（不重算计数、不进 changed ids）；异内容默认拒绝
  // 覆写，显式 canonicalizeOverwrite 凭据放行——但既有判定态（VERIFIED 等）仍拒。
  const disposition = evidenceRecordDisposition(
    workspace,
    `${paths.claimsDir}/${claim.clm}.json`,
    record,
    `record_claim（${claim.clm}）`,
    {
      canonicalizeOverwrite: op.canonicalizeOverwrite === true,
      existingAdjudicated: (existing) => {
        const verification = existing["verification"] as UnknownRecord | undefined;
        const verdict = verification === undefined ? undefined : verification["verdict"];
        return typeof verdict === "string" && ADJUDICATED_CLAIM_VERDICTS.has(verdict);
      },
    },
  );
  if (disposition === "short_circuit") return;
  workspace.files.set(
    `${paths.claimsDir}/${claim.clm}.json`,
    `${JSON.stringify(record, null, 2)}\n`,
  );
  // evidence_summary 只认 kernel 登记的判定（当前 UNVERIFIED）——重算保持计数诚实。
  row.evidence_summary = recomputeEvidenceSummary(workspace, subjectId);
  workspace.changedObjectIds.add(subjectId);
  workspace.anyChange = true;
}

// —— record_gate_run ——

function applyRecordGateRun(
  workspace: TxWorkspace,
  op: Extract<TransactionOp, { op: "record_gate_run" }>,
): void {
  const { paths } = workspace;
  const run = op.run;
  const result = run.result;
  if (typeof run.grn !== "string" || !/^GRN-[0-9]+$/.test(run.grn)) {
    throw new GovernanceError("GRN_INVALID", `grn 词形非法（须 GRN-[0-9]+）：${String(run.grn)}`, "GRN id 由 GateRunner 分配（evidence/runs/GRN-*.json）", { grn: run.grn });
  }
  if (result.grn !== run.grn) {
    throw new GovernanceError("GRN_INVALID", `record_gate_run.grn(${run.grn}) 与 result.grn(${result.grn}) 不一致`, "07 run_record：inline 模式下两者须一致（执行层一致性校验）", { grn: run.grn });
  }
  // execution_id 透传（P20：执行身份贯穿证据链；携带即校验，缺席 = 键缺席存量兼容——
  // 裁定详见 execution.ts 头注「可选字段 + 携带即强制校验」）。
  if (run.executionId !== undefined) {
    assertExecutionIdClaimed(paths, run.executionId, "record_gate_run.run.executionId");
  }
  // artifact_refs 透传（P0.5-2 / PRD §7；裁决8③ D2/D3=A）：携带即 kernel 侧强制校验
  // （词形 + 路径⇔身份派生一致 + blob 文件在场——先 persist 再 record，悬空引用
  // REF_INTEGRITY 拒收）；缺席 = 键缺席，存量 GRN 字节兼容。落盘键 artifact_refs 在
  // execution_id 之后、gate_result 之前——与 cli canonicalRunBytes 逐键同构（R1 双写点）。
  const artifactRefs = assertArtifactRefs(run.artifactRefs);
  if (artifactRefs !== undefined) {
    assertArtifactBlobsExist(artifactRefs, paths.evidenceDir);
  }
  assertVocabValue(result.verdict, VERDICT_VALUES, "result.verdict", `七态：${VERDICT_VALUES.join(" / ")}`);
  assertVocabValue(run.trigger, RUN_TRIGGER_VALUES, "run.trigger", `run_trigger 词表：${RUN_TRIGGER_VALUES.join(" / ")}`);
  // Q3 双向强校验（fixture 隔离）。
  const subjectIsFixture = result.subjectId !== null && result.subjectId.startsWith("TEST.");
  if (subjectIsFixture !== result.isFixture) {
    throw new GovernanceError(
      "FIXTURE_ISOLATION_VIOLATION",
      `Q3 双向强校验失败：subjectId=${String(result.subjectId)} isFixture=${String(result.isFixture)}`,
      "normalizeGateResult 已强制同真同假；此处为落盘前二道防线",
      { subjectId: result.subjectId, isFixture: result.isFixture },
    );
  }
  const record: UnknownRecord = {
    record_type: "run",
    grn: run.grn,
    ran_at_seq: result.ranAtSeq,
    trigger: { type: run.trigger },
    ...(run.executionId !== undefined ? { execution_id: run.executionId } : {}),
    ...(artifactRefs !== undefined ? { artifact_refs: artifactRefsToSnake(artifactRefs) } : {}),
    gate_result: { mode: "inline", result: gateResultToSnake(result) },
  };
  // A3 存在性防线：同 grn 幂等短路；异内容（如 verdict 翻转）默认拒绝静默覆写，
  // 显式 canonicalizeOverwrite 凭据放行。run 无判定态概念（verdict 是 run 本身内容，
  // 非独立验证流的判定字段）——重放翻转属 sanctioned 再判卷，不设已判定态拦截。
  const disposition = evidenceRecordDisposition(
    workspace,
    `${paths.runsDir}/${run.grn}.json`,
    record,
    `record_gate_run（${run.grn}）`,
    {
      canonicalizeOverwrite: op.canonicalizeOverwrite === true,
      existingAdjudicated: () => false,
    },
  );
  if (disposition === "short_circuit") return;
  workspace.files.set(
    `${paths.runsDir}/${run.grn}.json`,
    `${JSON.stringify(record, null, 2)}\n`,
  );
  workspace.anyChange = true;
}

// —— health / generation 终算 ——

function finalizeHealth(workspace: TxWorkspace): void {
  const working = workspace.working;
  const producers = working.producers as RawRow[];
  const deadProducers = producers
    .filter((producer) => (producer.liveness as UnknownRecord).status === "dead")
    .map((producer) => producer.producer_id as string)
    .sort();
  const objects = working.objects as RawRow[];
  const conflicts = computeAliasConflicts(workspace, objects);
  const health = working.health as UnknownRecord;
  health.dead_producers = deadProducers;
  health.alias_conflicts = conflicts;
  // orphaned_objects / worst_blindspot：v0 kernel 不派生，保留先前值（确定性）。
}

/** 三重查重（canonical / normalized_key / aliases）冲突输出；非空即 FATAL 级 DEFECT。 */
function computeAliasConflicts(
  workspace: TxWorkspace,
  objects: readonly RawRow[],
): UnknownRecord[] {
  const keys = new Map<string, Set<string>>();
  const register = (key: string, id: string): void => {
    const bucket = keys.get(key) ?? new Set<string>();
    bucket.add(id);
    keys.set(key, bucket);
  };
  for (const row of objects) {
    const id = row.id as string;
    register(normalizedKey(id), id);
    const body =
      workspace.bodyOverlay.get(id) ??
      (() => {
        const text = readText(rowBodyPath(workspace.paths, row.body_ref as string));
        if (text === null) return null;
        try {
          return JSON.parse(text) as UnknownRecord;
        } catch {
          return null;
        }
      })();
    const aliases = body?.aliases;
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (typeof alias === "string" && alias.length > 0) {
          register(normalizedKey(alias), id);
        }
      }
    }
  }
  const conflicts: UnknownRecord[] = [];
  for (const [key, ids] of [...keys.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ids.size >= 2) {
      conflicts.push({ normalized_key: key, conflicting_ids: [...ids].sort() });
    }
  }
  return conflicts;
}

function finalizeGeneration(workspace: TxWorkspace, fingerprint: string): void {
  const working = workspace.working;
  const previous = working.generation as UnknownRecord;
  working.generation = {
    tool: typeof previous.tool === "string" ? previous.tool : KERNEL_TOOL,
    seq: workspace.nextSeq,
    inputs_fingerprint: fingerprint,
  };
  working.content_digest = contentDigestOf(scopeOf(working, working.generation as UnknownRecord));
}
