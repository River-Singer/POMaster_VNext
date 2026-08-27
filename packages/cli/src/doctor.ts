/**
 * doctor.ts —— `pomaster doctor`：环境/内核/MCP 探测矩阵（D7 Portability + D22 一键引导）。
 *
 * 四态矩阵（探测层缺席显式，禁静默跳过当通过；词表外局部词 → TODO(vocab-pr)）：
 * - READY               —— 探测项可用且通过；
 * - NOT_INSTALLED       —— 依赖模块未落地（如 kernel scaffold not-implemented）；
 * - MISSING_CONFIGURATION —— 依赖存在但项目未配置（如 chrome-devtools MCP 未进 .mcp.json）；
 * - DEFECT              —— 配置/内容/环境异常（解析失败、探针报 defect）。
 *
 * fail-closed：ok = 全部 READY；任一非 READY → ok=false。doctor 只读，永不修改 store。
 * D 线风险备忘：环境异常（文件不可读等）必须报 DEFECT，禁静默。
 */

import { readFile } from "node:fs/promises";
import type { DoctorReport, Store } from "@pomaster/kernel";
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

/**
 * 探测矩阵：
 * 1) kernel_doctor_probes —— 转调 kernel doctorProbes（四探针 fail-closed）；
 *    store 缺失 → MISSING_CONFIGURATION；kernel scaffold → NOT_INSTALLED；
 *    环境异常 → DEFECT（禁静默）。
 * 2) chrome_devtools_mcp —— D22 探测 + 一键引导文本。
 */
export async function runDoctor(
  rootDir: string,
  deps?: Partial<DoctorKernelDeps>,
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

  // 2) chrome-devtools MCP 探测（D22）。
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
