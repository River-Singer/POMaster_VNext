/**
 * mutation-leg.ts —— MUTATION 门禁执行腿（P24 / 随版计划 Batch 2 B2-3 StrykerJS +
 * B2-4 mutmut；PRD §28 MUTATION Gate；coverage-leg 同款三道闸先例）。
 *
 * 权威出处：
 * - 随版计划 B2-3 原文：StrykerJS「changed-code scope、survivor 上限、**HARDENING 档专属**」；
 * - 随版计划 B2-4 原文：mutmut「能力落差**如实标注**（不得伪装与 StrykerJS 同强度）」；
 * - 测试战略 L6-1：Mutation kill score **≥85%（changed-code scope）**（Decision/Gate 模块）；
 * - 工具链研究 §1.3 纪律 2/3：adapter 结果必带 metric_dialect；生成者/判卷者分离
 *   （固定 seed mutant 库验证敏感性——seed-mutants.ts 与 seed-mutant-library.spec.ts）；
 * - PRD §28 MUTATION Gate 支持面：changed code 优先 / survivor list / mutation score /
 *   timeout / strengthener loop（strengthener loop 归编排层后续批次，本腿只做判卷锚）；
 * - PRD §46 MUTATION 示例 metrics（generated/killed/survived/score）——03 schema 无独立
 *   metrics 字段，本腿以 counts + items + scopeNote 承载同一四元组（可复算对账）。
 *
 * ============================================================
 * 能力落差如实标注（B2-4 纪律；mutmut 腿每条记录 scopeNote 恒携带，不伪装同强度）
 * ============================================================
 * mutmut 与 StrykerJS 的结构化能力差距（mutmut 腿如实降级，绝不静默补齐）：
 * 1. 无 schema 化 JSON 报告（StrykerJS 产 mutation-testing-elements schemaVersion JSON；
 *    mutmut 只有 JUnitXML 导出词形）——词形漂移只能靠 fail-closed malformed 拦截，
 *    无 schemaVersion 协商位；
 * 2. 逐 mutant 结构化位置缺席：mutmut junitxml 的 killed 条目无 file:line——scope 复核
 *    只能对携带位置的条目做，无位置条目按命令面 --paths-to-mutate 信任计数并在 scopeNote
 *    显式披露（「scope 归属不可复核 N 条」）；StrykerJS 每 mutant 均有结构化 file+line，
 *    逐条 scope 复核（判卷侧二次强制，见决策 D3）；
 * 3. 变异算子字段缺席：mutmut junitxml 无 mutatorName——幸存者明细只报位置不报算子；
 * 4. no_coverage 与 suspicious 不可区分：两者都落 undetected_denominator（StrykerJS 可
 *    区分 NoCoverage 与无此形态）；差异在 scopeNote 计数披露而非抹平；
 * 5. suspicious 保守口径：mutmut ok_suspicious（疑似 killed 但耗时不定）不计 detected
 *    分子、只入分母——同数据下 mutmut 名义 score 不高于 StrykerJS（宁低估不高估）；
 * 6. 无 test 谱系 / 无 per-mutant 覆盖归因（StrykerJS testFiles 谱系）。
 *
 * ============================================================
 * 档位裁定（决策 D1：HARDENING 档专属的整 gate 语义）
 * ============================================================
 * 随版计划 B2-3 原文是「HARDENING 档**专属**」（整个 MUTATION gate 仅 HARDENING 档执行），
 * 与 B2-2 CRAP 的「阈值配置化，HARDENING-only **生效**」（阈值专属 → STANDARD 跑+呈报）
 * 措辞不同。本腿如实按原文措辞分叉：MINIMAL/LIGHT/FAST/STANDARD 四档一律 policy_skip
 * 合法缺席（not_run + notApplicable=1，P12c 映射裁定），只有 HARDENING 档真跑判罚；
 * STANDARD 的缺席注记单列 B2-3 原文锚（非 CRAP 的 STANDARD 跑+呈报语义）。
 *
 * ============================================================
 * violations 语义裁定（决策 D2：L6「survived 超阈值部分」的等价口径）
 * ============================================================
 * counts.violations = 阈值违例条数（两条独立阈值，各记一条，上限 2）：
 * - kill score（重算）< minKillScore → rule=mutation_kill_score_below_threshold
 *   （L6-1 原文「kill score ≥85%（changed-code scope）」的判卷化）；
 * - survivors > maxSurvivors → rule=mutation_survivors_above_cap
 *   （随版计划 B2-3「survivor 上限」的判卷化）。
 * 这是「survived mutants 超阈值部分」的等价口径（wave3-plan.md P24 范围锚 3 授权
 * 「或等价口径——按 PRD §28 与 L6 原文裁定」）：coverage 腿同款「violations=低于阈值
 * 口径数」的粒度一致性优先于逐幸存者计数。幸存者明细（PRD §28 survivor list 支持面）
 * 以 items rule=mutation_survived 逐条承载——items 载体粒度（幸存者 + 阈值违例）与
 * counts.violations 载体粒度（阈值违例）刻意不同（build adapter「counts/blindspot
 * 载体粒度不同」同款声明），survivor 明细是判卷留痕非逐条判罚。
 *
 * ============================================================
 * changed-code scope 双面强制（决策 D3）
 * ============================================================
 * - 命令面：prepare 把 changedFiles 逐个拼进 scope 旗标（stryker: `--mutate "<a,b>"`；
 *   mutmut: `--paths-to-mutate "<a,b>"`）——scope 生效的第一道；
 * - 判卷面（C5 重算权威）：normalize 对报告内逐 mutant 按 file ∈ changedFiles 复核——
 *   scope 外条目不入分母不入分子（counts.notApplicable 显式计数 + scopeNote 披露），
 *   工具无视 scope 旗标也搬不动 score；unattributed 条目（mutmut killed 词形）按命令面
 *   信任计数并披露（能力落差 2）。changed-code scope 生效测试构造「假工具无视旗标乱写
 *   scope 外 mutant」形态钉死本闸。
 *
 * ============================================================
 * kill score 口径（C5：报告状态重算，工具自报不消费）
 * ============================================================
 * StrykerJS / mutation-testing-elements 口径：detected = killed + timeout；
 * generated（分母）= killed + survived + timeout + no_coverage；
 * ignored / runtime_error / pending 排除在分母分子之外；score = detected/generated×100。
 * 两份报告词形（StrykerJS JSON / mutmut junitxml）都不含工具自报 score——天然无自报
 * score 攻击面，判卷锚 = 逐 mutant status 重算（C5）。
 *
 * 执行三道闸（P22/P23 先例）：⓪ 可执行体 PATH 探测（Windows cmd 缺席伪装先拦）→
 * ① `--version` 版本探测（退出 0 且 semver 词形可得）→ ②a 报告路径安全闸（空/越出项目
 * 根拒绝——rmSync 失效化面禁变任意删除面）→ ②b spawn 前 rmSync 失效化声明报告路径
 * （P23 红队 MAJOR「陈旧报告误绿通道」同款封死；删不掉 → pre_run_failed fail-closed）
 * → ② 真执行 + 报告回读（报告缺席 → not_run 非绿非红）。
 *
 * 退出码非判卷锚：stryker 自身配置的内部阈值不达标会 exit 1——那是第三方工具语义，
 * 本 gate 判卷锚唯一 = 报告重算（scope+阈值是 POMaster 侧配置，禁双源混淆）；报告
 * 在场即按报告判卷，报告缺席（含 exit 0 无报告）→ not_run。
 *
 * PATH 引号消毒 / 64MB maxBuffer / D24 无 sha / A4 禁墙钟：coverage-leg 同款纪律。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  join as pathJoin,
  isAbsolute as pathIsAbsolute,
  relative as pathRelative,
  resolve as pathResolve,
} from "node:path";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue } from "@pomaster/schemas";
import type {
  ExecutableProbeFn,
  GateResultItemInput,
  GateResultRecord,
  GateTier,
  SpawnFn,
  SpawnOutcome,
} from "./adapter-types.js";
import { SPAWN_MAX_BUFFER_BYTES } from "./adapter-types.js";
import {
  firstCommandToken,
  platformExecutableProbe,
  sanitizeSemver,
  stripQuotesFromPathEnv,
} from "./detectors.js";
import { absenceRecord, capItems, type RecordPlanFields } from "./normalize-common.js";

export const MUTATION_GATE_NAME = "MUTATION";
export const MUTATION_GATE_DEF = "POLICY.GATE.MUTATION@0.1.0";
export const MUTATION_GATE_CONFIG_FILE = "mutation-gate.json";
export const STRYKER_TOOL_ID = "gauntlet:stryker";
export const MUTMUT_TOOL_ID = "gauntlet:mutmut";
/** mutation adapter 自身身份（配置缺席等 runner 未定态的探测/缺席记录 tool 词形）。 */
export const MUTATION_ADAPTER_TOOL_ID = "gauntlet:mutation";

/** StrykerJS 腿口径（changed-code scope 收窄后的分母；metric_dialect 必带——横切纪律 2）。 */
export const STRYKER_METRIC_DIALECT = "mutation:stryker_changed_code";
/** mutmut 腿口径（与 stryker 口径在记录级区分——能力落差不可混算为同一 dialect）。 */
export const MUTMUT_METRIC_DIALECT = "mutation:mutmut_changed_code";
/** 缺席记录的机器可辨口径轴（P12c policySkip 映射裁定同款）。 */
export const MUTATION_POLICY_SKIP_METRIC_DIALECT = "mutation:policy_skip";
/** 配置缺席态（not_configured）的口径轴词形。 */
export const MUTATION_METRIC_DIALECT_UNDECLARED = "mutation:undeclared";

export const STRYKER_VERSION_PROBE_COMMAND = "corepack pnpm exec stryker --version";
export const MUTMUT_VERSION_PROBE_COMMAND = "python -m mutmut --version";
/** StrykerJS json reporter 缺省落点（stryker.conf reports:["json"] 缺省词形）。 */
export const STRYKER_DEFAULT_REPORT = "reports/mutation/mutation.json";
/** mutmut junitxml 导出缺省落点（config command 内重定向声明；报告路径可配置覆盖）。 */
export const MUTMUT_DEFAULT_REPORT = "mutants.xml";
/** 变异测试是最贵 gate：缺省超时给足 30min（coverage 腿 10min 的 3 倍；仍非无限）。 */
export const DEFAULT_MUTATION_TIMEOUT_MS = 1_800_000;

// ============================================================
// 阈值纪律（A4 对齐点：Owner 决议 2026-09-01 批准转正；配置化覆盖，未配置时的出厂兜底）
// ============================================================

/**
 * MUTATION 阈值出厂兜底（值不变，登记状态已经 Owner 决议 2026-09-01 由 provisional
 * 转正为 approved）：
 * - minKillScore=85 锚测试战略 L6-1 原文「kill score ≥85%（changed-code scope）」
 *   （L6-1 原文锚，呈报件 §2.2）；
 * - maxSurvivors=10（survivor 上限）原纯 provisional 占位，Owner 决议 2026-09-01
 *   A4 阈值包一并批准（呈报件 §2.3）。
 * 两者仍可配置化覆盖（mutation-gate.json thresholds）；PRD §26.2：不把某个数字当成
 * 永久真理——后续调整走配置面与再呈报，登记 status/approved_by 是权威词形。
 */
export const MUTATION_PROVISIONAL_THRESHOLDS = {
  minKillScore: 85,
  maxSurvivors: 10,
} as const;

/**
 * approved 注记原文（items/scopeNote 与呈报项登记共用；Owner 决议 2026-09-01）。
 * 原 provisional 注记（「provisional 待 A4 打包批准…」）随批准转正退役；
 * 常量名从 MUTATION_PROVISIONAL_NOTE 更名以保词形诚实（零外部消费者，纯内部更名）。
 */
export const MUTATION_THRESHOLD_APPROVED_NOTE =
  "已经 Owner 决议 2026-09-01 批准转正（A4 阈值包：minKillScore=85 锚测试战略 L6-1、maxSurvivors=10 一并获批；PRD §26.2：不把某个数字当成永久真理——后续调整走 mutation-gate.json thresholds 配置化覆盖）";

/**
 * P24 阈值呈报项登记（机器可读；原 provisional 呈报表——Owner 决议 2026-09-01
 * A4 阈值包批准转正，两行 status 均 approved 并带 approved_by。常量名保留
 * PROVISIONAL 词形作为历史呈报位锚（最小改造，禁大改登记结构 API），
 * 行内 status/approved_by/note 是权威词形）。
 */
export const MUTATION_PROVISIONAL_REGISTRATIONS = [
  {
    key: "mutation-gate.json thresholds.minKillScore",
    value: MUTATION_PROVISIONAL_THRESHOLDS.minKillScore,
    status: "approved" as const,
    approved_by: "OWNER 2026-09-01 decision",
    note: MUTATION_THRESHOLD_APPROVED_NOTE,
  },
  {
    key: "mutation-gate.json thresholds.maxSurvivors",
    value: MUTATION_PROVISIONAL_THRESHOLDS.maxSurvivors,
    status: "approved" as const,
    approved_by: "OWNER 2026-09-01 decision",
    note: MUTATION_THRESHOLD_APPROVED_NOTE,
  },
];

// ============================================================
// spawn：PATH 引号消毒默认实现（coverageSpawn/oasdiffSpawn 同源同款）
// ============================================================

/** mutation 腿默认 spawn：PATH 消毒 + shell:true + 显式 64MB maxBuffer（P22 三腿先例）。 */
export const mutationSpawn: SpawnFn = (command, options) => {
  const startedAt = performance.now();
  const sanitizedEnv = stripQuotesFromPathEnv({ ...process.env });
  const res = spawnSync(command, {
    shell: true,
    cwd: options.cwd,
    timeout: options.timeoutMs,
    encoding: "utf8",
    // 显式 64MB（Node 默认 1MB 会被大报告/大输出 ENOBUFS 打断 → 结构性 not_run）。
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
    windowsHide: true,
    env: sanitizedEnv,
  });
  const externalMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error?.message ?? null,
    externalMs,
  };
};

// ============================================================
// 计划与执行
// ============================================================

/** mutation 腿执行计划（mutation-adapter prepare 组装；字段是 RecordPlanFields 结构子集）。 */
export interface MutationLegPlan extends RecordPlanFields {
  readonly projectRoot: string;
  /** stryker | mutmut（B2-3 / B2-4；JaCoCo 侧 PIT 属 Java 第二波，显式 deferred 不在本腿）。 */
  readonly runner: "stryker" | "mutmut";
  /** 触发方式（structural 词表；coverage 腿计划同款锚）。 */
  readonly trigger: RunTriggerValue;
  readonly absenceKind: "profile_not_required" | "config_absent" | "tool_absent" | null;
  readonly absentReason: string | null;
  readonly absentHint: string | null;
  /** 档位（policy_skip 注记与判卷面留痕；prepare 解析自 policy.gateTier）。 */
  readonly tier: GateTier;
  /** 真执行命令（含 changed-code scope 旗标；prepare 组装；缺席态为空串）。 */
  readonly command: string;
  readonly versionProbeCommand: string;
  /** gate ①a 可执行体词形（stryker=corepack / mutmut=python）。 */
  readonly executable: string;
  readonly timeoutMs: number;
  /** 仓内相对报告文件路径（run 侧回读 + items.location + scopeNote 可移植词形）。 */
  readonly reportPath: string;
  /** changed-code scope 分母（变更文件清单；命令面旗标 + 判卷面复核双重消费）。 */
  readonly changedFiles: readonly string[];
  readonly thresholds: { readonly minKillScore: number; readonly maxSurvivors: number };
  /** true = 阈值来自出厂兜底（已经 Owner 决议 2026-09-01 批准转正）；false = 配置显式供给。 */
  readonly thresholdsProvisional: boolean;
  /** 版本锚（policy 供给；stryker 腿可选——以 package.json 声明版本为 toolVersion）。 */
  readonly expectedToolVersion: string | null;
}

export interface MutationLegOutput {
  readonly plan: MutationLegPlan;
  /**
   * pre_run_failed = spawn 前安全/失效化闸拒绝（报告路径非法或陈旧报告删不掉——
   * spawn 未发生，fail-closed not_run，与工具缺席同侧诚实呈现）。
   */
  readonly kind: "executed" | "spawn_failed" | "pre_run_failed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly observedToolVersion: string | null;
  /** 报告文件回读文本（pytest-leg 报告回读先例；缺席 = null → not_run 非绿非红）。 */
  readonly reportText: string | null;
  readonly externalMs: number;
  readonly failureReason: string | null;
}

/**
 * mutation 腿执行：可执行体前置闸 + 版本探测 + 报告失效化 + 真执行 + 报告回读。
 * 报告文件从仓内计划路径回读——第三方报告文本止步于此（normalize 只认报告文本）。
 * spawn 前 rmSync 失效化（P23 红队 MAJOR 同款）：陈旧遗留报告禁跨 run 存活冒充本次判卷锚。
 */
export function runMutationLeg(
  plan: MutationLegPlan,
  spawnFn: SpawnFn = mutationSpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
): MutationLegOutput {
  // —— 前置闸①a：可执行体 PATH 探测（Windows cmd 缺席以 status=1+error=null 伪装
  // 执行失败，spawn 前先证在位）。
  const probeHit = executableProbe(plan.executable);
  if (probeHit === null) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion: null,
      reportText: null,
      externalMs: 0,
      failureReason: `mutation 腿可执行体 ${plan.executable} 不在 PATH（runner=${plan.runner} 工具缺席——Windows cmd 下会以 status=1+error=null 伪装成执行失败，故 spawn 前先证在位）；hint: 按 mutation-gate.json runner 对应指引安装后重跑`,
    };
  }

  // —— 前置闸①b：版本探测语义收紧——「可执行」必须以「退出 0 且报出版本词形」为证。
  const probeTimeoutMs = Math.min(plan.timeoutMs, 60_000);
  const probe: SpawnOutcome = spawnFn(plan.versionProbeCommand, {
    cwd: plan.projectRoot,
    timeoutMs: probeTimeoutMs,
  });
  const observedToolVersion = sanitizeSemver(probe.stdout);
  if (
    probe.error !== null ||
    probe.status === null ||
    probe.status !== 0 ||
    observedToolVersion === null
  ) {
    return {
      plan,
      kind: "spawn_failed",
      exitCode: probe.status,
      stdout: probe.stdout,
      stderr: probe.stderr,
      observedToolVersion: null,
      reportText: null,
      externalMs: probe.externalMs,
      failureReason: `mutation 腿版本探测失败（runner=${plan.runner}, status=${String(probe.status)}, error=${probe.error ?? "unknown"}, 版本词形${observedToolVersion === null ? "不可得" : "可得"}）——工具缺席或损坏（Windows cmd 缺席形态即 status=1+error=null）；hint: 按探测面指引安装后重跑`,
    };
  }

  // —— 前置闸②a：判卷锚路径安全闸（rmSync 破坏性操作前置：空路径/越出项目根拒绝）。
  const reportAbs = pathJoin(plan.projectRoot, plan.reportPath);
  if (plan.reportPath.length === 0 || pathEscapesProjectRoot(plan.projectRoot, reportAbs)) {
    return {
      plan,
      kind: "pre_run_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion,
      reportText: null,
      externalMs: probe.externalMs,
      failureReason: `mutation 腿报告路径非法：reportPath=${plan.reportPath === "" ? "(空)" : plan.reportPath}（空路径或越出项目根——spawn 前失效化面拒绝执行，fail-closed）`,
    };
  }

  // —— 前置闸②b：报告失效化（陈旧报告误绿通道封死，P23 红队 MAJOR 同款）。
  try {
    rmSync(reportAbs, { force: true });
  } catch {
    // force 只吞「不存在」；存在而删不掉走下方存在性复核 fail-closed。
  }
  if (existsSync(reportAbs)) {
    return {
      plan,
      kind: "pre_run_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion,
      reportText: null,
      externalMs: probe.externalMs,
      failureReason: `mutation 腿报告失效化失败：${plan.reportPath} 在 spawn 前无法删除（被占用/权限不足/路径为目录占位）——无法保证本次判卷锚新鲜，fail-closed 拒绝执行`,
    };
  }

  // —— ② 真执行 + 报告回读（退出码非判卷锚——见文件头注；normalize 以报告为锚）。
  const run: SpawnOutcome = spawnFn(plan.command, {
    cwd: plan.projectRoot,
    timeoutMs: plan.timeoutMs,
  });
  let reportText: string | null = null;
  try {
    reportText = readFileSync(reportAbs, "utf8");
  } catch {
    reportText = null;
  }
  const spawnFailed = run.error !== null || run.status === null;
  return {
    plan,
    kind: spawnFailed ? "spawn_failed" : "executed",
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    observedToolVersion,
    reportText,
    externalMs: probe.externalMs + run.externalMs,
    failureReason: spawnFailed
      ? `mutation 腿子进程执行失败（runner=${plan.runner}, status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
  };
}

/** 报告绝对路径是否越出项目根（含路径即根——rmSync 破坏性面前置拒绝判据）。 */
function pathEscapesProjectRoot(projectRoot: string, absolutePath: string): boolean {
  const rel = pathRelative(pathResolve(projectRoot), pathResolve(absolutePath));
  return rel === "" || rel.startsWith("..") || pathIsAbsolute(rel);
}

// ============================================================
// 报告解析（两词形互异；词形之外一律 malformed 非默认值——C5 禁猜）
// ============================================================

/**
 * 逐 mutant 状态（内部归一词形；两报告词形各映射到本词表）：
 * - StrykerJS（mutation-testing-elements 七态）Killed/Survived/NoCoverage/Timeout/
 *   Ignored/RuntimeError/Pending；
 * - mutmut（junitxml 词形映射，见 parseMutmutJunitXml 头注）。
 * 词表外状态 = 整份报告 malformed（fail-closed，禁猜新词形）。
 */
export type MutantStatus =
  | "killed"
  | "survived"
  | "timeout"
  | "no_coverage"
  | "suspicious"
  | "ignored"
  | "runtime_error"
  | "pending"
  | "skipped"
  | "untested";

/** 单条 mutant 记录（file=null = 词形未携带位置——mutmut killed 条目形态，能力落差 2）。 */
export interface MutantEntry {
  /** 工具侧 mutant 标识（stryker id 字段 / mutmut testcase name；词形缺席 = null）。 */
  readonly id: string | null;
  /** 仓内相对文件路径（分隔符归一）；null = 词形未携带（不可做 scope 复核）。 */
  readonly file: string | null;
  /** 变异算子名（mutmut junitxml 无此字段 → null，能力落差 3）。 */
  readonly mutatorName: string | null;
  readonly line: number | null;
  readonly status: MutantStatus;
}

export interface MutationReportMetrics {
  readonly mutants: readonly MutantEntry[];
}

const STRYKER_STATUS_WORDS: Readonly<Record<string, MutantStatus>> = {
  Killed: "killed",
  Survived: "survived",
  NoCoverage: "no_coverage",
  Timeout: "timeout",
  Ignored: "ignored",
  RuntimeError: "runtime_error",
  Pending: "pending",
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedKey(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * 解析 StrykerJS json reporter 产物（mutation-testing-elements 词形）：
 * `{ "schemaVersion": "1.0", "files": { "<file>": { "mutants": [ { "id", "mutatorName",
 * "location": {"start":{"line"}}, "status": "Killed|..." } ] } }, ... }`。
 * C5：status 是唯一判卷输入（本词形天然无工具自报 score）；词表外状态 / files 缺席 /
 * mutants 非数组 / 单条状态缺失 → null（malformed → not_run，禁猜）。
 * schemaVersion 只做在位检查不钉死值（elements schema 演进由 status 词表闸兜底——
 * 词形漂移 fail-closed 拦截，不做版本协商）。
 */
export function parseStrykerReport(text: string): MutationReportMetrics | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }
  const record = root as Record<string, unknown>;
  if (typeof record["schemaVersion"] !== "string") {
    return null;
  }
  const files = record["files"];
  if (files === null || typeof files !== "object" || Array.isArray(files)) {
    return null;
  }
  const mutants: MutantEntry[] = [];
  for (const [file, fileValue] of Object.entries(files as Record<string, unknown>)) {
    if (fileValue === null || typeof fileValue !== "object" || Array.isArray(fileValue)) {
      return null;
    }
    const fileMutants = (fileValue as Record<string, unknown>)["mutants"];
    if (!Array.isArray(fileMutants)) {
      return null;
    }
    for (const entry of fileMutants) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const m = entry as Record<string, unknown>;
      const statusWord = m["status"];
      if (typeof statusWord !== "string") {
        return null;
      }
      const status = STRYKER_STATUS_WORDS[statusWord];
      if (status === undefined) {
        // 词表外状态：宁可 not_run 不可猜（Stryker 大版本词形漂移在此显式拦截）。
        return null;
      }
      let line: number | null = null;
      const location = m["location"];
      if (location !== null && typeof location === "object" && !Array.isArray(location)) {
        const start = (location as Record<string, unknown>)["start"];
        if (start !== null && typeof start === "object" && !Array.isArray(start)) {
          line = finiteNumber((start as Record<string, unknown>)["line"]);
        }
      }
      mutants.push({
        id: typeof m["id"] === "string" ? m["id"] : null,
        file: normalizedKey(file),
        mutatorName: typeof m["mutatorName"] === "string" ? m["mutatorName"] : null,
        line,
        status,
      });
    }
  }
  return { mutants };
}

/**
 * 解析 mutmut `junitxml` 导出词形（JUnitXML）。
 * 状态映射裁定（mutmut 状态轴 → 本腿归一词表；能力落差见文件头注）：
 * - testcase 无 failure/error/skipped 子元素            → killed（测试杀死变异体）
 * - `<failure>`                                          → survived（变异体幸存）
 * - `<error>`                                            → timeout（mutmut bad_timeout——detected）
 * - `<skipped message="suspicious">`                     → suspicious（mutmut ok_suspicious，
 *     疑似 killed 但耗时不定——保守入 undetected 分母不计 detected 分子，能力落差 5）
 * - `<skipped message="skipped">` / `message="untested"` → skipped / untested（排除类）
 * skipped 缺 message 或词表外 message → null（malformed，禁猜）。
 * 位置提取：testcase name 与 failure message 全文扫描 `<path>:<line>`（如 src/calc.py:42）；
 * killed 条目在真实 mutmut 词形中不带位置 → file=null（能力落差 2：scope 复核不可及，
 * normalize 侧显式披露计数）。mutatorName 字段在 junitxml 不存在 → 恒 null（能力落差 3）。
 */
export function parseMutmutJunitXml(text: string): MutationReportMetrics | null {
  const mutants: MutantEntry[] = [];
  const testcaseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let match: RegExpExecArray | null;
  while ((match = testcaseRe.exec(text)) !== null) {
    const attrs = match[1] ?? "";
    const children = match[2] ?? "";
    const nameMatch = /\bname="([^"]*)"/.exec(attrs);
    if (nameMatch === null) {
      return null;
    }
    const name = nameMatch[1] ?? "";
    let status: MutantStatus;
    if (children.includes("<failure")) {
      status = "survived";
    } else if (children.includes("<error")) {
      status = "timeout";
    } else if (children.includes("<skipped")) {
      const skippedMatch = /<skipped\b[^>]*\bmessage="([^"]*)"/.exec(children);
      const skippedWord = skippedMatch?.[1] ?? "";
      if (skippedWord === "suspicious") {
        status = "suspicious";
      } else if (skippedWord === "skipped") {
        status = "skipped";
      } else if (skippedWord === "untested") {
        status = "untested";
      } else {
        return null;
      }
    } else {
      status = "killed";
    }
    // 位置提取：name +（survived 时）failure message 全文扫描 file:line 词形。
    const haystack = `${name} ${children}`;
    const locMatch = /([A-Za-z0-9_./\\-]+\.(?:py|ts|tsx|js|jsx|mjs|cjs)):(\d+)/.exec(haystack);
    mutants.push({
      id: name.length > 0 ? name : null,
      file: locMatch === null ? null : normalizedKey(locMatch[1] ?? ""),
      line: locMatch === null ? null : Number(locMatch[2]),
      mutatorName: null,
      status,
    });
  }
  if (mutants.length === 0) {
    // 零 testcase = 词形不可解析（真实 mutmut 至少产一个 testcase；空报告是异常形态）。
    return null;
  }
  return { mutants };
}

/** 按 runner 分派报告解析（单一分派点——两腿词形互异，禁混用解析器）。 */
export function parseMutationReport(
  runner: "stryker" | "mutmut",
  text: string,
): MutationReportMetrics | null {
  return runner === "stryker" ? parseStrykerReport(text) : parseMutmutJunitXml(text);
}

// ============================================================
// kill score 重算（C5：判卷唯一锚；工具无自报 score 位）
// ============================================================

/**
 * kill score = detected / generated × 100（StrykerJS / mutation-testing-elements 口径：
 * detected = killed + timeout；generated = killed + survived + timeout + no_coverage +
 * suspicious；excluded 类不计分母）。generated=0 由调用方先拦截（not_run——禁把空分母
 * 当 0% 或 100%），本函数收到即抛（fail-closed，与 crap.computeCrap 同款域闸姿态）。
 */
export function computeKillScore(detected: number, generated: number): number {
  if (!Number.isFinite(detected) || detected < 0) {
    throw new Error(
      `kill score 输入域违规（detected=${String(detected)}）—— detected 必须是非负有限数（killed+timeout 计数）`,
    );
  }
  if (!Number.isFinite(generated) || generated <= 0) {
    throw new Error(
      `kill score 输入域违规（generated=${String(generated)}）—— generated 必须是正有限数（分母为 0 是「空分母」形态，调用方必须落 not_run 禁当满分）`,
    );
  }
  return (detected / generated) * 100;
}

/** 单 runner 汇总（scope 复核后的 in-scope 面；供 normalize 与 seed 敏感性测试共用）。 */
export interface MutationStats {
  /** in-scope 分母（killed+survived+timeout+no_coverage+suspicious）。 */
  readonly generated: number;
  readonly killed: number;
  readonly timeout: number;
  readonly survived: number;
  readonly noCoverage: number;
  readonly suspicious: number;
  readonly excluded: number;
  /** killed + timeout（StrykerJS 口径 detected）。 */
  readonly detected: number;
  readonly scorePercent: number;
}

/**
 * 对 in-scope mutants 做判卷重算（C5 单一实现——normalize 与 seed-mutant-library.spec
 * 共用本函数，判卷数学只许有一份）。
 */
export function summarizeMutants(inScope: readonly MutantEntry[]): MutationStats {
  let killed = 0;
  let timeout = 0;
  let survived = 0;
  let noCoverage = 0;
  let suspicious = 0;
  let excluded = 0;
  for (const m of inScope) {
    switch (m.status) {
      case "killed":
        killed += 1;
        break;
      case "timeout":
        timeout += 1;
        break;
      case "survived":
        survived += 1;
        break;
      case "no_coverage":
        noCoverage += 1;
        break;
      case "suspicious":
        suspicious += 1;
        break;
      default:
        excluded += 1;
        break;
    }
  }
  const generated = killed + survived + timeout + noCoverage + suspicious;
  const detected = killed + timeout;
  return {
    generated,
    killed,
    timeout,
    survived,
    noCoverage,
    suspicious,
    excluded,
    detected,
    scorePercent: computeKillScore(detected, generated),
  };
}

/** 判卷态幸存者清单（items 明细用；excluded/suspicious/no_coverage 不入幸存者名单）。 */
export function survivingMutants(inScope: readonly MutantEntry[]): readonly MutantEntry[] {
  return inScope.filter((m) => m.status === "survived");
}

/**
 * 单条状态的判卷分类（单一实现——normalize、seed 敏感性测试共用；四类语义：
 * detected=计入 kill score 分子 / survived=幸存者（拖分且入 survivor list）/
 * undetected_denominator=计入分母拖分但不入幸存者名单 / excluded=分子分母均不计）。
 * seed-mutant-library.spec.ts 用本函数对 seed 预写预期逐条对账（错杀/漏杀/排除类
 * 误置即红）——这是「生成者/判卷者分离」纪律的判卷器考题面。
 */
export function mutantStatusClass(
  status: MutantStatus,
): "detected" | "survived" | "undetected_denominator" | "excluded" {
  switch (status) {
    case "killed":
    case "timeout":
      return "detected";
    case "survived":
      return "survived";
    case "no_coverage":
    case "suspicious":
      return "undetected_denominator";
    default:
      return "excluded";
  }
}

// ============================================================
// normalize：scope 复核 + 重算 + 阈值判卷 → GateResultRecord
// ============================================================

const SNIPPET_CHARS = 200;

function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > SNIPPET_CHARS
    ? `${collapsed.slice(0, SNIPPET_CHARS)}…`
    : collapsed;
}

function formatPct(value: number): string {
  return value.toFixed(2);
}

/** mutmut 腿每条执行记录恒携带的能力落差注记（B2-4「如实标注」纪律的机器留痕位）。 */
export const MUTMUT_GAP_NOTE =
  "能力落差（B2-4 如实标注）：mutmut 无 schema 化 JSON 报告 / killed 条目无逐 mutant 位置 / 无变异算子字段 / no_coverage 与 suspicious 不可区分 / suspicious 保守入分母不计分子——不与 StrykerJS 同强度";

/** mutant → items.location 可移植词形（仓内相对 file:line；无位置 → mutant:<id>）。 */
function mutantLocation(m: MutantEntry): string {
  if (m.file === null) {
    return m.id === null ? "mutant:unknown" : `mutant:${m.id}`;
  }
  return m.line === null ? m.file : `${m.file}:${String(m.line)}`;
}

/**
 * mutation 腿判卷核心（scope 复核 → 重算 → 双阈值判罚）。
 * 口径声明：counts 以「阈值违例条目」为载体粒度（violations ∈ [0,2]，决策 D2）；
 * items 载体 = 阈值违例 + 幸存者明细（PRD §28 survivor list，判卷留痕非逐条判罚）——
 * 两块粒度刻意不同（build adapter 同款声明）。notApplicable = scope 外条目数（工具无视
 * scope 旗标的显式计数，决策 D3）；blindspot 载体 = 报告内 mutants 全集。
 */
export function normalizeMutationLeg(
  raw: MutationLegOutput,
  selfMs: number,
): GateResultRecord {
  const plan = raw.plan;
  if (raw.kind !== "executed") {
    // spawn_failed（探测/子进程不可执行）与 pre_run_failed（报告路径非法/陈旧报告删不掉）
    // 同走 not_run 非绿非红；failureReason 携带具体路标。
    return absenceRecord(
      plan,
      "not_run",
      `${raw.failureReason ?? "mutation 腿子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  if (raw.reportText === null) {
    return absenceRecord(
      plan,
      "not_run",
      `变异测试报告未产出/不可读：${plan.reportPath}（runner=${plan.runner}；工具 exit=${String(raw.exitCode)} 不构成通过也不构成失败——退出码是第三方工具自身语义（stryker 内部阈值不达标亦 exit 1），本 gate 判卷锚唯一=报告重算；核对报告落点与命令重定向后重跑）（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  const metrics = parseMutationReport(plan.runner, raw.reportText);
  if (metrics === null) {
    return absenceRecord(
      plan,
      "not_run",
      `变异测试报告词形不可解析（runner=${plan.runner}，报告=${plan.reportPath}）——stryker 需 json reporter 产物（mutation-testing-elements 词形，status 七态词表）；mutmut 需 junitxml 导出词形（failure=survived / error=timeout / skipped message∈{suspicious,skipped,untested}）；词表外状态一律 malformed 非默认值；报告摘录：${truncate(raw.reportText.slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  // —— 判卷面 scope 复核（决策 D3）：file ∈ changedFiles 才入分母；scope 外条目显式计数。
  const scopeSet = new Set(plan.changedFiles.map((f) => normalizedKey(f)));
  const inScope: MutantEntry[] = [];
  const unattributed: MutantEntry[] = [];
  let outOfScope = 0;
  for (const m of metrics.mutants) {
    if (m.file === null) {
      // 词形未携带位置（mutmut killed 形态，能力落差 2）：按命令面 --paths-to-mutate
      // 信任计数（工具已被命令面收窄），披露「scope 归属不可复核」。
      inScope.push(m);
      unattributed.push(m);
      continue;
    }
    if (scopeSet.has(m.file)) {
      inScope.push(m);
    } else {
      outOfScope += 1;
    }
  }

  if (inScope.length === 0) {
    return absenceRecord(
      plan,
      "not_run",
      `changed-code scope 内零 mutants（scope 分母 ${plan.changedFiles.length} 个文件，报告内 ${metrics.mutants.length} 条全在 scope 外或空报告）——禁把空分母当 0% 或 100%；核对 changedFiles 与工具 scope 旗标是否真被消费（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  const stats = summarizeMutants(inScope);
  const survivors = survivingMutants(inScope);
  const observed = raw.observedToolVersion;
  const effectiveVersion = observed ?? plan.toolVersion;

  const caps: string[] = [];
  if (
    observed !== null &&
    plan.expectedToolVersion !== null &&
    observed !== plan.expectedToolVersion
  ) {
    caps.push("tool_version_drifted");
  }

  // —— 双阈值判罚（决策 D2；violations 载体=阈值违例条目）。
  const items: GateResultItemInput[] = [];
  const thresholdSuffix = plan.thresholdsProvisional
    ? `（阈值${MUTATION_THRESHOLD_APPROVED_NOTE}）`
    : "（配置显式供给）";
  if (stats.scorePercent < plan.thresholds.minKillScore) {
    items.push({
      rule: "mutation_kill_score_below_threshold",
      location: plan.reportPath,
      message: `kill score ${formatPct(stats.scorePercent)}%（detected ${String(stats.detected)}/${String(stats.generated)}，changed-code scope）< 阈值 ${formatPct(plan.thresholds.minKillScore)}%${thresholdSuffix}——L6-1「kill score ≥85%（changed-code scope）」`,
    });
  }
  if (survivors.length > plan.thresholds.maxSurvivors) {
    items.push({
      rule: "mutation_survivors_above_cap",
      location: plan.reportPath,
      message: `幸存者 ${String(survivors.length)} > 上限 ${String(plan.thresholds.maxSurvivors)}${thresholdSuffix}——随版计划 B2-3「survivor 上限」`,
    });
  }
  // 幸存者明细（PRD §28 survivor list 支持面；判卷留痕非逐条判罚——粒度声明见头注）。
  const survivorItems: GateResultItemInput[] = survivors.map((m) => ({
    rule: "mutation_survived",
    location: mutantLocation(m),
    message: `变异体幸存${m.mutatorName === null ? "（mutator 词形缺席：mutmut junitxml 无变异算子字段——能力落差）" : `（${m.mutatorName}）`}；mutant id=${m.id ?? "unknown"}`,
  }));

  const violations = items.length;
  let verdict: GateResult["verdict"];
  let capReason: string | null;
  if (violations > 0) {
    // failed 不被 cap 洗白（与 vitest/pytest/oasdiff/coverage/crap 腿同一条线）。
    verdict = "failed";
    capReason = null;
  } else if (caps.length > 0) {
    verdict = "warning";
    capReason = caps.join("+");
  } else {
    verdict = "passed";
    capReason = null;
  }

  const outOfScopeNote =
    outOfScope > 0
      ? `；scope 外 ${String(outOfScope)} 条（工具无视 scope 旗标的越界产出——不入分母不入分子，notApplicable 显式计数）`
      : "";
  const unattributedNote =
    unattributed.length > 0
      ? `；scope 归属不可复核 ${String(unattributed.length)} 条（mutmut killed 词形无逐 mutant 位置——按命令面 --paths-to-mutate 信任计数，能力落差 2）`
      : "";
  const runnerNote =
    plan.runner === "mutmut" ? `；${MUTMUT_GAP_NOTE}` : "";
  const exitNote = `exit=${String(raw.exitCode)}（第三方工具自身语义非本 gate 判卷锚——stryker 内部阈值不达标亦 exit 1；判卷锚=报告重算）`;
  const scopeNote =
    `MUTATION（runner=${plan.runner}，changed-code scope ${String(plan.changedFiles.length)} 文件，命令面 scope 旗标 + 判卷面逐条复核双重强制）：` +
    `报告内 ${String(metrics.mutants.length)} 条，in-scope 分母 ${String(stats.generated)}，幸存者 ${String(survivors.length)}；` +
    `kill score=${formatPct(stats.scorePercent)}%（detected=${String(stats.detected)}：killed ${String(stats.killed)} + timeout ${String(stats.timeout)}；generated=${String(stats.generated)}：survived ${String(stats.survived)} + no_coverage ${String(stats.noCoverage)} + suspicious ${String(stats.suspicious)}；排除类 ${String(stats.excluded)}）；` +
    `阈值 minKillScore=${formatPct(plan.thresholds.minKillScore)}% maxSurvivors=${String(plan.thresholds.maxSurvivors)}${plan.thresholdsProvisional ? `（${MUTATION_THRESHOLD_APPROVED_NOTE}）` : "（配置显式供给）"}；` +
    `档位=${plan.tier}${outOfScopeNote}${unattributedNote}${runnerNote}；${exitNote}`;

  const cappedItems = capItems([...items, ...survivorItems]);

  const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
    grn: plan.grn,
    gate: plan.gate,
    gateDef: plan.gateDef,
    ranAtSeq: plan.ranAtSeq,
    verdict,
    verdictCapReason: capReason,
    subjectId: plan.subjectId === null ? null : (plan.subjectId as GateResult["subjectId"]),
    isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
    denominatorRefs: plan.denominatorRefs.map((ref) => ({
      id: ref.id as GateResult["denominatorRefs"][number]["id"],
      versionSeen: ref.versionSeen,
    })),
    counts: {
      // 载体 = 阈值违例条目（0-2，决策 D2）。
      scanned: metrics.mutants.length,
      applicableScanned: stats.generated,
      violations,
      notApplicable: outOfScope,
    },
    blindspot: {
      // 载体 = 报告内 mutants 全集（scope 外 = 判卷逃逸面）。
      scanned: metrics.mutants.length,
      produced: stats.generated,
      escapeRatio:
        metrics.mutants.length === 0 ? 0 : outOfScope / metrics.mutants.length,
    },
    trust: {
      // 逐 mutant status 是工具测量输出且本词形无自报 score 位；violations 由双阈值
      // 重算得出（C5，coverage/crap 腿同款 asserted=null）。
      asserted: null,
      recomputed: { violations, matchesAsserted: true },
    },
    durationMs: { self: selfMs, external: raw.externalMs },
  };
  return {
    ...record,
    tool: plan.tool,
    toolVersion: effectiveVersion,
    metricDialect: plan.metricDialect,
    scopeNote,
    ...(cappedItems.items.length > 0 ? { items: cappedItems.items } : {}),
    ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
  };
}

// ============================================================
// 命令组装（mutation-adapter prepare 消费；单一实现防两 adapter 漂移）
// ============================================================

/**
 * StrykerJS 腿命令组装：声明命令 + `--mutate "<逗号联集>"`（changed-code scope 命令面；
 * 判卷面复核另在 normalizeMutationLeg——双面强制见决策 D3）。
 */
export function buildStrykerCommand(command: string, changedFiles: readonly string[]): string {
  return `${command} --mutate "${changedFiles.join(",")}"`;
}

/** mutmut 腿命令组装：声明命令 + `--paths-to-mutate "<逗号联集>"`（同上）。 */
export function buildMutmutCommand(command: string, changedFiles: readonly string[]): string {
  return `${command} --paths-to-mutate "${changedFiles.join(",")}"`;
}

/** mutation 腿 gate ①a 可执行体（firstCommandToken 同源；stryker=corepack / mutmut=python）。 */
export function mutationLegExecutable(runner: "stryker" | "mutmut"): string {
  return runner === "stryker"
    ? firstCommandToken(STRYKER_VERSION_PROBE_COMMAND)
    : firstCommandToken(MUTMUT_VERSION_PROBE_COMMAND);
}

/** 报告文件仓内相对路径解析（缺省按 runner；显式声明覆盖，分隔符归一）。 */
export function resolveMutationReportPath(
  runner: "stryker" | "mutmut",
  configValue: string | null,
): string {
  return (configValue ?? (runner === "stryker" ? STRYKER_DEFAULT_REPORT : MUTMUT_DEFAULT_REPORT))
    .replaceAll("\\", "/");
}
