/**
 * knowledge.ts —— `pomaster knowledge` 命令面（§44.10 五命令 + §83 上游候选通道；
 * P28-Commands）。
 *
 * 命令组（§44.10 逐字五命令 + 候选登记通道 record）：
 * - search <query>            检索呈现（§83.8「检索而不是全量注入」；检索语义单一
 *                             实现与投影注入同源 = kernel searchKnowledge——词级
 *                             精确 token 交集，禁子串/等价猜测）；
 * - inspect <id>              单条目全字段呈现（纯读）；
 * - record                    候选登记通道（§25.3「生成 Knowledge Candidate」；直登
 *                             形态 + --from-research 形态——P18 Research Evidence 是
 *                             §83 上游，finding→候选搬运映射见 runKnowledgeRecord 注记）；
 * - review-candidates         CANDIDATE 评审分母呈现（§83.10 提升链「Knowledge
 *                             Candidate → Validation」的等待面）；
 * - promote <id>              提升唯一通路 CLI 面（复用 P28a kernel promoteKnowledge
 *                             权威位词形闸 MAINTAIN/AUTHORITY/GATEKEEPER——§25.3
 *                             「晋升必须经过 Maintain / Authority / Gatekeeper」；
 *                             非权威位 = AUTHORITY_REQUIRED，§25.5 ⑦ 机器化）；
 * - demote <id>               降级/淘汰唯一通路 CLI 面（kernel demoteKnowledge；
 *                             §83.11 去僵化，reason 必填留痕）。
 *
 * 分层纪律：判卷/落盘权威在 @pomaster/kernel（knowledge.ts 语义入口唯一），本模块
 * 只做 argv 收敛与呈现，禁旁路写侧车。Authority 隔离呈现纪律（§83.2 铁律）：全部
 * 呈现面逐条携带 authority=ADVISORY 词形——knowledge 恒 ADVISORY，永不进 gate 判卷
 * 输入（GOLDEN-L8-3），本命令组没有任何写 truth-index 的通路。
 *
 * 纯读零建账：search/inspect/review-candidates 不调 createStore（幂等初始化会写
 * 骨架文件）——路径派生走 kernel buildStorePaths 纯函数 + readKnowledgeLibrary
 * 同一装载面（authority/status 词形 fail-closed 防线与写通路共享，view/audit
 * 「纯读零写入」先例）。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildStorePaths,
  demoteKnowledge,
  GovernanceError,
  promoteKnowledge,
  readKnowledgeLibrary,
  recordKnowledge,
  searchKnowledge,
  KNOWLEDGE_LIBRARY_RELATIVE,
} from "@pomaster/kernel";
import type { Store } from "@pomaster/kernel";
import type { CliError, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseActorArgv, requireInitialized } from "./permit.js";
import { hostShapeViolation, normalizeDir, readIndexYaml } from "./research.js";
import { toPosix } from "./store-layout.js";

type UnknownRecord = Record<string, unknown>;

/** kernel 所需最小面（结构化类型；缺省 = @pomaster/kernel 真实导出）。 */
export interface KnowledgeKernelDeps {
  createStore: (rootDir: string) => Promise<Store>;
  readKnowledgeLibrary: typeof readKnowledgeLibrary;
  searchKnowledge: typeof searchKnowledge;
  recordKnowledge: typeof recordKnowledge;
  promoteKnowledge: typeof promoteKnowledge;
  demoteKnowledge: typeof demoteKnowledge;
}

function defaultKernel(): KnowledgeKernelDeps {
  return {
    createStore: (root: string) => {
      // 动态 import 保持与既有命令模块同构（延迟装载 @pomaster/kernel）。
      return import("@pomaster/kernel").then((mod) => mod.createStore(root));
    },
    readKnowledgeLibrary,
    searchKnowledge,
    recordKnowledge,
    promoteKnowledge,
    demoteKnowledge,
  };
}

/** 纯读装载（不建账）：truth-index 缺席显式（NOT_INITIALIZED），再走 kernel 装载面。 */
async function loadLibraryPure(
  rootDir: string,
  kernel: KnowledgeKernelDeps,
): Promise<
  | { readonly library: ReturnType<typeof readKnowledgeLibrary> }
  | { readonly error: CliError }
> {
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return initialized;
  const paths = buildStorePaths(rootDir);
  return { library: kernel.readKnowledgeLibrary(paths) };
}

/** GovernanceError → CliError 归一（governance 码位透传；非治理错误 KERNEL_ERROR）。 */
function toCliError(err: unknown): CliError {
  if (err instanceof GovernanceError) {
    return governanceErrorToCliError(err);
  }
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: "查看 docs/kernel-api.md §16（knowledge 契约）；若为环境异常请勿静默降级。",
  };
}

function fail<T>(result: T, command: string, error: CliError): CommandOutcome<T> {
  return failOutcome(command, result, [error], [
    `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

// ============================================================
// knowledge search（§44.10 / §83.8 检索呈现）
// ============================================================

export interface KnowledgeSearchHitView {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly status: string;
  readonly confidence: string;
  readonly authority: string;
  readonly matched_tokens: readonly string[];
}

export interface KnowledgeSearchResult {
  readonly query: string;
  readonly role: string | null;
  readonly total_in_library: number;
  readonly hits: readonly KnowledgeSearchHitView[];
}

export async function runKnowledgeSearch(
  rootDir: string,
  input: { readonly query: string; readonly role?: string },
  deps?: Partial<KnowledgeKernelDeps>,
): Promise<CommandOutcome<KnowledgeSearchResult>> {
  const command = "knowledge search";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: KnowledgeSearchResult = {
    query: input.query,
    role: input.role ?? null,
    total_in_library: 0,
    hits: [],
  };
  if (input.query.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "<query> 为空（§44.10 knowledge search <query>；空查询 = 全量注入倾向，禁）",
      hint: "给出检索词（§83.8「检索而不是全量注入」——检索域非空才有命中语义）。",
    });
  }
  try {
    const loaded = await loadLibraryPure(rootDir, kernel);
    if ("error" in loaded) return fail(empty, command, loaded.error);
    const library = loaded.library;
    const hits = kernel.searchKnowledge(library, {
      role: input.role,
      hints: [input.query],
    });
    const view: KnowledgeSearchResult = {
      query: input.query,
      role: input.role ?? null,
      total_in_library: library.entries.length,
      hits: hits.map((hit) => ({
        id: hit.entry.id,
        kind: hit.entry.kind,
        title: hit.entry.title,
        status: hit.entry.status,
        confidence: hit.entry.confidence,
        authority: hit.entry.authority,
        matched_tokens: [...hit.matchedTokens],
      })),
    };
    const human = [
      `knowledge search → ${view.hits.length} 命中（库内 ${view.total_in_library} 条；§83.8 检索而非全量注入）`,
      ...view.hits.map(
        (hit) =>
          `  ${hit.id} [${hit.kind}/${hit.status}/${hit.confidence}/authority=${hit.authority}] ${hit.title}（命中 token: ${hit.matched_tokens.join("/")}）`,
      ),
      ...(view.hits.length === 0
        ? ["  （无命中——检索而非全量：未命中的知识不注入 [ADVISORY] 分区，显式空）"]
        : []),
    ];
    return okOutcome(command, view, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}

// ============================================================
// knowledge inspect（§44.10 单条目检视）
// ============================================================

export interface KnowledgeInspectResult {
  readonly id: string;
  readonly found: boolean;
  readonly entry: Readonly<Record<string, unknown>> | null;
}

export async function runKnowledgeInspect(
  rootDir: string,
  id: string,
  deps?: Partial<KnowledgeKernelDeps>,
): Promise<CommandOutcome<KnowledgeInspectResult>> {
  const command = "knowledge inspect";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: KnowledgeInspectResult = { id, found: false, entry: null };
  try {
    const loaded = await loadLibraryPure(rootDir, kernel);
    if ("error" in loaded) return fail(empty, command, loaded.error);
    const entry = loaded.library.entries.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      return fail(empty, command, {
        code: "OBJECT_NOT_FOUND",
        message: `knowledge 不在册：${id}（${toPosix(KNOWLEDGE_LIBRARY_RELATIVE)} 无此 id）`,
        hint: "先经 pomaster knowledge record 登记知识候选（§25.3 Knowledge Candidate）；knowledge search 可查在册命中清单。",
      });
    }
    const result: KnowledgeInspectResult = {
      id,
      found: true,
      entry: entry as unknown as Readonly<Record<string, unknown>>,
    };
    const human = [
      `knowledge inspect → ${entry.id}（authority=${entry.authority} 恒 ADVISORY——§83.2 铁律）`,
      `  kind=${entry.kind} status=${entry.status} confidence=${entry.confidence} last_validated_at=${entry.last_validated_at === null ? "null" : String(entry.last_validated_at)}`,
      `  title: ${entry.title}`,
      `  triggers: ${entry.triggers.length > 0 ? entry.triggers.join(" | ") : "(none)"}`,
      `  observations: ${entry.observations.length > 0 ? entry.observations.join(" | ") : "(none)"}`,
      `  diagnostic_questions: ${entry.diagnostic_questions.length > 0 ? entry.diagnostic_questions.join(" | ") : "(none)"}`,
      `  recommendation: ${entry.recommendation.length > 0 ? entry.recommendation.join(" | ") : "(none)"}`,
      `  counter_examples: ${entry.counter_examples.length > 0 ? entry.counter_examples.join(" | ") : "(none)"}`,
      `  source_episodes: ${entry.source_episodes.length > 0 ? entry.source_episodes.join(" | ") : "(none)"}`,
      `  demoted_from: ${entry.demoted_from ?? "null"} | review_ref: ${entry.review_ref ?? "null"} | promoted_ref: ${entry.promoted_ref ?? "null"}`,
      `  recorded_by: ${entry.recorded_by.actor_type}:${entry.recorded_by.actor} @ seq=${entry.recorded_at_seq}`,
      entry.note === null ? "  note: (none)" : `  note: ${entry.note}`,
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}

// ============================================================
// knowledge record（候选登记通道；§25.3 + §83 上游 P18）
// ============================================================

export interface KnowledgeRecordInput {
  readonly id?: string;
  readonly kind?: string;
  readonly title?: string;
  readonly confidence?: string;
  readonly triggers?: readonly string[];
  readonly diagnosticQuestions?: readonly string[];
  readonly recommendations?: readonly string[];
  readonly counterExamples?: readonly string[];
  readonly sourceEpisodes?: readonly string[];
  readonly demotedFrom?: string;
  readonly reviewRef?: string;
  readonly fromResearch?: string;
  readonly finding?: number;
  readonly actor: string;
  readonly note?: string;
}

export interface KnowledgeRecordResult {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly confidence: string;
  readonly status: string;
  readonly authority: string;
  readonly source_episodes: readonly string[];
  readonly from_research: string | null;
  readonly recorded_at_seq: number;
}

/**
 * 候选登记（status 恒 CANDIDATE 起步——kernel recordKnowledge 强制，CLI 不提供
 * 初始状态覆盖位）。
 *
 * --from-research 映射（P18 Research Evidence → §83 Knowledge 候选；decisions 裁定）：
 * - finding.statement → title（finding 的身份陈述句）；finding.sources →
 *   source_episodes（§83 上游 episode 引用承载）；finding.confidence → confidence
 *   （词形同源 HIGH/MEDIUM/LOW——vocab 注记「知识候选上游是 Research 产物 P18，
 *   词形复用不发明新值」）；显式 flag 优先于 finding 搬运值。
 * - id / kind 必须显式给：finding 的 evidence_type（§81.4 五级 Evidence 词轴）与
 *   knowledge kind（§83.3 四类型词轴）值域不相交——机械映射即发明未登记等价
 *   （P31「禁启发式猜测」同款纪律）；跨轴收编须走词汇表 PR。
 */
export async function runKnowledgeRecord(
  rootDir: string,
  input: KnowledgeRecordInput,
  deps?: Partial<KnowledgeKernelDeps>,
): Promise<CommandOutcome<KnowledgeRecordResult>> {
  const command = "knowledge record";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: KnowledgeRecordResult = {
    id: input.id ?? "",
    kind: input.kind ?? "",
    title: input.title ?? "",
    confidence: input.confidence ?? "",
    status: "CANDIDATE",
    authority: "ADVISORY",
    source_episodes: [...(input.sourceEpisodes ?? [])],
    from_research: input.fromResearch ?? null,
    recorded_at_seq: 0,
  };
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  const actor = parseActorArgv(input.actor);
  if ("error" in actor) return fail(empty, command, actor.error);

  let title = input.title?.trim() ?? "";
  let confidence = input.confidence?.trim() ?? "";
  let sourceEpisodes = [...(input.sourceEpisodes ?? [])];
  let fromResearchRef: string | null = null;

  if (input.fromResearch !== undefined) {
    const finding = await loadResearchFinding(rootDir, input.fromResearch, input.finding);
    if ("error" in finding) return fail(empty, command, finding.error);
    fromResearchRef = finding.artifactRoot;
    if (title.length === 0) title = finding.statement;
    if (confidence.length === 0) confidence = finding.confidence;
    sourceEpisodes = [
      ...sourceEpisodes,
      ...finding.sources.filter((source) => !sourceEpisodes.includes(source)),
    ];
  }

  try {
    const store = await kernel.createStore(rootDir);
    const entry = await kernel.recordKnowledge(store, {
      id: input.id ?? "",
      kind: input.kind ?? "",
      title,
      triggers: input.triggers ?? [],
      diagnosticQuestions: input.diagnosticQuestions ?? [],
      recommendation: input.recommendations ?? [],
      counterExamples: input.counterExamples ?? [],
      confidence,
      sourceEpisodes,
      demotedFrom: input.demotedFrom,
      reviewRef: input.reviewRef,
      recordedBy: actor.actor,
      note: input.note,
    });
    const result: KnowledgeRecordResult = {
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      confidence: entry.confidence,
      status: entry.status,
      authority: entry.authority,
      source_episodes: [...entry.source_episodes],
      from_research: fromResearchRef,
      recorded_at_seq: entry.recorded_at_seq,
    };
    const human = [
      `knowledge record → ${result.id}（status=${result.status} 恒 CANDIDATE 起步；authority=${result.authority} 恒 ADVISORY——§83.2 铁律）`,
      `  kind=${result.kind} confidence=${result.confidence} title: ${result.title}`,
      result.from_research === null
        ? "  登记形态: 直登（§25.3 Knowledge Candidate）"
        : `  登记形态: --from-research（§83 上游 P18；artifact=${result.from_research}）`,
      `  台账: ${toPosix(KNOWLEDGE_LIBRARY_RELATIVE)} + journal KNOWLEDGE_RECORDED`,
      "  后续: pomaster knowledge review-candidates 查看评审分母（§83.10 链：Validation → 权威位 promote）",
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}

/** research finding 读取（--from-research 通道）。artifact 词形与宿主位判卷同 research inspect。 */
async function loadResearchFinding(
  rootDir: string,
  researchId: string,
  findingNumber: number | undefined,
): Promise<
  | {
      readonly artifactRoot: string;
      readonly statement: string;
      readonly confidence: string;
      readonly sources: readonly string[];
    }
  | { readonly error: CliError }
> {
  if (!Number.isInteger(findingNumber) || (findingNumber as number) < 1) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--finding 须为正整数序号（1 起；got ${String(findingNumber)}）`,
        hint: "research inspect 的 findings 清单顺序即序号分母；--from-research 必须与 --finding 成对。",
      },
    };
  }
  const posix = researchId.split("\\").join("/");
  const artifactRoot = posix.endsWith("index.yaml")
    ? posix.slice(0, -"index.yaml".length)
    : normalizeDir(posix);
  if (!artifactRoot.endsWith("/research/")) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--from-research "${researchId}" 不是 artifact 面词形（<host>/research/）`,
        hint: "research-id = artifact 根目录（与 research inspect 同款书写归一）。",
      },
    };
  }
  const hostRef = artifactRoot.slice(0, -"research/".length);
  const violation = hostShapeViolation(hostRef);
  if (violation !== null) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `--from-research ${violation}（"${researchId}"）`,
        hint: "宿主是仓内相对目录（尾斜杠可省）。",
      },
    };
  }
  const indexPath = join(rootDir, ...artifactRoot.split("/"), "index.yaml");
  if (!existsSync(indexPath)) {
    return {
      error: {
        code: "RESEARCH_ARTIFACT_NOT_FOUND",
        message: `research artifact 不存在：${artifactRoot}`,
        hint: "pomaster research list <task-or-discovery> 查看宿主产物；--from-research 只读已存在的 research 产物。",
      },
    };
  }
  const index = await readIndexYaml(indexPath);
  if (index === null) {
    return {
      error: {
        code: "INDEX_NOT_MACHINE_PARSEABLE",
        message: `${artifactRoot}index.yaml 不是 JSON 兼容形态（机读要求 JSON）`,
        hint: "骨架生成的 index.yaml 即机读形态；自由手写 yaml 请人读或改写为 JSON 兼容形态。",
      },
    };
  }
  // H6a（二轮审查）：与 research inspect 的 B3 闸同款同码——findings「键存在但非数组」
  // 是字段级整体损坏 ≠ 合法空分母，禁静默折叠为空数组后降级成「序号越界」错误
  //（与 inspect 的字段级损坏显式拒语义对齐，消两条 --from-research/inspect 通道漂移）。
  if (index.findings !== undefined && !Array.isArray(index.findings)) {
    return {
      error: {
        code: "INDEX_NOT_MACHINE_PARSEABLE",
        message: `${artifactRoot}index.yaml 的 findings 字段损坏（键存在但非数组——损坏非缺席，禁静默折叠为空分母）`,
        hint: "「findings 键真缺席」才是合法空分母（骨架未填写）；修正为 findings: []（骨架形态）或合法 findings 数组后重试。",
      },
    };
  }
  const findings = Array.isArray(index.findings) ? (index.findings as unknown[]) : [];
  const idx = (findingNumber as number) - 1;
  const finding = findings[idx];
  if (finding === undefined || finding === null || typeof finding !== "object") {
    return {
      error: {
        code: "OBJECT_NOT_FOUND",
        message: `finding #${String(findingNumber)} 不在 ${artifactRoot}index.yaml（findings 共 ${String(findings.length)} 条）`,
        hint: "序号从 1 起、按 findings 数组顺序；越界序号显式拒绝不静默钳位。",
      },
    };
  }
  const record = finding as UnknownRecord;
  const statement = record.statement;
  const confidence = record.confidence;
  if (typeof statement !== "string" || statement.trim().length === 0) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `finding #${String(findingNumber)} 缺 statement 字符串字段（§81.4 六字段契约）`,
        hint: "形态不完整的 finding 不冒充已判（fail-closed）；pomaster research inspect 查看判读明细。",
      },
    };
  }
  const sources: string[] = Array.isArray(record.sources)
    ? (record.sources as unknown[]).filter(
        (source): source is string => typeof source === "string" && source.trim().length > 0,
      )
    : [];
  return {
    artifactRoot,
    statement: statement.trim(),
    confidence: typeof confidence === "string" ? confidence.trim() : "",
    sources,
  };
}

// ============================================================
// knowledge review-candidates（§83.10 提升链等待面）
// ============================================================

export interface KnowledgeReviewCandidatesResult {
  readonly total_in_library: number;
  readonly candidates: readonly {
    readonly id: string;
    readonly kind: string;
    readonly title: string;
    readonly confidence: string;
    readonly authority: string;
    readonly from_research: boolean;
    readonly demoted_from: string | null;
  }[];
}

export async function runKnowledgeReviewCandidates(
  rootDir: string,
  deps?: Partial<KnowledgeKernelDeps>,
): Promise<CommandOutcome<KnowledgeReviewCandidatesResult>> {
  const command = "knowledge review-candidates";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: KnowledgeReviewCandidatesResult = { total_in_library: 0, candidates: [] };
  try {
    const loaded = await loadLibraryPure(rootDir, kernel);
    if ("error" in loaded) return fail(empty, command, loaded.error);
    const library = loaded.library;
    const candidates = library.entries
      .filter((entry) => entry.status === "CANDIDATE")
      .map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        confidence: entry.confidence,
        authority: entry.authority,
        from_research: entry.source_episodes.length > 0,
        demoted_from: entry.demoted_from,
      }));
    const result: KnowledgeReviewCandidatesResult = {
      total_in_library: library.entries.length,
      candidates,
    };
    const human = [
      `knowledge review-candidates → ${candidates.length} 条 CANDIDATE（库内 ${result.total_in_library} 条；§83.10 提升链等待面）`,
      ...candidates.map(
        (candidate) =>
          `  ${candidate.id} [${candidate.kind}/${candidate.confidence}/authority=${candidate.authority}] ${candidate.title}` +
          `${candidate.from_research ? "（来源含 research episode——§83 上游 P18）" : ""}` +
          `${candidate.demoted_from === null ? "" : `（§83.11 降级谱系 from=${candidate.demoted_from}）`}`,
      ),
      ...(candidates.length === 0
        ? ["  （无待评审候选——显式空；pomaster knowledge record 登记后在此可见）"]
        : [
            "  链路（§83.10）：Validation → 权威位（MAINTAIN/AUTHORITY/GATEKEEPER）promote → Current Policy/Truth（maintain 面）",
          ]),
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}

// ============================================================
// knowledge promote（§44.10 / §83.10 提升唯一通路 CLI 面）
// ============================================================

export interface KnowledgePromotionCliInput {
  readonly id: string;
  readonly promotionAuthority?: string;
  readonly authorityRef?: string;
  readonly promotedRef?: string;
  readonly actor: string;
  readonly note?: string;
}

export interface KnowledgePromotionResult {
  readonly id: string;
  readonly from_status: string;
  readonly status: string;
  readonly promotion_authority: string | null;
  readonly authority_ref: string | null;
  readonly promoted_ref: string | null;
  readonly authority: string;
}

export async function runKnowledgePromote(
  rootDir: string,
  input: KnowledgePromotionCliInput,
  deps?: Partial<KnowledgeKernelDeps>,
): Promise<CommandOutcome<KnowledgePromotionResult>> {
  const command = "knowledge promote";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: KnowledgePromotionResult = {
    id: input.id,
    from_status: "",
    status: "",
    promotion_authority: input.promotionAuthority ?? null,
    authority_ref: input.authorityRef ?? null,
    promoted_ref: input.promotedRef ?? null,
    authority: "ADVISORY",
  };
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  const actor = parseActorArgv(input.actor);
  if ("error" in actor) return fail(empty, command, actor.error);
  if (
    input.promotionAuthority === undefined ||
    input.promotionAuthority.trim().length === 0
  ) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--promotion-authority 必填（§25.3 权威位词形闸）",
      hint: "权威位词形：MAINTAIN | AUTHORITY | GATEKEEPER（Knowledge Curator 等策展角色不在权威位闭包——§25.5 ⑦）。",
    });
  }
  if (input.authorityRef === undefined || input.authorityRef.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--authority-ref 必填（权威位申报审批引用留痕）",
      hint: "给出审批/决策引用（§83.10 Governance Proposal 链；C5 自报留痕可审计）。",
    });
  }
  if (input.promotedRef === undefined || input.promotedRef.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--promoted-ref 必填（§83.10「→ Current Policy/Truth」提升指向）",
      hint: "给出 Governance Proposal / Policy 引用；强约束载体是提升后经 P11 maintain 面落地的 Policy/Truth 对象（knowledge 本体恒 ADVISORY）。",
    });
  }
  try {
    const store = await kernel.createStore(rootDir);
    // from_status 呈现值：kernel 判卷权威前的只读快照（在册性/矩阵合法性仍由
    // kernel promoteKnowledge 判——本读取只服务呈现，不预判不短路）。
    const before = readKnowledgeLibrary(buildStorePaths(rootDir)).entries.find(
      (candidate) => candidate.id === input.id,
    );
    const entry = await kernel.promoteKnowledge(store, {
      id: input.id,
      promotionAuthority: input.promotionAuthority,
      authorityRef: input.authorityRef,
      promotedRef: input.promotedRef,
      promotedBy: actor.actor,
      note: input.note,
    });
    const result: KnowledgePromotionResult = {
      id: entry.id,
      from_status: before?.status ?? "UNKNOWN",
      status: entry.status,
      promotion_authority: input.promotionAuthority,
      authority_ref: input.authorityRef,
      promoted_ref: entry.promoted_ref,
      authority: entry.authority,
    };
    const human = [
      `knowledge promote → ${result.id}（${result.from_status}→${result.status}；权威位=${result.promotion_authority} ref=${result.authority_ref}）`,
      `  promoted_ref: ${result.promoted_ref ?? "null"}（§83.10「只有 Promotion 完成后，才可成为强约束」——强约束载体是 maintain 面落地的 Policy/Truth 对象）`,
      `  knowledge 本体 authority=${result.authority} 恒 ADVISORY：PROMOTED 只是谱系状态，永不进 gate 判卷输入（§83.2 铁律）`,
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}

// ============================================================
// knowledge demote（§44.10 / §83.11 去僵化唯一通路 CLI 面）
// ============================================================

export interface KnowledgeDemotionCliInput {
  readonly id: string;
  readonly reason?: string;
  readonly actor: string;
  readonly note?: string;
}

export interface KnowledgeDemotionResult {
  readonly id: string;
  readonly from_status: string;
  readonly status: string;
  readonly reason: string | null;
  readonly authority: string;
}

export async function runKnowledgeDemote(
  rootDir: string,
  input: KnowledgeDemotionCliInput,
  deps?: Partial<KnowledgeKernelDeps>,
): Promise<CommandOutcome<KnowledgeDemotionResult>> {
  const command = "knowledge demote";
  const kernel = { ...defaultKernel(), ...deps };
  const empty: KnowledgeDemotionResult = {
    id: input.id,
    from_status: "",
    status: "",
    reason: input.reason ?? null,
    authority: "ADVISORY",
  };
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  const actor = parseActorArgv(input.actor);
  if ("error" in actor) return fail(empty, command, actor.error);
  if (input.reason === undefined || input.reason.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--reason 必填（淘汰不留原因 = 静默降级，禁）",
      hint: "给出降级/淘汰原因（journal KNOWLEDGE_DEMOTED 留痕；§83.11 去僵化「POMaster 必须支持『去僵化』」）。",
    });
  }
  try {
    const store = await kernel.createStore(rootDir);
    // from_status 呈现值：kernel 判卷权威前的只读快照（在册性/矩阵合法性仍由
    // kernel demoteKnowledge 判——本读取只服务呈现，不预判不短路）。
    const before = readKnowledgeLibrary(buildStorePaths(rootDir)).entries.find(
      (candidate) => candidate.id === input.id,
    );
    const entry = await kernel.demoteKnowledge(store, {
      id: input.id,
      reasonShort: input.reason,
      demotedBy: actor.actor,
      note: input.note,
    });
    const result: KnowledgeDemotionResult = {
      id: entry.id,
      from_status: before?.status ?? "UNKNOWN",
      status: entry.status,
      reason: input.reason,
      authority: entry.authority,
    };
    const human = [
      `knowledge demote → ${result.id}（${result.from_status}→${result.status}；reason: ${result.reason}）`,
      `  §83.11 去僵化：「POMaster 必须支持『去僵化』，而不是只有规则越来越多」——ADVISORY 面内动作（§83.2 权威性 NO，不影响任何 gate），journal KNOWLEDGE_DEMOTED 留痕`,
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(empty, command, toCliError(err));
  }
}
