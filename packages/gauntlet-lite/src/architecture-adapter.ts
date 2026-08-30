/**
 * architecture-adapter.ts —— ARCHITECTURE 门禁 adapter（G5 谱系扩展；P22 三口径：
 * 规则文本扫描（最小腿）+ dependency-cruiser（FE）/ import-linter（BE-Python）机判腿）。
 *
 * 职责（§59 四段，全部走既有 GateAdapter 契约，产出过 03 schema）：
 * - detect：读项目根 architecture-gate.json——三种机判口径（一份配置声明一个口径，互斥）：
 *   · rules 口径（既有最小腿）：forbidden import 规则清单 → READY；
 *   · tool=dependency-cruiser 口径（P22 / gaps A7）：detectDependencyCruiser（配置文件 +
 *   package.json 版本线索）在位 → READY，缺席 → NOT_INSTALLED（理由 + 安装指引，禁静默）；
 *   · tool=import-linter 口径：detectImportLinter（配置文件线索）同上；
 *   未声明/不可解析/形态非法/混声明 → NOT_INSTALLED（缺席理由 + 落位指引，禁静默）。
 * - prepare：纯数据执行计划；未声明 → plan.declared=false + absenceKind（config_absent
 *   → normalize 落 not_configured；tool_absent → 落 not_run——诚实缺席，非 passed）。
 *   机判腿强制 policy.expectedToolVersion 版本锚（工具版本无法从配置文件可靠探测——
 *   pytest 腿同款纪律，run 期 --version 实测对账，禁伪造 semver）。
 * - run：
 *   · rules：递归扫项目源码文本文件（跳过 node_modules/dist/.git/coverage/.pomaster），
 *   命中 = 行含 forbidden 字面量且呈 import/require 形态 → violations 明细；
 *   · tool=dependency-cruiser：runDepcruiseLeg（版本探测 + --output-type json 真执行，
 *   见 dependency-cruiser-leg.ts）；
 *   · tool=import-linter：runImportLinterLeg（版本探测 + lint-imports 真执行，
 *   见 import-linter-leg.ts）。
 * - normalize：
 *   · rules：violations>0 → failed（items 明细，location=仓内相对路径:行号）；零违例 →
 *   passed；规则配置了但零适用文件 → warning（报绿的机器自我怀疑）；
 *   · 机判腿：normalizeDepcruiseLeg / normalizeImportLinterLeg（violations=违规依赖；
 *   工具缺席/执行错误 → not_run 非绿非红）。
 *
 * rules 口径已知盲区（诚实声明）：文本级扫描无法区分注释里的伪装 import 与真 import
 * （例如注释「禁止 import ag-grid」会被命中）——正式强口径归 tool=dependency-cruiser /
 * tool=import-linter 机判腿（P22 激活），rules 口径是 config 驱动的最小可判卷腿。
 *
 * D24：不计算任何 sha；D13：零运行时第三方依赖；A4：机器字段以 policy 供给的
 * grn/ranAtSeq 为锚，禁墙钟。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join as pathJoin, sep as pathSep } from "node:path";
import { performance } from "node:perf_hooks";
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  DetectionResult,
  DetectorFacts,
  ExecutableProbeFn,
  GateAdapter,
  GatePolicy,
  GateResultItemInput,
  GateResultRecord,
  GateScope,
  NormalizeContext,
  SpawnFn,
} from "./adapter-types.js";
import { GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import { GateAdapterError } from "./adapter-types.js";
import {
  DEPCUISE_DEFAULT_TOOL_ROOT,
  DEFAULT_DEPCUISE_TIMEOUT_MS,
  DEPCUISE_METRIC_DIALECT,
  DEPCUISE_TOOL_ID,
  DEPCUISE_VERSION_PROBE_COMMAND,
  normalizeDepcruiseLeg,
  depcruiseSpawn,
  runDepcruiseLeg,
  type DepcruiseLegOutput,
  type DepcruiseLegPlan,
} from "./dependency-cruiser-leg.js";
import {
  DEFAULT_IMPORT_LINTER_TIMEOUT_MS,
  IMPORT_LINTER_METRIC_DIALECT,
  IMPORT_LINTER_RUN_COMMAND,
  IMPORT_LINTER_TOOL_ID,
  IMPORT_LINTER_VERSION_PROBE_COMMAND,
  importLinterSpawn,
  normalizeImportLinterLeg,
  runImportLinterLeg,
  type ImportLinterLegOutput,
  type ImportLinterLegPlan,
} from "./import-linter-leg.js";
import {
  DEPCUISE_CONFIG_CANDIDATES,
  IMPORT_LINTER_CONFIG_CANDIDATES,
  detectDependencyCruiser,
  detectImportLinter,
  platformDetectorFacts,
  platformExecutableProbe,
} from "./detectors.js";
import {
  absenceRecord,
  assertCommonGates,
  capItems,
  type RecordPlanFields,
} from "./normalize-common.js";

// ============================================================
// 口径常量（gate 名不属 vocab-lock 管辖；新增 gate 须经 gate_def 版本化登记）
// ============================================================

export const ARCHITECTURE_GATE_NAME = "ARCHITECTURE";
export const ARCHITECTURE_GATE_DEF = "POLICY.GATE.ARCHITECTURE@0.1.0";
export const ARCHITECTURE_TOOL_ID = "gauntlet:architecture";
export const ARCHITECTURE_METRIC_DIALECT = "arch:forbidden_import_line";
export const ARCHITECTURE_GATE_CONFIG_FILE = "architecture-gate.json";

export const ARCHITECTURE_CONFIG_HINT =
  "在项目根 architecture-gate.json 声明机判口径，三种二选一（互斥，一份配置一个口径）：" +
  '文本扫描规则 {"rules":[{"name":"fe_no_direct_ag_grid","scopePrefix":"src/","forbidden":"ag-grid-community",' +
  '"suggestion":"须经 components/grid wrapper"}]}；' +
  '机判腿（P22）{"tool":"dependency-cruiser","toolRoot":"src"}（FE，需 devDependencies 安装 + .dependency-cruiser.cjs 配置）或 ' +
  '{"tool":"import-linter"}（BE-Python，需 pip install import-linter + .importlinter 配置）——' +
  "口径未声明是诚实缺席（not_configured），不会被记为通过";

/** 机判腿 tool 词表（architecture-gate.json tool 键的闭集；词表外 → NOT_INSTALLED）。 */
export const ARCH_TOOL_VALUES = ["dependency-cruiser", "import-linter"] as const;
export type ArchToolValue = (typeof ARCH_TOOL_VALUES)[number];

/** 视为源码文本的扩展名（与 kernel doctor 的 TEXT_EXTENSIONS 同族 + .vue）。 */
const ARCH_TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue",
]);

/** 扫描跳过的目录（依赖/产物/版本库/治理台账——都不是架构规则的适用载体）。 */
const ARCH_SKIP_DIRS = new Set([
  "node_modules", "dist", ".git", "coverage", ".pomaster",
]);

/** import/require 形态守卫：行须呈引入语句形态才算违例（纯提及不算）。 */
const IMPORTISH_LINE = /\b(?:import|require)\b|\bfrom\s*["']/;

// ============================================================
// 配置读取与探测
// ============================================================

/** forbidden import 规则（scopePrefix="" = 全仓适用；suggestion 可选，进 items.message）。 */
export interface ArchitectureRule {
  readonly name: string;
  readonly scopePrefix: string;
  readonly forbidden: string;
  readonly suggestion?: string;
}

/**
 * architecture-gate.json 判别联合：一份配置声明一个机判口径（横切纪律 2——
 * 一条 GateResult 只携带一个 metric_dialect，混声明即形态非法）。
 */
export type ArchitectureGateConfig =
  | { readonly mode: "rules"; readonly rules: readonly ArchitectureRule[] }
  | {
      readonly mode: "tool";
      readonly tool: ArchToolValue;
      /** 机判扫描根（仓内相对路径；仅 dependency-cruiser 消费，import-linter 忽略）。 */
      readonly toolRoot: string;
    };

export type ArchitectureConfigRead =
  | { readonly ok: true; readonly config: ArchitectureGateConfig; readonly evidence: string }
  | { readonly ok: false; readonly reason: string; readonly installHint: string };

/** 读 architecture-gate.json（facts 注入，探测矩阵零隐式 I/O）。 */
export function readArchitectureConfig(facts: DetectorFacts): ArchitectureConfigRead {
  const configPath = facts.joinPath(facts.projectRoot, ARCHITECTURE_GATE_CONFIG_FILE);
  const raw = facts.readTextFile(configPath);
  if (raw === null) {
    return {
      ok: false,
      reason: `未找到 ${ARCHITECTURE_GATE_CONFIG_FILE}（ARCHITECTURE 门禁的机判口径未声明：rules 文本扫描或 tool 机判腿）`,
      installHint: `配置指引：${ARCHITECTURE_CONFIG_HINT}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: `${ARCHITECTURE_GATE_CONFIG_FILE} 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默`,
      installHint: `修复 JSON 语法；形态见：${ARCHITECTURE_CONFIG_HINT}`,
    };
  }
  const loose =
    parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const tool = loose === null ? undefined : loose["tool"];
  const rules =
    loose !== null && Array.isArray(loose["rules"])
      ? (loose["rules"] as unknown[])
      : null;

  // —— tool 机判口径（P22）：tool 闭集 + toolRoot 可选 + 与 rules 互斥 ——
  if (tool !== undefined) {
    if (typeof tool !== "string" || !(ARCH_TOOL_VALUES as readonly string[]).includes(tool)) {
      return {
        ok: false,
        reason: `${ARCHITECTURE_GATE_CONFIG_FILE} 的 tool 词形非法（闭集：${ARCH_TOOL_VALUES.join(" | ")}）`,
        installHint: `口径形态见：${ARCHITECTURE_CONFIG_HINT}`,
      };
    }
    if (rules !== null) {
      return {
        ok: false,
        reason: `${ARCHITECTURE_GATE_CONFIG_FILE} 同时声明 rules 与 tool——两种机判口径互斥（一条 GateResult 只携带一个 metric_dialect，混声明即口径漂移）；分两次判卷，各自声明一份配置`,
        installHint: `口径形态见：${ARCHITECTURE_CONFIG_HINT}`,
      };
    }
    const rawToolRoot = loose === null ? undefined : loose["toolRoot"];
    if (
      rawToolRoot !== undefined &&
      (typeof rawToolRoot !== "string" || rawToolRoot.trim().length === 0)
    ) {
      return {
        ok: false,
        reason: `${ARCHITECTURE_GATE_CONFIG_FILE} 的 toolRoot 须为非空字符串（机判扫描根，仓内相对路径）`,
        installHint: `口径形态见：${ARCHITECTURE_CONFIG_HINT}`,
      };
    }
    return {
      ok: true,
      config: {
        mode: "tool",
        tool: tool as ArchToolValue,
        toolRoot:
          typeof rawToolRoot === "string" && rawToolRoot.length > 0
            ? rawToolRoot
            : DEPCUISE_DEFAULT_TOOL_ROOT,
      },
      evidence: `配置文件命中: ${configPath}（机判腿 tool=${tool}${typeof rawToolRoot === "string" ? `，toolRoot=${rawToolRoot}` : ""}）`,
    };
  }

  // —— rules 文本扫描口径（既有）——
  if (rules === null) {
    return {
      ok: false,
      reason: `${ARCHITECTURE_GATE_CONFIG_FILE} 缺少 rules 数组（或未声明 tool 机判腿）——机判口径必须显式二选一`,
      installHint: `口径形态见：${ARCHITECTURE_CONFIG_HINT}`,
    };
  }
  for (const rule of rules) {
    const entry =
      rule !== null && typeof rule === "object" ? (rule as Record<string, unknown>) : null;
    const name = entry?.["name"];
    const scopePrefix = entry?.["scopePrefix"];
    const forbidden = entry?.["forbidden"];
    if (
      entry === null ||
      typeof name !== "string" || name.length === 0 ||
      typeof scopePrefix !== "string" ||
      typeof forbidden !== "string" || forbidden.length === 0
    ) {
      return {
        ok: false,
        reason: `${ARCHITECTURE_GATE_CONFIG_FILE} 的 rules 条目形态非法（须含非空 name / 字符串 scopePrefix / 非空 forbidden）`,
        installHint: `字段形态见：${ARCHITECTURE_CONFIG_HINT}`,
      };
    }
  }
  if (rules.length === 0) {
    return {
      ok: false,
      reason: `${ARCHITECTURE_GATE_CONFIG_FILE} 的 rules 清单为空（空规则不足以执行 forbidden-import 机判）`,
      installHint: `至少声明一条规则；形态见：${ARCHITECTURE_CONFIG_HINT}`,
    };
  }
  return {
    ok: true,
    config: { mode: "rules", rules: rules as readonly ArchitectureRule[] },
    evidence: `配置文件命中: ${configPath}（${rules.length} 条 forbidden-import 规则）`,
  };
}

// ============================================================
// 扫描（run 的进程内执行）
// ============================================================

/** 递归收集文本源文件的仓内相对路径（posix 分隔符；跳过 ARCH_SKIP_DIRS）。 */
function collectSourceFiles(root: string, dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // 目录不可读：不计入扫描足迹（blindspot escape 如实呈现该缺席）。
  }
  for (const entry of entries) {
    const full = pathJoin(dir, entry.name);
    if (entry.isDirectory()) {
      if (ARCH_SKIP_DIRS.has(entry.name)) continue;
      collectSourceFiles(root, full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf(".");
    if (dot === -1 || !ARCH_TEXT_EXTENSIONS.has(entry.name.slice(dot))) continue;
    const relative = full.slice(root.length).split(pathSep).join("/").replace(/^\//, "");
    out.push(relative);
  }
}

/** 单文件单规则违例扫描（行号从 1 起；每行每规则至多记一条）。 */
export function scanFileForRule(
  text: string,
  rule: ArchitectureRule,
  relativePath: string,
): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (!line.includes(rule.forbidden)) continue;
    if (!IMPORTISH_LINE.test(line)) continue;
    violations.push({
      rule: rule.name,
      location: `${relativePath}:${index + 1}`,
      message: `forbidden import '${rule.forbidden}'（${rule.suggestion ?? "须走许可的封装层"}）`,
    });
  }
  return violations;
}

/**
 * 缺席种类（normalize 判卷分流）：config_absent = 口径未声明/坏形 → not_configured；
 * tool_absent = 配置就绪但机判腿工具不在位 → not_run（非绿非红）。
 */
export type ArchitectureAbsenceKind = "config_absent" | "tool_absent";

export interface ArchitectureViolation {
  readonly rule: string;
  readonly location: string;
  readonly message: string;
}

export interface ArchitectureGatePlan extends RecordPlanFields {
  readonly projectRoot: string;
  /** 机判口径（P22 三口径：rules 文本扫描 / dependency-cruiser / import-linter）。 */
  readonly mode: "rules" | "dependency-cruiser" | "import-linter";
  /** false = 口径缺席（absenceKind 分流到 normalize 的 not_configured / not_run）。 */
  readonly declared: boolean;
  readonly absenceKind: ArchitectureAbsenceKind | null;
  readonly rules: readonly ArchitectureRule[];
  /** 机判扫描根（仓内相对路径；仅 dependency-cruiser 消费）。 */
  readonly toolRoot: string | null;
  /** 机判配置文件名（探测命中候选；items/说明引用）。 */
  readonly toolConfigName: string | null;
  readonly absentReason: string | null;
  readonly installHint: string | null;
  /** 机判腿执行计划（prepare 组装；rules 口径 null）。 */
  readonly depcruisePlan: DepcruiseLegPlan | null;
  readonly importLinterPlan: ImportLinterLegPlan | null;
  /** 版本锚（policy 供给；normalize 对账 tool_version 漂移）。 */
  readonly expectedToolVersion: string | null;
  readonly trigger: RunTriggerValue;
}

export type ArchitectureRunOutput =
  | {
      readonly plan: ArchitectureGatePlan;
      readonly outcome: "not_declared";
      readonly externalMs: number;
    }
  | {
      readonly plan: ArchitectureGatePlan;
      readonly outcome: "scanned";
      readonly violations: readonly ArchitectureViolation[];
      readonly filesSeen: number;
      readonly filesCovered: number;
      readonly externalMs: number;
    }
  | {
      readonly plan: ArchitectureGatePlan;
      readonly outcome: "tool_leg";
      readonly leg: DepcruiseLegOutput | ImportLinterLegOutput;
      readonly externalMs: number;
    };

/** 机判腿配置文件发现（与探测面同源候选清单；命中顺序即候选序）。 */
function findToolConfigName(
  facts: DetectorFacts,
  candidates: readonly string[],
): string | null {
  for (const name of candidates) {
    if (facts.fileExists(facts.joinPath(facts.projectRoot, name))) {
      return name;
    }
  }
  return null;
}

/**
 * ARCHITECTURE 门禁 adapter（P22 三口径：规则驱动文本扫描 + 双工具机判腿）。
 * 机判腿经注入的 spawnFn 执行（§59 run 第二参；缺省各 leg 的 PATH 消毒 spawn）。
 */
export function createArchitectureAdapter(
  options: {
    /** 注入 dependency-cruiser 腿 spawn（测试 fake）；缺省 depcruiseSpawn。 */
    readonly depcruiseSpawnFn?: SpawnFn;
    /** 注入 import-linter 腿 spawn（测试 fake）；缺省 importLinterSpawn。 */
    readonly importLinterSpawnFn?: SpawnFn;
    /** 注入 dependency-cruiser 腿 run 前置可执行体探测（测试 fake）；缺省扫真实 PATH。 */
    readonly depcruiseExecutableProbe?: ExecutableProbeFn;
    /** 注入 import-linter 腿 run 前置可执行体探测（测试 fake）；缺省扫真实 PATH。 */
    readonly importLinterExecutableProbe?: ExecutableProbeFn;
  } = {},
): GateAdapter<
  DetectionResult,
  ArchitectureGatePlan,
  ArchitectureRunOutput
> {
  const depcruiseSpawnFn = options.depcruiseSpawnFn ?? depcruiseSpawn;
  const importLinterSpawnFn = options.importLinterSpawnFn ?? importLinterSpawn;
  const depcruiseExecutableProbe =
    options.depcruiseExecutableProbe ?? platformExecutableProbe;
  const importLinterExecutableProbe =
    options.importLinterExecutableProbe ?? platformExecutableProbe;
  return {
    adapterId: "gauntlet-lite:architecture",

    detect(facts: DetectorFacts): DetectionResult {
      const read = readArchitectureConfig(facts);
      if (!read.ok) {
        return {
          status: "NOT_INSTALLED",
          tool: ARCHITECTURE_TOOL_ID,
          reason: read.reason,
          installHint: read.installHint,
        };
      }
      if (read.config.mode === "rules") {
        return {
          status: "READY",
          tool: ARCHITECTURE_TOOL_ID,
          detectedVersion: GAUNTLET_LITE_VERSION,
          evidence: read.evidence,
        };
      }
      // 机判腿口径：配置就绪还不够，对应工具必须在位（探测面直连，理由/指引自带）。
      if (read.config.tool === "dependency-cruiser") {
        const detection = detectDependencyCruiser(facts);
        if (detection.status === "READY") {
          return {
            status: "READY",
            tool: DEPCUISE_TOOL_ID,
            detectedVersion: detection.detectedVersion,
            evidence: `${read.evidence}；${detection.evidence}`,
          };
        }
        return {
          status: "NOT_INSTALLED",
          tool: DEPCUISE_TOOL_ID,
          reason:
            detection.status === "NOT_INSTALLED"
              ? `机判腿声明就绪但 ${detection.reason}`
              : `机判腿声明就绪但 dependency-cruiser 探测态异常：${detection.status}`,
          installHint:
            detection.status === "NOT_INSTALLED"
              ? detection.installHint
              : ARCHITECTURE_CONFIG_HINT,
        };
      }
      const detection = detectImportLinter(facts);
      if (detection.status === "READY") {
        return {
          status: "READY",
          tool: IMPORT_LINTER_TOOL_ID,
          detectedVersion: null,
          evidence: `${read.evidence}；${detection.evidence}`,
        };
      }
      return {
        status: "NOT_INSTALLED",
        tool: IMPORT_LINTER_TOOL_ID,
        reason:
          detection.status === "NOT_INSTALLED"
            ? `机判腿声明就绪但 ${detection.reason}`
            : `机判腿声明就绪但 import-linter 探测态异常：${detection.status}`,
        installHint:
          detection.status === "NOT_INSTALLED"
            ? detection.installHint
            : ARCHITECTURE_CONFIG_HINT,
      };
    },

    prepare(
      scope: GateScope,
      policy: GatePolicy,
      facts?: DetectorFacts,
    ): ArchitectureGatePlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const read = readArchitectureConfig(resolved);
      const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
      const common = {
        tool: ARCHITECTURE_TOOL_ID,
        toolVersion: GAUNTLET_LITE_VERSION,
        gate: ARCHITECTURE_GATE_NAME,
        gateDef: ARCHITECTURE_GATE_DEF,
        metricDialect: ARCHITECTURE_METRIC_DIALECT,
        grn: policy.grn,
        ranAtSeq: policy.ranAtSeq,
        trigger,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        projectRoot: scope.projectRoot,
        expectedToolVersion: policy.expectedToolVersion ?? null,
      };
      if (!read.ok) {
        return {
          ...common,
          mode: "rules",
          declared: false,
          absenceKind: "config_absent",
          rules: [],
          toolRoot: null,
          toolConfigName: null,
          absentReason: read.reason,
          installHint: read.installHint,
          depcruisePlan: null,
          importLinterPlan: null,
        };
      }
      if (read.config.mode === "rules") {
        return {
          ...common,
          mode: "rules",
          declared: true,
          absenceKind: null,
          rules: read.config.rules,
          toolRoot: null,
          toolConfigName: null,
          absentReason: null,
          installHint: null,
          depcruisePlan: null,
          importLinterPlan: null,
        };
      }

      // —— 机判腿：工具在位性 + 版本锚强制（pytest 腿同款纪律）——
      // TS 收窄不进闭包：read.config 的判别联合在箭头函数体内不保留收窄（TS2339），
      // 先在此把 tool 词形收窄成局部常量再被闭包引用。
      const toolName: ArchToolValue = read.config.tool;
      const versionAnchorError = () =>
        new GateAdapterError(
          "runner_not_ready",
          `${toolName} 机判腿就绪但 policy.expectedToolVersion 缺失（工具版本无法从配置文件可靠探测）`,
          "由编排层从 catalog/profile 锁供给版本锚；run 期以 --version 实测对账，失配降级 warning",
        );

      if (read.config.tool === "dependency-cruiser") {
        const detection = detectDependencyCruiser(resolved);
        if (detection.status !== "READY") {
          const absentReason =
            detection.status === "NOT_INSTALLED"
              ? detection.reason
              : `dependency-cruiser 探测态异常：${detection.status}`;
          return {
            ...common,
            mode: "dependency-cruiser",
            declared: false,
            absenceKind: "tool_absent",
            rules: [],
            toolRoot: read.config.toolRoot,
            toolConfigName: null,
            absentReason,
            installHint:
              detection.status === "NOT_INSTALLED" ? detection.installHint : null,
            depcruisePlan: null,
            importLinterPlan: null,
          };
        }
        if (
          policy.expectedToolVersion === null ||
          policy.expectedToolVersion === undefined
        ) {
          throw versionAnchorError();
        }
        const configName =
          findToolConfigName(resolved, DEPCUISE_CONFIG_CANDIDATES) ??
          DEPCUISE_CONFIG_CANDIDATES[0];
        const depcruisePlan: DepcruiseLegPlan = {
          tool: DEPCUISE_TOOL_ID,
          toolVersion: policy.expectedToolVersion,
          gate: ARCHITECTURE_GATE_NAME,
          gateDef: ARCHITECTURE_GATE_DEF,
          metricDialect: DEPCUISE_METRIC_DIALECT,
          grn: policy.grn,
          ranAtSeq: policy.ranAtSeq,
          trigger,
          subjectId: scope.subjectId ?? null,
          denominatorRefs: scope.denominatorRefs ?? [],
          projectRoot: scope.projectRoot,
          command:
            `corepack pnpm exec depcruise "${read.config.toolRoot}" ` +
            `--config "${configName}" --output-type json`,
          versionProbeCommand: DEPCUISE_VERSION_PROBE_COMMAND,
          timeoutMs: policy.timeoutMs ?? DEFAULT_DEPCUISE_TIMEOUT_MS,
          toolRoot: read.config.toolRoot,
          configName,
          expectedToolVersion: policy.expectedToolVersion,
        };
        return {
          ...common,
          mode: "dependency-cruiser",
          declared: true,
          absenceKind: null,
          rules: [],
          toolRoot: read.config.toolRoot,
          toolConfigName: configName,
          absentReason: null,
          installHint: null,
          depcruisePlan,
          importLinterPlan: null,
        };
      }

      const detection = detectImportLinter(resolved);
      if (detection.status !== "READY") {
        const absentReason =
          detection.status === "NOT_INSTALLED"
            ? detection.reason
            : `import-linter 探测态异常：${detection.status}`;
        return {
          ...common,
          mode: "import-linter",
          declared: false,
          absenceKind: "tool_absent",
          rules: [],
          toolRoot: read.config.toolRoot,
          toolConfigName: null,
          absentReason,
          installHint:
            detection.status === "NOT_INSTALLED" ? detection.installHint : null,
          depcruisePlan: null,
          importLinterPlan: null,
        };
      }
      if (
        policy.expectedToolVersion === null ||
        policy.expectedToolVersion === undefined
      ) {
        throw versionAnchorError();
      }
      const configName =
        findToolConfigName(resolved, IMPORT_LINTER_CONFIG_CANDIDATES) ??
        IMPORT_LINTER_CONFIG_CANDIDATES[0];
      const importLinterPlan: ImportLinterLegPlan = {
        tool: IMPORT_LINTER_TOOL_ID,
        toolVersion: policy.expectedToolVersion,
        gate: ARCHITECTURE_GATE_NAME,
        gateDef: ARCHITECTURE_GATE_DEF,
        metricDialect: IMPORT_LINTER_METRIC_DIALECT,
        grn: policy.grn,
        ranAtSeq: policy.ranAtSeq,
        trigger,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        projectRoot: scope.projectRoot,
        command: IMPORT_LINTER_RUN_COMMAND,
        versionProbeCommand: IMPORT_LINTER_VERSION_PROBE_COMMAND,
        timeoutMs: policy.timeoutMs ?? DEFAULT_IMPORT_LINTER_TIMEOUT_MS,
        configName,
        expectedToolVersion: policy.expectedToolVersion,
      };
      return {
        ...common,
        mode: "import-linter",
        declared: true,
        absenceKind: null,
        rules: [],
        toolRoot: read.config.toolRoot,
        toolConfigName: configName,
        absentReason: null,
        installHint: null,
        depcruisePlan: null,
        importLinterPlan,
      };
    },

    run(
      plan: ArchitectureGatePlan,
      spawnFn: SpawnFn = plan.mode === "import-linter" ? importLinterSpawnFn : depcruiseSpawnFn,
    ): ArchitectureRunOutput {
      const startedAt = performance.now();
      const elapsed = () => Math.max(0, Math.round(performance.now() - startedAt));
      if (!plan.declared) {
        return {
          plan,
          outcome: "not_declared",
          externalMs: elapsed(),
        };
      }
      if (plan.mode === "dependency-cruiser") {
        if (plan.depcruisePlan === null) {
          throw new GateAdapterError(
            "runner_not_implemented",
            "dependency-cruiser 计划缺 depcruisePlan（prepare 契约破坏）",
            "plan.depcruisePlan 与 plan.mode 必须同源（architecture-adapter.prepare 组装）",
          );
        }
        const leg = runDepcruiseLeg(plan.depcruisePlan, spawnFn, depcruiseExecutableProbe);
        return { plan, outcome: "tool_leg", leg, externalMs: leg.externalMs };
      }
      if (plan.mode === "import-linter") {
        if (plan.importLinterPlan === null) {
          throw new GateAdapterError(
            "runner_not_implemented",
            "import-linter 计划缺 importLinterPlan（prepare 契约破坏）",
            "plan.importLinterPlan 与 plan.mode 必须同源（architecture-adapter.prepare 组装）",
          );
        }
        const leg = runImportLinterLeg(plan.importLinterPlan, spawnFn, importLinterExecutableProbe);
        return { plan, outcome: "tool_leg", leg, externalMs: leg.externalMs };
      }
      const relatives: string[] = [];
      collectSourceFiles(plan.projectRoot, plan.projectRoot, relatives);
      const violations: ArchitectureViolation[] = [];
      let filesCovered = 0;
      for (const relative of relatives) {
        const coveredRules = plan.rules.filter(
          (rule) => rule.scopePrefix === "" || relative.startsWith(rule.scopePrefix),
        );
        if (coveredRules.length === 0) continue;
        filesCovered++;
        let text: string;
        try {
          text = readFileSync(pathJoin(plan.projectRoot, relative), "utf8");
        } catch {
          continue; // 文件不可读：计入 covered 但零产出 → blindspot escape 如实呈现。
        }
        for (const rule of coveredRules) {
          violations.push(...scanFileForRule(text, rule, relative));
        }
      }
      return {
        plan,
        outcome: "scanned",
        violations,
        filesSeen: relatives.length,
        filesCovered,
        externalMs: elapsed(),
      };
    },

    normalize(
      raw: ArchitectureRunOutput,
      context: NormalizeContext,
    ): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;
      assertCommonGates(plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));

      if (raw.outcome === "not_declared") {
        if (plan.absenceKind === "tool_absent") {
          // 工具缺席（非配置缺席）：not_run 非绿非红 + 安装路标（诚实缺席禁静默当通过）。
          return absenceRecord(
            plan,
            "not_run",
            `${plan.absentReason ?? "机判腿工具不在位"}；${plan.installHint ?? ""}（not_run，非绿非红）`,
            selfMs,
            raw.externalMs,
          );
        }
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "机判口径未声明"}；指引：${plan.installHint ?? ARCHITECTURE_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
      }
      if (raw.outcome === "tool_leg") {
        // 机判腿判卷（violations=违规依赖重算 + 明细 items；工具缺席 → not_run 腿内处理）。
        return normalizeLeg(raw.leg, selfMs);
      }

      const filesSeen = raw.filesSeen;
      const filesCovered = raw.filesCovered;
      const violations = raw.violations;

      const caps: string[] = [];
      if (
        plan.expectedToolVersion !== null &&
        plan.toolVersion !== plan.expectedToolVersion
      ) {
        caps.push("tool_version_drifted");
      }

      let verdict: VerdictValue;
      let capReason: string | null;
      if (violations.length > 0) {
        verdict = "failed";
        capReason = null;
      } else if (filesCovered === 0) {
        // 规则配置了但零适用文件（空仓/范围拼错）——零扫描不可能是 passed（报绿自我怀疑）。
        verdict = "warning";
        capReason = "zero_applicable_files_nothing_verified";
      } else {
        verdict = caps.length > 0 ? "warning" : "passed";
        capReason = caps.length > 0 ? caps.join("+") : null;
      }

      const cappedItems = capItems(
        violations.map((violation): GateResultItemInput => ({
          rule: violation.rule,
          location: violation.location,
          message: violation.message,
        })),
      );

      const record: Omit<GateResult, "tool" | "toolVersion" | "metricDialect"> = {
        grn: plan.grn,
        gate: plan.gate,
        gateDef: plan.gateDef,
        ranAtSeq: plan.ranAtSeq,
        verdict,
        verdictCapReason: capReason,
        subjectId:
          plan.subjectId === null ? null : (plan.subjectId as GateResult["subjectId"]),
        isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
        denominatorRefs: plan.denominatorRefs.map((ref) => ({
          id: ref.id as GateResult["denominatorRefs"][number]["id"],
          versionSeen: ref.versionSeen,
        })),
        counts: {
          scanned: filesSeen,
          applicableScanned: filesCovered,
          violations: violations.length,
          // notApplicable = 规则覆盖外的文件数（「多少文件与本规则无关」是数字不是沉默）。
          notApplicable: filesSeen - filesCovered,
        },
        blindspot: {
          scanned: filesSeen,
          produced: filesCovered,
          escapeRatio:
            filesSeen === 0 ? 0 : (filesSeen - filesCovered) / filesSeen,
        },
        trust: {
          asserted: null, // 无工具自报：逐行重算即判卷（C5）。
          recomputed: { violations: violations.length, matchesAsserted: true },
        },
        durationMs: { self: selfMs, external: raw.externalMs },
      };
      return {
        ...record,
        tool: plan.tool,
        toolVersion: plan.toolVersion,
        metricDialect: plan.metricDialect,
        ...(cappedItems.items.length > 0 ? { items: cappedItems.items } : {}),
        ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
      };
    },
  };
}

/** 机判腿产物分派（DepcruiseLegOutput / ImportLinterLegOutput 一次性收窄）。 */
function normalizeLeg(
  leg: DepcruiseLegOutput | ImportLinterLegOutput,
  selfMs: number,
): GateResultRecord {
  if ("toolRoot" in leg.plan) {
    return normalizeDepcruiseLeg(leg as DepcruiseLegOutput, selfMs);
  }
  return normalizeImportLinterLeg(leg as ImportLinterLegOutput, selfMs);
}
