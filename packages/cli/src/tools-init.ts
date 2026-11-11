/**
 * tools-init.ts —— `pomaster tools init`：按项目已声明的工具写出起步工具注册面
 * （.pomaster/tools/bindings.json）。
 *
 * 只登记受信 adapter 能执行的工具，探测用 adapter 自己的探测器（与 tools list 的 detect
 * 判定式同源），不自造第二套探测：
 * - vitest   → BUILD（unit_behavior），vitest JSON reporter；
 * - vue-tsc  → TYPECHECK（static_analysis），Vue 项目优先于 tsc（.vue 文件只有它看得到）；
 * - tsc      → TYPECHECK（static_analysis），--noEmit --listFiles --pretty false；
 * - eslint   → LINT（static_analysis），--format json（不带 --fix）。
 * 命令按锁文件选包管理器（pnpm / yarn / bun / npm）。版本锚取探测到的 semver，
 * 取不到就不登记并说明原因。
 *
 * 不做的事：
 * - 已有注册面里的绑定原样保留（同 id 不覆盖、不改命令）；只补缺的；
 * - 探测到但没有受信 adapter 的工具（playwright、pytest、maven、gradle……）只列出来，
 *   不猜命令也不登记——它们的证明义务在 plan 里保持 REQUIRED 并记 tool_gap；
 * - 一个都探测不到时不写文件（缺席与显式空表语义不同，不替项目造一张空表）；
 * - 登记 ≠ 调用授权：执行入账照旧只经 plan run / record gate-run。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  BUILD_GATE_DEF,
  ESLINT_JSON_FORMAT,
  ESLINT_TOOL_ID,
  LINT_ADAPTER_REF,
  LINT_GATE_DEF,
  LINT_METRIC_DIALECT,
  LINT_PARSER_REF,
  TRUSTED_BINDING_ADAPTERS,
  TSC_TEXT_FORMAT,
  TSC_TOOL_ID,
  TYPECHECK_ADAPTER_REF,
  TYPECHECK_GATE_DEF,
  TYPECHECK_METRIC_DIALECT,
  TYPECHECK_PARSER_REF,
  VITEST_TOOL_ID,
  VUE_TSC_TOOL_ID,
  platformDetectorFacts,
  type DetectionResult,
  type ToolBindingRecord,
} from "@pomaster/gauntlet-lite";
import type { CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { loadToolBindingRegistry } from "./tools.js";
import { TOOLS_BINDINGS_RELATIVE, toolsBindingsPath } from "./store-layout.js";

/** 起步登记的一种工具：受信 adapter、工具身份、命令与报告合同。 */
interface StarterTool {
  readonly id: string;
  readonly label: string;
  readonly adapterRef: string;
  readonly toolId: string;
  readonly bin: string;
  readonly args: string;
  readonly gate: string;
  readonly gateDef: string;
  readonly metricDialect: string;
  readonly capability: string;
  readonly format: string;
  readonly parserRef: string;
}

const PARSER_VERSION = "0.1.0";

const STARTER_TOOLS: readonly StarterTool[] = [
  {
    id: "project.test.vitest",
    label: "vitest",
    adapterRef: "builtin.gauntlet-lite.build",
    toolId: VITEST_TOOL_ID,
    bin: "vitest",
    args: "run --reporter=json",
    gate: "BUILD",
    gateDef: BUILD_GATE_DEF,
    metricDialect: "test:assertion_count",
    capability: "unit_behavior",
    format: "vitest-json-stdout",
    parserRef: "builtin.gauntlet-lite.build/vitest-json",
  },
  {
    id: "project.type.vue-tsc",
    label: "vue-tsc",
    adapterRef: TYPECHECK_ADAPTER_REF,
    toolId: VUE_TSC_TOOL_ID,
    bin: "vue-tsc",
    args: "--noEmit --listFiles --pretty false",
    gate: "TYPECHECK",
    gateDef: TYPECHECK_GATE_DEF,
    metricDialect: TYPECHECK_METRIC_DIALECT,
    capability: "static_analysis",
    format: TSC_TEXT_FORMAT,
    parserRef: TYPECHECK_PARSER_REF,
  },
  {
    id: "project.type.tsc",
    label: "tsc",
    adapterRef: TYPECHECK_ADAPTER_REF,
    toolId: TSC_TOOL_ID,
    bin: "tsc",
    args: "--noEmit --listFiles --pretty false",
    gate: "TYPECHECK",
    gateDef: TYPECHECK_GATE_DEF,
    metricDialect: TYPECHECK_METRIC_DIALECT,
    capability: "static_analysis",
    format: TSC_TEXT_FORMAT,
    parserRef: TYPECHECK_PARSER_REF,
  },
  {
    id: "project.lint.eslint",
    label: "eslint",
    adapterRef: LINT_ADAPTER_REF,
    toolId: ESLINT_TOOL_ID,
    bin: "eslint",
    args: ". --format json",
    gate: "LINT",
    gateDef: LINT_GATE_DEF,
    metricDialect: LINT_METRIC_DIALECT,
    capability: "static_analysis",
    format: ESLINT_JSON_FORMAT,
    parserRef: LINT_PARSER_REF,
  },
];

/**
 * 声明了但没有受信 adapter 的工具（依赖名 / 根目录文件 → 说法）。只用来如实列出，
 * 不据此登记任何绑定。
 */
const UNCOVERED_SIGNALS: readonly { readonly label: string; readonly deps?: readonly string[]; readonly files?: readonly string[] }[] = [
  { label: "Playwright（浏览器 E2E）", deps: ["@playwright/test", "playwright"] },
  { label: "Cypress（浏览器 E2E）", deps: ["cypress"] },
  { label: "Jest（单元测试）", deps: ["jest"] },
  { label: "pytest（Python 测试）", files: ["pytest.ini", "pyproject.toml", "setup.cfg", "tox.ini"] },
  { label: "Maven（Java 构建与测试）", files: ["pom.xml"] },
  { label: "Gradle（Java / Kotlin 构建与测试）", files: ["build.gradle", "build.gradle.kts"] },
  { label: "Go test", files: ["go.mod"] },
  { label: "PHPUnit（PHP 测试）", files: ["phpunit.xml", "phpunit.xml.dist"] },
];

export interface ToolsInitInput {
  readonly dryRun?: boolean;
}

export interface ToolsInitResult {
  readonly registry: string;
  /** created = 新建注册面；updated = 在既有注册面上补登；unchanged = 无需写入；none = 没探测到可登记的工具，未写文件。 */
  readonly change: "created" | "updated" | "unchanged" | "none";
  readonly dry_run: boolean;
  readonly runner: string;
  readonly added: readonly { readonly id: string; readonly tool: string; readonly command: string; readonly version: string }[];
  readonly kept: readonly string[];
  readonly skipped: readonly { readonly tool: string; readonly reason: string }[];
  readonly uncovered: readonly string[];
}

/** 按锁文件选包管理器的执行前缀（只跑项目里装好的二进制，不临时下载）。 */
export function packageRunner(rootDir: string): string {
  if (existsSync(join(rootDir, "pnpm-lock.yaml"))) return "corepack pnpm exec";
  if (existsSync(join(rootDir, "yarn.lock"))) return "yarn";
  if (existsSync(join(rootDir, "bun.lockb")) || existsSync(join(rootDir, "bun.lock"))) return "bunx";
  return "npx --no-install";
}

function readPackageDeps(rootDir: string): Set<string> {
  const path = join(rootDir, "package.json");
  if (!existsSync(path)) return new Set();
  try {
    const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const names = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const block = pkg[field];
      if (block !== null && typeof block === "object") for (const name of Object.keys(block)) names.add(name);
    }
    return names;
  } catch {
    return new Set();
  }
}

function detect(tool: StarterTool, rootDir: string): DetectionResult | null {
  const decl = TRUSTED_BINDING_ADAPTERS[tool.adapterRef];
  const detector = decl?.detectorFor(tool.toolId) ?? null;
  return detector === null ? null : detector(platformDetectorFacts(rootDir));
}

function bindingFor(tool: StarterTool, runner: string, version: string): ToolBindingRecord {
  return {
    id: tool.id,
    source: "project",
    transport: "cli",
    adapter_ref: tool.adapterRef,
    tool: tool.toolId,
    tool_version_anchor: version,
    gate: tool.gate,
    gate_def: tool.gateDef,
    metric_dialect: tool.metricDialect,
    capabilities: [tool.capability],
    execution: { command: `${runner} ${tool.bin} ${tool.args}`, cwd: "." },
    report_contract: { format: tool.format, parser_ref: tool.parserRef, parser_version: PARSER_VERSION },
    environment: { requires: false },
    notes: `pomaster tools init 按项目声明的 ${tool.label} 生成；命令可按项目调整（报告格式要保持 ${tool.format}）`,
  } as ToolBindingRecord;
}

export function runToolsInit(rootDir: string, input: ToolsInitInput = {}): CommandOutcome<ToolsInitResult | null> {
  if (!existsSync(join(rootDir, ".pomaster"))) {
    return failOutcome("tools init", null, [{ code: "NOT_INITIALIZED", message: "找不到 .pomaster", hint: "先 pomaster init" }], ["tools init: FAILED — NOT_INITIALIZED"]);
  }
  const registryPath = toolsBindingsPath(rootDir);
  const present = existsSync(registryPath);
  let existing: ToolBindingRecord[] = [];
  if (present) {
    const loaded = loadToolBindingRegistry(rootDir);
    if (!loaded.ok) {
      return failOutcome("tools init", null, [loaded.error], [
        `tools init: FAILED — ${loaded.error.code}（既有注册面坏了，先修好再补登；本命令不覆盖它）`,
      ]);
    }
    existing = loaded.registry.bindings;
  }
  const existingIds = new Set(existing.map((binding) => binding.id));
  const existingTools = new Set(existing.map((binding) => binding.tool));
  const runner = packageRunner(rootDir);
  const added: ToolsInitResult["added"][number][] = [];
  const kept: string[] = [];
  const skipped: { tool: string; reason: string }[] = [];
  const fresh: ToolBindingRecord[] = [];
  let typecheckChosen = existing.some((binding) => binding.gate === "TYPECHECK");

  for (const tool of STARTER_TOOLS) {
    if (existingIds.has(tool.id) || existingTools.has(tool.toolId)) {
      kept.push(existing.find((binding) => binding.id === tool.id || binding.tool === tool.toolId)!.id);
      if (tool.gate === "TYPECHECK") typecheckChosen = true;
      continue;
    }
    const detection = detect(tool, rootDir);
    if (detection === null || detection.status !== "READY") {
      if (detection !== null && detection.status === "DRIFTED") {
        skipped.push({ tool: tool.label, reason: `版本漂移：声明 ${detection.expectedVersion}，探测到 ${detection.detectedVersion}` });
      }
      continue;
    }
    if (tool.gate === "TYPECHECK" && typecheckChosen) {
      skipped.push({ tool: tool.label, reason: "已有类型检查绑定（Vue 项目用 vue-tsc，它同时检查 .ts 与 .vue）" });
      continue;
    }
    if (detection.detectedVersion === null) {
      skipped.push({ tool: tool.label, reason: "声明的版本不是具体 semver（如 latest / workspace:*），版本锚取不到；写成具体版本后重跑" });
      continue;
    }
    const binding = bindingFor(tool, runner, detection.detectedVersion);
    fresh.push(binding);
    added.push({ id: binding.id, tool: tool.label, command: binding.execution.command ?? "", version: detection.detectedVersion });
    if (tool.gate === "TYPECHECK") typecheckChosen = true;
  }

  const deps = readPackageDeps(rootDir);
  const uncovered = UNCOVERED_SIGNALS
    .filter((signal) => (signal.deps ?? []).some((dep) => deps.has(dep)) || (signal.files ?? []).some((file) => existsSync(join(rootDir, file))))
    .map((signal) => signal.label);

  const change: ToolsInitResult["change"] = fresh.length === 0 ? (present ? "unchanged" : "none") : present ? "updated" : "created";
  const dryRun = input.dryRun === true;
  if (fresh.length > 0 && !dryRun) {
    mkdirSync(dirname(registryPath), { recursive: true });
    writeFileSync(registryPath, `${JSON.stringify({ version: 1, bindings: [...existing, ...fresh] }, null, 2)}\n`, "utf8");
  }

  const result: ToolsInitResult = { registry: TOOLS_BINDINGS_RELATIVE, change, dry_run: dryRun, runner, added, kept, skipped, uncovered };
  const verb = dryRun ? "将登记" : "已登记";
  const human = [
    `tools init → ${change.toUpperCase()}${dryRun ? "（--dry-run，未写文件）" : ""}：${TOOLS_BINDINGS_RELATIVE}（包管理器执行前缀 ${runner}）`,
    ...added.map((row) => `  ${verb} ${row.id}  ${row.tool}@${row.version}  ${row.command}`),
    ...kept.map((id) => `  保留 ${id}（注册面里已有，不改）`),
    ...skipped.map((row) => `  跳过 ${row.tool}：${row.reason}`),
    ...(uncovered.length > 0
      ? [`  探测到但没有受信 adapter、未登记：${uncovered.join("、")}——这些证明义务在 plan 里保持 REQUIRED 并记 tool_gap，不算通过`]
      : []),
    ...(change === "none"
      ? ["  没探测到可登记的工具（vitest、tsc / vue-tsc、eslint 在 package.json 里声明后重跑）；注册面保持缺席，没有替项目写空表"]
      : []),
    "  下一步：pomaster tools list 看六分态；pomaster plan compile --task <TASK> --face <kind>=present|absent:<依据>；qa 身份 pomaster plan run",
  ];
  return okOutcome("tools init", result, human);
}
