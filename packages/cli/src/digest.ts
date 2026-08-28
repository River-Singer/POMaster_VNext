/**
 * digest.ts —— init 空账本的确定性摘要计算（唯一使用点）。
 *
 * x-digest-ethics（vocab-lock digest_ethics / D24，全局适用于本文件产出的全部字段）：
 * - write_blocking: false —— 摘要永不作为写入门闸；摘要失配的处置是 WARN + auto-regen hint，
 *   本模块的任何失败都不得阻断 init；
 * - side: read_only_service —— 摘要仅服务 identity / rerun-shortcut / tamper-audit；
 * - human_touch: forbidden —— 人永不计算/核对/传递 sha。本模块是【工具的机器事务行为】，
 *   与 store 事务同性质（自动维护）；init 之后这些字段的唯一维护者是 kernel store 事务
 *   （applyTransaction 自动重算），CLI 在 status/doctor 等读路径从不校验摘要值。
 *
 * 指纹口径（init 落盘、供 kernel loadTruthIndex 对账的唯一定义，镜像 @pomaster/schemas
 * vocab.ts 的数组字面量；改 vocab-lock 时同 commit 同步 schemas/src/vocab.ts 与本口径）。
 * 形状逐字节对齐 kernel digest.ts（vocabFingerprints / contentDigestOf）——integration
 * 修复（2026-08-28）：此前 transitions 被误提到顶层、content_digest 用了本地键名，
 * 与 kernel 对账端形状失配 → CLI init 的账本被 kernel createStore 拒开（VOCAB_MISMATCH）。
 * 键形契约（与 kernel canonical 输入逐字一致，勿改）：
 * - vocab_lock.state_axes := sha256(canonicalJson({lifecycle: {values, transitions}, confidence, evidence, change}))
 *   （transitions 嵌套于 lifecycle 内、与 values 平级——镜像 vocab-lock yaml 结构）
 * - vocab_lock.kinds      := sha256(canonicalJson({truth_bodies: TRUTH_BODY_KINDS}))
 * - vocab_lock.prefixes   := sha256(canonicalJson({prefixes_v0: GOVERNED_ID_PREFIXES}))
 * - content_digest        := sha256(canonicalJson({ir_schema, generation: {tool, seq,
 *   inputsFingerprint}, vocab_lock: {stateAxes, kinds, prefixes}, denominators, objects,
 *   producers_static}))（授权范围镜像 01 x-pomaster-contract.digest_authorized_scope：
 *   不含 health、不含一切 last_*；canonical 键形 = kernel contentDigestOf 的 camelCase
 *   契约形态，与磁盘 snake_case 是两套键名，kernel scopeOf 负责映射）
 * - generation.inputs_fingerprint := sha256(canonicalJson({ inputs: [] }))（bootstrap 空输入集）
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
} from "@pomaster/schemas";

/** init 落盘账本的生成工具锚（tool@semver，镜像 01 generation.tool pattern）。 */
export const INIT_TOOL_ID = "pomaster-cli@0.0.0";

/** 完整性规则集版本锚（镜像 01 integrity_ruleset pattern ^REF_INTEGRITY@v[0-9]+$）。 */
export const INIT_INTEGRITY_RULESET = "REF_INTEGRITY@v1";

/**
 * 确定性 canonical JSON：对象键递归排序、剔除 undefined、数组保序——
 * 同一结构无论构造顺序如何，字节稳定（A4 幂等纪律的序列化基础）。
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}

/**
 * sha256 摘要（sha256: 前缀 + 64 位小写十六进制，镜像 01 definitions.sha256_digest pattern）。
 * x-digest-ethics: 见文件头——机器自动维护，仅读侧服务，永不阻断写入。
 */
export function sha256Digest(canonical: string): string {
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/** 词表三元组指纹（口径见文件头；与 vocab-lock@v0.2-resolved 内容一一对应）。 */
export function vocabLockFingerprints(): {
  readonly state_axes: string;
  readonly kinds: string;
  readonly prefixes: string;
} {
  return {
    // 形状镜像 vocab-lock state_axes（transitions 嵌套于 lifecycle 内、与 values 平级），
    // 与 kernel digest.ts vocabFingerprints() 逐字一致（对账两端唯一允许的分叉是零）。
    state_axes: sha256Digest(
      canonicalJson({
        lifecycle: {
          values: LIFECYCLE_VALUES,
          transitions: LIFECYCLE_TRANSITIONS,
        },
        confidence: CONFIDENCE_VALUES,
        evidence: EVIDENCE_VALUES,
        change: CHANGE_VALUES,
      }),
    ),
    // kinds/prefixes 同样镜像 kernel 包裹形态：数组入对象再哈希（键名镜像 vocab-lock
    // 的 kinds_registry.truth_bodies / id_namespace.prefixes_v0）。
    kinds: sha256Digest(canonicalJson({ truth_bodies: TRUTH_BODY_KINDS })),
    prefixes: sha256Digest(canonicalJson({ prefixes_v0: GOVERNED_ID_PREFIXES })),
  };
}

/**
 * init 空账本（.pomaster/state/truth-index.json 的 bootstrap 内容）。
 * 字段与 01-truth-index 一致（磁盘形态为 schema 的 snake_case）；
 * content_digest 授权范围不含 health（01 x-pomaster-contract.digest_authorized_scope）。
 * D24：digest 字段由本机器事务自动维护；后续由 kernel applyTransaction 接管重算，
 * 人类不得手改（violation_treatment: WARN + auto-regen hint）。
 */
export function buildSkeletonLedger(): Record<string, unknown> {
  const generation = {
    tool: INIT_TOOL_ID,
    seq: 0,
    inputs_fingerprint: sha256Digest(canonicalJson({ inputs: [] })),
  };
  const vocab_lock = vocabLockFingerprints();
  // canonical 键形与 kernel contentDigestOf 的输入形态逐字一致（camelCase 契约形态；
  // 磁盘落盘才转 snake_case）——保证 kernel 首个事务的 digest 抽验零误报（D24 WARN
  // 通道只留给真实篡改/漂移，不留给口径分叉）。
  const digestScope = {
    ir_schema: IR_SCHEMA_DIALECT,
    generation: {
      tool: generation.tool,
      seq: generation.seq,
      inputsFingerprint: generation.inputs_fingerprint,
    },
    vocab_lock: {
      stateAxes: vocab_lock.state_axes,
      kinds: vocab_lock.kinds,
      prefixes: vocab_lock.prefixes,
    },
    denominators: [] as unknown[],
    objects: [] as unknown[],
    producers_static: [] as unknown[],
  };
  const content_digest = sha256Digest(canonicalJson(digestScope));
  return {
    ir_schema: IR_SCHEMA_DIALECT,
    content_digest,
    generation,
    vocab_lock,
    denominators: [],
    objects: [],
    producers: [],
    health: {
      dead_producers: [],
      orphaned_objects: [],
      worst_blindspot: null,
      alias_conflicts: [],
    },
    integrity_ruleset: INIT_INTEGRITY_RULESET,
  };
}
