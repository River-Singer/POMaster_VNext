/**
 * coverage-leg.ts —— COVERAGE 门禁执行腿（c8 JS/TS 腿 + pytest-cov Python 腿）
 * （P23 / 随版计划 Batch 2 B2-1「c8 / JaCoCo / pytest-cov | 强制上报行/分支口径
 * （CRAP 地基）」；D17 Python 首发顺序 → pytest-cov 先行，JaCoCo 属 Java 第二波，
 * 显式 deferred 不在本腿）。
 *
 * 职责边界（run + normalize + 报告解析；探测归 detectors.detectC8/detectPytestCov，
 * 声明解析归 coverage-adapter）：第三方工具不进 Core（§5.1/§59），只交付 adapter
 * 四段契约 + 归一化；第三方报告文本止步于本文件。
 *
 * - run（P22 三腿同款三道闸先例）：
 *   ⓪ 可执行体 PATH 探测（gate ①a，P22 红队 MAJOR 缺席误红修复）：c8 腿扫命令链首
 *   token `corepack`（dependency-cruiser 腿同源——c8 经 pnpm 从 node_modules/.bin
 *   解析不在 PATH）；pytest-cov 腿扫 `python`（firstCommandToken 同源）。缺席 →
 *   spawn_failed → not_run 带留痕；
 *   ① `--version` 版本探测（gate ①b，探测语义收紧）：必须「退出 0 且报出版本词形」
 *   才算可执行（Windows cmd 缺席形态 = status=1+error=null；c8 词形漂移风险以
 *   sanitizeSemver 不可得拦截）→ spawn_failed → not_run，禁猜测版本口径；
 *   ② 真执行产出覆盖率报告（行/分支口径强制上报）：c8 腿
 *   `corepack pnpm exec c8 --reporter=json-summary --reports-dir="<dir>" <测试命令>`；
 *   pytest-cov 腿（D17 先行）`python -m pytest -p no:cacheprovider --cov=<target>
 *   --cov-branch --cov-report=json:"<file>"`——`--cov-branch` 是分支口径的强制开关
 *   （无此旗标 coverage.py 只测行，分支口径缺席在 normalize 侧即 malformed）。
 *   报告文件回读作为 normalize 输入（pytest-leg 报告回读同款先例）。
 *   ② 前报告失效化（P23 红队 MAJOR「陈旧报告误绿通道」修复，C1 纪律）：spawn 前
 *   先删声明报告路径（rmSync）——上次 run 遗留的同路径报告在本 run 未真执行产出前
 *   绝不可被读回判卷（失效场景：pytest-cov 插件缺席 → gate ① `--version` 探测不加载
 *   插件照常过 → 真执行 exit 4 unrecognized --cov → 若无失效化，遗留 coverage.json
 *   会被当作本次判卷锚冒充 passed/failed）；删除失败且文件仍在 → pre_run_failed
 *   → not_run（fail-closed，禁在无法保证新鲜性时执行）；报告路径空/越出项目根同理
 *   拒绝（rmSync 是破坏性操作，越界面封死——禁让失效化面变成任意文件删除面）。
 *   回读前存在性校验：报告缺席 = null → not_run（禁猜测判卷）。
 *   ——选型说明：未取 pytest-leg mkdtemp 临时落点先例，因 COVERAGE 的报告落点
 *   （coverage-gate.json coverageReport 声明路径）是配置面契约：CRAP 腿按
 *   「先跑 COVERAGE gate 产出报告后再跑 CRAP」消费同路径文件，临时落点会切断该
 *   契约且给 CRAP 腿留下同款 stale 通道；rmSync 失效化一处同时封死两腿通道并保住
 *   「成功 run 刷新声明路径报告」语义。
 * - exit=4 语义修正（与 detectors.detectPytestCov 头注承诺对齐）：pytest-cov 腿
 *   命令全为合成、无被包裹用户命令——pytest usage error（exit 4 = unrecognized
 *   arguments）= --cov 旗标未被识别 = 插件缺席形态 → not_run 带安装路标
 *   （非「被包裹测试命令语义」；c8 腿不适用——包裹命令退出码语义任意）。
 * - normalize 判卷锚（C5 重算权威）：
 *   · 退出码不是判卷锚——c8 腿退出码继承被包裹测试命令的语义（任意），pytest-cov
 *   腿退出码是 pytest 自身语义（合成命令）；测试失败归 BUILD gate（§26.2
 *   BUILD/COVERAGE 分工）；本 gate 判卷锚 = 报告重算。
 *   · 行/分支口径强制上报（随版计划 B2-1 原文）：报告缺行口径或缺分支口径 →
 *   malformed → not_run（非绿非红，非默认值——禁把缺席口径当 0% 或 100%）。
 *   · violations 语义 = 低于阈值口径：lines < thresholds.lines / branches <
 *   thresholds.branches 各记一条违规（items 明细携带实测值/阈值/provisional 注记，
 *   可复算对账）；violations>0 → failed（cap 不洗白）；版本漂移 → passed 降 warning。
 * - 阈值 provisional 纪律：默认阈值行 80 / 分支 60 是 provisional 出厂兜底
 *   （「provisional 待 A4 打包批准」，PRD §26.2 CRAP 注「不把某个数字当成永久真理」；
 *   benchmarks/calibration-approval.json system_can_not_self_approve 同款纪律）；
 *   scopeNote 必带注记，呈报项登记见 PROVISIONAL_THRESHOLD_REGISTRATIONS（crap.ts）。
 *
 * PATH 引号消毒（phaseC 附录 A 教训，与 pytest-leg/oasdiff-leg 同源）；
 * spawn maxBuffer = SPAWN_MAX_BUFFER_BYTES（64MB，P22 三腿先例）；
 * D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  join as pathJoin,
  dirname as pathDirname,
  isAbsolute as pathIsAbsolute,
  relative as pathRelative,
  resolve as pathResolve,
} from "node:path";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
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

export const COVERAGE_GATE_NAME = "COVERAGE";
export const COVERAGE_GATE_DEF = "POLICY.GATE.COVERAGE@0.1.0";
export const COVERAGE_GATE_CONFIG_FILE = "coverage-gate.json";
export const C8_TOOL_ID = "gauntlet:c8";
export const PYTEST_COV_TOOL_ID = "gauntlet:pytest-cov";
/** coverage adapter 自身身份（配置缺席等 runner 未定态的探测/缺席记录 tool 词形）。 */
export const COVERAGE_ADAPTER_TOOL_ID = "gauntlet:coverage";
/** coverage 类型 metric_dialect（出口判据：GateResult 必带 coverage 类型口径；03 schema 注：「coverage 行/分支混用即口径漂移」——复合口径一词形钉死，禁混用）。 */
export const C8_METRIC_DIALECT = "coverage:c8_lines_branches";
export const PYTEST_COV_METRIC_DIALECT = "coverage:pytest_cov_lines_branches";
/**
 * 缺席记录的机器可辨口径轴（P12c policySkip 映射裁定同款：与执行腿口径在记录级区分，
 * 不靠人读 scopeNote；verdict=not_run + counts.notApplicable=1）。
 */
export const COVERAGE_POLICY_SKIP_METRIC_DIALECT = "coverage:policy_skip";
/** 配置缺席态（not_configured）的口径轴词形（缺席原因可机器归类的显式留痕位）。 */
export const COVERAGE_METRIC_DIALECT_UNDECLARED = "coverage:undeclared";
export const C8_VERSION_PROBE_COMMAND = "corepack pnpm exec c8 --version";
/** c8 报告目录缺省（--reports-dir；json-summary reporter 固定产出 coverage-summary.json）。 */
export const C8_DEFAULT_REPORTS_DIR = "coverage";
export const C8_SUMMARY_FILE_NAME = "coverage-summary.json";
/** pytest-cov 报告文件缺省（--cov-report=json 落点）。 */
export const PYTEST_COV_DEFAULT_REPORT = "coverage.json";
export const DEFAULT_COVERAGE_TIMEOUT_MS = 600_000;

// ============================================================
// 阈值 provisional 纪律（A4 对齐点；配置化覆盖，未配置时的出厂兜底）
// ============================================================

/**
 * coverage 行/分支阈值出厂兜底（provisional）：
 * 「provisional 待 A4 打包批准」——wave3-plan.md P23【阈值初值 Owner 批准位（A4 打包）】；
 * 阈值必须配置化（PRD §26.2 CRAP 注：不把某个数字当成永久真理）；系统不自批为永久值
 * （benchmarks/calibration-approval.json system_can_not_self_approve 同款纪律）。
 */
export const COVERAGE_PROVISIONAL_THRESHOLDS = {
  lines: 80,
  branches: 60,
} as const;

/** provisional 注记原文（scopeNote 与呈报项登记共用，逐字含「provisional」「A4」）。 */
export const PROVISIONAL_THRESHOLD_NOTE =
  "provisional 待 A4 打包批准（wave3-plan.md P23 阈值初值 Owner 批准位；PRD §26.2：不把某个数字当成永久真理；系统不自批为永久值）";

/**
 * P23 provisional 阈值呈报项登记（机器可读；呈报 Owner A4 打包批准位）。
 * 词形锚：key = 配置面键位；value = 出厂兜底值；status 恒为 provisional——
 * 任何把本表项改成 approved/permanent 的改动都必须来自 Owner 批准（A4），
 * 系统与测试面禁止自批（呈报项登记测试钉住 provisional 词形）。
 */
export const PROVISIONAL_THRESHOLD_REGISTRATIONS = [
  {
    key: "coverage-gate.json thresholds.lines",
    value: COVERAGE_PROVISIONAL_THRESHOLDS.lines,
    status: "provisional" as const,
    note: PROVISIONAL_THRESHOLD_NOTE,
  },
  {
    key: "coverage-gate.json thresholds.branches",
    value: COVERAGE_PROVISIONAL_THRESHOLDS.branches,
    status: "provisional" as const,
    note: PROVISIONAL_THRESHOLD_NOTE,
  },
];

// ============================================================
// spawn：PATH 引号消毒默认实现（与 pytestSpawn/oasdiffSpawn 同源同款）
// ============================================================

/** coverage 腿默认 spawn：PATH 消毒 + shell:true + 显式 64MB maxBuffer（P22 三腿先例）。 */
export const coverageSpawn: SpawnFn = (command, options) => {
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

/**
 * coverage 腿执行计划（coverage-adapter prepare 组装；字段是 RecordPlanFields 结构子集）。
 * absenceKind（contract-adapter ContractGatePlan 同款缺席分流形态）：
 * - null = 判卷就绪（command/versionProbeCommand 在场）；
 * - "profile_not_required" = MINIMAL/LIGHT/FAST 档合法缺席（policy_skip → not_run+notApplicable=1）；
 * - "config_absent" = coverage-gate.json 未声明/坏形（→ not_configured）；
 * - "tool_absent" = 配置就绪但 runner 工具不在位（→ not_run 非绿非红）。
 */
export interface CoverageLegPlan extends RecordPlanFields {
  readonly projectRoot: string;
  /** c8 | pytest-cov（D17：pytest-cov 先行；JaCoCo/Java 第二波 deferred）。 */
  readonly runner: "c8" | "pytest-cov";
  /** 触发方式（structural 词表；oasdiff 腿计划同款锚）。 */
  readonly trigger: RunTriggerValue;
  readonly absenceKind: "profile_not_required" | "config_absent" | "tool_absent" | null;
  readonly absentReason: string | null;
  readonly absentHint: string | null;
  /** 档位（normalize 的 policy_skip 注记与判卷面留痕；prepare 解析自 policy.gateTier）。 */
  readonly tier: GateTier;
  /** 真执行命令（含覆盖率报告旗标；prepare 组装；缺席态为空串）。 */
  readonly command: string;
  readonly versionProbeCommand: string;
  /** gate ①a 可执行体词形（c8=corepack / pytest-cov=python）。 */
  readonly executable: string;
  readonly timeoutMs: number;
  /** 仓内相对报告文件路径（run 侧回读 + items.location + scopeNote 可移植词形）。 */
  readonly coverageReportPath: string;
  readonly thresholds: { readonly lines: number; readonly branches: number };
  /** true = 阈值来自出厂兜底（provisional 待 A4）；false = 配置显式供给。 */
  readonly thresholdsProvisional: boolean;
  /** 版本锚（policy 供给；可选——c8 腿以 package.json 声明版本为 toolVersion）。 */
  readonly expectedToolVersion: string | null;
}

export type CoverageLegOutput = {
  readonly plan: CoverageLegPlan;
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
  /**
   * pytest-cov 腿 exit 4（usage error：合成命令的 --cov 旗标未被识别 = 插件缺席
   * 形态）→ normalize 落 not_run 带安装路标（detectors.detectPytestCov 头注承诺的
   * 对齐位）；c8 腿恒 false（包裹命令退出码语义任意，不在此轴）。
   */
  readonly runnerUsageError: boolean;
  readonly externalMs: number;
  readonly failureReason: string | null;
};

/**
 * coverage 腿执行：可执行体前置闸 + 版本探测 + 报告失效化 + 真执行 + 报告回读。
 * 报告文件从仓内计划路径回读——第三方报告文本止步于此（normalize 只认报告文本）。
 * spawn 前 rmSync 失效化（P23 红队 MAJOR）：陈旧遗留报告禁跨 run 存活冒充本次判卷锚。
 */
export function runCoverageLeg(
  plan: CoverageLegPlan,
  spawnFn: SpawnFn = coverageSpawn,
  executableProbe: ExecutableProbeFn = platformExecutableProbe,
): CoverageLegOutput {
  // —— 前置闸①a：可执行体 PATH 探测（import-linter 腿同款；Windows cmd 缺席以
  // status=1+error=null 伪装执行失败，spawn 前先证在位）。
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
      runnerUsageError: false,
      externalMs: 0,
      failureReason: `coverage 腿可执行体 ${plan.executable} 不在 PATH（工具缺席——Windows cmd 下会以 status=1+error=null 伪装成执行失败，故 spawn 前先证在位）；hint: 按 coverage-gate.json runner 对应指引安装后重跑`,
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
      runnerUsageError: false,
      externalMs: probe.externalMs,
      failureReason: `coverage 腿版本探测失败（runner=${plan.runner}, status=${String(probe.status)}, error=${probe.error ?? "unknown"}, 版本词形${observedToolVersion === null ? "不可得" : "可得"}）——工具缺席或损坏（Windows cmd 缺席形态即 status=1+error=null）；hint: 按探测面指引安装后重跑`,
    };
  }

  // —— 前置闸②a：判卷锚路径安全闸（失效化 rmSync 是破坏性操作的前置：空路径/
  // 越出项目根一律拒绝执行——禁让失效化面变成任意文件删除面）。
  const reportAbs = coverageReportAbsolutePath(plan.projectRoot, plan.coverageReportPath);
  if (plan.coverageReportPath.length === 0 || pathEscapesProjectRoot(plan.projectRoot, reportAbs)) {
    return {
      plan,
      kind: "pre_run_failed",
      exitCode: null,
      stdout: "",
      stderr: "",
      observedToolVersion,
      reportText: null,
      runnerUsageError: false,
      externalMs: probe.externalMs,
      failureReason: `coverage 腿报告路径非法：coverageReportPath=${plan.coverageReportPath === "" ? "(空)" : plan.coverageReportPath}（空路径或越出项目根——spawn 前失效化面拒绝执行，fail-closed）`,
    };
  }

  // —— 前置闸②b：报告失效化（P23 红队 MAJOR「陈旧报告误绿通道」封死）：spawn 前
  // 先删声明报告路径——上次 run 遗留的报告在本 run 未真执行产出前绝不可被读回判卷
  // （C1：陈旧数据冒充本次判卷锚不可容忍）。删除失败且文件仍在（占用/权限/目录占位）
  // = 无法保证新鲜性 → pre_run_failed（fail-closed，禁带陈旧锚执行）。
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
      runnerUsageError: false,
      externalMs: probe.externalMs,
      failureReason: `coverage 腿报告失效化失败：${plan.coverageReportPath} 在 spawn 前无法删除（被占用/权限不足/路径为目录占位）——无法保证本次判卷锚新鲜，fail-closed 拒绝执行`,
    };
  }

  // —— ② 真执行 + 报告回读（退出码语义见文件头注，非判卷锚——normalize 以报告为锚）。
  const run: SpawnOutcome = spawnFn(plan.command, {
    cwd: plan.projectRoot,
    timeoutMs: plan.timeoutMs,
  });
  // 回读前存在性校验：报告缺席 = null → normalize 诚实 not_run（禁猜测判卷）。
  let reportText: string | null = null;
  try {
    reportText = readFileSync(reportAbs, "utf8");
  } catch {
    reportText = null;
  }
  // exit=4 语义修正（detectors.detectPytestCov 头注承诺的对齐位）：pytest-cov 腿
  // 命令全为合成，pytest usage error exit 4 = --cov 旗标未被识别 = 插件缺席形态；
  // c8 腿不适用（被包裹命令退出码任意——包裹 pytest 自身也可能 exit 4）。
  const runnerUsageError = plan.runner === "pytest-cov" && run.status === 4;
  const spawnFailed = run.error !== null || run.status === null;
  return {
    plan,
    kind: spawnFailed ? "spawn_failed" : "executed",
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    observedToolVersion,
    reportText,
    runnerUsageError,
    externalMs: probe.externalMs + run.externalMs,
    failureReason: spawnFailed
      ? `coverage 腿子进程执行失败（runner=${plan.runner}, status=${String(run.status)}, error=${run.error ?? "unknown"}）`
      : null,
  };
}

/** 报告绝对路径是否越出项目根（含路径即根——rmSync 破坏性面前置拒绝判据）。 */
function pathEscapesProjectRoot(projectRoot: string, absolutePath: string): boolean {
  const rel = pathRelative(pathResolve(projectRoot), pathResolve(absolutePath));
  return rel === "" || rel.startsWith("..") || pathIsAbsolute(rel);
}

// ============================================================
// 报告解析（行/分支口径强制上报；缺席口径 = malformed 非默认值）
// ============================================================

/** 单文件覆盖率条目（branchesPct=null = 该文件分支口径缺席；行口径恒在）。 */
export interface FileCoverageEntry {
  readonly linesPct: number;
  readonly branchesPct: number | null;
}

/** 覆盖率报告解析产物（totals 判卷 + 逐文件分母；CRAP 腿消费 files 做连接）。 */
export interface CoverageReportMetrics {
  readonly linesPct: number;
  readonly branchesPct: number;
  /** 逐文件条目（键 = 报告内路径原文；c8 = total 以外的键；pytest-cov = files 键）。 */
  readonly files: ReadonlyMap<string, FileCoverageEntry>;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedKey(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * 解析 c8 `--reporter=json-summary` 的 coverage-summary.json：
 * `{ "total": { "lines": {pct, covered, total}, "branches": {...} }, "<file>": {...} }`。
 * 行/分支百分比从整数计数重算（C5 一条线：不信工具自报 pct 字段——与 pytest-cov 腿
 * 同款；pct 字段不消费，顺带免疫 istanbul 词形 pct="80%" 字符串漂移）。强制口径：
 * lines/branches 的 covered/total 四计数必须同为有限数且被测量行/分支数 >0——任一
 * 缺席/退化 → null（malformed → not_run，禁默认值；行/分支混用即口径漂移的结构性
 * 预防）。逐文件条目同构重算（行计数缺席 → 该文件跳过；branches.total=0 → 该文件
 * branchesPct=null）。
 */
export function parseC8Summary(text: string): CoverageReportMetrics | null {
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
  const total = record["total"];
  if (total === null || typeof total !== "object" || Array.isArray(total)) {
    return null;
  }
  const totalRecord = total as Record<string, unknown>;
  const lines = totalRecord["lines"];
  const branches = totalRecord["branches"];
  if (lines === null || typeof lines !== "object" || branches === null || typeof branches !== "object") {
    return null;
  }
  const linesRecord = lines as Record<string, unknown>;
  const branchesRecord = branches as Record<string, unknown>;
  const linesCovered = finiteNumber(linesRecord["covered"]);
  const linesTotal = finiteNumber(linesRecord["total"]);
  const branchesCovered = finiteNumber(branchesRecord["covered"]);
  const branchesTotal = finiteNumber(branchesRecord["total"]);
  if (
    linesCovered === null ||
    linesTotal === null ||
    linesTotal <= 0 ||
    branchesCovered === null ||
    branchesTotal === null ||
    branchesTotal <= 0
  ) {
    // 缺口径计数/零测量 = malformed（非默认值）——not_run 由 normalize 落判。
    return null;
  }
  // C5：计数为唯一判卷锚，百分比一律本侧重算（工具自报 pct 不读）。
  const linesPct = (linesCovered / linesTotal) * 100;
  const branchesPct = (branchesCovered / branchesTotal) * 100;
  const files = new Map<string, FileCoverageEntry>();
  for (const [key, value] of Object.entries(record)) {
    if (key === "total" || value === null || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const fileRecord = value as Record<string, unknown>;
    const fileLines = fileRecord["lines"];
    const fileBranches = fileRecord["branches"];
    if (fileLines === null || typeof fileLines !== "object") {
      continue;
    }
    const fileLinesRecord = fileLines as Record<string, unknown>;
    const fileLinesCovered = finiteNumber(fileLinesRecord["covered"]);
    const fileLinesTotal = finiteNumber(fileLinesRecord["total"]);
    if (fileLinesCovered === null || fileLinesTotal === null || fileLinesTotal <= 0) {
      continue;
    }
    const fileBranchesRecord =
      fileBranches !== null && typeof fileBranches === "object"
        ? (fileBranches as Record<string, unknown>)
        : null;
    const fileBranchesCovered =
      fileBranchesRecord === null ? null : finiteNumber(fileBranchesRecord["covered"]);
    const fileBranchesTotal =
      fileBranchesRecord === null ? null : finiteNumber(fileBranchesRecord["total"]);
    files.set(
      normalizedKey(key),
      {
        linesPct: (fileLinesCovered / fileLinesTotal) * 100,
        branchesPct:
          fileBranchesCovered !== null &&
          fileBranchesTotal !== null &&
          fileBranchesTotal > 0
            ? (fileBranchesCovered / fileBranchesTotal) * 100
            : null,
      },
    );
  }
  return { linesPct, branchesPct, files };
}

/**
 * 解析 pytest-cov `--cov-report=json` 的 coverage.json（coverage.py JSON 词形）：
 * `{ "totals": { covered_lines, num_statements, num_branches, covered_branches }, "files": {...} }`。
 * 行/分支百分比从整数计数重算（C5：不信工具自报百分比字段）；强制口径：
 * num_statements>0 且 num_branches>0 且 covered_* 均为有限数——任一缺席 → null
 * （malformed → not_run；`--cov-branch` 未生效时 num_branches 缺席/为 0 即在此拦截）。
 */
export function parsePytestCovJson(text: string): CoverageReportMetrics | null {
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
  const totals = record["totals"];
  if (totals === null || typeof totals !== "object" || Array.isArray(totals)) {
    return null;
  }
  const totalsRecord = totals as Record<string, unknown>;
  const coveredLines = finiteNumber(totalsRecord["covered_lines"]);
  const numStatements = finiteNumber(totalsRecord["num_statements"]);
  const coveredBranches = finiteNumber(totalsRecord["covered_branches"]);
  const numBranches = finiteNumber(totalsRecord["num_branches"]);
  if (
    coveredLines === null ||
    numStatements === null ||
    numStatements <= 0 ||
    coveredBranches === null ||
    numBranches === null ||
    numBranches <= 0
  ) {
    return null;
  }
  const linesPct = (coveredLines / numStatements) * 100;
  const branchesPct = (coveredBranches / numBranches) * 100;
  const files = new Map<string, FileCoverageEntry>();
  const filesNode = record["files"];
  if (filesNode !== null && typeof filesNode === "object" && !Array.isArray(filesNode)) {
    for (const [key, value] of Object.entries(filesNode as Record<string, unknown>)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const summary = (value as Record<string, unknown>)["summary"];
      if (summary === null || typeof summary !== "object" || Array.isArray(summary)) {
        continue;
      }
      const s = summary as Record<string, unknown>;
      const sCoveredLines = finiteNumber(s["covered_lines"]);
      const sNumStatements = finiteNumber(s["num_statements"]);
      if (sCoveredLines === null || sNumStatements === null || sNumStatements <= 0) {
        continue;
      }
      const sNumBranches = finiteNumber(s["num_branches"]);
      const sCoveredBranches = finiteNumber(s["covered_branches"]);
      files.set(normalizedKey(key), {
        linesPct: (sCoveredLines / sNumStatements) * 100,
        branchesPct:
          sNumBranches !== null && sNumBranches > 0 && sCoveredBranches !== null
            ? (sCoveredBranches / sNumBranches) * 100
            : null,
      });
    }
  }
  return { linesPct, branchesPct, files };
}

/** 按 runner 分派报告解析（单一分派点——两腿词形互异，禁混用解析器）。 */
export function parseCoverageReport(
  runner: "c8" | "pytest-cov",
  text: string,
): CoverageReportMetrics | null {
  return runner === "c8" ? parseC8Summary(text) : parsePytestCovJson(text);
}

// ============================================================
// normalize：报告重算 + 阈值判卷 → GateResultRecord
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

/**
 * coverage 腿判卷核心（判卷矩阵见文件头注；C5：violations 从报告重算——
 * 口径：counts 以「行/分支两条强制口径」为载体粒度（scanned=2），violations =
 * 低于阈值的口径数；blindspot 以报告内文件为载体粒度（两块粒度不同是刻意设计，
 * build adapter「counts/blindspot 载体粒度不同」同款口径纪律）。
 */
export function normalizeCoverageLeg(
  raw: CoverageLegOutput,
  selfMs: number,
): GateResultRecord {
  const plan = raw.plan;
  if (raw.kind !== "executed") {
    // spawn_failed（探测/子进程不可执行）与 pre_run_failed（报告路径非法/陈旧报告
    // 删不掉——失效化面拒绝）同走 not_run 非绿非红；failureReason 携带具体路标。
    return absenceRecord(
      plan,
      "not_run",
      `${raw.failureReason ?? "coverage 腿子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  if (raw.runnerUsageError) {
    // exit=4 语义修正：非「被包裹测试命令语义」——pytest-cov 腿命令全为合成，
    // usage error = --cov 旗标被拒 = 插件缺席形态，按探测面承诺落 not_run 带安装
    // 路标（detectors.detectPytestCov 头注「探测面不冒充已验证」的对齐位）。
    return absenceRecord(
      plan,
      "not_run",
      `pytest-cov 插件缺席形态：pytest usage error（exit 4 = unrecognized arguments，本腿合成命令的 --cov 旗标未被识别——pytest.ini/pyproject 配置命中无法证明插件在位，run 期实测为准）——按探测面承诺落 not_run 带安装路标；hint: pip install pytest-cov 后重跑（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  if (raw.reportText === null) {
    return absenceRecord(
      plan,
      "not_run",
      `覆盖率报告未产出/不可读：${plan.coverageReportPath}（runner=${plan.runner}；工具 exit=${String(raw.exitCode)} 不构成通过——报告是唯一判卷锚；核对测试命令是否真正执行后重跑）（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  const metrics = parseCoverageReport(plan.runner, raw.reportText);
  if (metrics === null) {
    return absenceRecord(
      plan,
      "not_run",
      `覆盖率报告词形不可解析或缺强制口径（runner=${plan.runner}，报告=${plan.coverageReportPath}）——行/分支口径强制上报（随版计划 B2-1），缺任一口径按 malformed 落 not_run 禁默认值（c8 需 --reporter=json-summary 且 total.lines/branches 被测量；pytest-cov 需 --cov-branch 使 num_branches 在场且 >0）；报告摘录：${truncate(raw.reportText.slice(0, SNIPPET_CHARS)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

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

  const items: GateResultItemInput[] = [];
  if (metrics.linesPct < plan.thresholds.lines) {
    items.push({
      rule: "coverage_below_threshold",
      location: plan.coverageReportPath,
      message: `行口径 ${formatPct(metrics.linesPct)}% < 阈值 ${plan.thresholds.lines}%${plan.thresholdsProvisional ? `（阈值${PROVISIONAL_THRESHOLD_NOTE}）` : ""}`,
    });
  }
  if (metrics.branchesPct < plan.thresholds.branches) {
    items.push({
      rule: "coverage_below_threshold",
      location: plan.coverageReportPath,
      message: `分支口径 ${formatPct(metrics.branchesPct)}% < 阈值 ${plan.thresholds.branches}%${plan.thresholdsProvisional ? `（阈值${PROVISIONAL_THRESHOLD_NOTE}）` : ""}`,
    });
  }
  const violations = items.length;

  let verdict: VerdictValue;
  let capReason: string | null;
  if (violations > 0) {
    // failed 不被 cap 洗白（与 vitest/pytest/oasdiff 腿同一条线）。
    verdict = "failed";
    capReason = null;
  } else if (caps.length > 0) {
    verdict = "warning";
    capReason = caps.join("+");
  } else {
    verdict = "passed";
    capReason = null;
  }

  // exit 注记按 runner 分流（P23 红队 MINOR 误标注修正）：c8 腿命令含被包裹用户
  // 命令 → 退出码继承其语义；pytest-cov 腿命令全为合成 → 退出码是 pytest 自身
  // 语义（usage error 形态已在上方 runnerUsageError 落 not_run）。两腿共同点：
  // 测试失败归 BUILD gate，退出码均非本 gate 判卷锚。
  const exitNote =
    plan.runner === "c8"
      ? `runner=c8 exit=${String(raw.exitCode)}（被包裹测试命令语义，非本 gate 判卷锚——测试失败归 BUILD gate）`
      : `runner=pytest-cov exit=${String(raw.exitCode)}（pytest 自身退出码语义——本腿命令为合成命令、无被包裹用户命令；测试失败归 BUILD gate，非本 gate 判卷锚）`;
  const scopeNote =
    `行口径 ${formatPct(metrics.linesPct)}%（阈值 ≥${plan.thresholds.lines}）/ 分支口径 ${formatPct(metrics.branchesPct)}%（阈值 ≥${plan.thresholds.branches}）；` +
    `报告内文件 ${metrics.files.size} 个；` +
    `阈值 lines≥${plan.thresholds.lines} branches≥${plan.thresholds.branches}${plan.thresholdsProvisional ? `（${PROVISIONAL_THRESHOLD_NOTE}）` : "（配置显式供给）"}；` +
    `${exitNote}`;

  const cappedItems = capItems(items);
  const filesScanned = metrics.files.size;

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
      // 载体 = 行/分支两条强制口径（粒度声明见文件头注）。
      scanned: 2,
      applicableScanned: 2,
      violations,
      notApplicable: 0,
    },
    blindspot: {
      // 载体 = 报告内文件（口径缺席在 total 级已拦截 not_run，故 produced=scanned）。
      scanned: filesScanned,
      produced: filesScanned,
      escapeRatio: 0,
    },
    trust: {
      // 报告是工具测量输出而非自报判词；violations 由阈值重算得出（C5，oasdiff 同款 asserted=null）。
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
// 命令组装（coverage-adapter prepare 消费；单一实现防两 adapter 漂移）
// ============================================================

/** c8 腿命令组装（--reporter=json-summary + --reports-dir + 包裹测试命令）。 */
export function buildC8Command(reportsDirAbs: string, testCommand: string): string {
  return `corepack pnpm exec c8 --reporter=json-summary --reports-dir="${reportsDirAbs}" ${testCommand}`;
}

/** pytest-cov 腿命令组装（--cov=<target> + --cov-branch 强制分支口径 + json 报告落点）。 */
export function buildPytestCovCommand(covTarget: string, reportAbs: string): string {
  return `python -m pytest -p no:cacheprovider --cov="${covTarget}" --cov-branch --cov-report=json:"${reportAbs}"`;
}

/** coverage 腿 gate ①a 可执行体（firstCommandToken 同源；c8=corepack / pytest-cov=python）。 */
export function coverageLegExecutable(runner: "c8" | "pytest-cov"): string {
  return runner === "c8"
    ? firstCommandToken(C8_VERSION_PROBE_COMMAND)
    : firstCommandToken("python -m pytest --version");
}

/** 报告文件仓内相对路径解析（c8 = 报告目录 + reporter 固定文件名；pytest-cov = 声明文件路径）。 */
export function resolveCoverageReportPath(
  runner: "c8" | "pytest-cov",
  configValue: string | null,
): string {
  if (runner === "c8") {
    const dir = (configValue ?? C8_DEFAULT_REPORTS_DIR).replaceAll("\\", "/").replace(/\/$/, "");
    return `${dir}/${C8_SUMMARY_FILE_NAME}`;
  }
  return (configValue ?? PYTEST_COV_DEFAULT_REPORT).replaceAll("\\", "/");
}

/** 报告文件绝对路径（run 侧读取 / 命令旗标共用）。 */
export function coverageReportAbsolutePath(projectRoot: string, relativePath: string): string {
  return pathJoin(projectRoot, relativePath);
}

/** c8 --reports-dir 绝对路径（coverageReportPath 的目录段）。 */
export function c8ReportsDirAbsolute(projectRoot: string, coverageReportPath: string): string {
  return pathDirname(pathJoin(projectRoot, coverageReportPath));
}
