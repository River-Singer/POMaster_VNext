/**
 * security-adapter.ts —— SECURITY 门禁三独立 adapter（P25 / 随版计划 Batch 2 B2-5；
 * §59 GateAdapter 四段契约，P23/P24 adapter 同款先例）。
 *
 * ============================================================
 * 防假绿核心纪律（随版计划 B2-5 原文：「三个独立 adapter，禁止合并为单一
 * "security ok" 绿灯」）——本文件的结构性落实
 * ============================================================
 * - **三个独立 adapter**：createGitleaksAdapter / createPipAuditAdapter /
 *   createSemgrepAdapter 三工厂三实例，各自独立 detect/prepare/run/normalize；
 *   无「SECURITY 总 adapter」、无 runner 选择位（coverage/mutation 的单 runner
 *   形态在此刻意不采用——选位即合并点）；
 * - **三腿三记录**：runSecurityGateLegs 一次跑三腿 = 三条独立 GateResultRecord
 *   （各自 grn/ranAtSeq/tool/metric_dialect/verdict），返回三元组——类型签名上
 *   不存在任何聚合 verdict 位；
 * - **无聚合呈现面**：ok 语义归编排/呈现层逐腿罗列（三行三态），任何把三腿
 *   压缩成单条 "security ok" 的上层写法都违反 B2-5 原文——任一腿红时聚合绿灯
 *   是撒谎；
 * - **互不牵连**：一腿缺席（工具/配置/档位）或一腿 failed 只落本腿记录，
 *   其余两腿照常独立探测、执行、判卷（组合矩阵测试钉死）。
 *
 * 共享配置（security-gate.json，三段各自独立声明、各自可选）：
 *   {"gitleaks":  {"command":"<gitleaks 扫描命令，须自行产出 JSON 报告>",
 *                  "report":"reports/security/gitleaks.json"},       // 可选（缺省落点）
 *    "pip-audit": {"command":"pip-audit -r requirements.txt -f json -o reports/security/pip-audit.json"},
 *    "semgrep":   {"command":"semgrep --config <cfg> --json --output reports/security/semgrep.json <target>"}}
 * - 段未声明 = 本腿诚实缺席（not_configured），其余两腿照常；文件级缺席/坏形
 *   = 三腿各自落 not_configured（同因三记录，仍互不牵连判卷路径）。
 *
 * 版本锚纪律（pytest-cov/mutmut 腿同款）：三工具版本无法从配置文件可靠探测，
 * 腿就绪时 policy.expectedToolVersion 必须由编排层供给；run 期 `--version` 实测
 * 对账，失配降级 warning（DRIFTED→WARNING 缺席语义）。
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
import { detectGitleaks, detectPipAudit, detectSemgrep, platformDetectorFacts, platformExecutableProbe } from "./detectors.js";
import { absenceRecord, assertCommonGates } from "./normalize-common.js";
import { resolveGateTier } from "./coverage-adapter.js";
import { securitySpawn } from "./security-leg.js";
import {
  DEFAULT_SECURITY_TIMEOUT_MS,
  GITLEAKS_METRIC_DIALECT,
  GITLEAKS_TOOL_ID,
  PIP_AUDIT_METRIC_DIALECT,
  PIP_AUDIT_TOOL_ID,
  SECURITY_GATE_CONFIG_FILE,
  SECURITY_GATE_DEF,
  SECURITY_GATE_NAME,
  SECURITY_LEG_RUNNERS,
  SECURITY_METRIC_DIALECT_UNDECLARED,
  SECURITY_POLICY_SKIP_METRIC_DIALECT,
  SEMGREP_METRIC_DIALECT,
  SEMGREP_TOOL_ID,
  normalizeSecurityLeg,
  resolveSecurityReportPath,
  runSecurityLeg,
  securityLegExecutable,
  securityLegPolicyExempt,
  securityPolicySkipNote,
  securityVersionProbeCommand,
  type SecurityLegOutput,
  type SecurityLegPlan,
  type SecurityLegRunner,
} from "./security-leg.js";

// ============================================================
// 共享配置读取（security-gate.json；facts 注入零隐式 I/O）
// ============================================================

export const SECURITY_CONFIG_HINT =
  "在项目根 security-gate.json 按腿独立声明（P25 / 随版计划 B2-5 三腿三段；任一腿缺席不影响其余两腿判卷）：" +
  '密钥扫描腿 "gitleaks":{"command":"gitleaks detect --no-git --source . --report-format json --report-path reports/security/gitleaks.json"}（gitleaks ≥8.19 亦可用 gitleaks dir 词形）；' +
  'Python 依赖漏洞腿 "pip-audit":{"command":"pip-audit -r requirements.txt -f json -o reports/security/pip-audit.json"}；' +
  '静态分析腿 "semgrep":{"command":"semgrep --config <cfg> --json --output reports/security/semgrep.json <target>"}；' +
  '各段可选 "report"（报告落点声明；缺省 reports/security/<工具名>.json——命令必须自行把 JSON 报告写到声明路径，报告回读是唯一判卷锚）；' +
  "三腿三 adapter 三 GRN 独立入账，禁止合并为单一 \"security ok\" 绿灯（防假绿纪律，B2-5 原文）；" +
  "未声明段是诚实缺席（not_configured），不会被记为通过";

/** 单腿配置段（段内两字段；report 缺省按 runner 固定落点）。 */
export interface SecurityLegToolConfig {
  /** 扫描命令原样执行（须自行产出 JSON 报告到声明/缺省报告落点）。 */
  readonly command: string;
  /** 报告落点声明（可选；null = runner 缺省 reports/security/<工具名>.json）。 */
  readonly report: string | null;
}

/** 单腿配置段读取三态：declared（就绪）/ undeclared（段未声明——合法缺席）/ invalid（段坏形）。 */
export type SecurityLegConfigState =
  | { readonly kind: "declared"; readonly config: SecurityLegToolConfig }
  | { readonly kind: "undeclared" }
  | { readonly kind: "invalid"; readonly reason: string; readonly installHint: string };

/** security-gate.json 全文件配置状态（文件级 + 三腿段级独立——段级坏形不牵连其余段）。 */
export interface SecurityGateConfigState {
  /** 文件级读取：missing / 不可解析 / 根非对象 → ok:false（三腿各自落 not_configured，同因三记录）。 */
  readonly file:
    | { readonly ok: true; readonly evidence: string }
    | { readonly ok: false; readonly reason: string; readonly installHint: string };
  readonly gitleaks: SecurityLegConfigState;
  readonly pipAudit: SecurityLegConfigState;
  readonly semgrep: SecurityLegConfigState;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** JSON 段键（kebab 词形；与 runner 词形一致——pip-audit 带连字符）。 */
function sectionKeyOf(runner: SecurityLegRunner): SecurityLegRunner {
  return runner;
}

function readLegSection(
  root: Record<string, unknown>,
  sectionKey: SecurityLegRunner,
): SecurityLegConfigState {
  const raw = root[sectionKey];
  if (raw === undefined) {
    return { kind: "undeclared" };
  }
  if (!isPlainObject(raw)) {
    return {
      kind: "invalid",
      reason: `${SECURITY_GATE_CONFIG_FILE} 的 "${sectionKey}" 段必须是 JSON 对象 {"command":"<扫描命令，须自行产出 JSON 报告>","report":"<可选报告落点>"}`,
      installHint: `段形态见：${SECURITY_CONFIG_HINT}`,
    };
  }
  const command = raw["command"];
  if (typeof command !== "string" || command.trim().length === 0) {
    return {
      kind: "invalid",
      reason: `${SECURITY_GATE_CONFIG_FILE} 的 "${sectionKey}" 段缺少非空字符串字段 command（扫描命令，须自行产出 JSON 报告到声明/缺省报告落点）`,
      installHint: `字段形态见：${SECURITY_CONFIG_HINT}`,
    };
  }
  const report = raw["report"];
  if (
    report !== undefined &&
    (typeof report !== "string" || report.trim().length === 0)
  ) {
    return {
      kind: "invalid",
      reason: `${SECURITY_GATE_CONFIG_FILE} 的 "${sectionKey}" 段 report 必须是非空字符串（报告落点；缺省 reports/security/${sectionKey}.json）`,
      installHint: `字段形态见：${SECURITY_CONFIG_HINT}`,
    };
  }
  return {
    kind: "declared",
    config: {
      command,
      report: typeof report === "string" ? report.replaceAll("\\", "/") : null,
    },
  };
}

/**
 * 读 security-gate.json（fail-closed：文件级缺席/坏形 → file.ok=false，三腿段级
 * 独立判态——某段 invalid/undeclared 不牵连其余段；全部显式留痕，禁静默）。
 */
export function readSecurityGateConfig(facts: DetectorFacts): SecurityGateConfigState {
  const configPath = facts.joinPath(facts.projectRoot, SECURITY_GATE_CONFIG_FILE);
  const raw = facts.readTextFile(configPath);
  if (raw === null) {
    return {
      file: {
        ok: false,
        reason: `未找到 ${SECURITY_GATE_CONFIG_FILE}（SECURITY 门禁三腿的判卷输入未声明）`,
        installHint: `配置指引：${SECURITY_CONFIG_HINT}`,
      },
      gitleaks: { kind: "undeclared" },
      pipAudit: { kind: "undeclared" },
      semgrep: { kind: "undeclared" },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      file: {
        ok: false,
        reason: `${SECURITY_GATE_CONFIG_FILE} 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默`,
        installHint: `修复 JSON 语法；形态见：${SECURITY_CONFIG_HINT}`,
      },
      gitleaks: { kind: "undeclared" },
      pipAudit: { kind: "undeclared" },
      semgrep: { kind: "undeclared" },
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      file: {
        ok: false,
        reason: `${SECURITY_GATE_CONFIG_FILE} 根必须是 JSON 对象（三腿段键：gitleaks / pip-audit / semgrep）`,
        installHint: `形态见：${SECURITY_CONFIG_HINT}`,
      },
      gitleaks: { kind: "undeclared" },
      pipAudit: { kind: "undeclared" },
      semgrep: { kind: "undeclared" },
    };
  }
  return {
    file: {
      ok: true,
      evidence: `配置文件命中: ${configPath}（三腿段：${SECURITY_LEG_RUNNERS.map(
        (runner) => `${sectionKeyOf(runner)}=${parsed[sectionKeyOf(runner)] === undefined ? "未声明" : "声明"}`,
      ).join(" / ")}）`,
    },
    gitleaks: readLegSection(parsed, "gitleaks"),
    pipAudit: readLegSection(parsed, "pip-audit"),
    semgrep: readLegSection(parsed, "semgrep"),
  };
}

// ============================================================
// 三腿身份常量映射（单一表——三 adapter 消费，禁就地第三份拷贝）
// ============================================================

function legToolId(runner: SecurityLegRunner): string {
  return runner === "gitleaks"
    ? GITLEAKS_TOOL_ID
    : runner === "pip-audit"
      ? PIP_AUDIT_TOOL_ID
      : SEMGREP_TOOL_ID;
}

function legMetricDialect(runner: SecurityLegRunner): string {
  return runner === "gitleaks"
    ? GITLEAKS_METRIC_DIALECT
    : runner === "pip-audit"
      ? PIP_AUDIT_METRIC_DIALECT
      : SEMGREP_METRIC_DIALECT;
}

function legConfigState(
  state: SecurityGateConfigState,
  runner: SecurityLegRunner,
): SecurityLegConfigState {
  return runner === "gitleaks"
    ? state.gitleaks
    : runner === "pip-audit"
      ? state.pipAudit
      : state.semgrep;
}

// ============================================================
// 工厂共享体（三 adapter 同构；独立性在「三实例三记录」，不在三份拷贝代码）
// ============================================================

export interface SecurityAdapterOptions {
  /** 注入本腿 spawn（测试 fake / 显式装配）；缺省 securitySpawn（PATH 消毒 + 64MB）。 */
  readonly spawnFn?: SpawnFn;
  /** 注入 run 前置可执行体探测（gate ①a）；缺省 platformExecutableProbe（真实 PATH）。 */
  readonly executableProbe?: ExecutableProbeFn;
}

/** 单腿 prepare 异常 → 本腿 blocked（其余两腿照常——互不牵连到编排异常层）。 */
function prepareFailureBlockedRecord(
  runner: SecurityLegRunner,
  scope: GateScope,
  policy: GatePolicy,
  detail: string,
): GateResultRecord {
  return absenceRecord(
    {
      grn: policy.grn,
      gate: SECURITY_GATE_NAME,
      gateDef: SECURITY_GATE_DEF,
      ranAtSeq: policy.ranAtSeq,
      subjectId: scope.subjectId ?? null,
      denominatorRefs: scope.denominatorRefs ?? [],
      tool: legToolId(runner),
      toolVersion: GAUNTLET_LITE_VERSION,
      metricDialect: SECURITY_METRIC_DIALECT_UNDECLARED,
    },
    "blocked",
    `security 腿（${runner}）prepare 异常（blocked，禁静默；本腿 blocked 不牵连其余两腿）：${detail}`,
    0,
    0,
  );
}

/** 三腿 §59 四段 adapter 同构实现（三工厂各建一实例——三个独立 adapter 的结构性落实）。 */
function createLegAdapterInner(
  runner: SecurityLegRunner,
  options: SecurityAdapterOptions,
): GateAdapter<DetectionResult, SecurityLegPlan, SecurityLegOutput> {
  const spawnFn = options.spawnFn ?? securitySpawn;
  const executableProbe = options.executableProbe ?? platformExecutableProbe;
  const detector = (facts: DetectorFacts): DetectionResult =>
    runner === "gitleaks"
      ? detectGitleaks(facts)
      : runner === "pip-audit"
        ? detectPipAudit(facts)
        : detectSemgrep(facts);
  const sectionKey = sectionKeyOf(runner);

  return {
    adapterId: `gauntlet-lite:${runner}`,

    detect(facts: DetectorFacts): DetectionResult {
      const state = readSecurityGateConfig(facts);
      if (!state.file.ok) {
        return {
          status: "NOT_INSTALLED",
          tool: legToolId(runner),
          reason: state.file.reason,
          installHint: state.file.installHint,
        };
      }
      const leg = legConfigState(state, runner);
      if (leg.kind === "undeclared") {
        return {
          status: "NOT_INSTALLED",
          tool: legToolId(runner),
          reason: `${SECURITY_GATE_CONFIG_FILE} 未声明 "${sectionKey}" 段（本腿判卷输入未声明——诚实缺席，不影响其余两腿）`,
          installHint: `配置指引：${SECURITY_CONFIG_HINT}`,
        };
      }
      if (leg.kind === "invalid") {
        return {
          status: "NOT_INSTALLED",
          tool: legToolId(runner),
          reason: leg.reason,
          installHint: leg.installHint,
        };
      }
      const tool = detector(facts);
      if (tool.status === "READY") {
        return {
          status: "READY",
          tool: legToolId(runner),
          detectedVersion: tool.detectedVersion,
          evidence: `${state.file.evidence}；${tool.evidence}`,
        };
      }
      if (tool.status === "NOT_INSTALLED") {
        return {
          ...tool,
          reason: `security-gate.json "${sectionKey}" 段已声明但 ${tool.reason}`,
        };
      }
      return tool;
    },

    prepare(
      scope: GateScope,
      policy: GatePolicy,
      facts?: DetectorFacts,
    ): SecurityLegPlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const tier = resolveGateTier(policy);
      const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
      const common = {
        grn: policy.grn,
        gate: SECURITY_GATE_NAME,
        gateDef: SECURITY_GATE_DEF,
        ranAtSeq: policy.ranAtSeq,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        projectRoot: scope.projectRoot,
        runner,
        trigger,
        tier,
      };

      // —— 档位闸（先于一切：MINIMAL/LIGHT/FAST 档合法缺席，policy_skip 短路——
      // P12c 先例；三腿独立缺席，任一腿 policy_skip 不牵连其余两腿）。
      if (securityLegPolicyExempt(tier)) {
        return {
          tool: legToolId(runner),
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: SECURITY_POLICY_SKIP_METRIC_DIALECT,
          ...common,
          absenceKind: "profile_not_required",
          absentReason: null,
          absentHint: null,
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_SECURITY_TIMEOUT_MS,
          reportPath: "",
          expectedToolVersion: "",
        };
      }

      // —— 配置闸（文件级/段级 → not_configured，诚实缺席非静默；段级缺席不牵连其余腿）。
      const state = readSecurityGateConfig(resolved);
      if (!state.file.ok) {
        return {
          tool: legToolId(runner),
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: SECURITY_METRIC_DIALECT_UNDECLARED,
          ...common,
          absenceKind: "config_absent",
          absentReason: state.file.reason,
          absentHint: state.file.installHint,
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_SECURITY_TIMEOUT_MS,
          reportPath: "",
          expectedToolVersion: "",
        };
      }
      const leg = legConfigState(state, runner);
      if (leg.kind !== "declared") {
        return {
          tool: legToolId(runner),
          toolVersion: GAUNTLET_LITE_VERSION,
          metricDialect: SECURITY_METRIC_DIALECT_UNDECLARED,
          ...common,
          absenceKind: "config_absent",
          absentReason:
            leg.kind === "undeclared"
              ? `${SECURITY_GATE_CONFIG_FILE} 未声明 "${sectionKey}" 段（本腿判卷输入未声明——诚实缺席，不影响其余两腿）`
              : leg.reason,
          absentHint:
            leg.kind === "undeclared"
              ? `配置指引：${SECURITY_CONFIG_HINT}`
              : leg.installHint,
          command: "",
          versionProbeCommand: "",
          executable: "",
          timeoutMs: policy.timeoutMs ?? DEFAULT_SECURITY_TIMEOUT_MS,
          reportPath: "",
          expectedToolVersion: "",
        };
      }

      const reportPath = resolveSecurityReportPath(runner, leg.config.report);
      const planBase = {
        tool: legToolId(runner),
        toolVersion: GAUNTLET_LITE_VERSION,
        metricDialect: legMetricDialect(runner),
        ...common,
        absenceKind: null as null,
        absentReason: null,
        absentHint: null,
        reportPath,
        timeoutMs: policy.timeoutMs ?? DEFAULT_SECURITY_TIMEOUT_MS,
      };

      // —— 工具闸（配置就绪但工具不在位 → tool_absent → not_run 非绿非红）。
      const detection = detector(resolved);
      if (detection.status !== "READY") {
        return {
          ...planBase,
          command: "",
          versionProbeCommand: "",
          executable: securityLegExecutable(runner),
          expectedToolVersion: policy.expectedToolVersion ?? "",
          absenceKind: "tool_absent",
          absentReason:
            detection.status === "NOT_INSTALLED"
              ? detection.reason
              : `${runner} 探测态异常：${detection.status}`,
          absentHint:
            detection.status === "NOT_INSTALLED" ? detection.installHint : null,
        };
      }

      // —— 版本锚强制（pytest-cov/mutmut 腿同款——三工具版本无法从配置文件可靠
      // 探测；run 期 --version 实测对账，失配降级 warning）。
      if (
        policy.expectedToolVersion === null ||
        policy.expectedToolVersion === undefined ||
        policy.expectedToolVersion.length === 0
      ) {
        throw new Error(
          `${runner} 腿就绪但 policy.expectedToolVersion 缺失（工具版本无法从配置文件可靠探测）——` +
            `由编排层从 catalog/profile 锁供给 ${runner} 版本锚；run 期以 "${securityVersionProbeCommand(runner)}" 实测对账，失配降级 warning（pytest-cov/mutmut 腿同款纪律）`,
        );
      }
      return {
        ...planBase,
        toolVersion: policy.expectedToolVersion,
        command: leg.config.command,
        versionProbeCommand: securityVersionProbeCommand(runner),
        executable: securityLegExecutable(runner),
        expectedToolVersion: policy.expectedToolVersion,
      };
    },

    run(plan: SecurityLegPlan, injectedSpawn: SpawnFn | undefined = spawnFn): SecurityLegOutput {
      if (plan.absenceKind !== null) {
        // 缺席态计划不出 spawn（coverage/mutation adapter 的 not_declared 同语义；
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
      return runSecurityLeg(plan, injectedSpawn, executableProbe);
    },

    normalize(raw: SecurityLegOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      assertCommonGates(raw.plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));
      const plan = raw.plan;
      if (plan.absenceKind === "profile_not_required") {
        const base = absenceRecord(
          plan,
          "not_run",
          securityPolicySkipNote(plan.tier),
          selfMs,
          raw.externalMs,
        );
        return {
          ...base,
          metricDialect: SECURITY_POLICY_SKIP_METRIC_DIALECT,
          counts: { ...base.counts, notApplicable: 1 },
        };
      }
      if (plan.absenceKind === "tool_absent") {
        return absenceRecord(
          plan,
          "not_run",
          `${plan.absentReason ?? "security 工具不在位"}；${plan.absentHint ?? ""}（not_run，非绿非红——本腿缺席不得当通过，也不牵连其余两腿）`,
          selfMs,
          raw.externalMs,
        );
      }
      if (plan.absenceKind === "config_absent") {
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "未声明 security-gate.json 本腿段"}；指引：${plan.absentHint ?? SECURITY_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
      }
      return normalizeSecurityLeg(raw, selfMs);
    },
  };
}

/**
 * gitleaks adapter（P25 密钥扫描腿；PRD §26 secret 轴；B2-5 三独立 adapter 之一）。
 */
export function createGitleaksAdapter(
  options: SecurityAdapterOptions = {},
): GateAdapter<DetectionResult, SecurityLegPlan, SecurityLegOutput> {
  return createLegAdapterInner("gitleaks", options);
}

/** pip-audit adapter（P25 依赖漏洞腿；PRD §26 dependency risk 轴；B2-5 三独立 adapter 之二）。 */
export function createPipAuditAdapter(
  options: SecurityAdapterOptions = {},
): GateAdapter<DetectionResult, SecurityLegPlan, SecurityLegOutput> {
  return createLegAdapterInner("pip-audit", options);
}

/** semgrep adapter（P25 静态分析腿；PRD §26 unsafe eval / XSS / CSRF 策略工具面；B2-5 三独立 adapter 之三）。 */
export function createSemgrepAdapter(
  options: SecurityAdapterOptions = {},
): GateAdapter<DetectionResult, SecurityLegPlan, SecurityLegOutput> {
  return createLegAdapterInner("semgrep", options);
}

// ============================================================
// 一次 check 跑三腿：三记录编排（**无聚合 verdict 位**——B2-5 防假绿纪律）
// ============================================================

/** 单腿身份（grn/ranAtSeq 由编排层分配——三条 GRN 独立，A4 单调序号各自供给）。 */
export interface SecurityLegIdentity {
  readonly grn: string;
  readonly ranAtSeq: number;
}

export interface SecurityGateLegsDeps {
  readonly facts?: DetectorFacts;
  readonly spawnFn?: SpawnFn;
  readonly executableProbe?: ExecutableProbeFn;
  readonly trigger?: RunTriggerValue;
  readonly timeoutMs?: number;
  readonly gateTier?: GateTier;
  /** 版本锚按腿供给（三工具版本各自独立，禁共享单锚）。 */
  readonly expectedToolVersions?: {
    readonly gitleaks?: string | null;
    readonly pipAudit?: string | null;
    readonly semgrep?: string | null;
  };
}

/**
 * 一次跑三腿（gitleaks → pip-audit → semgrep 固定序——SECURITY_LEG_RUNNERS 词序），
 * 产出**恰好三条**独立 GateResultRecord——同一次 check 跑三腿 = 三条 GRN，各态独立
 * （一腿红不牵连其余两腿变绿或变红；缺席互不牵连）。
 *
 * 防假绿纪律（B2-5 原文）：本函数返回类型是三元组，**不存在聚合 verdict 位**；
 * 消费方（编排/呈现层）只许逐腿罗列三条记录（三行三态），禁止压缩成单条
 * "security ok"——任一腿红时聚合绿灯是撒谎。单腿 prepare 异常 → 该腿 blocked
 * 记录，其余两腿照常执行（互不牵连到编排异常层）。
 */
export function runSecurityGateLegs(
  scope: GateScope,
  identities: readonly [SecurityLegIdentity, SecurityLegIdentity, SecurityLegIdentity],
  deps: SecurityGateLegsDeps = {},
): readonly [GateResultRecord, GateResultRecord, GateResultRecord] {
  const policyFor = (runner: SecurityLegRunner, identity: SecurityLegIdentity): GatePolicy => ({
    grn: identity.grn,
    ranAtSeq: identity.ranAtSeq,
    trigger: deps.trigger ?? "on_demand",
    timeoutMs: deps.timeoutMs,
    gateTier: deps.gateTier,
    expectedToolVersion:
      runner === "gitleaks"
        ? (deps.expectedToolVersions?.gitleaks ?? null)
        : runner === "pip-audit"
          ? (deps.expectedToolVersions?.pipAudit ?? null)
          : (deps.expectedToolVersions?.semgrep ?? null),
  });

  const records = SECURITY_LEG_RUNNERS.map((runner, index) => {
    const adapter = createLegAdapterInner(runner, deps);
    const identity = identities[index] as SecurityLegIdentity;
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
  return [records[0] as GateResultRecord, records[1] as GateResultRecord, records[2] as GateResultRecord];
}
