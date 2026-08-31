/**
 * performance-adapter.ts —— PERFORMANCE 门禁双独立 adapter（P27 / 随版计划 Batch 3
 * 后段 B3-3；§59 GateAdapter 四段契约，P25 三腿 adapter 同款先例）。
 *
 * ============================================================
 * 防假绿/独立性纪律（P22-P26 腿先例全适用）
 * ============================================================
 * - **双独立 adapter**：createLighthouseAdapter / createWebVitalsAdapter 两工厂
 *   两实例，各自独立 detect/prepare/run/normalize（lighthouse = 实验室判卷面、
 *   web-vitals = 字段数据判卷面，工具能力面互不可替代——见 performance-leg.ts
 *   承载映射）；无「PERFORMANCE 总 adapter」；
 * - **双腿两记录**：runPerformanceGateLegs 一次跑双腿 = 两条独立 GateResultRecord
 *   （各自 grn/ranAtSeq/tool/metric_dialect/verdict），返回二元组——类型签名上
 *   不存在任何聚合 verdict 位；消费方逐腿罗列两条记录，禁止压缩成单条
 *   "performance ok"；
 * - **互不牵连**：一腿缺席（工具/配置/档位）或一腿 failed 只落本腿记录，另一腿
 *   照常独立探测、执行、判卷（组合矩阵测试钉死）；单腿 prepare 异常 → 该腿
 *   blocked 记录，另一腿照常（互不牵连到编排异常层）。
 *
 * 共享配置（performance-gate.json，budget 段共享 + 双 runner 段各自独立声明）：
 *   {"budget":{"lcp_ms":2500,"inp_ms":200,"initial_js_gzip_kb":500},   // 必填（§29.1 字段子集 ≥1）
 *    "lighthouse":{"command":"lighthouse <url> --output=json --output-path=reports/performance/lighthouse.json"},  // 可选
 *    "webVitals":{"command":"<harness 须产出 {\"metrics\":[...]} 报告>","versionProbe":"<版本探测>"}}  // 可选
 * - 段未声明 = 本腿诚实缺席（not_configured），另一腿照常；budget 段坏形/缺席 =
 *   双腿各自落 not_configured（同因两记录，仍互不牵连判卷路径）。
 *
 * 版本锚纪律（security/playwright 腿同款）：lighthouse/web-vitals 版本无法从配置
 * 文件可靠探测，腿就绪时 policy.expectedToolVersion 必须由编排层供给；run 期
 * `--version` 实测对账，失配降级 warning（DRIFTED→WARNING 缺席语义）。
 *
 * 档位闸（security 腿同款）：MINIMAL/LIGHT/FAST 档合法缺席（policy_skip → not_run
 * +notApplicable=1，PRD §27.1 MINIMAL 档「Gate 以 affected build/test/visual verify
 * 为主」——performance 不在最小档主集；双腿独立缺席互不牵连）。
 *
 * 缺席语义全部显式（C1）：profile_not_required → not_run+notApplicable=1
 * （policy_skip 口径，P12c 映射裁定）；config_absent → not_configured；
 * tool_absent / 报告缺席 / malformed → not_run。禁静默跳过当通过。
 * D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import { performance } from "node:perf_hooks";
import type { RunTriggerValue } from "@pomaster/schemas";
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
  detectLighthouse,
  detectWebVitals,
  platformDetectorFacts,
  platformExecutableProbe,
} from "./detectors.js";
import { absenceRecord, assertCommonGates } from "./normalize-common.js";
import { resolveGateTier } from "./coverage-adapter.js";
import { performanceSpawn } from "./performance-leg.js";
import {
  DEFAULT_PERFORMANCE_TIMEOUT_MS,
  LIGHTHOUSE_METRIC_DIALECT,
  LIGHTHOUSE_TOOL_ID,
  PERFORMANCE_CONFIG_HINT,
  PERFORMANCE_GATE_CONFIG_FILE,
  PERFORMANCE_GATE_DEF,
  PERFORMANCE_GATE_NAME,
  PERFORMANCE_LEG_RUNNERS,
  PERFORMANCE_METRIC_DIALECT_UNDECLARED,
  PERFORMANCE_POLICY_SKIP_METRIC_DIALECT,
  WEB_VITALS_METRIC_DIALECT,
  WEB_VITALS_TOOL_ID,
  carriedBudgetFieldsOf,
  normalizePerformanceLeg,
  performanceLegExecutable,
  performanceLegPolicyExempt,
  performancePolicySkipNote,
  performanceVersionProbeCommand,
  readPerformanceGateConfig,
  resolvePerformanceReportPath,
  runPerformanceLeg,
  type PerformanceBudgetDeclaration,
  type PerformanceGateConfig,
  type PerformanceLegOutput,
  type PerformanceLegPlan,
  type PerformanceLegRunner,
  type PerformanceLegToolConfig,
} from "./performance-leg.js";

// ============================================================
// 双腿身份常量映射（单一表——双 adapter 消费，禁就地第二份拷贝）
// ============================================================

function legToolId(runner: PerformanceLegRunner): string {
  return runner === "lighthouse" ? LIGHTHOUSE_TOOL_ID : WEB_VITALS_TOOL_ID;
}

function legMetricDialect(runner: PerformanceLegRunner): string {
  return runner === "lighthouse" ? LIGHTHOUSE_METRIC_DIALECT : WEB_VITALS_METRIC_DIALECT;
}

function legConfigSectionOf(
  config: PerformanceGateConfig,
  runner: PerformanceLegRunner,
): PerformanceLegToolConfig | null {
  return runner === "lighthouse" ? config.lighthouse : config.webVitals;
}

function legDetector(
  runner: PerformanceLegRunner,
): (facts: DetectorFacts) => DetectionResult {
  return runner === "lighthouse" ? detectLighthouse : detectWebVitals;
}

function legVersionProbe(
  runner: PerformanceLegRunner,
  configValue: string | null,
): string {
  return performanceVersionProbeCommand(runner, configValue);
}

/** 单腿 §59 四段 adapter 同构实现（双工厂各建一实例——两个独立 adapter 的结构性落实）。 */
function createLegAdapterInner(
  runner: PerformanceLegRunner,
  options: PerformanceAdapterOptions,
): GateAdapter<DetectionResult, PerformanceLegPlan, PerformanceLegOutput> {
  const spawnFn = options.spawnFn ?? performanceSpawn;
  const executableProbe = options.executableProbe ?? platformExecutableProbe;
  const detector = legDetector(runner);

  return {
    adapterId: `gauntlet-lite:performance-${runner}`,

    detect(facts: DetectorFacts): DetectionResult {
      const state = readPerformanceGateConfig(facts);
      if (!state.ok) {
        return {
          status: "NOT_INSTALLED",
          tool: legToolId(runner),
          reason: state.reason,
          installHint: state.installHint,
        };
      }
      const section = legConfigSectionOf(state.config, runner);
      if (section === null || section === undefined) {
        return {
          status: "NOT_INSTALLED",
          tool: legToolId(runner),
          reason: `${PERFORMANCE_GATE_CONFIG_FILE} 未声明本 runner 段（${runner === "lighthouse" ? '"lighthouse"' : '"webVitals"'}；本腿判卷执行面未声明——诚实缺席，不影响另一腿）`,
          installHint: `配置指引：${PERFORMANCE_CONFIG_HINT}`,
        };
      }
      const tool = detector(facts);
      if (tool.status === "READY") {
        return {
          status: "READY",
          tool: legToolId(runner),
          detectedVersion: tool.detectedVersion,
          evidence: `${state.evidence}；${tool.evidence}`,
        };
      }
      if (tool.status === "NOT_INSTALLED") {
        return {
          ...tool,
          reason: `performance-gate.json 本 runner 段已声明但 ${tool.reason}`,
        };
      }
      return tool;
    },

    prepare(
      scope: GateScope,
      policy: GatePolicy,
      facts?: DetectorFacts,
    ): PerformanceLegPlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const tier: GateTier = resolveGateTier(policy);
      const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
      const common = {
        grn: policy.grn,
        gate: PERFORMANCE_GATE_NAME,
        gateDef: PERFORMANCE_GATE_DEF,
        ranAtSeq: policy.ranAtSeq,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        projectRoot: scope.projectRoot,
        runner,
        trigger,
        tier,
      };

      // —— 档位闸（先于一切：MINIMAL/LIGHT/FAST 档合法缺席，policy_skip 短路——
      // P12c 先例；双腿独立缺席，任一腿 policy_skip 不牵连另一腿）。
      if (performanceLegPolicyExempt(tier)) {
        return {
          tool: legToolId(runner),
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: PERFORMANCE_POLICY_SKIP_METRIC_DIALECT,
          ...common,
          absenceKind: "profile_not_required" as const,
          absentReason: null,
          absentHint: null,
          budget: {},
          carriedBudgetFields: [],
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_PERFORMANCE_TIMEOUT_MS,
          reportPath: "",
          expectedToolVersion: "",
        };
      }

      // —— 配置闸（文件级/budget 段/本 runner 段 → not_configured，诚实缺席非静默；
      // 本段缺席不牵连另一腿）。
      const state = readPerformanceGateConfig(resolved);
      if (!state.ok) {
        return {
          tool: legToolId(runner),
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: PERFORMANCE_METRIC_DIALECT_UNDECLARED,
          ...common,
          absenceKind: "config_absent" as const,
          absentReason: state.reason,
          absentHint: state.installHint,
          budget: {},
          carriedBudgetFields: [],
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_PERFORMANCE_TIMEOUT_MS,
          reportPath: "",
          expectedToolVersion: "",
        };
      }
      const section = legConfigSectionOf(state.config, runner);
      if (section === null || section === undefined) {
        return {
          tool: legToolId(runner),
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: PERFORMANCE_METRIC_DIALECT_UNDECLARED,
          ...common,
          absenceKind: "config_absent" as const,
          absentReason: `${PERFORMANCE_GATE_CONFIG_FILE} 未声明本 runner 段（${runner === "lighthouse" ? '"lighthouse"' : '"webVitals"'}；本腿判卷执行面未声明——诚实缺席，不影响另一腿）`,
          absentHint: `配置指引：${PERFORMANCE_CONFIG_HINT}`,
          budget: {},
          carriedBudgetFields: [],
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_PERFORMANCE_TIMEOUT_MS,
          reportPath: "",
          expectedToolVersion: "",
        };
      }

      const budget: PerformanceBudgetDeclaration = state.config.budget;
      const carriedBudgetFields = carriedBudgetFieldsOf(runner, budget);
      const toolConfig = section;
      const reportPath = resolvePerformanceReportPath(runner, toolConfig.report);
      const versionProbeCommand = legVersionProbe(runner, toolConfig.versionProbe);
      const planBase = {
        tool: legToolId(runner),
        toolVersion: GAUNTLET_LITE_VERSION,
        metricDialect: legMetricDialect(runner),
        ...common,
        absenceKind: null as null,
        absentReason: null,
        absentHint: null,
        budget,
        carriedBudgetFields,
        reportPath,
        timeoutMs: policy.timeoutMs ?? DEFAULT_PERFORMANCE_TIMEOUT_MS,
      };

      // —— 工具闸（配置就绪但工具不在位 → tool_absent → not_run 非绿非红）。
      const detection = detector(resolved);
      if (detection.status !== "READY") {
        return {
          ...planBase,
          command: "",
          versionProbeCommand,
          executable: performanceLegExecutable(versionProbeCommand),
          expectedToolVersion: policy.expectedToolVersion ?? "",
          absenceKind: "tool_absent" as const,
          absentReason:
            detection.status === "NOT_INSTALLED"
              ? detection.reason
              : `${runner} 探测态异常：${detection.status}`,
          absentHint:
            detection.status === "NOT_INSTALLED" ? detection.installHint : null,
        };
      }

      // —— 版本锚强制（security/playwright 腿同款——版本无法从配置文件可靠探测；
      // run 期 --version 实测对账，失配降级 warning）。
      if (
        policy.expectedToolVersion === null ||
        policy.expectedToolVersion === undefined ||
        policy.expectedToolVersion.length === 0
      ) {
        throw new Error(
          `${runner} 腿就绪但 policy.expectedToolVersion 缺失（工具版本无法从配置文件可靠探测）——` +
            `由编排层从 catalog/profile 锁供给版本锚；run 期以 "${versionProbeCommand}" 实测对账，失配降级 warning（security/playwright 腿同款纪律）`,
        );
      }
      return {
        ...planBase,
        toolVersion: policy.expectedToolVersion,
        command: toolConfig.command,
        versionProbeCommand,
        executable: performanceLegExecutable(versionProbeCommand),
        expectedToolVersion: policy.expectedToolVersion,
      };
    },

    run(plan: PerformanceLegPlan, injectedSpawn: SpawnFn | undefined = spawnFn): PerformanceLegOutput {
      if (plan.absenceKind !== null) {
        // 缺席态计划不出 spawn（security/playwright adapter 的缺席输出同语义；
        // normalize 消费 plan.absenceKind 分支，本形态保证缺席态零执行面）。
        return {
          plan,
          kind: "spawn_failed",
          exitCode: null,
          stdout: "",
          stderr: "",
          observedToolVersion: null,
          reportText: null,
          externalMs: 0,
          failureReason: plan.absentReason ?? "本腿缺席态（未执行）",
        };
      }
      return runPerformanceLeg(plan, injectedSpawn, executableProbe);
    },

    normalize(raw: PerformanceLegOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      assertCommonGates(raw.plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));
      const plan = raw.plan;
      if (plan.absenceKind === "profile_not_required") {
        const base = absenceRecord(
          plan,
          "not_run",
          performancePolicySkipNote(plan.tier),
          selfMs,
          raw.externalMs,
        );
        return {
          ...base,
          metricDialect: PERFORMANCE_POLICY_SKIP_METRIC_DIALECT,
          counts: { ...base.counts, notApplicable: 1 },
        };
      }
      if (plan.absenceKind === "tool_absent") {
        return absenceRecord(
          plan,
          "not_run",
          `${plan.absentReason ?? "performance 工具不在位"}；${plan.absentHint ?? ""}（not_run，非绿非红——本腿缺席不得当通过，也不牵连另一腿）`,
          selfMs,
          raw.externalMs,
        );
      }
      if (plan.absenceKind === "config_absent") {
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "未声明 performance-gate.json 本腿段"}；指引：${plan.absentHint ?? PERFORMANCE_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
      }
      return normalizePerformanceLeg(raw, selfMs);
    },
  };
}

export interface PerformanceAdapterOptions {
  /** 注入本腿 spawn（测试 fake / 显式装配）；缺省 performanceSpawn（PATH 消毒 + 64MB）。 */
  readonly spawnFn?: SpawnFn;
  /** 注入 run 前置可执行体探测（gate ①a）；缺省 platformExecutableProbe（真实 PATH）。 */
  readonly executableProbe?: ExecutableProbeFn;
}

/**
 * Lighthouse adapter（P27 PERFORMANCE 实验室判卷腿；B3-3「对接 §29 性能预算字段」
 * ——官方 LHR 报告实测 vs 声明预算）。
 */
export function createLighthouseAdapter(
  options: PerformanceAdapterOptions = {},
): GateAdapter<DetectionResult, PerformanceLegPlan, PerformanceLegOutput> {
  return createLegAdapterInner("lighthouse", options);
}

/**
 * web-vitals adapter（P27 PERFORMANCE 字段数据判卷腿；官方 Metric 实测 vs 声明
 * 预算——报告容器 = POMaster 遍历契约）。
 */
export function createWebVitalsAdapter(
  options: PerformanceAdapterOptions = {},
): GateAdapter<DetectionResult, PerformanceLegPlan, PerformanceLegOutput> {
  return createLegAdapterInner("web-vitals", options);
}

// ============================================================
// 一次 check 跑双腿：两记录编排（**无聚合 verdict 位**——防假绿纪律）
// ============================================================

/** 单腿身份（grn/ranAtSeq 由编排层分配——两条 GRN 独立，A4 单调序号各自供给）。 */
export interface PerformanceLegIdentity {
  readonly grn: string;
  readonly ranAtSeq: number;
}

export interface PerformanceGateLegsDeps {
  readonly facts?: DetectorFacts;
  readonly spawnFn?: SpawnFn;
  readonly executableProbe?: ExecutableProbeFn;
  readonly trigger?: RunTriggerValue;
  readonly timeoutMs?: number;
  readonly gateTier?: GateTier;
  /** 版本锚按腿供给（两腿版本各自独立，禁共享单锚）。 */
  readonly expectedToolVersions?: {
    readonly lighthouse?: string | null;
    readonly webVitals?: string | null;
  };
}

/** 单腿 prepare 异常 → 本腿 blocked（另一腿照常——互不牵连到编排异常层）。 */
function prepareFailureBlockedRecord(
  runner: PerformanceLegRunner,
  scope: GateScope,
  policy: GatePolicy,
  detail: string,
): GateResultRecord {
  return absenceRecord(
    {
      grn: policy.grn,
      gate: PERFORMANCE_GATE_NAME,
      gateDef: PERFORMANCE_GATE_DEF,
      ranAtSeq: policy.ranAtSeq,
      subjectId: scope.subjectId ?? null,
      denominatorRefs: scope.denominatorRefs ?? [],
      tool: legToolId(runner),
      toolVersion: GAUNTLET_LITE_VERSION,
      metricDialect: PERFORMANCE_METRIC_DIALECT_UNDECLARED,
    },
    "blocked",
    `performance 腿（${runner}）prepare 异常（blocked，禁静默；本腿 blocked 不牵连另一腿）：${detail}`,
    0,
    0,
  );
}

/**
 * 一次跑双腿（lighthouse → web-vitals 固定序——PERFORMANCE_LEG_RUNNERS 词序），
 * 产出**恰好两条**独立 GateResultRecord——同一次 check 跑双腿 = 两条 GRN，各态
 * 独立（一腿红不牵连另一腿变绿或变红；缺席互不牵连）。返回二元组，**不存在聚合
 * verdict 位**；消费方（编排/呈现层）只许逐腿罗列两条记录，禁止压缩成单条
 * "performance ok"。单腿 prepare 异常 → 该腿 blocked 记录，另一腿照常执行。
 */
export function runPerformanceGateLegs(
  scope: GateScope,
  identities: readonly [PerformanceLegIdentity, PerformanceLegIdentity],
  deps: PerformanceGateLegsDeps = {},
): readonly [GateResultRecord, GateResultRecord] {
  const policyFor = (runner: PerformanceLegRunner, identity: PerformanceLegIdentity): GatePolicy => ({
    grn: identity.grn,
    ranAtSeq: identity.ranAtSeq,
    trigger: deps.trigger ?? "on_demand",
    timeoutMs: deps.timeoutMs,
    gateTier: deps.gateTier,
    expectedToolVersion:
      runner === "lighthouse"
        ? (deps.expectedToolVersions?.lighthouse ?? null)
        : (deps.expectedToolVersions?.webVitals ?? null),
  });

  const records = PERFORMANCE_LEG_RUNNERS.map((runner, index) => {
    const adapter = createLegAdapterInner(runner, deps);
    const identity = identities[index] as PerformanceLegIdentity;
    const policy = policyFor(runner, identity);
    try {
      const plan = adapter.prepare(scope, policy, deps.facts);
      const raw = adapter.run(plan);
      return adapter.normalize(raw, {
        declaredVerdict: null,
        isFixture: scope.subjectId !== null && scope.subjectId !== undefined && scope.subjectId.startsWith("TEST."),
      });
    } catch (err) {
      return prepareFailureBlockedRecord(
        runner,
        scope,
        policy,
        err instanceof Error ? err.message : String(err),
      );
    }
  });
  return [records[0] as GateResultRecord, records[1] as GateResultRecord];
}
