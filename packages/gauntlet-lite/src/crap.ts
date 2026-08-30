/**
 * crap.ts —— CRAP 原生计算器（P23 / 随版计划 Batch 2 B2-2）。
 *
 * 权威出处（公式本体 POMaster 原生计算，仅两个输入源来自第三方工具输出）：
 * - PRD §28.1 CRAP v1：`CRAP = Complexity² × (1 - Coverage)³ + Complexity`——
 *   「目的不是评判代码美不美，而是标记 High Complexity + Low Test Protection」；
 * - 随版计划 B2-2 原文：「CRAP 公式…为 POMaster 原生计算，仅两个输入源为第三方；
 *   阈值配置化，HARDENING-only 生效（PRD §27.2 Gate Profile）」；
 * - PRD §26.2 CRAP 注：「阈值必须配置化，不把某个数字当成永久真理」；
 * - PRD §73 Case G：「P1 启用 CRAP 后再提供 Code Unit 级复合风险，不得让 CRAP 成为
 *   P0 Core 的前置依赖」——CRAP gate 合法缺席语义由此而来（MINIMAL/LIGHT/FAST 档）。
 *
 * 输入源（两份第三方报告，均配置声明路径、run 侧只读）：
 * - 复杂度：radon `cc --json` 词形（map<file, blocks[{complexity}]>，取文件内最大块
 *   复杂度）或直拍数字词形（map<file, number>）；词形之外一律 malformed；
 * - 覆盖率：coverage 腿同款报告（c8 coverage-summary.json / pytest-cov coverage.json，
 *   parseCoverageReport 单一分派点复用——CRAP v1 Coverage 取行口径，PRD 公式的
 *   Coverage 与 CRAP 原始定义（statement coverage）同源；分支口径已在 COVERAGE gate
 *   强制上报，两 gate 分工不混算）。
 *
 * fail-closed 纪律（P23 出口判据）：缺复杂度或覆盖率输入 = 显式 not_run / 错误态，
 * 非默认值——禁把缺席输入当 0 复杂度或满覆盖静默判绿；词形不可解析同理 not_run。
 *
 * 判卷语义（档位轴 GATE_TIER_VALUES，adapter-types.ts）：
 * - HARDENING：crap > maxCrap 逐文件记 violations + items（HARDENING-only 判罚）；
 * - STANDARD：CRAP 照算照报（scopeNote 呈报 max CRAP），阈值不判罚——有超标降
 *   warning（cap=crap_above_threshold_deferred_to_hardening）呈报，非静默 passed；
 * - MINIMAL/LIGHT/FAST：合法缺席（coverage-adapter prepare 层 policy_skip 短路，
 *   本函数不接收该档——防御性显式拒绝）。
 * v1 粒度裁定（PRD Case G「Code Unit 级」为 P2 方向，v1 以文件为 Code Unit 代理
 * 粒度）：连接键 = 报告内文件路径（分隔符归一 + ./ 前缀剥离）；复杂度文件在覆盖率
 * 报告无对应条目 = 连接缺口 → counts.notApplicable 显式计数（非静默、非猜值）。
 * 反向同查（P23 红队 MINOR）：覆盖率报告有行口径而复杂度报告无条目的文件不入
 * CRAP 分母——单向缩分母禁静默，scopeNote 显式计数披露（不发明新 verdict 语义，
 * 只补披露面）。
 *
 * D24：本文件不计算任何 sha；A4：机器字段以 policy 供给的 grn/ranAtSeq 为锚，禁墙钟。
 */
import type { GateResult } from "@pomaster/kernel";
import type { RunTriggerValue } from "@pomaster/schemas";
import type { GateTier } from "./adapter-types.js";
import { GATE_TIER_VALUES, GAUNTLET_LITE_VERSION } from "./adapter-types.js";
import type { GateResultItemInput, GateResultRecord } from "./adapter-types.js";
import {
  parseCoverageReport,
  PROVISIONAL_THRESHOLD_NOTE,
} from "./coverage-leg.js";
import { absenceRecord, capItems, type RecordPlanFields } from "./normalize-common.js";

export const CRAP_GATE_NAME = "COMPLEXITY_CRAP";
export const CRAP_GATE_DEF = "POLICY.GATE.COMPLEXITY_CRAP@0.1.0";
/** POMaster 原生计算——tool 即 POMaster 自身（contract operation_ids 口径同款先例），版本=包版本。 */
export const CRAP_TOOL_ID = "gauntlet:crap";
export const CRAP_METRIC_DIALECT = "crap:pomaster_native_v1";
/**
 * 缺席记录的机器可辨口径轴（P12c policySkip 映射裁定同款：MINIMAL/LIGHT/FAST 档
 * 合法缺席落 not_run + counts.notApplicable=1，与执行腿口径在记录级区分）。
 */
export const CRAP_POLICY_SKIP_METRIC_DIALECT = "crap:policy_skip";
/** CRAP 阈值出厂兜底（provisional 待 A4 打包批准；配置 coverage-gate.json crap.maxCrap 覆盖）。 */
export const CRAP_PROVISIONAL_MAX_CRAP = 30;

// ============================================================
// 公式（POMaster 原生计算；域校验 fail-closed，禁静默钳位）
// ============================================================

/** CRAP 公式输入域违规（fail-closed：调用方必须显式处理，禁默认值兜底）。 */
export class CrapInputError extends Error {
  readonly field: "complexity" | "coverage";
  readonly value: number;

  constructor(field: "complexity" | "coverage", value: number, hint: string) {
    super(`crap input 域违规（${field}=${String(value)}）—— ${hint}`);
    this.name = "CrapInputError";
    this.field = field;
    this.value = value;
  }
}

/**
 * PRD §28.1 CRAP v1 公式（POMaster 原生计算——不是从第三方工具输出直接抄：
 * 第三方只供给 complexity 与 coverage 两个原始输入，公式与判卷全在本侧）。
 * complexity：非负有限数（圈复杂度计数）；coverage：[0,1] 内有限数（行覆盖率占比）。
 * 越域即抛 CrapInputError（fail-closed，禁静默钳位）。
 */
export function computeCrap(complexity: number, coverage: number): number {
  if (!Number.isFinite(complexity) || complexity < 0) {
    throw new CrapInputError(
      "complexity",
      complexity,
      "复杂度必须是非负有限数（圈复杂度计数；PRD §28.1 Complexity 输入域）",
    );
  }
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) {
    throw new CrapInputError(
      "coverage",
      coverage,
      "覆盖率必须是 [0,1] 内有限数（行覆盖率占比；PRD §28.1 Coverage 输入域）",
    );
  }
  return complexity * complexity * (1 - coverage) ** 3 + complexity;
}

// ============================================================
// 复杂度报告解析（fail-closed：词形之外一律 malformed，禁猜值）
// ============================================================

/** 复杂度报告：file → 文件内最大块复杂度（radon 词形取 max；直拍数字词形取原值）。 */
export type ComplexityReport = ReadonlyMap<string, number>;

/**
 * 解析第三方复杂度报告（宽容两种词形，其余一律 null = malformed）：
 * - radon `cc --json`：`{ "<file>": [ { "complexity": 6, ... }, ... ] }` → 文件内
 *   complexity 字段的最大值；
 * - 直拍数字：`{ "<file>": 6 }`。
 * root 非 JSON / 非平面对象 / 任一文件值词形非法（非数组非数字、数组内无数字
 * complexity、负数）→ null（交 not_run 错误态，禁默认值）。
 * 注：radon 块内若第三方额外携带 crap 字段，本解析器不消费（C5：公式在本侧重算，
 * 工具侧预计算的 CRAP 值不进判卷——生成者/判卷者分离）。
 */
export function parseComplexityReport(text: string): ComplexityReport | null {
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
  const report = new Map<string, number>();
  for (const [file, value] of Object.entries(record)) {
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) {
        return null;
      }
      report.set(normalizedFileKey(file), value);
      continue;
    }
    if (Array.isArray(value)) {
      let max: number | null = null;
      for (const block of value) {
        if (block === null || typeof block !== "object" || Array.isArray(block)) {
          return null;
        }
        const complexity = (block as Record<string, unknown>)["complexity"];
        if (typeof complexity !== "number" || !Number.isFinite(complexity) || complexity < 0) {
          return null;
        }
        max = max === null ? complexity : Math.max(max, complexity);
      }
      if (max === null) {
        // 空数组 / 数组内无一 complexity 字段 = 词形非法（文件分母必须在场，禁静默丢文件）。
        return null;
      }
      report.set(normalizedFileKey(file), max);
      continue;
    }
    return null;
  }
  return report;
}

function normalizedFileKey(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

// ============================================================
// 判卷计划字段与 normalize
// ============================================================

/** CRAP 腿计划字段（coverage-adapter prepare 组装；缺席分流形态与 CoverageLegPlan 同款）。 */
export interface CrapLegPlan extends RecordPlanFields {
  readonly projectRoot: string;
  /** 触发方式（structural 词表；coverage 腿计划同款锚）。 */
  readonly trigger: RunTriggerValue;
  readonly absenceKind:
    | "profile_not_required"
    | "config_absent"
    | "crap_not_declared"
    | null;
  readonly absentReason: string | null;
  readonly absentHint: string | null;
  /** 复杂度报告仓内相对路径（coverage-gate.json crap.complexityReport）。 */
  readonly complexityReportPath: string;
  /** 覆盖率报告仓内相对路径（与 COVERAGE gate 同源解析）。 */
  readonly coverageReportPath: string;
  /** 覆盖率报告 runner（决定解析器分派；与 COVERAGE gate 同源）。 */
  readonly coverageRunner: "c8" | "pytest-cov";
  readonly maxCrap: number;
  /** true = maxCrap 来自出厂兜底（provisional 待 A4）；false = 配置显式供给。 */
  readonly maxCrapProvisional: boolean;
  readonly tier: GateTier;
}

/** CRAP 腿 run 产物（文件读取在 run 段完成，第三方文本止步于此）。 */
export interface CrapLegOutput {
  readonly plan: CrapLegPlan;
  /** 复杂度报告文本；null = 不可读（缺输入 → not_run 非默认值）。 */
  readonly complexityText: string | null;
  /** 覆盖率报告文本；null = 不可读（缺输入 → not_run 非默认值）。 */
  readonly coverageText: string | null;
  readonly externalMs: number;
}

/** STANDARD 档超标不判罚的降级 cap 词形（呈报非静默；HARDENING-only 判罚的机器留痕）。 */
export const CRAP_DEFERRED_CAP = "crap_above_threshold_deferred_to_hardening";
/** 零连接命中（两份输入文件集合零交集 = 无可计算单元）的机器自我怀疑 cap。 */
export const ZERO_MATCHED_CAP = "zero_matched_units_nothing_verified";

function truncateMessage(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > 200 ? `${collapsed.slice(0, 200)}…` : collapsed;
}

function formatPct(value: number): string {
  return value.toFixed(2);
}

/**
 * CRAP 腿判卷核心（fail-closed 输入闸 → 连接 → 公式重算 → 档位判罚）。
 * 口径声明：counts 以「复杂度报告文件」为载体粒度（scanned=复杂度分母），
 * violations = 超阈值文件数（HARDENING）/ 0（STANDARD 呈报制），notApplicable =
 * 复杂度文件在覆盖率报告中无行口径条目的连接缺口数（显式计数非静默）；
 * 反向（覆盖率有而复杂度无）不计入 counts 轴，仅在 scopeNote 显式披露
 * （coverage_unmatched 词形——不发明新 verdict/counts 语义）。
 */
export function normalizeCrapLeg(raw: CrapLegOutput, selfMs: number): GateResultRecord {
  const plan = raw.plan;

  // —— 防御性档位闸：MINIMAL/LIGHT/FAST 档在 prepare 层 policy_skip 短路，不应到达本函数；
  // 到达即管线契约破坏（显式拒绝，禁静默按 STANDARD 判）。
  if (!GATE_TIER_VALUES.includes(plan.tier) || plan.tier === "MINIMAL" || plan.tier === "LIGHT" || plan.tier === "FAST") {
    return absenceRecord(
      plan,
      "blocked",
      `CRAP 腿收到合法缺席档位 tier=${plan.tier}——MINIMAL/LIGHT/FAST 应在 prepare 层 policy_skip 短路，到达 normalize 即管线契约破坏（blocked，禁静默）`,
      selfMs,
      raw.externalMs,
    );
  }

  // —— fail-closed 输入闸：缺任一输入 = 显式 not_run，非默认值（P23 出口判据）。
  if (raw.complexityText === null) {
    return absenceRecord(
      plan,
      "not_run",
      `复杂度输入缺席：${plan.complexityReportPath} 不可读——CRAP 公式两输入源缺一不可（PRD §28.1），禁按默认值判卷；生成指引：radon cc --json -s <src> > ${plan.complexityReportPath} 或直拍 {file: complexity} JSON（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  if (raw.coverageText === null) {
    return absenceRecord(
      plan,
      "not_run",
      `覆盖率输入缺席：${plan.coverageReportPath} 不可读——CRAP 公式两输入源缺一不可（PRD §28.1），禁按默认值判卷；先跑 COVERAGE gate（runner=${plan.coverageRunner}）产出报告后再跑 CRAP（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  const complexityReport = parseComplexityReport(raw.complexityText);
  if (complexityReport === null) {
    return absenceRecord(
      plan,
      "not_run",
      `复杂度报告词形不可解析：${plan.complexityReportPath}（支持 radon cc --json 词形 {file:[{complexity}]} 或直拍 {file:number}；词形之外一律 malformed 非默认值）；摘录：${truncateMessage(raw.complexityText.slice(0, 200)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }
  const coverageMetrics = parseCoverageReport(plan.coverageRunner, raw.coverageText);
  if (coverageMetrics === null) {
    return absenceRecord(
      plan,
      "not_run",
      `覆盖率报告词形不可解析或缺行口径（runner=${plan.coverageRunner}，报告=${plan.coverageReportPath}）——CRAP v1 Coverage 取行口径，行口径缺席即输入无效（malformed 非默认值）；摘录：${truncateMessage(raw.coverageText.slice(0, 200)) || "(空)"}（not_run，非绿非红，禁静默当通过）`,
      selfMs,
      raw.externalMs,
    );
  }

  // —— 连接（v1 粒度：文件路径归一键；缺口显式计数）。
  interface MatchedEntry {
    readonly file: string;
    readonly complexity: number;
    readonly linesPct: number;
    readonly crap: number;
  }
  const matched: MatchedEntry[] = [];
  const unmatched: string[] = [];
  for (const [file, complexity] of complexityReport) {
    const coverageEntry = coverageMetrics.files.get(file);
    if (coverageEntry === undefined || !Number.isFinite(coverageEntry.linesPct)) {
      unmatched.push(file);
      continue;
    }
    matched.push({
      file,
      complexity,
      linesPct: coverageEntry.linesPct,
      crap: computeCrap(complexity, coverageEntry.linesPct / 100),
    });
  }
  // 反向未匹配显式披露（P23 红队 MINOR）：覆盖率报告有行口径而复杂度报告无条目的
  // 文件——不入分母、不影响判卷与计数轴（notApplicable 仍专指复杂度→覆盖率方向），
  // 但单向缩分母必须在 scopeNote 留机器可读披露面（非静默；不发明新 verdict 语义）。
  const coverageOnly: string[] = [];
  for (const file of coverageMetrics.files.keys()) {
    if (!complexityReport.has(file)) {
      coverageOnly.push(file);
    }
  }

  // —— 公式重算 + 档位判罚（HARDENING-only）。
  const hardening = plan.tier === "HARDENING";
  const exceeding = matched
    .filter((entry) => entry.crap > plan.maxCrap)
    .sort((a, b) => b.crap - a.crap || a.file.localeCompare(b.file));
  const maxCrapComputed = matched.reduce((max, entry) => Math.max(max, entry.crap), 0);
  const violations = hardening ? exceeding.length : 0;

  const items: readonly GateResultItemInput[] = hardening
    ? exceeding.map((entry) => ({
        rule: "crap_above_threshold",
        location: entry.file,
        message: `CRAP=${entry.crap}（complexity=${entry.complexity}，行覆盖 ${formatPct(entry.linesPct)}%）> maxCrap=${plan.maxCrap}${plan.maxCrapProvisional ? `（阈值${PROVISIONAL_THRESHOLD_NOTE}）` : ""}；公式 CRAP = Complexity²×(1−Coverage)³+Complexity（PRD §28.1，本侧重算可对账）`,
      }))
    : [];

  const caps: string[] = [];
  if (matched.length === 0) {
    caps.push(ZERO_MATCHED_CAP);
  }
  if (!hardening && exceeding.length > 0) {
    caps.push(CRAP_DEFERRED_CAP);
  }

  let verdict: GateResult["verdict"];
  let capReason: string | null;
  if (violations > 0) {
    // failed 不被 cap 洗白（与 vitest/pytest/oasdiff/coverage 腿同一条线）。
    verdict = "failed";
    capReason = null;
  } else if (caps.length > 0) {
    verdict = "warning";
    capReason = caps.join("+");
  } else {
    verdict = "passed";
    capReason = null;
  }

  const unmatchedNote =
    unmatched.length > 0
      ? `；连接缺口 ${unmatched.length} 个（复杂度分母内文件无覆盖率行口径条目，notApplicable 显式计数：${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? "…" : ""}）`
      : "";
  const coverageOnlyNote =
    coverageOnly.length > 0
      ? `；覆盖率独有 ${coverageOnly.length} 个（coverage_unmatched：覆盖率报告有行口径而复杂度报告无条目，不入 CRAP 分母——显式披露非静默缩分母：${coverageOnly.slice(0, 5).join(", ")}${coverageOnly.length > 5 ? "…" : ""}）`
      : "";
  const deferredNote =
    !hardening && exceeding.length > 0
      ? `；HARDENING-only 生效：STANDARD 档 CRAP 阈值不判罚，超标 ${exceeding.length} 个文件降 warning 呈报（最高 CRAP=${exceeding[0]?.crap}）`
      : "";
  const scopeNote =
    `CRAP v1（PRD §28.1 公式 POMaster 原生计算，输入源=第三方复杂度/覆盖率报告）：` +
    `分母 ${complexityReport.size} 个文件，连接命中 ${matched.length}，max CRAP=${maxCrapComputed}（v1 粒度=文件，Coverage 取行口径）；` +
    `阈值 maxCrap=${plan.maxCrap}${plan.maxCrapProvisional ? `（${PROVISIONAL_THRESHOLD_NOTE}）` : "（配置显式供给）"}；` +
    `档位=${plan.tier}${deferredNote}${unmatchedNote}${coverageOnlyNote}`;

  const cappedItems = capItems(items);

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
      scanned: complexityReport.size,
      applicableScanned: matched.length,
      violations,
      notApplicable: unmatched.length,
    },
    blindspot: {
      scanned: complexityReport.size,
      produced: matched.length,
      escapeRatio:
        complexityReport.size === 0 ? 0 : unmatched.length / complexityReport.size,
    },
    trust: {
      // 公式与判卷全在本侧（生成者/判卷者分离）；无工具自报数量可采信（C5）。
      asserted: null,
      recomputed: { violations, matchesAsserted: true },
    },
    durationMs: { self: selfMs, external: raw.externalMs },
  };
  return {
    ...record,
    tool: CRAP_TOOL_ID,
    toolVersion: GAUNTLET_LITE_VERSION,
    metricDialect: CRAP_METRIC_DIALECT,
    scopeNote,
    ...(cappedItems.items.length > 0 ? { items: cappedItems.items } : {}),
    ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
  };
}

/**
 * CRAP provisional 阈值呈报项（追加到 PROVISIONAL_THRESHOLD_REGISTRATIONS 语义域；
 * 与 coverage-leg 的行/分支阈值同表呈报 A4 打包批准位——表本体住 coverage-leg.ts，
 * 此处导出 CRAP 行避免跨模块循环 import）。
 */
export const CRAP_PROVISIONAL_REGISTRATION = {
  key: "coverage-gate.json crap.maxCrap",
  value: CRAP_PROVISIONAL_MAX_CRAP,
  status: "provisional" as const,
  note: PROVISIONAL_THRESHOLD_NOTE,
} as const;
