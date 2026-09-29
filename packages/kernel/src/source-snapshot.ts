/**
 * source-snapshot.ts —— FR-05 源码证据新鲜度合同与唯一比较核（W2 切片；研究定案
 * evidence-scenarios-and-boundaries §4「四种新鲜度不可混为一谈」+ 最小捕获合同建议）。
 *
 * 职责：给一条证据（GRN run）声明「它观察了哪一版相关代码」的可比基线，并给全消费
 * 链（运行窗口 / 复用资格 / 终验 cohort / closeout / record verification）提供**唯一**
 * 比较器——禁第二比较器（同源纪律：所有消费者复用 compareSourceSnapshots，判定词形
 * 三态闭包复用 recon-scope-review 的 fresh/stale/unjudgeable 词族，零新词）。纯函数
 * 核：零 fs、零墙钟（evidence-qualification.ts 同款纪律），同输入 → 同输出字节稳定。
 *
 * ═══ 捕获合同（最小捕获合同；producer 前采样，消费链零反填）═══
 * - 工具启动前捕获：HEAD 出处锚（rev-parse；无 Git/失败 → null 显式）+ **显式**
 *   relevant_paths（分母由调用方装配：任务授权变更面 + 共享依赖/配置；声明外变化
 *   零影响——零目录扫描、零扩展名白名单，CSS/SQL/后端源码一律由声明进入分母）+
 *   内容/存在性摘要（声明路径缺席 = SOURCE_PATH_ABSENT_DIGEST 常量——创建/删除/
 *   重命名/untracked 在声明路径上即时漂移可见）+ 读取失败清单（非空 = unjudgeable
 *   候选，禁静默当 fresh）；执行后再捕获同一面。
 * - baseline_inputs 不是源码快照，不能混用（09-27 PRD）：baseline_inputs={at_seq,
 *   digests} 覆盖 .pomaster 确认资产（seq 锚定）；本合同覆盖声明源码面（内容锚定）
 * ——两条平行证据线，各自消费链独立。
 *
 * ═══ 比较语义（三态；诚实边界）═══
 * - fresh：相关面逐路径摘要相等。HEAD 只作出处锚——HEAD 移位但相关内容逐字节相同
 *   = fresh（head_changed 显式可见，不冒充 stale；相关内容未变的 dirty tree 合格）。
 * - stale：任一声明路径摘要变化 / 声明面增删（drift 词形 source_files_added /
 *   source_files_removed / source_content_changed，recon-scope-review 同族词）。
 *   相同 HEAD 下相关 dirty bytes 变化可见；删除/新增/重命名/untracked 计入。
 * - unjudgeable：任一侧 read_failures 非空（读失败/相关面不可判 ≠ fresh——非绿不
 *   假绿；缺失/不可判与确实过期分开呈现）。
 * - **端点相等 ≠ 无 A→B→A**：前后双采样只能证明端点相同；final-stable 保证需稳定
 *   checkout/编排写入窗口（W2.3 evidence_purpose + 终验消费闸），合同文字与测试
 *   断言均不夸大双采样（fresh reason 显式携带该边界）。
 *
 * ═══ 运行窗口载体（RunSourceSnapshot）═══
 * before/after 双捕获 + window 落账判定。window 由 producer 经唯一比较核计算落账；
 * assertRunSourceSnapshot 以「重算全等」强校验（禁手改窗口冒充 fresh——「不另写第
 * 二比较器」的强形式）。消费语义：window≠fresh 的证据保留真实工具 verdict（不自动
 * 改判），但不证明稳定终态——复用/终验不得消费（消费者闸归 CLI 装配面）。
 *
 * ═══ legacy 矩阵（诚实缺席）═══
 * 旧记录无 source_snapshot = 「未主张源码新鲜度」，不补写当前 hash 冒充历史、不
 * 反填、不全局硬拒绝（既有资格行为零改动）；旧 Evidence 不声称已获得新增源码保证。
 * 键缺席 = 存量字节兼容（execution_id/artifact_refs 同款惯例）。
 *
 * 词形闭包（kernel 局部词 TODO(vocab-pr)；SP 提案待追认）：contract 词形
 * pomaster.source-snapshot/v1（recon-import-snapshot/v1 同族）；三态复用
 * recon-scope-review fresh/stale/unjudgeable；drift 三词形同族复用。
 */
import { GovernanceError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";

/** source snapshot 合同词形（版本化；消费方按 contract 字段拒绝不支持形态）。 */
export const SOURCE_SNAPSHOT_CONTRACT = "pomaster.source-snapshot/v1" as const;

/**
 * 存在性摘要常量：声明相关路径在捕获时点不存在（untracked 新增/删除/重命名的确定性
 * 投影——路径落盘内容后摘要即变，漂移可见；词形与其余 digest 同一 sha256 词形）。
 */
export const SOURCE_PATH_ABSENT_DIGEST = sha256OfCanonical("pomaster.source-snapshot/absent-path/v1");

/** 新鲜度三态词形闭包（recon-scope-review 三态词族复用，零新词）。 */
export const SOURCE_FRESHNESS_STATES = ["fresh", "stale", "unjudgeable"] as const;
export type SourceFreshnessState = (typeof SOURCE_FRESHNESS_STATES)[number];

/** 漂移机器词形（recon-scope-review 同族词复用；reason 携带点名路径）。 */
export const SOURCE_DRIFT_WORDS = [
  "source_files_added",
  "source_files_removed",
  "source_content_changed",
] as const;
export type SourceDriftWord = (typeof SOURCE_DRIFT_WORDS)[number];

/** 一次相关源码面捕获（producer 前采样；fail-closed 校验见 assertEvidenceSourceSnapshot）。 */
export interface EvidenceSourceSnapshot {
  readonly contract: typeof SOURCE_SNAPSHOT_CONTRACT;
  /** HEAD 出处锚（rev-parse 全 sha）；null = 无 Git/锚不可判——锚缺席显式，不阻断内容比较。 */
  readonly head: string | null;
  /** 显式相关面（升序去重；分母 = 调用方装配的授权/审阅面 + 共享依赖/配置）。 */
  readonly relevant_paths: readonly string[];
  /** 内容/存在性摘要（path → sha256:<hex>；键集 ≡ relevant_paths；缺席路径 = SOURCE_PATH_ABSENT_DIGEST）。 */
  readonly digests: Readonly<Record<string, string>>;
  /** 读取失败清单（非空 = unjudgeable 候选；禁静默当 fresh）。 */
  readonly read_failures: readonly string[];
}

/** 一次比较输出（全消费链共享词形；reason 人类可读且确定性）。 */
export interface SourceSnapshotComparison {
  readonly state: SourceFreshnessState;
  /** 漂移机器词形（fresh = 空集；出现序固定 added→removed→content，确定性）。 */
  readonly drift: readonly SourceDriftWord[];
  /** HEAD 出处锚移位（可见性位；不参与 state 判定——HEAD 只作出处锚）。 */
  readonly head_changed: boolean;
  readonly reason: string;
}

/** 运行窗口双采样载体（GRN run 信封 source_snapshot 键；producer 前采样+落账判定）。 */
export interface RunSourceSnapshot {
  /** 工具启动前捕获（producer 前采样；消费链零反填）。 */
  readonly before: EvidenceSourceSnapshot;
  /** 执行完成后对同一面再捕获。 */
  readonly after: EvidenceSourceSnapshot;
  /** 运行窗口判定（= compareSourceSnapshots(before, after)；assert 重算全等强校验）。 */
  readonly window: SourceSnapshotComparison;
}

/**
 * 证据用途词形闭包（W2-FR11 Case D 归属；kernel 局部词 TODO(vocab-pr)；SP 提案待追认）。
 * run 信封 evidence_purpose 键声明该证据的验证用途：worker_local = worker 本域中间证据
 * （append-only 保留在盘，终验 cohort 不消费——worker 中间态不冒充最终 Gate）；
 * final_stable = 编排器等待并行写入结束后在稳定窗口启动的终验证据（终验消费面）。
 * 缺席（legacy/未声明）不冒充任一用途——消费面沿既有行为，不全局硬拒绝。
 */
export const EVIDENCE_PURPOSE_VALUES = ["worker_local", "final_stable"] as const;
export type EvidencePurposeValue = (typeof EVIDENCE_PURPOSE_VALUES)[number];

// ============================================================
// fail-closed 校验（SCHEMA_INVALID；禁畸形输入放行）
// ============================================================

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function schemaInvalid(message: string, hint: string): GovernanceError {
  return new GovernanceError("SCHEMA_INVALID", message, hint);
}

/**
 * source snapshot 合同校验（fail-closed）：contract 词形、HEAD 词形、相关面升序去重、
 * digest 键集 ≡ 相关面（捕获「同一面」的结构不变量）、digest sha256 词形、读取失败
 * 词形。空相关面拒绝——空面快照是「vacuously fresh」假绿通道（调用方不声明分母就
 * 不许主张源码新鲜度：无快照 = 诚实缺席，有快照必须有非空分母）。
 */
export function assertEvidenceSourceSnapshot(value: unknown): asserts value is EvidenceSourceSnapshot {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw schemaInvalid("source snapshot 须为对象", "Restore the original captured snapshot.");
  }
  const snapshot = value as Record<string, unknown>;
  if (snapshot.contract !== SOURCE_SNAPSHOT_CONTRACT) {
    throw schemaInvalid(
      `source snapshot contract = ${String(snapshot.contract)} 不受支持（须 ${SOURCE_SNAPSHOT_CONTRACT}）`,
      "Restore the original captured snapshot; 合同版本化，禁跨版本冒充。",
    );
  }
  if (snapshot.head !== null && (typeof snapshot.head !== "string" || snapshot.head.trim().length === 0)) {
    throw schemaInvalid("source snapshot.head 须为非空字符串或 null（锚缺席显式）", "Restore the original captured snapshot.");
  }
  if (!Array.isArray(snapshot.relevant_paths) || snapshot.relevant_paths.length === 0) {
    throw schemaInvalid(
      "source snapshot.relevant_paths 须为非空数组（空相关面 = vacuously fresh 假绿通道，拒收）",
      "Declare the relevant surface explicitly (task change surface + shared config) or omit the snapshot.",
    );
  }
  const paths = snapshot.relevant_paths as unknown[];
  for (const path of paths) {
    if (typeof path !== "string" || path.trim().length === 0) {
      throw schemaInvalid("source snapshot.relevant_paths 须为非空字符串数组", "Restore the original captured snapshot.");
    }
  }
  for (let index = 1; index < paths.length; index += 1) {
    if (String(paths[index]) <= String(paths[index - 1])) {
      throw schemaInvalid(
        "source snapshot.relevant_paths 须升序去重（确定性字节稳定；捕获端排序）",
        "Restore the original captured snapshot.",
      );
    }
  }
  if (snapshot.digests === null || typeof snapshot.digests !== "object" || Array.isArray(snapshot.digests)) {
    throw schemaInvalid("source snapshot.digests 须为对象", "Restore the original captured snapshot.");
  }
  const digests = snapshot.digests as Record<string, unknown>;
  const digestKeys = Object.keys(digests);
  if (digestKeys.length !== paths.length || digestKeys.some((key, index) => key !== paths[index])) {
    throw schemaInvalid(
      "source snapshot.digests 键集须 ≡ relevant_paths（升序全等——「执行后捕获同一面」的结构不变量）",
      "Restore the original captured snapshot.",
    );
  }
  for (const digest of Object.values(digests)) {
    if (typeof digest !== "string" || !SHA256_DIGEST_PATTERN.test(digest)) {
      throw schemaInvalid("source snapshot digest 词形非法（须 sha256:<64hex>）", "Restore the original captured snapshot.");
    }
  }
  if (!Array.isArray(snapshot.read_failures) ||
      snapshot.read_failures.some((entry) => typeof entry !== "string" || (entry as string).trim().length === 0)) {
    throw schemaInvalid("source snapshot.read_failures 须为非空字符串数组（空数组合法——全量可读）", "Restore the original captured snapshot.");
  }
}

/**
 * 运行窗口载体校验（fail-closed）：before/after 合同校验 + window 词形校验 +
 * **重算全等强校验**——window 必须逐字段等于 compareSourceSnapshots(before, after)
 * （唯一比较核落账；手改窗口冒充 fresh 在此 SCHEMA_INVALID 拒收）。
 */
export function assertRunSourceSnapshot(value: unknown): asserts value is RunSourceSnapshot {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw schemaInvalid("run source_snapshot 须为对象", "Restore the original captured snapshot.");
  }
  const run = value as Record<string, unknown>;
  if (run.before === undefined || run.after === undefined || run.window === undefined) {
    throw schemaInvalid("run source_snapshot 须含 before/after/window 三键", "Restore the original captured snapshot.");
  }
  assertEvidenceSourceSnapshot(run.before);
  assertEvidenceSourceSnapshot(run.after);
  const window = run.window as Record<string, unknown>;
  if (window === null || typeof window !== "object" || Array.isArray(window)) {
    throw schemaInvalid("run source_snapshot.window 须为对象", "Restore the original captured snapshot.");
  }
  if (!(SOURCE_FRESHNESS_STATES as readonly string[]).includes(String(window.state))) {
    throw schemaInvalid(
      `run source_snapshot.window.state = ${String(window.state)} 不在三态词形闭包（${SOURCE_FRESHNESS_STATES.join("/")}）`,
      "三态词形复用 recon-scope-review 词族；词形外值走词汇表 PR。",
    );
  }
  if (!Array.isArray(window.drift) || window.drift.some((word) => !(SOURCE_DRIFT_WORDS as readonly string[]).includes(String(word)))) {
    throw schemaInvalid(
      `run source_snapshot.window.drift 词形非法（闭包：${SOURCE_DRIFT_WORDS.join("/")}；fresh = 空数组）`,
      "drift 词形复用 recon-scope-review 同族词；restore the original captured snapshot.",
    );
  }
  if (typeof window.head_changed !== "boolean") {
    throw schemaInvalid("run source_snapshot.window.head_changed 须为 boolean", "Restore the original captured snapshot.");
  }
  if (typeof window.reason !== "string" || window.reason.trim().length === 0) {
    throw schemaInvalid("run source_snapshot.window.reason 须为非空字符串", "Restore the original captured snapshot.");
  }
  const recomputed = compareSourceSnapshots(run.before, run.after);
  if (sha256OfCanonical(recomputed) !== sha256OfCanonical(window)) {
    throw schemaInvalid(
      "run source_snapshot.window 与 compareSourceSnapshots(before, after) 重算值不一致（窗口判定单源强校验——禁手改窗口冒充 fresh/stale）",
      "Recompute via the single comparator or re-produce the evidence; 判定可复核非可篡改。",
    );
  }
}

// ============================================================
// 唯一比较核（三态；确定性；全消费链单源）
// ============================================================

/**
 * 唯一 source 比较核：before/after 双快照 → 三态判定。语义见头注；输出确定性
 * （drift 词形序固定、reason 由输入决定）——同输入重放字节稳定（A4 同源纪律）。
 */
export function compareSourceSnapshots(
  before: EvidenceSourceSnapshot,
  after: EvidenceSourceSnapshot,
): SourceSnapshotComparison {
  assertEvidenceSourceSnapshot(before);
  assertEvidenceSourceSnapshot(after);
  const headChanged = before.head !== after.head;
  const headNote = headChanged
    ? `（head 出处锚移位：${before.head ?? "null"} → ${after.head ?? "null"}；HEAD 只作出处锚，内容判定为准）`
    : "";
  const failures = [...before.read_failures, ...after.read_failures];
  if (failures.length > 0) {
    return {
      state: "unjudgeable",
      drift: [],
      head_changed: headChanged,
      reason: `相关面读取失败——source 未知不能 fresh：${failures.join("; ")}${headNote}`,
    };
  }
  const beforePaths = new Set(before.relevant_paths);
  const afterPaths = new Set(after.relevant_paths);
  const added = after.relevant_paths.filter((path) => !beforePaths.has(path));
  const removed = before.relevant_paths.filter((path) => !afterPaths.has(path));
  const changed = before.relevant_paths
    .filter((path) => afterPaths.has(path) && before.digests[path] !== after.digests[path]);
  const drift: SourceDriftWord[] = [];
  const details: string[] = [];
  if (added.length > 0) {
    drift.push("source_files_added");
    details.push(`source_files_added: ${added.join(", ")}`);
  }
  if (removed.length > 0) {
    drift.push("source_files_removed");
    details.push(`source_files_removed: ${removed.join(", ")}`);
  }
  if (changed.length > 0) {
    drift.push("source_content_changed");
    details.push(`source_content_changed: ${changed.join(", ")}`);
  }
  if (drift.length === 0) {
    return {
      state: "fresh",
      drift: [],
      head_changed: headChanged,
      reason: `相关源码面逐路径摘要相等（端点相等 ≠ 无运行中 A→B→A——双采样边界，final-stable 保证归稳定 checkout/编排写入窗口）${headNote}`,
    };
  }
  return {
    state: "stale",
    drift,
    head_changed: headChanged,
    reason: `相关源码面漂移：${details.join("；")}${headNote}`,
  };
}
