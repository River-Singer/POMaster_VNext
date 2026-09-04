/**
 * context.ts —— `pomaster context compile --role X`：八拍③ PROJECTION 的命令面。
 *
 * 只做编排与呈现：转调 kernel compileProjection（唯一判卷/派生权威），渲染五分区
 * markdown。vNext Batch 2 R3（Owner 裁定 D8 2026-09-04）：分区词形对齐 PRD §8.1④
 * 五分区闭包——AUTHORITATIVE PROJECT STATE / REQUIRED POLICY / ADVISORY KNOWLEDGE /
 * REUSE / CATALOG（LAZY TOOLS 并入）/ VERIFICATION（词形闭包常量
 * CONTEXT_PARTITION_TITLES；cli 局部呈现词 TODO(vocab-pr)，登记归词汇表批次）。
 *
 * **判卷输入等价性 ADR（R3；语义保持等价的机器论证）**：
 * - 机器现实：gate 判卷输入 = kernel manifest.mustEntries（不变量，本批零改动；
 *   normalizeGateResult 零改动）。mustEntries 与 task 无关 POLICY=0、knowledge 恒
 *   排除、catalog/knowledge 分区永不混入——全部由对抗测试钉住（不变）。
 * - 呈现映射：原 MUST 区一分为二——ref 前缀 POLICY.* 的条目 → REQUIRED POLICY 分区；
 *   其余（分母对象/锚行/authority deny/sources）→ AUTHORITATIVE PROJECT STATE 分区。
 *   二者**不相交且并集恰为 mustEntries**（纯呈现拆分，零增删），故
 *   「gate 判卷输入 = AUTHORITATIVE PROJECT STATE ∪ REQUIRED POLICY」与原
 *   「= MUST 区」逐条目等价。
 * - VERIFICATION 分区是加法呈现位（R1 Evidence Spec 引用），不进 mustEntries、
 *   不进 inputsFingerprint、不参与 normalizeGateResult 判卷——它呈现的是八拍⑤
 *   VERIFY 拍的判卷**对象面**（按 Spec 资格条件判卷的引用清单，消费在 closeout），
 *   PRD §8.1④「gate 判卷输入 = AUTHORITATIVE ∪ REQUIRED POLICY ∪ VERIFICATION」
 *   的第三项在机器现实里的承载是 closeout DoD Spec 维度（R1 落地），不是投影
 *   manifest 的新字段。
 * - [AUTHORITATIVE]/[ADVISORY] 注记词形（CONTEXT_AUTHORITY_PARTITION_VALUES，schemas
 *   词表）适配新分区：AUTHORITATIVE PROJECT STATE 与 REQUIRED POLICY 携
 *   [AUTHORITATIVE]（同属判卷输入）；ADVISORY KNOWLEDGE 携 [ADVISORY]。
 *
 * 分区内容映射（ADR 映射表）：MUST 区 → [AUTHORITATIVE PROJECT STATE] +
 * [REQUIRED POLICY]（按 ref 前缀拆分）；原 ADVISORY + KNOWLEDGE 两区合一呈现 →
 * [ADVISORY KNOWLEDGE]（manifest 字段保持 advisory_entries/knowledge_entries 两键
 * 零语义变更）；原 CATALOG + LAZY TOOLS → [REUSE / CATALOG]（catalog 策展注记 +
 * 懒加载工具清单同区呈现）；[VERIFICATION] 首版承载 Evidence Spec 绑定引用
 * （boundEvidenceSpecRefs；无绑定 → 显式空区，缺席诚实）。
 *
 * vNext Batch 2 R2（Owner 裁定 D7 2026-09-04）：context manifest 落盘
 * `.pomaster/state/contexts/<task-id>.context.json`（无 taskRef 时 role 键名
 * `<role>.context.json`——§58 context_recompile_per_role 词形；ADR 留痕）。manifest
 * 字段：task_ref / generated_at_seq（store seq，A4 零墙钟）/ compiler（tool id +
 * kernel 版本锚）/ inputs_fingerprint / 五分区 entries（每条 ref+reason）/
 * catalog_source。纪律：
 * - **编译产物非第二配置源**（宪法 §19）：只读服务面禁手改（D24）；重编译覆盖同 id
 *   文件（字节稳定可比对——同输入重放逐字节相等）；
 * - **stale→recompile**：落盘/检查时比对现盘 manifest 的 inputs_fingerprint → 漂移
 *   即 STALE_GROUNDING 显式呈现 + 指路重编译，不静默覆盖（词形启用 18 号
 *   decision-graph schema 的 P1 预留位 STALE_GROUNDING——schema 词面已在，启用不新增；
 *   TODO(vocab-pr) 收编归词汇表批次）；现盘文件不可解析同按 STALE_GROUNDING 处置
 *   （必然不是 fresh，呈现细节区分）；
 * - `--check`：纯读比对呈现（FRESH/STALE_GROUNDING/ABSENT 三态 + 现盘 fingerprint
 *   回显），零写入；stale 不阻断（ok=true，呈现不阻断是 D24 read_only_service 姿态；
 *   ADR 留痕）。
 *
 * P0.5-1（PRD §5.4；裁决 8 ②）`context explain`：catalog include/exclude 决策
 * 记录面（why_included/why_excluded 逐条）——决策记录与 Agent Context 严格隔离
 * （excluded 不进五分区 manifest，只用于 explain/Audit/Eval/Debug）。
 *
 * kernel scaffold 阶段（not-implemented）→ 结构化 KERNEL_NOT_INSTALLED（缺席显式，
 * 禁静默、禁伪绿）。
 */

import { readFileSync } from "node:fs";
import type {
  CatalogEntryDecision,
  CatalogProjectionSource,
  EvidenceSpecRefView,
  Projection,
  ProjectionRequest,
  Store,
} from "@pomaster/kernel";
import { KERNEL_TOOL } from "@pomaster/kernel";
import { INIT_TOOL_ID } from "./digest.js";
import {
  TRUTH_INDEX_RELATIVE,
  contextsDirPath,
  toPosix,
  truthIndexPath,
} from "./store-layout.js";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

// ============================================================
// 分区词形闭包（vNext Batch 2 R3 / D8；cli 局部呈现词 TODO(vocab-pr)）
// ============================================================

/**
 * 五分区标题词形（PRD §8.1④ 2026-09-04 裁定 D8 逐字；呈现层闭包——markdown 标题与
 * 落盘 manifest partitions 键的唯一词源）。TODO(vocab-pr)：cli 局部词 pending_vocab_pr
 * （词表管辖「留痕或入锁」纪律的留痕形态——triage 先例；登记归词汇表批次）。
 */
export const CONTEXT_PARTITION_TITLES = [
  "AUTHORITATIVE PROJECT STATE",
  "REQUIRED POLICY",
  "ADVISORY KNOWLEDGE",
  "REUSE / CATALOG",
  "VERIFICATION",
] as const;
export type ContextPartitionTitle = (typeof CONTEXT_PARTITION_TITLES)[number];

/** 落盘 manifest schema 词形（vNext Batch 2 R2/D7；cli 局部词 TODO(vocab-pr)）。 */
export const CONTEXT_MANIFEST_SCHEMA = "pomaster.context-manifest/1" as const;

/** kernel 错误分类：not-implemented → NOT_INSTALLED（缺席显式）；其余 → KERNEL_ERROR。 */
export function classifyKernelError(err: unknown): CliError {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("not-implemented")) {
    return {
      code: "KERNEL_NOT_INSTALLED",
      message: `kernel capability not available: ${message}`,
      hint: "@pomaster/kernel 为 scaffold（not-implemented）；等 kernel 模块建造者落地后本命令自动生效。",
    };
  }
  return {
    code: "KERNEL_ERROR",
    message,
    hint: "查看 docs/kernel-api.md 对应契约；若为环境异常请勿静默降级。",
  };
}

/** context compile/explain 共享的结构化 applicability 输入（P0.5-1；全 optional 零破坏）。
 * A1 裁定（2026-09-04，vNext Batch 4 R1）：治理档位不设输入位——档位信息性，
 * 不参与 catalog applicability 判卷。 */
export interface ContextApplicabilityInputs {
  /** CHANGE.* / TASK.* 引用（透传 taskRef——激活许可通道）。 */
  readonly change?: string;
  /** CAPABILITY.* governed id 清单（可重复旗标收集）。 */
  readonly capabilities?: readonly string[];
  /** ∈ CATALOG_CHANGE_CLASS_VALUES（kernel 侧 fail-closed 校验）。 */
  readonly changeClass?: string;
}

/** applicability 输入 → ProjectionRequest 增量字段（缺席字段零键——禁 undefined 值键污染）。 */
function applicabilityRequestFields(
  inputs?: ContextApplicabilityInputs,
): Partial<ProjectionRequest> {
  if (inputs === undefined) return {};
  return {
    ...(inputs.change !== undefined ? { taskRef: inputs.change } : {}),
    ...(inputs.capabilities !== undefined && inputs.capabilities.length > 0
      ? { capabilities: inputs.capabilities }
      : {}),
    ...(inputs.changeClass !== undefined ? { changeClass: inputs.changeClass } : {}),
  };
}

/** applicability 输入回显（snake_case 机读面；全 null/空 = 未提供，缺席显式）。 */
export interface ApplicabilityInputsView {
  readonly change: string | null;
  readonly capabilities: readonly string[];
  readonly change_class: string | null;
}

function applicabilityViewOf(inputs?: ContextApplicabilityInputs): ApplicabilityInputsView {
  return {
    change: inputs?.change ?? null,
    capabilities: [...(inputs?.capabilities ?? [])],
    change_class: inputs?.changeClass ?? null,
  };
}

/** applicability 输入是否全缺（全缺时 markdown 零新增行——O7 输入面字节零变化）。 */
function hasAnyApplicabilityInput(inputs?: ContextApplicabilityInputs): boolean {
  return (
    inputs !== undefined &&
    (inputs.change !== undefined ||
      (inputs.capabilities !== undefined && inputs.capabilities.length > 0) ||
      inputs.changeClass !== undefined)
  );
}

/** applicability 输入的人读行（「字段=值」；禁值杜撰——缺席字段不渲染）。 */
function applicabilityInputsLine(inputs?: ContextApplicabilityInputs): string | null {
  if (!hasAnyApplicabilityInput(inputs)) return null;
  const parts: string[] = [];
  if (inputs?.change !== undefined) parts.push(`change=${inputs.change}`);
  if (inputs?.capabilities !== undefined && inputs.capabilities.length > 0) {
    parts.push(`capabilities=${inputs.capabilities.join("/")}`);
  }
  if (inputs?.changeClass !== undefined) parts.push(`change_class=${inputs.changeClass}`);
  return `> applicability: ${parts.join("；")}`;
}

/** CLI 所需的 kernel 最小面（结构化类型；默认实现 = @pomaster/kernel 真实导出）。 */
export interface ContextKernelDeps {
  createStore: (rootDir: string) => Promise<Store>;
  compileProjection: (
    store: Store,
    request: ProjectionRequest,
  ) => Promise<Projection>;
  /** Evidence Spec 绑定引用派生（vNext Batch 2 R1/R3；缺省 = kernel 真实导出）。 */
  boundEvidenceSpecRefs: (
    store: Store,
    taskRef: string,
  ) => Promise<readonly EvidenceSpecRefView[]>;
}

/** 落盘 context manifest 文档形态（vNext Batch 2 R2/D7；宪法 §19 编译产物六要素）。 */
interface ContextManifestDocument {
  readonly schema: typeof CONTEXT_MANIFEST_SCHEMA;
  readonly task_ref: string | null;
  readonly role: string;
  readonly generated_at_seq: number;
  readonly compiler: { readonly tool: string; readonly kernel: string };
  readonly inputs_fingerprint: string;
  readonly applicability: ApplicabilityInputsView;
  readonly partitions: {
    readonly authoritative_project_state: readonly { ref: string; reason: string }[];
    readonly required_policy: readonly { ref: string; reason: string }[];
    readonly advisory_knowledge: readonly { ref: string; reason: string }[];
    readonly reuse_catalog: readonly { ref: string; reason: string }[];
    readonly verification: readonly { ref: string; reason: string }[];
  };
  readonly catalog_source: {
    readonly status: "catalog" | "absent";
    readonly root: string | null;
    readonly note: string;
  };
}

/**
 * 组装落盘 manifest（vNext Batch 2 R2/D7 字段集；分区映射 ADR 见模块头注：
 * authoritative_project_state ∪ required_policy = manifest.must_entries——判卷输入
 * 等价性；advisory_knowledge = advisory + knowledge 两键合一；reuse_catalog =
 * catalog_entries + lazy_tools 条目化；verification = Evidence Spec 绑定引用）。
 */
function buildContextManifestDocument(input: {
  readonly role: string;
  readonly taskRef: string | null;
  readonly generatedAtSeq: number;
  readonly projection: Projection;
  readonly applicability: ApplicabilityInputsView;
  readonly verificationRefs: readonly EvidenceSpecRefView[];
}): ContextManifestDocument {
  const { projection } = input;
  return {
    schema: CONTEXT_MANIFEST_SCHEMA,
    task_ref: input.taskRef,
    role: input.role,
    generated_at_seq: input.generatedAtSeq,
    compiler: { tool: INIT_TOOL_ID, kernel: KERNEL_TOOL },
    inputs_fingerprint: projection.inputsFingerprint,
    applicability: input.applicability,
    partitions: {
      authoritative_project_state: projection.manifest.mustEntries
        .filter((e) => !e.ref.startsWith("POLICY."))
        .map((e) => ({ ref: e.ref, reason: e.reason })),
      required_policy: projection.manifest.mustEntries
        .filter((e) => e.ref.startsWith("POLICY."))
        .map((e) => ({ ref: e.ref, reason: e.reason })),
      advisory_knowledge: [
        ...projection.manifest.advisoryEntries,
        ...projection.manifest.knowledgeEntries,
      ].map((e) => ({ ref: e.ref, reason: e.reason })),
      reuse_catalog: [
        ...projection.manifest.catalogEntries.map((e) => ({ ref: e.ref, reason: e.reason })),
        ...projection.manifest.lazyTools.map((tool) => ({
          ref: tool,
          reason: "lazy tool 按需物化（出处 catalog/tools；复用目录呈现位，非判卷输入）",
        })),
      ],
      verification: input.verificationRefs.map((spec) => ({
        ref: spec.ref,
        reason: `Evidence Spec 绑定本任务（lifecycle=${spec.lifecycle}；via ${spec.via}）——closeout 按资格条件判卷`,
      })),
    },
    catalog_source: {
      status: projection.catalogSource.status,
      root: projection.catalogSource.root,
      note: projection.catalogSource.note,
    },
  };
}

export interface ContextCompileResult {
  readonly role: string;
  readonly inputs_fingerprint: string;
  readonly manifest: {
    readonly must_entries: readonly { ref: string; reason: string }[];
    readonly advisory_entries: readonly { ref: string; reason: string }[];
    readonly catalog_entries: readonly { ref: string; reason: string }[];
    readonly knowledge_entries: readonly { ref: string; reason: string }[];
    readonly lazy_tools: readonly string[];
  };
  /** catalog 消费出处呈现（P14；§92.2——策展源出处显式，不混 project state）。 */
  readonly catalog_source: {
    readonly status: "catalog" | "absent";
    readonly root: string | null;
    readonly note: string;
  };
  /**
   * 结构化 applicability 输入回显（P0.5-1；全 null/空 = 未提供——缺席显式，
   * 判卷可重放：同输入同 fingerprint）。
   */
  readonly applicability: ApplicabilityInputsView;
  /** 五分区 markdown（人读形态；机读走 manifest 字段——§45 双输出）。 */
  readonly markdown: string;
  /**
   * 落盘 manifest 相对路径（POSIX；vNext Batch 2 R2/D7）。--check 模式与写失败时
   * null（check 模式零写入——路径是 would-be 位，不冒充已落盘）。
   */
  readonly manifest_path: string | null;
  /** 是否已落盘（--check 模式恒 false；ADR 留痕）。 */
  readonly persisted: boolean;
  /**
   * stale 检查结果（vNext Batch 2 R2/D7；STALE_GROUNDING 词形启用 18 号 schema P1
   * 预留位——schema 词面已在，启用不新增）。absent = 现盘无 manifest；fresh = 指纹
   * 一致；stale_grounding = 指纹漂移或现盘不可解析（手改/损坏按 stale 处置，细节在
   * detail）。--check 模式零写入只呈现；写模式漂移时显式覆盖 + warning 呈现。
   */
  readonly stale_check: {
    readonly state: "absent" | "fresh" | "stale_grounding";
    readonly detail: string;
    readonly existing_inputs_fingerprint: string | null;
  };
}

/** context compile 选项（vNext Batch 2 R2/D7）。 */
export interface ContextCompileOptions {
  /** --check：纯读比对呈现 stale 状态，零写入（ADR：呈现不阻断，ok 语义不变）。 */
  readonly check?: boolean;
}

/** manifest 落盘文件名（ADR：有 taskRef 用 <task-id>.context.json；无则 <role>.context.json——§58 context_recompile_per_role 词形）。 */
function contextManifestFileName(
  role: string,
  inputs?: ContextApplicabilityInputs,
): string {
  const taskRef = inputs?.change;
  return `${taskRef !== undefined && taskRef.trim().length > 0 ? taskRef : role}.context.json`;
}

/** 现盘 manifest 读取（缺席 → absent；不可解析/形态非对象 → stale_grounding——必然不 fresh）。 */
function readExistingManifest(
  rootDir: string,
  fileName: string,
): {
  readonly state: "absent" | "stale_grounding" | "present";
  readonly detail: string;
  readonly existing_inputs_fingerprint: string | null;
} {
  let text: string;
  try {
    text = readFileSync(`${contextsDirPath(rootDir)}/${fileName}`, "utf8");
  } catch {
    return {
      state: "absent",
      detail: "现盘无 context manifest（首编译）",
      existing_inputs_fingerprint: null,
    };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("manifest is not an object");
    }
    const fingerprint = (parsed as Record<string, unknown>).inputs_fingerprint;
    if (typeof fingerprint !== "string" || fingerprint.length === 0) {
      throw new TypeError("inputs_fingerprint missing or malformed");
    }
    return {
      state: "present",
      detail: "现盘 manifest 在册（指纹比对见 state 判定）",
      existing_inputs_fingerprint: fingerprint,
    };
  } catch (error) {
    return {
      state: "stale_grounding",
      detail: `现盘 manifest 无法解析（手改/损坏——禁手改纪律，宪法 §19）：${error instanceof Error ? error.message : String(error)}`,
      existing_inputs_fingerprint: null,
    };
  }
}

/**
 * 五分区 markdown 渲染（vNext Batch 2 R3 / D8：PRD §8.1④ 词形闭包逐字；内容映射
 * ADR 见模块头注——MUST 区按 ref 前缀一分为二，机器判卷输入 mustEntries 零变更）。
 */
function renderMarkdown(
  role: string,
  projection: Projection,
  applicabilityLine: string | null,
  verificationRefs: readonly EvidenceSpecRefView[],
): string {
  const entry = (e: { readonly ref: string; readonly reason: string }): string =>
    `- \`${e.ref}\` — ${e.reason}`;
  // MUST 区一分为二（呈现拆分，并集恰为 mustEntries——判卷输入等价性 ADR）：
  // ref 前缀 POLICY.* → REQUIRED POLICY；其余（分母对象/锚行/authority deny/sources）
  // → AUTHORITATIVE PROJECT STATE。
  const authoritative = projection.manifest.mustEntries.filter(
    (e) => !e.ref.startsWith("POLICY."),
  );
  const requiredPolicy = projection.manifest.mustEntries.filter((e) =>
    e.ref.startsWith("POLICY."),
  );
  const authoritativeBody =
    authoritative.length > 0
      ? authoritative.map(entry).join("\n")
      : "_（空——本角色本任务无 AUTHORITATIVE PROJECT STATE 注入项）_";
  const requiredPolicyBody =
    requiredPolicy.length > 0
      ? requiredPolicy.map(entry).join("\n")
      : "_（空——本角色本任务无 REQUIRED POLICY 注入项）_";
  // 原 ADVISORY + KNOWLEDGE 两区合一呈现（manifest 两键零语义变更——机器面分母不变）。
  const advisoryAll = [
    ...projection.manifest.advisoryEntries,
    ...projection.manifest.knowledgeEntries,
  ];
  const advisoryBody =
    advisoryAll.length > 0
      ? advisoryAll.map(entry).join("\n")
      : "_（空——无触发条件命中/检索命中的经验注入）_";
  // §92.2：catalog 分区出处逐字标明（catalog 策展源 ≠ project state）；LAZY TOOLS
  // 并入本区（D8；懒加载工具是 catalog/tools 的按需物化面，同属复用目录）。
  const catalogHeader =
    projection.catalogSource.status === "catalog"
      ? `> source: ${projection.catalogSource.root}\n> ${projection.catalogSource.note}\n> 策展源非判卷输入（§92.2：Catalog 不是第二套 Project Truth）；条目 lifecycle/enforcement 以 catalog 为准。`
      : `> ${projection.catalogSource.note}`;
  const catalogBody =
    projection.manifest.catalogEntries.length > 0
      ? projection.manifest.catalogEntries.map(entry).join("\n")
      : "_（空——无 lane 命中的 catalog 条目）_";
  const lazyBody =
    projection.manifest.lazyTools.length > 0
      ? projection.manifest.lazyTools.map((t) => `- lazy tool: ${t}`).join("\n")
      : "- _（无）_";
  // VERIFICATION（R1 联动）：Evidence Spec 绑定引用（boundEvidenceSpecRefs；无绑定
  // → 显式空区，缺席诚实——首版不承载工具阈值判卷面，物料修订归 Batch 4）。
  const verificationBody =
    verificationRefs.length > 0
      ? verificationRefs
          .map(
            (spec) =>
              `- \`${spec.ref}\` — Evidence Spec 绑定本任务（lifecycle=${spec.lifecycle}；via ${spec.via}）——closeout 按资格条件判卷（挪证缝收口）`,
          )
          .join("\n")
      : "_（空——本任务无 CURRENT 生命周期 Evidence Spec 绑定；缺席诚实，不冒充零验证义务）_";
  // [AUTHORITATIVE]/[ADVISORY] 注记词形（CONTEXT_AUTHORITY_PARTITION_VALUES 消费）
  // 适配新分区：前两区同属 gate 判卷输入携 [AUTHORITATIVE]；ADVISORY KNOWLEDGE 携
  // [ADVISORY]（knowledge 恒 ADVISORY——§83.2 铁律词形不变）。
  return `# Context Projection — role: ${role}

> inputs_fingerprint: ${projection.inputsFingerprint}
${applicabilityLine !== null ? `${applicabilityLine}\n` : ""}> 纯派生视图（八拍③）：不写 store、不产生治理事实；gate 判卷输入 = AUTHORITATIVE PROJECT STATE ∪ REQUIRED POLICY（机器分母 = manifest.must_entries，R3 等价性 ADR），ADVISORY KNOWLEDGE / REUSE / CATALOG 不进判卷（GOLDEN-L8-3）。

## AUTHORITATIVE PROJECT STATE（[AUTHORITATIVE] gate 判卷输入）

${authoritativeBody}

## REQUIRED POLICY（[AUTHORITATIVE] POLICY.* 判卷输入）

${requiredPolicyBody}

## ADVISORY KNOWLEDGE（[ADVISORY] 经验注入；不进 gate 判卷输入——出处逐条在 reason）

${advisoryBody}

## REUSE / CATALOG（catalog 策展 + lazy tools；出处 catalog，非 project state——§92.2）

${catalogHeader}

${catalogBody}

${lazyBody}

## VERIFICATION（Evidence Spec 绑定引用；判卷对象面——消费在八拍⑤/⑧）

${verificationBody}
`;
}

export async function runContextCompile(
  rootDir: string,
  role: string,
  deps?: Partial<ContextKernelDeps>,
  inputs?: ContextApplicabilityInputs,
  options?: ContextCompileOptions,
): Promise<CommandOutcome<ContextCompileResult>> {
  const { readFile } = await import("node:fs/promises");
  let indexText: string;
  try {
    indexText = await readFile(truthIndexPath(rootDir), "utf8");
  } catch {
    return failOutcome(
      "context compile",
      {
        role,
        inputs_fingerprint: "",
        manifest: { must_entries: [], advisory_entries: [], catalog_entries: [], knowledge_entries: [], lazy_tools: [] },
        catalog_source: { status: "absent", root: null, note: "context compile 未执行（store 未初始化）" },
        applicability: applicabilityViewOf(inputs),
        markdown: "",
        manifest_path: null,
        persisted: false,
        stale_check: { state: "absent", detail: "store 未初始化——未执行 stale 检查", existing_inputs_fingerprint: null },
      },
      [
        {
          code: "NOT_INITIALIZED",
          message: `no pomaster state found at ${toPosix(TRUTH_INDEX_RELATIVE)}`,
          hint: "run: pomaster init 后再编译投影。",
        },
      ],
      ["context compile: FAILED — NOT_INITIALIZED"],
    );
  }

  const kernel: ContextKernelDeps = {
    createStore:
      deps?.createStore ??
      ((async (root: string) => {
        const { createStore } = await import("@pomaster/kernel");
        return createStore(root);
      }) as ContextKernelDeps["createStore"]),
    compileProjection:
      deps?.compileProjection ??
      ((async (store: Store, request: ProjectionRequest) => {
        const { compileProjection } = await import("@pomaster/kernel");
        return compileProjection(store, request);
      }) as ContextKernelDeps["compileProjection"]),
    boundEvidenceSpecRefs:
      deps?.boundEvidenceSpecRefs ??
      ((async (store: Store, taskRef: string) => {
        const { boundEvidenceSpecRefs } = await import("@pomaster/kernel");
        return boundEvidenceSpecRefs(store, taskRef);
      }) as ContextKernelDeps["boundEvidenceSpecRefs"]),
  };

  try {
    const store = await kernel.createStore(rootDir);
    const taskRef = inputs?.change;
    const projection = await kernel.compileProjection(store, {
      role,
      ...applicabilityRequestFields(inputs),
    });

    // —— A4 零墙钟：generated_at_seq 取 store seq（generation.seq；status.ts 同源读取）。 ——
    let generatedAtSeq = 0;
    try {
      const rawIndex = JSON.parse(indexText) as Record<string, unknown>;
      const generation = rawIndex.generation;
      if (generation !== null && typeof generation === "object" && !Array.isArray(generation)) {
        const seq = (generation as Record<string, unknown>).seq;
        if (typeof seq === "number") generatedAtSeq = seq;
      }
    } catch {
      // 索引不可解析时 compileProjection 已先行显式爆（loadTruthIndex SCHEMA_INVALID）；
      // 本读取只服务呈现，不静默引入第二错误通道（seq 回退 0 与 status.ts 同纪律）。
    }

    // —— VERIFICATION 分区（R1 联动）：Evidence Spec 绑定引用派生（仅 taskRef 在场）。 ——
    let verificationRefs: readonly EvidenceSpecRefView[] = [];
    const verificationWarnings: CliWarning[] = [];
    if (taskRef !== undefined && taskRef.trim().length > 0) {
      try {
        verificationRefs = await kernel.boundEvidenceSpecRefs(store, taskRef);
      } catch (err) {
        // 呈现面派生失败可见不静默（warning 通道）；gate 判卷输入语义零变更
        // （verification 不进 must_entries/fingerprint——R3 等价性 ADR）。
        verificationWarnings.push({
          code: "KERNEL_ERROR",
          message: `Evidence Spec 绑定引用派生失败（VERIFICATION 分区呈现为空，不冒充无绑定）：${err instanceof Error ? err.message : String(err)}`,
          hint: "呈现位失败不影响投影判卷输入；核查 SPEC.* 对象正文后重编译。",
        });
      }
    }

    const applicabilityLine = applicabilityInputsLine(inputs);
    const markdown = renderMarkdown(role, projection, applicabilityLine, verificationRefs);

    // —— 落盘 / stale 检查（vNext Batch 2 R2/D7）——
    const fileName = contextManifestFileName(role, inputs);
    const relativePath = toPosix(
      `${contextsDirPath(rootDir).slice(rootDir.length + 1)}/${fileName}`,
    );
    const existing = readExistingManifest(rootDir, fileName);
    const fingerprint = projection.inputsFingerprint;
    let staleState: "absent" | "fresh" | "stale_grounding";
    let staleDetail: string;
    if (existing.state === "absent") {
      staleState = "absent";
      staleDetail = "现盘无 context manifest（首编译落盘）";
    } else if (existing.state === "stale_grounding") {
      staleState = "stale_grounding";
      staleDetail = existing.detail;
    } else if (existing.existing_inputs_fingerprint === fingerprint) {
      staleState = "fresh";
      staleDetail = "现盘 manifest 指纹一致（同输入重放字节稳定）";
    } else {
      staleState = "stale_grounding";
      staleDetail =
        `STALE_GROUNDING：现盘 manifest inputs_fingerprint=${existing.existing_inputs_fingerprint} 与本次编译 ${fingerprint} 漂移（Truth/Policy/catalog 已更新）——本次编译即为重编译，覆盖写同 id 文件；可用 context compile --check 随时复核`;
    }
    const stale_check: ContextCompileResult["stale_check"] = {
      state: staleState,
      detail: staleDetail,
      existing_inputs_fingerprint:
        existing.state === "absent" ? null : existing.existing_inputs_fingerprint,
    };

    const warnings: CliWarning[] = [...verificationWarnings];
    if (staleState === "stale_grounding" && !options?.check) {
      warnings.push({
        code: "STALE_GROUNDING",
        message: staleDetail,
        hint: "重编译已完成（覆盖写）；禁手改 context manifest（编译产物，宪法 §19）——后继编译请以 --check 复核。",
      });
    }

    let manifestPath: string | null = null;
    let persisted = false;
    if (options?.check === true) {
      // --check：纯读比对呈现，零写入（ADR：stale 不阻断——呈现不阻断是 D24 姿态）。
      manifestPath = null;
      persisted = false;
    } else {
      const document = buildContextManifestDocument({
        role,
        taskRef: taskRef ?? null,
        generatedAtSeq,
        projection,
        applicability: applicabilityViewOf(inputs),
        verificationRefs,
      });
      const { mkdirSync, writeFileSync } = await import("node:fs");
      try {
        mkdirSync(contextsDirPath(rootDir), { recursive: true });
        // 字节稳定（A4）：JSON indent 2 + 尾换行；同输入重放逐字节相等（可比对）。
        writeFileSync(
          `${contextsDirPath(rootDir)}/${fileName}`,
          `${JSON.stringify(document, null, 2)}\n`,
          "utf8",
        );
        manifestPath = relativePath;
        persisted = true;
      } catch (err) {
        // 落盘失败显式爆（「默认落盘」契约未达成禁假绿）；编译产物仍在 stdout/结果中。
        return failOutcome(
          "context compile",
          {
            role,
            inputs_fingerprint: fingerprint,
            manifest: {
              must_entries: projection.manifest.mustEntries.map((e) => ({ ref: e.ref, reason: e.reason })),
              advisory_entries: projection.manifest.advisoryEntries.map((e) => ({ ref: e.ref, reason: e.reason })),
              catalog_entries: projection.manifest.catalogEntries.map((e) => ({ ref: e.ref, reason: e.reason })),
              knowledge_entries: projection.manifest.knowledgeEntries.map((e) => ({ ref: e.ref, reason: e.reason })),
              lazy_tools: [...projection.manifest.lazyTools],
            },
            catalog_source: {
              status: projection.catalogSource.status,
              root: projection.catalogSource.root,
              note: projection.catalogSource.note,
            },
            applicability: applicabilityViewOf(inputs),
            markdown,
            manifest_path: null,
            persisted: false,
            stale_check,
          },
          [
            {
              code: "ENVIRONMENT_ERROR",
              message: `context manifest 落盘失败：${relativePath}（${err instanceof Error ? err.message : String(err)}）`,
              hint: "检查 .pomaster/state/contexts/ 可写性后重编译；落盘是 R2/D7 默认契约，失败不静默降级为纯 stdout。",
            },
          ],
          [`context compile: FAILED — ENVIRONMENT_ERROR（manifest 落盘失败）`],
        );
      }
    }

    const result: ContextCompileResult = {
      role,
      inputs_fingerprint: fingerprint,
      manifest: {
        must_entries: projection.manifest.mustEntries.map((e) => ({ ref: e.ref, reason: e.reason })),
        advisory_entries: projection.manifest.advisoryEntries.map((e) => ({ ref: e.ref, reason: e.reason })),
        catalog_entries: projection.manifest.catalogEntries.map((e) => ({ ref: e.ref, reason: e.reason })),
        knowledge_entries: projection.manifest.knowledgeEntries.map((e) => ({ ref: e.ref, reason: e.reason })),
        lazy_tools: [...projection.manifest.lazyTools],
      },
      catalog_source: {
        status: projection.catalogSource.status,
        root: projection.catalogSource.root,
        note: projection.catalogSource.note,
      },
      applicability: applicabilityViewOf(inputs),
      markdown,
      manifest_path: manifestPath,
      persisted,
      stale_check,
    };
    const human = [
      ...markdown.split("\n"),
      `> context manifest: ${persisted ? `已落盘 ${manifestPath}` : "--check 纯读（零写入）"}；stale 状态=${stale_check.state}${stale_check.state === "stale_grounding" ? "（STALE_GROUNDING——重编译已完成/或现盘不可解析，见 warnings）" : ""}`,
    ];
    return okOutcome("context compile", result, human, warnings);
  } catch (err) {
    const error = classifyKernelError(err);
    return failOutcome(
      "context compile",
      {
        role,
        inputs_fingerprint: "",
        manifest: { must_entries: [], advisory_entries: [], catalog_entries: [], knowledge_entries: [], lazy_tools: [] },
        catalog_source: { status: "absent", root: null, note: "context compile 未执行（kernel 错误）" },
        applicability: applicabilityViewOf(inputs),
        markdown: "",
        manifest_path: null,
        persisted: false,
        stale_check: { state: "absent", detail: "kernel 错误——未执行 stale 检查", existing_inputs_fingerprint: null },
      },
      [error],
      [`context compile: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
}

// ============================================================
// context explain（P0.5-1；PRD §5.4 决策记录面）
// ============================================================

/** explain 结果（决策记录与 Agent Context 严格隔离——excluded 不进五分区 manifest）。 */
export interface ContextExplainResult {
  readonly role: string;
  /** applicability 输入回显（判卷可重放）。 */
  readonly applicability: ApplicabilityInputsView;
  readonly catalog_source: CatalogProjectionSource;
  /** 全量决策（policies included+excluded 与 presets included；ref 确定性排序）。 */
  readonly decisions: readonly CatalogEntryDecision[];
  /** 人读 markdown（INCLUDED/EXCLUDED 两区，逐条 why——PRD §5.4 词形）。 */
  readonly markdown: string;
}

/** CLI 所需的 explain kernel 最小面（结构化类型；默认实现 = @pomaster/kernel 真实导出）。 */
export interface ContextExplainKernelDeps {
  createStore: (rootDir: string) => Promise<Store>;
  explainCatalogProjection: (
    store: Store,
    request: ProjectionRequest,
  ) => Promise<import("@pomaster/kernel").CatalogProjectionExplanation>;
}

/**
 * `context explain`：catalog include/exclude 决策记录（PRD §5.4 四用途：
 * explain / Audit / Eval / Debug）。判卷权威在 kernel explainCatalogProjection
 * （与 compileProjection 共享判定核）；本函数只编排与呈现。excluded 决策不进
 * 任何投影分区（与 Agent Context 严格隔离——PRD §5.4 明文）。
 */
export async function runContextExplain(
  rootDir: string,
  role: string,
  deps?: Partial<ContextExplainKernelDeps>,
  inputs?: ContextApplicabilityInputs,
): Promise<CommandOutcome<ContextExplainResult>> {
  const { readFile } = await import("node:fs/promises");
  try {
    await readFile(truthIndexPath(rootDir), "utf8");
  } catch {
    return failOutcome(
      "context explain",
      {
        role,
        applicability: applicabilityViewOf(inputs),
        catalog_source: { status: "absent", root: null, note: "context explain 未执行（store 未初始化）" },
        decisions: [],
        markdown: "",
      },
      [
        {
          code: "NOT_INITIALIZED",
          message: `no pomaster state found at ${toPosix(TRUTH_INDEX_RELATIVE)}`,
          hint: "run: pomaster init 后再解释投影。",
        },
      ],
      ["context explain: FAILED — NOT_INITIALIZED"],
    );
  }

  const kernel: ContextExplainKernelDeps = {
    createStore:
      deps?.createStore ??
      ((async (root: string) => {
        const { createStore } = await import("@pomaster/kernel");
        return createStore(root);
      }) as ContextExplainKernelDeps["createStore"]),
    explainCatalogProjection:
      deps?.explainCatalogProjection ??
      ((async (store: Store, request: ProjectionRequest) => {
        const { explainCatalogProjection } = await import("@pomaster/kernel");
        return explainCatalogProjection(store, request);
      }) as ContextExplainKernelDeps["explainCatalogProjection"]),
  };

  try {
    const store = await kernel.createStore(rootDir);
    const explanation = await kernel.explainCatalogProjection(store, {
      role,
      ...applicabilityRequestFields(inputs),
    });
    const included = explanation.decisions.filter(
      (decision) => decision.decision === "included",
    );
    const excluded = explanation.decisions.filter(
      (decision) => decision.decision === "excluded",
    );
    const inputLine = applicabilityInputsLine(inputs);
    const markdown = `# Context Explain — catalog include/exclude（PRD §5.4 决策记录面）

> role: ${role}
${inputLine !== null ? `${inputLine}\n` : ""}> source: ${explanation.catalogSource.status === "catalog" ? explanation.catalogSource.root : explanation.catalogSource.note}
> 决策记录与 Agent Context 严格隔离：excluded 不进五分区 manifest（只用于 explain/Audit/Eval/Debug——PRD §5.4）。

## INCLUDED（${included.length}）

${included.length > 0 ? included.map((d) => `- \`${d.ref}\` — why_included: ${d.why_included ?? "（无）"}`).join("\n") : "_（无 included 条目）_"}

## EXCLUDED（${excluded.length}）

${excluded.length > 0 ? excluded.map((d) => `- \`${d.ref}\` — why_excluded: ${d.why_excluded ?? "（无）"}`).join("\n") : "_（无 excluded 条目）_"}
`;
    const result: ContextExplainResult = {
      role,
      applicability: applicabilityViewOf(inputs),
      catalog_source: explanation.catalogSource,
      decisions: explanation.decisions,
      markdown,
    };
    return okOutcome("context explain", result, markdown.split("\n"));
  } catch (err) {
    const error = classifyKernelError(err);
    return failOutcome(
      "context explain",
      {
        role,
        applicability: applicabilityViewOf(inputs),
        catalog_source: { status: "absent", root: null, note: "context explain 未执行（kernel 错误）" },
        decisions: [],
        markdown: "",
      },
      [error],
      [`context explain: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
}
