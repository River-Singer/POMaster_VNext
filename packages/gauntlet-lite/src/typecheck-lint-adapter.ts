/**
 * typecheck-lint-adapter.ts —— TYPECHECK / LINT 门禁 adapter（W3-S2 切片：TS 族核心
 * 能力真实接入——C02 Type/Static，tsc / vue-tsc / ESLint）。
 *
 * 职责（§59 四段，沿 build-adapter.ts 先例）：
 * - detect：package.json 声明探测（typescript / vue-tsc / eslint——detectVitest 同源
 *   探测器家族 + sanitizeSemver，不自造第二套探测）；缺席 NOT_INSTALLED 必带理由
 *   与安装建议（路标纪律）。vue-tsc 未声明 = 诚实缺席（catalog S15：不自动加入）。
 * - prepare：纯数据执行计划（tsc 优先于 vue-tsc——BUILD 选择器先例），零 I/O。
 * - run：spawn 绑定/缺省命令；红线旗标守卫在 run 期机械强制——ESLint 命令含
 *   --fix / --fix-dry-run / --fix-type 拒绝（c99 表 C S2 验收点）；tsc 命令缺
 *   --noEmit（把编译转译成功当 typecheck 的向量）或含 --skipLibCheck（放宽旗标）
 *   拒绝（test-tool-catalog C02 钉住行为）。第三方文本止步于此。
 * - normalize：判卷归一（七态 + counts 显式 + asserted/recomputed 孪生）：
 *   · tsc 文本诊断逐行重算（`file(line,col): error TSxxxx: msg` 词形；--pretty false
 *     无自报汇总 → trust.asserted=null 是诚实信号）；--listFiles 文件行 = 真实扫描
 *     分母（空根 references-only tsconfig 静默 exit 0 假绿向量实测在案——零分母
 *     cap `zero_scanned_files_nothing_typechecked` 结构性封堵，禁默认 PASS）；
 *     退出码不构成判卷锚（C5）——非零退出 + 零可解析 error 诊断词形 = not_run（裸
 *     exit code 不能替代行为证据；tsc 合同非零退出必有 error 在座，--listFiles 分母
 *     在座不洗绿——TS2688 型无位置词形配置错误的假绿向量同批封堵）；
 *     warning 诊断不计罚但 scopeNote 显式披露。
 *   · ESLint JSON 官方 formatter 全量解析：逐 message 重算（severity 2=error 违规 /
 *     1=warning 披露）；词形外 severity → FATAL 拒绝静默归桶；errorCount = asserted
 *     （CLAIMED）孪生，失配 → declare_recompute_mismatch + recomputed wins（failed
 *     不被 cap 洗白）；零文件被扫 → cap `zero_scanned_files_nothing_linted`。
 *
 * 口径声明（混合口径刻意设计并在此声明，跨块混算属口径漂移）：counts.scanned /
 * applicableScanned = 程序文件/被 lint 文件数（分母侧）；counts.violations = error
 * 诊断/finding 条数（判卷侧）；blindspot 以文件为粒度（produced = 零 error 文件数）。
 * counts 口径与 build adapter（断言粒度）不同——bind 判卷时禁跨 gate 混算。
 *
 * 词形纪律：adapter_ref / gate TYPECHECK|LINT / gate_def / metric_dialect
 * （type:program_file_scan、lint:finding_count）/ capability static_analysis /
 * 报告格式（tsc-text-diagnostics、eslint-json）均为 SP 提案待 Owner 追认；
 * DetectionStatus 四态词表已锁，本模块零扩值。
 */
import { performance } from "node:perf_hooks";
import { relative, resolve } from "node:path";
import type { RunTriggerValue, VerdictValue } from "@pomaster/schemas";
import type {
  DetectionResult,
  DetectionStatus,
  DetectorFacts,
  GateAdapter,
  GatePlan,
  GatePolicy,
  GateResultRecord,
  GateResultItemInput,
  GateScope,
  NormalizeContext,
  SpawnFn,
  ToolRunOutput,
} from "./adapter-types.js";
import { GateAdapterError, asGovernedId } from "./adapter-types.js";
import { DEFAULT_RUN_TIMEOUT_MS, defaultSpawn } from "./build-adapter.js";
import { platformDetectorFacts, sanitizeSemver } from "./detectors.js";
import {
  absenceRecord,
  assertCommonGates,
  capItems,
  fail,
  toDenominatorRow,
} from "./normalize-common.js";

// ============================================================
// 口径常量（gate 名不属 vocab-lock 管辖；新增 gate 须经 gate_def 版本化登记）
// ============================================================

export const TYPECHECK_GATE_NAME = "TYPECHECK";
export const TYPECHECK_GATE_DEF = "POLICY.GATE.TYPECHECK@0.1.0";
export const LINT_GATE_NAME = "LINT";
export const LINT_GATE_DEF = "POLICY.GATE.LINT@0.1.0";
export const TSC_TOOL_ID = "gauntlet:tsc";
export const VUE_TSC_TOOL_ID = "gauntlet:vue-tsc";
export const ESLINT_TOOL_ID = "gauntlet:eslint";
/** 口径：分母 = tsc 程序文件数（--listFiles），violations = error 诊断条数。 */
export const TYPECHECK_METRIC_DIALECT = "type:program_file_scan";
/** 口径：分母 = 被 lint 文件数，violations = severity=2 finding 条数（重算）。 */
export const LINT_METRIC_DIALECT = "lint:finding_count";
export const TSC_TEXT_FORMAT = "tsc-text-diagnostics";
export const ESLINT_JSON_FORMAT = "eslint-json";
export const TYPECHECK_PARSER_REF = "builtin.gauntlet-lite.typecheck/tsc-text";
export const LINT_PARSER_REF = "builtin.gauntlet-lite.lint/eslint-json";
export const TYPECHECK_ADAPTER_REF = "builtin.gauntlet-lite.typecheck";
export const LINT_ADAPTER_REF = "builtin.gauntlet-lite.lint";
export const TSC_RUN_COMMAND =
  "corepack pnpm exec tsc --project tsconfig.json --noEmit --listFiles --pretty false";
export const ESLINT_RUN_COMMAND = "corepack pnpm exec eslint packages --format json";

// ============================================================
// 词形（tsc 文本诊断 / ESLint JSON 的解析词形——第三方文本止步于本模块）
// ============================================================

/** tsc 诊断行（--pretty false）：`file(line,col): error TS2322: message`。 */
const TSC_DIAGNOSTIC_RE = /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s(.*)$/;
/** tsc --listFiles 文件行：已知源/声明/配置后缀的路径行（分隔符归一后判定）。 */
const TSC_FILE_RE = /\.(?:d\.ts|ts|tsx|mts|cts|jsx|js|mjs|cjs|json|vue)$/i;
/** 红线词形：ESLint 自动修复旗标（c99 表 C S2 验收点「ESLint --fix 拒绝」）。 */
const ESLINT_FIX_RE = /(?:^|\s)--fix(?:-dry-run|-type)?(?:\s|$)/;
/** 红线词形：tsc 放宽旗标（--skipLibCheck 之类）与 typecheck 义务旗标缺席。 */
const TSC_SKIP_LIB_CHECK_RE = /(?:^|\s)--skipLibCheck(?:\s|$)/;
const TSC_NO_EMIT_RE = /(?:^|\s)--noEmit(?:\s|$)/;

interface TscDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
}

/** 位置留痕：仓内相对路径:line:col（provenance 可移植——禁绝对盘符；越根退回原文）。 */
function relativizeLocation(base: string, rawPath: string): string {
  const abs = resolve(base, rawPath);
  let rel = relative(base, abs);
  if (rel.length === 0 || rel.startsWith("..")) {
    rel = rawPath;
  }
  return rel.replaceAll("\\", "/");
}

/** tsc 输出逐行扫描：诊断行 vs --listFiles 文件行（stdout 文件分母 + stdout/stderr 诊断）。 */
function scanTscOutput(stdout: string, stderr: string): {
  readonly files: readonly string[];
  readonly diagnostics: readonly TscDiagnostic[];
} {
  const files = new Set<string>();
  const diagnostics: TscDiagnostic[] = [];
  const consume = (text: string, collectFiles: boolean): void => {
    for (const line of text.split(/\r?\n/)) {
      const diag = TSC_DIAGNOSTIC_RE.exec(line);
      if (diag !== null) {
        diagnostics.push({
          file: diag[1] ?? "",
          line: Number(diag[2]),
          column: Number(diag[3]),
          severity: diag[4] === "error" ? "error" : "warning",
          code: diag[5] ?? "",
          message: diag[6] ?? "",
        });
        continue;
      }
      if (!collectFiles) {
        continue;
      }
      const normalized = line.trim().replaceAll("\\", "/");
      if (normalized.length > 0 && TSC_FILE_RE.test(normalized)) {
        files.add(normalized);
      }
    }
  };
  consume(stdout, true);
  if (diagnostics.length === 0) {
    // stderr 只做诊断源（--listFiles 分母只信 stdout——防杂音虚增分母）。
    consume(stderr, false);
  }
  return { files: [...files], diagnostics };
}

/** 红线旗标守卫·lint 腿（run 期机械强制——binding 覆写发生在 prepare 之后，守卫必须住 run）。 */
function assertLintCommandGuard(command: string): void {
  if (ESLINT_FIX_RE.test(command)) {
    throw new GateAdapterError(
      "runner_not_ready",
      `lint 命令含自动修复旗标（--fix 词形）：${command}——c99 表 C S2 验收点红线「ESLint --fix 拒绝」（lint 是检视 gate，禁改写工作区）`,
      "从 binding.execution.command 移除 --fix/--fix-dry-run/--fix-type 后重跑；修复义务归实现代理，不归判卷 gate",
    );
  }
}

/** 红线旗标守卫·typecheck 腿（缺 --noEmit = 编译转译冒充 typecheck；--skipLibCheck = 分母缩水）。 */
function assertTypecheckCommandGuard(command: string): void {
  if (TSC_SKIP_LIB_CHECK_RE.test(command)) {
    throw new GateAdapterError(
      "runner_not_ready",
      `typecheck 命令含放宽旗标（--skipLibCheck）：${command}——catalog C02 红线（放宽旗标 = 判卷分母缩水）`,
      "从 binding.execution.command 移除 --skipLibCheck 等放宽旗标后重跑；skipLibCheck 若为项目 tsconfig 自身配置由项目自行承担，adapter 不代加",
    );
  }
  if (!TSC_NO_EMIT_RE.test(command)) {
    throw new GateAdapterError(
      "runner_not_ready",
      `typecheck 命令缺 --noEmit：${command}——不把编译转译成功当 typecheck（catalog C02 钉住行为）`,
      "binding.execution.command 必须携带 --noEmit（emit 产物是 build 不是 typecheck）",
    );
  }
}

// ============================================================
// detect：package.json 声明族探测（detectVitest 同源先例——不自造第二套探测）
// ============================================================

function detectDeclaredTool(
  facts: DetectorFacts,
  packageName: string,
  toolId: string,
  installHint: string,
): DetectionResult {
  const pkgPath = facts.joinPath(facts.projectRoot, "package.json");
  const raw = facts.readTextFile(pkgPath);
  if (raw === null) {
    return {
      status: "NOT_INSTALLED",
      tool: toolId,
      reason: "package.json 不存在（无法探测依赖声明）",
      installHint,
    };
  }
  let pkg: unknown;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return {
      status: "NOT_INSTALLED",
      tool: toolId,
      reason: "package.json 不可解析（JSON 语法错误）——按缺席处理并显式留痕，禁静默",
      installHint: "修复 package.json 语法后重跑 pomaster doctor",
    };
  }
  const deps =
    pkg !== null && typeof pkg === "object" ? (pkg as Record<string, unknown>) : {};
  for (const section of ["devDependencies", "dependencies"] as const) {
    const bucket = deps[section];
    if (bucket === null || typeof bucket !== "object") {
      continue;
    }
    const declared = (bucket as Record<string, unknown>)[packageName];
    if (typeof declared !== "string") {
      continue;
    }
    return {
      status: "READY",
      tool: toolId,
      detectedVersion: sanitizeSemver(declared),
      evidence: `package.json ${section}.${packageName} = ${declared}`,
    };
  }
  return {
    status: "NOT_INSTALLED",
    tool: toolId,
    reason: `package.json 未声明 ${packageName}（devDependencies/dependencies 均无）`,
    installHint,
  };
}

/** TYPECHECK 复合探测形态（双工具各持四态，无信息丢失——BuildToolDetection 同款）。 */
export interface StaticTypecheckDetection {
  readonly status: DetectionStatus;
  readonly tsc: DetectionResult;
  readonly vueTsc: DetectionResult;
}

const TSC_INSTALL_HINT =
  "安装建议：corepack pnpm add -D typescript（TYPECHECK 门禁 tsc 腿；命令模板 corepack pnpm exec tsc --project <tsconfig> --noEmit --listFiles --pretty false）";
const VUE_TSC_INSTALL_HINT =
  "安装建议：corepack pnpm add -D vue-tsc（TYPECHECK 门禁 vue-tsc 腿——Vue SFC 类型检查按 catalog S15 不自动加入，声明后即入探测）";
const ESLINT_INSTALL_HINT =
  "安装建议：corepack pnpm add -D eslint（LINT 门禁；命令模板 corepack pnpm exec eslint <paths> --format json，禁 --fix）";

// ============================================================
// 判卷核心：共享七态装配（violations 由调用方逐条重算供给——C5）
// ============================================================

interface StaticJudgmentInput {
  readonly plan: GatePlan;
  readonly violations: number;
  readonly warnings: number;
  readonly scanned: number;
  readonly errorFileCount: number;
  readonly assertedViolations: number | null;
  readonly assertedActorNote: string;
  readonly caliberNote: string;
  readonly zeroDenominatorCap: string;
}

function judgeStaticRun(input: StaticJudgmentInput): GateResultRecord {
  const { plan } = input;
  const caps: string[] = [];
  const mismatchDetected =
    input.assertedViolations !== null && input.assertedViolations !== input.violations;
  if (mismatchDetected) {
    caps.push("declare_recompute_mismatch");
  }
  if (input.scanned === 0) {
    caps.push(input.zeroDenominatorCap);
  }
  if (
    plan.expectedToolVersion !== null &&
    plan.toolVersion !== plan.expectedToolVersion
  ) {
    caps.push("tool_version_drifted");
  }

  // 判卷：violations>0 → failed（caps 不洗白 failed）；零违规但零分母/失配/漂移 →
  // passed 降 warning（报绿的机器自我怀疑机械化——build adapter 先例）。
  const baseVerdict: VerdictValue = input.violations > 0 ? "failed" : "passed";
  const capped = baseVerdict === "passed" && caps.length > 0;

  const produced =
    input.errorFileCount === 0
      ? input.scanned
      : Math.max(0, input.scanned - input.errorFileCount);
  const notes = [
    input.caliberNote,
    input.assertedActorNote,
    ...(input.warnings > 0 ? [`warning finding/诊断 ${input.warnings} 条不计罚（显式披露，禁沉默归零）`] : []),
  ];

  const record: Omit<GateResultRecord, "tool" | "toolVersion" | "metricDialect"> = {
    grn: plan.grn,
    gate: plan.gate,
    gateDef: plan.gateDef,
    ranAtSeq: plan.ranAtSeq,
    verdict: capped ? "warning" : baseVerdict,
    verdictCapReason: capped ? caps.join("+") : null,
    subjectId: plan.subjectId === null ? null : asGovernedId(plan.subjectId),
    isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
    denominatorRefs: plan.denominatorRefs.map((ref) => toDenominatorRow(ref)),
    counts: {
      scanned: input.scanned,
      applicableScanned: input.scanned,
      violations: input.violations,
      notApplicable: 0,
    },
    blindspot: {
      scanned: input.scanned,
      produced,
      escapeRatio: input.scanned === 0 ? 0 : (input.scanned - produced) / input.scanned,
    },
    trust: {
      asserted:
        input.assertedViolations === null
          ? null
          : {
              value: { violations: input.assertedViolations },
              claimedBy: {
                actorType: "tool" as const,
                actor: `${plan.tool}@${plan.toolVersion}`,
                selfAttested: true,
              },
            },
      recomputed: { violations: input.violations, matchesAsserted: !mismatchDetected },
      ...(mismatchDetected
        ? { mismatch: { detected: true, action: "recomputed_wins_recorded" as const } }
        : {}),
    },
    durationMs: { self: 0, external: 0 },
    scopeNote: notes.join("；"),
  };
  return { ...record, tool: plan.tool, toolVersion: plan.toolVersion, metricDialect: plan.metricDialect };
}

// ============================================================
// TYPECHECK adapter（tsc / vue-tsc）
// ============================================================

export function createTypecheckAdapter(): GateAdapter<
  StaticTypecheckDetection,
  GatePlan,
  ToolRunOutput
> {
  return {
    adapterId: "gauntlet-lite:typecheck",

    detect(facts: DetectorFacts): StaticTypecheckDetection {
      const tsc = detectDeclaredTool(facts, "typescript", TSC_TOOL_ID, TSC_INSTALL_HINT);
      const vueTsc = detectDeclaredTool(facts, "vue-tsc", VUE_TSC_TOOL_ID, VUE_TSC_INSTALL_HINT);
      const status: DetectionStatus =
        tsc.status === "READY" || vueTsc.status === "READY" ? "READY" : "NOT_INSTALLED";
      return { status, tsc, vueTsc };
    },

    prepare(scope: GateScope, policy: GatePolicy, facts?: DetectorFacts): GatePlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const detection = this.detect(resolved);
      const leg = detection.tsc.status === "READY" ? detection.tsc : detection.vueTsc;
      if (leg.status !== "READY") {
        throw new GateAdapterError(
          "runner_not_ready",
          `tsc 与 vue-tsc 双腿均不可执行（tsc：${detection.tsc.status === "NOT_INSTALLED" ? detection.tsc.reason : detection.tsc.status}；vue-tsc：${detection.vueTsc.status === "NOT_INSTALLED" ? detection.vueTsc.reason : detection.vueTsc.status}）`,
          detection.tsc.status === "NOT_INSTALLED"
            ? detection.tsc.installHint
            : "消除版本漂移或调整 profile 后重跑 pomaster doctor",
        );
      }
      if (leg.detectedVersion === null) {
        throw new GateAdapterError(
          "runner_not_ready",
          `${leg.tool} 已声明但版本词形不可解析（无法钉死 tool_version 口径）`,
          "在 package.json 使用语义化版本区间（如 ^5.7.3），保证 03-gate-result 的 tool_version 可判卷",
        );
      }
      const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
      return {
        tool: leg.tool,
        toolVersion: leg.detectedVersion,
        gate: TYPECHECK_GATE_NAME,
        gateDef: TYPECHECK_GATE_DEF,
        metricDialect: TYPECHECK_METRIC_DIALECT,
        runner: "tsc",
        command: TSC_RUN_COMMAND,
        cwd: scope.projectRoot,
        timeoutMs: policy.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
        grn: policy.grn,
        ranAtSeq: policy.ranAtSeq,
        trigger,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        expectedToolVersion: policy.expectedToolVersion ?? null,
      };
    },

    run(plan: GatePlan, spawnFn: SpawnFn = defaultSpawn): ToolRunOutput {
      if (plan.runner !== "tsc") {
        throw new GateAdapterError(
          "runner_not_implemented",
          `runner=${String(plan.runner)} 不是 typecheck adapter 的执行路径`,
          "GatePlan.runner 词形为 vitest | pytest | tsc | eslint（adapter-types.ts）；越形即契约破坏",
        );
      }
      assertTypecheckCommandGuard(plan.command);
      const outcome = spawnFn(plan.command, { cwd: plan.cwd, timeoutMs: plan.timeoutMs });
      const spawnFailed = outcome.error !== null || outcome.status === null;
      return {
        plan,
        kind: spawnFailed ? "spawn_failed" : "executed",
        exitCode: outcome.status,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        externalMs: outcome.externalMs,
        failureReason: spawnFailed
          ? `typecheck 子进程执行失败（status=${String(outcome.status)}, error=${outcome.error ?? "unknown"}）`
          : null,
      };
    },

    normalize(raw: ToolRunOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;
      assertCommonGates(plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (raw.kind === "spawn_failed") {
        return absenceRecord(
          plan,
          "not_run",
          `${raw.failureReason ?? "typecheck 子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
          selfMs,
          raw.externalMs,
        );
      }
      const { files, diagnostics } = scanTscOutput(raw.stdout, raw.stderr);
      const errors = diagnostics.filter((d) => d.severity === "error");
      const warnings = diagnostics.length - errors.length;
      // 非零退出 + 零可解析 error 诊断词形 → not_run（tsc 合同：非零退出必有 error
      // 在座——解析不出即词形漂移/工具损坏/TS2688 型无位置词形配置错误，判卷不可能；
      // --listFiles 分母在座不洗绿：落 passed 即假绿。退出码不构成判卷锚（C5），
      // 只作绿疑锚——downgrade 终局是 not_run 非绿非红，禁以 exit code 定罪亦禁洗绿）。
      if (errors.length === 0 && (raw.exitCode ?? 0) !== 0) {
        return absenceRecord(
          plan,
          "not_run",
          `typecheck 输出不可判卷：exit=${String(raw.exitCode)} 但零可解析 error 诊断词形（tsc 合同非零退出必有 error 在座——词形漂移/工具损坏/无位置词形配置错误如 TS2688；--listFiles 分母 ${files.length} 文件在座不洗绿）——退出码不构成判卷锚（C5），not_run 是终局性诚实报告（非绿非红，禁静默当通过）`,
          selfMs,
          raw.externalMs,
        );
      }
      const items = capItems<GateResultItemInput>(
        errors.map((d) => ({
          rule: d.code,
          location: `${relativizeLocation(plan.cwd, d.file)}:${d.line}:${d.column}`,
          message: d.message,
        })),
      );
      const record = judgeStaticRun({
        plan,
        violations: errors.length,
        warnings,
        scanned: files.length,
        errorFileCount: new Set(errors.map((d) => d.file.replaceAll("\\", "/"))).size,
        assertedViolations: null,
        assertedActorNote:
          "tsc --pretty false 无自报汇总（trust.asserted=null），counts 由 stdout 文本诊断逐条重算",
        caliberNote:
          "typecheck 口径：counts.scanned/applicableScanned=程序文件数（--listFiles），violations=error 诊断条数（混合口径刻意声明——零诊断≠零分母）",
        zeroDenominatorCap: "zero_scanned_files_nothing_typechecked",
      });
      const withDuration: GateResultRecord = {
        ...record,
        durationMs: { self: selfMs, external: raw.externalMs },
      };
      return items.items.length > 0
        ? { ...withDuration, items: items.items, ...(items.itemsTruncated ? { itemsTruncated: true } : {}) }
        : withDuration;
    },
  };
}

// ============================================================
// LINT adapter（ESLint）
// ============================================================

interface LooseEslintMessage {
  readonly severity: unknown;
  readonly ruleId: unknown;
  readonly line: unknown;
  readonly column: unknown;
  readonly message: unknown;
}

/** 宽表记录 → message 词形（缺键按 undefined 处理，severity 闸门随后拒收词形外值）。 */
function LooseMsg(raw: Record<string, unknown>): LooseEslintMessage {
  return {
    severity: raw["severity"],
    ruleId: raw["ruleId"],
    line: raw["line"],
    column: raw["column"],
    message: raw["message"],
  };
}

export function createLintAdapter(): GateAdapter<DetectionResult, GatePlan, ToolRunOutput> {
  return {
    adapterId: "gauntlet-lite:lint",

    detect(facts: DetectorFacts): DetectionResult {
      return detectDeclaredTool(facts, "eslint", ESLINT_TOOL_ID, ESLINT_INSTALL_HINT);
    },

    prepare(scope: GateScope, policy: GatePolicy, facts?: DetectorFacts): GatePlan {
      const resolved = facts ?? platformDetectorFacts(scope.projectRoot);
      const detection = this.detect(resolved);
      if (detection.status !== "READY" || detection.detectedVersion === null) {
        throw new GateAdapterError(
          "runner_not_ready",
          detection.status === "NOT_INSTALLED"
            ? `eslint 不可执行：${detection.reason}`
            : `eslint 已声明但版本词形不可解析（无法钉死 tool_version 口径）`,
          detection.status === "NOT_INSTALLED"
            ? detection.installHint
            : "在 package.json 使用语义化版本区间（如 ^9.18.0）",
        );
      }
      const trigger: RunTriggerValue = policy.trigger ?? "on_demand";
      return {
        tool: ESLINT_TOOL_ID,
        toolVersion: detection.detectedVersion,
        gate: LINT_GATE_NAME,
        gateDef: LINT_GATE_DEF,
        metricDialect: LINT_METRIC_DIALECT,
        runner: "eslint",
        command: ESLINT_RUN_COMMAND,
        cwd: scope.projectRoot,
        timeoutMs: policy.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
        grn: policy.grn,
        ranAtSeq: policy.ranAtSeq,
        trigger,
        subjectId: scope.subjectId ?? null,
        denominatorRefs: scope.denominatorRefs ?? [],
        expectedToolVersion: policy.expectedToolVersion ?? null,
      };
    },

    run(plan: GatePlan, spawnFn: SpawnFn = defaultSpawn): ToolRunOutput {
      if (plan.runner !== "eslint") {
        throw new GateAdapterError(
          "runner_not_implemented",
          `runner=${String(plan.runner)} 不是 lint adapter 的执行路径`,
          "GatePlan.runner 词形为 vitest | pytest | tsc | eslint（adapter-types.ts）；越形即契约破坏",
        );
      }
      assertLintCommandGuard(plan.command);
      const outcome = spawnFn(plan.command, { cwd: plan.cwd, timeoutMs: plan.timeoutMs });
      const spawnFailed = outcome.error !== null || outcome.status === null;
      return {
        plan,
        kind: spawnFailed ? "spawn_failed" : "executed",
        exitCode: outcome.status,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        externalMs: outcome.externalMs,
        failureReason: spawnFailed
          ? `lint 子进程执行失败（status=${String(outcome.status)}, error=${outcome.error ?? "unknown"}）`
          : null,
      };
    },

    normalize(raw: ToolRunOutput, context: NormalizeContext): GateResultRecord {
      const startedAt = performance.now();
      const plan = raw.plan;
      assertCommonGates(plan, context);
      const selfMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (raw.kind === "spawn_failed") {
        return absenceRecord(
          plan,
          "not_run",
          `${raw.failureReason ?? "lint 子进程不可执行"}（not_run，非绿非红，禁静默当通过）`,
          selfMs,
          raw.externalMs,
        );
      }
      const notRunNote = (detail: string): string =>
        `lint 输出不可判卷：${detail}——判卷不可能，not_run 是终局性诚实报告（非绿非红，禁静默当通过；裸 exit code 不能替代行为证据）`;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.stdout);
      } catch {
        return absenceRecord(
          plan,
          "not_run",
          notRunNote("stdout 非合法 JSON（配置错误/崩溃/词形漂移——ESLint JSON formatter 报告是唯一判卷锚）"),
          selfMs,
          raw.externalMs,
        );
      }
      if (!Array.isArray(parsed)) {
        return absenceRecord(
          plan,
          "not_run",
          notRunNote("stdout JSON 根形态不符（数组缺席——词形漂移或工具损坏）"),
          selfMs,
          raw.externalMs,
        );
      }

      let violations = 0;
      let warnings = 0;
      let assertedTotal: number | null = 0;
      const errorFiles = new Set<string>();
      const items: GateResultItemInput[] = [];
      for (const entry of parsed as unknown[]) {
        const file =
          entry !== null && typeof entry === "object"
            ? (entry as Record<string, unknown>)["filePath"]
            : undefined;
        const messages =
          entry !== null && typeof entry === "object" &&
          Array.isArray((entry as Record<string, unknown>)["messages"])
            ? ((entry as Record<string, unknown>)["messages"] as unknown[])
            : null;
        if (typeof file !== "string" || messages === null) {
          return absenceRecord(
            plan,
            "not_run",
            notRunNote("results 条目形态漂移（filePath/messages 词形不符——拒绝静默归桶）"),
            selfMs,
            raw.externalMs,
          );
        }
        const errorCount = (entry as Record<string, unknown>)["errorCount"];
        if (typeof errorCount === "number" && Number.isInteger(errorCount) && errorCount >= 0) {
          assertedTotal = (assertedTotal ?? 0) + errorCount;
        } else {
          assertedTotal = null;
        }
        for (const loose of messages) {
          const msg = LooseMsg(
            loose !== null && typeof loose === "object"
              ? (loose as Record<string, unknown>)
              : {},
          );
          if (msg.severity !== 1 && msg.severity !== 2) {
            fail(
              "unknown_assertion_status",
              `ESLint severity 词形异常：${String(msg.severity)}（1=warning / 2=error 之外拒收）`,
              "拒绝静默归桶（C1）；核对工具版本与 metric_dialect 口径是否漂移",
            );
          }
          if (msg.severity === 2) {
            violations++;
            errorFiles.add(file.replaceAll("\\", "/"));
            items.push({
              rule:
                typeof msg.ruleId === "string" && msg.ruleId.length > 0
                  ? msg.ruleId
                  : "eslint.parsing_error",
              location: `${relativizeLocation(plan.cwd, file)}:${String(msg.line ?? 0)}:${String(msg.column ?? 0)}`,
              message: typeof msg.message === "string" ? msg.message : undefined,
            });
          } else {
            warnings++;
          }
        }
      }

      const cappedItems = capItems<GateResultItemInput>(items);
      const record = judgeStaticRun({
        plan,
        violations,
        warnings,
        scanned: (parsed as unknown[]).length,
        errorFileCount: errorFiles.size,
        assertedViolations: assertedTotal,
        assertedActorNote:
          "asserted=Σ errorCount（ESLint 自报孪生，CLAIMED）；violations 由 messages 逐条重算",
        caliberNote:
          "lint 口径：counts.scanned/applicableScanned=被 lint 文件数（报告条目数），violations=severity=2 finding 条数（逐条重算）",
        zeroDenominatorCap: "zero_scanned_files_nothing_linted",
      });
      const withDuration: GateResultRecord = {
        ...record,
        durationMs: { self: selfMs, external: raw.externalMs },
      };
      return cappedItems.items.length > 0
        ? {
            ...withDuration,
            items: cappedItems.items,
            ...(cappedItems.itemsTruncated ? { itemsTruncated: true } : {}),
          }
        : withDuration;
    },
  };
}
