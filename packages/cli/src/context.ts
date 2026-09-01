/**
 * context.ts —— `pomaster context compile --role X`：八拍③ PROJECTION 的命令面。
 *
 * 只做编排与呈现：转调 kernel compileProjection（唯一判卷/派生权威），渲染五分区
 * markdown（MUST / ADVISORY / KNOWLEDGE / CATALOG / LAZY TOOLS）。MUST 区是 gate
 * 判卷输入（§83.8 [AUTHORITATIVE] 分区承载）；ADVISORY 区按触发条件注入、不进 gate
 * 判卷输入（GOLDEN-L8-3）；KNOWLEDGE 区是 knowledge 侧车的 [ADVISORY] 检索注入
 * （P28-Commands，§83.8「检索而不是全量注入」——按 Change Localization 检索命中，
 * 出处 state/knowledge-library.json 逐条标明，绝不混入 MUST 判卷输入）；CATALOG 区
 * 是 catalog/ 策展源的检索式注入（P14，§92.2：出处 catalog 非 project state，不进
 * 判卷输入；P0.5-1 起按结构化 applicability 确定性过滤——PRD §5.2/§5.3）；投影是
 * 纯派生视图，不写 store。
 *
 * P0.5-1（PRD §5.4；裁决 8 ②）新增 `context explain`：catalog include/exclude 决策
 * 记录面（why_included/why_excluded 逐条）——决策记录与 Agent Context 严格隔离
 * （excluded 不进五分区 manifest，只用于 explain/Audit/Eval/Debug）。
 *
 * kernel scaffold 阶段（not-implemented）→ 结构化 KERNEL_NOT_INSTALLED（缺席显式，
 * 禁静默、禁伪绿）；kernel 落地后本命令自动升级，无需改动。
 */

import type {
  CatalogEntryDecision,
  CatalogProjectionSource,
  Projection,
  ProjectionRequest,
  Store,
} from "@pomaster/kernel";
import { TRUTH_INDEX_RELATIVE, toPosix, truthIndexPath } from "./store-layout.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

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

/** context compile/explain 共享的结构化 applicability 输入（P0.5-1；全 optional 零破坏）。 */
export interface ContextApplicabilityInputs {
  /** CHANGE.* / TASK.* 引用（透传 taskRef——激活许可通道）。 */
  readonly change?: string;
  /** CAPABILITY.* governed id 清单（可重复旗标收集）。 */
  readonly capabilities?: readonly string[];
  /** ∈ CATALOG_CHANGE_CLASS_VALUES（kernel 侧 fail-closed 校验）。 */
  readonly changeClass?: string;
  /** ∈ CATALOG_GOVERNANCE_PROFILE_VALUES（O2 对齐 TRIAGE_PROFILES+STRICT）。 */
  readonly governanceProfile?: string;
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
    ...(inputs.governanceProfile !== undefined
      ? { governanceProfile: inputs.governanceProfile }
      : {}),
  };
}

/** applicability 输入回显（snake_case 机读面；全 null/空 = 未提供，缺席显式）。 */
export interface ApplicabilityInputsView {
  readonly change: string | null;
  readonly capabilities: readonly string[];
  readonly change_class: string | null;
  readonly governance_profile: string | null;
}

function applicabilityViewOf(inputs?: ContextApplicabilityInputs): ApplicabilityInputsView {
  return {
    change: inputs?.change ?? null,
    capabilities: [...(inputs?.capabilities ?? [])],
    change_class: inputs?.changeClass ?? null,
    governance_profile: inputs?.governanceProfile ?? null,
  };
}

/** applicability 输入是否全缺（全缺时 markdown 零新增行——O7 输入面字节零变化）。 */
function hasAnyApplicabilityInput(inputs?: ContextApplicabilityInputs): boolean {
  return (
    inputs !== undefined &&
    (inputs.change !== undefined ||
      (inputs.capabilities !== undefined && inputs.capabilities.length > 0) ||
      inputs.changeClass !== undefined ||
      inputs.governanceProfile !== undefined)
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
  if (inputs?.governanceProfile !== undefined) {
    parts.push(`profile=${inputs.governanceProfile}`);
  }
  return `> applicability: ${parts.join("；")}`;
}

/** CLI 所需的 kernel 最小面（结构化类型；默认实现 = @pomaster/kernel 真实导出）。 */
export interface ContextKernelDeps {
  createStore: (rootDir: string) => Promise<Store>;
  compileProjection: (
    store: Store,
    request: ProjectionRequest,
  ) => Promise<Projection>;
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
}

function renderMarkdown(
  role: string,
  projection: Projection,
  applicabilityLine: string | null,
): string {
  const entry = (e: { readonly ref: string; readonly reason: string }): string =>
    `- \`${e.ref}\` — ${e.reason}`;
  const must =
    projection.manifest.mustEntries.length > 0
      ? projection.manifest.mustEntries.map(entry).join("\n")
      : "_（空——本角色本任务无 MUST 注入项）_";
  const advisory =
    projection.manifest.advisoryEntries.length > 0
      ? projection.manifest.advisoryEntries.map(entry).join("\n")
      : "_（空——无触发条件命中的经验注入）_";
  // §92.2：catalog 分区标题逐字标明出处（catalog 策展源 ≠ project state）；
  // 出处与 lock 校验走 catalog_source 呈现（缺席显式，不伪装成空策展）。
  const catalogHeader =
    projection.catalogSource.status === "catalog"
      ? `> source: ${projection.catalogSource.root}\n> ${projection.catalogSource.note}\n> 策展源非判卷输入（§92.2：Catalog 不是第二套 Project Truth）；条目 lifecycle/enforcement 以 catalog 为准。`
      : `> ${projection.catalogSource.note}`;
  const catalog =
    projection.manifest.catalogEntries.length > 0
      ? projection.manifest.catalogEntries.map(entry).join("\n")
      : "_（空——无 lane 命中的 catalog 条目）_";
  const lazy =
    projection.manifest.lazyTools.length > 0
      ? projection.manifest.lazyTools.map((t) => `- ${t}`).join("\n")
      : "- _（无）_";
  // §83.8 分区词形逐字：[AUTHORITATIVE]（MUST 区）/[ADVISORY]（ADVISORY/KNOWLEDGE 区）
  // ——CONTEXT_AUTHORITY_PARTITION_VALUES 消费；knowledge 分区出处逐条在 reason。
  const knowledge =
    projection.manifest.knowledgeEntries.length > 0
      ? projection.manifest.knowledgeEntries.map(entry).join("\n")
      : "_（空——无 Change Localization 检索命中的知识条目；检索而非全量注入，§83.8）_";
  return `# Context Projection — role: ${role}

> inputs_fingerprint: ${projection.inputsFingerprint}
${applicabilityLine !== null ? `${applicabilityLine}\n` : ""}> 纯派生视图（八拍③）：不写 store、不产生治理事实；MUST 区为 gate 判卷输入，ADVISORY/KNOWLEDGE 区不进判卷（GOLDEN-L8-3）。

## MUST（[AUTHORITATIVE] gate 判卷输入）

${must}

## ADVISORY（[ADVISORY] 按触发条件注入；不进 gate 判卷输入）

${advisory}

## KNOWLEDGE（[ADVISORY] 知识检索注入；出处 state/knowledge-library.json——§83.8 检索而非全量注入）

${knowledge}

## CATALOG（catalog 策展注入；出处 catalog，非 project state——§92.2）

${catalogHeader}

${catalog}

## LAZY TOOLS（按需物化；出处 catalog/tools）

${lazy}
`;
}

export async function runContextCompile(
  rootDir: string,
  role: string,
  deps?: Partial<ContextKernelDeps>,
  inputs?: ContextApplicabilityInputs,
): Promise<CommandOutcome<ContextCompileResult>> {
  const { readFile } = await import("node:fs/promises");
  try {
    await readFile(truthIndexPath(rootDir), "utf8");
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
  };

  try {
    const store = await kernel.createStore(rootDir);
    const projection = await kernel.compileProjection(store, {
      role,
      ...applicabilityRequestFields(inputs),
    });
    const applicabilityLine = applicabilityInputsLine(inputs);
    const result: ContextCompileResult = {
      role,
      inputs_fingerprint: projection.inputsFingerprint,
      manifest: {
        must_entries: projection.manifest.mustEntries.map((e) => ({
          ref: e.ref,
          reason: e.reason,
        })),
        advisory_entries: projection.manifest.advisoryEntries.map((e) => ({
          ref: e.ref,
          reason: e.reason,
        })),
        catalog_entries: projection.manifest.catalogEntries.map((e) => ({
          ref: e.ref,
          reason: e.reason,
        })),
        knowledge_entries: projection.manifest.knowledgeEntries.map((e) => ({
          ref: e.ref,
          reason: e.reason,
        })),
        lazy_tools: [...projection.manifest.lazyTools],
      },
      catalog_source: {
        status: projection.catalogSource.status,
        root: projection.catalogSource.root,
        note: projection.catalogSource.note,
      },
      applicability: applicabilityViewOf(inputs),
      markdown: renderMarkdown(role, projection, applicabilityLine),
    };
    return okOutcome(
      "context compile",
      result,
      result.markdown.split("\n"),
    );
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
