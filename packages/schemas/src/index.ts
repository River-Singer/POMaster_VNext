/**
 * @pomaster/schemas —— POMaster vNext 公共 schema 资产导出与 FROZEN 词表镜像。
 *
 * 形态契约：assets/01..18 十八份 JSON Schema（draft-07，$id 形态
 * https://pomaster.dev/schemas/<name>/v1-draft.json；编号随资产批次不连续）＋
 * 02b-kind-payloads.md /
 * golden-seed-mapping.md 两份配套文档（原样随包分发，非运行时依赖）。
 *
 * P18 增量（08/09/10）：Discovery 状态链 / MSD-Uncertainty / Research Artifact
 * 三份 schema 的词形按 PRD 原文落在各自 definitions 冻结（新状态面，不混入既有
 * 对象轴词表），已随 PR-0009 收编（vocab-lock discovery_vocab）；代码镜像点 ./vocab.js。
 * P19 增量（11）：Exception Ledger（§49.2 异常登记面，五分类词轴——vocab-lock discovery_vocab，PR-0009 收编）。
 * P28 增量（12）：Knowledge Entry（§83 内核，四类型/五状态/提升权威位/置信三级/
 * Context 分区词轴——vocab-lock knowledge_vocab，PR-0009 收编；authority 恒 ADVISORY——§83.2 铁律形态封条）。
 * P31 增量（13）：Equivalence Registry（跨域联结词形等价登记表，GRN-4402 转译 /
 * A13 · OPEN-M6-12；domain 轴/status 轴——vocab-lock equivalence_vocab，PR-0009 收编；declared-equivalence-only
 * ——登记≠裁决、禁启发式猜测、未登记词形 pending 桶绝不假绿）。
 * P33 增量（14）：Memory Harvest Inbox Entry（harvest 台账管线，PRD §48.2/§48.4/§44.10
 * + thread-B §4 迁移设计；bucket/memory_class/review_state/source/confidence 五词轴
 * 五词轴已随 PR-0009 收编（vocab-lock memory_harvest_vocab）；内容原文零改写铁律 + review_state 默认 PENDING 封条 + Case N
 * 不得自动成为 Truth 的 staging 形态封条）。
 * P34 增量（15）：Production Control Band（§95 全节 + §30 第四态 + §55.1/§90.4；
 * phase_timeline/production_signal_source/band_predicate_operator/
 * control_band_evaluation_status/diagnosis_kind/self_improvement_signal 六词轴
 * 已随 vocab-pr-0004 收编 vocab-lock@v0.3-resolved（Owner 决议 2026-09-01）；
 * 谓词 machine-evaluable 封死自由文本判据位——§95.2「不得把
 * 『是否异常』完全交给 LLM 主观判断」的类型面落点；CHALLENGED 复用 CHANGE_VALUES
 * 不重复登记）。
 * W1-C 增量（16）：Execution Trace Manifest Lite（PRD v0.5.2 §8 行为侧车 +
 * §14 P0.5-3 + §15 Benchmark C + §16 Case A；Owner 裁决 8 ② 2026-09-01）。Trace 是
 * Identity 的派生投影/侧车（A19，不新增第二套身份）；reads/agent_spawns 恒空数组
 * 显式（Lite 边界 =「不先采集完整 read trace」）；§8.4 隐私封条 = 闭形态
 * additionalProperties:false 无自由文本载荷位。trace_retention 轴（§8.3 逐字四档）
 * 与 schema 词形 pomaster.execution_trace/v1 已随 PR-0009 收编（vocab-lock
 * trace_perception_vocab）。verdict 七态
 * 复用 03 definitions.verdict 绝对 $id 引用（单一事实源禁二次镜像）。
 * W1-D2 增量（17）：Perception Receipts（PRD v0.5.2 §6.7/§6.13/§6.14 + §14 P0.5-4 +
 * §15 Benchmark E + §16 Case H；Owner 裁决 8 2026-09-01）。双记录族 root oneOf：
 * environment_receipt（§6.7 yaml 九键——Doctor 确认面，实测 null 显式缺席为 Case H
 * blocked 证据链消费位）+ observation_receipt（§6.13 yaml 十三键——「Agent 必须证明
 * 我看过」，result=OBSERVED 必须 ≥1 条 artifact_refs 的 allOf 封条 = Benchmark E
 * 「Observation Receipt 不得冒充有效业务 Evidence」的 schema 级落点）。artifact_refs
 * 复用 07 definitions.blob_ref / object_id 绝对 $id 引用（裁决 8 ③ D1=A blob sha256
 * 即身份不新增 EVR- id；D3=A blob 分支收窄——组合加载须注册 07）。词形轴
 * environment_doctor_verdict / observation_surface / observation_result /
 * SENSOR./JOURNEY./ENV. 与通路编号 OBS-/ENVREC- 已随 PR-0009 收编（vocab-lock
 * trace_perception_vocab + id_namespace.state_plane_refs + catalog_layer_vocab.material_id_prefixes）。§6.13
 * sidecar 纪律：admitted_to_truth_index=false；OBS/ENVREC 回执落盘分区 Owner 未裁
 * （研究 §7 位 5）——本 schema 为「schema 先行、通路面缺位」先例（07 blob_ref 同款）
 * 的前置冻结面。
 * VB-PR1 增量（18）：Grounded Decision Graph（PRD v0.5.3 §5/§16 Decision Graph +
 * §9/§10 research_request/research_handoff/finding_link 三平面 definitions 同住一份
 * schema——10 号零改动，Owner 裁决 9③）。词形纪律（Owner 裁决 9②）：DECISION./
 * RESEARCH.REQ./FINDING./DISCOVERY.INTENT./FACT. 是 Discovery 平面局部词形（不入
 * governed prefixes、不过 parseGovernedId），GRILLING/GRILLED/GRILL_CONFIRMED
 * 禁词负例登记（§1.1 不新增 State Axis）；Grounding Verdict 五值是**派生判定不落盘**
 * （§6.2 不进 Canonical Object State Axis）——schema 18 无 verdict 字段。
 * 词形已随 PR-0009 入锁（vocab-lock decision_graph_vocab 段 + state_plane_refs Discovery 平面注记）。
 * P-v06 增量（19）：Software Graph Relations（PRD v0.6 §6-8 + Owner 四决议 D-1~D-4
 * 2026-09-02；批次 0 Model Constitution）。Typed Relation sidecar 台账形态契约
 * （state/relations.jsonl 追加流侧车：不建图库、不改 01、不进 content_digest）；
 * 词形轴 relation_type/relation_origin/relation_endpoint_domain/relation_confidence
 * 已随 vocab-pr-0006 收编 vocab-lock@v0.5-resolved 主表 software_graph_vocab 段
 * （EDGE-<12hex> 通路词形同批注记 id_namespace.state_plane_refs）。
 * vNext Batch 1 增量（20）：Sources Authority Registry（PRD vNext §3/§3A；Owner 裁定
 * D2 2026-09-04）。来源工件权威边界 registry（.pomaster/sources/index.yaml）：每条
 * source 声明正交权威双轴 authoritative_for / non_authoritative_for（维度开放词表 +
 * 轴结构闭包，两轴不相交由装载侧 fail-closed 补齐——draft-07 不可表达）。负封条零
 * 改动：02 信封 source_types 十值闭包是另一轴（对象出处面），本 registry 的 type
 * 开放词形零关联（x-pomaster-contract.negative_seal_untouched）。词形轴
 * 已随 PR-0009 登记（vocab-lock sources_authority_vocab.fields_note 字段面注记）。
 * vNext Batch 2 增量（21）：Evidence Spec（PRD vNext §9.2 四概念分离；Owner 裁定
 * D6 2026-09-04）。要求面一等对象（「需要什么证明」）：kind=business_rule 承载 +
 * payload.spec_kind=evidence_spec 判别的 kind profile 收窄面（01/02 FROZEN 面零改动
 * ——kind 闭包十类不变）；requirements[] 每条 = 需要的证明类型 + 判定资格条件
 * （claim_refs/gate_refs 资格清单 + subject_ref 归属绑定——挪证缝收口）；Spec 持要求
 * 不持判定（无 verdict 词位）；SPEC. 前缀随 PR-0008 入 prefixes_v0 闭包（三镜像同批）。
 * 词形轴 proof_type/spec_kind 已随 PR-0009 登记（vocab-lock evidence_spec_vocab）。
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
 * 跨文件 $ref 为绝对 $id 形态，组合装载须将全部 18 份 schema addSchema 注册。
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
import executionTraceSchemaRaw from "../assets/16-execution-trace.schema.json" with { type: "json" };
import perceptionReceiptsSchemaRaw from "../assets/17-perception-receipts.schema.json" with { type: "json" };
import decisionGraphSchemaRaw from "../assets/18-decision-graph.schema.json" with { type: "json" };
import softwareGraphRelationsSchemaRaw from "../assets/19-software-graph-relations.schema.json" with { type: "json" };
import sourcesAuthoritySchemaRaw from "../assets/20-sources-authority.schema.json" with { type: "json" };
import evidenceSpecSchemaRaw from "../assets/21-evidence-spec.schema.json" with { type: "json" };

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
const EXECUTION_TRACE_ID =
  "https://pomaster.dev/schemas/execution-trace/v1-draft.json";
const PERCEPTION_RECEIPTS_ID =
  "https://pomaster.dev/schemas/perception-receipts/v1-draft.json";
const DECISION_GRAPH_ID =
  "https://pomaster.dev/schemas/decision-graph/v1-draft.json";
const SOFTWARE_GRAPH_RELATIONS_ID =
  "https://pomaster.dev/schemas/software-graph-relations/v1-draft.json";
const SOURCES_AUTHORITY_ID =
  "https://pomaster.dev/schemas/sources-authority/v1-draft.json";
const EVIDENCE_SPEC_ID =
  "https://pomaster.dev/schemas/evidence-spec/v1-draft.json";

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
export const executionTraceSchema = asSchema(
  executionTraceSchemaRaw,
  EXECUTION_TRACE_ID,
);
export const perceptionReceiptsSchema = asSchema(
  perceptionReceiptsSchemaRaw,
  PERCEPTION_RECEIPTS_ID,
);
export const decisionGraphSchema = asSchema(
  decisionGraphSchemaRaw,
  DECISION_GRAPH_ID,
);
export const softwareGraphRelationsSchema = asSchema(
  softwareGraphRelationsSchemaRaw,
  SOFTWARE_GRAPH_RELATIONS_ID,
);
export const sourcesAuthoritySchema = asSchema(
  sourcesAuthoritySchemaRaw,
  SOURCES_AUTHORITY_ID,
);
export const evidenceSpecSchema = asSchema(
  evidenceSpecSchemaRaw,
  EVIDENCE_SPEC_ID,
);

/** 全部 schema 的聚合（组合装载：ajv.addSchema 逐个注册即可遍历本对象）。 */
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
  executionTrace: executionTraceSchema,
  perceptionReceipts: perceptionReceiptsSchema,
  decisionGraph: decisionGraphSchema,
  softwareGraphRelations: softwareGraphRelationsSchema,
  sourcesAuthority: sourcesAuthoritySchema,
  evidenceSpec: evidenceSpecSchema,
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
