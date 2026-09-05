/**
 * trace.ts —— Execution Trace Manifest Lite（W1-C · PRD v0.5.2 §8 Execution Trace
 * 行为侧车 + §14 P0.5-3 + §15 Benchmark C + §16 Case A；Owner 裁决 8 ②（2026-09-01，
 * corpus/master/cutover/owner-adjudications.md）：「trace 独立 traces/ 分区 + 投影 +
 * 可选 --seal / retention 四档逐字仅记录不 GC」——OD-1=B / OD-2=I+显式 --seal /
 * OD-3=PRD 逐字 / OD-4=仅记录，按已批推荐实施）。
 *
 * PRD 语义锚（逐字出处）：
 * - §8.1「Execution Identity 必须保持短、稳定、Git durable；行为轨迹另建 Execution
 *   Trace Manifest」——Trace 是 Identity 的**派生投影/侧车**，不是新事实源，不新增
 *   第二套身份（A19 Identity Is Not Trace；四克制：不新增 State Axis/Gate/Runner）；
 * - §8.2 manifest 闭形态（键序镜像 PRD 例文）：execution_id / trace_version / reads /
 *   writes / tool_receipts / agent_spawns / transition_proposals / evidence_refs /
 *   raw_trace_ref——**不重复 runtime/model/permit/policy_lock/context_manifest**
 *   （这些属于 Execution Identity）；本模块增补三键：schema（词形锚，execution
 *   档案同款先例）、retention（§8.3）、derived_from_seq（封存对账锚）；
 * - §8.3 retention 四档词形逐字 EPHEMERAL / TASK_RETENTION / INCIDENT_RETENTION /
 *   AUDIT_RETENTION；「Raw Tool Trace 默认不要求全部进 Git；长期只需要保存最小可审计
 *   Manifest 与 Evidence References」——**仅记录不执法**（无 GC 是诚实现状，裁决 8 ②）；
 * - §8.4 隐私封条：禁私有思维链/隐藏推理/凭据——manifest 闭形态（TS 闭类型 + 16
 *   schema additionalProperties:false）无任何自由文本载荷位可塞思维链；只存
 *   observable actions / resource refs / tool receipts / state transitions /
 *   artifact references；
 * - §14 P0.5-3「只记录 execution_id / write footprint / tool receipts / evidence
 *   refs；不先采集完整 read trace」——reads 恒空数组**显式**（Lite 边界非缺席）；
 * - §16 Case A「Trace 只能引用已有 AGX，不得自造第二种 EXEC-* 身份」——execution_id
 *   复用 assertExecutionAttachable 严格通道（SCHEMA_INVALID / EXECUTION_NOT_FOUND
 *   直接继承，零新错误码）；
 * - §15 Benchmark C：Identity unchanged（本模块纯读，档案字节恒等）/ Trace separately
 *   retained（traces/ 与 executions/ 物理分离）/ Evidence links back to execution_id
 *   （GRN/CLM 文件自报 execution_id 双向对账）/ 删除可丢弃 raw trace 后核心仍可理解
 *   （EPHEMERAL 落 runtime/traces，§85.4 可删除测试 runtime/ 判据豁免）。
 *
 * 零新采集器（page-spec §18 同哲学）：全部字段从既有平面派生——
 * - state/journal.jsonl TX_APPLIED 事件按 execution_id 过滤：changed_object_ids →
 *   writes.governed_refs（并集去重排序）、ops 计数（transition_object op 数）→
 *   transition_proposals、seq → 事件锚（A4：seq 采样，无墙钟）；
 * - evidence/runs/GRN-*.json、evidence/claims/CLM-*.json 按文件自报 execution_id
 *   过滤（P20 执行身份贯穿证据链的既有落盘位）：GRN → tool_receipts（tool/
 *   tool_version/metric_dialect 三件套随 GateResult inline）+ evidence_refs、
 *   CLM → evidence_refs。
 *
 * 形态裁定（裁决 8 ② 已批）：主形态 = 纯投影 on-demand（journal+evidence 是唯一
 * 事实源，零漂移风险）；显式 --seal 物化（sealExecutionTrace）为可选审计快照——
 * 物化文件带 derived_from_seq 锚，读侧 canonical 重放对账（重算投影逐字节比对，
 * evidence compact 快路径「磁盘字节 ≠ canonical 重放字节」同构）：漂移 = stale
 * 显式呈现（post-hoc 补录是合法通路，封存快照不冒充新鲜）。零 journal 事件（P34
 * production 新分区先例：登记平面非治理事实变更，manifest 自带 derived_from_seq 锚）。
 *
 * 落盘（OD-1=B，P34 新分区先例；不进 content_digest——digest 授权范围闭集不含
 * 本平面，零 digest 改动）：
 * - .pomaster/traces/AGX-*.json           durable manifest（TASK/INCIDENT/AUDIT，
 *   进 Git 的最小可审计快照）；
 * - .pomaster/runtime/traces/AGX-*.json   EPHEMERAL manifest（易变平面，可丢弃语义
 *   免费来自 §85.4 可删除测试的 runtime/ 判据豁免——删后投影可重建）。
 *
 * 词表纪律：TRACE_RETENTION_VALUES / pomaster.execution_trace/v1 等新词形已随
 * PR-0009 入锁（vocab-lock trace_perception_vocab，三镜像同批）；本模块常量为承载位，
 * 扩值走词汇表 PR。
 */
import { readdirSync } from "node:fs";
import type { Store } from "./index.js";
import { GovernanceError } from "./errors.js";
import { captureOriginal, executeWrites, readText } from "./io.js";
import { pathsOf, readCurrentSeq, readJournalLines, type StorePaths } from "./paths.js";
import { assertExecutionAttachable, EXECUTION_ID_PATTERN } from "./execution.js";

// ============================================================
// 词形常量（已随 PR-0009 入锁 vocab-lock trace_perception_vocab；词形字符串按研究
// 笔记定案在本模块承载（x-vocab-source 指向 vocab-lock）——扩值走词汇表 PR）
// ============================================================

/** trace 分区相对路径（durable manifest；裁决 8 ②「trace 独立 traces/ 分区」）。 */
export const TRACES_RELATIVE = ".pomaster/traces";

/** EPHEMERAL trace 相对路径（runtime 易变平面；§85.4 可删除测试判据豁免位）。 */
export const RAW_TRACES_RELATIVE = ".pomaster/runtime/traces";

/** trace 档案 schema 词形（镜像 EXECUTION_SCHEMA（pomaster.execution/v1）先例）。 */
export const EXECUTION_TRACE_SCHEMA = "pomaster.execution_trace/v1" as const;

/** trace 词形版本（PRD §8.2 例文 trace_version: 1）。 */
export const EXECUTION_TRACE_VERSION = 1 as const;

/**
 * retention 四档（PRD §8.3 逐字词形；裁决 8 ②「retention 四档逐字仅记录不 GC」——
 * OD-3：词形有源不发明；OD-4：仅记录，无 GC 无 prune 命令）。
 * 已随 PR-0009 收编（vocab-lock trace_perception_vocab.trace_retention；原 O-Q4 trace
 * 族词汇批次预留注记就此闭合）。
 */
export const TRACE_RETENTION_VALUES = [
  "EPHEMERAL",
  "TASK_RETENTION",
  "INCIDENT_RETENTION",
  "AUDIT_RETENTION",
] as const;
export type TraceRetentionValue = (typeof TRACE_RETENTION_VALUES)[number];

/** 封存平面（EPHEMERAL → ephemeral（runtime/traces，可丢弃）；其余 → durable（traces/，进 Git））。 */
export type TraceStoragePlane = "durable" | "ephemeral";

// ============================================================
// 类型（manifest 闭形态 C1：一切键在场，缺席 = null/空数组显式；
// 键序镜像 PRD §8.2 例文 + 本模块三增补键的注记位）
// ============================================================

/** 引用足迹片段（reads/writes 共形；PRD §8.2 例文 governed_refs/source_areas 双键）。 */
export interface TraceRefFootprint {
  /** governed 对象 id 集（journal changed_object_ids 派生；字典序确定性）。 */
  readonly governed_refs: readonly string[];
  /** 源区域（Lite 零采集器——恒空数组显式；PRD §8.2 键位保留）。 */
  readonly source_areas: readonly string[];
}

/** 工具收据行（GRN run 信封三件套 inline 派生；07 run_record 词形同源）。 */
export interface TraceToolReceipt {
  /** GRN-n（07 run_record 主键词形）。 */
  readonly grn: string;
  /** 门禁名（SCREAMING_SNAKE；03 词形同源）。 */
  readonly gate: string;
  /** gate 定义 id@semver（防口径静默漂移）。 */
  readonly gate_def: string;
  /** 执行工具标识（P12a 三件套之一）。 */
  readonly tool: string;
  readonly tool_version: string;
  readonly metric_dialect: string;
  /** 七态判卷词形（03 definitions.verdict 同源；原样承载不重判）。 */
  readonly verdict: string;
  /** 事件锚（A4：seq 采样，无墙钟——GRN ran_at_seq 原样）。 */
  readonly ran_at_seq: number;
}

/** 状态转移提案行（journal TX_APPLIED 的 ops 计数派生；事件真相源不携带 per-op 对象——
 *  不发明 journal 之外的归因）。 */
export interface TraceTransitionProposal {
  /** TX_APPLIED 事件 seq（A4 事件锚）。 */
  readonly seq: number;
  /** 该事务内 transition_object op 计数（≥1——零转移事务不产生行）。 */
  readonly transition_ops: number;
}

/**
 * Execution Trace Manifest（闭形态——12 键显式在场；§8.4 隐私封条的类型面：
 * 无任何自由文本载荷键位）。投影形态 retention=null + derived_from_seq=null；
 * 封存形态两键由 sealExecutionTrace 写入。
 */
export interface ExecutionTraceManifest {
  readonly execution_id: string;
  readonly schema: typeof EXECUTION_TRACE_SCHEMA;
  readonly trace_version: typeof EXECUTION_TRACE_VERSION;
  /** null = 投影形态（无留存承诺）；封存形态 = 四档词形之一（§8.3）。 */
  readonly retention: TraceRetentionValue | null;
  /** Lite 边界：恒空数组**显式**（§14 P0.5-3「不先采集完整 read trace」）。 */
  readonly reads: TraceRefFootprint;
  readonly writes: TraceRefFootprint;
  readonly tool_receipts: readonly TraceToolReceipt[];
  /** Lite 恒空（P21 Runtime Adapter 缺席——无 spawn 采集面；键位保留显式）。 */
  readonly agent_spawns: readonly string[];
  readonly transition_proposals: readonly TraceTransitionProposal[];
  /** 开放引用位（GRN-/CLM- 先行；未来 EVR/OBS 皆可挂——词形自描述字符串数组）。 */
  readonly evidence_refs: readonly string[];
  /** Lite 恒 null（raw tool trace 不采集；runtime/traces 预留位）。 */
  readonly raw_trace_ref: string | null;
  /** null = 投影；封存时刻 store seq（stale 对账锚——A4 seq 非墙钟）。 */
  readonly derived_from_seq: number | null;
}

/** sealExecutionTrace 输入（retention 必填显式——留存档是治理承诺，不留缺省）。 */
export interface ExecutionTraceSealInput {
  readonly retention: TraceRetentionValue;
}

/** sealExecutionTrace 结果（path 为落盘绝对路径，呈现位）。 */
export interface ExecutionTraceSealResult {
  readonly manifest: ExecutionTraceManifest;
  readonly path: string;
  readonly plane: TraceStoragePlane;
}

/** readSealedExecutionTrace 结果（stale = canonical 重放对账结论，显式呈现非错误）。 */
export interface SealedExecutionTrace {
  readonly manifest: ExecutionTraceManifest;
  readonly path: string;
  readonly plane: TraceStoragePlane;
  /** true = 封存后事实源演进（post-hoc 补录/新事务盖章）；false = 与投影逐字节一致。 */
  readonly stale: boolean;
}

/** listSealedExecutionTraces 行（同号双平面并存时 durable 优先单行呈现）。 */
export interface SealedTraceListRow {
  readonly execution_id: string;
  readonly retention: TraceRetentionValue;
  readonly derived_from_seq: number | null;
  readonly plane: TraceStoragePlane;
}

// ============================================================
// 投影编译器（纯读零写；Case A 严格通道复用）
// ============================================================

/**
 * 按 execution_id 编译 Execution Trace Manifest（纯投影 on-demand——OD-2 主形态）。
 * 零写入零 journal 事件；同 state + 同参数重放输出字节稳定（A4：seq 锚定，无墙钟）。
 * execution_id 复用 assertExecutionAttachable（§16 Case A：词形非法 SCHEMA_INVALID /
 * 未登记 EXECUTION_NOT_FOUND——禁自造第二种 EXEC-* 身份）。
 */
export function compileExecutionTrace(
  paths: StorePaths,
  executionId: string,
): ExecutionTraceManifest {
  assertExecutionAttachable(paths, executionId);

  // —— journal 半边：TX_APPLIED 事件按 execution_id 过滤（写足迹 + 转移提案） ——
  const writeRefs = new Set<string>();
  const transitionProposals: TraceTransitionProposal[] = [];
  for (const event of readJournalLines(paths)) {
    if (event.type !== "TX_APPLIED") continue;
    if (event.execution_id !== executionId) continue;
    const changed = event.changed_object_ids;
    if (changed !== undefined) {
      if (!Array.isArray(changed)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `TX_APPLIED 事件 changed_object_ids 非数组（损坏或手改）：seq=${String(event.seq)}`,
          "journal 是追加流；请从 git 恢复该文件，禁止手改事件行",
          { seq: event.seq },
        );
      }
      for (const ref of changed) {
        if (typeof ref === "string" && ref.length > 0) writeRefs.add(ref);
      }
    }
    const ops = event.ops;
    let transitionOps = 0;
    if (ops !== undefined) {
      if (!Array.isArray(ops)) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `TX_APPLIED 事件 ops 非数组（损坏或手改）：seq=${String(event.seq)}`,
          "journal 是追加流；请从 git 恢复该文件，禁止手改事件行",
          { seq: event.seq },
        );
      }
      for (const op of ops) {
        if (op === "transition_object") transitionOps += 1;
      }
    }
    if (transitionOps > 0 && typeof event.seq === "number") {
      transitionProposals.push({ seq: event.seq, transition_ops: transitionOps });
    }
  }
  transitionProposals.sort((a, b) => a.seq - b.seq);

  // —— evidence 半边：GRN/CLM 文件自报 execution_id 过滤（缺席不伪造——P20 裁定） ——
  const evidenceRefs: string[] = [];
  const toolReceipts: TraceToolReceipt[] = [];
  for (const name of listEvidenceFiles(paths.runsDir, /^GRN-[0-9]+\.json$/)) {
    const record = readEvidenceRecord(`${paths.runsDir}/${name}`, "run");
    const selfReported = record.execution_id;
    if (typeof selfReported !== "string") continue;
    assertExecutionWordForm(selfReported, `evidence/runs/${name}`);
    if (selfReported !== executionId) continue;
    if (typeof record.grn === "string") evidenceRefs.push(record.grn);
    // gate_result inline 三件套（store.record_gate_run 唯一落盘形态）；结构缺席时
    // 该 run 仍进 evidence_refs（引用位诚实）但不出收据行（无三件套不冒充收据）。
    const inner = gateResultInnerOf(record);
    if (inner !== null) toolReceipts.push(toolReceiptOf(record, inner));
  }
  for (const name of listEvidenceFiles(paths.claimsDir, /^CLM-[0-9]+\.json$/)) {
    const record = readEvidenceRecord(`${paths.claimsDir}/${name}`, "claim");
    const selfReported = record.execution_id;
    if (typeof selfReported !== "string") continue;
    assertExecutionWordForm(selfReported, `evidence/claims/${name}`);
    if (selfReported !== executionId) continue;
    if (typeof record.clm === "string") evidenceRefs.push(record.clm);
  }
  evidenceRefs.sort();

  // —— 闭形态装配（键序镜像 PRD §8.2 例文；投影形态 retention/derived_from_seq = null） ——
  return {
    execution_id: executionId,
    schema: EXECUTION_TRACE_SCHEMA,
    trace_version: EXECUTION_TRACE_VERSION,
    retention: null,
    reads: { governed_refs: [], source_areas: [] },
    writes: { governed_refs: [...writeRefs].sort(), source_areas: [] },
    tool_receipts: toolReceipts,
    agent_spawns: [],
    transition_proposals: transitionProposals,
    evidence_refs: evidenceRefs,
    raw_trace_ref: null,
    derived_from_seq: null,
  };
}

/**
 * 封存投影的派生视图（剥 retention/derived_from_seq 两键——retention 是封存时承诺
 * 非派生事实，derived_from_seq 是封存时刻锚；stale 对账只比派生面）。导出供批 2
 * CLI 对账呈现复用（单一实现禁两套）。
 */
export function executionTraceDerivedView(
  manifest: ExecutionTraceManifest,
): Record<string, unknown> {
  return {
    execution_id: manifest.execution_id,
    schema: manifest.schema,
    trace_version: manifest.trace_version,
    reads: manifest.reads,
    writes: manifest.writes,
    tool_receipts: manifest.tool_receipts,
    agent_spawns: manifest.agent_spawns,
    transition_proposals: manifest.transition_proposals,
    evidence_refs: manifest.evidence_refs,
    raw_trace_ref: manifest.raw_trace_ref,
  };
}

// ============================================================
// 显式 --seal 物化（裁决 8 ②；零 journal 事件——P34 新分区先例）
// ============================================================

/**
 * 显式封存：编译当前投影 + 写入 retention 档与 derived_from_seq 锚。
 * 分层规则（OD-1=B）：EPHEMERAL → runtime/traces/（易变平面，可丢弃）；其余三档 →
 * traces/（durable，进 Git 的最小可审计快照）。retention 词表外 VOCAB_INVALID_VALUE
 * （fail-closed 不发明）；重复封存 TRACE_ALREADY_SEALED（跨双平面检查——重封存须
 * 显式删除旧文件后进行，禁静默覆盖审计快照）。已封口/未封口执行均可封存（post-hoc
 * 是合法通路，时间围栏由档案 ended_at 如实呈现——不伪造）。
 */
export function sealExecutionTrace(
  store: Store,
  executionId: string,
  input: ExecutionTraceSealInput,
): ExecutionTraceSealResult {
  const paths = pathsAndRetentionOf(store, input);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）",
      "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
      { rootDir: store.rootDir },
    );
  }
  const plane: TraceStoragePlane = input.retention === "EPHEMERAL" ? "ephemeral" : "durable";
  const dir = plane === "ephemeral" ? paths.rawTracesDir : paths.tracesDir;
  const path = `${dir}/${executionId}.json`;
  assertNotAlreadySealed(paths, executionId);
  const manifest: ExecutionTraceManifest = {
    ...compileExecutionTrace(paths, executionId),
    retention: input.retention,
    derived_from_seq: currentSeq,
  };
  const original = captureOriginal(path);
  if (original !== null) {
    // 检查-写入窗口内的并发封存二道防线（TOCTOU 收窄；单进程纪律内不静默覆盖）。
    throw alreadySealedError(executionId, path);
  }
  executeWrites([
    {
      path,
      next: `${JSON.stringify(manifest, null, 2)}\n`,
      original,
    },
  ]);
  return { manifest, path, plane };
}

function pathsAndRetentionOf(
  store: Store,
  input: ExecutionTraceSealInput,
): StorePaths {
  const paths = pathsOf(store);
  if (!TRACE_RETENTION_VALUES.includes(input.retention)) {
    throw new GovernanceError(
      "VOCAB_INVALID_VALUE",
      `retention 词表外：${String(input.retention)}（PRD §8.3 四档逐字；裁决 8 ② 批准）`,
      `合法词形：${TRACE_RETENTION_VALUES.join(" | ")}；扩值走词汇表 PR（vocab-pr-0005 批次）`,
      { retention: input.retention },
    );
  }
  return paths;
}

/** 双平面既有封存检查（durable 与 ephemeral 任一在座即拒绝）。 */
function assertNotAlreadySealed(paths: StorePaths, executionId: string): void {
  const durable = `${paths.tracesDir}/${executionId}.json`;
  const ephemeral = `${paths.rawTracesDir}/${executionId}.json`;
  if (readText(durable) !== null) throw alreadySealedError(executionId, durable);
  if (readText(ephemeral) !== null) throw alreadySealedError(executionId, ephemeral);
}

function alreadySealedError(executionId: string, path: string): GovernanceError {
  return new GovernanceError(
    "TRACE_ALREADY_SEALED",
    `执行已有封存 trace（AGX 主键唯一）：${executionId}（${path}）`,
    "重封存须显式删除旧文件后进行（审计快照禁静默覆盖）；若需最新视图用投影形态 compileExecutionTrace",
    { execution_id: executionId, path },
  );
}

// ============================================================
// 封存读取 / 清单（canonical 重放对账；fail-closed 装载）
// ============================================================

/**
 * 读封存 trace 并做 canonical 重放对账：重算当前投影，派生视图逐字节比对——
 * 一致 stale=false；事实源演进（post-hoc 补录等）stale=true 显式呈现（不报错——
 * 封存快照与新鲜投影各有审计语义，漂移是信号不是故障）。双平面均缺席 → null
 * （调用方翻译；durable 优先）。执行档案缺失时对账通道显式抛 EXECUTION_NOT_FOUND
 * （档案是身份唯一事实源，删档是治理违例——禁静默当 stale）。
 */
export function readSealedExecutionTrace(
  paths: StorePaths,
  executionId: string,
): SealedExecutionTrace | null {
  if (!EXECUTION_ID_PATTERN.test(executionId)) return null;
  const durable = `${paths.tracesDir}/${executionId}.json`;
  const ephemeral = `${paths.rawTracesDir}/${executionId}.json`;
  let path: string;
  let plane: TraceStoragePlane;
  if (readText(durable) !== null) {
    path = durable;
    plane = "durable";
  } else if (readText(ephemeral) !== null) {
    path = ephemeral;
    plane = "ephemeral";
  } else {
    return null;
  }
  const manifest = loadSealedManifest(path, executionId);
  let live: ExecutionTraceManifest;
  try {
    live = compileExecutionTrace(paths, executionId);
  } catch (error) {
    if (error instanceof GovernanceError) {
      throw new GovernanceError(
        error.code,
        `封存 trace stale 对账（重算投影）：${error.message}`,
        error.hint,
        { ...error.details, sealed_path: path },
      );
    }
    throw error;
  }
  const stale =
    JSON.stringify(executionTraceDerivedView(live)) !==
    JSON.stringify(executionTraceDerivedView(manifest));
  return { manifest, path, plane, stale };
}

/** 封存 trace 清单（双平面扫描；同号并存 durable 优先单行；execution_id 字典序）。 */
export function listSealedExecutionTraces(paths: StorePaths): readonly SealedTraceListRow[] {
  const rows = new Map<string, SealedTraceListRow>();
  for (const plane of ["durable", "ephemeral"] as const) {
    const dir = plane === "durable" ? paths.tracesDir : paths.rawTracesDir;
    for (const name of listEvidenceFiles(dir, /^(AGX-[0-9]{4}-[0-9]+)\.json$/)) {
      const executionId = /^(AGX-[0-9]{4}-[0-9]+)\.json$/.exec(name)?.[1];
      if (executionId === undefined || rows.has(executionId)) continue;
      const manifest = loadSealedManifest(`${dir}/${name}`, executionId);
      rows.set(executionId, {
        execution_id: manifest.execution_id,
        retention: manifest.retention as TraceRetentionValue,
        derived_from_seq: manifest.derived_from_seq,
        plane,
      });
    }
  }
  return [...rows.values()].sort((a, b) => (a.execution_id < b.execution_id ? -1 : 1));
}

/** 封存文件装载（fail-closed：损坏/键不一致/词形漂移/retention 词表外一律 SCHEMA_INVALID）。 */
function loadSealedManifest(path: string, expectedExecutionId: string): ExecutionTraceManifest {
  const text = readText(path);
  if (text === null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `封存 trace 文件不可读（清单在座而读取缺席）：${path}`,
      "并发删改；重跑（禁静默跳过）",
      { path },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `封存 trace 文件无法解析（损坏或手改）：${path}`,
      "封存快照由 sealExecutionTrace 落盘（闭形态）；损坏请从 git 恢复或显式删除后重封存",
      { path, cause: String(error) },
    );
  }
  const manifest = parsed as ExecutionTraceManifest;
  const fail = (detail: string): GovernanceError =>
    new GovernanceError(
      "SCHEMA_INVALID",
      `封存 trace 形态非法：${path} ${detail}`,
      "封存快照由 sealExecutionTrace 落盘（闭形态）；损坏请从 git 恢复或显式删除后重封存",
      { path, execution_id: expectedExecutionId },
    );
  if (manifest.schema !== EXECUTION_TRACE_SCHEMA) throw fail(`schema 词形漂移：${String(manifest.schema)}`);
  if (manifest.trace_version !== EXECUTION_TRACE_VERSION) throw fail("trace_version 非 1");
  if (manifest.execution_id !== expectedExecutionId) {
    throw fail(`execution_id 与文件名不一致：${String(manifest.execution_id)}`);
  }
  if (!TRACE_RETENTION_VALUES.includes(manifest.retention as TraceRetentionValue)) {
    throw fail(`retention 词表外：${String(manifest.retention)}`);
  }
  return manifest;
}

// ============================================================
// 内部共用（gatekeeper.ts 同款纪律：词形漂移 = 手改痕迹显性暴露）
// ============================================================

/** 列举词形匹配的平面文件（目录缺失 = 零文件；名字典序确定性）。 */
function listEvidenceFiles(dir: string, pattern: RegExp): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((name) => pattern.test(name)).sort();
}

/** 读取证据记录 JSON（损坏 → SCHEMA_INVALID fail-closed——投影面对损坏静默 = 假绿）。 */
function readEvidenceRecord(path: string, kind: "run" | "claim"): Record<string, unknown> {
  const text = readText(path);
  if (text === null) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `证据文件不可读（清单在座而读取失败）：${path}`,
      "evidence 平面损坏即信号失真；从 git 恢复或删除后重跑对应 record 通路",
      { evidence_path: path },
    );
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SyntaxError("record is not an object");
    }
    const record = parsed as Record<string, unknown>;
    if (record.record_type !== kind) {
      throw new SyntaxError(`record_type 期望 ${kind}`);
    }
    return record;
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `证据文件无法解析（损坏或手改）：${path}`,
      "投影面对损坏 fail-closed（静默 = 报绿的观测比没有观测更危险）；从 git 恢复该文件",
      { cause: String(error), evidence_path: path },
    );
  }
}

/** AGX 词形校验（canonical 文件由 kernel record 通路保证；漂移即手改痕迹）。 */
function assertExecutionWordForm(executionId: string, where: string): void {
  if (!EXECUTION_ID_PATTERN.test(executionId)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `证据记录 execution_id 词形非法（须 AGX-<4位年份>-<序号>）：${executionId}（${where}）`,
      "canonical 文件由 kernel record 通路落盘保证词形；词形漂移即手改痕迹，从 git 恢复",
      { execution_id: executionId, where },
    );
  }
}

/** 07 run_record 的 gate_result.inline 内层（缺席/异形 = null——不冒充收据）。 */
function gateResultInnerOf(record: Record<string, unknown>): Record<string, unknown> | null {
  const gateResult = record.gate_result;
  if (gateResult === null || typeof gateResult !== "object" || Array.isArray(gateResult)) {
    return null;
  }
  const inner = (gateResult as Record<string, unknown>).result;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return null;
  return inner as Record<string, unknown>;
}

/**
 * 收据行装配（07 run_record 词形同源；缺键 = 落盘面损坏）。缺键显式 fail-closed
 * （G8）：String()/Number() 强转会把缺席键产出 "undefined"/NaN 垃圾收据行——收据
 * 是证据面通路记录，垃圾词形 = 伪造留痕，禁静默。
 */
function toolReceiptOf(
  record: Record<string, unknown>,
  inner: Record<string, unknown>,
): TraceToolReceipt {
  const missing: string[] = [];
  if (typeof record.grn !== "string" || record.grn.length === 0) missing.push("grn");
  for (const key of ["gate", "gate_def", "tool", "tool_version", "metric_dialect", "verdict"] as const) {
    const value = inner[key];
    if (typeof value !== "string" || value.length === 0) missing.push(`gate_result.result.${key}`);
  }
  if (
    typeof inner.ran_at_seq !== "number" ||
    !Number.isInteger(inner.ran_at_seq) ||
    inner.ran_at_seq < 0
  ) {
    missing.push("gate_result.result.ran_at_seq");
  }
  if (missing.length > 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `run 记录收据键缺席/异形（禁强转出 "undefined"/NaN 垃圾收据）：${missing.join(", ")}`,
      "收据行八键由 record gate-run 通路落盘保证（闭形态）；缺键 = 手改/旧版落盘——从 git 恢复或重跑 record 通路",
      { missing, grn: typeof record.grn === "string" ? record.grn : null },
    );
  }
  return {
    grn: record.grn as string,
    gate: inner.gate as string,
    gate_def: inner.gate_def as string,
    tool: inner.tool as string,
    tool_version: inner.tool_version as string,
    metric_dialect: inner.metric_dialect as string,
    verdict: inner.verdict as string,
    ran_at_seq: inner.ran_at_seq as number,
  };
}
