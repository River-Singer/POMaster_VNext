/**
 * reconcile.ts —— 八拍⑥ RECONCILE：按 Permit 签发基线出 delta 三段报告
 * （changed_objects / exceptions / samples_to_review；D20/D21：人只审 delta/例外/抽样，
 * 不再逐行看全文）。
 *
 * 设计契约：docs/eight-beat-carriers-design.md §3 与 docs/kernel-api.md §10。
 *
 * 纪律落点：
 * - 纯读零写：报告生成不产生治理事实、不落任何文件；同 store state + 同参数重放
 *   输出字节稳定（A4：stride 抽样确定、零墙钟、一切序号锚定 seq/rev）。
 * - 基线 closure（§3.3）：基线快照在 permit issue 瞬间存入台账（PermitRecord.baseline，
 *   经 permits.readPermitsFile 复用读取）——journal 是事件流无 axes 历史，事后不可重建；
 *   reconcile 只读不重建。baseline 缺失（旧形态许可）= baseline_missing=true 显式 fail，
 *   不拿「没有基线」冒充「无变化」（not_configured ≠ passed 的 ⑥ 拍镜像）。
 * - D24：content_drift 判定只用台账内既有 body_sha256（读侧 identity 用途，事务自动
 *   维护）；人永不计算哈希。row 级正文探测（N1 盲区收窄：分母 = 抽中样本 ∪
 *   changed_objects）由本模块机器重算正文指纹并与索引行对账——纯读只报不修（失配 →
 *   content_tamper 例外，不拦写；写侧 auto-regen 仍归 applyTransaction.sweepDigestTampering
 *   双轨分工）。
 * - 四态纪律：content_drift=null 是「基线无 sha 锚/对象 absent」的显式未知，不冒充
 *   「无漂移」；verdict_census 全量计数（含例外条目与 scope 外条目）——聚合不吞没，
 *   不进例外段 ≠ 不可见。
 * - 词表纪律：verdict 取既有七态闭包 / verification 四值闭包；changed_objects 的 kind
 *   词形是 CLI 呈现层局部词 → TODO(vocab-pr)。
 */
import { readdirSync } from "node:fs";
import type { ObjectRow, Store } from "./index.js";
import { GovernanceError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";
import { readText } from "./io.js";
import { loadTruthIndex } from "./store.js";
import { readPermitsFile, type PermitBaselineSubject } from "./permits.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";
import type { VerdictValue } from "./vocab.js";

// ============================================================
// 词形与常量（呈现层局部词 TODO(vocab-pr)；verdict 取既有词表闭包）
// ============================================================

/** --samples 缺省值（设计 §3.1：缺省 3，≥0；0 = 显式放弃抽样，不静默）。 */
export const DEFAULT_RECONCILE_SAMPLES = 3 as const;

/**
 * runs 平面进例外段的 verdict 集合（设计 §3.2：failed / not_configured / skipped_blindspot；
 * 逐值标注 VerdictValue → 词表闭包编译期防拼写漂移，绝不发明新 verdict）。其余 verdict
 * （passed/warning/blocked/not_run…）不进例外段，但 verdict_census 全量计数可见。
 */
export const RECONCILE_EXCEPTION_RUN_VERDICTS: readonly VerdictValue[] = [
  "failed",
  "not_configured",
  "skipped_blindspot",
];

/**
 * changed_objects 条目的 kind 词形（CLI 呈现层局部词 → TODO(vocab-pr)）：
 * - axes_change：四轴任一 from≠to（axes 只列变化的轴）；
 * - materialized：签发时 absent、现已存在（PROPOSED 新对象落地，合法但人须知道）；
 * - vanished：签发时存在、现已消失（含索引行仍在但正文文件缺失的 REF 异常形态）——必 fail；
 * - content_drift：四轴未变而 body_sha256 变化（静默漂移显式打捞）。
 *   设计 §3.2 列了前三值；其自身定义的 content_drift=true 状态（「变了而四轴未变」）
 *   需要一个宿主词形——按设计 §6「呈现层局部词带 TODO(vocab-pr)」机制补第 4 词形，
 *   不冒用 axes_change（其定义明确要求四轴任一 from≠to）。
 */
export const RECONCILE_DELTA_KINDS = [
  "axes_change",
  "materialized",
  "vanished",
  "content_drift",
] as const;

export type ReconcileDeltaKind = (typeof RECONCILE_DELTA_KINDS)[number];

// ============================================================
// 报告形态（snake_case：CLI --json 信封逐字渲染，kernel 即呈现权威）
// ============================================================

export interface ReconcileChangedObject {
  readonly id: string;
  readonly kind: ReconcileDeltaKind;
  /** 只列变化的轴（from≠to）；无轴变化（materialized/vanished/content_drift）= null。 */
  readonly axes: Readonly<Record<string, { readonly from: string; readonly to: string }>> | null;
  /** true=正文 sha 变了而四轴未变（静默漂移）；false=有锚且相同；null=基线无锚或对象 absent（显式未知）。 */
  readonly content_drift: boolean | null;
  readonly rev: { readonly from: number | null; readonly to: number | null };
}

/** 证据条目（runs/claims 两平面共用的最小投影）。 */
export interface ReconcileEvidenceEntry {
  readonly evidence_ref: string;
  readonly plane: "runs" | "claims";
  readonly verdict: string;
  readonly subject_id: string | null;
  /** runs 平面专有；claims 恒 null。 */
  readonly gate: string | null;
}

export type ReconcileException = ReconcileEvidenceEntry | ReconcileTamperEntry;

/**
 * row 级正文探测命中的例外条目（kind=content_tamper；呈现层局部词 TODO(vocab-pr)，
 * 同 RECONCILE_DELTA_KINDS 的 content_drift 先例——不发明 Governed 前缀/七态 verdict，
 * 复用 exceptions 段承载）。语义：正文重算指纹 ≠ 索引行 bodySha256——「只手改正文、
 * 不碰索引行」的篡改实锤（该篡改对 baseline↔行的双索引锚 delta 不可见，N1 盲区）。
 * index_sha256/body_sha256 供人直接定位；探测本身只读不修（D24：告警不拦写）。
 */
export interface ReconcileTamperEntry {
  readonly kind: "content_tamper";
  /** 失配对象 id（探测分母 = 抽中样本 subject ∪ changed_objects，恒在 permit scope 内）。 */
  readonly subject_id: string;
  /** 索引行 body_ref（正文文件引用；探测不写该文件）。 */
  readonly body_ref: string;
  /** 索引行锚（row.bodySha256，事务自动维护）。 */
  readonly index_sha256: string;
  /** 正文重算指纹（sha256OfCanonical(body)，机器计算）。 */
  readonly body_sha256: string;
}

export type ReconcileSample = ReconcileEvidenceEntry & {
  /** 抽样原因（确定性可预言：stride 下标/全取；禁随机禁墙钟）。 */
  readonly sample_reason: string;
};

export interface ReconcileOptions {
  /** 抽样条数（≥0 整数；缺省 DEFAULT_RECONCILE_SAMPLES）。 */
  readonly samples?: number;
}

export interface ReconcileReport {
  readonly permit_ref: string;
  /** 基线快照锚（签发时刻 seq）；baseline 缺失（旧形态许可）= null。 */
  readonly baseline_at_seq: number | null;
  readonly current_seq: number;
  /** 无 delta、无例外且基线在场——⑥ 拍零审阅负担的合法出口。 */
  readonly clean: boolean;
  /** 旧形态许可无基线快照：显式 fail（RECONCILE_BASELINE_MISSING），delta 段不可计算故为空。 */
  readonly baseline_missing: boolean;
  readonly changed_objects: readonly ReconcileChangedObject[];
  readonly exceptions: readonly ReconcileException[];
  /** 证据平面全量 verdict 计数（含例外与 scope 外条目；键字典序，字节稳定）。 */
  readonly verdict_census: {
    readonly runs: Readonly<Record<string, number>>;
    readonly claims: Readonly<Record<string, number>>;
  };
  readonly samples_to_review: readonly ReconcileSample[];
  readonly scope_summary: {
    readonly subjects: number;
    readonly materialized: number;
    readonly vanished: number;
  };
}

// ============================================================
// 证据平面只读扫描（runs / claims）
// ============================================================

interface EvidenceEntry {
  readonly evidence_ref: string;
  readonly plane: "runs" | "claims";
  readonly verdict: string;
  readonly subject_id: string | null;
  readonly gate: string | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** *.json 文件名按字典序（确定性扫描顺序；目录缺席 = 零记录的合法空平面）。 */
function listPlaneJsonFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
}

function parsePlaneFile(dir: string, file: string): UnknownRecord {
  const text = readText(`${dir}/${file}`);
  if (text === null) {
    // readdir 与读取之间文件消失：非本轮 state 的一部分，不纳入报告（下次重放可见）。
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      throw new SyntaxError("evidence record is not an object");
    }
    return parsed;
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `evidence 平面文件无法解析（损坏或手改）：${file}`,
      "证据文件由 record 通道（applyTransaction record_gate_run / record_claim）落盘；先跑 compact/record canonical 化，或从 git 恢复（禁静默跳过损坏证据）",
      { file, cause: String(error) },
    );
  }
}

/**
 * runs 平面扫描。兼容两种形态：kernel canonical（record_type=run + gate_result.result
 * 内嵌）与 pre-canonical 夹具（GateResult 直落顶层）——与 G4 compact 的读取规则同一条线
 * （取 gate_result.result，无则整个文件视作 GateResult 值）；verdict 缺失/非字符串 =
 * SCHEMA_INVALID（禁静默跳过损坏证据）。
 */
function scanRunsPlane(paths: StorePaths): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [];
  for (const file of listPlaneJsonFiles(paths.runsDir)) {
    const record = parsePlaneFile(paths.runsDir, file);
    if (Object.keys(record).length === 0) continue;
    const inline = record.gate_result;
    const result =
      isRecord(inline) && isRecord((inline as UnknownRecord).result)
        ? ((inline as UnknownRecord).result as UnknownRecord)
        : record;
    const verdict = result.verdict;
    if (typeof verdict !== "string" || verdict.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `evidence/runs/${file} 缺 verdict（既非 kernel canonical 07 形态也非 GateResult 值）`,
        "run 文件由 record 通道 canonical 化（compact/record gate-run），或从 git 恢复；禁静默跳过损坏证据",
        { file },
      );
    }
    const subjectRaw = result.subject_id ?? result.subjectId;
    const refRaw = record.grn ?? result.grn;
    entries.push({
      evidence_ref: typeof refRaw === "string" && refRaw.length > 0 ? refRaw : file.replace(/\.json$/, ""),
      plane: "runs",
      verdict,
      subject_id: typeof subjectRaw === "string" && subjectRaw.length > 0 ? subjectRaw : null,
      gate: typeof result.gate === "string" ? result.gate : null,
    });
  }
  return entries;
}

/** claims 平面扫描（kernel canonical 形态：verification.verdict 判定块必读）。 */
function scanClaimsPlane(paths: StorePaths): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [];
  for (const file of listPlaneJsonFiles(paths.claimsDir)) {
    const record = parsePlaneFile(paths.claimsDir, file);
    if (Object.keys(record).length === 0) continue;
    const verification = record.verification;
    const verdict = isRecord(verification) ? verification.verdict : undefined;
    if (typeof verdict !== "string" || verdict.length === 0) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `evidence/claims/${file} 缺 verification.verdict（非 claim canonical 形态）`,
        "claim 文件由 record 通道（record_claim）落盘，或从 git 恢复；禁静默跳过损坏证据",
        { file },
      );
    }
    const subject = record.subject;
    const subjectId = isRecord(subject) && typeof subject.object_id === "string" ? subject.object_id : null;
    const refRaw = record.clm;
    entries.push({
      evidence_ref: typeof refRaw === "string" && refRaw.length > 0 ? refRaw : file.replace(/\.json$/, ""),
      plane: "claims",
      verdict,
      subject_id: subjectId,
      gate: null,
    });
  }
  return entries;
}

/** census 计数（键字典序输出 → JSON 字节稳定；全量计数：含例外与 scope 外条目）。 */
function censusOf(entries: readonly EvidenceEntry[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.verdict, (counts.get(entry.verdict) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const key of [...counts.keys()].sort()) {
    const value = counts.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// ============================================================
// row 级正文探测（N1：content_drift 双锚都在索引侧的盲区收窄；纯读只报不修）
// ============================================================

/**
 * 对探测分母（抽中样本 subject ∪ changed_objects；恒在 permit scope 内）做 row 级
 * 「正文 ↔ 索引」失配抽验：读正文文件重算内容指纹（sha256OfCanonical，与写路径
 * store.sweepDigestTampering 同源同型），与索引行 bodySha256 对比。失配 = 篡改实锤，
 * 产出 content_tamper 例外（只读只报，不修不拦写——D24；写侧 auto-regen 双轨归
 * applyTransaction）。成本边界：只探分母内对象，不全库扫（全库 sweep 仍是写路径事务
 * 的职责）。前置不满足时显式跳过（不冒充判定，四态纪律）：
 * - 现状无索引行 / 行无 sha 锚 → 无锚可比（显式未知）；
 * - 正文文件缺失 → vanished/REF 域已报，探测不越界重复报。
 */
function probeBodiesAgainstIndex(
  paths: StorePaths,
  rowsById: ReadonlyMap<string, ObjectRow>,
  probeIds: readonly string[],
): ReconcileTamperEntry[] {
  const tampered: ReconcileTamperEntry[] = [];
  for (const id of probeIds) {
    const row = rowsById.get(id);
    if (row === undefined || typeof row.bodySha256 !== "string") continue;
    const text = readText(`${paths.pomasterDir}/${row.bodyRef}`);
    if (text === null) continue; // 正文缺席：vanished 的 REF 异常形态，非本探测的失配语义
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `正文文件无法解析（损坏或手改）：${row.bodyRef}`,
        "正文层与索引层由事务成对落盘（A1）；从 git 恢复正文或重新 upsert 该对象（禁静默跳过损坏正文）",
        { id, body_ref: row.bodyRef, cause: String(error) },
      );
    }
    const actual = sha256OfCanonical(body);
    if (actual !== row.bodySha256) {
      tampered.push({
        kind: "content_tamper",
        subject_id: id,
        body_ref: row.bodyRef,
        index_sha256: row.bodySha256,
        body_sha256: actual,
      });
    }
  }
  return tampered;
}

// ============================================================
// delta 比较（基线 vs 当前索引行；纯函数）
// ============================================================

const AXES_KEYS = ["lifecycle", "confidence", "evidence", "change"] as const;

function axesDiffOf(
  base: PermitBaselineSubject,
  row: ObjectRow,
): Record<string, { from: string; to: string }> | null {
  const diffs: Record<string, { from: string; to: string }> = {};
  for (const axis of AXES_KEYS) {
    const from = base.axes[axis];
    const to = row.axes[axis];
    if (from !== to) {
      diffs[axis] = { from, to };
    }
  }
  return Object.keys(diffs).length > 0 ? diffs : null;
}

// ============================================================
// reconcilePermit 主入口
// ============================================================

/**
 * 按 permit 签发基线出 delta 三段报告（docs/kernel-api.md §10）。纯读零写；
 * 同 store state + 同参数重放输出字节稳定。
 * - 许可不存在 → throw PERMIT_NOT_FOUND（无报告可产出）；
 * - stolen 许可仍可 reconcile（纯读审计；接管事件在 journal 留痕）；
 * - baseline 缺失 → baseline_missing=true 的报告（CLI 翻译为 RECONCILE_BASELINE_MISSING）；
 * - 证据平面损坏 → throw SCHEMA_INVALID（禁静默跳过）。
 */
export async function reconcilePermit(
  store: Store,
  permitRef: string,
  options?: ReconcileOptions,
): Promise<ReconcileReport> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化",
      { rootDir: store.rootDir },
    );
  }
  const samples = options?.samples ?? DEFAULT_RECONCILE_SAMPLES;
  if (!Number.isInteger(samples) || samples < 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `samples 须为 ≥0 整数（0=显式放弃抽样，不静默）：${String(samples)}`,
      "抽样按 evidence_ref 字典序等距步长（确定性，禁随机禁墙钟）",
      { samples },
    );
  }
  const file = readPermitsFile(paths);
  const permit = file.permits.find((candidate) => candidate.permit_ref === permitRef);
  if (permit === undefined) {
    throw new GovernanceError(
      "PERMIT_NOT_FOUND",
      `许可不存在：${permitRef}`,
      "核对 PERMIT.* 引用（state/permits.json 台账，permit list --json 可查事件链）；reconcile 需要一份已签发许可作为 delta 分母",
      { permitRef },
    );
  }

  // —— 证据平面扫描（与基线无关：baseline 缺失时仍产出例外/census/抽样三段） ——
  const runs = scanRunsPlane(paths);
  const claims = scanClaimsPlane(paths);
  const scopeIds = new Set(permit.scope.subject_ids);
  const inScope = (entry: EvidenceEntry): boolean =>
    entry.subject_id !== null && scopeIds.has(entry.subject_id);
  const isRunException = (verdict: string): boolean =>
    (RECONCILE_EXCEPTION_RUN_VERDICTS as readonly string[]).includes(verdict);
  const exceptions: EvidenceEntry[] = [
    ...runs.filter((entry) => inScope(entry) && isRunException(entry.verdict))
      .sort((a, b) => (a.evidence_ref < b.evidence_ref ? -1 : 1)),
    ...claims.filter((entry) => inScope(entry) && entry.verdict === "REJECTED")
      .sort((a, b) => (a.evidence_ref < b.evidence_ref ? -1 : 1)),
  ];

  // 抽样池：scope 内全部证据条目（runs+claims 合并），evidence_ref 字典序（同 ref 时
  // plane 字典序兜底）→ 等距步长 floor(i×total/N)；total ≤ N 全取（stride 不会越界）。
  const pool = [...runs, ...claims]
    .filter(inScope)
    .sort((a, b) =>
      a.evidence_ref === b.evidence_ref
        ? a.plane < b.plane ? -1 : 1
        : a.evidence_ref < b.evidence_ref ? -1 : 1,
    );
  const picked: (EvidenceEntry & { readonly sample_reason: string })[] = [];
  if (pool.length <= samples) {
    for (const entry of pool) {
      picked.push({
        ...entry,
        sample_reason: `all (total ${pool.length} <= samples ${samples})`,
      });
    }
  } else {
    for (let i = 0; i < samples; i++) {
      const index = Math.floor((i * pool.length) / samples);
      const entry = pool[index];
      if (entry === undefined) continue; // 结构上不可达（index < pool.length）；防线保留
      picked.push({ ...entry, sample_reason: `deterministic stride ${i}/${samples}` });
    }
  }

  const baseline = permit.baseline;
  if (baseline === null) {
    // 旧形态许可无基线：delta 段不可计算——显式 missing，不冒充「无变化」。
    // row 级正文探测的分母含 changed_objects，此处不成立 → 探测不跑，行为同旧形态。
    return {
      permit_ref: permitRef,
      baseline_at_seq: null,
      current_seq: currentSeq,
      clean: false,
      baseline_missing: true,
      changed_objects: [],
      exceptions,
      verdict_census: { runs: censusOf(runs), claims: censusOf(claims) },
      samples_to_review: picked,
      scope_summary: { subjects: permit.scope.subject_ids.length, materialized: 0, vanished: 0 },
    };
  }

  // —— delta 比较：当前索引行走 loadTruthIndex（01 schema + vocab 指纹 + REF 基础项校验） ——
  const truth = await loadTruthIndex(store);
  const rowsById = new Map<string, ObjectRow>(truth.objects.map((row) => [row.id, row]));
  const changedObjects: ReconcileChangedObject[] = [];
  let materialized = 0;
  let vanished = 0;
  for (const id of [...permit.scope.subject_ids].sort()) {
    const base = baseline.subjects[id] ?? null;
    const row = rowsById.get(id);
    if (base === null && row === undefined) continue; // absent → 仍 absent：无 delta
    if (base === null && row !== undefined) {
      // materialized：签发时 absent、现已存在；基线无锚 → content_drift 显式未知。
      materialized += 1;
      changedObjects.push({
        id,
        kind: "materialized",
        axes: null,
        content_drift: null,
        rev: { from: null, to: row.rev },
      });
      continue;
    }
    if (base !== null && (row === undefined || readText(`${paths.pomasterDir}/${row.bodyRef}`) === null)) {
      // vanished：签发时存在、现已消失（含索引行在而正文文件缺的 REF 异常形态，A1 成对纪律）。
      vanished += 1;
      changedObjects.push({
        id,
        kind: "vanished",
        axes: null,
        content_drift: null,
        rev: { from: base.rev, to: null },
      });
      continue;
    }
    if (base === null || row === undefined) continue; // 不可达（上两分支已穷尽）；类型收窄防线
    const axes = axesDiffOf(base, row);
    if (axes !== null) {
      // 轴变化：body 必被重写（axes+rev 内嵌于正文），sha 对比失去「静默」含义 → 显式 null。
      changedObjects.push({
        id,
        kind: "axes_change",
        axes,
        content_drift: null,
        rev: { from: base.rev, to: row.rev },
      });
      continue;
    }
    // 四轴未变：content_drift 三态（true=静默漂移打捞；false=有锚且相同；null=显式未知）。
    const drift =
      typeof base.body_sha256 === "string" && typeof row.bodySha256 === "string"
        ? base.body_sha256 !== row.bodySha256
        : null;
    const revMoved = base.rev !== row.rev;
    if (drift === false && !revMoved) continue; // 无任何 delta（kernel 维护的行 sha 覆盖 rev，二者不会分叉）
    changedObjects.push({
      id,
      kind: "content_drift",
      axes: null,
      content_drift: drift,
      rev: { from: base.rev, to: row.rev },
    });
  }

  // —— N1 盲区收窄：row 级正文探测（分母 = 抽中样本 subject ∪ changed_objects；纯读只报） ——
  // 失配条目追加在证据例外之后（subject_id 字典序）→ 同 state 重放字节稳定。
  const probeIds = new Set<string>();
  for (const entry of picked) {
    if (entry.subject_id !== null) probeIds.add(entry.subject_id);
  }
  for (const changed of changedObjects) probeIds.add(changed.id);
  const tamperEntries = probeBodiesAgainstIndex(paths, rowsById, [...probeIds].sort());
  const allExceptions: ReconcileException[] = [...exceptions, ...tamperEntries];

  const clean =
    changedObjects.length === 0 && allExceptions.length === 0;
  return {
    permit_ref: permitRef,
    baseline_at_seq: baseline.at_seq,
    current_seq: currentSeq,
    clean,
    baseline_missing: false,
    changed_objects: changedObjects,
    exceptions: allExceptions,
    verdict_census: { runs: censusOf(runs), claims: censusOf(claims) },
    samples_to_review: picked,
    scope_summary: {
      subjects: permit.scope.subject_ids.length,
      materialized,
      vanished,
    },
  };
}
