/**
 * tools.ts —— `pomaster tools list/validate` 命令面（W1-R1-4 切片；09-10 PRD §17
 * ToolBinding 统一注册面 + integration-designs.md 设计一 §2 六分态判定式）。
 *
 * 统一注册面（SP-W1-e 提案待 Owner 追认）：.pomaster/tools/bindings.json 单一文件
 * = 单一 schema（23-toolbinding）校验 + 单一 id 唯一性检查；kernel paths.ts
 * toolsBindingsPath 单一来源。装载 fail-closed：文件缺席 → TOOLBINDING_REGISTRY_ABSENT
 * （禁静默空表——C1 缺席显式）；损坏/词形违例/id 重复 → SCHEMA_INVALID。
 *
 * 六分态判定式（分态不可跃迁——每式独立评估，缺口逐条入 gaps）：
 * - detect    = 受信 adapter 单工具探测器（gauntlet-lite toolDetectors 同源；
 *               DetectionStatus 四态词表零扩值；未覆盖 tool → null 禁猜测）
 * - registered= schema 校验通过（装载闸）∧ adapter_ref ∈ 受信注册表 ∧ 版本锚非空
 * - validated = adapter 能力声明 ↔ binding report_contract 五键对账（纯函数）
 * - available = validated ∧ detect READY ∧ 可执行体探针命中 ∧ transport=cli（W1）
 *               ∧ 环境前置满足（requires=false 缺省，或 ENVREC 回执在座）
 * - selected  = --plan 计划工件 REQUIRED 项 resolved_tool 对账到本绑定 tool
 *               （计划工件面 = plan compile --json 输出可回喂；binding_id 专位
 *               = SP-W1-f 待建，对账键暂为 tool 词形——注记如实）
 * - executed  = evidence/runs/GRN-*.json 真实执行回执（tool+gate+binding_id 三键；
 *               同 tool+gate 缺 binding_id 留痕不算——工具发现≠调用授权）
 *
 * 红线锚：探测不能自行扩大 permit（本面零写零授权——执行入账唯一通路是 record
 * gate-run）；org 覆盖不静默压过项目批准（adoption 缺席由 schema fail-closed 拒）；
 * 不删旧 gate 配置路径（registry 缺席时 plan compile 回退 legacy 只读探测——兼容期
 * 并存，见 plan.ts 接缝注记）。命令名/词形/错误码 = SP 提案待追认（SP-W1-e/f/g）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as ajvModule from "ajv";
import type { ValidateFunction } from "ajv";
import {
  BINDING_ANNOTATION_PREFIX,
  bindingAdapterContractMatches,
  firstCommandToken,
  platformDetectorFacts,
  platformExecutableProbe,
  resolveTrustedBindingAdapter,
  type ExecutableProbeFn,
  type ToolBindingRecord,
} from "@pomaster/gauntlet-lite";
import { toolBindingSchema } from "@pomaster/schemas";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import {
  observationsDirPath,
  runsDirPath,
  toPosix,
  toolsBindingsPath,
  TOOLS_BINDINGS_RELATIVE,
} from "./store-layout.js";

// ============================================================
// registry 装载（fail-closed；schema 23 校验 + id 唯一性）
// ============================================================

export interface LoadedToolBindingRegistry {
  readonly path: string;
  readonly relativePath: string;
  readonly version: number;
  readonly bindings: ToolBindingRecord[];
}

export type RegistryLoad =
  | { readonly ok: true; readonly registry: LoadedToolBindingRegistry }
  | { readonly ok: false; readonly error: CliError };

function ajvCompile(schema: unknown): ValidateFunction {
  const AjvCtor = ajvModule.default as unknown as new (options?: {
    strict?: boolean;
    allErrors?: boolean;
  }) => ajvModule.default;
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  return ajv.compile(schema as object) as ValidateFunction;
}

/** registry 装载唯一入口（tools 命令与 plan 统一面接缝共用——禁第二套装载）。 */
export function loadToolBindingRegistry(rootDir: string): RegistryLoad {
  const absolutePath = toolsBindingsPath(rootDir);
  if (!existsSync(absolutePath)) {
    return {
      ok: false,
      error: {
        code: "TOOLBINDING_REGISTRY_ABSENT",
        message: `ToolBinding 统一注册面缺席：${TOOLS_BINDINGS_RELATIVE}（统一面在座才启用；缺席不是空表——禁静默）`,
        hint: "项目启用工具请在 .pomaster/tools/bindings.json 登记绑定（23-toolbinding schema 词形，SP-W1-e 提案待追认）；legacy *-gate.json 配置面不受影响（兼容期并存）。",
      },
    };
  }
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "SCHEMA_INVALID",
        message: `${TOOLS_BINDINGS_RELATIVE} 不可解析（损坏或手改）：${error instanceof Error ? error.message : String(error)}`,
        hint: "修复 JSON 语法或从 git 恢复；损坏 registry 不可静默当空表。",
      },
    };
  }
  const validate = ajvCompile(toolBindingSchema);
  if (!validate(document)) {
    const detail = (validate.errors ?? [])
      .map((entry) => `${entry.instancePath || "/"} ${entry.message ?? ""}`.trim())
      .slice(0, 8)
      .join("；");
    return {
      ok: false,
      error: {
        code: "SCHEMA_INVALID",
        message: `${TOOLS_BINDINGS_RELATIVE} 不合 23-toolbinding schema：${detail}`,
        hint: "按 schema 词形修正（source/transport 双轴闭包、execution.command|argv 二选一、org 必附 adoption）；SP-W1-e 提案面待 Owner 追认。",
      },
    };
  }
  const doc = document as { version?: unknown; bindings?: unknown };
  const bindingsRaw = Array.isArray(doc.bindings) ? doc.bindings : [];
  const seen = new Set<string>();
  for (const raw of bindingsRaw) {
    const id = (raw as { id?: unknown }).id;
    if (typeof id === "string") {
      if (seen.has(id)) {
        return {
          ok: false,
          error: {
            code: "SCHEMA_INVALID",
            message: `${TOOLS_BINDINGS_RELATIVE} 绑定 id 重复：${id}（统一注册面唯一性——draft-07 不可表达的跨条目约束由装载侧 fail-closed 补齐）`,
            hint: "合并或改名重复绑定；一个工具能力位只允许一条绑定占用一个 id。",
          },
        };
      }
      seen.add(id);
    }
  }
  return {
    ok: true,
    registry: {
      path: absolutePath,
      relativePath: TOOLS_BINDINGS_RELATIVE,
      version: typeof doc.version === "number" ? doc.version : 0,
      bindings: bindingsRaw as ToolBindingRecord[],
    },
  };
}

// ============================================================
// 六分态判定式（设计一 §2 逐式落地）
// ============================================================

/** 计划工件对账行（plan compile --json 输出 items 的最小消费面）。 */
export interface PlanItemRef {
  readonly resolved_tool: unknown;
  readonly applicability: unknown;
}

export interface BindingStateRow {
  readonly binding_id: string;
  readonly source: string;
  readonly transport: string;
  readonly adapter_ref: string;
  readonly adapter_key: string | null;
  readonly tool: string;
  readonly gate: string;
  readonly detect: boolean;
  readonly detect_status: string | null;
  readonly registered: boolean;
  readonly validated: boolean;
  readonly available: boolean;
  readonly selected: boolean;
  readonly executed: boolean;
  /** 分态阶梯最深处（detect→registered→validated→available 连续达成的末态）。 */
  readonly reached: "detect" | "registered" | "validated" | "available";
  /** executed 态对账到的 GRN（最大序号；证据指针）。 */
  readonly executed_grn: string | null;
  /** 未达态逐条缺口（detect/registered/validated/available 四式）。 */
  readonly gaps: readonly string[];
}

export interface BindingStatesDeps {
  readonly executableProbe?: ExecutableProbeFn;
  readonly planItems?: readonly PlanItemRef[];
}

interface DetectOutcome {
  readonly ok: boolean;
  readonly status: string | null;
  readonly gap: string | null;
}

/** detect 判定式：受信 adapter 单工具探测器（DetectionStatus 四态词表零扩值）。 */
function evaluateDetect(
  rootDir: string,
  binding: ToolBindingRecord,
): { decl: ReturnType<typeof resolveTrustedBindingAdapter>; outcome: DetectOutcome } {
  const decl = resolveTrustedBindingAdapter(binding.adapter_ref);
  if (decl === null) {
    return {
      decl,
      outcome: {
        ok: false,
        status: null,
        gap: `detect 未达：adapter_ref=${binding.adapter_ref} 不在受信 adapter 注册表（探测器缺位——禁猜测）`,
      },
    };
  }
  const detector = decl.detectorFor(binding.tool);
  if (detector === null) {
    return {
      decl,
      outcome: {
        ok: false,
        status: null,
        gap: `detect 未达：受信 adapter 未为 tool=${binding.tool} 提供探测器（detect 判定式缺席——禁猜测）`,
      },
    };
  }
  const detection = detector(platformDetectorFacts(rootDir));
  if (detection.status === "READY") {
    return { decl, outcome: { ok: true, status: "READY", gap: null } };
  }
  const detail =
    ("reason" in detection && typeof detection.reason === "string" && detection.reason.length > 0
      ? detection.reason
      : "evidence" in detection && typeof detection.evidence === "string"
        ? detection.evidence
        : "无详情");
  return {
    decl,
    outcome: {
      ok: false,
      status: detection.status,
      gap: `detect 未达（status=${detection.status}）：${detail}`,
    },
  };
}

/**
 * 绑定留痕整词匹配（三键对账的键完整性：裸 `includes` 是前缀开洞——点分 id 词形下
 * `binding_id=project.a.b` 会误认领 `binding_id=project.a.b.x` 的回执，binding_id 键
 * 退化为前缀键。「发现≠授权」的对账必须整词：命中位之后出现 id 词形续接字符
 * （字母/数字/下划线/点/连字符）即非本绑定留痕）。
 */
function noteAnnotatesBinding(note: string, annotation: string): boolean {
  let index = note.indexOf(annotation);
  while (index !== -1) {
    const after = note.charAt(index + annotation.length);
    if (after === "" || !/[A-Za-z0-9_.-]/.test(after)) {
      return true;
    }
    index = note.indexOf(annotation, index + 1);
  }
  return false;
}

/** executed 判定式：GRN 平面三键对账（tool+gate+binding_id——工具发现≠调用授权）。 */
function evaluateExecuted(
  rootDir: string,
  binding: ToolBindingRecord,
): { ok: boolean; grn: string | null } {
  const dir = runsDirPath(rootDir);
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return { ok: false, grn: null };
  }
  const annotation = `${BINDING_ANNOTATION_PREFIX}${binding.id}`;
  let best: { grn: string; seq: number } | null = null;
  for (const fileName of files) {
    const match = /^GRN-([0-9]+)\.json$/.exec(fileName);
    if (match === null) continue;
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(`${dir}/${fileName}`, "utf8"));
    } catch {
      continue; // 损坏 GRN 由 compact/record 通路 fail-closed 呈现——状态机不静默采信
    }
    const result =
      doc !== null && typeof doc === "object"
        ? ((doc as Record<string, unknown>).gate_result as
            | { result?: Record<string, unknown> }
            | undefined)?.result
        : undefined;
    const flat = doc as Record<string, unknown>;
    const tool = (result ?? flat)["tool"];
    const gate = (result ?? flat)["gate"];
    const note = ((result ?? flat)["scope"] as { note?: unknown } | undefined)?.note;
    if (
      tool === binding.tool &&
      gate === binding.gate &&
      typeof note === "string" &&
      noteAnnotatesBinding(note, annotation)
    ) {
      const seq = Number(match[1]);
      if (best === null || seq > best.seq) {
        best = { grn: `GRN-${match[1]}`, seq };
      }
    }
  }
  return { ok: best !== null, grn: best?.grn ?? null };
}

/** 六分态派生（纯读；I/O = 探测器事实源 + PATH 探针 + ENVREC/GRN 平面存在性）。 */
export function computeBindingStates(
  rootDir: string,
  bindings: readonly ToolBindingRecord[],
  deps: BindingStatesDeps = {},
): BindingStateRow[] {
  const probe = deps.executableProbe ?? platformExecutableProbe;
  return bindings.map((binding) => {
    const gaps: string[] = [];

    // —— registered：schema（装载闸已过）∧ 受信 adapter ∧ 版本锚非空 ——
    const decl = resolveTrustedBindingAdapter(binding.adapter_ref);
    const registered =
      decl !== null &&
      typeof binding.tool_version_anchor === "string" &&
      binding.tool_version_anchor.length > 0;
    if (decl === null) {
      gaps.push(
        `registered 未达：adapter_ref=${binding.adapter_ref} 不在受信注册表（绑定不得引用未接线 adapter）`,
      );
    }

    // —— validated：能力声明五键对账（纯函数） ——
    const contract = bindingAdapterContractMatches(binding);
    const validated = contract.ok;
    if (!contract.ok) {
      gaps.push(`validated 未达：${contract.reasons.join("；")}`);
    }

    // —— detect：单工具探测器四态 ——
    const detect = evaluateDetect(rootDir, binding);
    if (!detect.outcome.ok && detect.outcome.gap !== null) {
      gaps.push(detect.outcome.gap);
    }

    // —— available：validated ∧ detect ∧ transport=cli ∧ 探针命中 ∧ 环境前置 ——
    let available = validated && detect.outcome.ok;
    if (binding.transport !== "cli") {
      available = false;
      gaps.push(
        `available 未达：transport=${binding.transport} 消费通路未接线（W1 只 wired cli——mcp/ci/cloud 为 SP-W1-g 词位登记，非可执行承诺）`,
      );
    }
    let commandLine = "";
    if (typeof binding.execution?.command === "string" && binding.execution.command.length > 0) {
      commandLine = binding.execution.command;
    } else if (Array.isArray(binding.execution?.argv) && binding.execution.argv.length > 0) {
      commandLine = binding.execution.argv.join(" ");
    }
    if (validated && detect.outcome.ok) {
      if (commandLine.length === 0) {
        available = false;
        gaps.push("available 未达：execution 缺 command 且缺 argv（执行合同缺席禁猜测）");
      } else {
        const executable =
          binding.execution.executable ?? firstCommandToken(commandLine);
        if (probe(executable) === null) {
          available = false;
          gaps.push(
            `available 未达：可执行体探针缺席（${executable}）——安装工具或修正 execution.command/executable`,
          );
        }
      }
      const requires = binding.environment?.requires ?? false;
      if (requires) {
        const ref = binding.environment?.env_receipt_ref ?? "";
        const receiptPath = `${observationsDirPath(rootDir)}/${ref}.json`;
        if (ref.length === 0 || !existsSync(receiptPath)) {
          available = false;
          gaps.push(
            `available 未达：环境前置回执缺席（${ref || "ENVREC 词形缺席"} 不在 evidence/observations/）——ENVREC 回执由 perception 通路产出`,
          );
        }
      }
    }

    // —— selected：计划工件 REQUIRED 项 resolved_tool 对账（binding_id 专位 = SP-W1-f 待建） ——
    const selected =
      (deps.planItems ?? []).some(
        (item) =>
          item.resolved_tool === binding.tool &&
          item.applicability === "REQUIRED",
      ) && available;

    // —— executed：GRN 真实回执三键对账 ——
    const executed = evaluateExecuted(rootDir, binding);

    const ladder: BindingStateRow["reached"][] = ["detect", "registered", "validated", "available"];
    const flags = [detect.outcome.ok, registered, validated, available];
    let reached: BindingStateRow["reached"] = "detect";
    for (let index = ladder.length - 1; index >= 0; index -= 1) {
      const rung = ladder[index];
      if (rung !== undefined && flags[index] === true) {
        reached = rung;
        break;
      }
    }

    return {
      binding_id: binding.id,
      source: binding.source,
      transport: binding.transport,
      adapter_ref: binding.adapter_ref,
      adapter_key: decl?.adapterKey ?? null,
      tool: binding.tool,
      gate: binding.gate,
      detect: detect.outcome.ok,
      detect_status: detect.outcome.status,
      registered,
      validated,
      available,
      selected,
      executed: executed.ok,
      reached,
      executed_grn: executed.grn,
      gaps,
    } satisfies BindingStateRow;
  });
}

// ============================================================
// 命令面：tools list / tools validate
// ============================================================

export interface ToolsListResult {
  readonly registry_path: string;
  readonly registry_version: number;
  readonly bindings: readonly BindingStateRow[];
  readonly counts: {
    readonly total: number;
    readonly registered: number;
    readonly validated: number;
    readonly available: number;
    readonly selected: number;
    readonly executed: number;
  };
}

export interface ToolsValidateResult {
  readonly binding_id: string;
  readonly states: BindingStateRow;
  readonly registry_path: string;
}

function loadPlanItems(
  planFile: string,
): { items: readonly PlanItemRef[] } | { error: CliError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(planFile, "utf8"));
  } catch (error) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--plan 计划工件不可读/不可解析：${planFile}（${error instanceof Error ? error.message : String(error)}）`,
        hint: "计划工件 = pomaster plan compile --json 输出（{items:[...]}）；selected 对账消费 resolved_tool/applicability 两键。",
      },
    };
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--plan 计划工件缺 items 数组：${planFile}（selected 判定式的对账分母缺席——禁静默当零项）`,
        hint: "回喂 pomaster plan compile --json 的完整输出即可（顶层 items 数组）。",
      },
    };
  }
  return { items: items as readonly PlanItemRef[] };
}

function stateLine(row: BindingStateRow): string {
  const flags = [
    `detect=${row.detect ? (row.detect_status ?? "yes") : "no"}`,
    `registered=${row.registered ? "yes" : "no"}`,
    `validated=${row.validated ? "yes" : "no"}`,
    `available=${row.available ? "yes" : "no"}`,
    `selected=${row.selected ? "yes" : "no"}`,
    `executed=${row.executed ? `yes(${row.executed_grn ?? ""})` : "no"}`,
  ].join(" ");
  const gaps = row.gaps.length === 0 ? "" : `\n      gaps: ${row.gaps.join("；")}`;
  return `    [${row.reached}] ${row.binding_id} · ${row.source}/${row.transport} · ${row.tool} @ ${row.gate} · ${flags}${gaps}`;
}

export interface ToolsListInput {
  readonly plan?: string;
}

export async function runToolsList(
  rootDir: string,
  input: ToolsListInput,
): Promise<CommandOutcome<ToolsListResult>> {
  const command = "tools list";
  const loaded = loadToolBindingRegistry(rootDir);
  if (!loaded.ok) {
    return failOutcome(command, {
      registry_path: toolsBindingsPath(rootDir),
      registry_version: 0,
      bindings: [],
      counts: { total: 0, registered: 0, validated: 0, available: 0, selected: 0, executed: 0 },
    } satisfies ToolsListResult, [loaded.error], [
      `${command}: FAILED — ${loaded.error.code}\n  hint: ${loaded.error.hint}`,
    ]);
  }
  let planItems: readonly PlanItemRef[] = [];
  if (input.plan !== undefined) {
    const loadedPlan = loadPlanItems(input.plan);
    if ("error" in loadedPlan) {
      return failOutcome(command, {
        registry_path: loaded.registry.path,
        registry_version: loaded.registry.version,
        bindings: [],
        counts: { total: 0, registered: 0, validated: 0, available: 0, selected: 0, executed: 0 },
      } satisfies ToolsListResult, [loadedPlan.error], [
        `${command}: FAILED — ${loadedPlan.error.code}\n  hint: ${loadedPlan.error.hint}`,
      ]);
    }
    planItems = loadedPlan.items;
  }
  const rows = computeBindingStates(rootDir, loaded.registry.bindings, {
    ...(planItems.length > 0 ? { planItems } : {}),
  });
  const result: ToolsListResult = {
    registry_path: loaded.registry.path,
    registry_version: loaded.registry.version,
    bindings: rows,
    counts: {
      total: rows.length,
      registered: rows.filter((row) => row.registered).length,
      validated: rows.filter((row) => row.validated).length,
      available: rows.filter((row) => row.available).length,
      selected: rows.filter((row) => row.selected).length,
      executed: rows.filter((row) => row.executed).length,
    },
  };
  const human = [
    `tools list → ${result.counts.total} 绑定（registered ${result.counts.registered} / validated ${result.counts.validated} / available ${result.counts.available} / selected ${result.counts.selected} / executed ${result.counts.executed}）— ${toPosix(TOOLS_BINDINGS_RELATIVE)}`,
    "  六分态判定式（SP-W1-e/f/g 提案待 Owner 追认；探测不扩大 permit——executed 唯一事实源 = GRN 真实回执）:",
    ...rows.map(stateLine),
  ];
  return okOutcome(command, result, human);
}

export interface ToolsValidateInput {
  readonly id: string;
  readonly plan?: string;
}

export async function runToolsValidate(
  rootDir: string,
  input: ToolsValidateInput,
): Promise<CommandOutcome<ToolsValidateResult>> {
  const command = "tools validate";
  const loaded = loadToolBindingRegistry(rootDir);
  if (!loaded.ok) {
    return failOutcome(command, {
      binding_id: input.id,
      states: {
        binding_id: input.id,
        source: "",
        transport: "",
        adapter_ref: "",
        adapter_key: null,
        tool: "",
        gate: "",
        detect: false,
        detect_status: null,
        registered: false,
        validated: false,
        available: false,
        selected: false,
        executed: false,
        reached: "detect",
        executed_grn: null,
        gaps: [],
      } satisfies BindingStateRow,
      registry_path: toolsBindingsPath(rootDir),
    } satisfies ToolsValidateResult, [loaded.error], [
      `${command}: FAILED — ${loaded.error.code}\n  hint: ${loaded.error.hint}`,
    ]);
  }
  const binding = loaded.registry.bindings.find((candidate) => candidate.id === input.id);
  if (binding === undefined) {
    return failOutcome(command, {
      binding_id: input.id,
      states: {
        binding_id: input.id,
        source: "",
        transport: "",
        adapter_ref: "",
        adapter_key: null,
        tool: "",
        gate: "",
        detect: false,
        detect_status: null,
        registered: false,
        validated: false,
        available: false,
        selected: false,
        executed: false,
        reached: "detect",
        executed_grn: null,
        gaps: [],
      } satisfies BindingStateRow,
      registry_path: loaded.registry.path,
    } satisfies ToolsValidateResult, [
      {
        code: "BINDING_NOT_FOUND",
        message: `绑定不在册：${input.id}（registry 分母 ${loaded.registry.bindings.length} 条；缺席显式非空结果）`,
        hint: "核对 id 词形（点分小写）；pomaster tools list 查全量分母。",
      },
    ], [
      `${command}: FAILED — BINDING_NOT_FOUND\n  hint: 核对绑定 id；pomaster tools list 查全量分母。`,
    ]);
  }
  let planItems: readonly PlanItemRef[] = [];
  if (input.plan !== undefined) {
    const loadedPlan = loadPlanItems(input.plan);
    if ("error" in loadedPlan) {
      return failOutcome(command, {
        binding_id: input.id,
        states: {
          binding_id: input.id,
          source: "",
          transport: "",
          adapter_ref: "",
          adapter_key: null,
          tool: "",
          gate: "",
          detect: false,
          detect_status: null,
          registered: false,
          validated: false,
          available: false,
          selected: false,
          executed: false,
          reached: "detect",
          executed_grn: null,
          gaps: [],
        } satisfies BindingStateRow,
        registry_path: loaded.registry.path,
      } satisfies ToolsValidateResult, [loadedPlan.error], [
        `${command}: FAILED — ${loadedPlan.error.code}\n  hint: ${loadedPlan.error.hint}`,
      ]);
    }
    planItems = loadedPlan.items;
  }
  const rows = computeBindingStates(rootDir, [binding], {
    ...(planItems.length > 0 ? { planItems } : {}),
  });
  const row = rows[0];
  if (row === undefined) {
    // 不可达防线（单绑定输入必产单行）——fail-closed 显式拒绝非静默空态。
    return failOutcome(command, {
      binding_id: input.id,
      states: {
        binding_id: input.id,
        source: "",
        transport: "",
        adapter_ref: "",
        adapter_key: null,
        tool: "",
        gate: "",
        detect: false,
        detect_status: null,
        registered: false,
        validated: false,
        available: false,
        selected: false,
        executed: false,
        reached: "detect",
        executed_grn: null,
        gaps: [],
      } satisfies BindingStateRow,
      registry_path: loaded.registry.path,
    } satisfies ToolsValidateResult, [
      {
        code: "KERNEL_ERROR",
        message: `状态机内部缺陷：单绑定 ${input.id} 产出零行（不可达路径）`,
        hint: "请携带 registry 文件与命令行复现上报（状态机分态派生缺陷）。",
      },
    ], [`${command}: FAILED — KERNEL_ERROR（状态机内部缺陷）`]);
  }
  const result: ToolsValidateResult = {
    binding_id: input.id,
    states: row,
    registry_path: loaded.registry.path,
  };
  const human = [
    `tools validate → ${input.id}（reached=${row.reached}；六分态逐项——分态不可跃迁）`,
    stateLine(row),
    "  判定式：detect=探测器四态；registered=schema∧受信 adapter∧锚非空；validated=能力五键对账；available=validated∧detect∧cli∧探针∧ENVREC；selected=计划工件对账；executed=GRN 三键回执（SP 提案待追认）",
  ];
  return okOutcome(command, result, human);
}
