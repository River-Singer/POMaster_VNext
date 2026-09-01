/**
 * coverage-adapter.ts —— COVERAGE 门禁 adapter + COMPLEXITY/CRAP 门禁 adapter
 * （P23 / 随版计划 Batch 2 地基链；§59 GateAdapter 四段契约，P22 三腿同款先例）。
 *
 * 共享配置（coverage-gate.json，单一事实源，两 gate 各取所需）：
 *   {"runner":"c8","command":"corepack pnpm exec vitest run",
 *    "coverageReport":"coverage/coverage-summary.json",          // 可选（c8=报告目录词形/pytest-cov=文件词形，语义随 runner）
 *    "thresholds":{"lines":80,"branches":60},                    // 可选（缺省=出厂兜底：行阈值按档位分化 Owner 决议 2026-09-01，branches 60 未批）
 *    "crap":{"complexityReport":"reports/complexity.json","maxCrap":30}} // 可选（声明即激活 CRAP gate）
 *   pytest-cov 词形：{"runner":"pytest-cov","covTarget":"src", ...}（D17 先行）。
 *
 * - coverage adapter（gate=COVERAGE，metric_dialect=coverage:* 复合口径一词形）：
 *   detect = 配置 + runner 探测（detectC8/detectPytestCov，detectors 单一探测面）；
 *   prepare = 档位闸（MINIMAL/LIGHT/FAST → policy_skip 合法缺席，先于一切——P12c
 *   policySkip 先例）→ 配置闸（未声明 → not_configured）→ 工具闸（缺席 → not_run）；
 *   c8 腿版本锚取 package.json 声明版本（vitest 腿同款），pytest-cov 腿强制
 *   policy.expectedToolVersion（pytest 腿同款——Python 侧版本无法从配置文件可靠探测）；
 *   run = runCoverageLeg 三道闸（P22 先例）+ 报告回读；
 *   normalize = 报告重算 + 行/分支阈值判卷（violations=低于阈值口径）。
 * - crap adapter（gate=COMPLEXITY_CRAP，POMaster 原生公式 gauntlet:crap）：
 *   无第三方工具可探测——输入是两份第三方报告（复杂度 + 覆盖率），探测即配置面
 *   探测（crap 段未声明 = 合法未配置，非静默）；run 只读两份报告文件；判卷归
 *   crap.normalizeCrapLeg（fail-closed 输入闸 + HARDENING-only 判罚）。
 *
 * 缺席语义全部显式（C1）：profile_not_required → not_run+notApplicable=1（policy_skip
 * 口径，P12c 映射裁定）；config_absent / crap_not_declared → not_configured；
 * tool_absent / 输入缺席 / malformed → not_run。禁静默跳过当通过。
 * D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import { readFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { performance } from "node:perf_hooks";
import type {
  DetectionResult,
  DetectorFacts,
  ExecutableProbeFn,
  GateAdapter,
  GatePolicy,
  GateResultRecord,
  GateScope,
  GateTier,
  NormalizeContext,
  SpawnFn,
} from "./adapter-types.js";
import { GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import {
  DEFAULT_GATE_TIER,
  GATE_TIER_VALUES,
  POLICY_EXEMPT_GATE_TIERS,
} from "./adapter-types.js";
import {
  buildC8Command,
  buildPytestCovCommand,
  c8ReportsDirAbsolute,
  COVERAGE_ADAPTER_TOOL_ID,
  COVERAGE_GATE_CONFIG_FILE,
  COVERAGE_GATE_DEF,
  COVERAGE_GATE_NAME,
  COVERAGE_METRIC_DIALECT_UNDECLARED,
  COVERAGE_POLICY_SKIP_METRIC_DIALECT,
  coverageLegExecutable,
  coverageReportAbsolutePath,
  coverageSpawn,
  C8_METRIC_DIALECT,
  C8_TOOL_ID,
  C8_VERSION_PROBE_COMMAND,
  DEFAULT_COVERAGE_TIMEOUT_MS,
  normalizeCoverageLeg,
  PYTEST_COV_METRIC_DIALECT,
  PYTEST_COV_TOOL_ID,
  resolveCoverageProvisionalThresholdsForTier,
  resolveCoverageReportPath,
  runCoverageLeg,
  type CoverageLegOutput,
  type CoverageLegPlan,
} from "./coverage-leg.js";
import {
  CRAP_GATE_DEF,
  CRAP_GATE_NAME,
  CRAP_METRIC_DIALECT,
  CRAP_POLICY_SKIP_METRIC_DIALECT,
  CRAP_PROVISIONAL_MAX_CRAP,
  CRAP_TOOL_ID,
  normalizeCrapLeg,
  type CrapLegOutput,
  type CrapLegPlan,
} from "./crap.js";
import { detectC8, detectPytestCov, platformDetectorFacts } from "./detectors.js";
import {
  absenceRecord,
  assertCommonGates,
} from "./normalize-common.js";
import { platformExecutableProbe } from "./detectors.js";

// ============================================================
// 共享配置读取（coverage-gate.json；facts 注入零隐式 I/O）
// ============================================================

export const COVERAGE_CONFIG_HINT =
  "在项目根 coverage-gate.json 声明覆盖率判卷输入（P23）：" +
  'JS/TS 腿 {"runner":"c8","command":"<被 c8 包裹的测试命令>"}（需 package.json 声明 c8），' +
  'Python 腿（D17 先行）{"runner":"pytest-cov","covTarget":"<--cov 目标>"}（需 pytest 配置 + pytest-cov 插件）；' +
  '可选 "coverageReport"（c8=报告目录词形，reporter 固定产出 coverage-summary.json；pytest-cov=报告文件词形）、' +
  '"thresholds":{"lines":80,"branches":60}（缺省=出厂兜底：行阈值按档位分化 MINIMAL 80/LIGHT 60/STANDARD 30——Owner 决议 2026-09-01 批准，branches 60 未批维持出厂值）、' +
  '"crap":{"complexityReport":"<radon cc --json 或 {file:complexity} JSON 路径>","maxCrap":30}（声明即激活 COMPLEXITY/CRAP gate）——' +
  "未声明是诚实缺席（not_configured），不会被记为通过";

export interface CoverageThresholds {
  readonly lines: number;
  readonly branches: number;
}

export interface CoverageCrapConfig {
  /** 复杂度报告仓内相对路径（radon cc --json 词形或直拍 {file: complexity} 词形）。 */
  readonly complexityReport: string;
  /** CRAP 阈值（可选；缺省 CRAP_PROVISIONAL_MAX_CRAP=30，provisional 待 A4）。 */
  readonly maxCrap: number | null;
}

export interface CoverageGateConfig {
  readonly runner: "c8" | "pytest-cov";
  /** c8 腿：被包裹的测试命令（必填）。 */
  readonly testCommand: string | null;
  /** pytest-cov 腿：--cov 目标（必填）。 */
  readonly covTarget: string | null;
  /** 报告落点声明（可选）：c8=报告目录词形；pytest-cov=报告文件词形；null=runner 缺省。 */
  readonly coverageReport: string | null;
  /**
   * 阈值（可选；null=出厂兜底——行阈值按档位分化 MINIMAL 80/LIGHT 60/STANDARD 30
   * （Owner 决议 2026-09-01 批准），branches 60 未批维持出厂值）。
   */
  readonly thresholds: CoverageThresholds | null;
  /** CRAP 腿声明（可选；null=CRAP gate 合法未配置 not_configured 非静默）。 */
  readonly crap: CoverageCrapConfig | null;
}

export type CoverageConfigRead =
  | { readonly ok: true; readonly config: CoverageGateConfig; readonly evidence: string }
  | { readonly ok: false; readonly reason: string; readonly installHint: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseThresholds(value: unknown): CoverageThresholds | "invalid" | null {
  if (value === undefined) {
    return null;
  }
  if (!isPlainObject(value)) {
    return "invalid";
  }
  const lines = value["lines"];
  const branches = value["branches"];
  const valid = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100;
  if (!valid(lines) || !valid(branches)) {
    return "invalid";
  }
  return { lines, branches };
}

function parseCrapConfig(value: unknown): CoverageCrapConfig | "invalid" | null {
  if (value === undefined) {
    return null;
  }
  if (!isPlainObject(value)) {
    return "invalid";
  }
  const complexityReport = value["complexityReport"];
  if (typeof complexityReport !== "string" || complexityReport.trim().length === 0) {
    return "invalid";
  }
  const maxCrap = value["maxCrap"];
  if (
    maxCrap !== undefined &&
    (typeof maxCrap !== "number" || !Number.isFinite(maxCrap) || maxCrap <= 0)
  ) {
    return "invalid";
  }
  return {
    complexityReport: complexityReport.replaceAll("\\", "/"),
    maxCrap: typeof maxCrap === "number" ? maxCrap : null,
  };
}

/** 读 coverage-gate.json（fail-closed：文件缺席/JSON 坏形/字段越形一律不 ok + 指引，禁静默）。 */
export function readCoverageGateConfig(facts: DetectorFacts): CoverageConfigRead {
  const configPath = facts.joinPath(facts.projectRoot, COVERAGE_GATE_CONFIG_FILE);
  const raw = facts.readTextFile(configPath);
  if (raw === null) {
    return {
      ok: false,
      reason: `未找到 ${COVERAGE_GATE_CONFIG_FILE}（COVERAGE / COMPLEXITY_CRAP 门禁的判卷输入未声明）`,
      installHint: `配置指引：${COVERAGE_CONFIG_HINT}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: `${COVERAGE_GATE_CONFIG_FILE} 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默`,
      installHint: `修复 JSON 语法；形态见：${COVERAGE_CONFIG_HINT}`,
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      reason: `${COVERAGE_GATE_CONFIG_FILE} 根必须是 JSON 对象`,
      installHint: `形态见：${COVERAGE_CONFIG_HINT}`,
    };
  }
  const runner = parsed["runner"];
  if (runner !== "c8" && runner !== "pytest-cov") {
    return {
      ok: false,
      reason: `${COVERAGE_GATE_CONFIG_FILE} 的 runner 必须是 "c8" 或 "pytest-cov"（D17：pytest-cov 先行；JaCoCo 属 Java 第二波 deferred）`,
      installHint: `词形见：${COVERAGE_CONFIG_HINT}`,
    };
  }
  let testCommand: string | null = null;
  let covTarget: string | null = null;
  if (runner === "c8") {
    const command = parsed["command"];
    if (typeof command !== "string" || command.trim().length === 0) {
      return {
        ok: false,
        reason: `${COVERAGE_GATE_CONFIG_FILE} 缺少非空字符串字段 command（被 c8 包裹的测试命令，如 "corepack pnpm exec vitest run"）`,
        installHint: `字段形态见：${COVERAGE_CONFIG_HINT}`,
      };
    }
    testCommand = command;
  } else {
    const target = parsed["covTarget"];
    if (typeof target !== "string" || target.trim().length === 0) {
      return {
        ok: false,
        reason: `${COVERAGE_GATE_CONFIG_FILE} 缺少非空字符串字段 covTarget（pytest --cov 的测量目标，如 "src"）`,
        installHint: `字段形态见：${COVERAGE_CONFIG_HINT}`,
      };
    }
    covTarget = target;
  }
  const coverageReportRaw = parsed["coverageReport"];
  if (
    coverageReportRaw !== undefined &&
    (typeof coverageReportRaw !== "string" || coverageReportRaw.trim().length === 0)
  ) {
    return {
      ok: false,
      reason: `${COVERAGE_GATE_CONFIG_FILE} 的 coverageReport 必须是非空字符串（c8=报告目录词形；pytest-cov=报告文件词形）`,
      installHint: `字段形态见：${COVERAGE_CONFIG_HINT}`,
    };
  }
  const thresholds = parseThresholds(parsed["thresholds"]);
  if (thresholds === "invalid") {
    return {
      ok: false,
      reason: `${COVERAGE_GATE_CONFIG_FILE} 的 thresholds 必须是 {"lines":<0-100>,"branches":<0-100>}（两键都给；阈值配置化——缺省即用档位分化出厂兜底，不给半份）`,
      installHint: `字段形态见：${COVERAGE_CONFIG_HINT}`,
    };
  }
  const crap = parseCrapConfig(parsed["crap"]);
  if (crap === "invalid") {
    return {
      ok: false,
      reason: `${COVERAGE_GATE_CONFIG_FILE} 的 crap 必须是 {"complexityReport":"<路径>","maxCrap":<正数可选>}（复杂度报告路径必填——第三方输入源声明）`,
      installHint: `字段形态见：${COVERAGE_CONFIG_HINT}`,
    };
  }
  return {
    ok: true,
    config: {
      runner,
      testCommand,
      covTarget,
      coverageReport:
        typeof coverageReportRaw === "string"
          ? coverageReportRaw.replaceAll("\\", "/")
          : null,
      thresholds,
      crap,
    },
    evidence: `配置文件命中: ${configPath}（runner=${runner}${crap !== null ? "，crap 腿已声明" : ""}）`,
  };
}

// ============================================================
// 共享小件
// ============================================================

/**
 * 档位解析（policy 供给；越形 FATAL fail-closed——禁静默回落默认档）。
 * 词形非法是编排层契约破坏（blocked 语义），非工具缺席（not_run 语义）——
 * 故抛普通 Error 而非 GateAdapterError（gate-recipe-runner catch 分流同款纪律）。
 */
export function resolveGateTier(policy: GatePolicy): GateTier {
  const tier = policy.gateTier ?? DEFAULT_GATE_TIER;
  if (!GATE_TIER_VALUES.includes(tier)) {
    throw new Error(
      `policy.gateTier 词形非法：${String(tier)}（不在 GATE_TIER_VALUES 五词形内）——编排层契约破坏，fail-closed；` +
        "档位词形见 adapter-types.ts GATE_TIER_VALUES（PRD §27.1/§27.2 词形并集）；扩值走词汇表 PR，禁就地添加",
    );
  }
  return tier;
}

/** SKIPPED_BY_POLICY 映射记录（P12c 裁定映射：verdict=not_run + notApplicable=1 + policy_skip 口径）。 */
function policySkipRecord(
  plan: Parameters<typeof absenceRecord>[0],
  dialect: string,
  gateLabel: string,
  tier: GateTier,
): GateResultRecord {
  const base = absenceRecord(
    plan,
    "not_run",
    `SKIPPED_BY_POLICY（映射现轴 not_run，非绿非红；${gateLabel} 在 tier=${tier} 档合法缺席——PRD §27.1 治理 effort 与 Change Risk 成比例 / §27.3 档位升降级 / §73 Case G「CRAP 不做 P0 前置依赖」；显式缺席语义非静默跳过；新轴值经 vocab-pr-0002 呈报 Owner，未批前禁私加词表）`,
    0,
    0,
  );
  return {
    ...base,
    metricDialect: dialect,
    counts: { ...base.counts, notApplicable: 1 },
  };
}

// ============================================================
// COVERAGE 门禁 adapter
// ============================================================

/** coverage adapter run 产物。 */
export type CoverageRunOutput =
  | {
      readonly plan: CoverageLegPlan;
      readonly outcome: "not_declared";
      readonly externalMs: number;
    }
  | {
      readonly plan: CoverageLegPlan;
      readonly outcome: "leg";
      readonly leg: CoverageLegOutput;
      readonly externalMs: number;
    };

/** coverage 计划公共段（身份 + 编排锚；prepare 各分支展开——类型由推断收窄保持具体）。 */
function coveragePlanCommon(scope: GateScope, policy: GatePolicy) {
  return {
    grn: policy.grn,
    gate: COVERAGE_GATE_NAME,
    gateDef: COVERAGE_GATE_DEF,
    ranAtSeq: policy.ranAtSeq,
    subjectId: scope.subjectId ?? null,
    denominatorRefs: scope.denominatorRefs ?? [],
    projectRoot: scope.projectRoot,
  };
}

/**
 * COVERAGE 门禁 adapter（P23；c8 JS/TS 腿 + pytest-cov Python 腿——D17 首发顺序，
 * JaCoCo/Java 第二波显式 deferred；GateResult 必带 coverage 类型 metric_dialect）。
 * options：spawnFn / executableProbe 注入面（contract-adapter oasdiffSpawnFn 同款先例；
 * 测试注入 fake 保证判卷矩阵与宿主环境无关）。
 */
export function createCoverageAdapter(
  options: {
    /** 注入 coverage 腿 spawn（测试 fake / 显式装配）；缺省 coverageSpawn（PATH 消毒 + 64MB）。 */
    readonly spawnFn?: SpawnFn;
    /** 注入 run 前置可执行体探测（gate ①a）；缺省 platformExecutableProbe（真实 PATH）。 */
    readonly executableProbe?: ExecutableProbeFn;
  } = {},
): GateAdapter<
  DetectionResult,
  CoverageLegPlan,
  CoverageRunOutput
> {
  const spawnFn = options.spawnFn ?? coverageSpawn;
  const executableProbe = options.executableProbe ?? platformExecutableProbe;
  return {
    adapterId: "gauntlet-lite:coverage",

    detect(facts: DetectorFacts): DetectionResult {
      const read = readCoverageGateConfig(facts);
      if (!read.ok) {
        return {
          status: "NOT_INSTALLED",
          tool: COVERAGE_ADAPTER_TOOL_ID,
          reason: read.reason,
          installHint: read.installHint,
        };
      }
      if (read.config.runner === "c8") {
        const tool = detectC8(facts);
        if (tool.status === "READY") {
          return {
            status: "READY",
            tool: C8_TOOL_ID,
            detectedVersion: tool.detectedVersion,
            evidence: `${read.evidence}；${tool.evidence}`,
          };
        }
        return tool.status === "NOT_INSTALLED"
          ? { ...tool, reason: `coverage-gate.json 声明 runner=c8 但 ${tool.reason}` }
          : tool;
      }
      const tool = detectPytestCov(facts);
      if (tool.status === "READY") {
        return {
          status: "READY",
          tool: PYTEST_COV_TOOL_ID,
          detectedVersion: null,
          evidence: `${read.evidence}；${tool.evidence}`,
        };
      }
      return tool.status === "NOT_INSTALLED"
        ? { ...tool, reason: `coverage-gate.json 声明 runner=pytest-cov 但 ${tool.reason}` }
        : tool;
    },

    prepare(
      scope: GateScope,
      policy: GatePolicy,
      facts?: DetectorFacts,
    ): CoverageLegPlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const tier = resolveGateTier(policy);
      const common = coveragePlanCommon(scope, policy);
      const trigger = policy.trigger ?? "on_demand";

      // —— 档位闸（先于一切：MINIMAL/LIGHT/FAST 档合法缺席，policy_skip 短路——P12c 先例）。
      if (POLICY_EXEMPT_GATE_TIERS.includes(tier)) {
        return {
          tool: COVERAGE_ADAPTER_TOOL_ID,
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: COVERAGE_POLICY_SKIP_METRIC_DIALECT,
          ...common,
          trigger,
          runner: "c8",
          absenceKind: "profile_not_required",
          absentReason: null,
          absentHint: null,
          tier,
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_COVERAGE_TIMEOUT_MS,
          coverageReportPath: "",
          thresholds: resolveCoverageProvisionalThresholdsForTier(tier),
          thresholdsProvisional: true,
          expectedToolVersion: null,
        };
      }

      // —— 配置闸（未声明/坏形 → not_configured，诚实缺席非静默）。
      const read = readCoverageGateConfig(resolved);
      if (!read.ok) {
        return {
          tool: COVERAGE_ADAPTER_TOOL_ID,
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: COVERAGE_METRIC_DIALECT_UNDECLARED,
          ...common,
          trigger,
          runner: "c8",
          absenceKind: "config_absent",
          absentReason: read.reason,
          absentHint: read.installHint,
          tier,
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_COVERAGE_TIMEOUT_MS,
          coverageReportPath: "",
          thresholds: resolveCoverageProvisionalThresholdsForTier(tier),
          thresholdsProvisional: true,
          expectedToolVersion: null,
        };
      }

      const config = read.config;
      const runner = config.runner;
      // 出厂兜底按档位分化（行阈值 Owner 决议 2026-09-01：MINIMAL 80/LIGHT 60/
      // STANDARD 30；branches 恒 60 未批）；配置显式供给时整体覆盖（配置优先）。
      const thresholds = config.thresholds ?? resolveCoverageProvisionalThresholdsForTier(tier);
      const thresholdsProvisional = config.thresholds === null;
      const metricDialect =
        runner === "c8" ? C8_METRIC_DIALECT : PYTEST_COV_METRIC_DIALECT;
      const tool = runner === "c8" ? C8_TOOL_ID : PYTEST_COV_TOOL_ID;
      const coverageReportPath = resolveCoverageReportPath(runner, config.coverageReport);
      const planBase = {
        tool,
        toolVersion: GAUNTLET_LITE_VERSION,
        metricDialect,
        ...common,
        trigger,
        runner,
        absenceKind: null as null,
        absentReason: null,
        absentHint: null,
        tier,
        coverageReportPath,
        thresholds,
        thresholdsProvisional,
        timeoutMs: policy.timeoutMs ?? DEFAULT_COVERAGE_TIMEOUT_MS,
      };

      if (runner === "c8") {
        const detection = detectC8(resolved);
        if (detection.status !== "READY") {
          return {
            ...planBase,
            command: "",
            versionProbeCommand: "",
            executable: coverageLegExecutable("c8"),
            expectedToolVersion: policy.expectedToolVersion ?? null,
            absenceKind: "tool_absent",
            absentReason:
              detection.status === "NOT_INSTALLED"
                ? detection.reason
                : `c8 探测态异常：${detection.status}`,
            absentHint:
              detection.status === "NOT_INSTALLED" ? detection.installHint : null,
          };
        }
        if (detection.detectedVersion === null) {
          throw new Error(
            "c8 已声明但版本词形不可解析（无法钉死 tool_version 口径）——" +
              '在 package.json 使用语义化版本区间（如 "^5.3.0"），保证 03-gate-result 的 tool_version 可判卷（vitest 腿同款纪律）',
          );
        }
        return {
          ...planBase,
          toolVersion: detection.detectedVersion,
          command: buildC8Command(
            c8ReportsDirAbsolute(scope.projectRoot, coverageReportPath),
            config.testCommand ?? "",
          ),
          versionProbeCommand: C8_VERSION_PROBE_COMMAND,
          executable: coverageLegExecutable("c8"),
          expectedToolVersion: policy.expectedToolVersion ?? null,
        };
      }

      // —— pytest-cov 腿：版本锚强制（pytest 腿同款——Python 侧版本无法从配置文件可靠探测）。
      const detection = detectPytestCov(resolved);
      if (detection.status !== "READY") {
        return {
          ...planBase,
          command: "",
          versionProbeCommand: "",
          executable: coverageLegExecutable("pytest-cov"),
          expectedToolVersion: null,
          absenceKind: "tool_absent",
          absentReason:
            detection.status === "NOT_INSTALLED"
              ? detection.reason
              : `pytest-cov 探测态异常：${detection.status}`,
          absentHint:
            detection.status === "NOT_INSTALLED" ? detection.installHint : null,
        };
      }
      if (policy.expectedToolVersion === null || policy.expectedToolVersion === undefined) {
        throw new Error(
          "pytest-cov 腿就绪但 policy.expectedToolVersion 缺失（pytest 版本无法从配置文件可靠探测）——" +
            '由编排层从 catalog/profile 锁供给 pytest 版本锚（如 "8.3.4"）；run 期以 python -m pytest --version 实测对账，失配降级 warning（pytest 腿同款纪律）',
        );
      }
      return {
        ...planBase,
        toolVersion: policy.expectedToolVersion,
        command: buildPytestCovCommand(
          config.covTarget ?? "",
          coverageReportAbsolutePath(scope.projectRoot, coverageReportPath),
        ),
        versionProbeCommand: "python -m pytest --version",
        executable: coverageLegExecutable("pytest-cov"),
        expectedToolVersion: policy.expectedToolVersion,
      };
    },

    run(plan: CoverageLegPlan, injectedSpawn: SpawnFn | undefined = spawnFn): CoverageRunOutput {
      const startedAt = performance.now();
      const elapsed = () => Math.max(0, Math.round(performance.now() - startedAt));
      if (plan.absenceKind !== null) {
        return { plan, outcome: "not_declared", externalMs: elapsed() };
      }
      const leg = runCoverageLeg(plan, injectedSpawn, executableProbe);
      return { plan, outcome: "leg", leg, externalMs: leg.externalMs };
    },

    normalize(raw: CoverageRunOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;
      assertCommonGates(plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (raw.outcome === "not_declared") {
        if (plan.absenceKind === "profile_not_required") {
          return policySkipRecord(
            plan,
            COVERAGE_POLICY_SKIP_METRIC_DIALECT,
            "COVERAGE gate",
            plan.tier,
          );
        }
        if (plan.absenceKind === "tool_absent") {
          return absenceRecord(
            plan,
            "not_run",
            `${plan.absentReason ?? "coverage 工具不在位"}；${plan.absentHint ?? ""}（not_run，非绿非红——STANDARD/HARDENING 档缺席工具不得当通过）`,
            selfMs,
            raw.externalMs,
          );
        }
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "未声明 coverage-gate.json"}；指引：${plan.absentHint ?? COVERAGE_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
      }
      return normalizeCoverageLeg(raw.leg, selfMs);
    },
  };
}

// ============================================================
// COMPLEXITY/CRAP 门禁 adapter（POMaster 原生公式；输入源第三方）
// ============================================================

/** crap adapter run 产物。 */
export type CrapRunOutput =
  | {
      readonly plan: CrapLegPlan;
      readonly outcome: "not_declared";
      readonly externalMs: number;
    }
  | {
      readonly plan: CrapLegPlan;
      readonly outcome: "leg";
      readonly leg: CrapLegOutput;
      readonly externalMs: number;
    };

/** crap 计划公共段（身份 + 编排锚；prepare 各分支展开）。 */
function crapPlanCommon(scope: GateScope, policy: GatePolicy) {
  return {
    grn: policy.grn,
    gate: CRAP_GATE_NAME,
    gateDef: CRAP_GATE_DEF,
    ranAtSeq: policy.ranAtSeq,
    subjectId: scope.subjectId ?? null,
    denominatorRefs: scope.denominatorRefs ?? [],
    projectRoot: scope.projectRoot,
  };
}

/**
 * COMPLEXITY/CRAP 门禁 adapter（P23；§73 Case G：CRAP 不做 P0 前置——MINIMAL/LIGHT/
 * FAST 档合法缺席；无第三方工具可探测（POMaster 原生公式），探测即配置面探测）。
 */
export function createCrapGateAdapter(): GateAdapter<
  DetectionResult,
  CrapLegPlan,
  CrapRunOutput
> {
  return {
    adapterId: "gauntlet-lite:crap",

    detect(facts: DetectorFacts): DetectionResult {
      const read = readCoverageGateConfig(facts);
      if (!read.ok) {
        return {
          status: "NOT_INSTALLED",
          tool: CRAP_TOOL_ID,
          reason: read.reason,
          installHint: read.installHint,
        };
      }
      if (read.config.crap === null) {
        return {
          status: "NOT_INSTALLED",
          tool: CRAP_TOOL_ID,
          reason: "coverage-gate.json 未声明 crap 段（COMPLEXITY/CRAP gate 合法未配置——声明即激活；PRD §73 Case G：CRAP 不做 P0 前置依赖）",
          installHint: `配置指引：${COVERAGE_CONFIG_HINT}`,
        };
      }
      return {
        status: "READY",
        tool: CRAP_TOOL_ID,
        detectedVersion: GAUNTLET_LITE_VERSION,
        evidence: `${read.evidence}；crap.complexityReport=${read.config.crap.complexityReport}（POMaster 原生公式，输入源=第三方报告）`,
      };
    },

    prepare(
      scope: GateScope,
      policy: GatePolicy,
      facts?: DetectorFacts,
    ): CrapLegPlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const tier = resolveGateTier(policy);
      const common = crapPlanCommon(scope, policy);
      const trigger = policy.trigger ?? "on_demand";
      const planBase = {
        tool: CRAP_TOOL_ID,
        toolVersion: GAUNTLET_LITE_VERSION,
        metricDialect: CRAP_METRIC_DIALECT,
        ...common,
        trigger,
        coverageReportPath: "",
        coverageRunner: "c8" as const,
        maxCrap: CRAP_PROVISIONAL_MAX_CRAP,
        maxCrapProvisional: true,
        tier,
        complexityReportPath: "",
      };

      // —— 档位闸（先于配置：MINIMAL/LIGHT/FAST 档合法缺席，§73 Case G）。
      if (POLICY_EXEMPT_GATE_TIERS.includes(tier)) {
        return {
          ...planBase,
          metricDialect: CRAP_POLICY_SKIP_METRIC_DIALECT,
          absenceKind: "profile_not_required",
          absentReason: null,
          absentHint: null,
        };
      }

      const read = readCoverageGateConfig(resolved);
      if (!read.ok) {
        return {
          ...planBase,
          absenceKind: "config_absent",
          absentReason: read.reason,
          absentHint: read.installHint,
        };
      }
      if (read.config.crap === null) {
        return {
          ...planBase,
          coverageRunner: read.config.runner,
          absenceKind: "crap_not_declared",
          absentReason:
            "coverage-gate.json 未声明 crap 段（COMPLEXITY/CRAP gate 合法未配置——非静默缺席；PRD §73 Case G：CRAP 不做 P0 前置依赖）",
          absentHint: `配置指引：${COVERAGE_CONFIG_HINT}`,
        };
      }
      return {
        ...planBase,
        complexityReportPath: read.config.crap.complexityReport,
        coverageReportPath: resolveCoverageReportPath(
          read.config.runner,
          read.config.coverageReport,
        ),
        coverageRunner: read.config.runner,
        maxCrap: read.config.crap.maxCrap ?? CRAP_PROVISIONAL_MAX_CRAP,
        maxCrapProvisional: read.config.crap.maxCrap === null,
        absenceKind: null,
        absentReason: null,
        absentHint: null,
      };
    },

    run(plan: CrapLegPlan): CrapRunOutput {
      const startedAt = performance.now();
      const externalMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (plan.absenceKind !== null) {
        return { plan, outcome: "not_declared", externalMs };
      }
      const readOrNull = (relative: string): string | null => {
        try {
          return readFileSync(pathJoin(plan.projectRoot, relative), "utf8");
        } catch {
          return null;
        }
      };
      const leg: CrapLegOutput = {
        plan,
        complexityText: readOrNull(plan.complexityReportPath),
        coverageText: readOrNull(plan.coverageReportPath),
        externalMs,
      };
      return { plan, outcome: "leg", leg, externalMs };
    },

    normalize(raw: CrapRunOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;
      assertCommonGates(plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (raw.outcome === "not_declared") {
        if (plan.absenceKind === "profile_not_required") {
          return policySkipRecord(
            plan,
            CRAP_POLICY_SKIP_METRIC_DIALECT,
            "COMPLEXITY/CRAP gate",
            plan.tier,
          );
        }
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "coverage-gate.json 未声明"}；指引：${plan.absentHint ?? COVERAGE_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
      }
      return normalizeCrapLeg(raw.leg, selfMs);
    },
  };
}
