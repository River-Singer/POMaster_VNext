/**
 * @pomaster/schemas —— POMaster vNext 公共 schema 资产导出与 FROZEN 词表镜像。
 *
 * 形态契约：assets/01..14 十四份 JSON Schema（draft-07，$id 形态
 * https://pomaster.dev/schemas/<name>/v1-draft.json）＋ 02b-kind-payloads.md /
 * golden-seed-mapping.md 两份配套文档（原样随包分发，非运行时依赖）。
 *
 * P18 增量（08/09/10）：Discovery 状态链 / MSD-Uncertainty / Research Artifact
 * 三份 schema 的词形按 PRD 原文落在各自 definitions 冻结（新状态面，不混入既有
 * 对象轴词表），提请词汇表 PR 收编；代码镜像点 ./vocab.js「待词汇表 PR 收编」段。
 * P19 增量（11）：Exception Ledger（§49.2 异常登记面，五分类词轴 pending_vocab_pr）。
 * P28 增量（12）：Knowledge Entry（§83 内核，四类型/五状态/提升权威位/置信三级/
 * Context 分区词轴 pending_vocab_pr；authority 恒 ADVISORY——§83.2 铁律形态封条）。
 * P31 增量（13）：Equivalence Registry（跨域联结词形等价登记表，GRN-4402 转译 /
 * A13 · OPEN-M6-12；domain 轴/status 轴 pending_vocab_pr；declared-equivalence-only
 * ——登记≠裁决、禁启发式猜测、未登记词形 pending 桶绝不假绿）。
 * P33 增量（14）：Memory Harvest Inbox Entry（harvest 台账管线，PRD §48.2/§48.4/§44.10
 * + thread-B §4 迁移设计；bucket/memory_class/review_state/source/confidence 五词轴
 * pending_vocab_pr；内容原文零改写铁律 + review_state 默认 PENDING 封条 + Case N
 * 不得自动成为 Truth 的 staging 形态封条）。
 * P34 增量（15）：Production Control Band（§95 全节 + §30 第四态 + §55.1/§90.4；
 * phase_timeline/production_signal_source/band_predicate_operator/
 * control_band_evaluation_status/diagnosis_kind/self_improvement_signal 六词轴
 * 已随 vocab-pr-0004 收编 vocab-lock@v0.3-resolved（Owner 决议 2026-09-01）；
 * 谓词 machine-evaluable 封死自由文本判据位——§95.2「不得把
 * 『是否异常』完全交给 LLM 主观判断」的类型面落点；CHALLENGED 复用 CHANGE_VALUES
 * 不重复登记）。
 *
 * 词表纪律：一切枚举唯一来源是 assets/vocab-lock.draft.yaml（FROZEN）；
 * 代码侧唯一镜像点在 ./vocab.js（本文件 re-export）。YAML 资产仅作人读/工具对账，
 * 不在运行时解析（不引入 YAML 解析依赖）。
 *
 * D24 哈希伦理：schema 中一切 digest/sha256 字段仅读侧服务
 * （identity / 短路重跑 / 防篡改抽验），永不阻断写入；人类永不计算哈希
 * （store 事务自动维护）——见各 schema 内 x-digest-ethics 注记。
 *
 * 装载提示（ajv）：schema 携带大量 x- 注记键（含 D24 强制在场的 x-digest-ethics），
 * 请以 `new Ajv({ strictSchema: false })` 装载，或逐个 ajv.addKeyword 注册注记键；
 * 跨文件 $ref 为绝对 $id 形态，组合装载须将全部 15 份 schema addSchema 注册。
 */
import evidenceRecordsSchemaRaw from "../assets/07-evidence-records.schema.json" with { type: "json" };
import denominatorSchemaRaw from "../assets/05-denominator.schema.json" with { type: "json" };
import gateResultSchemaRaw from "../assets/03-gate-result.schema.json" with { type: "json" };
import keybindingSchemaRaw from "../assets/04-keybinding.schema.json" with { type: "json" };
import objectEnvelopeSchemaRaw from "../assets/02-object-envelope.schema.json" with { type: "json" };
import producerSchemaRaw from "../assets/06-producer.schema.json" with { type: "json" };
import truthIndexSchemaRaw from "../assets/01-truth-index.schema.json" with { type: "json" };
import discoveryStateChainSchemaRaw from "../assets/08-discovery-state-chain.schema.json" with { type: "json" };
import msdUncertaintySchemaRaw from "../assets/09-msd-uncertainty.schema.json" with { type: "json" };
import researchArtifactSchemaRaw from "../assets/10-research-artifact.schema.json" with { type: "json" };
import exceptionLedgerSchemaRaw from "../assets/11-exception-ledger.schema.json" with { type: "json" };
import knowledgeEntrySchemaRaw from "../assets/12-knowledge-entry.schema.json" with { type: "json" };
import equivalenceRegistrySchemaRaw from "../assets/13-equivalence-registry.schema.json" with { type: "json" };
import memoryHarvestSchemaRaw from "../assets/14-memory-harvest.schema.json" with { type: "json" };
import productionBandSchemaRaw from "../assets/15-production-band.schema.json" with { type: "json" };

export * from "./vocab.js";

/** 供 ajv 等校验器传递的宽松 schema 形态（只声明消费所需最小面；细节一律 unknown）。 */
export interface JsonSchemaObject {
  readonly $id?: string;
  readonly $schema?: string;
  readonly type?: string;
  readonly required?: readonly string[];
  readonly [key: string]: unknown;
}

/** schema 版本常量（镜像各 $id 的 v1-draft 词形；升级走词汇表/Schema PR，禁止就地改）。 */
export const SCHEMA_VERSION = "v1-draft" as const;

const TRUTH_INDEX_ID = "https://pomaster.dev/schemas/truth-index/v1-draft.json";
const OBJECT_ENVELOPE_ID =
  "https://pomaster.dev/schemas/object-envelope/v1-draft.json";
const GATE_RESULT_ID = "https://pomaster.dev/schemas/gate-result/v1-draft.json";
const KEYBINDING_ID = "https://pomaster.dev/schemas/keybinding/v1-draft.json";
const DENOMINATOR_ID =
  "https://pomaster.dev/schemas/denominator/v1-draft.json";
const PRODUCER_ID = "https://pomaster.dev/schemas/producer/v1-draft.json";
const EVIDENCE_RECORDS_ID =
  "https://pomaster.dev/schemas/evidence-records/v1-draft.json";
const DISCOVERY_STATE_CHAIN_ID =
  "https://pomaster.dev/schemas/discovery-state-chain/v1-draft.json";
const MSD_UNCERTAINTY_ID =
  "https://pomaster.dev/schemas/msd-uncertainty/v1-draft.json";
const RESEARCH_ARTIFACT_ID =
  "https://pomaster.dev/schemas/research-artifact/v1-draft.json";
const EXCEPTION_LEDGER_ID =
  "https://pomaster.dev/schemas/exception-ledger/v1-draft.json";
const KNOWLEDGE_ENTRY_ID =
  "https://pomaster.dev/schemas/knowledge-entry/v1-draft.json";
const EQUIVALENCE_REGISTRY_ID =
  "https://pomaster.dev/schemas/equivalence-registry/v1-draft.json";
const MEMORY_HARVEST_ID =
  "https://pomaster.dev/schemas/memory-harvest/v1-draft.json";
const PRODUCTION_BAND_ID =
  "https://pomaster.dev/schemas/production-band/v1-draft.json";

function asSchema(raw: unknown, expectedId: string): JsonSchemaObject {
  const schema = raw as JsonSchemaObject;
  // $id 与文件角色的绑定在模块装载期即校验：装载错位（复制错文件/改错名）立即 FATAL，
  // 而非运行期静默给出错误的校验结论。
  if (schema.$id !== expectedId) {
    throw new Error(
      `schema asset mismatch: expected $id ${expectedId}, got ${String(schema.$id)}`,
    );
  }
  return schema;
}

export const truthIndexSchema = asSchema(truthIndexSchemaRaw, TRUTH_INDEX_ID);
export const objectEnvelopeSchema = asSchema(
  objectEnvelopeSchemaRaw,
  OBJECT_ENVELOPE_ID,
);
export const gateResultSchema = asSchema(gateResultSchemaRaw, GATE_RESULT_ID);
export const keybindingSchema = asSchema(keybindingSchemaRaw, KEYBINDING_ID);
export const denominatorSchema = asSchema(denominatorSchemaRaw, DENOMINATOR_ID);
export const producerSchema = asSchema(producerSchemaRaw, PRODUCER_ID);
export const evidenceRecordsSchema = asSchema(
  evidenceRecordsSchemaRaw,
  EVIDENCE_RECORDS_ID,
);
export const discoveryStateChainSchema = asSchema(
  discoveryStateChainSchemaRaw,
  DISCOVERY_STATE_CHAIN_ID,
);
export const msdUncertaintySchema = asSchema(
  msdUncertaintySchemaRaw,
  MSD_UNCERTAINTY_ID,
);
export const researchArtifactSchema = asSchema(
  researchArtifactSchemaRaw,
  RESEARCH_ARTIFACT_ID,
);
export const exceptionLedgerSchema = asSchema(
  exceptionLedgerSchemaRaw,
  EXCEPTION_LEDGER_ID,
);
export const knowledgeEntrySchema = asSchema(
  knowledgeEntrySchemaRaw,
  KNOWLEDGE_ENTRY_ID,
);
export const equivalenceRegistrySchema = asSchema(
  equivalenceRegistrySchemaRaw,
  EQUIVALENCE_REGISTRY_ID,
);
export const memoryHarvestSchema = asSchema(
  memoryHarvestSchemaRaw,
  MEMORY_HARVEST_ID,
);
export const productionBandSchema = asSchema(
  productionBandSchemaRaw,
  PRODUCTION_BAND_ID,
);

/** 全部 15 份 schema 的聚合（组合装载：ajv.addSchema 逐个注册即可遍历本对象）。 */
export const allSchemas = {
  truthIndex: truthIndexSchema,
  objectEnvelope: objectEnvelopeSchema,
  gateResult: gateResultSchema,
  keybinding: keybindingSchema,
  denominator: denominatorSchema,
  producer: producerSchema,
  evidenceRecords: evidenceRecordsSchema,
  discoveryStateChain: discoveryStateChainSchema,
  msdUncertainty: msdUncertaintySchema,
  researchArtifact: researchArtifactSchema,
  exceptionLedger: exceptionLedgerSchema,
  knowledgeEntry: knowledgeEntrySchema,
  equivalenceRegistry: equivalenceRegistrySchema,
  memoryHarvest: memoryHarvestSchema,
  productionBand: productionBandSchema,
} as const;

// ============================================================
// P27（B3-3）：PRD §29.1 PerformanceBudget 定义的运行时消费锚
// ============================================================

/**
 * 从 02 信封 $definitions 提取具名定义（装载期即校验：定义缺席 = 装载错位，
 * 立即 FATAL 而非运行期静默——asSchema 同款纪律）。
 */
function definitionOf(
  schema: JsonSchemaObject,
  name: string,
): Record<string, unknown> {
  const definitions = schema["$definitions"];
  if (definitions === null || typeof definitions !== "object" || Array.isArray(definitions)) {
    throw new Error(
      `schema asset malformed: ${String(schema.$id)} 缺少 $definitions 对象`,
    );
  }
  const def = (definitions as Record<string, unknown>)[name];
  if (def === null || typeof def !== "object" || Array.isArray(def)) {
    throw new Error(
      `schema asset mismatch: ${String(schema.$id)} $definitions.${name} 缺席（定义被改名/删除？）`,
    );
  }
  return def as Record<string, unknown>;
}

/**
 * PRD §29.1 performance_budget 定义对象（02 信封 $definitions.PerformanceBudget
 * 原文引用，非镜像拷贝——schema 是唯一事实源，判卷消费面（gauntlet-lite
 * PERFORMANCE 腿）从这里读字段集，零漂移）。minProperties: 1 +
 * additionalProperties: false（字段集封闭，禁发明字段）。
 */
export const performanceBudgetDefinition = definitionOf(
  objectEnvelopeSchema,
  "PerformanceBudget",
);

function performanceBudgetPropertyNames(): readonly string[] {
  const properties = performanceBudgetDefinition["properties"];
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error(
      "schema asset mismatch: $definitions.PerformanceBudget.properties 缺席（定义形态被破坏？）",
    );
  }
  // 排序输出保证确定性（消费面按此集合做字段识别，序无关但留痕序稳定）。
  return Object.keys(properties as Record<string, unknown>).sort();
}

/**
 * §29.1 预算字段全集（从 performanceBudgetDefinition.properties 派生，非手抄——
 * schema 改字段集即同步，无第二份镜像可漂移）。当前六字段：
 * initial_js_gzip_kb / inp_ms / lcp_ms / long_task_ms / max_chunk_kb / max_memory_mb。
 */
export const PERFORMANCE_BUDGET_FIELDS = performanceBudgetPropertyNames();
