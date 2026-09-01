/**
 * evidence-artifacts.ts —— Evidence Artifact 内容寻址通路 + 存在性绑定校验
 * （P0.5-2 Screenshot Evidence Binding；PRD §7/§14 + 裁决8③④，2026-09-01）。
 *
 * 通路（PRD §7.2 四环节）：Raw Artifact → Infrastructure-issued Receipt →
 * Normalized Gate Result → Evidence Pack。本模块承载前半边的基础设施语义：
 * - **persistEvidenceArtifact**：内容寻址写 blobs/sha256/<aa>/<rest>（07
 *   definitions.blob_ref.storage_path 词形，纯派生——sha256 即身份）；幂等（同字节
 *   重写零变化）；写后读回重算自证（消费方必须重算而非信任——blob_ref 描述原文，D24）。
 * - **verifyEvidenceBinding**：四态存在性绑定校验——bound / 文件缺失 / 字节篡改 /
 *   refs 缺失而 verdict=passed → EVIDENCE_BINDING_INCOMPLETE（裁决8③ D5：门内
 *   rule + 稳定码并用——本模块产出稳定码 outcome，门内 rule 词形由 gate 侧判卷
 *   消费本 outcome 落 items[].rule）。
 *
 * 裁决落点（裁决8，2026-09-01）：
 * - D1=A：receipt 不新增 id 词形——blob sha256 即身份（四克制最优；EVR-* 仅 PRD 概念词）；
 * - D3=A：artifact_refs 条目收窄 blob 分支（tracer 只绑 screenshot，PRD §14）；
 * - D4=A：存在性绑定走 gate_def 版本化变更进门禁判卷本体
 *   （POLICY.GATE.BROWSER@0.1.0→@0.2.0，绑定缺失/失配=判卷红）。**判卷本体在
 *   gate 侧**（gauntlet-lite browser-evidence.ts 消费本模块 outcome 裁决），kernel
 *   保持 gate 无关：本模块只供给「内容寻址 + 同一性校验」的原语。
 *
 * D24 边界：本模块是 kernel 基础设施层（content_identity 唯一产生位）；gauntlet-lite
 * 侧文件（browser-adapter/browser-legs/browser-evidence）仍不计算任何 sha——它们只递
 * 内存字节，哈希在本模块产生。sha256OfBytes（raw 字节摘要）与 sha256OfCanonical
 * （canonical-JSON 摘要）是两种不同哈希对象（R3），禁止互替。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { GovernanceError } from "./errors.js";
import { sha256OfBytes } from "./digest.js";
import { isNotFoundError } from "./io.js";

type UnknownRecord = Record<string, unknown>;

// ============================================================
// 词形与稳定码（07-evidence-records definitions 同源；裁决8③ D5）
// ============================================================

/** sha256:<64 位小写十六进制>（01/07 definitions.sha256_digest 词形）。 */
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
/** 内容寻址相对路径（07 definitions.blob_ref.storage_path pattern，相对 evidence/ 平面根）。 */
const STORAGE_PATH_PATTERN = /^blobs\/sha256\/([0-9a-f]{2})\/([0-9a-f]{62})$/;
/** media 逻辑类型 1..64 字符（07 blob_ref.media；开放词：screenshot 已是文档示例值）。 */
const MEDIA_MAX_CHARS = 64;

/** 绑定校验稳定码（裁决8③ D5；与门内 items[].rule 同词形）。 */
export const EVIDENCE_BINDING_INCOMPLETE = "EVIDENCE_BINDING_INCOMPLETE" as const;

/** 绑定不完整三态（verifyEvidenceBinding 失败时的 reason 细分）。 */
export const EVIDENCE_BINDING_INCOMPLETE_REASONS = [
  "artifact_file_missing",
  "artifact_bytes_tampered",
  "binding_refs_missing_while_passed",
] as const;
export type EvidenceBindingIncompleteReason =
  (typeof EVIDENCE_BINDING_INCOMPLETE_REASONS)[number];

/** artifact 引用的 blob 侧输入形态（camel；落盘经 artifactRefsToSnake 映射为 07 blob 分支）。 */
export interface EvidenceArtifactRefInput {
  /** 内容身份（sha256:<64hex>；基础设施产生——persistEvidenceArtifact 输出）。 */
  readonly sha256: string;
  /** 逻辑类型（开放词；tracer 固定 "screenshot"，PRD §14 收窄）。 */
  readonly media: string;
  /** 原始字节长度（≥1；篡改检测的长度副锚）。 */
  readonly byteSize?: number;
  /** 内容寻址相对路径 blobs/sha256/<aa>/<rest>（纯派生，相对 evidence/ 平面根）。 */
  readonly storagePath: string;
}

/** persistEvidenceArtifact 的输入（原始字节 + 逻辑类型；kind 记录在调用方语境）。 */
export interface PersistEvidenceArtifactInput {
  readonly media: string;
  readonly bytes: Uint8Array;
}

/** persistEvidenceArtifact 的输出（= EvidenceArtifactRefInput 的 blob 侧全量，D24：基础设施产生）。 */
export interface PersistedEvidenceArtifact {
  readonly sha256: string;
  readonly media: string;
  readonly byteSize: number;
  readonly storagePath: string;
}

/** verifyEvidenceBinding 的 outcome（bound 单态 / EVIDENCE_BINDING_INCOMPLETE 三态）。 */
export type EvidenceBindingOutcome =
  | { readonly bound: true; readonly artifactCount: number }
  | {
      readonly bound: false;
      readonly code: typeof EVIDENCE_BINDING_INCOMPLETE;
      readonly reason: EvidenceBindingIncompleteReason;
      readonly detail: string;
    };

// ============================================================
// persistEvidenceArtifact（内容寻址写；幂等 + 读回重算自证）
// ============================================================

function blobAbsolutePath(evidenceDir: string, storagePath: string): string {
  return `${evidenceDir}/${storagePath}`;
}

/** 由 sha256 机械派生 storage_path（07 blob_ref：路径纯派生，禁手拼）。 */
export function storagePathOfSha256(sha256: string): string {
  const hex = sha256.slice("sha256:".length);
  return `blobs/sha256/${hex.slice(0, 2)}/${hex.slice(2)}`;
}

/**
 * 内容寻址持久化 artifact 字节：写 <evidenceDir>/blobs/sha256/<aa>/<rest>。
 * - 幂等：同字节重复 persist 命中同一路径且字节全等 → 零写入（no-op is elegant）；
 * - 碰撞防线：同路径已有**不同**字节（sha256 碰撞或路径损坏）→ REF_INTEGRITY_VIOLATION
 *   fail-closed（禁静默覆盖既有 artifact——内容寻址的基本不变量）；
 * - 读回自证：写入后读回重算 sha256 必须与身份一致（消费方必须重算纪律的写侧镜像），
 *   失配 = ENVIRONMENT_ERROR（磁盘假设破裂，禁静默）。
 */
export function persistEvidenceArtifact(
  evidenceDir: string,
  input: PersistEvidenceArtifactInput,
): PersistedEvidenceArtifact {
  if (typeof input.media !== "string" || input.media.length === 0 || input.media.length > MEDIA_MAX_CHARS) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `media 须为 1..${String(MEDIA_MAX_CHARS)} 字符逻辑类型：${String(input.media)}`,
      "07 blob_ref.media（开放词：diff | screenshot | network_log | json | text | binary…）",
      { media: input.media },
    );
  }
  if (input.bytes.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "artifact 字节为空（空字节不是证据）",
      "PRD §7.3 content_identity 须由真实 artifact 字节产生；空写入 = 无物之据，拒收",
      {},
    );
  }
  const sha256 = sha256OfBytes(input.bytes);
  const storagePath = storagePathOfSha256(sha256);
  const absolutePath = blobAbsolutePath(evidenceDir, storagePath);
  if (existsSync(absolutePath)) {
    const existing = readFileSync(absolutePath);
    if (!existing.equals(Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength))) {
      throw new GovernanceError(
        "REF_INTEGRITY_VIOLATION",
        `blob 路径已存在且字节不同（sha256 碰撞或内容寻址存储损坏）：${storagePath}`,
        "内容寻址不变量：同一路径 ⇔ 同一字节。请核查该 blob 的写入来源；禁止覆盖既有 artifact",
        { storagePath, sha256 },
      );
    }
    // 同字节幂等命中：零写入。
    return { sha256, media: input.media, byteSize: input.bytes.length, storagePath };
  }
  try {
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, input.bytes);
  } catch (error) {
    throw new GovernanceError(
      "ENVIRONMENT_ERROR",
      `blob 写入失败：${storagePath}`,
      "检查磁盘可写性后重试；persistEvidenceArtifact 是 evidence blob 平面的唯一写入口",
      { storagePath, cause: String(error) },
    );
  }
  // 读回自证（写后重算——「消费方必须重算」的写侧镜像；失配 = 磁盘假设破裂）。
  const readBack = readFileSync(absolutePath);
  const readBackSha = sha256OfBytes(readBack);
  if (readBackSha !== sha256) {
    throw new GovernanceError(
      "ENVIRONMENT_ERROR",
      `blob 读回自证失败（写后重算 ${readBackSha} ≠ 身份 ${sha256}）：${storagePath}`,
      "存储层不可信（字节损坏/并发覆写）；禁止携带未自证的 blob 引用入账",
      { storagePath },
    );
  }
  return { sha256, media: input.media, byteSize: input.bytes.length, storagePath };
}

// ============================================================
// artifact_refs 校验与落盘映射（store ↔ cli canonical 重放共用；「同一函数，不两套」）
// ============================================================

/**
 * artifact_refs 运行时校验（store.record_gate_run 与 CLI canonical 重放共用的词形防线；
 * 兜 JS 直调——类型侧已收窄）。D3=A：只收 blob 分支。规则：
 * - sha256 词形（07 definitions.sha256_digest）；
 * - media 1..64 字符；
 * - byteSize 缺省可；在场须 ≥1 整数；
 * - storagePath 词形（07 blob_ref.storage_path pattern）且**必须与 sha256 机械派生一致**
 *   （路径纯派生——不一致 = 身份与路径分叉，拒收）。
 */
export function assertArtifactRefs(
  refs: readonly EvidenceArtifactRefInput[] | undefined,
): readonly EvidenceArtifactRefInput[] | undefined {
  if (refs === undefined) return undefined;
  if (!Array.isArray(refs)) {
    throw new GovernanceError("SCHEMA_INVALID", "artifactRefs 须为数组", "07 run_record.artifact_refs（D3=A：blob 分支收窄）", {});
  }
  if (refs.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      "artifactRefs 空数组（须携带至少一条 blob 引用，或整个键缺席）",
      "空数组既非绑定也非缺席（两义性禁入）；有绑定就带 refs，无绑定就省键（存量字节兼容）",
      {},
    );
  }
  for (const ref of refs) {
    const raw = ref as unknown as UnknownRecord;
    if (typeof ref?.sha256 !== "string" || !SHA256_PATTERN.test(ref.sha256)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `artifact_refs[].sha256 词形非法（须 sha256:<64hex>）：${String(raw["sha256"])}`,
        "07 definitions.sha256_digest；内容身份由 persistEvidenceArtifact 产生（D24：人禁手算）",
        { sha256: raw["sha256"] },
      );
    }
    if (typeof ref.media !== "string" || ref.media.length === 0 || ref.media.length > MEDIA_MAX_CHARS) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `artifact_refs[].media 须为 1..${String(MEDIA_MAX_CHARS)} 字符：${String(ref.media)}`,
        "07 blob_ref.media（开放词）",
        { media: ref.media },
      );
    }
    if (ref.byteSize !== undefined && (!Number.isInteger(ref.byteSize) || ref.byteSize < 1)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `artifact_refs[].byteSize 须为 ≥1 整数：${String(ref.byteSize)}`,
        "07 blob_ref.byte_size（minimum 1）",
        { byteSize: ref.byteSize },
      );
    }
    if (typeof ref.storagePath !== "string" || !STORAGE_PATH_PATTERN.test(ref.storagePath)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `artifact_refs[].storagePath 词形非法（须 blobs/sha256/<aa>/<rest>）：${String(ref.storagePath)}`,
        "07 blob_ref.storage_path pattern（内容寻址相对路径，纯派生）",
        { storagePath: ref.storagePath },
      );
    }
    // 路径 ⇔ 身份派生一致性（路径纯派生的机械验证；分叉 = 拒收）。
    const derived = storagePathOfSha256(ref.sha256);
    if (ref.storagePath !== derived) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `artifact_refs[].storagePath 与 sha256 派生不一致（${ref.storagePath} ≠ 派生 ${derived}）`,
        "blob_ref：sha256 即身份，路径纯派生——两者分叉即引用自相矛盾，fail-closed",
        { storagePath: ref.storagePath, sha256: ref.sha256 },
      );
    }
  }
  return refs;
}

/**
 * EvidenceArtifactRefInput[] → 07 run_record.artifact_refs 落盘形态（blob 分支）。
 * **store.applyRecordGateRun 与 cli canonicalRunBytes 逐键同构的唯一映射源**
 * （R1 canonical 字节双写点纪律：落盘形态由 kernel 决定，CLI 不二次发明）。
 * 键序固定：ref_type → blob{sha256 → media → [byte_size] → storage_path}。
 */
export function artifactRefsToSnake(
  refs: readonly EvidenceArtifactRefInput[],
): UnknownRecord[] {
  return refs.map((ref) => ({
    ref_type: "blob",
    blob: {
      sha256: ref.sha256,
      media: ref.media,
      ...(ref.byteSize !== undefined ? { byte_size: ref.byteSize } : {}),
      storage_path: ref.storagePath,
    },
  }));
}

/**
 * artifact_refs 悬空存在性校验（record_gate_run 落盘前；REF_INTEGRITY 同族 posture——
 * applyRecordClaim 的 subject 存在性先例）：artifact_refs 是存在性主张，指向不存在
 * 的 blob = 悬空引用，fail-closed 拒收（先 persist 再 record）。
 */
export function assertArtifactBlobsExist(
  refs: readonly EvidenceArtifactRefInput[],
  evidenceDir: string,
): void {
  for (const ref of refs) {
    const absolutePath = blobAbsolutePath(evidenceDir, ref.storagePath);
    if (!existsSync(absolutePath)) {
      throw new GovernanceError(
        "REF_INTEGRITY_VIOLATION",
        `artifact_refs 指向的 blob 文件缺失（悬空引用）：${ref.storagePath}`,
        "存在性主张必须先落盘：先 persistEvidenceArtifact 再 record_gate_run（07 blob_ref：消费方必须重算校验而非信任）",
        { storagePath: ref.storagePath, sha256: ref.sha256 },
      );
    }
  }
}

// ============================================================
// verifyEvidenceBinding（四态存在性绑定校验；D24 读侧服务）
// ============================================================

interface ParsedBindingRecord {
  readonly verdict: string;
  readonly refs: unknown;
}

/** 从 canonical 07 run_record 文件提取 verdict 与 artifact_refs（畸形 → SCHEMA_INVALID）。 */
function parseBindingRecord(runRecordPath: string): ParsedBindingRecord {
  let text: string;
  try {
    text = readFileSync(runRecordPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new GovernanceError(
        "SCHEMA_INVALID",
        `run 记录文件缺失：${runRecordPath}`,
        "verifyEvidenceBinding 校验对象是已落盘的 evidence/runs/GRN-*.json；先入账再校验",
        { runRecordPath },
      );
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `run 记录无法解析为 JSON（损坏或手改）：${runRecordPath}`,
      "绑定校验的判卷对象不可信时显式爆（禁静默当通过）；从 git 恢复或重新入账",
      { runRecordPath, cause: String(error) },
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new GovernanceError("SCHEMA_INVALID", `run 记录不是 JSON 对象：${runRecordPath}`, "07 run_record 词形", { runRecordPath });
  }
  const record = parsed as UnknownRecord;
  const inline = record.gate_result;
  const inlineResult =
    typeof inline === "object" && inline !== null && !Array.isArray(inline)
      ? ((inline as UnknownRecord).result as UnknownRecord | undefined)
      : undefined;
  const verdictRaw =
    (inlineResult !== undefined && inlineResult !== null ? inlineResult["verdict"] : undefined) ??
    record.verdict;
  if (typeof verdictRaw !== "string" || verdictRaw.length === 0) {
    throw new GovernanceError(
      "SCHEMA_INVALID",
      `run 记录缺 verdict（gate_result.result.verdict）：${runRecordPath}`,
      "绑定条款的适用判定依赖 verdict（passed 才有绑定主张）；畸形记录禁校验放行",
      { runRecordPath },
    );
  }
  return { verdict: verdictRaw, refs: record.artifact_refs };
}

/**
 * 四态存在性绑定校验（PRD §7.4 Acceptance 的机器落点；D24 read_only_service——
 * 只读校验，永不改写任何文件）：
 * 1. **bound**：refs 在场且逐条文件在场、读回重算 sha256/byteSize 与引用一致；
 * 2. **artifact_file_missing**：refs 在场但 storage_path 文件缺失；
 * 3. **artifact_bytes_tampered**：文件在场但读回重算 sha256 ≠ 引用身份（或 byteSize 失配）
 *    ——「Adapter 验证 Screenshot A、Evidence Pack 存 Screenshot B」的检出形态；
 * 4. **binding_refs_missing_while_passed**：verdict=passed 而 artifact_refs 缺席
 *    （0.2.0 判卷语义：passed 即存在性主张；无 refs 的 passed = 主张悬空）。
 * verdict 非 passed 且无 refs → bound（无主张即无绑定义务；not_run/failed 不受条款约束）。
 */
export function verifyEvidenceBinding(input: {
  /** 已落盘的 run 记录文件路径（evidence/runs/GRN-*.json）。 */
  readonly runRecordPath: string;
  /** evidence/ 平面根（storage_path 相对锚）。 */
  readonly evidenceDir: string;
}): EvidenceBindingOutcome {
  const record = parseBindingRecord(input.runRecordPath);
  const rawRefs = record.refs;
  if (rawRefs === undefined || rawRefs === null) {
    if (record.verdict === "passed") {
      return {
        bound: false,
        code: EVIDENCE_BINDING_INCOMPLETE,
        reason: "binding_refs_missing_while_passed",
        detail: `verdict=passed 而 artifact_refs 缺席（POLICY.GATE.BROWSER@0.2.0 绑定条款：passed 即存在性主张，主张须携 refs）：${input.runRecordPath}`,
      };
    }
    return { bound: true, artifactCount: 0 };
  }
  if (!Array.isArray(rawRefs) || rawRefs.length === 0) {
    return {
      bound: false,
      code: EVIDENCE_BINDING_INCOMPLETE,
      reason: "binding_refs_missing_while_passed",
      detail: `artifact_refs 非法（须非空数组）：${JSON.stringify(rawRefs)?.slice(0, 120)}——${input.runRecordPath}`,
    };
  }
  for (const raw of rawRefs) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {
        bound: false,
        code: EVIDENCE_BINDING_INCOMPLETE,
        reason: "binding_refs_missing_while_passed",
        detail: `artifact_refs 条目形状非法（须 {ref_type:"blob", blob:{…}}）：${input.runRecordPath}`,
      };
    }
    const entry = raw as UnknownRecord;
    const blob = entry.blob;
    if (
      entry.ref_type !== "blob" ||
      typeof blob !== "object" ||
      blob === null ||
      Array.isArray(blob)
    ) {
      return {
        bound: false,
        code: EVIDENCE_BINDING_INCOMPLETE,
        reason: "binding_refs_missing_while_passed",
        detail: `artifact_refs 条目非 blob 分支（D3=A 收窄）：${JSON.stringify(entry).slice(0, 120)}——${input.runRecordPath}`,
      };
    }
    const blobRef = blob as UnknownRecord;
    const sha256 = blobRef.sha256;
    const storagePath = blobRef.storage_path;
    if (typeof sha256 !== "string" || typeof storagePath !== "string") {
      return {
        bound: false,
        code: EVIDENCE_BINDING_INCOMPLETE,
        reason: "binding_refs_missing_while_passed",
        detail: `blob 引用缺 sha256/storage_path：${input.runRecordPath}`,
      };
    }
    const absolutePath = blobAbsolutePath(input.evidenceDir, storagePath);
    let bytes: Buffer;
    try {
      bytes = readFileSync(absolutePath);
    } catch (error) {
      if (isNotFoundError(error)) {
        return {
          bound: false,
          code: EVIDENCE_BINDING_INCOMPLETE,
          reason: "artifact_file_missing",
          detail: `绑定 blob 文件缺失：${storagePath}（引用 ${sha256}）——${input.runRecordPath}`,
        };
      }
      throw error;
    }
    const recomputed = sha256OfBytes(bytes);
    if (recomputed !== sha256) {
      return {
        bound: false,
        code: EVIDENCE_BINDING_INCOMPLETE,
        reason: "artifact_bytes_tampered",
        detail: `绑定 blob 字节篡改（重算 ${recomputed} ≠ 引用 ${sha256}）：${storagePath}——${input.runRecordPath}`,
      };
    }
    const byteSize = blobRef.byte_size;
    if (byteSize !== undefined && byteSize !== bytes.length) {
      return {
        bound: false,
        code: EVIDENCE_BINDING_INCOMPLETE,
        reason: "artifact_bytes_tampered",
        detail: `绑定 blob 字节数失配（声明 ${String(byteSize)} ≠ 实际 ${String(bytes.length)}）：${storagePath}——${input.runRecordPath}`,
      };
    }
  }
  return { bound: true, artifactCount: rawRefs.length };
}
