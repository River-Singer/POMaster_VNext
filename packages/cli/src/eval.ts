/**
 * eval.ts —— `pomaster eval --suite behavioral`：Agent Behavioral Eval 命令面
 * （PRD §44.10）+ 数据驱动执行器本体。
 *
 * 位置史（P17）：执行器纯函数（seeds 装载与结构校验 / evaluator 分派 /
 * 可诊断 diff / 报告汇总）原居 tests/behavioral/behavioral.harness.ts；eval 命令需要
 * 在包内 in-process 执行（dist 可加载，包禁反向依赖 tests/），故上移至本模块。
 * tests/behavioral/behavioral.harness.ts 保留账本常量，并 re-export 本模块执行器
 * 面——单一实现，禁两套 runner 漂移。
 *
 * 语料换源重建（裁决 19③，Owner 2026-09-09，owner-adjudications.md#裁决19）：
 * 原 cli_keyword / rule_v0 双 evaluator 测的是已退役 TRIAGE 引擎（测试面 zombie，
 * 违反语义删除宪法）——引擎已物理删除（triage.ts/triage-rule-v0.ts 不复存在），
 * 语料换源为**活着的能力**两个评估器形态：
 * 1. question_gate —— @pomaster/kernel evaluateQuestionGate（八拍① Brainstorm/
 *    Question Gate 七关 verdict 判定，PRD §80.4 逐字语义 + 裁决 11⑨ ASSUMPTION
 *    第六处置词形；产品消费面 = `pomaster brainstorm question-gate`）；
 * 2. next_action —— 本包 evaluateNextAction（八拍路由矩阵，NEXT_ACTION_ROUTE_TABLE
 *    表驱动首中即停；产品消费面 = status/session/alerts 三通道共享）。
 * 双 evaluator 交叉对账机制（cli_keyword vs rule_v0 同语义双实现互证）无存活对应物，
 * 随退役一并删除——两新 evaluator 是**不同能力**的各自判定面，非同一语义双源。
 *
 * fail-closed 纪律（换源重建后全部保持）：
 * - --suite 词表闭包（EVAL_SUITES）外显式拒绝（EVAL_SUITE_UNKNOWN，词表呈现于 hint）；
 * - executable seed 任何失败 → ok=false exit 1（EVAL_EXECUTABLE_FAILED）；
 * - pending seed 显式缺席呈现（报告 pendingList 逐条 + 人读行）——不冒充绿、也不计失败；
 * - retired seed 显式退役呈现（报告 retiredList 逐条 + 人读行）——不计 executable、
 *   不计 pending、不执行判定；retired 与 pendingReason/expect_flip_when 互斥由结构
 *   校验 fail-closed（缺席显式第三态，禁静默 pending 滞留）；
 * - seeds 缺失/坏形显式报错（SEEDS_NOT_AVAILABLE / SEEDS_INVALID），禁静默空跑；
 * - yaml 载物显式拒绝并指路（P19-EvalCarrier 消费面裁定）：判卷消费面恒为
 *   seeds.json——仓库纪律不引 YAML 运行时依赖；
 * - 报告自洽守卫（EVAL_REPORT_INCONSISTENT）——执行器自身被改坏时拒绝判卷。
 * 幂等：纯函数 + 零墙钟——同 seeds 字节级同报告（GOLDEN-L8-1 判据同款）。
 *
 * x-vocab-source: vocab-lock presentation_axes.eval_suites（PR-0009 收编；suite 词形
 * behavioral 词源 PRD §44.10/§94）；question_gate 词形 = vocab-lock question_gate_vocab
 * 段（verdict 六值/七关 id 为 kernel 局部词锁登记）；next_action 路由 id = 本包
 * NEXT_ACTION_ROUTE_IDS 局部词。词表扩容须同步 tests/behavioral/trigger-manifest.json suites。
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  evaluateQuestionGate,
  type QuestionGateInput,
  type QuestionGateOutcome,
} from "@pomaster/kernel";
import { evaluateNextAction, type NextAction, type NextActionSnapshot } from "./next-action.js";

// ============================================================
// suite 词表（闭包；词表外显式拒绝）
// ============================================================

/** eval suite 闭包词表（--suite 校验分母；扩容须同步 trigger-manifest.json suites）。 */
export const EVAL_SUITES = ["behavioral"] as const;
export type EvalSuite = (typeof EVAL_SUITES)[number];

/** seeds.json 缺省定位（src 与 dist 同构：packages/cli/{src,dist}/eval.js → 仓库根 tests/）。 */
export const BEHAVIORAL_SEEDS_PATH = fileURLToPath(
  new URL("../../../tests/behavioral/seeds.json", import.meta.url),
);

// ============================================================
// 种子形态（seeds.json，契约 §2.3；语料换源重建——裁决 19③）
// ============================================================

/** 覆盖矩阵族号（契约 §2.5 七族；裁决 19③ 换源后 X 追加族随之退役——七族闭包）。 */
export const L5_FAMILIES = ["A", "B", "C", "D", "E", "F", "G"] as const;
export type L5Family = (typeof L5_FAMILIES)[number];
/** 判定执行器词表（裁决 19③ 换源：question_gate / next_action 两形态）。 */
export const L5_EVALUATORS = ["question_gate", "next_action"] as const;
export type L5Evaluator = (typeof L5_EVALUATORS)[number];

export interface SeedProvenance {
  /** 事实源路径（仓库内相对路径；全部 seed 必填非空——契约 §2.8.3）。 */
  readonly corpus: string;
  /** 登记文件键路径 / 章节锚（可选，谱系辅锚）。 */
  readonly anchor?: string;
  /** MASTer 源任务目录（源标识符，非墙钟字段；可选）。 */
  readonly source_task_dir?: string;
  readonly note_md: string;
}

/** question_gate 断言集（契约 §2.4：verdict 六值/stoppedAtGate/mayAskHuman/declaredConsistent）。 */
export interface QuestionGateExpect {
  readonly verdict?: string;
  readonly mayAskHuman?: boolean;
  readonly stoppedAtGate?: string | null;
  readonly declaredConsistent?: boolean;
}

/** next_action 断言集（契约 §2.4：route_id/beat/command 逐字与包含）。 */
export interface NextActionExpect {
  readonly route_id?: string;
  readonly beat?: string | null;
  readonly commandContains?: readonly string[];
  readonly commandEquals?: string | null;
}

export type SeedExpect = QuestionGateExpect | NextActionExpect;

/** evaluator 专属输入（裁决 19③ 换源两形态分派——按 evaluator 二选一，缺席显式）。 */
export interface SeedInput {
  /** question_gate 型：kernel QuestionGateInput（category 申报分类 + answerable 七键 + 可选 assumption）。 */
  readonly gate?: QuestionGateInput;
  /** next_action 型：NextActionSnapshot 全字段显式快照（禁部分快照冒充全量）。 */
  readonly snapshot?: NextActionSnapshot;
}

/** 设计期望档元数据（契约 §2.7.1：已知偏离样本钉实际值，设计期望记入元数据——
 * 翻转即验收测试的对照位；裁决 19③ 换源后现账本无偏离样本，恒 null）。 */
export interface DesignExpected {
  readonly expected_profile: string;
  readonly expected_class: string;
}

export interface BehavioralSeed {
  readonly id: string;
  readonly family: L5Family;
  readonly title: string;
  readonly evaluator: L5Evaluator;
  readonly provenance: SeedProvenance;
  readonly input: SeedInput;
  readonly expect: SeedExpect;
  readonly design_expected: DesignExpected | null;
  /** 翻转前状态（契约 §2.7.2 翻转即验收）：词形 = 翻转前回归锚值；null = 未翻转。 */
  readonly flipped_from?: string | null;
  /** 翻转注册（契约 §2.7.2）：非空 = 本 seed 期望在所述信号/阈值落地时翻转（翻转即验收测试）。 */
  readonly expect_flip_when: string | null;
  /** 非空 = pending，不计入 executable（缺席显式，禁静默跳过）。 */
  readonly pendingReason: string | null;
  /** 非空 = 显式退役（P17-Seeds 处置形态）：登记与谱系保留、执行与翻转路径关闭——
   * 不计 executable、不计 pending、不执行判定；与 pendingReason、expect_flip_when 互斥。 */
  readonly retired?: { readonly reason_md: string } | null;
}

interface SeedsFile {
  readonly suite?: string;
  readonly batch_code?: string;
  readonly seeds?: readonly BehavioralSeed[];
}

/** 七关 answerable 键（结构校验分母——镜像 kernel QuestionGateAnswerable 键集）。 */
const GATE_ANSWERABLE_KEYS = [
  "q1_current_truth",
  "q2_existing_docs",
  "q3_repo_code",
  "q4_existing_evidence",
  "q5_knowledge_default",
  "q6_research",
  "q7_blocking_increment",
] as const;

export function loadSeeds(seedsPath: string = BEHAVIORAL_SEEDS_PATH): {
  suite: string;
  batchCode: string;
  seeds: readonly BehavioralSeed[];
} {
  // 载物消费面裁定（P19-EvalCarrier）：eval 命令消费面 = seeds.json（契约 §2.2 落点，
  // 预注册账本）；PRD §94.2 yaml 载物（tests/behavioral/eval-cases.yaml）是登记形态，
  // 由 tests/behavioral/eval-carrier.spec.ts 消费（schema 校验 + 与 json 同构锚定）。
  // 仓库纪律不引 YAML 运行时依赖（kernel catalog.ts/digest.ts 同款注记）——此处显式
  // 拒绝并指路，不伪装成 JSON.parse 的坏形报错（fail-closed 错误信息诚实性）。
  const lower = seedsPath.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    throw new Error(
      `eval 命令消费面为 seeds.json，不接受 yaml 载物（${seedsPath}）。` +
        "PRD §94.2 yaml 载物（tests/behavioral/eval-cases.yaml）是登记形态：" +
        "schema 校验与 json 同构锚定在 tests/behavioral/eval-carrier.spec.ts（js-yaml devDependency + ajv，tests 面）；" +
        "判卷请注入 seeds.json 或省略 seedsPath 用仓库缺省账本。",
    );
  }
  const raw: unknown = JSON.parse(readFileSync(seedsPath, "utf8"));
  const file = raw as SeedsFile;
  if (!Array.isArray(file.seeds)) {
    throw new Error(`seeds.json 形态非法：缺 seeds 数组（${seedsPath}）`);
  }
  // 结构纪律 fail-closed（镜像 golden verdict 词表校验的元纪律位，账本级硬校验）。
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of file.seeds) {
    if (typeof s.id !== "string" || s.id.length === 0) {
      problems.push(`seed 缺 id：${JSON.stringify(s).slice(0, 80)}`);
      continue;
    }
    if (seen.has(s.id)) problems.push(`${s.id}: id 重复`);
    seen.add(s.id);
    if (!(L5_FAMILIES as readonly string[]).includes(s.family)) {
      problems.push(`${s.id}: family "${String(s.family)}" 不在 L5_FAMILIES 词表`);
    }
    if (!(L5_EVALUATORS as readonly string[]).includes(s.evaluator)) {
      problems.push(`${s.id}: evaluator "${String(s.evaluator)}" 不在 L5_EVALUATORS 词表`);
    }
    if (
      s.provenance === undefined ||
      typeof s.provenance.corpus !== "string" ||
      s.provenance.corpus.length === 0
    ) {
      problems.push(`${s.id}: provenance.corpus 缺失（全部 seed 必须有 corpus provenance）`);
    }
    if (
      s.provenance === undefined ||
      typeof s.provenance.note_md !== "string" ||
      s.provenance.note_md.length === 0
    ) {
      problems.push(`${s.id}: provenance.note_md 缺失`);
    }
    if (
      s.pendingReason !== null &&
      s.pendingReason !== undefined &&
      typeof s.pendingReason !== "string"
    ) {
      problems.push(`${s.id}: pendingReason 非法类型`);
    }
    if (s.retired !== undefined && s.retired !== null) {
      const r = s.retired as { reason_md?: unknown };
      if (typeof r !== "object" || r === null || typeof r.reason_md !== "string" || r.reason_md.length === 0) {
        problems.push(`${s.id}: retired.reason_md 缺失或为空（退役判据必须落档，禁静默退役）`);
      }
      if (s.pendingReason !== null && s.pendingReason !== undefined) {
        problems.push(`${s.id}: retired 与 pendingReason 互斥（一条 seed 不能既 pending 又 retired）`);
      }
      if (s.expect_flip_when !== null && s.expect_flip_when !== undefined) {
        problems.push(`${s.id}: retired 与 expect_flip_when 互斥（退役即关闭翻转注册）`);
      }
    }
    if (s.expect === undefined || typeof s.expect !== "object" || s.expect === null) {
      problems.push(`${s.id}: expect 缺失或非对象`);
    }
    // evaluator 专属输入结构（裁决 19③ 换源后两形态分派前置闸——坏形入账在装载期
    // 显式拒绝，不等到执行期才炸）。
    if (s.evaluator === "question_gate") {
      const gate = (s.input as { gate?: unknown } | undefined)?.gate;
      if (typeof gate !== "object" || gate === null) {
        problems.push(`${s.id}: question_gate seed 缺 input.gate 对象`);
      } else {
        const answerable = (gate as { answerable?: unknown }).answerable;
        if (typeof answerable !== "object" || answerable === null) {
          problems.push(`${s.id}: input.gate.answerable 缺失（七关判定输入）`);
        } else {
          for (const key of GATE_ANSWERABLE_KEYS) {
            if (typeof (answerable as Record<string, unknown>)[key] !== "boolean") {
              problems.push(`${s.id}: input.gate.answerable.${key} 须为 boolean（七关键逐字）`);
            }
          }
        }
        if (typeof (gate as { category?: unknown }).category !== "string") {
          problems.push(`${s.id}: input.gate.category 缺失（申报分类词形）`);
        }
      }
    } else if (s.evaluator === "next_action") {
      const snapshot = (s.input as { snapshot?: unknown } | undefined)?.snapshot;
      if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
        problems.push(`${s.id}: next_action seed 缺 input.snapshot 快照对象（NextActionSnapshot 形态）`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`seeds.json 结构纪律违反（fail-closed）：\n- ${problems.join("\n- ")}`);
  }
  return {
    suite: file.suite ?? "behavioral-l5",
    batchCode: file.batch_code ?? "L5-SEED",
    seeds: file.seeds,
  };
}

// ============================================================
// 纯检查器（导出供 vitest 侧对机器断言本身做单元验证）
// ============================================================

/** question_gate 结果检查（verdict/stoppedAtGate/mayAskHuman/declaredConsistent 逐字）。 */
export function checkQuestionGateResult(
  label: string,
  outcome: QuestionGateOutcome,
  expect: QuestionGateExpect,
): string[] {
  const problems: string[] = [];
  if (expect.verdict !== undefined && outcome.verdict !== expect.verdict) {
    problems.push(`${label}: 期望 verdict=${expect.verdict}，实际 ${outcome.verdict}`);
  }
  if (expect.mayAskHuman !== undefined && outcome.mayAskHuman !== expect.mayAskHuman) {
    problems.push(
      `${label}: 期望 mayAskHuman=${String(expect.mayAskHuman)}，实际 ${String(outcome.mayAskHuman)}`,
    );
  }
  if (expect.stoppedAtGate !== undefined && outcome.stoppedAtGate !== expect.stoppedAtGate) {
    problems.push(
      `${label}: 期望 stoppedAtGate=${String(expect.stoppedAtGate)}，实际 ${String(outcome.stoppedAtGate)}`,
    );
  }
  if (
    expect.declaredConsistent !== undefined &&
    outcome.declaredConsistent !== expect.declaredConsistent
  ) {
    problems.push(
      `${label}: 期望 declaredConsistent=${String(expect.declaredConsistent)}，实际 ${String(outcome.declaredConsistent)}`,
    );
  }
  return problems;
}

/** next_action 结果检查（route_id/beat/command 逐字与包含——表驱动首中即停语义）。 */
export function checkNextActionResult(
  label: string,
  nextAction: NextAction,
  expect: NextActionExpect,
): string[] {
  const problems: string[] = [];
  if (expect.route_id !== undefined && nextAction.route_id !== expect.route_id) {
    problems.push(`${label}: 期望 route_id=${expect.route_id}，实际 ${nextAction.route_id}`);
  }
  if (expect.beat !== undefined && nextAction.beat !== expect.beat) {
    problems.push(`${label}: 期望 beat=${String(expect.beat)}，实际 ${String(nextAction.beat)}`);
  }
  for (const fragment of expect.commandContains ?? []) {
    if (nextAction.command === null || !nextAction.command.includes(fragment)) {
      problems.push(
        `${label}: command 应含 "${fragment}"，实际 ${JSON.stringify(nextAction.command)}`,
      );
    }
  }
  if (
    expect.commandEquals !== undefined &&
    nextAction.command !== expect.commandEquals
  ) {
    problems.push(
      `${label}: 期望 command=${JSON.stringify(expect.commandEquals)}，实际 ${JSON.stringify(nextAction.command)}`,
    );
  }
  return problems;
}

// ============================================================
// 执行器（按 evaluator 分派；零 IO 零墙钟）
// ============================================================

export type SeedRunStatus = "passed" | "failed" | "pending" | "retired";

export interface BehavioralSeedResult {
  readonly id: string;
  readonly family: L5Family;
  readonly evaluator: L5Evaluator;
  readonly status: SeedRunStatus;
  /** passed=命中摘要；failed=可诊断 diff（期望 vs 实际 + 输入/结果 JSON）；pending=缺席原因；retired=退役判据。 */
  readonly detail: string;
}

function seedFailed(
  seed: BehavioralSeed,
  problems: readonly string[],
  actualDump: string,
): BehavioralSeedResult {
  return {
    id: seed.id,
    family: seed.family,
    evaluator: seed.evaluator,
    status: "failed",
    // 可诊断 diff：期望 vs 实际判定 + 完整实际结果（契约任务书要求，非裸 assert）。
    detail: `${problems.join("；")}｜实际 ${actualDump}`,
  };
}

function seedPassed(seed: BehavioralSeed, summary: string): BehavioralSeedResult {
  return {
    id: seed.id,
    family: seed.family,
    evaluator: seed.evaluator,
    status: "passed",
    detail: summary,
  };
}

/** 单 seed 执行：retired 非空 → retired；pendingReason 非空 → pending；否则按 evaluator 分派。 */
export function runSeed(seed: BehavioralSeed): BehavioralSeedResult {
  const retired = seed.retired ?? null;
  if (retired !== null) {
    if (typeof retired.reason_md !== "string" || retired.reason_md.length === 0) {
      return seedFailed(
        seed,
        ["retired seed 的 reason_md 为空——退役判据必须落档（禁静默退役）"],
        "",
      );
    }
    return {
      id: seed.id,
      family: seed.family,
      evaluator: seed.evaluator,
      status: "retired",
      detail: retired.reason_md,
    };
  }
  const pendingReason = seed.pendingReason ?? null;
  if (pendingReason !== null) {
    if (pendingReason.length === 0) {
      return seedFailed(
        seed,
        ["pending seed 的 pendingReason 为空——缺席必须显式表达（禁静默跳过）"],
        "",
      );
    }
    return {
      id: seed.id,
      family: seed.family,
      evaluator: seed.evaluator,
      status: "pending",
      detail: pendingReason,
    };
  }
  if (seed.evaluator === "question_gate") return runQuestionGateSeed(seed);
  return runNextActionSeed(seed);
}

function runQuestionGateSeed(seed: BehavioralSeed): BehavioralSeedResult {
  const expect = seed.expect as QuestionGateExpect;
  const gate = (seed.input as { gate?: QuestionGateInput }).gate;
  if (typeof gate !== "object" || gate === null) {
    return seedFailed(
      seed,
      ["question_gate seed 的 input.gate 必须是 QuestionGateInput 对象（category + answerable 七键）"],
      `input=${JSON.stringify(seed.input ?? null)}`,
    );
  }
  const outcome = evaluateQuestionGate(gate);
  const problems = checkQuestionGateResult(seed.id, outcome, expect);
  if (problems.length > 0) {
    return seedFailed(
      seed,
      problems,
      `input=${JSON.stringify(gate)} → outcome=${JSON.stringify(outcome)}`,
    );
  }
  return seedPassed(
    seed,
    `verdict=${outcome.verdict} mayAskHuman=${String(outcome.mayAskHuman)} stoppedAtGate=${String(outcome.stoppedAtGate)} consistent=${String(outcome.declaredConsistent)}`,
  );
}

function runNextActionSeed(seed: BehavioralSeed): BehavioralSeedResult {
  const expect = seed.expect as NextActionExpect;
  const snapshot = (seed.input as { snapshot?: NextActionSnapshot }).snapshot;
  if (typeof snapshot !== "object" || snapshot === null) {
    return seedFailed(
      seed,
      ["next_action seed 的 input.snapshot 必须是 NextActionSnapshot 快照对象"],
      `input=${JSON.stringify(seed.input ?? null)}`,
    );
  }
  const nextAction = evaluateNextAction(snapshot);
  const problems = checkNextActionResult(seed.id, nextAction, expect);
  if (problems.length > 0) {
    return seedFailed(
      seed,
      problems,
      `snapshot=${JSON.stringify(snapshot)} → nextAction=${JSON.stringify(nextAction)}`,
    );
  }
  return seedPassed(
    seed,
    `route=${nextAction.route_id} beat=${String(nextAction.beat)} command=${JSON.stringify(nextAction.command)}`,
  );
}

// ============================================================
// 报告（镜像 golden-report.json 字段形态；零墙钟，可字节级重放）
// ============================================================

export interface FamilySummaryEntry {
  readonly family: L5Family;
  readonly registered: number;
  readonly executable: number;
  readonly passed: number;
  readonly failed: number;
  readonly pending: number;
  readonly retired: number;
}

export interface BehavioralReport {
  readonly suite: string;
  readonly batch_code: string;
  readonly total: number;
  readonly executable: number;
  readonly executed: number;
  readonly passed: number;
  readonly failed: number;
  readonly pending: number;
  readonly retired: number;
  readonly evaluatorSummary: {
    readonly question_gate: number;
    readonly next_action: number;
  };
  readonly familySummary: readonly FamilySummaryEntry[];
  readonly results: readonly BehavioralSeedResult[];
  /** pending 清单（显式缺席，禁静默跳过）。 */
  readonly pendingList: readonly { readonly id: string; readonly reason: string }[];
  /** retired 清单（显式退役，P17-Seeds 处置形态；禁静默 pending 滞留）。 */
  readonly retiredList: readonly { readonly id: string; readonly reason: string }[];
}

/** 全量执行并汇总（幂等：可重复调用字节级同结果）。 */
export function runAllSeeds(seeds: readonly BehavioralSeed[]): BehavioralReport {
  const results = seeds.map((s) => runSeed(s));
  const byStatus = (s: SeedRunStatus): number =>
    results.filter((r) => r.status === s).length;
  const familySummary = L5_FAMILIES.map((family) => {
    const of = results.filter((r) => r.family === family);
    return {
      family,
      registered: of.length,
      executable: of.filter((r) => r.status !== "pending" && r.status !== "retired").length,
      passed: of.filter((r) => r.status === "passed").length,
      failed: of.filter((r) => r.status === "failed").length,
      pending: of.filter((r) => r.status === "pending").length,
      retired: of.filter((r) => r.status === "retired").length,
    };
  }).filter((e) => e.registered > 0);
  const retiredList = results
    .filter((r) => r.status === "retired")
    .map((r) => ({ id: r.id, reason: r.detail }));
  return {
    suite: "behavioral-l5",
    batch_code: "L5-SEED",
    total: results.length,
    executable: seeds.filter(
      (s) => (s.pendingReason ?? null) === null && (s.retired ?? null) === null,
    ).length,
    executed: results.filter((r) => r.status !== "pending" && r.status !== "retired").length,
    passed: byStatus("passed"),
    failed: byStatus("failed"),
    pending: byStatus("pending"),
    retired: byStatus("retired"),
    evaluatorSummary: {
      question_gate: results.filter(
        (r) => r.status !== "pending" && r.status !== "retired" && r.evaluator === "question_gate",
      ).length,
      next_action: results.filter(
        (r) => r.status !== "pending" && r.status !== "retired" && r.evaluator === "next_action",
      ).length,
    },
    familySummary,
    results,
    pendingList: results
      .filter((r) => r.status === "pending")
      .map((r) => ({ id: r.id, reason: r.detail })),
    retiredList,
  };
}

/** 报告自洽：total = executable + pending + retired = passed + failed + pending + retired；族合计闭环。 */
export function reportIsConsistent(report: BehavioralReport): boolean {
  return (
    report.total === report.executable + report.pending + report.retired &&
    report.total === report.passed + report.failed + report.pending + report.retired &&
    report.total === report.executed + report.pending + report.retired &&
    report.pendingList.length === report.pending &&
    report.retiredList.length === report.retired &&
    report.results.length === report.total &&
    report.familySummary.reduce((sum, f) => sum + f.registered, 0) === report.total &&
    report.executable === report.passed + report.failed
  );
}

// ============================================================
// 命令面（PRD §44.10：pomaster eval --suite behavioral）
// ============================================================

export interface EvalInput {
  /** suite 名（EVAL_SUITES 词表校验；词表外 EVAL_SUITE_UNKNOWN fail-closed）。 */
  readonly suite: string;
  /** 注入 seeds.json 路径（测试/嵌入面；缺省 = 仓库 tests/behavioral/seeds.json）。 */
  readonly seedsPath?: string;
}

export interface EvalResult {
  readonly suite: string;
  /** seeds 账本出处（注入或缺省定位；装载失败时为空串）。 */
  readonly seeds_path: string;
  readonly report: BehavioralReport;
}

/** 装载失败路径的零报告（failOutcome 的 result 形态稳定性：字段齐备、计数诚实为零）。 */
function zeroReport(): BehavioralReport {
  return {
    suite: "",
    batch_code: "",
    total: 0,
    executable: 0,
    executed: 0,
    passed: 0,
    failed: 0,
    pending: 0,
    retired: 0,
    evaluatorSummary: { question_gate: 0, next_action: 0 },
    familySummary: [],
    results: [],
    pendingList: [],
    retiredList: [],
  };
}

export async function runEval(input: EvalInput): Promise<CommandOutcome<EvalResult>> {
  const command = "eval";
  if (!(EVAL_SUITES as readonly string[]).includes(input.suite)) {
    return failOutcome<EvalResult>(
      command,
      { suite: input.suite, seeds_path: "", report: zeroReport() },
      [
        {
          code: "EVAL_SUITE_UNKNOWN",
          message: `--suite "${input.suite}" 不在 eval suite 词表（闭包：${EVAL_SUITES.join(" / ")}）`,
          hint: "suite 名取词表闭包（现为 behavioral）；扩容须同步 EVAL_SUITES 与 tests/behavioral/trigger-manifest.json suites（词表纪律，禁 argv 侧静默放宽）。",
        },
      ],
      [`eval: FAILED — EVAL_SUITE_UNKNOWN（${input.suite}）`],
    );
  }

  const seedsPath = input.seedsPath ?? BEHAVIORAL_SEEDS_PATH;
  if (!existsSync(seedsPath)) {
    return failOutcome<EvalResult>(
      command,
      { suite: input.suite, seeds_path: seedsPath, report: zeroReport() },
      [
        {
          code: "SEEDS_NOT_AVAILABLE",
          message: `seeds.json 未找到（${seedsPath}）`,
          hint: "seeds 账本是仓库资产（tests/behavioral/seeds.json）：在仓库内运行，或用测试/嵌入方注入 seedsPath。",
        },
      ],
      [`eval: FAILED — SEEDS_NOT_AVAILABLE（${seedsPath}）`],
    );
  }

  let loaded: ReturnType<typeof loadSeeds>;
  try {
    loaded = loadSeeds(seedsPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failOutcome<EvalResult>(
      command,
      { suite: input.suite, seeds_path: seedsPath, report: zeroReport() },
      [
        {
          code: "SEEDS_INVALID",
          message,
          hint: "seeds 账本结构纪律见契约 docs/p9-human-view-and-l5-contract.md §2.3（缺 id/family/evaluator 词表外/provenance 缺失均 fail-closed）；修正账本而非放宽校验。",
        },
      ],
      [`eval: FAILED — SEEDS_INVALID\n  ${message.split("\n").join("\n  ")}`],
    );
  }

  const report = runAllSeeds(loaded.seeds);
  if (!reportIsConsistent(report)) {
    return failOutcome<EvalResult>(
      command,
      { suite: input.suite, seeds_path: seedsPath, report },
      [
        {
          code: "EVAL_REPORT_INCONSISTENT",
          message:
            `报告自洽破坏：total=${report.total} executable=${report.executable} pending=${report.pending} passed=${report.passed} failed=${report.failed}`,
          hint: "执行器被改坏时拒绝判卷（fail-closed）：检查 runAllSeeds/reportIsConsistent（@pomaster/cli eval 模块）。",
        },
      ],
      ["eval: FAILED — EVAL_REPORT_INCONSISTENT"],
    );
  }

  const human = [
    `eval: ${report.passed} passed / ${report.failed} failed / ${report.pending} pending（suite ${input.suite}；seeds 注册 ${report.total}，executable ${report.executable}，retired ${report.retired}）`,
    `  evaluators: question_gate=${report.evaluatorSummary.question_gate} next_action=${report.evaluatorSummary.next_action}`,
    ...report.pendingList.map((p) => `  pending（显式缺席，不冒充绿）: ${p.id} — ${p.reason}`),
    ...report.retiredList.map((r) => `  retired（显式退役，不冒充绿也不滞留 pending）: ${r.id} — ${r.reason}`),
  ];
  if (report.failed > 0) {
    const failedIds = report.results
      .filter((r) => r.status === "failed")
      .map((r) => r.id);
    return failOutcome(
      command,
      { suite: input.suite, seeds_path: seedsPath, report },
      [
        {
          code: "EVAL_EXECUTABLE_FAILED",
          message: `executable seed 失败 ${report.failed} 条：${failedIds.join(", ")}`,
          hint: "可诊断 diff 见 --json result.report.results[].detail（期望 vs 实际判定 + 完整输入/结果 JSON）；pending 与失败是两种状态，禁把 pending 当失败修，更禁把失败标 pending。",
        },
      ],
      [
        ...human,
        ...report.results
          .filter((r) => r.status === "failed")
          .map((r) => `  FAILED ${r.id}: ${r.detail}`),
      ],
    );
  }
  return okOutcome(command, { suite: input.suite, seeds_path: seedsPath, report }, human);
}
