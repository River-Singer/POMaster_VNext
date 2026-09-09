/**
 * behavioral.harness.ts —— L5 Behavioral Eval 账本门面（契约
 * docs/p9-human-view-and-l5-contract.md §2.2/§2.4，镜像 tests/golden 三件套模式）。
 *
 * 种子账本：./seeds.json（33 注册 / 33 executable / 0 pending / 0 retired——裁决 19③
 * 语料换源重建：全部 seed 测活着的能力，可执行前置均成立；缺席以「不登记」表达，
 * 禁 pending 滞留；旧语料两条 retired seed（F-02/X-01）随 TRIAGE 语料整体退役，
 * 谱系见 git 历史与裁决 19③ 台账）。
 *
 * 位置史（P17）：执行器纯函数（seeds 装载与结构校验 / evaluator 分派 / 可诊断 diff /
 * 报告汇总）上移至 @pomaster/cli 的 eval 模块（packages/cli/src/eval.ts）——
 * `pomaster eval --suite behavioral`（PRD §44.10）需要在包内 in-process 执行（dist 可加载，
 * 包禁反向依赖 tests/）。本文件保留：仓库路径常量与账本常量（floor、覆盖矩阵、翻转
 * 注册），并 re-export 执行器面——单一实现，禁两套 runner 漂移；既有导入
 * （behavioral.spec.ts 等）不变。
 *
 * evaluator 分派（契约 §2.4；实现在 @pomaster/cli eval 模块；裁决 19③ 换源）：
 * 1. question_gate —— @pomaster/kernel evaluateQuestionGate（七关 verdict 判定）；
 * 2. next_action —— @pomaster/cli evaluateNextAction（八拍路由矩阵表驱动首中即停）。
 * 原双 evaluator 交叉对账机制（cli_keyword vs rule_v0 同语义双实现互证）无存活对应物，
 * 随 TRIAGE 引擎退役删除（裁决 19③）。
 *
 * 纪律（镜像 golden.harness.ts）：
 * - 缺席显式：pendingReason 非空 = pending，不计入 executable；禁静默跳过当通过；
 * - 可诊断 diff：判定失败时 detail 携带「期望 vs 实际判定 + 完整输入/结果 JSON」，
 *   不是裸 assert；
 * - 执行器全为纯函数、零墙钟、零 IO（不 spawn CLI dist）——同输入字节级同报告
 *   （GOLDEN-L8-1 判据同款）。
 */
// —— 执行器面 re-export（本体在 @pomaster/cli eval 模块；P17 位置迁移，导入面不变） ——
export {
  BEHAVIORAL_SEEDS_PATH,
  L5_EVALUATORS,
  L5_FAMILIES,
  checkNextActionResult,
  checkQuestionGateResult,
  loadSeeds,
  reportIsConsistent,
  runAllSeeds,
  runSeed,
} from "@pomaster/cli";
export type {
  BehavioralReport,
  BehavioralSeed,
  BehavioralSeedResult,
  DesignExpected,
  L5Evaluator,
  L5Family,
  NextActionExpect,
  QuestionGateExpect,
  SeedExpect,
  SeedInput,
  SeedProvenance,
  SeedRunStatus,
} from "@pomaster/cli";

/** 契约 §2.8.1：executable seeds 下限（fail-below-floor——不足即红）。
 * 裁决 19③ 语料换源重定：新分母 = 换源账本 33 条 executable（逐项可溯源——
 * 见 seeds.json fact_sources 与各 seed provenance；tests/ratchet/floor.json ledger
 * L5 floor 同锚重定）。 */
export const EXECUTABLE_SEED_FLOOR = 33;
/** 契约 §2.5 覆盖矩阵：七族 executable 承诺（裁决 19③ 换源矩阵——全部可执行，
 * 缺席以不登记表达）。族语义：
 * A 七关上游命中（Q1..Q5 逐关 + 行序多命中不变量）/ B 处置面（RESEARCHABLE/
 * DEFERABLE/ASSUMPTION 升级与回落）/ C 可问类与矛盾拒绝（ASK_HUMAN/ASK_REJECTED）/
 * D 申报对账信号（declaredConsistent 双向 + 边界面）/ E 八拍路由 0-② 拍行 /
 * F 八拍路由 ③-⑥ 拍行 / G 路由优先级与兜底（首中即停/R_UNDETERMINED/不可判跳过）。 */
export const CONTRACT_FAMILY_EXECUTABLE: Readonly<Record<string, number>> = {
  A: 6,
  B: 4,
  C: 4,
  D: 4,
  E: 6,
  F: 5,
  G: 4,
};
/** P17-Seeds 处置形态的 pending 稳定 id 集（换源账本现空——缺席以不登记表达）。 */
export const PENDING_SEED_IDS: readonly string[] = [];
/** P17-Seeds 处置形态的显式退役稳定 id 集（旧语料 F-02/X-01 已随 TRIAGE 语料换源
 * 整体退役——裁决 19③；本账本零 retired 行）。 */
export const RETIRED_SEED_IDS: readonly string[] = [];
/** 已翻转 seed 的稳定 id 集（flipped_from 非空；换源账本现无翻转——翻转注册机制
 * 保留待新信号/阈值落地时启用，契约 §2.7.2）。 */
export const FLIPPED_SEED_IDS: readonly string[] = [];
