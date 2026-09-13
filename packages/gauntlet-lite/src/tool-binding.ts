/**
 * tool-binding.ts —— ToolBinding 统一注册面的执行半边（W1-R1-4 切片；09-10 PRD §17
 * ToolBinding 目标产品合同 + integration-designs.md 设计一 Vitest 闭环）。
 *
 * 职责面（设计一 §1/§2 的机器化；schema 侧镜像 = packages/schemas/assets/
 * 23-toolbinding.schema.json，SP-W1-e 提案待 Owner 追认）：
 * - TRUSTED_BINDING_ADAPTERS：受信 adapter 注册表——绑定 adapter_ref 的唯一解析面
 *   （「注册究竟是四件事」之 Adapter 注册）。绑定只允许引用发行包受信 adapter；
 *   catalog/tools/ 文件名枚举与任意脚本热加载均不是注册面（红线：禁止任意脚本
 *   热加载进 kernel / 判卷核心）。本表是 schema adapter_ref 枚举的运行时对照面
 *   （防御纵深：schema 闭包漂移时 runtime 仍 fail-closed）。
 * - bindingAdapterContractMatches：validated 判定式核心（纯函数零 I/O）——binding
 *   的 tool/capabilities/report_contract 五键必须落在受信 adapter 能力声明闭包内
 *   （能力冒领/口径漂移/自定义 parser 未登记三类防线；parser 能力测试 =
 *   test/tool-binding.spec.ts 即登记）。
 * - runBindingGate：绑定式执行唯一通路——沿 §59 adapter 管线（prepare→run→
 *   normalize），binding 只供执行面参数（command/argv、cwd、timeout_ms、
 *   env_allowlist），不另起执行器、不改判卷语义；工具发现≠调用授权（executed 态
 *   必须有真实执行回执——GRN 入账归 record gate-run 既有显式入口，本函数不落账、
 *   不写 evidence 平面）。
 * - allowlistSpawn：SP-W1-h 环境白名单执行面（声明即收敛子进程环境；只在绑定通路
 *   生效——既有腿默认 spawn 零行为变更）。白名单键大小写不敏感（Windows
 *   process.env "Path" vs "PATH"），透传时保留原键形。
 *
 * 留痕词形：scope.note 前缀 `binding_id=<id>`（BINDING_ANNOTATION_PREFIX）=
 * SP-W1-f 提案的过渡形态——executed 态判定据此对 GRN 平面做 tool+gate+binding_id
 * 三键对账；03 schema binding_ref 专位待 Owner 追认后随 W2 修订落位。
 *
 * 词形纪律：本模块一切字段名/闭包/前缀 = SP 提案待追认；DetectionStatus 四态词表
 * 已锁（vocab-lock presentation_axes.tool_detection_status），本模块零扩值。
 */
import { spawnSync } from "node:child_process";
import { isAbsolute, join as pathJoin, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type {
  DetectionResult,
  DetectorFacts,
  ExecutableProbeFn,
  GateAdapter,
  GateDenominatorRefInput,
  GatePlan,
  GatePolicy,
  GateResultRecord,
  GateScope,
  SpawnFn,
  ToolRunOutput,
} from "./adapter-types.js";
import { GateAdapterError, SPAWN_MAX_BUFFER_BYTES } from "./adapter-types.js";
import {
  createBuildAdapter,
  VITEST_TOOL_ID,
} from "./build-adapter.js";
import { PYTEST_TOOL_ID } from "./pytest-leg.js";
import {
  createLintAdapter,
  createTypecheckAdapter,
  ESLINT_TOOL_ID,
  ESLINT_JSON_FORMAT,
  LINT_ADAPTER_REF,
  LINT_METRIC_DIALECT,
  LINT_PARSER_REF,
  TSC_TEXT_FORMAT,
  TSC_TOOL_ID,
  TYPECHECK_ADAPTER_REF,
  TYPECHECK_METRIC_DIALECT,
  TYPECHECK_PARSER_REF,
  VUE_TSC_TOOL_ID,
} from "./typecheck-lint-adapter.js";
import { firstCommandToken, platformExecutableProbe, stripQuotesFromPathEnv } from "./detectors.js";

// ============================================================
// 绑定记录面（schema 23 的 TS 运行时镜像；形状纪律见模块头注）
// ============================================================

/** 执行合同（SP-W1-h 提案：command 单串 legacy 词形 ∥ argv 结构化词形二选一）。 */
export interface ToolBindingExecution {
  readonly command?: string;
  readonly argv?: readonly string[];
  readonly cwd?: string;
  readonly timeout_ms?: number;
  readonly env_allowlist?: readonly string[];
  readonly output_roots?: readonly string[];
  readonly executable?: string;
}

/** 报告合同（validated 判定式对照面）。 */
export interface ToolBindingReportContract {
  readonly format: string;
  readonly parser_ref: string;
  readonly parser_version: string;
  readonly attachment_dimensions?: readonly string[];
}

/** 执行环境前置（available 判定式分项）。 */
export interface ToolBindingEnvironment {
  readonly requires: boolean;
  readonly env_receipt_ref?: string;
}

/** org 采用批准（source=org 必填——org 覆盖不静默压过项目批准）。 */
export interface ToolBindingAdoption {
  readonly approved_by: string;
  readonly note?: string;
}

/** 一条工具绑定（23-toolbinding schema binding 定义的运行时镜像）。 */
export interface ToolBindingRecord {
  readonly id: string;
  readonly source: "built_in" | "project" | "org";
  readonly transport: "cli" | "mcp" | "ci" | "cloud";
  readonly adapter_ref: string;
  readonly tool: string;
  readonly tool_version_anchor: string;
  readonly gate: string;
  readonly gate_def: string;
  readonly metric_dialect: string;
  readonly capabilities: readonly string[];
  readonly execution: ToolBindingExecution;
  readonly report_contract: ToolBindingReportContract;
  readonly evidence_targets?: readonly string[];
  readonly environment?: ToolBindingEnvironment;
  readonly adoption?: ToolBindingAdoption;
  readonly notes?: string;
}

// ============================================================
// 受信 adapter 注册表（绑定 adapter_ref 唯一解析面）
// ============================================================

/** 受信 adapter 能力声明（validated 判定式与 detect 判定式的对照面）。 */
export interface TrustedBindingAdapterDecl {
  /** adapter_ref 词形（schema 23 adapter_ref 枚举成员）。 */
  readonly ref: string;
  /** gateAdapters 键形（状态机呈现/来源留痕用）。 */
  readonly adapterKey: string;
  /** 受信执行半边（prepare/run/normalize——detect 走 detectorFor 单工具口径）。 */
  readonly createAdapter: () => Pick<
    GateAdapter<DetectionResult, GatePlan, ToolRunOutput>,
    "prepare" | "run" | "normalize"
  >;
  /** 能力声明闭包（binding.capabilities ⊆ 本集才算 validated；宁少勿多——W1 wired 最小诚实声明）。 */
  readonly capabilities: readonly string[];
  /** 报告格式闭包（report_contract.format ∈ 本集）。 */
  readonly accepted_formats: readonly string[];
  /** parser 引用闭包（自定义 parser 须登记版本与能力测试后才可入集）。 */
  readonly accepted_parser_refs: readonly string[];
  /** 口径闭包（metric_dialect ∈ 本集——口径漂移防线）。 */
  readonly accepted_metric_dialects: readonly string[];
  /** 工具身份闭包（binding.tool ∈ 本集——绑定身份与 adapter 实际执行者对账）。 */
  readonly accepted_tool_ids: readonly string[];
  /** 单工具探测器（detect 判定式 = DetectionStatus 四态词表；未覆盖 tool → null 禁猜测）。 */
  readonly detectorFor: (
    toolId: string,
  ) => ((facts: DetectorFacts) => DetectionResult) | null;
}

/** W1 wired 集：builtin.gauntlet-lite.build（BUILD 门禁 vitest/pytest 双腿）。 */
const BUILD_DECL: TrustedBindingAdapterDecl = {
  ref: "builtin.gauntlet-lite.build",
  adapterKey: "build",
  createAdapter: () => createBuildAdapter(),
  // 能力声明 = W1 wired 闭环最小诚实集（load_test 等归 PERFORMANCE 专项 adapter——
  // 冒领即防线失效；扩声明走受信注册表修订，禁绑定侧自扩）。
  capabilities: ["unit_behavior"],
  accepted_formats: ["vitest-json-stdout", "pytest-junit-xml"],
  accepted_parser_refs: [
    "builtin.gauntlet-lite.build/vitest-json",
    "builtin.gauntlet-lite.build/pytest-junit",
  ],
  accepted_metric_dialects: ["test:assertion_count"],
  accepted_tool_ids: [VITEST_TOOL_ID, PYTEST_TOOL_ID],
  detectorFor: (toolId) => {
    if (toolId !== VITEST_TOOL_ID && toolId !== PYTEST_TOOL_ID) {
      return null;
    }
    return (facts) => {
      const detection = createBuildAdapter().detect(facts);
      return toolId === VITEST_TOOL_ID ? detection.vitest : detection.pytest;
    };
  },
};

/** W3-S2 wired 集：builtin.gauntlet-lite.typecheck（tsc/vue-tsc 文本诊断腿）。 */
const TYPECHECK_DECL: TrustedBindingAdapterDecl = {
  ref: TYPECHECK_ADAPTER_REF,
  adapterKey: "typecheck",
  createAdapter: () => createTypecheckAdapter(),
  // 能力声明 = 静态分析最小诚实集（capability 词 static_analysis 为 SP 提案，
  // kernel + schema 23 同批扩词；冒领即防线失效，扩声明走受信注册表修订）。
  capabilities: ["static_analysis"],
  accepted_formats: [TSC_TEXT_FORMAT],
  accepted_parser_refs: [TYPECHECK_PARSER_REF],
  accepted_metric_dialects: [TYPECHECK_METRIC_DIALECT],
  accepted_tool_ids: [TSC_TOOL_ID, VUE_TSC_TOOL_ID],
  detectorFor: (toolId) => {
    if (toolId !== TSC_TOOL_ID && toolId !== VUE_TSC_TOOL_ID) {
      return null;
    }
    return (facts) => {
      const detection = createTypecheckAdapter().detect(facts);
      return toolId === TSC_TOOL_ID ? detection.tsc : detection.vueTsc;
    };
  },
};

/** W3-S2 wired 集：builtin.gauntlet-lite.lint（ESLint JSON formatter 腿——禁 --fix）。 */
const LINT_DECL: TrustedBindingAdapterDecl = {
  ref: LINT_ADAPTER_REF,
  adapterKey: "lint",
  createAdapter: () => createLintAdapter(),
  capabilities: ["static_analysis"],
  accepted_formats: [ESLINT_JSON_FORMAT],
  accepted_parser_refs: [LINT_PARSER_REF],
  accepted_metric_dialects: [LINT_METRIC_DIALECT],
  accepted_tool_ids: [ESLINT_TOOL_ID],
  detectorFor: (toolId) => {
    if (toolId !== ESLINT_TOOL_ID) {
      return null;
    }
    return (facts) => createLintAdapter().detect(facts);
  },
};

/**
 * 受信 adapter 注册表（adapter_ref → 声明）。增长通道 = 发行包代码 + schema 23
 * adapter_ref 枚举同批修订（SP-W1-e；禁绑定侧自造 ref）。W3-S2 起含 TS 族双
 * adapter（typecheck / lint）——旧 BUILD 选择器原样保留（兼容并存红线）。
 */
export const TRUSTED_BINDING_ADAPTERS: Readonly<Record<string, TrustedBindingAdapterDecl>> = {
  [BUILD_DECL.ref]: BUILD_DECL,
  [TYPECHECK_DECL.ref]: TYPECHECK_DECL,
  [LINT_DECL.ref]: LINT_DECL,
};

/** adapter_ref 解析（未知 ref → null——调用方 fail-closed，禁静默当可执行）。 */
export function resolveTrustedBindingAdapter(
  adapterRef: string,
): TrustedBindingAdapterDecl | null {
  return TRUSTED_BINDING_ADAPTERS[adapterRef] ?? null;
}

// ============================================================
// validated 判定式（纯函数）
// ============================================================

export type BindingContractMatch =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * validated 判定式核心：binding 与受信 adapter 能力声明的五键对账
 * （adapter_ref / tool / capabilities / report_contract.format / parser_ref /
 * metric_dialect）。零 I/O——I/O 侧探测（detect/probe/ENVREC）在 CLI 状态机。
 */
export function bindingAdapterContractMatches(
  binding: ToolBindingRecord,
): BindingContractMatch {
  const reasons: string[] = [];
  const decl = resolveTrustedBindingAdapter(binding.adapter_ref);
  if (decl === null) {
    reasons.push(
      `adapter_ref=${binding.adapter_ref} 不在受信 adapter 注册表（绑定不得引用未接线 adapter——探测/登记不能自行扩大 permit）`,
    );
  } else {
    if (!decl.accepted_tool_ids.includes(binding.tool)) {
      reasons.push(
        `tool=${binding.tool} 越受信工具闭包（${decl.accepted_tool_ids.join("/")}）——绑定工具身份必须与 adapter 实际执行者对账`,
      );
    }
    const unknownCapabilities = binding.capabilities.filter(
      (capability) => !decl.capabilities.includes(capability),
    );
    if (unknownCapabilities.length > 0) {
      reasons.push(
        `capabilities=[${unknownCapabilities.join("/")}] 越受信 adapter 能力声明（${decl.capabilities.join("/")}）——能力冒领防线`,
      );
    }
    const format = String(binding.report_contract?.format ?? "");
    if (!decl.accepted_formats.includes(format)) {
      reasons.push(
        `report_contract.format=${format} 越受信格式闭包（${decl.accepted_formats.join("/")}）`,
      );
    }
    const parserRef = String(binding.report_contract?.parser_ref ?? "");
    if (!decl.accepted_parser_refs.includes(parserRef)) {
      reasons.push(
        `report_contract.parser_ref=${parserRef} 越受信 parser 闭包（${decl.accepted_parser_refs.join("/")}）——自定义 parser 必须登记版本与能力测试`,
      );
    }
    const dialect = String(binding.metric_dialect ?? "");
    if (!decl.accepted_metric_dialects.includes(dialect)) {
      reasons.push(
        `metric_dialect=${dialect} 越受信口径闭包（${decl.accepted_metric_dialects.join("/")}）——口径漂移防线`,
      );
    }
  }
  if (reasons.length === 0) {
    return { ok: true };
  }
  return { ok: false, reasons };
}

// ============================================================
// allowlistSpawn（SP-W1-h 环境白名单执行面）
// ============================================================

/**
 * 白名单 spawn：只透传 allowlist 内的变量（大小写不敏感匹配，原键形保留），其余
 * 全部滤除。声明即收敛——绑定通路专用；既有腿默认 spawn（defaultSpawn 全量环境
 * + PATH 消毒）零行为变更。PATH 引号消毒沿用（phaseC 附录 A 教训）。
 */
export function allowlistSpawn(allowlist: readonly string[]): SpawnFn {
  const lowered = new Set(
    [...allowlist].map((key) => key.trim().toLowerCase()).filter((key) => key.length > 0),
  );
  return (command, options) => {
    const startedAt = performance.now();
    const env: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (lowered.has(key.toLowerCase())) {
        env[key] = value;
      }
    }
    const res = spawnSync(command, {
      shell: true,
      cwd: options.cwd,
      timeout: options.timeoutMs,
      encoding: "utf8",
      maxBuffer: SPAWN_MAX_BUFFER_BYTES,
      windowsHide: true,
      env: stripQuotesFromPathEnv(env),
    });
    const externalMs = Math.max(0, Math.round(performance.now() - startedAt));
    return {
      status: res.status,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      error: res.error?.message ?? null,
      externalMs,
    };
  };
}

// ============================================================
// runBindingGate（绑定式执行——沿 §59 adapter 管线）
// ============================================================

/** scope.note 绑定留痕前缀（SP-W1-f 提案词形；executed 态对账键）。 */
export const BINDING_ANNOTATION_PREFIX = "binding_id=";

/** 绑定式执行的运行上下文（GRN/seq 由编排层供给——本函数不落账不分配号）。 */
export interface BindingGateContext {
  readonly projectRoot: string;
  readonly grn: string;
  readonly ranAtSeq: number;
  readonly subjectId?: string;
  readonly denominatorRefs?: readonly GateDenominatorRefInput[];
  readonly trigger?: GatePolicy["trigger"];
}

/** 测试/编排注入面（缺省 = 真实 PATH 探针 + adapter 默认 spawn）。 */
export interface BindingGateDeps {
  readonly spawnFn?: SpawnFn;
  readonly executableProbe?: ExecutableProbeFn;
}

export interface BindingGateOutcome {
  readonly binding_id: string;
  /** 绑定执行面覆盖后的计划（adapter prepare 产物 + binding command/cwd 覆写）。 */
  readonly plan: GatePlan;
  /** 归一记录（含 scope.note 绑定留痕；GRN 入账归编排层 record gate-run 通路）。 */
  readonly record: GateResultRecord;
}

/** 绑定执行合同解析（command ∥ argv；两缺席 = schema anyOf 违例的热路径防线）。 */
function resolveCommandLine(execution: ToolBindingExecution): string {
  if (typeof execution.command === "string" && execution.command.trim().length > 0) {
    return execution.command;
  }
  if (Array.isArray(execution.argv) && execution.argv.length > 0) {
    return execution.argv.join(" ");
  }
  throw new GateAdapterError(
    "runner_not_ready",
    "绑定 execution 缺 command 且缺 argv（schema 23 anyOf 违例——执行合同缺席禁猜测）",
    "补齐 execution.command（单串词形）或 execution.argv（SP-W1-h 结构化词形）后重试",
  );
}

/**
 * 绑定式执行唯一通路。前置闸（fail-closed → GateAdapterError，编排层按
 * gate-recipe-runner 惯例转 not_run）：
 * ① adapter_ref ∈ 受信注册表；② validated 判定式五键对账；③ 可执行体探针命中
 * （工具发现≠调用授权——探针只证「在座」，调用授权由 GRN 回执留痕闭环）。
 * 通过后沿 adapter 管线 prepare→run→normalize，binding 只覆写执行面
 * （command/cwd/timeout/env），判卷语义零改动；记录尾附 scope.note 绑定留痕。
 */
export function runBindingGate(
  binding: ToolBindingRecord,
  context: BindingGateContext,
  deps: BindingGateDeps = {},
): BindingGateOutcome {
  const decl = resolveTrustedBindingAdapter(binding.adapter_ref);
  if (decl === null) {
    throw new GateAdapterError(
      "runner_not_ready",
      `binding ${binding.id} 的 adapter_ref=${binding.adapter_ref} 不在受信 adapter 注册表（禁止任意脚本热加载进判卷核心）`,
      `改用受信 adapter_ref（wired 集 = ${Object.keys(TRUSTED_BINDING_ADAPTERS).join(" / ")}）；新 adapter 走发行包 + schema 23 枚举同批修订`,
    );
  }
  const contract = bindingAdapterContractMatches(binding);
  if (!contract.ok) {
    throw new GateAdapterError(
      "runner_not_ready",
      `binding ${binding.id} validated 判定式未达：${contract.reasons.join("；")}`,
      "按 reason 修正绑定字段，或先完成 parser 能力测试与受信注册（test-tool-integration.md §矩阵）",
    );
  }

  const commandLine = resolveCommandLine(binding.execution);
  const executable = binding.execution.executable ?? firstCommandToken(commandLine);
  const probe = (deps.executableProbe ?? platformExecutableProbe)(executable);
  if (probe === null) {
    throw new GateAdapterError(
      "runner_not_ready",
      `binding ${binding.id} 可执行体探针缺席：${executable}（available 判定式前置——在座性不可猜测）`,
      "安装该工具或修正 binding.execution.command/executable 后重跑",
    );
  }

  const adapter = decl.createAdapter();
  const policy: GatePolicy = {
    grn: context.grn,
    ranAtSeq: context.ranAtSeq,
    ...(context.trigger !== undefined ? { trigger: context.trigger } : {}),
    ...(binding.execution.timeout_ms !== undefined
      ? { timeoutMs: binding.execution.timeout_ms }
      : {}),
    expectedToolVersion: binding.tool_version_anchor,
  };
  const scope: GateScope = {
    projectRoot: context.projectRoot,
    ...(context.subjectId !== undefined ? { subjectId: context.subjectId } : {}),
    ...(context.denominatorRefs !== undefined ? { denominatorRefs: context.denominatorRefs } : {}),
  };

  let plan = adapter.prepare(scope, policy);
  const cwd =
    binding.execution.cwd === undefined || binding.execution.cwd.length === 0
      ? context.projectRoot
      : isAbsolute(binding.execution.cwd)
        ? resolve(binding.execution.cwd)
        : pathJoin(resolve(context.projectRoot), binding.execution.cwd);
  // 绑定执行面覆写（不另起执行器——adapter 管线消费 binding 参数；判卷语义不动）。
  plan = { ...plan, command: commandLine, cwd };
  // SP-W1-h：绑定声明 env_allowlist 即收敛子进程环境（声明即授权面——deps.spawnFn
  // 注入只在其未声明时生效；白名单是绑定合同的一部分，禁被调用方旁路）。
  const spawnFn =
    binding.execution.env_allowlist !== undefined &&
    binding.execution.env_allowlist.length > 0
      ? allowlistSpawn(binding.execution.env_allowlist)
      : deps.spawnFn;
  const raw = adapter.run(plan, spawnFn);
  // Q3 双向耦合：subjectId 前缀 TEST.* ⇔ isFixture=true（browser-legs.ts:155 同款镜像——
  // 违者 assertCommonGates FATAL，与既有腿同一判卷纪律）。
  const record = adapter.normalize(raw, {
    declaredVerdict: null,
    isFixture: plan.subjectId !== null && plan.subjectId.startsWith("TEST."),
  });
  // SP-W1-f 过渡留痕：scope.note 尾附 binding_id=<id>（03 binding_ref 专位待 Owner 追认）。
  const annotation = `${BINDING_ANNOTATION_PREFIX}${binding.id}`;
  const stamped: GateResultRecord = {
    ...record,
    scopeNote:
      record.scopeNote === undefined ? annotation : `${record.scopeNote}；${annotation}`,
  };
  return { binding_id: binding.id, plan, record: stamped };
}
