/**
 * legal-advance.ts —— 合法推进契约的判卷核（VNext 优化 V1-3；台账 VX-PARITY-03/04）。
 *
 * 契约正文：ROOT `.trellis/spec/pomaster/legal-advance-contract.md`（Python 版，已在
 * pomaster `scripts/legal_advance.py` 落地并经 Owner 本机验证）与
 * `.trellis/spec/pomaster/vnext-legal-advance.md`（VNext 落点）。本文件是同一语义的
 * TS 移植：
 *
 * - 三分类判卷：TAMPER / LEGAL_CHANGE / UNDECIDABLE（不可判 fail-closed）；
 * - ADVANCE 段：合法推进写明证据、actor / reason、内容复判结论；
 * - 按路径剥离的语义指纹（profile + 版本），provenance 不冒充内容；
 * - 退役台账：「这条记录不在了」是显式、可归属的决定，不是永久漂移。
 *
 * 纪律（与 evidence-qualification.ts 同）：纯函数，零 fs / store / 墙钟；同输入 → 同输出。
 * 跨语言一致：`packages/kernel/tests/fixtures/legal-advance-parity.json` 由 Python 实现
 * 导出（`scripts/export-legal-advance-parity.py`），legal-advance.spec 逐例对拍——
 * 错误文案也逐字一致（含 Python repr 形态）。parity 只覆盖无浮点、无 BMP 外字符的数据
 * （两种语言在这两处的规范化 JSON 会分叉）；VNext 内部比较不受此限。
 *
 * 词形闭包：kernel 局部词 TODO(vocab-pr)（随词汇表 PR-0012 收编，SP 提案待追认）——
 * CHANGE_CLASSES / ADVANCE_BASES / BOUNDARY_KINDS / ANCHOR_KINDS / RETIREMENT_KINDS。
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "./digest.js";

// ============================================================
// 词形闭包（kernel 局部词 TODO(vocab-pr)）
// ============================================================

export const ADVANCE_SCHEMA = "pomaster-advance/v1" as const;
export const CHANGE_CLASSES = ["TAMPER", "LEGAL_CHANGE", "UNDECIDABLE"] as const;
export type ChangeClass = (typeof CHANGE_CLASSES)[number];
export const ADVANCE_BASES = ["explicit-evidence", "deterministic-recompute"] as const;
export type AdvanceBasis = (typeof ADVANCE_BASES)[number];
export const BOUNDARY_KINDS = ["exact", "provenance-rewrite", "recompute-equal", "renderer-upgrade"] as const;
export type BoundaryKind = (typeof BOUNDARY_KINDS)[number];

/** Python 三条 lane + VNext。 */
export const ADVANCE_LANES = ["frontend", "backend", "bp", "vnext"] as const;
export type AdvanceLane = (typeof ADVANCE_LANES)[number];
const PYTHON_LANES: readonly AdvanceLane[] = ["frontend", "backend", "bp"];

/** Python 锚的三层（`kind: pomaster-layers`）。 */
export const FINGERPRINT_LAYERS = ["authority", "facts", "artifact"] as const;
export type FingerprintLayer = (typeof FINGERPRINT_LAYERS)[number];
export const DEFAULT_FINGERPRINT_VERSIONS: Readonly<Record<FingerprintLayer, number>> = {
  authority: 1,
  facts: 1,
  artifact: 1,
};

/** VNext 锚点种类（vnext-legal-advance §3.2）。 */
export const ANCHOR_KINDS = [
  "baseline_target",
  "task_baseline_scope",
  "claim_verification",
  "accept_revision",
  "source_snapshot",
  "permit_scope",
  "keybinding",
  "pomaster-layers",
] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

export const RETIREMENT_KINDS = [
  // Python 五种（frontend / backend / bp）
  "missing_retired",
  "provider_not_applicable",
  "delta_absorbed",
  "opt_in_retired",
  "receipt_superseded",
  // VNext 五种
  "baseline_target_not_applicable",
  "baseline_key_not_applicable",
  "baseline_key_deferred",
  "claim_superseded",
  "keybinding_retired",
] as const;
export type RetirementKind = (typeof RETIREMENT_KINDS)[number];

/** Python 的「kind must be one of」文案只列它自己的五种（parity）。 */
const PYTHON_RETIREMENT_KINDS: readonly RetirementKind[] = RETIREMENT_KINDS.slice(0, 5);

export const LANE_RETIREMENT_KINDS: Readonly<Record<AdvanceLane, readonly RetirementKind[]>> = {
  frontend: ["missing_retired", "opt_in_retired"],
  backend: ["receipt_superseded", "provider_not_applicable"],
  bp: ["delta_absorbed"],
  vnext: [
    "baseline_target_not_applicable",
    "baseline_key_not_applicable",
    "baseline_key_deferred",
    "claim_superseded",
    "keybinding_retired",
  ],
};

export const RETIREMENT_ANCHOR_KEYS: Readonly<Record<RetirementKind, readonly string[]>> = {
  missing_retired: ["category", "file_path", "symbol", "last_verified_file_sha256"],
  receipt_superseded: ["path", "sha256"],
  provider_not_applicable: ["path", "provider_sha256"],
  delta_absorbed: ["delta_id", "delta_sha256", "base_blueprint_sha256"],
  opt_in_retired: ["layer", "path"],
  baseline_target_not_applicable: ["target", "authority_digest"],
  baseline_key_not_applicable: ["target", "key"],
  baseline_key_deferred: ["target", "key"],
  claim_superseded: ["clm", "verdict", "at_seq"],
  keybinding_retired: ["id", "physical_path"],
};

export const REJUDGE_VERDICTS = ["PASS", "DENY", "UNDECIDABLE"] as const;
export type RejudgeVerdict = (typeof REJUDGE_VERDICTS)[number];
export const FIXED_MINIMAL_RULES = "fixed-minimal-v0" as const;

/** Python 稳定 ID（frontend / backend / bp lane）。 */
const STABLE_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
/** VNext affected id：Python 稳定 ID（CLM-0001 / GRN-0001 / AGX-…）或 governed id（TASK.T0001）。 */
const VNEXT_ID_RE = /^(?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+|[A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)+)$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const EVIDENCE_REF_RE = /^(?:[^#\s][^#]*#sha256=[0-9a-f]{64}|(?:test|runtime|command|browser):\S.*)$/;
/** 同 Python PLACEHOLDER_RE（re.IGNORECASE；JS \b 只认 ASCII 词字符，与 Python 在 ASCII 上一致）。 */
const PLACEHOLDER_RE = /^\s*$|\b(?:TODO|TBD|FIXME|XXX)\b|待填写|待补充|<[^<>]*>/i;
const DEFAULT_ACTOR_PREFIXES = ["trellis-task:"] as const;
const DEFAULT_ACTOR_VALUES: ReadonlySet<string> = new Set([
  "pomaster",
  "what-frontend-coding-should-do",
  "what-backend-coding-should-do",
  "what-bp-should-do",
  "codex",
  "agent",
  "unknown",
]);

// ============================================================
// 语义指纹 profile（profile → version → 剥离路径）
// ============================================================

/**
 * 路径语法：`.` 分隔键，`*` 匹配一个键，`**` 任意深度（含零层），`[]` 列表元素。
 * 前五个 profile 与 Python 逐字一致（parity）；`truth-object-body` 是 VNext 的 ACCEPT
 * 修订指纹（V2-9 消费）：剥离修订号、状态轴、活跃许可、证据挂载、来源采集人与任务的
 * baseline 依赖声明——这些是治理状态，不是对象内容。
 */
export const PROFILES: Readonly<Record<string, Readonly<Record<number, readonly string[]>>>> = {
  "frontend-artifact": {
    1: ["**.task_id", "**.review_range", "**.repository_revision", "**.verified_at"],
    2: [
      "**.task_id", "**.review_range", "**.repository_revision", "**.verified_at",
      "**.blueprint_sha256", "**.source_digest", "proposal_binding.sha256",
      "candidate_openapi.sha256",
      "responsibility_binding.path", "responsibility_binding.artifact_sha256",
    ],
  },
  "frontend-facts": {
    1: [],
    2: ["**.repository_revision", "**.verified_at", "**.task_id", "**.review_range", "**.maintained_at", "**.reconciled_at"],
    3: [
      "**.repository_revision", "**.verified_at", "**.task_id", "**.review_range", "**.maintained_at", "**.reconciled_at",
      "**.blueprint_sha256",
    ],
  },
  "bp-blueprint": {
    1: [],
    2: [
      "blueprint.sha256", "blueprint.artifact_state", "blueprint.approval_state", "blueprint.effective_state",
      "blueprint.issued_at", "provenance.working_sources",
    ],
  },
  "frontend-p2-confirmation": {
    1: [],
    2: ["source_bindings.implementation_plan", "source_bindings.*.sha256", "readiness_dimensions", "progress", "generated_at"],
    3: [
      "blueprint_sha256", "source_bindings.implementation_plan", "source_bindings.blueprint", "source_bindings.process",
      "source_bindings.uiux", "source_bindings.engineering_decisions", "source_bindings.*.sha256",
      "readiness_dimensions", "progress", "generated_at",
    ],
  },
  "backend-authority": {
    1: [],
    2: ["provider_tree_sha256", "**.generated_at"],
  },
  "truth-object-body": {
    1: [],
    2: ["rev", "axes", "permits_active", "evidence_refs", "sources[].captured_by", "payload.baseline_dependencies"],
  },
};

// ============================================================
// 摘要（无前缀 hex，与 Python digest_value 一致）
// ============================================================

/** sha256 hex of the canonical JSON（与 Python `digest_value` 字节一致——parity 适用范围见头注）。 */
export function digestValue(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** 去掉 `sha256:` 前缀后的 64 位 hex（VNext 摘要两种写法统一比较）。 */
export function hexOf(digest: string): string {
  return digest.startsWith("sha256:") ? digest.slice("sha256:".length) : digest;
}

// ============================================================
// Python repr（错误文案逐字 parity 用）
// ============================================================

/** Python `repr(str)` 的最小等价（ASCII 控制字符与引号规则一致；可打印 Unicode 原样）。 */
export function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => pyRepr(item)).join(", ")}]`;
  if (typeof value !== "string") return String(value);
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of value) {
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += `\\${quote}`;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else {
      const code = ch.codePointAt(0) ?? 0;
      out += code < 0x20 || code === 0x7f ? `\\x${code.toString(16).padStart(2, "0")}` : ch;
    }
  }
  return out + quote;
}

export class LegalAdvanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegalAdvanceError";
  }
}

// ============================================================
// 路径剥离
// ============================================================

function tokenize(pattern: string): readonly string[] {
  if (typeof pattern !== "string" || pattern.length === 0 || pattern.endsWith("[]")) {
    throw new LegalAdvanceError(`invalid strip pattern (must name a dict key): ${pyRepr(pattern)}`);
  }
  const tokens: string[] = [];
  for (const segment of pattern.split(".")) {
    if (segment.length === 0) {
      throw new LegalAdvanceError(`invalid strip pattern (empty segment): ${pyRepr(pattern)}`);
    }
    let key = segment;
    let lists = 0;
    while (key.endsWith("[]")) {
      key = key.slice(0, -2);
      lists += 1;
    }
    if (key.length === 0) {
      throw new LegalAdvanceError(`invalid strip pattern (empty key before []): ${pyRepr(pattern)}`);
    }
    tokens.push(key);
    for (let i = 0; i < lists; i += 1) tokens.push("[]");
  }
  return tokens;
}

function matches(pattern: readonly string[], path: readonly string[]): boolean {
  const memo = new Map<string, boolean>();
  const step = (i: number, j: number): boolean => {
    const key = `${i},${j}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let result: boolean;
    if (i === pattern.length) result = j === path.length;
    else if (pattern[i] === "**") result = step(i + 1, j) || (j < path.length && step(i, j + 1));
    else if (j === path.length) result = false;
    else if (pattern[i] === "*") result = path[j] !== "[]" && step(i + 1, j + 1);
    else result = pattern[i] === path[j] && step(i + 1, j + 1);
    memo.set(key, result);
    return result;
  };
  return step(0, 0);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 去掉路径命中任一 pattern 的对象键，返回深拷贝。按路径而非键名匹配：
 * `blueprint.approval_state` 剥离文档生命周期字段，保留 `claims[].approval_state`。
 */
export function stripPaths(value: unknown, patterns: Iterable<string>): unknown {
  const compiled = [...patterns].map((pattern) => tokenize(pattern));
  const walk = (node: unknown, path: readonly string[]): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item, [...path, "[]"]));
    if (isPlainObject(node)) {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(node)) {
        const child = [...path, key];
        if (compiled.some((pattern) => matches(pattern, child))) continue;
        result[key] = walk(item, child);
      }
      return result;
    }
    return node;
  };
  return walk(value, []);
}

export function profilePatterns(profile: string, version: number): readonly string[] {
  const versions = PROFILES[profile];
  if (versions === undefined) {
    throw new LegalAdvanceError(`unknown semantic fingerprint profile: ${pyRepr(profile)}`);
  }
  const patterns = versions[version];
  if (patterns === undefined) {
    throw new LegalAdvanceError(`profile ${pyRepr(profile)} has no version ${pyRepr(version)}`);
  }
  return patterns;
}

/** 剥离 profile 在该版本下的 provenance 路径后的摘要（hex）。 */
export function semanticFingerprint(profile: string, value: unknown, options: { readonly version: number }): string {
  return digestValue(stripPaths(value, profilePatterns(profile, options.version)));
}

/** 链上的指纹版本永不回落（契约 §3.4-④；Python 三层锚）。 */
export function checkFingerprintVersions(
  previous: Readonly<Record<string, unknown>> | null | undefined,
  current: Readonly<Record<string, unknown>>,
): string[] {
  const errors: string[] = [];
  const prev: Record<string, unknown> = { ...DEFAULT_FINGERPRINT_VERSIONS, ...(previous ?? {}) };
  for (const layer of FINGERPRINT_LAYERS) {
    const next = Object.hasOwn(current, layer) ? current[layer] : DEFAULT_FINGERPRINT_VERSIONS[layer];
    const old = Object.hasOwn(prev, layer) ? prev[layer] : 1;
    if (!isPositiveInt(next)) {
      errors.push(`fingerprint_versions.${layer} must be a positive integer`);
    } else if (typeof old === "number" && Number.isInteger(old) && next < old) {
      errors.push(`fingerprint_versions.${layer} downgraded from ${old} to ${next}`);
    }
  }
  return errors;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

// ============================================================
// 三分类
// ============================================================

export interface ChangeVerdict {
  readonly class: ChangeClass;
  readonly kind: BoundaryKind | null;
  readonly reason_code: string | null;
  readonly basis: AdvanceBasis | null;
  readonly admission: string | null;
}

function verdictOf(
  changeClass: ChangeClass,
  fields: { kind?: BoundaryKind; reason_code?: string; basis?: AdvanceBasis; admission?: string } = {},
): ChangeVerdict {
  return {
    class: changeClass,
    kind: fields.kind ?? null,
    reason_code: fields.reason_code ?? null,
    basis: fields.basis ?? null,
    admission: fields.admission ?? null,
  };
}

/**
 * 边界判卷（计划前：磁盘 vs 上一事件 after）：相等 → LEGAL（exact / provenance-rewrite）；
 * 不等且无人重算 → UNDECIDABLE/BOUNDARY_UNEXPLAINED；等于已校验源的确定性重算 →
 * LEGAL（recompute-equal）；两者都不等 → TAMPER/TAMPER_SUSPECTED。
 */
export function judgeBoundary(input: {
  readonly previousFacts: string | null;
  readonly diskFacts: string | null;
  readonly recomputedFacts?: string | null;
  readonly rawEqual?: boolean;
}): ChangeVerdict {
  const rawEqual = input.rawEqual ?? true;
  if (input.diskFacts === input.previousFacts) {
    return verdictOf("LEGAL_CHANGE", { kind: rawEqual ? "exact" : "provenance-rewrite" });
  }
  if (input.recomputedFacts === undefined || input.recomputedFacts === null) {
    return verdictOf("UNDECIDABLE", { reason_code: "BOUNDARY_UNEXPLAINED" });
  }
  if (input.recomputedFacts === input.diskFacts) {
    return verdictOf("LEGAL_CHANGE", { kind: "recompute-equal", basis: "deterministic-recompute" });
  }
  return verdictOf("TAMPER", { reason_code: "TAMPER_SUSPECTED" });
}

export function isDefaultActor(actor: unknown): boolean {
  if (typeof actor !== "string" || actor.trim().length === 0) return true;
  const value = actor.trim();
  return DEFAULT_ACTOR_VALUES.has(caseFold(value)) || DEFAULT_ACTOR_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function caseFold(value: string): string {
  return value.toLowerCase();
}

/** 事件内判卷（计划结果 vs 可信锚）。 */
export function judgeChange(input: {
  readonly anchorFacts: string | null;
  readonly plannedFacts: string | null;
  readonly evidenceSupplied: boolean;
  readonly actorExplicit: boolean;
  readonly reasonExplicit: boolean;
  readonly takeover?: boolean;
}): ChangeVerdict {
  if (input.anchorFacts !== null && input.plannedFacts === input.anchorFacts) {
    return verdictOf("LEGAL_CHANGE", { admission: "provenance-advance" });
  }
  if (input.takeover === true) return verdictOf("UNDECIDABLE", { reason_code: "TAKEOVER_CANNOT_ADVANCE" });
  if (input.evidenceSupplied && input.actorExplicit && input.reasonExplicit) {
    return verdictOf("LEGAL_CHANGE", { basis: "explicit-evidence", admission: "evidence-advance" });
  }
  return verdictOf("UNDECIDABLE", { reason_code: "ADVANCE_EVIDENCE_REQUIRED" });
}

// ============================================================
// ADVANCE 段
// ============================================================

export interface RejudgeGateInput {
  readonly gate: string;
  readonly triggers?: readonly string[];
  readonly result?: string;
  readonly blocking?: number;
  readonly inherited?: number;
  readonly findings_sha256?: string;
  readonly findings?: unknown;
}

/** 组装 `ADVANCE.rejudge`；结论取最差（PASS < UNDECIDABLE < DENY）。 */
export function buildRejudge(
  gatesRun: readonly RejudgeGateInput[],
  options: { readonly rulesVersion?: string; readonly changedPaths?: Iterable<string> } = {},
): Record<string, unknown> {
  const severity: Record<string, number> = { PASS: 0, UNDECIDABLE: 1, DENY: 2 };
  let verdict = "PASS";
  const rows = gatesRun.map((gate) => {
    const result = String(gate.result ?? "PASS");
    const row = {
      gate: String(gate.gate),
      triggers: [...(gate.triggers ?? [])].map((item) => String(item)).sort(),
      result,
      blocking: Math.trunc(Number(gate.blocking ?? 0)),
      inherited: Math.trunc(Number(gate.inherited ?? 0)),
      // Python `gate.get("findings_sha256") or digest_value(...)`：空串 / null 同样回落重算。
      findings_sha256: typeof gate.findings_sha256 === "string" && gate.findings_sha256.length > 0
        ? gate.findings_sha256
        : digestValue(gate.findings ?? []),
    };
    if (!(REJUDGE_VERDICTS as readonly string[]).includes(result)) {
      throw new LegalAdvanceError(`gate ${row.gate} has unknown result ${pyRepr(result)}`);
    }
    if ((severity[result] ?? 0) > (severity[verdict] ?? 0)) verdict = result;
    return row;
  });
  rows.sort((a, b) => (a.gate < b.gate ? -1 : a.gate > b.gate ? 1 : 0));
  const changed = [...new Set(options.changedPaths ?? [])].sort();
  return {
    gates_run: rows,
    verdict,
    selection: { rules_version: options.rulesVersion ?? FIXED_MINIMAL_RULES, changed_paths_sha256: digestValue(changed) },
  };
}

export function buildAdvance(input: {
  readonly basis: string;
  readonly actor: string;
  readonly reason: string;
  readonly evidenceRefs: Iterable<string>;
  readonly evidenceSha256: string;
  readonly oldAnchor: Readonly<Record<string, unknown>>;
  readonly newAnchor: Readonly<Record<string, unknown>>;
  readonly affectedIds: Iterable<string>;
  readonly rejudge: Readonly<Record<string, unknown>>;
  readonly transition?: Readonly<Record<string, unknown>> | null;
}): Record<string, unknown> {
  const section: Record<string, unknown> = {
    schema: ADVANCE_SCHEMA,
    basis: input.basis,
    actor: input.actor,
    reason: input.reason,
    evidence_refs: [...new Set([...input.evidenceRefs].map(String))].sort(),
    evidence_sha256: input.evidenceSha256,
    old_anchor: { ...input.oldAnchor },
    new_anchor: { ...input.newAnchor },
    affected_ids: [...new Set([...input.affectedIds].map(String))].sort(),
    rejudge: { ...input.rejudge },
  };
  if (input.transition !== undefined && input.transition !== null) section["transition"] = { ...input.transition };
  return section;
}

/** Python 三层锚（`pomaster-layers`）。 */
export function anchorOf(
  after: Readonly<Record<string, unknown>> | null | undefined,
  fingerprintVersions?: Readonly<Record<string, unknown>> | null,
): Record<string, unknown> {
  const source = after ?? {};
  return {
    authority_sha256: source["authority_sha256"] ?? null,
    facts_sha256: source["facts_sha256"] ?? null,
    artifact_sha256: source["artifact_sha256"] ?? null,
    fingerprint_versions: { ...DEFAULT_FINGERPRINT_VERSIONS, ...(fingerprintVersions ?? {}) },
  };
}

/** VNext 锚（vnext-legal-advance §3.2）。 */
export interface VnextAnchor {
  readonly kind: AnchorKind;
  readonly ref: string;
  readonly digest: string;
  readonly version: number;
}

function layerAnchorErrors(label: string, anchor: unknown): string[] {
  if (!isPlainObject(anchor)) return [`advance.${label} must be an object`];
  const errors: string[] = [];
  for (const key of ["authority_sha256", "facts_sha256", "artifact_sha256"]) {
    if (!Object.hasOwn(anchor, key)) errors.push(`advance.${label}.${key} is required`);
  }
  const versions = anchor["fingerprint_versions"];
  if (!isPlainObject(versions) || Object.keys(versions).some((key) => !(FINGERPRINT_LAYERS as readonly string[]).includes(key))) {
    errors.push(`advance.${label}.fingerprint_versions must map authority/facts/artifact to versions`);
  }
  return errors;
}

function vnextAnchorErrors(label: string, anchor: unknown): string[] {
  if (!isPlainObject(anchor)) return [`advance.${label} must be an object`];
  const errors: string[] = [];
  if (!(ANCHOR_KINDS as readonly unknown[]).includes(anchor["kind"])) {
    errors.push(`advance.${label}.kind must be one of ${pyRepr([...ANCHOR_KINDS])}`);
  }
  if (typeof anchor["ref"] !== "string" || anchor["ref"].trim().length === 0) {
    errors.push(`advance.${label}.ref must be a non-empty string`);
  }
  if (typeof anchor["digest"] !== "string" || !SHA256_RE.test(hexOf(anchor["digest"]))) {
    errors.push(`advance.${label}.digest must be a sha256 hex digest`);
  }
  if (!isPositiveInt(anchor["version"])) errors.push(`advance.${label}.version must be a positive integer`);
  return errors;
}

function sameVnextAnchor(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return a["kind"] === b["kind"] && a["ref"] === b["ref"] && a["version"] === b["version"] &&
    typeof a["digest"] === "string" && typeof b["digest"] === "string" && hexOf(a["digest"]) === hexOf(b["digest"]);
}

export interface ValidateAdvanceContext {
  readonly lane: AdvanceLane;
  /** 事件：actor / reason；`after` = Python 三层 after-state，或 VNext 的新锚。 */
  readonly event: Readonly<Record<string, unknown>>;
  /** 上一状态：Python 上一事件 after-state，或 VNext 的旧锚；null = 不比对。 */
  readonly previousAfter?: Readonly<Record<string, unknown>> | null;
  readonly previousFingerprintVersions?: Readonly<Record<string, unknown>> | null;
}

/** 返回 ADVANCE 段全部不可接受的理由（空数组 = 合格）。Python lane 的文案与顺序逐字一致。 */
export function validateAdvance(section: unknown, ctx: ValidateAdvanceContext): string[] {
  if (!(ADVANCE_LANES as readonly string[]).includes(ctx.lane)) {
    throw new LegalAdvanceError(`unknown lane: ${String(ctx.lane)}`);
  }
  if (!isPlainObject(section)) return ["advance must be an object"];
  const python = PYTHON_LANES.includes(ctx.lane);
  const errors: string[] = [];
  const event = ctx.event;
  if (section["schema"] !== ADVANCE_SCHEMA) errors.push(`advance.schema must be ${ADVANCE_SCHEMA}`);
  const basis = section["basis"];
  if (!(ADVANCE_BASES as readonly unknown[]).includes(basis)) {
    errors.push(`advance.basis must be one of ${pyRepr([...ADVANCE_BASES])}`);
  }
  const actor = section["actor"];
  if (typeof actor !== "string" || actor.trim().length === 0 || actor !== event["actor"]) {
    errors.push("advance.actor must equal the event actor");
  } else if (isDefaultActor(actor)) {
    errors.push("advance.actor must be an explicit operator, not a CLI default");
  }
  const reason = section["reason"];
  if (typeof reason !== "string" || reason.trim().length === 0 || reason !== event["reason"]) {
    errors.push("advance.reason must equal the event reason");
  } else if (PLACEHOLDER_RE.test(reason)) {
    errors.push("advance.reason must not be a placeholder");
  }
  let refs: unknown[] = [];
  const rawRefs = section["evidence_refs"];
  if (!Array.isArray(rawRefs) || rawRefs.some((item) => typeof item !== "string")) {
    errors.push("advance.evidence_refs must be a list of strings");
  } else {
    refs = rawRefs;
  }
  if (basis === "explicit-evidence" && refs.length === 0) {
    errors.push("advance.evidence_refs must be non-empty for explicit-evidence");
  }
  for (const item of refs) {
    if (!EVIDENCE_REF_RE.test(item as string)) errors.push(`advance.evidence_refs entry is malformed: ${pyRepr(item)}`);
  }
  const evidenceSha = section["evidence_sha256"];
  if (typeof evidenceSha !== "string" || !SHA256_RE.test(evidenceSha)) {
    errors.push("advance.evidence_sha256 must be a sha256 hex digest");
  }
  const anchorErrors = python ? layerAnchorErrors : vnextAnchorErrors;
  errors.push(...anchorErrors("old_anchor", section["old_anchor"]));
  errors.push(...anchorErrors("new_anchor", section["new_anchor"]));
  const oldAnchor = isPlainObject(section["old_anchor"]) ? section["old_anchor"] : {};
  const newAnchor = isPlainObject(section["new_anchor"]) ? section["new_anchor"] : {};
  const transition = section["transition"];
  const after = isPlainObject(event["after"]) ? event["after"] : {};
  if (python) {
    if (ctx.previousAfter !== undefined && ctx.previousAfter !== null) {
      const expected = anchorOf(ctx.previousAfter, ctx.previousFingerprintVersions);
      for (const key of ["authority_sha256", "facts_sha256", "artifact_sha256"]) {
        if (!jsonEqual(oldAnchor[key], expected[key])) {
          if (isPlainObject(transition) && transition["v1_matched"] === true) continue;
          errors.push(`advance.old_anchor.${key} must equal the previous event after-state`);
        }
      }
    }
    for (const key of ["authority_sha256", "facts_sha256", "artifact_sha256"]) {
      if (!jsonEqual(newAnchor[key], after[key])) errors.push(`advance.new_anchor.${key} must equal the event after-state`);
    }
    errors.push(
      ...checkFingerprintVersions(
        isPlainObject(oldAnchor["fingerprint_versions"]) ? oldAnchor["fingerprint_versions"] : null,
        isPlainObject(newAnchor["fingerprint_versions"]) ? newAnchor["fingerprint_versions"] : {},
      ),
    );
  } else {
    if (ctx.previousAfter !== undefined && ctx.previousAfter !== null && !sameVnextAnchor(oldAnchor, ctx.previousAfter)) {
      errors.push("advance.old_anchor must equal the previous anchor");
    }
    if (!sameVnextAnchor(newAnchor, after)) errors.push("advance.new_anchor must equal the event anchor");
    if (oldAnchor["kind"] !== newAnchor["kind"] || oldAnchor["ref"] !== newAnchor["ref"]) {
      errors.push("advance.old_anchor and new_anchor must name the same kind and ref");
    }
    // 版本过渡（§3.4）：不回落；升版必须显式 transition，且 from / to 对上新旧锚。
    const oldVersion = oldAnchor["version"];
    const newVersion = newAnchor["version"];
    if (isPositiveInt(oldVersion) && isPositiveInt(newVersion)) {
      if (newVersion < oldVersion) {
        errors.push(`advance.new_anchor.version downgraded from ${oldVersion} to ${newVersion}`);
      } else if (newVersion > oldVersion && (transition === undefined || transition === null)) {
        errors.push("advance.new_anchor.version moved without a transition");
      } else if (isPlainObject(transition) && (transition["from"] !== oldVersion || transition["to"] !== newVersion)) {
        errors.push("advance.transition.from/to must equal the old/new anchor versions");
      }
    }
  }
  const idRe = python ? STABLE_ID_RE : VNEXT_ID_RE;
  const affected = section["affected_ids"];
  if (!Array.isArray(affected) || affected.some((item) => typeof item !== "string")) {
    errors.push("advance.affected_ids must be a list of stable IDs");
  } else {
    const sortedUnique = [...new Set(affected as string[])].sort();
    if (JSON.stringify(affected) !== JSON.stringify(sortedUnique)) {
      errors.push("advance.affected_ids must be sorted and unique");
    }
    if (basis === "explicit-evidence" && affected.length === 0) {
      errors.push("advance.affected_ids must be non-empty for explicit-evidence");
    }
    for (const item of affected as string[]) {
      if (!idRe.test(item)) errors.push(`advance.affected_ids entry is not a stable ID: ${pyRepr(item)}`);
    }
  }
  const rejudge = section["rejudge"];
  if (!isPlainObject(rejudge)) {
    errors.push("advance.rejudge must be an object");
  } else {
    if (rejudge["verdict"] !== "PASS") errors.push("advance.rejudge.verdict must be PASS for a persisted ADVANCE");
    const rows = rejudge["gates_run"];
    if (!Array.isArray(rows) || rows.length === 0) {
      errors.push("advance.rejudge.gates_run must be a non-empty list");
    } else {
      for (const row of rows) {
        if (!isPlainObject(row) || typeof row["gate"] !== "string") {
          errors.push("advance.rejudge.gates_run rows must name a gate");
        } else if (row["result"] !== "PASS") {
          errors.push(`advance.rejudge gate ${row["gate"]} did not pass`);
        }
      }
    }
    const selection = rejudge["selection"];
    if (!isPlainObject(selection) || typeof selection["rules_version"] !== "string") {
      errors.push("advance.rejudge.selection.rules_version is required");
    }
  }
  if (transition !== undefined && transition !== null) {
    if (!isPlainObject(transition)) {
      errors.push("advance.transition must be an object");
    } else {
      if (python) {
        if (!(FINGERPRINT_LAYERS as readonly unknown[]).includes(transition["layer"])) {
          errors.push("advance.transition.layer must be authority/facts/artifact");
        }
      } else if (transition["layer"] !== newAnchor["kind"]) {
        errors.push("advance.transition.layer must equal the anchor kind");
      }
      const from = transition["from"];
      const to = transition["to"];
      if (!(Number.isInteger(from) && Number.isInteger(to) && (to as number) > (from as number))) {
        errors.push("advance.transition must move to a higher fingerprint version");
      }
      if (transition["v1_matched"] !== true) {
        errors.push("advance.transition.v1_matched must be true (a v1 mismatch is never laundered by v2)");
      }
    }
  }
  return errors;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return canonicalJson(a ?? null) === canonicalJson(b ?? null);
}

// ============================================================
// 退役台账
// ============================================================

const RECEIPT_REPLACEMENT_RE = /^[^#\s]+#sha256=[0-9a-f]{64}$/;
const CLM_RE = /^CLM-[0-9]+$/;

/**
 * 校验 lane 的退役台账条目。`candidates`（可选）= 可退役 id → 当前记录；给出时
 * `missing_retired` 条目必须指向其中之一（Python 语义）。VNext 条目 id 不要求 Python
 * 稳定 ID 词形（baseline 目标是路径、键是 `<target>:<key>`），只要求非空无空白。
 */
export function validateRetirements(
  entries: unknown,
  ctx: {
    readonly lane: AdvanceLane;
    readonly actor: string | null;
    readonly candidates?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | null;
  },
): string[] {
  if (!(ADVANCE_LANES as readonly string[]).includes(ctx.lane)) {
    throw new LegalAdvanceError(`unknown lane: ${String(ctx.lane)}`);
  }
  if (entries === null || entries === undefined) return [];
  if (!Array.isArray(entries)) return ["retirements must be a list"];
  const python = PYTHON_LANES.includes(ctx.lane);
  const allowed = LANE_RETIREMENT_KINDS[ctx.lane];
  // Python lane 的种类全集只有它自己的五种（VNext 种类在 Python lane 判「must be one of」，parity）。
  const universe: readonly RetirementKind[] = python ? PYTHON_RETIREMENT_KINDS : RETIREMENT_KINDS;
  const errors: string[] = [];
  const seen = new Set<string>();
  entries.forEach((entry: unknown, index: number) => {
    const where = `retirements[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${where} must be an object`);
      return;
    }
    let identity: string | null = null;
    const rawId = entry["id"];
    const idOk = typeof rawId === "string" && (python ? STABLE_ID_RE.test(rawId) : /^\S+$/.test(rawId));
    if (!idOk) {
      errors.push(`${where}.id must be a stable ID`);
    } else if (seen.has(rawId as string)) {
      errors.push(`${where}.id is duplicated: ${rawId as string}`);
      identity = rawId as string;
    } else {
      identity = rawId as string;
      seen.add(identity);
    }
    let kind: RetirementKind | null = null;
    const rawKind = entry["kind"];
    if (!(universe as readonly unknown[]).includes(rawKind)) {
      errors.push(`${where}.kind must be one of ${pyRepr([...universe])}`);
    } else {
      kind = rawKind as RetirementKind;
      if (!allowed.includes(kind)) errors.push(`${where}.kind ${kind} is not allowed in the ${ctx.lane} lane`);
    }
    const reason = entry["reason"];
    if (typeof reason !== "string" || PLACEHOLDER_RE.test(reason)) {
      errors.push(`${where}.reason must be explicit text (no TODO/placeholder)`);
    }
    const entryActor = entry["actor"];
    if (typeof entryActor !== "string" || entryActor.trim().length === 0) {
      errors.push(`${where}.actor must be explicit`);
    } else if (ctx.actor !== null && entryActor !== ctx.actor) {
      errors.push(`${where}.actor must equal the event actor`);
    }
    const replacement = entry["replacement_id"];
    if (replacement !== undefined && replacement !== null) {
      if (typeof replacement !== "string" || replacement.trim().length === 0) {
        errors.push(`${where}.replacement_id must be a non-empty string or null`);
      } else if (replacement === identity) {
        errors.push(`${where}.replacement_id must differ from id`);
      } else if (kind === "receipt_superseded" && !RECEIPT_REPLACEMENT_RE.test(replacement)) {
        errors.push(`${where}.replacement_id must be path#sha256=<hex> for receipt_superseded`);
      } else if (kind === "claim_superseded" && !CLM_RE.test(replacement)) {
        errors.push(`${where}.replacement_id must be the successor CLM for claim_superseded`);
      }
    } else if (kind === "claim_superseded") {
      errors.push(`${where}.replacement_id must be the successor CLM for claim_superseded`);
    }
    const anchor = entry["last_anchor"];
    if (!isPlainObject(anchor)) {
      errors.push(`${where}.last_anchor must be an object`);
    } else if (kind !== null) {
      for (const key of RETIREMENT_ANCHOR_KEYS[kind]) {
        if (!Object.hasOwn(anchor, key)) errors.push(`${where}.last_anchor.${key} is required for ${kind}`);
      }
      if (kind === "delta_absorbed") {
        if ((anchor["delta_id"] ?? null) !== identity) errors.push(`${where}.last_anchor.delta_id must equal id`);
        for (const key of ["delta_sha256", "base_blueprint_sha256"]) {
          const value = anchor[key];
          if (typeof value !== "string" || !SHA256_RE.test(value)) {
            errors.push(`${where}.last_anchor.${key} must be a sha256 hex digest`);
          }
        }
      }
      if (kind === "claim_superseded" && identity !== null && anchor["clm"] !== identity) {
        errors.push(`${where}.last_anchor.clm must equal id`);
      }
    }
    if (kind === "missing_retired" && identity !== null && ctx.candidates !== undefined && ctx.candidates !== null) {
      const current = ctx.candidates[identity];
      if (current === undefined) {
        errors.push(`${where}.id ${identity} is not a current missing record`);
      } else if (isPlainObject(anchor)) {
        for (const key of ["file_path", "symbol"]) {
          if (Object.hasOwn(anchor, key) && current[key] !== undefined && current[key] !== null && !jsonEqual(anchor[key], current[key])) {
            errors.push(`${where}.last_anchor.${key} differs from the missing record`);
          }
        }
      }
      if (typeof replacement === "string" && Object.hasOwn(ctx.candidates, replacement)) {
        errors.push(`${where}.replacement_id must name a live record, not another missing one`);
      }
    }
  });
  return errors;
}
