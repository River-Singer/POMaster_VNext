/**
 * plan.ts —— `pomaster plan compile` 命令面（W1-R1-3 切片；09-10 PRD REQ-04 /
 * AC-03 / AC-13 + test-planning-and-reporting.md §2）。
 *
 * 命令：compile —— 逐 Acceptance 编译 Verification Plan（义务/工具/靶/环境/
 * applicability 三值/依据全字段落盘；无法判断的影响面保留 unknown 禁默认 N/A；
 * 缺工具 ≠ N/A——REQUIRED 保持 + tool_gap）。判卷权威在 kernel plan-compiler.ts
 * （纯函数编译核）；本模块只做事实生产（store 读、工具探测、argv 收敛）与呈现。
 *
 * 输入两通道（互斥）：
 * - --task <TASK.*>：验收义务住 task payload.acceptance（criterion/claim 行 +
 *   可选自由区 requires/exclusions）；纯读零写入（buildStorePaths + readRawIndex
 *   同一装载面——negative-history search/view/audit「纯读零建账」先例）；
 * - --input <file>：kernel VerificationPlanInput 契约 JSON 直传（整契约由文件
 *   承载——未初始化目录也可用，零 store 依赖）。
 *
 * 变更面事实：--changed/--consumer/--face（"kind=present|absent:<依据>"）显式
 * 申报——禁猜测（face 词形闭包=SP 提案待追认，TODO(vocab-pr)）。
 * 工具探测自动面：vitest / playwright（@playwright/test + browser-gate.json 在位性）
 * / chrome-devtools-mcp（.mcp.json 注册）——gauntlet-lite toolDetectors 形态的只读
 * 等价，缺席如实 NOT 在位（禁猜测）；ToolBinding 统一面 = R1-4 接缝。
 * informational（--complexity/--profile/--note）：只呈现零参与 applicability
 * （A1 裁定 projection.ts:220 先例——复杂度/档位不能决定测试集合，AC-13）。
 * 旧 GateTier/triage 档位消费者迁移接缝表指针：plan-compiler.ts 头注（兼容期
 * legacy——W1 不改 GateTier 行为）。命令名/词形 = SP 提案待追认。
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  GovernanceError,
  type PlanApplicability,
  type PlanChangeFace,
  type PlanCapabilityWord,
  type PlanInformationalFacts,
  type PlanToolBinding,
  type VerificationPlan,
  type VerificationPlanInput,
  type VerificationPlanItem,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { POMASTER_DIR } from "./store-layout.js";
import { readRawIndexOrFail } from "./projection-common.js";
import { governanceErrorToCliError, requireInitialized } from "./permit.js";

/** kernel 所需最小面（结构化类型；缺省 = @pomaster/kernel 真实导出）。 */
export interface PlanKernelDeps {
  compileVerificationPlan: (
    input: VerificationPlanInput,
  ) => VerificationPlan | Promise<VerificationPlan>;
}

function defaultKernel(): PlanKernelDeps {
  return {
    compileVerificationPlan: (input) => {
      // 动态 import 保持与既有命令模块同构（延迟装载 @pomaster/kernel）。
      return import("@pomaster/kernel").then((mod) => mod.compileVerificationPlan(input));
    },
  };
}

function toCliError(err: unknown): CliError {
  if (err instanceof GovernanceError) {
    return governanceErrorToCliError(err);
  }
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "查看 packages/kernel/src/plan-compiler.ts 头注（输入合同与判定语义）；若为环境异常请勿静默降级。",
  };
}

function fail<T>(result: T, command: string, error: CliError): CommandOutcome<T> {
  return failOutcome(command, result, [error], [
    `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

// ============================================================
// 工具探测自动面（gauntlet-lite toolDetectors 形态的只读等价；R1-4 前接缝）
// ============================================================

function probeToolBindings(rootDir: string): PlanToolBinding[] {
  const bindings: PlanToolBinding[] = [];
  let deps: Record<string, string> = {};
  const pkgPath = join(rootDir, "package.json");
  const pkgText = existsSync(pkgPath) ? readFileSync(pkgPath, "utf8") : null;
  let pkgNote = "";
  if (pkgText === null) {
    pkgNote = "package.json 缺席（探测缺席——禁猜测）";
  } else {
    try {
      const pkg = JSON.parse(pkgText) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    } catch {
      pkgNote = "package.json 不可解析（探测缺席——禁猜测）";
    }
  }

  const vitestVersion = deps.vitest ?? null;
  bindings.push({
    tool_id: "vitest",
    capabilities: ["unit_behavior", "ui_render"],
    source_ref: "detector:vitest（root package.json dependencies/devDependencies 词面——gauntlet-lite toolDetectors 同源只读探测）",
    version: vitestVersion,
    available: vitestVersion !== null,
    availability_reason:
      vitestVersion !== null
        ? `package.json 声明在座（${vitestVersion}）——vitest run 可确定性执行`
        : `package.json 无 vitest 声明${pkgNote === "" ? "（探测缺席——禁猜测）" : `；${pkgNote}`}`,
  });

  const playwrightDeclared = deps["@playwright/test"] ?? null;
  const browserGatePresent = existsSync(join(rootDir, "browser-gate.json"));
  bindings.push({
    tool_id: "playwright",
    capabilities: ["ui_interaction"],
    source_ref: "detector:playwright-leg（@playwright/test 声明 + browser-gate.json 在位性——确定性腿配置面）",
    version: playwrightDeclared,
    available: playwrightDeclared !== null && browserGatePresent,
    availability_reason: `@playwright/test ${playwrightDeclared === null ? "未声明" : `声明在座（${playwrightDeclared}）`}且 browser-gate.json ${browserGatePresent ? "在座" : "缺席"}（两条件齐备才判在位）`,
  });

  const mcpPath = join(rootDir, ".mcp.json");
  const mcpText = existsSync(mcpPath) ? readFileSync(mcpPath, "utf8") : null;
  const mcpRegistered = mcpText !== null && mcpText.includes("chrome-devtools");
  bindings.push({
    tool_id: "chrome-devtools-mcp",
    capabilities: ["ui_interaction"],
    source_ref: "detector:chrome-devtools-mcp（项目 .mcp.json 注册面——harness 会话级注册≠项目声明）",
    version: null,
    available: mcpRegistered,
    availability_reason: `.mcp.json ${mcpText === null ? "缺席" : mcpRegistered ? "已注册 chrome-devtools" : "在座但未注册 chrome-devtools"}（观测诊断面项目级声明）`,
  });

  return bindings;
}

// ============================================================
// face 词形解析（"kind=present|absent:<依据>"；依据必填——N/A 有据的前提）
// ============================================================

interface FaceSpecParseOk {
  readonly face: PlanChangeFace;
}
interface FaceSpecParseError {
  readonly error: CliError;
}

function parseFaceSpec(spec: string): FaceSpecParseOk | FaceSpecParseError {
  const eq = spec.indexOf("=");
  const colon = spec.indexOf(":", eq === -1 ? 0 : eq);
  if (eq <= 0 || colon <= eq + 1) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--face 词形非法：${spec}（须为 "kind=present:<依据>" 或 "kind=absent:<依据>"）`,
        hint: "示例：--face \"migration=absent:变更面不含持久层\"——present/absent 是显式申报，依据必填（N/A 有据的前提）。",
      },
    };
  }
  const kind = spec.slice(0, eq);
  const stance = spec.slice(eq + 1, colon);
  const basis = spec.slice(colon + 1).trim();
  if (stance !== "present" && stance !== "absent") {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--face 在座性非法：${stance}（只接受 present/absent——在座性是显式申报非猜测）`,
        hint: "示例：--face \"ui=present:生成器模板与 story 渲染体变更\"。",
      },
    };
  }
  if (basis.length === 0) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--face 依据必填：${kind}=${stance}:<依据>（N/A 有据的前提——无依据的不在座申报拒绝）`,
        hint: "给出变更面判断依据（如「变更面不含持久层」）；该依据将逐字进 plan item reason。",
      },
    };
  }
  return { face: { kind: kind as PlanChangeFace["kind"], present: stance === "present", basis } };
}

// ============================================================
// --task 事实生产（纯读零写入；payload.acceptance 同一装载面）
// ============================================================

interface TaskAcceptanceRow {
  readonly ref: string;
  readonly statement: string;
  readonly oracle_ref: string | null;
  readonly requires: readonly PlanCapabilityWord[];
  readonly exclusions: readonly { readonly capability: PlanCapabilityWord; readonly basis: string }[];
}

async function loadTaskAcceptance(
  rootDir: string,
  taskRef: string,
): Promise<{ rows: TaskAcceptanceRow[] } | { error: CliError }> {
  // 纯读零写入（view/audit 同款纪律）：readRawIndexOrFail + 只读文件 IO——
  // 禁 createStore（其 ensureSidecars 会补写缺失骨架文件）。
  const raw = await readRawIndexOrFail(rootDir);
  if ("error" in raw) return { error: raw.error };
  const objects = raw.index.objects;
  const row = Array.isArray(objects)
    ? objects.find(
        (candidate): candidate is Record<string, unknown> =>
          typeof candidate === "object" && candidate !== null &&
          (candidate as Record<string, unknown>).id === taskRef,
      )
    : undefined;
  if (row === undefined) {
    return {
      error: {
        code: "OBJECT_NOT_FOUND",
        message: `任务不在册：${taskRef}（truth-index 无此 id——plan compile 绑定在册 task_object 的 payload.acceptance）`,
        hint: "核对 id 词形（legacy 词形经 pomaster resolve 收编）；pomaster inspect <task-id> 查在册对象。",
      },
    };
  }
  if (row.kind !== "task_object") {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `${taskRef} kind=${String(row.kind)} 非 task_object（验收义务承载在 task payload.acceptance——禁跨 kind 借位）`,
        hint: "核对目标 id。",
      },
    };
  }
  const bodyRef = row.body_ref;
  if (typeof bodyRef !== "string" || bodyRef.length === 0) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `${taskRef} 索引行缺 body_ref（索引/正文失配——从 git 恢复）`,
        hint: "从 git 恢复一致性；禁静默当空表。",
      },
    };
  }
  const bodyText = await readFile(join(rootDir, POMASTER_DIR, bodyRef), "utf8").then(
    (text) => text,
    () => null,
  );
  if (bodyText === null) {
    return {
      error: {
        code: "OBJECT_NOT_FOUND",
        message: `${taskRef} 正文缺失：truth/objects/${bodyRef}（索引在册而正文不在——D24 漂移）`,
        hint: "从 git 恢复正文文件；写入路径禁对缺失正文静默重建。",
      },
    };
  }
  let payload: unknown;
  try {
    const body = JSON.parse(bodyText) as { payload?: unknown };
    payload = body.payload;
  } catch (error) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `${taskRef} 正文不可解析（损坏或手改）：${String(error)}`,
        hint: "从 git 恢复该正文；损坏正文不可静默当空壳。",
      },
    };
  }
  const acceptance =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>).acceptance
      : undefined;
  if (!Array.isArray(acceptance) || acceptance.length === 0) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `${taskRef} payload.acceptance 缺席或为空（零验收不构成计划——禁空计划假绿）`,
        hint: "验收义务来源：brainstorm --ready --acceptance 申报 / maintain --ops upsert；自由区可带 requires/exclusions（capability/basis）。",
      },
    };
  }
  const rows: TaskAcceptanceRow[] = [];
  for (let index = 0; index < acceptance.length; index += 1) {
    const entry = acceptance[index] as Record<string, unknown>;
    const statement = entry.criterion;
    if (typeof statement !== "string" || statement.trim().length === 0) {
      return {
        error: {
          code: "SCHEMA_INVALID",
          message: `${taskRef} payload.acceptance[${index}].criterion 缺席或非文本（acceptance 行 = criterion/claim 面）`,
          hint: "acceptance 行词形：{criterion, claim}；可带 requires: string[] / exclusions: [{capability, basis}]。",
        },
      };
    }
    const claim = entry.claim;
    const requires = Array.isArray(entry.requires) ? entry.requires : [];
    const exclusionEntries = Array.isArray(entry.exclusions) ? entry.exclusions : [];
    rows.push({
      ref: `${taskRef}#acceptance[${index}]`,
      statement,
      oracle_ref: typeof claim === "string" && claim.trim().length > 0 ? claim : null,
      requires: requires as readonly PlanCapabilityWord[],
      exclusions: exclusionEntries as readonly { capability: PlanCapabilityWord; basis: string }[],
    });
  }
  return { rows };
}

// ============================================================
// plan compile（入口）
// ============================================================

export interface PlanCompileInput {
  readonly taskRef?: string;
  readonly inputFile?: string;
  readonly changed?: readonly string[];
  readonly consumers?: readonly string[];
  readonly faces?: readonly string[];
  readonly complexity?: string;
  readonly profile?: string;
  readonly note?: string;
}

export interface PlanToolProbeView {
  readonly tool_id: string;
  readonly available: boolean;
  readonly availability_reason: string;
}

export interface PlanCompileResult {
  readonly input_source: "task" | "file";
  readonly task_ref: string | null;
  readonly item_total: number;
  readonly applicability_counts: Readonly<Record<PlanApplicability, number>>;
  readonly items: readonly VerificationPlanItem[];
  readonly unknowns: VerificationPlan["unknowns"];
  readonly informational: PlanInformationalFacts | null;
  readonly inputs_fingerprint: string;
  readonly tool_probe: readonly PlanToolProbeView[];
}

function emptyResult(input: PlanCompileInput): PlanCompileResult {
  return {
    input_source: input.inputFile !== undefined ? "file" : "task",
    task_ref: input.taskRef ?? null,
    item_total: 0,
    applicability_counts: { REQUIRED: 0, NOT_REQUIRED: 0, NOT_APPLICABLE: 0 },
    items: [],
    unknowns: [],
    informational: null,
    inputs_fingerprint: "",
    tool_probe: [],
  };
}

export async function runPlanCompile(
  rootDir: string,
  input: PlanCompileInput,
  deps?: Partial<PlanKernelDeps>,
): Promise<CommandOutcome<PlanCompileResult>> {
  const command = "plan compile";
  const kernel = { ...defaultKernel(), ...deps };
  const empty = emptyResult(input);
  const factFlagsUsed =
    input.changed !== undefined ||
    input.consumers !== undefined ||
    input.faces !== undefined ||
    input.complexity !== undefined ||
    input.profile !== undefined ||
    input.note !== undefined;

  if (input.taskRef === undefined && input.inputFile === undefined) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "须供 --task <TASK.*> 或 --input <file>（验收义务来源缺席——零验收不构成计划）",
      hint: "示例：pomaster plan compile --task TASK.X --changed <path> --face \"ui=present:<依据>\"；或 pomaster plan compile --input plan-input.json（kernel 契约直传）。",
    });
  }
  if (input.taskRef !== undefined && input.inputFile !== undefined) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--task 与 --input 互斥（验收义务来源须唯一——禁双源拼接）",
      hint: "store 义务走 --task（+事实旗标）；整契约直传走 --input（不接受事实旗标）。",
    });
  }
  if (input.inputFile !== undefined && factFlagsUsed) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--input 契约直传不接受事实/信息旗标（整契约由文件承载——禁双源拼接）",
      hint: "把 changed_paths/faces/informational 写进契约 JSON 再 --input；store 义务改走 --task。",
    });
  }

  try {
    let planInput: VerificationPlanInput;
    let taskRef: string | null = null;
    if (input.inputFile !== undefined) {
      try {
        planInput = JSON.parse(readFileSync(input.inputFile, "utf8")) as VerificationPlanInput;
      } catch (error) {
        return fail(empty, command, {
          code: "SCHEMA_INVALID",
          message: `--input 契约文件不可读/不可解析：${input.inputFile}（${error instanceof Error ? error.message : String(error)}）`,
          hint: "契约词形 = kernel VerificationPlanInput（见 packages/kernel/src/plan-compiler.ts 头注）；缺段/词形非法会被 kernel fail-closed 拒绝（SCHEMA_INVALID）。",
        });
      }
    } else {
      taskRef = input.taskRef as string;
      const initialized = await requireInitialized(rootDir);
      if ("error" in initialized) return fail(empty, command, initialized.error);
      const loaded = await loadTaskAcceptance(rootDir, taskRef);
      if ("error" in loaded) return fail(empty, command, loaded.error);

      const faces: PlanChangeFace[] = [];
      for (const spec of input.faces ?? []) {
        const parsed = parseFaceSpec(spec);
        if ("error" in parsed) return fail(empty, command, parsed.error);
        faces.push(parsed.face);
      }
      const informational: PlanInformationalFacts = {
        complexity: input.complexity ?? null,
        governance_profile: input.profile ?? null,
        note: input.note ?? null,
      };
      planInput = {
        acceptance: {
          value: loaded.rows,
          source_ref: `store:${taskRef} payload.acceptance`,
          version: null,
          unknowns: [],
        },
        changeSurface: {
          value: {
            changed_paths: [...(input.changed ?? [])],
            affected_consumers: [...(input.consumers ?? [])],
            faces,
          },
          source_ref: "argv:--changed/--consumer/--face",
          version: null,
          unknowns: [
            "受影响消费者为 argv 显式清单（import-graph 消费者图未接线——R1-3 边界）；变更面 absent 申报=Owner/编译方判断（依据已逐字入 reason）",
          ],
        },
        environment: {
          value: null,
          source_ref: "cli:plan(未接入)",
          version: null,
          unknowns: [
            "环境面未接入 plan compile（perception 环境回执——Verify 步供给）；ui_interaction 执行前置显式待 Ground",
          ],
        },
        toolBindings: {
          value: probeToolBindings(rootDir),
          source_ref: "detector:vitest/playwright-leg/chrome-devtools-mcp（只读探测——ToolBinding 统一面=R1-4 接缝）",
          version: null,
          unknowns: [],
        },
        permit: {
          value: null,
          source_ref: "cli:plan(未接线)",
          version: null,
          unknowns: ["Permit 判卷未接线（执行前置归 check/permit 通路）"],
        },
        informational,
      };
    }

    const plan = await kernel.compileVerificationPlan(planInput);
    const counts: Record<PlanApplicability, number> = { REQUIRED: 0, NOT_REQUIRED: 0, NOT_APPLICABLE: 0 };
    for (const item of plan.items) counts[item.applicability] += 1;
    const view: PlanCompileResult = {
      input_source: input.inputFile !== undefined ? "file" : "task",
      task_ref: taskRef,
      item_total: plan.items.length,
      applicability_counts: counts,
      items: plan.items,
      unknowns: plan.unknowns,
      informational: plan.informational,
      inputs_fingerprint: plan.inputs_fingerprint,
      tool_probe: (planInput.toolBindings.value ?? []).map((binding) => ({
        tool_id: binding.tool_id,
        available: binding.available,
        availability_reason: binding.availability_reason,
      })),
    };

    const info = plan.informational;
    const requiredItems = plan.items.filter((item) => item.applicability === "REQUIRED");
    const excludedTotal = counts.NOT_REQUIRED;
    const notApplicableTotal = counts.NOT_APPLICABLE;
    const human = [
      `plan compile → ${view.item_total} items（REQUIRED ${counts.REQUIRED} / NOT_REQUIRED ${excludedTotal} / NOT_APPLICABLE ${notApplicableTotal}）＋ unknowns ${plan.unknowns.length}（无法判定的影响面显式保留——禁默认 NOT_APPLICABLE）`,
      `  fingerprint: ${plan.inputs_fingerprint}`,
      ...(info !== null && (info.complexity || info.governance_profile || info.note)
        ? [
            `  informational（零参与 applicability——A1 裁定 projection.ts:220 先例）: complexity=${info.complexity ?? "-"} profile=${info.governance_profile ?? "-"}${info.note ? ` note=${info.note}` : ""}`,
          ]
        : []),
      "",
      "  REQUIRED（义务在座；缺工具保持 REQUIRED 并记 tool_gap——无工具≠N/A）:",
      ...requiredItems.map(
        (item) =>
          `    [REQUIRED] ${item.acceptance_ref} · ${item.capability} · tool=${item.resolved_tool ?? "null"}` +
          `${item.tool_gap === null ? "" : `（缺口：${item.tool_gap}）`}`,
      ),
      `  NOT_REQUIRED（验收显式排除）: ${excludedTotal} 条（--json 查全字段）`,
      `  NOT_APPLICABLE（变更面不在座——N/A 有据引用变更面依据）: ${notApplicableTotal} 条（--json 查全字段）`,
      ...(plan.unknowns.length > 0
        ? ["  unknowns:", ...plan.unknowns.map((unknown) => `    [${unknown.kind}] ${unknown.ref} ${unknown.detail}`)]
        : []),
      "",
      "  旧档位迁移清单：test-planning-and-reporting.md §2 接缝表（adapter-types/detectors requiredByProfile、coverage/crap、mutation、security/performance、view.ts 汇编）——兼容期 legacy，W1 不改 GateTier 行为",
      "  词形/命令名=SP 提案待追认；ToolBinding 统一面=R1-4 接缝（本面=gateAdapters/toolDetectors 只读探测）",
    ];
    return okOutcome(command, view, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}
