/**
 * playwright-adapter.ts —— BROWSER 门禁确定性腿 adapter（P26 / 随版计划 Batch 3
 * B3-1「Playwright——evidence 必含 console error / network 维度」；D22①；§59
 * GateAdapter 四段契约，P23/P24/P25 adapter 同款先例）。
 *
 * 双通道纪律（D22 原文「BROWSER Gate 证据采用双通道」）：本 adapter 与 MCP 交互腿
 * （browser-adapter.ts）是**两个独立 adapter、两条独立记录**——确定性腿 ∥ 交互腿，
 * 各自 grn/tool/metric_dialect/verdict；一腿缺席（not_configured/not_run）不牵连
 * 另一腿判卷（互不牵连矩阵测试钉死）。
 *
 * 探测顺序（config 先于工具，security adapter 同款）：browser-gate.json 未声明 →
 * NOT_INSTALLED（配置线索缺席）；声明后 @playwright/test 不在位 → NOT_INSTALLED
 * （工具线索缺席，安装指引随附）。
 *
 * 档位语义（与 coverage/mutation/security 的 policy_skip **刻意不同**，PRD §27.1
 * MINIMAL 档原文「Gate 以 affected build/test/visual verify 为主」——visual verify
 * 在最小档主集内，BROWSER 腿全档判卷，不做档位豁免；缺席由 config_absent/tool_absent
 * 显式承载）。
 *
 * 版本锚纪律（security 腿同款）：@playwright/test 版本无法从配置文件可靠探测，
 * 腿就绪时 policy.expectedToolVersion 必须由编排层供给；run 期 `--version` 实测
 * 对账，失配降级 warning（DRIFTED→WARNING 缺席语义）。
 *
 * 缺席语义全部显式（C1）：config_absent → not_configured；tool_absent / 报告缺席 /
 * 维度缺失 / malformed → not_run。禁静默跳过当通过。
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
  NormalizeContext,
  SpawnFn,
} from "./adapter-types.js";
import { GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import {
  detectPlaywright,
  platformDetectorFacts,
  platformExecutableProbe,
} from "./detectors.js";
import { absenceRecord, assertCommonGates } from "./normalize-common.js";
import { BROWSER_GATE_DEF, BROWSER_GATE_NAME } from "./browser-adapter.js";
import {
  PLAYWRIGHT_CONFIG_HINT,
  PLAYWRIGHT_DEFAULT_TIMEOUT_MS,
  PLAYWRIGHT_METRIC_DIALECT,
  PLAYWRIGHT_METRIC_DIALECT_UNDECLARED,
  PLAYWRIGHT_TOOL_ID,
  PLAYWRIGHT_VERSION_PROBE_COMMAND,
  normalizePlaywrightLeg,
  playwrightLegExecutable,
  playwrightSpawn,
  readPlaywrightGateConfig,
  resolvePlaywrightReportPath,
  runPlaywrightLeg,
  type PlaywrightLegConfig,
  type PlaywrightLegOutput,
  type PlaywrightLegPlan,
} from "./playwright-leg.js";

export interface PlaywrightAdapterOptions {
  /** 注入本腿 spawn（测试 fake / 显式装配）；缺省 playwrightSpawn（PATH 消毒 + 64MB）。 */
  readonly spawnFn?: SpawnFn;
  /** 注入 run 前置可执行体探测（gate ①a）；缺省 platformExecutableProbe（真实 PATH）。 */
  readonly executableProbe?: ExecutableProbeFn;
}

/**
 * Playwright 确定性腿 adapter（P26/B3-1；D22①；也可经 createPlaywrightAdapter()
 * 自建注入面）。gate/gateDef 与 MCP 交互腿共享 BROWSER@0.1.0（同 gate 两通道两记录，
 * security 三腿同 gate 先例）。
 */
export function createPlaywrightAdapter(
  options: PlaywrightAdapterOptions = {},
): GateAdapter<DetectionResult, PlaywrightLegPlan, PlaywrightLegOutput> {
  const spawnFn = options.spawnFn ?? playwrightSpawn;
  const executableProbe = options.executableProbe ?? platformExecutableProbe;

  const configAbsencePlan = (
    scope: GateScope,
    policy: GatePolicy,
    trigger: RunTriggerValue,
    reason: string,
    hint: string,
  ): PlaywrightLegPlan => ({
    tool: PLAYWRIGHT_TOOL_ID,
    toolVersion: GAUNTLET_LITE_VERSION,
    metricDialect: PLAYWRIGHT_METRIC_DIALECT_UNDECLARED,
    grn: policy.grn,
    gate: BROWSER_GATE_NAME,
    gateDef: BROWSER_GATE_DEF,
    ranAtSeq: policy.ranAtSeq,
    subjectId: scope.subjectId ?? null,
    denominatorRefs: scope.denominatorRefs ?? [],
    projectRoot: scope.projectRoot,
    trigger,
    absenceKind: "config_absent",
    absentReason: reason,
    absentHint: hint,
    command: "",
    versionProbeCommand: "",
    executable: "",
    timeoutMs: policy.timeoutMs ?? PLAYWRIGHT_DEFAULT_TIMEOUT_MS,
    reportPath: "",
    expectedToolVersion: "",
  });

  return {
    adapterId: "gauntlet-lite:playwright",

    detect(facts: DetectorFacts): DetectionResult {
      // config 先于工具（security adapter 同款）：配置未声明 = 判卷输入缺席。
      const config = readPlaywrightGateConfig(facts);
      if (!config.ok) {
        return {
          status: "NOT_INSTALLED",
          tool: PLAYWRIGHT_TOOL_ID,
          reason: config.reason,
          installHint: config.installHint,
        };
      }
      const tool = detectPlaywright(facts);
      if (tool.status === "READY") {
        return {
          status: "READY",
          tool: PLAYWRIGHT_TOOL_ID,
          detectedVersion: tool.detectedVersion,
          evidence: `${config.evidence}；${tool.evidence}`,
        };
      }
      if (tool.status === "NOT_INSTALLED") {
        return {
          ...tool,
          reason: `browser-gate.json "playwright" 段已声明但 ${tool.reason}`,
        };
      }
      return tool;
    },

    prepare(
      scope: GateScope,
      policy: GatePolicy,
      facts?: DetectorFacts,
    ): PlaywrightLegPlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
      const common = {
        grn: policy.grn,
        gate: BROWSER_GATE_NAME,
        gateDef: BROWSER_GATE_DEF,
        ranAtSeq: policy.ranAtSeq,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        projectRoot: scope.projectRoot,
        trigger,
      };

      // —— 配置闸（文件级/段级 → not_configured，诚实缺席非静默；不做档位豁免——
      // PRD §27.1 MINIMAL 档 visual verify 在主集，见文件头注）。
      const config = readPlaywrightGateConfig(resolved);
      if (!config.ok) {
        return configAbsencePlan(scope, policy, trigger, config.reason, config.installHint);
      }

      const reportPath = resolvePlaywrightReportPath(config.config.report);
      const versionProbeCommand =
        config.config.versionProbe ?? PLAYWRIGHT_VERSION_PROBE_COMMAND;
      const planBase = {
        tool: PLAYWRIGHT_TOOL_ID,
        toolVersion: GAUNTLET_LITE_VERSION,
        metricDialect: PLAYWRIGHT_METRIC_DIALECT,
        ...common,
        absenceKind: null as null,
        absentReason: null,
        absentHint: null,
        reportPath,
        versionProbeCommand,
        executable: playwrightLegExecutable(versionProbeCommand),
        timeoutMs: policy.timeoutMs ?? PLAYWRIGHT_DEFAULT_TIMEOUT_MS,
      };

      // —— 工具闸（配置就绪但工具不在位 → tool_absent → not_run 非绿非红）。
      const detection = detectPlaywright(resolved);
      if (detection.status !== "READY") {
        return {
          ...planBase,
          command: "",
          expectedToolVersion: policy.expectedToolVersion ?? "",
          absenceKind: "tool_absent",
          absentReason:
            detection.status === "NOT_INSTALLED"
              ? detection.reason
              : `@playwright/test 探测态异常：${detection.status}`,
          absentHint:
            detection.status === "NOT_INSTALLED" ? detection.installHint : null,
        };
      }

      // —— 版本锚强制（security 腿同款——版本无法从配置文件可靠探测；run 期
      // `--version` 实测对账，失配降级 warning）。
      if (
        policy.expectedToolVersion === null ||
        policy.expectedToolVersion === undefined ||
        policy.expectedToolVersion.length === 0
      ) {
        throw new Error(
          `playwright 腿就绪但 policy.expectedToolVersion 缺失（工具版本无法从配置文件可靠探测）——` +
            `由编排层从 catalog/profile 锁供给 @playwright/test 版本锚；run 期以 "${PLAYWRIGHT_VERSION_PROBE_COMMAND}" 实测对账，失配降级 warning（security 腿同款纪律）`,
        );
      }
      return {
        ...planBase,
        toolVersion: policy.expectedToolVersion,
        command: config.config.command,
        expectedToolVersion: policy.expectedToolVersion,
      };
    },

    run(plan: PlaywrightLegPlan, injectedSpawn: SpawnFn | undefined = spawnFn): PlaywrightLegOutput {
      if (plan.absenceKind !== null) {
        // 缺席态计划不出 spawn（security adapter 的缺席输出同语义；normalize 消费
        // plan.absenceKind 分支，本形态保证缺席态零执行面）。
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
      return runPlaywrightLeg(plan, injectedSpawn, executableProbe);
    },

    normalize(raw: PlaywrightLegOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      assertCommonGates(raw.plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));
      const plan = raw.plan;
      if (plan.absenceKind === "tool_absent") {
        return absenceRecord(
          plan,
          "not_run",
          `${plan.absentReason ?? "playwright 工具不在位"}；${plan.absentHint ?? ""}（not_run，非绿非红——本腿缺席不得当通过，也不牵连 MCP 交互腿）`,
          selfMs,
          raw.externalMs,
        );
      }
      if (plan.absenceKind === "config_absent") {
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "未声明 browser-gate.json playwright 段"}；指引：${plan.absentHint ?? PLAYWRIGHT_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
      }
      return normalizePlaywrightLeg(raw, selfMs);
    },
  };
}

/** 导出配置词形别名（测试与编排层消费 browser-gate.json playwright 段词形）。 */
export type { PlaywrightLegConfig };
