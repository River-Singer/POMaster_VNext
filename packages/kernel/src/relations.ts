/**
 * relations.ts —— Typed Relation sidecar 台账内核（P-v06 批次 0 Model Constitution；
 * PRD v0.6 §6-8 + Owner 裁决 D-2/D-3 2026-09-02）。
 *
 * 出处锚（逐条裁定注记出处锚纪律）：
 * - PRD v0.6 §6「Graph 不是第六原语；Graph 是 Governed Object + Typed Relation 的主要
 *   实现方式」逐字——本面只承载边；节点=既有 truth-index 对象与 catalog 条目（零新节点
 *   存储），dependencies/composition/runtime 视图全部派生（§1.3 One Model Many
 *   Projections），不建第二套节点事实、不建图数据库。
 * - Owner 裁决 D-3（2026-09-02）：relation sidecar + 派生视图——state/relations.jsonl
 *   追加流侧车（equivalence-registry 侧车先例：不进 content_digest；A8 同族不入
 *   truth-index——01 additionalProperties:false 封条不动）；图快照/diff 住派生面。
 * - Owner 裁决 D-2（2026-09-02）：边端点可指 governed id（truth 面）或 catalog 条目 id
 *   （catalog 面）——INSTANCE_OF 边（v0.6.1 §84 instance binding 的边化落法）典型
 *   truth→catalog；Archetype 定义住 catalog 面、实例采用走本面 + 既有 key_bindings。
 * - PRD v0.6 §8 Graph Provenance：每边必答「为什么存在」——origin/producer/locator/
 *   confidence/事件拍五面齐备；runtime_trace 边必须附 OBS-n/POB-<12hex> observation_ref
 *   （「Agent 必须证明我看过」§6.13 封条的边侧镜像）。
 *
 * 词表纪律：relation_type（首批 8 值「只收真实消费」）/ relation_origin /
 * relation_endpoint_domain / relation_confidence 四轴唯一来源 @pomaster/schemas
 * vocab.ts（镜像 vocab-lock@v0.5-resolved software_graph_vocab 段，PR-0006 收编；
 * 本文件不发明词值）。EDGE-<12hex> 是通路编号词形（EQG-/POB-/PBR- 同族先例：
 * 内容寻址 sha256 前 12 hex，A4 无墙钟无随机），非 governed 前缀，不入
 * GOVERNED_ID_PREFIXES 闭包、不过 parseGovernedId（vocab-lock id_namespace.
 * state_plane_refs PR-0006 注记）。
 *
 * 三条现行纪律（本模块的结构性落法）：
 * ① 机器派生边保持派生（PRD §1.2 Derived Facts Must Be Derived / §1.7 No JSON Hell）：
 *    边由 analyzer/传感器经 registerRelation 语义入口登记；来源代码变化后旧边不自动
 *    失效（stale 语义归批次 2+ rebuild 面），但 provenance 五面保证每边可回溯重算。
 * ② 禁第二真相：端点存在性不在本面判卷（「本面只解析命名，存在性归消费面」——
 *    equivalence 三腿链先例）；truth 端点只过 governed id 文法（A5），catalog 端点只过
 *    词形法式；存在性（truth-index 查册 / catalog-lock 分母）归消费 gate/loader。
 * ③ fail-closed 不假绿：装载面逐行结构校验，坏行=SCHEMA_INVALID 整体拒绝（禁静默跳过）；
 *    runtime_trace 无 observation_ref / probable 无 uncertainty_note 均 allOf 级拒绝；
 *    (source,type,target) 重复登记=调用方缺陷显式拒绝（同三元组同 id dedupe noop 幂等
 *    是 analyzer 重写的合法路径，二者以 edge_id 判别）。
 *
 * 存储与写入（模式同 equivalence.ts 侧车先例）：
 * - state/relations.jsonl（kernel 内部补充状态，不进 content_digest；append-only
 *   追加流——journal appendLine 家族先例，EDGE 内容寻址幂等使 append 语义安全）；
 * - 坏行/手改 fail-closed（装载面结构校验 + 跨行不变式：edge_id 唯一、三元组唯一）；
 * - journal 事件流：RELATION_REGISTERED（A4 事件拍，禁墙钟）。
 */
import type { Store } from "./index.js";
import { GovernanceError, GovernedIdParseError } from "./errors.js";
import { parseGovernedId } from "./id.js";
import { sha256OfCanonical } from "./digest.js";
import { appendLine, readText } from "./io.js";
import { pathsOf, readCurrentSeq, type StorePaths } from "./paths.js";
import {
  RELATION_CONFIDENCE_VALUES,
  RELATION_ENDPOINT_DOMAIN_VALUES,
  RELATION_ORIGIN_VALUES,
  RELATION_TYPE_VALUES,
  type RelationConfidenceValue,
  type RelationEndpointDomainValue,
  type RelationOriginValue,
  type RelationTypeValue,
} from "./vocab.js";

/** 关系台账相对路径（kernel 内部补充状态；不进 content_digest）。 */
export const RELATIONS_RELATIVE = ".pomaster/state/relations.jsonl";

/** EDGE-n 通路编号词形（EQG-/POB- 同族先例；非 governed 前缀）。 */
export const EDGE_ID_PATTERN = /^EDGE-[0-9a-f]{12}$/;

/** catalog 条目 id 词形法式（端点域=catalog 的装载面文法；至少两段 SCREAMING_SNAKE）。 */
export const CATALOG_ENDPOINT_ID_PATTERN = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]+)+$/;

/** 观察回执引用词形（runtime_trace 边 observation_ref 唯一合法词形）。 */
export const OBSERVATION_REF_PATTERN = /^(OBS-[0-9]+|POB-[0-9a-f]{12})$/;

// ============================================================
// 类型（文件世界 snake_case / 输入世界 camelCase，同 equivalence 分工）
// ============================================================

/** 边端点（19 definitions.relation_endpoint 镜像）。 */
export interface RelationEndpoint {
  /** 端点域（truth=governed id / catalog=catalog 条目 id；D-2）。 */
  readonly domain: RelationEndpointDomainValue;
  /** 端点 id（truth 侧过 governed id 文法；catalog 侧过词形法式；存在性归消费面）。 */
  readonly id: string;
}

/** 边 provenance（19 definitions.relation_provenance 镜像；PRD v0.6 §8 五面）。 */
export interface RelationProvenance {
  /** 登记事件拍（A4 禁墙钟）。 */
  readonly recorded_at_seq: number;
  /** 登记出处锚（每条裁定注记出处锚纪律）。 */
  readonly source_ref: string;
  /** 源定位（static_analysis: file:line / runtime_trace: span 锚 / human_declared: 决议锚）。 */
  readonly locator: string | null;
  /** 观察回执引用（runtime_trace 必填 OBS-n/POB-<12hex>；其余 origin 恒 null）。 */
  readonly observation_ref: string | null;
  /** 声明主体（human_declared 时登记谁声明——C5 只登记事实不判真；其余恒 null）。 */
  readonly declared_by: string | null;
}

/** 关系边条目（state/relations.jsonl 逐行一条；19 definitions.relation_entry 镜像）。 */
export interface RelationEntry {
  /** EDGE-<12hex> 内容寻址（canonical (source,type,target) sha256 前 12 hex；A4）。 */
  readonly edge_id: string;
  /** 关系类型（relation_type 词表首批 8 值；PR-0006）。 */
  readonly type: RelationTypeValue;
  readonly source: RelationEndpoint;
  readonly target: RelationEndpoint;
  /** 边来源（static_analysis/runtime_trace/human_declared；PRD §8 语义）。 */
  readonly origin: RelationOriginValue;
  /** 边置信（deterministic/probable/declared；PRD §8 confidence 三级化）。 */
  readonly confidence: RelationConfidenceValue;
  /** 产出者词形（ANALYZER.* / SENSOR.* / human:<主体>——每边必答「谁产出」）。 */
  readonly producer: string;
  /** 不确定性注记（confidence=probable 必填——§148 披露位；其余恒 null）。 */
  readonly uncertainty_note: string | null;
  readonly provenance: RelationProvenance;
  /** 人类散文注记（只登记不解析；P9 纪律）。 */
  readonly note: string | null;
}

/** 输入端点（camelCase；domain 为词表词形字符串，登记面闸校验）。 */
export interface RelationEndpointInput {
  readonly domain: string;
  readonly id: string;
}

/**
 * registerRelation 输入（camelCase）。sourceRef（登记出处锚）必填；origin=runtime_trace
 * ⇒ observationRef 必填；confidence=probable ⇒ uncertaintyNote 必填；origin=human_declared
 * ⇒ declaredBy 建议携带（C5 留痕）。
 */
export interface RelationRegistrationInput {
  readonly type: string;
  readonly source: RelationEndpointInput;
  readonly target: RelationEndpointInput;
  readonly origin: string;
  readonly confidence: string;
  readonly producer: string;
  /** 登记出处锚（必填——登记出处锚纪律）。 */
  readonly sourceRef: string;
  readonly locator?: string;
  readonly observationRef?: string;
  /**
   * 不确定性注记（confidence=probable 必填——§148 披露位；其余置信级携带显式拒绝，
   * 与 buildEntry 互斥封条一致）。本字段此前只存在于 buildEntry 运行时读取与接口
   * 文档注记中、接口声明缺位（严格 tsc 清零补齐——纯声明增量，零运行时变更）。
   */
  readonly uncertaintyNote?: string;
  readonly declaredBy?: string;
  readonly note?: string;
}

/** 登记结果三态：registered=新边入账 / noop=同三元组已入账（内容寻址幂等）。 */
export interface RelationRegistrationOutcome {
  readonly registered: boolean;
  readonly entry: RelationEntry;
}

// ============================================================
// 词形闸（normalize* 防篡改探测：词表外值显式拒绝，normalizeWordFormDomain 先例）
// ============================================================

/** relation_type 词表闸。 */
export function normalizeRelationType(value: string): RelationTypeValue {
  const matched = RELATION_TYPE_VALUES.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `relation type 词表外：${value}（software_graph_vocab.relation_type 首批 8 值闭包，PR-0006）`,
      `合法词形：${RELATION_TYPE_VALUES.join(" | ")}；PRD §7 其余词形待真实消费者落地逐批词汇表 PR 增补`,
      { type: value },
    );
  }
  return matched;
}

/** relation_origin 词表闸。 */
export function normalizeRelationOrigin(value: string): RelationOriginValue {
  const matched = RELATION_ORIGIN_VALUES.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `relation origin 词表外：${value}（software_graph_vocab.relation_origin 三值闭包，PR-0006）`,
      `合法词形：${RELATION_ORIGIN_VALUES.join(" | ")}`,
      { origin: value },
    );
  }
  return matched;
}

/** relation_endpoint_domain 词表闸。 */
export function normalizeEndpointDomain(value: string): RelationEndpointDomainValue {
  const matched = RELATION_ENDPOINT_DOMAIN_VALUES.find(
    (candidate) => candidate === value,
  );
  if (matched === undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `endpoint domain 词表外：${value}（software_graph_vocab.relation_endpoint_domain 两值闭包，PR-0006）`,
      `合法词形：${RELATION_ENDPOINT_DOMAIN_VALUES.join(" | ")}`,
      { domain: value },
    );
  }
  return matched;
}

/** relation_confidence 词表闸。 */
export function normalizeRelationConfidence(value: string): RelationConfidenceValue {
  const matched = RELATION_CONFIDENCE_VALUES.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `relation confidence 词表外：${value}（software_graph_vocab.relation_confidence 三值闭包，PR-0006）`,
      `合法词形：${RELATION_CONFIDENCE_VALUES.join(" | ")}；与 state_axes.confidence 正交禁混用`,
      { confidence: value },
    );
  }
  return matched;
}

// ============================================================
// 装载面（fail-closed；kernel 内部跨模块复用 + CLI 纯读呈现共用语义）
// ============================================================

/**
 * 读取关系台账。缺失 → 空台账（零边是合法状态——空图 ≠ 盲区冒充全知，分母披露归
 * 消费面）；损坏/手改 → SCHEMA_INVALID fail-closed（禁静默跳过坏行）。装载面校验：
 * - 逐行结构（端点域词表/truth 端点 governed id 文法/catalog 端点词形法式/类型词表/
 *   origin 词表/confidence 词表/provenance 事件拍/runtime_trace 封条/probable 封条/
 *   来源面互斥封条）；
 * - 跨行不变式：edge_id 全域唯一、(source,type,target) 三元组全域唯一。
 */
export function readRelations(paths: StorePaths): readonly RelationEntry[] {
  const text = readText(paths.relationsPath);
  if (text === null) {
    return [];
  }
  const entries: RelationEntry[] = [];
  const idOwner = new Map<string, string>();
  const tripleOwner = new Map<string, string>();
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw relationsInvalid(`第 ${index + 1} 行无法解析（损坏或手改）`, trimmed, error);
    }
    const entry = validateEntryShape(parsed, index + 1);
    const previousIdOwner = idOwner.get(entry.edge_id);
    if (previousIdOwner !== undefined) {
      throw relationsInvalid(
        `edge_id 重复登记：${entry.edge_id}（第 ${previousIdOwner} 行与第 ${index + 1} 行；内容寻址 id 全域唯一）`,
        trimmed,
      );
    }
    idOwner.set(entry.edge_id, String(index + 1));
    const triple = tripleKey(entry);
    const previousTripleOwner = tripleOwner.get(triple);
    if (previousTripleOwner !== undefined) {
      throw relationsInvalid(
        `(source,type,target) 三元组重复登记：${triple}（第 ${previousTripleOwner} 行与第 ${index + 1} 行；同三元组必须同 edge_id——分叉=手改痕迹）`,
        trimmed,
      );
    }
    tripleOwner.set(triple, String(index + 1));
    entries.push(entry);
  }
  return entries;
}

function relationsInvalid(message: string, line?: string, cause?: unknown): GovernanceError {
  return new GovernanceError(
    "SCHEMA_INVALID",
    `state/relations.jsonl ${message}`,
    "恢复 git 版本；关系台账由 kernel relations.ts 语义入口维护（registerRelation），禁止手改",
    { line: line?.slice(0, 120), cause: cause === undefined ? undefined : String(cause) },
  );
}

/** 逐行结构校验（装载面；词表闸 + 文法 + allOf 级条件封条）。 */
function validateEntryShape(value: unknown, lineNo: number): RelationEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw relationsInvalid(`第 ${lineNo} 行非对象`);
  }
  const e = value as Record<string, unknown>;
  const edgeId = e["edge_id"];
  if (typeof edgeId !== "string" || !EDGE_ID_PATTERN.test(edgeId)) {
    throw relationsInvalid(`第 ${lineNo} 行 edge_id 词形非法（须 EDGE-<12hex> 内容寻址）`);
  }
  const type = normalizeRelationType(requireString(e, "type", lineNo));
  const origin = normalizeRelationOrigin(requireString(e, "origin", lineNo));
  const confidence = normalizeRelationConfidence(requireString(e, "confidence", lineNo));
  const producer = requireString(e, "producer", lineNo);
  if (!/^[A-Z][A-Z0-9_.\-]{0,63}$/.test(producer) && !producer.startsWith("human:")) {
    throw relationsInvalid(
      `第 ${lineNo} 行 producer 词形非法（ANALYZER.*/SENSOR.*/human:<主体>）`,
    );
  }
  const source = validateEndpoint(e["source"], `第 ${lineNo} 行 source`);
  const target = validateEndpoint(e["target"], `第 ${lineNo} 行 target`);
  if (confidence === "probable" && !isNonEmptyString(e["uncertainty_note"])) {
    throw relationsInvalid(
      `第 ${lineNo} 行 confidence=probable 但缺 uncertainty_note（§148 Analyzer Output Contract：非确定派生必须披露不确定性）`,
    );
  }
  if (confidence !== "probable" && e["uncertainty_note"] !== null && e["uncertainty_note"] !== undefined) {
    throw relationsInvalid(
      `第 ${lineNo} 行 confidence≠probable 却携带 uncertainty_note（披露位与置信级互斥）`,
    );
  }
  const provenance = validateProvenance(e["provenance"], lineNo, origin);
  const note = e["note"];
  if (note !== null && note !== undefined && !isNonEmptyString(note)) {
    throw relationsInvalid(`第 ${lineNo} 行 note 形态非法`);
  }
  return {
    edge_id: edgeId,
    type,
    source,
    target,
    origin,
    confidence,
    producer,
    uncertainty_note: confidence === "probable" ? String(e["uncertainty_note"]) : null,
    provenance,
    note: isNonEmptyString(note) ? note : null,
  };
}

function validateEndpoint(value: unknown, label: string): RelationEndpoint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw relationsInvalid(`${label} 非对象`);
  }
  const record = value as Record<string, unknown>;
  const domain = normalizeEndpointDomain(requireString(record, "domain", -1, label));
  const id = record["id"];
  if (!isNonEmptyString(id)) {
    throw relationsInvalid(`${label}.id 缺失或非非空字符串`);
  }
  if (domain === "truth") {
    try {
      parseGovernedId(id);
    } catch (error) {
      if (error instanceof GovernedIdParseError) {
        throw relationsInvalid(`${label} truth 端点「${id}」不过 governed id 文法（${error.message}）`);
      }
      throw error;
    }
  } else if (!CATALOG_ENDPOINT_ID_PATTERN.test(id)) {
    throw relationsInvalid(
      `${label} catalog 端点「${id}」词形非法（至少两段 SCREAMING_SNAKE；存在性归消费面 loader 分母）`,
    );
  }
  return { domain, id };
}

function validateProvenance(
  value: unknown,
  lineNo: number,
  origin: RelationOriginValue,
): RelationProvenance {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw relationsInvalid(`第 ${lineNo} 行 provenance 非对象`);
  }
  const record = value as Record<string, unknown>;
  const seq = record["recorded_at_seq"];
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) {
    throw relationsInvalid(
      `第 ${lineNo} 行 provenance.recorded_at_seq 非法（须非负整数事件拍，A4 禁墙钟）`,
    );
  }
  const sourceRef = record["source_ref"];
  if (!isNonEmptyString(sourceRef)) {
    throw relationsInvalid(`第 ${lineNo} 行 provenance.source_ref 缺失（登记出处锚必填）`);
  }
  const observationRef = record["observation_ref"];
  const locator = record["locator"];
  const declaredBy = record["declared_by"];
  if (origin === "runtime_trace") {
    if (!isNonEmptyString(observationRef) || !OBSERVATION_REF_PATTERN.test(observationRef)) {
      throw relationsInvalid(
        `第 ${lineNo} 行 origin=runtime_trace 但 observation_ref 缺失或词形非法（须 OBS-n / POB-<12hex>——「Agent 必须证明我看过」边侧封条）`,
      );
    }
  } else if (observationRef !== null && observationRef !== undefined) {
    throw relationsInvalid(
      `第 ${lineNo} 行 origin=${origin} 却携带 observation_ref（来源面互斥封条）`,
    );
  }
  if (origin === "human_declared" && declaredBy !== null && declaredBy !== undefined && !isNonEmptyString(declaredBy)) {
    throw relationsInvalid(`第 ${lineNo} 行 declared_by 形态非法`);
  }
  return {
    recorded_at_seq: seq,
    source_ref: sourceRef,
    locator: isNonEmptyString(locator) ? locator : null,
    observation_ref: isNonEmptyString(observationRef) ? observationRef : null,
    declared_by: isNonEmptyString(declaredBy) ? declaredBy : null,
  };
}

// ============================================================
// 写通路（语义入口在本文件，落盘点唯一；append-only + journal 事件流）
// ============================================================

/**
 * 登记关系边（唯一写通路；EDGE-<12hex> 内容寻址幂等）：
 * - 同 (source,type,target) 已入账 → noop（registered=false 返回既有边；analyzer 重跑
 *   安全——内容寻址同 id，A2 追加流语义不被重写破坏）；
 * - 新边 → appendLine 追加 + journal RELATION_REGISTERED 事件（A4 事件拍）；
 * - 同三元组而 provenance 相异的「重复登记」→ SCHEMA_INVALID（调用方缺陷显式拒绝，
 *   禁静默覆盖——dedupe 只按内容寻址三元组判别，不按元数据判别）。
 * 端点存在性不在本面判卷（「本面只解析命名，存在性归消费面」——equivalence 先例）。
 */
export async function registerRelation(
  store: Store,
  input: RelationRegistrationInput,
): Promise<RelationRegistrationOutcome> {
  const paths = pathsOf(store);
  const currentSeq = readCurrentSeq(paths);
  if (currentSeq === null) {
    throw notConfigured(store);
  }
  const entry = buildEntry(input, currentSeq);
  const existing = readRelations(paths);
  const triple = tripleKeyOf(entry.source, entry.type, entry.target);
  const hit = existing.find((candidate) => tripleKey(candidate) === triple);
  if (hit !== undefined) {
    if (hit.edge_id !== entry.edge_id) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `三元组已入账但 edge_id 分叉：${hit.edge_id} ≠ ${entry.edge_id}（内容寻址不变式被破坏——同三元组必须同 id）`,
        "此为手改/实现缺陷痕迹；恢复 git 版本并排查 sha256OfCanonical 身份面",
        { edge_id: entry.edge_id, existing: hit.edge_id },
      );
    }
    return { registered: false, entry: hit };
  }
  appendLine(paths.relationsPath, `${JSON.stringify(entry)}\n`);
  appendLine(
    paths.journalPath,
    `${JSON.stringify({
      type: "RELATION_REGISTERED",
      seq: currentSeq,
      edge_id: entry.edge_id,
      relation_type: entry.type,
      source: entry.source,
      target: entry.target,
      origin: entry.origin,
      confidence: entry.confidence,
      producer: entry.producer,
    })}\n`,
  );
  return { registered: true, entry };
}

/**
 * EDGE-<12hex> 内容寻址（production.ts POB- 同族先例：canonical 序列化 sha256 前 12 hex）。
 * 身份面 = (source, type, target) 三元组——元数据（origin/confidence/provenance）不参与
 * 身份：同三元组重登记永远命中同一 id（幂等 dedupe 的结构保证）。
 */
export function edgeIdOf(
  source: RelationEndpoint,
  type: RelationTypeValue,
  target: RelationEndpoint,
): string {
  return `EDGE-${sha256OfCanonical({ source, type, target }).slice(
    "sha256:".length,
    "sha256:".length + 12,
  )}`;
}

// ============================================================
// 纯函数派生面（dependencies/composition/runtime 视图与 Change Impact 的最小算子；
// 图视图全部从台账派生——One Model Many Projections，不建第二套节点事实）
// ============================================================

/** 以给定 id 为端点（source 或 target）的全部边。 */
export function relationsTouching(
  entries: readonly RelationEntry[],
  endpoint: RelationEndpointInput,
): readonly RelationEntry[] {
  return entries.filter(
    (entry) =>
      entry.source.domain === endpoint.domain &&
      entry.source.id === endpoint.id,
  ).concat(
    entries.filter(
      (entry) =>
        entry.target.domain === endpoint.domain &&
        entry.target.id === endpoint.id,
    ),
  );
}

/** 反向依赖（谁指向我——Change Impact §106-108 的最小算子：改 X 影响谁）。 */
export function reverseDependents(
  entries: readonly RelationEntry[],
  endpoint: RelationEndpointInput,
): readonly RelationEntry[] {
  return entries.filter(
    (entry) => entry.target.domain === endpoint.domain && entry.target.id === endpoint.id,
  );
}

/**
 * Change Impact 闭包（§106-108 最小算子；PRD v0.6 §151 Graph Diff 的派生半边）：
 * 从根端点出发沿反向依赖边（谁指向我）BFS，产出受影响对象集（去重、按 (depth, domain, id)
 * 确定性排序）。maxDepth 缺省 4（防御环：relations 装载面已禁自环三元组，环只可能经
 * 多跳形成——超深截断显式呈现 max_depth_reached，禁静默）。
 * root 参数类型 = RelationEndpoint（已解析端点，domain 过词表）：返回值 ImpactClosure.root
 * 即按 RelationEndpoint 契约回传——入参收窄后回传词表值词形为真（严格 tsc 清零；
 * 调用方契约不变——既有调用点均传已解析端点字面量）。
 */
export interface ImpactClosureNode {
  readonly endpoint: RelationEndpoint;
  /** 距根的跳数（根的直接依赖者=1）。 */
  readonly depth: number;
  /** 经由哪条边到达（edge_id + type——影响链证据位）。 */
  readonly via_edge_id: string;
  readonly via_edge_type: RelationTypeValue;
}

export interface ImpactClosure {
  readonly root: RelationEndpoint;
  readonly affected: readonly ImpactClosureNode[];
  readonly max_depth_reached: boolean;
}

export function impactClosure(
  entries: readonly RelationEntry[],
  root: RelationEndpoint,
  options?: { readonly maxDepth?: number },
): ImpactClosure {
  const maxDepth = options?.maxDepth ?? 4;
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 16) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `maxDepth 非法：${String(maxDepth)}（须 1..16——防御失控 BFS）`,
      "给出有界深度；超界影响面应走全量图 rebuild（批次 2+）",
      { maxDepth },
    );
  }
  const incoming = new Map<string, RelationEntry[]>();
  for (const entry of entries) {
    const key = `${entry.target.domain}:${entry.target.id}`;
    const list = incoming.get(key) ?? [];
    list.push(entry);
    incoming.set(key, list);
  }
  const affected: ImpactClosureNode[] = [];
  const visited = new Set<string>([`${root.domain}:${root.id}`]);
  const frontier: { domain: string; id: string; depth: number }[] = [
    { domain: root.domain, id: root.id, depth: 0 },
  ];
  let maxDepthReached = false;
  while (frontier.length > 0) {
    const current = frontier.shift() ?? (undefined as never);
    if (current.depth >= maxDepth) {
      maxDepthReached = true;
      continue;
    }
    const edges = incoming.get(`${current.domain}:${current.id}`) ?? [];
    for (const edge of edges) {
      const sourceKey = `${edge.source.domain}:${edge.source.id}`;
      if (visited.has(sourceKey)) continue;
      visited.add(sourceKey);
      affected.push({
        endpoint: edge.source,
        depth: current.depth + 1,
        via_edge_id: edge.edge_id,
        via_edge_type: edge.type,
      });
      frontier.push({ domain: edge.source.domain, id: edge.source.id, depth: current.depth + 1 });
    }
  }
  affected.sort(
    (a, b) =>
      a.depth - b.depth ||
      (a.endpoint.domain < b.endpoint.domain ? -1 : a.endpoint.domain > b.endpoint.domain ? 1 : 0) ||
      (a.endpoint.id < b.endpoint.id ? -1 : 1),
  );
  return { root: { domain: root.domain, id: root.id }, affected, max_depth_reached: maxDepthReached };
}

/** 正向依赖（我指向谁）。 */
export function forwardDependencies(
  entries: readonly RelationEntry[],
  endpoint: RelationEndpointInput,
): readonly RelationEntry[] {
  return entries.filter(
    (entry) => entry.source.domain === endpoint.domain && entry.source.id === endpoint.id,
  );
}

// ============================================================
// 内部共享
// ============================================================

function buildEntry(input: RelationRegistrationInput, seq: number): RelationEntry {
  const type = normalizeRelationType(input.type);
  const origin = normalizeRelationOrigin(input.origin);
  const confidence = normalizeRelationConfidence(input.confidence);
  const source = buildEndpoint(input.source, "source");
  const target = buildEndpoint(input.target, "target");
  const sourceRef = requireTrimmed(input.sourceRef, "sourceRef", "登记出处锚必填（源文件:行 / PRD §号 / GRN 引用）");
  const producer = (input.producer ?? "").trim();
  if (producer.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "producer 为空（每边必答「谁产出」——PRD §8 provenance.producer）",
      "给出 ANALYZER.* / SENSOR.* / human:<主体> 词形",
      {},
    );
  }
  if (!/^[A-Z][A-Z0-9_.\-]{0,63}$/.test(producer) && !producer.startsWith("human:")) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `producer 词形非法：${producer}（ANALYZER.* / SENSOR.* / human:<主体>）`,
      "产出者词形每边必答；自由文本不是产出者身份",
      { producer },
    );
  }
  const observationRef =
    origin === "runtime_trace"
      ? requireTrimmed(
          input.observationRef,
          "observationRef",
          "runtime_trace 边必须附观察回执引用（OBS-n / POB-<12hex>——「Agent 必须证明我看过」边侧封条）",
        )
      : input.observationRef !== undefined && input.observationRef.trim().length > 0
        ? throwOriginMismatch(origin)
        : null;
  if (observationRef !== null && !OBSERVATION_REF_PATTERN.test(observationRef)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `observation_ref 词形非法：${observationRef}（须 OBS-n / POB-<12hex>）`,
      "运行时边只接受既有观察回执通路词形引用，禁手造 id",
      { observation_ref: observationRef },
    );
  }
  const uncertaintyNote =
    confidence === "probable"
      ? requireTrimmed(
          input.uncertaintyNote,
          "uncertaintyNote",
          "confidence=probable 必须披露不确定性注记（§148 Analyzer Output Contract）",
        )
      : input.uncertaintyNote !== undefined && input.uncertaintyNote.trim().length > 0
        ? (() => {
            throw new GovernanceError(
              "SCHEMA_INVALID",
              "confidence≠probable 却携带 uncertaintyNote（披露位与置信级互斥）",
              "确定性/声明边无不确定性披露位",
              {},
            );
          })()
        : null;
  const declaredBy =
    origin === "human_declared"
      ? input.declaredBy !== undefined && input.declaredBy.trim().length > 0
        ? input.declaredBy.trim()
        : null
      : input.declaredBy !== undefined && input.declaredBy.trim().length > 0
        ? (() => {
            throw new GovernanceError(
              "SCHEMA_INVALID",
              `origin=${origin} 却携带 declaredBy（声明主体位仅 human_declared 边合法）`,
              "机器派生边的主体归 producer 词形",
              { declared_by: input.declaredBy },
            );
          })()
        : null;
  const note = input.note !== undefined && input.note.trim().length > 0 ? input.note.trim() : null;
  const locator = input.locator !== undefined && input.locator.trim().length > 0 ? input.locator.trim() : null;
  return {
    edge_id: edgeIdOf(source, type, target),
    type,
    source,
    target,
    origin,
    confidence,
    producer,
    uncertainty_note: uncertaintyNote,
    provenance: {
      recorded_at_seq: seq,
      source_ref: sourceRef,
      locator,
      observation_ref: observationRef,
      declared_by: declaredBy,
    },
    note,
  };
}

function throwOriginMismatch(origin: RelationOriginValue): never {
  throw new GovernanceError(
    "SCHEMA_INVALID",
    `origin=${origin} 却携带 observationRef（来源面互斥封条——观察回执位仅 runtime_trace 边合法）`,
    "static_analysis 边的依据归 locator；human_declared 边的依据归 sourceRef",
    { origin },
  );
}

function buildEndpoint(input: RelationEndpointInput, label: string): RelationEndpoint {
  const domain = normalizeEndpointDomain(input?.domain ?? "");
  const id = (input?.id ?? "").trim();
  if (id.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${label}.id 为空（空端点无从建边）`,
      "给出非空端点 id（truth=governed id / catalog=条目 id）",
      {},
    );
  }
  if (domain === "truth") {
    try {
      parseGovernedId(id);
    } catch (error) {
      if (error instanceof GovernedIdParseError) {
        throw new GovernanceError(
          "SCHEMA_INVALID",
          `${label} truth 端点「${id}」不过 governed id 文法：${error.message}`,
          "truth 端点须为 PREFIX.SEGMENT(.SEGMENT)*[.SEQ] canonical governed id（A5 closed-world）",
          { id },
        );
      }
      throw error;
    }
  } else if (!CATALOG_ENDPOINT_ID_PATTERN.test(id)) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${label} catalog 端点「${id}」词形非法（至少两段 SCREAMING_SNAKE）`,
      "catalog 端点须命中 catalog-lock entries 分母（存在性归消费面 loader 判卷）",
      { id },
    );
  }
  return { domain, id };
}

function tripleKey(entry: RelationEntry): string {
  return tripleKeyOf(entry.source, entry.type, entry.target);
}

function tripleKeyOf(
  source: RelationEndpoint,
  type: string,
  target: RelationEndpoint,
): string {
  return `${source.domain}:${source.id}|${type}|${target.domain}:${target.id}`;
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  lineNo: number,
  label?: string,
): string {
  const value = record[field];
  if (!isNonEmptyString(value)) {
    throw relationsInvalid(
      `${label ?? `第 ${lineNo} 行`} ${field} 缺失或非非空字符串`,
    );
  }
  return value;
}

function requireTrimmed(value: string | undefined, field: string, why: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `${field} 为空（${why}）`,
      why,
      { [field]: value ?? null },
    );
  }
  return trimmed;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function notConfigured(store: Store): GovernanceError {
  return new GovernanceError(
    "NOT_CONFIGURED",
    "store 未初始化（state/truth-index.json 缺失）",
    "先跑 createStore(rootDir) 完成骨架初始化（No-op is elegant）",
    { rootDir: store.rootDir },
  );
}
