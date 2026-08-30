/**
 * behavioral.harness.ts —— L5 Behavioral Eval 账本门面（契约
 * docs/p9-human-view-and-l5-contract.md §2.2/§2.4，镜像 tests/golden 三件套模式）。
 *
 * 种子账本：./seeds.json（25 注册 / 23 executable / 0 pending / 2 retired——P17-Seeds
 * 处置：F-02/X-01 显式退役，理由落档 retired.reason_md；期望在执行器代码评审前
 * 定稿——契约 §2.7.3 预注册纪律，与 corpus 校准回放互不回填）。
 *
 * 位置史（P17）：执行器纯函数（seeds 装载与结构校验 / 双 evaluator 分派 / 可诊断 diff /
 * 报告汇总）上移至 @pomaster/cli 的 eval 模块（packages/cli/src/eval.ts）——
 * `pomaster eval --suite behavioral`（PRD §44.10）需要在包内 in-process 执行（dist 可加载，
 * 包禁反向依赖 tests/）。本文件保留：仓库路径常量 / 账本常量（floor、覆盖矩阵、pending
 * （现空）/retired（P17-Seeds 处置 F-02/X-01）与翻转注册）/ corpus 谱系对账 loader（读取
 * 仓内 batch-1 校准语料），并 re-export 执行器
 * 面——单一实现，禁两套 runner 漂移；既有导入（behavioral.spec.ts 等）不变。
 *
 * 双 evaluator 分派（契约 §2.4；实现在 @pomaster/cli eval 模块）：
 * 1. cli_keyword —— bench-0002 已批准 provision 的关键词引擎：triageRequest；
 * 2. rule_v0 —— thread-C §3.2/§7 参考镜像：packages/cli/src/triage-rule-v0.ts 的
 *    triageRuleV0（kernel 尚无 triage 面；落地后按 golden.harness 同款「kernel 优先、
 *    回落参考」升级，逐 seed 记录 evaluator 来源）。
 *
 * 纪律（镜像 golden.harness.ts）：
 * - 缺席显式：pendingReason 非空 = pending，不计入 executable；禁静默跳过当通过；
 * - absent_signals 机器断言：cli_keyword 全部 executable seed 强制断言 absent_signals
 *   与 TRIAGE_ABSENT_SIGNALS 八项闭表全等（缺席显式化的机器断言）；
 * - 可诊断 diff：判定失败时 detail 携带「期望 vs 实际路由 + 完整输入/结果 JSON」，
 *   不是裸 assert；
 * - 执行器全为纯函数、零墙钟、零 IO（不 spawn CLI dist、不读 MASTer 仓）——同输入
 *   字节级同报告（GOLDEN-L8-1 判据同款）；corpus 对账 loader 独立于执行器纯函数。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BEHAVIORAL_SEEDS_PATH } from "@pomaster/cli";

// —— 执行器面 re-export（本体在 @pomaster/cli eval 模块；P17 位置迁移，导入面不变） ——
export {
  BEHAVIORAL_SEEDS_PATH,
  L5_EVALUATORS,
  L5_FAMILIES,
  checkCliKeywordResult,
  checkRuleV0Decision,
  loadSeeds,
  reportIsConsistent,
  runAllSeeds,
  runSeed,
} from "@pomaster/cli";
export type {
  BehavioralReport,
  BehavioralSeed,
  BehavioralSeedResult,
  CliKeywordExpect,
  DesignExpected,
  L5Evaluator,
  L5Family,
  ReplayAnchoredRequest,
  RuleV0Expect,
  SeedExpect,
  SeedInput,
  SeedProvenance,
  SeedRequest,
  SeedRunStatus,
} from "@pomaster/cli";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(THIS_DIR, "..", "..");
/** seeds.json 仓库路径（= @pomaster/cli eval 模块缺省定位；单一事实源在包内，此处别名导出）。 */
export const SEEDS_PATH = BEHAVIORAL_SEEDS_PATH;
export const CALIBRATION_DIR = join(REPO_ROOT, "corpus", "master", "batch-1", "calibration");

/** 契约 §2.8.1：executable seeds 下限（fail-below-floor——不足即红）。 */
export const EXECUTABLE_SEED_FLOOR = 15;
/** 契约 §2.5 覆盖矩阵：七族 executable 承诺。C 族 executable=4：T-1 已批准生效（裁决2/bench-0003），
 * 契约 §2.7.2 翻转即验收——原 pending C-04 解除 pending，C-01 期望翻转为 STANDARD（flipped_from 记录翻转前状态）。 */
export const CONTRACT_FAMILY_EXECUTABLE: Readonly<Record<string, number>> = {
  A: 4,
  B: 6,
  C: 4,
  D: 2,
  E: 4,
  F: 1,
  G: 2,
};
/** 契约 §2.4/§2.5：X 族 = capability 路由追加 seed（注册于 F 族之后，不占 executable 分母）。
 * P17-Seeds 处置：原 pending 登记 → 显式退役（capability router 未实现，理由落档 seeds.json
 * retired.reason_md）；capability router 落地时以新 seed 重新登记，本 id 保留退役谱系。 */
export const CAPABILITY_RETIRED_SEED_ID = "L5-X-01-capability-router-no-architect-pending";
/** P17-Seeds 处置后的 pending 稳定 id 集（现空——F-02/X-01 已显式退役，见 RETIRED_SEED_IDS）。 */
export const PENDING_SEED_IDS: readonly string[] = [];
/** P17-Seeds 显式退役的稳定 id（retired.reason_md 落档退役判据；不计 executable/pending）。 */
export const RETIRED_SEED_IDS = [
  "L5-F-02-churn-cluster-escalation-pending",
  CAPABILITY_RETIRED_SEED_ID,
] as const;
/** 已翻转 seed 的稳定 id（flipped_from 非空；T-1 翻转对 C-01+C-04，authority=裁决2/bench-0003/commit ed947cf）。 */
export const FLIPPED_SEED_IDS = [
  "L5-C-01-replay-R2-008-t1-boundary-anchor",
  "L5-C-04-replay-R2-008-t1-flip-acceptance",
] as const;

// ============================================================
// corpus 谱系对账 loader（独立于执行器纯函数；读取仓内 batch-1 校准语料）
// ============================================================

export interface ReplayRecord {
  readonly replay_id: string;
  readonly title: string;
  readonly expected_profile: string;
  readonly expected_class: string;
  readonly agreement: string;
  readonly actual: {
    readonly profile: string;
    readonly matched_rule: string;
    readonly evidence_grade: string;
    readonly matched_keywords: readonly string[];
  };
}

interface ReplayResultsFile {
  readonly records?: readonly ReplayRecord[];
}

/** replay-results.json 逐记录（期望锚：回归锚的 actual 以此为准，契约 §2.6）。 */
export function loadReplayRecords(): readonly ReplayRecord[] {
  const raw: unknown = JSON.parse(
    readFileSync(join(CALIBRATION_DIR, "replay-results.json"), "utf8"),
  );
  const file = raw as ReplayResultsFile;
  if (!Array.isArray(file.records)) {
    throw new Error("replay-results.json 形态非法：缺 records 数组");
  }
  return file.records;
}

export interface SampleEntry {
  readonly replay_id: string;
  readonly title: string;
  readonly expected_profile: string;
  readonly expected_class: string;
  readonly source_task_dir: string;
}

interface SamplesFile {
  readonly samples?: readonly SampleEntry[];
}

/** samples.json 逐样本（逐字转录纪律与预注册期望的事实源，契约 §2.6）。 */
export function loadSampleEntries(): readonly SampleEntry[] {
  const raw: unknown = JSON.parse(
    readFileSync(join(CALIBRATION_DIR, "samples.json"), "utf8"),
  );
  const file = raw as SamplesFile;
  if (!Array.isArray(file.samples)) {
    throw new Error("samples.json 形态非法：缺 samples 数组");
  }
  return file.samples;
}

interface ProposedThresholdsFile {
  readonly replay_evidence_base?: {
    readonly results_sha256?: string;
  };
}

/**
 * 现盘 replay-results.json 的 sha256 与 proposed-thresholds.json pin 比对
 * （契约 §2.6：results_sha256 pin；对账本砖测试所锚语料即校准回放批准时的字节集）。
 */
export function replayResultsSha256MatchesPin(): {
  actual: string;
  pin: string;
  match: boolean;
} {
  const bytes = readFileSync(join(CALIBRATION_DIR, "replay-results.json"));
  const actual = createHash("sha256").update(bytes).digest("hex");
  const raw: unknown = JSON.parse(
    readFileSync(join(CALIBRATION_DIR, "proposed-thresholds.json"), "utf8"),
  );
  const pin = String(
    (raw as ProposedThresholdsFile).replay_evidence_base?.results_sha256 ?? "",
  );
  return { actual, pin, match: actual === pin && pin.length > 0 };
}
