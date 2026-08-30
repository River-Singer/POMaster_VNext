/**
 * context.ts —— `pomaster context compile --role X`：八拍③ PROJECTION 的命令面。
 *
 * 只做编排与呈现：转调 kernel compileProjection（唯一判卷/派生权威），渲染四分区
 * markdown（MUST / ADVISORY / CATALOG / LAZY TOOLS）。MUST 区是 gate 判卷输入；
 * ADVISORY 区按触发条件注入、不进 gate 判卷输入（GOLDEN-L8-3）；CATALOG 区是
 * catalog/ 策展源的检索式注入（P14，§92.2：出处 catalog 非 project state，不进
 * 判卷输入）；投影是纯派生视图，不写 store。
 *
 * kernel scaffold 阶段（not-implemented）→ 结构化 KERNEL_NOT_INSTALLED（缺席显式，
 * 禁静默、禁伪绿）；kernel 落地后本命令自动升级，无需改动。
 */

import type {
  Projection,
  ProjectionRequest,
  Store,
} from "@pomaster/kernel";
import { TRUTH_INDEX_RELATIVE, toPosix, truthIndexPath } from "./store-layout.js";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

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
    readonly lazy_tools: readonly string[];
  };
  /** catalog 消费出处呈现（P14；§92.2——策展源出处显式，不混 project state）。 */
  readonly catalog_source: {
    readonly status: "catalog" | "absent";
    readonly root: string | null;
    readonly note: string;
  };
  /** 四分区 markdown（人读形态；机读走 manifest 字段——§45 双输出）。 */
  readonly markdown: string;
}

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

function renderMarkdown(
  role: string,
  projection: Projection,
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
  return `# Context Projection — role: ${role}

> inputs_fingerprint: ${projection.inputsFingerprint}
> 纯派生视图（八拍③）：不写 store、不产生治理事实；MUST 区为 gate 判卷输入，ADVISORY 区不进判卷（GOLDEN-L8-3）。

## MUST（gate 判卷输入）

${must}

## ADVISORY（按触发条件注入；不进 gate 判卷输入）

${advisory}

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
        manifest: { must_entries: [], advisory_entries: [], catalog_entries: [], lazy_tools: [] },
        catalog_source: { status: "absent", root: null, note: "context compile 未执行（store 未初始化）" },
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
    const projection = await kernel.compileProjection(store, { role });
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
        lazy_tools: [...projection.manifest.lazyTools],
      },
      catalog_source: {
        status: projection.catalogSource.status,
        root: projection.catalogSource.root,
        note: projection.catalogSource.note,
      },
      markdown: renderMarkdown(role, projection),
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
        manifest: { must_entries: [], advisory_entries: [], catalog_entries: [], lazy_tools: [] },
        catalog_source: { status: "absent", root: null, note: "context compile 未执行（kernel 错误）" },
        markdown: "",
      },
      [error],
      [`context compile: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
}
