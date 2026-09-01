/**
 * digest.ts —— canonical JSON 与 D24 哈希伦理的机器落点。
 *
 * D24（x-digest-ethics: write_blocking=false / side=read_only_service /
 * human_touch=forbidden / violation=WARN+auto-regen hint）：
 * - digest/sha 仅读侧服务：identity / 短路重跑（inputs_fingerprint）/ 防篡改抽验；
 * - 永不阻断写入：失配/手改 → WARN + 自动重算覆盖（auto-regen），见 store.applyTransaction；
 * - 人类永不计算哈希：一切 content_digest / body_sha256 / inputs_fingerprint /
 *   vocab 指纹均由本模块 + store 事务自动维护，任何 API 都不暴露「给人算哈希」的入口；
 * - 无墙钟（A4）：本模块的全部输出只依赖输入内容本身，同输入重放字节稳定。
 *
 * vocab 指纹口径：对「代码唯一镜像点」@pomaster/schemas/src/vocab.ts 的常量做
 * canonical JSON 摘要（该文件逐值镜像 vocab-lock@v0.3-resolved；指纹只取 state_axes /
 * truth_bodies / prefixes 三块，PR-0001/PR-0004 增补段不参与，指纹值稳定）。不解析 YAML 资产
 * （schemas 包不引入 YAML 运行时依赖）；写入端与对账端共用同一计算 → 指纹漂移
 * 当且仅当词表代码镜像变化，正是「枚举多头拷贝」要抓的信号。
 */
import { createHash } from "node:crypto";
import {
  CHANGE_VALUES,
  CONFIDENCE_VALUES,
  EVIDENCE_VALUES,
  GOVERNED_ID_PREFIXES,
  IR_SCHEMA_DIALECT,
  LIFECYCLE_TRANSITIONS,
  LIFECYCLE_VALUES,
  TRUTH_BODY_KINDS,
} from "./vocab.js";

/**
 * canonical JSON：递归按 key 的码元序排序、无空白。
 * 数组保序；undefined/函数等不可序列化值不出现于受 digest 管辖数据（写入层保证）。
 * 同一结构无论构造顺序如何 → 字节全等（幂等 golden test 基础）。
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${body.join(",")}}`;
}

/** sha256:<64 位小写十六进制>（01 definitions.sha256_digest 词形，D24：事务自动维护）。 */
export function sha256OfCanonical(value: unknown): string {
  const hash = createHash("sha256");
  hash.update(canonicalJson(value), "utf8");
  return `sha256:${hash.digest("hex")}`;
}

/**
 * 原始字节摘要（artifact 内容寻址；PRD §7.3「content_identity 只能由基础设施产生」
 * 的机器落点，D24 伦理同条：基础设施计算、人类禁触）。与 sha256OfCanonical 是
 * **两种不同哈希对象**（R3）：本函数对 artifact 原始字节（如 PNG 解码后字节）做
 * raw sha256，绝不对 canonical-JSON 做——消费方不得拿 claim blob 降级引用的
 * canonical 摘要（store.record_claim 对引用字符串的哈希）到 blobs/ 目录找文件。
 * P0.5-2 Screenshot Evidence Binding（裁决8③：receipt 身份=blob sha256 即身份）。
 */
export function sha256OfBytes(bytes: Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(bytes);
  return `sha256:${hash.digest("hex")}`;
}

/** 词表指纹三元组（01 truth-index.vocab_lock 的对账基准）。 */
export interface VocabFingerprints {
  readonly stateAxes: string;
  readonly kinds: string;
  readonly prefixes: string;
}

/** 由代码唯一镜像点计算词表指纹（state_axes / kinds / prefixes 三块）。 */
export function vocabFingerprints(): VocabFingerprints {
  return {
    stateAxes: sha256OfCanonical({
      lifecycle: {
        values: LIFECYCLE_VALUES,
        transitions: LIFECYCLE_TRANSITIONS,
      },
      confidence: CONFIDENCE_VALUES,
      evidence: EVIDENCE_VALUES,
      change: CHANGE_VALUES,
    }),
    kinds: sha256OfCanonical({ truth_bodies: TRUTH_BODY_KINDS }),
    prefixes: sha256OfCanonical({ prefixes_v0: GOVERNED_ID_PREFIXES }),
  };
}

/** content_digest 授权计算范围（01 x-pomaster-contract.digest_authorized_scope）。 */
export interface DigestScopeInput {
  readonly irSchema?: string;
  readonly generation?: {
    readonly tool: string;
    readonly seq: number;
    readonly inputsFingerprint: string;
  };
  readonly vocabLock?: VocabFingerprints;
  readonly denominators?: readonly unknown[];
  readonly objects?: readonly unknown[];
  /** producers 只取静态字段；liveness（活性快照，含 last_* 与判定）明确排除。 */
  readonly producers?: readonly {
    readonly producerId: string;
    readonly kind: string;
    readonly entrypoint: string;
    readonly objectsClaimed: number;
    readonly viewsMaintained: readonly string[];
  }[];
}

/**
 * 信封内容摘要。授权范围 = ir_schema + generation + vocab_lock + denominators +
 * objects + producers[].静态字段；明确排除 health、一切 last_*、producers[].liveness
 * 与 runtime/* 侧车（heartbeat.jsonl）——判定结果确定性可重放但不是身份（01 注记）。
 * generation.seq 参与（thread A 推荐）：同 inputs 重放经 inputs_fingerprint 短路，
 * seq 不动 → 字节稳定。
 */
export function contentDigestOf(scope: DigestScopeInput): string {
  return sha256OfCanonical({
    ir_schema: scope.irSchema ?? IR_SCHEMA_DIALECT,
    generation: scope.generation,
    vocab_lock: scope.vocabLock,
    denominators: scope.denominators ?? [],
    objects: scope.objects ?? [],
    producers_static: (scope.producers ?? []).map((producer) => ({
      producer_id: producer.producerId,
      kind: producer.kind,
      entrypoint: producer.entrypoint,
      objects_claimed: producer.objectsClaimed,
      views_maintained: producer.viewsMaintained,
    })),
  });
}

/** 事务输入集指纹（重跑短路依据；只依赖 ops/authorityRef/note，无墙钟）。 */
export function inputsFingerprintOf(tx: {
  readonly ops: readonly unknown[];
  readonly authorityRef?: string;
  readonly note?: string;
}): string {
  return sha256OfCanonical({
    ops: tx.ops,
    authorityRef: tx.authorityRef ?? null,
    note: tx.note ?? null,
  });
}
