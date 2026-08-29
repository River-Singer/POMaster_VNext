/**
 * architecture-adapter.ts —— ARCHITECTURE 门禁 adapter（G5 谱系扩展；规则驱动最小实现）。
 *
 * 职责（§59 四段，全部走既有 GateAdapter 契约，产出过 03 schema）：
 * - detect：读项目根 architecture-gate.json（forbidden import 规则清单）——规则齐备 →
 *   READY；未声明/不可解析/规则清单为空 → NOT_INSTALLED（缺席理由 + 落位指引，禁静默）。
 * - prepare：纯数据执行计划；未声明 → plan.declared=false（沿管线走 normalize →
 *   verdict=not_configured，诚实缺席，非 passed）。
 * - run：递归扫项目源码文本文件（跳过 node_modules/dist/.git/coverage/.pomaster），
 *   规则形态即 MASTer MIG-B1 已证的「src/** 禁直连 ag-grid 须走 wrapper」——
 *   命中 = 行含 forbidden 字面量且呈 import/require 形态 → violations 明细。
 * - normalize：violations>0 → failed（items 明细，location=仓内相对路径:行号）；
 *   零违例 → passed；规则配置了但零适用文件 → warning（报绿的机器自我怀疑）；
 *   规则覆盖外文件 → counts.notApplicable 显式计数 + blindspot escapeRatio 如实呈现。
 *
 * 已知盲区（诚实声明）：文本级扫描无法区分注释里的伪装 import 与真 import
 * （例如注释「禁止 import ag-grid」会被命中）——正式强口径归 dependency-cruiser /
 * import-linter 机判（doctor 探测面已备），本 adapter 是 config 驱动的最小可判卷腿。
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
  GateAdapter,
  GatePolicy,
  GateResultItemInput,
  GateResultRecord,
  GateScope,
  NormalizeContext,
} from "./adapter-types.js";
import { GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import { platformDetectorFacts } from "./detectors.js";
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
  "在项目根 architecture-gate.json 声明 forbidden import 规则：" +
  '{"rules":[{"name":"fe_no_direct_ag_grid","scopePrefix":"src/","forbidden":"ag-grid-community",' +
  '"suggestion":"须经 components/grid wrapper"}]}——规则未声明是诚实缺席（not_configured），不会被记为通过';

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

export interface ArchitectureGateConfig {
  readonly rules: readonly ArchitectureRule[];
}

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
      reason: `未找到 ${ARCHITECTURE_GATE_CONFIG_FILE}（ARCHITECTURE 门禁的 forbidden import 规则未声明）`,
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
  const rules =
    parsed !== null && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["rules"])
      ? ((parsed as Record<string, unknown>)["rules"] as unknown[])
      : null;
  if (rules === null) {
    return {
      ok: false,
      reason: `${ARCHITECTURE_GATE_CONFIG_FILE} 缺少 rules 数组——规则清单是对账分母，必须显式`,
      installHint: `字段形态见：${ARCHITECTURE_CONFIG_HINT}`,
    };
  }
  for (const rule of rules) {
    const loose =
      rule !== null && typeof rule === "object" ? (rule as Record<string, unknown>) : null;
    const name = loose?.["name"];
    const scopePrefix = loose?.["scopePrefix"];
    const forbidden = loose?.["forbidden"];
    if (
      loose === null ||
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
    config: { rules: rules as readonly ArchitectureRule[] },
    evidence: `配置文件命中: ${configPath}（${rules.length} 条 forbidden-import 规则）`,
  };
}

// ============================================================
// 扫描（run 的进程内执行）
// ============================================================

export interface ArchitectureViolation {
  readonly rule: string;
  readonly location: string;
  readonly message: string;
}

export interface ArchitectureGatePlan extends RecordPlanFields {
  readonly projectRoot: string;
  /** false = 规则未声明（沿管线走 normalize → not_configured，非 passed）。 */
  readonly declared: boolean;
  readonly rules: readonly ArchitectureRule[];
  readonly absentReason: string | null;
  /** 版本锚（policy 供给；normalize 对账 tool_version 漂移）。 */
  readonly expectedToolVersion: string | null;
  readonly trigger: RunTriggerValue;
}

export type ArchitectureRunOutput = {
  readonly plan: ArchitectureGatePlan;
  readonly outcome: "not_declared" | "scanned";
  readonly violations: readonly ArchitectureViolation[];
  readonly filesSeen: number;
  readonly filesCovered: number;
  readonly externalMs: number;
};

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

/** ARCHITECTURE 门禁 adapter（规则驱动文本扫描；无子进程）。 */
export function createArchitectureAdapter(): GateAdapter<
  DetectionResult,
  ArchitectureGatePlan,
  ArchitectureRunOutput
> {
  return {
    adapterId: "gauntlet-lite:architecture",

    detect(facts: DetectorFacts): DetectionResult {
      const read = readArchitectureConfig(facts);
      if (read.ok) {
        return {
          status: "READY",
          tool: ARCHITECTURE_TOOL_ID,
          detectedVersion: GAUNTLET_LITE_VERSION,
          evidence: read.evidence,
        };
      }
      return {
        status: "NOT_INSTALLED",
        tool: ARCHITECTURE_TOOL_ID,
        reason: read.reason,
        installHint: read.installHint,
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
          declared: false,
          rules: [],
          absentReason: read.reason,
        };
      }
      return {
        ...common,
        declared: true,
        rules: read.config.rules,
        absentReason: null,
      };
    },

    run(plan: ArchitectureGatePlan): ArchitectureRunOutput {
      const startedAt = performance.now();
      const elapsed = () => Math.max(0, Math.round(performance.now() - startedAt));
      if (!plan.declared) {
        return {
          plan,
          outcome: "not_declared",
          violations: [],
          filesSeen: 0,
          filesCovered: 0,
          externalMs: elapsed(),
        };
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
        return absenceRecord(
          plan,
          "not_configured",
          `${plan.absentReason ?? "forbidden import 规则未声明"}；指引：${ARCHITECTURE_CONFIG_HINT}`,
          selfMs,
          raw.externalMs,
        );
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
