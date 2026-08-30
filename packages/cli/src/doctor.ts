/**
 * doctor.ts —— `pomaster doctor`：环境/内核/工具链/MCP 探测矩阵（D7 Portability +
 * D22 一键引导 + P22 工具链执行腿探测）。
 *
 * 四态矩阵（探测层缺席显式，禁静默跳过当通过；词表外局部词 → TODO(vocab-pr)）：
 * - READY               —— 探测项可用且通过；
 * - NOT_INSTALLED       —— 依赖模块/工具未落地（kernel scaffold not-implemented；
 *                          oasdiff / import-linter / dependency-cruiser 缺席——P22 起
 *                          CONTRACT/ARCHITECTURE 机判腿的执行前提，缺席必带安装路标）；
 * - MISSING_CONFIGURATION —— 依赖存在但项目未配置（如 chrome-devtools MCP 未进 .mcp.json）；
 * - DEFECT              —— 配置/内容/环境异常（解析失败、探针报 defect、版本漂移 DRIFTED）。
 *
 * fail-closed：ok = 全部 READY；任一非 READY → ok=false。doctor 只读，永不修改 store。
 * D 线风险备忘：环境异常（文件不可读等）必须报 DEFECT，禁静默。
 * P22 探测转调 @pomaster/gauntlet-lite 的 toolDetectors（单一探测面——doctor 呈现与
 * adapter 执行腿用同一 detect，禁两套探测口径漂移）；P23 起矩阵扩容 c8 / pytest_cov
 * （COVERAGE 门禁双腿工具，D17：pytest-cov 先行 / JaCoCo Java 第二波 deferred）；P24 起
 * 扩容 mutmut / stryker（MUTATION 门禁双腿工具，B2-3 StrykerJS / B2-4 mutmut——
 * mutmut 能力落差如实标注，PIT/Java 第二波 deferred）；P25 起扩容 gitleaks / pip_audit /
 * semgrep（SECURITY 门禁三腿工具，B2-5「三个独立 adapter，禁止合并为单一
 * "security ok" 绿灯」——三探针独立呈现，任一缺席各带各的安装路标，不聚合）；P26 起
 * 扩容 playwright（BROWSER 门禁确定性腿工具，B3-1「evidence 必含 console error /
 * network 维度」/ D22①——与 chrome_devtools_mcp 交互腿探针并存，双通道各自显式呈现）。
 */

import { readFile } from "node:fs/promises";
import type { DoctorReport, Store } from "@pomaster/kernel";
import type { DetectionResult, DetectorFacts } from "@pomaster/gauntlet-lite";
import { TRUTH_INDEX_RELATIVE, toPosix, truthIndexPath } from "./store-layout.js";
import type { CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

/** 探测四态（x-vocab-source: D7/D22 语义；词表外局部词 → TODO(vocab-pr)）。 */
export const DOCTOR_PROBE_STATUSES = [
  "READY",
  "NOT_INSTALLED",
  "MISSING_CONFIGURATION",
  "DEFECT",
] as const;
export type DoctorProbeStatus = (typeof DOCTOR_PROBE_STATUSES)[number];

export interface DoctorProbe {
  readonly probe: string;
  readonly status: DoctorProbeStatus;
  readonly detail: string;
  /** 报错不说去哪修的报错是缺陷（escalation 纪律）：非 READY 必带 hint。 */
  readonly hint: string | null;
}

export interface DoctorResult {
  readonly ok: boolean;
  readonly probes: readonly DoctorProbe[];
}

/** CLI 所需的 kernel doctor 最小面。 */
export interface DoctorKernelDeps {
  createStore: (rootDir: string) => Promise<Store>;
  doctorProbes: (store: Store) => Promise<DoctorReport>;
}

/** doctor 工具探针注入面（测试注入 fake；缺省转调 gauntlet-lite toolDetectors）。 */
export interface DoctorToolProbeDeps {
  readonly gauntletProbes?: readonly GauntletToolProbe[];
}

/** D22 一键引导文本：粘贴即完成 chrome-devtools MCP 配置（生成 .mcp.json 或并入现有 mcpServers）。 */
export const CHROME_DEVTOOLS_MCP_HINT =
  '在项目根 .mcp.json 写入 {"mcpServers":{"chrome-devtools":{"command":"npx","args":["-y","chrome-devtools-mcp@latest"]}}} ' +
  "（已存在 .mcp.json 时把 chrome-devtools 条目并入 mcpServers），然后重启 harness。";

const KERNEL_PROBE_NAME = "kernel_doctor_probes";
const MCP_PROBE_NAME = "chrome_devtools_mcp";

/** 探测 .mcp.json 是否配置了 chrome-devtools MCP（D22：未配置 → MISSING_CONFIGURATION + 一键提示）。 */
export async function probeChromeDevtoolsMcp(
  rootDir: string,
): Promise<DoctorProbe> {
  const mcpJsonPath = `${rootDir}/.mcp.json`;
  let raw: string;
  try {
    raw = await readFile(mcpJsonPath, "utf8");
  } catch {
    return {
      probe: MCP_PROBE_NAME,
      status: "MISSING_CONFIGURATION",
      detail: "no .mcp.json in project root; chrome-devtools MCP not configured",
      hint: CHROME_DEVTOOLS_MCP_HINT,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      probe: MCP_PROBE_NAME,
      status: "DEFECT",
      detail: `.mcp.json is not valid JSON: ${(err as Error).message}`,
      hint: `修复 .mcp.json 语法（该文件由 harness 解析；坏配置将静默失效）。配置样例：${CHROME_DEVTOOLS_MCP_HINT}`,
    };
  }
  const servers =
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    typeof (parsed as Record<string, unknown>).mcpServers === "object" &&
    (parsed as Record<string, unknown>).mcpServers !== null
      ? ((parsed as Record<string, unknown>).mcpServers as Record<string, unknown>)
      : null;
  if (servers === null) {
    return {
      probe: MCP_PROBE_NAME,
      status: "MISSING_CONFIGURATION",
      detail: ".mcp.json has no mcpServers section; chrome-devtools MCP not configured",
      hint: CHROME_DEVTOOLS_MCP_HINT,
    };
  }
  for (const [key, value] of Object.entries(servers)) {
    if (
      key.toLowerCase().includes("chrome-devtools") ||
      JSON.stringify(value).toLowerCase().includes("chrome-devtools")
    ) {
      return {
        probe: MCP_PROBE_NAME,
        status: "READY",
        detail: `chrome-devtools MCP configured (server key: ${key})`,
        hint: null,
      };
    }
  }
  return {
    probe: MCP_PROBE_NAME,
    status: "MISSING_CONFIGURATION",
    detail: "mcpServers present but no chrome-devtools entry",
    hint: CHROME_DEVTOOLS_MCP_HINT,
  };
}

function kernelProbeFromReport(report: DoctorReport): DoctorProbe {
  const defective = report.probes.filter((p) => p.status !== "pass");
  if (report.ok && defective.length === 0) {
    return {
      probe: KERNEL_PROBE_NAME,
      status: "READY",
      detail: `all ${report.probes.length} kernel probes passed`,
      hint: null,
    };
  }
  return {
    probe: KERNEL_PROBE_NAME,
    status: "DEFECT",
    detail: defective
      .map((p) => `${p.probe}=${p.status} (${p.detail})`)
      .join("; "),
    hint: "见 docs/kernel-api.md §7 doctor 四探针；dead_producers/alias_conflicts 非空须先对账。",
  };
}

// ============================================================
// P22：CONTRACT/ARCHITECTURE 机判腿工具探测（转调 gauntlet-lite toolDetectors）
// ============================================================

/** 单工具探针（探测函数注入面：测试注入 fake，缺省转调 gauntlet-lite toolDetectors）。 */
export interface GauntletToolProbe {
  readonly probe: string;
  readonly detect: (facts: DetectorFacts) => DetectionResult;
}

/**
 * gauntlet-lite 四态 → doctor 四态映射（缺席语义对齐）：
 * READY→READY；NOT_INSTALLED→NOT_INSTALLED（reason+installHint 路标随附）；
 * DRIFTED→DEFECT（版本漂移是需要处理的配置态）；NOT_REQUIRED_BY_PROFILE→NOT_INSTALLED
 * （合法缺席，同样显式呈现而非静默）。
 */
export function detectionToDoctorProbe(
  probeName: string,
  result: DetectionResult,
): DoctorProbe {
  switch (result.status) {
    case "READY":
      return { probe: probeName, status: "READY", detail: result.evidence, hint: null };
    case "NOT_INSTALLED":
      return {
        probe: probeName,
        status: "NOT_INSTALLED",
        detail: result.reason,
        hint: result.installHint,
      };
    case "DRIFTED":
      return {
        probe: probeName,
        status: "DEFECT",
        detail: `版本漂移：detected ${result.detectedVersion} ≠ expected ${result.expectedVersion}（${result.evidence}）`,
        hint: result.installHint,
      };
    case "NOT_REQUIRED_BY_PROFILE":
      return {
        probe: probeName,
        status: "NOT_INSTALLED",
        detail: result.reason,
        hint: null,
      };
  }
}

/** 缺省工具探针（转调 gauntlet-lite toolDetectors；import 失败 → 全 NOT_INSTALLED 留痕）。 */
async function defaultGauntletProbes(
  rootDir: string,
): Promise<readonly GauntletToolProbe[]> {
  const names = [
    "oasdiff",
    "import_linter",
    "dependency_cruiser",
    "c8",
    "pytest_cov",
    "mutmut",
    "stryker",
    "gitleaks",
    "pip_audit",
    "semgrep",
    "playwright",
  ] as const;
  try {
    const mod = (await import("@pomaster/gauntlet-lite")) as Record<string, unknown>;
    const detectors = mod["toolDetectors"] as
      | Record<string, (facts: DetectorFacts) => DetectionResult>
      | undefined;
    const facts = (mod["platformDetectorFacts"] as (root: string) => DetectorFacts)(rootDir);
    if (detectors === undefined) {
      throw new Error("toolDetectors export missing");
    }
    const keyed: Record<string, (facts: DetectorFacts) => DetectionResult> = {
      oasdiff: detectors["oasdiff"]!,
      import_linter: detectors["importLinter"]!,
      dependency_cruiser: detectors["dependencyCruiser"]!,
      c8: detectors["c8"]!,
      pytest_cov: detectors["pytestCov"]!,
      mutmut: detectors["mutmut"]!,
      stryker: detectors["stryker"]!,
      gitleaks: detectors["gitleaks"]!,
      pip_audit: detectors["pipAudit"]!,
      semgrep: detectors["semgrep"]!,
      playwright: detectors["playwright"]!,
    };
    return names.map((name) => ({
      probe: name,
      detect: () => keyed[name]!(facts),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return names.map((probe) => ({
      probe,
      detect: () =>
        ({
          status: "NOT_INSTALLED",
          tool: probe,
          reason: `gauntlet-lite 探测面不可用（${message}）——工具探测缺席，禁静默`,
          installHint: "修复 @pomaster/gauntlet-lite 安装后重跑 pomaster doctor",
        }) satisfies DetectionResult,
    }));
  }
}

/** 运行工具探针（探测函数逐个执行；异常 → DEFECT 留痕，禁静默）。 */
async function runGauntletProbes(
  probes: readonly GauntletToolProbe[],
  facts: DetectorFacts,
): Promise<readonly DoctorProbe[]> {
  const results: DoctorProbe[] = [];
  for (const entry of probes) {
    let probe: DoctorProbe;
    try {
      probe = detectionToDoctorProbe(entry.probe, entry.detect(facts));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      probe = {
        probe: entry.probe,
        status: "DEFECT",
        detail: `探测执行异常：${message}`,
        hint: "环境异常禁静默（D 线风险备忘）；检查项目目录可读性后重试。",
      };
    }
    results.push(probe);
  }
  return results;
}

/**
 * 探测矩阵：
 * 1) kernel_doctor_probes —— 转调 kernel doctorProbes（四探针 fail-closed）；
 *    store 缺失 → MISSING_CONFIGURATION；kernel scaffold → NOT_INSTALLED；
 *    环境异常 → DEFECT（禁静默）。
 * 2) oasdiff / import_linter / dependency_cruiser / c8 / pytest_cov / mutmut / stryker /
 *    gitleaks / pip_audit / semgrep / playwright ——
 *    工具链机判腿探测（P22 contract/architecture + P23 coverage 双腿 + P24 mutation
 *    双腿 + P25 security 三腿 + P26 playwright 确定性腿；转调 gauntlet-lite
 *    toolDetectors 单一探测面；缺席必带安装路标；P25 三探针独立呈现不聚合——
 *    B2-5 防假绿纪律）。
 * 3) chrome_devtools_mcp —— D22 探测 + 一键引导文本（P26 起与 playwright 确定性腿
 *    探针并存——BROWSER 双通道各自显式呈现）。
 */
export async function runDoctor(
  rootDir: string,
  deps?: Partial<DoctorKernelDeps> & DoctorToolProbeDeps,
): Promise<CommandOutcome<DoctorResult>> {
  const probes: DoctorProbe[] = [];

  // 1) kernel 探针。
  let ledgerText: string | null = null;
  try {
    ledgerText = await readFile(truthIndexPath(rootDir), "utf8");
  } catch {
    ledgerText = null;
  }
  if (ledgerText === null) {
    probes.push({
      probe: KERNEL_PROBE_NAME,
      status: "MISSING_CONFIGURATION",
      detail: `no pomaster state at ${toPosix(TRUTH_INDEX_RELATIVE)}; kernel probes need a store`,
      hint: "run: pomaster init 后重试 doctor。",
    });
  } else {
    try {
      const kernel: DoctorKernelDeps = {
        createStore:
          deps?.createStore ??
          ((async (root: string) => {
            const { createStore } = await import("@pomaster/kernel");
            return createStore(root);
          }) as DoctorKernelDeps["createStore"]),
        doctorProbes:
          deps?.doctorProbes ??
          ((async (store: Store) => {
            const { doctorProbes } = await import("@pomaster/kernel");
            return doctorProbes(store);
          }) as DoctorKernelDeps["doctorProbes"]),
      };
      const store = await kernel.createStore(rootDir);
      const report = await kernel.doctorProbes(store);
      probes.push(kernelProbeFromReport(report));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not-implemented")) {
        probes.push({
          probe: KERNEL_PROBE_NAME,
          status: "NOT_INSTALLED",
          detail: `kernel scaffold not-implemented: ${message}`,
          hint: "@pomaster/kernel 四探针（vocab_lock/dead_producers/alias_conflicts/binding_probe）待 kernel 模块建造者落地。",
        });
      } else {
        probes.push({
          probe: KERNEL_PROBE_NAME,
          status: "DEFECT",
          detail: `kernel probe raised: ${message}`,
          hint: "环境异常禁静默（D 线风险备忘）；检查文件权限与磁盘可用性后重试。",
        });
      }
    }
  }

  // 2) 工具链机判腿探测（P22：转调 gauntlet-lite toolDetectors 单一探测面）。
  const gauntletProbes =
    deps?.gauntletProbes ?? (await defaultGauntletProbes(rootDir));
  const { platformDetectorFacts } = (await import(
    "@pomaster/gauntlet-lite"
  )) as Record<string, unknown>;
  const facts =
    typeof platformDetectorFacts === "function"
      ? (platformDetectorFacts as (root: string) => DetectorFacts)(rootDir)
      : null;
  if (facts === null) {
    for (const entry of gauntletProbes) {
      probes.push({
        probe: entry.probe,
        status: "DEFECT",
        detail: "gauntlet-lite platformDetectorFacts export missing——探测面契约破坏",
        hint: "核对 @pomaster/gauntlet-lite 版本后重试。",
      });
    }
  } else {
    probes.push(...(await runGauntletProbes(gauntletProbes, facts)));
  }

  // 3) chrome-devtools MCP 探测（D22）。
  probes.push(await probeChromeDevtoolsMcp(rootDir));

  const ok = probes.every((p) => p.status === "READY");
  const result: DoctorResult = { ok, probes };
  const human = [
    `doctor: ${ok ? "READY" : "NOT READY"}`,
    ...probes.map(
      (p) =>
        `  ${p.status.padEnd(22)} ${p.probe} — ${p.detail}${p.hint ? `\n${" ".repeat(26)}hint: ${p.hint}` : ""}`,
    ),
  ];
  return ok
    ? okOutcome("doctor", result, human)
    : failOutcome(
        "doctor",
        result,
        probes
          .filter((p) => p.status !== "READY")
          .map((p) => ({
            code: `DOCTOR_${p.status}`,
            message: `${p.probe}: ${p.detail}`,
            hint: p.hint ?? "见 docs/kernel-api.md。",
          })),
        human,
      );
}
