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
 * network 维度」/ D22①——与 chrome_devtools_mcp 交互腿探针并存，双通道各自显式呈现）；
 * P27 起扩容 lighthouse / web_vitals（PERFORMANCE 门禁双 runner 工具，B3-3「对接 §29
 * 性能预算字段」——双探针独立呈现不聚合，lighthouse=实验室判卷面 / web_vitals=字段
 * 数据判卷面）+ schemathesis（CONTRACT 加强腿工具，B3-4「从 OpenAPI 生成
 * property-based 用例；FastAPI profile 招牌件」）。
 * P1-5 起新增 sensor_capability_catalog 探针（PRD v0.5.2 §6.5/§14 P1-5，裁决 8 D7=A
 * 「loader + doctor 联结」）：catalog/sensors/ 六条 sensor_capability 经 kernel
 * loadCatalogSensors 载入；availability_probe 是声明式引用（四克制：防第二套探测机制，
 * catalog 是数据不执行），doctor 侧只做引用→既有探针行的名字解析（见
 * SENSOR_DETECTOR_TO_DOCTOR_PROBE），绝不二次探测——可用性事实仍由 2)/3) 既有行承载。
 * P-v06 批次 2.6（Browser Eyes，Owner 指令 2026-09-03）起新增 playwright_mcp 探针——
 * chrome_devtools_mcp 同款探测模式换目标（读项目 .mcp.json + 关键词命中 + 一键引导，
 * 零新依赖零新探测机制），四态矩阵 fail-closed 同款：BROWSER 双通道（playwright ∥
 * chrome-devtools，browser-legs.ts BROWSER_LEG_ORDER）与 Sensor Capability Catalog
 * 双眼登记（SENSOR.BROWSER.DETERMINISTIC/INTERACTIVE）的两个 MCP 在 doctor 呈现面
 * 各自显式缺席，禁静默。
 */

import { readFile } from "node:fs/promises";
import type { DoctorReport, Store } from "@pomaster/kernel";
import type {
  PortabilityRuntimeRebuildProbe,
} from "@pomaster/kernel";
import type { DetectionResult, DetectorFacts } from "@pomaster/gauntlet-lite";
import {
  AGENTS_MD_RELATIVE,
  GENERATED_MARKER,
  TRUTH_INDEX_RELATIVE,
  toPosix,
  truthIndexPath,
} from "./store-layout.js";
import {
  buildStorePaths,
  countObservationRecords,
} from "@pomaster/kernel";
import {
  CLAUDE_SETTINGS_RELATIVE,
  ENTRY_MODE_HEAVY_MARKER,
  POMASTER_HOOK_EVENT_COMMANDS,
  SKILL_MANIFEST,
} from "./heavy-entry.js";
import {
  countSeededAssets,
  seededAssetsHumanLine,
  type SeededAssetCounts,
} from "./seeds.js";
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
  /**
   * P1-5 Sensor Capability 联结呈现（加法字段，不改 ok 语义：可用性事实由既有
   * 工具/MCP 探针行承载，本字段只呈现「catalog 能力 → 探针行」的声明式引用解析
   * 结果，禁二次探测；缺省缺席 = catalog 载入失败时的探针行 detail 承载）。
   */
  readonly sensors?: readonly SensorCapabilityAvailability[];
  /**
   * 感知回执落盘计数（vNext Batch 2 R6 / C9；加法字段不改 ok 语义）：统计
   * evidence/observations/ 分区回执记录数（OBS-*.json / ENVREC-*.json）——
   * 巡检呈现位（形态最小），非探针行；目录缺席 = 0（显式缺席）。
   */
  readonly observation_receipts?: { readonly count: number };
  /**
   * 播种分面计数（vNext Batch 6 B6e 收口——B6a 未尽事项 1；加法字段不改 ok 语义）：
   * .pomaster 播种面五分面磁盘实况计数（README 不计）——呈现位非判定（播种件是
   * 项目可编辑物，计数 ≠ 清单分母对账）；目录缺席 = 0（显式缺席）。
   */
  readonly seeded_assets?: SeededAssetCounts;
}

/** P1-5 Sensor Capability 联结呈现形态（DoctorResult.sensors 条目）。 */
export interface SensorCapabilityAvailability {
  readonly sensor_id: string;
  readonly file: string;
  readonly availability_probe: { readonly surface: string; readonly keys: readonly string[] };
  /** 解析到的 doctor 既有探针行名（toolDetectors 面；gateAdapters/kernel 面无 doctor 行 → 空数组显式）。 */
  readonly doctor_probe_names: readonly string[];
  readonly fallback: readonly string[];
}

/** kernel loadCatalogSensors 返回形态的本包最小镜像（动态导入收窄用；字段级子集）。 */
interface LoadedSensorMaterial {
  readonly file: string;
  readonly id: string;
  readonly availabilityProbe: {
    readonly surface: string;
    readonly keys: readonly string[];
  };
  readonly fallback: readonly string[];
}

/** CLI 所需的 kernel doctor 最小面。 */
export interface DoctorKernelDeps {
  createStore: (rootDir: string) => Promise<Store>;
  doctorProbes: (store: Store) => Promise<DoctorReport>;
}

/** doctor 工具探针注入面（测试注入 fake；缺省转调 gauntlet-lite toolDetectors）。 */
export interface DoctorToolProbeDeps {
  readonly gauntletProbes?: readonly GauntletToolProbe[];
  /** P1-5：catalog 根注入（测试/嵌入方；缺省 kernel resolveCatalogRoot 缺省定位）。 */
  readonly catalogRoot?: string;
}

/** D22 一键引导文本：粘贴即完成 chrome-devtools MCP 配置（生成 .mcp.json 或并入现有 mcpServers）。 */
export const CHROME_DEVTOOLS_MCP_HINT =
  '在项目根 .mcp.json 写入 {"mcpServers":{"chrome-devtools":{"command":"npx","args":["-y","chrome-devtools-mcp@latest"]}}} ' +
  "（已存在 .mcp.json 时把 chrome-devtools 条目并入 mcpServers），然后重启 harness。";

/**
 * playwright MCP 一键引导文本（P-v06 批次 2.6 Browser Eyes）：chrome-devtools 同款形态，
 * 官方包名 @playwright/mcp——粘贴即完成 playwright MCP 配置（生成 .mcp.json 或并入现有
 * mcpServers）。观测/验证分工语义见 catalog/knowledge/knowledge.web.browser.mcp_eyes.json。
 */
export const PLAYWRIGHT_MCP_HINT =
  '在项目根 .mcp.json 写入 {"mcpServers":{"playwright":{"command":"npx","args":["-y","@playwright/mcp@latest"]}}} ' +
  "（已存在 .mcp.json 时把 playwright 条目并入 mcpServers），然后重启 harness。";

const KERNEL_PROBE_NAME = "kernel_doctor_probes";
const MCP_PROBE_NAME = "chrome_devtools_mcp";
const PLAYWRIGHT_MCP_PROBE_NAME = "playwright_mcp";
const SENSOR_CATALOG_PROBE_NAME = "sensor_capability_catalog";

/**
 * P1-5/D7 联结位：sensor availability_probe（toolDetectors 面）键 → doctor 探针行名。
 * 键词形 = gauntlet-lite toolDetectors 的 camelCase 键（15 探测器单一事实源）；
 * 行名 = 本文件探测矩阵既有呈现名（snake_case）。声明式引用的漂移防线：
 * tests/integration/sensor-capability-catalog.spec.ts 断言 catalog 引用键 ⊆ 本映射
 * keys ⊆ toolDetectors/gateAdapters/kernel 三面闭包（两头造册必漂的结构防线）。
 * TODO(vocab-pr-0005)：行名词形随词表批次统一登记。
 */
export const SENSOR_DETECTOR_TO_DOCTOR_PROBE: Record<string, string> = {
  chromeDevtoolsMcp: MCP_PROBE_NAME,
  playwright: "playwright",
  oasdiff: "oasdiff",
  schemathesis: "schemathesis",
  lighthouse: "lighthouse",
  webVitals: "web_vitals",
};

/**
 * 项目 .mcp.json 探测共享实现（P-v06 批次 2.6 抽取：chrome-devtools 与 playwright 两个
 * MCP 探针共用同一探测模式——读项目根 .mcp.json + 键名/值关键词命中 + 四态 fail-closed
 * + 一键引导，禁两套探测口径漂移）。probeName 行名 / serverKeyword 命中词 /
 * toolLabel detail 词形 / hint 一键引导逐参注入。
 */
async function probeMcpServerConfigured(
  rootDir: string,
  spec: {
    readonly probeName: string;
    readonly serverKeyword: string;
    readonly toolLabel: string;
    readonly hint: string;
  },
): Promise<DoctorProbe> {
  const mcpJsonPath = `${rootDir}/.mcp.json`;
  let raw: string;
  try {
    raw = await readFile(mcpJsonPath, "utf8");
  } catch {
    return {
      probe: spec.probeName,
      status: "MISSING_CONFIGURATION",
      detail: `no .mcp.json in project root; ${spec.toolLabel} MCP not configured`,
      hint: spec.hint,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      probe: spec.probeName,
      status: "DEFECT",
      detail: `.mcp.json is not valid JSON: ${(err as Error).message}`,
      hint: `修复 .mcp.json 语法（该文件由 harness 解析；坏配置将静默失效）。配置样例：${spec.hint}`,
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
      probe: spec.probeName,
      status: "MISSING_CONFIGURATION",
      detail: `.mcp.json has no mcpServers section; ${spec.toolLabel} MCP not configured`,
      hint: spec.hint,
    };
  }
  for (const [key, value] of Object.entries(servers)) {
    if (
      key.toLowerCase().includes(spec.serverKeyword) ||
      JSON.stringify(value).toLowerCase().includes(spec.serverKeyword)
    ) {
      return {
        probe: spec.probeName,
        status: "READY",
        detail: `${spec.toolLabel} MCP configured (server key: ${key})`,
        hint: null,
      };
    }
  }
  return {
    probe: spec.probeName,
    status: "MISSING_CONFIGURATION",
    detail: `mcpServers present but no ${spec.serverKeyword} entry`,
    hint: spec.hint,
  };
}

/** 探测 .mcp.json 是否配置了 chrome-devtools MCP（D22：未配置 → MISSING_CONFIGURATION + 一键提示）。 */
export async function probeChromeDevtoolsMcp(
  rootDir: string,
): Promise<DoctorProbe> {
  return probeMcpServerConfigured(rootDir, {
    probeName: MCP_PROBE_NAME,
    serverKeyword: "chrome-devtools",
    toolLabel: "chrome-devtools",
    hint: CHROME_DEVTOOLS_MCP_HINT,
  });
}

/**
 * 探测 .mcp.json 是否配置了 playwright MCP（P-v06 批次 2.6 Browser Eyes：与
 * chrome_devtools_mcp 同款四态 fail-closed——BROWSER 双通道两 MCP 在 doctor 呈现面
 * 各自显式缺席，禁静默）。关键词 playwright 同时命中键名与 @playwright/mcp 参数词形。
 */
export async function probePlaywrightMcp(
  rootDir: string,
): Promise<DoctorProbe> {
  return probeMcpServerConfigured(rootDir, {
    probeName: PLAYWRIGHT_MCP_PROBE_NAME,
    serverKeyword: "playwright",
    toolLabel: "playwright",
    hint: PLAYWRIGHT_MCP_HINT,
  });
}

// ============================================================
// 重入口安装物探针（D13 2026-09-03 修订：重入口默认；B7 裁定 2026-09-04：init 单一
// 重入口——hooks/skills 未装即指路重跑 init）
// ============================================================

export const HEAVY_ENTRY_HOOKS_PROBE = "heavy_entry_hooks";
export const HEAVY_ENTRY_SKILLS_PROBE = "heavy_entry_skills";

/** 入口形态二态（AGENTS.md 生成标记 + 重入口安装标记机读判定；标记缺席 = 未安装/最小形态，不猜测）。 */
export type EntryModeState = "not-installed" | "heavy";

/** 共享实现（probeMcpServerConfigured 先例）：入口形态读取一次，hooks/skills 两探针共用。 */
async function readEntryMode(rootDir: string): Promise<EntryModeState> {
  let text: string;
  try {
    text = await readFile(`${rootDir}/${AGENTS_MD_RELATIVE}`, "utf8");
  } catch {
    return "not-installed";
  }
  if (!text.includes(GENERATED_MARKER)) return "not-installed";
  return text.includes(ENTRY_MODE_HEAVY_MARKER) ? "heavy" : "not-installed";
}

async function readTextOrNull(absolute: string): Promise<string | null> {
  try {
    return await readFile(absolute, "utf8");
  } catch {
    return null;
  }
}

/**
 * 重入口安装物探测（hooks 注册态 + skills 双镜像在位/逐字节一致；幂等可验——
 * init 重跑零写入即本探针持续 READY）。探针按入口形态判「应装未装」而不一刀切：
 * - not-installed（无 AGENTS.md / 无重入口安装标记——含历史已删除形态的存量标记）→
 *   MISSING_CONFIGURATION（带 init 路标：重入口为默认，hooks/skills 未装直接指路
 *   重跑 init——B7 裁定 2026-09-04）；
 * - heavy → hooks：settings.json 在座 + 两条注册项在场 = READY，文件缺失/注册项缺失
 *   = MISSING_CONFIGURATION，坏 JSON/结构不合 = DEFECT（坏配置会被 harness 整体跳过、
 *   hooks 静默失效）；skills：15 份 × 双镜像全在且逐字节一致 = READY，任一缺失 =
 *   MISSING_CONFIGURATION，字节漂移 = DEFECT（双镜像漂移会使「哪份被加载」成为
 *   行为分叉点——单一事实源纪律破坏）。
 */
export async function probeHeavyEntryInstall(
  rootDir: string,
): Promise<readonly [DoctorProbe, DoctorProbe]> {
  const mode = await readEntryMode(rootDir);
  if (mode === "not-installed") {
    const detail = `no pomaster heavy entry at ${toPosix(AGENTS_MD_RELATIVE)}`;
    return [
      {
        probe: HEAVY_ENTRY_HOOKS_PROBE,
        status: "MISSING_CONFIGURATION",
        detail: `${detail}; heavy-entry hooks not installed`,
        hint: "run: pomaster init（重入口默认：skills 库 + hooks 注入）。",
      },
      {
        probe: HEAVY_ENTRY_SKILLS_PROBE,
        status: "MISSING_CONFIGURATION",
        detail: `${detail}; heavy-entry skills not installed`,
        hint: "run: pomaster init（重入口默认）。",
      },
    ];
  }

  // heavy：hooks 注册态。
  const hooksProbe: DoctorProbe = await (async () => {
    const raw = await readTextOrNull(`${rootDir}/${CLAUDE_SETTINGS_RELATIVE}`);
    if (raw === null) {
      return {
        probe: HEAVY_ENTRY_HOOKS_PROBE,
        status: "MISSING_CONFIGURATION",
        detail: `heavy 模式但 ${toPosix(CLAUDE_SETTINGS_RELATIVE)} 缺失`,
        hint: "重跑 pomaster init（claude 平台选中时注册 SessionStart/UserPromptSubmit hooks）。",
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return {
        probe: HEAVY_ENTRY_HOOKS_PROBE,
        status: "DEFECT",
        detail: `${toPosix(CLAUDE_SETTINGS_RELATIVE)} 不是合法 JSON：${(err as Error).message}`,
        hint: "修复 JSON 语法（坏配置会被 harness 整体跳过、hooks 静默失效）后重跑 pomaster init。",
      };
    }
    const hooks =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).hooks
        : undefined;
    if (
      hooks === undefined ||
      hooks === null ||
      typeof hooks !== "object" ||
      Array.isArray(hooks)
    ) {
      return {
        probe: HEAVY_ENTRY_HOOKS_PROBE,
        status: "MISSING_CONFIGURATION",
        detail: "settings.json 无 hooks 对象（heavy 模式注册项缺席）",
        hint: "重跑 pomaster init 合并注册项（既有内容保留）。",
      };
    }
    const missing: string[] = [];
    for (const { event, command } of POMASTER_HOOK_EVENT_COMMANDS) {
      const groups = (hooks as Record<string, unknown>)[event];
      const present =
        Array.isArray(groups) &&
        groups.some(
          (group) =>
            group !== null &&
            typeof group === "object" &&
            Array.isArray((group as Record<string, unknown>).hooks) &&
            ((group as Record<string, unknown>).hooks as unknown[]).some(
              (handler) =>
                handler !== null &&
                typeof handler === "object" &&
                (handler as Record<string, unknown>).command === command,
            ),
        );
      if (!present) missing.push(`${event}→${command}`);
    }
    if (missing.length > 0) {
      return {
        probe: HEAVY_ENTRY_HOOKS_PROBE,
        status: "MISSING_CONFIGURATION",
        detail: `hook 注册项缺席：${missing.join(" / ")}`,
        hint: "重跑 pomaster init 合并注册项（按 command 词形幂等查重，既有内容保留）。",
      };
    }
    return {
      probe: HEAVY_ENTRY_HOOKS_PROBE,
      status: "READY",
      detail: `${POMASTER_HOOK_EVENT_COMMANDS.map((e) => e.event).join(" + ")} hooks registered（合并式，既有条目保留）`,
      hint: null,
    };
  })();

  // heavy：skills 双镜像全清单核对 + 逐字节一致。
  const skillsProbe: DoctorProbe = await (async () => {
    const missing: string[] = [];
    const drifted: string[] = [];
    for (const spec of SKILL_MANIFEST) {
      const universal = await readTextOrNull(
        `${rootDir}/.agents/skills/${spec.name}/SKILL.md`,
      );
      const claude = await readTextOrNull(
        `${rootDir}/.claude/skills/${spec.name}/SKILL.md`,
      );
      if (universal === null) missing.push(`.agents/skills/${spec.name}`);
      if (claude === null) missing.push(`.claude/skills/${spec.name}`);
      if (universal !== null && claude !== null && universal !== claude) {
        drifted.push(spec.name);
      }
    }
    if (missing.length > 0) {
      const shown = missing.slice(0, 4).join(", ");
      return {
        probe: HEAVY_ENTRY_SKILLS_PROBE,
        status: "MISSING_CONFIGURATION",
        detail: `heavy 模式但镜像缺失（${missing.length}）：${shown}${missing.length > 4 ? " …" : ""}`,
        hint: "重跑 pomaster init 重建缺失镜像（双镜像逐字节一致是重复发现缓解的前提）。",
      };
    }
    if (drifted.length > 0) {
      return {
        probe: HEAVY_ENTRY_SKILLS_PROBE,
        status: "DEFECT",
        detail: `双镜像字节漂移：${drifted.slice(0, 6).join(", ")}（OpenCode/Cursor/Warp/Amp 会重复发现两份——漂移即行为分叉点）`,
        hint: "重跑 pomaster init 以单一实现重写（skill 命令卡单一事实源 = pomaster --help）。",
      };
    }
    return {
      probe: HEAVY_ENTRY_SKILLS_PROBE,
      status: "READY",
      detail: `${SKILL_MANIFEST.length} skills × 2 镜像（.agents + .claude）逐字节一致`,
      hint: null,
    };
  })();

  return [hooksProbe, skillsProbe];
}

/**
 * P32 kernel 探针 → doctor 四态矩阵映射（portability_runtime_rebuild）：
 * READY→READY；NOT_RUN→MISSING_CONFIGURATION（store 与 runtime 皆缺 = 依赖面未
 * 配置——no-pomaster-state 先例）；DRIFTED→DEFECT（声明漂移是需要处理的配置态——
 * detectionToDoctorProbe 既有 DRIFTED→DEFECT 裁定同源）。kernel 侧状态词形
 * （NOT_RUN/DRIFTED）随 detail 逐字呈现供机读对账。
 */
export function portabilityProbeToDoctorProbe(
  kernel: PortabilityRuntimeRebuildProbe,
): DoctorProbe {
  switch (kernel.status) {
    case "READY":
      return { probe: kernel.probe, status: "READY", detail: kernel.detail, hint: null };
    case "NOT_RUN":
      return {
        probe: kernel.probe,
        status: "MISSING_CONFIGURATION",
        detail: `NOT_RUN: ${kernel.detail}`,
        hint: "run: pomaster init 后重试 doctor；runtime 面可由 pomaster portability bootstrap 重建（§85.4）。",
      };
    case "DRIFTED":
      return {
        probe: kernel.probe,
        status: "DEFECT",
        detail: `DRIFTED: ${kernel.detail}`,
        hint: "manifest 声明与实况矛盾：核对 .pomaster/portability-manifest.json（§85.3 五键）或重跑 pomaster portability bootstrap。",
      };
  }
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
    "lighthouse",
    "web_vitals",
    "schemathesis",
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
      lighthouse: detectors["lighthouse"]!,
      web_vitals: detectors["webVitals"]!,
      schemathesis: detectors["schemathesis"]!,
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
 * 1) kernel_doctor_probes —— 转调 kernel doctorProbes（五探针 fail-closed）；
 *    store 缺失 → MISSING_CONFIGURATION；kernel scaffold → NOT_INSTALLED；
 *    环境异常 → DEFECT（禁静默）。
 * 1.5) portability_runtime_rebuild —— P32 runtime 可重建探针（state 在=READY，
 *    runtime 缺失但 state 在=READY 可重建语义，两者都缺=NOT_RUN→
 *    MISSING_CONFIGURATION，manifest 声明与实况矛盾=DRIFTED→DEFECT）。
 * 2) oasdiff / import_linter / dependency_cruiser / c8 / pytest_cov / mutmut / stryker /
 *    gitleaks / pip_audit / semgrep / playwright / lighthouse / web_vitals / schemathesis ——
 *    工具链机判腿探测（P22 contract/architecture + P23 coverage 双腿 + P24 mutation
 *    双腿 + P25 security 三腿 + P26 playwright 确定性腿 + P27 performance 双 runner
 *    与 schemathesis 加强腿；转调 gauntlet-lite toolDetectors 单一探测面；缺席必带
 *    安装路标；P25 三探针独立呈现不聚合——B2-5 防假绿纪律）。
 * 3) chrome_devtools_mcp / playwright_mcp —— D22 探测 + 一键引导文本（P26 起与 playwright
 *    确定性腿探针并存——BROWSER 双通道各自显式呈现；P-v06 批次 2.6 起 playwright MCP
 *    探针同款四态 fail-closed——双 MCP 在呈现面各自缺席显式，禁静默）。
 * 3.5) heavy_entry_hooks / heavy_entry_skills —— 重入口安装物探针（D13 2026-09-03
 *    修订：重入口默认；B7 裁定 2026-09-04 init 单一重入口——hooks 注册态按 command
 *    词形核对、skills 15×2 双镜像逐字节一致核对；重入口安装标记缺席 = 未安装 →
 *    MISSING_CONFIGURATION 指路重跑 init；共享 readEntryMode 单次读取——
 *    probeMcpServerConfigured 先例）。
 * 4) sensor_capability_catalog —— P1-5 catalog/sensors/ 载入（裁决 8 D7=A loader+doctor
 *    联结；availability_probe 声明式引用→既有行名解析，禁二次探测；catalog 缺席
 *    MISSING_CONFIGURATION / 物料坏形 DEFECT——坏物料 ≠ catalog 缺席，fail-closed 显式）。
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

  // 1.5) P32 portability_runtime_rebuild 探针（runtime 可重建性；§85.4 语义）：
  //      state 在=READY（runtime 缺失亦 READY——可重建语义）；两者都缺=NOT_RUN→
  //      MISSING_CONFIGURATION；manifest 声明与实况矛盾=DRIFTED→DEFECT。
  try {
    const { probePortabilityRuntimeRebuild } = (await import(
      "@pomaster/kernel"
    )) as Record<string, unknown>;
    if (typeof probePortabilityRuntimeRebuild !== "function") {
      throw new Error("probePortabilityRuntimeRebuild export missing");
    }
    probes.push(
      portabilityProbeToDoctorProbe(
        (probePortabilityRuntimeRebuild as (root: string) => PortabilityRuntimeRebuildProbe)(
          rootDir,
        ),
      ),
    );
  } catch (err) {
    probes.push({
      probe: "portability_runtime_rebuild",
      status: "DEFECT",
      detail: `portability probe raised: ${err instanceof Error ? err.message : String(err)}`,
      hint: "环境异常禁静默（D 线风险备忘）；检查 .pomaster 可读性后重试。",
    });
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

  // 3) MCP 探测（D22 + P-v06 批次 2.6 Browser Eyes 双 MCP 各自显式）。
  probes.push(await probeChromeDevtoolsMcp(rootDir));
  probes.push(await probePlaywrightMcp(rootDir));

  // 3.5) 重入口安装物探针（D13 2026-09-03 修订：重入口默认；B7 裁定 2026-09-04
  //      init 单一重入口）：hooks 注册态 + skills 双镜像一致态；重入口安装标记缺席
  //      = 未安装 → MISSING_CONFIGURATION 指路重跑 init。
  probes.push(...(await probeHeavyEntryInstall(rootDir)));

  // 4) P1-5 Sensor Capability Catalog（裁决 8 D7=A：loader + doctor 联结）。
  //    只做声明式引用的行名解析（SENSOR_DETECTOR_TO_DOCTOR_PROBE），绝不二次探测；
  //    坏物料/缺席显式入探针行（fail-closed），ok 语义与既有行一致（非 READY → ok=false）。
  let sensors: readonly SensorCapabilityAvailability[] | undefined;
  try {
    // 动态导入 + 收窄（kernel 源码直连/vitest 与 dist 双形态下都显式核验导出在场）。
    const kernel = (await import("@pomaster/kernel")) as Record<string, unknown>;
    const loadCatalogSensors = kernel["loadCatalogSensors"] as
      | ((root: string) => readonly LoadedSensorMaterial[])
      | undefined;
    const resolveCatalogRoot = kernel["resolveCatalogRoot"] as
      | ((root?: string) => string)
      | undefined;
    if (typeof loadCatalogSensors !== "function" || typeof resolveCatalogRoot !== "function") {
      throw new Error("kernel loadCatalogSensors/resolveCatalogRoot export missing");
    }
    const materials = loadCatalogSensors(resolveCatalogRoot(deps?.catalogRoot));
    sensors = materials.map((sensor) => ({
      sensor_id: sensor.id,
      file: sensor.file,
      availability_probe: {
        surface: sensor.availabilityProbe.surface,
        keys: [...sensor.availabilityProbe.keys],
      },
      doctor_probe_names:
        sensor.availabilityProbe.surface === "toolDetectors"
          ? sensor.availabilityProbe.keys
              .map((key) => SENSOR_DETECTOR_TO_DOCTOR_PROBE[key])
              .filter((name): name is string => typeof name === "string")
          : [],
      fallback: [...sensor.fallback],
    }));
    probes.push({
      probe: SENSOR_CATALOG_PROBE_NAME,
      status: "READY",
      detail: `${sensors.length} sensor capabilities loaded（availability 为声明式引用，探测仍归 toolDetectors/gateAdapters/kernel 既有面——禁第二套探测机制）`,
      hint: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    // 缺席两态：catalog 根不在（NOT_CONFIGURED）/ sensors 目录缺失（loader 对「目录缺失」
    // 报 SCHEMA_INVALID 但语义是物料缺席）→ MISSING_CONFIGURATION；其余坏形 → DEFECT。
    const missing =
      code === "NOT_CONFIGURED" ||
      (code === "SCHEMA_INVALID" && message.includes("目录缺失"));
    probes.push({
      probe: SENSOR_CATALOG_PROBE_NAME,
      status: missing ? "MISSING_CONFIGURATION" : "DEFECT",
      detail: missing ? `sensor catalog unavailable: ${message}` : `sensor catalog malformed: ${message}`,
      hint: missing
        ? "catalog/ 是 POMaster_VNext 仓库资产（sensors/ 为 P1-5 管辖面）；在仓库内运行或显式注入 catalogRoot。"
        : "sensor_capability 物料坏形（SCHEMA_INVALID fail-closed）：对照 catalog/sensors/ 在册条目修复后重试。",
    });
  }

  const ok = probes.every((p) => p.status === "READY");
  // 感知回执落盘计数（vNext Batch 2 R6 / C9）：加法呈现字段，不改 ok 语义；
  // kernel countObservationRecords 单一实现（目录缺席 = 0 显式缺席）。
  // kernel 依赖与本文件顶部静态 import 同源（buildStorePaths 已静态引入 kernel）；
  // try/catch 只兜 countObservationRecords 运行时异常（呈现位失败归 0，不炸 doctor）。
  let observationCount = 0;
  try {
    observationCount = countObservationRecords(buildStorePaths(rootDir).evidenceDir);
  } catch {
    observationCount = 0;
  }
  // 播种分面计数（vNext Batch 6 B6e 收口——B6a 未尽事项 1）：加法呈现字段，不改 ok
  // 语义；countSeededAssets 单一实现（目录缺席 = 0 显式缺席；异常归零不炸 doctor——
  // observation_receipts 同款呈现位纪律）。
  let seededAssets: SeededAssetCounts | null = null;
  try {
    seededAssets = await countSeededAssets(rootDir);
  } catch {
    seededAssets = null;
  }
  const result: DoctorResult = {
    ok,
    probes,
    ...(sensors !== undefined ? { sensors } : {}),
    observation_receipts: { count: observationCount },
    ...(seededAssets !== null ? { seeded_assets: seededAssets } : {}),
  };
  const human = [
    `doctor: ${ok ? "READY" : "NOT READY"}`,
    ...probes.map(
      (p) =>
        `  ${p.status.padEnd(22)} ${p.probe} — ${p.detail}${p.hint ? `\n${" ".repeat(26)}hint: ${p.hint}` : ""}`,
    ),
    `  observation receipts: ${observationCount} 条（evidence/observations/ sidecar 分区；0 = 显式缺席）`,
    ...(seededAssets !== null ? [seededAssetsHumanLine(seededAssets)] : []),
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
