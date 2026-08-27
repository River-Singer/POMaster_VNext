/**
 * @pomaster/schemas —— POMaster vNext 公共 schema 资产导出与 FROZEN 词表镜像。
 *
 * 形态契约：assets/01..07 七份 JSON Schema（draft-07，$id 形态
 * https://pomaster.dev/schemas/<name>/v1-draft.json）＋ 02b-kind-payloads.md /
 * golden-seed-mapping.md 两份配套文档（原样随包分发，非运行时依赖）。
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
 * 跨文件 $ref 为绝对 $id 形态，组合装载须将全部 7 份 schema addSchema 注册。
 */
import evidenceRecordsSchemaRaw from "../assets/07-evidence-records.schema.json" with { type: "json" };
import denominatorSchemaRaw from "../assets/05-denominator.schema.json" with { type: "json" };
import gateResultSchemaRaw from "../assets/03-gate-result.schema.json" with { type: "json" };
import keybindingSchemaRaw from "../assets/04-keybinding.schema.json" with { type: "json" };
import objectEnvelopeSchemaRaw from "../assets/02-object-envelope.schema.json" with { type: "json" };
import producerSchemaRaw from "../assets/06-producer.schema.json" with { type: "json" };
import truthIndexSchemaRaw from "../assets/01-truth-index.schema.json" with { type: "json" };

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

/** 全部 7 份 schema 的聚合（组合装载：ajv.addSchema 逐个注册即可遍历本对象）。 */
export const allSchemas = {
  truthIndex: truthIndexSchema,
  objectEnvelope: objectEnvelopeSchema,
  gateResult: gateResultSchema,
  keybinding: keybindingSchema,
  denominator: denominatorSchema,
  producer: producerSchema,
  evidenceRecords: evidenceRecordsSchema,
} as const;
