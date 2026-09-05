/**
 * portability.ts —— `pomaster portability bootstrap / check`：Portability Kernel
 * 命令面（P32 · PRD §85.2 MEMORY_PORTABILITY_GATE 三命令词形之二 + §85.3 Manifest
 * + §85.4 bootstrap 步 + §84.6 Hidden Memory Drift 呈现）。
 *
 * 词形接线（PRD 逐字）：
 * - `portability bootstrap`：在 --dir 重建 runtime 面（§85.4 的 bootstrap 步；§84.4
 *   新机器序列 git clone → portability bootstrap → doctor → portability check 的
 *   机器面）+ 确保 Portability Manifest 在座（缺失才写 canonical §85.3 形态；
 *   在座非 canonical → PORTABILITY_MANIFEST_DRIFT exit 1 显式，**不覆盖**声明）。
 *   幂等（缺失才写）：重复执行 NO_CHANGE exit 0（No-op is elegant）。
 * - `portability check`：§85.2 八项检查（PASS/FAIL/NOT_RUN 显式三态，缺项=FAIL 或
 *   NOT_RUN 绝不静默绿）+ manifest 对账 + forbidden_dependencies 命中检测；
 *   --json 信封 result = 完整 PortabilityReport；人读摘要逐行呈现；
 *   **非全 PASS exit 1 fail-closed**（§85.2 各项 PASS 是唯一 ok 形态）。
 *
 * 分层纪律：判卷权威在 @pomaster/kernel（portabilityCheck/portabilityBootstrap），
 * 本包只做编排与呈现；check 纯读零写入（kernel 端只读探测）。
 * 词表纪律：PASS 是 §85.2 逐字；FAIL/NOT_RUN/PORTABILITY_CHECK_FAILED/
 * PORTABILITY_MANIFEST_DRIFT 码位已随 PR-0009 入锁（vocab-lock presentation_axes.cli_presentation_codes）。
 */
import {
  GovernanceError,
  PORTABILITY_CHECK_LABELS,
  type PortabilityBootstrapResult,
  type PortabilityReport,
  portabilityBootstrap,
  portabilityCheck,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError } from "./permit.js";

/** check 失败码位（vocab-lock presentation_axes.cli_presentation_codes——PR-0009；fail-closed exit 1 载体）。 */
export const PORTABILITY_CHECK_FAILED = "PORTABILITY_CHECK_FAILED";
/** manifest 声明漂移码位（在座非 canonical；bootstrap 不覆盖显式拒绝）。 */
export const PORTABILITY_MANIFEST_DRIFT = "PORTABILITY_MANIFEST_DRIFT";

// ============================================================
// portability bootstrap
// ============================================================

export interface PortabilityBootstrapCliResult {
  readonly action: "bootstrap";
  readonly root_dir: string;
  readonly runtime_entries: readonly string[];
  readonly manifest_written: boolean;
  readonly manifest_drift: readonly string[];
}

function bootstrapHuman(result: PortabilityBootstrapResult): readonly string[] {
  const entries = result.runtimeEntries.length > 0
    ? result.runtimeEntries.join(", ")
    : "（无缺件——幂等 NO_CHANGE）";
  const manifestLine = result.manifestWritten
    ? `manifest 已写入（canonical §85.3 形态 → .pomaster/portability-manifest.json）`
    : result.manifestDrift.length > 0
      ? `manifest 在座但与 §85.3 不符（${result.manifestDrift.length} findings）——未覆盖，显式报告`
      : `manifest 在座且 canonical（NO_CHANGE）`;
  return [
    `portability bootstrap → ${result.rootDir}（§85.4 bootstrap 步：只重建 runtime 面；零治理事实零 journal 事件——重建非变更，A4）`,
    `  runtime 补件: ${entries}`,
    `  manifest: ${manifestLine}`,
    `  下一步: pomaster doctor → pomaster portability check（§85.2 三命令序列）`,
  ];
}

/**
 * `pomaster portability bootstrap`：ok 语义 = bootstrap 成功且 manifest 无 drift
 * （新写 / 已 canonical）。manifest drift / store 未初始化 → exit 1 fail-closed。
 */
export async function runPortabilityBootstrap(
  rootDir: string,
): Promise<CommandOutcome<PortabilityBootstrapCliResult | null>> {
  let result: PortabilityBootstrapResult;
  try {
    result = portabilityBootstrap(rootDir);
  } catch (err) {
    const error: CliError =
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "bootstrap 失败；契约见 docs/kernel-api.md §20（Portability Kernel）。",
          };
    return failOutcome<null>(
      "portability bootstrap",
      null,
      [error],
      [`portability bootstrap: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
  if (result.manifestDrift.length > 0) {
    return failOutcome<PortabilityBootstrapCliResult>(
      "portability bootstrap",
      {
        action: "bootstrap",
        root_dir: result.rootDir,
        runtime_entries: result.runtimeEntries,
        manifest_written: result.manifestWritten,
        manifest_drift: result.manifestDrift,
      },
      [
        {
          code: PORTABILITY_MANIFEST_DRIFT,
          message: `portability-manifest.json 在座但与 §85.3 不符（${result.manifestDrift.length} findings: ${result.manifestDrift[0] ?? ""}${result.manifestDrift.length > 1 ? " …" : ""}）`,
          hint: "manifest 是 §85.3 声明文件：恢复 git 版本，或删除后重跑 pomaster portability bootstrap 生成 canonical 形态（bootstrap 不静默覆盖既有声明）。",
        },
      ],
      bootstrapHuman(result),
    );
  }
  return okOutcome(
    "portability bootstrap",
    {
      action: "bootstrap",
      root_dir: result.rootDir,
      runtime_entries: result.runtimeEntries,
      manifest_written: result.manifestWritten,
      manifest_drift: [],
    },
    bootstrapHuman(result),
  );
}

// ============================================================
// portability check
// ============================================================

export interface PortabilityCheckCliResult {
  readonly action: "check";
  readonly ok: boolean;
  readonly report: PortabilityReport;
}

/** 人读摘要（§85.2 逐字标签逐行呈现；分母恒呈现——八行一行不少）。 */
export function portabilityCheckHuman(report: PortabilityReport): readonly string[] {
  const labelWidth = Math.max(
    ...PORTABILITY_CHECK_LABELS.map(([, label]) => label.length),
  );
  const lines = [
    `portability check → ${report.rootDir}（§85.2 MEMORY_PORTABILITY_GATE 八项 + §85.3 manifest 对账；${report.ok ? "全 PASS" : "非全 PASS——fail-closed"}）`,
    ...report.checks.map(
      (row) =>
        `  ${row.status.padEnd(7)} ${row.label.padEnd(labelWidth)} — ${row.detail}${row.findings.length > 0 ? ` [${row.findings.join(", ")}]` : ""}`,
    ),
    `  manifest: ${report.manifestReconciliation.present ? (report.manifestReconciliation.canonical ? "canonical §85.3" : `非 canonical（${report.manifestReconciliation.findings.length} findings）`) : "缺席（PORTABILITY_MANIFEST_MISSING）"}`,
  ];
  if (report.manifestReconciliation.findings.length > 0) {
    for (const finding of report.manifestReconciliation.findings) {
      lines.push(`    manifest finding: ${finding}`);
    }
  }
  if (report.forbiddenDependencyHits.length > 0) {
    for (const hit of report.forbiddenDependencyHits) {
      lines.push(`    forbidden_dependency hit: ${hit.dependency} — ${hit.evidence}`);
    }
  }
  lines.push(
    `  §84.6: MEMORY_DRIFT 为判定词形——禁自动写入 Canonical State，必须 classification/review（P33 harvest 通道）。`,
  );
  return lines;
}

/**
 * `pomaster portability check`：八项检查 + manifest 对账（§85.2 三命令之三）。
 * ok = 全部检查 PASS 且 manifest canonical 且禁依赖零命中；否则 exit 1 fail-closed。
 * 纯读零写入（kernel 端只读探测；未 init 目录可跑并如实 FAIL/NOT_RUN）。
 */
export async function runPortabilityCheck(
  rootDir: string,
): Promise<CommandOutcome<PortabilityCheckCliResult | null>> {
  let report: PortabilityReport;
  try {
    report = portabilityCheck(rootDir);
  } catch (err) {
    const error: CliError =
      err instanceof GovernanceError
        ? governanceErrorToCliError(err)
        : {
            code: "KERNEL_ERROR",
            message: err instanceof Error ? err.message : String(err),
            hint: "check 执行异常；环境异常禁静默（D 线风险备忘）。",
          };
    return failOutcome<null>(
      "portability check",
      null,
      [error],
      [`portability check: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
  const human = portabilityCheckHuman(report);
  if (!report.ok) {
    const failed = report.checks.filter((entry) => entry.status !== "PASS");
    return failOutcome<PortabilityCheckCliResult>(
      "portability check",
      { action: "check", ok: false, report },
      [
        {
          code: PORTABILITY_CHECK_FAILED,
          message: `非全 PASS（${failed.length} 项未过：${failed
            .map((entry) => `${entry.check}=${entry.status}`)
            .join(", ")}；manifest findings=${report.manifestReconciliation.findings.length}；forbidden hits=${report.forbiddenDependencyHits.length}）`,
          hint: "§85.2 八项各 PASS 是唯一 ok 形态；FAIL=应存在而缺席/损坏（先跑 pomaster portability bootstrap 或补齐对应平面）、NOT_RUN=环境性缺席（先消除上游缺失）；MEMORY_DRIFT 走 classification/review（禁自动写入 Canonical State）。",
        },
      ],
      human,
    );
  }
  return okOutcome(
    "portability check",
    { action: "check", ok: true, report },
    human,
  );
}
