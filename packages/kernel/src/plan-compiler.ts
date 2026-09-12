/**
 * plan-compiler.ts —— Verification Plan Compiler（证据计划编译器；W1 R1-3 切片；
 * 09-10 PRD REQ-04「完整 Acceptance → Evidence Requirement → Capability → Tool 链」
 * + AC-03 / AC-13 + test-planning-and-reporting.md §2 九步算法）。
 *
 * 职责：逐 Acceptance 编译 Verification Plan——每条验收 × 能力闭包产出 plan item
 * （义务/工具/靶/环境/applicability/依据全字段落盘），无法判断的影响面保留 unknown，
 * 禁默认 NOT_APPLICABLE。纯函数核：零 fs、零 store、零墙钟（A4），同输入 → 同输出
 * 字节稳定（inputs_fingerprint = sha256OfCanonical 整个输入）。
 *
 * ═══ 判定语义（§2 九步算法的本仓落点）═══
 * - 能力闭包 U = ∪(faces 派生能力, acceptance.requires ∪ exclusions)——不从现有工具
 *   能力反向改写正确答案（PRD §18 第 1 条）；
 * - applicability 三值：REQUIRED（验收申报义务）/ NOT_REQUIRED（验收显式排除——能力
 *   相关但本验收不要求）/ NOT_APPLICABLE（变更面声明该 face 不在座——N/A 有据，
 *   引用变更面 basis；三值中 NOT_APPLICABLE 复用 baseline 既有词形
 *   BASELINE_UNKNOWN_APPLICABILITY_VALUES，REQUIRED/NOT_REQUIRED 轴为新词形）；
 * - 排除（NOT_REQUIRED）优先于申报（REQUIRED）；二者同现 = 输入矛盾 SCHEMA_INVALID；
 * - requires 义务命中 absent face = 输入自相矛盾，SCHEMA_INVALID fail-closed；
 * - 未申报 face kind → undeclared_face unknown；face 在座但无人认领能力 →
 *   unclaimed_face_capability unknown；逐验收未判定能力 → unjudged_capability
 *   unknown（回 Expect 判定，绝不静默丢弃也绝不默认降级）；
 * - 缺工具 ≠ N/A：REQUIRED 保持 + resolved_tool=null + tool_gap 缺口原因（无工具
 *   不降级义务；执行态归 NOT_RUN/BLOCKED 域）。
 *
 * ═══ A1 裁定边界（projection.ts:220 先例）═══
 * informational（complexity / governance_profile / note）只原样呈现，零参与
 * applicability 判定——复杂度/档位不能决定测试集合（AC-13）。词表管辖=kernel 局部
 * 词 TODO(vocab-pr)（question-gate 六值同款先例），SP 提案待追认。
 *
 * ═══ R1-4 接缝 ═══
 * PlanToolBinding 是 R1-4 ToolBinding 统一面前的过渡输入形态（本仓现状=
 * gauntlet-lite gateAdapters(5)/toolDetectors(15) 只读探测 + browser-gate.json/
 * .mcp.json 在位性）；R1-4 落地后本输入段换统一绑定面，判定核不动。
 *
 * ═══ R1-5 接缝（证据复用重判——test-planning §2 算法第 8 步）═══
 * 「用当前 revision/env/config 对已有证据重判适用性」的机器可比对子集已由
 * evidence-qualification.ts 判定核落地（seq/gate_def/oracle/permit/subject 五轴纯函
 * 数，要求面=baseline 确认 at_seq + journal 失效事件 + CURRENT_GATE_DEFS 注册面）；
 * 本切片消费接线归 closeout / record verification 两命令面，plan 重编译时的逐 item
 * 证据复用重判（预期证据 ↔ 既有 GRN 对账后调 qualifyEvidence）留接口给后续切片，
 * 本编译器行为零改动。
 *
 * ═══ 旧档位迁移清单指针（兼容期 legacy 登记——W1 Out of Scope）═══
 * 旧 GateTier/triage 档位消费者迁移接缝表住
 * .trellis/tasks/09-10-brainstorm-long-horizon-control-loop/research/
 * test-planning-and-reporting.md §2；消费者坐标（W1 不改其行为，本编译器为并存
 * 面直至迁移轮）：adapter-types.ts:80-85/136-156/190-199 + detectors.ts
 * requiredByProfile 分支、coverage-adapter.ts:434/486/722 + coverage-leg.ts:143-164、
 * crap.ts:333-381、mutation-adapter.ts:365-375、security-adapter.ts:385-398 +
 * performance-adapter.ts:196-207、playwright-adapter.ts:15-18/164-168（不按档位
 * 豁免）、view.ts:653-670/788-793（gate report 汇编）。
 */
import { GovernanceError } from "./errors.js";
import { sha256OfCanonical } from "./digest.js";

// ============================================================
// 词形闭包（kernel 局部词 TODO(vocab-pr)；NOT_APPLICABLE 复用 baseline 词形）
// ============================================================

export const PLAN_APPLICABILITY_VALUES = ["REQUIRED", "NOT_REQUIRED", "NOT_APPLICABLE"] as const;
export type PlanApplicability = (typeof PLAN_APPLICABILITY_VALUES)[number];

/** 变更面词类（十类；闭包=SP 提案待追认）。 */
export const PLAN_CHANGE_FACE_KINDS = [
  "behavior",
  "ui",
  "api",
  "data_read_write",
  "migration",
  "permission",
  "dependency",
  "concurrency",
  "performance",
  "deployment_config",
] as const;
export type PlanChangeFaceKind = (typeof PLAN_CHANGE_FACE_KINDS)[number];

/**
 * 能力词形（十三词；W3-S2 起 + static_analysis——TS 族静态分析 tsc/ESLint 绑定面，
 * 同批修订 = schema 23 capability_word enum。visual_diff 与 static_analysis 均不从
 * 任何 face 派生——只经 acceptance requires/exclusions 进闭包）。
 */
export const PLAN_CAPABILITY_WORDS = [
  "unit_behavior",
  "ui_render",
  "ui_interaction",
  "api_contract",
  "data_integration",
  "migration_drill",
  "permission_observation",
  "dependency_check",
  "concurrency_reproduction",
  "load_test",
  "deployment_config_check",
  "visual_diff",
  "static_analysis",
] as const;
export type PlanCapabilityWord = (typeof PLAN_CAPABILITY_WORDS)[number];

/** face kind → 派生能力（轴序固定词形；face 闭包是能力的唯一 face 来源）。 */
const FACE_CAPABILITIES: Readonly<Record<PlanChangeFaceKind, readonly PlanCapabilityWord[]>> = {
  behavior: ["unit_behavior"],
  ui: ["ui_render", "ui_interaction"],
  api: ["api_contract"],
  data_read_write: ["data_integration"],
  migration: ["migration_drill"],
  permission: ["permission_observation"],
  dependency: ["dependency_check"],
  concurrency: ["concurrency_reproduction"],
  performance: ["load_test"],
  deployment_config: ["deployment_config_check"],
};

/** capability → 承载 face kind（visual_diff 无 face 承载）。 */
const CAPABILITY_FACE: Readonly<Partial<Record<PlanCapabilityWord, PlanChangeFaceKind>>> = (() => {
  const map: Partial<Record<PlanCapabilityWord, PlanChangeFaceKind>> = {};
  for (const kind of PLAN_CHANGE_FACE_KINDS) {
    for (const cap of FACE_CAPABILITIES[kind]) map[cap] = kind;
  }
  return map;
})();

const CAPABILITY_METHOD: Readonly<Record<PlanCapabilityWord, string>> = {
  unit_behavior: "test",
  ui_render: "test",
  ui_interaction: "observation",
  api_contract: "test",
  data_integration: "test",
  migration_drill: "test",
  permission_observation: "observation",
  dependency_check: "analysis",
  concurrency_reproduction: "test",
  load_test: "test",
  deployment_config_check: "inspection",
  visual_diff: "observation",
  static_analysis: "analysis",
};

const CAPABILITY_EVIDENCE_REQUIREMENT: Readonly<Record<PlanCapabilityWord, string>> = {
  unit_behavior: "vitest 单测钉测（行为断言在座，禁空转断言）",
  ui_render: "组件渲染钉测（挂载断言关键节点/计数分母）",
  ui_interaction: "浏览器交互观察回执（Playwright 断言 ∥ chrome-devtools 实时对账双通道至少其一）",
  api_contract: "API 契约比对回执（请求/响应形状逐字段对账）",
  data_integration: "数据读写集成证据（真实存储路径往返，禁 mock 同引用假绿）",
  migration_drill: "迁移演练回执（升级/回滚双向）",
  permission_observation: "权限行为观察回执（越权路径实测拒绝）",
  dependency_check: "依赖闭包分析回执（新增/移除边清单）",
  concurrency_reproduction: "并发复现用例（竞态窗口显式构造）",
  load_test: "负载实测回执（预算阈值在座）",
  deployment_config_check: "部署配置检视回执（环境差异逐键对账）",
  visual_diff: "视觉差异回执（基线快照比对）",
  static_analysis:
    "类型/静态分析工具真实执行回执（tsc --noEmit 文本诊断逐条重算 ∥ ESLint JSON finding 逐条重算；编译转译成功不当 typecheck，空根 tsconfig 零分母禁默认 PASS）",
};

// ============================================================
// 输入合同（camelCase 输入世界——CLI 生产类型化事实，kernel 纯消费）
// ============================================================

/** 输入段包装：事实 + 来源 + 版本 + 自报 unknown（来源可重放 = 计划可重编译的前提）。 */
export interface PlanInputSegment<T> {
  readonly value: T;
  readonly source_ref: string;
  readonly version: string | null;
  readonly unknowns?: readonly string[];
}

export interface PlanAcceptanceItem {
  readonly ref: string;
  readonly statement: string;
  readonly oracle_ref: string | null;
  readonly requires: readonly PlanCapabilityWord[];
  readonly exclusions: readonly {
    readonly capability: PlanCapabilityWord;
    readonly basis: string;
  }[];
}

export interface PlanChangeFace {
  readonly kind: PlanChangeFaceKind;
  readonly present: boolean;
  readonly basis: string;
}

export interface PlanChangeSurface {
  readonly changed_paths: readonly string[];
  readonly affected_consumers: readonly string[];
  readonly faces: readonly PlanChangeFace[];
}

export interface PlanEnvironmentFacts {
  readonly ref: string;
  readonly grounded: boolean;
  readonly notes: readonly string[];
}

/** R1-4 ToolBinding 统一面前的过渡形态（探测面产出；见头注接缝节）。 */
export interface PlanToolBinding {
  readonly tool_id: string;
  readonly capabilities: readonly PlanCapabilityWord[];
  readonly source_ref: string;
  readonly version: string | null;
  readonly available: boolean;
  readonly availability_reason: string;
}

export interface PlanPermitFacts {
  readonly permit_ref: string | null;
  readonly scope_subject_ids: readonly string[];
}

/** 信息性输入——零参与 applicability（A1 裁定）；只原样呈现。 */
export interface PlanInformationalFacts {
  readonly complexity?: string | null;
  readonly governance_profile?: string | null;
  readonly note?: string | null;
}

export interface VerificationPlanInput {
  readonly acceptance: PlanInputSegment<readonly PlanAcceptanceItem[]>;
  readonly changeSurface: PlanInputSegment<PlanChangeSurface>;
  readonly environment: PlanInputSegment<PlanEnvironmentFacts | null>;
  readonly toolBindings: PlanInputSegment<readonly PlanToolBinding[]>;
  readonly permit: PlanInputSegment<PlanPermitFacts | null>;
  readonly informational?: PlanInformationalFacts;
}

// ============================================================
// 输出合同（snake_case 文件世界——test-planning-and-reporting §2 建议字段逐字）
// ============================================================

export interface VerificationPlanItem {
  readonly acceptance_ref: string;
  readonly evidence_requirement: string;
  readonly capability: PlanCapabilityWord;
  readonly method: string;
  readonly resolved_tool: string | null;
  readonly tool_gap: string | null;
  readonly target: readonly string[];
  readonly environment: string | null;
  readonly applicability: PlanApplicability;
  readonly reason: string;
  readonly prerequisite: readonly string[];
  readonly expected_evidence: string;
  /** 本切片不裁安全义务——显式 null（非缺省；安全面归后续切片）。 */
  readonly safety_requirement: null;
  readonly execution_dependency: readonly string[];
}

export type PlanUnknownKind =
  | "undeclared_face"
  | "unjudged_capability"
  | "unclaimed_face_capability"
  | "input_unknown";

export interface PlanUnknownItem {
  readonly kind: PlanUnknownKind;
  readonly ref: string;
  readonly detail: string;
  readonly source_ref: string;
}

export interface VerificationPlan {
  readonly items: readonly VerificationPlanItem[];
  readonly unknowns: readonly PlanUnknownItem[];
  readonly informational: PlanInformationalFacts | null;
  readonly inputs_fingerprint: string;
}

// ============================================================
// fail-closed 校验（SCHEMA_INVALID；禁静默当空表/禁矛盾输入放行）
// ============================================================

function schemaInvalid(message: string, hint: string): GovernanceError {
  return new GovernanceError("SCHEMA_INVALID", message, hint);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw schemaInvalid(`${path} 须为非空字符串（fail-closed——禁静默当空表）`, `plan-compiler 输入合同校验失败于 ${path}`);
  }
  return value;
}

function requireStringOrNull(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw schemaInvalid(`${path} 须为 string 或 null`, `plan-compiler 输入合同校验失败于 ${path}`);
  }
  return value;
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw schemaInvalid(`${path} 须为 string[]`, `plan-compiler 输入合同校验失败于 ${path}`);
  }
  return value.map((entry, index) => requireNonEmptyString(entry, `${path}[${index}]`));
}

function requireCapabilityWord(value: unknown, path: string): PlanCapabilityWord {
  if (typeof value !== "string" || !(PLAN_CAPABILITY_WORDS as readonly string[]).includes(value)) {
    throw schemaInvalid(
      `${path} = ${String(value)} 不在 capability 词形闭包（${PLAN_CAPABILITY_WORDS.join("/")}）`,
      "plan-compiler capability 词形闭包=kernel 局部词 TODO(vocab-pr)（SP 提案待追认）",
    );
  }
  return value as PlanCapabilityWord;
}

function validateSegment<T>(
  segment: PlanInputSegment<T> | undefined,
  name: string,
): { value: T; sourceRef: string; unknowns: readonly string[] } {
  if (segment === undefined || segment === null || typeof segment !== "object") {
    throw schemaInvalid(`输入段 ${name} 缺席（须为 {value, source_ref, version, unknowns} 包装）`, `plan-compiler 输入合同：${name} 段缺失`);
  }
  if (segment.value === undefined) {
    throw schemaInvalid(`输入段 ${name}.value 缺席（null 合法、undefined 非法——缺席必须显式）`, `plan-compiler 输入合同：${name}.value`);
  }
  const sourceRef = requireNonEmptyString(segment.source_ref, `${name}.source_ref`);
  requireStringOrNull(segment.version, `${name}.version`);
  const unknowns = segment.unknowns === undefined ? [] : requireStringArray(segment.unknowns, `${name}.unknowns`);
  return { value: segment.value, sourceRef, unknowns };
}

function validateAcceptance(items: readonly PlanAcceptanceItem[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw schemaInvalid(
      "acceptance 须为非空数组（零验收不构成计划——禁空计划假绿）",
      "plan compile 的验收义务来源：--task（store payload.acceptance）或 --input 契约文件",
    );
  }
  const seenRefs = new Set<string>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as PlanAcceptanceItem;
    const path = `acceptance[${index}]`;
    if (item === null || typeof item !== "object") {
      throw schemaInvalid(`${path} 须为对象`, "plan-compiler 输入合同校验失败");
    }
    const ref = requireNonEmptyString(item.ref, `${path}.ref`);
    if (seenRefs.has(ref)) {
      throw schemaInvalid(`${path}.ref 重复：${ref}（acceptance ref 须唯一）`, "plan-compiler 输入合同校验失败");
    }
    seenRefs.add(ref);
    requireNonEmptyString(item.statement, `${path}.statement`);
    requireStringOrNull(item.oracle_ref, `${path}.oracle_ref`);
    if (!Array.isArray(item.requires)) {
      throw schemaInvalid(`${path}.requires 须为数组`, "plan-compiler 输入合同校验失败");
    }
    const requires = item.requires.map((cap, capIndex) => requireCapabilityWord(cap, `${path}.requires[${capIndex}]`));
    if (new Set(requires).size !== requires.length) {
      throw schemaInvalid(`${path}.requires 含重复 capability`, "plan-compiler 输入合同校验失败");
    }
    if (!Array.isArray(item.exclusions)) {
      throw schemaInvalid(`${path}.exclusions 须为数组`, "plan-compiler 输入合同校验失败");
    }
    const excludedCaps: PlanCapabilityWord[] = [];
    for (let exIndex = 0; exIndex < item.exclusions.length; exIndex += 1) {
      const exclusion = item.exclusions[exIndex] as { capability?: unknown; basis?: unknown };
      const exPath = `${path}.exclusions[${exIndex}]`;
      const cap = requireCapabilityWord(exclusion.capability, `${exPath}.capability`);
      requireNonEmptyString(exclusion.basis, `${exPath}.basis`);
      excludedCaps.push(cap);
    }
    if (new Set(excludedCaps).size !== excludedCaps.length) {
      throw schemaInvalid(`${path}.exclusions 含重复 capability（排除一次足矣——重复=判定矛盾）`, "plan-compiler 输入合同校验失败");
    }
    const conflict = requires.filter((cap) => excludedCaps.includes(cap));
    if (conflict.length > 0) {
      throw schemaInvalid(
        `${path} requires∩exclusions 冲突：${conflict.join("/")}（同一能力同一条验收不得既申报又排除）`,
        "plan-compiler 判定语义：排除优先于申报；二者同现=输入矛盾，fail-closed",
      );
    }
  }
}

function validateChangeSurface(surface: PlanChangeSurface): Map<PlanChangeFaceKind, PlanChangeFace> {
  requireStringArray(surface.changed_paths ?? null, "changeSurface.changed_paths");
  requireStringArray(surface.affected_consumers ?? null, "changeSurface.affected_consumers");
  if (!Array.isArray(surface.faces)) {
    throw schemaInvalid("changeSurface.faces 须为数组", "plan-compiler 输入合同校验失败");
  }
  const byKind = new Map<PlanChangeFaceKind, PlanChangeFace>();
  for (let index = 0; index < surface.faces.length; index += 1) {
    const face = surface.faces[index] as PlanChangeFace;
    const path = `changeSurface.faces[${index}]`;
    if (
      typeof face?.kind !== "string" ||
      !(PLAN_CHANGE_FACE_KINDS as readonly string[]).includes(face.kind)
    ) {
      throw schemaInvalid(
        `${path}.kind = ${String(face?.kind)} 不在 face 词形闭包（${PLAN_CHANGE_FACE_KINDS.join("/")}）`,
        "plan-compiler face 词形闭包=SP 提案待追认（TODO(vocab-pr)）",
      );
    }
    if (typeof face.present !== "boolean") {
      throw schemaInvalid(`${path}.present 须为 boolean（在座性是显式申报，非猜测）`, "plan-compiler 输入合同校验失败");
    }
    requireNonEmptyString(face.basis, `${path}.basis`);
    if (byKind.has(face.kind)) {
      throw schemaInvalid(`${path}.kind 重复：${face.kind}（每 face kind 恰一条申报）`, "plan-compiler 输入合同校验失败");
    }
    byKind.set(face.kind, face);
  }
  return byKind;
}

function validateEnvironment(value: PlanEnvironmentFacts | null): void {
  if (value === null) return;
  requireNonEmptyString(value.ref, "environment.ref");
  if (typeof value.grounded !== "boolean") {
    throw schemaInvalid("environment.grounded 须为 boolean（Ground 三态显式）", "plan-compiler 输入合同校验失败");
  }
  requireStringArray(value.notes ?? null, "environment.notes");
}

function validateToolBindings(bindings: readonly PlanToolBinding[]): void {
  if (!Array.isArray(bindings)) {
    throw schemaInvalid("toolBindings 须为数组（零绑定合法——REQUIRED 保持 + tool_gap）", "plan-compiler 输入合同校验失败");
  }
  const seen = new Set<string>();
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index] as PlanToolBinding;
    const path = `toolBindings[${index}]`;
    const toolId = requireNonEmptyString(binding.tool_id, `${path}.tool_id`);
    if (seen.has(toolId)) {
      throw schemaInvalid(`${path}.tool_id 重复：${toolId}`, "plan-compiler 输入合同校验失败");
    }
    seen.add(toolId);
    if (!Array.isArray(binding.capabilities) || binding.capabilities.length === 0) {
      throw schemaInvalid(`${path}.capabilities 须为非空数组（绑定须声明覆盖能力）`, "plan-compiler 输入合同校验失败");
    }
    for (let capIndex = 0; capIndex < binding.capabilities.length; capIndex += 1) {
      requireCapabilityWord(binding.capabilities[capIndex], `${path}.capabilities[${capIndex}]`);
    }
    requireNonEmptyString(binding.source_ref, `${path}.source_ref`);
    requireStringOrNull(binding.version, `${path}.version`);
    if (typeof binding.available !== "boolean") {
      throw schemaInvalid(`${path}.available 须为 boolean（在位性是显式判定）`, "plan-compiler 输入合同校验失败");
    }
    requireNonEmptyString(binding.availability_reason, `${path}.availability_reason`);
  }
}

function validatePermit(value: PlanPermitFacts | null): void {
  if (value === null) return;
  requireStringOrNull(value.permit_ref, "permit.permit_ref");
  requireStringArray(value.scope_subject_ids ?? null, "permit.scope_subject_ids");
}

// ============================================================
// 编译核（纯函数；零 fs 零墙钟）
// ============================================================

function sortedUnique(words: readonly PlanCapabilityWord[]): PlanCapabilityWord[] {
  return [...new Set(words)].sort();
}

function resolveTool(
  capability: PlanCapabilityWord,
  bindings: readonly PlanToolBinding[],
): { resolved: string | null; gap: string | null } {
  // 码点序（非 localeCompare——ICU collation 下标点权重随环境 locale 变化，
  // 破坏跨环境字节稳定；catalog/analyzer-import-graph 同款码点序惯例）。
  const covering = bindings
    .filter((binding) => binding.capabilities.includes(capability))
    .sort((a, b) => (a.tool_id < b.tool_id ? -1 : a.tool_id > b.tool_id ? 1 : 0));
  const available = covering.filter((binding) => binding.available);
  if (available.length > 0) {
    return { resolved: (available[0] as PlanToolBinding).tool_id, gap: null };
  }
  if (covering.length > 0) {
    const reasons = covering
      .map((binding) => `${binding.tool_id}（${binding.availability_reason}）`)
      .join("；");
    return {
      resolved: null,
      gap: `工具绑定在座但不可用：${reasons}——义务保持 REQUIRED（无工具≠N/A；执行态归 NOT_RUN/BLOCKED 域）`,
    };
  }
  return {
    resolved: null,
    gap: `无工具绑定覆盖 ${capability}（工具缺口——义务保持 REQUIRED（无工具≠N/A）；ToolBinding 统一面=R1-4 接缝）`,
  };
}

/**
 * 编译 Verification Plan（W1 R1-3 入口；纯函数——同输入→同输出字节稳定）。
 * 判定语义见头注「判定语义」节；applicability 三值 + unknown 保留 + 无工具≠N/A。
 */
export function compileVerificationPlan(input: VerificationPlanInput): VerificationPlan {
  // —— 输入段校验（fail-closed；词形闭包钉死）——
  const acceptanceSegment = validateSegment(input?.acceptance, "acceptance");
  const changeSurfaceSegment = validateSegment(input?.changeSurface, "changeSurface");
  const environmentSegment = validateSegment(input?.environment, "environment");
  const toolBindingsSegment = validateSegment(input?.toolBindings, "toolBindings");
  const permitSegment = validateSegment(input?.permit, "permit");

  validateAcceptance(acceptanceSegment.value as readonly PlanAcceptanceItem[]);
  const faceByKind = validateChangeSurface(changeSurfaceSegment.value as PlanChangeSurface);
  validateEnvironment(environmentSegment.value as PlanEnvironmentFacts | null);
  validateToolBindings(toolBindingsSegment.value as readonly PlanToolBinding[]);
  validatePermit(permitSegment.value as PlanPermitFacts | null);

  const acceptance = acceptanceSegment.value as readonly PlanAcceptanceItem[];
  const surface = changeSurfaceSegment.value as PlanChangeSurface;
  const environment = environmentSegment.value as PlanEnvironmentFacts | null;
  const bindings = toolBindingsSegment.value as readonly PlanToolBinding[];
  const permit = permitSegment.value as PlanPermitFacts | null;

  // —— faces 派生能力轴（轴序固定）——
  const presentFaceCaps: PlanCapabilityWord[] = [];
  const absentFaceCaps: PlanCapabilityWord[] = [];
  for (const kind of PLAN_CHANGE_FACE_KINDS) {
    const face = faceByKind.get(kind);
    if (face === undefined) continue;
    (face.present ? presentFaceCaps : absentFaceCaps).push(...FACE_CAPABILITIES[kind]);
  }

  // —— 能力闭包 U = ∪(faces 派生, acceptance requires∪exclusions)——
  const universe = new Set<PlanCapabilityWord>([...presentFaceCaps, ...absentFaceCaps]);
  for (const item of acceptance) {
    for (const cap of item.requires) universe.add(cap);
    for (const exclusion of item.exclusions) universe.add(exclusion.capability);
  }

  // —— 输入矛盾前置闸：requires 命中 absent face（fail-closed）——
  for (const item of acceptance) {
    for (const cap of item.requires) {
      const faceKind = CAPABILITY_FACE[cap];
      if (faceKind !== undefined) {
        const face = faceByKind.get(faceKind);
        if (face !== undefined && !face.present) {
          throw schemaInvalid(
            `acceptance ${item.ref} requires ${cap}，但变更面显式声明 face ${faceKind} 不在座（依据：${face.basis}）——义务申报与变更面自相矛盾，fail-closed`,
            "修正 acceptance.requires 或 changeSurface.faces（present/absent 是显式申报，禁猜测调和）",
          );
        }
      }
    }
  }

  // —— unknowns 装配（确定性序：input_unknown → undeclared_face → unclaimed → unjudged）——
  const unknowns: PlanUnknownItem[] = [];
  const segmentUnknowns: readonly (readonly [string, string, { sourceRef: string; unknowns: readonly string[] }])[] = [
    ["acceptance", "acceptance", acceptanceSegment],
    ["changeSurface", "changeSurface", changeSurfaceSegment],
    ["environment", "environment", environmentSegment],
    ["toolBindings", "toolBindings", toolBindingsSegment],
    ["permit", "permit", permitSegment],
  ];
  for (const [, name, segment] of segmentUnknowns) {
    for (const detail of segment.unknowns) {
      unknowns.push({ kind: "input_unknown", ref: name, detail, source_ref: segment.sourceRef });
    }
  }
  for (const kind of PLAN_CHANGE_FACE_KINDS) {
    if (faceByKind.has(kind)) continue;
    const caps = FACE_CAPABILITIES[kind].join("/");
    unknowns.push({
      kind: "undeclared_face",
      ref: kind,
      detail: `变更面未声明 face ${kind}（present/absent 均未申报）——${caps} 是否有证明义务不可判定，保留 unknown（禁默认 NOT_APPLICABLE）`,
      source_ref: changeSurfaceSegment.sourceRef,
    });
  }
  const claimedCaps = new Set<PlanCapabilityWord>();
  for (const item of acceptance) {
    for (const cap of item.requires) claimedCaps.add(cap);
    for (const exclusion of item.exclusions) claimedCaps.add(exclusion.capability);
  }
  for (const cap of sortedUnique(presentFaceCaps)) {
    if (claimedCaps.has(cap)) continue;
    unknowns.push({
      kind: "unclaimed_face_capability",
      ref: cap,
      detail: `face 在座但无任何验收条目申报 ${cap} 义务——change 级缺口回 Expect 判定（不默认 REQUIRED 也不默认 N/A）`,
      source_ref: changeSurfaceSegment.sourceRef,
    });
  }

  // —— 逐 acceptance × 能力闭包 → plan items（排除优先 → 申报 → absent face → unjudged）——
  const items: VerificationPlanItem[] = [];
  for (const item of acceptance) {
    const required = new Set<PlanCapabilityWord>(item.requires);
    const excluded = new Map<PlanCapabilityWord, string>(
      item.exclusions.map((exclusion) => [exclusion.capability, exclusion.basis]),
    );
    for (const capability of sortedUnique([...universe])) {
      const exclusionBasis = excluded.get(capability);
      if (exclusionBasis !== undefined) {
        items.push({
          acceptance_ref: item.ref,
          evidence_requirement: CAPABILITY_EVIDENCE_REQUIREMENT[capability],
          capability,
          method: CAPABILITY_METHOD[capability],
          resolved_tool: null,
          tool_gap: null,
          target: [],
          environment: environment?.ref ?? null,
          applicability: "NOT_REQUIRED",
          reason: `NOT_REQUIRED：验收 ${item.ref} 显式排除 ${capability}（排除依据：${exclusionBasis}）——能力相关但本验收义务不要求；排除是义务判断，非工具缺席降级`,
          prerequisite: [],
          expected_evidence: "（无——显式排除，零义务零证据）",
          safety_requirement: null,
          execution_dependency: ["parallel"],
        });
        continue;
      }
      if (required.has(capability)) {
        const { resolved, gap } = resolveTool(capability, bindings);
        const faceKind = CAPABILITY_FACE[capability];
        const face = faceKind === undefined ? undefined : faceByKind.get(faceKind);
        const faceClause =
          face !== undefined
            ? `变更面命中 face ${faceKind}（${face.basis}）`
            : "验收显式申报、变更面闭包无对应 face（义务来自验收申报，照常成立）";
        const prerequisites: string[] =
          resolved !== null
            ? [
                `tool ${resolved}（${bindings.find((binding) => binding.tool_id === resolved)?.version ?? "version unknown"}）可用`,
              ]
            : [`工具缺口未解：${gap ?? ""}`, "补齐工具绑定前该义务不可执行（执行态只能 NOT_RUN/BLOCKED）"];
        if (environment === null) {
          prerequisites.push("environment 输入缺席（unknown 保留——不默认可执行）");
        } else if (environment.grounded) {
          prerequisites.push(`environment ${environment.ref} 已 Ground`);
        } else {
          prerequisites.push(`environment ${environment.ref} 待 Ground（perception 环境回执——Verify 步供给）`);
        }
        prerequisites.push(
          permit === null
            ? "permit 引用缺席（执行前置——不默认授权）"
            : `permit ${permit.permit_ref ?? "(未引用)"}（scope ${permit.scope_subject_ids.length} 主体）`,
        );
        items.push({
          acceptance_ref: item.ref,
          evidence_requirement: CAPABILITY_EVIDENCE_REQUIREMENT[capability],
          capability,
          method: CAPABILITY_METHOD[capability],
          resolved_tool: resolved,
          tool_gap: gap,
          target: [...surface.changed_paths],
          environment: environment?.ref ?? null,
          applicability: "REQUIRED",
          reason: `REQUIRED：验收 ${item.ref} 义务 ${capability}（${item.statement}）——${faceClause}；工具解析见 resolved_tool/tool_gap（缺工具不降级义务）`,
          prerequisite: prerequisites,
          expected_evidence: `${CAPABILITY_EVIDENCE_REQUIREMENT[capability]}——GRN 回执入证据链，claim 绑定 ${item.ref}`,
          safety_requirement: null,
          execution_dependency:
            capability === "ui_interaction" ? ["after:environment_ground"] : ["parallel"],
        });
        continue;
      }
      if (absentFaceCaps.includes(capability)) {
        const faceKind = CAPABILITY_FACE[capability] as PlanChangeFaceKind;
        const face = faceByKind.get(faceKind) as PlanChangeFace;
        items.push({
          acceptance_ref: item.ref,
          evidence_requirement: CAPABILITY_EVIDENCE_REQUIREMENT[capability],
          capability,
          method: CAPABILITY_METHOD[capability],
          resolved_tool: null,
          tool_gap: null,
          target: [],
          environment: environment?.ref ?? null,
          applicability: "NOT_APPLICABLE",
          reason: `NOT_APPLICABLE：变更面显式声明 face ${faceKind} 不在座（依据：${face.basis}）——验收 ${item.ref} 无 ${capability} 证明义务（N/A 有据，非工具缺席降级）`,
          prerequisite: [],
          expected_evidence: "（无——不适用，零义务零证据）",
          safety_requirement: null,
          execution_dependency: ["parallel"],
        });
        continue;
      }
      // 未判定：不默认 REQUIRED 也不默认 N/A → unknown 保留（回 Expect 判定）。
      unknowns.push({
        kind: "unjudged_capability",
        ref: item.ref,
        detail: `验收未申报 ${capability} 义务（requires/exclusions 均缺席）、其变更面也不在座——是否有义务不可判定，保留 unknown`,
        source_ref: acceptanceSegment.sourceRef,
      });
    }
  }

  // items 排序（(acceptance_ref, capability) 码点序——非 localeCompare，跨环境字节
  // 稳定；canonicalJson/分母对账测试的 [...keys].sort() 同为码点序）保证字节稳定。
  items.sort(
    (a, b) =>
      (a.acceptance_ref < b.acceptance_ref ? -1 : a.acceptance_ref > b.acceptance_ref ? 1 : 0) ||
      (a.capability < b.capability ? -1 : a.capability > b.capability ? 1 : 0),
  );

  return {
    items,
    unknowns,
    informational: input.informational ?? null,
    inputs_fingerprint: sha256OfCanonical({
      acceptance: input.acceptance,
      changeSurface: input.changeSurface,
      environment: input.environment,
      toolBindings: input.toolBindings,
      permit: input.permit,
      informational: input.informational ?? null,
    }),
  };
}
