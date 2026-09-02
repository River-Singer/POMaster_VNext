/**
 * mutation-adapter.ts —— MUTATION 门禁 adapter（P24 / 随版计划 Batch 2 B2-3 StrykerJS +
 * B2-4 mutmut；§59 GateAdapter 四段契约，P23 coverage adapter 同款先例）。
 *
 * 共享配置（mutation-gate.json，单一事实源）：
 *   {"runner":"stryker","command":"corepack pnpm exec stryker run",   // stryker 腿
 *    mutmut 词形：{"runner":"mutmut","command":"python -m mutmut run ... && python -m mutmut junitxml > mutants.xml"},
 *    "changedFiles":["src/calc.ts","src/edge.ts"],                    // 必填（changed-code scope 分母）
 *    "report":"reports/mutation/mutation.json",                       // 可选（缺省按 runner）
 *    "thresholds":{"minKillScore":85,"maxSurvivors":10}}              // 可选（缺省=出厂兜底 85/10——已经 Owner 决议 2026-09-01 批准转正；后续调整走本字段配置化覆盖）
 *
 * - detect = 配置 + runner 工具探测（detectStryker: package.json @stryker-mutator/core
 *   声明，c8 同款；detectMutmut: pyproject [tool.mutmut] / setup.cfg [mutmut]，run 期
 *   实测，pytest-cov 同款）；
 * - prepare = 档位闸（MINIMAL/LIGHT/FAST/STANDARD → policy_skip 合法缺席——决策 D1：
 *   B2-3 原文「HARDENING 档专属」是整 gate 专属，非 CRAP B2-2 的阈值专属，STANDARD
 *   不跑不呈报；先于一切）→ 配置闸（未声明 → not_configured）→ 工具闸（缺席 → not_run）；
 *   stryker 腿版本锚取 package.json 声明版本（c8 腿同款），mutmut 腿强制
 *   policy.expectedToolVersion（pytest-cov 腿同款——Python 侧版本无法从配置文件可靠探测）；
 *   命令面 scope 旗标组装（buildStrykerCommand / buildMutmutCommand）；
 * - run = runMutationLeg 三道闸（P22/P23 先例）+ 报告回读；
 * - normalize = 报告重算 + changed-code scope 逐条复核 + kill score/survivor 双阈值判卷
 *   （normalizeMutationLeg；violations 语义=决策 D2）。
 *
 * 缺席语义全部显式（C1）：profile_not_required → not_run+notApplicable=1（policy_skip
 * 口径，P12c 映射裁定）；config_absent → not_configured；tool_absent / 报告缺席 /
 * malformed → not_run。禁静默跳过当通过。
 * D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
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
import { POLICY_EXEMPT_GATE_TIERS } from "./adapter-types.js";
import {
  buildMutmutCommand,
  buildStrykerCommand,
  DEFAULT_MUTATION_TIMEOUT_MS,
  MUTATION_ADAPTER_TOOL_ID,
  MUTATION_GATE_CONFIG_FILE,
  MUTATION_GATE_DEF,
  MUTATION_GATE_NAME,
  MUTATION_METRIC_DIALECT_UNDECLARED,
  MUTATION_POLICY_SKIP_METRIC_DIALECT,
  MUTATION_PROVISIONAL_THRESHOLDS,
  mutationLegExecutable,
  mutationSpawn,
  MUTMUT_METRIC_DIALECT,
  MUTMUT_TOOL_ID,
  MUTMUT_VERSION_PROBE_COMMAND,
  normalizeMutationLeg,
  resolveMutationReportPath,
  runMutationLeg,
  STRYKER_METRIC_DIALECT,
  STRYKER_TOOL_ID,
  STRYKER_VERSION_PROBE_COMMAND,
  type MutationLegOutput,
  type MutationLegPlan,
} from "./mutation-leg.js";
import {
  detectMutmut,
  detectStryker,
  platformDetectorFacts,
  platformExecutableProbe,
} from "./detectors.js";
import { absenceRecord, assertCommonGates } from "./normalize-common.js";
import { resolveGateTier } from "./coverage-adapter.js";

// ============================================================
// 共享配置读取（mutation-gate.json；facts 注入零隐式 I/O）
// ============================================================

export const MUTATION_CONFIG_HINT =
  "在项目根 mutation-gate.json 声明变异测试判卷输入（P24）：" +
  'JS/TS 腿 {"runner":"stryker","command":"<stryker 运行命令>","changedFiles":["<变更文件>"]}（需 package.json 声明 @stryker-mutator/core）；' +
  'Python 腿（D17 先行）{"runner":"mutmut","command":"<mutmut run 与 junitxml 导出的组合命令>","changedFiles":["<变更文件>"]}（需 pyproject [tool.mutmut] 或 setup.cfg [mutmut] + policy 版本锚）；' +
  '"changedFiles" 必填非空（changed-code scope 分母——命令面旗标 + 判卷面逐条复核双重强制，见随版计划 B2-3）；' +
  '可选 "report"（缺省 stryker=reports/mutation/mutation.json / mutmut=mutants.xml）、' +
  '"thresholds":{"minKillScore":85,"maxSurvivors":10}（缺省=出厂兜底 85/10——已经 Owner 决议 2026-09-01 批准转正，A4 阈值包：minKillScore 锚测试战略 L6-1、maxSurvivors 一并获批；后续调整走本字段配置化覆盖）；' +
  "MUTATION gate 是 HARDENING 档专属（随版计划 B2-3 原文）：MINIMAL/LIGHT/FAST/STANDARD 档合法缺席；" +
  "未声明是诚实缺席（not_configured），不会被记为通过";

export interface MutationThresholds {
  readonly minKillScore: number;
  readonly maxSurvivors: number;
}

export interface MutationGateConfig {
  readonly runner: "stryker" | "mutmut";
  /** 变异测试运行命令（不含 scope 旗标——adapter 组装；必填）。 */
  readonly command: string;
  /** changed-code scope 分母（变更文件清单；必填非空）。 */
  readonly changedFiles: readonly string[];
  /** 报告落点声明（可选；null=runner 缺省）。 */
  readonly report: string | null;
  /** 阈值（可选；null=出厂兜底 85/10——已经 Owner 决议 2026-09-01 批准转正；后续调整走本字段配置化覆盖）。 */
  readonly thresholds: MutationThresholds | null;
}

export type MutationConfigRead =
  | { readonly ok: true; readonly config: MutationGateConfig; readonly evidence: string }
  | { readonly ok: false; readonly reason: string; readonly installHint: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseMutationThresholds(value: unknown): MutationThresholds | "invalid" | null {
  if (value === undefined) {
    return null;
  }
  if (!isPlainObject(value)) {
    return "invalid";
  }
  const minKillScore = value["minKillScore"];
  const maxSurvivors = value["maxSurvivors"];
  const scoreValid =
    typeof minKillScore === "number" &&
    Number.isFinite(minKillScore) &&
    minKillScore >= 0 &&
    minKillScore <= 100;
  const survivorsValid =
    typeof maxSurvivors === "number" &&
    Number.isInteger(maxSurvivors) &&
    maxSurvivors >= 0;
  if (!scoreValid || !survivorsValid) {
    return "invalid";
  }
  return {
    minKillScore,
    maxSurvivors,
  };
}

/** 读 mutation-gate.json（fail-closed：文件缺席/JSON 坏形/字段越形一律不 ok + 指引，禁静默）。 */
export function readMutationGateConfig(facts: DetectorFacts): MutationConfigRead {
  const configPath = facts.joinPath(facts.projectRoot, MUTATION_GATE_CONFIG_FILE);
  const raw = facts.readTextFile(configPath);
  if (raw === null) {
    return {
      ok: false,
      reason: `未找到 ${MUTATION_GATE_CONFIG_FILE}（MUTATION 门禁的判卷输入未声明）`,
      installHint: `配置指引：${MUTATION_CONFIG_HINT}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: `${MUTATION_GATE_CONFIG_FILE} 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默`,
      installHint: `修复 JSON 语法；形态见：${MUTATION_CONFIG_HINT}`,
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      reason: `${MUTATION_GATE_CONFIG_FILE} 根必须是 JSON 对象`,
      installHint: `形态见：${MUTATION_CONFIG_HINT}`,
    };
  }
  const runner = parsed["runner"];
  if (runner !== "stryker" && runner !== "mutmut") {
    return {
      ok: false,
      reason: `${MUTATION_GATE_CONFIG_FILE} 的 runner 必须是 "stryker" 或 "mutmut"（B2-3 StrykerJS / B2-4 mutmut；PIT 属 Java 第二波 deferred）`,
      installHint: `词形见：${MUTATION_CONFIG_HINT}`,
    };
  }
  const command = parsed["command"];
  if (typeof command !== "string" || command.trim().length === 0) {
    return {
      ok: false,
      reason: `${MUTATION_GATE_CONFIG_FILE} 缺少非空字符串字段 command（变异测试运行命令，不含 scope 旗标——由 adapter 组装）`,
      installHint: `字段形态见：${MUTATION_CONFIG_HINT}`,
    };
  }
  const changedFilesRaw = parsed["changedFiles"];
  if (!Array.isArray(changedFilesRaw) || changedFilesRaw.length === 0) {
    return {
      ok: false,
      reason: `${MUTATION_GATE_CONFIG_FILE} 缺少非空数组字段 changedFiles（changed-code scope 分母——L6「kill score ≥85%（changed-code scope）」的分母由本清单承载，空清单 = 无受检面）`,
      installHint: `字段形态见：${MUTATION_CONFIG_HINT}`,
    };
  }
  const changedFiles: string[] = [];
  for (const entry of changedFilesRaw) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      return {
        ok: false,
        reason: `${MUTATION_GATE_CONFIG_FILE} 的 changedFiles 必须是非空字符串数组（仓内相对路径；分隔符可 \\ 或 /）`,
        installHint: `字段形态见：${MUTATION_CONFIG_HINT}`,
      };
    }
    changedFiles.push(entry.replaceAll("\\", "/"));
  }
  const reportRaw = parsed["report"];
  if (
    reportRaw !== undefined &&
    (typeof reportRaw !== "string" || reportRaw.trim().length === 0)
  ) {
    return {
      ok: false,
      reason: `${MUTATION_GATE_CONFIG_FILE} 的 report 必须是非空字符串（报告落点；缺省 stryker=reports/mutation/mutation.json / mutmut=mutants.xml）`,
      installHint: `字段形态见：${MUTATION_CONFIG_HINT}`,
    };
  }
  const thresholds = parseMutationThresholds(parsed["thresholds"]);
  if (thresholds === "invalid") {
    return {
      ok: false,
      reason: `${MUTATION_GATE_CONFIG_FILE} 的 thresholds 必须是 {"minKillScore":<0-100>,"maxSurvivors":<非负整数>}（两键都给；阈值配置化——缺省即用 provisional 出厂兜底，不给半份）`,
      installHint: `字段形态见：${MUTATION_CONFIG_HINT}`,
    };
  }
  return {
    ok: true,
    config: {
      runner,
      command,
      changedFiles,
      report: typeof reportRaw === "string" ? reportRaw.replaceAll("\\", "/") : null,
      thresholds,
    },
    evidence: `配置文件命中: ${configPath}（runner=${runner}，changed-code scope ${String(changedFiles.length)} 文件）`,
  };
}

// ============================================================
// SKIPPED_BY_POLICY 映射记录（P12c 裁定映射；D1 决策的档位注记分流）
// ============================================================

/**
 * SKIPPED_BY_POLICY 映射记录（verdict=not_run + notApplicable=1 + policy_skip 口径）。
 * 档位注记分流（决策 D1）：MINIMAL/LIGHT/FAST = coverage/CRAP 同款档位比例语义；
 * STANDARD 单列 B2-3 原文「HARDENING 档专属」锚（整 gate 专属——STANDARD 不跑不呈报，
 * 非 CRAP B2-2 阈值专属的 STANDARD 跑+呈报语义）。
 */
function mutationPolicySkipRecord(
  plan: Parameters<typeof absenceRecord>[0],
  tier: GateTier,
): GateResultRecord {
  const tierNote =
    tier === "STANDARD"
      ? "STANDARD 档缺席裁定：随版计划 B2-3 原文「HARDENING 档专属」是整 gate 专属（MUTATION 仅 HARDENING 档执行）——非 CRAP B2-2「阈值…HARDENING-only 生效」的阈值专属（STANDARD 跑+呈报）语义，决策 D1 见 mutation-leg.ts 头注"
      : "PRD §27.1 治理 effort 与 Change Risk 成比例 / §27.3 档位升降级 / §73 Case G 档位缺席语义";
  const base = absenceRecord(
    plan,
    "not_run",
    `SKIPPED_BY_POLICY（映射现轴 not_run，非绿非红；MUTATION gate 在 tier=${tier} 档合法缺席——随版计划 B2-3 原文「HARDENING 档专属」；${tierNote}；显式缺席语义非静默跳过；新轴值经 vocab-pr-0002 呈报 Owner，未批前禁私加词表）`,
    0,
    0,
  );
  return {
    ...base,
    metricDialect: MUTATION_POLICY_SKIP_METRIC_DIALECT,
    counts: { ...base.counts, notApplicable: 1 },
  };
}

// ============================================================
// MUTATION 门禁 adapter
// ============================================================

/** mutation adapter run 产物。 */
export type MutationRunOutput =
  | {
      readonly plan: MutationLegPlan;
      readonly outcome: "not_declared";
      readonly externalMs: number;
    }
  | {
      readonly plan: MutationLegPlan;
      readonly outcome: "leg";
      readonly leg: MutationLegOutput;
      readonly externalMs: number;
    };

/** mutation 计划公共段（身份 + 编排锚；prepare 各分支展开——类型由推断收窄保持具体）。 */
function mutationPlanCommon(scope: GateScope, policy: GatePolicy) {
  return {
    grn: policy.grn,
    gate: MUTATION_GATE_NAME,
    gateDef: MUTATION_GATE_DEF,
    ranAtSeq: policy.ranAtSeq,
    subjectId: scope.subjectId ?? null,
    denominatorRefs: scope.denominatorRefs ?? [],
    projectRoot: scope.projectRoot,
  };
}

/**
 * MUTATION 门禁 adapter（P24；StrykerJS 腿 + mutmut 腿——B2-3/B2-4；PIT/Java 第二波
 * 显式 deferred；GateResult 必带 mutation 类型 metric_dialect——横切纪律 2）。
 * options：spawnFn / executableProbe 注入面（coverage adapter 同款先例；
 * 测试注入 fake 保证判卷矩阵与宿主环境无关）。
 */
export function createMutationAdapter(
  options: {
    /** 注入 mutation 腿 spawn（测试 fake / 显式装配）；缺省 mutationSpawn（PATH 消毒 + 64MB）。 */
    readonly spawnFn?: SpawnFn;
    /** 注入 run 前置可执行体探测（gate ①a）；缺省 platformExecutableProbe（真实 PATH）。 */
    readonly executableProbe?: ExecutableProbeFn;
  } = {},
): GateAdapter<
  DetectionResult,
  MutationLegPlan,
  MutationRunOutput
> {
  const spawnFn = options.spawnFn ?? mutationSpawn;
  const executableProbe = options.executableProbe ?? platformExecutableProbe;
  return {
    adapterId: "gauntlet-lite:mutation",

    detect(facts: DetectorFacts): DetectionResult {
      const read = readMutationGateConfig(facts);
      if (!read.ok) {
        return {
          status: "NOT_INSTALLED",
          tool: MUTATION_ADAPTER_TOOL_ID,
          reason: read.reason,
          installHint: read.installHint,
        };
      }
      const tool =
        read.config.runner === "stryker" ? detectStryker(facts) : detectMutmut(facts);
      if (tool.status === "READY") {
        return {
          status: "READY",
          tool: read.config.runner === "stryker" ? STRYKER_TOOL_ID : MUTMUT_TOOL_ID,
          detectedVersion: tool.detectedVersion,
          evidence: `${read.evidence}；${tool.evidence}`,
        };
      }
      if (tool.status === "NOT_INSTALLED") {
        return {
          ...tool,
          reason: `mutation-gate.json 声明 runner=${read.config.runner} 但 ${tool.reason}`,
        };
      }
      return tool;
    },

    prepare(
      scope: GateScope,
      policy: GatePolicy,
      facts?: DetectorFacts,
    ): MutationLegPlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const tier = resolveGateTier(policy);
      const common = mutationPlanCommon(scope, policy);
      const trigger = policy.trigger ?? "on_demand";

      // —— 档位闸（先于一切：决策 D1——MINIMAL/LIGHT/FAST/STANDARD 四档合法缺席，
      // policy_skip 短路；HARDENING 档专属随版计划 B2-3 原文）。
      if (POLICY_EXEMPT_GATE_TIERS.includes(tier) || tier === "STANDARD") {
        return {
          tool: MUTATION_ADAPTER_TOOL_ID,
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: MUTATION_POLICY_SKIP_METRIC_DIALECT,
          ...common,
          trigger,
          runner: "stryker",
          absenceKind: "profile_not_required",
          absentReason: null,
          absentHint: null,
          tier,
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_MUTATION_TIMEOUT_MS,
          reportPath: "",
          changedFiles: [],
          thresholds: MUTATION_PROVISIONAL_THRESHOLDS,
          thresholdsProvisional: true,
          expectedToolVersion: null,
        };
      }

      // —— 配置闸（未声明/坏形 → not_configured，诚实缺席非静默）。
      const read = readMutationGateConfig(resolved);
      if (!read.ok) {
        return {
          tool: MUTATION_ADAPTER_TOOL_ID,
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: MUTATION_METRIC_DIALECT_UNDECLARED,
          ...common,
          trigger,
          runner: "stryker",
          absenceKind: "config_absent",
          absentReason: read.reason,
          absentHint: read.installHint,
          tier,
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_MUTATION_TIMEOUT_MS,
          reportPath: "",
          changedFiles: [],
          thresholds: MUTATION_PROVISIONAL_THRESHOLDS,
          thresholdsProvisional: true,
          expectedToolVersion: null,
        };
      }

      const config = read.config;
      const runner = config.runner;
      const thresholds = config.thresholds ?? MUTATION_PROVISIONAL_THRESHOLDS;
      const thresholdsProvisional = config.thresholds === null;
      const metricDialect =
        runner === "stryker" ? STRYKER_METRIC_DIALECT : MUTMUT_METRIC_DIALECT;
      const tool = runner === "stryker" ? STRYKER_TOOL_ID : MUTMUT_TOOL_ID;
      const reportPath = resolveMutationReportPath(runner, config.report);
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
        reportPath,
        changedFiles: config.changedFiles,
        thresholds,
        thresholdsProvisional,
        timeoutMs: policy.timeoutMs ?? DEFAULT_MUTATION_TIMEOUT_MS,
      };

      // —— 工具闸（配置就绪但 runner 工具不在位 → tool_absent → not_run 非绿非红）。
      const detection =
        runner === "stryker" ? detectStryker(resolved) : detectMutmut(resolved);
      if (detection.status !== "READY") {
        return {
          ...planBase,
          command: "",
          versionProbeCommand: "",
          executable: mutationLegExecutable(runner),
          expectedToolVersion: null,
          absenceKind: "tool_absent",
          absentReason:
            detection.status === "NOT_INSTALLED"
              ? detection.reason
              : `${runner} 探测态异常：${detection.status}`,
          absentHint:
            detection.status === "NOT_INSTALLED" ? detection.installHint : null,
        };
      }

      if (runner === "stryker") {
        // —— stryker 腿版本锚取 package.json 声明版本（c8 腿同款：无法从配置文件
        // 可靠探测的词形拒绝出计划，禁猜版本口径）。
        if (detection.detectedVersion === null) {
          throw new Error(
            "stryker 已声明但版本词形不可解析（无法钉死 tool_version 口径）——" +
              '在 package.json 使用语义化版本区间（如 "^4.0.0"），保证 03-gate-result 的 tool_version 可判卷（c8 腿同款纪律）',
          );
        }
        return {
          ...planBase,
          toolVersion: detection.detectedVersion,
          command: buildStrykerCommand(config.command, config.changedFiles),
          versionProbeCommand: STRYKER_VERSION_PROBE_COMMAND,
          executable: mutationLegExecutable("stryker"),
          expectedToolVersion: policy.expectedToolVersion ?? null,
        };
      }

      // —— mutmut 腿：版本锚强制（pytest-cov 腿同款——Python 侧版本无法从配置文件
      // 可靠探测；run 期以 python -m mutmut --version 实测对账，失配降级 warning）。
      if (policy.expectedToolVersion === null || policy.expectedToolVersion === undefined) {
        throw new Error(
          "mutmut 腿就绪但 policy.expectedToolVersion 缺失（mutmut 版本无法从配置文件可靠探测）——" +
            '由编排层从 catalog/profile 锁供给 mutmut 版本锚（如 "2.4.4"）；run 期以 python -m mutmut --version 实测对账，失配降级 warning（pytest-cov 腿同款纪律）',
        );
      }
      return {
        ...planBase,
        toolVersion: policy.expectedToolVersion,
        command: buildMutmutCommand(config.command, config.changedFiles),
        versionProbeCommand: MUTMUT_VERSION_PROBE_COMMAND,
        executable: mutationLegExecutable("mutmut"),
        expectedToolVersion: policy.expectedToolVersion,
      };
    },

    run(plan: MutationLegPlan, injectedSpawn: SpawnFn | undefined = spawnFn): MutationRunOutput {
      const startedAt = performance.now();
      const elapsed = () => Math.max(0, Math.round(performance.now() - startedAt));
      if (plan.absenceKind !== null) {
        return { plan, outcome: "not_declared", externalMs: elapsed() };
      }
      const leg = runMutationLeg(plan, injectedSpawn, executableProbe);
      return { plan, outcome: "leg", leg, externalMs: leg.externalMs };
    },

    normalize(raw: MutationRunOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;
      assertCommonGates(plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (raw.outcome === "not_declared") {
        if (plan.absenceKind === "profile_not_required") {
          return mutationPolicySkipRecord(plan, plan.tier);
        }
        if (plan.absenceKind === "tool_absent") {
          return absenceRecord(
            plan,
            "not_run",
            `${plan.absentReason ?? "mutation 工具不在位"}；${plan.absentHint ?? ""}（not_run，非绿非红——HARDENING 档缺席工具不得当通过）`,
            selfMs,
            raw.externalMs,
          );
        }
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "未声明 mutation-gate.json"}；指引：${plan.absentHint ?? MUTATION_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
      }
      return normalizeMutationLeg(raw.leg, selfMs);
    },
  };
}
