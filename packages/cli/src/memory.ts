/**
 * memory.ts —— `pomaster memory` 命令面（§44.10 memory 六命令逐字接线；P33b-Commands）。
 *
 * 六命令（PRD §44.10 L3069-3074 词形逐字）：
 * - capture [--scope project|user]  STRICT 模式统一入口（§48.5「用户"记住"请求
 *   统一走 memory capture」）：stdin 或 --text 收文本 → kernel captureMemory
 *   （恒 UNCLASSIFIED_PENDING+LOW——分类归 Memory Curator，PRD §48.4）；
 * - inspect                         inbox 总览：各桶计数/分母封闭/PENDING 清单
 *                                   （纯读零写入；无 inbox = 显式空合法态）；
 * - harvest <harness>               COMPATIBILITY 模式批量收割（§48.5）：--harness-dir
 *                                   显式目录优先；缺省探测仅注册 claude 词形
 *                                   （~/.claude/projects/<slug>/memory——slug=
 *                                   cwd 非 [A-Za-z0-9] 全替换 '-' 的确定性派生），
 *                                   其余 harness 无 --harness-dir 一律显式拒绝
 *                                   （禁猜测路径）；目录缺席 = MEMORY_HARVEST_NOT_RUN
 *                                   exit 1（显式 not_run envelope 非 fake 绿）；
 * - review [--list] / --decide      batch review 唯一人工闸（thread-B §4.2）：
 *                                   缺省 PENDING 队列；--list 全量+四面过滤；
 *                                   --decide <id> --promote|--reject（--note 必填
 *                                   留痕；--reclassify-* 只改分类标签——内容原文
 *                                   零改写铁律在 kernel 签名封条）；
 * - promote <memory-id>             分桶路由（kernel promoteMemory 唯一通路）：
 *                                   KNOWLEDGE→P28 knowledge 生命周期恒 CANDIDATE
 *                                   +ADVISORY 台账落盘确认行；USER→user-scope 台账；
 *                                   TRUTH/DECISION/EVIDENCE→OWNER_ESCALATION_REQUIRED
 *                                   词形 + exit 0 + result.owner_escalation 非空
 *                                   （不冒充成功也不 fail 误报——呈报显式）；
 * - audit                           kernel auditMemory 全量结果：分母封闭恒等式 +
 *                                   七桶计数 + Case N MEMORY_DRIFT（drift 段非空
 *                                   → exit 1 fail-closed，纯绿 exit 0）。
 *
 * 分层纪律：判卷/落盘权威在 @pomaster/kernel memory-harvest.ts（P33a 语义入口唯一）；
 * 本包只做 argv 收敛、错误词形映射与呈现。§84.6 铁律：本命令面没有任何写
 * Canonical State 的通路——TRUTH/DECISION/EVIDENCE 晋升只呈报不落 Canonical。
 * 错误词形纪律：MEMORY_CLI_ERROR_VALUES（schemas vocab.ts P33b 段，pending_vocab_pr）
 * 经元组解构取词（单一镜像点）；kernel GovernanceError 码位 → 命令面词形映射全部
 * 由确定性前置检查承载（读条目现状判分支），禁子串/模糊猜测映射。
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  GovernanceError,
  HARVEST_BUCKET_VALUES,
  MEMORY_CLASS_VALUES,
  MEMORY_CLI_ERROR_VALUES,
  MEMORY_DRIFT,
  MEMORY_INBOX_RELATIVE,
  OWNER_ESCALATION_REQUIRED,
  REVIEW_STATE_VALUES,
  auditMemory,
  captureMemory,
  decideInboxEntry,
  harvestHarness,
  inboxEntryIdOf,
  promoteMemory,
  readInboxEntries,
  readInboxEntry,
  reviewInbox,
  type Actor,
  type HarvestBucketValue,
  type HarvestHarnessReport,
  type InboxEntry,
  type InboxScopeValue,
  type MemoryAuditReport,
  type MemoryClassValue,
  type ReviewStateValue,
} from "@pomaster/kernel";
import type { CliError, CliWarning, CommandOutcome } from "./envelope.js";
import { failOutcome, okOutcome } from "./envelope.js";
import { governanceErrorToCliError, parseActorArgv, requireInitialized } from "./permit.js";

// 错误词形族单一镜像点：schemas vocab.ts MEMORY_CLI_ERROR_VALUES 元组解构
// （词形唯一来源；数组序即声明序——新增词形在 vocab 段追加，此处按位解构）。
const [
  MEMORY_ENTRY_NOT_FOUND,
  MEMORY_ALREADY_REVIEWED,
  MEMORY_REVIEW_REQUIRED,
  MEMORY_ALREADY_PROMOTED,
  MEMORY_PROMOTE_OWNER_REQUIRED,
  MEMORY_CAPTURE_DUPLICATE,
  MEMORY_HARVEST_NOT_RUN,
] = MEMORY_CLI_ERROR_VALUES;

/** GovernanceError → CliError 归一（governance 码位透传；非治理错误 KERNEL_ERROR）。 */
function toCliError(err: unknown, docSection: string): CliError {
  if (err instanceof GovernanceError) {
    return governanceErrorToCliError(err);
  }
  return {
    code: "KERNEL_ERROR",
    message: err instanceof Error ? err.message : String(err),
    hint: `查看 docs/kernel-api.md ${docSection}（memory 契约）；环境异常禁静默。`,
  };
}

function fail<T>(result: T, command: string, error: CliError): CommandOutcome<T> {
  return failOutcome(command, result, [error], [
    `${command}: FAILED — ${error.code}\n  hint: ${error.hint}`,
  ]);
}

/** inbox 条目的命令面呈现视图（snake_case 文件世界词形）。 */
interface InboxEntryView {
  readonly id: string;
  readonly batch: string;
  readonly source: string;
  readonly scope: string;
  readonly review_state: string;
  readonly bucket: string;
  readonly memory_class: string | null;
  readonly confidence: string;
  readonly needs_conflict_check: boolean;
  readonly title: string | null;
  readonly review_notes: string | null;
}

function entryView(entry: InboxEntry): InboxEntryView {
  return {
    id: entry.id,
    batch: entry.batch,
    source: entry.source,
    scope: entry.scope,
    review_state: entry.review_state,
    bucket: entry.proposal.bucket,
    memory_class: entry.proposal.memory_class,
    confidence: entry.proposal.confidence,
    needs_conflict_check: entry.needs_conflict_check,
    title: entry.proposal.title,
    review_notes: entry.review_notes,
  };
}

function inboxEntryNotFound(id: string): CliError {
  return {
    code: MEMORY_ENTRY_NOT_FOUND,
    message: `memory 条目不在册：${id}（${MEMORY_INBOX_RELATIVE}/** 无此 id）`,
    hint: "pomaster memory review --list 查看在册条目；id 是内容寻址词形（HM-<12hex>），原文变更即新条目。",
  };
}

// ============================================================
// harness 缺省探测（确定性 slug 派生；禁猜测）
// ============================================================

/** cwd → Claude Code 项目 slug（路径中非 [A-Za-z0-9] 逐字符替换 '-'；确定性派生）。 */
export function claudeProjectSlugOf(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

/**
 * harness 缺省 memory 目录（--harness-dir 缺席时的探测位）：
 * 仅注册 claude 词形 → ~/.claude/projects/<slug>/memory（slug 由 cwd 确定性派生）；
 * 其他 harness 词形一律显式拒绝（禁猜测路径——P31 declared-only 同源纪律）。
 */
export function defaultHarnessMemoryDir(
  harness: string,
  cwd: string,
): { readonly dir: string } | { readonly error: CliError } {
  if (harness !== "claude") {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `harness "${harness}" 无缺省探测位（缺省探测仅注册 claude 词形）`,
        hint: "非 claude harness 必须显式 --harness-dir <dir>（禁猜测路径——P31 declared-only 纪律）。",
      },
    };
  }
  return {
    dir: `${homedir()}/.claude/projects/${claudeProjectSlugOf(cwd)}/memory`,
  };
}

// ============================================================
// memory capture（§44.10 词形之一；STRICT 模式统一入口 §48.5）
// ============================================================

export interface MemoryCaptureInput {
  readonly scope?: string;
  readonly text?: string;
}

export interface MemoryCaptureResult {
  readonly action: "capture";
  readonly id: string;
  readonly batch: string;
  readonly scope: string;
  readonly source: string;
  readonly review_state: string;
  readonly proposal_bucket: string;
  readonly confidence: string;
  readonly path: string;
}

/** stdin 读取（--text 缺席时；TTY 直跑 = 显式拒绝不挂起）。 */
function readStdinText(): { readonly text: string } | { readonly error: CliError } {
  if (process.stdin.isTTY) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: "capture 无文本来源（--text 缺席且 stdin 是 TTY）",
        hint: "用 --text <text> 传入要记住的原文，或管道喂入：echo \"…\" | pomaster memory capture。",
      },
    };
  }
  try {
    return { text: readFileSync(0, "utf8") };
  } catch (err) {
    return {
      error: {
        code: "SCHEMA_INVALID",
        message: `stdin 读取失败：${err instanceof Error ? err.message : String(err)}`,
        hint: "stdin 形态要求管道传入原文文本（echo … | pomaster memory capture）。",
      },
    };
  }
}

export async function runMemoryCapture(
  rootDir: string,
  input: MemoryCaptureInput,
): Promise<CommandOutcome<MemoryCaptureResult | null>> {
  const command = "memory capture";
  const empty: MemoryCaptureResult | null = null;
  const scope = input.scope ?? "project";
  if (scope !== "project" && scope !== "user") {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: `--scope 词形非法：${scope}`,
      hint: "PRD §44.10 逐字两值：project | user（user 作用域晋升时落 user-scope 台账不入项目 Git）。",
    });
  }
  let text: string;
  if (input.text !== undefined) {
    text = input.text;
  } else {
    const stdin = readStdinText();
    if ("error" in stdin) return fail(empty, command, stdin.error);
    text = stdin.text;
  }
  // 同文重复前置检查（确定性：内容寻址 id 在册即重复——呈现词形归命令面）。
  const id = inboxEntryIdOf(text);
  try {
    readInboxEntry(rootDir, id);
    return fail(empty, command, {
      code: MEMORY_CAPTURE_DUPLICATE,
      message: `同文条目已在 inbox：${id}（内容寻址 id 撞册）`,
      hint: "同文重复捕获是调用缺陷或重复请求——review 既有条目而非重复入册；原文变更会产生新 id。",
    });
  } catch {
    // 不在册 = 正常前进（kernel captureMemory 内部再判一次，权威在 kernel）。
  }
  try {
    const entry = await captureMemory(rootDir, text, { scope: scope as InboxScopeValue });
    const result: MemoryCaptureResult = {
      action: "capture",
      id: entry.id,
      batch: entry.batch,
      scope: entry.scope,
      source: entry.source,
      review_state: entry.review_state,
      proposal_bucket: entry.proposal.bucket,
      confidence: entry.proposal.confidence,
      path: `${MEMORY_INBOX_RELATIVE}/${entry.batch}/${entry.id}.json`,
    };
    const human = [
      `memory capture → ${result.id}（review_state=PENDING 恒起步；scope=${result.scope}）`,
      `  落点: ${result.path}`,
      "  分类: 恒 UNCLASSIFIED_PENDING+LOW（机器不分类——Memory Curator 在 review 环节裁决，PRD §48.4）",
      "  下一步: pomaster memory review（batch review 是唯一人工闸）",
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(empty, command, toCliError(err, "§21"));
  }
}

// ============================================================
// memory inspect（§44.10 词形之二；inbox 总览纯读）
// ============================================================

export interface MemoryInspectResult {
  readonly action: "inspect";
  readonly root_dir: string;
  readonly totals: { readonly total: number; readonly pending: number; readonly promoted: number; readonly rejected: number };
  readonly identity_ok: boolean;
  readonly buckets: Readonly<Record<HarvestBucketValue, number>>;
  readonly pending_entries: readonly InboxEntryView[];
}

export function runMemoryInspect(rootDir: string): CommandOutcome<MemoryInspectResult> {
  const command = "memory inspect";
  try {
    const all = readInboxEntries(rootDir);
    const pending = all.filter((entry) => entry.review_state === "PENDING");
    const promoted = all.filter((entry) => entry.review_state === "PROMOTED");
    const rejected = all.filter((entry) => entry.review_state === "REJECTED");
    const totals = {
      total: all.length,
      pending: pending.length,
      promoted: promoted.length,
      rejected: rejected.length,
    };
    const identityOk = totals.total === totals.pending + totals.promoted + totals.rejected;
    const buckets = Object.fromEntries(
      HARVEST_BUCKET_VALUES.map((bucket) => [
        bucket,
        all.filter((entry) => entry.proposal.bucket === bucket).length,
      ]),
    ) as Record<HarvestBucketValue, number>;
    const result: MemoryInspectResult = {
      action: "inspect",
      root_dir: rootDir,
      totals,
      identity_ok: identityOk,
      buckets,
      pending_entries: pending.map(entryView),
    };
    const human = [
      `memory inspect → ${rootDir}（inbox 总览；分母封闭 total=${totals.total} = PENDING ${totals.pending} + PROMOTED ${totals.promoted} + REJECTED ${totals.rejected}）`,
      `  桶计数: ${HARVEST_BUCKET_VALUES.map((bucket) => `${bucket}=${buckets[bucket]}`).join(" ")}`,
      `  PENDING 清单: ${pending.length} 条`,
      ...pending.map(
        (entry) =>
          `    ${entry.id} [${entry.proposal.bucket}/${entry.proposal.confidence}]${entry.needs_conflict_check ? " needs_conflict_check" : ""} ${entry.proposal.title ?? `(${entry.batch})`}`,
      ),
      ...(pending.length === 0 ? ["    （无待评审条目——显式空）"] : []),
    ];
    if (!identityOk) {
      // 结构上不可达（装载面词形三态封闭）；护栏显式 fail-closed 禁静默。
      return failOutcome(command, result, [
        {
          code: "SCHEMA_INVALID",
          message: `分母封闭恒等式破坏：total=${totals.total} ≠ pending+promoted+rejected=${totals.pending + totals.promoted + totals.rejected}`,
          hint: "review 三态互斥且封闭——恒等式破坏是计数器缺陷，禁静默呈报。",
        },
      ], human);
    }
    return okOutcome(command, result, human);
  } catch (err) {
    const error = toCliError(err, "§21");
    return failOutcome<MemoryInspectResult>(
      command,
      { action: "inspect", root_dir: rootDir, totals: { total: 0, pending: 0, promoted: 0, rejected: 0 }, identity_ok: false, buckets: Object.fromEntries(HARVEST_BUCKET_VALUES.map((b) => [b, 0])) as Record<HarvestBucketValue, number>, pending_entries: [] },
      [error],
      [`memory inspect: FAILED — ${error.code}\n  hint: ${error.hint}`],
    );
  }
}

// ============================================================
// memory harvest（§44.10 词形之三；COMPATIBILITY 模式 §48.5）
// ============================================================

export interface MemoryHarvestInput {
  readonly harness: string;
  readonly harnessDir?: string;
}

export interface MemoryHarvestResult {
  readonly action: "harvest";
  readonly status: HarvestHarnessReport["status"];
  readonly not_run_reason: HarvestHarnessReport["notRunReason"];
  readonly harness: string;
  readonly harness_dir: string | null;
  readonly batch: string | null;
  readonly scanned: number;
  readonly harvested: readonly {
    readonly id: string;
    readonly bucket: string;
    readonly memory_class: string | null;
    readonly confidence: string;
    readonly title: string | null;
  }[];
  readonly skipped_existing: readonly string[];
  readonly unclassified: number;
}

export async function runMemoryHarvest(
  rootDir: string,
  input: MemoryHarvestInput,
): Promise<CommandOutcome<MemoryHarvestResult>> {
  const command = "memory harvest";
  const empty: MemoryHarvestResult = {
    action: "harvest",
    status: "NOT_RUN",
    not_run_reason: null,
    harness: input.harness,
    harness_dir: input.harnessDir ?? null,
    batch: null,
    scanned: 0,
    harvested: [],
    skipped_existing: [],
    unclassified: 0,
  };
  let harnessPath: string;
  if (input.harnessDir !== undefined) {
    harnessPath = input.harnessDir;
  } else {
    const resolved = defaultHarnessMemoryDir(input.harness, process.cwd());
    if ("error" in resolved) return fail(empty, command, resolved.error);
    harnessPath = resolved.dir;
  }
  let report: HarvestHarnessReport;
  try {
    report = await harvestHarness(rootDir, harnessPath, { harnessName: input.harness });
  } catch (err) {
    return fail(empty, command, toCliError(err, "§21"));
  }
  if (report.status === "NOT_RUN") {
    // 显式 not_run envelope 非 fake 绿：ok=false exit 1，kernel NOT_RUN 词形随
    // not_run_reason 逐字呈现（HARNESS_PATH_MISSING / HARNESS_MEMORY_EMPTY）。
    return failOutcome<MemoryHarvestResult>(
      command,
      { ...empty, status: "NOT_RUN", not_run_reason: report.notRunReason, harness_dir: harnessPath },
      [
        {
          code: MEMORY_HARVEST_NOT_RUN,
          message: `harness memory 目录缺席或零 md 文件：${harnessPath}（${report.notRunReason ?? "NOT_RUN"}）`,
          hint: "COMPATIBILITY 模式用 --harness-dir 显式指定目录；环境性缺席显式呈现（fail-closed 不伪造空跑成功）。",
        },
      ],
      [
        `memory harvest → NOT_RUN（${report.notRunReason ?? "NOT_RUN"}）：${harnessPath}`,
        "  未收割任何条目；inbox 零新增（禁静默绿）。",
      ],
    );
  }
  const result: MemoryHarvestResult = {
    action: "harvest",
    status: report.status,
    not_run_reason: null,
    harness: input.harness,
    harness_dir: harnessPath,
    batch: report.batch,
    scanned: report.scanned,
    harvested: report.harvested.map((entry) => ({
      id: entry.id,
      bucket: entry.proposal.bucket,
      memory_class: entry.proposal.memory_class,
      confidence: entry.proposal.confidence,
      title: entry.proposal.title,
    })),
    skipped_existing: [...report.skippedExisting],
    unclassified: report.unclassified,
  };
  const human = [
    `memory harvest → HARVESTED（harness=${input.harness} dir=${harnessPath}）`,
    `  batch: ${result.batch}（扫描 ${result.scanned} 份 .md → 入 inbox ${result.harvested.length} 条；既有同文去重 ${result.skipped_existing.length} 条；判不了 UNCLASSIFIED_PENDING ${result.unclassified} 条——禁模糊猜测）`,
    ...report.harvested.map(
      (entry) =>
        `    ${entry.id} [${entry.proposal.bucket}/${entry.proposal.confidence}]${entry.needs_conflict_check ? " needs_conflict_check" : ""} ${entry.proposal.title ?? `(${entry.batch})`}`,
    ),
    "  下一步: pomaster memory review（逐条提案是启发产物——batch review 裁决后才可 promote）",
  ];
  return okOutcome(command, result, human);
}

// ============================================================
// memory review（§44.10 词形之四；batch review 唯一人工闸）
// ============================================================

export interface MemoryReviewInput {
  readonly list?: boolean;
  readonly state?: string;
  readonly bucket?: string;
  readonly batch?: string;
  readonly decide?: string;
  readonly promote?: boolean;
  readonly reject?: boolean;
  readonly note?: string;
  readonly reclassifyBucket?: string;
  readonly reclassifyMemoryClass?: string;
  readonly actor?: string;
}

export type MemoryReviewResult =
  | {
      readonly action: "review";
      readonly mode: "list";
      readonly scope: "queue" | "all";
      readonly filters: { readonly state: string | null; readonly bucket: string | null; readonly batch: string | null };
      readonly counts: { readonly total: number; readonly pending: number; readonly promoted: number; readonly rejected: number };
      readonly entries: readonly InboxEntryView[];
    }
  | {
      readonly action: "review";
      readonly mode: "decide";
      readonly decided: {
        readonly id: string;
        readonly review_state: string;
        readonly bucket: string;
        readonly memory_class: string | null;
        readonly note: string;
        readonly reviewed_by: { readonly actor_type: string; readonly actor: string; readonly self_attested: boolean };
      };
    };

export async function runMemoryReview(
  rootDir: string,
  input: MemoryReviewInput,
): Promise<CommandOutcome<MemoryReviewResult>> {
  const command = "memory review";
  const emptyList: MemoryReviewResult = {
    action: "review",
    mode: "list",
    scope: input.list === true ? "all" : "queue",
    filters: { state: input.state ?? null, bucket: input.bucket ?? null, batch: input.batch ?? null },
    counts: { total: 0, pending: 0, promoted: 0, rejected: 0 },
    entries: [],
  };
  if (input.decide !== undefined) {
    return decideMode(rootDir, input);
  }
  // —— 列表模式（缺省 PENDING 队列；--list 全量/过滤） ——
  let stateFilter: ReviewStateValue | undefined;
  if (input.state !== undefined) {
    if (!(REVIEW_STATE_VALUES as readonly string[]).includes(input.state)) {
      return fail(emptyList, command, {
        code: "SCHEMA_INVALID",
        message: `--state 词形非法：${input.state}`,
        hint: `review 三态闭集：${REVIEW_STATE_VALUES.join(" | ")}。`,
      });
    }
    stateFilter = input.state as ReviewStateValue;
  } else if (input.list !== true) {
    stateFilter = "PENDING"; // 缺省=review 队列（batch review 等待面）
  }
  let bucketFilter: HarvestBucketValue | undefined;
  if (input.bucket !== undefined) {
    if (!(HARVEST_BUCKET_VALUES as readonly string[]).includes(input.bucket)) {
      return fail(emptyList, command, {
        code: "SCHEMA_INVALID",
        message: `--bucket 词形非法：${input.bucket}`,
        hint: `桶闭集（thread-B §4.1 四桶+两特殊出口+拒绝位）：${HARVEST_BUCKET_VALUES.join(" | ")}。`,
      });
    }
    bucketFilter = input.bucket as HarvestBucketValue;
  }
  try {
    const report = reviewInbox(rootDir, {
      state: stateFilter,
      bucket: bucketFilter,
      batch: input.batch,
    });
    const scope: "queue" | "all" = input.list === true ? "all" : "queue";
    const result: MemoryReviewResult = {
      action: "review",
      mode: "list",
      scope,
      filters: { state: stateFilter ?? null, bucket: bucketFilter ?? null, batch: input.batch ?? null },
      counts: report.counts,
      entries: report.entries.map(entryView),
    };
    const human = [
      `memory review → ${report.entries.length} 条（${scope === "queue" ? "PENDING 队列" : "全量列表"}；分母封闭 total=${report.counts.total} = PENDING ${report.counts.pending} + PROMOTED ${report.counts.promoted} + REJECTED ${report.counts.rejected}）`,
      ...report.entries.map(
        (entry) =>
          `    ${entry.id} [${entry.review_state}/${entry.proposal.bucket}/${entry.proposal.confidence}]${entry.needs_conflict_check ? " needs_conflict_check" : ""} ${entry.proposal.title ?? `(${entry.batch})`}`,
      ),
      ...(report.entries.length === 0 ? ["    （无匹配条目——显式空）"] : []),
      "  裁决: pomaster memory review --decide <id> --promote|--reject --note <text>（只改分类标签，不改写内容原文）",
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(emptyList, command, toCliError(err, "§21"));
  }
}

/** --decide 裁决模式（错误词形映射 = 确定性前置检查，禁模糊猜测）。 */
async function decideMode(
  rootDir: string,
  input: MemoryReviewInput,
): Promise<CommandOutcome<MemoryReviewResult>> {
  const command = "memory review";
  const id = input.decide ?? "";
  const empty: MemoryReviewResult = {
    action: "review",
    mode: "decide",
    decided: {
      id,
      review_state: "",
      bucket: "",
      memory_class: null,
      note: "",
      reviewed_by: { actor_type: "", actor: "", self_attested: true },
    },
  };
  const promote = input.promote === true;
  const reject = input.reject === true;
  if (promote === reject) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--decide 须显式二选一：--promote 或 --reject（互斥且必选其一）",
      hint: "review 三态矩阵唯一合法边是 PENDING→PROMOTED|REJECTED；一次裁决一个方向。",
    });
  }
  if (input.note === undefined || input.note.trim().length === 0) {
    return fail(empty, command, {
      code: "SCHEMA_INVALID",
      message: "--note 必填（已决条目 review_notes 非空是 schema 封条——无留痕写不出已决态）",
      hint: "给出裁决注记（batch review 批次/依据；已决留痕可审计）。",
    });
  }
  let actor: { readonly actor: Actor } | { readonly error: CliError } = {
    actor: { actorType: "human", actor: "owner", selfAttested: true },
  };
  if (input.actor !== undefined) {
    actor = parseActorArgv(input.actor);
    if ("error" in actor) return fail(empty, command, actor.error);
  }
  // 确定性前置检查（呈现词形映射；kernel 权威再判）。
  let current: InboxEntry;
  try {
    current = readInboxEntry(rootDir, id);
  } catch {
    return fail(empty, command, inboxEntryNotFound(id));
  }
  if (current.review_state !== "PENDING") {
    return fail(empty, command, {
      code: MEMORY_ALREADY_REVIEWED,
      message: `${id}: 已决条目（review_state=${current.review_state}）不可再决`,
      hint: "review 三态封闭无回退边；翻案 = 新证据新条目（原文变更产生新内容寻址 id）。",
    });
  }
  let reclassify: { bucket?: HarvestBucketValue; memoryClass?: MemoryClassValue | null } | undefined;
  if (input.reclassifyBucket !== undefined || input.reclassifyMemoryClass !== undefined) {
    if (
      input.reclassifyBucket !== undefined &&
      !(HARVEST_BUCKET_VALUES as readonly string[]).includes(input.reclassifyBucket)
    ) {
      return fail(empty, command, {
        code: "SCHEMA_INVALID",
        message: `--reclassify-bucket 词形非法：${input.reclassifyBucket}`,
        hint: `桶闭集：${HARVEST_BUCKET_VALUES.join(" | ")}。`,
      });
    }
    if (
      input.reclassifyMemoryClass !== undefined &&
      input.reclassifyMemoryClass !== "null" &&
      !(MEMORY_CLASS_VALUES as readonly string[]).includes(input.reclassifyMemoryClass)
    ) {
      return fail(empty, command, {
        code: "SCHEMA_INVALID",
        message: `--reclassify-class 词形非法：${input.reclassifyMemoryClass}`,
        hint: `PRD §48.2 七类闭集：${MEMORY_CLASS_VALUES.join(" | ")}（null = 显式无分类）。`,
      });
    }
    reclassify = {
      ...(input.reclassifyBucket !== undefined ? { bucket: input.reclassifyBucket as HarvestBucketValue } : {}),
      ...(input.reclassifyMemoryClass !== undefined
        ? { memoryClass: input.reclassifyMemoryClass === "null" ? null : (input.reclassifyMemoryClass as MemoryClassValue) }
        : {}),
    };
  }
  try {
    const decided = await decideInboxEntry(rootDir, {
      id,
      outcome: promote ? "PROMOTED" : "REJECTED",
      reviewedBy: actor.actor,
      note: input.note,
      ...(reclassify !== undefined ? { reclassify } : {}),
    });
    const result: MemoryReviewResult = {
      action: "review",
      mode: "decide",
      decided: {
        id: decided.id,
        review_state: decided.review_state,
        bucket: decided.proposal.bucket,
        memory_class: decided.proposal.memory_class,
        note: input.note,
        reviewed_by: {
          actor_type: actor.actor.actorType,
          actor: actor.actor.actor,
          self_attested: actor.actor.selfAttested,
        },
      },
    };
    const human = [
      `memory review --decide → ${decided.id}（PENDING→${decided.review_state}；bucket=${decided.proposal.bucket} memory_class=${decided.proposal.memory_class ?? "null"}）`,
      `  注记: ${input.note}`,
      "  原文零改写（review 只改分类标签——decideInboxEntry 签名无 text 键位）",
      ...(promote
        ? ["  下一步: pomaster memory promote <memory-id>（分桶路由晋升——评审通过后的路由执行）"]
        : ["  REJECTED 是终态（留痕淘汰；翻案 = 新证据新条目）"]),
    ];
    return okOutcome(command, result, human);
  } catch (err) {
    return fail(empty, command, toCliError(err, "§21"));
  }
}

// ============================================================
// memory promote（§44.10 词形之五；分桶路由——呈报位显式）
// ============================================================

export interface MemoryPromoteCliInput {
  readonly id: string;
  readonly actor: string;
  readonly knowledgeId?: string;
  readonly knowledgeKind?: string;
  readonly knowledgeTitle?: string;
  readonly knowledgeTrigger?: readonly string[];
  readonly authorityUpgrade?: boolean;
  readonly userMemoryRoot?: string;
}

export interface MemoryPromoteCliResult {
  readonly action: "promote";
  readonly id: string;
  readonly route: "knowledge_library" | "user_ledger" | "escalate_owner";
  readonly knowledge_id: string | null;
  readonly knowledge_status: string | null;
  readonly knowledge_authority: string | null;
  readonly ledger_path: string | null;
  /** TRUTH/DECISION/EVIDENCE（及 AUTHORITY_POLICY 升格申报）呈报位——非空即须 Owner 裁决。 */
  readonly owner_escalation: readonly {
    readonly id: string;
    readonly bucket: string;
    readonly memory_class: string | null;
    readonly reason: string;
    readonly upgraded: boolean;
  }[];
}

export async function runMemoryPromote(
  rootDir: string,
  input: MemoryPromoteCliInput,
): Promise<CommandOutcome<MemoryPromoteCliResult>> {
  const command = "memory promote";
  const empty: MemoryPromoteCliResult = {
    action: "promote",
    id: input.id,
    route: "escalate_owner",
    knowledge_id: null,
    knowledge_status: null,
    knowledge_authority: null,
    ledger_path: null,
    owner_escalation: [],
  };
  const initialized = await requireInitialized(rootDir);
  if ("error" in initialized) return fail(empty, command, initialized.error);
  const actor = parseActorArgv(input.actor);
  if ("error" in actor) return fail(empty, command, actor.error);
  // 确定性前置检查（错误词形映射；kernel promoteMemory 权威再判）。
  let current: InboxEntry;
  try {
    current = readInboxEntry(rootDir, input.id);
  } catch {
    return fail(empty, command, inboxEntryNotFound(input.id));
  }
  if (current.review_state === "PENDING") {
    return fail(empty, command, {
      code: MEMORY_REVIEW_REQUIRED,
      message: `${input.id}: PENDING 条目不可晋升（batch review 是唯一人工闸）`,
      hint: "先 pomaster memory review --decide <id> --promote --note <text>；跳过评审晋升 = Case N「不得自动成为 Truth」违例形态。",
    });
  }
  if (current.review_state === "REJECTED") {
    return fail(empty, command, {
      code: MEMORY_ALREADY_REVIEWED,
      message: `${input.id}: REJECTED 是终态（被拒条目无晋升通路）`,
      hint: "评审否决后翻案 = 新证据新条目（原文变更产生新内容寻址 id）。",
    });
  }
  if (current.promoted_route !== null) {
    return fail(empty, command, {
      code: MEMORY_ALREADY_PROMOTED,
      message: `${input.id}: 已晋升（route=${current.promoted_route.kind}）——晋升动作一次性`,
      hint: "路由产物已登记于条目；呈现走 pomaster memory review --list / memory audit。",
    });
  }
  if (current.proposal.bucket === "AUTHORITY_POLICY" && input.authorityUpgrade !== true) {
    return fail(empty, command, {
      code: MEMORY_PROMOTE_OWNER_REQUIRED,
      message: `${input.id}: AUTHORITY_POLICY 升格未申报（用户明令升格不可由机器默认代行）`,
      hint: "显式 --authority-upgrade 申报升格（呈报 Owner 裁决对象面）；默认拒绝。",
    });
  }
  let knowledge:
    | {
        readonly id: string;
        readonly kind: string;
        readonly title?: string;
        readonly triggers?: readonly string[];
      }
    | undefined;
  if (current.proposal.memory_class === "KNOWLEDGE") {
    if (input.knowledgeId === undefined || input.knowledgeId.trim().length === 0) {
      return fail(empty, command, {
        code: "SCHEMA_INVALID",
        message: `${input.id}: KNOWLEDGE 桶晋升缺 --knowledge-id（P28 record 通路 id 必填——不旁路生命周期）`,
        hint: "给出 KNOWLEDGE.* governed id（词形闸 KNOWLEDGE 前缀）；无显式申报不机械造册。",
      });
    }
    if (input.knowledgeKind === undefined || input.knowledgeKind.trim().length === 0) {
      return fail(empty, command, {
        code: "SCHEMA_INVALID",
        message: `${input.id}: KNOWLEDGE 桶晋升缺 --knowledge-kind（§83.3 四类型必填）`,
        hint: "ENGINEERING_PATTERN | FAILURE_PATTERN | DIAGNOSTIC_PLAYBOOK | DECISION_HEURISTIC。",
      });
    }
    knowledge = {
      id: input.knowledgeId,
      kind: input.knowledgeKind,
      ...(input.knowledgeTitle !== undefined ? { title: input.knowledgeTitle } : {}),
      ...(input.knowledgeTrigger !== undefined ? { triggers: input.knowledgeTrigger } : {}),
    };
  }
  try {
    const outcome = await promoteMemory(rootDir, input.id, {
      actor: actor.actor,
      ...(knowledge !== undefined ? { knowledge } : {}),
      ...(input.authorityUpgrade === true ? { authorityUpgrade: true } : {}),
      ...(input.userMemoryRoot !== undefined ? { userMemoryRoot: input.userMemoryRoot } : {}),
    });
    if (outcome.outcome.route === "knowledge_library") {
      const result: MemoryPromoteCliResult = {
        action: "promote",
        id: input.id,
        route: "knowledge_library",
        knowledge_id: outcome.outcome.knowledgeId,
        knowledge_status: outcome.outcome.knowledgeStatus,
        knowledge_authority: outcome.outcome.knowledgeAuthority,
        ledger_path: null,
        owner_escalation: [],
      };
      const human = [
        `memory promote → ${input.id}（route=knowledge_library）`,
        `  knowledge 台账落盘确认: ${outcome.outcome.knowledgeId}（status=${outcome.outcome.knowledgeStatus} 恒 CANDIDATE 起步；authority=${outcome.outcome.knowledgeAuthority} 恒 ADVISORY——P28 生命周期不旁路）`,
        "  下一步: pomaster knowledge review-candidates（§83.10 链：Validation → 权威位 promote）",
      ];
      return okOutcome(command, result, human);
    }
    if (outcome.outcome.route === "user_ledger") {
      const result: MemoryPromoteCliResult = {
        action: "promote",
        id: input.id,
        route: "user_ledger",
        knowledge_id: null,
        knowledge_status: null,
        knowledge_authority: null,
        ledger_path: outcome.outcome.ledgerPath,
        owner_escalation: [],
      };
      const human = [
        `memory promote → ${input.id}（route=user_ledger）`,
        `  user-scope 台账: ${outcome.outcome.ledgerPath}（§48.6 不随 repo 提交）`,
      ];
      return okOutcome(command, result, human);
    }
    // escalate_owner：OWNER_ESCALATION_REQUIRED 词形 + exit 0 + owner_escalation
    // 非空（不冒充成功也不 fail 误报——呈报语义显式；TRUTH/DECISION/EVIDENCE 不写
    // Canonical State，落点裁决归 Owner/P11 maintain 面）。
    const result: MemoryPromoteCliResult = {
      action: "promote",
      id: input.id,
      route: "escalate_owner",
      knowledge_id: null,
      knowledge_status: null,
      knowledge_authority: null,
      ledger_path: null,
      owner_escalation: [
        {
          id: input.id,
          bucket: current.proposal.bucket,
          memory_class: current.proposal.memory_class,
          reason: outcome.outcome.reasonShort,
          upgraded: outcome.outcome.upgraded,
        },
      ],
    };
    const warnings: CliWarning[] = [
      {
        code: OWNER_ESCALATION_REQUIRED,
        message: `${input.id}: ${outcome.outcome.reasonShort}`,
        hint: "呈报 Owner 经 P11 maintain 面裁决落点（TRUTH/DECISION/EVIDENCE 记忆禁自动写入 Canonical State——Case N/§84.6）；inbox 条目已登记呈报事实。",
      },
    ];
    const human = [
      `memory promote → ${input.id}（route=escalate_owner；${OWNER_ESCALATION_REQUIRED}）`,
      `  ${outcome.outcome.reasonShort}`,
      "  呈报位：记忆条目已留痕（promoted_route=escalate_owner），Canonical State 零写入；落点归 Owner 裁决。",
    ];
    return okOutcome(command, result, human, warnings);
  } catch (err) {
    return fail(empty, command, toCliError(err, "§21"));
  }
}

// ============================================================
// memory audit（§44.10 词形之六；auditMemory 全量 + Case N fail-closed）
// ============================================================

export interface MemoryAuditCliInput {
  /** harness 记忆探测位注入（可重复；缺省 = kernel 缺省 ~/.claude ~/.codex 存在性探测）。 */
  readonly harnessMemoryRoot?: readonly string[];
}

/** audit 结果命令面形态（snake_case 文件世界；kernel MemoryAuditReport 的呈现映射）。 */
export interface MemoryAuditCliResult {
  readonly action: "audit";
  readonly root_dir: string;
  readonly totals: MemoryAuditReport["totals"];
  readonly identity_ok: boolean;
  /** 显式空态（total===0——零条目不是静默健康）。 */
  readonly empty: boolean;
  readonly buckets: MemoryAuditReport["buckets"];
  readonly batches: readonly string[];
  readonly drift: {
    /** P32 探测行三态透传：FAIL/PASS/NOT_RUN（未知≠绿）。 */
    readonly probe_status: "FAIL" | "PASS" | "NOT_RUN";
    readonly probe_status_detail: string | null;
    readonly detected: boolean;
    readonly finding: string | null;
    readonly inbox_entry_id: string | null;
    readonly entered_inbox: boolean;
  };
}

function toAuditCliResult(rootDir: string, report: MemoryAuditReport): MemoryAuditCliResult {
  return {
    action: "audit",
    root_dir: rootDir,
    totals: report.totals,
    identity_ok: report.identityOk,
    empty: report.empty,
    buckets: report.buckets,
    batches: report.batches,
    drift: {
      probe_status: report.drift.probeStatus,
      probe_status_detail: report.drift.probeStatusDetail,
      detected: report.drift.detected,
      finding: report.drift.finding,
      inbox_entry_id: report.drift.inboxEntryId,
      entered_inbox: report.drift.enteredInbox,
    },
  };
}

const emptyAuditResult = (rootDir: string): MemoryAuditCliResult => ({
  action: "audit",
  root_dir: rootDir,
  totals: { total: 0, pending: 0, promoted: 0, rejected: 0 },
  identity_ok: false,
  empty: true,
  buckets: Object.fromEntries(HARVEST_BUCKET_VALUES.map((b) => [b, 0])) as MemoryAuditReport["buckets"],
  batches: [],
  drift: { probe_status: "NOT_RUN", probe_status_detail: null, detected: false, finding: null, inbox_entry_id: null, entered_inbox: false },
});

export async function runMemoryAudit(
  rootDir: string,
  input?: MemoryAuditCliInput,
): Promise<CommandOutcome<MemoryAuditCliResult>> {
  const command = "memory audit";
  let report: MemoryAuditReport;
  try {
    report = await auditMemory(rootDir, {
      ...(input?.harnessMemoryRoot !== undefined ? { harnessMemoryRoots: input.harnessMemoryRoot } : {}),
    });
  } catch (err) {
    return fail(emptyAuditResult(rootDir), command, toCliError(err, "§21"));
  }
  const result = toAuditCliResult(rootDir, report);
  const driftLine =
    report.drift.probeStatus === "FAIL"
      ? `MEMORY_DRIFT: detected（${report.drift.finding ?? ""}）`
      : report.drift.probeStatus === "NOT_RUN"
        ? `MEMORY_DRIFT: probe not run（${report.drift.probeStatusDetail ?? "探测未执行"}）——drift 状态未知，未知≠绿`
        : "MEMORY_DRIFT: not detected";
  const human = [
    `memory audit → ${rootDir}（分母封闭 identityOk=${report.identityOk}；total=${report.totals.total} = PENDING ${report.totals.pending} + PROMOTED ${report.totals.promoted} + REJECTED ${report.totals.rejected}${report.empty ? "；inbox 显式空态" : ""}）`,
    `  桶计数: ${HARVEST_BUCKET_VALUES.map((bucket) => `${bucket}=${report.buckets[bucket]}`).join(" ")}`,
    `  batches: ${report.batches.length > 0 ? report.batches.join(", ") : "（无）"}`,
    `  ${driftLine}`,
    ...(report.drift.detected
      ? [
          `    drift 条目: ${report.drift.inboxEntryId ?? "null"}（batch=audit-drift${report.drift.enteredInbox ? "，本次新入 inbox" : "，已在册（幂等去重）"}）`,
          "    §84.6：drift 项不得自动成为 Truth——review→promote/reject 人工裁决；Canonical State 零写入。",
        ]
      : []),
  ];
  if (report.drift.detected) {
    // Case N fail-closed：drift 段非空 → exit 1（drift 词形复用 P32 MEMORY_DRIFT）。
    return failOutcome<MemoryAuditCliResult>(
      command,
      result,
      [
        {
          code: MEMORY_DRIFT,
          message: `MEMORY_DRIFT（${report.drift.finding ?? "hidden_memory_dependency=FAIL"}）；drift 项已入 inbox（${report.drift.inboxEntryId ?? "null"}）`,
          hint: "drift 项已入 inbox（review_state=PENDING，source=memory_drift_audit）——pomaster memory review 人工裁决；禁自动写入 Canonical State（§84.6 铁律）。",
        },
      ],
      human,
    );
  }
  if (report.drift.probeStatus === "NOT_RUN") {
    // fail-closed（红队攻击面 4b 封条）：探测未执行 = drift 状态未知——显式 not_run
    // 词形 + exit 1，绝不折叠为 not detected 纯绿。
    return failOutcome<MemoryAuditCliResult>(
      command,
      result,
      [
        {
          code: MEMORY_HARVEST_NOT_RUN,
          message: `MEMORY_DRIFT 探测未执行（${report.drift.probeStatusDetail ?? "hidden_memory_dependency 行缺席"}）——drift 状态未知`,
          hint: "探测未执行不等于无 drift；检查 portability 探测前置（store/truth-index 在场）后重跑 memory audit。",
        },
      ],
      human,
    );
  }
  return okOutcome(command, result, human);
}
