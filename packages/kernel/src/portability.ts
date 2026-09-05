/**
 * portability.ts —— Portability Kernel（P32 第一件 · PRD §85 全节 + §84.6 Hidden
 * Memory Drift；docs/wave3-plan.md P32 出口判据的 8 项检查 + Manifest + 可删除测试）。
 *
 * 出处锚（逐条裁定注记出处锚纪律）：
 * - §85.2 MEMORY_PORTABILITY_GATE：测试环境五条件（clean HOME / no ~/.claude /
 *   no ~/.codex / no IDE memory / fresh clone）；三命令词形 pomaster portability
 *   bootstrap / doctor / portability check；八项检查逐字（Project Truth /
 *   Architecture State / Knowledge Index / Decision History / Verified Evidence /
 *   Active Task Recovery / Harness Bootstrap / Hidden Memory Dependency 各 PASS）。
 * - §85.3 Portability Manifest：五键逐字（project_memory_version=1 /
 *   required_canonical_sets 五族 truth·architecture·decisions·knowledge·evidence /
 *   required_runtime_rebuild 两项 contexts·harness-bootstrap /
 *   forbidden_dependencies 两项 user-home-project-memory·untracked-local-spec）。
 *   存储形态裁定：JSON（.pomaster/portability-manifest.json，snake_case 键与
 *   §85.3 yaml 逐键同形）——Canonical State 为 JSON 的仓库纪律（README 蓝图），
 *   不引 YAML 运行时依赖（kernel catalog/digest 同款裁定）。
 * - §85.4 可删除测试：rm -rf .pomaster/runtime → bootstrap → state equivalent——
 *   证明 Runtime 是可重建状态（OPEN-M6-07/08 流程缺口闭环的机器化）。
 * - §84.6 Hidden Memory Drift：Harness local knowledge exists AND POMaster lacks
 *   corresponding project memory → MEMORY_DRIFT；禁自动写入 Canonical State，
 *   必须 classification/review。
 *
 * fail-closed 纪律（本模块三态语义，禁静默绿）：
 * - PASS / FAIL / NOT_RUN 三态显式（词形见 @pomaster/schemas
 *   PORTABILITY_CHECK_STATUS_VALUES；PASS 是 §85.2 逐字，FAIL/NOT_RUN 是
 *   「缺项=FAIL 或 NOT_RUN」纪律补位词——PR-0009 随 vocab-lock portability_vocab.check_status 一并登记）。
 * - 应存在而缺席/损坏/判违 = FAIL；环境性缺席（上游条件不成立无法执行检查本身）
 *   = NOT_RUN；两者都绝不静默 PASS。
 *
 * 家族映射裁定（§85.3 五族 ↔ store 既有平面的机器可判落点，kernel 局部映射，
 * 提请 Owner 复核）：
 * - truth → state/truth-index.json 可装载且 objects 非空（信封层 + 认知非空集）；
 * - architecture → 结构宪法面对象族（CAPABILITY/COMPONENT/POLICY/PROFILE/
 *   KEYBINDING 前缀）≥1——governed 前缀闭包无 ARCH.*，取结构治理面为该族落点；
 * - decisions → CHANGE.* 对象 ≥1 或 journal 中 authority_ref 非空事件 ≥1
 *   （governed 前缀闭包无 DECISION.*；DECISION.* 是 general_id 宽松词形，
 *   落 CHANGE 治理记录与 journal 审批留痕两平面）；
 * - knowledge → KNOWLEDGE.* 对象 ∪ state/knowledge-library.json 条目 ≥1；
 * - evidence → evidence/runs/ 存在 GRN-* 记录且 C1 counts 四键合规抽样。
 *
 * bootstrap 语义（§85.4 的 bootstrap 步 + §84.4 新机器序列的机器面）：
 * - 只重建 runtime 面（runtime/producers|sessions|locks + heartbeat 侧车，缺失才建）
 *   + 确保 Portability Manifest 在座（缺失才写 canonical §85.3 形态）；
 * - 零治理事实：不写 truth-index、不写 state/、零 journal 事件（重建非变更，A4；
 *   这是 §85.4 state equivalent 可判定字节相等的结构性前提）；
 * - 非幂等破坏：全部「缺失才写」，重复执行 NO_CHANGE（No-op is elegant）。
 *
 * 可删除测试安全封装（破坏性操作结构性防线）：
 * - runDeletabilityTest 只接受显式 root 参数且断言路径含临时标记段
 *   （pomaster-portability-fixture- / pvnext-kernel-test-）——防误删真实 store；
 * - rm 目标恒为 <root>/.pomaster/runtime 派生路径（非调用方任意路径）。
 *
 * Hidden Memory Dependency 探测红线：~/.claude、~/.codex 等本机路径**仅探测
 * 存在性**（statSync），内容不读取不入库（PRD §84.6 上下文 + 外层只读红线同源）。
 * 探测位可注入（options.harnessMemoryRoots）——测试用临时目录，绝不触碰真实
 * 用户 home。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Store } from "./index.js";
import {
  MEMORY_DRIFT,
  PORTABILITY_CANONICAL_SET_VALUES,
  PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES,
  PORTABILITY_RUNTIME_REBUILD_VALUES,
  type PortabilityCanonicalSetValue,
  type PortabilityCheckStatusValue,
  type PortabilityForbiddenDependencyValue,
  type PortabilityRuntimeRebuildValue,
} from "./vocab.js";
import { GovernanceError } from "./errors.js";
import { readKnowledgeLibrary } from "./knowledge.js";
import { doctorProbes } from "./doctor.js";
import { captureOriginal, executeWrites, readText } from "./io.js";
import { buildStorePaths, readRawIndex, type StorePaths } from "./paths.js";
import { createStore } from "./store.js";
import { sha256OfUtf8 } from "./catalog.js";

type UnknownRecord = Record<string, unknown>;
type RawRow = Record<string, unknown>;

// ============================================================
// 词形与常量（§85 逐字承载；x-vocab-source 注记见各导出）
// ============================================================

/** Manifest 存储路径（.pomaster/portability-manifest.json；state/ 之外——bootstrap
 *  写 manifest 不破坏 §85.4 state equivalent 判据的结构性前提）。 */
export const PORTABILITY_MANIFEST_RELATIVE = ".pomaster/portability-manifest.json";

/** §85.2 八项检查机器键（§85.2 逐字标签的 snake_case 镜像；顺序 = §85.2 原文序）。 */
export const PORTABILITY_CHECK_IDS = [
  "project_truth",
  "architecture_state",
  "knowledge_index",
  "decision_history",
  "verified_evidence",
  "active_task_recovery",
  "harness_bootstrap",
  "hidden_memory_dependency",
] as const;
export type PortabilityCheckId = (typeof PORTABILITY_CHECK_IDS)[number];

/** §85.2 八项检查逐字标签（PRD 原文词形；人读呈现与 machine key 的 1:1 映射）。 */
export const PORTABILITY_CHECK_LABELS: readonly (readonly [
  PortabilityCheckId,
  string,
])[] = [
  ["project_truth", "Project Truth"],
  ["architecture_state", "Architecture State"],
  ["knowledge_index", "Knowledge Index"],
  ["decision_history", "Decision History"],
  ["verified_evidence", "Verified Evidence"],
  ["active_task_recovery", "Active Task Recovery"],
  ["harness_bootstrap", "Harness Bootstrap"],
  ["hidden_memory_dependency", "Hidden Memory Dependency"],
];

/**
 * architecture 族落点前缀（kernel 局部映射：结构宪法面；governed 前缀闭包无
 * ARCH.*，取 CAPABILITY/COMPONENT/POLICY/PROFILE/KEYBINDING 为 §85.3
 * architecture 族的 store 落点——映射裁定提请 Owner 复核，禁私改前缀闭包）。
 */
const ARCHITECTURE_FAMILY_PREFIXES = [
  "CAPABILITY",
  "COMPONENT",
  "POLICY",
  "PROFILE",
  "KEYBINDING",
] as const;

/** Verified Evidence C1 合规抽样上限（确定性：按文件名字典序取前 N；抽样口径随 detail 呈现）。 */
export const EVIDENCE_SAMPLE_CAP = 50;

/** 可删除测试临时标记段（结构性防线；第二标记 = kernel 测试 helper mkdtemp 前缀）。 */
export const DELETABILITY_FIXTURE_MARKERS = [
  "pomaster-portability-fixture-",
  "pvnext-kernel-test-",
] as const;

// ============================================================
// Portability Manifest（§85.3 逐字五键；JSON 存储形态裁定见头注）
// ============================================================

/** §85.3 Portability Manifest（snake_case 键与 PRD yaml 逐键同形；value 词表闭包）。 */
export interface PortabilityManifest {
  readonly project_memory_version: 1;
  readonly required_canonical_sets: readonly PortabilityCanonicalSetValue[];
  readonly required_runtime_rebuild: readonly PortabilityRuntimeRebuildValue[];
  readonly forbidden_dependencies: readonly PortabilityForbiddenDependencyValue[];
}

/** canonical §85.3 形态（PRD 逐字；写侧唯一产出）。 */
export function canonicalPortabilityManifest(): PortabilityManifest {
  return {
    project_memory_version: 1,
    required_canonical_sets: [...PORTABILITY_CANONICAL_SET_VALUES],
    required_runtime_rebuild: [...PORTABILITY_RUNTIME_REBUILD_VALUES],
    forbidden_dependencies: [...PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES],
  };
}

function manifestInvalid(detail: string): GovernanceError {
  return new GovernanceError(
    "SCHEMA_INVALID",
    `${PORTABILITY_MANIFEST_RELATIVE} ${detail}`,
    "恢复 git 版本或删除后重跑 pomaster portability bootstrap（canonical §85.3 形态）；manifest 由 kernel 维护，禁止手改",
    {},
  );
}

/**
 * 读 Manifest（装载面 fail-closed）：缺失 → null（合法缺席——由 portability check
 * 显式列为对账 finding，bootstrap 负责补写）；JSON 损坏 → SCHEMA_INVALID（禁静默
 * 当缺省）。结构/词表校验归 validatePortabilityManifest（check 对账面），本函数
 * 只保证「可解析为 JSON 对象」。
 */
export function readPortabilityManifest(rootDir: string): PortabilityManifest | null {
  const path = `${buildStorePaths(rootDir).pomasterDir}/portability-manifest.json`;
  const text = readText(path);
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw manifestInvalid(`无法解析为 JSON（损坏或手改）: ${String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw manifestInvalid("根非 JSON 对象");
  }
  return parsed as PortabilityManifest;
}

/**
 * Manifest 校验（纯函数；check 对账面 findings 产出）：
 * - project_memory_version ≠ 1 → PROJECT_MEMORY_VERSION_MISMATCH；
 * - required_canonical_sets ⊉ 五族闭集 → REQUIRED_CANONICAL_SETS_INCOMPLETE；
 *   词表外值 → REQUIRED_CANONICAL_SETS_UNKNOWN_VALUE（闭集纪律：扩值走词汇表 PR）；
 * - required_runtime_rebuild / forbidden_dependencies 同法（闭集 + 完整性）。
 */
export function validatePortabilityManifest(value: unknown): {
  readonly manifest: PortabilityManifest | null;
  readonly findings: readonly string[];
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      manifest: null,
      findings: ["PORTABILITY_MANIFEST_SHAPE_INVALID: 根非 JSON 对象"],
    };
  }
  const record = value as UnknownRecord;
  const findings: string[] = [];
  if (record.project_memory_version !== 1) {
    findings.push(
      `PROJECT_MEMORY_VERSION_MISMATCH: ${JSON.stringify(record.project_memory_version)} ≠ 1`,
    );
  }
  const checkList = (
    key: string,
    closed: readonly string[],
    prefix: string,
  ): readonly string[] => {
    const raw = record[key];
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
      findings.push(`${prefix}_SHAPE_INVALID: ${key} 须为字符串数组`);
      return [];
    }
    const values = raw as readonly string[];
    const missing = closed.filter((entry) => !values.includes(entry));
    if (missing.length > 0) {
      findings.push(`${prefix}_INCOMPLETE: missing=${missing.join(",")}`);
    }
    const unknownValues = values.filter((entry) => !closed.includes(entry));
    for (const entry of unknownValues) {
      findings.push(
        `${prefix}_UNKNOWN_VALUE: ${entry}（词表外；闭集=${closed.join(",")}——扩值走词汇表 PR）`,
      );
    }
    return values;
  };
  const canonicalSets = checkList(
    "required_canonical_sets",
    PORTABILITY_CANONICAL_SET_VALUES,
    "REQUIRED_CANONICAL_SETS",
  ) as readonly PortabilityCanonicalSetValue[];
  const runtimeRebuild = checkList(
    "required_runtime_rebuild",
    PORTABILITY_RUNTIME_REBUILD_VALUES,
    "REQUIRED_RUNTIME_REBUILD",
  ) as readonly PortabilityRuntimeRebuildValue[];
  const forbidden = checkList(
    "forbidden_dependencies",
    PORTABILITY_FORBIDDEN_DEPENDENCY_VALUES,
    "FORBIDDEN_DEPENDENCIES",
  ) as readonly PortabilityForbiddenDependencyValue[];
  const manifest: PortabilityManifest | null =
    record.project_memory_version === 1
      ? {
          project_memory_version: 1,
          required_canonical_sets: canonicalSets,
          required_runtime_rebuild: runtimeRebuild,
          forbidden_dependencies: forbidden,
        }
      : null;
  return { manifest, findings };
}

/**
 * 确保 Manifest 在座（bootstrap 内部位）：缺失 → 写 canonical（staged 原子写）；
 * 在座且 canonical → NO_CHANGE；在座但非 canonical → **不覆盖**，drift findings
 * 显式返回（声明漂移是需要处理的状态，禁静默改写人类/上游可见的声明文件）。
 */
export function writePortabilityManifestIfMissing(rootDir: string): {
  readonly written: boolean;
  readonly drift: readonly string[];
  readonly manifest: PortabilityManifest;
} {
  const path = `${buildStorePaths(rootDir).pomasterDir}/portability-manifest.json`;
  const canonical = canonicalPortabilityManifest();
  const existing = readPortabilityManifest(rootDir);
  if (existing !== null) {
    const { findings } = validatePortabilityManifest(existing);
    return { written: false, drift: findings, manifest: canonical };
  }
  executeWrites([
    {
      path,
      next: `${JSON.stringify(canonical, null, 2)}\n`,
      original: captureOriginal(path),
    },
  ]);
  return { written: true, drift: [], manifest: canonical };
}

// ============================================================
// 八项检查器（§85.2；PASS/FAIL/NOT_RUN 显式三态，禁静默绿）
// ============================================================

export interface PortabilityCheckRow {
  /** §85.2 机器键（PORTABILITY_CHECK_IDS 闭包）。 */
  readonly check: PortabilityCheckId;
  /** §85.2 逐字标签（PRD 原文词形）。 */
  readonly label: string;
  readonly status: PortabilityCheckStatusValue;
  readonly detail: string;
  /** 判定词形输出位（§84.6 MEMORY_DRIFT 等；无判定词形 = 空数组显式）。 */
  readonly findings: readonly string[];
}

export interface PortabilityCheckOptions {
  /**
   * harness-local 记忆探测位（绝对路径；仅探测存在性，内容不读取不入库）。
   * 缺省 = ~/.claude 与 ~/.codex（PRD §85.2 逐字两路径）。测试注入临时目录，
   * 绝不触碰真实用户 home。
   */
  readonly harnessMemoryRoots?: readonly string[];
  /** Verified Evidence C1 抽样上限（缺省 50；确定性按文件名字典序取前 N）。 */
  readonly evidenceSampleCap?: number;
}

interface CheckContext {
  readonly rootDir: string;
  readonly paths: StorePaths;
  /** 原始索引（parse 级可装载形态；损坏/缺席 = null + indexError 显式）。 */
  readonly raw: UnknownRecord | null;
  readonly indexError: string | null;
}

function loadCheckContext(rootDir: string): CheckContext {
  const paths = buildStorePaths(rootDir);
  try {
    const raw = readRawIndex(paths);
    return { rootDir, paths, raw, indexError: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { rootDir, paths, raw: null, indexError: message };
  }
}

function objectsOf(ctx: CheckContext): readonly RawRow[] {
  if (ctx.raw === null) return [];
  const objects = ctx.raw.objects;
  return Array.isArray(objects) ? (objects as readonly RawRow[]) : [];
}

/** 上游 project_truth 不可执行判定（索引损坏 indexError ≠ null 或文件缺席 raw = null）。 */
function upstreamUnavailable(ctx: CheckContext): boolean {
  return ctx.indexError !== null || ctx.raw === null;
}

/** 上游 project_truth 不可执行时，下游检查的统一 NOT_RUN 出口（环境性缺席显式）。 */
function upstreamNotRun(
  check: PortabilityCheckId,
  label: string,
  ctx: CheckContext,
): PortabilityCheckRow {
  return {
    check,
    label,
    status: "NOT_RUN",
    detail: `上游 project_truth 不可执行（${ctx.indexError ?? "truth-index 缺失"}）——环境性缺席显式呈现，非静默通过`,
    findings: [],
  };
}

function labelOf(check: PortabilityCheckId): string {
  const hit = PORTABILITY_CHECK_LABELS.find(([id]) => id === check);
  return hit?.[1] ?? check;
}

function row(
  check: PortabilityCheckId,
  status: PortabilityCheckStatusValue,
  detail: string,
  findings: readonly string[] = [],
): PortabilityCheckRow {
  return { check, label: labelOf(check), status, detail, findings };
}

// —— 1) Project Truth：truth-index 可装载且非空 ——

function checkProjectTruth(ctx: CheckContext): PortabilityCheckRow {
  if (ctx.indexError !== null) {
    return row(
      "project_truth",
      "FAIL",
      `state/truth-index.json 不可装载：${ctx.indexError}（应存在而缺席/损坏——§85.3 truth 族缺席）`,
    );
  }
  if (ctx.raw === null) {
    return row(
      "project_truth",
      "FAIL",
      "state/truth-index.json 缺席（应存在而缺席——§85.3 truth 族缺席；store 未初始化，先跑 pomaster init）",
    );
  }
  const objects = objectsOf(ctx);
  if (objects.length === 0) {
    return row(
      "project_truth",
      "FAIL",
      "truth-index 可装载但 objects 为空（认知空集无可恢复——§85.3 truth 族缺席）",
    );
  }
  return row(
    "project_truth",
    "PASS",
    `truth-index 可装载且非空（${objects.length} 对象；seq=${String(
      (ctx.raw as UnknownRecord).generation !== undefined &&
        typeof (ctx.raw as UnknownRecord).generation === "object" &&
        (ctx.raw as UnknownRecord).generation !== null
        ? ((ctx.raw as UnknownRecord).generation as UnknownRecord).seq
        : "unknown",
    )}）`,
  );
}

// —— 2) Architecture State：结构宪法面非空 ——

function checkArchitectureState(ctx: CheckContext): PortabilityCheckRow {
  if (upstreamUnavailable(ctx)) return upstreamNotRun("architecture_state", labelOf("architecture_state"), ctx);
  const objects = objectsOf(ctx);
  const hits = objects.filter((entry) =>
    ARCHITECTURE_FAMILY_PREFIXES.some((prefix) =>
      typeof entry.id === "string" ? entry.id.startsWith(`${prefix}.`) : false,
    ),
  );
  if (hits.length === 0) {
    return row(
      "architecture_state",
      "FAIL",
      `结构宪法面对象为 0（architecture 族落点=${ARCHITECTURE_FAMILY_PREFIXES.join("/")} 前缀；§85.3 architecture 族缺席）`,
    );
  }
  return row(
    "architecture_state",
    "PASS",
    `结构宪法面 ${hits.length} 对象（${[...new Set(hits.map((hit) => String(hit.id).split(".")[0]))].sort().join("/")}）`,
  );
}

// —— 3) Knowledge Index：KNOWLEDGE.* 对象 ∪ knowledge-library 条目 ——

function checkKnowledgeIndex(ctx: CheckContext): PortabilityCheckRow {
  if (upstreamUnavailable(ctx)) return upstreamNotRun("knowledge_index", labelOf("knowledge_index"), ctx);
  const objects = objectsOf(ctx);
  const knowledgeObjects = objects.filter(
    (entry) => typeof entry.id === "string" && entry.id.startsWith("KNOWLEDGE."),
  );
  let libraryEntries = 0;
  try {
    libraryEntries = readKnowledgeLibrary(ctx.paths).entries.length;
  } catch (error) {
    return row(
      "knowledge_index",
      "FAIL",
      `state/knowledge-library.json 损坏（装载面 fail-closed）：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const total = knowledgeObjects.length + libraryEntries;
  if (total === 0) {
    return row(
      "knowledge_index",
      "FAIL",
      "knowledge 族为空（KNOWLEDGE.* 对象 0 且 knowledge-library 条目 0——§85.3 knowledge 族缺席）",
    );
  }
  return row(
    "knowledge_index",
    "PASS",
    `knowledge 平面 ${total} 条（对象 ${knowledgeObjects.length} + 库条目 ${libraryEntries}）`,
  );
}

// —— 4) Decision History：CHANGE.* 对象 ∪ journal authority_ref 事件 ——

function checkDecisionHistory(ctx: CheckContext): PortabilityCheckRow {
  if (upstreamUnavailable(ctx)) return upstreamNotRun("decision_history", labelOf("decision_history"), ctx);
  const objects = objectsOf(ctx);
  const changeObjects = objects.filter(
    (entry) => typeof entry.id === "string" && entry.id.startsWith("CHANGE."),
  );
  const journalText = readText(ctx.paths.journalPath);
  let authorityEvents = 0;
  if (journalText !== null) {
    for (const line of journalText.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return row(
          "decision_history",
          "FAIL",
          `state/journal.jsonl 存在不可解析事件行（重放基底损坏）：${trimmed.slice(0, 60)}`,
        );
      }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as UnknownRecord).authority_ref === "string" &&
        ((parsed as UnknownRecord).authority_ref as string).length > 0
      ) {
        authorityEvents += 1;
      }
    }
  }
  if (changeObjects.length === 0 && authorityEvents === 0) {
    return row(
      "decision_history",
      "FAIL",
      "决策史为空（CHANGE.* 对象 0 且 journal 无 authority_ref 审批事件——decisions 族缺席；DECISION.* 是 general_id 宽松词形，落 CHANGE 治理记录与 journal 审批留痕两平面）",
    );
  }
  return row(
    "decision_history",
    "PASS",
    `决策史在座（CHANGE.* 对象 ${changeObjects.length} + journal authority_ref 事件 ${authorityEvents}）`,
  );
}

// —— 5) Verified Evidence：evidence/runs 存在 GRN 且 C1 合规抽样 ——

const C1_COUNT_KEYS = ["scanned", "applicableScanned", "violations", "notApplicable"] as const;
const C1_COUNT_KEYS_SNAKE = ["scanned", "applicable_scanned", "violations", "not_applicable"] as const;

function checkVerifiedEvidence(ctx: CheckContext, sampleCap: number): PortabilityCheckRow {
  if (upstreamUnavailable(ctx)) return upstreamNotRun("verified_evidence", labelOf("verified_evidence"), ctx);
  let files: string[] = [];
  try {
    files = readdirSync(ctx.paths.runsDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    files = [];
  }
  if (files.length === 0) {
    return row(
      "verified_evidence",
      "FAIL",
      "evidence/runs/ 无 GRN 记录（evidence 族缺席——Verified Evidence 无判卷运行可恢复）",
    );
  }
  const sampled = files.slice(0, sampleCap);
  for (const name of sampled) {
    const text = readText(`${ctx.paths.runsDir}/${name}`);
    if (text === null) {
      return row("verified_evidence", "FAIL", `GRN 记录不可读：evidence/runs/${name}`);
    }
    let parsed: UnknownRecord;
    try {
      parsed = JSON.parse(text) as UnknownRecord;
    } catch (error) {
      return row(
        "verified_evidence",
        "FAIL",
        `GRN 记录不可解析（损坏）：evidence/runs/${name}: ${String(error)}`,
      );
    }
    const gateResult = parsed.gate_result as UnknownRecord | undefined;
    const inline =
      typeof gateResult === "object" && gateResult !== null
        ? (gateResult.result as UnknownRecord | undefined)
        : undefined;
    const countsSource =
      typeof inline === "object" && inline !== null
        ? (inline.counts as UnknownRecord | undefined)
        : (parsed.counts as UnknownRecord | undefined);
    if (typeof countsSource !== "object" || countsSource === null) {
      return row(
        "verified_evidence",
        "FAIL",
        `GRN 记录缺 C1 counts 块（C1 不合规）：evidence/runs/${name}`,
      );
    }
    // C1 counts 兼容双词形：camelCase（契约形态）与 snake_case（07 落盘形态）。
    const compliant = C1_COUNT_KEYS.every((key) => typeof countsSource[key] === "number") ||
      C1_COUNT_KEYS_SNAKE.every((key) => typeof countsSource[key] === "number");
    if (!compliant) {
      return row(
        "verified_evidence",
        "FAIL",
        `GRN 记录 C1 counts 不合规（scanned/applicableScanned/violations/notApplicable 四键须为数值）：evidence/runs/${name}`,
      );
    }
  }
  return row(
    "verified_evidence",
    "PASS",
    `evidence/runs ${files.length} 条 GRN；C1 合规抽样 ${sampled.length} 条（按文件名字典序前 N，N≤${sampleCap}）逐条四键合规`,
  );
}

// —— 6) Active Task Recovery：任务态可重放（TASK 行 + 正文成对 + journal 可解析） ——

function checkActiveTaskRecovery(ctx: CheckContext): PortabilityCheckRow {
  if (upstreamUnavailable(ctx)) return upstreamNotRun("active_task_recovery", labelOf("active_task_recovery"), ctx);
  const objects = objectsOf(ctx);
  const tasks = objects.filter(
    (entry) => typeof entry.id === "string" && entry.id.startsWith("TASK."),
  );
  if (tasks.length === 0) {
    return row(
      "active_task_recovery",
      "FAIL",
      "无 TASK.* 对象（任务态缺席——Active Task Recovery 无可重放分母）",
    );
  }
  for (const task of tasks) {
    const bodyRef = task.body_ref;
    if (typeof bodyRef !== "string" || bodyRef.length === 0) {
      return row(
        "active_task_recovery",
        "FAIL",
        `TASK 行缺 body_ref（A1 成对纪律破坏）：${String(task.id)}`,
      );
    }
    const text = readText(`${ctx.paths.pomasterDir}/${bodyRef}`);
    if (text === null) {
      return row(
        "active_task_recovery",
        "FAIL",
        `TASK 正文缺失（state→正文成对破坏，不可重放）：${String(task.id)} → ${bodyRef}`,
      );
    }
    try {
      JSON.parse(text);
    } catch (error) {
      return row(
        "active_task_recovery",
        "FAIL",
        `TASK 正文不可解析（不可重放）：${String(task.id)}: ${String(error)}`,
      );
    }
  }
  // 缺席显式原则（G2 审查 G3）：journal「行损坏 → FAIL、整文件缺席 → PASS」的
  // 不对称是假绿——TASK 行在座意味着 store 已初始化，journal.jsonl 是重放基底的
  // 必备半边（createStore 即建）；「应存在而缺席 = FAIL」（本模块 fail-closed
  // 三态纪律），缺席绝不静默按「可解析」放行。
  const journalText = readText(ctx.paths.journalPath);
  if (journalText === null) {
    return row(
      "active_task_recovery",
      "FAIL",
      "journal.jsonl 缺席（重放基底应存在而缺席——TASK 行在座而事件流不在场，任务态不可重放）",
    );
  }
  for (const line of journalText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      JSON.parse(trimmed);
    } catch {
      return row(
        "active_task_recovery",
        "FAIL",
        `journal 存在不可解析事件行（重放基底损坏）：${trimmed.slice(0, 60)}`,
      );
    }
  }
  return row(
    "active_task_recovery",
    "PASS",
    `${tasks.length} 个 TASK.* 对象 state↔正文成对可装载 + journal 事件流可解析（任务态可重放）`,
  );
}

// —— 7) Harness Bootstrap：bootstrap 产物与声明一致 ——

function checkHarnessBootstrap(ctx: CheckContext): PortabilityCheckRow {
  const missing: string[] = [];
  if (!existsSync(ctx.paths.runtimeDir)) missing.push("runtime/producers/");
  if (!existsSync(ctx.paths.sessionsDir)) missing.push("runtime/sessions/");
  if (!existsSync(ctx.paths.locksDir)) missing.push("runtime/locks/");
  if (!existsSync(ctx.paths.heartbeatPath)) missing.push("runtime/producers/heartbeat.jsonl");
  if (missing.length > 0) {
    return row(
      "harness_bootstrap",
      "FAIL",
      `bootstrap 产物缺席：${missing.join(", ")}（先跑 pomaster portability bootstrap 重建 runtime 面——§85.4 bootstrap 步）`,
    );
  }
  const heartbeatText = readText(ctx.paths.heartbeatPath);
  if (heartbeatText !== null) {
    for (const line of heartbeatText.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        JSON.parse(trimmed);
      } catch {
        return row(
          "harness_bootstrap",
          "FAIL",
          `heartbeat 侧车存在不可解析行（产物与声明不一致）：${trimmed.slice(0, 60)}`,
        );
      }
    }
  }
  return row(
    "harness_bootstrap",
    "PASS",
    "runtime 面（producers/sessions/locks + heartbeat 侧车）在座且可解析——bootstrap 产物与 §85.3 required_runtime_rebuild 声明一致（contexts 可重建性由 §85.2 三命令序列的 doctor 探针 portability_runtime_rebuild 并行呈现）",
  );
}

// —— 8) Hidden Memory Dependency：§84.6 MEMORY_DRIFT 检测 ——

/** 缺省 harness-local 记忆探测位（PRD §85.2 逐字两路径；仅探测存在性）。 */
export function defaultHarnessMemoryRoots(): readonly string[] {
  const home = homedir();
  return [`${home}/.claude`, `${home}/.codex`];
}

function checkHiddenMemoryDependency(
  ctx: CheckContext,
  harnessMemoryRoots: readonly string[],
): PortabilityCheckRow {
  const existing: string[] = [];
  const unprobeable: string[] = [];
  for (const root of harnessMemoryRoots) {
    try {
      statSync(root);
      existing.push(root);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: unknown }).code === "ENOENT"
      ) {
        continue; // 不存在 = 干净位（clean 环境语义）
      }
      unprobeable.push(root); // 不可探测（权限等）= 环境异常
    }
  }
  if (unprobeable.length > 0) {
    return row(
      "hidden_memory_dependency",
      "NOT_RUN",
      `harness-local 记忆位不可探测（环境性缺席，禁静默）：${unprobeable.join(", ")}`,
    );
  }
  if (existing.length === 0) {
    return row(
      "hidden_memory_dependency",
      "PASS",
      `无 harness-local 记忆位（探测 ${harnessMemoryRoots.length} 处均缺席——clean HOME/no ~/.claude/no ~/.codex 环境语义；仅探测存在性，内容不读取不入库）`,
    );
  }
  // store 对应性半边：POMaster 项目记忆平面是否为空（KNOWLEDGE.* 对象 ∪ 库条目）。
  const objects = objectsOf(ctx);
  const knowledgeObjects = objects.filter(
    (entry) => typeof entry.id === "string" && entry.id.startsWith("KNOWLEDGE."),
  );
  let libraryEntries = 0;
  let libraryBroken = false;
  try {
    libraryEntries = readKnowledgeLibrary(ctx.paths).entries.length;
  } catch {
    libraryBroken = true;
  }
  const projectMemoryPresent = knowledgeObjects.length + libraryEntries > 0;
  if (!projectMemoryPresent) {
    return row(
      "hidden_memory_dependency",
      "FAIL",
      `harness-local 记忆位存在（${existing.length} 处：${existing.join(", ")}）且 POMaster 无对应项目记忆（knowledge 平面为空${libraryBroken ? "；knowledge-library 损坏计入缺席" : ""}）——Harness local knowledge exists AND POMaster lacks corresponding project memory`,
      [MEMORY_DRIFT],
    );
  }
  return row(
    "hidden_memory_dependency",
    "PASS",
    `harness-local 记忆位存在（${existing.length} 处）但 POMaster 项目记忆非空（对象 ${knowledgeObjects.length} + 库条目 ${libraryEntries}）——MEMORY_DRIFT 判定条件「lacks corresponding project memory」机判不成立；对应性全量核验需读取 harness 内容（红线禁读取），此处仅呈报机械可判半边`,
  );
}

/**
 * §85.2 八项检查（只读零写入；对 rootDir 纯探测，不要求 Store 句柄——fresh clone
 * 未 init 目录同样可跑并如实 FAIL/NOT_RUN）。顺序恒 = §85.2 原文序。
 */
export function runPortabilityChecks(
  rootDir: string,
  options?: PortabilityCheckOptions,
): readonly PortabilityCheckRow[] {
  const ctx = loadCheckContext(rootDir);
  const harnessRoots = options?.harnessMemoryRoots ?? defaultHarnessMemoryRoots();
  const sampleCap = options?.evidenceSampleCap ?? EVIDENCE_SAMPLE_CAP;
  return [
    checkProjectTruth(ctx),
    checkArchitectureState(ctx),
    checkKnowledgeIndex(ctx),
    checkDecisionHistory(ctx),
    checkVerifiedEvidence(ctx, sampleCap),
    checkActiveTaskRecovery(ctx),
    checkHarnessBootstrap(ctx),
    checkHiddenMemoryDependency(ctx, harnessRoots),
  ];
}

// ============================================================
// forbidden_dependencies 命中检测（§85.3 读侧；untracked-local-spec 落点）
// ============================================================

const LOCAL_PATH_REF_PATTERN = /^(?:[A-Za-z]:[\\/]|[\\/])|\.\.(?:[\\/]|$)/;

export interface ForbiddenDependencyHit {
  readonly dependency: PortabilityForbiddenDependencyValue;
  readonly evidence: string;
}

/**
 * forbidden_dependencies 命中检测（只读）：
 * - user-home-project-memory ⇔ hidden_memory_dependency 检查 FAIL（MEMORY_DRIFT）；
 * - untracked-local-spec ⇔ 对象正文 sources[].ref 出现本机绝对盘符/绝对路径/..逃逸
 *   （provenance 可移植纪律的读侧复验——写侧 store 已 FATAL 拒绝，读侧扫手改残留）。
 * 映射裁定注记：untracked-local-spec 的「git 未跟踪 spec 目录」半边需读消费仓 git
 * 状态（CI 环境相关），kernel 侧取「本机路径残留」为机器可判落点，取舍随报告呈现。
 */
function detectForbiddenDependencyHits(
  ctx: CheckContext,
  checks: readonly PortabilityCheckRow[],
): readonly ForbiddenDependencyHit[] {
  const hits: ForbiddenDependencyHit[] = [];
  const hidden = checks.find((entry) => entry.check === "hidden_memory_dependency");
  if (hidden !== undefined && hidden.status === "FAIL") {
    hits.push({
      dependency: "user-home-project-memory",
      evidence: `${MEMORY_DRIFT}（hidden_memory_dependency=FAIL）`,
    });
  }
  let scanned = 0;
  for (const entry of objectsOf(ctx)) {
    const bodyRef = entry.body_ref;
    if (typeof bodyRef !== "string" || bodyRef.length === 0) continue;
    const text = readText(`${ctx.paths.pomasterDir}/${bodyRef}`);
    if (text === null) continue;
    let body: UnknownRecord;
    try {
      body = JSON.parse(text) as UnknownRecord;
    } catch {
      continue;
    }
    const sources = body.sources;
    if (!Array.isArray(sources)) continue;
    scanned += 1;
    for (const source of sources) {
      const ref = (source as UnknownRecord).ref;
      if (typeof ref === "string" && LOCAL_PATH_REF_PATTERN.test(ref)) {
        hits.push({
          dependency: "untracked-local-spec",
          evidence: `${String(entry.id)} sources[].ref 本机路径残留: ${ref}`,
        });
      }
    }
  }
  void scanned;
  return hits;
}

// ============================================================
// portability check（§85.2 三命令之三：八项检查 + manifest 对账）
// ============================================================

export interface PortabilityManifestReconciliation {
  /** manifest 在座与否（缺席 = 显式 finding，bootstrap 补写）。 */
  readonly present: boolean;
  /** 语义符合 §85.3（findings 为空）。 */
  readonly canonical: boolean;
  readonly findings: readonly string[];
}

export interface PortabilityReport {
  readonly rootDir: string;
  /** 八项检查（§85.2 原文序）。 */
  readonly checks: readonly PortabilityCheckRow[];
  readonly manifestReconciliation: PortabilityManifestReconciliation;
  readonly forbiddenDependencyHits: readonly ForbiddenDependencyHit[];
  /** 全部检查 PASS 且 manifest 对账无 finding 且禁依赖零命中（fail-closed）。 */
  readonly ok: boolean;
}

/** portability check（§85.2；纯读零写入）。 */
export function portabilityCheck(
  rootDir: string,
  options?: PortabilityCheckOptions,
): PortabilityReport {
  const checks = runPortabilityChecks(rootDir, options);
  let manifest: PortabilityManifest | null = null;
  let manifestPresent = false;
  let manifestFindings: string[] = [];
  try {
    manifest = readPortabilityManifest(rootDir);
    manifestPresent = manifest !== null;
    if (manifest === null) {
      manifestFindings = [
        "PORTABILITY_MANIFEST_MISSING: .pomaster/portability-manifest.json 缺席（先跑 pomaster portability bootstrap 生成 §85.3 canonical 形态）",
      ];
    } else {
      manifestFindings = [...validatePortabilityManifest(manifest).findings];
    }
  } catch (error) {
    manifestPresent = true;
    manifestFindings = [
      `PORTABILITY_MANIFEST_CORRUPT: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  const ctx = loadCheckContext(rootDir);
  const hits = detectForbiddenDependencyHits(ctx, checks);
  const ok =
    checks.every((entry) => entry.status === "PASS") &&
    manifestFindings.length === 0 &&
    hits.length === 0;
  return {
    rootDir,
    checks,
    manifestReconciliation: {
      present: manifestPresent,
      canonical: manifestPresent && manifestFindings.length === 0,
      findings: manifestFindings,
    },
    forbiddenDependencyHits: hits,
    ok,
  };
}

// ============================================================
// portability bootstrap（§85.2 三命令之一；§85.4 bootstrap 步；§84.4 新机器序列）
// ============================================================

export interface PortabilityBootstrapResult {
  readonly rootDir: string;
  /** 本次补齐的 runtime 面条目（.pomaster 相对路径；幂等重跑 = 空数组）。 */
  readonly runtimeEntries: readonly string[];
  readonly manifestWritten: boolean;
  /** 既有 manifest 与 §85.3 不符的 findings（不覆盖，显式报告——禁静默改写声明）。 */
  readonly manifestDrift: readonly string[];
  readonly manifest: PortabilityManifest;
}

/**
 * runtime 面重建 + Manifest 确保（§85.4 bootstrap 步）：
 * - 要求 canonical state 在座（truth-index 缺失 → NOT_CONFIGURED——bootstrap 的
 *   职责是重建既有认知的 runtime 面，初始化归 pomaster init）；
 * - 只补 runtime 缺件（缺失才写）+ 缺失才写 canonical manifest；
 * - 零治理事实：不写 truth-index / state/、零 journal 事件（重建非变更，A4）——
 *   §85.4 state equivalent 由此可判定字节相等。
 */
export function portabilityBootstrap(rootDir: string): PortabilityBootstrapResult {
  const paths = buildStorePaths(rootDir);
  if (!existsSync(paths.indexPath)) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "store 未初始化（state/truth-index.json 缺失）——portability bootstrap 重建的是既有 canonical state 的 runtime 面",
      "先跑 pomaster init 完成骨架初始化（或 git clone 携带 .pomaster/ 后重试；§84.4 新机器序列：git clone → portability bootstrap → doctor → portability check）",
      { rootDir },
    );
  }
  const runtimeEntries: string[] = [];
  if (!existsSync(paths.runtimeDir)) {
    mkdirSync(paths.runtimeDir, { recursive: true });
    runtimeEntries.push("runtime/producers/");
  }
  if (!existsSync(paths.sessionsDir)) {
    mkdirSync(paths.sessionsDir, { recursive: true });
    runtimeEntries.push("runtime/sessions/");
  }
  if (!existsSync(paths.locksDir)) {
    mkdirSync(paths.locksDir, { recursive: true });
    runtimeEntries.push("runtime/locks/");
  }
  if (!existsSync(paths.heartbeatPath)) {
    executeWrites([
      { path: paths.heartbeatPath, next: "", original: captureOriginal(paths.heartbeatPath) },
    ]);
    runtimeEntries.push("runtime/producers/heartbeat.jsonl");
  }
  const manifestResult = writePortabilityManifestIfMissing(rootDir);
  return {
    rootDir,
    runtimeEntries,
    manifestWritten: manifestResult.written,
    manifestDrift: manifestResult.drift,
    manifest: manifestResult.manifest,
  };
}

// ============================================================
// doctor 探针：portability_runtime_rebuild（P32；四态语义见 CLI 映射）
// ============================================================

export interface PortabilityRuntimeRebuildProbe {
  readonly probe: "portability_runtime_rebuild";
  readonly status: "READY" | "NOT_RUN" | "DRIFTED";
  readonly detail: string;
}

/**
 * runtime 可重建探针（任务四态语义逐字）：
 * - state 侧车在座即可重建 = READY；
 * - runtime 缺失但 state 在 = READY（这正是可重建语义）；
 * - 两者都缺 = NOT_RUN；
 * - manifest 声明与实况矛盾 = DRIFTED（非 canonical，或 manifest 在座而 state 缺席）。
 */
export function probePortabilityRuntimeRebuild(
  rootDir: string,
): PortabilityRuntimeRebuildProbe {
  const paths = buildStorePaths(rootDir);
  const statePresent = existsSync(paths.indexPath);
  const runtimePresent = existsSync(`${paths.pomasterDir}/runtime`);
  let manifest: PortabilityManifest | null = null;
  let manifestCorrupt = false;
  try {
    manifest = readPortabilityManifest(rootDir);
  } catch {
    manifestCorrupt = true;
  }
  if (manifestCorrupt) {
    return {
      probe: "portability_runtime_rebuild",
      status: "DRIFTED",
      detail: "portability-manifest.json 存在但损坏（声明不可解析）——声明与实况矛盾",
    };
  }
  if (manifest !== null) {
    const { findings } = validatePortabilityManifest(manifest);
    if (findings.length > 0) {
      return {
        probe: "portability_runtime_rebuild",
        status: "DRIFTED",
        detail: `manifest 声明与 §85.3 不符（${findings.length} findings: ${findings[0]}${findings.length > 1 ? " …" : ""}）`,
      };
    }
    if (!statePresent) {
      return {
        probe: "portability_runtime_rebuild",
        status: "DRIFTED",
        detail: "manifest 声明可移植但 state 侧车（truth-index）缺席——声明与实况矛盾",
      };
    }
  }
  if (statePresent) {
    return {
      probe: "portability_runtime_rebuild",
      status: "READY",
      detail: runtimePresent
        ? "state 侧车在座 + runtime 面在座（可重建语义成立；runtime 可由 portability bootstrap 重建——§85.4）"
        : "state 侧车在座即可重建（runtime 缺失亦 READY——这正是可重建语义，§85.4；重跑 pomaster portability bootstrap 补齐）",
    };
  }
  return {
    probe: "portability_runtime_rebuild",
    status: "NOT_RUN",
    detail: runtimePresent
      ? "state 侧车缺席（runtime 面残留在座不可作重建源——可重建语义无从判定）"
      : "state 与 runtime 皆缺（无可重建对象；环境性缺席显式呈现，非静默）",
  };
}

// ============================================================
// 可删除测试执行器（§85.4；破坏性操作结构性防线见头注）
// ============================================================

/** 断言 root 含临时标记段（防误删真实 store 的结构性防线）；返回绝对化路径。 */
export function assertDeletabilityFixtureRoot(root: string): string {
  const resolved = resolve(root);
  const segments = resolved.split(/[\\/]+/);
  const marker = DELETABILITY_FIXTURE_MARKERS.find((candidate) =>
    segments.some((segment) => segment.startsWith(candidate)),
  );
  if (marker === undefined) {
    throw new GovernanceError(
      "ENVIRONMENT_ERROR",
      `可删除测试拒绝执行：root 不含临时标记段（防误删真实 store 的结构性防线）: ${resolved}`,
      `只在测试自建的临时 fixture store 内执行 rm -rf；路径须含标记段 ${DELETABILITY_FIXTURE_MARKERS.join(" 或 ")}`,
      { root: resolved, markers: [...DELETABILITY_FIXTURE_MARKERS] },
    );
  }
  return resolved;
}

function stateHashes(rootDir: string): Map<string, string> {
  const paths = buildStorePaths(rootDir);
  const out = new Map<string, string>();
  const walk = (dir: string, rel: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: unknown }).code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const relName = rel.length > 0 ? `${rel}/${entry.name}` : entry.name;
      if (entry.isFile()) {
        out.set(relName, sha256OfUtf8(readFileSync(`${dir}/${entry.name}`, "utf8")));
      } else if (entry.isDirectory()) {
        walk(`${dir}/${entry.name}`, relName);
      }
    }
  };
  walk(paths.stateDir, "");
  return out;
}

export interface DeletabilityTestReport {
  readonly root: string;
  /** rm -rf 执行前 runtime 面在座（确实删过东西，非空跑）。 */
  readonly removedRuntime: boolean;
  /** bootstrap 重建成功（runtime 面恢复在座）。 */
  readonly rebuilt: boolean;
  /** state/ 关键侧车内容哈希集相等（§85.4 state equivalent 判据）。 */
  readonly stateEquivalent: boolean;
  readonly stateFileCount: number;
  /** 不等时的差异键（相等 = 空数组）。 */
  readonly stateDiffs: readonly string[];
  /** 重建后 doctor 四探针全 pass（§85.2 序列 bootstrap → doctor 的机器化）。 */
  readonly doctorOkAfterRebuild: boolean;
  /** 判据取舍注记（报告纪律：判据取舍随报告呈现）。 */
  readonly criterionNote: string;
}

const CRITERION_NOTE =
  "判据取舍：state equivalence = state/ 全部侧车文件内容哈希集逐文件相等" +
  "（truth-index/authority/permits/journal/knowledge-library/equivalence-registry/linkage-coverage/exception-ledger 等）；" +
  "runtime/（heartbeat/sessions/locks）为易变产物允许字节差异、不入判据；truth/、evidence/、executions/ 不在判据内" +
  "（bootstrap 结构性只触碰 .pomaster/runtime 与 portability-manifest.json）；" +
  "bootstrap 零治理事实零 journal 事件（重建非变更，A4）——journal 字节相等由此可判定。";

/**
 * §85.4 可删除测试（rm -rf .pomaster/runtime → bootstrap → state equivalent）：
 * 证明 Runtime 是可重建状态。只允许在临时 fixture store 内执行（结构性防线见
 * assertDeletabilityFixtureRoot）；rm 目标恒为派生路径 <root>/.pomaster/runtime。
 */
export async function runDeletabilityTest(root: string): Promise<DeletabilityTestReport> {
  const resolved = assertDeletabilityFixtureRoot(root);
  const paths = buildStorePaths(resolved);
  if (!existsSync(paths.indexPath)) {
    throw new GovernanceError(
      "NOT_CONFIGURED",
      "可删除测试前提缺失：state/truth-index.json 不存在（先 createStore 初始化 fixture store）",
      "fixture 先 createStore(root) 再 runDeletabilityTest(root)",
      { root: resolved },
    );
  }
  const runtimeRoot = `${paths.pomasterDir}/runtime`;
  const removedRuntime = existsSync(runtimeRoot);
  const before = stateHashes(resolved);
  rmSync(runtimeRoot, { recursive: true, force: true });
  await portabilityBootstrap(resolved);
  const after = stateHashes(resolved);
  const diffs = [
    ...[...before.keys()].filter((key) => after.get(key) !== before.get(key)),
    ...[...after.keys()].filter((key) => !before.has(key)),
  ].sort();
  const store: Store = await createStore(resolved);
  const doctor = await doctorProbes(store);
  return {
    root: resolved,
    removedRuntime,
    rebuilt: existsSync(paths.heartbeatPath) && existsSync(paths.sessionsDir) && existsSync(paths.locksDir),
    stateEquivalent: diffs.length === 0,
    stateFileCount: after.size,
    stateDiffs: diffs,
    doctorOkAfterRebuild: doctor.ok,
    criterionNote: CRITERION_NOTE,
  };
}
