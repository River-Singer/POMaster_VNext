/**
 * resolve.ts —— `pomaster resolve <need>`：统一语义解析命令面（P-v06 批次 0；
 * PRD v0.6 §98 + v0.6.1 §69/§73/§87）。
 *
 * 判卷权威在 @pomaster/kernel 的 resolver 门面（resolveNeed：三精确腿 + 词形腿 +
 * match_class 确定性派生 + 分母披露），本模块只做编排与呈现（CLI 分层纪律）。
 * 纪律落点：
 * - 纯读零写入（loadStoreReadOnly——解析≠采用，INSTANCE_OF 边归显式采用动作）；
 * - store 未 init → NOT_CONFIGURED fail-closed（禁静默空结果冒充 NO_MATCH——
 *   「没查」与「查了没有」是两种语义，前者直接报错带路标）；
 * - catalog 根缺省 = 工具侧资产（resolveCatalogRoot；§92.2 catalog 是策展源非
 *   第二套 Project Truth——未 init 的目录同样可查 archetype 分母）；
 * - NO_MATCH 是合法且显式的输出（exit 0）：解析面不臆造（§87），「设计新」的
 *   决策归上游；非零退出码只留给入参缺陷与状态缺席。
 */
import {
  loadStoreReadOnly,
  resolveCatalogRoot,
  resolveNeed,
  type ResolverOutcome,
} from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";

/** `pomaster resolve` 输入（argv 已收敛为字符串）。 */
export interface ResolveInput {
  readonly need: string;
  readonly hints?: readonly string[];
  readonly catalogRoot?: string;
  readonly rootDir: string;
}

/** resolve 命令机读面（§45 --json 信封 result 位）。 */
export interface ResolveResult {
  readonly need: string;
  readonly match_class: ResolverOutcome["match_class"];
  readonly matches: ResolverOutcome["matches"];
  readonly alternatives: ResolverOutcome["alternatives"];
  readonly required_bindings: readonly string[];
  readonly required_gates: readonly string[];
  readonly why: string;
  readonly sources_examined: ResolverOutcome["sources_examined"];
}

/** 人读呈现（禁彩色自然语言当机读接口——机读走 --json）。 */
export function renderResolve(outcome: ResolverOutcome): readonly string[] {
  const lines: string[] = [];
  lines.push(`resolve: ${outcome.input.need}`);
  lines.push(`match_class: ${outcome.match_class}`);
  if (outcome.matches.length === 0) {
    lines.push("matches: (无——NO_MATCH 显式缺席，不臆造；分母见 sources_examined)");
  }
  for (const match of outcome.matches) {
    const tokens =
      match.matched_tokens.length > 0 ? ` [${match.matched_tokens.join(", ")}]` : "";
    lines.push(
      `  - ${match.domain}:${match.id}（${match.kind}；via=${match.via}${tokens}）`,
    );
  }
  if (outcome.alternatives.length > 0) {
    lines.push("alternatives:");
    for (const alt of outcome.alternatives.slice(0, 8)) {
      lines.push(`  - ${alt.domain}:${alt.id}（${alt.kind}）`);
    }
  }
  if (outcome.required_bindings.length > 0) {
    lines.push(`required_bindings: ${outcome.required_bindings.join(" / ")}`);
  }
  lines.push(`required_gates: ${outcome.required_gates.join(" / ")}`);
  lines.push(`sources_examined: ${JSON.stringify(outcome.sources_examined)}`);
  lines.push(`why: ${outcome.why}`);
  return lines;
}

/** resolve 命令编排（判卷零旁移——kernel resolveNeed 单一实现）。 */
export async function runResolve(
  input: ResolveInput,
): Promise<CommandOutcome<ResolveResult>> {
  try {
    const store = loadStoreReadOnly(input.rootDir);
    const catalogRoot = resolveCatalogRoot(input.catalogRoot);
    const outcome = await resolveNeed(store, catalogRoot, {
      need: input.need,
      hints: input.hints,
    });
    const result: ResolveResult = {
      need: outcome.input.need,
      match_class: outcome.match_class,
      matches: outcome.matches,
      alternatives: outcome.alternatives,
      required_bindings: outcome.required_bindings,
      required_gates: outcome.required_gates,
      why: outcome.why,
      sources_examined: outcome.sources_examined,
    };
    return okOutcome("resolve", result, renderResolve(outcome));
  } catch (error) {
    const cliError: CliError = {
      code: "RESOLVE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      hint:
        error instanceof Error && error.message.includes("store 未初始化")
          ? "先跑 pomaster init 建骨架（解析面只读消费 .pomaster/state；NOT_CONFIGURED 是状态缺席不是 NO_MATCH）"
          : "检查 need 词形与 --catalog-root 注入；判卷权威在 kernel resolveNeed（docs/kernel-api.md §29）",
    };
    return failOutcome("resolve", {} as ResolveResult, [cliError], []);
  }
}
